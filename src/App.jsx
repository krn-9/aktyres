import { useState, useEffect } from 'react';
import { TyreService, BillService, PaymentService, PartyService, SettingsService, BillParser } from './services/dataService';
import { Tyre } from './models/Tyre';
import { isFirebaseConfigured } from './services/firebase';
import { initSync, signIn, signUp, signOut, getCurrentUser, onAuthChange, startRealtimeSync, syncAll } from './services/firebaseSync';
import { Bill } from './models/Bill';
import { Party } from './models/Party';

// Simple hash-based router
function useRoute() {
  const [route, setRoute] = useState(window.location.hash.slice(1) || '/');
  useEffect(() => {
    const handler = () => setRoute(window.location.hash.slice(1) || '/');
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);
  return [route, (r) => { window.location.hash = r; }];
}

export default function App() {
  const [route, navigate] = useRoute();
  const [settings] = useState(SettingsService.get());
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [syncEnabled, setSyncEnabled] = useState(false);

  useEffect(() => {
    (async () => {
      const enabled = await initSync();
      setSyncEnabled(enabled);
      if (enabled) {
        onAuthChange((u) => {
          setUser(u);
          setAuthReady(true);
          if (u) {
            syncAll().then(() => {
              startRealtimeSync(() => {
                // Force re-render by updating a dummy state
                window.dispatchEvent(new Event('storage'));
              });
            });
          }
        });
      } else {
        setAuthReady(true);
      }
    })();
  }, []);

  // Login screen
  if (syncEnabled && !authReady) {
    return <div className="page"><p>Loading...</p></div>;
  }

  if (syncEnabled && !user) {
    return <LoginScreen onLogin={setUser} />;
  }

  const renderPage = () => {
    if (route.startsWith('/bills/') && route !== '/bills/new' && route !== '/bills/purchase') {
      return <BillDetail navigate={navigate} billId={route.replace('/bills/', '')} />;
    }
    switch (route) {
      case '/': return <Dashboard navigate={navigate} />;
      case '/inventory': return <Inventory navigate={navigate} />;
      case '/inventory/add': return <TyreForm navigate={navigate} />;
      case '/bills': return <BillList navigate={navigate} />;
      case '/bills/new': return <BillForm navigate={navigate} type="sale" />;
      case '/bills/purchase': return <BillForm navigate={navigate} type="purchase" />;
      case '/scan': return <Scanner navigate={navigate} />;
      case '/chatbot': return <Chatbot navigate={navigate} />;
      case '/payments': return <Payments navigate={navigate} />;
      case '/parties': return <Parties navigate={navigate} />;
      default: return <Dashboard navigate={navigate} />;
    }
  };

  return (
    <div className="app">
      <Navbar navigate={navigate} route={route} settings={settings} user={user} onSignOut={async () => { await signOut(); setUser(null); }} />
      <main className="main-content">
        {renderPage()}
      </main>
    </div>
  );
}

// ============ Navbar ============
function Navbar({ navigate, route, settings, user, onSignOut }) {
  const links = [
    { path: '/', label: '📊 Dashboard' },
    { path: '/inventory', label: '🛞 Inventory' },
    { path: '/bills', label: '🧾 Bills' },
    { path: '/scan', label: '📷 Scan' },
    { path: '/chatbot', label: '🤖 Create Bill' },
    { path: '/payments', label: '💰 Payments' },
    { path: '/parties', label: '👥 Parties' },
  ];
  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <span className="brand-icon">🛞</span>
        <span className="brand-name">{settings.shopName}</span>
        {user && <span style={{ fontSize: '0.75rem', opacity: 0.7, marginLeft: 8 }}>{user.email}</span>}
      </div>
      <div className="navbar-links">
        {links.map(l => (
          <button key={l.path} className={`nav-btn ${route === l.path ? 'active' : ''}`}
            onClick={() => navigate(l.path)}>{l.label}</button>
        ))}
        {user && (
          <button className="nav-btn" onClick={onSignOut} style={{ background: '#e94560', borderColor: '#e94560' }}>
            🚪 Sign Out
          </button>
        )}
      </div>
    </nav>
  );
}

