import { useState, useEffect } from 'react'
import LoginScreen from './components/LoginScreen.jsx'
import HallmarkArchive from '../hallmark-archive.jsx'

export default function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!window.netlifyIdentity) {
      setLoading(false)
      return
    }

    window.netlifyIdentity.on('init', (u) => {
      setUser(u)
      setLoading(false)
    })

    window.netlifyIdentity.on('login', (u) => {
      setUser(u)
      window.netlifyIdentity.close()
    })

    window.netlifyIdentity.on('logout', () => {
      setUser(null)
    })

    window.netlifyIdentity.on('error', (err) => {
      console.error('Netlify Identity error:', err)
      setLoading(false)
    })

    window.netlifyIdentity.init()

    // If the URL has an identity token (invite, recovery, confirmation),
    // open the widget so it can process the token and complete the flow.
    const hash = window.location.hash
    if (hash && hash.length > 1) {
      const params = new URLSearchParams(hash.replace('#', ''))
      const hasToken =
        params.has('invite_token') ||
        params.has('recovery_token') ||
        params.has('confirmation_token') ||
        params.has('access_token')
      if (hasToken) {
        // Small delay to let the widget initialise first
        setTimeout(() => window.netlifyIdentity?.open(), 300)
      }
    }
  }, [])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#9ca3af', fontFamily: 'Georgia, serif' }}>
        Loading…
      </div>
    )
  }

  if (!user) return <LoginScreen />

  return <HallmarkArchive user={user} />
}
