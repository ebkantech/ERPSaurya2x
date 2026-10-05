import React, { useState, useRef, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area, Legend,
} from 'recharts'
import {
  Building2, TrendingUp, AlertTriangle, ArrowRight, Package,
  FolderKanban, Activity, Sparkles, Send, Sun, Calendar,
  ChevronDown, Zap, DollarSign, CheckCircle2, Clock,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import {
  VENDORS as SolarVendors, SITES as SolarSites,
  WORK_STAGES as SolarStages, siteProgressPct,
} from './projects/SolarSiteTracker'

// ─── helpers ───────────────────────────────────────────────────────────────
const fmtDate = (iso) =>
  new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })

const ttStyle = {
  contentStyle: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 12, boxShadow: '0 4px 6px -1px rgba(0,0,0,.08)' },
  labelStyle: { fontWeight: 600, color: '#1e293b' },
}

// ─── compute KUSUM data from imported site records ──────────────────────────
const kusumVendorStats = SolarVendors.map(v => {
  const vSites = SolarSites.filter(s => s.vendor === v.name)
  const mw = vSites.reduce((s, x) => s + x.mw, 0)
  const pct = Math.round(vSites.reduce((s, x) => s + siteProgressPct(x), 0) / vSites.length)
  const lastUpdated = vSites.reduce((latest, x) => (x.updatedOn > latest ? x.updatedOn : latest), vSites[0].updatedOn)
  const activeIdxs = vSites.map(x => x.inProgress).filter(i => i !== null)
  const scopeLabel = activeIdxs.length ? SolarStages[Math.min(...activeIdxs)].label : 'All Stages Complete'
  return { name: v.name, color: v.color, mw, sites: vSites.length, pct, lastUpdated, scopeLabel }
})

const kusumStageChart = SolarStages.map((ws, idx) => ({
  stage: ws.label.split('/')[0].split('(')[0].trim().substring(0, 12),
  completed:  SolarSites.filter(s => s.completed > idx).length,
  inProgress: SolarSites.filter(s => s.inProgress === idx).length,
  pending:    SolarSites.filter(s => s.completed <= idx && s.inProgress !== idx).length,
}))

const kusumCircleChart = [...new Set(SolarSites.map(s => s.circle))].map(circle => {
  const cs = SolarSites.filter(s => s.circle === circle)
  return { circle, pct: Math.round(cs.reduce((s, x) => s + siteProgressPct(x), 0) / cs.length) }
}).sort((a, b) => b.pct - a.pct)

const kusumTimeline = [
  { m: 'Jan', pct: 5 }, { m: 'Feb', pct: 14 }, { m: 'Mar', pct: 23 },
  { m: 'Apr', pct: 35 }, { m: 'May', pct: 47 }, { m: 'Jun', pct: 62 },
  { m: 'Jul', pct: null },
]

