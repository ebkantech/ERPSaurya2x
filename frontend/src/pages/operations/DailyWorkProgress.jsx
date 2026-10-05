import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { HardHat, Loader2, FolderKanban, TrendingUp, MapPin, Building2, ListChecks, CalendarRange } from 'lucide-react'
import api from '../../services/api'

const num = (v) => Number(v || 0)
const pct = (v) => `${Math.round(num(v))}%`

function Bar({ value }) {
  const v = Math.max(0, Math.min(100, num(value)))
  const color = v >= 100 ? 'bg-emerald-500' : v >= 50 ? 'bg-brand-500' : v > 0 ? 'bg-amber-400' : 'bg-surface-200'
  return (
    <div className="h-2 rounded-full bg-surface-100 overflow-hidden min-w-[80px]">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${v}%` }} />
    </div>
  )
}

function Stat({ icon: Icon, label, value }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-slate-400 text-xs font-medium mb-1"><Icon size={13} />{label}</div>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
    </div>
  )
}

export default function DailyWorkProgress() {
  const [projects, setProjects] = useState([])
  const [projectId, setProjectId] = useState('')
  const [build, setBuild] = useState(null)
  const [entries, setEntries] = useState([])
  const [vendors, setVendors] = useState([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [filterVendor, setFilterVendor] = useState('')
  const hasBuild = build === null ? null : !!build

  useEffect(() => {
    api.get('/projects/').then(res => setProjects(res.data.projects || [])).catch(() => setProjects([]))
    api.get('/solar/vendor-options/').then(res => setVendors(res.data.vendors || [])).catch(() => setVendors([]))
  }, [])

  useEffect(() => {
    if (!projectId) { setEntries([]); setBuild(null); return }
    setLoading(true); setErr('')
    api.get(`/solar/projects/${projectId}/build/`)
      .then(res => setBuild(res.data.build || false))
      .catch(() => setBuild(false))
    const q = filterVendor ? `?vendor_id=${filterVendor}` : ''
    api.get(`/solar/projects/${projectId}/progress/${q}`)
      .then(res => setEntries(res.data.entries || []))
      .catch(() => setErr('Could not load progress.'))
      .finally(() => setLoading(false))
  }, [projectId, filterVendor])

  // --- Schedule / milestones: map each WBS stage to its field progress ---
  const stageOf = {} // work_package_id -> stage_id (for entries that only carry a package)
  if (build && build.stages) {
    for (const s of build.stages) for (const w of (s.work_packages || [])) stageOf[w.id] = s.id
  }
  const stageAgg = {} // stage_id -> {sum,count}
  for (const e of entries) {
    const sid = e.stage_id || stageOf[e.work_package_id]
    if (!sid) continue
    const a = stageAgg[sid] || (stageAgg[sid] = { sum: 0, count: 0 })
    a.sum += num(e.progress_percent); a.count += 1
  }
  const schedule = (build && build.stages ? build.stages : []).map(s => ({
    id: s.id, code: s.code, name: s.name, status: s.status,
    planned_start: s.planned_start, planned_end: s.planned_end,
    actual_start: s.actual_start, actual_end: s.actual_end,
    progress: stageAgg[s.id] ? stageAgg[s.id].sum / stageAgg[s.id].count : 0,
    updates: stageAgg[s.id] ? stageAgg[s.id].count : 0,
  }))

  // --- Analysis (read-only, computed from field-submitted entries) ---
  const latestBySite = {}
  for (const e of entries) { // entries are newest-first from the API
    if (!latestBySite[e.site_name]) latestBySite[e.site_name] = e
  }
  const sites = Object.values(latestBySite).sort((a, b) => num(b.progress_percent) - num(a.progress_percent))

  const vendorAgg = {}
  for (const e of entries) {
    const key = e.vendor_name || 'Unassigned'
    const v = vendorAgg[key] || (vendorAgg[key] = { name: key, sum: 0, count: 0, sites: new Set() })
    v.sum += num(e.progress_percent); v.count += 1; v.sites.add(e.site_name)
  }
  const vendorRows = Object.values(vendorAgg)
    .map(v => ({ name: v.name, avg: v.count ? v.sum / v.count : 0, count: v.count, sites: v.sites.size }))
    .sort((a, b) => b.avg - a.avg)

  const avgOverall = sites.length ? sites.reduce((s, x) => s + num(x.progress_percent), 0) / sites.length : 0

  return (
    <div className="space-y-6 pb-6">
      <div className="page-header">
        <div>
          <h2 className="page-title flex items-center gap-2"><HardHat size={20} className="text-brand-600" />Daily Work Progress</h2>
          <p className="page-subtitle">Read-only monitoring · progress is reported from the field (vendor / supervisor)</p>
        </div>
        <div className="flex items-center gap-2">
          <FolderKanban size={15} className="text-slate-400" />
          <select className="border border-surface-200 rounded-lg px-3 py-2 text-sm min-w-[220px]"
            value={projectId} onChange={e => setProjectId(e.target.value)}>
            <option value="">Select a project…</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.project_code} · {p.project_name}</option>)}
          </select>
        </div>
      </div>

      {err && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{err}</div>}

      {!projectId && (
        <div className="card p-10 text-center text-sm text-slate-500">Select a project to view field-reported progress and analysis.</div>
      )}

      {projectId && loading && (
        <div className="flex items-center gap-2 text-sm text-slate-500 py-10 justify-center"><Loader2 size={16} className="animate-spin" />Loading…</div>
      )}

      {projectId && !loading && hasBuild === false && (
        <div className="card p-8 text-center text-sm text-slate-500">
          This project has no Work Structure yet.{' '}
          <Link to={`/work-structure/${projectId}`} className="text-brand-600 font-medium">Generate it first →</Link>
        </div>
      )}

      {projectId && !loading && hasBuild && (
        <>
          {/* Analysis */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat icon={TrendingUp} label="Avg site progress" value={pct(avgOverall)} />
            <Stat icon={MapPin} label="Sites reporting" value={sites.length} />
            <Stat icon={Building2} label="Vendors active" value={vendorRows.length} />
            <Stat icon={ListChecks} label="Updates logged" value={entries.length} />
          </div>

          {/* Schedule / milestones — WBS stages in order with planned vs actual dates + live progress */}
          <div className="card overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 bg-surface-50 border-b border-surface-200">
              <CalendarRange size={15} className="text-brand-600" />
              <h4 className="font-semibold text-slate-800 text-sm">Schedule &amp; milestones</h4>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-400 border-b border-surface-100">
                    <th className="text-left font-medium px-4 py-2">Stage</th>
                    <th className="text-left font-medium px-2 py-2">Planned</th>
                    <th className="text-left font-medium px-2 py-2">Actual</th>
                    <th className="text-left font-medium px-2 py-2">Status</th>
                    <th className="text-left font-medium px-2 py-2 w-40">Progress</th>
                  </tr>
                </thead>
                <tbody>
                  {schedule.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">No stages defined.</td></tr>}
                  {schedule.map(s => (
                    <tr key={s.id} className="border-b border-surface-50 last:border-0">
                      <td className="px-4 py-2">
                        <span className="text-xs font-bold text-brand-600 bg-brand-50 border border-brand-100 rounded px-1.5 py-0.5 mr-2">{s.code}</span>
                        <span className="text-slate-700">{s.name}</span>
                      </td>
                      <td className="px-2 py-2 text-xs text-slate-500">{s.planned_start || '—'} → {s.planned_end || '—'}</td>
                      <td className="px-2 py-2 text-xs text-slate-500">{s.actual_start || '—'} → {s.actual_end || '—'}</td>
                      <td className="px-2 py-2"><span className="badge badge-blue">{(s.status || 'pending').replace('_', ' ')}</span></td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-2">
                          <Bar value={s.progress} />
                          <span className="w-9 text-right font-semibold text-slate-800 text-xs">{pct(s.progress)}</span>
                        </div>
                        {s.updates > 0 && <span className="text-[10px] text-slate-400">{s.updates} update{s.updates !== 1 ? 's' : ''}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Per-vendor roll-up */}
            <div className="card p-4">
              <h4 className="font-semibold text-slate-800 text-sm mb-3">Progress by vendor</h4>
              {vendorRows.length === 0 && <p className="text-sm text-slate-400">No data yet.</p>}
              <div className="space-y-2.5">
                {vendorRows.map(v => (
                  <div key={v.name} className="flex items-center gap-3 text-sm">
                    <span className="w-32 truncate text-slate-700">{v.name}</span>
                    <Bar value={v.avg} />
                    <span className="w-10 text-right font-semibold text-slate-800">{pct(v.avg)}</span>
                    <span className="text-xs text-slate-400 w-16 text-right">{v.sites} site{v.sites !== 1 ? 's' : ''}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Per-site current status */}
            <div className="card p-4">
              <h4 className="font-semibold text-slate-800 text-sm mb-3">Current status by site</h4>
              {sites.length === 0 && <p className="text-sm text-slate-400">No data yet.</p>}
              <div className="space-y-2.5">
                {sites.map(s => (
                  <div key={s.site_name} className="flex items-center gap-3 text-sm">
                    <span className="w-32 truncate text-slate-700">{s.site_name}</span>
                    <Bar value={s.progress_percent} />
                    <span className="w-10 text-right font-semibold text-slate-800">{pct(s.progress_percent)}</span>
                    <span className="text-xs text-slate-400 w-20 text-right truncate">{s.vendor_name || '—'}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Filter + full log (read-only) */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Filter by vendor:</span>
            <select className="text-xs border border-surface-200 rounded-md px-2 py-1" value={filterVendor}
              onChange={e => setFilterVendor(e.target.value)}>
              <option value="">All vendors</option>
              {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
            <span className="text-xs text-slate-400 ml-auto">{entries.length} updates</span>
          </div>

          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-400 border-b border-surface-100">
                    <th className="text-left font-medium px-4 py-2">Date</th>
                    <th className="text-left font-medium px-2 py-2">Site</th>
                    <th className="text-left font-medium px-2 py-2">Work scope</th>
                    <th className="text-left font-medium px-2 py-2">Vendor</th>
                    <th className="text-right font-medium px-2 py-2">%</th>
                    <th className="text-left font-medium px-2 py-2">Status</th>
                    <th className="text-left font-medium px-2 py-2">Note</th>
                    <th className="text-left font-medium px-4 py-2">Reported by</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">No field updates yet. Progress is submitted from the field app.</td></tr>}
                  {entries.map(e => (
                    <tr key={e.id} className="border-b border-surface-50 last:border-0">
                      <td className="px-4 py-2 text-slate-600">{e.progress_date}</td>
                      <td className="px-2 py-2 font-medium text-slate-800">{e.site_name}</td>
                      <td className="px-2 py-2 text-slate-600">{e.work_package_name || e.stage_name || '—'}</td>
                      <td className="px-2 py-2 text-slate-600">{e.vendor_name || '—'}</td>
                      <td className="px-2 py-2 text-right font-semibold text-slate-800">{e.progress_percent}%</td>
                      <td className="px-2 py-2"><span className="badge badge-blue">{(e.status || '').replace('_', ' ')}</span></td>
                      <td className="px-2 py-2 text-slate-500">{e.note}</td>
                      <td className="px-4 py-2 text-slate-400 text-xs">{e.reporter_name || '—'}{e.source === 'field' ? ' 📱' : ''}</td>
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
