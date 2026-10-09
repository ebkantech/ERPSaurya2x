import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Search, FolderKanban, MapPin, Zap, Plus, ChevronRight, Sun, Loader2, Lock, AlertTriangle, X, CheckCircle2 } from 'lucide-react'
import api from '../../services/api'

const PROJECTS_URL = '/projects/'

const badgeForStatus = (status) => {
  const s = (status || '').toLowerCase()
  if (s === 'completed') return 'badge-green'
  if (s === 'on hold') return 'badge-amber'
  if (s === 'planning') return 'badge-slate'
  return 'badge-blue' // running / active / anything else
}

const titleCase = (s) => (s || '').replace(/\b\w/g, c => c.toUpperCase())

export default function ProjectList() {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [buFilter, setBuFilter] = useState('All')
  const [readiness, setReadiness] = useState({})   // projectId -> {locked, reasons, sites, nocs}
  const [lockModal, setLockModal] = useState(null)  // { project, readiness }

  useEffect(() => {
    let active = true
    api.get(PROJECTS_URL)
      .then(res => {
        if (!active) return
        const list = res.data.projects || []
        setProjects(list)
        // fetch each project's development-gate readiness
        list.forEach(p => {
          api.get(`/solar/projects/${p.id}/readiness/`)
            .then(r => { if (active) setReadiness(prev => ({ ...prev, [p.id]: r.data })) })
            .catch(() => {})
        })
      })
      .catch(() => { if (active) setError('Could not load projects.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const businessUnits = ['All', ...Array.from(new Set(projects.map(p => p.business_unit).filter(Boolean)))]

  const filtered = projects.filter(p => {
    const q = search.toLowerCase()
    const matchQ =
      (p.project_name || '').toLowerCase().includes(q) ||
      (p.project_code || '').toLowerCase().includes(q) ||
      (p.project_location || '').toLowerCase().includes(q)
    const matchBu = buFilter === 'All' || p.business_unit === buFilter
    return matchQ && matchBu
  })

  const activeCount = projects.filter(p => ['active', 'running'].includes((p.status || '').toLowerCase())).length

  return (
    <div className="space-y-6 pb-4">
      <div className="page-header">
        <div>
          <h2 className="page-title">Projects</h2>
          <p className="page-subtitle">{projects.length} projects · {activeCount} active/running</p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/projects/new" className="btn-primary"><Plus size={14} />New Project</Link>
        </div>
      </div>

      {/* Filter bar */}
      <div className="card p-4 flex items-center gap-3 flex-wrap">
        <div className="flex items-center bg-surface-50 border border-surface-200 rounded-lg px-3 py-2 gap-2 flex-1 max-w-sm">
          <Search size={14} className="text-slate-400" />
          <input type="text" placeholder="Search project name, code, location…"
            className="bg-transparent text-sm placeholder-slate-400 outline-none flex-1"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {businessUnits.map(t => (
            <button key={t} onClick={() => setBuFilter(t)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${buFilter===t ? 'bg-brand-500 text-white shadow-sm' : 'bg-surface-50 text-slate-600 border border-surface-200 hover:bg-surface-100'}`}
            >
              {t}
            </button>
          ))}
        </div>
        <span className="text-xs text-slate-400 font-medium ml-auto">{filtered.length} results</span>
      </div>

      {/* States */}
      {loading && (
        <div className="flex items-center gap-2 text-sm text-slate-500 py-16 justify-center">
          <Loader2 size={16} className="animate-spin" />Loading projects…
        </div>
      )}
      {!loading && error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>
      )}
      {!loading && !error && filtered.length === 0 && (
        <div className="card p-10 text-center text-sm text-slate-500">
          No projects found. <Link to="/projects/new" className="text-brand-600 font-medium">Create one →</Link>
        </div>
      )}

      {/* Project cards */}
      {!loading && !error && filtered.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(p => {
            const r = readiness[p.id]
            const locked = r?.locked
            return (
            <div key={p.id} className={`card p-5 transition-all group block ${locked ? 'ring-1 ring-amber-200' : ''}`}>
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-11 h-11 rounded-xl border flex items-center justify-center flex-shrink-0 ${locked ? 'bg-amber-50 border-amber-200' : 'bg-brand-50 border-brand-100'}`}>
                    {locked ? <Lock size={18} className="text-amber-600" /> : <FolderKanban size={19} className="text-brand-600" />}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-400">{p.project_code}</p>
                    <span className={`badge mt-0.5 ${badgeForStatus(p.status)}`}>{titleCase(p.status) || '—'}</span>
                  </div>
                </div>
                {locked ? (
                  <button onClick={() => setLockModal({ project: p, readiness: r })}
                    className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg flex items-center gap-1 hover:bg-amber-100">
                    <Lock size={11} />Locked
                  </button>
                ) : r ? (
                  <span className="text-xs font-semibold text-green-600 bg-green-50 border border-green-200 px-2 py-1 rounded-lg flex items-center gap-1">
                    <CheckCircle2 size={11} />Cleared
                  </span>
                ) : (p.business_unit && (
                  <span className="text-xs font-semibold text-slate-400 bg-surface-100 px-2 py-1 rounded-lg">{p.business_unit}</span>
                ))}
              </div>

              <h3 className="font-semibold text-slate-900 mb-1 group-hover:text-brand-600 transition-colors">{p.project_name}</h3>

              <div className="flex items-center gap-4 text-xs text-slate-500 mb-4 flex-wrap">
                {p.project_location && <span className="flex items-center gap-1"><MapPin size={11} />{p.project_location}</span>}
                {p.total_mw && <span className="flex items-center gap-1"><Zap size={11} />{p.total_mw} MW</span>}
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-surface-100 text-xs">
                <div className="flex items-center gap-2 text-slate-500">
                  {p.procurement_source && <span className="capitalize">{p.procurement_source}</span>}
                  {p.created_at && <span className="text-slate-400">· {p.created_at}</span>}
                </div>
                {locked ? (
                  <button onClick={() => setLockModal({ project: p, readiness: r })}
                    className="flex items-center gap-1 text-amber-600 font-semibold hover:text-amber-700">
                    <Lock size={12} />Why locked?<ChevronRight size={12} />
                  </button>
                ) : (
                  <Link to={`/work-structure/${p.id}`} className="flex items-center gap-1 text-brand-600 font-semibold hover:text-brand-700">
                    <Sun size={12} />Work Structure<ChevronRight size={12} />
                  </Link>
                )}
              </div>
            </div>
            )
          })}
        </div>
      )}

      {/* Why-locked modal */}
      {lockModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setLockModal(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-surface-100">
              <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                <Lock size={16} className="text-amber-600" />Development locked · {lockModal.project.project_name}
              </h3>
              <button onClick={() => setLockModal(null)} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-slate-500">
                This project can't start development (Work Structure) until the items below are resolved.
                Clear them in <span className="font-medium text-slate-700">Site Assessment</span> and
                <span className="font-medium text-slate-700"> Documents (DMS) → Statutory / NOC</span>.
              </p>

              {(lockModal.readiness?.sites || []).length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1.5">Site assessment</p>
                  <ul className="space-y-1.5">
                    {lockModal.readiness.sites.map((s, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                        <AlertTriangle size={14} className="text-amber-500 mt-0.5 flex-shrink-0" />{s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {(lockModal.readiness?.nocs || []).length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1.5">Pending certificates / NOCs</p>
                  <ul className="space-y-1.5">
                    {lockModal.readiness.nocs.map((n, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                        <AlertTriangle size={14} className="text-amber-500 mt-0.5 flex-shrink-0" />{n}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="px-5 py-3 border-t border-surface-100 flex justify-end">
              <Link to="/operations/documents" onClick={() => setLockModal(null)} className="btn-primary text-xs">
                Go to Documents / NOCs
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
