import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { LeadFormClient } from '../../../../components/LeadFunnelClient'

export default function CreateCustomerLeadPage() {
  return (
    <Page>
      <PageBody>
        <LeadFormClient mode="create" />
      </PageBody>
    </Page>
  )
}
