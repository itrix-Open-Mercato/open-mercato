import { z } from 'zod'
import { customerLeadAssignSchema } from '../../../data/validators'
import { executeLeadWorkflowCommand } from '../_workflow'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['customers.leads.manage'] },
}

export async function POST(req: Request) {
  return executeLeadWorkflowCommand(req, 'customers.leads.assign', customerLeadAssignSchema)
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Customers',
  summary: 'Assign a lead',
  methods: {
    POST: {
      summary: 'Assign lead owner',
      requestBody: { contentType: 'application/json', schema: customerLeadAssignSchema },
      responses: [{ status: 200, description: 'Lead assigned', schema: z.object({ ok: z.boolean().optional() }) }],
    },
  },
}
