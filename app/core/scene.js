// Scene: what a view draws (dendra.md, Views). Its drawn marks and free shapes, every setting valued and
// known by the note that decided it, each text broken into lines, on the view's page. It reads the computed
// state and the view and nothing else, and the canvas, the PDF and PowerPoint each draw it and nothing else.
// The only page it touches is a canvas, to measure text. Units are CSS pixels, 96 to the inch, as the browser
// and X6 draw them; a Size or a Weight a note gives is in points as printed, as Office gives them, each PT pixels of
// the sheet.
//
// Scene.of(wb, chart, view, day, { state, computed?, reveal, keep, seen?, paper?, ahead?, holds? }) →
//   { chart, view, day, page: { size, w, h, scale, margin, offset, placed, sheet, short, paper? }, marks, byId, styles, legend, ms }
// `state` is the computed state's records, and `computed` the engine's whole result, for a free shape whose
// text is a formula. `reveal`, records the view hides, drawn for a while, `keep`, a restyle's preview, and `seen`, what a
// session shows or hides over the view's notes (Map record → whether it shows), keep the
// view as it was last drawn (see the layout). `paper`, a size in PAGES, or one turned ("letter portrait"), draws the
// view on that paper in place of its own page (see the page). `ahead` lays out a state a change previewed would leave,
// so it's drawn at once when the change is made, and isn't kept as how the view was drawn: a redline is that scene,
// inked by the canvas, as Enter will draw it, `holds` keeping where they stand the boxes making it will keep so (record
// → place; see the layout) and, by its `page`, the scale and offset making it will keep.
// A view whose Changes note says so draws the comparison too (see comparing), so every output does: `since`, the day
// it's compared with; `state`, what's drawn from; a mark's `change`, New, Changed or Gone; a text's `was`, what it said, struck.
// `marks` are in drawing order: frames, lines, boxes, then
// free shapes, each by its Layer.
// Scene.steps(…), with the same arguments, draws it a step at a time: `next()` takes a step, the last giving
// the scene; so a scene drawn while the window is idle never holds it up for long (see the canvas).
// A box, line or frame has `settings`: { [property]: { value, note } }, the note null where nothing in the
// chart says. A box or line has `texts`, each a record's text with its own settings and its `lines`, placed
// from the mark's top left (a line's from its label's); a box or shape with text, the `column` its lines
// are set in, as PowerPoint sets them (see setText). A line another crosses has `runs`, the pieces it's drawn in (see jumps); one that had to go
// round what's drawn is `around` (`astray` where it couldn't keep its sides, `strained` where it could only against the
// router's rules, `blocked` where it found no way), one whose label found no free place `crowded` (see Layout.route),
// and one whose label is said once for several, as a trunk's, has their ids, its `kin`. A free shape has its
// row's formats, with no notes, and a free line the boxes it's glued to; one whose row's `role` is title or
// date is the page's own, as the Key is (see the page and free shapes).
const Scene = (() => {
const { treeOf, idsIn, key, bare, isObject, isField, isTag, isChoice, argsOf, same } = Tree;

// The page. A view is drawn on a sheet, a 13.33 × 7.5 in slide unless its Page note (or a paper it's exported
// on) says otherwise, its chart `scale` times its own size: a twentieth, the one the view keeps (its Scale note), or
// the largest at which it fits, so that a size no note gives stays on PowerPoint's half points and changes only in
// steps. The page is the sheet in the chart's own pixels, the sheet's size over the scale. A size a note gives is
// printed as given, so in the page's pixels it's the note over the scale (see typedAt). Its furniture is the sheet's,
// at the sheet's size: its title and its date at its top left margin, the chart 24 pt under them, its Key at the
// chart's foot where it sets least far down, or beside the title, top right, where that draws the chart larger,
// nothing in the Key larger than the names; and its footer in the margin at its foot.
const PT = 4 / 3;
const PAGES = { slide: [1280, 720], letter: [1056, 816], legal: [1344, 816], tabloid: [1632, 1056], a4: [1123, 794], a3: [1587, 1123] };
const PAPERS = { slide: 'Slide 16:9', letter: 'Letter', legal: 'Legal', tabloid: 'Tabloid 11×17', a4: 'A4', a3: 'A3' };
const MARGIN = 48;
const SCALES = Array.from({ length: 20 }, (_, i) => (20 - i) / 20);
// The least scale a chart is laid out for to hold a size typed: under it, its gaps are gone, and it's as near as it can be.
const LEAST = 0.4;
// A size on a page drawn at s, as the sheet's half point nearest it, or at or under it.
const half = (v, s, under = false) => Math.max(1, under ? Math.floor(v * s * 2 + 1e-9) : Math.round(v * s * 2)) / 2 / s;
// A text's points as a page drawn at s prints it: as typed, where it's laid out at s; else at the sheet's half point.
const printed = (it, s) => (it.typedAt === s ? it.look.Size : half(it.look.Size, s)) * s;

// Each sort of mark's properties, and their values where no note gives one. Notes calls every label that
// isn't Name, Order and the like a format property, so a new one is only a word here, and its drawing. A box's
// and a line's text properties are what the texts in it take, where nothing sets their own: Strike is a line
// through each line of text; Spacing, how far apart its lines are, a multiple of single spacing (1.2 times its
// size), as PowerPoint's Line Spacing is. A box's Valign sets its text block at its top, middle or bottom; its
// Transparency (0–100) is its fill's, PowerPoint's; its Shadow is none, or soft, PowerPoint's outer shadow set
// below and to the right; and its Corner, a rounded rectangle's, is the radius of its corners as a percentage of
// its shorter side, up to 50, PowerPoint's adjustment of the shape.
const INK = '#1c2733', RULE = '#3a4653';
const TEXT = { Font: 'Arial', Size: 10, Bold: false, Italic: false, Underline: false, Strike: false, Color: INK, Align: 'center', Spacing: 1, Format: 'value' }, BESIDE_NAME = 8;
const CORNER = 16.667;
const DEFAULTS = {
  box: { Shown: true, Shape: 'rect', Fill: '#ffffff', Transparency: 0, Outline: RULE, Weight: 0.5, Dash: 'solid', Shadow: 'none', Corner: CORNER, Valign: 'middle',
    Frame: 'none', Layer: 0, ...TEXT },
  line: { Shown: false, Outline: RULE, Weight: 0.75, Dash: 'solid', Arrow: 'none', Arrowhead: null, Connector: 'elbow', Above: null, Layer: 0, ...TEXT, Size: 9 },
  text: { Shown: false, ...TEXT },
};
const TEXT_PROPS = Object.keys(TEXT);
const HAS = Object.fromEntries(Object.entries(DEFAULTS).map(([k, d]) => [k, new Set(Object.keys(d))]));
// What a note at the view itself can say of every text on the page (dendra.md, Notes); the footer and its number, the
// chart's own (see the page); and how a box of no form is drawn, which no row of the Key is by itself.
const ROOT = ['Font', 'Size'], FOOTER = '·footer', NUMBER = '·number';
const FORMLESS = { Outline: { value: '#7f7f7f', note: null }, Dash: { value: 'square-dot', note: null } };
// What a swatch shows: the properties of a box or line that tell marks apart, a frame's kind, or a text's
// look. A frame's caption says on the chart what it is, so the legend leaves frames out.
const KEYED = { box: ['Shape', 'Fill', 'Transparency', 'Outline', 'Weight', 'Dash', 'Shadow', 'Corner'], line: ['Shown', 'Outline', 'Weight', 'Dash', 'Arrow', 'Arrowhead'], frame: ['Frame'],
  text: ['Font', 'Size', 'Bold', 'Italic', 'Underline', 'Strike', 'Color'] };
// A swatch: a box, line, frame or text in the defaults, with what an output's formats give it.
function swatch(kind, f) {
  const sw = { kind, ...DEFAULTS[kind === 'frame' ? 'box' : kind] };
  for (const k of KEYED[kind]) if (k in f) sw[k] = f[k];
  return sw;
}
// An output's swatch where no mark says what it is: a relation's is a line, a box's a box, and an entry's a box
// where its formats draw one, or else a text; but one that draws a frame and gives its mark no look is a frame.
function swatchOf(p, f) {
  const kind = p.args?.length > 1 ? 'line' : !p.args || KEYED.box.some(k => k in f) ? 'box' : 'text';
  return swatch(!none(f.Frame) && !KEYED[kind].some(k => k !== 'Shown' && k in f) ? 'frame' : kind, f);
}
// The fonts offered by name, those people know from Office, Windows and the Mac, each with its class (sans serif,
// serif or monospace) and the fonts that stand in for it where it isn't installed, those of its metrics first
// (Calibri's Carlito, Arial's Liberation Sans): so a chart set in one draws in the nearest face a computer has. A
// font typed by name, not among them, is drawn in itself, its class guessed from its name.
const FONTS = {
  Aptos: ['sans', "Aptos, 'Segoe UI', Calibri, Carlito, sans-serif"],
  Arial: ['sans', "Arial, 'Liberation Sans', Arimo, Helvetica, sans-serif"],
  'Arial Narrow': ['sans', "'Arial Narrow', 'Liberation Sans Narrow', 'Helvetica Neue Condensed', sans-serif"],
  'Arial Black': ['sans', "'Arial Black', 'Helvetica Neue', Arial, sans-serif"],
  'Avenir Next': ['sans', "'Avenir Next', Avenir, 'Century Gothic', sans-serif"],
  Calibri: ['sans', 'Calibri, Carlito, sans-serif'],
  Candara: ['sans', 'Candara, Calibri, Carlito, sans-serif'],
  'Century Gothic': ['sans', "'Century Gothic', 'URW Gothic', 'URW Gothic L', 'Avant Garde', sans-serif"],
  Corbel: ['sans', 'Corbel, Calibri, Carlito, sans-serif'],
  'Franklin Gothic Book': ['sans', "'Franklin Gothic Book', 'Franklin Gothic Medium', 'Libre Franklin', sans-serif"],
  Futura: ['sans', "Futura, 'Century Gothic', 'URW Gothic', sans-serif"],
  'Gill Sans MT': ['sans', "'Gill Sans MT', 'Gill Sans', Calibri, sans-serif"],
  Helvetica: ['sans', "Helvetica, 'Helvetica Neue', Arial, 'Liberation Sans', sans-serif"],
  'Helvetica Neue': ['sans', "'Helvetica Neue', Helvetica, Arial, 'Liberation Sans', sans-serif"],
  'Lucida Sans': ['sans', "'Lucida Sans', 'Lucida Sans Unicode', 'Lucida Grande', sans-serif"],
  Optima: ['sans', "Optima, Candara, 'Segoe UI', sans-serif"],
  'Segoe UI': ['sans', "'Segoe UI', 'Helvetica Neue', Arial, sans-serif"],
  Tahoma: ['sans', "Tahoma, 'DejaVu Sans', Verdana, sans-serif"],
  'Trebuchet MS': ['sans', "'Trebuchet MS', 'Lucida Grande', sans-serif"],
  Verdana: ['sans', "Verdana, 'DejaVu Sans', sans-serif"],
  Baskerville: ['serif', "Baskerville, 'Baskerville Old Face', 'Libre Baskerville', Georgia, serif"],
  'Book Antiqua': ['serif', "'Book Antiqua', Palatino, 'Palatino Linotype', 'URW Palladio L', serif"],
  'Bookman Old Style': ['serif', "'Bookman Old Style', 'URW Bookman', 'URW Bookman L', serif"],
  Cambria: ['serif', 'Cambria, Caladea, serif'],
  'Century Schoolbook': ['serif', "'Century Schoolbook', 'New Century Schoolbook', 'TeX Gyre Schola', serif"],
  Constantia: ['serif', 'Constantia, Cambria, Caladea, serif'],
  Didot: ['serif', "Didot, 'Bodoni MT', 'Bodoni 72', serif"],
  Garamond: ['serif', "Garamond, 'EB Garamond', 'Adobe Garamond Pro', 'Cormorant Garamond', serif"],
  Georgia: ['serif', 'Georgia, Gelasio, serif'],
  'Goudy Old Style': ['serif', "'Goudy Old Style', Garamond, serif"],
  'Palatino Linotype': ['serif', "'Palatino Linotype', Palatino, 'Book Antiqua', 'URW Palladio L', serif"],
  Perpetua: ['serif', 'Perpetua, Garamond, serif'],
  Rockwell: ['serif', "Rockwell, 'Roboto Slab', 'Courier New', serif"],
  'Times New Roman': ['serif', "'Times New Roman', 'Liberation Serif', Tinos, Times, serif"],
  'Cascadia Mono': ['mono', "'Cascadia Mono', 'Cascadia Code', Consolas, monospace"],
  Consolas: ['mono', "Consolas, Inconsolata, 'Liberation Mono', monospace"],
  'Courier New': ['mono', "'Courier New', 'Liberation Mono', Cousine, Courier, monospace"],
  'Lucida Console': ['mono', "'Lucida Console', Monaco, monospace"],
  Menlo: ['mono', "Menlo, Monaco, Consolas, monospace"],
};
const fontClass = f => FONTS[f]?.[0] ?? (/mono|courier|consol|code/i.test(f) ? 'mono' : /serif|roman|times|garamond|georgia|book|old style/i.test(f) && !/sans/i.test(f) ? 'serif' : 'sans');
const fontFamily = f => FONTS[f]?.[1] ?? `'${String(f).replace(/['\\]/g, '')}', ${{ sans: 'sans-serif', serif: 'serif', mono: 'monospace' }[fontClass(f)]}`;
const groupBy = (list, f) => list.reduce((m, x) => { const k = f(x); (m.get(k) ?? m.set(k, []).get(k)).push(x); return m; }, new Map());
const none = c => !c || c === 'none';
// Ink on a fill (dendra.md, Settings). A color's luminance, as WCAG works it out, or null for what isn't one; a fill
// too dark for ink, on which white reads better than black; and the white a text is drawn in on one, where it has no
// color of its own and its own wouldn't read there.
const luminance = c => { const m = /^#?([0-9a-f]{6})$/i.exec(c ?? ''); return !m ? null : [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0); };
const tooDark = s => !none(s.Fill) && (s.Transparency ?? 0) < 50 && (L => L !== null && L < 0.179)(luminance(s.Fill));
const unread = (color, fill) => { const a = luminance(color), b = luminance(fill); return a === null || b === null || (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) < 3; };
const WHITE = '#ffffff';
function inkOn(b) {
  const fill = b.settings.Fill?.value;
  if (!tooDark({ Fill: fill, Transparency: b.settings.Transparency?.value })) return;
  for (const it of b.texts) {
    // Its own: given it or its box, this one or a group's. Not the default, or its entry's style everywhere, which know nothing of this fill.
    const n = it.settings.Color?.note, own = !!n?.view && (idsIn(n.pattern).size > 0 || !!n.param || !!n.pattern.out && ('choice' in n.pattern.out || 'tag' in n.pattern.out) || n.pattern.args?.length !== 1);
    if (!own && unread(it.look.Color, fill)) { it.look = { ...it.look, Color: WHITE }; it.settings = { ...it.settings, Color: { value: WHITE, note: n ?? null } }; }
  }
}

// ---- Geometry: PowerPoint's preset shapes, by plain names, as paths in a w × h frame ----

const GEOMETRIES = ['rect', 'rounded', 'oval', 'triangle', 'diamond', 'hexagon', 'octagon', 'parallelogram', 'trapezoid', 'pentagon', 'chevron', 'arrow', 'cylinder',
  'rtriangle', 'snip', 'snip2', 'round1', 'round2', 'plaque', 'heptagon', 'decagon', 'dodecagon', 'homeplate', 'folded', 'cube'];
function path(shape, w, h, corner = CORNER) {
  const s = Math.min(w, h), n = v => +v.toFixed(2), a = s * 0.16667;
  const poly = ps => `M${ps.map(([x, y]) => `${n(x)},${n(y)}`).join(' L')} Z`;
  const arc = (x, y, r = a, sweep = 1) => `A${n(r)},${n(r)} 0 0 ${sweep} ${n(x)},${n(y)}`;
  switch (shape) {
    case 'rtriangle': return poly([[0, 0], [w, h], [0, h]]);
    case 'snip': return poly([[0, 0], [w - a, 0], [w, a], [w, h], [0, h]]);
    case 'snip2': return poly([[a, 0], [w - a, 0], [w, a], [w, h], [0, h], [0, a]]);
    case 'round1': return `M0,0 H${n(w - a)} ${arc(w, a)} V${n(h)} H0 Z`;
    case 'round2': return `M${n(a)},0 H${n(w - a)} ${arc(w, a)} V${n(h)} H0 V${n(a)} ${arc(a, 0)} Z`;
    case 'plaque': return `M0,${n(a)} ${arc(a, 0, a, 0)} H${n(w - a)} ${arc(w, a, a, 0)} V${n(h - a)} ${arc(w - a, h, a, 0)} H${n(a)} ${arc(0, h - a, a, 0)} Z`;
    case 'heptagon': { const cx = w / 2, rx = cx * 1.02572, ry = h / 2 * 1.05210, cy = h / 2 * 1.05210; return poly([[cx - rx * 0.97493, cy + ry * 0.22252], [cx - rx * 0.78183, cy - ry * 0.62349], [cx, 0], [cx + rx * 0.78183, cy - ry * 0.62349], [cx + rx * 0.97493, cy + ry * 0.22252], [cx + rx * 0.43388, cy + ry * 0.90097], [cx - rx * 0.43388, cy + ry * 0.90097]]); }
    case 'decagon': { const cx = w / 2, cy = h / 2, ry = h / 2 * 1.05146, dx1 = cx * 0.80902, dx2 = cx * 0.30902, dy1 = ry * 0.58779, dy2 = ry * 0.95106; return poly([[0, cy], [cx - dx1, cy - dy1], [cx - dx2, cy - dy2], [cx + dx2, cy - dy2], [cx + dx1, cy - dy1], [w, cy], [cx + dx1, cy + dy1], [cx + dx2, cy + dy2], [cx - dx2, cy + dy2], [cx - dx1, cy + dy1]]); }
    case 'dodecagon': { const [x1, x2, x3, x4] = [2894, 7906, 13694, 18706].map(k => w * k / 21600), [y1, y2, y3, y4] = [2894, 7906, 13694, 18706].map(k => h * k / 21600); return poly([[0, y2], [x1, y1], [x2, 0], [x3, 0], [x4, y1], [w, y2], [w, y3], [x4, y4], [x3, h], [x2, h], [x1, y4], [0, y3]]); }
    case 'homeplate': return poly([[0, 0], [w - s / 2, 0], [w, h / 2], [w - s / 2, h], [0, h]]);
    case 'folded': return `M0,0 H${n(w)} V${n(h - a)} L${n(w - a)},${n(h)} H0 Z M${n(w - a)},${n(h)} L${n(w - a + a / 5)},${n(h - a + a / 5)} L${n(w)},${n(h - a)}`;
    case 'cube': { const d = s * 0.25; return `M0,${n(d)} H${n(w - d)} V${n(h)} H0 Z M0,${n(d)} L${n(d)},0 H${n(w)} L${n(w - d)},${n(d)} M${n(w)},0 V${n(h - d)} L${n(w - d)},${n(h)}`; }
    case 'rounded': { const r = s * Math.min(50, Math.max(0, corner)) / 100; return `M${n(r)},0 H${n(w - r)} A${n(r)},${n(r)} 0 0 1 ${n(w)},${n(r)} V${n(h - r)} A${n(r)},${n(r)} 0 0 1 ${n(w - r)},${n(h)} H${n(r)} A${n(r)},${n(r)} 0 0 1 0,${n(h - r)} V${n(r)} A${n(r)},${n(r)} 0 0 1 ${n(r)},0 Z`; }
    case 'oval': return `M0,${n(h / 2)} A${n(w / 2)},${n(h / 2)} 0 1 1 ${n(w)},${n(h / 2)} A${n(w / 2)},${n(h / 2)} 0 1 1 0,${n(h / 2)} Z`;
    case 'triangle': return poly([[w / 2, 0], [w, h], [0, h]]);
    case 'diamond': return poly([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]]);
    case 'hexagon': { const a = s * 0.25; return poly([[a, 0], [w - a, 0], [w, h / 2], [w - a, h], [a, h], [0, h / 2]]); }
    case 'octagon': { const c = s * 0.29289; return poly([[c, 0], [w - c, 0], [w, c], [w, h - c], [w - c, h], [c, h], [0, h - c], [0, c]]); }
    case 'parallelogram': { const a = s * 0.25; return poly([[a, 0], [w, 0], [w - a, h], [0, h]]); }
    case 'trapezoid': { const a = s * 0.25; return poly([[a, 0], [w - a, 0], [w, h], [0, h]]); }
    case 'pentagon': return poly([[w / 2, 0], [w, h * 0.38], [w * 0.81, h], [w * 0.19, h], [0, h * 0.38]]);
    case 'chevron': { const a = s * 0.5; return poly([[0, 0], [w - a, 0], [w, h / 2], [w - a, h], [0, h], [a, h / 2]]); }
    case 'arrow': { const a = s * 0.5; return poly([[0, h / 4], [w - a, h / 4], [w - a, 0], [w, h / 2], [w - a, h], [w - a, h * 3 / 4], [0, h * 3 / 4]]); }
    case 'cylinder': { const r = s * 0.125; return `M0,${n(r)} A${n(w / 2)},${n(r)} 0 0 1 ${n(w)},${n(r)} V${n(h - r)} A${n(w / 2)},${n(r)} 0 0 1 0,${n(h - r)} Z M0,${n(r)} A${n(w / 2)},${n(r)} 0 0 0 ${n(w)},${n(r)}`; }
    default: return `M0,0 H${n(w)} V${n(h)} H0 Z`;
  }
}
// Where a shape's text goes: the share of its width a line may take, and how its block sits. A triangle's
// text sits at its base, each line as wide as the triangle is where the line sits (see pyramid).
const TEXT_AREA = { oval: 0.78, diamond: 0.56, hexagon: 0.8, octagon: 0.8, pentagon: 0.7, chevron: 0.6, arrow: 0.6, triangle: 0.62 };
// Where PowerPoint sets the text of a shape whose text the scene sets across its width, in a w × h frame: how far
// in from its left and right (`x`), its top and its bottom, PowerPoint's text rect for the preset. A rounded
// rectangle's is in from its corners, by their radius (a sixth of the shorter side) times 1 − √½; a
// parallelogram's and a trapezoid's by their slant; a cylinder's under its top. So a line set left starts
// where PowerPoint starts it, and a block sits where PowerPoint sets it.
const TEXT_RECT = {
  rounded: (w, h, corner = CORNER) => { const x = Math.min(50, Math.max(0, corner)) / 100 * 0.29289 * Math.min(w, h); return { x, top: x, bottom: x }; },
  parallelogram: (w, h) => { const q = (1 + 1.25 * Math.min(w, h) / w) / 12; return { x: q * w, top: q * h, bottom: q * h }; },
  trapezoid: (w, h) => { const x = Math.min(w, h) / 6; return { x, top: x * h / w, bottom: 0 }; },
  cylinder: (w, h) => { const y = Math.min(w, h) / 8; return { x: 0, top: 2 * y, bottom: y }; },
  // (`shift`, where its rect sits off its middle, how far its middle is from the shape's.)
  rtriangle: (w, h) => ({ x: w / 4, shift: -w / 6, top: h * 7 / 12, bottom: h / 12 }),
  snip: (w, h) => { const a = Math.min(w, h) * 0.16667; return { x: a / 4, shift: -a / 4, top: a / 2, bottom: 0 }; },
  snip2: (w, h) => { const a = Math.min(w, h) * 0.16667; return { x: a / 2, top: a / 2, bottom: 0 }; },
  round1: (w, h) => { const i = Math.min(w, h) * 0.16667 * 0.29289; return { x: i / 2, shift: -i / 2, top: 0, bottom: 0 }; },
  round2: (w, h) => { const i = Math.min(w, h) * 0.16667 * 0.29289; return { x: i, top: i, bottom: 0 }; },
  plaque: (w, h) => { const i = Math.min(w, h) * 0.16667 * 0.70711; return { x: i, top: i, bottom: i }; },
  heptagon: (w, h) => ({ x: w * 0.09903, top: h * 0.19806, bottom: 0 }),
  decagon: (w, h) => ({ x: w * 0.09549, top: h * 0.19098, bottom: h * 0.19098 }),
  dodecagon: (w, h) => ({ x: w * 2894 / 21600, top: h * 2894 / 21600, bottom: h * 2894 / 21600 }),
  homeplate: (w, h) => { const a = Math.min(w, h) / 2; return { x: a / 4, shift: -a / 4, top: 0, bottom: 0 }; },
  folded: (w, h) => ({ x: 0, top: 0, bottom: Math.min(w, h) * 0.16667 }),
  cube: (w, h) => { const d = Math.min(w, h) * 0.25; return { x: d / 2, shift: -d / 2, top: d, bottom: 0 }; },
};
const textRect = (shape, w, h, corner) => TEXT_RECT[shape]?.(w, h, corner) ?? { x: 0, top: 0, bottom: 0 };
const INSET = 9.6, PAD = 4.8, BASE = 7 * PT;
// A box's width where none is entered: about 100 pt, so that a chart's names wrap rather than its page
// widens; a triangle's a little more, its text sitting in its lower half.
const WIDTH = { box: 132, triangle: 176 }, SPREAD = 20;

// ---- Text ----

let ctx = null;
const widths = new Map();
// A line's width, as the chart's fonts set it.
function measure(text, t) {
  const font = `${t.Italic ? 'italic ' : ''}${t.Bold ? 'bold ' : ''}${t.Size * PT}px ${fontFamily(t.Font)}`, k = `${font}|${text}`;
  let w = widths.get(k);
  if (w === undefined) {
    ctx ??= (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(1, 1) : document.createElement('canvas')).getContext('2d');
    ctx.font = font;
    if (widths.size > 20000) widths.clear();
    widths.set(k, w = ctx.measureText(text).width);
  }
  return w;
}
// A corporate suffix keeps to the word before it, and so does a numeral, roman or arabic, with any "-A" or "-1"
// it has, each joined by a no-break space, which PowerPoint keeps too: "BDC, Inc.", "Capital GP III, LLC",
// "Partners III-A, L.P."; never "Inc." or "III" alone at a line's start, unless what they're bound into is
// wider than the line.
const SUFFIX = /, (Inc\.|LLC|L\.L\.C\.|L\.P\.|LP|LLP|Ltd\.|Limited|S\.à r\.l\.|S\.A\.|GmbH|mbH|N\.V\.|B\.V\.|plc)(?=$|[\s:;,)])/g;
const NUMERAL = / (?=(?:[IVX]+|\d+)(?:-[A-Z0-9]+)?(?:$|[\s,;:)]))/g;
// And a person's initial to what follows it ("A. Chen"), and what's in a parenthesis to itself, so a line never breaks inside one where it fits a line.
const INITIAL = /(?<=^|\s)([A-Z]\.) (?=\S)/g, PAREN = /\([^()\n]*\)/g;
const bind = text => String(text).replace(SUFFIX, (_, s) => `,\u00a0${s.replace(/ /g, '\u00a0')}`).replace(NUMERAL, '\u00a0').replace(INITIAL, '$1\u00a0').replace(PAREN, p => p.replace(/ /g, '\u00a0'));
// A name's words kept together: of three or more, its first two stand on one line where they fit one, so it never opens on a word
// alone that's only part of what it's called ("Calder / Ridge Capital"). Its lines then break where its words allow.
const opening = (words, t, most) => words.length > 2 && measure(`${words[0]} ${words[1]}`, t) <= most ? [`${words[0]} ${words[1]}`, ...words.slice(2)] : words;
// A name that opens so all the same, in three lines or more, is a reason to widen (see size).
const opensAlone = it => !!it?.name && it.lines.length > 2 && !it.lines[0].text.includes(' ');
// What's bound, wider than `most`, come apart as little as it must: after a role's colon first, then at its suffix,
// then its numeral's binding, and so on. \u2192 its pieces.
function apart(w, t, most) {
  if (!w.includes('\u00a0') || measure(w, t) <= most) return [w];
  const r = w.indexOf(':\u00a0'), c = w.indexOf(',\u00a0'), i = r >= 0 ? r + 1 : c >= 0 ? c + 1 : w.indexOf('\u00a0');
  return [...apart(w.slice(0, i), t, most), ...apart(w.slice(i + 1), t, most)];
}
// Text broken into lines no wider than `width`, at spaces where it can be: as few lines as hold it, and,
// `balanced`, as even as they can be, the least width that keeps them as few, as CSS's text-wrap: balance
// sets a heading. What's bound wider than the line comes apart (see apart), and the lines are `split`, but where it
// comes apart only after a role's colon, as a list of who holds it may. A word
// wider than the line is hyphenated where it must be, and that line is `cut`, the text no longer what was
// typed. A text that `hang`s sets the lines after each paragraph's first an em in, `hung`, as a list sets an entry
// that runs on, and breaks them to the width less that. Kept, the latest few thousand, as the next scene breaks the
// same texts again.
const broken = new Map();
function breakLines(text, t, width, balanced = true, hang = false, name = false) {
  const k = `${t.Italic ? 'i' : ''}${t.Bold ? 'b' : ''}${t.Size}|${t.Font}|${width}|${balanced}|${hang}|${name}|${text}`, em = hang ? t.Size * PT : 0;
  let ls = broken.get(k);
  if (!ls) {
    ls = [];
    for (const para of bind(text).split('\n')) {
      let split = false;
      const parts = para.split(/ +/).flatMap(w => { const ps = apart(w, t, width - em); split ||= ps.filter(p => !p.endsWith(':')).length > 1; return ps; }), words = name ? opening(parts, t, width) : parts;
      let some = fill(words, t, width, em);
      if (balanced && some.length > 1 && !some.some(l => l.cut)) {
        let lo = Math.max(...words.map(w => measure(w, t))) + em, hi = width;
        while (hi - lo > 0.5) { const mid = (lo + hi) / 2; if (fill(words, t, mid, em).length > some.length) lo = mid; else hi = mid; }
        some = fill(words, t, hi, em);
      }
      ls.push(...some.map((l, i) => ({ ...l, w: measure(l.text, t), ...(split && { split }), ...(i && em && { hung: true }) })));
    }
    if (broken.size > 4000) broken.clear();
    broken.set(k, ls);
  }
  return ls.map(l => ({ ...l }));
}
// As much on each line as fits it: the first `width`, the rest `inset` less.
function fill(words, t, width, inset = 0) {
  const out = [], room = () => out.length ? width - inset : width;
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (measure(next, t) <= room()) { line = next; continue; }
    if (line) out.push({ text: line });
    line = word;
    while (measure(line, t) > room() && line.length > 4) {
      let i = line.length - 2;
      while (i > 2 && measure(`${line.slice(0, i)}-`, t) > room()) i--;
      out.push({ text: `${line.slice(0, i)}-`, cut: true });
      line = line.slice(i);
    }
  }
  out.push({ text: line });
  return out;
}
// A text's lines, all of them. One set left that `hangs` hangs (see breakLines).
const linesOf = (it, width) => it.text ? breakLines(it.text, it.look, width, true, !!it.hangs && it.look.Align === 'left', !!it.name) : [];
// A dash as SVG and PDF draw it, for a line of weight w in points: its dashes and gaps, in pixels. PowerPoint's set: Round
// Dot (dotted), Square Dot, Dash (dashed), Dash Dot, Long Dash, Long Dash Dot, and Long Dash Dot Dot, each in its multiples of the weight.
const DASHES = { dashed: [4, 3], 'square-dot': [3, 1], 'dash-dot': [4, 3, 1, 3], 'long-dash': [8, 3], 'long-dash-dot': [8, 3, 1, 3], 'long-dash-dot-dot': [8, 3, 1, 3, 1, 3] };
const dash = (d, w) => { const p = w * PT; return DASHES[d] ? DASHES[d].map(k => Math.max(k, p * k)).join(' ') : d === 'dotted' ? `${Math.max(1, p)} ${Math.max(2.5, p * 2)}` : null; };
// A Shadow as it's drawn, or null for none: PowerPoint's outer shadow, its blur and its distance from the shape in points on
// the sheet, whatever scale the chart is drawn at, its angle in degrees clockwise from the right, its color and how transparent.
// 'soft' is its Offset: Bottom Right.
const SOFT = { blur: 4, distance: 3, angle: 45, color: '#000000', transparency: 60 };
const shadowOf = v => !v || v === 'none' ? null : v === 'soft' ? SOFT : { ...SOFT, ...v };
// A line's end as it's drawn: its Arrowhead's for that end, or else a small triangle.
const HEADS = { small: 1, medium: 1.4, large: 1.8 };
const headOf = (s, end) => ({ type: 'triangle', size: 'small', ...s.Arrowhead?.[end] });
// An arrowhead's length and width in pixels, for a line `w` pixels wide, as the canvas and the PDF draw them.
const headSize = (head, w) => { const k = HEADS[head.size] ?? 1; return { len: (5 + w * 3) * k, wide: (4 + w * 2.4) * k }; };
// A line of text's height: single spacing, 1.2 times its size, times its Spacing.
const lineHeight = t => t.Size * PT * 1.2 * (t.Spacing ?? 1);
// How far under the top of its line a line's baseline is: the same share of the line's height at any spacing, 0.93
// of its size at single spacing, as PowerPoint sets a line spaced exactly.
const baseline = t => lineHeight(t) * 0.775;
// A text's lines stacked from y, each placed by its alignment within [x0, x0 + width]: its baseline and
// its anchor, which is its start, middle or end; a line `hung` an em in, which the text's `hang` says.
function stack(item, x0, width, y) {
  const t = item.look, lh = lineHeight(t), em = t.Size * PT;
  item.lines.forEach((l, i) => {
    l.x = t.Align === 'left' ? x0 + (l.hung ? em : 0) : t.Align === 'right' ? x0 + width : x0 + width / 2;
    l.y = y + i * lh + baseline(t);
  });
  if (item.lines.some(l => l.hung)) item.hang = em; else delete item.hang;
  return y + item.lines.length * lh;
}
const blockHeight = items => items.reduce((h, it) => h + it.lines.length * lineHeight(it.look), 0);
// Where a block of text tb tall starts in a text rect from top to bottom, set at its top or bottom `inset` in from
// it, or in its middle: a Valign.
const valigned = (valign, top, bottom, tb, inset) => valign === 'top' ? top + inset : valign === 'bottom' ? bottom - inset - tb : top + (bottom - top - tb) / 2;
const widest = items => Math.max(0, ...items.flatMap(it => it.lines.map(l => l.w)));
// A text set again at the sheet's half point nearest its size (or `under` it), on a page drawn at s, its lines as
// they broke; but a size typed, on a page drawn at the scale it's laid out for, stands as typed (see typedAt).
function snap(it, s, under = false) {
  if (it.typedAt === s) return;
  it.look = { ...it.look, Size: half(it.look.Size, s, under) };
  for (const l of it.lines) l.w = measure(l.text, it.look);
}

