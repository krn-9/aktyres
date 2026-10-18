# 🛞 Tyre Shop Manager

A complete tyre business management app for Android + Web. Track inventory, bills, payments, and scan bills — all synced across devices for free.

## Features

- **Inventory Management**: Track tyres by brand, size, type, cost & selling price. Low stock alerts.
- **Bill Management**: Create sale bills, purchase bills, estimates, and formulas. Track paid/unpaid status.
- **Payment Tracking**: Record payments against bills (cash, UPI, bank, cheque). Auto-update bill balance.
- **Bill Scanning (OCR)**: Scan paper bills or PDFs → auto-extract items → update inventory.
- **Tyre Label Scanning**: Photo a tyre sidewall → auto-detect brand & size → add to inventory.
- **Chatbot Bill Creation**: Type "Create bill for Ramesh: 2 MRF 195/65R15 @ 4500" → auto-creates bill.
- **Multi-Device Sync**: Firebase real-time sync across all family devices (free forever).
- **Offline Support**: Works offline, syncs when back online.
- **PWA**: Install on Android home screen from browser.

## Tech Stack

- **Frontend**: React 19 + Vite
- **Database/Sync**: Firebase Firestore (free Spark plan)
- **Auth**: Firebase Authentication
- **OCR**: Tesseract.js (on-device, free)
- **PDF**: Manual upload (pdfjs-dist optional)
- **Mobile**: PWA (installable on Android) + Capacitor (optional APK)

## Quick Start

```bash
# Install dependencies
npm install

# Run dev server
npm run dev

# Build for production
npm run build
```

Open http://localhost:5173 in your browser.

## Firebase Setup (Free Forever)

1. Go to https://console.firebase.google.com
2. Create a new project (free)
3. Enable **Authentication** → Email/Password
4. Create **Firestore Database** (start in test mode)
5. Go to Project Settings → Web App → copy config
6. Edit `src/services/firebase.js` → replace `YOUR_API_KEY` etc. with your values
7. For Android: also add Android app in Firebase console, download `google-services.json`

### Firestore Security Rules (for family use)
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

## Android APK (Optional)

To build a native Android APK:

```bash
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap init "Tyre Shop" "com.tyreshop.app"
npx cap add android
npm run build
npx cap sync android
npx cap open android
```

Then build APK in Android Studio.

## Project Structure

```
src/
├── models/          # Data models (Tyre, Bill, Payment, Party)
├── services/        # Data service layer (localStorage + Firebase)
├── App.jsx          # Main app with all pages
├── index.css        # Styles
└── main.jsx         # Entry point
```

## Usage Guide

### Adding Tyres
1. Go to Inventory → + Add Tyre
2. Enter brand, size, type, cost price, selling price, quantity
3. Save

### Creating a Bill (Manual)
1. Go to Bills → + Sale Bill (or Purchase Bill)
2. Search & select party (or type name)
3. Search & select tyres, set quantity & rate
4. Add items, set tax if needed
5. Save Bill (auto-updates inventory)

### Creating a Bill (Chat)
1. Go to Create Bill via Chat
2. Type: "Create bill for Ramesh: 2 MRF 195/65R15 @ 4500"
3. Bot creates bill and reduces inventory

### Scanning a Bill
1. Go to Scan → select type (Dealer/Customer/Tyre)
2. Upload photo or PDF
3. Review parsed data
4. Confirm to create bill / add tyre

### Recording Payment
1. Go to Payments → + Record Payment
2. Select unpaid bill, enter amount & method
3. Bill balance auto-updates

## Free Forever Stack

| Service | Free Tier | Limit |
|---|---|---|
| Firebase Spark | Free forever | 1GB storage, 10GB/mo transfer, 50K reads/day |
| Tesseract.js OCR | Free (client-side) | Unlimited |
| Vercel/Netlify hosting | Free | Unlimited static sites |
| Android PWA | Free | Install from browser |

## Sync Across Devices

All data syncs in real-time via Firebase Firestore. When you add a tyre on Device A, it appears on Device B within seconds. Works offline — changes sync when back online.

## License

Personal use. Built for tyre business management.