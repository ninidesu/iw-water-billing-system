import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, Eye, Pencil, Printer, User, Wallet, X } from 'lucide-react'
import { billStatus, dateLabel, monthLabel, peso, vatBreakdown } from '../../lib/format.js'
import StatusBadge from '../StatusBadge.jsx'
import TablePagination, { TableEmptyRows, useTablePagination } from '../TablePagination.jsx'
import SearchSuggest from '../SearchSuggest.jsx'
import { EmptyState } from '../UI.jsx'

export default function BillingLedger({ bills, showSearch = true, printBasePath = '/cashier', canCollect = true, onEncodeNew, onEncodeBill }) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [month, setMonth] = useState('')
  const [consumption, setConsumption] = useState('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [selectedBill, setSelectedBill] = useState(null)

  const collectionPath = printBasePath === '/admin' ? '/admin/collections' : '/cashier/collection'

  // Close drawer on Escape key
  useEffect(() => {
    if (!selectedBill) return
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setSelectedBill(null)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedBill])

  // Extract unique billing months sorted descending
  const months = useMemo(() => {
    const set = new Set(bills.map((b) => b.billing_month).filter(Boolean))
    return Array.from(set).sort((a, b) => b.localeCompare(a))
  }, [bills])

  const filtered = useMemo(() => bills.filter((bill) => {
    const matchesSearch = `${bill.customer?.full_name || ''} ${bill.customer?.can || ''} ${bill.customer?.meter_no || ''} ${bill.bill_no}`.toLowerCase().includes(search.toLowerCase())
    if (!matchesSearch) return false

    if (status !== 'all' && billStatus(bill).toLowerCase() !== status) return false
    if (month && bill.billing_month !== month) return false

    const usage = Number(bill.water_used || bill.consumption || 0)
    if (consumption === 'zero' && usage > 0) return false
    if (consumption === 'normal' && (usage <= 0 || usage > 30)) return false
    if (consumption === 'high' && usage <= 30) return false

    if (fromDate && bill.due_date && bill.due_date < fromDate) return false
    if (toDate && bill.due_date && bill.due_date > toDate) return false

    return true
  }), [bills, search, status, month, consumption, fromDate, toDate])

  const pagination = useTablePagination(filtered, 10, [search, status, month, consumption, fromDate, toDate])
  const suggestions = filtered.map((bill) => ({ key: bill.id, value: bill.bill_no || bill.customer?.full_name || '', primary: bill.customer?.full_name || 'Customer unavailable', secondary: `${bill.bill_no} · CAN ${bill.customer?.can || '—'} · Meter ${bill.customer?.meter_no || '—'}`, status: billStatus(bill) }))

  const hasActiveFilters = Boolean(search || status !== 'all' || month || consumption !== 'all' || fromDate || toDate)
  const resetFilters = () => {
    setSearch('')
    setStatus('all')
    setMonth('')
    setConsumption('all')
    setFromDate('')
    setToDate('')
  }

  const selectedVat = selectedBill && selectedBill.amount != null ? vatBreakdown(selectedBill.water_charge || selectedBill.amount || 0) : null

  const stats = useMemo(() => {
    const targetBills = month ? bills.filter((b) => b.billing_month === month) : bills
    let totalBilled = 0
    let totalCollected = 0
    let totalBalance = 0
    let unpaidCount = 0
    let totalVolume = 0
    let pendingCount = 0

    targetBills.forEach((b) => {
      const isPending = b.status === 'pending' || b.water_used == null || b.amount == null
      if (isPending) {
        pendingCount += 1
        const bal = Number(b.balance || 0)
        if (bal > 0) totalBalance += bal
      } else {
        const amount = Number(b.water_charge || b.amount || 0)
        const bal = Number(b.balance || 0)
        const paid = Number(b.paid_amount ?? (amount - bal))
        totalBilled += amount
        totalCollected += Math.max(0, paid)
        totalBalance += Math.max(0, bal)
        if (bal > 0) unpaidCount += 1
        totalVolume += Number(b.water_used || b.consumption || 0)
      }
    })

    const efficiency = totalBilled > 0 ? ((totalCollected / totalBilled) * 100).toFixed(1) : '0.0'

    return {
      billCount: targetBills.length,
      totalBilled,
      totalCollected,
      totalBalance,
      unpaidCount,
      totalVolume,
      efficiency,
      pendingCount,
    }
  }, [bills, month])

  return (
    <div className="ledger-section-wrap">
      {/* Top KPI Cards - 4 Columns */}
      <div className="kpi-stats-grid">
        <div className="stat-card">
          <div className="stat-top-info">
            <span className="stat-label">Total Billed Amount</span>
            <span className="stat-subtext">
              {stats.pendingCount > 0
                ? `${stats.billCount} bills (${stats.pendingCount} pending encoding)`
                : (month ? `${stats.billCount} bills · ${monthLabel(month)}` : `${stats.billCount} bills generated`)}
            </span>
          </div>
          <strong className="stat-value-bottom-right">{peso(stats.totalBilled)}</strong>
        </div>

        <div className="stat-card">
          <div className="stat-top-info">
            <span className="stat-label">Collected Revenue</span>
            <span className="stat-subtext">{stats.efficiency}% collection efficiency</span>
          </div>
          <strong className="stat-value-bottom-right">{peso(stats.totalCollected)}</strong>
        </div>

        <div className="stat-card">
          <div className="stat-top-info">
            <span className="stat-label">Unpaid Bill Balance</span>
            <span className="stat-subtext">
              {stats.unpaidCount === 0 ? 'All bills settled' : `${stats.unpaidCount} bills pending payment`}
            </span>
          </div>
          <strong className="stat-value-bottom-right">{peso(stats.totalBalance)}</strong>
        </div>

        <div className="stat-card">
          <div className="stat-top-info">
            <span className="stat-label">Billed Water Usage</span>
            <span className="stat-subtext">Total volume recorded</span>
          </div>
          <strong className="stat-value-bottom-right">
            {stats.totalVolume.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m³
          </strong>
        </div>
      </div>

      {showSearch && (
        <div className="external-table-toolbar">
          <SearchSuggest id="bill-search" label="Search bills" value={search} onChange={setSearch} placeholder="Search customer, CAN, meter, or bill no." suggestions={suggestions} />
          
          <label className="table-filter">
            <span className="sr-only">Filter bill status</span>
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="all">All statuses</option>
              <option value="pending">Pending Encoding</option>
              <option value="unpaid">Unpaid</option>
              <option value="partial">Partial</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
            </select>
          </label>

          <label className="table-filter">
            <span className="sr-only">Billing Month</span>
            <select value={month} onChange={(event) => setMonth(event.target.value)}>
              <option value="">All months</option>
              {months.map((m) => (
                <option key={m} value={m}>{monthLabel(m)}</option>
              ))}
            </select>
          </label>

          <label className="table-filter">
            <span className="sr-only">Consumption QC</span>
            <select value={consumption} onChange={(event) => setConsumption(event.target.value)}>
              <option value="all">All usage</option>
              <option value="zero">Zero usage (0 m³)</option>
              <option value="normal">Normal (1–30 m³)</option>
              <option value="high">High usage (&gt;30 m³)</option>
            </select>
          </label>

          <div className="table-date-range">
            <input
              type="date"
              aria-label="Due from date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              title="Due date from"
            />
            <span>to</span>
            <input
              type="date"
              aria-label="Due to date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              title="Due date to"
            />
          </div>

          {hasActiveFilters && (
            <button type="button" className="button button-ghost button-sm" onClick={resetFilters}>
              Reset
            </button>
          )}

          {onEncodeNew && (
            <button type="button" className="button" onClick={onEncodeNew}>
              Encode New Bill
            </button>
          )}
        </div>
      )}

      <section className="panel ledger-panel">
        {filtered.length ? (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>CAN / Meter</th>
                    <th>Month</th>
                    <th>Usage</th>
                    <th>Amount</th>
                    <th>Paid</th>
                    <th>Balance</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pagination.visibleRows.map((bill) => {
                    const isPending = bill.status === 'pending' || bill.water_used == null || bill.amount == null
                    return (
                      <tr key={bill.id}>
                        <td>
                          <strong>{bill.customer?.full_name || 'Customer unavailable'}</strong>
                          <small>{bill.customer?.address || '—'}</small>
                        </td>
                        <td>
                          <strong>{bill.customer?.can || '—'}</strong>
                          <small>Meter {bill.customer?.meter_no || '—'}</small>
                        </td>
                        <td>{monthLabel(bill.billing_month)}</td>
                        <td>{isPending ? '—' : `${Number(bill.water_used).toFixed(2)} m³`}</td>
                        <td className="money-cell">{isPending ? '—' : peso(bill.amount)}</td>
                        <td>{isPending ? '—' : peso(bill.amount_paid)}</td>
                        <td className="money-cell" style={{ color: Number(bill.balance) > 0 ? '#DC2626' : undefined, fontWeight: Number(bill.balance) > 0 ? 700 : undefined }}>
                          {isPending ? (Number(bill.balance) > 0 ? peso(bill.balance) : '—') : peso(bill.balance)}
                        </td>
                        <td><StatusBadge bill={bill} /></td>
                        <td>
                          <div className="table-actions">
                            <button
                              type="button"
                              className="table-view-btn"
                              onClick={() => setSelectedBill(bill)}
                              title="View bill details"
                            >
                              <Eye size={13} /> View
                            </button>
                            <Link
                              className="table-print-btn"
                              to={`${printBasePath}/bills/${bill.id}/print`}
                              title="Print official bill"
                            >
                              <Printer size={13} /> Print Bill
                            </Link>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  <TableEmptyRows count={pagination.emptyRowsCount} colSpan={9} />
                </tbody>
              </table>
            </div>
            <TablePagination {...pagination} total={filtered.length} />
          </>
        ) : (
          <EmptyState
            title={bills.length ? 'No matching bills' : 'No bills yet'}
            description={bills.length ? 'Try another search or status filter.' : 'Click "Encode New Bill" above to issue a monthly statement.'}
          />
        )}
      </section>

      {/* Right Side Bill Detail View Drawer */}
      {selectedBill && (
        <div className="bill-drawer-backdrop" onClick={() => setSelectedBill(null)}>
          <aside
            className="bill-detail-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={`Bill ${selectedBill.bill_no}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="drawer-header">
              <div>
                <span className="drawer-subtitle">BILL DETAILS</span>
                <h2>Bill {selectedBill.bill_no}</h2>
              </div>
              <div className="drawer-header-actions">
                <StatusBadge bill={selectedBill} />
                <button
                  type="button"
                  className="drawer-close-btn"
                  onClick={() => setSelectedBill(null)}
                  aria-label="Close panel"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="drawer-body">
              {/* Customer Info Card */}
              <div className="drawer-customer-card">
                <div className="customer-avatar">
                  {selectedBill.customer?.full_name?.charAt(0).toUpperCase() || 'C'}
                </div>
                <div className="customer-info">
                  <h3>{selectedBill.customer?.full_name || 'Customer Record'}</h3>
                  <p>
                    CAN: <strong>{selectedBill.customer?.can || '—'}</strong> · Meter: <strong>{selectedBill.customer?.meter_no || '—'}</strong>
                  </p>
                  <small>{selectedBill.customer?.address || 'No service address recorded'}</small>
                </div>
              </div>

              {/* Outstanding Balance Callout / Pending Notice */}
              {selectedBill.status === 'pending' || selectedBill.water_used == null || selectedBill.amount == null ? (
                <div className="drawer-balance-card pending-card">
                  <div className="balance-meta">
                    <span>Billing Status</span>
                    <strong>Pending Meter Reading</strong>
                  </div>
                  <div className="balance-tag pending-tag">
                    Needs Encoding
                  </div>
                </div>
              ) : (
                <div className={`drawer-balance-card ${Number(selectedBill.balance) > 0 ? 'unpaid' : 'paid'}`}>
                  <div className="balance-meta">
                    <span>Current Bill Balance</span>
                    <strong>{peso(selectedBill.balance)}</strong>
                  </div>
                  <div className="balance-tag">
                    {Number(selectedBill.balance) > 0 ? 'Unpaid Balance' : 'Settled in Full'}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="drawer-actions">
                {(selectedBill.status === 'pending' || selectedBill.water_used == null || selectedBill.amount == null) ? (
                  <button
                    type="button"
                    className="button button-full drawer-encode-btn"
                    onClick={() => {
                      const b = selectedBill
                      setSelectedBill(null)
                      if (onEncodeBill) {
                        onEncodeBill(b)
                      } else if (onEncodeNew) {
                        onEncodeNew(b)
                      }
                    }}
                  >
                    <Pencil size={16} /> Encode SOA
                  </button>
                ) : (
                  canCollect && Number(selectedBill.balance) > 0 && (
                    <Link
                      className="button button-full drawer-collect-btn"
                      to={`${collectionPath}?customer=${selectedBill.customer_id}&bill=${selectedBill.id}`}
                    >
                      <Wallet size={16} /> Collect Payment ({peso(selectedBill.balance)})
                    </Link>
                  )
                )}

                <div className="drawer-secondary-actions">
                  <Link
                    className="drawer-print-btn"
                    to={`${printBasePath}/bills/${selectedBill.id}/print`}
                  >
                    <Printer size={15} /> Print Bill
                  </Link>
                  <Link
                    className="drawer-cust-btn"
                    to={`${printBasePath === '/admin' ? '/admin' : '/cashier'}/customers/${selectedBill.customer_id}`}
                  >
                    <User size={15} /> Customer Account <ArrowUpRight size={14} />
                  </Link>
                </div>
              </div>

              {/* Meter Reading & Usage Details */}
              <div className="drawer-section">
                <h4>Meter Reading & Consumption</h4>
                <dl className="drawer-data-grid">
                  <div>
                    <dt>Billing Month</dt>
                    <dd><strong>{monthLabel(selectedBill.billing_month)}</strong></dd>
                  </div>
                  <div>
                    <dt>Due Date</dt>
                    <dd>{dateLabel(selectedBill.due_date)}</dd>
                  </div>
                  <div>
                    <dt>Previous Reading</dt>
                    <dd>{selectedBill.previous_reading != null ? `${Number(selectedBill.previous_reading).toFixed(2)} m³` : '—'}</dd>
                  </div>
                  <div>
                    <dt>Current Reading</dt>
                    <dd>
                      {(selectedBill.status === 'pending' || selectedBill.water_used == null)
                        ? '—'
                        : `${Number(selectedBill.present_reading || selectedBill.current_reading || 0).toFixed(2)} m³`}
                    </dd>
                  </div>
                  <div className="wide-data-item">
                    <dt>Billed Consumption</dt>
                    <dd className="highlight-usage">
                      {(selectedBill.status === 'pending' || selectedBill.water_used == null)
                        ? '—'
                        : `${Number(selectedBill.water_used || selectedBill.consumption || 0).toFixed(2)} m³`}
                    </dd>
                  </div>
                </dl>
              </div>

              {/* Financial Breakdown */}
              <div className="drawer-section">
                <h4>Charge Breakdown</h4>
                <div className="drawer-charge-list">
                  <div className="charge-row">
                    <span>Water Charge (VAT Inclusive)</span>
                    <strong>
                      {(selectedBill.status === 'pending' || selectedBill.amount == null)
                        ? '—'
                        : peso(selectedBill.water_charge || selectedBill.amount)}
                    </strong>
                  </div>
                  {selectedVat && (
                    <>
                      <div className="charge-row sub-row">
                        <span>• VATable Sale</span>
                        <span>{peso(selectedVat.vatableSale)}</span>
                      </div>
                      <div className="charge-row sub-row">
                        <span>• 12% VAT (Inclusive)</span>
                        <span>{peso(selectedVat.vatAmount)}</span>
                      </div>
                    </>
                  )}
                  {Number(selectedBill.previous_balance || 0) > 0 && (
                    <div className="charge-row">
                      <span>Previous Unpaid Balance</span>
                      <strong>{peso(selectedBill.previous_balance)}</strong>
                    </div>
                  )}
                  <div className="charge-row total-row">
                    <span>Total Amount Due</span>
                    <strong>
                      {(selectedBill.status === 'pending' || selectedBill.amount == null)
                        ? (Number(selectedBill.previous_balance || 0) > 0 ? peso(selectedBill.previous_balance) : '—')
                        : peso(selectedBill.amount)}
                    </strong>
                  </div>
                  <div className="charge-row paid-row">
                    <span>Amount Paid</span>
                    <span>
                      {(selectedBill.status === 'pending' || selectedBill.amount == null)
                        ? '—'
                        : `- ${peso(selectedBill.amount_paid)}`}
                    </span>
                  </div>
                  <div className="charge-row balance-row">
                    <span>Outstanding Balance</span>
                    <strong>
                      {(selectedBill.status === 'pending' || selectedBill.amount == null)
                        ? (Number(selectedBill.balance || 0) > 0 ? peso(selectedBill.balance) : '—')
                        : peso(selectedBill.balance)}
                    </strong>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}
