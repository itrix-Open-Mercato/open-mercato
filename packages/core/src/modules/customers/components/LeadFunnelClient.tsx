"use client"

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { ColumnDef } from '@tanstack/react-table'
import { z } from 'zod'
import { CrudForm, type CrudField } from '@open-mercato/ui/backend/CrudForm'
import { DataTable, withDataTableNamespaces } from '@open-mercato/ui/backend/DataTable'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { ComboboxInput, type ComboboxOption } from '@open-mercato/ui/backend/inputs'
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

type LeadFieldBinding = {
  id: string
  pipelineId?: string | null
  leadFieldKey: string
  bindingMode: 'lead_only' | 'prefill_only' | 'shared'
  targetEntityKind?: 'person' | 'company' | 'deal' | null
  targetFieldKey?: string | null
  sectionKind: 'lead' | 'person' | 'company' | 'deal'
  isActive: boolean
}

type LeadHistoryEntry = {
  id: string
  eventType: string
  actorUserId?: string | null
  note?: string | null
  metadata?: Record<string, unknown> | null
  createdAt?: string | Date | null
}

type DuplicateMatch = {
  id: string
  kind: 'person' | 'company'
  displayName: string
  primaryEmail?: string | null
  primaryPhone?: string | null
  vatId?: string | null
  matchedFields: string[]
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
  linkedPersonId?: string | null
  linkedCompanyId?: string | null
  linkedDealId?: string | null
  convertedAt?: string | null
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

type TargetKind = 'person' | 'company' | 'deal'

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

function mapFieldBinding(item: Record<string, unknown>): LeadFieldBinding | null {
  const id = typeof item.id === 'string' ? item.id : null
  const leadFieldKey = typeof item.lead_field_key === 'string' ? item.lead_field_key : null
  if (!id || !leadFieldKey) return null
  const bindingMode = item.binding_mode === 'shared' || item.binding_mode === 'prefill_only' ? item.binding_mode : 'lead_only'
  const targetEntityKind = item.target_entity_kind === 'person' || item.target_entity_kind === 'company' || item.target_entity_kind === 'deal'
    ? item.target_entity_kind
    : null
  const sectionKind = item.section_kind === 'person' || item.section_kind === 'company' || item.section_kind === 'deal' ? item.section_kind : 'lead'
  return {
    id,
    pipelineId: typeof item.pipeline_id === 'string' ? item.pipeline_id : null,
    leadFieldKey,
    bindingMode,
    targetEntityKind,
    targetFieldKey: typeof item.target_field_key === 'string' ? item.target_field_key : null,
    sectionKind,
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
    linkedPersonId: typeof item.linked_person_id === 'string' ? item.linked_person_id : null,
    linkedCompanyId: typeof item.linked_company_id === 'string' ? item.linked_company_id : null,
    linkedDealId: typeof item.linked_deal_id === 'string' ? item.linked_deal_id : null,
    convertedAt: typeof item.converted_at === 'string' ? item.converted_at : null,
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
  return date.toLocaleString()
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

async function loadLeadHistory(leadId: string): Promise<LeadHistoryEntry[]> {
  const payload = await readApiResultOrThrow<ListResponse<LeadHistoryEntry>>(
    `/api/customers/leads/history?leadId=${encodeURIComponent(leadId)}&pageSize=50`,
  )
  return payload.items ?? []
}

async function checkLeadDuplicates(lead: LeadRow): Promise<{ people: DuplicateMatch[]; companies: DuplicateMatch[]; total: number }> {
  return readApiResultOrThrow('/api/customers/leads/duplicate-check', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: lead.id,
      primaryEmail: lead.primaryEmail ?? null,
      primaryPhone: lead.primaryPhone ?? null,
      vatId: lead.vatId ?? null,
    }),
  })
}

