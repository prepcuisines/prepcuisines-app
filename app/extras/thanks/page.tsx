'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

const GREEN = '#1a2e1a'
const GOLD = '#c9a84c'
const CREAM = '#f5f0e8'

function Inner() {
  const sessionId = useSearchParams().get('session_id')
  const [state, setState] = useState<'checking' | 'paid' | 'unpaid'>('checking')

  useEffect(() => {
    if (!sessionId) {
      setState('unpaid')
      return
    }
    fetch(`/api/extras/confirm?session_id=${encodeURIComponent(sessionId)}`)
      .then((r) => r.json())
      .then((d) => setState(d.paid ? 'paid' : 'unpaid'))
      .catch(() => setState('unpaid'))
  }, [sessionId])

  return (
    <main style={{ minHeight: '100vh', background: CREAM, color: GREEN, fontFamily: 'Helvetica, Arial, sans-serif' }}>
      <header style={{ background: GREEN, padding: 16, textAlign: 'center' }}>
        <span style={{ fontFamily: 'Georgia, serif', fontSize: 24, color: GOLD }}>prepcuisines</span>
      </header>
      <section style={{ maxWidth: 520, margin: '32px auto', padding: 24, background: '#fff', borderRadius: 16, textAlign: 'center' }}>
        {state === 'checking' && <p>Confirming your payment…</p>}
        {state === 'paid' && (
          <>
            <h1 style={{ fontFamily: 'Georgia, serif', fontWeight: 400, fontSize: 28, marginTop: 0 }}>You&apos;re all set</h1>
            <p style={{ lineHeight: 1.6 }}>Thank you, your payment went through and your extra meals are reserved. A confirmation email is on its way. We&apos;ll deliver to you in Stoke-on-Trent shortly.</p>
          </>
        )}
        {state === 'unpaid' && (
          <>
            <h1 style={{ fontFamily: 'Georgia, serif', fontWeight: 400, fontSize: 28, marginTop: 0 }}>We couldn&apos;t confirm this payment</h1>
            <p style={{ lineHeight: 1.6 }}>If you were charged, please message us and we&apos;ll sort it. Otherwise nothing has been taken.</p>
          </>
        )}
      </section>
    </main>
  )
}

export default function ExtrasThanks() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  )
}
