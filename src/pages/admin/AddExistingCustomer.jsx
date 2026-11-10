import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient.js'
import { useAdminData } from '../../hooks/useAdminData.js'
import { Notice, PageHeader } from '../../components/UI.jsx'

export default function AddExistingCustomer() {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const { refresh } = useAdminData()
  const navigate = useNavigate()
  const location = useLocation()
  const base = location.pathname.startsWith('/cashier') ? '/cashier' : '/admin'

  async function save(e) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setBusy(true)
    setError('')
    try {
      const { data, error } = await supabase.rpc('add_existing_customer', {
        p_name: f.get('name'),
        p_mobile: f.get('mobile'),
        p_email: f.get('email'),
        p_address: f.get('address'),
        p_type: f.get('type'),
        p_meter: f.get('meter'),
        p_reading: Number(f.get('reading')),
        p_connection: f.get('connection') || null,
        p_balance: Number(f.get('balance')),
        p_status: f.get('status'),
        p_notes: f.get('notes'),
      })
      if (error) throw error
      await refresh()
      navigate(`${base}/customers/${data}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page-content">
      <Link to={`${base}/customers`}>← Customers & Service Accounts</Link>
      <PageHeader
        title="Add existing customer"
        description="Transfer an already connected customer's offline record. A unique nine-digit CAN will be generated."
      />
      <Notice type="error">{error}</Notice>
      <section className="panel" style={{ padding: 24 }}>
        <form className="form-grid" onSubmit={save}>
          <label>Full name<input name="name" required maxLength={160} /></label>
          <label>Active mobile number<input name="mobile" type="tel" required maxLength={24} /></label>
          <label>Email address (optional)<input name="email" type="email" /></label>
          <label>Property type
            <select name="type" required>
              <option value="">Select type</option>
              {['Residential', 'Commercial', 'Institutional', 'Government', 'Other'].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className="span-2">Service address<input name="address" required /></label>
          <label>Meter number<input name="meter" required /></label>
          <label>Latest meter reading (m³)<input name="reading" type="number" min="0" step="0.01" required /></label>
          <label>Connection date (optional)<input name="connection" type="date" /></label>
          <label>Previous unpaid balance (PHP)
            <input name="balance" type="number" min="0" step="0.01" defaultValue="0" required />
            <small>Recorded separately; collection of opening balances is not yet available.</small>
          </label>
          <label>Account status
            <select name="status">
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
          <label>Legacy reference / notes<input name="notes" maxLength={500} /></label>
          <div className="form-actions span-2">
            <Link className="button button-ghost" to={`${base}/customers`}>Cancel</Link>
            <button className="button" disabled={busy}>{busy ? 'Saving…' : 'Add existing customer'}</button>
          </div>
        </form>
      </section>
    </div>
  )
}
