// Scene: what a view draws (dendra.md, Views). Its drawn marks and free shapes, every setting valued and
// known by the note that decided it, each text broken into lines, on the view's page. It reads the computed
// state and the view and nothing else, and the canvas, the PDF and PowerPoint each draw it and nothing else.
// The only page it touches is a canvas, to measure text. Units are CSS pixels, 96 to the inch, as the browser
// and X6 draw them; a Size or a Weight is in points, as Office gives them, each PT pixels.
//
// Scene.of(wb, chart, view, day, { state, computed?, reveal, redline }) →
//   { chart, view, day, page: { w, h, scale, sheet }, marks, byId, styles, legend, ms }
// `state` is the computed state's records, and `computed` the engine's whole result, for a free shape whose
// text is a formula. `marks` are in drawing order: frames, lines, boxes, then free shapes, each by its Layer.
// A box, line or frame has `settings`: { [property]: { value, note } }, the note null where nothing in the
// chart says. A box or line has `texts`, each a record's text with its own settings and its `lines`, placed
// from the mark's top left (a line's from its label's); a box or shape with text, the `column` its lines
// are broken to. A free shape has its row's formats, with no notes, and a free line the boxes it's glued to.
const Scene = (() => {
const { treeOf, idsIn, key, bare, isObject, isField, isTag, isChoice, argsOf, same } = Tree;

// A page is a slide unless the view's Page note says otherwise. It keeps its size's proportions, and grows
// as a whole to hold what's drawn: a 16:9 slide stays 16:9, its `sheet` is the slide itself (13.33 × 7.5
// in), and its `scale` says by how much the page is drawn smaller to fit the sheet.
const PT = 4 / 3;
const PAGES = { slide: [1280, 720], letter: [1056, 816], legal: [1344, 816], tabloid: [1632, 1056], a4: [1123, 794], a3: [1587, 1123] };
const MARGIN = 48;

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
// where its formats draw one, or else a text.
const swatchOf = (p, f) => swatch(p.args?.length > 1 ? 'line' : !p.args || KEYED.box.some(k => k in f) ? 'box' : 'text', f);
const FONTS = { Arial: "Arial, 'Liberation Sans', Helvetica, sans-serif", Calibri: 'Calibri, Carlito, sans-serif',
  'Times New Roman': "'Times New Roman', 'Liberation Serif', Times, serif", Georgia: 'Georgia, Gelasio, serif' };
const fontFamily = f => FONTS[f] ?? `'${f}', sans-serif`;
const groupBy = (list, f) => list.reduce((m, x) => { const k = f(x); (m.get(k) ?? m.set(k, []).get(k)).push(x); return m; }, new Map());

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
// Text broken into lines no wider than `width`, at spaces where it can be, and within a word where it can't.
function breakLines(text, t, width) {
  const out = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const word of para.split(/ +/)) {
      const next = line ? `${line} ${word}` : word;
      if (!line || measure(next, t) <= width) { line = next; continue; }
      out.push(line);
      line = word;
    }
    // A word wider than the line is cut where it must be.
    while (line && measure(line, t) > width && line.length > 1) {
      let i = line.length - 1;
      while (i > 1 && measure(line.slice(0, i), t) > width) i--;
      out.push(line.slice(0, i));
      line = line.slice(i);
    }
    out.push(line);
  }
  return out.map(s => ({ text: s, w: measure(s, t) }));
}
// A text's lines; in a redline, what it said struck through above what it would say.
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

