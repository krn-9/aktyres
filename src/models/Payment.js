export class Payment {
  constructor(data = {}) {
    this.id = data.id || crypto.randomUUID();
    this.billId = data.billId || '';
    this.partyId = data.partyId || '';
    this.partyName = data.partyName || '';
    this.amount = data.amount || 0;
    this.method = data.method || 'cash'; // cash / upi / bank / cheque
    this.reference = data.reference || '';
    this.date = data.date || new Date().toISOString();
    this.notes = data.notes || '';
    this.createdAt = data.createdAt || new Date().toISOString();
  }

  static fromFirestore(doc) {
    return new Payment({ id: doc.id, ...doc.data() });
  }

  toFirestore() {
    const { id, ...data } = this;
    return data;
  }
}

export const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'bank', label: 'Bank Transfer' },
  { value: 'cheque', label: 'Cheque' },
];