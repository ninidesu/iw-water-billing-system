import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Columns,
  CreditCard,
  Droplet,
  ExternalLink,
  FileText,
  HelpCircle,
  MapPin,
  MessageSquare,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Table,
  UserRound,
  Wrench,
  X,
} from 'lucide-react'
import { CaseAttachment } from '../../components/RequestDocuments.jsx'
import { supabase } from '../../lib/supabaseClient.js'
import { EmptyState, Loading, Notice, PageHeader } from '../../components/UI.jsx'
import { dateLabel, errorMessage } from '../../lib/format.js'
import { useAuth } from '../../context/AuthContext.jsx'

const caseStates = [
  'received',
  'triage',
  'assigned',
  'investigating',
  'waiting',
  'resolved',
  'closed',
  'rejected',
]

const categoryMeta = {
  leak: {
    label: 'Pipe Leak / Burst',
    short: 'Leak',
    icon: Droplet,
    colorClass: 'cat-leak',
    urgent: true,
  },
  water_service: {
    label: 'No Water / Low Pressure',
    short: 'Water Supply',
    icon: AlertTriangle,
    colorClass: 'cat-water',
    urgent: true,
  },
  billing: {
    label: 'Billing Inquiry / Dispute',
    short: 'Billing',
    icon: FileText,
    colorClass: 'cat-billing',
    urgent: false,
  },
  payment: {
    label: 'Payment / Receipt Concern',
    short: 'Payment',
    icon: CreditCard,
    colorClass: 'cat-payment',
    urgent: false,
  },
  meter: {
    label: 'Defective Meter',
    short: 'Meter Issue',
    icon: Wrench,
    colorClass: 'cat-meter',
    urgent: false,
  },
  account: {
    label: 'Reconnection / Disconnection',
    short: 'Service Change',
    icon: RefreshCw,
    colorClass: 'cat-account',
    urgent: false,
  },
  general: {
    label: 'General Inquiry',
    short: 'General',
    icon: MessageSquare,
    colorClass: 'cat-general',
    urgent: false,
  },
  other: {
    label: 'Other Concern',
    short: 'Other',
    icon: HelpCircle,
    colorClass: 'cat-general',
    urgent: false,
  },
}

const statusTone = (status) => {
  if (['resolved', 'closed'].includes(status)) return 'status-paid'
  if (['rejected'].includes(status)) return 'status-overdue'
  if (['received', 'triage'].includes(status)) return 'status-partial'
  return 'status-unpaid'
}

const channelLabel = (channel) => ({
  walk_in: 'Walk-In',
  online: 'Online',
  phone: 'Phone',
  email: 'Email',
  other: 'Other',
}[channel] || channel || 'Online')

const caseCache = new Map()

export default function ConcernsComplaints({ embedded = false }) {
  const { role } = useAuth()
  const [showIntake, setShowIntake] = useState(false)
  const [intakeReceipt, setIntakeReceipt] = useState(null)
  const [revision, reload] = useState(0)

  return (
    <div className={embedded ? 'embedded-requests concern-desk-management' : 'page-content concern-desk-management'}>
      <PageHeader title="Concerns & Complaints" />

      {showIntake && (
        <WalkInConcernModal
          receipt={intakeReceipt}
          onCreated={(rec) => {
            setIntakeReceipt(rec)
            caseCache.clear()
            reload((n) => n + 1)
          }}
          onClose={() => {
            setShowIntake(false)
            setIntakeReceipt(null)
          }}
        />
      )}

      <ConcernsDeskWorkspace
        key={revision}
        role={role}
        showIntake={showIntake}
        onToggleIntake={() => {
          setShowIntake(!showIntake)
          setIntakeReceipt(null)
        }}
        onModified={() => {
          caseCache.clear()
          reload((n) => n + 1)
        }}
      />
    </div>
  )
}

