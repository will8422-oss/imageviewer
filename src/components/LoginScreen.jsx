export default function LoginScreen() {
  const handleLogin = () => {
    window.netlifyIdentity?.open('login')
  }

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.logoWrap}>
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" style={{ display: 'block' }}>
            <rect width="32" height="32" rx="4" fill="#1a1a1a" />
            <text x="16" y="22" textAnchor="middle" fill="white" fontSize="14" fontFamily="Georgia, serif" fontWeight="bold">H</text>
          </svg>
        </div>
        <h1 style={s.title}>Hallmark Reference Archive</h1>
        <p style={s.org}>London Assay Office</p>
        <p style={s.desc}>
          A restricted-access archive of hallmark reference images for committee use.
        </p>
        <button onClick={handleLogin} style={s.btn}>
          Sign in
        </button>
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
    backgroundColor: '#f5f5f0',
    padding: '1rem',
  },
  card: {
    background: 'white',
    padding: '3rem 2.5rem',
    borderRadius: '6px',
    boxShadow: '0 2px 24px rgba(0,0,0,0.07)',
    textAlign: 'center',
    maxWidth: '380px',
    width: '100%',
  },
  logoWrap: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: '1.5rem',
  },
  title: {
    fontSize: '1.25rem',
    fontWeight: '700',
    color: '#1a1a1a',
    margin: '0 0 0.375rem',
    fontFamily: 'Georgia, serif',
    lineHeight: 1.3,
  },
  org: {
    fontSize: '0.75rem',
    color: '#9ca3af',
    margin: '0 0 1.5rem',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
  },
  desc: {
    fontSize: '0.875rem',
    color: '#6b7280',
    lineHeight: 1.6,
    margin: '0 0 2rem',
  },
  btn: {
    backgroundColor: '#1a1a1a',
    color: 'white',
    border: 'none',
    padding: '0.75rem 2.5rem',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.875rem',
    letterSpacing: '0.04em',
    fontWeight: '500',
  },
}
