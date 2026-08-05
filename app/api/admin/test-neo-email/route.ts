import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'

function isAuthorized(req: NextRequest) {
  const session = req.cookies.get('pc_admin_session')?.value
  return !!session && session === process.env.ADMIN_SESSION_SECRET
}

// Standalone test route that talks to Neo directly (not via the shared
// helper's silent-fallback-to-Resend behaviour) so a failure here means
// something real about the Neo connection, not just "it fell back fine".
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const { to } = await req.json()
  if (!to) {
    return NextResponse.json({ error: 'Missing "to" address' }, { status: 400 })
  }

  if (!process.env.NEO_EMAIL || !process.env.NEO_EMAIL_PASSWORD) {
    return NextResponse.json(
      { error: 'NEO_EMAIL or NEO_EMAIL_PASSWORD is not set in the environment' },
      { status: 400 }
    )
  }

  const transporter = nodemailer.createTransport({
    host: 'smtp0001.neo.space',
    port: 465,
    secure: true,
    auth: {
      user: process.env.NEO_EMAIL,
      pass: process.env.NEO_EMAIL_PASSWORD,
    },
  })

  try {
    await transporter.sendMail({
      from: process.env.NEO_EMAIL,
      to,
      subject: 'Test email from prepcuisines admin',
      html: '<p>If you\'re reading this, sending through Neo\'s SMTP servers is working correctly.</p>',
    })
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Send failed' }, { status: 500 })
  }
}
