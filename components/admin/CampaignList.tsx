'use client'

import { useEffect, useRef, useState } from 'react'

type Template = { key: string; name: string; defaultSubject: string; intendedFor: string }
type Audience = { key: string; label: string; hint: string }
type Batch = {
  id: string
  batch_number: number
  recipient_count: number
  status: 'ready' | 'scheduled' | 'sending' | 'sent'
  scheduled_at: string | null
  started_at: string | null
  sent_at: string | null
  sent_count: number
  failed_count: number
  skipped_count?: number
}
type Campaign = {
  id: string
  name: string
  subject: string
  audience: string
  created_at: string
  email_campaign_batches: Batch[]
}

const GREEN = '#2d3510'
const pill = (active: boolean) => ({
  padding: '8px 14px',
  fontSize: 13.5,
  borderRadius: 20,
  border: active ? `1px solid ${GREEN}` : '1px solid #ccc',
  background: active ? GREEN : '#fff',
  color: active ? '#fff' : '#333',
  cursor: 'pointer' as const,
})
const primary = (disabled = false) => ({
  padding: '10px 18px',
  fontSize: 14,
  fontWeight: 600,
  borderRadius: 8,
  border: 'none',
  background: disabled ? '#bbb' : GREEN,
  color: '#fff',
  cursor: disabled ? ('default' as const) : ('pointer' as const),
})
const ghost = {
  padding: '8px 14px',
  fontSize: 13,
  borderRadius: 8,
  border: '1px solid #ccc',
  background: '#fff',
  color: '#333',
  cursor: 'pointer' as const,
}
const card = { border: '1px solid #e5e0d5', borderRadius: 12, padding: 20, marginBottom: 20, background: '#fff' }
const label = { fontSize: 13, fontWeight: 600, color: '#555', margin: '0 0 8px' }

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/London',
  })

