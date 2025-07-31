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
      10000 + Math.random() * 1000,
      10000 + Math.random() * 1100,
      10000 + Math.random() * 900,
      10000 + Math.random() * 1000,
    ]);
    console.log(`Serving fallback OHLC data for ${asset}: ${fallbackData.length} points`);
    cache.put(cacheKey, fallbackData, CACHE_DURATION);
    res.json(fallbackData);
  }
};