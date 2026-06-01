import { Fragment, useState, useEffect, useRef } from 'react'

// ── Constants ────────────────────────────────────────────────────────────────
const MIN_CELL_W = 10  // px — minimum width of each decade cell
const CELL_H     = 8   // px — height of each year-digit cell
const GAP        = 1   // px — gap between cells
const LABEL_W    = 14  // px — row-label column width
const HEADER_H   = 12  // px — century-marker row height

// Gold palette (dark → light)
const GOLD = ['#1a1714', '#3d2b1a', '#7a4f28', '#b8891f', '#d4a843']

function cellColor(count, max) {
  if (!count) return GOLD[0]
  const p = count / max
  if (p <= 0.25) return GOLD[1]
  if (p <= 0.50) return GOLD[2]
  if (p <= 0.75) return GOLD[3]
  return GOLD[4]
}

const ordinal = (n) => {
  const v = n % 100
  const s = ['th', 'st', 'nd', 'rd']
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

// ── Component ────────────────────────────────────────────────────────────────
export default function TimelineHeatmap({
  records,
  activeCentury, onCenturyClick,
  activeYear,    onYearClick,
}) {
  const [cellW, setCellW] = useState(MIN_CELL_W)
  const wrapRef = useRef(null)

  // Build year → count and century → count maps
  const yearCounts    = {}
  const centuryCounts = {}
  records.forEach(r => {
    if (!r.year) return
    const y = Number(r.year)
    yearCounts[y] = (yearCounts[y] || 0) + 1
    const c = Math.ceil(y / 100)
    centuryCounts[c] = (centuryCounts[c] || 0) + 1
  })

  const allYears = Object.keys(yearCounts).map(Number)

  // Compute decades before effects (needed for ResizeObserver dependency)
  let decades = []
  if (allYears.length > 0) {
    const minDecade = Math.floor(Math.min(...allYears) / 10) * 10
    const maxDecade = Math.floor(Math.max(...allYears) / 10) * 10
    for (let d = minDecade; d <= maxDecade; d += 10) decades.push(d)
  }

  // Responsive cell width — recalculate whenever container resizes
  useEffect(() => {
    if (!wrapRef.current || decades.length === 0) return
    const compute = () => {
      const containerW = wrapRef.current.clientWidth
      const w = Math.max(
        MIN_CELL_W,
        Math.floor((containerW - LABEL_W - GAP * (decades.length - 1)) / decades.length)
      )
      setCellW(w)
    }
    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(wrapRef.current)
    return () => ro.disconnect()
  }, [decades.length])

  if (allYears.length === 0) return null

  const maxCount         = Math.max(...Object.values(yearCounts))
  const totalWithYear    = allYears.reduce((sum, y) => sum + yearCounts[y], 0)
  const yearsRepresented = allYears.length

  // Century bar data
  const centurySorted   = Object.entries(centuryCounts).sort((a, b) => a[0] - b[0])
  const maxCenturyCount = Math.max(...centurySorted.map(([, n]) => n))

  return (
    <div style={s.wrap}>

      {/* ── Summary ─────────────────────────────────────────────────────── */}
      <p style={s.summary}>
        {totalWithYear.toLocaleString()} records · {yearsRepresented} years
      </p>

      {/* ── Decade × Year heatmap ────────────────────────────────────────── */}
      <div ref={wrapRef} style={s.scrollWrap}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: `${LABEL_W}px repeat(${decades.length}, ${cellW}px)`,
          gridTemplateRows: `${HEADER_H}px repeat(10, ${CELL_H}px)`,
          columnGap: `${GAP}px`,
          rowGap: `${GAP}px`,
        }}>

          {/* Header row: empty corner + century markers */}
          <div />
          {decades.map(d => (
            <div key={d} style={s.centuryLabel}>
              {d % 100 === 0 ? d : ''}
            </div>
          ))}

          {/* Data rows: one per year-within-decade digit 0–9 */}
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(digit => (
            <Fragment key={digit}>
              <div style={s.rowLabel}>·{digit}</div>
              {decades.map(d => {
                const year       = d + digit
                const count      = yearCounts[year] || 0
                const isSelected = activeYear === year
                const clickable  = count > 0
                return (
                  <div
                    key={d}
                    title={`${year}: ${count} record${count !== 1 ? 's' : ''}`}
                    onClick={clickable ? () => onYearClick(isSelected ? null : year) : undefined}
                    style={{
                      backgroundColor: cellColor(count, maxCount),
                      cursor     : clickable ? 'pointer' : 'default',
                      outline    : isSelected ? '1.5px solid #d4a843' : 'none',
                      outlineOffset: '-1px',
                      transform  : isSelected ? 'scale(1.3)' : 'none',
                      position   : 'relative',
                      zIndex     : isSelected ? 1 : 0,
                      borderRadius: '0.5px',
                      transition : 'transform 0.1s',
                    }}
                  />
                )
              })}
            </Fragment>
          ))}
        </div>
      </div>

      {/* ── Legend ──────────────────────────────────────────────────────── */}
      <div style={s.legend}>
        <span style={s.legendText}>Fewer</span>
        {GOLD.map(c => (
          <span key={c} style={{ ...s.legendSwatch, backgroundColor: c }} />
        ))}
        <span style={s.legendText}>More</span>
      </div>

      {activeYear && (
        <button onClick={() => onYearClick(null)} style={s.clearBtn}>
          Clear year filter ({activeYear})
        </button>
      )}

      {/* ── Century bar chart ─────────────────────────────────────────────── */}
      <p style={s.centuryLabel2}>Filter by century</p>
      <div style={s.bars}>
        {centurySorted.map(([century, count]) => {
          const barH     = Math.max((count / maxCenturyCount) * 44, 4)
          const isActive = activeCentury === Number(century)
          return (
            <div
              key={century}
              onClick={() => onCenturyClick(isActive ? null : Number(century))}
              style={s.barGroup}
              title={`${ordinal(Number(century))} century — ${count} record${count !== 1 ? 's' : ''}`}
            >
              <div style={{
                ...s.fill,
                height: `${barH}px`,
                backgroundColor: isActive ? '#d4a843' : '#3a3020',
              }} />
              <span style={{
                ...s.barLabel,
                color: isActive ? '#d4a843' : '#9a8a6a',
                fontWeight: isActive ? '600' : '400',
              }}>
                {century}c
              </span>
            </div>
          )
        })}
      </div>
      {activeCentury && (
        <button onClick={() => onCenturyClick(null)} style={s.clearBtn}>
          Clear century filter
        </button>
      )}

    </div>
  )
}

