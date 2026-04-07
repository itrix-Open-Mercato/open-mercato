import {
  customerLeadConvertSchema,
  customerLeadCreateCompanySchema,
  customerLeadCreateDealSchema,
  customerLeadCreatePersonSchema,
  customerLeadDuplicateCheckSchema,
  customerLeadLinkCompanySchema,
  customerLeadLinkDealSchema,
  customerLeadLinkPersonSchema,
  customerLeadUnlinkTargetSchema,
} from '../validators'

const tenantId = '11111111-1111-4111-8111-111111111111'
const organizationId = '22222222-2222-4222-8222-222222222222'
const leadId = '33333333-3333-4333-8333-333333333333'
const personId = '44444444-4444-4444-8444-444444444444'
const companyId = '55555555-5555-4555-8555-555555555555'
const dealId = '66666666-6666-4666-8666-666666666666'

const scope = { tenantId, organizationId }

describe('customer lead validators', () => {
  it('accepts explicit link targets for person, company, and deal', () => {
    expect(customerLeadLinkPersonSchema.parse({ ...scope, leadId, personId })).toMatchObject({ leadId, personId })
    expect(customerLeadLinkCompanySchema.parse({ ...scope, leadId, companyId })).toMatchObject({ leadId, companyId })
    expect(customerLeadLinkDealSchema.parse({ ...scope, leadId, dealId })).toMatchObject({ leadId, dealId })
    expect(customerLeadUnlinkTargetSchema.parse({ ...scope, leadId })).toMatchObject({ leadId })
  })

  it('accepts create-from-lead overrides scoped to downstream target schemas', () => {
    expect(customerLeadCreatePersonSchema.parse({
      ...scope,
      leadId,
      overrides: { firstName: 'Ada', lastName: 'Lovelace', primaryEmail: 'ada@example.com' },
    }).overrides).toMatchObject({ firstName: 'Ada', lastName: 'Lovelace' })

    expect(customerLeadCreateCompanySchema.parse({
      ...scope,
      leadId,
      overrides: { displayName: 'Acme', legalName: 'Acme LLC' },
    }).overrides).toMatchObject({ displayName: 'Acme', legalName: 'Acme LLC' })

    expect(customerLeadCreateDealSchema.parse({
      ...scope,
      leadId,
      overrides: { title: 'Acme expansion', valueAmount: 1200 },
    }).overrides).toMatchObject({ title: 'Acme expansion', valueAmount: 1200 })
  })

  it('validates conversion review payloads with existing or create targets', () => {
    const parsed = customerLeadConvertSchema.parse({
      ...scope,
      leadId,
      personId,
      createCompany: true,
      createDeal: true,
      note: 'Reviewed duplicate candidates before conversion.',
    })

    expect(parsed).toMatchObject({
      leadId,
      personId,
      createCompany: true,
      createDeal: true,
    })
  })

  it('keeps duplicate detection advisory and rejects malformed emails', () => {
    expect(customerLeadDuplicateCheckSchema.parse({
      ...scope,
      leadId,
      primaryEmail: 'buyer@example.com',
      primaryPhone: '+48 123 456 789',
      vatId: 'PL1234567890',
    })).toMatchObject({ primaryEmail: 'buyer@example.com' })

    expect(() => customerLeadDuplicateCheckSchema.parse({
      ...scope,
      primaryEmail: 'not-an-email',
    })).toThrow()
  })
})
