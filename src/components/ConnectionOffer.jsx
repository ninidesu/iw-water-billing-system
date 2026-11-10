import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { peso, dateLabel } from '../lib/format.js'
import { Notice } from './UI.jsx'

export default function ConnectionOffer({ applicationId, reference, token = null, status, updated }) {
  const [offer, setOffer] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    supabase.rpc('read_connection_offer', { p_reference: reference, p_token: token }).then(({ data, error: rpcError }) => {
      if (!active) return
      setOffer(data?.[0] || null)
      const isMissingRpc = rpcError?.message?.includes('Could not find the function') || rpcError?.code === 'PGRST202'
      setError(isMissingRpc ? '' : (rpcError?.message || ''))
    })
    return () => { active = false }
  }, [reference, token, status])

  async function submit(event) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    setBusy(true); setError('')
    try {
      const { error: rpcError } = offer
        ? await supabase.rpc('accept_connection_offer', { p_reference: reference, p_token: token })
        : await supabase.rpc('issue_connection_offer', { p_application: applicationId, p_amount: fields.get('amount'), p_agreement: fields.get('agreement') })
      if (rpcError) throw rpcError
      updated()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (!offer && !(applicationId && status === 'estimate')) return error ? <Notice type="error">{error}</Notice> : null

  return (
    <section className="checklist compact-checklist">
      <div className="compact-checklist-heading">
        <strong>Connection Estimate & Agreement</strong>
      </div>
      <Notice type="error">{error}</Notice>
      <form onSubmit={submit} className="compact-offer-form">
        {offer ? (
          <div className="compact-offer-details">
            <div className="compact-offer-amount">Approved Charges: <strong>{peso(offer.amount)}</strong></div>
            <p className="compact-offer-text">{offer.agreement}</p>
            {offer.accepted_at ? (
              <span className="compact-accepted-tag">✓ Agreement accepted {dateLabel(offer.accepted_at)}</span>
            ) : status === 'approval' && (
              <button className="button button-small" disabled={busy}>
                {applicationId ? 'Record signed agreement' : 'Accept estimate'}
              </button>
            )}
          </div>
        ) : (
          <div className="compact-offer-inputs">
            <div className="compact-offer-row">
              <label className="compact-offer-label">
                <span>Charges (₱)</span>
                <input name="amount" type="number" required min="0" step="0.01" placeholder="0.00" className="compact-input" />
              </label>
            </div>
            <label className="compact-offer-label">
              <span>Service Agreement Terms</span>
              <textarea name="agreement" required rows="2" placeholder="Terms of connection agreement..." className="compact-textarea" />
            </label>
            <button className="button button-small" disabled={busy}>Issue Estimate</button>
          </div>
        )}
      </form>
    </section>
  )
}

