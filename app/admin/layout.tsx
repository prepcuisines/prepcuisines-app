import type { Metadata } from 'next'

// Scoped to /admin only — installing this page to a phone's home screen
// (Safari: Share -> Add to Home Screen, Android Chrome: menu -> Install app)
// opens it standalone, full-screen, with its own icon - like a real app,
// without needing an App Store build.
export const metadata: Metadata = {
  title: 'prepcuisines Admin',
  manifest: '/admin-manifest.json',
  icons: {
    icon: '/admin-icons/icon-192.png',
    apple: '/admin-icons/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'PC Admin',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
}

export const viewport = {
  themeColor: '#2f3a2a',
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children
}
