import React, { useState, useEffect, useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronLeft, Loader2, FileText, Upload, AlertTriangle, CheckCircle2 } from 'lucide-react'
import api from '../../services/api'

const STATUS_META = {
  cleared:  { badge: 'badge-green', label: 'Cleared' },
  uploaded: { badge: 'badge-amber', label: 'Awaiting sign-off' },
  rejected: { badge: 'badge-red',   label: 'Rejected' },
  pending:  { badge: 'badge-slate', label: 'Pending' },
}

const rowTone = (item) => {
  if (item.status === 'cleared') return ''
  if (!item.is_mandatory) return ''
  if (item.status === 'pending') return 'bg-red-50/60'
  return 'bg-amber-50/60'
}

const fmtMw = (v) => (v === '' || v === null || v === undefined ? '—' : `${Number(v).toFixed(2)} MWp`)
const today = () => new Date().toISOString().slice(0, 10)

export default function SiteAssessment() {
  const { projectId, siteId } = useParams()
  const [site, setSite] = useState(null)
  const [project, setProject] = useState(null)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(null)
  const [editing, setEditing] = useState(null)
  const [draft, setDraft] = useState({ fileName: '', signedBy: '', verifiedBy: '' })

  const load = useCallback(() => {
    let active = true
    setLoading(true)
    api.get(`/sites/${siteId}/`)
      .then(res => {
        if (!active) return
        setSite(res.data.site || null)
        setProject(res.data.project || null)
        setRows(res.data.assessments || [])
      })
      .catch(() => { if (active) setError('Could not load this site.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [siteId])

  useEffect(() => load(), [load])

  const openEditor = (item) => {
    setEditing(item.id)
    setDraft({
      fileName: item.file_name || '',
      signedBy: item.signed_by || '',
      verifiedBy: item.verified_by || '',
    })
  }

  const submitRow = (item, status) => {
    setSaving(item.id)
    setError('')
    api.post(`/site-assessments/${item.id}/update/`, {
      fileName: draft.fileName,
      signedBy: draft.signedBy,
      verifiedBy: draft.verifiedBy,
      signedOn: draft.signedBy ? today() : '',
      verifiedOn: draft.verifiedBy ? today() : '',
      status,
    })
      .then(res => {
        setRows(prev => prev.map(r => (r.id === item.id ? res.data.assessment : r)))
        setSite(res.data.site)
        setEditing(null)
      })
      .catch(err => {
        const msg = err.response?.data?.error
        setError(Array.isArray(msg) ? msg.join(', ') : (msg || 'Could not save that document.'))
      })
      .finally(() => setSaving(null))
  }

  const mandatoryTotal = site?.mandatory_total || 0
  const mandatoryDone = site?.mandatory_cleared || 0
  const outstanding = mandatoryTotal - mandatoryDone
  const cleared = site?.status === 'cleared'

  return (
    <div className="space-y-6 pb-4">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <Link to={`/projects/${projectId}/sites`} className="btn-secondary !px-2"><ChevronLeft size={16} /></Link>
          <div>
            <h2 className="page-title">{site ? `${site.site_code} · ${site.site_name}` : 'Site assessment'}</h2>
            <p className="page-subtitle">
              {project?.project_name}{project?.project_code ? ` · ${project.project_code}` : ''}
            </p>
          </div>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-slate-500 py-16 justify-center">
          <Loader2 size={16} className="animate-spin" />Loading assessment…
        </div>
      )}
      {!loading && error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>
      )}

      {!loading && site && (
        <>
          {/* Site header */}
          <div className="card p-6 flex flex-col xl:flex-row gap-6">
            <div className="flex-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h3 className="text-lg font-bold text-slate-900">{site.site_name}</h3>
                <span className="badge badge-blue">{site.site_code}</span>
                <span className={`badge ${cleared ? 'badge-green' : site.status === 'in_review' ? 'badge-amber' : 'badge-slate'}`}>
                  {cleared ? 'Cleared' : site.status === 'in_review' ? 'In review' : 'Not started'}
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-5 mt-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Capacity</p>
                  <p className="font-semibold mt-1 tabular-nums">{fmtMw(site.capacity_mw)}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Land area</p>
                  <p className="font-semibold mt-1 tabular-nums">
                    {site.land_area_acres ? `${site.land_area_acres} acres` : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Land title</p>
                  <p className="font-semibold mt-1">{site.land_title_display || '—'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Khasra no.</p>
                  <p className="font-semibold mt-1 tabular-nums">{site.khasra_numbers || '—'}</p>
                </div>
              </div>
            </div>
            <div className="xl:w-60 bg-surface-50 border border-surface-200 rounded-xl p-4 flex-shrink-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Assessment progress</p>
              <div className="flex items-baseline gap-1.5 mt-2">
                <span className={`text-3xl font-bold leading-none ${cleared ? 'text-green-600' : 'text-amber-600'}`}>
                  {mandatoryDone}
                </span>
                <span className="text-sm text-slate-500">of {mandatoryTotal} mandatory</span>
              </div>
              <div className="h-1.5 bg-surface-200 rounded-full mt-3 overflow-hidden">
                <div
                  className={`h-full rounded-full ${cleared ? 'bg-green-500' : 'bg-amber-500'}`}
                  style={{ width: `${mandatoryTotal ? (mandatoryDone / mandatoryTotal) * 100 : 0}%` }}
                />
              </div>
              <p className="text-xs text-slate-500 mt-2.5 leading-relaxed">
                {cleared
                  ? 'This site is released for execution.'
                  : 'Site stays locked for execution until all mandatory documents clear.'}
              </p>
            </div>
          </div>

          {/* Document checklist */}
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-surface-200 flex items-center gap-3">
              <h3 className="font-semibold text-slate-900">Pre-execution assessment</h3>
              {outstanding > 0 && <span className="badge badge-red">{outstanding} outstanding</span>}
            </div>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Document</th>
                    <th>File</th>
                    <th>Signed by</th>
                    <th>Verified</th>
                    <th>Status</th>
                    <th className="!text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(item => {
                    const meta = STATUS_META[item.status] || STATUS_META.pending
                    const isEditing = editing === item.id
                    return (
                      <React.Fragment key={item.id}>
                        <tr className={rowTone(item)}>
                          <td>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-slate-900">{item.label}</span>
                              {!item.is_mandatory && (
                                <span className="text-[10px] font-semibold text-slate-500 bg-surface-100 px-1.5 py-0.5 rounded">OPTIONAL</span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {item.hint}{item.is_mandatory ? ' · mandatory' : ''}
                            </p>
                          </td>
                          <td>
                            {item.file_name
                              ? <span className="flex items-center gap-1.5 text-brand-600 font-medium"><FileText size={13} />{item.file_name}</span>
                              : <span className="text-slate-400">Not uploaded</span>}
                          </td>
                          <td>{item.signed_by || <span className="text-slate-400">—</span>}</td>
                          <td>{item.verified_by || <span className="text-slate-400">—</span>}</td>
                          <td><span className={`badge ${meta.badge}`}>{meta.label}</span></td>
                          <td className="!text-right">
                            <button
                              type="button"
                              onClick={() => (isEditing ? setEditing(null) : openEditor(item))}
                              className="text-xs font-semibold text-brand-600 hover:text-brand-700"
                            >
                              {isEditing ? 'Close' : 'Record'}
                            </button>
                          </td>
                        </tr>
                        {isEditing && (
                          <tr className="bg-surface-50">
                            <td colSpan={6} className="!py-4">
                              <div className="flex flex-wrap items-end gap-3">
                                <div className="flex-1 min-w-[180px]">
                                  <label className="form-label" htmlFor={`f-${item.id}`}>Document file name</label>
                                  <input
                                    id={`f-${item.id}`} type="text" className="form-input"
                                    placeholder="e.g. SCR-002.pdf" value={draft.fileName}
                                    onChange={e => setDraft(d => ({ ...d, fileName: e.target.value }))}
                                  />
                                </div>
                                <div className="flex-1 min-w-[180px]">
                                  <label className="form-label" htmlFor={`s-${item.id}`}>Signed by</label>
                                  <input
                                    id={`s-${item.id}`} type="text" className="form-input"
                                    placeholder="Client / owner / authority" value={draft.signedBy}
                                    onChange={e => setDraft(d => ({ ...d, signedBy: e.target.value }))}
                                  />
                                </div>
                                <div className="flex-1 min-w-[180px]">
                                  <label className="form-label" htmlFor={`v-${item.id}`}>Verified by</label>
                                  <input
                                    id={`v-${item.id}`} type="text" className="form-input"
                                    placeholder="Our engineer" value={draft.verifiedBy}
                                    onChange={e => setDraft(d => ({ ...d, verifiedBy: e.target.value }))}
                                  />
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button" disabled={saving === item.id}
                                    onClick={() => submitRow(item, 'uploaded')}
                                    className="btn-secondary"
                                  >
                                    <Upload size={13} />Save
                                  </button>
                                  <button
                                    type="button"
                                    disabled={saving === item.id || !draft.signedBy || !draft.verifiedBy}
                                    onClick={() => submitRow(item, 'cleared')}
                                    className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
                                  >
                                    {saving === item.id ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                                    Clear
                                  </button>
                                </div>
                              </div>
                              <p className="text-xs text-slate-500 mt-2">
                                A document can only be cleared once both a signatory and a verifier are on record.
                              </p>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className={`px-5 py-4 border-t border-surface-200 flex items-center gap-3 ${
              cleared ? 'bg-green-50' : 'bg-amber-50'
            }`}>
              {cleared
                ? <CheckCircle2 size={16} className="text-green-600 flex-shrink-0" />
                : <AlertTriangle size={16} className="text-amber-600 flex-shrink-0" />}
              <span className={`text-sm ${cleared ? 'text-green-900' : 'text-amber-900'}`}>
                {cleared
                  ? 'All mandatory documents cleared — this site is released for execution.'
                  : `${outstanding} mandatory document${outstanding === 1 ? '' : 's'} outstanding — this site cannot be released for execution.`}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
