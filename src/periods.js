// Day / week / month / year helpers shared by the Day Book and the Dashboard.
// Dates are "YYYY-MM-DD" keys in local time.
export const keyOf = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export const parseKey = (key) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); };

export function shiftDate(key, days) {
  const d = parseKey(key);
  return keyOf(new Date(d.getFullYear(), d.getMonth(), d.getDate() + days));
}

// First and last day (as keys) of the week (Mon-Sun) / month / year that contains `key`
export function periodRange(view, key) {
  const d = parseKey(key);
  if (view === 'week') {
    const monday = (d.getDay() + 6) % 7;
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - monday);
    return [keyOf(start), keyOf(new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6))];
  }
  if (view === 'month') return [keyOf(new Date(d.getFullYear(), d.getMonth(), 1)), keyOf(new Date(d.getFullYear(), d.getMonth() + 1, 0))];
  if (view === 'year') return [keyOf(new Date(d.getFullYear(), 0, 1)), keyOf(new Date(d.getFullYear(), 11, 31))];
  return [key, key];
}

export function shiftPeriod(view, key, dir) {
  const d = parseKey(key);
  if (view === 'week') return shiftDate(key, 7 * dir);
  if (view === 'month') return keyOf(new Date(d.getFullYear(), d.getMonth() + dir, 1));
  if (view === 'year') return keyOf(new Date(d.getFullYear() + dir, 0, 1));
  return shiftDate(key, dir);
}

export function periodLabel(view, key) {
  const [start, end] = periodRange(view, key);
  const s = parseKey(start), e = parseKey(end);
  if (view === 'day') return s.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  if (view === 'week') return `${s.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${e.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  if (view === 'month') return s.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  return String(s.getFullYear());
}
