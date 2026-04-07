import { z } from 'zod'
import { customerLeadLinkCompanySchema } from '../../../data/validators'
import { executeLeadWorkflowCommand } from '../_workflow'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['customers.leads.manage'] },
}

export async function POST(req: Request) {
  return executeLeadWorkflowCommand(req, 'customers.leads.link-company', customerLeadLinkCompanySchema)
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Customers',
  summary: 'Link a company to a lead',
  methods: {
    POST: {
      summary: 'Link company to lead',
      requestBody: { contentType: 'application/json', schema: customerLeadLinkCompanySchema },
      responses: [{ status: 200, description: 'Company linked', schema: z.object({ ok: z.boolean().optional() }) }],
    },
  },
}
