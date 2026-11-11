import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Building,
  CheckCircle2,
  ClipboardList,
  Columns,
  ExternalLink,
  FileCheck2,
  FileText,
  Gauge,
  Home,
  LayoutList,
  MapPin,
  Phone,
  Plus,
  Search,
  Table,
  UserRound,
  Wrench,
  X,
} from 'lucide-react'
import ConnectionOffer from '../../components/ConnectionOffer.jsx'
import RequestDocuments from '../../components/RequestDocuments.jsx'
import { supabase } from '../../lib/supabaseClient.js'
import { EmptyState, Loading, Notice, PageHeader } from '../../components/UI.jsx'
import Modal from '../../components/Modal.jsx'
import { dateLabel, errorMessage, formatApplicationRef } from '../../lib/format.js'
import { useAuth } from '../../context/AuthContext.jsx'

const applicationStates = [
  'received',
  'requirements_pending',
  'document_review',
  'inspection',
  'estimate',
  'approval',
  'payment',
  'installation',
  'activated',
  'rejected',
  'cancelled',
]

const pipelineSteps = [
  { id: 1, label: 'Intake & Docs', match: ['received', 'requirements_pending', 'document_review'] },
  { id: 2, label: 'Inspection', match: ['inspection', 'estimate'] },
  { id: 3, label: 'Payment', match: ['approval', 'payment'] },
  { id: 4, label: 'Installation', match: ['installation', 'activated'] },
]

const statusTone = (status) => {
  if (['activated'].includes(status)) return 'status-paid'
  if (['rejected', 'cancelled'].includes(status)) return 'status-overdue'
  if (['received', 'requirements_pending', 'document_review'].includes(status)) return 'status-partial'
  return 'status-unpaid'
}

const channelLabel = (channel) => ({
  walk_in: 'Walk-In',
  online: 'Online',
  phone: 'Phone',
  email: 'Email',
  other: 'Other',
}[channel] || channel || 'Online')

const extractPropertyType = (notes) => {
  if (!notes) return 'Residential'
  const lower = notes.toLowerCase()
  if (lower.includes('commercial')) return 'Commercial'
  if (lower.includes('institutional')) return 'Institutional'
  return 'Residential'
}

const appCache = new Map()

export default function ServiceApplications({ embedded = false }) {
  const { role } = useAuth()
  const [showIntake, setShowIntake] = useState(false)
  const [intakeReceipt, setIntakeReceipt] = useState(null)
  const [revision, reload] = useState(0)

  return (
    <div className={embedded ? 'embedded-requests service-app-management' : 'page-content service-app-management'}>
      <PageHeader title="Service Applications" />

      {showIntake && (
        <WalkInApplicationModal
          receipt={intakeReceipt}
          onCreated={(rec) => {
            setIntakeReceipt(rec)
            appCache.clear()
            reload((n) => n + 1)
          }}
          onClose={() => {
            setShowIntake(false)
            setIntakeReceipt(null)
          }}
        />
      )}

      <ApplicationPipelineWorkspace
        key={revision}
        role={role}
        showIntake={showIntake}
        onToggleIntake={() => {
          setShowIntake(!showIntake)
          setIntakeReceipt(null)
        }}
        onModified={() => {
          appCache.clear()
          reload((n) => n + 1)
        }}
      />
    </div>
  )
}

