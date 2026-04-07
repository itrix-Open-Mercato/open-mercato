import { registerCommand } from '@open-mercato/shared/lib/commands'
import type { CommandHandler } from '@open-mercato/shared/lib/commands'
import type { EntityManager } from '@mikro-orm/postgresql'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { randomUUID } from 'crypto'
import {
  CustomerLead,
  CustomerLeadHistory,
  CustomerLeadLostReason,
  CustomerLeadPipeline,
  CustomerLeadPipelineStage,
  type CustomerLeadOutcome,
} from '../data/entities'
import {
  customerLeadCreateSchema,
  customerLeadUpdateSchema,
  customerLeadDeleteSchema,
  type CustomerLeadCreateInput,
  type CustomerLeadUpdateInput,
  type CustomerLeadDeleteInput,
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
  metadata?: Record<string, unknown> | null
): void {
  em.persist(em.create(CustomerLeadHistory, {
    tenantId: lead.tenantId,
    organizationId: lead.organizationId,
    leadId: lead.id,
    eventType,
    actorUserId,
    metadata: metadata ?? null,
  }))
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

    await emitQueryIndexUpsertEvents(ctx, [{
      entityType: CUSTOMER_LEAD_ENTITY_ID,
      recordId: lead.id,
      tenantId: lead.tenantId,
      organizationId: lead.organizationId,
    }])

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

    await em.flush()
    await emitQueryIndexUpsertEvents(ctx, [{
      entityType: CUSTOMER_LEAD_ENTITY_ID,
      recordId: lead.id,
      tenantId: lead.tenantId,
      organizationId: lead.organizationId,
    }])
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

registerCommand(createLeadCommand)
registerCommand(updateLeadCommand)
registerCommand(deleteLeadCommand)

export { createLeadCommand, updateLeadCommand, deleteLeadCommand }
