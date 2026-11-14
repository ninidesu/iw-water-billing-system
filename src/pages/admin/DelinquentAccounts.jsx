import { useEffect, useMemo, useRef, useState } from 'react'
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
import TablePagination, { useTablePagination } from '../../components/TablePagination.jsx'
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
  const detailDialog = useRef(null)
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
  const account = accounts.find((r) => r.customer.id === selected)
  const showDetails = Boolean(account)

  useEffect(() => {
    const dialog = detailDialog.current
    if (!showDetails || !dialog) return
    const opener = document.activeElement
    dialog.showModal()
    return () => {
      dialog.close()
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true })
    }
  }, [showDetails])

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
    { val: '', label: 'All', count: accounts.length, tone: 'neutral' },
    { val: '1mo', label: '1 Mo', count: count1mo, tone: 'green' },
    { val: '2mo', label: '2 Mos', count: count2mo, tone: 'yellow' },
    { val: '3mo', label: '3+ Mos', count: count3mo, tone: 'red' },
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
        <PageHeader title="Overdue Accounts" description="Review overdue balances and track customer follow-ups." />
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
                </div>
                <strong className="stat-value-bottom-right">{accounts.length}</strong>
              </div>

              <div className="stat-card">
                <div className="stat-top-info">
                  <span className="stat-label">Total Overdue Balance</span>
                </div>
                <strong className="stat-value-bottom-right">{peso(totalOverdue)}</strong>
              </div>

              <div className="stat-card">
                <div className="stat-top-info">
                  <span className="stat-label">Eligible for Restriction</span>
                </div>
                <strong className="stat-value-bottom-right">{count3mo}</strong>
              </div>

              <div className="stat-card">
                <div className="stat-top-info">
                  <span className="stat-label">Pending Follow-Up</span>
                </div>
                <strong className="stat-value-bottom-right">{pendingFollowupCount}</strong>
              </div>
            </div>

            <section className="delinquent-table-card overdue-ledger" aria-labelledby="overdue-list-title">
            <h2 className="sr-only" id="overdue-list-title">Account list</h2>
            <div className="delinquent-filters" role="group" aria-label="Account filters">
            <div className="delinquent-stage-bar" role="group" aria-label="Overdue stage">
              {agePills.map(({ val, label, count, tone }) => (
                <button
                  key={val}
                  type="button"
                  aria-pressed={age === val}
                  className={`delinquent-age-pill tone-${tone} ${age === val ? 'active' : ''}`}
                  onClick={() => setAge(val)}
                >
                  <span className="overdue-filter-dot" aria-hidden="true" />
                  <span className="pill-label">{label}</span>
                  <span className="pill-count">{count}</span>
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

            </div>

                {rows.length > 0 ? (
                  <>
                    <div className="table-scroll" tabIndex={0} role="region" aria-labelledby="overdue-list-title">
                      <table>
                        <thead>
                          <tr>
                            <th>Customer</th>
                            <th>Unpaid Bills</th>
                            <th>Overdue Amount</th>
                            <th>Age</th>
                            <th>Status</th>
                            <th>Last Contact</th>
                            <th scope="col">Action</th>
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
                                onClick={() => setSelected(r.customer.id)}
                              >
                                <td>
                                  <div className="delinquent-customer-cell">
                                    <button
                                      type="button"
                                      aria-pressed={isSelected}
                                      onClick={(event) => {
                                        event.stopPropagation()
                                        setSelected(r.customer.id)
                                      }}
                                    >
                                      {r.customer.full_name}
                                    </button>
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
                                  <div className="overdue-age-cell">
                                    <span className={`delinquent-stage-tag stage-${r.stage.level}`}>
                                      {r.stage.level === 3 ? '3+ Mos' : r.stage.level === 2 ? '2 Mos' : '1 Mo'}
                                    </span>
                                    <span>{r.days} {r.days === 1 ? 'day' : 'days'}</span>
                                  </div>
                                </td>
                                <td>
                                  <StatusBadge status={r.customer.status} />
                                </td>
                                <td>
                                  <span className="overdue-last-contact">
                                    {lastContact ? dateLabel(lastContact.created_at) : 'Not yet contacted'}
                                  </span>
                                </td>
                                <td>
                                  <div className="table-actions">
                                    <button
                                      type="button"
                                      className="table-view-btn"
                                      aria-label={`View overdue account for ${r.customer.full_name}`}
                                      aria-haspopup="dialog"
                                      onClick={(event) => {
                                        event.stopPropagation()
                                        setSelected(r.customer.id)
                                      }}
                                    >
                                      View
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                    <TablePagination {...page} total={rows.length} showRange={false} />
                  </>
                ) : (
                  <div className="delinquent-empty-box">
                    <div className="delinquent-empty-icon">
                      <CheckCircle2 size={26} />
                    </div>
                    <h3>{hasActiveFilters ? 'No matching accounts' : 'No overdue accounts'}</h3>
                    <p>
                      {hasActiveFilters
                        ? 'Clear your filters to see more accounts.'
                        : 'There are no balances past their due date.'}
                    </p>
                    {hasActiveFilters && (
                      <button type="button" className="button button-ghost button-small" onClick={resetFilters}>
                        <RotateCcw size={13} /> Clear Filters
                      </button>
                    )}
                  </div>
                )}
            </section>

              {/* Right Column: Account Dossier & Actions */}
              {account ? (
                <dialog
                  ref={detailDialog}
                  className="delinquent-detail-panel overdue-account-drawer"
                  aria-labelledby="overdue-detail-title"
                  onCancel={(event) => {
                    event.preventDefault()
                    setSelected('')
                  }}
                  onClick={(event) => {
                    if (event.target === event.currentTarget) setSelected('')
                  }}
                >
                  <div className="delinquent-detail-hero">
                    <div className="delinquent-hero-top">
                      <div className="delinquent-hero-info">
                        <h2 id="overdue-detail-title">{account.customer.full_name}</h2>
                        <p>
                          CAN {account.customer.can || '—'} · {account.customer.meter_no || '—'} · {account.customer.address || 'Address unavailable'}
                        </p>
                      </div>
                      <button type="button" className="overdue-drawer-close" aria-label="Close account details" onClick={() => setSelected('')}>
                        <X size={20} aria-hidden="true" />
                      </button>
                    </div>

                    {/* Overdue Stage Alert Callout */}
                    <div className={`delinquent-stage-callout tone-${account.stage.tone}`}>
                      <div className="stage-callout-head">
                        <span className="stage-callout-badge">{account.stage.badgeLabel}</span>
                      </div>
                      <p className="stage-callout-message">
                        {account.stage.level === 3
                          ? 'Settle balance within 5 business days to avoid restriction.'
                          : account.stage.level === 2
                            ? 'Settle balance to avoid restriction.'
                            : 'Payment overdue. Send a reminder.'}
                      </p>
                      {account.stage.level === 3 && (
                        <details className="reconnection-policy-note">
                          <summary><Info size={14} className="reconnection-info-icon" /> Policy</summary>
                          <p>Accounts restricted or inactive require settlement of all overdue bills plus the approved Reconnection Fee before water service will be restored.</p>
                        </details>
                      )}
                    </div>

                    <div className="delinquent-hero-balance">
                      <span>Total Overdue Balance</span>
                      <strong>{peso(account.amount)}</strong>
                    </div>

                    <div className="delinquent-hero-actions">
                      <Link className="button" to={`/admin/collections?customer=${account.customer.id}`}>
                        <Wallet size={15} /> Receive Payment
                      </Link>
                      <button type="button" className="button button-outline" onClick={() => setPrinting(true)}>
                        <Printer size={15} /> Print Notice
                      </button>
                      <Link className="button button-ghost" to={`/admin/customers/${account.customer.id}`}>
                        View Account <ArrowUpRight size={14} />
                      </Link>
                    </div>
                  </div>

                  <div className="delinquent-dossier-body">
                    {/* Itemized Unpaid Bills */}
                    <section>
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
                        <h3>Follow-up</h3>
                      </div>
                      <div className="delinquent-form-row">
                        <label>
                          <span>Method</span>
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
                          <span>Notes</span>
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
                        {busy ? 'Saving...' : 'Save Follow-up'}
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
                </dialog>
              ) : null}
          </>
        )}
      </div>

      {/* Official Printable Notice Template */}
      {printing && account && (
        <article className={`collection-notice notice-stage-${account.stage.level}`}>
          <header className="notice-header">
            <div className="notice-brand">
              <h1>ISABEL WATERS</h1>
              <p className="notice-brand-sub">Billing & Collection</p>
            </div>
            <div className={`notice-stage-banner tone-${account.stage.tone}`}>
              <h2>{account.stage.noticeTitle}</h2>
            </div>
            <div className="notice-meta-bar">
              <span>Date Issued: <strong>{dateLabel(today)}</strong></span>
              <span>CAN: <strong>{account.customer.can || '—'}</strong></span>
              <span>Meter: <strong>{account.customer.meter_no || '—'}</strong></span>
            </div>
          </header>

          <section className="notice-recipient-card">
            <div className="recipient-item">
              <span className="r-label">Customer</span>
              <span className="r-value"><strong>{account.customer.full_name}</strong></span>
            </div>
            <div className="recipient-item">
              <span className="r-label">Service Address</span>
              <span className="r-value">{account.customer.address || 'Address on file'}</span>
            </div>
          </section>

          <section className={`notice-warning-box tone-${account.stage.tone}`}>
            <p className="notice-warning-lead"><strong>Action required</strong></p>
            <p>{account.stage.level === 3
              ? 'Settle the overdue balance within 5 business days to avoid service restriction.'
              : account.stage.level === 2
                ? 'Settle the overdue balance to avoid service restriction.'
                : 'Please settle the overdue balance.'}</p>
          </section>

          <table className="notice-table">
            <thead>
              <tr>
                <th>Bill No.</th>
                <th>Due Date</th>
                <th style={{ textAlign: 'right' }}>Amount Overdue</th>
              </tr>
            </thead>
            <tbody>
              {account.bills.map((b) => (
                <tr key={b.id}>
                  <td><strong>{b.bill_no}</strong></td>
                  <td>{dateLabel(b.due_date)}</td>
                  <td style={{ textAlign: 'right' }}>{peso(b.balance)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="notice-total-row">
                <td colSpan={2}><strong>Total Due</strong></td>
                <td style={{ textAlign: 'right' }}><strong>{peso(account.amount)}</strong></td>
              </tr>
            </tfoot>
          </table>

          {account.stage.level === 3 && (
            <p className="notice-policy-line">If service is restricted, reconnection requires full payment and the approved Reconnection Fee.</p>
          )}

          <footer className="notice-footer">
            <div className="notice-signoff">
              <div className="sig-line">____________________________________</div>
              <p>Billing & Collection Officer</p>
            </div>
            <div className="notice-disclaimer">
              <p>Overdue notice · Not an official receipt</p>
            </div>
          </footer>
        </article>
      )}
    </div>
  )
}
