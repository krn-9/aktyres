// Receives a payment notification forwarded from the counter phone and stores it, so the Day Book
// can mark the matching online payment as received. Free: runs as a Vercel function.
//   POST https://<your-site>/api/incoming?app=phonepe&key=<secret>   body = the notification text
// If the INCOMING_KEY environment variable is set in Vercel, the key in the URL must match it.
import { parseNotification } from '../src/services/paymentParser.js';

const PROJECT = 'aktyres-billbook';

function textFrom(req) {
  const body = req.body;
  if (typeof body === 'string') return body;
  if (body && typeof body === 'object') return body.text || body.message || body.body || '';
  return (req.query && req.query.text) || '';
}

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).json({ ok: false, error: 'use POST' });
  const secret = process.env.INCOMING_KEY;
  if (secret && (req.query || {}).key !== secret) return res.status(401).json({ ok: false, error: 'wrong key' });

  const text = String(textFrom(req)).slice(0, 500);
  const parsed = parseNotification(text);
  if (parsed.ignored) return res.status(200).json({ ok: true, ignored: parsed.reason });

  const id = globalThis.crypto.randomUUID();
  const doc = {
    fields: {
      id: { stringValue: id },
      app: { stringValue: String((req.query || {}).app || '').slice(0, 30) },
      amount: { doubleValue: parsed.amount },
      ref: { stringValue: parsed.ref },
      text: { stringValue: text },
      receivedAt: { stringValue: new Date().toISOString() },
    },
  };
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/incomingPayments?documentId=${id}`;
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(doc) });
  if (!r.ok) return res.status(502).json({ ok: false, error: `database refused (${r.status})` });
  return res.status(200).json({ ok: true, amount: parsed.amount, ref: parsed.ref });
}
