# 🛞 Tyre Shop Manager — Complete Architecture & Documentation

> **For Claude / AI assistants**: This document contains the complete architecture, code structure, data models, and implementation details. Use this as the source of truth when continuing development.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Tech Stack](#tech-stack)
3. [Project Structure](#project-structure)
4. [Data Models](#data-models)
5. [Services](#services)
6. [UI Components & Pages](#ui-components--pages)
7. [Routing](#routing)
8. [Firebase Integration](#firebase-integration)
9. [Real-Time Sync Architecture](#real-time-sync-architecture)
10. [OCR & Scanning](#ocr--scanning)
12. [Excel/CSV Import](#excelcsv-import)
13. [PWA Configuration](#pwa-configuration)
14. [Deployment](#deployment)
15. [Build & Run Commands](#build--run-commands)
16. [Known Issues & TODOs](#known-issues--todos)

---

## Project Overview

A tyre business management web app (PWA) for Android + Web. Tracks inventory, bills, payments, and parties. Supports multi-device sync via Firebase. Built for a family tyre shop with 4 devices.

**Key features:**
- Inventory management (tyres by brand, size, type, cost/sell price, quantity)
- Bill creation (sale, purchase, estimate, formula)
- Bill scanning via OCR (paper bills + tyre labels)
- Payment tracking against bills
- Party management (customers & dealers)
- Excel/CSV inventory import
- Real-time sync across devices (Firebase Firestore)
- PWA (installable on Android home screen)

**Repository:** https://github.com/krn-9/aktyres
**Firebase Project:** aktyres-billbook
**Live URL (after Vercel deploy):** https://aktyres.vercel.app

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | React | 19.2.8 |
| Build tool | Vite | 8.3.4 |
| Styling | Vanilla CSS | — |
| Database (local) | localStorage | — |
| Database (cloud) | Firebase Firestore | 13.0.0 |
| Auth | Firebase Authentication | 13.0.0 |
| OCR | Tesseract.js | 7.0.0 |
| Excel/CSV parsing | SheetJS (xlsx) | 0.18.5 |
| CSV parsing | PapaParse | 5.7.0 |
| PDF (planned) | pdfjs-dist | not installed |
| Mobile | PWA (Progressive Web App) | — |
| Hosting | Vercel / Netlify | free tier |
| Version control | Git + GitHub | — |

---

## Project Structure

```
tyre-shop-app/
├── index.html                    # Entry HTML (PWA manifest link)
├── package.json                  # Dependencies & scripts
├── vite.config.js                # Vite configuration
├── capacitor.config.json         # Capacitor config (for future APK builds)
├── public/
│   └── manifest.json             # PWA manifest
├── src/
│   ├── main.jsx                  # React entry point
│   ├── App.jsx                   # Main app component (all pages + routing)
│   ├── index.css                 # Global styles
│   ├── models/
│   │   ├── Tyre.js               # Tyre data model
│   │   ├── Bill.js               # Bill + BillItem data models
│   │   ├── Payment.js            # Payment data model
│   │   └── Party.js              # Party (customer/dealer) data model
│   └── services/
│       ├── dataService.js        # Core data layer (localStorage + Firebase push)
│       ├── firebase.js           # Firebase config & initialization
│       └── firebaseSync.js       # Firebase sync (auth, real-time listeners, push/pull)
├── android/                      # Capacitor Android project (for future APK)
├── dist/                         # Production build output
└── node_modules/                 # Dependencies
```

---

## Data Models

### Tyre (`src/models/Tyre.js`)

```javascript
class Tyre {
  id: string (UUID)
  brand: string
  model: string
  size: string (e.g., "195/65R15")
  type: string ('tubeless' | 'tube-type' | 'radial' | 'bias-ply')
  costPrice: number
  sellingPrice: number
  quantity: number
  minStock: number (default: 2)
  createdAt: ISO string
  updatedAt: ISO string

  // Computed
  isLowStock: boolean (quantity <= minStock)
  stockValue: number (quantity * costPrice)
  potentialRevenue: number (quantity * sellingPrice)
  displayName(): string ("Brand Model Size (type)")
}
```

### Bill & BillItem (`src/models/Bill.js`)

```javascript
class BillItem {
  id: string (UUID)
  tyreId: string
  tyreName: string
  brand: string
  size: string
  type: string
  quantity: number
  rate: number
  amount: number (quantity * rate)
  total: number (getter: quantity * rate)
}

class Bill {
  id: string (UUID)
  billNumber: string (auto-generated: "TS-YYMMDD-XXX")
  invoiceNo: string (dealer invoice number)
  type: string ('sale' | 'purchase' | 'formula' | 'estimate')
  partyId: string
  partyName: string
  partyPhone: string
  items: BillItem[]
  subtotal: number
  tax: number
  total: number
  paid: number
  balance: number
  status: string ('unpaid' | 'partial' | 'paid')
  notes: string
  date: ISO string
  createdAt: ISO string
  updatedAt: ISO string

  // Methods
  recalculate() — recalculates subtotal, total, balance, status
  addItem(tyre, quantity, rate) — adds a BillItem
  removeItem(index) — removes item by index
  typeLabel: string (getter)
  toFirestore() — serializes for Firestore
  fromFirestore(doc) — deserializes from Firestore
}
```

### Payment (`src/models/Payment.js`)

```javascript
class Payment {
  id: string (UUID)
  billId: string
  partyId: string
  partyName: string
  amount: number
  method: string ('cash' | 'upi' | 'bank' | 'cheque')
  reference: string (UPI ref / cheque no)
  date: ISO string
  notes: string
  createdAt: ISO string
}
```

### Party (`src/models/Party.js`)

```javascript
class Party {
  id: string (UUID)
  name: string
  phone: string
  type: string ('customer' | 'dealer')
  address: string
  gstin: string
  createdAt: ISO string
}
```

---

## Services

### dataService.js (`src/services/dataService.js`)

Core data layer using localStorage with Firebase push.

**Storage keys:**
- `tyre_shop_tyres` — Array of tyre objects
- `tyre_shop_bills` — Array of bill objects
- `tyre_shop_payments` — Array of payment objects
- `tyre_shop_parties` — Array of party objects
- `tyre_shop_settings` — Settings object

**Services:**

#### TyreService
| Method | Description |
|---|---|
| `getAll()` | Returns all tyres as Tyre instances |
| `getById(id)` | Find tyre by ID |
| `save(tyre)` | Create or update tyre (pushes to Firebase) |
| `delete(id)` | Delete tyre (pushes to Firebase) |
| `updateStock(id, delta)` | Adjust quantity by delta |
| `search(query)` | Filter tyres by brand/model/size/type |
| `getLowStock()` | Returns tyres where quantity <= minStock |
| `getTotalStockValue()` | Sum of (quantity * costPrice) |

#### BillService
| Method | Description |
|---|---|
| `getAll()` | Returns all bills as Bill instances |
| `getById(id)` | Find bill by ID |
| `save(bill)` | Create or update bill (pushes to Firebase) |
| `delete(id)` | Delete bill (pushes to Firebase) |
| `getByType(type)` | Filter by type |
| `getUnpaid()` | Bills with status !== 'paid' |
| `getPaid()` | Bills with status === 'paid' |
| `getRecent(limit)` | Most recent bills |
| `createFromScan(scanData)` | Create bill from OCR-parsed data |
| `applyToInventory(bill)` | Update tyre stock based on bill items |

#### PaymentService
| Method | Description |
|---|---|
| `getAll()` | Returns all payments |
| `getById(id)` | Find payment by ID |
| `save(payment)` | Create or update (pushes to Firebase) |
| `delete(id)` | Delete (pushes to Firebase) |
| `getByBill(billId)` | Payments for a specific bill |
| `getByParty(partyId)` | Payments for a specific party |
| `getTotalPaidForBill(billId)` | Sum of payments for a bill |
| `recordPayment(billId, amount, method, reference, notes)` | Create payment + update bill balance |

#### PartyService
| Method | Description |
|---|---|
| `getAll()` | Returns all parties |
| `getById(id)` | Find party by ID |
| `save(party)` | Create or update (pushes to Firebase) |
| `delete(id)` | Delete (pushes to Firebase) |
| `search(query)` | Filter by name/phone |
| `getByType(type)` | Filter by type |

#### BillParser (OCR parser)
| Method | Description |
|---|---|
| `parseDealerBill(text)` | Parse OCR text from dealer bill → { partyName, items[], date, total, invoiceNo } |
| `parseTyreLabel(text)` | Parse tyre label → { brand, size, type } |
| `parseCustomerBill(text)` | Same as parseDealerBill (alias) |

#### SettingsService
| Method | Description |
|---|---|
| `get()` | Returns settings (shopName, currency, lowStockThreshold) |
| `save(settings)` | Save settings to localStorage |

### firebase.js (`src/services/firebase.js`)

```javascript
firebaseConfig = {
  apiKey: "AIzaSyCeAHVqJDeMsZ6cRtyrvbQp-1bXoIl-RCQ",
  authDomain: "aktyres-billbook.firebaseapp.com",
  projectId: "aktyres-billbook",
  storageBucket: "aktyres-billbook.firebasestorage.app",
  messagingSenderId: "20011491040",
  appId: "1:20011491040:web:0a38f3e5b3963e4bc7ba85",
  measurementId: "G-341L1PRHWV",
}

isFirebaseConfigured() — checks if apiKey is set
initFirebase() — initializes Firebase app, Firestore, Auth
```

### firebaseSync.js (`src/services/firebaseSync.js`)

| Function | Description |
|---|---|
| `initSync()` | Initialize Firebase sync, returns boolean |
| `isSyncEnabled()` | Check if sync is active |
| `signIn(email, password)` | Firebase email/password sign in |
| `signOut()` | Sign out |
| `getCurrentUser()` | Get current Firebase user |
| `onAuthChange(callback)` | Listen for auth state changes |
| `pullCollection(name)` | Pull collection from Firestore → localStorage |
| `pushDocument(collection, id, data)` | Push single doc to Firestore |
| `deleteDocument(collection, id)` | Delete doc from Firestore |
| `listenCollection(name, callback)` | Real-time listener for collection |
| `syncAll()` | Pull all collections from Firestore |
| `startRealtimeSync(callback)` | Set up real-time listeners for all collections |

---

## UI Components & Pages

All components are in `src/App.jsx` (single file, ~1200 lines).

### Page Components

| Component | Route | Description |
|---|---|---|
| `Dashboard` | `/` | Stats, low stock alerts, recent bills, quick actions |
| `Inventory` | `/inventory` | Tyre grid with search, stock update, edit, delete, import |
| `TyreForm` | `/inventory/add`, `/inventory/edit/:id` | Add/edit tyre form |
| `BillList` | `/bills` | Bill list with filters, delete button |
| `BillDetail` | `/bills/:id` | Single bill view with edit, delete, payment |
| `BillForm` | `/bills/new`, `/bills/purchase`, `/bills/edit/:id` | Create/edit bill with items |
| `Scanner` | `/scan` | OCR scan (image/PDF) + manual text input |
| `Payments` | `/payments` | Payment list + record payment form |
| `Parties` | `/parties` | Party list with add/edit/delete |
| `LoginScreen` | (shown when not authenticated) | Firebase email/password login |

### Navbar

Top navigation with links to all pages + user email + sign out button.

---

## Routing

Hash-based routing (no react-router). `useRoute()` hook reads `window.location.hash`.

```
/                    → Dashboard
/inventory            → Inventory
/inventory/add        → TyreForm (new)
/inventory/edit/:id   → TyreForm (edit)
/bills                → BillList
/bills/new            → BillForm (sale)
/bills/purchase       → BillForm (purchase)
/bills/edit/:id       → BillForm (edit)
/bills/:id            → BillDetail
/scan                 → Scanner
/payments             → Payments
/parties              → Parties
```

---

## Firebase Integration

### Setup
1. Firebase project: `aktyres-billbook`
2. Authentication: Email/Password
3. Firestore: production mode, using the rules in `firestore.rules` (see below)
4. Collections: `tyres`, `bills`, `payments`, `parties`

### Locking down access (do this before going live)
Sign-up is not available in the app, so only accounts you create can sign in. Because the repo and Firebase config are public, also switch sign-up off on the server side:
1. Firebase console → Authentication → Settings → User actions → untick **Enable create (sign-up)**.
2. Authentication → Users → add an account (email + password) for each family member, and delete any account you don't recognise.
3. Edit the email list in `firestore.rules`, then paste it into Firestore Database → Rules and **Publish**.
   Use the lowercase email addresses exactly as shown under Authentication → Users, and keep the real addresses in the Firebase console copy only (this repo is public).
   Publish the rules only after the matching app version is deployed. Until the rules allow access, the app shows a yellow "Not syncing" banner and keeps everything on the device; it uploads automatically once the rules are published.

### Firestore Security Rules
See `firestore.rules`. Only the listed emails can read or write the shop's data (every collection, including the Day Book).

### Config Location
`src/services/firebase.js` → `firebaseConfig` object

---

## Real-Time Sync Architecture

```
Device A (User 1)                    Device B (User 2)
     │                                    │
     ├─ TyreService.save(tyre)            │
     │   ├─ localStorage.setItem()        │
     │   ├─ dispatch 'dataChanged'        │
     │   └─ pushDocument('tyres', id) ──→ Firestore
     │                                    │
     │                                    ├─ onSnapshot listener fires
     │                                    ├─ localStorage.setItem()
     │                                    └─ dispatch 'dataChanged'
     │                                         │
     │                                         └─ Inventory component re-renders
     │
     └─ UI updates instantly (local)
```

**Flow:**
1. User action → Service method (save/delete)
2. Service saves to localStorage + dispatches `dataChanged` event
3. Service pushes to Firestore (async, non-blocking)
4. Firestore triggers `onSnapshot` on other devices
5. Other devices update localStorage + dispatch `dataChanged`
6. Components listen for `dataChanged` → re-read from localStorage → re-render

**On login:**
1. `initSync()` → initializes Firebase
2. `onAuthChange()` → detects signed-in user
3. `syncAll()` → pulls all collections from Firestore → localStorage
4. `startRealtimeSync()` → sets up `onSnapshot` listeners for all collections

---

## OCR & Scanning

### Tesseract.js Configuration
```javascript
const worker = await Tesseract.createWorker('eng', 1, {
  workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js',
  langPath: 'https://tessdata.projectnaptha.com/4.0.0',
  corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5/tesseract-core.wasm.js',
});
```

### BillParser.parseDealerBill(text)
Extracts from OCR text:
- `partyName` — from "To:", "From:", "Customer:", etc.
- `invoiceNo` — from "Invoice:", "Bill:", "No:", etc.
- `date` — date pattern (DD/MM/YYYY)
- `total` — "Total: ₹X"
- `items[]` — regex matching "Brand Size x Qty @ Rate"

### BillParser.parseTyreLabel(text)
Extracts from tyre sidewall photo:
- `brand` — matches known tyre brands (MRF, CEAT, JK, Apollo, etc.)
- `size` — regex for size patterns (195/65R15, 3.00-18, etc.)
- `type` — tubeless/tube-type/radial detection

### Manual Text Input
Fallback: user can paste bill text manually and click "Parse Text".

---

## Login
The app opens straight to the Day Book with no sign-in (`REQUIRE_LOGIN = false` at the top of `src/App.jsx`). The Firestore rules must then allow open access, which means anyone with the app link can read and change the shop's data. To require a login again, set `REQUIRE_LOGIN = true`, create the accounts in Firebase Authentication and publish the allow-list rules from `firestore.rules`.

## Day Book (home page)
The home page is the shop's daily book: cash in the counter, online received, and a statement with cash on the left and online on the right.
- Work done (car wash, puncture, air, nitrogen, tyre sale, alignment, balancing, other) is added with an amount and cash/online. Data: `dayEntries` collection (`src/models/DayEntry.js`).
- Payments recorded on bills appear automatically (sale payments come in, purchase payments go out). UPI, bank and cheque count as online.
- Cash taken home is entered at the end of the day (`days` collection). What is left in the counter becomes the next day's starting cash; it can be changed by hand.
- Several services can be added at once for one customer (each with its own amount). Entries can be part-paid (the rest stays pending until collected) and edited. Services can be added from the page (stored in the `config` collection).
- Week / Month / Year reports, a per-service report (jobs, cash, online, pending), and a Download PDF button for whatever is on screen (statement, totals and a by-service table; `src/exportPdf.js`).
- Logic: `DayBookService` in `src/services/dataService.js`; page: `src/DayBook.jsx`.

## Dashboard (work done)
The Dashboard menu item (between Day Book and Overview) shows how many jobs of each service were done today, this week, this month or this year, with their value and how they were paid (cash, online, pending). Tap a service to see the jobs behind the number; Download Excel exports the same data. Jobs are hand-entered Day Book entries (not expenses), sale bills, and online payments from the phone that have no service yet. Code: `src/WorkDashboard.jsx`, `DayBookService.getWorkReport`.

## Online payment confirmation (PhonePe / PayZapp)
Online entries in the Day Book turn green with **✓ Received** when a payment notification for the same amount arrives. Until then (or if it never arrives) nothing extra is shown.
- The counter phone forwards each "payment received" notification (free automation app, e.g. MacroDroid) to `POST /api/incoming?app=phonepe` (Vercel function `api/incoming.js`, body = notification text).
- `src/services/paymentParser.js` reads the amount and UPI reference; settlements, debits, refunds and failures are ignored.
- Matching (`DayBookService.confirmations`): same amount, notification within 6 hours of the entry, closest first, one notification confirms one payment. Nothing is stored for the match.
- Optional: set the `INCOMING_KEY` environment variable in Vercel and add `&key=...` to the phone's URL so only your phone can post.
- Every payment that arrives on the phone becomes a green "Online payment" row in the Day Book by itself and counts as online money received. If someone also enters it (same amount, same few hours), the entry replaces that row and the payment is not counted twice. "add details" on the row pre-fills an entry so a service can be chosen.

## Bills: GST and payment
- Bills are created under Bills (Sale / Purchase). The chatbot was removed.
- A new bill is marked paid by default (cash, UPI, bank or cheque); untick it to save an unpaid bill. See `BillService.finalize`.
- GST: prices already include GST; the bill shows the GST part (default 18%, editable).

## Excel/CSV Import

### Location
Inventory page → "📥 Import Excel/CSV" button

### Supported formats
- `.xlsx`, `.xls`, `.csv`

### Expected columns (flexible naming)
| Column | Accepted names | Required |
|---|---|---|
| Brand | Brand, brand, BRAND | ✅ |
| Model | Model, model, MODEL | No |
| Size | Size, size, SIZE | ✅ |
| Type | Type, type, TYPE | No (default: tubeless) |
| CostPrice | CostPrice, costPrice, Cost Price, cost price | No |
| SellingPrice | SellingPrice, sellingPrice, Selling Price | No |
| Quantity | Quantity, quantity, QTY, qty | No |
| MinStock | MinStock, minStock, Min Stock, min stock | No |

### Implementation
Uses SheetJS (`xlsx` library):
```javascript
const XLSX = await import('xlsx');
const data = await file.arrayBuffer();
const workbook = XLSX.read(data);
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet);
// Each row → new Tyre → TyreService.save()
```

### Sample template
Downloadable from Inventory page. CSV format:
```csv
Brand,Model,Size,Type,CostPrice,SellingPrice,Quantity,MinStock
MRF,ZLX,195/65R15,tubeless,3200,4500,10,2
```

---

## PWA Configuration

### manifest.json (`public/manifest.json`)
```json
{
  "name": "Tyre Shop Manager",
  "short_name": "TyreShop",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#1a1a2e",
  "theme_color": "#e94560",
  "icons": ["/icon-192.png", "/icon-512.png"]
}
```

### index.html
- Links to manifest.json
- Meta tags for theme-color and viewport
- Mobile-friendly viewport settings

### Install on Android
1. Open app URL in Chrome
2. Tap ⋮ → "Add to Home Screen"
3. App installs with icon, works offline

---

## Deployment

### Option 1: Vercel (Recommended)
1. Push code to GitHub: https://github.com/krn-9/aktyres
2. Go to https://vercel.com → Import GitHub repo
3. Vercel auto-detects Vite → Deploy
4. URL: https://aktyres.vercel.app
5. Every git push auto-redeploys

### Option 2: Netlify
1. Build: `npm run build`
2. Drag `dist/` folder to https://app.netlify.com/drop
3. URL: https://aktyres.netlify.app

### Option 3: Local dev server
```bash
npm run dev -- --host
# Access from phone: http://YOUR_IP:5173
```

---

## Build & Run Commands

```bash
# Install dependencies
npm install

# Development server (localhost only)
npm run dev

# Development server (accessible on network)
npm run dev -- --host

# Production build
npm run build

# Preview production build
npm run preview

# Git push (triggers Vercel redeploy)
git add -A
git commit -m "your message"
git push origin main
```

---

## Known Issues & TODOs

### Known Issues
1. **PDF scanning** — Not implemented; the scanner accepts images only (needs pdfjs-dist for PDFs).
2. **Firebase config hardcoded** — Config is in `firebase.js` (not env vars). For production, consider using env vars.
3. **No image icons** — PWA manifest references `/icon-192.png` and `/icon-512.png` which don't exist yet.
4. **Capacitor Android** — Android project exists but not fully configured (google-services.json placed).
5. **No offline indicator** — App doesn't show when offline.

### TODOs
- [ ] Add app icons (192x192 and 512x512 PNG)
- [ ] Implement PDF text extraction (install pdfjs-dist)
- [ ] Add bill editing (partially done)
- [ ] Add stock history/audit log
- [ ] Add reports/analytics (daily/weekly/monthly sales)
- [ ] Add barcode/QR scanning for tyres
- [ ] Add WhatsApp sharing for bills
- [ ] Add print support for bills
- [ ] Implement proper offline indicator
- [ ] Add data export (backup to JSON/CSV)
- [ ] Add user roles (admin vs viewer)

---

## For Claude / AI Assistants

### Key files to modify:
- **UI changes:** `src/App.jsx` (all components in one file)
- **Data logic:** `src/services/dataService.js`
- **Firebase config:** `src/services/firebase.js`
- **Sync logic:** `src/services/firebaseSync.js`
- **Data models:** `src/models/*.js`
- **Styles:** `src/index.css`

### Patterns to follow:
1. **Components** are functional React components with hooks
2. **State** is managed via `useState` + `useEffect`
3. **Data flow:** Component → Service → localStorage + Firebase push → `dataChanged` event → Component re-render
4. **Reactive updates:** Components listen for `dataChanged` custom event
5. **Styling:** Vanilla CSS with class-based styling (no CSS modules or Tailwind)

### Common tasks:
- **Add a new page:** Add case in `renderPage()` switch, add nav link in `Navbar`
- **Add a new data type:** Create model in `src/models/`, add service in `dataService.js`, add Firestore collection
- **Add a new field to a model:** Update model class, update form, update Firestore serialization
- **Fix sync:** Check `firebaseSync.js` listeners and `dataService.js` push calls

### Testing locally:
```bash
npm run dev -- --host  # Access from phone on same Wi-Fi
```

### Deploying:
```bash
git add -A && git commit -m "message" && git push origin main
# Vercel auto-deploys from GitHub
```