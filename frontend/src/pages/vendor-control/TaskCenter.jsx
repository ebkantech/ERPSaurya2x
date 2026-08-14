import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, Plus, Loader2 } from 'lucide-react'
import api from '../../services/api'
import { Field, Input, Select, Textarea, Panel, Notice, TaskStatusBadge, PriorityBadge, humanize } from './ui'

const TASKS_URL = '/vendor-control/tasks/'
const CREATE_URL = '/vendor-control/tasks/create/'
const statusUrl = (id) => `/vendor-control/tasks/${id}/status/`
const VENDORS_URL = '/vendor-control/vendors/'

const TASK_TYPES = [
  'document_collection', 'quotation_followup', 'po_followup', 'delivery_followup',
  'payment_followup', 'quality_issue', 'compliance', 'general',
]

const emptyForm = () => ({
  vendor: '', assigned_staff: '', task_title: '', task_type: 'general', priority: 'medium',
  due_date: '', task_status: 'pending', description: '', remarks: '',
})

export default function TaskCenter() {
  const [rows, setRows] = useState([])
  const [meta, setMeta] = useState({ status_choices: [], priority_choices: [], task_type_choices: [], staff_options: [], is_admin: false, my_staff_id: null, can_create_tasks: true, can_update_tasks: true })
  const [vendors, setVendors] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm())
  const [submitting, setSubmitting] = useState(false)
  const [fieldErrors, setFieldErrors] = useState({})
  const [updatingId, setUpdatingId] = useState(null)

  const [filters, setFilters] = useState({ q: '', status: '', priority: '', type: '', due: '', staff: '' })

  const fetchTasks = async (f) => {
    setLoading(true)
    setError('')
    try {
      const params = {}
      Object.entries(f).forEach(([k, v]) => { if (v) params[k] = v })
      const res = await api.get(TASKS_URL, { params })
      setRows(res.data.results || [])
      setMeta({
        status_choices: res.data.status_choices || [],
        priority_choices: res.data.priority_choices || [],
        task_type_choices: res.data.task_type_choices || [],
        staff_options: res.data.staff_options || [],
        is_admin: !!res.data.is_admin,
        my_staff_id: res.data.my_staff_id ?? null,
        can_create_tasks: res.data.can_create_tasks !== false,
        can_update_tasks: res.data.can_update_tasks !== false,
      })
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load tasks.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const t = setTimeout(() => fetchTasks(filters), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters])

  useEffect(() => {
    if (showForm && meta.is_admin && !vendors.length) {
      api.get(VENDORS_URL).then((res) => setVendors(res.data.results || [])).catch(() => {})
    } else if (showForm && !meta.is_admin && !vendors.length) {
      api.get(VENDORS_URL).then((res) => setVendors(res.data.results || [])).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showForm])

  const setFilter = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }))
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setFieldErrors({})
    try {
      const payload = {
        ...form,
        vendor: Number(form.vendor),
        assigned_staff: meta.is_admin ? Number(form.assigned_staff) : meta.my_staff_id,
      }
      const res = await api.post(CREATE_URL, payload)
      setRows((r) => [res.data.task, ...r])
      setNotice({ type: 'success', message: res.data.message || 'Task created.' })
      setTimeout(() => setNotice(null), 4000)
      setForm(emptyForm())
      setShowForm(false)
    } catch (err) {
      const data = err.response?.data
      setFieldErrors(data?.field_errors || {})
      setNotice({ type: 'error', message: data?.error || 'Could not create the task.' })
    } finally {
      setSubmitting(false)
    }
  }

  const handleStatusChange = async (taskId, newStatus) => {
    setUpdatingId(taskId)
    try {
      const res = await api.post(statusUrl(taskId), { task_status: newStatus })
      setRows((rs) => rs.map((r) => (r.id === taskId ? { ...r, task_status: res.data.task.task_status } : r)))
    } catch (err) {
      setNotice({ type: 'error', message: err.response?.data?.error || 'Could not update task status.' })
    } finally {
      setUpdatingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h2 className="page-title">{meta.is_admin ? 'All Tasks' : 'My Tasks'}</h2>
          <p className="page-subtitle">{loading ? 'Loading…' : `${rows.length} tasks`}</p>
        </div>
        {meta.can_create_tasks && (
          <button className="btn-primary" onClick={() => setShowForm((s) => !s)}>
            <Plus size={14} />{showForm ? 'Close' : 'New Task'}
          </button>
        )}
      </div>

      <Notice notice={notice} onClose={() => setNotice(null)} />

      {showForm && meta.can_create_tasks && (
        <Panel title="New Task" onClose={() => setShowForm(false)}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Vendor" required>
                <Select value={form.vendor} onChange={set('vendor')} required>
                  <option value="">Select vendor</option>
                  {vendors.map((v) => <option key={v.id} value={v.id}>{v.company_name} ({v.vendor_id})</option>)}
                </Select>
                {fieldErrors.vendor && <p className="text-xs text-red-500 mt-1">{fieldErrors.vendor.join(', ')}</p>}
              </Field>
              {meta.is_admin ? (
                <Field label="Assigned Staff" required>
                  <Select value={form.assigned_staff} onChange={set('assigned_staff')} required>
                    <option value="">Select staff</option>
                    {meta.staff_options.map((s) => <option key={s.id} value={s.id}>{s.staff_name}</option>)}
                  </Select>
                </Field>
              ) : (
                <Field label="Assigned To" hint="Tasks you create are always assigned to you">
                  <Input value="Me" disabled />
                </Field>
              )}
              <div className="md:col-span-2">
                <Field label="Task Title" required>
                  <Input value={form.task_title} onChange={set('task_title')} required />
                  {fieldErrors.task_title && <p className="text-xs text-red-500 mt-1">{fieldErrors.task_title.join(', ')}</p>}
                </Field>
              </div>
              <Field label="Task Type">
                <Select value={form.task_type} onChange={set('task_type')}>
                  {TASK_TYPES.map((t) => <option key={t} value={t}>{humanize(t)}</option>)}
                </Select>
              </Field>
              <Field label="Priority">
                <Select value={form.priority} onChange={set('priority')}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </Select>
              </Field>
              <Field label="Due Date" required>
                <Input type="date" value={form.due_date} onChange={set('due_date')} required />
                {fieldErrors.due_date && <p className="text-xs text-red-500 mt-1">{fieldErrors.due_date.join(', ')}</p>}
              </Field>
              <Field label="Status">
                <Select value={form.task_status} onChange={set('task_status')}>
                  <option value="pending">Pending</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="overdue">Overdue</option>
                  <option value="cancelled">Cancelled</option>
                </Select>
              </Field>
              <div className="md:col-span-2">
                <Field label="Description"><Textarea rows={2} value={form.description} onChange={set('description')} /></Field>
              </div>
              <div className="md:col-span-2">
                <Field label="Remarks"><Textarea rows={2} value={form.remarks} onChange={set('remarks')} /></Field>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-surface-100">
              <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
              <button type="submit" disabled={submitting} className="btn-primary">
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}Create Task
              </button>
            </div>
          </form>
        </Panel>
      )}

      <div className="card p-4 flex items-center gap-3 flex-wrap">
        <div className="flex items-center bg-surface-50 border border-surface-200 rounded-lg px-3 py-2 gap-2 flex-1 min-w-[180px] max-w-xs">
          <Search size={14} className="text-slate-400 flex-shrink-0" />
          <input type="text" placeholder="Search tasks…" className="bg-transparent text-sm outline-none flex-1 placeholder-slate-400"
            value={filters.q} onChange={setFilter('q')} />
        </div>
        <Select value={filters.status} onChange={setFilter('status')} className="max-w-[150px]">
          <option value="">All statuses</option>
          {meta.status_choices.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
        <Select value={filters.priority} onChange={setFilter('priority')} className="max-w-[150px]">
          <option value="">All priorities</option>
          {meta.priority_choices.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
        <Select value={filters.type} onChange={setFilter('type')} className="max-w-[180px]">
          <option value="">All types</option>
          {meta.task_type_choices.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
        <Input type="date" value={filters.due} onChange={setFilter('due')} className="max-w-[150px]" />
        {meta.is_admin && (
          <Select value={filters.staff} onChange={setFilter('staff')} className="max-w-[180px]">
            <option value="">All staff</option>
            {meta.staff_options.map((s) => <option key={s.id} value={s.id}>{s.staff_name}</option>)}
          </Select>
        )}
        <span className="ml-auto text-xs text-slate-400">{rows.length} results</span>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr><th>Task</th><th>Vendor</th><th>Assigned To</th><th>Type</th><th>Priority</th><th>Due Date</th><th>Status</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center py-10 text-slate-400"><Loader2 size={18} className="animate-spin inline-block mr-2" />Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-10 text-slate-400">No tasks found.</td></tr>
              ) : rows.map((t) => (
                <tr key={t.id}>
                  <td className="font-medium text-slate-800">{t.task_title}</td>
                  <td>
                    <Link to={`/vendor-control/vendors/${t.vendor_id}`} className="text-xs text-brand-600 hover:text-brand-700">{t.vendor_name}</Link>
                  </td>
                  <td className="text-xs text-slate-500">{t.assigned_staff}</td>
                  <td className="text-xs text-slate-500">{humanize(t.task_type)}</td>
                  <td><PriorityBadge priority={t.priority} /></td>
                  <td className="text-xs text-slate-400">{t.due_date}</td>
                  <td>
                    {meta.can_update_tasks ? (
                      <select
                        value={t.task_status}
                        disabled={updatingId === t.id}
                        onChange={(e) => handleStatusChange(t.id, e.target.value)}
                        className="text-xs border border-surface-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-brand-300"
                      >
                        {(meta.status_choices.length ? meta.status_choices : [['pending', 'Pending'], ['in_progress', 'In Progress'], ['completed', 'Completed'], ['overdue', 'Overdue'], ['cancelled', 'Cancelled']]).map(([v, l]) => (
                          <option key={v} value={v}>{l}</option>
                        ))}
                      </select>
                    ) : (
                      <TaskStatusBadge status={t.task_status} />
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
