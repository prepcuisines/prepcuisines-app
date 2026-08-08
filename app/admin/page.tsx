'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Papa from 'papaparse'
import CookSheetBreakdown from '../../components/admin/CookSheetBreakdown'

type Overview = {
  totalCustomers: number
  activeSubscriptions: number
  newSignupsThisWeek: number
  revenueThisWeek: number
  ordersThisWeek: number
  averageLtv?: number
  ltvCustomerCount?: number
  todaysOrderCount?: number
  todaysMeals?: number
  todaysAvgBasket?: number
  avgMealsPerOrder?: number
}

type Customer = {
  id: string
  full_name: string | null
  email: string | null
  phone: string | null
  house_number: string | null
  street: string | null
  postcode: string | null
  subscription_status: string | null
  effectiveStatus?: string | null
  avgDaysBetweenOrders?: number | null
  orders_completed: number | null
  standing_plan_size: number | null
  standing_delivery_day: string | null
  second_delivery_day: string | null
  deliveries_per_week: number | null
  created_at: string
  marketing_consent: boolean | null
  lastOrderAt: string | null
  daysSinceLastOrder: number | null
  orderCount: number
  totalSpend: number
  lapsedTier: '30' | '60' | '90+' | null
  isNewThisWeek: boolean
  isLoyal: boolean
  isWinBackCandidate: boolean
}

type Order = {
  id: string
  customer_id: string | null
  status: string
  items: { name: string; price: number; qty: number }[]
  total_amount: number | null
  delivery_day: string | null
  created_at: string
  delivery_instructions: string | null
  ship_full_name: string | null
  ship_phone: string | null
  ship_house_number: string | null
  ship_street: string | null
  ship_postcode: string | null
  customer_name: string
  customer_email: string | null
  menu_windows: { week_start_date: string } | null
  fulfilled?: boolean
  cancelled?: boolean
  dpd_shipment_id?: string | null
  dpd_consignment_number?: string | null
  label_printed_at?: string | null
}

const statusLabels: Record<string, string> = {
  manually_ordered: 'Placed by customer',
  auto_filled: 'Auto-filled',
  skipped: 'Skipped',
  signup_order: 'First order — signup',
  payg_order: 'Pay As You Go',
}

const segmentFilters = [
  { key: 'lapsed_30', label: 'Lapsed 30+' },
  { key: 'lapsed_60', label: 'Lapsed 60+' },
  { key: 'lapsed_90', label: 'Lapsed 90+' },
  { key: 'loyal', label: 'Loyal' },
  { key: 'new_this_week', label: 'New this week' },
  { key: 'win_back', label: 'Win-back' },
  { key: 'email_subscribed', label: 'Marketing opted-in' },
]

function money(n: number | null | undefined) {
  return `£${(n || 0).toFixed(2)}`
}

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function initials(name: string | null) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  return (parts[0]?.[0] || '') + (parts[1]?.[0] || '')
}

function StatusBadge({ status }: { status: string | null }) {
  const map: Record<string, { label: string; tone: 'active' | 'muted' | 'warn' }> = {
    active: { label: 'Active', tone: 'active' },
    cancelled: { label: 'Cancelled', tone: 'muted' },
    none: { label: 'PAYG', tone: 'warn' },
    incomplete: { label: 'Incomplete signup', tone: 'warn' },
  }
  const entry = map[status || 'none'] || { label: status || 'None', tone: 'muted' }
  return <span className={`pill pill-${entry.tone}`}>{entry.label}</span>
}

