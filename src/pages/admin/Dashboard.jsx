import { useMemo, useState } from 'react'
import { ArrowRight, ClipboardList, FilePlus2, Search, UserRoundSearch, Users, Wallet } from 'lucide-react'
import { Link } from 'react-router-dom'
import { getSummary } from '../../components/admin/Overview.jsx'
import StatusBadge from '../../components/StatusBadge.jsx'
import { Loading, Notice, PageHeader } from '../../components/UI.jsx'
import { useAdminData } from '../../hooks/useAdminData.js'
import { billStatus, dateLabel, dateISOManila, monthLabel, peso, todayISO } from '../../lib/format.js'

const quickActions = [
  { to: '/cashier/collection', label: 'Open Payment Counter', icon: Wallet, tone: 'tone-green' },
  { to: '/cashier/billing?mode=new', label: 'Create New Monthly Bill', icon: FilePlus2, tone: 'tone-blue' },
  { to: '/cashier/customers', label: 'View Customer Accounts', icon: Users, tone: 'tone-blue' },
  { to: '/cashier/requests', label: 'Applications & Concerns', icon: ClipboardList, tone: 'tone-orange' },
]

export default function Dashboard() {
  const { data, loading, error } = useAdminData()
  const summary = data ? getSummary(data) : null
  const todayPayments = data?.payments.filter((payment) => payment.paid_at && dateISOManila(payment.paid_at) === todayISO()) || []

  return <div className="page-content operations-dashboard">
    <PageHeader title="Walk-In Counter" />
    <Notice type="error">{error}</Notice>
    {loading && !data ? <Loading /> : data && <>
      <section className="operations-summary" aria-label="Today's operations summary">
        <div><span>Collected Today</span><strong>{peso(summary.collectedToday)}</strong><small>{todayPayments.length} payment{todayPayments.length === 1 ? '' : 's'} posted</small></div>
        <div><span>Bills Due Today</span><strong>{summary.dueToday}</strong><small>Accounts due for settlement</small></div>
        <div><span>Total Outstanding</span><strong>{peso(summary.outstanding)}</strong><small>{summary.overdue} overdue bill{summary.overdue === 1 ? '' : 's'}</small></div>
      </section>

      <section className="counter-quick-grid" aria-label="Counter tasks">
        {quickActions.map(({ to, label, icon: Icon, tone }) => (
          <Link key={to} to={to} className="counter-action-card">
            <span className={`counter-action-icon ${tone}`}><Icon size={20} /></span>
            <strong>{label}</strong>
            <ArrowRight size={18} className="counter-action-arrow" />
          </Link>
        ))}
      </section>

      <CustomerFinder data={data} />
    </>}
  </div>
}

