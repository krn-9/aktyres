// Builds the Day Book PDF (statement + totals + by-service summary). Pure: returns a jsPDF document.
// The built-in PDF fonts have no rupee sign, so amounts are written as "Rs.".
const rs = (n) => `Rs. ${(Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export async function buildDayBookPdf({ shopName, title, subtitle, filterLabel, txns, showDate, cashTotal, onlineTotal, serviceRows }) {
  const generatedAt = new Date().toLocaleString();
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, H = 297, M = 12;
  const cols = [
    { key: 'when', label: showDate ? 'Date / time' : 'Time', x: M, w: 26 },
    { key: 'details', label: 'Details', x: M + 26, w: 56 },
    { key: 'note', label: 'Subject / note', x: M + 82, w: 42 },
    { key: 'cash', label: 'Cash', x: M + 124, w: 31, right: true },
    { key: 'online', label: 'Online', x: M + 155, w: 31, right: true },
  ];
  const signed = (t) => (t.direction === 'out' ? `- ${rs(t.amount)}` : rs(t.amount));
  let y = M;

  const header = () => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(26, 33, 41);
    doc.text(shopName || 'Tyre Shop', M, y + 5);
    doc.setFontSize(12); doc.text(title, M, y + 12);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(107, 107, 107);
    doc.text(subtitle + (filterLabel ? `   |   ${filterLabel}` : ''), M, y + 17);
    doc.text(`Generated ${generatedAt}`, W - M, y + 17, { align: 'right' });
    y += 22;
  };
  const columnHead = () => {
    doc.setFillColor(247, 247, 247); doc.rect(M, y, W - 2 * M, 8, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(107, 107, 107);
    for (const c of cols) doc.text(c.label.toUpperCase(), c.right ? c.x + c.w : c.x + 2, y + 5.3, { align: c.right ? 'right' : 'left' });
    y += 8;
  };
  const newPage = () => { doc.addPage(); y = M; header(); columnHead(); };

  header();
  // totals strip
  doc.setDrawColor(230, 230, 230); doc.rect(M, y, W - 2 * M, 16);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(107, 107, 107);
  doc.text('CASH TOTAL', M + 4, y + 5); doc.text('ONLINE TOTAL', M + 70, y + 5); doc.text('ENTRIES', M + 136, y + 5);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(26, 33, 41);
  doc.text(rs(cashTotal), M + 4, y + 12); doc.text(rs(onlineTotal), M + 70, y + 12); doc.text(String(txns.length), M + 136, y + 12);
  y += 22;
  columnHead();

  for (const t of txns) {
    const when = (showDate ? `${t.date}\n` : '') + new Date(t.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const tags = [];
    if (t.source === 'manual' && t.pendingLeft > 0) tags.push(`${rs(t.pendingLeft)} pending`);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    const details = doc.splitTextToSize(t.label, cols[1].w - 3);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    const tagLines = tags.length ? doc.splitTextToSize(tags.join('  '), cols[1].w - 3) : [];
    const noteLines = doc.splitTextToSize([t.subject, t.note].filter(Boolean).join(' / ') || '-', cols[2].w - 3);
    const whenLines = when.split('\n');
    const lines = Math.max(details.length + tagLines.length, noteLines.length, whenLines.length);
    const h = Math.max(9, lines * 4 + 4);
    if (y + h > H - 18) newPage();

    doc.setTextColor(60, 60, 60); doc.setFontSize(8);
    doc.text(whenLines, cols[0].x + 2, y + 5);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(26, 33, 41);
    doc.text(details, cols[1].x + 2, y + 5);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(21, 128, 61);
    if (tagLines.length) doc.text(tagLines, cols[1].x + 2, y + 5 + details.length * 4);
    doc.setTextColor(107, 107, 107);
    doc.text(noteLines, cols[2].x + 2, y + 5);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.setTextColor(t.direction === 'out' ? 220 : 21, t.direction === 'out' ? 38 : 128, t.direction === 'out' ? 38 : 61);
    if (t.mode === 'cash') doc.text(signed(t), cols[3].x + cols[3].w, y + 5, { align: 'right' });
    else doc.text(signed(t), cols[4].x + cols[4].w, y + 5, { align: 'right' });
    doc.setDrawColor(230, 230, 230); doc.line(M, y + h, W - M, y + h);
    y += h;
  }
  if (txns.length === 0) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(107, 107, 107);
    doc.text('Nothing recorded.', M + 2, y + 8); y += 12;
  }
  if (y + 12 > H - 18) newPage();
  doc.setFillColor(247, 247, 247); doc.rect(M, y, W - 2 * M, 9, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(26, 33, 41);
  doc.text('Total', cols[1].x + 2, y + 6);
  doc.text(rs(cashTotal), cols[3].x + cols[3].w, y + 6, { align: 'right' });
  doc.text(rs(onlineTotal), cols[4].x + cols[4].w, y + 6, { align: 'right' });
  y += 16;

  // by-service summary
  if (serviceRows && serviceRows.length > 2) {
    if (y + 30 > H - 18) newPage();
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(26, 33, 41);
    doc.text('By service', M, y + 4); y += 8;
    const sc = [{ l: 'Service', x: M, w: 62 }, { l: 'Jobs', x: M + 62, w: 16, r: true }, { l: 'Cash', x: M + 78, w: 36, r: true }, { l: 'Online', x: M + 114, w: 36, r: true }, { l: 'Pending', x: M + 150, w: 36, r: true }];
    doc.setFillColor(247, 247, 247); doc.rect(M, y, W - 2 * M, 7, 'F');
    doc.setFontSize(8); doc.setTextColor(107, 107, 107);
    for (const c of sc) doc.text(c.l.toUpperCase(), c.r ? c.x + c.w : c.x + 2, y + 4.8, { align: c.r ? 'right' : 'left' });
    y += 7;
    for (const [i, r] of serviceRows.slice(1).entries()) {
      if (y + 8 > H - 18) { newPage(); }
      const last = i === serviceRows.length - 2;
      doc.setFont('helvetica', last ? 'bold' : 'normal'); doc.setFontSize(9); doc.setTextColor(26, 33, 41);
      const cells = [String(r[0]), String(r[1]), rs(r[3]), rs(r[4]), r[5] > 0 ? rs(r[5]) : '-'];
      sc.forEach((c, k) => doc.text(cells[k], c.r ? c.x + c.w : c.x + 2, y + 5.5, { align: c.r ? 'right' : 'left' }));
      doc.setDrawColor(230, 230, 230); doc.line(M, y + 8, W - M, y + 8);
      y += 8;
    }
  }

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(154, 154, 154);
    doc.text(`${shopName || 'Tyre Shop'} - Day Book`, M, H - 8);
    doc.text(`Page ${p} of ${pages}`, W - M, H - 8, { align: 'right' });
  }
  return doc;
}
