'use client'

import { useEffect, useState } from 'react'
import CampaignList from './CampaignList'

type Audience = { key: string; label: string; hint: string }

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

export default function ImageCampaignPanel() {
  const [audiences, setAudiences] = useState<Audience[]>([])
  const [refreshKey, setRefreshKey] = useState(0)
  const [loading, setLoading] = useState(true)

  const [imageUrl, setImageUrl] = useState('')
  const [uploading, setUploading] = useState(false)
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
    if (res.ok) setAudiences(data.audiences || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleImageUpload = async (file: File) => {
    setUploading(true)
    setFormMessage(null)
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch('/api/admin/email-campaign-upload', { method: 'POST', body: formData })
    const data = await res.json()
    if (res.ok) setImageUrl(data.imageUrl)
    else setFormMessage(data.error || 'Upload failed')
    setUploading(false)
  }

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
    if (!imageUrl || !audience || !countInfo) return
    const n = countInfo.batchSizes.length
    if (!confirm(`Split ${countInfo.count} people into ${n} batch${n === 1 ? '' : 'es'}? Nothing is sent yet.`)) return
    setCreating(true)
    setFormMessage(null)
    const res = await fetch('/api/admin/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'image_campaign', imageUrl, subject, audience }),
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
      body: JSON.stringify({ imageUrl, subject, to: testTo }),
    })
    const data = await res.json()
    setTestMessage(res.ok ? `Test sent to ${testTo}` : data.error || 'Send failed')
  }

  if (loading) return <p>Loading…</p>

  return (
    <div>
      <div style={card}>
        <h2 style={{ fontSize: 18, margin: '0 0 16px' }}>New image campaign</h2>

        <p style={label}>Image</p>
        <div style={{ marginBottom: 16 }}>
          {imageUrl && (
            <img
              src={imageUrl}
              alt="Campaign image"
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

        <p style={label}>Subject line</p>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="{{first_name}}, this week's menu is live"
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
        {formMessage && <p style={{ fontSize: 13, color: '#a33' }}>{formMessage}</p>}
        <button
          style={primary(!imageUrl || !subject.trim() || !countInfo || creating || countInfo.count === 0)}
          disabled={!imageUrl || !subject.trim() || !countInfo || creating}
          onClick={createBatches}
        >
          {creating ? 'Creating…' : 'Create batches'}
        </button>

        <div style={{ borderTop: '1px solid #eee', marginTop: 20, paddingTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            placeholder="Your email for a test"
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            style={{ flex: '1 1 200px', padding: 9, fontSize: 14, borderRadius: 8, border: '1px solid #ccc' }}
          />
          <button style={ghost} onClick={sendTest} disabled={!testTo || !imageUrl || !subject.trim()}>
            Send test
          </button>
          {testMessage && <span style={{ fontSize: 13, color: '#666' }}>{testMessage}</span>}
        </div>
      </div>

      <CampaignList kind="image_campaign" refreshKey={refreshKey} />

      <p style={{ fontSize: 12, color: '#999' }}>
        Every batch is capped at 400 people, only one batch sends at a time, and batches go at least an hour apart.
      </p>
    </div>
  )
}
