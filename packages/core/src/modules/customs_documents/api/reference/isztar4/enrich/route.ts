import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { NextResponse } from 'next/server'
import {
  runCrudMutationGuardAfterSuccess,
  validateCrudMutationGuard,
} from '@open-mercato/shared/lib/crud/mutation-guard'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { readJsonSafe } from '@open-mercato/shared/lib/http/readJsonSafe'
import { CustomsHsMeasureCache } from '../../../../data/entities'
import {
  customsIsztar4EnrichResponseSchema,
  customsIsztar4EnrichSchema,
  errorResponseSchema,
} from '../../../../data/validators'
import { createCustomsDocumentsOpenApi } from '../../../openapi'
import {
  handleCustomsDocumentsRouteError,
  resolveCustomsDocumentsRouteContext,
} from '../../../../lib/routeHelpers'
import { normalizeHsCode } from '../../../../lib/hsCandidates'
import { fetchIsztar4Measures } from '../../../../lib/isztar4'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['customs_documents.view'] },
}

export async function POST(req: Request) {
  try {
    const ctx = await resolveCustomsDocumentsRouteContext(req)
    const input = customsIsztar4EnrichSchema.parse(await readJsonSafe<Record<string, unknown>>(req, {}))
    const hsCode = normalizeHsCode(input.hsCode)
    const guardResult = await validateCrudMutationGuard(ctx.container, {
      tenantId: ctx.tenantId,
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      resourceKind: 'customs_documents.hs_measure_cache',
      resourceId: `${hsCode}:${input.date}:${input.language}`,
      operation: 'custom',
      requestMethod: req.method,
      requestHeaders: req.headers,
      mutationPayload: input,
    })
    if (guardResult && !guardResult.ok) {
      return NextResponse.json(guardResult.body, { status: guardResult.status })
    }

    const cached = await findOneWithDecryption(
      ctx.em,
      CustomsHsMeasureCache,
      {
        hsCode,
        date: input.date,
        language: input.language,
      },
      undefined,
      ctx.scope,
    )
    if (cached && !input.forceLive && !cached.errorMessage) {
      return NextResponse.json({
        hsCode,
        date: input.date,
        language: input.language,
        source: 'cached',
        summary: cached.summaryJson ?? null,
        error: null,
      })
    }

    try {
      const { raw, summary } = await fetchIsztar4Measures({
        hsCode,
        date: input.date,
        language: input.language,
      })
      const record = cached ?? ctx.em.create(CustomsHsMeasureCache, {
        hsCode,
        date: input.date,
        language: input.language,
        source: 'live',
        fetchedAt: new Date(),
      })
      record.source = 'live'
      record.summaryJson = summary
      record.rawResponseJson = raw
      record.errorMessage = null
      record.fetchedAt = new Date()
      if (!cached) ctx.em.persist(record)
      await ctx.em.flush()
      if (guardResult?.ok && guardResult.shouldRunAfterSuccess) {
        await runCrudMutationGuardAfterSuccess(ctx.container, {
          tenantId: ctx.tenantId,
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          resourceKind: 'customs_documents.hs_measure_cache',
          resourceId: `${hsCode}:${input.date}:${input.language}`,
          operation: 'custom',
          requestMethod: req.method,
          requestHeaders: req.headers,
          metadata: guardResult.metadata ?? null,
        })
      }
      return NextResponse.json({
        hsCode,
        date: input.date,
        language: input.language,
        source: 'live',
        summary,
        error: null,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'ISZTAR4 enrichment failed'
      const record = cached ?? ctx.em.create(CustomsHsMeasureCache, {
        hsCode,
        date: input.date,
        language: input.language,
        source: 'live',
        fetchedAt: new Date(),
      })
      record.errorMessage = message
      record.fetchedAt = new Date()
      if (!cached) ctx.em.persist(record)
      await ctx.em.flush()
      if (guardResult?.ok && guardResult.shouldRunAfterSuccess) {
        await runCrudMutationGuardAfterSuccess(ctx.container, {
          tenantId: ctx.tenantId,
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          resourceKind: 'customs_documents.hs_measure_cache',
          resourceId: `${hsCode}:${input.date}:${input.language}`,
          operation: 'custom',
          requestMethod: req.method,
          requestHeaders: req.headers,
          metadata: guardResult.metadata ?? null,
        })
      }
      return NextResponse.json({
        hsCode,
        date: input.date,
        language: input.language,
        source: 'error',
        summary: cached?.summaryJson ?? null,
        error: message,
      }, { status: 502 })
    }
  } catch (error) {
    return handleCustomsDocumentsRouteError(error, 'isztar4.enrich')
  }
}

export const openApi: OpenApiRouteDoc = createCustomsDocumentsOpenApi({
  POST: {
    summary: 'Enrich HS candidate with live ISZTAR4 measures',
    requestBody: { schema: customsIsztar4EnrichSchema },
    responses: [
      { status: 200, description: 'ISZTAR4 enrichment result', schema: customsIsztar4EnrichResponseSchema },
    ],
    errors: [
      { status: 400, description: 'Validation failed', schema: errorResponseSchema },
      { status: 401, description: 'Authentication required', schema: errorResponseSchema },
      { status: 502, description: 'ISZTAR4 request failed', schema: customsIsztar4EnrichResponseSchema },
    ],
  },
})
