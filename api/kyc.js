const admin = require('firebase-admin');

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

const db = admin.firestore();

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method !== 'POST') {
    console.error('Invalid method:', req.method);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = req.headers.authorization?.split('Bearer ')[1];
  if (!token) {
    console.error('No authorization token provided');
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    console.log('Token verified successfully for user:', decodedToken.uid);

    const { name, idNumber } = req.body;
    if (!name || !idNumber) {
      console.error('Missing name or idNumber in request body');
      return res.status(400).json({ error: 'Name and ID number are required' });
    }

    // Store KYC data in Firestore
    const kycData = {
      userId: decodedToken.uid,
      name,
      idNumber,
      submittedAt: admin.firestore.FieldValue.serverTimestamp(),
      status: 'pending',
    };

    await db.collection('kycSubmissions').doc(decodedToken.uid).set(kycData);
    console.log('KYC data stored for user:', decodedToken.uid);
    res.status(200).json({ message: 'KYC submitted successfully', kycData });
  } catch (error) {
    console.error('Error processing KYC:', error.message);
    res.status(500).json({ error: 'Failed to process KYC', details: error.message });
  }
};