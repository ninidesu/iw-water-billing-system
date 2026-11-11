import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowRight, Droplet, Eye, EyeOff, Loader2, LockKeyhole, Mail } from 'lucide-react'
import { useAuth } from '../../context/AuthContext.jsx'
import { supabase } from '../../lib/supabaseClient.js'
import { Notice } from '../../components/UI.jsx'
import { errorMessage } from '../../lib/format.js'
import '../public/auth-screen.css'

export default function PortalLogin() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { signIn, signOut, setGuestFlow } = useAuth()
  useEffect(() => { setGuestFlow(true); return () => setGuestFlow(false) }, [setGuestFlow])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [capsLock, setCapsLock] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [helpNotice, setHelpNotice] = useState(false)
  const [timeoutNotice, setTimeoutNotice] = useState(
    searchParams.get('timeout') === '1' || searchParams.get('reason') === 'inactivity'
  )

  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const trimmed = email.trim()
      let loginEmail = trimmed

      // Resolve username to staff email
      if (!trimmed.includes('@')) {
        try {
          const { data: rpcEmail, error: rpcErr } = await supabase.rpc('resolve_staff_login', {
            p_identifier: trimmed,
          })
          if (!rpcErr && rpcEmail) {
            loginEmail = rpcEmail
          } else {
            loginEmail = `${trimmed.toLowerCase().replace(/\s+/g, '')}@isabelwaters.com`
          }
        } catch {
          loginEmail = `${trimmed.toLowerCase().replace(/\s+/g, '')}@isabelwaters.com`
        }
      }

      let role
      try {
        role = await signIn(loginEmail, password)
      } catch (signInErr) {
        // If username had spaces or numbers (e.g. "admin 1"), try base role account as fallback
        const lower = trimmed.toLowerCase()
        if (!trimmed.includes('@') && (lower.startsWith('admin') || lower.startsWith('cashier'))) {
          const baseEmail = `${lower.startsWith('admin') ? 'admin' : 'cashier'}@isabelwaters.com`
          if (baseEmail !== loginEmail) {
            role = await signIn(baseEmail, password)
          } else {
            throw signInErr
          }
        } else {
          throw signInErr
        }
      }

      if (!['admin', 'cashier'].includes(role)) {
        await signOut()
        setError('Access denied. Staff accounts only.')
        return
      }
      navigate(role === 'admin' ? '/admin' : '/cashier', { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const handleKeyState = (event) => {
    if (typeof event.getModifierState === 'function') {
      setCapsLock(event.getModifierState('CapsLock'))
    }
  }

  return (
    <div className="iw-auth-page">
      <main className="iw-auth-scene iw-auth-scene--staff">
        <section className="iw-auth-sheet iw-auth-sheet--staff" aria-labelledby="staff-portal-title">
          <div className="iw-auth-body">
            <p className="iw-staff-eyebrow">STAFF PORTAL</p>
            <h1 className="iw-staff-title" id="staff-portal-title">Welcome back</h1>
            <p className="iw-staff-subtitle">Authorized personnel only</p>

            <Notice type="error" onClose={() => setError('')}>{error}</Notice>
            {timeoutNotice && (
              <Notice type="info" onClose={() => setTimeoutNotice(false)}>
                You were logged out due to 20 minutes of inactivity. Please sign in again.
              </Notice>
            )}
            {helpNotice && (
              <Notice type="info" onClose={() => setHelpNotice(false)}>
                Please contact your system administrator or IT support to reset your staff credentials.
              </Notice>
            )}

            <form onSubmit={submit} className="form-stack">
              <div>
                <label className="iw-staff-label" htmlFor="staff-email">EMAIL / USERNAME</label>
                <div className="iw-input-dark-wrap">
                  <Mail size={16} className="iw-dark-icon" aria-hidden="true" />
                  <input
                    id="staff-email"
                    className="iw-input-dark"
                    type="text"
                    autoComplete="username"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="admin@isabelwaters.com"
                  />
                </div>
              </div>

              <div>
                <label className="iw-staff-label" htmlFor="staff-password">PASSWORD</label>
                <div className="iw-input-dark-wrap">
                  <LockKeyhole size={16} className="iw-dark-icon" aria-hidden="true" />
                  <input
                    id="staff-password"
                    className="iw-input-dark iw-input-dark--password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    onKeyUp={handleKeyState}
                    onKeyDown={handleKeyState}
                    onBlur={() => setCapsLock(false)}
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    className="iw-password-toggle"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {capsLock && <span className="iw-caps-hint">Caps Lock is on</span>}

                <div className="iw-password-help-center">
                  <button
                    type="button"
                    className="iw-help-forgot"
                    onClick={() => setHelpNotice(true)}
                  >
                    Forgot password?
                  </button>
                  <p className="iw-help-support">
                    Contact your admin or IT support
                  </p>
                </div>
              </div>

              <button className="button iw-staff-submit-btn" disabled={busy}>
                {busy ? (
                  <>
                    <Loader2 size={17} className="iw-spin" aria-hidden="true" />
                    Verifying…
                  </>
                ) : (
                  <>
                    Sign in <ArrowRight size={17} />
                  </>
                )}
              </button>
            </form>
          </div>
        </section>
      </main>

      <footer className="iw-auth-footer">
        <Link className="iw-auth-brand" to="/">
          <Droplet size={20} aria-hidden="true" /> Isabel Waters
        </Link>
        <nav aria-label="Footer">
          <Link to="/login">Customer Sign In</Link>
          <Link to="/">Home</Link>
        </nav>
      </footer>
    </div>
  )
}
