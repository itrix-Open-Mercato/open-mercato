import type { CommandBus } from '@open-mercato/shared/lib/commands/command-bus'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import {
  runCrudMutationGuardAfterSuccess,
  validateCrudMutationGuard,
} from '@open-mercato/shared/lib/crud/mutation-guard'
import { CustomsConsistencyCheck, CustomsLineItem } from '../../../../data/entities'
import {
  customsCaseProcessResponseSchema,
  customsCaseProcessSchema,
  errorResponseSchema,
  type CustomsCaseProcessInput,
} from '../../../../data/validators'
import { createCustomsDocumentsOpenApi } from '../../../openapi'
import {
  handleCustomsDocumentsRouteError,
  resolveCustomsDocumentsRouteContext,
  serializeLineItem,
  serializeConsistencyCheck,
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
    const input = customsCaseProcessSchema.parse({
      caseId: params.id,
      tenantId: ctx.tenantId,
      organizationId: ctx.organizationId,
    })
    const guardResult = await validateCrudMutationGuard(ctx.container, {
      tenantId: ctx.tenantId,
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      resourceKind: 'customs_documents.case',
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
    const { result } = await commandBus.execute<CustomsCaseProcessInput, {
      caseId: string
      documentCount: number
      parsedDocumentCount: number
      checkIds: string[]
      lineItemIds: string[]
      candidateIds: string[]
    }>('customs_documents.cases.process', {
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
        resourceKind: 'customs_documents.case',
        resourceId: params.id,
        operation: 'custom',
        requestMethod: req.method,
        requestHeaders: req.headers,
        metadata: guardResult.metadata ?? null,
      })
    }

    const checks = result.checkIds.length
      ? await findWithDecryption(
          ctx.em,
          CustomsConsistencyCheck,
          {
            id: { $in: result.checkIds },
            caseId: params.id,
            tenantId: ctx.tenantId,
            organizationId: ctx.organizationId,
            deletedAt: null,
          },
          { orderBy: { createdAt: 'asc' } },
          ctx.scope,
        )
      : []
    const lineItems = result.lineItemIds.length
      ? await findWithDecryption(
          ctx.em,
          CustomsLineItem,
          {
            id: { $in: result.lineItemIds },
            caseId: params.id,
            tenantId: ctx.tenantId,
            organizationId: ctx.organizationId,
            deletedAt: null,
          },
          { orderBy: { createdAt: 'asc' } },
          ctx.scope,
        )
      : []

    return NextResponse.json({
      caseId: result.caseId,
      documentCount: result.documentCount,
      parsedDocumentCount: result.parsedDocumentCount,
      lineItems: lineItems.map((lineItem) => serializeLineItem(lineItem)),
      consistencyChecks: checks.map(serializeConsistencyCheck),
    })
  } catch (error) {
    return handleCustomsDocumentsRouteError(error, 'cases.process')
  }
}

export const openApi: OpenApiRouteDoc = createCustomsDocumentsOpenApi({
  POST: {
    summary: 'Process customs case documents',
    description: 'Runs deterministic extraction and stores consistency checks for the case.',
    pathParams: paramsSchema,
    responses: [
      { status: 200, description: 'Customs case processed', schema: customsCaseProcessResponseSchema },
    ],
    errors: [
      { status: 400, description: 'Validation failed or no documents attached', schema: errorResponseSchema },
      { status: 401, description: 'Authentication required', schema: errorResponseSchema },
      { status: 403, description: 'Forbidden', schema: errorResponseSchema },
      { status: 404, description: 'Customs case not found', schema: errorResponseSchema },
    ],
  },
})
