import { z } from 'zod'
import { customerLeadLinkPersonSchema } from '../../../data/validators'
import { executeLeadWorkflowCommand } from '../_workflow'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['customers.leads.manage'] },
}

export async function POST(req: Request) {
  return executeLeadWorkflowCommand(req, 'customers.leads.link-person', customerLeadLinkPersonSchema)
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Customers',
  summary: 'Link a person to a lead',
  methods: {
    POST: {
      summary: 'Link person to lead',
      requestBody: { contentType: 'application/json', schema: customerLeadLinkPersonSchema },
      responses: [{ status: 200, description: 'Person linked', schema: z.object({ ok: z.boolean().optional() }) }],
    },
  },
}
