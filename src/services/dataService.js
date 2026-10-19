import { Tyre } from '../models/Tyre';
import { Bill, BillItem } from '../models/Bill';
import { Payment } from '../models/Payment';
import { Party } from '../models/Party';
import { DayEntry } from '../models/DayEntry';

// Firebase sync helper (lazy loaded)
let _pushDoc = null;
let _deleteDoc = null;
async function getFirebaseSync() {
  if (!_pushDoc) {
    try {
      const mod = await import('./firebaseSync');
      _pushDoc = mod.pushDocument;
      _deleteDoc = mod.deleteDocument;
    } catch (e) {
      // Firebase not available
    }
  }
  return { push: _pushDoc, del: _deleteDoc };
}

// Local storage keys
const KEYS = {
  tyres: 'tyre_shop_tyres',
  bills: 'tyre_shop_bills',
  payments: 'tyre_shop_payments',
  parties: 'tyre_shop_parties',
  settings: 'tyre_shop_settings',
  dayEntries: 'tyre_shop_dayEntries',
  days: 'tyre_shop_days',
};

// Generic local storage helpers
function load(key) {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : [];
  } catch { return []; }
}

function save(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    // Dispatch event for reactive updates
    window.dispatchEvent(new CustomEvent('dataChanged', { detail: { key } }));
    // Push to Firebase if sync enabled (async, non-blocking)
    if (window._firebaseSync) {
      const collectionName = key.replace('tyre_shop_', '');
      // For arrays, push each item
      if (Array.isArray(data)) {
        // Handled by individual service push calls
      }
    }
  } catch (e) {
    console.error('Storage save failed:', e);
  }
}

// Helper to notify all components of data changes
export function notifyDataChange() {
  window.dispatchEvent(new CustomEvent('dataChanged', { detail: { key: 'all' } }));
}

// Numbered in sequence per day (TS-YYMMDD-001, -002, ...) so two bills never share a number
function generateBillNumber() {
  const now = new Date();
  const date = now.getFullYear().toString().slice(2) +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0');
  const prefix = `TS-${date}-`;
  const used = load(KEYS.bills)
    .map(b => String(b.billNumber || ''))
    .filter(n => n.startsWith(prefix))
    .map(n => parseInt(n.slice(prefix.length), 10) || 0);
  const seq = (used.length ? Math.max(...used) : 0) + 1;
  return prefix + String(seq).padStart(3, '0');
}

// ============ Tyre Service ============
export const TyreService = {
  getAll() {
    return load(KEYS.tyres).map(d => new Tyre(d));
  },

  getById(id) {
    return this.getAll().find(t => t.id === id) || null;
  },

  save(tyre) {
    const tyres = load(KEYS.tyres);
    const idx = tyres.findIndex(t => t.id === tyre.id);
    tyre.updatedAt = new Date().toISOString();
    if (idx >= 0) {
      tyres[idx] = { ...tyre };
    } else {
      tyres.push({ ...tyre });
    }
    save(KEYS.tyres, tyres);
    // Push to Firebase
    getFirebaseSync().then(({ push }) => {
      if (push) push('tyres', tyre.id, { ...tyre });
    });
    return tyre;
  },

  delete(id) {
    const tyres = load(KEYS.tyres).filter(t => t.id !== id);
    save(KEYS.tyres, tyres);
    // Delete from Firebase
    getFirebaseSync().then(({ del }) => {
      if (del) del('tyres', id);
    });
  },

  // The +/- buttons never go below 0. Bills pass allowNegative so that editing or deleting a bill
  // is the exact inverse of saving it, even if the shop sold more than it had on record.
  updateStock(id, delta, allowNegative = false) {
    const tyre = this.getById(id);
    if (!tyre) return null;
    const next = tyre.quantity + delta;
    tyre.quantity = allowNegative ? next : Math.max(0, next);
    return this.save(tyre);
  },

  // Find a tyre by brand + size (+ model when given). If there isn't one, create and save it
  // (stock 0) so a bill item always points at a real inventory record. Pass create=false to get
  // an unsaved tyre instead (used for estimates, which shouldn't add to inventory).
  findOrCreate({ brand = '', model = '', size = '', type = 'tubeless', costPrice = 0, sellingPrice = 0 }, create = true) {
    const norm = s => (s || '').trim().toLowerCase();
    const found = this.getAll().find(t =>
      norm(t.brand) === norm(brand) &&
      norm(t.size) === norm(size) &&
      (!model || norm(t.model) === norm(model))
    );
    if (found) return found;
    const tyre = new Tyre({ brand, model, size, type, costPrice, sellingPrice });
    return create ? this.save(tyre) : tyre;
  },

  search(query) {
    const q = query.toLowerCase();
    return this.getAll().filter(t =>
      t.brand.toLowerCase().includes(q) ||
      t.model.toLowerCase().includes(q) ||
      t.size.toLowerCase().includes(q) ||
      t.type.toLowerCase().includes(q)
    );
  },

  getLowStock() {
    return this.getAll().filter(t => t.isLowStock);
  },

  getTotalStockValue() {
    return this.getAll().reduce((sum, t) => sum + t.stockValue, 0);
  },
};

