// File: api/price.js
import cache from 'memory-cache';

export default async function handler(req, res) {
  try {
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

    // Mock price data (fallback)
    const mockPrices = {
      bitcoin: { usd: 30000 },
      ethereum: { usd: 1800 },
      litecoin: { usd: 90 },
      ripple: { usd: 0.7 },
      cardano: { usd: 0.5 },
      solana: { usd: 40 },
    };

    // Check cache
    const cacheKey = 'prices';
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      console.log('Returning cached prices');
      return res.status(200).json(cachedData);
    }

    // Fetch from CoinGecko
    const apiKey = process.env.COINGECKO_API_KEY;
    if (!apiKey || !axios) {
      console.error('COINGECKO_API_KEY missing or axios unavailable:', { apiKey: !!apiKey, axios: !!axios });
      return res.status(200).json(mockPrices);
    }

    try {
      const response = await axios.get(
        'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,litecoin,ripple,cardano,solana&vs_currencies=usd',
        {
          headers: { 'x-cg-pro-api-key': apiKey },
          timeout: 5000,
        }
      );

      const prices = response.data;
      console.log('Fetched data from CoinGecko:', prices);
      if (!prices || Object.keys(prices).length === 0) {
        console.error('Empty price data from CoinGecko');
        return res.status(200).json(mockPrices);
      }

      cache.put(cacheKey, prices, 15 * 60 * 1000); // Cache for 15 minutes
      console.log('Fetched prices:', prices);
      return res.status(200).json(prices);
    } catch (error) {
      console.error('CoinGecko API error:', error.message, error.response?.data, error.stack);
      return res.status(200).json(mockPrices); // Fallback to mock data
    }
  } catch (error) {
    console.error('API handler error:', error.message, error.stack);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}