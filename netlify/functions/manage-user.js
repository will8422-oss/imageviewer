/**
 * manage-user.js — Netlify serverless function
 * Admin-only user management: approve, reject, change_role, suspend, reinstate.
 * Validates admin JWT before any operation. Uses service role key to bypass RLS.
 *
 * Body: { action, target_user_id, role? }
 * Actions: approve | reject | change_role | suspend | reinstate
 */

import { createClient } from '@supabase/supabase-js'

// Anon client — validates the caller's JWT
const anonClient = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)

// Admin client — bypasses RLS for profile updates
const adminClient = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const HEADERS = { 'Content-Type': 'application/json' }
const json    = (status, body) => ({ statusCode: status, headers: HEADERS, body: JSON.stringify(body) })

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' })

  // ── Validate caller JWT ──────────────────────────────────────────────────────
  const token = (event.headers['authorization'] || '').replace('Bearer ', '').trim()
  if (!token) return json(401, { error: 'Unauthorized' })

  const { data: { user }, error: authErr } = await anonClient.auth.getUser(token)
  if (authErr || !user) return json(401, { error: 'Unauthorized' })

  // ── Confirm caller is admin ──────────────────────────────────────────────────
  const { data: callerProfile } = await adminClient
    .from('profiles').select('role').eq('id', user.id).single()
  if (callerProfile?.role !== 'admin') return json(403, { error: 'Forbidden' })

  // ── Parse body ───────────────────────────────────────────────────────────────
  const { action, target_user_id, role } = JSON.parse(event.body || '{}')
  if (!action || !target_user_id) return json(400, { error: 'Missing action or target_user_id' })

  // ── Build update ─────────────────────────────────────────────────────────────
  let updates
  switch (action) {
    case 'approve':
      if (!['viewer', 'researcher'].includes(role)) return json(400, { error: 'Invalid role for approve' })
      updates = { role, approved_at: new Date().toISOString(), approved_by: user.id }
      break
    case 'reject':
      updates = { role: 'rejected', approved_at: null, approved_by: null }
      break
    case 'change_role':
      if (!['viewer', 'researcher', 'admin'].includes(role)) return json(400, { error: 'Invalid role' })
      updates = { role }
      break
    case 'suspend':
      updates = { role: 'pending', approved_at: null, approved_by: null }
      break
    case 'reinstate':
      updates = { role: 'pending', approved_at: null, approved_by: null }
      break
    default:
      return json(400, { error: 'Unknown action' })
  }

  // ── Apply update ─────────────────────────────────────────────────────────────
  const { data: updated, error: updateErr } = await adminClient
    .from('profiles').update(updates).eq('id', target_user_id).select().single()
  if (updateErr) return json(500, { error: updateErr.message })

  // ── Email notification ───────────────────────────────────────────────────────
  if (action === 'approve' || action === 'reject') {
    await sendNotificationEmail(action, updated.email, role).catch(err =>
      console.error('[email] Failed:', err.message)
    )
  }

  return json(200, { profile: updated })
}

// ── Email helper ──────────────────────────────────────────────────────────────
// Supabase JS SDK does not expose sendRawEmail() on the admin client.
// Wire this up to a transactional email provider (Resend, SendGrid, etc.).
// The subject/body strings are ready to use.
async function sendNotificationEmail(action, email, role) {
  const isApproval = action === 'approve'

  const subject = isApproval
    ? 'Your Hallmark Archive access has been approved'
    : 'Hallmark Archive — access request'

  const body = isApproval
    ? `Your access to the Hallmark Reference Archive has been approved (role: ${role}).\n\nVisit the archive at https://hallmark-archive-lao.netlify.app\n\nLondon Assay Office`
    : `Thank you for your interest in the Hallmark Reference Archive.\n\nUnfortunately your access request was not approved at this time. For further information please contact the London Assay Office.\n\nLondon Assay Office`

  // TODO: replace with email provider, e.g.:
  // await resend.emails.send({ from: 'noreply@assayofficelondon.co.uk', to: email, subject, text: body })
  console.log(`[email] TO:${email} | SUBJECT:${subject}`)
  console.log(`[email] BODY:${body}`)
}
