/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod'
import { makeCrudRoute } from '@open-mercato/shared/lib/crud/factory'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { escapeLikePattern } from '@open-mercato/shared/lib/db/escapeLikePattern'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { CustomerLead } from '../../data/entities'
import {
  customerLeadCreateSchema,
  customerLeadUpdateSchema,
  customerLeadDeleteSchema,
} from '../../data/validators'
import { withScopedPayload } from '../utils'
import {
  createCustomersCrudOpenApi,
  createPagedListResponseSchema,
  defaultOkResponseSchema,
} from '../openapi'

const rawBodySchema = z.object({}).passthrough()

const listSchema = z
  .object({
    page: z.coerce.number().min(1).default(1),
    pageSize: z.coerce.number().min(1).max(100).default(50),
    search: z.string().optional(),
    id: z.string().uuid().optional(),
    ids: z.string().optional(),
    pipelineId: z.string().uuid().optional(),
    stageId: z.string().uuid().optional(),
    outcome: z.enum(['open', 'won', 'lost']).optional(),
    ownerUserId: z.string().uuid().optional(),
    source: z.string().optional(),
    sourceChannel: z.string().optional(),
    primaryEmail: z.string().optional(),
    primaryPhone: z.string().optional(),
    vatId: z.string().optional(),
    createdFrom: z.string().optional(),
    createdTo: z.string().optional(),
    sortField: z.string().optional(),
    sortDir: z.enum(['asc', 'desc']).optional(),
  })
  .passthrough()

