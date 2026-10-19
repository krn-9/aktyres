import { isFirebaseConfigured, initFirebase } from './firebase';

let db = null;
let auth = null;
let syncEnabled = false;

const COLLECTIONS = ['tyres', 'bills', 'payments', 'parties', 'dayEntries', 'days'];
const PENDING_KEY = 'tyre_shop_pending';
const SEEDED_KEY = 'tyre_shop_seeded_v1';
const FLUSH_TIMEOUT_MS = 5000;

// Set when a pull/snapshot was skipped because this device still had unsent data
let repullNeeded = false;
// Bumped on sign-out so a pull that was already in flight can't write the old user's data back
let epoch = 0;
// Why sync last failed (cleared by the next fully successful sync). Shown to the user.
let syncProblem = null;

function noteProblem(e) {
  syncProblem = (e && e.code) || 'unknown';
}

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
  let cancelled = false;
  // Dynamic import but handle the callback properly
  import('firebase/auth').then(({ onAuthStateChanged }) => {
    if (cancelled) return;
    unsub = onAuthStateChanged(auth, (user) => {
      callback(user);
    });
  }).catch(e => {
    console.error('Failed to set up auth listener:', e);
    callback(null);
  });
  return () => { cancelled = true; if (unsub) unsub(); };
}

// ============ Local data helpers ============
function readLocal(coll) {
  try {
    const items = JSON.parse(localStorage.getItem(`tyre_shop_${coll}`));
    return Array.isArray(items) ? items : [];
  } catch { return []; }
}

function hasLocalData() {
  return COLLECTIONS.some(coll => readLocal(coll).length > 0);
}

function isSeeded() {
  return !!localStorage.getItem(SEEDED_KEY);
}

// ============ Unsent-writes queue ============
// Every write is recorded here first and removed once Firestore confirms it. It lives in
// localStorage, so a bill created offline survives closing the app and is sent on the next
// start instead of being overwritten by the server copy.
function readPending() {
  try { return JSON.parse(localStorage.getItem(PENDING_KEY)) || {}; } catch { return {}; }
}

function writePending(pending) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  } catch (e) {
    console.error('Pending queue save failed:', e);
    noteProblem({ code: 'storage-full' });
  }
}

export function hasPendingWrites() {
  return Object.keys(readPending()).length > 0;
}

function enqueue(coll, id, op, data) {
  const pending = readPending();
  const v = `${Date.now()}-${Math.random()}`;
  pending[`${coll}/${id}`] = { coll, id, op, data: data || null, v };
  writePending(pending);
  return v;
}

// Only removes the entry if it hasn't been replaced by a newer write to the same document
function dequeue(coll, id, v) {
  const pending = readPending();
  const key = `${coll}/${id}`;
  if (pending[key] && pending[key].v === v) {
    delete pending[key];
    writePending(pending);
  }
}

async function sendWrite({ coll, id, op, data }) {
  const { doc, setDoc, deleteDoc } = await import('firebase/firestore');
  if (op === 'del') await deleteDoc(doc(db, coll, id));
  else await setDoc(doc(db, coll, id), data, { merge: true });
}

async function trySend(entry) {
  if (!db || !syncEnabled) return false;
  try {
    await sendWrite(entry);
    dequeue(entry.coll, entry.id, entry.v);
    if (!hasPendingWrites()) syncProblem = null; // the server just accepted a write
    return true;
  } catch (e) {
    console.error(`Push ${entry.coll}/${entry.id} failed:`, e);
    noteProblem(e);
    // A write Firestore rejects as malformed can never succeed; don't let it block syncing forever
    if (e && e.code === 'invalid-argument') dequeue(entry.coll, entry.id, entry.v);
    return false;
  }
}

async function repullIfIdle() {
  if (repullNeeded && !hasPendingWrites() && isSeeded()) {
    if (await pullAll()) {
      repullNeeded = false;
      syncProblem = null;
    }
  }
}

// Try to send everything still queued. Resolves true only if the queue is now empty.
// While offline the writes just wait, so give up after a few seconds instead of hanging.
export async function flushPending() {
  const entries = Object.values(readPending());
  if (entries.length === 0) return true;
  if (!db || !syncEnabled) return false;
  const sent = Promise.all(entries.map(trySend)).then(results => results.every(Boolean));
  sent.then(ok => ok && repullIfIdle());
  const timedOut = new Promise(resolve => setTimeout(() => resolve(false), FLUSH_TIMEOUT_MS));
  return Promise.race([sent, timedOut]);
}

// One-time per device: data saved before the queue existed may never have reached the server
// (failed pushes were only logged). Queue anything the server doesn't have, so that the first
// pull doesn't overwrite it. Nothing pulls or applies server data until this has succeeded.
// Returns true once this device's data is known to be safe on the server.
async function seedLocalOnly() {
  if (isSeeded()) return true;
  if (!hasLocalData()) {
    localStorage.setItem(SEEDED_KEY, '1');
    return true;
  }
  try {
    const { collection, getDocsFromServer } = await import('firebase/firestore');
    for (const coll of COLLECTIONS) {
      const snapshot = await getDocsFromServer(collection(db, coll));
      const remoteIds = new Set(snapshot.docs.map(d => d.id));
      for (const item of readLocal(coll)) {
        if (item && item.id && !remoteIds.has(item.id)) enqueue(coll, item.id, 'set', item);
      }
    }
    localStorage.setItem(SEEDED_KEY, '1');
    return true;
  } catch (e) {
    console.error('Checking local data against the server failed (will retry):', e);
    noteProblem(e);
    return false;
  }
}

