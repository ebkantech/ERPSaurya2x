import React, { useState, useRef, useEffect } from 'react'
import { useLocation, Link } from 'react-router-dom'
import { Bell, Search, ChevronDown, Settings, LogOut, User, X } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import api from '../../services/api'

const routeLabels = {
  '/':                  ['Dashboard'],
  '/vendors':           ['Procurement', 'Vendors'],
  '/purchase-orders':   ['Procurement', 'Purchase Orders'],
  '/deliveries':        ['Procurement', 'Deliveries'],
  '/payments':          ['Procurement', 'Payments'],
  '/projects':          ['Operations', 'Projects'],
  '/materials':         ['Operations', 'Materials'],
  '/transport':         ['Operations', 'Transport'],
  '/tasks':             ['Operations', 'Tasks'],
  '/reports':           ['Analytics', 'Reports'],
  '/notifications':     ['Analytics', 'Notifications'],
  '/administration':    ['System', 'Administration'],
}

const dotFor = (status) => {
  const s = (status || '').toLowerCase()
  if (['sent', 'delivered', 'success'].includes(s)) return 'bg-green-500'
  if (['failed', 'error'].includes(s)) return 'bg-red-500'
  return 'bg-blue-500'
}

function useClickOutside(ref, handler) {
  useEffect(() => {
    const listener = (e) => {
      if (!ref.current || ref.current.contains(e.target)) return
      handler()
    }
    document.addEventListener('mousedown', listener)
    return () => document.removeEventListener('mousedown', listener)
  }, [ref, handler])
}

export default function Header() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const [userMenu, setUserMenu] = useState(false)
  const [notifMenu, setNotifMenu] = useState(false)
  const [notifications, setNotifications] = useState([])

  useEffect(() => {
    api.get('/notifications/list/')
      .then(res => setNotifications((res.data.notifications || []).slice(0, 8).map(n => ({
        id: n.id, title: n.title, time: n.created_at, dot: dotFor(n.status), unread: !n.read,
      }))))
      .catch(() => {})
  }, [])

  const userRef = useRef(null)
  const notifRef = useRef(null)

  useClickOutside(userRef, () => setUserMenu(false))
  useClickOutside(notifRef, () => setNotifMenu(false))

  const basePath = '/' + location.pathname.split('/')[1]
  const crumbs = routeLabels[basePath] || routeLabels[location.pathname] || ['Page']
  const pageTitle = crumbs[crumbs.length - 1]
  const unreadCount = notifications.filter(n => n.unread).length

  const markAllRead = () => setNotifications(n => n.map(x => ({ ...x, unread: false })))

  return (
    <header className="h-16 bg-white border-b border-surface-200 flex items-center px-6 gap-4 flex-shrink-0 z-20">
      {/* Breadcrumb + title */}
      <div className="flex-1 min-w-0">
        <h1 className="text-sm font-bold text-slate-900 truncate">{pageTitle}</h1>
        <p className="text-xs text-slate-400 truncate">
          OmegaERP{crumbs.length > 1 ? ' / ' + crumbs.join(' / ') : ''}
        </p>
      </div>

      {/* Search */}
      <div className="hidden lg:flex items-center bg-surface-50 border border-surface-200 rounded-lg px-3 py-2 gap-2 w-56 xl:w-72">
        <Search size={14} className="text-slate-400 flex-shrink-0" />
        <input
          type="text"
          placeholder="Search vendors, POs, projects…"
          className="bg-transparent text-xs text-slate-700 placeholder-slate-400 outline-none flex-1"
        />
        <kbd className="text-xs text-slate-300 bg-surface-100 px-1.5 py-0.5 rounded border border-surface-200 hidden xl:block">⌘K</kbd>
      </div>

      {/* Notifications */}
      <div className="relative" ref={notifRef}>
        <button
          onClick={() => { setNotifMenu(!notifMenu); setUserMenu(false) }}
          className="relative p-2 rounded-lg hover:bg-surface-100 text-slate-500 hover:text-slate-700 transition-colors"
        >
          <Bell size={18} />
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full ring-2 ring-white" />
          )}
        </button>

        {notifMenu && (
          <div className="absolute right-0 top-12 w-80 card z-50 overflow-hidden shadow-lg">
            <div className="flex items-center justify-between px-4 py-3 border-b border-surface-100">
              <h3 className="font-semibold text-slate-900 text-sm">
                Notifications {unreadCount > 0 && <span className="badge badge-red ml-1">{unreadCount}</span>}
              </h3>
              <button onClick={markAllRead} className="text-xs text-brand-500 hover:text-brand-600 font-medium">
                Mark all read
              </button>
            </div>
            <div className="divide-y divide-surface-100 max-h-72 overflow-y-auto">
              {notifications.map((n) => (
                <div key={n.id} className={`flex items-start gap-3 p-4 hover:bg-surface-50 cursor-pointer transition-colors ${n.unread ? 'bg-brand-50/30' : ''}`}>
                  <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${n.dot}`} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm truncate ${n.unread ? 'font-medium text-slate-800' : 'text-slate-600'}`}>{n.title}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{n.time}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-3 border-t border-surface-100 text-center">
              <Link to="/notifications" onClick={() => setNotifMenu(false)} className="text-xs text-brand-500 hover:text-brand-600 font-medium">
                View all notifications →
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* User menu */}
      <div className="relative" ref={userRef}>
        <button
          onClick={() => { setUserMenu(!userMenu); setNotifMenu(false) }}
          className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-surface-100 transition-colors"
        >
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-bold text-white">{user?.fullName?.charAt(0) ?? 'U'}</span>
          </div>
          <span className="hidden md:block text-sm font-medium text-slate-700 max-w-[120px] truncate">
            {user?.fullName}
          </span>
          <ChevronDown size={13} className="text-slate-400 hidden md:block" />
        </button>

        {userMenu && (
          <div className="absolute right-0 top-12 w-52 card z-50 py-1 shadow-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-surface-100">
              <p className="text-sm font-semibold text-slate-900">{user?.fullName}</p>
              <p className="text-xs text-slate-400 mt-0.5">{user?.role}</p>
            </div>
            <button className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-slate-600 hover:bg-surface-50 hover:text-slate-900 transition-colors">
              <User size={14} />My Profile
            </button>
            <Link to="/administration" onClick={() => setUserMenu(false)} className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-slate-600 hover:bg-surface-50 hover:text-slate-900 transition-colors">
              <Settings size={14} />Settings
            </Link>
            <div className="border-t border-surface-100 mt-1 pt-1">
              <button
                onClick={logout}
                className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
              >
                <LogOut size={14} />Sign Out
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
