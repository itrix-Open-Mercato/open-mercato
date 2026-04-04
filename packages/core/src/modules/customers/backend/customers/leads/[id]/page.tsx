"use client"

import * as React from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { CrudForm } from '@open-mercato/ui/backend/CrudForm'
import { updateCrud } from '@open-mercato/ui/backend/utils/crud'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { LoadingMessage, ErrorMessage } from '@open-mercato/ui/backend/detail'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { z } from 'zod'

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

export default function LeadDetailPage() {
  const t = useT()
  const router = useRouter()
  const params = useParams()
  const id = typeof params?.id === 'string' ? params.id : Array.isArray(params?.id) ? params.id[0] : null

  const [initialValues, setInitialValues] = React.useState<Partial<LeadFormValues> | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [pipelines, setPipelines] = React.useState<PipelineOption[]>([])
  const [stages, setStages] = React.useState<StageOption[]>([])

  React.useEffect(() => {
    if (!id) return
    Promise.all([
      apiCall<{ items?: Array<{ id: string; name: string }> }>('/api/customers/lead-pipelines'),
      apiCall<{ items?: Array<{ id: string; name: string; pipelineId: string }> }>('/api/customers/lead-pipeline-stages'),
      apiCall<{ items?: Array<Record<string, unknown>> }>(`/api/customers/leads?id=${id}&pageSize=1`),
    ]).then(([pipelinesRes, stagesRes, leadRes]) => {
      if (pipelinesRes.ok) setPipelines((pipelinesRes.result?.items ?? []).map((p) => ({ value: p.id, label: p.name })))
      if (stagesRes.ok) setStages((stagesRes.result?.items ?? []).map((s) => ({ value: s.id, label: s.name, pipelineId: s.pipelineId })))
      if (leadRes.ok) {
        const lead = leadRes.result?.items?.[0] as Record<string, unknown> | undefined
        if (!lead) { setError(t('customers.leads.detail.notFound', 'Lead not found')); return }
        setInitialValues({
          displayName: typeof lead.display_name === 'string' ? lead.display_name : '',
          pipelineId: typeof lead.pipeline_id === 'string' ? lead.pipeline_id : '',
          stageId: typeof lead.stage_id === 'string' ? lead.stage_id : '',
          primaryEmail: typeof lead.primary_email === 'string' ? lead.primary_email : '',
          primaryPhone: typeof lead.primary_phone === 'string' ? lead.primary_phone : '',
          source: typeof lead.source === 'string' ? lead.source : '',
          qualificationNotes: typeof lead.qualification_notes === 'string' ? lead.qualification_notes : '',
        })
      } else {
        setError(t('customers.leads.detail.loadError', 'Failed to load lead'))
      }
    }).finally(() => setIsLoading(false))
  }, [id, t])

  const fields = React.useMemo(() => [
    { name: 'displayName' as const, label: t('customers.leads.form.displayName', 'Name'), type: 'text' as const, required: true },
    { name: 'pipelineId' as const, label: t('customers.leads.form.pipeline', 'Pipeline'), type: 'select' as const, required: true, options: pipelines },
    { name: 'stageId' as const, label: t('customers.leads.form.stage', 'Stage'), type: 'select' as const, required: true, options: stages },
    { name: 'primaryEmail' as const, label: t('customers.leads.form.email', 'Email'), type: 'text' as const },
    { name: 'primaryPhone' as const, label: t('customers.leads.form.phone', 'Phone'), type: 'text' as const },
    { name: 'source' as const, label: t('customers.leads.form.source', 'Source'), type: 'text' as const },
    { name: 'qualificationNotes' as const, label: t('customers.leads.form.qualificationNotes', 'Qualification notes'), type: 'textarea' as const },
  ], [pipelines, stages, t])

  if (isLoading) return <Page><PageBody><LoadingMessage /></PageBody></Page>
  if (error || !initialValues) return <Page><PageBody><ErrorMessage message={error ?? t('customers.leads.detail.loadError', 'Failed to load lead')} /></PageBody></Page>

  return (
    <Page>
      <PageBody>
        <CrudForm<LeadFormValues>
          title={initialValues.displayName ?? t('customers.leads.detail.title', 'Lead')}
          backHref="/backend/customers/leads"
          cancelHref="/backend/customers/leads"
          fields={fields}
          schema={leadFormSchema}
          initialValues={initialValues}
          submitLabel={t('customers.leads.detail.save', 'Save changes')}
          onSubmit={async (values) => {
            if (!id) return
            const payload: Record<string, unknown> = {
              id,
              displayName: values.displayName,
              pipelineId: values.pipelineId,
              stageId: values.stageId,
              primaryEmail: values.primaryEmail || undefined,
              primaryPhone: values.primaryPhone || undefined,
              source: values.source || undefined,
              qualificationNotes: values.qualificationNotes || undefined,
            }
            await updateCrud('customers/leads', payload, {
              errorMessage: t('customers.leads.detail.saveError', 'Failed to save lead.'),
            })
            flash(t('customers.leads.detail.saveSuccess', 'Lead saved.'), 'success')
            router.push('/backend/customers/leads')
          }}
        />
      </PageBody>
    </Page>
  )
}
