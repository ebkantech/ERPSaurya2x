import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Zap, Eye, EyeOff, ArrowRight, AlertCircle, Shield } from 'lucide-react'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ username: '', password: '' })
  const [remember, setRemember] = useState(true)
  const [showPwd, setShowPwd] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(form.username, form.password, remember)
      navigate('/')
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid username or password. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  return (
    <div className="min-h-screen flex bg-brand-900">
      {/* Left — brand panel */}
      <div className="hidden lg:flex lg:w-[52%] flex-col justify-between p-12 relative overflow-hidden">
        {/* Gradient blobs */}
        <div className="absolute inset-0 bg-gradient-to-br from-brand-800 via-brand-900 to-slate-900" />
        <div className="absolute top-24 -left-24 w-80 h-80 bg-brand-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-24 -right-24 w-96 h-96 bg-brand-400/10 rounded-full blur-3xl pointer-events-none" />

        {/* Logo */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-brand-400 to-brand-600 rounded-xl flex items-center justify-center shadow-lg">
            <Zap size={20} className="text-white" />
          </div>
          <div>
            <p className="font-bold text-white text-lg leading-none">Saurya2x</p>
            <p className="text-xs text-brand-300 mt-0.5">Enterprise Resource Planning</p>
          </div>
        </div>

        {/* Tagline */}
        <div className="relative z-10 max-w-md">
          <h2 className="text-3xl font-light text-white leading-snug mb-6">
            Streamline procurement,<br />
            <span className="font-bold text-brand-300">track every rupee.</span>
          </h2>
          <p className="text-brand-200/80 text-sm leading-relaxed mb-8">
            Manage vendors, purchase orders, deliveries, and payments — all in one integrated enterprise platform built for Indian infrastructure businesses.
          </p>
          <div className="flex items-center gap-3">
            <div className="flex -space-x-2">
              {['RK', 'AM', 'PS', 'JD'].map((i) => (
                <div key={i} className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 border-2 border-brand-900 flex items-center justify-center">
                  <span className="text-xs font-semibold text-white">{i}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-brand-200">Trusted by 50+ procurement teams across India</p>
          </div>
        </div>

        {/* Stats */}
        <div className="relative z-10 grid grid-cols-3 gap-3">
          {[
            { v: '2,400+', l: 'Vendors' },
            { v: '₹480 Cr', l: 'PO Value' },
            { v: '15+', l: 'Modules' },
          ].map((s) => (
            <div key={s.l} className="bg-white/5 backdrop-blur border border-white/10 rounded-xl p-4">
              <p className="text-xl font-bold text-white">{s.v}</p>
              <p className="text-xs text-brand-300 mt-0.5">{s.l}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Right — form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-surface-50">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <div className="w-9 h-9 bg-brand-500 rounded-xl flex items-center justify-center">
              <Zap size={18} className="text-white" />
            </div>
            <span className="font-bold text-slate-900 text-lg">Saurya2x</span>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900">Sign in to your account</h2>
            <p className="text-slate-500 text-sm mt-2">Enter your credentials to access the ERP system</p>
          </div>

          {error && (
            <div className="flex items-center gap-2.5 bg-red-50 text-red-700 border border-red-200 rounded-xl px-4 py-3 mb-6 text-sm">
              <AlertCircle size={16} className="flex-shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="form-label">Username</label>
              <input
                type="text"
                className="form-input"
                placeholder="Enter your username"
                value={form.username}
                onChange={set('username')}
                autoFocus
                required
              />
            </div>

            <div>
              <label className="form-label">Password</label>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  className="form-input pr-10"
                  placeholder="Enter your password"
                  value={form.password}
                  onChange={set('password')}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded border-surface-300 accent-brand-500"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                <span className="text-sm text-slate-600">Keep me signed in</span>
              </label>
              <button type="button" className="text-sm text-brand-500 hover:text-brand-600 font-medium">
                Forgot password?
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-semibold py-2.5 px-4 rounded-xl transition-colors disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
            >
              {loading
                ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : <><span>Sign In</span><ArrowRight size={16} /></>
              }
            </button>
          </form>

          <div className="mt-8 flex items-center gap-2 text-xs text-slate-400 justify-center">
            <Shield size={12} />
            <span>Protected by enterprise-grade security. All data encrypted.</span>
          </div>
        </div>
      </div>
    </div>
  )
}
