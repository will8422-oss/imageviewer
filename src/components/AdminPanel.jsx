import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'

// ── Palette (matches app) ─────────────────────────────────────────────────────
const BG       = '#0f0d0b'
const SURFACE  = '#1a1714'
const BORDER   = '#2a2420'
const BORDER2  = '#2a2118'
const GOLD     = '#d4a843'
const TEXT     = '#e8e0d5'
const MUTED    = '#8b7b6a'
const DIM      = '#4a4038'
const CG       = "'Cormorant Garamond', Georgia, serif"

// ── Main component ────────────────────────────────────────────────────────────
export default function AdminPanel({ onPendingCountChange }) {
  const [tab,      setTab]      = useState('users')
  const [profiles, setProfiles] = useState([])
  const [fetching, setFetching] = useState(true)
  const [fetchErr, setFetchErr] = useState(null)
  const [busy,     setBusy]     = useState(null)   // user id of in-flight action

  const loadProfiles = async () => {
    setFetching(true)
    setFetchErr(null)
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) {
      setFetchErr(error.message)
    } else {
      setProfiles(data || [])
      const count = (data || []).filter(p => p.role === 'pending').length
      onPendingCountChange?.(count)
    }
    setFetching(false)
  }

  useEffect(() => { loadProfiles() }, [])

  const runAction = async (action, target_user_id, role) => {
    setBusy(target_user_id)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/.netlify/functions/manage-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ action, target_user_id, role }),
      })
      const body = await res.json()
      if (!res.ok) {
        alert(`Error: ${body.error}`)
      } else {
        await loadProfiles()
      }
    } catch (e) {
      alert(`Error: ${e.message}`)
    }
    setBusy(null)
  }

  const pending  = profiles.filter(p => p.role === 'pending')
  const active   = profiles.filter(p => ['viewer', 'researcher', 'admin'].includes(p.role))
  const rejected = profiles.filter(p => p.role === 'rejected')

  return (
    <div style={{ backgroundColor: BG, minHeight: 'calc(100vh - 56px)', padding: '2.5rem 2rem 5rem' }}>
      <div style={{ maxWidth: '960px', margin: '0 auto' }}>

        <h2 style={{ fontFamily: CG, fontSize: '1.8rem', fontWeight: '400', color: TEXT, margin: '0 0 2rem', letterSpacing: '0.02em' }}>
          Admin Panel
        </h2>

        {/* ── Tabs ────────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${BORDER}`, marginBottom: '2.5rem' }}>
          {[['users', 'Users'], ['editlog', 'Edit Log']].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                background   : 'none',
                border       : 'none',
                borderBottom : tab === key ? `2px solid ${GOLD}` : '2px solid transparent',
                color        : tab === key ? TEXT : MUTED,
                fontSize     : '0.82rem',
                fontWeight   : tab === key ? '600' : '400',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                padding      : '0.5rem 1.5rem 0.75rem 0',
                cursor       : 'pointer',
                marginBottom : '-1px',
                fontFamily   : 'inherit',
                display      : 'flex',
                alignItems   : 'center',
                gap          : '0.5rem',
              }}
            >
              {label}
              {key === 'users' && pending.length > 0 && (
                <span style={{ backgroundColor: GOLD, color: '#12100d', borderRadius: '2px', fontSize: '0.6rem', fontWeight: '700', padding: '1px 5px', lineHeight: 1.6 }}>
                  {pending.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Edit Log tab ─────────────────────────────────────────────────── */}
        {tab === 'editlog' && (
          <div style={{ textAlign: 'center', padding: '5rem 0', color: DIM, fontFamily: CG, fontSize: '1rem', fontStyle: 'italic' }}>
            Edit history will appear here once the metadata editor is enabled.
          </div>
        )}

        {/* ── Users tab ────────────────────────────────────────────────────── */}
        {tab === 'users' && (
          fetching ? (
            <p style={{ color: MUTED, fontFamily: CG, fontSize: '1rem' }}>Loading…</p>
          ) : fetchErr ? (
            <p style={{ color: '#c0694a', fontSize: '0.875rem' }}>{fetchErr}</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3rem' }}>

              {/* PENDING */}
              <Section title="Pending approval" count={pending.length}>
                {pending.length === 0 ? (
                  <Empty>No pending requests.</Empty>
                ) : (
                  <UserTable cols={['Full name', 'Email', 'Registered', 'Actions']}>
                    {pending.map(p => (
                      <tr key={p.id}>
                        <Td>{p.full_name || '—'}</Td>
                        <Td>{p.email}</Td>
                        <Td dim>{fmtDate(p.created_at)}</Td>
                        <Td>
                          <ActionRow>
                            <Btn variant="gold"   disabled={busy === p.id} onClick={() => runAction('approve', p.id, 'viewer')}>Approve as Viewer</Btn>
                            <Btn variant="gold"   disabled={busy === p.id} onClick={() => runAction('approve', p.id, 'researcher')}>Approve as Researcher</Btn>
                            <Btn variant="danger" disabled={busy === p.id} onClick={() => runAction('reject', p.id)}>Reject</Btn>
                          </ActionRow>
                        </Td>
                      </tr>
                    ))}
                  </UserTable>
                )}
              </Section>

              {/* ACTIVE */}
              <Section title="Active users" count={active.length}>
                {active.length === 0 ? (
                  <Empty>No active users.</Empty>
                ) : (
                  <UserTable cols={['Full name', 'Email', 'Role', 'Approved', 'Actions']}>
                    {active.map(p => (
                      <tr key={p.id}>
                        <Td>{p.full_name || '—'}</Td>
                        <Td>{p.email}</Td>
                        <Td><RolePill role={p.role} /></Td>
                        <Td dim>{fmtDate(p.approved_at)}</Td>
                        <Td>
                          <ActionRow>
                            <RoleDropdown
                              current={p.role}
                              disabled={busy === p.id}
                              onChange={(role) => runAction('change_role', p.id, role)}
                            />
                            <Btn variant="muted" disabled={busy === p.id} onClick={() => runAction('suspend', p.id)}>Suspend</Btn>
                          </ActionRow>
                        </Td>
                      </tr>
                    ))}
                  </UserTable>
                )}
              </Section>

              {/* REJECTED */}
              <Section title="Rejected users" count={rejected.length}>
                {rejected.length === 0 ? (
                  <Empty>No rejected users.</Empty>
                ) : (
                  <UserTable cols={['Full name', 'Email', 'Rejected', 'Actions']}>
                    {rejected.map(p => (
                      <tr key={p.id}>
                        <Td>{p.full_name || '—'}</Td>
                        <Td>{p.email}</Td>
                        <Td dim>{fmtDate(p.created_at)}</Td>
                        <Td>
                          <Btn variant="muted" disabled={busy === p.id} onClick={() => runAction('reinstate', p.id)}>Reinstate</Btn>
                        </Td>
                      </tr>
                    ))}
                  </UserTable>
                )}
              </Section>

            </div>
          )
        )}

      </div>
    </div>
  )
}

