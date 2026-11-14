import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  ChevronDown,
  Download,
  Droplets,
  FileText,
  Users,
  Wallet,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext.jsx'
import { useAdminData } from '../../hooks/useAdminData.js'
import { overdueAccounts } from '../../lib/delinquency.js'
import { billStatus, dateISOManila, dateLabel, monthLabel, peso, todayISO, vatBreakdown } from '../../lib/format.js'
import { exportDailyCollectionCsv, exportDailyCollectionPdf } from '../../lib/dailyReportExport.js'
import { usePreferences } from '../../lib/preferences.js'
import { EmptyState, Loading, Notice, PageHeader } from '../../components/UI.jsx'
import './overview-reference.css'

function formatRelativeDate(isoDate, todayStr) {
  if (!isoDate) return '—'
  const dateStr = dateISOManila(isoDate)
  if (dateStr === todayStr) return 'Today'

  const y = new Date()
  y.setDate(y.getDate() - 1)
  if (dateStr === dateISOManila(y)) return 'Yesterday'

  const d = new Date(isoDate)
  const day = String(d.getDate()).padStart(2, '0')
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  return `${day}.${mo}`
}

function SegmentedDonut({ slices, totalAmount, activeId, onHover }) {
  const C = 439.82 // 2 * PI * 70
  let currentOffset = 0
  const rendered = slices.map((s) => {
    const len = (s.percent / 100) * C
    const dArray = `${len} ${C - len}`
    const dOffset = -currentOffset
    currentOffset += len
    return { ...s, dArray, dOffset }
  })

  const activeSlice = slices.find((s) => s.id === activeId)

  return (
    <div className="nev-donut-svg-wrap">
      <svg viewBox="18 18 164 164" className="nev-donut-svg" aria-hidden="true">
        <circle
          cx="100"
          cy="100"
          r="70"
          fill="none"
          stroke="var(--ov-line)"
          strokeWidth="20"
        />
        {rendered.map((s) => (
          <circle
            key={s.id}
            cx="100"
            cy="100"
            r="70"
            fill="none"
            stroke={s.color}
            strokeWidth={activeId === s.id ? 22 : 20}
            strokeDasharray={s.dArray}
            strokeDashoffset={s.dOffset}
            strokeLinecap="butt"
            className={`nev-donut-segment ${activeId === s.id ? 'active' : ''}`}
            onMouseEnter={() => onHover(s.id)}
            onMouseLeave={() => onHover(null)}
          />
        ))}
      </svg>
      <div className="nev-donut-center">
        <span className="nev-center-label">
          {activeSlice ? activeSlice.label : 'Total Billed'}
        </span>
        <strong className="nev-center-value">
          {peso(activeSlice ? activeSlice.value : totalAmount)}
        </strong>
      </div>
    </div>
  )
}

