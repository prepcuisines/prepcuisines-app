'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Header from '../Header'

type MenuWindow = {
  id: string
  delivery_day: string
  week_start_date: string
  cutoff_datetime: string
  available?: boolean | null
}

type MenuItem = {
  id: string
  name: string
  description: string
  price: number
  category: string
  allergens: string
  image_url: string
}

type WindowItem = {
  week_in_rotation: number | null
  menu_items: MenuItem
}

const PLAN_SIZES = [
  { meals: 4, label: 'Light eater' },
  { meals: 6, label: 'One a day' },
  { meals: 8, label: 'Weekday lite' },
  { meals: 10, label: 'Full weekdays' },
  { meals: 12, label: 'Extended coverage' },
  { meals: 14, label: 'Week special' },
  { meals: 16, label: 'Family feast' },
]

function useCountdown(target: string) {
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    setNow(Date.now())
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [])
  if (now === null) return null
  // cutoff_datetime comes back from Postgres as "YYYY-MM-DD HH:MM:SS" with no
  // timezone marker, but it's stored as UTC. Handed straight to `new Date()`,
  // that space-separated format gets parsed as LOCAL time instead — during
  // BST that makes every cutoff look an hour earlier than it actually is.
  // Normalise to an explicit UTC ISO string first.
  const utcTarget = target.includes('Z') || target.includes('+') ? target : `${target.replace(' ', 'T')}Z`
  const diff = new Date(utcTarget).getTime() - now
  if (diff <= 0) return null
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24)
  const minutes = Math.floor((diff / (1000 * 60)) % 60)
  const seconds = Math.floor((diff / 1000) % 60)
  return { days, hours, minutes, seconds }
}

function AllergenPills({ allergens }: { allergens: string }) {
  if (!allergens) return null
  const list = allergens.split(';').map((a) => a.trim()).filter(Boolean)
  if (list.length === 0) return null
  return (
    <div className="pc-allergen-row">
      <span className="pc-allergen-label">Contains:</span>
      {list.map((a) => (
        <span className="pc-allergen-pill" key={a}>{a}</span>
      ))}
    </div>
  )
}

function Stepper({
  value,
  onChange,
  disabled,
  disableIncrement,
}: {
  value: number
  onChange: (v: number) => void
  disabled?: boolean
  disableIncrement?: boolean
}) {
  return (
    <div className="pc-stepper">
      <button
        type="button"
        className="pc-stepper-btn"
        disabled={disabled || value <= 0}
        onClick={() => onChange(Math.max(0, value - 1))}
      >
        −
      </button>
      <span className="pc-stepper-count">{value}</span>
      <button
        type="button"
        className="pc-stepper-btn"
        disabled={disabled || disableIncrement}
        onClick={() => onChange(value + 1)}
      >
        +
      </button>
    </div>
  )
}

function DayCard({
  window,
  selected,
  onSelect,
  ignoreCutoff,
}: {
  window: MenuWindow
  selected: boolean
  onSelect: () => void
  ignoreCutoff?: boolean
}) {
  const countdown = useCountdown(window.cutoff_datetime)
  const cutoffPassed = ignoreCutoff ? false : !countdown
  const unavailable = window.available === false
  const disabled = unavailable || cutoffPassed
  return (
    <div
      className={`pc-day-card ${selected ? 'pc-day-selected' : ''} ${disabled ? 'pc-day-disabled' : ''}`}
      onClick={disabled ? undefined : onSelect}
      aria-disabled={disabled}
    >
      <div className="pc-day-tick">{selected ? '✓' : ''}</div>
      <div className="pc-day-name">{window.delivery_day}</div>
      <div className="pc-day-date">
        {new Date(window.week_start_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}
      </div>
      {unavailable ? (
        <div className="pc-day-countdown">Unavailable this week</div>
      ) : ignoreCutoff ? null : countdown ? (
        <div className="pc-day-countdown">
          <span className="pc-day-countdown-dot" />
          Cutoff in{' '}
          <span className="pc-day-countdown-time">
            {countdown.days > 0 ? `${countdown.days}d ` : ''}
            {countdown.hours}h {countdown.minutes}m {countdown.seconds}s
          </span>
        </div>
      ) : (
        <div className="pc-day-countdown">Cutoff has passed — not available to select</div>
      )}
    </div>
  )
}

function DishCard({
  row,
  qty,
  onChange,
  disabled,
  disableIncrement,
}: {
  row: WindowItem
  qty: number
  onChange: (v: number) => void
  disabled?: boolean
  disableIncrement?: boolean
}) {
  const item = row.menu_items
  return (
    <div className="pc-meal-card">
      <div className="pc-meal-img">
        {item.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.image_url} alt={item.name} />
        ) : (
          <div className="pc-meal-img-placeholder">prepcuisines</div>
        )}
        <span className="pc-meal-price-badge">£{Number(item.price).toFixed(2)}</span>
      </div>
      <div className="pc-meal-body">
        <h3 className="pc-meal-name">{item.name}</h3>
        {item.description && <p className="pc-meal-macros">{item.description}</p>}
        <AllergenPills allergens={item.allergens} />
        <div className="pc-meal-footer">
          <Stepper value={qty} onChange={onChange} disabled={disabled} disableIncrement={disableIncrement} />
        </div>
      </div>
    </div>
  )
}

