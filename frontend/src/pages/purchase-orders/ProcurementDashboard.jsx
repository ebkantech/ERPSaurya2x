import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft, ShoppingCart, Wallet, CreditCard, AlertTriangle, Truck, Clock, PackageX, Loader2,
} from 'lucide-react'
import api from '../../services/api'

const DASHBOARD_URL = '/purchase-orders/dashboard/'

const STATUS_BADGE = {
  draft: 'badge-slate', approved: 'badge-blue', partially_delivered: 'badge-amber',
  fully_delivered: 'badge-green', partially_paid: 'badge-amber', fully_paid: 'badge-green',
  closed: 'badge-slate', cancelled: 'badge-red',
}

const humanize = (s) => (s || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

const fmt = (n) => {
  const v = Number(n)
  if (!v) return '₹0'
  return v >= 10000000 ? `₹${(v / 10000000).toFixed(1)}Cr` : v >= 100000 ? `₹${(v / 100000).toFixed(1)}L` : `₹${v.toLocaleString('en-IN')}`
}

export default function ProcurementDashboard() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    api.get(DASHBOARD_URL)
      .then(res => { if (active) setData(res.data) })
      .catch(() => { if (active) setError('Could not load the procurement dashboard.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  return (
    <div className="space-y-6 pb-4">
      <Link to="/purchase-orders" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors">
        <ArrowLeft size={15} />Back to Purchase Orders
      </Link>

      <div className="page-header">
        <div>
          <h2 className="page-title">Procurement Dashboard</h2>
          <p className="page-subtitle">Overview of purchase orders, deliveries, and vendor payments</p>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-slate-500 py-16 justify-center">
          <Loader2 size={16} className="animate-spin" />Loading dashboard…
        </div>
      )}

      {!loading && error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>
      )}

      {!loading && !error && data && (
        <>
          {/* KPI row 1 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {[
              { label: 'Total POs', value: data.total_pos, icon: ShoppingCart, cls: 'text-brand-600 bg-brand-50' },
              { label: 'Total PO Value', value: fmt(data.total_po_value), icon: Wallet, cls: 'text-blue-600 bg-blue-50' },
              { label: 'Paid', value: fmt(data.total_paid_amount), icon: CreditCard, cls: 'text-emerald-600 bg-emerald-50' },
              { label: 'Outstanding', value: fmt(data.total_outstanding_amount), icon: AlertTriangle, cls: 'text-amber-600 bg-amber-50' },
            ].map(s => {
              const Icon = s.icon
              return (
                <div key={s.label} className="card p-4 flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl ${s.cls} flex items-center justify-center flex-shrink-0`}>
                    <Icon size={16} />
                  </div>
                  <div>
                    <p className="font-bold text-slate-900 text-lg leading-none">{s.value}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{s.label}</p>
                  </div>
                </div>
              )
            })}
          </div>

          {/* KPI row 2 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {[
              { label: 'Pending Deliveries', value: data.pending_deliveries, icon: PackageX, cls: 'text-amber-600 bg-amber-50' },
              { label: 'In-Transit Vehicles', value: data.in_transit_vehicles, icon: Truck, cls: 'text-blue-600 bg-blue-50' },
              { label: 'Delayed Deliveries', value: data.delayed_deliveries, icon: Clock, cls: 'text-red-600 bg-red-50' },
              { label: 'Pending Vendor Payments', value: data.pending_vendor_payments, icon: CreditCard, cls: 'text-violet-600 bg-violet-50' },
            ].map(s => {
              const Icon = s.icon
              return (
                <div key={s.label} className="card p-4 flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl ${s.cls} flex items-center justify-center flex-shrink-0`}>
                    <Icon size={16} />
                  </div>
                  <div>
                    <p className="font-bold text-slate-900 text-lg leading-none">{s.value}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{s.label}</p>
                  </div>
                </div>
              )
            })}
          </div>

          {/* PO Status Breakdown */}
          <div className="card p-5">
            <h3 className="font-semibold text-slate-900 text-sm mb-3">PO Status Breakdown</h3>
            <div className="flex flex-wrap gap-2">
              {data.po_status_rows.length === 0 ? (
                <p className="text-sm text-slate-400">No purchase orders yet.</p>
              ) : data.po_status_rows.map(r => (
                <span key={r.status} className={`badge ${STATUS_BADGE[r.status] || 'badge-slate'} flex items-center gap-1.5`}>
                  {humanize(r.status)}<span className="font-bold">{r.total}</span>
                </span>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* Top Outstanding Vendors */}
            <div className="card overflow-hidden">
              <h3 className="font-semibold text-slate-900 text-sm px-5 py-3 border-b border-surface-100">Top Outstanding Vendors</h3>
              <table className="data-table">
                <thead><tr><th>Vendor</th><th className="text-right">Outstanding</th></tr></thead>
                <tbody>
                  {data.vendor_outstanding.length === 0 ? (
                    <tr><td colSpan={2} className="text-center py-8 text-slate-400">No outstanding balances.</td></tr>
                  ) : data.vendor_outstanding.map(v => (
                    <tr key={v.vendor_tracking_id}>
                      <td>
                        <div className="font-medium text-slate-800">{v.vendor_tracking_name}</div>
                        <div className="text-xs text-slate-400">{v.vendor_tracking_id}</div>
                      </td>
                      <td className="text-right font-semibold text-slate-900">{fmt(v.total_outstanding)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Recent Purchase Orders */}
            <div className="card overflow-hidden">
              <h3 className="font-semibold text-slate-900 text-sm px-5 py-3 border-b border-surface-100">Recent Purchase Orders</h3>
              <table className="data-table">
                <thead><tr><th>PO Number</th><th>Vendor</th><th>Status</th><th className="text-right">Value</th></tr></thead>
                <tbody>
                  {data.recent_pos.length === 0 ? (
                    <tr><td colSpan={4} className="text-center py-8 text-slate-400">No purchase orders yet.</td></tr>
                  ) : data.recent_pos.map(po => (
                    <tr key={po.id}>
                      <td>
                        <Link to={`/purchase-orders/${po.id}`} className="font-bold text-brand-600 hover:text-brand-700 text-xs">{po.po_number}</Link>
                      </td>
                      <td className="text-xs text-slate-600 max-w-[140px] truncate">{po.vendor}</td>
                      <td><span className={`badge ${STATUS_BADGE[po.status] || 'badge-slate'}`}>{humanize(po.status)}</span></td>
                      <td className="text-right font-semibold text-slate-900">{fmt(po.total_po_value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
