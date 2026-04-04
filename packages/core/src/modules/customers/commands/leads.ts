import { registerCommand } from '@open-mercato/shared/lib/commands'
import type { CommandHandler } from '@open-mercato/shared/lib/commands'
import {
  emitCrudSideEffects,
  emitCrudUndoSideEffects,
  requireId,
} from '@open-mercato/shared/lib/commands/helpers'
import type { DataEngine } from '@open-mercato/shared/lib/data/engine'
import type { EntityManager } from '@mikro-orm/postgresql'
import { CustomerLead, CustomerLeadPipelineStage } from '../data/entities'
import {
  leadCreateSchema,
  leadUpdateSchema,
  leadAssignSchema,
  leadAdvanceStageSchema,
  leadMarkLostSchema,
  type LeadCreateInput,
  type LeadUpdateInput,
  type LeadAssignInput,
  type LeadAdvanceStageInput,
  type LeadMarkLostInput,
} from '../data/validators'
import { ensureOrganizationScope, ensureTenantScope, extractUndoPayload } from './shared'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import type { CrudIndexerConfig, CrudEventsConfig } from '@open-mercato/shared/lib/crud/types'
import { E } from '#generated/entities.ids.generated'
import { emitCustomersEvent } from '../events'

const LEAD_ENTITY_TYPE = E.customers.customer_lead

const leadCrudIndexer: CrudIndexerConfig<CustomerLead> = {
  entityType: LEAD_ENTITY_TYPE,
}

const leadCrudEvents: CrudEventsConfig = {
  module: 'customers',
  entity: 'lead',
  persistent: true,
  buildPayload: (ctx) => ({
    id: ctx.identifiers.id,
    organizationId: ctx.identifiers.organizationId,
    tenantId: ctx.identifiers.tenantId,
  }),
}

type LeadSnapshot = {
  id: string
  organizationId: string
  tenantId: string
  pipelineId: string
  stageId: string
  outcome: string
  lostReasonId: string | null
  displayName: string
  ownerUserId: string | null
  source: string | null
  sourceChannel: string | null
  sourceExternalId: string | null
  primaryEmail: string | null
  primaryPhone: string | null
  vatId: string | null
  qualificationNotes: string | null
}

type LeadUndoPayload = {
  before?: LeadSnapshot | null
  after?: LeadSnapshot | null
}

async function loadLeadSnapshot(em: EntityManager, id: string): Promise<LeadSnapshot | null> {
  const lead = await em.findOne(CustomerLead, { id, deletedAt: null })
  if (!lead) return null
  return {
    id: lead.id,
    organizationId: lead.organizationId,
    tenantId: lead.tenantId,
    pipelineId: lead.pipelineId,
    stageId: lead.stageId,
    outcome: lead.outcome,
    lostReasonId: lead.lostReasonId ?? null,
    displayName: lead.displayName,
    ownerUserId: lead.ownerUserId ?? null,
    source: lead.source ?? null,
    sourceChannel: lead.sourceChannel ?? null,
    sourceExternalId: lead.sourceExternalId ?? null,
    primaryEmail: lead.primaryEmail ?? null,
    primaryPhone: lead.primaryPhone ?? null,
    vatId: lead.vatId ?? null,
    qualificationNotes: lead.qualificationNotes ?? null,
  }
}

