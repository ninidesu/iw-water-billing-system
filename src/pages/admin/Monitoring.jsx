import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  ClipboardList,
  Download,
  Droplets,
  FileSpreadsheet,
  Search,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react'
import { useAdminData } from '../../hooks/useAdminData.js'
import { overdueAccounts } from '../../lib/delinquency.js'
import { billStatus, dateISOManila, dateLabel, monthLabel, peso, todayISO, vatBreakdown } from '../../lib/format.js'
import { usePreferences } from '../../lib/preferences.js'
import { EmptyState, Loading, Notice, PageHeader } from '../../components/UI.jsx'
import StatusBadge from '../../components/StatusBadge.jsx'
import TablePagination, { TableEmptyRows, useTablePagination } from '../../components/TablePagination.jsx'

const csvCell = (value) => `"${String(value ?? '').replace(/^[\s]*[=+\-@]/, "'$&").replaceAll('"', '""')}"`

function exportCsv(rows) {
  const columns = ['Date', 'Bill no.', 'Customer', 'CAN', 'Cashier / Staff', 'Gross Amount', 'VATable Sale', '12% VAT', 'Method', 'Reference', 'Bill status']
  const content = [
    columns,
    ...rows.map(({ payment, bill, customer, cashier }) => {
      const vat = vatBreakdown(payment.amount)
      return [
        payment.paid_at,
        bill?.bill_no,
        customer?.full_name,
        customer?.can || '',
        cashier?.full_name || cashier?.email,
        payment.amount,
        vat.vatableSale.toFixed(2),
        vat.vatAmount.toFixed(2),
        payment.method,
        payment.reference_no,
        bill ? billStatus(bill) : '',
      ]
    }),
  ]
    .map((row) => row.map(csvCell).join(','))
    .join('\r\n')
  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob(['\uFEFF', content], { type: 'text/csv;charset=utf-8' }))
  link.download = `isabel-waters-payments-${todayISO()}.csv`
  link.click()
  URL.revokeObjectURL(link.href)
}

function SemiGauge({ percent, color = '#1B5E91' }) {
  const clamped = Math.max(0, Math.min(100, Number(percent) || 0))
  const angle = (clamped / 100) * 180
  return (
    <div className="mf-gauge-wrap">
      <svg viewBox="0 0 160 95" className="mf-gauge-svg" aria-hidden="true">
        <path d="M 16 82 A 64 64 0 0 1 144 82" fill="none" stroke="#E6ECF5" strokeWidth="11" strokeLinecap="round" />
        <path
          d="M 16 82 A 64 64 0 0 1 144 82"
          fill="none"
          stroke={color}
          strokeWidth="11"
          strokeLinecap="round"
          strokeDasharray="201"
          strokeDashoffset={201 - (201 * clamped) / 100}
        />
        <g transform={`translate(80, 82) rotate(${angle - 180})`}>
          <circle cx="64" cy="0" r="6.5" fill="#FFFFFF" stroke="#F59E0B" strokeWidth="3.5" />
        </g>
      </svg>
      <div className="mf-gauge-value">
        <strong>{clamped.toFixed(1)}</strong>
        <span>%</span>
      </div>
    </div>
  )
}

