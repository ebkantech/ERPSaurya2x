import React, { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Building2, MapPin, Phone, Mail, CreditCard, Send, Loader2 } from 'lucide-react'
import api from '../../services/api'
import { Field, Textarea, LoadingRow, ErrorBanner, Notice, TaskStatusBadge, PriorityBadge, AssignmentStatusBadge } from './ui'

const detailUrl = (vendorId) => `/vendor-control/vendors/${vendorId}/`
const notesUrl = (vendorId) => `/vendor-control/vendors/${vendorId}/notes/`

const TABS = ['Profile', 'Assignments', 'Tasks', 'Activity', 'Purchase Orders']

export default function VendorControlDetail() {
  const { vendorId } = useParams()
  const [payload, setPayload] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('Profile')
  const [note, setNote] = useState('')
  const [submittingNote, setSubmittingNote] = useState(false)
  const [notice, setNotice] = useState(null)

  const fetchDetail = () => {
    setLoading(true)
    setError('')
    return api.get(detailUrl(vendorId))
      .then((res) => setPayload(res.data))
      .catch((err) => setError(err.response?.data?.error || 'Could not load this vendor.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchDetail() }, [vendorId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleAddNote = async (e) => {
    e.preventDefault()
    if (!note.trim()) return
    setSubmittingNote(true)
    try {
      const res = await api.post(notesUrl(vendorId), { note })
      setPayload((p) => ({ ...p, activity: [res.data.activity, ...(p.activity || [])] }))
      setNote('')
      setNotice({ type: 'success', message: res.data.message || 'Note added.' })
      setTimeout(() => setNotice(null), 4000)
    } catch (err) {
      setNotice({ type: 'error', message: err.response?.data?.error || 'Could not add the note.' })
    } finally {
      setSubmittingNote(false)
    }
  }

  if (loading) return <LoadingRow label="Loading vendor…" />

  if (error) {
    return (
      <div className="space-y-4">
        <Link to="/vendor-control/vendors" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors">
          <ArrowLeft size={15} />Back to Vendors
        </Link>
        <ErrorBanner message={error} />
      </div>
    )
  }

  if (!payload) return null
  const { vendor, assignments = [], tasks = [], activity = [], purchase_orders: pos = [], can_edit_vendor_notes } = payload

  return (
    <div className="space-y-6 pb-4">
      <Link to="/vendor-control/vendors" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors">
        <ArrowLeft size={15} />Back to Vendors
      </Link>

      <div className="flex items-start gap-4">
        <div className="w-14 h-14 rounded-2xl bg-brand-50 border-2 border-brand-100 flex items-center justify-center flex-shrink-0">
          <Building2 size={26} className="text-brand-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900">{vendor.company_name || vendor.vendor_name}</h2>
          <p className="text-slate-500 text-sm">{vendor.vendor_category || '—'} · {vendor.vendor_id}</p>
          <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
            <MapPin size={11} />{[vendor.city, vendor.state].filter(Boolean).join(', ') || '—'}
          </p>
        </div>
      </div>

      <div className="border-b border-surface-200">
        <div className="flex gap-0 overflow-x-auto">
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-5 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                tab === t ? 'border-brand-500 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {tab === 'Profile' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="card p-5">
            <h3 className="font-semibold text-slate-900 text-sm mb-4">Registration Details</h3>
            <dl className="space-y-3">
              {[
                { l: 'GST Number', v: vendor.gst_no },
                { l: 'PAN Number', v: vendor.pan_no },
                { l: 'Status', v: vendor.status },
              ].map((r) => (
                <div key={r.l} className="flex items-center justify-between py-1.5 border-b border-surface-50 last:border-0">
                  <dt className="text-xs text-slate-500 font-medium">{r.l}</dt>
                  <dd className="text-sm text-slate-900 font-mono text-xs">{r.v || '—'}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="card p-5">
            <h3 className="font-semibold text-slate-900 text-sm mb-4">Contact Information</h3>
            <div className="space-y-3">
              {[
                { icon: MapPin, v: [vendor.address, vendor.city, vendor.state, vendor.pin_code, vendor.country].filter(Boolean).join(', ') },
                { icon: Phone, v: vendor.mobile_number },
                { icon: Mail, v: vendor.email_id },
              ].map((c, i) => {
                const Icon = c.icon
                return (
                  <div key={i} className="flex items-start gap-3">
                    <Icon size={15} className="text-slate-400 flex-shrink-0 mt-0.5" />
                    <span className="text-sm text-slate-700">{c.v || '—'}</span>
                  </div>
                )
              })}
              {vendor.contact_person && (
                <p className="text-xs text-slate-400 pl-7">Contact: {vendor.contact_person}</p>
              )}
            </div>
          </div>

          <div className="card p-5 lg:col-span-2">
            <h3 className="font-semibold text-slate-900 text-sm mb-4 flex items-center gap-2">
              <CreditCard size={15} className="text-brand-500" />Bank Details
            </h3>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{vendor.bank_details || 'Not on file.'}</p>
          </div>
        </div>
      )}

      {tab === 'Assignments' && (
        <div className="card overflow-hidden">
          <table className="data-table">
            <thead><tr><th>Staff</th><th>Role</th><th>Status</th><th>Window</th><th>Reason</th></tr></thead>
            <tbody>
              {assignments.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-8 text-slate-400">No assignment history for this vendor.</td></tr>
              ) : assignments.map((a) => (
                <tr key={a.id}>
                  <td className="font-medium text-slate-800">{a.assigned_staff}</td>
                  <td><span className="badge badge-slate text-xs capitalize">{a.assignment_role}</span></td>
                  <td><AssignmentStatusBadge status={a.status} /></td>
                  <td className="text-xs text-slate-500">{a.start_date || '—'} → {a.end_date || 'ongoing'}</td>
                  <td className="text-xs text-slate-500 max-w-[200px] truncate" title={a.assignment_reason}>{a.assignment_reason || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'Tasks' && (
        <div className="card overflow-hidden">
          <table className="data-table">
            <thead><tr><th>Task</th><th>Assigned To</th><th>Priority</th><th>Due Date</th><th>Status</th></tr></thead>
            <tbody>
              {tasks.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-8 text-slate-400">No tasks recorded for this vendor.</td></tr>
              ) : tasks.map((t) => (
                <tr key={t.id}>
                  <td className="font-medium text-slate-800">{t.task_title}</td>
                  <td className="text-xs text-slate-500">{t.assigned_staff}</td>
                  <td><PriorityBadge priority={t.priority} /></td>
                  <td className="text-xs text-slate-400">{t.due_date}</td>
                  <td><TaskStatusBadge status={t.task_status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'Activity' && (
        <div className="space-y-4">
          <Notice notice={notice} onClose={() => setNotice(null)} />
          <div className="card p-5">
            <h3 className="font-semibold text-slate-900 text-sm mb-3">Add Note</h3>
            {can_edit_vendor_notes ? (
              <form onSubmit={handleAddNote} className="space-y-3">
                <Field label="Note">
                  <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note to this vendor's activity feed…" />
                </Field>
                <div className="flex justify-end">
                  <button type="submit" disabled={submittingNote || !note.trim()} className="btn-primary">
                    {submittingNote ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}Add Note
                  </button>
                </div>
              </form>
            ) : (
              <p className="text-sm text-slate-400">You have read-only access to this vendor's activity feed.</p>
            )}
          </div>
          <div className="card p-5">
            <h3 className="font-semibold text-slate-900 text-sm mb-4">Activity Feed</h3>
            {activity.length === 0 ? (
              <p className="text-sm text-slate-400">No activity recorded yet.</p>
            ) : (
              <div className="space-y-3">
                {activity.map((a) => (
                  <div key={a.id} className="flex items-start justify-between gap-4 py-2 border-b border-surface-50 last:border-0">
                    <div>
                      <p className="text-sm text-slate-800">{a.description}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{a.activity_type_display} · {a.performed_by}</p>
                    </div>
                    <span className="text-xs text-slate-400 whitespace-nowrap">{a.created_at ? new Date(a.created_at).toLocaleString() : ''}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'Purchase Orders' && (
        <div className="card overflow-hidden">
          <table className="data-table">
            <thead><tr><th>PO Number</th><th>Date</th><th className="text-right">Value</th><th>Status</th></tr></thead>
            <tbody>
              {pos.length === 0 ? (
                <tr><td colSpan={4} className="text-center py-8 text-slate-400">No purchase orders for this vendor.</td></tr>
              ) : pos.map((po) => (
                <tr key={po.id}>
                  <td>
                    <Link to={`/purchase-orders/${po.id}`} className="font-semibold text-brand-600 hover:text-brand-700">{po.po_number}</Link>
                  </td>
                  <td className="text-xs text-slate-400">{po.po_date}</td>
                  <td className="text-right font-semibold text-slate-900">{po.total_po_value}</td>
                  <td><span className="badge badge-blue text-xs">{po.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
