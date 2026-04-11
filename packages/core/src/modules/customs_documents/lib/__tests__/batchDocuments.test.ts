import {
  classifyCustomsDocumentFileName,
  groupCustomsDocumentFiles,
  resolveCustomsDocumentBatchKey,
} from '../batchDocuments'

describe('classifyCustomsDocumentFileName', () => {
  it('classifies supported customs document names deterministically', () => {
    expect(classifyCustomsDocumentFileName('Bill_of_Lading_Set_4.pdf')).toBe('bill_of_lading')
    expect(classifyCustomsDocumentFileName('Commercial Invoice 2026-04.pdf')).toBe('commercial_invoice')
    expect(classifyCustomsDocumentFileName('faktura-handlowa.pdf')).toBe('commercial_invoice')
    expect(classifyCustomsDocumentFileName('Packing_List_Set_4.pdf')).toBe('packing_list')
  })

  it('returns null for unsupported names', () => {
    expect(classifyCustomsDocumentFileName('warehouse-photo.pdf')).toBeNull()
  })

  it('extracts stable batch keys from set suffixes', () => {
    expect(resolveCustomsDocumentBatchKey('Bill_of_Lading_Set_4.pdf')).toBe('set_04')
    expect(resolveCustomsDocumentBatchKey('Commercial_Invoice_12.pdf')).toBe('set_12')
    expect(resolveCustomsDocumentBatchKey('Packing_List.pdf')).toBe('set_ungrouped')
  })

  it('groups documents by batch key before linking document kinds', () => {
    const groups = groupCustomsDocumentFiles([
      { name: 'Bill_of_Lading_Set_2.pdf' },
      { name: 'Commercial_Invoice_Set_1.pdf' },
      { name: 'Packing_List_Set_2.pdf' },
      { name: 'Bill_of_Lading_Set_1.pdf' },
      { name: 'Packing_List_Set_1.pdf' },
      { name: 'Commercial_Invoice_Set_2.pdf' },
    ])

    expect(groups).toHaveLength(2)
    expect(groups[0]?.batchKey).toBe('set_01')
    expect(groups[0]?.isComplete).toBe(true)
    expect(groups[0]?.documents.bill_of_lading?.name).toBe('Bill_of_Lading_Set_1.pdf')
    expect(groups[0]?.documents.commercial_invoice?.name).toBe('Commercial_Invoice_Set_1.pdf')
    expect(groups[0]?.documents.packing_list?.name).toBe('Packing_List_Set_1.pdf')
    expect(groups[1]?.batchKey).toBe('set_02')
    expect(groups[1]?.isComplete).toBe(true)
  })
})
