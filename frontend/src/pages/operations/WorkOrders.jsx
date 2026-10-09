import React, { useState, useEffect } from 'react'
import {
  FileSignature, Loader2, FolderKanban, IndianRupee, CheckCircle2, Clock,
  Plus, ChevronRight, ChevronDown, Send,
} from 'lucide-react'
import api from '../../services/api'

const ENGAGEMENTS = [['milestone', 'On milestones'], ['free_issue', 'Free-issue material']]
const RATE_BASIS = [['lumpsum', 'Lump sum'], ['per_wp', 'Per work package'], ['per_wp_wattage', 'Per Watt (₹/Wp)']]
const woBadge = {
  draft: 'badge-slate', issued: 'badge-blue', in_progress: 'badge-amber',
  completed: 'badge-green', closed: 'badge-slate', cancelled: 'badge-red',
}
const money = (v) => '₹' + Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })

function Stat({ icon: Icon, label, value, tone = 'text-slate-900' }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-slate-400 text-xs font-medium mb-1"><Icon size={13} />{label}</div>
      <p className={`text-2xl font-bold ${tone}`}>{value}</p>
    </div>
  )
}

export default function WorkOrders() {
  const [projects, setProjects] = useState([])
  const [projectId, setProjectId] = useState('')
  const [vendors, setVendors] = useState([])
  const [build, setBuild] = useState(null)
  const [wos, setWos] = useState([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [openWo, setOpenWo] = useState(null)
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState({
    vendor_id: '', title: '', engagement_type: 'milestone', rate_basis: 'per_wp_wattage',
    rate_per_wp: '', contract_value: '', retention_percent: '5', scope_note: '',
  })
  const [picked, setPicked] = useState({}) // work_package_id -> line_value

  useEffect(() => {
    api.get('/projects/').then(r => setProjects(r.data.projects || [])).catch(() => {})
    api.get('/solar/vendor-options/').then(r => setVendors(r.data.vendors || r.data || [])).catch(() => {})
  }, [])

  const load = () => {
    if (!projectId) return
    setLoading(true); setErr('')
    Promise.all([
      api.get(`/solar/projects/${projectId}/work-orders/`),
      api.get(`/solar/projects/${projectId}/build/`).catch(() => ({ data: { build: null } })),
    ]).then(([w, b]) => { setWos(w.data.work_orders || []); setBuild(b.data.build || null) })
      .catch(() => setErr('Could not load work orders.'))
      .finally(() => setLoading(false))
  }
  useEffect(() => { if (projectId) load(); else { setWos([]); setBuild(null) } }, [projectId])

  const allWps = (build?.stages || []).flatMap(s => s.work_packages.map(w => ({ ...w, stage_name: s.name })))

  const create = async (e) => {
    e.preventDefault(); setErr('')
    const lines = Object.entries(picked).map(([work_package_id, line_value]) => ({ work_package_id: Number(work_package_id), line_value: line_value || '0' }))
    if (!lines.length) { setErr('Pick at least one work package for the work order.'); return }
    try {
      await api.post(`/solar/projects/${projectId}/work-orders/`, { ...form, lines })
      setShowNew(false); setPicked({})
      setForm({ vendor_id: '', title: '', engagement_type: 'milestone', rate_basis: 'per_wp_wattage', rate_per_wp: '', contract_value: '', retention_percent: '5', scope_note: '' })
      load()
    } catch (e2) { setErr(e2.response?.data?.error || 'Could not create work order.') }
  }
  const issue = async (wo) => {
    if (!window.confirm(`Issue ${wo.wo_no}? Linked work packages will adopt this vendor and engagement.`)) return
    setErr('')
    try { await api.post(`/solar/work-orders/${wo.id}/`, { action: 'issue', propagate: true }); load() }
    catch (e2) { setErr(e2.response?.data?.error || 'Could not issue work order.') }
  }
  const setStatus = async (wo, status) => {
    setErr('')
    try { await api.post(`/solar/work-orders/${wo.id}/`, { action: 'set_status', status }); load() }
    catch (e2) { setErr(e2.response?.data?.error || 'Could not update.') }
  }

  const issued = wos.filter(w => w.status !== 'draft' && w.status !== 'cancelled').length
  const totalValue = wos.reduce((s, w) => s + Number(w.contract_value || 0), 0)

  return (
    <div className="space-y-6 pb-4">
      <div>
        <h2 className="page-title">Subcontractor Work Orders</h2>
        <p className="page-subtitle">Labour-only contracts — scope, engagement, per-Watt rate and milestone/free-issue binding</p>
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

      {projectId && !loading && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Stat icon={FileSignature} label="Work orders" value={wos.length} />
            <Stat icon={CheckCircle2} label="Issued / active" value={issued} tone="text-green-600" />
            <Stat icon={IndianRupee} label="Contract value" value={money(totalValue)} />
          </div>

          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-surface-100 flex items-center justify-between">
              <h3 className="font-semibold text-slate-900 text-sm flex items-center gap-2"><FileSignature size={15} />Work Orders</h3>
              <button onClick={() => setShowNew(v => !v)} className="btn-primary text-xs py-1.5" disabled={!build}>
                <Plus size={13} />New work order
              </button>
            </div>

            {showNew && (
              <form onSubmit={create} className="p-4 bg-surface-50 border-b border-surface-100 space-y-3">
                {!build && <p className="text-xs text-amber-600">This project has no work-structure build yet — create one in Projects first.</p>}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div><label className="form-label">Subcontractor</label>
                    <select className="form-input" required value={form.vendor_id} onChange={e => setForm(f => ({ ...f, vendor_id: e.target.value }))}>
                      <option value="">Select vendor…</option>
                      {vendors.map(v => <option key={v.id} value={v.id}>{v.name || v.company_name}</option>)}
                    </select></div>
                  <div><label className="form-label">Title</label>
                    <input className="form-input" required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Civil & MMS labour" /></div>
                  <div><label className="form-label">Engagement</label>
                    <select className="form-input" value={form.engagement_type} onChange={e => setForm(f => ({ ...f, engagement_type: e.target.value }))}>
                      {ENGAGEMENTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
                  <div><label className="form-label">Rate basis</label>
                    <select className="form-input" value={form.rate_basis} onChange={e => setForm(f => ({ ...f, rate_basis: e.target.value }))}>
                      {RATE_BASIS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
                  <div><label className="form-label">Rate ₹/Wp (outflow)</label>
                    <input type="number" step="0.01" className="form-input" value={form.rate_per_wp} onChange={e => setForm(f => ({ ...f, rate_per_wp: e.target.value }))} /></div>
                  <div><label className="form-label">Contract value ₹</label>
                    <input type="number" className="form-input" value={form.contract_value} onChange={e => setForm(f => ({ ...f, contract_value: e.target.value }))} /></div>
                  <div><label className="form-label">Retention %</label>
                    <input type="number" step="0.01" className="form-input" value={form.retention_percent} onChange={e => setForm(f => ({ ...f, retention_percent: e.target.value }))} /></div>
                </div>
                {/* work package picker */}
                <div>
                  <label className="form-label">Scope — pick work packages &amp; line value</label>
                  <div className="max-h-52 overflow-y-auto border border-surface-200 rounded-lg divide-y divide-surface-100">
                    {allWps.length === 0 && <p className="text-xs text-slate-400 p-3">No work packages in this build.</p>}
                    {allWps.map(w => {
                      const on = picked[w.id] !== undefined
                      return (
                        <div key={w.id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                          <input type="checkbox" checked={on} className="w-4 h-4 accent-brand-500"
                            onChange={e => setPicked(p => { const n = { ...p }; if (e.target.checked) n[w.id] = ''; else delete n[w.id]; return n })} />
                          <span className="flex-1 truncate text-slate-600"><span className="text-slate-400">{w.stage_name} · </span>{w.name}</span>
                          {on && <input type="number" placeholder="line ₹" value={picked[w.id]}
                            onChange={e => setPicked(p => ({ ...p, [w.id]: e.target.value }))}
                            className="w-28 text-xs border border-surface-200 rounded-md px-2 py-1" />}
                        </div>
                      )
                    })}
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setShowNew(false)} className="btn-secondary text-xs">Cancel</button>
                  <button type="submit" className="btn-primary text-xs"><Plus size={13} />Create (draft)</button>
                </div>
              </form>
            )}

            <table className="data-table">
              <thead><tr><th></th><th>WO No.</th><th>Title</th><th>Vendor</th><th>Engagement</th><th className="text-right">Value</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {wos.length === 0 && <tr><td colSpan={8} className="text-center text-slate-400 py-6">No work orders yet.</td></tr>}
                {wos.map(w => (
                  <React.Fragment key={w.id}>
                    <tr className="hover:bg-surface-50">
                      <td className="cursor-pointer" onClick={() => setOpenWo(openWo === w.id ? null : w.id)}>
                        {openWo === w.id ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}</td>
                      <td className="font-mono text-xs font-semibold text-slate-700">{w.wo_no}</td>
                      <td className="text-slate-700">{w.title}</td>
                      <td className="text-xs text-slate-600">{w.vendor}</td>
                      <td className="text-xs">{w.engagement_display}</td>
                      <td className="text-right text-slate-700">{money(w.contract_value)}</td>
                      <td><span className={`badge ${woBadge[w.status] || 'badge-slate'}`}>{w.status_display}</span></td>
                      <td className="text-right">
                        {w.status === 'draft' && <button onClick={() => issue(w)} className="text-xs text-brand-600 hover:text-brand-700 font-semibold flex items-center gap-1 justify-end"><Send size={11} />Issue</button>}
                        {w.status === 'issued' && <button onClick={() => setStatus(w, 'in_progress')} className="text-xs text-amber-600 hover:text-amber-700 font-semibold">Start</button>}
                        {w.status === 'in_progress' && <button onClick={() => setStatus(w, 'completed')} className="text-xs text-green-600 hover:text-green-700 font-semibold">Complete</button>}
                      </td>
                    </tr>
                    {openWo === w.id && (
                      <tr><td colSpan={8} className="bg-surface-50/60 p-0">
                        <div className="px-6 py-4">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3 text-xs">
                            <div><span className="text-slate-400">Rate basis</span><div className="font-medium text-slate-700">{w.rate_basis_display}</div></div>
                            <div><span className="text-slate-400">Rate ₹/Wp</span><div className="font-medium text-slate-700">{w.rate_per_wp}</div></div>
                            <div><span className="text-slate-400">Retention</span><div className="font-medium text-slate-700">{w.retention_percent}%</div></div>
                            <div><span className="text-slate-400">Lines total</span><div className="font-medium text-slate-700">{money(w.lines_value)}</div></div>
                          </div>
                          {w.scope_note && <p className="text-xs text-slate-500 mb-3">{w.scope_note}</p>}
                          <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Scope — work packages ({w.work_package_count})</h4>
                          <table className="w-full text-sm">
                            <thead><tr className="text-xs text-slate-400 text-left"><th className="py-1">Stage</th><th>Work package</th><th>Status</th><th className="text-right">Line value</th></tr></thead>
                            <tbody>
                              {w.lines.map(l => (
                                <tr key={l.id} className="border-t border-surface-100">
                                  <td className="py-1.5 text-xs text-slate-500">{l.stage}</td>
                                  <td className="text-slate-700">{l.work_package}</td>
                                  <td><span className="badge badge-slate text-xs">{(l.status || '').replace('_', ' ')}</span></td>
                                  <td className="text-right text-slate-600">{money(l.line_value)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td></tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
