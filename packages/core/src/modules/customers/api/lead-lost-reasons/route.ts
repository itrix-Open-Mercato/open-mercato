import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { CommandRuntimeContext, CommandBus } from '@open-mercato/shared/lib/commands'
import { CustomerLeadLostReason } from '../../data/entities'
import {
  leadLostReasonCreateSchema,
  leadLostReasonUpdateSchema,
  leadLostReasonDeleteSchema,
  type LeadLostReasonCreateInput,
  type LeadLostReasonUpdateInput,
  type LeadLostReasonDeleteInput,
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
    const reasons = await em.find(CustomerLeadLostReason, where, { orderBy: { sortOrder: 'ASC' } })
    return NextResponse.json({
      items: reasons.map((r) => ({ id: r.id, pipelineId: r.pipelineId ?? null, name: r.name, code: r.code, isActive: r.isActive, sortOrder: r.sortOrder, organizationId: r.organizationId, tenantId: r.tenantId, createdAt: r.createdAt, updatedAt: r.updatedAt })),
      total: reasons.length,
    })
  } catch (err) {
    if (err instanceof CrudHttpError) return NextResponse.json(err.body, { status: err.status })
    console.error('customers.lead-lost-reasons GET failed', err)
    return NextResponse.json({ error: 'Failed to load lead lost reasons' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const { ctx } = await buildContext(req)
    const body = await req.json().catch(() => ({}))
    const { translate } = await resolveTranslations()
    const scoped = withScopedPayload(body, ctx, translate)
    const commandBus = ctx.container.resolve('commandBus') as CommandBus
    const { result } = await commandBus.execute<LeadLostReasonCreateInput, { lostReasonId: string }>('customers.lead-lost-reasons.create', { input: leadLostReasonCreateSchema.parse(scoped), ctx })
    return NextResponse.json({ id: result?.lostReasonId ?? null }, { status: 201 })
  } catch (err) {
    if (err instanceof CrudHttpError) return NextResponse.json(err.body, { status: err.status })
    return NextResponse.json({ error: 'Failed to create lead lost reason' }, { status: 400 })
  }
}

export async function PUT(req: Request) {
  try {
    const { ctx } = await buildContext(req)
    const body = await req.json().catch(() => ({}))
    const { translate } = await resolveTranslations()
    const scoped = withScopedPayload(body, ctx, translate)
    const commandBus = ctx.container.resolve('commandBus') as CommandBus
    await commandBus.execute<LeadLostReasonUpdateInput, void>('customers.lead-lost-reasons.update', { input: leadLostReasonUpdateSchema.parse(scoped), ctx })
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof CrudHttpError) return NextResponse.json(err.body, { status: err.status })
    return NextResponse.json({ error: 'Failed to update lead lost reason' }, { status: 400 })
  }
}

export async function DELETE(req: Request) {
  try {
    const { ctx } = await buildContext(req)
    const body = await req.json().catch(() => ({}))
    const { translate } = await resolveTranslations()
    const scoped = withScopedPayload(body, ctx, translate)
    const commandBus = ctx.container.resolve('commandBus') as CommandBus
    await commandBus.execute<LeadLostReasonDeleteInput, void>('customers.lead-lost-reasons.delete', { input: leadLostReasonDeleteSchema.parse(scoped), ctx })
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof CrudHttpError) return NextResponse.json(err.body, { status: err.status })
    return NextResponse.json({ error: 'Failed to delete lead lost reason' }, { status: 400 })
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Customers',
  summary: 'Manage lead lost reasons',
  methods: {
    GET: { summary: 'List lost reasons', description: 'Returns lost reasons, optionally filtered by pipeline.', query: z.object({ pipelineId: z.string().uuid().optional() }), responses: [{ status: 200, description: 'Lost reason list', schema: z.object({ items: z.array(z.object({ id: z.string(), name: z.string(), code: z.string(), isActive: z.boolean(), sortOrder: z.number() })), total: z.number() }) }], errors: [] },
    POST: { summary: 'Create lost reason', description: 'Creates a new lost reason.', requestBody: { contentType: 'application/json', schema: leadLostReasonCreateSchema }, responses: [{ status: 201, description: 'Created', schema: z.object({ id: z.string().nullable() }) }], errors: [] },
    PUT: { summary: 'Update lost reason', description: 'Updates an existing lost reason.', requestBody: { contentType: 'application/json', schema: leadLostReasonUpdateSchema }, responses: [{ status: 200, description: 'Updated', schema: z.object({ ok: z.boolean() }) }], errors: [] },
    DELETE: { summary: 'Delete lost reason', description: 'Deletes a lost reason.', requestBody: { contentType: 'application/json', schema: leadLostReasonDeleteSchema }, responses: [{ status: 200, description: 'Deleted', schema: z.object({ ok: z.boolean() }) }], errors: [] },
  },
}
