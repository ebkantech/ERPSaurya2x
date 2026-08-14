import React from 'react'
import { Link } from 'react-router-dom'
import { Building2, Users, ClipboardList, AlertTriangle, CheckCircle2, FileWarning, History } from 'lucide-react'
import { useVendorControl } from './context'
import { LoadingRow, PriorityBadge } from './ui'

function KPI({ label, value, icon: Icon, cls }) {
  return (
    <div className="card p-4 flex items-center gap-3">
      <div className={`w-9 h-9 rounded-xl ${cls} flex items-center justify-center flex-shrink-0`}>
        <Icon size={16} />
      </div>
      <div>
        <p className="font-bold text-slate-900 text-lg leading-none">{value ?? 0}</p>
        <p className="text-xs text-slate-400 mt-0.5">{label}</p>
      </div>
    </div>
  )
}

export default function VendorControlDashboard() {
  const { data, isAdmin, loading, error } = useVendorControl()

  if (loading) return <LoadingRow label="Loading dashboard…" />
  if (error || !data) return null // the layout already renders the error banner

  if (isAdmin) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <KPI label="Total Vendors" value={data.total_vendors} icon={Building2} cls="text-blue-600 bg-blue-50" />
          <KPI label="Assigned" value={data.assigned_vendors} icon={CheckCircle2} cls="text-emerald-600 bg-emerald-50" />
          <KPI label="Unassigned" value={data.unassigned_vendors} icon={FileWarning} cls="text-amber-600 bg-amber-50" />
          <KPI label="Pending Tasks" value={data.pending_tasks} icon={ClipboardList} cls="text-violet-600 bg-violet-50" />
          <KPI label="Overdue Tasks" value={data.overdue_tasks} icon={AlertTriangle} cls="text-red-600 bg-red-50" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="card p-5">
            <h3 className="font-semibold text-slate-900 text-sm mb-4">Vendors by Staff</h3>
            {!data.vendors_by_staff?.length ? (
              <p className="text-sm text-slate-400">No assignments yet.</p>
            ) : (
              <div className="space-y-2">
                {data.vendors_by_staff.map((r, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5 border-b border-surface-50 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-slate-800">{r.staff_name}</p>
                      <p className="text-xs text-slate-400">{r.employee_id}</p>
                    </div>
                    <span className="badge badge-blue">{r.total}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card p-5">
            <h3 className="font-semibold text-slate-900 text-sm mb-4">Vendors by Category</h3>
            {!data.vendors_by_category?.length ? (
              <p className="text-sm text-slate-400">No categories recorded.</p>
            ) : (
              <div className="space-y-2">
                {data.vendors_by_category.map((r, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5 border-b border-surface-50 last:border-0">
                    <p className="text-sm text-slate-700">{r.category || 'Uncategorized'}</p>
                    <span className="badge badge-slate">{r.total}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="p-4 border-b border-surface-100 flex items-center gap-2">
            <Users size={15} className="text-brand-500" />
            <h3 className="font-semibold text-slate-900 text-sm">Staff Workload</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr><th>Staff</th><th>Role</th><th className="text-right">Vendors</th><th className="text-right">Open Tasks</th></tr>
              </thead>
              <tbody>
                {(data.staff_workload || []).map((s, i) => (
                  <tr key={i}>
                    <td className="font-medium text-slate-800">{s.staff_name}</td>
                    <td className="text-xs text-slate-500">{s.role}</td>
                    <td className="text-right">{s.vendor_count}</td>
                    <td className="text-right">{s.open_task_count}</td>
                  </tr>
                ))}
                {!data.staff_workload?.length && (
                  <tr><td colSpan={4} className="text-center py-8 text-slate-400">No staff records yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <History size={15} className="text-brand-500" />
            <h3 className="font-semibold text-slate-900 text-sm">Recently Reassigned</h3>
          </div>
          {!data.recently_reassigned?.length ? (
            <p className="text-sm text-slate-400">No recent reassignments.</p>
          ) : (
            <div className="space-y-3">
              {data.recently_reassigned.map((r) => (
                <div key={r.id} className="flex items-start justify-between gap-4 py-2 border-b border-surface-50 last:border-0">
                  <div>
                    <Link to={`/vendor-control/vendors/${r.vendor_id}`} className="text-sm font-medium text-brand-600 hover:text-brand-700">
                      {r.vendor_name}
                    </Link>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {r.previous_staff || '—'} → {r.new_staff || '—'} <span className="text-slate-300">by {r.changed_by}</span>
                    </p>
                    {r.reason && <p className="text-xs text-slate-400 mt-0.5">{r.reason}</p>}
                  </div>
                  <span className="text-xs text-slate-400 whitespace-nowrap">
                    {r.changed_date ? new Date(r.changed_date).toLocaleString() : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KPI label="My Vendors" value={data.my_vendor_count} icon={Building2} cls="text-blue-600 bg-blue-50" />
        <KPI label="Pending Tasks" value={data.pending_tasks} icon={ClipboardList} cls="text-violet-600 bg-violet-50" />
        <KPI label="Overdue Tasks" value={data.overdue_tasks} icon={AlertTriangle} cls="text-red-600 bg-red-50" />
        <KPI label="Completed Tasks" value={data.completed_tasks} icon={CheckCircle2} cls="text-emerald-600 bg-emerald-50" />
        <KPI label="Docs Pending" value={data.vendor_documents_pending} icon={FileWarning} cls="text-amber-600 bg-amber-50" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="card p-5">
          <h3 className="font-semibold text-slate-900 text-sm mb-4">Upcoming Follow-ups</h3>
          {!data.upcoming_followups?.length ? (
            <p className="text-sm text-slate-400">Nothing due in the next few days.</p>
          ) : (
            <div className="space-y-2">
              {data.upcoming_followups.map((f) => (
                <div key={f.id} className="flex items-center justify-between py-1.5 border-b border-surface-50 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{f.task_title}</p>
                    <p className="text-xs text-slate-400">{f.vendor_name} · due {f.due_date}</p>
                  </div>
                  <PriorityBadge priority={f.priority} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card p-5">
          <h3 className="font-semibold text-slate-900 text-sm mb-4">My Assignments</h3>
          {!data.my_assignments?.length ? (
            <p className="text-sm text-slate-400">No vendors assigned to you yet.</p>
          ) : (
            <div className="space-y-2">
              {data.my_assignments.map((a, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 border-b border-surface-50 last:border-0">
                  <Link to={`/vendor-control/vendors/${a.vendor_id}`} className="text-sm font-medium text-brand-600 hover:text-brand-700">
                    {a.vendor_name}
                  </Link>
                  <span className="badge badge-slate text-xs capitalize">{a.assignment_role}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
