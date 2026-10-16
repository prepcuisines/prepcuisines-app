'use client'

import { useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { trackPurchase } from '@/lib/googleAds'

export default function ConversionTracker() {
  const pi = useSearchParams().get('pi')
  useEffect(() => {
    if (!pi) return
    fetch(`/api/purchase-conversion?pi=${encodeURIComponent(pi)}`)
      .then((r) => r.json())
      .then((d) => trackPurchase(d.conversion))
      .catch(() => {})
  }, [pi])
  return null
}
