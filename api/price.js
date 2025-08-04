const axios = require('axios');
const admin = require('firebase-admin');

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

// Mock price data
const mockPrices = {
  bitcoin: { usd: 60000 + Math.random() * 1000 },
  ethereum: { usd: 3000 + Math.random() * 100 },
  litecoin: { usd: 100 + Math.random() * 10 },
  ripple: { usd: 0.5 + Math.random() * 0.1 },
  cardano: { usd: 0.4 + Math.random() * 0.05 },
  solana: { usd: 150 + Math.random() * 20 },
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
      console.log('Returning mock prices:', mockPrices);
      return res.json(mockPrices);
    }

    console.log('Fetching prices from CoinGecko');
    const response = await fetchWithRetry(
      `https://api.coingecko.com/api/v3/simple/price?ids=${Object.values(assetMap).join(',')}&vs_currencies=usd`
    );
    console.log('Fetched prices:', response);
    res.json(response);
  } catch (error) {
    console.error('Error fetching prices:', error.message);
    console.warn('Falling back to mock prices');
    res.json(mockPrices);
  }
};