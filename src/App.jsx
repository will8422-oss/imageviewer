import { useState, useEffect } from 'react'
import LoginScreen from './components/LoginScreen.jsx'
import HallmarkArchive from '../hallmark-archive.jsx'

export default function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (window.netlifyIdentity) {
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
      window.netlifyIdentity.init()
    } else {
      // netlify-identity-widget not loaded (local dev without netlify dev)
      setLoading(false)
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
