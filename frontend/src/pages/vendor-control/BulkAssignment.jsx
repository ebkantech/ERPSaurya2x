import React, { useEffect, useMemo, useState } from 'react'
import { Users, Upload, Shuffle, Loader2 } from 'lucide-react'
import api from '../../services/api'
import { useVendorControl } from './context'
import { Field, Select, Textarea, Notice, LoadingRow, AccessDenied } from './ui'

const VENDORS_URL = '/vendor-control/vendors/'
const STAFF_URL = '/vendor-control/staff/'
const BULK_URL = '/vendor-control/assignments/bulk/'
const BULK_UPLOAD_URL = '/vendor-control/assignments/bulk/upload/'
const AUTO_DISTRIBUTE_URL = '/vendor-control/assignments/auto-distribute/'

const TABS = [
  { key: 'bulk', label: 'Bulk Assign', icon: Users },
  { key: 'upload', label: 'Excel Upload', icon: Upload },
  { key: 'auto', label: 'Auto-Distribute', icon: Shuffle },
]

function MultiSelect({ options, value, onChange, getLabel, getValue, size = 8 }) {
  const handleChange = (e) => {
    const selected = Array.from(e.target.selectedOptions).map((o) => o.value)
    onChange(selected)
  }
  return (
    <select multiple value={value} onChange={handleChange} size={size}
      className="w-full px-2 py-2 text-sm border border-surface-200 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition">
      {options.map((o) => (
        <option key={getValue(o)} value={getValue(o)}>{getLabel(o)}</option>
      ))}
    </select>
  )
}

