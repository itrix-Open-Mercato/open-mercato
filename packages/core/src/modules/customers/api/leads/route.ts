import { z } from 'zod'
import { makeCrudRoute } from '@open-mercato/shared/lib/crud/factory'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { CustomerLead } from '../../data/entities'
import { leadCreateSchema, leadUpdateSchema } from '../../data/validators'
import { E } from '#generated/entities.ids.generated'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { parseScopedCommandInput } from '../utils'
import { escapeLikePattern } from '@open-mercato/shared/lib/db/escapeLikePattern'
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
    pipelineId: z.string().uuid().optional(),
    stageId: z.string().uuid().optional(),
    outcome: z.enum(['open', 'won', 'lost']).optional(),
    ownerUserId: z.string().uuid().optional(),
    source: z.string().optional(),
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

type LeadListQuery = z.infer<typeof listSchema>

const crud = makeCrudRoute<unknown, unknown, LeadListQuery>({
  metadata: routeMetadata,
  orm: {
    entity: CustomerLead,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: 'deletedAt',
  },
  indexer: {
    entityType: E.customers.customer_lead,
  },
  list: {
    schema: listSchema,
    entityId: E.customers.customer_lead,
    fields: [
      'id',
      'pipeline_id',
      'stage_id',
      'outcome',
      'lost_reason_id',
      'display_name',
      'owner_user_id',
      'source',
      'source_channel',
      'primary_email',
      'primary_phone',
      'vat_id',
      'qualification_notes',
      'linked_person_id',
      'linked_company_id',
      'linked_deal_id',
      'converted_at',
      'organization_id',
      'tenant_id',
      'created_at',
      'updated_at',
    ],
    sortFieldMap: {
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      displayName: 'display_name',
    },
    buildFilters: async (query: LeadListQuery) => {
      const filters: Record<string, unknown> = {}
      if (query.search) {
        filters.display_name = { $ilike: `%${escapeLikePattern(query.search)}%` }
      }
      if (query.pipelineId) filters.pipeline_id = { $eq: query.pipelineId }
      if (query.stageId) filters.stage_id = { $eq: query.stageId }
      if (query.outcome) filters.outcome = { $eq: query.outcome }
      if (query.ownerUserId) filters.owner_user_id = { $eq: query.ownerUserId }
      if (query.source) filters.source = { $eq: query.source }
      return filters
    },
  },
  actions: {
    create: {
      commandId: 'customers.leads.create',
      schema: rawBodySchema,
      mapInput: async ({ raw, ctx }) => {
        const { translate } = await resolveTranslations()
        return parseScopedCommandInput(leadCreateSchema, raw ?? {}, ctx, translate)
      },
      response: ({ result }) => ({ id: result?.leadId ?? null }),
      status: 201,
    },
    update: {
      commandId: 'customers.leads.update',
      schema: rawBodySchema,
      mapInput: async ({ raw, ctx }) => {
        const { translate } = await resolveTranslations()
        return parseScopedCommandInput(leadUpdateSchema, raw ?? {}, ctx, translate)
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
        return { id }
      },
      response: () => ({ ok: true }),
    },
  },
})

const { POST, PUT, DELETE } = crud
export { POST, PUT, DELETE }
export const GET = crud.GET

const leadListItemSchema = z
  .object({
    id: z.string().uuid(),
    pipeline_id: z.string().uuid().nullable().optional(),
    stage_id: z.string().uuid().nullable().optional(),
    outcome: z.string().nullable().optional(),
    lost_reason_id: z.string().uuid().nullable().optional(),
    display_name: z.string().nullable().optional(),
    owner_user_id: z.string().uuid().nullable().optional(),
    source: z.string().nullable().optional(),
    source_channel: z.string().nullable().optional(),
    primary_email: z.string().nullable().optional(),
    primary_phone: z.string().nullable().optional(),
    vat_id: z.string().nullable().optional(),
    qualification_notes: z.string().nullable().optional(),
    linked_person_id: z.string().uuid().nullable().optional(),
    linked_company_id: z.string().uuid().nullable().optional(),
    linked_deal_id: z.string().uuid().nullable().optional(),
    converted_at: z.string().nullable().optional(),
    organization_id: z.string().uuid().nullable().optional(),
    tenant_id: z.string().uuid().nullable().optional(),
    created_at: z.string().nullable().optional(),
    updated_at: z.string().nullable().optional(),
  })
  .passthrough()

const leadCreateResponseSchema = z.object({ id: z.string().uuid().nullable() })

export const openApi = createCustomersCrudOpenApi({
  resourceName: 'Lead',
  querySchema: listSchema,
  listResponseSchema: createPagedListResponseSchema(leadListItemSchema),
  create: {
    schema: leadCreateSchema,
    responseSchema: leadCreateResponseSchema,
    description: 'Creates a new lead in the specified pipeline and stage.',
  },
  update: {
    schema: leadUpdateSchema,
    responseSchema: defaultOkResponseSchema,
    description: 'Updates an existing lead.',
  },
  del: {
    schema: z.object({ id: z.string().uuid() }),
    responseSchema: defaultOkResponseSchema,
    description: 'Soft-deletes a lead by id.',
  },
})
