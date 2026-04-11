import { normalizeHsCode } from './hsCandidates'

const DEFAULT_BASE_URL = 'https://ext-isztar4.mf.gov.pl/tariff/rest'

export type Isztar4MeasureSummary = {
  measureCount: number
  taxCount: number
  dutyExpressions: string[]
  supplementaryUnits: string[]
}

function collectStrings(value: unknown, keyPattern: RegExp, output: Set<string>): void {
  if (!value || typeof value !== 'object') return
  if (Array.isArray(value)) {
    value.forEach((item) => collectStrings(item, keyPattern, output))
    return
  }
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item === 'string' && keyPattern.test(key) && item.trim().length > 0) {
      output.add(item.trim())
    } else if (item && typeof item === 'object') {
      collectStrings(item, keyPattern, output)
    }
  }
}

export function summarizeIsztar4Measures(raw: Record<string, unknown>): Isztar4MeasureSummary {
  const dutyExpressions = new Set<string>()
  const supplementaryUnits = new Set<string>()
  collectStrings(raw, /duty|expression|measureType|description/i, dutyExpressions)
  collectStrings(raw, /supplementaryUnit|unit/i, supplementaryUnits)
  const measures = Array.isArray(raw.measures)
    ? raw.measures
    : Array.isArray(raw.goodsNomenclatureMeasures)
      ? raw.goodsNomenclatureMeasures
      : Array.isArray(raw.tariffMeasures)
        ? raw.tariffMeasures
        : []
  const taxes = Array.isArray(raw.taxes) ? raw.taxes : []
  return {
    measureCount: measures.length,
    taxCount: taxes.length,
    dutyExpressions: Array.from(dutyExpressions).slice(0, 12),
    supplementaryUnits: Array.from(supplementaryUnits).slice(0, 12),
  }
}

export async function fetchIsztar4Measures(input: {
  hsCode: string
  date: string
  language: 'PL' | 'EN'
}): Promise<{ raw: Record<string, unknown>; summary: Isztar4MeasureSummary }> {
  const url = new URL(`${process.env.ISZTAR4_BASE_URL ?? DEFAULT_BASE_URL}/goods-nomenclature/measures`)
  url.searchParams.set('nomenclatureCode', normalizeHsCode(input.hsCode))
  url.searchParams.set('date', input.date)
  url.searchParams.set('language', input.language)
  const response = await fetch(url, { headers: { accept: '*/*' } })
  if (!response.ok) {
    throw new Error(`ISZTAR4 measures request failed with status ${response.status}`)
  }
  const raw = await response.json() as Record<string, unknown>
  return { raw, summary: summarizeIsztar4Measures(raw) }
}
