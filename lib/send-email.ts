// Small helper for sending transactional emails via Resend.
// Requires RESEND_API_KEY in .env.local — sign up at resend.com to get one.
// Uses their test/shared sending domain until you verify your own.

import nodemailer from 'nodemailer'

const RESEND_API_KEY = process.env.RESEND_API_KEY!
const FROM_ADDRESS = process.env.RESEND_FROM_ADDRESS || 'prepcuisines <onboarding@resend.dev>'
const ADMIN_EMAIL = process.env.ADMIN_NOTIFICATION_EMAIL || ''

async function sendEmail(to: string, subject: string, html: string) {
  if (!RESEND_API_KEY) {
    console.error('RESEND_API_KEY is not set — skipping email send:', subject, 'to', to)
    return
  }
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to,
        subject,
        html,
      }),
    })
  } catch (err) {
    console.error('Email send failed:', err)
  }
}

// Sends via Neo's own mail servers instead of Resend, using the mailbox
// credentials in NEO_EMAIL / NEO_EMAIL_PASSWORD. Used specifically for
// order confirmations, per request — everything else still goes through
// Resend. Note: Neo can block sending from IPs it doesn't recognise, and
// serverless platforms like Vercel don't use one fixed outbound IP by
// default, so if this starts silently failing, that's the first thing to
// check with Neo's support (hello@neo.space).
let neoTransporter: nodemailer.Transporter | null = null
function getNeoTransporter() {
  if (!process.env.NEO_EMAIL || !process.env.NEO_EMAIL_PASSWORD) return null
  if (!neoTransporter) {
    neoTransporter = nodemailer.createTransport({
      host: 'smtp0001.neo.space',
      port: 465,
      secure: true,
      auth: {
        user: process.env.NEO_EMAIL,
        pass: process.env.NEO_EMAIL_PASSWORD,
      },
    })
  }
  return neoTransporter
}

async function sendEmailViaNeo(to: string, subject: string, html: string) {
  const transporter = getNeoTransporter()
  if (!transporter) {
    console.error(
      'NEO_EMAIL or NEO_EMAIL_PASSWORD is not set — falling back to Resend for:',
      subject,
      'to',
      to
    )
    await sendEmail(to, subject, html)
    return
  }
  try {
    await transporter.sendMail({
      from: process.env.NEO_EMAIL,
      to,
      subject,
      html,
    })
  } catch (err) {
    console.error('Neo email send failed, falling back to Resend:', err)
    await sendEmail(to, subject, html)
  }
}

export async function sendPaymentFailedEmailToCustomer(
  toEmail: string,
  firstName: string,
  amount: number
) {
  await sendEmail(
    toEmail,
    "There was a problem with your prepcuisines payment",
    `
      <p>Hi ${firstName},</p>
      <p>We tried to charge your saved card for £${amount.toFixed(2)} and it didn't go through.</p>
      <p>No box has been charged or prepared for this delivery yet. Please update your
      payment details as soon as you can so we don't miss your next delivery:</p>
      <p><a href="${process.env.NEXT_PUBLIC_SITE_URL}/update-payment-method">Update your payment method</a></p>
      <p>Thanks,<br/>prepcuisines</p>
    `
  )
}

type OrderConfirmationItem = { name: string; price: number; qty: number }

function orderTypeLabel(orderType: string, isSubscribed: boolean) {
  if (orderType === 'payg_order') return 'Pay As You Go order'
  if (isSubscribed) return 'Subscription order'
  return 'Order'
}

