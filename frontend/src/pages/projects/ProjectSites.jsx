import React, { useState, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  Plus, Lock, Unlock, MapPin, ChevronLeft, Loader2, CheckCircle2, AlertTriangle,
} from 'lucide-react'
import api from '../../services/api'

const badgeForSite = (status) => {
  if (status === 'cleared') return 'badge-green'
  if (status === 'in_review') return 'badge-amber'
  return 'badge-slate'
}

const labelForSite = (status) => {
  if (status === 'cleared') return 'Cleared'
  if (status === 'in_review') return 'In review'
  return 'Not started'
}

const fmtMw = (v) => (v === '' || v === null || v === undefined ? '—' : `${Number(v).toFixed(2)} MW`)

export default function ProjectSites() {
  const { projectId } = useParams()
  const [project, setProject] = useState(null)
  const [sites, setSites] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    api.get(`/projects/${projectId}/sites/`)
      .then(res => {
        if (!active) return
        setProject(res.data.project || null)
        setSites(res.data.sites || [])
        setSummary(res.data.summary || null)
      })
      .catch(() => { if (active) setError('Could not load sites for this project.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [projectId])

  const unlocked = summary?.execution_unlocked

  return (
    <div className="space-y-6 pb-4">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <Link to="/projects" className="btn-secondary !px-2"><ChevronLeft size={16} /></Link>
          <div>
            <h2 className="page-title">{project?.project_name || 'Project sites'}</h2>
            <p className="page-subtitle">
              {project?.project_code}
              {summary ? ` · ${summary.site_count} site${summary.site_count === 1 ? '' : 's'}` : ''}
              {project?.client_name ? ` · ${project.client_name}` : ''}
            </p>
          </div>
        </div>
        <Link to={`/projects/${projectId}/sites/new`} className="btn-primary">
          <Plus size={14} />Register Site
        </Link>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-slate-500 py-16 justify-center">
          <Loader2 size={16} className="animate-spin" />Loading sites…
        </div>
      )}
      {!loading && error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>
      )}

      {!loading && !error && (
        <>
          {/* Execution gate */}
          {summary && summary.site_count > 0 && (
            <div className={`rounded-xl border px-5 py-4 flex items-center gap-4 ${
              unlocked ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'
            }`}>
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                unlocked ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
              }`}>
                {unlocked ? <Unlock size={18} /> : <Lock size={18} />}
              </div>
              <div className="flex-1">
                <p className={`text-sm font-semibold ${unlocked ? 'text-green-900' : 'text-amber-900'}`}>
                  {unlocked
                    ? 'Execution unlocked — every site has cleared assessment'
                    : `Execution locked — ${summary.cleared_sites} of ${summary.site_count} sites have cleared assessment`}
                </p>
                <p className={`text-xs mt-1 ${unlocked ? 'text-green-700' : 'text-amber-700'}`}>
                  {unlocked
                    ? 'Milestones, purchase orders and crew assignment are available for this project.'
                    : 'Milestones, purchase orders and crew assignment stay disabled until every registered site clears its mandatory documents.'}
                </p>
              </div>
              {!unlocked && summary.pending_documents > 0 && (
                <span className="badge badge-red">{summary.pending_documents} documents pending</span>
              )}
            </div>
          )}

          {/* Capacity roll-up */}
          {summary && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              <div className="card p-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Registered sites</p>
                <p className="text-2xl font-bold mt-1.5">{summary.site_count}</p>
              </div>
              <div className="card p-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Capacity allocated</p>
                <p className="text-2xl font-bold mt-1.5">{fmtMw(summary.allocated_mw)}</p>
                <div className="h-1.5 bg-surface-100 rounded-full mt-2.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${summary.capacity_exceeded ? 'bg-red-500' : 'bg-green-500'}`}
                    style={{
                      width: `${Math.min(100, (Number(summary.allocated_mw) / Math.max(1, Number(summary.sanctioned_mw))) * 100)}%`,
                    }}
                  />
                </div>
                <p className={`text-xs mt-1.5 font-medium ${
                  summary.capacity_exceeded ? 'text-red-600' : summary.capacity_balanced ? 'text-green-600' : 'text-slate-500'
                }`}>
                  {summary.capacity_exceeded
                    ? `Exceeds sanctioned ${fmtMw(summary.sanctioned_mw)}`
                    : summary.capacity_balanced
                      ? `Matches sanctioned ${fmtMw(summary.sanctioned_mw)}`
                      : `${fmtMw(summary.remaining_mw)} still unallocated`}
                </p>
              </div>
              <div className="card p-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Assessment cleared</p>
                <p className="text-2xl font-bold mt-1.5 text-green-600">
                  {summary.cleared_sites} <span className="text-sm font-medium text-slate-500">of {summary.site_count}</span>
                </p>
                <p className="text-xs text-slate-500 mt-1.5">{fmtMw(summary.cleared_mw)} ready to execute</p>
              </div>
              <div className="card p-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Documents pending</p>
                <p className={`text-2xl font-bold mt-1.5 ${summary.pending_documents ? 'text-amber-600' : 'text-green-600'}`}>
                  {summary.pending_documents}
                </p>
                <p className="text-xs text-slate-500 mt-1.5">Mandatory rows not yet cleared</p>
              </div>
            </div>
          )}

          {/* Site registry */}
          {sites.length === 0 ? (
            <div className="card p-10 text-center text-sm text-slate-500">
              No sites registered yet.{' '}
              <Link to={`/projects/${projectId}/sites/new`} className="text-brand-600 font-medium">
                Register the first one →
              </Link>
            </div>
          ) : (
            <div className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-surface-200 flex items-center gap-3">
                <h3 className="font-semibold text-slate-900">Site registry</h3>
                <p className="text-xs text-slate-500">Each site carries its own number, capacity and assessment file</p>
              </div>
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Site no.</th>
                      <th>Site name</th>
                      <th>Location</th>
                      <th className="!text-right">Capacity</th>
                      <th>Land title</th>
                      <th>Assessment</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sites.map(s => {
                      const total = s.mandatory_total || 0
                      const done = s.mandatory_cleared || 0
                      const pct = total ? (done / total) * 100 : 0
                      return (
                        <tr key={s.id}>
                          <td>
                            <Link to={`/projects/${projectId}/sites/${s.id}`} className="font-semibold text-brand-600 hover:text-brand-700">
                              {s.site_code}
                            </Link>
                          </td>
                          <td className="font-medium text-slate-900">{s.site_name}</td>
                          <td>
                            {s.location
                              ? <span className="flex items-center gap-1.5 text-slate-600"><MapPin size={12} className="text-slate-400" />{s.location}</span>
                              : <span className="text-slate-400">—</span>}
                          </td>
                          <td className="text-right font-semibold tabular-nums">{fmtMw(s.capacity_mw)}</td>
                          <td className="text-slate-600">{s.land_title_display || <span className="text-slate-400">Not recorded</span>}</td>
                          <td>
                            <div className="flex items-center gap-2">
                              <div className="w-14 h-1.5 bg-surface-100 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${done >= total && total ? 'bg-green-500' : 'bg-amber-500'}`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <span className="text-xs text-slate-500 tabular-nums">{done}/{total}</span>
                            </div>
                          </td>
                          <td><span className={`badge ${badgeForSite(s.status)}`}>{labelForSite(s.status)}</span></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {summary && (
                <div className="px-5 py-3 bg-surface-50 border-t border-surface-200 flex items-center gap-2 text-xs">
                  <span className="text-slate-500">Total allocated</span>
                  <span className="font-bold text-slate-900 tabular-nums">{fmtMw(summary.allocated_mw)}</span>
                  <span className="text-slate-400">of {fmtMw(summary.sanctioned_mw)} sanctioned</span>
                  <span className={`ml-auto flex items-center gap-1.5 font-medium ${
                    summary.capacity_exceeded ? 'text-red-600' : 'text-green-600'
                  }`}>
                    {summary.capacity_exceeded
                      ? <><AlertTriangle size={13} />Over-allocated</>
                      : <><CheckCircle2 size={13} />Capacity balanced</>}
                  </span>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
