import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Clock } from 'lucide-react'
import api from '../../services/api'
import { LoadingRow, ErrorBanner, TaskStatusBadge, PriorityBadge, humanize } from './ui'

const FOLLOWUPS_URL = '/vendor-control/followups/'

export default function Followups() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get(FOLLOWUPS_URL)
      .then((res) => setRows(res.data.results || []))
      .catch((err) => setError(err.response?.data?.error || 'Could not load follow-ups.'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h2 className="page-title">Follow-ups</h2>
          <p className="page-subtitle">Your tasks due or overdue in the next 7 days.</p>
        </div>
      </div>

      <ErrorBanner message={error} />

      {loading ? (
        <LoadingRow label="Loading follow-ups…" />
      ) : rows.length === 0 ? (
        <div className="card p-10 text-center text-sm text-slate-500">Nothing due in the next 7 days.</div>
      ) : (
        <div className="space-y-3">
          {rows.map((f) => (
            <div key={f.id} className="card p-4 flex items-center gap-4">
              <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0">
                <Clock size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900 truncate">{f.task_title}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  <Link to={`/vendor-control/vendors/${f.vendor_id}`} className="text-brand-600 hover:text-brand-700">{f.vendor_name}</Link>
                  {' · '}{humanize(f.task_type)} · due {f.due_date} · {f.assigned_staff}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <PriorityBadge priority={f.priority} />
                <TaskStatusBadge status={f.task_status} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
