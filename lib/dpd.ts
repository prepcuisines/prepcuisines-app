// DPD Local integration — authentication layer, built against DPD's
// official OpenAPI schema (@dpduk/customer-apis/auth v1.0.0).

type DpdEnvironment = 'sandbox' | 'live'

const BASE_URLS: Record<DpdEnvironment, string> = {
  sandbox: 'https://developers.api.customers.dpd.co.uk',
  live: 'https://api.customers.dpd.co.uk',
}

function getDpdCredentials(env: DpdEnvironment) {
  if (env === 'sandbox') {
    return {
      apiKey: process.env.DPD_SANDBOX_API_KEY?.trim(),
      apiSecret: process.env.DPD_SANDBOX_API_SECRET?.trim(),
    }
  }
  return {
    apiKey: process.env.DPD_LIVE_API_KEY?.trim(),
    apiSecret: process.env.DPD_LIVE_API_SECRET?.trim(),
  }
}

type DpdTokens = { accessToken: string; refreshToken: string }

// GET /v1/customer/auth/access — exchanges API key + secret for a fresh
// access/refresh token pair. Tokens last 24h (access) / 7 days (refresh).
export async function getDpdAccessToken(
  env: DpdEnvironment = 'sandbox'
): Promise<{ success: true; tokens: DpdTokens } | { success: false; error: string }> {
  const { apiKey, apiSecret } = getDpdCredentials(env)

  if (!apiKey || !apiSecret) {
    return { success: false, error: `DPD ${env} credentials are not set in the environment.` }
  }

  const basicAuth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')

  try {
    const res = await fetch(`${BASE_URLS[env]}/v1/customer/auth/access`, {
      method: 'GET',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        Accept: 'application/json',
      },
    })

    const body = await res.json()

    if (!res.ok) {
      return {
        success: false,
        error: `HTTP ${res.status}: ${body?.error?.message || res.statusText}`,
      }
    }

    return {
      success: true,
      tokens: {
        accessToken: body.data.accessToken,
        refreshToken: body.data.refreshToken,
      },
    }
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error contacting DPD' }
  }
}

