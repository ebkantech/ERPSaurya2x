import React, { useState, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft, Building2, MapPin, Phone, Mail, Edit, Save, X, Loader2, FileText,
} from 'lucide-react'
import api from '../../services/api'

const statusBadge = { active: 'badge-green', pending: 'badge-amber', inactive: 'badge-slate' }
const poBadge = { active: 'badge-blue', closed: 'badge-slate', fully_paid: 'badge-green', partially_delivered: 'badge-amber', approved: 'badge-blue' }
const money = (v) => '₹' + Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })

// serializer(snake) -> update payload(camel)
const toForm = (v) => ({
  companyName: v.company_name || '', experienceDetails: v.experience_details || '',
  clientListData: (v.client_list || []).join(', '),
  vendorType: v.vendor_type || '', vendorCategory: v.vendor_category || '',
  contactPerson: v.contact_person || '', emailId: v.email_id || '',
  attendeeName: v.attendee_name || '', bdeName: v.bde_name || '', meetingWith: v.meeting_with || '',
  msmeReg: v.msme_reg || '', panNo: v.pan_no || '', pfReg: v.pf_reg || '',
  gstNo: v.gst_no || '', gstType: v.gst_type || '', gstStatus: v.gst_status || '',
  lastGstr1: v.last_gstr1 || '', gstPendingStatus: v.gst_pending_status || '',
  aadhaarNo: v.aadhaar_no || '', labourWelfareFund: v.labour_welfare_fund || '', professionalTax: v.professional_tax || '',
  turnoverYear1: v.turnover_year_1 || '', turnoverYear2: v.turnover_year_2 || '', turnoverYear3: v.turnover_year_3 || '',
  bankAccountName: v.bank_account_name || '', bankNameAddress: v.bank_name_address || '',
  accountType: v.account_type || '', accountNumber: v.account_number || '', bankProofType: v.bank_proof_type || '',
  qualification_status: v.qualification_status || '',
  address: v.address || '', address2: v.address2 || '', city: v.city || '', state: v.state || '',
  pin: v.pin_code || '', country: v.country || '',
})

const CHOICES = {
  vendorType: ['private limited', 'proprieter', 'partner', 'individual'],
  vendorCategory: ['service-provider', 'sub-contractor'],
  accountType: ['savings', 'current', 'cash credit', 'other'],
  bankProofType: ['passbook', 'cancelled-cheque'],
  qualification_status: ['qualified', 'disqualified'],
  gstPendingStatus: ['more than year', 'less than second year'],
}

function Field({ label, value }) {
  return (
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-sm text-slate-800 font-medium">{value || '—'}</p>
    </div>
  )
}

