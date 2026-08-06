import crypto from 'crypto'

// Signs an unsubscribe link so nobody can unsubscribe an email address
// they don't own just by guessing a URL. Uses the service role key as the
// signing secret — it's already a strong, private secret only the server
// ever sees, so there's no need for a separate one.
const SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY || 'fallback-secret-should-never-be-used'

export function generateUnsubscribeToken(email: string): string {
  return crypto
    .createHmac('sha256', SECRET)
    .update(email.trim().toLowerCase())
    .digest('hex')
}

export function verifyUnsubscribeToken(email: string, token: string): boolean {
  const expected = generateUnsubscribeToken(email)
  // Constant-time comparison to avoid timing attacks.
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token))
  } catch {
    return false
  }
}

export function buildUnsubscribeUrl(email: string): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || ''
  const token = generateUnsubscribeToken(email)
  return `${siteUrl}/unsubscribe?email=${encodeURIComponent(email)}&token=${token}`
}