const createLeadCommand: CommandHandler<LeadCreateInput, { leadId: string }> = {
  id: 'customers.leads.create',
  async execute(rawInput, ctx) {
    const parsed = leadCreateSchema.parse(rawInput)
    ensureTenantScope(ctx, parsed.tenantId)
    ensureOrganizationScope(ctx, parsed.organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const lead = em.create(CustomerLead, {
      organizationId: parsed.organizationId,
      tenantId: parsed.tenantId,
      pipelineId: parsed.pipelineId,
      stageId: parsed.stageId,
      displayName: parsed.displayName,
      outcome: parsed.outcome ?? 'open',
      lostReasonId: parsed.lostReasonId ?? null,
      ownerUserId: parsed.ownerUserId ?? null,
      source: parsed.source ?? null,
      sourceChannel: parsed.sourceChannel ?? null,
      sourceExternalId: parsed.sourceExternalId ?? null,
      sourcePayloadRaw: parsed.sourcePayloadRaw ?? null,
      sourceReceivedAt: parsed.sourceReceivedAt ?? null,
      primaryEmail: parsed.primaryEmail ?? null,
      primaryPhone: parsed.primaryPhone ?? null,
      vatId: parsed.vatId ?? null,
      spamScore: parsed.spamScore != null ? String(parsed.spamScore) : null,
      qualificationNotes: parsed.qualificationNotes ?? null,
      personData: parsed.personData ?? null,
      companyData: parsed.companyData ?? null,
      dealData: parsed.dealData ?? null,
    })
    em.persist(lead)
    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'created',
      entity: lead,
      identifiers: { id: lead.id, organizationId: lead.organizationId, tenantId: lead.tenantId },
      indexer: leadCrudIndexer,
      events: leadCrudEvents,
    })

    return { leadId: lead.id }
  },
  captureAfter: async (_input, result, ctx) => {
    const em = ctx.container.resolve('em') as EntityManager
    return await loadLeadSnapshot(em, result.leadId)
  },
  buildLog: async ({ result, snapshots }) => {
    const { translate } = await resolveTranslations()
    const snapshot = snapshots.after as LeadSnapshot | undefined
    return {
      actionLabel: translate('customers.audit.leads.create', 'Create lead'),
      resourceKind: 'customers.lead',
      resourceId: result.leadId,
      tenantId: snapshot?.tenantId ?? null,
      organizationId: snapshot?.organizationId ?? null,
      snapshotAfter: snapshot ?? null,
      payload: { undo: { after: snapshot } satisfies LeadUndoPayload },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const leadId = logEntry?.resourceId
    if (!leadId) return
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const lead = await em.findOne(CustomerLead, { id: leadId })
    if (!lead) return
    em.remove(lead)
    await em.flush()
  },
}

