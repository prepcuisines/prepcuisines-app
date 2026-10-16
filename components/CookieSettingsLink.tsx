'use client'

import { openCookiePreferences } from '@/lib/consent'

export default function CookieSettingsLink() {
  return (
    <a
      href="#cookie-settings"
      onClick={(e) => {
        e.preventDefault()
        openCookiePreferences()
      }}
    >
      Cookie Settings
    </a>
  )
}
