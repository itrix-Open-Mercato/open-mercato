import { z } from 'zod'

const uuid = () => z.string().uuid()

const scopedSchema = z.object({
  organizationId: uuid(),
  tenantId: uuid(),
})

const nextInteractionSchema = z
  .object({
    at: z.coerce.date(),
    name: z.string().trim().min(1).max(200),
    refId: z.string().trim().max(191).optional().nullable(),
    icon: z.string().trim().max(100).optional().nullable(),
    color: z
      .string()
      .trim()
      .regex(/^#([0-9a-fA-F]{6})$/)
      .optional()
      .nullable(),
  })
  .strict()

const displayNameSchema = z.string().trim().min(1).max(200)
const jsonRecordSchema = z.record(z.string(), z.unknown())
const codeSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9_-]+$/, 'Code must be lowercase and may contain dashes or underscores')

const baseEntitySchema = {
  displayName: displayNameSchema,
  description: z.string().trim().max(4000).optional(),
  ownerUserId: uuid().optional(),
  primaryEmail: z
    .string()
    .trim()
    .email()
    .max(320)
    .optional(),
  primaryPhone: z.string().trim().max(50).optional(),
  status: z.string().trim().max(100).optional(),
  lifecycleStage: z.string().trim().max(100).optional(),
  source: z.string().trim().max(150).optional(),
  isActive: z.boolean().optional(),
  nextInteraction: nextInteractionSchema.nullable().optional(),
  tags: z.array(uuid()).optional(),
}

const personDetailsSchema = {
  preferredName: z.string().trim().max(120).optional(),
  jobTitle: z.string().trim().max(150).optional(),
  department: z.string().trim().max(150).optional(),
  seniority: z.string().trim().max(100).optional(),
  timezone: z.string().trim().max(120).optional(),
  linkedInUrl: z.string().trim().url().max(300).optional(),
  twitterUrl: z.string().trim().url().max(300).optional(),
  companyEntityId: uuid().nullable().optional(),
}

const personFirstNameSchema = z.string().trim().min(1).max(120)
const personLastNameSchema = z.string().trim().min(1).max(120)

const companyDetailsSchema = {
  legalName: z.string().trim().max(200).optional(),
  brandName: z.string().trim().max(200).optional(),
  domain: z.string().trim().max(200).optional(),
  websiteUrl: z.string().trim().url().max(300).optional(),
  industry: z.string().trim().max(150).optional(),
  sizeBucket: z.string().trim().max(100).optional(),
  annualRevenue: z.coerce.number().min(0).optional(),
}

export const personCreateSchema = scopedSchema.extend({
  ...baseEntitySchema,
  displayName: displayNameSchema.optional(),
  firstName: personFirstNameSchema,
  lastName: personLastNameSchema,
  ...personDetailsSchema,
})

export const personUpdateSchema = z
  .object({
    id: uuid(),
  })
  .merge(
    scopedSchema.extend({
      ...baseEntitySchema,
      ...personDetailsSchema,
      firstName: personFirstNameSchema.optional(),
      lastName: personLastNameSchema.optional(),
    }).partial()
  )

export const companyCreateSchema = scopedSchema.extend({
  ...baseEntitySchema,
  displayName: displayNameSchema,
  ...companyDetailsSchema,
})

export const companyUpdateSchema = z
  .object({
    id: uuid(),
  })
  .merge(companyCreateSchema.partial())

export const dealCreateSchema = scopedSchema.extend({
  title: z.string().min(1).max(200),
  description: z.string().max(4000).optional(),
  status: z.string().max(50).optional(),
  pipelineStage: z.string().max(100).optional(),
  pipelineId: uuid().optional(),
  pipelineStageId: uuid().optional(),
  valueAmount: z.coerce.number().min(0).optional(),
  valueCurrency: z.string().min(3).max(3).optional(),
  probability: z.number().min(0).max(100).optional(),
  expectedCloseAt: z.coerce.date().optional(),
  ownerUserId: uuid().optional(),
  source: z.string().max(150).optional(),
  companyIds: z.array(uuid()).optional(),
  personIds: z.array(uuid()).optional(),
})

