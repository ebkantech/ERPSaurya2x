import React, { useEffect, useState } from 'react'
import { Search, Loader2 } from 'lucide-react'
import api from '../../services/api'
import { useVendorControl } from './context'
import { LoadingRow, ErrorBanner, AccessDenied } from './ui'

const HISTORY_URL = '/vendor-control/history/'

export default function AssignmentHistory() {
  const { isAdmin, loading: ctxLoading } = useVendorControl()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!isAdmin) return
    setLoading(true)
    const t = setTimeout(() => {
      api.get(HISTORY_URL, { params: search ? { q: search } : {} })
        .then((res) => setRows(res.data.results || []))
        .catch((err) => setError(err.response?.data?.error || 'Could not load assignment history.'))
        .finally(() => setLoading(false))
    }, search ? 300 : 0)
    return () => clearTimeout(t)
  }, [isAdmin, search])

  if (ctxLoading) return <LoadingRow label="Checking access…" />
  if (!isAdmin) return <AccessDenied />

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h2 className="page-title">Assignment History</h2>
          <p className="page-subtitle">{loading ? 'Loading…' : `${rows.length} history entries`}</p>
        </div>
      </div>

      <div className="card p-4 flex items-center gap-3">
        <div className="flex items-center bg-surface-50 border border-surface-200 rounded-lg px-3 py-2 gap-2 flex-1 max-w-sm">
          <Search size={14} className="text-slate-400 flex-shrink-0" />
          <input type="text" placeholder="Search vendor, staff, reason…"
            className="bg-transparent text-sm outline-none flex-1 placeholder-slate-400"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <span className="ml-auto text-xs text-slate-400">{rows.length} results</span>
      </div>

      <ErrorBanner message={error} />

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead><tr><th>Vendor</th><th>Previous Staff</th><th>New Staff</th><th>Changed By</th><th>Date</th><th>Reason</th></tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-10 text-slate-400"><Loader2 size={18} className="animate-spin inline-block mr-2" />Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-10 text-slate-400">No history entries found.</td></tr>
              ) : rows.map((r) => (
                <tr key={r.id}>
                  <td className="font-medium text-slate-800">{r.vendor_name}</td>
                  <td className="text-xs text-slate-500">{r.previous_staff || '—'}</td>
                  <td className="text-xs text-slate-700 font-medium">{r.new_staff || '—'}</td>
                  <td className="text-xs text-slate-500">{r.changed_by || '—'}</td>
                  <td className="text-xs text-slate-400">{r.changed_date ? new Date(r.changed_date).toLocaleString() : '—'}</td>
                  <td className="text-xs text-slate-500 max-w-[220px] truncate" title={r.reason}>{r.reason || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
