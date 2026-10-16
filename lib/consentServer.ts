import type { NextRequest } from 'next/server'

// True only if this request came from a browser whose visitor clicked
// "Accept" on the cookie banner. Used to decide whether advertising events
// may be sent to Meta.
export function hasAdConsent(req: NextRequest): boolean {
  return req.cookies.get('pc_ads_consent')?.value === 'granted'
}
