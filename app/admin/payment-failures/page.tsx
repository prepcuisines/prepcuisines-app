'use client'

import { useEffect, useState } from 'react'

type Failure = {
  id: string
  customer_name: string
  customer_email: string
  context: string
  amount: number | null
  error_message: string | null
  delivery_day: string | null
  resolved: boolean
  created_at: string
}

const contextLabels: Record<string, string> = {
  signup: 'Signup',
  manual_order: 'Manual order',
  auto_fill: 'Auto-fill',
}

export default function AdminPaymentFailuresPage() {
  const [authenticated, setAuthenticated] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState<string | null>(null)
  const [failures, setFailures] = useState<Failure[]>([])
  const [loading, setLoading] = useState(false)
  const [showResolved, setShowResolved] = useState(false)

  const loadFailures = async () => {
    setLoading(true)
    const res = await fetch('/api/admin/payment-failures')
    if (res.status === 401) {
      setAuthenticated(false)
      setCheckingAuth(false)
      setLoading(false)
      return
    }
    const data = await res.json()
    setFailures(data.failures || [])
    setAuthenticated(true)
    setCheckingAuth(false)
    setLoading(false)
  }

  useEffect(() => {
    loadFailures()
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoginError(null)
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    if (!res.ok) {
      const data = await res.json()
      setLoginError(data.error || 'Login failed')
      return
    }
    await loadFailures()
  }

  const toggleResolved = async (id: string, currentlyResolved: boolean) => {
    await fetch('/api/admin/payment-failures', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, resolved: !currentlyResolved }),
    })
    setFailures((prev) =>
      prev.map((f) => (f.id === id ? { ...f, resolved: !currentlyResolved } : f))
    )
  }

  if (checkingAuth) {
    return (
      <div style={{ padding: 60, textAlign: 'center', fontFamily: 'sans-serif' }}>
        Loading…
      </div>
    )
  }

  if (!authenticated) {
    return (
      <div style={{ maxWidth: 360, margin: '80px auto', fontFamily: 'sans-serif' }}>
        <h1 style={{ fontSize: 20, marginBottom: 16 }}>Admin Login</h1>
        <form onSubmit={handleLogin}>
          <input
            type="password"
            placeholder="Admin password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{
              width: '100%',
              padding: 10,
              marginBottom: 12,
              border: '1px solid #ccc',
              borderRadius: 6,
            }}
          />
          {loginError && (
            <div style={{ color: '#c0392b', fontSize: 13, marginBottom: 12 }}>{loginError}</div>
          )}
          <button
            type="submit"
            style={{
              width: '100%',
              padding: 10,
              background: '#2d3510',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            Log In
          </button>
        </form>
      </div>
    )
  }

  const visibleFailures = showResolved ? failures : failures.filter((f) => !f.resolved)

  return (
    <div style={{ maxWidth: 900, margin: '40px auto', fontFamily: 'sans-serif', padding: '0 20px' }}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Payment Failures</h1>
      <p style={{ color: '#666', fontSize: 14, marginBottom: 20 }}>
        Every failed charge across signup, manual orders, and auto-fill — most recent first.
      </p>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontSize: 14 }}>
        <input
          type="checkbox"
          checked={showResolved}
          onChange={(e) => setShowResolved(e.target.checked)}
        />
        Show resolved
      </label>

      {loading ? (
        <p>Loading…</p>
      ) : visibleFailures.length === 0 ? (
        <p style={{ color: '#666' }}>No unresolved payment failures. 🎉</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
              <th style={{ padding: '8px 6px' }}>Date</th>
              <th style={{ padding: '8px 6px' }}>Customer</th>
              <th style={{ padding: '8px 6px' }}>Context</th>
              <th style={{ padding: '8px 6px' }}>Amount</th>
              <th style={{ padding: '8px 6px' }}>Error</th>
              <th style={{ padding: '8px 6px' }}>Delivery Day</th>
              <th style={{ padding: '8px 6px' }}></th>
            </tr>
          </thead>
          <tbody>
            {visibleFailures.map((f) => (
              <tr
                key={f.id}
                style={{
                  borderBottom: '1px solid #eee',
                  opacity: f.resolved ? 0.5 : 1,
                }}
              >
                <td style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>
                  {new Date(f.created_at).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </td>
                <td style={{ padding: '8px 6px' }}>
                  <div>{f.customer_name}</div>
                  <div style={{ color: '#888', fontSize: 12 }}>{f.customer_email}</div>
                </td>
                <td style={{ padding: '8px 6px' }}>{contextLabels[f.context] || f.context}</td>
                <td style={{ padding: '8px 6px' }}>
                  {f.amount !== null ? `£${f.amount.toFixed(2)}` : '—'}
                </td>
                <td style={{ padding: '8px 6px', color: '#c0392b' }}>{f.error_message}</td>
                <td style={{ padding: '8px 6px' }}>{f.delivery_day || '—'}</td>
                <td style={{ padding: '8px 6px' }}>
                  <button
                    onClick={() => toggleResolved(f.id, f.resolved)}
                    style={{
                      padding: '4px 10px',
                      fontSize: 12,
                      border: '1px solid #ccc',
                      borderRadius: 6,
                      background: '#fff',
                      cursor: 'pointer',
                    }}
                  >
                    {f.resolved ? 'Mark Unresolved' : 'Mark Resolved'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
