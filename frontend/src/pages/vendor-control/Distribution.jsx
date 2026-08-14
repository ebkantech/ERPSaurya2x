import React, { useEffect, useState } from 'react'
import { Users } from 'lucide-react'
import api from '../../services/api'
import { useVendorControl } from './context'
import { LoadingRow, ErrorBanner, AccessDenied } from './ui'

const DISTRIBUTION_URL = '/vendor-control/distribution/'

export default function Distribution() {
  const { isAdmin, loading: ctxLoading } = useVendorControl()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isAdmin) return
    setLoading(true)
    api.get(DISTRIBUTION_URL)
      .then((res) => setRows(res.data.results || []))
      .catch((err) => setError(err.response?.data?.error || 'Could not load the distribution breakdown.'))
      .finally(() => setLoading(false))
  }, [isAdmin])

  if (ctxLoading) return <LoadingRow label="Checking access…" />
  if (!isAdmin) return <AccessDenied />

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h2 className="page-title">Distribution</h2>
          <p className="page-subtitle">How vendor ownership breaks down across staff.</p>
        </div>
      </div>

      <ErrorBanner message={error} />

      {loading ? (
        <LoadingRow label="Loading distribution…" />
      ) : rows.length === 0 ? (
        <div className="card p-10 text-center text-sm text-slate-500">No assignments recorded yet.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {rows.map((s, i) => (
            <div key={i} className="card p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center flex-shrink-0">
                    <Users size={16} className="text-brand-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{s.staff_name}</p>
                    <p className="text-xs text-slate-400">{s.role}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="badge badge-blue text-xs">{s.primary_count} primary</span>
                  <span className="badge badge-slate text-xs">{s.support_count} support</span>
                </div>
              </div>
              {!s.assignments?.length ? (
                <p className="text-xs text-slate-400">No vendors assigned.</p>
              ) : (
                <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                  {s.assignments.map((a, j) => (
                    <div key={j} className="flex items-center justify-between text-xs py-1 border-b border-surface-50 last:border-0">
                      <span className="text-slate-700">{a.vendor_name}</span>
                      <span className="text-slate-400 capitalize">{a.assignment_role}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
