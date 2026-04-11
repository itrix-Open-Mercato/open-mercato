import type { EntityManager } from '@mikro-orm/postgresql'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveRequestContext } from '@open-mercato/shared/lib/api/context'
import { isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { CustomsCase, CustomsConsistencyCheck, CustomsDocument, CustomsHsCandidate, CustomsHsDecision, CustomsLineItem } from '../data/entities'
import {
  customsCaseResponseSchema,
  customsConsistencyCheckResponseSchema,
  customsDocumentResponseSchema,
  customsHsDecisionResponseSchema,
  customsHsCandidateResponseSchema,
  customsLineItemResponseSchema,
} from '../data/validators'

export type CustomsDocumentsRouteContext = {
  auth: NonNullable<Awaited<ReturnType<typeof resolveRequestContext>>['ctx']['auth']>
  container: Awaited<ReturnType<typeof resolveRequestContext>>['ctx']['container']
  em: EntityManager
  tenantId: string
  organizationId: string
  userId: string
  scope: { tenantId: string; organizationId: string }
}

export async function resolveCustomsDocumentsRouteContext(req: Request): Promise<CustomsDocumentsRouteContext> {
  const { ctx } = await resolveRequestContext(req)
  const auth = ctx.auth
  const tenantId = auth?.tenantId ?? null
  const organizationId = auth?.orgId ?? null
  const userId = auth?.sub ?? auth?.userId ?? auth?.keyId ?? null
  if (!auth || !tenantId || !organizationId || !userId) {
    throw new UnauthorizedError()
  }

  return {
    auth,
    container: ctx.container,
    em: (ctx.container.resolve('em') as EntityManager).fork(),
    tenantId,
    organizationId,
    userId,
    scope: { tenantId, organizationId },
  }
}

export function serializeCustomsCase(customsCase: CustomsCase): z.infer<typeof customsCaseResponseSchema> {
  return {
    id: customsCase.id,
    reference: customsCase.reference,
    status: customsCase.status,
    sourceCountry: customsCase.sourceCountry ?? null,
    destinationCountry: customsCase.destinationCountry ?? null,
    currency: customsCase.currency ?? null,
    finalConfidence: customsCase.finalConfidence ?? null,
    createdAt: customsCase.createdAt.toISOString(),
    updatedAt: customsCase.updatedAt.toISOString(),
  }
}

export function serializeCustomsDocument(customsDocument: CustomsDocument): z.infer<typeof customsDocumentResponseSchema> {
  const contentText = customsDocument.contentText ?? null
  return {
    id: customsDocument.id,
    caseId: customsDocument.caseId,
    attachmentId: customsDocument.attachmentId,
    kind: customsDocument.kind,
    status: customsDocument.status,
    fileName: customsDocument.fileName ?? null,
    mimeType: customsDocument.mimeType ?? null,
    hasContent: typeof contentText === 'string' && contentText.trim().length > 0,
    contentPreview: contentText ? contentText.slice(0, 500) : null,
    createdAt: customsDocument.createdAt.toISOString(),
    updatedAt: customsDocument.updatedAt.toISOString(),
  }
}

export function serializeConsistencyCheck(
  check: CustomsConsistencyCheck,
): z.infer<typeof customsConsistencyCheckResponseSchema> {
  return {
    id: check.id,
    caseId: check.caseId,
    field: check.field,
    sourceA: check.sourceA,
    sourceB: check.sourceB,
    valueA: check.valueA ?? null,
    valueB: check.valueB ?? null,
    status: check.status,
    message: check.message ?? null,
    createdAt: check.createdAt.toISOString(),
  }
}

export function serializeLineItem(
  lineItem: CustomsLineItem,
  selectedDecision?: CustomsHsDecision | null,
): z.infer<typeof customsLineItemResponseSchema> {
  return {
    id: lineItem.id,
    caseId: lineItem.caseId,
    description: lineItem.description,
    quantity: lineItem.quantity ?? null,
    grossWeightKg: lineItem.grossWeightKg ?? null,
    netWeightKg: lineItem.netWeightKg ?? null,
    invoiceHsCode: lineItem.invoiceHsCode ?? null,
    status: lineItem.status,
    selectedDecision: selectedDecision ? serializeHsDecision(selectedDecision) : null,
    createdAt: lineItem.createdAt.toISOString(),
    updatedAt: lineItem.updatedAt.toISOString(),
  }
}

export function serializeHsCandidate(candidate: CustomsHsCandidate): z.infer<typeof customsHsCandidateResponseSchema> {
  return {
    id: candidate.id,
    lineItemId: candidate.lineItemId,
    hsCode: candidate.hsCode,
    description: candidate.description,
    score: candidate.score,
    explanation: candidate.explanation,
    sourceBreakdown: candidate.sourceBreakdownJson ?? null,
    createdAt: candidate.createdAt.toISOString(),
  }
}

export function serializeHsDecision(decision: CustomsHsDecision): z.infer<typeof customsHsDecisionResponseSchema> {
  return {
    id: decision.id,
    lineItemId: decision.lineItemId,
    caseId: decision.caseId,
    candidateId: decision.candidateId ?? null,
    selectedHsCode: decision.selectedHsCode,
    selectedDescription: decision.selectedDescription ?? null,
    confidenceScore: decision.confidenceScore ?? null,
    confidenceBand: decision.confidenceBand,
    note: decision.note ?? null,
    createdAt: decision.createdAt.toISOString(),
  }
}

export function handleCustomsDocumentsRouteError(error: unknown, label: string): Response {
  if (error instanceof UnauthorizedError) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (isCrudHttpError(error)) {
    return NextResponse.json(error.body, { status: error.status })
  }
  if (error instanceof z.ZodError) {
    return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
  }
  console.error(`[customs_documents:${label}] failed`, error)
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
}

export class UnauthorizedError extends Error {
  constructor() {
    super('Unauthorized')
  }
}
