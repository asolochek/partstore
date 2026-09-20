// Copyright (C) 2026 Aaron Solochek. Licensed under the GNU GPL v3; see LICENSE.
// Getting label PDFs from the server and to the printer, shared by the grid and the drawer map. Expects the page's status(text).
// direct printing goes through the server, which hands the PDF to helper/print-helper.py on the PC with the printer; the
// choice of queues lives in this browser
const HS = { get() { try { return JSON.parse(localStorage.getItem('helper') || '{}'); } catch (e) { return {}; } }, set(v) { try { localStorage.setItem('helper', JSON.stringify(v)); } catch (e) {} } };
// the printer queue for each label size: { "9x50": name, "18x50": name, … } (older settings had one for drawers and one for bins)
const queues = () => { const h = HS.get(); return h.queues || { '9x50': h.printer || '', '18x50': h.printerBin || '' }; };
async function sendToPrinter(blob, n, size) {
  const printer = queues()[size];
  if (!printer) { alert(`No printer queue is set for ${size.replace('x', ' × ')} mm labels (Printer…). Downloading the PDF instead.`); return false; }
  status(`sending ${n} label${n == 1 ? '' : 's'} to ${printer}…`);
  try {
    const r = await fetch(`/api/print?printer=${encodeURIComponent(printer)}&pages=${n}`, { method: 'POST', headers: { 'Content-Type': 'application/pdf' }, body: blob });
    const j = await r.json();
    if (r.status === 503) { alert(j.error + ' Downloading the PDF instead.'); return false; }
    if (!r.ok) { alert('Print helper: ' + (j.error || r.status)); status('print failed'); return true; }
    status(`printed ${j.pages} label${j.pages == 1 ? '' : 's'} on ${printer}`); return true;
  } catch (e) { alert('Could not send the labels to the server. Downloading the PDF instead.'); return false; }
}
// one request can span several groups of labels (a tape colour and width at one length; each cabinet or box sets its own): the
// server answers with the first and names the rest in X-Groups, which are fetched one by one. Returns the first response (for its X-Bins), or null on failure
async function labelsBySize(body) {
  const ask = b => fetch('/api/labels', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
  const r = await ask(body);
  if (!r.ok) { status(''); alert((await r.json()).error || 'failed'); return null; }
  if (r.status === 204) return r;
  const first = r.headers.get('X-Group'), rest = (r.headers.get('X-Groups') || '').split(',').filter(z => z && z !== first);
  await deliver(r);
  for (const group of rest) { const rz = await ask({ ...body, group }); if (!rz.ok) { status(''); alert((await rz.json()).error || 'failed'); return null; } await deliver(rz); }
  return r;
}
// the labels a request names, then those of the bins it touches: the server lists them in X-Bins and they follow as a second
// request (onlyNew: just the unprinted ones)
async function printLabels(body, onlyNew) {
  status('rendering…');
  const r = await labelsBySize(body); if (!r) return;
  const bins = (r.headers.get('X-Bins') || '').split(',').filter(Boolean);
  if (bins.length) await labelsBySize({ bins, only: onlyNew ? 'new' : undefined });
}
// delivers one PDF: to the helper's printer queue for that tape, or as a download. The tape in the printer cannot be
// queried, so a direct print first asks for that tape to be loaded; Cancel skips the labels of that size.
async function deliver(r) {
  const n = r.headers.get('X-Label-Count'), tape = r.headers.get('X-Tape') || '9', size = r.headers.get('X-Size') || `${tape}x50`, colour = r.headers.get('X-Tape-Name') || 'black on white'; const blob = await r.blob();
  if (HS.get().direct) {
    if (!confirm(`${n} label${n == 1 ? '' : 's'}, ${size.replace('x', ' × ')} mm, on ${tape} mm ${colour} tape. Load the ${tape} mm ${colour} tape, then OK — or Cancel to skip these.`)) { status(`${tape} mm labels skipped`); return true; }
    if (await sendToPrinter(blob, n, size)) return true;
  }
  // download rather than open: a pop-up would be blocked, and the file is what gets printed anyway
  const name = (/filename="([^"]+)"/.exec(r.headers.get('Content-Disposition') || '') || [])[1] || 'labels.pdf';
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  status(`${n} ${size.replace('x', ' × ')} mm ${colour === 'black on white' ? '' : colour + ' '}label${n == 1 ? '' : 's'} → ${name}`);
  return false;
}
