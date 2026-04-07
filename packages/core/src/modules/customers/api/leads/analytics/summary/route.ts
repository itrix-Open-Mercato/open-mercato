import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { CustomerLead } from '../../../../data/entities'
import { buildLeadWorkflowContext } from '../../_workflow'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['customers.leads.view'] },
}

const querySchema = z.object({
  pipelineId: z.string().uuid().optional(),
})

async function countBy(em: EntityManager, where: Record<string, unknown>, field: keyof CustomerLead): Promise<Array<{ key: string; count: number }>> {
  const rows = await em.find(CustomerLead, where, { fields: [field] as never[] })
  const counts = new Map<string, number>()
  for (const row of rows) {
    const value = row[field]
    const key = typeof value === 'string' && value.trim() ? value : 'none'
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return Array.from(counts.entries()).map(([key, count]) => ({ key, count }))
}

export async function GET(req: Request) {
  try {
    const ctx = await buildLeadWorkflowContext(req)
    const query = querySchema.parse(Object.fromEntries(new URL(req.url).searchParams.entries()))
    if (!ctx.auth?.tenantId || !ctx.selectedOrganizationId) {
      throw new CrudHttpError(400, { error: 'Organization and tenant context required' })
    }
    const em = ctx.container.resolve('em') as EntityManager
    const where: Record<string, unknown> = {
      tenantId: ctx.auth.tenantId,
      organizationId: ctx.selectedOrganizationId,
      deletedAt: null,
    }
    if (query.pipelineId) where.pipelineId = query.pipelineId
    const [total, open, won, lost, byStage, bySource, byLostReason] = await Promise.all([
      em.count(CustomerLead, where),
      em.count(CustomerLead, { ...where, outcome: 'open' }),
      em.count(CustomerLead, { ...where, outcome: 'won' }),
      em.count(CustomerLead, { ...where, outcome: 'lost' }),
      countBy(em, where, 'stageId'),
      countBy(em, where, 'source'),
      countBy(em, where, 'lostReasonId'),
    ])
    return NextResponse.json({ total, open, won, lost, byStage, bySource, byLostReason })
  } catch (err) {
    if (err instanceof CrudHttpError) return NextResponse.json(err.body, { status: err.status })
    console.error('customers.leads analytics summary failed', err)
    return NextResponse.json({ error: 'Failed to load lead analytics summary' }, { status: 500 })
  }
}

const bucketSchema = z.object({ key: z.string(), count: z.number() })

export const openApi: OpenApiRouteDoc = {
  tag: 'Customers',
  summary: 'Lead analytics summary',
  methods: {
    GET: {
      summary: 'Fetch lead funnel analytics summary',
      query: querySchema,
      responses: [{
        status: 200,
        description: 'Lead analytics summary',
        schema: z.object({
          total: z.number(),
          open: z.number(),
          won: z.number(),
          lost: z.number(),
          byStage: z.array(bucketSchema),
          bySource: z.array(bucketSchema),
          byLostReason: z.array(bucketSchema),
        }),
      }],
    },
  },
}
