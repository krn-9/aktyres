// Receives a "payment received" notification from the Payment Reader app on the counter phone and
// stores amount + UPI reference, so the Day Book can show the payment as received straight away.
//
//   POST /api/incoming        Authorization: Bearer <INCOMING_KEY>
//   body (JSON): { id, app, text, postedAt }
//
// Security:
// - Refuses everything until INCOMING_KEY is set in Vercel (no open endpoint by accident), and checks it
//   in constant time. The key is sent in a header, never in the address.
// - Only the amount, UPI reference, app name and time are stored. The notification text (which can contain
//   the payer's name) is read, then thrown away.
// - Each notification has an id, so a retry from the phone never creates a second payment.
// - Optional FIREBASE_SERVICE_ACCOUNT lets this function write as the server, so the database rules can be
//   closed to everyone else (see firestore.open.rules).
import crypto from 'node:crypto';
import { parseNotification } from '../src/services/paymentParser.js';

const PROJECT = 'aktyres-billbook';
const DOCS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const MAX_AMOUNT = Number(process.env.INCOMING_MAX_AMOUNT) || 200000;   // refuse absurd amounts
const ID_OK = /^[A-Za-z0-9-]{8,64}$/;

function keyFrom(req) {
  const h = req.headers || {};
  const auth = h.authorization || h.Authorization || '';
  if (/^Bearer\s+/i.test(auth)) return auth.replace(/^Bearer\s+/i, '').trim();
  return h['x-incoming-key'] || '';
}

function sameKey(given, wanted) {
  const a = Buffer.from(String(given)), b = Buffer.from(String(wanted));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function textFrom(req) {
  const body = req.body;
  if (typeof body === 'string') return body;
  if (Buffer.isBuffer(body)) return body.toString('utf8');
  if (body && typeof body === 'object') {
    const named = body.text || body.message || body.body;
    if (named) return named;
    // A raw message sent as a plain form post arrives as the only key of the body
    const keys = Object.keys(body);
    if (keys.length === 1 && !body[keys[0]]) return keys[0];
  }
  return '';
}

// When the notification appeared on the phone. A retry hours later keeps its real time; anything that
// is not a believable recent time falls back to "now".
function postedAtFrom(req) {
  const raw = req.body && typeof req.body === 'object' ? req.body.postedAt : undefined;
  const t = typeof raw === 'number' ? raw : Date.parse(raw);
  const now = Date.now();
  return Number.isFinite(t) && t > now - 48 * 3600 * 1000 && t < now + 5 * 60 * 1000 ? new Date(t) : new Date(now);
}

let cached = { token: '', expires: 0 };
async function serverToken() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return '';
  if (cached.token && Date.now() < cached.expires - 60000) return cached.token;
  const account = JSON.parse(raw);
  const now = Math.floor(Date.now() / 1000);
  const part = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${part({ alg: 'RS256', typ: 'JWT' })}.${part({
    iss: account.client_email, scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  })}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(unsigned), account.private_key).toString('base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }),
  });
  if (!res.ok) throw new Error(`token request refused (${res.status})`);
  const json = await res.json();
  cached = { token: json.access_token, expires: Date.now() + (json.expires_in || 3600) * 1000 };
  return cached.token;
}

export default async function handler(req, res) {
  const configured = !!process.env.INCOMING_KEY;
  if (req.method === 'GET') return res.status(200).json({ ok: true, configured, writes: process.env.FIREBASE_SERVICE_ACCOUNT ? 'server' : 'open' });
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'use POST' });
  if (!configured) return res.status(503).json({ ok: false, error: 'INCOMING_KEY is not set in Vercel yet' });
  if (!sameKey(keyFrom(req), process.env.INCOMING_KEY)) return res.status(401).json({ ok: false, error: 'wrong key' });

  const parsed = parseNotification(String(textFrom(req)).slice(0, 500));
  if (parsed.ignored) return res.status(200).json({ ok: true, ignored: parsed.reason });
  if (parsed.amount > MAX_AMOUNT) return res.status(422).json({ ok: false, error: 'amount too large' });

  const given = req.body && typeof req.body === 'object' ? String(req.body.id || '') : '';
  const id = ID_OK.test(given) ? given : globalThis.crypto.randomUUID();
  const app = String((req.body && typeof req.body === 'object' && req.body.app) || (req.query || {}).app || '').slice(0, 30);
  const doc = {
    fields: {
      id: { stringValue: id },
      app: { stringValue: app },
      amount: { doubleValue: parsed.amount },
      ref: { stringValue: parsed.ref },
      receivedAt: { stringValue: postedAtFrom(req).toISOString() },
    },
  };
  try {
    const token = await serverToken();
    const r = await fetch(`${DOCS}/incomingPayments?documentId=${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(doc),
    });
    if (r.status === 409) return res.status(200).json({ ok: true, duplicate: true, id });   // already stored
    if (!r.ok) return res.status(502).json({ ok: false, error: `database refused (${r.status})` });
  } catch (e) {
    return res.status(502).json({ ok: false, error: 'could not reach the database' });
  }
  return res.status(200).json({ ok: true, id, amount: parsed.amount, ref: parsed.ref });
}
