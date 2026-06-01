const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME

export default function RecordCard({ record, showDimensions, onClick }) {
  const imageUrl = `https://res.cloudinary.com/${cloudName}/image/upload/c_fill,w_320,h_220,q_auto,f_auto/${record.public_id}`

  return (
    <div
      onClick={onClick}
      style={s.card}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-2px)'
        e.currentTarget.style.borderColor = '#d4a843'
        e.currentTarget.style.boxShadow = '0 8px 32px rgba(0,0,0,0.45)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'none'
        e.currentTarget.style.borderColor = '#3a3020'
        e.currentTarget.style.boxShadow = 'none'
      }}
    >
      <div style={s.imgWrap}>
        <img src={imageUrl} alt={record.object_name} style={s.img} loading="lazy" />
        {record.year_range && (
          <span style={s.yearBadge}>{record.year_range}</span>
        )}
        {showDimensions && record.hasDimensions && (
          <span style={s.dimBadge} title="Includes dimension reference image">dim</span>
        )}
      </div>
      <div style={s.body}>
        <p style={s.objectName}>{record.object_name}</p>
        <p style={s.meta}>
          {[record.mark_type, record.collection].filter(Boolean).join(' · ')}
        </p>
        {record.sponsor && <p style={s.sponsor}>{record.sponsor}</p>}
      </div>
    </div>
  )
}

const s = {
  card: {
    background: 'linear-gradient(135deg, #1e1a14, #231e17)',
    border: '1px solid #3a3020',
    borderRadius: '4px',
    overflow: 'hidden',
    cursor: 'pointer',
    transition: 'transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease',
  },
  imgWrap: {
    width: '100%',
    height: '160px',
    overflow: 'hidden',
    backgroundColor: '#12100d',
    position: 'relative',
  },
  img: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  },
  yearBadge: {
    position: 'absolute',
    top: '6px',
    right: '6px',
    fontSize: '0.58rem',
    fontWeight: '600',
    letterSpacing: '0.04em',
    color: '#d4a843',
    backgroundColor: 'rgba(15,13,11,0.88)',
    border: '1px solid rgba(212,168,67,0.3)',
    borderRadius: '2px',
    padding: '2px 5px',
  },
  dimBadge: {
    position: 'absolute',
    bottom: '6px',
    right: '6px',
    fontSize: '0.55rem',
    fontWeight: '600',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: '#6a5a3a',
    backgroundColor: 'rgba(15,13,11,0.88)',
    border: '1px solid #3a3020',
    borderRadius: '2px',
    padding: '1px 5px',
  },
  body: {
    padding: '0.75rem 0.875rem',
  },
  objectName: {
    fontFamily: "'Cormorant Garamond', Georgia, serif",
    fontSize: '0.82rem',
    fontWeight: '500',
    color: '#c8b88a',
    margin: '0 0 0.25rem',
    lineHeight: 1.3,
  },
  meta: {
    fontSize: '0.68rem',
    color: '#6a5a3a',
    margin: '0 0 0.1rem',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  sponsor: {
    fontSize: '0.65rem',
    color: '#4a3f2f',
    margin: 0,
    fontStyle: 'italic',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
}
