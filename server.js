// Copyright (C) 2026 Aaron Solochek. Licensed under the GNU GPL v3; see LICENSE.
// Partstore: a small web app for the fastener cabinets. Serves the grid, stores the JSON model, renders drawer labels as PDF
// and relays print jobs to the print helper on the PC with the label printer.
// Run:  node server.js            (port 8093 unless PORT is set; bind to localhost, Apache proxies and authenticates)
// Label rendering reuses ~/binner-docs/plan-src/labels.js (Futura, 360 dpi): drawer labels on 9 mm tape, bin labels on 18 mm.
const path = require('path'), fs = require('fs'), crypto = require('crypto');
process.env.NODE_PATH = path.join(__dirname, 'node_modules');   // labels.js finds sharp and pdf-lib through NODE_PATH
const express = require('express');
const L = require('/home/aarons/binner-docs/plan-src/labels.js');
const I = require('./icons.js'), M = require('./model.js');
const DATA = process.env.PARTSTORE_DATA || process.env.FASTENERS_DATA || path.join(__dirname, 'data', 'fasteners.json');   // PARTSTORE_DATA: another data file (tests)
const PRINTED = process.env.PARTSTORE_PRINTED || process.env.FASTENERS_PRINTED || path.join(__dirname, 'data', 'printed.json');   // { "<page>|<cell key>": "<label text + types>", "bin|B3": "..." } = what has been printed
const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'static')));
app.use('/helper', express.static(path.join(__dirname, 'helper'), { index: false }));   // the Windows print helper, downloadable from the page's host
app.get('/model.js', (req, res) => res.sendFile(path.join(__dirname, 'model.js')));   // the page uses the same location logic as the server
let NOW = null;   // the model as last read: the label builders look up each location's label size in it
const load = () => NOW = JSON.parse(fs.readFileSync(DATA, 'utf8'));
const loadPrinted = () => fs.existsSync(PRINTED) ? JSON.parse(fs.readFileSync(PRINTED, 'utf8')) : {};
app.get('/api/data', (req, res) => res.json(load()));
// Saves carry the revision they were loaded from; a stale copy (another tab, or a model edit made here) is refused with the
// current data so the page can reload instead of overwriting it.
app.put('/api/data', (req, res) => {
  const d = req.body, cur = load();
  if (!d || !Array.isArray(d.pages)) return res.status(400).json({ error: 'bad model' });
  if ((d.rev || 0) !== (cur.rev || 0)) return res.status(409).json({ error: 'stale', data: cur });
  d.rev = (cur.rev || 0) + 1;
  fs.writeFileSync(DATA + '.tmp', JSON.stringify(d, null, 1)); fs.renameSync(DATA + '.tmp', DATA);
  res.json({ ok: true, rev: d.rev });
  notify(d.rev);
});
// GET /api/events: a server-sent event stream; every save announces the new revision, so other open pages reload
const listeners = new Set();
const notify = rev => { for (const r of listeners) r.write(`data: ${rev}\n\n`); };
app.get('/api/events', (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write(`data: ${load().rev || 0}\n\n`); listeners.add(res);
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);   // keeps proxies and browsers from closing an idle stream
  req.on('close', () => { clearInterval(ping); listeners.delete(res); });
});
// icons for the page: every base name, the pointed version of every head shape, and every screw variant in use anywhere
app.get('/api/icons', (req, res) => {
  const d = load(), names = new Set([...Object.keys(I.ALL), ...Object.keys(I.SHAPES).map(k => k + ':p')]);
  for (const page of d.pages) for (const c of Object.values(page.cells || {})) for (const t of c.types || []) names.add(t);
  res.json({ svg: Object.fromEntries([...names].map(k => [k, I.icon(k)])), labels: Object.fromEntries([...names].map(k => [k, I.label(k)])), groups: I.GROUPS, washers: I.WASHER_NAMES });
});
// one icon on demand (a variant the page just created)
app.get('/api/icon', (req, res) => res.json({ name: req.query.name, svg: I.icon(req.query.name), label: I.label(req.query.name) }));
app.get('/api/printed', (req, res) => res.json(loadPrinted()));

