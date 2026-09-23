import type { NextRequest } from 'next/server'

export function isAdminRequest(req: NextRequest) {
  const session = req.cookies.get('pc_admin_session')?.value
  return !!session && session === process.env.ADMIN_SESSION_SECRET
}