const updateLeadCommand: CommandHandler<LeadUpdateInput, { leadId: string }> = {
  id: 'customers.leads.update',
  async prepare(rawInput, ctx) {
    const parsed = leadUpdateSchema.parse(rawInput)
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadLeadSnapshot(em, parsed.id)
    return snapshot ? { before: snapshot } : {}
  },
  async execute(rawInput, ctx) {
    const parsed = leadUpdateSchema.parse(rawInput)
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const lead = await em.findOne(CustomerLead, { id: parsed.id, deletedAt: null })
    if (!lead) throw new CrudHttpError(404, { error: 'Lead not found' })
    ensureTenantScope(ctx, lead.tenantId)
    ensureOrganizationScope(ctx, lead.organizationId)

    if (parsed.pipelineId !== undefined) lead.pipelineId = parsed.pipelineId
    if (parsed.stageId !== undefined) lead.stageId = parsed.stageId
    if (parsed.displayName !== undefined) lead.displayName = parsed.displayName
    if (parsed.outcome !== undefined) lead.outcome = parsed.outcome
    if (parsed.lostReasonId !== undefined) lead.lostReasonId = parsed.lostReasonId ?? null
    if (parsed.ownerUserId !== undefined) lead.ownerUserId = parsed.ownerUserId ?? null
    if (parsed.source !== undefined) lead.source = parsed.source ?? null
    if (parsed.sourceChannel !== undefined) lead.sourceChannel = parsed.sourceChannel ?? null
    if (parsed.sourceExternalId !== undefined) lead.sourceExternalId = parsed.sourceExternalId ?? null
    if (parsed.sourcePayloadRaw !== undefined) lead.sourcePayloadRaw = parsed.sourcePayloadRaw ?? null
    if (parsed.sourceReceivedAt !== undefined) lead.sourceReceivedAt = parsed.sourceReceivedAt ?? null
    if (parsed.primaryEmail !== undefined) lead.primaryEmail = parsed.primaryEmail ?? null
    if (parsed.primaryPhone !== undefined) lead.primaryPhone = parsed.primaryPhone ?? null
    if (parsed.vatId !== undefined) lead.vatId = parsed.vatId ?? null
    if (parsed.spamScore !== undefined) lead.spamScore = parsed.spamScore != null ? String(parsed.spamScore) : null
    if (parsed.qualificationNotes !== undefined) lead.qualificationNotes = parsed.qualificationNotes ?? null
    if (parsed.personData !== undefined) lead.personData = parsed.personData ?? null
    if (parsed.companyData !== undefined) lead.companyData = parsed.companyData ?? null
    if (parsed.dealData !== undefined) lead.dealData = parsed.dealData ?? null

    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'updated',
      entity: lead,
      identifiers: { id: lead.id, organizationId: lead.organizationId, tenantId: lead.tenantId },
      indexer: leadCrudIndexer,
      events: leadCrudEvents,
    })

    return { leadId: lead.id }
  },
  captureAfter: async (_input, result, ctx) => {
    const em = ctx.container.resolve('em') as EntityManager
    return await loadLeadSnapshot(em, result.leadId)
  },
  buildLog: async ({ snapshots }) => {
    const { translate } = await resolveTranslations()
    const before = snapshots.before as LeadSnapshot | undefined
    if (!before) return null
    const afterSnapshot = snapshots.after as LeadSnapshot | undefined
    return {
      actionLabel: translate('customers.audit.leads.update', 'Update lead'),
      resourceKind: 'customers.lead',
      resourceId: before.id,
      tenantId: before.tenantId,
      organizationId: before.organizationId,
      snapshotBefore: before,
      snapshotAfter: afterSnapshot ?? null,
      payload: { undo: { before, after: afterSnapshot ?? null } satisfies LeadUndoPayload },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<LeadUndoPayload>(logEntry)
    const before = payload?.before
    if (!before) return
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    let lead = await em.findOne(CustomerLead, { id: before.id })
    if (!lead) {
      lead = em.create(CustomerLead, {
        id: before.id,
        organizationId: before.organizationId,
        tenantId: before.tenantId,
        pipelineId: before.pipelineId,
        stageId: before.stageId,
        outcome: before.outcome as 'open' | 'won' | 'lost',
        displayName: before.displayName,
      })
      em.persist(lead)
    }
    lead.pipelineId = before.pipelineId
    lead.stageId = before.stageId
    lead.outcome = before.outcome as 'open' | 'won' | 'lost'
    lead.lostReasonId = before.lostReasonId
    lead.displayName = before.displayName
    lead.ownerUserId = before.ownerUserId
    lead.source = before.source
    lead.sourceChannel = before.sourceChannel
    lead.primaryEmail = before.primaryEmail
    lead.primaryPhone = before.primaryPhone
    lead.vatId = before.vatId
    lead.qualificationNotes = before.qualificationNotes
    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudUndoSideEffects({
      dataEngine: de,
      action: 'updated',
      entity: lead,
      identifiers: { id: lead.id, organizationId: lead.organizationId, tenantId: lead.tenantId },
      indexer: leadCrudIndexer,
      events: leadCrudEvents,
    })
  },
}

const deleteLeadCommand: CommandHandler<{ body?: Record<string, unknown>; query?: Record<string, unknown> }, { leadId: string }> = {
  id: 'customers.leads.delete',
  async prepare(input, ctx) {
    const id = requireId(input, 'Lead id required')
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadLeadSnapshot(em, id)
    return snapshot ? { before: snapshot } : {}
  },
  async execute(input, ctx) {
    const id = requireId(input, 'Lead id required')
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const lead = await em.findOne(CustomerLead, { id, deletedAt: null })
    if (!lead) throw new CrudHttpError(404, { error: 'Lead not found' })
    ensureTenantScope(ctx, lead.tenantId)
    ensureOrganizationScope(ctx, lead.organizationId)

    lead.deletedAt = new Date()
    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'deleted',
      entity: lead,
      identifiers: { id: lead.id, organizationId: lead.organizationId, tenantId: lead.tenantId },
      indexer: leadCrudIndexer,
      events: leadCrudEvents,
    })

    return { leadId: lead.id }
  },
  buildLog: async ({ snapshots }) => {
    const { translate } = await resolveTranslations()
    const before = snapshots.before as LeadSnapshot | undefined
    if (!before) return null
    return {
      actionLabel: translate('customers.audit.leads.delete', 'Delete lead'),
      resourceKind: 'customers.lead',
      resourceId: before.id,
      tenantId: before.tenantId,
      organizationId: before.organizationId,
      snapshotBefore: before,
      payload: { undo: { before } satisfies LeadUndoPayload },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<LeadUndoPayload>(logEntry)
    const before = payload?.before
    if (!before) return
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const lead = await em.findOne(CustomerLead, { id: before.id })
    if (lead) {
      lead.deletedAt = null
      await em.flush()
    }
    const de = ctx.container.resolve('dataEngine') as DataEngine
    if (lead) {
      await emitCrudUndoSideEffects({
        dataEngine: de,
        action: 'created',
        entity: lead,
        identifiers: { id: lead.id, organizationId: lead.organizationId, tenantId: lead.tenantId },
        indexer: leadCrudIndexer,
        events: leadCrudEvents,
      })
    }
  },
}

