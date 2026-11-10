import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Info,
  Printer,
  RotateCcw,
  Search,
  UserRound,
  Wallet,
  X,
} from 'lucide-react'
import { useAdminData } from '../../hooks/useAdminData.js'
import { supabase } from '../../lib/supabaseClient.js'
import { overdueAccounts, getOverdueStage } from '../../lib/delinquency.js'
import { todayISO, peso, dateLabel } from '../../lib/format.js'
import { PageHeader, Notice, Loading, EmptyState } from '../../components/UI.jsx'
import StatCard from '../../components/StatCard.jsx'
import StatusBadge from '../../components/StatusBadge.jsx'
import SearchSuggest from '../../components/SearchSuggest.jsx'
import TablePagination, { TableEmptyRows, useTablePagination } from '../../components/TablePagination.jsx'
import './delinquent.css'

const LOCAL_FOLLOWUPS_KEY = 'iw_local_collection_followups'

function readLocalFollowups() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_FOLLOWUPS_KEY) || '[]')
  } catch {
    return []
  }
}

function writeLocalFollowups(rows) {
  try {
    localStorage.setItem(LOCAL_FOLLOWUPS_KEY, JSON.stringify(rows))
  } catch {}
}

let cachedFollowups = readLocalFollowups()

function isMissingFollowupsTable(err) {
  const msg = String(err?.message || '')
  return err?.code === 'PGRST205' || err?.code === '42P01' || msg.includes('collection_followups')
}

