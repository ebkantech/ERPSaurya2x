import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Building2, User, FileText, CreditCard, Wallet, ShieldCheck, CheckCircle, Loader2, Send, Copy } from 'lucide-react'
import api from '../../services/api'

const VENDOR_REGISTER_URL = '/vendors/register/'
const PAY_CONFIG_URL = '/payments/vendor-registration/config/'
const PAY_SEND_LINK_URL = '/payments/vendor-registration/send-link/'

const SECTIONS = ['Company', 'Contact', 'KYC', 'Financial', 'Payment']

const Field = ({ label, required, children }) => (
  <div>
    <label className="block text-xs font-medium text-slate-600 mb-1">
      {label}{required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
    {children}
  </div>
)

const Input = (props) => (
  <input
    {...props}
    className="w-full px-3 py-2 text-sm border border-surface-200 rounded-lg bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition"
  />
)

const Select = ({ children, ...props }) => (
  <select
    {...props}
    className="w-full px-3 py-2 text-sm border border-surface-200 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition"
  >
    {children}
  </select>
)

const Textarea = (props) => (
  <textarea
    {...props}
    className="w-full px-3 py-2 text-sm border border-surface-200 rounded-lg bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition resize-none"
  />
)

export default function VendorCreate() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Payment gateway state. `payConfig.enabled` decides whether an onboarding
  // fee is collected at all; when disabled the Payment step just shows the
  // Register button (pre-gateway behaviour). The vendor pays the fee from a
  // Razorpay Payment Link emailed to them, so this is out-of-band and does
  // not block registration.
  const [payConfig, setPayConfig] = useState(null)
  const [sendingLink, setSendingLink] = useState(false)
  const [payError, setPayError] = useState('')
  const [paymentReceipt, setPaymentReceipt] = useState('')
  const [linkInfo, setLinkInfo] = useState(null) // { payment_link_url, sent_to }
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let active = true
    api.get(PAY_CONFIG_URL)
      .then(res => { if (active) setPayConfig(res.data) })
      .catch(() => { if (active) setPayConfig({ enabled: false }) })
    return () => { active = false }
  }, [])

  const [form, setForm] = useState({
    companyName: '', address: '', address2: '', city: '', state: '', pin: '', country: 'India',
    vendorType: '', vendorCategory: '', contactPerson: '', emailId: '',
    attendeeName: '', bdeName: '', meetingWith: '',
    experienceDetails: '', clientListData: '',
    msmeReg: '', panNo: '', pfReg: '', aadhaarNo: '',
    gstNo: '', gstType: '', gstStatus: '', lastGstr1: '', gstPendingStatus: '',
    labourWelfareFund: '', professionalTax: '',
    turnoverYear1: '', turnoverYear2: '', turnoverYear3: '',
    bankAccountName: '', bankNameAddress: '', accountType: '', accountNumber: '',
    bankProofType: '', bankProofFile: null,
    qualification_status: '',
  })

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.type === 'file' ? e.target.files[0] : e.target.value }))

  const feeEnabled = !!payConfig?.enabled

  // Generate a Razorpay Payment Link for the onboarding fee and have Razorpay
  // email it to the vendor. The vendor pays it later from their inbox; a
  // webhook reconciles the payment. We keep the returned receipt so the
  // registration submit can link the pending payment to this vendor.
  const handleSendLink = async () => {
    setPayError('')
    setSendingLink(true)
    try {
      const res = await api.post(PAY_SEND_LINK_URL, {
        companyName: form.companyName,
        contactPerson: form.contactPerson,
        emailId: form.emailId,
        mobileNumber: form.mobileNumber,
      })
      setLinkInfo(res.data)
      setPaymentReceipt(res.data.receipt)
    } catch (err) {
      setPayError(err.response?.data?.error || err.message || 'Could not send the payment link. Please try again.')
    } finally {
      setSendingLink(false)
    }
  }

  const copyLink = async () => {
    if (!linkInfo?.payment_link_url) return
    try {
      await navigator.clipboard.writeText(linkInfo.payment_link_url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard blocked — the link is still shown for manual copy */ }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    const fd = new FormData()
    Object.entries(form).forEach(([k, v]) => {
      if (v !== null && v !== undefined && v !== '') fd.append(k, v)
    })
    if (paymentReceipt) fd.append('payment_reference', paymentReceipt)

    try {
      // Content-Type must be unset (not the client's default 'application/json')
      // so axios/the browser can set multipart/form-data with the boundary itself.
      const res = await api.post(VENDOR_REGISTER_URL, fd, { headers: { 'Content-Type': undefined } })

      const ct = res.headers['content-type'] || ''
      if (!ct.includes('application/json')) {
        setError('Session expired or not logged in. Please log in via /admin/login/ and try again.')
        setSubmitting(false)
        return
      }

      if (res.data.vendor_id) {
        setSuccess(`Vendor registered successfully! ID: ${res.data.vendor_id}`)
        setTimeout(() => navigate('/vendors'), 2000)
      } else {
        const msg = Array.isArray(res.data.error) ? res.data.error.join(', ') : (res.data.error || 'Registration failed.')
        setError(msg)
      }
    } catch (err) {
      if (err.response) {
        const data = err.response.data
        const msg = Array.isArray(data?.error) ? data.error.join(', ') : (data?.error || 'Registration failed.')
        setError(msg)
      } else {
        setError('Network error. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const sectionIcons = [Building2, User, FileText, CreditCard, Wallet]

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-8">
      {/* Header */}
      <div>
        <Link to="/vendors" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4 transition-colors">
          <ArrowLeft size={15} />Back to Vendors
        </Link>
        <h2 className="text-xl font-bold text-slate-900">Register New Vendor</h2>
        <p className="text-slate-500 text-sm mt-0.5">Fill in all sections to complete vendor onboarding</p>
      </div>

      {/* Step tabs */}
      <div className="flex gap-2 flex-wrap">
        {SECTIONS.map((s, i) => {
          const Icon = sectionIcons[i]
          return (
            <button key={s} onClick={() => setStep(i)}
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

      {/* Banners */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-xl px-4 py-3 flex items-center gap-2">
          <CheckCircle size={16} />{success}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* Section 0 — Company */}
        {step === 0 && (
          <div className="card p-6 space-y-4">
            <h3 className="font-semibold text-slate-900 text-sm border-b border-surface-100 pb-3">Company Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <Field label="Company Name" required>
                  <Input placeholder="Full registered company name" value={form.companyName} onChange={set('companyName')} required />
                </Field>
              </div>
              <div className="md:col-span-2">
                <Field label="Address Line 1" required>
                  <Input placeholder="Street / building / locality" value={form.address} onChange={set('address')} required />
                </Field>
              </div>
              <div className="md:col-span-2">
                <Field label="Address Line 2">
                  <Input placeholder="Floor, landmark (optional)" value={form.address2} onChange={set('address2')} />
                </Field>
              </div>
              <Field label="City" required>
                <Input placeholder="City" value={form.city} onChange={set('city')} required />
              </Field>
              <Field label="State" required>
                <Input placeholder="State" value={form.state} onChange={set('state')} required />
              </Field>
              <Field label="PIN Code" required>
                <Input placeholder="PIN / ZIP" value={form.pin} onChange={set('pin')} required />
              </Field>
              <Field label="Country" required>
                <Input placeholder="Country" value={form.country} onChange={set('country')} required />
              </Field>
            </div>
            <div className="flex justify-end pt-2">
              <button type="button" onClick={() => setStep(1)} className="btn-primary">Next: Contact →</button>
            </div>
          </div>
        )}

        {/* Section 1 — Contact */}
        {step === 1 && (
          <div className="card p-6 space-y-4">
            <h3 className="font-semibold text-slate-900 text-sm border-b border-surface-100 pb-3">Contact & Classification</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Vendor Type" required>
                <Select value={form.vendorType} onChange={set('vendorType')} required>
                  <option value="">Select type</option>
                  <option value="private limited">Private Limited</option>
                  <option value="proprieter">Proprieter</option>
                  <option value="partner">Partner</option>
                  <option value="individual">Individual</option>
                </Select>
              </Field>
              <Field label="Vendor Category" required>
                <Select value={form.vendorCategory} onChange={set('vendorCategory')} required>
                  <option value="">Select category</option>
                  <option value="service-provider">Service Provider</option>
                  <option value="sub-contractor">Sub-contractor</option>
                </Select>
              </Field>
              <Field label="Primary Contact Person" required>
                <Input placeholder="Name of primary contact" value={form.contactPerson} onChange={set('contactPerson')} required />
              </Field>
              <Field label="Email ID" required>
                <Input type="email" placeholder="contact@company.com" value={form.emailId} onChange={set('emailId')} required />
              </Field>
              <Field label="Attendee Name" required>
                <Input placeholder="Who attended from vendor's side" value={form.attendeeName} onChange={set('attendeeName')} required />
              </Field>
              <Field label="Contacted By (BDE)" required>
                <Input placeholder="Our team member who contacted" value={form.bdeName} onChange={set('bdeName')} required />
              </Field>
              <div className="md:col-span-2">
                <Field label="Meeting With" required>
                  <Input placeholder="Person / team the meeting was held with" value={form.meetingWith} onChange={set('meetingWith')} required />
                </Field>
              </div>
              <div className="md:col-span-2">
                <Field label="Experience Details" required>
                  <Textarea rows={3} placeholder="Describe vendor's domain expertise and experience..." value={form.experienceDetails} onChange={set('experienceDetails')} required />
                </Field>
              </div>
              <div className="md:col-span-2">
                <Field label="List of Clients" required>
                  <Textarea rows={2} placeholder="Client A, Client B, Client C (comma-separated)" value={form.clientListData} onChange={set('clientListData')} required />
                </Field>
              </div>
            </div>
            <div className="flex justify-between pt-2">
              <button type="button" onClick={() => setStep(0)} className="btn-secondary">← Back</button>
              <button type="button" onClick={() => setStep(2)} className="btn-primary">Next: KYC →</button>
            </div>
          </div>
        )}

        {/* Section 2 — KYC */}
        {step === 2 && (
          <div className="card p-6 space-y-4">
            <h3 className="font-semibold text-slate-900 text-sm border-b border-surface-100 pb-3">KYC & Compliance Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="MSME Registration" required>
                <Input placeholder="MSME Reg No." value={form.msmeReg} onChange={set('msmeReg')} required />
              </Field>
              <Field label="PAN Number" required>
                <Input placeholder="ABCDE1234F" value={form.panNo} onChange={set('panNo')} required className="uppercase" />
              </Field>
              <Field label="PF Registration" required>
                <Input placeholder="PF Reg No." value={form.pfReg} onChange={set('pfReg')} required />
              </Field>
              <Field label="Aadhaar Number" required>
                <Input placeholder="12-digit Aadhaar" value={form.aadhaarNo} onChange={set('aadhaarNo')} required />
              </Field>
              <Field label="GST Number">
                <Input placeholder="27AAACT2727Q1ZW (optional)" value={form.gstNo} onChange={set('gstNo')} />
              </Field>
              <Field label="GST Type">
                <Input placeholder="Regular / Composition / Unregistered" value={form.gstType} onChange={set('gstType')} />
              </Field>
              <Field label="GST Status">
                <Input placeholder="Active / Cancelled / Suspended" value={form.gstStatus} onChange={set('gstStatus')} />
              </Field>
              <Field label="Last GSTR-1">
                <Input type="month" value={form.lastGstr1} onChange={set('lastGstr1')} />
              </Field>
              <Field label="GST Pending Status">
                <Select value={form.gstPendingStatus} onChange={set('gstPendingStatus')}>
                  <option value="">Select</option>
                  <option value="more than year">More than year</option>
                  <option value="less than second year">Less than second year</option>
                </Select>
              </Field>
              <Field label="Labour Welfare Fund">
                <Input placeholder="Registration / amount" value={form.labourWelfareFund} onChange={set('labourWelfareFund')} />
              </Field>
              <Field label="Professional Tax">
                <Input placeholder="PT Registration" value={form.professionalTax} onChange={set('professionalTax')} />
              </Field>
            </div>
            <div className="flex justify-between pt-2">
              <button type="button" onClick={() => setStep(1)} className="btn-secondary">← Back</button>
              <button type="button" onClick={() => setStep(3)} className="btn-primary">Next: Financial →</button>
            </div>
          </div>
        )}

        {/* Section 3 — Financial */}
        {step === 3 && (
          <div className="card p-6 space-y-4">
            <h3 className="font-semibold text-slate-900 text-sm border-b border-surface-100 pb-3">Financial & Bank Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Turnover — Last FY" required>
                <Input placeholder="e.g. 1.5 Cr" value={form.turnoverYear1} onChange={set('turnoverYear1')} required />
              </Field>
              <Field label="Turnover — Previous FY" required>
                <Input placeholder="e.g. 1.2 Cr" value={form.turnoverYear2} onChange={set('turnoverYear2')} required />
              </Field>
              <Field label="Turnover — 3rd FY" required>
                <Input placeholder="e.g. 0.9 Cr" value={form.turnoverYear3} onChange={set('turnoverYear3')} required />
              </Field>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <Field label="Name as per Bank Account" required>
                  <Input placeholder="Exact name on bank account" value={form.bankAccountName} onChange={set('bankAccountName')} required />
                </Field>
              </div>
              <div className="md:col-span-2">
                <Field label="Bank Name & Branch Address" required>
                  <Textarea rows={2} placeholder="Bank name, branch, and address" value={form.bankNameAddress} onChange={set('bankNameAddress')} required />
                </Field>
              </div>
              <Field label="Account Type" required>
                <Select value={form.accountType} onChange={set('accountType')} required>
                  <option value="">Select type</option>
                  <option value="savings">Savings</option>
                  <option value="current">Current</option>
                  <option value="cash credit">Cash Credit</option>
                  <option value="other">Other</option>
                </Select>
              </Field>
              <Field label="Account Number" required>
                <Input placeholder="Bank account number" value={form.accountNumber} onChange={set('accountNumber')} required />
              </Field>
              <Field label="Document Type" required>
                <Select value={form.bankProofType} onChange={set('bankProofType')} required>
                  <option value="">Select document</option>
                  <option value="passbook">Passbook</option>
                  <option value="cancelled-cheque">Cancelled Cheque</option>
                </Select>
              </Field>
              <Field label="Vendor Status">
                <Select value={form.qualification_status} onChange={set('qualification_status')}>
                  <option value="">Pending (default)</option>
                  <option value="qualified">Qualified</option>
                  <option value="disqualified">Disqualified</option>
                </Select>
              </Field>
              <div className="md:col-span-2">
                <Field label="Upload Passbook / Cancelled Cheque" required>
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={set('bankProofFile')}
                    required
                    className="w-full text-sm text-slate-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100 transition"
                  />
                  <p className="text-xs text-slate-400 mt-1">PDF, JPG, or PNG accepted</p>
                </Field>
              </div>
            </div>

            <div className="flex justify-between pt-4 border-t border-surface-100 mt-2">
              <button type="button" onClick={() => setStep(2)} className="btn-secondary">← Back</button>
              <button type="button" onClick={() => setStep(4)} className="btn-primary">Next: Payment →</button>
            </div>
          </div>
        )}

        {/* Section 4 — Payment (onboarding fee link) */}
        {step === 4 && (
          <div className="card p-6 space-y-4">
            <h3 className="font-semibold text-slate-900 text-sm border-b border-surface-100 pb-3">Onboarding Fee Payment</h3>

            {payConfig === null ? (
              <div className="flex items-center gap-2 text-sm text-slate-500 py-6">
                <Loader2 size={15} className="animate-spin" />Checking payment requirements…
              </div>
            ) : !feeEnabled ? (
              <div className="bg-slate-50 border border-surface-200 text-slate-600 text-sm rounded-xl px-4 py-3">
                No onboarding fee is required for this registration. You can submit directly.
              </div>
            ) : linkInfo ? (
              <div className="space-y-3">
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-xl px-4 py-3 flex items-start gap-2">
                  <CheckCircle size={16} className="mt-0.5 shrink-0" />
                  <span>Payment link sent to <span className="font-medium">{linkInfo.sent_to}</span>. The vendor pays the fee from that link — you can register the vendor now; the payment is tracked separately.</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={linkInfo.payment_link_url}
                    className="flex-1 px-3 py-2 text-sm border border-surface-200 rounded-lg bg-slate-50 text-slate-700 font-mono truncate"
                  />
                  <button type="button" onClick={copyLink}
                    className="btn-secondary flex items-center gap-1.5 whitespace-nowrap">
                    <Copy size={14} />{copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <button type="button" onClick={handleSendLink} disabled={sendingLink}
                  className="text-xs text-slate-500 hover:text-slate-700 underline">
                  {sendingLink ? 'Resending…' : 'Resend a fresh link'}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-xl border border-surface-200 bg-white px-4 py-4">
                  <div>
                    <p className="text-xs text-slate-500">Registration fee</p>
                    <p className="text-2xl font-bold text-slate-900">
                      {payConfig.currency === 'INR' ? '₹' : ''}{payConfig.amount_display} {payConfig.currency}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <ShieldCheck size={14} />Secured by Razorpay
                  </div>
                </div>

                {payError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
                    {payError}
                  </div>
                )}

                <button type="button" onClick={handleSendLink} disabled={sendingLink || !form.emailId}
                  className="btn-primary w-full flex items-center justify-center gap-2"
                >
                  {sendingLink
                    ? <><Loader2 size={15} className="animate-spin" />Sending link…</>
                    : <><Send size={15} />Send payment link to vendor</>}
                </button>
                <p className="text-xs text-slate-400 text-center">
                  {form.emailId
                    ? <>The link will be emailed to <span className="font-medium">{form.emailId}</span> for the vendor to pay.</>
                    : 'Add the vendor’s email in the Contact step to send a payment link.'}
                </p>
              </div>
            )}

            <div className="flex justify-between pt-4 border-t border-surface-100 mt-2">
              <button type="button" onClick={() => setStep(3)} className="btn-secondary">← Back</button>
              <button type="submit" disabled={submitting}
                className="btn-primary min-w-[160px] flex items-center justify-center gap-2"
              >
                {submitting ? <><Loader2 size={15} className="animate-spin" />Registering…</> : 'Register Vendor'}
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  )
}
