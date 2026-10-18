import { isFirebaseConfigured, initFirebase, getFirestoreInstance, getAuthInstance } from './firebase';
import { TyreService, BillService, PaymentService, PartyService } from './dataService';

let db = null;
let auth = null;
let syncEnabled = false;
let listeners = [];

// Collection names in Firestore
const COLLECTIONS = {
  tyres: 'tyres',
  bills: 'bills',
  payments: 'payments',
  parties: 'parties',
};

export async function initSync() {
  if (!isFirebaseConfigured()) {
    console.log('Firebase not configured. Using local storage only.');
    return false;
  }
  const result = await initFirebase();
  if (!result) return false;
  db = result.firestore;
  auth = result.auth;
  syncEnabled = true;
  console.log('Firebase sync enabled.');
  return true;
}

export function isSyncEnabled() {
  return syncEnabled;
}

// Sign in with email/password
export async function signIn(email, password) {
  if (!auth) return null;
  try {
    const { signInWithEmailAndPassword } = await import('firebase/auth');
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return cred.user;
  } catch (e) {
    console.error('Sign in failed:', e);
    throw e;
  }
}

export async function signUp(email, password) {
  if (!auth) return null;
  try {
    const { createUserWithEmailAndPassword } = await import('firebase/auth');
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    return cred.user;
  } catch (e) {
    console.error('Sign up failed:', e);
    throw e;
  }
}

export async function signOut() {
  if (!auth) return;
  const { signOut: fbSignOut } = await import('firebase/auth');
  await fbSignOut(auth);
}

export function getCurrentUser() {
  return auth ? auth.currentUser : null;
}

export function onAuthChange(callback) {
  if (!auth) return () => {};
  let unsub;
  import('firebase/auth').then(({ onAuthStateChanged }) => {
    unsub = onAuthStateChanged(auth, callback);
  });
  return () => { if (unsub) unsub(); };
}

// Sync a collection: pull from Firestore → localStorage
export async function pullCollection(collectionName, service) {
  if (!db || !syncEnabled) return;
  try {
    const { collection, getDocs } = await import('firebase/firestore');
    const snapshot = await getDocs(collection(db, collectionName));
    const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    // Save to localStorage via service
    const storageKey = `tyre_shop_${collectionName}`;
    localStorage.setItem(storageKey, JSON.stringify(items));
    return items;
  } catch (e) {
    console.error(`Pull ${collectionName} failed:`, e);
    return null;
  }
}

// Push a single document to Firestore
export async function pushDocument(collectionName, id, data) {
  if (!db || !syncEnabled) return;
  try {
    const { doc, setDoc } = await import('firebase/firestore');
    await setDoc(doc(db, collectionName, id), data, { merge: true });
  } catch (e) {
    console.error(`Push ${collectionName}/${id} failed:`, e);
  }
}

// Delete a document from Firestore
export async function deleteDocument(collectionName, id) {
  if (!db || !syncEnabled) return;
  try {
    const { doc, deleteDoc } = await import('firebase/firestore');
    await deleteDoc(doc(db, collectionName, id));
  } catch (e) {
    console.error(`Delete ${collectionName}/${id} failed:`, e);
  }
}

// Set up real-time listeners for a collection
export function listenCollection(collectionName, callback) {
  if (!db || !syncEnabled) return () => {};
  let unsub;
  import('firebase/firestore').then(({ collection, onSnapshot }) => {
    unsub = onSnapshot(collection(db, collectionName), (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const storageKey = `tyre_shop_${collectionName}`;
      localStorage.setItem(storageKey, JSON.stringify(items));
      callback(items);
    });
  });
  return () => { if (unsub) unsub(); };
}

// Sync all collections
export async function syncAll() {
  if (!syncEnabled) return;
  await Promise.all([
    pullCollection('tyres', TyreService),
    pullCollection('bills', BillService),
    pullCollection('payments', PaymentService),
    pullCollection('parties', PartyService),
  ]);
}

// Start real-time sync for all collections
export function startRealtimeSync(onUpdate) {
  if (!syncEnabled) return () => {};
  const unsubs = [];
  for (const coll of Object.keys(COLLECTIONS)) {
    const unsub = listenCollection(coll, (items) => {
      if (onUpdate) onUpdate(coll, items);
    });
    unsubs.push(unsub);
  }
  return () => unsubs.forEach(u => u());
}