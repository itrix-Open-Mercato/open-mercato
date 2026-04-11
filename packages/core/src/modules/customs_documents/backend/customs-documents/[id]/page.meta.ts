export const metadata = {
  requireAuth: true,
  requireFeatures: ['customs_documents.view'],
  pageTitle: 'Customs Case',
  pageTitleKey: 'customs_documents.detail.title',
  pageGroup: 'Operations',
  pageGroupKey: 'customs_documents.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Customs Documents', labelKey: 'customs_documents.nav.cases', href: '/backend/customs-documents' },
  ],
}