// ============ Party Service ============
export const PartyService = {
  getAll() {
    return load(KEYS.parties).map(d => new Party(d));
  },

  getById(id) {
    return this.getAll().find(p => p.id === id) || null;
  },

  save(party) {
    const parties = load(KEYS.parties);
    const idx = parties.findIndex(p => p.id === party.id);
    if (idx >= 0) {
      parties[idx] = { ...party };
    } else {
      parties.push({ ...party });
    }
    save(KEYS.parties, parties);
    // Push to Firebase
    getFirebaseSync().then(({ push }) => {
      if (push) push('parties', party.id, { ...party });
    });
    return party;
  },

  delete(id) {
    const parties = load(KEYS.parties).filter(p => p.id !== id);
    save(KEYS.parties, parties);
    // Delete from Firebase
    getFirebaseSync().then(({ del }) => {
      if (del) del('parties', id);
    });
  },

  search(query) {
    const q = query.toLowerCase();
    return this.getAll().filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.phone.includes(q)
    );
  },

  getByType(type) {
    return this.getAll().filter(p => p.type === type);
  },
};

// OCR can misread a header row or a table as an item. Only lines that look like a real tyre line
// add tyres to inventory automatically; the rest still go on the bill but don't touch stock.
function looksLikeRealItem(item) {
  const brand = (item.brand || '').trim();
  return /^[A-Za-z][A-Za-z0-9 \-]{0,29}$/.test(brand) &&
    brand.toLowerCase() !== 'unknown' &&
    Number.isInteger(item.quantity) && item.quantity >= 1 && item.quantity <= 500 &&
    item.rate > 0;
}

// ============ Bill Service ============
export const BillService = {
  getAll() {
    return load(KEYS.bills).map(d => new Bill(d));
  },

  getById(id) {
    return this.getAll().find(b => b.id === id) || null;
  },

  save(bill) {
    bill.updatedAt = new Date().toISOString();
    if (!bill.billNumber) {
      bill.billNumber = generateBillNumber();
    }
    bill.recalculate();
    const bills = load(KEYS.bills);
    const idx = bills.findIndex(b => b.id === bill.id);
    const data = bill.toFirestore();
    data.id = bill.id;
    if (idx >= 0) {
      bills[idx] = data;
    } else {
      bills.push(data);
    }
    save(KEYS.bills, bills);
    // Push to Firebase
    getFirebaseSync().then(({ push }) => {
      if (push) push('bills', bill.id, data);
    });
    return bill;
  },

  delete(id) {
    PaymentService.getByBill(id).forEach(p => PaymentService.delete(p.id));
    const bills = load(KEYS.bills).filter(b => b.id !== id);
    save(KEYS.bills, bills);
    // Delete from Firebase
    getFirebaseSync().then(({ del }) => {
      if (del) del('bills', id);
    });
  },

  getByType(type) {
    return this.getAll().filter(b => b.type === type);
  },

  getUnpaid() {
    return this.getAll().filter(b => b.isFinal && b.status !== 'paid');
  },

  getPaid() {
    return this.getAll().filter(b => b.status === 'paid');
  },

  getRecent(limit = 10) {
    return this.getAll()
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, limit);
  },

  // Create bill from scanned OCR data
  createFromScan(scanData) {
    const bill = new Bill({
      type: scanData.type || 'purchase',
      partyName: scanData.partyName || '',
      partyPhone: scanData.partyPhone || '',
      invoiceNo: scanData.invoiceNo || '',
      date: scanData.date || new Date().toISOString(),
    });
    if (scanData.items) {
      for (const item of scanData.items) {
        // Tyres not in inventory yet are saved here, so applyToInventory can update their stock
        const tyre = TyreService.findOrCreate({
          brand: item.brand,
          size: item.size,
          type: item.type,
          costPrice: bill.type === 'purchase' ? item.rate : 0,
          sellingPrice: bill.type === 'purchase' ? 0 : item.rate,
        }, bill.isFinal && looksLikeRealItem(item));
        bill.addItem(tyre, item.quantity, item.rate);
      }
    }
    bill.recalculate();
    return bill;
  },

  // Save a NEW bill: store it, move stock, and (if payMode is given) record it as paid in full
  // with that payment method ('cash' | 'upi' | 'bank' | 'cheque'). Paid bills show in the day book.
  finalize(bill, payMode) {
    const saved = this.save(bill);
    this.applyToInventory(saved);
    if (payMode && saved.isFinal && saved.total > 0) {
      PaymentService.recordPayment(saved.id, saved.total, payMode, '', 'Paid when billed');
    }
    return this.getById(saved.id) || saved;
  },

  // Apply bill to inventory (only sale/purchase bills move stock, not estimates/formulas)
  applyToInventory(bill) {
    if (!bill.isFinal) return;
    for (const item of bill.items) {
      if (item.tyreId) {
        const delta = bill.type === 'purchase' ? item.quantity : -item.quantity;
        TyreService.updateStock(item.tyreId, delta, true);
      }
    }
  },

  // Undo applyToInventory (when a bill is edited or deleted)
  revertFromInventory(bill) {
    if (!bill.isFinal) return;
    for (const item of bill.items) {
      if (item.tyreId) {
        const delta = bill.type === 'purchase' ? -item.quantity : item.quantity;
        TyreService.updateStock(item.tyreId, delta, true);
      }
    }
  },
};