// A triangle's text, set at its base, bottom up: each line as wide as the triangle is at the line's top, less a
// little either side, and holding as many of the words still to set, from the last, as fit it; so the widest
// lines are the lowest, and a taller triangle takes the fewest lines it can. Its height, the least that holds the
// text so, found by halving, or the least that holds it in the fewest lines no more than a line taller than
// that. A word wider than three quarters of the base is hyphenated, and its lines are `cut`; what's bound wider
// than that comes apart first, and where its pieces take lines of their own, they're `split`. The triangle widens as a box does (see size): up to
// `wide.lines` while its name takes more than four lines or is split, and up to `wide.tall` while it's taller
// than nine tenths its width. → { w, h, lines: [lines of each text] }.
// Kept by what it reads, the latest few thousand, as the next scene sets the same triangles again.
const pyramids = new Map();
function pyramid(texts, w, wide) {
  const k = JSON.stringify([w, wide, texts.map(it => [it.text, it.look.Font, it.look.Size, it.look.Bold, it.look.Italic, it.look.Spacing, !!it.name])]);
  let p = pyramids.get(k);
  if (!p) {
    p = fitPyramid(texts, w, wide);
    if (pyramids.size > 4000) pyramids.clear();
    pyramids.set(k, p);
  }
  return { ...p, lines: p.lines.map(ls => ls.map(l => ({ ...l }))) };
}
function fitPyramid(texts, w, wide) {
  const step = lineHeight(texts[0]?.look ?? TEXT);
  for (;;) {
    // A triangle too narrow to hold a piece of its text at any height, a word too short to break or a line
    // taller than it can rise, widens until it holds it.
    if (!shaped(texts, w, w * 40)) { w *= 1.25; continue; }
    // The least height that holds the text in no more than `n` lines (any, where n is Infinity), by halving.
    const least = (n = Infinity, lo = w * 0.5) => {
      const fits = h => { const ls = shaped(texts, w, h); return ls && ls.flat().length <= n; };
      let hi = w * 40;
      if (fits(lo)) return lo;
      while (hi - lo > 0.5) { const mid = (lo + hi) / 2; if (fits(mid)) hi = mid; else lo = mid; }
      return hi;
    };
    // The shortest, or the fewest lines no more than a line taller than that.
    const h0 = least(), n = shaped(texts, w, h0 + step).flat().length, h = least(n, h0), lines = shaped(texts, w, h);
    const cap = Math.max((lines[0].length > 4 || lines.flat().some(l => l.split)) && w < wide.lines ? wide.lines : 0, h > w * (wide.ratio ?? 1) && w < wide.tall ? wide.tall : 0, wide.opens && w < wide.opens && opensAlone({ name: texts[0]?.name, lines: lines[0] }) ? wide.opens : 0);
    if (!cap) return { w, h: Math.ceil(h), lines };
    w = Math.min(cap, w + 12);
  }
}
// A triangle w wide and h tall's texts set bottom up (see pyramid), each paragraph on lines of its own. → each
// text's lines, or null where they don't fit.
function shaped(texts, w, h) {
  const out = texts.map(() => []);
  let d = BASE;
  for (let i = texts.length - 1; i >= 0; i--) {
    const it = texts[i], t = it.look, lh = lineHeight(t), most = w * 0.75 - 2 * INSET;
    const paras = it.text ? bind(it.text).split('\n').map(p => units(p, t, most, !!it.name)) : [];
    for (let p = paras.length - 1; p >= 0; p--) {
      const words = paras[p], m = words.length, room = k => w * (h - d - (k + 1) * lh) / h - 2 * PAD;
      const said = (a, b) => words.slice(a, b).map(x => x.text).join(' ');
      // As few lines as hold the paragraph, filled bottom up; then, of the ways to set it in so many, the one
      // whose lines come nearest the triangle's sides, each as full of its room as the rest, and a line begun
      // with what's bound to the line above, `split`, only where nothing else holds it.
      let n = 0;
      for (let k = m; k > 0; n++) {
        let j = k - 1;
        if (measure(words[j].text, t) > room(n)) return null;
        while (j > 0 && !words[j - 1].cut && measure(said(j - 1, k), t) <= room(n)) j--;
        k = j;
      }
      // best[k][a]: the least cost of setting words a… in the bottom k lines, and where the topmost of them ends.
      const best = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(null));
      best[0][m] = { cost: 0 };
      for (let k = 1; k <= n; k++) for (let a = 0; a < m; a++) for (let b = a + 1; b <= m; b++) {
        if (words.slice(a, b - 1).some(x => x.cut) || !best[k - 1][b]) continue;
        const width = measure(said(a, b), t), r = room(k - 1);
        if (width > r) break;
        const cost = best[k - 1][b].cost + (1 - width / r) ** 2 + (words[a].bound ? n : 0);
        if (!best[k][a] || cost < best[k][a].cost) best[k][a] = { cost, end: b };
      }
      if (!best[n][0]) return null;
      const lines = [];
      for (let k = n, a = 0; k > 0; k--) {
        const b = best[k][a].end, text = said(a, b);
        lines.push({ text, w: measure(text, t), ...(words[a].bound && { split: true }), ...(words[b - 1].cut && { cut: true }) });
        a = b;
      }
      out[i].unshift(...lines);
      d += n * lh;
    }
  }
  return out;
}
// A paragraph's words for a triangle, each no wider than `most`: what's bound wider comes apart (see apart),
// each piece after the first `bound` to the one before; a word still wider is hyphenated, each piece but the
// last `cut`.
function units(para, t, most, name = false) {
  const out = [];
  for (const word of para.split(/ +/).filter(Boolean)) apart(word, t, most).forEach((w, k) => {
    if (measure(w, t) <= most) return out.push({ text: w, bound: k > 0 });
    fill([w], t, most).forEach((l, j, ls) => out.push({ text: l.text, bound: k > 0 && j === 0, cut: j < ls.length - 1 }));
  });
  return name && out.length > 2 && !out[0].cut && !out[1].cut && measure(`${out[0].text} ${out[1].text}`, t) <= most ? [{ text: `${out[0].text} ${out[1].text}`, bound: false }, ...out.slice(2)] : out;
}

// A box's size: its width entered or its shape's own, `squeeze` times that on a paper narrower than its page,
// and as tall as its text needs, every line of it, broken to fit the shape where it sits (at a triangle's
// base, inside an oval). It widens before it grows tall: while its name takes more than four lines or a suffix
// comes off its word, by half at most where nobody sized it, and back to its size where its size is entered,
// on another paper; and while it's taller than it's wide (a triangle, than nine tenths of it), to twice its
// width at most, so that a long name never shrinks the whole chart. Triangles of one width are one size, the
// tallest any of them needs (see level). A box whose name's size is typed is `wider` as that needs (see typedAt): nobody
// having sized it, as its name is larger than the chart's own, and sized, as it printed where it was sized.
function size(b, squeeze, at = null, grow = 1) {
  const shape = b.settings.Shape.value, own = b.pos?.w && b.pos.w * (b.wider?.own ?? 1), base = (own ?? (shape === 'triangle' ? WIDTH.triangle : shape === 'oval' ? WIDTH.box : WIDTH.box * grow) * (b.wider?.free ?? 1)) * squeeze;
  // (On a paper narrower than its page, which has the room down it, a triangle stands taller for its width.)
  const wide = { lines: own ?? base * 1.5, tall: base * 2, ratio: 1 / (squeeze * squeeze), opens: b.texts[0]?.typedAt == null && !own ? base * 1.25 : 0 };
  let w = at ?? base, h;
  // Sized by a hand, a box is the size it was given, its text as it falls in that; a height typed stands, as a width does.
  if (b.exact) {
    if (shape === 'triangle') {
      const fit = pyramid(b.texts, w, { lines: w, tall: w }), lines = b.pos.h > fit.h ? shaped(b.texts, w, b.pos.h) : null;
      b.texts.forEach((it, i) => { it.lines = (lines ?? fit.lines)[i]; });
      h = fit.h;
    } else {
      const avail = Math.max(32, w * (TEXT_AREA[shape] ?? 1) - 2 * INSET);
      for (const it of b.texts) it.lines = linesOf(it, avail);
      const tb = blockHeight(b.texts.filter(it => it.lines.length));
      h = shape === 'oval' || shape === 'diamond' ? Math.max(48, tb / (shape === 'oval' ? 0.74 : 0.5) + 2 * PAD) : Math.max(44, tb + 2 * PAD + 8);
    }
    b.texts = b.texts.filter(it => it.lines.length);
    Object.assign(b, { w, h: b.pos.h ?? h, shape, base });
    if (shape === 'triangle') b.column = columnOf(b);
    return;
  }
  if (shape === 'triangle') {
    const fit = pyramid(b.texts, w, wide);
    b.texts.forEach((it, i) => { it.lines = fit.lines[i]; });
    ({ w, h } = fit);
  } else {
    const lay = () => {
      const avail = Math.max(32, w * (TEXT_AREA[shape] ?? 1) - 2 * INSET);
      for (const it of b.texts) it.lines = linesOf(it, avail);
      const tb = blockHeight(b.texts.filter(it => it.lines.length));
      h = shape === 'oval' || shape === 'diamond' ? Math.max(48, tb / (shape === 'oval' ? 0.74 : 0.5) + 2 * PAD) : Math.max(44, tb + 2 * PAD + 8);
      // How far it's to widen yet: none, or to a cap.
      const lines = ((b.texts[0]?.lines.length ?? 0) > 3 || b.texts.some(it => it.lines.some(l => l.split))) && w < wide.lines;
      // (A word that would fit a line of its own is never broken: the box is as wide as that needs, up to three times its size.)
      const word = !b.texts.some(it => it.lines.some(l => l.cut)) ? 0 : Math.min(3 * base, Math.max(...b.texts.flatMap(it => String(it.text).split(/\s+/).map(x => measure(x, it.look)))) + 2 * INSET + 1) / (TEXT_AREA[shape] ?? 1);
      return Math.max(lines ? wide.lines : 0, h > w && w < wide.tall ? wide.tall : 0, word > w ? word : 0, wide.opens && w < wide.opens && opensAlone(b.texts[0]) ? wide.opens : 0);
    };
    for (let cap; (cap = lay());) w = Math.min(cap, w + 12);
    // And a little wider, nobody having sized it, where that takes a line off its name: a fifth at most, the least that does.
    const name = b.texts[0]?.name && b.texts[0];
    if (name && !own && at === null && name.lines.length > 1) {
      const n = name.lines.length, width = v => Math.max(32, v * (TEXT_AREA[shape] ?? 1) - 2 * INSET);
      for (let v = w + 4; v <= base * 1.2; v += 4) if (linesOf(name, width(v)).length < n) { w = v; lay(); break; }
    }
  }
  b.texts = b.texts.filter(it => it.lines.length);
  Object.assign(b, { w, h: Math.max(h, b.pos?.h ?? 0), shape, base });
  if (shape === 'triangle') b.column = columnOf(b);
}
// A triangle's column, where its lines are set, centred: its base, less a little either side.
const columnOf = b => ({ x: PAD, width: b.w - 2 * PAD });

// What a record says as a line of text: a value as it reads, an option, a tag by its label.
function textOf(r, format, name) {
  if (format === 'none') return '';
  const edge = r.edge ?? name;
  const v = isField(r) ? Tree.format(r.field, r.value) : isChoice(r) ? r.choice : isTag(r) ? (r.tag ? edge : `Not ${edge}`) : name;
  if (format === 'paren') return `(${v})`;
  if (format === 'label' && !isTag(r)) return `${edge}: ${v}`;
  return v;
}

// ---- The scene ----

const now = () => (typeof performance === 'object' ? performance.now() : Date.now());
// How each view was last drawn as it is, which its previews keep: its boxes, lines, page and furniture.
const laidOut = new Map();
// What a scene works out from a record's tree and the notes alone, its formats and its edges' order, kept by
// record from one scene to the next while the notes, the view and the records its tree runs through stand: a
// store of them for each of the latest views and states of the notes, so views shown in turn each keep theirs. Only
// notes of a record's shape decide for it (Notes), so a record keeps what the view's store before had for it where no
// note of its shape is new or gone since: a look changed works out again only what has its shape.
const worked = new Map();
function workedIn(notesAre, view, rows) {
  let w = worked.get(notesAre);
  if (!w) {
    const shapes = new Map(), last = [...worked.values()].reverse().find(x => x.view === view), map = new WeakMap();
    for (const r of rows) if ('note' in r) shapes.set(r.id, Tree.shapeOf(r.pattern));
    const before = last?.map, changed = new Set();
    if (last) {
      for (const [id, s] of shapes) if (!last.shapes.has(id)) changed.add(s);
      for (const [id, s] of last.shapes) if (!shapes.has(id)) changed.add(s);
    }
    // (A note at a pattern leaving a location open, what's changed, is of every shape.)
    const every = [...changed].some(s => s.includes('?'));
    const had = r => { const x = before?.get(r); return x && !every && !changed.has(x.shape) ? (map.set(r, x), x) : undefined; };
    w = { view, shapes, map, get: r => map.get(r) ?? had(r), set: (r, x) => map.set(r, x) };
  }
  worked.delete(notesAre);
  worked.set(notesAre, w);
  if (worked.size > 12) worked.delete(worked.keys().next().value);
  return w;
}
// ---- What's changed (dendra.md, Changes) ----
// What a view showing changes says of a mark: New, Changed or Gone, an option of one entry any record can have, its
// location left open, which the comparison gives and nothing enters: so its look is a style like any other, a Styles row and a
// Key row, aimed, restyled and carried by a look as any is, what's drawn by it the same on the canvas, in the PDF and the deck.
const CHANGES = 'Changes';
const changeOutput = what => ({ out: { choice: what }, args: [{ edge: CHANGES, loc: Tree.OPEN }] });
const isChange = p => p.args?.length === 1 && same(p.args[0].edge, CHANGES) && !!p.args[0].loc?.open;
// The look it begins in, in no colour that says anything else on a chart: not the Key's red.
const CHANGED_LOOK = { Fill: '#fff2cc', Outline: '#0070c0', Weight: 1.5, Color: '#1f4e79' };
const CHANGE_LOOKS = { New: CHANGED_LOOK, Changed: CHANGED_LOOK, Gone: { Fill: 'none', Outline: '#a6a6a6', Dash: 'dashed', Weight: 0.75, Color: '#7f7f7f', Strike: true } };
const CHANGE_CAPTIONS = { New: 'New or changed', Changed: 'New or changed', Gone: 'Gone' };
// A view's chart pages, in tab order.
const pagesOf = (N, state) => Object.keys(state).filter(id => Tree.isView(state[id]) && typeof N.value('Layout', { id, kind: 'View' }) !== 'object')
  .sort((a, b) => (N.order({ id: a, kind: 'View' }) ?? Infinity) - (N.order({ id: b, kind: 'View' }) ?? Infinity) || (a < b ? -1 : 1));
