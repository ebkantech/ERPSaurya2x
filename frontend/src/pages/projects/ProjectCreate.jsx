import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, FolderKanban, MapPin, Zap, Users, Loader2, CheckCircle } from 'lucide-react'
import api from '../../services/api'

const SECTIONS = ['Basic Info', 'Location & Client', 'Scope & Team']
const PROJECT_OPTIONS_URL = '/projects/options/'
const PROJECT_CREATE_URL = '/projects/master/create/'

const Field = ({ label, required, children, className = '' }) => (
  <div className={className}>
    <label className="block text-xs font-medium text-slate-600 mb-1">
      {label}{required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
    {children}
  </div>
)

const Input = (props) => (
  <input {...props}
    className="w-full px-3 py-2 text-sm border border-surface-200 rounded-lg bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition"
  />
)

const Select = ({ children, ...props }) => (
  <select {...props}
    className="w-full px-3 py-2 text-sm border border-surface-200 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition"
  >
    {children}
  </select>
)

const Textarea = (props) => (
  <textarea {...props}
    className="w-full px-3 py-2 text-sm border border-surface-200 rounded-lg bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition resize-none"
  />
)

export default function ProjectCreate() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  const [businessUnits, setBusinessUnits] = useState([])
  const [procurementSources, setProcurementSources] = useState([])

  const [form, setForm] = useState({
    name: '',
    code: '',
    type: '',
    businessUnit: '',
    procurementSource: '',
    status: 'Planning',
    capacity: '',
    capacityUnit: 'MW',
    startDate: '',
    endDate: '',
    state: '',
    district: '',
    country: 'India',
    client: '',
    clientContact: '',
    projectManager: '',
    description: '',
    notes: '',
  })

  useEffect(() => {
    api.get(PROJECT_OPTIONS_URL)
      .then(res => {
        setBusinessUnits(res.data.business_units || [])
        setProcurementSources(res.data.procurement_sources || [])
      })
      .catch(() => { /* dropdowns just stay empty; server still validates */ })
  }, [])

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()

    // Mirror the server's required fields so we fail fast with a clear message
    // instead of a generic 400.
    if (!form.name || !form.businessUnit || !form.procurementSource) {
      setError('Project name, business unit, and procurement source are required.')
      setStep(0)
      return
    }
    const capacityNum = parseFloat(form.capacity)
    if (!capacityNum || capacityNum <= 0) {
      setError('Capacity must be greater than zero.')
      setStep(0)
      return
    }
    // The backend stores capacity as MW; convert kW → MW, pass others as-is.
    const totalMw = form.capacityUnit === 'KW' ? capacityNum / 1000 : capacityNum

    setError('')
    setSubmitting(true)

    const payload = {
      projectName: form.name,
      clientName: form.client,
      procurementSource: form.procurementSource,
      businessUnit: form.businessUnit,
      projectLocation: [form.district, form.state].filter(Boolean).join(', '),
      totalMw: String(totalMw),
      status: (form.status || 'planning').toLowerCase(),
      note: form.notes,
    }

    try {
      const res = await api.post(PROJECT_CREATE_URL, payload)
      if (res.data.project) {
        setSuccess(true)
        setTimeout(() => navigate('/projects'), 1500)
      } else {
        const msg = Array.isArray(res.data.error) ? res.data.error.join(', ') : (res.data.error || 'Could not create project.')
        setError(msg)
      }
    } catch (err) {
      const data = err.response?.data
      const msg = Array.isArray(data?.error) ? data.error.join(', ') : (data?.error || 'Could not create project. Please try again.')
      setError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const sectionIcons = [FolderKanban, MapPin, Users]

  if (success) {
    return (
      <div className="max-w-xl mx-auto mt-20 text-center space-y-4">
        <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto">
          <CheckCircle size={32} className="text-emerald-500" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">Project Created</h2>
        <p className="text-slate-500 text-sm">Redirecting to Projects…</p>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-8">
      {/* Header */}
      <div>
        <Link to="/projects" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4 transition-colors">
          <ArrowLeft size={15} />Back to Projects
        </Link>
        <h2 className="text-xl font-bold text-slate-900">Create New Project</h2>
        <p className="text-slate-500 text-sm mt-0.5">Enter project details to onboard it into the ERP</p>
      </div>

      {/* Step tabs */}
      <div className="flex gap-2 flex-wrap">
        {SECTIONS.map((s, i) => {
          const Icon = sectionIcons[i]
          return (
            <button key={s} type="button" onClick={() => setStep(i)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                step === i
                  ? 'bg-brand-500 text-white border-brand-500 shadow-sm'
                  : 'bg-white text-slate-600 border-surface-200 hover:border-brand-300'
              }`}
            >
              <Icon size={14} />{s}
            </button>
          )
        })}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>
      )}

      <form onSubmit={handleSubmit}>
        {/* Step 0 — Basic Info */}
        {step === 0 && (
          <div className="card p-6 space-y-4">
            <h3 className="font-semibold text-slate-900 text-sm border-b border-surface-100 pb-3">Basic Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <Field label="Project Name" required>
                  <Input placeholder="e.g. Solar Farm Alpha" value={form.name} onChange={set('name')} required />
                </Field>
              </div>
              <Field label="Project Code">
                <Input placeholder="e.g. PRJ-007" value={form.code} onChange={set('code')} />
              </Field>
              <Field label="Project Type">
                <Select value={form.type} onChange={set('type')}>
                  <option value="">Select type</option>
                  <option value="Solar PV">Solar PV</option>
                  <option value="Wind">Wind</option>
                  <option value="Biogas">Biogas</option>
                  <option value="Hydro">Hydro</option>
                  <option value="Civil">Civil</option>
                  <option value="Industrial">Industrial</option>
                  <option value="Infrastructure">Infrastructure</option>
                  <option value="Other">Other</option>
                </Select>
              </Field>
              <Field label="Business Unit" required>
                <Select value={form.businessUnit} onChange={set('businessUnit')} required>
                  <option value="">Select business unit</option>
                  {businessUnits.map(bu => <option key={bu} value={bu}>{bu}</option>)}
                </Select>
              </Field>
              <Field label="Procurement Source" required>
                <Select value={form.procurementSource} onChange={set('procurementSource')} required>
                  <option value="">Select source</option>
                  {procurementSources.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                </Select>
              </Field>
              <Field label="Status">
                <Select value={form.status} onChange={set('status')}>
                  <option value="Planning">Planning</option>
                  <option value="Running">Running</option>
                  <option value="Active">Active</option>
                  <option value="On Hold">On Hold</option>
                  <option value="Completed">Completed</option>
                </Select>
              </Field>
              <Field label="Capacity">
                <div className="flex gap-2">
                  <Input placeholder="e.g. 50" value={form.capacity} onChange={set('capacity')}
                    className="flex-1" />
                  <Select value={form.capacityUnit} onChange={set('capacityUnit')} style={{ width: '90px' }}>
                    <option value="MW">MW</option>
                    <option value="KW">KW</option>
                    <option value="kV">kV</option>
                    <option value="TPD">TPD</option>
                    <option value="—">—</option>
                  </Select>
                </div>
              </Field>
              <Field label="Start Date">
                <Input type="date" value={form.startDate} onChange={set('startDate')} />
              </Field>
              <Field label="Expected End Date">
                <Input type="date" value={form.endDate} onChange={set('endDate')} />
              </Field>
              <div className="md:col-span-2">
                <Field label="Project Description">
                  <Textarea rows={3} placeholder="Brief description of the project scope and objectives…"
                    value={form.description} onChange={set('description')} />
                </Field>
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <button type="button" onClick={() => setStep(1)} className="btn-primary">Next: Location →</button>
            </div>
          </div>
        )}

        {/* Step 1 — Location & Client */}
        {step === 1 && (
          <div className="card p-6 space-y-4">
            <h3 className="font-semibold text-slate-900 text-sm border-b border-surface-100 pb-3">Location & Client</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="State" required>
                <Select value={form.state} onChange={set('state')} required>
                  <option value="">Select state</option>
                  {['Andhra Pradesh','Assam','Bihar','Chhattisgarh','Delhi','Goa','Gujarat','Haryana',
                    'Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh','Maharashtra',
                    'Odisha','Punjab','Rajasthan','Tamil Nadu','Telangana','Uttar Pradesh',
                    'Uttarakhand','West Bengal'].map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </Select>
              </Field>
              <Field label="District / City">
                <Input placeholder="e.g. Jodhpur" value={form.district} onChange={set('district')} />
              </Field>
              <Field label="Country">
                <Input value={form.country} onChange={set('country')} />
              </Field>
              <div className="md:col-span-2 border-t border-surface-100 pt-4">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Client Details</p>
              </div>
              <Field label="Client / Owner" required>
                <Input placeholder="e.g. SECI, NTPC, Private Ltd" value={form.client} onChange={set('client')} required />
              </Field>
              <Field label="Client Contact">
                <Input placeholder="Contact name or email" value={form.clientContact} onChange={set('clientContact')} />
              </Field>
            </div>
            <div className="flex justify-between pt-2">
              <button type="button" onClick={() => setStep(0)} className="btn-secondary">← Back</button>
              <button type="button" onClick={() => setStep(2)} className="btn-primary">Next: Scope & Team →</button>
            </div>
          </div>
        )}

        {/* Step 2 — Scope & Team */}
        {step === 2 && (
          <div className="card p-6 space-y-4">
            <h3 className="font-semibold text-slate-900 text-sm border-b border-surface-100 pb-3">Scope & Team</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Project Manager">
                <Input placeholder="Name of the project manager" value={form.projectManager} onChange={set('projectManager')} />
              </Field>
              <div className="md:col-span-2">
                <Field label="Internal Notes">
                  <Textarea rows={3} placeholder="Any internal notes, constraints, or references…"
                    value={form.notes} onChange={set('notes')} />
                </Field>
              </div>
            </div>

            {/* Summary preview */}
            <div className="bg-surface-50 border border-surface-200 rounded-xl p-4 mt-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Summary</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                {[
                  { l: 'Project Name',  v: form.name || '—' },
                  { l: 'Type',          v: form.type || '—' },
                  { l: 'Status',        v: form.status },
                  { l: 'Capacity',      v: form.capacity ? `${form.capacity} ${form.capacityUnit}` : '—' },
                  { l: 'Location',      v: [form.district, form.state].filter(Boolean).join(', ') || '—' },
                  { l: 'Client',        v: form.client || '—' },
                  { l: 'Start Date',    v: form.startDate || '—' },
                  { l: 'End Date',      v: form.endDate || '—' },
                ].map(r => (
                  <div key={r.l} className="flex flex-col">
                    <span className="text-xs text-slate-400">{r.l}</span>
                    <span className="font-medium text-slate-800">{r.v}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-between pt-2">
              <button type="button" onClick={() => setStep(1)} className="btn-secondary">← Back</button>
              <button type="submit" disabled={submitting}
                className="btn-primary min-w-[180px] flex items-center justify-center gap-2">
                {submitting
                  ? <><Loader2 size={15} className="animate-spin" />Creating…</>
                  : <><FolderKanban size={15} />Create Project</>
                }
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  )
}