// ── Styles ───────────────────────────────────────────────────────────────────
const s = {
  wrap: { marginBottom: '1.75rem' },

  summary: {
    fontSize: '0.62rem',
    color: '#9a8a6a',
    margin: '0 0 0.4rem',
  },

  scrollWrap: {
    overflowX: 'auto',
    paddingBottom: '2px',   // room for selected-cell scale transform
  },

  centuryLabel: {
    fontSize: '0.42rem',
    color: '#9a8a6a',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    lineHeight: `${HEADER_H}px`,
    userSelect: 'none',
  },

  rowLabel: {
    fontSize: '0.48rem',
    color: '#9a8a6a',
    textAlign: 'right',
    paddingRight: '2px',
    lineHeight: `${CELL_H}px`,
    userSelect: 'none',
  },

  legend: {
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    marginTop: '0.45rem',
  },
  legendText: {
    fontSize: '0.48rem',
    color: '#9a8a6a',
  },
  legendSwatch: {
    width: `${MIN_CELL_W}px`,
    height: `${CELL_H}px`,
    display: 'inline-block',
    flexShrink: 0,
    borderRadius: '0.5px',
  },

  clearBtn: {
    display: 'block',
    marginTop: '0.35rem',
    fontSize: '0.7rem',
    color: '#9a8a6a',
    background: 'none',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    textDecoration: 'underline',
  },

  centuryLabel2: {
    fontSize: '10px',
    textTransform: 'uppercase',
    letterSpacing: '0.15em',
    color: '#8a7a5a',
    margin: '1.5rem 0 0.6rem',
  },

  bars: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: '5px',
    height: '60px',
  },
  barGroup: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    cursor: 'pointer',
  },
  fill: {
    width: '22px',
    borderRadius: '2px 2px 0 0',
    transition: 'background-color 0.15s',
  },
  barLabel: {
    fontSize: '0.58rem',
    letterSpacing: '-0.02em',
  },
}
