// Small helper for sending transactional emails via Resend.
// Requires RESEND_API_KEY in .env.local — sign up at resend.com to get one.
// Uses their test/shared sending domain until you verify your own.

import nodemailer from 'nodemailer'
import { buildUnsubscribeUrl } from '@/lib/unsubscribe'

const RESEND_API_KEY = process.env.RESEND_API_KEY!
const FROM_ADDRESS = process.env.RESEND_FROM_ADDRESS || 'prepcuisines <onboarding@resend.dev>'
const ADMIN_EMAIL = process.env.ADMIN_NOTIFICATION_EMAIL || ''

// Loud-failure alert for automated jobs: mails the shop inbox the moment a
// cron hits an error, so a broken run can never pass silently again.
export async function sendAdminAlertEmail(subject: string, detail: string) {
  const to = ADMIN_EMAIL || 'info@prepcuisines.co.uk'
  await sendEmail(
    to,
    `⚠️ ${subject}`,
    `<div style="font-family:sans-serif"><h2 style="color:#a33">${subject}</h2><pre style="background:#f5f2ec;padding:12px;border-radius:8px;white-space:pre-wrap">${detail}</pre><p>Time: ${new Date().toISOString()}</p></div>`
  )
}

export async function sendGraceNoticeEmailToCustomer(
  toEmail: string,
  firstName: string,
  orderNumber: number | null,
  deadlineLabel: string
) {
  const ref = orderNumber != null ? ` (#PC-${orderNumber})` : ''
  await sendEmail(
    toEmail,
    'Your prepcuisines order for Sunday — thank you!',
    `<div style="font-family:sans-serif;color:#2d3510;max-width:560px">
      <h2 style="font-family:Georgia,serif;">Thank you${firstName ? `, ${firstName}` : ''}!</h2>
      <p>Your order${ref} for this Sunday has just been placed automatically from your plan, and your card has been charged as usual. Your meals will be cooked fresh and delivered on Sunday.</p>
      <p style="background:#f5f2ec;border-radius:10px;padding:12px 14px;">Plans changed this week? No problem — you can cancel this order free of charge until <strong>${deadlineLabel} tonight</strong>, and your card will be refunded in full.</p>
      <p>To cancel: log in, open <a href="https://prepcuisines.co.uk/order-history">Order History</a>, and tap "Cancel this order".</p>
      <p>Thank you for being with us — see you Sunday!</p>
      <p>Bukr / prepcuisines</p>
    </div>`
  )
}

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
  amount: number,
  willRetryTonight: boolean = false
) {
  const retryLine = willRetryTonight
    ? `<p>We've held your order and will try charging your card again before midnight tonight —
       we don't want you to go the week with no meals. If you can update your payment details
       before then, that gives it the best chance of going through:</p>`
    : `<p>We don't have a card on file to charge, so nothing will happen automatically — we don't
       want you to go the week with no meals, so please add a payment method and place your
       order before midnight tonight:</p>`

  await sendEmail(
    toEmail,
    "There was a problem with your prepcuisines payment",
    `
      <p>Hi ${firstName},</p>
      <p>We tried to charge your saved card for £${amount.toFixed(2)} and it didn't go through.</p>
      ${retryLine}
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
  isSubscribed: boolean = false,
  isFirstOrder: boolean = false,
  shipPostcode: string = '',
  orderNumber: number | null = null,
  graceCancelUntil: string | null = null
) {
  const orderRef = orderNumber != null ? ` — #PC-${orderNumber}` : ''
  const orderNumberLine =
    orderNumber != null
      ? `<p style="font-size:13px;color:#888888;margin:0 0 20px;">Order <strong style="color:#1a2e1a;">#PC-${orderNumber}</strong> — quote this if you ever need to get in touch about it.</p>`
      : ''
  const graceNote = graceCancelUntil
    ? `<p style="font-size:14px;line-height:1.7;color:#2d3510;background:#f5f2ec;border-radius:10px;padding:12px 14px;margin:0 0 16px;">Plans changed this week? You can cancel this order free of charge until <strong>${graceCancelUntil} tonight</strong> — your card will be refunded in full. Open your <a href="https://prepcuisines.co.uk/order-history" style="color:#2d3510;">Order History</a> and tap "Cancel this order".</p>`
    : ''
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

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || ''

  // First order: pure excitement, no mention of billing/future charges at
  // all — that's not what this moment is about. Repeat/auto orders:
  // genuinely charged as part of their ongoing subscription, plus a
  // reminder of what they can manage. PAYG: one-off, points them toward
  // subscribing instead of just saying "nothing happens automatically".
  const subscriptionNote =
    orderType === 'payg_order'
      ? `<p style="font-size:13px;color:#888888;margin:0 0 16px;line-height:1.7;">
          This was a one-off Pay As You Go order — you're not on a subscription, so nothing else
          will be charged. If you'd like weekly deliveries and better pricing,
          <a href="${siteUrl}/menu" style="color:#1a2e1a;font-weight:600;">subscribe and save here</a>.
        </p>`
      : isSubscribed && !isFirstOrder
      ? `<p style="font-size:13px;color:#888888;margin:0 0 16px;line-height:1.7;">
          You're on an active subscription — this order was charged automatically as part of
          that.
        </p>
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
              <p style="font-size:13px;margin:0;">
                <a href="${siteUrl}/change-delivery-day" style="color:#1a2e1a;">Change your delivery day</a>
              </p>
            </td>
          </tr>
        </table>`
      : ''

  const firstOrderIntro = isFirstOrder
    ? `<p style="font-family:Georgia,serif;font-size:28px;color:#1a2e1a;margin:0 0 20px;line-height:1.2;">
        Thank you for your <em style="font-style:italic;">first order!</em>
      </p>
      <p style="font-size:15px;line-height:1.75;color:#333333;margin:0 0 28px;">
        Hey ${firstName}, we're so glad you're here. Your first box of chef-made meals is all
        booked in for your ${deliveryDay} delivery, and we think it's going to be one of the best
        decisions you make this week. Fresh ingredients, real flavour, zero hassle — here's
        what's coming your way.
      </p>`
    : `<p style="font-family:Georgia,serif;font-size:28px;color:#1a2e1a;margin:0 0 20px;line-height:1.2;">
        Your order is <em style="font-style:italic;">confirmed.</em>
      </p>
      <p style="font-size:15px;line-height:1.75;color:#333333;margin:0 0 28px;">
        Hey ${firstName},<br/><br/>
        Thanks for your order — here's a summary of what's coming for your
        ${deliveryDay} delivery.
      </p>`

  const isDpdDelivery = !!shipPostcode && !shipPostcode.trim().toUpperCase().startsWith('ST')
  const dpdNote = isDpdDelivery
    ? `<p style="font-size:13px;color:#888888;margin:0 0 16px;line-height:1.7;">
        Your order will be delivered by DPD.
      </p>`
    : ''

  await sendEmailViaNeo(
    toEmail,
    `Your prepcuisines order is confirmed${orderRef}`,
    `
    <table border="0" cellpadding="0" cellspacing="0" style="background:#f5f0e8;padding:32px 16px;" width="100%">
      <tr>
        <td align="center">
          <table border="0" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;" width="560">
            <tr>
              <td align="center" style="background:#1a2e1a;padding:20px 32px;">
                <img alt="prepcuisines" src="https://d3k81ch9hvuctc.cloudfront.net/company/XHCPYp/images/5fabe72d-89bc-419d-8bd8-b12fdfdf04ad.png" style="display:block;height:auto;margin:0 auto;" width="200"/>
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
                ${firstOrderIntro}
                ${orderNumberLine}

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

                ${graceNote}${dpdNote}
                ${subscriptionNote}
              </td>
            </tr>
            <tr>
              <td align="center" style="background:#1a2e1a;padding:24px 32px;">
                <img alt="prepcuisines" src="https://d3k81ch9hvuctc.cloudfront.net/company/XHCPYp/images/5fabe72d-89bc-419d-8bd8-b12fdfdf04ad.png" style="display:block;height:auto;margin:0 auto 10px;" width="150"/>
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

// Sent when the admin marks an order as fulfilled — this is where the
// account-management links live now, since it's more useful once someone
// actually has the meals in hand rather than crowding the initial
// confirmation.
export async function sendOrderFulfilledEmailToCustomer(toEmail: string, firstName: string) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || ''

  await sendEmailViaNeo(
    toEmail,
    'Your prepcuisines order is on its way',
    `
    <table border="0" cellpadding="0" cellspacing="0" style="background:#f5f0e8;padding:32px 16px;" width="100%">
      <tr>
        <td align="center">
          <table border="0" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;" width="560">
            <tr>
              <td align="center" style="background:#1a2e1a;padding:20px 32px;">
                <img alt="prepcuisines" src="https://d3k81ch9hvuctc.cloudfront.net/company/XHCPYp/images/5fabe72d-89bc-419d-8bd8-b12fdfdf04ad.png" style="display:block;height:auto;margin:0 auto;" width="200"/>
              </td>
            </tr>
            <tr>
              <td align="center" style="background:#c9a84c;padding:12px 20px;">
                <span style="font-size:13px;font-weight:700;color:#1a2e1a;letter-spacing:0.05em;">
                  🍽️ ORDER FULFILLED
                </span>
              </td>
            </tr>
            <tr>
              <td style="padding:40px 36px 32px;">
                <p style="font-family:Georgia,serif;font-size:28px;color:#1a2e1a;margin:0 0 20px;line-height:1.2;">
                  Enjoy your <em style="font-style:italic;">meals!</em>
                </p>
                <p style="font-size:15px;line-height:1.75;color:#333333;margin:0 0 20px;">
                  Hey ${firstName}, we hope you enjoy them! Let us know what you think by leaving
                  us a review on Google — or if you think there's something we could improve on,
                  just reply to this email and tell us. Your feedback is the only thing that
                  helps us grow.
                </p>
                <table border="0" cellpadding="0" cellspacing="0" style="margin:0 0 28px;" width="100%">
                  <tr>
                    <td align="center">
                      <a href="https://g.page/r/CY1FkzyDX-KIEAE/review" style="display:inline-block;background:#c9a84c;border-radius:6px;padding:14px 28px;font-size:14px;font-weight:700;color:#1a2e1a;text-decoration:none;letter-spacing:0.02em;">Leave us a review</a>
                    </td>
                  </tr>
                </table>
                <p style="font-size:13px;color:#888888;line-height:1.75;margin:0 0 28px;font-style:italic;">
                  With love,<br/><span style="font-style:normal;color:#1a2e1a;font-weight:600;">the prepcuisines family</span>
                </p>

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
                <img alt="prepcuisines" src="https://d3k81ch9hvuctc.cloudfront.net/company/XHCPYp/images/5fabe72d-89bc-419d-8bd8-b12fdfdf04ad.png" style="display:block;height:auto;margin:0 auto 10px;" width="150"/>
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
  deliveryDay: string,
  cutoffText: string,
  sampleDishNames: string[] = [],
  featuredDish?: { name: string; imageUrl: string }
) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || ''

  const featuredDishBlock = featuredDish
    ? `<table border="0" cellpadding="0" cellspacing="0" style="margin:0 0 24px;" width="100%">
        <tr><td>
          <img alt="${featuredDish.name}" src="${featuredDish.imageUrl}" style="display:block;width:100%;max-width:488px;height:auto;border-radius:8px;margin:0 0 10px;" />
          <p style="font-size:11px;text-transform:uppercase;letter-spacing:0.14em;color:#c9a84c;font-weight:600;margin:0 0 2px;">New on the menu</p>
          <p style="font-size:16px;font-weight:700;color:#1a2e1a;margin:0;">${featuredDish.name}</p>
        </td></tr>
      </table>`
    : ''

  const dishRows = sampleDishNames
    .map(
      (name) => `
        <tr><td style="border-bottom:1px solid #e8e0d0;padding-bottom:14px;padding-top:14px;">
          <p style="font-size:15px;font-weight:700;color:#1a2e1a;margin:0;">${name}</p>
        </td></tr>`
    )
    .join('')

  const menuBlock = sampleDishNames.length
    ? `<table border="0" cellpadding="0" cellspacing="0" style="margin:0 0 24px;background:#f7f3eb;border-radius:8px;" width="100%">
        <tr><td style="padding:20px 24px;">
          <p style="font-size:11px;text-transform:uppercase;letter-spacing:0.18em;color:#c9a84c;font-weight:600;margin:0 0 4px;">
            On this week's menu
          </p>
          <table border="0" cellpadding="0" cellspacing="0" width="100%">${dishRows}</table>
        </td></tr>
      </table>`
    : ''

  // Operational, not promotional — no unsubscribe link, matching the
  // rule that only the genuinely marketing invite email gets one.
  await sendEmailViaNeo(
    toEmail,
    `Don't forget to pick your meals for ${deliveryDay}`,
    `
    <table border="0" cellpadding="0" cellspacing="0" style="background:#f5f0e8;padding:32px 16px;" width="100%">
      <tr><td align="center">
        <table border="0" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;" width="560">
          <tr><td align="center" style="background:#1a2e1a;padding:20px 32px;">
            <img alt="prepcuisines" src="https://d3k81ch9hvuctc.cloudfront.net/company/XHCPYp/images/5fabe72d-89bc-419d-8bd8-b12fdfdf04ad.png" style="display:block;height:auto;margin:0 auto;" width="200"/>
          </td></tr>
          <tr><td align="center" style="background:#c9a84c;padding:12px 20px;">
            <span style="font-size:13px;font-weight:700;color:#1a2e1a;letter-spacing:0.05em;">⏰ TIME TO PICK YOUR MEALS</span>
          </td></tr>
          <tr><td style="padding:40px 36px 36px;">
            <p style="font-size:11px;text-transform:uppercase;letter-spacing:0.18em;color:#c9a84c;font-weight:600;margin:0 0 8px;">
              ${deliveryDay} delivery
            </p>
            <p style="font-family:Georgia,serif;font-size:28px;color:#1a2e1a;margin:0 0 20px;line-height:1.25;">
              Don't forget to pick<br/><em style="font-style:italic;">your meals this week.</em>
            </p>
            <p style="font-size:15px;line-height:1.75;color:#333333;margin:0 0 28px;">
              Hi ${firstName}, your ${deliveryDay} delivery is coming up — pick your meals before
              the cutoff, or we'll go with your usual favourites instead.
            </p>

            ${featuredDishBlock}
            ${menuBlock}

            <table border="0" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border:1px solid #e8e0d0;border-radius:8px;" width="100%">
              <tr><td style="padding:16px 24px;">
                <p style="margin:0;font-size:14px;color:#1a2e1a;">
                  <strong>Cutoff is ${cutoffText}</strong> — after that we'll fill your box
                  from your favourites automatically.
                </p>
              </td></tr>
            </table>

            <table border="0" cellpadding="0" cellspacing="0" style="margin:0 0 10px;" width="100%">
              <tr><td align="center">
                <a href="${siteUrl}/menu" style="display:inline-block;background:#1a2e1a;border-radius:6px;padding:18px 32px;font-size:15px;font-weight:700;color:#f5f0e8;text-decoration:none;letter-spacing:0.04em;">Choose Your Meals &rarr;</a>
              </td></tr>
            </table>

            <p style="font-size:13px;color:#888888;line-height:1.75;margin:20px 0 0;text-align:center;">
              Haven't set your favourites yet? <a href="${siteUrl}/favourites" style="color:#1a2e1a;">Pick them here</a>
              so we always know what you love.
            </p>

            <table border="0" cellpadding="0" cellspacing="0" width="100%">
              <tr><td style="border-top:1px solid #e8e0d0;padding-top:20px;margin-top:20px;">
                <p style="font-size:13px;color:#888888;line-height:1.75;margin:0;font-style:italic;">
                  Any questions, just reply here — I read every one.<br/><br/>
                  <span style="font-style:normal;color:#1a2e1a;font-weight:600;">&mdash; Bukr</span>
                </p>
              </td></tr>
            </table>
          </td></tr>
          <tr><td align="center" style="background:#1a2e1a;padding:24px 32px;">
            <img alt="prepcuisines" src="https://d3k81ch9hvuctc.cloudfront.net/company/XHCPYp/images/5fabe72d-89bc-419d-8bd8-b12fdfdf04ad.png" style="display:block;height:auto;margin:0 auto 10px;" width="150"/>
            <p style="font-size:11px;color:rgba(245,240,232,0.4);margin:0;line-height:1.7;">Chef-made &middot; Fresh &middot; Delivered</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
    `
  )
}
// For people who aren't active subscribers — never ordered before, or a
// past PAYG customer. Unlike active subscribers, they have no assigned
// delivery day yet, so this mentions BOTH delivery options and their real
// cutoffs, letting them pick whichever suits them, rather than assuming
// they care about just one day. Deliberately doesn't include kcal/protein
// figures like some reference templates do — there's no real nutritional
// data stored against any dish in this system, so showing numbers would
// mean making them up.
export async function sendComeOrderInviteEmailToCustomer(
  toEmail: string,
  firstName: string,
  wednesdayCutoffText: string,
  sundayCutoffText: string,
  sampleDishNames: string[] = [],
  urgentDeadlineDay?: 'wednesday' | 'sunday',
  featuredDish?: { name: string; imageUrl: string }
) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || ''

  const featuredDishBlock = featuredDish
    ? `<table border="0" cellpadding="0" cellspacing="0" style="margin:0 0 24px;" width="100%">
        <tr><td>
          <img alt="${featuredDish.name}" src="${featuredDish.imageUrl}" style="display:block;width:100%;max-width:488px;height:auto;border-radius:8px;margin:0 0 10px;" />
          <p style="font-size:11px;text-transform:uppercase;letter-spacing:0.14em;color:#c9a84c;font-weight:600;margin:0 0 2px;">New on the menu — try it this week</p>
          <p style="font-size:16px;font-weight:700;color:#1a2e1a;margin:0;">${featuredDish.name}</p>
        </td></tr>
      </table>`
    : ''

  // One-off urgency push for a specific send — doesn't replace the actual
  // cutoff info box below (still shown, still accurate), just adds a
  // prominent nudge above it for whichever day this particular send wants
  // to push. Not a permanent part of the template.
  const urgentBanner = urgentDeadlineDay
    ? `<table border="0" cellpadding="0" cellspacing="0" style="margin:0 0 24px;" width="100%">
        <tr><td align="center" style="background:#c9a84c;border-radius:6px;padding:14px 20px;">
          <span style="font-size:14px;font-weight:700;color:#1a2e1a;">⏰ Deadline is TODAY for ${
            urgentDeadlineDay === 'wednesday' ? 'Wednesday' : 'Sunday'
          } orders!</span>
        </td></tr>
      </table>`
    : ''

  const dishRows = sampleDishNames
    .map(
      (name) => `
        <tr><td style="border-bottom:1px solid #e8e0d0;padding-bottom:14px;padding-top:14px;">
          <p style="font-size:15px;font-weight:700;color:#1a2e1a;margin:0;">${name}</p>
        </td></tr>`
    )
    .join('')

  const menuBlock = sampleDishNames.length
    ? `<table border="0" cellpadding="0" cellspacing="0" style="margin:0 0 24px;background:#f7f3eb;border-radius:8px;" width="100%">
        <tr><td style="padding:20px 24px;">
          <p style="font-size:11px;text-transform:uppercase;letter-spacing:0.18em;color:#c9a84c;font-weight:600;margin:0 0 4px;">
            A taste of what's on the menu
          </p>
          <table border="0" cellpadding="0" cellspacing="0" width="100%">${dishRows}</table>
        </td></tr>
      </table>`
    : ''

  await sendEmailViaNeo(
    toEmail,
    `Fancy trying prepcuisines this week?`,
    `
    <table border="0" cellpadding="0" cellspacing="0" style="background:#f5f0e8;padding:32px 16px;" width="100%">
      <tr><td align="center">
        <table border="0" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;" width="560">
          <tr><td align="center" style="background:#1a2e1a;padding:20px 32px;">
            <img alt="prepcuisines" src="https://d3k81ch9hvuctc.cloudfront.net/company/XHCPYp/images/5fabe72d-89bc-419d-8bd8-b12fdfdf04ad.png" style="display:block;height:auto;margin:0 auto;" width="200"/>
          </td></tr>
          <tr><td align="center" style="background:#c9a84c;padding:12px 20px;">
            <span style="font-size:13px;font-weight:700;color:#1a2e1a;letter-spacing:0.05em;">🍽️ FRESH MENU, READY WHEN YOU ARE</span>
          </td></tr>
          <tr><td style="padding:40px 36px 36px;">
            <p style="font-size:13px;font-weight:700;color:#c9a84c;margin:0 0 16px;letter-spacing:0.02em;">
              🚚 We're now delivering nationwide!
            </p>
            <p style="font-size:11px;text-transform:uppercase;letter-spacing:0.18em;color:#c9a84c;font-weight:600;margin:0 0 8px;">
              Come try us
            </p>
            <p style="font-family:Georgia,serif;font-size:28px;color:#1a2e1a;margin:0 0 20px;line-height:1.25;">
              Chef-made meals,<br/><em style="font-style:italic;">zero cooking required.</em>
            </p>
            <p style="font-size:15px;line-height:1.75;color:#333333;margin:0 0 28px;">
              Hey ${firstName}, we've got a fresh menu ready to go. Fresh ingredients, real
              flavour, ready to heat and eat — no chopping, no washing up. We deliver twice a
              week, so pick whichever day suits you.
            </p>

            ${featuredDishBlock}
            ${menuBlock}

            ${urgentBanner}

            <table border="0" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border:1px solid #e8e0d0;border-radius:8px;" width="100%">
              <tr><td style="padding:20px 24px;">
                <table border="0" cellpadding="0" cellspacing="0" width="100%">
                  <tr><td style="padding:8px 0;font-size:14px;color:#1a2e1a;">
                    <strong>Wednesday delivery</strong> — order by ${wednesdayCutoffText}
                  </td></tr>
                  <tr><td style="padding:8px 0;font-size:14px;color:#1a2e1a;border-top:1px solid #e8e0d0;">
                    <strong>Sunday delivery</strong> — order by ${sundayCutoffText}
                  </td></tr>
                </table>
              </td></tr>
            </table>

            <table border="0" cellpadding="0" cellspacing="0" style="margin:0 0 10px;" width="100%">
              <tr><td align="center">
                <a href="${siteUrl}/menu" style="display:inline-block;background:#1a2e1a;border-radius:6px;padding:18px 32px;font-size:15px;font-weight:700;color:#f5f0e8;text-decoration:none;letter-spacing:0.04em;">Browse the Menu &rarr;</a>
              </td></tr>
            </table>

            <table border="0" cellpadding="0" cellspacing="0" width="100%">
              <tr><td style="border-top:1px solid #e8e0d0;padding-top:20px;">
                <p style="font-size:13px;color:#888888;line-height:1.75;margin:0;font-style:italic;">
                  Any questions, just reply here — I read every one.<br/><br/>
                  <span style="font-style:normal;color:#1a2e1a;font-weight:600;">&mdash; Bukr</span>
                </p>
              </td></tr>
            </table>
          </td></tr>
          <tr><td align="center" style="background:#1a2e1a;padding:24px 32px;">
            <img alt="prepcuisines" src="https://d3k81ch9hvuctc.cloudfront.net/company/XHCPYp/images/5fabe72d-89bc-419d-8bd8-b12fdfdf04ad.png" style="display:block;height:auto;margin:0 auto 10px;" width="150"/>
            <p style="font-size:11px;color:rgba(245,240,232,0.4);margin:0;line-height:1.7;">Chef-made &middot; Fresh &middot; Delivered<br/><a href="${buildUnsubscribeUrl(toEmail)}" style="color:rgba(245,240,232,0.4);text-decoration:underline;">Unsubscribe</a></p>
          </td></tr>
        </table>
      </td></tr>
    </table>
    `
  )
}

