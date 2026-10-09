import React, { useState, useEffect } from 'react'
import {
  MapPin, Loader2, FolderKanban, Zap, Plus, ChevronRight, ChevronDown,
  CheckCircle2, Lock, ShieldCheck, ClipboardCheck,
} from 'lucide-react'
import api from '../../services/api'

const siteBadge = {
  pending: 'badge-slate', in_assessment: 'badge-amber', cleared: 'badge-green', on_hold: 'badge-red',
}
const ASSESS_STATUS = ['pending', 'submitted', 'cleared', 'rejected', 'waived']
const NOC_STATUS = ['pending', 'submitted', 'approved', 'rejected', 'resubmit', 'waived']

function Stat({ icon: Icon, label, value, tone = 'text-slate-900' }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-slate-400 text-xs font-medium mb-1"><Icon size={13} />{label}</div>
      <p className={`text-2xl font-bold ${tone}`}>{value}</p>
    </div>
  )
}

export default function SiteAssessment() {
  const [projects, setProjects] = useState([])
  const [projectId, setProjectId] = useState('')
  const [data, setData] = useState(null)   // {sites, project_total_mw, readiness}
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [open, setOpen] = useState(null)   // expanded site id
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState({ site_name: '', location: '', capacity_mw: '', apply_checklists: true })

  useEffect(() => {
    api.get('/projects/').then(r => setProjects(r.data.projects || [])).catch(() => {})
  }, [])

  const load = () => {
    if (!projectId) return
    setLoading(true); setErr('')
    api.get(`/solar/projects/${projectId}/sites/`)
      .then(r => setData(r.data)).catch(() => setErr('Could not load sites.'))
      .finally(() => setLoading(false))
  }
  useEffect(() => { if (projectId) load(); else setData(null) }, [projectId])

  const addSite = async (e) => {
    e.preventDefault(); setErr('')
    try {
      await api.post(`/solar/projects/${projectId}/sites/`, form)
      setShowNew(false); setForm({ site_name: '', location: '', capacity_mw: '', apply_checklists: true })
      load()
    } catch (e2) { setErr(e2.response?.data?.error || 'Could not add site.') }
  }
  const siteAction = async (site, body) => {
    setErr('')
    try { await api.post(`/solar/sites/${site.id}/`, body); load() }
    catch (e2) { setErr(e2.response?.data?.error || 'Action failed.') }
  }
  const setAssess = async (item, status) => {
    setErr('')
    try { await api.post(`/solar/assessment-items/${item.id}/`, { status }); load() }
    catch (e2) { setErr(e2.response?.data?.error || 'Could not update.') }
  }
  const setNoc = async (noc, status) => {
    setErr('')
    try { await api.post(`/solar/approvals/${noc.id}/`, { status }); load() }
    catch (e2) { setErr(e2.response?.data?.error || 'Could not update.') }
  }

  const sites = data?.sites || []
  const cleared = sites.filter(s => s.is_cleared).length
  const locked = data?.readiness?.locked

  return (
    <div className="space-y-6 pb-4">
      <div>
        <h2 className="page-title">Site Assessment &amp; Compliance</h2>
        <p className="page-subtitle">Per-location records — capacity, assessment checklist and statutory NOCs. Project MW rolls up from sites.</p>
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat icon={MapPin} label="Sites / locations" value={sites.length} />
            <Stat icon={CheckCircle2} label="Cleared" value={cleared} tone="text-green-600" />
            <Stat icon={Zap} label={`Allocated of ${data.project_total_mw} MW`}
              value={`${data.allocated_mw ?? '0'} MW`}
              tone={Number(data.remaining_mw) < 0 ? 'text-red-600' : 'text-slate-900'} />
            <Stat icon={locked ? Lock : ShieldCheck} label="Development" value={locked ? 'Locked' : 'Ready'} tone={locked ? 'text-amber-600' : 'text-green-600'} />
          </div>

          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-surface-100 flex items-center justify-between">
              <h3 className="font-semibold text-slate-900 text-sm flex items-center gap-2"><MapPin size={15} />Locations</h3>
              <button onClick={() => setShowNew(v => !v)} className="btn-primary text-xs py-1.5"><Plus size={13} />Add site</button>
            </div>

            {showNew && (
              <form onSubmit={addSite} className="p-4 bg-surface-50 border-b border-surface-100 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div><label className="form-label">Site name</label>
                  <input className="form-input" required value={form.site_name} onChange={e => setForm(f => ({ ...f, site_name: e.target.value }))} placeholder="e.g. Pokaran Block-A" /></div>
                <div><label className="form-label">Location</label>
                  <input className="form-input" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="District / state" /></div>
                <div><label className="form-label">Capacity (MW)</label>
                  <input type="number" step="0.001" className="form-input" value={form.capacity_mw} onChange={e => setForm(f => ({ ...f, capacity_mw: e.target.value }))} />
                  {Number(data.project_total_mw) > 0 && (
                    <p className="text-xs text-slate-400 mt-1">Project capacity {data.project_total_mw} MW · {data.remaining_mw} MW remaining</p>
                  )}</div>
                <label className="flex items-center gap-2 text-sm text-slate-700 mt-6">
                  <input type="checkbox" checked={form.apply_checklists} onChange={e => setForm(f => ({ ...f, apply_checklists: e.target.checked }))} className="w-4 h-4 accent-brand-500" />
                  Apply standard assessment + NOC checklists
                </label>
                <div className="md:col-span-2 flex justify-end gap-2">
                  <button type="button" onClick={() => setShowNew(false)} className="btn-secondary text-xs">Cancel</button>
                  <button type="submit" className="btn-primary text-xs"><Plus size={13} />Add site</button>
                </div>
              </form>
            )}

            <table className="data-table">
              <thead><tr><th></th><th>Code</th><th>Site / location</th><th className="text-right">MW</th><th className="text-center">Assessment</th><th className="text-center">NOCs</th><th>Status</th></tr></thead>
              <tbody>
                {sites.length === 0 && <tr><td colSpan={7} className="text-center text-slate-400 py-6">No sites yet. Add the project's locations above.</td></tr>}
                {sites.map(s => (
                  <React.Fragment key={s.id}>
                    <tr className="cursor-pointer hover:bg-surface-50" onClick={() => setOpen(open === s.id ? null : s.id)}>
                      <td>{open === s.id ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}</td>
                      <td className="font-mono text-xs font-semibold text-slate-700">{s.site_code}</td>
                      <td className="text-slate-700">{s.site_name}{s.location ? <span className="text-xs text-slate-400"> · {s.location}</span> : null}</td>
                      <td className="text-right">{s.capacity_mw}</td>
                      <td className="text-center text-xs">{s.assessment_pending ? <span className="text-amber-600">{s.assessment_pending} pending</span> : <span className="text-green-600">OK</span>}</td>
                      <td className="text-center text-xs">{s.noc_pending ? <span className="text-amber-600">{s.noc_pending} pending</span> : <span className="text-green-600">OK</span>}</td>
                      <td><span className={`badge ${siteBadge[s.status] || 'badge-slate'}`}>{s.status_display}</span></td>
                    </tr>
                    {open === s.id && (
                      <tr><td colSpan={7} className="bg-surface-50/60 p-0">
                        <div className="px-6 py-4 grid grid-cols-1 lg:grid-cols-2 gap-6">
                          {/* assessments */}
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 flex items-center gap-1"><ClipboardCheck size={13} />Assessment</h4>
                              <button onClick={() => siteAction(s, { action: 'apply_checklists' })} className="text-xs text-brand-600 hover:text-brand-700 font-medium">Apply checklists</button>
                            </div>
                            {s.assessments.length === 0 && <p className="text-xs text-slate-400">No assessment items.</p>}
                            {s.assessments.map(a => (
                              <div key={a.id} className="flex items-center gap-2 py-1 text-sm">
                                <span className="flex-1 truncate text-slate-600">{a.name}</span>
                                <select value={a.status} onChange={e => setAssess(a, e.target.value)}
                                  className={`text-xs border rounded-md px-2 py-1 ${a.is_satisfied ? 'border-green-200 bg-green-50 text-green-700' : 'border-surface-200'}`}>
                                  {ASSESS_STATUS.map(x => <option key={x} value={x}>{x}</option>)}
                                </select>
                              </div>
                            ))}
                          </div>
                          {/* NOCs */}
                          <div>
                            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 flex items-center gap-1 mb-2"><ShieldCheck size={13} />Statutory NOCs</h4>
                            {s.nocs.length === 0 && <p className="text-xs text-slate-400">No NOCs. Use “Apply checklists”.</p>}
                            {s.nocs.map(n => (
                              <div key={n.id} className="flex items-center gap-2 py-1 text-sm">
                                <span className="flex-1 truncate text-slate-600">{n.authority} · {n.approval_type}</span>
                                <select value={n.status} onChange={e => setNoc(n, e.target.value)}
                                  className={`text-xs border rounded-md px-2 py-1 ${n.is_satisfied ? 'border-green-200 bg-green-50 text-green-700' : 'border-surface-200'}`}>
                                  {NOC_STATUS.map(x => <option key={x} value={x}>{x}</option>)}
                                </select>
                              </div>
                            ))}
                          </div>
                          <div className="lg:col-span-2 flex items-center gap-2 pt-1">
                            <span className="text-xs text-slate-400">Set location status:</span>
                            {['cleared', 'on_hold', 'pending'].map(st => (
                              <button key={st} onClick={() => siteAction(s, { action: 'set_status', status: st })}
                                className="text-xs btn-secondary !py-1">{st.replace('_', ' ')}</button>
                            ))}
                            <button onClick={() => { if (window.confirm(`Remove site ${s.site_code}?`)) siteAction(s, { action: 'delete' }) }}
                              className="text-xs text-red-500 hover:text-red-600 ml-auto">Remove</button>
                          </div>
                        </div>
                      </td></tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {locked && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-3">
              <p className="font-semibold mb-1 flex items-center gap-2"><Lock size={14} />Development is locked</p>
              <ul className="list-disc list-inside text-xs space-y-0.5">
                {(data.readiness.reasons || []).map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  )
}
