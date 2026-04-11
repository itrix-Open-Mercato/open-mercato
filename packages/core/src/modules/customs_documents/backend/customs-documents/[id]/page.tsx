"use client"

import * as React from 'react'
import Link from 'next/link'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { Button } from '@open-mercato/ui/primitives/button'
import { Card, CardContent, CardHeader, CardTitle } from '@open-mercato/ui/primitives/card'
import { Label } from '@open-mercato/ui/primitives/label'
import { Separator } from '@open-mercato/ui/primitives/separator'
import { CheckCircle2, FileText, Play, RefreshCcw, ShieldCheck, UploadCloud } from 'lucide-react'

type DocumentKind = 'bill_of_lading' | 'commercial_invoice' | 'packing_list'

type CustomsCase = {
  id: string
  reference: string
  status: 'uploaded' | 'processing' | 'review_required' | 'classified' | 'approved' | 'failed'
  finalConfidence?: string | null
  createdAt: string
  updatedAt: string
}

type CustomsDocument = {
  id: string
  caseId: string
  attachmentId: string
  kind: DocumentKind | 'other'
  status: string
  fileName?: string | null
  mimeType?: string | null
  hasContent: boolean
  contentPreview?: string | null
}

type ConsistencyCheck = {
  id: string
  field: string
  sourceA: string
  sourceB: string
  valueA?: string | null
  valueB?: string | null
  status: 'pass' | 'warning' | 'fail' | 'missing_source'
  message?: string | null
}

type LineItem = {
  id: string
  caseId: string
  description: string
  quantity?: string | null
  grossWeightKg?: string | null
  netWeightKg?: string | null
  invoiceHsCode?: string | null
  status: 'pending' | 'candidates_ready' | 'classified'
  selectedDecision?: HsDecision | null
}

type HsDecision = {
  id: string
  lineItemId: string
  caseId: string
  candidateId?: string | null
  selectedHsCode: string
  selectedDescription?: string | null
  confidenceScore?: string | null
  confidenceBand: 'low' | 'medium' | 'high'
  note?: string | null
  createdAt: string
}

type HsCandidate = {
  id: string
  lineItemId: string
  hsCode: string
  description: string
  score: string
  explanation: string
  sourceBreakdown?: Record<string, unknown> | null
}

type AttachmentUploadResponse = {
  ok: true
  item: {
    id: string
    fileName: string
    content?: string | null
  }
}

type EnrichmentResponse = {
  hsCode: string
  date: string
  language: string
  source: 'live' | 'cached' | 'error'
  summary?: {
    measureCount?: number
    taxCount?: number
    dutyExpressions?: string[]
    supplementaryUnits?: string[]
  } | null
  error?: string | null
}

const ENTITY_ID = 'customs_documents:customs_case'
const DOCUMENT_KINDS: DocumentKind[] = ['bill_of_lading', 'commercial_invoice', 'packing_list']

