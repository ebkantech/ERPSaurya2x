import React, { useState, useEffect } from 'react'
import {
  Inbox, Loader2, FolderKanban, Plus, ChevronRight, ChevronDown, Hash, Trash2, Package,
} from 'lucide-react'
import api from '../../services/api'

const grnBadge = { received: 'badge-blue', verified: 'badge-green', rejected: 'badge-red' }
const condBadge = { ok: 'badge-green', damaged: 'badge-red', short: 'badge-amber' }
const CONDITIONS = [['ok', 'OK'], ['damaged', 'Damaged'], ['short', 'Short supply']]

function Stat({ icon: Icon, label, value }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-slate-400 text-xs font-medium mb-1"><Icon size={13} />{label}</div>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
    </div>
  )
}

const emptyLine = () => ({ material_name: '', unit: 'Nos', quantity_received: '', condition: 'ok', serial_numbers: '' })

export default function GoodsReceipt() {
  const [projects, setProjects] = useState([])
  const [projectId, setProjectId] = useState('')
  const [data, setData] = useState(null)   // {grns, received_stock}
  const [sites, setSites] = useState([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [open, setOpen] = useState(null)
  const [showNew, setShowNew] = useState(false)
  const [head, setHead] = useState({ supplier: '', consignment_ref: '', received_date: '', site_id: '' })
  const [lines, setLines] = useState([emptyLine()])

  useEffect(() => { api.get('/projects/').then(r => setProjects(r.data.projects || [])).catch(() => {}) }, [])

  const load = () => {
    if (!projectId) return
    setLoading(true); setErr('')
    Promise.all([
      api.get(`/solar/projects/${projectId}/grn/`),
      api.get(`/solar/projects/${projectId}/sites/`).catch(() => ({ data: { sites: [] } })),
    ]).then(([g, s]) => { setData(g.data); setSites(s.data.sites || []) })
      .catch(() => setErr('Could not load goods receipts.'))
      .finally(() => setLoading(false))
  }
  useEffect(() => { if (projectId) load(); else { setData(null); setSites([]) } }, [projectId])

  const save = async (e) => {
    e.preventDefault(); setErr('')
    const clean = lines.filter(l => l.material_name.trim())
    if (!clean.length) { setErr('Add at least one material line.'); return }
    try {
      await api.post(`/solar/projects/${projectId}/grn/`, { ...head, lines: clean })
      setShowNew(false); setHead({ supplier: '', consignment_ref: '', received_date: '', site_id: '' }); setLines([emptyLine()])
      load()
    } catch (e2) { setErr(e2.response?.data?.error || 'Could not record GRN.') }
  }
  const setStatus = async (grn, status) => {
    setErr('')
    try { await api.post(`/solar/grn/${grn.id}/`, { status }); load() }
    catch (e2) { setErr(e2.response?.data?.error || 'Could not update.') }
  }

  const grns = data?.grns || []
  const stock = data?.received_stock || []

  return (
    <div className="space-y-6 pb-4">
      <div>
        <h2 className="page-title">Goods Receipt (GRN)</h2>
        <p className="page-subtitle">Inbound client-furnished material — modules, inverters & serials received before free-issue.</p>
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
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Stat icon={Inbox} label="Goods receipts" value={grns.length} />
            <Stat icon={Hash} label="Serials captured" value={grns.reduce((s, g) => s + (g.serial_total || 0), 0)} />
            <Stat icon={Package} label="Material lines in stock" value={stock.length} />
          </div>

          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-surface-100 flex items-center justify-between">
              <h3 className="font-semibold text-slate-900 text-sm flex items-center gap-2"><Inbox size={15} />Receipts</h3>
              <button onClick={() => setShowNew(v => !v)} className="btn-primary text-xs py-1.5"><Plus size={13} />New GRN</button>
            </div>

            {showNew && (
              <form onSubmit={save} className="p-4 bg-surface-50 border-b border-surface-100 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div><label className="form-label">Supplier (client / OEM)</label>
                    <input className="form-input" value={head.supplier} onChange={e => setHead(h => ({ ...h, supplier: e.target.value }))} /></div>
                  <div><label className="form-label">Consignment / challan no.</label>
                    <input className="form-input" value={head.consignment_ref} onChange={e => setHead(h => ({ ...h, consignment_ref: e.target.value }))} /></div>
                  <div><label className="form-label">Received date</label>
                    <input type="date" className="form-input" value={head.received_date} onChange={e => setHead(h => ({ ...h, received_date: e.target.value }))} /></div>
                  <div><label className="form-label">Site (optional)</label>
                    <select className="form-input" value={head.site_id} onChange={e => setHead(h => ({ ...h, site_id: e.target.value }))}>
                      <option value="">—</option>
                      {sites.map(s => <option key={s.id} value={s.id}>{s.site_name}</option>)}
                    </select></div>
                </div>
                <div className="space-y-2">
                  <label className="form-label">Materials received</label>
                  {lines.map((l, i) => (
                    <div key={i} className="grid grid-cols-12 gap-2 items-start">
                      <input className="form-input col-span-3" placeholder="Material" value={l.material_name} onChange={e => setLines(ls => ls.map((x, j) => j === i ? { ...x, material_name: e.target.value } : x))} />
                      <input className="form-input col-span-1" placeholder="Unit" value={l.unit} onChange={e => setLines(ls => ls.map((x, j) => j === i ? { ...x, unit: e.target.value } : x))} />
                      <input type="number" className="form-input col-span-2" placeholder="Qty" value={l.quantity_received} onChange={e => setLines(ls => ls.map((x, j) => j === i ? { ...x, quantity_received: e.target.value } : x))} />
                      <select className="form-input col-span-2" value={l.condition} onChange={e => setLines(ls => ls.map((x, j) => j === i ? { ...x, condition: e.target.value } : x))}>
                        {CONDITIONS.map(([v, lbl]) => <option key={v} value={v}>{lbl}</option>)}
                      </select>
                      <textarea className="form-input col-span-3" rows={1} placeholder="Serial numbers (one per line / comma-sep)" value={l.serial_numbers} onChange={e => setLines(ls => ls.map((x, j) => j === i ? { ...x, serial_numbers: e.target.value } : x))} />
                      <button type="button" onClick={() => setLines(ls => ls.filter((_, j) => j !== i))} className="col-span-1 text-slate-300 hover:text-red-500 pt-2"><Trash2 size={14} /></button>
                    </div>
                  ))}
                  <button type="button" onClick={() => setLines(ls => [...ls, emptyLine()])} className="text-xs text-brand-600 font-medium flex items-center gap-1"><Plus size={12} />Add line</button>
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setShowNew(false)} className="btn-secondary text-xs">Cancel</button>
                  <button type="submit" className="btn-primary text-xs">Record GRN</button>
                </div>
              </form>
            )}

            <table className="data-table">
              <thead><tr><th></th><th>GRN No.</th><th>Supplier</th><th>Consignment</th><th>Received</th><th className="text-center">Serials</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {grns.length === 0 && <tr><td colSpan={8} className="text-center text-slate-400 py-6">No goods receipts yet.</td></tr>}
                {grns.map(g => (
                  <React.Fragment key={g.id}>
                    <tr className="hover:bg-surface-50">
                      <td className="cursor-pointer" onClick={() => setOpen(open === g.id ? null : g.id)}>{open === g.id ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}</td>
                      <td className="font-mono text-xs font-semibold text-slate-700">{g.grn_no}</td>
                      <td className="text-slate-600">{g.supplier || '—'}</td>
                      <td className="text-xs text-slate-500">{g.consignment_ref || '—'}</td>
                      <td className="text-xs text-slate-400">{g.received_date || '—'}</td>
                      <td className="text-center">{g.serial_total || 0}</td>
                      <td><span className={`badge ${grnBadge[g.status] || 'badge-slate'}`}>{g.status_display}</span></td>
                      <td className="text-right">
                        {g.status === 'received' && <button onClick={() => setStatus(g, 'verified')} className="text-xs text-green-600 hover:text-green-700 font-semibold">Verify</button>}
                      </td>
                    </tr>
                    {open === g.id && (
                      <tr><td colSpan={8} className="bg-surface-50/60 p-0">
                        <div className="px-6 py-4">
                          <table className="w-full text-sm">
                            <thead><tr className="text-xs text-slate-400 text-left"><th className="py-1">Material</th><th>Unit</th><th className="text-right">Qty</th><th>Condition</th><th className="text-center">Serials</th></tr></thead>
                            <tbody>
                              {g.lines.map(l => (
                                <tr key={l.id} className="border-t border-surface-100 align-top">
                                  <td className="py-2 text-slate-700">{l.material_name}</td>
                                  <td>{l.unit}</td>
                                  <td className="text-right">{l.quantity_received}</td>
                                  <td><span className={`badge ${condBadge[l.condition] || 'badge-slate'} text-xs`}>{l.condition_display}</span></td>
                                  <td className="text-center text-xs text-slate-500" title={l.serial_numbers}>{l.serial_count}</td>
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

          {/* received stock pool */}
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-surface-100"><h3 className="font-semibold text-slate-900 text-sm">Received stock (available to free-issue)</h3></div>
            <table className="data-table">
              <thead><tr><th>Material</th><th className="text-right">Quantity received (OK)</th></tr></thead>
              <tbody>
                {stock.length === 0 && <tr><td colSpan={2} className="text-center text-slate-400 py-6">Nothing received yet.</td></tr>}
                {stock.map((s, i) => <tr key={i}><td className="text-slate-700">{s.material_name}</td><td className="text-right font-semibold text-slate-700">{s.quantity}</td></tr>)}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
