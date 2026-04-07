import { z } from 'zod'
import { customerLeadCreateCompanySchema } from '../../../data/validators'
import { executeLeadWorkflowCommand } from '../_workflow'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['customers.leads.manage'] },
}

export async function POST(req: Request) {
  return executeLeadWorkflowCommand(req, 'customers.leads.create-company', customerLeadCreateCompanySchema)
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Customers',
  summary: 'Create a company from a lead',
  methods: {
    POST: {
      summary: 'Create company from lead',
      requestBody: { contentType: 'application/json', schema: customerLeadCreateCompanySchema },
      responses: [{ status: 200, description: 'Company created', schema: z.object({ companyId: z.string().uuid(), entityId: z.string().uuid() }) }],
    },
  },
}
