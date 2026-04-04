"use client"

import * as React from 'react'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import type { ColumnDef } from '@tanstack/react-table'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'

type PipelineRow = { id: string; name: string; code: string; isDefault: boolean; isActive: boolean }
type StageRow = { id: string; pipelineId: string; name: string; code: string; position: number; kind: string; isActive: boolean }
type LostReasonRow = { id: string; name: string; code: string; isActive: boolean; sortOrder: number }

export const metadata = {
  requireAuth: true,
  requireFeatures: ['customers.lead-pipelines.view'],
  pageTitle: 'Lead Pipelines',
  pageTitleKey: 'customers.nav.leadPipelines',
  breadcrumb: [{ label: 'Lead Pipelines', labelKey: 'customers.nav.leadPipelines' }],
}

export default function LeadPipelinesConfigPage() {
  const t = useT()
  const orgVersion = useOrganizationScopeVersion()

  const [pipelines, setPipelines] = React.useState<PipelineRow[]>([])
  const [stages, setStages] = React.useState<StageRow[]>([])
  const [lostReasons, setLostReasons] = React.useState<LostReasonRow[]>([])
  const [isLoading, setIsLoading] = React.useState(false)

  React.useEffect(() => {
    setIsLoading(true)
    Promise.all([
      apiCall<{ items?: PipelineRow[] }>('/api/customers/lead-pipelines'),
      apiCall<{ items?: StageRow[] }>('/api/customers/lead-pipeline-stages'),
      apiCall<{ items?: LostReasonRow[] }>('/api/customers/lead-lost-reasons'),
    ]).then(([pRes, sRes, lRes]) => {
      if (pRes.ok) setPipelines(pRes.result?.items ?? [])
      if (sRes.ok) setStages(sRes.result?.items ?? [])
      if (lRes.ok) setLostReasons(lRes.result?.items ?? [])
    }).finally(() => setIsLoading(false))
  }, [orgVersion])

  const pipelineColumns: ColumnDef<PipelineRow>[] = [
    { accessorKey: 'name', header: t('customers.leadPipelines.column.name', 'Name') },
    { accessorKey: 'code', header: t('customers.leadPipelines.column.code', 'Code') },
    { accessorKey: 'isDefault', header: t('customers.leadPipelines.column.isDefault', 'Default'), cell: ({ row }) => row.original.isDefault ? '✓' : '' },
    { accessorKey: 'isActive', header: t('customers.leadPipelines.column.isActive', 'Active'), cell: ({ row }) => row.original.isActive ? '✓' : '' },
  ]

  const stageColumns: ColumnDef<StageRow>[] = [
    { accessorKey: 'name', header: t('customers.leadPipelines.stage.column.name', 'Name') },
    { accessorKey: 'code', header: t('customers.leadPipelines.stage.column.code', 'Code') },
    { accessorKey: 'kind', header: t('customers.leadPipelines.stage.column.kind', 'Kind') },
    { accessorKey: 'position', header: t('customers.leadPipelines.stage.column.position', 'Position') },
    {
      accessorKey: 'pipelineId',
      header: t('customers.leadPipelines.stage.column.pipeline', 'Pipeline'),
      cell: ({ row }) => pipelines.find((p) => p.id === row.original.pipelineId)?.name ?? row.original.pipelineId,
    },
  ]

  const lostReasonColumns: ColumnDef<LostReasonRow>[] = [
    { accessorKey: 'name', header: t('customers.leadPipelines.lostReason.column.name', 'Name') },
    { accessorKey: 'code', header: t('customers.leadPipelines.lostReason.column.code', 'Code') },
    { accessorKey: 'sortOrder', header: t('customers.leadPipelines.lostReason.column.order', 'Order') },
    { accessorKey: 'isActive', header: t('customers.leadPipelines.lostReason.column.active', 'Active'), cell: ({ row }) => row.original.isActive ? '✓' : '' },
  ]

  return (
    <Page>
      <PageBody>
        <div className="space-y-8">
          <DataTable
            title={t('customers.leadPipelines.title', 'Lead Pipelines')}
            columns={pipelineColumns}
            data={pipelines}
            total={pipelines.length}
            isLoading={isLoading}
          />
          <DataTable
            title={t('customers.leadPipelines.stages.title', 'Pipeline Stages')}
            columns={stageColumns}
            data={stages}
            total={stages.length}
            isLoading={isLoading}
          />
          <DataTable
            title={t('customers.leadPipelines.lostReasons.title', 'Lost Reasons')}
            columns={lostReasonColumns}
            data={lostReasons}
            total={lostReasons.length}
            isLoading={isLoading}
          />
        </div>
      </PageBody>
    </Page>
  )
}
