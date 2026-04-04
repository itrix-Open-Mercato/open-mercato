import { registerCommand } from '@open-mercato/shared/lib/commands'
import type { CommandHandler } from '@open-mercato/shared/lib/commands'
import type { EntityManager } from '@mikro-orm/postgresql'
import {
  CustomerLeadPipeline,
  CustomerLeadPipelineStage,
  CustomerLeadLostReason,
  CustomerLead,
} from '../data/entities'
import {
  leadPipelineCreateSchema,
  leadPipelineUpdateSchema,
  leadPipelineDeleteSchema,
  leadPipelineStageCreateSchema,
  leadPipelineStageUpdateSchema,
  leadPipelineStageDeleteSchema,
  leadLostReasonCreateSchema,
  leadLostReasonUpdateSchema,
  leadLostReasonDeleteSchema,
  type LeadPipelineCreateInput,
  type LeadPipelineUpdateInput,
  type LeadPipelineDeleteInput,
  type LeadPipelineStageCreateInput,
  type LeadPipelineStageUpdateInput,
  type LeadPipelineStageDeleteInput,
  type LeadLostReasonCreateInput,
  type LeadLostReasonUpdateInput,
  type LeadLostReasonDeleteInput,
} from '../data/validators'
import { ensureOrganizationScope, ensureTenantScope } from './shared'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'

// --- Lead Pipeline commands ---

