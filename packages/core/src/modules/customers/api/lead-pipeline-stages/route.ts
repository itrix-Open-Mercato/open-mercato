/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod'
import { makeCrudRoute } from '@open-mercato/shared/lib/crud/factory'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { CustomerLeadPipelineStage } from '../../data/entities'
import {
  customerLeadPipelineStageCreateSchema,
  customerLeadPipelineStageUpdateSchema,
  customerLeadPipelineStageDeleteSchema,
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
  kind: z.enum(['open', 'won', 'lost']).optional(),
  isActive: z.coerce.boolean().optional(),
  sortField: z.string().optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
})

const routeMetadata = {
  GET: { requireAuth: true, requireFeatures: ['customers.lead-pipelines.view'] },
  POST: { requireAuth: true, requireFeatures: ['customers.lead-pipelines.manage'] },
  PUT: { requireAuth: true, requireFeatures: ['customers.lead-pipelines.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['customers.lead-pipelines.manage'] },
}

export const metadata = routeMetadata

const crud = makeCrudRoute({
  metadata: routeMetadata,
  orm: {
    entity: CustomerLeadPipelineStage,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
  },
  list: {
    schema: listSchema,
    entityId: 'customers:customer_lead_pipeline_stage',
    fields: ['id', 'pipeline_id', 'name', 'code', 'position', 'kind', 'is_active', 'organization_id', 'tenant_id', 'created_at', 'updated_at'],
    sortFieldMap: {
      position: 'position',
      name: 'name',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
    buildFilters: async (query: any) => {
      const filters: Record<string, any> = {}
      if (query.id) filters.id = { $eq: query.id }
      if (query.pipelineId) filters.pipeline_id = { $eq: query.pipelineId }
      if (query.kind) filters.kind = { $eq: query.kind }
      if (query.isActive !== undefined) filters.is_active = { $eq: query.isActive }
      return filters
    },
  },
  actions: {
    create: {
      commandId: 'customers.lead-pipeline-stages.create',
      schema: rawBodySchema,
      mapInput: async ({ raw, ctx }) => {
        const { translate } = await resolveTranslations()
        return customerLeadPipelineStageCreateSchema.parse(withScopedPayload(raw ?? {}, ctx, translate))
      },
      response: ({ result }) => ({ id: result?.stageId ?? null }),
      status: 201,
    },
    update: {
      commandId: 'customers.lead-pipeline-stages.update',
      schema: rawBodySchema,
      mapInput: async ({ raw, ctx }) => {
        const { translate } = await resolveTranslations()
        return customerLeadPipelineStageUpdateSchema.parse(withScopedPayload(raw ?? {}, ctx, translate))
      },
      response: () => ({ ok: true }),
    },
    delete: {
      commandId: 'customers.lead-pipeline-stages.delete',
      schema: rawBodySchema,
      mapInput: async ({ parsed, ctx }) => {
        const { translate } = await resolveTranslations()
        const id =
          parsed?.body?.id ??
          parsed?.id ??
          parsed?.query?.id ??
          (ctx.request ? new URL(ctx.request.url).searchParams.get('id') : null)
        if (!id) throw new CrudHttpError(400, { error: 'Lead pipeline stage id is required' })
        return customerLeadPipelineStageDeleteSchema.parse(withScopedPayload({ id }, ctx, translate))
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
  pipeline_id: z.string().uuid().optional(),
  name: z.string(),
  code: z.string(),
  position: z.number(),
  kind: z.enum(['open', 'won', 'lost']),
  is_active: z.boolean().optional(),
  organization_id: z.string().uuid().nullable().optional(),
  tenant_id: z.string().uuid().nullable().optional(),
  created_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
})

export const openApi = createCustomersCrudOpenApi({
  resourceName: 'Lead pipeline stage',
  pluralName: 'Lead pipeline stages',
  querySchema: listSchema,
  listResponseSchema: createPagedListResponseSchema(itemSchema),
  create: {
    schema: customerLeadPipelineStageCreateSchema,
    responseSchema: z.object({ id: z.string().uuid().nullable() }),
    description: 'Creates a lead pipeline stage.',
  },
  update: {
    schema: customerLeadPipelineStageUpdateSchema,
    responseSchema: defaultOkResponseSchema,
    description: 'Updates a lead pipeline stage.',
  },
  del: {
    schema: z.object({ id: z.string().uuid() }),
    responseSchema: defaultOkResponseSchema,
    description: 'Deletes a lead pipeline stage when it has no active leads.',
  },
})
