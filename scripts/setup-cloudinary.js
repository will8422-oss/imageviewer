import { v2 as cloudinary } from 'cloudinary'
import dotenv from 'dotenv'
dotenv.config()

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

async function setup() {
  console.log('Setting up Cloudinary for Hallmark Archive…\n')

  // 1. Create hallmarks folder
  try {
    await cloudinary.api.create_folder('hallmarks')
    console.log('✓ Created folder: hallmarks')
  } catch (err) {
    const msg = err.error?.message || err.message || ''
    if (msg.toLowerCase().includes('already exists')) {
      console.log('✓ Folder already exists: hallmarks')
    } else {
      throw err
    }
  }

  // 2. Create structured metadata fields
  const fields = [
    { external_id: 'ref',          label: 'Reference',   type: 'string',  mandatory: true },
    { external_id: 'year',         label: 'Year',         type: 'integer', mandatory: true },
    {
      external_id: 'fineness',
      label: 'Fineness',
      type: 'enum',
      enum_values: ['Sterling', 'Britannia', '22ct', '18ct', '15ct', '14ct', '12ct', '9ct'],
    },
    { external_id: 'maker',        label: 'Maker',        type: 'string' },
    { external_id: 'collection',   label: 'Collection',   type: 'string' },
    {
      external_id: 'assay_office',
      label: 'Assay Office',
      type: 'enum',
      enum_values: ['London', 'Birmingham', 'Sheffield', 'Edinburgh', 'Chester', 'Exeter', 'Newcastle'],
    },
    { external_id: 'group_id',     label: 'Group ID',     type: 'string' },
    { external_id: 'notes',        label: 'Notes',        type: 'string' },
  ]

  console.log('\nCreating metadata fields…')
  for (const field of fields) {
    try {
      await cloudinary.api.add_metadata_field(field)
      console.log(`  ✓ Created: ${field.external_id} (${field.type})`)
    } catch (err) {
      const msg = err.error?.message || err.message || ''
      if (msg.toLowerCase().includes('already exists')) {
        console.log(`  ✓ Exists:  ${field.external_id}`)
      } else {
        console.error(`  ✗ Failed:  ${field.external_id} — ${msg}`)
      }
    }
  }

  // 3. Verify
  const result = await cloudinary.api.list_metadata_fields()
  const ours = result.metadata_fields.filter(f =>
    fields.map(x => x.external_id).includes(f.external_id)
  )

  console.log(`\n✓ Schema verified — ${ours.length}/${fields.length} fields present:`)
  ours.forEach(f => console.log(`    ${f.external_id}: ${f.type}`))

  console.log('\nSetup complete. You can now run the upload script.')
}

setup().catch(err => {
  console.error('\nSetup failed:', err.message || err)
  process.exit(1)
})
