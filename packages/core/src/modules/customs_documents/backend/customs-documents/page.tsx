"use client"

import * as React from 'react'
import Link from 'next/link'
import type { ColumnDef } from '@tanstack/react-table'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { RowActions } from '@open-mercato/ui/backend/RowActions'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { Button } from '@open-mercato/ui/primitives/button'
import { Card, CardContent, CardHeader, CardTitle } from '@open-mercato/ui/primitives/card'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Separator } from '@open-mercato/ui/primitives/separator'
import { Plus, UploadCloud } from 'lucide-react'
import {
  CUSTOMS_BATCH_DOCUMENT_KINDS,
  groupCustomsDocumentFiles,
  type CustomsBatchDocumentGroup,
  type CustomsBatchDocumentKind,
} from '../../lib/batchDocuments'

type DocumentKind = CustomsBatchDocumentKind

type CustomsCaseRow = {
  id: string
  reference: string
  status: 'uploaded' | 'processing' | 'review_required' | 'classified' | 'approved' | 'failed'
  sourceCountry?: string | null
  destinationCountry?: string | null
  currency?: string | null
  finalConfidence?: string | null
  createdAt: string
  updatedAt: string
}

type CasesResponse = {
  items: CustomsCaseRow[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

type CreateCaseResponse = {
  id: string
}

type AttachmentUploadResponse = {
  ok: true
  item: {
    id: string
    fileName: string
  }
}

const ENTITY_ID = 'customs_documents:customs_case'
const FOLDER_INPUT_PROPS = { webkitdirectory: '' }

function formatDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function formatBatchReference(batchKey: string, batchRunId: number): string {
  return `BATCH-${batchKey.toUpperCase()}-${batchRunId}`
}

export default function CustomsDocumentsPage() {
  const t = useT()
  const scopeVersion = useOrganizationScopeVersion()
  const { runMutation } = useGuardedMutation<Record<string, unknown>>({
    contextId: 'customs_documents.cases',
  })
  const [rows, setRows] = React.useState<CustomsCaseRow[]>([])
  const [page, setPage] = React.useState(1)
  const [total, setTotal] = React.useState(0)
  const [totalPages, setTotalPages] = React.useState(1)
  const [search, setSearch] = React.useState('')
  const [reference, setReference] = React.useState('')
  const [isLoading, setIsLoading] = React.useState(true)
  const [isCreating, setIsCreating] = React.useState(false)
  const [isBatchProcessing, setIsBatchProcessing] = React.useState(false)
  const [batchGroups, setBatchGroups] = React.useState<Array<CustomsBatchDocumentGroup<File>>>([])
  const [reloadToken, setReloadToken] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    async function load() {
      setIsLoading(true)
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('pageSize', '20')
      if (search) params.set('search', search)
      const fallback: CasesResponse = { items: [], page, pageSize: 20, total: 0, totalPages: 1 }
      const call = await apiCall<CasesResponse>(
        `/api/customs_documents/cases?${params.toString()}`,
        undefined,
        { fallback },
      )
      if (!call.ok) {
        flash(t('customs_documents.list.errors.load'), 'error')
        if (!cancelled) setIsLoading(false)
        return
      }
      const payload = call.result ?? fallback
      if (!cancelled) {
        setRows(Array.isArray(payload.items) ? payload.items : [])
        setTotal(payload.total || 0)
        setTotalPages(payload.totalPages || 1)
        setIsLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [page, reloadToken, scopeVersion, search, t])

  const columns = React.useMemo<ColumnDef<CustomsCaseRow>[]>(() => [
    {
      accessorKey: 'reference',
      header: t('customs_documents.list.columns.reference'),
      cell: ({ row }) => (
        <div className="space-y-1">
          <Link href={`/backend/customs-documents/${row.original.id}`} className="font-medium underline-offset-4 hover:underline">
            {row.original.reference}
          </Link>
          <div className="text-xs text-muted-foreground">{row.original.id}</div>
        </div>
      ),
      meta: { truncate: true, maxWidth: 280 },
    },
    {
      accessorKey: 'status',
      header: t('customs_documents.list.columns.status'),
      cell: ({ row }) => (
        <Badge variant={row.original.status === 'classified' ? 'default' : 'outline'}>
          {t(`customs_documents.status.${row.original.status}`)}
        </Badge>
      ),
    },
    {
      accessorKey: 'lane',
      header: t('customs_documents.list.columns.lane'),
      cell: ({ row }) => [row.original.sourceCountry, row.original.destinationCountry].filter(Boolean).join(' -> ') || t('customs_documents.common.empty'),
      meta: { truncate: true, maxWidth: 220 },
    },
    {
      accessorKey: 'finalConfidence',
      header: t('customs_documents.list.columns.confidence'),
      cell: ({ row }) => row.original.finalConfidence ?? t('customs_documents.common.empty'),
    },
    {
      accessorKey: 'updatedAt',
      header: t('customs_documents.list.columns.updatedAt'),
      cell: ({ row }) => formatDate(row.original.updatedAt),
    },
  ], [t])

  const createCase = React.useCallback(async () => {
    setIsCreating(true)
    try {
      const payload = reference.trim() ? { reference: reference.trim() } : {}
      const result = await runMutation({
        context: {
          resourceKind: 'customs_documents.case',
          operation: 'create',
        },
        mutationPayload: payload,
        operation: async () => {
          const call = await apiCall<CreateCaseResponse>(
            '/api/customs_documents/cases',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            },
            { fallback: null },
          )
          if (!call.ok || !call.result?.id) {
            throw new Error(t('customs_documents.list.errors.create'))
          }
          return call.result
        },
      })
      setReference('')
      setReloadToken((token) => token + 1)
      flash(t('customs_documents.list.messages.created'), 'success')
      window.location.assign(`/backend/customs-documents/${result.id}`)
    } catch (error) {
      flash(error instanceof Error ? error.message : t('customs_documents.list.errors.create'), 'error')
    } finally {
      setIsCreating(false)
    }
  }, [reference, runMutation, t])

  const selectBatchFolder = React.useCallback((fileList: FileList | null) => {
    const groups = groupCustomsDocumentFiles(Array.from(fileList ?? []).filter((file) => file.name.toLowerCase().endsWith('.pdf')))
    setBatchGroups(groups)
    if (fileList?.length && groups.length === 0) {
      flash(t('customs_documents.detail.errors.batchNoMatches'), 'error')
    }
  }, [t])

  const processBatchFolder = React.useCallback(async () => {
    const completeGroups = batchGroups.filter((group) => group.isComplete)
    if (completeGroups.length === 0) {
      flash(t('customs_documents.list.batch.errors.noCompleteGroups'), 'error')
      return
    }

    setIsBatchProcessing(true)
    try {
      await runMutation({
        context: {
          resourceKind: 'customs_documents.case',
          operation: 'create',
        },
        mutationPayload: {
          groups: completeGroups.map((group) => group.batchKey),
        },
        operation: async () => {
          const batchRunId = Date.now()
          for (const group of completeGroups) {
            const createCall = await apiCall<CreateCaseResponse>(
              '/api/customs_documents/cases',
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reference: formatBatchReference(group.batchKey, batchRunId) }),
              },
              { fallback: null },
            )
            if (!createCall.ok || !createCall.result?.id) {
              throw new Error(t('customs_documents.list.errors.create'))
            }
            const caseId = createCall.result.id
            const documentsToAttach: Array<{ attachmentId: string; kind: DocumentKind }> = []
            for (const kind of CUSTOMS_BATCH_DOCUMENT_KINDS) {
              const file = group.documents[kind]
              if (!file) throw new Error(t('customs_documents.list.batch.errors.noCompleteGroups'))
              const form = new FormData()
              form.set('entityId', ENTITY_ID)
              form.set('recordId', caseId)
              form.set('fieldKey', `${group.batchKey}:${kind}`)
              form.set('file', file)
              const attachmentCall = await apiCall<AttachmentUploadResponse>(
                '/api/attachments',
                { method: 'POST', body: form },
                { fallback: null },
              )
              if (!attachmentCall.ok || !attachmentCall.result?.item?.id) {
                throw new Error(t('customs_documents.detail.errors.upload'))
              }
              documentsToAttach.push({ attachmentId: attachmentCall.result.item.id, kind })
            }

            const attachCall = await apiCall(
              `/api/customs_documents/cases/${encodeURIComponent(caseId)}/documents`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ documents: documentsToAttach }),
              },
              { fallback: null },
            )
            if (!attachCall.ok) throw new Error(t('customs_documents.detail.errors.attach'))

            const processCall = await apiCall(
              `/api/customs_documents/cases/${encodeURIComponent(caseId)}/process`,
              { method: 'POST' },
              { fallback: null },
            )
            if (!processCall.ok) throw new Error(t('customs_documents.detail.errors.process'))
          }
          return { imported: completeGroups.length }
        },
      })
      flash(t('customs_documents.list.batch.messages.processed'), 'success')
      setBatchGroups([])
      setReloadToken((token) => token + 1)
    } catch (error) {
      flash(error instanceof Error ? error.message : t('customs_documents.list.batch.errors.process'), 'error')
    } finally {
      setIsBatchProcessing(false)
    }
  }, [batchGroups, runMutation, t])

  return (
    <Page>
      <PageBody>
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('customs_documents.list.create.title')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                <div className="space-y-2">
                  <Label htmlFor="customs-reference">{t('customs_documents.list.create.reference')}</Label>
                  <Input
                    id="customs-reference"
                    value={reference}
                    onChange={(event) => setReference(event.target.value)}
                    placeholder={t('customs_documents.list.create.referencePlaceholder')}
                  />
                </div>
                <Button type="button" onClick={() => { void createCase() }} disabled={isCreating}>
                  <Plus className="h-4 w-4" />
                  {isCreating ? t('customs_documents.list.create.submitting') : t('customs_documents.list.create.action')}
                </Button>
              </div>
              <Separator className="my-5" />
              <div className="rounded-lg border bg-muted/20 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="font-medium">{t('customs_documents.list.batch.title')}</div>
                    <p className="text-sm text-muted-foreground">{t('customs_documents.list.batch.description')}</p>
                  </div>
                  <Badge variant={batchGroups.some((group) => group.isComplete) ? 'default' : 'outline'}>
                    {t('customs_documents.list.batch.completeGroups')}: {batchGroups.filter((group) => group.isComplete).length}/{batchGroups.length}
                  </Badge>
                </div>
                <div className="mt-3 space-y-2">
                  <Label htmlFor="customs-batch-folder">{t('customs_documents.detail.batch.folderLabel')}</Label>
                  <input
                    id="customs-batch-folder"
                    type="file"
                    accept=".pdf,application/pdf"
                    multiple
                    {...FOLDER_INPUT_PROPS}
                    className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-2 file:text-sm file:font-medium"
                    onChange={(event) => selectBatchFolder(event.target.files)}
                  />
                </div>
                {batchGroups.length ? (
                  <div className="mt-4 space-y-2">
                    {batchGroups.map((group) => (
                      <div key={group.batchKey} className="rounded-md border bg-background p-3 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="font-mono font-medium">{group.batchKey}</div>
                          <Badge variant={group.isComplete ? 'default' : 'outline'}>
                            {group.fileCount}/{CUSTOMS_BATCH_DOCUMENT_KINDS.length}
                          </Badge>
                        </div>
                        <div className="mt-2 grid gap-1 text-xs text-muted-foreground md:grid-cols-3">
                          {CUSTOMS_BATCH_DOCUMENT_KINDS.map((kind) => (
                            <div key={kind}>{t(`customs_documents.documentKind.${kind}`)}: {group.documents[kind]?.name ?? t('customs_documents.common.empty')}</div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
                <div className="mt-4">
                  <Button type="button" onClick={() => { void processBatchFolder() }} disabled={isBatchProcessing || !batchGroups.some((group) => group.isComplete)}>
                    <UploadCloud className="h-4 w-4" />
                    {isBatchProcessing ? t('customs_documents.detail.actions.processing') : t('customs_documents.list.batch.action')}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <DataTable
            title={t('customs_documents.list.title')}
            columns={columns}
            data={rows}
            searchValue={search}
            onSearchChange={(value) => {
              setSearch(value)
              setPage(1)
            }}
            searchPlaceholder={t('customs_documents.list.searchPlaceholder')}
            perspective={{ tableId: 'customs_documents.cases' }}
            rowActions={(row) => (
              <RowActions
                items={[
                  { id: 'open', label: t('customs_documents.list.actions.open'), href: `/backend/customs-documents/${row.id}` },
                ]}
              />
            )}
            pagination={{ page, pageSize: 20, total, totalPages, onPageChange: setPage }}
            isLoading={isLoading}
          />
        </div>
      </PageBody>
    </Page>
  )
}