// ─── project registry (dropdown) ───────────────────────────────────────────
const PROJECTS = [
  {
    id: 1, name: 'KUSUM A & C 205 MW Rajasthan', type: 'Solar PV',
    state: 'Rajasthan', mw: 205, totalSites: 16, cost: '₹320Cr',
    status: 'Active', vendors: 5, client: 'MNRE / RVPN',
    updatedOn: '2026-06-30', hasSiteData: true,
    vendorStats: kusumVendorStats, stageChart: kusumStageChart,
    circleChart: kusumCircleChart, timeline: kusumTimeline,
  },
  {
    id: 2, name: 'KUSUM B 80 MW Madhya Pradesh', type: 'Solar PV',
    state: 'Madhya Pradesh', mw: 80, totalSites: 8, cost: '₹128Cr',
    status: 'Active', vendors: 3, client: 'MPCZ', updatedOn: '2026-06-28',
    hasSiteData: false,
    vendorStats: [
      { name: 'SunTech EPC',   color: 'bg-blue-500',   mw: 30, sites: 3, pct: 45, scopeLabel: 'ICR Marking / Foundation',  lastUpdated: '2026-06-26' },
      { name: 'Radiant Solar', color: 'bg-teal-500',   mw: 28, sites: 3, pct: 28, scopeLabel: 'Survey & Layout Marking',   lastUpdated: '2026-06-24' },
      { name: 'Vertex Power',  color: 'bg-rose-500',   mw: 22, sites: 2, pct: 62, scopeLabel: 'Module Installation',       lastUpdated: '2026-06-27' },
    ],
    stageChart: [
      { stage: 'Cleaning',    completed: 8, inProgress: 0, pending: 0 },
      { stage: 'Working',     completed: 8, inProgress: 0, pending: 0 },
      { stage: 'Survey',      completed: 7, inProgress: 1, pending: 0 },
      { stage: 'NTP/Drwg',   completed: 5, inProgress: 2, pending: 1 },
      { stage: 'Fencing',     completed: 4, inProgress: 2, pending: 2 },
      { stage: 'Piling',      completed: 3, inProgress: 2, pending: 3 },
      { stage: 'ICR/Fnd',    completed: 2, inProgress: 1, pending: 5 },
      { stage: 'MMS',         completed: 1, inProgress: 1, pending: 6 },
      { stage: 'Module',      completed: 1, inProgress: 0, pending: 7 },
      { stage: 'Electrical',  completed: 0, inProgress: 1, pending: 7 },
    ],
    circleChart: [
      { circle: 'Bhopal',  pct: 62 }, { circle: 'Rewa',    pct: 45 },
      { circle: 'Sagar',   pct: 28 }, { circle: 'Indore',  pct: 18 },
    ],
    timeline: [
      { m: 'Feb', pct: 4 }, { m: 'Mar', pct: 11 }, { m: 'Apr', pct: 22 },
      { m: 'May', pct: 35 }, { m: 'Jun', pct: 44 }, { m: 'Jul', pct: null },
    ],
  },
  {
    id: 3, name: 'Wind Farm Gamma 100 MW Tamil Nadu', type: 'Wind',
    state: 'Tamil Nadu', mw: 100, totalSites: 10, cost: '₹102Cr',
    status: 'Active', vendors: 4, client: 'TANGEDCO', updatedOn: '2026-06-25',
    hasSiteData: false,
    vendorStats: [
      { name: 'Suzlon EPC',   color: 'bg-cyan-500',    mw: 35, sites: 4, pct: 88, scopeLabel: 'Electrical Work',          lastUpdated: '2026-06-25' },
      { name: 'Inox Wind',    color: 'bg-violet-500',  mw: 30, sites: 3, pct: 74, scopeLabel: 'Module Installation',      lastUpdated: '2026-06-22' },
      { name: 'Windworld',    color: 'bg-amber-500',   mw: 20, sites: 2, pct: 91, scopeLabel: 'Electrical Work',          lastUpdated: '2026-06-24' },
      { name: 'Greenko',      color: 'bg-emerald-500', mw: 15, sites: 1, pct: 100, scopeLabel: 'All Stages Complete',     lastUpdated: '2026-06-20' },
    ],
    stageChart: [
      { stage: 'Cleaning',    completed: 10, inProgress: 0, pending: 0 },
      { stage: 'Working',     completed: 10, inProgress: 0, pending: 0 },
      { stage: 'Survey',      completed: 10, inProgress: 0, pending: 0 },
      { stage: 'NTP/Drwg',   completed: 10, inProgress: 0, pending: 0 },
      { stage: 'Fencing',     completed: 10, inProgress: 0, pending: 0 },
      { stage: 'Piling',      completed: 9,  inProgress: 1, pending: 0 },
      { stage: 'ICR/Fnd',    completed: 8,  inProgress: 1, pending: 1 },
      { stage: 'MMS',         completed: 7,  inProgress: 2, pending: 1 },
      { stage: 'Module',      completed: 5,  inProgress: 3, pending: 2 },
      { stage: 'Electrical',  completed: 3,  inProgress: 2, pending: 5 },
    ],
    circleChart: [
      { circle: 'Coimbatore',  pct: 91 }, { circle: 'Tirunelveli', pct: 85 },
      { circle: 'Madurai',     pct: 78 }, { circle: 'Salem',        pct: 68 },
    ],
    timeline: [
      { m: 'Sep', pct: 8 }, { m: 'Oct', pct: 22 }, { m: 'Nov', pct: 38 },
      { m: 'Dec', pct: 54 }, { m: 'Jan', pct: 68 }, { m: 'Feb', pct: 77 },
      { m: 'Mar', pct: 84 }, { m: 'Jun', pct: null },
    ],
  },
  {
    id: 4, name: 'Biogas Plant Beta 5 MW Punjab', type: 'Biogas',
    state: 'Punjab', mw: 5, totalSites: 3, cost: '₹12Cr',
    status: 'Active', vendors: 2, client: 'MNRE', updatedOn: '2026-06-20',
    hasSiteData: false,
    vendorStats: [
      { name: 'BioEnergy Tech', color: 'bg-lime-500',   mw: 3, sites: 2, pct: 34, scopeLabel: 'ICR Marking / Foundation', lastUpdated: '2026-06-19' },
      { name: 'GreenGas Pvt',   color: 'bg-orange-500', mw: 2, sites: 1, pct: 20, scopeLabel: 'Fencing / Boundary',       lastUpdated: '2026-06-17' },
    ],
    stageChart: [
      { stage: 'Cleaning',    completed: 3, inProgress: 0, pending: 0 },
      { stage: 'Working',     completed: 3, inProgress: 0, pending: 0 },
      { stage: 'Survey',      completed: 3, inProgress: 0, pending: 0 },
      { stage: 'NTP/Drwg',   completed: 2, inProgress: 1, pending: 0 },
      { stage: 'Fencing',     completed: 1, inProgress: 1, pending: 1 },
      { stage: 'Piling',      completed: 1, inProgress: 0, pending: 2 },
      { stage: 'ICR/Fnd',    completed: 0, inProgress: 1, pending: 2 },
      { stage: 'MMS',         completed: 0, inProgress: 0, pending: 3 },
      { stage: 'Module',      completed: 0, inProgress: 0, pending: 3 },
      { stage: 'Electrical',  completed: 0, inProgress: 0, pending: 3 },
    ],
    circleChart: [
      { circle: 'Amritsar', pct: 40 },
      { circle: 'Ludhiana', pct: 30 },
      { circle: 'Patiala',  pct: 18 },
    ],
    timeline: [
      { m: 'Mar', pct: 6 }, { m: 'Apr', pct: 16 }, { m: 'May', pct: 26 },
      { m: 'Jun', pct: 30 }, { m: 'Jul', pct: null },
    ],
  },
]

