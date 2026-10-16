'use client'

import { useEffect, useState } from 'react'
import {
  CONSENT_OPEN_EVENT,
  getConsent,
  setConsent,
  type ConsentChoice,
} from '@/lib/consent'

const ADS_ID = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID
const META_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID

// One banner for all advertising measurement (Google Ads and Meta).
// Shown until the visitor chooses, and re-openable from the footer.
export default function CookieBanner() {
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState<ConsentChoice | null>(null)

  useEffect(() => {
    const c = getConsent()
    setCurrent(c)
    if (!c) setOpen(true)
    const reopen = () => {
      setCurrent(getConsent())
      setOpen(true)
    }
    window.addEventListener(CONSENT_OPEN_EVENT, reopen)
    return () => window.removeEventListener(CONSENT_OPEN_EVENT, reopen)
  }, [])

  if (!ADS_ID && !META_ID) return null
  if (!open) return null

  function choose(choice: ConsentChoice) {
    const previous = getConsent()
    setConsent(choice)
    setOpen(false)
    // Taking back a "yes": a loaded advertising script can't be unloaded, so
    // reload to make sure none of it keeps running.
    if (previous === 'granted' && choice === 'denied') window.location.reload()
  }

  return (
    <div
      role="dialog"
      aria-label="Advertising cookies"
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
        We use Google and Meta advertising cookies to measure which of our ads lead to
        orders. See our{' '}
        <a href="/privacy" style={{ color: '#d9b873' }}>privacy policy</a>.
        {current && <> You currently have advertising cookies <strong>{current === 'granted' ? 'allowed' : 'rejected'}</strong>.</>}
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
  )
}