// ============ Dashboard ============
function Dashboard({ navigate }) {
  const tyres = TyreService.getAll();
  const bills = BillService.getAll();
  const unpaid = BillService.getUnpaid();
  const lowStock = TyreService.getLowStock();
  const totalStockValue = TyreService.getTotalStockValue();
  const totalSales = bills.filter(b => b.type === 'sale').reduce((s, b) => s + b.total, 0);
  const totalPurchases = bills.filter(b => b.type === 'purchase').reduce((s, b) => s + b.total, 0);

  return (
    <div className="page">
      <h1>Dashboard</h1>
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{tyres.length}</div>
          <div className="stat-label">Tyre Types</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{tyres.reduce((s,t) => s + t.quantity, 0)}</div>
          <div className="stat-label">Total Stock</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">₹{totalStockValue.toLocaleString()}</div>
          <div className="stat-label">Stock Value</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{bills.length}</div>
          <div className="stat-label">Total Bills</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">₹{totalSales.toLocaleString()}</div>
          <div className="stat-label">Total Sales</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">₹{totalPurchases.toLocaleString()}</div>
          <div className="stat-label">Total Purchases</div>
        </div>
        <div className="stat-card warning">
          <div className="stat-value">{unpaid.length}</div>
          <div className="stat-label">Unpaid Bills</div>
        </div>
        <div className="stat-card warning">
          <div className="stat-value">{lowStock.length}</div>
          <div className="stat-label">Low Stock Items</div>
        </div>
      </div>

      {lowStock.length > 0 && (
        <div className="alert-section">
          <h2>⚠️ Low Stock Alert</h2>
          <ul>
            {lowStock.map(t => (
              <li key={t.id}>{t.displayName()} — only {t.quantity} left (min: {t.minStock})</li>
            ))}
          </ul>
        </div>
      )}

      <div className="quick-actions">
        <h2>Quick Actions</h2>
        <div className="action-buttons">
          <button onClick={() => navigate('/bills/new')}>+ New Sale Bill</button>
          <button onClick={() => navigate('/bills/purchase')}>+ New Purchase Bill</button>
          <button onClick={() => navigate('/inventory/add')}>+ Add Tyre</button>
          <button onClick={() => navigate('/scan')}>📷 Scan Bill</button>
          <button onClick={() => navigate('/chatbot')}>🤖 Create Bill via Chat</button>
        </div>
      </div>

      <div className="recent-bills">
        <h2>Recent Bills</h2>
        {BillService.getRecent(5).map(b => (
          <div key={b.id} className="bill-row" onClick={() => navigate(`/bills/${b.id}`)}>
            <span>{b.billNumber}</span>
            <span>{b.partyName}</span>
            <span>{b.typeLabel}</span>
            <span>₹{b.total.toLocaleString()}</span>
            <span className={`status ${b.status}`}>{b.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============ Inventory ============
function Inventory({ navigate }) {
  const [tyres, setTyres] = useState(TyreService.getAll());
  const [search, setSearch] = useState('');

  const filtered = search ? TyreService.search(search) : tyres;

  const refresh = () => setTyres(TyreService.getAll());

  const handleDelete = (id) => {
    if (confirm('Delete this tyre?')) {
      TyreService.delete(id);
      refresh();
    }
  };

  const handleStockUpdate = (id, delta) => {
    TyreService.updateStock(id, delta);
    refresh();
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>Inventory</h1>
        <button onClick={() => navigate('/inventory/add')}>+ Add Tyre</button>
      </div>
      <input className="search-input" placeholder="Search tyres..." value={search}
        onChange={e => setSearch(e.target.value)} />
      <div className="tyre-grid">
        {filtered.map(t => (
          <div key={t.id} className={`tyre-card ${t.isLowStock ? 'low-stock' : ''}`}>
            <div className="tyre-header">
              <strong>{t.brand} {t.model}</strong>
              <span className="tyre-size">{t.size}</span>
            </div>
            <div className="tyre-details">
              <span>Type: {t.type}</span>
              <span>Cost: ₹{t.costPrice}</span>
              <span>Sell: ₹{t.sellingPrice}</span>
            </div>
            <div className="tyre-stock">
              <span className="stock-qty">{t.quantity} in stock</span>
              <div className="stock-actions">
                <button onClick={() => handleStockUpdate(t.id, -1)}>-</button>
                <button onClick={() => handleStockUpdate(t.id, 1)}>+</button>
              </div>
            </div>
            {t.isLowStock && <div className="low-stock-badge">⚠️ Low Stock</div>}
            <div className="tyre-actions">
              <button onClick={() => handleDelete(t.id)} className="btn-danger">Delete</button>
            </div>
          </div>
        ))}
      </div>
      {filtered.length === 0 && <p className="empty-state">No tyres found. Add your first tyre!</p>}
    </div>
  );
}

// ============ Tyre Form ============
function TyreForm({ navigate }) {
  const [form, setForm] = useState({
    brand: '', model: '', size: '', type: 'tubeless',
    costPrice: '', sellingPrice: '', quantity: '', minStock: '2',
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const tyre = new Tyre({
      brand: form.brand,
      model: form.model,
      size: form.size,
      type: form.type,
      costPrice: parseFloat(form.costPrice) || 0,
      sellingPrice: parseFloat(form.sellingPrice) || 0,
      quantity: parseInt(form.quantity) || 0,
      minStock: parseInt(form.minStock) || 2,
    });
    TyreService.save(tyre);
    navigate('/inventory');
  };

  return (
    <div className="page">
      <h1>Add Tyre</h1>
      <form className="form" onSubmit={handleSubmit}>
        <div className="form-row">
          <label>Brand</label>
          <input value={form.brand} onChange={e => setForm({...form, brand: e.target.value})} required />
        </div>
        <div className="form-row">
          <label>Model</label>
          <input value={form.model} onChange={e => setForm({...form, model: e.target.value})} />
        </div>
        <div className="form-row">
          <label>Size</label>
          <input value={form.size} onChange={e => setForm({...form, size: e.target.value})} placeholder="e.g. 195/65R15" required />
        </div>
        <div className="form-row">
          <label>Type</label>
          <select value={form.type} onChange={e => setForm({...form, type: e.target.value})}>
            <option value="tubeless">Tubeless</option>
            <option value="tube-type">Tube Type</option>
            <option value="radial">Radial</option>
            <option value="bias-ply">Bias Ply</option>
          </select>
        </div>
        <div className="form-row">
          <label>Cost Price (₹)</label>
          <input type="number" value={form.costPrice} onChange={e => setForm({...form, costPrice: e.target.value})} required />
        </div>
        <div className="form-row">
          <label>Selling Price (₹)</label>
          <input type="number" value={form.sellingPrice} onChange={e => setForm({...form, sellingPrice: e.target.value})} required />
        </div>
        <div className="form-row">
          <label>Quantity</label>
          <input type="number" value={form.quantity} onChange={e => setForm({...form, quantity: e.target.value})} required />
        </div>
        <div className="form-row">
          <label>Min Stock Alert</label>
          <input type="number" value={form.minStock} onChange={e => setForm({...form, minStock: e.target.value})} />
        </div>
        <div className="form-actions">
          <button type="submit">Save Tyre</button>
          <button type="button" onClick={() => navigate('/inventory')}>Cancel</button>
        </div>
      </form>
    </div>
  );
}

// ============ Bill Detail ============
function BillDetail({ navigate, billId }) {
  const bill = BillService.getById(billId);
  if (!bill) {
    return <div className="page"><h1>Bill not found</h1><button onClick={() => navigate('/bills')}>Back</button></div>;
  }

  const handleDelete = () => {
    if (confirm('Delete this bill? Inventory will be restored.')) {
      for (const item of bill.items) {
        if (item.tyreId) {
          const delta = bill.type === 'purchase' ? -item.quantity : item.quantity;
          TyreService.updateStock(item.tyreId, delta);
        }
      }
      BillService.delete(billId);
      navigate('/bills');
    }
  };

  const handlePayment = () => {
    const amount = prompt('Enter payment amount:');
    if (amount && parseFloat(amount) > 0) {
      PaymentService.recordPayment(bill.id, parseFloat(amount), 'cash', '', '');
      navigate('/bills');
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>{bill.billNumber}</h1>
        <button onClick={() => navigate('/bills')}>← Back</button>
      </div>
      <div className="bill-detail">
        <div className="detail-row"><strong>Type:</strong> {bill.typeLabel}</div>
        <div className="detail-row"><strong>Party:</strong> {bill.partyName || 'Walk-in'}</div>
        <div className="detail-row"><strong>Phone:</strong> {bill.partyPhone || '-'}</div>
        <div className="detail-row"><strong>Date:</strong> {new Date(bill.date).toLocaleDateString()}</div>
        <div className="detail-row"><strong>Status:</strong> <span className={`status-badge ${bill.status}`}>{bill.status}</span></div>
      </div>
      <table className="items-table">
        <thead><tr><th>Item</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead>
        <tbody>
          {bill.items.map(item => (
            <tr key={item.id}>
              <td>{item.tyreName}</td>
              <td>{item.quantity}</td>
              <td>₹{item.rate}</td>
              <td>₹{item.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="bill-totals">
        <div>Subtotal: ₹{bill.subtotal.toLocaleString()}</div>
        <div>Tax: ₹{bill.tax}</div>
        <div><strong>Total: ₹{bill.total.toLocaleString()}</strong></div>
        <div>Paid: ₹{bill.paid.toLocaleString()}</div>
        <div className="balance">Balance: ₹{bill.balance.toLocaleString()}</div>
      </div>
      {bill.notes && <div className="detail-row"><strong>Notes:</strong> {bill.notes}</div>}
      <div className="form-actions">
        {bill.balance > 0 && <button onClick={handlePayment} className="btn-primary">Record Payment</button>}
        <button onClick={handleDelete} className="btn-danger">Delete Bill</button>
      </div>
    </div>
  );
}

// ============ Bill List ============
function BillList({ navigate }) {
  const [bills, setBills] = useState(BillService.getAll());
  const [filter, setFilter] = useState('all');

  const refresh = () => setBills(BillService.getAll());

  const handleDelete = (id, e) => {
    e.stopPropagation();
    if (confirm('Delete this bill? This will also restore inventory.')) {
      const bill = BillService.getById(id);
      if (bill) {
        // Restore inventory
        for (const item of bill.items) {
          if (item.tyreId) {
            const delta = bill.type === 'purchase' ? -item.quantity : item.quantity;
            TyreService.updateStock(item.tyreId, delta);
          }
        }
      }
      BillService.delete(id);
      refresh();
    }
  };

  const filtered = filter === 'all' ? bills :
    filter === 'unpaid' ? bills.filter(b => b.status !== 'paid') :
    filter === 'paid' ? bills.filter(b => b.status === 'paid') :
    bills.filter(b => b.type === filter);

  return (
    <div className="page">
      <div className="page-header">
        <h1>Bills</h1>
        <div className="btn-group">
          <button onClick={() => navigate('/bills/new')}>+ Sale Bill</button>
          <button onClick={() => navigate('/bills/purchase')}>+ Purchase Bill</button>
        </div>
      </div>
      <div className="filter-bar">
        {['all', 'sale', 'purchase', 'unpaid', 'paid'].map(f => (
          <button key={f} className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>
      <div className="bill-list">
        {filtered.sort((a,b) => new Date(b.date) - new Date(a.date)).map(b => (
          <div key={b.id} className="bill-card" onClick={() => navigate(`/bills/${b.id}`)}>
            <div className="bill-card-header">
              <strong>{b.billNumber}</strong>
              <span className={`status-badge ${b.status}`}>{b.status}</span>
            </div>
            <div className="bill-card-body">
              <span>{b.partyName || 'Walk-in'}</span>
              <span>{b.typeLabel}</span>
              <span>{new Date(b.date).toLocaleDateString()}</span>
            </div>
            <div className="bill-card-footer">
              <span>Total: ₹{b.total.toLocaleString()}</span>
              {b.balance > 0 && <span className="balance">Balance: ₹{b.balance.toLocaleString()}</span>}
              <button className="btn-danger btn-sm" onClick={(e) => handleDelete(b.id, e)}
                style={{ marginLeft: 'auto' }}>Delete</button>
            </div>
          </div>
        ))}
      </div>
      {filtered.length === 0 && <p className="empty-state">No bills found.</p>}
    </div>
  );
}

// ============ Bill Form ============
function BillForm({ navigate, type }) {
  const [bill, setBill] = useState(new Bill({ type }));
  const [partySearch, setPartySearch] = useState('');
  const [tyreSearch, setTyreSearch] = useState('');
  const [selectedTyre, setSelectedTyre] = useState(null);
  const [qty, setQty] = useState(1);
  const [rate, setRate] = useState('');

  const parties = PartyService.search(partySearch);
  const tyres = TyreService.search(tyreSearch);

  const handleAddItem = () => {
    if (!selectedTyre) return;
    bill.addItem(selectedTyre, parseInt(qty) || 1, parseFloat(rate) || selectedTyre.sellingPrice);
    setBill(new Bill({ ...bill, items: [...bill.items] }));
    setSelectedTyre(null);
    setTyreSearch('');
    setQty(1);
    setRate('');
  };

  const handleSave = () => {
    if (bill.items.length === 0) {
      alert('Add at least one item');
      return;
    }
    bill.recalculate();
    BillService.save(bill);
    // Apply to inventory
    BillService.applyToInventory(bill);
    navigate('/bills');
  };

  const handlePartySelect = (party) => {
    bill.partyId = party.id;
    bill.partyName = party.name;
    bill.partyPhone = party.phone;
    setBill(new Bill({ ...bill }));
    setPartySearch('');
  };

  return (
    <div className="page">
      <h1>{type === 'purchase' ? 'New Purchase Bill' : 'New Sale Bill'}</h1>

      <div className="form-section">
        <h3>Party Details</h3>
        <input placeholder="Search party..." value={partySearch} onChange={e => setPartySearch(e.target.value)} />
        {partySearch && parties.length > 0 && (
          <div className="dropdown">
            {parties.map(p => (
              <div key={p.id} className="dropdown-item" onClick={() => handlePartySelect(p)}>
                {p.displayName()}
              </div>
            ))}
          </div>
        )}
        <div className="form-row">
          <label>Party Name</label>
          <input value={bill.partyName} onChange={e => { bill.partyName = e.target.value; setBill(new Bill({...bill})); }} />
        </div>
        <div className="form-row">
          <label>Phone</label>
          <input value={bill.partyPhone} onChange={e => { bill.partyPhone = e.target.value; setBill(new Bill({...bill})); }} />
        </div>
      </div>

      <div className="form-section">
        <h3>Add Item</h3>
        <input placeholder="Search tyre..." value={tyreSearch} onChange={e => setTyreSearch(e.target.value)} />
        {tyreSearch && tyres.length > 0 && (
          <div className="dropdown">
            {tyres.map(t => (
              <div key={t.id} className="dropdown-item" onClick={() => { setSelectedTyre(t); setTyreSearch(t.displayName()); setRate(t.sellingPrice); }}>
                {t.displayName()} — Stock: {t.quantity} — ₹{t.sellingPrice}
              </div>
            ))}
          </div>
        )}
        {selectedTyre && (
          <div className="selected-item">
            <span>{selectedTyre.displayName()}</span>
            <input type="number" value={qty} onChange={e => setQty(e.target.value)} min="1" style={{width:60}} />
            <input type="number" value={rate} onChange={e => setRate(e.target.value)} placeholder="Rate" style={{width:80}} />
            <button onClick={handleAddItem}>Add</button>
          </div>
        )}
      </div>

      <div className="form-section">
        <h3>Bill Items</h3>
        <table className="items-table">
          <thead><tr><th>Item</th><th>Qty</th><th>Rate</th><th>Amount</th><th></th></tr></thead>
          <tbody>
            {bill.items.map((item, i) => (
              <tr key={item.id}>
                <td>{item.tyreName}</td>
                <td>{item.quantity}</td>
                <td>₹{item.rate}</td>
                <td>₹{item.total}</td>
                <td><button onClick={() => { bill.removeItem(i); setBill(new Bill({...bill})); }}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="bill-totals">
          <div>Subtotal: ₹{bill.subtotal.toLocaleString()}</div>
          <div>Tax: <input type="number" value={bill.tax} onChange={e => { bill.tax = parseFloat(e.target.value)||0; bill.recalculate(); setBill(new Bill({...bill})); }} style={{width:80}} /></div>
          <div><strong>Total: ₹{bill.total.toLocaleString()}</strong></div>
        </div>
      </div>

      <div className="form-section">
        <h3>Notes</h3>
        <textarea value={bill.notes} onChange={e => { bill.notes = e.target.value; setBill(new Bill({...bill})); }} />
      </div>

      <div className="form-actions">
        <button onClick={handleSave} className="btn-primary">Save Bill</button>
        <button onClick={() => navigate('/bills')}>Cancel</button>
      </div>
    </div>
  );
}

// ============ Scanner ============
function Scanner({ navigate }) {
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null);
  const [scanType, setScanType] = useState('dealer'); // dealer / customer / tyre

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setScanning(true);
    try {
      if (file.type === 'application/pdf') {
        processScanResult('PDF scanning: please convert to image or paste text manually. PDF text extraction requires pdfjs-dist (npm install pdfjs-dist).', scanType);
      } else {
        // Image OCR using Tesseract.js with CDN worker
        const Tesseract = await import('tesseract.js');
        const worker = await Tesseract.createWorker('eng', 1, {
          workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js',
          langPath: 'https://tessdata.projectnaptha.com/4.0.0',
          corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5/tesseract-core.wasm.js',
        });
        const { data: { text } } = await worker.recognize(file);
        await worker.terminate();
        processScanResult(text, scanType);
      }
    } catch (err) {
      console.error('OCR error:', err);
      alert('Scan failed: ' + (err.message || 'Unknown error. Try a clearer image or enter text manually below.'));
    }
    setScanning(false);
  };

  // Manual text input for OCR fallback
  const [manualText, setManualText] = useState('');
  const handleManualScan = () => {
    if (!manualText.trim()) return;
    processScanResult(manualText, scanType);
  };

  const processScanResult = (text, type) => {
    if (type === 'tyre') {
      const tyreData = BillParser.parseTyreLabel(text);
      setResult({ type: 'tyre', data: tyreData, rawText: text });
    } else {
      const billData = BillParser.parseDealerBill(text);
      billData.type = type === 'dealer' ? 'purchase' : 'sale';
      setResult({ type: 'bill', data: billData, rawText: text });
    }
  };

  const handleApplyScan = () => {
    if (!result) return;
    if (result.type === 'tyre') {
      // Add tyre to inventory
      const tyre = new Tyre({
        brand: result.data.brand,
        size: result.data.size,
        type: result.data.type,
        costPrice: 0,
        sellingPrice: 0,
        quantity: 1,
      });
      TyreService.save(tyre);
      alert(`Added tyre: ${tyre.displayName()}`);
      navigate('/inventory');
    } else {
      // Create bill from scan
      const bill = BillService.createFromScan(result.data);
      BillService.save(bill);
      BillService.applyToInventory(bill);
      alert(`Bill created: ${bill.billNumber}`);
      navigate('/bills');
    }
  };

  return (
    <div className="page">
      <h1>Scan</h1>
      <div className="scan-type-selector">
        <label>Scan Type:</label>
        <select value={scanType} onChange={e => setScanType(e.target.value)}>
          <option value="dealer">Dealer Bill (Purchase)</option>
          <option value="customer">Customer Bill (Sale)</option>
          <option value="tyre">Tyre Label</option>
        </select>
      </div>

      <div className="scan-area">
        <label className="scan-upload-btn">
          {scanning ? 'Scanning...' : '📷 Upload Image / PDF'}
          <input type="file" accept="image/*,application/pdf" onChange={handleFileUpload}
            disabled={scanning} style={{display:'none'}} />
        </label>
      </div>

      <div className="manual-scan">
        <h3>Or paste bill text manually:</h3>
        <textarea value={manualText} onChange={e => setManualText(e.target.value)}
          placeholder="Paste bill text here (e.g. MRF 195/65R15 x2 @ 4500 = 9000)" rows={4} />
        <button onClick={handleManualScan} className="btn-primary" style={{ marginTop: 8 }}>
          Parse Text
        </button>
      </div>

      {result && (
        <div className="scan-result">
          <h3>Scan Result</h3>
          <pre className="raw-text">{result.rawText}</pre>
          <div className="parsed-data">
            <h4>Parsed Data:</h4>
            <pre>{JSON.stringify(result.data, null, 2)}</pre>
          </div>
          <div className="scan-actions">
            <button onClick={handleApplyScan} className="btn-primary">
              {result.type === 'tyre' ? 'Add to Inventory' : 'Create Bill'}
            </button>
            <button onClick={() => setResult(null)}>Discard</button>
          </div>
        </div>
      )}
    </div>
  );
}

// (PDF extraction removed - use image upload for scanned bills)

// ============ Chatbot ============
function Chatbot({ navigate }) {
  const [messages, setMessages] = useState([
    { role: 'bot', text: 'Hi! I can help you create a bill. Try: "Create bill for Ramesh: 2 MRF 195/65R15 @ 4500"' }
  ]);
  const [input, setInput] = useState('');

  const handleSend = () => {
    if (!input.trim()) return;
    const userMsg = input.trim();
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setInput('');

    // Parse the command
    setTimeout(() => {
      const response = parseBillCommand(userMsg);
      setMessages(prev => [...prev, { role: 'bot', text: response.text }]);
      if (response.bill) {
        BillService.save(response.bill);
        BillService.applyToInventory(response.bill);
        setMessages(prev => [...prev, { role: 'bot', text: `✅ Bill created: ${response.bill.billNumber} — Total: ₹${response.bill.total}` }]);
      }
    }, 500);
  };

  return (
    <div className="page">
      <h1>Create Bill via Chat</h1>
      <div className="chat-container">
        <div className="chat-messages">
          {messages.map((m, i) => (
            <div key={i} className={`chat-msg ${m.role}`}>
              <span className="chat-avatar">{m.role === 'bot' ? '🤖' : '👤'}</span>
              <span className="chat-text">{m.text}</span>
            </div>
          ))}
        </div>
        <div className="chat-input">
          <input value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder="Type a command..." />
          <button onClick={handleSend}>Send</button>
        </div>
      </div>
      <div className="chat-examples">
        <h3>Examples:</h3>
        <ul>
          <li>"Create bill for Ramesh: 2 MRF 195/65R15 @ 4500"</li>
          <li>"Sale bill for Kumar: 4 CEAT 205/55R16 at 3800 each"</li>
          <li>"Purchase from DealerX: 10 Apollo 185/65R14 @ 2500"</li>
          <li>"Bill for Suresh: 1 195/65R15 4000, 2 205/55R16 3500"</li>
        </ul>
      </div>
    </div>
  );
}

function parseBillCommand(text) {
  const lower = text.toLowerCase();
  // Determine bill type
  const isPurchase = lower.includes('purchase') || lower.includes('dealer') || lower.includes('from');
  const type = isPurchase ? 'purchase' : 'sale';

  // Extract party name (after "for" or "to")
  let partyName = '';
  const partyMatch = text.match(/(?:for|to)\s+([A-Za-z\s]+?)(?:[:\-,])/i);
  if (partyMatch) partyName = partyMatch[1].trim();

  // Extract items: pattern "qty brand size @ rate" or "qty size rate"
  const items = [];
  // Pattern 1: "2 MRF 195/65R15 @ 4500" or "2 MRF 195/65R15 at 4500"
  const regex1 = /(\d+)\s+([A-Za-z]+)\s+(\d{3}\/\d{2}R\d{2}|\d{2,3}\/\d{2}-\d{2})\s*(?:@|at)\s*([\d,]+)/gi;
  let m;
  while ((m = regex1.exec(text)) !== null) {
    items.push({ qty: parseInt(m[1]), brand: m[2], size: m[3], rate: parseFloat(m[4].replace(/,/g, '')) });
  }

  // Pattern 2: "1 195/65R15 4000" (qty size rate)
  if (items.length === 0) {
    const regex2 = /(\d+)\s+(\d{3}\/\d{2}R\d{2}|\d{2,3}\/\d{2}-\d{2})\s+([\d,]+)/gi;
    while ((m = regex2.exec(text)) !== null) {
      items.push({ qty: parseInt(m[1]), brand: '', size: m[2], rate: parseFloat(m[3].replace(/,/g, '')) });
    }
  }

  if (items.length === 0) {
    return { text: "I couldn't parse any items. Try: 'Create bill for Ramesh: 2 MRF 195/65R15 @ 4500'" };
  }

  const bill = new Bill({ type, partyName });
  for (const item of items) {
    const tyre = TyreService.getAll().find(t =>
      t.size === item.size && (item.brand ? t.brand.toLowerCase() === item.brand.toLowerCase() : true)
    );
    const newTyre = tyre || new Tyre({ brand: item.brand, size: item.size });
    bill.addItem(newTyre, item.qty, item.rate);
  }
  bill.recalculate();

  return { text: `Creating ${type} bill for ${partyName || 'walk-in'} with ${items.length} item(s)...`, bill };
}

// ============ Payments ============
function Payments({ navigate }) {
  const [payments, setPayments] = useState(PaymentService.getAll());
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ billId: '', amount: '', method: 'cash', reference: '', notes: '' });

  const unpaidBills = BillService.getUnpaid();

  const handleSubmit = (e) => {
    e.preventDefault();
    const bill = BillService.getById(form.billId);
    if (!bill) return;
    PaymentService.recordPayment(bill.id, parseFloat(form.amount), form.method, form.reference, form.notes);
    setPayments(PaymentService.getAll());
    setShowForm(false);
    setForm({ billId: '', amount: '', method: 'cash', reference: '', notes: '' });
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>Payments</h1>
        <button onClick={() => setShowForm(!showForm)}>+ Record Payment</button>
      </div>

      {showForm && (
        <form className="form" onSubmit={handleSubmit}>
          <div className="form-row">
            <label>Bill</label>
            <select value={form.billId} onChange={e => setForm({...form, billId: e.target.value})} required>
              <option value="">Select bill...</option>
              {unpaidBills.map(b => (
                <option key={b.id} value={b.id}>{b.billNumber} — {b.partyName} — Bal: ₹{b.balance}</option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <label>Amount (₹)</label>
            <input type="number" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} required />
          </div>
          <div className="form-row">
            <label>Method</label>
            <select value={form.method} onChange={e => setForm({...form, method: e.target.value})}>
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
              <option value="bank">Bank Transfer</option>
              <option value="cheque">Cheque</option>
            </select>
          </div>
          <div className="form-row">
            <label>Reference</label>
            <input value={form.reference} onChange={e => setForm({...form, reference: e.target.value})} placeholder="UPI ref / cheque no" />
          </div>
          <div className="form-row">
            <label>Notes</label>
            <input value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} />
          </div>
          <div className="form-actions">
            <button type="submit">Record Payment</button>
            <button type="button" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="payment-list">
        {payments.sort((a,b) => new Date(b.date) - new Date(a.date)).map(p => (
          <div key={p.id} className="payment-card">
            <div className="payment-header">
              <strong>{p.partyName}</strong>
              <span>₹{p.amount.toLocaleString()}</span>
            </div>
            <div className="payment-body">
              <span>{p.method.toUpperCase()}</span>
              {p.reference && <span>Ref: {p.reference}</span>}
              <span>{new Date(p.date).toLocaleDateString()}</span>
            </div>
          </div>
        ))}
      </div>
      {payments.length === 0 && <p className="empty-state">No payments recorded.</p>}
    </div>
  );
}

// ============ Login Screen ============
function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      if (isSignUp) {
        const u = await signUp(email, password);
        onLogin(u);
      } else {
        const u = await signIn(email, password);
        onLogin(u);
      }
    } catch (err) {
      setError(err.message || 'Authentication failed');
    }
    setLoading(false);
  };

  return (
    <div className="page" style={{ maxWidth: 400, margin: '60px auto' }}>
      <h1>🛞 Tyre Shop Manager</h1>
      <p style={{ color: '#666', marginBottom: 20 }}>Sign in to sync across devices</p>
      <form className="form" onSubmit={handleSubmit}>
        <div className="form-row">
          <label>Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
        </div>
        <div className="form-row">
          <label>Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
        </div>
        {error && <div style={{ color: 'red', marginBottom: 10, fontSize: '0.9rem' }}>{error}</div>}
        <div className="form-actions">
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? 'Please wait...' : (isSignUp ? 'Create Account' : 'Sign In')}
          </button>
        </div>
        <p style={{ textAlign: 'center', marginTop: 12, fontSize: '0.9rem' }}>
          {isSignUp ? 'Already have an account?' : "Don't have an account?"}
          <button type="button" onClick={() => setIsSignUp(!isSignUp)}
            style={{ background: 'none', border: 'none', color: '#e94560', cursor: 'pointer', marginLeft: 6 }}>
            {isSignUp ? 'Sign In' : 'Sign Up'}
          </button>
        </p>
      </form>
    </div>
  );
}

// ============ Parties ============
function Parties({ navigate }) {
  const [parties, setParties] = useState(PartyService.getAll());
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', type: 'customer', address: '', gstin: '' });

  const handleSubmit = (e) => {
    e.preventDefault();
    const party = new Party(form);
    PartyService.save(party);
    setParties(PartyService.getAll());
    setShowForm(false);
    setForm({ name: '', phone: '', type: 'customer', address: '', gstin: '' });
  };

  const handleDelete = (id) => {
    if (confirm('Delete this party?')) {
      PartyService.delete(id);
      setParties(PartyService.getAll());
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>Parties</h1>
        <button onClick={() => setShowForm(!showForm)}>+ Add Party</button>
      </div>

      {showForm && (
        <form className="form" onSubmit={handleSubmit}>
          <div className="form-row"><label>Name</label><input value={form.name} onChange={e => setForm({...form, name: e.target.value})} required /></div>
          <div className="form-row"><label>Phone</label><input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} /></div>
          <div className="form-row">
            <label>Type</label>
            <select value={form.type} onChange={e => setForm({...form, type: e.target.value})}>
              <option value="customer">Customer</option>
              <option value="dealer">Dealer/Supplier</option>
            </select>
          </div>
          <div className="form-row"><label>Address</label><input value={form.address} onChange={e => setForm({...form, address: e.target.value})} /></div>
          <div className="form-row"><label>GSTIN</label><input value={form.gstin} onChange={e => setForm({...form, gstin: e.target.value})} /></div>
          <div className="form-actions">
            <button type="submit">Save</button>
            <button type="button" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="party-list">
        {parties.map(p => (
          <div key={p.id} className="party-card">
            <div className="party-header">
              <strong>{p.name}</strong>
              <span className={`type-badge ${p.type}`}>{p.type}</span>
            </div>
            <div className="party-body">
              {p.phone && <span>📞 {p.phone}</span>}
              {p.address && <span>📍 {p.address}</span>}
              {p.gstin && <span>GSTIN: {p.gstin}</span>}
            </div>
            <button onClick={() => handleDelete(p.id)} className="btn-danger btn-sm">Delete</button>
          </div>
        ))}
      </div>
      {parties.length === 0 && <p className="empty-state">No parties added yet.</p>}
    </div>
  );
}