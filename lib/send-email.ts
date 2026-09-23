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
  const html = buildOrderConfirmationEmailHtml({
    firstName,
    amount,
    deliveryDay,
    items,
    orderType,
    isSubscribed,
    isFirstOrder,
    shipPostcode,
    orderNumber,
    graceCancelUntil,
  })
  const orderRef = orderNumber != null ? ` — #PC-${orderNumber}` : ''
  await sendEmailViaNeo(toEmail, `Your prepcuisines order is confirmed${orderRef}`, html)
}

// Builds the order confirmation HTML on its own so it can be previewed
// without sending. Table-based with inline styles so it holds up in Gmail,
// Outlook and Apple Mail.
export function buildOrderConfirmationEmailHtml(o: {
  firstName: string
  amount: number
  deliveryDay: string
  items: OrderConfirmationItem[]
  orderType: string
  isSubscribed: boolean
  isFirstOrder: boolean
  shipPostcode: string
  orderNumber: number | null
  graceCancelUntil: string | null
}) {
  const G = '#1a2e1a' // dark green
  const GOLD = '#c9a84c'
  const CREAM = '#f5f0e8'
  const LINE = '#e8e0d0'
  const MUTED = '#6b7a6b'
  const SERIF = "Georgia,'Times New Roman',serif"
  const SANS = "'Helvetica Neue',Helvetica,Arial,sans-serif"
  const LOGO =
    'https://d3k81ch9hvuctc.cloudfront.net/company/XHCPYp/images/5fabe72d-89bc-419d-8bd8-b12fdfdf04ad.png'
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://prepcuisines.co.uk'

  const name = o.firstName || 'there'
  // Callers pass 'Sunday', 'Wednesday', or a fallback like 'your' when the
  // day isn't known — normalise so every line of copy matches the day they
  // actually picked, and reads naturally when we don't know it.
  const rawDay = (o.deliveryDay || '').toLowerCase()
  const hasSun = rawDay.includes('sun')
  const hasWed = rawDay.includes('wed')
  const dayKnown = hasSun || hasWed
  const day = hasSun && hasWed ? 'Sunday & Wednesday' : hasSun ? 'Sunday' : hasWed ? 'Wednesday' : ''
  const onDay = dayKnown ? `on ${day}` : 'on your delivery day'
  const everyDay = hasSun && hasWed ? 'every Sunday and Wednesday' : dayKnown ? `every ${day}` : 'every week'
  const realItems = o.items.filter((i) => i.name && i.name !== 'Delivery')
  const mealCount = realItems.reduce((n, i) => n + (i.qty || 0), 0)
  const isDpd = !!o.shipPostcode && !o.shipPostcode.trim().toUpperCase().startsWith('ST')

  const headline = o.isFirstOrder
    ? `Welcome to the prepcuisines family, ${name}.`
    : `Your week's sorted, ${name}.`
  const intro = o.isFirstOrder
    ? `We're so glad you're here. Your first box arrives ${onDay} — cooked fresh by our chefs, portioned, labelled and sent out chilled. All you do is heat and eat.`
    : `Thanks for ordering again. Your meals arrive ${onDay} — here's everything you need to know.`

  const itemRows = realItems
    .map(
      (i) => `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid ${LINE};font-family:${SANS};font-size:14px;color:${G};">
          <span style="display:inline-block;min-width:26px;font-weight:700;color:${GOLD};">${i.qty}×</span>${i.name}
        </td>
        <td align="right" style="padding:12px 0;border-bottom:1px solid ${LINE};font-family:${SANS};font-size:14px;color:${G};white-space:nowrap;">
          £${(i.price * i.qty).toFixed(2)}
        </td>
      </tr>`
    )
    .join('')

  const steps = [
    ['Order locked in', `We've got your order${o.orderNumber != null ? ` (#PC-${o.orderNumber})` : ''} and it's booked into this week's cook.`],
    ['Cooked fresh', 'Our chefs prep every dish from fresh ingredients in our Stoke-on-Trent kitchen, then portion and label each one.'],
    ['Delivered chilled', isDpd ? `Your box goes out with DPD and arrives ${onDay}.` : `Your box arrives ${onDay}.`],
    ['Fridge, heat, eat', 'Pop your meals straight in the fridge. Reheating instructions and macros are on every label.'],
  ]
  const stepRows = steps
    .map(
      ([title, body], idx) => `
      <tr>
        <td valign="top" width="44" style="padding:0 0 ${idx === steps.length - 1 ? 0 : 22}px;">
          <table border="0" cellpadding="0" cellspacing="0"><tr>
            <td align="center" valign="middle" width="30" height="30" style="width:30px;height:30px;border-radius:15px;background:${idx === 0 ? GOLD : G};border:1px solid ${GOLD};font-family:${SANS};font-size:13px;font-weight:700;color:${idx === 0 ? G : GOLD};">${idx + 1}</td>
          </tr></table>
        </td>
        <td valign="top" style="padding:4px 0 ${idx === steps.length - 1 ? 0 : 22}px;">
          <p style="margin:0 0 4px;font-family:${SERIF};font-size:18px;color:${CREAM};">${title}</p>
          <p style="margin:0;font-family:${SANS};font-size:13px;line-height:1.6;color:rgba(245,240,232,0.7);">${body}</p>
        </td>
      </tr>`
    )
    .join('')

  const perks = [
    ['Chef-made', 'Real recipes, cooked fresh each week'],
    ['Macros on every label', 'Calories and protein, no guesswork'],
    ['Ready in minutes', 'Straight from the fridge to your plate'],
  ]
  const perkCells = perks
    .map(
      ([t, b], idx) => `
      <td class="pc-stack" valign="top" width="33%" style="padding:0 ${idx === perks.length - 1 ? 0 : 12}px 0 0;">
        <div style="border-top:3px solid ${GOLD};padding-top:12px;">
          <p style="margin:0 0 4px;font-family:${SANS};font-size:13px;font-weight:700;color:${G};">${t}</p>
          <p style="margin:0;font-family:${SANS};font-size:12px;line-height:1.5;color:${MUTED};">${b}</p>
        </div>
      </td>`
    )
    .join('')

  // Subscribing benefits — pulled from the How It Works page so the email
  // never promises anything the site doesn't. Delivery line follows their day.
  const benefits = [
    [`A fresh box ${everyDay}`, `Chef-made meals land ${everyDay} without you having to reorder.`],
    ['Better pricing', 'Loyalty discounts on your next orders, always shown clearly at checkout.'],
    ['Never miss a week', "Miss the cutoff and we'll fill your box from your favourites — never anything you've marked as disliked."],
    ['Total flexibility', 'Skip a week, change your plan size, switch delivery days or cancel from your account. No phone calls.'],
  ]
  const benefitRows = benefits
    .map(
      ([t, b], idx) => `
      <tr>
        <td valign="top" width="30" style="padding:${idx === 0 ? 0 : 16}px 0 0;font-family:${SANS};font-size:16px;font-weight:700;color:${GOLD};">✓</td>
        <td valign="top" style="padding:${idx === 0 ? 0 : 16}px 0 0;">
          <p style="margin:0 0 3px;font-family:${SANS};font-size:14px;font-weight:700;color:${G};">${t}</p>
          <p style="margin:0;font-family:${SANS};font-size:13px;line-height:1.6;color:${MUTED};">${b}</p>
        </td>
      </tr>`
    )
    .join('')
  const showBenefits = o.orderType === 'payg_order' || (o.isSubscribed && o.isFirstOrder)
  const benefitsBlock = showBenefits
    ? `<tr><td class="pc-pad" style="padding:40px 36px 12px;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="border:2px solid ${GOLD};"><tr><td style="padding:28px 26px;">
          <p style="margin:0 0 6px;font-family:${SERIF};font-size:24px;line-height:1.2;color:${G};">${o.orderType === 'payg_order' ? 'Why subscribers never go back' : "What you get as a subscriber"}</p>
          <p style="margin:0 0 22px;font-family:${SANS};font-size:13px;line-height:1.6;color:${MUTED};">${o.orderType === 'payg_order' ? 'This was a one-off order, so nothing else will be charged. Here\'s what a subscription adds:' : "Here's what comes with your subscription from now on:"}</p>
          <table border="0" cellpadding="0" cellspacing="0" width="100%">${benefitRows}</table>
          ${o.orderType === 'payg_order' ? `<p style="margin:26px 0 0;"><a href="${siteUrl}/menu" style="display:inline-block;background:${G};color:${CREAM};font-family:${SANS};font-size:14px;font-weight:700;text-decoration:none;padding:14px 26px;border-radius:4px;">Subscribe and save</a></p>` : ''}
        </td></tr></table>
      </td></tr>`
    : ''

  let planNote = ''
  if (o.isSubscribed) {
    const links = [
      [`${siteUrl}/dashboard`, 'View your account'],
      [`${siteUrl}/favourites`, 'Choose your favourite meals'],
      [`${siteUrl}/change-delivery-day`, 'Change your delivery day'],
    ]
      .map(
        ([href, label]) =>
          `<tr><td style="padding:12px 0;border-bottom:1px solid ${LINE};"><a href="${href}" style="font-family:${SANS};font-size:14px;font-weight:600;color:${G};text-decoration:none;">${label}</a></td><td align="right" style="padding:12px 0;border-bottom:1px solid ${LINE};font-family:${SANS};font-size:14px;color:${GOLD};">›</td></tr>`
      )
      .join('')
    planNote = `
      <p style="margin:0 0 6px;font-family:${SERIF};font-size:22px;color:${G};">Your subscription</p>
      <p style="margin:0 0 12px;font-family:${SANS};font-size:13px;line-height:1.7;color:${MUTED};">${o.isFirstOrder ? 'Manage everything from your account, any time.' : 'This order was charged automatically as part of your subscription.'}</p>
      <table border="0" cellpadding="0" cellspacing="0" width="100%">${links}</table>`
  }

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  @media only screen and (max-width:520px){
    .pc-pad{padding-left:22px !important;padding-right:22px !important;}
    .pc-h1{font-size:32px !important;}
    .pc-stack{display:block !important;width:100% !important;padding:0 0 16px !important;}
  }
</style></head>
<body style="margin:0;padding:0;background:${CREAM};">
<table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:${CREAM};padding:24px 12px;">
<tr><td align="center">
<table border="0" cellpadding="0" cellspacing="0" width="560" style="max-width:560px;width:100%;background:#ffffff;">

  <!-- Header -->
  <tr><td align="center" style="background:${G};padding:22px 32px;">
    <img alt="prepcuisines" src="${LOGO}" width="180" style="display:block;height:auto;margin:0 auto;"/>
  </td></tr>

  <!-- Hero -->
  <tr><td class="pc-pad" style="background:${G};padding:28px 36px 44px;">
    <p style="margin:0 0 18px;font-family:${SANS};font-size:13px;font-weight:700;color:${GOLD};">✓ Order confirmed${o.orderNumber != null ? ` · #PC-${o.orderNumber}` : ''}</p>
    <h1 class="pc-h1" style="margin:0 0 18px;font-family:${SERIF};font-weight:normal;font-size:40px;line-height:1.1;color:${CREAM};">${headline}</h1>
    <p style="margin:0;font-family:${SANS};font-size:15px;line-height:1.7;color:rgba(245,240,232,0.78);">${intro}</p>
  </td></tr>

  <!-- Gold strip: key facts -->
  <tr><td style="background:${GOLD};padding:0;">
    <table border="0" cellpadding="0" cellspacing="0" width="100%"><tr>
      <td align="center" width="50%" style="padding:16px 10px;border-right:1px solid rgba(26,46,26,0.2);">
        <p style="margin:0;font-family:${SANS};font-size:12px;color:${G};">Delivery</p>
        <p style="margin:2px 0 0;font-family:${SERIF};font-size:20px;color:${G};">${dayKnown ? day : 'Booked in'}</p>
      </td>
      <td align="center" width="50%" style="padding:16px 10px;">
        <p style="margin:0;font-family:${SANS};font-size:12px;color:${G};">In your box</p>
        <p style="margin:2px 0 0;font-family:${SERIF};font-size:20px;color:${G};">${mealCount} meal${mealCount === 1 ? '' : 's'}</p>
      </td>
    </tr></table>
  </td></tr>

  <!-- Order summary -->
  <tr><td class="pc-pad" style="padding:40px 36px 28px;">
    <p style="margin:0 0 14px;font-family:${SERIF};font-size:22px;color:${G};">What's coming</p>
    <table border="0" cellpadding="0" cellspacing="0" width="100%">
      ${itemRows}
      <tr>
        <td style="padding:16px 0 0;font-family:${SANS};font-size:15px;font-weight:700;color:${G};">Total paid</td>
        <td align="right" style="padding:16px 0 0;font-family:${SANS};font-size:15px;font-weight:700;color:${G};">£${o.amount.toFixed(2)}</td>
      </tr>
    </table>
  </td></tr>

  <!-- Timeline -->
  <tr><td class="pc-pad" style="background:${G};padding:40px 36px;">
    <p style="margin:0 0 6px;font-family:${SERIF};font-size:26px;color:${CREAM};">From our kitchen to your fridge</p>
    <p style="margin:0 0 28px;font-family:${SANS};font-size:13px;color:rgba(245,240,232,0.6);">Here's what happens between now and ${dayKnown ? day : 'your delivery'}.</p>
    <table border="0" cellpadding="0" cellspacing="0" width="100%">${stepRows}</table>
  </td></tr>

  ${benefitsBlock || `<!-- Perks -->
  <tr><td class="pc-pad" style="padding:40px 36px 12px;">
    <p style="margin:0 0 20px;font-family:${SERIF};font-size:22px;color:${G};">Every box, every week</p>
    <table border="0" cellpadding="0" cellspacing="0" width="100%"><tr>${perkCells}</tr></table>
  </td></tr>`}

  ${planNote ? `<tr><td class="pc-pad" style="padding:28px 36px 12px;">${planNote}</td></tr>` : ''}

  <!-- Help -->
  <tr><td class="pc-pad" style="padding:32px 36px 40px;">
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:${CREAM};"><tr>
      <td style="padding:24px;">
        <p style="margin:0 0 6px;font-family:${SERIF};font-size:20px;color:${G};">Need a hand?</p>
        <p style="margin:0 0 16px;font-family:${SANS};font-size:13px;line-height:1.7;color:${MUTED};">Questions about your order, delivery or ingredients — just reply to this email${o.orderNumber != null ? ` and quote #PC-${o.orderNumber}` : ''}.</p>
        <a href="mailto:info@prepcuisines.co.uk" style="display:inline-block;background:${G};color:${CREAM};font-family:${SANS};font-size:13px;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:4px;">Contact us</a>
      </td>
    </tr></table>
  </td></tr>

  <!-- Footer -->
  <tr><td align="center" style="background:${G};padding:28px 32px;">
    <img alt="prepcuisines" src="${LOGO}" width="130" style="display:block;height:auto;margin:0 auto 12px;"/>
    <p style="margin:0;font-family:${SANS};font-size:11px;line-height:1.7;color:rgba(245,240,232,0.45);">102A Sun Street, Stoke-on-Trent, ST1 4JR</p>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>`
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
          <p style="font-family:'Outfit',Arial,sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:0.14em;color:#c9a84c;font-weight:600;margin:0 0 4px;">New on the menu</p>
          <p style="font-family:'Outfit',Arial,sans-serif;font-size:16px;font-weight:700;color:#1a2e1a;margin:0 0 10px;">${featuredDish.name}</p>
          <img alt="${featuredDish.name}" src="${featuredDish.imageUrl}" style="display:block;width:100%;max-width:488px;height:auto;border-radius:8px;" />
        </td></tr>
      </table>`
    : ''

  const priceStatement = `<table border="0" cellpadding="0" cellspacing="0" style="margin:0 0 24px;" width="100%">
    <tr><td align="center">
      <p style="font-family:'Outfit',Arial,sans-serif;font-size:12px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#c9a84c;margin:0 0 2px;">All meals</p>
      <p style="font-family:'Cormorant Garamond',Georgia,serif;font-weight:600;font-size:44px;color:#1a2e1a;margin:0;line-height:1;">From £4.80</p>
    </td></tr>
  </table>`

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
    <style>@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&display=swap');</style>
    <table border="0" cellpadding="0" cellspacing="0" style="background:#f5f0e8;padding:32px 16px;" width="100%">
      <tr><td align="center">
        <table border="0" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;" width="560">
          <tr><td align="center" style="background:#1a2e1a;padding:20px 32px;">
            <img alt="prepcuisines" src="https://d3k81ch9hvuctc.cloudfront.net/company/XHCPYp/images/5fabe72d-89bc-419d-8bd8-b12fdfdf04ad.png" style="display:block;height:auto;margin:0 auto;" width="200"/>
          </td></tr>
          <tr><td align="center" style="background:#c9a84c;padding:12px 20px;">
            <span style="font-family:'Outfit',Arial,sans-serif;font-size:13px;font-weight:700;color:#1a2e1a;letter-spacing:0.05em;">⏰ TIME TO PICK YOUR MEALS</span>
          </td></tr>
          <tr><td style="padding:32px 36px 36px;">
            ${featuredDishBlock}
            ${priceStatement}

            <p style="font-family:'Outfit',Arial,sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:0.18em;color:#c9a84c;font-weight:600;margin:0 0 8px;">
              ${deliveryDay} delivery
            </p>
            <p style="font-family:'Cormorant Garamond',Georgia,serif;font-weight:600;font-size:28px;color:#1a2e1a;margin:0 0 20px;line-height:1.25;">
              Don't forget to pick<br/><em style="font-style:italic;">your meals this week.</em>
            </p>
            <p style="font-family:'Outfit',Arial,sans-serif;font-size:15px;line-height:1.75;color:#333333;margin:0 0 28px;">
              Hi ${firstName}, your ${deliveryDay} delivery is coming up — pick your meals before
              the cutoff, or we'll go with your usual favourites instead.
            </p>

            ${menuBlock}

            <table border="0" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border:1px solid #e8e0d0;border-radius:8px;" width="100%">
              <tr><td style="padding:16px 24px;">
                <p style="margin:0;font-family:'Outfit',Arial,sans-serif;font-size:14px;color:#1a2e1a;">
                  <strong>Cutoff is ${cutoffText}</strong> — after that we'll fill your box
                  from your favourites automatically.
                </p>
              </td></tr>
            </table>

            <table border="0" cellpadding="0" cellspacing="0" style="margin:0 0 10px;" width="100%">
              <tr><td align="center">
                <a href="${siteUrl}/menu" style="display:inline-block;background:#1a2e1a;border-radius:6px;padding:18px 32px;font-family:'Outfit',Arial,sans-serif;font-size:15px;font-weight:700;color:#f5f0e8;text-decoration:none;letter-spacing:0.04em;">Choose Your Meals &rarr;</a>
              </td></tr>
            </table>

            <p style="font-family:'Outfit',Arial,sans-serif;font-size:13px;color:#888888;line-height:1.75;margin:20px 0 0;text-align:center;">
              Haven't set your favourites yet? <a href="${siteUrl}/favourites" style="color:#1a2e1a;">Pick them here</a>
              so we always know what you love.
            </p>

            <table border="0" cellpadding="0" cellspacing="0" width="100%">
              <tr><td style="border-top:1px solid #e8e0d0;padding-top:20px;margin-top:20px;">
                <p style="font-family:'Outfit',Arial,sans-serif;font-size:13px;color:#888888;line-height:1.75;margin:0;font-style:italic;">
                  Any questions, just reply here — I read every one.<br/><br/>
                  <span style="font-style:normal;color:#1a2e1a;font-weight:600;">&mdash; Bukr</span>
                </p>
              </td></tr>
            </table>
          </td></tr>
          <tr><td align="center" style="background:#1a2e1a;padding:24px 32px;">
            <img alt="prepcuisines" src="https://d3k81ch9hvuctc.cloudfront.net/company/XHCPYp/images/5fabe72d-89bc-419d-8bd8-b12fdfdf04ad.png" style="display:block;height:auto;margin:0 auto 14px;" width="150"/>
            <table border="0" cellpadding="0" cellspacing="0" style="margin:0 auto 14px;"><tr>
              <td style="padding:0 6px;">
                <a href="https://www.instagram.com/prepcuisines?igsi=M3Rsdno0YmVqOWtn&utm_source=qr" style="display:inline-block;width:34px;height:34px;line-height:34px;border-radius:50%;background:#c9a84c;text-align:center;font-family:'Outfit',Arial,sans-serif;font-size:11px;font-weight:800;color:#1a2e1a;text-decoration:none;">IG</a>
              </td>
              <td style="padding:0 6px;">
                <a href="https://www.tiktok.com/@prepcuisines?_r=1&_t=ZG-99PgwI4yizB" style="display:inline-block;width:34px;height:34px;line-height:34px;border-radius:50%;background:#c9a84c;text-align:center;font-family:'Outfit',Arial,sans-serif;font-size:11px;font-weight:800;color:#1a2e1a;text-decoration:none;">TT</a>
              </td>
            </tr></table>
            <p style="font-family:'Outfit',Arial,sans-serif;font-size:11px;color:rgba(245,240,232,0.4);margin:0;line-height:1.7;">Chef-made &middot; Fresh &middot; Delivered</p>
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
          <p style="font-family:'Outfit',Arial,sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:0.14em;color:#c9a84c;font-weight:600;margin:0 0 4px;">New on the menu — try it this week</p>
          <p style="font-family:'Outfit',Arial,sans-serif;font-size:16px;font-weight:700;color:#1a2e1a;margin:0 0 10px;">${featuredDish.name}</p>
          <img alt="${featuredDish.name}" src="${featuredDish.imageUrl}" style="display:block;width:100%;max-width:488px;height:auto;border-radius:8px;" />
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
    <style>@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&display=swap');</style>
    <table border="0" cellpadding="0" cellspacing="0" style="background:#f5f0e8;padding:32px 16px;" width="100%">
      <tr><td align="center">
        <table border="0" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;" width="560">
          <tr><td align="center" style="background:#1a2e1a;padding:20px 32px;">
            <img alt="prepcuisines" src="https://d3k81ch9hvuctc.cloudfront.net/company/XHCPYp/images/5fabe72d-89bc-419d-8bd8-b12fdfdf04ad.png" style="display:block;height:auto;margin:0 auto;" width="200"/>
          </td></tr>
          <tr><td align="center" style="background:#c9a84c;padding:12px 20px;">
            <span style="font-family:'Outfit',Arial,sans-serif;font-size:13px;font-weight:700;color:#1a2e1a;letter-spacing:0.05em;">🍽️ FRESH MENU, READY WHEN YOU ARE</span>
          </td></tr>
          <tr><td style="padding:32px 36px 36px;">
            ${featuredDishBlock}

            <table border="0" cellpadding="0" cellspacing="0" style="margin:0 0 28px;" width="100%">
              <tr><td align="center">
                <p style="font-family:'Outfit',Arial,sans-serif;font-size:12px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#c9a84c;margin:0 0 2px;">All meals</p>
                <p style="font-family:'Cormorant Garamond',Georgia,serif;font-weight:600;font-size:44px;color:#1a2e1a;margin:0;line-height:1;">From £4.80</p>
              </td></tr>
            </table>

            <p style="font-family:'Outfit',Arial,sans-serif;font-size:13px;font-weight:700;color:#c9a84c;margin:0 0 16px;letter-spacing:0.02em;">
              🚚 We're now delivering nationwide!
            </p>
            <p style="font-family:'Outfit',Arial,sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:0.18em;color:#c9a84c;font-weight:600;margin:0 0 8px;">
              Come try us
            </p>
            <p style="font-family:'Cormorant Garamond',Georgia,serif;font-weight:600;font-size:28px;color:#1a2e1a;margin:0 0 20px;line-height:1.25;">
              Chef-made meals,<br/><em style="font-style:italic;">zero cooking required.</em>
            </p>
            <p style="font-family:'Outfit',Arial,sans-serif;font-size:15px;line-height:1.75;color:#333333;margin:0 0 20px;">
              Hey ${firstName}, we've got a fresh menu ready to go. Fresh ingredients, real
              flavour, ready to heat and eat — no chopping, no washing up. We deliver twice a
              week, so pick whichever day suits you.
            </p>

            ${menuBlock}

            ${urgentBanner}

            <table border="0" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border:1px solid #e8e0d0;border-radius:8px;" width="100%">
              <tr><td style="padding:20px 24px;">
                <table border="0" cellpadding="0" cellspacing="0" width="100%">
                  <tr><td style="padding:8px 0;font-family:'Outfit',Arial,sans-serif;font-size:14px;color:#1a2e1a;">
                    <strong>Wednesday delivery</strong> — order by ${wednesdayCutoffText}
                  </td></tr>
                  <tr><td style="padding:8px 0;font-family:'Outfit',Arial,sans-serif;font-size:14px;color:#1a2e1a;border-top:1px solid #e8e0d0;">
                    <strong>Sunday delivery</strong> — order by ${sundayCutoffText}
                  </td></tr>
                </table>
              </td></tr>
            </table>

            <table border="0" cellpadding="0" cellspacing="0" style="margin:0 0 10px;" width="100%">
              <tr><td align="center">
                <a href="${siteUrl}/menu" style="display:inline-block;background:#1a2e1a;border-radius:6px;padding:18px 32px;font-family:'Outfit',Arial,sans-serif;font-size:15px;font-weight:700;color:#f5f0e8;text-decoration:none;letter-spacing:0.04em;">Browse the Menu &rarr;</a>
              </td></tr>
            </table>

            <table border="0" cellpadding="0" cellspacing="0" width="100%">
              <tr><td style="border-top:1px solid #e8e0d0;padding-top:20px;">
                <p style="font-family:'Outfit',Arial,sans-serif;font-size:13px;color:#888888;line-height:1.75;margin:0;font-style:italic;">
                  Any questions, just reply here — I read every one.<br/><br/>
                  <span style="font-style:normal;color:#1a2e1a;font-weight:600;">&mdash; Bukr</span>
                </p>
              </td></tr>
            </table>
          </td></tr>
          <tr><td align="center" style="background:#1a2e1a;padding:24px 32px;">
            <img alt="prepcuisines" src="https://d3k81ch9hvuctc.cloudfront.net/company/XHCPYp/images/5fabe72d-89bc-419d-8bd8-b12fdfdf04ad.png" style="display:block;height:auto;margin:0 auto 14px;" width="150"/>
            <table border="0" cellpadding="0" cellspacing="0" style="margin:0 auto 14px;"><tr>
              <td style="padding:0 6px;">
                <a href="https://www.instagram.com/prepcuisines?igsi=M3Rsdno0YmVqOWtn&utm_source=qr" style="display:inline-block;width:34px;height:34px;line-height:34px;border-radius:50%;background:#c9a84c;text-align:center;font-family:'Outfit',Arial,sans-serif;font-size:11px;font-weight:800;color:#1a2e1a;text-decoration:none;">IG</a>
              </td>
              <td style="padding:0 6px;">
                <a href="https://www.tiktok.com/@prepcuisines?_r=1&_t=ZG-99PgwI4yizB" style="display:inline-block;width:34px;height:34px;line-height:34px;border-radius:50%;background:#c9a84c;text-align:center;font-family:'Outfit',Arial,sans-serif;font-size:11px;font-weight:800;color:#1a2e1a;text-decoration:none;">TT</a>
              </td>
            </tr></table>
            <p style="font-family:'Outfit',Arial,sans-serif;font-size:11px;color:rgba(245,240,232,0.4);margin:0;line-height:1.7;">Chef-made &middot; Fresh &middot; Delivered<br/><a href="${buildUnsubscribeUrl(toEmail)}" style="color:rgba(245,240,232,0.4);text-decoration:underline;">Unsubscribe</a></p>
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

// A genuinely plain-text style message - just a subject and body,
// simply formatted, not the flattened-image marketing template. For
// quick text-only announcements rather than a designed campaign.
export async function sendPlainTextBroadcastEmail(
  toEmail: string,
  subject: string,
  bodyText: string
) {
  const paragraphs = bodyText
    .split('\n')
    .map((line) => (line.trim() ? `<p style="margin:0 0 14px;">${line}</p>` : ''))
    .join('')

  await sendEmailViaNeo(
    toEmail,
    subject,
    `
    <table border="0" cellpadding="0" cellspacing="0" style="background:#f5f0e8;padding:32px 16px;" width="100%">
      <tr><td align="center">
        <table border="0" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#ffffff;border-radius:8px;padding:32px;" width="520">
          <tr><td style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#1a2e1a;">
            ${paragraphs}
          </td></tr>
        </table>
      </td></tr>
    </table>
    `
  )
}

// One-off: the whole hero is a single flattened image (built directly,
// not via HTML) - wrapped entirely in one link to the menu page, so
// tapping anywhere on the image takes them there. No separate clickable
// zones inside the image itself, since it's just one picture.
export async function sendFlattenedHeroEmailToCustomer(
  toEmail: string,
  imageUrl: string,
  subject: string
) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || ''
  await sendEmailViaNeo(
    toEmail,
    subject,
    `
    <table border="0" cellpadding="0" cellspacing="0" style="background:#1a2e1a;padding:32px 16px;" width="100%">
      <tr><td align="center">
        <table border="0" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;" width="600">
          <tr><td>
            <a href="${siteUrl}/menu" style="display:block;">
              <img src="${imageUrl}" alt="prepcuisines — Browse the menu" width="600" style="display:block;width:100%;height:auto;border:0;" />
            </a>
          </td></tr>
          <tr><td style="padding:20px 8px 0;">
            <p style="font-family:Arial,sans-serif;font-size:15px;line-height:1.7;color:#f5f0e8;margin:0;text-align:center;">
              Chef-made meals, zero cooking required. Fresh ingredients, real flavour,
              ready in just 2&ndash;3 minutes.
            </p>
          </td></tr>
          <tr><td align="center" style="padding:24px 8px 8px;">
            <a href="${siteUrl}/menu" style="font-family:Arial,sans-serif;font-size:15px;font-weight:700;color:#c9a84c;">Browse the menu &rarr;</a>
          </td></tr>
          <tr><td align="center" style="padding:20px 8px 0;">
            <p style="font-family:Arial,sans-serif;font-size:11px;color:rgba(245,240,232,0.4);margin:0;line-height:1.7;">
              Chef-made &middot; Fresh &middot; Delivered<br/>
              <a href="${buildUnsubscribeUrl(toEmail)}" style="color:rgba(245,240,232,0.4);text-decoration:underline;">Unsubscribe</a>
            </p>
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
