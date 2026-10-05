import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Search, FolderKanban, MapPin, Zap, Plus, ChevronRight, Sun, Loader2 } from 'lucide-react'
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

  useEffect(() => {
    let active = true
    api.get(PROJECTS_URL)
      .then(res => { if (active) setProjects(res.data.projects || []) })
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
          <Link to="/projects/solar-tracker" className="btn-secondary"><Sun size={14} />Solar Site Tracker</Link>
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
          {filtered.map(p => (
            <div key={p.id} className="card p-5 hover:shadow-card-hover transition-all group block">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center flex-shrink-0">
                    <FolderKanban size={19} className="text-brand-600" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-400">{p.project_code}</p>
                    <span className={`badge mt-0.5 ${badgeForStatus(p.status)}`}>{titleCase(p.status) || '—'}</span>
                  </div>
                </div>
                {p.business_unit && (
                  <span className="text-xs font-semibold text-slate-400 bg-surface-100 px-2 py-1 rounded-lg">{p.business_unit}</span>
                )}
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
                <Link to={`/work-structure/${p.id}`} className="flex items-center gap-1 text-brand-600 font-semibold hover:text-brand-700">
                  <Sun size={12} />Work Structure<ChevronRight size={12} />
                </Link>
              </div>

              <Link
                to={`/projects/${p.id}/sites`}
                className="mt-3 flex items-center justify-between w-full text-xs font-semibold text-brand-600 hover:text-brand-700 bg-brand-50 border border-brand-100 rounded-lg px-3 py-2 transition-colors hover:bg-brand-100"
              >
                Sites &amp; assessment
                <ChevronRight size={13} />
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
