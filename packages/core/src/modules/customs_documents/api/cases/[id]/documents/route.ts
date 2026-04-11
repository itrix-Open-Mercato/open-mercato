import type { CommandBus } from '@open-mercato/shared/lib/commands/command-bus'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { findAndCountWithDecryption, findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { readJsonSafe } from '@open-mercato/shared/lib/http/readJsonSafe'
import {
  runCrudMutationGuardAfterSuccess,
  validateCrudMutationGuard,
} from '@open-mercato/shared/lib/crud/mutation-guard'
import { CustomsCase, CustomsDocument } from '../../../../data/entities'
import {
  customsDocumentListResponseSchema,
  customsDocumentsAttachResponseSchema,
  customsDocumentsAttachSchema,
  errorResponseSchema,
  type CustomsDocumentsAttachInput,
} from '../../../../data/validators'
import { createCustomsDocumentsOpenApi } from '../../../openapi'
import {
  handleCustomsDocumentsRouteError,
  resolveCustomsDocumentsRouteContext,
  serializeCustomsDocument,
} from '../../../../lib/routeHelpers'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['customs_documents.view'] },
  POST: { requireAuth: true, requireFeatures: ['customs_documents.manage'] },
}

const paramsSchema = z.object({
  id: z.string().uuid(),
})

const attachBodySchema = customsDocumentsAttachSchema.omit({
  caseId: true,
  tenantId: true,
  organizationId: true,
})

export async function GET(req: Request, ctxParams: { params: Promise<{ id: string }> | { id: string } }) {
  try {
    const ctx = await resolveCustomsDocumentsRouteContext(req)
    const params = paramsSchema.parse(await ctxParams.params)
    const customsCase = await findOneWithDecryption(
      ctx.em,
      CustomsCase,
      {
        id: params.id,
        tenantId: ctx.tenantId,
        organizationId: ctx.organizationId,
        deletedAt: null,
      },
      undefined,
      ctx.scope,
    )
    if (!customsCase) return NextResponse.json({ error: 'Customs case not found' }, { status: 404 })

    const [items] = await findAndCountWithDecryption(
      ctx.em,
      CustomsDocument,
      {
        caseId: params.id,
        tenantId: ctx.tenantId,
        organizationId: ctx.organizationId,
        deletedAt: null,
      },
      { orderBy: { createdAt: 'asc' } },
      ctx.scope,
    )

    return NextResponse.json({ items: items.map(serializeCustomsDocument) })
  } catch (error) {
    return handleCustomsDocumentsRouteError(error, 'documents.list')
  }
}

export async function POST(req: Request, ctxParams: { params: Promise<{ id: string }> | { id: string } }) {
  try {
    const ctx = await resolveCustomsDocumentsRouteContext(req)
    const params = paramsSchema.parse(await ctxParams.params)
    const body = attachBodySchema.parse(await readJsonSafe<Record<string, unknown>>(req, {}))
    const input = customsDocumentsAttachSchema.parse({
      ...body,
      caseId: params.id,
      tenantId: ctx.tenantId,
      organizationId: ctx.organizationId,
    })
    const guardResult = await validateCrudMutationGuard(ctx.container, {
      tenantId: ctx.tenantId,
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      resourceKind: 'customs_documents.document',
      resourceId: params.id,
      operation: 'create',
      requestMethod: req.method,
      requestHeaders: req.headers,
      mutationPayload: input,
    })
    if (guardResult && !guardResult.ok) {
      return NextResponse.json(guardResult.body, { status: guardResult.status })
    }

    const commandBus = ctx.container.resolve('commandBus') as CommandBus
    const { result } = await commandBus.execute<CustomsDocumentsAttachInput, { documentIds: string[] }>('customs_documents.documents.attach', {
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
        resourceKind: 'customs_documents.document',
        resourceId: params.id,
        operation: 'create',
        requestMethod: req.method,
        requestHeaders: req.headers,
        metadata: guardResult.metadata ?? null,
      })
    }

    const [items] = await findAndCountWithDecryption(
      ctx.em,
      CustomsDocument,
      {
        id: { $in: result.documentIds },
        caseId: params.id,
        tenantId: ctx.tenantId,
        organizationId: ctx.organizationId,
        deletedAt: null,
      },
      { orderBy: { createdAt: 'asc' } },
      ctx.scope,
    )

    return NextResponse.json({
      ids: result.documentIds,
      items: items.map(serializeCustomsDocument),
    }, { status: 201 })
  } catch (error) {
    return handleCustomsDocumentsRouteError(error, 'documents.attach')
  }
}

export const openApi: OpenApiRouteDoc = createCustomsDocumentsOpenApi({
  GET: {
    summary: 'List customs case documents',
    pathParams: paramsSchema,
    responses: [
      { status: 200, description: 'Customs case documents', schema: customsDocumentListResponseSchema },
    ],
    errors: [
      { status: 401, description: 'Authentication required', schema: errorResponseSchema },
      { status: 404, description: 'Customs case not found', schema: errorResponseSchema },
    ],
  },
  POST: {
    summary: 'Attach uploaded documents to a customs case',
    pathParams: paramsSchema,
    requestBody: { schema: attachBodySchema },
    responses: [
      { status: 201, description: 'Documents attached to case', schema: customsDocumentsAttachResponseSchema },
    ],
    errors: [
      { status: 400, description: 'Validation failed', schema: errorResponseSchema },
      { status: 401, description: 'Authentication required', schema: errorResponseSchema },
      { status: 403, description: 'Forbidden', schema: errorResponseSchema },
      { status: 404, description: 'Case or attachment not found', schema: errorResponseSchema },
    ],
  },
})
