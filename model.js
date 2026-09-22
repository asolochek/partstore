// Copyright (C) 2026 Aaron Solochek. Licensed under the GNU GPL v3; see LICENSE.
// Fastener grid model helpers shared by the server and the labels. Rows are thread sizes (diameter + pitch); columns are lengths.
// Cell keys: `${row.id}|${length}` for screws, `${row.id}|nut` for nuts, `${dia}|washer` for washers (washers span the rows of a diameter).
(function () {   // one scope, so the page's own globals (HW, lengths, …) are untouched when this file is loaded as a script
function lengthText(page, len) {
  if (page.units === 'mm') return `${+len}mm`;
  const whole = Math.floor(len + 1e-9), frac = +(len - whole).toFixed(6);
  let f = '';
  if (frac) { for (const d of [2, 4, 8, 16, 32, 64]) { const n = frac * d; if (Math.abs(n - Math.round(n)) < 1e-6) { f = `${Math.round(n)}/${d}`; break; } } if (!f) f = String(frac).replace(/^0/, ''); }
  return (whole ? (f ? `${whole}-${f}` : String(whole)) : f) + '″';
}
// the ordered list of lengths: the step series, plus extras, minus skips
function lengths(page) {
  if (!page.lengths) return [];
  const L = page.lengths, out = new Set();
  for (let x = L.start; x <= L.stop + 1e-9; x = +(x + L.step).toFixed(6)) out.add(+x.toFixed(6));
  for (const e of L.extra || []) out.add(+e);
  for (const s of L.skip || []) out.delete(+s);
  return [...out].sort((a, b) => a - b);
}
const screwKey = (row, len) => `${row.id}|${len}`;
const nutKey = row => `${row.id}|nut`;
const washerKey = dia => `${dia}|washer`;
// hardware columns: nuts and lock nuts belong to a thread size (row); washers and lock washers to a diameter (shared by its rows)
const HW = [['locknuts', 'locknut', 'row', 'Lock Nut'], ['nuts', 'nut', 'row', 'Nut'], ['lockwashers', 'lockwasher', 'dia', 'Lock Washer'], ['washers', 'washer', 'dia', 'Washer']];
// list pages (kind 'list'): free-form lines instead of a grid. page.items = [{ id, text, detail, glyph, loc, overflow, checked }]
const isList = page => page.kind === 'list';
const listItem = (page, key) => (page.items || []).find(it => it.id === key);
// label text for a cell
function cellText(page, key) {
  if (isList(page)) return listItem(page, key)?.text || key;
  const [a, b] = key.split('|');
  const hw = HW.find(h => h[1] === b);
  if (hw && hw[2] === 'dia') return `${a} ${hw[3]}`;
  const row = page.rows.find(r => r.id === a);
  if (!row) return key;
  if (hw) return `${row.label} ${hw[3]}`;
  return `${row.label} × ${lengthText(page, +b)}`;
}
// every cell key that has at least one type ticked, in reading order: row by row, left to right (lengths, then lock nuts,
// nuts, lock washers, washers); a diameter's washer cells appear with the first row of that diameter
function populated(page) {
  if (isList(page)) return (page.items || []).filter(it => (it.text || '').trim()).map(it => it.id);
  const out = [], has = k => page.cells[k]?.types?.length, seenDia = new Set();
  for (const row of page.rows) {
    for (const len of lengths(page)) { const k = screwKey(row, len); if (has(k)) out.push(k); }
    for (const [, suffix, per] of HW) {
      if (per === 'row') { const k = `${row.id}|${suffix}`; if (has(k)) out.push(k); }
      else if (!seenDia.has(row.dia + suffix)) { seenDia.add(row.dia + suffix); const k = `${row.dia}|${suffix}`; if (has(k)) out.push(k); }
    }
  }
  return out;
}
// ---- cabinets ----
// Drawers are numbered per category, each from 1; a page belongs to a category (page.cabinet) and a bare drawer number
// means that category. A location may name another category explicitly (loc.cabinet), with its prefix letter: I12R, M3, W40F.
// Physically the drawers sit in a row of cabinets (data.layout.cabinets, each of a KIND) and a category's numbering runs
// on across them in category order: data.layout.counts says how many drawers each category has (the last takes the rest).
// The categories live in the model (data.categories: [{ id, prefix, title, color, fg }], in numbering order); these are the
// ones a model without any starts with. color / fg = background and text of the category's drawer-number labels, which is
// how the pages draw its drawer badges.
const DEFAULT_CATEGORIES = [{ id: 'imperial', prefix: 'I', title: 'Imperial machine screws', color: '#2e9e4f', fg: '#ffffff' },
                            { id: 'metric', prefix: 'M', title: 'Metric machine screws', color: '#2f6db5', fg: '#ffffff' },
                            { id: 'wood', prefix: 'W', title: 'Wood & sheet metal screws', color: '#c0392b', fg: '#ffffff' }];
const HEX = /^#[0-9a-f]{6}$/i, hex = (v, def) => HEX.test(v || '') ? v.toLowerCase() : def;
const categoriesOf = d => (Array.isArray(d?.categories) && d.categories.length ? d.categories : DEFAULT_CATEGORIES).map(c => ({ ...c, prefix: String(c.prefix || '').toUpperCase(), color: hex(c.color, '#5b6470'), fg: hex(c.fg, '#ffffff') }));
// The location helpers below (parseLoc, locText, …) are called without the model in hand, so whoever loads this file says where
// the current model is: M.bind(() => data). CABINETS is then always that model's categories.
let current = () => null;
const bind = fn => { current = fn; };
const cats = () => categoriesOf(current());
// cabinet kinds: a grid of standard drawers, or a box of bins; '4x4w' adds three double-wide drawers down each side (positions 17–22)
const KINDS = {
  '8x8':     { title: '8 × 8 drawers', cols: 8, rows: 8, drawers: 64 },
  '4x4':     { title: '4 × 4 drawers', cols: 4, rows: 4, drawers: 16 },
  '4x4w':    { title: '4 × 4 drawers with 3 wide drawers each side', cols: 4, rows: 4, drawers: 22, wide: 6 },
  'bins6x4': { title: '6 × 4 box', cols: 6, rows: 4, drawers: 0, bins: 24 },
  'bins6x2': { title: '6 × 2 box', cols: 6, rows: 2, drawers: 0, bins: 12 },
  'bins4x3': { title: '4 × 3 box', cols: 4, rows: 3, drawers: 0, bins: 12 },
  'bins4x4': { title: '4 × 4 box', cols: 4, rows: 4, drawers: 0, bins: 16 },
};
// A custom box (kind 'custom') draws its own compartments: c.box = { cols, rows, cells: [{ x, y, w, h }] } on a grid of
// equal units, each cell a rectangle of units, numbered 1.. in the order given (bins are that number after the box's letter).
// kindOf(c) describes any cabinet the way a KINDS entry does, with cells for a custom one.
function kindOf(c) {
  if (c?.kind !== 'custom') return KINDS[c?.kind] || KINDS['8x8'];
  const b = c.box || { cols: 4, rows: 3, cells: [] }, cells = (b.cells || []).filter(x => x.w > 0 && x.h > 0);
  return { title: `custom box, ${cells.length} compartments`, cols: +b.cols || 4, rows: +b.rows || 3, drawers: 0, bins: cells.length, cells, custom: true };
}
const DEFAULT_LAYOUT = { cabinets: [{ id: 'c1', title: 'Cabinet 1', kind: '8x8' }, { id: 'c2', title: 'Cabinet 2', kind: '8x8' }, { id: 'c3', title: 'Cabinet 3', kind: '8x8' }], counts: { imperial: 88, metric: 64 } };
const layoutOf = d => ({ ...DEFAULT_LAYOUT, ...(d?.layout || {}), cabinets: (d?.layout?.cabinets || DEFAULT_LAYOUT.cabinets), counts: { ...DEFAULT_LAYOUT.counts, ...(d?.layout?.counts || {}) } });
// the physical positions: drawers numbered 1.. across the drawer cabinets in order. Bins are named by a letter and a
// number: each box has its own letter (box.prefix: A1…A24), loose bins not in any box are B-numbered, so a box never
// captures bins that already exist. The categories' prefixes (I, M, W, …) cannot be bin letters.
const binLetters = () => { const taken = new Set(cats().map(c => c.prefix)); return 'ACDEFGHIJKLMNOPQRSTUVWXYZ'.split('').filter(ch => !taken.has(ch)); };   // not B (loose bins), not a category's prefix
const boxPrefix = (lay, i) => lay.cabinets[i].prefix || binLetters()[lay.cabinets.slice(0, i).filter(c => kindOf(c).bins).length] || 'Z';
function positions(d) {
  const lay = layoutOf(d), out = [], bins = []; let pos = 0;
  lay.cabinets.forEach((c, cabIx) => {
    const k = kindOf(c);
    for (let i = 1; i <= k.drawers; i++) out.push({ pos: ++pos, cabIx, index: i, wide: !!k.wide && i > k.drawers - k.wide });
    if (k.bins) { const pre = boxPrefix(lay, cabIx); for (let i = 1; i <= k.bins; i++) bins.push({ bin: `${pre}${i}`, cabIx, index: i }); }
  });
  // categories take their counts in order; the last one takes whatever is left
  const ranges = []; let start = 1;
  const C = categoriesOf(d);
  C.forEach((c, i) => { const count = i === C.length - 1 ? Math.max(0, out.length - start + 1) : (+lay.counts[c.id] || 0); ranges.push({ id: c.id, start, count }); start += count; });
  return { layout: lay, drawers: out, bins, ranges };
}
const positionOf = (d, id, n) => { const r = positions(d).ranges.find(r => r.id === id); return r ? r.start + (+n) - 1 : NaN; };
const atPosition = (d, pos) => { const r = positions(d).ranges.find(r => pos >= r.start && pos < r.start + r.count); return r ? { cabinet: r.id, drawer: pos - r.start + 1 } : null; };
// ---- label sizes ----
// A physical cabinet or box may set the size of its labels: layout.cabinets[i].label = { tape, len } (mm); the loose (B) bins
// share layout.loose.label. Unset, drawers take 9 mm × 50 mm and bins 18 mm × 50 mm. TAPES: tape width -> printable height
// (mm), the strip the printer driver centres on the tape; only widths whose printable height has been measured are offered.
const TAPES = { 9: 7.0, 12: 9.5, 18: 15.5 };
const LABEL_DEFAULT = { drawer: { tape: 9, len: 50 }, bin: { tape: 18, len: 50 } };
const LABEL_LEN = { min: 20, max: 200 };
// fg / bg = the tape: print colour and tape colour (black on white unless set, e.g. black on neon green for a box of bins)
const LABEL_FG = '#000000', LABEL_BG = '#ffffff';
const cleanLabel = (l, kind) => { const def = LABEL_DEFAULT[kind], tape = TAPES[+l?.tape] ? +l.tape : def.tape, len = Math.min(LABEL_LEN.max, Math.max(LABEL_LEN.min, +l?.len || def.len)); return { tape, len, fg: hex(l?.fg, LABEL_FG), bg: hex(l?.bg, LABEL_BG) }; };
const plainTape = z => z.fg === LABEL_FG && z.bg === LABEL_BG;
// a rough name for a colour, for "load the black on green tape"
function colourName(h) {
  const n = parseInt(hex(h, '#000000').slice(1), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, c = mx - mn;
  if (c < 0.12) return l > 0.85 ? 'white' : l < 0.2 ? 'black' : 'grey';
  const hue = ((mx === r ? ((g - b) / c) % 6 : mx === g ? (b - r) / c + 2 : (r - g) / c + 4) * 60 + 360) % 360;
  return hue < 15 ? 'red' : hue < 45 ? 'orange' : hue < 70 ? 'yellow' : hue < 170 ? 'green' : hue < 200 ? 'cyan' : hue < 260 ? 'blue' : hue < 300 ? 'purple' : hue < 345 ? 'pink' : 'red';
}
const tapeName = z => `${colourName(z.fg)} on ${colourName(z.bg)}`;
// the label size at a location ({ kind:'drawer', cabinet, drawer } | { kind:'bin', bin } | nothing: stock without a place prints as a default drawer label)
function labelSpec(d, loc) {
  const P = positions(d);
  if (loc?.kind === 'bin') { const b = P.bins.find(x => x.bin === loc.bin); return cleanLabel(b ? P.layout.cabinets[b.cabIx].label : P.layout.loose?.label, 'bin'); }
  if (loc?.kind === 'drawer') { const pos = positionOf(d, loc.cabinet || categoriesOf(d)[0].id, loc.drawer), dr = P.drawers[pos - 1]; return cleanLabel(dr ? P.layout.cabinets[dr.cabIx].label : null, 'drawer'); }
  return cleanLabel(null, 'drawer');
}
// every label size in use, as "9x50" strings: the two defaults plus whatever the cabinets, boxes and loose bins set
function labelSizes(d) {
  const lay = layoutOf(d), out = [LABEL_DEFAULT.drawer, LABEL_DEFAULT.bin, cleanLabel(lay.loose?.label, 'bin'), ...lay.cabinets.map(c => cleanLabel(c.label, kindOf(c).bins ? 'bin' : 'drawer'))];
  return [...new Set(out.map(z => `${z.tape}x${z.len}`))].sort((a, b) => parseInt(a) - parseInt(b) || +a.split('x')[1] - +b.split('x')[1]);
}
const cabinetById = id => cats().find(c => c.id === id);
const cabinetByPrefix = ch => cats().find(c => c.prefix === String(ch || '').toUpperCase());
// ---- locations ----
// A location is { kind:'drawer', drawer:'12', half:'back'|'front'|'' } or { kind:'bin', bin:'B7' }. It can be set on the cell
// (cell.loc), on one head type (cell.detail[type].loc) or on one drive+material of a head (cell.detail[type].items['drive|material'].loc);
// the most specific one wins. Each level may also carry overflow locations (…overflow: [loc, ...]).
// Older data used cell.drawer / cell.half and detail[type].drawer / half; those still read as drawer locations.
const slotOf = l => !l ? '' : l.kind === 'bin' ? `B:${l.bin}` : (l.drawer ? `D:${l.cabinet || ''}:${l.drawer}|${l.half || ''}` : '');
const locOf = o => o?.loc?.kind === 'bin' ? (o.loc.bin ? { kind: 'bin', bin: String(o.loc.bin) } : null)
  : o?.loc?.drawer ? { kind: 'drawer', drawer: String(o.loc.drawer), half: o.loc.half || '', ...(o.loc.cabinet ? { cabinet: o.loc.cabinet } : {}) }
  : o?.drawer ? { kind: 'drawer', drawer: String(o.drawer), half: o.half || '' } : null;
const overflowOf = o => (o?.overflow || []).map(l => locOf({ loc: l })).filter(Boolean);
// a drawer location with its cabinet filled in from the page when it does not name one
// Moving a page to another category must not move its stock: a drawer location that leaned on the page's old category gets it
// spelled out, and one that named the new category becomes the implicit one. (Locations are { kind:'drawer', … } objects at
// any depth: cell, head type, drive + material, overflow lists; older data has bare drawer / half fields.)
function recategorize(page, id) {
  const old = page.cabinet || '', walk = o => {
    if (Array.isArray(o)) return o.forEach(walk);
    if (!o || typeof o !== 'object') return;
    if (o.drawer && !o.kind && !o.loc) { o.loc = { kind: 'drawer', drawer: String(o.drawer), half: o.half || '' }; delete o.drawer; delete o.half; }
    if (o.kind === 'drawer') { if (!o.cabinet && old) o.cabinet = old; if (o.cabinet === id) delete o.cabinet; return; }
    Object.values(o).forEach(walk);
  };
  walk(page.cells); walk(page.items);
  if (id) page.cabinet = id; else delete page.cabinet;
}
const inCabinet = (page, l) => !l || l.kind !== 'drawer' ? l : { ...l, cabinet: l.cabinet || page.cabinet || '' };
// the items of a cell: one per (type, drive, material) recorded, else per type; each with its resolved primary and overflow locations
// each item also says which level its location came from: locLevel / overLevel = 'item' | 'type' | 'cell' | '' (none)
function items(page, key) {
  const fix = l => inCabinet(page, l), fixAll = ls => ls.map(fix);
  // An item's category (a screw is a construction screw whatever page it is on): item.cat, else its head's, else its cell's,
  // else the page's default (page.cabinet). catLevel says where it came from.
  const catOf = (o, from) => o?.cat ? [o.cat, from] : null;
  if (isList(page)) { const it = listItem(page, key); return it ? [{ key, type: it.glyph || '', drive: '', material: '', loc: fix(locOf(it)), overflow: fixAll(overflowOf(it)), locLevel: locOf(it) ? 'cell' : '', overLevel: overflowOf(it).length ? 'cell' : '', whole: !!it.whole, cat: it.cat || page.cabinet || '', catLevel: it.cat ? 'cell' : '' }] : []; }
  const c = page.cells[key] || {}, out = [];
  const cellCat = catOf(c, 'cell') || [page.cabinet || '', ''];
  const cellLoc = locOf(c), cellOver = overflowOf(c);
  for (const t of c.types || []) {
    const o = (c.detail || {})[t] || {};
    const typeLoc = locOf(o) || cellLoc, typeLL = locOf(o) ? 'type' : cellLoc ? 'cell' : '';
    const typeOver = overflowOf(o).length ? overflowOf(o) : (locOf(o) ? [] : cellOver), typeOL = overflowOf(o).length ? 'type' : (!locOf(o) && cellOver.length) ? 'cell' : '';
    const combos = [];
    if (o.drives) for (const [d, mats] of Object.entries(o.drives)) { if (mats.length) for (const m of mats) combos.push([d, m]); else combos.push([d, '']); }
    if (o.materials) for (const m of o.materials) combos.push(['', m]);
    if (!combos.length) combos.push(['', '']);
    for (const [d, m] of combos) {
      const it = (o.items || {})[`${d}|${m}`] || {};
      const loc = locOf(it) || typeLoc, locLevel = locOf(it) ? 'item' : typeLL;
      const over = overflowOf(it).length ? overflowOf(it) : (locOf(it) ? [] : typeOver), overLevel = overflowOf(it).length ? 'item' : (!locOf(it) ? typeOL : '');
      const [cat, catLevel] = catOf(it, 'item') || catOf(o, 'type') || cellCat;
      out.push({ key, type: t, drive: d, material: m, loc: fix(loc), overflow: fixAll(over), locLevel, overLevel, whole: !!c.whole, cat, catLevel });
    }
  }
  return out;
}
// portions: every populated cell split by location; one piece per distinct location, listing the types in it.
// { key, types, kind, drawer, half, bin, overflow: bool }  — a piece with no location at all keeps the cell's own slot
function portions(page, keys) {
  const out = [];
  for (const k of keys || populated(page)) {
    const by = {};
    const add = (loc, it, over) => {
      const slot = loc ? slotOf(loc) + (over ? '#o' : '') : `cell:${k}`;
      const p = by[slot] = by[slot] || { key: k, types: [], items: [], kind: loc?.kind || '', cabinet: loc?.cabinet || '', drawer: loc?.drawer || '', half: loc?.half || '', bin: loc?.bin || '', overflow: !!over };
      if (it.type && !p.types.includes(it.type)) p.types.push(it.type);
      p.items.push(it);
    };
    for (const it of items(page, k)) { add(it.loc, it, false); for (const ov of it.overflow) add(ov, it, true); }
    out.push(...Object.values(by));
  }
  return out;
}
// ---- moving single items (the Find page) ----
// relocate(d, moves): each move = { pageId, key, type, drive, material, overflow: false | the slot of the overflow location that
// moves, to: location | null }. An item's primary location and each of its overflow locations move separately. The item's
// locations are written out at its own level (so the rest of its cell stays put, and it keeps the overflow it inherited unless
// that moved too); a cell whose items then all agree again is folded back to one location on the cell. Returns the cells touched.
function relocate(d, moves) {
  const byItem = new Map(), touched = new Map();
  for (const m of moves) { const k = [m.pageId, m.key, m.type, m.drive, m.material].join('\n'); if (!byItem.has(k)) byItem.set(k, []); byItem.get(k).push(m); }
  for (const ms of byItem.values()) {
    const m0 = ms[0], page = d.pages.find(p => p.id === m0.pageId); if (!page) continue;
    const eff = items(page, m0.key).find(it => it.type === m0.type && it.drive === m0.drive && it.material === m0.material); if (!eff) continue;
    let prim = eff.loc, over = [...eff.overflow];
    for (const m of ms) { const to = m.to ? inCabinet(page, m.to) : null; if (m.overflow === false || m.overflow == null) prim = to; else over = over.map(l => slotOf(l) === m.overflow ? to : l).filter(Boolean); }
    const seen = new Set(prim ? [slotOf(prim)] : []); over = over.filter(l => !seen.has(slotOf(l)) && seen.add(slotOf(l)));   // overflow that joined the primary, or another overflow, is just that place
    const store = l => { const x = { ...l }; if (x.kind === 'drawer' && x.cabinet === (page.cabinet || '')) delete x.cabinet; if (x.kind === 'drawer' && !x.half) delete x.half; return x; };
    let o;
    if (isList(page)) o = listItem(page, m0.key);
    else { const c = page.cells[m0.key]; c.detail = c.detail || {}; const t = c.detail[m0.type] = c.detail[m0.type] || {}; t.items = t.items || {}; o = t.items[`${m0.drive}|${m0.material}`] = t.items[`${m0.drive}|${m0.material}`] || {}; }
    delete o.drawer; delete o.half;
    if (prim) o.loc = store(prim); else delete o.loc;
    if (over.length) o.overflow = over.map(store); else delete o.overflow;
    touched.set(m0.pageId + '\n' + m0.key, [page, m0.key]);
  }
  for (const [page, key] of touched.values()) foldCell(page, key);
  return [...touched.values()].map(([page, key]) => ({ pageId: page.id, key }));
}
// ---- moving items to another page (the Find page's "Move ticked to page…") ----
// rows are ordered by major diameter, then pitch (metric: coarse first; imperial: fewer threads first)
function diaValue(dia) {   // major diameter in inches
  if (dia.startsWith('#')) { const t = dia.slice(1); if (/^0+$/.test(t)) return 0.06 - 0.013 * (t.length - 1); return 0.06 + 0.013 * +t; }
  if (dia.endsWith('mm')) return parseFloat(dia) / 25.4;
  if (dia.startsWith('M')) return +dia.slice(1) / 25.4; const [n, d] = dia.split('/'); return d ? n / d : +dia;
}
const rowKey = (p, r) => [diaValue(r.dia), p.units === 'mm' && r.dia.startsWith('M') ? -r.pitch : r.pitch];
function sortRows(p) { p.rows.sort((a, b) => { const [ka, pa] = rowKey(p, a), [kb, pb] = rowKey(p, b); return (ka - kb) || (pa - pb); }); }
// the same cell on another page: the row is copied over if missing, a length converted between inches and mm (to 0.5 mm / 1/32")
// and added to that page's lengths if missing. Returns the key there, or null when the cell is not a size × length or hardware cell
function cellOn(from, to, key) {
  const [a, b] = key.split('|'), row = from.rows.find(r => r.id === a), hw = HW.find(h => h[1] === b);
  if (hw && hw[2] === 'dia') return key;   // washers go by diameter: same key
  if (!row) return null;
  if (!to.rows.some(r => r.id === row.id)) { to.rows.push({ ...row }); sortRows(to); }
  if (hw) return key;
  let len = +b; if (isNaN(len)) return null;
  if ((from.units === 'mm') !== (to.units === 'mm')) len = to.units === 'mm' ? Math.round(len * 25.4 * 2) / 2 : Math.round(len / 25.4 * 32) / 32;
  if (!lengths(to).includes(len)) { to.lengths = to.lengths || { start: len, stop: len, step: 1 }; to.lengths.skip = (to.lengths.skip || []).filter(x => x !== len); (to.lengths.extra = to.lengths.extra || []).push(len); }
  return `${row.id}|${len}`;
}
// move items ({ pageId, key, type, drive, material }, grouped by item; overflow ignored: the whole item goes) to page `toId`.
// A head that is already on the target cell takes the item in (drives/materials merged); the item's places travel with it,
// spelled out per item, with a drawer of the old page's category named as such. Returns the cells touched on both pages.
function moveItems(d, moves, toId) {
  const to = d.pages.find(p => p.id === toId); if (!to || isList(to)) return [];
  const touched = new Map(), key = m => [m.pageId, m.key, m.type, m.drive, m.material].join('\n'), done = new Set();
  for (const m of moves) {
    if (done.has(key(m))) continue; done.add(key(m));
    const from = d.pages.find(p => p.id === m.pageId); if (!from || from === to || isList(from)) continue;
    const eff = items(from, m.key).find(it => it.type === m.type && it.drive === m.drive && it.material === m.material); if (!eff) continue;
    const k2 = cellOn(from, to, m.key); if (!k2) continue;
    const c = from.cells[m.key], t = to.cells[k2] = to.cells[k2] || { types: [] };
    if (!t.types.includes(m.type)) t.types.push(m.type);
    t.detail = t.detail || {}; const td = t.detail[m.type] = t.detail[m.type] || {};
    if (m.drive) { td.drives = td.drives || {}; td.drives[m.drive] = td.drives[m.drive] || []; if (m.material && !td.drives[m.drive].includes(m.material)) td.drives[m.drive].push(m.material); }
    else if (m.material) { td.materials = td.materials || []; if (!td.materials.includes(m.material)) td.materials.push(m.material); }
    // its places, at item level on the new page (a drawer stays in the category it was in)
    const store = l => { const x = { ...l }; if (x.kind === 'drawer') { x.cabinet = x.cabinet || from.cabinet || ''; if (x.cabinet === (to.cabinet || '') || !x.cabinet) delete x.cabinet; if (!x.half) delete x.half; } return x; };
    if (eff.loc || eff.overflow.length || eff.cat !== (to.cabinet || '')) { td.items = td.items || {}; const it = td.items[`${m.drive}|${m.material}`] = td.items[`${m.drive}|${m.material}`] || {}; if (eff.loc) it.loc = store(eff.loc); if (eff.overflow.length) it.overflow = eff.overflow.map(store); if (eff.cat !== (to.cabinet || '')) it.cat = eff.cat; }   // it stays what it is
    // and out of the old cell
    const od = (c.detail || {})[m.type] || {};
    if (m.drive && od.drives) { od.drives[m.drive] = (od.drives[m.drive] || []).filter(x => x !== m.material); if (!od.drives[m.drive].length) delete od.drives[m.drive]; if (!Object.keys(od.drives).length) delete od.drives; }
    else if (m.material && od.materials) { od.materials = od.materials.filter(x => x !== m.material); if (!od.materials.length) delete od.materials; }
    if (od.items) { delete od.items[`${m.drive}|${m.material}`]; if (!Object.keys(od.items).length) delete od.items; }
    // the head leaves the old cell when nothing of it is left there (a head with no drive or material recorded is one item: it goes whole)
    if ((!m.drive && !m.material) || !(Object.keys(od.drives || {}).length || (od.materials || []).length)) { c.types = c.types.filter(x => x !== m.type); if (c.detail) delete c.detail[m.type]; }
    touched.set(from.id + '\n' + m.key, [from, m.key]); touched.set(to.id + '\n' + k2, [to, k2]);
  }
  for (const [page, key] of touched.values()) { if (page.cells[key] && !page.cells[key].types.length) delete page.cells[key]; else if (page.cells[key]) { foldCell(page, key); setCategory(d, [], null); } }   // an emptied cell goes
  return [...touched.values()].map(([page, key]) => ({ pageId: page.id, key }));
}
// setCategory(d, items: [{ pageId, key, type, drive, material }], catId): each item's category, written at its own level;
// a cell whose items then all agree carries it once (or nothing, when it is the page's default)
function setCategory(d, its, catId) {
  const touched = new Map();
  for (const m of its) {
    const page = d.pages.find(p => p.id === m.pageId); if (!page) continue;
    let o; if (isList(page)) o = listItem(page, m.key); else { const c = page.cells[m.key]; if (!c) continue; c.detail = c.detail || {}; const t = c.detail[m.type] = c.detail[m.type] || {}; t.items = t.items || {}; o = t.items[`${m.drive}|${m.material}`] = t.items[`${m.drive}|${m.material}`] || {}; }
    if (!o) continue; o.cat = catId; touched.set(page.id + '\n' + m.key, [page, m.key]);
  }
  for (const [page, key] of touched.values()) {
    if (isList(page)) { const it = listItem(page, key); if (it && it.cat === (page.cabinet || '')) delete it.cat; continue; }
    const c = page.cells[key], its2 = items(page, key); if (!c || !its2.length) continue;
    if (its2.every(it => it.cat === its2[0].cat)) {
      for (const t of Object.values(c.detail || {})) { delete t.cat; for (const [ik, it] of Object.entries(t.items || {})) { delete it.cat; if (!Object.keys(it).length) delete t.items[ik]; } if (t.items && !Object.keys(t.items).length) delete t.items; }
      if (its2[0].cat && its2[0].cat !== (page.cabinet || '')) c.cat = its2[0].cat; else delete c.cat;
    }
  }
  return [...touched.values()].map(([page, key]) => ({ pageId: page.id, key }));
}
// when every item of a cell is in the same places, say so once, on the cell
function foldCell(page, key) {
  if (isList(page)) return;
  const c = page.cells[key], its = items(page, key); if (!c || !its.length) return;
  const sig = it => slotOf(it.loc) + ' + ' + it.overflow.map(slotOf).join(',');
  if (its.some(it => sig(it) !== sig(its[0]))) return;
  const store = l => { const x = { ...l }; if (x.kind === 'drawer' && x.cabinet === (page.cabinet || '')) delete x.cabinet; if (x.kind === 'drawer' && !x.half) delete x.half; return x; };
  const strip = o => { delete o.loc; delete o.overflow; delete o.drawer; delete o.half; };
  for (const t of Object.values(c.detail || {})) { strip(t); for (const [ik, it] of Object.entries(t.items || {})) { strip(it); if (!Object.keys(it).length) delete t.items[ik]; } if (t.items && !Object.keys(t.items).length) delete t.items; }
  strip(c); if (its[0].loc) c.loc = store(its[0].loc); if (its[0].overflow.length) c.overflow = its[0].overflow.map(store);
}
const portionSlot = p => p.kind === 'bin' ? `B:${p.bin}` : p.kind === 'drawer' ? `D:${p.cabinet || ''}:${p.drawer}|${p.half || ''}` : '';
// location text: "12", "12R", "12F" for drawers, "B3" for bins, with the cabinet prefix when the drawer is in a cabinet other
// than `home` (a page's own cabinet); parseLoc reads the same (plus "12 rear", "bin 3", "b3", "M12R")
const prefixFor = (l, home) => l.cabinet && l.cabinet !== home ? (cabinetById(l.cabinet)?.prefix || '') : '';
const locText = (l, home) => !l ? '' : l.kind === 'bin' ? l.bin : prefixFor(l, home) + l.drawer + (l.half === 'back' ? 'R' : l.half === 'front' ? 'F' : '');
// ---- places as people see them ----
// The category letters and box letters ("M12R", "C5") are only how a place is written in one token internally. People choose a
// container by name (a category's drawers, a box of bins, the loose bins) and give a number in it.
// containers(d) -> [{ id, kind: 'drawer' | 'bin', title, cabinet | prefix }]
function containers(d) {
  // titles say what kind of container it is, since a category and a box may share a name ("Construction Screws drawers" / "… box")
  const lay = layoutOf(d), out = categoriesOf(d).map(c => ({ id: `cat:${c.id}`, kind: 'drawer', cabinet: c.id, title: `${c.title} drawers`, name: c.title }));
  lay.cabinets.forEach((c, i) => { if (kindOf(c).bins) out.push({ id: `box:${boxPrefix(lay, i)}`, kind: 'bin', prefix: boxPrefix(lay, i), title: `${c.title} box`, name: c.title, bins: kindOf(c).bins }); });
  out.push({ id: 'box:B', kind: 'bin', prefix: 'B', title: 'Loose bins' });
  return out;
}
const containerOf = (l, home) => !l ? '' : l.kind === 'bin' ? `box:${l.bin[0]}` : `cat:${l.cabinet || home || ''}`;
// the number of a place within its container: "12R", "5"
const numberIn = l => !l ? '' : l.kind === 'bin' ? l.bin.slice(1) : l.drawer + (l.half === 'back' ? 'R' : l.half === 'front' ? 'F' : '');
// a container + what was typed -> a location, null for nothing typed, undefined when it cannot be read
function placeIn(container, text) {
  const t = String(text || '').trim(); if (!t) return null; if (!container) return undefined;
  if (container.kind === 'bin') { const m = /^(?:bin\s*)?(\d+)$/i.exec(t); return m ? { kind: 'bin', bin: `${container.prefix}${+m[1]}` } : undefined; }
  const m = /^(\d+)\s*(r|rear|b|back|f|front)?$/i.exec(t); if (!m) return undefined;
  const h = (m[2] || '').toLowerCase();
  return { kind: 'drawer', cabinet: container.cabinet, drawer: m[1], half: /^(r|rear|b|back)$/.test(h) ? 'back' : /^(f|front)$/.test(h) ? 'front' : '' };
}
const boxTitle = bin => { const c = containers(current()).find(x => x.kind === 'bin' && x.prefix === String(bin)[0]); return c ? c.name || c.title : 'Bins'; };
// a place in words: "12R" on its own category's page, "Metric 12R" elsewhere (the category's first word); a bin is its box's name
// and its number, "Plastics box bin 5", or "bin 5" among the loose ones
const locName = (l, home) => !l ? '' : l.kind === 'bin' ? (l.bin[0] === 'B' ? `bin ${l.bin.slice(1)}` : `${boxTitle(l.bin)} bin ${l.bin.slice(1)}`)
  : (l.cabinet && l.cabinet !== home ? (cabinetById(l.cabinet)?.title || '').split(/\s+/)[0] + ' ' : '') + numberIn(l);
const locLong = (l, home) => !l ? '' : l.kind === 'bin' ? locName(l, home) : `${l.cabinet && l.cabinet !== home ? cabinetById(l.cabinet)?.title.replace(/ screws$/, '') + ' ' : ''}drawer ${l.drawer}${l.half === 'back' ? ' rear' : l.half === 'front' ? ' front' : ''}`;
function parseLoc(text) {
  const t = String(text || '').trim(); if (!t) return null;
  let m = /^(bin\s*)?([a-z])\s*(\d+)$/i.exec(t); if (m && (m[1] || !cabinetByPrefix(m[2]))) return { kind: 'bin', bin: `${m[2].toUpperCase()}${+m[3]}` };   // B = loose bins, any other letter that is not a category's = a box
  m = /^([a-z])?\s*(\d+)\s*(r|rear|b|back|f|front)?$/i.exec(t); if (!m || (m[1] && !cabinetByPrefix(m[1]))) return undefined;   // undefined = not understood
  const h = (m[3] || '').toLowerCase();
  return { kind: 'drawer', drawer: m[2], half: /^(r|rear|b|back)$/.test(h) ? 'back' : /^(f|front)$/.test(h) ? 'front' : '', ...(m[1] ? { cabinet: cabinetByPrefix(m[1]).id } : {}) };
}
const parseLocs = text => String(text || '').replace(/bin\s+(?=\d)/gi, 'B').replace(/([a-z])\s+(?=\d)/gi, '$1').replace(/(\d)\s+(r|rear|b|back|f|front)\b/gi, '$1$2').split(/[,;\s]+/).filter(Boolean).map(parseLoc);
// every bin named anywhere on a page (primary or overflow, at any level)
function bins(page) {
  const out = new Set();
  for (const k of populated(page)) for (const it of items(page, k)) { if (it.loc?.kind === 'bin') out.add(it.loc.bin); for (const o of it.overflow) if (o.kind === 'bin') out.add(o.bin); }
  return [...out].sort(binOrder);
}
const binOrder = (a, b) => a[0].localeCompare(b[0]) || (parseInt(a.slice(1)) - parseInt(b.slice(1)));
// short names for the label qualifiers (an item that is only part of its cell's stock says what sets it apart)
// label short names: a plain material, or material + finish ("zinc" for plain-steel finishes, "SS chrome", "Al anodized", "brass nickel")
const MAT_SHORT = { aluminum: 'Al', steel: 'steel', stainless: 'SS', brass: 'brass', nylon: 'nylon', plastic: 'plastic', fiber: 'fiber', copper: 'Cu', bronze: 'bronze', ptfe: 'PTFE', phenolic: 'phenolic', pei: 'PEI', polycarbonate: 'PC' };
const FIN_SHORT = { blackoxide: 'blk oxide', zincyellow: 'yellow zinc', galvanized: 'galv', tinzinc: 'tin-zinc', cadmium: 'cad', anodized: 'anodized', ticn: 'TiCN', chrome: 'chrome', nickel: 'nickel', zinc: 'zinc', ceramic: 'ceramic', gold: 'gold', bronze: 'bronze', brass: 'brass', tin: 'tin' };
function matShort(key) {
  const [b, f] = String(key || '').split('-'); if (!f) return MAT_SHORT[b] || b;
  const fin = b === 'steel' && f === 'tin' ? 'TiN' : (FIN_SHORT[f] || f);
  return b === 'steel' ? fin : `${MAT_SHORT[b] || b} ${fin}`;
}
const DRIVE_SHORT = { slotted: 'slotted', phillips: 'Phillips', combo: 'combo', pozidriv: 'Pozi', jis: 'JIS', torx: 'Torx', torxplus: 'Torx+', hex: 'hex', square: 'square' };
// print order: labels with a drawer first, by drawer number then rear before front; the rest in reading order
function drawerOrder(page, groups) {
  const C = cats(), cabIx = id => Math.max(0, C.findIndex(c => c.id === id));
  const key = g => { const c = g[0]; return c.kind === 'drawer' ? [0, cabIx(c.cabinet), +c.drawer, c.half === 'front' ? 1 : 0] : c.kind === 'bin' ? [1, 0, 0, 0] : [2, 0, 0, 0]; };
  return groups.map((g, i) => [g, key(g), i]).sort((a, b) => (a[1][0] - b[1][0]) || (a[1][1] - b[1][1]) || (a[1][2] - b[1][2]) || (a[1][3] - b[1][3]) || (a[2] - b[2])).map(x => x[0]);
}
const api = { setCategory, moveItems, cellOn, sortRows, kindOf, locName, containers, containerOf, numberIn, placeIn, boxTitle, bind, categoriesOf, recategorize, relocate, foldCell, DEFAULT_CATEGORIES, get CABINETS() { return cats(); }, get BIN_LETTERS() { return binLetters(); }, LABEL_FG, LABEL_BG, plainTape, colourName, tapeName, TAPES, LABEL_DEFAULT, LABEL_LEN, cleanLabel, labelSpec, labelSizes, KINDS, DEFAULT_LAYOUT, boxPrefix, binOrder, layoutOf, positions, positionOf, atPosition, cabinetById, cabinetByPrefix, inCabinet, isList, listItem, lengthText, lengths, screwKey, nutKey, washerKey, cellText, populated, items, portions, portionSlot, slotOf, locOf, overflowOf, locText, locLong, parseLoc, parseLocs, bins, drawerOrder, HW, MAT_SHORT, FIN_SHORT, matShort, DRIVE_SHORT };
if (typeof module !== 'undefined') module.exports = api; else window.M = api;   // the same file is served to the browser
})();
