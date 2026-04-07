import { z } from 'zod'
import { customerLeadCreatePersonSchema } from '../../../data/validators'
import { executeLeadWorkflowCommand } from '../_workflow'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['customers.leads.manage'] },
}

export async function POST(req: Request) {
  return executeLeadWorkflowCommand(req, 'customers.leads.create-person', customerLeadCreatePersonSchema)
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Customers',
  summary: 'Create a person from a lead',
  methods: {
    POST: {
      summary: 'Create person from lead',
      requestBody: { contentType: 'application/json', schema: customerLeadCreatePersonSchema },
      responses: [{ status: 200, description: 'Person created', schema: z.object({ personId: z.string().uuid(), entityId: z.string().uuid() }) }],
    },
  },
}
