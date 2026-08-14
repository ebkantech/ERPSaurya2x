import React, { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import api from '../../services/api'
import { useVendorControl } from './context'
import { LoadingRow, ErrorBanner, AccessDenied } from './ui'

const PERFORMANCE_URL = '/vendor-control/performance/'

export default function StaffPerformance() {
  const { isAdmin, loading: ctxLoading } = useVendorControl()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isAdmin) return
    setLoading(true)
    api.get(PERFORMANCE_URL)
      .then((res) => setRows(res.data.results || []))
      .catch((err) => setError(err.response?.data?.error || 'Could not load staff performance.'))
      .finally(() => setLoading(false))
  }, [isAdmin])

  if (ctxLoading) return <LoadingRow label="Checking access…" />
  if (!isAdmin) return <AccessDenied />

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h2 className="page-title">Staff Performance</h2>
          <p className="page-subtitle">Vendor load and task throughput per staff member.</p>
        </div>
      </div>

      <ErrorBanner message={error} />

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Staff</th><th>Role</th>
                <th className="text-right">Assigned Vendors</th>
                <th className="text-right">Pending</th>
                <th className="text-right">Overdue</th>
                <th className="text-right">Completed</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-10 text-slate-400"><Loader2 size={18} className="animate-spin inline-block mr-2" />Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-10 text-slate-400">No staff records found.</td></tr>
              ) : rows.map((r, i) => (
                <tr key={i}>
                  <td className="font-medium text-slate-800">{r.staff_name}</td>
                  <td className="text-xs text-slate-500">{r.role}</td>
                  <td className="text-right">{r.active_vendor_count}</td>
                  <td className="text-right"><span className="badge badge-amber text-xs">{r.pending_task_count}</span></td>
                  <td className="text-right"><span className="badge badge-red text-xs">{r.overdue_task_count}</span></td>
                  <td className="text-right"><span className="badge badge-green text-xs">{r.completed_task_count}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
