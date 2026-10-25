// Text fields must always be text. Records imported from Excel can hold numbers where text belongs
// (a size saved as 17, a model saved as 175, a phone number), and a number has no toLowerCase(), so
// searching or adding such a tyre to a bill used to crash the page. Every model runs its text fields
// through this when a record is read.
export function asText(value, fallback = '') {
  if (value === null || value === undefined) return fallback;
  const s = String(value).trim();
  return s === '' ? fallback : s;
}
