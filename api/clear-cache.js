const admin = require('firebase-admin');
const cache = require('memory-cache');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
}

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
  } catch (error) {
    console.error('Invalid token:', error.message);
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }

  cache.clear();
  console.log('Cache cleared');
  res.json({ message: 'Cache cleared' });
};