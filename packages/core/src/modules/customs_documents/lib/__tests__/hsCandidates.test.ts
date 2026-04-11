import { buildHsCandidateDrafts, normalizeHsCode } from '../hsCandidates'

describe('customs HS candidate retrieval', () => {
  it('normalizes HS codes to the 10 digit ISZTAR4 nomenclature format', () => {
    expect(normalizeHsCode('4011.80')).toBe('4011800000')
    expect(normalizeHsCode('401180000099')).toBe('4011800000')
  })

  it('ranks Chinese industrial tyre descriptions deterministically', () => {
    const [candidate] = buildHsCandidateDrafts({
      id: 'line-1',
      caseId: 'case-1',
      organizationId: 'org-1',
      tenantId: 'tenant-1',
      description: '工程轮胎 / 矿用轮胎, industrial rubber tyres',
      invoiceHsCode: '401180',
      status: 'pending',
      quantity: null,
      grossWeightKg: null,
      netWeightKg: null,
      sourceJson: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    })

    expect(candidate.hsCode).toBe('4011800000')
    expect(candidate.score).toBeGreaterThanOrEqual(75)
    expect(candidate.explanation).toContain('invoice HS prefix boost')
    expect(candidate.sourceBreakdown).toMatchObject({
      invoiceHsCode: '4011800000',
    })
  })

  it('returns a low-confidence fallback when no reference matches', () => {
    const [candidate] = buildHsCandidateDrafts({
      id: 'line-1',
      caseId: 'case-1',
      organizationId: 'org-1',
      tenantId: 'tenant-1',
      description: 'unclassified sample goods',
      invoiceHsCode: null,
      status: 'pending',
      quantity: null,
      grossWeightKg: null,
      netWeightKg: null,
      sourceJson: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    })

    expect(candidate.hsCode).toBe('4011800000')
    expect(candidate.score).toBe(1)
    expect(candidate.sourceBreakdown).toEqual({ fallback: true })
  })
})
