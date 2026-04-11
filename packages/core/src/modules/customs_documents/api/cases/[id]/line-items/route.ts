import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { CustomsHsDecision, CustomsLineItem } from '../../../../data/entities'
import { customsLineItemListResponseSchema, errorResponseSchema } from '../../../../data/validators'
import { createCustomsDocumentsOpenApi } from '../../../openapi'
import {
  handleCustomsDocumentsRouteError,
  resolveCustomsDocumentsRouteContext,
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
    const items = await findWithDecryption(
      ctx.em,
      CustomsLineItem,
      {
        caseId: params.id,
        tenantId: ctx.tenantId,
        organizationId: ctx.organizationId,
        deletedAt: null,
      },
      { orderBy: { createdAt: 'asc' } },
      ctx.scope,
    )
    const decisions = items.length
      ? await findWithDecryption(
          ctx.em,
          CustomsHsDecision,
          {
            lineItemId: { $in: items.map((item) => item.id) },
            tenantId: ctx.tenantId,
            organizationId: ctx.organizationId,
            deletedAt: null,
          },
          { orderBy: { createdAt: 'desc' } },
          ctx.scope,
        )
      : []
    const decisionByLineItem = new Map<string, CustomsHsDecision>()
    for (const decision of decisions) {
      if (!decisionByLineItem.has(decision.lineItemId)) {
        decisionByLineItem.set(decision.lineItemId, decision)
      }
    }
    return NextResponse.json({ items: items.map((item) => serializeLineItem(item, decisionByLineItem.get(item.id) ?? null)) })
  } catch (error) {
    return handleCustomsDocumentsRouteError(error, 'line_items.list')
  }
}

export const openApi: OpenApiRouteDoc = createCustomsDocumentsOpenApi({
  GET: {
    summary: 'List customs case line items',
    pathParams: paramsSchema,
    responses: [
      { status: 200, description: 'Customs line items', schema: customsLineItemListResponseSchema },
    ],
    errors: [
      { status: 401, description: 'Authentication required', schema: errorResponseSchema },
    ],
  },
})
