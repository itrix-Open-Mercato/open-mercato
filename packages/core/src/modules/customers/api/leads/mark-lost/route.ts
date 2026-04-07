import { z } from 'zod'
import { customerLeadMarkLostSchema } from '../../../data/validators'
import { executeLeadWorkflowCommand } from '../_workflow'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['customers.leads.manage'] },
}

export async function POST(req: Request) {
  return executeLeadWorkflowCommand(req, 'customers.leads.mark-lost', customerLeadMarkLostSchema)
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Customers',
  summary: 'Mark a lead lost',
  methods: {
    POST: {
      summary: 'Mark lead lost',
      requestBody: { contentType: 'application/json', schema: customerLeadMarkLostSchema },
      responses: [{ status: 200, description: 'Lead marked lost', schema: z.object({ ok: z.boolean().optional() }) }],
    },
  },
}
