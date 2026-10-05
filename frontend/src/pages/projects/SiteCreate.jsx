import React, { useState, useEffect } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, Loader2, AlertTriangle, MapPin } from 'lucide-react'
import api from '../../services/api'

const BLANK = {
  siteName: '', capacityMw: '', landAreaAcres: '', mountingType: '',
  village: '', tehsil: '', district: '', state: '',
  latitude: '', longitude: '', khasraNumbers: '',
  landTitle: '', ownerName: '', tenureYears: '', note: '',
}

const fmtMw = (v) => (v === '' || v === null || v === undefined ? '—' : `${Number(v).toFixed(2)} MW`)

export default function SiteCreate() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const [form, setForm] = useState(BLANK)
  const [options, setOptions] = useState(null)
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState([])

  useEffect(() => {
    let active = true
    api.get(`/projects/${projectId}/sites/options/`)
      .then(res => {
        if (!active) return
        setOptions(res.data)
        setSummary(res.data.summary || null)
      })
      .catch(() => { if (active) setErrors(['Could not load the form.']) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [projectId])

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  // Live capacity guard, mirroring the server-side check.
  const allocated = Number(summary?.allocated_mw || 0)
  const sanctioned = Number(summary?.sanctioned_mw || 0)
  const entered = Number(form.capacityMw || 0)
  const wouldExceed = sanctioned > 0 && entered > 0 && (allocated + entered) > sanctioned

  const submit = (e) => {
    e.preventDefault()
    setSaving(true)
    setErrors([])
    api.post(`/projects/${projectId}/sites/create/`, { ...form, allowOverflow: false })
      .then(() => navigate(`/projects/${projectId}/sites`))
      .catch(err => {
        const msg = err.response?.data?.error
        setErrors(Array.isArray(msg) ? msg : [msg || 'Could not register the site.'])
      })
      .finally(() => setSaving(false))
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500 py-16 justify-center">
        <Loader2 size={16} className="animate-spin" />Loading…
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-6 pb-4 max-w-5xl">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <Link to={`/projects/${projectId}/sites`} className="btn-secondary !px-2"><ChevronLeft size={16} /></Link>
          <div>
            <h2 className="page-title">Register a site</h2>
            <p className="page-subtitle">
              Site number {options?.next_site_code} will be reserved on save
            </p>
          </div>
        </div>
      </div>

      {errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
          <ul className="list-disc list-inside space-y-0.5">
            {errors.map((msg, i) => <li key={i}>{msg}</li>)}
          </ul>
        </div>
      )}

      {/* Identity & capacity */}
      <div className="card p-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-4">Identity &amp; capacity</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="form-label" htmlFor="code">Site number</label>
            <input id="code" type="text" className="form-input bg-surface-50 font-semibold text-slate-600"
              value={options?.next_site_code || ''} readOnly />
            <p className="text-xs text-slate-400 mt-1.5">Assigned automatically</p>
          </div>
          <div className="md:col-span-2">
            <label className="form-label" htmlFor="siteName">Site name <span className="text-red-500">*</span></label>
            <input id="siteName" type="text" className="form-input" required
              placeholder="e.g. Bhadla Block C" value={form.siteName} onChange={set('siteName')} />
          </div>
          <div>
            <label className="form-label" htmlFor="capacityMw">Capacity (MWp) <span className="text-red-500">*</span></label>
            <input id="capacityMw" type="number" step="0.01" min="0" className="form-input" required
              placeholder="0.00" value={form.capacityMw} onChange={set('capacityMw')} />
          </div>
          <div>
            <label className="form-label" htmlFor="landAreaAcres">Land area (acres)</label>
            <input id="landAreaAcres" type="number" step="0.01" min="0" className="form-input"
              placeholder="0.0" value={form.landAreaAcres} onChange={set('landAreaAcres')} />
          </div>
          <div>
            <label className="form-label" htmlFor="mountingType">Mounting type</label>
            <select id="mountingType" className="form-select" value={form.mountingType} onChange={set('mountingType')}>
              <option value="">Select…</option>
              {(options?.mounting_types || []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>

        {wouldExceed && (
          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-start gap-3">
            <AlertTriangle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-900 leading-relaxed">
              <span className="font-semibold">{fmtMw(allocated)} of {fmtMw(sanctioned)} already allocated.</span>{' '}
              Adding {fmtMw(entered)} here will exceed the sanctioned total — raise a variation order first,
              or reduce another site.
            </p>
          </div>
        )}
      </div>

      {/* Location */}
      <div className="card p-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-1.5">
          <MapPin size={13} />Location
        </p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="form-label" htmlFor="village">Village</label>
            <input id="village" type="text" className="form-input" value={form.village} onChange={set('village')} />
          </div>
          <div>
            <label className="form-label" htmlFor="tehsil">Tehsil</label>
            <input id="tehsil" type="text" className="form-input" value={form.tehsil} onChange={set('tehsil')} />
          </div>
          <div>
            <label className="form-label" htmlFor="district">District</label>
            <input id="district" type="text" className="form-input" value={form.district} onChange={set('district')} />
          </div>
          <div>
            <label className="form-label" htmlFor="state">State</label>
            <input id="state" type="text" className="form-input" value={form.state} onChange={set('state')} />
          </div>
          <div>
            <label className="form-label" htmlFor="latitude">Latitude</label>
            <input id="latitude" type="number" step="0.000001" className="form-input"
              placeholder="27.540000" value={form.latitude} onChange={set('latitude')} />
          </div>
          <div>
            <label className="form-label" htmlFor="longitude">Longitude</label>
            <input id="longitude" type="number" step="0.000001" className="form-input"
              placeholder="71.910000" value={form.longitude} onChange={set('longitude')} />
          </div>
          <div className="md:col-span-2">
            <label className="form-label" htmlFor="khasraNumbers">Khasra / survey numbers</label>
            <input id="khasraNumbers" type="text" className="form-input"
              placeholder="Comma separated" value={form.khasraNumbers} onChange={set('khasraNumbers')} />
          </div>
        </div>
      </div>

      {/* Land title */}
      <div className="card p-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-4">Land title</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="form-label" htmlFor="landTitle">Held by</label>
            <select id="landTitle" className="form-select" value={form.landTitle} onChange={set('landTitle')}>
              <option value="">Select…</option>
              {(options?.land_titles || []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label" htmlFor="ownerName">Owner / lessor name</label>
            <input id="ownerName" type="text" className="form-input"
              placeholder="As on the document" value={form.ownerName} onChange={set('ownerName')} />
          </div>
          <div>
            <label className="form-label" htmlFor="tenureYears">Tenure (years)</label>
            <input id="tenureYears" type="number" min="0" className="form-input"
              placeholder="29" value={form.tenureYears} onChange={set('tenureYears')} />
          </div>
        </div>
        <div className="mt-4 bg-surface-50 border border-surface-200 rounded-lg px-4 py-3">
          <p className="text-xs text-slate-600 leading-relaxed">
            On save, a six-item assessment file is created for this site — site clearance report signed by the
            client, allotment letter or lease deed, revenue record, topography survey, grid connectivity and
            approach road. The site stays <span className="font-semibold text-slate-900">locked for execution</span> until all six clear.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Link to={`/projects/${projectId}/sites`} className="btn-secondary">Cancel</Link>
        <button type="submit" disabled={saving} className="btn-primary disabled:opacity-50">
          {saving && <Loader2 size={14} className="animate-spin" />}
          Save &amp; start assessment
        </button>
      </div>
    </form>
  )
}
