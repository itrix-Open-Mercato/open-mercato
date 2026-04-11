import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { apiRequest, getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { login } from '@open-mercato/core/helpers/integration/auth'
import { readJsonSafe } from '@open-mercato/core/helpers/integration/generalFixtures'
import {
  createTyresDemoDocuments,
  deleteCustomsDemoFixture,
} from '@open-mercato/core/helpers/integration/customsDocumentsFixtures'

type DocumentListResponse = {
  items?: Array<{ attachmentId?: unknown }>
}

type CasesResponse = {
  items?: Array<{ id?: unknown; reference?: unknown; status?: unknown }>
  totalPages?: unknown
}

function escapePdfText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

function buildTextPdf(lines: string[]): Buffer {
  const objects: string[] = []
  const content = [
    'BT',
    '/F1 12 Tf',
    '72 720 Td',
    ...lines.map((line, index) => `${index === 0 ? '' : 'T* '}${`(${escapePdfText(line)}) Tj`}`),
    'ET',
  ].join('\n')

  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n')
  objects.push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n')
  objects.push('3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n')
  objects.push('4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n')
  objects.push(`5 0 obj\n<< /Length ${Buffer.byteLength(content, 'utf8')} >>\nstream\n${content}\nendstream\nendobj\n`)

  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'))
    pdf += object
  }
  const xrefOffset = Buffer.byteLength(pdf, 'utf8')
  pdf += `xref\n0 ${objects.length + 1}\n`
  pdf += '0000000000 65535 f \n'
  for (const offset of offsets.slice(1)) {
    pdf += `${offset.toString().padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`

  return Buffer.from(pdf, 'utf8')
}

async function createPdfFolderFixture(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'open-logistiko-batch-'))
  const documents = createTyresDemoDocuments()
  for (const setNumber of [1, 2]) {
    for (const document of documents) {
      const fileName = document.fileName.replace('_Demo.pdf', `_Set_${setNumber}.pdf`)
      const filePath = join(dir, fileName)
      await writeFile(filePath, buildTextPdf(document.content.split('\n')))
    }
  }
  return dir
}

async function readCaseAttachmentIds(request: Parameters<typeof apiRequest>[0], token: string, caseId: string): Promise<string[]> {
  const response = await apiRequest(request, 'GET', `/api/customs_documents/cases/${caseId}/documents`, { token })
  const body = await readJsonSafe<DocumentListResponse>(response)
  return (body?.items ?? [])
    .map((item) => item.attachmentId)
    .filter((value): value is string => typeof value === 'string')
}

function parseBatchReferenceTime(reference: string): number | null {
  const match = /-(\d+)$/.exec(reference)
  if (!match) return null
  const timestamp = Number.parseInt(match[1], 10)
  return Number.isFinite(timestamp) ? timestamp : null
}

async function readBatchCasesPage(
  request: Parameters<typeof apiRequest>[0],
  token: string,
  page: number,
): Promise<{ items: Array<{ id: string; reference: string; status: string }>; totalPages: number }> {
  const response = await apiRequest(request, 'GET', `/api/customs_documents/cases?search=BATCH-SET_&page=${page}&pageSize=100`, { token })
  const body = await readJsonSafe<CasesResponse>(response)
  const items = (body?.items ?? []).flatMap((item) => {
    if (typeof item.id !== 'string' || typeof item.reference !== 'string' || typeof item.status !== 'string') return []
    return [{ id: item.id, reference: item.reference, status: item.status }]
  })
  return {
    items,
    totalPages: typeof body?.totalPages === 'number' && Number.isFinite(body.totalPages) ? body.totalPages : 1,
  }
}

async function readBatchCases(request: Parameters<typeof apiRequest>[0], token: string): Promise<Array<{ id: string; reference: string; status: string }>> {
  const firstPage = await readBatchCasesPage(request, token, 1)
  const items = [...firstPage.items]
  for (let page = 2; page <= firstPage.totalPages; page += 1) {
    const nextPage = await readBatchCasesPage(request, token, page)
    items.push(...nextPage.items)
  }
  return items
}

/**
 * TC-CUSTDOC-005: Customs Documents batch folder processing
 * Covers: folder-style multi-file upload, filename-based set grouping, attach, process, and candidate generation per group.
 */
test.describe('TC-CUSTDOC-005: Customs Documents batch folder processing', () => {
  test('should group a folder by set suffix and process one case per complete group', async ({ page, request }) => {
    test.slow()

    let token: string | null = null
    const createdCaseIds: string[] = []
    const attachmentIds: string[] = []
    let batchStartedAt = 0
    let importedCases: Array<{ id: string; reference: string; status: string }> = []

    try {
      token = await getAuthToken(request, 'admin')
      const pdfFolderPath = await createPdfFolderFixture()

      await login(page, 'admin')
      await page.goto('/backend/customs-documents', { waitUntil: 'domcontentloaded' })

      await page.locator('#customs-batch-folder').setInputFiles(pdfFolderPath)
      await expect(page.getByText('Complete groups: 2/2')).toBeVisible()
      await expect(page.getByText('set_01')).toBeVisible()
      await expect(page.getByText('set_02')).toBeVisible()
      await expect(page.getByText('Bill_of_Lading_Set_1.pdf')).toBeVisible()
      await expect(page.getByText('Commercial_Invoice_Set_1.pdf')).toBeVisible()
      await expect(page.getByText('Packing_List_Set_1.pdf')).toBeVisible()
      await expect(page.getByText('Bill_of_Lading_Set_2.pdf')).toBeVisible()
      batchStartedAt = Date.now()
      await page.getByRole('button', { name: 'Create grouped cases and process' }).click()

      await expect.poll(async () => {
        const cases = await readBatchCases(request, token)
        importedCases = cases.filter((item) => {
          if (!item.reference.startsWith('BATCH-SET_')) return false
          const referenceTime = parseBatchReferenceTime(item.reference)
          return referenceTime !== null && referenceTime >= batchStartedAt
        })
        return importedCases.length === 2 && importedCases.every((customsCase) => customsCase.status === 'review_required')
      }, {
        message: 'Batch folder upload should create and process one customs case per set',
        timeout: 60_000,
      }).toBe(true)

      await expect(page.getByText(/BATCH-SET_01-/).first()).toBeVisible()
      await expect(page.getByText(/BATCH-SET_02-/).first()).toBeVisible()
      expect(importedCases.length, 'Batch folder upload should create one customs case per set').toBe(2)
      for (const customsCase of importedCases) {
        createdCaseIds.push(customsCase.id)
        attachmentIds.push(...await readCaseAttachmentIds(request, token, customsCase.id))
        expect(customsCase.status, `Batch case ${customsCase.reference} should be processed`).toBe('review_required')
      }
      expect(attachmentIds.length, 'Two complete sets should create six attachments').toBe(6)
    } finally {
      if (token && batchStartedAt > 0 && createdCaseIds.length === 0) {
        const cases = await readBatchCases(request, token)
        importedCases = cases.filter((item) => {
          const referenceTime = parseBatchReferenceTime(item.reference)
          return referenceTime !== null && referenceTime >= batchStartedAt
        })
        for (const customsCase of importedCases) {
          createdCaseIds.push(customsCase.id)
          attachmentIds.push(...await readCaseAttachmentIds(request, token, customsCase.id))
        }
      }
      for (const caseId of createdCaseIds) {
        await deleteCustomsDemoFixture(request, token, caseId, [])
      }
      for (const attachmentId of attachmentIds) {
        await deleteCustomsDemoFixture(request, token, null, [attachmentId])
      }
    }
  })
})
