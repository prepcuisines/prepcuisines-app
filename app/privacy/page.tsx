import Header from '../Header'
import Footer from '../Footer'

export default function PrivacyPage() {
  return (
    <>
      <Header />
      <div className="pc-content-page">
        <div className="pc-content-wrapper">
          <div className="pc-mp-eyebrow">Legal</div>
          <h1 className="pc-mp-title">
            Privacy <em>Policy</em>
          </h1>
          <p className="pc-content-lede">
            Last updated: {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>

          <div className="pc-content-section">
            <h2>1. Who we are</h2>
            <p>
              prepcuisines (company registration number 16919312), of 102A
              Sun Street, Stoke-on-Trent, ST1 4JR, is the data controller
              responsible for your personal data described in this policy.
            </p>
          </div>

          <div className="pc-content-section">
            <h2>2. What we collect</h2>
            <p>When you create an account or place an order, we collect:</p>
            <ul>
              <li>Your name, email address, and phone number</li>
              <li>Your delivery address and any delivery instructions you provide</li>
              <li>Your order history, meal preferences, and favourite dishes</li>
              <li>
                Limited payment information needed to process transactions —
                we never see or store your full card details ourselves; this
                is handled directly by our payment provider, Stripe
              </li>
            </ul>
          </div>

          <div className="pc-content-section">
            <h2>3. How we use it</h2>
            <p>We use your information to:</p>
            <ul>
              <li>Prepare, charge for, and deliver your orders, including automatically fulfilling a delivery if you miss an ordering cutoff</li>
              <li>Manage your account and subscription</li>
              <li>Contact you about your orders, including if a payment fails</li>
              <li>Send you marketing communications, but only if you've opted in — you can opt out at any time</li>
              <li>Meet our legal and accounting obligations</li>
            </ul>
          </div>

          <div className="pc-content-section">
            <h2>4. Who we share it with</h2>
            <p>
              We share the minimum data necessary with trusted third parties
              who help us run prepcuisines, including our payment processor
              (Stripe), our database and hosting provider (Supabase), our
              email service (Resend), our address lookup service
              (getAddress.io), and our delivery courier. We do not sell your
              personal data to anyone.
            </p>
          </div>

          <div className="pc-content-section">
            <h2>5. How long we keep it</h2>
            <p>
              We keep your account and order data for as long as your
              account is active, and for a reasonable period afterwards to
              meet our legal, accounting, and tax obligations.
            </p>
          </div>

          <div className="pc-content-section">
            <h2>6. Your rights</h2>
            <p>Under UK data protection law, you have the right to:</p>
            <ul>
              <li>Access the personal data we hold about you</li>
              <li>Ask us to correct inaccurate data</li>
              <li>Ask us to delete your data, subject to our legal obligations</li>
              <li>Object to or restrict certain processing</li>
              <li>Withdraw consent to marketing at any time</li>
            </ul>
            <p>
              To exercise any of these rights, contact us at{' '}
              <a href="mailto:info@prepcuisines.co.uk">info@prepcuisines.co.uk</a>.
            </p>
          </div>

          <div className="pc-content-section">
            <h2>7. Cookies</h2>
            <p>
              Our website uses essential cookies needed to keep you logged
              in and to remember your order in progress. We do not currently
              use non-essential tracking or advertising cookies.
            </p>
          </div>

          <div className="pc-content-section">
            <h2>8. Changes to this policy</h2>
            <p>
              We may update this policy from time to time. Any changes will
              be posted on this page.
            </p>
          </div>

          <div className="pc-content-section">
            <h2>9. Contact and complaints</h2>
            <p>
              If you have any concerns about how we handle your data, please
              contact us first at{' '}
              <a href="mailto:info@prepcuisines.co.uk">info@prepcuisines.co.uk</a>.
              You also have the right to lodge a complaint with the
              Information Commissioner's Office (ICO) at ico.org.uk.
            </p>
          </div>
        </div>
      </div>
      <Footer />
    </>
  )
}
