import { expect, test } from '@playwright/test'
import { apiRequest, getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { login } from '@open-mercato/core/helpers/integration/auth'
import { expectId, readJsonSafe } from '@open-mercato/core/helpers/integration/generalFixtures'
import {
  attachCustomsDocumentsFixture,
  createCustomsCaseFixture,
  createTyresDemoDocuments,
  deleteCustomsDemoFixture,
  type ProcessCaseResponse,
} from '@open-mercato/core/helpers/integration/customsDocumentsFixtures'

/**
 * TC-CUSTDOC-004: Customs Documents UI cockpit review
 * Covers: render processed demo documents, consistency result, HS candidate, and HS selection from the UI.
 */
test.describe('TC-CUSTDOC-004: Customs Documents UI cockpit review', () => {
  test('should show processed documents, consistency checks, and allow selecting an HS candidate', async ({ page, request }) => {
    test.slow()

    let token: string | null = null
    let caseId: string | null = null
    const attachmentIds: string[] = []
    const reference = `QA-CUSTDOC-UI-${Date.now()}`

    try {
      token = await getAuthToken(request, 'admin')
      caseId = await createCustomsCaseFixture(request, token, { reference })
      attachmentIds.push(...await attachCustomsDocumentsFixture(request, token, caseId, createTyresDemoDocuments()))

      const processResponse = await apiRequest(request, 'POST', `/api/customs_documents/cases/${caseId}/process`, { token })
      expect(processResponse.status(), 'POST /api/customs_documents/cases/:id/process should return 200').toBe(200)
      const processBody = await readJsonSafe<ProcessCaseResponse>(processResponse)
      expectId(processBody?.lineItems?.[0]?.id, 'Processing should return line item id for UI review')

      await login(page, 'admin')
      await page.goto(`/backend/customs-documents/${caseId}`, { waitUntil: 'domcontentloaded' })

      await expect(page.getByText(reference, { exact: true })).toBeVisible()
      await expect(page.getByText('Uploaded documents')).toBeVisible()
      await expect(page.getByText('Bill_of_Lading_Demo.pdf')).toBeVisible()
      await expect(page.getByText('Commercial_Invoice_Demo.pdf')).toBeVisible()
      await expect(page.getByText('Packing_List_Demo.pdf')).toBeVisible()
      await expect(page.getByText('Text extracted').first()).toBeVisible()

      await expect(page.getByText('Consistency checks')).toBeVisible()
      await expect(page.getByText('gross_weight_kg')).toBeVisible()
      await expect(page.getByText('Match').first()).toBeVisible()
      await expect(page.getByText('12000 kg').first()).toBeVisible()

      await expect(page.getByText('HS candidate review')).toBeVisible()
      await expect(page.getByText('industrial mining tyres').first()).toBeVisible()
      await expect(page.getByText('4011800000', { exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Enrich ISZTAR4' }).first()).toBeVisible()

      const selectHsButton = page.getByRole('button', { name: 'Select HS' }).first()
      await expect(selectHsButton).toBeEnabled()
      await selectHsButton.click()

      await expect(page.getByText('HS code selected').first()).toBeVisible()
      await expect(page.getByText('Classified').first()).toBeVisible()
      await expect(page.getByRole('button', { name: 'HS selected' }).first()).toBeVisible()
      await expect(page.getByTestId('customs-selected-hs-decision').filter({ hasText: 'Selected HS' }).filter({ hasText: '4011800000' }).first()).toBeVisible()
    } finally {
      await deleteCustomsDemoFixture(request, token, caseId, attachmentIds)
    }
  })
})
