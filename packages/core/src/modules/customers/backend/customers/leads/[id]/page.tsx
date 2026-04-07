import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { LeadDetailClient } from '../../../../components/LeadFunnelClient'

export default function CustomerLeadDetailPage({ params }: { params?: { id?: string } }) {
  return (
    <Page>
      <PageBody>
        <LeadDetailClient id={params?.id ?? ''} />
      </PageBody>
    </Page>
  )
}
