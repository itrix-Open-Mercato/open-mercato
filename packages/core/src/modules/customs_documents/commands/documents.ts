import type { EntityManager } from '@mikro-orm/postgresql'
import { registerCommand, type CommandHandler } from '@open-mercato/shared/lib/commands'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { Attachment } from '@open-mercato/core/modules/attachments/data/entities'
import { CustomsCase, CustomsDocument, type CustomsDocumentStatus } from '../data/entities'
import { customsDocumentsAttachSchema, type CustomsDocumentsAttachInput } from '../data/validators'
import { emitCustomsDocumentsEvent } from '../events'
import { ensureAttachmentContent } from '../lib/attachmentContent'

type AttachDocumentsResult = {
  documentIds: string[]
}

function resolveDocumentStatus(contentText: string | null | undefined): CustomsDocumentStatus {
  return contentText && contentText.trim().length > 0 ? 'text_extracted' : 'needs_review'
}

const attachDocumentsCommand: CommandHandler<CustomsDocumentsAttachInput, AttachDocumentsResult> = {
  id: 'customs_documents.documents.attach',
  async execute(rawInput, ctx) {
    const input = customsDocumentsAttachSchema.parse(rawInput)
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

    const documentIds: string[] = []
    for (const item of input.documents) {
      const attachment = await findOneWithDecryption(
        em,
        Attachment,
        {
          id: item.attachmentId,
          tenantId: input.tenantId,
          organizationId: input.organizationId,
        },
        undefined,
        scope,
      )
      if (!attachment) {
        throw new CrudHttpError(404, { error: `Attachment not found: ${item.attachmentId}` })
      }

      const existing = await findOneWithDecryption(
        em,
        CustomsDocument,
        {
          caseId: input.caseId,
          attachmentId: item.attachmentId,
          tenantId: input.tenantId,
          organizationId: input.organizationId,
          deletedAt: null,
        },
        undefined,
        scope,
      )
      const contentText = await ensureAttachmentContent(attachment)
      if (existing) {
        existing.kind = item.kind
        existing.fileName = attachment.fileName ?? existing.fileName ?? null
        existing.mimeType = attachment.mimeType ?? existing.mimeType ?? null
        existing.contentText = contentText ?? existing.contentText ?? null
        existing.status = resolveDocumentStatus(existing.contentText)
        documentIds.push(existing.id)
        continue
      }

      const document = em.create(CustomsDocument, {
        caseId: input.caseId,
        attachmentId: item.attachmentId,
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        kind: item.kind,
        fileName: attachment.fileName ?? null,
        mimeType: attachment.mimeType ?? null,
        contentText,
        status: resolveDocumentStatus(contentText),
        extractedFieldsJson: null,
      })
      em.persist(document)
      documentIds.push(document.id)
    }

    customsCase.status = 'uploaded'
    await em.flush()

    await Promise.all(documentIds.map((documentId) =>
      emitCustomsDocumentsEvent('customs_documents.document.uploaded', {
        id: documentId,
        caseId: input.caseId,
        tenantId: input.tenantId,
        organizationId: input.organizationId,
      }, { persistent: true }),
    ))

    return { documentIds }
  },
  buildLog: ({ input, result }) => ({
    actionLabel: 'Attach customs documents',
    resourceKind: 'customs_documents.document',
    resourceId: input.caseId,
    tenantId: input.tenantId,
    organizationId: input.organizationId,
    snapshotAfter: {
      caseId: input.caseId,
      documentIds: result.documentIds,
      kinds: input.documents.map((document) => document.kind),
    },
  }),
}

registerCommand(attachDocumentsCommand)
