import Link from 'next/link'
import Header from './Header'
import Footer from './Footer'
import WelcomeOfferPopup from './WelcomeOfferPopup'

const CDN = 'https://cdn.shopify.com/s/files/1/0962/3348/8716/files'

const marqueeItems = [
  'We make things that work better',
  'Crafted to nourish',
  'Designed with intention',
  'Where freshness comes first',
  'Fuelling real gains',
]

const steps = [
  { num: '01', title: 'Choose your meal plan', desc: 'Tailored to your goals & lifestyle', image: `${CDN}/ChatGPT_Image_Jul_14_2026_07_49_45_PM.png` },
  { num: '02', title: 'We get cheffing & cooking', desc: 'Fresh ingredients, expert preparation', image: '/cheffing-cooking.jpg' },
  { num: '03', title: 'Heat, eat, enjoy & repeat', desc: 'Ready in minutes, savoured for longer', image: `${CDN}/Photoroom_20250304_051535.jpg` },
  { num: '04', title: 'Embrace the gains', desc: 'Feel the difference from day one', image: '/embrace-the-gains.jpg' },
]
const plans = [
  { tag: 'Popular', name: 'Lean & Clean', desc: 'High protein, low calorie meals designed to help you cut without sacrificing taste or energy.', image: `${CDN}/ground-beef-pepper-rice-bowl-683x1024.webp` },
  { tag: 'Best Value', name: 'Bulk & Build', desc: 'High calorie, muscle-building meals packed with clean carbs and quality protein to fuel serious gains.', image: `${CDN}/4BAF6F67-DE09-434C-8BF7-E92FB7F2040A.jpg` },
  { tag: 'New', name: 'Simply Balanced', desc: 'Nutritious, well-rounded meals for those who want to eat well, feel great, and maintain a healthy lifestyle.', image: `${CDN}/ChatGPTImageJun15_2026_11_47_41PM.png` },
]

const testimonials = [
  { quote: "I've tried every meal prep service out there. Prepcuisines is the only one that actually tastes like real food. My macros have never been more on point.", name: 'Jack Tomlinson', role: 'customer · 8 months' },
  { quote: "Ordered for my son and in just 5 weeks he lost 6kg. Food quality is high and tastes amazing. Overall experience has been very positive.", name: 'Tam', role: 'customer · 4 months' },
  { quote: "Tried other options before but switched to prepcuisines because the food tastes unbelievable, is well priced and delivered conveniently. Really good options each week too and the portions are generous.", name: 'Theo', role: 'Experienced customer · 1 month' },
]

