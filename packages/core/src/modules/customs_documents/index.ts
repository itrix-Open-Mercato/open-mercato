import type { ModuleInfo } from '@open-mercato/shared/modules/registry'
import './commands'

export const metadata: ModuleInfo = {
  name: 'customs_documents',
  title: 'Customs Documents',
  version: '0.1.0',
  description: 'Customs transport document parsing, consistency checks, and HS decision support.',
  author: 'Open Mercato Team',
  license: 'MIT',
  ejectable: true,
}

export { features } from './acl'
