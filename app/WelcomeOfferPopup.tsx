'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'

// Shows while scrolling through the page (hidden at the very top and very
// bottom), only to people who are genuinely still eligible for the welcome
// offer — anonymous visitors, or logged-in customers who haven't ordered
// yet. Anyone with a completed order or an active subscription never sees
// it, since offering them a "first week" discount would be misleading.
export default function WelcomeOfferPopup() {
  const [eligible, setEligible] = useState(false)
  const [showByScroll, setShowByScroll] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function checkEligibility() {
      try {
        const supabase = createClient()
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (!user) {
          if (!cancelled) setEligible(true)
          return
        }

        const { data: profile } = await supabase
          .from('customer_profiles')
          .select('subscription_status, orders_completed')
          .eq('id', user.id)
          .maybeSingle()

        const alreadyCustomer =
          !!profile && (profile.subscription_status === 'active' || (profile.orders_completed || 0) > 0)

        if (!cancelled) setEligible(!alreadyCustomer)
      } catch {
        // If the eligibility check fails for any reason, default to not
        // showing it — better to miss a shown popup than show a wrong offer.
        if (!cancelled) setEligible(false)
      }
    }

    checkEligibility()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const hero = document.getElementById('pc-hero')

    // Live scroll check, not a one-off flag — this way the popup hides
    // itself again if the visitor scrolls back to the very top, and also
    // hides at the very bottom of the page so it doesn't sit on top of
    // the footer with nowhere left to scroll.
    function updateVisibility() {
      const heroBottom = hero ? hero.getBoundingClientRect().bottom : 0
      const scrolledPastHero = heroBottom <= 0

      const atTop = window.scrollY <= 4
      const atBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4

      setShowByScroll(scrolledPastHero && !atTop && !atBottom)
    }

    updateVisibility()
    window.addEventListener('scroll', updateVisibility, { passive: true })
    window.addEventListener('resize', updateVisibility)
    return () => {
      window.removeEventListener('scroll', updateVisibility)
      window.removeEventListener('resize', updateVisibility)
    }
  }, [])

  if (!eligible || !showByScroll || dismissed) return null

  return (
    <div className="pc-welcome-popup" role="dialog" aria-label="Welcome offer">
      <Link href="/menu" className="pc-welcome-popup-link">
        <div className="pc-welcome-popup-title">Get Offer</div>
        <div className="pc-welcome-popup-text">
          Get 40% off your 1st week + 20% off your next 5 orders
        </div>
      </Link>
      <button
        className="pc-welcome-popup-close"
        aria-label="Dismiss offer"
        onClick={(e) => {
          e.preventDefault()
          setDismissed(true)
        }}
      >
        ×
      </button>
    </div>
  )
}
