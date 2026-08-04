import Header from '../Header'
import Footer from '../Footer'

export default function TermsPage() {
  return (
    <>
      <Header />
      <div className="pc-content-page">
        <div className="pc-content-wrapper">
          <div className="pc-mp-eyebrow">Legal</div>
          <h1 className="pc-mp-title">
            Terms &amp; <em>Conditions</em>
          </h1>
          <p className="pc-content-lede">
            Last updated: {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>

          <div className="pc-content-section">
            <h2>1. Who we are</h2>
            <p>
              prepcuisines (company registration number 16919312) operates
              from 102A Sun Street, Stoke-on-Trent, ST1 4JR. These terms
              apply whenever you place an order or hold a subscription with
              us, whether through our website or by any other means we make
              available.
            </p>
          </div>

          <div className="pc-content-section">
            <h2>2. Your eligibility to order</h2>
            <p>
              By placing an order or subscribing to our Service, you confirm
              that you are at least 18 years old, legally able to enter into
              a binding contract, and accessing our website from within the
              United Kingdom.
            </p>
          </div>

          <div className="pc-content-section">
            <h2>3. Your subscription</h2>
            <p>
              A prepcuisines subscription gives you a weekly (or twice-weekly,
              if selected) delivery of meals you choose from our menu. You
              can change your plan size, delivery day, and meal choices at
              any time from your account, subject to each week's ordering
              cutoff.
            </p>
          </div>

          <div className="pc-content-section">
            <h2>4. Ordering cutoffs and automatic fulfilment</h2>
            <p>
              Each delivery day has a published ordering cutoff. If you place
              an order before the cutoff, you choose exactly what's included.
              If the cutoff passes without you placing an order, and your
              subscription is active, we will automatically select meals on
              your behalf (prioritising dishes you've marked as favourites,
              and never anything you've marked as disliked) and charge your
              saved payment method for that delivery, at your current pricing
              tier.
            </p>
            <p>
              You can skip an upcoming delivery, or cancel your subscription
              entirely, at any time from your account before the relevant
              cutoff.
            </p>
          </div>

          <div className="pc-content-section">
            <h2>5. Pricing and payment</h2>
            <p>
              Prices, applicable discounts, and delivery fees are shown to
              you before you confirm each order, and include VAT where
              applicable. By maintaining an active subscription and a saved
              payment method, you authorise us to charge that payment method
              automatically for each delivery, including deliveries fulfilled
              automatically under Section 4.
            </p>
          </div>

          <div className="pc-content-section">
            <h2>6. Your right to cancel</h2>
            <p>
              You may cancel your subscription, skip a delivery, or request a
              refund for an individual order at any time before that
              delivery's ordering cutoff. Once the cutoff has passed,
              whether you placed the order yourself or it was fulfilled
              automatically under Section 4, we begin preparing your meals
              specifically for you, and the order can no longer be cancelled
              or refunded — except where the goods are faulty, not as
              described, or otherwise as required by law.
            </p>
          </div>

          <div className="pc-content-section">
            <h2>7. Delivery</h2>
            <p>
              We deliver to the address held on your account at the time
              each order is placed or automatically fulfilled. If you
              provide delivery instructions (such as requesting we leave
              your order in a specified safe place), you accept that we and
              our courier will follow those instructions, and that
              responsibility for the condition or security of your order
              once left in accordance with your instructions passes to you
              at that point.
            </p>
          </div>

          <div className="pc-content-section">
            <h2>8. Allergens and dietary information</h2>
            <p>
              Allergen information is displayed against each dish on our
              menu. It is your responsibility to review this information
              before ordering, particularly if you or anyone eating the meal
              has a food allergy or intolerance. If you have any doubt,
              please contact us before ordering.
            </p>
          </div>

          <div className="pc-content-section">
            <h2>9. Our products</h2>
            <p>
              Images of our dishes are for illustrative purposes only —
              actual meals may vary slightly in appearance, as food naturally
              does. Once your order is delivered, you are responsible for
              storing, reheating, and preparing it correctly, and we accept
              no liability for loss, illness, or injury arising from
              incorrect storage or preparation after delivery.
            </p>
          </div>

          <div className="pc-content-section">
            <h2>10. Refunds</h2>
            <p>
              We will offer an appropriate refund where an order arrives
              damaged, is missing items, or does not arrive at all, provided
              you contact us within a reasonable time of the delivery. Beyond
              these circumstances, refunds are governed by Section 6 above.
            </p>
          </div>

          <div className="pc-content-section">
            <h2>11. Suspected fraud or misuse</h2>
            <p>
              We may decline to accept an order, suspend an account, or
              refuse a subscription where we reasonably suspect fraud, misuse
              of a discount or promotional offer, or a breach of these terms,
              including creating multiple accounts at the same address to
              claim an offer more than once.
            </p>
          </div>

          <div className="pc-content-section">
            <h2>12. Our liability</h2>
            <p>
              We are responsible for loss or damage you suffer that is a
              foreseeable result of our breaking these terms or acting
              without reasonable care and skill, but we are not responsible
              for any loss or damage that is not foreseeable. Nothing in
              these terms limits our liability for death or personal injury
              caused by our negligence, fraud, or any other liability which
              cannot be limited or excluded by law.
            </p>
          </div>

          <div className="pc-content-section">
            <h2>13. Events outside our control</h2>
            <p>
              We are not liable for any failure or delay in performing our
              obligations that is caused by events outside our reasonable
              control, including severe weather, transport disruption, or
              supplier shortages. We will let you know as soon as reasonably
              possible if this affects your delivery.
            </p>
          </div>

          <div className="pc-content-section">
            <h2>14. Intellectual property</h2>
            <p>
              All content on our website, including text, recipes, and
              images, belongs to us or our licensors and is protected by
              copyright. If you leave a public review or comment about our
              Products or Service, you agree that we may quote it on our
              website or in our marketing.
            </p>
          </div>

          <div className="pc-content-section">
            <h2>15. Changes to these terms</h2>
            <p>
              We may update these terms from time to time. Continuing to use
              your subscription after changes are published means you accept
              the updated terms.
            </p>
          </div>

          <div className="pc-content-section">
            <h2>16. Severability and entire agreement</h2>
            <p>
              If any part of these terms is found to be unenforceable, the
              remaining terms will continue to apply in full. These terms
              represent the entire agreement between you and us regarding
              our Products and Service.
            </p>
          </div>

          <div className="pc-content-section">
            <h2>17. Governing law</h2>
            <p>
              These terms are governed by the law of England and Wales, and
              any disputes will be handled by the courts of England and
              Wales.
            </p>
          </div>

          <div className="pc-content-section">
            <h2>18. Contact</h2>
            <p>
              Questions about these terms can be sent to{' '}
              <a href="mailto:info@prepcuisines.co.uk">info@prepcuisines.co.uk</a>.
            </p>
          </div>
        </div>
      </div>
      <Footer />
    </>
  )
}
