// Firebase configuration
// Replace these with your actual Firebase project credentials
// Get them from: https://console.firebase.google.com → Project Settings → Web App
export const firebaseConfig = {
  apiKey: "AIzaSyCeAHVqJDeMsZ6cRtyrvbQp-1bXoIl-RCQ",
  authDomain: "aktyres-billbook.firebaseapp.com",
  projectId: "aktyres-billbook",
  storageBucket: "aktyres-billbook.firebasestorage.app",
  messagingSenderId: "20011491040",
  appId: "1:20011491040:web:0a38f3e5b3963e4bc7ba85",
  measurementId: "G-341L1PRHWV",
};

// Check if Firebase is configured
export const isFirebaseConfigured = () => {
  return firebaseConfig.apiKey !== "YOUR_API_KEY";
};

// Firebase will be initialized when configured
let firebaseApp = null;
let firestore = null;
let auth = null;

export async function initFirebase() {
  if (!isFirebaseConfigured()) {
    console.warn("Firebase not configured. Using local storage mode.");
    return null;
  }
  try {
    const { initializeApp } = await import('firebase/app');
    const { getFirestore } = await import('firebase/firestore');
    const { getAuth } = await import('firebase/auth');
    firebaseApp = initializeApp(firebaseConfig);
    firestore = getFirestore(firebaseApp);
    auth = getAuth(firebaseApp);
    return { app: firebaseApp, firestore, auth };
  } catch (e) {
    console.error("Firebase init failed:", e);
    return null;
  }
}

export function getFirestoreInstance() { return firestore; }
export function getAuthInstance() { return auth; }
export function getFirebaseApp() { return firebaseApp; }