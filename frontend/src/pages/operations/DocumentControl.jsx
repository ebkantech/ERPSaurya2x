import React, { useState, useEffect } from 'react'
import {
  FileText, Loader2, FolderKanban, FileStack, CheckCircle2, Clock,
  Plus, ChevronRight, ChevronDown, Stamp, ShieldCheck,
} from 'lucide-react'
import api from '../../services/api'

const DISCIPLINES = [
  ['general', 'General'], ['civil', 'Civil'], ['structural', 'Structural'],
  ['electrical', 'Electrical'], ['layout', 'Layout / PV'],
]
const CATEGORIES = [
  ['cad_drawing', 'CAD Drawing'], ['pvsyst_layout', 'PVsyst Layout'], ['sld', 'SLD'],
  ['datasheet', 'Datasheet'], ['statutory', 'Statutory'], ['other', 'Other'],
]
const docBadge = {
  draft: 'badge-slate', in_review: 'badge-amber', approved: 'badge-green',
  for_discom: 'badge-blue', superseded: 'badge-slate',
}
const revBadge = {
  draft: 'badge-slate', submitted: 'badge-amber', approved: 'badge-green',
  rejected: 'badge-red', superseded: 'badge-slate',
}
const apprBadge = {
  pending: 'badge-slate', submitted: 'badge-amber', approved: 'badge-green',
  rejected: 'badge-red', resubmit: 'badge-amber',
}

function Stat({ icon: Icon, label, value, tone = 'text-slate-900' }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-slate-400 text-xs font-medium mb-1"><Icon size={13} />{label}</div>
      <p className={`text-2xl font-bold ${tone}`}>{value}</p>
    </div>
  )
}

