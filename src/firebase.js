import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Firebase web configuration. These values identify the project; access must
// still be protected with Firebase Authentication and Firestore Security Rules.
const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyBLYiejX7qVz973Ip0gxoFckZk4d9bCbPw",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "math-battle-royal.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "math-battle-royal",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "math-battle-royal.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "715034087017",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:715034087017:web:6ba7334a5badea5b0c1cf8",
  measurementId: "G-4VZ8MQECNT",
};

export const firebaseReady = Object.values(config).every(
  (value) => value && !String(value).startsWith("YOUR_"),
);

let auth = null;
let db = null;

if (firebaseReady) {
  const app = initializeApp(config);
  auth = getAuth(app);
  db = getFirestore(app);
}

export { auth, db, signInAnonymously, onAuthStateChanged };
