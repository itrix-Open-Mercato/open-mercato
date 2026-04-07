import { registerCommand } from '@open-mercato/shared/lib/commands'
import type { CommandHandler } from '@open-mercato/shared/lib/commands'
import type { EntityManager } from '@mikro-orm/postgresql'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import {
  CustomerLead,
  CustomerLeadFieldBinding,
  CustomerLeadLostReason,
  CustomerLeadPipeline,
  CustomerLeadPipelineStage,
} from '../data/entities'
import {
  customerLeadFieldBindingCreateSchema,
  customerLeadFieldBindingDeleteSchema,
  customerLeadFieldBindingUpdateSchema,
  customerLeadLostReasonCreateSchema,
  customerLeadLostReasonDeleteSchema,
  customerLeadLostReasonUpdateSchema,
  customerLeadPipelineCreateSchema,
  customerLeadPipelineDeleteSchema,
  customerLeadPipelineStageCreateSchema,
  customerLeadPipelineStageDeleteSchema,
  customerLeadPipelineStageUpdateSchema,
  customerLeadPipelineUpdateSchema,
  type CustomerLeadFieldBindingCreateInput,
  type CustomerLeadFieldBindingDeleteInput,
  type CustomerLeadFieldBindingUpdateInput,
  type CustomerLeadLostReasonCreateInput,
  type CustomerLeadLostReasonDeleteInput,
  type CustomerLeadLostReasonUpdateInput,
  type CustomerLeadPipelineCreateInput,
  type CustomerLeadPipelineDeleteInput,
  type CustomerLeadPipelineStageCreateInput,
  type CustomerLeadPipelineStageDeleteInput,
  type CustomerLeadPipelineStageUpdateInput,
  type CustomerLeadPipelineUpdateInput,
} from '../data/validators'
import { ensureOrganizationScope, ensureTenantScope } from './shared'

async function assertLeadPipelineInScope(
  em: EntityManager,
  pipelineId: string | null | undefined,
  tenantId: string,
  organizationId: string
): Promise<CustomerLeadPipeline | null> {
  if (!pipelineId) return null
  const pipeline = await em.findOne(CustomerLeadPipeline, { id: pipelineId, tenantId, organizationId })
  if (!pipeline) throw new CrudHttpError(400, { error: 'Lead pipeline not found' })
  return pipeline
}

