import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Search, Package, Upload, Download, Plus, X, Layers, List as ListIcon, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'
import api from '../../services/api'

const MATERIAL_LIST_URL = '/materials/master/list/'
const MATERIAL_IMPORT_URL = '/materials/master/import/'
const MATERIAL_CREATE_URL = '/materials/master/create/'

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

function AddMaterialModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    material_name: '', specification: '', work_package: '', qty_specification: '',
    qty: '', hsn_code: '', gst_percentage: '', pf_rate: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.material_name.trim()) {
      setError('Material name is required.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const res = await api.post(MATERIAL_CREATE_URL, form)
      onCreated(res.data.material)
    } catch (err) {
      setError(err.response?.data?.error || 'Could not add the material.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="card w-full max-w-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900">Add Material</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 bg-red-50 text-red-700 border border-red-200 rounded-lg px-3 py-2 text-sm">
            <AlertCircle size={14} className="flex-shrink-0" />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Material Name" required>
            <Input value={form.material_name} onChange={set('material_name')} placeholder="e.g. MC4 Connector" autoFocus />
          </Field>
          <Field label="Specification">
            <Input value={form.specification} onChange={set('specification')} placeholder="e.g. IP68, 1500V DC" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category">
              <Input value={form.work_package} onChange={set('work_package')} placeholder="e.g. Electrical" />
            </Field>
            <Field label="Unit">
              <Input value={form.qty_specification} onChange={set('qty_specification')} placeholder="e.g. Nos" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Stock Qty">
              <Input type="number" min="0" step="1" value={form.qty} onChange={set('qty')} placeholder="0" />
            </Field>
            <Field label="Rate (₹)">
              <Input type="number" min="0" step="0.01" value={form.pf_rate} onChange={set('pf_rate')} placeholder="0.00" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="HSN Code">
              <Input value={form.hsn_code} onChange={set('hsn_code')} placeholder="e.g. 85369090" />
            </Field>
            <Field label="GST %">
              <Input type="number" min="0" step="0.01" value={form.gst_percentage} onChange={set('gst_percentage')} placeholder="e.g. 18" />
            </Field>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={submitting} className="btn-primary disabled:opacity-60">
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Add Material
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function MaterialRow({ row }) {
  return (
    <tr>
      <td className="font-mono text-xs font-bold text-brand-600">{row.material_code || '-'}</td>
      <td>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-orange-50 border border-orange-100 flex items-center justify-center flex-shrink-0">
            <Package size={13} className="text-orange-500" />
          </div>
          <div>
            <div className="font-medium text-slate-800">{row.material_name || 'Unspecified Material'}</div>
            {row.specification && <div className="text-xs text-slate-400">{row.specification}</div>}
          </div>
        </div>
      </td>
      <td><span className="badge badge-slate text-xs">{row.work_package || '-'}</span></td>
      <td className="text-xs text-slate-500">{row.qty_specification || '-'}</td>
      <td className="font-mono text-xs text-slate-500">{row.hsn_code || '-'}</td>
      <td className="text-xs font-semibold text-slate-600">{row.gst_percentage ? `${row.gst_percentage}%` : '-'}</td>
      <td className="text-right font-semibold text-slate-900">{row.pf_rate ? `₹${row.pf_rate}` : '-'}</td>
      <td className="text-right font-bold text-slate-900">{row.qty || '0'}</td>
    </tr>
  )
}

export default function MaterialList() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [notice, setNotice] = useState(null)
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('All')
  const [grouped, setGrouped] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef(null)

  const fetchMaterials = async () => {
    setLoading(true)
    setLoadError('')
    try {
      const res = await api.get(MATERIAL_LIST_URL)
      setRows(res.data.rows || [])
    } catch (err) {
      setLoadError(err.response?.data?.error || 'Failed to load materials.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchMaterials() }, [])

  const categories = useMemo(() => {
    const set = new Set(rows.map((r) => r.work_package).filter(Boolean))
    return ['All', ...Array.from(set).sort()]
  }, [rows])

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (catFilter !== 'All' && r.work_package !== catFilter) return false
      if (!q) return true
      const haystack = [r.material_name, r.material_code, r.specification, r.hsn_code, r.work_package]
        .join(' ').toLowerCase()
      return haystack.includes(q)
    })
  }, [rows, search, catFilter])

  const groups = useMemo(() => {
    const map = new Map()
    filteredRows.forEach((row) => {
      const name = (row.material_name || '').trim() || 'Unspecified Material'
      const key = name.toLowerCase()
      if (!map.has(key)) map.set(key, { key, name, rows: [] })
      map.get(key).rows.push(row)
    })
    return Array.from(map.values())
  }, [filteredRows])

  const handleImportClick = () => fileInputRef.current?.click()

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      setNotice({ type: 'error', message: 'Please upload the material list in .xlsx format.' })
      return
    }
    const confirmed = window.confirm(
      'Importing will replace the entire material register with this Excel file. Continue?'
    )
    if (!confirmed) return

    setImporting(true)
    setNotice(null)
    try {
      const formData = new FormData()
      formData.append('materialFile', file)
      // Content-Type must be unset (not the client's default 'application/json')
      // so axios/the browser can set multipart/form-data with the boundary itself.
      const res = await api.post(MATERIAL_IMPORT_URL, formData, { headers: { 'Content-Type': undefined } })
      setNotice({ type: 'success', message: `${res.data.message} (${res.data.row_count} rows imported)` })
      await fetchMaterials()
    } catch (err) {
      setNotice({ type: 'error', message: err.response?.data?.error || 'Failed to import the material Excel file.' })
    } finally {
      setImporting(false)
    }
  }

  const handleExport = () => {
    if (!filteredRows.length) {
      setNotice({ type: 'error', message: 'No materials to export.' })
      return
    }
    const headers = ['Material Code', 'Material Name', 'Specification', 'Category', 'Unit', 'Stock Qty', 'HSN Code', 'GST %', 'Rate']
    const csvRows = filteredRows.map((r) => [
      r.material_code, r.material_name, r.specification, r.work_package,
      r.qty_specification, r.qty, r.hsn_code, r.gst_percentage, r.pf_rate,
    ])
    const csv = [headers, ...csvRows]
      .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `material-master-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const handleCreated = (material) => {
    setRows((prev) => [...prev, material])
    setShowAddModal(false)
    setNotice({ type: 'success', message: `${material.material_name} added to the material register.` })
  }

  return (
    <div className="space-y-6 pb-4">
      <div className="page-header">
        <div>
          <h2 className="page-title">Material Master</h2>
          <p className="page-subtitle">{loading ? 'Loading…' : `${rows.length} materials registered in the system`}</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-secondary" onClick={handleExport}><Download size={14} />Export</button>
          <button className="btn-secondary" onClick={handleImportClick} disabled={importing}>
            {importing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            Import Excel
          </button>
          <input ref={fileInputRef} type="file" accept=".xlsx" className="hidden" onChange={handleFileChange} />
          <button className="btn-primary" onClick={() => setShowAddModal(true)}><Plus size={14} />Add Material</button>
        </div>
      </div>

      {notice && (
        <div className={`flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm border ${
          notice.type === 'error' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
        }`}>
          {notice.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
          {notice.message}
          <button className="ml-auto text-slate-400 hover:text-slate-600" onClick={() => setNotice(null)}><X size={14} /></button>
        </div>
      )}

      {loadError && (
        <div className="flex items-center gap-2.5 bg-red-50 text-red-700 border border-red-200 rounded-xl px-4 py-3 text-sm">
          <AlertCircle size={16} />
          {loadError}
          <button className="ml-auto btn-secondary" onClick={fetchMaterials}>Retry</button>
        </div>
      )}

      {/* Filter bar */}
      <div className="card p-4 flex items-center gap-3 flex-wrap">
        <div className="flex items-center bg-surface-50 border border-surface-200 rounded-lg px-3 py-2 gap-2 flex-1 max-w-sm">
          <Search size={14} className="text-slate-400" />
          <input type="text" placeholder="Search material name, code, spec, HSN…"
            className="bg-transparent text-sm placeholder-slate-400 outline-none flex-1"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {categories.map((c) => (
            <button key={c} onClick={() => setCatFilter(c)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${catFilter === c ? 'bg-brand-500 text-white shadow-sm' : 'bg-surface-50 text-slate-600 border border-surface-200 hover:bg-surface-100'}`}
            >
              {c}
            </button>
          ))}
        </div>
        <button
          onClick={() => setGrouped((g) => !g)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-surface-200 bg-surface-50 text-slate-600 hover:bg-surface-100 transition-colors"
          title={grouped ? 'Switch to flat list' : 'Group by material name'}
        >
          {grouped ? <Layers size={13} /> : <ListIcon size={13} />}
          {grouped ? 'Grouped' : 'Flat list'}
        </button>
        <span className="ml-auto text-xs text-slate-400">{filteredRows.length} items</span>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Material Code</th>
                <th>Description</th>
                <th>Category</th>
                <th>Unit</th>
                <th>HSN Code</th>
                <th>GST Rate</th>
                <th className="text-right">Last Rate</th>
                <th className="text-right">Stock Qty</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="text-center py-10 text-slate-400">
                  <Loader2 size={18} className="animate-spin inline-block mr-2" />Loading materials…
                </td></tr>
              ) : filteredRows.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-10 text-slate-400">
                  No materials found. {rows.length === 0 ? 'Import an Excel register or add one manually.' : 'Try a different search or filter.'}
                </td></tr>
              ) : grouped ? (
                groups.map((group) => (
                  <React.Fragment key={group.key}>
                    <tr className="bg-surface-50">
                      <td colSpan={8} className="!py-2">
                        <div className="flex items-center gap-2">
                          <Layers size={13} className="text-brand-500" />
                          <span className="font-semibold text-slate-800">{group.name}</span>
                          <span className="text-xs text-slate-400">{group.rows.length} specification{group.rows.length === 1 ? '' : 's'}</span>
                        </div>
                      </td>
                    </tr>
                    {group.rows.map((row) => <MaterialRow key={row.id} row={row} />)}
                  </React.Fragment>
                ))
              ) : (
                filteredRows.map((row) => <MaterialRow key={row.id} row={row} />)
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showAddModal && (
        <AddMaterialModal onClose={() => setShowAddModal(false)} onCreated={handleCreated} />
      )}
    </div>
  )
}
