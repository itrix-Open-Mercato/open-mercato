"use client"

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { CrudForm } from '@open-mercato/ui/backend/CrudForm'
import { createCrud } from '@open-mercato/ui/backend/utils/crud'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { z } from 'zod'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'

type PipelineOption = { value: string; label: string }
type StageOption = { value: string; label: string; pipelineId: string }

type LeadFormValues = {
  displayName: string
  pipelineId: string
  stageId: string
  primaryEmail?: string
  primaryPhone?: string
  source?: string
  qualificationNotes?: string
}

const leadFormSchema = z.object({
  displayName: z.string().min(1, 'Name is required'),
  pipelineId: z.string().uuid('Pipeline is required'),
  stageId: z.string().uuid('Stage is required'),
  primaryEmail: z.string().email().optional().or(z.literal('')),
  primaryPhone: z.string().optional(),
  source: z.string().optional(),
  qualificationNotes: z.string().optional(),
})

export default function CreateLeadPage() {
  const t = useT()
  const router = useRouter()

  const [pipelines, setPipelines] = React.useState<PipelineOption[]>([])
  const [stages, setStages] = React.useState<StageOption[]>([])

  React.useEffect(() => {
    apiCall<{ items?: Array<{ id: string; name: string }> }>('/api/customers/lead-pipelines').then((res) => {
      if (res.ok) {
        setPipelines((res.result?.items ?? []).map((p) => ({ value: p.id, label: p.name })))
      }
    })
    apiCall<{ items?: Array<{ id: string; name: string; pipelineId: string }> }>('/api/customers/lead-pipeline-stages').then((res) => {
      if (res.ok) {
        setStages((res.result?.items ?? []).map((s) => ({ value: s.id, label: s.name, pipelineId: s.pipelineId })))
      }
    })
  }, [])

  const fields = React.useMemo(() => [
    {
      name: 'displayName' as const,
      label: t('customers.leads.form.displayName', 'Name'),
      type: 'text' as const,
      required: true,
    },
    {
      name: 'pipelineId' as const,
      label: t('customers.leads.form.pipeline', 'Pipeline'),
      type: 'select' as const,
      required: true,
      options: pipelines,
    },
    {
      name: 'stageId' as const,
      label: t('customers.leads.form.stage', 'Stage'),
      type: 'select' as const,
      required: true,
      options: stages,
    },
    {
      name: 'primaryEmail' as const,
      label: t('customers.leads.form.email', 'Email'),
      type: 'text' as const,
    },
    {
      name: 'primaryPhone' as const,
      label: t('customers.leads.form.phone', 'Phone'),
      type: 'text' as const,
    },
    {
      name: 'source' as const,
      label: t('customers.leads.form.source', 'Source'),
      type: 'text' as const,
    },
    {
      name: 'qualificationNotes' as const,
      label: t('customers.leads.form.qualificationNotes', 'Qualification notes'),
      type: 'textarea' as const,
    },
  ], [pipelines, stages, t])

  return (
    <Page>
      <PageBody>
        <CrudForm<LeadFormValues>
          title={t('customers.leads.create.title', 'Create lead')}
          backHref="/backend/customers/leads"
          cancelHref="/backend/customers/leads"
          fields={fields}
          schema={leadFormSchema}
          submitLabel={t('customers.leads.create.submit', 'Create lead')}
          onSubmit={async (values) => {
            const payload: Record<string, unknown> = {
              displayName: values.displayName,
              pipelineId: values.pipelineId,
              stageId: values.stageId,
              primaryEmail: values.primaryEmail || undefined,
              primaryPhone: values.primaryPhone || undefined,
              source: values.source || undefined,
              qualificationNotes: values.qualificationNotes || undefined,
            }
            await createCrud('customers/leads', payload, {
              errorMessage: t('customers.leads.create.error', 'Failed to create lead.'),
            })
            flash(t('customers.leads.create.success', 'Lead created.'), 'success')
            router.push('/backend/customers/leads')
          }}
        />
      </PageBody>
    </Page>
  )
}