// ---- what a location holds ----
// every populated cell of every page, split by location and grouped by it: cells of ANY page that share a drawer half or a
// bin are one label (wood and sheet metal #8 × 1/2″ in one drawer print as one "#8 × 1/2″" with both icons). A portion
// with no location is a group of its own, and a list line always prints on its own.
function allGroups(d) {
  const groups = new Map(), singles = [];
  for (const page of d.pages) for (const pt of M.portions(page, M.populated(page))) {
    pt.page = page;
    const s = M.portionSlot(pt); if (!s || M.isList(page)) { singles.push([pt]); continue; }
    if (!groups.has(s)) groups.set(s, []); groups.get(s).push(pt);
  }
  return [...singles, ...groups.values()];
}
const groupSlot = g => M.portionSlot(g[0]);
// what sets this portion apart from the rest of its cell: the drives / materials of its items when the head type's other
// items live elsewhere, as a short list ("SS/zinc", "Phillips"); "overflow" is added by the caller. The icons already
// say which types are here, so type names are left out.
function qualifier(pt) {
  const all = M.items(pt.page, pt.key), ds = new Set(), ms = new Set();
  const u = (list, f) => [...new Set(list.map(f).filter(Boolean))];
  for (const t of pt.types) {
    const mine = pt.items.filter(i => i.type === t), whole = all.filter(i => i.type === t);
    if (mine.length >= whole.length) continue;
    const md = u(mine, i => i.drive), mm = u(mine, i => i.material);
    if (md.length && md.length < u(whole, i => i.drive).length) md.forEach(x => ds.add(M.DRIVE_SHORT[x] || x));
    if (mm.length && mm.length < u(whole, i => i.material).length) mm.forEach(x => ms.add(M.matShort(x)));
  }
  return { drives: [...ds], materials: [...ms] };
}
// the qualifier line of a group: the union over its portions, drives then materials, then "overflow" if any portion is one
function groupQual(group) {
  const ds = new Set(), ms = new Set(); let over = false;
  for (const pt of group) { const q = qualifier(pt); q.drives.forEach(x => ds.add(x)); q.materials.forEach(x => ms.add(x)); over = over || pt.overflow; }
  return [[...ds].join('/'), [...ms].join('/'), over ? 'overflow' : ''].filter(Boolean).join(' ');
}
// the text of one location's label: { pn, value, qual, types, sig }
// cells that share a location print as ONE label: "#10 Washer" (washers + lock washers), "#4-40 Nut" (nuts + lock nuts),
// or for screws the size in the big slot and the lengths on the detail line; the icons are the union of the cells'
// a label of a non-default size says so in its signature, so changing a cabinet's label size makes its labels unprinted
function groupText(group) {
  const t = groupText0(group), c = group[0], def = M.LABEL_DEFAULT[c.kind === 'bin' ? 'bin' : 'drawer'], z = M.labelSpec(NOW, c);
  return z.tape === def.tape && z.len === def.len ? t : { ...t, sig: `${t.sig}|${z.tape}x${z.len}` };
}
function groupText0(group) {
  const types = [...new Set(group.flatMap(pt => pt.types || []))];
  const qual = groupQual(group);
  if (group.length === 1) { const pt = group[0], pn = M.cellText(pt.page, pt.key), value = M.isList(pt.page) ? (M.listItem(pt.page, pt.key)?.detail || '') : ''; return { pn, value, qual, types, sig: `${pn}|${value}|${qual}|${types.join(',')}` }; }
  const pageIx = pg => group[0].page === pg ? 0 : 1;
  const cells = group.map(pt => { const [base, suffix] = pt.key.split('|'); const hw = M.HW.find(h => h[1] === suffix); return { k: pt.key, page: pt.page, suffix, base, row: pt.page.rows.find(r => r.id === base), isWasher: suffix.endsWith('washer'), item: hw ? hw[3] : M.lengthText(pt.page, +suffix), rowIx: pt.page.rows.findIndex(r => r.id === base), pageIx: pageIx(pt.page) }; });
  // reading order inside the label: page, rows in page order, lengths ascending, hardware after the lengths
  cells.sort((a, b) => (a.pageIx - b.pageIx) || (a.rowIx - b.rowIx) || ((isNaN(+a.suffix) ? 1e9 : +a.suffix) - (isNaN(+b.suffix) ? 1e9 : +b.suffix)));
  // the size text: thread sizes of one diameter merge their pitches ("#8-32/36", "M6×1/0.75"); different diameters are listed.
  // The same size on two pages (wood and sheet metal #8) is one size.
  const rowsIn = []; for (const c of cells) if (!c.isWasher && c.row && !rowsIn.some(r => r.label === c.row.label)) rowsIn.push(c.row);
  const dias = [...new Set(rowsIn.map(r => r.dia))], units = cells[0].page.units;
  let base;
  if (cells.every(c => c.isWasher)) base = [...new Set(cells.map(c => c.base))].join(' / ');
  else if (dias.length === 1 && rowsIn.length > 1) base = units === 'mm' ? `${dias[0]}×${rowsIn.map(r => r.pitch).join('/')}` : `${dias[0]}-${rowsIn.map(r => r.pitch).join('/')}`;
  else base = rowsIn.map(r => r.label).join(' / ');
  const items = [...new Set(cells.map(c => c.item))];   // one entry per length, however many rows or pages share it
  let pn, value = '';
  if (cells.every(c => c.isWasher)) pn = `${base} Washer`;
  else if (cells.every(c => c.suffix.endsWith('nut'))) pn = `${base} Nut`;
  else if (items.length === 1 && !cells.some(c => isNaN(+c.suffix))) pn = `${base} × ${items[0]}`;   // one length shared by the rows: a plain screw label
  else if (dias.length > 1) {   // several diameters with their own lengths: one "size × lengths" per row, the first one big
    const per = rowsIn.map(r => `${r.label} × ${[...new Set(cells.filter(c => c.row && c.row.label === r.label).map(c => c.item))].join('/')}`);
    pn = per[0]; value = per.slice(1).join('  ');
  }
  else { pn = base; value = items.join('  '); }
  return { pn, value, qual, types, sig: `${pn}|${value}|${qual}|${types.join(',')}` };
}
// a 9 mm drawer label for one location: big text, lengths and/or qualifier as detail, the icons on the right
// a long single detail line ("PEI/phenolic/PTFE") may be wrapped onto two lines at a slash or space, whichever keeps the icons larger
function wrap2(text, fs) {
  const parts = text.split(/(?<=[\/ ])/); let best = null;
  for (let i = 1; i < parts.length; i++) {
    const a = parts.slice(0, i).join('').replace(/[\/ ]$/, ''), b = parts.slice(i).join('');
    const w = Math.max(L.textWidth(a, fs), L.textWidth(b, fs)); if (!best || w < best.w) best = { a, b, w };
  }
  return best ? [best.a, best.b] : [text];
}
// the style of a label at a location: the drawer (one line) or bin (stacked) layout, scaled to the printable height of the
// tape set for that cabinet, at the length set for it. f = the scale; text never goes under 1.9 mm, the smallest size in use
function styleAt(c) {
  const kind = c.kind === 'bin' ? 'bin' : 'drawer', B = L.STYLE[kind], z = M.labelSpec(NOW, c), print = M.TAPES[z.tape], f = print / B.print;
  const S = { ...B, tape: z.tape, print, len: z.len };
  if (f !== 1) for (const k of ['pn', 'spec', 'pnX', 'pad', 'glyphH']) S[k] = +(B[k] * f).toFixed(2);
  if (f !== 1 && kind === 'bin') S.detX = S.pnX;
  S.pn = Math.max(S.pn, 1.9); S.spec = Math.max(S.spec, 1.9);
  return { S, f, kind, style: f === 1 && z.len === B.len ? null : S };
}
// on a label of a custom size the big line shrinks until it fits beside what must share the strip with it (reserve, mm);
// labels of the default size are left exactly as they have always printed
function fitPn(S, text, reserve) {
  const room = S.len - S.pad - S.pnX - reserve;
  while (S.pn > 1.9 && L.textWidth(text, S.pn) > room) S.pn = +(S.pn - 0.1).toFixed(2);
}
const sized = (v, f) => Math.max(1.9, +(v * f).toFixed(2));
function drawerLabel(group) {
  const { S, f, style } = styleAt(group[0]), t = groupText(group);
  const base = [t.value, t.qual].filter(Boolean);
  if (style) fitPn(S, t.pn, (t.types.length ? 3.0 * f + 1.5 : 0) + (base.length ? 2.5 * f + Math.max(...base.map(l => L.textWidth(l, sized(2.0, f)))) : 0));
  const detX = S.pnX + L.textWidth(t.pn, S.pn) + 2.5 * f;
  const freeFor = (lines, sp) => S.len - S.pad - 1.5 - Math.max(S.pnX + L.textWidth(t.pn, S.pn), ...lines.map(l => detX + L.textWidth(l, sp)));
  // candidates in order of preference: one line large, then two lines / smaller text; the first that keeps the icons ≥ ~3 mm wins
  const cands = [];
  if (base.length === 1) for (const sp of [3.0, 2.6, 2.3, 2.0].map(v => sized(v, f))) { cands.push({ lines: base, sp }); if (sp < sized(3.0, f) && base[0].length > 6) cands.push({ lines: wrap2(base[0], sp), sp }); }
  else if (base.length === 2) for (const sp of [2.6, 2.3, 2.0, 1.9].map(v => sized(v, f))) cands.push({ lines: base, sp });
  else cands.push({ lines: [], sp: null });
  let pick = null;
  for (const c of cands) { c.lay = I.layout(t.types, freeFor(c.lines, c.sp ?? S.spec), S.glyphH); if (!pick || c.lay.size > pick.lay.size + 1e-6) pick = c; if (c.lay.size >= Math.min(3.0 * f, S.glyphH / 2)) { pick = c; break; } }
  const extra = pick.lines.length ? { spec: pick.sp, detX, detCenter: pick.lines.length === 1 } : {};
  const isList = group.length === 1 && M.isList(group[0].page);
  return { kind: 'drawer', pn: t.pn, value: pick.lines[0] || '', specs: pick.lines[1] || '', pinout: null, glyphSvg: t.types.length ? I.icons(t.types, pick.lay.rows) : null, glyphMaxW: pick.lay.maxW, ...extra,
           generic: true, style, _tape: S.tape, _size: `${S.tape}x${S.len}`, _n: t.types.length || (isList ? 1 : 0), _sig: t.sig, _slot: groupSlot(group) };
}
// an 18 mm bin label: everything in the bin, from every page. One entry: the size big with its details under it; several:
// one line per entry at a size that fits (up to six lines)
function binEntries(groups, bin) { return groups.filter(g => groupSlot(g) === `B:${bin}`).map(g => ({ group: g, ...groupText(g) })); }
function binLabel(groups, bin) {
  const { S, f, style } = styleAt({ kind: 'bin', bin }), entries = binEntries(groups, bin);
  const types = [...new Set(entries.flatMap(e => e.types))];
  let lab;
  if (style && entries.length === 1) fitPn(S, entries[0].pn, types.length ? 3.0 * f + 2.5 : 1.0);
  if (entries.length === 1) lab = { pn: entries[0].pn, value: entries[0].value, specs: entries[0].qual, lines: [] };
  else {
    let lines = entries.map(e => [e.pn, e.value, e.qual].filter(Boolean).join('  '));
    if (lines.length > 6) { L.warnings.push(`bin ${bin}: ${lines.length} entries, only 6 fit`); lines = [...lines.slice(0, 5), `+${lines.length - 5} more`]; }
    lab = { pn: '', value: '', specs: '', lines, spec: sized([4.0, 4.0, 3.4, 2.8, 2.4, 2.0][lines.length - 1] || 2.0, f) };
  }
  const all = () => [lab.value, lab.specs, ...lab.lines].filter(Boolean);
  const freeFor = () => S.len - S.pad - 1.5 - Math.max(lab.pn ? S.pnX + L.textWidth(lab.pn, S.pn) : 0, ...all().map(l => S.detX + L.textWidth(l, lab.spec ?? S.spec)));
  let lay = I.layout(types, freeFor(), S.glyphH);
  while (lay.size < 3.0 * f && (lab.spec ?? S.spec) > sized(2.0, f)) { lab.spec = Math.max(sized(2.0, f), +(((lab.spec ?? S.spec) - 0.3 * f).toFixed(2))); lay = I.layout(types, freeFor(), S.glyphH); }
  return { kind: 'bin', ...lab, pinout: null, glyphSvg: types.length ? I.icons(types, lay.rows) : null, glyphMaxW: lay.maxW, generic: true, style, _tape: S.tape, _size: `${S.tape}x${S.len}`, _n: types.length || entries.length,
           _sig: entries.map(e => e.sig).join(';'), _slot: `B:${bin}`, _bin: bin, _entries: entries };
}
const allBins = d => [...new Set(d.pages.flatMap(p => M.bins(p)))].sort(M.binOrder);
// drawer spec: "12-16, 20, 30R, M3-5" -> predicate on (cabinet, drawer, half). A bare number matches both halves of a divided
// drawer; a term without a cabinet prefix (I, M, W) means `home`, the cabinet of the page the request came from
function drawerMatcher(spec, home) {
  const terms = String(spec).split(/[,\s]+/).filter(Boolean).map(t => {
    const m = /^([imwIMW])?(\d+)(?:-(\d+))?([rRfFbB])?$/.exec(t); if (!m) return null;
    const half = m[4] ? (/[fF]/.test(m[4]) ? 'front' : 'back') : null;
    return { cabinet: m[1] ? M.cabinetByPrefix(m[1]).id : (home || ''), lo: +m[2], hi: +(m[3] || m[2]), half };
  });
  if (terms.some(t => !t)) return null;
  return (cabinet, drawer, half) => { const n = +drawer; return terms.some(t => t.cabinet === (cabinet || '') && n >= t.lo && n <= t.hi && (!t.half || t.half === (half || ''))); };
}
// bin spec: "all" | ["B1", ...] | "B1, B3-5, A2-4, 7" -> list of bin ids (only ones that hold something); a bare number is a loose (B) bin
function binList(d, spec) {
  const have = allBins(d);
  if (spec === 'all') return have;
  if (Array.isArray(spec)) return have.filter(b => spec.includes(b));
  const want = new Set();
  for (const t of String(spec).split(/[,\s]+/).filter(Boolean)) {
    const m = /^([a-hj-ln-vx-z])?(\d+)(?:-(\d+))?$/i.exec(t); if (!m) return null;
    const pre = (m[1] || 'B').toUpperCase();
    for (let n = +m[2]; n <= +(m[3] || m[2]); n++) want.add(`${pre}${n}`);
  }
  return have.filter(b => want.has(b));
}
// one PDF holds the labels of one size (tape width x length, e.g. "9x50"), since a printer queue is set up for one size: the
// size asked for, else the first (narrowest tape, then shortest). X-Sizes lists every size the request has labels for, so the
// caller can come back for the others
async function sendPdf(res, labels, name, bins, size) {
  if (!labels.length) return res.status(400).json({ error: 'nothing to print' });
  const num = z => z.split('x').map(Number), sizes = [...new Set(labels.map(l => l._size))].sort((a, b) => num(a)[0] - num(b)[0] || num(a)[1] - num(b)[1]);
  const pick = sizes.includes(size) ? size : sizes[0];
  labels = labels.filter(l => l._size === pick); if (sizes.length > 1) name += `-${pick}mm`;
  L.warnings.length = 0;
  const pdf = await L.pdf(labels);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="labels-${name.replace(/[^\w.-]+/g, '_')}.pdf"`);
  res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, X-Label-Count, X-Tape, X-Size, X-Sizes, X-Bins');
  res.setHeader('X-Label-Count', String(labels.length));
  res.setHeader('X-Tape', String(labels[0]._tape)); res.setHeader('X-Size', pick); res.setHeader('X-Sizes', sizes.join(','));
  if (bins?.length) res.setHeader('X-Bins', bins.join(','));   // bin labels the caller should fetch separately (18 mm tape)
  if (L.warnings.length) console.warn(L.warnings.join('\n'));
  res.send(Buffer.from(pdf));
}
// the printed record key of a portion, and whether a group is already printed as it stands
const printedKey = pt => `${pt.page.id}|${pt.key}`;
// POST /api/labels -> PDF of 9 mm drawer labels: { page, keys: [...] | "all" | "new" [, slots: [...]] } or { drawers: "12-16, 20, 30R" }
// (every page). Either may add size: "9x70" for the labels of that size (see sendPdf). Bin labels come from a separate call: { bins: "all" | "B1, B3-5" | ["B1", ...] [, only: "new"] }.
// A page request whose cells also live in bins answers with X-Bins: the bins to fetch next (204 when there are only bins).
app.post('/api/labels', async (req, res) => {
  const d = load(), all = allGroups(d);
  if (req.body.bins !== undefined) {
    const bins = binList(d, req.body.bins); if (!bins) return res.status(400).json({ error: 'bad bin list; use e.g. B1, B3-5, A2' });
    let labels = bins.map(b => binLabel(all, b)).filter(l => l._n > 0);
    if (req.body.only === 'new') { const pr = loadPrinted(); labels = labels.filter(l => pr[`bin|${l._bin}`] !== l._sig); }
    return sendPdf(res, labels, 'bins-' + (req.body.bins === 'all' ? 'all' : labels.map(l => l._bin).join('_')), null, req.body.size);
  }
  let groups = [], name = 'all', bins = [];
  if (req.body.drawers) {
    const home = d.pages.find(p => p.id === req.body.page)?.cabinet || M.CABINETS[0].id;
    const ok = drawerMatcher(req.body.drawers, home); if (!ok) return res.status(400).json({ error: 'bad drawer list; use e.g. 12-16, 20, 30R, M3' });
    groups = all.filter(g => g[0].kind === 'drawer' && ok(g[0].cabinet, g[0].drawer, g[0].half));
    // cabinet, then drawer order, rear before front
    const dk = g => [M.CABINETS.findIndex(c => c.id === g[0].cabinet), +g[0].drawer, g[0].half === 'front' ? 1 : 0];
    groups.sort((a, b) => { const [c, x, y] = dk(a), [e, u, v] = dk(b); return (c - e) || (x - u) || (y - v); });
    name = 'drawers-' + String(req.body.drawers).replace(/[^\w-]+/g, '_');
  } else {
    const page = d.pages.find(p => p.id === req.body.page);
    if (!page) return res.status(404).json({ error: 'no such page' });
    const keys = new Set(req.body.keys === 'all' || req.body.keys === 'new' ? M.populated(page) : (req.body.keys || []));
    // the labels of every location this page's chosen cells touch (merged with whatever else is there, from any page),
    // plus the unlocated part of those cells; `slots` from the split-cell dialog narrows it ('' = the unlocated part)
    const chosen = Array.isArray(req.body.slots) ? new Set(req.body.slots) : null;
    const mine = g => g.filter(pt => pt.page === page && keys.has(pt.key));
    groups = all.filter(g => mine(g).length && (!chosen || chosen.has(groupSlot(g))));
    groups = M.drawerOrder(page, groups);
    bins = [...new Set(groups.filter(g => g[0].kind === 'bin').map(g => g[0].bin))];
    groups = groups.filter(g => g[0].kind !== 'bin');
    if (req.body.keys === 'new') {
      const pr = loadPrinted();
      groups = groups.filter(g => { const sig = groupText(g).sig; return g.some(pt => pr[printedKey(pt)] !== sig); });
      bins = bins.filter(b => pr[`bin|${b}`] !== binLabel(all, b)._sig);
    }
    name = `${page.id}-${Array.isArray(req.body.keys) ? (req.body.keys.length === 1 ? req.body.keys[0] : 'selection') : req.body.keys}`;
  }
  const labels = groups.map(drawerLabel).filter(l => l._n > 0);
  if (!labels.length && bins.length) { res.setHeader('Access-Control-Expose-Headers', 'X-Bins'); res.setHeader('X-Bins', bins.join(',')); return res.status(204).end(); }
  return sendPdf(res, labels, name, bins, req.body.size);
});
// POST /api/printed { page, keys: [...] | "all" } marks the labels those cells are on (every cell on them, from any page) and the
// bins they touch as printed with their current text; { bins: [...] | "all" } marks bins
app.post('/api/printed', (req, res) => {
  const d = load(), pr = loadPrinted(), all = allGroups(d);
  let marked = 0;
  if (req.body.bins !== undefined) { for (const b of binList(d, req.body.bins) || []) { pr[`bin|${b}`] = binLabel(all, b)._sig; marked++; } }
  else {
    const page = d.pages.find(p => p.id === req.body.page); if (!page) return res.status(404).json({ error: 'no such page' });
    const keys = new Set(req.body.keys === 'all' ? M.populated(page) : (req.body.keys || []));
    for (const g of all.filter(g => g.some(pt => pt.page === page && keys.has(pt.key)))) {
      if (g[0].kind === 'bin') { pr[`bin|${g[0].bin}`] = binLabel(all, g[0].bin)._sig; continue; }
      const sig = groupText(g).sig; for (const pt of g) pr[printedKey(pt)] = sig;
    }
    marked = keys.size;
  }
  fs.writeFileSync(PRINTED, JSON.stringify(pr, null, 1)); res.json({ ok: true, marked });
});
// GET /api/cabinet -> what is in each drawer and bin: { cabinets: [{ id, title, color, drawers: { "12": { back: [...], front: [...], whole: [...] } }],
// bins: { "B3": [...] }, unassigned: [...] }. Each entry (one label): { text, page, pageId, keys, gap, overflow, whole, parts } where
// page lists every page with stock on it, gap = a size's lengths here are not a contiguous run of the lengths that size has,
// overflow = everything in this entry is overflow stock, whole = its stock is flagged as needing a whole drawer, parts = the
// items behind it, each with its page and the level it got its location from
app.get('/api/cabinet', (req, res) => {
  const d = load(), bins = {}, unassigned = [];
  const cabinets = M.CABINETS.map(c => ({ ...c, drawers: {} }));
  const pages = new Set(req.query.page ? d.pages.filter(p => p.id === req.query.page) : d.pages);
  for (const g of allGroups(d)) {
    if (!g.some(pt => pages.has(pt.page))) continue;
    const c = g[0], t = groupText(g);
    // gap check per size: the lengths of one size held here must be consecutive among the lengths that size actually has
    let gap = false; const bySize = {};
    for (const pt of g) { const [a, b] = pt.key.split('|'); if (!isNaN(+b)) (bySize[pt.page.id + '|' + a] = bySize[pt.page.id + '|' + a] || { page: pt.page, row: a, lens: [] }).lens.push(+b); }
    for (const { page, row, lens } of Object.values(bySize)) {
      const have = M.lengths(page).filter(l => (page.cells[`${row}|${l}`]?.types || []).length), idx = lens.map(l => have.indexOf(l)).sort((x, y) => x - y);
      for (let i = 1; i < idx.length; i++) if (idx[i] !== idx[i - 1] + 1) gap = true;
    }
    const parts = g.flatMap(pt => pt.items.map(it => ({ key: it.key, pageId: pt.page.id, type: it.type, drive: it.drive, material: it.material, overflow: pt.overflow, level: pt.overflow ? it.overLevel : it.locLevel })));
    const titles = [...new Set(g.map(pt => pt.page.title))];
    const entry = { text: t.pn + (t.value ? '  ' + t.value : '') + (t.qual ? '  ' + t.qual : ''), page: titles.join(' · '), pageId: c.page.id, keys: g.map(pt => pt.key), gap,
                    overflow: g.every(pt => pt.overflow), whole: g.some(pt => pt.items.some(it => it.whole)), parts };
    if (!c.kind) { unassigned.push(entry); continue; }
    if (c.kind === 'bin') { (bins[c.bin] = bins[c.bin] || []).push(entry); continue; }
    const cabinet = cabinets.find(x => x.id === c.cabinet) || cabinets[0];
    const dr = cabinet.drawers[c.drawer] = cabinet.drawers[c.drawer] || { back: [], front: [], whole: [] };
    dr[c.half || 'whole'].push(entry);
  }
  res.json({ cabinets, bins, unassigned, pages: d.pages.map(p => ({ id: p.id, title: p.title, cabinet: p.cabinet || '' })), page: req.query.page || '' });
});
// GET /api/preview.png?page=..&key=..[&slot=..]  -> a PNG of one label for the on-screen preview (the cell's primary location, or the slot given)
app.get('/api/preview.png', async (req, res) => {
  const d = load(), page = d.pages.find(p => p.id === req.query.page); if (!page) return res.status(404).end();
  const mine = M.portions(page, [req.query.key]); if (!mine.length) return res.status(404).end();
  const pt = ('slot' in req.query ? mine.find(p => M.portionSlot(p) === req.query.slot) : null) || mine.find(p => !p.overflow) || mine[0];
  const slot = M.portionSlot(pt), all = allGroups(d);
  let lab;
  if (pt.kind === 'bin') lab = binLabel(all, pt.bin);
  else { pt.page = page; lab = drawerLabel((slot && all.find(g => groupSlot(g) === slot)) || [pt]); }
  res.setHeader('Content-Type', 'image/png'); res.send(await L.renderPng(L.labelSvg(lab.kind, lab)));
});
// Print relay. The page is served over https and the printer's PC sits behind NAT, so the page cannot call the helper and
// neither can this server: the helper (helper/print-helper.py --server) polls here instead. The page POSTs a PDF to /api/print,
// the helper collects it from /api/helper/next, prints it and reports to /api/helper/done, which answers the page's request.
// /api/helper/* is exempt from Apache's login and carries the token in data/helper.token (made on first start) as X-Token.
const TOKEN_FILE = process.env.PARTSTORE_HELPER_TOKEN_FILE || path.join(__dirname, 'data', 'helper.token');
if (!fs.existsSync(TOKEN_FILE)) fs.writeFileSync(TOKEN_FILE, crypto.randomBytes(24).toString('hex') + '\n', { mode: 0o600 });
const HELPER_TOKEN = fs.readFileSync(TOKEN_FILE, 'utf8').trim();
const helper = { seen: 0, info: {}, waiting: null };   // seen = last poll (ms); info = what the helper said about itself; waiting = its parked poll
const jobs = new Map(), queue = [];                     // job id -> { id, pdf, printer, res, timer }; queue = ids not yet collected
const helperOnline = () => Date.now() - helper.seen < 45000;
const helperAuth = (req, res, next) => {
  const a = Buffer.from(String(req.get('X-Token') || '')), b = Buffer.from(HELPER_TOKEN);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(403).json({ error: 'bad token' });
  helper.seen = Date.now(); next();
};
const hand = (res, job) => { res.setHeader('Content-Type', 'application/pdf'); res.setHeader('X-Job', job.id); res.setHeader('X-Printer', encodeURIComponent(job.printer)); res.send(job.pdf); };
const finish = (job, code, body) => { clearTimeout(job.timer); jobs.delete(job.id); const i = queue.indexOf(job.id); if (i >= 0) queue.splice(i, 1); if (!job.res.headersSent) job.res.status(code).json(body); };
// POST /api/helper/hello { printers, backend, version }: the helper introduces itself on start and now and then
app.post('/api/helper/hello', helperAuth, (req, res) => { helper.info = { printers: req.body.printers || [], backend: req.body.backend || null, version: req.body.version || '' }; res.json({ ok: true }); });
// GET /api/helper/next: long poll; the next job as a PDF (X-Job, X-Printer), or 204 after 25 s with nothing to print
app.get('/api/helper/next', helperAuth, (req, res) => {
  if (helper.waiting) { clearTimeout(helper.waiting.timer); helper.waiting.res.status(204).end(); helper.waiting = null; }
  const id = queue.shift(); if (id) return hand(res, jobs.get(id));
  const w = helper.waiting = { res, timer: setTimeout(() => { if (helper.waiting === w) helper.waiting = null; helper.seen = Date.now(); res.status(204).end(); }, 25000) };
  req.on('close', () => { if (helper.waiting === w) { clearTimeout(w.timer); helper.waiting = null; } });
});
// POST /api/helper/done { job, ok, pages, backend, error }
app.post('/api/helper/done', helperAuth, (req, res) => {
  const job = jobs.get(req.body.job);
  if (job) req.body.ok ? finish(job, 200, { ok: true, pages: req.body.pages || job.pages, printer: job.printer, backend: req.body.backend }) : finish(job, 500, { error: req.body.error || 'print failed' });
  res.json({ ok: true });
});
// GET /api/print/status -> { online, printers, backend, version } for the page's Printer… dialog
app.get('/api/print/status', (req, res) => res.json({ online: helperOnline(), ...helper.info }));
// POST /api/print?printer=NAME[&pages=N], body = the PDF: answers once the helper has printed it (or could not)
app.post('/api/print', express.raw({ type: 'application/pdf', limit: '50mb' }), (req, res) => {
  const printer = String(req.query.printer || '');
  if (!printer) return res.status(400).json({ error: 'printer= is required' });
  if (!Buffer.isBuffer(req.body) || req.body.subarray(0, 4).toString() !== '%PDF') return res.status(400).json({ error: 'body is not a PDF' });
  if (!helperOnline()) return res.status(503).json({ error: 'the print helper is not connected (is the PC with the label printer on?)' });
  const job = { id: crypto.randomBytes(8).toString('hex'), pdf: req.body, printer, res, pages: +req.query.pages || 0 };   // pages: the page's own count, for when the helper cannot count them
  job.timer = setTimeout(() => finish(job, 504, { error: 'the print helper did not report back' }), 170000);
  jobs.set(job.id, job);
  if (helper.waiting) { const w = helper.waiting; helper.waiting = null; clearTimeout(w.timer); hand(w.res, job); } else queue.push(job.id);
});
const port = +process.env.PORT || 8093;
app.listen(port, '127.0.0.1', () => console.log(`partstore on http://127.0.0.1:${port}`));
