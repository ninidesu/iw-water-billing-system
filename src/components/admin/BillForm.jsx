import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { RotateCcw, Save, Search } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient.js'
import { tierBreakdown } from '../../lib/tieredBilling.js'
import { errorMessage, peso, todayISO, vatBreakdown } from '../../lib/format.js'
import { Notice } from '../UI.jsx'

const dueDate = () => {
  const day = new Date(`${todayISO()}T12:00:00Z`)
  day.setUTCDate(day.getUTCDate() + 14)
  return day.toISOString().slice(0, 10)
}

const initial = () => ({
  customer_id: '', billing_month: todayISO().slice(0, 7), due_date: dueDate(),
  first_previous_reading: '0', current_reading: '', usage_override: '', rate_override: '',
})
let cachedActiveTiers = null

export default function BillForm({ customers, bills, onSaved, printBasePath = '/cashier', initialCustomerId = '', initialMonth = '' }) {
  const navigate = useNavigate()
  const [form, setForm] = useState(() => ({
    ...initial(),
    ...(initialMonth ? { billing_month: initialMonth.slice(0, 7) } : {}),
  }))
  const [search, setSearch] = useState('')
  const [tiers, setTiers] = useState(() => cachedActiveTiers || [])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false)

  useEffect(() => {
    let active = true
    supabase.from('rate_tiers').select('*').eq('is_active', true).lte('effective_from', todayISO()).order('effective_from', { ascending: false }).order('min_m3')
      .then(({ data, error: rateError }) => {
        if (!active) return
        if (rateError) setError(rateError.message)
        else if (data?.length) { cachedActiveTiers = data.filter((tier) => tier.effective_from === data[0].effective_from); setTiers(cachedActiveTiers) }
        else { cachedActiveTiers = []; setTiers([]) }
      })
    return () => { active = false }
  }, [])

  const eligible = customers.filter((customer) => customer.status === 'active')
  const customerLabel = (customer) => `${customer.full_name} · ${customer.can || customer.meter_no}`
  const customerResults = eligible.filter((customer) => `${customer.full_name} ${customer.can || ''} ${customer.meter_no || ''}`.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 8)
  const chooseCustomer = (customer) => {
    setSearch(customerLabel(customer))
    setForm((current) => ({
      ...current,
      customer_id: customer.id,
      first_previous_reading: String(customer.initial_reading ?? 0),
    }))
    setCustomerDropdownOpen(false)
  }

  useEffect(() => {
    if (!initialCustomerId || !eligible.length) return
    const target = eligible.find((c) => c.id === initialCustomerId)
    if (target) chooseCustomer(target)
  }, [initialCustomerId, eligible.length])

  useEffect(() => {
    if (initialMonth) {
      setForm((current) => ({ ...current, billing_month: initialMonth.slice(0, 7) }))
    }
  }, [initialMonth])

  const selected = customers.find((customer) => customer.id === form.customer_id)
  const last = useMemo(() => bills.filter((bill) => bill.customer_id === form.customer_id && bill.status !== 'pending' && bill.current_reading != null).sort((a, b) => b.billing_month.localeCompare(a.billing_month))[0], [bills, form.customer_id])
  const previous = last ? Number(last.current_reading) : Number(form.first_previous_reading || 0)
  const meterUsage = form.current_reading === '' ? 0 : Math.max(0, Number(form.current_reading) - previous)
  const hasUsageOverride = form.usage_override !== ''
  const hasRateOverride = form.rate_override !== ''
  const usage = hasUsageOverride ? Math.max(0, Number(form.usage_override)) : meterUsage
  const breakdown = hasRateOverride ? [{ label: 'Custom cubic rate', quantity: usage, rate: Number(form.rate_override), amount: usage * Number(form.rate_override) }] : tierBreakdown(usage, tiers)
  const charge = Math.round(breakdown.reduce((sum, line) => sum + line.amount, 0) * 100) / 100
  const { vatableSale, vatAmount } = vatBreakdown(charge)
  const prior = bills.filter((bill) => bill.customer_id === form.customer_id && bill.status !== 'pending').reduce((sum, bill) => sum + Number(bill.balance), 0)
  const adjusted = hasUsageOverride || hasRateOverride
  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }))
  const reset = () => { setForm(initial()); setSearch(''); setError('') }

  const save = async (event) => {
    event.preventDefault()
    setError('')
    if (!selected || selected.status !== 'active') return setError('Select an active customer.')
    if (!tiers.length && !hasRateOverride) return setError('No active cubic rate is configured. Ask an administrator to add one in Rates & Charges, or enter a justified one-off rate.')
    if (form.current_reading === '' || Number(form.current_reading) < previous) return setError('Current reading must be at least the previous reading.')
    if (hasUsageOverride && Number(form.usage_override) < 0) return setError('Billable usage cannot be negative.')
    if (hasRateOverride && Number(form.rate_override) < 0) return setError('Custom rate cannot be negative.')
    const billingMonth = `${form.billing_month}-01`
    if (bills.some((bill) => bill.customer_id === selected.id && bill.billing_month === billingMonth && bill.status !== 'pending' && bill.amount != null)) {
      return setError('A finalized bill already exists for this customer and month.')
    }

    setBusy(true)
    const { data: id, error: saveError } = await supabase.rpc('create_staff_bill', {
      p_customer_id: selected.id,
      p_billing_month: billingMonth,
      p_due_date: form.due_date,
      p_current_reading: Number(form.current_reading),
      p_first_previous_reading: last ? null : previous,
      p_usage_m3: hasUsageOverride ? Number(form.usage_override) : null,
      p_rate_per_m3: hasRateOverride ? Number(form.rate_override) : null,
      p_adjustment_note: adjusted ? 'Usage or cubic rate adjusted by staff' : null,
    })

    if (saveError) {
      // Check if there is an existing pending bill that can be updated directly as fallback
      const { data: pendingBill } = await supabase
        .from('bills')
        .select('id, amount_paid')
        .eq('customer_id', selected.id)
        .eq('billing_month', billingMonth)
        .eq('status', 'pending')
        .maybeSingle()

      if (pendingBill) {
        const finalBal = (charge + prior) - Number(pendingBill.amount_paid || 0)
        const finalStatus = Number(pendingBill.amount_paid || 0) >= (charge + prior) ? 'paid' : Number(pendingBill.amount_paid || 0) > 0 ? 'partial' : 'unpaid'
        const { error: updErr } = await supabase
          .from('bills')
          .update({
            due_date: form.due_date,
            previous_reading: previous,
            current_reading: Number(form.current_reading),
            water_used: usage,
            usage_m3: usage,
            rate_per_m3: hasRateOverride ? Number(form.rate_override) : 0,
            water_charge: charge,
            amount: charge + prior,
            total_amount: charge + prior,
            balance: finalBal,
            status: finalStatus,
            usage_adjusted: hasUsageOverride,
            rate_adjusted: hasRateOverride,
            adjustment_note: adjusted ? 'Usage or cubic rate adjusted by staff' : null,
          })
          .eq('id', pendingBill.id)

        if (!updErr) {
          await supabase.from('bill_items').delete().eq('bill_id', pendingBill.id)
          const items = breakdown.map((item) => ({
            bill_id: pendingBill.id,
            description: item.label || 'Water service',
            quantity: item.quantity,
            unit_rate: item.rate,
            amount: item.amount,
          }))
          if (items.length) await supabase.from('bill_items').insert(items)
          setBusy(false)
          await onSaved()
          navigate(`${printBasePath}/bills/${pendingBill.id}/print`)
          return
        }
      }

      setBusy(false)
      if (saveError.code === 'PGRST202') return setError('The staff billing adjustment migration has not been applied to Supabase yet.')
      if (/no active water rate is configured/i.test(saveError.message || '')) return setError('Set the approved cubic rate in Admin → Rates & Charges before saving this bill.')
      return setError(saveError.code === '23505' ? 'A bill already exists for this customer and month.' : errorMessage(saveError))
    }

    setBusy(false)
    await onSaved()
    navigate(`${printBasePath}/bills/${id}/print`)
  }

  const breakdownView = (
    <aside className="billing-card compact-breakdown-card" aria-labelledby="bill-breakdown-heading">
      <div className="breakdown-card-header">
        <h3 id="bill-breakdown-heading">Billing Breakdown</h3>
        {adjusted && <span className="adjusted-badge">Adjusted</span>}
      </div>
      <div className="compact-breakdown-rows">
        <div className="compact-row">
          <span>Provider</span>
          <strong>Isabel Waters</strong>
        </div>
        <div className="compact-row">
          <span>Consumption</span>
          <strong>{usage.toFixed(2)} m³</strong>
        </div>
        {breakdown.map((line) => (
          <div key={line.label} className="compact-row">
            <span>
              {line.label}
              {line.rate != null && <small>{line.quantity.toFixed(2)} m³ × {peso(line.rate)}</small>}
            </span>
            <strong>{peso(line.amount)}</strong>
          </div>
        ))}
        <div className="compact-row">
          <span>Effective cost per m³</span>
          <strong>{usage > 0 ? peso(charge / usage) : peso(0)}</strong>
        </div>
        <div className="compact-row sub-row">
          <span>VATable Sale</span>
          <strong>{peso(vatableSale)}</strong>
        </div>
        <div className="compact-row sub-row">
          <span>12% VAT (Inclusive)</span>
          <strong>{peso(vatAmount)}</strong>
        </div>
        <div className="compact-row">
          <span>Previous unpaid balance</span>
          <strong className={prior > 0 ? 'text-danger' : ''}>{peso(prior)}</strong>
        </div>
        <div className="compact-row">
          <span>Unpaid penalties</span>
          <strong>{peso(0)}</strong>
        </div>
      </div>
      <div className="compact-total-box">
        <div>
          <span className="total-label">Total Amount Due (VAT Inclusive)</span>
          {form.due_date && <small className="total-due-date">Due: {form.due_date}</small>}
        </div>
        <strong className="total-amount">{peso(charge + prior)}</strong>
      </div>
      <button
        type="submit"
        form="generate-bill-form"
        className="button generate-bill-submit-btn"
        disabled={busy || (!tiers.length && !hasRateOverride)}
      >
        <Save size={16} /> {busy ? 'Generating…' : 'Generate Bill'}
      </button>
    </aside>
  )

  return (
    <div className="bill-composer-layout">
      <section className="panel bill-form-panel">
        <div className="panel-heading bill-panel-header">
          <h2>Generate Bill</h2>
          <button type="button" className="button button-ghost compact-clear-btn" onClick={reset}>
            <RotateCcw size={14} /> Clear
          </button>
        </div>
        <Notice type="error">{error}</Notice>
        <form id="generate-bill-form" className="billing-form" onSubmit={save}>
          <div className="billing-customer-combobox" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setCustomerDropdownOpen(false) }}>
            <label className="compact-field-label">
              Customer
              <span className="billing-customer-search">
                <Search size={16} />
                <input
                  required
                  value={search}
                  onFocus={() => setCustomerDropdownOpen(true)}
                  onChange={(event) => {
                    setSearch(event.target.value)
                    setForm((current) => ({ ...current, customer_id: '' }))
                    setCustomerDropdownOpen(true)
                  }}
                  placeholder="Search customer, CAN, or meter..."
                  autoComplete="off"
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded={customerDropdownOpen}
                  aria-controls="billing-customer-results"
                />
              </span>
            </label>
            {customerDropdownOpen && (
              <div className="customer-search-dropdown billing-customer-dropdown" id="billing-customer-results" role="listbox">
                {customerResults.length ? customerResults.map((customer) => (
                  <button
                    type="button"
                    role="option"
                    aria-selected={form.customer_id === customer.id}
                    key={customer.id}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => chooseCustomer(customer)}
                  >
                    <span className="customer-result-avatar">{customer.full_name.slice(0, 1).toUpperCase()}</span>
                    <span className="customer-dropdown-identity">
                      <strong>{customer.full_name}</strong>
                      <small>CAN {customer.can || '—'} · Meter {customer.meter_no || '—'}</small>
                    </span>
                    <span className="billing-active-label">Active</span>
                  </button>
                )) : (
                  <div className="customer-dropdown-empty">
                    <Search size={16} />
                    <span><strong>No active customers found</strong></span>
                  </div>
                )}
              </div>
            )}
          </div>

          {selected && (
            <div className="compact-customer-tags">
              <div className="compact-tag"><span>Meter:</span><strong>{selected.meter_no || '—'}</strong></div>
              <div className="compact-tag"><span>CAN:</span><strong>{selected.can || '—'}</strong></div>
              <div className="compact-tag compact-tag-address"><span>Address:</span><strong>{selected.address || '—'}</strong></div>
            </div>
          )}

          <div className="form-grid-2">
            <label className="compact-field-label">
              Billing month
              <input type="month" required value={form.billing_month} onChange={update('billing_month')} />
            </label>
            <label className="compact-field-label">
              Due date
              <input type="date" required value={form.due_date} onChange={update('due_date')} />
            </label>
          </div>

          <div className="compact-readings-grid">
            <label className="compact-field-label">
              Prev reading (m³)
              <input
                type="number"
                min="0"
                step="0.01"
                readOnly={!!last}
                value={last ? last.current_reading : form.first_previous_reading}
                onChange={update('first_previous_reading')}
              />
            </label>
            <label className="compact-field-label">
              Current reading (m³)
              <input
                type="number"
                min={previous}
                step="0.01"
                required
                value={form.current_reading}
                onChange={update('current_reading')}
                placeholder="0.00"
              />
            </label>
            <div className="compact-field-label">
              <span>Meter usage</span>
              <div className="compact-usage-box">
                <strong>{meterUsage.toFixed(2)}</strong> <small>m³</small>
              </div>
            </div>
          </div>

          <fieldset className="compact-adjustments">
            <legend>Adjustments (Optional)</legend>
            <div className="form-grid-2">
              <label className="compact-field-label">
                Override usage (m³)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.usage_override}
                  onChange={update('usage_override')}
                  placeholder={`Auto (${meterUsage.toFixed(2)})`}
                />
              </label>
              <label className="compact-field-label">
                Override rate (₱/m³)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.rate_override}
                  onChange={update('rate_override')}
                  placeholder={tiers.length ? `Auto (${peso(tiers[0].rate_per_m3)})` : 'Rate per m³'}
                />
              </label>
            </div>
          </fieldset>
        </form>
      </section>
      {breakdownView}
    </div>
  )
}
