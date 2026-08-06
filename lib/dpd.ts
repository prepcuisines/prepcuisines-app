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
      apiKey: process.env.DPD_SANDBOX_API_KEY,
      apiSecret: process.env.DPD_SANDBOX_API_SECRET,
    }
  }
  return {
    apiKey: process.env.DPD_LIVE_API_KEY,
    apiSecret: process.env.DPD_LIVE_API_SECRET,
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
        error: body?.error?.message || `DPD returned status ${res.status}`,
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
        error: body?.error?.message || `DPD returned status ${res.status}`,
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
      return { success: false, error: body?.error?.message || `DPD returned status ${res.status}` }
    }
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error contacting DPD' }
  }
}

// Simple end-to-end connection test — gets a token and immediately logs
// it out again, so it doesn't leave a lingering active session.
export async function testDpdConnection(env: DpdEnvironment = 'sandbox') {
  const tokenResult = await getDpdAccessToken(env)
  if (!tokenResult.success) {
    return { configured: true, connected: false, message: tokenResult.error }
  }

  await removeDpdAccessToken(tokenResult.tokens.accessToken, env)

  return {
    configured: true,
    connected: true,
    message: 'Successfully authenticated with DPD and received a valid access token.',
  }
}