export default function OrderingFlow({
  windows,
  itemsByWindow,
  ignoreCutoff,
}: {
  windows: MenuWindow[]
  itemsByWindow: Record<string, WindowItem[]>
  ignoreCutoff?: boolean
}) {
  const router = useRouter()
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null)
  const [planSize, setPlanSize] = useState<number | null>(null)
  const [mealQty, setMealQty] = useState<Record<string, number>>({})
  const [breakfastQty, setBreakfastQty] = useState<Record<string, number>>({})
  const [dessertQty, setDessertQty] = useState<Record<string, number>>({})
  const [skipBreakfast, setSkipBreakfast] = useState(false)
  const [skipDessert, setSkipDessert] = useState(false)

  const planSectionRef = useRef<HTMLDivElement>(null)
  const menuSectionRef = useRef<HTMLDivElement>(null)
  const breakfastSectionRef = useRef<HTMLDivElement>(null)
  const dessertSectionRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (selectedDayId && planSectionRef.current) {
      planSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [selectedDayId])

  useEffect(() => {
    if (planSize && menuSectionRef.current) {
      menuSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [planSize])

  const selectedWindow = windows.find((w) => w.id === selectedDayId) || null
  const items = selectedDayId ? itemsByWindow[selectedDayId] || [] : []
  const meals = useMemo(() => items.filter((i) => i.menu_items.category === 'meal'), [items])
  const breakfasts = useMemo(() => items.filter((i) => i.menu_items.category === 'breakfast'), [items])
  const desserts = useMemo(() => items.filter((i) => i.menu_items.category === 'dessert'), [items])

  const totalMealsChosen = Object.values(mealQty).reduce((a, b) => a + b, 0)
  const mealsRemaining = planSize ? Math.max(0, planSize - totalMealsChosen) : 0
  const mealsComplete = planSize !== null && totalMealsChosen >= planSize
  const breakfastOk = skipBreakfast || Object.values(breakfastQty).some((v) => v > 0) || breakfasts.length === 0
  const dessertOk = skipDessert || Object.values(dessertQty).some((v) => v > 0) || desserts.length === 0
  const canProceed = mealsComplete && breakfastOk && dessertOk

  useEffect(() => {
    if (mealsComplete && breakfasts.length > 0 && breakfastSectionRef.current) {
      breakfastSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [mealsComplete])

  // No auto-scroll to desserts here on purpose — customers should be free to
  // keep adding breakfast items without being pushed forward. They can scroll
  // down manually once they're happy with their breakfast selection.

  const handleDaySelect = (id: string) => {
    setSelectedDayId(id)
    setPlanSize(null)
    setMealQty({})
    setBreakfastQty({})
    setDessertQty({})
    setSkipBreakfast(false)
    setSkipDessert(false)
  }

  return (
    <>
      <Header />
      <div className="pc-mp">
      <div className="pc-mp-wrapper">
        <div className="pc-mp-header">
          <div className="pc-mp-eyebrow">Weekly Rotation</div>
          <h1 className="pc-mp-title">
            Choose Your <em>Weekly Meal Plan</em>
          </h1>
          <p className="pc-mp-subtitle">Fresh meals cooked in the morning, delivered in the afternoon.</p>
        </div>

        <div className="pc-day-selector">
          <div className="pc-day-selector-eyebrow">Step 1</div>
          <h2 className="pc-day-selector-heading">
            When shall we <em>deliver?</em>
          </h2>
          <p className="pc-day-selector-sub">Select a day before choosing your plan</p>
          <div className="pc-day-grid">
            {windows.map((w) => (
              <DayCard
                key={w.id}
                window={w}
                selected={selectedDayId === w.id}
                onSelect={() => handleDaySelect(w.id)}
                ignoreCutoff={ignoreCutoff}
              />
            ))}
          </div>
          {!selectedDayId && (
            <div className="pc-day-warning">Please choose a delivery day before selecting your plan</div>
          )}
        </div>

        <div className="pc-day-divider" />

        <div className="pc-mp-plans-label" ref={planSectionRef}>Step 2 — Choose your meal plan</div>
        <div className={`pc-mp-plans-grid ${!selectedDayId ? 'pc-plans-locked' : ''}`}>
          {PLAN_SIZES.map((plan) => (
            <div
              key={plan.meals}
              className={`pc-mp-plan-card ${planSize === plan.meals ? 'selected' : ''}`}
              onClick={() => {
                if (!selectedDayId) return
                setPlanSize(plan.meals)
                setMealQty({})
              }}
            >
              <div className="pc-mp-meals-count">{plan.meals}</div>
              <div className="pc-mp-meals-label">meals</div>
            </div>
          ))}
        </div>

        {selectedDayId && planSize && (
          <>
            <div className="pc-progress-bar-wrap" ref={menuSectionRef}>
              <div className="pc-progress-info">
                <span className="pc-progress-text">
                  Select your meals ({totalMealsChosen} of {planSize} chosen)
                </span>
                <div className="pc-progress-track">
                  <div
                    className="pc-progress-fill"
                    style={{ width: `${Math.min(100, (totalMealsChosen / planSize) * 100)}%` }}
                  />
                </div>
              </div>
              <div className="pc-progress-count">
                {totalMealsChosen} <span>/ {planSize}</span>
              </div>
            </div>

            <h2 className="pc-mp-section-title">
              This Week&apos;s <em>Menu</em>
            </h2>
            <div className="pc-mp-grid">
              {meals.map((row) => (
                <DishCard
                  key={row.menu_items.id}
                  row={row}
                  qty={mealQty[row.menu_items.id] || 0}
                  disabled={mealsComplete && !(mealQty[row.menu_items.id] > 0)}
                  disableIncrement={mealsComplete}
                  onChange={(v) =>
                    setMealQty((prev) => ({ ...prev, [row.menu_items.id]: v }))
                  }
                />
              ))}
            </div>

            {breakfasts.length > 0 && (
              <div className={`pc-addon-block ${!mealsComplete ? 'pc-addon-locked' : ''}`} ref={breakfastSectionRef}>
                <div className="pc-addon-header">
                  <div className="pc-addon-eyebrow">Also this week</div>
                  <h3 className="pc-addon-title">
                    Breakfast <em>Add-ons</em>
                  </h3>
                  <p className="pc-addon-sub">Chef-made and delivered with your meals — no extra effort.</p>
                </div>
                <div className="pc-mp-grid">
                  {breakfasts.map((row) => (
                    <DishCard
                      key={row.menu_items.id}
                      row={row}
                      qty={breakfastQty[row.menu_items.id] || 0}
                      disabled={skipBreakfast || !mealsComplete}
                      onChange={(v) =>
                        setBreakfastQty((prev) => ({ ...prev, [row.menu_items.id]: v }))
                      }
                    />
                  ))}
                </div>
                <label className="pc-skip-checkbox">
                  <input
                    type="checkbox"
                    checked={skipBreakfast}
                    disabled={!mealsComplete}
                    onChange={(e) => setSkipBreakfast(e.target.checked)}
                  />
                  No thanks, skip breakfast this week
                </label>
              </div>
            )}

            {desserts.length > 0 && (
              <div className={`pc-addon-block ${!breakfastOk ? 'pc-addon-locked' : ''}`} ref={dessertSectionRef}>
                <div className="pc-addon-header dark">
                  <h3 className="pc-addon-title">Add a Dessert</h3>
                  <p className="pc-addon-sub">Treat yourself — completely optional.</p>
                </div>
                <div className="pc-mp-grid">
                  {desserts.map((row) => (
                    <DishCard
                      key={row.menu_items.id}
                      row={row}
                      qty={dessertQty[row.menu_items.id] || 0}
                      disabled={skipDessert || !breakfastOk}
                      onChange={(v) =>
                        setDessertQty((prev) => ({ ...prev, [row.menu_items.id]: v }))
                      }
                    />
                  ))}
                </div>
                <label className="pc-skip-checkbox">
                  <input
                    type="checkbox"
                    checked={skipDessert}
                    disabled={!breakfastOk}
                    onChange={(e) => setSkipDessert(e.target.checked)}
                  />
                  No thanks, skip dessert this week
                </label>
              </div>
            )}

            <button
              className="pc-proceed-btn"
              disabled={!canProceed}
              onClick={() => {
                if (!canProceed || !selectedWindow) return
                const order = {
                  windowId: selectedDayId,
                  deliveryDay: selectedWindow.delivery_day,
                  weekStartDate: selectedWindow.week_start_date,
                  planSize,
                  mealQty,
                  breakfastQty: skipBreakfast ? {} : breakfastQty,
                  dessertQty: skipDessert ? {} : dessertQty,
                }
                sessionStorage.setItem('pc-order', JSON.stringify(order))
                router.push('/checkout')
              }}
            >
              {!mealsComplete
                ? `${mealsRemaining} more meal${mealsRemaining === 1 ? '' : 's'} to go`
                : !breakfastOk
                ? 'Choose a breakfast or skip it'
                : !dessertOk
                ? 'Choose a dessert or skip it'
                : 'Continue'}
            </button>
          </>
        )}
      </div>
      </div>
    </>
  )
}