const createLeadPipelineCommand: CommandHandler<LeadPipelineCreateInput, { pipelineId: string }> = {
  id: 'customers.lead-pipelines.create',
  async execute(rawInput, ctx) {
    const parsed = leadPipelineCreateSchema.parse(rawInput)
    ensureTenantScope(ctx, parsed.tenantId)
    ensureOrganizationScope(ctx, parsed.organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()

    if (parsed.isDefault) {
      await em.nativeUpdate(
        CustomerLeadPipeline,
        { organizationId: parsed.organizationId, tenantId: parsed.tenantId, isDefault: true },
        { isDefault: false }
      )
    }

    const pipeline = em.create(CustomerLeadPipeline, {
      organizationId: parsed.organizationId,
      tenantId: parsed.tenantId,
      name: parsed.name,
      code: parsed.code,
      isDefault: parsed.isDefault ?? false,
      isActive: parsed.isActive ?? true,
    })
    em.persist(pipeline)
    await em.flush()

    return { pipelineId: pipeline.id }
  },
}

const updateLeadPipelineCommand: CommandHandler<LeadPipelineUpdateInput, void> = {
  id: 'customers.lead-pipelines.update',
  async execute(rawInput, ctx) {
    const parsed = leadPipelineUpdateSchema.parse(rawInput)
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const pipeline = await em.findOne(CustomerLeadPipeline, { id: parsed.id })
    if (!pipeline) throw new CrudHttpError(404, { error: 'Lead pipeline not found' })

    ensureTenantScope(ctx, pipeline.tenantId)
    ensureOrganizationScope(ctx, pipeline.organizationId)

    if (parsed.isDefault && !pipeline.isDefault) {
      await em.nativeUpdate(
        CustomerLeadPipeline,
        { organizationId: pipeline.organizationId, tenantId: pipeline.tenantId, isDefault: true },
        { isDefault: false }
      )
    }

    if (parsed.name !== undefined) pipeline.name = parsed.name
    if (parsed.code !== undefined) pipeline.code = parsed.code
    if (parsed.isDefault !== undefined) pipeline.isDefault = parsed.isDefault
    if (parsed.isActive !== undefined) pipeline.isActive = parsed.isActive

    await em.flush()
  },
}

const deleteLeadPipelineCommand: CommandHandler<LeadPipelineDeleteInput, void> = {
  id: 'customers.lead-pipelines.delete',
  async execute(rawInput, ctx) {
    const parsed = leadPipelineDeleteSchema.parse(rawInput)
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const pipeline = await em.findOne(CustomerLeadPipeline, { id: parsed.id })
    if (!pipeline) throw new CrudHttpError(404, { error: 'Lead pipeline not found' })

    ensureTenantScope(ctx, pipeline.tenantId)
    ensureOrganizationScope(ctx, pipeline.organizationId)

    const activeLeadsCount = await em.count(CustomerLead, {
      pipelineId: parsed.id,
      deletedAt: null,
    })
    if (activeLeadsCount > 0) {
      throw new CrudHttpError(409, { error: 'Cannot delete pipeline with active leads' })
    }

    em.remove(pipeline)
    await em.flush()
  },
}

// --- Lead Pipeline Stage commands ---

const createLeadPipelineStageCommand: CommandHandler<LeadPipelineStageCreateInput, { stageId: string }> = {
  id: 'customers.lead-pipeline-stages.create',
  async execute(rawInput, ctx) {
    const parsed = leadPipelineStageCreateSchema.parse(rawInput)
    ensureTenantScope(ctx, parsed.tenantId)
    ensureOrganizationScope(ctx, parsed.organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()

    const pipeline = await em.findOne(CustomerLeadPipeline, {
      id: parsed.pipelineId,
      tenantId: parsed.tenantId,
      organizationId: parsed.organizationId,
    })
    if (!pipeline) throw new CrudHttpError(404, { error: 'Lead pipeline not found' })

    const stage = em.create(CustomerLeadPipelineStage, {
      organizationId: parsed.organizationId,
      tenantId: parsed.tenantId,
      pipelineId: parsed.pipelineId,
      name: parsed.name,
      code: parsed.code,
      position: parsed.position,
      kind: parsed.kind,
      isActive: parsed.isActive ?? true,
    })
    em.persist(stage)
    await em.flush()

    return { stageId: stage.id }
  },
}

const updateLeadPipelineStageCommand: CommandHandler<LeadPipelineStageUpdateInput, void> = {
  id: 'customers.lead-pipeline-stages.update',
  async execute(rawInput, ctx) {
    const parsed = leadPipelineStageUpdateSchema.parse(rawInput)
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const stage = await em.findOne(CustomerLeadPipelineStage, { id: parsed.id })
    if (!stage) throw new CrudHttpError(404, { error: 'Lead pipeline stage not found' })

    ensureTenantScope(ctx, stage.tenantId)
    ensureOrganizationScope(ctx, stage.organizationId)

    if (parsed.name !== undefined) stage.name = parsed.name
    if (parsed.code !== undefined) stage.code = parsed.code
    if (parsed.position !== undefined) stage.position = parsed.position
    if (parsed.kind !== undefined) stage.kind = parsed.kind
    if (parsed.isActive !== undefined) stage.isActive = parsed.isActive

    await em.flush()
  },
}

const deleteLeadPipelineStageCommand: CommandHandler<LeadPipelineStageDeleteInput, void> = {
  id: 'customers.lead-pipeline-stages.delete',
  async execute(rawInput, ctx) {
    const parsed = leadPipelineStageDeleteSchema.parse(rawInput)
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const stage = await em.findOne(CustomerLeadPipelineStage, { id: parsed.id })
    if (!stage) throw new CrudHttpError(404, { error: 'Lead pipeline stage not found' })

    ensureTenantScope(ctx, stage.tenantId)
    ensureOrganizationScope(ctx, stage.organizationId)

    const activeLeadsCount = await em.count(CustomerLead, {
      stageId: parsed.id,
      deletedAt: null,
    })
    if (activeLeadsCount > 0) {
      throw new CrudHttpError(409, { error: 'Cannot delete stage with active leads' })
    }

    em.remove(stage)
    await em.flush()
  },
}

// --- Lead Lost Reason commands ---

const createLeadLostReasonCommand: CommandHandler<LeadLostReasonCreateInput, { lostReasonId: string }> = {
  id: 'customers.lead-lost-reasons.create',
  async execute(rawInput, ctx) {
    const parsed = leadLostReasonCreateSchema.parse(rawInput)
    ensureTenantScope(ctx, parsed.tenantId)
    ensureOrganizationScope(ctx, parsed.organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const reason = em.create(CustomerLeadLostReason, {
      organizationId: parsed.organizationId,
      tenantId: parsed.tenantId,
      pipelineId: parsed.pipelineId ?? null,
      name: parsed.name,
      code: parsed.code,
      isActive: parsed.isActive ?? true,
      sortOrder: parsed.sortOrder ?? 0,
    })
    em.persist(reason)
    await em.flush()

    return { lostReasonId: reason.id }
  },
}

const updateLeadLostReasonCommand: CommandHandler<LeadLostReasonUpdateInput, void> = {
  id: 'customers.lead-lost-reasons.update',
  async execute(rawInput, ctx) {
    const parsed = leadLostReasonUpdateSchema.parse(rawInput)
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const reason = await em.findOne(CustomerLeadLostReason, { id: parsed.id })
    if (!reason) throw new CrudHttpError(404, { error: 'Lead lost reason not found' })

    ensureTenantScope(ctx, reason.tenantId)
    ensureOrganizationScope(ctx, reason.organizationId)

    if (parsed.pipelineId !== undefined) reason.pipelineId = parsed.pipelineId ?? null
    if (parsed.name !== undefined) reason.name = parsed.name
    if (parsed.code !== undefined) reason.code = parsed.code
    if (parsed.isActive !== undefined) reason.isActive = parsed.isActive
    if (parsed.sortOrder !== undefined) reason.sortOrder = parsed.sortOrder

    await em.flush()
  },
}

const deleteLeadLostReasonCommand: CommandHandler<LeadLostReasonDeleteInput, void> = {
  id: 'customers.lead-lost-reasons.delete',
  async execute(rawInput, ctx) {
    const parsed = leadLostReasonDeleteSchema.parse(rawInput)
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const reason = await em.findOne(CustomerLeadLostReason, { id: parsed.id })
    if (!reason) throw new CrudHttpError(404, { error: 'Lead lost reason not found' })

    ensureTenantScope(ctx, reason.tenantId)
    ensureOrganizationScope(ctx, reason.organizationId)

    em.remove(reason)
    await em.flush()
  },
}

registerCommand(createLeadPipelineCommand)
registerCommand(updateLeadPipelineCommand)
registerCommand(deleteLeadPipelineCommand)
registerCommand(createLeadPipelineStageCommand)
registerCommand(updateLeadPipelineStageCommand)
registerCommand(deleteLeadPipelineStageCommand)
registerCommand(createLeadLostReasonCommand)
registerCommand(updateLeadLostReasonCommand)
registerCommand(deleteLeadLostReasonCommand)

export {
  createLeadPipelineCommand,
  updateLeadPipelineCommand,
  deleteLeadPipelineCommand,
  createLeadPipelineStageCommand,
  updateLeadPipelineStageCommand,
  deleteLeadPipelineStageCommand,
  createLeadLostReasonCommand,
  updateLeadLostReasonCommand,
  deleteLeadLostReasonCommand,
}
