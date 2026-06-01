import { Fragment } from 'react'

// ── Palette ───────────────────────────────────────────────────────────────────
const BG         = '#0f0d0b'
const SURFACE    = '#1a1714'
const BORDER     = '#2a2420'
const GOLD       = '#d4a843'
const TEXT       = '#e8e0d5'
const TEXT_MUTED = '#8b7b6a'
const TEXT_DIM   = '#9a8a6a'

// Same gold density palette as the sidebar heatmap
const DENSITY = ['#1a1714', '#3d2b1a', '#7a4f28', '#b8891f', '#d4a843']

function densityColor(count, max) {
  if (!count) return DENSITY[0]
  const p = count / max
  if (p <= 0.25) return DENSITY[1]
  if (p <= 0.50) return DENSITY[2]
  if (p <= 0.75) return DENSITY[3]
  return DENSITY[4]
}

const CG = "'Cormorant Garamond', Georgia, serif"

// ── Component ─────────────────────────────────────────────────────────────────
export default function OverviewPage({ records, allImages, loading, onNavigate }) {
  if (loading) {
    return (
      <div style={{ padding: '6rem', textAlign: 'center', color: TEXT_MUTED, fontFamily: CG, fontSize: '1.1rem' }}>
        Loading collection data…
      </div>
    )
  }
  if (!records.length) return null

  // ── Derived stats ───────────────────────────────────────────────────────────
  const years       = records.map(r => r.year).filter(Boolean).map(Number)
  const uniqueYears = [...new Set(years)].sort((a, b) => a - b)
  const minYear     = uniqueYears[0]
  const maxYear     = uniqueYears[uniqueYears.length - 1]
  const totalSpan   = maxYear - minYear + 1

  const yearCounts = {}
  records.forEach(r => {
    if (r.year) yearCounts[Number(r.year)] = (yearCounts[Number(r.year)] || 0) + 1
  })
  const maxYearCount = Math.max(...Object.values(yearCounts))

  const collections = [...new Set(records.map(r => r.collection).filter(Boolean))]

  // Decade data
  const decadeCounts = {}
  records.forEach(r => {
    if (r.year) {
      const d = Math.floor(Number(r.year) / 10) * 10
      decadeCounts[d] = (decadeCounts[d] || 0) + 1
    }
  })
  const minDecade    = Math.floor(minYear / 10) * 10
  const maxDecade    = Math.floor(maxYear / 10) * 10
  const allDecades   = []
  for (let d = minDecade; d <= maxDecade; d += 10) allDecades.push(d)
  const filledDecades = allDecades.filter(d => decadeCounts[d])
  const maxDecadeCount = Math.max(...filledDecades.map(d => decadeCounts[d]), 1)

  // Coverage gaps
  const gapDecades  = allDecades.filter(d => !decadeCounts[d])
  const shownGaps   = gapDecades.slice(0, 12)
  const extraGaps   = gapDecades.length - shownGaps.length

  // Mark type distribution
  const markTypeCounts = {}
  records.forEach(r => {
    if (r.mark_type) markTypeCounts[r.mark_type] = (markTypeCounts[r.mark_type] || 0) + 1
  })
  const markTypeSorted = Object.entries(markTypeCounts).sort((a, b) => b[1] - a[1])
  const maxMarkCount   = markTypeSorted[0]?.[1] || 1

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ backgroundColor: BG, minHeight: 'calc(100vh - 56px)', padding: '2.5rem 2rem 5rem' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>

        {/* ── 1. Stat cards ──────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.25rem', marginBottom: '2rem' }}>
          {[
            { value: allImages.length.toLocaleString(), label: 'Total records' },
            { value: uniqueYears.length.toLocaleString(),  label: 'Years covered'  },
            { value: collections.length,                   label: 'Collections'    },
            { value: minYear,                              label: 'Earliest mark'  },
          ].map(card => (
            <div key={card.label} style={{ backgroundColor: SURFACE, borderRadius: '6px', padding: '1.75rem 2rem', border: `1px solid ${BORDER}` }}>
              <p style={{ fontSize: '2.75rem', fontWeight: '300', color: GOLD, margin: '0 0 0.5rem', fontFamily: CG, lineHeight: 1 }}>
                {card.value}
              </p>
              <p style={{ fontSize: '0.65rem', color: TEXT_MUTED, margin: 0, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                {card.label}
              </p>
            </div>
          ))}
        </div>

        {/* ── 2. Full-width heatmap ──────────────────────────────────────── */}
        <div style={{ backgroundColor: SURFACE, borderRadius: '6px', padding: '2rem 2rem 1.5rem', marginBottom: '1.75rem', border: `1px solid ${BORDER}` }}>

          <div style={{ marginBottom: '1.25rem' }}>
            <h2 style={{ fontFamily: CG, fontSize: '1.6rem', fontWeight: '400', color: TEXT, margin: '0 0 0.3rem', letterSpacing: '0.01em' }}>
              Collection Coverage
              <span style={{ color: TEXT_MUTED, fontWeight: '300', marginLeft: '0.6rem' }}>{minYear}–{maxYear}</span>
            </h2>
            <p style={{ fontSize: '0.72rem', color: TEXT_MUTED, margin: 0 }}>
              {uniqueYears.length} years represented of {totalSpan} possible ({Math.round(uniqueYears.length / totalSpan * 100)}% coverage)
            </p>
          </div>

          <div style={{
              display: 'grid',
              gridTemplateColumns: `20px repeat(${allDecades.length}, 1fr)`,
              gridTemplateRows: `18px repeat(10, 20px)`,
              gap: '2px',
            }}>
              {/* Header: empty corner + century labels */}
              <div />
              {allDecades.map(d => (
                <div key={d} style={{ fontSize: '0.52rem', color: TEXT_DIM, overflow: 'hidden', whiteSpace: 'nowrap', lineHeight: '18px', userSelect: 'none' }}>
                  {d % 100 === 0 ? d : ''}
                </div>
              ))}

              {/* Data rows: digit 0–9 */}
              {[0,1,2,3,4,5,6,7,8,9].map(digit => (
                <Fragment key={digit}>
                  <div style={{ fontSize: '0.52rem', color: TEXT_DIM, textAlign: 'right', paddingRight: '3px', lineHeight: '20px', userSelect: 'none' }}>
                    ·{digit}
                  </div>
                  {allDecades.map(d => {
                    const year     = d + digit
                    const count    = yearCounts[year] || 0
                    const canClick = count > 0
                    return (
                      <div
                        key={d}
                        title={`${year}: ${count} record${count !== 1 ? 's' : ''}`}
                        onClick={canClick ? () => onNavigate({ year }) : undefined}
                        style={{
                          backgroundColor: densityColor(count, maxYearCount),
                          cursor    : canClick ? 'pointer' : 'default',
                          borderRadius: '1px',
                        }}
                        onMouseEnter={canClick ? e => { e.currentTarget.style.filter = 'brightness(1.35)' } : undefined}
                        onMouseLeave={canClick ? e => { e.currentTarget.style.filter = ''              } : undefined}
                      />
                    )
                  })}
                </Fragment>
              ))}
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '0.875rem' }}>
            <span style={{ fontSize: '0.58rem', color: TEXT_DIM, marginRight: '2px' }}>Fewer</span>
            {DENSITY.map(c => (
              <span key={c} style={{ width: '18px', height: '11px', display: 'inline-block', backgroundColor: c, borderRadius: '1px', flexShrink: 0 }} />
            ))}
            <span style={{ fontSize: '0.58rem', color: TEXT_DIM, marginLeft: '2px' }}>More</span>
          </div>
        </div>

        {/* ── 3. Three panels ────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.25rem', alignItems: 'start' }}>

          {/* LEFT — Mark type distribution */}
          <div style={{ backgroundColor: SURFACE, borderRadius: '6px', padding: '1.75rem', border: `1px solid ${BORDER}` }}>
            <h3 style={{ fontFamily: CG, fontSize: '1.2rem', fontWeight: '400', color: TEXT, margin: '0 0 1.5rem', letterSpacing: '0.02em' }}>
              By Mark Type
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
              {markTypeSorted.map(([mark, count]) => (
                <div
                  key={mark}
                  onClick={() => onNavigate({ markType: mark })}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', cursor: 'pointer' }}
                  onMouseEnter={e => { e.currentTarget.style.opacity = '0.7' }}
                  onMouseLeave={e => { e.currentTarget.style.opacity = '1'   }}
                >
                  <span style={{ width: '108px', flexShrink: 0, fontSize: '0.68rem', color: TEXT_MUTED, textAlign: 'right', paddingRight: '0.5rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontVariant: 'normal' }}>
                    {mark}
                  </span>
                  <div style={{ flex: 1, backgroundColor: '#231e18', borderRadius: '2px', height: '13px', overflow: 'hidden' }}>
                    <div style={{
                      width: `${(count / maxMarkCount) * 100}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #7a4f28 0%, #d4a843 100%)',
                      borderRadius: '2px',
                    }} />
                  </div>
                  <span style={{ width: '26px', flexShrink: 0, fontSize: '0.62rem', color: TEXT_DIM, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {count}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* CENTRE — Decade record count */}
          <div style={{ backgroundColor: SURFACE, borderRadius: '6px', padding: '1.75rem', border: `1px solid ${BORDER}` }}>
            <h3 style={{ fontFamily: CG, fontSize: '1.2rem', fontWeight: '400', color: TEXT, margin: '0 0 1.5rem', letterSpacing: '0.02em' }}>
              By Decade
            </h3>
            <div style={{ overflowX: 'auto', paddingBottom: '0.5rem' }}>
              {/* Bars */}
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '120px' }}>
                {filledDecades.map(d => {
                  const count = decadeCounts[d]
                  const barH  = Math.max((count / maxDecadeCount) * 108, 3)
                  return (
                    <div
                      key={d}
                      onClick={() => onNavigate({ decade: d })}
                      title={`${d}s: ${count} record${count !== 1 ? 's' : ''}`}
                      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer', flexShrink: 0, width: '16px' }}
                      onMouseEnter={e => { e.currentTarget.style.opacity = '0.7' }}
                      onMouseLeave={e => { e.currentTarget.style.opacity = '1'   }}
                    >
                      <div style={{
                        width: '13px',
                        height: `${barH}px`,
                        backgroundColor: densityColor(count, maxDecadeCount),
                        borderRadius: '2px 2px 0 0',
                        flexShrink: 0,
                      }} />
                    </div>
                  )
                })}
              </div>
              {/* X-axis labels — show every 50 years */}
              <div style={{ display: 'flex', gap: '3px', marginTop: '4px' }}>
                {filledDecades.map(d => (
                  <div key={d} style={{ width: '16px', flexShrink: 0, position: 'relative', height: '28px' }}>
                    {d % 50 === 0 && (
                      <span style={{
                        fontSize: '0.42rem',
                        color: TEXT_DIM,
                        position: 'absolute',
                        top: 0,
                        left: '50%',
                        transformOrigin: 'top center',
                        transform: 'translateX(-50%) rotate(-65deg)',
                        whiteSpace: 'nowrap',
                        userSelect: 'none',
                      }}>
                        {d}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* RIGHT — Coverage gaps */}
          <div style={{ backgroundColor: SURFACE, borderRadius: '6px', padding: '1.75rem', border: `1px solid ${BORDER}` }}>
            <h3 style={{ fontFamily: CG, fontSize: '1.2rem', fontWeight: '400', color: TEXT, margin: '0 0 0.3rem', letterSpacing: '0.02em' }}>
              Collection Gaps
            </h3>
            <p style={{ fontSize: '0.62rem', color: TEXT_MUTED, margin: '0 0 1.5rem', textTransform: 'uppercase', letterSpacing: '0.09em' }}>
              Decades with no records
            </p>

            {gapDecades.length === 0 ? (
              <p style={{ fontSize: '0.82rem', color: TEXT_DIM, fontStyle: 'italic', fontFamily: CG }}>
                No gaps in the collection span.
              </p>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                  {shownGaps.map(d => (
                    <p key={d} style={{ fontSize: '0.78rem', color: TEXT_DIM, margin: 0 }}>
                      {d}s
                      <span style={{ fontSize: '0.68rem', marginLeft: '0.4rem', color: TEXT_DIM }}>— no records</span>
                    </p>
                  ))}
                  {extraGaps > 0 && (
                    <p style={{ fontSize: '0.72rem', color: TEXT_DIM, margin: '0.25rem 0 0', fontStyle: 'italic' }}>
                      + {extraGaps} more
                    </p>
                  )}
                </div>

                <p style={{ fontSize: '0.85rem', color: GOLD, fontStyle: 'italic', margin: '1.5rem 0 0', fontFamily: CG, lineHeight: 1.5 }}>
                  {gapDecades.length} decade{gapDecades.length !== 1 ? 's' : ''} unrepresented across the collection span
                </p>
              </>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
