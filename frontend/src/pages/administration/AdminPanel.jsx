import React, { useState, useEffect } from 'react'
import {
  Building2, Users, Shield, Mail, Bell, Clock, Key,
  Server, Download, Database, Save, ChevronRight,
} from 'lucide-react'
import api from '../../services/api'

const TABS = [
  { id:'company',  label:'Company',    icon: Building2 },
  { id:'users',    label:'Users & Roles', icon: Users  },
  { id:'security', label:'Security',   icon: Shield   },
  { id:'email',    label:'Email',      icon: Mail     },
  { id:'audit',    label:'Audit Logs', icon: Clock    },
  { id:'system',   label:'System',     icon: Server   },
]

function CompanyTab() {
  return (
    <div className="space-y-5">
      <div className="card p-6">
        <h3 className="font-semibold text-slate-900 mb-5">Organisation Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { l:'Company Name',    v:'Omega Infrastructure Pvt Ltd', full:true },
            { l:'CIN',             v:'U45209MH2015PTC265412' },
            { l:'GST Number',      v:'27AAFCO1234K1ZW'       },
            { l:'PAN Number',      v:'AAFCO1234K'            },
            { l:'Industry',        v:'Renewable Energy EPC'  },
            { l:'Established',     v:'2015'                  },
            { l:'Registered Address', v:'Level 12, One BKC, Bandra Kurla Complex, Mumbai 400 051', full:true },
          ].map(f => (
            <div key={f.l} className={f.full ? 'md:col-span-2' : ''}>
              <label className="form-label">{f.l}</label>
              <input type="text" className="form-input" defaultValue={f.v} />
            </div>
          ))}
        </div>
        <div className="flex justify-end mt-5">
          <button className="btn-primary"><Save size={14} />Save Changes</button>
        </div>
      </div>
    </div>
  )
}

