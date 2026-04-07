export const metadata = {
  requireAuth: true,
  requireFeatures: ['customers.leads.view'],
  pageTitle: 'Lead pipeline',
  pageTitleKey: 'customers.leads.pipeline.title',
  pageGroup: 'Customers',
  pageGroupKey: 'customers.nav.group',
  hidden: true,
  breadcrumb: [
    { label: 'Leads', labelKey: 'customers.nav.leads', href: '/backend/customers/leads' },
    { label: 'Lead pipeline', labelKey: 'customers.leads.pipeline.title' },
  ],
}
