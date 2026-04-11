import { expect, type APIRequestContext } from '@playwright/test'
import { Client } from 'pg'
import { apiRequest } from './api'
import { uploadAttachmentFixture, deleteAttachmentIfExists } from './attachmentsFixtures'
import { expectId, readJsonSafe } from './generalFixtures'

export type CustomsDemoDocumentKind = 'bill_of_lading' | 'commercial_invoice' | 'packing_list'

export type CustomsDemoDocumentInput = {
  kind: CustomsDemoDocumentKind
  fileName: string
  content: string
}

type CreateCaseResponse = {
  id?: unknown
}

type AttachDocumentsResponse = {
  ids?: unknown[]
  items?: Array<{ id?: unknown; hasContent?: unknown }>
}

export type ProcessCaseResponse = {
  documentCount?: unknown
  parsedDocumentCount?: unknown
  lineItems?: Array<{ id?: unknown; description?: unknown; status?: unknown; selectedDecision?: unknown }>
  consistencyChecks?: Array<{ field?: unknown; status?: unknown; valueA?: unknown; valueB?: unknown }>
}

export type LineItemListResponse = {
  items?: Array<{ id?: unknown; status?: unknown; selectedDecision?: { selectedHsCode?: unknown; confidenceBand?: unknown } | null }>
}

export type CandidateListResponse = {
  items?: Array<{ id?: unknown; hsCode?: unknown; score?: unknown }>
}

export type Isztar4EnrichResponse = {
  hsCode?: unknown
  source?: unknown
  summary?: unknown
  error?: unknown
}

export type HsDecisionResponse = {
  id?: unknown
  lineItemId?: unknown
  selectedHsCode?: unknown
  confidenceBand?: unknown
}

export const DEMO_ISZTAR4_DATE = '2026-04-10'

export function createTyresDemoDocuments(overrides: Partial<Record<CustomsDemoDocumentKind, string>> = {}): CustomsDemoDocumentInput[] {
  const base: Record<CustomsDemoDocumentKind, string> = {
    bill_of_lading: [
      'Bill of Lading No: BL-7788',
      'Shipper: Qingdao Rubber Ltd',
      'Consignee: Mercato Imports LLC',
      'Container No: MSKU1234567',
      'Description of Goods: industrial mining tyres',
      'Gross Weight: 12000 kg',
    ].join('\n'),
    commercial_invoice: [
      'Invoice No: INV-7788',
      'Seller: Qingdao Rubber Limited',
      'Buyer: Mercato Imports LLC',
      'Product Description: industrial mining tyres',
      'Quantity: 48 pcs',
      'HS Code: 4011800000',
      'Total: USD 32000',
    ].join('\n'),
    packing_list: [
      'Packing List No: PL-7788',
      'Description of Goods: industrial mining tyres',
      'Total Packages: 48 packages',
      'Gross Weight: 12000 kg',
      'Net Weight: 11500 kg',
    ].join('\n'),
  }

  return [
    {
      kind: 'bill_of_lading',
      fileName: 'Bill_of_Lading_Demo.pdf',
      content: overrides.bill_of_lading ?? base.bill_of_lading,
    },
    {
      kind: 'commercial_invoice',
      fileName: 'Commercial_Invoice_Demo.pdf',
      content: overrides.commercial_invoice ?? base.commercial_invoice,
    },
    {
      kind: 'packing_list',
      fileName: 'Packing_List_Demo.pdf',
      content: overrides.packing_list ?? base.packing_list,
    },
  ]
}

function resolveDatabaseUrl(): string {
  const value = process.env.DATABASE_URL?.trim()
  if (!value) throw new Error('DATABASE_URL is required for customs_documents integration fixtures.')
  return value
}

async function withPgClient<T>(task: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: resolveDatabaseUrl() })
  await client.connect()
  try {
    return await task(client)
  } finally {
    await client.end()
  }
}

export async function setAttachmentContentFixture(attachmentId: string, content: string): Promise<void> {
  await withPgClient(async (client) => {
    await client.query('update attachments set content = $1 where id = $2', [content, attachmentId])
  })
}

export async function deleteCustomsCaseRecordsIfExists(caseId: string | null): Promise<void> {
  if (!caseId) return
  await withPgClient(async (client) => {
    await client.query('delete from customs_hs_decisions where case_id = $1', [caseId])
    await client.query('delete from customs_hs_candidates where case_id = $1', [caseId])
    await client.query('delete from customs_line_items where case_id = $1', [caseId])
    await client.query('delete from customs_consistency_checks where case_id = $1', [caseId])
    await client.query('delete from customs_documents where case_id = $1', [caseId])
    await client.query('delete from customs_cases where id = $1', [caseId])
  })
}

export async function createCustomsCaseFixture(
  request: APIRequestContext,
  token: string,
  input: { reference?: string; sourceCountry?: string; destinationCountry?: string; currency?: string } = {},
): Promise<string> {
  const response = await apiRequest(request, 'POST', '/api/customs_documents/cases', {
    token,
    data: {
      reference: input.reference ?? `QA-CUSTDOC-${Date.now()}`,
      sourceCountry: input.sourceCountry ?? 'CN',
      destinationCountry: input.destinationCountry ?? 'PL',
      currency: input.currency ?? 'USD',
    },
  })
  expect(response.status(), 'POST /api/customs_documents/cases should return 201').toBe(201)
  const body = await readJsonSafe<CreateCaseResponse>(response)
  return expectId(body?.id, 'Customs case creation should return id')
}

export async function attachCustomsDocumentsFixture(
  request: APIRequestContext,
  token: string,
  caseId: string,
  documents: CustomsDemoDocumentInput[],
): Promise<string[]> {
  const attachmentIds: string[] = []
  const attachPayload: Array<{ attachmentId: string; kind: CustomsDemoDocumentKind }> = []
  for (const document of documents) {
    const attachment = await uploadAttachmentFixture(request, token, {
      entityId: 'customs_documents.case',
      recordId: caseId,
      fileName: document.fileName,
      mimeType: 'application/pdf',
      buffer: Buffer.from(document.content, 'utf8'),
      tags: ['qa', 'customs_documents'],
    })
    attachmentIds.push(attachment.id)
    await setAttachmentContentFixture(attachment.id, document.content)
    attachPayload.push({ attachmentId: attachment.id, kind: document.kind })
  }

  const attachResponse = await apiRequest(request, 'POST', `/api/customs_documents/cases/${caseId}/documents`, {
    token,
    data: { documents: attachPayload },
  })
  expect(attachResponse.status(), 'POST /api/customs_documents/cases/:id/documents should return 201').toBe(201)
  const attachBody = await readJsonSafe<AttachDocumentsResponse>(attachResponse)
  expect(attachBody?.ids?.length, 'Customs documents should be attached').toBe(documents.length)
  expect(attachBody?.items?.every((item) => item.hasContent === true), 'Attached documents should expose content').toBe(true)

  return attachmentIds
}

export async function deleteCustomsDemoFixture(
  request: APIRequestContext,
  token: string | null,
  caseId: string | null,
  attachmentIds: string[],
): Promise<void> {
  await deleteCustomsCaseRecordsIfExists(caseId)
  for (const attachmentId of attachmentIds) {
    await deleteAttachmentIfExists(request, token, attachmentId)
  }
}
