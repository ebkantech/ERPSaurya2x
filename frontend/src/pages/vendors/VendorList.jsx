import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Search, Plus, Building2, MapPin, Mail, ChevronRight, SlidersHorizontal, Loader2, Copy, ExternalLink, Clock, CheckCircle2 } from 'lucide-react'
import api from '../../services/api'

const VENDORS_URL = '/vendors/'

const FILTERS = ['All', 'Registered', 'Pending Payment']

export default function VendorList() {
  const navigate = useNavigate()
  const [vendors, setVendors] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [copied, setCopied] = useState('') // vendor_id whose link was just copied

  useEffect(() => {
    let active = true
    api.get(VENDORS_URL)
      .then(res => { if (active) setVendors(res.data.vendors || []) })
      .catch(() => { if (active) setError('Could not load vendors.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const isPending = (v) => v.registration_status === 'pending_payment'

  const filtered = vendors.filter(v => {
    const q = search.toLowerCase()
    const matchQ =
      (v.company_name || '').toLowerCase().includes(q) ||
      (v.vendor_id || '').toLowerCase().includes(q) ||
      (v.city || '').toLowerCase().includes(q)
    const matchS =
      statusFilter === 'All' ||
      (statusFilter === 'Registered' && !isPending(v)) ||
      (statusFilter === 'Pending Payment' && isPending(v))
    return matchQ && matchS
  })

  const registeredCount = vendors.filter(v => !isPending(v)).length
  const pendingCount = vendors.filter(v => isPending(v)).length

  const copyLink = async (e, v) => {
    e.preventDefault(); e.stopPropagation()
    if (!v.payment_link_url) return
    try {
      await navigator.clipboard.writeText(v.payment_link_url)
      setCopied(v.vendor_id)
      setTimeout(() => setCopied(''), 2000)
    } catch { /* clipboard blocked — the Open link still works */ }
  }

  return (
    <div className="space-y-6 pb-4">
      {/* Header */}
      <div className="page-header">
        <div>
          <h2 className="page-title">Vendor Management</h2>
          <p className="page-subtitle">
            {vendors.length} vendors · {registeredCount} registered · {pendingCount} awaiting payment
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/vendors/new" className="btn-primary"><Plus size={15} />Add Vendor</Link>
        </div>
      </div>

      {/* Filter bar */}
      <div className="card p-4 flex items-center gap-3 flex-wrap">
        <div className="flex items-center bg-surface-50 border border-surface-200 rounded-lg px-3 py-2 gap-2 flex-1 min-w-[200px] max-w-sm">
          <Search size={14} className="text-slate-400 flex-shrink-0" />
          <input
            type="text"
            placeholder="Search by name, code, city…"
            className="bg-transparent text-sm text-slate-700 placeholder-slate-400 outline-none flex-1"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-1.5">
          {FILTERS.map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                statusFilter === s ? 'bg-brand-500 text-white shadow-sm' : 'bg-surface-50 text-slate-600 border border-surface-200 hover:bg-surface-100'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <button className="btn-secondary ml-auto"><SlidersHorizontal size={14} />Filters</button>
        <span className="text-xs text-slate-400 font-medium">{filtered.length} results</span>
      </div>

      {/* States */}
      {loading && (
        <div className="flex items-center gap-2 text-sm text-slate-500 py-16 justify-center">
          <Loader2 size={16} className="animate-spin" />Loading vendors…
        </div>
      )}
      {!loading && error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>
      )}
      {!loading && !error && filtered.length === 0 && (
        <div className="card p-10 text-center text-sm text-slate-500">
          No vendors found. <Link to="/vendors/new" className="text-brand-600 font-medium">Register one →</Link>
        </div>
      )}

      {/* Cards grid */}
      {!loading && !error && filtered.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
          {filtered.map(v => {
            const pending = isPending(v)
            return (
              <div key={v.vendor_id}
                onClick={() => navigate(`/vendors/${v.vendor_id}`)}
                className="card p-5 hover:shadow-card-hover hover:border-brand-200 transition-all duration-150 group block cursor-pointer"
              >
                {/* Card top */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center flex-shrink-0">
                      <Building2 size={20} className="text-brand-600" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-400">{v.vendor_id}</p>
                      <span className={`badge text-xs mt-0.5 inline-flex items-center gap-1 ${pending ? 'badge-amber' : 'badge-green'}`}>
                        {pending ? <><Clock size={10} />Pending Payment</> : <><CheckCircle2 size={10} />Registered</>}
                      </span>
                    </div>
                  </div>
                  {v.msme && <span className="badge badge-violet text-xs">MSME</span>}
                </div>

                <h3 className="font-semibold text-slate-900 text-sm mb-0.5 group-hover:text-brand-600 transition-colors truncate">{v.company_name}</h3>
                <p className="text-xs text-slate-400 mb-4">{v.vendor_category || '—'}</p>

                <div className="space-y-1.5 mb-4">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <MapPin size={11} className="flex-shrink-0 text-slate-400" />{[v.city, v.state].filter(Boolean).join(', ') || '—'}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Mail size={11} className="flex-shrink-0 text-slate-400" />{v.email_id || '—'}
                  </div>
                </div>

                {/* Payment link — only for vendors still owing the fee */}
                {pending && v.payment_link_url && (
                  <div className="mb-4 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2.5">
                    <p className="text-xs font-medium text-amber-800 mb-1.5">
                      Onboarding fee unpaid — final registration is on hold until the vendor pays.
                    </p>
                    <div className="flex items-center gap-1.5">
                      <button onClick={(e) => copyLink(e, v)}
                        className="flex items-center gap-1 text-xs font-medium text-amber-800 bg-white border border-amber-200 rounded-md px-2 py-1 hover:bg-amber-100 transition">
                        <Copy size={11} />{copied === v.vendor_id ? 'Copied' : 'Copy link'}
                      </button>
                      <a href={v.payment_link_url} target="_blank" rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1 text-xs font-medium text-amber-800 bg-white border border-amber-200 rounded-md px-2 py-1 hover:bg-amber-100 transition">
                        <ExternalLink size={11} />Open
                      </a>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between pt-4 border-t border-surface-100">
                  <span className="text-xs text-slate-400">{v.created_at}</span>
                  <ChevronRight size={15} className="text-slate-300 group-hover:text-brand-500 transition-colors" />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