function UsersTab() {
  const [roles, setRoles] = useState([])
  useEffect(() => { api.get('/admin/roles/').then(r => setRoles(r.data.roles || [])).catch(() => {}) }, [])
  return (
    <div className="space-y-5">
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-surface-100 flex items-center justify-between">
          <h3 className="font-semibold text-slate-900 text-sm">Roles & Permissions</h3>
          <button className="btn-primary text-xs py-1.5"><Users size={13} />Add Role</button>
        </div>
        <table className="data-table">
          <thead><tr><th>Role</th><th className="text-center">Users</th><th>Permission Scope</th><th></th></tr></thead>
          <tbody>
            {roles.length === 0 && <tr><td colSpan={4} className="text-center text-slate-400 py-6">No roles configured.</td></tr>}
            {roles.map(r => (
              <tr key={r.role}>
                <td className="font-semibold text-slate-800 capitalize">{(r.role || '').replace(/_/g, ' ')}</td>
                <td className="text-center">
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-brand-50 text-brand-700 text-xs font-bold">{r.users}</span>
                </td>
                <td className="text-xs text-slate-500">{r.modules} modules{r.can_approve ? ' · can approve' : ''}</td>
                <td>
                  <button className="text-xs text-brand-500 hover:text-brand-600 font-semibold flex items-center gap-1">
                    Edit <ChevronRight size={11} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SecurityTab() {
  return (
    <div className="space-y-5">
      <div className="card p-6">
        <h3 className="font-semibold text-slate-900 mb-5">Password Policy</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="form-label">Minimum Password Length</label>
            <input type="number" className="form-input" defaultValue={8} />
          </div>
          <div>
            <label className="form-label">Password Expiry (days)</label>
            <input type="number" className="form-input" defaultValue={90} />
          </div>
          <div>
            <label className="form-label">Session Timeout (minutes)</label>
            <input type="number" className="form-input" defaultValue={30} />
          </div>
          <div>
            <label className="form-label">Max Failed Login Attempts</label>
            <input type="number" className="form-input" defaultValue={5} />
          </div>
        </div>
        <div className="mt-4 space-y-3">
          {[
            'Require uppercase letters',
            'Require numbers',
            'Require special characters',
            'Enable two-factor authentication (2FA)',
            'Enable IP-based access control',
          ].map(item => (
            <label key={item} className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" defaultChecked className="w-4 h-4 accent-brand-500" />
              <span className="text-sm text-slate-700">{item}</span>
            </label>
          ))}
        </div>
        <div className="flex justify-end mt-5">
          <button className="btn-primary"><Save size={14} />Save Policy</button>
        </div>
      </div>
    </div>
  )
}

function EmailTab() {
  return (
    <div className="card p-6">
      <h3 className="font-semibold text-slate-900 mb-5">Email / SMTP Configuration</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[
          { l:'SMTP Host',     v:'smtp.gmail.com', type:'text'     },
          { l:'SMTP Port',     v:'587',            type:'number'   },
          { l:'Username',      v:'erp@omega.com',  type:'email'    },
          { l:'Password',      v:'••••••••••',     type:'password' },
          { l:'From Name',     v:'OmegaERP System',type:'text', full:true },
          { l:'Reply-To',      v:'noreply@omega.com', type:'email', full:true },
        ].map(f => (
          <div key={f.l} className={f.full ? 'md:col-span-2' : ''}>
            <label className="form-label">{f.l}</label>
            <input type={f.type} className="form-input" defaultValue={f.v} />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 mt-5 justify-end">
        <button className="btn-secondary"><Mail size={14} />Send Test Email</button>
        <button className="btn-primary"><Save size={14} />Save Config</button>
      </div>
    </div>
  )
}

function AuditTab() {
  const [auditLogs, setAuditLogs] = useState([])
  useEffect(() => { api.get('/admin/audit-logs/').then(r => setAuditLogs(r.data.audit_logs || [])).catch(() => {}) }, [])
  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-surface-100 flex items-center justify-between">
        <h3 className="font-semibold text-slate-900 text-sm">System Audit Log</h3>
        <button className="btn-secondary text-xs py-1.5"><Download size={13} />Export</button>
      </div>
      <table className="data-table">
        <thead><tr><th>User</th><th>Action</th><th>Module</th><th>IP Address</th><th>Time</th></tr></thead>
        <tbody>
          {auditLogs.length === 0 && <tr><td colSpan={5} className="text-center text-slate-400 py-6">No audit entries.</td></tr>}
          {auditLogs.map((l, i) => (
            <tr key={i}>
              <td className="font-semibold text-slate-800">{l.user}</td>
              <td className="text-slate-600 max-w-[220px] truncate">{l.action}</td>
              <td><span className="badge badge-slate text-xs">{l.module}</span></td>
              <td className="font-mono text-xs text-slate-400">{l.ip}</td>
              <td className="text-xs text-slate-400 whitespace-nowrap">{l.time}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SystemTab() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      <div className="card p-5">
        <h3 className="font-semibold text-slate-900 text-sm mb-4">Database Backup</h3>
        <p className="text-xs text-slate-500 mb-4">Last backup: 14 Jun 2024, 2:00 AM · Status: Success</p>
        <div className="space-y-2">
          <button className="btn-primary w-full justify-center"><Database size={14} />Create Backup Now</button>
          <button className="btn-secondary w-full justify-center"><Download size={14} />Download Latest Backup</button>
        </div>
      </div>
      <div className="card p-5">
        <h3 className="font-semibold text-slate-900 text-sm mb-4">System Information</h3>
        <dl className="space-y-2.5">
          {[
            { l:'ERP Version',   v:'2.4.1' },
            { l:'Django Version', v:'6.0.5' },
            { l:'Python Version', v:'3.14' },
            { l:'Database',      v:'PostgreSQL 16' },
            { l:'Server',        v:'Gunicorn / Vercel' },
          ].map(r => (
            <div key={r.l} className="flex justify-between text-xs">
              <dt className="text-slate-400">{r.l}</dt>
              <dd className="font-semibold text-slate-700 font-mono">{r.v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}

const tabContent = { company:<CompanyTab />, users:<UsersTab />, security:<SecurityTab />, email:<EmailTab />, audit:<AuditTab />, system:<SystemTab /> }

export default function AdminPanel() {
  const [tab, setTab] = useState('company')

  return (
    <div className="space-y-6 pb-4">
      <div>
        <h2 className="page-title">Administration</h2>
        <p className="page-subtitle">Manage system-wide settings, users, and configuration</p>
      </div>

      <div className="flex gap-5">
        {/* Sidebar nav */}
        <div className="w-48 flex-shrink-0">
          <nav className="card p-2 space-y-0.5">
            {TABS.map(t => {
              const Icon = t.icon
              return (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`flex items-center gap-2.5 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${
                    tab === t.id ? 'bg-brand-50 text-brand-700 border border-brand-100' : 'text-slate-600 hover:bg-surface-50 hover:text-slate-900'
                  }`}
                >
                  <Icon size={15} className="flex-shrink-0" />
                  {t.label}
                </button>
              )
            })}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {tabContent[tab]}
        </div>
      </div>
    </div>
  )
}
