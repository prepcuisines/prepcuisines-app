'use client'

import { useEffect, useState } from 'react'
import CampaignList from './CampaignList'

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

export default function CampaignBatchesPanel() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [audiences, setAudiences] = useState<Audience[]>([])
  const [refreshKey, setRefreshKey] = useState(0)
  const [loading, setLoading] = useState(true)

  const [templateKey, setTemplateKey] = useState('')
  const [subject, setSubject] = useState('')
  const [audience, setAudience] = useState('')
  const [countInfo, setCountInfo] = useState<{ count: number; batchSizes: number[] } | null>(null)
  const [counting, setCounting] = useState(false)
  const [creating, setCreating] = useState(false)
  const [formMessage, setFormMessage] = useState<string | null>(null)

  const [testTo, setTestTo] = useState('')
  const [testMessage, setTestMessage] = useState<string | null>(null)


  const load = async () => {
    const res = await fetch('/api/admin/campaigns', { cache: 'no-store' })
    const data = await res.json()
    if (res.ok) {
      setTemplates(data.templates || [])
      setAudiences(data.audiences || [])
      if (!templateKey && data.templates?.[0]) {
        setTemplateKey(data.templates[0].key)
        setSubject(data.templates[0].defaultSubject)
      }
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const template = templates.find((t) => t.key === templateKey)
  const audienceMismatch =
    !!template && !!audience && template.intendedFor === 'not_subscribed' && !['not_subscribed', 'leads', 'payg'].includes(audience)

  const pickAudience = async (key: string) => {
    setAudience(key)
    setCountInfo(null)
    setCounting(true)
    const res = await fetch(`/api/admin/campaigns/audience-count?audience=${key}`, { cache: 'no-store' })
    const data = await res.json()
    if (res.ok) setCountInfo(data)
    setCounting(false)
  }

  const createBatches = async () => {
    if (!template || !audience || !countInfo) return
    const n = countInfo.batchSizes.length
    if (!confirm(`Split ${countInfo.count} people into ${n} batch${n === 1 ? '' : 'es'}? Nothing is sent yet.`)) return
    setCreating(true)
    setFormMessage(null)
    const res = await fetch('/api/admin/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ templateKey, subject, audience }),
    })
    const data = await res.json()
    setCreating(false)
    if (!res.ok) {
      setFormMessage(data.error || 'Something went wrong')
      return
    }
    setAudience('')
    setCountInfo(null)
    setRefreshKey((k) => k + 1)
  }

  const sendTest = async () => {
    setTestMessage('Sending…')
    const res = await fetch('/api/admin/campaigns/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ templateKey, subject, to: testTo }),
    })
    const data = await res.json()
    setTestMessage(res.ok ? `Test sent to ${testTo}` : data.error || 'Send failed')
  }

  if (loading) return <p>Loading…</p>

  return (
    <div>
      {/* New campaign */}
      <div style={card}>
        <h2 style={{ fontSize: 18, margin: '0 0 16px' }}>New campaign</h2>

        <p style={label}>Email</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {templates.map((t) => (
            <button
              key={t.key}
              style={pill(templateKey === t.key)}
              onClick={() => {
                setTemplateKey(t.key)
                setSubject(t.defaultSubject)
              }}
            >
              {t.name}
            </button>
          ))}
        </div>
        {templateKey && (
          <iframe
            key={templateKey}
            src={`/api/admin/campaigns/preview?template=${templateKey}`}
            title="Email preview"
            style={{ width: '100%', height: 460, border: '1px solid #eee', borderRadius: 8, marginBottom: 16 }}
          />
        )}

        <p style={label}>Subject line</p>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          style={{ width: '100%', padding: 10, fontSize: 14, borderRadius: 8, border: '1px solid #ccc', marginBottom: 16, boxSizing: 'border-box' }}
        />

        <p style={label}>Send to</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          {audiences.map((a) => (
            <button key={a.key} style={pill(audience === a.key)} onClick={() => pickAudience(a.key)}>
              {a.label}
            </button>
          ))}
        </div>
        {audience && (
          <p style={{ fontSize: 13, color: '#777', margin: '0 0 12px' }}>{audiences.find((a) => a.key === audience)?.hint}</p>
        )}
        {counting && <p style={{ fontSize: 14 }}>Counting…</p>}
        {countInfo && (
          <div style={{ background: '#f7f4ee', borderRadius: 8, padding: 14, marginBottom: 12, fontSize: 14 }}>
            <strong>{countInfo.count.toLocaleString()} people</strong> →{' '}
            {countInfo.batchSizes.length} batch{countInfo.batchSizes.length === 1 ? '' : 'es'}
            <div style={{ color: '#666', marginTop: 4 }}>
              {countInfo.batchSizes.map((n, i) => `Batch ${i + 1}: ${n}`).join(' · ')}
            </div>
          </div>
        )}
        {audienceMismatch && (
          <p style={{ fontSize: 13, color: '#a33', margin: '0 0 12px' }}>
            This email promises 40% off a first box. This group won&apos;t get 40% at checkout.
          </p>
        )}
        {formMessage && <p style={{ fontSize: 13, color: '#a33' }}>{formMessage}</p>}
        <button style={primary(!countInfo || creating || countInfo.count === 0)} disabled={!countInfo || creating} onClick={createBatches}>
          {creating ? 'Creating…' : 'Create batches'}
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
      </div>

      <CampaignList kind="marketing" refreshKey={refreshKey} />

      <p style={{ fontSize: 12, color: '#999' }}>
        Every batch is capped at 400 people, only one batch sends at a time, and batches go at least an hour apart.
      </p>
    </div>
  )
}
