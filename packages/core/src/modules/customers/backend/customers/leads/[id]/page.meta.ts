export const metadata = {
  requireAuth: true,
  requireFeatures: ['customers.leads.view'],
  pageTitle: 'Lead details',
  pageTitleKey: 'customers.leads.detail.title',
  pageGroup: 'Customers',
  pageGroupKey: 'customers.nav.group',
  hidden: true,
  breadcrumb: [
    { label: 'Leads', labelKey: 'customers.nav.leads', href: '/backend/customers/leads' },
    { label: 'Lead details', labelKey: 'customers.leads.detail.title' },
  ],
}
