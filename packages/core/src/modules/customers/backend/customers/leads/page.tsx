import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { LeadListClient } from '../../../components/LeadFunnelClient'

export default function CustomersLeadsPage() {
  return (
    <Page>
      <PageBody>
        <LeadListClient />
      </PageBody>
    </Page>
  )
}