// For subscribers who cancelled a while ago. Sent on a recurring cadence
// (every ~3 weeks) by the weekly reminder cron, independent of which
// delivery day it's covering. Carries a genuine 40%-off reactivation
// offer — this is separate from the WELCOME40 first-order tracking, and
// only ever granted because the person specifically cancelled and is
// being invited back, not because they're a fresh signup. The actual
// discount is applied automatically at their next charge once they
// reactivate (see winback_discount_pending), not via a code they enter.
// Sent immediately at the moment someone cancels — separate from the
// 3-week win-back (sendWinBackEmailToCustomer). This one doesn't invent a
// new discount: it just reminds them of the 20%-off tier they may still
// genuinely have left (orders_completed doesn't reset on cancelling, so
// reactivating picks up exactly where they left off). If they've already
// used up all 6 discounted orders, this sends without any discount
// mention rather than promising something that isn't true.
export async function sendCancelledRetentionEmailToCustomer(
  toEmail: string,
  firstName: string,
  discountedOrdersRemaining: number
) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || ''

  const hasDiscountLeft = discountedOrdersRemaining > 0
  const bannerText = hasDiscountLeft ? '🎁 YOUR 20% OFF IS STILL WAITING' : '👋 SORRY TO SEE YOU GO'
  const bodyText = hasDiscountLeft
    ? `Before you go — you've still got <strong>${discountedOrdersRemaining} order${
        discountedOrdersRemaining === 1 ? '' : 's'
      } left at 20% off</strong>. Reactivate any time and pick up right where you left off, no need to start over.`
    : `Before you go — if you ever fancy coming back, just reactivate any time. We'll have a fresh menu waiting.`

  await sendEmailViaNeo(
    toEmail,
    hasDiscountLeft ? `${firstName}, your 20% off is still here` : `${firstName}, sorry to see you go`,
    `
    <table border="0" cellpadding="0" cellspacing="0" style="background:#f5f0e8;padding:32px 16px;" width="100%">
      <tr><td align="center">
        <table border="0" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;" width="560">
          <tr><td align="center" style="background:#1a2e1a;padding:20px 32px;">
            <img alt="prepcuisines" src="https://d3k81ch9hvuctc.cloudfront.net/company/XHCPYp/images/5fabe72d-89bc-419d-8bd8-b12fdfdf04ad.png" style="display:block;height:auto;margin:0 auto;" width="200"/>
          </td></tr>
          <tr><td align="center" style="background:#c9a84c;padding:12px 20px;">
            <span style="font-size:13px;font-weight:700;color:#1a2e1a;letter-spacing:0.05em;">${bannerText}</span>
          </td></tr>
          <tr><td style="padding:40px 36px 36px;">
            <p style="font-family:Georgia,serif;font-size:26px;color:#1a2e1a;margin:0 0 20px;line-height:1.3;">
              Sorry to see you go, ${firstName}.
            </p>
            <p style="font-size:15px;line-height:1.75;color:#333333;margin:0 0 28px;">
              ${bodyText}
            </p>

            <table border="0" cellpadding="0" cellspacing="0" style="margin:0 0 10px;" width="100%">
              <tr><td align="center">
                <a href="${siteUrl}/login" style="display:inline-block;background:#1a2e1a;border-radius:6px;padding:18px 32px;font-size:15px;font-weight:700;color:#f5f0e8;text-decoration:none;letter-spacing:0.04em;">Reactivate My Subscription &rarr;</a>
              </td></tr>
            </table>

            <table border="0" cellpadding="0" cellspacing="0" width="100%">
              <tr><td style="border-top:1px solid #e8e0d0;padding-top:20px;">
                <p style="font-size:13px;color:#888888;line-height:1.75;margin:0;font-style:italic;">
                  Any questions, just reply here — I read every one.<br/><br/>
                  <span style="font-style:normal;color:#1a2e1a;font-weight:600;">&mdash; Bukr</span>
                </p>
              </td></tr>
            </table>
          </td></tr>
          <tr><td align="center" style="background:#1a2e1a;padding:24px 32px;">
            <img alt="prepcuisines" src="https://d3k81ch9hvuctc.cloudfront.net/company/XHCPYp/images/5fabe72d-89bc-419d-8bd8-b12fdfdf04ad.png" style="display:block;height:auto;margin:0 auto 10px;" width="150"/>
            <p style="font-size:11px;color:rgba(245,240,232,0.4);margin:0;line-height:1.7;">Chef-made &middot; Fresh &middot; Delivered<br/><a href="${buildUnsubscribeUrl(toEmail)}" style="color:rgba(245,240,232,0.4);text-decoration:underline;">Unsubscribe</a></p>
          </td></tr>
        </table>
      </td></tr>
    </table>
    `
  )
}

