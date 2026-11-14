import { useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, UserPlus } from 'lucide-react'
import { useAdminData } from '../../hooks/useAdminData.js'
import { EmptyState, Loading, Notice, PageHeader } from '../../components/UI.jsx'
import StatusBadge from '../../components/StatusBadge.jsx'
import SearchSuggest from '../../components/SearchSuggest.jsx'
import TablePagination, { TableEmptyRows, useTablePagination } from '../../components/TablePagination.jsx'
import { peso, todayISO } from '../../lib/format.js'
import { getOverdueStage } from '../../lib/delinquency.js'

function getCustomerMeterCategory(customer) {
  const m = (customer.meter_no || '').trim().toLowerCase()
  const pt = (customer.property_type || '').toLowerCase()
  if (m.includes('flat') || m.includes('unmeter') || pt.includes('flat') || pt.includes('unmeter')) {
    return 'unmetered'
  }
  if (
    customer.status === 'pending' ||
    !m ||
    m === '—' ||
    m.includes('pending') ||
    m.includes('not recorded') ||
    m.includes('not assigned')
  ) {
    return 'pending'
  }
  return 'metered'
}

export default function Customers() {
  const { data, loading, error } = useAdminData()
  const navigate = useNavigate()
  const location = useLocation()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [classification, setClassification] = useState('all')
  const [standing, setStanding] = useState('all')
  const [barangay, setBarangay] = useState('all')
  const [meterStatus, setMeterStatus] = useState('all')
  const [sortBy, setSortBy] = useState('recent')

  const today = todayISO()

  // Map total balance and overdue information for each customer
  const { balances, customerOverdueMap, customerStageMap } = useMemo(() => {
    const balanceMap = new Map()
    const overdueMap = new Map()

    ;(data?.bills || []).forEach((b) => {
      const bal = Number(b.balance || 0)
      balanceMap.set(b.customer_id, (balanceMap.get(b.customer_id) || 0) + bal)
      if (bal > 0 && b.due_date && b.due_date < today) {
        const list = overdueMap.get(b.customer_id) || []
        list.push(b)
        overdueMap.set(b.customer_id, list)
      }
    })

    const stageMap = new Map()
    ;(data?.customers || []).forEach((customer) => {
      const overdue = overdueMap.get(customer.id) || []
      if (overdue.length > 0) {
        const oldest = overdue.reduce((d, b) => (d < b.due_date ? d : b.due_date), today)
        const days = Math.round((Date.parse(today + 'T00:00:00Z') - Date.parse(oldest + 'T00:00:00Z')) / 86400000)
        const stage = getOverdueStage(days, overdue.length)
        stageMap.set(customer.id, { days, count: overdue.length, stage })
      }
    })

    return { balances: balanceMap, customerOverdueMap: overdueMap, customerStageMap: stageMap }
  }, [data?.bills, data?.customers, today])

  const filteredRows = useMemo(() => (data?.customers || []).filter((customer) => {
    const query = search.trim().toLowerCase()
    const matchesSearch = !query || `${customer.full_name || ''} ${customer.can || ''} ${customer.meter_no || ''} ${customer.address || ''} ${customer.mobile_no || customer.contact_no || ''}`.toLowerCase().includes(query)
    if (!matchesSearch) return false

    // Account status
    if (status !== 'all' && customer.status !== status) return false

    // Classification
    const propType = (customer.property_type || '').toLowerCase()
    if (classification === 'residential' && !propType.includes('residen')) return false
    if (classification === 'commercial' && !propType.includes('commerc')) return false
    if (classification === 'institutional' && !propType.includes('gov') && !propType.includes('institut')) return false

    // Delinquency / Arrears Aging Standing
    const bal = balances.get(customer.id) || 0
    if (standing === 'settled' && bal > 0) return false
    if (standing === 'balance' && bal <= 0) return false
    if (standing === 'current') {
      const overdue = customerOverdueMap.get(customer.id) || []
      if (bal <= 0 || overdue.length > 0) return false
    }
    if (standing === 'past_due_1mo') {
      const stageInfo = customerStageMap.get(customer.id)
      if (bal <= 0 || !stageInfo || stageInfo.stage.key !== '1mo') return false
    }
    if (standing === 'delinquent_2mo') {
      const stageInfo = customerStageMap.get(customer.id)
      if (bal <= 0 || !stageInfo || (stageInfo.stage.level || 0) < 2) return false
    }
    if (standing === 'delinquent_3mo') {
      const stageInfo = customerStageMap.get(customer.id)
      if (bal <= 0 || !stageInfo || (stageInfo.stage.level || 0) < 3) return false
    }

    // Barangay (display empty for now if a specific barangay is selected)
    if (barangay !== 'all') {
      const customerBarangay = (customer.barangay || '').toLowerCase()
      if (!customerBarangay || customerBarangay !== barangay.toLowerCase()) return false
    }

    // Meter status
    if (meterStatus !== 'all') {
      const category = getCustomerMeterCategory(customer)
      if (category !== meterStatus) return false
    }

    return true
  }), [data?.customers, search, status, classification, standing, barangay, meterStatus, balances, customerOverdueMap, customerStageMap])

  // Sorting
  const rows = useMemo(() => {
    return [...filteredRows].sort((a, b) => {
      if (sortBy === 'balance-desc') {
        const balA = balances.get(a.id) || 0
        const balB = balances.get(b.id) || 0
        if (balB !== balA) return balB - balA
        return (a.full_name || '').localeCompare(b.full_name || '')
      }
      if (sortBy === 'balance-asc') {
        const balA = balances.get(a.id) || 0
        const balB = balances.get(b.id) || 0
        if (balA !== balB) return balA - balB
        return (a.full_name || '').localeCompare(b.full_name || '')
      }
      if (sortBy === 'name-asc') {
        return (a.full_name || '').localeCompare(b.full_name || '')
      }
      if (sortBy === 'name-desc') {
        return (b.full_name || '').localeCompare(a.full_name || '')
      }
      if (sortBy === 'can-asc') {
        return (a.can || '').localeCompare(b.can || '', undefined, { numeric: true })
      }
      // 'recent'
      return (b.created_at || '').localeCompare(a.created_at || '')
    })
  }, [filteredRows, sortBy, balances])

  const pagination = useTablePagination(rows, 10, [search, status, classification, standing, barangay, meterStatus, sortBy])
  const suggestions = rows.map((customer) => ({
    key: customer.id,
    value: customer.full_name,
    primary: customer.full_name,
    secondary: `CAN ${customer.can || 'Not assigned'} · Meter ${customer.meter_no || '—'}`,
    status: customer.status,
  }))
  const openCustomer = (customer) => navigate(customer.id)

  const stats = useMemo(() => {
    const customers = data?.customers || []
    const totalAccounts = customers.length
    const activeAccounts = customers.filter((c) => c.status === 'active').length
    const inactiveAccounts = totalAccounts - activeAccounts

    let totalArrears = 0
    let accountsWithBalance = 0
    customers.forEach((c) => {
      const bal = balances.get(c.id) || 0
      if (bal > 0) {
        totalArrears += bal
        accountsWithBalance += 1
      }
    })

    const delinquentAccounts = customers.filter((c) => {
      const stageInfo = customerStageMap.get(c.id)
      const bal = balances.get(c.id) || 0
      return bal > 0 && stageInfo && (stageInfo.stage.level || 0) >= 2
    }).length

    return {
      totalAccounts,
      activeAccounts,
      inactiveAccounts,
      totalArrears,
      accountsWithBalance,
      delinquentAccounts,
    }
  }, [data?.customers, balances, customerStageMap])

  const hasActiveFilters = Boolean(
    search ||
    status !== 'all' ||
    classification !== 'all' ||
    standing !== 'all' ||
    barangay !== 'all' ||
    meterStatus !== 'all' ||
    sortBy !== 'recent'
  )

  const resetFilters = () => {
    setSearch('')
    setStatus('all')
    setClassification('all')
    setStanding('all')
    setBarangay('all')
    setMeterStatus('all')
    setSortBy('recent')
  }

  return (
    <div className="page-content">
      <PageHeader title="Customer Accounts" />
      <Notice type="error">{error}</Notice>
      {loading && !data ? (
        <Loading />
      ) : (
        <div className="ledger-section-wrap">
          {/* Top KPI Cards - 4 Columns */}
          <div className="kpi-stats-grid">
            <div className="stat-card">
              <div className="stat-top-info">
                <span className="stat-label">Total Accounts</span>
                <span className="stat-subtext">
                  {stats.activeAccounts} Active · {stats.inactiveAccounts} Inactive
                </span>
              </div>
              <strong className="stat-value-bottom-right">{stats.totalAccounts}</strong>
            </div>

            <div className="stat-card">
              <div className="stat-top-info">
                <span className="stat-label">Active Connections</span>
                <span className="stat-subtext">Metered & running services</span>
              </div>
              <strong className="stat-value-bottom-right">{stats.activeAccounts}</strong>
            </div>

            <div className="stat-card">
              <div className="stat-top-info">
                <span className="stat-label">Total Arrears</span>
                <span className="stat-subtext">
                  {stats.accountsWithBalance === 0
                    ? 'All in good standing'
                    : `${stats.accountsWithBalance} accounts with balance`}
                </span>
              </div>
              <strong className="stat-value-bottom-right">{peso(stats.totalArrears)}</strong>
            </div>

            <div className="stat-card">
              <div className="stat-top-info">
                <span className="stat-label">Delinquent Accounts</span>
                <span className="stat-subtext">
                  {stats.delinquentAccounts === 0
                    ? 'No accounts at risk'
                    : `${stats.delinquentAccounts} accounts (2+ mos late)`}
                </span>
              </div>
              <strong className="stat-value-bottom-right">{stats.delinquentAccounts}</strong>
            </div>
          </div>
          <div className="external-table-toolbar">
            <SearchSuggest
              id="customer-table-search"
              label="Search customers"
              value={search}
              onChange={setSearch}
              placeholder="Search by customer name, CAN, meter, address, phone..."
              suggestions={suggestions}
            />

            <label className="table-filter">
              <span className="sr-only">Filter account status</span>
              <select value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="pending">Pending</option>
                <option value="disconnected">Disconnected</option>
              </select>
            </label>

            <label className="table-filter">
              <span className="sr-only">Filter classification</span>
              <select value={classification} onChange={(event) => setClassification(event.target.value)}>
                <option value="all">All classifications</option>
                <option value="residential">Residential</option>
                <option value="commercial">Commercial</option>
                <option value="institutional">Institutional / Gov</option>
              </select>
            </label>

            <label className="table-filter">
              <span className="sr-only">Filter balance & delinquency</span>
              <select value={standing} onChange={(event) => setStanding(event.target.value)}>
                <option value="all">All balances</option>
                <option value="settled">Settled (₱0 balance)</option>
                <option value="balance">With balance due</option>
                <option value="current">Current (Not overdue)</option>
                <option value="past_due_1mo">1 Month Overdue</option>
                <option value="delinquent_2mo">2+ Mos Delinquent</option>
                <option value="delinquent_3mo">3+ Mos Late</option>
              </select>
            </label>

            <label className="table-filter">
              <span className="sr-only">Filter barangay</span>
              <select value={barangay} onChange={(event) => setBarangay(event.target.value)}>
                <option value="all">All barangays</option>
              </select>
            </label>

            <label className="table-filter">
              <span className="sr-only">Filter meter status</span>
              <select value={meterStatus} onChange={(event) => setMeterStatus(event.target.value)}>
                <option value="all">All meter statuses</option>
                <option value="metered">Metered</option>
                <option value="unmetered">Unmetered / Flat Rate</option>
                <option value="pending">Pending Installation</option>
              </select>
            </label>

            <label className="table-filter">
              <span className="sr-only">Sort customers</span>
              <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
                <option value="recent">Sort: Most Recent</option>
                <option value="balance-desc">Sort: Highest Balance</option>
                <option value="balance-asc">Sort: Lowest Balance</option>
                <option value="name-asc">Sort: Name (A → Z)</option>
                <option value="name-desc">Sort: Name (Z → A)</option>
                <option value="can-asc">Sort: CAN / Account No.</option>
              </select>
            </label>

            {hasActiveFilters && (
              <button type="button" className="button button-ghost button-sm" onClick={resetFilters}>
                Reset
              </button>
            )}

            {(location.pathname.startsWith('/admin') || location.pathname.startsWith('/cashier')) && (
              <Link className="button" to={`${location.pathname.startsWith('/cashier') ? '/cashier' : '/admin'}/customers/new`} style={{ marginLeft: 'auto' }}>
                <UserPlus size={18} /> Add Existing Customer
              </Link>
            )}
          </div>

          <section className="panel customers-panel">
            {rows.length ? (
              <>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Customer Name</th>
                        <th>CAN</th>
                        <th>Meter No.</th>
                        <th>Service Address</th>
                        <th>Contact No.</th>
                        <th>Status</th>
                        <th>Balance Due</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagination.visibleRows.map((customer) => {
                        const bal = balances.get(customer.id) || 0
                        const stageInfo = customerStageMap.get(customer.id)
                        return (
                          <tr
                            className="clickable-row"
                            key={customer.id}
                            tabIndex="0"
                            onClick={() => openCustomer(customer)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') openCustomer(customer)
                            }}
                          >
                            <td><strong>{customer.full_name}</strong></td>
                            <td>{customer.can || '—'}</td>
                            <td>{customer.meter_no || '—'}</td>
                            <td title={customer.address || undefined}>
                              <span className="table-address-cell">{customer.address || '—'}</span>
                            </td>
                            <td>{customer.mobile_no || customer.contact_no || '—'}</td>
                            <td><StatusBadge status={customer.status} /></td>
                            <td>
                              {bal > 0 ? (
                                <div>
                                  <strong style={{ color: '#DC2626', fontWeight: 700 }}>
                                    {peso(bal)}
                                  </strong>
                                  {stageInfo?.stage && (
                                    <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>
                                      {stageInfo.stage.shortLabel}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span style={{ color: '#16A34A', fontSize: '12.5px', fontWeight: 600 }}>
                                  Settled
                                </span>
                              )}
                            </td>
                            <td>
                              <Link
                                className="link-button open-account-action"
                                to={customer.id}
                                onClick={(e) => e.stopPropagation()}
                              >
                                Open Account <ArrowRight size={15} />
                              </Link>
                            </td>
                          </tr>
                        )
                      })}
                      <TableEmptyRows count={pagination.emptyRowsCount} colSpan={8} />
                    </tbody>
                  </table>
                </div>
                <TablePagination {...pagination} total={rows.length} />
              </>
            ) : (
              <EmptyState
                title="No matching customers"
                description="Try clearing or adjusting your search and filter criteria."
              />
            )}
          </section>
        </div>
      )}
    </div>
  )
}
