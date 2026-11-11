import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient.js'
import { dateLabel, errorMessage, peso, todayISO, vatBreakdown } from '../../lib/format.js'
import { EmptyState, Loading, Notice, PageHeader } from '../../components/UI.jsx'

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
      <PageHeader title="Rates & Charges" />
      <Notice type="error">{error}</Notice>
      {rates === null && !error ? (
        <Loading />
      ) : (
        <>
          {/* Top Row: Approved Cubic Rate (Left) + Sample Bill Calculator (Right) */}
          <div className="rates-top-grid">
            {/* Container 1: Approved Cubic Rate (Compact & Space Efficient) */}
            <section className="panel rate-editor compact-rate-editor">
              <div className="panel-heading">
                <div>
                  <h2>Approved Cubic Rate</h2>
                  <p>Active residential tariff & rate adjustment</p>
                </div>
              </div>

              {/* Preserved Design: Dark Active Rate Banner */}
              <div className="active-rate compact-active-rate">
                <div className="active-rate-content">
                  <span className="active-rate-label">Current Active Rate (VAT Inclusive)</span>
                  <strong className="active-rate-amount">
                    {active ? `${peso(active.rate_per_m3)} / m³` : 'Not configured'}
                  </strong>
                </div>
                <div className="active-rate-meta">
                  <small>
                    {active
                      ? `Effective ${dateLabel(active.effective_from)}`
                      : 'Billing blocked until configured'}
                  </small>
                </div>
              </div>

              <form className="compact-rate-form" onSubmit={save}>
                <div className="compact-rate-inputs-row">
                  <label className="compact-field">
                    <span>New Rate per m³ (PHP, VAT Inclusive)</span>
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

                  <label className="compact-field">
                    <span>Effective Date</span>
                    <input
                      required
                      type="date"
                      value={form.effective_from}
                      onChange={(e) => setForm({ ...form, effective_from: e.target.value })}
                    />
                  </label>
                </div>

                <label className="compact-field">
                  <span>Reason for Rate Change</span>
                  <input
                    required
                    type="text"
                    maxLength="500"
                    value={form.reason}
                    onChange={(e) => setForm({ ...form, reason: e.target.value })}
                    placeholder="State the approval or board resolution for this rate"
                  />
                </label>

                <button className="button button-primary compact-save-btn" disabled={busy}>
                  {busy ? 'Saving…' : 'Save Cubic Rate'}
                </button>
              </form>
            </section>

            {/* Container 2: Sample Bill Calculator (Compact) */}
            <aside className="panel rate-preview compact-rate-calculator">
              <div className="panel-heading">
                <div>
                  <h2>Sample Bill Calculator</h2>
                  <p>Simulate consumer charges at approved rate</p>
                </div>
              </div>

              <div className="calc-input-row">
                <label className="calc-input-label" htmlFor="sample-calc-consumption">
                  Sample Consumption
                </label>
                <div className="calc-input-wrap">
                  <input
                    id="sample-calc-consumption"
                    type="number"
                    min="0"
                    step="0.01"
                    value={usage}
                    onChange={(e) => setUsage(e.target.value)}
                    placeholder="20"
                  />
                  <span className="calc-unit-tag">m³</span>
                </div>
              </div>

              <div className="calc-breakdown-table">
                <div className="calc-item">
                  <span>Consumption</span>
                  <strong>{previewUsage.toFixed(2)} m³</strong>
                </div>
                <div className="calc-item">
                  <span>Rate per m³</span>
                  <strong>{peso(previewRate)}</strong>
                </div>
                <div className="calc-item">
                  <span>VATable Sale</span>
                  <strong>{peso(previewVat.vatableSale)}</strong>
                </div>
                <div className="calc-item">
                  <span>12% VAT (Inclusive)</span>
                  <strong>{peso(previewVat.vatAmount)}</strong>
                </div>
                <div className="calc-item calc-total-item">
                  <span>Total Water Charge (VAT Inclusive)</span>
                  <strong>{peso(previewVat.gross)}</strong>
                </div>
              </div>
            </aside>
          </div>

          {/* Container 3: Rate Change History (Full Width Ledger Below) */}
          <section className="panel rate-history compact-rate-history">
            <div className="panel-heading">
              <div>
                <h2>Rate Change History</h2>
                <p>Audit trail of all approved residential water tariffs</p>
              </div>
            </div>

            {logs.length ? (
              <div className="table-scroll">
                <table className="compact-history-table">
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
                    {logs.map((log) => (
                      <tr key={log.id}>
                        <td>{dateLabel(log.effective_from)}</td>
                        <td className="rate-val-cell">
                          <strong>{peso(log.rate_per_m3)} / m³</strong>
                        </td>
                        <td className="rate-desc-cell">{log.reason}</td>
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
          </section>
        </>
      )}
    </div>
  )
}
