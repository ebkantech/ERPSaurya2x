import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import clsx from 'clsx'
import {
  LayoutDashboard, Building2, ShoppingCart, Truck, CreditCard,
  FolderKanban, Package, BarChart3, Settings, LogOut, Zap,
  ChevronRight, ArrowLeftRight, Bell, ClipboardList, Sparkles, PackageSearch,
  Users as UsersIcon,
} from 'lucide-react'

const navGroups = [
  {
    label: 'Overview',
    items: [
      { label: 'Dashboard',        icon: LayoutDashboard, path: '/' },
    ],
  },
  {
    label: 'Procurement',
    items: [
      { label: 'Vendors',          icon: Building2,   path: '/vendors' },
      { label: 'Purchase Orders',  icon: ShoppingCart, path: '/purchase-orders' },
      { label: 'Deliveries',       icon: Truck,        path: '/deliveries' },
      { label: 'Payments',         icon: CreditCard,   path: '/payments' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { label: 'Projects',         icon: FolderKanban, path: '/projects' },
      { label: 'Materials',        icon: Package,      path: '/materials' },
      { label: 'Quotations', icon: PackageSearch, path: '/materials/quotations' },
      { label: 'Transport',        icon: ArrowLeftRight, path: '/transport' },
      { label: 'Tasks',            icon: ClipboardList, path: '/tasks' },
    ],
  },
  {
    label: 'Analytics',
    items: [
      { label: 'Reports',          icon: BarChart3,    path: '/reports'        },
      { label: 'Notifications',    icon: Bell,         path: '/notifications'  },
      { label: 'AI Assistant',     icon: Sparkles,     path: '/assistant'      },
    ],
  },
  {
    label: 'System',
    items: [
      { label: 'Administration',      icon: Settings,   path: '/administration' },
      { label: 'Vendor Authorization', icon: UsersIcon, path: '/vendor-control' },
    ],
  },
]

export default function Sidebar() {
  const { user, logout } = useAuth()
  const location = useLocation()

  const allPaths = navGroups.flatMap((group) => group.items.map((item) => item.path))
  const bestMatch = allPaths
    .filter((path) => (path === '/' ? location.pathname === '/' : location.pathname.startsWith(path)))
    .sort((a, b) => b.length - a.length)[0]
  const isActive = (path) => path === bestMatch

  return (
    <div className="fixed inset-y-0 left-0 w-64 bg-brand-900 flex flex-col z-30 shadow-sidebar">
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 h-16 border-b border-white/10 flex-shrink-0">
        <div className="w-8 h-8 bg-gradient-to-br from-brand-400 to-brand-600 rounded-lg flex items-center justify-center shadow-lg flex-shrink-0">
          <Zap size={15} className="text-white" />
        </div>
        <div>
          <p className="font-bold text-white text-sm tracking-wide leading-none">OmegaERP</p>
          <p className="text-xs text-brand-400 mt-0.5">Enterprise Suite</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-2">
        {navGroups.map((group) => (
          <div key={group.label}>
            <p className="sidebar-group-label">{group.label}</p>
            {group.items.map((item) => {
              const Icon = item.icon
              const active = isActive(item.path)
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={clsx('sidebar-link', active && 'active')}
                >
                  <Icon size={17} className="flex-shrink-0" />
                  <span>{item.label}</span>
                  {active && <ChevronRight size={13} className="ml-auto opacity-70" />}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      {/* User footer */}
      <div className="border-t border-white/10 p-3 flex-shrink-0">
        <div className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-white/5 transition-colors group">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-bold text-white">
              {user?.fullName?.charAt(0) ?? 'U'}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{user?.fullName}</p>
            <p className="text-xs text-slate-400 truncate">{user?.role}</p>
          </div>
          <button
            onClick={logout}
            title="Sign out"
            className="p-1.5 rounded-md text-slate-500 hover:text-red-400 hover:bg-red-400/10 transition-all opacity-0 group-hover:opacity-100"
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
