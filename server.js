const express = require('express');
const axios = require('axios');
const cors = require('cors');
const cache = require('memory-cache');
const WebSocket = require('ws');

// Load environment variables
require('dotenv').config();

const app = express();
const PORT = 3000;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const MAX_RETRIES = 3;
const RETRY_DELAY = 5000; // 5 seconds
const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY;
const VALID_ASSETS = ['bitcoin', 'ethereum', 'litecoin', 'ripple', 'cardano', 'solana'];
const ASSET_MAP = {
  bitcoin: 'bitcoin',
  ethereum: 'ethereum',
  litecoin: 'litecoin',
  ripple: 'xrp',
  cardano: 'ada',
  solana: 'solana',
};

if (!COINGECKO_API_KEY) {
  console.error('Error: COINGECKO_API_KEY is not set in .env');
  process.exit(1);
}

// WebSocket server for real-time order book updates
const wss = new WebSocket.Server({ port: 8080 });
const orderBook = {
  bitcoin: { bids: [], asks: [] },
  ethereum: { bids: [], asks: [] },
  litecoin: { bids: [], asks: [] },
  ripple: { bids: [], asks: [] },
  cardano: { bids: [], asks: [] },
  solana: { bids: [], asks: [] },
};

wss.on('connection', (ws) => {
  console.log('WebSocket client connected');
  ws.on('message', (message) => {
    const { asset, order } = JSON.parse(message);
    if (orderBook[asset]) {
      if (order.type === 'buy') {
        orderBook[asset].bids.push(order);
        orderBook[asset].bids.sort((a, b) => b.price - a.price); // Sort descending
      } else {
        orderBook[asset].asks.push(order);
        orderBook[asset].asks.sort((a, b) => a.price - b.price); // Sort ascending
      }
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ asset, orderBook: orderBook[asset] }));
        }
      });
    }
  });
});

app.use(cors());

const fetchWithRetry = async (url, options = {}, retries = MAX_RETRIES, delay = RETRY_DELAY) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`Fetching ${url} (attempt ${attempt}/${retries})`);
      const response = await axios.get(url, {
        ...options,
        headers: {
          ...options.headers,
          'x-cg-api-key': COINGECKO_API_KEY,
        },
        timeout: 15000,
      });
      console.log(`Fetched data from ${url}: ${JSON.stringify(response.data).slice(0, 100)}...`);
      return response.data;
    } catch (error) {
      console.error(`Fetch error for ${url} (attempt ${attempt}/${retries}):`, {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data,
      });
      if (error.response?.status === 429) {
        console.error('CoinGecko rate limit exceeded. Waiting before retry.');
      }
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, attempt - 1)));
      } else {
        throw error;
      }
    }
  }
};

app.get('/api/price', async (req, res) => {
  const cachedPrices = cache.get('prices');
  if (cachedPrices) {
    console.log('Serving prices from cache');
    return res.json(cachedPrices);
  }

  try {
    console.log('Fetching prices from CoinGecko');
    const response = await fetchWithRetry(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,litecoin,xrp,ada,solana&vs_currencies=usd'
    );
    const mappedPrices = {
      bitcoin: response.bitcoin,
      ethereum: response.ethereum,
      litecoin: response.litecoin,
      ripple: response.xrp,
      cardano: response.ada,
      solana: response.solana,
    };
    console.log('Fetched prices:', JSON.stringify(mappedPrices).slice(0, 100));
    cache.put('prices', mappedPrices, CACHE_DURATION);
    res.json(mappedPrices);
  } catch (error) {
    console.error('Price fetch error:', { message: error.message, status: error.response?.status });
    res.status(500).json({ error: 'Failed to fetch prices', details: error.message });
  }
});

app.get('/api/history/:asset/:days', async (req, res) => {
  const { asset, days } = req.params;
  if (!VALID_ASSETS.includes(asset)) {
    console.error(`Invalid asset: ${asset}`);
    return res.status(400).json({ error: `Invalid asset: ${asset}. Valid assets: ${VALID_ASSETS.join(', ')}` });
  }
  const cacheKey = `history_${asset}_${days}`;
  const cachedData = cache.get(cacheKey);
  if (cachedData) {
    console.log(`Serving ${days}-day history for ${asset} from cache: ${cachedData.prices?.length || 0} points`);
    return res.json(cachedData);
  }

  try {
    console.log(`Fetching ${days}-day history for ${asset} from CoinGecko`);
    const coingeckoAsset = ASSET_MAP[asset] || asset;
    const interval = days === '1' ? 'minute' : '';
    const url = `https://api.coingecko.com/api/v3/coins/${coingeckoAsset}/market_chart?vs_currency=usd&days=${days}${interval ? `&interval=${interval}` : ''}&precision=2`;
    const response = await fetchWithRetry(url);
    if (!response.prices || !Array.isArray(response.prices)) {
      console.error('Invalid response format:', JSON.stringify(response, null, 2));
      throw new Error('Invalid response format: prices array missing');
    }
    console.log(`Fetched history for ${asset}: ${response.prices.length} data points`);
    cache.put(cacheKey, response, CACHE_DURATION);
    res.json(response);
  } catch (error) {
    console.error(`History fetch error for ${asset}:`, { message: error.message, status: error.response?.status });
    const fallbackData = {
      prices: Array.from({ length: 168 }, (_, i) => [
        Date.now() - (168 - i) * 60 * 60 * 1000,
        10000 + Math.random() * 1000,
      ]),
      market_caps: [],
      total_volumes: [],
    };
    console.log(`Serving fallback data for ${asset}: ${fallbackData.prices.length} points`);
    cache.put(cacheKey, fallbackData, CACHE_DURATION);
    res.json(fallbackData);
  }
});

