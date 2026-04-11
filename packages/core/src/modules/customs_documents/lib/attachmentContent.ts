import { Attachment } from '@open-mercato/core/modules/attachments/data/entities'
import { resolveAttachmentAbsolutePath } from '@open-mercato/core/modules/attachments/lib/storage'
import { extractAttachmentContent } from '@open-mercato/core/modules/attachments/lib/textExtraction'

export async function ensureAttachmentContent(attachment: Attachment): Promise<string | null> {
  if (attachment.content?.trim()) return attachment.content
  if (!attachment.storagePath) return attachment.content ?? null

  try {
    const extractedContent = await extractAttachmentContent({
      filePath: resolveAttachmentAbsolutePath(attachment.partitionCode, attachment.storagePath, attachment.storageDriver),
      mimeType: attachment.mimeType,
    })
    if (extractedContent?.trim()) {
      attachment.content = extractedContent
      return extractedContent
    }
  } catch (error) {
    console.error('[customs_documents] failed to extract attachment content', error)
  }

  return attachment.content ?? null
}
