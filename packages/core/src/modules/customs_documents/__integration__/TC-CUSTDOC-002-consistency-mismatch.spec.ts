import { expect, test } from '@playwright/test'
import { apiRequest, getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { readJsonSafe } from '@open-mercato/core/helpers/integration/generalFixtures'
import {
  attachCustomsDocumentsFixture,
  createCustomsCaseFixture,
  createTyresDemoDocuments,
  deleteCustomsDemoFixture,
  type ProcessCaseResponse,
} from '@open-mercato/core/helpers/integration/customsDocumentsFixtures'

type ConsistencyListResponse = {
  items?: Array<{ field?: unknown; status?: unknown; valueA?: unknown; valueB?: unknown }>
}

/**
 * TC-CUSTDOC-002: Customs Documents API consistency mismatch
 * Covers: deterministic mismatch detection and persisted consistency-check read model.
 */
test.describe('TC-CUSTDOC-002: Customs Documents API consistency mismatch', () => {
  test('should flag gross weight mismatch between bill of lading and packing list', async ({ request }) => {
    let token: string | null = null
    let caseId: string | null = null
    const attachmentIds: string[] = []

    try {
      token = await getAuthToken(request, 'superadmin')
      caseId = await createCustomsCaseFixture(request, token, { reference: `QA-CUSTDOC-MISMATCH-${Date.now()}` })
      attachmentIds.push(...await attachCustomsDocumentsFixture(
        request,
        token,
        caseId,
        createTyresDemoDocuments({
          packing_list: [
            'Packing List No: PL-7788',
            'Description of Goods: industrial mining tyres',
            'Total Packages: 48 packages',
            'Gross Weight: 10000 kg',
            'Net Weight: 9500 kg',
          ].join('\n'),
        }),
      ))

      const processResponse = await apiRequest(request, 'POST', `/api/customs_documents/cases/${caseId}/process`, { token })
      expect(processResponse.status(), 'POST /api/customs_documents/cases/:id/process should return 200').toBe(200)
      const processBody = await readJsonSafe<ProcessCaseResponse>(processResponse)
      const processGrossWeightCheck = processBody?.consistencyChecks?.find((check) => check.field === 'gross_weight_kg')
      expect(processGrossWeightCheck?.status, 'Process response should expose the mismatch').toBe('fail')
      expect(processGrossWeightCheck?.valueA, 'Bill of lading gross weight should be visible').toBe('12000 kg')
      expect(processGrossWeightCheck?.valueB, 'Packing list gross weight should be visible').toBe('10000 kg')

      const consistencyResponse = await apiRequest(request, 'GET', `/api/customs_documents/cases/${caseId}/consistency`, { token })
      expect(consistencyResponse.status(), 'GET /api/customs_documents/cases/:id/consistency should return 200').toBe(200)
      const consistencyBody = await readJsonSafe<ConsistencyListResponse>(consistencyResponse)
      const persistedGrossWeightCheck = consistencyBody?.items?.find((check) => check.field === 'gross_weight_kg')
      expect(persistedGrossWeightCheck?.status, 'Persisted read model should expose the mismatch').toBe('fail')
      expect(persistedGrossWeightCheck?.valueA, 'Persisted source A value should be visible').toBe('12000 kg')
      expect(persistedGrossWeightCheck?.valueB, 'Persisted source B value should be visible').toBe('10000 kg')
    } finally {
      await deleteCustomsDemoFixture(request, token, caseId, attachmentIds)
    }
  })
})
