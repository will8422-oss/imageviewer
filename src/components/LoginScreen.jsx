import { useState } from 'react'
import { supabase } from '../lib/supabase.js'

const CG = "'Cormorant Garamond', Georgia, serif"

export default function LoginScreen() {
  const [mode,     setMode]     = useState('login')   // 'login' | 'register'
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(null)
  const [message,  setMessage]  = useState(null)

  const reset = (nextMode) => {
    setError(null)
    setMessage(null)
    setMode(nextMode)
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false) }
    // On success App's onAuthStateChange handles the rest
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    })
    if (error) {
      setError(error.message)
    } else {
      setMessage('Check your email to confirm your account. You will be notified when access is granted.')
    }
    setLoading(false)
  }

  return (
    <div style={s.page}>
      <div style={s.card}>

        {/* Logo */}
        <div style={s.logoWrap}>
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none" style={{ display: 'block' }}>
            <rect width="36" height="36" rx="4" fill="#1a1610" stroke="#3a3020" strokeWidth="1" />
            <text x="18" y="25" textAnchor="middle" fill="#d4a843" fontSize="16" fontFamily="Georgia, serif" fontWeight="bold">H</text>
          </svg>
        </div>

        <h1 style={s.title}>Hallmark Reference Archive</h1>
        <p style={s.org}>London Assay Office</p>

        {message ? (
          <div style={s.messageBox}>
            <p style={s.messageText}>{message}</p>
            <button onClick={() => reset('login')} style={s.linkBtn}>Back to sign in</button>
          </div>
        ) : (
          <form onSubmit={mode === 'login' ? handleLogin : handleRegister} style={s.form}>

            {mode === 'register' && (
              <div style={s.fieldWrap}>
                <label style={s.label}>Full name</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  required
                  autoComplete="name"
                  style={s.input}
                />
              </div>
            )}

            <div style={s.fieldWrap}>
              <label style={s.label}>Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                style={s.input}
              />
            </div>

            <div style={s.fieldWrap}>
              <label style={s.label}>Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                style={s.input}
              />
            </div>

            {error && <p style={s.error}>{error}</p>}

            <button type="submit" disabled={loading} style={{ ...s.btn, opacity: loading ? 0.6 : 1 }}>
              {loading ? '…' : mode === 'login' ? 'Sign in' : 'Request access'}
            </button>

            <p style={s.toggle}>
              {mode === 'login' ? (
                <>No account? <button type="button" onClick={() => reset('register')} style={s.linkBtn}>Request access</button></>
              ) : (
                <>Already registered? <button type="button" onClick={() => reset('login')} style={s.linkBtn}>Sign in</button></>
              )}
            </p>

          </form>
        )}
      </div>
    </div>
  )
}

const s = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#12100d',
    padding: '1rem',
  },
  card: {
    backgroundColor: '#19160f',
    border: '1px solid #3a3020',
    borderRadius: '6px',
    padding: '2.5rem 2.25rem',
    width: '100%',
    maxWidth: '360px',
    textAlign: 'center',
  },
  logoWrap: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: '1.25rem',
  },
  title: {
    fontFamily: CG,
    fontSize: '1.2rem',
    fontWeight: '400',
    color: '#c8b88a',
    margin: '0 0 0.3rem',
    lineHeight: 1.3,
  },
  org: {
    fontSize: '0.65rem',
    color: '#6a5a3a',
    margin: '0 0 1.75rem',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.875rem',
    textAlign: 'left',
  },
  fieldWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.3rem',
  },
  label: {
    fontSize: '10px',
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
    color: '#6a5a3a',
  },
  input: {
    backgroundColor: '#12100d',
    border: '1px solid #3a3020',
    borderRadius: '3px',
    color: '#c8b88a',
    fontSize: '0.875rem',
    padding: '0.5rem 0.625rem',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  },
  error: {
    fontSize: '0.78rem',
    color: '#c0694a',
    margin: 0,
    lineHeight: 1.4,
  },
  btn: {
    backgroundColor: '#d4a843',
    color: '#12100d',
    border: 'none',
    borderRadius: '3px',
    padding: '0.625rem',
    fontSize: '0.82rem',
    fontWeight: '600',
    letterSpacing: '0.04em',
    cursor: 'pointer',
    marginTop: '0.25rem',
    fontFamily: 'inherit',
  },
  toggle: {
    fontSize: '0.75rem',
    color: '#6a5a3a',
    margin: '0.25rem 0 0',
    textAlign: 'center',
  },
  linkBtn: {
    background: 'none',
    border: 'none',
    color: '#d4a843',
    cursor: 'pointer',
    fontSize: 'inherit',
    padding: 0,
    textDecoration: 'underline',
    fontFamily: 'inherit',
  },
  messageBox: {
    textAlign: 'center',
  },
  messageText: {
    fontSize: '0.875rem',
    color: '#8b7b6a',
    lineHeight: 1.6,
    margin: '0 0 1.25rem',
  },
}
