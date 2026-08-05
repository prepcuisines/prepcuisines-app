'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'

// Shows once per visit, only to people who are genuinely still eligible
// for the welcome offer — anonymous visitors, or logged-in customers who
// haven't ordered yet. Anyone with a completed order or an active
// subscription never sees it, since offering them a "first week" discount
// would be misleading.
export default function WelcomeOfferPopup() {
  const [eligible, setEligible] = useState(false)
  const [pastHero, setPastHero] = useState(false)
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
    if (!hero) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) {
          setPastHero(true)
        }
      },
      { threshold: 0 }
    )
    observer.observe(hero)
    return () => observer.disconnect()
  }, [])

  if (!eligible || !pastHero || dismissed) return null

  return (
    <div className="pc-welcome-popup" role="dialog" aria-label="Welcome offer">
      <Link href="/menu" className="pc-welcome-popup-link">
        <div className="pc-welcome-popup-title">Get Offer</div>
        <div className="pc-welcome-popup-text">
          Get 40% off your 1st week + 20% off weeks 2 and 3
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
