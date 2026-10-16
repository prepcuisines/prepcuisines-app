// Visitor's advertising-cookie choice. Stored in localStorage (for the
// browser) and in a first-party cookie (so our own server routes can see
// the choice when a purchase is made, before sending anything to Meta).

export type ConsentChoice = 'granted' | 'denied'

export const CONSENT_KEY = 'pc_ads_consent'
export const CONSENT_CHANGED_EVENT = 'pc-consent-changed'
export const CONSENT_OPEN_EVENT = 'pc-consent-open'

export function getConsent(): ConsentChoice | null {
  try {
    const v = localStorage.getItem(CONSENT_KEY)
    if (v === 'granted' || v === 'denied') return v
  } catch {
    // fall through to the cookie
  }
  const m = document.cookie.match(new RegExp('(?:^|; )' + CONSENT_KEY + '=(granted|denied)'))
  return m ? (m[1] as ConsentChoice) : null
}

export function setConsent(choice: ConsentChoice) {
  try {
    localStorage.setItem(CONSENT_KEY, choice)
  } catch {
    // ignore - the cookie below still records it
  }
  document.cookie = `${CONSENT_KEY}=${choice}; Max-Age=31536000; Path=/; SameSite=Lax${
    location.protocol === 'https:' ? '; Secure' : ''
  }`
  window.dispatchEvent(new CustomEvent(CONSENT_CHANGED_EVENT, { detail: choice }))
}

export function openCookiePreferences() {
  window.dispatchEvent(new Event(CONSENT_OPEN_EVENT))
}
