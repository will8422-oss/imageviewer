/**
 * normalise-mark-types.js
 * Renames mark_type metadata values across the Cloudinary hallmarks collection
 * to correct heraldic and technical terminology.
 * Also adds mark_type_2 for assets that carried two marks in a compound value.
 *
 * Usage:  node scripts/normalise-mark-types.js
 *
 * Dry-run (reports changes without writing to Cloudinary):
 *         node scripts/normalise-mark-types.js --dry-run
 */

import { v2 as cloudinary } from 'cloudinary'
import fs   from 'fs'
import path from 'path'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'

dotenv.config()

const __dirname  = path.dirname(fileURLToPath(import.meta.url))
const LOG_CSV    = path.join(__dirname, 'normalisation-log.csv')
const NULL_YEAR_LOG = path.join(__dirname, 'normalisation-null-year.txt')
const DRY_RUN    = process.argv.includes('--dry-run')
const BATCH_SIZE = 50
const BATCH_DELAY_MS = 500

cloudinary.config({
  cloud_name : process.env.CLOUDINARY_CLOUD_NAME,
  api_key    : process.env.CLOUDINARY_API_KEY,
  api_secret : process.env.CLOUDINARY_API_SECRET,
})

// ─── Transformation rules ─────────────────────────────────────────────────────
function transform(markType, year) {
  switch (markType) {
    // Year-dependent
    case 'hallmark': {
      const y = year != null ? Number(year) : null
      const newType = (y === null || y <= 1821) ? "leopard's head crowned" : "leopard's head"
      return { mark_type: newType, mark_type_2: null, nullYear: y === null }
    }

    // Simple renames
    case 'sterling mark':
      return { mark_type: 'lion passant', mark_type_2: null, nullYear: false }
    case 'standard mark':
      return { mark_type: 'lion passant', mark_type_2: null, nullYear: false }
    case 'britannia standard mark':
      return { mark_type: 'britannia', mark_type_2: null, nullYear: false }
    case 'britannia hallmark':
      return { mark_type: 'britannia', mark_type_2: null, nullYear: false }
    case 'britannia mark':
      return { mark_type: 'britannia', mark_type_2: null, nullYear: false }

    // Compound → two fields
    case 'sterling sponsor mark':
      return { mark_type: 'lion passant', mark_type_2: 'sponsor mark', nullYear: false }
    case 'duty and sterling marks':
      return { mark_type: 'duty mark', mark_type_2: 'lion passant', nullYear: false }
    case 'date letter and duty mark':
      return { mark_type: 'date letter', mark_type_2: 'duty mark', nullYear: false }

    // No change
    default:
      return null
  }
}

// ─── Ensure mark_type_2 schema field exists ───────────────────────────────────
async function ensureMarkType2Field() {
  console.log('Checking mark_type_2 metadata field…')
  try {
    await cloudinary.api.add_metadata_field({
      external_id : 'mark_type_2',
      label       : 'Mark type 2',
      type        : 'string',
    })
    console.log('  created: mark_type_2\n')
  } catch (err) {
    const msg = (err.error?.message || err.message || '').toLowerCase()
    if (msg.includes('already exists') || msg.includes('external id')) {
      console.log('  exists: mark_type_2\n')
    } else {
      throw new Error(`Failed to create mark_type_2 field: ${err.error?.message || err.message}`)
    }
  }
}

// ─── Fetch all assets ─────────────────────────────────────────────────────────
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

// ─── Sleep helper ─────────────────────────────────────────────────────────────
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