function currentLocalDate(): string {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

function formatMaybe(value: string | null | undefined, empty: string): string {
  return value && value.trim().length > 0 ? value : empty
}

export default function CustomsCaseDetailPage({ params }: { params?: { id?: string } }) {
  const t = useT()
  const caseId = params?.id ?? ''
  const { runMutation } = useGuardedMutation<Record<string, unknown>>({
    contextId: 'customs_documents.case_detail',
  })
  const [customsCase, setCustomsCase] = React.useState<CustomsCase | null>(null)
  const [documents, setDocuments] = React.useState<CustomsDocument[]>([])
  const [checks, setChecks] = React.useState<ConsistencyCheck[]>([])
  const [lineItems, setLineItems] = React.useState<LineItem[]>([])
  const [candidatesByLineItem, setCandidatesByLineItem] = React.useState<Record<string, HsCandidate[]>>({})
  const [enrichmentByCandidate, setEnrichmentByCandidate] = React.useState<Record<string, EnrichmentResponse>>({})
  const [files, setFiles] = React.useState<Partial<Record<DocumentKind, File | null>>>({})
  const [isLoading, setIsLoading] = React.useState(true)
  const [isProcessing, setIsProcessing] = React.useState(false)
  const [isUploading, setIsUploading] = React.useState(false)
  const [notFound, setNotFound] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const loadCandidates = React.useCallback(async (items: LineItem[]) => {
    const entries = await Promise.all(items.map(async (item) => {
      const call = await apiCall<{ lineItem: LineItem; items: HsCandidate[] }>(
        `/api/customs_documents/line-items/${encodeURIComponent(item.id)}/candidates`,
        undefined,
        { fallback: { lineItem: item, items: [] } },
      )
      return [item.id, call.ok ? (call.result?.items ?? []) : []] as const
    }))
    setCandidatesByLineItem(Object.fromEntries(entries))
  }, [])

  const load = React.useCallback(async () => {
    if (!caseId) return
    setIsLoading(true)
    setError(null)
    const [caseCall, documentsCall, checksCall, lineItemsCall] = await Promise.all([
      apiCall<CustomsCase>(`/api/customs_documents/cases/${encodeURIComponent(caseId)}`, undefined, { fallback: null }),
      apiCall<{ items: CustomsDocument[] }>(`/api/customs_documents/cases/${encodeURIComponent(caseId)}/documents`, undefined, { fallback: { items: [] } }),
      apiCall<{ items: ConsistencyCheck[] }>(`/api/customs_documents/cases/${encodeURIComponent(caseId)}/consistency`, undefined, { fallback: { items: [] } }),
      apiCall<{ items: LineItem[] }>(`/api/customs_documents/cases/${encodeURIComponent(caseId)}/line-items`, undefined, { fallback: { items: [] } }),
    ])
    if (!caseCall.ok || !caseCall.result) {
      setNotFound(true)
      setIsLoading(false)
      return
    }
    if (!documentsCall.ok || !checksCall.ok || !lineItemsCall.ok) {
      setError(t('customs_documents.detail.errors.load'))
    }
    const loadedLineItems = lineItemsCall.result?.items ?? []
    setCustomsCase(caseCall.result)
    setDocuments(documentsCall.result?.items ?? [])
    setChecks(checksCall.result?.items ?? [])
    setLineItems(loadedLineItems)
    await loadCandidates(loadedLineItems)
    setNotFound(false)
    setIsLoading(false)
  }, [caseId, loadCandidates, t])

  React.useEffect(() => {
    void load()
  }, [load])

  const attachDocuments = React.useCallback(async (selectedFiles: Partial<Record<DocumentKind, File | null>>) => {
    const selectedKinds = DOCUMENT_KINDS.filter((kind) => selectedFiles[kind])
      if (!selectedKinds.length) {
        flash(t('customs_documents.detail.errors.noFiles'), 'error')
        return false
      }
      const documentsToAttach = await runMutation({
        context: {
          resourceKind: 'customs_documents.document',
          operation: 'create',
          caseId,
        },
        mutationPayload: { kinds: selectedKinds },
        operation: async () => {
          const uploaded = await Promise.all(selectedKinds.map(async (kind) => {
            const file = selectedFiles[kind]
            if (!file) return null
            const form = new FormData()
            form.set('entityId', ENTITY_ID)
            form.set('recordId', caseId)
            form.set('fieldKey', kind)
            form.set('file', file)
            const call = await apiCall<AttachmentUploadResponse>(
              '/api/attachments',
              { method: 'POST', body: form },
              { fallback: null },
            )
            if (!call.ok || !call.result?.item?.id) {
              throw new Error(t('customs_documents.detail.errors.upload'))
            }
            return { attachmentId: call.result.item.id, kind }
          }))
          return uploaded.filter((item): item is { attachmentId: string; kind: DocumentKind } => item !== null)
        },
      })
      await runMutation({
        context: {
          resourceKind: 'customs_documents.document',
          operation: 'create',
          caseId,
        },
        mutationPayload: { documents: documentsToAttach },
        operation: async () => {
          const call = await apiCall(
            `/api/customs_documents/cases/${encodeURIComponent(caseId)}/documents`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ documents: documentsToAttach }),
            },
            { fallback: null },
          )
          if (!call.ok) throw new Error(t('customs_documents.detail.errors.attach'))
          return call.result
        },
      })
      return true
  }, [caseId, runMutation, t])

  const uploadAndAttach = React.useCallback(async () => {
    setIsUploading(true)
    try {
      const attached = await attachDocuments(files)
      if (!attached) return
      setFiles({})
      flash(t('customs_documents.detail.messages.attached'), 'success')
      await load()
    } catch (error) {
      flash(error instanceof Error ? error.message : t('customs_documents.detail.errors.attach'), 'error')
    } finally {
      setIsUploading(false)
    }
  }, [attachDocuments, files, load, t])

  const processCase = React.useCallback(async () => {
    setIsProcessing(true)
    try {
      const result = await runMutation({
        context: {
          resourceKind: 'customs_documents.case',
          operation: 'custom',
          caseId,
        },
        mutationPayload: { caseId },
        operation: async () => {
          const call = await apiCall<{ lineItems: LineItem[]; consistencyChecks: ConsistencyCheck[] }>(
            `/api/customs_documents/cases/${encodeURIComponent(caseId)}/process`,
            { method: 'POST' },
            { fallback: null },
          )
          if (!call.ok || !call.result) throw new Error(t('customs_documents.detail.errors.process'))
          return call.result
        },
      })
      setLineItems(result.lineItems)
      setChecks(result.consistencyChecks)
      await loadCandidates(result.lineItems)
      flash(t('customs_documents.detail.messages.processed'), 'success')
      await load()
    } catch (error) {
      flash(error instanceof Error ? error.message : t('customs_documents.detail.errors.process'), 'error')
    } finally {
      setIsProcessing(false)
    }
  }, [caseId, load, loadCandidates, runMutation, t])

  const enrichCandidate = React.useCallback(async (candidate: HsCandidate) => {
    try {
      const payload = { hsCode: candidate.hsCode, date: currentLocalDate(), language: 'PL' }
      const result = await runMutation({
        context: {
          resourceKind: 'customs_documents.hs_measure_cache',
          operation: 'custom',
          hsCode: candidate.hsCode,
        },
        mutationPayload: payload,
        operation: async () => {
          const call = await apiCall<EnrichmentResponse>(
            '/api/customs_documents/reference/isztar4/enrich',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            },
            { fallback: null },
          )
          if (!call.ok && !call.result) throw new Error(t('customs_documents.detail.errors.enrich'))
          return call.result ?? {
            hsCode: candidate.hsCode,
            date: payload.date,
            language: payload.language,
            source: 'error' as const,
            error: t('customs_documents.detail.errors.enrich'),
          }
        },
      })
      setEnrichmentByCandidate((current) => ({ ...current, [candidate.id]: result }))
      flash(t('customs_documents.detail.messages.enriched'), result.source === 'error' ? 'error' : 'success')
    } catch (error) {
      flash(error instanceof Error ? error.message : t('customs_documents.detail.errors.enrich'), 'error')
    }
  }, [runMutation, t])

  const selectCandidate = React.useCallback(async (candidate: HsCandidate) => {
    try {
      const decision = await runMutation({
        context: {
          resourceKind: 'customs_documents.line_item',
          operation: 'custom',
          lineItemId: candidate.lineItemId,
        },
        mutationPayload: { candidateId: candidate.id },
        operation: async () => {
          const call = await apiCall<HsDecision>(
            `/api/customs_documents/line-items/${encodeURIComponent(candidate.lineItemId)}/select-hs`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ candidateId: candidate.id }),
            },
            { fallback: null },
          )
          if (!call.ok) throw new Error(t('customs_documents.detail.errors.select'))
          return call.result
        },
      })
      setLineItems((current) => current.map((item) => (
        item.id === candidate.lineItemId
          ? { ...item, status: 'classified', selectedDecision: decision }
          : item
      )))
      flash(t('customs_documents.detail.messages.selected'), 'success')
      await load()
    } catch (error) {
      flash(error instanceof Error ? error.message : t('customs_documents.detail.errors.select'), 'error')
    }
  }, [load, runMutation, t])

  if (isLoading) {
    return (
      <Page>
        <PageBody>
          <LoadingMessage label={t('customs_documents.detail.loading')} />
        </PageBody>
      </Page>
    )
  }

  if (notFound || !customsCase) {
    return (
      <Page>
        <PageBody>
          <ErrorMessage
            label={t('customs_documents.detail.errors.notFound')}
            action={<Button asChild type="button" variant="outline"><Link href="/backend/customs-documents">{t('customs_documents.detail.actions.back')}</Link></Button>}
          />
        </PageBody>
      </Page>
    )
  }

  return (
    <Page>
      <PageBody>
        <div className="space-y-4">
          {error ? <ErrorMessage label={error} /> : null}

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-2">
                  <CardTitle>{customsCase.reference}</CardTitle>
                  <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <Badge variant="outline">{t(`customs_documents.status.${customsCase.status}`)}</Badge>
                    <span>{t('customs_documents.detail.confidence')}: {formatMaybe(customsCase.finalConfidence, t('customs_documents.common.empty'))}</span>
                  </div>
                </div>
                <Button type="button" onClick={() => { void processCase() }} disabled={isProcessing || documents.length === 0}>
                  <Play className="h-4 w-4" />
                  {isProcessing ? t('customs_documents.detail.actions.processing') : t('customs_documents.detail.actions.process')}
                </Button>
              </div>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('customs_documents.detail.upload.title')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                {DOCUMENT_KINDS.map((kind) => (
                  <div key={kind} className="space-y-2 rounded-lg border p-3">
                    <Label htmlFor={`customs-upload-${kind}`}>{t(`customs_documents.documentKind.${kind}`)}</Label>
                    <input
                      id={`customs-upload-${kind}`}
                      type="file"
                      accept=".pdf,application/pdf"
                      className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-2 file:text-sm file:font-medium"
                      onChange={(event) => setFiles((current) => ({ ...current, [kind]: event.target.files?.[0] ?? null }))}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-4">
                <Button type="button" onClick={() => { void uploadAndAttach() }} disabled={isUploading}>
                  <UploadCloud className="h-4 w-4" />
                  {isUploading ? t('customs_documents.detail.actions.uploading') : t('customs_documents.detail.actions.uploadAndAttach')}
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{t('customs_documents.detail.documents.title')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {documents.length === 0 ? <p className="text-sm text-muted-foreground">{t('customs_documents.detail.documents.empty')}</p> : null}
                {documents.map((document) => (
                  <div key={document.id} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-medium">{formatMaybe(document.fileName, document.attachmentId)}</div>
                        <div className="text-xs text-muted-foreground">{t(`customs_documents.documentKind.${document.kind}`)} · {t(`customs_documents.documentStatus.${document.status}`)}</div>
                      </div>
                      <Badge variant={document.hasContent ? 'default' : 'outline'}>
                        {document.hasContent ? t('customs_documents.detail.documents.hasContent') : t('customs_documents.detail.documents.needsReview')}
                      </Badge>
                    </div>
                    {document.contentPreview ? <p className="mt-2 line-clamp-3 text-xs text-muted-foreground">{document.contentPreview}</p> : null}
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('customs_documents.detail.consistency.title')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {checks.length === 0 ? <p className="text-sm text-muted-foreground">{t('customs_documents.detail.consistency.empty')}</p> : null}
                {checks.map((check) => (
                  <div key={check.id} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium">{check.field}</div>
                      <Badge variant={check.status === 'pass' ? 'default' : 'outline'}>{t(`customs_documents.consistency.${check.status}`)}</Badge>
                    </div>
                    <div className="mt-2 grid gap-2 text-sm md:grid-cols-2">
                      <div><span className="text-muted-foreground">{check.sourceA}: </span>{formatMaybe(check.valueA, t('customs_documents.common.empty'))}</div>
                      <div><span className="text-muted-foreground">{check.sourceB}: </span>{formatMaybe(check.valueB, t('customs_documents.common.empty'))}</div>
                    </div>
                    {check.message ? <p className="mt-2 text-xs text-muted-foreground">{check.message}</p> : null}
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t('customs_documents.detail.candidates.title')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {lineItems.length === 0 ? <p className="text-sm text-muted-foreground">{t('customs_documents.detail.candidates.empty')}</p> : null}
              {lineItems.map((lineItem) => (
                <div key={lineItem.id} className="rounded-xl border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 font-medium">
                        <FileText className="h-4 w-4" />
                        {lineItem.description}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {t('customs_documents.detail.candidates.quantity')}: {formatMaybe(lineItem.quantity, t('customs_documents.common.empty'))}
                        {' · '}
                        {t('customs_documents.detail.candidates.grossWeight')}: {formatMaybe(lineItem.grossWeightKg, t('customs_documents.common.empty'))}
                        {' · '}
                        {t('customs_documents.detail.candidates.invoiceHs')}: {formatMaybe(lineItem.invoiceHsCode, t('customs_documents.common.empty'))}
                      </div>
                    </div>
                    <Badge variant={lineItem.status === 'classified' ? 'default' : 'outline'}>
                      {t(`customs_documents.lineItemStatus.${lineItem.status}`)}
                    </Badge>
                  </div>

                  <Separator className="my-4" />

                  {lineItem.selectedDecision ? (
                    <div data-testid="customs-selected-hs-decision" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950">
                      <div className="flex flex-wrap items-center gap-2 font-medium">
                        <CheckCircle2 className="h-4 w-4" />
                        {t('customs_documents.detail.selectedHs.title')}
                        <span className="font-mono">{lineItem.selectedDecision.selectedHsCode}</span>
                        <Badge variant="outline">{t(`customs_documents.confidenceBand.${lineItem.selectedDecision.confidenceBand}`)}</Badge>
                      </div>
                      {lineItem.selectedDecision.selectedDescription ? (
                        <p className="mt-1 text-xs text-emerald-800">{lineItem.selectedDecision.selectedDescription}</p>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="space-y-3">
                    {(candidatesByLineItem[lineItem.id] ?? []).map((candidate) => {
                      const enrichment = enrichmentByCandidate[candidate.id]
                      return (
                        <div key={candidate.id} className="rounded-lg border bg-muted/20 p-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-mono font-semibold">{candidate.hsCode}</span>
                                <Badge variant="outline">{t('customs_documents.detail.candidates.score')}: {candidate.score}</Badge>
                                {enrichment ? <Badge variant={enrichment.source === 'live' ? 'default' : 'outline'}>{t(`customs_documents.enrichment.${enrichment.source}`)}</Badge> : null}
                              </div>
                              <p className="text-sm">{candidate.description}</p>
                              <p className="text-xs text-muted-foreground">{candidate.explanation}</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button type="button" variant="outline" onClick={() => { void enrichCandidate(candidate) }}>
                                <RefreshCcw className="h-4 w-4" />
                                {t('customs_documents.detail.actions.enrich')}
                              </Button>
                              <Button type="button" onClick={() => { void selectCandidate(candidate) }} disabled={lineItem.status === 'classified'}>
                                {lineItem.status === 'classified' ? <CheckCircle2 className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                                {lineItem.status === 'classified'
                                  ? t('customs_documents.detail.actions.selectedHs')
                                  : t('customs_documents.detail.actions.selectHs')}
                              </Button>
                            </div>
                          </div>
                          {enrichment ? (
                            <div className="mt-3 rounded-md bg-background p-3 text-xs text-muted-foreground">
                              <div>{t('customs_documents.detail.enrichment.measureCount')}: {enrichment.summary?.measureCount ?? 0}</div>
                              <div>{t('customs_documents.detail.enrichment.taxCount')}: {enrichment.summary?.taxCount ?? 0}</div>
                              {enrichment.summary?.dutyExpressions?.length ? (
                                <div>{t('customs_documents.detail.enrichment.duties')}: {enrichment.summary.dutyExpressions.slice(0, 4).join('; ')}</div>
                              ) : null}
                              {enrichment.error ? <div className="text-destructive">{enrichment.error}</div> : null}
                            </div>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </PageBody>
    </Page>
  )
}
