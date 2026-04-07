import { NextResponse } from 'next/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { withScopedPayload } from '../utils'
import type { CommandBus, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import type { ZodTypeAny } from 'zod'

export async function buildLeadWorkflowContext(req: Request): Promise<CommandRuntimeContext> {
  const container = await createRequestContainer()
  const auth = await getAuthFromRequest(req)
  const { translate } = await resolveTranslations()
  if (!auth) throw new CrudHttpError(401, { error: translate('customers.errors.unauthorized', 'Unauthorized') })
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  return {
    container,
    auth,
    organizationScope: scope,
    selectedOrganizationId: scope?.selectedId ?? auth.orgId ?? null,
    organizationIds: scope?.filterIds ?? (auth.orgId ? [auth.orgId] : null),
    request: req,
  }
}

export async function executeLeadWorkflowCommand<TInput, TResult>(
  req: Request,
  commandId: string,
  schema: ZodTypeAny
): Promise<NextResponse> {
  try {
    const ctx = await buildLeadWorkflowContext(req)
    const body = await req.json().catch(() => ({}))
    const { translate } = await resolveTranslations()
    const input = schema.parse(withScopedPayload(body, ctx, translate)) as TInput
    const commandBus = ctx.container.resolve('commandBus') as CommandBus
    const { result } = await commandBus.execute<TInput, TResult>(commandId, { input, ctx })
    return NextResponse.json(result ?? { ok: true })
  } catch (err) {
    if (err instanceof CrudHttpError) {
      return NextResponse.json(err.body, { status: err.status })
    }
    console.error(`customers.leads workflow ${commandId} failed`, err)
    return NextResponse.json({ error: 'Failed to execute lead workflow action' }, { status: 500 })
  }
}
