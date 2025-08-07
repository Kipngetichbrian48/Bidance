// File: api/price.js
import { getAuth } from 'firebase-admin/auth';
import { initializeApp, cert } from 'firebase-admin/app';
import axios from 'axios';
import cache from 'memory-cache';

// Initialize Firebase Admin SDK once
let initialized = false;
try {
  if (!initialized) {
    const firebaseConfig = {
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    };
    initializeApp(firebaseConfig);
    initialized = true;
    console.log('Firebase Admin initialized');
  }
} catch (error) {
  if (!/already exists/.test(error.message)) {
    console.error('Firebase initialization error:', error.message);
    // Continue without crashing; rely on mock data below
  }
}

export default async function handler(req, res) {
  // Validate authentication
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.error('Missing or invalid auth header');
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    await getAuth().verifyIdToken(token);
  } catch (error) {
    console.error('Token verification error:', error.message);
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }

  // Mock price data (fallback)
  const mockPrices = {
    bitcoin: { usd: 30000 },
    ethereum: { usd: 1800 },
    litecoin: { usd: 90 },
    ripple: { usd: 0.7 },
    cardano: { usd: 0.5 },
    solana: { usd: 40 },
  };

  try {
    // Check cache
    const cacheKey = 'prices';
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      console.log('Returning cached prices');
      return res.status(200).json(cachedData);
    }

    // Fetch from CoinGecko
    const apiKey = process.env.COINGECKO_API_KEY;
    if (!apiKey) {
      console.error('COINGECKO_API_KEY missing');
      return res.status(200).json(mockPrices);
    }

    const response = await axios.get(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,litecoin,ripple,cardano,solana&vs_currencies=usd',
      {
        headers: { 'x-cg-pro-api-key': apiKey },
        timeout: 5000,
      }
    );

    const prices = response.data;
    if (!prices || Object.keys(prices).length === 0) {
      console.error('Empty price data from CoinGecko');
      return res.status(200).json(mockPrices);
    }

    cache.put(cacheKey, prices, 15 * 60 * 1000); // Cache for 15 minutes (corrected from your 15-minute intent)
    console.log('Fetched prices');
    return res.status(200).json(prices);
  } catch (error) {
    console.error('Price fetch error:', error.message);
    return res.status(200).json(mockPrices); // Fallback to mock data
  }
}