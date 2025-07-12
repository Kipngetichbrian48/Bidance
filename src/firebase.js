import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyDeLWlf6VLPtJE2drbhl6VN7P7Z-TLHLgs",
  authDomain: "bidance.firebaseapp.com",
  projectId: "bidance",
  storageBucket: "bidance.firebasestorage.app",
  messagingSenderId: "453593011636",
  appId: "1:453593011636:web:d172d8a0777152323e0ee1",
  measurementId: "G-0WZJJ3SFQC"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);