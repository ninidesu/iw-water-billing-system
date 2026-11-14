import { useEffect, useState } from 'react'
import { Link, useParams, useLocation } from 'react-router-dom'
import { ArrowLeft, Printer } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient.js'
import { dateLabel, peso, vatBreakdown } from '../../lib/format.js'
import { Loading, Notice } from '../../components/UI.jsx'
import { usePreferences } from '../../lib/preferences.js'
import './receipt.css'

export default function Receipt() {
  const { prefs } = usePreferences()
  const { id } = useParams()
  const base = useLocation().pathname.startsWith('/admin') ? '/admin' : '/cashier'
  const [receipt, setReceipt] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    const load = async () => {
      const { data: payment, error: paymentError } = await supabase.from('payments').select('*').eq('id', id).single()
      if (paymentError) throw paymentError
      const [customerResult, profileResult, cashierResult, allocationResult, billsResult] = await Promise.all([
        supabase.from('customers').select('id,meter_no').eq('id', payment.customer_id).single(),
        supabase.from('contract_accounts').select('full_name:account_name,can,service_address').eq('legacy_customer_id', payment.customer_id).single(),
        payment.collected_by
          ? supabase.from('profiles').select('full_name,role').eq('id', payment.collected_by).maybeSingle()
          : Promise.resolve({ data: null }),
        supabase.from('payment_allocations').select('*').eq('payment_id', id),
        supabase.from('bills').select('id,bill_no,balance').eq('customer_id', payment.customer_id),
      ])
      for (const result of [customerResult, profileResult, allocationResult, billsResult]) if (result.error) throw result.error
      const bills = new Map(billsResult.data.map((bill) => [bill.id, bill]))
      const collectorTitle = cashierResult.data?.full_name || (cashierResult.data?.role === 'admin' ? 'Administrator' : 'Authorized Cashier')
      return { payment, customer: customerResult.data, name: profileResult.data.full_name, can: profileResult.data.can, address: profileResult.data.service_address, cashier: collectorTitle, allocations: allocationResult.data.map((allocation) => ({ ...allocation, bill: bills.get(allocation.bill_id) })), balance: payment.balance_after ?? billsResult.data.reduce((sum, bill) => sum + Number(bill.balance), 0) }
    }
    load().then((data) => { if (active) setReceipt(data) }).catch((err) => { if (active) setError(err.message) })
    return () => { active = false }
  }, [id])

  useEffect(() => {
    if (receipt && prefs?.autoPrintOnPay) {
      const timer = setTimeout(() => {
        window.print()
      }, 600)
      return () => clearTimeout(timer)
    }
  }, [receipt, prefs?.autoPrintOnPay])

  const copyList =
    prefs?.printCopies === 'office'
      ? ['Office Copy']
      : prefs?.printCopies === 'customer'
        ? ['Customer Copy']
        : ['Office Copy', 'Customer Copy']

  const printButtonLabel =
    prefs?.printCopies === 'office'
      ? 'Print office copy'
      : prefs?.printCopies === 'customer'
        ? 'Print customer copy'
        : 'Print both copies'

  const paperSize = prefs?.receiptPaperSize || '80mm'
  const paidVat = vatBreakdown(receipt?.payment?.amount ?? 0)

  return (
    <div className={`page-content print-page thermal-receipt-page receipt-size-${paperSize}`}>
      <style>{`
        @page {
          size: ${paperSize === '58mm' ? '58mm auto' : paperSize === 'a4' ? 'letter portrait' : '80mm auto'};
          margin: ${paperSize === 'a4' ? '12mm' : '0'};
        }
      `}</style>
      <div className="print-toolbar">
        <div>
          <Link to={base === '/admin' ? '/admin/collections' : '/cashier/collection'} className="button button-ghost">
            <ArrowLeft size={17}/> {base === '/admin' ? 'Back to collections' : 'Back to Payment Counter'}
          </Link>
          <p className="print-toolbar-hint">
            Format: <strong>{paperSize === '58mm' ? '58mm Roll' : paperSize === 'a4' ? 'A4 / Letter Voucher' : '80mm Roll'}</strong> · Copies: <strong>{copyList.join(' & ')}</strong>{copyList.length > 1 && <> · Prints on 2 separate sheets</>}
          </p>
        </div>
        <button className="button" disabled={!receipt} onClick={() => window.print()}>
          <Printer size={17}/> {printButtonLabel}
        </button>
      </div>
      <Notice type="error">{error}</Notice>
      {!receipt && !error && <Loading label="Loading receipt…"/>}
      {receipt && (
        <div className="thermal-copies">
          {copyList.map((copy) => (
            <article className={`thermal-slip thermal-slip-${paperSize}`} key={copy}>
              <header>
                <h1>ISABEL WATERS</h1>
                <p>Billing & Collection</p>
                <h2>OFFICIAL RECEIPT</h2>
                <p>{copy}</p>
              </header>
      <dl className="thermal-section">
        <div><dt>OR No.</dt><dd>{receipt.payment.or_number}</dd></div>
        <div><dt>Date</dt><dd>{dateLabel(receipt.payment.paid_at)}</dd></div>
        <div><dt>Time</dt><dd>{new Date(receipt.payment.paid_at).toLocaleTimeString('en-PH', {timeZone:'Asia/Manila'})}</dd></div>
        {receipt.payment.reference_no && <div><dt>Reference</dt><dd>{receipt.payment.reference_no}</dd></div>}
      </dl>
      <section className="thermal-section"><dl className="thermal-customer"><div><dt>Customer Name:</dt><dd>{receipt.name}</dd></div><div><dt>Account Number:</dt><dd>{receipt.can || 'Not recorded'}</dd></div></dl><p>{receipt.address}</p></section>
      <table className="thermal-items"><thead><tr><th>BILL NO.</th><th>AMOUNT</th></tr></thead><tbody>{receipt.allocations.map(a=><tr key={a.bill_id}><td>{a.bill?.bill_no}</td><td>{peso(a.amount)}</td></tr>)}</tbody></table>
      <dl className="thermal-section">
        <div><dt>VATable Sale</dt><dd>{peso(paidVat.vatableSale)}</dd></div>
        <div><dt>12% VAT (Inclusive)</dt><dd>{peso(paidVat.vatAmount)}</dd></div>
        <div className="thermal-total"><dt>TOTAL PAID</dt><dd>{peso(receipt.payment.amount)}</dd></div>
        <div><dt>Payment method</dt><dd>{receipt.payment.method}</dd></div>
        {receipt.payment.method === 'Cash' && <><div><dt>Cash received</dt><dd>{peso(receipt.payment.tendered)}</dd></div><div><dt>Change</dt><dd>{peso(receipt.payment.change_amount)}</dd></div></>}
        <div><dt>Remaining balance</dt><dd>{peso(receipt.balance)}</dd></div>
      </dl>
      <footer className="thermal-section"><p>Collected by: {receipt.cashier}</p><p className="thermal-signature">Received by: __________________</p><p className="thermal-thanks">Thank you for your payment.<br/>Please keep this receipt.</p></footer>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}


