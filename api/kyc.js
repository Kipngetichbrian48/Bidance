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

  const { name, idNumber, address, documentType } = req.body;
  const token = req.headers.authorization?.split('Bearer ')[1];

  if (!token) {
    console.error('No authorization token provided');
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  // Validate required fields
  if (!name || !idNumber || !address || !documentType) {
    console.error('Missing required KYC fields:', { name, idNumber, address, documentType });
    return res.status(400).json({ error: 'Missing required fields: name, idNumber, address, documentType' });
  }

  // Basic validation
  if (name.length < 2) {
    console.error('Invalid name length:', name);
    return res.status(400).json({ error: 'Name must be at least 2 characters' });
  }
  if (idNumber.length < 8) {
    console.error('Invalid ID number length:', idNumber);
    return res.status(400).json({ error: 'ID number must be at least 8 characters' });
  }
  if (address.length < 5) {
    console.error('Invalid address length:', address);
    return res.status(400).json({ error: 'Address must be at least 5 characters' });
  }
  if (!['Aadhaar', 'PAN', 'Passport', 'Driver’s License'].includes(documentType)) {
    console.error('Invalid document type:', documentType);
    return res.status(400).json({ error: 'Invalid document type' });
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    const uid = decodedToken.uid;
    console.log('Token verified successfully for user:', uid);

    // Store KYC data in Firestore
    const kycData = {
      userId: uid,
      name,
      idNumber,
      address,
      documentType,
      status: 'verified', // Mock verification
      submittedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await db.collection('kycSubmissions').doc(uid).set(kycData);

    // Set custom claim for wallet access
    await admin.auth().setCustomUserClaims(uid, { kycVerified: true });

    console.log('KYC data stored and status updated for user:', uid, kycData);
    res.status(200).json({ message: 'KYC submitted successfully', status: 'verified' });
  } catch (error) {
    console.error('Error processing KYC:', error.message);
    res.status(500).json({ error: 'Failed to process KYC', details: error.message });
  }
};