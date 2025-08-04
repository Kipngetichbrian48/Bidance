const axios = require('axios');
const admin = require('firebase-admin');

// Map app asset names to CoinGecko IDs
const assetMap = {
  bitcoin: 'bitcoin',
  ethereum: 'ethereum',
  litecoin: 'lite-coin',
  ripple: 'ripple',
  cardano: 'cardano',
  solana: 'solana',
};

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
  console.log('Firebase Admin initialized successfully');
}

// Asset-specific base prices for mock data
const basePrices = {
  bitcoin: 114000,
  ethereum: 3500,
  'lite-coin': 100,
  ripple: 3,
  cardano: 0.73,
  solana: 160,
};

// Generate mock OHLC data
const generateMockOhlc = (asset, days) => {
  const entries = days <= 7 ? 42 : days <= 14 ? 84 : days <= 30 ? 180 : 360; // Adjust entries based on days
  const now = Date.now();
  const basePrice = basePrices[asset] || 100; // Fallback price
  const variationFactor = basePrice < 10 ? 0.05 : 0.02; // 5% for low-priced, 2% for others
  return Array.from({ length: entries }, (_, i) => {
    const time = now - (entries - i - 1) * 4 * 60 * 60 * 1000; // 4-hour intervals
    const variation = (Math.random() - 0.5) * basePrice * variationFactor;
    const open = parseFloat((basePrice + variation).toFixed(basePrice < 10 ? 4 : 2));
    const high = parseFloat((open * (1 + Math.random() * variationFactor)).toFixed(basePrice < 10 ? 4 : 2));
    const low = parseFloat((open * (1 - Math.random() * variationFactor)).toFixed(basePrice < 10 ? 4 : 2));
    const close = parseFloat((open + (Math.random() - 0.5) * basePrice * variationFactor * 0.5).toFixed(basePrice < 10 ? 4 : 2));
    return [time, open, high, low, close];
  });
};

const fetchWithRetry = async (url, options = {}, retries = 3, delay = 10000) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`Fetching ${url} (attempt ${attempt}/${retries})`);
      const response = await axios.get(url, {
        ...options,
        headers: {
          ...options.headers,
          'x-cg-api-key': process.env.COINGECKO_API_KEY || '',
        },
        timeout: 15000,
      });
      console.log(`Fetched data from ${url}: ${JSON.stringify(response.data).slice(0, 100)}...`);
      return response.data;
    } catch (error) {
      console.error(`Fetch error for ${url} (attempt ${attempt}/${retries}):`, {
        message: error.message,
        status: error.response?.status,
      });
      if (error.response?.status === 429 && attempt < retries) {
        console.error('CoinGecko rate limit exceeded. Waiting before retry.');
        await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, attempt - 1)));
      } else {
        throw error;
      }
    }
  }
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization');

  const { asset, days } = req.query;
  if (!asset || !days) {
    console.error('Missing asset or days in query:', { asset, days });
    return res.status(400).json({ error: 'Asset and days are required' });
  }

  const coingeckoAssetId = assetMap[asset.toLowerCase()];
  if (!coingeckoAssetId) {
    console.error(`Invalid asset: ${asset}`);
    return res.status(400).json({ error: `Invalid asset: ${asset}` });
  }

  const token = req.headers.authorization?.split('Bearer ')[1];
  if (!token) {
    console.error('No authorization token provided');
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }
  try {
    await admin.auth().verifyIdToken(token);
    console.log('Token verified successfully');
  } catch (error) {
    console.error('Invalid token:', error.message);
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }

  try {
    if (!process.env.COINGECKO_API_KEY) {
      console.warn('COINGECKO_API_KEY not set, using mock data');
      const mockData = generateMockOhlc(coingeckoAssetId, Number(days));
      console.log(`Returning mock OHLC data for ${asset}: ${mockData.length} entries`);
      return res.json(mockData);
    }

    console.log(`Fetching OHLC data for ${coingeckoAssetId} (${days} days)`);
    const response = await fetchWithRetry(
      `https://api.coingecko.com/api/v3/coins/${coingeckoAssetId}/ohlc?vs_currency=usd&days=${days}`
    );
    console.log(`Fetched OHLC data for ${coingeckoAssetId}: ${response.length} entries`);
    res.json(response);
  } catch (error) {
    console.error(`Error fetching OHLC data for ${coingeckoAssetId}:`, error.message);
    console.warn('Falling back to mock OHLC data');
    const mockData = generateMockOhlc(coingeckoAssetId, Number(days));
    console.log(`Returning mock OHLC data for ${asset}: ${mockData.length} entries`);
    res.json(mockData);
  }
};