// The day a view compares with, by its Changes note: one it names, or the page before it's, the day that keeps, or today.
function sinceOf(N, view, state) {
  const v = N.value(CHANGES, { id: view, kind: 'View' });
  if (!v) return null;
  if (v.since) return v.since;
  const pages = pagesOf(N, state), at = pages.indexOf(view);
  return at > 0 ? N.value('As Of', { id: pages[at - 1], kind: 'View' }) ?? Log.today() : null;
}
// What the chart works out as of that day, kept with what's entered then, which stands while the log does.
const workedThen = new WeakMap();
function stateThen(wb, chart, day, from) {
  const entered = wb.asOf(chart, day);
  let R = workedThen.get(entered);
  if (!R) { const N = wb.notes(chart), S = wb.schema(chart); workedThen.set(entered, R = Formulas.computeState(entered, N.definitions(S), { relations: N.relations(S), schema: S, day, named: wb.named?.(chart) }, from)); }
  return R.records;
}
// The comparison, of what the view draws as of `day` with what it draws as of the day it compares with, a mark at a time, its
// looks and its words: nothing its fields don't say, so nothing's marked that can't be seen. → { since, state, marks, was, lost }:
// `state`, the state to draw, what's gone brought back into it (its records as they were, with their entries and what
// they're at), and each mark's option a record at it; `marks`, by record, New, Changed or Gone; `was`, by text, what a text
// said that says otherwise now; `lost`, by mark, the texts it had and has no more. Null where there's nothing to compare.
const comparedFrom = new WeakMap(), changeRows = new Map();
function comparing(wb, chart, view, day, opts) {
  const N = wb.notes(chart), since = sinceOf(N, view, opts.state);
  if (!since || since >= day) return null;
  const then = stateThen(wb, chart, since, opts.computed), k = `${view}|${since}|${readRows(wb.rows(chart), view).notes}`;
  const kept = !opts.seen?.size && (comparedFrom.get(opts.state) ?? comparedFrom.set(opts.state, new Map()).get(opts.state));
  if (kept && kept.get(k)?.then === then) return kept.get(k);
  const drawnOn = (state, d) => of(wb, chart, view, d, { state, compared: true, looks: 'texts', ...(opts.seen && { seen: opts.seen }) }).byId;
  const was = drawnOn(then, since), is = drawnOn(opts.state, day), state = { ...opts.state }, marks = new Map(), said = new Map(), lost = new Map();
  const bring = id => { if (state[id] || !then[id]) return; state[id] = then[id]; argsOf(then[id]).forEach(a => bring(a.at)); (Tree.index(then).entries.get(id) ?? []).forEach(bring); };
  const mark = (record, what) => {
    marks.set(record, what);
    const row = `${what}|${record}`;
    state[`·${row}`] = changeRows.get(row) ?? changeRows.set(row, { at: record, edge: CHANGES, choice: what }).get(row);
  };
  for (const [id, m] of is) {
    const w = was.get(id);
    if (!w) { mark(m.record, 'New'); continue; }
    const had = new Map(w.texts.filter(t => !t.blank).map(t => [t.id, t])), has = new Set(m.texts.filter(t => !t.blank).map(t => t.id));
    let differs = KEYED[m.type].some(p => JSON.stringify(m.settings[p]?.value) !== JSON.stringify(w.settings[p]?.value));
    for (const t of m.texts) if (!t.blank) {
      const o = had.get(t.id);
      if (!o) differs = true;
      else if (o.text !== t.text) { differs = true; said.set(t.id, o.text); }
    }
    const left = [...had.values()].filter(t => !has.has(t.id));
    if (left.length) { differs = true; lost.set(id, left); }
    if (differs) mark(m.record, 'Changed');
  }
  for (const [id, m] of was) if (!is.has(id)) {
    bring(m.record);
    m.texts.forEach(t => (t.records ?? [t.id]).forEach(bring));
    mark(m.record, 'Gone');
  }
  const out = { then, since, state, marks, was: said, lost };
  if (kept) kept.set(k, out);
  return out;
}

// Each view's latest scenes, and what each was drawn from, which is all a scene reads: the state, the notes,
// the view's free shapes and what they say, its day and its paper. Drawn again from the same, it's the same:
// so a change previewed, once made, is drawn as it was laid out ahead, and its Undo as the chart was before.
const drawnFrom = new Map();
// Whether two records say the same, as a record put back by Undo, a fresh copy, says what it said.
const sameRecord = (a, b) => a === b || (!!a && !!b && Object.keys(a).length === Object.keys(b).length
  && Object.keys(a).every(k => a[k] === b[k] || (k === 'args' && JSON.stringify(a.args) === JSON.stringify(b.args))));
// Whether a scene drawn from the state `before` is the scene of `after`: they differ in a few records, each one it
// neither draws nor styles. Such a record is no object (a box), and no name (drawn where nothing says); no
// format of the view reaches it, so nothing of it is drawn and nothing lands from it; and nothing is located at
// it, whose tree, and so whose formats, it's part of. So a value the view doesn't show, edited, leaves the scene
// as it was. formatsOf(state, id): a record's formats in the view.
function unmoved(scene, before, after, formatsOf) {
  const changed = new Set();
  for (const id in after) if (!sameRecord(before[id], after[id]) && changed.add(id).size > 64) return false;
  for (const id in before) if (!(id in after) && changed.add(id).size > 64) return false;
  const inert = (recs, id) => {
    const r = recs[id];
    return !r || (!isObject(r) && !(r.at && isObject(recs[r.at] ?? {}) && Tree.norm(r.edge ?? '') === 'name') && !Object.keys(formatsOf(recs, id)).length);
  };
  const unlocated = recs => { for (const id in recs) { const r = recs[id]; if ((r.at && changed.has(r.at)) || r.args?.some(a => changed.has(a.at))) return false; } return true; };
  return [...changed].every(id => !scene.byId.has(id) && inert(before, id) && inert(after, id)) && unlocated(before) && unlocated(after);
}

// What a scene reads of a chart's rows, as they stand: its notes, by their ids, and each view's free shapes.
const rowsRead = new WeakMap();
function readRows(rows, view) {
  let r = rowsRead.get(rows);
  if (!r) rowsRead.set(rows, r = { notes: rows.filter(x => 'note' in x && x.label !== 'Scale').map(x => x.id).join(), shapes: new Map() });
  if (!r.shapes.has(view)) r.shapes.set(view, rows.filter(x => 'shape' in x && x.view === view));
  return r;
}