export const dealUpdateSchema = z
  .object({
    id: uuid(),
  })
  .merge(dealCreateSchema.partial())

export const activityCreateSchema = scopedSchema.extend({
  entityId: uuid(),
  activityType: z.string().min(1).max(100),
  subject: z.string().max(200).optional(),
  body: z.string().max(8000).optional(),
  occurredAt: z.coerce.date().optional(),
  dealId: uuid().optional(),
  authorUserId: uuid().optional(),
  appearanceIcon: z.string().trim().max(100).optional().nullable(),
  appearanceColor: z
    .string()
    .trim()
    .regex(/^#([0-9a-fA-F]{6})$/)
    .optional()
    .nullable(),
})

export const activityUpdateSchema = z
  .object({
    id: uuid(),
  })
  .merge(activityCreateSchema.partial())

export const commentCreateSchema = scopedSchema.extend({
  entityId: uuid(),
  dealId: uuid().optional(),
  body: z.string().min(1).max(8000),
  authorUserId: uuid().optional(),
  appearanceIcon: z.string().trim().max(100).optional().nullable(),
  appearanceColor: z
    .string()
    .trim()
    .regex(/^#([0-9a-fA-F]{6})$/)
    .optional()
    .nullable(),
})

export const commentUpdateSchema = z
  .object({
    id: uuid(),
  })
  .merge(commentCreateSchema.partial())

export const addressCreateSchema = scopedSchema.extend({
  entityId: uuid(),
  name: z.string().max(150).optional(),
  purpose: z.string().max(150).optional(),
  companyName: z.string().max(200).optional(),
  addressLine1: z.string().min(1).max(300),
  addressLine2: z.string().max(300).optional(),
  buildingNumber: z.string().max(50).optional(),
  flatNumber: z.string().max(50).optional(),
  city: z.string().max(150).optional(),
  region: z.string().max(150).optional(),
  postalCode: z.string().max(30).optional(),
  country: z.string().max(150).optional(),
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
  isPrimary: z.boolean().optional(),
})

export const addressUpdateSchema = z
  .object({
    id: uuid(),
  })
  .merge(addressCreateSchema.partial())

export const tagCreateSchema = scopedSchema.extend({
  slug: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9_-]+$/, 'Slug must be lowercase and may contain dashes or underscores'),
  label: z.string().min(1).max(120),
  color: z.string().max(30).optional(),
  description: z.string().max(400).optional(),
})

export const tagUpdateSchema = z
  .object({
    id: uuid(),
  })
  .merge(tagCreateSchema.partial())

const dictionaryKindEnum = z.enum([
  'status',
  'source',
  'lifecycle_stage',
  'address_type',
  'activity_type',
  'deal_status',
  'pipeline_stage',
  'job_title',
  'industry',
])

