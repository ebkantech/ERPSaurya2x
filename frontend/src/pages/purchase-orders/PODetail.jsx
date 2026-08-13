import React, { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft, Edit, CheckCircle, Clock, Truck, FileText, Loader2, Plus, X, AlertCircle, Download,
} from 'lucide-react'
import api from '../../services/api'

const poUrl = (id) => `/purchase-orders/${id}/`
const poUpdateUrl = (id) => `/purchase-orders/${id}/update/`
const poItemsUrl = (id) => `/purchase-orders/${id}/items/`
const poDeliveriesUrl = (id) => `/purchase-orders/${id}/deliveries/`
const poPaymentsUrl = (id) => `/purchase-orders/${id}/payments/`
const poDocumentsUrl = (id) => `/purchase-orders/${id}/documents/`
const VENDOR_OPTIONS_URL = '/purchase-orders/vendor-options/'

const TABS = ['Items', 'Deliveries', 'Payments', 'Documents']

const STATUS_BADGE = {
  draft: 'badge-slate', approved: 'badge-blue', partially_delivered: 'badge-amber',
  fully_delivered: 'badge-green', partially_paid: 'badge-amber', fully_paid: 'badge-green',
  closed: 'badge-slate', cancelled: 'badge-red',
  pending: 'badge-slate', in_transit: 'badge-blue', partially_received: 'badge-amber', received: 'badge-green', rejected: 'badge-red',
  paid: 'badge-green', hold: 'badge-amber',
}

const fmt = (n) => {
  const v = Number(n)
  return isNaN(v) ? '—' : `₹${v.toLocaleString('en-IN')}`
}