export default function BulkAssignment() {
  const { isAdmin, loading: ctxLoading } = useVendorControl()
  const [tab, setTab] = useState('bulk')
  const [vendors, setVendors] = useState([])
  const [staff, setStaff] = useState([])
  const [optionsLoading, setOptionsLoading] = useState(true)
  const [notice, setNotice] = useState(null)

  useEffect(() => {
    if (!isAdmin) return
    setOptionsLoading(true)
    Promise.all([
      api.get(VENDORS_URL).then((res) => setVendors(res.data.results || [])).catch(() => {}),
      api.get(STAFF_URL).then((res) => setStaff(res.data.results || [])).catch(() => {}),
    ]).finally(() => setOptionsLoading(false))
  }, [isAdmin])

  const activeStaff = useMemo(() => staff.filter((s) => s.is_active), [staff])

  if (ctxLoading) return <LoadingRow label="Checking access…" />
  if (!isAdmin) return <AccessDenied />

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h2 className="page-title">Bulk Assignment</h2>
          <p className="page-subtitle">Assign, import, or auto-distribute vendors across staff in one action.</p>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {TABS.map((t) => {
          const Icon = t.icon
          return (
            <button key={t.key} onClick={() => { setTab(t.key); setNotice(null) }}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                tab === t.key ? 'bg-brand-500 text-white border-brand-500 shadow-sm' : 'bg-white text-slate-600 border-surface-200 hover:border-brand-300'
              }`}>
              <Icon size={14} />{t.label}
            </button>
          )
        })}
      </div>

      <Notice notice={notice} onClose={() => setNotice(null)} />

      {optionsLoading ? (
        <LoadingRow label="Loading vendors and staff…" />
      ) : (
        <>
          {tab === 'bulk' && <BulkAssignForm vendors={vendors} staff={activeStaff} setNotice={setNotice} />}
          {tab === 'upload' && <ExcelUploadForm setNotice={setNotice} />}
          {tab === 'auto' && <AutoDistributeForm vendors={vendors} staff={activeStaff} setNotice={setNotice} />}
        </>
      )}
    </div>
  )
}

function BulkAssignForm({ vendors, staff, setNotice }) {
  const [selectedVendors, setSelectedVendors] = useState([])
  const [assignedStaff, setAssignedStaff] = useState('')
  const [role, setRole] = useState('primary')
  const [reason, setReason] = useState('')
  const [remarks, setRemarks] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!selectedVendors.length || !assignedStaff) {
      setNotice({ type: 'error', message: 'Select at least one vendor and a staff member.' })
      return
    }
    setSubmitting(true)
    setNotice(null)
    try {
      const fd = new FormData()
      fd.append('assigned_staff', assignedStaff)
      fd.append('assignment_role', role)
      if (reason) fd.append('assignment_reason', reason)
      if (remarks) fd.append('remarks', remarks)
      selectedVendors.forEach((v) => fd.append('vendors', v))
      const res = await api.post(BULK_URL, fd, { headers: { 'Content-Type': undefined } })
      setNotice({ type: 'success', message: res.data.message || 'Vendors assigned.' })
      setSelectedVendors([])
      setAssignedStaff('')
      setReason('')
      setRemarks('')
    } catch (err) {
      const data = err.response?.data
      const fieldMsg = data?.field_errors ? Object.values(data.field_errors).flat().join(', ') : ''
      setNotice({ type: 'error', message: data?.error || fieldMsg || 'Could not complete the bulk assignment.' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card p-5 space-y-4">
      <p className="text-xs text-slate-500">Assign several vendors to a single staff member in one action.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label={`Vendors (${selectedVendors.length} selected)`} required hint="Ctrl/Cmd+click to select multiple">
          <MultiSelect options={vendors} value={selectedVendors} onChange={setSelectedVendors}
            getValue={(v) => v.id} getLabel={(v) => `${v.company_name} (${v.vendor_id})`} />
        </Field>
        <div className="space-y-4">
          <Field label="Assigned Staff" required>
            <Select value={assignedStaff} onChange={(e) => setAssignedStaff(e.target.value)} required>
              <option value="">Select staff</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.staff_name} ({s.employee_id})</option>)}
            </Select>
          </Field>
          <Field label="Assignment Role" required>
            <Select value={role} onChange={(e) => setRole(e.target.value)} required>
              <option value="primary">Primary</option>
              <option value="supporting">Supporting</option>
            </Select>
          </Field>
        </div>
      </div>
      <Field label="Assignment Reason"><Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      <Field label="Remarks"><Textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} /></Field>
      <div className="flex justify-end pt-2 border-t border-surface-100">
        <button type="submit" disabled={submitting} className="btn-primary">
          {submitting ? <Loader2 size={14} className="animate-spin" /> : <Users size={14} />}Assign Vendors
        </button>
      </div>
    </form>
  )
}

function ExcelUploadForm({ setNotice }) {
  const [file, setFile] = useState(null)
  const [defaultRole, setDefaultRole] = useState('primary')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!file) {
      setNotice({ type: 'error', message: 'Choose an .xlsx file first.' })
      return
    }
    setSubmitting(true)
    setNotice(null)
    try {
      const fd = new FormData()
      fd.append('assignment_file', file)
      fd.append('default_role', defaultRole)
      const res = await api.post(BULK_UPLOAD_URL, fd, { headers: { 'Content-Type': undefined } })
      setNotice({ type: 'success', message: res.data.message || 'Assignments imported.' })
      setFile(null)
    } catch (err) {
      setNotice({ type: 'error', message: err.response?.data?.error || 'Could not import the assignment file.' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card p-5 space-y-4 max-w-lg">
      <p className="text-xs text-slate-500">
        Upload an .xlsx file with <span className="font-mono font-semibold">vendor_id</span> and{' '}
        <span className="font-mono font-semibold">employee_id</span> columns. Each row assigns that vendor to
        that staff member.
      </p>
      <Field label="Assignment File (.xlsx)" required>
        <input type="file" accept=".xlsx" onChange={(e) => setFile(e.target.files?.[0] || null)} required
          className="w-full text-sm text-slate-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100 transition" />
      </Field>
      <Field label="Default Role" hint="Used when the file doesn't specify a role" required>
        <Select value={defaultRole} onChange={(e) => setDefaultRole(e.target.value)} required>
          <option value="primary">Primary</option>
          <option value="supporting">Supporting</option>
        </Select>
      </Field>
      <div className="flex justify-end pt-2 border-t border-surface-100">
        <button type="submit" disabled={submitting} className="btn-primary">
          {submitting ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}Upload &amp; Assign
        </button>
      </div>
    </form>
  )
}

function AutoDistributeForm({ vendors, staff, setNotice }) {
  const [strategy, setStrategy] = useState('workload')
  const [role, setRole] = useState('primary')
  const [selectedStaff, setSelectedStaff] = useState([])
  const [selectedVendors, setSelectedVendors] = useState([])
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!selectedStaff.length) {
      setNotice({ type: 'error', message: 'Select at least one staff member to distribute vendors across.' })
      return
    }
    setSubmitting(true)
    setNotice(null)
    try {
      const fd = new FormData()
      fd.append('strategy', strategy)
      fd.append('assignment_role', role)
      selectedStaff.forEach((s) => fd.append('staff_members', s))
      selectedVendors.forEach((v) => fd.append('vendors', v))
      const res = await api.post(AUTO_DISTRIBUTE_URL, fd, { headers: { 'Content-Type': undefined } })
      setNotice({ type: 'success', message: res.data.message || 'Vendors distributed.' })
      setSelectedStaff([])
      setSelectedVendors([])
    } catch (err) {
      setNotice({ type: 'error', message: err.response?.data?.error || 'Could not auto-distribute vendors.' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card p-5 space-y-4">
      <p className="text-xs text-slate-500">
        Spread vendors evenly across a set of staff. Leave vendors unselected to auto-distribute all currently
        unassigned vendors.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Strategy" required>
          <Select value={strategy} onChange={(e) => setStrategy(e.target.value)} required>
            <option value="workload">Balance by workload</option>
            <option value="location">Group by location</option>
            <option value="category">Group by category</option>
          </Select>
        </Field>
        <Field label="Assignment Role" required>
          <Select value={role} onChange={(e) => setRole(e.target.value)} required>
            <option value="primary">Primary</option>
            <option value="supporting">Supporting</option>
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label={`Staff Members (${selectedStaff.length} selected)`} required hint="Ctrl/Cmd+click to select multiple">
          <MultiSelect options={staff} value={selectedStaff} onChange={setSelectedStaff}
            getValue={(s) => s.id} getLabel={(s) => `${s.staff_name} (${s.employee_id})`} />
        </Field>
        <Field label={`Vendors (${selectedVendors.length} selected, optional)`} hint="Leave blank to auto-distribute all unassigned vendors">
          <MultiSelect options={vendors} value={selectedVendors} onChange={setSelectedVendors}
            getValue={(v) => v.id} getLabel={(v) => `${v.company_name} (${v.vendor_id})`} />
        </Field>
      </div>
      <div className="flex justify-end pt-2 border-t border-surface-100">
        <button type="submit" disabled={submitting} className="btn-primary">
          {submitting ? <Loader2 size={14} className="animate-spin" /> : <Shuffle size={14} />}Distribute Vendors
        </button>
      </div>
    </form>
  )
}
