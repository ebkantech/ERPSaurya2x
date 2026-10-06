import React, { useState, useEffect } from 'react'
import { IndianRupee, Loader2, FolderKanban, Wallet, TrendingDown, TrendingUp, CheckCircle2, Plus, Trash2, RefreshCw } from 'lucide-react'
import api from '../../services/api'

const num = (v) => Number(v || 0)
const money = (v) => num(v).toLocaleString('en-IN', { maximumFractionDigits: 0 })

function Stat({ icon: Icon, label, value, tone = 'text-slate-900' }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-slate-400 text-xs font-medium mb-1"><Icon size={13} />{label}</div>
      <p className={`text-xl font-bold ${tone}`}>{value}</p>
    </div>
  )
}

function VarBar({ pct }) {
  const v = Math.max(0, Math.min(120, num(pct)))
  const color = v > 100 ? 'bg-red-500' : v >= 85 ? 'bg-amber-400' : 'bg-emerald-500'
  return (
    <div className="h-2 rounded-full bg-surface-100 overflow-hidden min-w-[90px]">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, v)}%` }} />
    </div>
  )
}

export default function BudgetVsActual() {
  const [projects, setProjects] = useState([])
  const [projectId, setProjectId] = useState('')
  const [build, setBuild] = useState(null)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.get('/projects/').then(res => setProjects(res.data.projects || [])).catch(() => setProjects([]))
  }, [])

  useEffect(() => {
    if (!projectId) { setBuild(null); setData(null); return }
    setLoading(true); setErr('')
    api.get(`/solar/projects/${projectId}/build/`)
      .then(res => {
        const b = res.data.build || false
        setBuild(b)
        if (b) return api.get(`/solar/builds/${b.id}/budget/`).then(r => setData(r.data))
      })
      .catch(() => setErr('Could not load the budget.'))
      .finally(() => setLoading(false))
  }, [projectId])

  const seed = async () => {
    setBusy(true); setErr('')
    try { const r = await api.post(`/solar/builds/${build.id}/budget/`); setData(r.data) }
    catch { setErr('Could not create the budget.') } finally { setBusy(false) }
  }

  const sync = async () => {
    setBusy(true); setErr('')
    try { const r = await api.post(`/solar/builds/${build.id}/budget/sync/`); setData(r.data) }
    catch (e) { setErr(e.response?.data?.error || 'Could not sync from POs.') } finally { setBusy(false) }
  }

  const editLine = async (line, field, value) => {
    try {
      const r = await api.patch(`/solar/budget-lines/${line.id}/`, { [field]: value })
      setData(r.data)
    } catch { setErr('Could not update the line.') }
  }

  const delLine = async (line) => {
    if (!window.confirm(`Remove cost head "${line.cost_head}"?`)) return
    try { const r = await api.delete(`/solar/budget-lines/${line.id}/`); if (r.data.lines) setData(r.data); else reload() }
    catch { setErr('Could not delete the line.') }
  }
  const reload = () => api.get(`/solar/builds/${build.id}/budget/`).then(r => setData(r.data)).catch(() => {})

  const setStatus = async (status) => {
    try { const r = await api.post(`/solar/builds/${build.id}/budget/status/`, { status }); setData(r.data) }
    catch { setErr('Could not change status.') }
  }

  const t = data?.totals
  const ref = data?.reference

  return (
    <div className="space-y-6 pb-6">
      <div className="page-header">
        <div>
          <h2 className="page-title flex items-center gap-2"><Wallet size={20} className="text-brand-600" />Budget vs Actual</h2>
          <p className="page-subtitle">Planned cost by head vs actual spend — with milestone-payment cross-check and closeout.</p>
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

      {build && !loading && data && !data.budget && (
        <div className="card p-6 text-center">
          <p className="text-sm text-slate-500 mb-3">No budget yet. Seed one from this build's BOQ cost heads.</p>
          <button onClick={seed} disabled={busy} className="btn-primary mx-auto">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}Create budget from BOQ
          </button>
        </div>
      )}

      {build && !loading && data && data.budget && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Stat icon={Wallet} label="Budgeted" value={`₹${money(t.budgeted)}`} />
            <Stat icon={IndianRupee} label="Actual" value={`₹${money(t.actual)}`} tone={t.over_budget ? 'text-red-600' : 'text-slate-900'} />
            <Stat icon={t.over_budget ? TrendingDown : TrendingUp} label="Variance" value={`₹${money(t.variance)}`} tone={t.over_budget ? 'text-red-600' : 'text-emerald-600'} />
            <Stat icon={IndianRupee} label="Consumed" value={`${t.consumed_percent}%`} tone={t.over_budget ? 'text-red-600' : 'text-slate-900'} />
            <Stat icon={CheckCircle2} label="Milestone paid" value={`₹${money(ref.milestone_paid)}`} tone="text-emerald-600" />
          </div>

          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="text-sm text-slate-500">
              Status: <span className={`badge ${data.budget.status === 'closed' ? 'badge-green' : data.budget.status === 'approved' ? 'badge-blue' : 'badge-amber'}`}>{data.budget.status}</span>
              {data.ready_to_close && <span className="ml-2 text-emerald-600 text-xs font-semibold inline-flex items-center gap-1"><CheckCircle2 size={12} />Ready to close</span>}
            </div>
            <div className="flex gap-2">
              <button onClick={sync} disabled={busy} className="btn-secondary text-xs" title="Pull committed/actual from this project's purchase orders">
                {busy ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}Sync from POs
              </button>
              {data.budget.status !== 'approved' && <button onClick={() => setStatus('approved')} className="btn-secondary text-xs">Approve</button>}
              {data.budget.status !== 'closed' && <button onClick={() => setStatus('closed')} disabled={!data.ready_to_close} className="btn-primary text-xs" title={!data.ready_to_close ? 'All milestones must be paid and spend within budget' : ''}>Close out</button>}
            </div>
          </div>

          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-400 border-b border-surface-100">
                <th className="px-4 py-2">Cost head</th><th className="px-4 py-2">Type</th>
                <th className="px-4 py-2 text-right">Budgeted</th><th className="px-4 py-2 text-right">Committed</th>
                <th className="px-4 py-2 text-right">Actual</th><th className="px-4 py-2 text-right">Variance</th>
                <th className="px-4 py-2">Consumed</th><th className="px-4 py-2"></th></tr></thead>
              <tbody>
                {(data.lines || []).map(l => (
                  <tr key={l.id} className="border-b border-surface-50">
                    <td className="px-4 py-2 font-medium text-slate-700">{l.cost_head}</td>
                    <td className="px-4 py-2"><span className="badge badge-blue uppercase text-[10px]">{l.kind}</span></td>
                    <td className="px-2 py-1 text-right"><input defaultValue={num(l.budgeted_amount)} onBlur={e => editLine(l, 'budgeted_amount', e.target.value)} className="w-28 text-right border border-surface-200 rounded px-2 py-1 text-xs" /></td>
                    <td className="px-2 py-1 text-right"><input defaultValue={num(l.committed_amount)} onBlur={e => editLine(l, 'committed_amount', e.target.value)} className="w-28 text-right border border-surface-200 rounded px-2 py-1 text-xs" /></td>
                    <td className="px-2 py-1 text-right"><input defaultValue={num(l.actual_amount)} onBlur={e => editLine(l, 'actual_amount', e.target.value)} className="w-28 text-right border border-surface-200 rounded px-2 py-1 text-xs" /></td>
                    <td className={`px-4 py-2 text-right font-semibold ${num(l.variance) < 0 ? 'text-red-600' : 'text-slate-600'}`}>₹{money(l.variance)}</td>
                    <td className="px-4 py-2"><div className="flex items-center gap-2"><VarBar pct={l.consumed_percent} /><span className="text-xs text-slate-500 w-10">{l.consumed_percent}%</span></div></td>
                    <td className="px-2 py-2"><button onClick={() => delLine(l)} className="text-slate-300 hover:text-red-500"><Trash2 size={14} /></button></td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="border-t-2 border-surface-200 font-bold text-slate-800">
                <td className="px-4 py-2" colSpan={2}>Total</td>
                <td className="px-4 py-2 text-right">₹{money(t.budgeted)}</td>
                <td className="px-4 py-2 text-right">₹{money(t.committed)}</td>
                <td className="px-4 py-2 text-right">₹{money(t.actual)}</td>
                <td className={`px-4 py-2 text-right ${t.over_budget ? 'text-red-600' : 'text-emerald-600'}`}>₹{money(t.variance)}</td>
                <td className="px-4 py-2" colSpan={2}>{t.consumed_percent}%</td>
              </tr></tfoot>
            </table>
          </div>

          <div className="card p-4">
            <h3 className="text-sm font-semibold text-slate-800 mb-2">Milestone cross-check & closeout</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div><p className="text-xs text-slate-400">Milestone approved</p><p className="font-semibold">₹{money(ref.milestone_approved)}</p></div>
              <div><p className="text-xs text-slate-400">Milestone paid</p><p className="font-semibold text-emerald-600">₹{money(ref.milestone_paid)}</p></div>
              <div><p className="text-xs text-slate-400">Retention held</p><p className="font-semibold text-amber-600">₹{money(ref.retention_held)}</p></div>
              <div><p className="text-xs text-slate-400">Milestones</p><p className="font-semibold">{ref.milestone_count}</p></div>
            </div>
            <p className="text-xs text-slate-400 italic mt-3">"Sync from POs" fills committed (ordered value) and actual (delivered value) per cost head from this project's purchase orders; unmatched spend lands in "Unallocated (PO)". Milestone figures are the build's billing payments.</p>
          </div>
        </>
      )}
    </div>
  )
}
