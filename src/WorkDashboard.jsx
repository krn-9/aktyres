import { useState, useEffect } from 'react';
import { DayBookService } from './services/dataService';
import { parseKey, shiftDate, periodRange, shiftPeriod, periodLabel } from './periods';

const money = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN')}`;
const VIEWS = [['day', 'Today'], ['week', 'Week'], ['month', 'Month'], ['year', 'Year']];

// How much work was done: jobs per service for a day, week, month or year,
// with what they were worth and how they were paid
export default function WorkDashboard({ navigate }) {
  const [view, setView] = useState('day');
  const [date, setDate] = useState(DayBookService.today());
  const [followToday, setFollowToday] = useState(true);   // moves on to the new day by itself after midnight
  const [selected, setSelected] = useState(null);   // service whose jobs are listed below
  const [, refresh] = useState(0);

  useEffect(() => {
    const handler = () => refresh(n => n + 1);
    window.addEventListener('dataChanged', handler);
    return () => window.removeEventListener('dataChanged', handler);
  }, []);

  const [start, end] = periodRange(view, date);
  const report = DayBookService.getWorkReport(start, end);
  const isCurrent = date === DayBookService.today();
  // latest first
  const chosenJobs = selected ? report.jobs.filter(j => j.service === selected).slice().sort((a, b) => new Date(b.time) - new Date(a.time)) : [];
  const chosenRow = selected ? report.rows.find(r => r.service === selected) : null;

  const changeView = (next) => { setView(next); setSelected(null); };
  const changeDate = (next) => { setDate(next); setSelected(null); setFollowToday(next === DayBookService.today()); };

  useEffect(() => {
    const rollOver = () => {
      const t = DayBookService.today();
      if (followToday && t !== date) { setDate(t); setSelected(null); }
    };
    const timer = setInterval(rollOver, 30000);
    document.addEventListener('visibilitychange', rollOver);
    window.addEventListener('focus', rollOver);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', rollOver);
      window.removeEventListener('focus', rollOver);
    };
  }, [followToday, date]);

  const exportExcel = async () => {
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();
      const summary = [['Service', 'Jobs', 'Value (₹)', 'Cash (₹)', 'Online (₹)', 'Pending (₹)']]
        .concat(report.rows.map(r => [r.service, r.jobs, r.amount, r.cash, r.online, r.pending]))
        .concat([['Total', report.totals.jobs, report.totals.amount, report.totals.cash, report.totals.online, report.totals.pending]]);
      const list = [['Date', 'Time', 'Service', 'Details', 'Subject', 'Value (₹)', 'Cash (₹)', 'Online (₹)', 'Pending (₹)']]
        .concat(report.jobs.map(j => [j.date, new Date(j.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), j.service, j.note, j.subject, j.amount, j.cash, j.online, j.pending]));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), 'Work done');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(list), 'Jobs');
      XLSX.writeFile(wb, `work-done-${view}-${start}${end !== start ? `_to_${end}` : ''}.xlsx`);
    } catch (err) {
      alert('Could not create the file: ' + (err.message || 'unknown error'));
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <div className="muted">Work done · {periodLabel(view, date)}{view === 'day' && isCurrent ? ' · Today' : ''}</div>
        </div>
        <div className="date-nav">
          <div className="segmented tabs" role="group" aria-label="Period">
            {VIEWS.map(([key, label]) => (
              <button key={key} className={view === key ? 'active' : ''} onClick={() => changeView(key)}>{label}</button>
            ))}
          </div>
          <button onClick={() => changeDate(shiftPeriod(view, date, -1))} aria-label="Previous">‹</button>
          <button onClick={() => changeDate(shiftPeriod(view, date, 1))} aria-label="Next">›</button>
          {!isCurrent && <button className="ghost" onClick={() => changeDate(DayBookService.today())}>Today</button>}
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card"><div className="stat-value">{report.totals.jobs}</div><div className="stat-label">Jobs done</div></div>
        <div className="stat-card"><div className="stat-value">{money(report.totals.amount)}</div><div className="stat-label">Value</div></div>
        <div className="stat-card"><div className="stat-value">{money(report.totals.cash)}</div><div className="stat-label">Cash</div></div>
        <div className="stat-card"><div className="stat-value online-text">{money(report.totals.online)}</div><div className="stat-label">Online</div></div>
        <div className={`stat-card ${report.totals.pending > 0 ? 'warning' : ''}`}><div className="stat-value">{money(report.totals.pending)}</div><div className="stat-label">Pending</div></div>
      </div>

      <div className="card">
        <div className="statement-head">
          <h3>Work done by service</h3>
          <button className="btn-sm" onClick={exportExcel} disabled={report.rows.length === 0}>⬇ Download Excel</button>
        </div>
        {report.rows.length === 0 && <div className="empty-state">No work recorded {view === 'day' ? 'for this day' : 'in this period'} yet.</div>}
        <div className="work-tiles">
          {report.rows.map(r => (
            <button key={r.service} className={`work-tile ${selected === r.service ? 'active' : ''}`} onClick={() => setSelected(selected === r.service ? null : r.service)}>
              <div className="work-count">{r.jobs}</div>
              <div className="work-name">{r.service}</div>
              <div className="muted small">value {money(r.amount)}</div>
              <div className="muted small">cash {money(r.cash)} · online {money(r.online)}</div>
              {r.pending > 0 && <div className="pill warn" style={{ marginLeft: 0, marginTop: 4 }}>{money(r.pending)} pending</div>}
            </button>
          ))}
        </div>
      </div>

      {view !== 'day' && report.totals.jobs > 0 && (
        <div className="card">
          <h3>{view === 'year' ? 'Jobs per month' : 'Jobs per day'}</h3>
          <JobBars perDay={report.perDay} view={view} start={start} end={end} />
        </div>
      )}

      {selected && (
        <div className="card">
          <div className="statement-head">
            <h3>{selected}: {chosenRow ? `${chosenRow.jobs} ${chosenRow.jobs === 1 ? 'job' : 'jobs'}` : ''}</h3>
            <button className="ghost btn-sm" onClick={() => setSelected(null)}>Close ✕</button>
          </div>
          <div className="statement-table" role="table">
            <div className="job-row job-head" role="row">
              <div>When</div><div>Details</div><div>Value</div><div>Cash</div><div>Online</div><div>Pending</div>
            </div>
            {chosenJobs.map((j, i) => (
              <div className="job-row" role="row" key={`${j.entryId || j.billId || 'p'}-${i}`}>
                <div>
                  {parseKey(j.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                  <div className="muted small">{new Date(j.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                </div>
                <div>
                  {j.subject && <strong>{j.subject}</strong>}
                  <div className="muted small">{j.note || (j.subject ? '' : '–')}</div>
                  {j.source === 'bill' && <button className="link" style={{ padding: 0 }} onClick={() => navigate(`/bills/${j.billId}`)}>view bill</button>}
                </div>
                <div>{money(j.amount)}</div>
                <div>{j.cash ? money(j.cash) : '–'}</div>
                <div>{j.online ? money(j.online) : '–'}</div>
                <div className={j.pending > 0 ? 'warn-text' : ''}>{j.pending > 0 ? money(j.pending) : '–'}</div>
              </div>
            ))}
            {chosenRow && (
              <div className="job-row job-foot" role="row">
                <div>Total</div><div />
                <div>{money(chosenRow.amount)}</div><div>{money(chosenRow.cash)}</div><div>{money(chosenRow.online)}</div><div>{money(chosenRow.pending)}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Bars showing how many jobs were done each day (or each month, for a year)
function JobBars({ perDay, view, start, end }) {
  const rows = [];
  if (view === 'year') {
    const year = parseKey(start).getFullYear();
    for (let m = 0; m < 12; m++) rows.push({ label: new Date(year, m, 1).toLocaleDateString(undefined, { month: 'short' }), jobs: 0 });
    for (const [key, n] of Object.entries(perDay)) rows[parseKey(key).getMonth()].jobs += n;
  } else {
    for (let key = start; key <= end; key = shiftDate(key, 1)) rows.push({ label: String(parseKey(key).getDate()), jobs: perDay[key] || 0 });
  }
  const max = Math.max(1, ...rows.map(r => r.jobs));
  return (
    <div className="bars" style={{ gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))` }}>
      {rows.map((r, i) => (
        <div className="bar-col" key={i} title={`${r.label}: ${r.jobs} jobs`}>
          <div className="bar-num">{r.jobs || ''}</div>
          <div className="bar-stack" style={{ height: `${Math.round((r.jobs / max) * 80)}%` }}>
            <div className="bar-online" style={{ flex: 1 }} />
          </div>
          <div className="bar-label">{r.label}</div>
        </div>
      ))}
    </div>
  );
}
