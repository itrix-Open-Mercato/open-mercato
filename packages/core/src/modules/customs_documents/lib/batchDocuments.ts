export type CustomsBatchDocumentKind = 'bill_of_lading' | 'commercial_invoice' | 'packing_list'

export type CustomsBatchDocumentLike = {
  name: string
}

export type CustomsBatchDocumentGroup<TDocument extends CustomsBatchDocumentLike> = {
  batchKey: string
  documents: Partial<Record<CustomsBatchDocumentKind, TDocument>>
  fileCount: number
  isComplete: boolean
}

export const CUSTOMS_BATCH_DOCUMENT_KINDS: CustomsBatchDocumentKind[] = [
  'bill_of_lading',
  'commercial_invoice',
  'packing_list',
]

const DOCUMENT_KIND_PATTERNS: Array<{ kind: CustomsBatchDocumentKind; patterns: RegExp[] }> = [
  {
    kind: 'bill_of_lading',
    patterns: [
      /\bbill[\s_-]*of[\s_-]*lading\b/i,
      /\blading\b/i,
      /\bbol\b/i,
      /\bbl[\s_-]*\d/i,
    ],
  },
  {
    kind: 'commercial_invoice',
    patterns: [
      /\bcommercial[\s_-]*invoice\b/i,
      /\binvoice\b/i,
      /\bfaktura\b/i,
      /\bci[\s_-]*\d/i,
    ],
  },
  {
    kind: 'packing_list',
    patterns: [
      /\bpacking[\s_-]*list\b/i,
      /\bpack[\s_-]*list\b/i,
      /\bpacking\b/i,
      /\bpl[\s_-]*\d/i,
    ],
  },
]

const BATCH_KEY_PATTERNS: RegExp[] = [
  /(?:^|[\s_-])(?:set|zestaw|batch|partia)[\s_-]*(\d+)(?:$|[\s_-])/i,
  /(?:^|[\s_-])(\d+)(?:$|[\s_-])/,
]

function normalizeFileName(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

export function classifyCustomsDocumentFileName(fileName: string): CustomsBatchDocumentKind | null {
  const normalized = normalizeFileName(fileName)

  for (const candidate of DOCUMENT_KIND_PATTERNS) {
    if (candidate.patterns.some((pattern) => pattern.test(normalized))) {
      return candidate.kind
    }
  }

  return null
}

export function resolveCustomsDocumentBatchKey(fileName: string): string {
  const normalized = normalizeFileName(fileName)
  for (const pattern of BATCH_KEY_PATTERNS) {
    const match = pattern.exec(normalized)
    const key = match?.[1]
    if (key) return `set_${key.padStart(2, '0')}`
  }
  return 'set_ungrouped'
}

export function groupCustomsDocumentFiles<TDocument extends CustomsBatchDocumentLike>(
  files: TDocument[],
): CustomsBatchDocumentGroup<TDocument>[] {
  const groups = new Map<string, CustomsBatchDocumentGroup<TDocument>>()

  for (const file of files) {
    const kind = classifyCustomsDocumentFileName(file.name)
    if (!kind) continue
    const batchKey = resolveCustomsDocumentBatchKey(file.name)
    const group = groups.get(batchKey) ?? {
      batchKey,
      documents: {},
      fileCount: 0,
      isComplete: false,
    }
    if (!group.documents[kind]) {
      group.documents[kind] = file
      group.fileCount += 1
      group.isComplete = CUSTOMS_BATCH_DOCUMENT_KINDS.every((documentKind) => Boolean(group.documents[documentKind]))
    }
    groups.set(batchKey, group)
  }

  return Array.from(groups.values()).sort((left, right) => left.batchKey.localeCompare(right.batchKey))
}
