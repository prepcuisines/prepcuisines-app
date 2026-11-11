import type { Metadata } from 'next'
import { createClient } from '@supabase/supabase-js'
import TradeForm from './TradeForm'

export const revalidate = 300

const TITLE = 'prepcuisines for retail | chef-made, halal, high-protein meals'
const DESC = 'Fresh, chef-made, 100% halal high-protein meals, ready for shelf and delivery. Trade pricing on request. Order a starting range today.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  metadataBase: new URL('https://prepcuisines.co.uk'),
  openGraph: {
    title: TITLE,
    description: DESC,
    url: 'https://prepcuisines.co.uk/trade',
    siteName: 'prepcuisines',
    type: 'website',
    images: [{ url: '/trade-preview.jpg', width: 1200, height: 630, alt: 'prepcuisines meals in branded tubs' }],
  },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESC, images: ['/trade-preview.jpg'] },
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export default async function TradePage() {
  const { data } = await supabase
    .from('menu_items')
    .select('id, name, category, calories, protein_g, carbs_g, fat_g, allergens, image_url')
    .eq('active', true)
    .eq('category', 'meal')
    .order('name', { ascending: true })

  const meals = (data || []).map((m: any) => ({
    id: m.id as string,
    name: (m.name as string).replace(/\s+/g, ' ').trim(),
    calories: m.calories as number | null,
    protein: m.protein_g as string | null,
    carbs: m.carbs_g as string | null,
    fat: m.fat_g as string | null,
    allergens: (m.allergens as string | null) || '',
    image: (m.image_url as string | null) || null,
  }))

  return <TradeForm meals={meals} />
}
