import { NextRequest, NextResponse } from 'next/server'

// A deliberately simple gate for an internal, single-admin tool — not a
// full user system. Requires ADMIN_PASSWORD and ADMIN_SESSION_SECRET in
// .env.local. The session secret is just an opaque token stored in a
// cookie once the correct password is entered; anyone holding that
// cookie value is treated as the admin.
export async function POST(req: NextRequest) {
  const { password } = await req.json()

  if (!process.env.ADMIN_PASSWORD || !process.env.ADMIN_SESSION_SECRET) {
    return NextResponse.json(
      { error: 'Admin login is not configured on the server yet.' },
      { status: 500 }
    )
  }

  if (password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Incorrect password' }, { status: 401 })
  }

  const res = NextResponse.json({ success: true })
  res.cookies.set('pc_admin_session', process.env.ADMIN_SESSION_SECRET, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60, // 1 hour — auto-logs out after this and requires the password again
  })
  return res
}