const of = (...a) => { for (const s = drawing(...a); ;) { const r = s.next(); if (r.done) return r.value; } };
// Scene.looks(wb, chart, view, day, { state }) → { marks, byId }: each box and line the view draws, by id, with its
// settings as the notes give them (each { value, note }), and nothing laid out: what a look changed would leave, at
// a fraction of a scene's cost. A setting the layout derives (a weight at the page's scale, an arrow Auto gives) is as
// the notes have it.
const looks = (wb, chart, view, day, opts = {}) => of(wb, chart, view, day, { ...opts, looks: true });
// The steps: the marks, from the records; then for each layout tried, its boxes sized, ELK's part of it, its
// routes, again each time a gap is deepened for them, and the rest of it; then the page.
function* drawing(wb, chart, view, day = Log.today(), opts = {}) {
  const started = now();
  // A view that shows changes draws what's gone too, and says of each mark what's changed (see comparing).
  if (!opts.looks && !opts.compared) { const c = comparing(wb, chart, view, day, opts); if (c) opts = { ...opts, state: c.state, compared: c }; }
  const changes = opts.compared?.marks ? opts.compared : null;
  const rows = wb.rows(chart), read = readRows(rows, view), notesAre = `${view}|${read.notes}`;
  const shapeRows = read.shapes.get(view);
  const preview = !!(opts.keep || opts.reveal?.length || opts.seen?.size), drawnAs = `${chart}|${view}`;
  const said = new Map(shapeRows.map(r => [r.id, r.role === 'date' && wb.moment ? Log.stoodText(wb.moment) : shapeText(r, opts.computed, day)]));
  // (A Key is drawn from where it's kept or held, either being one: so what its change made was laid out ahead for, and a
  // Key kept elsewhere since is drawn there, as it would be from nothing.)
  const boxesHeld = opts.holds?.size ? [...opts.holds].filter(([id]) => !shapeRows.some(r => r.shape === id)) : [];
  const holding = JSON.stringify([boxesHeld, ...shapeRows.filter(r => r.geometry === 'legend').map(r => opts.holds?.get(r.shape) ?? r.kept ?? null)]);
  // (The scale it keeps, whether a change is about to write it or has: so what its change made was laid out ahead for, too.)
  const keeps = JSON.stringify(opts.holds?.page ?? wb.notes(chart).resolve('Scale', { id: view, kind: 'View' })?.value ?? null);
  const from = [opts.state, notesAre, shapeRows.map(({ id, kept, ...r }) => JSON.stringify(r)).join(), [...said.values()].join('\n'), day, holding, keeps, changes ? JSON.stringify([changes.since, [...changes.was], [...changes.lost.keys()]]) : ''], whence = `${drawnAs}|${opts.paper ?? ''}`;
  if (!preview && !opts.looks) {
    // Or from a state that differs from this one only in records it neither draws nor styles (see unmoved).
    const ds = drawnFrom.get(whence) ?? [], alike = ds.filter(d => d.from.every((x, i) => i === 0 || x === from[i]));
    // An entry the view's free text may read, or a field shown beside another record, is never inert.
    const N0 = wb.notes(chart), reads = N0.notes('Text').some(n => n.view === view), fielded = new Set(['Shown', ...TEXT_PROPS].flatMap(l => N0.notes(l).filter(n => n.param && n.view === view).map(n => Tree.norm(n.param))));
    const formatsOf = (recs, id) => { const r = recs[id], t = treeOf(recs, id); return r?.at && (reads || fielded.has(Tree.norm(r.edge ?? ''))) ? { Text: true } : t ? N0.formats(t, view) : {}; };
    const d = alike.find(d => d.from[0] === opts.state) ?? (alike[0] && unmoved(alike[0].scene, alike[0].from[0], opts.state, formatsOf) ? alike[0] : null);
    if (d) {
      if (d.laid && !opts.ahead) laidOut.set(drawnAs, d.laid);
      drawnFrom.set(whence, [{ ...d, from }, ...ds.filter(x => x !== d)].slice(0, 3));
      return d.scene;
    }
  }
  // (A yes-or-no in error drawn as not holding, so a check that breaks keeps its flags: Formulas.asDrawn.)
  const state = opts.computed ? Formulas.asDrawn(opts.computed, opts.state) : opts.state;
  const N = wb.notes(chart), styles = N.styles(view), styleAt = new Map(styles.map((s, i) => [s.key, i]));
  const tree = id => treeOf(state, id);
  const kept = workedIn(notesAre, view, rows), stands = new Map();
  const standing = id => {
    let s = stands.get(id);
    if (s === undefined) {
      const r = state[id], w = r && kept.get(r);
      stands.set(id, false);
      s = !!w && w.at.every((at, i) => state[at] === w.locs[i] && standing(at));
      stands.set(id, s);
    }
    return s;
  };
  const work = id => {
    if (standing(id)) return kept.get(state[id]);
    const r = state[id], at = argsOf(r).map(a => a.at), w = { at, locs: at.map(x => state[x]), shape: Tree.shapeOf(tree(id)), formats: N.formats(tree(id), view) };
    kept.set(r, w);
    stands.set(id, true);
    return w;
  };
  // Something else worked out from a record's tree and the notes, once.
  const once = (id, k, f) => { const w = work(id); return k in w ? w[k] : (w[k] = f()); };

  // A note's rank where it reaches a mark: in the view before none; one record's own (entered) before a
  // style's; a field shown beside an output (a Shown note's param) before one at its entry alone, as it's the
  // entry in those boxes only (see Fields); a later style before an earlier; and through the mark's own record
  // before a deeper one.
  const ranks = new Map();
  const rankOf = (note, depth) => {
    let r = ranks.get(note);
    if (!r) ranks.set(note, r = [note.view ? 1 : 0, idsIn(note.pattern).size ? 1 : 0, note.param ? 1 : 0, note.view ? (styleAt.get(key(bare(note.pattern))) ?? -1) : 0]);
    return [...r, -depth];
  };
  const beats = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i]; return false; };

  const boxAt = new Map();
  const boxOf = id => {
    if (!boxAt.has(id)) { const r = state[id]; boxAt.set(id, !r || Tree.isView(r) ? null : isObject(r) ? id : r.at ? boxOf(r.at) : null); }
    return boxAt.get(id);
  };

  // Marks: an object a box; a relation with two locations a line between their boxes; any other record a
  // text, in the mark of its nearest location (a relation of more than two, in each of their boxes). A
  // relation whose Connector is None draws no line: it's written in the box at its lower end, the side not
  // Above, as its role and who holds it (Directors: Margaret A. Chen, Priya N. Raman). A View object is the
  // app's own and never drawn.
  const marks = new Map(), own = new Map();
  const addMark = m => { marks.set(m.id, m); (own.get(m.record) ?? own.set(m.record, []).get(m.record)).push(m); return m; };
  // The records in order of their ids, not of where they stand in the state, so the same records always draw
  // the same picture: a record restored by Undo comes back where it was.
  const ids = Object.keys(state).filter(id => !Tree.isView(state[id]) && (standing(id) || tree(id))).sort();
  // What each record's notes give, landing on the nearest mark up the tree that has the property.
  const formats = new Map(ids.map(id => [id, work(id).formats]));
  // A two-sided relation's ends as its line runs, from its Above side, the edge drawn on top, to the other.
  const endsOf = (id, ends) => {
    const at = once(id, 'above', () => { const above = formats.get(id).Above?.value ?? N.edges(tree(id))[0]; return above && state[id].args.find(a => same(a.edge, above))?.at; });
    const top = at && boxOf(at);
    return top && top === ends[1] ? [ends[1], ends[0]] : ends;
  };
  // Records revealed for a while, and those they run through, are drawn (see drawn).
  const reveal = new Set();
  const revealUp = id => { const r = state[id]; if (!r || reveal.has(id)) return; reveal.add(id); argsOf(r).forEach(a => revealUp(a.at)); };
  for (const id of opts.reveal ?? []) revealUp(id);
  // A line nothing could draw makes no mark: one no note shows, with nothing located at it whose notes might, and
  // not revealed. Most of the relations a chart works out are such.
  const located = new Set();
  for (const id of ids) if (state[id].at) located.add(state[id].at);
  for (const id of ids) if (isObject(state[id])) addMark({ id, type: 'box', record: id, cand: {} });
  for (const id of ids) {
    const r = state[id];
    if (isObject(r)) continue;
    const ends = r.args?.length === 2 ? r.args.map(a => boxOf(a.at)) : null;
    if (ends && ends[0] && ends[1] && ends[0] !== ends[1]) {
      const f = formats.get(id);
      if (f.Connector?.value === 'none') { const [from, to] = endsOf(id, ends); addMark({ id: `${id}@${to}`, type: 'text', record: id, host: to, listed: from, cand: {} }); }
      else if (f.Shown || located.has(id) || reveal.has(id) || opts.seen?.get(id)) addMark({ id, type: 'line', record: id, ends, cand: {} });
    }
    else if (r.at) addMark({ id, type: 'text', record: id, cand: {} });
    else for (const b of new Set(argsOf(r).map(a => boxOf(a.at)).filter(Boolean))) addMark({ id: `${id}@${b}`, type: 'text', record: id, host: b, cand: {} });
  }
  // The mark a mark sits in: a text's location's, up to a box or line.
  const up = m => m.type !== 'text' ? null : m.host ? own.get(m.host)?.[0] : own.get(state[m.record].at)?.[0] ?? null;
  const offer = (m, label, res, record, depth) => {
    const r = rankOf(res.note, depth), c = m.cand[label];
    if (!c || beats(r, c.rank)) m.cand[label] = { value: res.value, note: res.note, record, rank: r };
  };
  const land = (record, label, res, accept) => {
    for (const start of own.get(record) ?? []) {
      let m = start, depth = 0;
      // A relation written in a box keeps what's given for its line to itself.
      while (m && !(HAS[m.type].has(label) && accept(m))) { m = m.listed ? null : up(m); depth++; }
      if (m) offer(m, label, res, record, depth);
    }
  };

  // Shown first, for the others land on what's drawn. A style that shows or hides by an option or a tag's
  // value is a filter: it shows or hides the box (or line) the record is in, not the record's own text.
  const filters = note => !idsIn(note.pattern).size && !!note.pattern.out && ('choice' in note.pattern.out || 'tag' in note.pattern.out);
  for (const id of ids) {
    const res = formats.get(id).Shown;
    if (res) land(id, 'Shown', res, m => !filters(res.note) || m.type !== 'text');
  }
  // Fields (dendra.md, Fields): a Shown note whose param names an entry shows or hides that entry in the box, or on
  // the line, that a record fitting its pattern is in, the field beside it there; ranked with what decides the entry's
  // own text, the narrower decides. `fieldsOf`, by box or line, each field's note that decides there.
  const hostOf = m => { let c = m, depth = 0; while (c && c.type === 'text') { c = c.listed ? null : up(c); depth++; } return [c, depth]; };
  const fieldsOf = new Map();
  if (N.notes('Shown').some(n => n.param && n.view === view)) {
    for (const id of ids) for (const [edge, res] of Object.entries(once(id, 'fields', () => N.fields(tree(id), view)))) for (const start of own.get(id) ?? []) {
      const [h, depth] = hostOf(start);
      if (!h) continue;
      const by = fieldsOf.get(h.id) ?? fieldsOf.set(h.id, new Map()).get(h.id), k = Tree.norm(edge), r = rankOf(res.note, depth), c = by.get(k);
      if (!c || beats(r, c.rank)) by.set(k, { value: res.value, note: res.note, record: id, rank: r });
    }
    for (const m of marks.values()) if (m.type === 'text' && !m.host) {
      const e = state[m.record].edge, h = e !== undefined && hostOf(m)[0], c = h && fieldsOf.get(h.id)?.get(Tree.norm(e));
      if (c && (!m.cand.Shown || beats(c.rank, m.cand.Shown.rank))) m.cand.Shown = c;
    }
  }
  // Where no note says, a box and its name are shown, and nothing else: a new chart's boxes say what they are.
  const named = m => m.type === 'text' && !m.host && isObject(state[state[m.record].at] ?? {}) && Tree.norm(state[m.record].edge ?? '') === 'name';
  const shownAlone = m => (m.type !== 'text' ? opts.seen?.get(m.record) : undefined) ?? (m.cand.Shown ? m.cand.Shown.value !== false : DEFAULTS[m.type].Shown || named(m));
  // Revealed, a hidden box or line is drawn; never a text, which would change the box it's in.
  const drawnMemo = new Map();
  const drawn = m => {
    if (!m) return false;
    if (drawnMemo.has(m)) return drawnMemo.get(m);
    drawnMemo.set(m, false);
    const shown = (reveal.has(m.record) && m.type !== 'text') || shownAlone(m);
    const d = shown && (m.type === 'box' || (m.type === 'line' ? m.ends.every(b => drawn(own.get(b)[0])) : drawn(up(m))));
    drawnMemo.set(m, d);
    return d;
  };
  // A look given at an entry's option or tag (Jurisdiction: Delaware, Not Good Standing) is a look of what has it: it
  // lands on the box or line the entry is in, as a filter's Shown does, never on the entry's own text, so Bold for
  // every Delaware box bolds those boxes whether or not they write their jurisdiction. Format, how the entry's own
  // text reads, stays its own.
  const about = note => filters(note) && note.pattern.args?.length === 1;
  for (const id of ids) for (const [label, res] of Object.entries(formats.get(id))) if (label !== 'Shown' && label !== 'Frame')
    land(id, label, res, label !== 'Format' && about(res.note) ? m => m.type !== 'text' && drawn(m) : drawn);
  // A text's look given beside an output (a format note whose param names an entry, dendra.md, Fields) is that field's
  // own in each box or line a record fitting the output is in, ranked as Shown beside an output is: Bold beside
  // Jurisdiction: Cayman Islands bolds the Jurisdiction field of every Cayman box, and nothing else in them.
  for (const label of TEXT_PROPS) if (label !== 'Format' && N.notes(label).some(n => n.param && n.view === view)) {
    const by = new Map();
    for (const id of ids) for (const [edge, res] of Object.entries(once(id, `beside ${label}`, () => N.fields(tree(id), view, label)))) for (const start of own.get(id) ?? []) {
      const [h, depth] = hostOf(start), k = h && `${h.id}|${Tree.norm(edge)}`, r = h && rankOf(res.note, depth), c = h && by.get(k);
      if (h && (!c || beats(r, c.rank))) by.set(k, { value: res.value, note: res.note, record: id, rank: r });
    }
    for (const m of marks.values()) if (m.type === 'text' && !m.host) {
      const e = state[m.record].edge, h = e !== undefined && hostOf(m)[0], c = h && by.get(`${h.id}|${Tree.norm(e)}`);
      if (c && (!m.cand[label] || beats(c.rank, m.cand[label].rank))) m.cand[label] = c;
    }
  }

  // The page's own Font and Size (dendra.md, Views), a note at the view itself: every text no narrower note reaches.
  const ofPage = Object.fromEntries(ROOT.map(l => [l, N.resolve(l, { id: view, kind: 'View' })]).filter(([, r]) => r));
  const settle = (m, defaults) => {
    m.settings = {};
    for (const [label, d] of Object.entries(defaults)) {
      const c = m.cand[label] ?? ofPage[label];
      m.settings[label] = c ? { value: c.value, note: c.note } : { value: d, note: null };
    }
  };
  const look = s => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v.value]));
  // What's beside a name in a box is the chart's own too, as the name is, and a size smaller: so it scales with the name, never left large as the chart falls. A size given it, or its box, is as given.
  const besideName = (host, s) => host.type === 'box' && !s.Size?.note ? { ...s, Size: { value: BESIDE_NAME, note: null } } : s;

  // The texts drawn in each box and on each line, in their entries' order. A text's properties reach it
  // through its own record and through its box's (or line's); as everywhere, the later style wins, and its
  // own where they tie. Format, how a value reads, is each record's own.
  const orders = new Map();
  const orderOf = id => orders.get(id) ?? orders.set(id, Tree.pathOf(state, id).slice(1).map(x => [once(x, 'order', () => N.order(tree(x))) ?? Infinity, Tree.norm(state[x].edge ?? '')])).get(id);
  const ordered = (p, q) => {
    for (let i = 0; i < Math.min(p.length, q.length); i++) if (p[i][0] !== q[i][0]) return p[i][0] - q[i][0]; else if (p[i][1] !== q[i][1]) return p[i][1] < q[i][1] ? -1 : 1;
    return p.length - q.length;
  };
  const byOrder = (a, b) => ordered(orderOf(a.record), orderOf(b.record));
  const container = m => { let c = up(m); while (c && c.type === 'text') c = up(c); return c; };
  const textItem = (m, host) => {
    for (const label of TEXT_PROPS) {
      const h = label !== 'Format' && host.cand[label];
      if (h && (!m.cand[label] || beats(h.rank, m.cand[label].rank))) m.cand[label] = h;
    }
    settle(m, DEFAULTS.text);
    for (const label of TEXT_PROPS) if (!m.cand[label] && label !== 'Format') m.settings[label] = host.settings[label];
    if (!m.cand.Size && !named(m)) m.settings = besideName(host, m.settings);
    const r = state[m.record], t = look(m.settings), name = once(m.record, 'name', () => N.name(tree(m.record)));
    // `shownBy`, the note that shows it, where one does: what hiding it where it's shown takes back (see Fields).
    return { id: m.record, type: 'text', settings: m.settings, look: t, text: textOf(r, t.Format, name), computed: !!r.computed, shownBy: m.cand.Shown?.note ?? null, ...(named(m) && { name: true }),
      ...(m.listed && { listed: { role: t.Format === 'none' ? '' : textOf(r, 'value', name), name: N.nameOf(state, m.listed) } }) };
  };
  // A box's relations written in it, one text for each role: the role, for more than one in the plural, and
  // who holds it, by surname, each name kept on one line, and the role on one with the first, where they fit one
  // (see apart). They follow the box's own texts, each an entry that `hangs` where it runs on, as a list's do.
  const surname = s => s.trim().split(/\s+/).pop().toLowerCase();
  const gather = items => {
    const mine = items.filter(it => !it.listed), roles = groupBy(items.filter(it => it.listed), it => `${it.listed.role}|${JSON.stringify(it.look)}`);
    const merged = [...roles.values()].sort((a, b) => a[0].listed.role < b[0].listed.role ? -1 : 1).map(its => {
      const names = its.map(it => it.listed.name).sort((a, b) => surname(a) < surname(b) ? -1 : surname(a) > surname(b) ? 1 : 0)
        .map(n => n.trim().replace(/ +/g, '\u00a0')), role = its[0].listed.role;
      return { ...its[0], text: role ? `${(names.length > 1 ? Tree.plural(role) : role).trim().replace(/ +/g, '\u00a0')}:\u00a0${names.join(', ')}` : names.join(', '), records: its.map(it => it.id), listed: undefined,
        hangs: true, computed: its.every(it => it.computed) };
    });
    return [...mine, ...merged];
  };

  const boxes = [], lines = [];
  for (const m of marks.values()) if (drawn(m) && m.type !== 'text') {
    settle(m, DEFAULTS[m.type]);
    (m.type === 'box' ? boxes : lines).push(m);
    m.texts = [];
    m.computed = !!state[m.record].computed;
    m.revealed = reveal.has(m.record) && !shownAlone(m);
    if (changes?.marks.has(m.record)) m.change = changes.marks.get(m.record);
  }
  // Their looks alone (Scene.looks): what the notes give each box and line drawn, before anything is laid out.
  if (opts.looks === true) {
    const ms = [...boxes, ...lines].map(m => ({ id: m.id, type: m.type, record: m.record, settings: m.settings }));
    return { chart, view, day, marks: ms, byId: new Map(ms.map(m => [m.id, m])), styles };
  }
  for (const m of [...marks.values()].filter(m => m.type === 'text' && drawn(m)).sort(byOrder)) {
    const host = container(m);
    if (host?.texts) host.texts.push(textItem(m, host));
  }
  // A blank field (dendra.md, Fields): one a box shows that its record hasn't yet (an EIN not yet typed), where the note
  // that shows it is at a scope, which names a field of the box, not at the entry wherever there is one: at its object,
  // its kind, or beside an output. Its name stands in its place, `blank`, in its order among the box's texts, and in their
  // look; the box keeps its room, which the canvas draws it faint in, to type into, and an export leaves empty. Only an
  // entry the chart has at an object, a value or a choice, which a kind without it yet takes as it's typed; a name is
  // never blank.
  const scoped = N.notes('Shown').filter(n => (!n.view || n.view === view) && !n.param && !n.pattern.out && n.pattern.args?.length === 1
    && !n.pattern.args[0].loc.args && (n.pattern.args[0].loc.kind !== undefined || n.pattern.args[0].loc.id !== undefined));
  const scopes = new Set(scoped);
  const S = scoped.length || fieldsOf.size ? wb.schema(chart) : null, specs = new Map();
  const typed = edge => { const k = Tree.norm(edge);
    if (!specs.has(k)) specs.set(k, Object.values(S).some(s => s.args?.length === 1 && same(s.args[0].edge, edge) && !s.args[0].loc.args && ('field' in s.out || 'choice' in s.out)));
    return specs.get(k); };
  function blanksIn(b) {
    const O = b.record, t = tree(O), fs = fieldsOf.get(b.id), want = new Map();
    for (const n of scoped) if (Tree.narrower(t, n.pattern.args[0].loc)) want.set(Tree.norm(n.pattern.args[0].edge), n.pattern.args[0].edge);
    for (const [k, c] of fs ?? []) if (c.value === true) want.set(k, c.note.param);
    if (!want.size) return;
    const have = new Set((Tree.index(state).entries.get(O) ?? []).map(e => Tree.norm(state[e].edge)));
    for (const [k, edge] of want) {
      if (have.has(k) || k === 'name' || !typed(edge)) continue;
      const et = { args: [{ edge, loc: t }] }, at = N.resolve('Shown', et, view), mine = at && { ...at, rank: rankOf(at.note, 0) }, beside = fs?.get(k);
      const win = !mine ? beside : !beside || !beats(beside.rank, mine.rank) ? mine : beside;
      if (win?.value !== true || !(win.note.param || scopes.has(win.note))) continue;
      const f = N.formats(et, view), given = {};
      for (const label of TEXT_PROPS) given[label] = label !== 'Format' && f[label] ? { value: f[label].value, note: f[label].note } : b.settings[label];
      const settings = besideName(b, given), item = { id: `blank:${O}|${edge}`, type: 'text', settings, look: look(settings), text: edge, blank: { at: O, edge }, computed: false, shownBy: win.note };
      const order = [[N.order(et) ?? Infinity, k]], i = b.texts.findIndex(it => it.listed || ordered(order, orderOf(it.id)) < 0);
      b.texts.splice(i < 0 ? b.texts.length : i, 0, item);
    }
  }
  // Free text (dendra.md, Fields): the Text note that decides for a box or a line, of those its records' patterns fit, as a
  // format lands on it: one more text after its fields, in the look of its own that the note gives and the mark's
  // otherwise; each {Entry} in it read as that entry of the mark's record reads, a form letter's field, or as nothing.
  const freeOf = new Map();
  if (N.notes('Text').some(n => n.view === view)) for (const id of ids) {
    const res = once(id, 'text', () => N.resolve('Text', tree(id), view) ?? null);
    if (res) for (const start of own.get(id) ?? []) {
      const [h, depth] = hostOf(start), r = h && rankOf(res.note, depth), c = h && freeOf.get(h.id);
      if (h && (!c || beats(r, c.rank))) freeOf.set(h.id, { ...res, rank: r });
    }
  }
  const entryText = (at, label) => {
    const k = Tree.norm(label), entries = Tree.index(state).entries;
    for (let todo = [at], i = 0; i < todo.length; i++) for (const e of entries.get(todo[i]) ?? []) { if (Tree.norm(state[e].edge) === k) return textOf(state[e], 'value', state[e].edge); todo.push(e); }
    return '';
  };
  function freeText(h) {
    const c = freeOf.get(h.id), v = c?.value;
    if (!v || typeof v !== 'object') return [];
    const text = String(v.text ?? '').replace(/\{([^{}\n]+)\}/g, (_, l) => entryText(h.record, l)).split('\n').map(s => s.replace(/[ \t]+/g, ' ').trim()).join('\n').trim();
    const given = {};
    for (const label of TEXT_PROPS) given[label] = label !== 'Format' && label in v ? { value: v[label], note: c.note } : h.settings[label];
    const settings = besideName(h, given);
    return text ? [{ id: `text@${h.id}`, type: 'text', settings, look: look(settings), text, free: { note: c.note.note, text: v.text }, computed: false, shownBy: c.note }] : [];
  }
  // A text that says otherwise now than it did on the day compared with has what it said before it, struck, in the look of
  // what's gone (see comparing): on a line, on the same line of its label, so "100% 85%" reads as one; one it no longer has,
  // after the rest.
  const goneLook = changes && N.formats({ out: { choice: 'Gone' }, args: [{ edge: CHANGES, loc: {} }] }, view);
  const saidBefore = (it, text, inline = false) => {
    const settings = { ...it.settings, Strike: { value: true, note: null } };
    for (const label of TEXT_PROPS) if (goneLook[label]) settings[label] = goneLook[label];
    return { ...it, id: `was:${it.id}`, text, settings, look: { ...it.look, ...look(settings) }, was: true, inline, computed: false, records: undefined, shownBy: null, free: undefined, listed: undefined };
  };
  const withWas = (m, texts) => !changes ? texts : [...texts.flatMap(it => changes.was.has(it.id) ? [saidBefore(it, changes.was.get(it.id), m.type === 'line'), it] : [it]), ...(changes.lost.get(m.id) ?? []).map(it => saidBefore(it, it.text))];
  for (const b of boxes) { blanksIn(b); b.texts = withWas(b, [...gather(b.texts), ...freeText(b)]); inkOn(b); }
  // The key is of what the view draws: what's revealed for a while doesn't change it. While nothing is keyed, as on a
  // new chart's page, a Key isn't drawn, and the page is as it would be without it.
  const legendRows = legend(N, view, [...boxes, ...lines].filter(m => !m.revealed));
  // (Its rows of every day, so a row keeps its column as the day shown changes: see layoutLegend.)
  legendRows.ever = keyedEver(N, view, rows);
  // The footer, the chart's, at no view (dendra.md, The page), and its number, a view's place among the chart's views: the
  // sheet's own, as its title is.
  const footing = N.resolve('Footer', { id: view, kind: 'View' })?.value, footLook = footing?.format && { format: footing.format };
  const footRows = !footing ? [] : [...footing.text ? [{ id: FOOTER, shape: FOOTER, geometry: 'text', role: 'footer', text: footing.text, ...footLook }] : [],
    ...footing.number ? [{ id: NUMBER, shape: NUMBER, geometry: 'text', role: 'number', text: String(1 + pagesOf(N, state).indexOf(view)), ...footLook }] : []];
  for (const r of footRows) said.set(r.id, r.text);
  // A free shape's text takes the page's Font and Size too, where its own row doesn't say.
  const pageLook = Object.fromEntries(Object.entries(ofPage).map(([l, r]) => [l, r.value]));
  const onPage = [...shapeRows.filter(r => r.geometry !== 'legend' || legendRows.length), ...footRows].map(r => ofPage.Font || ofPage.Size ? { ...r, format: { ...pageLook, ...r.format } } : r);

  // Lines: each from its Above side, the edge drawn on top (an owner's), to the other; the Above an edge
  // order gives, where no note says. Its label is its own text, then the texts drawn on it; a line revealed
  // has none, as what reveals it names it. A line that says its relation's name says it as the Key does, its
  // row's caption, its own where the Key has one, so one relation is spelled one way on the page.
  const theKey = onPage.find(r => r.geometry === 'legend');
  const captioned = new Map(legendRows.flatMap(r => r.outputs.map(o => [key(o), theKey?.captions?.[r.key] ?? r.caption])));
  // A box of no form (dendra.md, Styles): one no style gives a look, with nothing at the entry a row of the Key goes by, whose
  // look is that row's exactly, would pass as what the row says it is. So it isn't drawn so.
  const hiddenRows = new Set(theKey?.hide ?? []), formless = [];
  for (const b of boxes) if (!b.revealed && KEYED.box.every(k => !b.settings[k].note)) {
    const has = edge => (Tree.index(state).entries.get(b.record) ?? []).some(e => same(state[e].edge, edge));
    const row = legendRows.find(r => !hiddenRows.has(r.key) && r.swatch.kind === 'box' && r.outputs[0].args?.length === 1 && !has(r.outputs[0].args[0].edge)
      && ['Shape', 'Fill', 'Transparency', 'Outline', 'Weight', 'Dash', 'Shadow'].every(k => JSON.stringify(b.settings[k].value) === JSON.stringify(r.swatch[k])));
    if (row) { formless.push({ record: b.record, what: row.name ?? styleName(N, Tree.bare(row.outputs[0])) }); Object.assign(b.settings, FORMLESS); }
  }
  const keyedBy = l => KEYED.line.map(k => l.settings[k].note).find(n => n && captioned.has(key(n.pattern)));
  for (const l of lines) {
    const r = state[l.record], t = tree(l.record), text = lineText(r, l.settings.Format.value, N.name(t)), keyed = isTag(r) && r.tag && text && keyedBy(l);
    [l.from, l.to] = endsOf(l.record, l.ends);
    l.ranks = l.settings.Above.value !== 'none';
    const own = { id: l.record, type: 'text', settings: l.settings, look: { ...look(l.settings), Align: 'left' },
      text: keyed ? captioned.get(key(keyed.pattern)) : text, computed: l.computed };
    l.texts = l.revealed ? [] : withWas(l, [own, ...l.texts, ...freeText(l)].filter(it => it.text));
    for (const it of l.texts) { it.look = { ...it.look, Align: 'left' }; it.lines = linesOf(it, 200); }
    // A line's Position is its label's, where it was dragged to (see Layout.pin).
    const pin = N.resolve('Position', t, view)?.value;
    labelOf(l, l.texts.length === 1 && l.texts[0] === own && !isField(r), Number.isFinite(pin?.along) ? { along: pin.along, dx: pin.dx ?? 0, dy: pin.dy ?? 0 } : undefined);
    // A line's Bend is its route's middle legs, where a hand put them, the page's coordinates.
    const bend = N.resolve('Bend', t, view)?.value?.points;
    if (bend?.length) l.bend = bend;
    // The layout and the routes read the relation a line draws, never its look, so restyling a line moves
    // nothing; lines of one look along one route are drawn as one (see below), which is drawing.
    l.trunk = once(l.record, 'relation', () => `${N.name(t)}|${Tree.shapeOf(t)}`);
    l.alike = ['Outline', 'Weight', 'Dash', 'Arrow', 'Arrowhead'].map(k => JSON.stringify(l.settings[k].value)).join('|');
    l.straight = l.settings.Connector.value === 'straight';
  }
  // What the comparison reads of the view as of another day: its marks and their texts, before anything is laid out.
  if (opts.looks) return { byId: new Map([...boxes, ...lines].map(m => [m.id, m])) };

  // Positions: entered ones win, and those a change pending `holds` (where the boxes it doesn't place stand now,
  // as making it enters them: see the canvas). A loose position, where a box was made on the chart before it was
  // related, gives way to the layout once a line that ranks it joins the box, and it goes beside its relatives; but
  // of loose boxes joined only to each other, the first made stands where it was made. A box is `placed` where its
  // place is entered, firmly, or loosely while nothing relates it; what a change made on the chart keeps where it's
  // drawn is every other box (see the canvas).
  const ranking = new Map();
  for (const l of lines) if (l.ranks) for (const [a, b] of [[l.from, l.to], [l.to, l.from]]) (ranking.get(a) ?? ranking.set(a, new Set()).get(a)).add(b);
  // A place Tidy took away (see the canvas) leaves only where the box stood across, its `order` among what's beside it,
  // and, of boxes tidied around what stands, `around`.
  const tidiedAs = new Map();
  const placeOf = new Map(boxes.map(b => {
    const res = N.resolve('Position', tree(b.record), view), held = opts.holds?.get(b.record), v = res?.value, place = Number.isFinite(v?.x) ? v : null;
    if (!place && Number.isFinite(v?.order)) tidiedAs.set(b.id, v);
    return [b.id, held && (held.over || !place || place.loose) ? { pos: held, at: '' } : place ? { pos: place, at: res.note.note } : null];
  }));
  const givesWay = b => [...ranking.get(b.id) ?? []].some(id => { const p = placeOf.get(id); return !p?.pos.loose || p.at < placeOf.get(b.id).at; });
  // (One that gives way goes beside its relatives on the side it was made on: its place is the layout's `hint`.)
  const positions = new Map(), hints = new Map();
  const sheet = pageOf(N, view, opts.paper), ownSheet = pageOf(N, view), onPaper = !!opts.paper && (sheet.w !== ownSheet.w || sheet.h !== ownSheet.h);
  for (const b of boxes) {
    const p = placeOf.get(b.id);
    b.pos = p && !(p.pos.loose && givesWay(b)) ? p.pos : null;
    b.entered = !!b.pos;
    b.placed = b.stands = !!b.pos && !(b.pos.loose && ranking.has(b.id));
    // (Where a hand put it, not where a change kept it or Tidy laid it: the page never moves or rescales the chart for it; see furnish.)
    b.hand = b.entered && !b.pos.kept && !Number.isFinite(b.pos.order);
    // Put there by a hand since hands were told apart (dragged, typed, aligned), it's `exact`: it stands exactly there and as
    // large as it was made, over another if that's where it was put, and nothing the layout does moves it, or moves anything
    // else for it. (But on another paper, which draws the chart closer.)
    b.exact = !!b.pos?.hand && !onPaper;
    if (b.pos) positions.set(b.id, b.pos);
    else if (p) hints.set(b.id, p.pos);
  }

  // Frames: each style giving a box's record, or a record in it, a Frame adds a step to the box's path,
  // and every beginning of a path is a frame around the boxes whose paths begin so. A relation's Frame
  // frames the box at its lower end, the side not Above. Outputs of one style captioned alike share a
  // frame: Main Fund and Feeder Fund both captioned Funds draw one. They nest in the order of the styles
  // and never overlap. A box revealed for a while is in none, so the frames stay as they are.
  const drawnBoxes = new Map(boxes.map(b => [b.record, b]));
  const steps = new Map();
  for (const id of ids) {
    const res = formats.get(id).Frame, r = state[id];
    if (!res || res.value === 'none' || idsIn(res.note.pattern).size || !res.note.view) continue;
    const ends = !boxOf(id) && r.args?.length === 2 ? r.args.map(a => boxOf(a.at)) : null;
    const b = drawnBoxes.get(ends ? endsOf(id, ends)[1] : boxOf(id));
    if (!b || b.revealed) continue;
    const at = styleAt.get(key(bare(res.note.pattern))) ?? -1, s = steps.get(b.id) ?? steps.set(b.id, new Map()).get(b.id);
    if (!s.has(at)) s.set(at, { at, output: res.note.pattern, note: res.note, kind: res.value, caption: captionOf(N, res.note.pattern, view) });
  }
  const frames = new Map();
  for (const [bid, s] of steps) {
    let parent = null, path = '';
    for (const step of [...s.values()].sort((a, b) => a.at - b.at)) {
      path += `/${step.at}:${step.caption}`;
      const id = `frame:${path}`;
      if (!frames.has(id)) frames.set(id, { id, type: 'frame', parent, kind: step.kind, output: step.output, outputs: [], note: step.note, text: step.caption, members: [], frames: [] });
      const f = frames.get(id);
      if (!f.outputs.some(o => key(o) === key(step.output))) f.outputs.push(step.output);
      if (parent) { const p = frames.get(parent); if (!p.frames.includes(id)) p.frames.push(id); }
      parent = id;
    }
    frames.get(parent).members.push(bid);
  }
  // A frame's caption heads a group of names, so it's set as they are, bold and dark grey, at its top left (a
  // bracket's over its middle). A frame round one box alone would outline it twice: it's `lone`, its caption
  // alone.
  const headed = f => {
    const name = inFrame(frames, f).map(id => drawnBoxes.get(id)?.texts[0]).filter(Boolean).sort((a, b) => b.look.Size - a.look.Size)[0], at = name?.look ?? TEXT;
    const t = { ...TEXT, Font: at.Font, Size: at.Size, Bold: true, Color: '#404040', Align: f.kind === 'bracket' ? 'center' : 'left' };
    f.caption = { id: f.id, type: 'text', look: t, text: f.caption?.text ?? f.text, ...(name?.typedAt && { typedAt: name.typedAt }) };
    f.caption.lines = breakLines(f.caption.text, t, 400);
    f.label = f.caption.lines.length * lineHeight(t);
  };
  for (const f of frames.values()) {
    f.settings = { Frame: { value: f.kind, note: f.note } };
    headed(f);
    delete f.text;
    f.lone = f.kind !== 'bracket' && f.members.length === 1 && !f.frames.length;
  }

  // The layout: entered positions win; ELK places the rest, frames as clusters, ranked by the lines, and a
  // box placed among entered ones keeps clear of the boxes, lines and free shapes already there. Entered places
  // are the chart's own, which the page sets on it (see furnish), so a preview's, kept as drawn, are the page's
  // less its offset. A preview (records revealed, or a restyle) keeps the view as it was last drawn: its boxes,
  // its lines where their boxes stand, its page and its furniture; what it adds goes on the page, around
  // what's drawn.
  const last = preview && !opts.paper ? laidOut.get(drawnAs) ?? null : null;
  // (The place of a box not drawn yet is where it will stand: as far down as the room for the lanes over them has moved what stands at its height.)
  const lowered = y => last.lowered.filter(([at]) => at <= y + 4).reduce((a, b) => b[0] > a[0] ? b : a, [-Infinity, 0])[1];
  if (last) for (const m of [positions, hints]) for (const [id, p] of m) m.set(id, { ...p, x: p.x + last.page.offset.x, y: p.y + last.page.offset.y + (last.at.has(id) || p.hand ? 0 : lowered(p.y)) });
  const placedBy = r => r.x == null || r.y == null;
  // What the page keeps as the view is edited: the scale it's drawn at, and how far it moved the chart to hold it (a
  // change writes them, with the places it keeps, as making it will: see the canvas). So the scale falls only to hold
  // what the layout places, and never grows on its own. On another paper, it's that paper's.
  const held = last || onPaper ? null : opts.holds?.page ?? N.resolve('Scale', { id: view, kind: 'View' })?.value ?? null;
  // Boxes a style fills alike, one row of the Key, are a class: peers the layout sets in one tier where it can.
  // Where the Key has fewer than two such rows, the fill tells nothing apart, and nothing is.
  const rowOf = new Map(legendRows.flatMap(r => r.outputs.map(o => [key(o), r.key])));
  const classOf = new Map(boxes.map(b => { const n = b.settings.Fill.note; return [b.id, n && n.view === view && !idsIn(n.pattern).size && !isChange(n.pattern) ? rowOf.get(key(n.pattern)) ?? null : null]; }));
  if (new Set([...classOf.values()].filter(Boolean)).size < 2) classOf.clear();
  // And triangles, whatever they're filled, as a page's subject may be: a feeder and the fund it invests in are peers.
  for (const b of boxes) if (b.settings.Shape.value === 'triangle') classOf.set(b.id, 'triangle');
  // The room the chart has on its sheet, as the layout fills it: within the margins, under the title and date;
  // and the Key's size there, which the page sets beside the title where it fits there, or else `under` the
  // chart's right end (see furnish).
  const furnished = onPage.filter(r => (r.role === 'title' || r.role === 'date') && placedBy(r)).map(r => freeShape(r, said.get(r.id)));
  const furniture = furnished.reduce((h, m) => h + m.h, 0);
  const room = { w: sheet.w - 2 * MARGIN, h: sheet.h - 2 * MARGIN - (furniture && furniture - INSET - PAD + 32) };
  const keyRow = onPage.find(r => r.geometry === 'legend' && placedBy(r));
  if (keyRow) {
    const k = freeShape(keyRow, '');
    layoutLegend(k, legendRows);
    room.key = { w: k.w, h: k.h, under: k.w > sheet.w - MARGIN - 32 - Math.max(MARGIN, ...furnished.map(m => MARGIN - INSET + (m.column?.x ?? 0) + widest(m.texts))) };
  }
  // Each box's size on its own page, for another paper (see squeezed).
  let pageSizes = null;
  // The room a line's label needs between the two boxes it joins side by side: its width and 3 pt either side, and
  // its arrowhead, where it has one (see Layout's labels).
  const roomFor = new Map(), makeRoom = () => { roomFor.clear();
    for (const l of lines) if (l.label && !l.revealed) for (const k of [`${l.from}|${l.to}`, `${l.to}|${l.from}`]) roomFor.set(k, Math.max(roomFor.get(k) ?? 0, l.label.w + 8 + (l.settings.Arrow.value === 'none' ? 0 : 10.7))); };
  makeRoom();
  const beside = (a, b) => roomFor.get(`${a.id}|${b.id}`) ?? 0;
  // A size a note gives prints as given: in the page's pixels, the note over the scale the chart is laid out for, its
  // lines broken and its box sized at that (see settled). A size no note gives is the page's, and scales with the chart.
  // So that a box prints as wide whatever the scale, and its name breaks the same, and only the gaps print smaller as the
  // scale falls, a box whose name's size is typed is sized by it: nobody having sized it, its width goes as its name's size
  // does, as a size no note gives keeps to the chart's; sized, as wide as it printed at the scale that sized it (`widthsAt`:
  // what the view keeps, or its own page's on another paper, or else what the page first drew it at).
  const typedTexts = [...boxes, ...lines].flatMap(m => m.texts).filter(it => it.settings?.Size?.note && Number.isFinite(it.settings.Size.value));
  let widthsAt = null;
  function typedAt(s) {
    for (const it of typedTexts) { it.look = { ...it.look, Size: it.settings.Size.value / s }; it.typedAt = s; }
    for (const b of boxes) { const name = b.texts[0]; b.wider = name?.typedAt === s ? { free: name.look.Size / TEXT.Size, own: (widthsAt ?? s) / s } : null; }
    for (const l of lines) if (l.texts.some(it => it.typedAt === s)) { for (const it of l.texts) it.lines = linesOf(it, 200); labelOf(l); }
    makeRoom();
    for (const f of frames.values()) headed(f);
  }
  // The boxes a box's lines run to.
  const ends = groupBy(lines.flatMap(l => [[l.from, l.to], [l.to, l.from]]), ([id]) => id), linked = id => (ends.get(id) ?? []).map(([, o]) => o);
  // A layout's faults: routes with no way round what's drawn, or none from and to the sides they'd have, or none but
  // against the router's rules; labels with no free place, as they're drawn on a page at s (see relabel); and names
  // cut, no longer as typed.
  const faults = s => lines.filter(l => l.blocked || l.astray || l.strained).length + relabel(boxes, lines, frames, s).length
    + boxes.filter(b => b.texts.some(it => it.lines.some(l => l.cut))).length;
  // Boxes sized for a layout: each as `size` sets it, `squeeze` and `grow` times its width; and triangles of one width
  // and one size of name widened as the widest of them is, but for one that stands alone (see level).
  function sizes(bs, squeeze, grow) {
    for (const b of bs) size(b, squeeze, null, grow);
    for (const ts of groupBy(bs.filter(b => b.shape === 'triangle' && !b.exact), b => alone(b) ? b.id : `${Math.round(b.base)}|${b.texts[0]?.look.Size}`).values()) {
      const w = Math.max(...ts.map(b => b.w));
      for (const b of ts) if (b.w < w) size(b, squeeze, w, grow);
      level(ts);
    }
    // A box whose one line runs down to a triangle nothing else owns stands over it as wide as it is, a column (see Layout's columns).
    const byId = new Map(bs.map(b => [b.id, b])), ranks = lines.filter(l => l.ranks), main = Layout.mainOf(ranks.map(l => ({ trunk: l.trunk, names: !!l.label?.shared })));
    for (const b of bs) {
      const down = ranks.filter(l => l.from === b.id), t = byId.get(down[0]?.to);
      if (b.shape !== 'triangle' && !b.exact && !b.pos?.w && down.length === 1 && down[0].trunk === main && t?.shape === 'triangle' && ranks.filter(l => l.to === t.id && l.trunk === main && byId.get(l.from)?.shape !== 'triangle').length === 1 && t.w > b.w) size(b, squeeze, t.w, grow);
    }
    return bs;
  }
  // What the layout reads: the boxes, the lines that rank them, and the frames.
  const ranked = bs => ({
    boxes: bs.map(b => ({ id: b.id, w: b.w, h: b.h, shape: b.shape, class: classOf.get(b.id) ?? null, order: tidiedAs.get(b.id)?.order ?? null, around: !!tidiedAs.get(b.id)?.around })),
    links: lines.filter(l => l.ranks).map(l => ({ from: l.from, to: l.to, trunk: l.trunk, names: !!l.label?.shared, room: roomFor.get(`${l.from}|${l.to}`) ?? 0 })),
    clusters: [...frames.values()].map(f => ({ id: f.id, parent: f.parent, members: f.members, top: f.label + 10 })),
  });
  function* lay(squeeze, grow, ceil, whole = false) {
    sizes(boxes, squeeze, grow);
    yield;
    const placed = Layout.arrange({
      keep: last?.at ?? null, ...ranked(boxes),
      lines: lines.map(l => ({ id: l.id, from: l.from, to: l.to, trunk: l.trunk, straight: l.straight })),
      obstacles: obstaclesOf(onPage),
      entered: squeeze === 1 ? positions : squeezed(positions, boxes, squeeze, pageSizes, beside, linked), hints, page: { ...sheet, room }, bounds: last?.page ?? null,
    });
    // A triangle placed that its texts set wider than it was placed keeps its middle where it was, as far as the room on its
    // left allows, so its apex stays under its owners' lines; else, as any other box, it grows rightward, those beside it
    // moving aside (see spread).
    // (Where the layout puts each box, in the terms of a place entered, before anything moves it for the room its lanes and
    // labels need: its `laid` place, which a change keeping it where it's drawn enters, so it's drawn there again.)
    // (A box slid aside to make room in its row is the layout's to place, till a change keeps it there.)
    for (const b of boxes) { Object.assign(b, placed.get(b.id)); b.laid = { ...placed.get(b.id) }; b.placed = b.stands && !(squeeze === 1 && !last && b.pos && Math.abs(b.x - b.pos.x) > 0.01); }
    if (squeeze === 1) for (const b of [...boxes].sort((p, q) => p.x - q.x)) if (b.entered && b.pos.w && b.shape === 'triangle' && b.w > b.pos.w && !last?.at.has(b.id)) {
      const level = a => a !== b && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > Math.min(a.h, b.h) / 2 && a.x + a.w / 2 < b.x + b.pos.w / 2;
      const room = b.x - Math.max(-Infinity, ...boxes.filter(level).map(a => a.x + a.w + 8));
      b.x -= Math.max(0, Math.min((b.w - b.pos.w) / 2, room));
    }
    yield;
    // What's placed on its own page stands where it was put, but for the room labels need beside it; a place the
    // layout gives makes room too for the lines that come down past what stands over their box.
    const given = b => squeeze === 1 && (b.entered || !!last?.at.has(b.id)), stood = b => !!last?.at.has(b.id);
    spread(boxes, beside, stood);
    // Boxes in a rank, their tops level, are one height: the tallest of them (see level). A preview keeps every
    // box as it stood, and what it adds is placed clear of them and sized among themselves, but that it stands where a
    // place entered puts it, as tall as the rank it joins there.
    const added = b => !!last && !last.at.has(b.id);
    // (A height entered is the box's own, and no part of its rank's.)
    for (const rank of groupBy(boxes.filter(b => b.shape !== 'triangle' && !(b.exact && b.pos.h != null)), b => Math.round(b.y / 4)).values()) { level(rank.filter(b => !added(b))); level(rank.filter(added)); level(rank.filter(b => added(b) && b.entered), rank); }
    // (What a session hides takes nothing from what's left, which stands as tall as it stood, though what made it so has gone.)
    if (last && opts.seen?.size) for (const b of boxes) { const was = last.boxes.get(b.id); if (was) level([b], [{ h: was.h, texts: [] }]); }
    push(boxes.filter(b => !added(b)), frames, lines.filter(l => l.ranks));
    // And again where that left a line from side to side short of the room its label needs, as the height it runs at
    // moves with the boxes it joins.
    const byId = new Map(boxes.map(b => [b.id, b])), short = (a, b) => b.x - a.x - a.w < beside(a, b) - gives(a, b) - 0.01;
    const side = (a, b) => Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > Math.min(a.h, b.h) / 2;
    if (lines.some(l => { const p = byId.get(l.from), q = byId.get(l.to); if (!p || !q || !beside(p, q) || !side(p, q)) return false;
      const [a, b] = p.x < q.x ? [p, q] : [q, p]; return !stood(b) && short(a, b); })) spread(boxes, beside, stood);
    // (A line into a frame may land on it, and doesn't come down to its box.)
    const framing = id => [...frames.values()].filter(f => inFrame(frames, f).includes(id)).map(f => f.id).join();
    clearTops(boxes, lines.filter(l => l.ranks && framing(l.from) === framing(l.to)), given);
    frameBounds(frames, boxes);
    // (A place kept where it's beyond the margins was put there, a box moved to make room for one inserted, as a hand puts one:
    // it stays, and the page says so. One the layout has moved beyond them from a place within them holds the page.)
    if (held && !held.fit) for (const b of boxes) if (b.entered && !b.hand) {
      const x = (b.pos.x + (held.x ?? 0)) * ceil, y = (b.pos.y + (held.y ?? 0)) * ceil, w = (b.pos.w ?? b.w) * ceil, h = (b.pos.h ?? b.h) * ceil;
      b.hand = x < MARGIN - 0.5 || y < MARGIN - 0.5 || x + w > sheet.w - MARGIN + 0.5 || y + h > sheet.h - MARGIN + 0.5;
    }
    // (Sizes typed, and the boxes alone too big for the scale they're laid out for: no need to route them to know.)
    if (typedTexts.length && !last && !whole) {
      const B = bounds(held && !held.fit ? boxes.filter(b => !b.hand) : boxes), most = Math.max(0, Math.min((room.w + 1) / Math.max(1, B.w), (room.h + 1) / Math.max(1, B.h)));
      if (most < ceil - 1e-9) return { s: most, ceil, faults: Infinity, bent: Infinity, around: Infinity };
    }
    const stand = !!last || boxes.some(b => b.entered), tops = boxes.map(b => b.y);
    let rs = routes(boxes, lines, frames, stand);
    rs.forEach((r, i) => Object.assign(lines[i], r));
    for (let n = 0; n < 3 && !last && deepen(boxes, lines); n++) {
      yield;
      frameBounds(frames, boxes);
      (rs = routes(boxes, lines, frames, stand)).forEach((r, i) => Object.assign(lines[i], r));
    }
    // A line that goes around what's drawn though its trunk gave it a lane takes none: the routes are found again with it
    // aside, the gaps as they were and deepened only for the lanes then drawn, where no more lines go around for it. So a
    // line added that goes around moves no lane, gap or box it doesn't touch.
    const off = lines.filter(l => l.around && l.placing.laned).map(l => l.id);
    if (off.length) {
      const astray = () => lines.filter(l => l.blocked || l.astray || l.strained).length, was = { ys: boxes.map(b => b.y), rs, around: lines.filter(l => l.around).length, astray: astray() };
      boxes.forEach((b, i) => { b.y = tops[i]; });
      frameBounds(frames, boxes);
      (rs = routes(boxes, lines, frames, stand, off)).forEach((r, i) => Object.assign(lines[i], r));
      for (let n = 0; n < 3 && !last && deepen(boxes, lines); n++) {
        yield;
        frameBounds(frames, boxes);
        (rs = routes(boxes, lines, frames, stand, off)).forEach((r, i) => Object.assign(lines[i], r));
      }
      if (lines.filter(l => l.around).length > was.around || astray() > was.astray) {
        boxes.forEach((b, i) => { b.y = was.ys[i]; });
        frameBounds(frames, boxes);
        was.rs.forEach((r, i) => Object.assign(lines[i], r));
      }
    }
    yield;
    if (last) still(last, boxes, lines, frames);
    const furnished = () => furnish({ sheet, boxes, lines, frames, shapes: onPage, said, legend: legendRows, last, placedBy, placed: positions.size > 0 && !onPaper, keptAt: onPaper || !keyRow ? null : opts.holds?.get(keyRow.shape) ?? keyRow.kept ?? null, ceil, held, own: ownPage });
    let laid = furnished();
    // The Key, wherever it stands, by a hand or the page's where the page has no other room for it: no line runs under it where the router has another way.
    const dropped = !last && laid.shapes.find(m => m.geometry === 'legend');
    if (dropped) {
      const on = laid.places.get(dropped.row) ?? dropped, q = { x: on.x - laid.dx, y: on.y - laid.dy, w: dropped.w, h: dropped.h }, under = l => l.points?.some((p, i) => i && Math.max(p[0], l.points[i - 1][0]) > q.x && Math.min(p[0], l.points[i - 1][0]) < q.x + q.w && Math.max(p[1], l.points[i - 1][1]) > q.y && Math.min(p[1], l.points[i - 1][1]) < q.y + q.h);
      const long = ps => ps.slice(1).reduce((s, p, k) => s + Math.hypot(p[0] - ps[k][0], p[1] - ps[k][1]), 0), runUnder = lines.filter(under);
      // (A way that isn't twice as long, and a little: a Key dropped in the chart's midst leaves its lines be, rather than send them round the page.)
      if (runUnder.length) {
        const again = routes(boxes, lines, frames, stand, off, [q]);
        for (const l of runUnder) { const r = again[lines.indexOf(l)]; if (!r.blocked && r.points && long(r.points) <= long(l.points) * 2 + 80) Object.assign(l, r); }
        laid = furnished();
      }
    }
    return { ...laid, around: lines.filter(l => l.around).length, ceil };
  }
  // The chart laid out for a scale, from `from` down, and the page's scale for it. With no size typed, once. With some,
  // the sizes it's laid out for are those at the scale it's to be drawn at, so one pass where it fits there, as it does
  // at the scale the view keeps; else again at the scale it would be drawn at, as a typed text prints the same and only
  // the gaps print smaller, and so on down, a few passes at most. Where no scale holds them it's the pass that
  // prints them nearest: the text alone is wider than the sheet, and the page says which fall short (`short`). A pass
  // that's already smaller than `floor`, a layout it's to better, goes no further: it won't.
  const scaleAtFirst = last ? last.page.scale : held?.scale ?? 1;
  function* settled(squeeze, grow = 1, from = scaleAtFirst, floor = 0) {
    if (!typedTexts.length) return yield* lay(squeeze, grow, from);
    widthsAt ??= last?.page.scale ?? held?.scale ?? ownPage?.scale ?? null;
    let s = from, near = null;
    for (let n = 0; n < 8; n++) {
      typedAt(s);
      const laid = yield* lay(squeeze, grow, s);
      widthsAt ??= laid.s;
      if (laid.s >= s - 1e-9 || laid.s < floor - 1e-9) return laid;
      // (Nearer by enough to draw the chart smaller for it.)
      if (!near || laid.s / s > near.k * 1.05) near = { k: laid.s / s, s };
      s = SCALES.find(x => x <= laid.s + 1e-9);
      if (s === undefined || s < LEAST) break;
    }
    typedAt(near.s);
    return yield* lay(squeeze, grow, near.s, true);
  }
  // (A layout chosen that was only a pass, its sizes not yet those of the scale it's drawn at.)
  const unsettled = laid => typedTexts.length > 0 && laid.s < laid.ceil - 1e-9;
  // A layout just laid, with its faults, and on another paper its lines bent that drop straight on the view's own page
  // (`straight`); and a layout laid again, as it was judged.
  let straight = null, largest = Infinity;
  const bent = () => straight ? lines.filter(l => straight.has(l.id) && l.points?.length > 2).length : 0;
  // A layout is judged once there's another to judge it against, while it's still the one laid; one alone needn't be.
  const judged = laid => laid.faults !== undefined ? laid : { ...laid, faults: faults(laid.s), bent: bent() }, again = (laid, as) => ({ ...laid, faults: as.faults, bent: as.bent });
  // Of two layouts, the better: the one with fewer faults, then the larger, up to the size its own page prints it at on
  // another paper (`largest`), then the one with fewer lines bent, then the one with fewer lines gone around what's drawn.
  // (A stem kept straight is worth a twentieth or two: of two as near in size, on another paper, the one that keeps its columns.)
  const better = (a, b) => { const [p, q] = [a.s, b.s].map(s => Math.min(s, largest));
    if (a.faults !== b.faults) return a.faults < b.faults;
    if (a.bent !== b.bent && Math.abs(p - q) < 0.11) return a.bent < b.bent;
    return p !== q ? p > q : a.bent !== b.bent ? a.bent < b.bent : a.around < b.around; };
  yield;
  // (A free shape on another paper stands as it stands on the view's own page: see furnish.)
  const ownScene = onPaper ? yield* drawing(wb, chart, view, day, { ...opts, paper: null }) : null, ownPage = ownScene?.page ?? null;
  const rough = g => Math.min(1, Layout.fit({ ...ranked(sizes(boxes.map(b => ({ ...b, texts: b.texts.map(it => ({ ...it })) })), 1, g)), room }));
  // (Typed sizes are laid out for where the chart will be drawn, as near as can be said at first: as the page keeps it; or
  // on a paper smaller than its own page, as its own page draws it; so a pass or two, not many.)
  const begin = onPaper && (sheet.w < ownSheet.w || sheet.h < ownSheet.h) ? ownPage.scale : scaleAtFirst;
  let at = yield* settled(1, 1, begin), grow = 1;
  // Boxes nobody sized are as wide as draws the chart largest, of their own width and a sixth and a third more:
  // where the chart is tall for its page, its names then take fewer lines. A width is laid out only where its rows
  // are drawn larger, roughly (see Layout.fit), than at every width before it; and of those laid out, the best.
  if (!last && boxes.some(b => !b.pos?.w)) {
    let tried = 1, most = rough(1);
    for (const g of [7 / 6, 4 / 3]) {
      const r = rough(g);
      if (r <= most) continue;
      most = r;
      at = judged(at);
      const next = judged(yield* settled(1, tried = g, begin, at.s));
      if (better(next, at)) [at, grow] = [next, g];
    }
    if (tried !== grow || unsettled(at)) at = again(yield* settled(1, grow, unsettled(at) ? at.s : at.ceil), at);
  }
  pageSizes = new Map(boxes.map(b => [b.id, { w: b.w, h: b.h }]));
  let fit = 1;
  // On another paper the page places the chart; on one narrower than its page, it's drawn narrower, its boxes
  // and their places closer, as far as that prints it larger, up to the size its own page prints it at, and
  // never so close that a line can't pass or a label has no place; and of those as large, the one with the fewest
  // lines bent that drop straight on its own page.
  if (onPaper && boxes.length) {
    largest = ownPage.scale;
    straight = new Set(ownScene.marks.filter(m => m.type === 'line' && m.points?.length === 2).map(m => m.id));
    at = { ...judged(at), bent: bent() };
    let best = 1, tried = 1;
    for (const f of [0.95, 0.9, 0.85, 0.8, 0.75, 0.7]) {
      if (at.s >= largest && !at.faults && !at.bent) break;
      const next = judged(yield* settled(tried = f, grow, Math.max(at.s, largest), at.s));
      if (better(next, at)) [at, best] = [next, f];
    }
    if (tried !== best || unsettled(at)) at = again(yield* settled(best, grow, unsettled(at) ? at.s : at.ceil), at);
    fit = best;
  }
  // A chart the layout alone places uses the width its scale leaves it, every gap in it alike (see Layout's columns), and a
  // little of the height, where that draws it no smaller and with no more faults, the height first to go. (One too large for
  // columns is as it's placed.)
  if (!last && !positions.size && boxes.length > 1 && !frames.size && boxes.length + lines.length <= Layout.BIG) {
    const wide = Math.max(...boxes.map(b => b.x + b.w)) - Math.min(...boxes.map(b => b.x)), want = (room.w - 2) / at.s;
    const tall = Math.max(...boxes.map(b => b.y + b.h)) - Math.min(...boxes.map(b => b.y)), rows = new Set(boxes.map(b => Math.round(b.y))).size;
    const spread = rows < 2 ? 0 : Math.min(SPREAD, Math.max(0, ((room.h - (room.key?.under ? room.key.h + 32 : 0) - 2) / at.s - tall) / (rows - 1)));
    const tried = [...spread > 2 ? [{ fill: want, spread }] : [], ...wide < want - 8 ? [{ fill: want, spread: 0 }] : []];
    if (tried.length) {
      at = judged(at);
      let taken = null;
      for (const t of tried) {
        Object.assign(room, t);
        const next = judged(yield* settled(fit, grow, at.ceil));
        if (next.s >= at.s - 1e-9 && next.faults <= at.faults) { taken = next; break; }
      }
      if (taken) at = taken;
      else { delete room.fill; delete room.spread; at = again(yield* settled(fit, grow, at.ceil), at); }
    }
  }
  const s = at.s;
  // The chart sits on its page where the page puts it, by its `offset`, which a place written from the page
  // takes away again: none, for a chart `placed` where it stands on the page, but as far as the page moves it to
  // hold it (see furnish).
  if (at.dx || at.dy) for (const m of [...boxes, ...frames.values(), ...lines]) move(m, at.dx, at.dy);
  const offset = last ? last.page.offset : { x: at.dx, y: at.dy }, placed = last ? last.page.placed : !!at.placed;
  const page = { size: sheet.size, w: sheet.w / s, h: sheet.h / s, scale: s, margin: MARGIN / s, offset, placed, sheet: { w: sheet.w, h: sheet.h }, short: [], look: pageLook, formless, ...(onPaper && { paper: true }), ...(sheet.portrait && { portrait: true }) };

  // Arrow Auto: an arrowhead where the line doesn't run down from its Above side.
  for (const l of lines) if (l.settings.Arrow.value === 'auto') l.settings.Arrow = { value: l.down ? 'none' : 'end', note: l.settings.Arrow.note };
  // Lines landing on one frame along one route are drawn once: the first stands for the rest, which stay
  // known by id, `merged` into it.
  for (const ls of groupBy(lines.filter(l => l.landed), l => `${l.alike}|${JSON.stringify(l.points)}`).values()) for (const l of ls.slice(1)) l.merged = ls[0].id;
  jumps(lines, 4 / s);

  // A weight is the sheet's, as PowerPoint keeps a line's weight when a group is resized: each is drawn at its
  // points on the slide, a frame's at 0.75, however much smaller the chart is drawn.
  for (const m of [...boxes, ...lines]) m.settings.Weight = { ...m.settings.Weight, value: m.settings.Weight.value / s };
  for (const f of frames.values()) f.settings.Weight = { value: DEFAULTS.box.Weight / s, note: null };
  // Every text at the sheet's half point nearest its size, placed again where it was; a line's label at the one at or
  // under its size, so it takes no more room than the layout made for it. A size typed stands as typed; but where
  // the chart can't hold it at any scale, at the half point at or under it, and the page says so.
  for (const b of boxes) { b.texts.forEach(it => snap(it, s, it.typedAt !== undefined)); setText(b); }
  for (const l of lines) { l.texts.forEach(it => snap(it, s, true)); labelOf(l); }
  for (const [k, its] of groupBy(typedTexts.filter(it => it.typedAt !== s && !it.blank && it.lines?.length), it => `${state[it.id]?.edge ?? ''}|${it.settings.Size.value}`)) {
    const at = Math.min(...its.map(it => it.look.Size * s)), edge = k.split('|')[0];
    if (at < its[0].settings.Size.value - 0.01) page.short.push({ what: Tree.plural(edge || 'Label'), typed: its[0].settings.Size.value, printed: at });
  }
  for (const f of frames.values()) { snap(f.caption, s); f.label = f.caption.lines.length * lineHeight(f.caption.look); caption(f); }
  if (!last) relabel(boxes, lines, frames, null, s);

  // Free shapes: the view's own, each with its own formats; the furniture where the page puts it, and those
  // placed by hand where they were put on the page, as a PowerPoint shape is: one that would fall off the page is
  // brought back onto it, and nothing else moves one.
  const geo = new Map(boxes.map(b => [b.id, b]));
  const shapes = at.shapes;
  for (const m of shapes) {
    const p = at.places.get(m.row);
    if (p) { Object.assign(m, { x: p.x, y: p.y, byPage: true }); continue; }
    if (m.geometry === 'group') continue;
    const dx = Math.min(0, page.w - m.x - m.w) || Math.max(0, -m.x), dy = Math.min(0, page.h - m.y - m.h) || Math.max(0, -m.y);
    if (dx || dy) move(m, Math.max(-m.x, dx), Math.max(-m.y, dy));
  }
  // A free line glued to a box leaves it where it faces the line's other end, and follows it.
  for (const m of shapes) if (m.geometry === 'line' && m.ends) {
    const ps = m.points, [a, b] = m.ends.map(id => geo.get(id) ?? shapes.find(x => x.id === id));
    if (a) ps[0] = edgePoint(a, ps[ps.length - 1]);
    if (b) ps[ps.length - 1] = edgePoint(b, ps[0]);
    Object.assign(m, bounds(ps.map(([x, y]) => ({ x, y, w: 0, h: 0 }))));
  }
  const byId = new Map();
  // Each mark by its id, and each text by its record's, or by each of the relations one written in a box
  // names.
  for (const m of [...boxes, ...lines, ...frames.values(), ...shapes]) {
    byId.set(m.id, m);
    for (const it of m.texts ?? []) for (const id of it.records ?? [it.id]) if (!byId.has(id)) byId.set(id, it);
  }
  for (const g of shapes.filter(m => m.geometry === 'group')) Object.assign(g, bounds(g.members.map(id => byId.get(id)).filter(Boolean)));

  const laid = !preview && !opts.paper ? {
    at: new Map(boxes.map(b => [b.id, { x: b.x, y: b.y }])), boxes: new Map(boxes.map(b => [b.id, { x: b.x, y: b.y, w: b.w, h: b.h }])), lowered: boxes.filter(b => b.laid).map(b => [b.laid.y, b.y - page.offset.y - b.laid.y]),
    frames: new Map([...frames.values()].map(f => [f.id, { x: f.x, y: f.y, w: f.w, h: f.h }])),
    routes: new Map(lines.map(l => [l.id, { from: l.from, to: l.to, points: l.points, labelAt: l.labelAt, down: l.down, landed: l.landed }])),
    page, places: at.places, key: (m => m && { x: m.x, y: m.y, w: m.w, h: m.h })(shapes.find(m => m.geometry === 'legend')),
  } : null;
  if (laid && !opts.ahead) laidOut.set(drawnAs, laid);

  // One order over everything drawn: by Layer, and within a layer frames under lines under boxes under free shapes.
  const layer = m => m.settings?.Layer?.value ?? m.look?.Layer ?? 0;
  // (What's gone under what's still there, and what's new or changed over it, where they share a run.)
  const changeRank = l => l.change === 'Gone' ? 0 : l.change ? 2 : 1;
  const marksInOrder = [
    ...[...frames.values()].sort((a, b) => depthOf(frames, a) - depthOf(frames, b)),
    ...lines.filter(l => !l.merged).sort((a, b) => changeRank(a) - changeRank(b)),
    ...boxes,
    ...shapes,
  ].sort((a, b) => layer(a) - layer(b));
  // A label said once for several lines, a trunk's or a frame's, is said for them all: the line that carries it keeps
  // their ids, its `kin`.
  for (const ls of groupBy(lines.filter(l => l.placing?.kin != null), l => l.placing.kin).values()) for (const l of ls) if (ls.length > 1 && l.labelAt) l.kin = ls.map(o => o.id);
  for (const m of [...marksInOrder, ...lines]) { delete m.cand; delete m.pos; delete m.base; delete m.placing; delete m.alike; delete m.stands; if (m.type !== 'shape') delete m.ends; }
  const scene = { chart, view, day, page, marks: marksInOrder, byId, styles, legend: legendRows, state, ms: now() - started, ...(changes && { since: changes.since }) };
  if (!preview) drawnFrom.set(whence, [{ from, scene, laid }, ...drawnFrom.get(whence) ?? []].slice(0, 3));
  return scene;
}
// A free shape from a row not yet kept, as a scene would draw it: how big a new one will be.
function shapeOf(row, scene) {
  const s = scene.page.scale ?? 1, k = row.geometry === 'legend' && row.format?.Size == null && scene.page.look?.Size == null ? keyAt(scene.marks.filter(m => m.type === 'box'), s) : 1;
  const m = freeShape({ shape: '·new', ...row, format: { ...scene.page.look, ...row.format } }, row.text ?? '', 1 / s, k);
  if (m.geometry === 'legend') layoutLegend(m, scene.legend, 1 / s, k);
  return m;
}

