import type { CustomsLineItem } from '../data/entities'

export type HsReference = {
  hsCode: string
  description: string
  aliases: string[]
  keywords: string[]
}

export type HsCandidateDraft = {
  hsCode: string
  description: string
  score: number
  explanation: string
  sourceBreakdown: Record<string, unknown>
}

const REFERENCES: HsReference[] = [
  {
    hsCode: '4011800000',
    description: 'New pneumatic tyres, of rubber, of a kind used on construction, mining or industrial handling vehicles and machines',
    aliases: ['industrial tyres', 'construction tyres', 'mining tyres', 'otr tires', 'earthmover tyres', '工程轮胎', '矿用轮胎'],
    keywords: ['tyre', 'tire', 'rubber', 'industrial', 'construction', 'mining', 'earthmover', 'wheel', '轮胎', '橡胶'],
  },
  {
    hsCode: '8429521000',
    description: 'Self-propelled mechanical shovels, excavators and shovel loaders with a 360 degree revolving superstructure',
    aliases: ['excavator', 'crawler excavator', 'hydraulic excavator', '挖掘机', '履带挖掘机'],
    keywords: ['excavator', 'shovel', 'crawler', 'hydraulic', 'digging', 'loader', 'self propelled', '挖掘', '液压'],
  },
  {
    hsCode: '8701209000',
    description: 'Road tractors for semi-trailers, other than new',
    aliases: ['tractor truck', 'truck tractor', 'road tractor', 'semi trailer tractor', '牵引车', '半挂牵引车'],
    keywords: ['tractor', 'truck', 'semi', 'trailer', 'vehicle', 'road', '牵引', '卡车'],
  },
  {
    hsCode: '8706009900',
    description: 'Chassis fitted with engines, for motor vehicles',
    aliases: ['vehicle chassis', 'truck chassis', 'chassis with engine', '车辆底盘', '发动机底盘'],
    keywords: ['chassis', 'engine', 'vehicle', 'truck', 'motor', '底盘', '发动机'],
  },
]

function normalizeText(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function normalizeHsCode(value: string): string {
  const digits = value.replace(/\D/g, '')
  return digits.length >= 10 ? digits.slice(0, 10) : digits.padEnd(10, '0')
}

function scoreReference(reference: HsReference, haystack: string, invoiceHsCode: string | null | undefined): HsCandidateDraft | null {
  const matchedKeywords = reference.keywords.filter((keyword) => haystack.includes(normalizeText(keyword)))
  const matchedAliases = reference.aliases.filter((alias) => haystack.includes(normalizeText(alias)))
  const normalizedReferenceCode = normalizeHsCode(reference.hsCode)
  const normalizedInvoiceCode = invoiceHsCode ? normalizeHsCode(invoiceHsCode) : null
  const invoiceBoost = normalizedInvoiceCode && normalizedReferenceCode.startsWith(normalizedInvoiceCode.slice(0, 6)) ? 45 : 0
  const score = Math.min(100, matchedKeywords.length * 8 + matchedAliases.length * 18 + invoiceBoost)
  if (score <= 0) return null
  const reasons = [
    matchedAliases.length ? `alias match: ${matchedAliases.join(', ')}` : null,
    matchedKeywords.length ? `keyword match: ${matchedKeywords.join(', ')}` : null,
    invoiceBoost ? `invoice HS prefix boost: ${normalizedInvoiceCode}` : null,
  ].filter((reason): reason is string => typeof reason === 'string')
  return {
    hsCode: normalizedReferenceCode,
    description: reference.description,
    score,
    explanation: reasons.join('; '),
    sourceBreakdown: {
      matchedAliases,
      matchedKeywords,
      invoiceHsCode: normalizedInvoiceCode,
      invoiceBoost,
    },
  }
}

export function buildHsCandidateDrafts(lineItem: CustomsLineItem): HsCandidateDraft[] {
  const haystack = normalizeText([
    lineItem.description,
    lineItem.invoiceHsCode,
    lineItem.sourceJson ? JSON.stringify(lineItem.sourceJson) : '',
  ].join(' '))
  const drafts = REFERENCES
    .map((reference) => scoreReference(reference, haystack, lineItem.invoiceHsCode))
    .filter((candidate): candidate is HsCandidateDraft => candidate !== null)
    .sort((left, right) => right.score - left.score || left.hsCode.localeCompare(right.hsCode))
    .slice(0, 5)
  if (drafts.length) return drafts
  return [{
    hsCode: normalizeHsCode('4011800000'),
    description: REFERENCES[0].description,
    score: 1,
    explanation: 'Fallback demo candidate because no keyword matched.',
    sourceBreakdown: { fallback: true },
  }]
}
