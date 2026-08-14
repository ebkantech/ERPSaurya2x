import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Building2, MapPin, ChevronRight, Loader2 } from 'lucide-react'
import api from '../../services/api'
import { useVendorControl } from './context'
import { ErrorBanner } from './ui'

const MY_VENDORS_URL = '/vendor-control/my-vendors/'

export default function VendorQueue() {
  const navigate = useNavigate()
  const { loading: ctxLoading } = useVendorControl()
  const [rows, setRows] = useState([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    setLoading(true)
    const t = setTimeout(() => {
      api.get(MY_VENDORS_URL, { params: search ? { q: search } : {} })
        .then((res) => { setRows(res.data.results || []); setIsAdmin(!!res.data.is_admin) })
        .catch((err) => setError(err.response?.data?.error || 'Could not load vendors.'))
        .finally(() => setLoading(false))
    }, search ? 300 : 0)
    return () => clearTimeout(t)
  }, [search])

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h2 className="page-title">{isAdmin ? 'All Vendors' : 'My Vendors'}</h2>
          <p className="page-subtitle">
            {ctxLoading || loading ? 'Loading…' : `${rows.length} vendor${rows.length === 1 ? '' : 's'}`}
          </p>
        </div>
      </div>

      <div className="card p-4 flex items-center gap-3">
        <div className="flex items-center bg-surface-50 border border-surface-200 rounded-lg px-3 py-2 gap-2 flex-1 max-w-sm">
          <Search size={14} className="text-slate-400 flex-shrink-0" />
          <input type="text" placeholder="Search vendor name, city…"
            className="bg-transparent text-sm outline-none flex-1 placeholder-slate-400"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <span className="ml-auto text-xs text-slate-400">{rows.length} results</span>
      </div>

      <ErrorBanner message={error} />

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Vendor</th><th>Category</th><th>Location</th>
                {isAdmin && <th>Primary Staff</th>}
                <th className="text-right">Open Tasks</th><th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={isAdmin ? 5 : 4} className="text-center py-10 text-slate-400"><Loader2 size={18} className="animate-spin inline-block mr-2" />Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={isAdmin ? 5 : 4} className="text-center py-10 text-slate-400">No vendors found.</td></tr>
              ) : rows.map((v) => (
                <tr key={v.vendor_id} className="cursor-pointer hover:bg-surface-50" onClick={() => navigate(`/vendor-control/vendors/${v.vendor_id}`)}>
                  <td>
                    <div className="flex items-center gap-2 font-medium text-slate-800">
                      <div className="w-7 h-7 rounded-lg bg-brand-50 border border-brand-100 flex items-center justify-center flex-shrink-0">
                        <Building2 size={13} className="text-brand-500" />
                      </div>
                      <div>
                        <div>{v.company_name}</div>
                        <div className="text-xs text-slate-400 font-normal">{v.vendor_id}</div>
                      </div>
                    </div>
                  </td>
                  <td className="text-xs text-slate-500">{v.category || '—'}</td>
                  <td className="text-xs text-slate-500">
                    <span className="flex items-center gap-1"><MapPin size={11} />{[v.city, v.state].filter(Boolean).join(', ') || '—'}</span>
                  </td>
                  {isAdmin && <td className="text-xs text-slate-600">{v.primary_staff || '—'}</td>}
                  <td className="text-right"><span className="badge badge-blue text-xs">{v.task_count ?? 0}</span></td>
                  <td><ChevronRight size={14} className="text-slate-300" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
