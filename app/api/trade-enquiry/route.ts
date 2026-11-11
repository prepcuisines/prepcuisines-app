import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/send-email'

export const dynamic = 'force-dynamic'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

// Trade enquiry from the public /trade page. Saved, then emailed to the shop inbox.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  if (body.website) return NextResponse.json({ success: true }) // honeypot: bots fill this in

  const business = clean(body.business, 120)
  const contact = clean(body.contact, 120)
  const email = clean(body.email, 160)
  const phone = clean(body.phone, 40)
  const address = clean(body.address, 300)
  const notes = clean(body.notes, 1500)
  if (!business || !contact || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return NextResponse.json({ error: 'Please add your business name, your name and a valid email.' }, { status: 400 })

  const items = (Array.isArray(body.items) ? body.items : [])
    .map((i: any) => ({ name: clean(i?.name, 160), qty: Math.floor(Number(i?.qty)) }))
    .filter((i: { name: string; qty: number }) => i.name && i.qty > 0 && i.qty <= 100000)
    .slice(0, 60)

  const { error } = await supabase
    .from('trade_enquiries')
    .insert({ business_name: business, contact_name: contact, email, phone, delivery_address: address, items, notes })
  if (error) return NextResponse.json({ error: 'Could not send your enquiry, please try again.' }, { status: 500 })

  const to = process.env.ADMIN_NOTIFICATION_EMAIL || 'info@prepcuisines.co.uk'
  const rows = items.map((i: { name: string; qty: number }) => `<li>${i.qty} × ${esc(i.name)}</li>`).join('')
  await sendEmail(
    to,
    `New trade enquiry: ${business}`,
    `<div style="font-family:sans-serif;color:#1a2e1a;max-width:560px">
      <h2 style="font-family:Georgia,serif">New trade enquiry</h2>
      <p><strong>${esc(business)}</strong><br>${esc(contact)}<br>${esc(email)}${phone ? `<br>${esc(phone)}` : ''}</p>
      ${address ? `<p><strong>Delivery address</strong><br>${esc(address)}</p>` : ''}
      <p><strong>Starting order</strong></p>${rows ? `<ul>${rows}</ul>` : '<p>No items picked.</p>'}
      ${notes ? `<p><strong>Notes</strong><br>${esc(notes).replace(/\n/g, '<br>')}</p>` : ''}
      <p style="color:#777;font-size:13px">Reply to this customer directly at ${esc(email)}.</p>
    </div>`
  )
  return NextResponse.json({ success: true })
}
