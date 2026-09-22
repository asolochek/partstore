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
M.bind(() => NOW);   // the model's categories (their prefixes, order and colours) come from the data
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
// a label of a non-default size or tape colour says so in its signature, so changing either makes those labels unprinted
function groupText(group) {
  const t = groupText0(group), c = group[0], def = M.LABEL_DEFAULT[c.kind === 'bin' ? 'bin' : 'drawer'], z = M.labelSpec(NOW, c);
  const extra = (z.tape === def.tape && z.len === def.len ? '' : `|${z.tape}x${z.len}`) + (M.plainTape(z) ? '' : `|${z.fg}/${z.bg}`);
  return extra ? { ...t, sig: t.sig + extra } : t;
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
function styleAt(c, stacked = true) {
  const kind = c.kind === 'bin' && stacked ? 'bin' : 'drawer', B = L.STYLE[kind], z = M.labelSpec(NOW, c), print = M.TAPES[z.tape], f = print / B.print;
  const S = { ...B, tape: z.tape, print, len: z.len, fg: z.fg, bg: z.bg };
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
  const { S, f, style } = styleAt(group[0], false), t = groupText(group);   // always the one-line layout, at the size of wherever the group is kept
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
           generic: true, style, _tape: S.tape, _size: `${S.tape}x${S.len}`, _z: S, _n: t.types.length || (isList ? 1 : 0), _sig: t.sig, _slot: groupSlot(group) };
}
// an 18 mm bin label: everything in the bin, from every page. One entry: the size big with its details under it; several:
// one line per entry at a size that fits (up to six lines)
function binEntries(groups, bin) { return groups.filter(g => groupSlot(g) === `B:${bin}`).map(g => ({ group: g, ...groupText(g) })); }
// Icons are drawn in a 100-unit box that most of them do not fill (a screw's ink spans about 70 % of it), so a glyph slot sized
// by the box leaves the icons small. inkExt(names) = the share of the box height the ink of these icons needs, measured about the
// box's centre (the renderer centres the box): the slot may be that much taller than the room. Measured once per icon by
// rendering it; an icon not measured yet counts as filling its box, and is measured for the next label
const INK = new Map(), sharp = require('sharp');
async function measureInk(name) {
  if (INK.has(name)) return; INK.set(name, 1);
  try {
    const { data, info } = await sharp(Buffer.from(I.icons([name]).replace('<svg ', '<svg width="200" height="200" '))).flatten({ background: '#fff' }).greyscale().raw().toBuffer({ resolveWithObject: true });
    let top = info.height, bot = -1;
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) if (data[y * info.width + x] < 128) { top = Math.min(top, y); bot = Math.max(bot, y); break; }
    if (bot >= 0) INK.set(name, Math.min(1, Math.max(0.3, 2 * Math.max(info.height / 2 - top, bot + 1 - info.height / 2) / info.height + 0.02)));
  } catch (e) { console.warn(`icon ${name}: not measured (${e.message})`); }
}
const inkExt = names => Math.max(0.3, ...names.map(n => { if (!INK.has(n)) measureInk(n); return INK.get(n) ?? 1; }));
function binLabel(groups, bin) {
  const { S, f, style } = styleAt({ kind: 'bin', bin }), entries = binEntries(groups, bin);
  const types = [...new Set(entries.flatMap(e => e.types))];
  const avail = S.print - 2 * S.pad, CAP = L.CAP;
  const done = (lab, lay, st) => ({ kind: 'bin', ...lab, pinout: null, glyphSvg: types.length ? I.icons(types, lay.rows) : null, glyphMaxW: lay.maxW, generic: true, style: st, _tape: S.tape, _size: `${S.tape}x${S.len}`, _z: S,
    _n: types.length || entries.length, _sig: entries.map(e => e.sig).join(';'), _slot: `B:${bin}`, _bin: bin, _entries: entries });
  // the largest text size (mm, in 0.1 steps between lo and hi) at which ok(size) holds
  // a bin labelled on narrow tape (9 or 12 mm) with one entry is a drawer label in all but name: the one-line layout reads far
  // larger there than the stacked one shrunk to fit
  if (entries.length === 1 && S.print < 12) { const lab = drawerLabel(entries[0].group); return { ...lab, _n: types.length || 1, _sig: entries[0].sig, _slot: `B:${bin}`, _bin: bin, _entries: entries }; }
  const largest = (lo, hi, ok) => { let v = hi; while (v > lo && !ok(v)) v = +(v - 0.1).toFixed(2); return v; };
  if (entries.length === 1 && S.print >= 12) {
    // a tall tape, one entry: two rows, so the height is used. The size goes across the full width on top, as large as the width
    // allows while leaving the band under it at least 5 mm; the band holds the detail lines (left) and the icons (right)
    // (heights are budgeted with 0.8 em for the big line: Futura's figures and pointed capitals stand taller than its cap height)
    const e = entries[0], lines = [e.value, e.qual].filter(Boolean), n = lines.length, TALL = 0.8, vpad = 1.5 * f, high = S.print - 2 * vpad;
    const minBand = Math.max(types.length ? 5.0 * f : 0, n ? (CAP + (n - 1) * S.pitch) * 3.0 * f : 0);
    // a fraction's slash reaches under the baseline, so such a line keeps a little more distance from the band
    const under = /\//.test(e.pn) ? 0.15 : 0, gap0 = minBand ? 1.2 * f : 0, Z = { ...S, vpad };
    const setPn = v => { Z.pn = v; Z.bandGap = gap0 + (minBand ? under * v : 0); Z.band = minBand ? high - Z.bandGap - v * TALL : 0.01; };
    // the width estimate runs a few percent short on long lines, hence the 1.05
    setPn(largest(1.9, (high - minBand - gap0) / (TALL + under), v => L.textWidth(e.pn, v) * 1.05 <= S.len - S.pad - S.pnX - 1.0));
    // detail text: as large as the band's height allows (up to 4 mm), then smaller until the icons beside it reach 3.5 mm
    const room = sp => S.len - 2 * S.pad - (n ? Math.max(...lines.map(l => L.textWidth(l, sp))) + 2.0 : 0);
    const ext = types.length ? inkExt(types) : 1, slot = () => Z.band / ext;   // the icon boxes may be taller than the band: their ink still fits it
    const icons = sp => I.layout(types, room(sp), slot()).size;
    const pickSpec = () => { Z.spec = n ? largest(1.9, 4.0 * f, sp => sp * CAP + (n - 1) * sp * S.pitch <= Z.band && (!types.length || icons(sp) >= Math.min(3.5 * f, Z.band))) : S.spec; };
    pickSpec();
    // long details can leave the icons small even at the smallest text: then the big line gives up height to the band (down to 5 mm)
    while (types.length && icons(Z.spec) < 3.5 * f && Z.pn > 5.0 * f) { setPn(+(Z.pn - 0.2).toFixed(2)); pickSpec(); }
    // the other arrangement: icons beside the size in the top row, the band (if any) left to the details across the full width.
    // Taken when it gives larger detail text, or with no details when the size comes out at least as large (short sizes, long labels)
    if (types.length) {
      const wide = sp => Math.max(...lines.map(l => L.textWidth(l, sp))) * 1.05, Y = { ...S, vpad, glyphTop: true, bandGap: n ? gap0 : 0 }, minIcon = (n ? 3.5 : 6.5) * f;   // (box sizes: a screw's ink is about 70 % of its box)
      Y.spec = n ? largest(1.9, 4.0 * f, sp => wide(sp) <= S.len - S.pad - S.detX - 1.0 && (CAP + (n - 1) * S.pitch + 0.3) * sp <= high - gap0 - 6.5 * f * TALL) : S.spec;   // the top row keeps room for a 6.5 mm size
      Y.band = n ? (CAP + (n - 1) * S.pitch) * Y.spec + 0.3 * Y.spec : 0.01;   // + the descenders of the last line
      const topH = high - Y.band - Y.bandGap, iconsAt = v => I.layout(types, S.len - S.pad - 1.5 - S.pnX - L.textWidth(e.pn, v) * 1.05 - 2.0, topH / ext);
      Y.pn = largest(1.9, topH / (TALL + under), v => iconsAt(v).size >= minIcon); Y.glyphH = topH / ext;
      if (iconsAt(Y.pn).size >= minIcon && (n ? Y.spec > Z.spec + 0.05 : Y.pn >= Z.pn)) return done({ pn: e.pn, value: e.value, specs: e.qual, lines: [] }, iconsAt(Y.pn), Y);
    }
    Z.glyphH = slot();
    return done({ pn: e.pn, value: e.value, specs: e.qual, lines: [] }, I.layout(types, room(Z.spec), slot()), Z);
  }
  let lab;
  if (style && entries.length === 1) fitPn(S, entries[0].pn, types.length ? 3.0 * f + 2.5 : 1.0);
  if (entries.length === 1) lab = { pn: entries[0].pn, value: entries[0].value, specs: entries[0].qual, lines: [] };
  else {
    let lines = entries.map(e => [e.pn, e.value, e.qual].filter(Boolean).join('  '));
    if (lines.length > 6) { L.warnings.push(`bin ${bin}: ${lines.length} entries, only 6 fit`); lines = [...lines.slice(0, 5), `+${lines.length - 5} more`]; }
    // several entries: one line each, as large as the height allows (up to 6 mm) while the icons beside them keep 3 mm
    const n = lines.length, wide = sp => Math.max(...lines.map(l => L.textWidth(l, sp)));
    const spec = largest(sized(2.0, f), 6.0 * f, sp => sp * CAP + (n - 1) * sp * S.pitch <= avail && (!types.length || I.layout(types, S.len - S.pad - 1.5 - S.detX - wide(sp), S.glyphH).size >= 3.0 * f) && S.detX + wide(sp) <= S.len - S.pad);
    lab = { pn: '', value: '', specs: '', lines, spec };
  }
  const all = () => [lab.value, lab.specs, ...lab.lines].filter(Boolean);
  const freeFor = () => S.len - S.pad - 1.5 - Math.max(lab.pn ? S.pnX + L.textWidth(lab.pn, S.pn) : 0, ...all().map(l => S.detX + L.textWidth(l, lab.spec ?? S.spec)));
  let lay = I.layout(types, freeFor(), S.glyphH);
  while (lay.size < 3.0 * f && (lab.spec ?? S.spec) > sized(2.0, f)) { lab.spec = Math.max(sized(2.0, f), +(((lab.spec ?? S.spec) - 0.3 * f).toFixed(2))); lay = I.layout(types, freeFor(), S.glyphH); }
  return done(lab, lay, style);
}
const allBins = d => [...new Set(d.pages.flatMap(p => M.bins(p)))].sort(M.binOrder);
// drawer spec: "12-16, 20, 30R, M3-5" -> predicate on (cabinet, drawer, half). A bare number matches both halves of a divided
// drawer; a term without a category prefix (I, M, W, …) means `home`, the cabinet of the page the request came from
function drawerMatcher(spec, home) {
  const terms = String(spec).split(/[,\s]+/).filter(Boolean).map(t => {
    const m = /^([a-zA-Z])?(\d+)(?:-(\d+))?([rRfFbB])?$/.exec(t); if (!m || (m[1] && !M.cabinetByPrefix(m[1]))) return null;
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
    const m = /^([a-z])?(\d+)(?:-(\d+))?$/i.exec(t); if (!m || (m[1] && M.cabinetByPrefix(m[1]))) return null;
    const pre = (m[1] || 'B').toUpperCase();
    for (let n = +m[2]; n <= +(m[3] || m[2]); n++) want.add(`${pre}${n}`);
  }
  return have.filter(b => want.has(b));
}
// One PDF holds the labels of one kind of tape at one length: a group is "9x50", or "18x50/#000000-#39ff14" when the tape is not
// black on white. The PDF is the group asked for, else the first (narrowest tape, then shortest). X-Groups lists every group
// the request has labels for, so the caller can come back for the others; X-Size picks the printer queue, X-Tape-Name is what to load
const groupOf = l => l._size + (M.plainTape(l._z) ? '' : `/${l._z.fg}-${l._z.bg}`);
async function sendPdf(res, labels, name, bins, group) {
  if (!labels.length) return res.status(400).json({ error: 'nothing to print' });
  const num = z => z.split('/')[0].split('x').map(Number), groups = [...new Set(labels.map(groupOf))].sort((a, b) => num(a)[0] - num(b)[0] || num(a)[1] - num(b)[1] || a.localeCompare(b));
  const pick = groups.includes(group) ? group : groups[0];
  labels = labels.filter(l => groupOf(l) === pick); if (groups.length > 1) name += `-${pick.replace(/[\/#]+/g, '_')}mm`;
  L.warnings.length = 0;
  const pdf = await L.pdf(labels);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="labels-${name.replace(/[^\w.-]+/g, '_')}.pdf"`);
  res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, X-Label-Count, X-Tape, X-Size, X-Group, X-Groups, X-Tape-Name, X-Bins');
  res.setHeader('X-Label-Count', String(labels.length));
  res.setHeader('X-Tape', String(labels[0]._tape)); res.setHeader('X-Size', labels[0]._size); res.setHeader('X-Group', pick); res.setHeader('X-Groups', groups.join(',')); res.setHeader('X-Tape-Name', M.tapeName(labels[0]._z));
  if (bins?.length) res.setHeader('X-Bins', bins.join(','));   // bin labels the caller should fetch separately (18 mm tape)
  if (L.warnings.length) console.warn(L.warnings.join('\n'));
  res.send(Buffer.from(pdf));
}
// the printed record key of a portion, and whether a group is already printed as it stands
const printedKey = pt => `${pt.page.id}|${pt.key}`;
// POST /api/labels -> PDF of 9 mm drawer labels: { page, keys: [...] | "all" | "new" [, slots: [...]] } or { drawers: "12-16, 20, 30R" }
// (every page), or { places: [{ page, key, slot }] } (one label per distinct place). Any may add group: "9x70" for the labels of that tape and length (see sendPdf). Bin labels come from a separate call: { bins: "all" | "B1, B3-5" | ["B1", ...] [, only: "new"] }.
// A page request whose cells also live in bins answers with X-Bins: the bins to fetch next (204 when there are only bins).
app.post('/api/labels', async (req, res) => {
  const d = load(), all = allGroups(d);
  if (req.body.bins !== undefined) {
    const bins = binList(d, req.body.bins); if (!bins) return res.status(400).json({ error: 'bad bin list; use e.g. B1, B3-5, A2' });
    let labels = bins.map(b => binLabel(all, b)).filter(l => l._n > 0);
    if (req.body.only === 'new') { const pr = loadPrinted(); labels = labels.filter(l => pr[`bin|${l._bin}`] !== l._sig); }
    return sendPdf(res, labels, 'bins-' + (req.body.bins === 'all' ? 'all' : labels.map(l => l._bin).join('_')), null, req.body.group);
  }
  let groups = [], name = 'all', bins = [];
  if (req.body.drawers) {
    const home = (M.cabinetById(req.body.category) ? req.body.category : '') || d.pages.find(p => p.id === req.body.page)?.cabinet || M.CABINETS[0].id;   // category: whose drawers the bare numbers are
    const ok = drawerMatcher(req.body.drawers, home); if (!ok) return res.status(400).json({ error: 'bad drawer list; use e.g. 12-16, 20, 30R, M3' });
    groups = all.filter(g => g[0].kind === 'drawer' && ok(g[0].cabinet, g[0].drawer, g[0].half));
    // cabinet, then drawer order, rear before front
    const dk = g => [M.CABINETS.findIndex(c => c.id === g[0].cabinet), +g[0].drawer, g[0].half === 'front' ? 1 : 0];
    groups.sort((a, b) => { const [c, x, y] = dk(a), [e, u, v] = dk(b); return (c - e) || (x - u) || (y - v); });
    name = 'drawers-' + String(req.body.drawers).replace(/[^\w-]+/g, '_');
  } else if (Array.isArray(req.body.places)) {
    // { places: [{ page, key, slot }] } (the Find page): the label of each place named, once, however many lines share it
    const seen = new Set();
    for (const pl of req.body.places) {
      const page = d.pages.find(p => p.id === pl.page); if (!page) continue;
      for (const g of all) if (groupSlot(g) === (pl.slot || '') && g.some(pt => pt.page === page && pt.key === pl.key) && !seen.has(groupSlot(g) || `${page.id}|${pl.key}`)) { seen.add(groupSlot(g) || `${page.id}|${pl.key}`); groups.push(g); }
    }
    const first = d.pages.find(p => p.id === req.body.places[0]?.page) || d.pages[0];
    groups = M.drawerOrder(first, groups);
    bins = [...new Set(groups.filter(g => g[0].kind === 'bin').map(g => g[0].bin))];
    groups = groups.filter(g => g[0].kind !== 'bin');
    name = 'selection';
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
  return sendPdf(res, labels, name, bins, req.body.group);
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
// items behind it, each with its page, its category (cat) and the level it got its location from
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
    const parts = g.flatMap(pt => pt.items.map(it => ({ key: it.key, pageId: pt.page.id, type: it.type, drive: it.drive, material: it.material, cat: it.cat, overflow: pt.overflow, level: pt.overflow ? it.overLevel : it.locLevel })));
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
// black -> fg, white -> bg, greys in between
async function tint(png, fg, bg) {
  const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)), F = rgb(fg), B = rgb(bg);
  const { data, info } = await sharp(png).flatten({ background: '#fff' }).greyscale().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(info.width * info.height * 3);
  for (let i = 0; i < info.width * info.height; i++) { const v = data[i] / 255; for (let c = 0; c < 3; c++) out[i * 3 + c] = Math.round(B[c] * v + F[c] * (1 - v)); }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 3 } }).png().toBuffer();
}
// GET /api/preview.png?page=..&key=..[&slot=..]  -> a PNG of one label for the on-screen preview (the cell's primary location, or the slot given)
app.get('/api/preview.png', async (req, res) => {
  const d = load(), page = d.pages.find(p => p.id === req.query.page); if (!page) return res.status(404).end();
  const mine = M.portions(page, [req.query.key]); if (!mine.length) return res.status(404).end();
  const pt = ('slot' in req.query ? mine.find(p => M.portionSlot(p) === req.query.slot) : null) || mine.find(p => !p.overflow) || mine[0];
  const slot = M.portionSlot(pt), all = allGroups(d);
  let lab;
  if (pt.kind === 'bin') lab = binLabel(all, pt.bin);
  else { pt.page = page; lab = drawerLabel((slot && all.find(g => groupSlot(g) === slot)) || [pt]); }
  let png = await L.renderPng(L.labelSvg(lab.kind, lab));
  if (!M.plainTape(lab._z)) png = await tint(png, lab._z.fg, lab._z.bg);   // the preview shows the tape; the PDF stays black on white, which is what the printer prints
  res.setHeader('Content-Type', 'image/png'); res.send(png);
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
// connected = heard from lately, or out printing a job it collected (it cannot poll while it prints, unless it pings)
const helperBusy = () => [...jobs.values()].some(j => j.handed);
const helperOnline = () => Date.now() - helper.seen < 45000 || helperBusy();
const helperAuth = (req, res, next) => {
  const a = Buffer.from(String(req.get('X-Token') || '')), b = Buffer.from(HELPER_TOKEN);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(403).json({ error: 'bad token' });
  helper.seen = Date.now(); next();
};
// a job has 175 s in all, to be collected (others may be ahead of it) and printed: Apache gives a proxied request up at 180 s
const arm = (job, ms, msg) => { clearTimeout(job.timer); job.timer = setTimeout(() => finish(job, 504, { error: msg }), ms); };
const hand = (res, job) => { job.handed = Date.now(); arm(job, Math.max(5000, 175000 - (job.handed - job.start)), 'the print helper did not report back'); res.setHeader('Content-Type', 'application/pdf'); res.setHeader('X-Job', job.id); res.setHeader('X-Printer', encodeURIComponent(job.printer)); res.send(job.pdf); };
const finish = (job, code, body) => { clearTimeout(job.timer); jobs.delete(job.id); const i = queue.indexOf(job.id); if (i >= 0) queue.splice(i, 1); if (!job.res.headersSent) job.res.status(code).json(body); };
// POST /api/helper/hello { printers, backend, version }: the helper introduces itself on start and now and then
app.post('/api/helper/hello', helperAuth, (req, res) => { helper.info = { printers: req.body.printers || [], backend: req.body.backend || null, version: req.body.version || '' }; res.json({ ok: true }); });
// POST /api/helper/ping: sent while a print is in progress, so the helper still counts as connected
app.post('/api/helper/ping', helperAuth, (req, res) => res.json({ ok: true }));
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
// GET /api/print/status -> { online, busy, waiting, printers, backend, version } for the page's Printer… dialog
app.get('/api/print/status', (req, res) => res.json({ online: helperOnline(), busy: helperBusy(), waiting: queue.length, ...helper.info }));
// POST /api/print?printer=NAME[&pages=N], body = the PDF: answers once the helper has printed it (or could not)
app.post('/api/print', express.raw({ type: 'application/pdf', limit: '50mb' }), (req, res) => {
  const printer = String(req.query.printer || '');
  if (!printer) return res.status(400).json({ error: 'printer= is required' });
  if (!Buffer.isBuffer(req.body) || req.body.subarray(0, 4).toString() !== '%PDF') return res.status(400).json({ error: 'body is not a PDF' });
  if (!helperOnline()) return res.status(503).json({ error: 'the print helper is not connected (is the PC with the label printer on?)' });
  const job = { id: crypto.randomBytes(8).toString('hex'), pdf: req.body, printer, res, pages: +req.query.pages || 0 };   // pages: the page's own count, for when the helper cannot count them
  job.start = Date.now(); arm(job, 175000, 'the print helper is busy and did not get to these labels; try again');
  jobs.set(job.id, job);
  if (helper.waiting) { const w = helper.waiting; helper.waiting = null; clearTimeout(w.timer); hand(w.res, job); } else queue.push(job.id);
});
// measure the icons in use before the first label is asked for
{ const d = load(); for (const g of allGroups(d)) for (const pt of g) for (const t of pt.types || []) measureInk(t); }
const port = +process.env.PORT || 8093;
app.listen(port, '127.0.0.1', () => console.log(`partstore on http://127.0.0.1:${port}`));
