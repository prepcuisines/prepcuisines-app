import type { Metadata } from 'next'
import { getLiveExtras } from '@/lib/extras-data'
import ExtrasClient from './ExtrasClient'

export const dynamic = 'force-dynamic'

const TITLE = 'Extra meals this week | prepcuisines'
const DESC = 'Fresh, chef-made, halal high-protein meals ready now. Limited portions, Stoke-on-Trent delivery. Grab yours before they sell out.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  metadataBase: new URL('https://prepcuisines.co.uk'),
  robots: { index: false, follow: false },
  openGraph: {
    title: TITLE,
    description: DESC,
    url: 'https://prepcuisines.co.uk/extras',
    siteName: 'prepcuisines',
    type: 'website',
    images: [{ url: '/trade-preview.jpg', width: 1200, height: 630, alt: 'prepcuisines meals in branded tubs' }],
  },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESC, images: ['/trade-preview.jpg'] },
}

export default async function ExtrasPage() {
  const drop = await getLiveExtras()
  return <ExtrasClient initial={drop} />
}
