import React, { useEffect, useMemo, useState } from 'react'
import { Search, Plus, Loader2 } from 'lucide-react'
import api from '../../services/api'
import { useVendorControl } from './context'
import { Field, Input, Select, Panel, Notice, LoadingRow, AccessDenied } from './ui'

const STAFF_URL = '/vendor-control/staff/'
const CREATE_URL = '/vendor-control/staff/create/'
const USERS_URL = '/vendor-control/users/'

const emptyForm = () => ({
  user: '', staff_name: '', employee_id: '', role: '', department: '', designation: '',
  mobile_number: '', email: '', reporting_manager: '', is_active: true,
})

export default function StaffMaster() {
  const { isAdmin, loading: ctxLoading } = useVendorControl()
  const [rows, setRows] = useState([])
  const [roleChoices, setRoleChoices] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm())
  const [submitting, setSubmitting] = useState(false)
  const [fieldErrors, setFieldErrors] = useState({})
  const [notice, setNotice] = useState(null)

  const fetchStaff = async (q, role) => {
    setLoading(true)
    setError('')
    try {
      const params = {}
      if (q) params.q = q
      if (role) params.role = role
      const res = await api.get(STAFF_URL, { params })
      setRows(res.data.results || [])
      setRoleChoices(res.data.role_choices || [])
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load staff records.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!isAdmin) return
    const t = setTimeout(() => fetchStaff(search, roleFilter), search || roleFilter ? 300 : 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, search, roleFilter])

  useEffect(() => {
    if (isAdmin && showForm && !users.length) {
      api.get(USERS_URL).then((res) => setUsers(res.data.results || [])).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, showForm])

  const roleLabel = (value) => roleChoices.find(([v]) => v === value)?.[1] || value
  const managerOptions = useMemo(() => rows.filter((r) => r.role), [rows])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setFieldErrors({})
    try {
      const payload = {
        ...form,
        user: form.user ? Number(form.user) : '',
        reporting_manager: form.reporting_manager || '',
      }
      const res = await api.post(CREATE_URL, payload)
      setRows((r) => [res.data.staff, ...r])
      setNotice({ type: 'success', message: res.data.message || 'Staff member added.' })
      setTimeout(() => setNotice(null), 4000)
      setForm(emptyForm())
      setShowForm(false)
    } catch (err) {
      const data = err.response?.data
      setFieldErrors(data?.field_errors || {})
      setNotice({ type: 'error', message: data?.error || 'Could not add the staff member.' })
    } finally {
      setSubmitting(false)
    }
  }

  if (ctxLoading) return <LoadingRow label="Checking access…" />
  if (!isAdmin) return <AccessDenied />

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h2 className="page-title">Staff Master</h2>
          <p className="page-subtitle">{loading ? 'Loading…' : `${rows.length} staff records`}</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm((s) => !s)}>
          <Plus size={14} />{showForm ? 'Close' : 'Add Staff'}
        </button>
      </div>

      <Notice notice={notice} onClose={() => setNotice(null)} />

      {showForm && (
        <Panel title="Add Staff Member" onClose={() => setShowForm(false)}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Linked User Account" required>
                <Select value={form.user} onChange={set('user')} required>
                  <option value="">Select user</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.full_name || u.username}</option>)}
                </Select>
                {fieldErrors.user && <p className="text-xs text-red-500 mt-1">{fieldErrors.user.join(', ')}</p>}
              </Field>
              <Field label="Staff Name" required>
                <Input value={form.staff_name} onChange={set('staff_name')} required />
                {fieldErrors.staff_name && <p className="text-xs text-red-500 mt-1">{fieldErrors.staff_name.join(', ')}</p>}
              </Field>
              <Field label="Employee ID" required>
                <Input value={form.employee_id} onChange={set('employee_id')} required />
                {fieldErrors.employee_id && <p className="text-xs text-red-500 mt-1">{fieldErrors.employee_id.join(', ')}</p>}
              </Field>
              <Field label="Role" required>
                <Select value={form.role} onChange={set('role')} required>
                  <option value="">Select role</option>
                  {roleChoices.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </Select>
                {fieldErrors.role && <p className="text-xs text-red-500 mt-1">{fieldErrors.role.join(', ')}</p>}
              </Field>
              <Field label="Department"><Input value={form.department} onChange={set('department')} /></Field>
              <Field label="Designation"><Input value={form.designation} onChange={set('designation')} /></Field>
              <Field label="Mobile Number"><Input value={form.mobile_number} onChange={set('mobile_number')} /></Field>
              <Field label="Email"><Input type="email" value={form.email} onChange={set('email')} /></Field>
              <Field label="Reporting Manager">
                <Select value={form.reporting_manager} onChange={set('reporting_manager')}>
                  <option value="">None</option>
                  {managerOptions.map((m) => <option key={m.id} value={m.id}>{m.staff_name}</option>)}
                </Select>
              </Field>
              <Field label="Status">
                <label className="flex items-center gap-2 text-sm text-slate-600 mt-2">
                  <input type="checkbox" checked={form.is_active} onChange={set('is_active')} />
                  Active staff member
                </label>
              </Field>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-surface-100">
              <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
              <button type="submit" disabled={submitting} className="btn-primary">
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}Add Staff
              </button>
            </div>
          </form>
        </Panel>
      )}

      <div className="card p-4 flex items-center gap-3 flex-wrap">
        <div className="flex items-center bg-surface-50 border border-surface-200 rounded-lg px-3 py-2 gap-2 flex-1 min-w-[200px] max-w-sm">
          <Search size={14} className="text-slate-400 flex-shrink-0" />
          <input type="text" placeholder="Search name, employee ID, department…"
            className="bg-transparent text-sm outline-none flex-1 placeholder-slate-400"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="max-w-[220px]">
          <option value="">All roles</option>
          {roleChoices.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
        <span className="ml-auto text-xs text-slate-400">{rows.length} results</span>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead><tr><th>Name</th><th>Employee ID</th><th>Department</th><th>Role</th><th>Manager</th><th>Status</th></tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-10 text-slate-400"><Loader2 size={18} className="animate-spin inline-block mr-2" />Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-10 text-slate-400">No staff records found.</td></tr>
              ) : rows.map((r) => (
                <tr key={r.id}>
                  <td className="font-medium text-slate-800">{r.staff_name}</td>
                  <td className="text-xs text-slate-500">{r.employee_id}</td>
                  <td className="text-xs text-slate-500">{r.department || '—'}</td>
                  <td><span className="badge badge-blue text-xs">{roleLabel(r.role)}</span></td>
                  <td className="text-xs text-slate-500">{r.reporting_manager || '—'}</td>
                  <td><span className={`badge text-xs ${r.is_active ? 'badge-green' : 'badge-slate'}`}>{r.is_active ? 'Active' : 'Inactive'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
