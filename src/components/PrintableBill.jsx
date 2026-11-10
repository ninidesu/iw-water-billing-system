import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Download, Droplets, Printer, ZoomIn, ZoomOut } from 'lucide-react'
import { getPrintableBill } from '../lib/api.js'
import { downloadBillPdf } from '../lib/billPdf.js'
import { billStatus, dateLabel, monthLabel, peso, vatBreakdown } from '../lib/format.js'
import { usePreferences } from '../lib/preferences.js'
import StatusBadge from './StatusBadge.jsx'
import { Loading, Notice } from './UI.jsx'

export default function PrintableBill({ area }) {
  const { prefs } = usePreferences()
  const { id } = useParams()
  const navigate = useNavigate()
  const [bill, setBill] = useState(null)
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState(false)

  const paperSize = prefs?.billPaperSize || 'letter'
  const isHalf = paperSize === 'half'
  const copies = prefs?.printCopies || 'both'

  const copyList =
    copies === 'office'
      ? ['Office Copy']
      : copies === 'customer'
        ? ['Customer Copy']
        : ['Office Copy', 'Customer Copy']

  const defaultZoom = copyList.length === 2 ? (isHalf ? 0.8 : 0.62) : 1
  const [zoom, setZoom] = useState(defaultZoom)

  useEffect(() => {
    setZoom(copyList.length === 2 ? (isHalf ? 0.8 : 0.62) : 1)
  }, [copies, isHalf])

  useEffect(() => {
    let active = true
    getPrintableBill(id)
      .then((value) => { if (active) setBill(value) })
      .catch((err) => { if (active) setError(err.message || 'Bill unavailable.') })
    return () => { active = false }
  }, [id])

  const back = area === 'admin' ? '/admin/billing' : area === 'cashier' ? '/cashier/billing' : '/customer/bills'
  const isPending = bill ? (bill.status === 'pending' || bill.water_used == null || bill.amount == null) : false
  const vat = (!isPending && bill?.amount != null) ? vatBreakdown(bill.water_charge ?? bill.amount ?? 0) : null

  const handleBack = (e) => {
    if (window.history.length > 1) {
      e.preventDefault()
      navigate(-1)
    }
  }

  const exportPdf = async () => {
    if (!bill || exporting) return
    setExporting(true)
    setError('')
    try {
      downloadBillPdf(bill, { paperSize, copies })
    } catch (err) {
      setError(err.message || 'Could not export this bill. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className={`page-content print-page bill-size-${paperSize}`}>
      <style>{`
        @page {
          size: ${copyList.length === 2 ? (isHalf ? 'letter landscape' : 'letter portrait') : (isHalf ? '5.5in 8.5in portrait' : 'letter portrait')};
          margin: ${copyList.length === 2 ? '6mm 6mm' : (isHalf ? '8mm' : '10mm')};
        }
      `}</style>
      <div className="print-toolbar">
        <div className="print-toolbar-left">
          <Link to={back} onClick={handleBack} className="back-to-bills-btn">
            <ArrowLeft size={16} /> Back to bill
          </Link>
          <p className="print-toolbar-hint">
            Format: <strong>{isHalf ? 'Half Letter (5.5" × 8.5")' : 'Letter (8.5" × 11")'}</strong> · Copies: <strong>{copyList.join(' & ')}</strong>
          </p>
          {copyList.length === 2 && (
            <div className="print-zoom-controls">
              <button
                type="button"
                className="print-zoom-btn"
                onClick={() => setZoom((z) => Math.max(0.35, Number((z - 0.05).toFixed(2))))}
                title="Zoom Out"
                aria-label="Zoom Out"
              >
                <ZoomOut size={15} />
              </button>
              <span className="print-zoom-level">{Math.round(zoom * 100)}%</span>
              <button
                type="button"
                className="print-zoom-btn"
                onClick={() => setZoom((z) => Math.min(1.2, Number((z + 0.05).toFixed(2))))}
                title="Zoom In"
                aria-label="Zoom In"
              >
                <ZoomIn size={15} />
              </button>
              <button
                type="button"
                className="print-zoom-reset"
                onClick={() => setZoom(isHalf ? 0.8 : 0.62)}
                title="Fit to Row"
              >
                Fit Row
              </button>
            </div>
          )}
        </div>
        <div className="print-toolbar-actions">
          <button type="button" className="button button-outline" onClick={() => window.print()} disabled={!bill}>
            <Printer size={17} /> Print Bill
          </button>
          <button className="button" onClick={exportPdf} disabled={!bill || exporting} aria-busy={exporting}>
            <Download size={17} /> {exporting ? 'Preparing PDF…' : 'Download PDF'}
          </button>
        </div>
      </div>
      <Notice type="error">{error}</Notice>
      {!bill && !error && <Loading label="Loading bill…" />}
      {bill && (
        <div
          className={`bill-copies-container ${copyList.length === 2 ? 'two-copies-row' : 'single-copy'}`}
          style={{ '--bill-zoom': zoom }}
        >
          {copyList.map((copy) => (
            <article key={copy} className={`print-sheet bill-print-copy bill-sheet-${paperSize}`}>
              <p className="bill-copy-label">{copy}</p>
          <header className="print-header">
            <div className="print-brand">
              <span><Droplets size={27} /></span>
              <div>
                <strong>ISABEL WATERS</strong>
                <small>Billing & Collection</small>
              </div>
            </div>
            <div>
              <span>MONTHLY WATER BILL</span>
              <strong>{bill.bill_no}</strong>
            </div>
          </header>
          <div className="print-title">
            <div>
              <p className="eyebrow">STATEMENT PERIOD</p>
              <h1>{monthLabel(bill.billing_month)}</h1>
            </div>
            <StatusBadge bill={bill} />
          </div>
          <div className="print-info">
            <div>
              <span>BILLED TO</span>
              <strong>{bill.customer.full_name}</strong>
              <p>{bill.customer.address}</p>
              <p>CAN {bill.customer.can || 'Pending assignment'}</p>
              <p>Meter no. {bill.customer.meter_no}</p>
            </div>
            <div>
              <span>BILL DETAILS</span>
              <dl>
                <div><dt>Bill date</dt><dd>{dateLabel(bill.bill_date)}</dd></div>
                <div><dt>Due date</dt><dd>{dateLabel(bill.due_date)}</dd></div>
                <div><dt>Bill no.</dt><dd>{bill.bill_no}</dd></div>
              </dl>
            </div>
          </div>
          <div className="print-table">
            <div className="print-table-row header">
              <span>Water consumption</span>
              <span>Reading / Rate</span>
              <span>Amount</span>
            </div>
            <div className="print-table-row">
              <span>
                <strong>Monthly water service{isPending ? ' (Reading pending)' : ''}</strong>
                <small>{monthLabel(bill.billing_month)}</small>
              </span>
              <span>
                <small>Previous: {bill.previous_reading != null ? `${Number(bill.previous_reading).toFixed(2)} m³` : '—'}</small>
                <small>Current: {isPending || bill.current_reading == null ? '—' : `${Number(bill.current_reading).toFixed(2)} m³`}</small>
                <small>Used: {isPending || bill.water_used == null ? '—' : `${Number(bill.water_used).toFixed(2)} m³`}</small>
              </span>
              <strong>{isPending ? '—' : (bill.items?.length ? '' : peso(bill.amount))}</strong>
            </div>
            {bill.items?.map((item) => (
              <div className="print-table-row" key={item.id}>
                <span>{item.description}</span>
                <span>{item.quantity == null ? '' : `${Number(item.quantity).toFixed(2)} m³`}</span>
                <strong>{peso(item.amount)}</strong>
              </div>
            ))}
          </div>
          <div className="print-totals">
            <div><span>VATable Sale</span><strong>{isPending || !vat ? '—' : peso(vat.vatableSale)}</strong></div>
            <div><span>12% VAT (Inclusive)</span><strong>{isPending || !vat ? '—' : peso(vat.vatAmount)}</strong></div>
            <div><span>Water charge (VAT Inclusive)</span><strong>{isPending ? '—' : peso(bill.water_charge ?? bill.amount)}</strong></div>
            <div><span>Penalty</span><strong>{Number(bill.penalty_amount || 0) > 0 ? peso(bill.penalty_amount) : '—'}</strong></div>
            <div><span>Previous unpaid balance</span><strong>{Number(bill.previous_balance || 0) > 0 ? peso(bill.previous_balance) : '—'}</strong></div>
            <div><span>Amount paid</span><strong>{isPending ? '—' : `- ${peso(bill.amount_paid)}`}</strong></div>
            <div className="grand-total">
              <span>Total due at issue</span>
              <strong>{isPending ? (Number(bill.previous_balance || 0) > 0 ? peso(bill.previous_balance) : '—') : peso(bill.total_amount ?? bill.amount)}</strong>
            </div>
            <div>
              <span>Current bill balance</span>
              <strong>{isPending ? (Number(bill.balance || 0) > 0 ? peso(bill.balance) : '—') : peso(bill.balance)}</strong>
            </div>
          </div>
          <div className="print-foot">
            <p><strong>Payment status: {isPending ? 'PENDING ENCODING' : billStatus(bill)}</strong></p>
            <p>Keep your invoice number when paying or asking about this bill.</p>
          </div>
        </article>
      ))}
        </div>
      )}
    </div>
  )
}
