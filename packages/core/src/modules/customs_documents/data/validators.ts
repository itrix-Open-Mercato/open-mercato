import { z } from 'zod'

const uuid = () => z.string().uuid()
const optionalText = (max: number) => z.string().trim().min(1).max(max).optional()

export const customsCaseStatusSchema = z.enum([
  'uploaded',
  'processing',
  'review_required',
  'classified',
  'approved',
  'failed',
])

export const customsDocumentKindSchema = z.enum([
  'bill_of_lading',
  'commercial_invoice',
  'packing_list',
  'other',
])

export const customsDocumentStatusSchema = z.enum([
  'uploaded',
  'text_extracted',
  'needs_review',
  'parsed',
  'failed',
])

export const customsConsistencyStatusSchema = z.enum([
  'pass',
  'warning',
  'fail',
  'missing_source',
])

export const customsLineItemStatusSchema = z.enum([
  'pending',
  'candidates_ready',
  'classified',
])

export const customsHsDecisionConfidenceBandSchema = z.enum(['low', 'medium', 'high'])

export const customsCaseCreateSchema = z.object({
  tenantId: uuid(),
  organizationId: uuid(),
  reference: optionalText(120),
  sourceCountry: optionalText(120),
  destinationCountry: optionalText(120),
  currency: z.string().trim().length(3).optional(),
})

export const customsCaseListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional(),
  status: customsCaseStatusSchema.optional(),
})

export const customsCaseResponseSchema = z.object({
  id: uuid(),
  reference: z.string(),
  status: customsCaseStatusSchema,
  sourceCountry: z.string().nullable().optional(),
  destinationCountry: z.string().nullable().optional(),
  currency: z.string().nullable().optional(),
  finalConfidence: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const customsCaseCreateResponseSchema = z.object({
  id: uuid(),
})

export const customsDocumentAttachItemSchema = z.object({
  attachmentId: uuid(),
  kind: customsDocumentKindSchema,
})

export const customsDocumentsAttachSchema = z.object({
  caseId: uuid(),
  tenantId: uuid(),
  organizationId: uuid(),
  documents: z.array(customsDocumentAttachItemSchema).min(1).max(3),
})

export const customsDocumentResponseSchema = z.object({
  id: uuid(),
  caseId: uuid(),
  attachmentId: uuid(),
  kind: customsDocumentKindSchema,
  status: customsDocumentStatusSchema,
  fileName: z.string().nullable().optional(),
  mimeType: z.string().nullable().optional(),
  hasContent: z.boolean(),
  contentPreview: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const customsDocumentsAttachResponseSchema = z.object({
  ids: z.array(uuid()),
  items: z.array(customsDocumentResponseSchema),
})

export const customsDocumentListResponseSchema = z.object({
  items: z.array(customsDocumentResponseSchema),
})

export const customsCaseProcessSchema = z.object({
  caseId: uuid(),
  tenantId: uuid(),
  organizationId: uuid(),
})

export const customsConsistencyCheckResponseSchema = z.object({
  id: uuid(),
  caseId: uuid(),
  field: z.string(),
  sourceA: z.string(),
  sourceB: z.string(),
  valueA: z.string().nullable().optional(),
  valueB: z.string().nullable().optional(),
  status: customsConsistencyStatusSchema,
  message: z.string().nullable().optional(),
  createdAt: z.string(),
})

export const customsHsCandidateResponseSchema = z.object({
  id: uuid(),
  lineItemId: uuid(),
  hsCode: z.string(),
  description: z.string(),
  score: z.string(),
  explanation: z.string(),
  sourceBreakdown: z.record(z.string(), z.unknown()).nullable().optional(),
  createdAt: z.string(),
})

export const customsLineItemCandidatesResponseSchema = z.object({
  lineItem: z.lazy(() => customsLineItemResponseSchema),
  items: z.array(customsHsCandidateResponseSchema),
})

export const customsHsSelectRequestSchema = z.object({
  candidateId: uuid().optional(),
  hsCode: z.string().trim().min(4).max(14).optional(),
  description: z.string().trim().min(1).max(1000).optional(),
  note: z.string().trim().min(1).max(1000).optional(),
}).refine((input) => input.candidateId || input.hsCode, {
  message: 'candidateId or hsCode is required',
  path: ['candidateId'],
})

export const customsHsSelectSchema = customsHsSelectRequestSchema.and(z.object({
  lineItemId: uuid(),
  tenantId: uuid(),
  organizationId: uuid(),
}))

export const customsHsDecisionResponseSchema = z.object({
  id: uuid(),
  lineItemId: uuid(),
  caseId: uuid(),
  candidateId: uuid().nullable().optional(),
  selectedHsCode: z.string(),
  selectedDescription: z.string().nullable().optional(),
  confidenceScore: z.string().nullable().optional(),
  confidenceBand: customsHsDecisionConfidenceBandSchema,
  note: z.string().nullable().optional(),
  createdAt: z.string(),
})

export const customsLineItemResponseSchema = z.object({
  id: uuid(),
  caseId: uuid(),
  description: z.string(),
  quantity: z.string().nullable().optional(),
  grossWeightKg: z.string().nullable().optional(),
  netWeightKg: z.string().nullable().optional(),
  invoiceHsCode: z.string().nullable().optional(),
  status: customsLineItemStatusSchema,
  selectedDecision: customsHsDecisionResponseSchema.nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const customsCaseProcessResponseSchema = z.object({
  caseId: uuid(),
  documentCount: z.number().int(),
  parsedDocumentCount: z.number().int(),
  lineItems: z.array(customsLineItemResponseSchema),
  consistencyChecks: z.array(customsConsistencyCheckResponseSchema),
})

export const customsConsistencyListResponseSchema = z.object({
  items: z.array(customsConsistencyCheckResponseSchema),
})

export const customsLineItemListResponseSchema = z.object({
  items: z.array(customsLineItemResponseSchema),
})

export const customsIsztar4EnrichSchema = z.object({
  hsCode: z.string().trim().min(4).max(14),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  language: z.enum(['PL', 'EN']).default('PL'),
  forceLive: z.boolean().optional(),
})

export const customsIsztar4EnrichResponseSchema = z.object({
  hsCode: z.string(),
  date: z.string(),
  language: z.string(),
  source: z.enum(['live', 'cached', 'error']),
  summary: z.record(z.string(), z.unknown()).nullable().optional(),
  error: z.string().nullable().optional(),
})

export const customsCaseListResponseSchema = z.object({
  items: z.array(customsCaseResponseSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
})

export const errorResponseSchema = z.object({
  error: z.string(),
})

export type CustomsCaseCreateInput = z.infer<typeof customsCaseCreateSchema>
export type CustomsCaseListQuery = z.infer<typeof customsCaseListQuerySchema>
export type CustomsDocumentsAttachInput = z.infer<typeof customsDocumentsAttachSchema>
export type CustomsCaseProcessInput = z.infer<typeof customsCaseProcessSchema>
export type CustomsIsztar4EnrichInput = z.infer<typeof customsIsztar4EnrichSchema>
export type CustomsHsSelectInput = z.infer<typeof customsHsSelectSchema>
