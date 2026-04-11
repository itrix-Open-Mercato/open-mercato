import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { findWithDecryption, findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { CustomsHsCandidate, CustomsLineItem } from '../../../../data/entities'
import { customsLineItemCandidatesResponseSchema, errorResponseSchema } from '../../../../data/validators'
import { createCustomsDocumentsOpenApi } from '../../../openapi'
import {
  handleCustomsDocumentsRouteError,
  resolveCustomsDocumentsRouteContext,
  serializeHsCandidate,
  serializeLineItem,
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
    const lineItem = await findOneWithDecryption(
      ctx.em,
      CustomsLineItem,
      {
        id: params.id,
        tenantId: ctx.tenantId,
        organizationId: ctx.organizationId,
        deletedAt: null,
      },
      undefined,
      ctx.scope,
    )
    if (!lineItem) return NextResponse.json({ error: 'Line item not found' }, { status: 404 })
    const candidates = await findWithDecryption(
      ctx.em,
      CustomsHsCandidate,
      {
        lineItemId: lineItem.id,
        tenantId: ctx.tenantId,
        organizationId: ctx.organizationId,
        deletedAt: null,
      },
      { orderBy: { score: 'desc', createdAt: 'asc' } },
      ctx.scope,
    )
    return NextResponse.json({
      lineItem: serializeLineItem(lineItem),
      items: candidates.map(serializeHsCandidate),
    })
  } catch (error) {
    return handleCustomsDocumentsRouteError(error, 'candidates.list')
  }
}

export const openApi: OpenApiRouteDoc = createCustomsDocumentsOpenApi({
  GET: {
    summary: 'List HS candidates for a customs line item',
    pathParams: paramsSchema,
    responses: [
      { status: 200, description: 'Ranked HS candidates', schema: customsLineItemCandidatesResponseSchema },
    ],
    errors: [
      { status: 401, description: 'Authentication required', schema: errorResponseSchema },
      { status: 404, description: 'Line item not found', schema: errorResponseSchema },
    ],
  },
})
