import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import type { CommandRuntimeContext, CommandBus } from '@open-mercato/shared/lib/commands'
import { leadAssignSchema } from '../../../data/validators'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['customers.leads.manage'] },
}

async function buildContext(req: Request): Promise<{ ctx: CommandRuntimeContext }> {
  const container = await createRequestContainer()
  const auth = await getAuthFromRequest(req)
  const { translate } = await resolveTranslations()
  if (!auth) throw new CrudHttpError(401, { error: translate('customers.errors.unauthorized', 'Unauthorized') })
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const ctx: CommandRuntimeContext = {
    container,
    auth,
    organizationScope: scope,
    selectedOrganizationId: scope?.selectedId ?? auth.orgId ?? null,
    organizationIds: scope?.filterIds ?? (auth.orgId ? [auth.orgId] : null),
    request: req,
  }
  return { ctx }
}

export async function POST(req: Request) {
  try {
    const { ctx } = await buildContext(req)
    const body = await req.json().catch(() => ({}))
    const parsed = leadAssignSchema.parse(body)
    const commandBus = ctx.container.resolve('commandBus') as CommandBus
    await commandBus.execute('customers.leads.assign', { input: parsed, ctx })
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof CrudHttpError) return NextResponse.json(err.body, { status: err.status })
    console.error('customers.leads.assign POST failed', err)
    return NextResponse.json({ error: 'Failed to assign lead' }, { status: 400 })
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Customers',
  summary: 'Assign lead owner',
  methods: {
    POST: {
      summary: 'Assign lead',
      description: 'Sets the owning user for a lead.',
      requestBody: { contentType: 'application/json', schema: leadAssignSchema },
      responses: [{ status: 200, description: 'Lead assigned', schema: z.object({ ok: z.boolean() }) }],
      errors: [
        { status: 400, description: 'Validation failed', schema: z.object({ error: z.string() }) },
        { status: 404, description: 'Lead not found', schema: z.object({ error: z.string() }) },
      ],
    },
  },
}