export default function AdminDashboard() {
  const [authenticated, setAuthenticated] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState<string | null>(null)

  const [tab, setTab] = useState<
    | 'overview'
    | 'customers'
    | 'orders'
    | 'cook-sheet'
    | 'email-marketing'
    | 'shopify-import'
    | 'menu'
    | 'map'
    | 'insights'
    | 'product-analytics'
    | 'ops-hub'
  >('overview')

  const [overview, setOverview] = useState<Overview | null>(null)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [segment, setSegment] = useState('all')
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerDateField, setCustomerDateField] = useState<'signup' | 'last_order' | 'delivery_day'>(
    'signup'
  )
  const [customerDateFrom, setCustomerDateFrom] = useState('')
  const [customerDateTo, setCustomerDateTo] = useState('')
  const [customerSingleDate, setCustomerSingleDate] = useState('')
  const [showCustomerDateFilter, setShowCustomerDateFilter] = useState(false)
  const [klaviyoSyncStatus, setKlaviyoSyncStatus] = useState<'idle' | 'syncing' | 'done' | 'error'>(
    'idle'
  )
  const [klaviyoSyncResult, setKlaviyoSyncResult] = useState<{
    totalUniqueEmails: number
    synced: number
  } | null>(null)
  const [klaviyoSyncError, setKlaviyoSyncError] = useState<string | null>(null)
  const [testEmailAddress, setTestEmailAddress] = useState('')
  const [testEmailStatus, setTestEmailStatus] = useState<'idle' | 'sending' | 'done' | 'error'>(
    'idle'
  )
  const [testEmailError, setTestEmailError] = useState<string | null>(null)
  const [dpdTestStatus, setDpdTestStatus] = useState<'idle' | 'testing' | 'done'>('idle')
  const [dpdLookupPostcode, setDpdLookupPostcode] = useState('')
  const [dpdLookupTown, setDpdLookupTown] = useState('')
  const [dpdLookupStatus, setDpdLookupStatus] = useState<'idle' | 'loading' | 'done' | 'error'>(
    'idle'
  )
  const [dpdLookupServices, setDpdLookupServices] = useState<
    { description: string; networkCode: string }[]
  >([])
  const [dpdLookupError, setDpdLookupError] = useState<string | null>(null)
  const [printLabelsStatus, setPrintLabelsStatus] = useState<'idle' | 'working'>('idle')
  const [printLabelsProgress, setPrintLabelsProgress] = useState('')
  const [printLabelsError, setPrintLabelsError] = useState<string | null>(null)
  const [dpdTestResult, setDpdTestResult] = useState<{
    connected: boolean
    message: string
    keyPreview?: string
  } | null>(null)
  const [importStatus, setImportStatus] = useState<'idle' | 'parsing' | 'importing' | 'done' | 'error'>(
    'idle'
  )
  const [importSummary, setImportSummary] = useState<{
    totalRowsReceived: number
    consentedRows: number
    updatedExistingCustomers: number
    createdLeads: number
    skippedExplicitChoice: number
  } | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0 })
  const [marketingLeads, setMarketingLeads] = useState<
    { id: string; email: string; full_name: string | null; phone: string | null }[]
  >([])
  const [marketingLeadsLoaded, setMarketingLeadsLoaded] = useState(false)

  const [opsHub, setOpsHub] = useState<any>(null)
  const [opsHubLoaded, setOpsHubLoaded] = useState(false)
  const [newTaskText, setNewTaskText] = useState('')
  const [topSearchValue, setTopSearchValue] = useState('')
  const [showNotifications, setShowNotifications] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [resendEmailType, setResendEmailType] = useState<'confirmation' | 'fulfilled'>(
    'confirmation'
  )
  const [resendEmailStatus, setResendEmailStatus] = useState<
    'idle' | 'sending' | 'done' | 'error'
  >('idle')
  const [resendEmailError, setResendEmailError] = useState<string | null>(null)
  const [dpdShipmentStatus, setDpdShipmentStatus] = useState<'idle' | 'creating' | 'error'>(
    'idle'
  )
  const [dpdShipmentError, setDpdShipmentError] = useState<string | null>(null)
  const [dpdLabelStatus, setDpdLabelStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [dpdLabelError, setDpdLabelError] = useState<string | null>(null)
  const [dpdLabelHtml, setDpdLabelHtml] = useState<string | null>(null)
  const [resetPasswordCustomer, setResetPasswordCustomer] = useState<{
    id: string
    name: string
  } | null>(null)
  const [newPasswordValue, setNewPasswordValue] = useState('')
  const [resetPasswordStatus, setResetPasswordStatus] = useState<
    'idle' | 'saving' | 'done' | 'error'
  >('idle')
  const [resetPasswordError, setResetPasswordError] = useState<string | null>(null)
  const [passwordCopied, setPasswordCopied] = useState(false)
  const [editEmailCustomer, setEditEmailCustomer] = useState<{
    id: string
    name: string
  } | null>(null)
  const [editCustomerEmailValue, setEditCustomerEmailValue] = useState('')
  const [editCustomerEmailStatus, setEditCustomerEmailStatus] = useState<
    'idle' | 'saving' | 'done' | 'error'
  >('idle')
  const [editCustomerEmailError, setEditCustomerEmailError] = useState<string | null>(null)
  const [editDeliveryCustomer, setEditDeliveryCustomer] = useState<{
    id: string
    name: string
  } | null>(null)
  const [editDeliveryPrimaryDay, setEditDeliveryPrimaryDay] = useState<'Sunday' | 'Wednesday'>(
    'Sunday'
  )
  const [editDeliveryPerWeek, setEditDeliveryPerWeek] = useState<1 | 2>(1)
  const [editDeliveryStatus, setEditDeliveryStatus] = useState<
    'idle' | 'saving' | 'done' | 'error'
  >('idle')
  const [editDeliveryError, setEditDeliveryError] = useState<string | null>(null)
  const [orderDetail, setOrderDetail] = useState<any>(null)
  const [orderDetailLoading, setOrderDetailLoading] = useState(false)
  const [editingItems, setEditingItems] = useState<{ name: string; price: number; qty: number }[]>(
    []
  )
  const [editingDeliveryDay, setEditingDeliveryDay] = useState('')
  const [orderActionStatus, setOrderActionStatus] = useState<'idle' | 'saving' | 'error'>('idle')
  const [orderActionError, setOrderActionError] = useState<string | null>(null)
  const [chargeAmountInput, setChargeAmountInput] = useState('')
  const [editEmailInput, setEditEmailInput] = useState('')
  const [orderSearch, setOrderSearch] = useState('')
  const [loading, setLoading] = useState(false)

  const [showAddOrder, setShowAddOrder] = useState(false)
  const [showBulkImport, setShowBulkImport] = useState(false)
  const [bulkImportWindowId, setBulkImportWindowId] = useState('')
  const [bulkImportText, setBulkImportText] = useState('')
  const [bulkImportStatus, setBulkImportStatus] = useState<'idle' | 'saving' | 'done' | 'error'>(
    'idle'
  )
  const [bulkImportError, setBulkImportError] = useState<string | null>(null)
  const [bulkImportCount, setBulkImportCount] = useState(0)
  const [addOrderForm, setAddOrderForm] = useState({
    customerName: '',
    customerEmail: '',
    phone: '',
    houseNumber: '',
    street: '',
    postcode: '',
    deliveryInstructions: '',
    windowId: '',
    totalAmount: '',
  })
  const [addOrderMenuItems, setAddOrderMenuItems] = useState<
    { name: string; price: number; category: string }[]
  >([])
  const [addOrderQuantities, setAddOrderQuantities] = useState<Record<string, number>>({})
  const [addOrderMenuLoading, setAddOrderMenuLoading] = useState(false)
  const [addOrderStatus, setAddOrderStatus] = useState<'idle' | 'saving' | 'error'>('idle')
  const [addOrderError, setAddOrderError] = useState<string | null>(null)
  const [repeatWeekly, setRepeatWeekly] = useState(false)
  const [repeatMode, setRepeatMode] = useState<'auto_charge' | 'manual' | 'send_link'>('manual')
  const [repeatDeliveryDay, setRepeatDeliveryDay] = useState<'Wednesday' | 'Sunday'>('Wednesday')
  const [repeatStatus, setRepeatStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle')
  const [repeatError, setRepeatError] = useState<string | null>(null)
  const [recurringOrdersList, setRecurringOrdersList] = useState<any[]>([])
  const [showRecurringOrdersList, setShowRecurringOrdersList] = useState(false)

  const [menuItems, setMenuItems] = useState<
    { id: string; name: string; category: string | null; price: number | null }[]
  >([])
  const [menuWindows, setMenuWindows] = useState<
    { id: string; delivery_day: string; week_start_date: string }[]
  >([])
  const [selectedByWindow, setSelectedByWindow] = useState<Record<string, string[]>>({})
  const [menuLoaded, setMenuLoaded] = useState(false)
  const [togglingItem, setTogglingItem] = useState<string | null>(null)

  const [mapPoints, setMapPoints] = useState<
    { postcode: string; count: number; lat: number; lon: number }[]
  >([])
  const [mapLoaded, setMapLoaded] = useState(false)
  const [mapDateFilter, setMapDateFilter] = useState('')

  const [topDishes, setTopDishes] = useState<{ name: string; qty: number; revenue: number }[]>([])
  const [topDishesPeriod, setTopDishesPeriod] = useState<'week' | 'month' | 'all'>('week')
  const [topDishesLoaded, setTopDishesLoaded] = useState(false)
  const [copiedListKey, setCopiedListKey] = useState<string | null>(null)
  const [emailWindowOptions, setEmailWindowOptions] = useState<
    { id: string; delivery_day: string; week_start_date: string }[]
  >([])
  const [selectedEmailWindowId, setSelectedEmailWindowId] = useState('')
  const [emailWindowCopyStatus, setEmailWindowCopyStatus] = useState<
    'idle' | 'loading' | 'copied'
  >('idle')
  const [emailWindowCopyCount, setEmailWindowCopyCount] = useState<number | null>(null)
  const [lateOrderLinkCopied, setLateOrderLinkCopied] = useState(false)
  const [dishPairs, setDishPairs] = useState<{ dishA: string; dishB: string; count: number }[]>([])
  const [dishPairsLoaded, setDishPairsLoaded] = useState(false)
  const [productDishes, setProductDishes] = useState<
    {
      name: string
      orders: number
      unitsSold: number
      revenue: number
      attachmentRate: number
      repeatPurchasePct: number | null
      firstOrderPct: number | null
    }[]
  >([])
  const [productDashboardLoaded, setProductDashboardLoaded] = useState(false)

  const [insightsPeriod, setInsightsPeriod] = useState<
    'today' | 'week' | 'month' | 'all' | 'custom'
  >('week')
  const [insightsCustomFrom, setInsightsCustomFrom] = useState('')
  const [insightsCustomTo, setInsightsCustomTo] = useState('')
  const [nextDelivery, setNextDelivery] = useState<{
    date: string
    dayName: string
    totalOrders: number
    totalMeals: number
    revenue: number
    avgOrderValue: number
    avgMealsPerOrder: number
    subscriptionOrders: number
    paygOrders: number
    topDishes: { name: string; qty: number }[]
    proteinBreakdown: { protein: string; qty: number }[]
  } | null>(null)
  const [insightsCustomerSummary, setInsightsCustomerSummary] = useState<{
    newCustomers: number
    returningCustomers: number
    repeatPurchaseRate: number
    avgReorderDays: number | null
    activeSubscriptions: number
    customersWithOrders: number
  } | null>(null)
  const [insightsFinancial, setInsightsFinancial] = useState<{
    revenue: number
    ordersCount: number
    deliveryCostEstimate: number
  } | null>(null)
  const [insightsAlerts, setInsightsAlerts] = useState<{
    failedPaymentsCount: number
    lowSellingDishes: { name: string; qty: number }[]
  } | null>(null)
  const [insightsOverviewLoaded, setInsightsOverviewLoaded] = useState(false)
  const leafletMapRef = useRef<HTMLDivElement>(null)
  const leafletInstanceRef = useRef<any>(null)

  const [topAlertsCount, setTopAlertsCount] = useState(0)

  const checkAuthAndLoad = async () => {
    setCheckingAuth(true)
    const res = await fetch('/api/admin/overview', { cache: 'no-store' })
    if (res.status === 401) {
      setAuthenticated(false)
      setCheckingAuth(false)
      return
    }
    setAuthenticated(true)
    setCheckingAuth(false)
    const data = await res.json()
    setOverview(data)

    try {
      const failRes = await fetch('/api/admin/payment-failures', { cache: 'no-store' })
      if (failRes.ok) {
        const failData = await failRes.json()
        const unresolved = (failData.failures || []).filter((f: any) => !f.resolved).length
        setTopAlertsCount(unresolved)
      }
    } catch {
      // Non-critical — the bell just shows 0 if this fails.
    }
  }

  useEffect(() => {
    checkAuthAndLoad()
  }, [])

  const login = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoginError(null)
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setLoginError(data.error || 'Login failed')
      return
    }
    setAuthenticated(true)
    checkAuthAndLoad()
  }

  const loadCustomers = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/customers', { cache: 'no-store' })
      if (res.status === 401) {
        setAuthenticated(false)
        return
      }
      if (!res.ok) {
        setCustomers([])
        return
      }
      const data = await res.json()
      setCustomers(data.customers || [])
    } catch {
      setCustomers([])
    } finally {
      setLoading(false)
    }
  }

  const loadMarketingLeads = async () => {
    try {
      const res = await fetch('/api/admin/marketing-leads', { cache: 'no-store' })
      if (res.status === 401) {
        setAuthenticated(false)
        return
      }
      if (!res.ok) {
        setMarketingLeadsLoaded(true)
        return
      }
      const data = await res.json()
      setMarketingLeads(data.leads || [])
      setMarketingLeadsLoaded(true)
    } catch {
      setMarketingLeadsLoaded(true)
    }
  }

  const loadOrders = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/orders', { cache: 'no-store' })
      if (res.status === 401) {
        setAuthenticated(false)
        return
      }
      if (!res.ok) {
        setOrders([])
        return
      }
      const data = await res.json()
      setOrders(data.orders || [])
    } catch {
      setOrders([])
    } finally {
      setLoading(false)
    }
  }

  const loadAddOrderMenuItems = async (windowId: string) => {
    setAddOrderMenuItems([])
    setAddOrderQuantities({})
    if (!windowId) return
    setAddOrderMenuLoading(true)
    try {
      const res = await fetch(`/api/admin/window-menu-items?windowId=${windowId}`, {
        cache: 'no-store',
      })
      const data = await res.json()
      setAddOrderMenuItems(data.items || [])
    } catch {
      setAddOrderMenuItems([])
    }
    setAddOrderMenuLoading(false)
  }

  const submitManualOrder = async (e: React.FormEvent) => {
    e.preventDefault()
    setAddOrderStatus('saving')
    setAddOrderError(null)

    const items = Object.entries(addOrderQuantities)
      .filter(([, qty]) => qty > 0)
      .map(([name, qty]) => {
        const menuItem = addOrderMenuItems.find((m) => m.name === name)
        return { name, qty, price: menuItem?.price || 0 }
      })

    if (items.length === 0) {
      setAddOrderError('Pick at least one dish and set its quantity.')
      setAddOrderStatus('error')
      return
    }

    const selectedWindow = emailWindowOptions.find((w) => w.id === addOrderForm.windowId)
    const deliveryDayLabel = selectedWindow
      ? `${selectedWindow.delivery_day} — ${new Date(selectedWindow.week_start_date).toLocaleDateString('en-GB')}`
      : ''

    const res = await fetch('/api/admin/manual-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: addOrderForm.customerName,
        customerEmail: addOrderForm.customerEmail,
        phone: addOrderForm.phone,
        houseNumber: addOrderForm.houseNumber,
        street: addOrderForm.street,
        postcode: addOrderForm.postcode,
        deliveryInstructions: addOrderForm.deliveryInstructions,
        menuWindowId: addOrderForm.windowId,
        deliveryDay: deliveryDayLabel,
        totalAmount: addOrderForm.totalAmount,
        items,
      }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setAddOrderError(data.error || 'Something went wrong saving this order.')
      setAddOrderStatus('error')
      return
    }

    setAddOrderStatus('idle')
    setShowAddOrder(false)
    setAddOrderForm({
      customerName: '',
      customerEmail: '',
      phone: '',
      houseNumber: '',
      street: '',
      postcode: '',
      deliveryInstructions: '',
      windowId: '',
      totalAmount: '',
    })
    setAddOrderMenuItems([])
    setAddOrderQuantities({})
    loadOrders()
  }

  const parseBulkImportItems = (itemsText: string) => {
    return itemsText
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((line) => {
        const match = line.match(/^(\d+)\s*x\s*(.+?)(?:\s*@\s*([\d.]+))?$/i)
        if (match) {
          return {
            qty: Number(match[1]),
            name: match[2].trim(),
            price: match[3] ? Number(match[3]) : 0,
          }
        }
        return { qty: 1, name: line, price: 0 }
      })
  }

  const submitBulkImport = async () => {
    setBulkImportStatus('saving')
    setBulkImportError(null)

    const selectedWindow = emailWindowOptions.find((w) => w.id === bulkImportWindowId)
    const deliveryDay = selectedWindow?.delivery_day || null

    const lines = bulkImportText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)

    const orders: any[] = []
    for (const line of lines) {
      const parts = line.split('|').map((p) => p.trim())
      if (parts.length < 6) {
        setBulkImportError(`This line doesn't have all 6 fields: "${line}"`)
        setBulkImportStatus('error')
        return
      }
      const [customerName, phone, houseNumber, street, postcode, totalAmount, itemsText] = parts
      orders.push({
        customerName,
        phone,
        houseNumber,
        street,
        postcode,
        totalAmount,
        items: parseBulkImportItems(itemsText || ''),
      })
    }

    try {
      const res = await fetch('/api/admin/bulk-import-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ menuWindowId: bulkImportWindowId, deliveryDay, orders }),
      })
      const data = await res.json()
      if (!res.ok) {
        setBulkImportError(data.error || 'Something went wrong')
        setBulkImportStatus('error')
        return
      }
      setBulkImportCount(data.count || 0)
      setBulkImportStatus('done')
      setBulkImportText('')
      loadOrders()
    } catch {
      setBulkImportError('Network error — please try again')
      setBulkImportStatus('error')
    }
  }

  const loadRecurringOrders = async () => {
    try {
      const res = await fetch('/api/admin/recurring-manual-orders', { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      setRecurringOrdersList(data.recurringOrders || [])
    } catch {
      // non-critical
    }
  }

  const toggleRecurringOrderActive = async (id: string, active: boolean) => {
    await fetch('/api/admin/recurring-manual-orders', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, active }),
    })
    loadRecurringOrders()
  }

  const setupRecurringOrder = async () => {
    setRepeatStatus('saving')
    setRepeatError(null)

    const items = Object.entries(addOrderQuantities)
      .filter(([, qty]) => qty > 0)
      .map(([name, qty]) => {
        const menuItem = addOrderMenuItems.find((m) => m.name === name)
        return { name, qty, price: menuItem?.price || 0 }
      })

    try {
      const res = await fetch('/api/admin/recurring-manual-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: addOrderForm.customerName,
          email: addOrderForm.customerEmail,
          postcode: addOrderForm.postcode,
          deliveryDay: repeatDeliveryDay,
          items,
          totalAmount: Number(addOrderForm.totalAmount) || 0,
          repeatMode,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setRepeatError(data.error || 'Something went wrong setting this up.')
        setRepeatStatus('error')
        return
      }
      setRepeatStatus('done')
      loadRecurringOrders()
    } catch {
      setRepeatError('Network error — please try again')
      setRepeatStatus('error')
    }
  }

  const loadMenu = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/menu', { cache: 'no-store' })
      if (res.status === 401) {
        setAuthenticated(false)
        return
      }
      if (!res.ok) {
        setMenuLoaded(true)
        return
      }
      const data = await res.json()
      setMenuItems(data.menuItems || [])
      setMenuWindows(data.windows || [])
      setSelectedByWindow(data.selectedByWindow || {})
      setMenuLoaded(true)
    } catch {
      setMenuLoaded(true)
    } finally {
      setLoading(false)
    }
  }

  const toggleMenuItem = async (windowId: string, itemId: string, currentlyOn: boolean) => {
    setTogglingItem(`${windowId}-${itemId}`)

    // Optimistic update so the toggle feels instant — reverted below if
    // the request actually fails.
    setSelectedByWindow((prev) => {
      const current = prev[windowId] || []
      return {
        ...prev,
        [windowId]: currentlyOn
          ? current.filter((id) => id !== itemId)
          : [...current, itemId],
      }
    })

    const res = await fetch('/api/admin/menu', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        menuWindowId: windowId,
        menuItemId: itemId,
        action: currentlyOn ? 'remove' : 'add',
      }),
    })

    if (!res.ok) {
      // Revert on failure
      setSelectedByWindow((prev) => {
        const current = prev[windowId] || []
        return {
          ...prev,
          [windowId]: currentlyOn
            ? [...current, itemId]
            : current.filter((id) => id !== itemId),
        }
      })
    }

    setTogglingItem(null)
  }

  const loadMapPoints = async (dateFilter?: string) => {
    setLoading(true)
    try {
      const url = dateFilter
        ? `/api/admin/order-locations?date=${dateFilter}`
        : '/api/admin/order-locations'
      const res = await fetch(url, { cache: 'no-store' })
      if (res.status === 401) {
        setAuthenticated(false)
        return
      }
      if (!res.ok) {
        setMapPoints([])
        setMapLoaded(true)
        return
      }
      const data = await res.json()
      setMapPoints(data.points || [])
      setMapLoaded(true)
    } catch {
      setMapPoints([])
      setMapLoaded(true)
    } finally {
      setLoading(false)
    }
  }

  const loadTopDishes = async (period: 'week' | 'month' | 'all') => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/top-dishes?period=${period}`, { cache: 'no-store' })
      if (res.status === 401) {
        setAuthenticated(false)
        return
      }
      if (!res.ok) {
        setTopDishes([])
        setTopDishesLoaded(true)
        return
      }
      const data = await res.json()
      setTopDishes(data.dishes || [])
      setTopDishesLoaded(true)
    } catch {
      setTopDishes([])
      setTopDishesLoaded(true)
    } finally {
      setLoading(false)
    }
  }

  const loadDishPairs = async () => {
    try {
      const res = await fetch('/api/admin/dish-pairs', { cache: 'no-store' })
      if (res.status === 401) {
        setAuthenticated(false)
        return
      }
      if (!res.ok) {
        setDishPairs([])
        setDishPairsLoaded(true)
        return
      }
      const data = await res.json()
      setDishPairs(data.pairs || [])
      setDishPairsLoaded(true)
    } catch {
      setDishPairs([])
      setDishPairsLoaded(true)
    }
  }

  const loadProductDashboard = async () => {
    try {
      const res = await fetch('/api/admin/product-dashboard', { cache: 'no-store' })
      if (res.status === 401) {
        setAuthenticated(false)
        return
      }
      if (!res.ok) {
        setProductDishes([])
        setProductDashboardLoaded(true)
        return
      }
      const data = await res.json()
      setProductDishes(data.dishes || [])
      setProductDashboardLoaded(true)
    } catch {
      setProductDishes([])
      setProductDashboardLoaded(true)
    }
  }

  const loadInsightsOverview = async (
    period: typeof insightsPeriod,
    customFrom?: string,
    customTo?: string
  ) => {
    try {
      let url = `/api/admin/insights-overview?period=${period}`
      if (period === 'custom' && customFrom) {
        url += `&from=${customFrom}${customTo ? `&to=${customTo}` : ''}`
      }
      const res = await fetch(url, { cache: 'no-store' })
      if (res.status === 401) {
        setAuthenticated(false)
        return
      }
      if (!res.ok) {
        setInsightsOverviewLoaded(true)
        return
      }
      const data = await res.json()
      setNextDelivery(data.nextDelivery || null)
      setInsightsCustomerSummary(data.customerSummary || null)
      setInsightsFinancial(data.financial || null)
      setInsightsAlerts(data.alerts || null)
      setInsightsOverviewLoaded(true)
    } catch {
      setInsightsOverviewLoaded(true)
    }
  }

  const loadOpsHub = async () => {
    try {
      const res = await fetch('/api/admin/ops-hub', { cache: 'no-store' })
      if (res.status === 401) {
        setAuthenticated(false)
        return
      }
      if (!res.ok) {
        setOpsHubLoaded(true)
        return
      }
      const data = await res.json()
      setOpsHub(data)
      setOpsHubLoaded(true)
    } catch {
      setOpsHubLoaded(true)
    }
  }

  const postOpsAction = async (action: string, payload?: any) => {
    if (!opsHub?.nextWindow?.id) return
    try {
      const res = await fetch('/api/admin/ops-hub', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ menuWindowId: opsHub.nextWindow.id, action, payload }),
      })
      if (!res.ok) return
      const data = await res.json()
      setOpsHub((prev: any) => (prev ? { ...prev, opsStatus: data.opsStatus } : prev))
    } catch {
      // Silent failure is acceptable here — the toggle just won't stick,
      // and the next full reload will show the real persisted state.
    }
  }

  const generateSecurePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%'
    let pw = ''
    const randomValues = new Uint32Array(14)
    crypto.getRandomValues(randomValues)
    for (let i = 0; i < 14; i++) {
      pw += chars[randomValues[i] % chars.length]
    }
    return pw
  }

  const openResetPassword = (customerId: string, customerName: string) => {
    setResetPasswordCustomer({ id: customerId, name: customerName })
    setNewPasswordValue(generateSecurePassword())
    setResetPasswordStatus('idle')
    setResetPasswordError(null)
    setPasswordCopied(false)
  }

  const openEditCustomerEmail = (customerId: string, customerName: string, currentEmail: string) => {
    setEditEmailCustomer({ id: customerId, name: customerName })
    setEditCustomerEmailValue(currentEmail)
    setEditCustomerEmailStatus('idle')
    setEditCustomerEmailError(null)
  }

  const submitCustomerEmailEdit = async () => {
    if (!editEmailCustomer) return
    setEditCustomerEmailStatus('saving')
    setEditCustomerEmailError(null)
    try {
      const res = await fetch('/api/admin/edit-customer-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: editEmailCustomer.id,
          newEmail: editCustomerEmailValue,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setEditCustomerEmailError(data.error || 'Something went wrong')
        setEditCustomerEmailStatus('error')
        return
      }
      setEditCustomerEmailStatus('done')
      loadCustomers()
    } catch {
      setEditCustomerEmailError('Network error — please try again')
      setEditCustomerEmailStatus('error')
    }
  }

  const openEditDelivery = (customer: Customer) => {
    setEditDeliveryCustomer({ id: customer.id, name: customer.full_name || 'this customer' })
    setEditDeliveryPrimaryDay((customer.standing_delivery_day as 'Sunday' | 'Wednesday') || 'Sunday')
    setEditDeliveryPerWeek((customer.deliveries_per_week as 1 | 2) || 1)
    setEditDeliveryStatus('idle')
    setEditDeliveryError(null)
  }

  const submitDeliveryEdit = async () => {
    if (!editDeliveryCustomer) return
    setEditDeliveryStatus('saving')
    setEditDeliveryError(null)
    try {
      const res = await fetch('/api/admin/edit-customer-delivery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: editDeliveryCustomer.id,
          primaryDay: editDeliveryPrimaryDay,
          deliveriesPerWeek: editDeliveryPerWeek,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setEditDeliveryError(data.error || 'Something went wrong')
        setEditDeliveryStatus('error')
        return
      }
      setEditDeliveryStatus('done')
      loadCustomers()
    } catch {
      setEditDeliveryError('Network error — please try again')
      setEditDeliveryStatus('error')
    }
  }

  const submitPasswordReset = async () => {
    if (!resetPasswordCustomer) return
    setResetPasswordStatus('saving')
    setResetPasswordError(null)
    try {
      const res = await fetch('/api/admin/reset-customer-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: resetPasswordCustomer.id,
          newPassword: newPasswordValue,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setResetPasswordError(data.error || 'Something went wrong')
        setResetPasswordStatus('error')
        return
      }
      setResetPasswordStatus('done')
    } catch {
      setResetPasswordError('Network error — please try again')
      setResetPasswordStatus('error')
    }
  }

  const openOrderDetail = async (orderId: string) => {
    setSelectedOrderId(orderId)
    setOrderDetail(null)
    setOrderDetailLoading(true)
    setOrderActionStatus('idle')
    setOrderActionError(null)
    setChargeAmountInput('')
    setResendEmailStatus('idle')
    setResendEmailError(null)
    setDpdShipmentStatus('idle')
    setDpdShipmentError(null)
    setDpdLabelStatus('idle')
    setDpdLabelError(null)
    setDpdLabelHtml(null)
    try {
      const res = await fetch(`/api/admin/order-detail?id=${orderId}`, { cache: 'no-store' })
      if (!res.ok) {
        setOrderDetailLoading(false)
        return
      }
      const data = await res.json()
      setOrderDetail(data)
      setEditingItems(data.order.items || [])
      setEditingDeliveryDay(data.order.delivery_day || '')
      setEditEmailInput(data.order.ship_email || '')
    } catch {
      // leave orderDetail null — the modal shows a loading/error state
    } finally {
      setOrderDetailLoading(false)
    }
  }

  const closeOrderDetail = () => {
    setSelectedOrderId(null)
    setOrderDetail(null)
  }

  const resendOrderEmail = async () => {
    if (!selectedOrderId) return
    setResendEmailStatus('sending')
    setResendEmailError(null)
    try {
      const res = await fetch('/api/admin/send-order-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: selectedOrderId, emailType: resendEmailType }),
      })
      const data = await res.json()
      if (!res.ok) {
        setResendEmailError(data.error || 'Something went wrong')
        setResendEmailStatus('error')
        return
      }
      setResendEmailStatus('done')
    } catch {
      setResendEmailError('Network error — please try again')
      setResendEmailStatus('error')
    }
  }

  const createDpdShipmentAction = async () => {
    if (!selectedOrderId) return
    setDpdShipmentStatus('creating')
    setDpdShipmentError(null)
    try {
      const res = await fetch('/api/admin/create-dpd-shipment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: selectedOrderId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setDpdShipmentError(data.error || 'Something went wrong')
        setDpdShipmentStatus('error')
        return
      }
      setDpdShipmentStatus('idle')
      openOrderDetail(selectedOrderId) // refresh to show the new shipment info
    } catch {
      setDpdShipmentError('Network error — please try again')
      setDpdShipmentStatus('error')
    }
  }

  const getDpdLabelAction = async () => {
    if (!selectedOrderId) return
    setDpdLabelStatus('loading')
    setDpdLabelError(null)
    setDpdLabelHtml(null)
    try {
      const res = await fetch(`/api/admin/get-dpd-label?orderId=${selectedOrderId}`, {
        cache: 'no-store',
      })
      const data = await res.json()
      if (!res.ok) {
        setDpdLabelError(data.error || 'Something went wrong')
        setDpdLabelStatus('error')
        return
      }
      setDpdLabelHtml(data.labels?.[0] || null)
      setDpdLabelStatus('idle')
    } catch {
      setDpdLabelError('Network error — please try again')
      setDpdLabelStatus('error')
    }
  }

  const deleteOrder = async (orderId: string) => {
    setOrderActionStatus('saving')
    try {
      const res = await fetch(`/api/admin/order-detail?id=${orderId}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setOrderActionError(data.error || 'Could not delete this order')
        setOrderActionStatus('error')
        return
      }
      closeOrderDetail()
      loadOrders()
    } catch {
      setOrderActionError('Network error — please try again')
      setOrderActionStatus('error')
    }
  }

  const orderDetailAction = async (action: string, payload?: any) => {
    if (!selectedOrderId) return
    setOrderActionStatus('saving')
    setOrderActionError(null)
    try {
      const res = await fetch('/api/admin/order-detail', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedOrderId, action, payload }),
      })
      const data = await res.json()
      if (!res.ok) {
        setOrderActionError(data.error || 'Something went wrong')
        setOrderActionStatus('error')
        return
      }
      setOrderActionStatus('idle')
      // Refresh both the detail view and the underlying orders list so
      // everything stays consistent after any change.
      await openOrderDetail(selectedOrderId)
      loadOrders()
    } catch {
      setOrderActionError('Network error — please try again')
      setOrderActionStatus('error')
    }
  }

  const saveEditedItems = () => {
    const totalAmount = editingItems.reduce((sum, i) => sum + i.price * i.qty, 0)
    orderDetailAction('update_items', { items: editingItems, totalAmount })
  }

  const printKitchenSheet = () => {
    if (!opsHub?.kitchen) return
    const w = window.open('', '_blank')
    if (!w) return
    const rows = opsHub.kitchen.dishesToCook
      .map((d: any) => `<tr><td style="padding:10px 0;border-bottom:1px solid #ddd;font-size:16px;">${d.name}</td><td style="padding:10px 0;border-bottom:1px solid #ddd;font-size:20px;font-weight:800;text-align:right;">×${d.qty}</td></tr>`)
      .join('')
    const ingredientRows = opsHub.kitchen.ingredientsRequired
      .map((i: any) => `<tr><td style="padding:8px 0;border-bottom:1px solid #eee;">${i.name}</td><td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;">${i.kg}kg</td></tr>`)
      .join('')
    w.document.write(`<html><head><style>@media print{@page{margin:10mm;}}body{font-family:Arial,sans-serif;padding:20px;}</style></head><body>
      <h1>Kitchen Sheet — ${opsHub.nextWindow?.dayName} (w/c ${opsHub.nextWindow ? new Date(opsHub.nextWindow.date).toLocaleDateString('en-GB') : ''})</h1>
      <h2>Meals to cook</h2>
      <table style="width:100%;border-collapse:collapse;">${rows}</table>
      <h2 style="margin-top:24px;">Ingredients required (approximate)</h2>
      <table style="width:100%;border-collapse:collapse;">${ingredientRows}</table>
    </body></html>`)
    w.document.close()
    w.print()
  }

  // Loads Leaflet from a CDN (same approach as the ops hub) so we get a
  // real OpenStreetMap-backed map with actual roads/coastline, without
  // adding a new npm dependency to the build.
  useEffect(() => {
    if (tab === 'email-marketing' && emailWindowOptions.length === 0) {
      loadEmailWindowOptions()
    }
  }, [tab])

  useEffect(() => {
    if (tab !== 'map') return
    if (loading || mapPoints.length === 0) return
    if (!leafletMapRef.current) return

    const HQ_LAT = 53.025
    const HQ_LNG = -2.175

    function renderLeafletMap() {
      const L = (window as any).L
      if (!L || !leafletMapRef.current) return

      if (leafletInstanceRef.current) {
        leafletInstanceRef.current.remove()
        leafletInstanceRef.current = null
      }

      const map = L.map(leafletMapRef.current).setView([HQ_LAT, HQ_LNG], 9)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 18,
      }).addTo(map)
      leafletInstanceRef.current = map

      const hqIcon = L.divIcon({
        html: '<div style="background:#2d3510;color:#faf8f4;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:10px;border:2px solid #c9a84c;">HQ</div>',
        className: '',
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      })
      L.marker([HQ_LAT, HQ_LNG], { icon: hqIcon }).addTo(map).bindPopup('<b>prepcuisines HQ</b><br>102A Sun Street')

      const maxCount = Math.max(1, ...mapPoints.map((p) => p.count))
      const bounds: [number, number][] = [[HQ_LAT, HQ_LNG]]

      mapPoints.forEach((p) => {
        const size = 20 + (p.count / maxCount) * 16
        const icon = L.divIcon({
          html: `<div style="background:#c9a84c;color:#2d3510;border-radius:50%;width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:11px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.35);">${p.count}</div>`,
          className: '',
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        })
        L.marker([p.lat, p.lon], { icon })
          .addTo(map)
          .bindPopup(`<b>${p.postcode}</b><br>${p.count} order${p.count !== 1 ? 's' : ''}`)
        bounds.push([p.lat, p.lon])
      })

      if (bounds.length > 1) {
        map.fitBounds(bounds, { padding: [40, 40] })
      }
      setTimeout(() => map.invalidateSize(), 100)
    }

    if ((window as any).L) {
      renderLeafletMap()
      return
    }

    const existingLink = document.querySelector('link[data-leaflet]')
    if (!existingLink) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      link.setAttribute('data-leaflet', 'true')
      document.head.appendChild(link)
    }

    const existingScript = document.querySelector('script[data-leaflet]')
    if (existingScript) {
      existingScript.addEventListener('load', renderLeafletMap)
      return
    }

    const script = document.createElement('script')
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    script.setAttribute('data-leaflet', 'true')
    script.onload = renderLeafletMap
    document.body.appendChild(script)

    return () => {
      if (leafletInstanceRef.current) {
        leafletInstanceRef.current.remove()
        leafletInstanceRef.current = null
      }
    }
  }, [tab, loading, mapPoints])

  useEffect(() => {
    if (!authenticated) return
    if (tab === 'customers' && customers.length === 0) loadCustomers()
    if (tab === 'customers' && !marketingLeadsLoaded) loadMarketingLeads()
    if (tab === 'orders' && orders.length === 0) loadOrders()
    if (tab === 'orders' && recurringOrdersList.length === 0) loadRecurringOrders()
    if (tab === 'menu' && !menuLoaded) loadMenu()
    if (tab === 'map' && !mapLoaded) loadMapPoints()
    if (tab === 'insights' && !insightsOverviewLoaded) loadInsightsOverview(insightsPeriod)
    if (tab === 'insights' && customers.length === 0) loadCustomers()
    if (tab === 'product-analytics' && !topDishesLoaded) loadTopDishes(topDishesPeriod)
    if (tab === 'product-analytics' && !dishPairsLoaded) loadDishPairs()
    if (tab === 'product-analytics' && !productDashboardLoaded) loadProductDashboard()
    if (tab === 'ops-hub' && !opsHubLoaded) loadOpsHub()
  }, [tab, authenticated])

  const [refreshing, setRefreshing] = useState(false)

  // Topbar refresh — re-fetches the data behind the current tab so a full
  // page reload is never needed. Always fetches fresh, ignoring the
  // "already loaded" guards the tab-switch effect uses.
  const refreshCurrentTab = async () => {
    if (refreshing) return
    setRefreshing(true)
    try {
      const jobs: Promise<unknown>[] = []
      if (tab === 'customers') jobs.push(loadCustomers(), loadMarketingLeads())
      else if (tab === 'orders' || tab === 'cook-sheet')
        jobs.push(loadOrders(), loadRecurringOrders())
      else if (tab === 'menu') jobs.push(loadMenu())
      else if (tab === 'map') jobs.push(loadMapPoints(mapDateFilter || undefined))
      else if (tab === 'insights')
        jobs.push(
          insightsPeriod === 'custom'
            ? loadInsightsOverview('custom', insightsCustomFrom, insightsCustomTo)
            : loadInsightsOverview(insightsPeriod),
          loadCustomers()
        )
      else if (tab === 'product-analytics')
        jobs.push(loadTopDishes(topDishesPeriod), loadDishPairs(), loadProductDashboard())
      else if (tab === 'ops-hub') jobs.push(loadOpsHub())
      else jobs.push(loadOrders(), loadCustomers())
      await Promise.all(jobs)
    } finally {
      setRefreshing(false)
    }
  }

  const statusBreakdown = useMemo(() => {
    const active = customers.filter((c) => (c.effectiveStatus ?? c.subscription_status) === 'active').length
    const cancelled = customers.filter((c) => (c.effectiveStatus ?? c.subscription_status) === 'cancelled').length
    const payg = customers.filter((c) => {
      const s = c.effectiveStatus ?? c.subscription_status
      return !s || s === 'none' || s === 'incomplete'
    }).length
    return { active, cancelled, payg, total: customers.length }
  }, [customers])

  const filteredCustomers = useMemo(
    () =>
      customers.filter((c) => {
        const status = c.effectiveStatus ?? c.subscription_status
        const matchesSegment = (() => {
          switch (segment) {
            case 'active':
              return status === 'active'
            case 'cancelled':
              return status === 'cancelled'
            case 'payg':
              return !status || status === 'none' || status === 'incomplete'
            case 'lapsed_30':
              return c.lapsedTier === '30'
            case 'lapsed_60':
              return c.lapsedTier === '60'
            case 'lapsed_90':
              return c.lapsedTier === '90+'
            case 'loyal':
              return c.isLoyal
            case 'new_this_week':
              return c.isNewThisWeek
            case 'win_back':
              return c.isWinBackCandidate
            case 'email_subscribed':
              return c.marketing_consent === true
            default:
              return true
          }
        })()

        const matchesSearch =
          !customerSearch ||
          (c.full_name || '').toLowerCase().includes(customerSearch.toLowerCase()) ||
          (c.email || '').toLowerCase().includes(customerSearch.toLowerCase()) ||
          (c.postcode || '').toLowerCase().includes(customerSearch.toLowerCase())

        const matchesDate = (() => {
          if (customerDateField === 'delivery_day') {
            if (!customerSingleDate) return true
            const weekday = new Date(`${customerSingleDate}T00:00:00`).toLocaleDateString('en-GB', {
              weekday: 'long',
            })
            return c.standing_delivery_day === weekday || c.second_delivery_day === weekday
          }

          const dateStr =
            customerDateField === 'last_order'
              ? c.lastOrderAt
                ? c.lastOrderAt.slice(0, 10)
                : null
              : c.created_at
              ? c.created_at.slice(0, 10)
              : null

          const matchesFrom = !customerDateFrom || (dateStr && dateStr >= customerDateFrom)
          const matchesTo = !customerDateTo || (dateStr && dateStr <= customerDateTo)
          return matchesFrom && matchesTo
        })()

        return matchesSegment && matchesSearch && matchesDate
      }),
    [
      customers,
      segment,
      customerSearch,
      customerDateField,
      customerDateFrom,
      customerDateTo,
      customerSingleDate,
    ]
  )

  const emailLists = useMemo(() => {
    // Only customers who explicitly ticked "Keep me updated" at signup —
    // this is a real consent record, not just anyone with an email
    // address, so these lists stay safe to actually email or sync to
    // Klaviyo later.
    const consented = customers.filter((c) => c.marketing_consent === true)

    // Marketing leads (e.g. imported from Shopify) aren't real ordering
    // customers, so they don't have the full Customer shape — only email
    // matters for this card, so they're merged in as minimal stand-ins.
    const leadsAsEntries = marketingLeads.map((l) => ({ email: l.email }) as Customer)

    const topSpenders = consented
      .slice()
      .sort((a, b) => b.totalSpend - a.totalSpend)
      .slice(0, 10)

    return [
      {
        key: 'all_subscribed',
        label: 'All marketing opt-ins',
        customers: [...consented, ...leadsAsEntries],
      },
      {
        key: 'shopify_leads',
        label: 'Imported Shopify leads',
        customers: leadsAsEntries,
      },
      {
        key: 'lapsed_30',
        label: 'Lapsed 30+ days',
        customers: consented.filter((c) => c.lapsedTier === '30'),
      },
      {
        key: 'lapsed_60',
        label: 'Lapsed 60+ days',
        customers: consented.filter((c) => c.lapsedTier === '60'),
      },
      {
        key: 'lapsed_90',
        label: 'Lapsed 90+ days',
        customers: consented.filter((c) => c.lapsedTier === '90+'),
      },
      {
        key: 'new_this_week',
        label: 'New this week',
        customers: consented.filter((c) => c.isNewThisWeek),
      },
      {
        key: 'win_back',
        label: 'Win-back candidates',
        customers: consented.filter((c) => c.isWinBackCandidate),
      },
      {
        key: 'top_spenders',
        label: 'Top 10 spenders',
        customers: topSpenders,
      },
    ]
  }, [customers, marketingLeads])

  const copyEmailList = (key: string, emails: string[]) => {
    const text = emails.join(', ')
    navigator.clipboard.writeText(text).then(() => {
      setCopiedListKey(key)
      setTimeout(() => setCopiedListKey((k) => (k === key ? null : k)), 2500)
    })
  }

  const loadEmailWindowOptions = async () => {
    try {
      const res = await fetch('/api/admin/emails-by-window', { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      setEmailWindowOptions(data.windows || [])
    } catch {
      // leave options empty — the picker just shows nothing to select
    }
  }

  const copyEmailsForWindow = async (windowId: string) => {
    if (!windowId) return
    setEmailWindowCopyStatus('loading')
    try {
      const res = await fetch(`/api/admin/emails-by-window?windowId=${windowId}`, {
        cache: 'no-store',
      })
      const data = await res.json()
      if (!res.ok) {
        setEmailWindowCopyStatus('idle')
        return
      }
      const text = (data.emails || []).join(', ')
      await navigator.clipboard.writeText(text)
      setEmailWindowCopyCount(data.emails?.length || 0)
      setEmailWindowCopyStatus('copied')
      setTimeout(() => setEmailWindowCopyStatus((s) => (s === 'copied' ? 'idle' : s)), 2500)
    } catch {
      setEmailWindowCopyStatus('idle')
    }
  }

  const sendTestNeoEmail = async () => {
    if (!testEmailAddress) return
    setTestEmailStatus('sending')
    setTestEmailError(null)
    try {
      const res = await fetch('/api/admin/test-neo-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: testEmailAddress }),
      })
      const data = await res.json()
      if (!res.ok) {
        setTestEmailError(data.error || 'Send failed')
        setTestEmailStatus('error')
        return
      }
      setTestEmailStatus('done')
    } catch {
      setTestEmailError('Network error — please try again')
      setTestEmailStatus('error')
    }
  }

  const testDpdConnectionAction = async () => {
    setDpdTestStatus('testing')
    setDpdTestResult(null)
    try {
      const res = await fetch(`/api/admin/test-dpd?env=live`, { cache: 'no-store' })
      const data = await res.json()
      setDpdTestResult({
        connected: !!data.connected,
        message: data.message || 'Unknown result',
        keyPreview: data.keyPreview,
      })
      setDpdTestStatus('done')
    } catch {
      setDpdTestResult({ connected: false, message: 'Network error — please try again' })
      setDpdTestStatus('done')
    }
  }

  const lookupDpdServicesAction = async () => {
    setDpdLookupStatus('loading')
    setDpdLookupError(null)
    setDpdLookupServices([])
    try {
      const res = await fetch('/api/admin/dpd-outbound-services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deliveryPostcode: dpdLookupPostcode,
          deliveryTown: dpdLookupTown,
          env: 'live',
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        setDpdLookupError(data.error || 'Something went wrong')
        setDpdLookupStatus('error')
        return
      }
      setDpdLookupServices(data.services || [])
      setDpdLookupStatus('done')
    } catch {
      setDpdLookupError('Network error — please try again')
      setDpdLookupStatus('error')
    }
  }

  const runKlaviyoSync = async () => {
    setKlaviyoSyncStatus('syncing')
    setKlaviyoSyncError(null)
    try {
      const res = await fetch('/api/admin/klaviyo-sync-all', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setKlaviyoSyncError(data.error || 'Sync failed')
        setKlaviyoSyncStatus('error')
        return
      }
      setKlaviyoSyncResult(data)
      setKlaviyoSyncStatus('done')
    } catch {
      setKlaviyoSyncError('Network error — please try again')
      setKlaviyoSyncStatus('error')
    }
  }

  const handleShopifyCsvImport = (file: File) => {
    setImportStatus('parsing')
    setImportError(null)
    setImportSummary(null)

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const rows = (results.data as any[]).map((r) => ({
          email: (r['Email'] || '').trim(),
          firstName: (r['First Name'] || '').trim(),
          lastName: (r['Last Name'] || '').trim(),
          phone: (r['Phone'] || r['Default Address Phone'] || '').replace(/^'/, '').trim(),
          acceptsEmailMarketing:
            (r['Accepts Email Marketing'] || '').trim().toLowerCase() === 'yes',
        }))

        setImportStatus('importing')
        const batchSize = 300
        const aggregate = {
          totalRowsReceived: 0,
          consentedRows: 0,
          updatedExistingCustomers: 0,
          createdLeads: 0,
          skippedExplicitChoice: 0,
        }
        setImportProgress({ done: 0, total: rows.length })

        try {
          for (let i = 0; i < rows.length; i += batchSize) {
            const batch = rows.slice(i, i + batchSize)
            const res = await fetch('/api/admin/import-marketing-leads', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ rows: batch }),
            })
            if (!res.ok) {
              const data = await res.json().catch(() => ({}))
              setImportError(data.error || 'Import failed partway through')
              setImportStatus('error')
              return
            }
            const data = await res.json()
            aggregate.totalRowsReceived += data.totalRowsReceived || 0
            aggregate.consentedRows += data.consentedRows || 0
            aggregate.updatedExistingCustomers += data.updatedExistingCustomers || 0
            aggregate.createdLeads += data.createdLeads || 0
            aggregate.skippedExplicitChoice += data.skippedExplicitChoice || 0
            setImportProgress({ done: Math.min(i + batchSize, rows.length), total: rows.length })
          }
          setImportSummary(aggregate)
          setImportStatus('done')
          loadCustomers()
          loadMarketingLeads()
        } catch {
          setImportError('Network error partway through the import')
          setImportStatus('error')
        }
      },
      error: () => {
        setImportError('Could not read that file — make sure it\'s a CSV export from Shopify')
        setImportStatus('error')
      },
    })
  }

  const repeatPurchaseStats = useMemo(() => {
    // Base is customers who've ordered at least once — repeat rate measures
    // how many of those come back, not how many of ALL signups do.
    const withAtLeastOne = customers.filter((c) => c.orderCount >= 1)
    const base = withAtLeastOne.length || 1

    const pctAtLeast = (n: number) =>
      Math.round((withAtLeastOne.filter((c) => c.orderCount >= n).length / base) * 100)

    const gaps = customers
      .map((c) => c.avgDaysBetweenOrders)
      .filter((g): g is number => g !== null && g !== undefined)

    const avgReorderDays =
      gaps.length > 0 ? Math.round(gaps.reduce((sum, g) => sum + g, 0) / gaps.length) : null

    return {
      customersWithOrders: withAtLeastOne.length,
      second: pctAtLeast(2),
      third: pctAtLeast(3),
      fourth: pctAtLeast(4),
      avgReorderDays,
    }
  }, [customers])

  const filteredOrders = useMemo(
    () =>
      orders.filter((o) => {
        if (!orderSearch) return true
        const q = orderSearch.toLowerCase()
        return (
          o.customer_name.toLowerCase().includes(q) ||
          (o.customer_email || '').toLowerCase().includes(q) ||
          (o.ship_postcode || '').toLowerCase().includes(q)
        )
      }),
    [orders, orderSearch]
  )

  // Manual/bulk orders store richer day labels like "Sunday — 09/08/2026";
  // normalise to the bare day name so they group into the same tally,
  // cook sheet, and print-labels window as regular orders.
  const dayNameOf = (d: string | null | undefined) => {
    const raw = (d || 'Unknown').split('—')[0].split('-')[0].trim().split(' ')[0] || 'Unknown'
    return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase()
  }


  const orderTally = useMemo(() => {
    const groups = new Map<
      string,
      { key: string; day: string; week: string | null; count: number; total: number }
    >()
    for (const o of filteredOrders) {
      if (o.cancelled) continue
      const week = o.menu_windows?.week_start_date
        ? new Date(o.menu_windows.week_start_date).toLocaleDateString('en-GB')
        : null
      const day = dayNameOf(o.delivery_day)
      const key = `${week}__${day}`
      const existing = groups.get(key)
      if (existing) {
        existing.count += 1
        existing.total += o.total_amount || 0
      } else {
        groups.set(key, { key, day, week, count: 1, total: o.total_amount || 0 })
      }
    }
    return Array.from(groups.values()).sort((a, b) => {
      if (a.week === b.week) return a.day.localeCompare(b.day)
      return (a.week || '').localeCompare(b.week || '')
    })
  }, [filteredOrders])

  const [expandedTallyKey, setExpandedTallyKey] = useState<string | null>(null)

  const cookSheetForKey = useMemo(() => {
    if (!expandedTallyKey) return []
    const dishTotals = new Map<string, { qty: number; stokeQty: number; outQty: number }>()
    for (const o of filteredOrders) {
      if (o.cancelled) continue
      const week = o.menu_windows?.week_start_date
        ? new Date(o.menu_windows.week_start_date).toLocaleDateString('en-GB')
        : null
      const day = dayNameOf(o.delivery_day)
      const key = `${week}__${day}`
      if (key !== expandedTallyKey) continue
      const stoke = (o.ship_postcode || '').trim().toUpperCase().startsWith('ST')
      for (const item of o.items || []) {
        if (!item.name || item.name === 'Delivery') continue
        const entry = dishTotals.get(item.name) || { qty: 0, stokeQty: 0, outQty: 0 }
        entry.qty += item.qty || 0
        if (stoke) entry.stokeQty += item.qty || 0
        else entry.outQty += item.qty || 0
        dishTotals.set(item.name, entry)
      }
    }
    return Array.from(dishTotals.entries())
      .map(([name, v]) => ({ name, qty: v.qty, stokeQty: v.stokeQty, outQty: v.outQty }))
      .sort((a, b) => b.qty - a.qty)
  }, [expandedTallyKey, filteredOrders])

  const [cookSheetRegion, setCookSheetRegion] = useState<'all' | 'stoke' | 'nationwide'>('all')
  const [showCookSheetList, setShowCookSheetList] = useState(true)

  // The cook sheet the user is actually looking at: 'all' shows totals with
  // the ST/Nat split, a region shows that region's quantities only.
  const cookSheetDisplay = useMemo(() => {
    if (cookSheetRegion === 'all') return cookSheetForKey
    return cookSheetForKey
      .map((d) => ({ ...d, qty: cookSheetRegion === 'stoke' ? d.stokeQty : d.outQty }))
      .filter((d) => d.qty > 0)
      .sort((a, b) => b.qty - a.qty)
  }, [cookSheetForKey, cookSheetRegion])

  const cookSheetRegionLabel =
    cookSheetRegion === 'stoke'
      ? 'Stoke-on-Trent'
      : cookSheetRegion === 'nationwide'
        ? 'Nationwide'
        : null

  const [cookSheetCopied, setCookSheetCopied] = useState(false)

  const cookSheetAsText = () => {
    const tally = orderTally.find((t) => t.key === expandedTallyKey)
    const title = `Cook sheet — ${tally?.day || ''}${tally?.week ? ` (w/c ${tally.week})` : ''}${
      cookSheetRegionLabel ? ` — ${cookSheetRegionLabel} only` : ''
    }`
    const totalItems = cookSheetDisplay.reduce((s, d) => s + d.qty, 0)
    if (cookSheetRegion !== 'all') {
      const lines = cookSheetDisplay.map((d) => `${d.qty}x  ${d.name}`)
      return [title, '', ...lines, '', `Total items: ${totalItems}`].join('\n')
    }
    const totalStoke = cookSheetForKey.reduce((s, d) => s + d.stokeQty, 0)
    const totalOut = cookSheetForKey.reduce((s, d) => s + d.outQty, 0)
    const lines = cookSheetDisplay.map(
      (d) => `${d.qty}x  ${d.name}  (Stoke ${d.stokeQty} / Nationwide ${d.outQty})`
    )
    return [
      title,
      '',
      ...lines,
      '',
      `Total items: ${totalItems} (Stoke ${totalStoke} / Nationwide ${totalOut})`,
    ].join('\n')
  }

  const copyCookSheet = () => {
    navigator.clipboard.writeText(cookSheetAsText()).then(() => {
      setCookSheetCopied(true)
      setTimeout(() => setCookSheetCopied(false), 2000)
    })
  }

  const downloadCookSheet = () => {
    const tally = orderTally.find((t) => t.key === expandedTallyKey)
    const blob = new Blob([cookSheetAsText()], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cook-sheet-${(tally?.day || 'day').toLowerCase()}-${(tally?.week || '').replace(/\//g, '-')}${cookSheetRegion !== 'all' ? `-${cookSheetRegion}` : ''}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const [locationFilter, setLocationFilter] = useState<'all' | 'st' | 'outside'>('all')
  const [showAreaMap, setShowAreaMap] = useState(false)

  const locationBreakdown = useMemo(() => {
    const areas = new Map<string, number>()
    for (const o of filteredOrders) {
      const match = (o.ship_postcode || '').trim().toUpperCase().match(/^[A-Z]+/)
      const area = match ? match[0] : 'Unknown'
      areas.set(area, (areas.get(area) || 0) + 1)
    }
    const maxCount = Math.max(1, ...Array.from(areas.values()))
    return Array.from(areas.entries())
      .map(([area, count]) => ({ area, count, pct: Math.round((count / maxCount) * 100) }))
      .sort((a, b) => b.count - a.count)
  }, [filteredOrders])

  const isStokeOrder = (o: Order) => (o.ship_postcode || '').trim().toUpperCase().startsWith('ST')

  const generatePackingSlipHtml = (o: Order) => {
    const name = o.ship_full_name || o.customer_name || 'Customer'
    const address = [o.ship_house_number, o.ship_street, o.ship_postcode].filter(Boolean).join(', ')
    const itemRows = (o.items || [])
      .filter((i) => i.name && i.name !== 'Delivery')
      .map(
        (i) =>
          `<tr><td style="padding:10px 0;font-size:18px;border-bottom:1px solid #ddd;">${i.name}</td><td style="padding:10px 0;font-size:20px;font-weight:800;border-bottom:1px solid #ddd;text-align:right;color:#1a2e1a;white-space:nowrap;">x ${i.qty}</td></tr>`
      )
      .join('')
    const totalItems = (o.items || []).reduce((s, i) => s + (i.qty || 0), 0)
    const noteHtml = o.delivery_instructions
      ? `<div style="margin-top:12px;padding:12px 16px;background:#fff8e1;border-left:4px solid #f39c12;font-size:16px;"><strong>NOTE:</strong> ${o.delivery_instructions}</div>`
      : ''
    return `<div style="font-family:Arial,sans-serif;max-width:580px;margin:0 auto;padding:28px;page-break-after:always;page-break-inside:avoid;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;border-bottom:3px solid #1a2e1a;padding-bottom:16px;">
        <div><div style="font-size:26px;font-weight:700;letter-spacing:2px;color:#1a2e1a;">prepcuisines</div>
        <div style="font-size:14px;color:#888;letter-spacing:2px;text-transform:uppercase;margin-top:2px;">Packing Slip</div></div>
        <div style="text-align:right;"><div style="font-size:32px;font-weight:800;color:#1a2e1a;">${o.delivery_day || ''}</div>
        <div style="font-size:14px;color:#888;margin-top:2px;">${new Date(o.created_at).toLocaleDateString('en-GB')}</div></div>
      </div>
      <div style="margin-bottom:20px;"><div style="font-size:34px;font-weight:800;color:#1a2e1a;line-height:1.1;">${name}</div>
        ${address ? `<div style="font-size:18px;color:#555;margin-top:8px;line-height:1.6;">${address}</div>` : ''}
        ${o.ship_phone ? `<div style="font-size:18px;color:#555;margin-top:6px;">${o.ship_phone}</div>` : ''}
      </div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;"><tbody>${itemRows}</tbody></table>
      <div style="border-top:3px solid #1a2e1a;padding-top:12px;font-size:22px;font-weight:800;">TOTAL ITEMS: ${totalItems}</div>
      ${noteHtml}
    </div>`
  }

  const generateShippingLabelHtml = (o: Order) => {
    const name = o.ship_full_name || o.customer_name || 'Customer'
    const address = [o.ship_house_number, o.ship_street, o.ship_postcode].filter(Boolean).join(', ')
    const totalItems = (o.items || []).reduce((s, i) => s + (i.qty || 0), 0)
    return `<div style="font-family:Arial,sans-serif;max-width:580px;margin:0 auto;padding:28px;page-break-after:always;page-break-inside:avoid;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;border-bottom:3px solid #1a2e1a;padding-bottom:16px;">
        <div><div style="font-size:26px;font-weight:700;letter-spacing:2px;color:#1a2e1a;">prepcuisines</div>
        <div style="font-size:14px;color:#888;letter-spacing:2px;text-transform:uppercase;margin-top:2px;">Shipping Label</div></div>
        <div style="text-align:right;"><div style="font-size:32px;font-weight:800;color:#1a2e1a;">${o.delivery_day || ''}</div>
        <div style="font-size:14px;color:#888;margin-top:2px;">${totalItems} item${totalItems === 1 ? '' : 's'}</div>
        ${o.dpd_consignment_number ? `<div style="font-size:13px;color:#888;margin-top:2px;">DPD: ${o.dpd_consignment_number}</div>` : ''}</div>
      </div>
      <div><div style="font-size:34px;font-weight:800;color:#1a2e1a;line-height:1.1;">${name}</div>
        ${address ? `<div style="font-size:20px;color:#333;margin-top:10px;line-height:1.6;font-weight:600;">${address}</div>` : ''}
        ${o.ship_phone ? `<div style="font-size:16px;color:#555;margin-top:8px;">${o.ship_phone}</div>` : ''}
      </div>
      ${o.delivery_instructions ? `<div style="margin-top:12px;padding:12px 16px;background:#fff8e1;border-left:4px solid #f39c12;font-size:16px;"><strong>NOTE:</strong> ${o.delivery_instructions}</div>` : ''}
    </div>`
  }

  // Pop-ups are only allowed within a few seconds of the user's click, so
  // for flows with slow DPD calls in the middle we open the window FIRST
  // (openPrintShell) and write the label pages into it once they're ready
  // (finishPrintShell). Never mark an order printed unless the window
  // actually opened.
  const openPrintShell = (): Window | null => {
    const w = window.open('', '_blank')
    if (!w) return null
    w.document.write(
      '<html><head><style>@media print{@page{margin:10mm;}}</style></head><body><p style="font-family:sans-serif;color:#555">Preparing labels…</p></body></html>'
    )
    return w
  }

  const finishPrintShell = (w: Window, pages: string[]) => {
    w.document.open()
    w.document.write('<html><head><style>@media print{@page{margin:10mm;}}</style></head><body>')
    pages.forEach((p) => w.document.write(p))
    w.document.write('</body></html>')
    w.document.close()
    w.print()
  }

  const printHtmlPages = (pages: string[]): boolean => {
    const w = openPrintShell()
    if (!w) return false
    finishPrintShell(w, pages)
    return true
  }

  const markLabelPrinted = async (orderId: string) => {
    try {
      await fetch('/api/admin/mark-label-printed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      })
    } catch {
      // non-critical — the print already happened, this just misses the tick
    }
  }

  // Which delivery day/week to work with — defaults to "all" (every date
  // currently in filteredOrders) but can be narrowed to one specific
  // window so the buttons only touch that day's orders.
  const [printLabelsWindowKey, setPrintLabelsWindowKey] = useState<string>('all')

  const printLabelsWindowOptions = useMemo(() => orderTally, [orderTally])

  const printLabelsOrders = useMemo(() => {
    if (printLabelsWindowKey === 'all') return filteredOrders
    return filteredOrders.filter((o) => {
      const week = o.menu_windows?.week_start_date
        ? new Date(o.menu_windows.week_start_date).toLocaleDateString('en-GB')
        : null
      const day = dayNameOf(o.delivery_day)
      return `${week}__${day}` === printLabelsWindowKey
    })
  }, [filteredOrders, printLabelsWindowKey])

  const locationScopedOrders = useMemo(() => {
    if (locationFilter === 'all') return printLabelsOrders
    return printLabelsOrders.filter((o) => {
      const isStoke = (o.ship_postcode || '').trim().toUpperCase().startsWith('ST')
      return locationFilter === 'st' ? isStoke : !isStoke
    })
  }, [printLabelsOrders, locationFilter])

  const printLabelsStokeCount = useMemo(
    () => printLabelsOrders.filter(isStokeOrder).length,
    [printLabelsOrders]
  )

  const outstandingShippingCount = useMemo(
    () => printLabelsOrders.filter((o) => !isStokeOrder(o) && !o.label_printed_at).length,
    [printLabelsOrders]
  )
  const outstandingStokeCount = useMemo(
    () => printLabelsOrders.filter((o) => isStokeOrder(o) && !o.label_printed_at).length,
    [printLabelsOrders]
  )

  const printSingleStokePackingLabel = (o: Order) => {
    if (!printHtmlPages([generatePackingSlipHtml(o)])) {
      setPrintLabelsError('Pop-up blocked — allow pop-ups for this site, then try again.')
      return
    }
    markLabelPrinted(o.id)
    loadOrders()
  }

  // Packing slip printed immediately before its shipping label, so the
  // two physically travel together and can't get mixed up with a
  // different box's label.
  const printSingleShippingLabel = async (o: Order) => {
    setPrintLabelsError(null)
    const shell = openPrintShell()
    if (!shell) {
      setPrintLabelsError('Pop-up blocked — allow pop-ups for this site, then try again. Nothing was sent to DPD.')
      return
    }
    let shipmentId = o.dpd_shipment_id
    if (!shipmentId) {
      const res = await fetch('/api/admin/create-dpd-shipment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: o.id }),
      })
      const data = await res.json()
      if (!res.ok) {
        shell.close()
        setPrintLabelsError(`${o.customer_name}: ${data.error || 'Failed to create shipment'}`)
        return
      }
      shipmentId = data.shipmentId
    }
    const labelRes = await fetch(`/api/admin/get-dpd-label?orderId=${o.id}`, { cache: 'no-store' })
    const labelData = await labelRes.json()
    if (!labelRes.ok || !labelData.labels?.[0]) {
      shell.close()
      setPrintLabelsError(`${o.customer_name}: ${labelData.error || 'Could not fetch label'}`)
      return
    }
    finishPrintShell(shell, [generatePackingSlipHtml(o), labelData.labels[0]])
    markLabelPrinted(o.id)
    loadOrders()
  }

  const printAllStokePackingLabels = () => {
    const stokeOrders = printLabelsOrders.filter((o) => isStokeOrder(o) && !o.label_printed_at)
    if (!stokeOrders.length) {
      const totalStoke = printLabelsOrders.filter(isStokeOrder).length
      setPrintLabelsError(
        totalStoke > 0
          ? `All ${totalStoke} Stoke packing labels in the selected date are already marked as printed. Reprint individually from the table, or reset their printed status if they never actually came out.`
          : 'No Stoke-on-Trent orders in the selected date'
      )
      return
    }
    if (!printHtmlPages(stokeOrders.map(generatePackingSlipHtml))) {
      setPrintLabelsError('Pop-up blocked — allow pop-ups for this site, then try again.')
      return
    }
    stokeOrders.forEach((o) => markLabelPrinted(o.id))
    loadOrders()
  }

  // Batch packing slips for one region, slips ONLY: no DPD shipment is
  // created and label_printed_at is left untouched, so the outstanding
  // shipping/packing-label counters above are unaffected. Safe to re-run.
  const printPackingSlipsForRegion = (region: 'stoke' | 'nationwide') => {
    const regionOrders = printLabelsOrders
      .filter((o) => (region === 'stoke' ? isStokeOrder(o) : !isStokeOrder(o)))
      .sort((a, b) => (a.customer_name || '').localeCompare(b.customer_name || ''))
    if (!regionOrders.length) {
      setPrintLabelsError(
        region === 'stoke'
          ? 'No Stoke-on-Trent orders in the selected date'
          : 'No nationwide orders in the selected date'
      )
      return
    }
    setPrintLabelsError(null)
    printHtmlPages(regionOrders.map(generatePackingSlipHtml))
  }

  const printAllShippingLabels = async () => {
    // Only orders whose label hasn't been printed yet — already-done ones
    // keep their ✓ and never get redone (reprint individually if needed).
    const shippingOrders = printLabelsOrders.filter(
      (o) => !isStokeOrder(o) && !o.label_printed_at
    )
    if (!shippingOrders.length) {
      const totalNonStoke = printLabelsOrders.filter((o) => !isStokeOrder(o)).length
      setPrintLabelsError(
        totalNonStoke > 0
          ? `All ${totalNonStoke} non-Stoke labels in the selected date are already marked as printed. Reprint individually from the table, or reset their printed status if they never actually came out.`
          : 'No non-Stoke orders in the selected date'
      )
      return
    }
    const shell = openPrintShell()
    if (!shell) {
      setPrintLabelsError('Pop-up blocked — allow pop-ups for this site, then try again. Nothing was sent to DPD.')
      return
    }
    setPrintLabelsStatus('working')
    setPrintLabelsError(null)
    const labelPages: string[] = []
    const printedOrderIds: string[] = []
    const failures: string[] = []

    for (let i = 0; i < shippingOrders.length; i++) {
      const o = shippingOrders[i]
      setPrintLabelsProgress(`${i + 1} of ${shippingOrders.length} — ${o.customer_name}`)
      try {
        let shipmentId = o.dpd_shipment_id
        if (!shipmentId) {
          const res = await fetch('/api/admin/create-dpd-shipment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId: o.id }),
          })
          const data = await res.json()
          if (!res.ok) {
            failures.push(`${o.customer_name}: ${data.error || 'Failed to create shipment'}`)
            continue
          }
          shipmentId = data.shipmentId
        }
        const labelRes = await fetch(`/api/admin/get-dpd-label?orderId=${o.id}`, {
          cache: 'no-store',
        })
        const labelData = await labelRes.json()
        if (!labelRes.ok || !labelData.labels?.[0]) {
          failures.push(`${o.customer_name}: ${labelData.error || 'Could not fetch label'}`)
          continue
        }
        // Packing slip immediately before its own shipping label, paired,
        // so they can never get mismatched with another order's box.
        labelPages.push(generatePackingSlipHtml(o), labelData.labels[0])
        printedOrderIds.push(o.id)
      } catch {
        failures.push(`${o.customer_name}: network error`)
      }
    }

    setPrintLabelsStatus('idle')
    setPrintLabelsProgress('')

    if (labelPages.length > 0) {
      finishPrintShell(shell, labelPages)
      await Promise.all(printedOrderIds.map(markLabelPrinted))
    } else {
      shell.close()
    }
    loadOrders()

    if (failures.length > 0) {
      setPrintLabelsError(
        `${failures.length} label${failures.length === 1 ? '' : 's'} failed — never skip these, retry individually below: ${failures.join('; ')}`
      )
    }
  }

  const stokeOrderCount = useMemo(
    () => printLabelsOrders.filter((o) => (o.ship_postcode || '').trim().toUpperCase().startsWith('ST')).length,
    [printLabelsOrders]
  )

  // DPD only charges for deliveries outside Stoke-on-Trent — those are
  // done in-house. So this always counts non-Stoke orders from the
  // current search/order set, regardless of which location toggle is
  // selected, since that's the real cost driver either way.
  const outsideStokeCount = useMemo(
    () => filteredOrders.filter((o) => !(o.ship_postcode || '').trim().toUpperCase().startsWith('ST')).length,
    [filteredOrders]
  )
  const DPD_COST_PER_DELIVERY = 7.95
  const dpdEstimate = outsideStokeCount * DPD_COST_PER_DELIVERY

  if (checkingAuth) {
    return (
      <div className="pc-admin-root">
        <div className="pc-admin-shell pc-admin-center">
          <div className="pc-admin-loading">Loading…</div>
          <Styles />
        </div>
      </div>
    )
  }

  if (!authenticated) {
    return (
      <div className="pc-admin-root">
        <div className="pc-admin-shell pc-admin-center">
        <div className="login-card">
          <div className="login-eyebrow">prepcuisines</div>
          <h1 className="login-title">Admin</h1>
          <form onSubmit={login}>
            <label htmlFor="admin-password" className="field-label">
              Password
            </label>
            <input
              id="admin-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="text-input"
              autoFocus
            />
            {loginError && <p className="error-text">{loginError}</p>}
            <button type="submit" className="btn-primary btn-full">
              Log in
            </button>
          </form>
        </div>
        <Styles />
        </div>
      </div>
    )
  }

  return (
    <div className="pc-admin-root">
      <header className="pc-topbar">
        <div className="pc-topbar-left">
          <button
            className="pc-topbar-hamburger"
            aria-label="Open menu"
            onClick={() => setMobileNavOpen((v) => !v)}
          >
            ☰
          </button>
          <span className="pc-topbar-logo">prepcuisines</span>
          <button
            className="pc-topbar-icon-btn pc-topbar-refresh"
            aria-label="Refresh data"
            title="Refresh data"
            onClick={refreshCurrentTab}
            disabled={refreshing}
          >
            <span className={refreshing ? 'pc-refresh-spin' : undefined}>🔄</span>
          </button>
        </div>
        <form
          className="pc-topbar-search"
          onSubmit={(e) => {
            e.preventDefault()
            if (!topSearchValue.trim()) return
            setTab('customers')
            setCustomerSearch(topSearchValue.trim())
            setTopSearchValue('')
          }}
        >
          <input
            className="pc-topbar-search-input"
            placeholder="Search customers, orders…"
            value={topSearchValue}
            onChange={(e) => setTopSearchValue(e.target.value)}
            aria-label="Search"
          />
          <kbd className="pc-topbar-search-kbd">⌘K</kbd>
        </form>
        <div className="pc-topbar-right">
          <div className="pc-topbar-notif-wrap">
            <button
              className="pc-topbar-icon-btn"
              aria-label="Notifications"
              onClick={() => setShowNotifications((v) => !v)}
            >
              🔔
              {topAlertsCount > 0 && <span className="pc-topbar-badge">{topAlertsCount}</span>}
            </button>
            {showNotifications && (
              <div className="pc-topbar-notif-dropdown">
                {topAlertsCount > 0 ? (
                  <button
                    className="pc-topbar-notif-item"
                    onClick={() => {
                      setShowNotifications(false)
                      setTab('ops-hub')
                    }}
                  >
                    {topAlertsCount} unresolved failed payment{topAlertsCount !== 1 ? 's' : ''}
                  </button>
                ) : (
                  <div className="pc-topbar-notif-empty">No alerts right now</div>
                )}
              </div>
            )}
          </div>
          <span className="pc-topbar-store-pill">prepcuisines</span>
        </div>
      </header>

      <div className="pc-admin-shell">
      {mobileNavOpen && (
        <div className="pc-sidebar-backdrop" onClick={() => setMobileNavOpen(false)} />
      )}

      <aside className={`sidebar ${mobileNavOpen ? 'sidebar-mobile-open' : ''}`}>
        <nav className="sidebar-nav">
          {(
            [
              { key: 'overview', label: 'Home' },
              { key: 'orders', label: 'Orders' },
              { key: 'cook-sheet', label: 'Cook Sheet' },
              { key: 'menu', label: 'Products' },
              { key: 'customers', label: 'Customers' },
              { key: 'email-marketing', label: 'Email Marketing' },
              { key: 'shopify-import', label: 'Shopify Import' },
              { key: 'insights', label: 'Analytics' },
              { key: 'product-analytics', label: 'Product Analytics' },
              { key: 'map', label: 'Map' },
              { key: 'ops-hub', label: 'Operations' },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => {
                setTab(t.key)
                setMobileNavOpen(false)
              }}
              className={`sidebar-link ${tab === t.key ? 'sidebar-link-active' : ''}`}
              aria-current={tab === t.key ? 'page' : undefined}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="main-content">
        <header className="page-header">
          <h1 className="page-title">
            {tab === 'overview'
              ? 'Overview'
              : tab === 'customers'
              ? 'Customers'
              : tab === 'orders'
              ? 'Orders'
              : tab === 'menu'
              ? 'Menu'
              : tab === 'map'
              ? 'Order Map'
              : tab === 'insights'
              ? 'Insights'
              : tab === 'product-analytics'
              ? 'Product Analytics'
              : 'Ops Hub'}
          </h1>
        </header>

        {tab === 'overview' && (
          <div className="pc-greeting-block">
            <div className="pc-greeting-title">{getGreeting()}!</div>
            <div className="pc-greeting-sub">Let's see how prepcuisines is doing.</div>
            <form
              className="pc-ask-box"
              onSubmit={(e) => {
                e.preventDefault()
                if (!topSearchValue.trim()) return
                setTab('customers')
                setCustomerSearch(topSearchValue.trim())
                setTopSearchValue('')
              }}
            >
              <input
                className="pc-ask-input"
                placeholder="Search a customer, order, or dish…"
                value={topSearchValue}
                onChange={(e) => setTopSearchValue(e.target.value)}
              />
              <button type="submit" className="pc-ask-submit" aria-label="Search">
                →
              </button>
            </form>
            <div className="pc-quick-actions">
              <button
                className="pc-quick-action-pill"
                onClick={() => setTab('ops-hub')}
              >
                Next delivery {nextDelivery ? `· ${nextDelivery.totalOrders} orders` : ''}
              </button>
              <button
                className="pc-quick-action-pill"
                onClick={() => setTab('ops-hub')}
              >
                Failed payments <span className="pc-quick-action-count">{topAlertsCount}</span>
              </button>
              <button
                className="pc-quick-action-pill"
                onClick={() => setTab('customers')}
              >
                New signups (7d) <span className="pc-quick-action-count">{overview?.newSignupsThisWeek ?? 0}</span>
              </button>
            </div>
          </div>
        )}

        {tab === 'overview' && overview && (
          <>
            <div className="today-snapshot">
              <div className="today-snapshot-title">Today</div>
              <div className="today-snapshot-row">
                <div className="today-snapshot-item">
                  <span className="today-snapshot-value">{overview.todaysOrderCount ?? 0}</span>
                  <span className="today-snapshot-label">Orders</span>
                </div>
                <div className="today-snapshot-item">
                  <span className="today-snapshot-value">{overview.todaysMeals ?? 0}</span>
                  <span className="today-snapshot-label">Meals</span>
                </div>
                <div className="today-snapshot-item">
                  <span className="today-snapshot-value">
                    {(overview.todaysAvgBasket ?? 0).toFixed(1)}
                  </span>
                  <span className="today-snapshot-label">Avg. basket</span>
                </div>
                <div className="today-snapshot-item">
                  <span className="today-snapshot-value">
                    {(overview.avgMealsPerOrder ?? 0).toFixed(1)}
                  </span>
                  <span className="today-snapshot-label">Avg. meals/order (all-time)</span>
                </div>
              </div>
            </div>

            <div className="stat-grid">
              <StatCard label="Total customers" value={overview.totalCustomers} />
              <StatCard label="Active subscriptions" value={overview.activeSubscriptions} />
              <StatCard label="New signups (7d)" value={overview.newSignupsThisWeek} />
              <StatCard label="Orders (7d)" value={overview.ordersThisWeek} />
              <StatCard
                label="Avg. customer LTV"
                value={
                  (overview.ltvCustomerCount || 0) >= 3
                    ? money(overview.averageLtv || 0)
                    : 'Not enough data yet'
                }
              />
              <StatCard label="Revenue (7d)" value={money(overview.revenueThisWeek)} accent />
            </div>
          </>
        )}

        {tab === 'overview' && (
          <div className="empty-panel">
            <p>
              Top-line numbers update every time this page loads. Switch to Customers or Orders
              for full detail, filtering, and search.
            </p>
          </div>
        )}

        {tab === 'customers' && (
          <section>
            <div className="status-breakdown">
              <button
                className={`status-card ${segment === 'active' ? 'status-card-active' : ''}`}
                onClick={() => setSegment('active')}
              >
                <div className="status-card-label">Subscribed</div>
                <div className="status-card-value">{statusBreakdown.active}</div>
              </button>
              <button
                className={`status-card ${segment === 'cancelled' ? 'status-card-active' : ''}`}
                onClick={() => setSegment('cancelled')}
              >
                <div className="status-card-label">Cancelled</div>
                <div className="status-card-value">{statusBreakdown.cancelled}</div>
              </button>
              <button
                className={`status-card ${segment === 'payg' ? 'status-card-active' : ''}`}
                onClick={() => setSegment('payg')}
              >
                <div className="status-card-label">Pay As You Go</div>
                <div className="status-card-value">{statusBreakdown.payg}</div>
              </button>
              <button
                className={`status-card ${segment === 'all' ? 'status-card-active' : ''}`}
                onClick={() => setSegment('all')}
              >
                <div className="status-card-label">All customers</div>
                <div className="status-card-value">{statusBreakdown.total}</div>
              </button>
            </div>

            <div className="toolbar">
              <div className="segment-pills" role="tablist" aria-label="Customer segment">
                {segmentFilters.map((s) => (
                  <button
                    key={s.key}
                    onClick={() => setSegment(s.key)}
                    className={`segment-pill ${segment === s.key ? 'segment-pill-active' : ''}`}
                    role="tab"
                    aria-selected={segment === s.key}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <input
                aria-label="Search customers"
                placeholder="Search name, email, postcode…"
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                className="text-input search-input"
              />
            </div>

            <div className="date-filter-toggle-row">
              <button
                className="date-filter-toggle"
                onClick={() => setShowCustomerDateFilter((v) => !v)}
              >
                {showCustomerDateFilter ? '▾' : '▸'} Filter by date
                {(customerDateFrom || customerDateTo || customerSingleDate) && !showCustomerDateFilter
                  ? ' · active'
                  : ''}
              </button>
            </div>

            {showCustomerDateFilter && (
              <div className="toolbar">
                <label className="field-label" htmlFor="cust-date-field" style={{ marginBottom: 0 }}>
                  Filter by
                </label>
                <select
                  id="cust-date-field"
                  className="text-input search-input"
                  value={customerDateField}
                  onChange={(e) => {
                    setCustomerDateField(e.target.value as typeof customerDateField)
                    setCustomerDateFrom('')
                    setCustomerDateTo('')
                    setCustomerSingleDate('')
                  }}
                >
                  <option value="signup">Signed up date</option>
                  <option value="last_order">Last order date</option>
                  <option value="delivery_day">Delivery day (Wed/Sun match)</option>
                </select>

                {customerDateField === 'delivery_day' ? (
                  <>
                    <label className="field-label" htmlFor="cust-date-single" style={{ marginBottom: 0 }}>
                      On date
                    </label>
                    <input
                      id="cust-date-single"
                      type="date"
                      className="text-input search-input"
                      value={customerSingleDate}
                      onChange={(e) => setCustomerSingleDate(e.target.value)}
                    />
                    {customerSingleDate && (
                      <button className="segment-pill" onClick={() => setCustomerSingleDate('')}>
                        Clear date
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <label className="field-label" htmlFor="cust-date-from" style={{ marginBottom: 0 }}>
                      from
                    </label>
                    <input
                      id="cust-date-from"
                      type="date"
                      className="text-input search-input"
                      value={customerDateFrom}
                      onChange={(e) => setCustomerDateFrom(e.target.value)}
                    />
                    <label className="field-label" htmlFor="cust-date-to" style={{ marginBottom: 0 }}>
                      to
                    </label>
                    <input
                      id="cust-date-to"
                      type="date"
                      className="text-input search-input"
                      value={customerDateTo}
                      onChange={(e) => setCustomerDateTo(e.target.value)}
                    />
                    {(customerDateFrom || customerDateTo) && (
                      <button
                        className="segment-pill"
                        onClick={() => {
                          setCustomerDateFrom('')
                          setCustomerDateTo('')
                        }}
                      >
                        Clear dates
                      </button>
                    )}
                  </>
                )}
              </div>
            )}

            <div className="result-count">{filteredCustomers.length} customers</div>

            {loading ? (
              <div className="empty-panel">Loading…</div>
            ) : filteredCustomers.length === 0 ? (
              <div className="empty-panel">No customers match this filter.</div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Status</th>
                      <th>Delivery</th>
                      <th>Marketing emails</th>
                      <th>Orders</th>
                      <th>Total spend</th>
                      <th>Last order</th>
                      <th>Postcode</th>
                      <th>Signed up</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCustomers.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <div className="customer-cell">
                            <span className="avatar">{initials(c.full_name)}</span>
                            <div>
                              <div className="customer-name">{c.full_name || '—'}</div>
                              <div className="customer-email">{c.email || '—'}</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <StatusBadge status={c.effectiveStatus ?? c.subscription_status} />
                        </td>
                        <td>
                          {c.second_delivery_day ? (
                            <span title="Twice a week">
                              2x/week: {c.standing_delivery_day || '—'}, {c.second_delivery_day}
                            </span>
                          ) : c.standing_delivery_day ? (
                            <span title="Once a week">1x/week: {c.standing_delivery_day}</span>
                          ) : (
                            '—'
                          )}
                          <button
                            className="segment-pill"
                            style={{ marginLeft: 6 }}
                            onClick={() => openEditDelivery(c)}
                          >
                            Edit
                          </button>
                        </td>
                        <td>
                          {c.marketing_consent === true ? (
                            <span className="pill pill-active">Opted in</span>
                          ) : c.marketing_consent === false ? (
                            <span className="pill pill-muted">Opted out</span>
                          ) : (
                            <span className="pill pill-warn">Unknown</span>
                          )}
                        </td>
                        <td>{c.orderCount}</td>
                        <td className="num">{money(c.totalSpend)}</td>
                        <td>
                          {c.lastOrderAt
                            ? new Date(c.lastOrderAt).toLocaleDateString('en-GB')
                            : 'Never'}
                        </td>
                        <td>{c.postcode || '—'}</td>
                        <td>{new Date(c.created_at).toLocaleDateString('en-GB')}</td>
                        <td>
                          <button
                            className="segment-pill"
                            onClick={() => openResetPassword(c.id, c.full_name || c.email || 'this customer')}
                          >
                            Reset password
                          </button>
                          <button
                            className="segment-pill"
                            style={{ marginLeft: 6 }}
                            onClick={() => openEditCustomerEmail(c.id, c.full_name || 'this customer', c.email || '')}
                          >
                            Edit email
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {tab === 'orders' && (
          <section>
            <div className="orders-header-row">
              <div className="location-toggle" role="tablist" aria-label="Location filter">
                <button
                  className={`segment-pill ${locationFilter === 'all' ? 'segment-pill-active' : ''}`}
                  onClick={() => setLocationFilter('all')}
                >
                  All areas ({printLabelsOrders.length})
                </button>
                <button
                  className={`segment-pill ${locationFilter === 'st' ? 'segment-pill-active' : ''}`}
                  onClick={() => setLocationFilter('st')}
                >
                  Stoke-on-Trent ({stokeOrderCount})
                </button>
                <button
                  className={`segment-pill ${locationFilter === 'outside' ? 'segment-pill-active' : ''}`}
                  onClick={() => setLocationFilter('outside')}
                >
                  Outside Stoke ({printLabelsOrders.length - stokeOrderCount})
                </button>
              </div>
              <button
                className="btn-primary"
                onClick={() => {
                  setShowAddOrder((v) => !v)
                  if (!showAddOrder && emailWindowOptions.length === 0) {
                    loadEmailWindowOptions()
                  }
                }}
              >
                {showAddOrder ? 'Cancel' : '+ Add order manually'}
              </button>
              <button
                className="segment-pill"
                style={{ marginLeft: 8 }}
                onClick={() => {
                  setShowBulkImport((v) => !v)
                  if (!showBulkImport && emailWindowOptions.length === 0) {
                    loadEmailWindowOptions()
                  }
                }}
              >
                {showBulkImport ? 'Cancel' : '📥 Bulk import old orders'}
              </button>
            </div>

            <div className="pc-modal-section" style={{ marginTop: 12 }}>
              <label className="field-label">🏷 Print Labels</label>
              <p className="map-intro">
                Packing slip prints immediately before its shipping label, so they always travel
                together. Stoke-on-Trent postcodes get a packing slip only — delivered in-house,
                no DPD needed. Everyone else gets a real DPD shipping label, creating the shipment
                first if one doesn't exist yet.
              </p>
              <label className="field-label" style={{ marginTop: 10 }}>
                Delivery date
              </label>
              <select
                className="text-input"
                style={{ width: '100%', marginBottom: 10 }}
                value={printLabelsWindowKey}
                onChange={(e) => setPrintLabelsWindowKey(e.target.value)}
              >
                <option value="all">All dates currently listed</option>
                {printLabelsWindowOptions.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.day}
                    {t.week ? ` — w/c ${t.week}` : ''} ({t.count} order{t.count !== 1 ? 's' : ''})
                  </option>
                ))}
              </select>
              <div className="pc-modal-inline-row">
                <button
                  className="btn-primary"
                  onClick={printAllShippingLabels}
                  disabled={printLabelsStatus === 'working'}
                >
                  {printLabelsStatus === 'working'
                    ? `Working… ${printLabelsProgress}`
                    : `🚚 Print outstanding Shipping Labels (${outstandingShippingCount} left of ${printLabelsOrders.length - printLabelsStokeCount})`}
                </button>
                <button
                  className="segment-pill"
                  onClick={printAllStokePackingLabels}
                  disabled={printLabelsStatus === 'working'}
                >
                  📦 Print outstanding Stoke Packing Labels ({outstandingStokeCount} left of {printLabelsStokeCount})
                </button>
              </div>
              <div className="pc-modal-inline-row" style={{ marginTop: 8 }}>
                <button
                  className="segment-pill"
                  onClick={() => printPackingSlipsForRegion('stoke')}
                  disabled={printLabelsStatus === 'working'}
                >
                  🧾 Print Packing Slips — Stoke ({printLabelsStokeCount})
                </button>
                <button
                  className="segment-pill"
                  onClick={() => printPackingSlipsForRegion('nationwide')}
                  disabled={printLabelsStatus === 'working'}
                >
                  🧾 Print Packing Slips — Nationwide ({printLabelsOrders.length - printLabelsStokeCount})
                </button>
              </div>
              <p className="map-intro" style={{ marginTop: 6, marginBottom: 0 }}>
                Slips print for every order in the selected date for that area, sorted by customer
                name. Slips only — no DPD shipments are created and the outstanding counts above
                aren&apos;t affected, so it&apos;s safe to re-run for reprints.
              </p>
              {printLabelsError && (
                <p className="error-text" style={{ marginTop: 8 }}>
                  {printLabelsError}
                </p>
              )}
            </div>

            {showAddOrder && (
              <form className="add-order-panel" onSubmit={submitManualOrder}>
                <div className="form-grid">
                  <div>
                    <label className="field-label" htmlFor="ao-name">
                      Customer name *
                    </label>
                    <input
                      id="ao-name"
                      required
                      className="text-input"
                      value={addOrderForm.customerName}
                      onChange={(e) =>
                        setAddOrderForm((f) => ({ ...f, customerName: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label className="field-label" htmlFor="ao-email">
                      Email
                    </label>
                    <input
                      id="ao-email"
                      type="email"
                      className="text-input"
                      value={addOrderForm.customerEmail}
                      onChange={(e) =>
                        setAddOrderForm((f) => ({ ...f, customerEmail: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label className="field-label" htmlFor="ao-phone">
                      Phone
                    </label>
                    <input
                      id="ao-phone"
                      className="text-input"
                      value={addOrderForm.phone}
                      onChange={(e) => setAddOrderForm((f) => ({ ...f, phone: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="field-label" htmlFor="ao-house-number">
                      House number
                    </label>
                    <input
                      id="ao-house-number"
                      className="text-input"
                      value={addOrderForm.houseNumber}
                      onChange={(e) =>
                        setAddOrderForm((f) => ({ ...f, houseNumber: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label className="field-label" htmlFor="ao-street">
                      Street
                    </label>
                    <input
                      id="ao-street"
                      className="text-input"
                      value={addOrderForm.street}
                      onChange={(e) => setAddOrderForm((f) => ({ ...f, street: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="field-label" htmlFor="ao-postcode">
                      Postcode
                    </label>
                    <input
                      id="ao-postcode"
                      className="text-input"
                      value={addOrderForm.postcode}
                      onChange={(e) =>
                        setAddOrderForm((f) => ({ ...f, postcode: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label className="field-label" htmlFor="ao-window">
                      Delivery window
                    </label>
                    <select
                      id="ao-window"
                      className="text-input"
                      value={addOrderForm.windowId}
                      onChange={(e) => {
                        const windowId = e.target.value
                        setAddOrderForm((f) => ({ ...f, windowId }))
                        loadAddOrderMenuItems(windowId)
                      }}
                    >
                      <option value="">Select the actual delivery date…</option>
                      {emailWindowOptions.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.delivery_day} — {new Date(w.week_start_date).toLocaleDateString('en-GB')}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="field-label" htmlFor="ao-total">
                      Total amount (£) *
                    </label>
                    <input
                      id="ao-total"
                      type="number"
                      step="0.01"
                      required
                      className="text-input"
                      value={addOrderForm.totalAmount}
                      onChange={(e) =>
                        setAddOrderForm((f) => ({ ...f, totalAmount: e.target.value }))
                      }
                    />
                  </div>
                </div>

                <label className="field-label" htmlFor="ao-delivery-instructions">
                  Delivery instructions (optional)
                </label>
                <input
                  id="ao-delivery-instructions"
                  className="text-input"
                  style={{ marginBottom: 12 }}
                  value={addOrderForm.deliveryInstructions}
                  onChange={(e) =>
                    setAddOrderForm((f) => ({ ...f, deliveryInstructions: e.target.value }))
                  }
                />

                <label className="field-label">
                  Items — pick from the actual menu for this delivery
                </label>
                {!addOrderForm.windowId && (
                  <p className="map-intro">Pick a delivery window above to see its real menu.</p>
                )}
                {addOrderMenuLoading && <p className="map-intro">Loading menu…</p>}
                {addOrderMenuItems.length > 0 && (
                  <div className="add-order-menu-picker">
                    {addOrderMenuItems.map((item) => (
                      <div key={item.name} className="add-order-menu-row">
                        <span className="add-order-menu-name">{item.name}</span>
                        <input
                          type="number"
                          min={0}
                          className="text-input add-order-menu-qty"
                          value={addOrderQuantities[item.name] || ''}
                          placeholder="0"
                          onChange={(e) =>
                            setAddOrderQuantities((q) => ({
                              ...q,
                              [item.name]: Number(e.target.value) || 0,
                            }))
                          }
                        />
                      </div>
                    ))}
                  </div>
                )}

                {addOrderError && <p className="error-text">{addOrderError}</p>}

                <button
                  type="submit"
                  className="btn-primary"
                  disabled={addOrderStatus === 'saving'}
                >
                  {addOrderStatus === 'saving' ? 'Saving…' : 'Save order'}
                </button>

                <div className="ao-repeat-section">
                  <label className="pc-repeat-checkbox">
                    <input
                      type="checkbox"
                      checked={repeatWeekly}
                      onChange={(e) => setRepeatWeekly(e.target.checked)}
                    />
                    Repeat this order weekly (using the customer name, email, postcode and
                    items above)
                  </label>

                  {repeatWeekly && (
                    <div className="ao-repeat-controls">
                      <div>
                        <label className="field-label">Delivery day</label>
                        <select
                          className="text-input"
                          value={repeatDeliveryDay}
                          onChange={(e) => setRepeatDeliveryDay(e.target.value as any)}
                        >
                          <option value="Wednesday">Wednesday</option>
                          <option value="Sunday">Sunday</option>
                        </select>
                      </div>
                      <div>
                        <label className="field-label">How should each week work?</label>
                        <select
                          className="text-input"
                          value={repeatMode}
                          onChange={(e) => setRepeatMode(e.target.value as any)}
                        >
                          <option value="manual">
                            I'll handle payment myself — just create the order each week
                          </option>
                          <option value="auto_charge">
                            Auto-charge their saved card each week
                          </option>
                          <option value="send_link">
                            Send them a link each week to choose their own meals
                          </option>
                        </select>
                      </div>
                      {repeatMode === 'auto_charge' && (
                        <p className="map-intro">
                          Only works if this email matches an existing customer with a saved
                          card — otherwise it'll tell you there's nothing to charge.
                        </p>
                      )}
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={setupRecurringOrder}
                        disabled={repeatStatus === 'saving'}
                      >
                        {repeatStatus === 'saving' ? 'Setting up…' : 'Set up recurring order'}
                      </button>
                      {repeatStatus === 'done' && (
                        <p className="map-intro">
                          Set up — this'll kick in from the next weekly run onward. Use "Save
                          order" above too if you need this week's order placed right now.
                        </p>
                      )}
                      {repeatStatus === 'error' && repeatError && (
                        <p className="error-text">{repeatError}</p>
                      )}
                    </div>
                  )}
                </div>
              </form>
            )}

            {showBulkImport && (
              <div className="add-order-panel">
                <p className="map-intro">
                  For transferring orders placed on a previous website — each row becomes a
                  guest order (no account created, no emails sent), tied to the real delivery
                  window you pick below so it shows up correctly in the cook sheet and labels.
                </p>
                <label className="field-label">Delivery window</label>
                <select
                  className="text-input"
                  style={{ width: '100%', marginBottom: 10 }}
                  value={bulkImportWindowId}
                  onChange={(e) => setBulkImportWindowId(e.target.value)}
                >
                  <option value="">Select the delivery date these orders are for…</option>
                  {emailWindowOptions.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.delivery_day} {new Date(w.week_start_date).toLocaleDateString('en-GB')}
                    </option>
                  ))}
                </select>
                <label className="field-label">
                  One order per line: Name | Phone | House number | Street | Postcode | Total (£)
                  | Items (e.g. 2x Marry-Me Salmon @ 8.00; 1x Overnight Oats @ 5.00)
                </label>
                <textarea
                  className="text-input"
                  rows={8}
                  style={{ width: '100%', fontFamily: 'monospace', fontSize: 12.5 }}
                  placeholder={
                    'Sarah Jones | 07123456789 | 12 | High Street | B1 2AB | 39.50 | 2x Marry-Me Salmon @ 8.00; 3x Mongolian Beef Noodles @ 8.00'
                  }
                  value={bulkImportText}
                  onChange={(e) => setBulkImportText(e.target.value)}
                />
                <div className="pc-modal-inline-row" style={{ marginTop: 10 }}>
                  <button
                    className="btn-primary"
                    onClick={submitBulkImport}
                    disabled={
                      bulkImportStatus === 'saving' || !bulkImportWindowId || !bulkImportText.trim()
                    }
                  >
                    {bulkImportStatus === 'saving' ? 'Importing…' : 'Import orders'}
                  </button>
                </div>
                {bulkImportStatus === 'done' && (
                  <p className="map-intro" style={{ marginTop: 8 }}>
                    Imported {bulkImportCount} order{bulkImportCount === 1 ? '' : 's'}.
                  </p>
                )}
                {bulkImportError && (
                  <p className="error-text" style={{ marginTop: 8 }}>
                    {bulkImportError}
                  </p>
                )}
              </div>
            )}

            <div className="date-filter-toggle-row">
              <button
                className="date-filter-toggle"
                onClick={() => setShowRecurringOrdersList((v) => !v)}
              >
                {showRecurringOrdersList ? '▾' : '▸'} Recurring manual orders (
                {recurringOrdersList.filter((r) => r.active).length} active)
              </button>
            </div>

            {showRecurringOrdersList && (
              <div className="insights-block">
                {recurringOrdersList.length === 0 ? (
                  <div className="empty-panel">No recurring manual orders set up yet.</div>
                ) : (
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Customer</th>
                          <th>Day</th>
                          <th>Total</th>
                          <th>Mode</th>
                          <th>Status</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {recurringOrdersList.map((r) => (
                          <tr key={r.id}>
                            <td>
                              {r.customer_name || '—'}
                              {r.email && <div className="customer-email">{r.email}</div>}
                            </td>
                            <td>{r.delivery_day}</td>
                            <td className="num">{money(r.total_amount)}</td>
                            <td className="capitalize">{r.repeat_mode.replace('_', ' ')}</td>
                            <td>
                              {r.active ? (
                                <span className="pill pill-active">Active</span>
                              ) : (
                                <span className="pill pill-muted">Paused</span>
                              )}
                            </td>
                            <td>
                              <button
                                className="segment-pill"
                                onClick={() => toggleRecurringOrderActive(r.id, !r.active)}
                              >
                                {r.active ? 'Pause' : 'Resume'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            <div className="toolbar">
              <input
                aria-label="Search orders"
                placeholder="Search name, email, postcode…"
                value={orderSearch}
                onChange={(e) => setOrderSearch(e.target.value)}
                className="text-input search-input"
              />
            </div>

            <div className="result-count">{locationScopedOrders.length} orders</div>

            {loading ? (
              <div className="empty-panel">Loading…</div>
            ) : locationScopedOrders.length === 0 ? (
              <div className="empty-panel">No orders match this search.</div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Type</th>
                      <th>Items</th>
                      <th>Total</th>
                      <th>Delivery day</th>
                      <th>Delivery week</th>
                      <th>Postcode</th>
                      <th>Placed</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {locationScopedOrders.map((o) => (
                      <tr key={o.id}>
                        <td>
                          <div className="customer-name">{o.customer_name}</div>
                          {o.customer_email && (
                            <div className="customer-email">{o.customer_email}</div>
                          )}
                        </td>
                        <td>
                          <span className="pill pill-muted">
                            {statusLabels[o.status] || o.status}
                          </span>
                        </td>
                        <td className="items-cell">
                          <span title={(o.items || []).map((it) => `${it.qty}× ${it.name}`).join(', ')}>
                            {(() => {
                              const list = o.items || []
                              const totalQty = list.reduce((sum, it) => sum + (it.qty || 0), 0)
                              const preview = list
                                .slice(0, 2)
                                .map((it) => `${it.qty}× ${it.name}`)
                                .join(', ')
                              const remaining = list.length - 2
                              return (
                                <>
                                  {preview}
                                  {remaining > 0 ? `, +${remaining} more` : ''}
                                  <div className="items-count">{totalQty} items total</div>
                                </>
                              )
                            })()}
                          </span>
                        </td>
                        <td className="num">{money(o.total_amount)}</td>
                        <td>{o.delivery_day ? dayNameOf(o.delivery_day) : '—'}</td>
                        <td>
                          {o.menu_windows?.week_start_date
                            ? `w/c ${new Date(o.menu_windows.week_start_date).toLocaleDateString(
                                'en-GB'
                              )}`
                            : '—'}
                        </td>
                        <td>{o.ship_postcode || '—'}</td>
                        <td className="nowrap">
                          {new Date(o.created_at).toLocaleDateString('en-GB')}{' '}
                          {new Date(o.created_at).toLocaleTimeString('en-GB', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td>
                          {o.cancelled ? (
                            <span className="pill pill-warn">Cancelled</span>
                          ) : o.fulfilled ? (
                            <span className="pill pill-active">Fulfilled</span>
                          ) : (
                            <span className="pill pill-muted">Unfulfilled</span>
                          )}
                        </td>
                        <td>
                          <button className="segment-pill" onClick={() => openOrderDetail(o.id)}>
                            View
                          </button>
                          <button
                            className="segment-pill"
                            style={{ marginLeft: 6 }}
                            onClick={() =>
                              isStokeOrder(o)
                                ? printSingleStokePackingLabel(o)
                                : printSingleShippingLabel(o)
                            }
                            title={
                              o.label_printed_at
                                ? `Already printed ${new Date(o.label_printed_at).toLocaleString('en-GB')}`
                                : undefined
                            }
                          >
                            {o.label_printed_at ? '✓ Reprint' : 'Print'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {tab === 'cook-sheet' && (
          <section>
            <h2 className="section-title">Cook Sheet, Delivery Cost & Area Breakdown</h2>
              <>
                {orderTally.length > 0 && (
                  <div className="tally-row">
                    {orderTally.map((t) => (
                      <button
                        key={t.key}
                        className={`tally-chip ${expandedTallyKey === t.key ? 'tally-chip-active' : ''}`}
                        onClick={() =>
                          setExpandedTallyKey((prev) => (prev === t.key ? null : t.key))
                        }
                      >
                        <div className="tally-day">
                          {t.day}
                          {t.week ? ` — w/c ${t.week}` : ''}
                        </div>
                        <div className="tally-meta">
                          {t.count} order{t.count !== 1 ? 's' : ''} · {money(t.total)}
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {expandedTallyKey && cookSheetDisplay.length > 0 && (() => {
                  const t = orderTally.find((x) => x.key === expandedTallyKey)
                  const label = `${t?.day || ''}${t?.week ? ` (w/c ${t.week})` : ''}${
                    cookSheetRegionLabel ? ` — ${cookSheetRegionLabel}` : ''
                  }`
                  return (
                    <CookSheetBreakdown
                      tally={cookSheetDisplay}
                      dateLabel={label}
                      dateKey={`${(t?.day || 'day').toLowerCase()}-${(t?.week || '').replace(/\//g, '-')}${
                        cookSheetRegion !== 'all' ? `-${cookSheetRegion}` : ''
                      }`}
                    />
                  )
                })()}

                {expandedTallyKey && (
                  <div className="cook-sheet-panel">
                    <div className="cook-sheet-header-row">
                      <button
                        type="button"
                        className="cook-sheet-collapse-toggle"
                        onClick={() => setShowCookSheetList((v) => !v)}
                      >
                        <span className="cook-sheet-title">
                          {showCookSheetList ? '▾' : '▸'} Cook sheet —{' '}
                          {orderTally.find((t) => t.key === expandedTallyKey)?.day}
                          {orderTally.find((t) => t.key === expandedTallyKey)?.week
                            ? ` (w/c ${orderTally.find((t) => t.key === expandedTallyKey)?.week})`
                            : ''}
                          {cookSheetRegionLabel ? ` — ${cookSheetRegionLabel}` : ''}
                        </span>
                        <span className="cook-sheet-collapse-meta">
                          {cookSheetDisplay.reduce((s, d) => s + d.qty, 0)} items
                        </span>
                      </button>
                      {showCookSheetList && cookSheetForKey.length > 0 && (
                        <div className="cook-sheet-actions">
                          <button
                            className={`segment-pill ${cookSheetRegion === 'all' ? 'segment-pill-active' : ''}`}
                            onClick={() => setCookSheetRegion('all')}
                          >
                            All
                          </button>
                          <button
                            className={`segment-pill ${cookSheetRegion === 'stoke' ? 'segment-pill-active' : ''}`}
                            onClick={() => setCookSheetRegion('stoke')}
                          >
                            Stoke-on-Trent
                          </button>
                          <button
                            className={`segment-pill ${cookSheetRegion === 'nationwide' ? 'segment-pill-active' : ''}`}
                            onClick={() => setCookSheetRegion('nationwide')}
                          >
                            Nationwide
                          </button>
                          <button className="segment-pill" onClick={copyCookSheet}>
                            {cookSheetCopied ? 'Copied!' : 'Copy'}
                          </button>
                          <button className="segment-pill" onClick={downloadCookSheet}>
                            Download
                          </button>
                        </div>
                      )}
                    </div>
                    {showCookSheetList &&
                      (cookSheetDisplay.length === 0 ? (
                        <p className="cook-sheet-empty">
                          {cookSheetForKey.length === 0
                            ? 'No item data for this window.'
                            : `No ${cookSheetRegion === 'stoke' ? 'Stoke-on-Trent' : 'nationwide'} items for this window.`}
                        </p>
                      ) : (
                        <>
                          <ul className="cook-sheet-list">
                            {cookSheetDisplay.map((d, i) => (
                              <li key={d.name} className={i % 2 === 1 ? 'cook-sheet-row-alt' : ''}>
                                <span className="cook-sheet-qty">{d.qty}×</span>
                                <span className="cook-sheet-name">{d.name}</span>
                                {cookSheetRegion === 'all' && (
                                  <span className="cook-sheet-split">
                                    <span className="cook-sheet-split-stoke">ST {d.stokeQty}</span>
                                    <span className="cook-sheet-split-nat">Nat {d.outQty}</span>
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                          <div className="cook-sheet-total-row">
                            <span>Total items</span>
                            <span className="cook-sheet-total-qty">
                              {cookSheetDisplay.reduce((s, d) => s + d.qty, 0)}
                              {cookSheetRegion === 'all' && (
                                <span className="cook-sheet-total-split">
                                  {' '}(Stoke {cookSheetForKey.reduce((s, d) => s + d.stokeQty, 0)} ·
                                  Nationwide {cookSheetForKey.reduce((s, d) => s + d.outQty, 0)})
                                </span>
                              )}
                            </span>
                          </div>
                        </>
                      ))}
                  </div>
                )}

                <div className="location-summary">
                  <div className="dpd-card">
                    <div className="dpd-label">Estimated DPD cost (outside Stoke)</div>
                    <div className="dpd-value">{money(dpdEstimate)}</div>
                    <div className="dpd-meta">
                      {outsideStokeCount} deliveries × {money(DPD_COST_PER_DELIVERY)}
                    </div>
                  </div>
                </div>

                {locationBreakdown.length > 0 && (
                  <div className="area-map">
                    <button
                      type="button"
                      className="area-map-toggle"
                      onClick={() => setShowAreaMap((v) => !v)}
                    >
                      <span className="area-map-title">Orders by area</span>
                      <span className="area-map-meta">
                        {locationBreakdown.length} areas {showAreaMap ? '▴' : '▾'}
                      </span>
                    </button>
                    {showAreaMap &&
                      locationBreakdown.map((a) => (
                        <div key={a.area} className="area-row">
                          <span className="area-name">{a.area}</span>
                          <div className="area-bar-track">
                            <div className="area-bar-fill" style={{ width: `${a.pct}%` }} />
                          </div>
                          <span className="area-count">{a.count}</span>
                        </div>
                      ))}
                  </div>
                )}
              </>
          </section>
        )}

        {tab === 'email-marketing' && (
          <section>
            <h2 className="section-title">Email Marketing Lists</h2>
              <div className="insights-block">
                <p className="map-intro">
                  One-click copy — pastes as a comma-separated list ready for your email tool.
                  Only includes customers who ticked "Keep me updated" at signup.
                </p>
                <div className="email-lists-grid">
                  {emailLists.map((list) => (
                    <div
                      key={list.key}
                      className={`email-list-card ${list.key === 'all_subscribed' ? 'email-list-card-featured' : ''}`}
                    >
                      <div className="email-list-header">
                        <span className="email-list-label">{list.label}</span>
                        <span className="email-list-count">{list.customers.length}</span>
                      </div>
                      <button
                        className="btn-primary"
                        disabled={list.customers.length === 0}
                        onClick={() =>
                          copyEmailList(
                            list.key,
                            list.customers.map((c) => c.email).filter(Boolean) as string[]
                          )
                        }
                      >
                        {copiedListKey === list.key ? 'Copied!' : 'Copy emails'}
                      </button>
                    </div>
                  ))}

                  <div className="email-list-card">
                    <div className="email-list-header">
                      <span className="email-list-label">Ordered for a specific delivery</span>
                    </div>
                    <select
                      className="text-input"
                      style={{ width: '100%', marginBottom: 8 }}
                      value={selectedEmailWindowId}
                      onChange={(e) => setSelectedEmailWindowId(e.target.value)}
                    >
                      <option value="">Select a delivery date…</option>
                      {emailWindowOptions.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.delivery_day} {new Date(w.week_start_date).toLocaleDateString('en-GB')}
                        </option>
                      ))}
                    </select>
                    <button
                      className="btn-primary"
                      disabled={!selectedEmailWindowId || emailWindowCopyStatus === 'loading'}
                      onClick={() => copyEmailsForWindow(selectedEmailWindowId)}
                    >
                      {emailWindowCopyStatus === 'loading'
                        ? 'Loading…'
                        : emailWindowCopyStatus === 'copied'
                        ? 'Copied!'
                        : 'Copy emails'}
                    </button>
                    {emailWindowCopyCount !== null && emailWindowCopyStatus === 'copied' && (
                      <p className="map-intro" style={{ marginTop: 6 }}>
                        {emailWindowCopyCount} email{emailWindowCopyCount === 1 ? '' : 's'} copied.
                      </p>
                    )}
                    <button
                      className="segment-pill"
                      style={{ marginTop: 8 }}
                      disabled={!selectedEmailWindowId}
                      onClick={() => {
                        const url = `${window.location.origin}/late-order?window=${selectedEmailWindowId}`
                        navigator.clipboard.writeText(url)
                        setLateOrderLinkCopied(true)
                        setTimeout(() => setLateOrderLinkCopied(false), 2000)
                      }}
                    >
                      {lateOrderLinkCopied ? 'Copied!' : 'Copy late-order link (for this delivery)'}
                    </button>
                  </div>
                </div>
              </div>
          </section>
        )}

        {tab === 'shopify-import' && (
          <section>
            <h2 className="section-title">Import Customers from Shopify</h2>
              <div className="insights-block">
                <p className="map-intro">
                  Upload your Shopify customer export (CSV). Only rows with "Accepts Email
                  Marketing" set to yes are imported. Anyone matching an existing customer's
                  email just has their marketing consent filled in (never overwriting a choice
                  they've already made on this site) — everyone else is stored as an email lead,
                  separate from real ordering customers.
                </p>
                <input
                  type="file"
                  accept=".csv"
                  disabled={importStatus === 'parsing' || importStatus === 'importing'}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleShopifyCsvImport(file)
                  }}
                />
                {importStatus === 'parsing' && (
                  <p className="map-intro" style={{ marginTop: 10 }}>
                    Reading file…
                  </p>
                )}
                {importStatus === 'importing' && (
                  <p className="map-intro" style={{ marginTop: 10 }}>
                    Importing {importProgress.done} / {importProgress.total}…
                  </p>
                )}
                {importStatus === 'error' && importError && (
                  <p className="error-text">{importError}</p>
                )}
                {importStatus === 'done' && importSummary && (
                  <div className="alerts-grid" style={{ marginTop: 14 }}>
                    <div className="alert-card">
                      <div className="alert-card-value">{importSummary.consentedRows}</div>
                      <div className="alert-card-label">Opted-in rows found</div>
                    </div>
                    <div className="alert-card">
                      <div className="alert-card-value">
                        {importSummary.updatedExistingCustomers}
                      </div>
                      <div className="alert-card-label">Existing customers updated</div>
                    </div>
                    <div className="alert-card">
                      <div className="alert-card-value">{importSummary.createdLeads}</div>
                      <div className="alert-card-label">New email leads created</div>
                    </div>
                    <div className="alert-card alert-card-muted">
                      <div className="alert-card-value">
                        {importSummary.skippedExplicitChoice}
                      </div>
                      <div className="alert-card-label">
                        Skipped (already had an explicit choice on this site)
                      </div>
                    </div>
                  </div>
                )}

                <div className="ao-repeat-section">
                  <label className="field-label">Klaviyo</label>
                  <p className="map-intro">
                    Pushes every currently-consented customer and imported lead into your
                    Klaviyo list. Safe to re-run any time (e.g. after a new import) — it just
                    updates existing profiles rather than duplicating them.
                  </p>
                  <button
                    className="btn-primary"
                    onClick={runKlaviyoSync}
                    disabled={klaviyoSyncStatus === 'syncing'}
                  >
                    {klaviyoSyncStatus === 'syncing' ? 'Syncing…' : 'Sync all to Klaviyo'}
                  </button>
                  {klaviyoSyncStatus === 'error' && klaviyoSyncError && (
                    <p className="error-text">{klaviyoSyncError}</p>
                  )}
                  {klaviyoSyncStatus === 'done' && klaviyoSyncResult && (
                    <p className="map-intro" style={{ marginTop: 8 }}>
                      Synced {klaviyoSyncResult.synced} of {klaviyoSyncResult.totalUniqueEmails}{' '}
                      unique emails to Klaviyo.
                    </p>
                  )}
                </div>

                <div className="ao-repeat-section">
                  <label className="field-label">Test Neo email</label>
                  <p className="map-intro">
                    Sends a real test email directly through Neo's SMTP servers, bypassing the
                    Resend fallback, so a failure here means something real with the Neo
                    connection itself.
                  </p>
                  <div className="pc-modal-inline-row">
                    <input
                      className="text-input"
                      style={{ flex: 1 }}
                      placeholder="you@example.com"
                      value={testEmailAddress}
                      onChange={(e) => setTestEmailAddress(e.target.value)}
                    />
                    <button
                      className="btn-primary"
                      onClick={sendTestNeoEmail}
                      disabled={testEmailStatus === 'sending' || !testEmailAddress}
                    >
                      {testEmailStatus === 'sending' ? 'Sending…' : 'Send test email'}
                    </button>
                  </div>
                  {testEmailStatus === 'done' && (
                    <p className="map-intro" style={{ marginTop: 8 }}>
                      Sent — check that inbox now.
                    </p>
                  )}
                  {testEmailStatus === 'error' && testEmailError && (
                    <p className="error-text">{testEmailError}</p>
                  )}
                </div>

                <div className="ao-repeat-section">
                  <label className="field-label">Test DPD connection</label>
                  <p className="map-intro">
                    Gets a real access token from DPD using your saved Live credentials, then
                    immediately revokes it. Confirms the connection works end to end — this only
                    tests authentication and never creates a real shipment.
                  </p>
                  <button
                    className="btn-primary"
                    onClick={testDpdConnectionAction}
                    disabled={dpdTestStatus === 'testing'}
                  >
                    {dpdTestStatus === 'testing' ? 'Testing…' : 'Test connection'}
                  </button>
                  {dpdTestStatus === 'done' && dpdTestResult && (
                    <p
                      className="map-intro"
                      style={{ marginTop: 8, color: dpdTestResult.connected ? undefined : '#a3402f' }}
                    >
                      {dpdTestResult.message}
                      {dpdTestResult.keyPreview && (
                        <><br />Key on file: {dpdTestResult.keyPreview}</>
                      )}
                    </p>
                  )}
                </div>

                <div className="ao-repeat-section">
                  <label className="field-label">Find DPD Local service code</label>
                  <p className="map-intro">
                    Looks up which delivery services are actually available for your account,
                    from your kitchen (ST1 4JR) to a sample delivery postcode — using DPD's own
                    lookup, not a guessed code.
                  </p>
                  <div className="pc-modal-inline-row" style={{ marginBottom: 8 }}>
                    <input
                      className="text-input"
                      placeholder="Delivery postcode e.g. M1 2AB"
                      value={dpdLookupPostcode}
                      onChange={(e) => setDpdLookupPostcode(e.target.value)}
                    />
                    <input
                      className="text-input"
                      placeholder="Town e.g. Manchester"
                      value={dpdLookupTown}
                      onChange={(e) => setDpdLookupTown(e.target.value)}
                    />
                  </div>
                  <button
                    className="btn-primary"
                    onClick={lookupDpdServicesAction}
                    disabled={
                      dpdLookupStatus === 'loading' || !dpdLookupPostcode || !dpdLookupTown
                    }
                  >
                    {dpdLookupStatus === 'loading' ? 'Looking up…' : 'Look up'}
                  </button>
                  {dpdLookupStatus === 'error' && dpdLookupError && (
                    <p className="error-text">{dpdLookupError}</p>
                  )}
                  {dpdLookupStatus === 'done' && dpdLookupServices.length > 0 && (
                    <table className="data-table" style={{ marginTop: 12 }}>
                      <thead>
                        <tr>
                          <th>Service</th>
                          <th>Network Code</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dpdLookupServices.map((s, i) => (
                          <tr key={i}>
                            <td>{s.description}</td>
                            <td>{s.networkCode}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {dpdLookupStatus === 'done' && dpdLookupServices.length === 0 && (
                    <p className="map-intro" style={{ marginTop: 8 }}>
                      No services returned for this postcode.
                    </p>
                  )}
                </div>
              </div>
          </section>
        )}

        {tab === 'menu' && (
          <section>
            {loading ? (
              <div className="empty-panel">Loading…</div>
            ) : menuWindows.length === 0 ? (
              <div className="empty-panel">
                No upcoming Wednesday or Sunday window found — set one up first.
              </div>
            ) : (
              <div className="menu-windows-grid">
                {menuWindows.map((w) => {
                  const selected = selectedByWindow[w.id] || []
                  const categories = Array.from(
                    new Set(menuItems.map((m) => m.category || 'Other'))
                  )
                  return (
                    <div key={w.id} className="menu-window-card">
                      <div className="menu-window-title">
                        {w.delivery_day} — w/c{' '}
                        {new Date(w.week_start_date).toLocaleDateString('en-GB')}
                      </div>
                      <div className="menu-window-count">{selected.length} dishes on</div>

                      {categories.map((cat) => (
                        <div key={cat} className="menu-category-block">
                          <div className="menu-category-title">{cat}</div>
                          {menuItems
                            .filter((m) => (m.category || 'Other') === cat)
                            .map((item) => {
                              const isOn = selected.includes(item.id)
                              const isToggling = togglingItem === `${w.id}-${item.id}`
                              return (
                                <label key={item.id} className="menu-item-row">
                                  <span className="menu-item-name">{item.name}</span>
                                  <span className="menu-item-price">
                                    {item.price != null ? money(item.price) : ''}
                                  </span>
                                  <button
                                    type="button"
                                    role="switch"
                                    aria-checked={isOn}
                                    aria-label={`${item.name} on ${w.delivery_day} menu`}
                                    disabled={isToggling}
                                    className={`menu-toggle ${isOn ? 'menu-toggle-on' : ''}`}
                                    onClick={() => toggleMenuItem(w.id, item.id, isOn)}
                                  >
                                    <span className="menu-toggle-knob" />
                                  </button>
                                </label>
                              )
                            })}
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        )}

        {tab === 'map' && (
          <section>
            <p className="map-intro">
              Real map of delivery postcodes, pin size shows order count. Shows orders being
              delivered on the selected date, or everything since launch if no date is picked.
            </p>
            <div className="toolbar">
              <label className="field-label" htmlFor="map-date" style={{ marginBottom: 0 }}>
                Filter by delivery date
              </label>
              <input
                id="map-date"
                type="date"
                className="text-input search-input"
                value={mapDateFilter}
                onChange={(e) => {
                  const value = e.target.value
                  setMapDateFilter(value)
                  loadMapPoints(value || undefined)
                }}
              />
              {mapDateFilter && (
                <button
                  className="segment-pill"
                  onClick={() => {
                    setMapDateFilter('')
                    loadMapPoints()
                  }}
                >
                  Clear (show all)
                </button>
              )}
            </div>
            {loading ? (
              <div className="empty-panel">Loading…</div>
            ) : mapPoints.length === 0 ? (
              <div className="empty-panel">No located orders yet.</div>
            ) : (
              <div className="map-panel">
                <div ref={leafletMapRef} className="leaflet-map-container" />
                <div className="map-list">
                  {mapPoints
                    .slice()
                    .sort((a, b) => b.count - a.count)
                    .map((p) => (
                      <div key={p.postcode} className="map-list-row">
                        <span className="map-list-postcode">{p.postcode}</span>
                        <span className="map-list-count">
                          {p.count} order{p.count !== 1 ? 's' : ''}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </section>
        )}

        {tab === 'insights' && (
          <section>
            <div className="insights-period-row">
              <div className="segment-pills" role="tablist" aria-label="Insights date filter">
                {(
                  [
                    { key: 'today', label: 'Today' },
                    { key: 'week', label: 'This week' },
                    { key: 'month', label: 'This month' },
                    { key: 'all', label: 'All time' },
                    { key: 'custom', label: 'Custom' },
                  ] as const
                ).map((p) => (
                  <button
                    key={p.key}
                    className={`segment-pill ${insightsPeriod === p.key ? 'segment-pill-active' : ''}`}
                    onClick={() => {
                      setInsightsPeriod(p.key)
                      if (p.key !== 'custom') loadInsightsOverview(p.key)
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              {insightsPeriod === 'custom' && (
                <>
                  <input
                    type="date"
                    className="text-input search-input"
                    value={insightsCustomFrom}
                    onChange={(e) => setInsightsCustomFrom(e.target.value)}
                  />
                  <input
                    type="date"
                    className="text-input search-input"
                    value={insightsCustomTo}
                    onChange={(e) => setInsightsCustomTo(e.target.value)}
                  />
                  <button
                    className="btn-primary"
                    onClick={() =>
                      loadInsightsOverview('custom', insightsCustomFrom, insightsCustomTo)
                    }
                  >
                    Apply
                  </button>
                </>
              )}
            </div>

            {/* 1. Next delivery */}
            <div className="insights-block">
              <h2 className="insights-block-title">
                Next delivery
                {nextDelivery ? ` — ${nextDelivery.dayName} (w/c ${new Date(nextDelivery.date).toLocaleDateString('en-GB')})` : ''}
              </h2>
              {!nextDelivery ? (
                <div className="empty-panel">No upcoming delivery window found.</div>
              ) : (
                <>
                  <div className="stat-grid">
                    <StatCard label="Total orders" value={nextDelivery.totalOrders} />
                    <StatCard label="Total meals" value={nextDelivery.totalMeals} />
                    <StatCard label="Revenue" value={money(nextDelivery.revenue)} accent />
                    <StatCard label="Avg. order value" value={money(nextDelivery.avgOrderValue)} />
                    <StatCard
                      label="Avg. meals/order"
                      value={nextDelivery.avgMealsPerOrder.toFixed(1)}
                    />
                    <StatCard label="Subscription orders" value={nextDelivery.subscriptionOrders} />
                    <StatCard label="PAYG orders" value={nextDelivery.paygOrders} />
                  </div>
                </>
              )}
            </div>

            {/* 2. Customer summary */}
            <div className="insights-block">
              <h2 className="insights-block-title">Customer summary</h2>
              {!insightsCustomerSummary ? (
                <div className="empty-panel">Loading…</div>
              ) : (
                <div className="stat-grid">
                  <StatCard label="New customers" value={insightsCustomerSummary.newCustomers} />
                  <StatCard
                    label="Returning customers"
                    value={insightsCustomerSummary.returningCustomers}
                  />
                  <StatCard
                    label="Repeat purchase rate"
                    value={`${insightsCustomerSummary.repeatPurchaseRate}%`}
                  />
                  <StatCard
                    label="Avg. reorder time"
                    value={
                      insightsCustomerSummary.avgReorderDays !== null
                        ? `${insightsCustomerSummary.avgReorderDays}d`
                        : '—'
                    }
                  />
                  <StatCard
                    label="Active subscriptions"
                    value={insightsCustomerSummary.activeSubscriptions}
                    accent
                  />
                </div>
              )}
            </div>

            {/* 3. Production summary */}
            <div className="insights-block">
              <h2 className="insights-block-title">Production summary — next delivery</h2>
              {!nextDelivery || nextDelivery.topDishes.length === 0 ? (
                <div className="empty-panel">No orders for the next window yet.</div>
              ) : (
                <>
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Top 5 dishes needed</th>
                          <th>Quantity</th>
                        </tr>
                      </thead>
                      <tbody>
                        {nextDelivery.topDishes.map((d) => (
                          <tr key={d.name}>
                            <td>{d.name}</td>
                            <td className="num">{d.qty}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="map-intro" style={{ marginTop: 14 }}>
                    Protein breakdown (approximate — based on dish name keywords, not a real
                    ingredient database):{' '}
                    {nextDelivery.proteinBreakdown.map((p) => `${p.protein} ${p.qty}`).join(' · ')}
                  </p>
                  <div className="empty-panel" style={{ marginTop: 10 }}>
                    Ingredients required and packaging required aren't shown — there's no recipe
                    or ingredient database set up in this system yet, so these can't be computed
                    honestly.
                  </div>
                </>
              )}
            </div>

            {/* 4. Financial summary */}
            <div className="insights-block">
              <h2 className="insights-block-title">Financial summary</h2>
              {!insightsFinancial ? (
                <div className="empty-panel">Loading…</div>
              ) : (
                <>
                  <div className="stat-grid">
                    <StatCard label="Revenue" value={money(insightsFinancial.revenue)} accent />
                    <StatCard label="Discounts" value="—" />
                    <StatCard
                      label="Delivery cost (est.)"
                      value={money(insightsFinancial.deliveryCostEstimate)}
                    />
                  </div>
                  <div className="empty-panel" style={{ marginTop: 10 }}>
                    Ingredient costs, packaging costs, gross profit, margin, and profit per
                    order/meal aren't shown — no cost data has been entered yet. Add ingredient
                    and packaging cost data to unlock real profit figures instead of guessed ones.
                  </div>
                </>
              )}
            </div>

            {/* 5. Alerts and actions */}
            <div className="insights-block">
              <h2 className="insights-block-title">Alerts & actions</h2>
              {!insightsAlerts ? (
                <div className="empty-panel">Loading…</div>
              ) : (
                <div className="alerts-grid">
                  <div className="alert-card">
                    <div className="alert-card-value">{insightsAlerts.failedPaymentsCount}</div>
                    <div className="alert-card-label">Failed payments</div>
                  </div>
                  <div className="alert-card">
                    <div className="alert-card-value">
                      {emailLists.find((l) => l.key === 'win_back')?.customers.length ?? 0}
                    </div>
                    <div className="alert-card-label">Customers due a reorder email</div>
                  </div>
                  <div className="alert-card alert-card-muted">
                    <div className="alert-card-value">—</div>
                    <div className="alert-card-label">Orders requiring attention (not tracked yet)</div>
                  </div>
                  <div className="alert-card alert-card-muted">
                    <div className="alert-card-value">—</div>
                    <div className="alert-card-label">Late/failed deliveries (not tracked yet)</div>
                  </div>
                  <div className="alert-card">
                    <div className="alert-card-value">
                      {insightsAlerts.lowSellingDishes[0]?.name || '—'}
                    </div>
                    <div className="alert-card-label">Lowest-selling dish (all-time)</div>
                  </div>
                </div>
              )}
              <button
                className="btn-primary"
                style={{ marginTop: 14 }}
                onClick={() => setTab('product-analytics')}
              >
                View full Product Analytics report
              </button>
            </div>
          </section>
        )}

        {tab === 'product-analytics' && (
          <section>
            <div className="insights-block">
              <h2 className="insights-block-title">Product dashboard</h2>
              <p className="map-intro">
                Per-dish performance from real order data. Profit, margin, and refund % aren't
                shown — there's no cost or refund data tracked yet to compute them honestly.
              </p>
              {productDishes.length === 0 ? (
                <div className="empty-panel">No order data yet.</div>
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Dish</th>
                        <th>Orders</th>
                        <th>Units sold</th>
                        <th>Revenue</th>
                        <th>Attachment rate</th>
                        <th>Repeat purchase %</th>
                        <th>First-order %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productDishes.map((d) => (
                        <tr key={d.name}>
                          <td>{d.name}</td>
                          <td className="num">{d.orders}</td>
                          <td className="num">{d.unitsSold}</td>
                          <td className="num">{money(d.revenue)}</td>
                          <td className="num">{d.attachmentRate}%</td>
                          <td className="num">
                            {d.repeatPurchasePct !== null ? `${d.repeatPurchasePct}%` : '—'}
                          </td>
                          <td className="num">
                            {d.firstOrderPct !== null ? `${d.firstOrderPct}%` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>


            <div className="insights-block">
              <div className="insights-block-header">
                <h2 className="insights-block-title">Best-selling dishes</h2>
                <div className="segment-pills" role="tablist" aria-label="Top dishes period">
                  {(
                    [
                      { key: 'week', label: 'This week' },
                      { key: 'month', label: 'This month' },
                      { key: 'all', label: 'All time' },
                    ] as const
                  ).map((p) => (
                    <button
                      key={p.key}
                      className={`segment-pill ${topDishesPeriod === p.key ? 'segment-pill-active' : ''}`}
                      onClick={() => {
                        setTopDishesPeriod(p.key)
                        loadTopDishes(p.key)
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {loading ? (
                <div className="empty-panel">Loading…</div>
              ) : topDishes.length === 0 ? (
                <div className="empty-panel">No orders in this period yet.</div>
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Dish</th>
                        <th>Quantity sold</th>
                        <th>Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topDishes.slice(0, 20).map((d, i) => (
                        <tr key={d.name}>
                          <td className="num">{i + 1}</td>
                          <td>{d.name}</td>
                          <td className="num">{d.qty}</td>
                          <td className="num">{money(d.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="insights-block">
              <h2 className="insights-block-title">Frequently bought together</h2>
              <p className="map-intro">
                Dish pairs that most often appear in the same order, all-time since launch.
              </p>
              {dishPairs.length === 0 ? (
                <div className="empty-panel">Not enough order data yet.</div>
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Dish A</th>
                        <th>Dish B</th>
                        <th>Times ordered together</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dishPairs.slice(0, 5).map((p) => (
                        <tr key={`${p.dishA}-${p.dishB}`}>
                          <td>{p.dishA}</td>
                          <td>{p.dishB}</td>
                          <td className="num">{p.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        )}

        {tab === 'ops-hub' && (
          <section>
            {!opsHub || !opsHub.nextWindow ? (
              <div className="empty-panel">
                {opsHubLoaded ? 'No upcoming delivery window found.' : 'Loading…'}
              </div>
            ) : (
              (() => {
                const cooked = opsHub.opsStatus?.dishes_cooked || []
                const packed = opsHub.opsStatus?.orders_packed || []
                const labelsPrinted = !!opsHub.opsStatus?.labels_printed
                const dispatchDone = !!opsHub.opsStatus?.dispatch_done
                const deliveriesDone = !!opsHub.opsStatus?.deliveries_done
                const timeline = opsHub.opsStatus?.timeline || []
                const tasks = opsHub.opsStatus?.tasks || []
                const driverAssignments = opsHub.opsStatus?.driver_assignments || {}

                const cookingPct = opsHub.kitchen.dishesToCook.length
                  ? Math.round((cooked.length / opsHub.kitchen.dishesToCook.length) * 100)
                  : 0
                const packingPct = opsHub.packing.totalOrders
                  ? Math.round((packed.length / opsHub.packing.totalOrders) * 100)
                  : 0
                const labelsPct = labelsPrinted ? 100 : 0
                const dispatchPct = dispatchDone ? 100 : 0
                const deliveriesPct = deliveriesDone ? 100 : 0

                const milestones = [
                  'Start cooking',
                  'Packing started',
                  'Labels printed',
                  'Driver loading',
                  'First deliveries leave',
                ]
                const loggedLabels = new Set(timeline.map((t: any) => t.label))

                return (
                  <>
                    {/* Overview */}
                    <div className="insights-block">
                      <h2 className="insights-block-title">
                        Next delivery — {opsHub.nextWindow.dayName} (w/c{' '}
                        {new Date(opsHub.nextWindow.date).toLocaleDateString('en-GB')})
                      </h2>
                      <div className="stat-grid">
                        <StatCard label="Orders" value={opsHub.overview.totalOrders} />
                        <StatCard label="Meals" value={opsHub.overview.totalMeals} />
                        <StatCard label="Revenue" value={money(opsHub.overview.revenue)} accent />
                        <StatCard
                          label="Subscription orders"
                          value={opsHub.overview.subscriptionOrders}
                        />
                        <StatCard label="PAYG orders" value={opsHub.overview.paygOrders} />
                      </div>
                    </div>

                    {/* Live progress */}
                    <div className="insights-block">
                      <h2 className="insights-block-title">Live progress</h2>
                      <div className="progress-rows">
                        {[
                          ['Cooking', cookingPct],
                          ['Packing', packingPct],
                          ['Labels', labelsPct],
                          ['Dispatch', dispatchPct],
                          ['Deliveries', deliveriesPct],
                        ].map(([label, pct]) => (
                          <div key={label as string} className="progress-row">
                            <span className="progress-row-label">{label}</span>
                            <div className="progress-row-track">
                              <div
                                className="progress-row-fill"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="progress-row-pct">{pct}%</span>
                          </div>
                        ))}
                      </div>

                      <h3 className="ops-subtitle">Preparation timeline</h3>
                      <div className="timeline-list">
                        {milestones.map((label) => {
                          const entry = timeline.find((t: any) => t.label === label)
                          return (
                            <div key={label} className="timeline-row">
                              <span className={entry ? 'timeline-done' : 'timeline-pending'}>
                                {entry
                                  ? new Date(entry.completedAt).toLocaleTimeString('en-GB', {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })
                                  : '—'}
                              </span>
                              <span className="timeline-label">{label}</span>
                              {!entry && (
                                <button
                                  className="segment-pill"
                                  onClick={() => postOpsAction('log_timeline', { label })}
                                >
                                  Mark done
                                </button>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    {/* Kitchen */}
                    <div className="insights-block">
                      <div className="insights-block-header">
                        <h2 className="insights-block-title">Kitchen</h2>
                        <button className="btn-primary" onClick={printKitchenSheet}>
                          Print kitchen sheet
                        </button>
                      </div>
                      <div className="table-wrap">
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Dish</th>
                              <th>Qty needed</th>
                              <th>Cooked</th>
                            </tr>
                          </thead>
                          <tbody>
                            {opsHub.kitchen.dishesToCook.map((d: any) => (
                              <tr key={d.name}>
                                <td>{d.name}</td>
                                <td className="num">{d.qty}</td>
                                <td>
                                  <button
                                    role="switch"
                                    aria-checked={cooked.includes(d.name)}
                                    className={`menu-toggle ${cooked.includes(d.name) ? 'menu-toggle-on' : ''}`}
                                    onClick={() => postOpsAction('toggle_dish_cooked', { dish: d.name })}
                                  >
                                    <span className="menu-toggle-knob" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {opsHub.kitchen.ingredientsRequired.length > 0 && (
                        <>
                          <h3 className="ops-subtitle">
                            Ingredients required (approximate — standard recipe portions)
                          </h3>
                          <div className="table-wrap">
                            <table className="data-table">
                              <thead>
                                <tr>
                                  <th>Ingredient</th>
                                  <th>Amount</th>
                                </tr>
                              </thead>
                              <tbody>
                                {opsHub.kitchen.ingredientsRequired.map((i: any) => (
                                  <tr key={i.name}>
                                    <td>{i.name}</td>
                                    <td className="num">{i.kg}kg</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </>
                      )}
                      {opsHub.kitchen.dishesWithoutRecipe.length > 0 && (
                        <p className="map-intro" style={{ marginTop: 10 }}>
                          No recipe data yet for: {opsHub.kitchen.dishesWithoutRecipe.join(', ')}
                        </p>
                      )}
                    </div>

                    {/* Packing */}
                    <div className="insights-block">
                      <h2 className="insights-block-title">Packing</h2>
                      <div className="stat-grid">
                        <StatCard label="Meals packed" value={`${packed.length} / ${opsHub.packing.totalOrders}`} />
                        <StatCard
                          label="Remaining orders"
                          value={opsHub.packing.totalOrders - packed.length}
                        />
                        <StatCard label="Labels to print" value={opsHub.packing.totalOrders} />
                        <StatCard
                          label="Containers (approx., 1/meal)"
                          value={opsHub.packing.totalMeals}
                        />
                      </div>
                      <div className="toolbar" style={{ marginTop: 14 }}>
                        <button
                          className={`segment-pill ${labelsPrinted ? 'segment-pill-active' : ''}`}
                          onClick={() => postOpsAction('set_labels_printed', { value: !labelsPrinted })}
                        >
                          {labelsPrinted ? '✓ Labels printed' : 'Mark labels printed'}
                        </button>
                      </div>
                      <div className="table-wrap" style={{ marginTop: 12 }}>
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Order</th>
                              <th>Postcode</th>
                              <th>Packed</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[...opsHub.delivery.stokeOrders, ...opsHub.delivery.dpdOrders].map(
                              (o: any) => (
                                <tr key={o.id}>
                                  <td>{o.name}</td>
                                  <td>{o.postcode}</td>
                                  <td>
                                    <button
                                      role="switch"
                                      aria-checked={packed.includes(o.id)}
                                      className={`menu-toggle ${packed.includes(o.id) ? 'menu-toggle-on' : ''}`}
                                      onClick={() => postOpsAction('toggle_order_packed', { orderId: o.id })}
                                    >
                                      <span className="menu-toggle-knob" />
                                    </button>
                                  </td>
                                </tr>
                              )
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Delivery */}
                    <div className="insights-block">
                      <h2 className="insights-block-title">Delivery</h2>
                      <div className="toolbar">
                        <button
                          className={`segment-pill ${dispatchDone ? 'segment-pill-active' : ''}`}
                          onClick={() => postOpsAction('set_dispatch_done', { value: !dispatchDone })}
                        >
                          {dispatchDone ? '✓ DPD parcels dispatched' : 'Mark DPD dispatched'}
                        </button>
                        <button
                          className={`segment-pill ${deliveriesDone ? 'segment-pill-active' : ''}`}
                          onClick={() => postOpsAction('set_deliveries_done', { value: !deliveriesDone })}
                        >
                          {deliveriesDone ? '✓ Stoke deliveries out' : 'Mark Stoke deliveries out'}
                        </button>
                      </div>

                      <h3 className="ops-subtitle">
                        Stoke deliveries ({opsHub.delivery.stokeOrders.length}) — in-house
                      </h3>
                      <div className="table-wrap">
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Customer</th>
                              <th>Postcode</th>
                              <th>Driver</th>
                            </tr>
                          </thead>
                          <tbody>
                            {opsHub.delivery.stokeOrders.map((o: any) => (
                              <tr key={o.id}>
                                <td>{o.name}</td>
                                <td>
                                  <a
                                    href={`https://maps.google.com/?q=${encodeURIComponent(o.postcode)}`}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    {o.postcode}
                                  </a>
                                </td>
                                <td>
                                  <input
                                    className="text-input"
                                    style={{ width: 120 }}
                                    defaultValue={driverAssignments[o.id] || ''}
                                    placeholder="Driver name"
                                    onBlur={(e) =>
                                      postOpsAction('set_driver_assignment', {
                                        orderId: o.id,
                                        driver: e.target.value,
                                      })
                                    }
                                  />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <h3 className="ops-subtitle">
                        DPD parcels ({opsHub.delivery.dpdOrders.length})
                      </h3>
                      <div className="table-wrap">
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Customer</th>
                              <th>Postcode</th>
                            </tr>
                          </thead>
                          <tbody>
                            {opsHub.delivery.dpdOrders.map((o: any) => (
                              <tr key={o.id}>
                                <td>{o.name}</td>
                                <td>{o.postcode}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Tasks */}
                    <div className="insights-block">
                      <h2 className="insights-block-title">Tasks & alerts</h2>
                      <div className="alerts-grid">
                        <div className="alert-card">
                          <div className="alert-card-value">{opsHub.tasks.failedPaymentsCount}</div>
                          <div className="alert-card-label">Failed payments</div>
                        </div>
                        <div className="alert-card alert-card-muted">
                          <div className="alert-card-value">—</div>
                          <div className="alert-card-label">Low stock (not tracked yet)</div>
                        </div>
                      </div>

                      {opsHub.customerNotes.length > 0 && (
                        <>
                          <h3 className="ops-subtitle">Delivery instructions this window</h3>
                          <div className="table-wrap">
                            <table className="data-table">
                              <thead>
                                <tr>
                                  <th>Customer</th>
                                  <th>Instructions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {opsHub.customerNotes.map((o: any) => (
                                  <tr key={o.id}>
                                    <td>{o.name}</td>
                                    <td>{o.deliveryInstructions}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </>
                      )}

                      <h3 className="ops-subtitle">Outstanding tasks</h3>
                      <div className="toolbar">
                        <input
                          className="text-input search-input"
                          placeholder="Add a task…"
                          value={newTaskText}
                          onChange={(e) => setNewTaskText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && newTaskText.trim()) {
                              postOpsAction('add_task', { text: newTaskText.trim() })
                              setNewTaskText('')
                            }
                          }}
                        />
                        <button
                          className="btn-primary"
                          onClick={() => {
                            if (newTaskText.trim()) {
                              postOpsAction('add_task', { text: newTaskText.trim() })
                              setNewTaskText('')
                            }
                          }}
                        >
                          Add
                        </button>
                      </div>
                      {tasks.length === 0 ? (
                        <div className="empty-panel">No tasks yet.</div>
                      ) : (
                        <div className="timeline-list">
                          {tasks.map((t: any) => (
                            <div key={t.id} className="timeline-row">
                              <button
                                role="switch"
                                aria-checked={t.done}
                                className={`menu-toggle ${t.done ? 'menu-toggle-on' : ''}`}
                                onClick={() => postOpsAction('toggle_task', { taskId: t.id })}
                              >
                                <span className="menu-toggle-knob" />
                              </button>
                              <span
                                className="timeline-label"
                                style={t.done ? { textDecoration: 'line-through', opacity: 0.6 } : {}}
                              >
                                {t.text}
                              </span>
                              <button
                                className="segment-pill"
                                onClick={() => postOpsAction('delete_task', { taskId: t.id })}
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )
              })()
            )}
          </section>
        )}
      {resetPasswordCustomer && (
        <div
          className="pc-modal-overlay"
          onClick={() => resetPasswordStatus !== 'saving' && setResetPasswordCustomer(null)}
        >
          <div className="pc-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pc-modal-header">
              <h2 className="pc-modal-title">Reset password — {resetPasswordCustomer.name}</h2>
              <button
                className="pc-modal-close"
                onClick={() => setResetPasswordCustomer(null)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="pc-modal-body">
              <div className="pc-modal-section">
                <p className="map-intro">
                  There's no way to see their current password — Supabase only ever stores a
                  one-way hash, so nobody can view it, including us. Setting a brand new one is
                  the only way to help them back in.
                </p>
                <label className="field-label">New password</label>
                <div className="pc-modal-inline-row">
                  <input
                    className="text-input"
                    style={{ flex: 1 }}
                    value={newPasswordValue}
                    onChange={(e) => setNewPasswordValue(e.target.value)}
                  />
                  <button
                    className="segment-pill"
                    onClick={() => setNewPasswordValue(generateSecurePassword())}
                  >
                    Regenerate
                  </button>
                  <button
                    className="segment-pill"
                    onClick={() => {
                      navigator.clipboard.writeText(newPasswordValue)
                      setPasswordCopied(true)
                      setTimeout(() => setPasswordCopied(false), 2000)
                    }}
                  >
                    {passwordCopied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <p className="map-intro" style={{ marginTop: 8 }}>
                  Copy this and send it to the customer yourself (text, email, phone) — once
                  you close this window it won't be shown again.
                </p>
              </div>
              <div className="pc-modal-section">
                <button
                  className="btn-primary"
                  onClick={submitPasswordReset}
                  disabled={resetPasswordStatus === 'saving' || newPasswordValue.length < 8}
                >
                  {resetPasswordStatus === 'saving' ? 'Setting…' : 'Set new password'}
                </button>
                {resetPasswordStatus === 'done' && (
                  <p className="map-intro" style={{ marginTop: 8 }}>
                    Done — they can log in with this new password right away.
                  </p>
                )}
                {resetPasswordStatus === 'error' && resetPasswordError && (
                  <p className="error-text">{resetPasswordError}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {editEmailCustomer && (
        <div
          className="pc-modal-overlay"
          onClick={() => editCustomerEmailStatus !== 'saving' && setEditEmailCustomer(null)}
        >
          <div className="pc-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pc-modal-header">
              <h2 className="pc-modal-title">Edit email — {editEmailCustomer.name}</h2>
              <button
                className="pc-modal-close"
                onClick={() => setEditEmailCustomer(null)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="pc-modal-body">
              <div className="pc-modal-section">
                <p className="map-intro">
                  Updates both their account record and their actual login email together, so
                  they stay able to log in with the corrected address.
                </p>
                <label className="field-label">Email address</label>
                <input
                  className="text-input"
                  style={{ width: '100%' }}
                  value={editCustomerEmailValue}
                  onChange={(e) => setEditCustomerEmailValue(e.target.value)}
                />
              </div>
              <div className="pc-modal-section">
                <button
                  className="btn-primary"
                  onClick={submitCustomerEmailEdit}
                  disabled={
                    editCustomerEmailStatus === 'saving' || !editCustomerEmailValue.includes('@')
                  }
                >
                  {editCustomerEmailStatus === 'saving' ? 'Saving…' : 'Save email'}
                </button>
                {editCustomerEmailStatus === 'done' && (
                  <p className="map-intro" style={{ marginTop: 8 }}>
                    Saved — they can now log in with the new email.
                  </p>
                )}
                {editCustomerEmailStatus === 'error' && editCustomerEmailError && (
                  <p className="error-text">{editCustomerEmailError}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {editDeliveryCustomer && (
        <div
          className="pc-modal-overlay"
          onClick={() => editDeliveryStatus !== 'saving' && setEditDeliveryCustomer(null)}
        >
          <div className="pc-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pc-modal-header">
              <h2 className="pc-modal-title">Edit delivery plan — {editDeliveryCustomer.name}</h2>
              <button
                className="pc-modal-close"
                onClick={() => setEditDeliveryCustomer(null)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="pc-modal-body">
              <div className="pc-modal-section">
                <label className="field-label">Primary delivery day</label>
                <div className="pc-modal-inline-row">
                  <button
                    className={`segment-pill ${editDeliveryPrimaryDay === 'Sunday' ? 'segment-pill-active' : ''}`}
                    onClick={() => setEditDeliveryPrimaryDay('Sunday')}
                  >
                    Sunday
                  </button>
                  <button
                    className={`segment-pill ${editDeliveryPrimaryDay === 'Wednesday' ? 'segment-pill-active' : ''}`}
                    onClick={() => setEditDeliveryPrimaryDay('Wednesday')}
                  >
                    Wednesday
                  </button>
                </div>
              </div>
              <div className="pc-modal-section">
                <label className="field-label">Deliveries per week</label>
                <div className="pc-modal-inline-row">
                  <button
                    className={`segment-pill ${editDeliveryPerWeek === 1 ? 'segment-pill-active' : ''}`}
                    onClick={() => setEditDeliveryPerWeek(1)}
                  >
                    Once a week
                  </button>
                  <button
                    className={`segment-pill ${editDeliveryPerWeek === 2 ? 'segment-pill-active' : ''}`}
                    onClick={() => setEditDeliveryPerWeek(2)}
                  >
                    Twice a week
                  </button>
                </div>
                {editDeliveryPerWeek === 2 && (
                  <p className="map-intro" style={{ marginTop: 8 }}>
                    They'll be set up for both Sunday and Wednesday.
                  </p>
                )}
              </div>
              <div className="pc-modal-section">
                <button
                  className="btn-primary"
                  onClick={submitDeliveryEdit}
                  disabled={editDeliveryStatus === 'saving'}
                >
                  {editDeliveryStatus === 'saving' ? 'Saving…' : 'Save plan'}
                </button>
                {editDeliveryStatus === 'done' && (
                  <p className="map-intro" style={{ marginTop: 8 }}>
                    Saved.
                  </p>
                )}
                {editDeliveryStatus === 'error' && editDeliveryError && (
                  <p className="error-text">{editDeliveryError}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedOrderId && (
        <div className="pc-modal-overlay" onClick={closeOrderDetail}>
          <div className="pc-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pc-modal-header">
              <h2 className="pc-modal-title">Order detail</h2>
              <button className="pc-modal-close" onClick={closeOrderDetail} aria-label="Close">
                ×
              </button>
            </div>

            {orderDetailLoading || !orderDetail ? (
              <div className="empty-panel">Loading…</div>
            ) : (
              <div className="pc-modal-body">
                <div className="pc-modal-section">
                  <div className="pc-modal-customer-name">{orderDetail.customerName}</div>
                  {orderDetail.customerEmail && (
                    <div className="pc-modal-customer-email">{orderDetail.customerEmail}</div>
                  )}
                  <div className="pc-modal-status-row">
                    {orderDetail.order.cancelled ? (
                      <span className="pill pill-warn">Cancelled</span>
                    ) : orderDetail.order.fulfilled ? (
                      <span className="pill pill-active">Fulfilled</span>
                    ) : (
                      <span className="pill pill-muted">Unfulfilled</span>
                    )}
                  </div>
                </div>

                <div className="pc-modal-section">
                  <label className="field-label">Delivery day</label>
                  <div className="pc-modal-inline-row">
                    <input
                      className="text-input"
                      value={editingDeliveryDay}
                      onChange={(e) => setEditingDeliveryDay(e.target.value)}
                      placeholder="Wednesday or Sunday"
                    />
                    <button
                      className="btn-primary"
                      onClick={() =>
                        orderDetailAction('set_delivery_day', { deliveryDay: editingDeliveryDay })
                      }
                      disabled={orderActionStatus === 'saving'}
                    >
                      Save
                    </button>
                  </div>
                </div>

                <div className="pc-modal-section">
                  <label className="field-label">Items</label>
                  {editingItems.map((item, idx) => (
                    <div key={idx} className="pc-modal-item-row">
                      <input
                        className="text-input"
                        style={{ flex: 1 }}
                        value={item.name}
                        onChange={(e) => {
                          const next = [...editingItems]
                          next[idx] = { ...next[idx], name: e.target.value }
                          setEditingItems(next)
                        }}
                      />
                      <input
                        type="number"
                        className="text-input"
                        style={{ width: 70 }}
                        value={item.qty}
                        onChange={(e) => {
                          const next = [...editingItems]
                          next[idx] = { ...next[idx], qty: Number(e.target.value) }
                          setEditingItems(next)
                        }}
                      />
                      <input
                        type="number"
                        step="0.01"
                        className="text-input"
                        style={{ width: 90 }}
                        value={item.price}
                        onChange={(e) => {
                          const next = [...editingItems]
                          next[idx] = { ...next[idx], price: Number(e.target.value) }
                          setEditingItems(next)
                        }}
                      />
                      <button
                        className="segment-pill"
                        onClick={() => setEditingItems(editingItems.filter((_, i) => i !== idx))}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <div className="pc-modal-inline-row" style={{ marginTop: 8 }}>
                    <button
                      className="segment-pill"
                      onClick={() =>
                        setEditingItems([...editingItems, { name: '', price: 0, qty: 1 }])
                      }
                    >
                      + Add item
                    </button>
                    <button
                      className="btn-primary"
                      onClick={saveEditedItems}
                      disabled={orderActionStatus === 'saving'}
                    >
                      Save items
                    </button>
                  </div>
                  <p className="map-intro" style={{ marginTop: 8 }}>
                    Editing items updates your records only — it does not automatically charge
                    or refund the difference in Stripe.
                  </p>
                </div>

                <div className="pc-modal-section">
                  <div className="pc-modal-inline-row">
                    <button
                      className="btn-primary"
                      onClick={() =>
                        orderDetailAction('set_fulfilled', { value: !orderDetail.order.fulfilled })
                      }
                      disabled={orderActionStatus === 'saving'}
                    >
                      {orderDetail.order.fulfilled ? 'Mark unfulfilled' : 'Mark fulfilled'}
                    </button>
                    <button
                      className="segment-pill"
                      onClick={() =>
                        orderDetailAction('set_cancelled', { value: !orderDetail.order.cancelled })
                      }
                      disabled={orderActionStatus === 'saving'}
                    >
                      {orderDetail.order.cancelled ? 'Reinstate order' : 'Cancel order'}
                    </button>
                  </div>
                </div>

                <div className="pc-modal-section">
                  <label className="field-label">Danger zone</label>
                  <p className="map-intro">
                    Permanently deletes this order record — use this for test/junk data only.
                    This cannot be undone. For a real customer's order, use "Cancel order"
                    above instead, which keeps the record but excludes it from cook sheets.
                  </p>
                  <button
                    className="pc-delete-btn"
                    disabled={orderActionStatus === 'saving'}
                    onClick={() => {
                      if (
                        window.confirm(
                          'Permanently delete this order? This cannot be undone.'
                        )
                      ) {
                        deleteOrder(selectedOrderId!)
                      }
                    }}
                  >
                    Delete this order permanently
                  </button>
                </div>

                <div className="pc-modal-section">
                  <label className="field-label">Customer email</label>
                  <p className="map-intro">
                    Fixes a typo'd email so this customer actually receives future emails — also
                    updates their account login email if this order belongs to one.
                  </p>
                  <div className="pc-modal-inline-row">
                    <input
                      className="text-input"
                      style={{ flex: 1 }}
                      value={editEmailInput}
                      onChange={(e) => setEditEmailInput(e.target.value)}
                    />
                    <button
                      className="btn-primary"
                      onClick={() => orderDetailAction('update_email', { email: editEmailInput })}
                      disabled={orderActionStatus === 'saving' || !editEmailInput}
                    >
                      {orderActionStatus === 'saving' ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </div>

                <div className="pc-modal-section">
                  <label className="field-label">DPD Shipment</label>
                  {orderDetail.order.dpd_shipment_id ? (
                    <>
                      <p className="map-intro">
                        Shipment created — consignment {orderDetail.order.dpd_consignment_number}
                      </p>
                      <button
                        className="btn-primary"
                        onClick={getDpdLabelAction}
                        disabled={dpdLabelStatus === 'loading'}
                      >
                        {dpdLabelStatus === 'loading' ? 'Loading…' : 'Get label'}
                      </button>
                      {dpdLabelStatus === 'error' && dpdLabelError && (
                        <p className="error-text">{dpdLabelError}</p>
                      )}
                      {dpdLabelHtml && (
                        <div style={{ marginTop: 12 }}>
                          <iframe
                            title="DPD Label"
                            srcDoc={dpdLabelHtml}
                            style={{ width: '100%', height: 400, border: '1px solid #e8e0d0' }}
                          />
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <p className="map-intro">
                        Creates a REAL shipment through DPD's Live system — this is a genuine,
                        billable booking DPD will collect and deliver, not a test. Only use this
                        once you're ready for an actual real-world shipment.
                      </p>
                      <button
                        className="pc-delete-btn"
                        onClick={() => {
                          if (
                            window.confirm(
                              'This creates a REAL DPD shipment that will be collected and billed. Continue?'
                            )
                          ) {
                            createDpdShipmentAction()
                          }
                        }}
                        disabled={dpdShipmentStatus === 'creating'}
                      >
                        {dpdShipmentStatus === 'creating' ? 'Creating…' : 'Create real DPD shipment'}
                      </button>
                      {dpdShipmentStatus === 'error' && dpdShipmentError && (
                        <p className="error-text">{dpdShipmentError}</p>
                      )}
                    </>
                  )}
                </div>

                <div className="pc-modal-section">
                  <label className="field-label">Resend email</label>
                  <p className="map-intro">
                    For when a customer says they never got their confirmation — sends the real
                    email again with this order's actual details.
                  </p>
                  <div className="pc-modal-inline-row">
                    <select
                      className="text-input"
                      value={resendEmailType}
                      onChange={(e) => setResendEmailType(e.target.value as any)}
                    >
                      <option value="confirmation">Order confirmation</option>
                      <option value="fulfilled">Order fulfilled</option>
                    </select>
                    <button
                      className="btn-primary"
                      onClick={resendOrderEmail}
                      disabled={resendEmailStatus === 'sending'}
                    >
                      {resendEmailStatus === 'sending' ? 'Sending…' : 'Send'}
                    </button>
                  </div>
                  {resendEmailStatus === 'done' && (
                    <p className="map-intro" style={{ marginTop: 8 }}>
                      Sent.
                    </p>
                  )}
                  {resendEmailStatus === 'error' && resendEmailError && (
                    <p className="error-text">{resendEmailError}</p>
                  )}
                </div>

                <div className="pc-modal-section">
                  <label className="field-label">Charge additional amount</label>
                  {orderDetail.canCharge ? (
                    <div className="pc-modal-inline-row">
                      <input
                        type="number"
                        step="0.01"
                        className="text-input"
                        placeholder="£0.00"
                        value={chargeAmountInput}
                        onChange={(e) => setChargeAmountInput(e.target.value)}
                      />
                      <button
                        className="btn-primary"
                        disabled={orderActionStatus === 'saving' || !chargeAmountInput}
                        onClick={() =>
                          orderDetailAction('charge_additional', {
                            amount: Number(chargeAmountInput),
                          })
                        }
                      >
                        Charge card on file
                      </button>
                    </div>
                  ) : (
                    <div className="empty-panel">
                      No saved card on file for this customer — this order can't be charged
                      further from here.
                    </div>
                  )}
                </div>

                {orderActionError && <p className="error-text">{orderActionError}</p>}
              </div>
            )}
          </div>
        </div>
      )}

      </main>
      </div>
      <Styles />
    </div>
  )
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string
  value: string | number
  accent?: boolean
}) {
  return (
    <div className={`stat-card ${accent ? 'stat-card-accent' : ''}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  )
}

function Styles() {
  return (
    <style jsx global>{`
      .pc-modal-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
        z-index: 2000;
        display: flex;
        align-items: flex-start;
        justify-content: center;
        padding: 40px 16px;
        overflow-y: auto;
      }
      .pc-modal {
        background: #ffffff;
        border-radius: 12px;
        width: 100%;
        max-width: 620px;
        box-shadow: 0 24px 64px rgba(0, 0, 0, 0.25);
      }
      .pc-modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 18px 22px;
        border-bottom: 1px solid #e3e3e3;
      }
      .pc-modal-title {
        font-size: 17px;
        font-weight: 700;
        color: #202223;
        margin: 0;
      }
      .pc-modal-close {
        background: none;
        border: none;
        font-size: 22px;
        line-height: 1;
        cursor: pointer;
        color: #6d7175;
        padding: 4px;
      }
      .pc-modal-body {
        padding: 20px 22px 24px;
        display: flex;
        flex-direction: column;
        gap: 20px;
      }
      .pc-modal-section {
        border-bottom: 1px solid #f1f1f1;
        padding-bottom: 18px;
      }
      .pc-modal-section:last-child {
        border-bottom: none;
        padding-bottom: 0;
      }
      .pc-modal-customer-name {
        font-size: 16px;
        font-weight: 700;
        color: #202223;
      }
      .pc-modal-customer-email {
        font-size: 13px;
        color: #6d7175;
        margin-top: 2px;
      }
      .pc-modal-status-row {
        margin-top: 10px;
      }
      .pc-modal-inline-row {
        display: flex;
        gap: 8px;
        align-items: center;
        flex-wrap: wrap;
      }
      .pc-modal-item-row {
        display: flex;
        gap: 8px;
        align-items: center;
        margin-bottom: 8px;
      }

      .pc-admin-root {
        /* Remaps the brand colors this whole file already references (via
           var(--pc-x, #fallback)) to a neutral, Shopify-like palette —
           one change here instead of touching hundreds of individual
           rules. Sidebar/topbar have their own explicit overrides below
           since they need a genuinely different treatment (light sidebar,
           near-black top bar) rather than just following this remap. */
        --pc-green: #202223;
        --pc-green-mid: #6d7175;
        --pc-green-light: #8c9196;
        --pc-cream: #f6f6f7;
        --pc-cream-dark: #e3e3e3;
        --pc-gold: #008060;
        --pc-gold-light: #c9f0e2;
        --pc-gold-dark: #006e52;
        --pc-white: #ffffff;
        min-height: 100vh;
        font-family: var(--font-montserrat), system-ui, sans-serif;
      }

      .pc-topbar {
        position: sticky;
        top: 0;
        z-index: 1000;
        height: 56px;
        background: #1a1a1a;
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 0 16px;
      }
      .pc-topbar-left {
        display: flex;
        align-items: center;
        min-width: 160px;
      }
      .pc-topbar-logo {
        color: #ffffff;
        font-weight: 700;
        font-size: 15px;
        letter-spacing: -0.01em;
      }
      .pc-topbar-refresh {
        font-size: 13px;
        margin-left: 2px;
        line-height: 1;
      }
      .pc-topbar-refresh:disabled {
        opacity: 0.6;
        cursor: default;
      }
      .pc-refresh-spin {
        display: inline-block;
        animation: pc-refresh-spin 0.9s linear infinite;
      }
      @keyframes pc-refresh-spin {
        from {
          transform: rotate(0deg);
        }
        to {
          transform: rotate(360deg);
        }
      }
      .pc-topbar-hamburger {
        display: none;
        background: none;
        border: none;
        color: #ffffff;
        font-size: 18px;
        cursor: pointer;
        padding: 4px 8px 4px 0;
        line-height: 1;
      }
      .pc-topbar-search {
        flex: 1;
        max-width: 640px;
        margin: 0 auto;
        display: flex;
        align-items: center;
        background: rgba(255, 255, 255, 0.08);
        border-radius: 8px;
        padding: 0 12px;
        height: 36px;
      }
      .pc-topbar-search-input {
        flex: 1;
        background: none;
        border: none;
        color: #ffffff;
        font-size: 13px;
        font-family: inherit;
        outline: none;
      }
      .pc-topbar-search-input::placeholder {
        color: rgba(255, 255, 255, 0.5);
      }
      .pc-topbar-search-kbd {
        color: rgba(255, 255, 255, 0.45);
        font-size: 11px;
        border: 1px solid rgba(255, 255, 255, 0.25);
        border-radius: 4px;
        padding: 1px 5px;
        font-family: inherit;
      }
      .pc-topbar-right {
        display: flex;
        align-items: center;
        gap: 12px;
        min-width: 160px;
        justify-content: flex-end;
      }
      .pc-topbar-notif-wrap {
        position: relative;
      }
      .pc-topbar-icon-btn {
        position: relative;
        background: none;
        border: none;
        color: #ffffff;
        font-size: 16px;
        cursor: pointer;
        padding: 6px;
        border-radius: 6px;
        line-height: 1;
      }
      .pc-topbar-icon-btn:hover {
        background: rgba(255, 255, 255, 0.1);
      }
      .pc-topbar-badge {
        position: absolute;
        top: 0;
        right: 0;
        background: #d82c0d;
        color: #fff;
        font-size: 9px;
        font-weight: 700;
        border-radius: 999px;
        min-width: 14px;
        height: 14px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0 3px;
      }
      .pc-topbar-notif-dropdown {
        position: absolute;
        top: calc(100% + 8px);
        right: 0;
        background: #ffffff;
        color: #202223;
        border-radius: 8px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
        min-width: 240px;
        overflow: hidden;
        z-index: 1001;
      }
      .pc-topbar-notif-item {
        display: block;
        width: 100%;
        text-align: left;
        background: none;
        border: none;
        padding: 12px 14px;
        font-size: 13px;
        font-weight: 600;
        color: #d82c0d;
        cursor: pointer;
      }
      .pc-topbar-notif-item:hover {
        background: #f6f6f7;
      }
      .pc-topbar-notif-empty {
        padding: 14px;
        font-size: 13px;
        color: #6d7175;
      }
      .pc-topbar-store-pill {
        background: rgba(255, 255, 255, 0.1);
        color: #ffffff;
        font-size: 12px;
        font-weight: 600;
        padding: 6px 12px;
        border-radius: 999px;
      }

      .pc-admin-shell {
        min-height: calc(100vh - 56px);
        display: flex;
        background: var(--pc-cream, #f5f2ec);
        color: var(--pc-green, #2d3510);
        font-family: var(--font-montserrat), system-ui, sans-serif;
        overflow-x: hidden;
        max-width: 100vw;
      }

      .pc-admin-center {
        align-items: center;
        justify-content: center;
      }

      .pc-admin-loading {
        font-size: 15px;
        color: var(--pc-green-mid, #3a4516);
      }

      /* Login */
      .login-card {
        width: 360px;
        max-width: calc(100vw - 48px);
        background: var(--pc-white, #faf8f4);
        border: 1px solid var(--pc-cream-dark, #ede8de);
        border-radius: 14px;
        padding: 40px 36px;
        box-shadow: 0 12px 40px rgba(45, 53, 16, 0.08);
      }
      .login-eyebrow {
        font-size: 11px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--pc-gold-dark, #9a7c45);
        font-weight: 600;
        margin-bottom: 4px;
      }
      .login-title {
        font-family: var(--font-playfair), serif;
        font-size: 30px;
        font-weight: 900;
        margin: 0 0 28px;
        color: var(--pc-green, #2d3510);
      }
      .field-label {
        display: block;
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.02em;
        color: var(--pc-green-mid, #3a4516);
        margin-bottom: 6px;
      }
      .error-text {
        color: #a3402f;
        font-size: 13px;
        margin: 10px 0 0;
      }
      .pc-delete-btn {
        background: #fff5f4;
        color: #a3402f;
        border: 1px solid #f0c9c2;
        border-radius: 8px;
        padding: 9px 16px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
      }
      .pc-delete-btn:hover {
        background: #a3402f;
        color: #ffffff;
      }
      .pc-delete-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      /* Sidebar — light, Shopify-style: white bg, near-black text, light
         gray active state, not the old dark green panel. */
      .sidebar {
        width: 180px;
        flex-shrink: 0;
        background: #ffffff;
        color: #202223;
        padding: 16px 10px;
        display: flex;
        flex-direction: column;
        gap: 28px;
        position: sticky;
        top: 56px;
        height: calc(100vh - 56px);
        border-right: 1px solid #e3e3e3;
      }
      .sidebar-nav {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .sidebar-link {
        text-align: left;
        background: none;
        border: none;
        color: #202223;
        opacity: 0.85;
        font-family: inherit;
        font-size: 13.5px;
        font-weight: 500;
        padding: 8px 10px;
        border-radius: 8px;
        cursor: pointer;
        transition: background 0.15s ease, opacity 0.15s ease;
      }
      .sidebar-link:hover {
        background: #f1f1f1;
        opacity: 1;
      }
      .sidebar-link:focus-visible {
        outline: 2px solid #008060;
        outline-offset: 2px;
      }
      .sidebar-link-active {
        opacity: 1;
        background: #f1f1f1;
        font-weight: 700;
      }

      /* Main content */
      .main-content {
        flex: 1;
        padding: 36px 44px 60px;
        max-width: 1280px;
        min-width: 0;
        width: 100%;
        box-sizing: border-box;
      }
      .page-header {
        margin-bottom: 22px;
      }
      .page-title {
        font-family: var(--font-playfair), serif;
        font-size: 28px;
        font-weight: 900;
        margin: 0;
        color: var(--pc-green, #2d3510);
      }

      .pc-greeting-block {
        margin-bottom: 28px;
      }
      .pc-greeting-title {
        font-family: var(--font-playfair), serif;
        font-size: 30px;
        font-weight: 900;
        color: #202223;
        margin-bottom: 4px;
      }
      .pc-greeting-sub {
        font-size: 14px;
        color: #6d7175;
        margin-bottom: 20px;
      }
      .pc-ask-box {
        display: flex;
        align-items: center;
        gap: 10px;
        background: #ffffff;
        border: 1px solid #e3e3e3;
        border-radius: 10px;
        padding: 10px 14px;
        max-width: 640px;
        margin-bottom: 16px;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
      }
      .pc-ask-input {
        flex: 1;
        border: none;
        background: none;
        font-size: 14px;
        font-family: inherit;
        outline: none;
        color: #202223;
      }
      .pc-ask-submit {
        background: #202223;
        color: #ffffff;
        border: none;
        border-radius: 8px;
        width: 30px;
        height: 30px;
        cursor: pointer;
        font-size: 14px;
      }
      .pc-quick-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .pc-quick-action-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: #ffffff;
        border: 1px solid #e3e3e3;
        border-radius: 999px;
        padding: 8px 14px;
        font-size: 13px;
        font-weight: 500;
        color: #202223;
        cursor: pointer;
      }
      .pc-quick-action-pill:hover {
        border-color: #b5b5b5;
      }
      .pc-quick-action-count {
        background: #f1f1f1;
        border-radius: 999px;
        padding: 1px 8px;
        font-size: 12px;
        font-weight: 700;
      }

      /* Stat cards */
      .location-summary {
        display: flex;
        flex-wrap: wrap;
        gap: 14px;
        align-items: stretch;
        margin-bottom: 16px;
      }
      .location-toggle {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        align-items: flex-start;
        flex: 1;
        min-width: 220px;
      }
      .dpd-card {
        background: var(--pc-white, #faf8f4);
        border: 1px solid var(--pc-cream-dark, #ede8de);
        border-left: 3px solid var(--pc-green, #2d3510);
        border-radius: 8px;
        padding: 10px 16px;
        min-width: 200px;
      }
      .dpd-label {
        font-size: 11px;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        font-weight: 700;
        color: var(--pc-green-mid, #3a4516);
      }
      .dpd-value {
        font-family: var(--font-playfair), serif;
        font-size: 20px;
        font-weight: 900;
        color: var(--pc-green, #2d3510);
        margin: 2px 0;
      }
      .dpd-meta {
        font-size: 11.5px;
        color: var(--pc-green-mid, #3a4516);
      }
      .area-map {
        background: var(--pc-white, #faf8f4);
        border: 1px solid var(--pc-cream-dark, #ede8de);
        border-radius: 10px;
        padding: 16px 20px;
        margin-bottom: 20px;
      }
      .area-map-toggle {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        background: none;
        border: none;
        padding: 0;
        cursor: pointer;
        text-align: left;
      }
      .area-map-toggle:has(+ .area-row) {
        margin-bottom: 12px;
      }
      .area-map-title {
        font-family: var(--font-playfair), serif;
        font-weight: 900;
        font-size: 15px;
        color: var(--pc-green, #2d3510);
      }
      .area-map-meta {
        font-size: 12px;
        color: var(--pc-green-mid, #3a4516);
      }
      .area-row {
        display: grid;
        grid-template-columns: 60px 1fr 30px;
        align-items: center;
        gap: 10px;
        margin-bottom: 8px;
        font-size: 13px;
      }
      .area-name {
        font-weight: 700;
        color: var(--pc-green, #2d3510);
      }
      .area-bar-track {
        background: var(--pc-cream, #f5f2ec);
        border-radius: 999px;
        height: 8px;
        overflow: hidden;
      }
      .area-bar-fill {
        background: var(--pc-gold, #c9a84c);
        height: 100%;
        border-radius: 999px;
      }
      .area-count {
        text-align: right;
        color: var(--pc-green-mid, #3a4516);
        font-variant-numeric: tabular-nums;
      }

      .menu-windows-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
        gap: 20px;
        align-items: start;
      }
      .menu-window-card {
        background: var(--pc-white, #faf8f4);
        border: 1px solid var(--pc-cream-dark, #ede8de);
        border-top: 3px solid var(--pc-gold, #c9a84c);
        border-radius: 10px;
        padding: 18px 20px;
        min-width: 0;
      }
      .menu-window-title {
        font-family: var(--font-playfair), serif;
        font-weight: 900;
        font-size: 17px;
        color: var(--pc-green, #2d3510);
        text-transform: capitalize;
      }
      .menu-window-count {
        font-size: 12px;
        color: var(--pc-green-mid, #3a4516);
        margin-bottom: 12px;
      }
      .menu-category-block {
        margin-bottom: 16px;
      }
      .menu-category-title {
        font-size: 11px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        font-weight: 700;
        color: var(--pc-gold-dark, #9a7c45);
        margin-bottom: 6px;
      }
      .menu-item-row {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 7px 0;
        border-bottom: 1px solid var(--pc-cream-dark, #ede8de);
        cursor: pointer;
      }
      .menu-item-name {
        flex: 1;
        font-size: 13.5px;
        color: var(--pc-green, #2d3510);
      }
      .menu-item-price {
        font-size: 12.5px;
        color: var(--pc-green-mid, #3a4516);
        font-variant-numeric: tabular-nums;
      }
      .menu-toggle {
        position: relative;
        width: 38px;
        height: 22px;
        border-radius: 999px;
        border: none;
        background: var(--pc-cream-dark, #ede8de);
        cursor: pointer;
        flex-shrink: 0;
        transition: background 0.15s ease;
      }
      .menu-toggle:focus-visible {
        outline: 2px solid var(--pc-gold, #c9a84c);
        outline-offset: 2px;
      }
      .menu-toggle-on {
        background: var(--pc-green, #2d3510);
      }
      .menu-toggle-knob {
        position: absolute;
        top: 2px;
        left: 2px;
        width: 18px;
        height: 18px;
        border-radius: 999px;
        background: var(--pc-white, #faf8f4);
        transition: transform 0.15s ease;
      }
      .menu-toggle-on .menu-toggle-knob {
        transform: translateX(16px);
      }

      .map-intro {
        font-size: 13px;
        color: var(--pc-green-mid, #3a4516);
        margin-bottom: 16px;
      }
      .map-panel {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(220px, 320px);
        gap: 20px;
        align-items: start;
      }
      .leaflet-map-container {
        width: 100%;
        height: 480px;
        background: var(--pc-cream, #f5f2ec);
        border: 1px solid var(--pc-cream-dark, #ede8de);
        border-radius: 10px;
        overflow: hidden;
      }
      .map-list {
        background: var(--pc-white, #faf8f4);
        border: 1px solid var(--pc-cream-dark, #ede8de);
        border-radius: 10px;
        padding: 14px 18px;
        max-height: 480px;
        overflow-y: auto;
        min-width: 0;
      }
      .map-list-row {
        display: flex;
        justify-content: space-between;
        padding: 7px 0;
        border-bottom: 1px solid var(--pc-cream-dark, #ede8de);
        font-size: 13.5px;
      }
      .map-list-postcode {
        font-weight: 700;
        color: var(--pc-green, #2d3510);
      }
      .map-list-count {
        color: var(--pc-green-mid, #3a4516);
      }

      .insights-block {
        margin-bottom: 20px;
      }
      .insights-period-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 10px;
        margin-bottom: 20px;
      }
      .alerts-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 12px;
      }
      .alert-card {
        background: var(--pc-white, #faf8f4);
        border: 1px solid var(--pc-cream-dark, #ede8de);
        border-top: 3px solid var(--pc-gold, #c9a84c);
        border-radius: 10px;
        padding: 14px 16px;
      }
      .alert-card-muted {
        border-top-color: var(--pc-cream-dark, #ede8de);
        opacity: 0.65;
      }
      .alert-card-value {
        font-family: var(--font-playfair), serif;
        font-size: 20px;
        font-weight: 900;
        color: var(--pc-green, #2d3510);
        line-height: 1.2;
      }
      .alert-card-label {
        font-size: 11.5px;
        color: var(--pc-green-mid, #3a4516);
        margin-top: 4px;
      }
      .ops-subtitle {
        font-family: var(--font-playfair), serif;
        font-size: 15px;
        font-weight: 900;
        color: var(--pc-green, #2d3510);
        margin: 20px 0 10px;
      }
      .progress-rows {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .progress-row {
        display: grid;
        grid-template-columns: 90px 1fr 40px;
        align-items: center;
        gap: 10px;
      }
      .progress-row-label {
        font-size: 13px;
        font-weight: 600;
        color: var(--pc-green, #2d3510);
      }
      .progress-row-track {
        background: var(--pc-cream, #f5f2ec);
        border-radius: 999px;
        height: 10px;
        overflow: hidden;
      }
      .progress-row-fill {
        background: var(--pc-gold, #c9a84c);
        height: 100%;
        border-radius: 999px;
        transition: width 0.3s ease;
      }
      .progress-row-pct {
        font-size: 12.5px;
        text-align: right;
        color: var(--pc-green-mid, #3a4516);
        font-variant-numeric: tabular-nums;
      }
      .timeline-list {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .timeline-row {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 8px 0;
        border-bottom: 1px solid var(--pc-cream-dark, #ede8de);
      }
      .timeline-done {
        font-weight: 700;
        color: var(--pc-gold-dark, #9a7c45);
        min-width: 52px;
      }
      .timeline-pending {
        color: var(--pc-green-mid, #3a4516);
        opacity: 0.5;
        min-width: 52px;
      }
      .timeline-label {
        flex: 1;
        font-size: 13.5px;
        color: var(--pc-green, #2d3510);
      }
      .insights-block-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 12px;
        margin-bottom: 16px;
      }
      .insights-block-title {
        font-family: var(--font-playfair), serif;
        font-size: 19px;
        font-weight: 900;
        color: var(--pc-green, #2d3510);
        margin: 0;
      }
      .hour-chart {
        display: flex;
        align-items: flex-end;
        gap: 4px;
        height: 140px;
        background: var(--pc-white, #faf8f4);
        border: 1px solid var(--pc-cream-dark, #ede8de);
        border-radius: 10px;
        padding: 14px 10px 6px;
      }
      .hour-bar-col {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        height: 100%;
        justify-content: flex-end;
      }
      .hour-bar-track {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: flex-end;
      }
      .hour-bar-fill {
        width: 100%;
        background: var(--pc-gold, #c9a84c);
        border-radius: 2px 2px 0 0;
        min-height: 2px;
      }
      .hour-bar-label {
        font-size: 9px;
        color: var(--pc-green-mid, #3a4516);
        margin-top: 4px;
      }
      .email-lists-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 14px;
        margin-top: 14px;
      }
      .email-list-card {
        background: var(--pc-white, #faf8f4);
        border: 1px solid var(--pc-cream-dark, #ede8de);
        border-top: 3px solid var(--pc-gold, #c9a84c);
        border-radius: 10px;
        padding: 14px 16px;
      }
      .email-list-card-featured {
        background: var(--pc-gold-light, #c9f0e2);
        border-color: var(--pc-gold, #008060);
        border-top-width: 3px;
        grid-column: 1 / -1;
      }
      .email-list-header {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        margin-bottom: 10px;
      }
      .email-list-label {
        font-size: 13px;
        font-weight: 600;
        color: var(--pc-green, #2d3510);
      }
      .email-list-count {
        font-family: var(--font-playfair), serif;
        font-size: 20px;
        font-weight: 900;
        color: var(--pc-gold-dark, #9a7c45);
      }
      .email-list-card .btn-primary {
        width: 100%;
        margin-top: 0;
        font-size: 13px;
        padding: 8px 14px;
      }
      .email-list-card .btn-primary:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }

      @media (max-width: 640px) {
        .map-panel {
          grid-template-columns: 1fr;
        }
        .leaflet-map-container {
          height: 340px;
        }
      }

      .orders-header-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 12px;
        margin-bottom: 14px;
      }
      .orders-header-row .btn-primary {
        margin-top: 0;
      }
      .add-order-panel {
        background: var(--pc-white, #faf8f4);
        border: 1px solid var(--pc-cream-dark, #ede8de);
        border-radius: 10px;
        padding: 20px;
        margin-bottom: 20px;
      }
      .add-order-menu-picker {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
        gap: 6px 16px;
        margin-top: 8px;
        margin-bottom: 12px;
        max-height: 320px;
        overflow-y: auto;
        padding: 4px;
        border: 1px solid var(--pc-cream-dark, #ede8de);
        border-radius: 8px;
      }
      .add-order-menu-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 6px 8px;
        border-bottom: 1px solid var(--pc-cream-dark, #ede8de);
      }
      .add-order-menu-name {
        font-size: 13px;
        color: var(--pc-green, #2d3510);
      }
      .add-order-menu-qty {
        width: 60px;
        flex-shrink: 0;
        text-align: center;
      }
      .ao-repeat-section {
        margin-top: 18px;
        padding-top: 16px;
        border-top: 1px solid var(--pc-cream-dark, #ede8de);
      }
      .pc-repeat-checkbox {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
      }
      .ao-repeat-controls {
        margin-top: 14px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        max-width: 420px;
      }
      .form-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 14px;
        margin-bottom: 14px;
      }
      .textarea-input {
        resize: vertical;
        font-family: inherit;
        margin-top: 4px;
        margin-bottom: 14px;
      }

      .status-breakdown {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: 12px;
        margin-bottom: 20px;
      }
      .status-card {
        text-align: left;
        font-family: inherit;
        cursor: pointer;
        background: var(--pc-white, #faf8f4);
        border: 1px solid var(--pc-cream-dark, #ede8de);
        border-radius: 10px;
        padding: 14px 16px;
        transition: border-color 0.15s ease, box-shadow 0.15s ease;
      }
      .status-card:hover {
        border-color: var(--pc-gold, #c9a84c);
      }
      .status-card:focus-visible {
        outline: 2px solid var(--pc-gold, #c9a84c);
        outline-offset: 2px;
      }
      .status-card-active {
        border-color: var(--pc-green, #2d3510);
        box-shadow: inset 0 0 0 1px var(--pc-green, #2d3510);
      }
      .status-card-label {
        font-size: 11px;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        font-weight: 700;
        color: var(--pc-green-mid, #3a4516);
        margin-bottom: 6px;
      }
      .status-card-value {
        font-family: var(--font-playfair), serif;
        font-size: 24px;
        font-weight: 900;
        color: var(--pc-green, #2d3510);
      }

      .today-snapshot {
        background: var(--pc-green, #2d3510);
        border-radius: 10px;
        padding: 16px 20px;
        margin-bottom: 16px;
      }
      .today-snapshot-title {
        font-size: 11px;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        font-weight: 700;
        color: var(--pc-gold-light, #e8d5b0);
        margin-bottom: 10px;
      }
      .today-snapshot-row {
        display: flex;
        flex-wrap: wrap;
        gap: 28px;
      }
      .today-snapshot-item {
        display: flex;
        flex-direction: column;
      }
      .today-snapshot-value {
        font-family: var(--font-playfair), serif;
        font-size: 26px;
        font-weight: 900;
        color: var(--pc-white, #faf8f4);
        line-height: 1;
      }
      .today-snapshot-label {
        font-size: 11px;
        color: var(--pc-gold-light, #e8d5b0);
        margin-top: 4px;
      }

      .stat-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
        gap: 14px;
        margin-bottom: 32px;
      }
      .stat-card {
        background: var(--pc-white, #faf8f4);
        border: 1px solid var(--pc-cream-dark, #ede8de);
        border-top: 3px solid var(--pc-gold, #c9a84c);
        border-radius: 10px;
        padding: 16px 18px;
      }
      .stat-card-accent {
        border-top-color: var(--pc-green, #2d3510);
        background: var(--pc-green, #2d3510);
        color: var(--pc-white, #faf8f4);
      }
      .stat-card-accent .stat-label {
        color: var(--pc-gold-light, #e8d5b0);
      }
      .stat-label {
        font-size: 11px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        font-weight: 600;
        color: var(--pc-green-mid, #3a4516);
        margin-bottom: 8px;
      }
      .stat-value {
        font-family: var(--font-playfair), serif;
        font-size: 28px;
        font-weight: 900;
        line-height: 1;
      }

      /* Toolbar / filters */
      .toolbar {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
        align-items: center;
        margin-bottom: 14px;
      }
      .segment-pills {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        flex: 1;
      }
      .segment-pill {
        font-family: inherit;
        font-size: 12.5px;
        font-weight: 600;
        padding: 7px 13px;
        border-radius: 999px;
        border: 1px solid var(--pc-cream-dark, #ede8de);
        background: var(--pc-white, #faf8f4);
        color: var(--pc-green-mid, #3a4516);
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .segment-pill:hover {
        border-color: var(--pc-gold, #c9a84c);
      }
      .segment-pill:focus-visible {
        outline: 2px solid var(--pc-gold-dark, #9a7c45);
        outline-offset: 2px;
      }
      .segment-pill-active {
        background: var(--pc-green, #2d3510);
        border-color: var(--pc-green, #2d3510);
        color: var(--pc-white, #faf8f4);
      }

      .text-input {
        font-family: inherit;
        font-size: 14px;
        padding: 9px 14px;
        border: 1px solid var(--pc-cream-dark, #ede8de);
        border-radius: 8px;
        background: var(--pc-white, #faf8f4);
        color: var(--pc-green, #2d3510);
        width: 100%;
        box-sizing: border-box;
      }
      .text-input:focus-visible,
      .text-input:focus {
        outline: 2px solid var(--pc-gold, #c9a84c);
        outline-offset: 1px;
        border-color: var(--pc-gold, #c9a84c);
      }
      .search-input {
        max-width: 320px;
      }

      .btn-primary {
        font-family: inherit;
        font-size: 14px;
        font-weight: 700;
        padding: 11px 18px;
        border-radius: 8px;
        border: none;
        background: var(--pc-green, #2d3510);
        color: var(--pc-white, #faf8f4);
        cursor: pointer;
        margin-top: 18px;
      }
      .btn-primary:hover {
        background: var(--pc-green-mid, #3a4516);
      }
      .btn-primary:focus-visible {
        outline: 2px solid var(--pc-gold, #c9a84c);
        outline-offset: 2px;
      }
      .btn-full {
        width: 100%;
      }

      .result-count {
        font-size: 12.5px;
        color: var(--pc-green-mid, #3a4516);
        margin-bottom: 10px;
      }
      .date-filter-toggle-row {
        margin-bottom: 10px;
      }
      .date-filter-toggle {
        font-family: inherit;
        font-size: 12.5px;
        font-weight: 600;
        color: var(--pc-green-mid, #3a4516);
        background: none;
        border: none;
        cursor: pointer;
        padding: 4px 0;
      }
      .date-filter-toggle:hover {
        color: var(--pc-green, #2d3510);
      }
      .date-filter-toggle:focus-visible {
        outline: 2px solid var(--pc-gold, #c9a84c);
        outline-offset: 2px;
      }

      /* Tally chips */
      .tally-row {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-bottom: 22px;
      }
      .tally-chip {
        text-align: left;
        font-family: inherit;
        cursor: pointer;
        background: var(--pc-white, #faf8f4);
        border: 1px solid var(--pc-cream-dark, #ede8de);
        border-left: 3px solid var(--pc-gold, #c9a84c);
        border-radius: 8px;
        padding: 10px 16px;
        transition: box-shadow 0.15s ease, border-color 0.15s ease;
      }
      .tally-chip:hover {
        border-color: var(--pc-gold-dark, #9a7c45);
      }
      .tally-chip:focus-visible {
        outline: 2px solid var(--pc-gold, #c9a84c);
        outline-offset: 2px;
      }
      .tally-chip-active {
        box-shadow: inset 0 0 0 1px var(--pc-green, #2d3510);
        border-left-color: var(--pc-green, #2d3510);
      }
      .cook-sheet-panel {
        background: var(--pc-white, #faf8f4);
        border: 1px solid var(--pc-cream-dark, #ede8de);
        border-radius: 10px;
        padding: 18px 20px;
        margin-bottom: 22px;
      }
      .cook-sheet-title {
        font-family: var(--font-playfair), serif;
        font-weight: 900;
        font-size: 17px;
        color: var(--pc-green, #2d3510);
      }
      .cook-sheet-collapse-toggle {
        display: flex;
        align-items: baseline;
        gap: 10px;
        background: none;
        border: none;
        padding: 0;
        cursor: pointer;
        text-align: left;
      }
      .cook-sheet-collapse-meta {
        font-size: 12px;
        color: var(--pc-green-mid, #3a4516);
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .cook-sheet-header-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 10px;
        margin-bottom: 12px;
      }
      .cook-sheet-actions {
        display: flex;
        gap: 8px;
      }
      .cook-sheet-empty {
        font-size: 13.5px;
        color: var(--pc-green-mid, #3a4516);
      }
      .cook-sheet-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
        gap: 0 20px;
        border-top: 1px solid var(--pc-cream-dark, #ede8de);
      }
      .cook-sheet-list li {
        display: flex;
        align-items: baseline;
        font-size: 13.5px;
        color: var(--pc-green, #2d3510);
        padding: 7px 4px;
        border-bottom: 1px solid var(--pc-cream-dark, #ede8de);
      }
      .cook-sheet-row-alt {
        background: rgba(201, 168, 76, 0.05);
      }
      .cook-sheet-name {
        flex: 1;
      }
      .cook-sheet-split {
        display: inline-flex;
        gap: 6px;
        margin-left: 10px;
        font-size: 11px;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .cook-sheet-split-stoke {
        color: var(--pc-green, #2d3510);
        background: var(--pc-cream, #f5f2ec);
        border: 1px solid var(--pc-cream-dark, #ede8de);
        border-radius: 999px;
        padding: 1px 7px;
      }
      .cook-sheet-split-nat {
        color: var(--pc-gold-dark, #9a7c45);
        background: var(--pc-cream, #f5f2ec);
        border: 1px solid var(--pc-cream-dark, #ede8de);
        border-radius: 999px;
        padding: 1px 7px;
      }
      .cook-sheet-total-split {
        font-weight: 400;
        font-size: 12px;
        color: var(--pc-green-mid, #3a4516);
      }
      .cook-sheet-total-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: 12px;
        padding-top: 10px;
        border-top: 2px solid var(--pc-green, #2d3510);
        font-family: var(--font-playfair), serif;
        font-weight: 900;
        font-size: 15px;
        color: var(--pc-green, #2d3510);
      }
      .cook-sheet-total-qty {
        color: var(--pc-gold-dark, #9a7c45);
      }
      .cook-sheet-qty {
        font-weight: 700;
        color: var(--pc-gold-dark, #9a7c45);
        margin-right: 8px;
        min-width: 34px;
        display: inline-block;
      }
      .tally-day {
        font-weight: 700;
        font-size: 13.5px;
        text-transform: capitalize;
        color: var(--pc-green, #2d3510);
      }
      .tally-meta {
        font-size: 12.5px;
        color: var(--pc-green-mid, #3a4516);
        margin-top: 2px;
      }

      /* Table */
      .table-wrap {
        overflow-x: auto;
        background: var(--pc-white, #faf8f4);
        border: 1px solid var(--pc-cream-dark, #ede8de);
        border-radius: 10px;
      }
      .data-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 13.5px;
      }
      .data-table th {
        text-align: left;
        padding: 12px 16px;
        background: var(--pc-cream, #f5f2ec);
        color: var(--pc-green-mid, #3a4516);
        font-size: 11px;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        font-weight: 700;
        border-bottom: 1px solid var(--pc-cream-dark, #ede8de);
        white-space: nowrap;
      }
      .data-table td {
        padding: 12px 16px;
        border-bottom: 1px solid var(--pc-cream-dark, #ede8de);
        vertical-align: top;
        color: var(--pc-green, #2d3510);
      }
      .data-table tbody tr:last-child td {
        border-bottom: none;
      }
      .data-table tbody tr:hover {
        background: var(--pc-cream, #f5f2ec);
      }
      .num {
        font-variant-numeric: tabular-nums;
        font-weight: 600;
      }
      .nowrap {
        white-space: nowrap;
      }
      .capitalize {
        text-transform: capitalize;
      }
      .items-cell {
        max-width: 260px;
        min-width: 200px;
        white-space: normal;
        line-height: 1.4;
      }
      .items-count {
        font-size: 11px;
        color: var(--pc-green-mid, #3a4516);
        opacity: 0.75;
        margin-top: 2px;
      }

      .customer-cell {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .avatar {
        width: 30px;
        height: 30px;
        border-radius: 999px;
        background: var(--pc-green, #2d3510);
        color: var(--pc-white, #faf8f4);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        flex-shrink: 0;
      }
      .customer-name {
        font-weight: 600;
        color: var(--pc-green, #2d3510);
      }
      .customer-email {
        font-size: 12px;
        color: var(--pc-green-mid, #3a4516);
        opacity: 0.85;
      }

      /* Status pills */
      .pill {
        display: inline-block;
        font-size: 11.5px;
        font-weight: 700;
        padding: 3px 10px;
        border-radius: 999px;
        white-space: nowrap;
      }
      .pill-active {
        background: #e3ead0;
        color: #3a4d1e;
      }
      .pill-muted {
        background: var(--pc-cream-dark, #ede8de);
        color: var(--pc-green-mid, #3a4516);
      }
      .pill-warn {
        background: var(--pc-gold-light, #e8d5b0);
        color: var(--pc-gold-dark, #9a7c45);
      }

      .empty-panel {
        background: var(--pc-white, #faf8f4);
        border: 1px dashed var(--pc-cream-dark, #ede8de);
        border-radius: 10px;
        padding: 28px;
        color: var(--pc-green-mid, #3a4516);
        font-size: 14px;
      }

      @media (max-width: 720px) {
        .pc-topbar-search { display: none; }
        .pc-topbar-store-pill { display: none; }
        .pc-topbar-hamburger { display: inline-flex; }
        .pc-admin-shell {
          flex-direction: column;
        }
        .sidebar {
          position: fixed;
          top: 56px;
          left: 0;
          height: calc(100vh - 56px);
          width: 260px;
          flex-direction: column;
          transform: translateX(-100%);
          transition: transform 0.25s ease;
          z-index: 1500;
          box-shadow: 4px 0 24px rgba(0, 0, 0, 0.15);
        }
        .sidebar-mobile-open {
          transform: translateX(0);
        }
        .sidebar-nav {
          flex-direction: column;
        }
        .pc-sidebar-backdrop {
          position: fixed;
          inset: 56px 0 0 0;
          background: rgba(0, 0, 0, 0.4);
          z-index: 1400;
        }
        .main-content {
          padding: 24px 18px 40px;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        * {
          transition: none !important;
        }
      }
    `}</style>
  )
}
