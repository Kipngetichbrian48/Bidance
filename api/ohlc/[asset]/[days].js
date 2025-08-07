// File: api/ohlc/[asset]/[days].js
import { getAuth } from 'firebase-admin/auth';
import { initializeApp, cert } from 'firebase-admin/app';
import axios from 'axios';
import cache from 'memory-cache';

// Initialize Firebase Admin SDK
const firebaseConfig = {
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
};

try {
  initializeApp(firebaseConfig);
} catch (error) {
  if (!/already exists/.test(error.message)) {
    console.error('Firebase initialization error:', error.message);
  }
}

export default async function handler(req, res) {
  const { asset, days } = req.query;

  // Validate query parameters
  if (!asset || !days) {
    return res.status(400).json({ error: 'Asset and days are required' });
  }

  // Validate authentication
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    await getAuth().verifyIdToken(token);
  } catch (error) {
    console.error('Token verification error:', error.message);
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }

  // Mock OHLC data (fallback for testing)
  const mockOhlcData = [
    [1697059200000, 30000, 31000, 29500, 30500],
    [1697145600000, 30500, 31500, 30000, 31000],
    // Add more mock data as needed
  ];

  try {
    // Check cache
    const cacheKey = `ohlc_${asset}_${days}`;
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      console.log('Returning cached OHLC data for', asset);
      return res.status(200).json(cachedData);
    }

    // Fetch from CoinGecko (replace with real API call if needed)
    const apiKey = process.env.COINGECKO_API_KEY;
    const response = await axios.get(
      `https://api.coingecko.com/api/v3/coins/${asset}/ohlc?vs_currency=usd&days=${days}`,
      {
        headers: { 'x-cg-pro-api-key': apiKey },
      }
    );

    const ohlcData = response.data;
    cache.put(cacheKey, ohlcData, 5 * 60 * 1000); // Cache for 5 minutes
    console.log('Fetched OHLC data for', asset);
    return res.status(200).json(ohlcData);
  } catch (error) {
    console.error('OHLC fetch error:', error.message);
    // Return mock data on error
    return res.status(200).json(mockOhlcData);
  }
}