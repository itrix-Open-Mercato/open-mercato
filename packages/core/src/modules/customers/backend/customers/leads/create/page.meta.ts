export const metadata = {
  requireAuth: true,
  requireFeatures: ['customers.leads.manage'],
  pageTitle: 'Create lead',
  pageTitleKey: 'customers.leads.create.title',
  pageGroup: 'Customers',
  pageGroupKey: 'customers.nav.group',
  hidden: true,
  breadcrumb: [
    { label: 'Leads', labelKey: 'customers.nav.leads', href: '/backend/customers/leads' },
    { label: 'Create lead', labelKey: 'customers.leads.create.title' },
  ],
}
