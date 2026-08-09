'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import Header from '../Header'

type OrderItem = {
  name: string
  price: number
  qty: number
}

type Order = {
  id: string
  status: string
  items: OrderItem[]
  total_amount: number | null
  delivery_day: string | null
  created_at: string
  menu_windows: { week_start_date: string; cutoff_datetime: string | null } | null
  fulfilled?: boolean
  cancelled?: boolean
  delivery_instructions: string | null
}

const statusLabels: Record<string, string> = {
  manually_ordered: 'Placed by you',
  auto_filled: 'Auto-filled',
  skipped: 'Skipped',
  signup_order: 'First order — sign up',
}

export default function OrderHistoryPage() {
  const [loading, setLoading] = useState(true)
  const [loggedIn, setLoggedIn] = useState(false)
  const [orders, setOrders] = useState<Order[]>([])

  useEffect(() => {
    const supabase = createClient()

    const load = async () => {
      const { data } = await supabase.auth.getUser()
      if (!data.user) {
        setLoading(false)
        return
      }
      setLoggedIn(true)

      const { data: rows } = await supabase
        .from('customer_window_orders')
        .select('id, status, items, total_amount, delivery_day, created_at, delivery_instructions, fulfilled, cancelled, menu_windows(week_start_date, cutoff_datetime)')
        .eq('customer_id', data.user.id)
        .order('created_at', { ascending: false })

   const normalized = (rows || []).map((row: any) => ({
     ...row,
     menu_windows: Array.isArray(row.menu_windows)
       ? row.menu_windows[0] ?? null
       : row.menu_windows ?? null,
   }))

   setOrders(normalized)
   setLoading(false)
    }

    load()
  }, [])

  if (loading) {
    return (
      <>
        <Header />
        <div className="pc-account">
          <div className="pc-account-wrapper">
            <p className="pc-mp-subtitle">Loading…</p>
          </div>
        </div>
      </>
    )
  }

  if (!loggedIn) {
    return (
      <>
        <Header />
        <div className="pc-account">
          <div className="pc-account-wrapper">
            <p className="pc-mp-subtitle">Please log in to view your order history.</p>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <Header />
      <div className="pc-account">
        <div className="pc-account-wrapper">
          <a href="/dashboard" className="pc-back-link">← Back to Account</a>
          <div className="pc-account-header">
            <div className="pc-mp-eyebrow">Your Subscription</div>
            <h1 className="pc-mp-title">
              Order <em>History</em>
            </h1>
            <p className="pc-mp-subtitle">Every order placed on your account, most recent first.</p>
          </div>

          {orders.length === 0 ? (
            <p className="pc-mp-subtitle" style={{ textAlign: 'center', marginTop: 40 }}>
              No orders yet — nothing here until your first delivery is placed.
            </p>
          ) : (
            <div className="pc-order-history-list">
              {orders.map((order) => (
                <div key={order.id} className="pc-order-history-card">
                  <div className="pc-order-history-top">
                    <div>
                      <div className="pc-order-history-date">
                        {order.menu_windows?.week_start_date
                          ? new Date(order.menu_windows.week_start_date).toLocaleDateString('en-GB', {
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric',
                            })
                          : new Date(order.created_at).toLocaleDateString('en-GB', {
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric',
                            })}
                        {order.delivery_day ? ` (${order.delivery_day})` : ''}
                      </div>
                      {!order.fulfilled &&
                        !order.cancelled &&
                        order.menu_windows?.cutoff_datetime &&
                        new Date(order.menu_windows.cutoff_datetime).getTime() > Date.now() && (
                          <a className="pc-order-edit-link" href={`/edit-order?id=${order.id}`}>
                            Edit order →
                          </a>
                        )}
                      <div className={`pc-order-history-status ${order.status}`}>
                        {statusLabels[order.status] || order.status}
                      </div>
                    </div>
                    <div className="pc-order-history-total-wrap">
                      <div className="pc-order-history-total-label">Total Charged</div>
                      <div className="pc-order-history-total">
                        {order.total_amount !== null ? `£${order.total_amount.toFixed(2)}` : 'Not recorded'}
                      </div>
                    </div>
                  </div>

                  {order.items && order.items.length > 0 && (
                    <div className="pc-order-history-items">
                      {order.items.map((item, idx) => (
                        <div key={idx} className="pc-order-history-item">
                          <span>
                            {item.name} {item.qty > 1 ? `× ${item.qty}` : ''}
                          </span>
                          <span>£{(item.price * item.qty).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {order.delivery_instructions && (
                    <div className="pc-order-history-instructions">
                      <strong>Delivery note:</strong> {order.delivery_instructions}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
