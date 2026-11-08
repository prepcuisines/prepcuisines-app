import type { Metadata } from 'next'
import DriverRun from './DriverRun'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'prepcuisines run',
  robots: { index: false, follow: false },
}

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <DriverRun token={token} />
}
