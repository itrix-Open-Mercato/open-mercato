import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { LeadConfigClient } from '../../../../components/LeadFunnelClient'

export default function CustomerLeadConfigPage() {
  return (
    <Page>
      <PageBody>
        <LeadConfigClient />
      </PageBody>
    </Page>
  )
}
