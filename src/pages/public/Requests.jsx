import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  AlertCircle,
  AlertTriangle,
  Building,
  CheckCircle2,
  Clock,
  CreditCard,
  Droplet,
  ExternalLink,
  FileCheck2,
  FileText,
  HelpCircle,
  Home,
  MapPin,
  MessageSquare,
  Phone,
  RefreshCw,
  Search,
  ShieldAlert,
  UploadCloud,
  UserRound,
  Wrench,
} from 'lucide-react'
import { PublicPage } from './PortalFrame.jsx'
import ConnectionOffer from '../../components/ConnectionOffer.jsx'
import RequestDocuments, { CaseAttachment, encodeFile } from '../../components/RequestDocuments.jsx'
import { Notice } from '../../components/UI.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { supabase } from '../../lib/supabaseClient.js'
import { dateLabel, errorMessage, formatApplicationRef } from '../../lib/format.js'

const concernTopics = [
  { key: 'leak', label: 'Pipe Leak / Burst', icon: Droplet, desc: 'Burst main, pipe crack, leak at meter', tone: 'cat-leak', urgent: true },
  { key: 'water_service', label: 'No Water / Low Pressure', icon: AlertTriangle, desc: 'Interrupted supply, weak pressure', tone: 'cat-water', urgent: true },
  { key: 'billing', label: 'Billing Dispute', icon: FileText, desc: 'Question about charges or calculation', tone: 'cat-billing', urgent: false },
  { key: 'payment', label: 'Payment Concern', icon: CreditCard, desc: 'Uncredited payment or receipt dispute', tone: 'cat-payment', urgent: false },
  { key: 'meter', label: 'Meter Issue', icon: Wrench, desc: 'Stuck dial, damaged glass, meter sound', tone: 'cat-meter', urgent: false },
  { key: 'general', label: 'General Inquiry', icon: MessageSquare, desc: 'General questions or customer service', tone: 'cat-general', urgent: false },
]

const documents = ['Government ID', 'Proof of ownership or lease']
const channels = { online: 'Online', walk_in: 'Walk-in', phone: 'Phone', email: 'Email', other: 'Other' }

export function RequestForm({ application = false, connectionChange = false }) {
  if (application) {
    return <ApplicationPublicPage />
  }
  if (connectionChange) {
    return <ConnectionChangePublicPage />
  }
  return <ConcernPublicPage />
}

/* =========================================================
   1. DEDICATED NEW WATER SERVICE APPLICATION PAGE UI
   ========================================================= */
