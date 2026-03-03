import { useState, useEffect } from 'react'
import RecordCard from './src/components/RecordCard.jsx'
import RecordModal from './src/components/RecordModal.jsx'
import TimelineHeatmap from './src/components/TimelineHeatmap.jsx'

const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME
const apiKey = import.meta.env.VITE_CLOUDINARY_API_KEY
const apiSecret = import.meta.env.VITE_CLOUDINARY_API_SECRET

export default function HallmarkArchive({ user }) {
  const [allImages, setAllImages] = useState([])
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [selectedFineness, setSelectedFineness] = useState('')
  const [selectedAssayOffice, setSelectedAssayOffice] = useState('')
  const [activeCentury, setActiveCentury] = useState(null)
  const [selectedRecord, setSelectedRecord] = useState(null)

  useEffect(() => {
    fetchRecords()
  }, [])

  const fetchRecords = async () => {
    setLoading(true)
    setError(null)
    try {
      const credentials = btoa(`${apiKey}:${apiSecret}`)
      // Fetch all assets in the hallmarks folder with metadata
      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/resources/search`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${credentials}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            expression: 'folder:hallmarks',
            with_field: ['metadata', 'tags'],
            max_results: 500,
            sort_by: [{ public_id: 'asc' }],
          }),
        }
      )

      if (!response.ok) {
        const body = await response.text()
        throw new Error(`Cloudinary error ${response.status}: ${body}`)
      }

      const data = await response.json()
      const assets = data.resources || []
      setAllImages(assets)

      // Deduplicate into records by ref (group_id or derived from filename)
      const byRef = {}
      assets.forEach(asset => {
        const meta = asset.metadata || {}
        const ref =
          meta.ref ||
          asset.public_id
            .split('/')
            .pop()
            .replace(/_[a-z]$/, '')

        if (!byRef[ref]) {
          byRef[ref] = {
            ref,
            public_id: asset.public_id,
            year: meta.year ? Number(meta.year) : null,
            fineness: meta.fineness || '',
            maker: meta.maker || '',
            collection: meta.collection || '',
            assay_office: meta.assay_office || '',
            notes: meta.notes || '',
            tags: asset.tags || [],
          }
        }
      })

      setRecords(Object.values(byRef).sort((a, b) => (a.year || 0) - (b.year || 0)))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Filter records
  const filtered = records.filter(r => {
    const q = search.toLowerCase()
    const matchSearch =
      !q ||
      r.ref?.toLowerCase().includes(q) ||
      r.maker?.toLowerCase().includes(q) ||
      r.collection?.toLowerCase().includes(q) ||
      r.notes?.toLowerCase().includes(q)
    const matchFineness = !selectedFineness || r.fineness === selectedFineness
    const matchOffice = !selectedAssayOffice || r.assay_office === selectedAssayOffice
    const matchCentury =
      !activeCentury || (r.year && Math.ceil(r.year / 100) === activeCentury)
    return matchSearch && matchFineness && matchOffice && matchCentury
  })

  const finenesses = [...new Set(records.map(r => r.fineness).filter(Boolean))].sort()
  const assayOffices = [...new Set(records.map(r => r.assay_office).filter(Boolean))].sort()

  const handleLogout = () => window.netlifyIdentity?.logout()

  return (
    <div style={s.page}>
      {/* Header */}
      <header style={s.header}>
        <div style={s.headerInner}>
          <div>
            <h1 style={s.heading}>Hallmark Reference Archive</h1>
            <p style={s.subheading}>London Assay Office</p>
          </div>
          <div style={s.headerRight}>
            <span style={s.email}>{user?.email}</span>
            <button onClick={handleLogout} style={s.logoutBtn}>
              Sign out
            </button>
          </div>
        </div>
      </header>

      <div style={s.body}>
        {/* Sidebar */}
        <aside style={s.sidebar}>
          <div style={s.sidebarInner}>
            {records.length > 0 && (
              <TimelineHeatmap
                records={records}
                activeCentury={activeCentury}
                onCenturyClick={setActiveCentury}
              />
            )}

            <div style={s.filterBlock}>
              <p style={s.filterLabel}>Fineness</p>
              <select
                value={selectedFineness}
                onChange={e => setSelectedFineness(e.target.value)}
                style={s.select}
              >
                <option value="">All</option>
                {finenesses.map(f => (
                  <option key={f}>{f}</option>
                ))}
              </select>
            </div>

            <div style={s.filterBlock}>
              <p style={s.filterLabel}>Assay Office</p>
              <select
                value={selectedAssayOffice}
                onChange={e => setSelectedAssayOffice(e.target.value)}
                style={s.select}
              >
                <option value="">All</option>
                {assayOffices.map(o => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </div>

            {!loading && (
              <p style={s.count}>
                {filtered.length} of {records.length} records
              </p>
            )}
          </div>
        </aside>

        {/* Main */}
        <main style={s.main}>
          <div style={s.searchRow}>
            <input
              type="search"
              placeholder="Search by ref, maker, collection, notes…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={s.search}
            />
          </div>

          {loading && <p style={s.status}>Loading archive…</p>}

          {error && (
            <div style={s.errorBox}>
              <strong>Could not load archive.</strong>
              <br />
              {error}
              <br />
              <button onClick={fetchRecords} style={s.retryBtn}>
                Retry
              </button>
            </div>
          )}

          {!loading && !error && filtered.length === 0 && (
            <p style={s.status}>No records match your search.</p>
          )}

          {!loading && !error && filtered.length > 0 && (
            <div style={s.grid}>
              {filtered.map(record => (
                <RecordCard
                  key={record.ref}
                  record={record}
                  onClick={() => setSelectedRecord(record)}
                />
              ))}
            </div>
          )}
        </main>
      </div>

      {selectedRecord && (
        <RecordModal
          record={selectedRecord}
          allImages={allImages}
          onClose={() => setSelectedRecord(null)}
        />
      )}
    </div>
  )
}

const s = {
  page: { minHeight: '100vh', backgroundColor: '#f5f5f0' },
  header: {
    backgroundColor: 'white',
    borderBottom: '1px solid #e5e7eb',
    padding: '0.875rem 1.5rem',
    position: 'sticky',
    top: 0,
    zIndex: 100,
  },
  headerInner: {
    maxWidth: '1400px',
    margin: '0 auto',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heading: {
    fontSize: '1rem',
    fontWeight: '700',
    color: '#1a1a1a',
    margin: 0,
    fontFamily: 'Georgia, serif',
  },
  subheading: {
    fontSize: '0.7rem',
    color: '#9ca3af',
    margin: '0.1rem 0 0',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
  },
  headerRight: { display: 'flex', alignItems: 'center', gap: '1rem' },
  email: { fontSize: '0.75rem', color: '#9ca3af' },
  logoutBtn: {
    fontSize: '0.75rem',
    color: '#6b7280',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    textDecoration: 'underline',
    padding: 0,
  },
  body: {
    display: 'flex',
    maxWidth: '1400px',
    margin: '0 auto',
    padding: '1.5rem',
    gap: '2rem',
  },
  sidebar: { width: '200px', flexShrink: 0 },
  sidebarInner: { position: 'sticky', top: '4.5rem' },
  filterBlock: { marginBottom: '1.25rem' },
  filterLabel: {
    fontSize: '0.65rem',
    textTransform: 'uppercase',
    letterSpacing: '0.09em',
    color: '#9ca3af',
    margin: '0 0 0.4rem',
  },
  select: {
    width: '100%',
    padding: '0.375rem 0.5rem',
    border: '1px solid #e5e7eb',
    borderRadius: '4px',
    fontSize: '0.8rem',
    background: 'white',
    color: '#1a1a1a',
  },
  count: { fontSize: '0.72rem', color: '#9ca3af', marginTop: '1.25rem' },
  main: { flex: 1, minWidth: 0 },
  searchRow: { marginBottom: '1.5rem' },
  search: {
    width: '100%',
    padding: '0.625rem 0.875rem',
    border: '1px solid #e5e7eb',
    borderRadius: '4px',
    fontSize: '0.875rem',
    background: 'white',
    outline: 'none',
    boxSizing: 'border-box',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
    gap: '1rem',
  },
  status: { textAlign: 'center', color: '#9ca3af', padding: '4rem 0', fontSize: '0.875rem' },
  errorBox: {
    background: '#fff5f5',
    border: '1px solid #fecaca',
    borderRadius: '4px',
    padding: '1.5rem',
    color: '#dc2626',
    fontSize: '0.875rem',
    lineHeight: 1.6,
  },
  retryBtn: {
    marginTop: '0.75rem',
    background: 'none',
    border: '1px solid #dc2626',
    color: '#dc2626',
    padding: '0.375rem 0.875rem',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.8rem',
  },
}
