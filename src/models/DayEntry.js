// One line in the shop's day book: work done (car wash, puncture, ...) or money paid out
export class DayEntry {
  constructor(data = {}) {
    this.id = data.id || crypto.randomUUID();
    this.date = data.date || '';              // YYYY-MM-DD (local date the entry belongs to)
    this.service = data.service || 'Other';   // Car wash, Puncture, Air, ...
    this.amount = Number(data.amount) || 0;
    this.mode = data.mode === 'online' ? 'online' : 'cash';
    this.direction = data.direction === 'out' ? 'out' : 'in';   // in = received, out = paid out
    this.note = data.note || '';
    this.createdAt = data.createdAt || new Date().toISOString();
  }
}