export default function Monitoring({ area = 'admin' } = {}) {
  const { data, loading, error, refresh } = useAdminData()
  const { prefs } = usePreferences()
  const [pulseTab, setPulseTab] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [methodFilter, setMethodFilter] = useState('all')
  const [cashierFilter, setCashierFilter] = useState('all')
  const [paymentFrom, setPaymentFrom] = useState('')
  const [paymentTo, setPaymentTo] = useState('')
  const today = todayISO()
  const currentMonth = today.slice(0, 7)

  const view = useMemo(() => {
    if (!data) return null
    const bills = new Map(data.bills.map((bill) => [bill.id, bill]))
    const customers = new Map(data.customers.map((customer) => [customer.id, customer]))
    const profiles = new Map(data.profiles.map((profile) => [profile.id, profile]))

    const validPayments = data.payments.filter((payment) => payment.status !== 'voided')
    const allPaymentRows = validPayments.map((payment) => {
      const bill = bills.get(payment.bill_id)
      const customer = customers.get(bill?.customer_id || payment.customer_id)
      return {
        payment,
        bill,
        customer,
        cashier: profiles.get(payment.collected_by),
      }
    })

    // Deduplicate by customer so each customer appears once in Collection Pulse with their latest payment
    const seenCustomerKeys = new Set()
    const uniqueCustomerPayments = allPaymentRows.filter(({ payment, bill, customer }) => {
      const customerKey = customer?.id || customer?.can || bill?.customer_id || payment.customer_id || payment.id
      if (seenCustomerKeys.has(customerKey)) return false
      seenCustomerKeys.add(customerKey)
      return true
    })

    const payments = uniqueCustomerPayments.filter(({ payment, bill, customer }) => {
      if (pulseTab === 'paid' && (!bill || billStatus(bill) !== 'Paid')) return false
      if (pulseTab === 'partial' && (!bill || billStatus(bill) !== 'Partial')) return false
      if (pulseTab === 'overdue' && (!bill || billStatus(bill) !== 'Overdue')) return false

      if (methodFilter !== 'all' && (payment.method || '').toLowerCase() !== methodFilter.toLowerCase()) return false
      if (cashierFilter !== 'all' && payment.collected_by !== cashierFilter) return false

      const paidDate = dateISOManila(payment.paid_at)
      if (paymentFrom && paidDate < paymentFrom) return false
      if (paymentTo && paidDate > paymentTo) return false

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const hay = `${customer?.full_name || ''} ${customer?.can || ''} ${bill?.bill_no || ''} ${payment.reference_no || ''} ${payment.method || ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })

    const billed = data.bills.reduce((sum, bill) => sum + Number(bill.amount), 0)
    const collected = validPayments.reduce((sum, payment) => sum + Number(payment.amount), 0)
    const outstanding = data.bills.reduce((sum, bill) => sum + Number(bill.balance), 0)
    const collectionRate = billed ? (collected / billed) * 100 : 0

    const paidBillsCount = data.bills.filter((b) => billStatus(b) === 'Paid').length
    const partialBillsCount = data.bills.filter((b) => billStatus(b) === 'Partial').length

    const todayPayments = validPayments.filter((p) => dateISOManila(p.paid_at) === today)
    const collectedToday = todayPayments.reduce((sum, p) => sum + Number(p.amount), 0)
    const collectedVat = vatBreakdown(collected)

    const totalM3 = data.bills.reduce((sum, b) => sum + Number(b.consumption ?? b.water_used ?? 0), 0)
    const currentMonthBills = data.bills.filter((b) => String(b.billing_month || '').startsWith(currentMonth))
    const currentMonthBilledAmt = currentMonthBills.reduce((sum, b) => sum + Number(b.amount || 0), 0)
    const activeCustomers = data.customers.filter((c) => c.status === 'active')
    const inactiveOrPendingCount = Math.max(0, data.customers.length - activeCustomers.length)
    const billedCustomerIdsThisMonth = new Set(currentMonthBills.map((b) => b.customer_id))
    const billedThisMonthCount = activeCustomers.filter((c) => billedCustomerIdsThisMonth.has(c.id)).length
    const unbilledActiveCount = Math.max(0, activeCustomers.length - billedThisMonthCount)
    const billingCoveragePct = activeCustomers.length
      ? (billedThisMonthCount / activeCustomers.length) * 100
      : 100

    const delinquentList = overdueAccounts(data.customers, data.bills, today)
    const overdueTotal = delinquentList.reduce((sum, row) => sum + row.amount, 0)
    const onTimePct = data.bills.length
      ? ((data.bills.length - data.bills.filter((b) => billStatus(b) === 'Overdue').length) / data.bills.length) * 100
      : 100

    const openApplications = (data.applications || []).filter(
      (a) => !['activated', 'rejected', 'cancelled'].includes(a.status)
    )
    const openConcerns = (data.cases || []).filter(
      (c) => !['resolved', 'closed', 'rejected'].includes(c.status)
    )

    const isCashier = area === 'cashier'
    const actionItems = [
      {
        id: 'delinquent',
        title: `${delinquentList.length} Overdue accounts`,
        subtitle: 'Overdue follow-up',
        metric: peso(overdueTotal),
        to: isCashier ? '/cashier/billing' : '/admin/delinquent',
        icon: AlertTriangle,
      },
      {
        id: 'unbilled',
        title: `${unbilledActiveCount} Unbilled households`,
        subtitle: monthLabel(currentMonth),
        metric: 'Encode bills',
        to: isCashier ? '/cashier/billing' : '/admin/billing',
        icon: FileSpreadsheet,
      },
      {
        id: 'service-apps',
        title: `${openApplications.length} Service applications`,
        subtitle: 'New connections',
        metric: 'Review',
        to: isCashier ? '/cashier/service-requests' : '/admin/service-requests',
        icon: ClipboardList,
      },
      {
        id: 'concerns',
        title: `${openConcerns.length} Customer concerns`,
        subtitle: 'Tickets & leaks',
        metric: 'Open',
        to: isCashier ? '/cashier/concerns' : '/admin/concerns',
        icon: Droplets,
      },
    ]

    return {
      allPaymentRows,
      payments,
      billed,
      collected,
      outstanding,
      collectionRate,
      paidBillsCount,
      partialBillsCount,
      collectedToday,
      todayCount: todayPayments.length,
      collectedVat,
      totalM3,
      currentMonthBilledAmt,
      billedThisMonthCount,
      activeCount: activeCustomers.length,
      inactiveOrPendingCount,
      unbilledActiveCount,
      billingCoveragePct,
      delinquentList,
      overdueTotal,
      onTimePct,
      openApplications,
      openConcerns,
      actionItems,
      ratePerM3: data.currentRate?.rate_per_m3 ?? 8,
      rateEffectiveFrom: data.currentRate?.effective_from || null,
      goal: Number(prefs.monthlyGoal || data.goal || 100000),
      cashiers: (data.profiles || []).filter((p) => p.role === 'cashier' || p.role === 'admin'),
    }
  }, [data, pulseTab, searchQuery, today, currentMonth, prefs.monthlyGoal])

  const pulsePagination = useTablePagination(
    view?.payments || [],
    10,
    [searchQuery, pulseTab, methodFilter, cashierFilter, paymentFrom, paymentTo]
  )

  const dotCount = 14
  const activeRatio = view && data?.customers?.length ? Math.round((view.activeCount / data.customers.length) * dotCount) : 12

  return (
    <div className="page-content admin-monitor mf-admin-dashboard">
      <PageHeader title="Overview" />

      <Notice type="error">{error}</Notice>
      {error && (
        <button className="button button-ghost" onClick={refresh}>
          Retry
        </button>
      )}

      {loading && !data ? (
        <Loading />
      ) : (
        view && (
          <>
            {/* ROW 1: Collection Efficiency Card + Monthly Cycle Summary Card */}
            <div className="mf-top-hero-grid">
              <section className="panel mf-prime-card">
                <div className="mf-prime-left">
                  <div className="mf-prime-head">
                    <span className="mf-eyebrow">
                      <TrendingUp size={15} /> Collection efficiency
                    </span>
                    <button
                      type="button"
                      className="mf-inline-link"
                      onClick={() => exportCsv(view.allPaymentRows)}
                      disabled={!view.allPaymentRows.length}
                      style={{ border: 0, background: 'transparent', padding: 0 }}
                    >
                      <Download size={14} /> Export CSV
                    </button>
                  </div>

                  <div className="mf-prime-headline">
                    <div className="mf-giant-metric">
                      <strong>{view.collectionRate.toFixed(1)}</strong>
                      <span>%</span>
                    </div>
                    <div className="mf-prime-delta">
                      <span className="mf-delta-pos">+{peso(view.collectedToday)} today</span>
                      <small>Target 85%</small>
                    </div>
                  </div>

                  <div className="mf-slider-track-wrap">
                    <div className="mf-slider-track">
                      <div
                        className="mf-slider-fill"
                        style={{ width: `${Math.min(100, Math.max(8, view.collectionRate))}%` }}
                      />
                      <div
                        className="mf-slider-thumb"
                        style={{ left: `${Math.min(96, Math.max(4, view.collectionRate))}%` }}
                      />
                    </div>
                  </div>

                  <div className="mf-prime-submetrics">
                    <div>
                      <strong>{data.bills.length} Bills</strong>
                      <span>Issued Total</span>
                    </div>
                    <div>
                      <strong>
                        {view.paidBillsCount} Paid · {view.partialBillsCount} Partial
                      </strong>
                      <span>Settlement Breakdown</span>
                    </div>
                    <div className="mf-submetric-right">
                      <strong>{peso(view.billed)}</strong>
                      <span>Total Billed</span>
                    </div>
                  </div>
                </div>

                <div className="mf-prime-spotlight">
                  <span className="mf-spotlight-badge">
                    <i /> Water Tariff
                  </span>
                  <div className="mf-spotlight-body">
                    <strong>{peso(view.ratePerM3)} / m³</strong>
                    <p>12% VAT Inclusive</p>
                  </div>
                  <div className="mf-spotlight-foot">
                    <h4>{view.totalM3.toFixed(0)} m³ billed</h4>
                    <small>
                      {view.rateEffectiveFrom ? `Effective ${dateLabel(view.rateEffectiveFrom)}` : 'Active residential rate'}
                    </small>
                  </div>
                </div>
              </section>

              <aside className="mf-ai-card">
                <div className="mf-ai-top">
                  <span className="mf-ai-brand">
                    <Sparkles size={15} /> {monthLabel(currentMonth)} Cycle
                  </span>
                  <span className="mf-ai-live">
                    <i /> Live
                  </span>
                </div>
                <div className="mf-ai-Copy">
                  <h2>
                    <span>{peso(view.currentMonthBilledAmt)} billed this month</span>
                    <br />
                    {((view.collected / Math.max(1, view.goal)) * 100).toFixed(0)}% of {peso(view.goal)} goal.
                  </h2>
                </div>
                <div className="mf-ai-Chips">
                  {area === 'cashier' ? (
                    <>
                      <Link to="/cashier/customers">Customers</Link>
                      <Link to="/cashier/billing">SOA Bills</Link>
                      <Link to="/cashier/collection">Payment Counter</Link>
                    </>
                  ) : (
                    <>
                      <Link to="/admin/customers">Customers</Link>
                      <Link to="/admin/rates">Rates</Link>
                      <Link to="/admin/users-audit">Audit Logs</Link>
                    </>
                  )}
                </div>
              </aside>
            </div>

            {/* ROW 2: 4 Distinct Visual KPI Cards */}
            <div className="mf-kpi-row">
              <article className="panel mf-kpi-card">
                <div className="mf-kpi-head">
                  <span>
                    <Wallet size={15} /> Net collections
                  </span>
                  <small className="mf-tag-up">+{view.todayCount} payment{view.todayCount === 1 ? '' : 's'} today</small>
                </div>
                <div className="mf-kpi-big">{peso(view.collected)}</div>
                <div className="mf-kpi-split-labels">
                  <div>
                    <strong>{peso(view.collectedVat.vatableSale)}</strong>
                    <span>
                      <i className="dot-navy" /> VATable
                    </span>
                  </div>
                  <div className="text-right">
                    <strong>{peso(view.collectedVat.vatAmount)}</strong>
                    <span>
                      <i className="dot-lavender" /> 12% VAT
                    </span>
                  </div>
                </div>
                <div className="mf-dual-bar">
                  <div style={{ width: '89.3%' }} className="mf-bar-primary" />
                  <div style={{ width: '10.7%' }} className="mf-bar-secondary" />
                </div>
              </article>

              <article className="panel mf-kpi-card">
                <div className="mf-kpi-head">
                  <span>
                    <FileSpreadsheet size={15} /> Billing coverage
                  </span>
                  <small className="mf-tag-warn">{monthLabel(currentMonth)}</small>
                </div>
                <div className="mf-kpi-sides">
                  <div>
                    <strong>
                      {view.billedThisMonthCount} / {view.activeCount}
                    </strong>
                    <span>Households Billed</span>
                  </div>
                  <div className="text-right">
                    <strong>100%</strong>
                    <span>Target</span>
                  </div>
                </div>
                <SemiGauge percent={view.billingCoveragePct} color="#1E3A8A" />
              </article>

              <article className="panel mf-kpi-card">
                <div className="mf-kpi-head">
                  <span>
                    <AlertTriangle size={15} /> On-time rate
                  </span>
                  <small className="mf-tag-warn">{view.paidBillsCount} settled</small>
                </div>
                <div className="mf-kpi-sides">
                  <div>
                    <strong>{peso(view.outstanding)}</strong>
                    <span>Unpaid Balance</span>
                  </div>
                  <div className="text-right">
                    <strong>90%</strong>
                    <span>Target</span>
                  </div>
                </div>
                <SemiGauge percent={view.onTimePct} color="#1B5E91" />
              </article>

              <article className="panel mf-kpi-card">
                <div className="mf-kpi-head">
                  <span>
                    <Users size={15} /> Customer directory
                  </span>
                  <small className="mf-tag-up">
                    {view.openApplications.length + view.openConcerns.length} in queue
                  </small>
                </div>
                <div className="mf-kpi-big">{data.customers.length}</div>
                <div className="mf-kpi-split-labels">
                  <div>
                    <strong>{view.activeCount}</strong>
                    <span>
                      <i className="dot-purple" /> Active
                    </span>
                  </div>
                  <div className="text-right">
                    <strong>{view.inactiveOrPendingCount}</strong>
                    <span>
                      <i className="dot-soft" /> Pending / Inactive
                    </span>
                  </div>
                </div>
                <div className="mf-dot-matrix" aria-hidden="true">
                  {Array.from({ length: dotCount }).map((_, idx) => (
                    <span key={idx} className={idx < activeRatio ? 'filled' : ''} />
                  ))}
                </div>
              </article>
            </div>

            {/* ROW 3: Deduplicated Collection Pulse Table + Actions Due */}
            <div className="mf-bottom-split">
              <section className="panel mf-pulse-panel">
                <div className="mf-pulse-header">
                  <div>
                    <h2>Collection pulse</h2>
                  </div>
                  <div className="mf-pulse-controls">
                    <div className="mf-top-search">
                      <Search size={15} />
                      <input
                        type="search"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search customer, CAN, or ref no..."
                      />
                    </div>
                    <div className="mf-segmented-tabs" role="tablist">
                      {[
                        { id: 'all', label: 'All' },
                        { id: 'paid', label: 'Paid' },
                        { id: 'partial', label: 'Partial' },
                      ].map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          className={pulseTab === tab.id ? 'active' : ''}
                          onClick={() => setPulseTab(tab.id)}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                    <label className="table-filter">
                      <span className="sr-only">Payment method</span>
                      <select value={methodFilter} onChange={(e) => setMethodFilter(e.target.value)}>
                        <option value="all">All methods</option>
                        <option value="cash">Cash</option>
                        <option value="check">Check</option>
                        <option value="online">Online / GCash</option>
                      </select>
                    </label>
                    <label className="table-filter">
                      <span className="sr-only">Collecting staff</span>
                      <select value={cashierFilter} onChange={(e) => setCashierFilter(e.target.value)}>
                        <option value="all">All staff</option>
                        {view.cashiers.map((c) => (
                          <option key={c.id} value={c.id}>{c.full_name || c.email}</option>
                        ))}
                      </select>
                    </label>
                    <div className="table-date-range">
                      <input
                        type="date"
                        aria-label="Payment date from"
                        value={paymentFrom}
                        onChange={(e) => setPaymentFrom(e.target.value)}
                        title="Payment date from"
                      />
                      <span>to</span>
                      <input
                        type="date"
                        aria-label="Payment date to"
                        value={paymentTo}
                        onChange={(e) => setPaymentTo(e.target.value)}
                        title="Payment date to"
                      />
                    </div>
                    {(searchQuery || pulseTab !== 'all' || methodFilter !== 'all' || cashierFilter !== 'all' || paymentFrom || paymentTo) && (
                      <button
                        type="button"
                        className="button button-ghost button-sm"
                        onClick={() => {
                          setSearchQuery('')
                          setPulseTab('all')
                          setMethodFilter('all')
                          setCashierFilter('all')
                          setPaymentFrom('')
                          setPaymentTo('')
                        }}
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </div>

                {view.payments.length ? (
                  <>
                    <div className="table-scroll">
                    <table className="mf-pulse-table">
                      <thead>
                        <tr>
                          <th>Customer</th>
                          <th>Latest Bill</th>
                          <th>Gross Paid</th>
                          <th>VATable</th>
                          <th>12% VAT</th>
                          <th>Settled</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pulsePagination.visibleRows.map(({ payment, bill, customer }) => {
                          const vat = vatBreakdown(payment.amount)
                          const billAmt = Number(bill?.amount || payment.amount || 1)
                          const billBal = Number(bill?.balance || 0)
                          const settledPct = Math.min(100, Math.max(0, ((billAmt - billBal) / billAmt) * 100))
                          const initials = (customer?.full_name || 'IW')
                            .split(' ')
                            .map((n) => n[0])
                            .slice(0, 2)
                            .join('')
                            .toUpperCase()

                          return (
                            <tr key={payment.id}>
                              <td>
                                <div className="mf-entity-cell">
                                  <span className="mf-entity-avatar">{initials}</span>
                                  <div>
                                    <strong>{customer?.full_name || 'Walk-in'}</strong>
                                    <small>CAN {customer?.can || '—'}</small>
                                  </div>
                                </div>
                              </td>
                              <td>
                                <strong>{bill?.bill_no || '—'}</strong>
                                <small>{bill?.billing_month ? monthLabel(bill.billing_month) : dateLabel(payment.paid_at)}</small>
                              </td>
                              <td className="money-cell">
                                <strong>{peso(payment.amount)}</strong>
                              </td>
                              <td className="money-cell">{peso(vat.vatableSale)}</td>
                              <td className="money-cell">{peso(vat.vatAmount)}</td>
                              <td>
                                <div className="mf-inline-progress">
                                  <strong>{settledPct.toFixed(0)}%</strong>
                                  <div className="mf-mini-track">
                                    <div style={{ width: `${settledPct}%` }} />
                                  </div>
                                </div>
                              </td>
                              <td>{bill ? <StatusBadge bill={bill} /> : <StatusBadge status="paid" />}</td>
                            </tr>
                          )
                        })}
                        <TableEmptyRows count={pulsePagination.emptyRowsCount} colSpan={7} />
                      </tbody>
                    </table>
                  </div>
                  <TablePagination {...pulsePagination} total={view.payments.length} />
                </>) : (
                  <EmptyState title="No payments yet" />
                )}
              </section>

              <aside className="panel mf-decisions-panel">
                <div className="mf-decisions-head">
                  <h2>Actions due</h2>
                  <span className="mf-count-badge">
                    {view.delinquentList.length +
                      view.unbilledActiveCount +
                      view.openApplications.length +
                      view.openConcerns.length}{' '}
                    items
                  </span>
                </div>

                <div className="mf-decision-list">
                  {view.actionItems.map((item) => {
                    const Icon = item.icon
                    return (
                      <Link to={item.to} key={item.id} className="mf-decision-item">
                        <span className="mf-decision-icon">
                          <Icon size={18} />
                        </span>
                        <div className="mf-decision-body">
                          <strong>{item.title}</strong>
                          <small>{item.subtitle}</small>
                        </div>
                        <div className="mf-decision-meta">
                          <strong>{item.metric}</strong>
                        </div>
                      </Link>
                    )
                  })}
                </div>

                <Link to={area === 'cashier' ? '/cashier/collection' : '/admin/collections'} className="mf-cta-pill-button">
                  Open Payment Counter <ArrowRight size={16} />
                </Link>
              </aside>
            </div>
          </>
        )
      )}
    </div>
  )
}
