import { registerCommand } from '@open-mercato/shared/lib/commands'
import type { CommandHandler } from '@open-mercato/shared/lib/commands'
import type { EntityManager } from '@mikro-orm/postgresql'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { randomUUID } from 'crypto'
import {
  CustomerLead,
  CustomerLeadHistory,
  CustomerLeadFieldBinding,
  CustomerLeadLostReason,
  CustomerLeadPipeline,
  CustomerLeadPipelineStage,
  CustomerEntity,
  CustomerPersonProfile,
  CustomerCompanyProfile,
  CustomerDeal,
  type CustomerLeadOutcome,
} from '../data/entities'
import {
  customerLeadCreateSchema,
  customerLeadUpdateSchema,
  customerLeadDeleteSchema,
  customerLeadAssignSchema,
  customerLeadAdvanceStageSchema,
  customerLeadMarkLostSchema,
  customerLeadLinkPersonSchema,
  customerLeadLinkCompanySchema,
  customerLeadLinkDealSchema,
  customerLeadCreatePersonSchema,
  customerLeadCreateCompanySchema,
  customerLeadCreateDealSchema,
  type CustomerLeadCreateInput,
  type CustomerLeadUpdateInput,
  type CustomerLeadDeleteInput,
  type CustomerLeadAssignInput,
  type CustomerLeadAdvanceStageInput,
  type CustomerLeadMarkLostInput,
  type CustomerLeadLinkPersonInput,
  type CustomerLeadLinkCompanyInput,
  type CustomerLeadLinkDealInput,
  type CustomerLeadCreatePersonInput,
  type CustomerLeadCreateCompanyInput,
  type CustomerLeadCreateDealInput,
} from '../data/validators'
import {
  ensureOrganizationScope,
  ensureTenantScope,
  emitQueryIndexDeleteEvents,
  emitQueryIndexUpsertEvents,
} from './shared'

type LeadScope = {
  tenantId: string
  organizationId: string
}

const CUSTOMER_LEAD_ENTITY_ID = 'customers:customer_lead'

type LeadTargetKind = 'person' | 'company' | 'deal'

function normalizeNumeric(input: number | null | undefined): string | null | undefined {
  if (input === undefined) return undefined
  if (input === null) return null
  return String(input)
}

function getActorUserId(ctx: Parameters<CommandHandler<any, any>['execute']>[1]): string | null {
  const auth = (ctx as any).auth
  return typeof auth?.userId === 'string' ? auth.userId : null
}

async function resolvePipelineAndStage(
  em: EntityManager,
  scope: LeadScope,
  input: Pick<CustomerLeadCreateInput | CustomerLeadUpdateInput, 'pipelineId' | 'stageId'>
): Promise<{ pipelineId: string; stageId: string }> {
  let pipeline: CustomerLeadPipeline | null = null

  if (input.pipelineId) {
    pipeline = await em.findOne(CustomerLeadPipeline, {
      id: input.pipelineId,
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      isActive: true,
    })
    if (!pipeline) throw new CrudHttpError(400, { error: 'Lead pipeline not found' })
  } else {
    pipeline =
      (await em.findOne(CustomerLeadPipeline, {
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        isDefault: true,
        isActive: true,
      })) ??
      (await em.findOne(CustomerLeadPipeline, {
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        isActive: true,
      }, { orderBy: { createdAt: 'asc' } }))
  }

  if (!pipeline) throw new CrudHttpError(400, { error: 'Lead pipeline is required' })

  let stage: CustomerLeadPipelineStage | null = null
  if (input.stageId) {
    stage = await em.findOne(CustomerLeadPipelineStage, {
      id: input.stageId,
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      pipelineId: pipeline.id,
      isActive: true,
    })
    if (!stage) throw new CrudHttpError(400, { error: 'Lead pipeline stage not found' })
  } else {
    stage = await em.findOne(CustomerLeadPipelineStage, {
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      pipelineId: pipeline.id,
      isActive: true,
    }, { orderBy: { position: 'asc' } })
  }

  if (!stage) throw new CrudHttpError(400, { error: 'Lead pipeline stage is required' })

  return { pipelineId: pipeline.id, stageId: stage.id }
}

