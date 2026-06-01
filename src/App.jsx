import { useState, useEffect, useRef } from 'react'
import { supabase } from './lib/supabase.js'
import LoginScreen from './components/LoginScreen.jsx'
import HallmarkArchive from '../hallmark-archive.jsx'

const CG = "'Cormorant Garamond', Georgia, serif"

// Profile fetch with timeout and retries
async function fetchProfile(userId, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const query   = supabase.from('profiles').select('role, full_name, email').eq('id', userId).single()
    const timeout = new Promise(resolve =>
      setTimeout(() => resolve({ data: null, error: { message: 'timeout' } }), 10000)
    )
    const { data, error } = await Promise.race([query, timeout])
    if (data) return { data, error: null }
    if (attempt < maxAttempts) await new Promise(r => setTimeout(r, 2000))
    if (attempt === maxAttempts) return { data: null, error }
  }
}

export default function App() {
  const [session,      setSession]      = useState(null)
  const [profile,      setProfile]      = useState(null)
  const [loading,      setLoading]      = useState(true)
  const [profileError, setProfileError] = useState(null)  // null | 'timeout' | 'error'

  const sessionRef = useRef(null)
  useEffect(() => { sessionRef.current = session }, [session])

  const lastFetchedUserIdRef = useRef(null)

  // Fetch profile, set state, do a single background retry if role is pending
  // (handles the case where the DB trigger hasn't fired yet at the moment of login)
  const doLoadProfile = async (userId) => {
    setProfileError(null)
    const { data, error } = await fetchProfile(userId)

    if (error || !data) {
      setProfileError(error?.message === 'timeout' ? 'timeout' : 'error')
      return
    }

    setProfile(data)

    // If still pending, re-check once after 2 s in the background without blocking
    // the loading screen — the profile state will update if the role changed
    if (data.role === 'pending') {
      setTimeout(async () => {
        await new Promise(r => setTimeout(r, 2000))
        const { data: d2 } = await supabase
          .from('profiles').select('role, full_name, email').eq('id', userId).single()
        if (d2) setProfile(d2)
      }, 0)
    }
  }

  // Manual re-check used by the Refresh button on the pending screen
  const refreshProfile = async () => {
    const s = sessionRef.current
    if (!s) return
    setProfileError(null)
    const { data, error } = await fetchProfile(s.user.id)
    if (error || !data) {
      setProfileError(error?.message === 'timeout' ? 'timeout' : 'error')
    } else {
      setProfile(data)
    }
  }

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        // Token refresh or user metadata update — just keep the new session, no profile re-fetch
        if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
          setSession(session)
          return
        }

        if (event === 'SIGNED_OUT') {
          setSession(null)
          setProfile(null)
          setProfileError(null)
          lastFetchedUserIdRef.current = null
          setLoading(false)
          return
        }

        // INITIAL_SESSION, SIGNED_IN
        // SIGNED_IN re-fires on tab focus; only fetch profile when the user actually changes
        setSession(session)
        if (session && session.user.id !== lastFetchedUserIdRef.current) {
          lastFetchedUserIdRef.current = session.user.id
          setLoading(true)   // keep loading until profile resolves — prevents pending flash
          await doLoadProfile(session.user.id)
        }
        setLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, []) // eslint-disable-line

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ position: 'fixed', inset: 0, backgroundColor: '#12100d', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <style>{`@keyframes app-pulse{0%,100%{opacity:.25;transform:scale(.88)}50%{opacity:1;transform:scale(1.12)}}.app-pulse{animation:app-pulse 1.8s ease-in-out infinite}`}</style>
        <span className="app-pulse" style={{ fontSize: '2rem', color: '#d4a843', userSelect: 'none' }}>⚜</span>
      </div>
    )
  }

  if (!session) return <LoginScreen />

  // ── Profile error ──────────────────────────────────────────────────────────
  if (profileError) {
    return (
      <div style={s.center}>
        <div style={s.statusWrap}>
          <p style={s.heading}>Unable to load your profile.</p>
          <p style={s.body}>Please refresh the page or sign out and try again.</p>
          <div style={s.btnRow}>
            <button onClick={() => window.location.reload()} style={s.actionBtn}>Refresh page</button>
            <button onClick={() => supabase.auth.signOut()} style={s.signOutBtn}>Sign out</button>
          </div>
        </div>
      </div>
    )
  }

  const role = profile?.role

  // ── Pending ────────────────────────────────────────────────────────────────
  if (!role || role === 'pending') {
    return (
      <div style={s.center}>
        <div style={s.statusWrap}>
          <p style={s.heading}>Your account is awaiting approval.</p>
          <p style={s.body}>You will receive an email when access is granted.</p>
          <div style={s.btnRow}>
            <button onClick={refreshProfile} style={s.actionBtn}>Refresh</button>
            <button onClick={() => supabase.auth.signOut()} style={s.signOutBtn}>Sign out</button>
          </div>
        </div>
      </div>
    )
  }

  // ── Rejected ───────────────────────────────────────────────────────────────
  if (role === 'rejected') {
    return (
      <div style={s.center}>
        <div style={s.statusWrap}>
          <p style={s.heading}>Your access request was not approved.</p>
          <p style={s.body}>Please contact the London Assay Office for further information.</p>
          <button onClick={() => supabase.auth.signOut()} style={s.signOutBtn}>Sign out</button>
        </div>
      </div>
    )
  }

  // ── Authenticated: viewer | researcher | admin ──────────────────────────────
  return (
    <HallmarkArchive
      user={{ email: session.user.email, id: session.user.id }}
      role={role}
    />
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = {
  center: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    backgroundColor: '#12100d',
    padding: '2rem',
  },
  statusWrap: {
    textAlign: 'center',
    maxWidth: '400px',
  },
  heading: {
    fontFamily: CG,
    fontSize: '1.25rem',
    fontWeight: '400',
    color: '#c8b88a',
    margin: '0 0 0.75rem',
    lineHeight: 1.4,
  },
  body: {
    fontSize: '0.875rem',
    color: '#8b7b6a',
    lineHeight: 1.6,
    margin: '0 0 1.75rem',
  },
  btnRow: {
    display: 'flex',
    gap: '0.875rem',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionBtn: {
    backgroundColor: '#2a2118',
    border: '1px solid #3a3020',
    borderRadius: '3px',
    color: '#c8b88a',
    fontSize: '0.8rem',
    padding: '0.45rem 1rem',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  signOutBtn: {
    fontSize: '0.75rem',
    color: '#6a5a3a',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    textDecoration: 'underline',
    padding: 0,
    fontFamily: 'inherit',
  },
}
