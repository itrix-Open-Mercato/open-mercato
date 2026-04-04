import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import type { EntityManager } from '@mikro-orm/postgresql'
import { CustomerEntity, CustomerCompanyProfile } from '../../../data/entities'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['customers.leads.view'] },
}

const duplicateCheckSchema = z.object({
  email: z.string().trim().email().optional(),
  phone: z.string().trim().max(50).optional(),
  vatId: z.string().trim().max(50).optional(),
})

async function buildContext(req: Request): Promise<{ ctx: CommandRuntimeContext; organizationId: string | null; tenantId: string | null }> {
  const container = await createRequestContainer()
  const auth = await getAuthFromRequest(req)
  const { translate } = await resolveTranslations()
  if (!auth) throw new CrudHttpError(401, { error: translate('customers.errors.unauthorized', 'Unauthorized') })
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const ctx: CommandRuntimeContext = {
    container,
    auth,
    organizationScope: scope,
    selectedOrganizationId: scope?.selectedId ?? auth.orgId ?? null,
    organizationIds: scope?.filterIds ?? (auth.orgId ? [auth.orgId] : null),
    request: req,
  }
  return { ctx, organizationId: scope?.selectedId ?? auth.orgId ?? null, tenantId: auth.tenantId ?? null }
}

export async function POST(req: Request) {
  try {
    const { ctx, organizationId, tenantId } = await buildContext(req)
    if (!organizationId || !tenantId) {
      return NextResponse.json({ error: 'Organization and tenant context required' }, { status: 400 })
    }
    const body = await req.json().catch(() => ({}))
    const parsed = duplicateCheckSchema.parse(body)

    if (!parsed.email && !parsed.phone && !parsed.vatId) {
      return NextResponse.json({ matches: [], confidence: 'none' })
    }

    const em = ctx.container.resolve('em') as EntityManager
    const orConditions: Record<string, unknown>[] = []

    if (parsed.email) orConditions.push({ primaryEmail: parsed.email, organizationId, tenantId, deletedAt: null })
    if (parsed.phone) orConditions.push({ primaryPhone: parsed.phone, organizationId, tenantId, deletedAt: null })

    const entities = orConditions.length
      ? await em.find(CustomerEntity, { $or: orConditions }, { limit: 10 })
      : []

    let vatMatches: CustomerCompanyProfile[] = []
    if (parsed.vatId) {
      const companies = await em.find(
        CustomerCompanyProfile,
        { entity: { organizationId, tenantId, deletedAt: null } },
        { populate: ['entity'], limit: 10 }
      )
      vatMatches = companies
    }

    const matches = [
      ...entities.map((e) => ({
        id: e.id,
        kind: e.kind,
        displayName: e.displayName,
        primaryEmail: e.primaryEmail ?? null,
        primaryPhone: e.primaryPhone ?? null,
        matchedOn: [
          parsed.email && e.primaryEmail === parsed.email ? 'email' : null,
          parsed.phone && e.primaryPhone === parsed.phone ? 'phone' : null,
        ].filter(Boolean),
      })),
      ...vatMatches.map((c) => {
        const entity = typeof c.entity === 'object' ? c.entity : null
        return {
          id: entity && 'id' in entity ? (entity as { id: string }).id : '',
          kind: 'company' as const,
          displayName: entity && 'displayName' in entity ? (entity as { displayName: string }).displayName : '',
          primaryEmail: null,
          primaryPhone: null,
          matchedOn: ['vatId'],
        }
      }),
    ]

    const confidence = matches.length === 0 ? 'none' : matches.length === 1 ? 'low' : 'high'
    return NextResponse.json({ matches, confidence })
  } catch (err) {
    if (err instanceof CrudHttpError) return NextResponse.json(err.body, { status: err.status })
    console.error('customers.leads.duplicate-check POST failed', err)
    return NextResponse.json({ error: 'Failed to check duplicates' }, { status: 400 })
  }
}

const matchSchema = z.object({
  id: z.string().uuid(),
  kind: z.string(),
  displayName: z.string(),
  primaryEmail: z.string().nullable(),
  primaryPhone: z.string().nullable(),
  matchedOn: z.array(z.string()),
})

export const openApi: OpenApiRouteDoc = {
  tag: 'Customers',
  summary: 'Lead duplicate check',
  methods: {
    POST: {
      summary: 'Check for duplicates',
      description: 'Searches existing people and companies by email, phone, or VAT ID and returns confidence-bucketed matches.',
      requestBody: { contentType: 'application/json', schema: duplicateCheckSchema },
      responses: [
        {
          status: 200,
          description: 'Duplicate check result',
          schema: z.object({ matches: z.array(matchSchema), confidence: z.enum(['none', 'low', 'high']) }),
        },
      ],
      errors: [{ status: 400, description: 'Validation failed', schema: z.object({ error: z.string() }) }],
    },
  },
}
