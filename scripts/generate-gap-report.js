/**
 * generate-gap-report.js
 * Queries the Cloudinary hallmark archive, performs gap analysis, and outputs
 * a formatted Word document (.docx) for London Assay Office acquisition planning.
 *
 * Usage: node scripts/generate-gap-report.js
 */

import { v2 as cloudinary } from 'cloudinary'
import dotenv from 'dotenv'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  PageBreak, BorderStyle, ShadingType, WidthType, AlignmentType,
  convertInchesToTwip,
} from 'docx'

dotenv.config()
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ── Palette (hex without #) ───────────────────────────────────────────────────
const C = {
  DARK   : '1A1610',
  MID    : '2A2118',
  GOLD   : 'B8860B',
  GOLD_L : 'D4A843',
  TEXT   : '1A1610',
  MUTED  : '5A4A2A',
  PALE   : 'F5EDD8',   // highlight bg for priority rows
  RED    : 'C0392B',
  GREEN  : '27AE60',
  WHITE  : 'FFFFFF',
  GREY   : '999999',
}

// ── Canonical active periods ──────────────────────────────────────────────────
const ACTIVE_PERIODS = {
  "leopard's head crowned" : { start: 1478, end: 1821 },
  "leopard's head"         : { start: 1822, end: 1897 },
  "lion passant"           : { start: 1544, end: 1897 },
  "date letter"            : { start: 1478, end: 1897 },
  "britannia"              : { start: 1697, end: 1720 },
  "duty mark"              : { start: 1784, end: 1890 },
  "sponsor mark"           : { start: 1478, end: 1897 },
  "duty drawback mark"     : { start: 1784, end: 1784 },
  "britannia mark"         : { start: 1697, end: 1720 },
  "townmark"               : { start: 1478, end: 1897 },
}

const PRIMARY_MARKS = new Set([
  "leopard's head crowned", "leopard's head", "lion passant", "date letter",
])

// Century priority weights — using Math.ceil(year/100) for ordinal century
// (17th = 1601–1700, 18th = 1701–1800 are the core goldsmithing periods)
const PERIOD_WEIGHT = { 16: 1, 17: 3, 18: 3, 19: 2 }

// Mark type weight for scoring
const markWeight = (t) => PRIMARY_MARKS.has(t) ? 3 : 1

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1 — DATA COLLECTION
// ─────────────────────────────────────────────────────────────────────────────

async function fetchAll() {
  const assets = []
  let nextCursor
  do {
    const result = await cloudinary.search
      .expression('public_id:hallmarks/*')
      .with_field(['metadata', 'tags'])
      .max_results(500)
      .next_cursor(nextCursor)
      .execute()
    assets.push(...result.resources)
    nextCursor = result.next_cursor
  } while (nextCursor)
  return assets
}

function buildRecords(assets) {
  // Exclude dimensions images; group by group_id (one record per mark object)
  const byGroup = new Map()
  for (const a of assets) {
    const meta = a.metadata || {}
    if (meta.image_type === 'dimensions') continue
    const gid = meta.group_id || a.public_id
    if (!byGroup.has(gid)) {
      byGroup.set(gid, {
        group_id   : gid,
        year       : meta.year != null ? Number(meta.year) : null,
        year_range : meta.year_range   || '',
        mark_type  : meta.mark_type    || '',
        mark_type_2: meta.mark_type_2  || '',
        collection : meta.collection   || '',
        object_name: meta.object_name  || '',
        sponsor    : meta.sponsor      || '',
        image_type : meta.image_type   || '',
      })
    }
  }
  return [...byGroup.values()]
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2 — GAP ANALYSIS
// ─────────────────────────────────────────────────────────────────────────────

// Groups sorted integers into consecutive runs
function consecutiveRuns(nums) {
  if (nums.length === 0) return []
  const sorted = [...nums].sort((a, b) => a - b)
  const runs = []
  let start = sorted[0]; let prev = sorted[0]
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === prev + 1) { prev = sorted[i] }
    else { runs.push({ start, end: prev, length: prev - start + 1 }); start = prev = sorted[i] }
  }
  runs.push({ start, end: prev, length: prev - start + 1 })
  return runs
}

