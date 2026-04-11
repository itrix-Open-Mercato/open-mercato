import type { EntityManager } from '@mikro-orm/postgresql'
import { randomUUID } from 'node:crypto'
import { registerCommand, type CommandHandler } from '@open-mercato/shared/lib/commands'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { findOneWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { Attachment } from '@open-mercato/core/modules/attachments/data/entities'
import {
  CustomsCase,
  CustomsConsistencyCheck,
  CustomsDocument,
  CustomsHsCandidate,
  CustomsLineItem,
  type CustomsConsistencyStatus,
} from '../data/entities'
import { customsCaseProcessSchema, type CustomsCaseProcessInput } from '../data/validators'
import { buildConsistencyChecks, extractCustomsFields, type CustomsDocumentFacts } from '../lib/extraction'
import { buildHsCandidateDrafts } from '../lib/hsCandidates'
import { emitCustomsDocumentsEvent } from '../events'
import { ensureAttachmentContent } from '../lib/attachmentContent'

type ProcessCaseResult = {
  caseId: string
  documentCount: number
  parsedDocumentCount: number
  checkIds: string[]
  lineItemIds: string[]
  candidateIds: string[]
}

function hasBlockingFinding(status: CustomsConsistencyStatus): boolean {
  return status === 'fail' || status === 'missing_source'
}

function formatDecimal(value: number | null): string | null {
  return value === null ? null : String(value)
}

function selectBestFact(facts: CustomsDocumentFacts[]): CustomsDocumentFacts {
  return facts.find((fact) => fact.kind === 'commercial_invoice' && fact.productDescription)
    ?? facts.find((fact) => fact.productDescription)
    ?? facts[0]
}

const processCaseCommand: CommandHandler<CustomsCaseProcessInput, ProcessCaseResult> = {
  id: 'customs_documents.cases.process',
  async execute(rawInput, ctx) {
    const input = customsCaseProcessSchema.parse(rawInput)
    if (ctx.auth?.tenantId && ctx.auth.tenantId !== input.tenantId) {
      throw new CrudHttpError(403, { error: 'Tenant scope mismatch' })
    }
    if (ctx.selectedOrganizationId && ctx.selectedOrganizationId !== input.organizationId) {
      throw new CrudHttpError(403, { error: 'Organization scope mismatch' })
    }

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const scope = { tenantId: input.tenantId, organizationId: input.organizationId }
    const customsCase = await findOneWithDecryption(
      em,
      CustomsCase,
      {
        id: input.caseId,
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

    const documents = await findWithDecryption(
      em,
      CustomsDocument,
      {
        caseId: input.caseId,
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        deletedAt: null,
      },
      { orderBy: { createdAt: 'asc' } },
      scope,
    )
    if (!documents.length) {
      throw new CrudHttpError(400, { error: 'No customs documents attached to this case' })
    }

    const facts: CustomsDocumentFacts[] = []
    for (const document of documents) {
      if (!document.contentText?.trim()) {
        const attachment = await findOneWithDecryption(
          em,
          Attachment,
          {
            id: document.attachmentId,
            tenantId: input.tenantId,
            organizationId: input.organizationId,
          },
          undefined,
          scope,
        )
        if (attachment) {
          document.contentText = await ensureAttachmentContent(attachment)
        }
      }
      const extracted = extractCustomsFields(document.kind, document.contentText)
      document.extractedFieldsJson = extracted
      document.status = document.contentText && document.contentText.trim().length > 0 ? 'parsed' : 'needs_review'
      facts.push({
        documentId: document.id,
        kind: document.kind,
        ...extracted,
      })
    }
    const oldChecks = await findWithDecryption(
      em,
      CustomsConsistencyCheck,
      {
        caseId: input.caseId,
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        deletedAt: null,
      },
      {},
      scope,
    )
    for (const check of oldChecks) {
      check.deletedAt = new Date()
    }
    const oldLineItems = await findWithDecryption(
      em,
      CustomsLineItem,
      {
        caseId: input.caseId,
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        deletedAt: null,
      },
      {},
      scope,
    )
    const oldLineItemIds = oldLineItems.map((item) => item.id)
    for (const lineItem of oldLineItems) {
      lineItem.deletedAt = new Date()
    }
    if (oldLineItemIds.length) {
      const oldCandidates = await findWithDecryption(
        em,
        CustomsHsCandidate,
        {
          lineItemId: { $in: oldLineItemIds },
          tenantId: input.tenantId,
          organizationId: input.organizationId,
          deletedAt: null,
        },
        {},
        scope,
      )
      for (const candidate of oldCandidates) {
        candidate.deletedAt = new Date()
      }
    }

    const drafts = buildConsistencyChecks(facts)
    const checks = drafts.map((draft) => em.create(CustomsConsistencyCheck, {
      id: randomUUID(),
      caseId: input.caseId,
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      field: draft.field,
      sourceA: draft.sourceA,
      sourceB: draft.sourceB,
      valueA: draft.valueA,
      valueB: draft.valueB,
      status: draft.status,
      message: draft.message,
      evidenceJson: draft.evidenceJson,
    }))
    checks.forEach((check) => em.persist(check))
    const bestFact = selectBestFact(facts)
    const lineItem = em.create(CustomsLineItem, {
      id: randomUUID(),
      caseId: input.caseId,
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      description: bestFact.productDescription ?? 'Unspecified goods',
      quantity: formatDecimal(bestFact.quantity),
      grossWeightKg: formatDecimal(bestFact.grossWeightKg),
      netWeightKg: formatDecimal(bestFact.netWeightKg),
      invoiceHsCode: bestFact.invoiceHsCode,
      status: 'candidates_ready',
      sourceJson: {
        documentId: bestFact.documentId,
        documentKind: bestFact.kind,
        facts,
      },
    })
    em.persist(lineItem)
    const candidateDrafts = buildHsCandidateDrafts(lineItem)
    const candidates = candidateDrafts.map((draft) => em.create(CustomsHsCandidate, {
      id: randomUUID(),
      caseId: input.caseId,
      lineItemId: lineItem.id,
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      hsCode: draft.hsCode,
      description: draft.description,
      score: String(draft.score),
      explanation: draft.explanation,
      sourceBreakdownJson: draft.sourceBreakdown,
    }))
    candidates.forEach((candidate) => em.persist(candidate))

    const parsedDocumentCount = documents.filter((document) => document.status === 'parsed').length
    customsCase.status = checks.some((check) => hasBlockingFinding(check.status)) ? 'review_required' : 'processing'
    await em.flush()

    await Promise.all([
      ...documents.map((document) =>
        emitCustomsDocumentsEvent('customs_documents.document.parsed', {
          id: document.id,
          caseId: input.caseId,
          tenantId: input.tenantId,
          organizationId: input.organizationId,
          status: document.status,
        }, { persistent: true }),
      ),
      emitCustomsDocumentsEvent('customs_documents.case.consistency_checked', {
        id: input.caseId,
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        checkCount: checks.length,
        blockingFindingCount: checks.filter((check) => hasBlockingFinding(check.status)).length,
      }, { persistent: true }),
      emitCustomsDocumentsEvent('customs_documents.line_item.candidates_retrieved', {
        id: lineItem.id,
        caseId: input.caseId,
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        candidateCount: candidates.length,
      }, { persistent: true }),
    ])

    return {
      caseId: input.caseId,
      documentCount: documents.length,
      parsedDocumentCount,
      checkIds: checks.map((check) => check.id),
      lineItemIds: [lineItem.id],
      candidateIds: candidates.map((candidate) => candidate.id),
    }
  },
  buildLog: ({ input, result }) => ({
    actionLabel: 'Process customs case documents',
    resourceKind: 'customs_documents.case',
    resourceId: input.caseId,
    tenantId: input.tenantId,
    organizationId: input.organizationId,
    snapshotAfter: {
      caseId: result.caseId,
      documentCount: result.documentCount,
      parsedDocumentCount: result.parsedDocumentCount,
      checkIds: result.checkIds,
      lineItemIds: result.lineItemIds,
      candidateIds: result.candidateIds,
    },
  }),
}

registerCommand(processCaseCommand)