function ApplicationPipelineWorkspace({ role, onModified, showIntake, onToggleIntake }) {
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState('all')
  const [propertyFilter, setPropertyFilter] = useState('all')
  const [channelFilter, setChannelFilter] = useState('all')
  const [specificStatus, setSpecificStatus] = useState('all')
  const [selectedId, setSelectedId] = useState('')
  const [viewMode, setViewMode] = useState('split') // 'split' or 'table'
  const [rows, setRows] = useState(() => appCache.get(`apps:${page}`) || null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    const key = `apps:${page}`
    const cached = appCache.get(key)
    if (cached) setRows(cached)
    else setRows(null)
    setError('')

    supabase
      .from('service_applications')
      .select('id,reference_no,channel,status,customer_message,contact_no,contact_email,updated_at,created_at,applicant_name,service_address,notes,linked_account_id')
      .order('created_at', { ascending: false })
      .order('id')
      .range(page * 25, page * 25 + 24)
      .then(({ data, error: fetchErr }) => {
        if (!active) return
        if (fetchErr) {
          setError(errorMessage(fetchErr))
        } else {
          appCache.set(key, data)
          setRows(data)
        }
      })

    return () => { active = false }
  }, [page])

  const counts = useMemo(() => {
    const list = rows || []
    return {
      all: list.length,
      docs: list.filter((r) => ['received', 'requirements_pending', 'document_review'].includes(r.status)).length,
      inspection: list.filter((r) => ['inspection', 'estimate'].includes(r.status)).length,
      payment: list.filter((r) => ['approval', 'payment'].includes(r.status)).length,
      installation: list.filter((r) => ['installation'].includes(r.status)).length,
      activated: list.filter((r) => ['activated'].includes(r.status)).length,
      closed: list.filter((r) => ['rejected', 'cancelled'].includes(r.status)).length,
    }
  }, [rows])

  const filtered = useMemo(() => {
    if (!rows) return []
    return rows.filter((row) => {
      const formattedRef = formatApplicationRef(row.reference_no)
      const text = `${row.reference_no} ${formattedRef} ${row.applicant_name || ''} ${row.service_address || ''} ${row.notes || ''}`.toLowerCase()
      if (search.trim() && !text.includes(search.trim().toLowerCase())) return false

      if (channelFilter !== 'all' && (row.channel || 'walk_in') !== channelFilter) return false
      if (propertyFilter !== 'all' && extractPropertyType(row.notes) !== propertyFilter) return false
      if (specificStatus !== 'all' && row.status !== specificStatus) return false

      if (stageFilter === 'docs') return ['received', 'requirements_pending', 'document_review'].includes(row.status)
      if (stageFilter === 'inspection') return ['inspection', 'estimate'].includes(row.status)
      if (stageFilter === 'payment') return ['approval', 'payment'].includes(row.status)
      if (stageFilter === 'installation') return ['installation'].includes(row.status)
      if (stageFilter === 'activated') return ['activated'].includes(row.status)
      if (stageFilter === 'closed') return ['rejected', 'cancelled'].includes(row.status)
      return true
    })
  }, [rows, search, stageFilter, propertyFilter, channelFilter, specificStatus])

  const selected = filtered.find((r) => r.id === selectedId) || filtered[0]

  useEffect(() => {
    if (filtered.length && (!selectedId || !filtered.some((r) => r.id === selectedId))) {
      setSelectedId(filtered[0].id)
    }
  }, [filtered, selectedId])

  const hasActiveFilters = Boolean(
    search || stageFilter !== 'all' || propertyFilter !== 'all' || channelFilter !== 'all' || specificStatus !== 'all'
  )

  const resetFilters = () => {
    setSearch('')
    setStageFilter('all')
    setPropertyFilter('all')
    setChannelFilter('all')
    setSpecificStatus('all')
  }

  return (
    <>
      <Notice type="error">{error}</Notice>

      {/* Top Summary Cards - Copied exact structure and styling from other tabs */}
      <div className="kpi-stats-grid">
        <div
          className={`stat-card ${stageFilter === 'all' ? 'active-stat-card' : ''}`}
          style={{ cursor: 'pointer' }}
          onClick={() => setStageFilter('all')}
        >
          <div className="stat-top-info">
            <span className="stat-label">Total Applications</span>
            <span className="stat-subtext">All submitted requests</span>
          </div>
          <strong className="stat-value-bottom-right">{counts.all}</strong>
        </div>

        <div
          className={`stat-card ${stageFilter === 'docs' ? 'active-stat-card' : ''}`}
          style={{ cursor: 'pointer' }}
          onClick={() => setStageFilter(stageFilter === 'docs' ? 'all' : 'docs')}
        >
          <div className="stat-top-info">
            <span className="stat-label">Under Review & Inspection</span>
            <span className="stat-subtext">{counts.docs + counts.inspection} pending review</span>
          </div>
          <strong className="stat-value-bottom-right">{counts.docs + counts.inspection}</strong>
        </div>

        <div
          className={`stat-card ${stageFilter === 'installation' ? 'active-stat-card' : ''}`}
          style={{ cursor: 'pointer' }}
          onClick={() => setStageFilter(stageFilter === 'installation' ? 'all' : 'installation')}
        >
          <div className="stat-top-info">
            <span className="stat-label">Pending Installation</span>
            <span className="stat-subtext">{counts.installation} awaiting meter install</span>
          </div>
          <strong className="stat-value-bottom-right">{counts.installation}</strong>
        </div>

        <div
          className={`stat-card ${stageFilter === 'activated' ? 'active-stat-card' : ''}`}
          style={{ cursor: 'pointer' }}
          onClick={() => setStageFilter(stageFilter === 'activated' ? 'all' : 'activated')}
        >
          <div className="stat-top-info">
            <span className="stat-label">Activated Accounts</span>
            <span className="stat-subtext">{counts.activated} active connections</span>
          </div>
          <strong className="stat-value-bottom-right">{counts.activated}</strong>
        </div>
      </div>

      {/* Filter Toolbar without duplicate pills */}
      <div className="request-filter-bar app-filter-bar" style={{ marginTop: 14 }}>
        <div className="request-subfilters">
          <label className="search-field request-search-field">
            <Search size={18} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search reference, applicant, or address..."
            />
          </label>

          <label className="table-filter">
            <span className="sr-only">Property Type</span>
            <select value={propertyFilter} onChange={(e) => setPropertyFilter(e.target.value)}>
              <option value="all">All property types</option>
              <option value="Residential">Residential</option>
              <option value="Commercial">Commercial</option>
              <option value="Institutional">Institutional</option>
            </select>
          </label>

          <label className="table-filter">
            <span className="sr-only">Channel</span>
            <select value={channelFilter} onChange={(e) => setChannelFilter(e.target.value)}>
              <option value="all">All channels</option>
              <option value="walk_in">Walk-In</option>
              <option value="online">Online</option>
              <option value="phone">Phone</option>
            </select>
          </label>

          <label className="table-filter">
            <span className="sr-only">Exact status</span>
            <select value={specificStatus} onChange={(e) => setSpecificStatus(e.target.value)}>
              <option value="all">All statuses</option>
              {applicationStates.map((st) => (
                <option key={st} value={st}>{st.replace(/_/g, ' ').toUpperCase()}</option>
              ))}
            </select>
          </label>

          {hasActiveFilters && (
            <button type="button" className="button button-ghost button-sm" onClick={resetFilters}>
              Reset
            </button>
          )}

          <button
            type="button"
            className="button"
            onClick={onToggleIntake}
            style={{ whiteSpace: 'nowrap' }}
          >
            <Plus size={16} /> Record New Application
          </button>

          <div className="view-switch-icon-only" role="group" aria-label="Table view mode">
            <button
              type="button"
              className={`view-icon-btn ${viewMode === 'split' ? 'active' : ''}`}
              onClick={() => setViewMode('split')}
              title="Split view (Table + Dossier)"
              aria-label="Split view"
              aria-pressed={viewMode === 'split'}
            >
              <Columns size={17} />
            </button>
            <button
              type="button"
              className={`view-icon-btn ${viewMode === 'table' ? 'active' : ''}`}
              onClick={() => setViewMode('table')}
              title="Full table view"
              aria-label="Full table view"
              aria-pressed={viewMode === 'table'}
            >
              <Table size={17} />
            </button>
          </div>
        </div>
      </div>

      {!rows && !error ? (
        <Loading label="Loading applications..." />
      ) : filtered.length === 0 ? (
        <section className="panel">
          <EmptyState
            title="No matching service applications"
            description="Adjust your search term or pipeline stage filter to find records."
          />
        </section>
      ) : viewMode === 'table' ? (
        /* FULL TABLE VIEW (Few columns only) */
        <section className="panel app-full-table-panel">
          <div className="table-scroll">
            <table className="app-table">
              <thead>
                <tr>
                  <th>Ref No.</th>
                  <th>Applicant</th>
                  <th>Type</th>
                  <th>Channel</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const propType = extractPropertyType(row.notes)
                  const isSelected = selected?.id === row.id
                  return (
                    <tr
                      key={row.id}
                      className={`clickable-row ${isSelected ? 'selected-row' : ''}`}
                      onClick={() => {
                        setSelectedId(row.id)
                        setViewMode('split')
                      }}
                    >
                      <td><span className="request-ref-code">{formatApplicationRef(row.reference_no)}</span></td>
                      <td><strong>{row.applicant_name || 'Walk-In'}</strong></td>
                      <td><span className={`prop-badge prop-${propType.toLowerCase()}`}>{propType}</span></td>
                      <td><span className={`channel-tag channel-${row.channel || 'online'}`}>{channelLabel(row.channel)}</span></td>
                      <td><span className={`status-badge ${statusTone(row.status)}`}>{row.status.replaceAll('_', ' ')}</span></td>
                      <td>{dateLabel(row.updated_at)}</td>
                      <td>
                        <button
                          type="button"
                          className="button button-ghost button-small"
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedId(row.id)
                            setViewMode('split')
                          }}
                        >
                          View / Edit
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="table-pagination">
            <button className="button button-ghost button-small" disabled={!page} onClick={() => setPage(page - 1)}>
              Previous
            </button>
            <span>Page {page + 1}</span>
            <button className="button button-ghost button-small" disabled={rows?.length !== 25} onClick={() => setPage(page + 1)}>
              Next
            </button>
          </div>
        </section>
      ) : (
        /* SPLIT WORKSPACE: Left side is TABLE with few columns only */
        <div className="request-split-workspace app-split-workspace">
          <aside className="panel app-table-column" aria-label="Applications table">
            <div className="table-scroll app-table-scroll">
              <table className="app-table">
                <thead>
                  <tr>
                    <th>Ref No.</th>
                    <th>Applicant</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => {
                    const isSelected = selected?.id === row.id
                    return (
                      <tr
                        key={row.id}
                        className={`clickable-row ${isSelected ? 'selected-row' : ''}`}
                        tabIndex="0"
                        onClick={() => setSelectedId(row.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') setSelectedId(row.id)
                        }}
                      >
                        <td>
                          <span className="request-ref-code">{formatApplicationRef(row.reference_no)}</span>
                        </td>
                        <td>
                          <span className="app-table-applicant-name" title={row.applicant_name || 'Walk-In'}>
                            {row.applicant_name || 'Walk-In'}
                          </span>
                        </td>
                        <td>
                          <span className={`status-badge ${statusTone(row.status)}`}>
                            {row.status.replaceAll('_', ' ')}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="table-pagination">
              <button
                className="button button-ghost button-small"
                disabled={!page}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </button>
              <span>Page {page + 1}</span>
              <button
                className="button button-ghost button-small"
                disabled={rows?.length !== 25}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </div>
          </aside>

          {/* Right Column: Application Lifecycle Dossier */}
          <section className="panel request-detail-column app-detail-column">
            {selected && (
              <ApplicationDetail
                key={`${selected.id}:${selected.updated_at}`}
                row={selected}
                role={role}
                saved={onModified}
              />
            )}
          </section>
        </div>
      )}
    </>
  )
}

