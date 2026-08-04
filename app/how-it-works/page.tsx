import './how-it-works.css'
import Header from '../Header'
import Footer from '../Footer'

const steps = [
  {
    number: '01',
    icon: '📋',
    image: '/step1-choose-plan.jpg',
    title: 'Choose your plan',
    description:
      "Pick how many meals you'd like each week, add breakfasts and desserts if you fancy them, and choose Sunday or Wednesday delivery — or both, if you'd like two deliveries a week.",
  },
  {
    number: '02',
    icon: '🎉',
    image: '/step2-first-order.jpg',
    title: 'Your first order',
    description:
      "Your first box is discounted as a welcome offer. From your second order onwards, you'll get a loyalty discount for a few weeks before settling into our standard pricing — all clearly shown at checkout every time.",
  },
  {
    number: '03',
    icon: '⏰',
    image: '/step3-cutoff.jpg',
    title: 'Every week has a cutoff',
    description:
      "Each delivery day has an ordering cutoff. Order before it and you choose exactly what goes in your box that week. If you ever miss it, don't worry — see below.",
  },
  {
    number: '04',
    icon: '🔄',
    image: '/step4-delivery.jpg',
    title: 'Never miss a delivery',
    description:
      "If a cutoff passes and you haven't placed an order, we automatically fill your box from your favourite dishes (never anything you've marked as disliked) and charge your saved card, so your weekly delivery still arrives without you lifting a finger.",
  },
  {
    number: '05',
    icon: '⚙️',
    image: '/step5-skip-change.jpg',
    title: 'Skip, pause, or change any time',
    description:
      'Skip a single week, change your plan size, switch delivery days, or cancel altogether — all from your account, with no phone calls needed.',
  },
]

export default function HowItWorksPage() {
  return (
    <>
      <Header />
      <div className="pc-how">
        {/* HERO */}
        <div className="pc-how-hero">
          <div className="pc-how-eyebrow">Your Weekly Meal Plan</div>
          <h1>
            How It <em>Works</em>
          </h1>
          <p className="pc-how-hero-sub">
            Chef-made meals, delivered fresh every week — here's exactly how
            a prepcuisines subscription works, from your first order to
            every one after it.
          </p>
        </div>

        {/* STEPS */}
        <div className="pc-how-steps-wrap">
          <div className="pc-how-steps">
            {steps.map((step, i) => (
              <div
                className={`pc-how-row ${i % 2 === 1 ? 'reverse' : ''}`}
                key={step.number}
              >
                <div className="pc-how-panel">
                  {step.image ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={step.image} alt={step.title} className="pc-how-panel-photo" />
                  ) : (
                    <>
                      <span className="pc-how-panel-number">{step.number}</span>
                      <span className="pc-how-panel-icon">{step.icon}</span>
                    </>
                  )}
                </div>
                <div className="pc-how-row-text">
                  <div className="pc-how-step-eyebrow">Step {step.number}</div>
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="pc-how-cta">
          <div className="pc-how-cta-inner">
            <div className="pc-how-center-eyebrow">Ready?</div>
            <h2>
              Start Your <em>First Order</em>
            </h2>
            <p>Your first delivery is waiting. Premium meals, zero compromise.</p>
            <a href="/menu" className="pc-how-cta-btn">
              Get Started Today →
            </a>
          </div>
        </div>
      </div>
      <Footer />
    </>
  )
}
