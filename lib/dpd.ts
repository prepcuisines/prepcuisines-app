// DPD Local integration — scaffolding only for now.
//
// Waiting on confirmed technical documentation for DPD Local's newer
// Key + Secret authentication system before filling in real request
// logic here. The older username/password flow (GEOSession header
// pattern) is well documented publicly, but that's a different,
// legacy credential type from what's actually been set up
// (DPD_SANDBOX_API_KEY / DPD_SANDBOX_API_SECRET) — filling this in
// against the wrong spec risks creating malformed real shipments once
// live, so it's deliberately left as a stub until confirmed.

type DpdEnvironment = 'sandbox' | 'live'

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

// Placeholder — will be replaced with the real request format once
// confirmed. For now, just reports whether credentials are configured,
// so the admin test button has something honest to say.
export async function testDpdConnection(env: DpdEnvironment = 'sandbox') {
  const { apiKey, apiSecret } = getDpdCredentials(env)

  if (!apiKey || !apiSecret) {
    return {
      configured: false,
      message: `DPD ${env} credentials are not set in the environment.`,
    }
  }

  return {
    configured: true,
    message:
      'Credentials are present, but the actual DPD request logic is not built yet — waiting on confirmed API documentation.',
  }
}
