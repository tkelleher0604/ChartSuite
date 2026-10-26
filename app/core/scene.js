// Scene: what a view draws (dendra.md, Views). Its drawn marks and free shapes, every setting valued and
// known by the note that decided it, each text broken into lines, on the view's page. It reads the computed
// state and the view and nothing else, and the canvas, the PDF and PowerPoint each draw it and nothing else.
// The only page it touches is a canvas, to measure text. Units are CSS pixels, 96 to the inch, as the browser
// and X6 draw them; a Size or a Weight is in points, as Office gives them, each PT pixels.
//
// Scene.of(wb, chart, view, day, { state, computed?, reveal, redline, paper?, ahead? }) →
//   { chart, view, day, page: { size, w, h, scale, margin, sheet }, marks, byId, styles, legend, ms }
// `state` is the computed state's records, and `computed` the engine's whole result, for a free shape whose
// text is a formula. `paper`, a size in PAGES, draws the view on that paper in place of its own page (see the
// page). `ahead` lays out a state a change previewed would leave, so it's drawn at once when the change is
// made, and isn't kept as how the view was drawn. `marks` are in drawing order: frames, lines, boxes, then
// free shapes, each by its Layer.
// A box, line or frame has `settings`: { [property]: { value, note } }, the note null where nothing in the
// chart says. A box or line has `texts`, each a record's text with its own settings and its `lines`, placed
// from the mark's top left (a line's from its label's); a box or shape with text, the `column` its lines
// are broken to. A line another crosses has `runs`, the pieces it's drawn in (see jumps). A free shape has its
// row's formats, with no notes, and a free line the boxes it's glued to; one whose row's `role` is title or
// date is the page's own, as the Key is (see the page and free shapes).
const Scene = (() => {
const { treeOf, idsIn, key, bare, isObject, isField, isTag, isChoice, argsOf, same } = Tree;

// The page. A view is drawn on a sheet, a 13.33 × 7.5 in slide unless its Page note (or a paper it's exported
// on) says otherwise, its chart `scale` times its own size: the largest twentieth at which it fits, so that its
// points stay on PowerPoint's half points and change only in steps. The page is the sheet in the chart's own
// pixels, the sheet's size over the scale. Its furniture is the sheet's, at the sheet's size: its title and
// its date at its top left margin, and its Key beside the title, top right, where it fits there, or else 24 pt
// under the chart, right-aligned to it.
const PT = 4 / 3;
const PAGES = { slide: [1280, 720], letter: [1056, 816], legal: [1344, 816], tabloid: [1632, 1056], a4: [1123, 794], a3: [1587, 1123] };
const MARGIN = 48;
const SCALES = Array.from({ length: 20 }, (_, i) => (20 - i) / 20);
// A size on a page drawn at s, as the sheet's half point nearest it.
const half = (v, s) => Math.max(1, Math.round(v * s * 2)) / 2 / s;

// Each sort of mark's properties, and their values where no note gives one. Notes calls every label that
// isn't Name, Order and the like a format property, so a new one is only a word here. A box's and a
// line's text properties are what the texts in it take, where nothing sets their own.
const TEXT = { Font: 'Arial', Size: 10, Bold: false, Italic: false, Underline: false, Color: '#000000', Align: 'center', Format: 'value' };
const DEFAULTS = {
  box: { Shown: true, Shape: 'rect', Fill: '#ffffff', Outline: '#000000', Weight: 0.75, Dash: 'solid', Frame: 'none', Layer: 0, ...TEXT },
  line: { Shown: false, Outline: '#000000', Weight: 0.75, Dash: 'solid', Arrow: 'none', Connector: 'elbow', Above: null, Layer: 0, ...TEXT, Size: 9 },
  text: { Shown: false, ...TEXT },
};
const TEXT_PROPS = Object.keys(TEXT);
const HAS = Object.fromEntries(Object.entries(DEFAULTS).map(([k, d]) => [k, new Set(Object.keys(d))]));
// What a swatch shows: the properties of a box or line that tell marks apart, a frame's kind, or a text's
// look. A frame's caption says on the chart what it is, so the legend leaves frames out.
const KEYED = { box: ['Shape', 'Fill', 'Outline', 'Weight', 'Dash'], line: ['Shown', 'Outline', 'Weight', 'Dash', 'Arrow'], frame: ['Frame'],
  text: ['Font', 'Size', 'Bold', 'Italic', 'Underline', 'Color'] };
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
const FONTS = { Arial: "Arial, 'Liberation Sans', Helvetica, sans-serif", Calibri: 'Calibri, Carlito, sans-serif',
  'Times New Roman': "'Times New Roman', 'Liberation Serif', Times, serif", Georgia: 'Georgia, Gelasio, serif' };
const fontFamily = f => FONTS[f] ?? `'${f}', sans-serif`;
const groupBy = (list, f) => list.reduce((m, x) => { const k = f(x); (m.get(k) ?? m.set(k, []).get(k)).push(x); return m; }, new Map());
const none = c => !c || c === 'none';

// ---- Geometry: PowerPoint's preset shapes, by plain names, as paths in a w × h frame ----

const GEOMETRIES = ['rect', 'rounded', 'oval', 'triangle', 'diamond', 'hexagon', 'octagon', 'parallelogram', 'trapezoid', 'pentagon', 'chevron', 'arrow', 'cylinder'];
function path(shape, w, h) {
  const s = Math.min(w, h), n = v => +v.toFixed(2);
  const poly = ps => `M${ps.map(([x, y]) => `${n(x)},${n(y)}`).join(' L')} Z`;
  switch (shape) {
    case 'rounded': { const r = s * 0.16667; return `M${n(r)},0 H${n(w - r)} A${n(r)},${n(r)} 0 0 1 ${n(w)},${n(r)} V${n(h - r)} A${n(r)},${n(r)} 0 0 1 ${n(w - r)},${n(h)} H${n(r)} A${n(r)},${n(r)} 0 0 1 0,${n(h - r)} V${n(r)} A${n(r)},${n(r)} 0 0 1 ${n(r)},0 Z`; }
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
// A corporate suffix keeps to the word before it, joined by a no-break space, which PowerPoint keeps too:
// "BDC, Inc." and "GP III, LLC", never "Inc." alone on a line; unless the two are wider than the line.
const SUFFIX = /, (Inc\.|LLC|L\.L\.C\.|L\.P\.|LP|LLP|Ltd\.|Limited|S\.à r\.l\.|S\.A\.|GmbH|mbH|N\.V\.|B\.V\.|plc)(?=$|[\s:;,)])/g;
const bind = text => String(text).replace(SUFFIX, (_, s) => `,\u00a0${s.replace(/ /g, '\u00a0')}`);
// Text broken into lines no wider than `width`, at spaces where it can be: as few lines as hold it, and,
// `balanced`, as even as they can be, the least width that keeps them as few, as CSS's text-wrap: balance
// sets a heading. A word wider than the line is hyphenated where it must be, and that line is `cut`, the text
// no longer what was typed. Kept, the latest few thousand, as the next scene breaks the same texts again.
const broken = new Map();
function breakLines(text, t, width, balanced = true) {
  const k = `${t.Italic ? 'i' : ''}${t.Bold ? 'b' : ''}${t.Size}|${t.Font}|${width}|${balanced}|${text}`;
  let ls = broken.get(k);
  if (!ls) {
    ls = [];
    for (const para of bind(text).split('\n')) {
      const words = para.split(/ +/).flatMap(w => w.includes('\u00a0') && measure(w, t) > width ? w.split('\u00a0') : [w]);
      let some = fill(words, t, width);
      if (balanced && some.length > 1 && !some.some(l => l.cut)) {
        let lo = Math.max(...words.map(w => measure(w, t))), hi = width;
        while (hi - lo > 0.5) { const mid = (lo + hi) / 2; if (fill(words, t, mid).length > some.length) lo = mid; else hi = mid; }
        some = fill(words, t, hi);
      }
      ls.push(...some.map(l => ({ ...l, w: measure(l.text, t) })));
    }
    if (broken.size > 4000) broken.clear();
    broken.set(k, ls);
  }
  return ls.map(l => ({ ...l }));
}
// As much on each line as fits it.
function fill(words, t, width) {
  const out = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (measure(next, t) <= width) { line = next; continue; }
    if (line) out.push({ text: line });
    line = word;
    while (measure(line, t) > width && line.length > 4) {
      let i = line.length - 2;
      while (i > 2 && measure(`${line.slice(0, i)}-`, t) > width) i--;
      out.push({ text: `${line.slice(0, i)}-`, cut: true });
      line = line.slice(i);
    }
  }
  out.push({ text: line });
  return out;
}
// A text's lines, all of them; in a redline, what it said struck through above what it would say.
const linesOf = (it, width) => it.was !== undefined && it.was !== it.text
  ? [...breakLines(it.was, it.look, width).map(l => ({ ...l, red: 'go' })), ...(it.text ? breakLines(it.text, it.look, width).map(l => ({ ...l, red: 'appear' })) : [])]
  : it.text ? breakLines(it.text, it.look, width) : [];
// A dash as SVG and PDF draw it, for a line of weight w in points: its dashes and gaps, in pixels.
const dash = (d, w) => { const p = w * PT; return d === 'dashed' ? `${Math.max(4, p * 4)} ${Math.max(3, p * 3)}` : d === 'dotted' ? `${Math.max(1, p)} ${Math.max(2.5, p * 2)}` : null; };
const lineHeight = t => t.Size * PT * 1.2;
// A text's lines stacked from y, each placed by its alignment within [x0, x0 + width]: its baseline and
// its anchor, which is its start, middle or end.
function stack(item, x0, width, y) {
  const t = item.look, lh = lineHeight(t);
  item.lines.forEach((l, i) => {
    l.x = t.Align === 'left' ? x0 : t.Align === 'right' ? x0 + width : x0 + width / 2;
    l.y = y + i * lh + t.Size * PT * 0.93;
  });
  return y + item.lines.length * lh;
}
const blockHeight = items => items.reduce((h, it) => h + it.lines.length * lineHeight(it.look), 0);
const widest = items => Math.max(0, ...items.flatMap(it => it.lines.map(l => l.w)));
// A text set again at the sheet's half point nearest its size, on a page drawn at s, its lines as they broke.
function snap(it, s) {
  it.look = { ...it.look, Size: half(it.look.Size, s) };
  for (const l of it.lines) l.w = measure(l.text, it.look);
}

// A triangle's text, set at its base: each line no wider than the triangle is at the line's top, less a
// little either side, the sides opening out below it. Of the ways to break it, the one that needs the
// shortest triangle, or one with fewer lines that's no more than a line taller; a triangle whose width nobody
// entered widens, by half at most, before its text takes more than four lines.
// → { w, h, width, lines: [lines of each text] }, h the least height that holds it, at least half the width,
// and width what its lines are broken to. Kept by what it reads, the latest few thousand, as the next scene
// sets the same triangles again.
const pyramids = new Map();
function pyramid(texts, w, widen) {
  const k = JSON.stringify([w, widen, texts.map(it => [it.text, it.was, it.look.Font, it.look.Size, it.look.Bold, it.look.Italic])]);
  let p = pyramids.get(k);
  if (!p) {
    p = fitPyramid(texts, w, widen);
    if (pyramids.size > 4000) pyramids.clear();
    pyramids.set(k, p);
  }
  return { ...p, lines: p.lines.map(ls => ls.map(l => ({ ...l }))) };
}
function fitPyramid(texts, w, widen) {
  const most = widen ? w * 1.5 : w;
  for (;;) {
    // No narrower than its longest word, leaving out a word wider than three quarters of the base, which is
    // hyphenated wherever the lines break.
    const word = Math.max(32, ...texts.flatMap(it => bind(it.text ?? '').split(/ +/).map(s => measure(s, it.look))).filter(x => x <= w * 0.75 - 2 * INSET));
    const ways = [];
    for (let f = 0.94; f > 0.3; f -= 0.04) {
      const a = w * f - 2 * INSET;
      if (a < word && ways.length) break;
      const lines = texts.map(it => linesOf(it, Math.max(word, a)));
      const rows = texts.flatMap((it, i) => lines[i].map(l => ({ w: l.w, lh: lineHeight(it.look) })));
      // A line's top sits D above the base; there the triangle is w (h − D) / h wide.
      let h = w * 0.5, d = BASE;
      for (let i = rows.length - 1; i >= 0; i--) {
        d += rows[i].lh;
        const q = (rows[i].w + 2 * PAD) / w;
        h = Math.max(h, d / (1 - Math.min(q, 0.94)));
      }
      ways.push({ h, lines, n: rows.length, width: Math.max(word, a) });
    }
    // The shortest, or one with fewer lines no more than a line taller.
    const least = Math.min(...ways.map(c => c.h)), step = lineHeight(texts[0]?.look ?? TEXT);
    const best = ways.filter(c => c.h <= least + step).sort((p, q) => p.n - q.n || p.h - q.h)[0];
    if (w >= most || (best.n <= 4 && best.h <= w * 0.9)) return { w, h: Math.ceil(best.h), width: best.width, lines: best.lines };
    w = Math.min(most, w + 12);
  }
}

// A box's size: its width entered or its shape's own, `squeeze` times that on a paper narrower than its page,
// and as tall as its text needs, every line of it, broken to fit the shape where it sits (at a triangle's
// base, inside an oval). A box whose width nobody entered widens, by half at most, before its text takes more
// than four lines. Triangles of one width are one size, the tallest any of them needs (see level).
function size(b, squeeze) {
  const shape = b.settings.Shape.value, own = b.pos?.w, base = (own ?? WIDTH[shape === 'triangle' ? 'triangle' : 'box']) * squeeze;
  let w = base, h;
  if (shape === 'triangle') {
    const fit = pyramid(b.texts, w, !own);
    b.texts.forEach((it, i) => { it.lines = fit.lines[i]; });
    ({ w, h } = fit);
    b.column = { x: (w - fit.width) / 2, width: fit.width };
  } else {
    const lay = () => { const avail = Math.max(32, w * (TEXT_AREA[shape] ?? 1) - 2 * INSET); for (const it of b.texts) it.lines = linesOf(it, avail); return b.texts.reduce((n, it) => n + it.lines.length, 0); };
    for (let n = lay(); !own && n > 4 && w < base * 1.5; n = lay()) w = Math.min(base * 1.5, w + 12);
    const tb = blockHeight(b.texts.filter(it => it.lines.length));
    h = shape === 'oval' || shape === 'diamond' ? Math.max(48, tb / (shape === 'oval' ? 0.74 : 0.5) + 2 * PAD) : Math.max(44, tb + 2 * PAD + 8);
  }
  b.texts = b.texts.filter(it => it.lines.length);
  Object.assign(b, { w, h: Math.max(h, b.pos?.h ?? 0), shape });
}

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
// store of them for each of the latest views and states of the notes, so views shown in turn each keep theirs.
const worked = new Map();
function workedIn(notesAre) {
  const w = worked.get(notesAre) ?? new WeakMap();
  worked.delete(notesAre);
  worked.set(notesAre, w);
  if (worked.size > 12) worked.delete(worked.keys().next().value);
  return w;
}
// Each view's scene as last drawn, and what it was drawn from, which is all a scene reads: the state, the
// notes, the view's free shapes, its day and its paper. Drawn again from the same, it's the same.
const drawnFrom = new Map();

function of(wb, chart, view, day = Log.today(), opts = {}) {
  const started = now();
  const red = opts.redline ?? null;
  const rows = wb.rows(chart), notesAre = `${view}|${rows.filter(r => 'note' in r).map(r => r.id).join()}`;
  const shapeRows = rows.filter(r => 'shape' in r && r.view === view);
  const preview = !!(red || opts.reveal?.length), drawnAs = `${chart}|${view}`;
  const from = [opts.state, opts.computed ?? null, notesAre, shapeRows.map(r => r.id).join(), day], whence = `${drawnAs}|${opts.paper ?? ''}`;
  if (!preview) {
    const d = drawnFrom.get(whence);
    if (d && d.from.every((x, i) => x === from[i])) { if (d.laid) laidOut.set(drawnAs, d.laid); return d.scene; }
  }
  // A redline draws what's in the chart now together with what would be: both, marked.
  const state = red?.state ? { ...opts.state, ...red.state } : opts.state;
  const N = wb.notes(chart), styles = N.styles(view), styleAt = new Map(styles.map((s, i) => [s.key, i]));
  const tree = id => treeOf(state, id);
  const kept = workedIn(notesAre), stands = new Map();
  const standing = id => {
    if (!stands.has(id)) {
      const r = state[id], w = r && kept.get(r);
      stands.set(id, false);
      stands.set(id, !!w && argsOf(r).every((a, i) => state[a.at] === w.locs[i] && standing(a.at)));
    }
    return stands.get(id);
  };
  const work = id => {
    if (standing(id)) return kept.get(state[id]);
    const r = state[id], w = { locs: argsOf(r).map(a => state[a.at]), formats: N.formats(tree(id), view) };
    kept.set(r, w);
    stands.set(id, true);
    return w;
  };
  // Something else worked out from a record's tree and the notes, once.
  const once = (id, k, f) => { const w = work(id); return k in w ? w[k] : (w[k] = f()); };

  // A note's rank where it reaches a mark: in the view before none; one record's own (entered) before a
  // style's; a later style before an earlier; and through the mark's own record before a deeper one.
  const ranks = new Map();
  const rankOf = (note, depth) => {
    let r = ranks.get(note);
    if (!r) ranks.set(note, r = [note.view ? 1 : 0, idsIn(note.pattern).size ? 1 : 0, note.view ? (styleAt.get(key(bare(note.pattern))) ?? -1) : 0]);
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
  const ids = Object.keys(state).filter(id => !Tree.isView(state[id]) && (standing(id) || tree(id)));
  // What each record's notes give, landing on the nearest mark up the tree that has the property.
  const formats = new Map(ids.map(id => [id, work(id).formats]));
  // A two-sided relation's ends as its line runs, from its Above side, the edge drawn on top, to the other.
  const endsOf = (id, ends) => {
    const at = once(id, 'above', () => { const above = formats.get(id).Above?.value ?? N.edges(tree(id))[0]; return above && state[id].args.find(a => same(a.edge, above))?.at; });
    const top = at && boxOf(at);
    return top && top === ends[1] ? [ends[1], ends[0]] : ends;
  };
  for (const id of ids) if (isObject(state[id])) addMark({ id, type: 'box', record: id, cand: {} });
  for (const id of ids) {
    const r = state[id];
    if (isObject(r)) continue;
    const ends = r.args?.length === 2 ? r.args.map(a => boxOf(a.at)) : null;
    if (ends && ends[0] && ends[1] && ends[0] !== ends[1]) {
      if (formats.get(id).Connector?.value !== 'none') addMark({ id, type: 'line', record: id, ends, cand: {} });
      else { const [from, to] = endsOf(id, ends); addMark({ id: `${id}@${to}`, type: 'text', record: id, host: to, listed: from, cand: {} }); }
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
  const reveal = new Set();
  const revealUp = id => { const r = state[id]; if (!r || reveal.has(id)) return; reveal.add(id); argsOf(r).forEach(a => revealUp(a.at)); };
  for (const id of opts.reveal ?? []) revealUp(id);
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
  for (const id of ids) for (const [label, res] of Object.entries(formats.get(id))) if (label !== 'Shown' && label !== 'Frame') land(id, label, res, drawn);

  const settle = (m, defaults) => {
    m.settings = {};
    for (const [label, d] of Object.entries(defaults)) {
      const c = m.cand[label];
      m.settings[label] = c ? { value: c.value, note: c.note } : { value: d, note: null };
    }
  };
  const look = s => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v.value]));
  const isRed = id => !red ? null : red.go?.has?.(id) ? 'go' : red.appear?.has?.(id) ? 'appear' : null;

  // The texts drawn in each box and on each line, in their entries' order. A text's properties reach it
  // through its own record and through its box's (or line's); as everywhere, the later style wins, and its
  // own where they tie. Format, how a value reads, is each record's own.
  const orders = new Map();
  const orderOf = id => orders.get(id) ?? orders.set(id, Tree.pathOf(state, id).slice(1).map(x => [once(x, 'order', () => N.order(tree(x))) ?? Infinity, Tree.norm(state[x].edge ?? '')])).get(id);
  const byOrder = (a, b) => {
    const p = orderOf(a.record), q = orderOf(b.record);
    for (let i = 0; i < Math.min(p.length, q.length); i++) if (p[i][0] !== q[i][0]) return p[i][0] - q[i][0]; else if (p[i][1] !== q[i][1]) return p[i][1] < q[i][1] ? -1 : 1;
    return p.length - q.length;
  };
  const container = m => { let c = up(m); while (c && c.type === 'text') c = up(c); return c; };
  const textItem = (m, host) => {
    for (const label of TEXT_PROPS) {
      const h = label !== 'Format' && host.cand[label];
      if (h && (!m.cand[label] || beats(h.rank, m.cand[label].rank))) m.cand[label] = h;
    }
    settle(m, DEFAULTS.text);
    for (const label of TEXT_PROPS) if (!m.cand[label] && label !== 'Format') m.settings[label] = host.settings[label];
    const r = state[m.record], t = look(m.settings), name = once(m.record, 'name', () => N.name(tree(m.record)));
    const old = red?.changed?.get?.(m.record);
    return { id: m.record, type: 'text', settings: m.settings, look: t, text: textOf(r, t.Format, name),
      was: typeof old === 'string' ? old : old ? textOf(old, t.Format, name) : undefined,
      computed: !!r.computed, redline: isRed(m.record),
      ...(m.listed && { listed: { role: t.Format === 'none' ? '' : textOf(r, 'value', name), name: N.nameOf(state, m.listed) } }) };
  };
  // A box's relations written in it, one text for each role: the role, for more than one in the plural, and
  // who holds it, by surname, each name kept on one line. They follow the box's own texts.
  const surname = s => s.trim().split(/\s+/).pop().toLowerCase();
  const gather = items => {
    const mine = items.filter(it => !it.listed), roles = groupBy(items.filter(it => it.listed), it => `${it.listed.role}|${JSON.stringify(it.look)}`);
    const merged = [...roles.values()].sort((a, b) => a[0].listed.role < b[0].listed.role ? -1 : 1).map(its => {
      const names = its.map(it => it.listed.name).sort((a, b) => surname(a) < surname(b) ? -1 : surname(a) > surname(b) ? 1 : 0)
        .map(n => n.trim().replace(/ +/g, '\u00a0')), role = its[0].listed.role;
      return { ...its[0], text: role ? `${names.length > 1 ? Tree.plural(role) : role}: ${names.join(', ')}` : names.join(', '), records: its.map(it => it.id), listed: undefined, was: undefined,
        computed: its.every(it => it.computed), redline: its.find(it => it.redline)?.redline ?? null };
    });
    return [...mine, ...merged];
  };

  const boxes = [], lines = [];
  for (const m of marks.values()) if (drawn(m) && m.type !== 'text') {
    settle(m, DEFAULTS[m.type]);
    (m.type === 'box' ? boxes : lines).push(m);
    m.texts = [];
    m.computed = !!state[m.record].computed;
    m.redline = isRed(m.record);
    m.revealed = reveal.has(m.record) && !shownAlone(m);
  }
  for (const m of [...marks.values()].filter(m => m.type === 'text' && drawn(m)).sort(byOrder)) {
    const host = container(m);
    if (host?.texts) host.texts.push(textItem(m, host));
  }
  for (const b of boxes) b.texts = gather(b.texts);

  // Lines: each from its Above side, the edge drawn on top (an owner's), to the other; the Above an edge
  // order gives, where no note says. Its label is its own text, then the texts drawn on it; a line revealed
  // has none, as what reveals it names it.
  for (const l of lines) {
    const r = state[l.record], t = tree(l.record);
    [l.from, l.to] = endsOf(l.record, l.ends);
    l.ranks = l.settings.Above.value !== 'none';
    const own = { id: l.record, type: 'text', settings: l.settings, look: { ...look(l.settings), Align: 'left' },
      text: lineText(r, l.settings.Format.value, N.name(t)), computed: l.computed, redline: l.redline };
    l.texts = l.revealed ? [] : [own, ...l.texts].filter(it => it.text);
    for (const it of l.texts) { it.look = { ...it.look, Align: 'left' }; it.lines = linesOf(it, 200); }
    labelOf(l, l.texts.length === 1 && l.texts[0] === own && !isField(r));
    l.trunk = ['Outline', 'Weight', 'Dash', 'Arrow'].map(k => l.settings[k].value).join('|');
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
  // and never overlap.
  const drawnBoxes = new Map(boxes.map(b => [b.record, b]));
  const steps = new Map();
  for (const id of ids) {
    const res = formats.get(id).Frame, r = state[id];
    if (!res || res.value === 'none' || idsIn(res.note.pattern).size || !res.note.view) continue;
    const ends = !boxOf(id) && r.args?.length === 2 ? r.args.map(a => boxOf(a.at)) : null;
    const b = drawnBoxes.get(ends ? endsOf(id, ends)[1] : boxOf(id));
    if (!b) continue;
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
  // less its offset. A preview (a redline, or records revealed) keeps the view as it was last drawn: its boxes,
  // its lines where their boxes stand, its page and its furniture; what it adds goes on the page, around
  // what's drawn.
  const sheet = pageOf(N, view, opts.paper);
  const said = new Map(shapeRows.map(r => [r.id, shapeText(r, opts.computed, day)]));
  const last = preview && !opts.paper ? laidOut.get(drawnAs) ?? null : null;
  if (last) for (const [id, p] of positions) positions.set(id, { ...p, x: p.x + last.page.offset.x, y: p.y + last.page.offset.y });
  // The key is of what the view draws: what's revealed for a while doesn't change it.
  const legendRows = legend(N, view, [...boxes, ...lines].filter(m => !m.revealed));
  const placedBy = r => r.x == null || r.y == null, onPaper = !!opts.paper && sheet.size !== pageOf(N, view).size;
  let heights = null;
  const lay = squeeze => {
    for (const b of boxes) size(b, squeeze);
    for (const ts of groupBy(boxes.filter(b => b.shape === 'triangle'), b => Math.round(b.w)).values()) level(ts);
    const placed = Layout.arrange({
      keep: last?.at ?? null,
      boxes: boxes.map(b => ({ id: b.id, w: b.w, h: b.h, shape: b.shape })),
      links: lines.filter(l => l.ranks).map(l => ({ from: l.from, to: l.to })),
      lines: lines.map(l => ({ id: l.id, from: l.from, to: l.to, trunk: l.trunk, straight: l.straight })),
      obstacles: obstaclesOf(shapeRows, last?.page.offset),
      clusters: [...frames.values()].map(f => ({ id: f.id, parent: f.parent, members: f.members, top: f.label + 10 })),
      entered: squeeze === 1 ? positions : squeezed(positions, boxes, squeeze, heights), page: sheet, bounds: last?.page ?? null,
    });
    for (const b of boxes) Object.assign(b, placed.get(b.id));
    // Boxes in a rank, their tops level, are one height: the tallest of them (see level).
    for (const rank of groupBy(boxes.filter(b => b.shape !== 'triangle'), b => Math.round(b.y / 4)).values()) level(rank);
    push(boxes, frames, lines.filter(l => l.ranks));
    frameBounds(frames, boxes);
    routes(boxes, lines, frames).forEach((r, i) => Object.assign(lines[i], r));
    if (last) still(last, boxes, lines, frames);
    return furnish({ sheet, boxes, lines, frames, shapes: shapeRows, said, legend: legendRows, last, placedBy });
  };
  let at = lay(1);
  heights = new Map(boxes.map(b => [b.id, b.h]));
  // On another paper the page places the chart; on one narrower than its page, it's drawn narrower, its boxes
  // and their places closer, as far as that prints it larger, up to the size its own page prints it at.
  if (onPaper && boxes.length) {
    const target = of(wb, chart, view, day, { ...opts, paper: null }).page.scale;
    let best = 1, tried = 1;
    for (const f of [0.95, 0.9, 0.85, 0.8, 0.75, 0.7]) {
      if (at.s >= target) break;
      const next = lay(tried = f);
      if (next.s > at.s) [at, best] = [next, f];
    }
    if (tried !== best) at = lay(best);
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
  for (const ls of groupBy(lines.filter(l => l.landed), l => `${l.trunk}|${JSON.stringify(l.points)}`).values()) for (const l of ls.slice(1)) l.merged = ls[0].id;
  jumps(lines, 4 / s);

  // Every text at the sheet's half point nearest its size, placed again where it was.
  for (const b of boxes) { b.texts.forEach(it => snap(it, s)); setText(b); }
  for (const l of lines) { l.texts.forEach(it => snap(it, s)); labelOf(l); }
  for (const f of frames.values()) { snap(f.caption, s); f.label = f.caption.lines.length * lineHeight(f.caption.look); caption(f); }

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

  const laid = !preview && !opts.paper && !opts.ahead ? {
    at: new Map(boxes.map(b => [b.id, { x: b.x, y: b.y }])), boxes: new Map(boxes.map(b => [b.id, { x: b.x, y: b.y, w: b.w, h: b.h }])),
    frames: new Map([...frames.values()].map(f => [f.id, { x: f.x, y: f.y, w: f.w, h: f.h }])),
    routes: new Map(lines.map(l => [l.id, { from: l.from, to: l.to, points: l.points, labelAt: l.labelAt, down: l.down, landed: l.landed }])),
    page, places: at.places,
  } : null;
  if (laid) laidOut.set(drawnAs, laid);

  const layer = m => m.settings?.Layer?.value ?? m.look?.Layer ?? 0;
  const marksInOrder = [
    ...[...frames.values()].sort((a, b) => depthOf(frames, a) - depthOf(frames, b)),
    ...lines.filter(l => !l.merged).sort((a, b) => layer(a) - layer(b)),
    ...boxes.sort((a, b) => layer(a) - layer(b)),
    ...shapes.sort((a, b) => layer(a) - layer(b)),
  ];
  for (const m of [...marksInOrder, ...lines]) { delete m.cand; delete m.pos; if (m.type !== 'shape') delete m.ends; }
  const scene = { chart, view, day, page, marks: marksInOrder, byId, styles, legend: legendRows, ms: now() - started };
  if (!preview && !opts.ahead) drawnFrom.set(whence, { from, scene, laid });
  return scene;
}
// A free shape from a row not yet kept, as a scene would draw it: how big a new one will be.
function shapeOf(row, scene) {
  const u = 1 / (scene.page.scale ?? 1), m = freeShape({ shape: '·new', ...row }, row.text ?? '', u);
  if (m.geometry === 'legend') layoutLegend(m, scene.legend, u);
  return m;
}

// Boxes that go together share a height, the tallest of them; but a box whose text had to be hyphenated, or
// whose name runs past six lines, doesn't set it, and stands taller alone rather than stretch the rest.
function level(ms) {
  const h = Math.max(0, ...ms.filter(b => !b.texts.some(it => it.lines.some(l => l.cut)) && !(b.texts[0]?.lines.length > 6)).map(b => b.h));
  for (const b of ms) if (b.h < h) b.h = h;
}
// Where a box has grown into the rank below it, the rank moves down as far as it must, and each rank under it
// as far as that makes it: ranks stay level, 12 pt under the tallest box over them, or 30 pt where a line runs
// down from one to the other with no frame between, with room for the frames between, and a rank that's clear
// stays where it is. A triangle under a box is its middle half.
function push(boxes, frames, links = []) {
  const chain = new Map();
  for (const f of frames.values()) for (const id of f.members) { const c = []; for (let g = f; g; g = g.parent && frames.get(g.parent)) c.push(g); chain.set(id, c); }
  const below = f => f.kind === 'bracket' || f.lone ? 0 : 10, above = f => f.kind === 'bracket' ? f.label + 12 : f.lone ? f.label + 5.3 : f.label + 10;
  const joined = new Set(links.map(l => `${l.from}>${l.to}`)), over = [];
  for (const rank of [...groupBy(boxes, b => Math.round(b.y / 4)).values()].sort((a, b) => a[0].y - b[0].y)) {
    let d = 0;
    for (const c of rank) {
      const fc = chain.get(c.id) ?? [], [x0, x1] = c.shape === 'triangle' ? [c.x + c.w / 4, c.x + c.w * 3 / 4] : [c.x, c.x + c.w];
      for (const b of over) {
        if (x0 >= b.x + b.w || b.x >= x1) continue;
        const fb = chain.get(b.id) ?? [];
        const room = fb.filter(f => !fc.includes(f)).reduce((sum, f) => sum + below(f), 0) + fc.filter(f => !fb.includes(f)).reduce((sum, f) => sum + above(f), 0);
        d = Math.max(d, b.y + b.h + room + (!room && joined.has(`${b.id}>${c.id}`) ? 40 : 16) - c.y);
      }
    }
    if (d > 0.5) for (const c of rank) c.y += d;
    over.push(...rank);
  }
}
// Entered places on a paper narrower than their page: each box's middle `f` times as far from the chart's
// left, the box `f` times as wide. A rank whose names wrap more grows up into the space over it, down to 40 pt
// from the rank above, and the rest of what it grew moves every rank under it down (`was`, each box's height on
// its page), so that the space between ranks stays as it was where it's no more than that.
function squeezed(positions, boxes, f, was) {
  const x0 = Math.min(...[...positions.values()].map(p => p.x)), by = new Map(boxes.map(b => [b.id, b]));
  const ranks = groupBy([...positions].filter(([id]) => by.has(id)), ([, p]) => Math.round(p.y / 4));
  let shift = 0, floor = -Infinity;
  const at = new Map([...ranks.keys()].sort((a, b) => a - b).map(r => {
    const ids = ranks.get(r).map(([id]) => id), top = Math.min(...ranks.get(r).map(([, p]) => p.y));
    const now = Math.max(...ids.map(id => by.get(id).h)), then = Math.max(...ids.map(id => was.get(id) ?? by.get(id).h)), grew = Math.max(0, now - then);
    const up = Math.min(grew, Math.max(0, top + shift - floor - 53)), moved = shift - up;
    shift += grew - up;
    floor = top + moved + now;
    return [r, moved];
  }));
  return new Map([...positions].map(([id, p]) => {
    const w = by.get(id)?.w ?? 0, wide = p.w ?? w / f;
    return [id, { ...p, x: x0 + (p.x + wide / 2 - x0) * f - w / 2, y: p.y + (at.get(Math.round(p.y / 4)) ?? shift) }];
  }));
}
// A mark moved by (dx, dy), with everything placed in it.
function move(m, dx, dy) {
  if (m.points) m.points = m.points.map(([x, y]) => [x + dx, y + dy]);
  if (m.labelAt) m.labelAt = { x: m.labelAt.x + dx, y: m.labelAt.y + dy };
  if (m.type !== 'line') Object.assign(m, { x: m.x + dx, y: m.y + dy });
}

// A box's texts placed in it, once its height is known: at a triangle's base, 7 pt up; in the middle of
// anything else. Its `column` is the width its lines were broken to (a triangle's, its pyramid's).
function setText(b) {
  const tb = blockHeight(b.texts), width = Math.max(32, b.w * (TEXT_AREA[b.shape] ?? 1) - 2 * INSET);
  if (b.shape !== 'triangle') b.column = { x: (b.w - width) / 2, width };
  let y = b.shape === 'triangle' ? b.h - BASE - tb : (b.h - tb) / 2;
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
// its Above side; the router's working left behind. Lines may land on frames (Layout.route says when).
function routes(boxes, lines, frames = new Map()) {
  const copies = lines.map(l => ({ id: l.id, from: l.from, to: l.to, trunk: l.trunk, straight: l.straight, label: l.label, arrow: l.settings?.Arrow?.value }));
  const fs = [...frames.values()].map(f => ({ id: f.id, x: f.x, y: f.y, w: f.w, h: f.h, members: inFrame(frames, f), depth: depthOf(frames, f) }));
  Layout.route(new Map(boxes.map(b => [b.id, b])), copies, { frames: fs });
  return copies.map(c => ({ points: c.points, labelAt: c.labelAt, down: c.down, landed: c.landed }));
}
// A preview's lines: those it had keep their routes and labels where both their boxes (and the frame one lands
// on) stand as they stood; what it adds is routed around what's drawn, its labels 8 pt clear of the rest.
function still(last, boxes, lines, frames) {
  const geo = new Map(boxes.map(b => [b.id, b])), same = (a, b) => !!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
  const added = [];
  for (const l of lines) {
    const was = last.routes.get(l.id);
    if (was && was.from === l.from && was.to === l.to && same(geo.get(l.from), last.boxes.get(l.from)) && same(geo.get(l.to), last.boxes.get(l.to))
      && (!was.landed || same(frames.get(was.landed), last.frames.get(was.landed)))) Object.assign(l, { points: was.points, labelAt: was.labelAt, down: was.down, landed: was.landed });
    else added.push(l);
  }
  if (!added.length) return;
  const kept = lines.filter(l => !added.includes(l));
  const labels = kept.filter(l => l.labelAt && l.label).map(l => ({ x: l.labelAt.x, y: l.labelAt.y, w: l.label.w, h: l.label.h }));
  const captions = [...frames.values()].map(f => ({ x: f.x + (f.lone ? 0 : 6), y: f.y + (f.lone ? 0 : 4), w: widest([f.caption]), h: f.label }));
  const segs = kept.flatMap(l => l.points.slice(1).map((p, i) => [l.points[i], p]));
  for (const l of added) {
    const ps = Layout.around(geo, l.from, l.to, { avoid: [...labels, ...captions], segs, page: last.page });
    if (ps) Object.assign(l, { points: ps, down: ps.at(-1)[1] > ps[0][1] + 1, landed: undefined });
  }
  const copies = lines.map(l => ({ id: l.id, points: l.points, label: l.label, arrow: l.settings.Arrow.value, down: l.down }));
  const mine = copies.filter((c, i) => added.includes(lines[i]) && c.label);
  Layout.labels(geo, mine, copies, labels);
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
// share their left and right sides, where that takes in no other box: a column of panels.
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
      if (!boxes.some(b => !mine.has(b.id) && b.x < right && b.x + b.w > left && b.y < f.y + f.h && b.y + b.h > f.y)) Object.assign(f, { x: left, w: right - left });
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

// How a view's styles group their outputs, the one rule the Key, Styles and the format bar's scope all go
// by: a style's outputs that look alike, by their swatch and whether they're shown (and a frame's by its
// caption, which is drawn on it), are one group, in the view's order of its styles. An output that only shows
// or hides is a filter, and in none. A group goes by its first output, which stays the same while the group
// does; it's captioned by a Caption note at one of its outputs, or else by them, two at most, or else by the
// style's name. `only`, a set of output keys, takes those outputs alone, as the Key takes what's drawn.
// → [{ style, order, key, outputs: [pattern], swatch, caption, off }]
function groupsOf(N, view, only = null) {
  const out = [];
  N.styles(view).forEach((s, order) => {
    const groups = new Map();
    for (const o of s.outputs) {
      if ((only && !only.has(key(o.pattern))) || !Object.keys(o.formats).some(k => k !== 'Shown')) continue;
      const sw = swatchOf(o.pattern, o.formats), off = o.formats.Shown === false;
      const k = JSON.stringify([sw, off, sw.kind === 'frame' && captionOf(N, o.pattern, view)]);
      (groups.get(k) ?? groups.set(k, { style: s.key, order, outputs: [], swatch: sw, off }).get(k)).outputs.push(o.pattern);
    }
    for (const g of groups.values()) {
      const own = g.outputs.map(p => N.resolve('Caption', p, view)).find(c => c && g.outputs.some(p => key(p) === key(c.note.pattern)));
      out.push({ ...g, key: key(g.outputs[0]), caption: own ? own.value : g.outputs.length > 2 ? styleName(N, s.pattern) : g.outputs.map(p => outputName(N, p)).join(', ') });
    }
  });
  return out;
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
// a title's 20, a date's 11 and a Key's 8 are those on the slide, however much the chart is drawn smaller.
// A size its row gives is the page's, as the format bar writes it.
const SHAPE_DEFAULTS = { Fill: '#ffffff', Outline: '#000000', Weight: 0.75, Dash: 'solid', Arrow: 'none', Layer: 0, ...TEXT };
const TEXTBOX = { Fill: 'none', Outline: 'none', Align: 'left', Size: 12 };
// The page's own texts: its title, and its date.
const ROLES = { title: { Size: 20, Bold: true }, date: { Size: 11, Color: '#595959' } };
function freeShape(row, text, u = 1) {
  const { id, shape, format = {} } = row;
  const base = { ...SHAPE_DEFAULTS, ...(row.geometry === 'text' && TEXTBOX), ...ROLES[row.role], ...(row.geometry === 'legend' && { Size: 8, Outline: '#7f7f7f', Weight: 0.5, Align: 'left' }),
    ...(row.geometry === 'frame' && { Fill: 'none', Outline: '#595959', Dash: 'dashed', Size: 9, Italic: true, Align: 'left' }),
    ...(row.geometry === 'line' && { Arrow: 'none' }) };
  const t = { ...base, Size: base.Size * u, Weight: base.Weight * u, ...format };
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
    const avail = Math.max(16 * u, m.w * share - 2 * inset);
    const it = { id: shape, type: 'text', look: t, settings: m.settings, text, lines };
    const tb = blockHeight([it]);
    if (m.geometry === 'text') m.h = m.auto ? tb + 9.6 * u : Math.max(m.h, tb + 9.6 * u);
    stack(it, (m.w - avail) / 2, avail, m.geometry === 'frame' ? 5 * u : m.geometry === 'text' ? 4.8 * u : (m.h - tb) / 2);
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

// A legend's rows laid out in its columns under its title, `u` pixels of the page to the sheet's. A row
// merging outputs that look alike may have a caption of the legend's own, which no output shares. `all` is
// every row it could show, each `shown` or not. A legend nobody has sized is as wide as its captions need,
// each up to 120 pt before it wraps.
function layoutLegend(m, rows, u = 1) {
  const t = m.look, pad = 12 * u, sw = 30 * u, gap = 8 * u, lh = lineHeight(t);
  rows = rows.map(r => ({ ...r, caption: m.captions[r.key] ?? r.caption }));
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
// beside the title with the chart starting 24 pt under it; or else 24 pt under the chart, right-aligned to it,
// at the foot of what's above it there; failing all of them, what fits the chart. The Key beside the title
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
  const at = (s, force) => {
    const u = 1 / s, shapes = rows.map(r => freeShape(r, said.get(r.id), u)), places = new Map();
    for (const m of shapes) if (m.geometry === 'legend') layoutLegend(m, legendRows, u);
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
    let top = title || date ? y - PAD + 32 : M;
    // The chart, with what's placed by hand, set across the middle with its top at `top`: as rects on the sheet.
    const drawn = [...rects, ...shapes.filter(m => !byPage(m) && m.geometry !== 'group').map(m => ({ x: m.x, y: m.y, w: m.w, h: m.h }))], E = bounds(drawn);
    const dx = boxes.length ? (W - E.w * s) / 2 / s - E.x : 0, set = t => drawn.map(r => ({ x: (r.x + dx) * s, y: (r.y + t / s - E.y) * s, w: r.w * s, h: r.h * s }));
    const R = t => ({ x: (E.x + dx) * s, y: t, w: E.w * s, h: E.h * s });
    if (!force && boxes.length && !fits(R(top))) return null;
    if (key) {
      // Beside the title, its captions wrapping to the room there, where the chart is clear of it or can start
      // under it.
      const room = W - M - 32 - Math.max(M, ...[title, date].filter(Boolean).map(m => M - INSET + ((m.column?.x ?? 0) + widest(m.texts)) * s));
      let side = key;
      if (key.auto && key.w * s > room && room >= key.columns * (30 + 8 + 80 + 16) + 24) {
        const row = rows.find(r => r.id === key.row);
        side = freeShape({ ...row, w: room * u }, said.get(row.id), u);
        layoutLegend(side, legendRows, u);
      }
      const r = { x: W - M - side.w * s, y: M, w: side.w * s, h: side.h * s };
      if (r.w <= room + 0.5 && fits(r)) {
        const under = Math.max(top, r.y + r.h + 32);
        if (!set(top).some(q => meets(q, r, 21))) places.set(key.row, r);
        else if (fits(R(under)) || (force && boxes.length)) { places.set(key.row, r); top = under; }
        if (places.has(key.row)) shapes[shapes.indexOf(key)] = key = side;
      }
      if (!places.has(key.row)) {
        // Or else under the chart, right-aligned to it, 24 pt under what's over it there.
        const c = R(top), kw = key.w * s, x = Math.max(M, c.x + c.w - kw), over = set(top).filter(q => q.x < x + kw && q.x + q.w > x);
        const under = { x, y: Math.max(c.y, ...over.map(q => q.y + q.h)) + 32, w: kw, h: key.h * s };
        if (!force && !fits(under)) return null;
        places.set(key.row, under);
      }
    }
    for (const [id, p] of places) places.set(id, { x: p.x / s, y: p.y / s });
    return { s, dx, dy: boxes.length ? top / s - E.y : 0, shapes, places };
  };
  if (last) {
    const kept = at(last.page.scale, true);
    for (const [id, p] of last.places) if (kept.places.has(id)) kept.places.set(id, p);
    return { ...kept, dx: 0, dy: 0 };
  }
  // No larger than the chart alone would fit at.
  const E = bounds(rects), most = !boxes.length ? 1 : Math.min((W - 2 * M + 0.5) / Math.max(1, E.w), (H - 2 * M + 0.5) / Math.max(1, E.h));
  for (const s of SCALES.filter(s => s <= most + 1e-9)) { const f = at(s); if (f) return f; }
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
function reach(wb, chart, view, scene, markId, state) {
  const m = scene.byId.get(markId);
  if (!m || (m.type !== 'box' && m.type !== 'line')) return [];
  const N = wb.notes(chart), ids = Tree.dependents(state, [m.record]);
  const out = [];
  scene.styles.forEach((s, order) => {
    for (const id of ids) {
      if (id !== m.record && boxOf(state, id) !== m.record && m.type === 'box') continue;
      const t = treeOf(state, id);
      if (!t || !Tree.narrower(t, s.pattern)) continue;
      const output = outputPattern(s, t);
      if (!out.some(o => o.style === s.key && key(o.output) === key(output)))
        out.push({ style: s.key, order, record: id, output, caption: captionOf(N, output, view), name: styleName(N, s.pattern) });
    }
  });
  return out;
}
const boxOf = (state, id) => { const r = state[id]; return !r ? null : isObject(r) ? id : r.at ? boxOf(state, r.at) : null; };
// What a style is called: its pattern's name, or for a style by kind, Type.
const styleName = (N, p) => p.args ? N.name(p) : 'Type';
// A size or place on a page as it is on its sheet, the page drawn smaller by its scale: the number the slide
// has, which is the one shown; and back, for one typed.
const toSlide = (page, v) => v * (page?.scale ?? 1), fromSlide = (page, v) => v / (page?.scale ?? 1);

return {
  of, reflow, shapeOf, path, dash, measure, breakLines, bind, reach, groupsOf, outputPattern, captionOf, outputName, styleName, swatch, swatchOf, fontFamily,
  toSlide, fromSlide, DEFAULTS, GEOMETRIES, PAGES, PT, FONTS: Object.keys(FONTS),
};
})();