// One-off promotional push for EXISTING subscribers about a new dish -
// separate audience and separate one-time tracking from the leads payday
// email above. No discount here (they're already subscribers, not eligible
// for a first-order price) - just "it's on the menu now, go order it".
export async function sendNewDishAlertEmailToCustomer(toEmail: string, firstName: string) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || ''

  await sendEmailViaNeo(
    toEmail,
    `${firstName}, new dish just dropped — 50g+ protein`,
    `
    <div style="font-family:-apple-system,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;max-width:480px;margin:0 auto;padding:24px 16px;">
      <p style="margin:0 0 16px;"><strong>prepcuisines: NEW DISH ALERT!</strong></p>
      <p style="margin:0 0 16px;">Hey ${firstName}, just added to the menu: <strong>Turkish Beef Pasta With Garlic Yoghurt</strong> — 50g+ protein, garlic mint yoghurt, chilli butter, cherry tomato.</p>
      <p style="margin:0 0 16px;">Order it for your next delivery, or add it to your favourites so it's ready to go automatically.</p>
      <p style="margin:0 0 16px;">ORDER: <a href="${siteUrl}/menu">${siteUrl.replace(/^https?:\/\//, '')}/menu</a></p>
      <p style="margin:0 0 16px;">Wed delivery — order by Sun 8pm<br/>
      Sun delivery — order by Fri 8pm</p>
      <p style="margin:0;color:#666666;">STOP: <a href="${buildUnsubscribeUrl(toEmail)}" style="color:#666666;">${buildUnsubscribeUrl(toEmail).replace(/^https?:\/\//, '')}</a></p>
    </div>
    `
  )
}

