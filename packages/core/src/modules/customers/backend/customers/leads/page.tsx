"use client"

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { ColumnDef } from '@tanstack/react-table'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { deleteCrud } from '@open-mercato/ui/backend/utils/crud'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { RowActions } from '@open-mercato/ui/backend/RowActions'
import { Button } from '@open-mercato/ui/primitives/button'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { useConfirmDialog } from '@open-mercato/ui/backend/confirm-dialog'

type LeadRow = {
  id: string
  display_name?: string | null
  outcome?: string | null
  pipeline_id?: string | null
  stage_id?: string | null
  primary_email?: string | null
  primary_phone?: string | null
  source?: string | null
  owner_user_id?: string | null
  created_at?: string | null
}

type LeadsResponse = {
  items?: Array<Record<string, unknown>>
  total?: number
  totalPages?: number
}

const PAGE_SIZE = 50

export default function LeadsPage() {
  const t = useT()
  const router = useRouter()
  const orgVersion = useOrganizationScopeVersion()
  const { confirm } = useConfirmDialog()

  const [leads, setLeads] = React.useState<LeadRow[]>([])
  const [total, setTotal] = React.useState(0)
  const [page, setPage] = React.useState(1)
  const [search, setSearch] = React.useState('')
  const [isLoading, setIsLoading] = React.useState(false)

  const fetchLeads = React.useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('pageSize', String(PAGE_SIZE))
      if (search.trim()) params.set('search', search.trim())

      const result = await apiCall<LeadsResponse>(`/api/customers/leads?${params.toString()}`)
      if (result.ok) {
        setLeads((result.result?.items ?? []) as LeadRow[])
        setTotal(result.result?.total ?? 0)
      }
    } finally {
      setIsLoading(false)
    }
  }, [page, search, orgVersion])

  React.useEffect(() => {
    fetchLeads()
  }, [fetchLeads])

  const handleDelete = React.useCallback(
    async (id: string, name: string) => {
      const confirmed = await confirm({
        title: t('customers.leads.delete.confirm.title', 'Delete lead'),
        description: t('customers.leads.delete.confirm.description', `Are you sure you want to delete "${name}"?`),
        confirmLabel: t('common.delete', 'Delete'),
        variant: 'destructive',
      })
      if (!confirmed) return
      try {
        await deleteCrud('customers/leads', id, {
          errorMessage: t('customers.leads.delete.error', 'Failed to delete lead.'),
        })
        flash(t('customers.leads.delete.success', 'Lead deleted.'), 'success')
        fetchLeads()
      } catch {
        // error flashed by deleteCrud
      }
    },
    [confirm, fetchLeads, t],
  )

  const columns: ColumnDef<LeadRow>[] = React.useMemo(
    () => [
      {
        accessorKey: 'display_name',
        header: t('customers.leads.list.column.name', 'Name'),
        cell: ({ row }) => (
          <Link href={`/backend/customers/leads/${row.original.id}`} className="font-medium hover:underline">
            {row.original.display_name ?? '—'}
          </Link>
        ),
      },
      {
        accessorKey: 'outcome',
        header: t('customers.leads.list.column.outcome', 'Outcome'),
        cell: ({ row }) => <span className="capitalize">{row.original.outcome ?? 'open'}</span>,
      },
      {
        accessorKey: 'primary_email',
        header: t('customers.leads.list.column.email', 'Email'),
        cell: ({ row }) => row.original.primary_email ?? '—',
      },
      {
        accessorKey: 'primary_phone',
        header: t('customers.leads.list.column.phone', 'Phone'),
        cell: ({ row }) => row.original.primary_phone ?? '—',
      },
      {
        accessorKey: 'source',
        header: t('customers.leads.list.column.source', 'Source'),
        cell: ({ row }) => row.original.source ?? '—',
      },
      {
        accessorKey: 'created_at',
        header: t('customers.leads.list.column.createdAt', 'Created'),
        cell: ({ row }) => {
          const raw = row.original.created_at
          if (!raw) return '—'
          try {
            return new Date(raw).toLocaleDateString()
          } catch {
            return raw
          }
        },
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <RowActions
            id={`lead-${row.original.id}`}
            items={[
              {
                label: t('common.edit', 'Edit'),
                onClick: () => router.push(`/backend/customers/leads/${row.original.id}`),
              },
              {
                label: t('common.delete', 'Delete'),
                variant: 'destructive' as const,
                onClick: () => handleDelete(row.original.id, row.original.display_name ?? row.original.id),
              },
            ]}
          />
        ),
      },
    ],
    [handleDelete, router, t],
  )

  return (
    <Page>
      <PageBody>
        <DataTable
          title={t('customers.leads.list.title', 'Leads')}
          columns={columns}
          data={leads}
          total={total}
          page={page}
          pageSize={PAGE_SIZE}
          isLoading={isLoading}
          onPageChange={setPage}
          searchValue={search}
          onSearchChange={(value) => { setSearch(value); setPage(1) }}
          actions={
            <Button asChild size="sm">
              <Link href="/backend/customers/leads/create">
                {t('customers.leads.list.create', 'New lead')}
              </Link>
            </Button>
          }
        />
      </PageBody>
    </Page>
  )
}
