import React, { useState, useEffect } from 'react'
import { ShieldCheck, Loader2, FolderKanban, ClipboardCheck, AlertTriangle, CheckCircle2, XCircle, MapPin } from 'lucide-react'
import api from '../../services/api'

const PUNCH_STATUS = [
  ['open', 'Open'], ['in_progress', 'In progress'], ['resolved', 'Resolved'],
  ['verified', 'Verified'], ['closed', 'Closed'],
]
const sevBadge = { low: 'badge-blue', medium: 'badge-amber', high: 'badge-amber', critical: 'badge-red' }
const insBadge = { passed: 'badge-green', failed: 'badge-red', pending: 'badge-blue' }

function Stat({ icon: Icon, label, value, tone = 'text-slate-900' }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-slate-400 text-xs font-medium mb-1"><Icon size={13} />{label}</div>
      <p className={`text-2xl font-bold ${tone}`}>{value}</p>
    </div>
  )
}

export default function QualityControl() {
  const [projects, setProjects] = useState([])
  const [projectId, setProjectId] = useState('')
  const [build, setBuild] = useState(null)
  const [inspections, setInspections] = useState([])
  const [punch, setPunch] = useState([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [open, setOpen] = useState(null) // expanded inspection id

  useEffect(() => {
    api.get('/projects/').then(res => setProjects(res.data.projects || [])).catch(() => setProjects([]))
  }, [])

  const loadData = (bid) => {
    Promise.all([
      api.get(`/solar/builds/${bid}/inspections/`),
      api.get(`/solar/builds/${bid}/punch/`),
    ]).then(([i, p]) => { setInspections(i.data.inspections || []); setPunch(p.data.punch_items || []) })
      .catch(() => setErr('Could not load QA data.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (!projectId) { setBuild(null); setInspections([]); setPunch([]); return }
    setLoading(true); setErr('')
    api.get(`/solar/projects/${projectId}/build/`)
      .then(res => {
        const b = res.data.build || false
        setBuild(b)
        if (b) loadData(b.id); else setLoading(false)
      })
      .catch(() => { setBuild(false); setLoading(false) })
  }, [projectId])

  const setPunchStatus = async (p, status) => {
    try {
      const res = await api.patch(`/solar/punch/${p.id}/`, { status })
      setPunch(list => list.map(x => x.id === p.id ? res.data.punch : x))
    } catch { setErr('Could not update punch item.') }
  }

  const insPassed = inspections.filter(i => i.status === 'passed').length
  const insFailed = inspections.filter(i => i.status === 'failed').length
  const punchOpen = punch.filter(p => p.status === 'open' || p.status === 'in_progress').length
  const punchCritical = punch.filter(p => p.severity === 'critical' && p.status !== 'closed').length

  return (
    <div className="space-y-6 pb-6">
      <div className="page-header">
        <div>
          <h2 className="page-title flex items-center gap-2"><ShieldCheck size={20} className="text-brand-600" />Quality & Punch List</h2>
          <p className="page-subtitle">QA inspections and site defects reported from the field — monitor &amp; close out.</p>
        </div>
      </div>

      <div className="card p-4">
        <label className="block text-xs font-semibold text-slate-500 mb-2 flex items-center gap-1"><FolderKanban size={13} />Project</label>
        <select value={projectId} onChange={e => setProjectId(e.target.value)}
          className="w-full md:w-96 border border-surface-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-brand-500">
          <option value="">Select a project…</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.project_name} · {p.project_code}</option>)}
        </select>
      </div>

      {err && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{err}</div>}
      {loading && <div className="flex items-center gap-2 text-sm text-slate-500 py-10 justify-center"><Loader2 size={16} className="animate-spin" />Loading…</div>}

      {projectId && !loading && build === false && (
        <div className="bg-amber-50 border border-amber-200 text-amber-700 text-sm rounded-xl px-4 py-3">This project has no work structure yet.</div>
      )}

      {build && !loading && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat icon={ClipboardCheck} label="Inspections" value={inspections.length} />
            <Stat icon={CheckCircle2} label="Passed" value={insPassed} tone="text-emerald-600" />
            <Stat icon={XCircle} label="Failed" value={insFailed} tone="text-red-600" />
            <Stat icon={AlertTriangle} label="Open defects" value={punchOpen} tone={punchCritical ? 'text-red-600' : 'text-amber-600'} />
          </div>

          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-surface-100 font-semibold text-slate-800 text-sm flex items-center gap-2"><ClipboardCheck size={15} />QA Inspections</div>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-400 border-b border-surface-100">
                <th className="px-4 py-2">Type</th><th className="px-4 py-2">Site</th><th className="px-4 py-2">Work package</th>
                <th className="px-4 py-2">Date</th><th className="px-4 py-2">Checks</th><th className="px-4 py-2">Result</th></tr></thead>
              <tbody>
                {inspections.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">No inspections yet.</td></tr>}
                {inspections.map(i => (
                  <React.Fragment key={i.id}>
                    <tr className="border-b border-surface-50 hover:bg-surface-50 cursor-pointer" onClick={() => setOpen(open === i.id ? null : i.id)}>
                      <td className="px-4 py-2 font-medium text-slate-700">{i.inspection_type_display}</td>
                      <td className="px-4 py-2">{i.site_name}</td>
                      <td className="px-4 py-2 text-slate-500">{i.work_package || '—'}</td>
                      <td className="px-4 py-2 text-slate-500">{i.inspection_date}</td>
                      <td className="px-4 py-2 text-slate-500">{i.rollup.passed}/{i.rollup.total}</td>
                      <td className="px-4 py-2"><span className={`badge ${insBadge[i.status] || 'badge-blue'}`}>{i.status_display}</span></td>
                    </tr>
                    {open === i.id && (
                      <tr><td colSpan={6} className="px-4 py-3 bg-surface-50">
                        <table className="w-full text-xs">
                          <thead><tr className="text-slate-400 text-left"><th className="py-1">Parameter</th><th>Spec</th><th>Measured</th><th>Unit</th><th>Result</th><th>Remark</th></tr></thead>
                          <tbody>
                            {(i.checkpoints || []).map(c => (
                              <tr key={c.id} className="border-t border-surface-100">
                                <td className="py-1 font-medium text-slate-700">{c.parameter}</td><td className="text-slate-500">{c.spec}</td>
                                <td className="font-semibold">{c.measured || '—'}</td><td className="text-slate-500">{c.unit}</td>
                                <td><span className={c.result === 'pass' ? 'text-emerald-600' : c.result === 'fail' ? 'text-red-600' : 'text-slate-400'}>{c.result.toUpperCase()}</span></td>
                                <td className="text-slate-500">{c.remark}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {i.photo_url && <a href={i.photo_url} target="_blank" rel="noreferrer" className="text-xs text-brand-600 mt-2 inline-block">View photo ↗</a>}
                        {i.latitude && <a href={`https://maps.google.com/?q=${i.latitude},${i.longitude}`} target="_blank" rel="noreferrer" className="text-xs text-brand-600 ml-3 inline-flex items-center gap-1"><MapPin size={11} />Location ↗</a>}
                      </td></tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-surface-100 font-semibold text-slate-800 text-sm flex items-center gap-2"><AlertTriangle size={15} />Punch List</div>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-400 border-b border-surface-100">
                <th className="px-4 py-2">Code</th><th className="px-4 py-2">Title</th><th className="px-4 py-2">Discipline</th>
                <th className="px-4 py-2">Severity</th><th className="px-4 py-2">Vendor</th><th className="px-4 py-2">Raised</th><th className="px-4 py-2">Status</th></tr></thead>
              <tbody>
                {punch.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-400">No defects logged.</td></tr>}
                {punch.map(p => (
                  <tr key={p.id} className="border-b border-surface-50">
                    <td className="px-4 py-2 font-mono text-xs text-slate-600">{p.code}</td>
                    <td className="px-4 py-2 font-medium text-slate-700">{p.title}{p.photo_url && <a href={p.photo_url} target="_blank" rel="noreferrer" className="text-brand-600 ml-1">📷</a>}</td>
                    <td className="px-4 py-2 text-slate-500 capitalize">{p.discipline_display}</td>
                    <td className="px-4 py-2"><span className={`badge ${sevBadge[p.severity] || 'badge-blue'}`}>{p.severity_display}</span></td>
                    <td className="px-4 py-2 text-slate-500">{p.vendor_name || '—'}</td>
                    <td className="px-4 py-2 text-slate-500">{p.raised_on}</td>
                    <td className="px-4 py-2">
                      <select value={p.status} onChange={e => setPunchStatus(p, e.target.value)}
                        className="border border-surface-200 rounded-md px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-brand-500">
                        {PUNCH_STATUS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
