// test-dpd-local-login.js
// Verifies your DPD Local username/password credentials by requesting a geoSession.
// Run with: node test-dpd-local-login.js
//
// SETUP: Add these to your .env file (use your normal MyDPD web login):
//   DPD_USERNAME=your_username_here
//   DPD_PASSWORD=your_password_here
//   DPD_ACCOUNT_NUMBER=your_account_number_here

require('dotenv').config();

const DPD_USERNAME = process.env.DPD_USERNAME;
const DPD_PASSWORD = process.env.DPD_PASSWORD;
const DPD_ACCOUNT_NUMBER = process.env.DPD_ACCOUNT_NUMBER;

const BASE_URL = 'https://api.dpdlocal.co.uk';

async function login() {
  if (!DPD_USERNAME || !DPD_PASSWORD || !DPD_ACCOUNT_NUMBER) {
    console.error('❌ Missing DPD_USERNAME, DPD_PASSWORD, or DPD_ACCOUNT_NUMBER in your .env file.');
    process.exit(1);
  }

  try {
    const response = await fetch(`${BASE_URL}/user/?action=login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Basic ${Buffer.from(`${DPD_USERNAME}:${DPD_PASSWORD}`).toString('base64')}`
      }
    });

    const data = await response.json();

    if (response.ok && data.data && data.data.geoSession) {
      console.log('✅ Success! Login worked.');
      console.log('GeoSession (first 20 chars):', data.data.geoSession.slice(0, 20) + '...');
      console.log('');
      console.log('Use this on every future request as:');
      console.log(`  GeoClient: account/${DPD_ACCOUNT_NUMBER}`);
      console.log(`  GeoSession: <the full geoSession value>`);
    } else {
      console.error(`❌ Request failed with status ${response.status}`);
      console.error('Response:', JSON.stringify(data, null, 2));

      if (response.status === 401) {
        console.error('👉 Username or password is incorrect.');
      } else if (response.status === 403) {
        console.error('👉 GeoSession/GeoClient header issue.');
      }
    }
  } catch (err) {
    console.error('❌ Network or unexpected error:', err.message);
  }
}

login();