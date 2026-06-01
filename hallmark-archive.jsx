import { useState, useEffect } from 'react'
import { supabase }     from './src/lib/supabase.js'
import RecordCard      from './src/components/RecordCard.jsx'
import RecordModal     from './src/components/RecordModal.jsx'
import TimelineHeatmap from './src/components/TimelineHeatmap.jsx'
import OverviewPage    from './src/components/OverviewPage.jsx'
import AdminPanel      from './src/components/AdminPanel.jsx'

export default function HallmarkArchive({ user, role }) {
  // ── Shared data ─────────────────────────────────────────────────────────────
  const [allImages, setAllImages]   = useState([])
  const [records,   setRecords]     = useState([])
  const [loading,   setLoading]     = useState(true)
  const [error,     setError]       = useState(null)

  // ── Navigation ──────────────────────────────────────────────────────────────
  const [view, setView] = useState('overview')   // 'overview' | 'browse' | 'admin'

  // ── Admin: pending user count for header badge ───────────────────────────────
  const [pendingCount, setPendingCount] = useState(0)

  // ── Browse filters ──────────────────────────────────────────────────────────
  const [search,             setSearch]             = useState('')
  const [selectedMarkType,   setSelectedMarkType]   = useState('')
  const [selectedCollection, setSelectedCollection] = useState('')
  const [selectedSponsor,    setSelectedSponsor]    = useState('')
  const [activeCentury,      setActiveCentury]      = useState(null)
  const [activeYear,         setActiveYear]         = useState(null)
  const [activeDecade,       setActiveDecade]       = useState(null)
  const [showDimensions,     setShowDimensions]     = useState(false)
  const [selectedRecord,     setSelectedRecord]     = useState(null)

  useEffect(() => {
    fetchRecords(showDimensions)
  }, [showDimensions])

  const fetchRecords = async (showDims) => {
    setLoading(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch(
        `/.netlify/functions/search-images?show_dimensions=${showDims}`,
        { headers: { Authorization: `Bearer ${session?.access_token}` } }
      )
      if (!response.ok) {
        const body = await response.text()
        throw new Error(`Search failed ${response.status}: ${body}`)
      }
      const data   = await response.json()
      const assets = data.resources || []
      setAllImages(assets)

      const byGroup = {}
      for (const asset of assets) {
        const meta = asset.metadata || {}
        const gid  = meta.group_id || asset.public_id
        if (!byGroup[gid]) {
          byGroup[gid] = {
            group_id      : gid,
            object_name   : meta.object_name || '',
            mark_type     : meta.mark_type   || '',
            mark_type_2   : meta.mark_type_2 || '',
            year_range    : meta.year_range  || '',
            year          : meta.year ? Number(meta.year) : null,
            sponsor       : meta.sponsor     || '',
            collection    : meta.collection  || '',
            notes         : meta.notes       || '',
            tags          : asset.tags || [],
            public_id     : asset.public_id,
            primary_public_id: null,
            hasDimensions : false,
          }
        }
        if (meta.image_type === 'dimensions') {
          byGroup[gid].hasDimensions = true
        } else if (!byGroup[gid].primary_public_id) {
          byGroup[gid].primary_public_id = asset.public_id
        }
      }
      const recordsList = Object.values(byGroup).map(r => ({
        ...r,
        public_id: r.primary_public_id || r.public_id,
      }))
      setRecords(recordsList.sort((a, b) => (a.year || 0) - (b.year || 0)))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // ── Navigation handlers ──────────────────────────────────────────────────────
  const clearAllFilters = () => {
    setSearch('')
    setSelectedMarkType('')
    setSelectedCollection('')
    setSelectedSponsor('')
    setActiveCentury(null)
    setActiveYear(null)
    setActiveDecade(null)
  }

  const handleNavOverview = () => {
    clearAllFilters()
    setView('overview')
  }

  // Called from OverviewPage — applies a specific filter and navigates to Browse
  const navigateToBrowse = ({ year, markType, decade } = {}) => {
    clearAllFilters()
    if (year     != null) setActiveYear(year)
    if (markType != null) setSelectedMarkType(markType)
    if (decade   != null) setActiveDecade(decade)
    setView('browse')
  }

  // ── Browse filter logic ──────────────────────────────────────────────────────
  const q = search.toLowerCase()
  const filtered = records.filter(r => {
    const matchSearch =
      !q ||
      r.object_name?.toLowerCase().includes(q) ||
      r.group_id?.toLowerCase().includes(q) ||
      r.sponsor?.toLowerCase().includes(q) ||
      r.year_range?.toLowerCase().includes(q) ||
      r.mark_type?.toLowerCase().includes(q) ||
      r.mark_type_2?.toLowerCase().includes(q)
    const matchMarkType   = !selectedMarkType   || r.mark_type  === selectedMarkType
    const matchCollection = !selectedCollection || r.collection === selectedCollection
    const matchSponsor    = !selectedSponsor    || r.sponsor?.toLowerCase().includes(selectedSponsor.toLowerCase())
    const matchCentury    = !activeCentury      || (r.year && Math.ceil(r.year / 100) === activeCentury)
    const matchYear       = !activeYear         || r.year === activeYear
    const matchDecade     = !activeDecade       || (r.year && r.year >= activeDecade && r.year < activeDecade + 10)
    return matchSearch && matchMarkType && matchCollection && matchSponsor && matchCentury && matchYear && matchDecade
  })

  const markTypes  = [...new Set(records.map(r => r.mark_type).filter(Boolean))].sort()
  const collections = [...new Set(records.map(r => r.collection).filter(Boolean))].sort()
  const sponsors   = [...new Set(records.map(r => r.sponsor).filter(Boolean))].sort()
  const hasSponsorData = sponsors.length > 0

  const handleLogout = () => supabase.auth.signOut()

  const isDark = true

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', backgroundColor: view === 'overview' ? '#0f0d0b' : '#12100d' }}>

      {/* ── Shared header ──────────────────────────────────────────────────── */}
      <header style={{
        backgroundColor : isDark ? '#1a1714' : 'white',
        borderBottom    : `1px solid ${isDark ? '#2a2420' : '#e5e7eb'}`,
        padding         : '0 1.5rem',
        position        : 'sticky',
        top             : 0,
        zIndex          : 100,
        height          : '56px',
        display         : 'flex',
        alignItems      : 'center',
      }}>
        <div style={{ maxWidth: '1400px', width: '100%', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>

          {/* Title */}
          <div>
            <h1 style={{ fontSize: '1rem', fontWeight: '700', color: isDark ? '#e8e0d5' : '#1a1a1a', margin: 0, fontFamily: 'Georgia, serif' }}>
              Hallmark Reference Archive
            </h1>
            <p style={{ fontSize: '0.65rem', color: isDark ? '#8b7b6a' : '#9ca3af', margin: '0.1rem 0 0', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              London Assay Office
            </p>
          </div>

          {/* Nav */}
          <nav style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
            {['overview', 'browse'].map(v => {
              const isActive = view === v
              return (
                <button
                  key={v}
                  onClick={v === 'overview' ? handleNavOverview : () => setView('browse')}
                  style={{
                    background    : 'none',
                    border        : 'none',
                    borderBottom  : isActive ? '2px solid #d4a843' : '2px solid transparent',
                    fontSize      : '0.82rem',
                    letterSpacing : '0.05em',
                    fontWeight    : isActive ? '600' : '400',
                    color         : isActive
                      ? (isDark ? '#e8e0d5' : '#1a1a1a')
                      : (isDark ? '#8b7b6a' : '#9ca3af'),
                    cursor        : 'pointer',
                    padding       : '0.3rem 0',
                    textTransform : 'uppercase',
                    transition    : 'color 0.15s',
                  }}
                >
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </button>
              )
            })}
          </nav>

          {/* User */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {role === 'admin' && (
              <button
                onClick={() => setView('admin')}
                style={{
                  display      : 'flex',
                  alignItems   : 'center',
                  gap          : '0.375rem',
                  fontSize     : '0.72rem',
                  color        : view === 'admin' ? '#d4a843' : '#8b7b6a',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  border       : `1px solid ${view === 'admin' ? '#3a3020' : '#2a2420'}`,
                  borderRadius : '3px',
                  padding      : '0.2rem 0.5rem',
                  background   : 'none',
                  cursor       : 'pointer',
                  fontFamily   : 'inherit',
                  transition   : 'color 0.15s, border-color 0.15s',
                }}
              >
                Admin
                {pendingCount > 0 && (
                  <span style={{ backgroundColor: '#d4a843', color: '#12100d', borderRadius: '2px', fontSize: '0.58rem', fontWeight: '700', padding: '1px 4px', lineHeight: 1.5 }}>
                    {pendingCount}
                  </span>
                )}
              </button>
            )}
            {role === 'researcher' && (
              <span title="Coming soon — Phase 2b" style={{ fontSize: '0.72rem', color: '#4a3f2f', letterSpacing: '0.04em', border: '1px solid #2a2118', borderRadius: '3px', padding: '0.2rem 0.5rem', cursor: 'default' }}>
                Coming soon — Phase 2b
              </span>
            )}
            <span style={{ fontSize: '0.75rem', color: isDark ? '#8b7b6a' : '#9ca3af' }}>{user?.email}</span>
            <button onClick={handleLogout} style={{ fontSize: '0.75rem', color: isDark ? '#8b7b6a' : '#6b7280', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
              Sign out
            </button>
          </div>

        </div>
      </header>

      {/* ── Overview view ──────────────────────────────────────────────────── */}
      {view === 'overview' && (
        <OverviewPage
          records={records}
          allImages={allImages}
          loading={loading}
          onNavigate={navigateToBrowse}
        />
      )}

      {/* ── Browse view ────────────────────────────────────────────────────── */}
      {view === 'browse' && (
        <div style={s.body}>

          {/* Sidebar */}
          <aside style={s.sidebar}>
            <div style={s.sidebarInner}>
              {records.length > 0 && (
                <TimelineHeatmap
                  records={records}
                  activeCentury={activeCentury}
                  onCenturyClick={setActiveCentury}
                  activeYear={activeYear}
                  onYearClick={setActiveYear}
                />
              )}

              {/* Active decade filter indicator */}
              {activeDecade && (
                <div style={s.filterBlock}>
                  <p style={s.filterLabel}>Decade filter</p>
                  <p style={{ fontSize: '0.8rem', color: '#c8b88a', margin: '0 0 0.25rem' }}>{activeDecade}s</p>
                  <button onClick={() => setActiveDecade(null)} style={s.clearDecadeBtn}>Clear</button>
                </div>
              )}

              <div style={s.filterBlock}>
                <p style={s.filterLabel}>Mark type</p>
                <select value={selectedMarkType} onChange={e => setSelectedMarkType(e.target.value)} style={s.select}>
                  <option value="">All</option>
                  {markTypes.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>

              <div style={s.filterBlock}>
                <p style={s.filterLabel}>Collection</p>
                <select value={selectedCollection} onChange={e => setSelectedCollection(e.target.value)} style={s.select}>
                  <option value="">All</option>
                  {collections.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>

              {hasSponsorData && (
                <div style={s.filterBlock}>
                  <p style={s.filterLabel}>Sponsor</p>
                  <select value={selectedSponsor} onChange={e => setSelectedSponsor(e.target.value)} style={s.select}>
                    <option value="">All</option>
                    {sponsors.map(sp => <option key={sp}>{sp}</option>)}
                  </select>
                </div>
              )}

              <div style={s.filterBlock}>
                <label style={s.toggleLabel}>
                  <input type="checkbox" checked={showDimensions} onChange={e => setShowDimensions(e.target.checked)} style={s.checkbox} />
                  Show dimension references
                </label>
              </div>

              {!loading && (
                <div style={s.countWrap}>
                  <p style={s.countNumber}>{filtered.length.toLocaleString()}</p>
                  <p style={s.countLabel}>of {records.length.toLocaleString()} records</p>
                </div>
              )}
            </div>
          </aside>

          {/* Main grid */}
          <main style={s.main}>
            <div style={s.searchRow}>
              <input
                type="search"
                placeholder="Search by object, group ID, sponsor, year range…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={s.search}
                onFocus={e => { e.currentTarget.style.borderColor = '#d4a843' }}
                onBlur={e => { e.currentTarget.style.borderColor = '#3a3020' }}
              />
            </div>

            {loading && <p style={s.status}>Loading archive…</p>}

            {error && (
              <div style={s.errorBox}>
                <strong>Could not load archive.</strong><br />
                {error}<br />
                <button onClick={() => fetchRecords(showDimensions)} style={s.retryBtn}>Retry</button>
              </div>
            )}

            {!loading && !error && filtered.length === 0 && (
              <p style={s.status}>No records match your search.</p>
            )}

            {!loading && !error && filtered.length > 0 && (
              <div style={s.grid}>
                {filtered.map(record => (
                  <RecordCard
                    key={record.group_id}
                    record={record}
                    showDimensions={showDimensions}
                    onClick={() => setSelectedRecord(record)}
                  />
                ))}
              </div>
            )}
          </main>

        </div>
      )}

      {/* ── Admin view ─────────────────────────────────────────────────────── */}
      {view === 'admin' && role === 'admin' && (
        <AdminPanel onPendingCountChange={setPendingCount} />
      )}

      {selectedRecord && (
        <RecordModal
          record={selectedRecord}
          allImages={allImages}
          showDimensions={showDimensions}
          onClose={() => setSelectedRecord(null)}
        />
      )}
    </div>
  )
}

const s = {
  body: {
    display: 'flex',
    maxWidth: '1400px',
    margin: '0 auto',
    padding: '1.5rem',
    gap: '2rem',
  },
  sidebar: { width: '210px', flexShrink: 0 },
  sidebarInner: {
    position: 'sticky',
    top: '4.5rem',
    backgroundColor: '#15120e',
    border: '1px solid #2a2118',
    borderRadius: '6px',
    padding: '1.25rem',
  },
  filterBlock: { marginBottom: '1.25rem' },
  filterLabel: {
    fontSize: '10px',
    textTransform: 'uppercase',
    letterSpacing: '0.15em',
    color: '#8a7a5a',
    margin: '0 0 0.4rem',
  },
  select: {
    width: '100%',
    padding: '0.375rem 0.5rem',
    border: '1px solid #3a3020',
    borderRadius: '4px',
    fontSize: '0.78rem',
    background: '#1a1610',
    color: '#c8b88a',
  },
  toggleLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    fontSize: '0.72rem',
    color: '#9a8a6a',
    cursor: 'pointer',
  },
  checkbox: { cursor: 'pointer', accentColor: '#d4a843' },
  countWrap: {
    marginTop: '1.5rem',
    paddingTop: '1.25rem',
    borderTop: '1px solid #2a2118',
  },
  countNumber: {
    fontFamily: "'Cormorant Garamond', Georgia, serif",
    fontSize: '2rem',
    fontWeight: '300',
    fontStyle: 'italic',
    color: '#d4a843',
    margin: '0 0 0.15rem',
    lineHeight: 1,
  },
  countLabel: {
    fontSize: '0.58rem',
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
    color: '#8a7a5a',
    margin: 0,
  },
  clearDecadeBtn: {
    fontSize: '0.7rem',
    color: '#9a8a6a',
    background: 'none',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    textDecoration: 'underline',
  },
  main: { flex: 1, minWidth: 0 },
  searchRow: { marginBottom: '1.5rem' },
  search: {
    width: '100%',
    padding: '0.625rem 0.875rem',
    border: '1px solid #3a3020',
    borderRadius: '4px',
    fontSize: '0.875rem',
    background: '#1a1610',
    color: '#c8b88a',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.15s',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
    gap: '1rem',
  },
  status: { textAlign: 'center', color: '#8a7a5a', padding: '4rem 0', fontSize: '0.875rem' },
  errorBox: {
    background: '#1a0a0a',
    border: '1px solid #7a1a1a',
    borderRadius: '4px',
    padding: '1.5rem',
    color: '#c87070',
    fontSize: '0.875rem',
    lineHeight: 1.6,
  },
  retryBtn: {
    marginTop: '0.75rem',
    background: 'none',
    border: '1px solid #7a1a1a',
    color: '#c87070',
    padding: '0.375rem 0.875rem',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.8rem',
  },
}