// A — Year gaps
function analyseYearGaps(records) {
  const years = [...new Set(records.map(r => r.year).filter(Boolean))]
  if (years.length === 0) return { min: 0, max: 0, total: 0, covered: 0, pct: 0, missing: [], runs: [] }

  const min = Math.min(...years)
  const max = Math.max(...years)
  const yearSet = new Set(years)
  const missing = []
  for (let y = min; y <= max; y++) if (!yearSet.has(y)) missing.push(y)

  const runs = consecutiveRuns(missing).sort((a, b) => b.length - a.length)
  const total = max - min + 1

  return { min, max, total, covered: years.length, pct: Math.round(years.length / total * 100), missing, runs }
}

// B — Mark type gaps by period
function analyseMarkTypeGaps(records) {
  const out = {}
  for (const [mt, { start, end }] of Object.entries(ACTIVE_PERIODS)) {
    const matching = records.filter(r =>
      (r.mark_type === mt || r.mark_type_2 === mt) && r.year != null
    )
    const yearsPresent = new Set(matching.map(r => r.year))

    const minDec = Math.floor(start / 10) * 10
    const maxDec = Math.floor(end   / 10) * 10
    const missingDecades = []

    for (let d = minDec; d <= maxDec; d += 10) {
      const dStart = Math.max(d, start)
      const dEnd   = Math.min(d + 9, end)
      let found = false
      for (let y = dStart; y <= dEnd; y++) { if (yearsPresent.has(y)) { found = true; break } }
      if (!found) missingDecades.push(d)
    }

    const activeDecades  = Math.round((maxDec - minDec) / 10) + 1
    const coveredDecades = activeDecades - missingDecades.length
    const pct = Math.round(coveredDecades / activeDecades * 100)

    // Consecutive decade runs → year ranges (clamp end to active period)
    const decadeRuns = consecutiveRuns(missingDecades.map(d => d / 10)).map(r => ({
      start  : r.start * 10,
      end    : Math.min(r.end * 10 + 9, end),
      decades: r.length,
    }))

    out[mt] = {
      active: { start, end },
      totalRecords: matching.length,
      activeDecades,
      coveredDecades,
      pct,
      missingDecades,
      missingRuns: decadeRuns,
      isBritannia: mt === 'britannia' || mt === 'britannia mark',
    }
  }
  return out
}

// C — Collection coverage matrix
function analyseCollectionMatrix(records) {
  const collections = [...new Set(records.map(r => r.collection).filter(Boolean))].sort()
  const centuries   = [15, 16, 17, 18, 19]

  function expectedForCentury(c) {
    const s = c * 100; const e = s + 99
    return Object.entries(ACTIVE_PERIODS)
      .filter(([, p]) => p.start <= e && p.end >= s)
      .map(([n]) => n)
  }

  const matrix = {}
  for (const col of collections) {
    matrix[col] = {}
    for (const c of centuries) {
      const s = c * 100; const e = s + 99
      const recs = records.filter(r => r.collection === col && r.year != null && r.year >= s && r.year <= e)
      const presentSet = new Set(recs.flatMap(r => [r.mark_type, r.mark_type_2].filter(Boolean)))
      const expected   = expectedForCentury(c)
      const missing    = expected.filter(t => !presentSet.has(t))
      matrix[col][c]   = {
        count   : recs.length,
        present : [...presentSet],
        expected,
        missing,
        pct: expected.length > 0 ? Math.round((expected.length - missing.length) / expected.length * 100) : 100,
      }
    }
  }
  return { collections, centuries, matrix }
}

