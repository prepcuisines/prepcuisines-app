import Link from 'next/link'

export default function Footer() {
  return (
    <footer className="pc-footer">
      <div className="pc-footer-inner">
        <div className="pc-footer-brand">prepcuisines</div>
        <nav className="pc-footer-links">
          <Link href="/how-it-works">How It Works</Link>
          <Link href="/about">About</Link>
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/terms">Terms &amp; Conditions</Link>
        </nav>
        <div className="pc-footer-details">
          <p>prepcuisines, 102A Sun Street, Stoke-on-Trent, ST1 4JR</p>
        </div>
        <p className="pc-footer-copyright">
          &copy; {new Date().getFullYear()} prepcuisines. All rights reserved.
        </p>
      </div>
    </footer>
  )
}