async function assertLostReasonInScope(
  em: EntityManager,
  scope: LeadScope,
  lostReasonId: string | null | undefined,
  pipelineId: string
): Promise<void> {
  if (!lostReasonId) return
  const reason = await em.findOne(CustomerLeadLostReason, {
    id: lostReasonId,
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    isActive: true,
  })
  if (!reason) throw new CrudHttpError(400, { error: 'Lead lost reason not found' })
  if (reason.pipelineId && reason.pipelineId !== pipelineId) {
    throw new CrudHttpError(400, { error: 'Lead lost reason does not belong to the selected pipeline' })
  }
}

function applyLeadPatch(lead: CustomerLead, parsed: CustomerLeadUpdateInput): void {
  if (parsed.pipelineId !== undefined) lead.pipelineId = parsed.pipelineId
  if (parsed.stageId !== undefined) lead.stageId = parsed.stageId
  if (parsed.outcome !== undefined) lead.outcome = parsed.outcome
  if (parsed.lostReasonId !== undefined) lead.lostReasonId = parsed.lostReasonId
  if (parsed.displayName !== undefined) lead.displayName = parsed.displayName
  if (parsed.ownerUserId !== undefined) lead.ownerUserId = parsed.ownerUserId
  if (parsed.source !== undefined) lead.source = parsed.source
  if (parsed.sourceChannel !== undefined) lead.sourceChannel = parsed.sourceChannel
  if (parsed.sourceExternalId !== undefined) lead.sourceExternalId = parsed.sourceExternalId
  if (parsed.sourcePayloadRaw !== undefined) lead.sourcePayloadRaw = parsed.sourcePayloadRaw
  if (parsed.sourceReceivedAt !== undefined) lead.sourceReceivedAt = parsed.sourceReceivedAt
  if (parsed.primaryEmail !== undefined) lead.primaryEmail = parsed.primaryEmail
  if (parsed.primaryPhone !== undefined) lead.primaryPhone = parsed.primaryPhone
  if (parsed.vatId !== undefined) lead.vatId = parsed.vatId
  if (parsed.spamScore !== undefined) lead.spamScore = normalizeNumeric(parsed.spamScore)
  if (parsed.qualificationNotes !== undefined) lead.qualificationNotes = parsed.qualificationNotes
  if (parsed.personData !== undefined) lead.personData = parsed.personData
  if (parsed.companyData !== undefined) lead.companyData = parsed.companyData
  if (parsed.dealData !== undefined) lead.dealData = parsed.dealData
  if (parsed.createdPersonId !== undefined) lead.createdPersonId = parsed.createdPersonId
  if (parsed.createdCompanyId !== undefined) lead.createdCompanyId = parsed.createdCompanyId
  if (parsed.createdDealId !== undefined) lead.createdDealId = parsed.createdDealId
  if (parsed.linkedPersonId !== undefined) lead.linkedPersonId = parsed.linkedPersonId
  if (parsed.linkedCompanyId !== undefined) lead.linkedCompanyId = parsed.linkedCompanyId
  if (parsed.linkedDealId !== undefined) lead.linkedDealId = parsed.linkedDealId
  if (parsed.convertedAt !== undefined) lead.convertedAt = parsed.convertedAt
  if (parsed.convertedByUserId !== undefined) lead.convertedByUserId = parsed.convertedByUserId
}

function addLeadHistory(
  em: EntityManager,
  lead: CustomerLead,
  eventType: string,
  actorUserId: string | null,
  metadata?: Record<string, unknown> | null,
  note?: string | null
): void {
  em.persist(em.create(CustomerLeadHistory, {
    tenantId: lead.tenantId,
    organizationId: lead.organizationId,
    leadId: lead.id,
    eventType,
    actorUserId,
    note: note ?? null,
    metadata: metadata ?? null,
  }))
}

async function loadLeadForAction(em: EntityManager, id: string, scope: LeadScope): Promise<CustomerLead> {
  const lead = await em.findOne(CustomerLead, {
    id,
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    deletedAt: null,
  })
  if (!lead) throw new CrudHttpError(404, { error: 'Lead not found' })
  return lead
}

