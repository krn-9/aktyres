import { useState, useEffect } from 'react';
import { DayBookService } from './services/dataService';
import { parseKey, shiftDate, periodRange, shiftPeriod, periodLabel } from './periods';

const PRESET_SERVICES = ['Car wash', 'Bike wash', 'Body wash', 'Puncture', 'Air', 'Nitrogen', 'Tyre fitting', 'Tyre sale', 'Alignment', 'Balancing'];
// Subjects (what an entry is about) will be added later. Until then it is a free-text field that
// suggests the subjects already typed. Put fixed choices here when they are decided.
const SUBJECT_OPTIONS = [];

const money = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN')}`;
const timeOf = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const EMPTY_FORM = { picked: ['Car wash'], amounts: {}, custom: '', full: true, received: '', mode: 'cash', direction: 'in', subject: '', note: '' };

// The shop's daily book: cash in the counter, work done, how each payment arrived, what is pending,
// plus week / month / year reports and a per-service report
export default function DayBook({ navigate }) {
  const [view, setView] = useState('day');            // day | week | month | year
  const [date, setDate] = useState(DayBookService.today());
  const [, refresh] = useState(0);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [filter, setFilter] = useState([]);           // selected services (empty = all)
  const [picked, setPicked] = useState([]);           // entry ids ticked for bulk delete
  const [homeInput, setHomeInput] = useState(null);   // null = show the saved value

  // Re-render when entries, bills or payments change (including changes arriving from other devices)
  useEffect(() => {
    const handler = () => refresh(n => n + 1);
    window.addEventListener('dataChanged', handler);
    return () => window.removeEventListener('dataChanged', handler);
  }, []);

  const changeDate = (next) => { setDate(next); setHomeInput(null); setPicked([]); };
  const changeView = (next) => { setView(next); setPicked([]); };
  const setField = (patch) => setForm(f => ({ ...f, ...patch }));
  const toggleService = (name) => setFilter(f => (f.includes(name) ? f.filter(x => x !== name) : [...f, name]));

  const [start, end] = periodRange(view, date);
  const isToday = date === DayBookService.today();
  const summary = DayBookService.getSummary(date);
  const day = DayBookService.getDay(date);
  const period = view === 'day' ? null : DayBookService.getPeriodSummary(start, end, filter);
  const allTxns = view === 'day' ? DayBookService.getTransactions(date) : period.txns;
  const txns = view === 'day' && filter.length ? allTxns.filter(t => filter.includes(t.service)) : allTxns;
  const pendingEntries = DayBookService.pendingEntries();
  const bills = DayBookService.billBalances();
  const pendingTotal = pendingEntries.reduce((n, e) => n + e.pending, 0);
  const confirmed = DayBookService.confirmations();   // online payments matched with a phone notification
  const customServices = DayBookService.getServices();
  const formServices = [...PRESET_SERVICES, ...customServices, 'Other'];
  const knownServices = [...new Set([...PRESET_SERVICES, ...customServices, ...DayBookService.allTransactions().map(t => t.service), ...pendingEntries.map(e => e.service)])];
  const formTotal = form.picked.reduce((n, name) => n + (parseFloat(form.amounts[name]) || 0), 0);
  const subjectSuggestions = [...new Set([...SUBJECT_OPTIONS, ...DayBookService.getEntries().map(e => e.subject).filter(Boolean)])];

  // ---------- add / edit ----------
  // Several services can be picked at once; each gets its own amount and becomes its own entry
  const pickService = (name) => setForm(f => {
    if (editingId) return { ...f, picked: [name] };
    return { ...f, picked: f.picked.includes(name) ? f.picked.filter(x => x !== name) : [...f.picked, name] };
  });
  const setAmount = (name, value) => setForm(f => ({ ...f, amounts: { ...f.amounts, [name]: value } }));

  const submitEntry = (e) => {
    e.preventDefault();
    const lines = form.picked.map(name => ({
      name: name === 'Other' ? (form.custom.trim() || 'Other') : name,
      amount: parseFloat(form.amounts[name]),
    }));
    if (lines.length === 0) { alert('Pick at least one service'); return; }
    if (lines.some(l => !(l.amount > 0))) { alert('Enter the amount for every selected service'); return; }
    const total = lines.reduce((n, l) => n + l.amount, 0);
    let left = form.full ? total : (parseFloat(form.received) || 0);
    if (left > total) { alert('Received cannot be more than the total'); return; }
    for (const l of lines) {
      const got = Math.min(left, l.amount);   // money received is used up service by service, in order
      left -= got;
      const data = { service: l.name, amount: l.amount, received: got, mode: form.mode, direction: form.direction, subject: form.subject.trim(), note: form.note.trim() };
      if (editingId) DayBookService.updateEntry(editingId, data);
      else DayBookService.addEntry({ ...data, date });
    }
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const startEdit = (id) => {
    const entry = DayBookService.getEntries().find(x => x.id === id);
    if (!entry) return;
    const known = formServices.includes(entry.service);
    const key = known ? entry.service : 'Other';
    setEditingId(id);
    setForm({
      picked: [key], amounts: { [key]: String(entry.amount) }, custom: known ? '' : entry.service,
      full: entry.pending === 0, received: String(entry.received),
      mode: entry.receipts[0]?.mode || 'cash', direction: entry.direction, subject: entry.subject, note: entry.note,
    });
    if (view !== 'day') changeView('day');
    changeDate(entry.date);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => { setEditingId(null); setForm(EMPTY_FORM); };

  const removeEntry = (id) => {
    if (confirm('Remove this entry?')) { DayBookService.deleteEntry(id); setPicked(p => p.filter(x => x !== id)); }
  };

  const removePicked = () => {
    if (picked.length && confirm(`Remove ${picked.length} selected ${picked.length === 1 ? 'entry' : 'entries'}?`)) {
      DayBookService.deleteEntries(picked);
      setPicked([]);
    }
  };

  const collect = (entry, mode) => {
    const input = prompt(`Collect how much? (₹${entry.pending} pending)`, String(entry.pending));
    if (input === null) return;
    const value = parseFloat(input);
    if (!(value > 0)) { alert('Enter a valid amount'); return; }
    DayBookService.collect(entry.id, value, mode);
  };

  const addServiceName = () => {
    const name = prompt('Name of the new service:');
    if (name === null) return;
    if (!name.trim()) { alert('Enter a name'); return; }
    if (!DayBookService.addService(name)) alert('That service already exists');
  };

  const togglePick = (id) => setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]));

  // ---------- counter cash ----------
  const editOpening = () => {
    const input = prompt('Starting cash in the counter for this day:', String(summary.opening));
    if (input === null) return;
    const value = parseFloat(input);
    if (isNaN(value) || value < 0) { alert('Enter a valid amount'); return; }
    DayBookService.saveDay({ ...day, openingOverride: value });
  };
  const resetOpening = () => DayBookService.saveDay({ ...day, openingOverride: null });
  const saveHome = () => {
    const value = homeInput === null ? summary.takenHome : parseFloat(homeInput);
    if (isNaN(value) || value < 0) { alert('Enter a valid amount'); return; }
    DayBookService.saveDay({ ...day, takenHome: value });
    setHomeInput(null);
  };

  // Download what is on screen (this day / week / month / year, and the selected services) as an Excel file
  const exportExcel = async () => {
    try {
      const XLSX = await import('xlsx');
      const report = DayBookService.getPeriodSummary(start, end, filter);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(DayBookService.exportRows(txns, confirmed)), 'Transactions');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(DayBookService.exportServiceRows(report)), 'By service');
      XLSX.writeFile(wb, `daybook-${view}-${start}${end !== start ? `_to_${end}` : ''}.xlsx`);
    } catch (err) {
      alert('Could not create the file: ' + (err.message || 'unknown error'));
    }
  };

  const signed = (t) => (t.direction === 'out' ? `− ${money(t.amount)}` : `+ ${money(t.amount)}`);
  const manualIds = txns.filter(t => t.source === 'manual').map(t => t.entryId);
  const allPicked = manualIds.length > 0 && manualIds.every(id => picked.includes(id));

  // ---------- pieces ----------
  const serviceChips = (
    <div className="chips">
      {knownServices.map(s => (
        <button type="button" key={s} className={`chip ${filter.includes(s) ? 'active' : ''}`} onClick={() => toggleService(s)}>{s}</button>
      ))}
      <button type="button" className="chip ghost" onClick={addServiceName}>+ Add service</button>
      {filter.length > 0 && <button type="button" className="chip ghost" onClick={() => setFilter([])}>Clear ✕</button>}
    </div>
  );

  const statement = (
    <div className="card statement">
      <div className="statement-head">
        <h3>{view === 'day' ? 'Statement' : 'Entries in this period'}</h3>
        <div className="muted">{txns.length} {txns.length === 1 ? 'entry' : 'entries'}{filter.length ? ` · ${filter.join(', ')}` : ''}</div>
      </div>
      <div className="actions-row" style={{ marginTop: 0, marginBottom: 6 }}>
        <button className="btn-sm" onClick={exportExcel} disabled={txns.length === 0}>⬇ Download Excel</button>
      </div>
      <div className="bulk-bar">
        <label className="check-row small">
          <input type="checkbox" checked={allPicked} disabled={manualIds.length === 0}
            onChange={() => setPicked(allPicked ? [] : [...new Set(manualIds)])} />
          <span>Select all</span>
        </label>
        {picked.length > 0 && <button className="btn-danger btn-sm" onClick={removePicked}>Remove {picked.length} selected</button>}
      </div>
      <div className="statement-table" role="table">
        <div className="st-row st-header" role="row">
          <div className="st-details">Details</div>
          <div className="st-cash">Cash<br /><strong>{money(view === 'day' ? summary.cashNet : period.cashNet)}</strong></div>
          <div className="st-online">Online<br /><strong>{money(view === 'day' ? summary.onlineNet : period.onlineNet)}</strong></div>
        </div>
        {txns.map(t => (
          <div className={`st-row ${t.mode === 'online' && t.direction === 'in' && (t.source === 'phone' || confirmed.byTxn[t.id]) ? 'confirmed' : ''}`} role="row" key={t.id}>
            <div className="st-details">
              <div className="st-title">
                {t.source === 'manual' && (
                  <input type="checkbox" className="st-check" aria-label="Select entry" checked={picked.includes(t.entryId)} onChange={() => togglePick(t.entryId)} />
                )}
                {t.label}
                {t.source === 'bill' && <button className="link" onClick={() => navigate(`/bills/${t.billId}`)}>view bill</button>}
                {t.source === 'manual' && <button className="link" onClick={() => startEdit(t.entryId)}>edit</button>}
                {t.source === 'manual' && t.pendingLeft > 0 && <span className="pill warn">₹{t.pendingLeft.toLocaleString('en-IN')} pending</span>}
                {t.source === 'phone' && <button className="link" onClick={() => prefillFromPayment(t.phoneId)}>add details</button>}
                {/* Only a green mark when the phone notification arrived; nothing is shown while it hasn't */}
                {t.mode === 'online' && t.direction === 'in' && (t.source === 'phone' || confirmed.byTxn[t.id]) && (
                  <span className="pill ok" title={(t.source === 'phone' ? t.ref : confirmed.byTxn[t.id].ref) ? `UPI ref ${t.source === 'phone' ? t.ref : confirmed.byTxn[t.id].ref}` : 'Payment notification received'}>{t.source === 'phone' ? '✓ Received on phone' : '✓ Received'}</span>
                )}
              </div>
              <div className="muted small">
                {view !== 'day' ? `${parseKey(t.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} · ` : ''}
                {timeOf(t.time)}{t.subject ? ` · ${t.subject}` : ''}{t.note ? ` · ${t.note}` : ''}
              </div>
            </div>
            <div className={`st-cash ${t.direction}`}>{t.mode === 'cash' ? signed(t) : ''}</div>
            <div className={`st-online ${t.direction}`}>
              {t.mode === 'online' ? signed(t) : ''}
              {t.source === 'manual' && <button className="x" aria-label="Remove entry" onClick={() => removeEntry(t.entryId)}>✕</button>}
            </div>
          </div>
        ))}
        {txns.length === 0 && <div className="empty-state">Nothing recorded {view === 'day' ? 'for this day' : 'in this period'} yet.</div>}
        <div className="st-row st-footer" role="row">
          <div className="st-details">Total</div>
          <div className="st-cash"><strong>{money(txns.reduce((n, t) => n + (t.mode === 'cash' ? (t.direction === 'out' ? -t.amount : t.amount) : 0), 0))}</strong></div>
          <div className="st-online"><strong>{money(txns.reduce((n, t) => n + (t.mode === 'online' ? (t.direction === 'out' ? -t.amount : t.amount) : 0), 0))}</strong></div>
        </div>
      </div>
    </div>
  );

  // Give a payment that arrived on the phone a service, by entering it as a normal Day Book entry
  const prefillFromPayment = (phoneId) => {
    const p = confirmed.unmatched.find(x => x.id === phoneId);
    if (!p) return;
    setEditingId(null);
    setForm({ ...EMPTY_FORM, picked: ['Car wash'], amounts: { 'Car wash': String(p.amount) }, mode: 'online', note: p.ref ? `UPI ${p.ref}` : '' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const pendingCard = (pendingEntries.length > 0 || bills.count > 0) && (
    <div className="card">
      <h3>Pending</h3>
      {bills.receivable > 0 && (
        <div className="kv"><span>Unpaid sale bills</span>
          <strong className="warn-text">{money(bills.receivable)} <button className="link" onClick={() => navigate('/bills?filter=unpaid')}>open</button></strong></div>
      )}
      {bills.payable > 0 && (
        <div className="kv"><span>Unpaid purchase bills (to pay)</span>
          <strong className="warn-text">{money(bills.payable)} <button className="link" onClick={() => navigate('/bills?filter=unpaid')}>open</button></strong></div>
      )}
      {pendingEntries.map(e => (
        <div className="pending-row" key={e.id}>
          <div>
            <div className="st-title">{e.service} <span className="pill warn">{money(e.pending)} pending</span></div>
            <div className="muted small">
              {parseKey(e.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} · total {money(e.amount)}, received {money(e.received)}
              {e.subject ? ` · ${e.subject}` : ''}{e.note ? ` · ${e.note}` : ''}
            </div>
          </div>
          <div className="actions-row" style={{ marginTop: 0 }}>
            <button className="btn-sm" onClick={() => collect(e, 'cash')}>Got cash</button>
            <button className="btn-sm" onClick={() => collect(e, 'online')}>Got online</button>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="page daybook">
      <div className="page-header">
        <div>
          <h1>Day Book</h1>
          <div className="muted">{periodLabel(view, date)}{view === 'day' && isToday ? ' · Today' : ''}</div>
        </div>
        <div className="date-nav">
          <div className="segmented tabs" role="group" aria-label="Period">
            {['day', 'week', 'month', 'year'].map(v => (
              <button key={v} className={view === v ? 'active' : ''} onClick={() => changeView(v)}>{v[0].toUpperCase() + v.slice(1)}</button>
            ))}
          </div>
          <button onClick={() => changeDate(shiftPeriod(view, date, -1))} aria-label="Previous">‹</button>
          {view === 'day' && <input type="date" value={date} onChange={e => e.target.value && changeDate(e.target.value)} />}
          <button onClick={() => changeDate(shiftPeriod(view, date, 1))} aria-label="Next">›</button>
          {date !== DayBookService.today() && <button className="ghost" onClick={() => changeDate(DayBookService.today())}>Today</button>}
        </div>
      </div>

      {view === 'day' ? (
        <>
          <div className="cash-hero">
            <div className="hero-main">
              <div className="hero-label">Cash in counter</div>
              <div className="hero-value">{money(summary.counter)}</div>
              <div className="hero-sub">
                Start {money(summary.opening)} + in {money(summary.cashIn)} − out {money(summary.cashOut)}
                {summary.takenHome > 0 ? ` − taken home ${money(summary.takenHome)}` : ''}
              </div>
            </div>
            <div className="hero-side">
              <div className="hero-label">Online received</div>
              <div className="hero-value online">{money(summary.onlineNet)}</div>
              <div className="hero-sub">UPI / bank / cheque</div>
            </div>
            <div className="hero-side">
              <div className="hero-label">Pending to collect</div>
              <div className="hero-value warn-text">{money(pendingTotal + bills.receivable)}</div>
              <div className="hero-sub">day total {money(summary.cashNet + summary.onlineNet)}</div>
            </div>
          </div>

          <div className="daybook-grid">
            <form className="card" onSubmit={submitEntry}>
              <h3>{editingId ? 'Edit entry' : 'Add work / payment'}</h3>
              <div className="chips">
                {formServices.map(s => (
                  <button type="button" key={s} className={`chip ${form.picked.includes(s) ? 'active' : ''}`} onClick={() => pickService(s)}>{s}</button>
                ))}
                <button type="button" className="chip ghost" onClick={addServiceName}>+ Add service</button>
              </div>
              {!editingId && <div className="hint" style={{ marginTop: -6, marginBottom: 10 }}>Tap more than one if the customer took several services.</div>}
              {form.picked.includes('Other') && (
                <div className="form-row">
                  <label>What was it?</label>
                  <input value={form.custom} onChange={e => setField({ custom: e.target.value })} placeholder="e.g. valve, tube, tea" />
                </div>
              )}
              {form.picked.map(name => (
                <div className="form-row" key={name}>
                  <label>{name === 'Other' ? (form.custom.trim() || 'Other') : name} (₹)</label>
                  <input type="number" inputMode="decimal" min="0" value={form.amounts[name] || ''} onChange={e => setAmount(name, e.target.value)} placeholder="300" />
                </div>
              ))}
              {form.picked.length > 1 && <div className="kv"><span>Total</span><strong>{money(formTotal)}</strong></div>}
              <label className="check-row">
                <input type="checkbox" checked={form.full} onChange={e => setField({ full: e.target.checked })} />
                <span>{form.direction === 'out' ? 'Paid in full' : 'Received in full'}</span>
              </label>
              {!form.full && (
                <div className="form-row">
                  <label>{form.direction === 'out' ? 'Paid now (₹)' : 'Received now (₹)'}, the rest stays pending</label>
                  <input type="number" inputMode="decimal" min="0" value={form.received} onChange={e => setField({ received: e.target.value })} placeholder="0" />
                  <div className="hint">Pending: {money(Math.max(formTotal - (parseFloat(form.received) || 0), 0))}</div>
                </div>
              )}
              <div className="toggle-row">
                <div className="segmented" role="group" aria-label="Payment mode">
                  <button type="button" className={form.mode === 'cash' ? 'active' : ''} onClick={() => setField({ mode: 'cash' })}>Cash</button>
                  <button type="button" className={form.mode === 'online' ? 'active' : ''} onClick={() => setField({ mode: 'online' })}>Online</button>
                </div>
                <div className="segmented" role="group" aria-label="Direction">
                  <button type="button" className={form.direction === 'in' ? 'active' : ''} onClick={() => setField({ direction: 'in' })}>Received</button>
                  <button type="button" className={form.direction === 'out' ? 'active out' : ''} onClick={() => setField({ direction: 'out' })}>Paid out</button>
                </div>
              </div>
              <div className="form-row">
                <label>Subject (optional)</label>
                <input list="subject-list" value={form.subject} onChange={e => setField({ subject: e.target.value })} placeholder="Subject list will be added later" />
                <datalist id="subject-list">{subjectSuggestions.map(s => <option key={s} value={s} />)}</datalist>
              </div>
              <div className="form-row">
                <label>Note (vehicle no. / customer, optional)</label>
                <input value={form.note} onChange={e => setField({ note: e.target.value })} />
              </div>
              <div className="actions-row" style={{ marginTop: 4 }}>
                <button type="submit" className="btn-primary">{editingId ? 'Save changes' : 'Add to Day Book'}</button>
                {editingId && <button type="button" onClick={cancelEdit}>Cancel</button>}
              </div>
              {editingId && <div className="hint">Money collected later on this entry is not changed here.</div>}
            </form>

            <div className="card">
              <h3>Counter cash</h3>
              <div className="kv"><span>Starting cash{summary.openingIsManual ? ' (set by hand)' : ' (from yesterday)'}</span><strong>{money(summary.opening)}</strong></div>
              <div className="kv"><span>Cash received</span><strong className="pos">{money(summary.cashIn)}</strong></div>
              <div className="kv"><span>Cash paid out</span><strong className="neg">{money(summary.cashOut)}</strong></div>
              <div className="actions-row">
                <button className="ghost" onClick={editOpening}>Change starting cash</button>
                {summary.openingIsManual && <button className="ghost" onClick={resetOpening}>Use yesterday's</button>}
              </div>
              <hr />
              <div className="form-row">
                <label>Cash taken home today (₹)</label>
                <div className="inline-input">
                  <input type="number" inputMode="decimal" min="0"
                    value={homeInput === null ? (summary.takenHome || '') : homeInput}
                    onChange={e => setHomeInput(e.target.value)} placeholder="0" />
                  <button className="btn-primary" type="button" onClick={saveHome}>Save</button>
                </div>
              </div>
              <div className="hint">What stays in the counter ({money(summary.counter)}) becomes tomorrow's starting cash.</div>
            </div>
          </div>

          {pendingCard}
          <div className="card">
            <h3>Show only</h3>
            {serviceChips}
          </div>
          {statement}
        </>
      ) : (
        <>
          <div className="cash-hero">
            <div className="hero-main">
              <div className="hero-label">Cash {filter.length ? '(selected services)' : ''}</div>
              <div className="hero-value">{money(period.cashNet)}</div>
              <div className="hero-sub">in {money(period.cashIn)} − out {money(period.cashOut)}{!filter.length ? ` · counter ${money(period.opening)} → ${money(period.closing)}` : ''}</div>
            </div>
            <div className="hero-side">
              <div className="hero-label">Online</div>
              <div className="hero-value online">{money(period.onlineNet)}</div>
              <div className="hero-sub">in {money(period.onlineIn)} − out {money(period.onlineOut)}</div>
            </div>
            <div className="hero-side">
              <div className="hero-label">Total</div>
              <div className="hero-value">{money(period.cashNet + period.onlineNet)}</div>
              <div className="hero-sub">pending from entries {money(period.pending)}</div>
            </div>
          </div>

          <div className="card">
            <h3>By service <span className="muted small">(tap one or more to see just those)</span></h3>
            {serviceChips}
            <div className="service-table">
              <div className="svc-row svc-head"><div>Service</div><div>Jobs</div><div>Cash</div><div>Online</div><div>Total</div><div>Pending</div></div>
              {Object.entries(period.byService).sort((a, b) => (b[1].cashIn + b[1].onlineIn) - (a[1].cashIn + a[1].onlineIn)).map(([name, r]) => (
                <div key={name} className={`svc-row ${filter.includes(name) ? 'sel' : ''}`} onClick={() => toggleService(name)}>
                  <div><strong>{name}</strong></div>
                  <div>{r.jobs}</div>
                  <div>{money(r.cashIn - r.cashOut)}</div>
                  <div>{money(r.onlineIn - r.onlineOut)}</div>
                  <div><strong>{money(r.cashIn + r.onlineIn - r.cashOut - r.onlineOut)}</strong></div>
                  <div className={r.pending > 0 ? 'warn-text' : ''}>{r.pending > 0 ? money(r.pending) : '–'}</div>
                </div>
              ))}
              {Object.keys(period.byService).length === 0 && <div className="empty-state">Nothing recorded in this period.</div>}
            </div>
          </div>

          <div className="card">
            <h3>{view === 'year' ? 'Month by month' : 'Day by day'}</h3>
            <Bars byDay={period.byDay} view={view} start={start} end={end} />
          </div>

          {pendingCard}
          {statement}
        </>
      )}
    </div>
  );
}

// Simple bars: total (cash + online) per day, or per month for a year
function Bars({ byDay, view, start, end }) {
  const rows = [];
  if (view === 'year') {
    const year = parseKey(start).getFullYear();
    for (let m = 0; m < 12; m++) rows.push({ label: new Date(year, m, 1).toLocaleDateString(undefined, { month: 'short' }), cash: 0, online: 0 });
    for (const [key, v] of Object.entries(byDay)) {
      const row = rows[parseKey(key).getMonth()];
      row.cash += v.cash; row.online += v.online;
    }
  } else {
    for (let key = start; key <= end; key = shiftDate(key, 1)) {
      const v = byDay[key] || { cash: 0, online: 0 };
      rows.push({ label: String(parseKey(key).getDate()), cash: v.cash, online: v.online });
    }
  }
  const max = Math.max(1, ...rows.map(r => Math.abs(r.cash) + Math.abs(r.online)));
  return (
    <div className="bars" style={{ gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))` }}>
      {rows.map((r, i) => (
        <div className="bar-col" key={i} title={`${r.label}: cash ${money(r.cash)}, online ${money(r.online)}`}>
          <div className="bar-stack" style={{ height: `${Math.round(((Math.abs(r.cash) + Math.abs(r.online)) / max) * 100)}%` }}>
            <div className="bar-online" style={{ flex: Math.abs(r.online) }} />
            <div className="bar-cash" style={{ flex: Math.abs(r.cash) }} />
          </div>
          <div className="bar-label">{r.label}</div>
        </div>
      ))}
    </div>
  );
}
