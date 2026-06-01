/**
 * export-sponsor-marks.js
 * Fetches all Cloudinary assets in hallmarks/ where mark_type contains "sponsor",
 * deduplicates by group_id, and writes scripts/sponsor-marks.csv with a blank
 * sponsor_name column ready for manual completion.
 *
 * Usage:  node scripts/export-sponsor-marks.js
 */

import { v2 as cloudinary } from 'cloudinary'
import fs   from 'fs'
import path from 'path'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'

dotenv.config()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_CSV   = path.join(__dirname, 'sponsor-marks.csv')

cloudinary.config({
  cloud_name : process.env.CLOUDINARY_CLOUD_NAME,
  api_key    : process.env.CLOUDINARY_API_KEY,
  api_secret : process.env.CLOUDINARY_API_SECRET,
})

// ─── Fetch all hallmarks assets with metadata ────────────────────────────────
async function fetchAll() {
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
  return assets
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  if (!process.env.CLOUDINARY_CLOUD_NAME) {
    console.error('Missing CLOUDINARY_CLOUD_NAME — check your .env file')
    process.exit(1)
  }

  console.log('Fetching assets from Cloudinary…')
  const assets = await fetchAll()
  console.log(`  ${assets.length} total assets`)

  // Filter for any mark_type containing "sponsor"
  const sponsorAssets = assets.filter(a =>
    (a.metadata?.mark_type || '').toLowerCase().includes('sponsor')
  )
  console.log(`  ${sponsorAssets.length} assets with sponsor-type mark`)

  // Deduplicate by group_id — keep first encountered asset per group
  const seen = new Map()
  for (const a of sponsorAssets) {
    const gid = a.metadata?.group_id || a.public_id
    if (!seen.has(gid)) {
      seen.set(gid, {
        group_id    : gid,
        object_name : a.metadata?.object_name || '',
        mark_type   : a.metadata?.mark_type   || '',
        year_range  : a.metadata?.year_range  || '',
      })
    }
  }

  const groups = [...seen.values()].sort((a, b) => a.group_id.localeCompare(b.group_id))
  console.log(`  ${groups.length} unique groups\n`)

  // Write CSV
  const csvEsc = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`
  const header = 'group_id,object_name,mark_type,year_range,sponsor_name'
  const rows   = groups.map(g =>
    [csvEsc(g.group_id), csvEsc(g.object_name), csvEsc(g.mark_type), csvEsc(g.year_range), ''].join(',')
  )

  fs.writeFileSync(OUT_CSV, [header, ...rows].join('\n') + '\n', 'utf8')
  console.log(`Written: ${OUT_CSV}`)
  console.log(`  ${groups.length} rows (sponsor_name column left blank for manual fill)`)
}

main().catch(err => {
  console.error('Fatal:', err.message || err)
  process.exit(1)
})
