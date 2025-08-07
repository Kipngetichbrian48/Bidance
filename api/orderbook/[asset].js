// File: api/orderbook/[asset].js
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
  const { asset } = req.query;

  // Validate query parameters
  if (!asset) {
    return res.status(400).json({ error: 'Asset is required' });
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

  // Mock order book data (fallback for testing)
  const mockOrderBook = {
    bids: [[29900, 0.5], [29800, 1.0]],
    asks: [[30000, 0.7], [30100, 0.3]],
  };

  try {
    // Check cache
    const cacheKey = `orderbook_${asset}`;
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      console.log('Returning cached order book for', asset);
      return res.status(200).json(cachedData);
    }

    // Fetch from CoinGecko or exchange API (replace with real API call if needed)
    const apiKey = process.env.COINGECKO_API_KEY;
    // Example: Replace with actual order book API if available
    const response = await axios.get(
      `https://api.coingecko.com/api/v3/coins/${asset}/tickers`,
      {
        headers: { 'x-cg-pro-api-key': apiKey },
      }
    );

    const orderBook = {
      bids: response.data.tickers.slice(0, 5).map((t) => [t.last, t.volume]),
      asks: response.data.tickers.slice(5, 10).map((t) => [t.last * 1.01, t.volume]),
    };
    cache.put(cacheKey, orderBook, 5 * 60 * 1000); // Cache for 5 minutes
    console.log('Fetched order book for', asset);
    return res.status(200).json(orderBook);
  } catch (error) {
    console.error('Order book fetch error:', error.message);
    // Return mock data on error
    return res.status(200).json(mockOrderBook);
  }
}