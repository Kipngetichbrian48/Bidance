// File: api/ohlc/[asset]/[days].js
import axios from 'axios';
import cache from 'memory-cache';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

if (!cache.get('firebase_initialized')) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
  cache.put('firebase_initialized', true);
  console.log('Firebase Admin initialized successfully');
}

async function fetchOhlcData(asset, days, headers, maxRetries) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`Fetching OHLC data for ${asset} (${days} days), attempt ${attempt}/${maxRetries}`);
    try {
      const response = await axios.get(
        `https://api.coingecko.com/api/v3/coins/${asset}/ohlc?vs_currency=usd&days=${days}`,
        { headers }
      );
      const ohlcData = response.data;
      console.log(`Fetched OHLC data for ${asset}: ${ohlcData.length} entries`);
      return ohlcData;
    } catch (error) {
      console.error(
        `Fetch error for https://api.coingecko.com/api/v3/coins/${asset}/ohlc?vs_currency=usd&days=${days} (attempt ${attempt}/${maxRetries}):`,
        { message: error.message, status: error.response?.status }
      );
      if (attempt === maxRetries || error.response?.status !== 429) {
        throw error;
      }
      console.log('CoinGecko rate limit exceeded. Waiting before retry.');
      await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
    }
  }
  return null; // Fallback if all retries fail
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { asset, days } = req.query;

  // Validate asset and days
  const validAssets = ['bitcoin', 'ethereum', 'litecoin', 'ripple', 'cardano', 'solana'];
  const validDays = ['7', '14', '30', '90'];
  if (!validAssets.includes(asset)) {
    return res.status(400).json({ error: 'Invalid asset' });
  }
  if (!validDays.includes(days)) {
    return res.status(400).json({ error: 'Invalid days parameter' });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
    }

    const token = authHeader.split('Bearer ')[1];
    await getAuth().verifyIdToken(token);
    console.log('Token verified successfully');

    const cacheKey = `ohlc_${asset}_${days}`;
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      return res.status(200).json(cachedData);
    }

    const apiKey = process.env.COINGECKO_API_KEY;
    const headers = apiKey ? { 'x-cg-api-key': apiKey } : {};
    const maxRetries = 3;

    let ohlcData = await fetchOhlcData(asset, days, headers, maxRetries);

    if (!ohlcData) {
      console.log(`Falling back to mock OHLC data for ${asset}`);
      const now = Date.now();
      const interval = 4 * 60 * 60 * 1000; // 4 hours
      const mockPrice = asset === 'litecoin' ? 80 : asset === 'solana' ? 150 : 100; // Asset-specific mock price
      ohlcData = Array.from({ length: 42 }, (_, i) => {
        const time = now - (41 - i) * interval;
        const basePrice = mockPrice * (1 + (Math.random() - 0.5) / 10);
        return [
          time,
          basePrice,
          basePrice * 1.02,
          basePrice * 0.98,
          basePrice * (1 + (Math.random() - 0.5) / 20),
        ];
      });
      console.log(`Returning mock OHLC data for ${asset}: ${ohlcData.length} entries`);
    }

    cache.put(cacheKey, ohlcData, 15 * 60 * 1000); // 15-minute cache
    res.status(200).json(ohlcData);
  } catch (error) {
    console.error(`Error fetching OHLC data for ${asset}:`, error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}