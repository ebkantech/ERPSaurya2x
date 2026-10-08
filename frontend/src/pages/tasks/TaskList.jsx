import React, { useState, useEffect } from 'react'
import { Plus, Search, Loader2 } from 'lucide-react'
import api from '../../services/api'

const norm = (s) => (s || '').toLowerCase().replace(/\s+/g, '_')
const statusBadge = { pending: 'badge-amber', in_progress: 'badge-blue', completed: 'badge-green', on_hold: 'badge-red' }
const priorityBadge = { high: 'badge-red', medium: 'badge-amber', low: 'badge-slate' }
const label = (s) => (s || '').replace(/_/g, ' ')

export default function TaskList() {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')

  useEffect(() => {
    api.get('/tasks/list/')
      .then(res => setTasks(res.data.tasks || []))
      .catch(() => setErr('Could not load tasks.'))
      .finally(() => setLoading(false))
  }, [])

  const filtered = tasks.filter(t => {
    const q = search.toLowerCase()
    const matchQ = (t.title || '').toLowerCase().includes(q) || (t.vendor || '').toLowerCase().includes(q)
    return matchQ && (statusFilter === 'All' || norm(t.status) === statusFilter)
  })
  const open = tasks.filter(t => norm(t.status) !== 'completed').length

  return (
    <div className="space-y-6 pb-4">
      <div className="page-header">
        <div>
          <h2 className="page-title">Vendor Tasks</h2>
          <p className="page-subtitle">{open} open tasks</p>
        </div>
        <button className="btn-primary"><Plus size={14} />New Task</button>
      </div>

      {err && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{err}</div>}

      <div className="card p-4 flex items-center gap-3 flex-wrap">
        <div className="flex items-center bg-surface-50 border border-surface-200 rounded-lg px-3 py-2 gap-2 flex-1 max-w-sm">
          <Search size={14} className="text-slate-400" />
          <input type="text" placeholder="Search tasks…"
            className="bg-transparent text-sm placeholder-slate-400 outline-none flex-1"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1.5">
          {['All', 'pending', 'in_progress', 'completed'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg capitalize transition-colors ${statusFilter === s ? 'bg-brand-500 text-white shadow-sm' : 'bg-surface-50 text-slate-600 border border-surface-200 hover:bg-surface-100'}`}
            >{label(s)}</button>
          ))}
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="data-table">
          <thead><tr><th>#</th><th>Task</th><th>Type</th><th>Vendor</th><th>Assignee</th><th>Due</th><th>Priority</th><th>Status</th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={8} className="text-center text-slate-400 py-8"><Loader2 size={16} className="animate-spin inline" /> Loading…</td></tr>}
            {!loading && filtered.length === 0 && <tr><td colSpan={8} className="text-center text-slate-400 py-8">No tasks.</td></tr>}
            {filtered.map(t => (
              <tr key={t.id}>
                <td className="text-slate-400 text-xs">{t.id}</td>
                <td className="font-medium text-slate-800 max-w-[240px] truncate">{t.title}</td>
                <td className="text-xs text-slate-500">{t.type}</td>
                <td className="text-slate-600 text-xs">{t.vendor || '—'}</td>
                <td className="text-xs text-slate-500">{t.assignee || '—'}</td>
                <td className="text-xs text-slate-400 whitespace-nowrap">{t.due || '—'}</td>
                <td><span className={`badge capitalize ${priorityBadge[norm(t.priority)] || 'badge-slate'}`}>{label(t.priority)}</span></td>
                <td><span className={`badge capitalize ${statusBadge[norm(t.status)] || 'badge-slate'}`}>{label(t.status)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
