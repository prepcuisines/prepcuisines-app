'use client'

import { useEffect, useState } from 'react'

type Bill = {
  id: string
  name: string
  amount: number
  frequency: 'weekly' | 'monthly'
  next_due_date: string
}

const emptyForm = { name: '', amount: '', frequency: 'monthly' as 'weekly' | 'monthly', next_due_date: '' }

export default function BillsPanel() {
  const [bills, setBills] = useState<Bill[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    const res = await fetch('/api/admin/bills')
    if (res.ok) {
      const data = await res.json()
      setBills(data.bills || [])
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const startAdd = () => {
    setForm(emptyForm)
    setEditingId(null)
    setShowForm(true)
  }

  const startEdit = (bill: Bill) => {
    setForm({
      name: bill.name,
      amount: String(bill.amount),
      frequency: bill.frequency,
      next_due_date: bill.next_due_date,
    })
    setEditingId(bill.id)
    setShowForm(true)
  }

  const handleSave = async () => {
    const amount = Number(form.amount)
    if (!form.name.trim() || !Number.isFinite(amount) || amount < 0 || !form.next_due_date) {
      setMessage('Fill in every field with a valid amount and date.')
      return
    }
    setSaving(true)
    setMessage(null)
    const res = await fetch('/api/admin/bills', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: editingId ?? undefined,
        name: form.name.trim(),
        amount,
        frequency: form.frequency,
        next_due_date: form.next_due_date,
      }),
    })
    if (res.ok) {
      await load()
      setShowForm(false)
      setForm(emptyForm)
      setEditingId(null)
    } else {
      setMessage('Save failed — try again.')
    }
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this bill?')) return
    const res = await fetch(`/api/admin/bills?id=${id}`, { method: 'DELETE' })
    if (res.ok) await load()
  }

  const daysUntil = (dateStr: string) => {
    const due = new Date(dateStr + 'T00:00:00Z')
    const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z')
    return Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  }

  const weeklyTotal = bills.filter((b) => b.frequency === 'weekly').reduce((s, b) => s + b.amount, 0)
  const monthlyTotal = bills.filter((b) => b.frequency === 'monthly').reduce((s, b) => s + b.amount, 0)

  return (
    <div style={{ maxWidth: 700, padding: '0 0 40px' }}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Bills</h1>
      <p style={{ color: '#666', fontSize: 14, marginBottom: 8 }}>
        Track debt payments and recurring bills. Once a due date passes, it automatically rolls
        forward to the next occurrence — no need to tick anything off by hand.
      </p>
      <p style={{ color: '#888', fontSize: 13, marginBottom: 20 }}>
        Weekly total: <strong>£{weeklyTotal.toFixed(2)}</strong> · Monthly total:{' '}
        <strong>£{monthlyTotal.toFixed(2)}</strong>
      </p>

      {loading ? (
        <p>Loading…</p>
      ) : (
        <div style={{ marginBottom: 20 }}>
          {bills.length === 0 && <p style={{ color: '#888', fontSize: 14 }}>No bills added yet.</p>}
          {bills.map((bill) => {
            const days = daysUntil(bill.next_due_date)
            const label = days === 0 ? 'Due today' : days < 0 ? `${Math.abs(days)}d overdue` : `in ${days}d`
            return (
              <div
                key={bill.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 0',
                  borderBottom: '1px solid #eee',
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{bill.name}</div>
                  <div style={{ fontSize: 12.5, color: '#888' }}>
                    £{bill.amount.toFixed(2)} · {bill.frequency} · next due {bill.next_due_date} ({label})
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <button
                    onClick={() => startEdit(bill)}
                    style={{ padding: '6px 12px', fontSize: 13, border: '1px solid #ccc', borderRadius: 6, background: '#fff', cursor: 'pointer' }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(bill.id)}
                    style={{ padding: '6px 12px', fontSize: 13, border: '1px solid #e0b0b0', color: '#a03030', borderRadius: 6, background: '#fff', cursor: 'pointer' }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {!showForm && (
        <button
          onClick={startAdd}
          style={{ padding: '10px 20px', background: '#2d3510', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}
        >
          + Add bill
        </button>
      )}

      {showForm && (
        <div style={{ marginTop: 12, padding: 16, border: '1px solid #ddd', borderRadius: 8, maxWidth: 400 }}>
          <div style={{ marginBottom: 10 }}>
            <label style={{ display: 'block', fontSize: 12.5, color: '#888', marginBottom: 4 }}>Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              style={{ width: '100%', padding: 8, border: '1px solid #ccc', borderRadius: 6, fontSize: 14 }}
            />
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={{ display: 'block', fontSize: 12.5, color: '#888', marginBottom: 4 }}>Amount (£)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              style={{ width: '100%', padding: 8, border: '1px solid #ccc', borderRadius: 6, fontSize: 14 }}
            />
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={{ display: 'block', fontSize: 12.5, color: '#888', marginBottom: 4 }}>Frequency</label>
            <select
              value={form.frequency}
              onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value as 'weekly' | 'monthly' }))}
              style={{ width: '100%', padding: 8, border: '1px solid #ccc', borderRadius: 6, fontSize: 14 }}
            >
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 12.5, color: '#888', marginBottom: 4 }}>Next payment date</label>
            <input
              type="date"
              value={form.next_due_date}
              onChange={(e) => setForm((f) => ({ ...f, next_due_date: e.target.value }))}
              style={{ width: '100%', padding: 8, border: '1px solid #ccc', borderRadius: 6, fontSize: 14 }}
            />
          </div>
          {message && <p style={{ color: '#a03030', fontSize: 13, marginBottom: 10 }}>{message}</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{ padding: '8px 16px', background: '#2d3510', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}
            >
              {saving ? 'Saving…' : editingId ? 'Save changes' : 'Add bill'}
            </button>
            <button
              onClick={() => {
                setShowForm(false)
                setMessage(null)
              }}
              style={{ padding: '8px 16px', background: '#fff', border: '1px solid #ccc', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
