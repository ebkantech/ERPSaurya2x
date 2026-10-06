import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Search, Truck, CheckCircle, Clock, AlertTriangle, Filter, Loader2 } from 'lucide-react'
import api from '../../services/api'

// backend delivery_status: pending / in_transit / partially_received / received / rejected
const statusIcon = {
  pending:            { icon: Clock,        cls: 'text-slate-600 bg-slate-100' },
  in_transit:         { icon: Truck,        cls: 'text-amber-600 bg-amber-50' },
  partially_received: { icon: Clock,        cls: 'text-violet-600 bg-violet-50' },
  received:           { icon: CheckCircle,  cls: 'text-emerald-600 bg-emerald-50' },
  rejected:           { icon: AlertTriangle,cls: 'text-red-600 bg-red-50' },
}
const statusBadge = {
  pending: 'badge-slate', in_transit: 'badge-amber', partially_received: 'badge-violet',
  received: 'badge-green', rejected: 'badge-red',
}
const FILTERS = [['All', 'All'], ['in_transit', 'In transit'], ['partially_received', 'Partial'], ['received', 'Received'], ['pending', 'Pending']]

export default function DeliveryList() {
  const [deliveries, setDeliveries] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')

  useEffect(() => {
    api.get('/deliveries/list/')
      .then(res => setDeliveries(res.data.deliveries || []))
      .catch(() => setErr('Could not load deliveries.'))
      .finally(() => setLoading(false))
  }, [])

  const filtered = deliveries.filter(d => {
    const q = search.toLowerCase()
    const matchQ = (d.reference || '').toLowerCase().includes(q) || (d.vendor || '').toLowerCase().includes(q) || (d.po_number || '').toLowerCase().includes(q)
    return matchQ && (statusFilter === 'All' || d.status === statusFilter)
  })
  const countBy = (s) => s === 'All' ? deliveries.length : deliveries.filter(d => d.status === s).length

  return (
    <div className="space-y-6 pb-4">
      <div className="page-header">
        <div>
          <h2 className="page-title">Deliveries</h2>
          <p className="page-subtitle">{deliveries.length} total · {countBy('in_transit')} in transit</p>
        </div>
      </div>

      {err && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{err}</div>}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {FILTERS.map(([k, label]) => (
          <button key={k} onClick={() => setStatusFilter(k)}
            className={`bg-slate-100 text-slate-700 rounded-xl p-4 text-left transition-all ${statusFilter === k ? 'ring-2 ring-offset-1 ring-slate-400/40 shadow-sm' : ''}`}>
            <p className="text-2xl font-bold">{countBy(k)}</p>
            <p className="text-xs font-semibold mt-0.5">{label}</p>
          </button>
        ))}
      </div>

      <div className="card p-4 flex items-center gap-3">
        <div className="flex items-center bg-surface-50 border border-surface-200 rounded-lg px-3 py-2 gap-2 flex-1 max-w-sm">
          <Search size={14} className="text-slate-400" />
          <input type="text" placeholder="Search reference, PO, vendor…"
            className="bg-transparent text-sm placeholder-slate-400 outline-none flex-1"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <span className="ml-auto text-xs text-slate-400">{filtered.length} records</span>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Status</th><th>Delivery Ref</th><th>PO</th><th>Vendor</th>
                <th>Material</th><th className="text-right">Qty</th><th>Date</th><th>Driver / Vehicle</th><th>Received by</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={9} className="text-center text-slate-400 py-8"><Loader2 size={16} className="animate-spin inline" /> Loading…</td></tr>}
              {!loading && filtered.length === 0 && <tr><td colSpan={9} className="text-center text-slate-400 py-8">No deliveries yet.</td></tr>}
              {filtered.map(d => {
                const si = statusIcon[d.status] || statusIcon.pending
                const Icon = si.icon
                return (
                  <tr key={d.id}>
                    <td><div className={`w-8 h-8 rounded-lg ${si.cls} flex items-center justify-center`} title={d.status_display}><Icon size={15} /></div></td>
                    <td className="font-bold text-brand-600 text-xs">{d.reference}</td>
                    <td>{d.po_number ? <Link to={`/purchase-orders`} className="text-xs text-brand-500 hover:underline font-medium">{d.po_number}</Link> : <span className="text-slate-300">—</span>}</td>
                    <td className="text-slate-700 max-w-[140px] truncate">{d.vendor}</td>
                    <td className="text-xs text-slate-500 max-w-[180px] truncate">{d.material}</td>
                    <td className="text-right text-xs font-semibold">{d.delivered_quantity}</td>
                    <td className="text-xs text-slate-400 whitespace-nowrap">{d.delivery_date}</td>
                    <td className="text-xs text-slate-500">
                      {d.driver ? <><span className="font-medium text-slate-700">{d.driver}</span><br /><span className="text-slate-400">{d.vehicle_number}</span></> : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="text-xs text-slate-500">{d.received_by || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
