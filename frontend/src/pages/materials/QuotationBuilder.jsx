import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Upload, Plus, Trash2, Loader2, AlertCircle, CheckCircle2, PackageSearch, ShieldCheck, Save, Send, UserSquare2,
} from 'lucide-react'
import api from '../../services/api'

function getCookie(name) {
  const value = `; ${document.cookie}`
  const parts = value.split(`; ${name}=`)
  if (parts.length === 2) return parts.pop().split(';').shift()
  return ''
}

const CHECK_URL = '/purchase-orders/bulk-generate/check/'
const CREATE_URL = '/procurement/api/quotations/create/'
const MATERIAL_OPTIONS_URL = '/materials/master/options/'

const emptyRow = () => ({ material_name: '', unit: '', quantity: '' })
const emptyParty = () => ({
  client_name: '', client_address: '', client_mobile: '',
  sender_name: '', sender_address: '', sender_mobile: '',
})

const Field = ({ label, children }) => (
  <div>
    <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
    {children}
  </div>
)

const Input = (props) => (
  <input
    {...props}
    className="w-full px-3 py-2 text-sm border border-surface-200 rounded-lg bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition"
  />
)

export default function QuotationBuilder() {
  const navigate = useNavigate()
  const fileInputRef = useRef(null)

  const [manualRows, setManualRows] = useState([emptyRow(), emptyRow(), emptyRow()])
  const [materialOptions, setMaterialOptions] = useState([])
  const [verifying, setVerifying] = useState(false)
  const [preview, setPreview] = useState(null) // { rows, all_matched }
  const [alert, setAlert] = useState(null)
  const [saving, setSaving] = useState(false)
  const [party, setParty] = useState(emptyParty())

  useEffect(() => {
    api.get(MATERIAL_OPTIONS_URL)
      .then((res) => setMaterialOptions(res.data.results || []))
      .catch(() => setMaterialOptions([]))
  }, [])

  const setPartyField = (key) => (e) => setParty((p) => ({ ...p, [key]: e.target.value }))

  const updateManualRow = (index, key, value) => {
    setManualRows((rows) => rows.map((row, i) => (i === index ? { ...row, [key]: value } : row)))
    setPreview(null)
  }
  const handleMaterialNameChange = (index, value) => {
    setManualRows((rows) => rows.map((row, i) => {
      if (i !== index) return row
      if (!row.unit) {
        const match = materialOptions.find((o) => o.material_name.toLowerCase() === value.toLowerCase())
        if (match) return { ...row, material_name: value, unit: match.unit }
      }
      return { ...row, material_name: value }
    }))
    setPreview(null)
  }
  const addManualRow = () => setManualRows((rows) => [...rows, emptyRow()])
  const removeManualRow = (index) => setManualRows((rows) => rows.filter((_, i) => i !== index))

  const currentRows = () => manualRows.filter((r) => r.material_name || r.unit || r.quantity)

  const runVerify = async (body, isFormData) => {
    setVerifying(true)
    setAlert(null)
    try {
      // FormData needs Content-Type unset so axios/the browser can set
      // multipart/form-data with the boundary itself, instead of the
      // client's default 'application/json'.
      const config = isFormData ? { headers: { 'Content-Type': undefined } } : undefined
      const res = await api.post(CHECK_URL, body, config)
      const data = res.data
      setPreview(data)
      if (isFormData) {
        // populate the editable table from the parsed file so it can be tweaked before saving
        setManualRows(data.rows.map((r) => ({
          material_name: r.material_name, unit: r.unit, quantity: r.requested_qty ?? '',
        })))
      }
      const count = data.rows?.length || 0
      setAlert({
        type: data.all_matched ? 'success' : 'warning',
        message: data.all_matched
          ? `Verified ${count} product${count === 1 ? '' : 's'} — everything is available in inventory.`
          : `Verified ${count} product${count === 1 ? '' : 's'} — some items don't match inventory yet. You can still save the quotation and fix it later.`,
      })
    } catch (err) {
      setAlert({ type: 'error', message: err.response?.data?.error || 'Could not verify the product list against inventory.' })
    } finally {
      setVerifying(false)
    }
  }

  const handleVerifyManual = () => {
    const rows = currentRows()
    if (!rows.length) {
      setAlert({ type: 'error', message: 'Add at least one product row first.' })
      return
    }
    runVerify({ rows })
  }

  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    const ext = file.name.toLowerCase().split('.').pop()
    if (ext === 'png' || ext === 'jpg' || ext === 'jpeg') {
      setAlert({
        type: 'error',
        message: "Image (PNG/JPG) import needs OCR (text recognition), which isn't set up in this "
          + 'deployment yet. Use a PDF with selectable text, an Excel file, or enter products manually.',
      })
      return
    }
    if (ext !== 'xlsx' && ext !== 'pdf') {
      setAlert({ type: 'error', message: 'Please upload the product list as .xlsx or .pdf.' })
      return
    }

    const formData = new FormData()
    formData.append('materialFile', file)
    runVerify(formData, true)
  }

  const handleSave = async () => {
    const rows = currentRows()
    if (!rows.length) {
      setAlert({ type: 'error', message: 'Add at least one product row before saving.' })
      return
    }
    setSaving(true)
    setAlert(null)
    try {
      const items = rows.map((r) => ({ material_name: r.material_name, unit: r.unit, quantity: r.quantity }))
      const res = await fetch(CREATE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') },
        body: JSON.stringify({ items, ...party }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not save the quotation.')
      navigate(`/materials/quotations/${data.quotation.id}`)
    } catch (err) {
      setAlert({ type: 'error', message: err.message })
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 pb-4">
      <div className="page-header">
        <div>
          <h2 className="page-title">New Quotation</h2>
          <p className="page-subtitle">
            Build a materials list, optionally preview it against inventory, then save it as a quotation to verify and edit later.
          </p>
        </div>
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-4 space-y-3">
          <div className="flex items-center gap-2 font-semibold text-slate-800 text-sm">
            <Send size={15} className="text-brand-500" /> From
          </div>
          <p className="text-xs text-slate-500">Who is sending this quotation.</p>
          <Field label="Name / Company"><Input value={party.sender_name} onChange={setPartyField('sender_name')} placeholder="e.g. OmegaERP Sales" /></Field>
          <Field label="Address"><Input value={party.sender_address} onChange={setPartyField('sender_address')} placeholder="Office / site address" /></Field>
          <Field label="Mobile Number"><Input value={party.sender_mobile} onChange={setPartyField('sender_mobile')} placeholder="e.g. 9876543210" /></Field>
        </div>

        <div className="card p-4 space-y-3">
          <div className="flex items-center gap-2 font-semibold text-slate-800 text-sm">
            <UserSquare2 size={15} className="text-brand-500" /> To
          </div>
          <p className="text-xs text-slate-500">Who this quotation is being sent to.</p>
          <Field label="Client Name"><Input value={party.client_name} onChange={setPartyField('client_name')} placeholder="e.g. Acme Solar Pvt Ltd" /></Field>
          <Field label="Address"><Input value={party.client_address} onChange={setPartyField('client_address')} placeholder="Client address" /></Field>
          <Field label="Mobile Number"><Input value={party.client_mobile} onChange={setPartyField('client_mobile')} placeholder="e.g. 9876543210" /></Field>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-4 space-y-3">
          <div className="flex items-center gap-2 font-semibold text-slate-800 text-sm">
            <Upload size={15} className="text-brand-500" /> Upload Product List
          </div>
          <p className="text-xs text-slate-500">
            .xlsx with Material Name / Unit / Quantity columns, or a text-based PDF with a similar table.
            Scanned pages and images (PNG/JPG) aren't supported yet — that needs OCR, which isn't set up
            in this deployment.
          </p>
          <input ref={fileInputRef} type="file" accept=".xlsx,.pdf,.png,.jpg,.jpeg" className="hidden" onChange={handleFileChange} />
          <button className="btn-primary w-full justify-center" disabled={verifying} onClick={() => fileInputRef.current?.click()}>
            {verifying ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
            Preview File Against Inventory
          </button>
        </div>

        <div className="card p-4 space-y-3">
          <div className="flex items-center gap-2 font-semibold text-slate-800 text-sm">
            <PackageSearch size={15} className="text-brand-500" /> Products
          </div>
          <p className="text-xs text-slate-500">Material names are suggested from what's already in the Material Master — pick one to auto-fill the unit.</p>
          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
            {manualRows.map((row, i) => (
              <div key={i} className="grid grid-cols-[1fr_90px_80px_28px] gap-1.5">
                <Input list="material-options-datalist" placeholder="Material name" value={row.material_name}
                  onChange={(e) => handleMaterialNameChange(i, e.target.value)} />
                <Input placeholder="Unit" value={row.unit}
                  onChange={(e) => updateManualRow(i, 'unit', e.target.value)} />
                <Input type="number" min="1" step="1" placeholder="Qty" value={row.quantity}
                  onChange={(e) => updateManualRow(i, 'quantity', e.target.value)} />
                <button type="button" className="text-slate-400 hover:text-red-500" onClick={() => removeManualRow(i)}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          <datalist id="material-options-datalist">
            {materialOptions.map((opt, idx) => (
              <option key={idx} value={opt.material_name} />
            ))}
          </datalist>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary text-xs" onClick={addManualRow}><Plus size={13} />Add Row</button>
            <button type="button" className="btn-secondary text-xs ml-auto" disabled={verifying} onClick={handleVerifyManual}>
              {verifying ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />}
              Preview Against Inventory
            </button>
          </div>
        </div>
      </div>

      {preview && (
        <div className="card overflow-hidden">
          <div className="p-4 border-b border-surface-100 flex items-center justify-between">
            <h3 className="font-semibold text-slate-800 text-sm">Preview</h3>
            <span className={`badge text-xs ${preview.all_matched ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
              {preview.all_matched ? 'Matches Inventory' : 'Needs Attention'}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr><th>Material Name</th><th>Unit</th><th className="text-right">Requested</th><th className="text-right">Available</th><th>Status</th></tr>
              </thead>
              <tbody>
                {preview.rows.map((row, i) => (
                  <tr key={i}>
                    <td className="font-medium text-slate-800">{row.material_name || '-'}</td>
                    <td className="text-xs text-slate-500">{row.unit || '-'}</td>
                    <td className="text-right">{row.requested_qty ?? '-'}</td>
                    <td className="text-right">{row.available_qty ?? '-'}</td>
                    <td>
                      <span className={`badge text-xs ${row.matched ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                        {row.matched ? 'Matched' : 'Not Matched'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <button className="btn-primary disabled:opacity-50" disabled={saving} onClick={handleSave}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Save Quotation
        </button>
      </div>
    </div>
  )
}
