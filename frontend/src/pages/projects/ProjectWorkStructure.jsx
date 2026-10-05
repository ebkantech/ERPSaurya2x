import React, { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  Sun, Zap, Loader2, Lock, CheckCircle2, LayoutList, Table2, Gauge,
  AlertTriangle, ArrowLeft, Sparkles, FileText, HardHat, Plus, Trash2, Unlock,
} from 'lucide-react'
import api from '../../services/api'

const STATUS_OPTIONS = [
  ['pending', 'Pending'],
  ['in_progress', 'In Progress'],
  ['completed', 'Completed'],
  ['on_hold', 'On Hold'],
  ['skipped', 'Skipped'],
]

const money = (v) => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function StatCard({ icon: Icon, label, value, sub }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-slate-400 text-xs font-medium mb-1">
        <Icon size={13} />{label}
      </div>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function GenerateForm({ projectId, project, onCreated }) {
  const [mode, setMode] = useState('rooftop')
  const [mw, setMw] = useState(project?.total_mw || '5')
  const [foundation, setFoundation] = useState('driven_pile')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      const body = { project_type: mode, ac_capacity_mw: mw }
      if (mode === 'ground_mount') body.foundation_type = foundation
      const res = await api.post(`/solar/projects/${projectId}/build/`, body)
      onCreated(res.data.build)
    } catch (err) {
      setError(err.response?.data?.error || 'Could not generate the work structure.')
    } finally { setBusy(false) }
  }

  return (
    <form onSubmit={submit} className="card p-6 max-w-xl space-y-5">
      <div className="flex items-center gap-2">
        <Sparkles size={18} className="text-brand-600" />
        <h3 className="font-semibold text-slate-900">Generate Work Structure</h3>
      </div>
      <p className="text-sm text-slate-500">
        Pick the execution mode and capacity. The engine builds the full lifecycle (WBS),
        engineering sizing and a seeded BOQ you can edit before locking.
      </p>

      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-2">Execution mode</label>
        <div className="grid grid-cols-2 gap-3">
          {[['rooftop', 'Open Roof (Rooftop)', 'On an existing building roof'],
            ['ground_mount', 'On-Site Solar EPC', 'Ground-mounted on open land']].map(([val, title, desc]) => (
            <button type="button" key={val} onClick={() => setMode(val)}
              className={`text-left p-3 rounded-xl border transition-all ${mode === val ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500' : 'border-surface-200 hover:bg-surface-50'}`}>
              <p className="text-sm font-semibold text-slate-800">{title}</p>
              <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-2">AC Capacity (MW)</label>
          <input type="number" step="0.001" min="0.1" value={mw} onChange={e => setMw(e.target.value)}
            className="w-full border border-surface-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-brand-500" required />
        </div>
        {mode === 'ground_mount' && (
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-2">Foundation</label>
            <select value={foundation} onChange={e => setFoundation(e.target.value)}
              className="w-full border border-surface-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-brand-500">
              <option value="driven_pile">Driven Pile</option>
              <option value="concrete_pedestal">Concrete Pedestal</option>
            </select>
          </div>
        )}
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}

      <button type="submit" disabled={busy} className="btn-primary">
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
        Generate Work Structure
      </button>
    </form>
  )
}

function SizingTab({ sizing }) {
  if (!sizing) return null
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <StatCard icon={Zap} label="DC Capacity" value={`${sizing.dc_capacity_mwp} MWp`} sub={`DC/AC ${sizing.dc_ac_ratio}`} />
      <StatCard icon={Sun} label="Modules" value={Number(sizing.module_count).toLocaleString('en-IN')} sub={`${sizing.string_count} strings`} />
      <StatCard icon={Gauge} label="Inverters" value={sizing.inverter_count} />
      <StatCard icon={Zap} label="Transformers" value={sizing.transformer_count} sub={`${sizing.acdb_count} ACDB`} />
    </div>
  )
}

