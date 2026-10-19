import { useState, useEffect } from 'react';
import { DayBookService } from './services/dataService';

const SERVICES = ['Car wash', 'Puncture', 'Air', 'Nitrogen', 'Tyre sale', 'Alignment', 'Balancing', 'Other'];

const money = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN')}`;
const timeOf = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

function shiftDate(date, days) {
  const [y, m, d] = date.split('-').map(Number);
  return DayBookService.dateKey(new Date(y, m - 1, d + days));
}

function prettyDate(date) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

// The shop's daily book: cash in the counter, work done today, and how each payment arrived
export default function DayBook({ navigate }) {
  const [date, setDate] = useState(DayBookService.today());
  const [, refresh] = useState(0);
  const [service, setService] = useState('Car wash');
  const [custom, setCustom] = useState('');
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState('cash');
  const [direction, setDirection] = useState('in');
  const [note, setNote] = useState('');
  const [homeInput, setHomeInput] = useState(null); // null = show the saved value

  // Re-render when entries, bills or payments change (including changes arriving from other devices)
  useEffect(() => {
    const handler = () => refresh(n => n + 1);
    window.addEventListener('dataChanged', handler);
    return () => window.removeEventListener('dataChanged', handler);
  }, []);

  const changeDate = (next) => { setDate(next); setHomeInput(null); };

  const summary = DayBookService.getSummary(date);
  const txns = DayBookService.getTransactions(date);
  const day = DayBookService.getDay(date);
  const isToday = date === DayBookService.today();

  const addEntry = (e) => {
    e.preventDefault();
    const value = parseFloat(amount);
    if (!(value > 0)) { alert('Enter the amount'); return; }
    const name = service === 'Other' ? (custom.trim() || 'Other') : service;
    DayBookService.addEntry({ date, service: name, amount: value, mode, direction, note: note.trim() });
    setAmount('');
    setNote('');
    setCustom('');
  };

  const removeEntry = (id) => {
    if (confirm('Remove this entry?')) DayBookService.deleteEntry(id);
  };

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

  const signed = (t) => (t.direction === 'out' ? `− ${money(t.amount)}` : `+ ${money(t.amount)}`);

  return (
    <div className="page daybook">
      <div className="page-header">
        <div>
          <h1>Day Book</h1>
          <div className="muted">{prettyDate(date)}{isToday ? ' · Today' : ''}</div>
        </div>
        <div className="date-nav">
          <button onClick={() => changeDate(shiftDate(date, -1))} aria-label="Previous day">‹</button>
          <input type="date" value={date} onChange={e => e.target.value && changeDate(e.target.value)} />
          <button onClick={() => changeDate(shiftDate(date, 1))} aria-label="Next day">›</button>
          {!isToday && <button className="ghost" onClick={() => changeDate(DayBookService.today())}>Today</button>}
        </div>
      </div>

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
          <div className="hero-label">Day total</div>
          <div className="hero-value">{money(summary.cashNet + summary.onlineNet)}</div>
          <div className="hero-sub">cash {money(summary.cashNet)} + online {money(summary.onlineNet)}</div>
        </div>
      </div>

      <div className="daybook-grid">
        <form className="card" onSubmit={addEntry}>
          <h3>Add work / payment</h3>
          <div className="chips">
            {SERVICES.map(s => (
              <button type="button" key={s} className={`chip ${service === s ? 'active' : ''}`} onClick={() => setService(s)}>{s}</button>
            ))}
          </div>
          {service === 'Other' && (
            <div className="form-row">
              <label>What was it?</label>
              <input value={custom} onChange={e => setCustom(e.target.value)} placeholder="e.g. valve, tube, tea" />
            </div>
          )}
          <div className="form-row">
            <label>Amount (₹)</label>
            <input type="number" inputMode="decimal" min="0" value={amount} onChange={e => setAmount(e.target.value)} placeholder="300" />
          </div>
          <div className="toggle-row">
            <div className="segmented" role="group" aria-label="Payment mode">
              <button type="button" className={mode === 'cash' ? 'active' : ''} onClick={() => setMode('cash')}>Cash</button>
              <button type="button" className={mode === 'online' ? 'active' : ''} onClick={() => setMode('online')}>Online</button>
            </div>
            <div className="segmented" role="group" aria-label="Direction">
              <button type="button" className={direction === 'in' ? 'active' : ''} onClick={() => setDirection('in')}>Received</button>
              <button type="button" className={direction === 'out' ? 'active out' : ''} onClick={() => setDirection('out')}>Paid out</button>
            </div>
          </div>
          <div className="form-row">
            <label>Note (vehicle no. / customer, optional)</label>
            <input value={note} onChange={e => setNote(e.target.value)} />
          </div>
          <button type="submit" className="btn-primary wide">Add to Day Book</button>
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

      <div className="card statement">
        <div className="statement-head">
          <h3>Statement</h3>
          <div className="muted">{txns.length} {txns.length === 1 ? 'entry' : 'entries'}</div>
        </div>
        <div className="statement-table" role="table">
          <div className="st-row st-header" role="row">
            <div className="st-details">Details</div>
            <div className="st-cash">Cash<br /><strong>{money(summary.cashNet)}</strong></div>
            <div className="st-online">Online<br /><strong>{money(summary.onlineNet)}</strong></div>
          </div>
          {txns.map(t => (
            <div className="st-row" role="row" key={t.id}>
              <div className="st-details">
                <div className="st-title">
                  {t.label}
                  {t.source === 'bill' && <button className="link" onClick={() => navigate(`/bills/${t.billId}`)}>view bill</button>}
                </div>
                <div className="muted small">{timeOf(t.time)}{t.note ? ` · ${t.note}` : ''}</div>
              </div>
              <div className={`st-cash ${t.direction}`}>{t.mode === 'cash' ? signed(t) : ''}</div>
              <div className={`st-online ${t.direction}`}>
                {t.mode === 'online' ? signed(t) : ''}
                {t.source === 'manual' && <button className="x" aria-label="Remove entry" onClick={() => removeEntry(t.id)}>✕</button>}
              </div>
            </div>
          ))}
          {txns.length === 0 && <div className="empty-state">Nothing recorded for this day yet.</div>}
          <div className="st-row st-footer" role="row">
            <div className="st-details">Total</div>
            <div className="st-cash"><strong>{money(summary.cashNet)}</strong></div>
            <div className="st-online"><strong>{money(summary.onlineNet)}</strong></div>
          </div>
        </div>
      </div>
    </div>
  );
}