// True only when nothing on this device is still waiting to be uploaded (used before sign-out)
export async function flushEverything() {
  if (!syncEnabled) return true;
  const seeded = await seedLocalOnly();
  if (!seeded) return false;
  return flushPending();
}

// Wipe this device's copy of the shop data (used on sign-out so the next person doesn't see it)
export function clearLocalData() {
  epoch++;
  for (const coll of COLLECTIONS) localStorage.removeItem(`tyre_shop_${coll}`);
  localStorage.removeItem(PENDING_KEY);
  repullNeeded = false;
  syncProblem = null;
  window.dispatchEvent(new CustomEvent('dataChanged', { detail: { key: 'all' } }));
}

// What the app shows in its sync banner: 'ok' | 'syncing' (data waiting to upload) | 'problem'
export function getSyncStatus() {
  if (!syncEnabled) return { state: 'ok', pending: 0, reason: null };
  const pending = Object.keys(readPending()).length;
  if (syncProblem) return { state: 'problem', pending, reason: syncProblem };
  if (pending > 0 || (!isSeeded() && hasLocalData())) return { state: 'syncing', pending, reason: null };
  return { state: 'ok', pending: 0, reason: null };
}

// ============ Pull / push ============
export async function pullCollection(collectionName) {
  if (!db || !syncEnabled) return null;
  const startedAt = epoch;
  try {
    const { collection, getDocsFromServer } = await import('firebase/firestore');
    // From the server only: an offline getDocs would hand back an empty cache and wipe local data
    const snapshot = await getDocsFromServer(collection(db, collectionName));
    if (startedAt !== epoch) return null; // signed out while this was in flight
    // Data this device hasn't uploaded yet is newer than the server copy
    if (hasPendingWrites() || !isSeeded()) { repullNeeded = true; return null; }
    const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const storageKey = `tyre_shop_${collectionName}`;
    localStorage.setItem(storageKey, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent('dataChanged', { detail: { key: collectionName } }));
    return items;
  } catch (e) {
    console.error(`Pull ${collectionName} failed:`, e);
    noteProblem(e);
    return null;
  }
}

export async function pushDocument(collectionName, id, data) {
  if (!isFirebaseConfigured()) return;
  const v = enqueue(collectionName, id, 'set', data);
  if (await trySend({ coll: collectionName, id, op: 'set', data, v })) await repullIfIdle();
}

export async function deleteDocument(collectionName, id) {
  if (!isFirebaseConfigured()) return;
  const v = enqueue(collectionName, id, 'del', null);
  if (await trySend({ coll: collectionName, id, op: 'del', data: null, v })) await repullIfIdle();
}

export function listenCollection(collectionName, callback) {
  if (!db || !syncEnabled) return () => {};
  let unsub = null;
  let cancelled = false;
  import('firebase/firestore').then(({ collection, onSnapshot }) => {
    if (cancelled) return;
    unsub = onSnapshot(collection(db, collectionName), (snapshot) => {
      // A cache-only snapshot (e.g. app opened offline) can be empty or stale, and data this
      // device hasn't uploaded isn't on the server yet. Don't overwrite local data in either case.
      if (snapshot.metadata.fromCache) return;
      if (hasPendingWrites() || !isSeeded()) { repullNeeded = true; return; }
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const storageKey = `tyre_shop_${collectionName}`;
      localStorage.setItem(storageKey, JSON.stringify(items));
      window.dispatchEvent(new CustomEvent('dataChanged', { detail: { key: collectionName } }));
      if (callback) callback(items);
    }, (error) => {
      // The listener ends after an error; the app's retry (see App.jsx) starts a fresh one
      console.error(`Listener ${collectionName} error:`, error);
      noteProblem(error);
    });
  }).catch(e => console.error(`Failed to set up listener for ${collectionName}:`, e));

  return () => { cancelled = true; if (unsub) unsub(); };
}

async function pullAll() {
  const results = await Promise.all(COLLECTIONS.map(pullCollection));
  return results.every(items => items !== null);
}

export async function syncAll() {
  if (!syncEnabled) return false;
  // Never replace local data until everything this device holds is safely on the server
  if (!(await seedLocalOnly())) {
    repullNeeded = true;
    return false;
  }
  if (!(await flushPending())) {
    repullNeeded = true;
    return false;
  }
  const ok = await pullAll();
  if (ok) syncProblem = null;
  return ok;
}

export function startRealtimeSync(callback) {
  if (!syncEnabled) return () => {};
  const unsubs = [];
  for (const coll of COLLECTIONS) {
    const unsub = listenCollection(coll, (items) => {
      if (callback) callback(coll, items);
    });
    unsubs.push(unsub);
  }
  return () => unsubs.forEach(u => { if (u) u(); });
}
