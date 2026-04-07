import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { CustomerLead, CustomerLeadHistory } from '../../../data/entities'
import { buildLeadWorkflowContext } from '../_workflow'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['customers.leads.view'] },
}

const querySchema = z.object({
  leadId: z.string().uuid(),
  pageSize: z.coerce.number().min(1).max(100).default(50),
})

export async function GET(req: Request) {
  try {
    const ctx = await buildLeadWorkflowContext(req)
    const url = new URL(req.url)
    const query = querySchema.parse(Object.fromEntries(url.searchParams.entries()))
    if (!ctx.auth?.tenantId || !ctx.selectedOrganizationId) {
      throw new CrudHttpError(400, { error: 'Organization and tenant context required' })
    }
    const em = ctx.container.resolve('em') as EntityManager
    const lead = await em.findOne(CustomerLead, {
      id: query.leadId,
      tenantId: ctx.auth.tenantId,
      organizationId: ctx.selectedOrganizationId,
      deletedAt: null,
    })
    if (!lead) throw new CrudHttpError(404, { error: 'Lead not found' })
    const items = await em.find(CustomerLeadHistory, {
      leadId: lead.id,
      tenantId: lead.tenantId,
      organizationId: lead.organizationId,
    }, {
      orderBy: { createdAt: 'desc' },
      limit: query.pageSize,
    })
    return NextResponse.json({
      items: items.map((item) => ({
        id: item.id,
        leadId: item.leadId,
        eventType: item.eventType,
        actorUserId: item.actorUserId ?? null,
        note: item.note ?? null,
        metadata: item.metadata ?? null,
        createdAt: item.createdAt,
      })),
      total: items.length,
    })
  } catch (err) {
    if (err instanceof CrudHttpError) {
      return NextResponse.json(err.body, { status: err.status })
    }
    console.error('customers.leads history failed', err)
    return NextResponse.json({ error: 'Failed to load lead history' }, { status: 500 })
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Customers',
  summary: 'Lead history',
  methods: {
    GET: {
      summary: 'List lead history entries',
      query: querySchema,
      responses: [{
        status: 200,
        description: 'Lead history entries',
        schema: z.object({
          items: z.array(z.object({
            id: z.string().uuid(),
            leadId: z.string().uuid(),
            eventType: z.string(),
            actorUserId: z.string().uuid().nullable(),
            note: z.string().nullable(),
            metadata: z.record(z.string(), z.unknown()).nullable(),
            createdAt: z.date(),
          })),
          total: z.number(),
        }),
      }],
    },
  },
}
