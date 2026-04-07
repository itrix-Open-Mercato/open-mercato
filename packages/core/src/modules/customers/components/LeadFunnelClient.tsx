"use client"

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { ColumnDef } from '@tanstack/react-table'
import { z } from 'zod'
import { CrudForm, type CrudField } from '@open-mercato/ui/backend/CrudForm'
import { DataTable, withDataTableNamespaces } from '@open-mercato/ui/backend/DataTable'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { RowActions } from '@open-mercato/ui/backend/RowActions'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useConfirmDialog } from '@open-mercato/ui/backend/confirm-dialog'
import { apiCall, readApiResultOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { buildCrudExportUrl, createCrud, deleteCrud, updateCrud } from '@open-mercato/ui/backend/utils/crud'
import { Button } from '@open-mercato/ui/primitives/button'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { Input } from '@open-mercato/ui/primitives/input'
import { useT } from '@open-mercato/shared/lib/i18n/context'

type LeadOutcome = 'open' | 'won' | 'lost'
type StageKind = 'open' | 'won' | 'lost'

type LeadPipeline = {
  id: string
  name: string
  code: string
  isDefault: boolean
  isActive: boolean
}

type LeadStage = {
  id: string
  pipelineId: string
  name: string
  code: string
  position: number
  kind: StageKind
  isActive: boolean
}

type LeadLostReason = {
  id: string
  pipelineId?: string | null
  name: string
  code: string
  sortOrder: number
  isActive: boolean
}

type LeadRow = {
  id: string
  displayName: string
  pipelineId: string
  stageId: string
  outcome: LeadOutcome
  source?: string | null
  sourceChannel?: string | null
  primaryEmail?: string | null
  primaryPhone?: string | null
  vatId?: string | null
  ownerUserId?: string | null
  createdAt?: string | null
  updatedAt?: string | null
} & Record<string, unknown>

type LeadFormValues = {
  id?: string
  displayName: string
  pipelineId?: string
  stageId?: string
  outcome?: LeadOutcome
  lostReasonId?: string | null
  ownerUserId?: string | null
  source?: string | null
  sourceChannel?: string | null
  sourceExternalId?: string | null
  primaryEmail?: string | null
  primaryPhone?: string | null
  vatId?: string | null
  spamScore?: number | null
  qualificationNotes?: string | null
}

type ListResponse<T> = {
  items?: T[]
  total?: number
  totalPages?: number
}

const leadFormSchema = z.object({
  id: z.string().uuid().optional(),
  displayName: z.string().trim().min(1),
  pipelineId: z.string().uuid().optional(),
  stageId: z.string().uuid().optional(),
  outcome: z.enum(['open', 'won', 'lost']).optional(),
  lostReasonId: z.string().uuid().nullable().optional(),
  ownerUserId: z.string().uuid().nullable().optional(),
  source: z.string().nullable().optional(),
  sourceChannel: z.string().nullable().optional(),
  sourceExternalId: z.string().nullable().optional(),
  primaryEmail: z.string().email().nullable().optional().or(z.literal('')),
  primaryPhone: z.string().nullable().optional(),
  vatId: z.string().nullable().optional(),
  spamScore: z.coerce.number().min(0).max(1).nullable().optional(),
  qualificationNotes: z.string().nullable().optional(),
})

function mapPipeline(item: Record<string, unknown>): LeadPipeline | null {
  const id = typeof item.id === 'string' ? item.id : null
  if (!id) return null
  return {
    id,
    name: typeof item.name === 'string' ? item.name : id,
    code: typeof item.code === 'string' ? item.code : id,
    isDefault: item.is_default === true || item.isDefault === true,
    isActive: item.is_active !== false && item.isActive !== false,
  }
}

function mapStage(item: Record<string, unknown>): LeadStage | null {
  const id = typeof item.id === 'string' ? item.id : null
  const pipelineId = typeof item.pipeline_id === 'string' ? item.pipeline_id : typeof item.pipelineId === 'string' ? item.pipelineId : null
  if (!id || !pipelineId) return null
  const kind = item.kind === 'won' || item.kind === 'lost' ? item.kind : 'open'
  return {
    id,
    pipelineId,
    name: typeof item.name === 'string' ? item.name : id,
    code: typeof item.code === 'string' ? item.code : id,
    position: typeof item.position === 'number' ? item.position : 0,
    kind,
    isActive: item.is_active !== false && item.isActive !== false,
  }
}

function mapLostReason(item: Record<string, unknown>): LeadLostReason | null {
  const id = typeof item.id === 'string' ? item.id : null
  if (!id) return null
  return {
    id,
    pipelineId: typeof item.pipeline_id === 'string' ? item.pipeline_id : null,
    name: typeof item.name === 'string' ? item.name : id,
    code: typeof item.code === 'string' ? item.code : id,
    sortOrder: typeof item.sort_order === 'number' ? item.sort_order : 0,
    isActive: item.is_active !== false && item.isActive !== false,
  }
}

function mapLead(item: Record<string, unknown>): LeadRow | null {
  const id = typeof item.id === 'string' ? item.id : null
  if (!id) return null
  const outcome = item.outcome === 'won' || item.outcome === 'lost' ? item.outcome : 'open'
  return withDataTableNamespaces({
    id,
    displayName: typeof item.display_name === 'string' ? item.display_name : id,
    pipelineId: typeof item.pipeline_id === 'string' ? item.pipeline_id : '',
    stageId: typeof item.stage_id === 'string' ? item.stage_id : '',
    outcome,
    source: typeof item.source === 'string' ? item.source : null,
    sourceChannel: typeof item.source_channel === 'string' ? item.source_channel : null,
    primaryEmail: typeof item.primary_email === 'string' ? item.primary_email : null,
    primaryPhone: typeof item.primary_phone === 'string' ? item.primary_phone : null,
    vatId: typeof item.vat_id === 'string' ? item.vat_id : null,
    ownerUserId: typeof item.owner_user_id === 'string' ? item.owner_user_id : null,
    createdAt: typeof item.created_at === 'string' ? item.created_at : null,
    updatedAt: typeof item.updated_at === 'string' ? item.updated_at : null,
  }, item)
}

function leadToFormValues(row: LeadRow): LeadFormValues {
  return {
    id: row.id,
    displayName: row.displayName,
    pipelineId: row.pipelineId || undefined,
    stageId: row.stageId || undefined,
    outcome: row.outcome,
    ownerUserId: row.ownerUserId ?? null,
    source: row.source ?? null,
    sourceChannel: row.sourceChannel ?? null,
    primaryEmail: row.primaryEmail ?? null,
    primaryPhone: row.primaryPhone ?? null,
    vatId: row.vatId ?? null,
    qualificationNotes: typeof row.qualification_notes === 'string' ? row.qualification_notes : null,
  }
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString()
}

function outcomeBadge(outcome: LeadOutcome) {
  const variant = outcome === 'won' ? 'default' : outcome === 'lost' ? 'destructive' : 'secondary'
  return <Badge variant={variant}>{outcome}</Badge>
}

async function loadLeadConfig() {
  const [pipelinesPayload, stagesPayload, lostReasonsPayload] = await Promise.all([
    readApiResultOrThrow<ListResponse<Record<string, unknown>>>('/api/customers/lead-pipelines?pageSize=100&isActive=true'),
    readApiResultOrThrow<ListResponse<Record<string, unknown>>>('/api/customers/lead-pipeline-stages?pageSize=100&isActive=true&sortField=position&sortDir=asc'),
    readApiResultOrThrow<ListResponse<Record<string, unknown>>>('/api/customers/lead-lost-reasons?pageSize=100&isActive=true&sortField=sortOrder&sortDir=asc'),
  ])
  return {
    pipelines: (pipelinesPayload.items ?? []).map(mapPipeline).filter((item): item is LeadPipeline => item !== null),
    stages: (stagesPayload.items ?? []).map(mapStage).filter((item): item is LeadStage => item !== null),
    lostReasons: (lostReasonsPayload.items ?? []).map(mapLostReason).filter((item): item is LeadLostReason => item !== null),
  }
}

function makeFields(
  pipelines: LeadPipeline[],
  stages: LeadStage[],
  lostReasons: LeadLostReason[],
): CrudField[] {
  return [
    { id: 'displayName', label: 'Lead name', type: 'text', required: true, layout: 'full' },
    {
      id: 'pipelineId',
      label: 'Pipeline',
      type: 'select',
      required: true,
      options: pipelines.map((pipeline) => ({ value: pipeline.id, label: pipeline.name })),
      layout: 'half',
    },
    {
      id: 'stageId',
      label: 'Stage',
      type: 'select',
      required: true,
      options: stages.map((stage) => ({ value: stage.id, label: stage.name })),
      layout: 'half',
    },
    {
      id: 'outcome',
      label: 'Outcome',
      type: 'select',
      options: [
        { value: 'open', label: 'Open' },
        { value: 'won', label: 'Won' },
        { value: 'lost', label: 'Lost' },
      ],
      layout: 'half',
    },
    {
      id: 'lostReasonId',
      label: 'Lost reason',
      type: 'select',
      options: [{ value: '', label: 'None' }, ...lostReasons.map((reason) => ({ value: reason.id, label: reason.name }))],
      layout: 'half',
    },
    { id: 'primaryEmail', label: 'Primary email', type: 'text', layout: 'half' },
    { id: 'primaryPhone', label: 'Primary phone', type: 'text', layout: 'half' },
    { id: 'vatId', label: 'VAT ID', type: 'text', layout: 'half' },
    { id: 'source', label: 'Source', type: 'text', layout: 'half' },
    { id: 'sourceChannel', label: 'Source channel', type: 'text', layout: 'half' },
    { id: 'sourceExternalId', label: 'Source external ID', type: 'text', layout: 'half' },
    { id: 'qualificationNotes', label: 'Qualification notes', type: 'textarea', layout: 'full' },
  ]
}

export function LeadFormClient({
  mode,
  initialValues,
  leadId,
}: {
  mode: 'create' | 'edit'
  initialValues?: Partial<LeadFormValues>
  leadId?: string
}) {
  const router = useRouter()
  const t = useT()
  const [config, setConfig] = React.useState<{ pipelines: LeadPipeline[]; stages: LeadStage[]; lostReasons: LeadLostReason[] }>({
    pipelines: [],
    stages: [],
    lostReasons: [],
  })
  const [isLoading, setIsLoading] = React.useState(true)

  React.useEffect(() => {
    let cancelled = false
    loadLeadConfig()
      .then((next) => {
        if (!cancelled) setConfig(next)
      })
      .catch(() => {
        flash(t('customers.leads.form.configLoadError', 'Failed to load lead configuration.'), 'error')
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [t])

  const fields = React.useMemo(() => makeFields(config.pipelines, config.stages, config.lostReasons), [config])
  const defaults = React.useMemo(() => {
    const defaultPipeline = config.pipelines.find((pipeline) => pipeline.isDefault) ?? config.pipelines[0]
    const defaultStage = defaultPipeline
      ? config.stages.find((stage) => stage.pipelineId === defaultPipeline.id && stage.kind === 'open') ?? config.stages.find((stage) => stage.pipelineId === defaultPipeline.id)
      : config.stages[0]
    return {
      outcome: 'open' as LeadOutcome,
      pipelineId: defaultPipeline?.id,
      stageId: defaultStage?.id,
      ...initialValues,
    }
  }, [config, initialValues])

  async function handleSubmit(values: LeadFormValues) {
    const payload = {
      ...values,
      lostReasonId: values.lostReasonId || null,
      primaryEmail: values.primaryEmail || null,
    }
    if (mode === 'create') {
      const response = await createCrud<{ id?: string | null }>('customers/leads', payload, {
        errorMessage: t('customers.leads.create.error', 'Failed to create lead.'),
      })
      flash(t('customers.leads.create.success', 'Lead created.'), 'success')
      const id = response.result?.id
      router.push(id ? `/backend/customers/leads/${id}` : '/backend/customers/leads')
      return
    }
    await updateCrud('customers/leads', { ...payload, id: leadId ?? values.id }, {
      errorMessage: t('customers.leads.detail.updateError', 'Failed to update lead.'),
    })
    flash(t('customers.leads.detail.updated', 'Lead updated.'), 'success')
    router.refresh()
  }

  return (
    <CrudForm<LeadFormValues>
      schema={leadFormSchema}
      fields={fields}
      initialValues={defaults}
      onSubmit={handleSubmit}
      submitLabel={mode === 'create' ? t('customers.leads.create.submit', 'Create lead') : t('customers.leads.detail.save', 'Save lead')}
      cancelHref="/backend/customers/leads"
      title={mode === 'create' ? t('customers.leads.create.title', 'Create lead') : t('customers.leads.detail.title', 'Lead details')}
      backHref="/backend/customers/leads"
      isLoading={isLoading}
      loadingMessage={t('customers.leads.form.loading', 'Loading lead configuration...')}
    />
  )
}

export function LeadListClient() {
  const router = useRouter()
  const t = useT()
  const { confirm, ConfirmDialogElement } = useConfirmDialog()
  const [rows, setRows] = React.useState<LeadRow[]>([])
  const [pipelines, setPipelines] = React.useState<LeadPipeline[]>([])
  const [stages, setStages] = React.useState<LeadStage[]>([])
  const [page, setPage] = React.useState(1)
  const [pageSize] = React.useState(20)
  const [total, setTotal] = React.useState(0)
  const [totalPages, setTotalPages] = React.useState(1)
  const [search, setSearch] = React.useState('')
  const [isLoading, setIsLoading] = React.useState(true)
  const [reloadToken, setReloadToken] = React.useState(0)

  const pipelineLabel = React.useMemo(() => new Map(pipelines.map((pipeline) => [pipeline.id, pipeline.name])), [pipelines])
  const stageLabel = React.useMemo(() => new Map(stages.map((stage) => [stage.id, stage.name])), [stages])

  React.useEffect(() => {
    let cancelled = false
    loadLeadConfig()
      .then((config) => {
        if (cancelled) return
        setPipelines(config.pipelines)
        setStages(config.stages)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [reloadToken])

  React.useEffect(() => {
    let cancelled = false
    async function load() {
      setIsLoading(true)
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        sortField: 'createdAt',
        sortDir: 'desc',
      })
      if (search.trim()) params.set('search', search.trim())
      try {
        const payload = await readApiResultOrThrow<ListResponse<Record<string, unknown>>>(`/api/customers/leads?${params.toString()}`)
        if (cancelled) return
        setRows((payload.items ?? []).map(mapLead).filter((item): item is LeadRow => item !== null))
        setTotal(payload.total ?? 0)
        setTotalPages(payload.totalPages ?? 1)
      } catch {
        if (!cancelled) flash(t('customers.leads.list.loadError', 'Failed to load leads.'), 'error')
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [page, pageSize, search, reloadToken, t])

  async function deleteLead(row: LeadRow) {
    const ok = await confirm({
      title: t('customers.leads.list.deleteTitle', 'Delete lead?'),
      text: t('customers.leads.list.deleteText', 'This lead will be removed from the funnel.'),
      confirmText: t('customers.leads.list.deleteConfirm', 'Delete'),
      variant: 'destructive',
    })
    if (!ok) return
    await deleteCrud('customers/leads', row.id, {
      errorMessage: t('customers.leads.list.deleteError', 'Failed to delete lead.'),
    })
    flash(t('customers.leads.list.deleted', 'Lead deleted.'), 'success')
    setReloadToken((value) => value + 1)
  }

  const columns = React.useMemo<ColumnDef<LeadRow>[]>(() => [
    {
      accessorKey: 'displayName',
      header: t('customers.leads.list.columns.name', 'Name'),
      cell: ({ row }) => <Link className="font-medium hover:underline" href={`/backend/customers/leads/${row.original.id}`}>{row.original.displayName}</Link>,
    },
    {
      id: 'pipeline',
      header: t('customers.leads.list.columns.pipeline', 'Pipeline'),
      cell: ({ row }) => pipelineLabel.get(row.original.pipelineId) ?? '-',
    },
    {
      id: 'stage',
      header: t('customers.leads.list.columns.stage', 'Stage'),
      cell: ({ row }) => stageLabel.get(row.original.stageId) ?? '-',
    },
    {
      accessorKey: 'outcome',
      header: t('customers.leads.list.columns.outcome', 'Outcome'),
      cell: ({ row }) => outcomeBadge(row.original.outcome),
    },
    { accessorKey: 'primaryEmail', header: t('customers.leads.list.columns.email', 'Email') },
    { accessorKey: 'primaryPhone', header: t('customers.leads.list.columns.phone', 'Phone') },
    { accessorKey: 'source', header: t('customers.leads.list.columns.source', 'Source') },
    {
      accessorKey: 'createdAt',
      header: t('customers.leads.list.columns.createdAt', 'Created'),
      cell: ({ row }) => formatDate(row.original.createdAt),
    },
  ], [pipelineLabel, stageLabel, t])

  return (
    <>
      <DataTable
        columns={columns}
        data={rows}
        isLoading={isLoading}
        searchValue={search}
        onSearchChange={(value) => {
          setSearch(value)
          setPage(1)
        }}
        searchPlaceholder={t('customers.leads.list.search', 'Search leads...')}
        title={t('customers.leads.list.title', 'Leads')}
        actions={<Button asChild><Link href="/backend/customers/leads/create">{t('customers.leads.list.create', 'Create lead')}</Link></Button>}
        pagination={{ page, pageSize, total, totalPages, onPageChange: setPage }}
        rowActions={(row) => (
          <RowActions
            items={[
              { id: 'open', label: t('common.open', 'Open'), href: `/backend/customers/leads/${row.id}` },
              { id: 'delete', label: t('common.delete', 'Delete'), destructive: true, onSelect: () => void deleteLead(row) },
            ]}
          />
        )}
        onRowClick={(row) => router.push(`/backend/customers/leads/${row.id}`)}
        exporter={{
          getUrl: (format) => buildCrudExportUrl('customers/leads', { search: search.trim() || undefined }, format),
        }}
        injectionSpotId="customers.leads.table"
      />
      {ConfirmDialogElement}
    </>
  )
}

export function LeadDetailClient({ id }: { id: string }) {
  const t = useT()
  const [lead, setLead] = React.useState<LeadRow | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    async function load() {
      if (!id) {
        setError(t('customers.leads.detail.missingId', 'Lead id is missing.'))
        setIsLoading(false)
        return
      }
      try {
        const payload = await readApiResultOrThrow<ListResponse<Record<string, unknown>>>(`/api/customers/leads?ids=${encodeURIComponent(id)}&pageSize=1`)
        if (cancelled) return
        const next = (payload.items ?? []).map(mapLead).find((item) => item?.id === id) ?? null
        if (!next) setError(t('customers.leads.detail.notFound', 'Lead not found.'))
        setLead(next)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : t('customers.leads.detail.loadError', 'Failed to load lead.'))
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [id, t])

  if (isLoading) return <LoadingMessage label={t('customers.leads.detail.loading', 'Loading lead...')} />
  if (error) return <ErrorMessage label={error} />
  if (!lead) return <ErrorMessage label={t('customers.leads.detail.notFound', 'Lead not found.')} />

  return <LeadFormClient mode="edit" leadId={id} initialValues={leadToFormValues(lead)} />
}

export function LeadConfigClient() {
  const t = useT()
  const [pipelines, setPipelines] = React.useState<LeadPipeline[]>([])
  const [stages, setStages] = React.useState<LeadStage[]>([])
  const [lostReasons, setLostReasons] = React.useState<LeadLostReason[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [pipelineName, setPipelineName] = React.useState('')
  const [pipelineCode, setPipelineCode] = React.useState('')
  const [reloadToken, setReloadToken] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    loadLeadConfig()
      .then((config) => {
        if (cancelled) return
        setPipelines(config.pipelines)
        setStages(config.stages)
        setLostReasons(config.lostReasons)
      })
      .catch(() => {
        if (!cancelled) flash(t('customers.leads.config.loadError', 'Failed to load lead funnel configuration.'), 'error')
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [reloadToken, t])

  async function createPipeline() {
    const name = pipelineName.trim()
    const code = pipelineCode.trim()
    if (!name || !code) return
    const response = await apiCall('/api/customers/lead-pipelines', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, code, isActive: true, isDefault: pipelines.length === 0 }),
    })
    if (!response.ok) {
      flash(t('customers.leads.config.createPipelineError', 'Failed to create lead pipeline.'), 'error')
      return
    }
    setPipelineName('')
    setPipelineCode('')
    flash(t('customers.leads.config.pipelineCreated', 'Lead pipeline created.'), 'success')
    setReloadToken((value) => value + 1)
  }

  if (isLoading) return <LoadingMessage label={t('customers.leads.config.loading', 'Loading lead funnel configuration...')} />

  return (
    <div className="space-y-8">
      <section className="rounded-lg border bg-card p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{t('customers.leads.config.pipelines', 'Lead pipelines')}</h2>
            <p className="text-sm text-muted-foreground">{t('customers.leads.config.description', 'Configure the funnel definitions used by customer leads.')}</p>
          </div>
          <Button onClick={createPipeline}>{t('customers.leads.config.addPipeline', 'Add pipeline')}</Button>
        </div>
        <div className="mb-4 grid gap-3 md:grid-cols-2">
          <Input value={pipelineName} onChange={(event) => setPipelineName(event.target.value)} placeholder={t('customers.leads.config.pipelineName', 'Pipeline name')} />
          <Input value={pipelineCode} onChange={(event) => setPipelineCode(event.target.value)} placeholder={t('customers.leads.config.pipelineCode', 'pipeline_code')} />
        </div>
        <div className="space-y-3">
          {pipelines.map((pipeline) => (
            <div key={pipeline.id} className="rounded-md border p-3">
              <div className="flex items-center gap-2">
                <span className="font-medium">{pipeline.name}</span>
                {pipeline.isDefault ? <Badge>{t('customers.leads.config.default', 'Default')}</Badge> : null}
                {!pipeline.isActive ? <Badge variant="secondary">{t('customers.leads.config.inactive', 'Inactive')}</Badge> : null}
              </div>
              <div className="mt-2 grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
                <div>{t('customers.leads.config.stages', 'Stages')}: {stages.filter((stage) => stage.pipelineId === pipeline.id).map((stage) => stage.name).join(', ') || '-'}</div>
                <div>{t('customers.leads.config.lostReasons', 'Lost reasons')}: {lostReasons.filter((reason) => !reason.pipelineId || reason.pipelineId === pipeline.id).map((reason) => reason.name).join(', ') || '-'}</div>
              </div>
            </div>
          ))}
          {!pipelines.length ? <p className="text-sm text-muted-foreground">{t('customers.leads.config.empty', 'No lead pipelines yet.')}</p> : null}
        </div>
      </section>
    </div>
  )
}
