import React from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { VendorControlContext, useVendorControlProvider } from './context'
import { ErrorBanner } from './ui'

const tabClass = ({ isActive }) =>
  `px-3.5 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
    isActive ? 'bg-brand-500 text-white shadow-sm' : 'text-slate-600 hover:bg-surface-100'
  }`

export default function VendorControlLayout() {
  const ctx = useVendorControlProvider()
  const { isAdmin, roleLabel, loading } = ctx

  const tabs = [
    { to: '/vendor-control', label: 'Overview', end: true, adminOnly: false },
    { to: '/vendor-control/staff', label: 'Staff Master', adminOnly: true },
    { to: '/vendor-control/assignments', label: 'Assignments', adminOnly: true },
    { to: '/vendor-control/assignments/bulk', label: 'Bulk Assignment', adminOnly: true },
    { to: '/vendor-control/distribution', label: 'Distribution', adminOnly: true },
    { to: '/vendor-control/history', label: 'History', adminOnly: true },
    { to: '/vendor-control/performance', label: 'Performance', adminOnly: true },
    { to: '/vendor-control/vendors', label: isAdmin ? 'All Vendors' : 'My Vendors', adminOnly: false },
    { to: '/vendor-control/tasks', label: isAdmin ? 'All Tasks' : 'My Tasks', adminOnly: false },
    { to: '/vendor-control/followups', label: 'Follow-ups', adminOnly: false },
  ]

  return (
    <div className="space-y-6 pb-4">
      <div className="page-header">
        <div>
          <h2 className="page-title">Vendor Authorization</h2>
          <p className="page-subtitle">
            {loading ? 'Loading…' : roleLabel ? `Signed in as ${roleLabel}` : 'Manage vendor-to-staff assignments and tasks'}
          </p>
        </div>
      </div>

      <div className="card p-2 flex items-center gap-1 flex-wrap">
        {tabs.filter((t) => !t.adminOnly || isAdmin).map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end} className={tabClass}>
            {t.label}
          </NavLink>
        ))}
      </div>

      <ErrorBanner message={ctx.error} />

      <VendorControlContext.Provider value={ctx}>
        <Outlet />
      </VendorControlContext.Provider>
    </div>
  )
}
