import { isFirebaseConfigured, initFirebase, getFirestoreInstance, getAuthInstance } from './firebase';

let db = null;
let auth = null;
let syncEnabled = false;

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
  if (!auth) {
    callback(null);
    return () => {};
  }
  let unsub = null;
  // Dynamic import but handle the callback properly
  import('firebase/auth').then(({ onAuthStateChanged }) => {
    unsub = onAuthStateChanged(auth, (user) => {
      callback(user);
    });
  }).catch(e => {
    console.error('Failed to set up auth listener:', e);
    callback(null);
  });
  return () => { if (unsub) unsub(); };
}

export async function pullCollection(collectionName) {
  if (!db || !syncEnabled) return null;
  try {
    const { collection, getDocs } = await import('firebase/firestore');
    const snapshot = await getDocs(collection(db, collectionName));
    const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const storageKey = `tyre_shop_${collectionName}`;
    localStorage.setItem(storageKey, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent('dataChanged', { detail: { key: collectionName } }));
    return items;
  } catch (e) {
    console.error(`Pull ${collectionName} failed:`, e);
    return null;
  }
}

export async function pushDocument(collectionName, id, data) {
  if (!db || !syncEnabled) return;
  try {
    const { doc, setDoc } = await import('firebase/firestore');
    await setDoc(doc(db, collectionName, id), data, { merge: true });
  } catch (e) {
    console.error(`Push ${collectionName}/${id} failed:`, e);
  }
}

export async function deleteDocument(collectionName, id) {
  if (!db || !syncEnabled) return;
  try {
    const { doc, deleteDoc } = await import('firebase/firestore');
    await deleteDoc(doc(db, collectionName, id));
  } catch (e) {
    console.error(`Delete ${collectionName}/${id} failed:`, e);
  }
}

export function listenCollection(collectionName, callback) {
  if (!db || !syncEnabled) return () => {};
  let unsub = null;
  import('firebase/firestore').then(({ collection, onSnapshot }) => {
    unsub = onSnapshot(collection(db, collectionName), (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const storageKey = `tyre_shop_${collectionName}`;
      localStorage.setItem(storageKey, JSON.stringify(items));
      window.dispatchEvent(new CustomEvent('dataChanged', { detail: { key: collectionName } }));
      if (callback) callback(items);
    }, (error) => {
      console.error(`Listener ${collectionName} error:`, error);
    });
  }).catch(e => console.error(`Failed to set up listener for ${collectionName}:`, e));

  return () => { if (unsub) unsub(); };
}

export async function syncAll() {
  if (!syncEnabled) return;
  await Promise.all([
    pullCollection('tyres'),
    pullCollection('bills'),
    pullCollection('payments'),
    pullCollection('parties'),
  ]);
}

export function startRealtimeSync(callback) {
  if (!syncEnabled) return () => {};
  const unsubs = [];
  for (const coll of ['tyres', 'bills', 'payments', 'parties']) {
    const unsub = listenCollection(coll, (items) => {
      if (callback) callback(coll, items);
    });
    unsubs.push(unsub);
  }
  return () => unsubs.forEach(u => { if (u) u(); });
}