import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { LeadBoardClient } from '../../../../components/LeadFunnelClient'

export default function CustomerLeadPipelinePage() {
  return (
    <Page>
      <PageBody>
        <LeadBoardClient />
      </PageBody>
    </Page>
  )
}
