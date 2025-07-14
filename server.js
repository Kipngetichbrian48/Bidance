// server.js
const express = require('express');
const axios = require('axios');
const app = express();

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  console.log(`Received request: ${req.method} ${req.url}`);
  next();
});

// Root route
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to the Bidance proxy server. Use /api/price or /api/markets.' });
});

// Price endpoint
app.get('/api/price', async (req, res) => {
  try {
    console.log('Fetching prices from CoinGecko...');
    const response = await axios.get(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,litecoin&vs_currencies=usd'
    );
    console.log('Price API response:', response.data);
    res.json(response.data);
  } catch (error) {
    console.error('Price fetch error:', error.message, error.response?.status);
    res.status(500).json({ error: error.message });
  }
});

// Markets endpoint
app.get('/api/markets', async (req, res) => {
  try {
    console.log('Fetching markets from CoinGecko...');
    const response = await axios.get(
      'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=3&page=1&sparkline=false&price_change_percentage=24h'
    );
    console.log('Markets API response:', response.data);
    res.json(response.data.map(coin => ({
      coin: coin.symbol.toUpperCase(),
      price_change_24h: coin.price_change_percentage_24h
    })));
  } catch (error) {
    console.error('Markets fetch error:', error.message, error.response?.status);
    res.status(500).json({ error: error.message });
  }
});

// Start server
app.listen(3000, () => console.log('Proxy server running on port 3000'));