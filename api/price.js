const axios = require('axios');
const cache = require('memory-cache');

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const MAX_RETRIES = 3;
const RETRY_DELAY = 5000; // 5 seconds
const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY;

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
};