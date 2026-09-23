'use client'

import { useEffect, useState } from 'react'
import CampaignList from './CampaignList'

type ReminderWindow = {
  windowId: string
  deliveryDay: string
  cutoff: string
  cutoffText: string
  cutoffTime: string
  notOrderedYet: number
}

const GREEN = '#2d3510'
const pill = (active: boolean) => ({
  padding: '10px 14px',
  fontSize: 13.5,
  borderRadius: 12,
  border: active ? `1px solid ${GREEN}` : '1px solid #ccc',
  background: active ? GREEN : '#fff',
  color: active ? '#fff' : '#333',
  cursor: 'pointer' as const,
  textAlign: 'left' as const,
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

type When = 'manual' | 'before24' | 'before3' | 'custom'

const toLocalInput = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const fmt = (d: Date) =>
  d.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })

export default function SubscriberRemindersPanel() {
  const [windows, setWindows] = useState<ReminderWindow[]>([])
  const [loading, setLoading] = useState(true)
  const [windowId, setWindowId] = useState('')
  const [reminderType, setReminderType] = useState<'reminder' | 'last_call'>('reminder')
  const [subject, setSubject] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [when, setWhen] = useState<When>('before24')
  const [customWhen, setCustomWhen] = useState('')
  const [creating, setCreating] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [testTo, setTestTo] = useState('')
  const [testMessage, setTestMessage] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const selected = windows.find((w) => w.windowId === windowId)

  const defaultSubject = (w: ReminderWindow | undefined, type: 'reminder' | 'last_call') =>
    !w
      ? ''
      : type === 'last_call'
        ? `Last call: your ${w.deliveryDay} menu closes ${w.cutoffText}`
        : `Pick your ${w.deliveryDay} meals before ${w.cutoffText}`

  const load = async () => {
    const res = await fetch('/api/admin/campaigns/reminder-windows', { cache: 'no-store' })
    const data = await res.json()
    if (res.ok) {
      setWindows(data.windows || [])
      if (!imageUrl && data.defaultImageUrl) setImageUrl(data.defaultImageUrl)
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pickWindow = (w: ReminderWindow) => {
    setWindowId(w.windowId)
    setSubject(defaultSubject(w, reminderType))
  }
  const pickType = (t: 'reminder' | 'last_call') => {
    setReminderType(t)
    setWhen(t === 'last_call' ? 'before3' : 'before24')
    setSubject(defaultSubject(selected, t))
  }

  const sendTime = (): Date | null => {
    if (!selected) return null
    const cutoff = new Date(selected.cutoff).getTime()
    if (when === 'before24') return new Date(cutoff - 24 * 3600_000)
    if (when === 'before3') return new Date(cutoff - 3 * 3600_000)
    if (when === 'custom' && customWhen) return new Date(customWhen)
    return null
  }
  const plannedTime = sendTime()
  const timeProblem =
    plannedTime && selected
      ? plannedTime.getTime() < Date.now()
        ? 'That time has already passed. Pick another, or choose "I\u2019ll send it myself".'
        : plannedTime.getTime() >= new Date(selected.cutoff).getTime()
          ? 'That time is after the cutoff.'
          : null
      : null

  const upload = async (file: File) => {
    setUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch('/api/admin/email-campaign-upload', { method: 'POST', body: fd })
    const data = await res.json()
    if (res.ok) setImageUrl(data.imageUrl)
    setUploading(false)
  }

  const create = async () => {
    if (!selected) return
    if (!confirm(`Create a ${reminderType === 'last_call' ? 'last call' : 'reminder'} for ${selected.notOrderedYet} subscribers?${plannedTime ? ` It will send ${fmt(plannedTime)}.` : ' Nothing sends until you tap Send now.'}`))
      return
    setCreating(true)
    setMessage(null)
    const res = await fetch('/api/admin/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'subscriber_reminder', windowId, reminderType, subject, imageUrl }),
    })
    const data = await res.json()
    if (!res.ok) {
      setCreating(false)
      setMessage(data.error || 'Something went wrong')
      return
    }

    // Timer: schedule each batch, an hour apart, starting at the chosen time.
    if (plannedTime) {
      const list = await fetch('/api/admin/campaigns?kind=subscriber_reminder', { cache: 'no-store' }).then((r) => r.json())
      const campaign = (list.campaigns || []).find((c: any) => c.id === data.campaignId)
      const batches = (campaign?.email_campaign_batches || []).slice().sort((a: any, b: any) => a.batch_number - b.batch_number)
      for (let i = 0; i < batches.length; i++) {
        const at = new Date(plannedTime.getTime() + i * 3600_000)
        const r = await fetch('/api/admin/campaigns/schedule-batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ batchId: batches[i].id, scheduledAt: at.toISOString() }),
        })
        if (!r.ok) {
          const e = await r.json().catch(() => ({}))
          setMessage(`Created, but batch ${i + 1} couldn't be scheduled: ${e.error || 'unknown error'}. Schedule it below.`)
          break
        }
      }
    }
    setCreating(false)
    setWindowId('')
    setRefreshKey((k) => k + 1)
    load()
  }

  const sendTest = async () => {
    if (!selected) return
    setTestMessage('Sending…')
    const res = await fetch('/api/admin/campaigns/reminder-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: testTo, subject, imageUrl, deliveryDay: selected.deliveryDay, cutoff: selected.cutoff, reminderType }),
    })
    const data = await res.json()
    setTestMessage(res.ok ? `Test sent to ${testTo}` : data.error || 'Send failed')
  }

  if (loading) return <p>Loading…</p>

  const previewSrc = selected
    ? `/api/admin/campaigns/reminder-preview?${new URLSearchParams({
        imageUrl,
        deliveryDay: selected.deliveryDay,
        cutoff: selected.cutoff,
        reminderType,
      }).toString()}`
    : ''

  return (
    <div>
      <div style={card}>
        <h2 style={{ fontSize: 18, margin: '0 0 16px' }}>Remind subscribers to order</h2>

        <p style={label}>Delivery</p>
        {windows.length === 0 && <p style={{ fontSize: 14, color: '#777' }}>No upcoming delivery with an open menu.</p>}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {windows.map((w) => (
            <button key={w.windowId} style={pill(windowId === w.windowId)} onClick={() => pickWindow(w)}>
              <strong>{w.deliveryDay}</strong>
              <br />
              <span style={{ fontSize: 12.5, opacity: 0.85 }}>
                Closes {w.cutoffText} · {w.notOrderedYet} not ordered yet
              </span>
            </button>
          ))}
        </div>

        {selected && (
          <>
            <p style={label}>Type</p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <button style={pill(reminderType === 'reminder')} onClick={() => pickType('reminder')}>
                Reminder
              </button>
              <button style={pill(reminderType === 'last_call')} onClick={() => pickType('last_call')}>
                Last call
              </button>
            </div>

            <p style={label}>Image</p>
            {imageUrl && (
              <img src={imageUrl} alt="" style={{ maxWidth: '100%', maxHeight: 180, borderRadius: 8, border: '1px solid #eee', marginBottom: 8 }} />
            )}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
              <input type="file" accept="image/*" disabled={uploading} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
              {uploading && <span style={{ fontSize: 13, color: '#888' }}>Uploading…</span>}
              {imageUrl && (
                <button style={ghost} onClick={() => setImageUrl('')}>
                  No image
                </button>
              )}
            </div>

            <p style={label}>Subject line</p>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              style={{ width: '100%', padding: 10, fontSize: 14, borderRadius: 8, border: '1px solid #ccc', marginBottom: 16, boxSizing: 'border-box' }}
            />

            <iframe
              key={previewSrc}
              src={previewSrc}
              title="Reminder preview"
              style={{ width: '100%', height: 480, border: '1px solid #eee', borderRadius: 8, marginBottom: 16 }}
            />

            <p style={label}>When</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <button style={pill(when === 'before24')} onClick={() => setWhen('before24')}>
                24 hrs before cutoff
              </button>
              <button style={pill(when === 'before3')} onClick={() => setWhen('before3')}>
                3 hrs before cutoff
              </button>
              <button
                style={pill(when === 'custom')}
                onClick={() => {
                  setWhen('custom')
                  if (!customWhen) setCustomWhen(toLocalInput(new Date(Date.now() + 3600_000)))
                }}
              >
                Pick a time
              </button>
              <button style={pill(when === 'manual')} onClick={() => setWhen('manual')}>
                I&apos;ll send it myself
              </button>
            </div>
            {when === 'custom' && (
              <input
                type="datetime-local"
                value={customWhen}
                onChange={(e) => setCustomWhen(e.target.value)}
                style={{ padding: 8, fontSize: 14, borderRadius: 8, border: '1px solid #ccc', marginBottom: 8 }}
              />
            )}
            <p style={{ fontSize: 13, color: timeProblem ? '#a33' : '#777', margin: '0 0 16px' }}>
              {timeProblem || (plannedTime ? `Sends ${fmt(plannedTime)}` : 'Nothing sends until you tap Send now.')}
            </p>

            <p style={{ fontSize: 13, color: '#777', margin: '0 0 12px' }}>
              Anyone who orders or skips before it goes out won&apos;t get it.
            </p>
            {message && <p style={{ fontSize: 13, color: '#a33' }}>{message}</p>}
            <button style={primary(creating || !!timeProblem || !subject)} disabled={creating || !!timeProblem || !subject} onClick={create}>
              {creating ? 'Setting up…' : plannedTime ? 'Schedule reminder' : 'Create reminder'}
            </button>

            <div style={{ borderTop: '1px solid #eee', marginTop: 20, paddingTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                placeholder="Your email for a test"
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
                style={{ flex: '1 1 200px', padding: 9, fontSize: 14, borderRadius: 8, border: '1px solid #ccc' }}
              />
              <button style={ghost} onClick={sendTest} disabled={!testTo}>
                Send test
              </button>
              {testMessage && <span style={{ fontSize: 13, color: '#666' }}>{testMessage}</span>}
            </div>
          </>
        )}
      </div>

      <CampaignList kind="subscriber_reminder" refreshKey={refreshKey} />
    </div>
  )
}