// D — Priority gap scoring
function scorePriorityGaps(records, markTypeGaps) {
  const allCols = [...new Set(records.map(r => r.collection).filter(Boolean))]
  const gaps    = []

  for (const [mt, data] of Object.entries(markTypeGaps)) {
    const mw = markWeight(mt)

    for (const run of data.missingRuns) {
      const mid     = Math.round((run.start + run.end) / 2)
      const century = Math.ceil(mid / 100)
      const pw      = PERIOD_WEIGHT[century] || 1

      // How many collections also lack this mark type in this period?
      const isolatedCount = allCols.filter(col => {
        return !records.some(r =>
          r.collection === col &&
          r.year != null &&
          r.year >= run.start && r.year <= run.end &&
          (r.mark_type === mt || r.mark_type_2 === mt)
        )
      }).length
      const isolationBonus = isolatedCount === allCols.length ? 2
                           : isolatedCount >= allCols.length * 0.75 ? 1 : 0

      // Collections near this period (to list as affected)
      const affected = allCols.filter(col =>
        records.some(r => r.collection === col && r.year != null && Math.abs(r.year - mid) < 60)
      )

      const score = (pw * 3) + (mw * 3) + Math.min(run.decades, 6) + (isolationBonus * 2)

      gaps.push({
        markType: mt, start: run.start, end: run.end, decades: run.decades,
        century, periodWeight: pw, mw, isolationBonus, isolatedCount,
        collectionsAffected: affected, score,
      })
    }
  }

  return gaps.sort((a, b) => b.score - a.score).slice(0, 20)
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 3 — WORD DOCUMENT
// ─────────────────────────────────────────────────────────────────────────────

// ── Table helpers ─────────────────────────────────────────────────────────────

const CELL_BORDERS = {
  top   : { style: BorderStyle.SINGLE, size: 1, color: '2A2118' },
  bottom: { style: BorderStyle.SINGLE, size: 1, color: '2A2118' },
  left  : { style: BorderStyle.SINGLE, size: 1, color: '2A2118' },
  right : { style: BorderStyle.SINGLE, size: 1, color: '2A2118' },
}

function pct(n) { return { size: n, type: WidthType.PERCENTAGE } }

function hdrCell(text, w) {
  return new TableCell({
    width  : pct(w),
    borders: CELL_BORDERS,
    shading: { fill: C.DARK, type: ShadingType.SOLID, color: C.DARK },
    children: [new Paragraph({
      children: [new TextRun({ text: String(text), bold: true, color: C.GOLD_L, font: 'Georgia', size: 18 })],
    })],
  })
}

function dataCell(text, w, opts = {}) {
  const { bg, color, bold, center } = opts
  return new TableCell({
    width  : pct(w),
    borders: CELL_BORDERS,
    shading: bg ? { fill: bg, type: ShadingType.SOLID, color: bg } : undefined,
    children: [new Paragraph({
      alignment: center ? AlignmentType.CENTER : AlignmentType.LEFT,
      children : [new TextRun({
        text : String(text ?? ''),
        color: color || C.TEXT,
        bold : !!bold,
        font : 'Georgia',
        size : 18,
      })],
    })],
  })
}

// ── Paragraph helpers ─────────────────────────────────────────────────────────

function h1(text) {
  return [
    new Paragraph({
      children: [new TextRun({ text, font: 'Georgia', bold: true, size: 30, color: C.DARK })],
      spacing : { before: 480, after: 80 },
    }),
    new Paragraph({
      children: [],
      border  : { bottom: { style: BorderStyle.SINGLE, size: 6, color: C.GOLD, space: 1 } },
      spacing : { before: 0, after: 200 },
    }),
  ]
}

function h2(text) {
  return new Paragraph({
    children: [new TextRun({ text, font: 'Georgia', bold: true, size: 24, color: C.DARK })],
    spacing : { before: 300, after: 120 },
  })
}

function body(text) {
  return new Paragraph({
    children: [new TextRun({ text, font: 'Georgia', size: 20, color: C.TEXT })],
    spacing : { before: 80, after: 80 },
  })
}

function note(text, color = C.GOLD) {
  return new Paragraph({
    children: [new TextRun({ text, font: 'Georgia', size: 18, color, bold: true })],
    spacing : { before: 80, after: 80 },
    indent  : { left: convertInchesToTwip(0.2), right: convertInchesToTwip(0.2) },
    shading : { fill: C.PALE, type: ShadingType.SOLID, color: C.PALE },
  })
}

function alertNote(text) {
  return new Paragraph({
    children: [new TextRun({ text, font: 'Georgia', size: 18, color: C.RED, bold: true })],
    spacing : { before: 80, after: 80 },
    indent  : { left: convertInchesToTwip(0.2), right: convertInchesToTwip(0.2) },
    shading : { fill: 'FDF2F2', type: ShadingType.SOLID, color: 'FDF2F2' },
  })
}

function bullet(text) {
  return new Paragraph({
    children: [new TextRun({ text: `\u2022  ${text}`, font: 'Georgia', size: 20, color: C.TEXT })],
    indent  : { left: convertInchesToTwip(0.3) },
    spacing : { before: 40, after: 40 },
  })
}

function sp() { return new Paragraph({ children: [], spacing: { before: 120, after: 0 } }) }
function pb() { return new Paragraph({ children: [new PageBreak()] }) }

// ── Century ordinal label ─────────────────────────────────────────────────────
function centuryOrd(n) {
  const s = ['th','st','nd','rd']; const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0]) + ' century'
}