// Boxes that go together share a height, the tallest of them; but a box whose text had to be hyphenated, or
// whose name runs past six lines, doesn't set it, and stands taller alone rather than stretch the rest. A
// triangle set taller than its own text needs is set again for the height it has (see pyramid), in the fewest
// lines.
const alone = b => b.texts.some(it => it.lines.some(l => l.cut)) || b.texts[0]?.lines.length > 6;
function level(ms, among = ms) {
  const h = Math.max(0, ...among.filter(b => !alone(b)).map(b => b.h));
  for (const b of ms) {
    if (b.h >= h) continue;
    b.h = h;
    if (b.shape !== 'triangle') continue;
    const lines = shaped(b.texts, b.w, h);
    if (lines) { b.texts.forEach((it, i) => { it.lines = lines[i]; }); b.column = columnOf(b); }
  }
}
// Where a box has grown wider over one beside it, that one moves aside, 16 pt clear, and each beyond it as far as
// that makes it; and one moves aside as far as the `room` a line joining it to the box beside it needs for its
// label, less what a triangle's or an oval's side gives where the line meets it (see Layout's sideY), though it
// was placed by hand, as the lanes over a box make room for theirs (see deepen); but not one a preview keeps
// where it `stood`. Boxes keep their order from left to right. Boxes are beside each other where more than half
// the shorter's height is level with the other; one lower than that is under it (see push).
const gives = (a, b) => { const y = Layout.sideY(a, b); return a.x + a.w - Layout.sideX(a, y, true) + Layout.sideX(b, y, false) - b.x; };
function spread(boxes, room = () => 0, stood = () => false) {
  // Only the boxes placed before it that are beside it can push it: found among those in the bands of height it's in,
  // in the order they were placed, as nothing here moves a box up or down.
  const BAND = 64, bands = new Map(), placed = new Map(), beside = (a, b) => Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > Math.min(a.h, b.h) / 2;
  const bandsOf = b => { const ks = []; for (let k = Math.floor(b.y / BAND); k <= Math.floor((b.y + b.h) / BAND); k++) ks.push(k); return ks; };
  for (const b of [...boxes].sort((a, c) => a.x - c.x || a.y - c.y)) {
    // (What a hand put somewhere neither moves nor moves what it was put over.)
    const done = [...new Set(bandsOf(b).flatMap(k => bands.get(k) ?? []))].filter(a => beside(a, b) && !a.exact).sort((a, c) => placed.get(a) - placed.get(c));
    for (let moved = !b.exact; moved;) {
      moved = false;
      for (const a of done) {
        const need = stood(b) || !room(a, b) ? 0 : room(a, b) - gives(a, b);
        if (b.x < a.x + a.w || b.x < a.x + a.w + need - 0.01) { b.x = a.x + a.w + Math.max(21, need); moved = true; }
      }
    }
    placed.set(b, placed.size);
    for (const k of bandsOf(b)) (bands.get(k) ?? bands.set(k, []).get(k)).push(b);
  }
}
// Where a box has grown into the rank below it, the rank moves down as far as it must, and each rank under it
// as far as that makes it: ranks stay level, 12 pt under the tallest box over them, or 30 pt where a line runs
// down to the one under with no frame between, from the one over or past it, so that it turns down clear of the
// box over (see Layout's SHADE); with room for the frames between, and a rank that's clear
// stays where it is. A triangle under a box is its middle half; a box a line runs down to from one that isn't
// beside it (see spread) is under it, wherever it is across.
function push(boxes, frames, links = []) {
  const chain = new Map();
  for (const f of frames.values()) for (const id of f.members) { const c = []; for (let g = f; g; g = g.parent && frames.get(g.parent)) c.push(g); chain.set(id, c); }
  const below = f => f.kind === 'bracket' || f.lone ? 0 : 10, above = f => f.kind === 'bracket' ? f.label + 12 : f.lone ? f.label + 5.3 : f.label + 10;
  const joined = new Set(links.map(l => `${l.from}>${l.to}`)), ups = groupBy(links, l => l.to);
  // What's over a box: the boxes in the ranks above that stand across from it, found by the columns they're in,
  // and those that rank it.
  const COL = 96, columns = new Map(), over = new Map(), cols = (a, b) => Array.from({ length: Math.floor(b / COL) - Math.floor(a / COL) + 1 }, (_, i) => Math.floor(a / COL) + i);
  for (const rank of [...groupBy(boxes, b => Math.round(b.y / 4)).values()].sort((a, b) => a[0].y - b[0].y)) {
    let d = 0;
    // (What a hand put somewhere is neither moved nor moves another.)
    for (const c of rank) {
      if (c.exact) continue;
      const fc = chain.get(c.id) ?? [], [x0, x1] = c.shape === 'triangle' ? [c.x + c.w / 4, c.x + c.w * 3 / 4] : [c.x, c.x + c.w];
      const near = new Set(cols(x0, x1).flatMap(k => columns.get(k) ?? []));
      for (const l of ups.get(c.id) ?? []) if (over.has(l.from)) near.add(over.get(l.from));
      for (const b of near) {
        if (b.exact) continue;
        const down = joined.has(`${b.id}>${c.id}`) && Math.min(b.y + b.h, c.y + c.h) - Math.max(b.y, c.y) <= Math.min(b.h, c.h) / 2;
        if ((x0 >= b.x + b.w || b.x >= x1) && !down) continue;
        const fb = chain.get(b.id) ?? [];
        const room = fb.filter(f => !fc.includes(f)).reduce((sum, f) => sum + below(f), 0) + fc.filter(f => !fb.includes(f)).reduce((sum, f) => sum + above(f), 0);
        d = Math.max(d, b.y + b.h + room + (!room && ups.has(c.id) ? 40 : 16) - c.y);
      }
    }
    if (d > 0.5) for (const c of rank) if (!c.exact) c.y += d;
    for (const b of rank) { over.set(b.id, b); for (const k of cols(b.x, b.x + b.w)) (columns.get(k) ?? columns.set(k, []).get(k)).push(b); }
  }
}
// Where lines come down to a box past another standing over it, a box whose place isn't `given` moves aside,
// toward where they come from, until the stretch of its top clear of what stands over it is as wide as their
// arrivals need: between each and the next, its label's width and 15 pt (see Layout's arrivals), and 9 pt short
// of its far side; where that puts it over no other box. A triangle's lines meet at its apex, and it stays.
function clearTops(boxes, links, given) {
  const by = new Map(boxes.map(b => [b.id, b])), mid = g => g.x + g.w / 2, into = groupBy(links, l => l.to);
  for (const c of boxes) {
    if (given(c) || c.shape === 'triangle' || !into.has(c.id)) continue;
    const ins = into.get(c.id).filter(l => by.has(l.from) && by.get(l.from).y + by.get(l.from).h <= c.y);
    if (!ins.length) continue;
    const top = Math.max(...ins.map(l => by.get(l.from).y + by.get(l.from).h)) + 8, own = new Set([c.id, ...ins.map(l => l.from)]);
    const over = boxes.filter(g => g.y < c.y && g.y + g.h > top && g.x < c.x + c.w && g.x + g.w > c.x && !own.has(g.id));
    if (!over.length) continue;
    const need = ins.slice(1).reduce((n, l) => n + (l.label ? l.label.w + 20 : 14), 12), left = Math.min(...over.map(g => g.x)) - 8, right = Math.max(...over.map(g => g.x + g.w)) + 8;
    if (Math.max(left - c.x, c.x + c.w - right) >= need) continue;
    const x = ins.reduce((n, l) => n + mid(by.get(l.from)), 0) / ins.length > (left + right) / 2 ? right + need - c.w : left - need;
    if (!boxes.some(g => g !== c && g.y < c.y + c.h + 16 && g.y + g.h + 16 > c.y && g.x < x + c.w + 21 && g.x + g.w + 21 > x)) c.x = x;
  }
}
// Entered places on a paper narrower than their page: each box's middle `f` times as far from the chart's left as
// on its page (`was`, each box's size there), as wide as it's sized now, and moved aside as spread moves it. A box
// whose one line runs to a box over or under it that it stood straight over or under on its page (`linked`, the boxes
// a box's lines run to) stands so again, as one standing so over or under that in turn does, where the boxes beside it
// leave it the room within the chart's width, those moving aside as far as that needs: so a line that dropped straight
// drops straight where the paper allows. A rank whose names wrap more grows up into the space over it, down to 40 pt
// from the rank above, and the rest of what it grew moves every rank under it down, so that the space between ranks
// stays as it was where it's no more than that.
function squeezed(positions, boxes, f, was, room = () => 0, linked = () => []) {
  const by = new Map(boxes.map(b => [b.id, b])), placed = [...positions].filter(([id]) => by.has(id));
  const ranks = groupBy(placed, ([, p]) => Math.round(p.y / 4)), then = id => was.get(id) ?? by.get(id);
  let shift = 0, floor = -Infinity;
  const at = new Map([...ranks.keys()].sort((a, b) => a - b).map(r => {
    const ids = ranks.get(r).map(([id]) => id), top = Math.min(...ranks.get(r).map(([, p]) => p.y));
    const now = Math.max(...ids.map(id => by.get(id).h)), grew = Math.max(0, now - Math.max(...ids.map(id => then(id).h)));
    const up = Math.min(grew, Math.max(0, top + shift - floor - 53)), moved = shift - up;
    shift += grew - up;
    floor = top + moved + now;
    return [r, moved];
  }));
  const x0 = Math.min(...placed.map(([, p]) => p.x)), mid = (id, p) => p.x + (p.w ?? then(id).w) / 2;
  const gs = placed.map(([id, p]) => { const b = by.get(id); return { id, x: x0 + (mid(id, p) - x0) * f - b.w / 2, y: p.y + at.get(Math.round(p.y / 4)), w: b.w, h: b.h, shape: b.shape }; });
  spread(gs, room);
  const g = new Map(gs.map(b => [b.id, b])), c = b => b.x + b.w / 2, level = (a, b) => Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > Math.min(a.h, b.h) / 2;
  // Each box's lead, the one its one line runs to, where it stood straight over or under it; and where each would
  // stand: as it stood to its lead's lead, and so on, or where it is.
  const page = new Map(placed), off = (a, b) => mid(a, page.get(a)) - mid(b, page.get(b)), lead = new Map(gs.map(b => {
    const [o, ...more] = linked(b.id).map(id => g.get(id));
    return [b.id, o && !more.length && !level(b, o) && Math.abs(off(b.id, o.id)) <= Math.min(then(b.id).w, then(o.id).w) / 2 ? o.id : null];
  }));
  const root = (id, seen = new Set()) => lead.get(id) && !seen.has(id) ? root(lead.get(id), seen.add(id)) : id;
  const want = new Map(gs.map(b => { const r = root(b.id); return [b.id, c(g.get(r)) + off(b.id, r) * f]; }));
  if (gs.every(b => Math.abs(want.get(b.id) - c(b)) < 0.5)) return new Map([...positions].map(([id, p]) => [id, { ...p, ...g.has(id) && { x: g.get(id).x, y: g.get(id).y } }]));
  // Left to right as they stand, each where it would stand, or as far right of what's beside it on its left as they need,
  // 16 pt apart, or as near as they stand, or as far as the line joining them needs; then right to left, as far left as
  // what's beside it on its right needs, and the chart's right end.
  const order = [...gs].sort((a, b) => c(a) - c(b)), at0 = new Map(gs.map(b => [b.id, c(b)]));
  const need = (a, b) => (a.w + b.w) / 2 + Math.max(Math.min(21, Math.max(0, at0.get(b.id) - at0.get(a.id) - (a.w + b.w) / 2)), room(a, b) ? room(a, b) - gives(a, b) : 0);
  const left = Math.min(...gs.map(b => b.x)), right = Math.max(...gs.map(b => b.x + b.w)), to = new Map();
  order.forEach((b, i) => to.set(b.id, Math.max(want.get(b.id), left + b.w / 2, ...order.slice(0, i).filter(a => level(a, b)).map(a => to.get(a.id) + need(a, b)))));
  for (let i = order.length - 1; i >= 0; i--) { const b = order[i]; to.set(b.id, Math.min(to.get(b.id), right - b.w / 2, ...order.slice(i + 1).filter(a => level(a, b)).map(a => to.get(a.id) - need(b, a)))); }
  return new Map([...positions].map(([id, p]) => [id, { ...p, ...g.has(id) && { x: to.get(id) - g.get(id).w / 2, y: g.get(id).y } }]));
}
// A mark moved by (dx, dy), with everything placed in it.
function move(m, dx, dy) {
  if (m.points) m.points = m.points.map(([x, y]) => [x + dx, y + dy]);
  if (m.labelAt) m.labelAt = { x: m.labelAt.x + dx, y: m.labelAt.y + dy };
  const lane = m.placing?.lane;
  if (lane) m.placing.lane = { y: lane.y + dy, x0: lane.x0 + dx, x1: lane.x1 + dx, from: lane.from + dx };
  if (m.type !== 'line') Object.assign(m, { x: m.x + dx, y: m.y + dy });
}

