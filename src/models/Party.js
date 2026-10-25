import { asText } from './asText';

export class Party {
  constructor(data = {}) {
    this.id = data.id || crypto.randomUUID();
    this.name = asText(data.name);
    this.phone = asText(data.phone);
    this.type = asText(data.type, 'customer'); // customer / dealer / supplier
    this.address = asText(data.address);
    this.gstin = asText(data.gstin);
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