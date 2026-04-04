import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { CommandRuntimeContext, CommandBus } from '@open-mercato/shared/lib/commands'
import { CustomerLeadPipeline } from '../../data/entities'
import {
  leadPipelineCreateSchema,
  leadPipelineUpdateSchema,
  leadPipelineDeleteSchema,
  type LeadPipelineCreateInput,
  type LeadPipelineUpdateInput,
  type LeadPipelineDeleteInput,
} from '../../data/validators'
import { withScopedPayload } from '../utils'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { serializeOperationMetadata } from '@open-mercato/shared/lib/commands/operationMetadata'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['customers.lead-pipelines.view'] },
  POST: { requireAuth: true, requireFeatures: ['customers.lead-pipelines.manage'] },
  PUT: { requireAuth: true, requireFeatures: ['customers.lead-pipelines.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['customers.lead-pipelines.manage'] },
}

async function buildContext(req: Request): Promise<{ ctx: CommandRuntimeContext; organizationId: string | null; tenantId: string | null }> {
  const container = await createRequestContainer()
  const auth = await getAuthFromRequest(req)
  const { translate } = await resolveTranslations()
  if (!auth) throw new CrudHttpError(401, { error: translate('customers.errors.unauthorized', 'Unauthorized') })
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const ctx: CommandRuntimeContext = {
    container, auth, organizationScope: scope,
    selectedOrganizationId: scope?.selectedId ?? auth.orgId ?? null,
    organizationIds: scope?.filterIds ?? (auth.orgId ? [auth.orgId] : null),
    request: req,
  }
  return { ctx, organizationId: scope?.selectedId ?? auth.orgId ?? null, tenantId: auth.tenantId ?? null }
}

export async function GET(req: Request) {
  try {
    const { ctx, organizationId, tenantId } = await buildContext(req)
    if (!organizationId || !tenantId) return NextResponse.json({ error: 'Organization and tenant context required' }, { status: 400 })
    const em = ctx.container.resolve('em') as EntityManager
    const pipelines = await em.find(CustomerLeadPipeline, { organizationId, tenantId }, { orderBy: { createdAt: 'ASC' } })
    return NextResponse.json({
      items: pipelines.map((p) => ({ id: p.id, name: p.name, code: p.code, isDefault: p.isDefault, isActive: p.isActive, organizationId: p.organizationId, tenantId: p.tenantId, createdAt: p.createdAt, updatedAt: p.updatedAt })),
      total: pipelines.length,
    })
  } catch (err) {
    if (err instanceof CrudHttpError) return NextResponse.json(err.body, { status: err.status })
    console.error('customers.lead-pipelines GET failed', err)
    return NextResponse.json({ error: 'Failed to load lead pipelines' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const { ctx } = await buildContext(req)
    const body = await req.json().catch(() => ({}))
    const { translate } = await resolveTranslations()
    const scoped = withScopedPayload(body, ctx, translate)
    const commandBus = ctx.container.resolve('commandBus') as CommandBus
    const { result, logEntry } = await commandBus.execute<LeadPipelineCreateInput, { pipelineId: string }>('customers.lead-pipelines.create', { input: leadPipelineCreateSchema.parse(scoped), ctx })
    const response = NextResponse.json({ id: result?.pipelineId ?? null }, { status: 201 })
    if (logEntry?.undoToken && logEntry?.id && logEntry?.commandId) {
      response.headers.set('x-om-operation', serializeOperationMetadata({ id: logEntry.id, undoToken: logEntry.undoToken, commandId: logEntry.commandId, actionLabel: logEntry.actionLabel ?? null, resourceKind: 'customers.lead-pipeline', resourceId: logEntry.resourceId ?? result?.pipelineId ?? null, executedAt: logEntry.createdAt instanceof Date ? logEntry.createdAt.toISOString() : undefined }))
    }
    return response
  } catch (err) {
    if (err instanceof CrudHttpError) return NextResponse.json(err.body, { status: err.status })
    return NextResponse.json({ error: 'Failed to create lead pipeline' }, { status: 400 })
  }
}

export async function PUT(req: Request) {
  try {
    const { ctx } = await buildContext(req)
    const body = await req.json().catch(() => ({}))
    const { translate } = await resolveTranslations()
    const scoped = withScopedPayload(body, ctx, translate)
    const commandBus = ctx.container.resolve('commandBus') as CommandBus
    await commandBus.execute<LeadPipelineUpdateInput, void>('customers.lead-pipelines.update', { input: leadPipelineUpdateSchema.parse(scoped), ctx })
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof CrudHttpError) return NextResponse.json(err.body, { status: err.status })
    return NextResponse.json({ error: 'Failed to update lead pipeline' }, { status: 400 })
  }
}

export async function DELETE(req: Request) {
  try {
    const { ctx } = await buildContext(req)
    const body = await req.json().catch(() => ({}))
    const { translate } = await resolveTranslations()
    const scoped = withScopedPayload(body, ctx, translate)
    const commandBus = ctx.container.resolve('commandBus') as CommandBus
    await commandBus.execute<LeadPipelineDeleteInput, void>('customers.lead-pipelines.delete', { input: leadPipelineDeleteSchema.parse(scoped), ctx })
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof CrudHttpError) return NextResponse.json(err.body, { status: err.status })
    return NextResponse.json({ error: 'Failed to delete lead pipeline' }, { status: 400 })
  }
}

const pipelineItemSchema = z.object({ id: z.string().uuid(), name: z.string(), code: z.string(), isDefault: z.boolean(), isActive: z.boolean(), organizationId: z.string().uuid(), tenantId: z.string().uuid(), createdAt: z.date(), updatedAt: z.date() })

export const openApi: OpenApiRouteDoc = {
  tag: 'Customers',
  summary: 'Manage lead pipelines',
  methods: {
    GET: { summary: 'List lead pipelines', description: 'Returns all lead pipelines for the organization.', query: z.object({}), responses: [{ status: 200, description: 'Lead pipeline list', schema: z.object({ items: z.array(pipelineItemSchema), total: z.number() }) }], errors: [] },
    POST: { summary: 'Create lead pipeline', description: 'Creates a new lead pipeline.', requestBody: { contentType: 'application/json', schema: leadPipelineCreateSchema }, responses: [{ status: 201, description: 'Created', schema: z.object({ id: z.string().uuid().nullable() }) }], errors: [] },
    PUT: { summary: 'Update lead pipeline', description: 'Updates an existing lead pipeline.', requestBody: { contentType: 'application/json', schema: leadPipelineUpdateSchema }, responses: [{ status: 200, description: 'Updated', schema: z.object({ ok: z.boolean() }) }], errors: [] },
    DELETE: { summary: 'Delete lead pipeline', description: 'Deletes a lead pipeline. Returns 409 if active leads exist.', requestBody: { contentType: 'application/json', schema: leadPipelineDeleteSchema }, responses: [{ status: 200, description: 'Deleted', schema: z.object({ ok: z.boolean() }) }], errors: [{ status: 409, description: 'Has active leads', schema: z.object({ error: z.string() }) }] },
  },
}
