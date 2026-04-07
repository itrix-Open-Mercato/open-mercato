import { z } from 'zod'
import { customerLeadLinkDealSchema } from '../../../data/validators'
import { executeLeadWorkflowCommand } from '../_workflow'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['customers.leads.manage'] },
}

export async function POST(req: Request) {
  return executeLeadWorkflowCommand(req, 'customers.leads.link-deal', customerLeadLinkDealSchema)
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Customers',
  summary: 'Link a deal to a lead',
  methods: {
    POST: {
      summary: 'Link deal to lead',
      requestBody: { contentType: 'application/json', schema: customerLeadLinkDealSchema },
      responses: [{ status: 200, description: 'Deal linked', schema: z.object({ ok: z.boolean().optional() }) }],
    },
  },
}