export default function DelinquentAccounts() {
  const { data, error, loading } = useAdminData()
  const [search, setSearch] = useState('')
  const [age, setAge] = useState('')
  const [status, setStatus] = useState('')
  const [follow, setFollow] = useState('')
  const [minAmount, setMinAmount] = useState('0')
  const [barangay, setBarangay] = useState('all')
  const [sort, setSort] = useState('balance_desc')
  const [selected, setSelected] = useState('')
  const [history, setHistory] = useState(cachedFollowups)
  const [historyError, setHistoryError] = useState('')
  const [busy, setBusy] = useState(false)
  const [revision, setRevision] = useState(0)
  const [printing, setPrinting] = useState(false)
  const today = todayISO()

  useEffect(() => {
    let live = true
    async function load() {
      try {
        let rows = []
        for (let start = 0; ; start += 1000) {
          const r = await supabase
            .from('collection_followups')
            .select('*')
            .order('created_at', { ascending: false })
            .order('id')
            .range(start, start + 999)
          if (r.error) throw r.error
          rows.push(...r.data)
          if (r.data.length < 1000) break
        }
        if (live) {
          cachedFollowups = rows
          setHistory(rows)
          setHistoryError('')
        }
      } catch (e) {
        if (!live) return
        if (isMissingFollowupsTable(e)) {
          const local = readLocalFollowups()
          cachedFollowups = local
          setHistory(local)
          setHistoryError('')
        } else {
          setHistoryError(e.message)
        }
      }
    }
    load()
    return () => {
      live = false
    }
  }, [revision])

  useEffect(() => {
    const done = () => setPrinting(false)
    window.addEventListener('afterprint', done)
    return () => window.removeEventListener('afterprint', done)
  }, [])

  useEffect(() => {
    if (printing) window.print()
  }, [printing])

  const accounts = overdueAccounts(data?.customers || [], data?.bills || [], today)
  const latest = (id) => history.find((h) => h.customer_id === id)

  const barangays = useMemo(() => {
    const set = new Set()
    for (const r of accounts) {
      const b = (r.customer.barangay || '').trim()
      if (b) set.add(b)
    }
    return Array.from(set).sort()
  }, [accounts])

  const suggestions = useMemo(() => {
    return accounts.slice(0, 15).map((r) => ({
      key: r.customer.id,
      primary: r.customer.full_name,
      secondary: `CAN: ${r.customer.can || '—'} · Overdue: ${peso(r.amount)}`,
      status: r.customer.status,
      value: r.customer.full_name,
    }))
  }, [accounts])

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase()
    const list = accounts.filter((r) => {
      const matches =
        !query ||
        `${r.customer.full_name} ${r.customer.can || ''} ${r.customer.meter_no} ${r.customer.address || ''}`.toLowerCase().includes(query)
      if (!matches) return false
      if (age && r.bucket !== age) return false
      if (status && r.customer.status !== status) return false
      if (barangay !== 'all' && (r.customer.barangay || '').trim() !== barangay) return false
      if (follow === 'none' && latest(r.customer.id)) return false
      if (follow === 'due' && !(latest(r.customer.id)?.next_date <= today)) return false
      if (follow === 'promise' && !latest(r.customer.id)?.promise_date) return false
      if (minAmount === '1000' && r.amount < 1000) return false
      if (minAmount === '5000' && r.amount < 5000) return false
      return true
    })
    if (sort === 'balance_desc') list.sort((a, b) => b.amount - a.amount)
    else if (sort === 'balance_asc') list.sort((a, b) => a.amount - b.amount)
    else if (sort === 'age_desc') list.sort((a, b) => (b.stage?.level || 0) - (a.stage?.level || 0) || b.amount - a.amount)
    else if (sort === 'name_asc') list.sort((a, b) => a.customer.full_name.localeCompare(b.customer.full_name))
    else if (sort === 'can') list.sort((a, b) => (a.customer.can || '').localeCompare(b.customer.can || ''))
    return list
  }, [accounts, search, age, status, barangay, follow, minAmount, sort, history, today])

  const page = useTablePagination(rows, 10, [search, age, status, follow, minAmount, barangay, sort])
  const account = accounts.find((r) => r.customer.id === selected) || rows[0]

  useEffect(() => {
    if (!selected && rows[0]) setSelected(rows[0].customer.id)
  }, [selected, rows])

  const hasActiveFilters = Boolean(
    search || age || status || follow || minAmount !== '0' || barangay !== 'all' || sort !== 'balance_desc'
  )
  const resetFilters = () => {
    setSearch('')
    setAge('')
    setStatus('')
    setFollow('')
    setMinAmount('0')
    setBarangay('all')
    setSort('balance_desc')
  }

  const count1mo = accounts.filter((r) => r.stage.level === 1).length
  const count2mo = accounts.filter((r) => r.stage.level === 2).length
  const count3mo = accounts.filter((r) => r.stage.level === 3).length
  const totalOverdue = accounts.reduce((n, r) => n + r.amount, 0)
  const pendingFollowupCount = accounts.filter((r) => {
    const last = latest(r.customer.id)
    if (!last) return true
    if (last.next_date && last.next_date <= today) return true
    return false
  }).length

  const agePills = [
    { val: '', label: 'All Overdue', count: accounts.length, tone: 'neutral' },
    { val: '1mo', label: '1 Mo · Reminder', count: count1mo, tone: 'green' },
    { val: '2mo', label: '2 Mos · Warning', count: count2mo, tone: 'yellow' },
    { val: '3mo', label: '3+ Mos · Restriction', count: count3mo, tone: 'red' },
  ]



  async function save(e) {
    e.preventDefault()
    const form = e.currentTarget
    const f = new FormData(form)
    if (!account) return
    setBusy(true)
    setHistoryError('')
    const entry = {
      customer_id: account.customer.id,
      method: f.get('method'),
      notes: f.get('notes').trim(),
      next_date: f.get('next') || null,
      promise_date: f.get('promise') || null,
    }
    try {
      const r = await supabase.from('collection_followups').insert(entry)
      if (r.error) throw r.error
      form.reset()
      setRevision((x) => x + 1)
    } catch (err) {
      if (isMissingFollowupsTable(err)) {
        const next = [{ id: `local-${Date.now()}`, created_at: new Date().toISOString(), ...entry }, ...readLocalFollowups()]
        writeLocalFollowups(next)
        cachedFollowups = next
        setHistory(next)
        form.reset()
      } else {
        setHistoryError(err.message)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page-content delinquent-page">
      <div className={printing ? 'delinquent-screen printing' : 'delinquent-screen'}>
        <PageHeader title="Overdue Accounts" />
        <Notice type="error">{error || historyError}</Notice>

        {loading && !data ? (
          <Loading />
        ) : (
          <>
            {/* Top KPI Cards - 4 Columns: 2 lines top left, value lower right */}
            <div className="delinquent-stats-grid">
              <div className="stat-card">
                <div className="stat-top-info">
                  <span className="stat-label">Overdue Accounts</span>
                  <span className="stat-subtext">
                    {accounts.length === 0 ? 'All in good standing' : `${accounts.length} unique customers`}
                  </span>
                </div>
                <strong className="stat-value-bottom-right">{accounts.length}</strong>
              </div>

              <div className="stat-card">
                <div className="stat-top-info">
                  <span className="stat-label">Total Overdue Balance</span>
                  <span className="stat-subtext">Uncollected receivables</span>
                </div>
                <strong className="stat-value-bottom-right">{peso(totalOverdue)}</strong>
              </div>

              <div className="stat-card">
                <div className="stat-top-info">
                  <span className="stat-label">Eligible for Restriction</span>
                  <span className="stat-subtext">
                    {count3mo === 0 ? 'No accounts at risk' : `${count3mo} accounts (Stage 3)`}
                  </span>
                </div>
                <strong className="stat-value-bottom-right">{count3mo}</strong>
              </div>

              <div className="stat-card">
                <div className="stat-top-info">
                  <span className="stat-label">Pending Follow-Up</span>
                  <span className="stat-subtext">
                    {pendingFollowupCount === 0 ? 'All accounts contacted' : 'Needs contact or visit'}
                  </span>
                </div>
                <strong className="stat-value-bottom-right">{pendingFollowupCount}</strong>
              </div>
            </div>

            {/* Stage Filter Tabs with Pastel Colors */}
            <div className="delinquent-stage-bar" role="tablist" aria-label="Overdue Stage Filter">
              {agePills.map(({ val, label, count, tone }) => (
                <button
                  key={val}
                  type="button"
                  className={`delinquent-age-pill tone-${tone} ${age === val ? 'active' : ''}`}
                  onClick={() => setAge(val)}
                >
                  <span className="pill-label">{label}</span>
                  <span className="pill-count">({count})</span>
                </button>
              ))}
            </div>

            {/* Table Toolbar directly on the page surface (matching Customers / Image 1) */}
            <div className="external-table-toolbar delinquent-table-toolbar">
              <SearchSuggest
                id="delinquent-table-search"
                label="Search overdue accounts"
                value={search}
                onChange={setSearch}
                placeholder="Search by customer name, CAN, meter..."
                suggestions={suggestions}
              />

              <label className="table-filter">
                <span className="sr-only">Filter account status</span>
                <select value={status} onChange={(event) => setStatus(event.target.value)}>
                  <option value="">All statuses</option>
                  <option value="active">Active</option>
                  <option value="restricted">Restricted</option>
                  <option value="inactive">Inactive</option>
                </select>
              </label>

              <label className="table-filter">
                <span className="sr-only">Filter follow-up status</span>
                <select value={follow} onChange={(event) => setFollow(event.target.value)}>
                  <option value="">All follow-ups</option>
                  <option value="none">Not Contacted</option>
                  <option value="due">Follow-Up Due</option>
                  <option value="promise">Promise Recorded</option>
                </select>
              </label>

              <label className="table-filter">
                <span className="sr-only">Filter balance range</span>
                <select value={minAmount} onChange={(event) => setMinAmount(event.target.value)}>
                  <option value="0">All balances</option>
                  <option value="1000">Over ₱1,000</option>
                  <option value="5000">Over ₱5,000</option>
                </select>
              </label>

              <label className="table-filter">
                <span className="sr-only">Filter barangay</span>
                <select value={barangay} onChange={(event) => setBarangay(event.target.value)}>
                  <option value="all">All barangays</option>
                  {barangays.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </label>

              <label className="table-filter table-filter-sort">
                <span className="sr-only">Sort overdue list</span>
                <select value={sort} onChange={(event) => setSort(event.target.value)}>
                  <option value="balance_desc">Sort: Highest Balance</option>
                  <option value="balance_asc">Sort: Lowest Balance</option>
                  <option value="age_desc">Sort: Most Overdue</option>
                  <option value="name_asc">Sort: Name (A-Z)</option>
                  <option value="can">Sort: CAN No.</option>
                </select>
              </label>

              {hasActiveFilters && (
                <button
                  type="button"
                  className="button button-ghost button-sm"
                  onClick={resetFilters}
                  title="Reset all filters"
                >
                  Reset
                </button>
              )}
            </div>

            {/* Split Layout: Table vs Dossier */}
            <div className="delinquent-split-layout">
              {/* Left Column: Overdue Accounts Table */}
              <div className="delinquent-table-card">
                <div className="delinquent-table-header">
                  <h2>Overdue Accounts List</h2>
                  <span className="delinquent-count-badge">
                    {rows.length} {rows.length === 1 ? 'account' : 'accounts'}
                  </span>
                </div>

                {rows.length > 0 ? (
                  <>
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Customer & CAN</th>
                            <th>Unpaid Bills</th>
                            <th>Overdue Amount</th>
                            <th>Stage & Age</th>
                            <th>Status</th>
                            <th>Last Contact</th>
                          </tr>
                        </thead>
                        <tbody>
                          {page.visibleRows.map((r) => {
                            const isSelected = account?.customer.id === r.customer.id
                            const lastContact = latest(r.customer.id)
                            return (
                              <tr
                                key={r.customer.id}
                                className={`clickable-row ${isSelected ? 'selected-row' : ''}`}
                                tabIndex="0"
                                onClick={() => setSelected(r.customer.id)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') setSelected(r.customer.id)
                                }}
                              >
                                <td>
                                  <div className="delinquent-customer-cell">
                                    <strong>{r.customer.full_name}</strong>
                                    <small>CAN {r.customer.can || '—'}</small>
                                  </div>
                                </td>
                                <td>
                                  <span className="delinquent-bills-pill">
                                    {r.bills.length} {r.bills.length === 1 ? 'bill' : 'bills'}
                                  </span>
                                </td>
                                <td>
                                  <span className="delinquent-amount-text">{peso(r.amount)}</span>
                                </td>
                                <td>
                                  <span className={`delinquent-stage-tag stage-${r.stage.level}`}>
                                    <span className="stage-dot" />
                                    <strong>{r.stage.shortLabel}</strong>
                                    <small>({r.days}d)</small>
                                  </span>
                                </td>
                                <td>
                                  <StatusBadge status={r.customer.status} />
                                </td>
                                <td>
                                  <span style={{ fontSize: '12px', color: '#64748B' }}>
                                    {lastContact ? dateLabel(lastContact.created_at) : '—'}
                                  </span>
                                </td>
                              </tr>
                            )
                          })}
                          <TableEmptyRows count={page.emptyRowsCount} colSpan={6} />
                        </tbody>
                      </table>
                    </div>
                    <TablePagination {...page} total={rows.length} />
                  </>
                ) : (
                  <div className="delinquent-empty-box">
                    <div className="delinquent-empty-icon">
                      <CheckCircle2 size={26} />
                    </div>
                    <h3>No Matching Overdue Accounts</h3>
                    <p>
                      {hasActiveFilters
                        ? 'No overdue accounts match your current filters. Try resetting your search or balance filter.'
                        : 'All customer accounts are currently settled or in good standing! No accounts are pending collection.'}
                    </p>
                    {hasActiveFilters && (
                      <button type="button" className="button button-ghost button-small" onClick={resetFilters}>
                        <RotateCcw size={13} /> Clear Filters
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Right Column: Account Dossier & Actions */}
              {account ? (
                <aside className="delinquent-detail-panel">
                  <div className="delinquent-detail-hero">
                    <div className="delinquent-hero-top">
                      <div className="delinquent-hero-info">
                        <h2>{account.customer.full_name}</h2>
                        <p>
                          CAN {account.customer.can || '—'} · Meter {account.customer.meter_no || '—'} · {account.customer.address || 'No service address recorded'}
                        </p>
                      </div>
                      <StatusBadge status={account.customer.status} />
                    </div>

                    {/* Overdue Stage Alert Callout */}
                    <div className={`delinquent-stage-callout tone-${account.stage.tone}`}>
                      <div className="stage-callout-head">
                        <span className="stage-callout-badge">{account.stage.badgeLabel}</span>
                        <span className="stage-callout-urgency">{account.stage.urgencyBadge}</span>
                      </div>
                      <p className="stage-callout-message">{account.stage.noticeWarning}</p>
                      {account.stage.level === 3 && (
                        <div className="reconnection-policy-note">
                          <Info size={14} className="reconnection-info-icon" />
                          <div>
                            <strong>Reconnection Policy:</strong>
                            <span>
                              Accounts restricted or inactive require settlement of all overdue bills plus the approved <strong>Reconnection Fee</strong> before water service will be restored.
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="delinquent-hero-balance">
                      <span>Total Overdue Balance ({account.bills.length} {account.bills.length === 1 ? 'bill' : 'bills'})</span>
                      <strong>{peso(account.amount)}</strong>
                    </div>

                    <div className="delinquent-hero-actions">
                      <Link className="button" to={`/admin/collections?customer=${account.customer.id}`}>
                        <Wallet size={15} /> Receive Payment
                      </Link>
                      <button type="button" className="button button-outline" onClick={() => setPrinting(true)}>
                        <Printer size={15} /> {account.stage.buttonLabel}
                      </button>
                      <Link className="button button-ghost" to={`/admin/customers/${account.customer.id}`}>
                        Full Account <ArrowUpRight size={14} />
                      </Link>
                    </div>
                  </div>

                  <div className="delinquent-dossier-body">
                    {/* Itemized Unpaid Bills */}
                    <section>
                      <div className="delinquent-section-title">
                        <h3>Overdue Bills ({account.bills.length})</h3>
                      </div>
                      <div className="delinquent-bills-list">
                        {account.bills.map((b) => (
                          <div className="delinquent-bill-item" key={b.id}>
                            <div className="bill-item-meta">
                              <strong>Bill {b.bill_no}</strong>
                              <small>Due {dateLabel(b.due_date)}</small>
                            </div>
                            <div className="bill-item-amount">
                              <span>{peso(b.balance)}</span>
                              <small>unpaid</small>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>

                    {/* Record Follow-up Form */}
                    <form className="delinquent-form-box" onSubmit={save}>
                      <div className="delinquent-section-title" style={{ margin: 0 }}>
                        <h3>Record Contact / Follow-Up</h3>
                      </div>
                      <div className="delinquent-form-row">
                        <label>
                          <span>Contact Method</span>
                          <select name="method" defaultValue="Phone Call">
                            <option>Phone Call</option>
                            <option>SMS Reminder</option>
                            <option>Office Visit</option>
                            <option>Field Notice Delivered</option>
                            <option>Other</option>
                          </select>
                        </label>
                      </div>
                      <div className="delinquent-form-row">
                        <label>
                          <span>Discussion Notes</span>
                          <textarea
                            name="notes"
                            required
                            rows={3}
                            placeholder="Enter agreement, customer explanation, or promised payment..."
                          />
                        </label>
                      </div>
                      <div className="delinquent-form-row two-col">
                        <label>
                          <span>Promise Date (Optional)</span>
                          <input type="date" name="promise" />
                        </label>
                        <label>
                          <span>Next Follow-up</span>
                          <input type="date" name="next" />
                        </label>
                      </div>
                      <button type="submit" className="button button-small" disabled={busy} style={{ width: '100%', marginTop: '6px' }}>
                        {busy ? 'Saving...' : 'Save Follow-Up Entry'}
                      </button>
                    </form>

                    {/* Follow-up Timeline */}
                    <section>
                      <div className="delinquent-section-title">
                        <h3>Follow-Up History</h3>
                      </div>
                      <div className="delinquent-history-list">
                        {history.filter((h) => h.customer_id === account.customer.id).length === 0 ? (
                          <p className="delinquent-empty-history">No contact attempts recorded yet for this customer.</p>
                        ) : (
                          history
                            .filter((h) => h.customer_id === account.customer.id)
                            .map((h) => (
                              <div className="delinquent-history-card" key={h.id}>
                                <div className="delinquent-history-head">
                                  <strong>{h.method}</strong>
                                  <span>{dateLabel(h.created_at)}</span>
                                </div>
                                <p>{h.notes}</p>
                                {(h.promise_date || h.next_date) && (
                                  <div className="delinquent-history-foot">
                                    {h.promise_date && <span>Promise: <strong>{dateLabel(h.promise_date)}</strong></span>}
                                    {h.next_date && <span>Next: <strong>{dateLabel(h.next_date)}</strong></span>}
                                  </div>
                                )}
                              </div>
                            ))
                        )}
                      </div>
                    </section>
                  </div>
                </aside>
              ) : (
                <aside className="delinquent-detail-panel empty">
                  <div className="delinquent-empty-box">
                    <div className="delinquent-empty-icon" style={{ background: '#F1F5F9', color: '#64748B' }}>
                      <UserRound size={26} />
                    </div>
                    <h3>Select an Overdue Account</h3>
                    <p>
                      Click any customer row in the table to inspect their unpaid bills breakdown, record collection contacts, or
                      print an official notice.
                    </p>
                  </div>
                </aside>
              )}
            </div>
          </>
        )}
      </div>

      {/* Official Printable Notice Template */}
      {printing && account && (
        <article className={`collection-notice notice-stage-${account.stage.level}`}>
          <header className="notice-header">
            <div className="notice-brand">
              <h1>ISABEL WATERS</h1>
              <p className="notice-brand-sub">Municipal Water Utility Billing & Collection Services</p>
            </div>
            <div className={`notice-stage-banner tone-${account.stage.tone}`}>
              <h2>{account.stage.noticeTitle}</h2>
              <span className="notice-level-tag">{account.stage.badgeLabel}</span>
            </div>
            <div className="notice-meta-bar">
              <span>Date Issued: <strong>{dateLabel(today)}</strong></span>
              <span>Account CAN: <strong>{account.customer.can || '—'}</strong></span>
              <span>Meter Serial: <strong>{account.customer.meter_no || '—'}</strong></span>
            </div>
          </header>

          <section className="notice-recipient-card">
            <div className="recipient-item">
              <span className="r-label">Customer Name:</span>
              <span className="r-value"><strong>{account.customer.full_name}</strong></span>
            </div>
            <div className="recipient-item">
              <span className="r-label">Service Address:</span>
              <span className="r-value">{account.customer.address || 'Address on file'}</span>
            </div>
            <div className="recipient-item">
              <span className="r-label">Account Status:</span>
              <span className="r-value">{account.customer.status ? account.customer.status.toUpperCase() : 'ACTIVE'}</span>
            </div>
          </section>

          <section className={`notice-warning-box tone-${account.stage.tone}`}>
            <p className="notice-warning-lead"><strong>{account.stage.noticeHeadline}</strong></p>
            <p>{account.stage.noticeWarning}</p>
          </section>

          <table className="notice-table">
            <thead>
              <tr>
                <th>Bill No.</th>
                <th>Due Date</th>
                <th>Days Overdue</th>
                <th style={{ textAlign: 'right' }}>Amount Overdue</th>
              </tr>
            </thead>
            <tbody>
              {account.bills.map((b) => (
                <tr key={b.id}>
                  <td><strong>{b.bill_no}</strong></td>
                  <td>{dateLabel(b.due_date)}</td>
                  <td>{Math.max(0, Math.round((Date.parse(today + 'T00:00:00Z') - Date.parse(b.due_date + 'T00:00:00Z')) / 86400000))} days</td>
                  <td style={{ textAlign: 'right' }}>{peso(b.balance)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="notice-total-row">
                <td colSpan={3}><strong>TOTAL OUTSTANDING OVERDUE AMOUNT</strong></td>
                <td style={{ textAlign: 'right' }}><strong>{peso(account.amount)}</strong></td>
              </tr>
            </tfoot>
          </table>

          {/* Reconnection Fee Policy Box */}
          <section className="notice-reconnection-card">
            <h4>Reconnection & Reactivation Guidelines</h4>
            <p>
              In accordance with municipal water utility guidelines, water services that are <strong>restricted</strong> or set to <strong>inactive</strong> status due to overdue accounts require settlement of all outstanding balances plus the approved <strong>Reconnection Fee</strong> before water flow will be reactivated.
            </p>
            <p className="notice-settlement-cta">
              Please visit the Isabel Waters Collection Counter at the Municipal Compound during office hours (Mon–Fri, 8:00 AM – 5:00 PM) to settle your account.
            </p>
          </section>

          <footer className="notice-footer">
            <div className="notice-signoff">
              <div className="sig-line">____________________________________</div>
              <p>Billing & Collection Officer</p>
              <small>Isabel Waters District</small>
            </div>
            <div className="notice-disclaimer">
              <p>This is an official administrative notice of overdue account. It is not an official receipt.</p>
              <small>For billing verification, contact our customer desk or present this slip at our payment window.</small>
            </div>
          </footer>
        </article>
      )}
    </div>
  )
}
