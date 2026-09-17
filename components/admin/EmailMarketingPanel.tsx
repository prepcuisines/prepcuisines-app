'use client'

import { useEffect, useState } from 'react'

type ScheduledSend = {
  id: string
  scheduled_at: string
  sent: boolean
  sent_at: string | null
  result: any
}

type HistoryEntry = {
  id: string
  triggered_at: string
  trigger_type: string
  mode: string
  result: any
}

const SUBTABS = [
  { key: 'image', label: 'Image Campaign' },
  { key: 'text', label: 'Text Message' },
  { key: 'history', label: 'History' },
] as const
type SubTab = (typeof SUBTABS)[number]['key']

const btnStyle = (active: boolean) => ({
  padding: '8px 16px',
  fontSize: 13.5,
  borderRadius: 20,
  border: active ? '1px solid #2d3510' : '1px solid #ccc',
  background: active ? '#2d3510' : '#fff',
  color: active ? '#fff' : '#333',
  cursor: 'pointer' as const,
})

export default function EmailMarketingPanel() {
  const [subTab, setSubTab] = useState<SubTab>('image')

  // --- Image campaign state ---
  const [imageUrl, setImageUrl] = useState('')
  const [subject, setSubject] = useState('')
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const [audience, setAudience] = useState<'all' | 'leads' | 'invite'>('all')
  const [previewCounts, setPreviewCounts] = useState<any>(null)
  const [previewing, setPreviewing] = useState(false)

  const [testEmail, setTestEmail] = useState('')
  const [sendingTest, setSendingTest] = useState(false)
  const [testMessage, setTestMessage] = useState<string | null>(null)

  const [sendingNow, setSendingNow] = useState(false)
  const [sendNowMessage, setSendNowMessage] = useState<string | null>(null)

  const [scheduled, setScheduled] = useState<ScheduledSend[]>([])
  const [newScheduleDate, setNewScheduleDate] = useState('')
  const [newScheduleTime, setNewScheduleTime] = useState('')
  const [addingSchedule, setAddingSchedule] = useState(false)

  // --- Plain text message state ---
  const [textSubject, setTextSubject] = useState('')
  const [textBody, setTextBody] = useState('')
  const [textAudience, setTextAudience] = useState<'all' | 'leads' | 'subscribers' | 'non_subscribers'>('leads')
  const [textPreview, setTextPreview] = useState<any>(null)
  const [textPreviewing, setTextPreviewing] = useState(false)
  const [textSending, setTextSending] = useState(false)
  const [textSendMessage, setTextSendMessage] = useState<string | null>(null)

  // --- History ---
  const [history, setHistory] = useState<HistoryEntry[]>([])

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

  const loadHistory = async () => {
    const res = await fetch('/api/admin/email-send-history')
    if (res.ok) {
      const data = await res.json()
      setHistory(data.history || [])
    }
  }

  const handlePreview = async () => {
    setPreviewing(true)
    setPreviewCounts(null)
    const params = new URLSearchParams({ preview: 'true' })
    if (audience !== 'all') params.set('only', audience)
    const res = await fetch(`/api/admin/run-weekly-reminders?${params.toString()}`)
    if (res.ok) {
      const data = await res.json()
      setPreviewCounts(data.result)
    }
    setPreviewing(false)
  }

  const [sendingBatches, setSendingBatches] = useState(false)
  const [sendBatchesMessage, setSendBatchesMessage] = useState<string | null>(null)

  const handleSendInBatches = async () => {
    setSendingBatches(true)
    setSendBatchesMessage(null)

    const params = new URLSearchParams({ preview: 'true' })
    if (audience !== 'all') params.set('only', audience)
    const previewRes = await fetch(`/api/admin/run-weekly-reminders?${params.toString()}`)
    if (!previewRes.ok) {
      setSendBatchesMessage('Could not check recipient count — try again.')
      setSendingBatches(false)
      return
    }
    const previewData = await previewRes.json()
    const totalEligible = previewData.result?.totalEligible ?? 0
    const batchesNeeded = Math.max(1, Math.ceil(totalEligible / 400))

    if (totalEligible === 0) {
      setSendBatchesMessage('Nobody is currently eligible — nothing to send.')
      setSendingBatches(false)
      return
    }

    const audienceLabel = audience === 'leads' ? 'leads only' : audience === 'invite' ? 'invite only' : 'everyone due'
    if (
      !confirm(
        `${totalEligible} people eligible for "${audienceLabel}" — this needs ${batchesNeeded} batch${batchesNeeded === 1 ? '' : 'es'} of up to 400, one per hour. The first batch sends right now. Continue?`
      )
    ) {
      setSendingBatches(false)
      return
    }

    // First batch fires immediately, same as Send Now.
    try {
      const sendParams = audience !== 'all' ? `?only=${audience}` : ''
      await fetch(`/api/admin/run-weekly-reminders${sendParams}`)
    } catch {
      // Falls through to scheduling the rest regardless - the first batch
      // may still have gone through server-side even if this response
      // didn't come back cleanly.
    }

    // Remaining batches are queued an hour apart via the existing
    // scheduler, so they respect the same 400/hour sending limit.
    const now = Date.now()
    for (let i = 1; i < batchesNeeded; i++) {
      const scheduledAt = new Date(now + i * 60 * 60 * 1000).toISOString()
      await fetch('/api/admin/scheduled-sends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledAt, audience }),
      })
    }

    await loadScheduled()
    await loadHistory()
    setSendBatchesMessage(
      batchesNeeded === 1
        ? 'Sent — one batch covered everyone.'
        : `First batch sent now. ${batchesNeeded - 1} more batch${batchesNeeded - 1 === 1 ? '' : 'es'} queued, one per hour — check Schedule a batch below for the exact times.`
    )
    setSendingBatches(false)
  }

  useEffect(() => {
    loadSettings()
    loadScheduled()
    loadHistory()
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
    const audienceLabel = audience === 'leads' ? 'leads only' : audience === 'invite' ? 'invite (non-subscribers) only' : 'everyone due'
    if (!confirm(`Send one live batch right now to "${audienceLabel}"? This is a real send, not a test.`)) return
    setSendingNow(true)
    setSendNowMessage(null)
    try {
      const params = audience !== 'all' ? `?only=${audience}` : ''
      await fetch(`/api/admin/run-weekly-reminders${params}`)
      setSendNowMessage(`Batch sent — check the History tab for details.`)
      await loadHistory()
    } catch {
      setSendNowMessage('Request sent, but no confirmation came back — check History before sending again, to avoid double-sending.')
      await loadHistory()
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
      body: JSON.stringify({ scheduledAt: localDateTime.toISOString(), audience }),
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

  // --- Plain text handlers ---
  const handleTextPreview = async () => {
    setTextPreviewing(true)
    setTextPreview(null)
    const res = await fetch('/api/admin/send-plain-text-broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audience: textAudience, preview: true }),
    })
    if (res.ok) {
      setTextPreview(await res.json())
    }
    setTextPreviewing(false)
  }

  const handleSendText = async () => {
    if (!textSubject || !textBody) {
      setTextSendMessage('Add a subject and a message first.')
      return
    }
    const audienceLabel =
      textAudience === 'leads' ? 'leads only'
      : textAudience === 'subscribers' ? 'active subscribers only'
      : textAudience === 'non_subscribers' ? 'non-subscribers only'
      : 'everyone'
    if (!confirm(`Send this plain-text message to "${audienceLabel}"? This is a real send.`)) return
    setTextSending(true)
    setTextSendMessage(null)
    const res = await fetch('/api/admin/send-plain-text-broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject: textSubject, body: textBody, audience: textAudience }),
    })
    if (res.ok) {
      const data = await res.json()
      setTextSendMessage(`Sent to ${data.sentThisRun} of ${data.totalEligible} eligible.`)
      await loadHistory()
    } else {
      setTextSendMessage('Send failed — try again.')
    }
    setTextSending(false)
  }

  return (
    <div style={{ maxWidth: 700, padding: '0 0 60px' }}>
      <h1 style={{ fontSize: 22, marginBottom: 12 }}>Email Marketing</h1>

      <div style={{ display: 'flex', gap: 8, marginBottom: 24, borderBottom: '1px solid #ddd', paddingBottom: 12, flexWrap: 'wrap' }}>
        {SUBTABS.map((t) => (
          <button key={t.key} onClick={() => setSubTab(t.key)} style={btnStyle(subTab === t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {subTab === 'image' && (
        <>
          <p style={{ color: '#666', fontSize: 14, marginBottom: 24 }}>
            Full control over the invite/leads image campaign — no code changes or waiting on me
            needed. Change the image or subject any time; it applies to every send from that point
            on, test sends included.
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
                  Who this goes to
                </h3>
                <p style={{ fontSize: 13, color: '#888', marginBottom: 10 }}>
                  Applies to both Send Now and Schedule a batch below.
                </p>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <button onClick={() => { setAudience('all'); setPreviewCounts(null) }} style={btnStyle(audience === 'all')}>
                    Everyone due
                  </button>
                  <button onClick={() => { setAudience('invite'); setPreviewCounts(null) }} style={btnStyle(audience === 'invite')}>
                    Invite only (non-subscribers)
                  </button>
                  <button onClick={() => { setAudience('leads'); setPreviewCounts(null) }} style={btnStyle(audience === 'leads')}>
                    Leads only
                  </button>
                </div>
                <button
                  onClick={handlePreview}
                  disabled={previewing}
                  style={{ padding: '8px 16px', fontSize: 13.5, background: '#fff', border: '1px solid #888', color: '#555', borderRadius: 6, cursor: 'pointer' }}
                >
                  {previewing ? 'Checking…' : 'Preview recipient count'}
                </button>
                {previewCounts && (
                  <p style={{ fontSize: 13, color: '#333', marginTop: 10 }}>
                    <strong>{previewCounts.totalEligible}</strong> eligible right now.{' '}
                    {previewCounts.totalEligible > previewCounts.wouldSendThisRun
                      ? `A single batch would send to ${previewCounts.wouldSendThisRun} of them (400 cap) — the rest would need another run.`
                      : `A single batch would cover all of them.`}
                  </p>
                )}
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

                <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px dashed #ddd' }}>
                  <p style={{ fontSize: 13, color: '#888', marginBottom: 10 }}>
                    If more than 400 people are eligible, one batch won't reach everyone. This sends
                    the first batch right now, then automatically queues however many more are
                    needed, one per hour, until everyone's covered.
                  </p>
                  <button
                    onClick={handleSendInBatches}
                    disabled={sendingBatches}
                    style={{ padding: '10px 22px', background: '#2d3510', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}
                  >
                    {sendingBatches ? 'Working…' : 'Send in batches until everyone\u2019s covered'}
                  </button>
                  {sendBatchesMessage && <p style={{ fontSize: 13, color: '#333', marginTop: 8 }}>{sendBatchesMessage}</p>}
                </div>
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
                    <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #eee' }}>
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
        </>
      )}

      {subTab === 'text' && (
        <>
          <p style={{ color: '#666', fontSize: 14, marginBottom: 24 }}>
            A simple text-only message — just a subject and a message, no image or design template.
            Good for quick announcements. Sends immediately when you click Send (no scheduling for
            this one yet).
          </p>

          <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#8a7a4a', marginBottom: 8 }}>
              Subject
            </h3>
            <input
              type="text"
              value={textSubject}
              onChange={(e) => setTextSubject(e.target.value)}
              style={{ width: '100%', padding: 10, border: '1px solid #ccc', borderRadius: 6, fontSize: 14 }}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#8a7a4a', marginBottom: 8 }}>
              Message
            </h3>
            <textarea
              value={textBody}
              onChange={(e) => setTextBody(e.target.value)}
              rows={8}
              style={{ width: '100%', padding: 10, border: '1px solid #ccc', borderRadius: 6, fontSize: 14, fontFamily: 'inherit' }}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#8a7a4a', marginBottom: 10 }}>
              Who this goes to
            </h3>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <button onClick={() => { setTextAudience('leads'); setTextPreview(null) }} style={btnStyle(textAudience === 'leads')}>
                Leads only
              </button>
              <button onClick={() => { setTextAudience('subscribers'); setTextPreview(null) }} style={btnStyle(textAudience === 'subscribers')}>
                Active subscribers only
              </button>
              <button onClick={() => { setTextAudience('non_subscribers'); setTextPreview(null) }} style={btnStyle(textAudience === 'non_subscribers')}>
                Non-subscribers only
              </button>
              <button onClick={() => { setTextAudience('all'); setTextPreview(null) }} style={btnStyle(textAudience === 'all')}>
                Everyone
              </button>
            </div>
            <button
              onClick={handleTextPreview}
              disabled={textPreviewing}
              style={{ padding: '8px 16px', fontSize: 13.5, background: '#fff', border: '1px solid #888', color: '#555', borderRadius: 6, cursor: 'pointer' }}
            >
              {textPreviewing ? 'Checking…' : 'Preview recipient count'}
            </button>
            {textPreview && (
              <p style={{ fontSize: 13, color: '#333', marginTop: 10 }}>
                <strong>{textPreview.totalEligible}</strong> people.{' '}
                {textPreview.totalEligible > textPreview.wouldSendThisRun
                  ? `One send would reach ${textPreview.wouldSendThisRun} of them (400 cap) — the rest would need a second send.`
                  : `One send would reach all of them.`}
              </p>
            )}
          </div>

          <button
            onClick={handleSendText}
            disabled={textSending}
            style={{ padding: '10px 22px', background: '#a03030', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}
          >
            {textSending ? 'Sending…' : 'Send message'}
          </button>
          {textSendMessage && <p style={{ fontSize: 13, color: '#333', marginTop: 8 }}>{textSendMessage}</p>}
        </>
      )}

      {subTab === 'history' && (
        <>
          <p style={{ color: '#666', fontSize: 14, marginBottom: 16 }}>
            Every real send triggered from this tab — image campaign or plain text, manual or
            scheduled — with a breakdown of who it went to. Test sends aren't logged here.
          </p>
          {history.length === 0 ? (
            <p style={{ fontSize: 13, color: '#888' }}>No sends yet.</p>
          ) : (
            history.map((h) => {
              if (h.trigger_type === 'plain_text') {
                const r = h.result
                return (
                  <div key={h.id} style={{ padding: '10px 0', borderBottom: '1px solid #eee' }}>
                    <div style={{ fontSize: 14 }}>
                      {new Date(h.triggered_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
                      {' — '}
                      <span style={{ color: '#888' }}>
                        plain text, {
                          h.mode === 'leads' ? 'leads only'
                          : h.mode === 'subscribers' ? 'subscribers only'
                          : h.mode === 'non_subscribers' ? 'non-subscribers only'
                          : 'everyone'
                        }
                        {typeof r?.sentThisRun === 'number' ? ` — ${r.sentThisRun} sent` : ''}
                      </span>
                    </div>
                    {r?.subject && <div style={{ fontSize: 12.5, color: '#555', marginTop: 2 }}>"{r.subject}"</div>}
                  </div>
                )
              }
              const results = h.result?.result?.results
              const sentThisRun = h.result?.result?.sentThisRun
              const byKind: Record<string, number> = {}
              if (Array.isArray(results)) {
                for (const r of results) {
                  if (r.sent) byKind[r.kind] = (byKind[r.kind] || 0) + 1
                }
              }
              return (
                <div key={h.id} style={{ padding: '10px 0', borderBottom: '1px solid #eee' }}>
                  <div style={{ fontSize: 14 }}>
                    {new Date(h.triggered_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
                    {' — '}
                    <span style={{ color: '#888' }}>
                      image campaign, {h.trigger_type === 'scheduled' ? 'scheduled' : 'manual'}
                      {h.mode === 'leads' ? ', leads only' : h.mode === 'invite' ? ', invite only' : ''}
                      {typeof sentThisRun === 'number' ? ` — ${sentThisRun} sent` : ''}
                    </span>
                  </div>
                  {Object.keys(byKind).length > 0 && (
                    <div style={{ fontSize: 12.5, color: '#555', marginTop: 2 }}>
                      {Object.entries(byKind).map(([kind, count]) => `${kind}: ${count}`).join(' · ')}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </>
      )}
    </div>
  )
}
