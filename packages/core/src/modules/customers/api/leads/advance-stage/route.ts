import { z } from 'zod'
import { customerLeadAdvanceStageSchema } from '../../../data/validators'
import { executeLeadWorkflowCommand } from '../_workflow'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['customers.leads.manage'] },
}

export async function POST(req: Request) {
  return executeLeadWorkflowCommand(req, 'customers.leads.advance-stage', customerLeadAdvanceStageSchema)
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Customers',
  summary: 'Advance a lead stage',
  methods: {
    POST: {
      summary: 'Advance lead stage',
      requestBody: { contentType: 'application/json', schema: customerLeadAdvanceStageSchema },
      responses: [{ status: 200, description: 'Lead stage advanced', schema: z.object({ ok: z.boolean().optional() }) }],
    },
  },
}
