import { buildConsistencyChecks, extractCustomsFields, type CustomsDocumentFacts } from '../extraction'

describe('customs document extraction', () => {
  it('extracts core fields and produces deterministic consistency checks', () => {
    const billOfLading = extractCustomsFields('bill_of_lading', [
      'Bill of Lading No: BL-7788',
      'Shipper: Qingdao Rubber Ltd',
      'Consignee: Mercato Imports LLC',
      'Container No: MSKU1234567',
      'Description of Goods: industrial mining tyres',
      'Gross Weight: 12000 kg',
    ].join('\n'))
    const invoice = extractCustomsFields('commercial_invoice', [
      'Invoice No: INV-7788',
      'Seller: Qingdao Rubber Limited',
      'Buyer: Mercato Imports LLC',
      'Product Description: industrial mining tyres',
      'Quantity: 48 pcs',
      'HS Code: 4011800000',
      'Total: USD 32000',
    ].join('\n'))
    const packingList = extractCustomsFields('packing_list', [
      'Packing List No: PL-7788',
      'Description of Goods: industrial mining tyres',
      'Total Packages: 48 packages',
      'Gross Weight: 12000 kg',
      'Net Weight: 11500 kg',
    ].join('\n'))

    expect(billOfLading.documentNumber).toBe('BL-7788')
    expect(billOfLading.containerNumber).toBe('MSKU1234567')
    expect(invoice.invoiceHsCode).toBe('4011800000')
    expect(invoice.totalAmount).toBe(32000)
    expect(packingList.netWeightKg).toBe(11500)

    const facts: CustomsDocumentFacts[] = [
      { documentId: 'doc-bl', kind: 'bill_of_lading', ...billOfLading },
      { documentId: 'doc-inv', kind: 'commercial_invoice', ...invoice },
      { documentId: 'doc-pl', kind: 'packing_list', ...packingList },
    ]
    const checks = buildConsistencyChecks(facts)

    expect(checks.find((check) => check.field === 'gross_weight_kg')?.status).toBe('pass')
    expect(checks.find((check) => check.field === 'quantity')?.status).toBe('pass')
    expect(checks.find((check) => check.field === 'shipper_or_seller')?.status).toBe('pass')
    expect(checks.find((check) => check.field === 'consignee_or_buyer')?.status).toBe('pass')
  })

  it('marks numeric mismatches as failures', () => {
    const checks = buildConsistencyChecks([
      {
        documentId: 'doc-bl',
        kind: 'bill_of_lading',
        documentNumber: null,
        partyA: null,
        partyB: null,
        containerNumber: null,
        productDescription: null,
        quantity: null,
        grossWeightKg: 12000,
        netWeightKg: null,
        totalAmount: null,
        currency: null,
        invoiceHsCode: null,
      },
      {
        documentId: 'doc-pl',
        kind: 'packing_list',
        documentNumber: null,
        partyA: null,
        partyB: null,
        containerNumber: null,
        productDescription: null,
        quantity: null,
        grossWeightKg: 10000,
        netWeightKg: null,
        totalAmount: null,
        currency: null,
        invoiceHsCode: null,
      },
    ])

    expect(checks.find((check) => check.field === 'gross_weight_kg')?.status).toBe('fail')
  })

  it('extracts table-shaped PDF text from demo transport documents', () => {
    const billOfLading = extractCustomsFields('bill_of_lading', [
      'BILL OF LADING FOR OCEAN TRANSPORT OR MULTIMODAL',
      'B/L No.: 263535317 | SCAC: MAEU',
      'Shipper: Seller Set 2 [Jinan, Shandong, China]',
      'Consignee: Buyer Set 2 18 Jana Dantyszka Street, 02-054 Warsaw, Poland',
      'Container No. / Seal No.',
      'Qty',
      'Description of Goods',
      'Weight (KGS)',
      'MAEU3473196',
      '2 UNITS',
      '1 Container Said to Contain 2 UNITS',
      '17,800.000',
      'SITRAK C7H 4X2 TRACTOR TRUCK',
    ].join('\n'))
    const invoice = extractCustomsFields('commercial_invoice', [
      'COMMERCIAL INVOICE',
      'Seller (Set 2): Seller Set 2 [Jinan, Shandong, China]',
      'INVOICE NO.: YE253201XS-6 DATE: January 21, 2026',
      'Buyer: Buyer Set 2 [Warsaw, Poland]',
      'TOTAL',
      '2 UNITS',
      'SELLER: Seller Set 2',
      'BUYER: Buyer Set 2',
      'USD 95,600.00',
    ].join('\n'))
    const packingList = extractCustomsFields('packing_list', [
      'PACKING LIST',
      'Seller (Set 3): Seller Set 3 [Qingdao, Shandong, China]',
      'DATE: 2026-02-03 INVOICE NO.: UKOWRU23002-Z-18',
      'To Messrs: Buyer Set 3 Ukraine',
      'Qty',
      '(Units)',
      'N.W.',
      '(KGS)',
      'G.W.',
      '(KGS)',
      'TOTAL',
      '1',
      '33,500.00',
      '33,500',
    ].join('\n'))

    expect(billOfLading.documentNumber).toBe('263535317 | SCAC: MAEU')
    expect(billOfLading.quantity).toBe(2)
    expect(billOfLading.grossWeightKg).toBe(17800)
    expect(invoice.documentNumber).toBe('YE253201XS-6 DATE: January 21, 2026')
    expect(invoice.partyA).toBe('Seller Set 2 [Jinan, Shandong, China]')
    expect(invoice.quantity).toBe(2)
    expect(packingList.partyA).toBe('Seller Set 3 [Qingdao, Shandong, China]')
    expect(packingList.quantity).toBe(1)
    expect(packingList.grossWeightKg).toBe(33500)

    const checks = buildConsistencyChecks([
      { documentId: 'doc-bl', kind: 'bill_of_lading', ...billOfLading },
      { documentId: 'doc-inv', kind: 'commercial_invoice', ...invoice },
      { documentId: 'doc-pl', kind: 'packing_list', ...packingList },
    ])

    expect(checks.find((check) => check.field === 'gross_weight_kg')?.status).toBe('fail')
    expect(checks.find((check) => check.field === 'quantity')?.status).toBe('fail')
    expect(checks.find((check) => check.field === 'shipper_or_seller')?.status).toBe('pass')
    expect(checks.find((check) => check.field === 'consignee_or_buyer')?.status).toBe('pass')
  })
})
