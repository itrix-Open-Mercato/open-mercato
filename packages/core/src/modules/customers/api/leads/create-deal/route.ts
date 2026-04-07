import { z } from 'zod'
import { customerLeadCreateDealSchema } from '../../../data/validators'
import { executeLeadWorkflowCommand } from '../_workflow'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['customers.leads.manage'] },
}

export async function POST(req: Request) {
  return executeLeadWorkflowCommand(req, 'customers.leads.create-deal', customerLeadCreateDealSchema)
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Customers',
  summary: 'Create a deal from a lead',
  methods: {
    POST: {
      summary: 'Create deal from lead',
      requestBody: { contentType: 'application/json', schema: customerLeadCreateDealSchema },
      responses: [{ status: 200, description: 'Deal created', schema: z.object({ dealId: z.string().uuid() }) }],
    },
  },
}
