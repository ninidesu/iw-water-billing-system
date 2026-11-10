import { useState, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient.js'
import { errorMessage, peso } from '../../lib/format.js'
import { useAuth } from '../../context/AuthContext.jsx'
import Modal from '../Modal.jsx'
import { Notice } from '../UI.jsx'

export default function CollectionModal({ bill, bills, onClose, onSaved }) {
  const { profile, user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const requestId = useRef(crypto.randomUUID())
  const collectorName = profile?.full_name || user?.user_metadata?.full_name || (profile?.role === 'admin' ? 'Administrator' : 'Cashier')
  const openBills = bills.filter((row) => row.customer_id === bill.customer_id && Number(row.balance) > 0).sort((a, b) => a.due_date.localeCompare(b.due_date))
  const runningBalance = openBills.reduce((sum, row) => sum + Number(row.balance), 0)
  const [amount, setAmount] = useState(String(runningBalance))
  const [method, setMethod] = useState('Cash')
  const [reference, setReference] = useState('')
  const [tendered, setTendered] = useState(String(runningBalance))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async (event) => {
    event.preventDefault(); setError('')
    const numeric = Number(amount)
    if (!Number.isFinite(numeric) || numeric <= 0) return setError('Enter an amount greater than zero.')
    if (numeric > runningBalance) return setError(`Payment cannot exceed ${peso(runningBalance)}.`)
    if (method !== 'Cash' && !reference.trim()) return setError('Enter the transaction reference number.')
    if (method === 'Cash' && Number(tendered) < numeric) return setError('Cash received must cover the payment.')
    setBusy(true)
    const { data: paymentId, error: saveError } = await supabase.rpc('record_staff_payment', { p_request_id: requestId.current, p_customer_id: bill.customer_id, p_amount: numeric, p_method: method, p_reference_no: reference.trim() || null, p_tendered: method === 'Cash' ? Number(tendered) : null })
    setBusy(false)
    if (saveError) return setError(errorMessage(saveError))
    await onSaved(); onClose(); navigate(`${location.pathname.startsWith('/admin') ? '/admin' : '/cashier'}/receipts/${paymentId}`)
  }
  return <Modal title="Collect payment" onClose={onClose}><p className="modal-intro">{bill.customer?.full_name || 'Customer'} · Collecting as {collectorName}</p><div className="balance-callout"><span>Running balance across {openBills.length} bill(s)</span><strong>{peso(runningBalance)}</strong></div><div className="tier-preview">{openBills.map((row) => <div key={row.id}><span>{row.bill_no}</span><strong>{peso(row.balance)}</strong></div>)}</div><Notice type="error">{error}</Notice><form className="form-stack" onSubmit={submit}><label>Payment amount<input type="number" min="0.01" max={runningBalance} step="0.01" required value={amount} onChange={(event) => setAmount(event.target.value)} /></label><label>Payment method<select value={method} onChange={(event) => setMethod(event.target.value)}><option>Cash</option><option>GCash</option><option>Bank Transfer</option></select></label>{method !== 'Cash' && <label>Reference number<input required value={reference} onChange={(event) => setReference(event.target.value)} /></label>}{method === 'Cash' && <><label>Cash received<input type="number" min={amount} step="0.01" required value={tendered} onChange={(event) => setTendered(event.target.value)} /></label><p>Change: <strong>{peso(Math.max(0, Number(tendered || 0) - Number(amount || 0)))}</strong></p></>}<div className="form-actions"><button className="button button-ghost" type="button" onClick={onClose}>Cancel</button><button className="button" disabled={busy}>{busy ? 'Recording…' : 'Record payment'}</button></div></form></Modal>
}