const humanize = (s) => (s || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

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

const Textarea = (props) => (
  <textarea
    {...props}
    className="w-full px-3 py-2 text-sm border border-surface-200 rounded-lg bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition resize-none"
  />
)

const Panel = ({ title, onClose, children }) => (
  <div className="card p-5 space-y-4 border-brand-200">
    <div className="flex items-center justify-between">
      <h4 className="font-semibold text-slate-900 text-sm">{title}</h4>
      <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
    </div>
    {children}
  </div>
)

export default function PODetail() {
  const { id } = useParams()
  const [po, setPo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('Items')
  const [notice, setNotice] = useState('')

  const fetchPO = () => {
    setLoading(true)
    setError('')
    api.get(poUrl(id))
      .then(res => setPo(res.data))
      .catch(() => setError('Could not load this purchase order.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchPO() }, [id])

  const flash = (msg) => {
    setNotice(msg)
    setTimeout(() => setNotice(''), 5000)
  }

  // ---- Edit header ----
  const [editing, setEditing] = useState(false)
  const [vendorOptions, setVendorOptions] = useState([])
  const [editForm, setEditForm] = useState(null)
  const [editSubmitting, setEditSubmitting] = useState(false)
  const [editError, setEditError] = useState('')

  const startEdit = () => {
    api.get(VENDOR_OPTIONS_URL).then(res => setVendorOptions(res.data.results || [])).catch(() => {})
    setEditForm({
      po_number: po.po_number || '',
      po_date: po.po_date || '',
      vendor: po.vendor_id ? String(po.vendor_id) : '',
      business_division: po.business_division || 'solar',
      project_site_name: po.project_site_name || '',
      project_location: po.project_location || '',
      delivery_address: po.delivery_address || '',
      dispatch_origin: po.dispatch_origin || '',
      department: po.department || '',
      status: po.status || 'draft',
      expected_delivery_date: po.expected_delivery_date || '',
    })
    setEditError('')
    setEditing(true)
  }

  // once vendorOptions load, try to preselect a match by company name
  useEffect(() => {
    if (editing && vendorOptions.length && editForm && !editForm.vendor) {
      const match = vendorOptions.find(v => v.company_name === po.vendor)
      if (match) setEditForm(f => ({ ...f, vendor: String(match.id) }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorOptions, editing])

  const setEditF = (k) => (e) => setEditForm(f => ({ ...f, [k]: e.target.value }))

  const submitEdit = async (e) => {
    e.preventDefault()
    if (!editForm.vendor) {
      setEditError('Please select a vendor.')
      return
    }
    setEditSubmitting(true)
    setEditError('')
    try {
      const fd = new FormData()
      Object.entries(editForm).forEach(([k, v]) => { if (v !== '' && v != null) fd.append(k, v) })
      const res = await api.post(poUpdateUrl(id), fd, { headers: { 'Content-Type': undefined } })
      setPo(prev => ({ ...prev, ...res.data.po }))
      setEditing(false)
      flash('Purchase order updated.')
    } catch (err) {
      const data = err.response?.data
      const fieldMsg = data?.field_errors ? Object.values(data.field_errors)[0]?.[0] : ''
      setEditError(data?.error || fieldMsg || 'Could not update the purchase order.')
    } finally {
      setEditSubmitting(false)
    }
  }

  // ---- Add item ----
  const [showItemForm, setShowItemForm] = useState(false)
  const [itemForm, setItemForm] = useState({ material_name: '', unit: 'Nos', ordered_quantity: '', unit_rate: '', gst_percentage: '18', specification: '', brand: '', model: '' })
  const [itemSubmitting, setItemSubmitting] = useState(false)
  const [itemError, setItemError] = useState('')

  const submitItem = async (e) => {
    e.preventDefault()
    if (!itemForm.material_name || !itemForm.unit || !itemForm.ordered_quantity || !itemForm.unit_rate) {
      setItemError('Material name, unit, quantity, and rate are required.')
      return
    }
    setItemSubmitting(true)
    setItemError('')
    try {
      const res = await api.post(poItemsUrl(id), {
        material_category: 'General',
        material_name: itemForm.material_name,
        unit: itemForm.unit,
        ordered_quantity: parseFloat(itemForm.ordered_quantity),
        unit_rate: parseFloat(itemForm.unit_rate),
        gst_percentage: parseFloat(itemForm.gst_percentage || 0),
        specification: itemForm.specification || undefined,
        brand: itemForm.brand || undefined,
        model: itemForm.model || undefined,
      })
      setPo(prev => ({ ...prev, items: [...prev.items, res.data.item] }))
      setItemForm({ material_name: '', unit: 'Nos', ordered_quantity: '', unit_rate: '', gst_percentage: '18', specification: '', brand: '', model: '' })
      setShowItemForm(false)
      flash('Item added.')
    } catch (err) {
      setItemError(err.response?.data?.error || 'Could not add the item.')
    } finally {
      setItemSubmitting(false)
    }
  }

  // ---- Add delivery ----
  const [showDeliveryForm, setShowDeliveryForm] = useState(false)
  const [deliveryForm, setDeliveryForm] = useState({ po_item: '', delivery_reference_code: '', delivery_date: '', delivered_quantity: '', delivery_location: '', site_received_by: '', quality_checked_by: '', delivery_status: 'pending', remarks: '' })
  const [deliverySubmitting, setDeliverySubmitting] = useState(false)
  const [deliveryError, setDeliveryError] = useState('')

  const submitDelivery = async (e) => {
    e.preventDefault()
    if (!deliveryForm.po_item || !deliveryForm.delivery_reference_code || !deliveryForm.delivery_date || !deliveryForm.delivered_quantity) {
      setDeliveryError('Item, reference code, date, and quantity are required.')
      return
    }
    setDeliverySubmitting(true)
    setDeliveryError('')
    try {
      const res = await api.post(poDeliveriesUrl(id), {
        po_item: deliveryForm.po_item,
        delivery_reference_code: deliveryForm.delivery_reference_code,
        delivery_date: deliveryForm.delivery_date,
        delivered_quantity: parseFloat(deliveryForm.delivered_quantity),
        delivery_location: deliveryForm.delivery_location || undefined,
        site_received_by: deliveryForm.site_received_by || undefined,
        quality_checked_by: deliveryForm.quality_checked_by || undefined,
        delivery_status: deliveryForm.delivery_status,
        remarks: deliveryForm.remarks || undefined,
      })
      setPo(prev => ({ ...prev, deliveries: [...prev.deliveries, res.data.delivery] }))
      setDeliveryForm({ po_item: '', delivery_reference_code: '', delivery_date: '', delivered_quantity: '', delivery_location: '', site_received_by: '', quality_checked_by: '', delivery_status: 'pending', remarks: '' })
      setShowDeliveryForm(false)
      flash('Delivery logged.')
    } catch (err) {
      setDeliveryError(err.response?.data?.error || 'Could not log the delivery.')
    } finally {
      setDeliverySubmitting(false)
    }
  }

  // ---- Log payment ----
  const [showPaymentForm, setShowPaymentForm] = useState(false)
  const [paymentForm, setPaymentForm] = useState({
    payment_reference_code: '', payment_stage: 'advance', payment_amount: '', payment_percentage: '',
    tds_deduction: '', gst_amount: '', payment_due_date: '', payment_paid_date: '', payment_mode: '',
    bank_transaction_id: '', payment_status: 'pending', remarks: '', related_delivery: '',
  })
  const [paymentSubmitting, setPaymentSubmitting] = useState(false)
  const [paymentError, setPaymentError] = useState('')

  const submitPayment = async (e) => {
    e.preventDefault()
    if (!paymentForm.payment_reference_code || !paymentForm.payment_amount) {
      setPaymentError('Reference code and payment amount are required.')
      return
    }
    setPaymentSubmitting(true)
    setPaymentError('')
    try {
      const body = { ...paymentForm }
      Object.keys(body).forEach(k => { if (body[k] === '') delete body[k] })
      body.payment_amount = parseFloat(paymentForm.payment_amount)
      if (paymentForm.payment_percentage) body.payment_percentage = parseFloat(paymentForm.payment_percentage)
      if (paymentForm.tds_deduction) body.tds_deduction = parseFloat(paymentForm.tds_deduction)
      if (paymentForm.gst_amount) body.gst_amount = parseFloat(paymentForm.gst_amount)
      const res = await api.post(poPaymentsUrl(id), body)
      setPo(prev => ({ ...prev, payments: [...prev.payments, res.data.payment] }))
      setPaymentForm({ payment_reference_code: '', payment_stage: 'advance', payment_amount: '', payment_percentage: '', tds_deduction: '', gst_amount: '', payment_due_date: '', payment_paid_date: '', payment_mode: '', bank_transaction_id: '', payment_status: 'pending', remarks: '', related_delivery: '' })
      setShowPaymentForm(false)
      flash('Payment logged.')
    } catch (err) {
      setPaymentError(err.response?.data?.error || 'Could not log the payment.')
    } finally {
      setPaymentSubmitting(false)
    }
  }

  // ---- Upload document ----
  const [showDocForm, setShowDocForm] = useState(false)
  const [docForm, setDocForm] = useState({ title: '', document_type: 'other', notes: '', file: null })
  const [docSubmitting, setDocSubmitting] = useState(false)
  const [docError, setDocError] = useState('')

  const submitDoc = async (e) => {
    e.preventDefault()
    if (!docForm.title || !docForm.file) {
      setDocError('Title and file are required.')
      return
    }
    setDocSubmitting(true)
    setDocError('')
    try {
      const fd = new FormData()
      fd.append('title', docForm.title)
      fd.append('document_type', docForm.document_type)
      if (docForm.notes) fd.append('notes', docForm.notes)
      fd.append('file', docForm.file)
      const res = await api.post(poDocumentsUrl(id), fd, { headers: { 'Content-Type': undefined } })
      setPo(prev => ({ ...prev, documents: [...prev.documents, res.data.document] }))
      setDocForm({ title: '', document_type: 'other', notes: '', file: null })
      setShowDocForm(false)
      flash('Document uploaded.')
    } catch (err) {
      setDocError(err.response?.data?.error || 'Could not upload the document.')
    } finally {
      setDocSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500 py-24 justify-center">
        <Loader2 size={16} className="animate-spin" />Loading purchase order…
      </div>
    )
  }

  if (error || !po) {
    return (
      <div className="space-y-4">
        <Link to="/purchase-orders" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors">
          <ArrowLeft size={15} />Back to Purchase Orders
        </Link>
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error || 'Purchase order not found.'}</div>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-4">
      {/* Back */}
      <Link to="/purchase-orders" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors">
        <ArrowLeft size={15} />Back to Purchase Orders
      </Link>

      {notice && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-xl px-4 py-3 flex items-center gap-2">
          <CheckCircle size={15} />{notice}
        </div>
      )}

      {/* PO Header card */}
      <div className="card p-6">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-xl font-bold text-slate-900">{po.po_number}</h2>
              <span className={`badge ${STATUS_BADGE[po.status] || 'badge-slate'}`}>{humanize(po.status)}</span>
            </div>
            <p className="text-slate-500 text-sm">Issued on {po.po_date} · {po.project_site_name}</p>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn-secondary" onClick={() => (editing ? setEditing(false) : startEdit())}>
              <Edit size={14} />{editing ? 'Cancel Edit' : 'Edit'}
            </button>
          </div>
        </div>

        {editing && editForm && (
          <form onSubmit={submitEdit} className="mb-6 bg-surface-50 border border-surface-200 rounded-xl p-4 space-y-4">
            {editError && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{editError}</div>}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="PO Number" required><Input value={editForm.po_number} onChange={setEditF('po_number')} required /></Field>
              <Field label="PO Date" required><Input type="date" value={editForm.po_date} onChange={setEditF('po_date')} required /></Field>
              <Field label="Vendor" required>
                <Select value={editForm.vendor} onChange={setEditF('vendor')} required>
                  <option value="">Select vendor</option>
                  {vendorOptions.map(v => <option key={v.id} value={v.id}>{v.company_name} ({v.vendor_id})</option>)}
                </Select>
              </Field>
              <Field label="Business Division" required>
                <Select value={editForm.business_division} onChange={setEditF('business_division')} required>
                  <option value="solar">Solar</option>
                  <option value="biogas">Biogas</option>
                  <option value="infrastructure">Infrastructure</option>
                  <option value="pharma">Pharma</option>
                  <option value="other">Other</option>
                </Select>
              </Field>
              <Field label="Project / Site" required><Input value={editForm.project_site_name} onChange={setEditF('project_site_name')} required /></Field>
              <Field label="Project Location"><Input value={editForm.project_location} onChange={setEditF('project_location')} /></Field>
              <Field label="Delivery Address"><Input value={editForm.delivery_address} onChange={setEditF('delivery_address')} /></Field>
              <Field label="From Where Material Is Coming"><Input value={editForm.dispatch_origin} onChange={setEditF('dispatch_origin')} /></Field>
              <Field label="Department"><Input value={editForm.department} onChange={setEditF('department')} /></Field>
              <Field label="Status">
                <Select value={editForm.status} onChange={setEditF('status')}>
                  <option value="draft">Draft</option>
                  <option value="approved">Approved</option>
                  <option value="partially_delivered">Partially Delivered</option>
                  <option value="fully_delivered">Fully Delivered</option>
                  <option value="partially_paid">Partially Paid</option>
                  <option value="fully_paid">Fully Paid</option>
                  <option value="closed">Closed</option>
                  <option value="cancelled">Cancelled</option>
                </Select>
              </Field>
              <Field label="Expected Delivery Date"><Input type="date" value={editForm.expected_delivery_date} onChange={setEditF('expected_delivery_date')} /></Field>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setEditing(false)}>Cancel</button>
              <button type="submit" disabled={editSubmitting} className="btn-primary flex items-center gap-2">
                {editSubmitting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}Save Changes
              </button>
            </div>
          </form>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Vendor */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Vendor</p>
            {po.vendor_tracking_id ? (
              <Link to="/vendors" className="font-semibold text-brand-600 hover:text-brand-700 text-sm">{po.vendor}</Link>
            ) : (
              <p className="font-semibold text-slate-800 text-sm">{po.vendor}</p>
            )}
            <p className="text-xs text-slate-400 mt-0.5">{po.vendor_tracking_id}</p>
            <p className="text-xs text-slate-500 mt-1">{po.vendor_tracking_name}</p>
          </div>

          {/* PO details */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Details</p>
            <dl className="space-y-1.5">
              {[
                { l: 'Project', v: po.project_site_name },
                { l: 'Location', v: po.project_location },
                { l: 'Department', v: po.department },
                { l: 'Expected Delivery', v: po.expected_delivery_date },
              ].filter(r => r.v).map(r => (
                <div key={r.l} className="flex items-center gap-2 text-xs">
                  <dt className="text-slate-400 w-24 flex-shrink-0">{r.l}</dt>
                  <dd className="text-slate-700 font-medium">{r.v}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Value summary */}
          <div className="bg-brand-50 border border-brand-100 rounded-xl p-4">
            <p className="text-xs font-semibold text-brand-700 uppercase tracking-wider mb-3">Value Summary</p>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Total PO Value</span>
                <span className="font-semibold text-slate-900">{fmt(po.total_po_value)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Paid</span>
                <span className="font-semibold text-emerald-600">{fmt(po.paid_amount)}</span>
              </div>
              <div className="flex justify-between text-sm border-t border-brand-200 pt-2 mt-2">
                <span className="font-bold text-slate-900">Outstanding</span>
                <span className="font-bold text-brand-600 text-base">{fmt(po.outstanding_amount)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-surface-200">
        <div className="flex">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t ? 'border-brand-500 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {tab === 'Items' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button className="btn-secondary" onClick={() => setShowItemForm(s => !s)}>
              <Plus size={14} />{showItemForm ? 'Cancel' : 'Add Item'}
            </button>
          </div>

          {showItemForm && (
            <Panel title="Add Item" onClose={() => setShowItemForm(false)}>
              {itemError && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{itemError}</div>}
              <form onSubmit={submitItem} className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="col-span-2">
                  <Field label="Material / Description" required>
                    <Input value={itemForm.material_name} onChange={e => setItemForm(f => ({ ...f, material_name: e.target.value }))} required />
                  </Field>
                </div>
                <Field label="Unit" required><Input value={itemForm.unit} onChange={e => setItemForm(f => ({ ...f, unit: e.target.value }))} required /></Field>
                <Field label="Qty" required><Input type="number" min="0" step="any" value={itemForm.ordered_quantity} onChange={e => setItemForm(f => ({ ...f, ordered_quantity: e.target.value }))} required /></Field>
                <Field label="Rate (₹)" required><Input type="number" min="0" step="any" value={itemForm.unit_rate} onChange={e => setItemForm(f => ({ ...f, unit_rate: e.target.value }))} required /></Field>
                <Field label="GST %"><Input type="number" min="0" step="any" value={itemForm.gst_percentage} onChange={e => setItemForm(f => ({ ...f, gst_percentage: e.target.value }))} /></Field>
                <Field label="Brand"><Input value={itemForm.brand} onChange={e => setItemForm(f => ({ ...f, brand: e.target.value }))} /></Field>
                <Field label="Model"><Input value={itemForm.model} onChange={e => setItemForm(f => ({ ...f, model: e.target.value }))} /></Field>
                <div className="col-span-2 md:col-span-4">
                  <Field label="Specification"><Input value={itemForm.specification} onChange={e => setItemForm(f => ({ ...f, specification: e.target.value }))} /></Field>
                </div>
                <div className="col-span-2 md:col-span-4 flex justify-end">
                  <button type="submit" disabled={itemSubmitting} className="btn-primary flex items-center gap-2">
                    {itemSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}Add Item
                  </button>
                </div>
              </form>
            </Panel>
          )}

          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Item Description</th>
                    <th>Unit</th>
                    <th className="text-right">Ordered</th>
                    <th className="text-right">Delivered</th>
                    <th className="text-right">Pending</th>
                    <th className="text-right">Rate (₹)</th>
                    <th className="text-center">GST %</th>
                    <th className="text-right">Amount (₹)</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {po.items.length === 0 ? (
                    <tr><td colSpan={10} className="text-center py-10 text-slate-400">No line items yet.</td></tr>
                  ) : po.items.map((item, i) => (
                    <tr key={item.id}>
                      <td className="text-xs text-slate-400">{i + 1}</td>
                      <td>
                        <div className="font-medium text-slate-800">{item.material_name}</div>
                        {item.specification && <div className="text-xs text-slate-400">{item.specification}</div>}
                      </td>
                      <td className="text-xs text-slate-500">{item.unit}</td>
                      <td className="text-right text-slate-700">{item.ordered_quantity}</td>
                      <td className="text-right text-slate-700">{item.delivered_quantity}</td>
                      <td className="text-right text-slate-700">{item.pending_quantity}</td>
                      <td className="text-right text-slate-700">{Number(item.unit_rate).toLocaleString('en-IN')}</td>
                      <td className="text-center text-xs text-slate-500">{item.gst_percentage}%</td>
                      <td className="text-right font-semibold text-slate-900">{Number(item.total_amount).toLocaleString('en-IN')}</td>
                      <td><span className={`badge ${STATUS_BADGE[item.item_status] || 'badge-slate'}`}>{humanize(item.item_status)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'Deliveries' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button className="btn-secondary" onClick={() => setShowDeliveryForm(s => !s)}>
              <Plus size={14} />{showDeliveryForm ? 'Cancel' : 'Add Delivery'}
            </button>
          </div>

          {showDeliveryForm && (
            <Panel title="Add Delivery" onClose={() => setShowDeliveryForm(false)}>
              {deliveryError && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{deliveryError}</div>}
              <form onSubmit={submitDelivery} className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="col-span-2">
                  <Field label="Item" required>
                    <Select value={deliveryForm.po_item} onChange={e => setDeliveryForm(f => ({ ...f, po_item: e.target.value }))} required>
                      <option value="">Select item</option>
                      {po.items.map(it => <option key={it.id} value={it.id}>{it.material_name}</option>)}
                    </Select>
                  </Field>
                </div>
                <Field label="Reference Code" required><Input value={deliveryForm.delivery_reference_code} onChange={e => setDeliveryForm(f => ({ ...f, delivery_reference_code: e.target.value }))} required /></Field>
                <Field label="Delivery Date" required><Input type="date" value={deliveryForm.delivery_date} onChange={e => setDeliveryForm(f => ({ ...f, delivery_date: e.target.value }))} required /></Field>
                <Field label="Delivered Qty" required><Input type="number" min="0" step="any" value={deliveryForm.delivered_quantity} onChange={e => setDeliveryForm(f => ({ ...f, delivered_quantity: e.target.value }))} required /></Field>
                <Field label="Status">
                  <Select value={deliveryForm.delivery_status} onChange={e => setDeliveryForm(f => ({ ...f, delivery_status: e.target.value }))}>
                    <option value="pending">Pending</option>
                    <option value="in_transit">In Transit</option>
                    <option value="partially_received">Partially Received</option>
                    <option value="received">Received</option>
                    <option value="rejected">Rejected</option>
                  </Select>
                </Field>
                <Field label="Delivery Location"><Input value={deliveryForm.delivery_location} onChange={e => setDeliveryForm(f => ({ ...f, delivery_location: e.target.value }))} /></Field>
                <Field label="Received By"><Input value={deliveryForm.site_received_by} onChange={e => setDeliveryForm(f => ({ ...f, site_received_by: e.target.value }))} /></Field>
                <Field label="QC By"><Input value={deliveryForm.quality_checked_by} onChange={e => setDeliveryForm(f => ({ ...f, quality_checked_by: e.target.value }))} /></Field>
                <div className="col-span-2 md:col-span-4">
                  <Field label="Remarks"><Textarea rows={2} value={deliveryForm.remarks} onChange={e => setDeliveryForm(f => ({ ...f, remarks: e.target.value }))} /></Field>
                </div>
                <div className="col-span-2 md:col-span-4 flex justify-end">
                  <button type="submit" disabled={deliverySubmitting} className="btn-primary flex items-center gap-2">
                    {deliverySubmitting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}Log Delivery
                  </button>
                </div>
              </form>
            </Panel>
          )}

          <div className="card overflow-hidden">
            <table className="data-table">
              <thead><tr><th>Ref</th><th>Item</th><th>Date</th><th className="text-right">Delivered Qty</th><th>Status</th></tr></thead>
              <tbody>
                {po.deliveries.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-10 text-slate-400">No deliveries logged yet.</td></tr>
                ) : po.deliveries.map(d => {
                  const item = po.items.find(it => it.id === d.po_item_id)
                  return (
                    <tr key={d.id}>
                      <td className="font-semibold text-brand-600">{d.delivery_reference_code}</td>
                      <td className="text-slate-600 text-xs max-w-[200px] truncate">{item?.material_name || '—'}</td>
                      <td className="text-xs text-slate-400">{d.delivery_date}</td>
                      <td className="text-right text-slate-700">{d.delivered_quantity}</td>
                      <td><span className={`badge ${STATUS_BADGE[d.delivery_status] || 'badge-slate'}`}>{humanize(d.delivery_status)}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'Payments' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button className="btn-secondary" onClick={() => setShowPaymentForm(s => !s)}>
              <Plus size={14} />{showPaymentForm ? 'Cancel' : 'Log Payment'}
            </button>
          </div>

          {showPaymentForm && (
            <Panel title="Log Payment" onClose={() => setShowPaymentForm(false)}>
              {paymentError && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{paymentError}</div>}
              <form onSubmit={submitPayment} className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Field label="Reference Code" required><Input value={paymentForm.payment_reference_code} onChange={e => setPaymentForm(f => ({ ...f, payment_reference_code: e.target.value }))} required /></Field>
                <Field label="Stage">
                  <Select value={paymentForm.payment_stage} onChange={e => setPaymentForm(f => ({ ...f, payment_stage: e.target.value }))}>
                    <option value="advance">Advance</option>
                    <option value="against_dispatch">Against Dispatch</option>
                    <option value="against_delivery">Against Delivery</option>
                    <option value="after_installation">After Installation</option>
                    <option value="retention">Retention</option>
                    <option value="final_payment">Final Payment</option>
                  </Select>
                </Field>
                <Field label="Amount (₹)" required><Input type="number" min="0" step="any" value={paymentForm.payment_amount} onChange={e => setPaymentForm(f => ({ ...f, payment_amount: e.target.value }))} required /></Field>
                <Field label="Percentage (%)"><Input type="number" min="0" step="any" value={paymentForm.payment_percentage} onChange={e => setPaymentForm(f => ({ ...f, payment_percentage: e.target.value }))} /></Field>
                <Field label="TDS Deduction (₹)"><Input type="number" min="0" step="any" value={paymentForm.tds_deduction} onChange={e => setPaymentForm(f => ({ ...f, tds_deduction: e.target.value }))} /></Field>
                <Field label="GST Amount (₹)"><Input type="number" min="0" step="any" value={paymentForm.gst_amount} onChange={e => setPaymentForm(f => ({ ...f, gst_amount: e.target.value }))} /></Field>
                <Field label="Due Date"><Input type="date" value={paymentForm.payment_due_date} onChange={e => setPaymentForm(f => ({ ...f, payment_due_date: e.target.value }))} /></Field>
                <Field label="Paid Date"><Input type="date" value={paymentForm.payment_paid_date} onChange={e => setPaymentForm(f => ({ ...f, payment_paid_date: e.target.value }))} /></Field>
                <Field label="Mode">
                  <Select value={paymentForm.payment_mode} onChange={e => setPaymentForm(f => ({ ...f, payment_mode: e.target.value }))}>
                    <option value="">Select mode</option>
                    <option value="neft">NEFT</option>
                    <option value="rtgs">RTGS</option>
                    <option value="upi">UPI</option>
                    <option value="cheque">Cheque</option>
                    <option value="cash">Cash</option>
                  </Select>
                </Field>
                <Field label="Bank Txn ID"><Input value={paymentForm.bank_transaction_id} onChange={e => setPaymentForm(f => ({ ...f, bank_transaction_id: e.target.value }))} /></Field>
                <Field label="Status">
                  <Select value={paymentForm.payment_status} onChange={e => setPaymentForm(f => ({ ...f, payment_status: e.target.value }))}>
                    <option value="pending">Pending</option>
                    <option value="approved">Approved</option>
                    <option value="paid">Paid</option>
                    <option value="hold">Hold</option>
                    <option value="rejected">Rejected</option>
                  </Select>
                </Field>
                <Field label="Related Delivery">
                  <Select value={paymentForm.related_delivery} onChange={e => setPaymentForm(f => ({ ...f, related_delivery: e.target.value }))}>
                    <option value="">None</option>
                    {po.deliveries.map(d => <option key={d.id} value={d.id}>{d.delivery_reference_code}</option>)}
                  </Select>
                </Field>
                <div className="col-span-2 md:col-span-4">
                  <Field label="Remarks"><Textarea rows={2} value={paymentForm.remarks} onChange={e => setPaymentForm(f => ({ ...f, remarks: e.target.value }))} /></Field>
                </div>
                <div className="col-span-2 md:col-span-4 flex justify-end">
                  <button type="submit" disabled={paymentSubmitting} className="btn-primary flex items-center gap-2">
                    {paymentSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}Log Payment
                  </button>
                </div>
              </form>
            </Panel>
          )}

          <div className="space-y-3">
            {po.payments.length === 0 ? (
              <div className="card p-10 text-center text-sm text-slate-400">No payments logged yet.</div>
            ) : po.payments.map(p => (
              <div key={p.id} className="card p-4 flex items-center gap-4">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${p.payment_status === 'paid' ? 'bg-emerald-50 text-emerald-600' : 'bg-surface-100 text-slate-400'}`}>
                  {p.payment_status === 'paid' ? <CheckCircle size={18} /> : <Clock size={18} />}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-900">{humanize(p.payment_stage)} · {p.payment_reference_code}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{p.payment_due_date ? `Due ${p.payment_due_date}` : 'No due date'}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-slate-900">{fmt(p.net_payable)}</p>
                  <span className={`badge text-xs mt-0.5 ${STATUS_BADGE[p.payment_status] || 'badge-slate'}`}>{humanize(p.payment_status)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'Documents' && (
        <div className="space-y-4">
          {docError && !showDocForm && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 flex items-center gap-2"><AlertCircle size={14} />{docError}</div>}

          {showDocForm && (
            <Panel title="Upload Document" onClose={() => setShowDocForm(false)}>
              {docError && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{docError}</div>}
              <form onSubmit={submitDoc} className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Field label="Title" required><Input value={docForm.title} onChange={e => setDocForm(f => ({ ...f, title: e.target.value }))} required /></Field>
                <Field label="Document Type">
                  <Select value={docForm.document_type} onChange={e => setDocForm(f => ({ ...f, document_type: e.target.value }))}>
                    <option value="po_copy">PO Copy</option>
                    <option value="vendor_quotation">Vendor Quotation</option>
                    <option value="invoice">Invoice</option>
                    <option value="challan">Challan</option>
                    <option value="eway_bill">E-way Bill</option>
                    <option value="lr_copy">LR Copy</option>
                    <option value="payment_proof">Payment Proof</option>
                    <option value="quality_check">Quality Check</option>
                    <option value="site_receiving">Site Receiving</option>
                    <option value="other">Other</option>
                  </Select>
                </Field>
                <Field label="File" required>
                  <input type="file" required
                    onChange={e => setDocForm(f => ({ ...f, file: e.target.files[0] }))}
                    className="w-full text-sm text-slate-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100 transition"
                  />
                </Field>
                <div className="md:col-span-3">
                  <Field label="Notes"><Textarea rows={2} value={docForm.notes} onChange={e => setDocForm(f => ({ ...f, notes: e.target.value }))} /></Field>
                </div>
                <div className="md:col-span-3 flex justify-end">
                  <button type="submit" disabled={docSubmitting} className="btn-primary flex items-center gap-2">
                    {docSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}Upload
                  </button>
                </div>
              </form>
            </Panel>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {po.documents.map(d => (
              <a key={d.id} href={`/media/${d.file}`} target="_blank" rel="noopener noreferrer"
                className="card p-4 flex items-center gap-3 cursor-pointer hover:shadow-card-hover transition-all">
                <div className="w-10 h-10 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center flex-shrink-0">
                  <FileText size={18} className="text-brand-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{d.title}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{humanize(d.document_type)} · {d.created_at}</p>
                </div>
                <Download size={15} className="text-slate-400 flex-shrink-0" />
              </a>
            ))}
            <button type="button" onClick={() => setShowDocForm(s => !s)}
              className="card p-4 flex items-center justify-center gap-2 text-sm text-brand-500 hover:text-brand-600 hover:shadow-card-hover transition-all border-dashed">
              <FileText size={16} />Upload Document
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