export default function VendorDetail() {
  const { id } = useParams()
  const [v, setV] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [tab, setTab] = useState('Overview')
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState('')

  const load = () => {
    setLoading(true)
    api.get(`/vendors/${id}/`)
      .then(res => setV(res.data.vendor))
      .catch(() => setErr('Could not load this vendor.'))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [id])

  const startEdit = () => { setForm(toForm(v)); setSaveErr(''); setEditing(true) }
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const save = async () => {
    setSaving(true); setSaveErr('')
    try {
      const fd = new FormData()
      Object.entries(form).forEach(([k, val]) => {
        if (k === 'clientListData') {
          const arr = val.split(',').map(s => s.trim()).filter(Boolean)
          fd.append('clientListData', JSON.stringify(arr))
        } else fd.append(k, val)
      })
      const res = await api.post(`/vendors/${id}/update/`, fd, { headers: { 'Content-Type': undefined } })
      setV(res.data.vendor ? { ...v, ...res.data.vendor } : v)
      setEditing(false)
      load()
    } catch (e) {
      const d = e.response?.data?.error
      setSaveErr(Array.isArray(d) ? d.join(' · ') : (d || 'Could not save changes.'))
    } finally { setSaving(false) }
  }

  if (loading) return <div className="flex items-center gap-2 text-sm text-slate-500 py-16 justify-center"><Loader2 size={16} className="animate-spin" />Loading…</div>
  if (err || !v) return <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 m-6">{err || 'Vendor not found.'}</div>

  const inp = 'w-full border border-surface-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-brand-500'

  return (
    <div className="space-y-6 pb-6">
      <Link to="/vendors" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"><ArrowLeft size={14} />Back to vendors</Link>

      {/* Header */}
      <div className="card p-5 flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center"><Building2 size={22} /></div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">{v.company_name}</h2>
            <p className="text-sm text-slate-500">{v.vendor_id} · {v.vendor_category || 'Vendor'}
              <span className={`ml-2 badge ${statusBadge[v.status] || 'badge-slate'}`}>{v.status || '—'}</span></p>
            <div className="flex gap-4 mt-2 text-xs text-slate-500">
              {v.contact_person && <span className="inline-flex items-center gap-1"><Building2 size={12} />{v.contact_person}</span>}
              {v.mobile_number && <span className="inline-flex items-center gap-1"><Phone size={12} />{v.mobile_number}</span>}
              {v.email_id && <span className="inline-flex items-center gap-1"><Mail size={12} />{v.email_id}</span>}
            </div>
          </div>
        </div>
        {!editing
          ? <button onClick={startEdit} className="btn-secondary"><Edit size={14} />Edit</button>
          : <div className="flex gap-2">
              <button onClick={() => setEditing(false)} className="btn-secondary"><X size={14} />Cancel</button>
              <button onClick={save} disabled={saving} className="btn-primary">{saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}Save</button>
            </div>}
      </div>

      {saveErr && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{saveErr}</div>}

      {!editing && (
        <>
          <div className="flex gap-1 bg-surface-100 rounded-lg p-1 w-max">
            {['Overview', 'Purchase Orders'].map(t => (
              <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 text-xs font-semibold rounded-md ${tab === t ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500'}`}>{t}</button>
            ))}
          </div>

          {tab === 'Overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="card p-5 space-y-3">
                <h3 className="text-sm font-semibold text-slate-800">Company & Contact</h3>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Vendor type" value={v.vendor_type} />
                  <Field label="Category" value={v.vendor_category} />
                  <Field label="Contact person" value={v.contact_person} />
                  <Field label="Mobile" value={v.mobile_number} />
                  <Field label="Email" value={v.email_id} />
                  <Field label="Registered" value={v.created_at} />
                </div>
              </div>
              <div className="card p-5 space-y-3">
                <h3 className="text-sm font-semibold text-slate-800">GST & Compliance</h3>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="GST No." value={v.gst_no} />
                  <Field label="GST type" value={v.gst_type} />
                  <Field label="PAN" value={v.pan_no} />
                  <Field label="MSME reg." value={v.msme_reg} />
                  <Field label="Qualification" value={v.qualification_status} />
                </div>
              </div>
              <div className="card p-5 space-y-3">
                <h3 className="text-sm font-semibold text-slate-800">Banking</h3>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Account name" value={v.bank_account_name} />
                  <Field label="Account number" value={v.account_number} />
                  <Field label="Account type" value={v.account_type} />
                  <Field label="Bank / address" value={v.bank_name_address} />
                </div>
                {v.bank_proof_url && <a href={v.bank_proof_url} target="_blank" rel="noreferrer" className="text-xs text-brand-600 inline-flex items-center gap-1"><FileText size={12} />{v.bank_proof_name || 'Bank proof'} ↗</a>}
              </div>
              <div className="card p-5 space-y-3">
                <h3 className="text-sm font-semibold text-slate-800">Address</h3>
                <p className="text-sm text-slate-700">{[v.address, v.address2, v.city, v.state, v.pin_code, v.country].filter(Boolean).join(', ') || '—'}</p>
                {(v.client_list || []).length > 0 && <><p className="text-xs text-slate-400 mt-2">Clients</p><p className="text-sm text-slate-700">{v.client_list.join(', ')}</p></>}
              </div>
            </div>
          )}

          {tab === 'Purchase Orders' && (
            <div className="card overflow-hidden">
              <table className="data-table">
                <thead><tr><th>PO</th><th>Site</th><th className="text-right">Value</th><th className="text-right">Outstanding</th><th>Status</th><th>Date</th></tr></thead>
                <tbody>
                  {(v.recent_pos || []).length === 0 && <tr><td colSpan={6} className="text-center text-slate-400 py-6">No purchase orders.</td></tr>}
                  {(v.recent_pos || []).map(p => (
                    <tr key={p.po_number}>
                      <td className="font-semibold text-brand-600 text-xs">{p.po_number}</td>
                      <td className="text-slate-700">{p.project}</td>
                      <td className="text-right font-semibold">{money(p.value)}</td>
                      <td className="text-right text-amber-600">{money(p.outstanding)}</td>
                      <td><span className={`badge ${poBadge[p.status] || 'badge-slate'}`}>{p.status}</span></td>
                      <td className="text-xs text-slate-400">{p.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {editing && form && (
        <div className="space-y-5">
          <p className="text-xs text-slate-400">All fields below are saved together. Required: company, address, city, state, PIN, country, experience, at least one client, contact person, email, attendee, BDE, turnover (3 years), bank details.</p>
          {[
            ['Company', [['companyName', 'Company name'], ['vendorType', 'Vendor type'], ['vendorCategory', 'Category'], ['experienceDetails', 'Experience details'], ['clientListData', 'Clients (comma-separated)']]],
            ['Contact', [['contactPerson', 'Contact person'], ['emailId', 'Email'], ['attendeeName', 'Attendee name'], ['bdeName', 'BDE name'], ['meetingWith', 'Meeting with']]],
            ['GST & Compliance', [['gstNo', 'GST No.'], ['gstType', 'GST type'], ['gstStatus', 'GST status'], ['lastGstr1', 'Last GSTR-1'], ['gstPendingStatus', 'GST pending status'], ['panNo', 'PAN'], ['msmeReg', 'MSME reg.'], ['pfReg', 'PF reg.'], ['aadhaarNo', 'Aadhaar'], ['qualification_status', 'Qualification status']]],
            ['Turnover', [['turnoverYear1', 'Turnover Y1'], ['turnoverYear2', 'Turnover Y2'], ['turnoverYear3', 'Turnover Y3']]],
            ['Banking', [['bankAccountName', 'Account name'], ['accountNumber', 'Account number'], ['accountType', 'Account type'], ['bankProofType', 'Bank proof type'], ['bankNameAddress', 'Bank name & address']]],
            ['Address', [['address', 'Address'], ['address2', 'Address line 2'], ['city', 'City'], ['state', 'State'], ['pin', 'PIN'], ['country', 'Country']]],
          ].map(([section, fields]) => (
            <div key={section} className="card p-5">
              <h3 className="text-sm font-semibold text-slate-800 mb-3">{section}</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {fields.map(([k, label]) => (
                  <label key={k} className="block">
                    <span className="block text-xs font-semibold text-slate-500 mb-1">{label}</span>
                    {CHOICES[k]
                      ? <select className={inp} value={form[k]} onChange={set(k)}>
                          <option value="">— select —</option>
                          {CHOICES[k].map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      : <input className={inp} value={form[k]} onChange={set(k)} />}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
