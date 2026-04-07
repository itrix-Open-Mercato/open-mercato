import React from 'react'

const leadsIcon = React.createElement(
  'svg',
  { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2 },
  React.createElement('path', { d: 'M3 6h18' }),
  React.createElement('path', { d: 'M6 12h12' }),
  React.createElement('path', { d: 'M10 18h4' })
)

export const metadata = {
  requireAuth: true,
  requireFeatures: ['customers.leads.view'],
  pageTitle: 'Leads',
  pageTitleKey: 'customers.nav.leads',
  pageGroup: 'Customers',
  pageGroupKey: 'customers.nav.group',
  pagePriority: 10,
  pageOrder: 130,
  icon: leadsIcon,
  breadcrumb: [{ label: 'Leads', labelKey: 'customers.nav.leads' }],
}
