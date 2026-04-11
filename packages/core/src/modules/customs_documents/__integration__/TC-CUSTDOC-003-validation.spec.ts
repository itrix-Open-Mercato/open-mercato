import { expect, test } from '@playwright/test'
import { apiRequest, getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { readJsonSafe } from '@open-mercato/core/helpers/integration/generalFixtures'
import {
  createCustomsCaseFixture,
  deleteCustomsDemoFixture,
} from '@open-mercato/core/helpers/integration/customsDocumentsFixtures'

type ErrorResponse = {
  error?: unknown
}

/**
 * TC-CUSTDOC-003: Customs Documents API validation
 * Covers: processing cannot start without attached customs documents.
 */
test.describe('TC-CUSTDOC-003: Customs Documents API validation', () => {
  test('should reject processing a case with no documents', async ({ request }) => {
    let token: string | null = null
    let caseId: string | null = null

    try {
      token = await getAuthToken(request, 'superadmin')
      caseId = await createCustomsCaseFixture(request, token, { reference: `QA-CUSTDOC-NODOCS-${Date.now()}` })

      const processResponse = await apiRequest(request, 'POST', `/api/customs_documents/cases/${caseId}/process`, { token })
      expect(processResponse.status(), 'POST /api/customs_documents/cases/:id/process should reject missing documents').toBe(400)
      const processBody = await readJsonSafe<ErrorResponse>(processResponse)
      expect(String(processBody?.error ?? ''), 'Error should explain that documents are required').toContain('No customs documents')
    } finally {
      await deleteCustomsDemoFixture(request, token, caseId, [])
    }
  })
})
