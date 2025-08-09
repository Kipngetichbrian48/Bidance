// File: api/orderbook/[asset].js
import cache from 'memory-cache';

// Map asset IDs to CoinGecko IDs
const assetMap = {
  bitcoin: 'bitcoin',
  ethereum: 'ethereum',
  litecoin: 'litecoin',
  ripple: 'ripple',
  cardano: 'cardano',
  solana: 'solana',
};

export default async function handler(req, res) {
  try {
    const { asset } = req.query;

    // Validate query parameters
    if (!asset) {
      console.error('Missing asset:', asset);
      return res.status(400).json({ error: 'Asset is required' });
    }

    // Map asset to CoinGecko ID
    const coingeckoAsset = assetMap[asset.toLowerCase()];
    if (!coingeckoAsset) {
      console.error('Invalid asset:', asset);
      return res.status(400).json({ error: `Invalid asset: ${asset}` });
    }

    // Initialize Firebase Admin SDK
    let getAuth, initializeApp, cert;
    try {
      ({ getAuth } = await import('firebase-admin/auth'));
      ({ initializeApp, cert } = await import('firebase-admin/app'));
      let initialized = false;
      if (!initialized) {
        const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
        if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !privateKey) {
          console.error('Missing Firebase environment variables', {
            projectId: !!process.env.FIREBASE_PROJECT_ID,
            clientEmail: !!process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: !!privateKey,
          });
          throw new Error('Missing Firebase environment variables');
        }
        const firebaseConfig = {
          credential: cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: privateKey,
          }),
        };
        initializeApp(firebaseConfig);
        initialized = true;
        console.log('Firebase Admin initialized');
      }
    } catch (error) {
      console.error('Firebase initialization error:', error.message, error.stack);
    }

    // Dynamic import for axios
    let axios;
    try {
      axios = (await import('axios')).default;
      console.log('Axios imported successfully');
    } catch (error) {
      console.error('Failed to import axios:', error.message, error.stack);
    }

    // Validate authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('Missing or invalid auth header');
      return res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
    }

    const token = authHeader.split('Bearer ')[1];
    try {
      await getAuth().verifyIdToken(token);
      console.log('Token verified successfully');
    } catch (error) {
      console.error('Token verification error:', error.message, error.stack);
      return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }

    // Mock order book data (fallback)
    const mockOrderBook = {
      bids: [[29900, 0.5], [29800, 1.0]],
      asks: [[30000, 0.7], [30100, 0.3]],
    };

    // Check cache
    const cacheKey = `orderbook_${asset}`;
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      console.log('Returning cached order book for', asset);
      return res.status(200).json(cachedData);
    }

    // Fetch from CoinGecko
    const apiKey = process.env.COINGECKO_API_KEY;
    if (!apiKey || !axios) {
      console.error('COINGECKO_API_KEY missing or axios unavailable:', { apiKey: !!apiKey, axios: !!axios });
      return res.status(200).json(mockOrderBook);
    }

    try {
      const response = await axios.get(
        `https://api.coingecko.com/api/v3/coins/${coingeckoAsset}/tickers`,
        {
          headers: { 'x-cg-pro-api-key': apiKey },
          timeout: 5000,
        }
      );

      const orderBook = {
        bids: response.data.tickers.slice(0, 5).map((t) => [t.last, t.volume]),
        asks: response.data.tickers.slice(5, 10).map((t) => [t.last * 1.01, t.volume]),
      };
      console.log('Fetched order book from CoinGecko for', coingeckoAsset);
      cache.put(cacheKey, orderBook, 15 * 60 * 1000); // Cache for 5 minutes
      console.log('Fetched order book for', asset);
      return res.status(200).json(orderBook);
    } catch (error) {
      console.error('CoinGecko API error:', error.message, error.response?.data, error.stack);
      return res.status(200).json(mockOrderBook); // Fallback to mock data
    }
  } catch (error) {
    console.error('API handler error:', error.message, error.stack);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}