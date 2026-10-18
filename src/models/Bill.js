export class BillItem {
  constructor(data = {}) {
    this.id = data.id || crypto.randomUUID();
    this.tyreId = data.tyreId || '';
    this.tyreName = data.tyreName || '';
    this.brand = data.brand || '';
    this.size = data.size || '';
    this.type = data.type || '';
    this.quantity = data.quantity || 1;
    this.rate = data.rate || 0;
    this.amount = data.amount || 0; // quantity * rate
  }

  get total() {
    return this.quantity * this.rate;
  }
}

export class Bill {
  constructor(data = {}) {
    this.id = data.id || crypto.randomUUID();
    this.billNumber = data.billNumber || '';
    this.invoiceNo = data.invoiceNo || '';
    this.type = data.type || 'sale'; // sale / purchase / formula / estimate
    this.partyId = data.partyId || '';
    this.partyName = data.partyName || '';
    this.partyPhone = data.partyPhone || '';
    this.items = (data.items || []).map(i => new BillItem(i));
    this.subtotal = data.subtotal || 0;
    this.tax = data.tax || 0;
    this.total = data.total || 0;
    this.paid = data.paid || 0;
    this.balance = data.balance || 0;
    this.status = data.status || 'unpaid'; // unpaid / partial / paid
    this.notes = data.notes || '';
    this.date = data.date || new Date().toISOString();
    this.createdAt = data.createdAt || new Date().toISOString();
    this.updatedAt = data.updatedAt || new Date().toISOString();
  }

  static fromFirestore(doc) {
    const data = doc.data();
    return new Bill({ id: doc.id, ...data, items: data.items || [] });
  }

  toFirestore() {
    const { id, ...data } = this;
    return {
      ...data,
      items: this.items.map(i => ({ ...i })),
      updatedAt: new Date().toISOString(),
    };
  }

  recalculate() {
    this.subtotal = this.items.reduce((sum, item) => sum + item.total, 0);
    this.total = this.subtotal + (this.tax || 0);
    this.balance = this.total - (this.paid || 0);
    if (this.balance <= 0 && this.total > 0) {
      this.status = 'paid';
    } else if (this.paid > 0) {
      this.status = 'partial';
    } else {
      this.status = 'unpaid';
    }
  }

  // Only sale and purchase bills move stock and take payments; estimates and formulas don't
  get isFinal() {
    return this.type === 'sale' || this.type === 'purchase';
  }

  get typeLabel() {
    const labels = { sale: 'Sales Bill', purchase: 'Purchase Bill', formula: 'Formula', estimate: 'Estimate' };
    return labels[this.type] || 'Bill';
  }

  addItem(tyre, quantity, rate) {
    const item = new BillItem({
      tyreId: tyre.id,
      tyreName: tyre.displayName(),
      brand: tyre.brand,
      size: tyre.size,
      type: tyre.type,
      quantity,
      rate: rate || tyre.sellingPrice,
    });
    item.amount = item.total;
    this.items.push(item);
    this.recalculate();
  }

  removeItem(index) {
    this.items.splice(index, 1);
    this.recalculate();
  }
}

export const BILL_TYPES = [
  { value: 'sale', label: 'Sales Bill' },
  { value: 'purchase', label: 'Purchase Bill' },
  { value: 'formula', label: 'Formula' },
  { value: 'estimate', label: 'Estimate' },
];