function MilestoneDates({ stage, onStageDates }) {
  const [d, setD] = useState({
    planned_start: stage.planned_start || '', planned_end: stage.planned_end || '',
    actual_start: stage.actual_start || '', actual_end: stage.actual_end || '',
  })
  const save = (field) => {
    if (d[field] === (stage[field] || '')) return
    onStageDates(stage.id, { [field]: d[field] })
  }
  const input = 'text-xs border border-surface-200 rounded-md px-2 py-1 outline-none focus:ring-1 focus:ring-brand-500'
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3 bg-surface-50 rounded-lg p-2.5">
      {[['planned_start', 'Planned start'], ['planned_end', 'Planned end'],
        ['actual_start', 'Actual start'], ['actual_end', 'Actual end']].map(([f, label]) => (
        <label key={f} className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
          <input type="date" className={input} value={d[f]}
            onChange={e => setD(s => ({ ...s, [f]: e.target.value }))} onBlur={() => save(f)} />
        </label>
      ))}
    </div>
  )
}

// Inline-editable text: shows text, becomes an input on click; saves on blur/Enter.
function EditableText({ value, onSave, editable, className = '', placeholder = '' }) {
  const [editing, setEditing] = useState(false)
  const [v, setV] = useState(value)
  useEffect(() => { setV(value) }, [value])
  if (!editable) return <span className={className}>{value || placeholder}</span>
  if (!editing) {
    return (
      <span className={`${className} cursor-text hover:bg-surface-50 rounded px-1 -mx-1`} title="Click to edit"
        onClick={() => setEditing(true)}>{value || <span className="text-slate-300">{placeholder}</span>}</span>
    )
  }
  const commit = () => { setEditing(false); if (v.trim() && v !== value) onSave(v.trim()) }
  return (
    <input autoFocus value={v} onChange={e => setV(e.target.value)} onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setV(value); setEditing(false) } }}
      className={`${className} border border-brand-300 rounded px-1 outline-none focus:ring-1 focus:ring-brand-500`} />
  )
}

