import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import AuthScreen from './AuthScreen.jsx'
import { SocialSignIn } from './SocialSignIn.jsx'
import { supabase } from '../../lib/supabaseClient.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { Notice } from '../../components/UI.jsx'
import { errorMessage } from '../../lib/format.js'

export default function Login() {
  const navigate = useNavigate()
  const { state } = useLocation()
  const { refreshIdentity, setGuestFlow } = useAuth()
  useEffect(() => { setGuestFlow(true); return () => setGuestFlow(false) }, [setGuestFlow])
  const [passwordStep,setPasswordStep] = useState(false)
  const [more,setMore] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [resetBusy, setResetBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const submit = async (event) => {
    event.preventDefault(); setError(''); setMessage('')
    if (!passwordStep) { setPasswordStep(true); return }
    setBusy(true)
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (signInError) throw signInError
      const { data: profile, error: profileError } = await supabase.from('profiles').select('role').eq('id', data.user.id).single()
      if (profileError) throw profileError
      if (profile.role === 'admin' || profile.role === 'cashier') {
        await supabase.auth.signOut()
        setError('Staff must log in at the staff portal.')
        return
      }
      await refreshIdentity()
      navigate(state?.from?.startsWith('/customer/') ? state.from : '/customer/dashboard', { replace: true })
    } catch (err) { setError(errorMessage(err)) }
    finally { setBusy(false) }
  }

  const sendEmail = async recovery => {
    setError(''); setMessage('')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError('Enter a valid email address first.'); return }
    setResetBusy(true)
    try {
      const result = recovery
        ? await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin+'/reset-password' })
        : await supabase.auth.signInWithOtp({ email:email.trim(),options:{shouldCreateUser:false,emailRedirectTo:window.location.origin+'/auth/return'} })
      if (result.error) throw result.error
      setMessage('If that address is registered, check your email for the link.')
    } catch(err) { setError(errorMessage(err)) }
    finally { setResetBusy(false) }
  }

  return <AuthScreen>
    <Notice type="error">{error}</Notice><Notice type="success">{message}</Notice>
    <form onSubmit={submit} className="form-stack">
      <label>Email address<input type="email" autoComplete="email" required
        value={email} onChange={event=>setEmail(event.target.value)}/></label>
      {passwordStep && <>
        <label>Password<input autoFocus type="password" autoComplete="current-password" required
          value={password} onChange={event=>setPassword(event.target.value)}/></label>
        <button type="button" className="iw-auth-link" disabled={resetBusy} onClick={()=>sendEmail(true)}>{resetBusy?'Sending reset link…':'Forgot password?'}</button>
      </>}
      <div className="iw-auth-submit"><button className="button" disabled={busy}>{busy?'Signing in…':passwordStep?'Sign in':'Continue'}</button></div>
    </form>
    {!passwordStep && <SocialSignIn from={state?.from}/>}
    <div className="iw-auth-more"><button type="button" className="iw-auth-link" aria-expanded={more} onClick={()=>setMore(!more)}>More sign-in options</button>
      {more && <button type="button" className="iw-provider-extra" disabled={resetBusy} onClick={()=>sendEmail(false)}>Email me a sign-in link</button>}
    </div>
  </AuthScreen>
}
