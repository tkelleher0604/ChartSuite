// Scene: what a view draws (dendra.md, Views). Its drawn marks and free shapes, every setting valued and
// known by the note that decided it, each text broken into lines, on the view's page. It reads the computed
// state and the view and nothing else, and the canvas, the PDF and PowerPoint each draw it and nothing else.
// The only page it touches is a canvas, to measure text. Units are CSS pixels, 96 to the inch, as the browser
// and X6 draw them; a Size or a Weight is in points, as Office gives them, each PT pixels.
//
// Scene.of(wb, chart, view, day, { state, computed?, reveal, keep, paper?, ahead? }) →
//   { chart, view, day, page: { size, w, h, scale, margin, sheet }, marks, byId, styles, legend, ms }
// `state` is the computed state's records, and `computed` the engine's whole result, for a free shape whose
// text is a formula. `reveal`, records the view hides, drawn for a while, and `keep`, a restyle's preview, keep the
// view as it was last drawn (see the layout). `paper`, a size in PAGES, draws the view on that paper in place of its
// own page (see the page). `ahead` lays out a state a change previewed would leave, so it's drawn at once when the
// change is made, and isn't kept as how the view was drawn: a redline is that scene, inked by the canvas, as Enter
// will draw it. `marks` are in drawing order: frames, lines, boxes, then
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
// on) says otherwise, its chart `scale` times its own size: the largest twentieth at which it fits, so that its
// points stay on PowerPoint's half points and change only in steps. The page is the sheet in the chart's own
// pixels, the sheet's size over the scale. Its furniture is the sheet's, at the sheet's size: its title and
// its date at its top left margin, the chart 24 pt under them, and its Key at the chart's foot where it sets least
// far down, or beside the title, top right, where that draws the chart larger; nothing in the Key larger than the names.
const PT = 4 / 3;
const PAGES = { slide: [1280, 720], letter: [1056, 816], legal: [1344, 816], tabloid: [1632, 1056], a4: [1123, 794], a3: [1587, 1123] };
const MARGIN = 48;
const SCALES = Array.from({ length: 20 }, (_, i) => (20 - i) / 20);
// A size on a page drawn at s, as the sheet's half point nearest it, or at or under it.
const half = (v, s, under = false) => Math.max(1, under ? Math.floor(v * s * 2 + 1e-9) : Math.round(v * s * 2)) / 2 / s;