export default function DocumentControl() {
  const [projects, setProjects] = useState([])
  const [projectId, setProjectId] = useState('')
  const [docs, setDocs] = useState([])
  const [approvals, setApprovals] = useState([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [openDoc, setOpenDoc] = useState(null)
  const [showNewDoc, setShowNewDoc] = useState(false)
  const [newDoc, setNewDoc] = useState({ doc_no: '', title: '', discipline: 'electrical', category: 'sld', change_note: 'Initial issue' })
  const [showNewAppr, setShowNewAppr] = useState(false)
  const [newAppr, setNewAppr] = useState({ authority: '', approval_type: '', reference_no: '', status: 'pending' })

  useEffect(() => {
    api.get('/projects/').then(res => setProjects(res.data.projects || [])).catch(() => setProjects([]))
  }, [])

  const load = () => {
    if (!projectId) return
    setLoading(true); setErr('')
    Promise.all([
      api.get(`/solar/projects/${projectId}/documents/`),
      api.get(`/solar/projects/${projectId}/approvals/`),
    ]).then(([d, a]) => { setDocs(d.data.documents || []); setApprovals(a.data.approvals || []) })
      .catch(() => setErr('Could not load documents.'))
      .finally(() => setLoading(false))
  }
  useEffect(() => { if (projectId) load(); else { setDocs([]); setApprovals([]) } }, [projectId])

  const createDoc = async (e) => {
    e.preventDefault(); setErr('')
    try {
      await api.post(`/solar/projects/${projectId}/documents/`, newDoc)
      setShowNewDoc(false)
      setNewDoc({ doc_no: '', title: '', discipline: 'electrical', category: 'sld', change_note: 'Initial issue' })
      load()
    } catch (e2) { setErr(e2.response?.data?.error || 'Could not create document.') }
  }
  const addRevision = async (doc) => {
    const note = window.prompt(`New revision of ${doc.doc_no} — change note:`, 'Review comments incorporated')
    if (note === null) return
    setErr('')
    try { await api.post(`/solar/documents/${doc.id}/revisions/`, { change_note: note }); load() }
    catch (e2) { setErr(e2.response?.data?.error || 'Could not add revision.') }
  }
  const setRevStatus = async (rev, status) => {
    setErr('')
    try { await api.post(`/solar/revisions/${rev.id}/`, { status }); load() }
    catch (e2) { setErr(e2.response?.data?.error || 'Could not update revision.') }
  }
  const createAppr = async (e) => {
    e.preventDefault(); setErr('')
    try {
      await api.post(`/solar/projects/${projectId}/approvals/`, newAppr)
      setShowNewAppr(false)
      setNewAppr({ authority: '', approval_type: '', reference_no: '', status: 'pending' })
      load()
    } catch (e2) { setErr(e2.response?.data?.error || 'Could not record approval.') }
  }

  const approvedCount = docs.filter(d => d.status === 'approved').length
  const inReview = docs.filter(d => ['in_review', 'for_discom'].includes(d.status)).length

  return (
    <div className="space-y-6 pb-4">
      <div>
        <h2 className="page-title">Engineering & Document Management</h2>
        <p className="page-subtitle">CAD drawings, PVsyst layouts, SLDs & datasheets — with revision control and DISCOM/statutory approvals</p>
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat icon={FileStack} label="Documents" value={docs.length} />
            <Stat icon={CheckCircle2} label="Approved" value={approvedCount} tone="text-green-600" />
            <Stat icon={Clock} label="In review / DISCOM" value={inReview} tone="text-amber-600" />
            <Stat icon={Stamp} label="Statutory approvals" value={approvals.length} />
          </div>

          {/* Documents */}
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-surface-100 flex items-center justify-between">
              <h3 className="font-semibold text-slate-900 text-sm flex items-center gap-2"><FileText size={15} />Document Register</h3>
              <button onClick={() => setShowNewDoc(v => !v)} className="btn-primary text-xs py-1.5"><Plus size={13} />New document</button>
            </div>

            {showNewDoc && (
              <form onSubmit={createDoc} className="p-4 bg-surface-50 border-b border-surface-100 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div><label className="form-label">Document no.</label>
                  <input className="form-input" required value={newDoc.doc_no} onChange={e => setNewDoc(d => ({ ...d, doc_no: e.target.value }))} placeholder="e.g. SLD-5MW-001" /></div>
                <div><label className="form-label">Title</label>
                  <input className="form-input" required value={newDoc.title} onChange={e => setNewDoc(d => ({ ...d, title: e.target.value }))} placeholder="e.g. Main Single Line Diagram" /></div>
                <div><label className="form-label">Discipline</label>
                  <select className="form-input" value={newDoc.discipline} onChange={e => setNewDoc(d => ({ ...d, discipline: e.target.value }))}>
                    {DISCIPLINES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
                <div><label className="form-label">Category</label>
                  <select className="form-input" value={newDoc.category} onChange={e => setNewDoc(d => ({ ...d, category: e.target.value }))}>
                    {CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
                <div className="md:col-span-2 flex justify-end gap-2">
                  <button type="button" onClick={() => setShowNewDoc(false)} className="btn-secondary text-xs">Cancel</button>
                  <button type="submit" className="btn-primary text-xs"><Plus size={13} />Create (R0)</button>
                </div>
              </form>
            )}

            <table className="data-table">
              <thead><tr><th></th><th>Doc No.</th><th>Title</th><th>Discipline</th><th>Category</th><th className="text-center">Rev</th><th>Status</th></tr></thead>
              <tbody>
                {docs.length === 0 && <tr><td colSpan={7} className="text-center text-slate-400 py-6">No documents yet.</td></tr>}
                {docs.map(d => (
                  <React.Fragment key={d.id}>
                    <tr className="cursor-pointer hover:bg-surface-50" onClick={() => setOpenDoc(openDoc === d.id ? null : d.id)}>
                      <td>{openDoc === d.id ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}</td>
                      <td className="font-mono text-xs font-semibold text-slate-700">{d.doc_no}</td>
                      <td className="text-slate-700">{d.title}</td>
                      <td className="text-xs">{d.discipline_display}</td>
                      <td className="text-xs text-slate-500">{d.category_display}</td>
                      <td className="text-center"><span className="badge badge-slate">{d.current_rev || '—'}</span></td>
                      <td><span className={`badge ${docBadge[d.status] || 'badge-slate'}`}>{d.status_display}</span></td>
                    </tr>
                    {openDoc === d.id && (
                      <tr><td colSpan={7} className="bg-surface-50/60 p-0">
                        <div className="px-6 py-4">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Revision history</h4>
                            <button onClick={() => addRevision(d)} className="btn-secondary text-xs py-1"><Plus size={12} />Add revision</button>
                          </div>
                          <table className="w-full text-sm">
                            <thead><tr className="text-xs text-slate-400 text-left"><th className="py-1">Rev</th><th>Change note</th><th>Prepared by</th><th>Status</th><th>Approved</th><th></th></tr></thead>
                            <tbody>
                              {d.revisions.map(r => (
                                <tr key={r.id} className="border-t border-surface-100">
                                  <td className="py-2 font-mono font-semibold text-slate-700">{r.rev_no}</td>
                                  <td className="text-slate-600 text-xs max-w-[280px]">{r.change_note || '—'}</td>
                                  <td className="text-xs text-slate-500">{r.prepared_by || '—'}</td>
                                  <td><span className={`badge ${revBadge[r.status] || 'badge-slate'}`}>{r.status_display}</span></td>
                                  <td className="text-xs text-slate-400">{r.approved_on || '—'}</td>
                                  <td className="text-right">
                                    {r.rev_no === d.current_rev && r.status !== 'approved' && (
                                      <span className="flex items-center justify-end gap-2">
                                        <button onClick={() => setRevStatus(r, 'approved')} className="text-xs text-green-600 hover:text-green-700 font-semibold">Approve</button>
                                        <button onClick={() => setRevStatus(r, 'rejected')} className="text-xs text-red-500 hover:text-red-600 font-semibold">Reject</button>
                                      </span>
                                    )}
                                  </td>
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

          {/* Statutory / DISCOM approvals */}
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-surface-100 flex items-center justify-between">
              <h3 className="font-semibold text-slate-900 text-sm flex items-center gap-2"><ShieldCheck size={15} />Statutory / DISCOM Approvals</h3>
              <button onClick={() => setShowNewAppr(v => !v)} className="btn-secondary text-xs py-1.5"><Plus size={13} />Record approval</button>
            </div>
            {showNewAppr && (
              <form onSubmit={createAppr} className="p-4 bg-surface-50 border-b border-surface-100 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div><label className="form-label">Authority</label>
                  <input className="form-input" required value={newAppr.authority} onChange={e => setNewAppr(a => ({ ...a, authority: e.target.value }))} placeholder="e.g. DISCOM (JVVNL) / CEIG" /></div>
                <div><label className="form-label">Approval type</label>
                  <input className="form-input" required value={newAppr.approval_type} onChange={e => setNewAppr(a => ({ ...a, approval_type: e.target.value }))} placeholder="e.g. Feeder approval" /></div>
                <div><label className="form-label">Reference no.</label>
                  <input className="form-input" value={newAppr.reference_no} onChange={e => setNewAppr(a => ({ ...a, reference_no: e.target.value }))} /></div>
                <div><label className="form-label">Status</label>
                  <select className="form-input" value={newAppr.status} onChange={e => setNewAppr(a => ({ ...a, status: e.target.value }))}>
                    {Object.keys(apprBadge).map(s => <option key={s} value={s}>{s}</option>)}</select></div>
                <div className="md:col-span-2 flex justify-end gap-2">
                  <button type="button" onClick={() => setShowNewAppr(false)} className="btn-secondary text-xs">Cancel</button>
                  <button type="submit" className="btn-primary text-xs">Save</button>
                </div>
              </form>
            )}
            <table className="data-table">
              <thead><tr><th>Authority</th><th>Approval</th><th>Reference</th><th>Submitted</th><th>Status</th></tr></thead>
              <tbody>
                {approvals.length === 0 && <tr><td colSpan={5} className="text-center text-slate-400 py-6">No approvals recorded.</td></tr>}
                {approvals.map(a => (
                  <tr key={a.id}>
                    <td className="font-semibold text-slate-700">{a.authority}</td>
                    <td className="text-slate-600">{a.approval_type}</td>
                    <td className="font-mono text-xs text-slate-400">{a.reference_no || '—'}</td>
                    <td className="text-xs text-slate-400">{a.submitted_date || '—'}</td>
                    <td><span className={`badge ${apprBadge[a.status] || 'badge-slate'}`}>{a.status_display}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {projectId && !loading && docs.length === 0 && approvals.length === 0 && (
        <p className="text-xs text-slate-400 italic">Tip: create your first document above — it starts at revision R0.</p>
      )}
    </div>
  )
}
