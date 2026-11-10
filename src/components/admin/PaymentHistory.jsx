import { useState } from 'react'
import { Link } from 'react-router-dom'
import { dateLabel, peso } from '../../lib/format.js'
import SearchSuggest from '../SearchSuggest.jsx'
import TablePagination, { TableEmptyRows, useTablePagination } from '../TablePagination.jsx'

export default function PaymentHistory({ data, base }) {
  const [search, setSearch] = useState('')
  const [method, setMethod] = useState('')
  const customerName = (payment) => data.customers.find((customer) => customer.id === payment.customer_id)?.full_name || 'Customer'
  const rows = data.payments.filter((payment) => `${payment.or_number} ${customerName(payment)}`.toLowerCase().includes(search.toLowerCase()) && (!method || payment.method === method))
  const pagination = useTablePagination(rows, 10, [search, method])
  const suggestions = rows.map((payment) => ({ key: payment.id, value: payment.or_number || customerName(payment), primary: customerName(payment), secondary: `${payment.or_number || 'No OR'} · ${dateLabel(payment.paid_at)} · ${peso(payment.amount)}`, status: payment.method }))
  return <section className="panel ledger-panel">
    <div className="panel-heading ledger-heading"><h2>Payment history</h2><div className="table-toolbar"><SearchSuggest id="receipt-search" label="Search receipts" value={search} onChange={setSearch} placeholder="OR or customer" suggestions={suggestions} /><label className="table-filter"><span className="sr-only">Payment method</span><select value={method} onChange={(event) => setMethod(event.target.value)}><option value="">All methods</option>{['Cash', 'GCash', 'Bank Transfer'].map((item) => <option key={item}>{item}</option>)}</select></label></div></div>
    <div className="table-scroll"><table><thead><tr><th>OR number</th><th>Date</th><th>Customer</th><th>Method</th><th>Amount</th><th>Status</th><th>Receipt</th></tr></thead><tbody>{pagination.visibleRows.map((payment) => <tr key={payment.id}><td>{payment.or_number}</td><td>{dateLabel(payment.paid_at)}</td><td>{customerName(payment)}</td><td>{payment.method}</td><td>{peso(payment.amount)}</td><td>{payment.status}</td><td><Link to={`${base}/receipts/${payment.id}`}>View / Print</Link></td></tr>)}<TableEmptyRows count={pagination.emptyRowsCount} colSpan={7} /></tbody></table></div><TablePagination {...pagination} total={rows.length} />
  </section>
}
