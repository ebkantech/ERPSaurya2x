import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  Pencil, Plus, Trash2, Loader2, AlertCircle, CheckCircle2, ShieldCheck, Save, X, ArrowLeft, Download,
  Eye, Send, UserSquare2,
} from 'lucide-react'
import api from '../../services/api'

function getCookie(name) {
  const value = `; ${document.cookie}`
  const parts = value.split(`; ${name}=`)
  if (parts.length === 2) return parts.pop().split(';').shift()
  return ''
}

const detailUrl = (id) => `/procurement/api/quotations/${id}/`
const updateUrl = (id) => `/procurement/api/quotations/${id}/update/`
const verifyUrl = (id) => `/procurement/api/quotations/${id}/verify/`
const generateUrl = (id) => `/procurement/api/quotations/${id}/generate-po/`
const pdfUrl = (id) => `/procurement/api/quotations/${id}/pdf/`
const VENDOR_OPTIONS_URL = '/procurement/api/vendors/'
const MATERIAL_OPTIONS_URL = '/materials/master/options/'

const STATUS_LABELS = {
  draft: { label: 'Draft', className: 'bg-slate-100 text-slate-600' },
  verified: { label: 'Verified', className: 'bg-emerald-100 text-emerald-700' },
  converted: { label: 'Converted to PO', className: 'bg-brand-100 text-brand-700' },
}

const DIVISION_CHOICES = [
  { value: 'solar', label: 'Solar' },
  { value: 'biogas', label: 'Biogas' },
  { value: 'infrastructure', label: 'Infrastructure' },
  { value: 'pharma', label: 'Pharma' },
  { value: 'other', label: 'Other' },
]