// One-off promotional push for imported leads only (never subscribed here
// before) - separate from the recurring weekly invite and tracked with its
// own timestamp so it doesn't interfere with that cadence. Plain-text
// style on purpose, matching the SMS-style deal text this was modelled on
// — no branded header/footer, no button, just short lines. Deliberately
// doesn't borrow the competitor's "delivered in 48 hours" line since
// that's not how this business works (pre-order only, fixed Wed/Sun
// delivery) - keeps the payday urgency and price hook, real cutoffs underneath.
export async function sendPaydayDealEmailToLead(toEmail: string, firstName: string) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || ''

  await sendEmailViaNeo(
    toEmail,
    `${firstName}, payday deal — £4.80 a meal`,
    `
    <div style="font-family:-apple-system,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;max-width:480px;margin:0 auto;padding:24px 16px;">
      <p style="margin:0 0 16px;"><strong>prepcuisines: PAYDAY DEAL!</strong></p>
      <p style="margin:0 0 16px;">40% OFF YOUR FIRST BOX — no code needed.<br/>
      High protein. Low effort. From £4.80 a meal.</p>
      <p style="margin:0 0 16px;">Hey ${firstName}, new on the menu: <strong>Turkish Beef Pasta With Garlic Yoghurt</strong> — 50g+ protein, garlic mint yoghurt, chilli butter, cherry tomato.</p>
      <p style="margin:0 0 16px;">CLAIM: <a href="${siteUrl}/menu">${siteUrl.replace(/^https?:\/\//, '')}/menu</a></p>
      <p style="margin:0 0 16px;">Wed delivery — order by Sun 8pm<br/>
      Sun delivery — order by Fri 8pm</p>
      <p style="margin:0;color:#666666;">STOP: <a href="${buildUnsubscribeUrl(toEmail)}" style="color:#666666;">${buildUnsubscribeUrl(toEmail).replace(/^https?:\/\//, '')}</a></p>
    </div>
    `
  )
}

