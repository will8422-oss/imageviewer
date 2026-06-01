/**
 * update-sponsor-field.js
 * Reads scripts/sponsor-marks.csv (with sponsor_name filled in),
 * ensures the `sponsor` structured metadata field exists in Cloudinary,
 * then batch-updates every asset in each group with sponsor={sponsor_name}.
 *
 * Usage:  node scripts/update-sponsor-field.js
 *
 * Only rows where sponsor_name is non-empty are processed.
 * All images within a group_id share the same sponsor value.
 */

import { v2 as cloudinary } from 'cloudinary'
import fs   from 'fs'
import path from 'path'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'

dotenv.config()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CSV_PATH  = path.join(__dirname, 'sponsor-marks.csv')

cloudinary.config({
  cloud_name : process.env.CLOUDINARY_CLOUD_NAME,
  api_key    : process.env.CLOUDINARY_API_KEY,
  api_secret : process.env.CLOUDINARY_API_SECRET,
})

// ─── CSV parser ───────────────────────────────────────────────────────────────
function parseCSV(content) {
  const lines   = content.trim().split(/\r?\n/)
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

// ─── Ensure `sponsor` field exists in schema ──────────────────────────────────
async function ensureSponsorField() {
  console.log('Checking `sponsor` metadata field…')
  try {
    await cloudinary.api.add_metadata_field({
      external_id : 'sponsor',
      label       : 'Sponsor',
      type        : 'string',
    })
    console.log('  created: sponsor\n')
  } catch (err) {
    const msg = (err.error?.message || err.message || '').toLowerCase()
    if (msg.includes('already exists') || msg.includes('external id')) {
      console.log('  exists: sponsor\n')
    } else {
      throw new Error(`Failed to create sponsor field: ${err.error?.message || err.message}`)
    }
  }
}

// ─── Fetch all hallmarks assets with metadata ─────────────────────────────────
async function fetchAll() {
  console.log('Fetching all assets from Cloudinary…')
  const assets = []
  let nextCursor = undefined
  do {
    const result = await cloudinary.search
      .expression('public_id:hallmarks/*')
      .with_field(['metadata'])
      .max_results(500)
      .next_cursor(nextCursor)
      .execute()
    assets.push(...result.resources)
    nextCursor = result.next_cursor
  } while (nextCursor)
  console.log(`  ${assets.length} assets fetched\n`)
  return assets
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  if (!process.env.CLOUDINARY_CLOUD_NAME) {
    console.error('Missing CLOUDINARY_CLOUD_NAME — check your .env file')
    process.exit(1)
  }

  if (!fs.existsSync(CSV_PATH)) {
    console.error(`CSV not found: ${CSV_PATH}`)
    process.exit(1)
  }

  // 1. Read and validate CSV
  const rows = parseCSV(fs.readFileSync(CSV_PATH, 'utf8'))
  const toUpdate = rows.filter(r => r.sponsor_name && r.sponsor_name.trim())
  const skipped  = rows.length - toUpdate.length

  console.log(`Loaded ${rows.length} rows from sponsor-marks.csv`)
  console.log(`  ${toUpdate.length} with sponsor_name filled in`)
  console.log(`  ${skipped} without sponsor_name (will be skipped)\n`)

  if (toUpdate.length === 0) {
    console.log('Nothing to update.')
    return
  }

  // 2. Ensure schema field
  await ensureSponsorField()

  // 3. Fetch all assets and build group_id → [public_id] map
  const allAssets = await fetchAll()
  const groupMap  = new Map()  // group_id → [public_id, …]
  for (const a of allAssets) {
    const gid = a.metadata?.group_id
    if (!gid) continue
    if (!groupMap.has(gid)) groupMap.set(gid, [])
    groupMap.get(gid).push(a.public_id)
  }

  // 4. Update each group
  let updated = 0
  let failed  = 0

  for (const row of toUpdate) {
    const gid         = row.group_id.trim()
    const sponsorName = row.sponsor_name.trim()
    const publicIds   = groupMap.get(gid)

    if (!publicIds || publicIds.length === 0) {
      console.warn(`  WARN: no assets found for group_id "${gid}" — skipping`)
      failed++
      continue
    }

    // Update each asset in the group
    for (const publicId of publicIds) {
      try {
        await cloudinary.api.update(publicId, {
          metadata: `sponsor=${sponsorName.replace(/[|=]/g, ' ')}`,
        })
        updated++
        console.log(`  updated: ${publicId}  →  sponsor=${sponsorName}`)
      } catch (err) {
        const msg = err.error?.message || err.message || String(err)
        console.error(`  FAIL: ${publicId} — ${msg}`)
        failed++
      }
    }
  }

  // 5. Summary
  console.log('\n=== Update complete ===')
  console.log(`  Assets updated : ${updated}`)
  console.log(`  Failed         : ${failed}`)
}

main().catch(err => {
  console.error('\nFatal error:', err.message || err)
  process.exit(1)
})