// A box's texts placed in it, once its height is known: at a triangle's base, 7 pt up; at anything else's top,
// middle or bottom, as its Valign says, in from its text rect by PowerPoint's 0.1 in. Its `column` is where its
// lines are set: the width they were broken to (a triangle's, its pyramid's), set in as PowerPoint sets in its
// text rect (see TEXT_RECT).
function setText(b) {
  const tb = blockHeight(b.texts), r = textRect(b.shape, b.w, b.h, b.settings?.Corner?.value), width = Math.max(32, b.w * (TEXT_AREA[b.shape] ?? 1) - 2 * INSET) - 2 * r.x;
  if (b.shape !== 'triangle') b.column = { x: (b.w - width) / 2 + (r.shift ?? 0), width };
  let y = b.shape === 'triangle' ? b.h - BASE - tb : valigned(b.settings?.Valign?.value, r.top, b.h - r.bottom, tb, INSET);
  for (const it of b.texts) y = stack(it, b.column.x, b.column.width, y);
}
// A line's label: its texts stacked from its top left, as wide as the widest line. It's `shared` where it's
// the line's own name alone, which a trunk's lines can say once; `pin`ned where it was dragged to a place of its own
// (see Layout.pin).
function labelOf(l, shared = l.label?.shared ?? false, pin = l.label?.pin) {
  let y = 0, x = 0;
  // (What a text said before it, struck, stands on its line, as "100% 85%" reads.)
  for (const it of l.texts) {
    const under = stack(it, x, 0, y);
    if (it.inline) x = it.lines[0].w + measure(' ', it.look);
    else { y = under; x = 0; }
  }
  const lastLine = l.texts.at(-1)?.lines.at(-1);
  l.label = l.texts.length ? { w: l.texts.some(it => it.inline) ? Math.max(...l.texts.flatMap(it => it.lines.map(q => q.x + q.w))) : widest(l.texts), h: y, base: lastLine?.y ?? y, text: l.texts.map(it => it.text).join('\n'), shared, ...(pin && { pin }) } : null;
}

// The middle of the side of a box that faces a point.
function edgePoint(g, [x, y]) {
  const cx = g.x + g.w / 2, cy = g.y + g.h / 2, dx = x - cx, dy = y - cy;
  return Math.abs(dx) * g.h > Math.abs(dy) * g.w ? [dx > 0 ? g.x + g.w : g.x, cy] : [cx, dy > 0 ? g.y + g.h : g.y];
}
const depthOf = (frames, f) => f.parent ? 1 + depthOf(frames, frames.get(f.parent)) : 0;
// The boxes in a frame, at any depth.
const inFrame = (frames, f) => [...f.members, ...f.frames.flatMap(id => inFrame(frames, frames.get(id)))];
function bounds(ms) {
  if (!ms.length) return { x: 0, y: 0, w: 0, h: 0 };
  const x = Math.min(...ms.map(m => m.x)), y = Math.min(...ms.map(m => m.y));
  return { x, y, w: Math.max(...ms.map(m => m.x + m.w)) - x, h: Math.max(...ms.map(m => m.y + m.h)) - y };
}

// A line's own text: a tag relation's name, or an option or value, or its name: option with Label.
function lineText(r, format, name) {
  if (format === 'none') return '';
  if (isTag(r)) return r.tag ? name : `Not ${name}`;
  const v = isField(r) ? Tree.format(r.field, r.value) : r.choice;
  return format === 'label' ? `${name}: ${v}` : v;
}

// The lines and frames again for boxes moved by a gesture under way, before the move is written: what the
// canvas draws while a drag goes on. The scene itself is left as it was.
function reflow(scene, rects) {
  const boxes = scene.marks.filter(m => m.type === 'box').map(b => ({ ...b, ...rects.get(b.id) }));
  // Every line, those merged into another too, so they land on their frames as before.
  const lines = [...scene.byId.values()].filter(m => m.type === 'line');
  const frames = new Map(scene.marks.filter(m => m.type === 'frame')
    .map(f => [f.id, { ...f, caption: { ...f.caption, lines: f.caption.lines.map(l => ({ ...l })) } }]));
  frameBounds(frames, boxes);
  const routed = routes(boxes, lines, frames).map((r, i) => ({ id: lines[i].id, ...r }));
  return { lines: routed, frames: [...frames.values()] };
}
// The routes of lines between boxes: each line's points, its label's place, and whether it runs down from
// its Above side; whether it had to go `around` what's drawn, or found no way (`blocked`), and whether its label
// found no free place (`crowded`); and what its label is placed by again (see relabel). The router's working
// is left behind. Lines may land on frames (Layout.route says when), and keep clear of frames' captions. Where
// boxes `stand` where they were put, no gap deepens for a lane to keep out of a box's shade.
function routes(boxes, lines, frames = new Map(), stand = true, aside = [], under = []) {
  const copies = lines.map(l => ({ id: l.id, from: l.from, to: l.to, trunk: l.trunk, straight: l.straight, bend: l.bend, label: l.label, arrow: l.settings?.Arrow?.value }));
  const fs = [...frames.values()].map(f => ({ id: f.id, x: f.x, y: f.y, w: f.w, h: f.h, members: inFrame(frames, f), depth: depthOf(frames, f) }));
  Layout.route(new Map(boxes.map(b => [b.id, b])), copies, { frames: fs, avoid: [...captions(frames), ...under], stand, aside });
  return copies.map(c => ({ points: c.points, labelAt: c.labelAt, down: c.down, landed: c.landed, around: c.around, astray: c.astray, strained: c.strained, blocked: c.blocked, crowded: c.crowded,
    placing: { quiet: c.quiet, lane: c.lane, apex: c.apex, crowd: c.crowd, kin: c.kin, lack: c.lack, laned: c.laned, size: c.label && { w: c.label.w, h: c.label.h } } }));
}
// Where the lanes in a gap between ranks need more room than the gap leaves them (Layout.route's `lack`: a lane
// each, and under the lowest the room their labels take), the boxes from the gap's bottom down move down as far
// as that needs: each gap once, from the top, less what deepening one over it has given it. So a label always
// has a place on its own line, as the layout promises. → whether anything moved.
function deepen(boxes, lines) {
  // (In a chart with a box a hand put somewhere, the lines take what room they're given: no box moves for them.)
  if (boxes.some(b => b.exact)) return false;
  const gaps = [...new Map(lines.map(l => l.placing.lack).filter(Boolean).map(g => [`${g.top}|${g.bottom}`, g])).values()].sort((a, b) => a.bottom - b.bottom || a.top - b.top);
  const moves = [], by = y => moves.reduce((d, m) => d + (y > m.at - 4 ? m.by : 0), 0);
  for (const g of gaps) { const d = g.by - (by(g.bottom) - by(g.top)); if (d > 0.25) moves.push({ at: g.bottom, by: d }); }
  for (const b of boxes) b.y += by(b.y);
  return moves.length > 0;
}
// Where frames' captions are drawn, each as a rect.
const captions = frames => [...frames.values()].map(f => {
  const c = f.caption, t = c.look, x = Math.min(...c.lines.map(l => l.x - l.w * (t.Align === 'center' ? 0.5 : t.Align === 'right' ? 1 : 0)));
  return { x: f.x + x, y: f.y + c.lines[0].y - baseline(t), w: widest([c]), h: c.lines.length * lineHeight(t) };
});
// The chart's pixels to a point as a page drawn at s prints them, for the room kept clear round a label; drawn at
// under half the chart's size, as at half, where a point would be most of a label's height.
const unitAt = s => 1 / (0.75 * Math.max(s, 0.5));
// Every line's label placed again where its words, set at the sheet's half points, now take less room (or, where
// the sheet's least is more than they are, more): where it was, while that's still free, or else in the first free
// place, as the router places them, its route as it is, and clear of what's drawn by the points of the page drawn at
// `at`. With a scale `s`, only as they would be on a page drawn at it, the lines left as they are. → the labels that
// found no free place.
function relabel(boxes, lines, frames, s = null, at = s) {
  const drawn = l => {
    if (!l.label || s === null) return l.label;
    const its = l.texts.map(it => ({ ...it, lines: it.lines.map(x => ({ ...x })) }));
    its.forEach(it => snap(it, s, true));
    let y = 0;
    for (const it of its) y = stack(it, 0, 0, y);
    return { ...l.label, w: widest(its), h: y, base: its.at(-1).lines.at(-1).y };
  };
  const copies = lines.map(l => ({ id: l.id, from: l.from, to: l.to, points: l.points, label: drawn(l), labelAt: l.labelAt, arrow: l.settings.Arrow.value, down: l.down, ...l.placing }));
  const mine = copies.filter(c => c.label && !c.quiet && c.points), cs = captions(frames), unit = at ? unitAt(at) : undefined;
  // Placed as they were where everything they're placed among is as it was: a look changed moves nothing.
  const k = JSON.stringify([boxes.map(b => [b.id, b.x, b.y, b.w, b.h, b.shape]), copies, cs, unit]), was = placedFor.get(k);
  if (was) { placedFor.delete(k); mine.forEach((c, i) => Object.assign(c, { labelAt: was[i].labelAt && { ...was[i].labelAt }, crowded: was[i].crowded })); }
  else Layout.labels(new Map(boxes.map(b => [b.id, b])), mine, copies, [], cs, true, unit);
  placedFor.set(k, was ?? mine.map(c => ({ labelAt: c.labelAt && { ...c.labelAt }, crowded: c.crowded })));
  if (placedFor.size > 8) placedFor.delete(placedFor.keys().next().value);
  if (s === null) for (const c of mine) Object.assign(lines[copies.indexOf(c)], { labelAt: c.labelAt, crowded: c.crowded });
  return mine.filter(c => c.crowded);
}
const placedFor = new Map();
// A preview's lines: those it had keep their routes and labels where both their boxes (and the frame one lands
// on) stand as they stood, to a hundredth of a pixel, as a frame set round its boxes again on the page comes
// out; so lines drawn as one stay one. What it adds takes the route it will have, as the router gives it among them, but
// where that would run over a line it shares no box with, or found no way: that goes around what's drawn. Its labels
// go clear of the rest.
function still(last, boxes, lines, frames) {
  const near = (a, b) => Math.abs(a - b) < 0.01, geo = new Map(boxes.map(b => [b.id, b]));
  const same = (a, b) => !!a && !!b && near(a.x, b.x) && near(a.y, b.y) && near(a.w, b.w) && near(a.h, b.h);
  const added = [];
  for (const l of lines) {
    const was = last.routes.get(l.id);
    if (was && was.from === l.from && was.to === l.to && same(geo.get(l.from), last.boxes.get(l.from)) && same(geo.get(l.to), last.boxes.get(l.to))
      && (!was.landed || same(frames.get(was.landed), last.frames.get(was.landed)))) Object.assign(l, { points: was.points, labelAt: was.labelAt, down: was.down, landed: was.landed });
    else added.push(l);
  }
  if (!added.length) return;
  const kept = lines.filter(l => !added.includes(l));
  const labels = kept.filter(l => l.labelAt && l.label).map(l => ({ x: l.labelAt.x, y: l.labelAt.y, w: l.label.w, h: l.label.h })), cs = captions(frames);
  const legs = l => l.points.slice(1).map((p, i) => [l.points[i], p]), segs = kept.flatMap(legs);
  const along = ([a, b], [c, d]) => {
    const flat = Math.abs(a[1] - b[1]) < 0.5 && Math.abs(c[1] - d[1]) < 0.5 && Math.abs(a[1] - c[1]) < 0.5, up = Math.abs(a[0] - b[0]) < 0.5 && Math.abs(c[0] - d[0]) < 0.5 && Math.abs(a[0] - c[0]) < 0.5, k = flat ? 0 : 1;
    return (flat || up) && Math.min(Math.max(a[k], b[k]), Math.max(c[k], d[k])) - Math.max(Math.min(a[k], b[k]), Math.min(c[k], d[k])) > 0.5;
  };
  const q = last.key, underKey = l => !!q && legs(l).some(([a, b]) => Math.max(a[0], b[0]) > q.x && Math.min(a[0], b[0]) < q.x + q.w && Math.max(a[1], b[1]) > q.y && Math.min(a[1], b[1]) < q.y + q.h);
  const free = l => !!l.points && !l.blocked && !underKey(l) && !kept.some(o => o.from !== l.from && o.to !== l.to && o.from !== l.to && o.to !== l.from && legs(l).some(s => legs(o).some(t => along(s, t))));
  for (const l of added) {
    if (free(l)) continue;
    const way = { avoid: [...labels, ...cs, ...(q ? [q] : [])], segs, page: last.page }, ps = Layout.around(geo, l.from, l.to, way) ?? Layout.around(geo, l.from, l.to, { ...way, strict: false });
    if (ps) Object.assign(l, { points: ps, down: ps.at(-1)[1] > ps[0][1] + 1, landed: undefined });
  }
  const copies = lines.map(l => ({ id: l.id, from: l.from, to: l.to, points: l.points, label: l.label, arrow: l.settings.Arrow.value, down: l.down }));
  const mine = copies.filter((c, i) => added.includes(lines[i]) && c.label);
  Layout.labels(geo, mine, copies, labels, cs, false, unitAt(last.page.scale));
  for (const c of mine) lines[copies.indexOf(c)].labelAt = c.labelAt;
}

