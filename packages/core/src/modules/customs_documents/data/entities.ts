import { Entity, Index, OptionalProps, PrimaryKey, Property, Unique } from '@mikro-orm/core'

export type CustomsCaseStatus = 'uploaded' | 'processing' | 'review_required' | 'classified' | 'approved' | 'failed'
export type CustomsDocumentKind = 'bill_of_lading' | 'commercial_invoice' | 'packing_list' | 'other'
export type CustomsDocumentStatus = 'uploaded' | 'text_extracted' | 'needs_review' | 'parsed' | 'failed'
export type CustomsConsistencyStatus = 'pass' | 'warning' | 'fail' | 'missing_source'
export type CustomsLineItemStatus = 'pending' | 'candidates_ready' | 'classified'
export type CustomsHsDecisionConfidenceBand = 'low' | 'medium' | 'high'

@Entity({ tableName: 'customs_cases' })
@Index({ name: 'customs_cases_org_tenant_status_idx', properties: ['organizationId', 'tenantId', 'status'] })
@Index({ name: 'customs_cases_reference_idx', properties: ['reference'] })
export class CustomsCase {
  [OptionalProps]?: 'status' | 'finalConfidence' | 'createdAt' | 'updatedAt' | 'deletedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ type: 'text' })
  reference!: string

  @Property({ type: 'text', default: 'uploaded' })
  status: CustomsCaseStatus = 'uploaded'

  @Property({ name: 'source_country', type: 'text', nullable: true })
  sourceCountry?: string | null

  @Property({ name: 'destination_country', type: 'text', nullable: true })
  destinationCountry?: string | null

  @Property({ type: 'text', nullable: true })
  currency?: string | null

  @Property({ name: 'final_confidence', type: 'numeric', nullable: true })
  finalConfidence?: string | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}

@Entity({ tableName: 'customs_documents' })
@Unique({ name: 'customs_documents_case_attachment_unique', properties: ['caseId', 'attachmentId'] })
@Index({ name: 'customs_documents_case_kind_idx', properties: ['caseId', 'kind'] })
@Index({ name: 'customs_documents_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
export class CustomsDocument {
  [OptionalProps]?: 'status' | 'contentText' | 'extractedFieldsJson' | 'createdAt' | 'updatedAt' | 'deletedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'case_id', type: 'uuid' })
  caseId!: string

  @Property({ name: 'attachment_id', type: 'uuid' })
  attachmentId!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ type: 'text' })
  kind!: CustomsDocumentKind

  @Property({ type: 'text', default: 'uploaded' })
  status: CustomsDocumentStatus = 'uploaded'

  @Property({ name: 'file_name', type: 'text', nullable: true })
  fileName?: string | null

  @Property({ name: 'mime_type', type: 'text', nullable: true })
  mimeType?: string | null

  @Property({ name: 'content_text', type: 'text', nullable: true })
  contentText?: string | null

  @Property({ name: 'extracted_fields_json', type: 'jsonb', nullable: true })
  extractedFieldsJson?: Record<string, unknown> | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}

@Entity({ tableName: 'customs_consistency_checks' })
@Index({ name: 'customs_consistency_checks_case_status_idx', properties: ['caseId', 'status'] })
@Index({ name: 'customs_consistency_checks_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
export class CustomsConsistencyCheck {
  [OptionalProps]?: 'createdAt' | 'updatedAt' | 'deletedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'case_id', type: 'uuid' })
  caseId!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ type: 'text' })
  field!: string

  @Property({ name: 'source_a', type: 'text' })
  sourceA!: string

  @Property({ name: 'source_b', type: 'text' })
  sourceB!: string

  @Property({ name: 'value_a', type: 'text', nullable: true })
  valueA?: string | null

  @Property({ name: 'value_b', type: 'text', nullable: true })
  valueB?: string | null

  @Property({ type: 'text' })
  status!: CustomsConsistencyStatus

  @Property({ type: 'text', nullable: true })
  message?: string | null

  @Property({ name: 'evidence_json', type: 'jsonb', nullable: true })
  evidenceJson?: Record<string, unknown> | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}

