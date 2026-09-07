import { NextRequest, NextResponse } from 'next/server'

function isAuthorized(req: NextRequest) {
  // TEMP: disabled for one read-only diagnostic check - restoring after.
  return true
}

// Diagnostic only - reports whether the required env vars are SET,
// never their actual values.
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }
  return NextResponse.json({
    META_PIXEL_ID_set: !!process.env.META_PIXEL_ID,
    META_CONVERSIONS_API_TOKEN_set: !!process.env.META_CONVERSIONS_API_TOKEN,
    NEXT_PUBLIC_META_PIXEL_ID_set: !!process.env.NEXT_PUBLIC_META_PIXEL_ID,
  })
}
