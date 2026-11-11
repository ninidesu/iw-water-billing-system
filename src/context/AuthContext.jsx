import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'

const AuthContext = createContext(null)
const STAFF_INACTIVITY_TIMEOUT_MS = 20 * 60 * 1000 // 20 minutes
const ACTIVITY_STORAGE_KEY = 'iw_staff_last_activity'

export function AuthProvider({ children }) {
  const navigate = useNavigate()
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [identityError, setIdentityError] = useState('')
  const [guestFlow, setGuestFlow] = useState(false)
  const generation = useRef(0)
  const lastRecordedRef = useRef(0)

  const loadIdentity = useCallback(async (currentSession) => {
    const id = ++generation.current
    if (!currentSession?.user) {
      setSession(null)
      setProfile(null)
      setIdentityError('')
      setLoading(false)
      return
    }
    setSession(currentSession)
    setLoading(true)
    try {
      const { data: nextProfile, error } = await supabase.from('profiles').select('*').eq('id', currentSession.user.id).single()
      if (error) throw error
      if (!['admin', 'cashier', 'customer'].includes(nextProfile?.role)) throw new Error('Your account has no assigned role. Contact the administrator.')
      if (id === generation.current) {
        setProfile(nextProfile)
        setIdentityError('')
      }
    } catch (error) {
      if (id === generation.current) {
        console.error('Could not load account:', error)
        setProfile(null)
        setIdentityError(error.message || 'Could not load your account.')
      }
    } finally {
      if (id === generation.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (active) loadIdentity(data.session)
    }).catch(() => { if (active) setLoading(false) })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      // Delay database requests until the auth callback releases its internal lock.
      setTimeout(() => { if (active) loadIdentity(nextSession) }, 0)
    })
    return () => { active = false; subscription.unsubscribe(); generation.current += 1 }
  }, [loadIdentity])

  const refreshIdentity = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    await loadIdentity(data.session)
  }, [loadIdentity])

  const signOut = useCallback(async () => {
    try {
      localStorage.removeItem(ACTIVITY_STORAGE_KEY)
    } catch {}
    await supabase.auth.signOut()
    await loadIdentity(null)
  }, [loadIdentity])

  const signIn = useCallback(async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) throw error
    const { data: nextProfile, error: profileError } = await supabase.from('profiles').select('role').eq('id', data.user.id).single()
    if (profileError || !['admin', 'cashier', 'customer'].includes(nextProfile?.role)) {
      await supabase.auth.signOut()
      await loadIdentity(null)
      throw new Error('Your account has no assigned role. Contact the administrator.')
    }
    try {
      localStorage.setItem(ACTIVITY_STORAGE_KEY, Date.now().toString())
    } catch {}
    await loadIdentity(data.session)
    return nextProfile.role
  }, [loadIdentity])

  // 20-minute inactivity auto-logout for staff workspaces (admin & cashier)
  useEffect(() => {
    const isStaff = profile?.role === 'admin' || profile?.role === 'cashier'
    if (!isStaff) return undefined

    const now = Date.now()
    if (!localStorage.getItem(ACTIVITY_STORAGE_KEY)) {
      try {
        localStorage.setItem(ACTIVITY_STORAGE_KEY, now.toString())
      } catch {}
    }
    lastRecordedRef.current = now

    const handleTimeout = async () => {
      try {
        localStorage.removeItem(ACTIVITY_STORAGE_KEY)
        await supabase.auth.signOut()
        await loadIdentity(null)
      } catch (err) {
        console.error('Inactivity signout error:', err)
      } finally {
        navigate('/portal?timeout=1', { replace: true })
      }
    }

    const checkInactivity = () => {
      const raw = localStorage.getItem(ACTIVITY_STORAGE_KEY)
      const lastActivity = raw ? Number(raw) : Date.now()
      if (Date.now() - lastActivity >= STAFF_INACTIVITY_TIMEOUT_MS) {
        handleTimeout()
      }
    }

    const recordActivity = () => {
      const current = Date.now()
      const raw = localStorage.getItem(ACTIVITY_STORAGE_KEY)
      const lastActivity = raw ? Number(raw) : current

      // If already past the 20-min inactivity limit, immediately trigger logout
      if (current - lastActivity >= STAFF_INACTIVITY_TIMEOUT_MS) {
        handleTimeout()
        return
      }

      // Throttle localStorage updates to at most once every 5 seconds
      if (current - lastRecordedRef.current > 5000) {
        lastRecordedRef.current = current
        try {
          localStorage.setItem(ACTIVITY_STORAGE_KEY, current.toString())
        } catch {}
      }
    }

    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'wheel']
    events.forEach((evt) => {
      window.addEventListener(evt, recordActivity, { passive: true })
    })

    const intervalId = window.setInterval(checkInactivity, 10000)

    const handleStorage = (e) => {
      if (e.key === ACTIVITY_STORAGE_KEY && !e.newValue) {
        handleTimeout()
      }
    }
    window.addEventListener('storage', handleStorage)

    return () => {
      events.forEach((evt) => {
        window.removeEventListener(evt, recordActivity)
      })
      window.clearInterval(intervalId)
      window.removeEventListener('storage', handleStorage)
    }
  }, [profile?.role, loadIdentity, navigate])

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user,
        profile,
        role: profile?.role,
        loading,
        identityError,
        guestFlow,
        setGuestFlow,
        refreshIdentity,
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
