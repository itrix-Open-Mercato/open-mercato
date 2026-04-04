import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import type { CommandRuntimeContext, CommandBus } from '@open-mercato/shared/lib/commands'
import { leadMarkLostSchema } from '../../../data/validators'
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
    const parsed = leadMarkLostSchema.parse(body)
    const commandBus = ctx.container.resolve('commandBus') as CommandBus
    await commandBus.execute('customers.leads.mark-lost', { input: parsed, ctx })
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof CrudHttpError) return NextResponse.json(err.body, { status: err.status })
    console.error('customers.leads.mark-lost POST failed', err)
    return NextResponse.json({ error: 'Failed to mark lead as lost' }, { status: 400 })
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Customers',
  summary: 'Mark lead as lost',
  methods: {
    POST: {
      summary: 'Mark lead lost',
      description: 'Sets lead outcome to lost with an optional lost reason.',
      requestBody: { contentType: 'application/json', schema: leadMarkLostSchema },
      responses: [{ status: 200, description: 'Lead marked lost', schema: z.object({ ok: z.boolean() }) }],
      errors: [
        { status: 400, description: 'Validation failed', schema: z.object({ error: z.string() }) },
        { status: 404, description: 'Lead not found', schema: z.object({ error: z.string() }) },
      ],
    },
  },
}