// ─── CSV helper ───────────────────────────────────────────────────────────────
const csvEsc = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  if (!process.env.CLOUDINARY_CLOUD_NAME) {
    console.error('Missing CLOUDINARY_CLOUD_NAME — check your .env file')
    process.exit(1)
  }

  if (DRY_RUN) {
    console.log('=== DRY RUN — no changes will be written ===\n')
  }

  // 1. Ensure mark_type_2 field exists (skip in dry-run)
  if (!DRY_RUN) {
    await ensureMarkType2Field()
  }

  // 2. Fetch all assets
  const assets = await fetchAll()

  // 3. Build work list
  const toUpdate  = []  // { asset, newMarkType, newMarkType2, nullYear }
  const nullYears = []  // hallmark assets with no year value

  for (const asset of assets) {
    const oldType = asset.metadata?.mark_type || ''
    const year    = asset.metadata?.year ?? null
    const result  = transform(oldType, year)

    if (!result) continue  // no change

    if (result.mark_type === oldType && !result.mark_type_2) continue  // truly no change

    toUpdate.push({
      asset,
      oldMarkType  : oldType,
      newMarkType  : result.mark_type,
      newMarkType2 : result.mark_type_2,
      nullYear     : result.nullYear,
    })

    if (result.nullYear) nullYears.push(asset)
  }

  console.log(`Assets requiring update: ${toUpdate.length}`)
  if (nullYears.length) {
    console.log(`  ⚠  ${nullYears.length} hallmark asset(s) have null year → assigned "leopard's head crowned" (flagged for manual review)`)
  }
  console.log()

  if (toUpdate.length === 0) {
    console.log('Nothing to update.')
    return
  }

  // 4. Process in batches
  const csvRows     = []
  let updatedCount  = 0
  let failedCount   = 0

  for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
    const batch = toUpdate.slice(i, i + BATCH_SIZE)

    for (const item of batch) {
      const { asset, oldMarkType, newMarkType, newMarkType2 } = item
      const publicId = asset.public_id
      const groupId  = asset.metadata?.group_id || ''

      // Build metadata string — pipe-delimited for multiple fields
      const parts = [`mark_type=${newMarkType}`]
      if (newMarkType2) parts.push(`mark_type_2=${newMarkType2}`)
      const metaString = parts.join('|')

      const logLine = `Updated [${updatedCount + 1}/${toUpdate.length}]: ${publicId}  "${oldMarkType}" → "${newMarkType}"${newMarkType2 ? ` + mark_type_2="${newMarkType2}"` : ''}`

      if (DRY_RUN) {
        console.log(`  [dry] ${logLine}`)
        csvRows.push([
          csvEsc(publicId),
          csvEsc(groupId),
          csvEsc(oldMarkType),
          csvEsc(newMarkType),
          csvEsc(newMarkType2 || ''),
        ].join(','))
        updatedCount++
      } else {
        try {
          await cloudinary.api.update(publicId, { metadata: metaString })
          console.log(`  ${logLine}`)
          csvRows.push([
            csvEsc(publicId),
            csvEsc(groupId),
            csvEsc(oldMarkType),
            csvEsc(newMarkType),
            csvEsc(newMarkType2 || ''),
          ].join(','))
          updatedCount++
        } catch (err) {
          const msg = err.error?.message || err.message || String(err)
          console.error(`  FAIL: ${publicId} — ${msg}`)
          csvRows.push([
            csvEsc(publicId),
            csvEsc(groupId),
            csvEsc(oldMarkType),
            csvEsc('ERROR: ' + msg),
            csvEsc(''),
          ].join(','))
          failedCount++
        }
      }
    }

    // Pause between batches (not after the last one)
    if (!DRY_RUN && i + BATCH_SIZE < toUpdate.length) {
      await sleep(BATCH_DELAY_MS)
    }
  }

  // 5. Write CSV log
  const csvHeader = 'public_id,group_id,old_mark_type,new_mark_type,mark_type_2'
  fs.writeFileSync(LOG_CSV, [csvHeader, ...csvRows].join('\n') + '\n', 'utf8')
  console.log(`\nLog written: ${LOG_CSV}  (${csvRows.length} rows)`)

  // 6. Write null-year flag file
  if (nullYears.length) {
    const lines = [
      `Hallmark assets with null year — assigned "leopard's head crowned" by default.`,
      `Review these manually and correct if the year can be determined.\n`,
      ...nullYears.map(a =>
        `  ${a.public_id}  group_id=${a.metadata?.group_id || ''}  year_range=${a.metadata?.year_range || ''}`
      ),
    ]
    fs.writeFileSync(NULL_YEAR_LOG, lines.join('\n') + '\n', 'utf8')
    console.log(`Null-year flag file: ${NULL_YEAR_LOG}  (${nullYears.length} assets)`)
  }

  // 7. Summary
  console.log('\n=== Normalisation complete ===')
  console.log(`  Updated : ${updatedCount}`)
  console.log(`  Failed  : ${failedCount}`)
  if (DRY_RUN) console.log('  (dry run — no changes written to Cloudinary)')
}

main().catch(err => {
  console.error('\nFatal error:', err.message || err)
  process.exit(1)
})