const Field = ({ label, required, children }) => (
  <div>
    <label className="block text-xs font-medium text-slate-600 mb-1">
      {label}{required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
    {children}
  </div>
)

const Input = (props) => (
  <input
    {...props}
    className="w-full px-3 py-2 text-sm border border-surface-200 rounded-lg bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition"
  />
)

const Select = ({ children, ...props }) => (
  <select
    {...props}
    className="w-full px-3 py-2 text-sm border border-surface-200 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition"
  >
    {children}
  </select>
)

const Textarea = (props) => (
  <textarea
    {...props}
    className="w-full px-3 py-2 text-sm border border-surface-200 rounded-lg bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition resize-none"
  />
)

export default function QuotationDetail() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [quotation, setQuotation] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [alert, setAlert] = useState(null)

  const [editing, setEditing] = useState(false)
  const [editRows, setEditRows] = useState([])
  const [editParty, setEditParty] = useState(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [verifying, setVerifying] = useState(false)

  const [materialOptions, setMaterialOptions] = useState([])
  const [vendors, setVendors] = useState([])
  const [vendorsLoading, setVendorsLoading] = useState(true)
  const [poForm, setPoForm] = useState({
    po_number: '', po_date: new Date().toISOString().slice(0, 10), vendor: '',
    business_division: 'solar', project_site_name: '', project_location: '',
    delivery_address: '', dispatch_origin: '', department: '',
    payment_terms: '', delivery_terms: '', expected_delivery_date: '',
  })
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState('')
  const [success, setSuccess] = useState(null)

  const fetchQuotation = () => {
    setLoading(true)
    setLoadError('')
    fetch(detailUrl(id), { credentials: 'same-origin' })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) throw new Error(data.error || 'Could not load this quotation.')
        setQuotation(data.quotation)
      })
      .catch((err) => setLoadError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchQuotation() }, [id])

  useEffect(() => {
    fetch(VENDOR_OPTIONS_URL, { credentials: 'same-origin' })
      .then((res) => res.json())
      .then((data) => setVendors(data.results || []))
      .catch(() => setVendors([]))
      .finally(() => setVendorsLoading(false))
  }, [])

  useEffect(() => {
    api.get(MATERIAL_OPTIONS_URL)
      .then((res) => setMaterialOptions(res.data.results || []))
      .catch(() => setMaterialOptions([]))
  }, [])

  const quotationTotal = useMemo(() => {
    if (!quotation) return 0
    return quotation.rows.reduce((sum, row) => sum + (row.amount ? parseFloat(row.amount) : 0), 0)
  }, [quotation])

  const startEditing = () => {
    setEditRows(quotation.rows.map((r) => ({ material_name: r.material_name, unit: r.unit, quantity: r.requested_qty ?? '' })))
    setEditParty({
      client_name: quotation.client_name, client_address: quotation.client_address, client_mobile: quotation.client_mobile,
      sender_name: quotation.sender_name, sender_address: quotation.sender_address, sender_mobile: quotation.sender_mobile,
    })
    setEditing(true)
    setAlert(null)
  }
  const cancelEditing = () => setEditing(false)
  const setEditPartyField = (key) => (e) => setEditParty((p) => ({ ...p, [key]: e.target.value }))
  const updateEditRow = (index, key, value) => {
    setEditRows((rows) => rows.map((row, i) => (i === index ? { ...row, [key]: value } : row)))
  }
  const handleEditMaterialNameChange = (index, value) => {
    setEditRows((rows) => rows.map((row, i) => {
      if (i !== index) return row
      if (!row.unit) {
        const match = materialOptions.find((o) => o.material_name.toLowerCase() === value.toLowerCase())
        if (match) return { ...row, material_name: value, unit: match.unit }
      }
      return { ...row, material_name: value }
    }))
  }
  const addEditRow = () => setEditRows((rows) => [...rows, { material_name: '', unit: '', quantity: '' }])
  const removeEditRow = (index) => setEditRows((rows) => rows.filter((_, i) => i !== index))

  const saveEdits = async () => {
    const items = editRows.filter((r) => r.material_name || r.unit || r.quantity)
    if (!items.length) {
      setAlert({ type: 'error', message: 'Add at least one product row.' })
      return
    }
    setSavingEdit(true)
    setAlert(null)
    try {
      const res = await fetch(updateUrl(id), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') },
        body: JSON.stringify({ items, ...editParty }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not update the quotation.')
      setQuotation(data.quotation)
      setEditing(false)
      setAlert({ type: 'success', message: data.message })
    } catch (err) {
      setAlert({ type: 'error', message: err.message })
    } finally {
      setSavingEdit(false)
    }
  }

  const handleVerify = async () => {
    setVerifying(true)
    setAlert(null)
    try {
      const res = await fetch(verifyUrl(id), {
        method: 'POST',
        headers: { 'X-CSRFToken': getCookie('csrftoken') },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not verify this quotation.')
      setQuotation(data.quotation)
      setAlert({ type: data.quotation.all_matched ? 'success' : 'warning', message: data.message })
    } catch (err) {
      setAlert({ type: 'error', message: err.message })
    } finally {
      setVerifying(false)
    }
  }

  const setPoField = (key) => (e) => setPoForm((f) => ({ ...f, [key]: e.target.value }))

  const handleGenerate = async (e) => {
    e.preventDefault()
    setGenerating(true)
    setGenerateError('')
    try {
      const res = await fetch(generateUrl(id), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') },
        body: JSON.stringify({ ...poForm, status: 'draft' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const fieldErrors = data.field_errors
          ? Object.entries(data.field_errors).map(([k, v]) => `${k}: ${v.map((e) => e.message || e).join(', ')}`).join(' | ')
          : ''
        throw new Error(data.error || fieldErrors || 'Could not generate the purchase order.')
      }
      setSuccess({ po_number: data.po_number })
    } catch (err) {
      setGenerateError(err.message)
      fetchQuotation()
    } finally {
      setGenerating(false)
    }
  }

  if (loading) {
    return <div className="py-16 text-center text-slate-400"><Loader2 size={20} className="animate-spin inline-block mr-2" />Loading quotation…</div>
  }
  if (loadError) {
    return (
      <div className="flex items-center gap-2.5 bg-red-50 text-red-700 border border-red-200 rounded-xl px-4 py-3 text-sm">
        <AlertCircle size={16} />{loadError}
      </div>
    )
  }

  const status = STATUS_LABELS[quotation.status] || STATUS_LABELS.draft

  if (success) {
    return (
      <div className="space-y-6 pb-4">
        <div className="page-header">
          <div><h2 className="page-title">{quotation.quotation_number}</h2><p className="page-subtitle">Purchase order generated</p></div>
        </div>
        <div className="card p-10 flex flex-col items-center text-center gap-3 max-w-lg mx-auto">
          <div className="w-14 h-14 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center">
            <CheckCircle2 size={28} className="text-emerald-500" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">Purchase Order {success.po_number} generated</h3>
          <p className="text-sm text-slate-500">This quotation is now locked and linked to the purchase order.</p>
          <div className="flex gap-2 mt-2">
            <a className="btn-secondary" href={pdfUrl(id)} target="_blank" rel="noreferrer">
              <Download size={14} />Download PDF
            </a>
            <button className="btn-primary" onClick={() => navigate('/materials/quotations')}>Back to Quotations</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-4">
      <div className="page-header">
        <div>
          <Link to="/materials/quotations" className="text-xs text-slate-400 flex items-center gap-1 mb-1 hover:text-slate-600">
            <ArrowLeft size={12} />Back to Quotations
          </Link>
          <div className="flex items-center gap-2">
            <h2 className="page-title">{quotation.quotation_number}</h2>
            <span className={`badge text-xs ${status.className}`}>{status.label}</span>
          </div>
          <p className="page-subtitle">
            Created {new Date(quotation.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
            {quotation.verified_at && ` · Verified ${new Date(quotation.verified_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`}
          </p>
        </div>
        {!editing && (
          <div className="flex items-center gap-2">
            <Link className="btn-secondary" to={`/materials/quotations/${id}/preview`}>
              <Eye size={14} />Preview
            </Link>
            <a className="btn-secondary" href={pdfUrl(id)} target="_blank" rel="noreferrer">
              <Download size={14} />Download PDF
            </a>
            {!quotation.is_locked && (
              <>
                <button className="btn-secondary" onClick={startEditing}><Pencil size={14} />Edit</button>
                <button className="btn-primary" disabled={verifying} onClick={handleVerify}>
                  {verifying ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                  Verify
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {alert && (
        <div className={`flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm border ${
          alert.type === 'error' ? 'bg-red-50 text-red-700 border-red-200'
            : alert.type === 'warning' ? 'bg-amber-50 text-amber-700 border-amber-200'
              : 'bg-emerald-50 text-emerald-700 border-emerald-200'
        }`}>
          {alert.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
          {alert.message}
        </div>
      )}

      {quotation.is_locked && (
        <div className="flex items-center gap-2.5 bg-brand-50 text-brand-700 border border-brand-200 rounded-xl px-4 py-3 text-sm">
          <CheckCircle2 size={16} />
          This quotation was converted to Purchase Order <strong>{quotation.po_number}</strong> and is now locked.
        </div>
      )}

      {!editing && (quotation.client_name || quotation.client_address || quotation.client_mobile
        || quotation.sender_name || quotation.sender_address || quotation.sender_mobile) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="card p-4 space-y-1">
            <div className="flex items-center gap-2 font-semibold text-slate-800 text-sm mb-1">
              <Send size={15} className="text-brand-500" /> From
            </div>
            <p className="text-sm text-slate-700">{quotation.sender_name || '-'}</p>
            {quotation.sender_address && <p className="text-xs text-slate-500">{quotation.sender_address}</p>}
            {quotation.sender_mobile && <p className="text-xs text-slate-500">Mobile: {quotation.sender_mobile}</p>}
          </div>
          <div className="card p-4 space-y-1">
            <div className="flex items-center gap-2 font-semibold text-slate-800 text-sm mb-1">
              <UserSquare2 size={15} className="text-brand-500" /> To
            </div>
            <p className="text-sm text-slate-700">{quotation.client_name || '-'}</p>
            {quotation.client_address && <p className="text-xs text-slate-500">{quotation.client_address}</p>}
            {quotation.client_mobile && <p className="text-xs text-slate-500">Mobile: {quotation.client_mobile}</p>}
          </div>
        </div>
      )}

      {editing ? (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="card p-4 space-y-3">
              <div className="flex items-center gap-2 font-semibold text-slate-800 text-sm">
                <Send size={15} className="text-brand-500" /> From
              </div>
              <Field label="Name / Company"><Input value={editParty.sender_name} onChange={setEditPartyField('sender_name')} placeholder="e.g. OmegaERP Sales" /></Field>
              <Field label="Address"><Input value={editParty.sender_address} onChange={setEditPartyField('sender_address')} placeholder="Office / site address" /></Field>
              <Field label="Mobile Number"><Input value={editParty.sender_mobile} onChange={setEditPartyField('sender_mobile')} placeholder="e.g. 9876543210" /></Field>
            </div>
            <div className="card p-4 space-y-3">
              <div className="flex items-center gap-2 font-semibold text-slate-800 text-sm">
                <UserSquare2 size={15} className="text-brand-500" /> To
              </div>
              <Field label="Client Name"><Input value={editParty.client_name} onChange={setEditPartyField('client_name')} placeholder="e.g. Acme Solar Pvt Ltd" /></Field>
              <Field label="Address"><Input value={editParty.client_address} onChange={setEditPartyField('client_address')} placeholder="Client address" /></Field>
              <Field label="Mobile Number"><Input value={editParty.client_mobile} onChange={setEditPartyField('client_mobile')} placeholder="e.g. 9876543210" /></Field>
            </div>
          </div>

          <div className="card p-4 space-y-3">
            <h3 className="font-semibold text-slate-800 text-sm">Edit Products</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {editRows.map((row, i) => (
                <div key={i} className="grid grid-cols-[1fr_90px_80px_28px] gap-1.5">
                  <Input list="material-options-datalist" placeholder="Material name" value={row.material_name}
                    onChange={(e) => handleEditMaterialNameChange(i, e.target.value)} />
                  <Input placeholder="Unit" value={row.unit}
                    onChange={(e) => updateEditRow(i, 'unit', e.target.value)} />
                  <Input type="number" min="1" step="1" placeholder="Qty" value={row.quantity}
                    onChange={(e) => updateEditRow(i, 'quantity', e.target.value)} />
                  <button type="button" className="text-slate-400 hover:text-red-500" onClick={() => removeEditRow(i)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
            <datalist id="material-options-datalist">
              {materialOptions.map((opt, idx) => <option key={idx} value={opt.material_name} />)}
            </datalist>
            <div className="flex gap-2">
              <button type="button" className="btn-secondary text-xs" onClick={addEditRow}><Plus size={13} />Add Row</button>
              <div className="ml-auto flex gap-2">
                <button type="button" className="btn-secondary text-xs" onClick={cancelEditing}><X size={13} />Cancel</button>
                <button type="button" className="btn-primary text-xs" disabled={savingEdit} onClick={saveEdits}>
                  {savingEdit ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                  Save Changes
                </button>
              </div>
            </div>
            <p className="text-xs text-slate-400">Saving changes will reset a Verified quotation back to Draft, since the list has changed.</p>
          </div>
        </>
      ) : (
        <div className="card overflow-hidden">
          <div className="p-4 border-b border-surface-100 flex items-center justify-between">
            <h3 className="font-semibold text-slate-800 text-sm">Quotation Details</h3>
            <span className={`badge text-xs ${quotation.all_matched ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
              {quotation.all_matched ? 'Matches Inventory' : 'Needs Attention'}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Material Name</th><th>Unit</th><th className="text-right">Requested</th>
                  <th className="text-right">Available</th><th className="text-right">Rate</th>
                  <th className="text-right">Amount</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {quotation.rows.map((row, i) => (
                  <tr key={i}>
                    <td className="font-medium text-slate-800">{row.material_name || '-'}</td>
                    <td className="text-xs text-slate-500">{row.unit || '-'}</td>
                    <td className="text-right">{row.requested_qty ?? '-'}</td>
                    <td className="text-right">{row.available_qty ?? '-'}</td>
                    <td className="text-right">{row.unit_rate ? `₹${row.unit_rate}` : '-'}</td>
                    <td className="text-right font-semibold text-slate-900">{row.amount ? `₹${row.amount}` : '-'}</td>
                    <td>
                      <span className={`badge text-xs ${row.matched ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                        {row.matched ? 'Matched' : 'Not Matched'}
                      </span>
                      <div className="text-xs text-slate-400 mt-0.5">{row.reason}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-surface-50">
                  <td colSpan={5} className="text-right font-semibold text-slate-600">Total Quotation Value</td>
                  <td className="text-right font-bold text-slate-900">
                    ₹{quotationTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {!quotation.is_locked && quotation.status !== 'verified' && !editing && (
        <div className="card p-4 text-sm text-slate-500">
          Verify this quotation once every item matches inventory to unlock purchase order generation.
        </div>
      )}

      {!quotation.is_locked && quotation.status === 'verified' && (
        <div className="card p-5 space-y-4">
          <h3 className="font-semibold text-slate-800 text-sm">Generate Purchase Order</h3>
          <p className="text-xs text-slate-500">This quotation is verified. Fill in the PO header to generate the purchase order.</p>

          {generateError && (
            <div className="flex items-center gap-2 bg-red-50 text-red-700 border border-red-200 rounded-lg px-3 py-2 text-sm">
              <AlertCircle size={14} className="flex-shrink-0" />{generateError}
            </div>
          )}

          <form onSubmit={handleGenerate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="PO Number" required>
              <Input value={poForm.po_number} onChange={setPoField('po_number')} placeholder="e.g. PO-2026-014" required />
            </Field>
            <Field label="PO Date" required>
              <Input type="date" value={poForm.po_date} onChange={setPoField('po_date')} required />
            </Field>
            <Field label="Vendor" required>
              <Select value={poForm.vendor} onChange={setPoField('vendor')} required disabled={vendorsLoading}>
                <option value="">{vendorsLoading ? 'Loading vendors…' : 'Select vendor'}</option>
                {vendors.map((v) => <option key={v.id} value={v.id}>{v.company_name} ({v.vendor_id})</option>)}
              </Select>
            </Field>
            <Field label="Business Division" required>
              <Select value={poForm.business_division} onChange={setPoField('business_division')} required>
                {DIVISION_CHOICES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </Select>
            </Field>
            <Field label="Project / Site Name" required>
              <Input value={poForm.project_site_name} onChange={setPoField('project_site_name')} placeholder="e.g. KUSUM A&C 205 MW" required />
            </Field>
            <Field label="Project Location">
              <Input value={poForm.project_location} onChange={setPoField('project_location')} />
            </Field>
            <Field label="Dispatch Origin">
              <Input value={poForm.dispatch_origin} onChange={setPoField('dispatch_origin')} placeholder="From where material is coming" />
            </Field>
            <Field label="Department">
              <Input value={poForm.department} onChange={setPoField('department')} />
            </Field>
            <Field label="Expected Delivery Date">
              <Input type="date" value={poForm.expected_delivery_date} onChange={setPoField('expected_delivery_date')} />
            </Field>
            <div className="md:col-span-2">
              <Field label="Delivery Address">
                <Textarea rows={2} value={poForm.delivery_address} onChange={setPoField('delivery_address')} />
              </Field>
            </div>
            <Field label="Payment Terms">
              <Textarea rows={2} value={poForm.payment_terms} onChange={setPoField('payment_terms')} />
            </Field>
            <Field label="Delivery Terms">
              <Textarea rows={2} value={poForm.delivery_terms} onChange={setPoField('delivery_terms')} />
            </Field>

            <div className="md:col-span-2 flex justify-end">
              <button type="submit" className="btn-primary disabled:opacity-50" disabled={generating}>
                {generating ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                Generate Purchase Order
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
