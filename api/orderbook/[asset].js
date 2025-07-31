const axios = require('axios');
const cache = require('memory-cache');

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
      });
      if (error.response?.status === 429) {
        console.error('CoinGecko rate limit exceeded. Waiting before retry.');
      }
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, delay * Math.pow(2, attempt - 1)));
      } else {
        throw error;
      }
    }
  }
};

module.exports = async (req, res) => {
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
};