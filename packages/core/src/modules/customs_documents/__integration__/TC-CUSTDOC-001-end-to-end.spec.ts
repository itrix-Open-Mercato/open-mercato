import { expect, test } from '@playwright/test'
import { apiRequest, getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { expectId, readJsonSafe } from '@open-mercato/core/helpers/integration/generalFixtures'
import {
  DEMO_ISZTAR4_DATE,
  attachCustomsDocumentsFixture,
  createCustomsCaseFixture,
  createTyresDemoDocuments,
  deleteCustomsDemoFixture,
  type CandidateListResponse,
  type HsDecisionResponse,
  type Isztar4EnrichResponse,
  type LineItemListResponse,
  type ProcessCaseResponse,
} from '@open-mercato/core/helpers/integration/customsDocumentsFixtures'

/**
 * TC-CUSTDOC-001: Customs Documents API end-to-end demo flow
 * Covers: create case -> attach three documents -> process -> list candidates -> ISZTAR4 enrich -> select HS.
 */
test.describe('TC-CUSTDOC-001: Customs Documents API end-to-end demo flow', () => {
  test('should upload three documents, process checks, enrich ISZTAR4, and select HS', async ({ request }) => {
    test.slow()

    let token: string | null = null
    let caseId: string | null = null
    const attachmentIds: string[] = []

    try {
      token = await getAuthToken(request, 'superadmin')
      caseId = await createCustomsCaseFixture(request, token)
      attachmentIds.push(...await attachCustomsDocumentsFixture(request, token, caseId, createTyresDemoDocuments()))

      const processResponse = await apiRequest(request, 'POST', `/api/customs_documents/cases/${caseId}/process`, { token })
      expect(processResponse.status(), 'POST /api/customs_documents/cases/:id/process should return 200').toBe(200)
      const processBody = await readJsonSafe<ProcessCaseResponse>(processResponse)
      expect(processBody?.documentCount, 'Processing should see all three documents').toBe(3)
      expect(processBody?.parsedDocumentCount, 'Processing should parse all three documents').toBe(3)
      expect(processBody?.lineItems?.length, 'Processing should create a line item').toBeGreaterThan(0)

      const grossWeightCheck = processBody?.consistencyChecks?.find((check) => check.field === 'gross_weight_kg')
      expect(grossWeightCheck?.status, 'Gross weight should be visibly compared between documents').toBe('pass')
      expect(grossWeightCheck?.valueA, 'Gross weight source A should be visible').toBe('12000 kg')
      expect(grossWeightCheck?.valueB, 'Gross weight source B should be visible').toBe('12000 kg')

      const lineItemId = expectId(processBody?.lineItems?.[0]?.id, 'Processing should return line item id')
      const candidatesResponse = await apiRequest(request, 'GET', `/api/customs_documents/line-items/${lineItemId}/candidates`, { token })
      expect(candidatesResponse.status(), 'GET /api/customs_documents/line-items/:id/candidates should return 200').toBe(200)
      const candidatesBody = await readJsonSafe<CandidateListResponse>(candidatesResponse)
      const candidate = candidatesBody?.items?.find((item) => item.hsCode === '4011800000') ?? candidatesBody?.items?.[0]
      const candidateId = expectId(candidate?.id, 'Candidate response should include candidate id')
      const hsCode = String(candidate?.hsCode ?? '')
      expect(hsCode, 'Candidate response should include HS code').toMatch(/^\d{10}$/)

      const enrichResponse = await apiRequest(request, 'POST', '/api/customs_documents/reference/isztar4/enrich', {
        token,
        data: {
          hsCode,
          date: DEMO_ISZTAR4_DATE,
          language: 'EN',
          forceLive: true,
        },
      })
      expect([200, 502], 'ISZTAR4 route should return live data or a structured upstream error').toContain(enrichResponse.status())
      const enrichBody = await readJsonSafe<Isztar4EnrichResponse>(enrichResponse)
      expect(enrichBody?.hsCode, 'ISZTAR4 response should echo the normalized HS code').toBe(hsCode)
      expect(['live', 'cached', 'error'], 'ISZTAR4 response should expose source state').toContain(enrichBody?.source)
      if (enrichResponse.status() === 200) {
        expect(enrichBody?.summary, 'Successful ISZTAR4 enrichment should include a summary').toBeTruthy()
      } else {
        expect(typeof enrichBody?.error, 'Failed live ISZTAR4 enrichment should include an error').toBe('string')
      }

      const decisionResponse = await apiRequest(request, 'POST', `/api/customs_documents/line-items/${lineItemId}/select-hs`, {
        token,
        data: {
          candidateId,
          note: 'QA end-to-end demo selection',
        },
      })
      expect(decisionResponse.status(), 'POST /api/customs_documents/line-items/:id/select-hs should return 201').toBe(201)
      const decisionBody = await readJsonSafe<HsDecisionResponse>(decisionResponse)
      expectId(decisionBody?.id, 'HS decision response should include id')
      expect(decisionBody?.lineItemId, 'HS decision should refer to the processed line item').toBe(lineItemId)
      expect(decisionBody?.selectedHsCode, 'HS decision should persist the selected code').toBe(hsCode)
      expect(['low', 'medium', 'high'], 'HS decision should expose deterministic confidence band').toContain(decisionBody?.confidenceBand)

      const lineItemsAfterDecision = await apiRequest(request, 'GET', `/api/customs_documents/cases/${caseId}/line-items`, { token })
      expect(lineItemsAfterDecision.status(), 'GET /api/customs_documents/cases/:id/line-items should return 200 after HS selection').toBe(200)
      const lineItemsAfterDecisionBody = await readJsonSafe<LineItemListResponse>(lineItemsAfterDecision)
      const selectedLineItem = lineItemsAfterDecisionBody?.items?.find((item) => item.id === lineItemId)
      expect(selectedLineItem?.status, 'Selected line item should be classified').toBe('classified')
      expect(selectedLineItem?.selectedDecision?.selectedHsCode, 'Line item list should expose the persisted HS decision for UI feedback').toBe(hsCode)
    } finally {
      await deleteCustomsDemoFixture(request, token, caseId, attachmentIds)
    }
  })
})
