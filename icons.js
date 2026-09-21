// Copyright (C) 2026 Aaron Solochek. Licensed under the GNU GPL v3; see LICENSE.
// Side-profile icons for fastener heads, nuts and washers. Same line weight and feel as the pinout glyphs.
// Each icon is drawn in a 100 × 100 box; icons(list) sets several side by side for a label glyph.
const K = '#000', SW = 5;
const shank = (x, y0, y1) => `<line x1="${x}" y1="${y0}" x2="${x}" y2="${y1}" stroke="${K}" stroke-width="${SW * 2.2}" stroke-linecap="butt"/>`;
const threads = (x, y0, y1) => { let g = ''; for (let y = y0 + 6; y < y1 - 2; y += 8) g += `<line x1="${x - 9}" y1="${y}" x2="${x + 9}" y2="${y + 3}" stroke="${K}" stroke-width="2.5"/>`; return g; };
// ---- screws are composed: a head shape, then captive washers under it, then a shank whose tip is blunt, pointed or a drill
// point; a blunt or pointed tip may also be thread-cutting (a notch or slot up through the first threads). A variant key
// names the combination: "pan", "pan:p" (pointed), "pan:p:c" (pointed, thread-cutting: the wood screw's type 17 point),
// "pan:c" (blunt, thread-cutting), "pan:d" (self-drilling), "pan:wfs" (flat + split washers).
const HEAD = { border: `fill="none" stroke="${K}" stroke-width="${SW}" stroke-linejoin="round"` };
// head shapes: drawn from the top down to `base`, where the washers and shank start
const SHAPES = {
  flat:     { base: 44, svg: `<path d="M20 22 H80 L62 44 H38 Z" ${HEAD.border}/><line x1="50" y1="22" x2="50" y2="34" stroke="${K}" stroke-width="3.5"/>` },
  oval:     { base: 48, svg: `<path d="M20 30 Q50 8 80 30 L62 48 H38 Z" ${HEAD.border}/><line x1="50" y1="24" x2="50" y2="38" stroke="${K}" stroke-width="3.5"/>` },
  // rounded heads, profiles after the usual supplier chart: pan = low with a flattish top and short sides; button = low dome;
  // round = a half-circle dome; truss = very wide, very low; cheese = tall cylinder; fillister = cylinder with a domed top;
  // binding = short cylinder with a domed top and a small undercut lip; pancake = a very thin wide disc
  pan:      { base: 44, svg: `<path d="M22 44 V36 Q22 28 30 26 Q50 20 70 26 Q78 28 78 36 V44 Z" ${HEAD.border}/><line x1="38" y1="29" x2="62" y2="29" stroke="${K}" stroke-width="3.5"/>` },
  button:   { base: 44, svg: `<path d="M22 44 V30 Q22 16 36 16 H64 Q78 16 78 30 V44 Z" ${HEAD.border}/>` },
  round:    { base: 44, svg: `<path d="M24 44 A26 26 0 0 1 76 44 Z" ${HEAD.border}/>` },
  truss:    { base: 44, svg: `<path d="M12 44 V40 Q12 26 50 24 Q88 26 88 40 V44 Z" ${HEAD.border}/>` },
  cheese:   { base: 44, svg: `<path d="M30 44 V20 Q30 14 36 14 H64 Q70 14 70 20 V44 Z" ${HEAD.border}/><line x1="50" y1="14" x2="50" y2="28" stroke="${K}" stroke-width="3.5"/>` },
  fillister:{ base: 44, svg: `<path d="M30 44 V26 Q30 12 50 12 Q70 12 70 26 V44 Z" ${HEAD.border}/><line x1="50" y1="14" x2="50" y2="28" stroke="${K}" stroke-width="3.5"/>` },
  binding:  { base: 44, svg: `<path d="M28 44 V40 H26 V30 Q26 18 40 18 H60 Q74 18 74 30 V40 H72 V44 Z" ${HEAD.border}/><line x1="50" y1="18" x2="50" y2="30" stroke="${K}" stroke-width="3.5"/>` },
  pancake:  { base: 44, svg: `<path d="M12 44 V38 Q12 32 18 32 H82 Q88 32 88 38 V44 Z" ${HEAD.border}/>` },
  socket:   { base: 44, svg: `<rect x="26" y="14" width="48" height="30" rx="3" fill="none" stroke="${K}" stroke-width="${SW}"/>` },
  hex:      { base: 44, svg: `<path d="M22 20 H78 V44 H22 Z" ${HEAD.border}/><line x1="40" y1="20" x2="40" y2="44" stroke="${K}" stroke-width="3"/><line x1="60" y1="20" x2="60" y2="44" stroke="${K}" stroke-width="3"/>` },
  hexwasher:{ base: 44, svg: `<path d="M22 20 H78 V38 H22 Z" ${HEAD.border}/><line x1="40" y1="20" x2="40" y2="38" stroke="${K}" stroke-width="3"/><line x1="60" y1="20" x2="60" y2="38" stroke="${K}" stroke-width="3"/><line x1="16" y1="44" x2="84" y2="44" stroke="${K}" stroke-width="${SW}"/><line x1="22" y1="38" x2="22" y2="44" stroke="${K}" stroke-width="${SW}"/><line x1="78" y1="38" x2="78" y2="44" stroke="${K}" stroke-width="${SW}"/>` },
  flange:   { base: 44, svg: `<path d="M30 36 V30 Q30 18 42 18 H58 Q70 18 70 30 V36 Z" ${HEAD.border}/><path d="M16 36 H84 V44 H16 Z" ${HEAD.border}/>` },
  thumb:    { base: 44, svg: `<path d="M30 14 H70 V44 H30 Z" ${HEAD.border}/>${[36, 43, 50, 57, 64].map(x => `<line x1="${x}" y1="18" x2="${x}" y2="40" stroke="${K}" stroke-width="2.5"/>`).join('')}` },
  carriage: { base: 44, svg: `<path d="M16 32 Q16 8 50 8 Q84 8 84 32 Z" ${HEAD.border}/><rect x="40" y="32" width="20" height="12" fill="none" stroke="${K}" stroke-width="${SW}"/>` },
  trim:     { base: 36, svg: `<path d="M38 22 H62 L56 36 H44 Z" ${HEAD.border}/>` },
  // whole-body shapes: no washers or tips are composed onto these
  shoulder: { whole: `<rect x="30" y="10" width="40" height="24" rx="3" fill="none" stroke="${K}" stroke-width="${SW}"/><rect x="38" y="34" width="24" height="34" fill="none" stroke="${K}" stroke-width="${SW}"/>${shank(50, 68, 92)}${threads(50, 68, 92)}` },
  setscrew: { whole: `<rect x="38" y="14" width="24" height="78" fill="none" stroke="${K}" stroke-width="${SW}"/>${threads(50, 32, 92)}` },
};
// captive washers under the head, each 6 units tall: f flat, s split lock, e external tooth, i internal tooth
const WASHER_CODES = { k: 'countersunk', f: 'flat', s: 'split', e: 'exttooth', i: 'inttooth' };
const WASHER_NAMES = { countersunk: 'countersunk', flat: 'flat', split: 'split lock', exttooth: 'external tooth', inttooth: 'internal tooth' };
function washerUnder(code, y) {
  // countersunk (finishing cup) washer: a cup the head sits in, so the profile reads like a flange; it starts up beside the head
  if (code === 'k') return `<path d="M14 ${y - 12} H86 L78 ${y + 6} H22 Z" ${HEAD.border}/>`;
  const r = `<path d="M18 ${y} H82 V${y + 6} H18 Z" ${HEAD.border}/>`;
  if (code === 'f') return r;
  if (code === 's') return r + `<line x1="66" y1="${y}" x2="72" y2="${y + 6}" stroke="${K}" stroke-width="3"/>`;
  if (code === 'e') return r + [18, 82].map(x => `<line x1="${x}" y1="${y + 1}" x2="${x < 50 ? x - 5 : x + 5}" y2="${y + 3}" stroke="${K}" stroke-width="3"/><line x1="${x}" y1="${y + 5}" x2="${x < 50 ? x - 5 : x + 5}" y2="${y + 3}" stroke="${K}" stroke-width="3"/>`).join('');
  return r + [30, 38, 62, 70].map(x => `<line x1="${x}" y1="${y + 1}" x2="${x}" y2="${y + 5}" stroke="${K}" stroke-width="2.5"/>`).join('');
}
// shanks from y0 down: a drill point (the shank necks down to a fluted bit), or blunt / pointed, plain or thread-cutting (a slot up the tip)
function shankFor(pointed, cutting, y0, drill) {
  if (drill) return `<path d="M44 ${y0} V70 L46 74 V84 L50 94 L54 84 V74 L56 70 V${y0} Z" fill="none" stroke="${K}" stroke-width="${SW}" stroke-linejoin="round"/><line x1="46" y1="77" x2="54" y2="85" stroke="${K}" stroke-width="3"/>` + threads(50, y0 + 6, 70);
  if (!pointed && !cutting) return shank(50, y0, 92) + threads(50, y0 + 2, 92);
  if (pointed && !cutting) return `<path d="M44 ${y0} V78 L50 94 L56 78 V${y0} Z" fill="none" stroke="${K}" stroke-width="${SW}"/>` + threads(50, y0 + 6, 78);
  if (pointed && cutting) return `<path d="M44 ${y0} V78 L50 94 L56 78 V${y0} Z" fill="none" stroke="${K}" stroke-width="${SW}"/><line x1="50" y1="72" x2="50" y2="90" stroke="${K}" stroke-width="3.5"/>` + threads(50, y0 + 6, 70);
  return `<path d="M44 ${y0} V92 H56 V${y0} Z" fill="none" stroke="${K}" stroke-width="${SW}" stroke-linejoin="round"/><path d="M44 84 L50 92 L56 84" fill="none" stroke="${K}" stroke-width="3"/>` + threads(50, y0 + 6, 82);
}
// variant keys
const parse = name => { const [shape, ...f] = String(name).split(':'); const w = f.find(x => x[0] === 'w') || ''; const drill = f.includes('d'); return { shape, drill, pointed: !drill && f.includes('p'), cutting: !drill && f.includes('c'), washers: [...w.slice(1)] }; };
const key = ({ shape, pointed = false, cutting = false, drill = false, washers = [] }) => shape + (drill ? ':d' : (pointed ? ':p' : '') + (cutting ? ':c' : '')) + (washers.length ? ':w' + ['k', 'f', 's', 'e', 'i'].filter(c => washers.includes(c)).join('') : '');
function screw(name) {
  const v = parse(name), h = SHAPES[v.shape]; if (!h) return null;
  if (h.whole) return h.whole;
  let y = h.base, g = h.svg;
  for (const w of v.washers) { g += washerUnder(w, y); y += 6; }
  return g + shankFor(v.pointed, v.cutting, y, v.drill);
}
// heads: for the legacy ALL table, the blunt plain version of each shape
const HEADS = Object.fromEntries(Object.keys(SHAPES).map(k => [k, screw(k)]));
// nuts and washers: face-on
const NUTS = {
  nut:  `<path d="M50 14 L82 32 V68 L50 86 L18 68 V32 Z" fill="none" stroke="${K}" stroke-width="${SW}" stroke-linejoin="round"/><circle cx="50" cy="50" r="15" fill="none" stroke="${K}" stroke-width="${SW}"/>`,
  thin: `<path d="M50 14 L82 32 V68 L50 86 L18 68 V32 Z" fill="none" stroke="${K}" stroke-width="3" stroke-linejoin="round"/><circle cx="50" cy="50" r="15" fill="none" stroke="${K}" stroke-width="3"/>`,
  lock: `<path d="M50 14 L82 32 V68 L50 86 L18 68 V32 Z" fill="none" stroke="${K}" stroke-width="${SW}" stroke-linejoin="round"/><circle cx="50" cy="50" r="15" fill="none" stroke="${K}" stroke-width="${SW}"/><circle cx="50" cy="50" r="24" fill="none" stroke="${K}" stroke-width="3" stroke-dasharray="4 4"/>`,
  nylock: `<path d="M50 14 L82 32 V68 L50 86 L18 68 V32 Z" fill="none" stroke="${K}" stroke-width="${SW}" stroke-linejoin="round"/><circle cx="50" cy="50" r="15" fill="none" stroke="${K}" stroke-width="${SW}"/><circle cx="50" cy="50" r="22" fill="none" stroke="${K}" stroke-width="${SW}" stroke-dasharray="7 5"/>`,
  // serrated-flange (toothed) lock nut, face-on: round flange with teeth, hex inside, bore
  // lock nut with a captive external-tooth washer (keps / K-lock), side view: hex body over a toothed washer
  toothednut: `<path d="M22 24 H78 V60 H22 Z" fill="none" stroke="${K}" stroke-width="${SW}" stroke-linejoin="round"/><line x1="40" y1="24" x2="40" y2="60" stroke="${K}" stroke-width="3"/><line x1="60" y1="24" x2="60" y2="60" stroke="${K}" stroke-width="3"/><path d="M14 60 H86 V70 H14 Z" fill="none" stroke="${K}" stroke-width="${SW}" stroke-linejoin="round"/>${[14, 86].map(x => `<line x1="${x}" y1="62" x2="${x < 50 ? x - 6 : x + 6}" y2="65" stroke="${K}" stroke-width="3"/><line x1="${x}" y1="68" x2="${x < 50 ? x - 6 : x + 6}" y2="65" stroke="${K}" stroke-width="3"/>`).join('')}${[24, 32, 68, 76].map(x => `<line x1="${x}" y1="70" x2="${x}" y2="76" stroke="${K}" stroke-width="2.5"/>`).join('')}`,
  // serrated flange lock nut, side view: hex body on a wide flange whose underside is serrated
  serratedflange: `<path d="M26 22 H74 V58 H26 Z" fill="none" stroke="${K}" stroke-width="${SW}" stroke-linejoin="round"/><line x1="42" y1="22" x2="42" y2="58" stroke="${K}" stroke-width="3"/><line x1="58" y1="22" x2="58" y2="58" stroke="${K}" stroke-width="3"/><path d="M12 58 H88 L84 70 H16 Z" fill="none" stroke="${K}" stroke-width="${SW}" stroke-linejoin="round"/>${[20, 28, 36, 44, 52, 60, 68, 76].map(x => `<path d="M${x} 70 L${x + 4} 76 L${x + 8} 70" fill="none" stroke="${K}" stroke-width="2.5"/>`).join('')}`,
  // press-fit (self-clinching) nut, face-on: round body with the knurled clinch collar and a thread bore
  pressfit: `<circle cx="50" cy="50" r="38" fill="none" stroke="${K}" stroke-width="${SW}"/><circle cx="50" cy="50" r="26" fill="none" stroke="${K}" stroke-width="${SW}" stroke-dasharray="5 4"/><circle cx="50" cy="50" r="13" fill="none" stroke="${K}" stroke-width="${SW}"/>`,
  square: `<rect x="18" y="18" width="64" height="64" rx="3" fill="none" stroke="${K}" stroke-width="${SW}"/><circle cx="50" cy="50" r="15" fill="none" stroke="${K}" stroke-width="${SW}"/>`,
  wing: `<path d="M50 14 L82 32 V68 L50 86 L18 68 V32 Z" fill="none" stroke="${K}" stroke-width="${SW}" stroke-linejoin="round"/><circle cx="50" cy="50" r="15" fill="none" stroke="${K}" stroke-width="${SW}"/><path d="M18 50 Q0 30 14 20 M82 50 Q100 30 86 20" fill="none" stroke="${K}" stroke-width="${SW}"/>`,
  // cap (acorn) nut, side view: hex body with a domed cap on top
  capnut: `<path d="M22 50 H78 V84 H22 Z" fill="none" stroke="${K}" stroke-width="${SW}" stroke-linejoin="round"/><line x1="40" y1="50" x2="40" y2="84" stroke="${K}" stroke-width="3"/><line x1="60" y1="50" x2="60" y2="84" stroke="${K}" stroke-width="3"/><path d="M22 50 Q22 18 50 18 Q78 18 78 50" fill="none" stroke="${K}" stroke-width="${SW}"/>`,
};
const WASHERS = {
  washer:  `<circle cx="50" cy="50" r="38" fill="none" stroke="${K}" stroke-width="${SW}"/><circle cx="50" cy="50" r="16" fill="none" stroke="${K}" stroke-width="${SW}"/>`,
  fender:  `<circle cx="50" cy="50" r="44" fill="none" stroke="${K}" stroke-width="${SW}"/><circle cx="50" cy="50" r="11" fill="none" stroke="${K}" stroke-width="${SW}"/>`,
  thinw:   `<circle cx="50" cy="50" r="38" fill="none" stroke="${K}" stroke-width="2.5"/><circle cx="50" cy="50" r="16" fill="none" stroke="${K}" stroke-width="2.5"/>`,
  split:   `<path d="M63 14.3 A38 38 0 1 1 37 14.3 L44.5 35 A16 16 0 1 0 55.5 35 Z" fill="none" stroke="${K}" stroke-width="${SW}" stroke-linejoin="round"/><line x1="37" y1="14.3" x2="44.5" y2="35" stroke="${K}" stroke-width="${SW}"/>`,
  nylonw:  `<circle cx="50" cy="50" r="38" fill="none" stroke="${K}" stroke-width="${SW}" stroke-dasharray="7 5"/><circle cx="50" cy="50" r="16" fill="none" stroke="${K}" stroke-width="${SW}" stroke-dasharray="6 4"/>`,
  // undersized (small outside diameter) washer
  undersized: `<circle cx="50" cy="50" r="29" fill="none" stroke="${K}" stroke-width="${SW}"/><circle cx="50" cy="50" r="16" fill="none" stroke="${K}" stroke-width="${SW}"/>`,
  // Belleville / spring washer: the cone edge as a middle ring
  spring:  `<circle cx="50" cy="50" r="38" fill="none" stroke="${K}" stroke-width="${SW}"/><circle cx="50" cy="50" r="27" fill="none" stroke="${K}" stroke-width="3" stroke-dasharray="6 4"/><circle cx="50" cy="50" r="16" fill="none" stroke="${K}" stroke-width="${SW}"/>`,
  // internal tooth: teeth point into the bore
  inttooth: `<circle cx="50" cy="50" r="38" fill="none" stroke="${K}" stroke-width="${SW}"/><circle cx="50" cy="50" r="20" fill="none" stroke="${K}" stroke-width="${SW}"/>${Array.from({ length: 12 }, (_, i) => { const a = i * Math.PI / 6, c = Math.cos(a), s = Math.sin(a); return `<line x1="${(50 + 20 * c).toFixed(1)}" y1="${(50 + 20 * s).toFixed(1)}" x2="${(50 + 11 * c).toFixed(1)}" y2="${(50 + 11 * s).toFixed(1)}" stroke="${K}" stroke-width="4"/>`; }).join('')}`,
  // cup (countersunk finishing) washer: the cone shown as a middle ring
  cup:     `<circle cx="50" cy="50" r="38" fill="none" stroke="${K}" stroke-width="${SW}"/><circle cx="50" cy="50" r="27" fill="none" stroke="${K}" stroke-width="${SW}"/><circle cx="50" cy="50" r="14" fill="none" stroke="${K}" stroke-width="${SW}"/>`,
  // sleeved (shoulder) washer: a thick sleeve around the bore
  sleeved: `<circle cx="50" cy="50" r="38" fill="none" stroke="${K}" stroke-width="${SW}"/><circle cx="50" cy="50" r="19" fill="none" stroke="${K}" stroke-width="9"/>`,
  toothed: `<circle cx="50" cy="50" r="36" fill="none" stroke="${K}" stroke-width="${SW}"/><circle cx="50" cy="50" r="16" fill="none" stroke="${K}" stroke-width="${SW}"/>${Array.from({ length: 12 }, (_, i) => { const a = i * Math.PI / 6, c = Math.cos(a), s = Math.sin(a); return `<line x1="${(50 + 36 * c).toFixed(1)}" y1="${(50 + 36 * s).toFixed(1)}" x2="${(50 + 46 * c).toFixed(1)}" y2="${(50 + 46 * s).toFixed(1)}" stroke="${K}" stroke-width="4"/>`; }).join('')}`,
  // internal + external tooth: outer ring r36 with teeth out to 46, bore r16 with teeth in to 8
  inextooth: `<circle cx="50" cy="50" r="36" fill="none" stroke="${K}" stroke-width="${SW}"/><circle cx="50" cy="50" r="17" fill="none" stroke="${K}" stroke-width="${SW}"/>${Array.from({ length: 12 }, (_, i) => { const a = i * Math.PI / 6, c = Math.cos(a), s = Math.sin(a); return `<line x1="${(50 + 36 * c).toFixed(1)}" y1="${(50 + 36 * s).toFixed(1)}" x2="${(50 + 46 * c).toFixed(1)}" y2="${(50 + 46 * s).toFixed(1)}" stroke="${K}" stroke-width="4"/><line x1="${(50 + 17 * c).toFixed(1)}" y1="${(50 + 17 * s).toFixed(1)}" x2="${(50 + 9 * c).toFixed(1)}" y2="${(50 + 9 * s).toFixed(1)}" stroke="${K}" stroke-width="4"/>`; }).join('')}`,
};
// other hardware that lives in drawers: connectors, test leads, jumpers. Face or side views, same weight as the fastener icons.
const dot = (x, y, r = 4) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${K}"/>`;
const ring = (x, y, r, sw = SW) => `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${K}" stroke-width="${sw}"/>`;
const box = (x, y, w, h, rx = 4, sw = SW) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="none" stroke="${K}" stroke-width="${sw}"/>`;
const bananaPin = (x, y0, y1) => `<path d="M${x - 6} ${y0} Q${x - 15} ${(y0 + y1) / 2} ${x - 6} ${y1 - 6} L${x} ${y1} L${x + 6} ${y1 - 6} Q${x + 15} ${(y0 + y1) / 2} ${x + 6} ${y0} Z" fill="none" stroke="${K}" stroke-width="${SW}" stroke-linejoin="round"/><line x1="${x}" y1="${y0 + 2}" x2="${x}" y2="${y1 - 8}" stroke="${K}" stroke-width="3"/>`;
const MISC = {
  // banana plug: insulated handle on top, sprung pin below
  banana:      `${box(34, 6, 32, 38, 5)}<line x1="50" y1="44" x2="50" y2="50" stroke="${K}" stroke-width="${SW}"/>${bananaPin(50, 50, 94)}`,
  // stackable: the handle has a jack in its top
  // stacking banana plug (Pomona style): body lying flat, jack in the back end, cable stub down, pin to the right
  bananastack: `${box(4, 24, 48, 30, 6)}<ellipse cx="10" cy="39" rx="3" ry="8" fill="none" stroke="${K}" stroke-width="3.5"/><line x1="16" y1="30" x2="48" y2="30" stroke="${K}" stroke-width="2.5"/><path d="M24 54 L22 84 Q22 90 28 90 H40 Q46 90 46 84 L44 54" fill="none" stroke="${K}" stroke-width="${SW}" stroke-linejoin="round"/><line x1="52" y1="39" x2="60" y2="39" stroke="${K}" stroke-width="${SW}"/><path d="M60 34 H68 Q84 28 92 34 L97 39 L92 44 Q84 50 68 44 H60 Z" fill="none" stroke="${K}" stroke-width="${SW}" stroke-linejoin="round"/><line x1="70" y1="39" x2="90" y2="39" stroke="${K}" stroke-width="2.5"/>`,
  // dual banana: one block, two pins at 3/4" spacing
  bananadual:  `${box(12, 8, 76, 34, 5)}<line x1="18" y1="20" x2="18" y2="30" stroke="${K}" stroke-width="3"/><line x1="32" y1="42" x2="32" y2="48" stroke="${K}" stroke-width="${SW}"/><line x1="68" y1="42" x2="68" y2="48" stroke="${K}" stroke-width="${SW}"/>${bananaPin(32, 48, 92)}${bananaPin(68, 48, 92)}`,
  // banana jack: a panel bushing with the hole on top
  bananajack:  `<ellipse cx="50" cy="20" rx="17" ry="6" fill="none" stroke="${K}" stroke-width="${SW}"/><ellipse cx="50" cy="20" rx="6" ry="2.5" fill="${K}"/><line x1="33" y1="20" x2="33" y2="60" stroke="${K}" stroke-width="${SW}"/><line x1="67" y1="20" x2="67" y2="60" stroke="${K}" stroke-width="${SW}"/>${box(18, 60, 64, 12, 2)}<line x1="42" y1="72" x2="42" y2="92" stroke="${K}" stroke-width="${SW}"/><line x1="58" y1="72" x2="58" y2="92" stroke="${K}" stroke-width="${SW}"/>${threads(50, 74, 92)}`,
  // binding post: knurled cap, cross-drilled stem, base
  bindingpost: `${box(30, 8, 40, 26, 5)}${[36, 42, 48, 54, 60, 66].map(x => `<line x1="${x}" y1="12" x2="${x}" y2="30" stroke="${K}" stroke-width="2.5"/>`).join('')}<line x1="40" y1="34" x2="40" y2="70" stroke="${K}" stroke-width="${SW}"/><line x1="60" y1="34" x2="60" y2="70" stroke="${K}" stroke-width="${SW}"/>${ring(50, 52, 6, 4)}${box(20, 70, 60, 14, 2)}<line x1="50" y1="84" x2="50" y2="94" stroke="${K}" stroke-width="${SW * 2}"/>`,
  // barrier terminal strip: four screw terminals
  terminalstrip: `${box(4, 30, 92, 40, 3)}${[27, 50, 73].map(x => `<line x1="${x}" y1="30" x2="${x}" y2="70" stroke="${K}" stroke-width="3.5"/>`).join('')}${[15.5, 38.5, 61.5, 84.5].map(x => ring(x, 50, 7, 4) + `<line x1="${x - 4}" y1="46" x2="${x + 4}" y2="54" stroke="${K}" stroke-width="3"/>`).join('')}`,
  // 100 mil shunt: the jumper block on two header pins
  shunt:       `${box(28, 30, 44, 30, 4)}<line x1="50" y1="30" x2="50" y2="22" stroke="${K}" stroke-width="${SW}"/><line x1="44" y1="22" x2="56" y2="22" stroke="${K}" stroke-width="${SW}"/><line x1="39" y1="60" x2="39" y2="92" stroke="${K}" stroke-width="${SW * 1.4}"/><line x1="61" y1="60" x2="61" y2="92" stroke="${K}" stroke-width="${SW * 1.4}"/>${box(28, 84, 44, 10, 2, 4)}`,
  // mini grabber: slim body, hook out the tip, plunger on the back
  minigrabber: `${box(40, 34, 20, 50, 6)}<line x1="46" y1="84" x2="46" y2="94" stroke="${K}" stroke-width="3.5"/><line x1="54" y1="84" x2="54" y2="94" stroke="${K}" stroke-width="3.5"/><line x1="50" y1="34" x2="50" y2="22" stroke="${K}" stroke-width="3.5"/><path d="M50 22 Q50 8 60 8 Q68 8 68 16 Q68 22 62 22" fill="none" stroke="${K}" stroke-width="3.5" stroke-linecap="round"/><line x1="50" y1="40" x2="50" y2="76" stroke="${K}" stroke-width="2.5"/>`,
  // alligator clip: serrated jaws, spring, sleeve
  alligator:   `<path d="M26 50 L82 20 L78 34 L48 50 L78 66 L82 80 Z" fill="none" stroke="${K}" stroke-width="${SW}" stroke-linejoin="round"/>${[56, 64, 72].map(x => `<line x1="${x}" y1="${50 - (x - 48) * 0.53}" x2="${x + 2}" y2="${50 - (x - 48) * 0.53 - 6}" stroke="${K}" stroke-width="3"/><line x1="${x}" y1="${50 + (x - 48) * 0.53}" x2="${x + 2}" y2="${50 + (x - 48) * 0.53 + 6}" stroke="${K}" stroke-width="3"/>`).join('')}${box(6, 38, 20, 24, 4)}${ring(20, 50, 4, 3)}`,
  // DB9 face: D shell, 5 over 4
  db9:         `<path d="M14 30 H86 Q92 30 90 36 L82 66 Q80 70 76 70 H24 Q20 70 18 66 L10 36 Q8 30 14 30 Z" fill="none" stroke="${K}" stroke-width="${SW}" stroke-linejoin="round"/>${[28, 39, 50, 61, 72].map(x => dot(x, 44)).join('')}${[33.5, 44.5, 55.5, 66.5].map(x => dot(x, 57)).join('')}`,
  // flat flex cable end: the ribbon with its exposed fingers
  ffc:         `${box(30, 6, 40, 88, 3)}<line x1="30" y1="56" x2="70" y2="56" stroke="${K}" stroke-width="3.5"/>${[37, 43.5, 50, 56.5, 63].map(x => `<line x1="${x}" y1="62" x2="${x}" y2="90" stroke="${K}" stroke-width="3"/>`).join('')}`,
  // RC power connectors, face on
  xt60:        `<path d="M20 30 L30 14 H70 L80 30 V86 H20 Z" fill="none" stroke="${K}" stroke-width="${SW}" stroke-linejoin="round"/>${ring(37, 56, 9)}${ring(63, 56, 9)}<text x="50" y="30" font-family="sans-serif" font-size="13" font-weight="700" text-anchor="middle" fill="${K}">XT60</text>`,
  xt30:        `<path d="M28 36 L36 24 H64 L72 36 V80 H28 Z" fill="none" stroke="${K}" stroke-width="${SW}" stroke-linejoin="round"/>${ring(41, 60, 6, 4)}${ring(59, 60, 6, 4)}<text x="50" y="45" font-family="sans-serif" font-size="11" font-weight="700" text-anchor="middle" fill="${K}">XT30</text>`,
  deans:       `${box(20, 14, 60, 72, 8)}<rect x="30" y="28" width="40" height="9" fill="${K}"/><rect x="45.5" y="46" width="9" height="30" fill="${K}"/>`,
  jstxh:       `${box(22, 26, 56, 50, 3)}<rect x="40" y="18" width="20" height="8" fill="none" stroke="${K}" stroke-width="4"/>${box(31, 40, 14, 22, 1, 4)}${box(55, 40, 14, 22, 1, 4)}`,
  ec3:         `${box(28, 12, 44, 76, 6)}${ring(50, 34, 9)}${ring(50, 66, 9)}<text x="50" y="96" font-family="sans-serif" font-size="12" font-weight="700" text-anchor="middle" fill="${K}"></text>`,
  // GPIB / IEEE-488 (Centronics 24): stadium shell, ribbon of contacts inside
  gpib:        `<path d="M28 30 H72 Q90 30 88 50 Q86 70 76 70 H24 Q14 70 12 50 Q10 30 28 30 Z" fill="none" stroke="${K}" stroke-width="${SW}" stroke-linejoin="round"/><path d="M12 50 H3 M88 50 H97" stroke="${K}" stroke-width="${SW}"/>${ring(6, 50, 4, 3)}${ring(94, 50, 4, 3)}${[29, 35, 41, 47, 53, 59, 65, 71].map(x => `<line x1="${x}" y1="41" x2="${x}" y2="59" stroke="${K}" stroke-width="2.5"/>`).join('')}`,
  // switches, side / front views
  toggle:      `${box(28, 54, 44, 26, 3)}<rect x="41" y="40" width="18" height="14" fill="none" stroke="${K}" stroke-width="4"/>${[44, 49].map(y => `<line x1="41" y1="${y}" x2="59" y2="${y}" stroke="${K}" stroke-width="2"/>`).join('')}<line x1="50" y1="40" x2="70" y2="12" stroke="${K}" stroke-width="${SW}" stroke-linecap="round"/>${dot(71, 11, 6)}${[36, 50, 64].map(x => `<line x1="${x}" y1="80" x2="${x}" y2="94" stroke="${K}" stroke-width="4"/>`).join('')}`,
  rocker:      `${box(14, 22, 72, 56, 6)}${box(24, 30, 52, 40, 4, 4)}<line x1="24" y1="50" x2="76" y2="50" stroke="${K}" stroke-width="3"/><line x1="50" y1="35" x2="50" y2="45" stroke="${K}" stroke-width="4"/>${ring(50, 60, 5, 3.5)}`,
  pushbutton:  `${box(28, 12, 44, 14, 6)}<line x1="44" y1="26" x2="44" y2="38" stroke="${K}" stroke-width="${SW}"/><line x1="56" y1="26" x2="56" y2="38" stroke="${K}" stroke-width="${SW}"/>${box(16, 38, 68, 10, 2)}${box(26, 48, 48, 30, 3)}${[38, 62].map(x => `<line x1="${x}" y1="78" x2="${x}" y2="94" stroke="${K}" stroke-width="4"/>`).join('')}`,
  // heat sink: base with fins
  heatsink:    `<path d="M10 90 V72 H90 V90 Z" fill="none" stroke="${K}" stroke-width="${SW}" stroke-linejoin="round"/>${[14, 30, 46, 62, 78].map(x => `<rect x="${x}" y="14" width="8" height="58" fill="none" stroke="${K}" stroke-width="4"/>`).join('')}`,
  // pin headers and sockets: 100 mil (four fat pins) and 2 mm (six thin ones)
  header100:   `${box(8, 44, 84, 16, 2)}${[20, 40, 60, 80].map(x => `<line x1="${x}" y1="12" x2="${x}" y2="44" stroke="${K}" stroke-width="5"/><line x1="${x}" y1="60" x2="${x}" y2="88" stroke="${K}" stroke-width="5"/>`).join('')}`,
  socket100:   `${box(8, 32, 84, 30, 2)}${[20, 40, 60, 80].map(x => `<rect x="${x - 5}" y="40" width="10" height="14" fill="${K}"/><line x1="${x}" y1="62" x2="${x}" y2="88" stroke="${K}" stroke-width="5"/>`).join('')}`,
  header2mm:   `${box(8, 46, 84, 12, 2)}${[16, 29.6, 43.2, 56.8, 70.4, 84].map(x => `<line x1="${x}" y1="18" x2="${x}" y2="46" stroke="${K}" stroke-width="3.5"/><line x1="${x}" y1="58" x2="${x}" y2="84" stroke="${K}" stroke-width="3.5"/>`).join('')}`,
  socket2mm:   `${box(8, 36, 84, 22, 2)}${[16, 29.6, 43.2, 56.8, 70.4, 84].map(x => `<rect x="${x - 3.5}" y="42" width="7" height="10" fill="${K}"/><line x1="${x}" y1="58" x2="${x}" y2="84" stroke="${K}" stroke-width="3.5"/>`).join('')}`,
  // bullet connector, male, side view: solder cup at the left, split pin to the right
  bullet:      `${box(8, 34, 44, 32, 3)}<line x1="8" y1="42" x2="16" y2="42" stroke="${K}" stroke-width="3"/><line x1="8" y1="58" x2="16" y2="58" stroke="${K}" stroke-width="3"/><path d="M52 40 H82 Q94 40 94 50 Q94 60 82 60 H52 Z" fill="none" stroke="${K}" stroke-width="${SW}" stroke-linejoin="round"/><line x1="62" y1="50" x2="90" y2="50" stroke="${K}" stroke-width="2.5"/>`,
  // Amass motor connectors: MT60 / MT30 (three pins in a triangle), MR30 (three in a row)
  mt60:        `${box(18, 12, 64, 76, 14)}${ring(50, 34, 8)}${ring(34, 62, 8)}${ring(66, 62, 8)}`,
  mt30:        `${box(28, 22, 44, 56, 10)}${ring(50, 38, 5.5, 4)}${ring(39, 60, 5.5, 4)}${ring(61, 60, 5.5, 4)}`,
  mr30:        `<path d="M16 34 Q16 28 22 28 H78 Q84 28 84 34 V64 Q84 72 76 72 H24 Q16 72 16 64 Z" fill="none" stroke="${K}" stroke-width="${SW}"/>${ring(30, 50, 6.5, 4)}${ring(50, 50, 6.5, 4)}${ring(70, 50, 6.5, 4)}`,
  tamiya:      `${box(20, 28, 60, 48, 4)}<rect x="42" y="18" width="16" height="10" fill="none" stroke="${K}" stroke-width="4"/>${box(28, 38, 18, 26, 2, 4)}${box(54, 38, 18, 26, 2, 4)}`,
};
const ALL = { ...HEADS, ...NUTS, ...WASHERS, ...MISC };
const draw = name => ALL[name] !== undefined && !name.includes(':') ? ALL[name] : (screw(name) || '');
// the readable name of any key, variants included: "Pan, pointed, self-drilling, w/ flat + split lock washer"
function label(name) {
  if (LABELS[name]) return LABELS[name];
  const v = parse(name); if (!SHAPES[v.shape]) return name;
  const parts = [LABELS[v.shape]];
  if (v.pointed) parts.push('pointed');
  if (v.cutting) parts.push('thread-cutting');
  if (v.drill) parts.push('self-drilling');
  if (v.washers.length) parts.push('w/ ' + v.washers.map(c => WASHER_NAMES[WASHER_CODES[c]]).join(' + ') + ' washer');
  return parts.join(', ');
}
// icon groups for the glyph picker (list pages)
const GROUPS = { 'Connectors & test': Object.keys(MISC), Heads: Object.keys(SHAPES), Nuts: Object.keys(NUTS), Washers: Object.keys(WASHERS).filter(k => !['nylonw'].includes(k)) };
const LABELS = { flat: 'Flat', oval: 'Oval', pan: 'Pan', button: 'Button', round: 'Round', truss: 'Truss', cheese: 'Cheese', fillister: 'Fillister', binding: 'Binding', pancake: 'Pancake', socket: 'Socket cap', hex: 'Hex', hexwasher: 'Hex washer', flange: 'Flange', thumb: 'Thumb', carriage: 'Carriage bolt', trim: 'Trim head', shoulder: 'Shoulder', setscrew: 'Set screw',
  nut: 'Nut', thin: 'Jam nut (thin)', lock: 'Lock nut (prevailing torque)', nylock: 'Nylon insert', toothednut: 'Lock nut w/ external tooth washer', serratedflange: 'Serrated flange lock nut', pressfit: 'Press-fit nut', square: 'Square nut', wing: 'Wing nut', capnut: 'Cap nut', washer: 'Washer', fender: 'Fender', thinw: 'Thin washer', undersized: 'Undersized (small OD)', cup: 'Cup', sleeved: 'Sleeved', split: 'Split', spring: 'Spring', inttooth: 'Internal tooth', toothed: 'External tooth', inextooth: 'Internal + external tooth',
  banana: 'Banana plug', bananastack: 'Stackable banana plug', bananadual: 'Dual banana plug', bananajack: 'Banana jack', bindingpost: 'Binding post', terminalstrip: 'Terminal strip', shunt: '100 mil shunt', minigrabber: 'Mini grabber', alligator: 'Alligator clip', db9: 'DB9', ffc: 'Flat flex cable end', xt60: 'XT60', xt30: 'XT30', deans: 'Deans / T-plug', jstxh: 'JST-XH', ec3: 'EC3', tamiya: 'Tamiya',
  gpib: 'GPIB (IEEE-488)', toggle: 'Toggle switch', rocker: 'Rocker switch', pushbutton: 'Push button', heatsink: 'Heat sink', header100: '100 mil pin header', socket100: '100 mil socket', header2mm: '2 mm pin header', socket2mm: '2 mm socket', bullet: 'Bullet connector', mt60: 'MT60', mt30: 'MT30', mr30: 'MR30' };
// one icon as a standalone SVG
const icon = name => `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">${draw(name)}</svg>`;
// several icons for the label glyph slot, in one or two rows (rows = 2 puts ceil(n/2) per row, the second row left-aligned)
const icons = (names, rows = 1) => {
  const cols = Math.ceil(names.length / rows);
  return `<svg viewBox="0 0 ${100 * cols} ${100 * rows}" xmlns="http://www.w3.org/2000/svg">${names.map((n, i) => `<g transform="translate(${(i % cols) * 100} ${Math.floor(i / cols) * 100})">${draw(n)}</g>`).join('')}</svg>`;
};
// choose one or two rows for a glyph slot `h` high with `w` of width free: whichever gives the bigger icons
function layout(names, w, h) {
  const n = names.length; if (!n) return { rows: 1, size: 0, maxW: 0.01 };
  const one = Math.min(h, w / n), two = Math.min(h / 2, w / Math.ceil(n / 2));
  const rows = two > one ? 2 : 1, cols = Math.ceil(n / rows);
  return { rows, size: rows === 2 ? two : one, maxW: Math.max(0.01, (cols / rows) * Math.min(1, (rows === 2 ? two * 2 : one) / h)) };
}
module.exports = { SHAPES, HEADS, NUTS, WASHERS, MISC, ALL, LABELS, GROUPS, WASHER_CODES, WASHER_NAMES, parse, key, label, draw, icon, icons, layout };
