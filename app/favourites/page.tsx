'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import Header from '../Header'

type MenuItem = {
  id: string
  name: string
  category: string
  price: number
  image_url: string | null
  description: string | null
  allergens: string | null
}

type Preference = 'liked' | 'disliked' | null

export default function FavouritesPage() {
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [loggedIn, setLoggedIn] = useState(false)
  const [items, setItems] = useState<MenuItem[]>([])
  const [preferences, setPreferences] = useState<Record<string, Preference>>({})
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()

    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        setCheckingAuth(false)
        return
      }

      setLoggedIn(true)
      setUserId(user.id)

      const [{ data: menuData }, { data: favData }] = await Promise.all([
        supabase.from('menu_items').select('id, name, category, price, image_url, description, allergens'),
        supabase.from('favourites').select('menu_item_id, preference').eq('customer_id', user.id),
      ])

      setItems(menuData || [])
      const prefMap: Record<string, Preference> = {}
      ;(favData || []).forEach((f) => {
        prefMap[f.menu_item_id] = f.preference as Preference
      })
      setPreferences(prefMap)
      setCheckingAuth(false)
    }

    load()
  }, [])

  const setPreference = async (itemId: string, newPref: 'liked' | 'disliked') => {
    if (!userId) return
    const supabase = createClient()
    const current = preferences[itemId]

    if (current === newPref) {
      // Tapping the same one again clears it back to neutral
      const { error } = await supabase
        .from('favourites')
        .delete()
        .eq('customer_id', userId)
        .eq('menu_item_id', itemId)
      if (error) {
        console.error('Failed to clear favourite:', error.message)
        alert('Could not save that change: ' + error.message)
        return
      }
      setPreferences((prev) => ({ ...prev, [itemId]: null }))
    } else {
      const { error } = await supabase
        .from('favourites')
        .upsert(
          { customer_id: userId, menu_item_id: itemId, preference: newPref },
          { onConflict: 'customer_id,menu_item_id' }
        )
      if (error) {
        console.error('Failed to save favourite:', error.message)
        alert('Could not save that change: ' + error.message)
        return
      }
      setPreferences((prev) => ({ ...prev, [itemId]: newPref }))
    }
  }

  if (checkingAuth) {
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
            <p className="pc-mp-subtitle">Please log in to choose your favourites.</p>
          </div>
        </div>
      </>
    )
  }

  const categories = ['meal', 'breakfast', 'dessert']
  const categoryLabels: Record<string, string> = {
    meal: 'Meals',
    breakfast: 'Breakfast',
    dessert: 'Desserts',
  }

  return (
    <>
      <Header />
      <div className="pc-mp">
        <div className="pc-mp-wrapper">
          <a href="/dashboard" className="pc-back-link">← Back to Account</a>
          <div className="pc-mp-header">
            <div className="pc-mp-eyebrow">Your Preferences</div>
            <h1 className="pc-mp-title">
              Choose Your <em>Favourites</em>
            </h1>
            <p className="pc-mp-subtitle">
              Tell us what you love and what to skip — we'll use this to fill your box
              automatically if you ever miss the cutoff.
            </p>
          </div>

          {categories.map((cat) => {
            const catItems = items.filter((i) => i.category === cat)
            if (catItems.length === 0) return null
            return (
              <div key={cat}>
                <div className="pc-mp-plans-label">{categoryLabels[cat]}</div>
                <div className="pc-mp-grid">
                  {catItems.map((item) => {
                    const pref = preferences[item.id]
                    return (
                      <div key={item.id} className="pc-meal-card pc-fav-card">
                        <div className="pc-meal-img">
                          {item.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={item.image_url} alt={item.name} />
                          ) : (
                            <div className="pc-meal-img-placeholder">{item.name}</div>
                          )}
                          <div className="pc-fav-buttons">
                            <button
                              className={`pc-fav-btn pc-fav-like ${pref === 'liked' ? 'active' : ''}`}
                              onClick={() => setPreference(item.id, 'liked')}
                              aria-label="Mark as liked"
                            >
                              ♥
                            </button>
                            <button
                              className={`pc-fav-btn pc-fav-dislike ${pref === 'disliked' ? 'active' : ''}`}
                              onClick={() => setPreference(item.id, 'disliked')}
                              aria-label="Mark as disliked"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                        <div className="pc-meal-body">
                          <div className="pc-meal-name">{item.name}</div>
                          {item.description && (
                            <div className="pc-meal-macros">
                              {item.description.replace(/<[^>]*>/g, '')}
                            </div>
                          )}
                          {item.allergens && (
                            <div className="pc-allergen-row">
                              {item.allergens.split(';').map((a) => (
                                <span key={a.trim()} className="pc-allergen-pill">
                                  {a.trim()}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