// ─── top-level KPIs ─────────────────────────────────────────────────────────
const TOTAL_MW   = PROJECTS.reduce((s, p) => s + p.mw, 0)
const TOTAL_COST = '₹562Cr'

const STATS = [
  { label: 'Total Projects',  value: String(PROJECTS.length), change: '+1', up: true,  icon: FolderKanban, color: 'bg-blue-500',   path: '/projects'  },
  { label: 'Active Vendors',  value: '89',                    change: '+5', up: true,  icon: Building2,    color: 'bg-violet-500', path: '/vendors'   },
  { label: 'Total MW',        value: `${TOTAL_MW} MW`,        change: '+80 MW', up: true, icon: Zap,       color: 'bg-amber-500',  path: '/projects'  },
  { label: 'Total Cost',      value: TOTAL_COST,              change: '4 projects', up: null, icon: DollarSign, color: 'bg-emerald-500', path: '/projects' },
]

const ALERTS = [
  { type: 'error',   msg: '3 site deliveries overdue > 7 days in Rajasthan',          path: '/deliveries' },
  { type: 'warning', msg: 'Vendor Neel Krishna — pending MMS material delivery',       path: '/vendors'    },
  { type: 'info',    msg: 'KUSUM A&C Pokaran S/S achieved 100% — all stages complete', path: '/projects/solar-tracker' },
]
const dotColor = { error: 'bg-red-500', warning: 'bg-amber-500', info: 'bg-blue-500' }

