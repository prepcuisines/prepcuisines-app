import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/send-email'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export const STOKE_POSTCODE = /^ST\d{1,2}\s?\d[A-Z]{2}$/i

export const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
export const gbp = (n: number) => `£${Number(n).toFixed(2)}`

type OrderRow = {
  id: string
  order_number: number
  full_name: string
  email: string
  phone: string
  house: string
  street: string | null
  postcode: string
  notes: string | null
  items: { qty: number; name: string; price: number }[]
  subtotal: number
  delivery_fee: number
  total: number
  is_new_customer: boolean
}

// Marks a pending extras order paid once Stripe says so, and sends the two
// emails exactly once (the update only matches while status is still
// 'pending'). Safe to call repeatedly: from the thank-you page and from the
// admin Extras tab's check.
export async function finalizeExtrasSession(sessionId: string): Promise<'paid' | 'unpaid' | 'unknown'> {
  const { data: order } = await supabase.from('extras_orders').select('*').eq('stripe_session_id', sessionId).maybeSingle()
  if (!order) return 'unknown'
  if (order.status === 'paid') return 'paid'

  const session = await stripe.checkout.sessions.retrieve(sessionId)
  if (session.payment_status === 'paid') {
    const { data: updated } = await supabase
      .from('extras_orders')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('id', order.id)
      .in('status', ['pending', 'expired'])
      .select('*')
      .maybeSingle()
    if (updated) await sendExtrasEmails(updated as OrderRow)
    return 'paid'
  }
  if (session.status === 'expired') {
    await supabase.from('extras_orders').update({ status: 'expired' }).eq('id', order.id).eq('status', 'pending')
  }
  return 'unpaid'
}

async function sendExtrasEmails(o: OrderRow) {
  const lines = o.items.map((i) => `<li>${i.qty} × ${esc(i.name)}</li>`).join('')
  const address = [o.house, o.street, o.postcode].filter((x): x is string => !!x).map(esc).join(', ')
  const customerHtml = `<div style="font-family:Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;color:#1a2e1a;line-height:1.6">
    <h2 style="font-family:Georgia,serif;font-weight:400">Thank you ${esc(o.full_name.split(' ')[0])}, you're all set</h2>
    <p>We've got your extra meals order <strong>#E${o.order_number}</strong> and your payment has gone through.</p>
    <ul>${lines}</ul>
    <p>Delivery: ${gbp(o.delivery_fee)}<br/><strong>Total paid: ${gbp(o.total)}</strong></p>
    <p>Delivering to: ${address}</p>
    <p>We'll deliver these to you in Stoke-on-Trent shortly. Your reheating instructions, macros and use-by date are on every label. Meals are freezer safe for up to 1 month.</p>
    <p>Bukr<br/>prepcuisines</p></div>`
  await sendEmail(o.email, `Your prepcuisines extras order #E${o.order_number}`, customerHtml)

  const to = process.env.ADMIN_NOTIFICATION_EMAIL || 'info@prepcuisines.co.uk'
  const adminHtml = `<div style="font-family:Helvetica,Arial,sans-serif">
    <h3>New extras order #E${o.order_number} (${o.is_new_customer ? 'NEW customer' : 'returning customer'})</h3>
    <ul>${lines}</ul>
    <p>Total paid ${gbp(o.total)}</p>
    <p>${esc(o.full_name)}<br/>${address}<br/>${esc(o.phone)}<br/>${esc(o.email)}</p>
    ${o.notes ? `<p>Note: ${esc(o.notes)}</p>` : ''}</div>`
  await sendEmail(to, `Extras order #E${o.order_number}: ${o.is_new_customer ? 'new' : 'returning'} customer, ${gbp(o.total)}`, adminHtml)
}
