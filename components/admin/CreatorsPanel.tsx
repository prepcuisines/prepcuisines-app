'use client'

import { useCallback, useEffect, useState } from 'react'

type Creator = { id: string; name: string }

export default function CreatorsPanel() {
  const [creators, setCreators] = useState<Creator[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/creators', { cache: 'no-store' })
      if (!res.ok) throw new Error()
      setCreators((await res.json()).creators || [])
    } catch {
      setMsg('Could not load creators.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const post = async (body: Record<string, unknown>) => {
    const res = await fetch('/api/admin/creators', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(d.error || 'Something went wrong')
  }

  const add = async () => {
    if (!name.trim()) return
    try {
      await post({ action: 'add', name })
      setName('')
      setMsg(null)
      await load()
    } catch (e: any) {
      setMsg(e.message)
    }
  }

  const remove = async (c: Creator) => {
    if (!window.confirm(`Remove ${c.name} from the list?`)) return
    try {
      await post({ action: 'remove', id: c.id })
      await load()
    } catch (e: any) {
      setMsg(e.message)
    }
  }

  if (loading) return <p>Loading creators…</p>

  return (
    <div style={{ maxWidth: 520, paddingBottom: 40 }}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Creators</h1>
      <p style={{ color: '#666', fontSize: 14, margin: '0 0 14px' }}>People we send free meals to, for future videos. {creators.length} so far.</p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="Add a name"
          style={{ flex: 1, padding: 10, borderRadius: 8, border: '1px solid #d8d2c4', fontSize: 15 }}
        />
        <button onClick={add} style={{ padding: '9px 14px', borderRadius: 10, border: '1px solid #2d3510', background: '#2d3510', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>Add</button>
      </div>
      {msg && <p style={{ fontSize: 13, color: '#8a7a4a', margin: '0 0 12px' }}>{msg}</p>}
      <div style={{ background: '#fff', border: '1px solid #ede8de', borderRadius: 14 }}>
        {creators.map((c, i) => (
          <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderTop: i ? '1px solid #f1ede4' : 'none' }}>
            <span style={{ fontSize: 15 }}>{c.name}</span>
            <button onClick={() => remove(c)} aria-label={`Remove ${c.name}`} style={{ border: 'none', background: 'none', color: '#999', fontSize: 18, cursor: 'pointer' }}>×</button>
          </div>
        ))}
        {creators.length === 0 && <p style={{ padding: 14, margin: 0, color: '#888' }}>No one yet.</p>}
      </div>
    </div>
  )
}
