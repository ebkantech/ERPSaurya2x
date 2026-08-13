import React, { useEffect, useState } from 'react'
import { FileText, Loader2, Save, BookMarked } from 'lucide-react'
import api from '../../services/api'

const REPORTS_URL = '/reports/'
const SAVE_REPORT_URL = '/reports/saved/create/'

const MONEY_KEYS = new Set([
  'total_po_value', 'paid_amount', 'outstanding_amount', 'total_value', 'net_payable', 'invoice_amount',
])

const humanize = (key) => key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

const fmtCell = (key, value) => {
  if (value === null || value === undefined || value === '') return '—'
  if (MONEY_KEYS.has(key)) return `₹${Number(value).toLocaleString('en-IN')}`
  return String(value)
}

export default function ReportsList() {
  const [reportType, setReportType] = useState('po_summary')
  const [reportTypes, setReportTypes] = useState([])
  const [rows, setRows] = useState([])
  const [savedReports, setSavedReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [saveName, setSaveName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveNotice, setSaveNotice] = useState('')

  const fetchReport = (type) => {
    setLoading(true)
    setError('')
    api.get(REPORTS_URL, { params: { type } })
      .then(res => {
        setReportTypes(res.data.report_types || [])
        setRows(res.data.report_rows || [])
        setSavedReports(res.data.saved_reports || [])
      })
      .catch(() => setError('Could not load this report.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchReport(reportType) }, [reportType])

  const labelFor = (value) => (reportTypes.find(([v]) => v === value) || [value, humanize(value)])[1]

  const columns = rows.length > 0 ? Object.keys(rows[0]) : []

  const handleSave = async (e) => {
    e.preventDefault()
    if (!saveName.trim()) {
      setSaveError('Give the report a name.')
      return
    }
    setSaving(true)
    setSaveError('')
    setSaveNotice('')
    try {
      const res = await api.post(SAVE_REPORT_URL, { name: saveName, report_type: reportType, filters_json: '{}' })
      setSavedReports(prev => [res.data.report, ...prev])
      setSaveName('')
      setSaveNotice('Report saved.')
      setTimeout(() => setSaveNotice(''), 4000)
    } catch (err) {
      const data = err.response?.data
      const fieldMsg = data?.field_errors ? Object.values(data.field_errors)[0]?.[0] : ''
      setSaveError(data?.error || fieldMsg || 'Could not save the report.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 pb-4">
      <div className="page-header">
        <div>
          <h2 className="page-title">Reports &amp; Analytics</h2>
          <p className="page-subtitle">Generate procurement reports and save the ones you use often</p>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-md">
        <div className="card p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl text-amber-600 bg-amber-50 flex items-center justify-center flex-shrink-0">
            <BookMarked size={16} />
          </div>
          <div>
            <p className="font-bold text-slate-900 text-lg leading-none">{savedReports.length}</p>
            <p className="text-xs text-slate-400 mt-0.5">Saved Reports</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl text-brand-600 bg-brand-50 flex items-center justify-center flex-shrink-0">
            <FileText size={16} />
          </div>
          <div>
            <p className="font-bold text-slate-900 text-lg leading-none">{rows.length}</p>
            <p className="text-xs text-slate-400 mt-0.5">Rows in current report</p>
          </div>
        </div>
      </div>

      {/* Report type tabs */}
      <div className="flex gap-2 flex-wrap">
        {(reportTypes.length ? reportTypes : [[reportType, humanize(reportType)]]).map(([value, label]) => (
          <button key={value} onClick={() => setReportType(value)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              reportType === value ? 'bg-brand-500 text-white shadow-sm' : 'bg-surface-50 text-slate-600 border border-surface-200 hover:bg-surface-100'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Report table */}
        <div className="xl:col-span-2 card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-surface-100">
            <h3 className="font-semibold text-slate-900 text-sm">{labelFor(reportType)}</h3>
            <span className="text-xs text-slate-400">{loading ? 'Loading…' : `${rows.length} rows`}</span>
          </div>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-5 py-3">{error}</div>
          )}
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  {columns.map(col => (
                    <th key={col} className={MONEY_KEYS.has(col) ? 'text-right' : ''}>{humanize(col)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={Math.max(columns.length, 1)} className="text-center py-10 text-slate-400">
                    <Loader2 size={16} className="animate-spin inline-block mr-2" />Loading report…
                  </td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={Math.max(columns.length, 1)} className="text-center py-10 text-slate-400">No data for this report.</td></tr>
                ) : rows.map((row, i) => (
                  <tr key={i}>
                    {columns.map(col => (
                      <td key={col} className={MONEY_KEYS.has(col) ? 'text-right font-semibold text-slate-900' : ''}>
                        {fmtCell(col, row[col])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Saved reports panel */}
        <div className="card p-5 space-y-4 h-fit">
          <h3 className="font-semibold text-slate-900 text-sm">Saved Reports</h3>

          <form onSubmit={handleSave} className="space-y-2">
            {saveError && <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2">{saveError}</div>}
            {saveNotice && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-lg px-3 py-2">{saveNotice}</div>}
            <input
              type="text"
              placeholder={`Save current "${labelFor(reportType)}" as…`}
              value={saveName}
              onChange={e => setSaveName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-surface-200 rounded-lg bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition"
            />
            <button type="submit" disabled={saving} className="btn-primary w-full flex items-center justify-center gap-2">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}Save Current Report
            </button>
          </form>

          <div className="space-y-2 pt-2 border-t border-surface-100">
            {savedReports.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">No saved reports yet.</p>
            ) : savedReports.map(r => (
              <div key={r.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-50 border border-surface-200">
                <FileText size={13} className="text-slate-400 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-slate-800 truncate">{r.name}</p>
                  <p className="text-xs text-slate-400">{humanize(r.report_type)} · {r.created_at}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
