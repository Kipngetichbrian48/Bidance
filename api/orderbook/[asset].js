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

// Mock order book data for testing
const generateMockOrderBook = (basePrice) => {
  const bids = Array.from({ length: 10 }, (_, i) => [
    Number((basePrice * (1 - (i + 1) / 1000)).toFixed(8)),
    Math.random() * 10,
  ]).sort((a, b) => a[0] - b[0]); // Ascending
  const asks = Array.from({ length: 10 }, (_, i) => [
    Number((basePrice * (1 + (i + 1) / 1000)).toFixed(8)),
    Math.random() * 10,
  ]).sort((a, b) => b[0] - a[0]); // Descending
  return { bids, asks };
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

  const { asset } = req.query;
  if (!asset) {
    console.error('No asset provided in query');
    return res.status(400).json({ error: 'Asset is required' });
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
      const mockData = generateMockOrderBook(60000);
      console.log(`Returning mock order book for ${asset}:`, mockData);
      return res.json(mockData);
    }

    console.log(`Fetching price for ${coingeckoAssetId} to generate mock order book`);
    const priceData = await fetchWithRetry(
      `https://api.coingecko.com/api/v3/simple/price?ids=${coingeckoAssetId}&vs_currencies=usd`
    );
    const price = priceData[coingeckoAssetId]?.usd;
    if (!price) {
      console.error(`No price data for ${coingeckoAssetId}`);
      return res.status(500).json({ error: `No price data for ${coingeckoAssetId}` });
    }

    const orderBook = generateMockOrderBook(price);
    console.log(`Generated mock order book for ${coingeckoAssetId}: ${orderBook.bids.length} bids, ${orderBook.asks.length} asks`);
    res.json(orderBook);
  } catch (error) {
    console.error('Error generating order book:', error.message);
    console.warn('Falling back to mock order book');
    const mockData = generateMockOrderBook(60000);
    res.json(mockData);
  }
};