// Where a line runs across another, upright over level, the level one is broken 3 pt either side of the crossing, as
// Visio's line jumps are, whatever their dashes, so that no crossing reads as a junction, a dashed branch as a dashed
// crossing; and a dashed line half as far again, as its own gaps are that long: its `runs`, the pieces it's drawn in, each
// beginning on a dash. Lines revealed for a while neither break nor are broken.
function jumps(lines, gap) {
  const drawn = lines.filter(l => !l.merged && !l.revealed && !none(l.settings.Outline.value) && l.points?.length > 1);
  const legs = l => l.points.slice(1).map((p, i) => [l.points[i], p]);
  const ups = drawn.flatMap(l => legs(l).filter(([a, b]) => Math.abs(a[0] - b[0]) < 0.5).map(([a, b]) => ({ l, x: a[0], y0: Math.min(a[1], b[1]), y1: Math.max(a[1], b[1]) })));
  for (const l of drawn) {
    delete l.runs;
    const cuts = legs(l).map(([a, b]) => {
      if (Math.abs(a[1] - b[1]) >= 0.5) return [];
      const y = a[1], x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]);
      return ups.filter(u => u.l !== l && u.x > x0 + gap && u.x < x1 - gap && y > u.y0 + gap && y < u.y1 - gap).map(u => u.x);
    });
    if (!cuts.some(c => c.length)) continue;
    const runs = [[l.points[0]]], off = l.settings.Dash.value === 'solid' ? gap : gap * 1.5;
    legs(l).forEach(([a, b], i) => {
      const dir = Math.sign(b[0] - a[0]), gaps = [];
      for (const x of [...cuts[i]].sort((p, q) => (p - q) * dir)) {
        const g = gaps.at(-1);
        if (g && Math.abs(x - g[1]) < 2 * off) g[1] = x; else gaps.push([x, x]);
      }
      for (const [p, q] of gaps) { runs.at(-1).push([p - dir * off, a[1]]); runs.push([[q + dir * off, a[1]]]); }
      runs.at(-1).push(b);
    });
    l.runs = runs;
  }
}

// A frame around its members and the frames inside it, with room for its caption; a bracket over them; a
// lone frame its caption alone, 4 pt above its box. Frames stacked in a column, their left sides within 18 pt,
// share their left and right sides, where that takes in no other box (but one revealed for a while): a column of
// panels.
function frameBounds(frames, boxes) {
  const byId = new Map(boxes.map(b => [b.id, b]));
  const done = new Set();
  const fit = f => {
    if (done.has(f.id)) return f;
    done.add(f.id);
    const inner = [...f.members.map(id => byId.get(id)), ...f.frames.map(id => fit(frames.get(id)))];
    const b = bounds(inner), pad = 10;
    if (f.kind === 'bracket') Object.assign(f, { x: b.x, y: b.y - f.label - 12, w: b.w, h: f.label + 6 });
    else if (f.lone) Object.assign(f, { x: b.x, y: b.y - f.label - 5.3, w: b.w, h: f.label + 5.3 });
    else Object.assign(f, { x: b.x - pad, y: b.y - pad - f.label, w: b.w + 2 * pad, h: b.h + 2 * pad + f.label });
    caption(f);
    return f;
  };
  for (const f of frames.values()) { f.own = null; fit(f); }
  const columns = [];
  for (const f of [...frames.values()].filter(f => f.kind !== 'bracket' && !f.lone).sort((a, b) => a.x - b.x)) {
    const c = columns.find(c => c[0].parent === f.parent && f.x - c[0].x <= 24);
    if (c) c.push(f); else columns.push([f]);
  }
  for (const column of columns.filter(c => c.length > 1)) {
    const left = Math.min(...column.map(f => f.x)), right = Math.max(...column.map(f => f.x + f.w));
    for (const f of column) {
      const mine = new Set(inFrame(frames, f));
      // (`own`, what it wraps of itself: a box a hand put far out widens the column, and what it widens holds no page to it.)
      if (!boxes.some(b => !mine.has(b.id) && !b.revealed && b.x < right && b.x + b.w > left && b.y < f.y + f.h && b.y + b.h > f.y)) Object.assign(f, { own: { x: f.x, w: f.w, column: column.map(c => c.id) }, x: left, w: right - left });
    }
  }
  // No heading overprints another's: a frame drawn across another (boxes put by hand can draw one so) says its heading along from the other's.
  const headed = [];
  for (const f of [...frames.values()].filter(f => f.kind !== 'bracket' && !f.lone).sort((a, b) => a.y - b.y || a.x - b.x)) {
    const w = Math.max(0, ...(f.caption.lines ?? []).map(l => l.w)), h = f.label;
    let from = f.x + 6;
    for (const o of headed) if (Math.abs(o.y - f.y) < h && from < o.to + 8 && o.from < from + w + 8) from = o.to + 12;
    const was = f.headAt;
    if (from !== f.x + 6) f.headAt = from - f.x; else delete f.headAt;
    if (f.headAt !== was) caption(f);
    headed.push({ y: f.y, from, to: from + w });
  }
}
// A frame's caption in it: at its top left, inside it; a bracket's over its middle; a lone frame's at its top.
function caption(f) {
  const bracket = f.kind === 'bracket';
  stack(f.caption, bracket || f.lone ? 0 : f.headAt ?? 6, bracket ? f.w : 0, bracket || f.lone ? 0 : 4);
}

// What a style's output is called on the chart: its Caption, or its own name.
function captionOf(N, output, view) {
  const c = N.resolve('Caption', output, view);
  if (c && key(c.note.pattern) === key(output)) return c.value;
  return outputName(N, output);
}
// An output's own name: its option, its tag's label or Not, or its pattern's name.
function outputName(N, p) {
  if (!p.args) return p.kind ?? 'All';
  const name = N.name(bare(p));
  if (!p.out) return name;
  if ('choice' in p.out) return p.args.length > 1 ? `${name}: ${p.out.choice}` : p.out.choice;
  if ('tag' in p.out) return p.out.tag ? name : `Not ${name}`;
  return name;
}

