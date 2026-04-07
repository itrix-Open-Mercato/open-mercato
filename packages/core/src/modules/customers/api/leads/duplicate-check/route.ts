import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { CustomerEntity } from '../../../data/entities'
import { customerLeadDuplicateCheckSchema } from '../../../data/validators'
import { buildLeadWorkflowContext } from '../_workflow'
import { withScopedPayload } from '../../utils'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'

type DuplicateMatch = {
  id: string
  kind: 'person' | 'company'
  displayName: string
  primaryEmail?: string | null
  primaryPhone?: string | null
  vatId?: string | null
  confidence: 'exact'
  matchedFields: string[]
}

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['customers.leads.view'] },
}

function normalizeString(input: string | null | undefined): string | null {
  const trimmed = typeof input === 'string' ? input.trim() : ''
  return trimmed ? trimmed : null
}

function buildEntityMatch(
  entity: CustomerEntity,
  matchedFields: string[],
  vatId?: string | null
): DuplicateMatch {
  return {
    id: entity.id,
    kind: entity.kind,
    displayName: entity.displayName,
    primaryEmail: entity.primaryEmail ?? null,
    primaryPhone: entity.primaryPhone ?? null,
    vatId: vatId ?? null,
    confidence: 'exact',
    matchedFields,
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await buildLeadWorkflowContext(req)
    const body = await req.json().catch(() => ({}))
    const { translate } = await resolveTranslations()
    const input = customerLeadDuplicateCheckSchema.parse(withScopedPayload(body, ctx, translate))
    const email = normalizeString(input.primaryEmail)?.toLowerCase() ?? null
    const phone = normalizeString(input.primaryPhone)
    const vatId = normalizeString(input.vatId)
    if (!email && !phone && !vatId) {
      return NextResponse.json({ people: [], companies: [], total: 0 })
    }

    const em = ctx.container.resolve('em') as EntityManager
    const matches = new Map<string, DuplicateMatch>()
    const baseWhere = {
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      deletedAt: null,
    }

    if (email || phone) {
      const or: Array<Record<string, unknown>> = []
      if (email) or.push({ primaryEmail: email })
      if (phone) or.push({ primaryPhone: phone })
      const entities = await em.find(CustomerEntity, { ...baseWhere, $or: or })
      for (const entity of entities) {
        const matchedFields: string[] = []
        if (email && entity.primaryEmail?.toLowerCase() === email) matchedFields.push('primaryEmail')
        if (phone && entity.primaryPhone === phone) matchedFields.push('primaryPhone')
        matches.set(entity.id, buildEntityMatch(entity, matchedFields))
      }
    }

    // Customer companies do not have a canonical VAT/tax-id field yet, so VAT
    // duplicate matching should wait for a proper company field/binding.

    const items = Array.from(matches.values())
    return NextResponse.json({
      people: items.filter((item) => item.kind === 'person'),
      companies: items.filter((item) => item.kind === 'company'),
      total: items.length,
    })
  } catch (err) {
    if (err instanceof CrudHttpError) {
      return NextResponse.json(err.body, { status: err.status })
    }
    console.error('customers.leads duplicate-check failed', err)
    return NextResponse.json({ error: 'Failed to check lead duplicates' }, { status: 500 })
  }
}

const duplicateMatchSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(['person', 'company']),
  displayName: z.string(),
  primaryEmail: z.string().nullable().optional(),
  primaryPhone: z.string().nullable().optional(),
  vatId: z.string().nullable().optional(),
  confidence: z.enum(['exact']),
  matchedFields: z.array(z.string()),
})

export const openApi: OpenApiRouteDoc = {
  tag: 'Customers',
  summary: 'Check lead duplicates',
  methods: {
    POST: {
      summary: 'Check lead duplicate candidates',
      requestBody: { contentType: 'application/json', schema: customerLeadDuplicateCheckSchema },
      responses: [{
        status: 200,
        description: 'Duplicate candidates',
        schema: z.object({
          people: z.array(duplicateMatchSchema),
          companies: z.array(duplicateMatchSchema),
          total: z.number(),
        }),
      }],
    },
  },
}