export default function Monitoring({ area = 'admin' } = {}) {
  const { profile } = useAuth()
  const { data, loading, error, refresh } = useAdminData()
  const { prefs } = usePreferences()
  const [activeSliceId, setActiveSliceId] = useState(null)
  const [donutPeriod, setDonutPeriod] = useState('month')

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

    const billed = data.bills.reduce((sum, bill) => sum + Number(bill.amount || 0), 0)
    const collected = validPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
    const monthPayments = validPayments.filter((payment) => dateISOManila(payment.paid_at)?.slice(0, 7) === currentMonth)
    const collectedMTD = monthPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
    const outstanding = data.bills.reduce((sum, bill) => sum + Number(bill.balance || 0), 0)
    const collectionRate = billed ? (collected / billed) * 100 : 0

    const todayPayments = validPayments.filter((p) => dateISOManila(p.paid_at) === today)
    const collectedToday = todayPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0)
    const todayPaymentRows = allPaymentRows.filter((r) => dateISOManila(r.payment.paid_at) === today)

    // Weekly collected (last 7 days)
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const sevenDaysAgoISO = dateISOManila(sevenDaysAgo)
    const weeklyPayments = validPayments.filter((p) => {
      const pDate = dateISOManila(p.paid_at)
      return pDate >= sevenDaysAgoISO && pDate <= today
    })
    const collectedWeekly = weeklyPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0)

    const totalM3 = data.bills.reduce((sum, b) => sum + Number(b.consumption ?? b.water_used ?? 0), 0)
    const activeCustomers = data.customers.filter((c) => c.status === 'active')

    const delinquentList = overdueAccounts(data.customers, data.bills, today)

    // Breakdown for Donut Chart
    const totalWaterBase = data.bills.reduce((sum, b) => {
      const charge = Number(b.water_charge ?? b.amount ?? 0)
      return sum + vatBreakdown(charge).vatableSale
    }, 0)
    const totalVat = data.bills.reduce((sum, b) => {
      const charge = Number(b.water_charge ?? b.amount ?? 0)
      return sum + vatBreakdown(charge).vatAmount
    }, 0)
    const totalPenalties = data.bills.reduce((sum, b) => {
      return sum + Number(b.penalty_amount ?? b.penalty ?? 0)
    }, 0)
    const totalArrears = data.bills.reduce((sum, b) => {
      return sum + Number(b.previous_balance ?? b.arrears_amount ?? 0)
    }, 0)
    const totalOtherFees = Math.max(0, billed - (totalWaterBase + totalVat + totalPenalties + totalArrears))

    const rawBreakdownSlices = [
      { id: 'water', label: 'Water Charge', value: totalWaterBase, color: '#0284C7' },
      { id: 'vat', label: '12% VAT', value: totalVat, color: '#6366F1' },
      { id: 'penalties', label: 'Penalties', value: totalPenalties, color: '#F59E0B' },
      { id: 'arrears', label: 'Arrears', value: totalArrears, color: '#F43F5E' },
      { id: 'fees', label: 'Connection Fees', value: totalOtherFees, color: '#10B981' },
    ].filter((s) => s.value > 0)

    const breakdownSlices = rawBreakdownSlices

    const slicesSum = breakdownSlices.reduce((sum, s) => sum + s.value, 0) || 1
    const computedSlices = breakdownSlices.map((s) => ({
      ...s,
      percent: (s.value / slicesSum) * 100,
    }))

    // Latest 7 transactions sorted descending by paid_at
    const recentTransactions = [...allPaymentRows]
      .sort((a, b) => new Date(b.payment.paid_at || 0) - new Date(a.payment.paid_at || 0))
      .slice(0, 7)

    return {
      allPaymentRows,
      todayPaymentRows,
      billed,
      collected,
      collectedMTD,
      outstanding,
      collectionRate,
      collectedToday,
      todayCount: todayPayments.length,
      collectedWeekly,
      totalM3,
      activeCount: activeCustomers.length,
      delinquentList,
      ratePerM3: data.currentRate?.rate_per_m3 ?? 8,
      goal: Number(prefs.monthlyGoal ?? data.goal ?? 0),
      computedSlices,
      slicesSum,
      recentTransactions,
    }
  }, [data, today, currentMonth, prefs.monthlyGoal])

  const isCashier = area === 'cashier'

  return (
    <div className="page-content admin-monitor nev-dashboard overview-reference">
      <PageHeader
        title="Overview"
        action={
          <div className="header-export-actions">
            <button
              type="button"
              className="button button-ghost button-sm"
              onClick={() => exportDailyCollectionCsv(view?.todayPaymentRows || [], { today, profile })}
              title="Export Today's Collection to CSV"
            >
              <Download size={12} /> Export CSV
            </button>
            <button
              type="button"
              className="button button-ghost button-sm"
              onClick={() => exportDailyCollectionPdf(view?.todayPaymentRows || [], { today, profile })}
              title="Export Today's Collection to PDF Report"
            >
              <FileText size={12} /> Export PDF
            </button>
          </div>
        }
      />

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
            {/* ROW 1: Hero Split Grid (Main Operations Card 62% + Collection Target Banner 38%) */}
            <div className="nev-hero-grid">
              <section className="nev-hero-main">
                <svg className="nev-main-bg-lines" viewBox="0 0 300 200" fill="none" aria-hidden="true">
                  <path d="M-30,130 Q70,40 170,110 T370,100" stroke="#FFFFFF" strokeWidth="2" opacity="0.14" />
                  <path d="M-30,160 Q80,70 180,140 T370,130" stroke="#FFFFFF" strokeWidth="2" opacity="0.11" />
                  <path d="M-30,190 Q90,100 190,170 T370,160" stroke="#FFFFFF" strokeWidth="2" opacity="0.08" />
                </svg>

                <div className="nev-hero-main-top">
                  <div className="nev-hero-main-left">
                    <span className="nev-hero-eyebrow">{isCashier ? 'Cashier Counter' : 'Billing Operations'}</span>
                    <Link
                      to={isCashier ? '/cashier/billing' : '/admin/billing'}
                      className="nev-hero-title-link"
                    >
                      Isabel Waters Utility
                      <span className="nev-hero-title-arrow">
                        <ArrowRight size={18} />
                      </span>
                    </Link>
                    <p className="nev-hero-subtitle">
                      Cycle {monthLabel(currentMonth)} · Rate: {peso(view.ratePerM3)}/m³ · Due Window: 1–30
                    </p>
                  </div>

                  <div className="nev-hero-main-right">
                    <span className="nev-hero-collected-label">Collected MTD</span>
                    <h2 className="nev-hero-giant-amount">{peso(view.collectedMTD)}</h2>
                  </div>
                </div>

                <div className="nev-hero-actions">
                  <Link
                    to={isCashier ? '/cashier/collection' : '/admin/collections'}
                    className="nev-btn-primary"
                  >
                    Open Payment Counter
                  </Link>
                  <Link
                    to={isCashier ? '/cashier/billing' : '/admin/billing'}
                    className="nev-btn-secondary"
                  >
                    Statements of Account
                  </Link>
                </div>
              </section>

              <aside className="nev-hero-banner">
                <svg className="nev-banner-bg-lines" viewBox="0 0 200 200" fill="none" aria-hidden="true">
                  <path d="M-20,120 Q60,40 140,110 T300,100" stroke="#FFFFFF" strokeWidth="2" opacity="0.6" />
                  <path d="M-20,150 Q70,70 150,140 T300,130" stroke="#FFFFFF" strokeWidth="2" opacity="0.4" />
                  <path d="M-20,180 Q80,100 160,170 T300,160" stroke="#FFFFFF" strokeWidth="2" opacity="0.3" />
                </svg>

                <div className="nev-banner-top">
                  <h3 className="nev-banner-title">Collection Target</h3>
                  <div className="nev-banner-dots" aria-hidden="true">
                    <span className="nev-banner-dot active" />
                    <span className="nev-banner-dot" />
                    <span className="nev-banner-dot" />
                  </div>
                </div>

                <div className="overview-target-row">
                  <div className="overview-target-ring" style={{ '--progress': `${Math.min(100, view.goal ? view.collectedMTD / view.goal * 100 : 0)}%` }}>
                    <span>{view.goal ? ((view.collectedMTD / view.goal) * 100).toFixed(1) : '0.0'}%</span>
                  </div>
                  <p className="nev-banner-desc"><strong>{view.goal ? ((view.collectedMTD / view.goal) * 100).toFixed(1) : '0.0'}%</strong> of {peso(view.goal)} monthly collection target realized.</p>
                </div>

                <div className="nev-banner-bottom">
                  <Link
                    to={isCashier ? '/cashier/billing' : '/admin/delinquent'}
                    className="nev-btn-banner"
                  >
                    {isCashier ? 'Review Statements' : 'Review Overdue'}
                  </Link>
                  <div className="nev-banner-badge-icon" aria-hidden="true">
                    <Calendar size={26} strokeWidth={1.8} />
                  </div>
                </div>
              </aside>
            </div>

            {/* ROW 2: 4 Sleek Horizontal KPI Cards (Number on Left, No Icons) */}
            <div className="nev-kpi-grid">
              <Link
                to={isCashier ? '/cashier/collection' : '/admin/collections'}
                className="panel nev-kpi-card"
              >
                <div className="nev-kpi-metric-col">
                  <strong className="nev-kpi-amount">{peso(view.collectedToday)}</strong>
                </div>
                <div className="nev-kpi-titles">
                  <h4 className="nev-kpi-name">Today's Collections</h4>
                  <span className="nev-kpi-sub">{view.todayCount} payments posted</span>
                </div>
              </Link>

              <Link
                to={isCashier ? '/cashier/billing' : '/admin/delinquent'}
                className="panel nev-kpi-card"
              >
                <div className="nev-kpi-metric-col">
                  <strong className="nev-kpi-amount">{peso(view.outstanding)}</strong>
                </div>
                <div className="nev-kpi-titles">
                  <h4 className="nev-kpi-name">Total Outstanding</h4>
                  <span className="nev-kpi-sub">{view.delinquentList.length} overdue accounts</span>
                </div>
              </Link>

              <Link
                to={isCashier ? '/cashier/customers' : '/admin/customers'}
                className="panel nev-kpi-card"
              >
                <div className="nev-kpi-metric-col">
                  <strong className="nev-kpi-amount">{view.activeCount}</strong>
                </div>
                <div className="nev-kpi-titles">
                  <h4 className="nev-kpi-name">Active Consumers</h4>
                  <span className="nev-kpi-sub">{data.customers.length} total customers</span>
                </div>
              </Link>

              <Link
                to={isCashier ? '/cashier/billing' : '/admin/billing'}
                className="panel nev-kpi-card"
              >
                <div className="nev-kpi-metric-col">
                  <strong className="nev-kpi-amount">{view.totalM3.toFixed(1)} m³</strong>
                </div>
                <div className="nev-kpi-titles">
                  <h4 className="nev-kpi-name">Billed Water Volume</h4>
                  <span className="nev-kpi-sub">Current cycle consumption</span>
                </div>
              </Link>
            </div>

            {/* ROW 3: Bottom Split (Latest Transactions 58% + Revenue Breakdown 42%) */}
            <div className="nev-bottom-grid">
              {/* Left: Latest Transactions */}
              <section className="panel nev-table-card">
                <div>
                  <div className="nev-card-head">
                    <h3 className="nev-card-title">Latest transactions</h3>
                    <Link
                      to={isCashier ? '/cashier/collection' : '/admin/collections'}
                      className="nev-circle-btn"
                      title="View all collections"
                    >
                      <ArrowRight size={15} />
                    </Link>
                  </div>

                  {view.recentTransactions.length ? (
                    <div className="nev-table-wrap">
                      <table className="nev-table">
                        <tbody>
                          {view.recentTransactions.map(({ payment, bill, customer }) => {
                            const status = bill ? billStatus(bill).toLowerCase() : 'paid'
                            const pillClass =
                              status === 'paid'
                                ? 'pill-paid'
                                : status === 'partial'
                                ? 'pill-partial'
                                : status === 'overdue'
                                ? 'pill-overdue'
                                : 'pill-unpaid'
                            const pillLabel = status.charAt(0).toUpperCase() + status.slice(1)
                            const relDate = formatRelativeDate(payment.paid_at, today)
                            const receiptUrl = `${isCashier ? '/cashier' : '/admin'}/receipts/${payment.id}`

                            return (
                              <tr key={payment.id}>
                                <td className="nev-table-date">{relDate}</td>
                                <td>
                                  <div className="nev-table-customer">
                                    <span className="nev-table-name">
                                      {customer?.full_name || 'Walk-in Consumer'}
                                    </span>
                                    <span className="nev-table-can">
                                      CAN {customer?.can || bill?.bill_no || '—'}
                                    </span>
                                  </div>
                                </td>
                                <td className="nev-table-method">
                                  {payment.method
                                    ? payment.method.charAt(0).toUpperCase() + payment.method.slice(1)
                                    : 'Cash'}
                                </td>
                                <td>
                                  <span className={`nev-status-pill ${pillClass}`}>
                                    <i className="pill-dot" />
                                    {pillLabel}
                                  </span>
                                </td>
                                <td className="nev-table-amount">+ {peso(payment.amount)}</td>
                                <td className="nev-table-action">
                                  <Link
                                    to={receiptUrl}
                                    className="nev-action-chevron"
                                    title="View receipt"
                                  >
                                    <ArrowRight size={15} />
                                  </Link>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <EmptyState title="No transactions yet" />
                  )}
                </div>

                <div className="nev-table-foot">
                  <Link
                    to={isCashier ? '/cashier/collection' : '/admin/collections'}
                    className="nev-see-more"
                  >
                    See more <ArrowRight size={14} />
                  </Link>
                </div>
              </section>

              {/* Right Column: Compact Revenue Breakdown + Overdue Accounts (2-3 rows) */}
              <div className="nev-right-col">
                <section className="panel nev-donut-card compact">
                  <div>
                    <div className="nev-card-head">
                      <h3 className="nev-card-title">Revenue breakdown</h3>
                      <Link
                        to={isCashier ? '/cashier/billing' : '/admin/billing'}
                        className="nev-circle-btn"
                        title="View billing records"
                      >
                        <ArrowRight size={14} />
                      </Link>
                    </div>

                    <div className="nev-donut-periods">
                      <div className="nev-period-col">
                        <span className="nev-period-label">daily</span>
                        <strong className="nev-period-val">{peso(view.collectedToday)}</strong>
                      </div>
                      <div className="nev-period-col">
                        <span className="nev-period-label">weekly</span>
                        <strong className="nev-period-val">{peso(view.collectedWeekly)}</strong>
                      </div>
                      <div className="nev-period-col">
                        <span className="nev-period-label">monthly</span>
                        <strong className="nev-period-val">{peso(view.collectedMTD)}</strong>
                      </div>
                    </div>

                    <div className="nev-donut-subhead">
                      <h4 className="overview-distribution-title">Category distribution</h4>
                      <select
                        className="nev-donut-filter"
                        aria-label="Revenue breakdown period"
                        value={donutPeriod}
                        onChange={(e) => setDonutPeriod(e.target.value)}
                      >
                        <option value="month">Current month</option>
                        <option value="today">Today</option>
                        <option value="all">Year to date</option>
                      </select>
                    </div>

                    <div className="nev-donut-body">
                      <SegmentedDonut
                        slices={view.computedSlices}
                        totalAmount={view.billed || view.slicesSum}
                        activeId={activeSliceId}
                        onHover={setActiveSliceId}
                      />
                      <div className="nev-donut-legend">
                        {view.computedSlices.map((slice) => (
                          <div
                            key={slice.id}
                            className={`nev-legend-item ${activeSliceId === slice.id ? 'active' : ''}`}
                            onMouseEnter={() => setActiveSliceId(slice.id)}
                            onMouseLeave={() => setActiveSliceId(null)}
                          >
                            <div className="nev-legend-left">
                              <span className="nev-legend-dot" style={{ background: slice.color }} />
                              <span>{slice.label}</span>
                            </div>
                            <span className="nev-legend-pct">{slice.percent.toFixed(0)}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>

                {/* Overdue Accounts Overview Card (2-3 rows with red balance font) */}
                <section className="panel nev-overdue-card">
                  <div className="nev-overdue-head">
                    <h3 className="nev-overdue-title">Overdue accounts</h3>
                    <Link
                      to={isCashier ? '/cashier/billing' : '/admin/delinquent'}
                      className="nev-overdue-link"
                    >
                      Review
                    </Link>
                  </div>

                  {view.delinquentList.length ? (
                    <div className="nev-overdue-list">
                      {view.delinquentList.map((item) => {
                        const hasPartial = item.bills.some((b) => Number(b.amount_paid || 0) > 0)
                        const statusLabel = hasPartial ? 'Partial' : 'Unpaid'
                        return (
                          <Link
                            key={item.customer.id}
                            to={`${isCashier ? '/cashier/billing' : '/admin/delinquent'}?customer=${item.customer.id}`}
                            className="nev-overdue-row"
                          >
                            <div className="nev-overdue-info">
                              <strong className="nev-overdue-name">
                                {item.customer.full_name || 'Consumer Account'}
                              </strong>
                              <span className="nev-overdue-meta">
                                CAN {item.customer.can || '—'} · {statusLabel}
                              </span>
                            </div>
                            <strong className="nev-overdue-amount">{peso(item.amount)}</strong>
                          </Link>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="nev-overdue-empty">No overdue accounts. All accounts are up to date.</p>
                  )}
                </section>
              </div>
            </div>
          </>
        )
      )}
    </div>
  )
}