function CustomerFinder({ data }) {
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const results = useMemo(() => data.customers.filter((customer) => {
    const haystack = `${customer.full_name} ${customer.can || ''} ${customer.meter_no || ''} ${customer.mobile_no || customer.contact_no || ''}`.toLowerCase()
    return haystack.includes(search.trim().toLowerCase())
  }).slice(0, 8), [data.customers, search])
  const selected = data.customers.find((customer) => customer.id === selectedId)
  const bills = selected ? data.bills.filter((bill) => bill.customer_id === selected.id) : []
  const latest = bills[0]
  const previous = bills[1]
  const billIds = new Set(bills.map((bill) => bill.id))
  const payment = selected ? data.payments.find((item) => billIds.has(item.bill_id)) : null
  const outstanding = bills.reduce((sum, bill) => sum + Number(bill.balance), 0)
  const chooseCustomer = (customer) => {
    setSearch(customer.full_name)
    setSelectedId(customer.id)
    setDropdownOpen(false)
  }

  return <section className="panel customer-finder">
    <header className="workspace-heading customer-lookup-heading">
      <div><h2>Quick Customer Lookup</h2></div>
      {selected && (
        <div className="lookup-quick-actions">
          {outstanding > 0 && <Link className="button" to={`/cashier/collection?customer=${selected.id}`}><Wallet size={18} /> Receive Payment ({peso(outstanding)})</Link>}
          <Link className="button button-outline" to={`/cashier/billing?customer=${selected.id}`}><FilePlus2 size={18} /> Encode New Bill</Link>
          <Link className="button button-ghost" to={`/cashier/customers/${selected.id}`}>Open Full Account <ArrowRight size={17} /></Link>
        </div>
      )}
    </header>
    <div className="customer-finder-tools">
      <div className="customer-search-combobox" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDropdownOpen(false) }}>
        <label className="search-field customer-finder-search"><Search size={20} /><span className="sr-only">Search customers</span><input autoFocus value={search} onFocus={() => setDropdownOpen(true)} onChange={(event) => { setSearch(event.target.value); setSelectedId(null); setDropdownOpen(true) }} placeholder="Type customer name, 9-digit CAN, meter number, or mobile number..." autoComplete="off" role="combobox" aria-autocomplete="list" aria-expanded={dropdownOpen} aria-controls="dashboard-customer-results" /></label>
        {dropdownOpen && search.trim() && <div className="customer-search-dropdown" id="dashboard-customer-results" role="listbox">
          {results.length ? results.map((customer) => <button type="button" role="option" aria-selected={selectedId === customer.id} key={customer.id} onMouseDown={(event) => event.preventDefault()} onClick={() => chooseCustomer(customer)}>
            <span className="customer-dropdown-identity"><strong>{customer.full_name}</strong><small>CAN {customer.can || 'Not assigned'} · Meter {customer.meter_no || '—'}</small></span>
            <StatusBadge status={customer.status} />
          </button>) : <div className="customer-dropdown-empty"><Search size={20} /><span><strong>No matching customer found</strong></span></div>}
        </div>}
      </div>
    </div>
    <div className="customer-finder-body">
      <div className="customer-preview">
        {!selected ? <div className="customer-preview-empty"><UserRoundSearch size={38} /><h3>Search a Walk-In Customer Above</h3><p>View their current balance, latest bill, and immediately receive payment or encode a meter reading.</p></div> : <>
          <div className="customer-identity"><div><h3>{selected.full_name}</h3><p>{selected.address || 'No service address recorded'}</p></div><StatusBadge status={selected.status} /></div>
          <dl className="customer-glance">
            <div><dt>CAN</dt><dd>{selected.can || 'Not assigned'}</dd></div><div><dt>Meter No.</dt><dd>{selected.meter_no || '—'}</dd></div>
            <div><dt>Contact No.</dt><dd>{selected.mobile_no || selected.contact_no || '—'}</dd></div><div><dt>Total Balance Due</dt><dd className={outstanding > 0 ? 'amount-due' : ''}>{peso(outstanding)}</dd></div>
          </dl>
          <div className="account-activity-grid">
            <ActivityCard title="Latest Bill" bill={latest} /><ActivityCard title="Previous Bill" bill={previous} />
            <article className="activity-card"><span>Latest Payment</span>{payment ? <><strong>{peso(payment.amount)}</strong><p>{dateLabel(payment.paid_at)} · {payment.method || 'Payment'}</p></> : <><strong>No payment yet</strong><p>No payment recorded on this account.</p></>}</article>
            <article className="activity-card"><span>Account Status</span><strong>{outstanding > 0 ? `${bills.filter((bill) => billStatus(bill) === 'Overdue').length} Overdue` : 'Account Clear'}</strong><p>{outstanding > 0 ? `${peso(outstanding)} unpaid across ${bills.filter((bill) => Number(bill.balance) > 0).length} bill(s).` : 'No unpaid bills.'}</p></article>
          </div>
        </>}
      </div>
    </div>
  </section>
}

function ActivityCard({ title, bill }) {
  return <article className="activity-card"><span>{title}</span>{bill ? <><strong>{peso(bill.amount)}</strong><p>{monthLabel(bill.billing_month)} · {billStatus(bill)}</p></> : <><strong>No bill</strong><p>No billing record available.</p></>}</article>
}