// How a view's styles group their outputs, what each group is called, and in what order: the one rule the Key,
// Styles, the format bar's scope and History all go by. A style's outputs that look alike, by their swatch and
// whether they're shown, and are called alike, are one group. A Caption note at an output calls that output
// alone, so no caption names an output it doesn't describe; those with none are called by their outputs ("AIV
// and Feeder Fund"), a text style's in the plural, the texts it sets ("Names"); a frame's each by its own, as its
// frame is captioned on the chart. An output that only shows or hides is a filter, and in none. A group's
// outputs are in their option list's order, the same in every view, and it goes by its first, which stays the
// same while the group does. It's listed under its style's name, its `name`, but for a style that is that one
// group alone (Name), under none. The groups are in the view's order of its styles, those under a name first and
// those under none after them all, so none reads as under the name before it. `only`, a set of output keys,
// takes those outputs alone, as the Key takes what's drawn.
// → [{ style, order, name, key, outputs: [pattern], swatch, caption, off }]
function groupsOf(N, view, only = null) {
  const out = [], own = p => { const c = N.resolve('Caption', p, view); return c && key(c.note.pattern) === key(p) ? c.value : null; };
  const listed = xs => xs.length < 3 ? xs.join(' and ') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`;
  // An uncaptioned output by its name, but a text style's naming its entry, not an option or a tag, by the texts.
  const called = (p, sw) => sw.kind === 'text' && (!p.out || 'field' in p.out) ? Tree.plural(outputName(N, p)) : outputName(N, p);
  // Outputs as their option list has them: by the Order noted at each, then by name.
  const listOrder = ps => ps.map(p => [p, N.optionOrder(p) ?? Infinity, outputName(N, p)]).sort((a, b) => a[1] - b[1] || a[2].localeCompare(b[2])).map(([p]) => p);
  // (A text's swatch is in the page's own font and size, where its output doesn't say.)
  const ofPage = ROOT.map(l => [l, N.value(l, { id: view, kind: 'View' })]).filter(([, v]) => v !== undefined);
  N.styles(view).forEach((s, order) => {
    const looks = new Map(), keyed = s.outputs.filter(o => Object.keys(o.formats).some(k => k !== 'Shown')), name = styleName(N, s.pattern);
    const alone = keyed.length === 1 && same(outputName(N, keyed[0].pattern), name) && same(own(keyed[0].pattern) ?? name, name);
    for (const o of keyed) {
      if (only && !only.has(key(o.pattern))) continue;
      const sw = swatchOf(o.pattern, o.formats), off = o.formats.Shown === false;
      if (sw.kind === 'text') for (const [l, v] of ofPage) if (!(l in o.formats)) sw[l] = v;
      const k = JSON.stringify([sw, off, sw.kind === 'frame' && captionOf(N, o.pattern, view)]);
      (looks.get(k) ?? looks.set(k, { style: s.key, order, name: alone ? null : name, swatch: sw, off, outputs: [] }).get(k)).outputs.push(o.pattern);
    }
    // Captioned alike, or uncaptioned and so called by their outputs: what's called alike is one group; and a style's
    // groups in the option list's order of the outputs they go by, captioned or not.
    const groups = [];
    for (const look of looks.values())
      for (const [caption, parts] of groupBy([...groupBy(look.outputs, own)], ([c, ps]) => c ?? listed(listOrder(ps).map(p => called(p, look.swatch))))) {
        const ps = listOrder(parts.flatMap(([, ps]) => ps));
        groups.push({ ...look, outputs: ps, key: key(ps[0]), caption });
      }
    out.push(...listOrder(groups.map(g => g.outputs[0])).map(p => groups.find(g => g.outputs[0] === p)));
  });
  return out.sort((a, b) => (a.name === null) - (b.name === null));
}
// The legend's rows: the groups of the outputs from which a drawn box or line takes a property that tells
// marks apart, each a swatch in their format and a caption.
function legend(N, view, marks) {
  const used = new Set();
  for (const m of marks) for (const label of KEYED[m.type] ?? []) {
    const note = m.settings?.[label]?.note;
    if (note && note.view === view && !idsIn(note.pattern).size) used.add(key(note.pattern));
  }
  return groupsOf(N, view, used).map(({ off, ...g }) => g);
}
// The Key's rows as of any day: of the view's groups, those with an output some record in the chart's rows has, on any day: a
// kind, an option or a tag said, a relation. (What only a formula gives isn't among those, and takes its place where it's drawn.)
const everSaid = new WeakMap();
function keyedEver(N, view, rows) {
  let kept = everSaid.get(rows);
  if (kept?.views.has(view)) return kept.views.get(view);
  if (!kept) {
    everSaid.set(rows, kept = { said: new Set(), views: new Map() });
    const said = kept.said;
    for (const r of rows) if ('record' in r) {
      if (r.kind) said.add(`k:${r.kind}`);
      if (r.edge != null && 'choice' in r) said.add(`c:${Tree.norm(r.edge)}|${Tree.norm(r.choice)}`);
      if (r.edge != null && 'tag' in r) said.add(`t:${Tree.norm(r.edge)}|${r.tag}`);
      if (r.args) said.add(`r:${r.args.map(a => Tree.norm(a.edge)).sort().join('|')}`);
    }
  }
  const said = kept.said, has = p => !p.args ? said.has(`k:${p.kind}`) : p.args.length > 1 ? said.has(`r:${p.args.map(a => Tree.norm(a.edge)).sort().join('|')}`)
    : p.out && 'choice' in p.out ? said.has(`c:${Tree.norm(p.args[0].edge)}|${Tree.norm(p.out.choice)}`) : p.out && 'tag' in p.out ? said.has(`t:${Tree.norm(p.args[0].edge)}|${p.out.tag}`) : false;
  const groups = groupsOf(N, view).filter(g => !g.off && g.swatch.kind !== 'text' && g.outputs.some(has));
  kept.views.set(view, groups);
  return groups;
}

// ---- Free shapes ----

// A free shape, from its row and its text as worked out: its geometry, place, formats and text. Its sizes are
// the sheet's, `u` pixels of the page to one of the sheet: a text box's 12 pt, a title's 20, a date's 11 and a Key's 8
// are those on the slide, however much the chart is drawn smaller; a Key's, `k` times that. A size or weight its row
// gives is printed as given.
const SHAPE_DEFAULTS = { Fill: '#ffffff', Transparency: 0, Outline: '#000000', Weight: 0.75, Dash: 'solid', Shadow: 'none', Corner: CORNER, Valign: 'middle', Arrow: 'none', Arrowhead: null, Layer: 0, ...TEXT };
const TEXTBOX = { Fill: 'none', Outline: 'none', Align: 'left', Size: 12, Valign: 'top' };
// The page's own texts: its title, its date, its footer and its number.
const ROLES = { title: { Size: 20, Bold: true }, date: { Size: 11, Color: '#595959' }, footer: { Size: 9, Color: '#595959' }, number: { Size: 9, Color: '#595959', Align: 'right' } };
function freeShape(row, text, u = 1, k = 1) {
  const { id, shape, format = {} } = row;
  const base = { ...SHAPE_DEFAULTS, ...(row.geometry === 'text' && TEXTBOX), ...ROLES[row.role], ...(row.geometry === 'legend' && { Size: 8 * k, Outline: '#7f7f7f', Weight: 0.5, Align: 'left' }),
    ...(row.geometry === 'frame' && { Fill: 'none', Outline: '#595959', Dash: 'dashed', Size: 9, Italic: true, Align: 'left', Valign: 'top' }),
    ...(row.geometry === 'line' && { Arrow: 'none' }) };
  const t = { ...base, ...format, Size: (format.Size ?? base.Size) * u, Weight: (format.Weight ?? base.Weight) * u };
  if (format.Size == null) t.Size = half(t.Size, 1 / u, k < 1);
  if (format.Color == null && tooDark(t) && unread(t.Color, t.Fill)) t.Color = WHITE;
  const m = { id: shape, type: 'shape', row: id, geometry: row.geometry ?? 'rect', x: row.x ?? 0, y: row.y ?? 0, w: row.w ?? 200 * u, h: row.h ?? 52 * u,
    look: t, settings: Object.fromEntries(Object.entries(t).map(([k, v]) => [k, { value: v, note: null }])), texts: [], ...(row.role && { role: row.role }), ...(row.rotate && { rotate: row.rotate }) };
  if (m.geometry === 'line') {
    m.points = (row.points ?? [[m.x, m.y], [m.x + m.w, m.y]]).map(p => [...p]);
    if (row.ends?.some(Boolean)) m.ends = row.ends;
    Object.assign(m, bounds(m.points.map(([x, y]) => ({ x, y, w: 0, h: 0 }))));
  }
  if (m.geometry === 'picture') { m.src = row.src; if (row.crop) m.crop = row.crop; }
  if (m.geometry === 'group') m.members = row.members ?? [];
  if (m.geometry === 'legend') Object.assign(m, { title: row.title ?? 'Key', columns: row.columns ?? 1, hide: row.hide ?? [], captions: row.captions ?? {}, order: row.order ?? [], auto: row.w == null });
  // A text box nobody has sized grows with its text, a line to each paragraph, as PowerPoint's does.
  if (m.geometry === 'text' && row.w == null) Object.assign(m, { auto: true, w: 120 * u, h: lineHeight(t) + 9.6 * u });
  if (text && !['line', 'picture', 'group', 'legend'].includes(m.geometry)) {
    const inset = 9.6 * u, share = TEXT_AREA[m.geometry] ?? 1, lines = breakLines(text, t, m.auto ? Infinity : Math.max(16 * u, m.w * share - 2 * inset), !!row.role);
    if (m.auto) m.w = Math.ceil(widest([{ lines }]) + 2 * inset + 1);
    // Set in as PowerPoint sets in its text rect (see TEXT_RECT).
    const r = textRect(m.geometry, m.w, m.h, t.Corner), avail = Math.max(16 * u, m.w * share - 2 * inset) - 2 * r.x;
    const it = { id: shape, type: 'text', look: t, settings: m.settings, text, lines };
    const tb = blockHeight([it]);
    if (m.geometry === 'text') m.h = m.auto ? tb + 9.6 * u : Math.max(m.h, tb + 9.6 * u);
    // At its top, middle or bottom, PowerPoint's 0.05 in from its edge (a frame's caption at its top, 5 pt in).
    stack(it, (m.w - avail) / 2 + (r.shift ?? 0), avail, m.geometry === 'frame' && t.Valign === 'top' ? 5 * u : valigned(t.Valign, r.top, m.h - r.bottom, tb, 4.8 * u));
    m.texts.push(it);
    m.column = { x: (m.w - avail) / 2 + (r.shift ?? 0), width: avail };
  }
  return m;
}
// A free shape's text: what its row says, or a formula's value, @AsOf being the view's day.
function shapeText(row, computed, day) {
  const text = row.text ?? '';
  return /^\s*=/.test(text) && computed ? Formulas.text(computed, Formulas.evaluateAt(computed, text, null, { '@AsOf': { t: 'date', iso: day } })) : text;
}

// A legend's rows laid out in its columns under its title, `sheet` pixels of the page to the sheet's. A row
// merging outputs that look alike may have a caption of the legend's own, which no output shares. `all` is
// every row it could show, each `shown` or not. A legend nobody has sized is as wide as its captions need,
// each up to 120 pt before it wraps. Its swatches and the room round them are `k` times the sheet's, as its
// captions are (see keyAt); their weights the sheet's, as the lines they show are drawn.
const SWATCH = { h: 11 };
function layoutLegend(m, rows, sheet = 1, k = 1) {
  const t = m.look, u = sheet * k, pad = 12 * u, sw = 30 * u, gap = 8 * u, lh = lineHeight(t);
  // In the Key's own order, where it has one; a row new to it after those it lists.
  const at = new Map((m.order ?? []).map((k, i) => [k, i])), ever = rows.ever ?? [];
  // (A dashed outline at no more than a point, so that its dashes read as dashes round a thing this small.)
  const swWeight = s => s.kind === 'box' && s.Dash !== 'solid' ? Math.min(s.Weight, 1) : s.Weight;
  rows = rows.map(r => ({ ...r, caption: m.captions[r.key] ?? r.caption, swatch: { ...r.swatch, Weight: swWeight(r.swatch) * sheet } })).sort((a, b) => (at.get(a.key) ?? Infinity) - (at.get(b.key) ?? Infinity));
  m.all = rows.map(r => ({ key: r.key, style: r.style, outputs: r.outputs, swatch: r.swatch, caption: r.caption, shown: !m.hide.includes(r.key) }));
  const shown = rows.filter(r => !m.hide.includes(r.key));
  // The Key doesn't reshuffle as the day changes: its rows keep their columns, and it its width, by the rows of every day, a row
  // that isn't drawn today leaving its place to close up in its own column, so nothing crosses from one column to the next.
  const places = [...ever.filter(g => !m.hide.includes(g.key)).sort((a, b) => (at.get(a.key) ?? Infinity) - (at.get(b.key) ?? Infinity))], placeOf = new Map(places.flatMap((g, i) => g.outputs.map(p => [key(p), i])));
  const late = shown.filter(r => !r.outputs.some(p => placeOf.has(key(p))));
  late.forEach(r => { placeOf.set(key(r.outputs[0]), places.length); places.push(r); });
  const place = r => placeOf.get(key(r.outputs.find(p => placeOf.has(key(p))) ?? r.outputs[0])) ?? 0;
  shown.sort((a, b) => place(a) - place(b));
  if (m.auto) m.w = Math.ceil(m.columns * (sw + gap + Math.min(160 * u, Math.max(40 * u, ...[...shown, ...places].map(r => measure(m.captions[r.key] ?? r.caption, t)))) + 16 * u) + 2 * pad);
  const colW = (m.w - 2 * pad) / m.columns;
  const title = m.title ? { id: `${m.id}:title`, type: 'text', look: { ...t, Bold: true, Align: 'left' }, text: m.title } : null;
  let y = pad;
  if (title) { title.lines = breakLines(title.text, title.look, m.w - 2 * pad); y = stack(title, pad, m.w - 2 * pad, y) + 4 * u; }
  const perCol = Math.max(1, Math.ceil(places.length / m.columns));
  const colTops = [y];
  let colNow = -1;
  m.rows = shown.map(r => {
    const col = Math.min(m.columns - 1, Math.floor(place(r) / perCol));
    if (col !== colNow) { y = colTops[0]; colNow = col; }
    // A caption stops 12 pt short of the next column.
    const x = pad + col * colW, caption = { id: `${m.id}:${r.key}`, type: 'text', look: { ...t, Align: 'left' }, text: r.caption, column: { x: x + sw + gap, width: colW - sw - gap - 16 * u } };
    caption.lines = breakLines(r.caption, caption.look, caption.column.width);
    // A row is as tall as its swatch and a little more, and the next 5 px under it, so no two swatches touch or crowd.
    const h = Math.max(lh, SWATCH.h * u + 2 * u, caption.lines.length * lh);
    stack(caption, caption.column.x, caption.column.width, y + (h - caption.lines.length * lh) / 2);
    // (A triangle as it stands on the chart, as tall as it's wide, in its swatch's room; anything else that room.)
    const tall = r.swatch.Shape === 'triangle' ? { x: x + (sw - (SWATCH.h + 1) * u) / 2, y: y + h / 2 - (SWATCH.h + 1) * u / 2, w: (SWATCH.h + 1) * u, h: (SWATCH.h + 1) * u } : { x, y: y + h / 2 - SWATCH.h * u / 2, w: sw, h: SWATCH.h * u };
    const row = { key: r.key, style: r.style, outputs: r.outputs, swatch: r.swatch, x, y, w: colW, h, sw: tall, caption };
    y += h + 5 * u;
    return row;
  });
  const colBottom = m.rows.length ? Math.max(...m.rows.map(r => r.y + r.h)) : y;
  m.texts = title ? [title] : [];
  m.h = colBottom + pad;
}

// ---- The page ----

// The Key's size, as a share of the sheet's: none larger than the names it explains, as a page drawn at s prints them,
// the least of them, its 8 pt where they're as large.
const keyAt = (boxes, s) => Math.min(1, ...boxes.filter(b => b.texts?.[0]?.look).map(b => printed(b.texts[0], s) / 8));
// A view's sheet: its Page note at the View object, a named size or { w, h }, or a named size turned, { size, portrait };
// a slide where none says. On a paper, that paper's size, turned as the view's own is, or as `paper` says ("letter
// portrait", "letter landscape").
function pageOf(N, view, paper) {
  const v = N.resolve('Page', { id: view, kind: 'View' })?.value ?? 'slide', named = typeof v === 'object' ? v.size : v;
  let [w, h] = typeof v === 'object' && !PAGES[named] && v.w > 0 && v.h > 0 ? [v.w, v.h] : PAGES[named] ?? PAGES.slide, size = PAGES[named] ? named : typeof v === 'object' ? 'custom' : 'slide';
  if (v?.portrait) [w, h] = [h, w];
  const [to, turned] = String(paper ?? '').split(' ');
  if (PAGES[to] && (to !== size || turned)) { const [a, b] = PAGES[to], [L, S] = [Math.max(a, b), Math.min(a, b)]; [w, h] = (turned ? turned === 'landscape' : w >= h) ? [L, S] : [S, L]; size = to; }
  return { size, w, h, margin: MARGIN, portrait: h > w };
}
// What a box placed among entered ones keeps clear of: the free shapes placed by hand, where they are on the page
// (see furnish), which a chart placed stands on as it was put, where the page needn't move it.
const obstaclesOf = rows => rows.filter(r => r.x != null && r.y != null && !['line', 'group'].includes(r.geometry))
  .map(r => ({ x: r.x, y: r.y, w: r.w ?? 200, h: Math.max(r.h ?? 52, r.geometry === 'legend' ? 120 : 0) }));
// The page's scale and its furniture's places, and where it sets the chart. A chart `placed`, some of its boxes
// where they were entered, stands where it was placed: a place is the page's, from its top left, in the chart's
// own size, as a PowerPoint shape's is, so a box moved moves on the page and nothing else does; the page moves the
// chart, as a whole, only as far as holds it within its margins and 24 pt under the date. One the layout alone
// places is set across the middle, 24 pt under the date. Its boxes placed by hand are placed so; the page adds `dx`
// and `dy` to set it there. A free shape placed by hand is the page's, where it was put, no part of the chart: the
// Key keeps clear of it where it can; on another paper (`ownPage`, the view's own) it stands as on its own, as large as
// it printed there and as far from the nearest corner of the sheet. The scale is the largest twentieth, up to `ceil`,
// at which the chart fits the sheet within its margins, with the Key beside the title, clear of the title and the date
// by 24 pt and of the chart by 16; or, where the layout places the chart, beside the title with the chart starting 24
// pt under it; or else at the chart's foot, 24 pt under what's over it there and 16 pt beside what isn't, where that
// sets it least far down, right-aligned to the chart where that's as high; failing all of them, what fits the chart.
// The Key beside the title takes the room there, its captions wrapping. Where the view keeps its scale and offset
// (`held`, { scale, x, y }), only what the layout places holds the page to it: a box where a hand put it beyond the
// margins, a line to one a hand put and a frame round one stay there, over the margin or off the sheet, and neither move
// nor rescale the chart, and the Key goes over them rather than rescale it. A preview keeps the page as it was.
// → { s, dx, dy, shapes, places: rowId → { x, y }, placed }, in the page's pixels.
function furnish({ sheet, boxes, lines, frames, shapes: rows, said, legend: legendRows, last, placedBy, placed = false, keptAt = null, ceil = 1, held = null, own: ownPage = null }) {
  const W = sheet.w, H = sheet.h, M = MARGIN, hands = new Set(boxes.filter(b => b.hand).map(b => b.id));
  // What the chart draws, each as a rect, those of what a hand put `hand`: a box, and a line bent or to one it put.
  const handIn = f => inFrame(frames, f).some(id => hands.has(id));
  const rects = [...boxes.map(b => ({ x: b.x, y: b.y, w: b.w, h: b.h, hand: hands.has(b.id) })),
    ...[...frames.values()].flatMap(f => {
      const all = { x: f.x, y: f.y, w: f.lone ? Math.max(f.w, widest([f.caption])) : f.w, h: f.h };
      // (Of a column a hand's box is in, each holds the page by what it wraps; what the column's width adds is the hand's.)
      return f.own?.column.some(id => handIn(frames.get(id))) ? [{ ...all, x: f.own.x, w: f.own.w, hand: handIn(f) }, { ...all, hand: true }] : [{ ...all, hand: handIn(f) }];
    })];
  for (const l of lines) if (!l.merged && l.points) {
    const hand = hands.has(l.from) || hands.has(l.to) || !!l.bend;
    l.points.slice(1).forEach((p, i) => { const q = l.points[i]; rects.push({ x: Math.min(p[0], q[0]), y: Math.min(p[1], q[1]), w: Math.abs(p[0] - q[0]), h: Math.abs(p[1] - q[1]), hand }); });
    if (l.labelAt && l.label) rects.push({ x: l.labelAt.x, y: l.labelAt.y, w: l.label.w, h: l.label.h, hand });
  }
  const meets = (a, b, pad = 0) => a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;
  const fits = r => r.x >= M - 0.5 && r.y >= M - 0.5 && r.x + r.w <= W - M + 0.5 && r.y + r.h <= H - M + 0.5;
  // What holds the page to it: all of it, where the view keeps no scale or it's just been fit to its page (`fit`); else what the
  // layout places.
  const hx = held?.x ?? 0, hy = held?.y ?? 0, mine = held && !held.fit ? rects.filter(r => !r.hand) : rects, some = mine.length > 0, E = bounds(mine);
  const at = (s, force, footed = false, over = false) => {
    // (The Key, as wide as `w` where that's given, set no larger than the names it explains: see keyAt.)
    const u = 1 / s, k = r => r.geometry === 'legend' && r.format?.Size == null ? keyAt(boxes, s) : 1;
    const keyed = (r, w) => { const m = freeShape(w == null ? r : { ...r, w }, said.get(r.id), u, k(r)); layoutLegend(m, legendRows, u, k(r)); return m; };
    // (On another paper, one a hand put as large as it printed on its own page, and as far from the nearest corner.)
    const shapeOn = r => {
      if (!ownPage || placedBy(r)) return r.geometry === 'legend' ? keyed(r) : freeShape(r, said.get(r.id), u);
      const f = ownPage.scale / s, row = { ...r, x: r.x * f, y: r.y * f, ...(r.w != null && { w: r.w * f }), ...(r.h != null && { h: r.h * f }), ...(r.points && { points: r.points.map(([x, y]) => [x * f, y * f]) }) };
      const m = r.geometry === 'legend' ? keyed(row) : freeShape(row, said.get(r.id), u), mw = m.w * s, mh = m.h * s, ox = m.x * s, oy = m.y * s, right = ownPage.sheet.w - ox - mw, foot = ownPage.sheet.h - oy - mh;
      move(m, (right < ox ? W - right - mw - ox : 0) / s, (foot < oy ? H - foot - mh - oy : 0) / s);
      return m;
    };
    const shapes = rows.map(shapeOn), places = new Map();
    const byPage = m => !!m && placedBy(rows.find(r => r.id === m.row));
    let title = shapes.find(m => m.role === 'title' && byPage(m)), key = shapes.find(m => m.geometry === 'legend' && byPage(m));
    const date = shapes.find(m => m.role === 'date' && byPage(m));
    // A title too long for the sheet wraps within its margins.
    if (title && title.w * s > W - 2 * M + 2 * INSET) {
      const row = rows.find(r => r.id === title.row), wide = freeShape({ ...row, w: (W - 2 * M + 2 * INSET) * u }, said.get(row.id), u);
      shapes[shapes.indexOf(title)] = title = wide;
    }
    // In the sheet's pixels: the title at the top left margin, its text at it, and the date under the title.
    let y = M - INSET;
    for (const m of [title, date].filter(Boolean)) { places.set(m.row, { x: M - INSET, y }); y += m.h * s; }
    // The footer in the margin at the sheet's foot, on one line where it fits, and its number at the right, each as the
    // title's text sits on its margin.
    const number = shapes.find(m => m.role === 'number');
    let footer = shapes.find(m => m.role === 'footer');
    if (footer) {
      const most = W - 2 * M + 2 * INSET - (number ? 48 : 0), row = rows.find(r => r.id === footer.row);
      if (footer.w * s > most) shapes[shapes.indexOf(footer)] = footer = freeShape({ ...row, w: most * u }, said.get(row.id), u);
      places.set(footer.row, { x: M - INSET, y: H - M + PAD });
    }
    if (number) places.set(number.row, { x: W - M + INSET - number.w * s, y: H - M + PAD });
    // The chart's top on the sheet: 24 pt under the date, or, placed, where it stands, if that's lower.
    let top = title || date ? y - PAD + 32 : M, alongside = null;
    // The chart as rects on the sheet: placed, where it stands, moved right as far as keeps it off the left margin; else
    // across the middle. A shape placed by hand is the page's, where it was put (see Free shapes): no part of the chart,
    // which it never moves, but what the Key keeps clear of, on the sheet.
    const drawn = over ? mine : rects, free = shapes.filter(m => !byPage(m) && m.geometry !== 'group').map(m => ({ x: m.x * s, y: m.y * s, w: m.w * s, h: m.h * s }));
    let dx = !boxes.length ? 0 : !placed ? (W - E.w * s) / 2 / s - E.x : some ? Math.max(hx, M / s - E.x) : hx;
    if (placed && boxes.length) top = some ? Math.max(top, (E.y + hy) * s) : hy * s;
    const set = t => drawn.map(r => ({ x: (r.x + dx) * s, y: (r.y + t / s - E.y) * s, w: r.w * s, h: r.h * s, hand: r.hand }));
    const R = t => ({ x: (E.x + dx) * s, y: t, w: E.w * s, h: E.h * s }), clearOfFree = r => !free.some(q => meets(q, r, 21));
    if (!force && boxes.length && some && !fits(R(top))) return null;
    if (key) {
      // In a corner, by name or as far from one as a look's Key stood: there, however large it is, under the title where it
      // would run over it. What a hand or a look puts there the page doesn't move, nor anything for it, unless the layout
      // alone places the chart (Tidy), which is then set clear of it: to its side, as far as the margin lets it, or else
      // smaller, the scale falling as far as that needs but no further than leaves its gaps a chart's; past that the Key goes
      // over it, and Export says so.
      const corner = rows.find(r => r.id === key.row).corner;
      if (corner) {
        const kw = key.w * s, kh = key.h * s, kx = corner.h === 'left' ? corner.dx ?? M : W - (corner.dx ?? M) - kw, heads = [title, date].filter(Boolean).map(m => M - INSET + ((m.column?.x ?? 0) + widest(m.texts)) * s);
        const ky = corner.v === 'top' ? Math.max(corner.dy ?? M, kx < Math.max(0, ...heads) ? y + 8 : 0) : H - (corner.dy ?? M) - kh, q = { x: kx, y: ky, w: kw, h: kh };
        const hit = !force && !held && !placed && !ownPage && boxes.length ? set(top).filter(c => meets(c, q, 21)) : [];
        if (hit.length) {
          const left = corner.h === 'left', by = left ? Math.max(...hit.map(c => q.x + q.w + 21 - c.x)) : Math.max(...hit.map(c => c.x + c.w + 21 - q.x)), free = Math.max(0, left ? W - M - R(top).x - E.w * s : R(top).x - M);
          if (by > free + 0.5 && s > 0.65 + 1e-9) return null;
          dx += (left ? 1 : -1) * Math.min(by, free) / s;
        }
        places.set(key.row, q);
        alongside = q;
      }
      // Beside the title, its captions wrapping to the room there, where the chart is clear of it; or, where the
      // layout places the chart, moved toward the left as far as it must be, or starting under it; unless it goes at
      // the chart's foot (`footed`).
      const room = W - M - 32 - Math.max(M, ...[title, date].filter(Boolean).map(m => M - INSET + ((m.column?.x ?? 0) + widest(m.texts)) * s));
      let side = key;
      if (key.auto && key.w * s > room && room >= key.columns * (30 + 8 + 80 + 16) + 24) {
        side = keyed(rows.find(r => r.id === key.row), room * u);
      }
      const r = { x: W - M - side.w * s, y: M, w: side.w * s, h: side.h * s };
      // Where a change kept it, on the sheet (`keptAt`), while that's clear of what the layout places and what's over it
      // there, and nothing a hand put stands on it: what a hand puts near it moves it no more than it moves anything.
      if (keptAt && !footed && !corner) {
        const under = keptAt.y < y, k = under ? side : key, kw = k.w * s, q = { x: Math.min(keptAt.x, W - M - kw), y: Math.min(keptAt.y, H - M - k.h * s), w: kw, h: k.h * s };
        if (fits(q) && !free.some(f => meets(f, q)) && !set(top).some(c => meets(c, q, c.hand ? 0 : 21)) && (!under || q.x >= W - M - room - 0.5)) { places.set(key.row, q); shapes[shapes.indexOf(key)] = key = k; alongside = q; }
      }
      if (!places.has(key.row) && !footed && r.w <= room + 0.5 && fits(r) && clearOfFree(r)) {
        const under = Math.max(top, r.y + r.h + 32), by = Math.max(0, ...set(top).filter(q => q.y < r.y + r.h + 21).map(q => q.x + q.w + 21 - r.x));
        const left = !placed && R(top).x - by >= M - 0.5 ? by / s : 0;
        dx -= left;
        if (!set(top).some(q => meets(q, r, 21))) places.set(key.row, r);
        else {
          dx += left;
          if (!placed && (fits(R(under)) || (force && boxes.length))) { places.set(key.row, r); top = under; }
        }
        if (places.has(key.row)) shapes[shapes.indexOf(key)] = key = side;
      }
      if (!places.has(key.row)) {
        // Or else at the chart's foot: 24 pt under what's over it there, and 16 pt beside what isn't, where that sets it
        // least far down, right-aligned to the chart where that's as high, its captions wrapping to a narrower Key where
        // that's what lets it fit; or 24 pt beside it, the chart moved left as far as that needs. Clear of what's placed
        // by hand, where that fits.
        // (Under what's within the margins, where a hand may have put a box beyond them.)
        const own = set(top), within = bounds(own.filter(q => q.x < W - M && q.y < H - M && q.x + q.w > M && q.y + q.h > M)), x0 = Math.max(M, within.x);
        const c = held ? { x: x0, y: within.y, w: Math.min(W - M, within.x + within.w) - x0, h: within.h } : R(top), row = rows.find(r => r.id === key.row), least = key.columns * (30 + 8 + 80 + 16) + 24, withFree = [...own, ...free];
        let chart = withFree;
        const underOf = k => {
          const kw = k.w * s, kh = k.h * s, x0 = Math.max(M, c.x), x1 = Math.max(x0, c.x + c.w - kw);
          const xs = [x1, x0, ...chart.flatMap(q => [q.x + q.w + 21, q.x - 21 - kw])].filter(x => x >= x0 - 0.01 && x <= x1 + 0.01);
          return xs.map(x => ({ x, y: Math.max(c.y, ...chart.filter(q => q.x < x + kw + 21 && q.x + q.w + 21 > x).map(q => q.y + q.h)) + 32, w: kw, h: kh }))
            .reduce((a, b) => b.y < a.y - 0.5 || (b.y < a.y + 0.5 && b.x > a.x) ? b : a);
        };
        let under = underOf(key);
        if (!fits(under) && free.length) { chart = own; under = underOf(key); }
        for (let w = key.w * s - 8; key.auto && !fits(under) && w >= least; w -= 8) {
          const narrow = keyed(row, w * u), r = underOf(narrow);
          if (fits(r)) { shapes[shapes.indexOf(key)] = key = narrow; under = r; }
        }
        const kw = key.w * s, kh = key.h * s, by = Math.max(0, c.x + c.w + 32 + kw - (W - M)), beside = { x: c.x - by + c.w + 32, y: c.y + c.h - kh, w: kw, h: kh };
        // Or any room the sheet has clear of the chart, its corners first, lowest and rightmost before the rest: so a Key moves clear of what grows, before the chart falls.
        const clearOf = () => {
          const xs = [...new Set([W - M - kw, M, ...withFree.flatMap(q => [q.x + q.w + 21, q.x - 21 - kw])])].filter(x => x >= M - 0.5 && x + kw <= W - M + 0.5);
          const ys = [...new Set([H - M - kh, ...withFree.map(q => q.y + q.h + 21)])].filter(v => v >= y + 8 && v + kh <= H - M + 0.5).sort((a, b) => b - a);
          for (const v of ys) for (const x of xs) { const q = { x, y: v, w: kw, h: kh }; if (!withFree.some(o => meets(o, q, 21))) return q; }
          return null;
        };
        if (fits(under) || force) places.set(key.row, under);
        else if (kh <= c.h && c.x - by >= M - 0.5 && (!placed || !by) && fits(beside)) { dx -= by / s; places.set(key.row, beside); }
        else {
          const clear = clearOf();
          if (clear) places.set(key.row, clear);
          // (A Key goes over what a hand put, rather than the scale fall for that; never over what the layout places.)
          else if (over && !own.some(q => meets(q, keptAt ? { ...keptAt, w: kw, h: kh } : r, 8))) places.set(key.row, keptAt ? { ...keptAt, w: kw, h: kh } : r);
          else return null;
        }
        alongside = places.get(key.row);
      }
    }
    // The chart starts 24 pt under its title and date, as a document's text does under its heading, with the Key where
    // it goes with it, and what room the page has left is at its foot.
    for (const [id, p] of places) places.set(id, { x: p.x / s, y: p.y / s });
    return { s, dx, dy: boxes.length ? top / s - E.y : 0, shapes, places, placed, titled: !!key && !alongside && places.has(key.row) };
  };
  if (last) {
    const kept = at(last.page.scale, true);
    for (const [id, p] of last.places) if (kept.places.has(id)) kept.places.set(id, p);
    return { ...kept, dx: 0, dy: 0 };
  }
  // No larger than the chart alone would fit at.
  const most = !boxes.length ? 1 : Math.min((W - 2 * M + 0.5) / Math.max(1, E.w), (H - 2 * M + 0.5) / Math.max(1, E.h));
  // The Key at the chart's foot, as one block with it, where the chart is drawn as large so; or else beside the title.
  // A chart placed keeps its Key beside the title while it's clear of it there, so the Key moves to the foot only as the
  // chart takes its room, and back only as it gives it up.
  for (const s of [ceil, ...SCALES.filter(s => s < ceil - 1e-9)].filter(s => s <= most + 1e-9)) {
    const f = at(s) ?? (held ? at(s, false, false, true) : null);
    if (f) return f.titled && !placed ? at(s, false, true) ?? f : f;
  }
  // Too big for any of them: as large as the chart fits, and never larger than the view keeps it.
  return at(Math.max(0.005, Math.min(0.05, most, ceil)), true);
}

// ---- For the format bar and the inspector ----

// A record's output under a style: the style's pattern with the record's root label, a datatype for a value.
function outputPattern(style, t) {
  if (!t.args) return { kind: t.kind };
  const out = t.out && ('value' in t.out ? { field: t.out.field } : t.out);
  return { ...style.pattern, ...(out && { out }) };
}
// The styles that reach a mark: for each of the view's styles, the records in or at the mark that fit it,
// with their outputs. A box is reached through its object and every record in it; a line through its
// relation and the records at it.
// Kept for each scene, read in a state with its notes: the format bar and the canvas ask it of every mark drawn, each
// time the scene is drawn anew, so each output's caption is worked out once. A box's records are those in it, as
// Tree.dependents finds them, the relations at them, and what's in or at those, being no box's; a line's, its
// relation and everything in or at it.
const reaches = new WeakMap();
// A record's output under a style, kept with its tree, which stands while the record does, so it's keyed once.
const outputs = new WeakMap();
const outputIn = (s, t) => { const m = outputs.get(t) ?? outputs.set(t, new Map()).get(t); return m.get(s.key) ?? m.set(s.key, outputPattern(s, t)).get(s.key); };
function reach(wb, chart, view, scene, markId, state) {
  const m = scene.byId.get(markId);
  if (!m || (m.type !== 'box' && m.type !== 'line')) return [];
  // (What the scene was drawn from, where it says what's changed, whose records are in that too.)
  if (scene.since) state = scene.state;
  const N = wb.notes(chart);
  let kept = reaches.get(scene);
  if (!kept || kept.state !== state || kept.N !== N || kept.view !== view) reaches.set(scene, kept = { state, N, view, by: new Map(), captions: new Map() });
  if (kept.by.has(markId)) return kept.by.get(markId);
  const { entries } = Tree.index(state), within = id => {
    const all = new Set([id]), todo = [id];
    while (todo.length) for (const d of entries.get(todo.pop()) ?? []) if (!all.has(d)) { all.add(d); todo.push(d); }
    return all;
  };
  const ids = [...(m.type === 'box' ? within(m.record) : Tree.dependents(state, [m.record]))].map(id => [id, treeOf(state, id)]).filter(([, t]) => t);
  const captioned = output => { const k = key(output); return kept.captions.get(k) ?? kept.captions.set(k, captionOf(N, output, view)).get(k); };
  // A record fits only a pattern of its shape, or one leaving a location open.
  const out = [], byShape = groupBy(ids, ([, t]) => Tree.shapeOf(t));
  scene.styles.forEach((s, order) => {
    for (const [id, t] of Tree.isOpen(s.pattern) ? ids : byShape.get(Tree.shapeOf(s.pattern)) ?? []) {
      if (!Tree.narrower(t, s.pattern)) continue;
      const output = outputIn(s, t);
      if (!out.some(o => o.style === s.key && key(o.output) === key(output)))
        out.push({ style: s.key, order, record: id, output, caption: captioned(output), name: styleName(N, s.pattern) });
    }
  });
  kept.by.set(markId, out);
  return out;
}
// What a style is called: its pattern's name, or for a style by kind, Type.
const styleName = (N, p) => p.args ? N.name(p) : 'Type';
// A size or place on a page as it is on its sheet, the page drawn smaller by its scale: the number the slide
// has, which is the one shown; and back, for one typed.
const toSlide = (page, v) => v * (page?.scale ?? 1), fromSlide = (page, v) => v / (page?.scale ?? 1);
// What's amiss with a page, in words, each said once: a typed size it can't hold, by what it's the size of; a box off the
// sheet; a Key, a shape or a footer over a box, and on another paper a box over a box. `name(box)` is what to call a box
// (its short name), `paper` this paper's name. Boxes that overlap on the view's own page, or a shape sent behind them, were put so.
function says(scene, name, paper) {
  const p = scene.page, boxes = scene.marks.filter(m => m.type === 'box' && !m.revealed), called = b => name?.(b) ?? b.texts[0]?.text ?? 'A box', out = [], W = p.w, H = p.h;
  for (const f of p.short ?? []) out.push(`${f.what} print at ${+f.printed.toFixed(2)} pt${paper ? ` on ${paper}` : ''}: the chart doesn't fit at ${f.typed}`);
  for (const f of p.formless ?? []) { const b = scene.byId.get(f.record); if (b) out.push(`${called(b)} has no ${f.what}`); }
  // (A quarter inch all round is what a printer leaves unprinted.)
  const edge = fromSlide(p, 18 * PT);
  for (const b of boxes) if (b.x < -0.5 || b.y < -0.5 || b.x + b.w > W + 0.5 || b.y + b.h > H + 0.5) out.push(`${called(b)} runs off the page`);
    else if (b.x < edge || b.y < edge || b.x + b.w > W - edge || b.y + b.h > H - edge) out.push(`${called(b)} is nearer the edge than a printer prints`);
  const over =(a, b) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 1 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 1;
  const WHAT = { legend: 'The Key', picture: 'The picture', title: 'The title', date: 'The date', footer: 'The footer', number: 'The page number' };
  for (const m of scene.marks) if (m.type === 'shape' && !['line', 'group', 'frame'].includes(m.geometry) && (m.look?.Layer ?? 0) >= 0)
    for (const b of boxes) if (over(m, b)) out.push(`${WHAT[m.role] ?? WHAT[m.geometry] ?? `“${m.texts[0]?.text ?? 'A shape'}”`} overlaps ${called(b)}`);
  for (const k of scene.marks) if (k.geometry === 'legend') for (const f of scene.marks) if (f.type === 'frame' && !f.lone && over(k, f)) out.push(`The Key overlaps the ${f.caption.text} frame`);
  if (p.paper) boxes.forEach((a, i) => boxes.slice(i + 1).forEach(b => { if (over(a, b)) out.push(`${called(a)} overlaps ${called(b)}`); }));
  return out;
}

return {
  of, looks, steps: drawing, reflow, shapeOf, path, dash, measure, breakLines, bind, reach, groupsOf, outputPattern, captionOf, outputName, styleName, swatch, swatchOf, fontFamily,
  toSlide, fromSlide, says, textRect, DEFAULTS, GEOMETRIES, PAGES, PAPERS, PT, CORNER, FOOTER, NUMBER, lineHeight, baseline, fontClass, shadowOf, headOf, headSize, changeOutput, isChange, CHANGE_LOOKS, CHANGE_CAPTIONS, sinceOf,
  FONTS: Object.entries(FONTS).map(([name, [kind]]) => ({ name, kind })),
};
})();
