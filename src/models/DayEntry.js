import { asText } from './asText';

// One line in the shop's day book: work done (car wash, puncture, ...) or money paid out.
// `amount` is what the work costs. Money actually received (or paid) is kept as `receipts`, so an
// entry can be part-paid: the rest is "pending" until it is collected later.
export class DayEntry {
  constructor(data = {}) {
    this.id = data.id || crypto.randomUUID();
    this.date = data.date || '';              // YYYY-MM-DD (local date the work belongs to)
    this.service = asText(data.service, 'Other');   // Car wash, Puncture, Air, ...
    this.amount = Number(data.amount) || 0;
    this.direction = data.direction === 'out' ? 'out' : 'in';   // in = received, out = paid out
    this.deletedAt = data.deletedAt || '';    // set when moved to the bin (Recently deleted); '' = in use
    this.group = data.group || '';            // entries made together (a cash/online exchange) share this id
    this.subject = asText(data.subject);        // free text; the list of subjects will be added later
    this.note = asText(data.note);
    this.createdAt = data.createdAt || new Date().toISOString();
    if (Array.isArray(data.receipts)) {
      this.receipts = data.receipts.map(r => ({
        id: r.id || crypto.randomUUID(),
        date: r.date || this.date,
        amount: Number(r.amount) || 0,
        mode: r.mode === 'online' ? 'online' : 'cash',
        time: r.time || this.createdAt,
      }));
    } else {
      // Entries saved before part payments existed were received in full, in one mode
      this.receipts = data.mode
        ? [{ id: `${this.id}-r1`, date: this.date, amount: this.amount, mode: data.mode === 'online' ? 'online' : 'cash', time: this.createdAt }]
        : [];
    }
  }

  get received() {
    return this.receipts.reduce((sum, r) => sum + r.amount, 0);
  }

  get pending() {
    return Math.max(0, this.amount - this.received);
  }
}
