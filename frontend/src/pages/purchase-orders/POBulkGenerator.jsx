import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Upload, Plus, Trash2, CheckCircle2, XCircle, Loader2, Layers, ShoppingCart,
} from 'lucide-react'
import api from '../../services/api'

const CHECK_URL = '/purchase-orders/bulk-generate/check/'
const GENERATE_URL = '/purchase-orders/bulk-generate/'
const VENDOR_OPTIONS_URL = '/purchase-orders/vendor-options/'

const Field = ({ label, required, children, className = '' }) => (
  <div className={className}>
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

const emptyRow = () => ({ material_name: '', unit: 'Nos', quantity: '' })

const todayISO = () => new Date().toISOString().slice(0, 10)
const suggestPoNumber = () => `PO-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`

export default function POBulkGenerator() {
  const navigate = useNavigate()

  const [manualRows, setManualRows] = useState([emptyRow()])
  const [checking, setChecking] = useState(false)
  const [checkError, setCheckError] = useState('')
  const [checkedRows, setCheckedRows] = useState(null)
  const [allMatched, setAllMatched] = useState(false)

  const [vendorOptions, setVendorOptions] = useState([])
  const [vendorsLoading, setVendorsLoading] = useState(true)
  const [showGenerateForm, setShowGenerateForm] = useState(false)
  const [genForm, setGenForm] = useState({
    po_number: suggestPoNumber(), po_date: todayISO(), vendor: '', business_division: 'solar',
    project_site_name: '', project_location: '', delivery_address: '', dispatch_origin: '',
    department: '', status: 'draft', expected_delivery_date: '', payment_terms: '', delivery_terms: '',
  })
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState('')

  useEffect(() => {
    let active = true
    api.get(VENDOR_OPTIONS_URL)
      .then(res => { if (active) setVendorOptions(res.data.results || []) })
      .catch(() => {})
      .finally(() => { if (active) setVendorsLoading(false) })
    return () => { active = false }
  }, [])

  const setRow = (i, k) => (e) => {
    setManualRows(prev => {
      const next = [...prev]
      next[i] = { ...next[i], [k]: e.target.value }
      return next
    })
  }
  const addRow = () => setManualRows(prev => [...prev, emptyRow()])
  const removeRow = (i) => setManualRows(prev => prev.filter((_, idx) => idx !== i))

  const runCheck = async (payload) => {
    setChecking(true)
    setCheckError('')
    setCheckedRows(null)
    setAllMatched(false)
    setShowGenerateForm(false)
    try {
      const res = await api.post(CHECK_URL, payload.formData || payload.body,
        payload.formData ? { headers: { 'Content-Type': undefined } } : undefined)
      setCheckedRows(res.data.rows || [])
      setAllMatched(!!res.data.all_matched)
    } catch (err) {
      setCheckError(err.response?.data?.error || 'Could not check materials against inventory.')
    } finally {
      setChecking(false)
    }
  }

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const fd = new FormData()
    fd.append('materialFile', file)
    runCheck({ formData: fd })
  }

  const handleManualCheck = () => {
    const rows = manualRows
      .filter(r => r.material_name && r.unit && r.quantity)
      .map(r => ({ material_name: r.material_name, unit: r.unit, quantity: parseFloat(r.quantity) }))
    if (rows.length === 0) {
      setCheckError('Add at least one material row with name, unit, and quantity.')
      return
    }
    runCheck({ body: { rows } })
  }

  const setGenF = (k) => (e) => setGenForm(f => ({ ...f, [k]: e.target.value }))

  const submitGenerate = async (e) => {
    e.preventDefault()
    if (!genForm.po_number || !genForm.po_date || !genForm.vendor || !genForm.project_site_name) {
      setGenError('PO number, date, vendor, and project are required.')
      return
    }
    setGenerating(true)
    setGenError('')
    try {
      const items = checkedRows.map(r => ({ material_name: r.material_name, unit: r.unit, quantity: r.requested_qty }))
      const body = { ...genForm, items }
      Object.keys(body).forEach(k => { if (body[k] === '') delete body[k] })
      const res = await api.post(GENERATE_URL, body)
      navigate(`/purchase-orders/${res.data.po_id}`)
    } catch (err) {
      const data = err.response?.data
      setGenError(data?.error || 'Could not generate the purchase order.')
      if (data?.rows) {
        setCheckedRows(data.rows)
        setAllMatched(false)
      }
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-8">
      <div>
        <Link to="/purchase-orders" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4 transition-colors">
          <ArrowLeft size={15} />Back to Purchase Orders
        </Link>
        <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2"><Layers size={20} />Bulk PO Generator</h2>
        <p className="text-slate-500 text-sm mt-0.5">Upload a material list or add rows manually, check against inventory, then generate the PO</p>
      </div>

      {/* Input methods */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-5 space-y-3">
          <h3 className="font-semibold text-slate-900 text-sm">Upload File</h3>
          <p className="text-xs text-slate-400">Accepts .xlsx or .pdf material lists.</p>
          <label className="w-full py-3 border-2 border-dashed border-surface-300 rounded-xl text-sm text-slate-500 hover:border-brand-300 hover:text-brand-500 transition-colors flex items-center justify-center gap-2 cursor-pointer">
            <Upload size={14} />Choose File
            <input type="file" accept=".xlsx,.pdf" className="hidden" onChange={handleFileUpload} disabled={checking} />
          </label>
        </div>

        <div className="card p-5 space-y-3">
          <h3 className="font-semibold text-slate-900 text-sm">Add Rows Manually</h3>
          <div className="space-y-2">
            {manualRows.map((row, i) => (
              <div key={i} className="grid grid-cols-6 gap-2 items-end">
                <div className="col-span-3">
                  <Input placeholder="Material name" value={row.material_name} onChange={setRow(i, 'material_name')} />
                </div>
                <div className="col-span-1">
                  <Input placeholder="Unit" value={row.unit} onChange={setRow(i, 'unit')} />
                </div>
                <div className="col-span-1">
                  <Input type="number" min="0" step="any" placeholder="Qty" value={row.quantity} onChange={setRow(i, 'quantity')} />
                </div>
                <div className="col-span-1 flex justify-end">
                  {manualRows.length > 1 && (
                    <button type="button" onClick={() => removeRow(i)} className="text-red-400 hover:text-red-600"><Trash2 size={14} /></button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between pt-2">
            <button type="button" onClick={addRow} className="text-xs text-brand-600 font-medium flex items-center gap-1"><Plus size={12} />Add Row</button>
            <button type="button" onClick={handleManualCheck} disabled={checking} className="btn-primary flex items-center gap-2">
              {checking ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}Check Against Inventory
            </button>
          </div>
        </div>
      </div>

      {checking && (
        <div className="flex items-center gap-2 text-sm text-slate-500 py-4 justify-center">
          <Loader2 size={16} className="animate-spin" />Checking materials against inventory…
        </div>
      )}

      {checkError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{checkError}</div>
      )}

      {/* Check results */}
      {checkedRows && (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-surface-100">
            <h3 className="font-semibold text-slate-900 text-sm">Inventory Check Results</h3>
            <span className={`badge ${allMatched ? 'badge-green' : 'badge-red'}`}>
              {allMatched ? 'All items matched' : 'Some items unmatched'}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Material</th>
                  <th>Unit</th>
                  <th className="text-right">Requested</th>
                  <th className="text-right">Available</th>
                  <th className="text-right">Rate</th>
                  <th className="text-right">Amount</th>
                  <th>Match</th>
                </tr>
              </thead>
              <tbody>
                {checkedRows.map((r, i) => (
                  <tr key={i}>
                    <td className="font-medium text-slate-800">{r.material_name}</td>
                    <td className="text-xs text-slate-500">{r.unit}</td>
                    <td className="text-right text-slate-700">{r.requested_qty}</td>
                    <td className="text-right text-slate-700">{r.available_qty}</td>
                    <td className="text-right text-slate-700">{r.unit_rate != null ? `₹${Number(r.unit_rate).toLocaleString('en-IN')}` : '—'}</td>
                    <td className="text-right font-semibold text-slate-900">{r.amount != null ? `₹${Number(r.amount).toLocaleString('en-IN')}` : '—'}</td>
                    <td>
                      {r.matched ? (
                        <span className="badge badge-green flex items-center gap-1 w-fit"><CheckCircle2 size={11} />Matched</span>
                      ) : (
                        <span className="badge badge-red flex items-center gap-1 w-fit" title={r.reason}><XCircle size={11} />{r.reason || 'Not matched'}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end px-5 py-4 border-t border-surface-100">
            <button type="button" disabled={!allMatched} onClick={() => setShowGenerateForm(s => !s)}
              className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2">
              <ShoppingCart size={14} />Generate Purchase Order
            </button>
          </div>
        </div>
      )}

      {/* Generate form */}
      {showGenerateForm && allMatched && (
        <div className="card p-6 space-y-4">
          <h3 className="font-semibold text-slate-900 text-sm border-b border-surface-100 pb-3">Purchase Order Details</h3>
          {genError && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{genError}</div>}
          <form onSubmit={submitGenerate} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="PO Number" required><Input value={genForm.po_number} onChange={setGenF('po_number')} required /></Field>
              <Field label="PO Date" required><Input type="date" value={genForm.po_date} onChange={setGenF('po_date')} required /></Field>
              <Field label="Vendor" required>
                <Select value={genForm.vendor} onChange={setGenF('vendor')} required disabled={vendorsLoading}>
                  <option value="">{vendorsLoading ? 'Loading vendors…' : 'Select vendor'}</option>
                  {vendorOptions.map(v => <option key={v.id} value={v.id}>{v.company_name} ({v.vendor_id})</option>)}
                </Select>
              </Field>
              <Field label="Business Division" required>
                <Select value={genForm.business_division} onChange={setGenF('business_division')} required>
                  <option value="solar">Solar</option>
                  <option value="biogas">Biogas</option>
                  <option value="infrastructure">Infrastructure</option>
                  <option value="pharma">Pharma</option>
                  <option value="other">Other</option>
                </Select>
              </Field>
              <Field label="Project / Site" required><Input value={genForm.project_site_name} onChange={setGenF('project_site_name')} required /></Field>
              <Field label="Project Location"><Input value={genForm.project_location} onChange={setGenF('project_location')} /></Field>
              <Field label="Delivery Address"><Input value={genForm.delivery_address} onChange={setGenF('delivery_address')} /></Field>
              <Field label="From Where Material Is Coming"><Input value={genForm.dispatch_origin} onChange={setGenF('dispatch_origin')} /></Field>
              <Field label="Department"><Input value={genForm.department} onChange={setGenF('department')} /></Field>
              <Field label="Expected Delivery Date"><Input type="date" value={genForm.expected_delivery_date} onChange={setGenF('expected_delivery_date')} /></Field>
              <Field label="Payment Terms"><Input value={genForm.payment_terms} onChange={setGenF('payment_terms')} /></Field>
              <Field label="Delivery Terms"><Input value={genForm.delivery_terms} onChange={setGenF('delivery_terms')} /></Field>
            </div>
            <div className="flex justify-end pt-2">
              <button type="submit" disabled={generating} className="btn-primary min-w-[200px] flex items-center justify-center gap-2">
                {generating ? <><Loader2 size={15} className="animate-spin" />Generating…</> : <><ShoppingCart size={15} />Generate Purchase Order</>}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
