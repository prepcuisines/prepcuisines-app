// Klaviyo integration helpers. Requires KLAVIYO_PRIVATE_KEY and
// KLAVIYO_LIST_ID in the environment — every function here silently
// no-ops (logging a warning) if they're not set, so the site never
// breaks because Klaviyo isn't configured yet.

const KLAVIYO_PRIVATE_KEY = process.env.KLAVIYO_PRIVATE_KEY
const KLAVIYO_LIST_ID = process.env.KLAVIYO_LIST_ID
const KLAVIYO_REVISION = '2024-10-15'

function klaviyoHeaders() {
  return {
    Authorization: `Klaviyo-API-Key ${KLAVIYO_PRIVATE_KEY}`,
    revision: KLAVIYO_REVISION,
    'Content-Type': 'application/json',
    accept: 'application/json',
  }
}

// Subscribes an email to marketing + adds it to the configured list. This
// is the ONLY function that should ever be called for someone who hasn't
// explicitly consented — every call site is responsible for checking
// marketing_consent === true first. Creates the profile if it doesn't
// exist yet.
export async function klaviyoSubscribeToList(email: string, listId?: string) {
  if (!KLAVIYO_PRIVATE_KEY) {
    console.warn('KLAVIYO_PRIVATE_KEY not set — skipping Klaviyo subscribe for', email)
    return
  }
  const targetList = listId || KLAVIYO_LIST_ID
  if (!targetList) {
    console.warn('KLAVIYO_LIST_ID not set — skipping Klaviyo subscribe for', email)
    return
  }

  try {
    await fetch('https://a.klaviyo.com/api/profile-subscription-bulk-create-jobs/', {
      method: 'POST',
      headers: klaviyoHeaders(),
      body: JSON.stringify({
        data: {
          type: 'profile-subscription-bulk-create-job',
          attributes: {
            profiles: {
              data: [
                {
                  type: 'profile',
                  attributes: {
                    email,
                    subscriptions: { email: { marketing: { consent: 'SUBSCRIBED' } } },
                  },
                },
              ],
            },
          },
          relationships: {
            list: { data: { type: 'list', id: targetList } },
          },
        },
      }),
    })
  } catch (err) {
    console.error('Klaviyo subscribe failed:', err)
  }
}

// Sets name/custom properties on a profile. Handles the create-or-update
// dance Klaviyo's API requires: tries to create, and if the profile
// already exists (409), updates the existing one instead.
// Bulk version for syncing many people at once (e.g. a one-time catch-up
// of existing consented customers). Klaviyo's endpoint accepts a batch of
// profiles per call, so this chunks a large list into safe batch sizes
// rather than making one request per person.
export async function klaviyoBulkSubscribe(emails: string[], listId?: string) {
  if (!KLAVIYO_PRIVATE_KEY) {
    console.warn('KLAVIYO_PRIVATE_KEY not set — skipping Klaviyo bulk subscribe')
    return { synced: 0 }
  }
  const targetList = listId || KLAVIYO_LIST_ID
  if (!targetList) {
    console.warn('KLAVIYO_LIST_ID not set — skipping Klaviyo bulk subscribe')
    return { synced: 0 }
  }

  const chunkSize = 500
  let synced = 0

  for (let i = 0; i < emails.length; i += chunkSize) {
    const chunk = emails.slice(i, i + chunkSize)
    try {
      const res = await fetch('https://a.klaviyo.com/api/profile-subscription-bulk-create-jobs/', {
        method: 'POST',
        headers: klaviyoHeaders(),
        body: JSON.stringify({
          data: {
            type: 'profile-subscription-bulk-create-job',
            attributes: {
              historical_import: true,
              profiles: {
                data: chunk.map((email) => ({
                  type: 'profile',
                  attributes: {
                    email,
                    subscriptions: { email: { marketing: { consent: 'SUBSCRIBED' } } },
                  },
                })),
              },
            },
            relationships: {
              list: { data: { type: 'list', id: targetList } },
            },
          },
        }),
      })
      if (res.ok || res.status === 202) {
        synced += chunk.length
      }
    } catch (err) {
      console.error('Klaviyo bulk subscribe chunk failed:', err)
    }
  }

  return { synced }
}

export async function klaviyoUpsertProfile(
  email: string,
  attributes: { firstName?: string; lastName?: string; properties?: Record<string, any> }
) {
  if (!KLAVIYO_PRIVATE_KEY) {
    console.warn('KLAVIYO_PRIVATE_KEY not set — skipping Klaviyo profile upsert for', email)
    return
  }

  const body = {
    data: {
      type: 'profile',
      attributes: {
        email,
        ...(attributes.firstName ? { first_name: attributes.firstName } : {}),
        ...(attributes.lastName ? { last_name: attributes.lastName } : {}),
        ...(attributes.properties ? { properties: attributes.properties } : {}),
      },
    },
  }

  try {
    const createRes = await fetch('https://a.klaviyo.com/api/profiles/', {
      method: 'POST',
      headers: klaviyoHeaders(),
      body: JSON.stringify(body),
    })

    if (createRes.status === 409) {
      const errData = await createRes.json().catch(() => null)
      const existingId = errData?.errors?.[0]?.meta?.duplicate_profile_id
      if (existingId) {
        await fetch(`https://a.klaviyo.com/api/profiles/${existingId}/`, {
          method: 'PATCH',
          headers: klaviyoHeaders(),
          body: JSON.stringify({ data: { ...body.data, id: existingId } }),
        })
      }
    }
  } catch (err) {
    console.error('Klaviyo profile upsert failed:', err)
  }
}

// Fires a Klaviyo event (e.g. "Placed Order") against a profile, creating
// the profile if it doesn't exist yet. Use this for order confirmations,
// which powers post-purchase flows, LTV tracking, etc.
export async function klaviyoTrackEvent(
  email: string,
  metricName: string,
  properties: Record<string, any> = {},
  value?: number
) {
  if (!KLAVIYO_PRIVATE_KEY) {
    console.warn('KLAVIYO_PRIVATE_KEY not set — skipping Klaviyo event', metricName, 'for', email)
    return
  }

  try {
    await fetch('https://a.klaviyo.com/api/events/', {
      method: 'POST',
      headers: klaviyoHeaders(),
      body: JSON.stringify({
        data: {
          type: 'event',
          attributes: {
            properties,
            ...(value !== undefined ? { value } : {}),
            metric: { data: { type: 'metric', attributes: { name: metricName } } },
            profile: { data: { type: 'profile', attributes: { email } } },
            time: new Date().toISOString(),
          },
        },
      }),
    })
  } catch (err) {
    console.error('Klaviyo event tracking failed:', err)
  }
}
