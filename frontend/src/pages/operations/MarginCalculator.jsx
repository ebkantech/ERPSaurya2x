import React, { useState, useEffect } from 'react'
import {
  IndianRupee, Loader2, FolderKanban, TrendingUp, TrendingDown, Percent, Save, Zap,
} from 'lucide-react'
import api from '../../services/api'

const money = (v) => '₹' + Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })

function Stat({ icon: Icon, label, value, tone = 'text-slate-900', sub }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-slate-400 text-xs font-medium mb-1"><Icon size={13} />{label}</div>
      <p className={`text-2xl font-bold ${tone}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}

export default function MarginCalculator() {
  const [projects, setProjects] = useState([])
  const [projectId, setProjectId] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [rate, setRate] = useState('')
  const [overhead, setOverhead] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get('/projects/').then(r => setProjects(r.data.projects || [])).catch(() => {})
  }, [])

  const load = () => {
    if (!projectId) return
    setLoading(true); setErr('')
    api.get(`/solar/projects/${projectId}/margin/`)
      .then(r => { setData(r.data); setRate(r.data.client_rate_per_wp); setOverhead(r.data.overhead_percent) })
      .catch(() => setErr('Could not load margin.'))
      .finally(() => setLoading(false))
  }
  useEffect(() => { if (projectId) load(); else setData(null) }, [projectId])

  const save = async () => {
    setSaving(true); setErr('')
    try {
      const r = await api.post(`/solar/projects/${projectId}/margin/`, { client_rate_per_wp: rate, overhead_percent: overhead })
      setData(r.data)
    } catch { setErr('Could not save.') } finally { setSaving(false) }
  }

  const marginPos = data && Number(data.margin) >= 0

  return (
    <div className="space-y-6 pb-4">
      <div>
        <h2 className="page-title">Margin &amp; Profitability</h2>
        <p className="page-subtitle">Client inflow (₹/Wp) vs. subcontractor outflow and overhead — per project, with a site breakdown.</p>
      </div>

      <div className="card p-4 flex items-center gap-3">
        <FolderKanban size={16} className="text-slate-400" />
        <select value={projectId} onChange={e => setProjectId(e.target.value)} className="form-input max-w-sm">
          <option value="">Select a project…</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.project_code ? `${p.project_code} — ` : ''}{p.project_name}</option>)}
        </select>
        {loading && <Loader2 size={16} className="animate-spin text-brand-500" />}
      </div>

      {err && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{err}</div>}

      {projectId && !loading && data && (
        <>
          {/* inputs */}
          <div className="card p-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div><label className="form-label">Client rate (₹/Wp inflow)</label>
                <input type="number" step="0.01" className="form-input" value={rate} onChange={e => setRate(e.target.value)} /></div>
              <div><label className="form-label">Overhead (%)</label>
                <input type="number" step="0.01" className="form-input" value={overhead} onChange={e => setOverhead(e.target.value)} /></div>
              <div className="flex items-center gap-3">
                <button onClick={save} disabled={saving} className="btn-primary"><Save size={14} />{saving ? 'Saving…' : 'Save & recalc'}</button>
                <span className="text-xs text-slate-400 flex items-center gap-1"><Zap size={12} />{data.total_mw} MW</span>
              </div>
            </div>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat icon={TrendingUp} label="Revenue (inflow)" value={money(data.revenue)} tone="text-green-600" sub={`₹${data.client_rate_per_wp}/Wp × ${data.total_mw} MW`} />
            <Stat icon={TrendingDown} label="Subcontractor outflow" value={money(data.subcontractor_outflow)} tone="text-slate-900" sub="labour / work orders" />
            <Stat icon={Percent} label="Overhead" value={money(data.overhead)} sub={`${data.overhead_percent}% of revenue`} />
            <Stat icon={IndianRupee} label="Margin" value={money(data.margin)} tone={marginPos ? 'text-green-600' : 'text-red-600'} sub={`₹${data.margin_per_wp}/Wp · ${data.margin_percent}%`} />
          </div>
          {Number(data.retention_held) > 0 && (
            <p className="text-xs text-slate-400">Retention held across work orders: {money(data.retention_held)} (released on handover).</p>
          )}

          {/* site breakdown */}
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-surface-100"><h3 className="font-semibold text-slate-900 text-sm">Revenue by location</h3></div>
            <table className="data-table">
              <thead><tr><th>Site / location</th><th className="text-right">MW</th><th className="text-right">Revenue (₹/Wp × MW)</th></tr></thead>
              <tbody>
                {(data.sites || []).length === 0 && <tr><td colSpan={3} className="text-center text-slate-400 py-6">No sites — revenue is computed on the project MW.</td></tr>}
                {(data.sites || []).map((s, i) => (
                  <tr key={i}><td className="text-slate-700">{s.site_name}</td><td className="text-right">{s.capacity_mw}</td><td className="text-right text-green-600">{money(s.revenue)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* work orders */}
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-surface-100"><h3 className="font-semibold text-slate-900 text-sm">Subcontractor outflow (work orders)</h3></div>
            <table className="data-table">
              <thead><tr><th>WO No.</th><th>Vendor</th><th className="text-right">₹/Wp</th><th className="text-right">Value</th><th>Status</th></tr></thead>
              <tbody>
                {(data.work_orders || []).length === 0 && <tr><td colSpan={5} className="text-center text-slate-400 py-6">No work orders yet.</td></tr>}
                {(data.work_orders || []).map((w, i) => (
                  <tr key={i}><td className="font-mono text-xs font-semibold text-slate-700">{w.wo_no}</td><td className="text-slate-600">{w.vendor}</td><td className="text-right">{w.rate_per_wp}</td><td className="text-right text-slate-700">{money(w.contract_value)}</td><td><span className="badge badge-slate text-xs">{w.status}</span></td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
