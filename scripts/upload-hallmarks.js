/**
 * upload-hallmarks.js
 * Reads scripts/inventory.csv and uploads every image to Cloudinary with
 * structured metadata and tags.
 *
 * Usage:  node scripts/upload-hallmarks.js
 *
 * Requires CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
 * in .env (or environment).
 */

import { v2 as cloudinary } from 'cloudinary'
import fs   from 'fs'
import path from 'path'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'

dotenv.config()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CSV_PATH    = path.join(__dirname, 'inventory.csv')
const ERRORS_PATH = path.join(__dirname, 'upload-errors.txt')

cloudinary.config({
  cloud_name : process.env.CLOUDINARY_CLOUD_NAME,
  api_key    : process.env.CLOUDINARY_API_KEY,
  api_secret : process.env.CLOUDINARY_API_SECRET,
})

// ─── Metadata schema required by this pipeline ───────────────────────────────
const SCHEMA_FIELDS = [
  { external_id: 'collection',   label: 'Collection',   type: 'string'  },
  { external_id: 'object_name',  label: 'Object Name',  type: 'string'  },
  { external_id: 'mark_type',    label: 'Mark Type',    type: 'string'  },
  { external_id: 'year_range',   label: 'Year Range',   type: 'string'  },
  { external_id: 'year',         label: 'Year',         type: 'integer' },
  { external_id: 'image_type',   label: 'Image Type',   type: 'string'  },
  { external_id: 'group_id',     label: 'Group ID',     type: 'string'  },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────
function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function getCentury(year) {
  const c = Math.floor((year - 1) / 100) + 1
  const ord = (c % 10 === 1 && c % 100 !== 11) ? 'st'
            : (c % 10 === 2 && c % 100 !== 12) ? 'nd'
            : (c % 10 === 3 && c % 100 !== 13) ? 'rd' : 'th'
  return `${c}${ord}-century`
}

// Sanitise a metadata value: strip pipe and equals characters which would
// break the pipe-delimited metadata string format.
function sanitise(v) {
  return String(v ?? '').replace(/[|=]/g, ' ').trim()
}

// ─── CSV parser (handles quoted fields) ──────────────────────────────────────
function parseCSV(content) {
  const lines = content.trim().split(/\r?\n/)
  const headers = parseLine(lines[0])
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const values = parseLine(line)
    return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? '']))
  })
}

function parseLine(line) {
  const fields = []
  let i = 0
  while (i < line.length) {
    if (line[i] === '"') {
      let j = i + 1
      while (j < line.length) {
        if (line[j] === '"' && line[j + 1] === '"') { j += 2; continue }
        if (line[j] === '"') break
        j++
      }
      fields.push(line.slice(i + 1, j).replace(/""/g, '"'))
      i = j + 2
    } else {
      const j = line.indexOf(',', i)
      fields.push(line.slice(i, j === -1 ? undefined : j))
      i = j === -1 ? line.length : j + 1
    }
  }
  return fields
}

// ─── Ensure metadata schema exists ───────────────────────────────────────────
async function ensureSchema() {
  console.log('Checking metadata schema…')
  for (const field of SCHEMA_FIELDS) {
    try {
      await cloudinary.api.add_metadata_field(field)
      console.log(`  created : ${field.external_id} (${field.type})`)
    } catch (err) {
      const msg = (err.error?.message || err.message || '').toLowerCase()
      if (msg.includes('already exists') || msg.includes('external id')) {
        console.log(`  exists  : ${field.external_id}`)
      } else {
        throw new Error(`Failed to create metadata field "${field.external_id}": ${err.error?.message || err.message}`)
      }
    }
  }
  console.log()
}

// ─── Pre-fetch existing public IDs ───────────────────────────────────────────
async function fetchExisting() {
  console.log('Fetching existing assets from Cloudinary…')
  const existing = new Set()
  let nextCursor = undefined
  do {
    const result = await cloudinary.api.resources({
      type        : 'upload',
      prefix      : 'hallmarks/',
      max_results : 500,
      next_cursor : nextCursor,
    })
    for (const r of result.resources) existing.add(r.public_id)
    nextCursor = result.next_cursor
  } while (nextCursor)
  console.log(`  ${existing.size} assets already in Cloudinary\n`)
  return existing
}