export default function Home() {
  const doubleMarquee = [...marqueeItems, ...marqueeItems]

  return (
    <div className="pc-wrap">
      <Header />

      <div className="pc-promo-strip">
        <div className="pc-promo-inner">
          <span className="pc-promo-tag">
            <span className="pc-dot" /> New Customers <span className="pc-dot" />
          </span>
          <span className="pc-promo-text">
            <strong>40% off</strong> your first order
            <span className="pc-promo-sep">·</span>
            Then <strong>20% off</strong> your next 7 orders!
          </span>
        </div>
      </div>

      {/* Hero — matches the current live draft: centered, HEAT / EAT & / ENJOY, no eyebrow, no trust bar */}
      <section className="pc-hero" id="pc-hero">
        <div className="pc-hero-bg">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${CDN}/prepcuisines_8.png`} alt="" className="pc-hero-bg-img" />
        </div>
        <div className="pc-hero-overlay" />
        <div className="pc-hero-content">
          <h1 className="pc-hero-title">
            HEAT
            <em className="pc-hero-title-italic">EAT &amp;</em>
            <span className="pc-hero-title-line3">ENJOY</span>
          </h1>
          <p className="pc-hero-sub">
            Meal preps crafted by chefs, delivered to your door.
            Freshness isn&apos;t a feature — it&apos;s our promise. حلال
          </p>
          <div className="pc-hero-actions">
            <Link href="/menu" className="pc-btn-primary">View Menu &amp; Order Now</Link>
          </div>
          <div className="pc-hero-stats">
            <div>
              <span className="pc-stat-num">5<sup>★</sup></span>
              <span className="pc-stat-label">Avg. rating</span>
            </div>
            <div>
              <span className="pc-stat-num">700<sup>+</sup></span>
              <span className="pc-stat-label">Meals weekly</span>
            </div>
          </div>
        </div>
        <div className="pc-hero-rule" />
      </section>

      {/* Trust bar removed — currently disabled on the live draft */}

      <div className="pc-marquee-section">
        <div className="pc-marquee-vignette" />
        <div className="pc-marquee-inner">
          <div className="pc-marquee-track">
            <div className="pc-mq-group">
              {doubleMarquee.map((text, i) => (
                <div className="pc-mq-item" key={i}>
                  <span className="pc-mq-text">{text}</span>
                  <span className="pc-mq-sep">◆</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <section className="pc-how-section">
        <div className="pc-section-eyebrow centered">Simple &amp; seamless</div>
        <h2 className="pc-section-title" style={{ textAlign: 'center' }}>How to <em>Order</em></h2>
        <p className="pc-section-subtitle" style={{ textAlign: 'center' }}>Four effortless steps between you and your next great meal</p>
        <div className="pc-how-grid" style={{ marginTop: 56 }}>
          {steps.map((step) => (
            <div className="pc-how-card" key={step.num}>
              <div className="pc-how-badge">
                <span className="pc-how-badge-num">{step.num}</span>
                <span className="pc-how-badge-label">Step</span>
              </div>
              <div className="pc-how-img">
                {step.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={step.image} alt={step.title} />
                ) : (
                  <div className="pc-how-img-placeholder" />
                )}
              </div>
              <div className="pc-how-content">
                <h3 className="pc-how-title">{step.title}</h3>
                <p className="pc-how-desc">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="pc-plans-section">
        <div className="pc-section-eyebrow centered">Built for your goals</div>
        <h2 className="pc-section-title" style={{ textAlign: 'center' }}>Choose your <em>plan</em></h2>
        <p className="pc-section-subtitle" style={{ textAlign: 'center' }}>Every macro counted. Every meal crafted. You just eat.</p>
        <div className="pc-plans-grid">
          {plans.map((plan, i) => (
            <div className={`pc-plan-card ${i === 0 ? 'featured' : ''}`} key={plan.name}>
              <div className="pc-plan-img">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={plan.image} alt={plan.name} />
                <span className={`pc-plan-tag ${i !== 0 ? 'light' : ''}`}>{plan.tag}</span>
              </div>
              <div className="pc-plan-body">
                <div className="pc-plan-name">{plan.name}</div>
                <p className="pc-plan-desc">{plan.desc}</p>
                <div className="pc-plan-footer">
                  <Link href="/menu" className={`pc-plan-btn ${i === 0 ? 'featured' : ''}`}>View Menu</Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="pc-testimonials-section">
        <div className="pc-section-eyebrow centered">Real customers. Real results.</div>
        <h2 className="pc-section-title" style={{ textAlign: 'center' }}>What our <em>community</em> says</h2>
        <div className="pc-testimonials-grid">
          {testimonials.map((t) => (
            <div className="pc-testimonial-card" key={t.name}>
              <div className="pc-testimonial-stars">
                {[...Array(5)].map((_, i) => <span className="pc-star" key={i}>★</span>)}
              </div>
              <p className="pc-testimonial-quote">&ldquo;{t.quote}&rdquo;</p>
              <div className="pc-testimonial-author">
                <div className="pc-testimonial-avatar">{t.name[0]}</div>
                <div>
                  <span className="pc-testimonial-name">{t.name}</span>
                  <span className="pc-testimonial-role">{t.role}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="pc-cta-section">
        <h2 className="pc-cta-title">Ready to start your <em>journey</em></h2>
        <p className="pc-cta-sub">Your first delivery is waiting. Premium meals, zero compromise.</p>
        <div className="pc-cta-actions">
          <Link href="/menu" className="pc-btn-primary">Get Started Today</Link>
        </div>
        <p className="pc-cta-note">No commitment · Skip any week</p>
      </section>
      <Footer />
      <WelcomeOfferPopup />
    </div>
  )
}
