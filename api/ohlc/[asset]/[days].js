// File: api/ohlc/[asset]/[days].js
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
    const { asset, days } = req.query;

    // Validate query parameters
    if (!asset || !days) {
      console.error('Missing asset or days:', { asset, days });
      return res.status(400).json({ error: 'Asset and days are required' });
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

    // Mock OHLC data (fallback)
    const mockOhlcData = [
      [1697059200000, 30000, 31000, 29500, 30500],
      [1697145600000, 30500, 31500, 30000, 31000],
    ];

    // Check cache
    const cacheKey = `ohlc_${asset}_${days}`;
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      console.log('Returning cached OHLC data for', asset);
      return res.status(200).json(cachedData);
    }

    // Fetch from CoinGecko
    const apiKey = process.env.COINGECKO_API_KEY;
    if (!apiKey || !axios) {
      console.error('COINGECKO_API_KEY missing or axios unavailable:', { apiKey: !!apiKey, axios: !!axios });
      return res.status(200).json(mockOhlcData);
    }

    try {
      const response = await axios.get(
        `https://api.coingecko.com/api/v3/coins/${coingeckoAsset}/ohlc?vs_currency=usd&days=${days}`,
        {
          headers: { 'x-cg-pro-api-key': apiKey },
          timeout: 5000,
        }
      );

      const ohlcData = response.data;
      console.log('Fetched OHLC data from CoinGecko for', coingeckoAsset);
      if (!ohlcData || ohlcData.length === 0) {
        console.error('Empty OHLC data from CoinGecko for', coingeckoAsset);
        return res.status(200).json(mockOhlcData);
      }

      cache.put(cacheKey, ohlcData, 15 * 60 * 1000); // Cache for 5 minutes
      console.log('Fetched OHLC data for', asset);
      return res.status(200).json(ohlcData);
    } catch (error) {
      console.error('CoinGecko API error:', error.message, error.response?.data, error.stack);
      return res.status(200).json(mockOhlcData); // Fallback to mock data
    }
  } catch (error) {
    console.error('API handler error:', error.message, error.stack);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}