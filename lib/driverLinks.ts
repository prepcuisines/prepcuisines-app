// Private per-driver run links. A link works for DRIVER_LINK_HOURS after the
// driver first opens it; one that is never opened stops working after
// UNOPENED_LINK_HOURS.
export const DRIVER_LINK_HOURS = 3
export const UNOPENED_LINK_HOURS = 24

export type DriverLinkRow = {
  token: string
  delivery_date: string
  driver: string
  done: string[] | null
  first_opened_at: string | null
  expires_at: string | null
  created_at: string
}

export function linkExpiry(row: Pick<DriverLinkRow, 'expires_at' | 'created_at'>): number {
  if (row.expires_at) return new Date(row.expires_at).getTime()
  return new Date(row.created_at).getTime() + UNOPENED_LINK_HOURS * 3600_000
}

export const linkIsLive = (row: Pick<DriverLinkRow, 'expires_at' | 'created_at'>) => linkExpiry(row) > Date.now()
