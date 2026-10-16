'use client'

import Script from 'next/script'
import { useEffect, useState } from 'react'
import { CONSENT_CHANGED_EVENT, getConsent } from '@/lib/consent'

const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID

// The pixel only loads once the visitor has clicked "Accept" on the cookie
// banner. Nothing is requested from Meta before that. (The no-script image
// fallback was removed: visitors without JavaScript can't give consent.)
export default function MetaPixel() {
  const [allowed, setAllowed] = useState(false)

  useEffect(() => {
    setAllowed(getConsent() === 'granted')
    const onChange = () => setAllowed(getConsent() === 'granted')
    window.addEventListener(CONSENT_CHANGED_EVENT, onChange)
    return () => window.removeEventListener(CONSENT_CHANGED_EVENT, onChange)
  }, [])

  if (!META_PIXEL_ID || !allowed) return null

  return (
    <Script id="meta-pixel-base" strategy="afterInteractive">
      {`
        !function(f,b,e,v,n,t,s)
        {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
        n.callMethod.apply(n,arguments):n.queue.push(arguments)};
        if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
        n.queue=[];t=b.createElement(e);t.async=!0;
        t.src=v;s=b.getElementsByTagName(e)[0];
        s.parentNode.insertBefore(t,s)}(window, document,'script',
        'https://connect.facebook.net/en_US/fbevents.js');
        fbq('init', '${META_PIXEL_ID}');
        fbq('track', 'PageView');
      `}
    </Script>
  )
}
