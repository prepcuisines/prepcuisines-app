import type { Metadata } from 'next'
import { createClient } from '@supabase/supabase-js'
import { getLinkByToken, getOpenCashWindows } from '@/lib/cashOrder'
import CashOrderForm from './CashOrderForm'

// Always live: the menu and cutoffs change, so never cache this page.
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const metadata: Metadata = {
  title: 'prepcuisines order',
  robots: { index: false, follow: false },
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const link = await getLinkByToken(supabase, token)

  if (!link) {
    return (
      <main style={{ minHeight: '100vh', background: '#f5f0e8', display: 'grid', placeItems: 'center', padding: 24, fontFamily: 'Helvetica, Arial, sans-serif' }}>
        <div style={{ maxWidth: 420, textAlign: 'center', color: '#1a2e1a' }}>
          <h1 style={{ fontFamily: 'Georgia, serif', fontWeight: 400, fontSize: 28 }}>This link isn&apos;t active</h1>
          <p style={{ lineHeight: 1.6 }}>Please message prepcuisines for a new order link.</p>
        </div>
      </main>
    )
  }

  const windows = await getOpenCashWindows(supabase, link.meal_price)
  return <CashOrderForm token={token} customerName={link.name} deliveryFee={link.delivery_fee} mealPrice={link.meal_price === null || link.meal_price === undefined ? 6 : Number(link.meal_price)} windows={windows} />
}
