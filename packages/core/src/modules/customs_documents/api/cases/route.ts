import type { CommandBus } from '@open-mercato/shared/lib/commands/command-bus'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { NextResponse } from 'next/server'
import { escapeLikePattern } from '@open-mercato/shared/lib/db/escapeLikePattern'
import { findAndCountWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { readJsonSafe } from '@open-mercato/shared/lib/http/readJsonSafe'
import {
  runCrudMutationGuardAfterSuccess,
  validateCrudMutationGuard,
} from '@open-mercato/shared/lib/crud/mutation-guard'
import { CustomsCase } from '../../data/entities'
import {
  customsCaseCreateResponseSchema,
  customsCaseCreateSchema,
  type CustomsCaseCreateInput,
  customsCaseListQuerySchema,
  customsCaseListResponseSchema,
  customsCaseResponseSchema,
  errorResponseSchema,
} from '../../data/validators'
import { createCustomsDocumentsOpenApi } from '../openapi'
import {
  handleCustomsDocumentsRouteError,
  resolveCustomsDocumentsRouteContext,
  serializeCustomsCase,
} from '../../lib/routeHelpers'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['customs_documents.view'] },
  POST: { requireAuth: true, requireFeatures: ['customs_documents.manage'] },
}

export async function GET(req: Request) {
  try {
    const ctx = await resolveCustomsDocumentsRouteContext(req)
    const url = new URL(req.url)
    const query = customsCaseListQuerySchema.parse(Object.fromEntries(url.searchParams))
    const filters: Record<string, unknown> = {
      tenantId: ctx.tenantId,
      organizationId: ctx.organizationId,
      deletedAt: null,
    }
    if (query.status) filters.status = query.status
    if (query.search) filters.reference = { $ilike: `%${escapeLikePattern(query.search)}%` }

    const [items, total] = await findAndCountWithDecryption(
      ctx.em,
      CustomsCase,
      filters,
      {
        limit: query.pageSize,
        offset: (query.page - 1) * query.pageSize,
        orderBy: { createdAt: 'desc' },
      },
      ctx.scope,
    )

    return NextResponse.json({
      items: items.map(serializeCustomsCase),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    })
  } catch (error) {
    return handleCustomsDocumentsRouteError(error, 'cases.list')
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await resolveCustomsDocumentsRouteContext(req)
    const body = await readJsonSafe<Record<string, unknown>>(req, {})
    const input = customsCaseCreateSchema.parse({
      ...(body ?? {}),
      tenantId: ctx.tenantId,
      organizationId: ctx.organizationId,
    })
    const guardResult = await validateCrudMutationGuard(ctx.container, {
      tenantId: ctx.tenantId,
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      resourceKind: 'customs_documents.case',
      resourceId: input.reference ?? 'new',
      operation: 'create',
      requestMethod: req.method,
      requestHeaders: req.headers,
      mutationPayload: input,
    })
    if (guardResult && !guardResult.ok) {
      return NextResponse.json(guardResult.body, { status: guardResult.status })
    }
    const commandBus = ctx.container.resolve('commandBus') as CommandBus
    const { result } = await commandBus.execute<CustomsCaseCreateInput, { caseId: string }>('customs_documents.cases.create', {
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
        resourceId: result.caseId,
        operation: 'create',
        requestMethod: req.method,
        requestHeaders: req.headers,
        metadata: guardResult.metadata ?? null,
      })
    }

    return NextResponse.json({ id: result.caseId }, { status: 201 })
  } catch (error) {
    return handleCustomsDocumentsRouteError(error, 'cases.create')
  }
}

export const openApi: OpenApiRouteDoc = createCustomsDocumentsOpenApi({
  GET: {
    summary: 'List customs cases',
    query: customsCaseListQuerySchema,
    responses: [
      { status: 200, description: 'Paginated customs cases', schema: customsCaseListResponseSchema },
    ],
    errors: [
      { status: 401, description: 'Authentication required', schema: errorResponseSchema },
    ],
  },
  POST: {
    summary: 'Create a customs case',
    requestBody: { schema: customsCaseCreateSchema.omit({ tenantId: true, organizationId: true }) },
    responses: [
      { status: 201, description: 'Customs case created', schema: customsCaseCreateResponseSchema },
    ],
    errors: [
      { status: 400, description: 'Validation failed', schema: errorResponseSchema },
      { status: 401, description: 'Authentication required', schema: errorResponseSchema },
      { status: 403, description: 'Forbidden', schema: errorResponseSchema },
    ],
  },
})
