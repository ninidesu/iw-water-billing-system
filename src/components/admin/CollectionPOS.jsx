import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Banknote, Check, ReceiptText, Search, UserCheck, UserRound } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient.js'
import { dateISOManila, dateLabel, errorMessage, monthLabel, peso, todayISO, vatBreakdown } from '../../lib/format.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { Notice } from '../UI.jsx'

export default function CollectionPOS({ data, onSaved }) {
  const { profile, user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const requestId = useRef(crypto.randomUUID())

  const collectorName = profile?.full_name || user?.user_metadata?.full_name || (profile?.role === 'admin' ? 'Administrator' : 'Cashier')
  const collectorRole = profile?.role === 'admin' ? 'Administrator' : 'Cashier'
  const [search, setSearch] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [term, setTerm] = useState('custom')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('Cash')
  const [reference, setReference] = useState('')
  const [tendered, setTendered] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showConfirmModal, setShowConfirmModal] = useState(false)

  const summary = useMemo(() => {
    if (!data) return { collectedToday: 0, todayCount: 0, remainingBalance: 0, unpaidCount: 0 }
    const today = todayISO()
    const todayPayments = (data.payments || []).filter(
      (p) => p.paid_at && dateISOManila(p.paid_at) === today && p.status !== 'void'
    )
    const collectedToday = todayPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0)

    let remainingBalance = 0
    let unpaidCount = 0
    ;(data.bills || []).forEach((b) => {
      const bal = Number(b.balance || 0)
      if (bal > 0) {
        remainingBalance += bal
        unpaidCount += 1
      }
    })

    return {
      collectedToday,
      todayCount: todayPayments.length,
      remainingBalance,
      unpaidCount,
    }
  }, [data])

  const accounts = useMemo(() => data.customers.map((customer) => {
    const bills = data.bills.filter((bill) => bill.customer_id === customer.id && Number(bill.balance) > 0).sort((a, b) => a.due_date.localeCompare(b.due_date))
    return { customer, bills, balance: bills.reduce((sum, bill) => sum + Number(bill.balance), 0) }
  }).filter((account) => account.bills.length), [data])

  const chooseCustomer = (account) => {
    setCustomerId(account.customer.id)
    setTerm('custom')
    setAmount(account.balance.toFixed(2))
    setTendered(account.balance.toFixed(2))
    setReference('')
    setError('')
  }

  const preselectId = searchParams.get('customer') || location.state?.customerId
  useEffect(() => {
    if (!preselectId || !accounts.length) return
    const target = accounts.find((acc) => acc.customer.id === preselectId)
    if (target) {
      chooseCustomer(target)
      setSearch(target.customer.full_name)
    }
  }, [preselectId, accounts.length])

  const matches = accounts.filter(({ customer }) => `${customer.full_name} ${customer.can || ''} ${customer.meter_no || ''} ${customer.contact_no || customer.mobile_no || ''}`.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 12)
  const selected = accounts.find(({ customer }) => customer.id === customerId)
  const due = selected?.balance || 0
  const numericAmount = Number(amount || 0)
  const { vatableSale, vatAmount } = vatBreakdown(numericAmount)
  const cash = Number(tendered || 0)
  const change = Math.max(0, cash - numericAmount)

  const chooseTerm = (value) => {
    setTerm(value)
    if (!selected) return
    if (value === 'custom') {
      setAmount(selected.balance.toFixed(2))
      if (method === 'Cash') setTendered(selected.balance.toFixed(2))
      return
    }
    const installment = Math.ceil((selected.balance / Number(value)) * 100) / 100
    setAmount(installment.toFixed(2))
    if (method === 'Cash') setTendered(installment.toFixed(2))
  }

  // Close confirmation modal on Escape key
  useEffect(() => {
    if (!showConfirmModal) return
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !busy) setShowConfirmModal(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showConfirmModal, busy])

  const handleInitiatePayment = (event) => {
    if (event) event.preventDefault()
    setError('')
    if (!selected) return setError('Select a customer account first.')
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) return setError('Enter an amount greater than zero.')
    if (numericAmount > due) return setError(`Payment cannot exceed ${peso(due)}.`)
    if (method !== 'Cash' && !reference.trim()) return setError('Enter the transaction reference number.')
    if (method === 'Cash' && cash < numericAmount) return setError('Cash received must cover the payment amount.')

    setShowConfirmModal(true)
  }

  const executePayment = async () => {
    if (!selected) return
    setBusy(true)
    setError('')
    try {
      const { data: paymentId, error: saveError } = await supabase.rpc('record_staff_payment', {
        p_request_id: requestId.current,
        p_customer_id: selected.customer.id,
        p_amount: numericAmount,
        p_method: method,
        p_reference_no: reference.trim() || null,
        p_tendered: method === 'Cash' ? cash : null,
      })
      if (saveError) {
        setShowConfirmModal(false)
        setError(errorMessage(saveError))
        return
      }
      setShowConfirmModal(false)
      await onSaved()
      navigate(`${location.pathname.startsWith('/admin') ? '/admin' : '/cashier'}/receipts/${paymentId}`)
    } catch (err) {
      setShowConfirmModal(false)
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return <section className="collection-pos" aria-label="Payment counter">
    <aside className="pos-customer-column">
      <div className="pos-section-heading"><span>1</span><div><h2>Select Account</h2></div></div>

      {/* 2 Small Summary Cards - Single Row */}
      <div className="pos-mini-stats-grid">
        <div className="stat-card">
          <div className="stat-top-info">
            <span className="stat-label">Collected Today</span>
            <span className="stat-subtext">
              {summary.todayCount === 0 ? 'No payments yet' : `${summary.todayCount} posted`}
            </span>
          </div>
          <strong className="stat-value-bottom-right" style={{ color: '#16A34A' }}>
            {peso(summary.collectedToday)}
          </strong>
        </div>

        <div className="stat-card">
          <div className="stat-top-info">
            <span className="stat-label">Remaining Balance</span>
            <span className="stat-subtext">{summary.unpaidCount} bills pending</span>
          </div>
          <strong className="stat-value-bottom-right">
            {peso(summary.remainingBalance)}
          </strong>
        </div>
      </div>

      <label className="pos-search"><Search size={19}/><span className="sr-only">Search customer</span><input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, CAN, or meter no."/></label>
      <div className="pos-customer-list">
        {matches.map((account) => <button type="button" key={account.customer.id} className={`pos-customer ${customerId === account.customer.id ? 'selected' : ''}`} onClick={() => chooseCustomer(account)}>
          <span><strong>{account.customer.full_name}</strong><small>CAN {account.customer.can || 'Not assigned'} · {account.bills.length} unpaid bill{account.bills.length === 1 ? '' : 's'}</small></span><b>{peso(account.balance)}</b>
        </button>)}
        {!matches.length && <div className="pos-empty"><UserRound size={30}/><strong>No matching accounts with open bills</strong></div>}
      </div>
    </aside>

    <div className="pos-bills-column">
      <div className="pos-section-heading"><span>2</span><div><h2>Unpaid Bills (Oldest First)</h2></div></div>
      {selected ? <>
        <div className="pos-customer-summary">
          <div className="pos-cust-card-top">
            <span className="pos-cust-eyebrow">Selected Customer</span>
            <button
              type="button"
              className="pos-change-cust-btn"
              onClick={() => {
                setCustomerId('')
                setSearch('')
              }}
              title="Change customer account"
            >
              Change
            </button>
          </div>
          <div className="pos-cust-card-body">
            <div className="pos-cust-avatar">
              {(selected.customer.full_name || 'C').slice(0, 1).toUpperCase()}
            </div>
            <div className="pos-cust-info">
              <strong className="pos-cust-name">{selected.customer.full_name}</strong>
              <div className="pos-cust-tags">
                <span className="pos-cust-tag">CAN {selected.customer.can || '—'}</span>
                <span className="pos-cust-tag">Meter {selected.customer.meter_no || '—'}</span>
                {selected.customer.address && (
                  <span className="pos-cust-tag address">{selected.customer.address}</span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="pos-bill-stack">
          {selected.bills.map((bill, index) => {
            const isOverdue = bill.due_date < todayISO()
            return (
              <article className="pos-bill-card" key={bill.id}>
                <div className="pos-bill-left">
                  <span className="pos-bill-order">{index + 1}</span>
                  <div className="pos-bill-details">
                    <div className="pos-bill-headline">
                      <strong>{bill.bill_no}</strong>
                      {isOverdue && <span className="pos-bill-overdue-tag">Overdue</span>}
                    </div>
                    <small>
                      {bill.billing_month ? monthLabel(bill.billing_month) : ''} · Due {dateLabel(bill.due_date)}
                      {bill.water_used ? ` (${Number(bill.water_used).toFixed(1)} m³)` : ''}
                    </small>
                  </div>
                </div>
                <div className="pos-bill-right">
                  <small>Balance</small>
                  <b>{peso(bill.balance)}</b>
                </div>
              </article>
            )
          })}
        </div>

        <div className="pos-balance-total">
          <div>
            <span className="pos-total-label">Total Balance Due</span>
            <small className="pos-total-sub">
              {selected.bills.length} unpaid {selected.bills.length === 1 ? 'bill' : 'bills'}
            </small>
          </div>
          <strong className="pos-total-amount">{peso(due)}</strong>
        </div>
      </> : <div className="pos-stage-empty"><ReceiptText size={40}/><h3>No Customer Selected</h3><p>Choose a customer on the left to review their unpaid bills.</p></div>}
    </div>

    <form className="pos-payment-column" onSubmit={handleInitiatePayment}>
      <div className="pos-section-heading">
        <span>3</span>
        <div>
          <h2>Receive Payment</h2>
          <small className="pos-collector-tag">
            <UserCheck size={13} /> Collector: <strong>{collectorName}</strong> ({collectorRole})
          </small>
        </div>
      </div>
      <Notice type="error">{error}</Notice>
      <fieldset className="pos-terms"><legend>Installment / Payment Option</legend>{['custom', '2', '3', '6', '9', '12'].map((value) => <button type="button" key={value} className={term === value ? 'active' : ''} disabled={!selected} onClick={() => chooseTerm(value)}>{value === 'custom' ? 'Full / Custom' : `${value} Mos`}</button>)}</fieldset>
      {selected && term !== 'custom' && <p className="pos-term-note">Installment today: <strong>{peso(numericAmount)}</strong>. Remaining <strong>{peso(Math.max(0, due - numericAmount))}</strong> stays on the account.</p>}
      <label>Amount to Pay (PHP)<input type="number" min="0.01" max={due || undefined} step="0.01" disabled={!selected} value={amount} onChange={(event) => { setTerm('custom'); setAmount(event.target.value) }}/></label>
      <fieldset className="pos-methods"><legend>Payment Method</legend>{['Cash', 'GCash', 'Bank Transfer'].map((item) => <button type="button" key={item} className={method === item ? 'active' : ''} onClick={() => setMethod(item)}>{item}</button>)}</fieldset>
      {method === 'Cash' ? <label>Cash Received (PHP)<input type="number" min={numericAmount || 0} step="0.01" disabled={!selected} value={tendered} onChange={(event) => setTendered(event.target.value)}/></label> : <label>Reference Number<input required disabled={!selected} value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Enter reference number"/></label>}
      <div className="pos-tender-summary">
        <div><span>VATable Sale</span><strong>{peso(vatableSale)}</strong></div>
        <div><span>12% VAT (Inclusive)</span><strong>{peso(vatAmount)}</strong></div>
        {method === 'Cash' && <>
          <div><span>Cash Received</span><strong>{peso(cash)}</strong></div>
          <div className="pos-change"><span>Change</span><strong>{peso(change)}</strong></div>
        </>}
        <div className="pos-amount-to-pay"><span>Amount to Pay</span><strong>{peso(numericAmount)}</strong></div>
      </div>
      <button type="submit" className="button button-full pos-pay-button" disabled={!selected || busy}><Banknote size={20}/>{busy ? 'Posting Payment…' : 'Post Payment & Print Receipt'}</button>
    </form>

    {showConfirmModal && selected && (
      <div
        className="confirm-dialog-backdrop"
        onClick={(e) => { if (e.target === e.currentTarget && !busy) setShowConfirmModal(false) }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-payment-title"
      >
        <div className="confirm-dialog-card">
          <div className="confirm-dialog-header">
            <div className="confirm-dialog-icon">
              <Banknote size={20} />
            </div>
            <div className="confirm-dialog-text">
              <h3 id="confirm-payment-title">Post Payment & Print Receipt?</h3>
              <p>Please review and confirm transaction details before recording.</p>
            </div>
          </div>

          <div className="confirm-dialog-preview">
            <div className="confirm-dialog-row">
              <span>Customer</span>
              <strong>{selected.customer.full_name}</strong>
            </div>
            <div className="confirm-dialog-row">
              <span>CAN / Meter</span>
              <strong>CAN {selected.customer.can || '—'} · Meter {selected.customer.meter_no || '—'}</strong>
            </div>
            <div className="confirm-dialog-row">
              <span>Amount to Post</span>
              <strong style={{ color: 'var(--staff-accent)', fontSize: '13.5px' }}>{peso(numericAmount)}</strong>
            </div>
            <div className="confirm-dialog-row">
              <span>Payment Method</span>
              <strong>{method}</strong>
            </div>
            {method === 'Cash' ? (
              <>
                <div className="confirm-dialog-row">
                  <span>Cash Received</span>
                  <strong>{peso(cash)}</strong>
                </div>
                <div className="confirm-dialog-row">
                  <span>Change</span>
                  <strong>{peso(change)}</strong>
                </div>
              </>
            ) : (
              <div className="confirm-dialog-row">
                <span>Reference No.</span>
                <strong>{reference.trim()}</strong>
              </div>
            )}
            <div className="confirm-dialog-row">
              <span>Remaining Balance</span>
              <strong>{peso(Math.max(0, due - numericAmount))}</strong>
            </div>
          </div>

          <div className="confirm-dialog-actions">
            <button
              type="button"
              className="btn-dialog-cancel"
              disabled={busy}
              onClick={() => setShowConfirmModal(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-dialog-save"
              disabled={busy}
              onClick={executePayment}
            >
              <Check size={15} /> {busy ? 'Posting Payment…' : 'Confirm & Post'}
            </button>
          </div>
        </div>
      </div>
    )}
  </section>
}

