// File: api/orderbook/[asset].js
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

async function fetchPriceData(asset, headers, maxRetries) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`Fetching price for ${asset} to generate mock order book, attempt ${attempt}/${maxRetries}`);
    try {
      const priceResponse = await axios.get(
        `https://api.coingecko.com/api/v3/simple/price?ids=${asset}&vs_currencies=usd`,
        { headers }
      );
      const currentPrice = priceResponse.data[asset]?.usd;
      if (!currentPrice) {
        throw new Error('Invalid price data');
      }
      console.log(`Fetched price for ${asset}: ${currentPrice}`);
      return currentPrice;
    } catch (error) {
      console.error(
        `Fetch error for https://api.coingecko.com/api/v3/simple/price?ids=${asset}&vs_currencies=usd (attempt ${attempt}/${maxRetries}):`,
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

  const { asset } = req.query;

  // Validate asset
  const validAssets = ['bitcoin', 'ethereum', 'litecoin', 'ripple', 'cardano', 'solana'];
  if (!validAssets.includes(asset)) {
    return res.status(400).json({ error: 'Invalid asset' });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
    }

    const token = authHeader.split('Bearer ')[1];
    await getAuth().verifyIdToken(token);
    console.log('Token verified successfully');

    const cacheKey = `orderbook_${asset}`;
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      return res.status(200).json(cachedData);
    }

    const apiKey = process.env.COINGECKO_API_KEY;
    const headers = apiKey ? { 'x-cg-api-key': apiKey } : {};
    const maxRetries = 3;

    const currentPrice = await fetchPriceData(asset, headers, maxRetries);

    const mockOrderBook = {
      bids: Array.from({ length: 10 }, (_, i) => [
        (currentPrice || 100) * (1 - (i + 1) / 100),
        10 + Math.random() * 10,
      ]),
      asks: Array.from({ length: 10 }, (_, i) => [
        (currentPrice || 100) * (1 + (i + 1) / 100),
        10 + Math.random() * 10,
      ]),
    };

    if (!currentPrice) {
      console.log(`Falling back to mock order book for ${asset}`);
    }

    cache.put(cacheKey, mockOrderBook, 15 * 60 * 1000); // 15-minute cache
    console.log(`Generated mock order book for ${asset}: ${mockOrderBook.bids.length} bids, ${mockOrderBook.asks.length} asks`);
    res.status(200).json(mockOrderBook);
  } catch (error) {
    console.error('Error generating order book:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}