function ApplicationPublicPage() {
  const { user, profile, role } = useAuth()
  const staff = ['admin', 'cashier'].includes(role)
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [receipt, setReceipt] = useState(null)
  const [pending, setPending] = useState([])

  async function upload(files, codes) {
    const failed = []
    for (const [label, file] of files) {
      try {
        const { error: rpcErr } = await supabase.rpc('submit_intake_document', {
          p_reference: codes.reference_no,
          p_token: codes.tracking_token,
          p_label: label,
          p_type: file.type,
          p_content: await encodeFile(file),
        })
        if (rpcErr) throw rpcErr
      } catch {
        failed.push([label, file])
      }
    }
    setPending(failed)
    if (failed.length) {
      setError('Your application was received. These files were not attached: ' + failed.map(([n]) => n).join(', ') + '. You may retry or bring them during site inspection.')
    }
  }

  async function submit(event) {
    event.preventDefault()
    if (busy) return
    const fields = new FormData(event.currentTarget)
    const val = (k) => String(fields.get(k) || '').trim()
    setError('')

    const inputs = event.currentTarget.querySelectorAll('.step-fields:not([hidden]) input')
    if (Array.from(inputs).some((input) => !input.reportValidity())) return

    if (step < 2) {
      if (step === 0 && !val('address')) return setError('Please enter the property service address.')
      if (step === 1 && (!val('name') || (!val('phone') && !val('email')))) {
        return setError('Please enter your full name and at least a contact phone number or email.')
      }
      setStep(step + 1)
      return
    }

    const files = documents
      .map((label) => [label, fields.get(label)])
      .filter(([, f]) => f?.name)

    if (files.some(([, f]) => f.size > 2097152 || !['application/pdf', 'image/png', 'image/jpeg'].includes(f.type))) {
      return setError('Choose a PDF, JPEG or PNG no larger than 2 MB per document.')
    }

    setBusy(true)
    try {
      const params = {
        p_channel: staff ? val('channel') : 'online',
        p_name: val('name'),
        p_phone: val('phone') || null,
        p_email: val('email') || null,
        p_address: val('address'),
        p_notes: [val('type'), val('landmark')].filter(Boolean).join(' · '),
      }

      const { data, error: rpcError } = await supabase.rpc('submit_service_application', params)
      if (rpcError) throw rpcError
      setReceipt(data[0])
      if (files.length) await upload(files, data[0])
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <PublicPage
      title="Apply for a New Water Connection"
      intro="Request a new service connection for your home, commercial establishment, or institutional building."
    >
      <div className="public-app-layout">
        {receipt ? (
          <section className="ok public-receipt-card">
            <CheckCircle2 size={36} color="var(--ok)" />
            <h2>Application Successfully Submitted!</h2>
            <p>Save your reference number and private tracking code to track site inspection and upload missing documents.</p>
            <dl className="reference">
              <dt>Application Reference</dt>
              <dd className="ref-value">{formatApplicationRef(receipt.reference_no)}</dd>
              <dt>Private Tracking Code</dt>
              <dd className="token-value">{receipt.tracking_token}</dd>
            </dl>
            <Notice type="error">{error}</Notice>
            {pending.length > 0 && (
              <button
                type="button"
                className="btn ghost"
                disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  setError('')
                  try {
                    await upload(pending, receipt)
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                Retry uploading attachments
              </button>
            )}
            <div className="row">
              <Link className="btn aq" to="/track" state={receipt}>
                Track Connection Status <ExternalLink size={16} />
              </Link>
            </div>
          </section>
        ) : (
          <form onSubmit={submit} noValidate className="iw-card public-app-form">
            <div className="public-wizard-stepper" role="tablist">
              {[
                { title: 'Premise & Address', desc: 'Step 1' },
                { title: 'Applicant Identity', desc: 'Step 2' },
                { title: 'Documents (Optional)', desc: 'Step 3' },
              ].map((s, idx) => (
                <div
                  key={s.title}
                  className={`wizard-step-node ${idx === step ? 'active' : idx < step ? 'done' : ''}`}
                >
                  <span className="step-num">{idx < step ? '✓' : idx + 1}</span>
                  <div className="step-texts">
                    <strong>{s.title}</strong>
                    <small>{s.desc}</small>
                  </div>
                </div>
              ))}
            </div>

            {staff && (
              <label>
                Received Through Channel
                <select name="channel">
                  {Object.entries(channels).map(([v, lbl]) => (
                    <option key={v} value={v}>{lbl}</option>
                  ))}
                </select>
              </label>
            )}

            {/* Step 1: Premise & Address */}
            <fieldset hidden={step !== 0} className="step-fields">
              <legend className="step-title">1. Premise & Installation Location</legend>
              <label>
                Property Classification
                <select name="type">
                  <option value="Residential">Residential</option>
                  <option value="Commercial">Commercial</option>
                  <option value="Institutional">Institutional</option>
                </select>
              </label>

              <label>
                Service Address (Required)
                <input
                  name="address"
                  maxLength="500"
                  required={step === 0}
                  placeholder="House/Lot No., Street, Barangay, Isabel"
                />
              </label>

              <label>
                Nearest Landmark / Directions (Optional)
                <input
                  name="landmark"
                  maxLength="500"
                  placeholder="e.g. Beside church, yellow gate, near post 12"
                />
              </label>
            </fieldset>

            {/* Step 2: Applicant Identity */}
            <fieldset hidden={step !== 1} className="step-fields">
              <legend className="step-title">2. Applicant Information</legend>
              <label>
                Full Name of Applicant (Required)
                <input
                  name="name"
                  autoComplete="name"
                  required={step === 1}
                  maxLength="160"
                  defaultValue={!staff ? profile?.full_name : ''}
                  placeholder="e.g. Juan dela Cruz"
                />
              </label>

              <div className="contact-pair">
                <label>
                  Mobile / Contact No. (Required)
                  <input
                    name="phone"
                    type="tel"
                    maxLength="40"
                    placeholder="09XX XXX XXXX"
                    required={step === 1}
                  />
                </label>

                <label>
                  Email Address (Optional)
                  <input
                    name="email"
                    type="email"
                    maxLength="254"
                    defaultValue={!staff ? user?.email : ''}
                    placeholder="applicant@example.com"
                  />
                </label>
              </div>
              <p className="hint">We use these contact details to schedule site inspection and send billing updates.</p>
            </fieldset>

            {/* Step 3: Supporting Documents */}
            <fieldset hidden={step !== 2} className="step-fields">
              <legend className="step-title">3. Supporting Documents (Optional)</legend>
              <p className="hint">You may upload clear photos or PDF copies now, or present original documents to the office inspector.</p>
              {documents.map((label) => (
                <label key={label} className="file-upload-row">
                  <span>{label}</span>
                  <input
                    type="file"
                    name={label}
                    accept="application/pdf,image/jpeg,image/png"
                  />
                </label>
              ))}
            </fieldset>

            <Notice type="error">{error}</Notice>

            <div className="row form-nav-row">
              {step > 0 && (
                <button
                  type="button"
                  className="btn ghost"
                  disabled={busy}
                  onClick={() => { setStep(step - 1); setError('') }}
                >
                  Back
                </button>
              )}
              <button className="btn aq" disabled={busy}>
                {busy ? 'Submitting…' : step === 2 ? 'Submit Application' : 'Continue to Next Step →'}
              </button>
            </div>
          </form>
        )}

        {/* Informative Side Panel */}
        <aside className="public-side-guide">
          <div className="guide-box">
            <h3>4-Stage Onboarding Roadmap</h3>
            <ol className="pipeline-guide-list">
              <li>
                <strong>1. Application & Documents</strong>
                <p>Submit your property address and proof of ownership or lease.</p>
              </li>
              <li>
                <strong>2. Site Inspection & Estimate</strong>
                <p>An inspector checks tapping distance and issues an itemized cost estimate.</p>
              </li>
              <li>
                <strong>3. Agreement & Payment</strong>
                <p>Accept the estimate and settle connection fees at the counter.</p>
              </li>
              <li>
                <strong>4. Meter Installation & CAN</strong>
                <p>Our crew installs your meter and issues your 9-digit CAN.</p>
              </li>
            </ol>
          </div>

          <div className="guide-box tip-box">
            <h4>Need Help?</h4>
            <p>Visit the Isabel Waters Customer Service Counter or call our hotline for assistance with site inspections.</p>
          </div>
        </aside>
      </div>
    </PublicPage>
  )
}

/* =========================================================
   2. DEDICATED CONCERNS & INCIDENT REPORTING PAGE UI
   ========================================================= */
function ConcernPublicPage() {
  const { user, profile, role } = useAuth()
  const staff = ['admin', 'cashier'].includes(role)
  const location = useLocation()
  const initialCategory = location.state?.topic === 'Leak' ? 'leak' : location.state?.category || 'leak'
  const [category, setCategory] = useState(initialCategory)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [receipt, setReceipt] = useState(null)
  const [accounts, setAccounts] = useState([])

  useEffect(() => {
    let active = true
    if (user && !staff) {
      supabase.from('contract_accounts').select('can').then(({ data }) => {
        if (active) setAccounts(data || [])
      })
    }
    return () => { active = false }
  }, [user, staff])

  async function submit(event) {
    event.preventDefault()
    if (busy) return
    const fields = new FormData(event.currentTarget)
    const val = (k) => String(fields.get(k) || '').trim()
    setError('')

    if (!val('description')) {
      return setError('Please describe the problem or issue you wish to report.')
    }

    setBusy(true)
    try {
      const params = {
        p_channel: staff ? val('channel') : 'online',
        p_name: val('name') || null,
        p_phone: val('phone') || null,
        p_email: val('email') || null,
        p_category: category,
        p_description: val('description'),
        p_location: val('location') || null,
        p_can: val('can') || null,
      }

      const { data, error: rpcError } = await supabase.rpc('submit_service_case', params)
      if (rpcError) throw rpcError
      setReceipt(data[0])
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const isUrgentTopic = ['leak', 'water_service'].includes(category)

  return (
    <PublicPage
      title="Report a Concern or Incident"
      intro="Report pipe leaks, water supply interruptions, defective meters, or billing questions. No login is required."
    >
      {/* Emergency Leak Callout Banner */}
      <div className="urgent-advisory-banner">
        <ShieldAlert size={24} color="#b45309" />
        <div>
          <strong>Burst Pipe, Flooding, or Low Pressure Emergency?</strong>
          <p>Select &quot;Pipe Leak&quot; below and include the exact street corner or nearby landmark so emergency field crews can respond quickly.</p>
        </div>
      </div>

      <div className="public-concern-layout">
        {receipt ? (
          <section className="ok public-receipt-card">
            <CheckCircle2 size={36} color="var(--ok)" />
            <h2>Incident Report Received</h2>
            <p>Our dispatch desk has logged your concern. Keep your incident reference number and secret tracking code:</p>
            <dl className="reference">
              <dt>Incident Reference No.</dt>
              <dd className="ref-value">{receipt.reference_no}</dd>
              <dt>Private Tracking Code</dt>
              <dd className="token-value">{receipt.tracking_token}</dd>
            </dl>
            <div className="supporting-upload-box">
              <h4>Attach a Supporting Photo (Optional)</h4>
              <p className="hint">If you have a photo of the leak or bill statement, you can upload it right now:</p>
              <CaseAttachment reference={receipt.reference_no} token={receipt.tracking_token} />
            </div>
            <div className="row">
              <Link className="btn aq" to="/track" state={receipt}>
                Track Incident Status <ExternalLink size={16} />
              </Link>
            </div>
          </section>
        ) : (
          <form onSubmit={submit} className="iw-card public-concern-form">
            {/* Visual Topic Selection Cards */}
            <label id="concern-topic-label" className="form-section-label">
              What kind of concern are you reporting?
            </label>
            <div className="concern-topic-grid" role="group" aria-labelledby="concern-topic-label">
              {concernTopics.map((t) => {
                const Icon = t.icon
                const isSelected = category === t.key
                return (
                  <button
                    key={t.key}
                    type="button"
                    className={`topic-card ${isSelected ? 'selected ' + t.tone : ''}`}
                    onClick={() => setCategory(t.key)}
                  >
                    <div className="topic-icon-wrap"><Icon size={20} /></div>
                    <strong>{t.label}</strong>
                    <small>{t.desc}</small>
                  </button>
                )
              })}
            </div>

            {staff && (
              <label>
                Received Through Channel
                <select name="channel">
                  {Object.entries(channels).map(([v, lbl]) => (
                    <option key={v} value={v}>{lbl}</option>
                  ))}
                </select>
              </label>
            )}

            <label>
              Incident Location or Nearest Landmark (Required for field dispatch)
              <input
                name="location"
                maxLength="500"
                placeholder="e.g. Corner Rizal & Bonifacio St., in front of Pharmacy"
              />
            </label>

            <label>
              Contract Account Number (CAN) (Optional)
              <input
                name="can"
                inputMode="numeric"
                pattern="[0-9]{9}"
                minLength="9"
                maxLength="9"
                placeholder="Optional 9-digit CAN if customer"
                list="known-cans"
              />
            </label>
            <datalist id="known-cans">
              {accounts.filter((a) => a.can).map((a) => (
                <option key={a.can}>{a.can}</option>
              ))}
            </datalist>

            <label>
              Describe the Issue or Inquiry (Required)
              <textarea
                name="description"
                required
                maxLength="2700"
                rows="4"
                placeholder={
                  category === 'leak'
                    ? 'Describe the leak: Is it on the main street or near a meter? Is water flowing continuously?'
                    : category === 'water_service'
                    ? 'When did the water interruption begin? Is there low pressure or zero flow?'
                    : 'Provide full details regarding your concern or billing dispute...'
                }
              />
            </label>

            <div className="contact-pair">
              <label>
                Your Full Name (Optional)
                <input
                  name="name"
                  maxLength="160"
                  defaultValue={!staff ? profile?.full_name : ''}
                  placeholder="e.g. Maria Santos"
                />
              </label>

              <label>
                Contact Phone Number (Optional)
                <input
                  name="phone"
                  type="tel"
                  maxLength="40"
                  placeholder="09XX XXX XXXX"
                />
              </label>
            </div>

            <Notice type="error">{error}</Notice>

            <div className="row">
              <button className={`btn ${isUrgentTopic ? 'btn-urgent' : 'aq'}`} disabled={busy}>
                {busy ? 'Sending Report…' : isUrgentTopic ? 'Submit Incident Report' : 'Send Concern Report'}
              </button>
            </div>
          </form>
        )}

        <aside className="public-side-guide">
          <div className="guide-box">
            <h3>Field Dispatch & Triage</h3>
            <p>Our technical team reviews incoming concerns 24/7. High priority issues such as main pipe bursts and district outages are dispatched immediately.</p>
          </div>

          <div className="guide-box">
            <h3>Track Without Logging In</h3>
            <p>You do not need an account to report an issue. Once submitted, use your reference number and tracking code to check status updates from the field crew.</p>
          </div>
        </aside>
      </div>
    </PublicPage>
  )
}

/* =========================================================
   3. RECONNECTION & DISCONNECTION PUBLIC VIEW
   ========================================================= */
function ConnectionChangePublicPage() {
  const { user, profile, role } = useAuth()
  const staff = ['admin', 'cashier'].includes(role)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [receipt, setReceipt] = useState(null)
  const [accounts, setAccounts] = useState([])

  useEffect(() => {
    let active = true
    if (user && !staff) {
      supabase.from('contract_accounts').select('can').then(({ data }) => {
        if (active) setAccounts(data || [])
      })
    }
    return () => { active = false }
  }, [user, staff])

  async function submit(event) {
    event.preventDefault()
    if (busy) return
    const fields = new FormData(event.currentTarget)
    const val = (k) => String(fields.get(k) || '').trim()
    setError('')

    setBusy(true)
    try {
      const params = {
        p_channel: staff ? val('channel') : 'online',
        p_name: val('name') || null,
        p_phone: val('phone') || null,
        p_email: val('email') || null,
        p_category: 'account',
        p_description: [val('requestType'), val('description')].filter(Boolean).join(': '),
        p_location: val('location') || null,
        p_can: val('can') || null,
      }

      const { data, error: rpcError } = await supabase.rpc('submit_service_case', params)
      if (rpcError) throw rpcError
      setReceipt(data[0])
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <PublicPage
      title="Reconnection or Disconnection Request"
      intro="Request water service restoration after payment, or apply for temporary or permanent disconnection."
    >
      <div className="public-concern-layout">
        {receipt ? (
          <section className="ok public-receipt-card">
            <CheckCircle2 size={36} color="var(--ok)" />
            <h2>Service Request Received</h2>
            <p>Our customer accounts team will process your request:</p>
            <dl className="reference">
              <dt>Reference Number</dt>
              <dd className="ref-value">{receipt.reference_no}</dd>
              <dt>Tracking Code</dt>
              <dd className="token-value">{receipt.tracking_token}</dd>
            </dl>
            <div className="row">
              <Link className="btn aq" to="/track" state={receipt}>Track Request Status</Link>
            </div>
          </section>
        ) : (
          <form onSubmit={submit} className="iw-card public-concern-form">
            <label>
              Request Type
              <select name="requestType">
                <option value="Reconnection after payment">Reconnection after payment</option>
                <option value="Temporary disconnection">Temporary disconnection (e.g. Travel / Renovation)</option>
                <option value="Permanent disconnection">Permanent disconnection & Account Closure</option>
              </select>
            </label>

            <label>
              Contract Account Number (CAN) (Required)
              <input
                required
                name="can"
                inputMode="numeric"
                pattern="[0-9]{9}"
                minLength="9"
                maxLength="9"
                placeholder="9-digit CAN"
                list="reconnect-cans"
              />
            </label>
            <datalist id="reconnect-cans">
              {accounts.filter((a) => a.can).map((a) => (
                <option key={a.can}>{a.can}</option>
              ))}
            </datalist>

            <label>
              Reason / Account Notes
              <textarea
                name="description"
                rows="3"
                maxLength="2000"
                placeholder="Include payment reference if reconnecting, or reason for disconnection..."
              />
            </label>

            <div className="contact-pair">
              <label>
                Full Name
                <input
                  name="name"
                  maxLength="160"
                  defaultValue={!staff ? profile?.full_name : ''}
                />
              </label>

              <label>
                Contact Phone
                <input name="phone" type="tel" maxLength="40" placeholder="09XX XXX XXXX" />
              </label>
            </div>

            <Notice type="error">{error}</Notice>

            <div className="row">
              <button className="btn aq" disabled={busy}>
                {busy ? 'Sending…' : 'Send Service Request'}
              </button>
            </div>
          </form>
        )}

        <aside className="public-side-guide">
          <div className="guide-box">
            <h3>Reconnection Guidelines</h3>
            <p>For restoration after disconnection, ensure all overdue balances and reconnection fees are settled at the counter or online before submitting.</p>
          </div>
        </aside>
      </div>
    </PublicPage>
  )
}

/* =========================================================
   4. DEDICATED TRACKING PAGE UI
   ========================================================= */
export function TrackRequest() {
  const { state } = useLocation()
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function track(event) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    setError('')
    setResult(null)
    setBusy(true)

    try {
      const ref = fields.get('reference').trim().toUpperCase()
      const token = fields.get('token').trim()
      const { data, error: rpcErr } = await supabase.rpc('track_public_request', {
        p_reference: ref,
        p_token: token,
      })

      if (rpcErr?.code === '22P02' || (!rpcErr && !data?.length)) {
        throw new Error('No matching request found. Please verify both your reference number and tracking code.')
      }
      if (rpcErr) throw rpcErr

      const update = await supabase.rpc('request_message', {
        p_reference: ref,
        p_token: token,
      })
      if (update.error) throw update.error

      setResult({
        ...data[0],
        ...update.data?.[0],
        reference: ref,
        token: token,
      })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const isApplication = result?.request_type === 'application'

  return (
    <PublicPage
      title="Track Request or Application"
      intro="Enter your official reference number and private tracking code to check status and progress."
    >
      <section className="iw-card track-request-card">
        <form className="form-stack track-search-form" onSubmit={track} onChange={() => setResult(null)}>
          <label>
            Reference Number
            <input
              name="reference"
              required
              placeholder="e.g. NA-8FCA2F or IW-CS-D4E5F6"
              defaultValue={state?.reference_no}
            />
          </label>
          <label>
            Secret Tracking Code
            <input
              name="token"
              required
              autoComplete="off"
              placeholder="Private UUID tracking code"
              defaultValue={state?.tracking_token}
            />
          </label>
          <button className="button" disabled={busy}>
            {busy ? 'Checking Status…' : 'Check Request Status'}
          </button>
        </form>

        <Notice type="error">{error}</Notice>

        {result && (
          <div className={`tracking-result-panel ${isApplication ? 'track-app-panel' : 'track-concern-panel'}`}>
            <div className="track-result-header">
              <div>
                <span className="track-badge-type">
                  {isApplication ? 'Service Connection Application' : 'Customer Concern Ticket'}
                </span>
                <h2>{result.reference}</h2>
                <p className="muted">Last updated {dateLabel(result.updated_at)}</p>
              </div>
              <span className="track-status-pill">{result.current_status.replaceAll('_', ' ')}</span>
            </div>

            {/* Official Update Note */}
            {result.message && (
              <div className="track-message-callout">
                <strong>Status Update from Isabel Waters:</strong>
                <p>{result.message}</p>
              </div>
            )}

            {/* Issued CAN banner if application activated */}
            {result.issued_can && (
              <div className="track-can-banner">
                <CheckCircle2 size={24} />
                <div>
                  <strong>Official Contract Account Activated</strong>
                  <p>Your 9-digit CAN is: <b>{result.issued_can}</b>. You may now link this CAN to your portal login to view invoices and pay online.</p>
                </div>
              </div>
            )}

            {/* Application-Specific Subpanels: Offer & Documents */}
            {isApplication && (
              <div className="track-subcomponents">
                <ConnectionOffer
                  reference={result.reference}
                  token={result.token}
                  status={result.current_status}
                  updated={() =>
                    setResult((prev) => ({
                      ...prev,
                      current_status: 'payment',
                      updated_at: new Date().toISOString(),
                    }))
                  }
                />
                <RequestDocuments
                  reference={result.reference}
                  token={result.token}
                  closed={['activated', 'cancelled', 'rejected'].includes(result.current_status)}
                />
              </div>
            )}

            {/* Concern-Specific Subpanel: Case Photo Attachment */}
            {!isApplication && !['resolved', 'closed', 'rejected'].includes(result.current_status) && (
              <div className="track-concern-attachments">
                <h4>Supporting Photos / Documents</h4>
                <CaseAttachment reference={result.reference} token={result.token} />
              </div>
            )}
          </div>
        )}
      </section>
    </PublicPage>
  )
}
