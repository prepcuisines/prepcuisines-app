'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/client'

const CDN = 'https://cdn.shopify.com/s/files/1/0962/3348/8716/files'

function AccountIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2" />
      <path
        d="M4 20c0-4.418 3.582-7 8-7s8 2.582 8 7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

// Three lines when closed, an X when open — the standard pattern people
// already recognise, so tapping it needs no explanation.
function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      {open ? (
        <path
          d="M6 6l12 12M18 6L6 18"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      ) : (
        <path
          d="M4 6h16M4 12h16M4 18h16"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      )}
    </svg>
  )
}

export default function Header() {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    const supabase = createClient()

    supabase.auth.getUser().then(({ data }) => {
      setLoggedIn(!!data.user)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setLoggedIn(!!session?.user)
    })

    return () => subscription.unsubscribe()
  }, [])

  // Close the menu automatically if the screen is resized back up to
  // desktop width while it's open, so it can't get stuck open behind a
  // header that no longer needs it.
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 720) setMobileMenuOpen(false)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return (
    <header className="pc-nav">
      <div className="pc-nav-inner">
        <Link href="/" onClick={() => setMobileMenuOpen(false)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${CDN}/PrepCuisines_21_x_29.7_cm_2_x_1_in_12.png`}
            alt="prepcuisines"
            className="pc-logo-img"
          />
        </Link>
        <nav className="pc-nav-links">
          <Link href="/how-it-works">How It Works</Link>
          <Link href="/about">About</Link>
        </nav>
        <div className="pc-nav-right">
          {loggedIn !== null && (
            <Link href="/dashboard" className="pc-nav-account-btn">
              <AccountIcon />
              {loggedIn ? 'Account' : 'Sign In'}
            </Link>
          )}
          <Link href="/menu" className="pc-nav-cta">Order Now →</Link>
          <button
            type="button"
            className="pc-nav-mobile-toggle"
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen((open) => !open)}
          >
            <MenuIcon open={mobileMenuOpen} />
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <nav className="pc-nav-mobile-panel">
          <Link href="/how-it-works" onClick={() => setMobileMenuOpen(false)}>How It Works</Link>
          <Link href="/about" onClick={() => setMobileMenuOpen(false)}>About</Link>
          {loggedIn !== null && (
            <Link href="/dashboard" onClick={() => setMobileMenuOpen(false)}>
              {loggedIn ? 'Account' : 'Sign In'}
            </Link>
          )}
        </nav>
      )}
    </header>
  )
}
