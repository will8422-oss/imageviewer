import { v2 as cloudinary } from 'cloudinary'
import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'
dotenv.config()

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

const IMAGES_FOLDER = process.argv[2]
const CSV_PATH = process.argv[3]

if (!IMAGES_FOLDER || !CSV_PATH) {
  console.error('Usage: node scripts/upload-images.js <images-folder> <metadata.csv>')
  console.error('Example: node scripts/upload-images.js ~/hallmark-images ~/hallmark-images/metadata.csv')
  process.exit(1)
}

// Simple CSV parser (handles basic CSVs without embedded commas in values)
function parseCSV(content) {
  const lines = content.trim().split(/\r?\n/)
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
  return lines.slice(1)
    .filter(l => l.trim())
    .map(line => {
      const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''))
      return Object.fromEntries(headers.map((h, i) => [h, values[i] || '']))
    })
}

// Parse ref from filename: LAO-1785-0042_a.jpg → LAO-1785-0042
function parseRef(filename) {
  const base = path.basename(filename, path.extname(filename))
  return base.replace(/_[a-z]$/, '')
}

function getCentury(year) {
  return `${Math.ceil(year / 100)}th-century`
}

async function upload() {
  // Read CSV
  const csvContent = fs.readFileSync(CSV_PATH, 'utf-8')
  const rows = parseCSV(csvContent)
  const metaMap = {}
  rows.forEach(row => { metaMap[row.ref] = row })
  console.log(`Loaded ${rows.length} records from CSV\n`)

  // Scan images folder
  const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff'])
  const files = fs.readdirSync(IMAGES_FOLDER)
    .filter(f => IMAGE_EXTS.has(path.extname(f).toLowerCase()))
    .sort()

  console.log(`Found ${files.length} image files in ${IMAGES_FOLDER}\n`)

  let uploaded = 0
  let skipped = 0
  const failures = []

  for (let i = 0; i < files.length; i++) {
    const filename = files[i]
    const ref = parseRef(filename)
    const meta = metaMap[ref]

    if (!meta) {
      console.warn(`  SKIP [no CSV row]: ${filename}`)
      skipped++
      continue
    }

    const baseName = path.basename(filename, path.extname(filename))
    const publicId = `hallmarks/${baseName}`
    const year = Number(meta.year)
    const tags = [
      meta.year,
      year ? getCentury(year) : null,
      meta.fineness,
      meta.assay_office,
    ].filter(Boolean)

    try {
      await cloudinary.uploader.upload(path.join(IMAGES_FOLDER, filename), {
        public_id: publicId,
        metadata: [
          `ref=${meta.ref}`,
          `year=${meta.year}`,
          meta.fineness    ? `fineness=${meta.fineness}` : null,
          meta.maker       ? `maker=${meta.maker}` : null,
          meta.collection  ? `collection=${meta.collection}` : null,
          meta.assay_office? `assay_office=${meta.assay_office}` : null,
          `group_id=${ref}`,
          meta.notes       ? `notes=${meta.notes}` : null,
        ].filter(Boolean).join('|'),
        tags,
        overwrite: false,
        resource_type: 'image',
      })

      uploaded++
      const total = uploaded + skipped + failures.length
      console.log(`  [${total}/${files.length}] Uploaded: ${filename}`)
    } catch (err) {
      const msg = err.error?.message || err.message || String(err)
      // Already exists = treat as success
      if (msg.toLowerCase().includes('already exists') || msg.includes('already been uploaded')) {
        uploaded++
        console.log(`  [${uploaded + skipped + failures.length}/${files.length}] Already uploaded: ${filename}`)
      } else {
        failures.push({ filename, error: msg })
        console.error(`  FAILED: ${filename} — ${msg}`)
      }
    }
  }

  // Summary
  console.log('\n=== Upload Summary ===')
  console.log(`  Uploaded : ${uploaded}`)
  console.log(`  Skipped  : ${skipped}  (no matching CSV row)`)
  console.log(`  Failed   : ${failures.length}`)

  if (failures.length > 0) {
    console.log('\nFailures:')
    failures.forEach(f => console.log(`  ${f.filename}: ${f.error}`))
  }

  if (skipped > 0) {
    console.log('\nSkipped files had no matching CSV row. Add them to metadata.csv and re-run.')
  }

  // Verify first 5
  if (uploaded > 0) {
    console.log('\n=== Verifying first 5 assets ===')
    try {
      const result = await cloudinary.api.resources({
        type: 'upload',
        prefix: 'hallmarks/',
        max_results: 5,
        metadata: true,
      })
      for (const r of result.resources) {
        console.log(`  ${r.public_id}`)
        console.log(`    metadata: ${JSON.stringify(r.metadata || {})}`)
      }
    } catch (err) {
      console.warn('  Could not verify (non-fatal):', err.message)
    }
  }
}

upload().catch(err => {
  console.error('\nUpload failed:', err.message || err)
  process.exit(1)
})
