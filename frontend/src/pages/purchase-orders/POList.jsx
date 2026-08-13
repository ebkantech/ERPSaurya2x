import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, Plus, Download, LayoutDashboard, Layers, Loader2 } from 'lucide-react'
import api from '../../services/api'

const PO_LIST_URL = '/purchase-orders/'

const STATUS_BADGE = {
  draft: 'badge-slate',
  approved: 'badge-blue',
  partially_delivered: 'badge-amber',
  fully_delivered: 'badge-green',
  partially_paid: 'badge-amber',
  fully_paid: 'badge-green',
  closed: 'badge-slate',
  cancelled: 'badge-red',
}

const fmt = (v) => {
  const n = Number(v)
  if (!n) return '₹0'
  return n >= 10000000 ? `₹${(n / 10000000).toFixed(1)}Cr` : n >= 100000 ? `₹${(n / 100000).toFixed(1)}L` : `₹${n.toLocaleString('en-IN')}`
}

export default function POList() {
  const [pos, setPos] = useState([])
  const [statusChoices, setStatusChoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const fetchPOs = (q, status) => {
    setLoading(true)
    setError('')
    const params = {}
    if (q) params.q = q
    if (status) params.status = status
    api.get(PO_LIST_URL, { params })
      .then(res => {
        setPos(res.data.results || [])
        setStatusChoices(res.data.status_choices || [])
      })
      .catch(() => setError('Could not load purchase orders.'))
      .finally(() => setLoading(false))
  }

  // Initial load, then debounced refetch whenever search/status change.
  useEffect(() => {
    const t = setTimeout(() => fetchPOs(search, statusFilter), search || statusFilter ? 350 : 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter])

  const labelFor = (value) => (statusChoices.find(([v]) => v === value) || [value, value])[1]

  const totalValue = pos.reduce((s, p) => s + Number(p.total_po_value || 0), 0)

  return (
    <div className="space-y-6 pb-4">
      {/* Header */}
      <div className="page-header">
        <div>
          <h2 className="page-title">Purchase Orders</h2>
          <p className="page-subtitle">Total value: <span className="font-semibold text-slate-700">{fmt(totalValue)}</span></p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/purchase-orders/dashboard" className="btn-secondary"><LayoutDashboard size={14} />Dashboard</Link>
          <Link to="/purchase-orders/bulk-generate" className="btn-secondary"><Layers size={14} />Bulk Generate</Link>
          <button className="btn-secondary"><Download size={14} />Export</button>
          <Link to="/purchase-orders/new" className="btn-primary"><Plus size={14} />New PO</Link>
        </div>
      </div>

      {/* Status filter chips */}
      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setStatusFilter('')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${statusFilter === '' ? 'bg-brand-500 text-white shadow-sm' : 'bg-surface-50 text-slate-600 border border-surface-200 hover:bg-surface-100'}`}
        >
          All
        </button>
        {statusChoices.map(([value, label]) => (
          <button key={value} onClick={() => setStatusFilter(value)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${statusFilter === value ? 'bg-brand-500 text-white shadow-sm' : 'bg-surface-50 text-slate-600 border border-surface-200 hover:bg-surface-100'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="card p-4 flex items-center gap-3 flex-wrap">
        <div className="flex items-center bg-surface-50 border border-surface-200 rounded-lg px-3 py-2 gap-2 flex-1 min-w-[200px] max-w-sm">
          <Search size={14} className="text-slate-400" />
          <input type="text" placeholder="Search PO, vendor, project…"
            className="bg-transparent text-sm placeholder-slate-400 outline-none flex-1"
            value={search} onChange={e => setSearch(e.target.value)}
          />
        </div>
        <span className="ml-auto text-xs text-slate-400">{loading ? 'Loading…' : `${pos.length} records`}</span>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>
      )}

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>PO Number</th>
                <th>Vendor</th>
                <th>Project</th>
                <th className="text-center">Items</th>
                <th>Value</th>
                <th>Outstanding</th>
                <th>Status</th>
                <th>Delivery</th>
                <th>Payment</th>
                <th>Expected Delivery</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} className="text-center py-16 text-slate-400">
                  <Loader2 size={18} className="animate-spin inline-block mr-2" />Loading purchase orders…
                </td></tr>
              ) : pos.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-16 text-slate-400">No purchase orders match your search.</td></tr>
              ) : pos.map(po => (
                <tr key={po.id}>
                  <td>
                    <Link to={`/purchase-orders/${po.id}`} className="font-bold text-brand-600 hover:text-brand-700 text-xs">
                      {po.po_number}
                    </Link>
                  </td>
                  <td className="font-medium text-slate-800 max-w-[160px] truncate">{po.vendor}</td>
                  <td className="text-xs text-slate-500 max-w-[140px] truncate">{po.project_site_name}</td>
                  <td className="text-center text-xs text-slate-600">{po.item_count}</td>
                  <td className="font-bold text-slate-900">{fmt(po.total_po_value)}</td>
                  <td className="text-xs text-slate-600">{fmt(po.outstanding_amount)}</td>
                  <td><span className={`badge ${STATUS_BADGE[po.status] || 'badge-slate'}`}>{labelFor(po.status)}</span></td>
                  <td className="text-xs text-slate-500 max-w-[140px] truncate">{po.delivery_status_summary || '—'}</td>
                  <td className="text-xs text-slate-500 max-w-[140px] truncate">{po.payment_status_summary || '—'}</td>
                  <td className="text-xs text-slate-400 whitespace-nowrap">{po.expected_delivery_date || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
