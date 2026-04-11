import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { NextResponse } from 'next/server'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { z } from 'zod'
import { CustomsCase } from '../../../data/entities'
import { customsCaseResponseSchema, errorResponseSchema } from '../../../data/validators'
import { createCustomsDocumentsOpenApi } from '../../openapi'
import {
  handleCustomsDocumentsRouteError,
  resolveCustomsDocumentsRouteContext,
  serializeCustomsCase,
} from '../../../lib/routeHelpers'

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
    return NextResponse.json(serializeCustomsCase(customsCase))
  } catch (error) {
    return handleCustomsDocumentsRouteError(error, 'cases.detail')
  }
}

export const openApi: OpenApiRouteDoc = createCustomsDocumentsOpenApi({
  GET: {
    summary: 'Get customs case detail',
    pathParams: paramsSchema,
    responses: [
      { status: 200, description: 'Customs case detail', schema: customsCaseResponseSchema },
    ],
    errors: [
      { status: 401, description: 'Authentication required', schema: errorResponseSchema },
      { status: 404, description: 'Customs case not found', schema: errorResponseSchema },
    ],
  },
})
