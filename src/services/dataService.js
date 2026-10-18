import { Tyre } from '../models/Tyre';
import { Bill, BillItem } from '../models/Bill';
import { Payment } from '../models/Payment';
import { Party } from '../models/Party';

// Local storage keys
const KEYS = {
  tyres: 'tyre_shop_tyres',
  bills: 'tyre_shop_bills',
  payments: 'tyre_shop_payments',
  parties: 'tyre_shop_parties',
  settings: 'tyre_shop_settings',
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
  } catch (e) {
    console.error('Storage save failed:', e);
  }
}

function generateBillNumber() {
  const now = new Date();
  const prefix = 'TS';
  const date = now.getFullYear().toString().slice(2) + 
    String(now.getMonth() + 1).padStart(2, '0') + 
    String(now.getDate()).padStart(2, '0');
  const seq = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
  return `${prefix}-${date}-${seq}`;
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
    return tyre;
  },

  delete(id) {
    const tyres = load(KEYS.tyres).filter(t => t.id !== id);
    save(KEYS.tyres, tyres);
  },

  updateStock(id, delta) {
    const tyre = this.getById(id);
    if (!tyre) return null;
    tyre.quantity = Math.max(0, tyre.quantity + delta);
    return this.save(tyre);
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
    return party;
  },

  delete(id) {
    const parties = load(KEYS.parties).filter(p => p.id !== id);
    save(KEYS.parties, parties);
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
    if (idx >= 0) {
      bills[idx] = bill.toFirestore();
      bills[idx].id = bill.id;
    } else {
      const data = bill.toFirestore();
      data.id = bill.id;
      bills.push(data);
    }
    save(KEYS.bills, bills);
    return bill;
  },

  delete(id) {
    const bills = load(KEYS.bills).filter(b => b.id !== id);
    save(KEYS.bills, bills);
  },

  getByType(type) {
    return this.getAll().filter(b => b.type === type);
  },

  getUnpaid() {
    return this.getAll().filter(b => b.status !== 'paid');
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
      date: scanData.date || new Date().toISOString(),
    });
    if (scanData.items) {
      for (const item of scanData.items) {
        const tyre = TyreService.getAll().find(t =>
          t.brand.toLowerCase() === (item.brand || '').toLowerCase() &&
          t.size === item.size
        );
        bill.addItem(
          tyre || new Tyre({ brand: item.brand, size: item.size, type: item.type }),
          item.quantity,
          item.rate
        );
      }
    }
    bill.recalculate();
    return bill;
  },

  // Apply bill to inventory
  applyToInventory(bill) {
    for (const item of bill.items) {
      if (item.tyreId) {
        const delta = bill.type === 'purchase' ? item.quantity : -item.quantity;
        TyreService.updateStock(item.tyreId, delta);
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
    return payment;
  },

  delete(id) {
    const payments = load(KEYS.payments).filter(p => p.id !== id);
    save(KEYS.payments, payments);
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
export const BillParser = {
  // Parse OCR text from a dealer bill
  parseDealerBill(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const result = { partyName: '', items: [], date: '', total: 0 };

    // Try to find party name (usually first non-empty line or after "To:"/"From:")
    for (const line of lines) {
      if (/^(to|from|supplier|dealer|party|customer|name)/i.test(line)) {
        result.partyName = line.replace(/^(to|from|supplier|dealer|party|customer|name)[:\s]*/i, '').trim();
        break;
      }
    }
    if (!result.partyName && lines.length > 0) {
      result.partyName = lines[0];
    }

    // Try to find date
    const dateMatch = text.match(/(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/);
    if (dateMatch) result.date = dateMatch[1];

    // Try to find total
    const totalMatch = text.match(/total[:\s]*(?:rs\.?|₹|inr)?\s*([\d,]+(?:\.\d{2})?)/i);
    if (totalMatch) result.total = parseFloat(totalMatch[1].replace(/,/g, ''));

    // Parse line items: look for patterns like "Brand Size x Qty @ Rate = Amount"
    // Common patterns:
    //   MRF 195/65R15 4 4500 18000
    //   MRF 195/65R15 x4 @4500 = 18000
    //   2 MRF 195/65R15 @ 4500
    const sizePattern = /(\d{3}\/\d{2}R\d{2}|\d{2,3}\/\d{2}-\d{2}|\d\.\d{2}-\d{2})/i;
    const itemRegex = /([A-Za-z][A-Za-z0-9\s\-]*?)\s*(\d{3}\/\d{2}R\d{2}|\d{2,3}\/\d{2}-\d{2}|\d\.\d{2}-\d{2})\s*[xX×]?\s*(\d+(?:\.\d+)?)\s*[@at]*\s*([\d,]+(?:\.\d{2})?)/gi;

    let match;
    while ((match = itemRegex.exec(text)) !== null) {
      const brand = match[1].trim();
      const size = match[2].trim();
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
          const nums = line.match(/[\d,]+(?:\.\d{2})?/g);
          if (nums && nums.length >= 2) {
            result.items.push({
              brand: line.replace(sizeMatch[0], '').replace(/[\d,\.]+/g, '').trim() || 'Unknown',
              size: sizeMatch[0],
              type: 'tubeless',
              quantity: parseFloat(nums[0]) || 1,
              rate: parseFloat((nums[1] || '0').replace(/,/g, '')),
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