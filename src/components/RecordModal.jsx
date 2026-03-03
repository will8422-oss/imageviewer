import { useEffect } from 'react'

const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME

export default function RecordModal({ record, allImages, onClose }) {
  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  // Match images by group_id metadata or by public_id containing the ref
  const images = allImages.filter(img =>
    img.metadata?.group_id === record.ref ||
    img.public_id.split('/').pop().startsWith(record.ref)
  )

  const fields = [
    { label: 'Reference', value: record.ref },
    { label: 'Year', value: record.year },
    { label: 'Fineness', value: record.fineness },
    { label: 'Maker', value: record.maker },
    { label: 'Collection', value: record.collection },
    { label: 'Assay Office', value: record.assay_office },
    { label: 'Notes', value: record.notes },
  ].filter(f => f.value)

  return (
    <div onClick={onClose} style={s.overlay}>
      <div onClick={e => e.stopPropagation()} style={s.modal}>
        <button onClick={onClose} style={s.closeBtn} aria-label="Close">×</button>

        <div style={s.layout}>
          {/* Images */}
          <div style={s.imageSection}>
            {images.length > 0 ? (
              images.map((img, i) => (
                <img
                  key={i}
                  src={`https://res.cloudinary.com/${cloudName}/image/upload/c_fit,w_520,q_auto,f_auto/${img.public_id}`}
                  alt={`${record.ref} — image ${i + 1}`}
                  style={s.image}
                />
              ))
            ) : (
              <div style={s.noImage}>No image available</div>
            )}
          </div>

          {/* Metadata */}
          <div style={s.metaSection}>
            <h2 style={s.title}>{record.ref}</h2>
            <dl style={s.dl}>
              {fields.map(f => (
                <div key={f.label} style={s.field}>
                  <dt style={s.dt}>{f.label}</dt>
                  <dd style={s.dd}>{f.value}</dd>
                </div>
              ))}
            </dl>
            {record.tags?.length > 0 && (
              <div style={s.tagWrap}>
                {record.tags.map(tag => (
                  <span key={tag} style={s.tag}>{tag}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const s = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.65)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '1rem',
  },
  modal: {
    background: 'white',
    borderRadius: '6px',
    maxWidth: '860px',
    width: '100%',
    maxHeight: '92vh',
    overflow: 'auto',
    position: 'relative',
  },
  closeBtn: {
    position: 'absolute',
    top: '0.875rem',
    right: '1rem',
    background: 'none',
    border: 'none',
    fontSize: '1.75rem',
    lineHeight: 1,
    cursor: 'pointer',
    color: '#9ca3af',
    padding: '0 0.25rem',
    zIndex: 1,
  },
  layout: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '2rem',
    padding: '2rem',
  },
  imageSection: {
    flex: '1 1 300px',
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  image: {
    width: '100%',
    borderRadius: '4px',
    display: 'block',
    border: '1px solid #f0ede8',
  },
  noImage: {
    padding: '4rem 2rem',
    background: '#f5f5f0',
    textAlign: 'center',
    color: '#9ca3af',
    borderRadius: '4px',
    fontSize: '0.875rem',
  },
  metaSection: {
    flex: '1 1 240px',
  },
  title: {
    fontFamily: 'Georgia, serif',
    fontSize: '1.25rem',
    color: '#1a1a1a',
    margin: '0 0 1.5rem',
    paddingRight: '2rem',
  },
  dl: { margin: 0 },
  field: { marginBottom: '1.125rem' },
  dt: {
    fontSize: '0.65rem',
    textTransform: 'uppercase',
    letterSpacing: '0.09em',
    color: '#9ca3af',
    marginBottom: '0.2rem',
  },
  dd: {
    fontSize: '0.875rem',
    color: '#1a1a1a',
    margin: 0,
  },
  tagWrap: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.375rem',
    marginTop: '1.5rem',
    paddingTop: '1.5rem',
    borderTop: '1px solid #f0ede8',
  },
  tag: {
    fontSize: '0.65rem',
    padding: '0.2rem 0.5rem',
    borderRadius: '2px',
    backgroundColor: '#f0ede8',
    color: '#6b7280',
    letterSpacing: '0.04em',
  },
}
