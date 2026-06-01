/**
 * search-images.js — Netlify serverless function
 * Proxies the Cloudinary Search API, keeping credentials server-side.
 * Requires a valid Supabase JWT in the Authorization header.
 * Paginates automatically and returns the full asset list.
 *
 * Query params:
 *   show_dimensions=true  — include image_type:dimensions assets (default: false)
 */

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)

export const handler = async (event) => {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const authHeader = event.headers['authorization'] || ''
  const token      = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!token) {
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Unauthorized' }),
    }
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) {
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Unauthorized' }),
    }
  }

  // ── Cloudinary ──────────────────────────────────────────────────────────────
  const cloudName = process.env.VITE_CLOUDINARY_CLOUD_NAME
  const apiKey    = process.env.VITE_CLOUDINARY_API_KEY
  const apiSecret = process.env.VITE_CLOUDINARY_API_SECRET

  if (!cloudName || !apiKey || !apiSecret) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Missing Cloudinary credentials in environment' }),
    }
  }

  const params         = event.queryStringParameters || {}
  const showDimensions = params.show_dimensions === 'true'

  const expression = showDimensions
    ? 'public_id:hallmarks/*'
    : 'public_id:hallmarks/* AND NOT metadata.image_type:dimensions'

  const credentials  = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')
  const allResources = []
  let nextCursor     = null

  try {
    do {
      const body = {
        expression,
        with_field  : ['metadata', 'tags'],
        max_results : 500,
        sort_by     : [{ public_id: 'asc' }],
      }
      if (nextCursor) body.next_cursor = nextCursor

      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/resources/search`,
        {
          method  : 'POST',
          headers : {
            Authorization : `Basic ${credentials}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        }
      )

      if (!response.ok) {
        const text = await response.text()
        return {
          statusCode: response.status,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: `Cloudinary error ${response.status}: ${text}` }),
        }
      }

      const data = await response.json()
      allResources.push(...(data.resources || []))
      nextCursor = data.next_cursor || null
    } while (nextCursor)

    // Belt-and-suspenders: filter client-side too
    const resources = showDimensions
      ? allResources
      : allResources.filter(r => r.metadata?.image_type !== 'dimensions')

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resources }),
    }
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message }),
    }
  }
}