function ConcernsDeskWorkspace({ role, onModified, showIntake, onToggleIntake }) {
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [triageFilter, setTriageFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [channelFilter, setChannelFilter] = useState('all')
  const [specificStatus, setSpecificStatus] = useState('all')
  const [selectedId, setSelectedId] = useState('')
  const [viewMode, setViewMode] = useState('split') // 'split' or 'table'
  const [rows, setRows] = useState(() => caseCache.get(`cases:${page}`) || null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    const key = `cases:${page}`
    const cached = caseCache.get(key)
    if (cached) setRows(cached)
    else setRows(null)
    setError('')

    supabase
      .from('service_cases')
      .select('id,reference_no,channel,status,customer_message,contact_no,contact_email,updated_at,created_at,description,category,location_text,claimed_can,reporter_name,resolution_summary,account_id')
      .order('created_at', { ascending: false })
      .order('id')
      .range(page * 25, page * 25 + 24)
      .then(({ data, error: fetchErr }) => {
        if (!active) return
        if (fetchErr) {
          setError(errorMessage(fetchErr))
        } else {
          caseCache.set(key, data)
          setRows(data)
        }
      })

    return () => { active = false }
  }, [page])

  const metrics = useMemo(() => {
    const list = rows || []
    return {
      all: list.length,
      active: list.filter((r) => !['resolved', 'closed', 'rejected'].includes(r.status)).length,
      leaks: list.filter((r) => r.category === 'leak' && !['resolved', 'closed', 'rejected'].includes(r.status)).length,
      water: list.filter((r) => r.category === 'water_service' && !['resolved', 'closed', 'rejected'].includes(r.status)).length,
      triage: list.filter((r) => ['received', 'triage'].includes(r.status)).length,
      investigating: list.filter((r) => ['assigned', 'investigating', 'waiting'].includes(r.status)).length,
      resolved: list.filter((r) => ['resolved', 'closed'].includes(r.status)).length,
    }
  }, [rows])

  const filtered = useMemo(() => {
    if (!rows) return []
    return rows.filter((row) => {
      const text = `${row.reference_no} ${row.reporter_name || ''} ${row.location_text || ''} ${row.claimed_can || ''} ${row.category || ''} ${row.description || ''}`.toLowerCase()
      if (search.trim() && !text.includes(search.trim().toLowerCase())) return false

      if (channelFilter !== 'all' && (row.channel || 'walk_in') !== channelFilter) return false
      if (categoryFilter !== 'all' && row.category !== categoryFilter) return false
      if (specificStatus !== 'all' && row.status !== specificStatus) return false

      if (triageFilter === 'active') return !['resolved', 'closed', 'rejected'].includes(row.status)
      if (triageFilter === 'triage') return ['received', 'triage'].includes(row.status)
      if (triageFilter === 'investigating') return ['assigned', 'investigating', 'waiting'].includes(row.status)
      if (triageFilter === 'resolved') return ['resolved', 'closed'].includes(row.status)
      return true
    })
  }, [rows, search, triageFilter, categoryFilter, channelFilter, specificStatus])

  const selected = filtered.find((r) => r.id === selectedId) || filtered[0]

  useEffect(() => {
    if (filtered.length && (!selectedId || !filtered.some((r) => r.id === selectedId))) {
      setSelectedId(filtered[0].id)
    }
  }, [filtered, selectedId])

  const hasActiveFilters = Boolean(
    search || triageFilter !== 'all' || categoryFilter !== 'all' || channelFilter !== 'all' || specificStatus !== 'all'
  )

  const resetFilters = () => {
    setSearch('')
    setTriageFilter('all')
    setCategoryFilter('all')
    setChannelFilter('all')
    setSpecificStatus('all')
  }

  return (
    <>
      <Notice type="error">{error}</Notice>

      {/* Top Summary Cards - Copied exact structure and styling from other tabs */}
      <div className="kpi-stats-grid">
        <div
          className={`stat-card ${triageFilter === 'all' && categoryFilter === 'all' ? 'active-stat-card' : ''}`}
          style={{ cursor: 'pointer' }}
          onClick={() => { setTriageFilter('all'); setCategoryFilter('all') }}
        >
          <div className="stat-top-info">
            <span className="stat-label">Total Concerns</span>
            <span className="stat-subtext">All logged tickets</span>
          </div>
          <strong className="stat-value-bottom-right">{metrics.all}</strong>
        </div>

        <div
          className={`stat-card ${triageFilter === 'active' ? 'active-stat-card' : ''}`}
          style={{ cursor: 'pointer' }}
          onClick={() => { setTriageFilter(triageFilter === 'active' ? 'all' : 'active'); setCategoryFilter('all') }}
        >
          <div className="stat-top-info">
            <span className="stat-label">Active Concerns</span>
            <span className="stat-subtext">{metrics.active} open / in progress</span>
          </div>
          <strong className="stat-value-bottom-right">{metrics.active}</strong>
        </div>

        <div
          className={`stat-card ${triageFilter === 'investigating' ? 'active-stat-card' : ''}`}
          style={{ cursor: 'pointer' }}
          onClick={() => setTriageFilter(triageFilter === 'investigating' ? 'all' : 'investigating')}
        >
          <div className="stat-top-info">
            <span className="stat-label">In Field / Investigating</span>
            <span className="stat-subtext">{metrics.investigating} dispatched crew</span>
          </div>
          <strong className="stat-value-bottom-right">{metrics.investigating}</strong>
        </div>

        <div
          className={`stat-card ${triageFilter === 'resolved' ? 'active-stat-card' : ''}`}
          style={{ cursor: 'pointer' }}
          onClick={() => setTriageFilter(triageFilter === 'resolved' ? 'all' : 'resolved')}
        >
          <div className="stat-top-info">
            <span className="stat-label">Resolved Tickets</span>
            <span className="stat-subtext">{metrics.resolved} closed concerns</span>
          </div>
          <strong className="stat-value-bottom-right">{metrics.resolved}</strong>
        </div>
      </div>

      {/* Category Pills & Filter Bar */}
      <div className="request-filter-bar concern-filter-bar" style={{ marginTop: 14 }}>
        <div className="incident-category-chips" role="group" aria-label="Filter by incident category">
          <button
            type="button"
            className={`cat-chip ${categoryFilter === 'all' ? 'active' : ''}`}
            onClick={() => setCategoryFilter('all')}
          >
            All Concerns
          </button>
          {Object.entries(categoryMeta).map(([catKey, meta]) => {
            const Icon = meta.icon
            return (
              <button
                key={catKey}
                type="button"
                className={`cat-chip ${meta.colorClass} ${categoryFilter === catKey ? 'active' : ''}`}
                onClick={() => setCategoryFilter(categoryFilter === catKey ? 'all' : catKey)}
              >
                <Icon size={14} /> {meta.short}
              </button>
            )
          })}
        </div>

        <div className="request-subfilters">

          <label className="search-field request-search-field">
            <Search size={18} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search reference, reporter, CAN, landmark..."
            />
          </label>

          <label className="table-filter">
            <span className="sr-only">Channel</span>
            <select value={channelFilter} onChange={(e) => setChannelFilter(e.target.value)}>
              <option value="all">All channels</option>
              <option value="walk_in">Walk-In</option>
              <option value="online">Online</option>
              <option value="phone">Phone</option>
              <option value="email">Email</option>
              <option value="other">Other</option>
            </select>
          </label>

          <label className="table-filter">
            <span className="sr-only">Exact status</span>
            <select value={specificStatus} onChange={(e) => setSpecificStatus(e.target.value)}>
              <option value="all">All statuses</option>
              {caseStates.map((st) => (
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
            className={`button ${showIntake ? 'button-ghost' : ''}`}
            onClick={onToggleIntake}
            style={{ whiteSpace: 'nowrap' }}
          >
            {showIntake ? <><X size={16} /> Close Form</> : <><Plus size={16} /> Log Customer Concern</>}
          </button>

          <div className="view-switch-icon-only" role="group" aria-label="Table view mode">
            <button
              type="button"
              className={`view-icon-btn ${viewMode === 'split' ? 'active' : ''}`}
              onClick={() => setViewMode('split')}
              title="Split view (Table + Console)"
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
        <Loading label="Loading concerns..." />
      ) : filtered.length === 0 ? (
        <section className="panel">
          <EmptyState
            title="No matching concerns or complaints"
            description="Adjust your search term or filter to find records."
          />
        </section>
      ) : viewMode === 'table' ? (
        /* FULL TABLE VIEW (Few columns only) */
        <section className="panel concern-full-table-panel">
          <div className="table-scroll">
            <table className="app-table">
              <thead>
                <tr>
                  <th>Ticket Ref</th>
                  <th>Category</th>
                  <th>Reporter</th>
                  <th>Location / Landmark</th>
                  <th>Channel</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const meta = categoryMeta[row.category] || categoryMeta.other
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
                      <td><span className="request-ref-code">{row.reference_no}</span></td>
                      <td>
                        <span className={`category-tag ${meta.colorClass}`}>
                          {meta.short}
                        </span>
                      </td>
                      <td><strong>{row.reporter_name || 'Walk-In'}</strong></td>
                      <td>{row.location_text || '—'}</td>
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
        <div className="request-split-workspace concern-split-workspace">
          <aside className="panel app-table-column" aria-label="Incident tickets table">
            <div className="table-scroll app-table-scroll">
              <table className="app-table">
                <thead>
                  <tr>
                    <th>Ref No.</th>
                    <th>Category</th>
                    <th>Reporter / Location</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => {
                    const isSelected = selected?.id === row.id
                    const meta = categoryMeta[row.category] || categoryMeta.other
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
                          <span className="request-ref-code">{row.reference_no}</span>
                        </td>
                        <td>
                          <span className={`category-tag ${meta.colorClass}`}>
                            {meta.short}
                          </span>
                        </td>
                        <td>
                          <strong className="app-table-applicant-name">{row.reporter_name || 'Citizen'}</strong>
                          <span className="app-table-addr">{row.location_text || '—'}</span>
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

          {/* Right Column: Incident Investigation & Resolution Console */}
          <section className="panel request-detail-column concern-detail-column">
            {selected && (
              <IncidentDetail
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

function IncidentDetail({ row, role, saved }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const meta = categoryMeta[row.category] || categoryMeta.other
  const Icon = meta.icon
  const isUrgent = meta.urgent && !['resolved', 'closed', 'rejected'].includes(row.status)

  async function update(event, quickResolved = false) {
    if (event) event.preventDefault()
    const form = event ? event.currentTarget : document.getElementById('incident-update-form')
    const fields = new FormData(form)

    const targetStatus = quickResolved ? 'resolved' : (fields.get('status') || row.status)
    const customerMsg = fields.get('message')?.trim() || null
    const resolutionNote = fields.get('notes')?.trim() || null

    setBusy(true)
    setError('')
    setSuccess('')

    try {
      const { error: updErr } = await supabase
        .from('service_cases')
        .update({
          status: targetStatus,
          customer_message: customerMsg,
          resolution_summary: resolutionNote,
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id)
        .eq('updated_at', row.updated_at)
        .select('id')
        .single()

      if (updErr) throw updErr
      setSuccess(quickResolved ? 'Incident marked as RESOLVED.' : 'Incident update saved.')
      saved()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="compact-app-detail">
      {/* 1. Compact Header */}
      <header className="compact-dossier-header">
        <div className="compact-header-main">
          <div className="compact-title-line">
            <h2 className="compact-detail-name">{row.reporter_name || 'Walk-In / Citizen'}</h2>
            <span className={`category-tag ${meta.colorClass}`}>
              <Icon size={12} /> {meta.short}
            </span>
            {isUrgent && <span className="urgency-badge-urgent">HIGH PRIORITY</span>}
            <span className="request-ref-badge">{row.reference_no}</span>
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

      {/* 2. Compact Reported Problem Statement */}
      <div className="compact-problem-card">
        <div className="compact-problem-header">
          <span className="compact-problem-label"><AlertCircle size={13} /> Reported Concern</span>
          {row.claimed_can && (
            <span className="problem-can-pill">CAN: {row.claimed_can}</span>
          )}
        </div>
        <p className="compact-problem-text">{row.description}</p>
      </div>

      {/* 3. Combined Compact Info Card */}
      <div className="compact-info-card">
        <div className="compact-info-row">
          <div className="compact-info-item" style={{ flex: 1.4 }}>
            <span className="compact-info-label"><MapPin size={13} /> Location / Landmark</span>
            <strong className="compact-info-val">{row.location_text || '—'}</strong>
          </div>
          <div className="compact-info-item" style={{ flex: 1 }}>
            <span className="compact-info-label"><Phone size={13} /> Contact</span>
            <span className="compact-info-val">
              {[row.contact_no, row.contact_email].filter(Boolean).join(' · ') || 'No contact provided'}
            </span>
          </div>
        </div>
      </div>

      {/* 4. Supporting Files / Field Evidence */}
      <div className="compact-attachment-strip">
        <CaseAttachment caseId={row.id} reference={row.reference_no} />
      </div>

      {/* 5. Compact Resolution Console */}
      <form id="incident-update-form" onSubmit={(e) => update(e, false)} className="compact-action-card">
        <div className="compact-action-top">
          <div className="compact-action-heading">
            <Wrench size={14} />
            <strong>Action Console</strong>
          </div>
          {row.status !== 'resolved' && row.status !== 'closed' && (
            <button
              type="button"
              className="button button-success-ghost button-xs"
              disabled={busy}
              onClick={() => update(null, true)}
            >
              <CheckCircle2 size={13} /> Quick Resolve
            </button>
          )}
        </div>

        <Notice type="error">{error}</Notice>
        <Notice type="success">{success}</Notice>

        <div className="compact-action-body">
          <div className="compact-stage-row">
            <label className="compact-stage-field">
              <span className="compact-field-label">Status</span>
              <select name="status" className="compact-select" defaultValue={row.status}>
                {caseStates.map((state) => (
                  <option value={state} key={state}>
                    {state.replaceAll('_', ' ').toUpperCase()}
                  </option>
                ))}
              </select>
            </label>

            <button className="button button-small" disabled={busy} type="submit">
              {busy ? 'Saving…' : 'Save Update'}
            </button>
          </div>

          <div className="compact-note-field">
            <input
              name="notes"
              className="compact-note-input"
              defaultValue={row.resolution_summary || ''}
              placeholder="Internal resolution notes / dispatch actions..."
            />
          </div>

          <div className="compact-note-field">
            <input
              name="message"
              className="compact-note-input"
              maxLength="1500"
              defaultValue={row.customer_message || ''}
              placeholder="Status message for customer tracking..."
            />
          </div>
        </div>
      </form>
    </div>
  )
}

function WalkInConcernModal({ receipt, onCreated, onClose }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    const f = new FormData(event.currentTarget)
    const val = (k) => String(f.get(k) || '').trim()

    setError('')
    if (!val('description')) {
      return setError('Please provide details describing the concern or reported incident.')
    }

    setBusy(true)
    try {
      const { data, error: rpcError } = await supabase.rpc('submit_service_case', {
        p_channel: val('channel') || 'walk_in',
        p_name: val('name') || null,
        p_phone: val('phone') || null,
        p_email: val('email') || null,
        p_category: val('category') || 'general',
        p_description: val('description'),
        p_location: val('location') || null,
        p_can: val('can') || null,
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
    <section className="panel walkin-intake-panel concern-walkin-panel">
      <div className="panel-heading">
        <div>
          <h2><AlertTriangle size={22} /> Log Customer Concern / Field Incident</h2>
        </div>
        <button type="button" className="button button-ghost button-small" onClick={onClose}>
          <X size={16} /> Close
        </button>
      </div>

      <div className="walkin-intake-body">
        {receipt ? (
          <div className="walkin-receipt-box">
            <CheckCircle2 size={32} />
            <div>
              <h3>Concern / Incident Recorded</h3>
              <p>Provide these tracking details to the customer:</p>
              <div className="walkin-codes">
                <div><span>Incident Ticket No.</span><strong>{receipt.reference_no}</strong></div>
                <div><span>Secret Tracking Code</span><strong>{receipt.tracking_token}</strong></div>
              </div>
            </div>
            <button type="button" className="button" onClick={onClose}>Done</button>
          </div>
        ) : (
          <form className="form-grid" onSubmit={submit}>
            <Notice type="error">{error}</Notice>
            <label>
              Intake Channel
              <select name="channel" defaultValue="walk_in">
                <option value="walk_in">Walk-In (Counter Desk)</option>
                <option value="phone">Hotline Phone Call</option>
                <option value="email">Email Report</option>
                <option value="other">Other Channel</option>
              </select>
            </label>

            <label>
              Incident Category
              <select name="category" defaultValue="leak">
                <option value="leak">💧 Pipe Leak / Burst Main</option>
                <option value="water_service">🚰 No Water / Low Pressure</option>
                <option value="billing">🧾 Billing Inquiry / Dispute</option>
                <option value="payment">💳 Payment / Receipt Concern</option>
                <option value="meter">⏱️ Defective Meter</option>
                <option value="account">🔄 Reconnection / Disconnection</option>
                <option value="general">💬 General Inquiry</option>
                <option value="other">❓ Other Concern</option>
              </select>
            </label>

            <label>
              Customer / Reporter Name (optional)
              <input name="name" maxLength="160" placeholder="e.g. Maria Santos" />
            </label>

            <label>
              Contact Number
              <input name="phone" type="tel" maxLength="40" placeholder="09XX XXX XXXX" />
            </label>

            <label>
              Claimed 9-Digit CAN (optional)
              <input
                name="can"
                inputMode="numeric"
                pattern="[0-9]{9}"
                maxLength="9"
                placeholder="e.g. 583104927"
              />
            </label>

            <label>
              Incident Location / Landmark
              <input
                name="location"
                maxLength="500"
                placeholder="Corner Street, near landmark"
              />
            </label>

            <label className="span-2">
              Detailed Incident Statement
              <textarea
                name="description"
                required
                rows="3"
                maxLength="2700"
                placeholder="Describe the issue reported..."
              />
            </label>

            <div className="form-actions span-2">
              <button type="button" className="button button-ghost" disabled={busy} onClick={onClose}>
                Cancel
              </button>
              <button className="button" disabled={busy}>
                {busy ? 'Logging Incident…' : 'Log Incident Ticket'}
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  )
}
