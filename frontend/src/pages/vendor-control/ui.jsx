import React from 'react'
import { X, Loader2, AlertCircle, CheckCircle2, ShieldAlert } from 'lucide-react'

// Shared mini-components for the vendor-control page family. These mirror the
// Field/Input/Select/Textarea components duplicated across VendorCreate.jsx /
// MaterialList.jsx / QuotationBuilder.jsx, factored into one module here
// since this route tree has 12 pages that all need them.

export const Field = ({ label, required, children, hint }) => (
  <div>
    <label className="block text-xs font-medium text-slate-600 mb-1">
      {label}{required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
    {children}
    {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
  </div>
)

export const Input = ({ className = '', ...props }) => (
  <input
    {...props}
    className={`w-full px-3 py-2 text-sm border border-surface-200 rounded-lg bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition ${className}`}
  />
)

export const Select = ({ children, className = '', ...props }) => (
  <select
    {...props}
    className={`w-full px-3 py-2 text-sm border border-surface-200 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition ${className}`}
  >
    {children}
  </select>
)

export const Textarea = ({ className = '', ...props }) => (
  <textarea
    {...props}
    className={`w-full px-3 py-2 text-sm border border-surface-200 rounded-lg bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition resize-none ${className}`}
  />
)

export function Panel({ title, onClose, children }) {
  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center justify-between border-b border-surface-100 pb-3">
        <h3 className="font-semibold text-slate-900 text-sm">{title}</h3>
        {onClose && (
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={16} />
          </button>
        )}
      </div>
      {children}
    </div>
  )
}

export function Notice({ notice, onClose }) {
  if (!notice) return null
  return (
    <div className={`flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm border ${
      notice.type === 'error' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
    }`}>
      {notice.type === 'error' ? <AlertCircle size={16} className="flex-shrink-0" /> : <CheckCircle2 size={16} className="flex-shrink-0" />}
      <span className="flex-1">{notice.message}</span>
      {onClose && <button className="text-slate-400 hover:text-slate-600 flex-shrink-0" onClick={onClose}><X size={14} /></button>}
    </div>
  )
}

export function LoadingRow({ label = 'Loading…' }) {
  return (
    <div className="flex items-center gap-2 text-sm text-slate-500 py-16 justify-center">
      <Loader2 size={16} className="animate-spin" />{label}
    </div>
  )
}

export function ErrorBanner({ message }) {
  if (!message) return null
  return (
    <div className="flex items-center gap-2.5 bg-red-50 text-red-700 border border-red-200 rounded-xl px-4 py-3 text-sm">
      <AlertCircle size={16} className="flex-shrink-0" />{message}
    </div>
  )
}

export function AccessDenied({ message = 'Admin access required.' }) {
  return (
    <div className="card p-10 text-center">
      <ShieldAlert size={28} className="mx-auto text-amber-500 mb-3" />
      <p className="text-sm font-medium text-slate-700">{message}</p>
      <p className="text-xs text-slate-400 mt-1">Contact an administrator if you believe this is a mistake.</p>
    </div>
  )
}

export const humanize = (s) => (s || '').toString().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

const TASK_STATUS_BADGE = { pending: 'badge-amber', in_progress: 'badge-blue', completed: 'badge-green', overdue: 'badge-red', cancelled: 'badge-slate' }
const PRIORITY_BADGE = { low: 'badge-slate', medium: 'badge-blue', high: 'badge-amber', urgent: 'badge-red' }
const ASSIGNMENT_STATUS_BADGE = { active: 'badge-green', reassigned: 'badge-blue', removed: 'badge-slate', on_hold: 'badge-amber' }

export const TaskStatusBadge = ({ status }) => (
  <span className={`badge text-xs ${TASK_STATUS_BADGE[status] || 'badge-slate'}`}>{humanize(status) || '—'}</span>
)
export const PriorityBadge = ({ priority }) => (
  <span className={`badge text-xs ${PRIORITY_BADGE[priority] || 'badge-slate'}`}>{humanize(priority) || '—'}</span>
)
export const AssignmentStatusBadge = ({ status }) => (
  <span className={`badge text-xs ${ASSIGNMENT_STATUS_BADGE[status] || 'badge-slate'}`}>{humanize(status) || '—'}</span>
)