// ============ Payment Service ============
export const PaymentService = {
  getAll() {
    return load(KEYS.payments).map(d => new Payment(d));
  },

  getById(id) {
    return this.getAll().find(p => p.id === id) || null;
  },

  save(payment) {
    const payments = load(KEYS.payments);
    const idx = payments.findIndex(p => p.id === payment.id);
    if (idx >= 0) {
      payments[idx] = { ...payment };
    } else {
      payments.push({ ...payment });
    }
    save(KEYS.payments, payments);
    // Push to Firebase
    getFirebaseSync().then(({ push }) => {
      if (push) push('payments', payment.id, { ...payment });
    });
    return payment;
  },

  delete(id) {
    const payments = load(KEYS.payments).filter(p => p.id !== id);
    save(KEYS.payments, payments);
    // Delete from Firebase
    getFirebaseSync().then(({ del }) => {
      if (del) del('payments', id);
    });
  },

  getByBill(billId) {
    return this.getAll().filter(p => p.billId === billId);
  },

  getByParty(partyId) {
    return this.getAll().filter(p => p.partyId === partyId);
  },

  getTotalPaidForBill(billId) {
    return this.getByBill(billId).reduce((sum, p) => sum + p.amount, 0);
  },

  // Record payment and update bill status
  recordPayment(billId, amount, method, reference, notes) {
    const bill = BillService.getById(billId);
    if (!bill) return null;

    const payment = new Payment({
      billId,
      partyId: bill.partyId,
      partyName: bill.partyName,
      amount,
      method,
      reference,
      notes,
    });
    this.save(payment);

    // Update bill paid amount
    bill.paid = (bill.paid || 0) + amount;
    bill.recalculate();
    BillService.save(bill);

    return payment;
  },
};

// ============ Settings ============
export const SettingsService = {
  get() {
    try {
      const data = localStorage.getItem(KEYS.settings);
      return data ? JSON.parse(data) : { shopName: 'My Tyre Shop', currency: '₹', lowStockThreshold: 2 };
    } catch { return { shopName: 'My Tyre Shop', currency: '₹', lowStockThreshold: 2 }; }
  },

  save(settings) {
    localStorage.setItem(KEYS.settings, JSON.stringify(settings));
  },
};

// ============ OCR Parser ============
// JS reads "12/10/2024" month-first and rejects "25/12/2024", so build the date by hand.
// Returns an ISO string, or '' if the text isn't a real date.
function parseBillDate(str) {
  const m = str.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2}|\d{4})$/);
  if (!m) return '';
  const day = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  let year = parseInt(m[3], 10);
  if (year < 100) year += 2000;
  const d = new Date(year, month - 1, day, 12);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return '';
  return d.toISOString();
}

