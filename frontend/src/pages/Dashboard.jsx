import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, AreaChart, Area, Legend,
} from 'recharts'
import {
  TrendingUp, AlertTriangle, FolderKanban, Sun, Zap, Users,
  ShieldCheck, Wallet, CreditCard, Truck, HardHat, Loader2, ChevronDown,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import api from '../services/api'

const num = (v) => Number(v || 0)
const ttStyle = {
  contentStyle: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 12, boxShadow: '0 4px 6px -1px rgba(0,0,0,.08)' },
  labelStyle: { fontWeight: 600, color: '#1e293b' },
}

function Kpi({ icon: Icon, label, value, cls }) {
  return (
    <div className={`card p-4 flex items-center gap-3 border ${cls}`}>
      <Icon size={22} />
      <div>
        <p className="text-xl font-bold text-slate-900">{value}</p>
        <p className="text-xs font-medium opacity-80">{label}</p>
      </div>
    </div>
  )
}

const QUICK_LINKS = [
  { label: 'Work Structure', path: '/projects', icon: FolderKanban, cls: 'text-brand-600 bg-brand-50' },
  { label: 'Daily Progress', path: '/operations/daily-progress', icon: HardHat, cls: 'text-amber-600 bg-amber-50' },
  { label: 'Quality & Punch', path: '/operations/quality', icon: ShieldCheck, cls: 'text-emerald-600 bg-emerald-50' },
  { label: 'Budget vs Actual', path: '/operations/budget', icon: Wallet, cls: 'text-violet-600 bg-violet-50' },
  { label: 'Payments', path: '/payments', icon: CreditCard, cls: 'text-rose-600 bg-rose-50' },
  { label: 'Deliveries', path: '/deliveries', icon: Truck, cls: 'text-blue-600 bg-blue-50' },
]

export default function Dashboard() {
  const { user } = useAuth() || {}
  const [data, setData] = useState(null)
  const [buildId, setBuildId] = useState('')
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  useEffect(() => {
    setLoading(true)
    api.get('/solar/dashboard/' + (buildId ? `?build_id=${buildId}` : ''))
      .then(res => setData(res.data))
      .catch(() => setErr('Could not load the dashboard.'))
      .finally(() => setLoading(false))
  }, [buildId])

  const k = data?.kpis
  const sel = data?.selected

  return (
    <div className="space-y-6 pb-6">
      <div className="page-header">
        <div>
          <h2 className="page-title flex items-center gap-2"><Sun size={20} className="text-brand-600" />Dashboard</h2>
          <p className="page-subtitle">{user?.first_name ? `Welcome back, ${user.first_name}.` : 'Live project overview'}</p>
        </div>
        {data?.projects?.length > 0 && (
          <div className="relative">
            <select value={buildId || (sel ? sel.build_id : '')} onChange={e => setBuildId(e.target.value)}
              className="appearance-none bg-white border border-surface-200 rounded-lg pl-3 pr-8 py-2 text-sm font-medium outline-none focus:ring-1 focus:ring-brand-500">
              {data.projects.map(p => <option key={p.build_id} value={p.build_id}>{p.project} · {p.project_code}</option>)}
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-3 text-slate-400 pointer-events-none" />
          </div>
        )}
      </div>

      {err && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{err}</div>}
      {loading && <div className="flex items-center gap-2 text-sm text-slate-500 py-16 justify-center"><Loader2 size={16} className="animate-spin" />Loading…</div>}

      {!loading && k && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <Kpi icon={FolderKanban} label="Projects" value={k.projects} cls="text-brand-600 bg-brand-50 border-brand-100" />
            <Kpi icon={Zap} label="Total MW (AC)" value={num(k.total_mw).toFixed(1)} cls="text-amber-600 bg-amber-50 border-amber-100" />
            <Kpi icon={TrendingUp} label="Avg progress" value={`${k.avg_progress}%`} cls="text-emerald-600 bg-emerald-50 border-emerald-100" />
            <Kpi icon={Users} label="Active vendors" value={k.active_vendors} cls="text-violet-600 bg-violet-50 border-violet-100" />
            <Kpi icon={AlertTriangle} label="Open defects" value={k.open_punch} cls="text-red-600 bg-red-50 border-red-100" />
            <Kpi icon={ShieldCheck} label="Failed QA" value={k.failed_inspections} cls="text-rose-600 bg-rose-50 border-rose-100" />
          </div>

          {data.projects.length === 0 && (
            <div className="card p-10 text-center text-slate-400">No project builds yet. Create a Work Structure to get started.</div>
          )}

          {sel && (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* Stage completion */}
                <div className="card p-5 lg:col-span-2">
                  <h3 className="text-sm font-semibold text-slate-800 mb-3">Stage completion — {sel.project_code}</h3>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={sel.stage_chart} margin={{ top: 4, right: 8, left: -18, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                      <XAxis dataKey="stage" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={54} interval={0} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip {...ttStyle} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="completed" stackId="a" fill="#10b981" name="Completed" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="inProgress" stackId="a" fill="#f59e0b" name="In progress" />
                      <Bar dataKey="pending" stackId="a" fill="#cbd5e1" name="Pending" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Alerts */}
                <div className="card p-5">
                  <h3 className="text-sm font-semibold text-slate-800 mb-3">Alerts</h3>
                  <div className="space-y-2">
                    {(sel.alerts || []).map((a, i) => (
                      <div key={i} className={`text-xs rounded-lg px-3 py-2 flex items-start gap-2 ${a.type === 'warn' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'}`}>
                        <AlertTriangle size={13} className="mt-0.5 shrink-0" />{a.msg}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Vendor progress */}
                <div className="card p-5">
                  <h3 className="text-sm font-semibold text-slate-800 mb-3">Vendor progress</h3>
                  <div className="space-y-3">
                    {(sel.vendor_stats || []).length === 0 && <p className="text-xs text-slate-400">No vendors assigned yet.</p>}
                    {(sel.vendor_stats || []).map((v, i) => (
                      <div key={i}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="font-medium text-slate-700">{v.name}</span>
                          <span className="text-slate-400">{v.packages} pkg · {v.scope_label}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="h-2 flex-1 rounded-full bg-surface-100 overflow-hidden">
                            <div className="h-full rounded-full bg-brand-500" style={{ width: `${v.pct}%` }} />
                          </div>
                          <span className="text-xs font-semibold text-slate-600 w-9">{v.pct}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Progress timeline */}
                <div className="card p-5">
                  <h3 className="text-sm font-semibold text-slate-800 mb-3">Field progress over time</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={sel.timeline} margin={{ top: 4, right: 8, left: -18, bottom: 4 }}>
                      <defs>
                        <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#0d5cab" stopOpacity={0.3} />
                          <stop offset="100%" stopColor="#0d5cab" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                      <XAxis dataKey="m" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} />
                      <Tooltip {...ttStyle} />
                      <Area type="monotone" dataKey="pct" stroke="#0d5cab" strokeWidth={2} fill="url(#g)" name="Avg %" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          )}

          {/* Quick links */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {QUICK_LINKS.map(q => {
              const Icon = q.icon
              return (
                <Link key={q.path} to={q.path} className={`card p-4 flex flex-col items-start gap-2 hover:shadow-md transition-shadow ${q.cls}`}>
                  <Icon size={20} />
                  <span className="text-xs font-semibold">{q.label}</span>
                </Link>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
