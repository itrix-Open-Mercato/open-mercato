import type { EntityManager } from '@mikro-orm/postgresql'
import { registerCommand, type CommandHandler } from '@open-mercato/shared/lib/commands'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { findOneWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import {
  CustomsCase,
  CustomsHsCandidate,
  CustomsHsDecision,
  CustomsLineItem,
  type CustomsHsDecisionConfidenceBand,
} from '../data/entities'
import { customsHsSelectSchema, type CustomsHsSelectInput } from '../data/validators'
import { emitCustomsDocumentsEvent } from '../events'
import { normalizeHsCode } from '../lib/hsCandidates'

type SelectHsResult = {
  decisionId: string
  caseId: string
  lineItemId: string
  hsCode: string
  confidenceBand: CustomsHsDecisionConfidenceBand
}

function resolveConfidenceBand(score: number | null): CustomsHsDecisionConfidenceBand {
  if (score === null) return 'low'
  if (score >= 75) return 'high'
  if (score >= 40) return 'medium'
  return 'low'
}

function parseScore(score: string | null | undefined): number | null {
  if (!score) return null
  const parsed = Number(score)
  return Number.isFinite(parsed) ? parsed : null
}

const selectHsCommand: CommandHandler<CustomsHsSelectInput, SelectHsResult> = {
  id: 'customs_documents.line_items.select_hs',
  async execute(rawInput, ctx) {
    const input = customsHsSelectSchema.parse(rawInput)
    if (ctx.auth?.tenantId && ctx.auth.tenantId !== input.tenantId) {
      throw new CrudHttpError(403, { error: 'Tenant scope mismatch' })
    }
    if (ctx.selectedOrganizationId && ctx.selectedOrganizationId !== input.organizationId) {
      throw new CrudHttpError(403, { error: 'Organization scope mismatch' })
    }

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const scope = { tenantId: input.tenantId, organizationId: input.organizationId }
    const lineItem = await findOneWithDecryption(
      em,
      CustomsLineItem,
      {
        id: input.lineItemId,
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        deletedAt: null,
      },
      undefined,
      scope,
    )
    if (!lineItem) {
      throw new CrudHttpError(404, { error: 'Line item not found' })
    }

    const customsCase = await findOneWithDecryption(
      em,
      CustomsCase,
      {
        id: lineItem.caseId,
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        deletedAt: null,
      },
      undefined,
      scope,
    )
    if (!customsCase) {
      throw new CrudHttpError(404, { error: 'Customs case not found' })
    }

    const candidate = input.candidateId
      ? await findOneWithDecryption(
          em,
          CustomsHsCandidate,
          {
            id: input.candidateId,
            lineItemId: lineItem.id,
            tenantId: input.tenantId,
            organizationId: input.organizationId,
            deletedAt: null,
          },
          undefined,
          scope,
        )
      : null
    if (input.candidateId && !candidate) {
      throw new CrudHttpError(404, { error: 'HS candidate not found' })
    }

    const selectedHsCode = normalizeHsCode(candidate?.hsCode ?? input.hsCode ?? '')
    const confidenceScore = parseScore(candidate?.score)
    const confidenceBand = resolveConfidenceBand(confidenceScore)
    const existingDecisions = await findWithDecryption(
      em,
      CustomsHsDecision,
      {
        lineItemId: lineItem.id,
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        deletedAt: null,
      },
      {},
      scope,
    )
    for (const existingDecision of existingDecisions) {
      existingDecision.deletedAt = new Date()
    }

    const decision = em.create(CustomsHsDecision, {
      lineItemId: lineItem.id,
      caseId: lineItem.caseId,
      candidateId: candidate?.id ?? null,
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      selectedHsCode,
      selectedDescription: candidate?.description ?? input.description ?? null,
      confidenceScore: confidenceScore === null ? null : String(confidenceScore),
      confidenceBand,
      note: input.note ?? null,
      selectedByUserId: ctx.auth?.sub ?? ctx.auth?.userId ?? ctx.auth?.keyId ?? null,
      evidenceJson: {
        source: candidate ? 'candidate' : 'manual',
        candidate: candidate
          ? {
              id: candidate.id,
              hsCode: candidate.hsCode,
              score: candidate.score,
              explanation: candidate.explanation,
              sourceBreakdown: candidate.sourceBreakdownJson ?? null,
            }
          : null,
      },
    })
    em.persist(decision)
    lineItem.status = 'classified'

    const openLineItems = await findWithDecryption(
      em,
      CustomsLineItem,
      {
        caseId: lineItem.caseId,
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        deletedAt: null,
      },
      {},
      scope,
    )
    const allLineItemsClassified = openLineItems.every((item) => item.id === lineItem.id || item.status === 'classified')
    if (allLineItemsClassified) {
      customsCase.status = 'classified'
      customsCase.finalConfidence = confidenceScore === null ? null : String(confidenceScore)
    }

    await em.flush()
    await emitCustomsDocumentsEvent('customs_documents.line_item.hs_selected', {
      id: lineItem.id,
      caseId: lineItem.caseId,
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      decisionId: decision.id,
      hsCode: selectedHsCode,
      confidenceBand,
    }, { persistent: true })

    return {
      decisionId: decision.id,
      caseId: lineItem.caseId,
      lineItemId: lineItem.id,
      hsCode: selectedHsCode,
      confidenceBand,
    }
  },
  buildLog: ({ input, result }) => ({
    actionLabel: 'Select customs HS code',
    resourceKind: 'customs_documents.line_item',
    resourceId: input.lineItemId,
    tenantId: input.tenantId,
    organizationId: input.organizationId,
    snapshotAfter: {
      caseId: result.caseId,
      lineItemId: result.lineItemId,
      decisionId: result.decisionId,
      hsCode: result.hsCode,
      confidenceBand: result.confidenceBand,
    },
  }),
}

registerCommand(selectHsCommand)