export const BillParser = {
  // Parse OCR text from a dealer bill
  parseDealerBill(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const result = { partyName: '', items: [], date: '', total: 0, invoiceNo: '', tyreTags: [] };

    // Try to find invoice number
    const invoiceMatch = text.match(/(?:invoice|inv|bill|receipt|challan|no\.?|#)\s*[:#]?\s*([A-Z0-9\-\/]+)/i);
    if (invoiceMatch) result.invoiceNo = invoiceMatch[1].trim();

    // Try to find party name (usually first non-empty line or after "To:"/"From:")
    for (const line of lines) {
      if (/^(to|from|supplier|dealer|party|customer|name|sold to|billed to)/i.test(line)) {
        result.partyName = line.replace(/^(to|from|supplier|dealer|party|customer|name|sold to|billed to)[:\s]*/i, '').trim();
        break;
      }
    }
    if (!result.partyName && lines.length > 0) {
      result.partyName = lines[0];
    }

    // Try to find date (bills are day-first: 25/12/2024)
    const dateRegex = /(?:^|[^\d])(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2}(?:\d{2})?)(?!\d)/g;
    let dateMatch;
    while ((dateMatch = dateRegex.exec(text)) !== null) {
      const parsed = parseBillDate(dateMatch[1]);
      if (parsed) { result.date = parsed; break; }
    }

    // Try to find total
    const totalMatch = text.match(/total[:\s]*(?:rs\.?|₹|inr)?\s*([\d,]+(?:\.\d{2})?)/i);
    if (totalMatch) result.total = parseFloat(totalMatch[1].replace(/,/g, ''));

    // Parse line items: look for patterns like "Brand Size x Qty @ Rate = Amount"
    // Common patterns:
    //   MRF 195/65R15 4 4500 18000
    //   MRF 195/65R15 x4 @4500 = 18000
    //   2 MRF 195/65R15 @ 4500
    const sizePattern = /(\d{3}\/\d{2}R\d{2}|\d{2,3}\/\d{2}-\d{2}|\d\.\d{2}-\d{2})/i;
    const itemRegex = /([A-Za-z][A-Za-z0-9 \t\-]*?)[ \t]*(\d{3}\/\d{2}R\d{2}|\d{2,3}\/\d{2}-\d{2}|\d\.\d{2}-\d{2})\s*[xX×]?\s*(\d+(?:\.\d+)?)\s*[@at]*\s*([\d,]+(?:\.\d{2})?)/gi;

    let match;
    while ((match = itemRegex.exec(text)) !== null) {
      const brand = match[1].trim();
      const size = match[2].trim().toUpperCase();
      const qty = parseFloat(match[3]);
      const rate = parseFloat(match[4].replace(/,/g, ''));
      result.items.push({
        brand,
        size,
        type: 'tubeless',
        quantity: qty,
        rate,
        amount: qty * rate,
      });
    }

    // Fallback: if no items parsed, try simpler line-by-line
    if (result.items.length === 0) {
      for (const line of lines) {
        const sizeMatch = line.match(sizePattern);
        if (sizeMatch) {
          // Quantity and rate come from the rest of the line: the size's own digits don't count
          const rest = line.replace(sizeMatch[0], ' ');
          const nums = rest.match(/\d[\d,]*(?:\.\d{1,2})?/g);
          if (nums && nums.length >= 2) {
            result.items.push({
              brand: rest.replace(/[^A-Za-z\s\-]/g, ' ').replace(/\s+/g, ' ').trim() || 'Unknown',
              size: sizeMatch[0].toUpperCase(),
              type: 'tubeless',
              quantity: parseFloat(nums[0].replace(/,/g, '')) || 1,
              rate: parseFloat(nums[1].replace(/,/g, '')) || 0,
              amount: 0,
            });
          }
        }
      }
      result.items.forEach(i => { i.amount = i.quantity * i.rate; });
    }

    return result;
  },

  // Parse OCR text from a tyre label photo
  parseTyreLabel(text) {
    const result = { brand: '', size: '', type: 'tubeless' };
    // Common tyre brands
    const brands = ['MRF', 'CEAT', 'JK', 'Apollo', 'Bridgestone', 'Michelin', 'Goodyear', 
      'Continental', 'Pirelli', 'Dunlop', 'Yokohama', 'Hankook', 'Maxxis', 'TVS', 
      'BKT', 'Goodride', 'Linglong', 'Triangle', 'Double Coin', 'Roadstone'];
    for (const brand of brands) {
      if (text.toUpperCase().includes(brand.toUpperCase())) {
        result.brand = brand;
        break;
      }
    }
    // Size pattern: 195/65R15, 3.00-18, 90/90-12, etc.
    const sizeMatch = text.match(/(\d{3}\/\d{2}R\d{2}|\d{2,3}\/\d{2}-\d{2}|\d\.\d{2}-\d{2}|\d{3}\/\d{2}ZR\d{2})/i);
    if (sizeMatch) result.size = sizeMatch[0].toUpperCase();
    // Type detection
    if (/tubeless/i.test(text)) result.type = 'tubeless';
    else if (/tube[\s-]?type/i.test(text)) result.type = 'tube-type';
    else if (/radial/i.test(text)) result.type = 'radial';
    return result;
  },

  // Parse a customer bill (sales invoice)
  parseCustomerBill(text) {
    return this.parseDealerBill(text); // same format, different type
  },
};
// ============ Day Book ============
// The shop's daily book: hand-entered work (car wash, puncture, ...) plus every payment made on a bill,
// split into cash and online. Cash left in the counter at the end of a day (after taking cash home)
// is the next day's starting cash.
function dateKey(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

export const DayBookService = {
  dateKey,
  today() { return dateKey(new Date()); },

  getEntries() {
    return load(KEYS.dayEntries).map(d => new DayEntry(d));
  },

  addEntry(data) {
    const entry = new DayEntry(data);
    const all = load(KEYS.dayEntries);
    all.push({ ...entry });
    save(KEYS.dayEntries, all);
    getFirebaseSync().then(({ push }) => { if (push) push('dayEntries', entry.id, { ...entry }); });
    return entry;
  },

  deleteEntry(id) {
    save(KEYS.dayEntries, load(KEYS.dayEntries).filter(e => e.id !== id));
    getFirebaseSync().then(({ del }) => { if (del) del('dayEntries', id); });
  },

  // Per-day settings: cash taken home, and an optional hand-set starting cash
  getDay(date) {
    const found = load(KEYS.days).find(d => d.id === date) || {};
    return { id: date, takenHome: 0, openingOverride: null, ...found };
  },

  saveDay(day) {
    const days = load(KEYS.days);
    const idx = days.findIndex(d => d.id === day.id);
    if (idx >= 0) days[idx] = { ...day }; else days.push({ ...day });
    save(KEYS.days, days);
    getFirebaseSync().then(({ push }) => { if (push) push('days', day.id, { ...day }); });
    return day;
  },

  // Every rupee that moved: day-book entries + bill payments (sale payments come in,
  // purchase payments go out). Online = anything that is not cash (UPI, bank, cheque).
  allTransactions() {
    const out = this.getEntries().map(e => ({
      id: e.id, date: e.date, time: e.createdAt, label: e.service, note: e.note,
      amount: e.amount, mode: e.mode, direction: e.direction, source: 'manual',
    }));
    const bills = new Map(BillService.getAll().map(b => [b.id, b]));
    for (const p of PaymentService.getAll()) {
      const bill = bills.get(p.billId);
      out.push({
        id: p.id, date: dateKey(p.date), time: p.date,
        label: bill ? `${bill.type === 'purchase' ? 'Purchase' : 'Tyre sale'} ${bill.billNumber}` : 'Bill payment',
        note: bill ? (bill.partyName || 'Walk-in') : (p.partyName || ''),
        amount: p.amount, mode: p.method === 'cash' ? 'cash' : 'online',
        direction: bill && bill.type === 'purchase' ? 'out' : 'in',
        source: 'bill', billId: p.billId,
      });
    }
    return out;
  },

  getTransactions(date) {
    return this.allTransactions()
      .filter(t => t.date === date)
      .sort((a, b) => new Date(a.time) - new Date(b.time));
  },

  // Walk every active day in order so each day's starting cash is the previous day's leftover
  getSummary(date) {
    const byDate = new Map();
    for (const t of this.allTransactions()) {
      if (!byDate.has(t.date)) byDate.set(t.date, []);
      byDate.get(t.date).push(t);
    }
    const days = new Map(load(KEYS.days).map(d => [d.id, d]));
    const dates = [...new Set([...byDate.keys(), ...days.keys(), date])].sort();
    let carry = 0;
    for (const d of dates) {
      const day = days.get(d) || {};
      const manual = day.openingOverride !== undefined && day.openingOverride !== null;
      const opening = manual ? Number(day.openingOverride) : carry;
      let cashIn = 0, cashOut = 0, onlineIn = 0, onlineOut = 0;
      for (const t of byDate.get(d) || []) {
        if (t.mode === 'cash') { if (t.direction === 'out') cashOut += t.amount; else cashIn += t.amount; }
        else if (t.direction === 'out') onlineOut += t.amount; else onlineIn += t.amount;
      }
      const takenHome = Number(day.takenHome) || 0;
      const counter = opening + cashIn - cashOut - takenHome;
      if (d === date) {
        return { date: d, opening, openingIsManual: manual, cashIn, cashOut, onlineIn, onlineOut, takenHome,
          cashNet: cashIn - cashOut, onlineNet: onlineIn - onlineOut, counter };
      }
      carry = counter;
    }
  },
};