const routeMetadata = {
  GET: { requireAuth: true, requireFeatures: ['customers.leads.view'] },
  POST: { requireAuth: true, requireFeatures: ['customers.leads.manage'] },
  PUT: { requireAuth: true, requireFeatures: ['customers.leads.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['customers.leads.manage'] },
}

export const metadata = routeMetadata

const crud = makeCrudRoute({
  metadata: routeMetadata,
  orm: {
    entity: CustomerLead,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: 'deletedAt',
  },
  enrichers: { entityId: 'customers.lead' },
  list: {
    schema: listSchema,
    entityId: 'customers:customer_lead',
    fields: [
      'id',
      'display_name',
      'pipeline_id',
      'stage_id',
      'outcome',
      'lost_reason_id',
      'owner_user_id',
      'source',
      'source_channel',
      'source_external_id',
      'source_received_at',
      'primary_email',
      'primary_phone',
      'vat_id',
      'spam_score',
      'qualification_notes',
      'linked_person_id',
      'linked_company_id',
      'linked_deal_id',
      'converted_at',
      'converted_by_user_id',
      'organization_id',
      'tenant_id',
      'created_at',
      'updated_at',
    ],
    sortFieldMap: {
      name: 'display_name',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      outcome: 'outcome',
      source: 'source',
    },
    buildFilters: async (query: any) => {
      const filters: Record<string, any> = {}
      if (query.id) filters.id = { $eq: query.id }
      if (typeof query.ids === 'string' && query.ids.trim()) {
        const ids = query.ids
          .split(',')
          .map((id: string) => id.trim())
          .filter(Boolean)
        if (ids.length) filters.id = { $in: ids }
      }
      if (query.search) {
        filters.display_name = { $ilike: `%${escapeLikePattern(query.search)}%` }
      }
      if (query.pipelineId) filters.pipeline_id = { $eq: query.pipelineId }
      if (query.stageId) filters.stage_id = { $eq: query.stageId }
      if (query.outcome) filters.outcome = { $eq: query.outcome }
      if (query.ownerUserId) filters.owner_user_id = { $eq: query.ownerUserId }
      if (query.source) filters.source = { $eq: query.source }
      if (query.sourceChannel) filters.source_channel = { $eq: query.sourceChannel }
      if (query.primaryEmail) filters.primary_email = { $eq: query.primaryEmail.trim().toLowerCase() }
      if (query.primaryPhone) filters.primary_phone = { $eq: query.primaryPhone.trim() }
      if (query.vatId) filters.vat_id = { $eq: query.vatId.trim() }
      const createdRange: Record<string, Date> = {}
      if (query.createdFrom) {
        const from = new Date(query.createdFrom)
        if (!Number.isNaN(from.getTime())) createdRange.$gte = from
      }
      if (query.createdTo) {
        const to = new Date(query.createdTo)
        if (!Number.isNaN(to.getTime())) createdRange.$lte = to
      }
      if (Object.keys(createdRange).length) filters.created_at = createdRange
      return filters
    },
  },
  actions: {
    create: {
      commandId: 'customers.leads.create',
      schema: rawBodySchema,
      mapInput: async ({ raw, ctx }) => {
        const { translate } = await resolveTranslations()
        return customerLeadCreateSchema.parse(withScopedPayload(raw ?? {}, ctx, translate))
      },
      response: ({ result }) => ({ id: result?.leadId ?? null }),
      status: 201,
    },
    update: {
      commandId: 'customers.leads.update',
      schema: rawBodySchema,
      mapInput: async ({ raw, ctx }) => {
        const { translate } = await resolveTranslations()
        return customerLeadUpdateSchema.parse(withScopedPayload(raw ?? {}, ctx, translate))
      },
      response: () => ({ ok: true }),
    },
    delete: {
      commandId: 'customers.leads.delete',
      schema: rawBodySchema,
      mapInput: async ({ parsed, ctx }) => {
        const { translate } = await resolveTranslations()
        const id =
          parsed?.body?.id ??
          parsed?.id ??
          parsed?.query?.id ??
          (ctx.request ? new URL(ctx.request.url).searchParams.get('id') : null)
        if (!id) throw new CrudHttpError(400, { error: translate('customers.errors.lead_required', 'Lead id is required') })
        return customerLeadDeleteSchema.parse(withScopedPayload({ id }, ctx, translate))
      },
      response: () => ({ ok: true }),
    },
  },
})

const { POST, PUT, DELETE } = crud

export { POST, PUT, DELETE }
export const GET = crud.GET

const leadListItemSchema = z.object({
  id: z.string().uuid(),
  display_name: z.string().optional(),
  pipeline_id: z.string().uuid().optional(),
  stage_id: z.string().uuid().optional(),
  outcome: z.enum(['open', 'won', 'lost']).optional(),
  lost_reason_id: z.string().uuid().nullable().optional(),
  owner_user_id: z.string().uuid().nullable().optional(),
  source: z.string().nullable().optional(),
  source_channel: z.string().nullable().optional(),
  source_external_id: z.string().nullable().optional(),
  source_received_at: z.string().nullable().optional(),
  primary_email: z.string().nullable().optional(),
  primary_phone: z.string().nullable().optional(),
  vat_id: z.string().nullable().optional(),
  spam_score: z.union([z.string(), z.number()]).nullable().optional(),
  qualification_notes: z.string().nullable().optional(),
  linked_person_id: z.string().uuid().nullable().optional(),
  linked_company_id: z.string().uuid().nullable().optional(),
  linked_deal_id: z.string().uuid().nullable().optional(),
  converted_at: z.string().nullable().optional(),
  converted_by_user_id: z.string().uuid().nullable().optional(),
  organization_id: z.string().uuid().nullable().optional(),
  tenant_id: z.string().uuid().nullable().optional(),
  created_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
})

const leadCreateResponseSchema = z.object({
  id: z.string().uuid().nullable(),
})

export const openApi = createCustomersCrudOpenApi({
  resourceName: 'Lead',
  pluralName: 'Leads',
  querySchema: listSchema,
  listResponseSchema: createPagedListResponseSchema(leadListItemSchema),
  create: {
    schema: customerLeadCreateSchema,
    responseSchema: leadCreateResponseSchema,
    description: 'Creates a lead in the authenticated organization and assigns it to a lead pipeline stage.',
  },
  update: {
    schema: customerLeadUpdateSchema,
    responseSchema: defaultOkResponseSchema,
    description: 'Updates lead details, stage, outcome, links, or conversion references.',
  },
  del: {
    schema: z.object({ id: z.string().uuid() }),
    responseSchema: defaultOkResponseSchema,
    description: 'Soft deletes a lead by id. Request body or query may provide the identifier.',
  },
})
