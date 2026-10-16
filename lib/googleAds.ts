// Client-side helper that reports a confirmed purchase to Google Ads.
// Callers must only pass data that came from the server after Stripe
// confirmed payment (see lib/purchaseConversion.ts).

import type { PurchaseConversion } from './purchaseConversion'

const ADS_ID = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID
const PURCHASE_LABEL = process.env.NEXT_PUBLIC_GOOGLE_ADS_PURCHASE_LABEL

const SENT_KEY_PREFIX = 'pc_gads_purchase_'

function alreadySent(transactionId: string): boolean {
  try {
    return localStorage.getItem(SENT_KEY_PREFIX + transactionId) !== null
  } catch {
    return false
  }
}

function markSent(transactionId: string) {
  try {
    localStorage.setItem(SENT_KEY_PREFIX + transactionId, String(Date.now()))
  } catch {
    // Storage blocked: Google still de-duplicates on transaction_id.
  }
}

export function trackPurchase(conversion: PurchaseConversion | undefined | null) {
  if (!conversion || !ADS_ID || !PURCHASE_LABEL) return
  if (typeof window === 'undefined') return
  if (alreadySent(conversion.transactionId)) return

  // The Google tag is loaded after the page hydrates, and it must have set
  // its consent defaults before any event is queued. Wait for it to be ready.
  let attempts = 0
  const send = () => {
    const w = window as any
    if (typeof w.gtag !== 'function' || !w.__pcGoogleTagReady) {
      if (attempts++ < 40) setTimeout(send, 250)
      return
    }
    if (alreadySent(conversion.transactionId)) return
    w.gtag('event', 'conversion', {
      send_to: `${ADS_ID}/${PURCHASE_LABEL}`,
      value: conversion.value,
      currency: conversion.currency,
      transaction_id: conversion.transactionId,
    })
    markSent(conversion.transactionId)
  }
  send()
}
