import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowUpRight, Check, HelpCircle, Pencil, Wallet, X } from 'lucide-react'
import { useAdminData } from '../../hooks/useAdminData.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { supabase } from '../../lib/supabaseClient.js'
import { billStatus, dateLabel, monthLabel, peso, vatBreakdown } from '../../lib/format.js'
import { EmptyState, Loading, Notice } from '../../components/UI.jsx'
import StatusBadge from '../../components/StatusBadge.jsx'
import TablePagination, { TableEmptyRows, useTablePagination } from '../../components/TablePagination.jsx'
import CustomerRecords from '../../components/admin/CustomerRecords.jsx'

export default function CustomerAccount() {
  const { id } = useParams()
  const location = useLocation()
  const { profile } = useAuth()
  const { data, loading, error, refresh } = useAdminData()
  const [tab,setTab] = useState('billing')
  const [isEditing, setIsEditing] = useState(false)
  const [editBusy, setEditBusy] = useState(false)
  const [editError, setEditError] = useState('')
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    type: '',
    mobile: '',
    email: '',
    address: '',
    meter_no: ''
  })
  const customer = data?.customers?.find((row) => String(row.id).toLowerCase() === String(id).toLowerCase() || (row.can && String(row.can).toLowerCase() === String(id).toLowerCase()))

  const startEditing = () => {
    if (!customer) return
    setFormData({
      name: customer.full_name || '',
      type: customer.property_type || 'Residential',
      mobile: customer.mobile_no || customer.contact_no || '',
      email: customer.email || '',
      address: customer.address || '',
      meter_no: customer.meter_no || ''
    })
    setEditError('')
    setIsEditing(true)
  }

  const cancelEditing = () => {
    setIsEditing(false)
    setShowConfirmModal(false)
    setEditError('')
  }

  // Close confirmation modal on Escape key
  useEffect(() => {
    if (!showConfirmModal) return
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !editBusy) setShowConfirmModal(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showConfirmModal, editBusy])

  const handleSaveClick = (e) => {
    if (e) e.preventDefault()
    if (!customer) return
    const name = formData.name.trim()
    const mobile = formData.mobile.trim()
    const address = formData.address.trim()

    if (!name) {
      setEditError('Customer full name is required.')
      return
    }
    if (!mobile) {
      setEditError('Mobile number is required.')
      return
    }
    if (!address) {
      setEditError('Service address is required.')
      return
    }

    setEditError('')
    setShowConfirmModal(true)
  }

  const executeSaveInfo = async () => {
    if (!customer) return
    setEditBusy(true)
    setEditError('')
    try {
      const name = formData.name.trim()
      const mobile = formData.mobile.trim()
      const email = formData.email.trim()
      const address = formData.address.trim()
      const type = formData.type || 'Residential'
      const meter_no = formData.meter_no.trim()

      const payload = {
        name,
        mobile,
        email,
        address,
        type
      }

      const r = await supabase.rpc('save_customer_record', {
        p_customer: customer.id,
        p_action: 'profile',
        p_data: payload
      })
      if (r.error) throw r.error

      if (meter_no !== (customer.meter_no || '')) {
        await supabase.from('customers').update({ meter_no: meter_no || null }).eq('id', customer.id)
        if (customer.account_id) {
          await supabase.from('contract_accounts').update({ meter_no: meter_no || null }).eq('id', customer.account_id)
        }
      }

      await refresh()
      setShowConfirmModal(false)
      setIsEditing(false)
    } catch (err) {
      setEditError(err.message || 'Failed to update customer information.')
      setShowConfirmModal(false)
    } finally {
      setEditBusy(false)
    }
  }
  const bills = useMemo(() => (data?.bills || []).filter((bill) => bill.customer_id === customer?.id || bill.customer_id === id), [data, customer?.id, id])
  const outstanding = useMemo(() => bills.reduce((sum, bill) => sum + Number(bill.balance || 0), 0), [bills])
  const [billingSearch, setBillingSearch] = useState('')
  const [billingStatus, setBillingStatus] = useState('')
  const filteredBills = useMemo(() => bills.filter((bill) => {
    const matchesSearch = `${bill.bill_no || ''} ${monthLabel(bill.billing_month)}`.toLowerCase().includes(billingSearch.toLowerCase())
    return matchesSearch && (!billingStatus || billStatus(bill).toLowerCase() === billingStatus)
  }), [bills, billingSearch, billingStatus])
  const [selectedId, setSelectedId] = useState('')
  const [items, setItems] = useState([])
  const [itemError, setItemError] = useState('')
  const pagination = useTablePagination(filteredBills, 10, [id, billingSearch, billingStatus])
  const selected = bills.find((bill) => bill.id === selectedId) || bills[0]
  const selectedVat = vatBreakdown(selected?.water_charge ?? selected?.amount ?? 0)
  const base = location.pathname.startsWith('/admin') ? '/admin' : '/cashier'
  const collectionPath = base === '/admin' ? '/admin/collections' : '/cashier/collection'

  useEffect(() => { setSelectedId(bills[0]?.id || '') }, [id, bills[0]?.id])
  useEffect(() => {
    if (!selected?.id) { setItems([]); return }
    let active = true
    setItemError('')
    supabase.from('bill_items').select('*').eq('bill_id', selected.id).order('id').then(({ data: rows, error: loadError }) => {
      if (!active) return
      if (loadError) setItemError(loadError.message)
      else setItems(rows || [])
    })
    return () => { active = false }
  }, [selected?.id])

  if (loading && !data) return <div className="page-content"><Loading /></div>
  if (!customer) {
    if (loading) return <div className="page-content"><Loading /></div>
    return (
      <div className="page-content">
        <h1>Service account not found</h1>
        <p style={{ color: '#64748B', margin: '8px 0 16px' }}>Could not find an account for ID "{id}".</p>
        <Link className="button button-ghost" to={`${base}/customers`}>
          <ArrowLeft size={18} /> Back to Customer Accounts
        </Link>
      </div>
    )
  }

  return <div className="page-content customer-account-page">
    <Link className="back-link" to={`${base}/customers`}><ArrowLeft size={18} /> Back to Customer Accounts</Link>
    <Notice type="error">{error}</Notice>
    <section className={`panel account-information ${isEditing ? 'is-editing-account' : ''}`} aria-labelledby="account-information-heading">
      <form onSubmit={handleSaveClick}>
        <div className="account-information-heading">
          <div>
            <div className="account-title-row">
              {isEditing ? (
                <input
                  type="text"
                  className="inline-title-input"
                  value={formData.name}
                  onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                  required
                  placeholder="Full name"
                  aria-label="Customer full name"
                />
              ) : (
                <h1 id="account-information-heading">{customer.full_name}</h1>
              )}
              <StatusBadge status={customer.status} />
            </div>
          </div>
          <div className="account-quick-actions">
            {(profile?.role === 'admin' || profile?.role === 'cashier') && (
              isEditing ? (
                <>
                  <button
                    type="button"
                    className="button button-ghost"
                    disabled={editBusy}
                    onClick={cancelEditing}
                  >
                    <X size={16} /> Cancel
                  </button>
                  <button
                    type="submit"
                    className="button"
                    disabled={editBusy}
                  >
                    <Check size={16} /> {editBusy ? 'Saving…' : 'Save Changes'}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="button"
                  onClick={startEditing}
                >
                  <Pencil size={16} /> Edit Information
                </button>
              )
            )}
          </div>
        </div>
        {editError && <Notice type="error">{editError}</Notice>}
        <dl className="account-information-grid">
          <div>
            <dt>Contract Account No. (CAN)</dt>
            <dd>
              {isEditing ? (
                <input
                  type="text"
                  readOnly
                  value={customer.can || 'Not assigned'}
                  className="inline-edit-input is-readonly"
                  title="System-assigned CAN"
                />
              ) : (
                customer.can || 'Not assigned'
              )}
            </dd>
          </div>
          <div>
            <dt>Property Type</dt>
            <dd>
              {isEditing ? (
                <select
                  className="inline-edit-select"
                  value={formData.type}
                  onChange={(e) => setFormData((p) => ({ ...p, type: e.target.value }))}
                  required
                >
                  <option value="">Select Property Type</option>
                  {['Residential', 'Commercial', 'Institutional', 'Government', 'Other'].map((x) => (
                    <option key={x} value={x}>{x}</option>
                  ))}
                </select>
              ) : (
                customer.property_type || 'Not recorded'
              )}
            </dd>
          </div>
          <div>
            <dt>Mobile Number</dt>
            <dd>
              {isEditing ? (
                <input
                  type="tel"
                  className="inline-edit-input"
                  value={formData.mobile}
                  onChange={(e) => setFormData((p) => ({ ...p, mobile: e.target.value }))}
                  required
                  placeholder="09170000000"
                />
              ) : (
                customer.mobile_no || customer.contact_no || 'Not recorded'
              )}
            </dd>
          </div>
          <div>
            <dt>Email Address</dt>
            <dd>
              {isEditing ? (
                <input
                  type="email"
                  className="inline-edit-input"
                  value={formData.email}
                  onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))}
                  placeholder="email@example.com"
                />
              ) : (
                customer.email || 'Not recorded'
              )}
            </dd>
          </div>
          <div className="account-info-wide">
            <dt>Service Address</dt>
            <dd>
              {isEditing ? (
                <input
                  type="text"
                  className="inline-edit-input"
                  value={formData.address}
                  onChange={(e) => setFormData((p) => ({ ...p, address: e.target.value }))}
                  required
                  placeholder="Service address"
                />
              ) : (
                customer.address || 'Not recorded'
              )}
            </dd>
          </div>
          <div>
            <dt>Meter Number</dt>
            <dd>
              {isEditing ? (
                <input
                  type="text"
                  className="inline-edit-input"
                  value={formData.meter_no}
                  onChange={(e) => setFormData((p) => ({ ...p, meter_no: e.target.value }))}
                  placeholder="Meter number"
                />
              ) : (
                customer.meter_no || 'Not recorded'
              )}
            </dd>
          </div>
          <div>
            <dt>Initial Reading</dt>
            <dd>
              {isEditing ? (
                <input
                  type="text"
                  readOnly
                  value={customer.initial_reading != null ? `${Number(customer.initial_reading).toFixed(2)} m³` : 'Not recorded'}
                  className="inline-edit-input is-readonly"
                  title="Initial reading at registration"
                />
              ) : (
                customer.initial_reading != null ? `${Number(customer.initial_reading).toFixed(2)} m³` : 'Not recorded'
              )}
            </dd>
          </div>
        </dl>
      </form>
    </section>
    <CustomerRecords customer={customer} bills={bills} payments={(data?.payments||[]).filter(p=>p.customer_id===id)} onSaved={refresh} tab={tab} setTab={setTab} base={base}/>
    <div className="customer-billing-layout" hidden={tab!=='billing'} style={tab!=='billing'?{display:'none'}:undefined}>
      <section className="panel customer-bill-history"><div className="record-table-filters"><label><span>Search Billing</span><input value={billingSearch} onChange={event=>setBillingSearch(event.target.value)} placeholder="Bill number or month" /></label><label><span>Status</span><select value={billingStatus} onChange={event=>setBillingStatus(event.target.value)}><option value="">All statuses</option><option value="paid">Paid</option><option value="partial">Partial</option><option value="unpaid">Unpaid</option><option value="overdue">Overdue</option></select></label></div>{filteredBills.length ? <><div className="table-scroll"><table><thead><tr><th>Billing Month</th><th>Bill No.</th><th>Usage</th><th>Amount</th><th>Balance</th><th>Status</th></tr></thead><tbody>{pagination.visibleRows.map((bill) => <tr className={`clickable-row ${selected?.id === bill.id ? 'selected-row' : ''}`} key={bill.id} tabIndex="0" onClick={() => setSelectedId(bill.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setSelectedId(bill.id) }}><td><strong>{monthLabel(bill.billing_month)}</strong></td><td>{bill.bill_no}</td><td>{Number(bill.usage_m3 ?? bill.water_used).toFixed(2)} m³</td><td>{peso(bill.amount)}</td><td style={{ color: Number(bill.balance) > 0 ? '#DC2626' : undefined, fontWeight: Number(bill.balance) > 0 ? 700 : undefined }}>{peso(bill.balance)}</td><td><StatusBadge bill={bill} /></td></tr>)}<TableEmptyRows count={pagination.emptyRowsCount} colSpan={6} /></tbody></table></div><TablePagination {...pagination} total={filteredBills.length} /></> : <EmptyState title={bills.length?'No matching billings':'No billing history'} description={bills.length?'Adjust the billing filters and try again.':'This service account has no issued bills yet.'} />}</section>
      <aside className="panel selected-bill-panel">{selected ? <><div className="selected-bill-heading"><div><span>Selected Bill</span><h2>{monthLabel(selected.billing_month)}</h2><p>{selected.bill_no}</p></div><StatusBadge bill={selected} /></div><dl className="bill-info-list"><div><dt>Previous Reading</dt><dd>{Number(selected.previous_reading).toFixed(2)} m³</dd></div><div><dt>Current Reading</dt><dd>{Number(selected.current_reading).toFixed(2)} m³</dd></div><div><dt>Consumption</dt><dd>{Number(selected.usage_m3 ?? selected.water_used).toFixed(2)} m³</dd></div><div><dt>Due Date</dt><dd>{dateLabel(selected.due_date)}</dd></div></dl><Notice type="error">{itemError}</Notice><div className="bill-item-list"><h3>Charge Details</h3>{items.map((item) => <div key={item.id}><span>{item.description}{item.unit_rate != null && <small>{Number(item.quantity || 0).toFixed(2)} m³ × {peso(item.unit_rate)}</small>}</span><strong>{peso(item.amount)}</strong></div>)}<div><span>VATable Sale</span><strong>{peso(selectedVat.vatableSale)}</strong></div><div><span>12% VAT (Inclusive)</span><strong>{peso(selectedVat.vatAmount)}</strong></div><div><span>Water Charge (VAT Inclusive)</span><strong>{peso(selected.water_charge ?? selected.amount)}</strong></div><div><span>Previous Balance</span><strong>{peso(selected.previous_balance)}</strong></div><div><span>Amount Paid</span><strong>- {peso(selected.amount_paid)}</strong></div></div><div className="selected-bill-total"><span>Current Balance</span><strong style={{ color: Number(selected.balance) > 0 ? '#DC2626' : undefined }}>{peso(selected.balance)}</strong></div><div className="selected-bill-actions">{Number(selected.balance) > 0 && <Link className="button button-full" to={`${collectionPath}?customer=${customer.id}`}><Wallet size={17} /> Receive Payment</Link>}<Link className="button button-outline button-full" to={`${base}/bills/${selected.id}/print`}>Print / Export PDF <ArrowUpRight size={17} /></Link></div></> : <EmptyState title="Select a billing" />}</aside>
    </div>

    {showConfirmModal && (
      <div
        className="confirm-dialog-backdrop"
        onClick={(e) => { if (e.target === e.currentTarget && !editBusy) setShowConfirmModal(false) }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-save-title"
      >
        <div className="confirm-dialog-card">
          <div className="confirm-dialog-header">
            <div className="confirm-dialog-icon">
              <HelpCircle size={20} />
            </div>
            <div className="confirm-dialog-text">
              <h3 id="confirm-save-title">Save Changes?</h3>
              <p>Are you sure you want to update this customer's account information?</p>
            </div>
          </div>

          <div className="confirm-dialog-preview">
            <div className="confirm-dialog-row">
              <span>Full Name</span>
              <strong>{formData.name}</strong>
            </div>
            <div className="confirm-dialog-row">
              <span>Mobile Number</span>
              <strong>{formData.mobile}</strong>
            </div>
            <div className="confirm-dialog-row">
              <span>Property Type</span>
              <strong>{formData.type}</strong>
            </div>
            <div className="confirm-dialog-row">
              <span>Service Address</span>
              <strong title={formData.address}>{formData.address}</strong>
            </div>
            {formData.meter_no && (
              <div className="confirm-dialog-row">
                <span>Meter Number</span>
                <strong>{formData.meter_no}</strong>
              </div>
            )}
          </div>

          <div className="confirm-dialog-actions">
            <button
              type="button"
              className="btn-dialog-cancel"
              disabled={editBusy}
              onClick={() => setShowConfirmModal(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-dialog-save"
              disabled={editBusy}
              onClick={executeSaveInfo}
            >
              <Check size={15} /> {editBusy ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    )}
  </div>
}