function WbsTab({
  stages, editable, vendors, library,
  onWpStatus, onWpVendor, onStageDates,
  onAddStage, onRenameStage, onDeleteStage, onReorderStages,
  onAddWp, onRenameWp, onDeleteWp, onMoveWp, onReorderWps,
}) {
  const [newStage, setNewStage] = useState('')
  const [addWpFor, setAddWpFor] = useState(null) // stage id with open "add package" input
  const [newWp, setNewWp] = useState('')
  const [dragWp, setDragWp] = useState(null)      // {wpId, fromStageId}
  const [dragStage, setDragStage] = useState(null)

  const submitStage = (e) => { e.preventDefault(); if (newStage.trim()) { onAddStage(newStage.trim()); setNewStage('') } }
  const submitWp = (e, stageId) => {
    e.preventDefault()
    if (newWp.trim()) { onAddWp(stageId, newWp.trim()); setNewWp(''); setAddWpFor(null) }
  }

  return (
    <div className="space-y-3">
      {editable && (
        <div className="flex items-center gap-2 text-xs text-slate-500 bg-brand-50 border border-brand-100 rounded-lg px-3 py-2">
          <Sparkles size={13} className="text-brand-600" />
          Edit mode — click a title to rename, add/remove stages &amp; packages, and drag to reorder. Lock the build to freeze.
        </div>
      )}

      {stages.map(stage => (
        <div key={stage.id}
          draggable={editable}
          onDragStart={() => editable && setDragStage(stage.id)}
          onDragOver={e => { if (editable && dragStage) e.preventDefault() }}
          onDrop={() => {
            if (!editable || dragStage == null || dragStage === stage.id) return
            const ids = stages.map(s => s.id).filter(id => id !== dragStage)
            const at = ids.indexOf(stage.id)
            ids.splice(at, 0, dragStage)
            onReorderStages(ids); setDragStage(null)
          }}
          className="card p-4">
          <div className="flex items-center justify-between mb-3 gap-2">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {editable && <span className="text-slate-300 cursor-grab select-none" title="Drag to reorder stage">⠿</span>}
              <span className="text-xs font-bold text-brand-600 bg-brand-50 border border-brand-100 rounded px-2 py-0.5">{stage.code}</span>
              <EditableText value={stage.name} editable={editable} className="font-semibold text-slate-800 text-sm"
                onSave={(name) => onRenameStage(stage.id, name)} />
              {stage.is_parallel && <span className="badge badge-amber">parallel</span>}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">{stage.work_packages.length} pkg</span>
              {editable && (
                <button onClick={() => onDeleteStage(stage.id)} title="Delete stage"
                  className="text-slate-300 hover:text-red-500"><Trash2 size={14} /></button>
              )}
            </div>
          </div>

          <MilestoneDates stage={stage} onStageDates={onStageDates} />

          <div className="divide-y divide-surface-100">
            {stage.work_packages.map(wp => (
              <div key={wp.id}
                draggable={editable}
                onDragStart={e => { if (editable) { e.stopPropagation(); setDragWp({ wpId: wp.id, fromStageId: stage.id }) } }}
                onDragOver={e => { if (editable && dragWp) { e.preventDefault(); e.stopPropagation() } }}
                onDrop={e => {
                  if (!editable || !dragWp) return
                  e.stopPropagation()
                  if (dragWp.fromStageId === stage.id) {
                    const ids = stage.work_packages.map(w => w.id).filter(id => id !== dragWp.wpId)
                    const at = ids.indexOf(wp.id); ids.splice(at, 0, dragWp.wpId)
                    onReorderWps(stage.id, ids)
                  } else {
                    onMoveWp(dragWp.wpId, dragWp.fromStageId, stage.id)
                  }
                  setDragWp(null)
                }}
                className="flex items-center justify-between gap-3 py-2 flex-wrap">
                <div className="flex items-center gap-2 flex-1 min-w-[180px]">
                  {editable && <span className="text-slate-300 cursor-grab select-none" title="Drag to reorder / move">⠿</span>}
                  <EditableText value={wp.name} editable={editable} className="text-sm text-slate-600"
                    onSave={(name) => onRenameWp(wp.id, name)} />
                </div>
                <select value={wp.assigned_vendor_id || ''}
                  onChange={e => onWpVendor(stage.id, wp.id, e.target.value)}
                  className="text-xs border border-surface-200 rounded-md px-2 py-1 outline-none focus:ring-1 focus:ring-brand-500 max-w-[200px]">
                  <option value="">Unassigned</option>
                  {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
                <select value={wp.status}
                  onChange={e => onWpStatus(stage.id, wp.id, e.target.value)}
                  className="text-xs border border-surface-200 rounded-md px-2 py-1 outline-none focus:ring-1 focus:ring-brand-500">
                  {STATUS_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                {editable && (
                  <button onClick={() => onDeleteWp(stage.id, wp.id)} title="Remove package"
                    className="text-slate-300 hover:text-red-500"><Trash2 size={13} /></button>
                )}
              </div>
            ))}
          </div>

          {editable && (
            addWpFor === stage.id ? (
              <form onSubmit={e => submitWp(e, stage.id)} className="flex items-center gap-2 mt-2">
                <input autoFocus list="wbs-wp-library" value={newWp} onChange={e => setNewWp(e.target.value)}
                  placeholder="Pick from library or type a package…"
                  className="flex-1 text-sm border border-surface-200 rounded-md px-2 py-1 outline-none focus:ring-1 focus:ring-brand-500" />
                <button type="submit" className="btn-primary !py-1 !text-xs"><Plus size={12} />Add</button>
                <button type="button" onClick={() => { setAddWpFor(null); setNewWp('') }} className="text-xs text-slate-400">Cancel</button>
              </form>
            ) : (
              <button onClick={() => { setAddWpFor(stage.id); setNewWp('') }}
                className="mt-2 text-xs text-brand-600 font-medium flex items-center gap-1 hover:text-brand-700">
                <Plus size={12} />Add work package
              </button>
            )
          )}
        </div>
      ))}

      {editable && (
        <form onSubmit={submitStage} className="card p-3 flex items-center gap-2">
          <input list="wbs-stage-library" value={newStage} onChange={e => setNewStage(e.target.value)}
            placeholder="Add a stage (pick from library or type a custom one)…"
            className="flex-1 text-sm border border-surface-200 rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-brand-500" />
          <button type="submit" className="btn-primary"><Plus size={14} />Add stage</button>
        </form>
      )}

      {/* Library options for the pickers */}
      <datalist id="wbs-stage-library">{(library.stage_names || []).map(n => <option key={n} value={n} />)}</datalist>
      <datalist id="wbs-wp-library">{(library.work_package_names || []).map(n => <option key={n} value={n} />)}</datalist>
    </div>
  )
}

function BoqTab({ sections, editable, onItemSave }) {
  return (
    <div className="space-y-5">
      {sections.map(sec => (
        <div key={sec.name} className="card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 bg-surface-50 border-b border-surface-200">
            <h4 className="font-semibold text-slate-800 text-sm">{sec.name}</h4>
            <span className="text-xs text-slate-500">Total: ₹{money(sec.total_amount)}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-400 border-b border-surface-100">
                  <th className="text-left font-medium px-4 py-2">Description</th>
                  <th className="text-left font-medium px-2 py-2">Unit</th>
                  <th className="text-right font-medium px-2 py-2">Qty</th>
                  <th className="text-right font-medium px-2 py-2">Material Rate</th>
                  <th className="text-right font-medium px-2 py-2">Labour Rate</th>
                  <th className="text-right font-medium px-4 py-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {sec.items.map(item => (
                  <BoqRow key={item.id} item={item} editable={editable} onSave={onItemSave} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}

function BoqRow({ item, editable, onSave }) {
  const [qty, setQty] = useState(item.quantity)
  const [mat, setMat] = useState(item.material_rate)
  const [lab, setLab] = useState(item.labour_rate)
  const [saving, setSaving] = useState(false)
  const total = (Number(qty || 0) * (Number(mat || 0) + Number(lab || 0)))

  const save = async () => {
    if (!editable) return
    if (qty === item.quantity && mat === item.material_rate && lab === item.labour_rate) return
    setSaving(true)
    try {
      await onSave(item.id, { quantity: qty, material_rate: mat, labour_rate: lab })
    } finally { setSaving(false) }
  }

  const cell = 'w-24 text-right border border-surface-200 rounded px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-surface-50 disabled:text-slate-500'
  return (
    <tr className="border-b border-surface-50 last:border-0">
      <td className="px-4 py-2 text-slate-700">
        {item.description}
        {item.specification && <span className="block text-xs text-slate-400">{item.specification}</span>}
      </td>
      <td className="px-2 py-2 text-slate-500">{item.unit}</td>
      <td className="px-2 py-2 text-right">
        <input type="number" className={cell} value={qty} disabled={!editable}
          onChange={e => setQty(e.target.value)} onBlur={save} />
      </td>
      <td className="px-2 py-2 text-right">
        <input type="number" className={cell} value={mat} disabled={!editable}
          onChange={e => setMat(e.target.value)} onBlur={save} />
      </td>
      <td className="px-2 py-2 text-right">
        <input type="number" className={cell} value={lab} disabled={!editable}
          onChange={e => setLab(e.target.value)} onBlur={save} />
      </td>
      <td className="px-4 py-2 text-right font-medium text-slate-800">
        {saving ? <Loader2 size={12} className="animate-spin inline" /> : `₹${money(total)}`}
      </td>
    </tr>
  )
}

function DailyProgressTab({ projectId, build, vendors }) {
  const [entries, setEntries] = useState([])
  const [sites, setSites] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [filterVendor, setFilterVendor] = useState('')
  const [form, setForm] = useState({
    site_name: '', progress_date: new Date().toISOString().slice(0, 10),
    stage_id: '', work_package_id: '', vendor_id: '',
    progress_percent: '', status: 'in_progress', note: '',
  })

  const allWps = (build.stages || []).flatMap(s => s.work_packages.map(w => ({ ...w, stage_id: s.id, stage_name: s.name })))

  const load = () => {
    setLoading(true)
    const q = filterVendor ? `?vendor_id=${filterVendor}` : ''
    api.get(`/solar/projects/${projectId}/progress/${q}`)
      .then(res => { setEntries(res.data.entries || []); setSites(res.data.sites || []) })
      .catch(() => setErr('Could not load progress.'))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [projectId, filterVendor])

  const submit = async (e) => {
    e.preventDefault(); setSaving(true); setErr('')
    try {
      const body = { ...form }
      // derive vendor from the selected work package if not set
      if (!body.vendor_id && body.work_package_id) {
        const wp = allWps.find(w => String(w.id) === String(body.work_package_id))
        if (wp?.assigned_vendor_id) body.vendor_id = wp.assigned_vendor_id
      }
      await api.post(`/solar/projects/${projectId}/progress/`, body)
      setForm(f => ({ ...f, progress_percent: '', note: '' }))
      load()
    } catch (e2) {
      setErr(e2.response?.data?.error || 'Could not save progress.')
    } finally { setSaving(false) }
  }

  const wpOptions = form.stage_id
    ? allWps.filter(w => String(w.stage_id) === String(form.stage_id))
    : allWps
  const inp = 'w-full border border-surface-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-brand-500'

  return (
    <div className="space-y-5">
      {/* Entry form — same fields the field portal submits */}
      <form onSubmit={submit} className="card p-4">
        <div className="flex items-center gap-2 mb-3">
          <HardHat size={16} className="text-brand-600" />
          <h4 className="font-semibold text-slate-800 text-sm">Log daily progress</h4>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-slate-500">Site</span>
            <input className={inp} list="site-list" value={form.site_name} required
              onChange={e => setForm(f => ({ ...f, site_name: e.target.value }))} placeholder="e.g. Pokaran" />
            <datalist id="site-list">{sites.map(s => <option key={s} value={s} />)}</datalist>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-slate-500">Date</span>
            <input type="date" className={inp} value={form.progress_date} required
              onChange={e => setForm(f => ({ ...f, progress_date: e.target.value }))} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-slate-500">Work stage</span>
            <select className={inp} value={form.stage_id}
              onChange={e => setForm(f => ({ ...f, stage_id: e.target.value, work_package_id: '' }))}>
              <option value="">All stages</option>
              {(build.stages || []).map(s => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-slate-500">Work scope (package)</span>
            <select className={inp} value={form.work_package_id}
              onChange={e => setForm(f => ({ ...f, work_package_id: e.target.value }))}>
              <option value="">—</option>
              {wpOptions.map(w => <option key={w.id} value={w.id}>{w.name}{w.assigned_vendor_name ? ` · ${w.assigned_vendor_name}` : ''}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-slate-500">Vendor</span>
            <select className={inp} value={form.vendor_id}
              onChange={e => setForm(f => ({ ...f, vendor_id: e.target.value }))}>
              <option value="">From work scope</option>
              {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-slate-500">Progress %</span>
            <input type="number" min="0" max="100" step="0.1" className={inp} value={form.progress_percent}
              onChange={e => setForm(f => ({ ...f, progress_percent: e.target.value }))} placeholder="0–100" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-slate-500">Status</span>
            <select className={inp} value={form.status}
              onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
              {STATUS_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 md:col-span-1 col-span-2">
            <span className="text-[11px] font-semibold text-slate-500">Note</span>
            <input className={inp} value={form.note}
              onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="Optional" />
          </label>
        </div>
        {err && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 mt-3">{err}</div>}
        <div className="mt-3">
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}Record progress
          </button>
        </div>
      </form>

      {/* Filter + log */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500">Filter by vendor:</span>
        <select className="text-xs border border-surface-200 rounded-md px-2 py-1" value={filterVendor}
          onChange={e => setFilterVendor(e.target.value)}>
          <option value="">All vendors</option>
          {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        <span className="text-xs text-slate-400 ml-auto">{entries.length} entries</span>
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
                <th className="text-left font-medium px-4 py-2">By</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400"><Loader2 size={14} className="animate-spin inline" /> Loading…</td></tr>}
              {!loading && entries.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">No progress logged yet.</td></tr>}
              {!loading && entries.map(e => (
                <tr key={e.id} className="border-b border-surface-50 last:border-0">
                  <td className="px-4 py-2 text-slate-600">{e.progress_date}</td>
                  <td className="px-2 py-2 font-medium text-slate-800">{e.site_name}</td>
                  <td className="px-2 py-2 text-slate-600">{e.work_package_name || e.stage_name || '—'}</td>
                  <td className="px-2 py-2 text-slate-600">{e.vendor_name || '—'}</td>
                  <td className="px-2 py-2 text-right font-semibold text-slate-800">{e.progress_percent}%</td>
                  <td className="px-2 py-2"><span className="badge badge-blue">{e.status.replace('_', ' ')}</span></td>
                  <td className="px-2 py-2 text-slate-500">{e.note}</td>
                  <td className="px-4 py-2 text-slate-400 text-xs">{e.reporter_name || '—'}{e.source === 'field' ? ' 📱' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default function ProjectWorkStructure() {
  const { projectId } = useParams()
  const [build, setBuild] = useState(null)
  const [project, setProject] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('sizing')
  const [locking, setLocking] = useState(false)
  const [notice, setNotice] = useState('')
  const [vendors, setVendors] = useState([])
  const [library, setLibrary] = useState({ stage_names: [], work_package_names: [] })

  const load = async () => {
    setLoading(true); setError('')
    try {
      const [buildRes, projRes] = await Promise.all([
        api.get(`/solar/projects/${projectId}/build/`),
        api.get('/projects/').catch(() => ({ data: { projects: [] } })),
      ])
      setBuild(buildRes.data.build)
      const p = (projRes.data.projects || []).find(x => String(x.id) === String(projectId))
      setProject(p || null)
    } catch (err) {
      setError('Could not load the work structure.')
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [projectId])

  useEffect(() => {
    api.get('/solar/vendor-options/')
      .then(res => setVendors(res.data.vendors || []))
      .catch(() => setVendors([]))
    api.get('/solar/wbs-library/')
      .then(res => setLibrary(res.data || { stage_names: [], work_package_names: [] }))
      .catch(() => {})
  }, [])

  // Re-fetch the whole build after a structural edit (add/delete/reorder/move).
  const refreshBuild = async () => {
    const res = await api.get(`/solar/projects/${projectId}/build/`)
    setBuild(res.data.build)
  }

  // --- Work-breakdown editing (draft only) ---
  const addStage = async (name) => {
    await api.post(`/solar/builds/${build.id}/stages/`, { name }); await refreshBuild()
  }
  const renameStage = async (stageId, name) => {
    await api.patch(`/solar/stages/${stageId}/`, { name })
    setBuild(b => ({ ...b, stages: b.stages.map(s => s.id === stageId ? { ...s, name } : s) }))
  }
  const deleteStage = async (stageId) => {
    if (!window.confirm('Remove this stage and its work packages?')) return
    await api.delete(`/solar/stages/${stageId}/`); await refreshBuild()
  }
  const reorderStages = async (ids) => {
    setBuild(b => ({ ...b, stages: ids.map(id => b.stages.find(s => s.id === id)).filter(Boolean) }))
    await api.post(`/solar/builds/${build.id}/reorder/`, { stages: ids })
  }
  const addWp = async (stageId, name) => {
    await api.post(`/solar/stages/${stageId}/workpackages/`, { name }); await refreshBuild()
  }
  const renameWp = async (wpId, name) => {
    await api.patch(`/solar/workpackages/${wpId}/`, { name }); await refreshBuild()
  }
  const deleteWp = async (stageId, wpId) => {
    await api.delete(`/solar/workpackages/${wpId}/`)
    setBuild(b => ({ ...b, stages: b.stages.map(s => s.id !== stageId ? s : {
      ...s, work_packages: s.work_packages.filter(w => w.id !== wpId) }) }))
  }
  const moveWp = async (wpId, fromStageId, toStageId) => {
    await api.patch(`/solar/workpackages/${wpId}/`, { stage_id: toStageId }); await refreshBuild()
  }
  const reorderWps = async (stageId, ids) => {
    setBuild(b => ({ ...b, stages: b.stages.map(s => s.id !== stageId ? s : {
      ...s, work_packages: ids.map(id => s.work_packages.find(w => w.id === id)).filter(Boolean) }) }))
    await api.post(`/solar/builds/${build.id}/reorder/`, { stage_id: stageId, work_packages: ids })
  }

  const setWpVendor = async (stageId, wpId, vendorId) => {
    const res = await api.patch(`/solar/workpackages/${wpId}/`, { assigned_vendor_id: vendorId || '' })
    const updated = res.data.work_package
    setBuild(b => ({
      ...b,
      stages: b.stages.map(s => s.id !== stageId ? s : {
        ...s, work_packages: s.work_packages.map(w => w.id === wpId ? updated : w),
      }),
    }))
  }

  const setStageDates = async (stageId, patch) => {
    const res = await api.patch(`/solar/stages/${stageId}/`, patch)
    const updated = res.data.stage
    setBuild(b => ({ ...b, stages: b.stages.map(s => s.id === stageId ? updated : s) }))
  }

  const saveItem = async (itemId, body) => {
    await api.patch(`/solar/boq-items/${itemId}/`, body)
    const res = await api.get(`/solar/projects/${projectId}/build/`)
    setBuild(res.data.build)
  }

  const setWpStatus = async (stageId, wpId, status) => {
    await api.patch(`/solar/workpackages/${wpId}/`, { status })
    setBuild(b => ({
      ...b,
      stages: b.stages.map(s => s.id !== stageId ? s : {
        ...s, work_packages: s.work_packages.map(w => w.id === wpId ? { ...w, status } : w),
      }),
    }))
  }

  const lock = async () => {
    setLocking(true); setNotice('')
    try {
      await api.post(`/solar/builds/${build.id}/lock/`)
      setNotice('Build locked. The work breakdown is now read-only — unlock to edit.')
      await load()
    } catch (err) {
      setNotice(err.response?.data?.error || 'Could not lock the build.')
    } finally { setLocking(false) }
  }

  const unlock = async () => {
    setLocking(true); setNotice('')
    try {
      await api.post(`/solar/builds/${build.id}/unlock/`)
      setNotice('Build unlocked. You can edit the work breakdown again.')
      await load()
    } catch (err) {
      setNotice(err.response?.data?.error || 'Could not unlock the build.')
    } finally { setLocking(false) }
  }

  if (loading) {
    return <div className="flex items-center gap-2 text-sm text-slate-500 py-16 justify-center"><Loader2 size={16} className="animate-spin" />Loading…</div>
  }

  return (
    <div className="space-y-6 pb-6">
      <div className="page-header">
        <div>
          <Link to="/projects" className="text-xs text-slate-400 hover:text-brand-600 flex items-center gap-1 mb-1"><ArrowLeft size={12} />Projects</Link>
          <h2 className="page-title flex items-center gap-2"><Sun size={20} className="text-brand-600" />Work Structure</h2>
          <p className="page-subtitle">{project ? `${project.project_name} · ${project.project_code}` : `Project #${projectId}`}</p>
        </div>
        {build && (
          <div className="flex items-center gap-2">
            <span className={`badge ${build.status === 'draft' ? 'badge-blue' : 'badge-green'}`}>
              {build.status_display} · {build.progress_percent}%
            </span>
            {build.is_editable ? (
              <button onClick={lock} disabled={locking} className="btn-primary">
                {locking ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}Lock
              </button>
            ) : (
              <button onClick={unlock} disabled={locking} className="btn-secondary">
                {locking ? <Loader2 size={14} className="animate-spin" /> : <Unlock size={14} />}Unlock to edit
              </button>
            )}
          </div>
        )}
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>}
      {notice && <div className="bg-brand-50 border border-brand-200 text-brand-700 text-sm rounded-xl px-4 py-3 flex items-center gap-2"><CheckCircle2 size={14} />{notice}</div>}

      {!build && !error && (
        <GenerateForm projectId={projectId} project={project} onCreated={setBuild} />
      )}

      {build && (
        <>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex gap-1 bg-surface-100 rounded-lg p-1">
              {[['sizing', 'Sizing', Gauge], ['wbs', 'Work Breakdown', LayoutList], ['boq', 'BOQ', Table2]].map(([v, l, Icon]) => (
                <button key={v} onClick={() => setTab(v)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${tab === v ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                  <Icon size={13} />{l}
                </button>
              ))}
            </div>
            <div className="text-sm text-slate-500">
              <span className="capitalize">{build.project_type.replace('_', ' ')}</span> · {build.ac_capacity_mw} MW ·
              <span className="font-semibold text-slate-700"> BOQ ₹{money(build.boq_totals.total_amount)}</span>
            </div>
          </div>

          {!build.is_editable && (
            <div className="bg-amber-50 border border-amber-200 text-amber-700 text-xs rounded-lg px-3 py-2 flex items-center gap-2">
              <AlertTriangle size={13} />This build is locked. Quantities and rates are read-only.
            </div>
          )}

          {tab === 'sizing' && <SizingTab sizing={build.sizing} />}
          {tab === 'wbs' && <WbsTab
            stages={build.stages || []} editable={build.is_editable} vendors={vendors} library={library}
            onWpStatus={setWpStatus} onWpVendor={setWpVendor} onStageDates={setStageDates}
            onAddStage={addStage} onRenameStage={renameStage} onDeleteStage={deleteStage} onReorderStages={reorderStages}
            onAddWp={addWp} onRenameWp={renameWp} onDeleteWp={deleteWp} onMoveWp={moveWp} onReorderWps={reorderWps}
          />}
          {tab === 'boq' && <BoqTab sections={build.boq_sections || []} editable={build.is_editable} onItemSave={saveItem} />}

          <p className="text-xs text-slate-400 italic pt-2">
            Final project values must follow approved drawings, datasheets, calculations, standards and utility requirements.
          </p>
        </>
      )}
    </div>
  )
}
