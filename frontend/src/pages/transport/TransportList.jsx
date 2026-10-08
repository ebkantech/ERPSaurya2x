import React, { useState, useEffect } from 'react'
import { Search, MapPin, ArrowLeftRight, Plus, Loader2 } from 'lucide-react'
import api from '../../services/api'

const money = (v) => '₹' + Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })
const statusBadge = { dispatched: 'badge-blue', in_transit: 'badge-amber', reached_site: 'badge-green', unloaded: 'badge-slate', delayed: 'badge-red' }

export default function TransportList() {
  const [vehicles, setVehicles] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    api.get('/transport/list/')
      .then(res => setVehicles(res.data.vehicles || []))
      .catch(() => setErr('Could not load transport.'))
      .finally(() => setLoading(false))
  }, [])

  const filtered = vehicles.filter(t => {
    const q = search.toLowerCase()
    return (t.vehicle || '').toLowerCase().includes(q) || (t.driver || '').toLowerCase().includes(q) || (t.delivery || '').toLowerCase().includes(q)
  })

  return (
    <div className="space-y-6 pb-4">
      <div className="page-header">
        <div>
          <h2 className="page-title">Transport Tracking</h2>
          <p className="page-subtitle">{vehicles.length} vehicle movements</p>
        </div>
        <button className="btn-primary"><Plus size={14} />Add Movement</button>
      </div>

      {err && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{err}</div>}

      <div className="card p-4 flex items-center gap-3">
        <div className="flex items-center bg-surface-50 border border-surface-200 rounded-lg px-3 py-2 gap-2 flex-1 max-w-sm">
          <Search size={14} className="text-slate-400" />
          <input type="text" placeholder="Search vehicle, driver, delivery…"
            className="bg-transparent text-sm placeholder-slate-400 outline-none flex-1"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <span className="ml-auto text-xs text-slate-400">{filtered.length} records</span>
      </div>

      <div className="card overflow-hidden">
        <table className="data-table">
          <thead><tr><th>Vehicle</th><th>Driver</th><th>Transporter</th><th>Route</th><th>Delivery</th><th>ETA</th><th className="text-right">Freight</th><th>Status</th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={8} className="text-center text-slate-400 py-8"><Loader2 size={16} className="animate-spin inline" /> Loading…</td></tr>}
            {!loading && filtered.length === 0 && <tr><td colSpan={8} className="text-center text-slate-400 py-8">No vehicle movements.</td></tr>}
            {filtered.map(t => (
              <tr key={t.id}>
                <td className="font-mono text-xs font-semibold text-slate-800">{t.vehicle}{t.gps_link && <a href={t.gps_link} target="_blank" rel="noreferrer" className="text-brand-500 ml-1">📍</a>}</td>
                <td className="text-slate-700">{t.driver || '—'}</td>
                <td className="text-xs text-slate-500">{t.transporter || '—'}</td>
                <td className="text-xs text-slate-500">
                  <div className="flex items-center gap-1">
                    <MapPin size={10} className="text-slate-400" />{t.from || '—'}
                    <ArrowLeftRight size={10} className="text-slate-300" />
                    <MapPin size={10} className="text-emerald-500" />{t.to || '—'}
                  </div>
                </td>
                <td className="text-xs text-brand-500 font-semibold">{t.delivery || '—'}</td>
                <td className="text-xs text-slate-400">{t.eta || '—'}</td>
                <td className="text-right font-semibold text-slate-900 text-xs">{money(t.freight)}</td>
                <td><span className={`badge ${statusBadge[t.status] || 'badge-slate'}`}>{t.status_display}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