@Entity({ tableName: 'customs_line_items' })
@Index({ name: 'customs_line_items_case_status_idx', properties: ['caseId', 'status'] })
@Index({ name: 'customs_line_items_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
export class CustomsLineItem {
  [OptionalProps]?: 'status' | 'createdAt' | 'updatedAt' | 'deletedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'case_id', type: 'uuid' })
  caseId!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ type: 'text' })
  description!: string

  @Property({ type: 'numeric', nullable: true })
  quantity?: string | null

  @Property({ name: 'gross_weight_kg', type: 'numeric', nullable: true })
  grossWeightKg?: string | null

  @Property({ name: 'net_weight_kg', type: 'numeric', nullable: true })
  netWeightKg?: string | null

  @Property({ name: 'invoice_hs_code', type: 'text', nullable: true })
  invoiceHsCode?: string | null

  @Property({ type: 'text', default: 'pending' })
  status: CustomsLineItemStatus = 'pending'

  @Property({ name: 'source_json', type: 'jsonb', nullable: true })
  sourceJson?: Record<string, unknown> | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}

@Entity({ tableName: 'customs_hs_candidates' })
@Index({ name: 'customs_hs_candidates_line_score_idx', properties: ['lineItemId', 'score'] })
@Index({ name: 'customs_hs_candidates_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
export class CustomsHsCandidate {
  [OptionalProps]?: 'createdAt' | 'updatedAt' | 'deletedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'line_item_id', type: 'uuid' })
  lineItemId!: string

  @Property({ name: 'case_id', type: 'uuid' })
  caseId!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'hs_code', type: 'text' })
  hsCode!: string

  @Property({ type: 'text' })
  description!: string

  @Property({ type: 'numeric' })
  score!: string

  @Property({ type: 'text' })
  explanation!: string

  @Property({ name: 'source_breakdown_json', type: 'jsonb', nullable: true })
  sourceBreakdownJson?: Record<string, unknown> | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}

@Entity({ tableName: 'customs_hs_decisions' })
@Index({ name: 'customs_hs_decisions_line_idx', properties: ['lineItemId'] })
@Index({ name: 'customs_hs_decisions_case_idx', properties: ['caseId'] })
@Index({ name: 'customs_hs_decisions_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
export class CustomsHsDecision {
  [OptionalProps]?: 'createdAt' | 'updatedAt' | 'deletedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'line_item_id', type: 'uuid' })
  lineItemId!: string

  @Property({ name: 'case_id', type: 'uuid' })
  caseId!: string

  @Property({ name: 'candidate_id', type: 'uuid', nullable: true })
  candidateId?: string | null

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'selected_hs_code', type: 'text' })
  selectedHsCode!: string

  @Property({ name: 'selected_description', type: 'text', nullable: true })
  selectedDescription?: string | null

  @Property({ name: 'confidence_score', type: 'numeric', nullable: true })
  confidenceScore?: string | null

  @Property({ name: 'confidence_band', type: 'text' })
  confidenceBand!: CustomsHsDecisionConfidenceBand

  @Property({ type: 'text', nullable: true })
  note?: string | null

  @Property({ name: 'selected_by_user_id', type: 'uuid', nullable: true })
  selectedByUserId?: string | null

  @Property({ name: 'evidence_json', type: 'jsonb', nullable: true })
  evidenceJson?: Record<string, unknown> | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}

@Entity({ tableName: 'customs_hs_measure_cache' })
@Unique({ name: 'customs_hs_measure_cache_lookup_unique', properties: ['hsCode', 'date', 'language'] })
@Index({ name: 'customs_hs_measure_cache_fetched_idx', properties: ['fetchedAt'] })
export class CustomsHsMeasureCache {
  [OptionalProps]?: 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'hs_code', type: 'text' })
  hsCode!: string

  @Property({ type: 'text' })
  date!: string

  @Property({ type: 'text' })
  language!: string

  @Property({ name: 'source', type: 'text' })
  source!: 'live' | 'cached'

  @Property({ name: 'summary_json', type: 'jsonb', nullable: true })
  summaryJson?: Record<string, unknown> | null

  @Property({ name: 'raw_response_json', type: 'jsonb', nullable: true })
  rawResponseJson?: Record<string, unknown> | null

  @Property({ name: 'error_message', type: 'text', nullable: true })
  errorMessage?: string | null

  @Property({ name: 'fetched_at', type: Date })
  fetchedAt!: Date

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