const dictionaryValueSchema = z.string().trim().min(1).max(150)
const dictionaryLabelSchema = z.string().trim().max(150)
const dictionaryColorSchema = z
  .string()
  .trim()
  .regex(/^#([0-9a-fA-F]{6})$/, 'Color must be a valid six-digit hex code like #3366ff')
const dictionaryIconSchema = z.string().trim().max(48)

export const customerDictionaryEntryCreateSchema = scopedSchema.extend({
  kind: dictionaryKindEnum,
  value: dictionaryValueSchema,
  label: dictionaryLabelSchema.optional(),
  color: dictionaryColorSchema.nullable().optional(),
  icon: dictionaryIconSchema.nullable().optional(),
})

export type CustomerDictionaryEntryCreateInput = z.infer<typeof customerDictionaryEntryCreateSchema>

export const customerDictionaryEntryUpdateSchema = scopedSchema
  .extend({
    id: uuid(),
    kind: dictionaryKindEnum,
    value: dictionaryValueSchema.optional(),
    label: dictionaryLabelSchema.optional(),
    color: dictionaryColorSchema.nullable().optional(),
    icon: dictionaryIconSchema.nullable().optional(),
  })
  .refine(
    (payload) =>
      payload.value !== undefined ||
      payload.label !== undefined ||
      payload.color !== undefined ||
      payload.icon !== undefined,
    {
      message: 'Provide at least one field to update.',
      path: ['value'],
    }
  )

export type CustomerDictionaryEntryUpdateInput = z.infer<typeof customerDictionaryEntryUpdateSchema>

export const customerDictionaryEntryDeleteSchema = scopedSchema.extend({
  id: uuid(),
  kind: dictionaryKindEnum,
})

export type CustomerDictionaryEntryDeleteInput = z.infer<typeof customerDictionaryEntryDeleteSchema>

export const tagAssignmentSchema = scopedSchema.extend({
  tagId: uuid(),
  entityId: uuid(),
})

export const todoLinkCreateSchema = scopedSchema.extend({
  entityId: uuid(),
  todoId: uuid(),
  todoSource: z.string().min(1).max(120).default('example:todo'),
  createdByUserId: uuid().optional(),
})

export const todoLinkWithTodoCreateSchema = scopedSchema.extend({
  entityId: uuid(),
  title: z.string().min(1).max(200),
  isDone: z.boolean().optional(),
  is_done: z.boolean().optional(),
  todoSource: z.string().min(1).max(120).default('example:todo'),
  createdByUserId: uuid().optional(),
  todoCustom: z.record(z.string(), z.any()).optional(),
  custom: z.record(z.string(), z.any()).optional(),
})

export const customerAddressFormatSchema = z.enum(['line_first', 'street_first'])

export const customerSettingsUpsertSchema = scopedSchema.extend({
  addressFormat: customerAddressFormatSchema,
})

export type PersonCreateInput = z.infer<typeof personCreateSchema>
export type PersonUpdateInput = z.infer<typeof personUpdateSchema>
export type CompanyCreateInput = z.infer<typeof companyCreateSchema>
export type CompanyUpdateInput = z.infer<typeof companyUpdateSchema>
export type DealCreateInput = z.infer<typeof dealCreateSchema>
export type DealUpdateInput = z.infer<typeof dealUpdateSchema>
export type ActivityCreateInput = z.infer<typeof activityCreateSchema>
export type ActivityUpdateInput = z.infer<typeof activityUpdateSchema>
export type CommentCreateInput = z.infer<typeof commentCreateSchema>
export type CommentUpdateInput = z.infer<typeof commentUpdateSchema>
export type AddressCreateInput = z.infer<typeof addressCreateSchema>
export type AddressUpdateInput = z.infer<typeof addressUpdateSchema>
export type TagCreateInput = z.infer<typeof tagCreateSchema>
export type TagUpdateInput = z.infer<typeof tagUpdateSchema>
export type TagAssignmentInput = z.infer<typeof tagAssignmentSchema>
export type TodoLinkCreateInput = z.infer<typeof todoLinkCreateSchema>
export type TodoLinkWithTodoCreateInput = z.infer<typeof todoLinkWithTodoCreateSchema>
export type CustomerSettingsUpsertInput = z.infer<typeof customerSettingsUpsertSchema>
export type CustomerAddressFormatInput = z.infer<typeof customerAddressFormatSchema>

// --- Pipeline schemas ---

export const pipelineCreateSchema = scopedSchema.extend({
  name: z.string().trim().min(1).max(200),
  isDefault: z.boolean().optional(),
})

export const pipelineUpdateSchema = z.object({
  id: uuid(),
  name: z.string().trim().min(1).max(200).optional(),
  isDefault: z.boolean().optional(),
})

export const pipelineDeleteSchema = z.object({
  id: uuid(),
})

export type PipelineCreateInput = z.infer<typeof pipelineCreateSchema>
export type PipelineUpdateInput = z.infer<typeof pipelineUpdateSchema>
export type PipelineDeleteInput = z.infer<typeof pipelineDeleteSchema>

// --- Pipeline Stage schemas ---

export const pipelineStageCreateSchema = scopedSchema.extend({
  pipelineId: uuid(),
  label: z.string().trim().min(1).max(200),
  order: z.number().int().min(0).optional(),
  color: z.string().trim().max(20).optional(),
  icon: z.string().trim().max(100).optional(),
})

export const pipelineStageUpdateSchema = z.object({
  id: uuid(),
  label: z.string().trim().min(1).max(200).optional(),
  order: z.number().int().min(0).optional(),
  color: z.string().trim().max(20).optional(),
  icon: z.string().trim().max(100).optional(),
})

export const pipelineStageDeleteSchema = z.object({
  id: uuid(),
})

export const pipelineStageReorderSchema = scopedSchema.extend({
  stages: z.array(z.object({
    id: uuid(),
    order: z.number().int().min(0),
  })).min(1),
})

export type PipelineStageCreateInput = z.infer<typeof pipelineStageCreateSchema>
export type PipelineStageUpdateInput = z.infer<typeof pipelineStageUpdateSchema>
export type PipelineStageDeleteInput = z.infer<typeof pipelineStageDeleteSchema>
export type PipelineStageReorderInput = z.infer<typeof pipelineStageReorderSchema>

// --- Lead funnel schemas ---

export const leadOutcomeSchema = z.enum(['open', 'won', 'lost'])
export const leadStageKindSchema = z.enum(['open', 'won', 'lost'])
export const leadBindingModeSchema = z.enum(['lead_only', 'prefill_only', 'shared'])
export const leadTargetEntityKindSchema = z.enum(['person', 'company', 'deal'])
export const leadFieldSectionKindSchema = z.enum(['lead', 'person', 'company', 'deal'])

const leadPayloadSchema = {
  pipelineId: uuid().optional(),
  stageId: uuid().optional(),
  outcome: leadOutcomeSchema.optional(),
  lostReasonId: uuid().nullable().optional(),
  displayName: displayNameSchema,
  ownerUserId: uuid().nullable().optional(),
  source: z.string().trim().max(150).nullable().optional(),
  sourceChannel: z.string().trim().max(150).nullable().optional(),
  sourceExternalId: z.string().trim().max(191).nullable().optional(),
  sourcePayloadRaw: jsonRecordSchema.nullable().optional(),
  sourceReceivedAt: z.coerce.date().nullable().optional(),
  primaryEmail: z.string().trim().email().max(320).nullable().optional(),
  primaryPhone: z.string().trim().max(50).nullable().optional(),
  vatId: z.string().trim().max(80).nullable().optional(),
  spamScore: z.coerce.number().min(0).max(1).nullable().optional(),
  qualificationNotes: z.string().trim().max(8000).nullable().optional(),
  personData: jsonRecordSchema.nullable().optional(),
  companyData: jsonRecordSchema.nullable().optional(),
  dealData: jsonRecordSchema.nullable().optional(),
  createdPersonId: uuid().nullable().optional(),
  createdCompanyId: uuid().nullable().optional(),
  createdDealId: uuid().nullable().optional(),
  linkedPersonId: uuid().nullable().optional(),
  linkedCompanyId: uuid().nullable().optional(),
  linkedDealId: uuid().nullable().optional(),
  convertedAt: z.coerce.date().nullable().optional(),
  convertedByUserId: uuid().nullable().optional(),
}

export const customerLeadCreateSchema = scopedSchema.extend(leadPayloadSchema)

export const customerLeadUpdateSchema = z
  .object({
    id: uuid(),
  })
  .merge(scopedSchema.extend(leadPayloadSchema).partial())

export const customerLeadDeleteSchema = scopedSchema.extend({
  id: uuid(),
})

export const customerLeadAssignSchema = scopedSchema.extend({
  id: uuid(),
  ownerUserId: uuid().nullable(),
})

export const customerLeadAdvanceStageSchema = scopedSchema.extend({
  id: uuid(),
  stageId: uuid(),
  lostReasonId: uuid().nullable().optional(),
  note: z.string().trim().max(2000).nullable().optional(),
})

export const customerLeadMarkLostSchema = scopedSchema.extend({
  id: uuid(),
  lostReasonId: uuid(),
  note: z.string().trim().max(2000).nullable().optional(),
})

export const customerLeadDuplicateCheckSchema = scopedSchema.extend({
  id: uuid().optional(),
  primaryEmail: z.string().trim().email().max(320).nullable().optional(),
  primaryPhone: z.string().trim().max(50).nullable().optional(),
  vatId: z.string().trim().max(80).nullable().optional(),
})

export const customerLeadLinkPersonSchema = scopedSchema.extend({
  leadId: uuid(),
  personId: uuid(),
})

export const customerLeadLinkCompanySchema = scopedSchema.extend({
  leadId: uuid(),
  companyId: uuid(),
})

export const customerLeadLinkDealSchema = scopedSchema.extend({
  leadId: uuid(),
  dealId: uuid(),
})

export const customerLeadCreatePersonSchema = scopedSchema.extend({
  leadId: uuid(),
  overrides: personCreateSchema.partial().optional(),
})

export const customerLeadCreateCompanySchema = scopedSchema.extend({
  leadId: uuid(),
  overrides: companyCreateSchema.partial().optional(),
})

export const customerLeadCreateDealSchema = scopedSchema.extend({
  leadId: uuid(),
  overrides: dealCreateSchema.partial().optional(),
})

export const customerLeadConvertSchema = scopedSchema.extend({
  leadId: uuid(),
  personId: uuid().nullable().optional(),
  companyId: uuid().nullable().optional(),
  dealId: uuid().nullable().optional(),
  createPerson: z.boolean().optional(),
  createCompany: z.boolean().optional(),
  createDeal: z.boolean().optional(),
  wonStageId: uuid().nullable().optional(),
  note: z.string().trim().max(2000).nullable().optional(),
})

export const customerLeadPipelineCreateSchema = scopedSchema.extend({
  name: z.string().trim().min(1).max(200),
  code: codeSchema,
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
})

export const customerLeadPipelineUpdateSchema = scopedSchema.extend({
  id: uuid(),
  name: z.string().trim().min(1).max(200).optional(),
  code: codeSchema.optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
})

export const customerLeadPipelineDeleteSchema = scopedSchema.extend({
  id: uuid(),
})

export const customerLeadPipelineStageCreateSchema = scopedSchema.extend({
  pipelineId: uuid(),
  name: z.string().trim().min(1).max(200),
  code: codeSchema,
  position: z.number().int().min(0).optional(),
  kind: leadStageKindSchema.optional(),
  isActive: z.boolean().optional(),
})

export const customerLeadPipelineStageUpdateSchema = scopedSchema.extend({
  id: uuid(),
  pipelineId: uuid().optional(),
  name: z.string().trim().min(1).max(200).optional(),
  code: codeSchema.optional(),
  position: z.number().int().min(0).optional(),
  kind: leadStageKindSchema.optional(),
  isActive: z.boolean().optional(),
})

export const customerLeadPipelineStageDeleteSchema = scopedSchema.extend({
  id: uuid(),
})

export const customerLeadLostReasonCreateSchema = scopedSchema.extend({
  pipelineId: uuid().nullable().optional(),
  name: z.string().trim().min(1).max(200),
  code: codeSchema,
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
})

export const customerLeadLostReasonUpdateSchema = scopedSchema.extend({
  id: uuid(),
  pipelineId: uuid().nullable().optional(),
  name: z.string().trim().min(1).max(200).optional(),
  code: codeSchema.optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
})

export const customerLeadLostReasonDeleteSchema = scopedSchema.extend({
  id: uuid(),
})

export const customerLeadFieldBindingCreateSchema = scopedSchema.extend({
  pipelineId: uuid().nullable().optional(),
  leadFieldKey: z.string().trim().min(1).max(150),
  bindingMode: leadBindingModeSchema,
  targetEntityKind: leadTargetEntityKindSchema.nullable().optional(),
  targetFieldKey: z.string().trim().max(150).nullable().optional(),
  sectionKind: leadFieldSectionKindSchema,
  isActive: z.boolean().optional(),
})

export const customerLeadFieldBindingUpdateSchema = scopedSchema.extend({
  id: uuid(),
  pipelineId: uuid().nullable().optional(),
  leadFieldKey: z.string().trim().min(1).max(150).optional(),
  bindingMode: leadBindingModeSchema.optional(),
  targetEntityKind: leadTargetEntityKindSchema.nullable().optional(),
  targetFieldKey: z.string().trim().max(150).nullable().optional(),
  sectionKind: leadFieldSectionKindSchema.optional(),
  isActive: z.boolean().optional(),
})

export const customerLeadFieldBindingDeleteSchema = scopedSchema.extend({
  id: uuid(),
})

export type CustomerLeadCreateInput = z.infer<typeof customerLeadCreateSchema>
export type CustomerLeadUpdateInput = z.infer<typeof customerLeadUpdateSchema>
export type CustomerLeadDeleteInput = z.infer<typeof customerLeadDeleteSchema>
export type CustomerLeadAssignInput = z.infer<typeof customerLeadAssignSchema>
export type CustomerLeadAdvanceStageInput = z.infer<typeof customerLeadAdvanceStageSchema>
export type CustomerLeadMarkLostInput = z.infer<typeof customerLeadMarkLostSchema>
export type CustomerLeadDuplicateCheckInput = z.infer<typeof customerLeadDuplicateCheckSchema>
export type CustomerLeadLinkPersonInput = z.infer<typeof customerLeadLinkPersonSchema>
export type CustomerLeadLinkCompanyInput = z.infer<typeof customerLeadLinkCompanySchema>
export type CustomerLeadLinkDealInput = z.infer<typeof customerLeadLinkDealSchema>
export type CustomerLeadCreatePersonInput = z.infer<typeof customerLeadCreatePersonSchema>
export type CustomerLeadCreateCompanyInput = z.infer<typeof customerLeadCreateCompanySchema>
export type CustomerLeadCreateDealInput = z.infer<typeof customerLeadCreateDealSchema>
export type CustomerLeadConvertInput = z.infer<typeof customerLeadConvertSchema>
export type CustomerLeadPipelineCreateInput = z.infer<typeof customerLeadPipelineCreateSchema>
export type CustomerLeadPipelineUpdateInput = z.infer<typeof customerLeadPipelineUpdateSchema>
export type CustomerLeadPipelineDeleteInput = z.infer<typeof customerLeadPipelineDeleteSchema>
export type CustomerLeadPipelineStageCreateInput = z.infer<typeof customerLeadPipelineStageCreateSchema>
export type CustomerLeadPipelineStageUpdateInput = z.infer<typeof customerLeadPipelineStageUpdateSchema>
export type CustomerLeadPipelineStageDeleteInput = z.infer<typeof customerLeadPipelineStageDeleteSchema>
export type CustomerLeadLostReasonCreateInput = z.infer<typeof customerLeadLostReasonCreateSchema>
export type CustomerLeadLostReasonUpdateInput = z.infer<typeof customerLeadLostReasonUpdateSchema>
export type CustomerLeadLostReasonDeleteInput = z.infer<typeof customerLeadLostReasonDeleteSchema>
export type CustomerLeadFieldBindingCreateInput = z.infer<typeof customerLeadFieldBindingCreateSchema>
export type CustomerLeadFieldBindingUpdateInput = z.infer<typeof customerLeadFieldBindingUpdateSchema>
export type CustomerLeadFieldBindingDeleteInput = z.infer<typeof customerLeadFieldBindingDeleteSchema>