// ── Layout sub-components ─────────────────────────────────────────────────────

function Section({ title, count, children }) {
  return (
    <section>
      <h3 style={{ fontFamily: CG, fontSize: '1.1rem', fontWeight: '400', color: TEXT, margin: '0 0 1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        {title}
        <span style={{ fontSize: '0.65rem', fontWeight: '400', fontFamily: 'inherit', backgroundColor: '#2a2118', border: '1px solid #3a3020', color: MUTED, borderRadius: '2px', padding: '1px 6px' }}>
          {count}
        </span>
      </h3>
      {children}
    </section>
  )
}

function UserTable({ cols, children }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
        <thead>
          <tr>
            {cols.map(c => (
              <th key={c} style={{ textAlign: 'left', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.12em', color: DIM, padding: '0 1.5rem 0.625rem 0', borderBottom: `1px solid ${BORDER}`, fontWeight: '400', whiteSpace: 'nowrap' }}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

function Td({ children, dim }) {
  return (
    <td style={{ padding: '0.75rem 1.5rem 0.75rem 0', borderBottom: `1px solid #1a1714`, color: dim ? DIM : MUTED, verticalAlign: 'middle' }}>
      {children}
    </td>
  )
}

function ActionRow({ children }) {
  return <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>{children}</div>
}

function Empty({ children }) {
  return <p style={{ fontSize: '0.82rem', color: DIM, fontStyle: 'italic', margin: 0, fontFamily: CG }}>{children}</p>
}

// ── Action widgets ────────────────────────────────────────────────────────────

function Btn({ children, onClick, disabled, variant }) {
  const styles = {
    gold:   { bg: '#2a2118', border: '#3a3020', color: GOLD     },
    danger: { bg: '#2a1414', border: '#4a2020', color: '#c0694a' },
    muted:  { bg: '#1a1714', border: BORDER,    color: MUTED    },
  }
  const c = styles[variant] || styles.muted
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        backgroundColor: c.bg,
        border         : `1px solid ${c.border}`,
        borderRadius   : '3px',
        color          : disabled ? DIM : c.color,
        fontSize       : '0.72rem',
        padding        : '0.3rem 0.625rem',
        cursor         : disabled ? 'default' : 'pointer',
        fontFamily     : 'inherit',
        opacity        : disabled ? 0.5 : 1,
        whiteSpace     : 'nowrap',
        transition     : 'opacity 0.15s',
      }}
    >
      {children}
    </button>
  )
}

function RoleDropdown({ current, onChange, disabled }) {
  return (
    <select
      value={current}
      disabled={disabled}
      onChange={e => onChange(e.target.value)}
      style={{
        backgroundColor: '#12100d',
        border         : `1px solid ${BORDER}`,
        borderRadius   : '3px',
        color          : MUTED,
        fontSize       : '0.72rem',
        padding        : '0.3rem 0.5rem',
        cursor         : disabled ? 'default' : 'pointer',
        fontFamily     : 'inherit',
        opacity        : disabled ? 0.5 : 1,
      }}
    >
      {['viewer', 'researcher', 'admin'].map(r => (
        <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
      ))}
    </select>
  )
}

function RolePill({ role }) {
  const c = {
    viewer    : { bg: '#1a2018', border: '#2a3828', color: '#6a9a5a' },
    researcher: { bg: '#1a1820', border: '#282838', color: '#6a6a9a' },
    admin     : { bg: '#201a10', border: '#3a3020', color: GOLD      },
  }[role] || { bg: '#1a1714', border: BORDER, color: DIM }
  return (
    <span style={{ fontSize: '0.62rem', fontWeight: '600', letterSpacing: '0.05em', textTransform: 'uppercase', backgroundColor: c.bg, border: `1px solid ${c.border}`, borderRadius: '2px', color: c.color, padding: '0.15rem 0.4rem' }}>
      {role}
    </span>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
