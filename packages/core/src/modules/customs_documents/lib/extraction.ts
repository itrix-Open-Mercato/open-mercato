import type { CustomsConsistencyStatus, CustomsDocumentKind } from '../data/entities'

export type CustomsExtractedFields = {
  documentNumber: string | null
  partyA: string | null
  partyB: string | null
  containerNumber: string | null
  productDescription: string | null
  quantity: number | null
  grossWeightKg: number | null
  netWeightKg: number | null
  totalAmount: number | null
  currency: string | null
  invoiceHsCode: string | null
}

export type CustomsDocumentFacts = CustomsExtractedFields & {
  kind: CustomsDocumentKind
  documentId: string
}

export type ConsistencyCheckDraft = {
  field: string
  sourceA: string
  sourceB: string
  valueA: string | null
  valueB: string | null
  status: CustomsConsistencyStatus
  message: string | null
  evidenceJson: Record<string, unknown> | null
}

const EMPTY_FIELDS: CustomsExtractedFields = {
  documentNumber: null,
  partyA: null,
  partyB: null,
  containerNumber: null,
  productDescription: null,
  quantity: null,
  grossWeightKg: null,
  netWeightKg: null,
  totalAmount: null,
  currency: null,
  invoiceHsCode: null,
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function captureLineAfterLabel(text: string, labels: string[]): string | null {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const match = text.match(new RegExp(`${escaped}\\s*(?:\\([^\\n\\r:]{1,40}\\))?\\s*\\.?\\s*[:#-]?\\s*([^\\n\\r]+)`, 'i'))
    if (match?.[1]) return normalizeWhitespace(match[1]).slice(0, 240)
  }
  return null
}

function captureDocumentNumber(text: string, kind: CustomsDocumentKind): string | null {
  const labelsByKind: Record<CustomsDocumentKind, string[]> = {
    bill_of_lading: ['Bill of Lading No', 'B/L No', 'BL No', 'Document No'],
    commercial_invoice: ['Invoice No', 'Commercial Invoice No', 'Document No'],
    packing_list: ['Packing List No', 'Packing No', 'Document No'],
    other: ['Document No', 'No'],
  }
  return captureLineAfterLabel(text, labelsByKind[kind])
}

function parseNumber(value: string | undefined): number | null {
  if (!value) return null
  const normalized = value.replace(/\s/g, '').replace(/,/g, '')
  const parsed = Number.parseFloat(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function captureNumberNear(text: string, labels: string[], unitPattern?: string): number | null {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const unit = unitPattern ? `\\s*(?:${unitPattern})?` : ''
    const match = text.match(new RegExp(`${escaped}\\s*(?:\\([^\\n\\r:]{1,40}\\))?\\s*\\.?\\s*[:#-]?\\s*([0-9][0-9, .]*)${unit}`, 'i'))
    const parsed = parseNumber(match?.[1])
    if (parsed !== null) return parsed
  }
  return null
}

function captureTotalQuantity(text: string): number | null {
  const totalUnits = text.match(/\bTOTAL\s+([0-9][0-9, .]*)\s*(?:units?|pcs|pieces|packages|pkgs)\b/i)
  const parsedTotalUnits = parseNumber(totalUnits?.[1])
  if (parsedTotalUnits !== null) return parsedTotalUnits
  const saidToContain = text.match(/\b([0-9][0-9, .]*)\s*(?:units?|pcs|pieces|packages|pkgs)\b/i)
  const parsedSaidToContain = parseNumber(saidToContain?.[1])
  if (parsedSaidToContain !== null) return parsedSaidToContain
  const packingTotal = text.match(/\bTOTAL\s+([0-9][0-9, .]*)\s+[0-9][0-9, .]*\s+[0-9][0-9, .]*/i)
  return parseNumber(packingTotal?.[1])
}

function captureGrossWeightKg(text: string): number | null {
  const labeled = captureNumberNear(text, ['Gross Weight', 'G.W.', 'GW', 'Total Gross Weight'], 'kg|kgs|kilograms')
  if (labeled !== null) return labeled
  const packingTotal = text.match(/\bTOTAL\s+[0-9][0-9, .]*\s+[0-9][0-9, .]*\s+([0-9][0-9, .]*)/i)
  const parsedPackingTotal = parseNumber(packingTotal?.[1])
  if (parsedPackingTotal !== null) return parsedPackingTotal
  const weightHeaderIndex = text.search(/\bWeight\s*\(KGS\)/i)
  if (weightHeaderIndex >= 0) {
    const tableSlice = text.slice(weightHeaderIndex, weightHeaderIndex + 800)
    const tableWeight = tableSlice.match(/\b([0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]+)?)\b/)
    const parsedTableWeight = parseNumber(tableWeight?.[1])
    if (parsedTableWeight !== null) return parsedTableWeight
  }
  const billOfLadingWeight = text.match(/\b[0-9][0-9, .]*\s*(?:units?|pcs|pieces|packages|pkgs)\b[\s\S]{0,240}?\b([0-9]{2,3}(?:,[0-9]{3})+(?:\.[0-9]+)?)\b/)
  return parseNumber(billOfLadingWeight?.[1])
}

