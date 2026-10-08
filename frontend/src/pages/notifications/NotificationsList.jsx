import React, { useState, useEffect } from 'react'
import { Bell, CheckCircle, AlertTriangle, Info, Loader2 } from 'lucide-react'
import api from '../../services/api'

const iconFor = (status) => {
  const s = (status || '').toLowerCase()
  if (['sent', 'delivered', 'success'].includes(s)) return { Icon: CheckCircle, cls: 'text-emerald-600 bg-emerald-50' }
  if (['failed', 'error'].includes(s)) return { Icon: AlertTriangle, cls: 'text-red-600 bg-red-50' }
  return { Icon: Info, cls: 'text-blue-600 bg-blue-50' }
}

export default function NotificationsList() {
  const [notifs, setNotifs] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  useEffect(() => {
    api.get('/notifications/list/')
      .then(res => setNotifs(res.data.notifications || []))
      .catch(() => setErr('Could not load notifications.'))
      .finally(() => setLoading(false))
  }, [])

  const markAllRead = () => setNotifs(n => n.map(x => ({ ...x, read: true })))  // visual only

  return (
    <div className="space-y-6 pb-4">
      <div className="page-header">
        <div>
          <h2 className="page-title">Notifications</h2>
          <p className="page-subtitle">{notifs.filter(n => !n.read).length} unread</p>
        </div>
        <button onClick={markAllRead} className="btn-secondary text-xs">Mark all as read</button>
      </div>

      {err && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{err}</div>}

      <div className="space-y-2 max-w-2xl">
        {loading && <div className="card p-10 text-center text-slate-400"><Loader2 size={16} className="animate-spin inline" /> Loading…</div>}
        {notifs.map(n => {
          const { Icon, cls } = iconFor(n.status)
          return (
            <div key={n.id} className={`card p-4 flex items-start gap-4 ${!n.read ? 'border-brand-200 bg-brand-50/20' : ''}`}>
              <div className={`w-9 h-9 rounded-xl ${cls} flex items-center justify-center flex-shrink-0 mt-0.5`}><Icon size={16} /></div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <p className={`text-sm ${!n.read ? 'font-bold text-slate-900' : 'font-medium text-slate-700'}`}>{n.title}</p>
                  {!n.read && <div className="w-2 h-2 rounded-full bg-brand-500 flex-shrink-0 mt-1.5" />}
                </div>
                <p className="text-xs text-slate-500 mt-1">{n.message}</p>
                <p className="text-xs text-slate-300 mt-1.5">{[n.vendor, n.channel, n.created_at].filter(Boolean).join(' · ')}</p>
              </div>
            </div>
          )
        })}
        {!loading && notifs.length === 0 && (
          <div className="card p-12 text-center text-slate-400">
            <Bell size={32} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">You're all caught up!</p>
          </div>
        )}
      </div>
    </div>
  )
}