// datetime-local wants "YYYY-MM-DDTHH:mm" in the browser's own time.
const toLocalInput = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function CampaignList({ kind, refreshKey }: { kind: 'marketing' | 'subscriber_reminder'; refreshKey: number }) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [sendingBatchId, setSendingBatchId] = useState<string | null>(null)
  const [batchMessage, setBatchMessage] = useState<Record<string, string>>({})
  const [scheduleFor, setScheduleFor] = useState<Record<string, string>>({})
  const stopRef = useRef(false)

  const load = async () => {
    const res = await fetch(`/api/admin/campaigns?kind=${kind}`, { cache: 'no-store' })
    const data = await res.json()
    if (res.ok) setCampaigns(data.campaigns || [])
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey])

  useEffect(() => {
    stopRef.current = false
    return () => {
      stopRef.current = true
    }
  }, [])

  const anyActive = campaigns.some((c) => c.email_campaign_batches.some((b) => b.status !== 'sent' && b.status !== 'ready'))
  useEffect(() => {
    if (!anyActive) return
    const t = setInterval(load, 20_000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anyActive])

  const sendNow = async (b: Batch) => {
    if (!confirm(`Send batch ${b.batch_number} to ${b.recipient_count} people now? This is a real send.`)) return
    setSendingBatchId(b.id)
    setBatchMessage((m) => ({ ...m, [b.id]: 'Starting…' }))
    stopRef.current = false
    // Each call sends ~45 seconds' worth; keep going until the batch is done.
    for (let i = 0; i < 30 && !stopRef.current; i++) {
      const res = await fetch('/api/admin/campaigns/send-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId: b.id }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setBatchMessage((m) => ({ ...m, [b.id]: data.error || 'Send stopped' }))
        break
      }
      await load()
      if (data.status === 'sent') {
        setBatchMessage((m) => ({ ...m, [b.id]: '' }))
        break
      }
      setBatchMessage((m) => ({ ...m, [b.id]: `Sending… ${data.remaining} left` }))
    }
    setSendingBatchId(null)
    load()
  }

  const schedule = async (b: Batch, when: string | null) => {
    const res = await fetch('/api/admin/campaigns/schedule-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batchId: b.id, scheduledAt: when ? new Date(when).toISOString() : null }),
    })
    const data = await res.json()
    setBatchMessage((m) => ({ ...m, [b.id]: res.ok ? '' : data.error || 'Could not schedule' }))
    if (res.ok) setScheduleFor((s) => ({ ...s, [b.id]: '' }))
    load()
  }

  // Default schedule time: an hour after the latest batch that's booked or gone out.
  const suggestTime = () => {
    let latest = Date.now()
    for (const c of campaigns)
      for (const b of c.email_campaign_batches) {
        const t = b.status === 'scheduled' ? b.scheduled_at : b.started_at
        if (t) latest = Math.max(latest, new Date(t).getTime())
      }
    const d = new Date(latest + 60 * 60_000)
    d.setSeconds(0, 0)
    return toLocalInput(d)
  }

  const deleteCampaign = async (c: Campaign) => {
    if (!confirm('Delete this campaign and its batches? Nothing has been sent.')) return
    await fetch(`/api/admin/campaigns?id=${c.id}`, { method: 'DELETE' })
    load()
  }

  return (
    <div>
      {/* Campaigns and their batches */}
      {campaigns.map((c) => {
        const batches = c.email_campaign_batches
        const total = batches.reduce((n, b) => n + b.recipient_count, 0)
        const sentTotal = batches.reduce((n, b) => n + (b.sent_count || 0), 0)
        const untouched = batches.every((b) => !b.started_at)
        return (
          <div key={c.id} style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <h3 style={{ fontSize: 16, margin: 0 }}>{c.name}</h3>
              <span style={{ fontSize: 13, color: '#777' }}>
                {sentTotal.toLocaleString()} of {total.toLocaleString()} sent
              </span>
            </div>
            <p style={{ fontSize: 13, color: '#777', margin: '4px 0 14px' }}>Subject: {c.subject}</p>

            {batches.map((b) => {
              const busy = sendingBatchId === b.id
              const msg = batchMessage[b.id]
              return (
                <div key={b.id} style={{ borderTop: '1px solid #f0ebe0', padding: '12px 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ fontSize: 14 }}>
                      <strong>Batch {b.batch_number}</strong>
                      <span style={{ color: '#777' }}> · {b.recipient_count} people</span>
                    </div>

                    {b.status === 'sent' && (
                      <span style={{ fontSize: 14, color: GREEN, fontWeight: 600 }}>
                        ✓ Sent {b.sent_count}
                        {b.failed_count ? ` (${b.failed_count} failed)` : ''}
                        {b.skipped_count ? ` · ${b.skipped_count} already ordered` : ''}
                        {b.sent_at ? ` · ${fmt(b.sent_at)}` : ''}
                      </span>
                    )}
                    {b.status === 'sending' && !busy && (
                      <span style={{ fontSize: 14, color: '#8a6d1a' }}>
                        Sending… {b.sent_count || 0} of {b.recipient_count}
                        <button style={{ ...ghost, marginLeft: 10 }} onClick={() => sendNow(b)}>
                          Continue
                        </button>
                      </span>
                    )}
                    {b.status === 'scheduled' && b.scheduled_at && (
                      <span style={{ fontSize: 14 }}>
                        Scheduled {fmt(b.scheduled_at)}
                        <button style={{ ...ghost, marginLeft: 10 }} onClick={() => schedule(b, null)}>
                          Cancel
                        </button>
                      </span>
                    )}
                    {b.status === 'ready' && !busy && (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button style={primary(!!sendingBatchId)} disabled={!!sendingBatchId} onClick={() => sendNow(b)}>
                          Send now
                        </button>
                        <button
                          style={ghost}
                          onClick={() => setScheduleFor((s) => ({ ...s, [b.id]: s[b.id] ? '' : suggestTime() }))}
                        >
                          Schedule
                        </button>
                      </div>
                    )}
                  </div>

                  {b.status === 'ready' && scheduleFor[b.id] && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                      <input
                        type="datetime-local"
                        value={scheduleFor[b.id]}
                        onChange={(e) => setScheduleFor((s) => ({ ...s, [b.id]: e.target.value }))}
                        style={{ padding: 8, fontSize: 14, borderRadius: 8, border: '1px solid #ccc' }}
                      />
                      <button style={primary()} onClick={() => schedule(b, scheduleFor[b.id])}>
                        Save
                      </button>
                    </div>
                  )}
                  {msg && <p style={{ fontSize: 13, color: busy ? '#666' : '#a33', margin: '8px 0 0' }}>{msg}</p>}
                </div>
              )
            })}

            {untouched && (
              <button style={{ ...ghost, marginTop: 8, color: '#a33' }} onClick={() => deleteCampaign(c)}>
                Delete campaign
              </button>
            )}
          </div>
        )
      })}

    </div>
  )
}
