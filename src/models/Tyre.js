// Tyre data model
import { asText } from './asText';

export class Tyre {
  constructor(data = {}) {
    this.id = data.id || crypto.randomUUID();
    this.brand = asText(data.brand);
    this.model = asText(data.model);
    this.size = asText(data.size);        // e.g. "195/65R15"
    this.type = asText(data.type, 'tubeless'); // tubeless / tube-type
    this.costPrice = data.costPrice || 0;
    this.sellingPrice = data.sellingPrice || 0;
    this.quantity = data.quantity || 0;
    this.minStock = data.minStock || 2;
    this.createdAt = data.createdAt || new Date().toISOString();
    this.updatedAt = data.updatedAt || new Date().toISOString();
  }

  static fromFirestore(doc) {
    return new Tyre({ id: doc.id, ...doc.data() });
  }

  toFirestore() {
    const { id, ...data } = this;
    return { ...data, updatedAt: new Date().toISOString() };
  }

  get isLowStock() {
    return this.quantity <= this.minStock;
  }

  get stockValue() {
    return this.quantity * this.costPrice;
  }

  get potentialRevenue() {
    return this.quantity * this.sellingPrice;
  }

  displayName() {
    return `${this.brand} ${this.model} ${this.size} (${this.type})`.trim();
  }
}

export const TYRE_TYPES = ['tubeless', 'tube-type', 'radial', 'bias-ply'];
export const COMMON_SIZES = [
  '145/80R12', '155/65R13', '165/65R13', '175/65R14', '185/65R14',
  '195/65R15', '205/55R16', '205/60R16', '215/60R16', '225/60R16',
  '225/65R17', '235/60R18', '265/65R17', '275/55R20',
  '3.00-18', '3.50-10', '90/90-12', '100/90-17', '120/80-17',
  '130/90-15', '140/70-17', '150/70-17', '160/60-17',
];