function ApplicationDetail({ row, role, saved }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const propType = extractPropertyType(row.notes)
  const cleanNotes = (row.notes || '')
    .replace(new RegExp(`^${propType}\\s*(·|-|,)?\\s*`, 'i'), '')
    .trim()
  const activeStepIndex = pipelineSteps.findIndex((s) => s.match.includes(row.status))

  async function update(event) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    const newStatus = fields.get('status') || row.status
    const customerMsg = fields.get('message')?.trim() || null

    setBusy(true)
    setError('')
    setSuccess('')

    try {
      if (newStatus === 'activated' && row.status !== 'activated') {
        const canVal = String(fields.get('can') || '').trim().toUpperCase()
        const meterVal = String(fields.get('meter') || '').trim()
        const readingVal = Number(fields.get('reading') || 0)

        if (!canVal || canVal.length !== 9) {
          throw new Error('Please enter a valid 9-digit Contract Account Number (CAN).')
        }
        if (!meterVal) {
          throw new Error('Please enter the installed meter serial number.')
        }

        const { error: rpcErr } = await supabase.rpc('activate_application', {
          p_id: row.id,
          p_can: canVal,
          p_meter: meterVal,
          p_reading: readingVal,
          p_message: customerMsg,
        })
        if (rpcErr) throw rpcErr
        setSuccess(`Service connection activated! Issued CAN: ${canVal}`)
        saved()
        return
      }

      const { error: updErr } = await supabase
        .from('service_applications')
        .update({
          status: newStatus,
          customer_message: customerMsg,
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id)
        .eq('updated_at', row.updated_at)
        .select('id')
        .single()

      if (updErr) throw updErr
      setSuccess('Application progress updated.')
      saved()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const customerPortalPath = role === 'cashier' ? '/cashier' : '/admin'

  return (
    <div className="compact-app-detail">
      {/* 1. Compact Header */}
      <header className="compact-dossier-header">
        <div className="compact-header-main">
          <div className="compact-title-line">
            <h2 className="compact-detail-name">{row.applicant_name || 'Walk-In Applicant'}</h2>
            <span className="request-ref-badge">{formatApplicationRef(row.reference_no)}</span>
            <span className={`prop-badge prop-${propType.toLowerCase()}`}>
              {propType === 'Commercial' ? <Building size={12} /> : <Home size={12} />} {propType}
            </span>
            <span className={`channel-tag channel-${row.channel || 'online'}`}>
              {channelLabel(row.channel)}
            </span>
          </div>
          <span className="compact-header-date">Updated {dateLabel(row.updated_at)}</span>
        </div>
        <span className={`status-badge ${statusTone(row.status)}`}>
          {row.status.replaceAll('_', ' ')}
        </span>
      </header>

      {/* 2. Sleek Compact Stepper */}
      <div className="compact-stepper" aria-label="Pipeline progress">
        {pipelineSteps.map((step, index) => {
          const isCompleted = activeStepIndex > index || row.status === 'activated'
          const isCurrent = activeStepIndex === index && row.status !== 'activated'
          const stateClass = isCurrent ? 'current' : isCompleted ? 'completed' : ''
          return (
            <div key={step.id} className={`compact-step ${stateClass}`}>
              <span className="compact-step-dot">{isCompleted ? '✓' : index + 1}</span>
              <span className="compact-step-label">{step.label}</span>
            </div>
          )
        })}
      </div>

      {/* 3. Combined Compact Info Card (Zero Duplicates) */}
      <div className="compact-info-card">
        <div className="compact-info-row">
          <div className="compact-info-item" style={{ flex: 1.4 }}>
            <span className="compact-info-label"><MapPin size={13} /> Service Address</span>
            <span className="compact-info-val">{row.service_address || '—'}</span>
          </div>
          <div className="compact-info-item" style={{ flex: 1 }}>
            <span className="compact-info-label"><Phone size={13} /> Contact</span>
            <span className="compact-info-val">
              {[row.contact_no, row.contact_email].filter(Boolean).join(' · ') || '—'}
            </span>
          </div>
        </div>
        {cleanNotes ? (
          <>
            <div className="compact-info-divider" />
            <div className="compact-info-row">
              <div className="compact-info-item" style={{ flex: 1 }}>
                <span className="compact-info-label"><FileText size={13} /> Landmark / Notes</span>
                <span className="compact-info-val">{cleanNotes}</span>
              </div>
            </div>
          </>
        ) : null}
      </div>

      {/* Active Contract Account Confirmation Banner */}
      {row.status === 'activated' && (
        <div className="activation-success-banner compact-activation-banner">
          <CheckCircle2 size={18} />
          <div style={{ flex: 1 }}>
            <strong>Active Water Service Connection</strong>
          </div>
          {row.linked_account_id && (
            <Link to={`${customerPortalPath}/customers/${row.linked_account_id}`} className="button button-small">
              View Customer Account <ExternalLink size={13} />
            </Link>
          )}
        </div>
      )}

      {/* 4. Compact Pipeline Stage & Status Update Card */}
      <form onSubmit={update} className="compact-action-card">
        <div className="compact-action-top">
          <div className="compact-action-heading">
            <Wrench size={14} />
            <strong>Pipeline Action</strong>
          </div>
        </div>

        <Notice type="error">{error}</Notice>
        <Notice type="success">{success}</Notice>

        <div className="compact-action-body">
          <div className="compact-stage-row">
            <label className="compact-stage-field">
              <span className="compact-field-label">Stage</span>
              <select
                name="status"
                className="compact-select"
                disabled={row.status === 'activated'}
                defaultValue={row.status}
              >
                {applicationStates
                  .filter((s) => s !== 'activated' || ['installation', 'activated'].includes(row.status))
                  .map((state) => (
                    <option value={state} key={state}>
                      {state.replaceAll('_', ' ').toUpperCase()}
                    </option>
                  ))}
              </select>
            </label>

            <button className="button button-small" disabled={busy} type="submit">
              {busy ? 'Saving…' : row.status === 'installation' ? 'Activate Connection' : 'Save Status'}
            </button>
          </div>

          {/* Meter Installation & Account Activation Console */}
          {row.status === 'installation' && (
            <div className="compact-meter-strip">
              <label>
                <span>CAN (9 Digits)</span>
                <input
                  name="can"
                  inputMode="numeric"
                  pattern="[0-9]{9}"
                  minLength="9"
                  maxLength="9"
                  required
                  placeholder="9-digit CAN"
                />
              </label>
              <label>
                <span>Meter Serial #</span>
                <input
                  name="meter"
                  required
                  maxLength="50"
                  placeholder="e.g. MTR-2026"
                />
              </label>
              <label>
                <span>Initial Reading</span>
                <input
                  name="reading"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue="0"
                />
              </label>
            </div>
          )}

          <div className="compact-note-field">
            <input
              name="message"
              className="compact-note-input"
              maxLength="1500"
              defaultValue={row.customer_message || ''}
              placeholder="Note for applicant tracking (optional)..."
            />
          </div>
        </div>
      </form>

      {/* 5. Subpanels: Connection Offer & Requested Documents */}
      <div className="compact-subpanels">
        <ConnectionOffer
          applicationId={row.id}
          reference={row.reference_no}
          status={row.status}
          updated={saved}
        />
        <RequestDocuments
          applicationId={row.id}
          closed={['activated', 'rejected', 'cancelled'].includes(row.status)}
        />
      </div>
    </div>
  )
}

function WalkInApplicationModal({ receipt, onCreated, onClose }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    const f = new FormData(event.currentTarget)
    const val = (k) => String(f.get(k) || '').trim()

    setError('')
    if (!val('name') || !val('address') || (!val('phone') && !val('email'))) {
      return setError('Enter applicant full name, service address, and a contact phone number or email.')
    }

    setBusy(true)
    try {
      const { data, error: rpcError } = await supabase.rpc('submit_service_application', {
        p_channel: val('channel') || 'walk_in',
        p_name: val('name'),
        p_phone: val('phone') || null,
        p_email: val('email') || null,
        p_address: val('address'),
        p_notes: [val('type'), val('notes')].filter(Boolean).join(' · '),
      })
      if (rpcError) throw rpcError
      onCreated(data?.[0] || { reference_no: 'Recorded', tracking_token: '—' })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Record New Service Application"
      onClose={onClose}
      className="compact-concern-modal"
    >
      {receipt ? (
        <div className="walkin-receipt-box compact-receipt-box">
          <CheckCircle2 size={32} className="receipt-success-icon" />
          <div className="receipt-text-content">
            <h3>Water Service Application Recorded</h3>
            <p>Provide these tracking details to the applicant:</p>
            <div className="walkin-codes compact-codes">
              <div>
                <span>Application Ref</span>
                <strong>{formatApplicationRef(receipt.reference_no)}</strong>
              </div>
              <div>
                <span>Tracking Code</span>
                <strong>{receipt.tracking_token}</strong>
              </div>
            </div>
          </div>
          <button type="button" className="button button-sm button-primary" onClick={onClose}>
            Done
          </button>
        </div>
      ) : (
        <form className="compact-concern-form" onSubmit={submit}>
          <Notice type="error">{error}</Notice>

          <div className="compact-concern-grid">
            <label className="compact-field">
              <span>Intake Channel</span>
              <select name="channel" defaultValue="walk_in">
                <option value="walk_in">Walk-In (Office Counter)</option>
                <option value="phone">Hotline / Phone Call</option>
                <option value="email">Email</option>
                <option value="other">Other Channel</option>
              </select>
            </label>

            <label className="compact-field">
              <span>Property Classification</span>
              <select name="type" defaultValue="Residential">
                <option value="Residential">Residential</option>
                <option value="Commercial">Commercial</option>
                <option value="Institutional">Institutional</option>
              </select>
            </label>

            <label className="compact-field">
              <span>Applicant Full Name <strong className="req-star">*</strong></span>
              <input name="name" required maxLength="160" placeholder="e.g. Juan dela Cruz" />
            </label>

            <label className="compact-field">
              <span>Mobile / Contact No. <strong className="req-star">*</strong></span>
              <input name="phone" type="tel" required maxLength="40" placeholder="09XX XXX XXXX" />
            </label>

            <label className="compact-field span-full">
              <span>Installation Service Address <strong className="req-star">*</strong></span>
              <input
                name="address"
                required
                maxLength="500"
                placeholder="House/Lot No., Street, Barangay, Isabel"
              />
            </label>

            <label className="compact-field">
              <span>Email Address <small>(optional)</small></span>
              <input name="email" type="email" maxLength="254" placeholder="applicant@example.com" />
            </label>

            <label className="compact-field">
              <span>Landmark / Notes <small>(optional)</small></span>
              <input name="notes" maxLength="500" placeholder="e.g. Beside church, yellow gate" />
            </label>
          </div>

          <div className="compact-form-actions">
            <button
              type="button"
              className="button button-ghost button-sm"
              disabled={busy}
              onClick={onClose}
            >
              Cancel
            </button>
            <button className="button button-primary button-sm" disabled={busy}>
              {busy ? 'Registering…' : 'Save Connection Application'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}
