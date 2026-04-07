import { z } from 'zod'
import { customerLeadUnlinkTargetSchema } from '../../../data/validators'
import { executeLeadWorkflowCommand } from '../_workflow'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['customers.leads.manage'] },
}

export async function POST(req: Request) {
  return executeLeadWorkflowCommand(req, 'customers.leads.unlink-person', customerLeadUnlinkTargetSchema)
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Customers',
  summary: 'Unlink a person from a lead',
  methods: {
    POST: {
      summary: 'Unlink person from lead',
      requestBody: { contentType: 'application/json', schema: customerLeadUnlinkTargetSchema },
      responses: [{ status: 200, description: 'Person unlinked', schema: z.object({ ok: z.boolean().optional() }) }],
    },
  },
}
