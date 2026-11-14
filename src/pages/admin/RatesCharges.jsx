import { useEffect, useMemo, useState } from 'react'
import { Calculator, Droplets, History, Save } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient.js'
import { dateLabel, errorMessage, peso, todayISO, vatBreakdown } from '../../lib/format.js'
import { EmptyState, Loading, Notice, PageHeader } from '../../components/UI.jsx'
import TablePagination, { useTablePagination } from '../../components/TablePagination.jsx'
import './rates-charges.css'

let cachedRates = null
let cachedRateLogs = []

export default function RatesCharges() {
  const [rates, setRates] = useState(cachedRates)
  const [logs, setLogs] = useState(cachedRateLogs)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [usage, setUsage] = useState('20')
  const [form, setForm] = useState({ rate: '', effective_from: todayISO(), reason: '' })

  async function load() {
    setError('')
    const [rateResult, logResult] = await Promise.all([
      supabase
        .from('rate_tiers')
        .select('*')
        .eq('min_m3', 0)
        .is('max_m3', null)
        .is('fixed_charge', null)
        .order('effective_from', { ascending: false }),
      supabase.from('rate_change_log').select('*').order('created_at', { ascending: false }).limit(50),
    ])
    if (rateResult.error) setError(errorMessage(rateResult.error))
    else {
      cachedRates = rateResult.data || []
      setRates(cachedRates)
    }
    if (!logResult.error) {
      cachedRateLogs = logResult.data || []
      setLogs(cachedRateLogs)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const active = useMemo(
    () => rates?.find((rate) => rate.is_active && rate.effective_from <= todayISO()),
    [rates]
  )
  const previewRate = form.rate === '' ? Number(active?.rate_per_m3 || 0) : Number(form.rate || 0)
  const previewUsage = Math.max(0, Number(usage || 0))
  const previewVat = vatBreakdown(previewUsage * previewRate)
  const historyPage = useTablePagination(logs, 10)

  async function save(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const { error: saveError } = await supabase.rpc('set_cubic_rate', {
      p_rate: Number(form.rate),
      p_effective_from: form.effective_from,
      p_reason: form.reason.trim(),
    })
    setBusy(false)
    if (saveError) {
      return setError(
        saveError.code === 'PGRST202'
          ? 'Apply the single cubic rate migration to Supabase first.'
          : errorMessage(saveError)
      )
    }
    setForm({ rate: '', effective_from: todayISO(), reason: '' })
    await load()
  }

  return (
    <div className="page-content rates-page rates-dashboard">
      <PageHeader title="Rates & Charges" description="Manage the residential water rate and preview its effect on a bill." />
      <Notice type="error">{error}</Notice>
      {rates === null && !error ? (
        <Loading />
      ) : (
        <>
          <div className="rates-workspace">
            <section className="panel rates-card" aria-labelledby="rate-editor-title">
              <header className="rates-card-heading">
                <span className="rates-heading-icon"><Droplets size={19} aria-hidden="true" /></span>
                <div>
                  <h2 id="rate-editor-title">Approved cubic rate</h2>
                  <p>Residential tariff and scheduled rate changes</p>
                </div>
              </header>

              <div className="rates-current">
                <div>
                  <span>Current rate · VAT inclusive</span>
                  <strong>
                    {active ? `${peso(active.rate_per_m3)} / m³` : 'Not configured'}
                  </strong>
                </div>
                <small>
                    {active
                      ? `Effective ${dateLabel(active.effective_from)}`
                      : 'Billing blocked until configured'}
                </small>
              </div>

              <form className="rates-form" onSubmit={save}>
                <div className="rates-form-fields">
                  <label>
                    <span>New rate per m³ (PHP, VAT inclusive)</span>
                    <input
                      required
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.rate}
                      onChange={(e) => setForm({ ...form, rate: e.target.value })}
                      placeholder="e.g. 8.50"
                    />
                  </label>

                  <label>
                    <span>Effective date</span>
                    <input
                      required
                      type="date"
                      value={form.effective_from}
                      onChange={(e) => setForm({ ...form, effective_from: e.target.value })}
                    />
                  </label>
                </div>

                <label>
                  <span>Reason for rate change</span>
                  <input
                    required
                    type="text"
                    maxLength="500"
                    value={form.reason}
                    onChange={(e) => setForm({ ...form, reason: e.target.value })}
                    placeholder="State the approval or board resolution for this rate"
                  />
                </label>

                <button className="button" type="submit" disabled={busy}>
                  <Save size={16} aria-hidden="true" />
                  {busy ? 'Saving…' : 'Save Cubic Rate'}
                </button>
              </form>
            </section>

            <section className="panel rates-card" aria-labelledby="rate-calculator-title">
              <header className="rates-card-heading">
                <span className="rates-heading-icon"><Calculator size={19} aria-hidden="true" /></span>
                <div>
                  <h2 id="rate-calculator-title">Sample bill calculator</h2>
                  <p>{form.rate === '' ? 'Using the current approved rate' : 'Using the new rate entered in the form'}</p>
                </div>
              </header>

              <div className="rates-usage-row">
                <label htmlFor="sample-calc-consumption">
                  Sample consumption (m³)
                </label>
                  <input
                    id="sample-calc-consumption"
                    type="number"
                    min="0"
                    step="0.01"
                    value={usage}
                    onChange={(e) => setUsage(e.target.value)}
                    placeholder="20"
                  />
              </div>

              <dl className="rates-breakdown">
                <div>
                  <dt>Consumption</dt>
                  <dd>{previewUsage.toFixed(2)} m³</dd>
                </div>
                <div>
                  <dt>Rate per m³</dt>
                  <dd>{peso(previewRate)}</dd>
                </div>
                <div>
                  <dt>VATable sale</dt>
                  <dd>{peso(previewVat.vatableSale)}</dd>
                </div>
                <div>
                  <dt>12% VAT (inclusive)</dt>
                  <dd>{peso(previewVat.vatAmount)}</dd>
                </div>
                <div className="rates-total">
                  <dt>Total water charge <small>VAT inclusive</small></dt>
                  <dd>{peso(previewVat.gross)}</dd>
                </div>
              </dl>
            </section>
          </div>

          <section className="panel rates-card rates-history" aria-labelledby="rate-history-title">
            <header className="rates-card-heading">
              <span className="rates-heading-icon"><History size={19} aria-hidden="true" /></span>
              <div>
                <h2 id="rate-history-title">Rate change history</h2>
                <p>Previously approved residential tariffs</p>
              </div>
            </header>

            {logs.length ? (
              <div className="table-scroll rates-history-scroll" tabIndex={0} role="region" aria-labelledby="rate-history-title">
                <table aria-labelledby="rate-history-title">
                  <thead>
                    <tr>
                      <th>Effective Date</th>
                      <th>Approved Rate</th>
                      <th>Reason / Board Resolution</th>
                      <th>Changed By</th>
                      <th>Date Recorded</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyPage.visibleRows.map((log) => (
                      <tr key={log.id}>
                        <td>{dateLabel(log.effective_from)}</td>
                        <td className="rates-history-rate">
                          <strong>{peso(log.rate_per_m3)} / m³</strong>
                        </td>
                        <td className="rates-history-reason">{log.reason}</td>
                        <td>Administrator</td>
                        <td>{dateLabel(log.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                title="No approved rate changes yet"
                description="Save the first cubic rate to begin the history."
              />
            )}
            <TablePagination {...historyPage} total={logs.length} />
          </section>
        </>
      )}
    </div>
  )
}
