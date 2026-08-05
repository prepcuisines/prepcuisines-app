// Small helper for sending transactional emails via Resend.
// Requires RESEND_API_KEY in .env.local — sign up at resend.com to get one.
// Uses their test/shared sending domain until you verify your own.

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

export async function sendOrderConfirmationEmailToCustomer(
  toEmail: string,
  firstName: string,
  amount: number,
  deliveryDay: string
) {
  await sendEmail(
    toEmail,
    'Your prepcuisines order is confirmed',
    `
      <p>Hi ${firstName},</p>
      <p>Your order is confirmed — £${amount.toFixed(2)} has been charged to your card
      for your ${deliveryDay} delivery.</p>
      <p>You can view your order any time from your account:</p>
      <p><a href="${process.env.NEXT_PUBLIC_SITE_URL}/order-history">View order history</a></p>
      <p>Thanks,<br/>prepcuisines</p>
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
