import React, { useState, useEffect } from 'react'
import {
  Archive, Loader2, FolderKanban, Download, FileCheck, ShieldCheck, ClipboardCheck,
  Hash, Award, MapPin, CheckCircle2, AlertTriangle,
} from 'lucide-react'
import api from '../../services/api'

function Stat({ icon: Icon, label, value, tone = 'text-slate-900' }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-slate-400 text-xs font-medium mb-1"><Icon size={13} />{label}</div>
      <p className={`text-2xl font-bold ${tone}`}>{value}</p>
    </div>
  )
}

function Section({ icon: Icon, title, children, count }) {
  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-3 border-b border-surface-100 flex items-center gap-2">
        <Icon size={15} className="text-slate-400" />
        <h3 className="font-semibold text-slate-900 text-sm">{title}</h3>
        {count !== undefined && <span className="badge badge-slate text-xs ml-auto">{count}</span>}
      </div>
      <div className="p-4 text-sm">{children}</div>
    </div>
  )
}

export default function HandoverDossier() {
  const [projects, setProjects] = useState([])
  const [projectId, setProjectId] = useState('')
  const [m, setM] = useState(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => { api.get('/projects/').then(r => setProjects(r.data.projects || [])).catch(() => {}) }, [])

  useEffect(() => {
    if (!projectId) { setM(null); return }
    setLoading(true); setErr('')
    api.get(`/solar/projects/${projectId}/dossier/`)
      .then(r => setM(r.data)).catch(() => setErr('Could not load dossier.'))
      .finally(() => setLoading(false))
  }, [projectId])

  const download = async () => {
    try {
      const res = await api.get(`/solar/projects/${projectId}/dossier/download/`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = `dossier_${m?.project?.code || projectId}.zip`
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
    } catch { setErr('Could not download the dossier.') }
  }

  const c = m?.counts || {}

  return (
    <div className="space-y-6 pb-4">
      <div>
        <h2 className="page-title">As-Built Handover Dossier</h2>
        <p className="page-subtitle">The project close-out pack — approved drawings, NOCs, QA, serials, warranties & certificates, ready to download.</p>
      </div>

      <div className="card p-4 flex items-center gap-3">
        <FolderKanban size={16} className="text-slate-400" />
        <select value={projectId} onChange={e => setProjectId(e.target.value)} className="form-input max-w-sm">
          <option value="">Select a project…</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.project_code ? `${p.project_code} — ` : ''}{p.project_name}</option>)}
        </select>
        {loading && <Loader2 size={16} className="animate-spin text-brand-500" />}
        {m && <button onClick={download} className="btn-primary ml-auto"><Download size={14} />Download dossier (.zip)</button>}
      </div>

      {err && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{err}</div>}

      {projectId && !loading && m && (
        <>
          <div className={`rounded-lg px-4 py-3 text-sm flex items-center gap-2 ${m.ready ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-amber-50 border border-amber-200 text-amber-800'}`}>
            {m.ready ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            {m.ready ? 'Dossier is complete — all key sections present.' : 'Dossier incomplete — need approved drawings, no open punch items, and a handover certificate.'}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat icon={FileCheck} label="As-built docs" value={c.documents_approved || 0} />
            <Stat icon={ShieldCheck} label="NOCs approved" value={c.nocs_approved || 0} />
            <Stat icon={Hash} label="Serials mapped" value={c.serials || 0} />
            <Stat icon={ClipboardCheck} label="Punch open" value={`${c.punch_open || 0}/${c.punch_total || 0}`} tone={c.punch_open ? 'text-amber-600' : 'text-green-600'} />
          </div>

          <Section icon={FileCheck} title="As-built documents" count={m.documents.length}>
            {m.documents.length === 0 ? <p className="text-slate-400">No approved documents yet.</p> :
              <ul className="space-y-1">{m.documents.map((d, i) => <li key={i} className="text-slate-700"><span className="font-mono text-xs font-semibold">{d.doc_no}</span> — {d.title} <span className="text-xs text-slate-400">[{d.discipline}] rev {d.revision}</span></li>)}</ul>}
          </Section>

          <Section icon={ShieldCheck} title="Statutory / NOC approvals" count={m.approvals.length}>
            {m.approvals.length === 0 ? <p className="text-slate-400">None recorded.</p> :
              <ul className="space-y-1">{m.approvals.map((a, i) => <li key={i} className="text-slate-700">{a.authority} · {a.approval_type} {a.site && <span className="text-xs text-slate-400">@ {a.site}</span>} <span className="badge badge-slate text-xs ml-1">{a.status}</span></li>)}</ul>}
          </Section>

          <Section icon={Hash} title="Module / inverter serial mapping" count={c.serials || 0}>
            {m.serial_mapping.length === 0 ? <p className="text-slate-400">No serials captured — record them via Goods Receipt (GRN).</p> :
              <ul className="space-y-1">{m.serial_mapping.map((s, i) => <li key={i} className="text-slate-700">{s.material} <span className="text-xs text-slate-400">({s.grn_no})</span> — <span className="font-semibold">{s.count}</span> serials</li>)}</ul>}
          </Section>

          <Section icon={Award} title="Handover certificates" count={m.certificates.length}>
            {m.certificates.length === 0 ? <p className="text-slate-400">No certificates issued.</p> :
              <ul className="space-y-1">{m.certificates.map((c2, i) => <li key={i} className="text-slate-700">{c2.certificate_number} — {c2.vendor} @ {c2.site_name} <span className="badge badge-slate text-xs ml-1">{c2.status}</span></li>)}</ul>}
          </Section>

          <Section icon={MapPin} title="Sites / locations" count={m.sites.length}>
            {m.sites.length === 0 ? <p className="text-slate-400">No sites.</p> :
              <ul className="space-y-1">{m.sites.map((s, i) => <li key={i} className="text-slate-700">{s.site_name} {s.location && <span className="text-xs text-slate-400">({s.location})</span>} — {s.capacity_mw} MW <span className="badge badge-slate text-xs ml-1">{s.status}</span></li>)}</ul>}
          </Section>
        </>
      )}
    </div>
  )
}
