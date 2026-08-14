import React, { useEffect, useMemo, useState } from 'react'
import { Search, Plus, Loader2, X } from 'lucide-react'
import api from '../../services/api'
import { useVendorControl } from './context'
import { Field, Input, Select, Textarea, Panel, Notice, LoadingRow, AccessDenied, AssignmentStatusBadge } from './ui'

const ASSIGNMENTS_URL = '/vendor-control/assignments/'
const CREATE_URL = '/vendor-control/assignments/create/'
const removeUrl = (id) => `/vendor-control/assignments/${id}/remove/`
const VENDORS_URL = '/vendor-control/vendors/'
const STAFF_URL = '/vendor-control/staff/'

const emptyForm = () => ({
  vendor: '', assigned_staff: '', assignment_role: 'primary',
  start_date: new Date().toISOString().slice(0, 10), end_date: '',
  assignment_status: 'active', assignment_reason: '', remarks: '',
})

export default function AssignmentList() {
  const { isAdmin, loading: ctxLoading } = useVendorControl()
  const [rows, setRows] = useState([])
  const [statusChoices, setStatusChoices] = useState([])
  const [vendors, setVendors] = useState([])
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm())
  const [submitting, setSubmitting] = useState(false)
  const [fieldErrors, setFieldErrors] = useState({})
  const [notice, setNotice] = useState(null)
  const [confirmRemoveId, setConfirmRemoveId] = useState(null)
  const [removing, setRemoving] = useState(false)

  const fetchAssignments = async (q, status) => {
    setLoading(true)
    setError('')
    try {
      const params = {}
      if (q) params.q = q
      if (status) params.status = status
      const res = await api.get(ASSIGNMENTS_URL, { params })
      setRows(res.data.results || [])
      setStatusChoices(res.data.status_choices || [])
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load assignments.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!isAdmin) return
    const t = setTimeout(() => fetchAssignments(search, statusFilter), search || statusFilter ? 300 : 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, search, statusFilter])

  useEffect(() => {
    if (!isAdmin || !showForm) return
    if (!vendors.length) api.get(VENDORS_URL).then((res) => setVendors(res.data.results || [])).catch(() => {})
    if (!staff.length) api.get(STAFF_URL).then((res) => setStaff(res.data.results || [])).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, showForm])

  const activeStaff = useMemo(() => staff.filter((s) => s.is_active), [staff])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setFieldErrors({})
    try {
      const payload = {
        ...form,
        vendor: Number(form.vendor),
        assigned_staff: Number(form.assigned_staff),
        end_date: form.end_date || '',
      }
      const res = await api.post(CREATE_URL, payload)
      setRows((r) => [res.data.assignment, ...r])
      setNotice({ type: 'success', message: res.data.message || 'Assignment created.' })
      setTimeout(() => setNotice(null), 4000)
      setForm(emptyForm())
      setShowForm(false)
    } catch (err) {
      const data = err.response?.data
      setFieldErrors(data?.field_errors || {})
      setNotice({ type: 'error', message: data?.error || 'Could not create the assignment.' })
    } finally {
      setSubmitting(false)
    }
  }

  const handleRemove = async (id) => {
    setRemoving(true)
    try {
      const res = await api.post(removeUrl(id), {})
      setRows((rs) => rs.map((r) => (r.id === id ? res.data.assignment : r)))
      setNotice({ type: 'success', message: res.data.message || 'Assignment removed.' })
      setTimeout(() => setNotice(null), 4000)
    } catch (err) {
      setNotice({ type: 'error', message: err.response?.data?.error || 'Could not remove the assignment.' })
    } finally {
      setRemoving(false)
      setConfirmRemoveId(null)
    }
  }

  if (ctxLoading) return <LoadingRow label="Checking access…" />
  if (!isAdmin) return <AccessDenied />

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h2 className="page-title">Vendor Assignments</h2>
          <p className="page-subtitle">{loading ? 'Loading…' : `${rows.length} assignments`}</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm((s) => !s)}>
          <Plus size={14} />{showForm ? 'Close' : 'New Assignment'}
        </button>
      </div>

      <Notice notice={notice} onClose={() => setNotice(null)} />

      {showForm && (
        <Panel title="New Assignment" onClose={() => setShowForm(false)}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Vendor" required>
                <Select value={form.vendor} onChange={set('vendor')} required>
                  <option value="">Select vendor</option>
                  {vendors.map((v) => <option key={v.id} value={v.id}>{v.company_name} ({v.vendor_id})</option>)}
                </Select>
                {fieldErrors.vendor && <p className="text-xs text-red-500 mt-1">{fieldErrors.vendor.join(', ')}</p>}
              </Field>
              <Field label="Assigned Staff" required>
                <Select value={form.assigned_staff} onChange={set('assigned_staff')} required>
                  <option value="">Select staff (active only)</option>
                  {activeStaff.map((s) => <option key={s.id} value={s.id}>{s.staff_name} ({s.employee_id})</option>)}
                </Select>
                {fieldErrors.assigned_staff && <p className="text-xs text-red-500 mt-1">{fieldErrors.assigned_staff.join(', ')}</p>}
              </Field>
              <Field label="Assignment Role" required>
                <Select value={form.assignment_role} onChange={set('assignment_role')} required>
                  <option value="primary">Primary</option>
                  <option value="supporting">Supporting</option>
                </Select>
              </Field>
              <Field label="Status">
                <Select value={form.assignment_status} onChange={set('assignment_status')}>
                  <option value="active">Active</option>
                  <option value="reassigned">Reassigned</option>
                  <option value="removed">Removed</option>
                  <option value="on_hold">On Hold</option>
                </Select>
              </Field>
              <Field label="Start Date"><Input type="date" value={form.start_date} onChange={set('start_date')} /></Field>
              <Field label="End Date (optional)"><Input type="date" value={form.end_date} onChange={set('end_date')} /></Field>
              <div className="md:col-span-2">
                <Field label="Assignment Reason"><Textarea rows={2} value={form.assignment_reason} onChange={set('assignment_reason')} placeholder="Why this vendor is being assigned to this staff member" /></Field>
              </div>
              <div className="md:col-span-2">
                <Field label="Remarks"><Textarea rows={2} value={form.remarks} onChange={set('remarks')} /></Field>
              </div>
            </div>
            <p className="text-xs text-slate-400">
              If the selected vendor already has an active Primary staff member, assigning a new Primary will
              automatically reassign it and record the change in the assignment history.
            </p>
            <div className="flex justify-end gap-2 pt-2 border-t border-surface-100">
              <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
              <button type="submit" disabled={submitting} className="btn-primary">
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}Create Assignment
              </button>
            </div>
          </form>
        </Panel>
      )}

      <div className="card p-4 flex items-center gap-3 flex-wrap">
        <div className="flex items-center bg-surface-50 border border-surface-200 rounded-lg px-3 py-2 gap-2 flex-1 min-w-[200px] max-w-sm">
          <Search size={14} className="text-slate-400 flex-shrink-0" />
          <input type="text" placeholder="Search vendor or staff…"
            className="bg-transparent text-sm outline-none flex-1 placeholder-slate-400"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="max-w-[200px]">
          <option value="">All statuses</option>
          {statusChoices.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
        <span className="ml-auto text-xs text-slate-400">{rows.length} results</span>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead><tr><th>Vendor</th><th>Staff</th><th>Role</th><th>Window</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-10 text-slate-400"><Loader2 size={18} className="animate-spin inline-block mr-2" />Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-10 text-slate-400">No assignments found.</td></tr>
              ) : rows.map((r) => (
                <tr key={r.id}>
                  <td className="font-medium text-slate-800">{r.vendor_name}</td>
                  <td className="text-slate-600">{r.assigned_staff}</td>
                  <td><span className="badge badge-slate text-xs capitalize">{r.assignment_role}</span></td>
                  <td className="text-xs text-slate-500">{r.start_date || '—'} → {r.end_date || 'ongoing'}</td>
                  <td><AssignmentStatusBadge status={r.status} /></td>
                  <td className="text-right">
                    {r.status === 'active' && (
                      confirmRemoveId === r.id ? (
                        <span className="inline-flex items-center gap-1.5">
                          <button className="text-xs font-semibold text-red-600 hover:text-red-700" disabled={removing} onClick={() => handleRemove(r.id)}>
                            {removing ? <Loader2 size={12} className="animate-spin inline" /> : 'Confirm'}
                          </button>
                          <button className="text-xs text-slate-400 hover:text-slate-600" onClick={() => setConfirmRemoveId(null)}><X size={12} /></button>
                        </span>
                      ) : (
                        <button className="text-xs font-medium text-red-500 hover:text-red-600" onClick={() => setConfirmRemoveId(r.id)}>Remove</button>
                      )
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