const assignLeadCommand: CommandHandler<LeadAssignInput, { leadId: string }> = {
  id: 'customers.leads.assign',
  async execute(rawInput, ctx) {
    const parsed = leadAssignSchema.parse(rawInput)
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const lead = await em.findOne(CustomerLead, { id: parsed.id, deletedAt: null })
    if (!lead) throw new CrudHttpError(404, { error: 'Lead not found' })
    ensureTenantScope(ctx, lead.tenantId)
    ensureOrganizationScope(ctx, lead.organizationId)

    lead.ownerUserId = parsed.ownerUserId ?? null
    await em.flush()

    await emitCustomersEvent('customers.lead.assigned', {
      tenantId: lead.tenantId,
      organizationId: lead.organizationId,
      payload: { id: lead.id, ownerUserId: lead.ownerUserId },
    })

    return { leadId: lead.id }
  },
}

const advanceLeadStageCommand: CommandHandler<LeadAdvanceStageInput, { leadId: string }> = {
  id: 'customers.leads.advance-stage',
  async execute(rawInput, ctx) {
    const parsed = leadAdvanceStageSchema.parse(rawInput)
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const lead = await em.findOne(CustomerLead, { id: parsed.id, deletedAt: null })
    if (!lead) throw new CrudHttpError(404, { error: 'Lead not found' })
    ensureTenantScope(ctx, lead.tenantId)
    ensureOrganizationScope(ctx, lead.organizationId)

    const stage = await em.findOne(CustomerLeadPipelineStage, {
      id: parsed.stageId,
      pipelineId: lead.pipelineId,
    })
    if (!stage) throw new CrudHttpError(400, { error: 'Stage not found in lead pipeline' })

    const previousStageId = lead.stageId
    lead.stageId = parsed.stageId
    await em.flush()

    await emitCustomersEvent('customers.lead.stage_changed', {
      tenantId: lead.tenantId,
      organizationId: lead.organizationId,
      payload: { id: lead.id, previousStageId, stageId: lead.stageId },
    })

    return { leadId: lead.id }
  },
}

const markLeadLostCommand: CommandHandler<LeadMarkLostInput, { leadId: string }> = {
  id: 'customers.leads.mark-lost',
  async execute(rawInput, ctx) {
    const parsed = leadMarkLostSchema.parse(rawInput)
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const lead = await em.findOne(CustomerLead, { id: parsed.id, deletedAt: null })
    if (!lead) throw new CrudHttpError(404, { error: 'Lead not found' })
    ensureTenantScope(ctx, lead.tenantId)
    ensureOrganizationScope(ctx, lead.organizationId)

    lead.outcome = 'lost'
    lead.lostReasonId = parsed.lostReasonId ?? null
    await em.flush()

    await emitCustomersEvent('customers.lead.lost', {
      tenantId: lead.tenantId,
      organizationId: lead.organizationId,
      payload: { id: lead.id, lostReasonId: lead.lostReasonId },
    })

    return { leadId: lead.id }
  },
}

registerCommand(createLeadCommand)
registerCommand(updateLeadCommand)
registerCommand(deleteLeadCommand)
registerCommand(assignLeadCommand)
registerCommand(advanceLeadStageCommand)
registerCommand(markLeadLostCommand)

export {
  createLeadCommand,
  updateLeadCommand,
  deleteLeadCommand,
  assignLeadCommand,
  advanceLeadStageCommand,
  markLeadLostCommand,
}
