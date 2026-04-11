import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { findWithDecryption, findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { CustomsCase, CustomsConsistencyCheck } from '../../../../data/entities'
import { customsConsistencyListResponseSchema, errorResponseSchema } from '../../../../data/validators'
import { createCustomsDocumentsOpenApi } from '../../../openapi'
import {
  handleCustomsDocumentsRouteError,
  resolveCustomsDocumentsRouteContext,
  serializeConsistencyCheck,
} from '../../../../lib/routeHelpers'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['customs_documents.view'] },
}

const paramsSchema = z.object({
  id: z.string().uuid(),
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

    const checks = await findWithDecryption(
      ctx.em,
      CustomsConsistencyCheck,
      {
        caseId: params.id,
        tenantId: ctx.tenantId,
        organizationId: ctx.organizationId,
        deletedAt: null,
      },
      { orderBy: { createdAt: 'asc' } },
      ctx.scope,
    )

    return NextResponse.json({ items: checks.map(serializeConsistencyCheck) })
  } catch (error) {
    return handleCustomsDocumentsRouteError(error, 'consistency.list')
  }
}

export const openApi: OpenApiRouteDoc = createCustomsDocumentsOpenApi({
  GET: {
    summary: 'List customs case consistency checks',
    pathParams: paramsSchema,
    responses: [
      { status: 200, description: 'Customs consistency checks', schema: customsConsistencyListResponseSchema },
    ],
    errors: [
      { status: 401, description: 'Authentication required', schema: errorResponseSchema },
      { status: 404, description: 'Customs case not found', schema: errorResponseSchema },
    ],
  },
})
