'use client'

import Script from 'next/script'
import { useEffect, useState } from 'react'

const ADS_ID = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID
const CONSENT_KEY = 'pc_ads_consent'

// Google Ads tag with Consent Mode v2. Everything starts denied; the visitor
// can allow ad measurement via the banner below. Nothing here is sent
// unless NEXT_PUBLIC_GOOGLE_ADS_ID is set.
//
// - ad_storage / ad_user_data: allowed only after "Accept" (lets Google tie a
//   purchase to the ad click).
// - ad_personalization: always denied (we do no remarketing).
// - analytics_storage: always denied (we do not use Google Analytics).
export default function GoogleAds() {
  const [showBanner, setShowBanner] = useState(false)

  useEffect(() => {
    if (!ADS_ID) return
    try {
      if (!localStorage.getItem(CONSENT_KEY)) setShowBanner(true)
    } catch {
      setShowBanner(true)
    }
  }, [])

  if (!ADS_ID) return null

  function choose(choice: 'granted' | 'denied') {
    try {
      localStorage.setItem(CONSENT_KEY, choice)
    } catch {
      // ignore
    }
    const w = window as any
    if (typeof w.gtag === 'function') {
      w.gtag('consent', 'update', {
        ad_storage: choice,
        ad_user_data: choice,
      })
    }
    setShowBanner(false)
  }

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
          var s = document.createElement('script');
          s.async = true;
          s.src = 'https://www.googletagmanager.com/gtag/js?id=${ADS_ID}';
          document.head.appendChild(s);
          window.__pcGoogleTagReady = true;
        `}
      </Script>
      {showBanner && (
        <div
          role="dialog"
          aria-label="Advertising measurement"
          style={{
            position: 'fixed',
            left: 12,
            right: 12,
            bottom: 12,
            zIndex: 9999,
            maxWidth: 560,
            margin: '0 auto',
            background: '#1c2b22',
            color: '#f5f2ec',
            borderRadius: 14,
            padding: '16px 18px',
            boxShadow: '0 8px 30px rgba(0,0,0,0.35)',
            fontSize: 14,
            lineHeight: 1.5,
          }}
        >
          <p style={{ margin: 0 }}>
            We use Google advertising cookies to measure which of our ads lead to orders.
            See our <a href="/privacy" style={{ color: '#d9b873' }}>privacy policy</a>.
          </p>
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <button
              onClick={() => choose('granted')}
              style={{ flex: 1, padding: '10px 14px', borderRadius: 100, border: 'none', background: '#d9b873', color: '#1c2b22', fontWeight: 700, cursor: 'pointer' }}
            >
              Accept
            </button>
            <button
              onClick={() => choose('denied')}
              style={{ flex: 1, padding: '10px 14px', borderRadius: 100, border: '1px solid rgba(245,242,236,0.4)', background: 'transparent', color: '#f5f2ec', fontWeight: 600, cursor: 'pointer' }}
            >
              Reject
            </button>
          </div>
        </div>
      )}
    </>
  )
}
