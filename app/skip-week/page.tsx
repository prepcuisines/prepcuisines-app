'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Header from '../Header'

type Info = {
  firstName: string | null
  deliveryDay: string
  cutoff: string
  cutoffPassed: boolean
  alreadyOrdered: boolean
  skipped: boolean
  active: boolean
}

function SkipContent() {
  const params = useSearchParams()
  const c = params.get('c') || ''
  const w = params.get('w') || ''
  const t = params.get('t') || ''

  const [info, setInfo] = useState<Info | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!c || !w || !t) return
    fetch(`/api/skip-week?c=${encodeURIComponent(c)}&w=${encodeURIComponent(w)}&t=${encodeURIComponent(t)}`)
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => (ok ? setInfo(d) : setError(d.error || 'Something went wrong')))
      .catch(() => setError('Network error — please try again'))
  }, [c, w, t])

  const setSkip = async (skip: boolean) => {
    setSaving(true)
    setError(null)
    const res = await fetch('/api/skip-week', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ c, w, t, skip }),
    })
    const d = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) return setError(d.error || 'Something went wrong')
    setInfo((i) => (i ? { ...i, skipped: skip } : i))
  }

  const cutoffText = info
    ? new Date(info.cutoff).toLocaleString('en-GB', {
        weekday: 'long',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: 'Europe/London',
      })
    : ''

  let title = 'Skip this week'
  let body = ''
  if (!c || !w || !t) body = 'This link looks incomplete or invalid.'
  else if (error && !info) body = error
  else if (!info) body = 'Loading…'
  else if (info.alreadyOrdered) body = "You've already placed an order for this delivery. You can cancel it from your Order History."
  else if (info.cutoffPassed) body = 'The cutoff for this delivery has passed, so it can no longer be skipped here.'
  else if (info.skipped) {
    title = 'This week is skipped'
    body = `You won't get a ${info.deliveryDay} box this week and you won't be charged. Your subscription carries on as normal after that.`
  } else
    body = `${info.firstName ? `${info.firstName}, skip` : 'Skip'} your ${info.deliveryDay} box? You won't be charged for it, and your subscription carries on as normal after that. You can undo this until ${cutoffText}.`

  const canAct = !!info && !info.alreadyOrdered && !info.cutoffPassed

  return (
    <div className="pc-account">
      <div className="pc-account-wrapper">
        <div className="pc-account-header">
          <h1 className="pc-mp-title">{title}</h1>
          <p className="pc-mp-subtitle">{body}</p>
        </div>
        {canAct && !info!.skipped && (
          <button className="pc-checkout-btn primary" disabled={saving} onClick={() => setSkip(true)}>
            {saving ? 'Saving…' : 'Yes, skip this week'}
          </button>
        )}
        {canAct && info!.skipped && (
          <button className="pc-checkout-btn primary" disabled={saving} onClick={() => setSkip(false)}>
            {saving ? 'Saving…' : 'Undo, I want my box'}
          </button>
        )}
        {info && !info.skipped && (
          <p className="pc-mp-subtitle" style={{ marginTop: 20 }}>
            Changed your mind? <a href="/menu">Pick your meals instead</a>
          </p>
        )}
        {error && info && <div className="pc-account-error">{error}</div>}
      </div>
    </div>
  )
}

export default function SkipWeekPage() {
  return (
    <>
      <Header />
      <Suspense fallback={null}>
        <SkipContent />
      </Suspense>
    </>
  )
}
