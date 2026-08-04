import Header from '../Header'

export default function OrderCompletePage() {
  return (
    <>
      <Header />
      <div className="pc-subscriber-confirm">
        <div className="pc-subscriber-confirm-wrapper">
          <div className="pc-mp-eyebrow" style={{ color: 'var(--pc-gold)' }}>All Set</div>
          <h1 className="pc-mp-title" style={{ color: 'var(--pc-cream)' }}>
            Your Order Is <em>Complete</em>
          </h1>
          <p className="pc-mp-subtitle" style={{ color: 'rgba(245,242,236,0.65)' }}>
            Please check your email for confirmation.
          </p>
          <a
            href="/dashboard"
            className="pc-subscriber-confirm-btn"
            style={{ textDecoration: 'none', display: 'inline-block', marginTop: 24 }}
          >
            Back to Account
          </a>
        </div>
      </div>
    </>
  )
}
