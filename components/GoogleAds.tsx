'use client'

import Script from 'next/script'
import { useEffect } from 'react'
import { CONSENT_CHANGED_EVENT, CONSENT_KEY, getConsent, type ConsentChoice } from '@/lib/consent'

const ADS_ID = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID

// Google Ads tag with Consent Mode v2. Everything starts denied, and Google's
// script (gtag.js) is not even downloaded until the visitor clicks "Accept" on
// the cookie banner (components/CookieBanner.tsx). Nothing here runs unless
// NEXT_PUBLIC_GOOGLE_ADS_ID is set.
//
// - ad_storage / ad_user_data: allowed only after "Accept" (lets Google tie a
//   purchase to the ad click).
// - ad_personalization: always denied (we do no remarketing).
// - analytics_storage: always denied (we do not use Google Analytics).
export default function GoogleAds() {
  useEffect(() => {
    if (!ADS_ID) return
    const loadGoogleTag = () => {
      if (document.getElementById('google-ads-gtag-js')) return
      const el = document.createElement('script')
      el.id = 'google-ads-gtag-js'
      el.async = true
      el.src = `https://www.googletagmanager.com/gtag/js?id=${ADS_ID}`
      document.head.appendChild(el)
    }
    if (getConsent() === 'granted') loadGoogleTag()
    const onChange = (e: Event) => {
      const choice = (e as CustomEvent<ConsentChoice>).detail
      const w = window as any
      if (typeof w.gtag === 'function') {
        w.gtag('consent', 'update', { ad_storage: choice, ad_user_data: choice })
      }
      if (choice === 'granted') loadGoogleTag()
    }
    window.addEventListener(CONSENT_CHANGED_EVENT, onChange)
    return () => window.removeEventListener(CONSENT_CHANGED_EVENT, onChange)
  }, [])

  if (!ADS_ID) return null

  return (
    <>
      <Script id="google-ads-tag" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          window.gtag = gtag;
          gtag('consent', 'default', {
            ad_storage: 'denied',
            ad_user_data: 'denied',
            ad_personalization: 'denied',
            analytics_storage: 'denied',
            wait_for_update: 500
          });
          try {
            if (localStorage.getItem('${CONSENT_KEY}') === 'granted') {
              gtag('consent', 'update', { ad_storage: 'granted', ad_user_data: 'granted' });
            }
          } catch (e) {}
          gtag('js', new Date());
          gtag('config', '${ADS_ID}', { allow_ad_personalization_signals: false });
          window.__pcGoogleTagReady = true;
        `}
      </Script>
    </>
  )
}
