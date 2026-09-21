'use client'

import { useEffect, useState } from 'react'

type Bill = {
  id: string
  name: string
  amount: number
  frequency: 'weekly' | 'monthly'
  next_due_date: string
  category: 'personal' | 'business'
  payoff_type: 'none' | 'end_date' | 'total_remaining'
  end_date: string | null
  total_remaining: number | null
  original_total: number | null
  finished: boolean
}

const emptyForm = {
  name: '',
  amount: '',
  frequency: 'monthly' as 'weekly' | 'monthly',
  next_due_date: '',
  category: 'business' as 'personal' | 'business',
  payoff_type: 'none' as 'none' | 'end_date' | 'total_remaining',
  end_date: '',
  total_remaining: '',
}

export default function BillsPanel() {
  const [bills, setBills] = useState<Bill[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'personal' | 'business'>('all')

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
      category: bill.category,
      payoff_type: bill.payoff_type,
      end_date: bill.end_date ?? '',
      total_remaining: bill.total_remaining !== null ? String(bill.total_remaining) : '',
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
    if (form.payoff_type === 'end_date' && !form.end_date) {
      setMessage('Add an end date, or switch payoff type to something else.')
      return
    }
    const totalRemaining = Number(form.total_remaining)
    if (form.payoff_type === 'total_remaining' && (!Number.isFinite(totalRemaining) || totalRemaining < 0)) {
      setMessage('Add a valid total remaining amount.')
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
        category: form.category,
        payoff_type: form.payoff_type,
        end_date: form.payoff_type === 'end_date' ? form.end_date : null,
        total_remaining: form.payoff_type === 'total_remaining' ? totalRemaining : null,
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

  const visibleBills = bills.filter((b) => filter === 'all' || b.category === filter)
  const weeklyTotal = visibleBills.filter((b) => b.frequency === 'weekly').reduce((s, b) => s + b.amount, 0)
  const monthlyTotal = visibleBills.filter((b) => b.frequency === 'monthly').reduce((s, b) => s + b.amount, 0)

  // Progress across everything being paid off, not just what's currently
  // filtered - this is a "how am I doing overall" view, not tied to the
  // business/personal toggle above.
  const payoffBills = bills.filter((b) => b.payoff_type === 'total_remaining' && b.original_total)
  const totalOriginal = payoffBills.reduce((s, b) => s + (b.original_total || 0), 0)
  const totalRemainingNow = payoffBills.reduce((s, b) => s + (b.total_remaining || 0), 0)
  const totalPaidOff = totalOriginal - totalRemainingNow
  const overallPercent = totalOriginal > 0 ? Math.round((totalPaidOff / totalOriginal) * 100) : 0
  const stillPaying = payoffBills.filter((b) => !b.finished)
  const recentlyFinished = bills.filter((b) => b.payoff_type === 'total_remaining' && b.finished)

  return (
    <div style={{ maxWidth: 700, padding: '0 0 40px' }}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Bills</h1>
      <p style={{ color: '#666', fontSize: 14, marginBottom: 8 }}>
        Track debt payments and recurring bills. Once a due date passes, it automatically rolls
        forward to the next occurrence — no need to tick anything off by hand.
      </p>
      <p style={{ color: '#888', fontSize: 13, marginBottom: 16 }}>
        Weekly total: <strong>£{weeklyTotal.toFixed(2)}</strong> · Monthly total:{' '}
        <strong>£{monthlyTotal.toFixed(2)}</strong>
      </p>

      {payoffBills.length > 0 && (
        <div style={{ background: '#f5f0e8', borderRadius: 10, padding: 18, marginBottom: 24 }}>
          <h3 style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#8a7a4a', marginBottom: 10 }}>
            Payoff progress
          </h3>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#2d3510' }}>
              £{totalPaidOff.toFixed(2)} paid off so far
            </span>
            <span style={{ fontSize: 13, color: '#888' }}>{overallPercent}%</span>
          </div>
          <div style={{ width: '100%', height: 10, background: '#e0dcd0', borderRadius: 5, overflow: 'hidden', marginBottom: 10 }}>
            <div style={{ width: `${Math.min(100, overallPercent)}%`, height: '100%', background: '#2d3510' }} />
          </div>
          <p style={{ fontSize: 13, color: '#555', marginBottom: recentlyFinished.length > 0 ? 12 : 0 }}>
            £{totalRemainingNow.toFixed(2)} left across {stillPaying.length} bill{stillPaying.length === 1 ? '' : 's'} still being paid off.
          </p>
          {recentlyFinished.length > 0 && (
            <div style={{ paddingTop: 10, borderTop: '1px solid #e0dcd0' }}>
              <span style={{ fontSize: 13, color: '#2d3510', fontWeight: 600 }}>
                🎉 Fully paid off: {recentlyFinished.map((b) => b.name).join(', ')}
              </span>
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {(['all', 'business', 'personal'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '6px 14px',
              fontSize: 13,
              borderRadius: 20,
              border: filter === f ? '1px solid #2d3510' : '1px solid #ccc',
              background: filter === f ? '#2d3510' : '#fff',
              color: filter === f ? '#fff' : '#333',
              cursor: 'pointer',
              textTransform: 'capitalize',
            }}
          >
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <p>Loading…</p>
      ) : (
        <div style={{ marginBottom: 20 }}>
          {visibleBills.length === 0 && <p style={{ color: '#888', fontSize: 14 }}>No bills here.</p>}
          {visibleBills.map((bill) => {
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
                  <div style={{ fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                    {bill.name}
                    <span
                      style={{
                        fontSize: 10.5,
                        padding: '2px 8px',
                        borderRadius: 10,
                        background: bill.category === 'personal' ? '#e8d5b0' : '#dce8dc',
                        color: '#333',
                        textTransform: 'uppercase',
                        letterSpacing: '0.03em',
                        fontWeight: 700,
                      }}
                    >
                      {bill.category}
                    </span>
                    {bill.finished && (
                      <span
                        style={{
                          fontSize: 10.5,
                          padding: '2px 8px',
                          borderRadius: 10,
                          background: '#2d3510',
                          color: '#fff',
                          textTransform: 'uppercase',
                          letterSpacing: '0.03em',
                          fontWeight: 700,
                        }}
                      >
                        Paid off
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12.5, color: '#888' }}>
                    £{bill.amount.toFixed(2)} · {bill.frequency}
                    {!bill.finished && ` · next due ${bill.next_due_date} (${label})`}
                  </div>
                  {bill.payoff_type === 'end_date' && bill.end_date && (
                    <div style={{ fontSize: 12.5, color: '#888' }}>
                      {bill.finished ? 'Ended' : 'Ends'} {bill.end_date}
                    </div>
                  )}
                  {bill.payoff_type === 'total_remaining' && bill.total_remaining !== null && (
                    <div style={{ marginTop: 4 }}>
                      <div style={{ fontSize: 12.5, color: '#888' }}>
                        £{bill.total_remaining.toFixed(2)} left to pay off
                        {bill.original_total ? (
                          <>
                            {' '}
                            (
                            {Math.round(
                              ((bill.original_total - bill.total_remaining) / bill.original_total) * 100
                            )}
                            % paid off
                            {bill.amount > 0 && bill.total_remaining > 0
                              ? ` · ~${Math.ceil(bill.total_remaining / bill.amount)} payment${
                                  Math.ceil(bill.total_remaining / bill.amount) === 1 ? '' : 's'
                                } left`
                              : ''}
                            )
                          </>
                        ) : null}
                      </div>
                      {bill.original_total ? (
                        <div style={{ width: '100%', maxWidth: 220, height: 6, background: '#eee', borderRadius: 4, marginTop: 4, overflow: 'hidden' }}>
                          <div
                            style={{
                              width: `${Math.min(100, Math.round(((bill.original_total - bill.total_remaining) / bill.original_total) * 100))}%`,
                              height: '100%',
                              background: '#2d3510',
                            }}
                          />
                        </div>
                      ) : null}
                    </div>
                  )}
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
          <div style={{ marginBottom: 10 }}>
            <label style={{ display: 'block', fontSize: 12.5, color: '#888', marginBottom: 4 }}>Category</label>
            <select
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as 'personal' | 'business' }))}
              style={{ width: '100%', padding: 8, border: '1px solid #ccc', borderRadius: 6, fontSize: 14 }}
            >
              <option value="business">Business</option>
              <option value="personal">Personal</option>
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
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 12.5, color: '#888', marginBottom: 4 }}>
              Is this recurring, or getting paid off?
            </label>
            <select
              value={form.payoff_type}
              onChange={(e) =>
                setForm((f) => ({ ...f, payoff_type: e.target.value as 'none' | 'end_date' | 'total_remaining' }))
              }
              style={{ width: '100%', padding: 8, border: '1px solid #ccc', borderRadius: 6, fontSize: 14 }}
            >
              <option value="none">Just recurring, no end</option>
              <option value="end_date">Has an end date</option>
              <option value="total_remaining">Has a total remaining to pay off</option>
            </select>
          </div>
          {form.payoff_type === 'end_date' && (
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12.5, color: '#888', marginBottom: 4 }}>End date</label>
              <input
                type="date"
                value={form.end_date}
                onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
                style={{ width: '100%', padding: 8, border: '1px solid #ccc', borderRadius: 6, fontSize: 14 }}
              />
            </div>
          )}
          {form.payoff_type === 'total_remaining' && (
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12.5, color: '#888', marginBottom: 4 }}>
                Total remaining (£)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.total_remaining}
                onChange={(e) => setForm((f) => ({ ...f, total_remaining: e.target.value }))}
                style={{ width: '100%', padding: 8, border: '1px solid #ccc', borderRadius: 6, fontSize: 14 }}
              />
            </div>
          )}
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