// ── Mark type abbreviation for matrix ────────────────────────────────────────
const ABBREV = {
  "leopard's head crowned" : 'LH\u2654',
  "leopard's head"         : 'LH',
  "lion passant"           : 'LP',
  "date letter"            : 'DL',
  "sponsor mark"           : 'SM',
  "duty mark"              : 'DM',
  "britannia"              : 'BR',
  "britannia mark"         : 'BRM',
  "duty drawback mark"     : 'DDM',
  "townmark"               : 'TM',
}
const abbr = (t) => ABBREV[t] || t.slice(0, 3).toUpperCase()

// ─────────────────────────────────────────────────────────────────────────────
// DOCUMENT ASSEMBLY
// ─────────────────────────────────────────────────────────────────────────────

function buildDocument(records, yearGaps, markTypeGaps, colMatrix, priorityGaps, dateStr) {
  const { collections, centuries, matrix } = colMatrix
  const nRecords = records.length

  // ── Cover ──────────────────────────────────────────────────────────────────
  const cover = [
    new Paragraph({ children: [], spacing: { before: 1440 } }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children : [new TextRun({ text: 'LONDON ASSAY OFFICE', font: 'Georgia', bold: true, size: 40, color: C.DARK, allCaps: true, characterSpacing: 80 })],
      spacing  : { before: 0, after: 200 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children : [new TextRun({ text: 'Hallmark Reference Archive', font: 'Georgia', italics: true, size: 28, color: C.GOLD })],
      spacing  : { before: 0, after: 600 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      border   : { bottom: { style: BorderStyle.SINGLE, size: 6, color: C.GOLD, space: 0 } },
      children : [],
      spacing  : { before: 0, after: 600 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children : [new TextRun({ text: 'Acquisition Priorities Report', font: 'Georgia', bold: true, size: 52, color: C.DARK })],
      spacing  : { before: 0, after: 400 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children : [new TextRun({ text: `Generated: ${dateStr}`, font: 'Georgia', size: 22, color: C.MUTED })],
      spacing  : { before: 0, after: 80 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children : [new TextRun({ text: `Based on ${nRecords.toLocaleString()} mark records across ${collections.length} collections`, font: 'Georgia', size: 22, color: C.MUTED })],
    }),
    pb(),
  ]

  // ── Section 1: Executive Summary ──────────────────────────────────────────
  const top = priorityGaps[0]
  const bestMTs = Object.entries(markTypeGaps)
    .filter(([, d]) => d.totalRecords > 0 && d.pct >= 50)
    .sort((a, b) => b[1].pct - a[1].pct)
    .slice(0, 3)
    .map(([n, d]) => `${n} (${d.pct}% decade coverage)`)

  const worstMTs = Object.entries(markTypeGaps)
    .filter(([, d]) => d.totalRecords > 0 && d.missingDecades.length > 0)
    .sort((a, b) => a[1].pct - b[1].pct)
    .slice(0, 3)
    .map(([n, d]) => `${n} (${d.pct}% coverage, ${d.missingDecades.length} missing decades)`)

  const longestRun = yearGaps.runs[0]
  const longRunCount = yearGaps.runs.filter(r => r.length >= 10).length

  const summaryTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows : [
      new TableRow({ children: [
        hdrCell('Collection Span',       25),
        hdrCell('Year Coverage',         25),
        hdrCell('Gap Years',             25),
        hdrCell('Priority Acquisitions', 25),
      ]}),
      new TableRow({ children: [
        dataCell(`${yearGaps.min}\u2013${yearGaps.max}`, 25, { center: true, bold: true }),
        dataCell(`${yearGaps.pct}%`,                     25, { center: true, bold: true }),
        dataCell(`${yearGaps.missing.length}`,           25, { center: true, bold: true }),
        dataCell(`${priorityGaps.length}`,               25, { center: true, bold: true }),
      ]}),
    ],
  })

  const s1 = [
    ...h1('1.  Executive Summary'),
    summaryTable,
    sp(),
    body(`The London Assay Office Hallmark Reference Archive holds ${nRecords.toLocaleString()} mark records spanning ${yearGaps.min} to ${yearGaps.max} \u2014 a range of ${yearGaps.max - yearGaps.min + 1} years. Of the ${yearGaps.total.toLocaleString()} possible years within this span, ${yearGaps.covered.toLocaleString()} (${yearGaps.pct}%) are represented by at least one record. The collection is strongest in the 17th and 18th centuries, which form the core of London\u2019s goldsmithing tradition.${bestMTs.length > 0 ? ` Mark types with the strongest decade-level coverage include: ${bestMTs.join('; ')}.` : ''}`),
    sp(),
    body(`The most significant coverage gaps occur in: ${worstMTs.join('; ')}. There ${longRunCount === 1 ? 'is' : 'are'} ${longRunCount} run${longRunCount !== 1 ? 's' : ''} of ten or more consecutive unrepresented years. The longest single gap spans ${longestRun?.length ?? 0} years (${longestRun?.start}\u2013${longestRun?.end}). The Britannia standard period (1697\u20131720) is a narrow 23-year window \u2014 any gaps within it represent high-value acquisition targets.`),
    sp(),
    body(`Top recommendation: ${top ? `Acquire records of \u2018${top.markType}\u2019 for the period ${top.start}\u2013${top.end} (${top.decades} missing decade${top.decades !== 1 ? 's' : ''}, ${centuryOrd(top.century)}). This gap achieves a priority score of ${top.score}, reflecting a primary mark-type absence affecting ${top.collectionsAffected.length} collection${top.collectionsAffected.length !== 1 ? 's' : ''}.` : 'Consult the priority gap tables below for targeted acquisition opportunities.'}`),
    pb(),
  ]

  // ── Section 2: Year Gaps ──────────────────────────────────────────────────
  const displayedRuns = yearGaps.runs.slice(0, 60)

  const gapTableRows = [
    new TableRow({ children: [
      hdrCell('Gap Period', 28),
      hdrCell('Duration',   16),
      hdrCell('Century',    22),
      hdrCell('Notes',      34),
    ]}),
    ...displayedRuns.map(run => {
      const mid  = Math.round((run.start + run.end) / 2)
      const cent = Math.ceil(mid / 100)
      const isLong = run.length >= 10
      const bg   = isLong ? C.PALE : undefined
      return new TableRow({ children: [
        dataCell(`${run.start}\u2013${run.end}`, 28, { bg, bold: isLong }),
        dataCell(`${run.length} yr${run.length !== 1 ? 's' : ''}`, 16, { bg }),
        dataCell(centuryOrd(cent), 22, { bg }),
        dataCell(isLong ? '\u26D4  Extended gap \u2014 acquisition priority' : '', 34,
          { bg, color: isLong ? C.GOLD : C.TEXT }),
      ]})
    }),
  ]

  const s2 = [
    ...h1('2.  Year Gaps'),
    body(`The collection has ${yearGaps.missing.length.toLocaleString()} years within its span with no records. These fall into ${yearGaps.runs.length} gap run${yearGaps.runs.length !== 1 ? 's' : ''}; runs of 10 or more consecutive years are highlighted.${displayedRuns.length < yearGaps.runs.length ? ` (Table shows the ${displayedRuns.length} longest runs.)` : ''}`),
    sp(),
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: gapTableRows }),
    pb(),
  ]

  // ── Section 3: Mark Type Gaps ─────────────────────────────────────────────
  const s3 = [...h1('3.  Mark Type Gaps by Period')]

  // Only include mark types that have gaps AND are present in the collection or have a very narrow period
  const markTypesWithGaps = Object.entries(markTypeGaps)
    .filter(([, d]) => d.missingDecades.length > 0)
    .sort((a, b) => b[1].missingDecades.length - a[1].missingDecades.length)

  for (const [mt, data] of markTypesWithGaps) {
    s3.push(h2(`${mt.charAt(0).toUpperCase()}${mt.slice(1)}`))
    s3.push(body(
      `Active period: ${data.active.start}\u2013${data.active.end}` +
      `   \u2502   Records in collection: ${data.totalRecords}` +
      `   \u2502   Decade coverage: ${data.coveredDecades}/${data.activeDecades} (${data.pct}%)`
    ))

    if (data.isBritannia && data.pct < 50) {
      s3.push(alertNote(
        `\u26A0  The ${mt} period spans only 23 years (1697\u20131720). ` +
        `At ${data.pct}% coverage this is below 50% \u2014 targeted acquisition within this narrow window is strongly recommended.`
      ))
    }

    if (data.missingRuns.length > 0) {
      s3.push(body('Missing decade runs within active period:'))
      for (const run of data.missingRuns) {
        s3.push(bullet(
          `${run.start}\u2013${run.end} ` +
          `(${run.decades} decade${run.decades !== 1 ? 's' : ''}, ` +
          `${centuryOrd(Math.ceil((run.start + run.end) / 2 / 100))})`
        ))
      }
    }
    s3.push(sp())
  }
  s3.push(pb())

  // ── Section 4: Collection Coverage Matrix ─────────────────────────────────
  // Dynamic column widths: name col takes ~30%, remaining split across centuries
  const nameW = 30
  const centW = Math.floor(70 / centuries.length)
  const lastW = 100 - nameW - centW * (centuries.length - 1)

  const matrixRows1 = [
    new TableRow({ children: [
      hdrCell('Collection', nameW),
      ...centuries.map((c, i) => hdrCell(`${c}c`, i === centuries.length - 1 ? lastW : centW)),
    ]}),
    ...collections.map(col => new TableRow({ children: [
      dataCell(col, nameW, { bold: true }),
      ...centuries.map((c, i) => {
        const w    = i === centuries.length - 1 ? lastW : centW
        const cnt  = matrix[col]?.[c]?.count ?? 0
        return dataCell(cnt > 0 ? cnt.toLocaleString() : '\u2014', w, {
          center: true,
          color : cnt > 0 ? C.TEXT : C.GREY,
        })
      }),
    ]})),
  ]

  const matrixRows2 = [
    new TableRow({ children: [
      hdrCell('Collection', nameW),
      ...centuries.map((c, i) => hdrCell(`${c}c`, i === centuries.length - 1 ? lastW : centW)),
    ]}),
    ...collections.map(col => new TableRow({ children: [
      dataCell(col, nameW, { bold: true }),
      ...centuries.map((c, i) => {
        const w   = i === centuries.length - 1 ? lastW : centW
        const d   = matrix[col]?.[c]
        if (!d || d.count === 0) return dataCell('\u2014', w, { center: true, color: C.GREY })
        const missingPrimary = d.missing.filter(t => PRIMARY_MARKS.has(t))
        if (missingPrimary.length === 0) return dataCell('\u2713', w, { center: true, color: C.GREEN, bold: true })
        return dataCell(missingPrimary.map(abbr).join(' '), w, { color: C.RED, bold: true, center: true })
      }),
    ]})),
  ]

  const s4 = [
    ...h1('4.  Collection Coverage Matrix'),
    body('Table 4.1 shows record counts by collection and century. A dash indicates no records in that period.'),
    sp(),
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: matrixRows1 }),
    sp(),
    body('Table 4.2 shows missing primary mark types by collection and century. \u2713 = all expected primary marks present. Missing marks shown by abbreviation: LH\u2654 = leopard\u2019s head crowned, LH = leopard\u2019s head, LP = lion passant, DL = date letter.'),
    sp(),
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: matrixRows2 }),
    pb(),
  ]

  // ── Section 5: Priority Acquisition List ──────────────────────────────────
  const priorityRows = [
    new TableRow({ children: [
      hdrCell('Rank', 6),
      hdrCell('Period', 14),
      hdrCell('Mark Type', 22),
      hdrCell('Collections Affected', 24),
      hdrCell('Score', 8),
      hdrCell('Notes', 26),
    ]}),
    ...priorityGaps.map((gap, i) => {
      const notes = [
        gap.isolationBonus >= 2 ? 'Gap across all collections' : gap.isolationBonus === 1 ? 'Widespread gap' : '',
        PRIMARY_MARKS.has(gap.markType) ? 'Primary mark type' : '',
        gap.decades >= 5 ? `Extended gap (${gap.decades} decades)` : '',
        centuryOrd(gap.century),
      ].filter(Boolean).join('; ')
      const colList = gap.collectionsAffected.slice(0, 2).join(', ') +
        (gap.collectionsAffected.length > 2 ? ` +${gap.collectionsAffected.length - 2} more` : '')
      return new TableRow({ children: [
        dataCell(i + 1,                                 6,  { center: true, bold: true, bg: i < 5 ? C.PALE : undefined }),
        dataCell(`${gap.start}\u2013${gap.end}`,        14, { bg: i < 5 ? C.PALE : undefined }),
        dataCell(gap.markType,                          22, { bg: i < 5 ? C.PALE : undefined }),
        dataCell(colList || '\u2014',                   24, { bg: i < 5 ? C.PALE : undefined }),
        dataCell(gap.score,                              8, { center: true, bold: true, bg: i < 5 ? C.PALE : undefined }),
        dataCell(notes,                                 26, { bg: i < 5 ? C.PALE : undefined }),
      ]})
    }),
  ]

  const s5 = [
    ...h1('5.  Priority Acquisition List'),
    body(
      `The following ${priorityGaps.length} priority gaps are ranked by composite score. ` +
      `Scoring factors: period significance (17th\u201318th century \xd73), mark type importance ` +
      `(primary marks \xd73), gap length (up to 6 decades), and cross-collection isolation ` +
      `(+4 if absent across all collections, +2 if absent from \u226575% of collections). ` +
      `The top five entries are highlighted. Higher scores indicate greater acquisition impact.`
    ),
    sp(),
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: priorityRows }),
    sp(),
    note(
      'Primary mark abbreviations: LH\u2654 = leopard\u2019s head crowned  \u2502  LH = leopard\u2019s head  ' +
      '\u2502  LP = lion passant  \u2502  DL = date letter  \u2502  SM = sponsor mark  \u2502  DM = duty mark'
    ),
  ]

  // ── Assemble ───────────────────────────────────────────────────────────────
  const doc = new Document({
    title   : 'LAO Hallmark Archive \u2014 Acquisition Priorities',
    creator : 'London Assay Office',
    sections: [{
      properties: {
        page: {
          margin: {
            top   : convertInchesToTwip(1.0),
            bottom: convertInchesToTwip(1.0),
            left  : convertInchesToTwip(1.25),
            right : convertInchesToTwip(1.25),
          },
        },
      },
      children: [...cover, ...s1, ...s2, ...s3, ...s4, ...s5],
    }],
  })

  return doc
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  if (!process.env.CLOUDINARY_CLOUD_NAME) {
    console.error('Missing CLOUDINARY_CLOUD_NAME \u2014 check your .env file')
    process.exit(1)
  }

  cloudinary.config({
    cloud_name : process.env.CLOUDINARY_CLOUD_NAME,
    api_key    : process.env.CLOUDINARY_API_KEY,
    api_secret : process.env.CLOUDINARY_API_SECRET,
  })

  // Step 1: Fetch
  console.log('Fetching assets from Cloudinary\u2026')
  const assets = await fetchAll()
  console.log(`  ${assets.length} assets fetched`)
  const records = buildRecords(assets)
  console.log(`  ${records.length} unique mark records (primary images, grouped by group_id)`)

  // Step 2: Analyse
  console.log('\nAnalysing gaps\u2026')
  const yearGaps     = analyseYearGaps(records)
  const markTypeGaps = analyseMarkTypeGaps(records)
  const colMatrix    = analyseCollectionMatrix(records)
  const priorityGaps = scorePriorityGaps(records, markTypeGaps)

  console.log(`  Span: ${yearGaps.min}\u2013${yearGaps.max}  |  Year coverage: ${yearGaps.covered}/${yearGaps.total} (${yearGaps.pct}%)`)
  console.log(`  Gap years: ${yearGaps.missing.length} across ${yearGaps.runs.length} runs`)
  console.log(`  Collections: ${colMatrix.collections.length}`)

  // Sanity check: top 5 priority gaps
  console.log('\nTop 5 priority gaps:')
  for (let i = 0; i < Math.min(5, priorityGaps.length); i++) {
    const g = priorityGaps[i]
    console.log(`  ${i + 1}. ${g.markType}  ${g.start}\u2013${g.end}  (${g.decades} decade${g.decades !== 1 ? 's' : ''}, ${centuryOrd(g.century)}, score ${g.score})`)
  }

  // Step 3: Generate document
  const today  = new Date()
  const dateStr = today.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const stamp   = today.toISOString().slice(0, 10)
  const outPath = path.join(__dirname, `LAO-Acquisition-Priorities-${stamp}.docx`)

  console.log('\nGenerating Word document\u2026')
  const doc    = buildDocument(records, yearGaps, markTypeGaps, colMatrix, priorityGaps, dateStr)
  const buffer = await Packer.toBuffer(doc)
  fs.writeFileSync(outPath, buffer)

  console.log(`\nDone.  ${outPath}`)
  console.log(`File size: ${(buffer.length / 1024).toFixed(1)} KB`)
}

main().catch(err => {
  console.error('Fatal:', err.message || err)
  process.exit(1)
})
