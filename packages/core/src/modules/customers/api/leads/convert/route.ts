import { z } from 'zod'
import { customerLeadConvertSchema } from '../../../data/validators'
import { executeLeadWorkflowCommand } from '../_workflow'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['customers.leads.manage'] },
}

export async function POST(req: Request) {
  return executeLeadWorkflowCommand(req, 'customers.leads.convert', customerLeadConvertSchema)
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Customers',
  summary: 'Convert a lead',
  methods: {
    POST: {
      summary: 'Convert lead to CRM targets',
      requestBody: { contentType: 'application/json', schema: customerLeadConvertSchema },
      responses: [{
        status: 200,
        description: 'Lead converted',
        schema: z.object({
          leadId: z.string().uuid(),
          personId: z.string().uuid().nullable(),
          companyId: z.string().uuid().nullable(),
          dealId: z.string().uuid().nullable(),
        }),
      }],
    },
  },
}
