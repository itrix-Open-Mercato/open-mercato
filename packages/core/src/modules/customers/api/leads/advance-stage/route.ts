import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import type { CommandRuntimeContext, CommandBus } from '@open-mercato/shared/lib/commands'
import { leadAdvanceStageSchema } from '../../../data/validators'
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
    const parsed = leadAdvanceStageSchema.parse(body)
    const commandBus = ctx.container.resolve('commandBus') as CommandBus
    await commandBus.execute('customers.leads.advance-stage', { input: parsed, ctx })
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof CrudHttpError) return NextResponse.json(err.body, { status: err.status })
    console.error('customers.leads.advance-stage POST failed', err)
    return NextResponse.json({ error: 'Failed to advance lead stage' }, { status: 400 })
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Customers',
  summary: 'Advance lead stage',
  methods: {
    POST: {
      summary: 'Advance lead stage',
      description: 'Moves a lead to a different stage within the same pipeline.',
      requestBody: { contentType: 'application/json', schema: leadAdvanceStageSchema },
      responses: [{ status: 200, description: 'Stage advanced', schema: z.object({ ok: z.boolean() }) }],
      errors: [
        { status: 400, description: 'Stage not in pipeline', schema: z.object({ error: z.string() }) },
        { status: 404, description: 'Lead not found', schema: z.object({ error: z.string() }) },
      ],
    },
  },
}