function captureNetWeightKg(text: string): number | null {
  const labeled = captureNumberNear(text, ['Net Weight', 'N.W.', 'NW', 'Total Net Weight'], 'kg|kgs|kilograms')
  if (labeled !== null) return labeled
  const packingTotal = text.match(/\bTOTAL\s+[0-9][0-9, .]*\s+([0-9][0-9, .]*)\s+[0-9][0-9, .]*/i)
  return parseNumber(packingTotal?.[1])
}

function captureCurrencyAmount(text: string): { amount: number | null; currency: string | null } {
  const labeled = text.match(/(?:total|invoice total|amount due)\s*[:#-]?\s*([A-Z]{3})?\s*([0-9][0-9, .]*)\s*([A-Z]{3})?/i)
  if (labeled) {
    return {
      amount: parseNumber(labeled[2]),
      currency: (labeled[1] ?? labeled[3] ?? null)?.toUpperCase() ?? null,
    }
  }
  const generic = text.match(/\b(USD|EUR|PLN|CNY|GBP)\s*([0-9][0-9, .]*)\b/i)
  return {
    amount: parseNumber(generic?.[2]),
    currency: generic?.[1]?.toUpperCase() ?? null,
  }
}

function captureHsCode(text: string): string | null {
  const match = text.match(/\b(?:HS|H\.S\.|HTS|commodity code)\s*(?:code)?\s*[:#-]?\s*([0-9][0-9 .-]{3,14})\b/i)
  if (!match?.[1]) return null
  const digits = match[1].replace(/\D/g, '')
  return digits.length >= 4 ? digits : null
}

function captureContainerNumber(text: string): string | null {
  const labeled = captureLineAfterLabel(text, ['Container No', 'Container Number', 'Container'])
  const fallback = text.match(/\b[A-Z]{4}[0-9]{7}\b/)
  return fallback?.[0] ?? labeled
}

function captureProductDescription(text: string): string | null {
  const labeled = captureLineAfterLabel(text, ['Description of Goods', 'Goods Description', 'Product Description', 'Description'])
  if (labeled) return labeled
  const lines = text
    .split(/\r?\n/)
    .map((line) => normalizeWhitespace(line))
    .filter((line) => line.length >= 12 && /[a-z]/i.test(line))
  return lines.find((line) => /tyre|tire|excavator|chassis|tractor|truck|vehicle|machine|goods/i.test(line)) ?? null
}

function normalizeName(value: string | null): string | null {
  if (!value) return null
  return normalizeWhitespace(value)
    .replace(/\b(ltd|limited|llc|inc|co|company|corp|corporation|sp z o o|gmbh)\b\.?/gi, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase() || null
}

function tokenSimilarity(left: string | null, right: string | null): number | null {
  const normalizedLeft = normalizeName(left)
  const normalizedRight = normalizeName(right)
  if (!normalizedLeft || !normalizedRight) return null
  const leftTokens = new Set(normalizedLeft.split(' ').filter(Boolean))
  const rightTokens = new Set(normalizedRight.split(' ').filter(Boolean))
  if (!leftTokens.size || !rightTokens.size) return null
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length
  const union = new Set([...leftTokens, ...rightTokens]).size
  return union > 0 ? intersection / union : null
}

function hasMatchingPartyPrefix(left: string | null, right: string | null): boolean {
  const normalizedLeft = normalizeName(left)
  const normalizedRight = normalizeName(right)
  if (!normalizedLeft || !normalizedRight) return false
  const leftTokens = normalizedLeft.split(' ').filter(Boolean)
  const rightTokens = normalizedRight.split(' ').filter(Boolean)
  if (leftTokens.length < 3 || rightTokens.length < 3) return false
  return leftTokens.slice(0, 3).join(' ') === rightTokens.slice(0, 3).join(' ')
}

function numericCheckStatus(left: number | null, right: number | null, toleranceRatio: number): CustomsConsistencyStatus {
  if (left === null || right === null) return 'missing_source'
  if (left === 0 && right === 0) return 'pass'
  const basis = Math.max(Math.abs(left), Math.abs(right), 1)
  return Math.abs(left - right) / basis <= toleranceRatio ? 'pass' : 'fail'
}

function partyCheckStatus(left: string | null, right: string | null): CustomsConsistencyStatus {
  const similarity = tokenSimilarity(left, right)
  if (similarity === null) return 'missing_source'
  if (hasMatchingPartyPrefix(left, right)) return 'pass'
  if (similarity >= 0.75) return 'pass'
  if (similarity >= 0.45) return 'warning'
  return 'fail'
}

function formatNumber(value: number | null, suffix = ''): string | null {
  return value === null ? null : `${value}${suffix}`
}

function sourceLabel(kind: CustomsDocumentKind): string {
  if (kind === 'bill_of_lading') return 'Bill of Lading'
  if (kind === 'commercial_invoice') return 'Commercial Invoice'
  if (kind === 'packing_list') return 'Packing List'
  return 'Other Document'
}

export function extractCustomsFields(kind: CustomsDocumentKind, text: string | null | undefined): CustomsExtractedFields {
  const source = text ? text.replace(/\r/g, '\n').trim() : ''
  if (!source) return { ...EMPTY_FIELDS }
  const amount = captureCurrencyAmount(source)
  return {
    documentNumber: captureDocumentNumber(source, kind),
    partyA: captureLineAfterLabel(source, kind === 'commercial_invoice' ? ['Seller', 'Shipper', 'Exporter'] : ['Shipper', 'Seller', 'Exporter']),
    partyB: captureLineAfterLabel(source, kind === 'commercial_invoice' ? ['Buyer', 'Consignee', 'Importer'] : ['Consignee', 'Buyer', 'Notify Party']),
    containerNumber: captureContainerNumber(source),
    productDescription: captureProductDescription(source),
    quantity: captureNumberNear(source, ['Quantity', 'Packages', 'No. of Packages', 'Total Packages', 'QTY'], 'pcs|pieces|packages|pkgs|units') ?? captureTotalQuantity(source),
    grossWeightKg: captureGrossWeightKg(source),
    netWeightKg: captureNetWeightKg(source),
    totalAmount: amount.amount,
    currency: amount.currency,
    invoiceHsCode: captureHsCode(source),
  }
}

export function buildConsistencyChecks(facts: CustomsDocumentFacts[]): ConsistencyCheckDraft[] {
  const byKind = new Map(facts.map((fact) => [fact.kind, fact]))
  const billOfLading = byKind.get('bill_of_lading') ?? null
  const invoice = byKind.get('commercial_invoice') ?? null
  const packingList = byKind.get('packing_list') ?? null
  const checks: ConsistencyCheckDraft[] = []

  function pushNumeric(
    field: string,
    left: CustomsDocumentFacts | null,
    right: CustomsDocumentFacts | null,
    selector: (fact: CustomsDocumentFacts) => number | null,
    suffix: string,
    toleranceRatio: number,
  ): void {
    const valueA = left ? selector(left) : null
    const valueB = right ? selector(right) : null
    checks.push({
      field,
      sourceA: left ? sourceLabel(left.kind) : 'Missing source',
      sourceB: right ? sourceLabel(right.kind) : 'Missing source',
      valueA: formatNumber(valueA, suffix),
      valueB: formatNumber(valueB, suffix),
      status: numericCheckStatus(valueA, valueB, toleranceRatio),
      message: valueA === null || valueB === null ? 'One or both source values are missing.' : null,
      evidenceJson: null,
    })
  }

  function pushParty(
    field: string,
    left: CustomsDocumentFacts | null,
    right: CustomsDocumentFacts | null,
    selector: (fact: CustomsDocumentFacts) => string | null,
  ): void {
    const valueA = left ? selector(left) : null
    const valueB = right ? selector(right) : null
    const similarity = tokenSimilarity(valueA, valueB)
    checks.push({
      field,
      sourceA: left ? sourceLabel(left.kind) : 'Missing source',
      sourceB: right ? sourceLabel(right.kind) : 'Missing source',
      valueA,
      valueB,
      status: partyCheckStatus(valueA, valueB),
      message: similarity === null ? 'One or both party names are missing.' : `Name similarity ${Math.round(similarity * 100)}%.`,
      evidenceJson: similarity === null ? null : { similarity },
    })
  }

  pushNumeric('gross_weight_kg', billOfLading, packingList, (fact) => fact.grossWeightKg, ' kg', 0.01)
  pushNumeric('quantity', invoice, packingList, (fact) => fact.quantity, '', 0)
  pushParty('shipper_or_seller', billOfLading, invoice, (fact) => fact.partyA)
  pushParty('consignee_or_buyer', billOfLading, invoice, (fact) => fact.partyB)

  return checks
}
