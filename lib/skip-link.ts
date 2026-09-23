import crypto from 'crypto'

// Signed one-tap "skip this week" links for subscriber reminder emails, so
// nobody can skip someone else's order by guessing a URL. Same signing
// secret approach as the unsubscribe links.
const SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY || 'fallback-secret-should-never-be-used'

export function skipToken(customerId: string, windowId: string) {
  return crypto.createHmac('sha256', SECRET).update(`skip:${customerId}:${windowId}`).digest('hex')
}

export function verifySkipToken(customerId: string, windowId: string, token: string) {
  try {
    return crypto.timingSafeEqual(Buffer.from(skipToken(customerId, windowId)), Buffer.from(token))
  } catch {
    return false
  }
}

export function buildSkipUrl(customerId: string, windowId: string) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || ''
  return `${siteUrl}/skip-week?c=${customerId}&w=${windowId}&t=${skipToken(customerId, windowId)}`
}