// GET /v1/customer/auth/refresh — exchanges a refresh token for a fresh
// access/refresh token pair, without needing the key+secret again.
export async function refreshDpdAccessToken(
  refreshToken: string,
  env: DpdEnvironment = 'sandbox'
): Promise<{ success: true; tokens: DpdTokens } | { success: false; error: string }> {
  const { apiKey } = getDpdCredentials(env)
  if (!apiKey) {
    return { success: false, error: `DPD ${env} API key is not set in the environment.` }
  }

  try {
    const res = await fetch(`${BASE_URLS[env]}/v1/customer/auth/refresh`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${refreshToken}`,
        'client-id': apiKey,
        Accept: 'application/json',
      },
    })

    const body = await res.json()

    if (!res.ok) {
      return {
        success: false,
        error: `HTTP ${res.status}: ${body?.error?.message || res.statusText}`,
      }
    }

    return {
      success: true,
      tokens: {
        accessToken: body.data.accessToken,
        refreshToken: body.data.refreshToken,
      },
    }
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error contacting DPD' }
  }
}

// GET /v1/customer/auth/logout — revokes an active access token.
export async function removeDpdAccessToken(
  accessToken: string,
  env: DpdEnvironment = 'sandbox'
): Promise<{ success: boolean; error?: string }> {
  const { apiKey } = getDpdCredentials(env)
  if (!apiKey) {
    return { success: false, error: `DPD ${env} API key is not set in the environment.` }
  }

  try {
    const res = await fetch(`${BASE_URLS[env]}/v1/customer/auth/logout`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'client-id': apiKey,
        Accept: 'application/json',
      },
    })
    const body = await res.json()
    if (!res.ok) {
      return { success: false, error: `HTTP ${res.status}: ${body?.error?.message || res.statusText}` }
    }
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error contacting DPD' }
  }
}

// Simple end-to-end connection test — gets a token and immediately logs
// it out again, so it doesn't leave a lingering active session.
export async function testDpdConnection(env: DpdEnvironment = 'sandbox') {
  const { apiKey } = getDpdCredentials(env)
  const keyPreview = apiKey
    ? `${apiKey.slice(0, 4)}...${apiKey.slice(-4)} (${apiKey.length} chars)`
    : 'not set'

  const tokenResult = await getDpdAccessToken(env)
  if (!tokenResult.success) {
    return {
      configured: true,
      connected: false,
      message: tokenResult.error,
      keyPreview,
    }
  }

  await removeDpdAccessToken(tokenResult.tokens.accessToken, env)

  return {
    configured: true,
    connected: true,
    message: 'Successfully authenticated with DPD and received a valid access token.',
    keyPreview,
  }
}

// --- Shipping — built against DPD's official
// @dpduk/customer-apis/shipping v1.0.0 OpenAPI schema.

type DpdAddress = {
  countryCode: string
  street: string
  town: string
  organisation?: string
  locality?: string
  county?: string
  postcode?: string
}

type DpdContactDetails = {
  contactName?: string
  telephone?: string
}

type CreateDomesticShipmentInput = {
  shipmentDate: string // ISO date-time
  numberOfParcels: number
  totalWeight: number // kg
  networkCode: string // e.g. DPD Local's confirmed service code — NOT DPD's example "1^12"
  collectionAddress: DpdAddress
  collectionContact?: DpdContactDetails
  deliveryAddress: DpdAddress
  deliveryContact?: DpdContactDetails
  deliveryEmail?: string
  deliveryMobile?: string
  shippingRef1?: string // used for our own order ID for reconciliation
}

type CreateShipmentResult =
  | {
      success: true
      shipmentId: string
      consignmentNumber: string
      parcelNumbers: string[]
    }
  | { success: false; error: string }

async function dpdAuthedHeaders(env: DpdEnvironment): Promise<
  { success: true; headers: Record<string, string> } | { success: false; error: string }
> {
  const { apiKey } = getDpdCredentials(env)
  if (!apiKey) {
    return { success: false, error: `DPD ${env} API key is not set in the environment.` }
  }
  const tokenResult = await getDpdAccessToken(env)
  if (!tokenResult.success) {
    return { success: false, error: tokenResult.error }
  }
  return {
    success: true,
    headers: {
      Authorization: `Bearer ${tokenResult.tokens.accessToken}`,
      'client-id': apiKey,
    },
  }
}

// POST /v1/customer/shipping/shipments/domestic — creates a real shipment.
// Only for UK mainland/offshore/Republic of Ireland/Channel Islands
// deliveries. generateCustomsData is left false, correct for mainland UK.
export async function createDomesticShipment(
  input: CreateDomesticShipmentInput,
  env: DpdEnvironment = 'sandbox'
): Promise<CreateShipmentResult> {
  const authResult = await dpdAuthedHeaders(env)
  if (!authResult.success) return { success: false, error: authResult.error }

  const body = {
    shipmentDate: input.shipmentDate,
    generateCustomsData: false,
    outboundConsignment: {
      numberOfParcels: input.numberOfParcels,
      totalWeight: input.totalWeight,
      networkCode: input.networkCode,
      shippingRef1: input.shippingRef1,
      collectionDetails: {
        address: input.collectionAddress,
        contactDetails: input.collectionContact,
      },
      deliveryDetails: {
        address: input.deliveryAddress,
        contactDetails: input.deliveryContact,
        notificationDetails: {
          email: input.deliveryEmail,
          mobile: input.deliveryMobile,
        },
      },
      // Products array is structurally required by the schema even for
      // non-customs domestic shipments — a single generic line item
      // satisfies it without needing per-dish customs declarations.
      parcels: [
        {
          products: [
            {
              productDescription: 'Prepared meals',
              productQty: 1,
              unitWeight: input.totalWeight,
              unitValue: 0.01,
            },
          ],
        },
      ],
    },
  }

  try {
    const res = await fetch(
      `${BASE_URLS[env]}/v1/customer/shipping/shipments/domestic`,
      {
        method: 'POST',
        headers: {
          ...authResult.headers,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
      }
    )

    const responseBody = await res.json()

    if (!res.ok) {
      const firstError = Array.isArray(responseBody?.error) ? responseBody.error[0] : null
      return {
        success: false,
        error: firstError?.message || `HTTP ${res.status}: ${res.statusText}`,
      }
    }

    const consignment = responseBody.data.consignments[0]
    return {
      success: true,
      shipmentId: responseBody.data.shipmentId,
      consignmentNumber: consignment.consignmentNumber,
      parcelNumbers: consignment.parcelNumber,
    }
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error contacting DPD' }
  }
}

// GET /v1/customer/shipping/shipments/{shipmentId}/labels — retrieves
// printable labels for an already-created shipment. printerType 0 = HTML,
// suited to a normal A4 printer rather than a thermal label printer.
export async function getShipmentLabels(
  shipmentId: string,
  env: DpdEnvironment = 'sandbox',
  printerType: 0 | 1 | 2 | 3 = 0
): Promise<{ success: true; labels: string[] } | { success: false; error: string }> {
  const authResult = await dpdAuthedHeaders(env)
  if (!authResult.success) return { success: false, error: authResult.error }

  try {
    const res = await fetch(
      `${BASE_URLS[env]}/v1/customer/shipping/shipments/${shipmentId}/labels?printerType=${printerType}`,
      {
        method: 'GET',
        headers: {
          ...authResult.headers,
          Accept: 'application/json',
        },
      }
    )

    const body = await res.json()

    if (!res.ok) {
      const firstError = Array.isArray(body?.error) ? body.error[0] : null
      return { success: false, error: firstError?.message || `HTTP ${res.status}: ${res.statusText}` }
    }

    return { success: true, labels: body.data.printString }
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error contacting DPD' }
  }
}

// POST /v1/customer/shipping/reference/outboundservices — the correct,
// official way to find which service/network codes are actually valid
// for THIS account, rather than guessing. Returns every available
// service with its human-readable description and the exact networkKey
// to use as networkCode in createDomesticShipment.
export async function getOutboundServices(
  collectionPostcode: string,
  collectionTown: string,
  deliveryPostcode: string,
  deliveryTown: string,
  totalWeight: number,
  numberOfParcels: number = 1,
  env: DpdEnvironment = 'sandbox'
): Promise<
  | { success: true; services: { description: string; networkCode: string }[] }
  | { success: false; error: string }
> {
  const authResult = await dpdAuthedHeaders(env)
  if (!authResult.success) return { success: false, error: authResult.error }

  const body = {
    collectionDetails: {
      address: { countryCode: 'GB', town: collectionTown, postcode: collectionPostcode },
    },
    deliveryDetails: {
      address: { countryCode: 'GB', town: deliveryTown, postcode: deliveryPostcode },
    },
    totalWeight,
    numberOfParcels,
    shipmentType: 0,
  }

  try {
    const res = await fetch(
      `${BASE_URLS[env]}/v1/customer/shipping/reference/outboundservices`,
      {
        method: 'POST',
        headers: {
          ...authResult.headers,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
      }
    )

    const responseBody = await res.json()

    if (!res.ok) {
      const firstError = Array.isArray(responseBody?.error) ? responseBody.error[0] : null
      return {
        success: false,
        error: firstError?.message || `HTTP ${res.status}: ${res.statusText}`,
      }
    }

    const services = (responseBody.data || []).map((s: any) => ({
      description: s.networkDesc,
      networkCode: s.networkKey,
    }))

    return { success: true, services }
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error contacting DPD' }
  }
}

// Confirmed real network codes for prepcuisines' account, looked up via
// getOutboundServices from ST1 4JR — not guessed. Collected the day
// before each delivery day, no guaranteed morning time (so collection
// can happen as late as possible):
// - Wednesday delivery: "Parcel Next Day"
// - Sunday delivery: "Parcel Sunday" (standard Next Day doesn't run on Sundays)
export function getNetworkCodeForDeliveryDay(deliveryDay: string): string | null {
  if (deliveryDay === 'Wednesday') return '2^12'
  if (deliveryDay === 'Sunday') return '2^75'
  return null
}