function targetOptionFromRecord(record: Record<string, unknown>, kind: TargetKind): ComboboxOption | null {
  const id = typeof record.id === 'string' ? record.id : null
  if (!id) return null
  const primaryLabel =
    typeof record.display_name === 'string' && record.display_name.trim()
      ? record.display_name.trim()
      : typeof record.displayName === 'string' && record.displayName.trim()
        ? record.displayName.trim()
        : typeof record.title === 'string' && record.title.trim()
          ? record.title.trim()
          : id
  const secondary =
    typeof record.primary_email === 'string' && record.primary_email.trim()
      ? record.primary_email.trim()
      : typeof record.primaryEmail === 'string' && record.primaryEmail.trim()
        ? record.primaryEmail.trim()
        : typeof record.primary_phone === 'string' && record.primary_phone.trim()
          ? record.primary_phone.trim()
          : typeof record.status === 'string' && record.status.trim()
            ? record.status.trim()
            : null
  return {
    value: id,
    label: primaryLabel,
    description: secondary ? `${secondary} · ${kind}` : kind,
  }
}

async function searchLeadTargets(kind: TargetKind, query: string): Promise<ComboboxOption[]> {
  const resource = kind === 'person' ? 'people' : kind === 'company' ? 'companies' : 'deals'
  const params = new URLSearchParams({ pageSize: '10', sortField: kind === 'deal' ? 'title' : 'name', sortDir: 'asc' })
  if (query.trim()) params.set('search', query.trim())
  const payload = await readApiResultOrThrow<ListResponse<Record<string, unknown>>>(`/api/customers/${resource}?${params.toString()}`)
  return (payload.items ?? [])
    .map((item) => targetOptionFromRecord(item, kind))
    .filter((item): item is ComboboxOption => item !== null)
}

function formatHistoryEventType(eventType: string): string {
  return eventType
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function getHistoryEventTone(eventType: string): 'default' | 'secondary' | 'destructive' {
  if (eventType === 'lost' || eventType === 'deleted') return 'destructive'
  if (eventType === 'converted' || eventType === 'won') return 'default'
  return 'secondary'
}

function formatHistoryValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'none'
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }
  return String(value)
}

function historyMetadataEntries(metadata: Record<string, unknown> | null | undefined): Array<{ key: string; value: string }> {
  if (!metadata || typeof metadata !== 'object') return []
  return Object.entries(metadata)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => ({ key, value: formatHistoryValue(value) }))
}

function targetHrefForHistoryKey(key: string, value: string): string | null {
  if (!value || value === 'none') return null
  if (key.toLowerCase().includes('personid')) return `/backend/customers/people/${value}`
  if (key.toLowerCase().includes('companyid')) return `/backend/customers/companies/${value}`
  if (key.toLowerCase().includes('dealid')) return `/backend/customers/deals/${value}`
  return null
}

function LeadHistoryTimeline({
  entries,
  emptyLabel,
}: {
  entries: LeadHistoryEntry[]
  emptyLabel: string
}) {
  const rowHeight = 236
  const viewportHeight = 520
  const overscan = 4
  const [scrollTop, setScrollTop] = React.useState(0)
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan)
  const endIndex = Math.min(entries.length, Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscan)
  const visibleEntries = entries.slice(startIndex, endIndex)

  if (!entries.length) return <p className="text-sm text-muted-foreground">{emptyLabel}</p>

  return (
    <div
      className="mt-4 overflow-auto rounded-md border bg-muted/10"
      style={{ height: Math.min(viewportHeight, entries.length * rowHeight) }}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      <div className="relative" style={{ height: entries.length * rowHeight }}>
        {visibleEntries.map((entry, offset) => {
          const index = startIndex + offset
          const details = historyMetadataEntries(entry.metadata)
          return (
            <article
              key={entry.id}
              className="absolute left-0 right-0 overflow-hidden border-b bg-card px-4 py-3 text-sm"
              style={{ top: index * rowHeight, minHeight: rowHeight, height: rowHeight }}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={getHistoryEventTone(entry.eventType)}>{formatHistoryEventType(entry.eventType)}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(typeof entry.createdAt === 'string' ? entry.createdAt : entry.createdAt?.toISOString() ?? null)}
                    </span>
                  </div>
                  {entry.actorUserId ? (
                    <div className="mt-1 text-xs text-muted-foreground">Actor: {entry.actorUserId}</div>
                  ) : null}
                </div>
                <div className="text-xs text-muted-foreground">#{index + 1}</div>
              </div>
              {entry.note ? <p className="mt-2 line-clamp-2 text-sm">{entry.note}</p> : null}
              {details.length ? (
                <dl className="mt-2 grid gap-1 md:grid-cols-2">
                  {details.slice(0, 6).map((detail) => {
                    const href = targetHrefForHistoryKey(detail.key, detail.value)
                    return (
                      <div key={detail.key} className="min-w-0 rounded bg-muted/40 px-2 py-1.5">
                        <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{detail.key}</dt>
                        <dd className="truncate font-mono text-xs">
                          {href ? <Link className="underline" href={href}>{detail.value}</Link> : detail.value}
                        </dd>
                      </div>
                    )
                  })}
                  {details.length > 6 ? (
                    <div className="rounded bg-muted/40 px-2 py-1.5 text-xs text-muted-foreground">
                      +{details.length - 6} more details
                    </div>
                  ) : null}
                </dl>
              ) : null}
            </article>
          )
        })}
      </div>
    </div>
  )
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
        actions={(
          <div className="flex gap-2">
            <Button variant="outline" asChild><Link href="/backend/customers/leads/pipeline">{t('customers.leads.list.pipeline', 'Pipeline board')}</Link></Button>
            <Button asChild><Link href="/backend/customers/leads/create">{t('customers.leads.list.create', 'Create lead')}</Link></Button>
          </div>
        )}
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

