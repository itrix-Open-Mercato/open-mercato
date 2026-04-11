import type { CommandBus } from '@open-mercato/shared/lib/commands/command-bus'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { readJsonSafe } from '@open-mercato/shared/lib/http/readJsonSafe'
import {
  runCrudMutationGuardAfterSuccess,
  validateCrudMutationGuard,
} from '@open-mercato/shared/lib/crud/mutation-guard'
import { CustomsHsDecision } from '../../../../data/entities'
import {
  customsHsDecisionResponseSchema,
  customsHsSelectRequestSchema,
  customsHsSelectSchema,
  errorResponseSchema,
  type CustomsHsSelectInput,
} from '../../../../data/validators'
import { createCustomsDocumentsOpenApi } from '../../../openapi'
import {
  handleCustomsDocumentsRouteError,
  resolveCustomsDocumentsRouteContext,
  serializeHsDecision,
} from '../../../../lib/routeHelpers'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['customs_documents.manage'] },
}

const paramsSchema = z.object({
  id: z.string().uuid(),
})

export async function POST(req: Request, ctxParams: { params: Promise<{ id: string }> | { id: string } }) {
  try {
    const ctx = await resolveCustomsDocumentsRouteContext(req)
    const params = paramsSchema.parse(await ctxParams.params)
    const body = await readJsonSafe<Record<string, unknown>>(req, {})
    const input = customsHsSelectSchema.parse({
      ...(body ?? {}),
      lineItemId: params.id,
      tenantId: ctx.tenantId,
      organizationId: ctx.organizationId,
    })
    const guardResult = await validateCrudMutationGuard(ctx.container, {
      tenantId: ctx.tenantId,
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      resourceKind: 'customs_documents.line_item',
      resourceId: params.id,
      operation: 'custom',
      requestMethod: req.method,
      requestHeaders: req.headers,
      mutationPayload: input,
    })
    if (guardResult && !guardResult.ok) {
      return NextResponse.json(guardResult.body, { status: guardResult.status })
    }

    const commandBus = ctx.container.resolve('commandBus') as CommandBus
    const { result } = await commandBus.execute<CustomsHsSelectInput, {
      decisionId: string
      caseId: string
      lineItemId: string
      hsCode: string
      confidenceBand: 'low' | 'medium' | 'high'
    }>('customs_documents.line_items.select_hs', {
      input,
      ctx: {
        container: ctx.container,
        auth: ctx.auth,
        organizationScope: null,
        selectedOrganizationId: ctx.organizationId,
        organizationIds: [ctx.organizationId],
        request: req,
      },
    })

    if (guardResult?.ok && guardResult.shouldRunAfterSuccess) {
      await runCrudMutationGuardAfterSuccess(ctx.container, {
        tenantId: ctx.tenantId,
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        resourceKind: 'customs_documents.line_item',
        resourceId: params.id,
        operation: 'custom',
        requestMethod: req.method,
        requestHeaders: req.headers,
        metadata: guardResult.metadata ?? null,
      })
    }

    const decision = await findOneWithDecryption(
      ctx.em,
      CustomsHsDecision,
      {
        id: result.decisionId,
        lineItemId: params.id,
        tenantId: ctx.tenantId,
        organizationId: ctx.organizationId,
        deletedAt: null,
      },
      undefined,
      ctx.scope,
    )
    if (!decision) return NextResponse.json({ error: 'HS decision not found' }, { status: 404 })
    return NextResponse.json(serializeHsDecision(decision), { status: 201 })
  } catch (error) {
    return handleCustomsDocumentsRouteError(error, 'line_items.select_hs')
  }
}

export const openApi: OpenApiRouteDoc = createCustomsDocumentsOpenApi({
  POST: {
    summary: 'Select HS code for a customs line item',
    description: 'Persists the agent-selected HS code and marks the line item as classified.',
    pathParams: paramsSchema,
    requestBody: { schema: customsHsSelectRequestSchema },
    responses: [
      { status: 201, description: 'HS decision saved', schema: customsHsDecisionResponseSchema },
    ],
    errors: [
      { status: 400, description: 'Validation failed', schema: errorResponseSchema },
      { status: 401, description: 'Authentication required', schema: errorResponseSchema },
      { status: 403, description: 'Forbidden', schema: errorResponseSchema },
      { status: 404, description: 'Line item or candidate not found', schema: errorResponseSchema },
    ],
  },
})
