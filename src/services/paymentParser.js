// Reads the text of a PhonePe / PayZapp "payment received" notification.
// Returns { ignored: true, reason } for anything that is not money coming in
// (settlements to the bank, debits, refunds, failures), otherwise { amount, ref }.
const CREDIT = /\b(received|credited|paid you|sent you|collected)\b/i;
const NOT_A_PAYMENT = /\b(settle[a-z]*|refund[a-z]*|fail[a-z]*|declin[a-z]*|debited|withdraw[a-z]*|reversed)\b/i;
const MONEY = /(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d{1,2})?)/i;
const RUPEES = /([\d,]+(?:\.\d{1,2})?)\s*(?:rupees|rs\b)/i;
const REF = /(?:upi\s*ref(?:erence)?(?:\s*(?:no|id))?|utr|rrn|txn\s*id|transaction\s*id|ref(?:erence)?\s*(?:no|id)?)\.?\s*[:#-]?\s*([A-Z0-9]{6,})/i;

export function parseNotification(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return { ignored: true, reason: 'empty' };
  if (NOT_A_PAYMENT.test(t)) return { ignored: true, reason: 'not a payment received' };
  if (!CREDIT.test(t)) return { ignored: true, reason: 'not a credit' };
  const m = t.match(MONEY) || t.match(RUPEES);
  if (!m) return { ignored: true, reason: 'no amount found' };
  const amount = parseFloat(m[1].replace(/,/g, ''));
  if (!(amount > 0)) return { ignored: true, reason: 'no amount found' };
  const r = t.match(REF);
  return { amount, ref: r ? r[1] : '' };
}