export async function sendOrderConfirmationEmailToCustomer(
  toEmail: string,
  firstName: string,
  amount: number,
  deliveryDay: string,
  items: OrderConfirmationItem[] = [],
  orderType: string = '',
  isSubscribed: boolean = false
) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || ''
  const realItems = items.filter((i) => i.name && i.name !== 'Delivery')

  const itemRows = realItems
    .map(
      (i) => `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #e8e0d0;font-size:14px;color:#1a2e1a;">
            ${i.qty}× ${i.name}
          </td>
          <td align="right" style="padding:10px 0;border-bottom:1px solid #e8e0d0;font-size:14px;color:#1a2e1a;">
            £${(i.price * i.qty).toFixed(2)}
          </td>
        </tr>`
    )
    .join('')

  const subscriptionNote = isSubscribed
    ? `<p style="font-size:13px;color:#888888;margin:0 0 16px;line-height:1.7;">
        You're on an active subscription — this order was charged automatically as part of that.
        You can change your delivery day, choose your favourite meals, skip a week, or cancel any
        time from your account.
      </p>`
    : `<p style="font-size:13px;color:#888888;margin:0 0 16px;line-height:1.7;">
        This was a one-off Pay As You Go order — you're not on a subscription, so nothing will be
        charged again automatically. If you'd like weekly deliveries and better pricing, you can
        set up a subscription any time.
      </p>`

  await sendEmailViaNeo(
    toEmail,
    'Your prepcuisines order is confirmed',
    `
    <table border="0" cellpadding="0" cellspacing="0" style="background:#f5f0e8;padding:32px 16px;" width="100%">
      <tr>
        <td align="center">
          <table border="0" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;" width="560">
            <tr>
              <td align="center" style="background:#1a2e1a;padding:20px 32px;">
                <span style="font-family:Georgia,serif;font-size:22px;color:#f5f0e8;">prepcuisines</span>
              </td>
            </tr>
            <tr>
              <td align="center" style="background:#c9a84c;padding:12px 20px;">
                <span style="font-size:13px;font-weight:700;color:#1a2e1a;letter-spacing:0.05em;">
                  ✅ ORDER CONFIRMED
                </span>
              </td>
            </tr>
            <tr>
              <td style="padding:40px 36px 32px;">
                <p style="font-size:11px;text-transform:uppercase;letter-spacing:0.18em;color:#c9a84c;font-weight:600;margin:0 0 8px;">
                  ${orderTypeLabel(orderType, isSubscribed)}
                </p>
                <p style="font-family:Georgia,serif;font-size:28px;color:#1a2e1a;margin:0 0 20px;line-height:1.2;">
                  Your order is <em style="font-style:italic;">confirmed.</em>
                </p>
                <p style="font-size:15px;line-height:1.75;color:#333333;margin:0 0 28px;">
                  Hey ${firstName},<br/><br/>
                  Thanks for your order — here's a summary of what's coming for your
                  ${deliveryDay} delivery.
                </p>

                <table border="0" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border:1px solid #e8e0d0;border-radius:8px;" width="100%">
                  <tr>
                    <td style="padding:20px 24px;">
                      <table border="0" cellpadding="0" cellspacing="0" width="100%">
                        ${itemRows}
                        <tr>
                          <td style="padding:14px 0 0;font-size:15px;font-weight:700;color:#1a2e1a;">
                            Total
                          </td>
                          <td align="right" style="padding:14px 0 0;font-size:15px;font-weight:700;color:#1a2e1a;">
                            £${amount.toFixed(2)}
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>

                ${subscriptionNote}

                <table border="0" cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    <td style="border-top:1px solid #e8e0d0;padding-top:20px;">
                      <p style="font-size:13px;color:#888888;line-height:1.75;margin:0 0 16px;">
                        Manage your account any time:
                      </p>
                      <p style="font-size:13px;margin:0 0 6px;">
                        <a href="${siteUrl}/dashboard" style="color:#1a2e1a;">View your account</a>
                      </p>
                      <p style="font-size:13px;margin:0 0 6px;">
                        <a href="${siteUrl}/favourites" style="color:#1a2e1a;">Choose your favourite meals</a>
                      </p>
                      <p style="font-size:13px;margin:0 0 6px;">
                        <a href="${siteUrl}/change-delivery-day" style="color:#1a2e1a;">Change your delivery day</a>
                      </p>
                      <p style="font-size:13px;margin:0;">
                        Any questions, just reply to this email — we're always happy to help.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" style="background:#1a2e1a;padding:24px 32px;">
                <p style="font-size:11px;color:rgba(245,240,232,0.4);margin:0;line-height:1.7;">
                  Chef-made · Fresh · Delivered
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    `
  )
}

export async function sendWeeklyOrderLinkToCustomer(
  toEmail: string,
  firstName: string,
  deliveryDay: string
) {
  await sendEmail(
    toEmail,
    `Time to choose your meals for ${deliveryDay}`,
    `
      <p>Hi ${firstName},</p>
      <p>It's time to pick your meals for this week's ${deliveryDay} delivery.</p>
      <p><a href="${process.env.NEXT_PUBLIC_SITE_URL}/menu">Choose your meals</a></p>
      <p>Thanks,<br/>prepcuisines</p>
    `
  )
}

export async function sendPaymentFailedEmailToAdmin(
  customerName: string,
  customerEmail: string,
  amount: number,
  context: string
) {
  if (!ADMIN_EMAIL) return
  await sendEmail(
    ADMIN_EMAIL,
    `Payment failed — ${customerName}`,
    `
      <p>A payment failed and needs attention.</p>
      <ul>
        <li>Customer: ${customerName} (${customerEmail})</li>
        <li>Amount: £${amount.toFixed(2)}</li>
        <li>Context: ${context}</li>
      </ul>
      <p><a href="${process.env.NEXT_PUBLIC_SITE_URL}/admin/payment-failures">View in admin</a></p>
    `
  )
}