const createLeadPipelineCommand: CommandHandler<CustomerLeadPipelineCreateInput, { pipelineId: string }> = {
  id: 'customers.lead-pipelines.create',
  async execute(rawInput, ctx) {
    const parsed = customerLeadPipelineCreateSchema.parse(rawInput)
    ensureTenantScope(ctx, parsed.tenantId)
    ensureOrganizationScope(ctx, parsed.organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    if (parsed.isDefault) {
      await em.nativeUpdate(CustomerLeadPipeline, {
        tenantId: parsed.tenantId,
        organizationId: parsed.organizationId,
        isDefault: true,
      }, { isDefault: false })
    }

    const pipeline = em.create(CustomerLeadPipeline, {
      tenantId: parsed.tenantId,
      organizationId: parsed.organizationId,
      name: parsed.name,
      code: parsed.code,
      isDefault: parsed.isDefault ?? false,
      isActive: parsed.isActive ?? true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    em.persist(pipeline)
    await em.flush()
    return { pipelineId: pipeline.id }
  },
}

const updateLeadPipelineCommand: CommandHandler<CustomerLeadPipelineUpdateInput, void> = {
  id: 'customers.lead-pipelines.update',
  async execute(rawInput, ctx) {
    const parsed = customerLeadPipelineUpdateSchema.parse(rawInput)
    ensureTenantScope(ctx, parsed.tenantId)
    ensureOrganizationScope(ctx, parsed.organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const pipeline = await em.findOne(CustomerLeadPipeline, {
      id: parsed.id,
      tenantId: parsed.tenantId,
      organizationId: parsed.organizationId,
    })
    if (!pipeline) throw new CrudHttpError(404, { error: 'Lead pipeline not found' })

    if (parsed.isDefault && !pipeline.isDefault) {
      await em.nativeUpdate(CustomerLeadPipeline, {
        tenantId: pipeline.tenantId,
        organizationId: pipeline.organizationId,
        isDefault: true,
      }, { isDefault: false })
    }
    if (parsed.name !== undefined) pipeline.name = parsed.name
    if (parsed.code !== undefined) pipeline.code = parsed.code
    if (parsed.isDefault !== undefined) pipeline.isDefault = parsed.isDefault
    if (parsed.isActive !== undefined) pipeline.isActive = parsed.isActive
    pipeline.updatedAt = new Date()
    await em.flush()
  },
}

const deleteLeadPipelineCommand: CommandHandler<CustomerLeadPipelineDeleteInput, void> = {
  id: 'customers.lead-pipelines.delete',
  async execute(rawInput, ctx) {
    const parsed = customerLeadPipelineDeleteSchema.parse(rawInput)
    ensureTenantScope(ctx, parsed.tenantId)
    ensureOrganizationScope(ctx, parsed.organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const pipeline = await em.findOne(CustomerLeadPipeline, {
      id: parsed.id,
      tenantId: parsed.tenantId,
      organizationId: parsed.organizationId,
    })
    if (!pipeline) throw new CrudHttpError(404, { error: 'Lead pipeline not found' })

    const activeLeadsCount = await em.count(CustomerLead, {
      pipelineId: pipeline.id,
      deletedAt: null,
    })
    if (activeLeadsCount > 0) {
      throw new CrudHttpError(409, { error: 'Cannot delete lead pipeline with active leads' })
    }

    await em.nativeDelete(CustomerLeadPipelineStage, { pipelineId: pipeline.id })
    await em.nativeDelete(CustomerLeadLostReason, { pipelineId: pipeline.id })
    await em.nativeDelete(CustomerLeadFieldBinding, { pipelineId: pipeline.id })
    em.remove(pipeline)
    await em.flush()
  },
}

const createLeadPipelineStageCommand: CommandHandler<CustomerLeadPipelineStageCreateInput, { stageId: string }> = {
  id: 'customers.lead-pipeline-stages.create',
  async execute(rawInput, ctx) {
    const parsed = customerLeadPipelineStageCreateSchema.parse(rawInput)
    ensureTenantScope(ctx, parsed.tenantId)
    ensureOrganizationScope(ctx, parsed.organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    await assertLeadPipelineInScope(em, parsed.pipelineId, parsed.tenantId, parsed.organizationId)
    const existingCount = await em.count(CustomerLeadPipelineStage, {
      tenantId: parsed.tenantId,
      organizationId: parsed.organizationId,
      pipelineId: parsed.pipelineId,
    })
    const stage = em.create(CustomerLeadPipelineStage, {
      tenantId: parsed.tenantId,
      organizationId: parsed.organizationId,
      pipelineId: parsed.pipelineId,
      name: parsed.name,
      code: parsed.code,
      kind: parsed.kind ?? 'open',
      position: parsed.position ?? existingCount,
      isActive: parsed.isActive ?? true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    em.persist(stage)
    await em.flush()
    return { stageId: stage.id }
  },
}

const updateLeadPipelineStageCommand: CommandHandler<CustomerLeadPipelineStageUpdateInput, void> = {
  id: 'customers.lead-pipeline-stages.update',
  async execute(rawInput, ctx) {
    const parsed = customerLeadPipelineStageUpdateSchema.parse(rawInput)
    ensureTenantScope(ctx, parsed.tenantId)
    ensureOrganizationScope(ctx, parsed.organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const stage = await em.findOne(CustomerLeadPipelineStage, {
      id: parsed.id,
      tenantId: parsed.tenantId,
      organizationId: parsed.organizationId,
    })
    if (!stage) throw new CrudHttpError(404, { error: 'Lead pipeline stage not found' })
    if (parsed.pipelineId) {
      await assertLeadPipelineInScope(em, parsed.pipelineId, parsed.tenantId, parsed.organizationId)
      stage.pipelineId = parsed.pipelineId
    }
    if (parsed.name !== undefined) stage.name = parsed.name
    if (parsed.code !== undefined) stage.code = parsed.code
    if (parsed.position !== undefined) stage.position = parsed.position
    if (parsed.kind !== undefined) stage.kind = parsed.kind
    if (parsed.isActive !== undefined) stage.isActive = parsed.isActive
    stage.updatedAt = new Date()
    await em.flush()
  },
}

const deleteLeadPipelineStageCommand: CommandHandler<CustomerLeadPipelineStageDeleteInput, void> = {
  id: 'customers.lead-pipeline-stages.delete',
  async execute(rawInput, ctx) {
    const parsed = customerLeadPipelineStageDeleteSchema.parse(rawInput)
    ensureTenantScope(ctx, parsed.tenantId)
    ensureOrganizationScope(ctx, parsed.organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const stage = await em.findOne(CustomerLeadPipelineStage, {
      id: parsed.id,
      tenantId: parsed.tenantId,
      organizationId: parsed.organizationId,
    })
    if (!stage) throw new CrudHttpError(404, { error: 'Lead pipeline stage not found' })
    const activeLeadsCount = await em.count(CustomerLead, { stageId: stage.id, deletedAt: null })
    if (activeLeadsCount > 0) {
      throw new CrudHttpError(409, { error: 'Cannot delete lead pipeline stage with active leads' })
    }
    em.remove(stage)
    await em.flush()
  },
}

const createLeadLostReasonCommand: CommandHandler<CustomerLeadLostReasonCreateInput, { reasonId: string }> = {
  id: 'customers.lead-lost-reasons.create',
  async execute(rawInput, ctx) {
    const parsed = customerLeadLostReasonCreateSchema.parse(rawInput)
    ensureTenantScope(ctx, parsed.tenantId)
    ensureOrganizationScope(ctx, parsed.organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    await assertLeadPipelineInScope(em, parsed.pipelineId, parsed.tenantId, parsed.organizationId)
    const reason = em.create(CustomerLeadLostReason, {
      tenantId: parsed.tenantId,
      organizationId: parsed.organizationId,
      pipelineId: parsed.pipelineId ?? null,
      name: parsed.name,
      code: parsed.code,
      sortOrder: parsed.sortOrder ?? 0,
      isActive: parsed.isActive ?? true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    em.persist(reason)
    await em.flush()
    return { reasonId: reason.id }
  },
}

const updateLeadLostReasonCommand: CommandHandler<CustomerLeadLostReasonUpdateInput, void> = {
  id: 'customers.lead-lost-reasons.update',
  async execute(rawInput, ctx) {
    const parsed = customerLeadLostReasonUpdateSchema.parse(rawInput)
    ensureTenantScope(ctx, parsed.tenantId)
    ensureOrganizationScope(ctx, parsed.organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const reason = await em.findOne(CustomerLeadLostReason, {
      id: parsed.id,
      tenantId: parsed.tenantId,
      organizationId: parsed.organizationId,
    })
    if (!reason) throw new CrudHttpError(404, { error: 'Lead lost reason not found' })
    if (parsed.pipelineId !== undefined) {
      await assertLeadPipelineInScope(em, parsed.pipelineId, parsed.tenantId, parsed.organizationId)
      reason.pipelineId = parsed.pipelineId
    }
    if (parsed.name !== undefined) reason.name = parsed.name
    if (parsed.code !== undefined) reason.code = parsed.code
    if (parsed.sortOrder !== undefined) reason.sortOrder = parsed.sortOrder
    if (parsed.isActive !== undefined) reason.isActive = parsed.isActive
    reason.updatedAt = new Date()
    await em.flush()
  },
}

const deleteLeadLostReasonCommand: CommandHandler<CustomerLeadLostReasonDeleteInput, void> = {
  id: 'customers.lead-lost-reasons.delete',
  async execute(rawInput, ctx) {
    const parsed = customerLeadLostReasonDeleteSchema.parse(rawInput)
    ensureTenantScope(ctx, parsed.tenantId)
    ensureOrganizationScope(ctx, parsed.organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const reason = await em.findOne(CustomerLeadLostReason, {
      id: parsed.id,
      tenantId: parsed.tenantId,
      organizationId: parsed.organizationId,
    })
    if (!reason) throw new CrudHttpError(404, { error: 'Lead lost reason not found' })
    const activeLeadsCount = await em.count(CustomerLead, { lostReasonId: reason.id, deletedAt: null })
    if (activeLeadsCount > 0) {
      throw new CrudHttpError(409, { error: 'Cannot delete lead lost reason with active leads' })
    }
    em.remove(reason)
    await em.flush()
  },
}

const createLeadFieldBindingCommand: CommandHandler<CustomerLeadFieldBindingCreateInput, { bindingId: string }> = {
  id: 'customers.lead-field-bindings.create',
  async execute(rawInput, ctx) {
    const parsed = customerLeadFieldBindingCreateSchema.parse(rawInput)
    ensureTenantScope(ctx, parsed.tenantId)
    ensureOrganizationScope(ctx, parsed.organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    await assertLeadPipelineInScope(em, parsed.pipelineId, parsed.tenantId, parsed.organizationId)
    const binding = em.create(CustomerLeadFieldBinding, {
      tenantId: parsed.tenantId,
      organizationId: parsed.organizationId,
      pipelineId: parsed.pipelineId ?? null,
      leadFieldKey: parsed.leadFieldKey,
      bindingMode: parsed.bindingMode,
      targetEntityKind: parsed.targetEntityKind ?? null,
      targetFieldKey: parsed.targetFieldKey ?? null,
      sectionKind: parsed.sectionKind,
      isActive: parsed.isActive ?? true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    em.persist(binding)
    await em.flush()
    return { bindingId: binding.id }
  },
}

const updateLeadFieldBindingCommand: CommandHandler<CustomerLeadFieldBindingUpdateInput, void> = {
  id: 'customers.lead-field-bindings.update',
  async execute(rawInput, ctx) {
    const parsed = customerLeadFieldBindingUpdateSchema.parse(rawInput)
    ensureTenantScope(ctx, parsed.tenantId)
    ensureOrganizationScope(ctx, parsed.organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const binding = await em.findOne(CustomerLeadFieldBinding, {
      id: parsed.id,
      tenantId: parsed.tenantId,
      organizationId: parsed.organizationId,
    })
    if (!binding) throw new CrudHttpError(404, { error: 'Lead field binding not found' })
    if (parsed.pipelineId !== undefined) {
      await assertLeadPipelineInScope(em, parsed.pipelineId, parsed.tenantId, parsed.organizationId)
      binding.pipelineId = parsed.pipelineId
    }
    if (parsed.leadFieldKey !== undefined) binding.leadFieldKey = parsed.leadFieldKey
    if (parsed.bindingMode !== undefined) binding.bindingMode = parsed.bindingMode
    if (parsed.targetEntityKind !== undefined) binding.targetEntityKind = parsed.targetEntityKind
    if (parsed.targetFieldKey !== undefined) binding.targetFieldKey = parsed.targetFieldKey
    if (parsed.sectionKind !== undefined) binding.sectionKind = parsed.sectionKind
    if (parsed.isActive !== undefined) binding.isActive = parsed.isActive
    binding.updatedAt = new Date()
    await em.flush()
  },
}

const deleteLeadFieldBindingCommand: CommandHandler<CustomerLeadFieldBindingDeleteInput, void> = {
  id: 'customers.lead-field-bindings.delete',
  async execute(rawInput, ctx) {
    const parsed = customerLeadFieldBindingDeleteSchema.parse(rawInput)
    ensureTenantScope(ctx, parsed.tenantId)
    ensureOrganizationScope(ctx, parsed.organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const binding = await em.findOne(CustomerLeadFieldBinding, {
      id: parsed.id,
      tenantId: parsed.tenantId,
      organizationId: parsed.organizationId,
    })
    if (!binding) throw new CrudHttpError(404, { error: 'Lead field binding not found' })
    em.remove(binding)
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
registerCommand(createLeadFieldBindingCommand)
registerCommand(updateLeadFieldBindingCommand)
registerCommand(deleteLeadFieldBindingCommand)

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
  createLeadFieldBindingCommand,
  updateLeadFieldBindingCommand,
  deleteLeadFieldBindingCommand,
}
