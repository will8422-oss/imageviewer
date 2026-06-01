import { useState, useEffect, useRef } from 'react'
import OpenSeadragon from 'openseadragon'

const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME

// Keyframe animation for the loading symbol — injected once per mount
const ANIM_STYLE = `
  @keyframes osd-pulse {
    0%, 100% { opacity: 0.25; transform: scale(0.88); }
    50%       { opacity: 1;    transform: scale(1.12); }
  }
  .osd-pulse { animation: osd-pulse 1.8s ease-in-out infinite; }
`

export default function RecordModal({ record, allImages, showDimensions, onClose }) {
  const [activeIdx,     setActiveIdx]     = useState(0)
  const [loading,       setLoading]       = useState(true)
  const [viewerOpacity, setViewerOpacity] = useState(0)
  const [isFullscreen,  setIsFullscreen]  = useState(false)

  const containerRef  = useRef(null)  // OSD mount point  — no React children
  const viewerWrapRef = useRef(null)  // fullscreen target — contains viewer + overlays
  const viewerRef     = useRef(null)  // OSD viewer instance

  // ── Close: exit fullscreen first if active, else close modal ────────────────
  const handleClose = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {})
    } else {
      onClose()
    }
  }

  // ── Escape closes modal (browser already handles ESC to exit fullscreen) ─────
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !document.fullscreenElement) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // ── Filter images for this record ───────────────────────────────────────────
  const images = allImages.filter(img => {
    if (img.metadata?.group_id !== record.group_id) return false
    if (!showDimensions && img.metadata?.image_type === 'dimensions') return false
    return true
  })

  // ── Initialise OSD once on mount, destroy on unmount ────────────────────────
  useEffect(() => {
    if (!containerRef.current) return
    if (images.length === 0) { setLoading(false); return }

    const viewer = OpenSeadragon({
      element             : containerRef.current,
      tileSources         : { type: 'image', url: images[0].secure_url },

      // Hide all default controls — we provide custom ones
      showNavigationControl : false,
      showZoomControl       : false,
      showHomeControl       : false,
      showFullPageControl   : false,
      showRotationControl   : false,

      // Spring animation
      animationTime    : 0.4,
      springStiffness  : 8.0,
      blendTime        : 0.1,

      // Render first tile immediately (avoids black-screen on open)
      immediateRender    : true,
      minZoomImageRatio  : 1,

      // Zoom behaviour
      zoomPerScroll      : 1.2,
      maxZoomPixelRatio  : 4,
      minZoomLevel       : 0,
      defaultZoomLevel   : 0,
      visibilityRatio    : 1,
      constrainDuringPan : true,

      // Renderer — canvas avoids WebGL initialisation errors and supports fully-loaded-change
      drawer: 'canvas',

      // Appearance
      backgroundColor: '#12100d',

      // Mouse
      gestureSettingsMouse: {
        scrollToZoom      : true,
        clickToZoom       : false,
        dblClickToZoom    : true,
        dblClickDragToZoom: false,
        flickEnabled      : false,
      },

      // Touch
      gestureSettingsTouch: {
        scrollToZoom   : false,
        clickToZoom    : false,
        dblClickToZoom : true,
        pinchToZoom    : true,
        flickEnabled   : false,
      },
    })

    viewerRef.current = viewer

    // Fade viewer in once the image is fully loaded (fires on canvas drawer; tile-drawn does not)
    viewer.addHandler('fully-loaded-change', function onFullyLoaded(e) {
      if (!e.fullyLoaded) return
      viewer.removeHandler('fully-loaded-change', onFullyLoaded)
      setLoading(false)
      setViewerOpacity(1)
    })

    // Double-right-click → zoom out one step
    let rcCount = 0
    let rcTimer = null
    const onCtxMenu = (e) => {
      e.preventDefault()
      rcCount++
      clearTimeout(rcTimer)
      rcTimer = setTimeout(() => { rcCount = 0 }, 400)
      if (rcCount >= 2) {
        rcCount = 0
        viewer.viewport.zoomBy(0.5)
        viewer.viewport.applyConstraints()
      }
    }
    containerRef.current.addEventListener('contextmenu', onCtxMenu)

    // Track fullscreen state + tell OSD to recalculate viewport
    const onFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
      requestAnimationFrame(() => window.dispatchEvent(new Event('resize')))
    }
    document.addEventListener('fullscreenchange',       onFsChange)
    document.addEventListener('webkitfullscreenchange', onFsChange)

    return () => {
      clearTimeout(rcTimer)
      document.removeEventListener('fullscreenchange',       onFsChange)
      document.removeEventListener('webkitfullscreenchange', onFsChange)
      viewer.destroy()
      viewerRef.current = null
    }
  }, []) // eslint-disable-line — intentional: run only on mount

  // ── Switch image via thumbnail ───────────────────────────────────────────────
  const handleThumbClick = (idx) => {
    if (idx === activeIdx || !viewerRef.current) return
    setActiveIdx(idx)
    setLoading(true)
    setViewerOpacity(0)
    const viewer = viewerRef.current
    // fully-loaded-change does not fire after viewer.open() on an already-open viewer.
    // Instead: wait for 'open' (new tile source ready), then 'tile-drawn' (first pixel painted).
    function onOpen() {
      viewer.removeHandler('open', onOpen)
      function onTileDrawn() {
        viewer.removeHandler('tile-drawn', onTileDrawn)
        viewer.viewport.goHome(true)
        setLoading(false)
        setViewerOpacity(1)
      }
      viewer.addHandler('tile-drawn', onTileDrawn)
    }
    viewer.addHandler('open', onOpen)
    viewer.open({ type: 'image', url: images[idx].secure_url })
  }

  // ── Control actions ─────────────────────────────────────────────────────────
  const zoomIn    = () => viewerRef.current?.viewport.zoomBy(1.5)
  const zoomOut   = () => viewerRef.current?.viewport.zoomBy(0.67)
  const resetView = () => viewerRef.current?.viewport.goHome(true)
  const fullscreen = () => {
    if (!viewerWrapRef.current) return
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {})
    } else {
      viewerWrapRef.current.requestFullscreen().catch(() => {})
    }
  }

  const CONTROLS = [
    { icon: '+', title: 'Zoom in',                                        fn: zoomIn    },
    { icon: '−', title: 'Zoom out',                                       fn: zoomOut   },
    { icon: '⌂', title: 'Reset view',                                     fn: resetView },
    { icon: '⛶', title: isFullscreen ? 'Exit full screen' : 'Full screen', fn: fullscreen },
  ]

  // ── Metadata fields ─────────────────────────────────────────────────────────
  const fields = [
    { label: 'Object',     value: record.object_name },
    { label: 'Mark type',  value: record.mark_type   },
    { label: 'Year',       value: record.year_range || (record.year ? String(record.year) : null) },
    { label: 'Sponsor',    value: record.sponsor     },
    { label: 'Collection', value: record.collection  },
    { label: 'Notes',      value: record.notes       },
  ].filter(f => f.value)

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div onClick={handleClose} style={s.overlay}>
      <style>{ANIM_STYLE}</style>

      <div onClick={e => e.stopPropagation()} style={s.modal}>

        {/* ── OSD viewer ──────────────────────────────────────────────────── */}
        <div ref={viewerWrapRef} style={s.viewerWrap}>

          {/* Close button — inside viewerWrap so it stays visible in fullscreen */}
          <button
            onClick={handleClose}
            style={s.closeBtn}
            aria-label="Close"
            onMouseEnter={e => {
              e.currentTarget.style.backgroundColor = '#d4a843'
              e.currentTarget.style.color           = '#12100d'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.backgroundColor = '#2a2118'
              e.currentTarget.style.color           = '#d4a843'
            }}
          >×</button>

          {/* OSD mounts here. Do NOT add React children inside this div. */}
          <div
            ref={containerRef}
            style={{
              ...s.viewerContainer,
              opacity   : viewerOpacity,
              transition: 'opacity 0.3s ease',
            }}
          />

          {/* Loading indicator — fades out when first tile is painted */}
          <div style={{ ...s.loadingOverlay, opacity: loading ? 1 : 0, pointerEvents: loading ? 'auto' : 'none' }}>
            <span className="osd-pulse" style={s.loadingSymbol}>⚜</span>
          </div>

          {/* No-image fallback */}
          {images.length === 0 && !loading && (
            <div style={s.noImage}>No image available</div>
          )}

          {/* Custom control buttons */}
          {images.length > 0 && (
            <div style={s.controls}>
              {CONTROLS.map(c => (
                <button
                  key={c.title}
                  title={c.title}
                  onClick={c.fn}
                  style={s.ctrlBtn}
                  onMouseEnter={e => {
                    e.currentTarget.style.backgroundColor = '#231e17'
                    e.currentTarget.style.borderColor     = '#d4a843'
                    e.currentTarget.style.color           = '#f0d888'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.backgroundColor = '#1a1610'
                    e.currentTarget.style.borderColor     = '#3a3020'
                    e.currentTarget.style.color           = '#d4a843'
                  }}
                >
                  {c.icon}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Bottom section: thumbnail strip + metadata ───────────────────── */}
        <div style={s.bottom}>

          {/* Vertical thumbnail strip (only when multiple images exist) */}
          {images.length > 1 && (
            <div style={s.thumbStrip}>
              {images.map((img, i) => {
                const isDim    = img.metadata?.image_type === 'dimensions'
                const isActive = i === activeIdx
                const url = `https://res.cloudinary.com/${cloudName}/image/upload/c_fill,w_100,h_70,q_auto,f_auto/${img.public_id}`
                return (
                  <div
                    key={img.public_id}
                    onClick={() => handleThumbClick(i)}
                    style={{
                      ...s.thumb,
                      borderColor : isActive ? '#d4a843' : '#3a3020',
                      opacity     : isActive ? 1 : 0.5,
                    }}
                  >
                    <img src={url} alt="" style={s.thumbImg} loading="lazy" />
                    {isDim && <span style={s.dimLabel}>DIM</span>}
                  </div>
                )
              })}
            </div>
          )}

          {/* Metadata */}
          <div style={s.metaSection}>
            <h2 style={s.title}>{record.object_name}</h2>
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
                {record.tags.map(tag => <span key={tag} style={s.tag}>{tag}</span>)}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.88)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '1rem',
  },

  modal: {
    background   : '#19160f',
    border       : '1px solid #3a3020',
    borderRadius : '6px',
    width        : '90vw',
    maxWidth     : '960px',
    maxHeight    : '95vh',
    overflow     : 'auto',
    position     : 'relative',
    display      : 'flex',
    flexDirection: 'column',
  },

  // ── Viewer ──────────────────────────────────────────────────────────────────

  viewerWrap: {
    position       : 'relative',
    width          : '100%',
    height         : '420px',
    flexShrink     : 0,
    backgroundColor: '#12100d',
    overflow       : 'hidden',
  },

  closeBtn: {
    position       : 'absolute',
    top            : '0.75rem',
    right          : '0.875rem',
    width          : '32px',
    height         : '32px',
    backgroundColor: '#2a2118',
    border         : '1px solid #3a3020',
    borderRadius   : '4px',
    fontSize       : '20px',
    lineHeight     : 1,
    cursor         : 'pointer',
    color          : '#d4a843',
    display        : 'flex',
    alignItems     : 'center',
    justifyContent : 'center',
    padding        : 0,
    zIndex         : 20,
    transition     : 'background-color 0.15s, color 0.15s',
  },

  // OSD mounts into this div. Must fill the parent entirely.
  // position: relative is required for OSD's internal overlays.
  viewerContainer: {
    width   : '100%',
    height  : '100%',
    position: 'relative',
  },

  loadingOverlay: {
    position       : 'absolute',
    inset          : 0,
    backgroundColor: '#12100d',
    display        : 'flex',
    alignItems     : 'center',
    justifyContent : 'center',
    zIndex         : 10,
    transition     : 'opacity 0.5s ease',
  },

  loadingSymbol: {
    fontSize  : '2.5rem',
    color     : '#d4a843',
    userSelect: 'none',
  },

  noImage: {
    position      : 'absolute',
    inset         : 0,
    display       : 'flex',
    alignItems    : 'center',
    justifyContent: 'center',
    color         : '#4a3f2f',
    fontSize      : '0.875rem',
  },

  controls: {
    position      : 'absolute',
    bottom        : '1rem',
    right         : '1rem',
    zIndex        : 15,
    display       : 'flex',
    flexDirection : 'column',
    gap           : '4px',
  },

  ctrlBtn: {
    width          : '36px',
    height         : '36px',
    backgroundColor: '#1a1610',
    border         : '1px solid #3a3020',
    borderRadius   : '4px',
    color          : '#d4a843',
    fontSize       : '1.1rem',
    lineHeight     : 1,
    cursor         : 'pointer',
    display        : 'flex',
    alignItems     : 'center',
    justifyContent : 'center',
    padding        : 0,
    transition     : 'background-color 0.15s, border-color 0.15s, color 0.15s',
  },

  // ── Bottom section ──────────────────────────────────────────────────────────

  bottom: {
    display    : 'flex',
    gap        : '1.5rem',
    padding    : '1.5rem 2rem 2rem',
    borderTop  : '1px solid #2a2118',
    alignItems : 'flex-start',
  },

  thumbStrip: {
    display      : 'flex',
    flexDirection: 'column',
    gap          : '6px',
    flexShrink   : 0,
  },

  thumb: {
    width     : '80px',
    height    : '60px',
    border    : '2px solid #3a3020',
    borderRadius: '3px',
    overflow  : 'hidden',
    cursor    : 'pointer',
    position  : 'relative',
    flexShrink: 0,
    transition: 'border-color 0.15s, opacity 0.15s',
  },

  thumbImg: {
    width     : '100%',
    height    : '100%',
    objectFit : 'cover',
    display   : 'block',
  },

  dimLabel: {
    position       : 'absolute',
    bottom         : '2px',
    left           : '2px',
    fontSize       : '0.42rem',
    fontWeight     : '700',
    letterSpacing  : '0.06em',
    color          : '#d4a843',
    backgroundColor: 'rgba(15,13,11,0.88)',
    padding        : '1px 3px',
    borderRadius   : '1px',
    userSelect     : 'none',
  },

  // ── Metadata ────────────────────────────────────────────────────────────────

  metaSection: {
    flex    : 1,
    minWidth: 0,
  },

  title: {
    fontFamily  : "'Cormorant Garamond', Georgia, serif",
    fontSize    : '1.4rem',
    fontWeight  : '400',
    color       : '#c8b88a',
    margin      : '0 0 1.5rem',
    paddingRight: '2rem',
    lineHeight  : 1.3,
  },

  dl   : { margin: 0 },
  field: { marginBottom: '1.125rem' },

  dt: {
    fontSize     : '10px',
    textTransform: 'uppercase',
    letterSpacing: '0.15em',
    color        : '#6a5a3a',
    marginBottom : '0.25rem',
  },

  dd: {
    fontSize: '0.875rem',
    color   : '#c8b88a',
    margin  : 0,
  },

  tagWrap: {
    display    : 'flex',
    flexWrap   : 'wrap',
    gap        : '0.375rem',
    marginTop  : '1.5rem',
    paddingTop : '1.5rem',
    borderTop  : '1px solid #2a2118',
  },

  tag: {
    fontSize       : '0.62rem',
    padding        : '0.2rem 0.5rem',
    borderRadius   : '2px',
    backgroundColor: '#1a1610',
    border         : '1px solid #3a3020',
    color          : '#6a5a3a',
    letterSpacing  : '0.04em',
  },
}