const quickActions = [
  { label: 'Solar Site Tracker',  path: '/projects/solar-tracker', icon: Sun,         cls: 'text-amber-600 bg-amber-50'   },
  { label: 'Register New Vendor', path: '/vendors',                 icon: Building2,   cls: 'text-violet-600 bg-violet-50' },
  { label: 'Add Material',        path: '/materials',               icon: Package,     cls: 'text-orange-600 bg-orange-50' },
  { label: 'View All Projects',   path: '/projects',                icon: FolderKanban, cls: 'text-blue-600 bg-blue-50'    },
]

// ─── pie data helper ─────────────────────────────────────────────────────────
const PIE_COLORS = ['#94a3b8', '#f59e0b', '#3b82f6', '#10b981']
function buildSiteDistribution(vendorStats, totalSites) {
  const flat = vendorStats.flatMap(v =>
    Array.from({ length: v.sites }, () => v.pct)
  )
  const actual = flat.length ? flat : Array(totalSites).fill(30)
  const bands = [
    { name: '0 – 25%',   count: actual.filter(p => p <= 25).length           },
    { name: '26 – 50%',  count: actual.filter(p => p > 25 && p <= 50).length },
    { name: '51 – 75%',  count: actual.filter(p => p > 50 && p <= 75).length },
    { name: '76 – 100%', count: actual.filter(p => p > 75).length            },
  ]
  return bands.filter(b => b.count > 0)
}

// ─── custom tooltips ─────────────────────────────────────────────────────────
const VendorTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-white border border-surface-200 rounded-lg shadow-md px-3 py-2 text-xs">
      <p className="font-semibold text-slate-800 mb-1">{d.name}</p>
      <p className="text-slate-500">{d.mw} MW · {d.sites} sites</p>
      <p className="text-slate-500 truncate max-w-[180px]">{d.scopeLabel}</p>
      <p className="text-brand-600 font-semibold mt-1">{d.pct}% complete</p>
      <p className="text-slate-400 mt-0.5 flex items-center gap-1"><Calendar size={9} />Updated {fmtDate(d.lastUpdated)}</p>
    </div>
  )
}

const StageTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-surface-200 rounded-lg shadow-md px-3 py-2 text-xs">
      <p className="font-semibold text-slate-800 mb-1">{label}</p>
      {payload.map(p => (
        <p key={p.dataKey} style={{ color: p.fill }} className="font-medium">{p.name}: {p.value} sites</p>
      ))}
    </div>
  )
}