export function LeadBoardClient() {
  const t = useT()
  const router = useRouter()
  const [pipelines, setPipelines] = React.useState<LeadPipeline[]>([])
  const [stages, setStages] = React.useState<LeadStage[]>([])
  const [lostReasons, setLostReasons] = React.useState<LeadLostReason[]>([])
  const [selectedPipelineId, setSelectedPipelineId] = React.useState<string>('')
  const [rows, setRows] = React.useState<LeadRow[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [reloadToken, setReloadToken] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    loadLeadConfig()
      .then((config) => {
        if (cancelled) return
        setPipelines(config.pipelines)
        setStages(config.stages)
        setLostReasons(config.lostReasons)
        setSelectedPipelineId((current) => current || config.pipelines.find((pipeline) => pipeline.isDefault)?.id || config.pipelines[0]?.id || '')
      })
      .catch(() => flash(t('customers.leads.pipeline.configError', 'Failed to load lead pipeline configuration.'), 'error'))
    return () => {
      cancelled = true
    }
  }, [t])

  React.useEffect(() => {
    let cancelled = false
    async function load() {
      if (!selectedPipelineId) {
        setRows([])
        setIsLoading(false)
        return
      }
      setIsLoading(true)
      try {
        const payload = await readApiResultOrThrow<ListResponse<Record<string, unknown>>>(
          `/api/customers/leads?pipelineId=${encodeURIComponent(selectedPipelineId)}&pageSize=100&sortField=createdAt&sortDir=desc`,
        )
        if (!cancelled) {
          setRows((payload.items ?? []).map(mapLead).filter((row): row is LeadRow => row !== null))
        }
      } catch {
        if (!cancelled) flash(t('customers.leads.pipeline.loadError', 'Failed to load lead board.'), 'error')
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [selectedPipelineId, reloadToken, t])

  async function moveLead(lead: LeadRow, stage: LeadStage) {
    const body: Record<string, unknown> = { id: lead.id, stageId: stage.id }
    if (stage.kind === 'lost') {
      const reason = lostReasons.find((item) => !item.pipelineId || item.pipelineId === lead.pipelineId)
      if (!reason) {
        flash(t('customers.leads.pipeline.missingLostReason', 'Configure a lost reason before moving a lead to a lost stage.'), 'error')
        return
      }
      body.lostReasonId = reason.id
    }
    const result = await apiCall('/api/customers/leads/advance-stage', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!result.ok) {
      flash(t('customers.leads.pipeline.moveError', 'Failed to move lead.'), 'error')
      return
    }
    flash(t('customers.leads.pipeline.moved', 'Lead moved.'), 'success')
    setReloadToken((value) => value + 1)
  }

  const visibleStages = React.useMemo(
    () => stages.filter((stage) => stage.pipelineId === selectedPipelineId).sort((a, b) => a.position - b.position),
    [selectedPipelineId, stages],
  )

  if (isLoading && !rows.length) return <LoadingMessage label={t('customers.leads.pipeline.loading', 'Loading lead pipeline...')} />

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{t('customers.leads.pipeline.title', 'Lead pipeline')}</h1>
          <p className="text-sm text-muted-foreground">{t('customers.leads.pipeline.description', 'Move leads between qualification stages.')}</p>
        </div>
        <select
          className="h-9 rounded-md border bg-background px-3 text-sm"
          value={selectedPipelineId}
          onChange={(event) => setSelectedPipelineId(event.target.value)}
        >
          {pipelines.map((pipeline) => <option key={pipeline.id} value={pipeline.id}>{pipeline.name}</option>)}
        </select>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {visibleStages.map((stage) => {
          const stageRows = rows.filter((row) => row.stageId === stage.id)
          return (
            <section key={stage.id} className="min-h-80 rounded-lg border bg-muted/20 p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="font-medium">{stage.name}</div>
                <Badge variant={stage.kind === 'lost' ? 'destructive' : stage.kind === 'won' ? 'default' : 'secondary'}>{stageRows.length}</Badge>
              </div>
              <div className="space-y-2">
                {stageRows.map((lead) => (
                  <article key={lead.id} className="rounded-md border bg-background p-3 shadow-sm">
                    <button className="text-left font-medium hover:underline" onClick={() => router.push(`/backend/customers/leads/${lead.id}`)}>
                      {lead.displayName}
                    </button>
                    <div className="mt-1 text-xs text-muted-foreground">{lead.primaryEmail || lead.primaryPhone || lead.source || '-'}</div>
                    <div className="mt-3 flex flex-wrap gap-1">
                      {visibleStages
                        .filter((candidate) => candidate.id !== stage.id)
                        .map((candidate) => (
                          <Button key={candidate.id} size="sm" variant="outline" onClick={() => void moveLead(lead, candidate)}>
                            {candidate.name}
                          </Button>
                        ))}
                    </div>
                  </article>
                ))}
                {!stageRows.length ? <p className="text-sm text-muted-foreground">{t('customers.leads.pipeline.emptyStage', 'No leads in this stage.')}</p> : null}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

export function LeadDetailClient({ id }: { id: string }) {
  const t = useT()
  const [lead, setLead] = React.useState<LeadRow | null>(null)
  const [config, setConfig] = React.useState<{ stages: LeadStage[]; lostReasons: LeadLostReason[] }>({ stages: [], lostReasons: [] })
  const [history, setHistory] = React.useState<LeadHistoryEntry[]>([])
  const [duplicates, setDuplicates] = React.useState<{ people: DuplicateMatch[]; companies: DuplicateMatch[]; total: number } | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [selectedStageId, setSelectedStageId] = React.useState('')
  const [selectedLostReasonId, setSelectedLostReasonId] = React.useState('')
  const [ownerUserId, setOwnerUserId] = React.useState('')
  const [linkPersonId, setLinkPersonId] = React.useState('')
  const [linkCompanyId, setLinkCompanyId] = React.useState('')
  const [linkDealId, setLinkDealId] = React.useState('')
  const [convertCreatePerson, setConvertCreatePerson] = React.useState(false)
  const [convertCreateCompany, setConvertCreateCompany] = React.useState(false)
  const [convertCreateDeal, setConvertCreateDeal] = React.useState(false)
  const [convertWonStageId, setConvertWonStageId] = React.useState('')
  const [convertNote, setConvertNote] = React.useState('')
  const [reloadToken, setReloadToken] = React.useState(0)

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
        if (next) {
          setSelectedStageId(next.stageId)
          setOwnerUserId(next.ownerUserId ?? '')
          setLinkPersonId('')
          setLinkCompanyId('')
          setLinkDealId('')
          setConvertCreatePerson(false)
          setConvertCreateCompany(false)
          setConvertCreateDeal(false)
          setConvertNote('')
          const [nextConfig, nextHistory, nextDuplicates] = await Promise.all([
            loadLeadConfig(),
            loadLeadHistory(next.id),
            checkLeadDuplicates(next).catch(() => ({ people: [], companies: [], total: 0 })),
          ])
          if (!cancelled) {
            setConfig({ stages: nextConfig.stages, lostReasons: nextConfig.lostReasons })
            setHistory(nextHistory)
            setDuplicates(nextDuplicates)
          }
        }
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
  }, [id, reloadToken, t])

  async function advanceStage() {
    if (!lead || !selectedStageId) return
    const stage = config.stages.find((item) => item.id === selectedStageId)
    const body: Record<string, unknown> = { id: lead.id, stageId: selectedStageId }
    if (stage?.kind === 'lost') {
      if (!selectedLostReasonId) {
        flash(t('customers.leads.detail.lostReasonRequired', 'Lost reason is required.'), 'error')
        return
      }
      body.lostReasonId = selectedLostReasonId
    }
    const result = await apiCall('/api/customers/leads/advance-stage', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!result.ok) {
      flash(t('customers.leads.detail.advanceError', 'Failed to advance lead stage.'), 'error')
      return
    }
    flash(t('customers.leads.detail.stageAdvanced', 'Lead stage updated.'), 'success')
    setReloadToken((value) => value + 1)
  }

  async function runLeadAction(endpoint: string, body: Record<string, unknown>, successMessage: string, errorMessage: string) {
    const result = await apiCall(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!result.ok) {
      flash(errorMessage, 'error')
      return
    }
    flash(successMessage, 'success')
    setReloadToken((value) => value + 1)
  }

  async function linkTarget(kind: TargetKind) {
    if (!lead) return
    const value = kind === 'person' ? linkPersonId.trim() : kind === 'company' ? linkCompanyId.trim() : linkDealId.trim()
    if (!value) {
      flash(t('customers.leads.detail.linkIdRequired', 'Target id is required.'), 'error')
      return
    }
    await runLeadAction(
      `/api/customers/leads/link-${kind}`,
      { leadId: lead.id, [`${kind}Id`]: value },
      t('customers.leads.detail.linked', 'Target linked.'),
      t('customers.leads.detail.linkError', 'Failed to link target.'),
    )
  }

  async function convertLead() {
    if (!lead) return
    const hasPerson = Boolean(lead.linkedPersonId || linkPersonId.trim() || convertCreatePerson)
    const hasCompany = Boolean(lead.linkedCompanyId || linkCompanyId.trim() || convertCreateCompany)
    const hasDeal = Boolean(lead.linkedDealId || linkDealId.trim() || convertCreateDeal)
    if (!hasPerson && !hasCompany && !hasDeal) {
      flash(t('customers.leads.detail.convertTargetRequired', 'Choose at least one conversion target.'), 'error')
      return
    }
    await runLeadAction(
      '/api/customers/leads/convert',
      {
        leadId: lead.id,
        personId: linkPersonId.trim() || lead.linkedPersonId || null,
        companyId: linkCompanyId.trim() || lead.linkedCompanyId || null,
        dealId: linkDealId.trim() || lead.linkedDealId || null,
        createPerson: convertCreatePerson,
        createCompany: convertCreateCompany,
        createDeal: convertCreateDeal,
        wonStageId: convertWonStageId || null,
        note: convertNote.trim() || null,
      },
      t('customers.leads.detail.converted', 'Lead converted.'),
      t('customers.leads.detail.convertError', 'Failed to convert lead.'),
    )
  }

  async function assignOwner() {
    if (!lead) return
    const result = await apiCall('/api/customers/leads/assign', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: lead.id, ownerUserId: ownerUserId.trim() || null }),
    })
    if (!result.ok) {
      flash(t('customers.leads.detail.assignError', 'Failed to assign lead.'), 'error')
      return
    }
    flash(t('customers.leads.detail.assigned', 'Lead owner updated.'), 'success')
    setReloadToken((value) => value + 1)
  }

  if (isLoading) return <LoadingMessage label={t('customers.leads.detail.loading', 'Loading lead...')} />
  if (error) return <ErrorMessage label={error} />
  if (!lead) return <ErrorMessage label={t('customers.leads.detail.notFound', 'Lead not found.')} />

  const leadStages = config.stages.filter((stage) => stage.pipelineId === lead.pipelineId)
  const wonStages = leadStages.filter((stage) => stage.kind === 'won')
  const leadLostReasons = config.lostReasons.filter((reason) => !reason.pipelineId || reason.pipelineId === lead.pipelineId)

  return (
    <div className="space-y-6">
      {duplicates && duplicates.total > 0 ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <div className="font-medium">{t('customers.leads.detail.duplicatesTitle', 'Potential duplicates found')}</div>
          <div className="mt-2 space-y-1">
            {[...duplicates.people, ...duplicates.companies].map((match) => (
              <div key={match.id}>
                {match.kind}: <Link className="underline" href={`/backend/customers/${match.kind === 'person' ? 'people' : 'companies'}/${match.id}`}>{match.displayName}</Link>
                {' '}({match.matchedFields.join(', ')})
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <section className="rounded-lg border bg-card p-4">
        <h2 className="text-lg font-semibold">{t('customers.leads.detail.workflow', 'Qualification workflow')}</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="space-y-2">
            <label className="text-sm font-medium">{t('customers.leads.detail.stage', 'Stage')}</label>
            <select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={selectedStageId} onChange={(event) => setSelectedStageId(event.target.value)}>
              {leadStages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">{t('customers.leads.detail.lostReason', 'Lost reason')}</label>
            <select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={selectedLostReasonId} onChange={(event) => setSelectedLostReasonId(event.target.value)}>
              <option value="">{t('common.none', 'None')}</option>
              {leadLostReasons.map((reason) => <option key={reason.id} value={reason.id}>{reason.name}</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <Button onClick={() => void advanceStage()}>{t('customers.leads.detail.advanceStage', 'Update stage')}</Button>
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium">{t('customers.leads.detail.ownerUserId', 'Owner user ID')}</label>
            <Input value={ownerUserId} onChange={(event) => setOwnerUserId(event.target.value)} placeholder="00000000-0000-0000-0000-000000000000" />
          </div>
          <div className="flex items-end">
            <Button variant="outline" onClick={() => void assignOwner()}>{t('customers.leads.detail.assign', 'Assign')}</Button>
          </div>
        </div>
      </section>
      <section className="rounded-lg border bg-card p-4">
        <h2 className="text-lg font-semibold">{t('customers.leads.detail.linksConversion', 'Links & conversion')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('customers.leads.detail.linksDescription', 'Link existing CRM records or create staging targets from this lead without closing the lead.')}
        </p>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <div className="space-y-3 rounded-md border p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="font-medium">{t('customers.leads.detail.personTarget', 'Person')}</div>
              {lead.linkedPersonId ? <Badge variant="secondary">{t('customers.leads.detail.linkedBadge', 'Linked')}</Badge> : null}
            </div>
            {lead.linkedPersonId ? <Link className="text-sm underline" href={`/backend/customers/people/${lead.linkedPersonId}`}>{t('customers.leads.detail.openLinkedPerson', 'Open linked person')}</Link> : null}
            <ComboboxInput
              value={linkPersonId}
              onChange={setLinkPersonId}
              placeholder={t('customers.leads.detail.searchPerson', 'Search person by name, email, or phone...')}
              loadSuggestions={(query) => searchLeadTargets('person', query ?? '')}
              allowCustomValues={false}
            />
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => void linkTarget('person')}>{t('customers.leads.detail.linkSelected', 'Link selected')}</Button>
              <Button size="sm" asChild><Link href={`/backend/customers/people/create?leadId=${encodeURIComponent(lead.id)}`}>{t('customers.leads.detail.createInOm', 'Create in OM')}</Link></Button>
            </div>
          </div>
          <div className="space-y-3 rounded-md border p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="font-medium">{t('customers.leads.detail.companyTarget', 'Company')}</div>
              {lead.linkedCompanyId ? <Badge variant="secondary">{t('customers.leads.detail.linkedBadge', 'Linked')}</Badge> : null}
            </div>
            {lead.linkedCompanyId ? <Link className="text-sm underline" href={`/backend/customers/companies/${lead.linkedCompanyId}`}>{t('customers.leads.detail.openLinkedCompany', 'Open linked company')}</Link> : null}
            <ComboboxInput
              value={linkCompanyId}
              onChange={setLinkCompanyId}
              placeholder={t('customers.leads.detail.searchCompany', 'Search company by name, email, or phone...')}
              loadSuggestions={(query) => searchLeadTargets('company', query ?? '')}
              allowCustomValues={false}
            />
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => void linkTarget('company')}>{t('customers.leads.detail.linkSelected', 'Link selected')}</Button>
              <Button size="sm" asChild><Link href={`/backend/customers/companies/create?leadId=${encodeURIComponent(lead.id)}`}>{t('customers.leads.detail.createInOm', 'Create in OM')}</Link></Button>
            </div>
          </div>
          <div className="space-y-3 rounded-md border p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="font-medium">{t('customers.leads.detail.dealTarget', 'Deal')}</div>
              {lead.linkedDealId ? <Badge variant="secondary">{t('customers.leads.detail.linkedBadge', 'Linked')}</Badge> : null}
            </div>
            {lead.linkedDealId ? <Link className="text-sm underline" href={`/backend/customers/deals/${lead.linkedDealId}`}>{t('customers.leads.detail.openLinkedDeal', 'Open linked deal')}</Link> : null}
            <ComboboxInput
              value={linkDealId}
              onChange={setLinkDealId}
              placeholder={t('customers.leads.detail.searchDeal', 'Search deal by title or status...')}
              loadSuggestions={(query) => searchLeadTargets('deal', query ?? '')}
              allowCustomValues={false}
            />
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => void linkTarget('deal')}>{t('customers.leads.detail.linkSelected', 'Link selected')}</Button>
              <Button size="sm" asChild><Link href={`/backend/customers/deals/create?leadId=${encodeURIComponent(lead.id)}`}>{t('customers.leads.detail.createInOm', 'Create in OM')}</Link></Button>
            </div>
          </div>
        </div>
        <div className="mt-6 rounded-md border bg-muted/20 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold">{t('customers.leads.detail.conversionReview', 'Conversion review')}</h3>
              <p className="text-sm text-muted-foreground">{t('customers.leads.detail.conversionReviewDescription', 'Confirm which CRM targets should be linked or created before closing this lead as won.')}</p>
            </div>
            {lead.convertedAt ? <Badge>{t('customers.leads.detail.convertedBadge', 'Converted')}</Badge> : null}
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={convertCreatePerson} disabled={Boolean(lead.linkedPersonId)} onChange={(event) => setConvertCreatePerson(event.target.checked)} />
              {t('customers.leads.detail.createMissingPerson', 'Create missing person')}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={convertCreateCompany} disabled={Boolean(lead.linkedCompanyId)} onChange={(event) => setConvertCreateCompany(event.target.checked)} />
              {t('customers.leads.detail.createMissingCompany', 'Create missing company')}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={convertCreateDeal} disabled={Boolean(lead.linkedDealId)} onChange={(event) => setConvertCreateDeal(event.target.checked)} />
              {t('customers.leads.detail.createMissingDeal', 'Create missing deal')}
            </label>
            <div className="space-y-2 md:col-span-1">
              <label className="text-sm font-medium">{t('customers.leads.detail.wonStage', 'Won stage')}</label>
              <select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={convertWonStageId} onChange={(event) => setConvertWonStageId(event.target.value)}>
                <option value="">{t('customers.leads.detail.defaultWonStage', 'Default won stage')}</option>
                {wonStages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
              </select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">{t('customers.leads.detail.conversionNote', 'Conversion note')}</label>
              <Input value={convertNote} onChange={(event) => setConvertNote(event.target.value)} placeholder={t('customers.leads.detail.conversionNotePlaceholder', 'Optional audit note')} />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <Button onClick={() => void convertLead()} disabled={Boolean(lead.convertedAt)}>
              {t('customers.leads.detail.convert', 'Convert lead')}
            </Button>
          </div>
        </div>
      </section>
      <LeadFormClient mode="edit" leadId={id} initialValues={leadToFormValues(lead)} />
      <section className="rounded-lg border bg-card p-4">
        <h2 className="text-lg font-semibold">{t('customers.leads.detail.history', 'Lead history')}</h2>
        <LeadHistoryTimeline
          entries={history}
          emptyLabel={t('customers.leads.detail.noHistory', 'No history entries yet.')}
        />
      </section>
    </div>
  )
}

export function LeadConfigClient() {
  const t = useT()
  const [pipelines, setPipelines] = React.useState<LeadPipeline[]>([])
  const [stages, setStages] = React.useState<LeadStage[]>([])
  const [lostReasons, setLostReasons] = React.useState<LeadLostReason[]>([])
  const [fieldBindings, setFieldBindings] = React.useState<LeadFieldBinding[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [pipelineName, setPipelineName] = React.useState('')
  const [pipelineCode, setPipelineCode] = React.useState('')
  const [bindingLeadField, setBindingLeadField] = React.useState('')
  const [bindingTargetField, setBindingTargetField] = React.useState('')
  const [bindingMode, setBindingMode] = React.useState<LeadFieldBinding['bindingMode']>('shared')
  const [bindingTargetKind, setBindingTargetKind] = React.useState<'person' | 'company' | 'deal'>('person')
  const [reloadToken, setReloadToken] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    Promise.all([
      loadLeadConfig(),
      readApiResultOrThrow<ListResponse<Record<string, unknown>>>('/api/customers/lead-field-bindings?pageSize=100'),
    ])
      .then(([config, bindingsPayload]) => {
        if (cancelled) return
        setPipelines(config.pipelines)
        setStages(config.stages)
        setLostReasons(config.lostReasons)
        setFieldBindings((bindingsPayload.items ?? []).map(mapFieldBinding).filter((item): item is LeadFieldBinding => item !== null))
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

  async function createFieldBinding() {
    const leadFieldKey = bindingLeadField.trim()
    const targetFieldKey = bindingTargetField.trim()
    if (!leadFieldKey) return
    const response = await apiCall('/api/customers/lead-field-bindings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        leadFieldKey,
        bindingMode,
        targetEntityKind: bindingMode === 'lead_only' ? null : bindingTargetKind,
        targetFieldKey: bindingMode === 'lead_only' ? null : targetFieldKey || null,
        sectionKind: bindingMode === 'lead_only' ? 'lead' : bindingTargetKind,
        isActive: true,
      }),
    })
    if (!response.ok) {
      flash(t('customers.leads.config.createBindingError', 'Failed to create field binding.'), 'error')
      return
    }
    setBindingLeadField('')
    setBindingTargetField('')
    flash(t('customers.leads.config.bindingCreated', 'Field binding created.'), 'success')
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
      <section className="rounded-lg border bg-card p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{t('customers.leads.config.fieldBindings', 'Lead field bindings')}</h2>
            <p className="text-sm text-muted-foreground">{t('customers.leads.config.fieldBindingsDescription', 'Mark lead fields as lead-only, prefill-only, or shared write-through fields.')}</p>
          </div>
          <Button onClick={createFieldBinding}>{t('customers.leads.config.addBinding', 'Add binding')}</Button>
        </div>
        <div className="mb-4 grid gap-3 md:grid-cols-4">
          <Input value={bindingLeadField} onChange={(event) => setBindingLeadField(event.target.value)} placeholder="lead field, e.g. primaryEmail" />
          <select className="h-9 rounded-md border bg-background px-3 text-sm" value={bindingMode} onChange={(event) => setBindingMode(event.target.value as LeadFieldBinding['bindingMode'])}>
            <option value="shared">Shared</option>
            <option value="prefill_only">Prefill only</option>
            <option value="lead_only">Lead only</option>
          </select>
          <select className="h-9 rounded-md border bg-background px-3 text-sm" value={bindingTargetKind} onChange={(event) => setBindingTargetKind(event.target.value as 'person' | 'company' | 'deal')} disabled={bindingMode === 'lead_only'}>
            <option value="person">Person</option>
            <option value="company">Company</option>
            <option value="deal">Deal</option>
          </select>
          <Input value={bindingTargetField} onChange={(event) => setBindingTargetField(event.target.value)} placeholder="target field, e.g. primaryEmail" disabled={bindingMode === 'lead_only'} />
        </div>
        <div className="space-y-2">
          {fieldBindings.map((binding) => (
            <div key={binding.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm">
              <div>
                <span className="font-medium">{binding.leadFieldKey}</span>
                {binding.targetEntityKind && binding.targetFieldKey ? <span className="text-muted-foreground">{' -> '}{binding.targetEntityKind}.{binding.targetFieldKey}</span> : null}
              </div>
              <div className="flex gap-2">
                <Badge variant={binding.bindingMode === 'shared' ? 'default' : 'secondary'}>{binding.bindingMode}</Badge>
                <Badge variant="outline">{binding.sectionKind}</Badge>
                {!binding.isActive ? <Badge variant="destructive">{t('customers.leads.config.inactive', 'Inactive')}</Badge> : null}
              </div>
            </div>
          ))}
          {!fieldBindings.length ? <p className="text-sm text-muted-foreground">{t('customers.leads.config.noFieldBindings', 'No field bindings configured yet.')}</p> : null}
        </div>
      </section>
    </div>
  )
}
