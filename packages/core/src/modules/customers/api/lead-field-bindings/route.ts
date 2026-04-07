/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod'
import { makeCrudRoute } from '@open-mercato/shared/lib/crud/factory'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { CustomerLeadFieldBinding } from '../../data/entities'
import {
  customerLeadFieldBindingCreateSchema,
  customerLeadFieldBindingUpdateSchema,
  customerLeadFieldBindingDeleteSchema,
} from '../../data/validators'
import { withScopedPayload } from '../utils'
import {
  createCustomersCrudOpenApi,
  createPagedListResponseSchema,
  defaultOkResponseSchema,
} from '../openapi'

const rawBodySchema = z.object({}).passthrough()

const listSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(50),
  id: z.string().uuid().optional(),
  pipelineId: z.string().uuid().optional(),
  sectionKind: z.enum(['lead', 'person', 'company', 'deal']).optional(),
  isActive: z.coerce.boolean().optional(),
  sortField: z.string().optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
})

const routeMetadata = {
  GET: { requireAuth: true, requireFeatures: ['customers.lead-pipelines.view'] },
  POST: { requireAuth: true, requireFeatures: ['customers.lead-field-bindings.manage'] },
  PUT: { requireAuth: true, requireFeatures: ['customers.lead-field-bindings.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['customers.lead-field-bindings.manage'] },
}

export const metadata = routeMetadata

const crud = makeCrudRoute({
  metadata: routeMetadata,
  orm: {
    entity: CustomerLeadFieldBinding,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
  },
  list: {
    schema: listSchema,
    entityId: 'customers:customer_lead_field_binding',
    fields: [
      'id',
      'pipeline_id',
      'lead_field_key',
      'binding_mode',
      'target_entity_kind',
      'target_field_key',
      'section_kind',
      'is_active',
      'organization_id',
      'tenant_id',
      'created_at',
      'updated_at',
    ],
    sortFieldMap: {
      leadFieldKey: 'lead_field_key',
      sectionKind: 'section_kind',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
    buildFilters: async (query: any) => {
      const filters: Record<string, any> = {}
      if (query.id) filters.id = { $eq: query.id }
      if (query.pipelineId) filters.pipeline_id = { $eq: query.pipelineId }
      if (query.sectionKind) filters.section_kind = { $eq: query.sectionKind }
      if (query.isActive !== undefined) filters.is_active = { $eq: query.isActive }
      return filters
    },
  },
  actions: {
    create: {
      commandId: 'customers.lead-field-bindings.create',
      schema: rawBodySchema,
      mapInput: async ({ raw, ctx }) => {
        const { translate } = await resolveTranslations()
        return customerLeadFieldBindingCreateSchema.parse(withScopedPayload(raw ?? {}, ctx, translate))
      },
      response: ({ result }) => ({ id: result?.bindingId ?? null }),
      status: 201,
    },
    update: {
      commandId: 'customers.lead-field-bindings.update',
      schema: rawBodySchema,
      mapInput: async ({ raw, ctx }) => {
        const { translate } = await resolveTranslations()
        return customerLeadFieldBindingUpdateSchema.parse(withScopedPayload(raw ?? {}, ctx, translate))
      },
      response: () => ({ ok: true }),
    },
    delete: {
      commandId: 'customers.lead-field-bindings.delete',
      schema: rawBodySchema,
      mapInput: async ({ parsed, ctx }) => {
        const { translate } = await resolveTranslations()
        const id =
          parsed?.body?.id ??
          parsed?.id ??
          parsed?.query?.id ??
          (ctx.request ? new URL(ctx.request.url).searchParams.get('id') : null)
        if (!id) throw new CrudHttpError(400, { error: 'Lead field binding id is required' })
        return customerLeadFieldBindingDeleteSchema.parse(withScopedPayload({ id }, ctx, translate))
      },
      response: () => ({ ok: true }),
    },
  },
})

const { POST, PUT, DELETE } = crud

export { POST, PUT, DELETE }
export const GET = crud.GET

const itemSchema = z.object({
  id: z.string().uuid(),
  pipeline_id: z.string().uuid().nullable().optional(),
  lead_field_key: z.string(),
  binding_mode: z.enum(['lead_only', 'prefill_only', 'shared']),
  target_entity_kind: z.enum(['person', 'company', 'deal']).nullable().optional(),
  target_field_key: z.string().nullable().optional(),
  section_kind: z.enum(['lead', 'person', 'company', 'deal']),
  is_active: z.boolean().optional(),
  organization_id: z.string().uuid().nullable().optional(),
  tenant_id: z.string().uuid().nullable().optional(),
  created_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
})

export const openApi = createCustomersCrudOpenApi({
  resourceName: 'Lead field binding',
  pluralName: 'Lead field bindings',
  querySchema: listSchema,
  listResponseSchema: createPagedListResponseSchema(itemSchema),
  create: {
    schema: customerLeadFieldBindingCreateSchema,
    responseSchema: z.object({ id: z.string().uuid().nullable() }),
    description: 'Creates a lead field binding used by lead conversion forms.',
  },
  update: {
    schema: customerLeadFieldBindingUpdateSchema,
    responseSchema: defaultOkResponseSchema,
    description: 'Updates a lead field binding.',
  },
  del: {
    schema: z.object({ id: z.string().uuid() }),
    responseSchema: defaultOkResponseSchema,
    description: 'Deletes a lead field binding.',
  },
})
