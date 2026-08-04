// test-dpd-auth.js
// Quick script to verify your DPD API credentials are correct.
// Run with: node test-dpd-auth.js
//
// SETUP: Put your real key/secret in a .env file (never hardcode them here):
//   DPD_API_KEY=your_key_here
//   DPD_API_SECRET=your_secret_here
//   DPD_ENV=sandbox   (or "production" once you're ready to go live)

require('dotenv').config();

const DPD_API_KEY = process.env.DPD_API_KEY;
const DPD_API_SECRET = process.env.DPD_API_SECRET;
const DPD_ENV = process.env.DPD_ENV || 'sandbox';

const BASE_URL = DPD_ENV === 'production'
  ? 'https://api.customers.dpd.co.uk'
  : 'https://developers.api.customers.dpd.co.uk';

async function getAccessToken() {
  if (!DPD_API_KEY || !DPD_API_SECRET) {
    console.error('❌ Missing DPD_API_KEY or DPD_API_SECRET in your .env file.');
    process.exit(1);
  }

  try {
    const response = await fetch(`${BASE_URL}/v1/customer/auth/access`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Buffer.from(`${DPD_API_KEY}:${DPD_API_SECRET}`).toString('base64')}`
      }
    });

    const data = await response.json();

    if (response.ok) {
      console.log('✅ Success! Your credentials are valid.');
      console.log('Access Token (first 20 chars):', data.data.accessToken.slice(0, 20) + '...');
      console.log('Refresh Token (first 20 chars):', data.data.refreshToken.slice(0, 20) + '...');
    } else {
      console.error(`❌ Request failed with status ${response.status}`);
      console.error('Response:', JSON.stringify(data, null, 2));

      if (response.status === 401) {
        console.error('👉 Your API key/secret combo is likely wrong.');
      } else if (response.status === 403) {
        console.error('👉 IP restriction issue — DPD may need your server IP whitelisted.');
      }
    }
  } catch (err) {
    console.error('❌ Network or unexpected error:', err.message);
  }
}

getAccessToken();