app.get('/api/ohlc/:asset/:days', async (req, res) => {
  const { asset, days } = req.params;
  if (!VALID_ASSETS.includes(asset)) {
    console.error(`Invalid asset: ${asset}`);
    return res.status(400).json({ error: `Invalid asset: ${asset}. Valid assets: ${VALID_ASSETS.join(', ')}` });
  }
  const cacheKey = `ohlc_${asset}_${days}`;
  const cachedData = cache.get(cacheKey);
  if (cachedData) {
    console.log(`Serving ${days}-day OHLC for ${asset} from cache: ${cachedData.length || 0} points`);
    return res.json(cachedData);
  }

  try {
    console.log(`Fetching ${days}-day OHLC for ${asset} from CoinGecko`);
    const coingeckoAsset = ASSET_MAP[asset] || asset;
    const url = `https://api.coingecko.com/api/v3/coins/${coingeckoAsset}/ohlc?vs_currency=usd&days=${days}&precision=2`;
    const response = await fetchWithRetry(url);
    if (!Array.isArray(response)) {
      console.error('Invalid OHLC response format:', JSON.stringify(response, null, 2));
      throw new Error('Invalid OHLC response format: array expected');
    }
    console.log(`Fetched OHLC for ${asset}: ${response.length} data points`);
    cache.put(cacheKey, response, CACHE_DURATION);
    res.json(response);
  } catch (error) {
    console.error(`OHLC fetch error for ${asset}:`, { message: error.message, status: error.response?.status });
    const fallbackData = Array.from({ length: 168 }, (_, i) => [
      Date.now() - (168 - i) * 60 * 60 * 1000,
      10000 + Math.random() * 1000, // Open
      10000 + Math.random() * 1100, // High
      10000 + Math.random() * 900,  // Low
      10000 + Math.random() * 1000, // Close
    ]);
    console.log(`Serving fallback OHLC data for ${asset}: ${fallbackData.length} points`);
    cache.put(cacheKey, fallbackData, CACHE_DURATION);
    res.json(fallbackData);
  }
});

app.get('/api/orderbook/:asset', async (req, res) => {
  const { asset } = req.params;
  if (!VALID_ASSETS.includes(asset)) {
    console.error(`Invalid asset: ${asset}`);
    return res.status(400).json({ error: `Invalid asset: ${asset}. Valid assets: ${VALID_ASSETS.join(', ')}` });
  }
  const cacheKey = `orderbook_${asset}`;
  const cachedData = cache.get(cacheKey);
  if (cachedData) {
    console.log(`Serving order book for ${asset} from cache`);
    return res.json(cachedData);
  }

  try {
    console.log(`Fetching price for ${asset} to generate mock order book`);
    const priceResponse = await fetchWithRetry(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ASSET_MAP[asset]}&vs_currencies=usd`
    );
    const currentPrice = priceResponse[ASSET_MAP[asset]].usd;
    const bids = Array.from({ length: 10 }, (_, i) => ({
      price: (currentPrice * (1 - (i + 1) * 0.005)).toFixed(2),
      amount: (Math.random() * 10 + 1).toFixed(2),
    }));
    const asks = Array.from({ length: 10 }, (_, i) => ({
      price: (currentPrice * (1 + (i + 1) * 0.005)).toFixed(2),
      amount: (Math.random() * 10 + 1).toFixed(2),
    }));
    const orderBook = { bids, asks };
    console.log(`Generated mock order book for ${asset}: ${bids.length} bids, ${asks.length} asks`);
    cache.put(cacheKey, orderBook, CACHE_DURATION);
    res.json(orderBook);
  } catch (error) {
    console.error(`Order book fetch error for ${asset}:`, { message: error.message });
    res.status(500).json({ error: 'Failed to fetch order book', details: error.message });
  }
});

app.get('/api/clear-cache', (req, res) => {
  cache.clear();
  console.log('Cache cleared');
  res.json({ message: 'Cache cleared' });
});

app.listen(PORT, () => {
  console.log(`Proxy server running on port ${PORT}`);
});