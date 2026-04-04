import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { CommandRuntimeContext, CommandBus } from '@open-mercato/shared/lib/commands'
import { CustomerLeadPipelineStage } from '../../data/entities'
import {
  leadPipelineStageCreateSchema,
  leadPipelineStageUpdateSchema,
  leadPipelineStageDeleteSchema,
  type LeadPipelineStageCreateInput,
  type LeadPipelineStageUpdateInput,
  type LeadPipelineStageDeleteInput,
} from '../../data/validators'
import { withScopedPayload } from '../utils'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
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
    const url = new URL(req.url)
    const pipelineId = url.searchParams.get('pipelineId')
    const em = ctx.container.resolve('em') as EntityManager
    const where: Record<string, unknown> = { organizationId, tenantId }
    if (pipelineId) where.pipelineId = pipelineId
    const stages = await em.find(CustomerLeadPipelineStage, where, { orderBy: { position: 'ASC' } })
    return NextResponse.json({
      items: stages.map((s) => ({ id: s.id, pipelineId: s.pipelineId, name: s.name, code: s.code, position: s.position, kind: s.kind, isActive: s.isActive, organizationId: s.organizationId, tenantId: s.tenantId, createdAt: s.createdAt, updatedAt: s.updatedAt })),
      total: stages.length,
    })
  } catch (err) {
    if (err instanceof CrudHttpError) return NextResponse.json(err.body, { status: err.status })
    console.error('customers.lead-pipeline-stages GET failed', err)
    return NextResponse.json({ error: 'Failed to load lead pipeline stages' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const { ctx } = await buildContext(req)
    const body = await req.json().catch(() => ({}))
    const { translate } = await resolveTranslations()
    const scoped = withScopedPayload(body, ctx, translate)
    const commandBus = ctx.container.resolve('commandBus') as CommandBus
    const { result } = await commandBus.execute<LeadPipelineStageCreateInput, { stageId: string }>('customers.lead-pipeline-stages.create', { input: leadPipelineStageCreateSchema.parse(scoped), ctx })
    return NextResponse.json({ id: result?.stageId ?? null }, { status: 201 })
  } catch (err) {
    if (err instanceof CrudHttpError) return NextResponse.json(err.body, { status: err.status })
    return NextResponse.json({ error: 'Failed to create lead pipeline stage' }, { status: 400 })
  }
}

export async function PUT(req: Request) {
  try {
    const { ctx } = await buildContext(req)
    const body = await req.json().catch(() => ({}))
    const { translate } = await resolveTranslations()
    const scoped = withScopedPayload(body, ctx, translate)
    const commandBus = ctx.container.resolve('commandBus') as CommandBus
    await commandBus.execute<LeadPipelineStageUpdateInput, void>('customers.lead-pipeline-stages.update', { input: leadPipelineStageUpdateSchema.parse(scoped), ctx })
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof CrudHttpError) return NextResponse.json(err.body, { status: err.status })
    return NextResponse.json({ error: 'Failed to update lead pipeline stage' }, { status: 400 })
  }
}

export async function DELETE(req: Request) {
  try {
    const { ctx } = await buildContext(req)
    const body = await req.json().catch(() => ({}))
    const { translate } = await resolveTranslations()
    const scoped = withScopedPayload(body, ctx, translate)
    const commandBus = ctx.container.resolve('commandBus') as CommandBus
    await commandBus.execute<LeadPipelineStageDeleteInput, void>('customers.lead-pipeline-stages.delete', { input: leadPipelineStageDeleteSchema.parse(scoped), ctx })
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof CrudHttpError) return NextResponse.json(err.body, { status: err.status })
    return NextResponse.json({ error: 'Failed to delete lead pipeline stage' }, { status: 400 })
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Customers',
  summary: 'Manage lead pipeline stages',
  methods: {
    GET: { summary: 'List lead pipeline stages', description: 'Returns stages for all or a specific lead pipeline.', query: z.object({ pipelineId: z.string().uuid().optional() }), responses: [{ status: 200, description: 'Stage list', schema: z.object({ items: z.array(z.object({ id: z.string(), pipelineId: z.string(), name: z.string(), code: z.string(), position: z.number(), kind: z.string(), isActive: z.boolean() })), total: z.number() }) }], errors: [] },
    POST: { summary: 'Create stage', description: 'Creates a new stage in a lead pipeline.', requestBody: { contentType: 'application/json', schema: leadPipelineStageCreateSchema }, responses: [{ status: 201, description: 'Created', schema: z.object({ id: z.string().nullable() }) }], errors: [] },
    PUT: { summary: 'Update stage', description: 'Updates an existing lead pipeline stage.', requestBody: { contentType: 'application/json', schema: leadPipelineStageUpdateSchema }, responses: [{ status: 200, description: 'Updated', schema: z.object({ ok: z.boolean() }) }], errors: [] },
    DELETE: { summary: 'Delete stage', description: 'Deletes a stage. Returns 409 if active leads are in this stage.', requestBody: { contentType: 'application/json', schema: leadPipelineStageDeleteSchema }, responses: [{ status: 200, description: 'Deleted', schema: z.object({ ok: z.boolean() }) }], errors: [{ status: 409, description: 'Has active leads', schema: z.object({ error: z.string() }) }] },
  },
}
