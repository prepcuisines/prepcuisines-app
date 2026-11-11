'use client'

import { useState } from 'react'

const GREEN = '#1a2e1a'
const GOLD = '#c9a84c'
const CREAM = '#f5f0e8'

type Meal = { id: string; name: string; calories: number | null; protein: string | null; carbs: string | null; fat: string | null; allergens: string; image: string | null }

const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '12px 12px', borderRadius: 10, border: '1px solid #d8d2c4', fontSize: 16, fontFamily: 'inherit', background: '#fff', color: GREEN }

export default function TradeForm({ meals }: { meals: Meal[] }) {
  const [qty, setQty] = useState<Record<string, number>>({})
  const [f, setF] = useState({ business: '', contact: '', email: '', phone: '', address: '', notes: '', website: '' })
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle')
  const [error, setError] = useState('')

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((p) => ({ ...p, [k]: e.target.value }))
  const total = Object.values(qty).reduce((a, b) => a + b, 0)
  const bump = (id: string, d: number) => setQty((p) => ({ ...p, [id]: Math.max(0, (p[id] || 0) + d) }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setState('sending')
    try {
      const items = meals.filter((m) => qty[m.id] > 0).map((m) => ({ name: m.name, qty: qty[m.id] }))
      const res = await fetch('/api/trade-enquiry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...f, items }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Something went wrong, please try again.')
      setState('done')
    } catch (err: any) {
      setError(err.message || 'Something went wrong, please try again.')
      setState('idle')
    }
  }

  const page: React.CSSProperties = { minHeight: '100vh', background: CREAM, color: GREEN, fontFamily: 'Helvetica, Arial, sans-serif' }

  return (
    <main style={page}>
      <header style={{ background: GREEN, padding: 16, textAlign: 'center' }}>
        <span style={{ fontFamily: 'Georgia, serif', fontSize: 24, color: GOLD }}>prepcuisines</span>
      </header>

      <section style={{ maxWidth: 720, margin: '0 auto', padding: '28px 16px 8px', textAlign: 'center' }}>
        <h1 style={{ fontFamily: 'Georgia, serif', fontWeight: 400, fontSize: 32, lineHeight: 1.2, margin: '0 0 12px' }}>Chef-made, high-protein meals for your shelves</h1>
        <p style={{ fontSize: 17, lineHeight: 1.6, margin: '0 auto 8px', maxWidth: 560 }}>
          Fresh, chef-prepared meals, 100% halal, with full macros and allergens on every dish. Made in our own commercial kitchen in Stoke-on-Trent and delivered across the UK.
        </p>
        <p style={{ fontSize: 15, color: '#555', margin: 0 }}>Trade pricing on request. Pick a starting range below and we&apos;ll come back to you.</p>
      </section>

      {state === 'done' ? (
        <section style={{ maxWidth: 520, margin: '24px auto', padding: 24, background: '#fff', borderRadius: 16, textAlign: 'center' }}>
          <h2 style={{ fontFamily: 'Georgia, serif', fontWeight: 400, fontSize: 26, marginTop: 0 }}>Thank you</h2>
          <p style={{ lineHeight: 1.6 }}>We&apos;ve got your enquiry and will be in touch shortly with pricing and next steps.</p>
        </section>
      ) : (
        <form onSubmit={submit} style={{ maxWidth: 720, margin: '0 auto', padding: '16px 16px 60px' }}>
          <h2 style={{ fontFamily: 'Georgia, serif', fontWeight: 400, fontSize: 24, margin: '16px 0 10px' }}>Our meals</h2>
          <div style={{ display: 'grid', gap: 10 }}>
            {meals.map((m) => (
              <div key={m.id} style={{ background: '#fff', borderRadius: 14, padding: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
                {m.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.image} alt="" width={72} height={72} loading="lazy" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 10, flex: 'none' }} />
                ) : (
                  <div style={{ width: 72, height: 72, borderRadius: 10, background: CREAM, flex: 'none' }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.3 }}>{m.name}</div>
                  <div style={{ fontSize: 13, color: '#555', marginTop: 3 }}>
                    {m.calories ?? '–'} kcal · {m.protein ?? '–'}g protein · {m.carbs ?? '–'}g carbs · {m.fat ?? '–'}g fat
                  </div>
                  {m.allergens && <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>Contains: {m.allergens}</div>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 'none' }}>
                  <button type="button" aria-label={`Fewer ${m.name}`} onClick={() => bump(m.id, -10)} style={stepBtn}>−</button>
                  <span style={{ minWidth: 32, textAlign: 'center', fontWeight: 700 }}>{qty[m.id] || 0}</span>
                  <button type="button" aria-label={`More ${m.name}`} onClick={() => bump(m.id, 10)} style={stepBtn}>+</button>
                </div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 13, color: '#777', margin: '8px 2px 0' }}>Quantities are units per delivery, in steps of 10. Total picked: {total}.</p>

          <h2 style={{ fontFamily: 'Georgia, serif', fontWeight: 400, fontSize: 24, margin: '28px 0 10px' }}>Your details</h2>
          <div style={{ display: 'grid', gap: 10 }}>
            <input style={input} placeholder="Business name" value={f.business} onChange={set('business')} required />
            <input style={input} placeholder="Your name" value={f.contact} onChange={set('contact')} required />
            <input style={input} type="email" placeholder="Email" value={f.email} onChange={set('email')} required />
            <input style={input} type="tel" placeholder="Phone (optional)" value={f.phone} onChange={set('phone')} />
            <textarea style={{ ...input, minHeight: 80 }} placeholder="Delivery address (optional)" value={f.address} onChange={set('address')} />
            <textarea style={{ ...input, minHeight: 90 }} placeholder="Anything else? Stores, how often, packaging, labelling…" value={f.notes} onChange={set('notes')} />
            <input aria-hidden="true" tabIndex={-1} autoComplete="off" value={f.website} onChange={set('website')} style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }} />
          </div>
          {error && <p style={{ color: '#b3261e', marginTop: 12 }}>{error}</p>}
          <button type="submit" disabled={state === 'sending'} style={{ width: '100%', marginTop: 16, padding: '16px 12px', borderRadius: 12, border: 'none', background: GREEN, color: CREAM, fontSize: 17, fontWeight: 700, cursor: 'pointer', opacity: state === 'sending' ? 0.6 : 1 }}>
            {state === 'sending' ? 'Sending…' : 'Send enquiry'}
          </button>
          <p style={{ fontSize: 12, color: '#888', textAlign: 'center', marginTop: 10 }}>prepcuisines · Stoke-on-Trent · Company no. 16919312</p>
        </form>
      )}
    </main>
  )
}

const stepBtn: React.CSSProperties = { width: 36, height: 36, borderRadius: 18, border: `2px solid ${GREEN}`, background: '#fff', color: GREEN, fontSize: 20, fontWeight: 700, cursor: 'pointer', lineHeight: 1 }
