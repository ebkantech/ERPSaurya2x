import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Search, CheckCircle, Clock, AlertTriangle, Download, Loader2 } from 'lucide-react'
import api from '../../services/api'

const num = (v) => Number(v || 0)
const fmt = (v) => { const n = num(v); return '₹' + (n >= 100000 ? (n / 100000).toFixed(1) + 'L' : (n / 1000).toFixed(0) + 'K') }
const badgeFor = (s) => s === 'paid' ? 'badge-green' : s === 'approved' ? 'badge-blue' : s === 'on_hold' ? 'badge-red' : 'badge-amber'

export default function PaymentList() {
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')

  useEffect(() => {
    api.get('/payments/vendor-payments/')
      .then(res => setPayments(res.data.payments || []))
      .catch(() => setErr('Could not load payments.'))
      .finally(() => setLoading(false))
  }, [])

  const filtered = payments.filter(p => {
    const q = search.toLowerCase()
    const matchQ = (p.reference || '').toLowerCase().includes(q) || (p.vendor || '').toLowerCase().includes(q) || (p.po_number || '').toLowerCase().includes(q)
    const matchS = statusFilter === 'All' || p.status === statusFilter
    return matchQ && matchS
  })

  const totalPaid = payments.filter(p => p.status === 'paid').reduce((s, p) => s + num(p.net), 0)
  const totalPending = payments.filter(p => p.status !== 'paid').reduce((s, p) => s + num(p.net), 0)
  const milestoneCount = payments.filter(p => p.is_milestone).length

  return (
    <div className="space-y-6 pb-4">
      <div className="page-header">
        <div>
          <h2 className="page-title">Payments</h2>
          <p className="page-subtitle">All vendor payments, including work-milestone payments posted from billing</p>
        </div>
        <button className="btn-secondary"><Download size={14} />Export</button>
      </div>

      {err && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{err}</div>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: 'Total Paid', value: fmt(totalPaid), icon: CheckCircle, cls: 'text-emerald-600 bg-emerald-50 border-emerald-100' },
          { label: 'Pending / Approved', value: fmt(totalPending), icon: Clock, cls: 'text-amber-600 bg-amber-50 border-amber-100' },
          { label: 'Work-milestone payments', value: milestoneCount, icon: AlertTriangle, cls: 'text-brand-600 bg-brand-50 border-brand-100' },
        ].map(k => {
          const Icon = k.icon
          return (
            <div key={k.label} className={`card p-5 flex items-center gap-4 border ${k.cls}`}>
              <Icon size={24} />
              <div>
                <p className="text-xl font-bold text-slate-900">{k.value}</p>
                <p className="text-xs font-medium mt-0.5 opacity-80">{k.label}</p>
              </div>
            </div>
          )
        })}
      </div>

      <div className="card p-4 flex items-center gap-3 flex-wrap">
        <div className="flex items-center bg-surface-50 border border-surface-200 rounded-lg px-3 py-2 gap-2 flex-1 max-w-sm">
          <Search size={14} className="text-slate-400" />
          <input type="text" placeholder="Search reference, PO, vendor…"
            className="bg-transparent text-sm placeholder-slate-400 outline-none flex-1"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1.5">
          {['All', 'paid', 'approved', 'pending', 'on_hold'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors capitalize ${statusFilter === s ? 'bg-brand-500 text-white shadow-sm' : 'bg-surface-50 text-slate-600 border border-surface-200 hover:bg-surface-100'}`}
            >{s === 'on_hold' ? 'On hold' : s}</button>
          ))}
        </div>
        <span className="ml-auto text-xs text-slate-400">{filtered.length} records</span>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Reference</th><th>PO</th><th>Vendor</th><th>Stage</th>
                <th className="text-right">Gross</th><th className="text-right">TDS</th><th className="text-right">Net Payable</th>
                <th>Status</th><th>Paid / Due</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={9} className="text-center text-slate-400 py-8"><Loader2 size={16} className="animate-spin inline" /> Loading…</td></tr>}
              {!loading && filtered.length === 0 && <tr><td colSpan={9} className="text-center text-slate-400 py-8">No payments yet.</td></tr>}
              {filtered.map(p => (
                <tr key={p.id}>
                  <td className="font-bold text-brand-600 text-xs whitespace-nowrap">
                    {p.reference}{p.is_milestone && <span className="ml-1 badge badge-blue text-[9px]">work</span>}
                  </td>
                  <td>{p.po_number ? <Link to={`/purchase-orders`} className="text-xs text-brand-500 hover:underline font-medium">{p.po_number}</Link> : <span className="text-slate-300">—</span>}</td>
                  <td className="text-slate-700 max-w-[160px] truncate">{p.vendor}</td>
                  <td className="text-xs text-slate-500">{p.stage || '—'}</td>
                  <td className="text-right font-semibold text-slate-900">{fmt(p.amount)}</td>
                  <td className="text-right text-xs text-red-600">{num(p.tds) ? '-' + fmt(p.tds) : '—'}</td>
                  <td className="text-right font-bold text-slate-900">{fmt(p.net)}</td>
                  <td><span className={`badge ${badgeFor(p.status)}`}>{p.status_display}</span></td>
                  <td className="text-xs text-slate-400 whitespace-nowrap">{p.paid_date || p.due_date || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
