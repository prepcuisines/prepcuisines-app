'use client'

import { useEffect, useState } from 'react'

type ScheduledSend = {
  id: string
  scheduled_at: string
  sent: boolean
  sent_at: string | null
  result: any
}

export default function EmailMarketingPanel() {
  const [imageUrl, setImageUrl] = useState('')
  const [subject, setSubject] = useState('')
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const [testEmail, setTestEmail] = useState('')
  const [sendingTest, setSendingTest] = useState(false)
  const [testMessage, setTestMessage] = useState<string | null>(null)

  const [sendingNow, setSendingNow] = useState(false)
  const [sendNowMessage, setSendNowMessage] = useState<string | null>(null)

  const [scheduled, setScheduled] = useState<ScheduledSend[]>([])
  const [newScheduleDate, setNewScheduleDate] = useState('')
  const [newScheduleTime, setNewScheduleTime] = useState('')
  const [addingSchedule, setAddingSchedule] = useState(false)

  const loadSettings = async () => {
    setLoading(true)
    const res = await fetch('/api/admin/email-campaign')
    if (res.ok) {
      const data = await res.json()
      setImageUrl(data.imageUrl || '')
      setSubject(data.subject || '')
    }
    setLoading(false)
  }

  const loadScheduled = async () => {
    const res = await fetch('/api/admin/scheduled-sends')
    if (res.ok) {
      const data = await res.json()
      setScheduled(data.scheduled || [])
    }
  }

  useEffect(() => {
    loadSettings()
    loadScheduled()
  }, [])

  const handleImageUpload = async (file: File) => {
    setUploading(true)
    setMessage(null)
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch('/api/admin/email-campaign-upload', { method: 'POST', body: formData })
    if (res.ok) {
      const data = await res.json()
      setImageUrl(data.imageUrl)
      setMessage('Image uploaded — click Save to make it live.')
    } else {
      setMessage('Upload failed — try again.')
    }
    setUploading(false)
  }

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)
    const res = await fetch('/api/admin/email-campaign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageUrl, subject }),
    })
    if (res.ok) {
      setMessage('Saved — this is now what goes out on every send.')
      setTimeout(() => setMessage(null), 4000)
    } else {
      setMessage('Save failed — try again.')
    }
    setSaving(false)
  }

  const handleSendTest = async () => {
    if (!testEmail) {
      setTestMessage('Enter an email address first.')
      return
    }
    setSendingTest(true)
    setTestMessage(null)
    const res = await fetch(
      `/api/admin/send-test-reminder-email?to=${encodeURIComponent(testEmail)}&kind=flattened`
    )
    if (res.ok) {
      setTestMessage(`Test sent to ${testEmail}.`)
    } else {
      setTestMessage('Test send failed — try again.')
    }
    setSendingTest(false)
  }

  const handleSendNow = async () => {
    if (!confirm('Send one live batch right now, to everyone currently due? This is a real send, not a test.')) return
    setSendingNow(true)
    setSendNowMessage(null)
    try {
      const res = await fetch('/api/admin/run-weekly-reminders')
      const data = await res.json()
      setSendNowMessage(`Batch sent. ${JSON.stringify(data.results ? data.results.length : data)} — check the numbers below shortly.`)
    } catch {
      setSendNowMessage('Request sent, but no confirmation came back — check with your team before sending again to avoid double-sending.')
    }
    setSendingNow(false)
  }

  const handleAddSchedule = async () => {
    if (!newScheduleDate || !newScheduleTime) {
      setMessage('Pick a date and time first.')
      return
    }
    setAddingSchedule(true)
    const localDateTime = new Date(`${newScheduleDate}T${newScheduleTime}:00`)
    const res = await fetch('/api/admin/scheduled-sends', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduledAt: localDateTime.toISOString() }),
    })
    if (res.ok) {
      await loadScheduled()
      setNewScheduleDate('')
      setNewScheduleTime('')
    }
    setAddingSchedule(false)
  }

  const handleCancelSchedule = async (id: string) => {
    await fetch(`/api/admin/scheduled-sends?id=${id}`, { method: 'DELETE' })
    await loadScheduled()
  }

  return (
    <div style={{ maxWidth: 700, padding: '0 0 60px' }}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Email Marketing</h1>
      <p style={{ color: '#666', fontSize: 14, marginBottom: 24 }}>
        Full control over the invite/leads email — no code changes or waiting on me needed for any
        of this. Change the image or subject any time; it applies to every send from that point on,
        test sends included.
      </p>

      {loading ? (
        <p>Loading…</p>
      ) : (
        <>
          <div style={{ marginBottom: 28 }}>
            <h3 style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#8a7a4a', marginBottom: 10 }}>
              Current image
            </h3>
            {imageUrl && (
              <img
                src={imageUrl}
                alt="Current campaign hero"
                style={{ maxWidth: '100%', maxHeight: 300, borderRadius: 8, marginBottom: 10, border: '1px solid #eee' }}
              />
            )}
            <div>
              <input
                type="file"
                accept="image/*"
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleImageUpload(file)
                }}
              />
              {uploading && <span style={{ marginLeft: 10, fontSize: 13, color: '#888' }}>Uploading…</span>}
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#8a7a4a', marginBottom: 8 }}>
              Subject line
            </h3>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              style={{ width: '100%', padding: 10, border: '1px solid #ccc', borderRadius: 6, fontSize: 14 }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{ padding: '10px 22px', background: '#2d3510', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}
            >
              {saving ? 'Saving…' : 'Save — make this live'}
            </button>
            {message && <span style={{ fontSize: 13, color: '#2d3510' }}>{message}</span>}
          </div>

          <div style={{ marginBottom: 32, paddingTop: 20, borderTop: '1px solid #eee' }}>
            <h3 style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#8a7a4a', marginBottom: 10 }}>
              Test run
            </h3>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="email"
                placeholder="your@email.com"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                style={{ padding: 10, border: '1px solid #ccc', borderRadius: 6, fontSize: 14, flex: 1, minWidth: 200 }}
              />
              <button
                onClick={handleSendTest}
                disabled={sendingTest}
                style={{ padding: '10px 20px', background: '#fff', border: '1px solid #2d3510', color: '#2d3510', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}
              >
                {sendingTest ? 'Sending…' : 'Send test'}
              </button>
            </div>
            {testMessage && <p style={{ fontSize: 13, color: '#2d3510', marginTop: 8 }}>{testMessage}</p>}
          </div>

          <div style={{ marginBottom: 32, paddingTop: 20, borderTop: '1px solid #eee' }}>
            <h3 style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#8a7a4a', marginBottom: 10 }}>
              Send now
            </h3>
            <p style={{ fontSize: 13, color: '#888', marginBottom: 10 }}>
              Fires one real batch immediately (up to 400 people, same limit and dedup as every
              other send — safe to use even if a scheduled run already went out this hour).
            </p>
            <button
              onClick={handleSendNow}
              disabled={sendingNow}
              style={{ padding: '10px 22px', background: '#a03030', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}
            >
              {sendingNow ? 'Sending…' : 'Send one batch now'}
            </button>
            {sendNowMessage && <p style={{ fontSize: 13, color: '#333', marginTop: 8 }}>{sendNowMessage}</p>}
          </div>

          <div style={{ paddingTop: 20, borderTop: '1px solid #eee' }}>
            <h3 style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#8a7a4a', marginBottom: 10 }}>
              Schedule a batch
            </h3>
            <p style={{ fontSize: 13, color: '#888', marginBottom: 10 }}>
              Picks a specific date/time for one batch to fire automatically — checked every 15
              minutes, so it'll go out within 15 minutes of the time you set.
            </p>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
              <input
                type="date"
                value={newScheduleDate}
                onChange={(e) => setNewScheduleDate(e.target.value)}
                style={{ padding: 10, border: '1px solid #ccc', borderRadius: 6, fontSize: 14 }}
              />
              <input
                type="time"
                value={newScheduleTime}
                onChange={(e) => setNewScheduleTime(e.target.value)}
                style={{ padding: 10, border: '1px solid #ccc', borderRadius: 6, fontSize: 14 }}
              />
              <button
                onClick={handleAddSchedule}
                disabled={addingSchedule}
                style={{ padding: '10px 20px', background: '#2d3510', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}
              >
                {addingSchedule ? 'Adding…' : '+ Add'}
              </button>
            </div>

            {scheduled.length === 0 ? (
              <p style={{ fontSize: 13, color: '#888' }}>No scheduled sends.</p>
            ) : (
              scheduled.map((s) => (
                <div
                  key={s.id}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #eee' }}
                >
                  <span style={{ fontSize: 14 }}>
                    {new Date(s.scheduled_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
                    {s.sent ? ' — sent ✓' : ' — pending'}
                  </span>
                  {!s.sent && (
                    <button
                      onClick={() => handleCancelSchedule(s.id)}
                      style={{ padding: '6px 12px', fontSize: 13, border: '1px solid #e0b0b0', color: '#a03030', borderRadius: 6, background: '#fff', cursor: 'pointer' }}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}