function splitDisplayName(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return { firstName: 'Lead', lastName: 'Contact' }
  if (parts.length === 1) return { firstName: parts[0], lastName: 'Contact' }
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] }
}

function readLeadScalar(lead: CustomerLead, key: string): unknown {
  switch (key) {
    case 'displayName': return lead.displayName
    case 'primaryEmail': return lead.primaryEmail ?? null
    case 'primaryPhone': return lead.primaryPhone ?? null
    case 'ownerUserId': return lead.ownerUserId ?? null
    case 'source': return lead.source ?? null
    case 'qualificationNotes': return lead.qualificationNotes ?? null
    default: return undefined
  }
}

function writeTargetScalar(
  target: CustomerEntity | CustomerPersonProfile | CustomerCompanyProfile | CustomerDeal,
  key: string,
  value: unknown,
): boolean {
  if (value !== null && value !== undefined && typeof value !== 'string') return false
  const next = value ?? null
  if (target instanceof CustomerDeal) {
    if (key === 'title' && typeof value === 'string' && value.trim()) target.title = value
    else if (key === 'description') target.description = next
    else if (key === 'ownerUserId') target.ownerUserId = next
    else if (key === 'source') target.source = next
    else return false
    target.updatedAt = new Date()
    return true
  }
  if (target instanceof CustomerEntity) {
    if (key === 'displayName' && typeof value === 'string' && value.trim()) target.displayName = value
    else if (key === 'primaryEmail') target.primaryEmail = next
    else if (key === 'primaryPhone') target.primaryPhone = next
    else if (key === 'ownerUserId') target.ownerUserId = next
    else if (key === 'source') target.source = next
    else if (key === 'description') target.description = next
    else return false
    target.updatedAt = new Date()
    return true
  }
  if (target instanceof CustomerCompanyProfile) {
    if (key === 'legalName') target.legalName = next
    else if (key === 'brandName') target.brandName = next
    else if (key === 'domain') target.domain = next
    else if (key === 'websiteUrl') target.websiteUrl = next
    else if (key === 'industry') target.industry = next
    else return false
    target.updatedAt = new Date()
    return true
  }
  if (target instanceof CustomerPersonProfile) {
    if (key === 'firstName') target.firstName = next
    else if (key === 'lastName') target.lastName = next
    else if (key === 'jobTitle') target.jobTitle = next
    else if (key === 'department') target.department = next
    else return false
    target.updatedAt = new Date()
    return true
  }
  return false
}

async function resolveWriteThroughTarget(
  em: EntityManager,
  lead: CustomerLead,
  kind: LeadTargetKind,
  targetFieldKey: string,
): Promise<CustomerEntity | CustomerPersonProfile | CustomerCompanyProfile | CustomerDeal | null> {
  if (kind === 'deal') {
    if (!lead.linkedDealId) return null
    return await em.findOne(CustomerDeal, {
      id: lead.linkedDealId,
      tenantId: lead.tenantId,
      organizationId: lead.organizationId,
      deletedAt: null,
    })
  }
  const entityId = kind === 'person' ? lead.linkedPersonId : lead.linkedCompanyId
  if (!entityId) return null
  const entity = await em.findOne(CustomerEntity, {
    id: entityId,
    kind,
    tenantId: lead.tenantId,
    organizationId: lead.organizationId,
    deletedAt: null,
  })
  if (!entity) return null
  if (['displayName', 'primaryEmail', 'primaryPhone', 'ownerUserId', 'source', 'description'].includes(targetFieldKey)) {
    return entity
  }
  return kind === 'person'
    ? await em.findOne(CustomerPersonProfile, { entity })
    : await em.findOne(CustomerCompanyProfile, { entity })
}

async function applySharedFieldWriteThrough(em: EntityManager, lead: CustomerLead): Promise<void> {
  const bindings = await em.find(CustomerLeadFieldBinding, {
    tenantId: lead.tenantId,
    organizationId: lead.organizationId,
    bindingMode: 'shared',
    isActive: true,
    $or: [{ pipelineId: null }, { pipelineId: lead.pipelineId }],
  })
  for (const binding of bindings) {
    if (!binding.targetEntityKind || !binding.targetFieldKey) continue
    const value = readLeadScalar(lead, binding.leadFieldKey)
    if (value === undefined) continue
    const target = await resolveWriteThroughTarget(em, lead, binding.targetEntityKind, binding.targetFieldKey)
    if (!target) continue
    writeTargetScalar(target, binding.targetFieldKey, value)
  }
}

