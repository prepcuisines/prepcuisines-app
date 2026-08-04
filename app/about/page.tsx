import './about.css'
import Header from '../Header'
import Footer from '../Footer'

export default function AboutPage() {
  return (
    <>
      <Header />
      <div className="pc-about">
        {/* HERO */}
        <div className="pc-about-hero">
          <div className="pc-about-eyebrow">Our Story</div>
          <h1>
            Where <em>Freshness</em>
            <br />
            Comes First
          </h1>
          <p className="pc-about-hero-sub">
            A family-run kitchen with one obsession — food that's genuinely
            fresh, genuinely nourishing.
          </p>
        </div>

        {/* STORY */}
        <div className="pc-about-story-wrap">
          <div className="pc-about-story">
            <div className="pc-about-story-img">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/kitchen.jpg"
                alt="prepcuisines kitchen"
              />
              <div className="pc-about-story-badge">📍 Stoke-on-Trent · Delivered Nationwide</div>
            </div>
            <div>
              <div className="pc-about-section-eyebrow">How it started</div>
              <h2>
                From the <em>Home Kitchen</em>
                <br />
                to a Dedicated Shop
              </h2>
              <p>
                prepcuisines started exactly where you'd expect — a home
                kitchen, a Sunday routine, and a genuine belief that eating
                well shouldn't mean spending your whole week cooking.
              </p>
              <p>
                What began as a small local operation quickly grew into
                something bigger. Word spread, orders grew, and we moved into
                our own dedicated shop — but the ethos never changed. Every
                meal is still cooked properly fresh, never frozen, and
                delivered straight to your door.
              </p>
              <p>
                We're family-run, we're hands-on, and we genuinely care about
                what goes on your plate. No batching meals days in advance.
                No shortcuts. Just real food, made properly.
              </p>
            </div>
          </div>
        </div>

        {/* VALUES */}
        <div className="pc-about-values">
          <div className="pc-about-values-inner">
            <div className="pc-about-values-header">
              <div className="pc-about-center-eyebrow">What drives us</div>
              <h2 className="pc-about-section-title">
                Our <em>Values</em>
              </h2>
              <p className="pc-about-section-sub">
                Everything we do is built around three things.
              </p>
            </div>
            <div className="pc-about-values-grid">
              <div className="pc-about-value-card">
                <div className="pc-about-value-icon">🥗</div>
                <h3>Freshness First</h3>
                <p>
                  We cook every meal properly fresh, never frozen, never
                  batch-cooked days in advance — freshness isn't a selling
                  point, it's the whole point.
                </p>
              </div>
              <div className="pc-about-value-card">
                <div className="pc-about-value-icon">👨‍🍳</div>
                <h3>Chef-Made Quality</h3>
                <p>
                  Our recipes are designed for real flavour and real
                  nutrition. We use quality ingredients, cook from scratch,
                  and refuse to compromise on taste or macros.
                </p>
              </div>
              <div className="pc-about-value-card">
                <div className="pc-about-value-icon">❤️</div>
                <h3>Community Focused</h3>
                <p>
                  We started local, and now deliver nationwide — but we take
                  that responsibility just as seriously, treating every
                  customer like we know them by name, not just by order
                  number.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* STATS */}
        <div className="pc-about-stats">
          <div className="pc-about-stats-grid">
            <div className="pc-about-stat-item">
              <span className="pc-about-stat-number">1000+</span>
              <span className="pc-about-stat-label">Meals weekly</span>
            </div>
            <div className="pc-about-stat-item">
              <span className="pc-about-stat-number">5★</span>
              <span className="pc-about-stat-label">Avg. rating</span>
            </div>
            <div className="pc-about-stat-item">
              <span className="pc-about-stat-number">UK</span>
              <span className="pc-about-stat-label">Nationwide delivery</span>
            </div>
            <div className="pc-about-stat-item">
              <span className="pc-about-stat-number">100%</span>
              <span className="pc-about-stat-label">Fresh, never frozen</span>
            </div>
          </div>
        </div>

        {/* PROMISE */}
        <div className="pc-about-promise">
          <div className="pc-about-promise-inner">
            <div className="pc-about-promise-img">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/promise-bowls.jpg"
                alt="Fresh meal prep"
              />
            </div>
            <div>
              <div className="pc-about-section-eyebrow">Our promise</div>
              <h2>
                Better Than Any <em>Competitor</em>
                <br />
                Out There
              </h2>
              <p>
                Most meal prep companies cook in bulk days before delivery.
                By the time it reaches you, it's already been sitting in a
                fridge for two or three days.
              </p>
              <p>
                We do things differently. Every order is cooked properly
                fresh, never frozen, and delivered straight to your door.
                That's the prepcuisines difference.
              </p>
              <ul className="pc-about-promise-list">
                <li>Cooked properly fresh, never frozen, every week</li>
                <li>No preservatives, no frozen meals, no compromises</li>
                <li>Precise macros — every calorie and gram counted</li>
                <li>No commitment — skip or cancel any week</li>
              </ul>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="pc-about-cta">
          <div className="pc-about-cta-inner">
            <div className="pc-about-center-eyebrow" style={{ justifyContent: 'center', display: 'flex' }}>
              Ready?
            </div>
            <h2>
              Start Your <em>Journey</em>
              <br />
              This Sunday
            </h2>
            <p>Your first delivery is waiting. Premium meals, zero compromise.</p>
            <a href="/menu" className="pc-about-cta-btn">
              Get Started Today →
            </a>
          </div>
        </div>
      </div>
      <Footer />
    </>
  )
}
