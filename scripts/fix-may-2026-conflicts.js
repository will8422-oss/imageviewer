#!/usr/bin/env node
/**
 * One-off helper for the May 2026 batch:
 *  1. Replaces /tmp symlink filepaths with the real Kirstin Kennedy paths
 *  2. Merges "St James Piccadilly cup" object name into "communion cup"
 *  3. Adds the two *_marks.JPG composite-hallmark rows
 *  4. Reassigns image_index within each group (primary first, then dimensions)
 *     and regenerates cloudinary_ref
 *
 * Idempotent: safe to re-run.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CSV = path.join(__dirname, 'inventory.csv')

const REAL_DIR = '/mnt/c/Users/Assay Surface/Desktop/Kirstin Kennedy/May 2026'
const SYM_DIR  = '/tmp/parse-base/Church plate on loan to V&A'

const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

function parseLine(line) {
  const out = []
  let i = 0
  while (i < line.length) {
    if (line[i] === '"') {
      let j = i + 1
      while (j < line.length) {
        if (line[j] === '"' && line[j + 1] === '"') { j += 2; continue }
        if (line[j] === '"') break
        j++
      }
      out.push(line.slice(i + 1, j).replace(/""/g, '"'))
      i = j + 2
    } else {
      const j = line.indexOf(',', i)
      out.push(line.slice(i, j === -1 ? undefined : j))
      i = j === -1 ? line.length : j + 1
    }
  }
  return out
}

const raw    = fs.readFileSync(CSV, 'utf8').trim().split(/\r?\n/)
const header = raw[0]
const cols   = header.split(',').map(s => s.replace(/^"|"$/g, ''))
const rows   = raw.slice(1).map(line => {
  const vals = parseLine(line)
  return Object.fromEntries(cols.map((c, i) => [c, vals[i] ?? '']))
})

// 1. Replace symlink filepath
for (const r of rows) {
  if (r.filepath.startsWith(SYM_DIR)) r.filepath = REAL_DIR + r.filepath.slice(SYM_DIR.length)
}

// 2. Merge "St James Piccadilly cup" → "St James Piccadilly communion cup"
for (const r of rows) {
  if (r.object_name === 'St James Piccadilly cup') {
    r.object_name = 'St James Piccadilly communion cup'
  }
}

// 3. Add the two *_marks.JPG composite-hallmark rows (if not already present)
const COMPOSITE_ROWS = [
  {
    filepath   : `${REAL_DIR}/St James Piccadilly_cup_marks.JPG`,
    collection : 'Church plate on loan to V&A',
    object_name: 'St James Piccadilly communion cup',
    mark_type  : 'hallmark',
    year_range : '1683',
    year_start : '1683',
    image_type : 'primary',
  },
  {
    filepath   : `${REAL_DIR}/St James Piccadilly_paten_marks.JPG`,
    collection : 'Church plate on loan to V&A',
    object_name: 'St James Piccadilly paten',
    mark_type  : 'hallmark',
    year_range : '1683-84',
    year_start : '1683',
    image_type : 'primary',
  },
]

for (const c of COMPOSITE_ROWS) {
  if (rows.some(r => r.filepath === c.filepath)) continue
  const groupId = `${slug(c.collection)}-${slug(c.object_name)}-${slug(c.mark_type)}-${c.year_start}`
  rows.push({
    ...c,
    image_index    : '0',         // overwritten below
    group_id       : groupId,
    cloudinary_ref : '',          // overwritten below
  })
}

// 4. Backfill year from sibling primary when a row (typically a _dims file)
//    has no year in its filename. Keyed by (collection, object_name, mark_type).
const yearByKey = {}
for (const r of rows) {
  if (r.year_start) {
    const k = `${r.collection}|${r.object_name}|${r.mark_type}`
    yearByKey[k] = { year_start: r.year_start, year_range: r.year_range }
  }
}
for (const r of rows) {
  if (!r.year_start) {
    const k = `${r.collection}|${r.object_name}|${r.mark_type}`
    if (yearByKey[k]) {
      r.year_start = yearByKey[k].year_start
      r.year_range = yearByKey[k].year_range
    }
  }
}

// 5. Reassign image_index per group; regenerate group_id + cloudinary_ref
const byGroup = {}
for (const r of rows) {
  // Group_id depends on object_name (changed above) — regenerate
  r.group_id = `${slug(r.collection)}-${slug(r.object_name)}-${slug(r.mark_type)}-${r.year_start || 'unknown'}`
  ;(byGroup[r.group_id] ||= []).push(r)
}

const TYPE_RANK = { primary: 0, dimensions: 1 }
for (const group of Object.values(byGroup)) {
  group.sort((a, b) => {
    const ra = TYPE_RANK[a.image_type] ?? 99
    const rb = TYPE_RANK[b.image_type] ?? 99
    if (ra !== rb) return ra - rb
    return a.filepath.localeCompare(b.filepath)
  })
  group.forEach((r, idx) => {
    r.image_index    = String(idx)
    r.cloudinary_ref = `hallmarks/${r.group_id}-${idx}`
  })
}

const csvEsc = v => `"${String(v ?? '').replace(/"/g, '""')}"`
const out    = [header, ...rows.map(r => cols.map(c => csvEsc(r[c])).join(','))]
fs.writeFileSync(CSV, out.join('\n') + '\n', 'utf8')

console.log(`Wrote ${rows.length} rows.`)
console.log(`Distinct groups: ${Object.keys(byGroup).length}`)