// ─── project dropdown component ───────────────────────────────────────────────
function ProjectDropdown({ projects, selected, onSelect }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])
  const typeBadge = { 'Solar PV': 'badge-amber', Wind: 'badge-blue', Biogas: 'badge-green', Civil: 'badge-slate' }
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-4 py-2.5 bg-white border border-surface-200 rounded-xl text-sm font-semibold text-slate-700 hover:border-brand-300 hover:bg-brand-50 transition-all shadow-sm"
      >
        <Sun size={15} className="text-amber-500 flex-shrink-0" />
        <span className="max-w-[280px] truncate">{selected.name}</span>
        <span className={`badge ml-1 ${typeBadge[selected.type] ?? 'badge-slate'}`}>{selected.type}</span>
        <ChevronDown size={14} className={`ml-1 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-2 z-30 w-[360px] bg-white border border-surface-200 rounded-xl shadow-xl overflow-hidden">
          <p className="px-4 pt-3 pb-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Select Project</p>
          {projects.map(p => (
            <button key={p.id} onClick={() => { onSelect(p); setOpen(false) }}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-brand-50 transition-colors ${p.id === selected.id ? 'bg-brand-50' : ''}`}>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${p.id === selected.id ? 'bg-brand-500' : 'bg-surface-100'}`}>
                {p.type === 'Solar PV' ? <Sun size={14} className={p.id === selected.id ? 'text-white' : 'text-amber-500'} /> : <Zap size={14} className={p.id === selected.id ? 'text-white' : 'text-slate-500'} />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">{p.name}</p>
                <p className="text-xs text-slate-400">{p.mw} MW · {p.totalSites} sites · {p.cost}</p>
              </div>
              {p.id === selected.id && <CheckCircle2 size={14} className="text-brand-500 flex-shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── main dashboard ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const { user } = useAuth()
  const firstName = user?.fullName?.split(' ')[0] ?? 'User'
  const dateStr = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const [proj, setProj] = useState(PROJECTS[0])

  const siteDist = useMemo(() => buildSiteDistribution(proj.vendorStats, proj.totalSites), [proj])
  const overallPct = useMemo(
    () => Math.round(proj.vendorStats.reduce((s, v) => s + v.pct * v.sites, 0) / proj.totalSites),
    [proj]
  )

  return (
    <div className="space-y-6 pb-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Good morning, {firstName} 👋</h2>
          <p className="text-slate-500 text-sm mt-0.5">Here's your operations snapshot for today</p>
        </div>
        <div className="text-right hidden sm:block">
          <p className="text-sm font-medium text-slate-700">{dateStr}</p>
          <p className="text-xs text-slate-400 mt-0.5">Q1 FY 2025-26</p>
        </div>
      </div>

      {/* Alerts */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
        <AlertTriangle size={17} className="text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-900 mb-2">Attention Required</p>
          <div className="space-y-1.5">
            {ALERTS.map((a, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotColor[a.type]}`} />
                <p className="text-sm text-amber-800 flex-1 min-w-0 truncate">{a.msg}</p>
                <Link to={a.path} className="text-xs text-amber-700 font-semibold hover:underline whitespace-nowrap ml-2">View →</Link>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* KPI stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {STATS.map((s) => {
          const Icon = s.icon
          return (
            <Link key={s.label} to={s.path} className="stat-card group cursor-pointer block">
              <div className="flex items-start justify-between mb-4">
                <div className={`${s.color} w-10 h-10 rounded-xl flex items-center justify-center shadow-sm`}>
                  <Icon size={19} className="text-white" />
                </div>
                {s.up !== null && (
                  <span className={`text-xs font-semibold flex items-center gap-1 ${s.up ? 'text-emerald-600' : 'text-red-600'}`}>
                    <TrendingUp size={12} />{s.change}
                  </span>
                )}
              </div>
              <p className="text-2xl font-bold text-slate-900 group-hover:text-brand-600 transition-colors">{s.value}</p>
              <p className="text-xs text-slate-500 mt-1">{s.label}</p>
            </Link>
          )
        })}
      </div>

      {/* ── Project Analytics (dropdown-driven) ────────────────────────────── */}
      <div className="card p-5">
        {/* Selector bar */}
        <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
          <ProjectDropdown projects={PROJECTS} selected={proj} onSelect={setProj} />
          <div className="flex items-center gap-4 text-xs text-slate-500 flex-shrink-0">
            <span><span className="font-bold text-slate-700">{proj.totalSites}</span> sites</span>
            <span><span className="font-bold text-slate-700">{proj.mw} MW</span></span>
            <span><span className="font-bold text-slate-700">{proj.cost}</span></span>
            <span className="flex items-center gap-1"><Calendar size={11} />Updated {fmtDate(proj.updatedOn)}</span>
            {proj.hasSiteData && (
              <Link to="/projects/solar-tracker" className="text-brand-500 font-semibold hover:text-brand-600 flex items-center gap-1">
                Site tracker <ArrowRight size={11} />
              </Link>
            )}
          </div>
        </div>

        {/* Overall progress strip */}
        <div className="bg-surface-50 rounded-xl p-3 mb-5 flex items-center gap-4">
          <div className="flex-1">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-slate-500 font-medium">Overall Completion</span>
              <span className="font-bold text-slate-800">{overallPct}%</span>
            </div>
            <div className="h-2 bg-surface-200 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${overallPct === 100 ? 'bg-emerald-500' : 'bg-brand-500'}`} style={{ width: `${overallPct}%` }} />
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-500 flex-shrink-0">
            <span className="flex items-center gap-1"><CheckCircle2 size={12} className="text-emerald-500" />{proj.vendorStats.filter(v => v.pct === 100).length} done</span>
            <span className="flex items-center gap-1"><Clock size={12} className="text-amber-500" />{proj.vendorStats.filter(v => v.pct > 0 && v.pct < 100).length} active</span>
          </div>
        </div>

        {/* Chart row 1: Stage Bottleneck + Site Distribution */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
          {/* Stage bottleneck — stacked bar */}
          <div className="lg:col-span-2">
            <p className="text-xs font-semibold text-slate-500 mb-3">Work Stage Completion — Site Count</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={proj.stageChart} barSize={16} margin={{ top: 2, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="stage" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip content={<StageTooltip />} />
                <Bar dataKey="completed"  stackId="a" fill="#10b981" radius={[0,0,0,0]} name="Completed" />
                <Bar dataKey="inProgress" stackId="a" fill="#f59e0b" radius={[0,0,0,0]} name="In Progress" />
                <Bar dataKey="pending"    stackId="a" fill="#e2e8f0" radius={[3,3,0,0]} name="Pending" />
              </BarChart>
            </ResponsiveContainer>
            <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />Completed</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber-400" />In Progress</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-surface-200 border border-surface-300" />Pending</span>
            </div>
          </div>

          {/* Site distribution donut */}
          <div>
            <p className="text-xs font-semibold text-slate-500 mb-3">Site Progress Distribution</p>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={siteDist} cx="50%" cy="50%" innerRadius={45} outerRadius={70}
                  dataKey="count" stroke="none">
                  {siteDist.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v, n) => [v + ' sites', n]} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-1.5 mt-1">
              {siteDist.map((b, i) => (
                <div key={b.name} className="flex items-center gap-2 text-xs text-slate-600">
                  <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                  <span className="flex-1">{b.name}</span>
                  <span className="font-bold text-slate-800">{b.count} sites</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Chart row 2: Vendor progress + table */}
        <div className="border-t border-surface-100 pt-5 mb-5">
          <p className="text-xs font-semibold text-slate-500 mb-3">Contractor-wise Progress & Work Scope</p>
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
            <div className="lg:col-span-3">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={proj.vendorStats} barSize={26} margin={{ top: 2, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} unit="%" domain={[0, 100]} />
                  <Tooltip content={<VendorTooltip />} />
                  <Bar dataKey="pct" radius={[4, 4, 0, 0]} fill="#0d5cab" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="lg:col-span-2 space-y-2">
              {proj.vendorStats.map(v => (
                <div key={v.name} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-surface-50 transition-colors">
                  <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${v.color}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">{v.name}</p>
                    <p className="text-xs text-slate-400 truncate">{v.scopeLabel}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-slate-900">{v.pct}%</p>
                    <p className="text-xs text-slate-400 flex items-center gap-1 justify-end"><Calendar size={9} />{fmtDate(v.lastUpdated)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Chart row 3: Circle progress + Timeline */}
        <div className="border-t border-surface-100 pt-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Circle / zone-wise progress */}
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-3">Zone / Circle Progress</p>
              <div className="space-y-3">
                {proj.circleChart.map(c => (
                  <div key={c.circle}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-slate-600 font-medium">{c.circle}</span>
                      <span className="font-bold text-slate-800">{c.pct}%</span>
                    </div>
                    <div className="h-2 bg-surface-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${c.pct === 100 ? 'bg-emerald-500' : c.pct > 70 ? 'bg-brand-500' : c.pct > 40 ? 'bg-amber-400' : 'bg-slate-400'}`}
                        style={{ width: `${c.pct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Monthly progress timeline */}
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-3">Monthly Progress Trend (%)</p>
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={proj.timeline.filter(d => d.pct !== null)} margin={{ top: 2, right: 4, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="timeGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#0d5cab" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#0d5cab" stopOpacity={0}   />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="m" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} unit="%" />
                  <Tooltip {...ttStyle} formatter={v => [`${v}%`, 'Progress']} />
                  <Area type="monotone" dataKey="pct" stroke="#0d5cab" strokeWidth={2.5} fill="url(#timeGrad)" dot={{ r: 3, fill: '#0d5cab' }} activeDot={{ r: 5 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom row: Delivery Health + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900 text-sm">Delivery Health</h3>
            <Activity size={16} className="text-slate-400" />
          </div>
          {[
            { label: 'On Time',  v: 42, pct: 70, c: 'bg-emerald-500' },
            { label: 'Delayed',  v: 12, pct: 20, c: 'bg-amber-500'   },
            { label: 'Critical', v: 6,  pct: 10, c: 'bg-red-500'     },
          ].map(item => (
            <div key={item.label} className="mb-3 last:mb-0">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-slate-600 font-medium">{item.label}</span>
                <span className="font-bold text-slate-900">{item.v}</span>
              </div>
              <div className="h-1.5 bg-surface-100 rounded-full overflow-hidden">
                <div className={`h-full ${item.c} rounded-full transition-all`} style={{ width: `${item.pct}%` }} />
              </div>
            </div>
          ))}
        </div>

        <div className="card p-5">
          <h3 className="font-semibold text-slate-900 text-sm mb-3">Quick Actions</h3>
          <div className="space-y-1">
            {quickActions.map((a) => {
              const Icon = a.icon
              return (
                <Link key={a.path} to={a.path} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-surface-50 transition-colors group">
                  <div className={`w-8 h-8 rounded-lg ${a.cls} flex items-center justify-center flex-shrink-0`}>
                    <Icon size={14} />
                  </div>
                  <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900 flex-1">{a.label}</span>
                  <ArrowRight size={13} className="text-slate-300 group-hover:text-slate-500 group-hover:translate-x-0.5 transition-all" />
                </Link>
              )
            })}
          </div>
        </div>
      </div>

      {/* AI Assistant card */}
      <div className="card overflow-hidden">
        <div className="flex flex-col md:flex-row items-stretch">
          <div className="md:w-72 bg-gradient-to-br from-brand-900 via-brand-800 to-brand-700 p-6 flex-shrink-0 relative overflow-hidden">
            <div className="absolute -top-8 -right-8 w-32 h-32 bg-brand-500/20 rounded-full blur-2xl pointer-events-none" />
            <div className="absolute -bottom-8 -left-8 w-40 h-40 bg-brand-400/10 rounded-full blur-3xl pointer-events-none" />
            <div className="relative z-10">
              <div className="w-11 h-11 bg-white/10 rounded-2xl flex items-center justify-center mb-4 border border-white/10">
                <Sparkles size={22} className="text-brand-300" />
              </div>
              <h3 className="font-bold text-white text-base mb-1.5">Saurya2x Assistant</h3>
              <p className="text-brand-300 text-xs leading-relaxed mb-4">
                AI-powered semantic search across vendors, POs, site data, materials, and project status.
              </p>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-xs text-brand-300 font-medium">Online · FAISS + Keyword search</span>
              </div>
            </div>
          </div>
          <div className="flex-1 p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-slate-700">Try asking…</p>
              <Link to="/assistant" className="text-xs text-brand-500 font-semibold hover:text-brand-600 flex items-center gap-1">
                Open full view <ArrowRight size={11} />
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
              {[
                'Progress of Pathfaund in KUSUM project',
                'Which sites are in MMS stage?',
                'Vendors not started electrical work',
                'Circle with highest completion rate',
              ].map(prompt => (
                <Link key={prompt} to="/assistant"
                  className="flex items-center gap-2.5 px-3 py-2.5 bg-surface-50 border border-surface-200 rounded-xl hover:border-brand-200 hover:bg-brand-50 transition-all group cursor-pointer"
                >
                  <div className="w-6 h-6 rounded-lg bg-brand-100 flex items-center justify-center flex-shrink-0">
                    <Send size={11} className="text-brand-600" />
                  </div>
                  <span className="text-xs text-slate-600 group-hover:text-brand-700 font-medium truncate">{prompt}</span>
                </Link>
              ))}
            </div>
            <p className="text-xs text-slate-400 text-center">
              Or click the <span className="font-semibold text-brand-500">✦ AI Assistant</span> link in the sidebar
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
