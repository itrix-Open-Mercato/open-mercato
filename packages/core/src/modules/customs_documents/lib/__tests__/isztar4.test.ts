import { fetchIsztar4Measures, summarizeIsztar4Measures } from '../isztar4'

describe('ISZTAR4 measure summarization', () => {
  it('summarizes the live ISZTAR4 measures payload shape used by tariffMeasures and taxes', () => {
    const summary = summarizeIsztar4Measures({
      nomenclature: {
        code: '4011800000',
        description: 'New pneumatic tyres, of rubber',
        supplementaryUnit: 'p/st',
      },
      tariffMeasures: [
        { description: 'Third country duty', dutyAmount: '4%' },
        { description: 'Airworthiness tariff suspension', dutyAmount: '0%' },
      ],
      taxes: [
        { description: 'Value added tax', dutyAmount: '23%' },
      ],
    })

    expect(summary.measureCount).toBe(2)
    expect(summary.taxCount).toBe(1)
    expect(summary.dutyExpressions).toEqual(expect.arrayContaining([
      'Third country duty',
      '4%',
      'Value added tax',
      '23%',
    ]))
    expect(summary.supplementaryUnits).toContain('p/st')
  })

  it('uses a broad Accept header because ISZTAR4 rejects application/json with 406', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ tariffMeasures: [], taxes: [] }),
    } as Response)

    await fetchIsztar4Measures({
      hsCode: '4011800000',
      date: '2026-04-11',
      language: 'PL',
    })

    expect(fetchMock).toHaveBeenCalledWith(expect.any(URL), {
      headers: { accept: '*/*' },
    })
    fetchMock.mockRestore()
  })
})