async function emitLeadUpsert(ctx: Parameters<CommandHandler<any, any>['execute']>[1], lead: CustomerLead): Promise<void> {
  await emitQueryIndexUpsertEvents(ctx, [{
    entityType: CUSTOMER_LEAD_ENTITY_ID,
    recordId: lead.id,
    tenantId: lead.tenantId,
    organizationId: lead.organizationId,
  }])
}

const createLeadCommand: CommandHandler<CustomerLeadCreateInput, { leadId: string }> = {
  id: 'customers.leads.create',
  async execute(rawInput, ctx) {
    const parsed = customerLeadCreateSchema.parse(rawInput)
    ensureTenantScope(ctx, parsed.tenantId)
    ensureOrganizationScope(ctx, parsed.organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const scope = { tenantId: parsed.tenantId, organizationId: parsed.organizationId }
    const { pipelineId, stageId } = await resolvePipelineAndStage(em, scope, parsed)
    await assertLostReasonInScope(em, scope, parsed.lostReasonId, pipelineId)

    const lead = em.create(CustomerLead, {
      id: randomUUID(),
      tenantId: parsed.tenantId,
      organizationId: parsed.organizationId,
      pipelineId,
      stageId,
      outcome: parsed.outcome ?? 'open',
      lostReasonId: parsed.lostReasonId ?? null,
      displayName: parsed.displayName,
      ownerUserId: parsed.ownerUserId ?? null,
      source: parsed.source ?? null,
      sourceChannel: parsed.sourceChannel ?? null,
      sourceExternalId: parsed.sourceExternalId ?? null,
      sourcePayloadRaw: parsed.sourcePayloadRaw ?? null,
      sourceReceivedAt: parsed.sourceReceivedAt ?? null,
      primaryEmail: parsed.primaryEmail ?? null,
      primaryPhone: parsed.primaryPhone ?? null,
      vatId: parsed.vatId ?? null,
      spamScore: normalizeNumeric(parsed.spamScore) ?? null,
      qualificationNotes: parsed.qualificationNotes ?? null,
      personData: parsed.personData ?? null,
      companyData: parsed.companyData ?? null,
      dealData: parsed.dealData ?? null,
      createdPersonId: parsed.createdPersonId ?? null,
      createdCompanyId: parsed.createdCompanyId ?? null,
      createdDealId: parsed.createdDealId ?? null,
      linkedPersonId: parsed.linkedPersonId ?? null,
      linkedCompanyId: parsed.linkedCompanyId ?? null,
      linkedDealId: parsed.linkedDealId ?? null,
      convertedAt: parsed.convertedAt ?? null,
      convertedByUserId: parsed.convertedByUserId ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    em.persist(lead)
    addLeadHistory(em, lead, 'created', getActorUserId(ctx))
    await em.flush()

    await emitLeadUpsert(ctx, lead)

    return { leadId: lead.id }
  },
}

const updateLeadCommand: CommandHandler<CustomerLeadUpdateInput, void> = {
  id: 'customers.leads.update',
  async execute(rawInput, ctx) {
    const parsed = customerLeadUpdateSchema.parse(rawInput)

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const lead = await em.findOne(CustomerLead, { id: parsed.id, deletedAt: null })
    if (!lead) throw new CrudHttpError(404, { error: 'Lead not found' })

    ensureTenantScope(ctx, lead.tenantId)
    ensureOrganizationScope(ctx, lead.organizationId)

    const previousStageId = lead.stageId
    const previousOutcome = lead.outcome
    if (parsed.pipelineId !== undefined || parsed.stageId !== undefined) {
      const resolved = await resolvePipelineAndStage(em, {
        tenantId: lead.tenantId,
        organizationId: lead.organizationId,
      }, {
        pipelineId: parsed.pipelineId ?? lead.pipelineId,
        stageId: parsed.stageId ?? lead.stageId,
      })
      parsed.pipelineId = resolved.pipelineId
      parsed.stageId = resolved.stageId
    }
    await assertLostReasonInScope(em, {
      tenantId: lead.tenantId,
      organizationId: lead.organizationId,
    }, parsed.lostReasonId ?? lead.lostReasonId, parsed.pipelineId ?? lead.pipelineId)

    applyLeadPatch(lead, parsed)
    if (lead.outcome !== 'lost') lead.lostReasonId = null
    lead.updatedAt = new Date()

    const actorUserId = getActorUserId(ctx)
    addLeadHistory(em, lead, 'updated', actorUserId)
    if (previousStageId !== lead.stageId) {
      addLeadHistory(em, lead, 'stage_changed', actorUserId, {
        fromStageId: previousStageId,
        toStageId: lead.stageId,
      })
    }
    if (previousOutcome !== lead.outcome && lead.outcome !== 'open') {
      addLeadHistory(em, lead, lead.outcome === 'won' ? 'won' : 'lost', actorUserId, {
        fromOutcome: previousOutcome,
        toOutcome: lead.outcome,
      })
    }

    await applySharedFieldWriteThrough(em, lead)
    await em.flush()
    await emitLeadUpsert(ctx, lead)
  },
}

const deleteLeadCommand: CommandHandler<CustomerLeadDeleteInput, void> = {
  id: 'customers.leads.delete',
  async execute(rawInput, ctx) {
    const parsed = customerLeadDeleteSchema.parse(rawInput)

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const lead = await em.findOne(CustomerLead, { id: parsed.id, deletedAt: null })
    if (!lead) throw new CrudHttpError(404, { error: 'Lead not found' })

    ensureTenantScope(ctx, lead.tenantId)
    ensureOrganizationScope(ctx, lead.organizationId)

    lead.deletedAt = new Date()
    lead.updatedAt = new Date()
    addLeadHistory(em, lead, 'deleted', getActorUserId(ctx))
    await em.flush()

    await emitQueryIndexDeleteEvents(ctx, [{
      entityType: CUSTOMER_LEAD_ENTITY_ID,
      recordId: lead.id,
      tenantId: lead.tenantId,
      organizationId: lead.organizationId,
    }])
  },
}

const assignLeadCommand: CommandHandler<CustomerLeadAssignInput, void> = {
  id: 'customers.leads.assign',
  async execute(rawInput, ctx) {
    const parsed = customerLeadAssignSchema.parse(rawInput)
    ensureTenantScope(ctx, parsed.tenantId)
    ensureOrganizationScope(ctx, parsed.organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const lead = await em.findOne(CustomerLead, {
      id: parsed.id,
      tenantId: parsed.tenantId,
      organizationId: parsed.organizationId,
      deletedAt: null,
    })
    if (!lead) throw new CrudHttpError(404, { error: 'Lead not found' })

    const previousOwnerUserId = lead.ownerUserId ?? null
    lead.ownerUserId = parsed.ownerUserId ?? null
    lead.updatedAt = new Date()
    addLeadHistory(em, lead, 'assigned', getActorUserId(ctx), {
      fromOwnerUserId: previousOwnerUserId,
      toOwnerUserId: lead.ownerUserId ?? null,
    })
    await em.flush()
    await emitLeadUpsert(ctx, lead)
  },
}

const advanceLeadStageCommand: CommandHandler<CustomerLeadAdvanceStageInput, void> = {
  id: 'customers.leads.advance-stage',
  async execute(rawInput, ctx) {
    const parsed = customerLeadAdvanceStageSchema.parse(rawInput)
    ensureTenantScope(ctx, parsed.tenantId)
    ensureOrganizationScope(ctx, parsed.organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const lead = await em.findOne(CustomerLead, {
      id: parsed.id,
      tenantId: parsed.tenantId,
      organizationId: parsed.organizationId,
      deletedAt: null,
    })
    if (!lead) throw new CrudHttpError(404, { error: 'Lead not found' })

    const stage = await em.findOne(CustomerLeadPipelineStage, {
      id: parsed.stageId,
      tenantId: lead.tenantId,
      organizationId: lead.organizationId,
      pipelineId: lead.pipelineId,
      isActive: true,
    })
    if (!stage) throw new CrudHttpError(400, { error: 'Lead pipeline stage not found' })
    if (stage.kind === 'lost' && !parsed.lostReasonId) {
      throw new CrudHttpError(400, { error: 'Lost reason is required for lost stage' })
    }
    await assertLostReasonInScope(em, {
      tenantId: lead.tenantId,
      organizationId: lead.organizationId,
    }, parsed.lostReasonId ?? null, lead.pipelineId)

    const previousStageId = lead.stageId
    const previousOutcome = lead.outcome
    const previousLostReasonId = lead.lostReasonId ?? null
    lead.stageId = stage.id
    lead.outcome = stage.kind
    lead.lostReasonId = stage.kind === 'lost' ? parsed.lostReasonId ?? null : null
    lead.updatedAt = new Date()

    addLeadHistory(em, lead, 'stage_changed', getActorUserId(ctx), {
      fromStageId: previousStageId,
      toStageId: stage.id,
      fromOutcome: previousOutcome,
      toOutcome: lead.outcome,
      fromLostReasonId: previousLostReasonId,
      toLostReasonId: lead.lostReasonId ?? null,
    }, parsed.note ?? null)

    await em.flush()
    await emitLeadUpsert(ctx, lead)
  },
}

const markLeadLostCommand: CommandHandler<CustomerLeadMarkLostInput, void> = {
  id: 'customers.leads.mark-lost',
  async execute(rawInput, ctx) {
    const parsed = customerLeadMarkLostSchema.parse(rawInput)
    ensureTenantScope(ctx, parsed.tenantId)
    ensureOrganizationScope(ctx, parsed.organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const lead = await em.findOne(CustomerLead, {
      id: parsed.id,
      tenantId: parsed.tenantId,
      organizationId: parsed.organizationId,
      deletedAt: null,
    })
    if (!lead) throw new CrudHttpError(404, { error: 'Lead not found' })
    await assertLostReasonInScope(em, {
      tenantId: lead.tenantId,
      organizationId: lead.organizationId,
    }, parsed.lostReasonId, lead.pipelineId)

    const lostStage = await em.findOne(CustomerLeadPipelineStage, {
      tenantId: lead.tenantId,
      organizationId: lead.organizationId,
      pipelineId: lead.pipelineId,
      kind: 'lost',
      isActive: true,
    }, { orderBy: { position: 'asc' } })

    const previousStageId = lead.stageId
    const previousOutcome = lead.outcome
    const previousLostReasonId = lead.lostReasonId ?? null
    if (lostStage) lead.stageId = lostStage.id
    lead.outcome = 'lost'
    lead.lostReasonId = parsed.lostReasonId
    lead.updatedAt = new Date()
    addLeadHistory(em, lead, 'lost', getActorUserId(ctx), {
      fromStageId: previousStageId,
      toStageId: lead.stageId,
      fromOutcome: previousOutcome,
      toOutcome: 'lost',
      fromLostReasonId: previousLostReasonId,
      toLostReasonId: parsed.lostReasonId,
    }, parsed.note ?? null)

    await em.flush()
    await emitLeadUpsert(ctx, lead)
  },
}

const linkLeadPersonCommand: CommandHandler<CustomerLeadLinkPersonInput, void> = {
  id: 'customers.leads.link-person',
  async execute(rawInput, ctx) {
    const parsed = customerLeadLinkPersonSchema.parse(rawInput)
    ensureTenantScope(ctx, parsed.tenantId)
    ensureOrganizationScope(ctx, parsed.organizationId)
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const lead = await loadLeadForAction(em, parsed.leadId, parsed)
    const person = await em.findOne(CustomerEntity, {
      id: parsed.personId,
      kind: 'person',
      tenantId: parsed.tenantId,
      organizationId: parsed.organizationId,
      deletedAt: null,
    })
    if (!person) throw new CrudHttpError(404, { error: 'Person not found' })
    lead.linkedPersonId = person.id
    lead.updatedAt = new Date()
    await applySharedFieldWriteThrough(em, lead)
    addLeadHistory(em, lead, 'person_linked', getActorUserId(ctx), { personId: person.id })
    await em.flush()
    await emitLeadUpsert(ctx, lead)
  },
}

const linkLeadCompanyCommand: CommandHandler<CustomerLeadLinkCompanyInput, void> = {
  id: 'customers.leads.link-company',
  async execute(rawInput, ctx) {
    const parsed = customerLeadLinkCompanySchema.parse(rawInput)
    ensureTenantScope(ctx, parsed.tenantId)
    ensureOrganizationScope(ctx, parsed.organizationId)
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const lead = await loadLeadForAction(em, parsed.leadId, parsed)
    const company = await em.findOne(CustomerEntity, {
      id: parsed.companyId,
      kind: 'company',
      tenantId: parsed.tenantId,
      organizationId: parsed.organizationId,
      deletedAt: null,
    })
    if (!company) throw new CrudHttpError(404, { error: 'Company not found' })
    lead.linkedCompanyId = company.id
    lead.updatedAt = new Date()
    await applySharedFieldWriteThrough(em, lead)
    addLeadHistory(em, lead, 'company_linked', getActorUserId(ctx), { companyId: company.id })
    await em.flush()
    await emitLeadUpsert(ctx, lead)
  },
}

const linkLeadDealCommand: CommandHandler<CustomerLeadLinkDealInput, void> = {
  id: 'customers.leads.link-deal',
  async execute(rawInput, ctx) {
    const parsed = customerLeadLinkDealSchema.parse(rawInput)
    ensureTenantScope(ctx, parsed.tenantId)
    ensureOrganizationScope(ctx, parsed.organizationId)
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const lead = await loadLeadForAction(em, parsed.leadId, parsed)
    const deal = await em.findOne(CustomerDeal, {
      id: parsed.dealId,
      tenantId: parsed.tenantId,
      organizationId: parsed.organizationId,
      deletedAt: null,
    })
    if (!deal) throw new CrudHttpError(404, { error: 'Deal not found' })
    lead.linkedDealId = deal.id
    lead.updatedAt = new Date()
    await applySharedFieldWriteThrough(em, lead)
    addLeadHistory(em, lead, 'deal_linked', getActorUserId(ctx), { dealId: deal.id })
    await em.flush()
    await emitLeadUpsert(ctx, lead)
  },
}

const createLeadPersonCommand: CommandHandler<CustomerLeadCreatePersonInput, { personId: string; entityId: string }> = {
  id: 'customers.leads.create-person',
  async execute(rawInput, ctx) {
    const parsed = customerLeadCreatePersonSchema.parse(rawInput)
    ensureTenantScope(ctx, parsed.tenantId)
    ensureOrganizationScope(ctx, parsed.organizationId)
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const lead = await loadLeadForAction(em, parsed.leadId, parsed)
    const names = splitDisplayName(lead.displayName)
    const entity = em.create(CustomerEntity, {
      id: randomUUID(),
      tenantId: lead.tenantId,
      organizationId: lead.organizationId,
      kind: 'person',
      displayName: parsed.overrides?.displayName ?? lead.displayName,
      ownerUserId: parsed.overrides?.ownerUserId ?? lead.ownerUserId ?? null,
      primaryEmail: parsed.overrides?.primaryEmail ?? lead.primaryEmail ?? null,
      primaryPhone: parsed.overrides?.primaryPhone ?? lead.primaryPhone ?? null,
      source: parsed.overrides?.source ?? lead.source ?? null,
      isActive: true,
    })
    const profile = em.create(CustomerPersonProfile, {
      id: randomUUID(),
      tenantId: lead.tenantId,
      organizationId: lead.organizationId,
      entity,
      firstName: parsed.overrides?.firstName ?? names.firstName,
      lastName: parsed.overrides?.lastName ?? names.lastName,
    })
    em.persist(entity)
    em.persist(profile)
    lead.createdPersonId = entity.id
    lead.linkedPersonId = entity.id
    lead.updatedAt = new Date()
    await applySharedFieldWriteThrough(em, lead)
    addLeadHistory(em, lead, 'person_created', getActorUserId(ctx), { personId: entity.id, profileId: profile.id })
    await em.flush()
    await emitLeadUpsert(ctx, lead)
    return { personId: profile.id, entityId: entity.id }
  },
}

const createLeadCompanyCommand: CommandHandler<CustomerLeadCreateCompanyInput, { companyId: string; entityId: string }> = {
  id: 'customers.leads.create-company',
  async execute(rawInput, ctx) {
    const parsed = customerLeadCreateCompanySchema.parse(rawInput)
    ensureTenantScope(ctx, parsed.tenantId)
    ensureOrganizationScope(ctx, parsed.organizationId)
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const lead = await loadLeadForAction(em, parsed.leadId, parsed)
    const entity = em.create(CustomerEntity, {
      id: randomUUID(),
      tenantId: lead.tenantId,
      organizationId: lead.organizationId,
      kind: 'company',
      displayName: parsed.overrides?.displayName ?? lead.displayName,
      ownerUserId: parsed.overrides?.ownerUserId ?? lead.ownerUserId ?? null,
      primaryEmail: parsed.overrides?.primaryEmail ?? lead.primaryEmail ?? null,
      primaryPhone: parsed.overrides?.primaryPhone ?? lead.primaryPhone ?? null,
      source: parsed.overrides?.source ?? lead.source ?? null,
      isActive: true,
    })
    const profile = em.create(CustomerCompanyProfile, {
      id: randomUUID(),
      tenantId: lead.tenantId,
      organizationId: lead.organizationId,
      entity,
      legalName: parsed.overrides?.legalName ?? lead.displayName,
    })
    em.persist(entity)
    em.persist(profile)
    lead.createdCompanyId = entity.id
    lead.linkedCompanyId = entity.id
    lead.updatedAt = new Date()
    await applySharedFieldWriteThrough(em, lead)
    addLeadHistory(em, lead, 'company_created', getActorUserId(ctx), { companyId: entity.id, profileId: profile.id })
    await em.flush()
    await emitLeadUpsert(ctx, lead)
    return { companyId: profile.id, entityId: entity.id }
  },
}

const createLeadDealCommand: CommandHandler<CustomerLeadCreateDealInput, { dealId: string }> = {
  id: 'customers.leads.create-deal',
  async execute(rawInput, ctx) {
    const parsed = customerLeadCreateDealSchema.parse(rawInput)
    ensureTenantScope(ctx, parsed.tenantId)
    ensureOrganizationScope(ctx, parsed.organizationId)
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const lead = await loadLeadForAction(em, parsed.leadId, parsed)
    const deal = em.create(CustomerDeal, {
      id: randomUUID(),
      tenantId: lead.tenantId,
      organizationId: lead.organizationId,
      title: parsed.overrides?.title ?? lead.displayName,
      description: parsed.overrides?.description ?? lead.qualificationNotes ?? null,
      status: parsed.overrides?.status ?? 'open',
      ownerUserId: parsed.overrides?.ownerUserId ?? lead.ownerUserId ?? null,
      source: parsed.overrides?.source ?? lead.source ?? null,
    })
    em.persist(deal)
    lead.createdDealId = deal.id
    lead.linkedDealId = deal.id
    lead.updatedAt = new Date()
    await applySharedFieldWriteThrough(em, lead)
    addLeadHistory(em, lead, 'deal_created', getActorUserId(ctx), { dealId: deal.id })
    await em.flush()
    await emitLeadUpsert(ctx, lead)
    return { dealId: deal.id }
  },
}

registerCommand(createLeadCommand)
registerCommand(updateLeadCommand)
registerCommand(deleteLeadCommand)
registerCommand(assignLeadCommand)
registerCommand(advanceLeadStageCommand)
registerCommand(markLeadLostCommand)
registerCommand(linkLeadPersonCommand)
registerCommand(linkLeadCompanyCommand)
registerCommand(linkLeadDealCommand)
registerCommand(createLeadPersonCommand)
registerCommand(createLeadCompanyCommand)
registerCommand(createLeadDealCommand)

export {
  createLeadCommand,
  updateLeadCommand,
  deleteLeadCommand,
  assignLeadCommand,
  advanceLeadStageCommand,
  markLeadLostCommand,
  linkLeadPersonCommand,
  linkLeadCompanyCommand,
  linkLeadDealCommand,
  createLeadPersonCommand,
  createLeadCompanyCommand,
  createLeadDealCommand,
}
