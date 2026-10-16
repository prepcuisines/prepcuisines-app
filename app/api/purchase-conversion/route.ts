import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { buildPurchaseConversion } from '@/lib/purchaseConversion'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

// Used by /order-complete (the declined-card retry route), which is reached
// by a redirect carrying only a PaymentIntent id. The value and currency are
// read from Stripe here - never from the URL.
export async function GET(req: NextRequest) {
  const pi = req.nextUrl.searchParams.get('pi')
  if (!pi || !pi.startsWith('pi_')) return NextResponse.json({ conversion: null })
  try {
    const intent = await stripe.paymentIntents.retrieve(pi)
    const conversion = buildPurchaseConversion({
      transactionId: intent.id,
      amountMinorUnits: intent.amount_received || intent.amount,
      currency: intent.currency,
      createdUnix: intent.created,
      confirmedPaid: intent.status === 'succeeded',
    })
    return NextResponse.json({ conversion: conversion ?? null })
  } catch {
    return NextResponse.json({ conversion: null })
  }
}