// Each sort of mark's properties, and their values where no note gives one. Notes calls every label that
// isn't Name, Order and the like a format property, so a new one is only a word here, and its drawing. A box's
// and a line's text properties are what the texts in it take, where nothing sets their own: Strike is a line
// through each line of text; Spacing, how far apart its lines are, a multiple of single spacing (1.2 times its
// size), as PowerPoint's Line Spacing is. A box's Valign sets its text block at its top, middle or bottom; its
// Transparency (0–100) is its fill's, PowerPoint's; its Shadow is none, or soft, PowerPoint's outer shadow set
// below and to the right; and its Corner, a rounded rectangle's, is the radius of its corners as a percentage of
// its shorter side, up to 50, PowerPoint's adjustment of the shape.
const TEXT = { Font: 'Arial', Size: 10, Bold: false, Italic: false, Underline: false, Strike: false, Color: '#000000', Align: 'center', Spacing: 1, Format: 'value' };
const CORNER = 16.667;
const DEFAULTS = {
  box: { Shown: true, Shape: 'rect', Fill: '#ffffff', Transparency: 0, Outline: '#000000', Weight: 0.75, Dash: 'solid', Shadow: 'none', Corner: CORNER, Valign: 'middle',
    Frame: 'none', Layer: 0, ...TEXT },
  line: { Shown: false, Outline: '#000000', Weight: 0.75, Dash: 'solid', Arrow: 'none', Connector: 'elbow', Above: null, Layer: 0, ...TEXT, Size: 9 },
  text: { Shown: false, ...TEXT },
};
const TEXT_PROPS = Object.keys(TEXT);
const HAS = Object.fromEntries(Object.entries(DEFAULTS).map(([k, d]) => [k, new Set(Object.keys(d))]));
// What a swatch shows: the properties of a box or line that tell marks apart, a frame's kind, or a text's
// look. A frame's caption says on the chart what it is, so the legend leaves frames out.
const KEYED = { box: ['Shape', 'Fill', 'Transparency', 'Outline', 'Weight', 'Dash', 'Shadow', 'Corner'], line: ['Shown', 'Outline', 'Weight', 'Dash', 'Arrow'], frame: ['Frame'],
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

// ---- Geometry: PowerPoint's preset shapes, by plain names, as paths in a w × h frame ----

const GEOMETRIES = ['rect', 'rounded', 'oval', 'triangle', 'diamond', 'hexagon', 'octagon', 'parallelogram', 'trapezoid', 'pentagon', 'chevron', 'arrow', 'cylinder'];
function path(shape, w, h, corner = CORNER) {
  const s = Math.min(w, h), n = v => +v.toFixed(2);
  const poly = ps => `M${ps.map(([x, y]) => `${n(x)},${n(y)}`).join(' L')} Z`;
  switch (shape) {
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
};
const textRect = (shape, w, h, corner) => TEXT_RECT[shape]?.(w, h, corner) ?? { x: 0, top: 0, bottom: 0 };
const INSET = 9.6, PAD = 4.8, BASE = 7 * PT;
// A box's width where none is entered: about 100 pt, so that a chart's names wrap rather than its page
// widens; a triangle's a little more, its text sitting in its lower half.
const WIDTH = { box: 132, triangle: 176 };

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
const bind = text => String(text).replace(SUFFIX, (_, s) => `,\u00a0${s.replace(/ /g, '\u00a0')}`).replace(NUMERAL, '\u00a0');
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
function breakLines(text, t, width, balanced = true, hang = false) {
  const k = `${t.Italic ? 'i' : ''}${t.Bold ? 'b' : ''}${t.Size}|${t.Font}|${width}|${balanced}|${hang}|${text}`, em = hang ? t.Size * PT : 0;
  let ls = broken.get(k);
  if (!ls) {
    ls = [];
    for (const para of bind(text).split('\n')) {
      let split = false;
      const words = para.split(/ +/).flatMap(w => { const ps = apart(w, t, width - em); split ||= ps.filter(p => !p.endsWith(':')).length > 1; return ps; });
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
const linesOf = (it, width) => it.text ? breakLines(it.text, it.look, width, true, !!it.hangs && it.look.Align === 'left') : [];
// A dash as SVG and PDF draw it, for a line of weight w in points: its dashes and gaps, in pixels.
const dash = (d, w) => { const p = w * PT; return d === 'dashed' ? `${Math.max(4, p * 4)} ${Math.max(3, p * 3)}` : d === 'dotted' ? `${Math.max(1, p)} ${Math.max(2.5, p * 2)}` : null; };
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
// they broke.
function snap(it, s, under = false) {
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
  const k = JSON.stringify([w, wide, texts.map(it => [it.text, it.look.Font, it.look.Size, it.look.Bold, it.look.Italic, it.look.Spacing])]);
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
    const cap = Math.max((lines[0].length > 4 || lines.flat().some(l => l.split)) && w < wide.lines ? wide.lines : 0, h > w * 0.9 && w < wide.tall ? wide.tall : 0);
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
    const paras = it.text ? bind(it.text).split('\n').map(p => units(p, t, most)) : [];
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
function units(para, t, most) {
  const out = [];
  for (const word of para.split(/ +/).filter(Boolean)) apart(word, t, most).forEach((w, k) => {
    if (measure(w, t) <= most) return out.push({ text: w, bound: k > 0 });
    fill([w], t, most).forEach((l, j, ls) => out.push({ text: l.text, bound: k > 0 && j === 0, cut: j < ls.length - 1 }));
  });
  return out;
}

// A box's size: its width entered or its shape's own, `squeeze` times that on a paper narrower than its page,
// and as tall as its text needs, every line of it, broken to fit the shape where it sits (at a triangle's
// base, inside an oval). It widens before it grows tall: while its name takes more than four lines or a suffix
// comes off its word, by half at most where nobody sized it, and back to its size where its size is entered,
// on another paper; and while it's taller than it's wide (a triangle, than nine tenths of it), to twice its
// width at most, so that a long name never shrinks the whole chart. Triangles of one width are one size, the
// tallest any of them needs (see level).
function size(b, squeeze, at = null, grow = 1) {
  const shape = b.settings.Shape.value, own = b.pos?.w, base = (own ?? WIDTH[shape === 'triangle' ? 'triangle' : 'box'] * grow) * squeeze;
  const wide = { lines: own ?? base * 1.5, tall: base * 2 };
  let w = at ?? base, h;
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
      const lines = ((b.texts[0]?.lines.length ?? 0) > 4 || b.texts.some(it => it.lines.some(l => l.split))) && w < wide.lines;
      return Math.max(lines ? wide.lines : 0, h > w && w < wide.tall ? wide.tall : 0);
    };
    for (let cap; (cap = lay());) w = Math.min(cap, w + 12);
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
    const had = r => { const x = before?.get(r); return x && !changed.has(x.shape) ? (map.set(r, x), x) : undefined; };
    w = { view, shapes, map, get: r => map.get(r) ?? had(r), set: (r, x) => map.set(r, x) };
  }
  worked.delete(notesAre);
  worked.set(notesAre, w);
  if (worked.size > 12) worked.delete(worked.keys().next().value);
  return w;
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
  if (!r) rowsRead.set(rows, r = { notes: rows.filter(x => 'note' in x).map(x => x.id).join(), shapes: new Map() });
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
  const rows = wb.rows(chart), read = readRows(rows, view), notesAre = `${view}|${read.notes}`;
  const shapeRows = read.shapes.get(view);
  const preview = !!(opts.keep || opts.reveal?.length), drawnAs = `${chart}|${view}`;
  const said = new Map(shapeRows.map(r => [r.id, shapeText(r, opts.computed, day)]));
  const from = [opts.state, notesAre, shapeRows.map(r => r.id).join(), [...said.values()].join('\n'), day], whence = `${drawnAs}|${opts.paper ?? ''}`;
  if (!preview && !opts.looks) {
    // Or from a state that differs from this one only in records it neither draws nor styles (see unmoved).
    const ds = drawnFrom.get(whence) ?? [], alike = ds.filter(d => d.from.every((x, i) => i === 0 || x === from[i]));
    // An entry the view's free text may read, or a field shown beside another record, is never inert.
    const N0 = wb.notes(chart), fielded = [...N0.notes('Text'), ...N0.notes('Shown').filter(n => n.param)].some(n => n.view === view);
    const formatsOf = (recs, id) => { const t = treeOf(recs, id); return fielded && recs[id]?.at ? { Text: true } : t ? N0.formats(t, view) : {}; };
    const d = alike.find(d => d.from[0] === opts.state) ?? (alike[0] && unmoved(alike[0].scene, alike[0].from[0], opts.state, formatsOf) ? alike[0] : null);
    if (d) {
      if (d.laid && !opts.ahead) laidOut.set(drawnAs, d.laid);
      drawnFrom.set(whence, [{ ...d, from }, ...ds.filter(x => x !== d)].slice(0, 3));
      return d.scene;
    }
  }
  const state = opts.state;
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
      else if (f.Shown || located.has(id) || reveal.has(id)) addMark({ id, type: 'line', record: id, ends, cand: {} });
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
  const shownAlone = m => m.cand.Shown ? m.cand.Shown.value !== false : DEFAULTS[m.type].Shown || named(m);
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

  const settle = (m, defaults) => {
    m.settings = {};
    for (const [label, d] of Object.entries(defaults)) {
      const c = m.cand[label];
      m.settings[label] = c ? { value: c.value, note: c.note } : { value: d, note: null };
    }
  };
  const look = s => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v.value]));

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
    const r = state[m.record], t = look(m.settings), name = once(m.record, 'name', () => N.name(tree(m.record)));
    // `shownBy`, the note that shows it, where one does: what hiding it where it's shown takes back (see Fields).
    return { id: m.record, type: 'text', settings: m.settings, look: t, text: textOf(r, t.Format, name), computed: !!r.computed, shownBy: m.cand.Shown?.note ?? null,
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
  }
  // Their looks alone (Scene.looks): what the notes give each box and line drawn, before anything is laid out.
  if (opts.looks) {
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
      const f = N.formats(et, view), settings = {};
      for (const label of TEXT_PROPS) settings[label] = label !== 'Format' && f[label] ? { value: f[label].value, note: f[label].note } : b.settings[label];
      const item = { id: `blank:${O}|${edge}`, type: 'text', settings, look: look(settings), text: edge, blank: { at: O, edge }, computed: false, shownBy: win.note };
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
    const settings = {};
    for (const label of TEXT_PROPS) settings[label] = label !== 'Format' && label in v ? { value: v[label], note: c.note } : h.settings[label];
    return text ? [{ id: `text@${h.id}`, type: 'text', settings, look: look(settings), text, free: { note: c.note.note, text: v.text }, computed: false, shownBy: c.note }] : [];
  }
  for (const b of boxes) { blanksIn(b); b.texts = [...gather(b.texts), ...freeText(b)]; }
  // The key is of what the view draws: what's revealed for a while doesn't change it. While nothing is keyed, as on a
  // new chart's page, a Key isn't drawn, and the page is as it would be without it.
  const legendRows = legend(N, view, [...boxes, ...lines].filter(m => !m.revealed));
  const onPage = shapeRows.filter(r => r.geometry !== 'legend' || legendRows.length);

  // Lines: each from its Above side, the edge drawn on top (an owner's), to the other; the Above an edge
  // order gives, where no note says. Its label is its own text, then the texts drawn on it; a line revealed
  // has none, as what reveals it names it. A line that says its relation's name says it as the Key does, its
  // row's caption, so one relation is spelled one way on the page.
  const captioned = new Map(legendRows.flatMap(r => r.outputs.map(o => [key(o), r.caption])));
  const keyedBy = l => KEYED.line.map(k => l.settings[k].note).find(n => n && captioned.has(key(n.pattern)));
  for (const l of lines) {
    const r = state[l.record], t = tree(l.record), text = lineText(r, l.settings.Format.value, N.name(t)), keyed = isTag(r) && r.tag && text && keyedBy(l);
    [l.from, l.to] = endsOf(l.record, l.ends);
    l.ranks = l.settings.Above.value !== 'none';
    const own = { id: l.record, type: 'text', settings: l.settings, look: { ...look(l.settings), Align: 'left' },
      text: keyed ? captioned.get(key(keyed.pattern)) : text, computed: l.computed };
    l.texts = l.revealed ? [] : [own, ...l.texts, ...freeText(l)].filter(it => it.text);
    for (const it of l.texts) { it.look = { ...it.look, Align: 'left' }; it.lines = linesOf(it, 200); }
    labelOf(l, l.texts.length === 1 && l.texts[0] === own && !isField(r));
    // The layout and the routes read the relation a line draws, never its look, so restyling a line moves
    // nothing; lines of one look along one route are drawn as one (see below), which is drawing.
    l.trunk = once(l.record, 'relation', () => `${N.name(t)}|${Tree.shapeOf(t)}`);
    l.alike = ['Outline', 'Weight', 'Dash', 'Arrow'].map(k => l.settings[k].value).join('|');
    l.straight = l.settings.Connector.value === 'straight';
  }

  // Positions: entered ones win. A loose position, where a box was made on the chart before it was related,
  // gives way to the layout once a line that ranks it joins the box: it goes beside its relatives.
  const joined = id => lines.some(l => l.ends.includes(id) && l.ranks);
  const positions = new Map();
  for (const b of boxes) {
    const pos = N.position(tree(b.record), view);
    b.pos = pos && !(pos.loose && joined(b.id)) ? pos : null;
    b.entered = !!b.pos;
    if (b.pos) positions.set(b.id, b.pos);
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
  for (const f of frames.values()) {
    f.settings = { Frame: { value: f.kind, note: f.note } };
    const name = inFrame(frames, f).map(id => drawnBoxes.get(id)?.texts[0]?.look).filter(Boolean).sort((a, b) => b.Size - a.Size)[0] ?? TEXT;
    const t = { ...TEXT, Font: name.Font, Size: name.Size, Bold: true, Color: '#404040', Align: f.kind === 'bracket' ? 'center' : 'left' };
    f.caption = { id: f.id, type: 'text', look: t, text: f.text };
    delete f.text;
    f.caption.lines = breakLines(f.caption.text, t, 400);
    f.label = f.caption.lines.length * lineHeight(t);
    f.lone = f.kind !== 'bracket' && f.members.length === 1 && !f.frames.length;
  }

  // The layout: entered positions win; ELK places the rest, frames as clusters, ranked by the lines, and a
  // box placed among entered ones keeps clear of the boxes, lines and free shapes already there. Entered places
  // are the chart's own, which the page sets on it (see furnish), so a preview's, kept as drawn, are the page's
  // less its offset. A preview (records revealed, or a restyle) keeps the view as it was last drawn: its boxes,
  // its lines where their boxes stand, its page and its furniture; what it adds goes on the page, around
  // what's drawn.
  const sheet = pageOf(N, view, opts.paper);
  const last = preview && !opts.paper ? laidOut.get(drawnAs) ?? null : null;
  if (last) for (const [id, p] of positions) positions.set(id, { ...p, x: p.x + last.page.offset.x, y: p.y + last.page.offset.y });
  const placedBy = r => r.x == null || r.y == null, onPaper = !!opts.paper && sheet.size !== pageOf(N, view).size;
  // Boxes a style fills alike, one row of the Key, are a class: peers the layout sets in one tier where it can.
  // Where the Key has fewer than two such rows, the fill tells nothing apart, and nothing is.
  const rowOf = new Map(legendRows.flatMap(r => r.outputs.map(o => [key(o), r.key])));
  const classOf = new Map(boxes.map(b => { const n = b.settings.Fill.note; return [b.id, n && n.view === view && !idsIn(n.pattern).size ? rowOf.get(key(n.pattern)) ?? null : null]; }));
  if (new Set([...classOf.values()].filter(Boolean)).size < 2) classOf.clear();
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
  const roomFor = new Map();
  for (const l of lines) if (l.label && !l.revealed) for (const k of [`${l.from}|${l.to}`, `${l.to}|${l.from}`]) roomFor.set(k, Math.max(roomFor.get(k) ?? 0, l.label.w + 8 + (l.settings.Arrow.value === 'none' ? 0 : 10.7)));
  const beside = (a, b) => roomFor.get(`${a.id}|${b.id}`) ?? 0;
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
    for (const ts of groupBy(bs.filter(b => b.shape === 'triangle'), b => alone(b) ? b.id : `${Math.round(b.base)}|${b.texts[0]?.look.Size}`).values()) {
      const w = Math.max(...ts.map(b => b.w));
      for (const b of ts) if (b.w < w) size(b, squeeze, w, grow);
      level(ts);
    }
    return bs;
  }
  // What the layout reads: the boxes, the lines that rank them, and the frames.
  const ranked = bs => ({
    boxes: bs.map(b => ({ id: b.id, w: b.w, h: b.h, shape: b.shape, class: classOf.get(b.id) ?? null })),
    links: lines.filter(l => l.ranks).map(l => ({ from: l.from, to: l.to, trunk: l.trunk, names: !!l.label?.shared, room: roomFor.get(`${l.from}|${l.to}`) ?? 0 })),
    clusters: [...frames.values()].map(f => ({ id: f.id, parent: f.parent, members: f.members, top: f.label + 10 })),
  });
  function* lay(squeeze, grow = 1) {
    sizes(boxes, squeeze, grow);
    yield;
    const placed = Layout.arrange({
      keep: last?.at ?? null, ...ranked(boxes),
      lines: lines.map(l => ({ id: l.id, from: l.from, to: l.to, trunk: l.trunk, straight: l.straight })),
      obstacles: obstaclesOf(onPage, last?.page.offset),
      entered: squeeze === 1 ? positions : squeezed(positions, boxes, squeeze, pageSizes, beside, linked), page: { ...sheet, room }, bounds: last?.page ?? null,
    });
    for (const b of boxes) Object.assign(b, placed.get(b.id));
    yield;
    // What's placed on its own page stands where it was put, but for the room labels need beside it; a place the
    // layout gives makes room too for the lines that come down past what stands over their box.
    const given = b => squeeze === 1 && (b.entered || !!last?.at.has(b.id)), stood = b => !!last?.at.has(b.id);
    spread(boxes, beside, stood);
    // Boxes in a rank, their tops level, are one height: the tallest of them (see level). A preview keeps every
    // box as it stood, and what it adds is placed clear of them, and sized among themselves.
    const added = b => !!last && !last.at.has(b.id);
    for (const rank of groupBy(boxes.filter(b => b.shape !== 'triangle'), b => `${Math.round(b.y / 4)}|${added(b)}`).values()) level(rank);
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
    const off = last ? [] : lines.filter(l => l.around && l.placing.laned).map(l => l.id);
    if (off.length) {
      const astray = () => lines.filter(l => l.blocked || l.astray || l.strained).length, was = { ys: boxes.map(b => b.y), rs, around: lines.filter(l => l.around).length, astray: astray() };
      boxes.forEach((b, i) => { b.y = tops[i]; });
      frameBounds(frames, boxes);
      (rs = routes(boxes, lines, frames, stand, off)).forEach((r, i) => Object.assign(lines[i], r));
      for (let n = 0; n < 3 && deepen(boxes, lines); n++) {
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
    const laid = furnish({ sheet, boxes, lines, frames, shapes: onPage, said, legend: legendRows, last, placedBy });
    return { ...laid, around: lines.filter(l => l.around).length };
  }
  // A layout just laid, with its faults, and on another paper its lines bent that drop straight on the view's own page
  // (`straight`); and a layout laid again, as it was judged.
  let straight = null, largest = Infinity;
  const bent = () => straight ? lines.filter(l => straight.has(l.id) && l.points?.length > 2).length : 0;
  // A layout is judged once there's another to judge it against, while it's still the one laid; one alone needn't be.
  const judged = laid => laid.faults !== undefined ? laid : { ...laid, faults: faults(laid.s), bent: bent() }, again = (laid, as) => ({ ...laid, faults: as.faults, bent: as.bent });
  // Of two layouts, the better: the one with fewer faults, then the larger, up to the size its own page prints it at on
  // another paper (`largest`), then the one with fewer lines bent, then the one with fewer lines gone around what's drawn.
  const better = (a, b) => { const [p, q] = [a.s, b.s].map(s => Math.min(s, largest));
    return a.faults !== b.faults ? a.faults < b.faults : p !== q ? p > q : a.bent !== b.bent ? a.bent < b.bent : a.around < b.around; };
  yield;
  let at = yield* lay(1), grow = 1;
  // Boxes nobody sized are as wide as draws the chart largest, of their own width and a sixth and a third more:
  // where the chart is tall for its page, its names then take fewer lines. A width is laid out only where its rows
  // are drawn larger, roughly (see Layout.fit), than at every width before it; and of those laid out, the best.
  if (!last && boxes.some(b => !b.pos?.w)) {
    const rough = g => Math.min(1, Layout.fit({ ...ranked(sizes(boxes.map(b => ({ ...b, texts: b.texts.map(it => ({ ...it })) })), 1, g)), room }));
    let tried = 1, most = rough(1);
    for (const g of [7 / 6, 4 / 3]) {
      const r = rough(g);
      if (r <= most) continue;
      most = r;
      at = judged(at);
      const next = judged(yield* lay(1, tried = g));
      if (better(next, at)) [at, grow] = [next, g];
    }
    if (tried !== grow) at = again(yield* lay(1, grow), at);
  }
  pageSizes = new Map(boxes.map(b => [b.id, { w: b.w, h: b.h }]));
  // On another paper the page places the chart; on one narrower than its page, it's drawn narrower, its boxes
  // and their places closer, as far as that prints it larger, up to the size its own page prints it at, and
  // never so close that a line can't pass or a label has no place; and of those as large, the one with the fewest
  // lines bent that drop straight on its own page.
  if (onPaper && boxes.length) {
    const own = yield* drawing(wb, chart, view, day, { ...opts, paper: null });
    largest = own.page.scale;
    straight = new Set(own.marks.filter(m => m.type === 'line' && m.points?.length === 2).map(m => m.id));
    at = { ...judged(at), bent: bent() };
    let best = 1, tried = 1;
    for (const f of [0.95, 0.9, 0.85, 0.8, 0.75, 0.7]) {
      if (at.s >= largest && !at.faults && !at.bent) break;
      const next = judged(yield* lay(tried = f, grow));
      if (better(next, at)) [at, best] = [next, f];
    }
    if (tried !== best) at = again(yield* lay(best, grow), at);
  }
  const s = at.s;
  // The chart sits on its page where the page puts it, by its `offset`, which a place written from the page
  // takes away again.
  if (at.dx || at.dy) for (const m of [...boxes, ...frames.values(), ...lines]) move(m, at.dx, at.dy);
  const offset = last ? last.page.offset : { x: at.dx, y: at.dy };
  const page = { size: sheet.size, w: sheet.w / s, h: sheet.h / s, scale: s, margin: MARGIN / s, offset, sheet: { w: sheet.w, h: sheet.h } };

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
  // under its size, so it takes no more room than the layout made for it.
  for (const b of boxes) { b.texts.forEach(it => snap(it, s)); setText(b); }
  for (const l of lines) { l.texts.forEach(it => snap(it, s, true)); labelOf(l); }
  for (const f of frames.values()) { snap(f.caption, s); f.label = f.caption.lines.length * lineHeight(f.caption.look); caption(f); }
  if (!last) relabel(boxes, lines, frames, null, s);

  // Free shapes: the view's own, each with its own formats; the furniture where the page puts it, and those
  // placed by hand where the chart is, by its offset.
  const geo = new Map(boxes.map(b => [b.id, b]));
  const shapes = at.shapes;
  for (const m of shapes) { const p = at.places.get(m.row); if (p) Object.assign(m, { x: p.x, y: p.y }); else move(m, offset.x, offset.y); }
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
    at: new Map(boxes.map(b => [b.id, { x: b.x, y: b.y }])), boxes: new Map(boxes.map(b => [b.id, { x: b.x, y: b.y, w: b.w, h: b.h }])),
    frames: new Map([...frames.values()].map(f => [f.id, { x: f.x, y: f.y, w: f.w, h: f.h }])),
    routes: new Map(lines.map(l => [l.id, { from: l.from, to: l.to, points: l.points, labelAt: l.labelAt, down: l.down, landed: l.landed }])),
    page, places: at.places,
  } : null;
  if (laid && !opts.ahead) laidOut.set(drawnAs, laid);

  const layer = m => m.settings?.Layer?.value ?? m.look?.Layer ?? 0;
  const marksInOrder = [
    ...[...frames.values()].sort((a, b) => depthOf(frames, a) - depthOf(frames, b)),
    ...lines.filter(l => !l.merged).sort((a, b) => layer(a) - layer(b)),
    ...boxes.sort((a, b) => layer(a) - layer(b)),
    ...shapes.sort((a, b) => layer(a) - layer(b)),
  ];
  // A label said once for several lines, a trunk's or a frame's, is said for them all: the line that carries it keeps
  // their ids, its `kin`.
  for (const ls of groupBy(lines.filter(l => l.placing?.kin != null), l => l.placing.kin).values()) for (const l of ls) if (ls.length > 1 && l.labelAt) l.kin = ls.map(o => o.id);
  for (const m of [...marksInOrder, ...lines]) { delete m.cand; delete m.pos; delete m.base; delete m.placing; delete m.alike; if (m.type !== 'shape') delete m.ends; }
  const scene = { chart, view, day, page, marks: marksInOrder, byId, styles, legend: legendRows, ms: now() - started };
  if (!preview) drawnFrom.set(whence, [{ from, scene, laid }, ...drawnFrom.get(whence) ?? []].slice(0, 3));
  return scene;
}
// A free shape from a row not yet kept, as a scene would draw it: how big a new one will be.
function shapeOf(row, scene) {
  const s = scene.page.scale ?? 1, k = row.geometry === 'legend' && row.format?.Size == null ? keyAt(scene.marks.filter(m => m.type === 'box'), s) : 1;
  const m = freeShape({ shape: '·new', ...row }, row.text ?? '', 1 / s, k);
  if (m.geometry === 'legend') layoutLegend(m, scene.legend, 1 / s, k);
  return m;
}

// Boxes that go together share a height, the tallest of them; but a box whose text had to be hyphenated, or
// whose name runs past six lines, doesn't set it, and stands taller alone rather than stretch the rest. A
// triangle set taller than its own text needs is set again for the height it has (see pyramid), in the fewest
// lines.
const alone = b => b.texts.some(it => it.lines.some(l => l.cut)) || b.texts[0]?.lines.length > 6;
function level(ms) {
  const h = Math.max(0, ...ms.filter(b => !alone(b)).map(b => b.h));
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
    const done = [...new Set(bandsOf(b).flatMap(k => bands.get(k) ?? []))].filter(a => beside(a, b)).sort((a, c) => placed.get(a) - placed.get(c));
    for (let moved = true; moved;) {
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
    for (const c of rank) {
      const fc = chain.get(c.id) ?? [], [x0, x1] = c.shape === 'triangle' ? [c.x + c.w / 4, c.x + c.w * 3 / 4] : [c.x, c.x + c.w];
      const near = new Set(cols(x0, x1).flatMap(k => columns.get(k) ?? []));
      for (const l of ups.get(c.id) ?? []) if (over.has(l.from)) near.add(over.get(l.from));
      for (const b of near) {
        const down = joined.has(`${b.id}>${c.id}`) && Math.min(b.y + b.h, c.y + c.h) - Math.max(b.y, c.y) <= Math.min(b.h, c.h) / 2;
        if ((x0 >= b.x + b.w || b.x >= x1) && !down) continue;
        const fb = chain.get(b.id) ?? [];
        const room = fb.filter(f => !fc.includes(f)).reduce((sum, f) => sum + below(f), 0) + fc.filter(f => !fb.includes(f)).reduce((sum, f) => sum + above(f), 0);
        d = Math.max(d, b.y + b.h + room + (!room && ups.has(c.id) ? 40 : 16) - c.y);
      }
    }
    if (d > 0.5) for (const c of rank) c.y += d;
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
  if (b.shape !== 'triangle') b.column = { x: (b.w - width) / 2, width };
  let y = b.shape === 'triangle' ? b.h - BASE - tb : valigned(b.settings?.Valign?.value, r.top, b.h - r.bottom, tb, INSET);
  for (const it of b.texts) y = stack(it, b.column.x, b.column.width, y);
}
// A line's label: its texts stacked from its top left, as wide as the widest line. It's `shared` where it's
// the line's own name alone, which a trunk's lines can say once.
function labelOf(l, shared = l.label?.shared ?? false) {
  let y = 0;
  for (const it of l.texts) y = stack(it, 0, 0, y);
  const lastLine = l.texts.at(-1)?.lines.at(-1);
  l.label = l.texts.length ? { w: widest(l.texts), h: y, base: lastLine?.y ?? y, text: l.texts.map(it => it.text).join('\n'), shared } : null;
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
function routes(boxes, lines, frames = new Map(), stand = true, aside = []) {
  const copies = lines.map(l => ({ id: l.id, from: l.from, to: l.to, trunk: l.trunk, straight: l.straight, label: l.label, arrow: l.settings?.Arrow?.value }));
  const fs = [...frames.values()].map(f => ({ id: f.id, x: f.x, y: f.y, w: f.w, h: f.h, members: inFrame(frames, f), depth: depthOf(frames, f) }));
  Layout.route(new Map(boxes.map(b => [b.id, b])), copies, { frames: fs, avoid: captions(frames), stand, aside });
  return copies.map(c => ({ points: c.points, labelAt: c.labelAt, down: c.down, landed: c.landed, around: c.around, astray: c.astray, strained: c.strained, blocked: c.blocked, crowded: c.crowded,
    placing: { quiet: c.quiet, lane: c.lane, apex: c.apex, crowd: c.crowd, kin: c.kin, lack: c.lack, laned: c.laned, size: c.label && { w: c.label.w, h: c.label.h } } }));
}
// Where the lanes in a gap between ranks need more room than the gap leaves them (Layout.route's `lack`: a lane
// each, and under the lowest the room their labels take), the boxes from the gap's bottom down move down as far
// as that needs: each gap once, from the top, less what deepening one over it has given it. So a label always
// has a place on its own line, as the layout promises. → whether anything moved.
function deepen(boxes, lines) {
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
// out; so lines drawn as one stay one. What it adds is routed around what's drawn, its labels clear of the rest.
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
  const segs = kept.flatMap(l => l.points.slice(1).map((p, i) => [l.points[i], p]));
  for (const l of added) {
    const way = { avoid: [...labels, ...cs], segs, page: last.page }, ps = Layout.around(geo, l.from, l.to, way) ?? Layout.around(geo, l.from, l.to, { ...way, strict: false });
    if (ps) Object.assign(l, { points: ps, down: ps.at(-1)[1] > ps[0][1] + 1, landed: undefined });
  }
  const copies = lines.map(l => ({ id: l.id, from: l.from, to: l.to, points: l.points, label: l.label, arrow: l.settings.Arrow.value, down: l.down }));
  const mine = copies.filter((c, i) => added.includes(lines[i]) && c.label);
  Layout.labels(geo, mine, copies, labels, cs, false, unitAt(last.page.scale));
  for (const c of mine) lines[copies.indexOf(c)].labelAt = c.labelAt;
}

// Where a solid line runs across another, upright over level, the level one is broken 3 pt either side of
// the crossing, as Visio's line jumps are, so that no crossing reads as a junction: its `runs`, the pieces
// it's drawn in, `gap` either side of each crossing. Lines revealed for a while neither break nor are broken.
function jumps(lines, gap) {
  const solid = lines.filter(l => !l.merged && !l.revealed && l.settings.Dash.value === 'solid' && !none(l.settings.Outline.value) && l.points?.length > 1);
  const legs = l => l.points.slice(1).map((p, i) => [l.points[i], p]);
  const ups = solid.flatMap(l => legs(l).filter(([a, b]) => Math.abs(a[0] - b[0]) < 0.5).map(([a, b]) => ({ l, x: a[0], y0: Math.min(a[1], b[1]), y1: Math.max(a[1], b[1]) })));
  for (const l of solid) {
    delete l.runs;
    const cuts = legs(l).map(([a, b]) => {
      if (Math.abs(a[1] - b[1]) >= 0.5) return [];
      const y = a[1], x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]);
      return ups.filter(u => u.l !== l && u.x > x0 + gap && u.x < x1 - gap && y > u.y0 + gap && y < u.y1 - gap).map(u => u.x);
    });
    if (!cuts.some(c => c.length)) continue;
    const runs = [[l.points[0]]];
    legs(l).forEach(([a, b], i) => {
      const dir = Math.sign(b[0] - a[0]), gaps = [];
      for (const x of [...cuts[i]].sort((p, q) => (p - q) * dir)) {
        const g = gaps.at(-1);
        if (g && Math.abs(x - g[1]) < 2 * gap) g[1] = x; else gaps.push([x, x]);
      }
      for (const [p, q] of gaps) { runs.at(-1).push([p - dir * gap, a[1]]); runs.push([[q + dir * gap, a[1]]]); }
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
  for (const f of frames.values()) fit(f);
  const columns = [];
  for (const f of [...frames.values()].filter(f => f.kind !== 'bracket' && !f.lone).sort((a, b) => a.x - b.x)) {
    const c = columns.find(c => c[0].parent === f.parent && f.x - c[0].x <= 24);
    if (c) c.push(f); else columns.push([f]);
  }
  for (const column of columns.filter(c => c.length > 1)) {
    const left = Math.min(...column.map(f => f.x)), right = Math.max(...column.map(f => f.x + f.w));
    for (const f of column) {
      const mine = new Set(inFrame(frames, f));
      if (!boxes.some(b => !mine.has(b.id) && !b.revealed && b.x < right && b.x + b.w > left && b.y < f.y + f.h && b.y + b.h > f.y)) Object.assign(f, { x: left, w: right - left });
    }
  }
}
// A frame's caption in it: at its top left, inside it; a bracket's over its middle; a lone frame's at its top.
function caption(f) {
  const bracket = f.kind === 'bracket';
  stack(f.caption, bracket || f.lone ? 0 : 6, bracket ? f.w : 0, bracket || f.lone ? 0 : 4);
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
  N.styles(view).forEach((s, order) => {
    const looks = new Map(), keyed = s.outputs.filter(o => Object.keys(o.formats).some(k => k !== 'Shown')), name = styleName(N, s.pattern);
    const alone = keyed.length === 1 && same(outputName(N, keyed[0].pattern), name) && same(own(keyed[0].pattern) ?? name, name);
    for (const o of keyed) {
      if (only && !only.has(key(o.pattern))) continue;
      const sw = swatchOf(o.pattern, o.formats), off = o.formats.Shown === false;
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

// ---- Free shapes ----

// A free shape, from its row and its text as worked out: its geometry, place, formats and text. Its sizes are
// the sheet's where its row doesn't give them, `u` pixels of the page to one of the sheet: a text box's 12 pt,
// a title's 20, a date's 11 and a Key's 8 are those on the slide, however much the chart is drawn smaller; a Key's, `k` times that.
// A size its row gives is the page's, as the format bar writes it; a weight is always the sheet's (see the scene).
const SHAPE_DEFAULTS = { Fill: '#ffffff', Transparency: 0, Outline: '#000000', Weight: 0.75, Dash: 'solid', Shadow: 'none', Corner: CORNER, Valign: 'middle', Arrow: 'none', Layer: 0, ...TEXT };
const TEXTBOX = { Fill: 'none', Outline: 'none', Align: 'left', Size: 12, Valign: 'top' };
// The page's own texts: its title, and its date.
const ROLES = { title: { Size: 20, Bold: true }, date: { Size: 11, Color: '#595959' } };
function freeShape(row, text, u = 1, k = 1) {
  const { id, shape, format = {} } = row;
  const base = { ...SHAPE_DEFAULTS, ...(row.geometry === 'text' && TEXTBOX), ...ROLES[row.role], ...(row.geometry === 'legend' && { Size: 8 * k, Outline: '#7f7f7f', Weight: 0.5, Align: 'left' }),
    ...(row.geometry === 'frame' && { Fill: 'none', Outline: '#595959', Dash: 'dashed', Size: 9, Italic: true, Align: 'left', Valign: 'top' }),
    ...(row.geometry === 'line' && { Arrow: 'none' }) };
  const t = { ...base, Size: base.Size * u, ...format, Weight: (format.Weight ?? base.Weight) * u };
  t.Size = half(t.Size, 1 / u);
  const m = { id: shape, type: 'shape', row: id, geometry: row.geometry ?? 'rect', x: row.x ?? 0, y: row.y ?? 0, w: row.w ?? 200 * u, h: row.h ?? 52 * u,
    look: t, settings: Object.fromEntries(Object.entries(t).map(([k, v]) => [k, { value: v, note: null }])), texts: [], ...(row.role && { role: row.role }) };
  if (m.geometry === 'line') {
    m.points = (row.points ?? [[m.x, m.y], [m.x + m.w, m.y]]).map(p => [...p]);
    if (row.ends?.some(Boolean)) m.ends = row.ends;
    Object.assign(m, bounds(m.points.map(([x, y]) => ({ x, y, w: 0, h: 0 }))));
  }
  if (m.geometry === 'picture') m.src = row.src;
  if (m.geometry === 'group') m.members = row.members ?? [];
  if (m.geometry === 'legend') Object.assign(m, { title: row.title ?? 'Key', columns: row.columns ?? 1, hide: row.hide ?? [], captions: row.captions ?? {}, auto: row.w == null });
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
    stack(it, (m.w - avail) / 2, avail, m.geometry === 'frame' && t.Valign === 'top' ? 5 * u : valigned(t.Valign, r.top, m.h - r.bottom, tb, 4.8 * u));
    m.texts.push(it);
    m.column = { x: (m.w - avail) / 2, width: avail };
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
function layoutLegend(m, rows, sheet = 1, k = 1) {
  const t = m.look, u = sheet * k, pad = 12 * u, sw = 30 * u, gap = 8 * u, lh = lineHeight(t);
  rows = rows.map(r => ({ ...r, caption: m.captions[r.key] ?? r.caption, swatch: { ...r.swatch, Weight: r.swatch.Weight * sheet } }));
  m.all = rows.map(r => ({ key: r.key, style: r.style, outputs: r.outputs, swatch: r.swatch, caption: r.caption, shown: !m.hide.includes(r.key) }));
  const shown = rows.filter(r => !m.hide.includes(r.key));
  if (m.auto) m.w = Math.ceil(m.columns * (sw + gap + Math.min(160 * u, Math.max(40 * u, ...shown.map(r => measure(r.caption, t)))) + 16 * u) + 2 * pad);
  const colW = (m.w - 2 * pad) / m.columns;
  const title = m.title ? { id: `${m.id}:title`, type: 'text', look: { ...t, Bold: true, Align: 'left' }, text: m.title } : null;
  let y = pad;
  if (title) { title.lines = breakLines(title.text, title.look, m.w - 2 * pad); y = stack(title, pad, m.w - 2 * pad, y) + 4 * u; }
  const perCol = Math.ceil(shown.length / m.columns);
  const colTops = [y];
  m.rows = shown.map((r, i) => {
    const col = Math.floor(i / perCol);
    if (i % perCol === 0) y = colTops[0];
    // A caption stops 12 pt short of the next column.
    const x = pad + col * colW, caption = { id: `${m.id}:${r.key}`, type: 'text', look: { ...t, Align: 'left' }, text: r.caption, column: { x: x + sw + gap, width: colW - sw - gap - 16 * u } };
    caption.lines = breakLines(r.caption, caption.look, caption.column.width);
    const h = Math.max(lh, caption.lines.length * lh);
    stack(caption, caption.column.x, caption.column.width, y + (h - caption.lines.length * lh) / 2);
    const row = { key: r.key, style: r.style, outputs: r.outputs, swatch: r.swatch, x, y, w: colW, h, sw: { x, y: y + h / 2 - 7 * u, w: sw, h: 14 * u }, caption };
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
const keyAt = (boxes, s) => Math.min(1, ...boxes.filter(b => b.texts?.[0]?.look).map(b => half(b.texts[0].look.Size, s) * s / 8));
// A view's sheet: its Page note at the View object, a named size or { w, h }; a slide where none says. On a
// paper, that paper's size, turned as the view's own is.
function pageOf(N, view, paper) {
  const v = N.resolve('Page', { id: view, kind: 'View' })?.value ?? 'slide';
  let [w, h] = typeof v === 'object' ? [v.w, v.h] : PAGES[v] ?? PAGES.slide, size = typeof v === 'object' ? 'custom' : v in PAGES ? v : 'slide';
  if (PAGES[paper] && paper !== size) { const [a, b] = PAGES[paper], [L, S] = [Math.max(a, b), Math.min(a, b)]; [w, h] = w >= h ? [L, S] : [S, L]; size = paper; }
  return { size, w, h, margin: MARGIN };
}
// What a box placed among entered ones keeps clear of: the free shapes placed by hand, which are the chart's
// as its boxes are (see furnish); in a preview, moved `by` the page's offset, as its boxes are.
const obstaclesOf = (rows, by = { x: 0, y: 0 }) => rows.filter(r => r.x != null && r.y != null && !['line', 'group'].includes(r.geometry))
  .map(r => ({ x: r.x + by.x, y: r.y + by.y, w: r.w ?? 200, h: Math.max(r.h ?? 52, r.geometry === 'legend' ? 120 : 0) }));
// The page's scale and its furniture's places, and where it sets the chart: across its middle, 24 pt under the
// date, whether its boxes were placed by hand or not, so that as the chart changes only the white space moves.
// What's placed by hand, boxes and free shapes alike, is placed in the chart's own terms; the page adds `dx`
// and `dy` to set it there. The scale is the largest twentieth at which the chart fits the sheet within its
// margins, with the Key beside the title, clear of the title and the date by 24 pt and of the chart by 16; or
// beside the title with the chart starting 24 pt under it; or else at the chart's foot, 24 pt under what's over it
// there and 16 pt beside what isn't, where that sets it least far down, right-aligned to the chart where that's as
// high; failing all of them, what fits the chart. The Key beside the title
// takes the room there, its captions wrapping. A preview keeps the page as it was. → { s, dx, dy, shapes,
// places: rowId → { x, y } }, in the page's pixels.
function furnish({ sheet, boxes, lines, frames, shapes: rows, said, legend: legendRows, last, placedBy }) {
  const W = sheet.w, H = sheet.h, M = MARGIN;
  // What the chart draws, each as a rect.
  const rects = [...boxes, ...[...frames.values()].map(f => f.lone ? { x: f.x, y: f.y, w: Math.max(f.w, widest([f.caption])), h: f.h } : f)].map(m => ({ x: m.x, y: m.y, w: m.w, h: m.h }));
  for (const l of lines) if (!l.merged && l.points) {
    l.points.slice(1).forEach((p, i) => { const q = l.points[i]; rects.push({ x: Math.min(p[0], q[0]), y: Math.min(p[1], q[1]), w: Math.abs(p[0] - q[0]), h: Math.abs(p[1] - q[1]) }); });
    if (l.labelAt && l.label) rects.push({ x: l.labelAt.x, y: l.labelAt.y, w: l.label.w, h: l.label.h });
  }
  const meets = (a, b, pad = 0) => a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;
  const fits = r => r.x >= M - 0.5 && r.y >= M - 0.5 && r.x + r.w <= W - M + 0.5 && r.y + r.h <= H - M + 0.5;
  const at = (s, force, footed = false) => {
    // (The Key, as wide as `w` where that's given, set no larger than the names it explains: see keyAt.)
    const u = 1 / s, k = r => r.geometry === 'legend' && r.format?.Size == null ? keyAt(boxes, s) : 1;
    const keyed = (r, w) => { const m = freeShape(w == null ? r : { ...r, w }, said.get(r.id), u, k(r)); layoutLegend(m, legendRows, u, k(r)); return m; };
    const shapes = rows.map(r => r.geometry === 'legend' ? keyed(r) : freeShape(r, said.get(r.id), u)), places = new Map();
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
    let top = title || date ? y - PAD + 32 : M, alongside = null;
    // The chart, with what's placed by hand, set across the middle with its top at `top`: as rects on the sheet.
    const drawn = [...rects, ...shapes.filter(m => !byPage(m) && m.geometry !== 'group').map(m => ({ x: m.x, y: m.y, w: m.w, h: m.h }))], E = bounds(drawn);
    let dx = boxes.length ? (W - E.w * s) / 2 / s - E.x : 0;
    const set = t => drawn.map(r => ({ x: (r.x + dx) * s, y: (r.y + t / s - E.y) * s, w: r.w * s, h: r.h * s }));
    const R = t => ({ x: (E.x + dx) * s, y: t, w: E.w * s, h: E.h * s });
    if (!force && boxes.length && !fits(R(top))) return null;
    if (key) {
      // Beside the title, its captions wrapping to the room there, where the chart is clear of it, moved toward
      // the left as far as it must be, or can start under it; unless it goes at the chart's foot (`footed`).
      const room = W - M - 32 - Math.max(M, ...[title, date].filter(Boolean).map(m => M - INSET + ((m.column?.x ?? 0) + widest(m.texts)) * s));
      let side = key;
      if (key.auto && key.w * s > room && room >= key.columns * (30 + 8 + 80 + 16) + 24) {
        side = keyed(rows.find(r => r.id === key.row), room * u);
      }
      const r = { x: W - M - side.w * s, y: M, w: side.w * s, h: side.h * s };
      if (!footed && r.w <= room + 0.5 && fits(r)) {
        const under = Math.max(top, r.y + r.h + 32), by = Math.max(0, ...set(top).filter(q => q.y < r.y + r.h + 21).map(q => q.x + q.w + 21 - r.x));
        const left = R(top).x - by >= M - 0.5 ? by / s : 0;
        dx -= left;
        if (!set(top).some(q => meets(q, r, 21))) places.set(key.row, r);
        else {
          dx += left;
          if (fits(R(under)) || (force && boxes.length)) { places.set(key.row, r); top = under; }
        }
        if (places.has(key.row)) shapes[shapes.indexOf(key)] = key = side;
      }
      if (!places.has(key.row)) {
        // Or else at the chart's foot: 24 pt under what's over it there, and 16 pt beside what isn't, where that sets it
        // least far down, right-aligned to the chart where that's as high, its captions wrapping to a narrower Key where
        // that's what lets it fit; or 24 pt beside it, the chart moved left as far as that needs.
        const c = R(top), row = rows.find(r => r.id === key.row), least = key.columns * (30 + 8 + 80 + 16) + 24, chart = set(top);
        const underOf = k => {
          const kw = k.w * s, kh = k.h * s, x0 = Math.max(M, c.x), x1 = Math.max(x0, c.x + c.w - kw);
          const xs = [x1, x0, ...chart.flatMap(q => [q.x + q.w + 21, q.x - 21 - kw])].filter(x => x >= x0 - 0.01 && x <= x1 + 0.01);
          return xs.map(x => ({ x, y: Math.max(c.y, ...chart.filter(q => q.x < x + kw + 21 && q.x + q.w + 21 > x).map(q => q.y + q.h)) + 32, w: kw, h: kh }))
            .reduce((a, b) => b.y < a.y - 0.5 || (b.y < a.y + 0.5 && b.x > a.x) ? b : a);
        };
        let under = underOf(key);
        for (let w = key.w * s - 8; key.auto && !fits(under) && w >= least; w -= 8) {
          const narrow = keyed(row, w * u), r = underOf(narrow);
          if (fits(r)) { shapes[shapes.indexOf(key)] = key = narrow; under = r; }
        }
        const kw = key.w * s, kh = key.h * s, by = Math.max(0, c.x + c.w + 32 + kw - (W - M)), beside = { x: c.x - by + c.w + 32, y: c.y + c.h - kh, w: kw, h: kh };
        if (fits(under) || force) places.set(key.row, under);
        else if (kh <= c.h && c.x - by >= M - 0.5 && fits(beside)) { dx -= by / s; places.set(key.row, beside); }
        else return null;
        alongside = places.get(key.row);
      }
    }
    // The chart starts 24 pt under its title and date, as a document's text does under its heading, with the Key where
    // it goes with it, and what room the page has left is at its foot.
    for (const [id, p] of places) places.set(id, { x: p.x / s, y: p.y / s });
    return { s, dx, dy: boxes.length ? top / s - E.y : 0, shapes, places, titled: !!key && !alongside && places.has(key.row) };
  };
  if (last) {
    const kept = at(last.page.scale, true);
    for (const [id, p] of last.places) if (kept.places.has(id)) kept.places.set(id, p);
    return { ...kept, dx: 0, dy: 0 };
  }
  // No larger than the chart alone would fit at.
  const E = bounds(rects), most = !boxes.length ? 1 : Math.min((W - 2 * M + 0.5) / Math.max(1, E.w), (H - 2 * M + 0.5) / Math.max(1, E.h));
  // The Key at the chart's foot, as one block with it, where the chart is drawn as large so; or else beside the title.
  for (const s of SCALES.filter(s => s <= most + 1e-9)) { const f = at(s); if (f) return f.titled ? at(s, false, true) ?? f : f; }
  // Too big for any of them: as large as the chart fits.
  return at(Math.max(0.005, Math.min(0.05, most)), true);
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
  const out = [];
  scene.styles.forEach((s, order) => {
    const shape = Tree.shapeOf(s.pattern);
    for (const [id, t] of ids) {
      // A record fits only a pattern of its shape.
      if (Tree.shapeOf(t) !== shape || !Tree.narrower(t, s.pattern)) continue;
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
// The page's size for one picked in the slide's points. Held at the chart's scale `s`, as v over s, it prints as
// picked wherever the chart keeps its scale with it. Where the box needs the chart drawn smaller, of the sizes
// that would print v at a twentieth from s (or, for a smaller pick, from the scale it then has) down to the scale
// holding it draws the chart at, the one that prints nearest v at no smaller a scale than that, the larger scale
// where two are as near; and then of the sizes that print as near, at a twentieth from s down, the one at the
// largest scale that keeps it, the least of them first, to the hundredth the format bar writes, as the half point it
// prints at takes in a quarter of a point under: so a pick prints as picked wherever the chart can keep a scale for it, as near as
// the page allows otherwise, and never shrinks the chart more than printing as near needs. The scale isn't
// monotone in the size, as a triangle's lines break anew, so this looks rather than iterates. `scaleAt(t)` is the
// chart's scale with the page's size t.
function toPage(v, s, scaleAt) {
  const held = scaleAt(v / s), printed = (t, at) => half(t, at) * at;
  let best = { t: v / s, off: Math.abs(v * held / s - v), at: held };
  for (const k of SCALES) {
    if (best.off < 1e-9) break;
    if (k > Math.max(s, held) + 1e-9 || k < held - 1e-9 || Math.abs(k - s) < 1e-9) continue;
    const t = v / k, at = scaleAt(t), off = Math.abs(t * at - v);
    if (at >= held - 1e-9 && (off < best.off - 1e-9 || (Math.abs(off - best.off) < 1e-9 && at > best.at))) best = { t, off, at };
  }
  const p = printed(best.t, best.at);
  for (const k of SCALES) {
    if (k > Math.max(s, held) + 1e-9 || k <= best.at + 1e-9) continue;
    const least = Math.ceil((p - 0.25) / k * 100 - 1e-6) / 100;
    for (const t of [...(printed(least, k) === p ? [least] : []), p / k]) if (scaleAt(t) >= k - 1e-9) return t;
  }
  return best.t;
}

return {
  of, looks, steps: drawing, reflow, shapeOf, path, dash, measure, breakLines, bind, reach, groupsOf, outputPattern, captionOf, outputName, styleName, swatch, swatchOf, fontFamily,
  toSlide, fromSlide, toPage, DEFAULTS, GEOMETRIES, PAGES, PT, CORNER, lineHeight, baseline, fontClass,
  FONTS: Object.entries(FONTS).map(([name, [kind]]) => ({ name, kind })),
};
})();