// One-off announcement to CURRENT active subscribers only, about the new
// dish — no discount (they're already subscribed, this isn't a win-back or
// a first-order push), just a heads up with a link to order. Same
// plain-text style as the payday email. One-time only, own tracking
// column so it never repeats and never touches any other email's cadence.
export async function sendNewDishAnnouncementToSubscriber(toEmail: string, firstName: string) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || ''

  await sendEmailViaNeo(
    toEmail,
    `${firstName}, new on the menu — 50g+ protein`,
    `
    <div style="font-family:-apple-system,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;max-width:480px;margin:0 auto;padding:24px 16px;">
      <p style="margin:0 0 16px;">Hey ${firstName}, new on the menu: <strong>Turkish Beef Pasta With Garlic Yoghurt</strong> — 50g+ protein, garlic mint yoghurt, chilli butter, cherry tomato.</p>
      <p style="margin:0 0 16px;">Order now: <a href="${siteUrl}/menu">${siteUrl.replace(/^https?:\/\//, '')}/menu</a></p>
      <p style="margin:0;font-style:italic;color:#666666;">— Bukr</p>
    </div>
    `
  )
}

export async function sendWinBackEmailToCustomer(toEmail: string, firstName: string) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || ''

  await sendEmailViaNeo(
    toEmail,
    `${firstName}, come back to 40% off your next order`,
    `
    <table border="0" cellpadding="0" cellspacing="0" style="background:#f5f0e8;padding:32px 16px;" width="100%">
      <tr><td align="center">
        <table border="0" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;" width="560">
          <tr><td align="center" style="background:#1a2e1a;padding:20px 32px;">
            <img alt="prepcuisines" src="https://d3k81ch9hvuctc.cloudfront.net/company/XHCPYp/images/5fabe72d-89bc-419d-8bd8-b12fdfdf04ad.png" style="display:block;height:auto;margin:0 auto;" width="200"/>
          </td></tr>
          <tr><td align="center" style="background:#c9a84c;padding:12px 20px;">
            <span style="font-size:13px;font-weight:700;color:#1a2e1a;letter-spacing:0.05em;">🎉 40% OFF YOUR NEXT ORDER</span>
          </td></tr>
          <tr><td style="padding:40px 36px 36px;">
            <p style="font-size:11px;text-transform:uppercase;letter-spacing:0.18em;color:#c9a84c;font-weight:600;margin:0 0 8px;">
              We miss you
            </p>
            <p style="font-family:Georgia,serif;font-size:28px;color:#1a2e1a;margin:0 0 20px;line-height:1.25;">
              Come back, ${firstName}<br/><em style="font-style:italic;">on us — 40% off.</em>
            </p>
            <p style="font-size:15px;line-height:1.75;color:#333333;margin:0 0 28px;">
              It's been a little while since your last order. Reactivate your subscription and
              your next box is 40% off, automatically — no code needed.
            </p>

            <table border="0" cellpadding="0" cellspacing="0" style="margin:0 0 10px;" width="100%">
              <tr><td align="center">
                <a href="${siteUrl}/login" style="display:inline-block;background:#1a2e1a;border-radius:6px;padding:18px 32px;font-size:15px;font-weight:700;color:#f5f0e8;text-decoration:none;letter-spacing:0.04em;">Reactivate My Subscription &rarr;</a>
              </td></tr>
            </table>

            <table border="0" cellpadding="0" cellspacing="0" width="100%">
              <tr><td style="border-top:1px solid #e8e0d0;padding-top:20px;">
                <p style="font-size:13px;color:#888888;line-height:1.75;margin:0;font-style:italic;">
                  Any questions, just reply here — I read every one.<br/><br/>
                  <span style="font-style:normal;color:#1a2e1a;font-weight:600;">&mdash; Bukr</span>
                </p>
              </td></tr>
            </table>
          </td></tr>
          <tr><td align="center" style="background:#1a2e1a;padding:24px 32px;">
            <img alt="prepcuisines" src="https://d3k81ch9hvuctc.cloudfront.net/company/XHCPYp/images/5fabe72d-89bc-419d-8bd8-b12fdfdf04ad.png" style="display:block;height:auto;margin:0 auto 10px;" width="150"/>
            <p style="font-size:11px;color:rgba(245,240,232,0.4);margin:0;line-height:1.7;">Chef-made &middot; Fresh &middot; Delivered<br/><a href="${buildUnsubscribeUrl(toEmail)}" style="color:rgba(245,240,232,0.4);text-decoration:underline;">Unsubscribe</a></p>
          </td></tr>
        </table>
      </td></tr>
    </table>
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

// Summary notification for bulk/batch sends (weekly reminder + invite
// crons) — one email per run, just a count, not a list of every
// recipient. Only call this when something was actually sent, so quiet
// runs don't clutter the inbox.
export async function sendBulkEmailSummaryToAdmin(
  emailName: string,
  breakdown: { label: string; count: number }[]
) {
  if (!ADMIN_EMAIL) return
  const totalCount = breakdown.reduce((sum, b) => sum + b.count, 0)
  const breakdownLines = breakdown
    .filter((b) => b.count > 0)
    .map((b) => `<li>${b.label}: ${b.count}</li>`)
    .join('')

  await sendEmail(
    ADMIN_EMAIL,
    `${emailName} sent successfully — ${totalCount} email${totalCount === 1 ? '' : 's'}`,
    `
      <p>"${emailName}" was sent successfully.</p>
      <ul>${breakdownLines}</ul>
    `
  )
}
