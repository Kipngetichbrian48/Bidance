const cache = require('memory-cache');

module.exports = async (req, res) => {
  cache.clear();
  console.log('Cache cleared');
  res.json({ message: 'Cache cleared' });
};