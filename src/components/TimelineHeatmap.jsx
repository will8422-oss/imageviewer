const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

export default function TimelineHeatmap({ records, onCenturyClick, activeCentury }) {
  const centuries = {}
  records.forEach(r => {
    if (r.year) {
      const c = Math.ceil(Number(r.year) / 100)
      centuries[c] = (centuries[c] || 0) + 1
    }
  })

  const sorted = Object.entries(centuries).sort((a, b) => a[0] - b[0])
  if (sorted.length === 0) return null

  const maxCount = Math.max(...sorted.map(([, n]) => n))

  return (
    <div style={s.wrap}>
      <p style={s.label}>Filter by century</p>
      <div style={s.bars}>
        {sorted.map(([century, count]) => {
          const barH = Math.max((count / maxCount) * 44, 4)
          const isActive = activeCentury === Number(century)
          return (
            <div
              key={century}
              onClick={() => onCenturyClick(isActive ? null : Number(century))}
              style={s.barGroup}
              title={`${ordinal(Number(century))} century — ${count} record${count !== 1 ? 's' : ''}`}
            >
              <div
                style={{
                  ...s.fill,
                  height: `${barH}px`,
                  backgroundColor: isActive ? '#1a1a1a' : '#d1d5db',
                }}
              />
              <span style={{ ...s.barLabel, color: isActive ? '#1a1a1a' : '#9ca3af', fontWeight: isActive ? '600' : '400' }}>
                {century}c
              </span>
            </div>
          )
        })}
      </div>
      {activeCentury && (
        <button onClick={() => onCenturyClick(null)} style={s.clearBtn}>
          Clear filter
        </button>
      )}
    </div>
  )
}

const s = {
  wrap: { marginBottom: '1.75rem' },
  label: {
    fontSize: '0.65rem',
    textTransform: 'uppercase',
    letterSpacing: '0.09em',
    color: '#9ca3af',
    margin: '0 0 0.6rem',
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
  clearBtn: {
    marginTop: '0.5rem',
    fontSize: '0.72rem',
    color: '#6b7280',
    background: 'none',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    textDecoration: 'underline',
  },
}