// ─── Upload one row ───────────────────────────────────────────────────────────
async function uploadRow(row) {
  const year    = row.year_start ? parseInt(row.year_start, 10) : null
  const refSlug = row.cloudinary_ref  // already "hallmarks/..."

  // Build metadata string
  const metaParts = [
    `collection=${sanitise(row.collection)}`,
    `object_name=${sanitise(row.object_name)}`,
    `mark_type=${sanitise(row.mark_type)}`,
    `image_type=${sanitise(row.image_type)}`,
    `group_id=${sanitise(row.group_id)}`,
  ]
  if (row.year_range) metaParts.push(`year_range=${sanitise(row.year_range)}`)
  if (year)           metaParts.push(`year=${year}`)

  // Build tags
  const tags = [
    year ? String(year) : null,
    year ? getCentury(year) : null,
    slug(row.mark_type) || null,
    slug(row.collection) || null,
    row.image_type || null,
  ].filter(Boolean)

  await cloudinary.uploader.upload(row.filepath, {
    public_id     : refSlug,
    resource_type : 'image',
    overwrite     : false,
    metadata      : metaParts.join('|'),
    tags,
  })
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  if (!process.env.CLOUDINARY_CLOUD_NAME) {
    console.error('Missing CLOUDINARY_CLOUD_NAME — check your .env file')
    process.exit(1)
  }

  // 1. Schema
  await ensureSchema()

  // 2. Load CSV
  const rows = parseCSV(fs.readFileSync(CSV_PATH, 'utf8'))
  console.log(`Loaded ${rows.length} rows from inventory.csv\n`)

  // 3. Pre-fetch existing
  const existing = await fetchExisting()

  // 4. Upload with concurrency pool
  const CONCURRENCY = 5
  const total    = rows.length
  let uploaded   = 0
  let skipped    = 0
  let failed     = 0
  const errors   = []
  let counter    = 0   // tracks n across concurrent workers

  async function processRow(row) {
    const n = ++counter

    if (!row.filepath || !row.cloudinary_ref) {
      console.warn(`  [${n}/${total}] SKIP (incomplete row): ${row.filepath}`)
      skipped++
      return
    }

    if (!fs.existsSync(row.filepath)) {
      const msg = 'Source file not found on disk'
      console.error(`  [${n}/${total}] FAIL: ${row.cloudinary_ref} — ${msg}`)
      errors.push({ ref: row.cloudinary_ref, file: row.filepath, error: msg })
      failed++
      return
    }

    // Skip if already in Cloudinary
    if (existing.has(row.cloudinary_ref)) {
      console.log(`  [${n}/${total}] skip (exists): ${row.cloudinary_ref}`)
      skipped++
      return
    }

    try {
      await uploadRow(row)
      uploaded++
      console.log(`  [${n}/${total}] uploaded: ${row.cloudinary_ref}`)
    } catch (err) {
      const msg = err.error?.message || err.message || String(err)
      const msgLower = msg.toLowerCase()
      if (msgLower.includes('already been uploaded') || msgLower.includes('public id already exists')) {
        console.log(`  [${n}/${total}] skip (exists): ${row.cloudinary_ref}`)
        skipped++
      } else {
        console.error(`  [${n}/${total}] FAIL: ${row.cloudinary_ref} — ${msg}`)
        errors.push({ ref: row.cloudinary_ref, file: row.filepath, error: msg })
        failed++
      }
    }
  }

  // Run rows in batches of CONCURRENCY
  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    await Promise.all(rows.slice(i, i + CONCURRENCY).map(processRow))
  }

  // 5. Summary
  console.log('\n=== Upload complete ===')
  console.log(`  Uploaded : ${uploaded}`)
  console.log(`  Skipped  : ${skipped}  (already in Cloudinary or incomplete row)`)
  console.log(`  Failed   : ${failed}`)

  if (errors.length > 0) {
    const lines = errors.map(e => `${e.ref}\n  file : ${e.file}\n  error: ${e.error}`)
    fs.writeFileSync(ERRORS_PATH, lines.join('\n\n') + '\n', 'utf8')
    console.log(`\n  Errors written to: ${ERRORS_PATH}`)
  }
}

main().catch(err => {
  console.error('\nFatal error:', err.message || err)
  process.exit(1)
})
