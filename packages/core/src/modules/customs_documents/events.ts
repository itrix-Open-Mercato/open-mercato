import { createModuleEvents } from '@open-mercato/shared/modules/events'

const events = [
  { id: 'customs_documents.case.created', label: 'Customs Case Created', entity: 'case', category: 'crud' },
  { id: 'customs_documents.document.uploaded', label: 'Customs Document Uploaded', entity: 'document', category: 'crud' },
  { id: 'customs_documents.document.parsed', label: 'Customs Document Parsed', entity: 'document', category: 'crud' },
  { id: 'customs_documents.case.consistency_checked', label: 'Customs Case Consistency Checked', entity: 'case', category: 'custom' },
  { id: 'customs_documents.line_item.candidates_retrieved', label: 'Customs Line Item Candidates Retrieved', entity: 'line_item', category: 'custom' },
  { id: 'customs_documents.line_item.candidates_enriched', label: 'Customs Line Item Candidates Enriched', entity: 'line_item', category: 'custom' },
  { id: 'customs_documents.line_item.hs_selected', label: 'Customs Line Item HS Selected', entity: 'line_item', category: 'custom' },
] as const

export const eventsConfig = createModuleEvents({
  moduleId: 'customs_documents',
  events,
})

export const emitCustomsDocumentsEvent = eventsConfig.emit
export type CustomsDocumentsEventId = typeof events[number]['id']

export default eventsConfig