// A triangle's text, set at its base: each line no wider than the triangle is at the line's top, less an
// inset. Of the ways to break it, the one that needs the shortest triangle (and then the fewest lines);
// a triangle whose width nobody entered widens before its text takes more than four lines.
// → { w, h, width, lines: [lines of each text] }, h the least height that holds it, at least half the width,
// and width what its lines are broken to.
function pyramid(texts, w, widen) {
  // No narrower than its longest word, which would be cut.
  const word = Math.max(32, ...texts.flatMap(it => String(it.text ?? '').split(/\s+/).map(s => measure(s, it.look))));
  for (;;) {
    let best = null;
    for (let f = 0.94; f > 0.3; f -= 0.04) {
      const a = w * f - 2 * INSET;
      if (a < word && best) break;
      const lines = texts.map(it => linesOf(it, Math.max(word, a)));
      const rows = texts.flatMap((it, i) => lines[i].map(l => ({ w: l.w, lh: lineHeight(it.look) })));
      // A line's top sits D above the base; there the triangle is w (h − D) / h wide.
      let h = w * 0.5, d = BASE;
      for (let i = rows.length - 1; i >= 0; i--) {
        d += rows[i].lh;
        const q = (rows[i].w + 2 * INSET) / w;
        h = Math.max(h, q < 0.98 ? d / (1 - q) : Infinity);
      }
      if (!best || h < best.h - 0.5 || (h < best.h + 0.5 && rows.length < best.n)) best = { h, lines, n: rows.length, width: Math.max(word, a) };
    }
    if (!widen || w >= 360 || (best.n <= 4 && best.h <= w * 0.9)) return { w, h: Math.ceil(best.h), width: best.width, lines: best.lines };
    w += 20;
  }
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
// Where each view's boxes were when it was last drawn as it is, which its previews keep.
const laidOut = new Map();
// What a scene works out from a record's tree and the notes alone, its formats and its edges' order, kept by
// record from one scene to the next while the notes, the view and the records its tree runs through stand.
const worked = new WeakMap();

function of(wb, chart, view, day = Log.today(), opts = {}) {
  const started = now();
  const red = opts.redline ?? null;
  // A redline draws what's in the chart now together with what would be: both, marked.
  const state = red?.state ? { ...opts.state, ...red.state } : opts.state;
  const N = wb.notes(chart), styles = N.styles(view), styleAt = new Map(styles.map((s, i) => [s.key, i]));
  const tree = id => treeOf(state, id);
  const notesAre = `${view}|${wb.rows(chart).filter(r => 'note' in r).map(r => r.id).join()}`, stands = new Map();
  const standing = id => {
    if (!stands.has(id)) {
      const r = state[id], w = r && worked.get(r);
      stands.set(id, false);
      stands.set(id, !!w && w.notes === notesAre && argsOf(r).every((a, i) => state[a.at] === w.locs[i] && standing(a.at)));
    }
    return stands.get(id);
  };
  const work = id => {
    if (standing(id)) return worked.get(state[id]);
    const r = state[id], w = { notes: notesAre, locs: argsOf(r).map(a => state[a.at]), formats: N.formats(tree(id), view) };
    worked.set(r, w);
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
        .map(n => n.trim().replace(/ +/g, ' ')), role = its[0].listed.role;
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

  // A box's size: its width entered or its shape's own, and as tall as its text needs, its lines broken to
  // fit the shape where they sit (at a triangle's base, inside an oval). Triangles of one width are one
  // size, the tallest any of them needs.
  // A loose position, where a box was made on the chart before it was related, gives way to the layout once
  // a line that ranks it joins the box: it goes beside its relatives.
  const joined = id => lines.some(l => l.ends.includes(id) && l.settings.Above.value !== 'none');
  const positions = new Map();
  for (const b of boxes) {
    const pos = N.position(tree(b.record), view);
    if (pos && !(pos.loose && joined(b.id))) positions.set(b.id, pos);
    b.entered = positions.has(b.id);
    const shape = b.settings.Shape.value;
    let w = pos?.w ?? (shape === 'triangle' ? 230 : 200), h;
    if (shape === 'triangle') {
      const fit = pyramid(b.texts, w, !pos?.w);
      b.texts.forEach((it, i) => { it.lines = fit.lines[i]; });
      ({ w, h } = fit);
      b.column = { x: (w - fit.width) / 2, width: fit.width };
    } else {
      const avail = Math.max(32, w * (TEXT_AREA[shape] ?? 1) - 2 * INSET);
      for (const it of b.texts) it.lines = linesOf(it, avail);
      const tb = blockHeight(b.texts.filter(it => it.lines.length));
      h = shape === 'oval' || shape === 'diamond' ? Math.max(48, tb / (shape === 'oval' ? 0.74 : 0.5) + 2 * PAD) : Math.max(44, tb + 2 * PAD + 8);
    }
    b.texts = b.texts.filter(it => it.lines.length);
    Object.assign(b, { w, h: Math.max(h, pos?.h ?? 0), shape });
  }
  for (const ts of groupBy(boxes.filter(b => b.shape === 'triangle'), b => Math.round(b.w)).values()) {
    const h = Math.max(...ts.map(b => b.h));
    for (const b of ts) b.h = h;
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
    const ends = !boxOf(id) && r.args?.length === 2 ? r.args.map(a => boxOf(a.at)) : null;
    const b = drawnBoxes.get(ends ? endsOf(id, ends)[1] : boxOf(id));
    if (!res || !b || res.value === 'none' || idsIn(res.note.pattern).size || !res.note.view) continue;
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
  // A frame's caption: small and grey, at its top left, in the chart's face.
  for (const f of frames.values()) {
    f.settings = { Frame: { value: f.kind, note: f.note } };
    const t = { ...TEXT, Size: 8, Bold: true, Color: '#595959', Align: 'left' };
    f.caption = { id: f.id, type: 'text', look: t, text: f.text };
    delete f.text;
    f.caption.lines = breakLines(f.caption.text, t, 400);
    f.label = f.caption.lines.length * lineHeight(t);
  }

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
    let y = 0;
    for (const it of l.texts) y = stack(it, 0, 0, y);
    const lastLine = l.texts.at(-1)?.lines.at(-1);
    l.label = l.texts.length ? { w: widest(l.texts), h: y, base: lastLine?.y ?? y, text: l.texts.map(it => it.text).join('\n'), shared: l.texts.length === 1 && l.texts[0] === own && !isField(r) } : null;
    l.trunk = ['Outline', 'Weight', 'Dash', 'Arrow'].map(k => l.settings[k].value).join('|');
    l.straight = l.settings.Connector.value === 'straight';
  }

  // The layout: entered positions win; ELK places the rest, frames as clusters, ranked by the lines, and
  // a box placed among entered ones keeps clear of the boxes, lines and free shapes already there. A
  // preview (a redline, or records revealed) keeps every box where the view was last drawn.
  const page = pageOf(N, view);
  const shapeRows = wb.rows(chart).filter(r => 'shape' in r && r.view === view);
  const preview = !!(red || opts.reveal?.length), drawnAs = `${chart}|${view}`;
  const placed = Layout.arrange({
    keep: preview ? laidOut.get(drawnAs) : null,
    boxes: boxes.map(b => ({ id: b.id, w: b.w, h: b.h, shape: b.shape })),
    links: lines.filter(l => l.ranks).map(l => ({ from: l.from, to: l.to })),
    lines: lines.map(l => ({ id: l.id, from: l.from, to: l.to, trunk: l.trunk, straight: l.straight })),
    obstacles: shapeRows.filter(r => !['line', 'group'].includes(r.geometry)).map(r => ({ x: r.x ?? 0, y: r.y ?? 0, w: r.w ?? 200, h: Math.max(r.h ?? 52, r.geometry === 'legend' ? 120 : 0) })),
    clusters: [...frames.values()].map(f => ({ id: f.id, parent: f.parent, members: f.members, top: f.label + 10 })),
    entered: positions, page,
  });
  if (!preview) laidOut.set(drawnAs, placed);
  for (const b of boxes) Object.assign(b, placed.get(b.id));
  // Boxes in a rank, their tops level, are one height: the tallest of them.
  for (const rank of groupBy(boxes.filter(b => b.shape !== 'triangle'), b => Math.round(b.y / 4)).values()) {
    const h = Math.max(...rank.map(b => b.h));
    for (const b of rank) b.h = h;
  }
  for (const b of boxes) setText(b);
  frameBounds(frames, boxes);
  routes(boxes, lines, frames).forEach((r, i) => Object.assign(lines[i], r));
  // Arrow Auto: an arrowhead where the line doesn't run down from its Above side.
  for (const l of lines) if (l.settings.Arrow.value === 'auto') l.settings.Arrow = { value: l.down ? 'none' : 'end', note: l.settings.Arrow.note };
  // Lines landing on one frame along one route are drawn once: the first stands for the rest, which stay
  // known by id, `merged` into it.
  for (const ls of groupBy(lines.filter(l => l.landed), l => `${l.trunk}|${JSON.stringify(l.points)}`).values()) for (const l of ls.slice(1)) l.merged = ls[0].id;

  // Free shapes: the view's own, each with its own formats.
  const geo = new Map(boxes.map(b => [b.id, b]));
  const shapes = wb.rows(chart).filter(r => 'shape' in r && r.view === view).map(r => freeShape(r, opts.computed, day));
  // A free line glued to a box leaves it where it faces the line's other end, and follows it.
  for (const s of shapes) if (s.geometry === 'line' && s.ends) {
    const ps = s.points, [a, b] = s.ends.map(id => geo.get(id) ?? shapes.find(x => x.id === id));
    if (a) ps[0] = edgePoint(a, ps[ps.length - 1]);
    if (b) ps[ps.length - 1] = edgePoint(b, ps[0]);
    Object.assign(s, bounds(ps.map(([x, y]) => ({ x, y, w: 0, h: 0 }))));
  }
  // The key is of what the view draws: what's revealed for a while doesn't change it.
  const legendRows = legend(N, view, styles, [...boxes, ...lines].filter(m => !m.revealed));
  for (const s of shapes) if (s.geometry === 'legend') layoutLegend(s, legendRows);
  const byId = new Map();
  for (const m of [...boxes, ...lines, ...frames.values(), ...shapes]) {
    byId.set(m.id, m);
    for (const it of m.texts ?? []) if (!byId.has(it.id)) byId.set(it.id, it);
  }
  for (const g of shapes.filter(s => s.geometry === 'group')) Object.assign(g, bounds(g.members.map(id => byId.get(id)).filter(Boolean)));

  // The page holds what's drawn, keeping its size's proportions.
  const all = [...boxes, ...frames.values(), ...shapes];
  const right = Math.max(0, ...all.map(m => m.x + m.w), ...lines.flatMap(l => l.points.map(p => p[0]))) + MARGIN;
  const bottom = Math.max(0, ...all.map(m => m.y + m.h), ...lines.flatMap(l => l.points.map(p => p[1]))) + MARGIN;
  const grow = Math.max(1, right / page.w, bottom / page.h);
  Object.assign(page, { w: Math.ceil(page.w * grow), h: Math.ceil(page.h * grow), scale: 1 / grow });

  const layer = m => m.settings?.Layer?.value ?? m.look?.Layer ?? 0;
  const marksInOrder = [
    ...[...frames.values()].sort((a, b) => depthOf(frames, a) - depthOf(frames, b)),
    ...lines.filter(l => !l.merged).sort((a, b) => layer(a) - layer(b)),
    ...boxes.sort((a, b) => layer(a) - layer(b)),
    ...shapes.sort((a, b) => layer(a) - layer(b)),
  ];
  for (const m of [...marksInOrder, ...lines]) { delete m.cand; if (m.type !== 'shape') delete m.ends; }
  return { chart, view, day, page, marks: marksInOrder, byId, styles, legend: legendRows, ms: now() - started };
}
// A free shape from a row not yet kept, as a scene would draw it: how big a new one will be.
function shapeOf(row, scene) {
  const m = freeShape({ shape: '·new', ...row }, null, scene.day);
  if (m.geometry === 'legend') layoutLegend(m, scene.legend);
  return m;
}

// A box's texts placed in it, once its height is known: at a triangle's base, 7 pt up; in the middle of
// anything else. Its `column` is the width its lines were broken to (a triangle's, its pyramid's).
function setText(b) {
  const tb = blockHeight(b.texts), width = Math.max(32, b.w * (TEXT_AREA[b.shape] ?? 1) - 2 * INSET);
  if (b.shape !== 'triangle') b.column = { x: (b.w - width) / 2, width };
  let y = b.shape === 'triangle' ? b.h - BASE - tb : (b.h - tb) / 2;
  for (const it of b.texts) y = stack(it, b.column.x, b.column.width, y);
}

// The middle of the side of a box that faces a point.
function edgePoint(g, [x, y]) {
  const cx = g.x + g.w / 2, cy = g.y + g.h / 2, dx = x - cx, dy = y - cy;
  return Math.abs(dx) * g.h > Math.abs(dy) * g.w ? [dx > 0 ? g.x + g.w : g.x, cy] : [cx, dy > 0 ? g.y + g.h : g.y];
}
const depthOf = (frames, f) => f.parent ? 1 + depthOf(frames, frames.get(f.parent)) : 0;
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
  const all = f => [...f.members, ...f.frames.flatMap(id => all(frames.get(id)))];
  const fs = [...frames.values()].map(f => ({ id: f.id, x: f.x, y: f.y, w: f.w, h: f.h, members: all(f), depth: depthOf(frames, f) }));
  Layout.route(new Map(boxes.map(b => [b.id, b])), copies, { frames: fs });
  return copies.map(c => ({ points: c.points, labelAt: c.labelAt, down: c.down, ...(c.landed && { landed: c.landed }) }));
}

// A frame around its members and the frames inside it, with room for its caption; a bracket over them.
function frameBounds(frames, boxes) {
  const byId = new Map(boxes.map(b => [b.id, b]));
  const done = new Set();
  const fit = f => {
    if (done.has(f.id)) return f;
    done.add(f.id);
    const inner = [...f.members.map(id => byId.get(id)), ...f.frames.map(id => fit(frames.get(id)))];
    const b = bounds(inner), pad = 10;
    if (f.kind === 'bracket') Object.assign(f, { x: b.x, y: b.y - f.label - 12, w: b.w, h: f.label + 6 });
    else Object.assign(f, { x: b.x - pad, y: b.y - pad - f.label, w: b.w + 2 * pad, h: b.h + 2 * pad + f.label });
    stack(f.caption, f.kind === 'bracket' ? 0 : 6, f.kind === 'bracket' ? f.w : 0, f.kind === 'bracket' ? 0 : 4);
    if (f.kind === 'bracket') { f.caption.look = { ...f.caption.look, Align: 'center' }; stack(f.caption, 0, f.w, 0); }
    return f;
  };
  for (const f of frames.values()) fit(f);
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

// The legend's rows: for each style and output from which a drawn box or line takes a property
// that tells marks apart, a swatch in that output's format, and its caption. Outputs of one style that
// look alike share a row.
function legend(N, view, styles, marks) {
  const used = new Map();
  for (const m of marks) for (const label of KEYED[m.type] ?? []) {
    const note = m.settings?.[label]?.note;
    if (!note || note.view !== view || idsIn(note.pattern).size) continue;
    const k = key(note.pattern);
    if (!used.has(k)) used.set(k, { pattern: note.pattern, style: key(bare(note.pattern)), kind: m.type });
  }
  const rows = [];
  styles.forEach((s, order) => {
    const mine = [...used.values()].filter(u => u.style === s.key);
    const groups = new Map();
    for (const u of mine) {
      const sw = swatch(u.kind, s.outputs.find(o => key(o.pattern) === key(u.pattern))?.formats ?? {});
      const sk = JSON.stringify([u.kind, ...KEYED[u.kind].map(k => sw[k])]);
      const g = groups.get(sk) ?? groups.set(sk, { style: s.key, order, outputs: [], swatch: sw }).get(sk);
      g.outputs.push(u.pattern);
    }
    for (const g of groups.values()) {
      // A row goes by its first output, which stays the same while the row does.
      g.key = key(g.outputs[0]);
      // Its caption: a Caption note's at one of its outputs; or the outputs, two at most, else the style's name.
      const own = g.outputs.map(p => N.resolve('Caption', p, view)).find(c => c && g.outputs.some(p => key(p) === key(c.note.pattern)));
      g.caption = own ? own.value : g.outputs.length > 2 ? styleName(N, s.pattern) : g.outputs.map(p => outputName(N, p)).join(', ');
      rows.push(g);
    }
  });
  return rows;
}

// A free shape, from its row: its geometry, place, formats and text.
const SHAPE_DEFAULTS = { Fill: '#ffffff', Outline: '#000000', Weight: 0.75, Dash: 'solid', Arrow: 'none', Layer: 0, ...TEXT };
const TEXTBOX = { Fill: 'none', Outline: 'none', Align: 'left', Size: 12 };
function freeShape(row, computed, day) {
  const { id, shape, view, format = {}, ...rest } = row;
  const base = { ...SHAPE_DEFAULTS, ...(row.geometry === 'text' && TEXTBOX), ...(row.geometry === 'legend' && { Size: 9, Outline: '#7f7f7f', Weight: 0.5, Align: 'left' }),
    ...(row.geometry === 'frame' && { Fill: 'none', Outline: '#595959', Dash: 'dashed', Size: 9, Italic: true, Align: 'left' }),
    ...(row.geometry === 'line' && { Arrow: 'none' }) };
  const t = { ...base, ...format };
  const m = { id: shape, type: 'shape', row: id, geometry: row.geometry ?? 'rect', x: row.x ?? 0, y: row.y ?? 0, w: row.w ?? 200, h: row.h ?? 52,
    look: t, settings: Object.fromEntries(Object.entries(t).map(([k, v]) => [k, { value: v, note: null }])), texts: [] };
  if (m.geometry === 'line') {
    m.points = (row.points ?? [[m.x, m.y], [m.x + m.w, m.y]]).map(p => [...p]);
    if (row.ends?.some(Boolean)) m.ends = row.ends;
    Object.assign(m, bounds(m.points.map(([x, y]) => ({ x, y, w: 0, h: 0 }))));
  }
  if (m.geometry === 'picture') m.src = row.src;
  if (m.geometry === 'group') m.members = row.members ?? [];
  if (m.geometry === 'legend') Object.assign(m, { title: row.title ?? 'Key', columns: row.columns ?? 1, hide: row.hide ?? [], captions: row.captions ?? {} });
  // A text box nobody has sized grows with its text, a line to each paragraph, as PowerPoint's does.
  if (m.geometry === 'text' && row.w == null) Object.assign(m, { auto: true, w: 120, h: lineHeight(t) + 9.6 });
  // A text that's a formula is worked out on the chart, @AsOf being the view's day.
  let text = row.text ?? '';
  if (/^\s*=/.test(text) && computed) text = Formulas.text(computed, Formulas.evaluateAt(computed, text, null, { '@AsOf': { t: 'date', iso: day } }));
  if (text && !['line', 'picture', 'group', 'legend'].includes(m.geometry)) {
    const inset = 9.6, share = TEXT_AREA[m.geometry] ?? 1, lines = breakLines(text, t, m.auto ? Infinity : Math.max(16, m.w * share - 2 * inset));
    if (m.auto) m.w = Math.ceil(widest([{ lines }]) + 2 * inset + 1);
    const avail = Math.max(16, m.w * share - 2 * inset);
    const it = { id: shape, type: 'text', look: t, settings: m.settings, text, lines };
    const tb = blockHeight([it]);
    if (m.geometry === 'text') m.h = m.auto ? tb + 9.6 : Math.max(m.h, tb + 9.6);
    stack(it, (m.w - avail) / 2, avail, m.geometry === 'frame' ? 5 : m.geometry === 'text' ? 4.8 : (m.h - tb) / 2);
    m.texts.push(it);
    m.column = { x: (m.w - avail) / 2, width: avail };
  }
  return m;
}

// A legend's rows laid out in its columns under its title. A row merging outputs that look alike may have a
// caption of the legend's own, which no output shares. `all` is every row it could show, each `shown` or not.
function layoutLegend(m, rows) {
  const t = m.look, pad = 12, sw = 30, gap = 8, lh = lineHeight(t);
  rows = rows.map(r => ({ ...r, caption: m.captions[r.key] ?? r.caption }));
  m.all = rows.map(r => ({ key: r.key, style: r.style, outputs: r.outputs, swatch: r.swatch, caption: r.caption, shown: !m.hide.includes(r.key) }));
  const shown = rows.filter(r => !m.hide.includes(r.key));
  const colW = (m.w - 2 * pad) / m.columns;
  const title = m.title ? { id: `${m.id}:title`, type: 'text', look: { ...t, Bold: true, Align: 'left' }, text: m.title } : null;
  let y = pad;
  if (title) { title.lines = breakLines(title.text, title.look, m.w - 2 * pad); y = stack(title, pad, m.w - 2 * pad, y) + 4; }
  const perCol = Math.ceil(shown.length / m.columns);
  const colTops = [y];
  m.rows = shown.map((r, i) => {
    const col = Math.floor(i / perCol);
    if (i % perCol === 0) y = colTops[0];
    const caption = { id: `${m.id}:${r.key}`, type: 'text', look: { ...t, Align: 'left' }, text: r.caption };
    caption.lines = breakLines(r.caption, caption.look, colW - sw - gap - 4);
    const x = pad + col * colW, h = Math.max(lh, caption.lines.length * lh);
    stack(caption, x + sw + gap, colW - sw - gap, y + (h - caption.lines.length * lh) / 2);
    const row = { key: r.key, style: r.style, outputs: r.outputs, swatch: r.swatch, x, y, w: colW, h, sw: { x, y: y + h / 2 - 7, w: sw, h: 14 }, caption };
    y += h + 5;
    return row;
  });
  const colBottom = m.rows.length ? Math.max(...m.rows.map(r => r.y + r.h)) : y;
  m.texts = title ? [title] : [];
  m.h = colBottom + pad;
}

// A view's page: its Page note at the View object, a named size or { w, h }; a slide where none says.
function pageOf(N, view) {
  const v = N.resolve('Page', { id: view, kind: 'View' })?.value ?? 'slide';
  const [w, h] = typeof v === 'object' ? [v.w, v.h] : PAGES[v] ?? PAGES.slide;
  return { size: typeof v === 'object' ? 'custom' : v in PAGES ? v : 'slide', w, h, margin: MARGIN, sheet: { w, h } };
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
  of, reflow, shapeOf, path, dash, measure, breakLines, reach, outputPattern, captionOf, outputName, styleName, swatch, swatchOf, fontFamily,
  toSlide, fromSlide, DEFAULTS, GEOMETRIES, PAGES, PT, FONTS: Object.keys(FONTS),
};
})();
