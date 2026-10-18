export class Party {
  constructor(data = {}) {
    this.id = data.id || crypto.randomUUID();
    this.name = data.name || '';
    this.phone = data.phone || '';
    this.type = data.type || 'customer'; // customer / dealer / supplier
    this.address = data.address || '';
    this.gstin = data.gstin || '';
    this.createdAt = data.createdAt || new Date().toISOString();
  }

  static fromFirestore(doc) {
    return new Party({ id: doc.id, ...doc.data() });
  }

  toFirestore() {
    const { id, ...data } = this;
    return data;
  }

  displayName() {
    return this.name + (this.phone ? ` (${this.phone})` : '');
  }
}