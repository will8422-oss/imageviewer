const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME

export default function RecordCard({ record, onClick }) {
  const imageUrl = `https://res.cloudinary.com/${cloudName}/image/upload/c_fill,w_320,h_220,q_auto,f_auto/${record.public_id}`

  return (
    <div
      onClick={onClick}
      style={s.card}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-2px)'
        e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.1)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'none'
        e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.08)'
      }}
    >
      <div style={s.imgWrap}>
        <img src={imageUrl} alt={record.ref} style={s.img} loading="lazy" />
      </div>
      <div style={s.body}>
        <p style={s.ref}>{record.ref}</p>
        <p style={s.meta}>
          {[record.year, record.fineness].filter(Boolean).join(' · ')}
        </p>
        {record.maker && <p style={s.maker}>{record.maker}</p>}
      </div>
    </div>
  )
}

const s = {
  card: {
    background: 'white',
    borderRadius: '4px',
    overflow: 'hidden',
    cursor: 'pointer',
    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
  },
  imgWrap: {
    width: '100%',
    height: '160px',
    overflow: 'hidden',
    backgroundColor: '#f0ede8',
  },
  img: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  },
  body: {
    padding: '0.75rem 0.875rem',
  },
  ref: {
    fontSize: '0.7rem',
    fontWeight: '600',
    color: '#1a1a1a',
    margin: '0 0 0.2rem',
    fontFamily: 'monospace',
    letterSpacing: '0.02em',
  },
  meta: {
    fontSize: '0.75rem',
    color: '#6b7280',
    margin: '0 0 0.1rem',
  },
  maker: {
    fontSize: '0.7rem',
    color: '#9ca3af',
    margin: 0,
    fontStyle: 'italic',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
}
