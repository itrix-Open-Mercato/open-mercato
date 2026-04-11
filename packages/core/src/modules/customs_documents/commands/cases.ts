import { registerCommand, type CommandHandler } from '@open-mercato/shared/lib/commands'
import type { EntityManager } from '@mikro-orm/postgresql'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { CustomsCase } from '../data/entities'
import { customsCaseCreateSchema, type CustomsCaseCreateInput } from '../data/validators'
import { emitCustomsDocumentsEvent } from '../events'

type CreateCaseResult = {
  caseId: string
}

function buildDefaultReference(): string {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
  return `OLG-${stamp}`
}

const createCaseCommand: CommandHandler<CustomsCaseCreateInput, CreateCaseResult> = {
  id: 'customs_documents.cases.create',
  async execute(rawInput, ctx) {
    const input = customsCaseCreateSchema.parse(rawInput)
    if (ctx.auth?.tenantId && ctx.auth.tenantId !== input.tenantId) {
      throw new CrudHttpError(403, { error: 'Tenant scope mismatch' })
    }
    if (ctx.selectedOrganizationId && ctx.selectedOrganizationId !== input.organizationId) {
      throw new CrudHttpError(403, { error: 'Organization scope mismatch' })
    }

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const customsCase = em.create(CustomsCase, {
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      reference: input.reference ?? buildDefaultReference(),
      sourceCountry: input.sourceCountry ?? null,
      destinationCountry: input.destinationCountry ?? null,
      currency: input.currency?.toUpperCase() ?? null,
    })
    em.persist(customsCase)
    await em.flush()

    await emitCustomsDocumentsEvent('customs_documents.case.created', {
      id: customsCase.id,
      tenantId: customsCase.tenantId,
      organizationId: customsCase.organizationId,
      reference: customsCase.reference,
    }, { persistent: true })

    return { caseId: customsCase.id }
  },
  buildLog: ({ input, result }) => ({
    actionLabel: 'Create customs case',
    resourceKind: 'customs_documents.case',
    resourceId: result.caseId,
    tenantId: input.tenantId,
    organizationId: input.organizationId,
    snapshotAfter: {
      id: result.caseId,
      reference: input.reference ?? null,
      sourceCountry: input.sourceCountry ?? null,
      destinationCountry: input.destinationCountry ?? null,
      currency: input.currency ?? null,
    },
  }),
}

registerCommand(createCaseCommand)
