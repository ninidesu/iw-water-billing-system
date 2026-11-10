import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import BillForm from '../../components/admin/BillForm.jsx'
import BillingLedger from '../../components/admin/BillingLedger.jsx'
import { Loading, Notice, PageHeader } from '../../components/UI.jsx'
import { useAdminData } from '../../hooks/useAdminData.js'
import { ensureMonthlyPendingSOAs } from '../../lib/autoSOA.js'

export default function Billing() {
  const { data, loading, error, refresh } = useAdminData()
  const [searchParams, setSearchParams] = useSearchParams()
  const preselectedCustomer = searchParams.get('customer') || ''
  const [view, setView] = useState(() => (preselectedCustomer || searchParams.get('mode') === 'new' ? 'create' : 'ledger'))
  const [encodeTarget, setEncodeTarget] = useState(null)

  // Check and generate pending SOAs automatically if at end-of-month
  useEffect(() => {
    let active = true
    ensureMonthlyPendingSOAs()
      .then((res) => {
        if (active && res && res.count > 0) {
          refresh()
        }
      })
      .catch((err) => {
        console.warn('Auto SOA check note:', err?.message || err)
      })
    return () => { active = false }
  }, [refresh])

  useEffect(() => {
    if (preselectedCustomer || searchParams.get('mode') === 'new') setView('create')
  }, [preselectedCustomer, searchParams])

  const toggleView = () => {
    if (view === 'create') {
      setSearchParams({})
      setEncodeTarget(null)
      setView('ledger')
    } else {
      setEncodeTarget(null)
      setView('create')
    }
  }

  const handleEncodeBill = (bill) => {
    setEncodeTarget(bill)
    setView('create')
  }

  return (
    <div className="page-content">
      <PageHeader title="Statements of Account (SOA)" />
      {view === 'create' && (
        <div>
          <button type="button" className="back-to-bills-btn" onClick={toggleView}>
            <ArrowLeft size={16} /> Back to Bills
          </button>
        </div>
      )}
      <Notice type="error">{error}</Notice>
      {loading && !data ? <Loading /> : data && (
        view === 'create'
          ? (
            <BillForm
              customers={data.customers}
              bills={data.bills}
              onSaved={() => { setEncodeTarget(null); refresh(); }}
              printBasePath="/cashier"
              initialCustomerId={encodeTarget?.customer_id || preselectedCustomer}
              initialMonth={encodeTarget?.billing_month || ''}
            />
          )
          : (
            <BillingLedger
              bills={data.bills}
              onPaymentSaved={refresh}
              printBasePath="/cashier"
              canCollect
              onEncodeNew={toggleView}
              onEncodeBill={handleEncodeBill}
            />
          )
      )}
    </div>
  )
}


