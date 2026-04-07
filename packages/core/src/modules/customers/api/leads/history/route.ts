import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import {
  CustomerDeal,
  CustomerEntity,
  CustomerLead,
  CustomerLeadHistory,
  CustomerLeadLostReason,
  CustomerLeadPipelineStage,
} from '../../../data/entities'
import { buildLeadWorkflowContext } from '../_workflow'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['customers.leads.view'] },
}

const querySchema = z.object({
  leadId: z.string().uuid(),
  pageSize: z.coerce.number().min(1).max(100).default(50),
})

const uuidSchema = z.string().uuid()

function collectHistoryMetadataIds(items: CustomerLeadHistory[]) {
  const personIds = new Set<string>()
  const companyIds = new Set<string>()
  const dealIds = new Set<string>()
  const stageIds = new Set<string>()
  const lostReasonIds = new Set<string>()

  for (const item of items) {
    const metadata = item.metadata ?? {}
    for (const [rawKey, rawValue] of Object.entries(metadata)) {
      if (typeof rawValue !== 'string' || !uuidSchema.safeParse(rawValue).success) continue
      const key = rawKey.toLowerCase()
      if (key.includes('personid')) personIds.add(rawValue)
      else if (key.includes('companyid')) companyIds.add(rawValue)
      else if (key.includes('dealid')) dealIds.add(rawValue)
      else if (key.includes('stageid')) stageIds.add(rawValue)
      else if (key.includes('lostreasonid')) lostReasonIds.add(rawValue)
    }
  }

  return { personIds, companyIds, dealIds, stageIds, lostReasonIds }
}

async function buildHistoryMetadataLabels(
  em: EntityManager,
  items: CustomerLeadHistory[],
  scope: { tenantId: string; organizationId: string },
): Promise<Record<string, Record<string, string>>> {
  const { personIds, companyIds, dealIds, stageIds, lostReasonIds } = collectHistoryMetadataIds(items)
  const [people, companies, deals, stages, lostReasons] = await Promise.all([
    personIds.size
      ? em.find(CustomerEntity, { id: { $in: Array.from(personIds) }, kind: 'person', ...scope, deletedAt: null })
      : Promise.resolve([]),
    companyIds.size
      ? em.find(CustomerEntity, { id: { $in: Array.from(companyIds) }, kind: 'company', ...scope, deletedAt: null })
      : Promise.resolve([]),
    dealIds.size
      ? em.find(CustomerDeal, { id: { $in: Array.from(dealIds) }, ...scope, deletedAt: null })
      : Promise.resolve([]),
    stageIds.size
      ? em.find(CustomerLeadPipelineStage, { id: { $in: Array.from(stageIds) }, ...scope })
      : Promise.resolve([]),
    lostReasonIds.size
      ? em.find(CustomerLeadLostReason, { id: { $in: Array.from(lostReasonIds) }, ...scope })
      : Promise.resolve([]),
  ])

  const peopleById = new Map(people.map((item) => [item.id, item.displayName]))
  const companiesById = new Map(companies.map((item) => [item.id, item.displayName]))
  const dealsById = new Map(deals.map((item) => [item.id, item.title]))
  const stagesById = new Map(stages.map((item) => [item.id, item.name]))
  const lostReasonsById = new Map(lostReasons.map((item) => [item.id, item.name]))
  const labelsByHistoryId: Record<string, Record<string, string>> = {}

  for (const item of items) {
    const labels: Record<string, string> = {}
    const metadata = item.metadata ?? {}
    for (const [rawKey, rawValue] of Object.entries(metadata)) {
      if (typeof rawValue !== 'string') continue
      const key = rawKey.toLowerCase()
      const label =
        key.includes('personid') ? peopleById.get(rawValue) :
        key.includes('companyid') ? companiesById.get(rawValue) :
        key.includes('dealid') ? dealsById.get(rawValue) :
        key.includes('stageid') ? stagesById.get(rawValue) :
        key.includes('lostreasonid') ? lostReasonsById.get(rawValue) :
        null
      if (label) labels[rawKey] = label
    }
    labelsByHistoryId[item.id] = labels
  }

  return labelsByHistoryId
}

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
    const metadataLabels = await buildHistoryMetadataLabels(em, items, {
      tenantId: lead.tenantId,
      organizationId: lead.organizationId,
    })
    return NextResponse.json({
      items: items.map((item) => ({
        id: item.id,
        leadId: item.leadId,
        eventType: item.eventType,
        actorUserId: item.actorUserId ?? null,
        note: item.note ?? null,
        metadata: item.metadata ?? null,
        metadataLabels: metadataLabels[item.id] ?? {},
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
            metadataLabels: z.record(z.string(), z.string()),
            createdAt: z.date(),
          })),
          total: z.number(),
        }),
      }],
    },
  },
}
