// Canvas: a view laid out as a chart, drawn on X6. It draws App.scene and nothing else, and keeps no copy of
// formats or positions: a gesture is a change through App.change, and the scene that follows is drawn. The
// gestures are PowerPoint's: click, Shift+click and the marquee; drag, with guides, a shape kept on the page;
// resize; Tab through the boxes, and the arrow keys; copy and paste; align, order and group; double-click to
// type; right-click for what applies. Delete deletes what's selected, as a change pending, and clears a field.
// Double-clicking the page adds a box, named as it's typed. A drag from near a box's edge to another box
// relates them, and to empty page adds a box to relate to it. The formula bar's highlight, redline and point
// mode, and the format bar's live preview, are drawn over the scene, or as a variant of it, which shows what
// the view hides. A scene is drawn by changing only the cells it changes, and only those on screen are drawn,
// so a chart of hundreds of boxes costs what a screenful does (see cellsTo).
const Canvas = (() => {
const { Graph, Selection, Transform, Snapline } = X6;
const { signal, effect } = preactSignals;
Graph.registerNode('dendra', { markup: [], attrs: {} }, true);
// A line another crosses is drawn in its runs, the scene's pieces, a gap where each crossing is.
Graph.registerConnector('runs', (s, t, route, { runs }) => runs.map(r => r.map(([x, y], i) => `${i ? 'L' : 'M'} ${x} ${y}`).join(' ')).join(' '), true);

const active = signal(null);
const zoomLevel = signal(1);
// What helps a hand place things, the session's, in no log: gridlines, snapping to them, rulers, the margins shown, and whether the view's guides show.
const aids = signal({ grid: false, snap: false, rulers: false, margins: false, guides: true });
// The field pointed at or selected on the chart, by its row's key in the inspector, which lights that row.
const fieldLit = signal(null);
// The field selected, as its box and record ("fund|fund_juris"), for what formats it (the format bar); null for none.
const fieldPicked = signal(null);
// While words are being typed that can be set part by part: the look at what's selected in them, for the format bar; null otherwise.
const rich = signal(null);
const BLUE = '#1f5fbf', RED = '#c2372b';
// Cells that draw no mark of their own, so nothing selects or moves them: the page, a line's label, a redline's ink.
const UNMARKED = new Set(['page', 'label', 'ink', 'guide', 'master']);
// The footer and its number, the chart's own and the sheet's: selected and formatted as any text is, but placed by the page.
const footOf = m => m?.role === 'footer' || m?.role === 'number';
const footNote = () => App.notes.peek().resolve('Footer', { kind: 'View' })?.value ?? {};
// An entry wherever it is, as a Shown or Format note at it reaches each box that has it.
const entryAnywhere = edge => ({ args: [{ edge, loc: {} }] });
// Taking one away: the footer's words, or the numbers; with neither left, the note and its look.
const unfoot = (tx, m) => { const { format, ...f } = footNote(), now = m.role === 'footer' ? { ...f, text: '' } : { ...f, number: false }; tx.note('Footer', { kind: 'View' }, now.text || now.number ? { ...now, ...(format && { format }) } : undefined); };
// As far out as the canvas goes: a chart of hundreds of boxes still fits.
const LEAST = 0.02;
const ANCHOR = { left: 'start', center: 'middle', right: 'end' };
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
// A selection key's mark, and the legend row it names after the first '#', if it names one.
const keyParts = k => { const i = k.indexOf('#'); return i < 0 ? [k, null] : [k.slice(0, i), k.slice(i + 1)]; };
const round = v => Math.round(v * 2) / 2;
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi));
// Sizes and weights are points; the canvas draws in pixels.
const px = pt => pt * Scene.PT;

// A free shape's row, as it's kept.
const rowOf = id => { const r = App.shown.peek().item(App.chart.peek(), id)[0]; if (!r) return null; const { id: _, shape, ...p } = r; return p; };
const nameOf = id => App.notes.peek().nameOf(App.state.peek(), id);
// A name mid-sentence, in lower case but for initials: "New investor group", "New GP".
const lowered = s => String(s).replace(/\b[A-Z](?=[a-z])/g, c => c.toLowerCase());
const viewName = id => App.views.peek().find(v => v.id === id)?.name ?? 'this view';

// The kinds a box can be added as here: the chart's, less those the view hides, the most drawn first; in a
// chart with none yet, a Box.
function kinds(scene = App.scene.peek()) {
  // (The master holds no records, only what every page draws.)
  if (scene?.view === Scene.MASTER) return [];
  const st = App.state.peek(), N = App.notes.peek(), count = new Map();
  for (const m of scene?.marks ?? []) if (m.type === 'box') { const k = st[m.record]?.kind; if (k) count.set(k, (count.get(k) ?? 0) + 1); }
  const all = new Set([...count.keys(), ...Object.values(App.schema.peek()).filter(s => !s.args && s.kind && !Tree.isView(s)).map(s => s.kind)]);
  const ks = [...all].filter(k => count.has(k) || !scene || N.value('Shown', { kind: k }, scene.view) !== false)
    .sort((a, b) => (count.get(b) ?? 0) - (count.get(a) ?? 0) || a.localeCompare(b));
  // (A kind of which there's none and of which nothing's said, as a blank chart's Box once its first box is a Person, isn't offered beside others.)
  const said = ks.filter(k => count.has(k) || Tree.index(st).kinds.get(Tree.norm(k))?.length || Object.values(App.schema.peek()).some(s => s.args?.length === 1 && Tree.same(s.args[0].loc?.kind ?? '', k) && !Tree.same(s.args[0].edge, 'Name')));
  return said.length ? said : ks.length ? ks : ['Box'];
}
// The kind last added, while it can be; or the most drawn.
const lastKind = () => { const ks = kinds(), k = Shell.store.get('kind'); return ks.includes(k) ? k : ks[0]; };

// ---- Groups and the scope (dendra.md, Fields) ----
// What each style reaches in a scene, by its output: the marks a record of it is in or at.
const reached = new WeakMap();
const reachOf = sc => App.ofScene(reached, sc, () => {
  const by = new Map();
  for (const m of sc.marks) if ((m.type === 'box' || m.type === 'line') && !m.revealed)
    for (const r of Scene.reach(App.shown.peek(), App.chart.peek(), sc.view, sc, m.id, App.state.peek()))
      (by.get(Tree.key(r.output)) ?? by.set(Tree.key(r.output), { output: r.output, marks: new Set() }).get(Tree.key(r.output))).marks.add(m.id);
  return by;
});
// The groups a mark is in, as the Key and Styles call them (Scene.groupsOf), each with the marks it reaches, the
// fewest first; or, where no style reaches it, its kind's, or its relation's: every box of its kind, every line alike.
function groupsAt(sc, m) {
  const by = reachOf(sc), st = App.state.peek(), out = [];
  for (const g of Scene.groupsOf(App.notes.peek(), sc.view)) {
    const marks = new Set(g.outputs.flatMap(p => [...by.values()].filter(o => Tree.narrower(o.output, p)).flatMap(o => [...o.marks])));
    if (marks.has(m.id)) out.push({ caption: g.caption, outputs: g.outputs, marks });
  }
  if (!out.length) {
    const r = st[m.record], t = Tree.treeOf(st, m.record);
    const p = !r || !t ? null : Tree.isObject(r) ? { kind: r.kind } : Tree.bare(Tree.specOf(t));
    const like = p && sc.marks.filter(x => x.type === m.type && !x.revealed && Tree.treeOf(st, x.record) && Tree.narrower(Tree.treeOf(st, x.record), p));
    if (like?.length) out.push({ caption: Tree.isObject(r) ? Tree.plural(r.kind) : Tree.plural(App.notes.peek().name(p)), outputs: [p], marks: new Set(like.map(x => x.id)) });
  }
  return out.sort((a, b) => a.marks.size - b.marks.size);
}
// The scope a field or a free text goes to: the format bar's (FormatBar.scope), This box, each mark's own record, or a
// group, at each of its outputs. → { own: true } or { outputs, caption, marks }
function scopeNow() {
  const s = typeof FormatBar !== 'undefined' && FormatBar.scope?.();
  return s?.outputs?.length ? s : { own: true };
}
// What's of a box rather than of the field picked in it (another field shown, a free text, a footnote) goes where the pen stands for the box.
function scopeOfBox() {
  const s = typeof FormatBar !== 'undefined' && FormatBar.scope?.(true);
  return s?.outputs?.length ? s : { own: true };
}
// A group, as the scope's toggle names it, mid-sentence: "all 6 funds".
const named = s => { const a = FormatBar.allOf(s, s.marks?.size ?? s.n ?? 0); return a[0].toLowerCase() + a.slice(1); };
// The boxes a group of a field's own entry reaches (Jurisdictions: Jurisdiction at no kind) are where the entry is: the
// object it's at, through the entries it's in, the scope a field of it is shown or hidden at.
function scopeAt(p, edge) {
  if (!(p.args?.length === 1 && !p.out && Tree.same(p.args[0].edge, edge))) return p;
  for (p = p.args[0].loc; p.args?.length === 1 && !p.out; p = p.args[0].loc);
  return p;
}
// A field's pattern at a scope's pattern p, in the mark whose record has tree `rec`: the entry's own, each step bare, with
// that record put as p, where it fits p; or else, the field beside p in the boxes p reaches, p with the field's label as
// its param. → [pattern, param]
function fieldAt(t, rec, p, edge) {
  const put = x => x === rec ? p : x.args ? { args: x.args.map(a => ({ edge: a.edge, loc: put(a.loc) })) } : x;
  return Tree.narrower(rec, p) ? [put(t), undefined] : [p, edge];
}

// Where a w × h shape can go on a scene's page: the nearest place to `near` (its middle) clear of every box,
// frame, shape and label by `gap`, and of every line by a lane's width either side, so nothing new is ever drawn on
// a line or reads as on it: just there where it's clear, or else on a grid; with `bands`, clear of the chart too, in the
// page's bands above, below or beside it. Where the page has no such place, null; or, `last`, just below everything.
function freeSpot(scene, w, h, near, { bands = false, gap = 16, lane = 24, last = false } = {}) {
  const page = scene.page, ms = page.margins ?? { left: page.margin, right: page.margin, top: page.margin, bottom: page.margin }, rects = [], segs = [], chart = { x: Infinity, y: Infinity, r: -Infinity, d: -Infinity };
  const take = (x, y, r, d) => Object.assign(chart, { x: Math.min(chart.x, x), y: Math.min(chart.y, y), r: Math.max(chart.r, r), d: Math.max(chart.d, d) });
  for (const k of scene.marks) {
    if (k.points) {
      k.points.slice(1).forEach((p, i) => segs.push([k.points[i], p]));
      if (k.labelAt && k.label) rects.push({ x: k.labelAt.x, y: k.labelAt.y, w: k.label.w, h: k.label.h });
      if (k.type === 'line') for (const [x, y] of k.points) take(x, y, x, y);
    } else if (k.geometry !== 'group') {
      rects.push(k);
      if (k.type !== 'shape') take(k.x, k.y, k.x + k.w, k.y + k.h);
    }
  }
  const g = Math.max(gap, lane);
  const clear = (x, y) => !(bands && x < chart.r + gap && x + w + gap > chart.x && y < chart.d + gap && y + h + gap > chart.y)
    && !rects.some(r => x < r.x + r.w + gap && x + w + gap > r.x && y < r.y + r.h + gap && y + h + gap > r.y)
    && !segs.some(([a, b]) => Math.max(a[0], b[0]) >= x - g && Math.min(a[0], b[0]) <= x + w + g && Math.max(a[1], b[1]) >= y - g && Math.min(a[1], b[1]) <= y + h + g);
  const x0 = ms.left, y0 = ms.top, x1 = page.w - ms.right - w, y1 = page.h - ms.bottom - h, cx = clamp(near.x - w / 2, x0, x1), cy = clamp(near.y - h / 2, y0, y1);
  if (clear(cx, cy)) return { x: cx, y: cy };
  const step = Math.max(8, Math.ceil(Math.max(page.w, page.h) / 160)), spots = [];
  for (let x = x0; x <= x1; x += step) for (let y = y0; y <= y1; y += step) spots.push({ x, y, d: Math.hypot(x - cx, y - cy) });
  const best = spots.sort((a, b) => a.d - b.d).find(p => clear(p.x, p.y));
  return best ?? (last ? { x: cx, y: Math.max(0, ...rects.map(r => r.y + r.h), ...segs.flat().map(p => p[1])) + gap * 2 } : null);
}

// ---- Drawing: each mark as X6 cells ----

// A text; `faint`, in a box drawn only while it's asked about. A blank field is its entry's name, faint, the canvas's
// alone, and only in a box selected, pointed at or in the scope chosen; elsewhere its room is empty, as it prints
// (dendra.md, Fields).
function textMarkup(it, red, faint) {
  const t = it.blank ? { ...it.look, Color: BLANK, Bold: false, Underline: false } : it.look, tone0 = c => red === 'appear' ? BLUE : red === 'go' ? RED : c;
  // WordArt's: a gradient for its fill, a line round its letters.
  const wash = t['Text Gradient']?.stops?.length && !red && !it.blank ? `url(#${gradient(t['Text Gradient'])})` : null, rim = t['Text Outline'] && !red && !it.blank ? { stroke: t['Text Outline'].color ?? '#000000', 'stroke-width': px(t['Text Outline'].weight ?? 0.75), 'paint-order': 'stroke fill' } : null, tone = c => wash ?? tone0(c);
  return {
    tagName: 'text', attrs: {
      'font-family': Scene.fontFamily(t.Font), 'font-size': px(t.Size), 'font-weight': t.Bold ? 700 : 400,
      'font-style': t.Italic || it.computed || it.blank ? 'italic' : 'normal', 'text-anchor': ANCHOR[t.Align] ?? 'middle', 'data-text': it.id, ...(faint && { opacity: FAINT }),
      ...(it.blank && { class: it.blank.reads ? 'dc-asks' : 'dc-blank' }), ...rim, ...(it.turn && { transform: it.turn }),
    },
    children: it.lines.flatMap(l => {
      const r = l.red ?? it.redline ?? red;
      const deco = [t.Underline && 'underline', (t.Strike || r === 'go') && 'line-through'].filter(Boolean).join(' ');
      const mark = l.bullet ? [{ tagName: 'tspan', attrs: { x: l.bulletAt, y: l.y, fill: tone(t.Color), 'text-anchor': 'start' }, textContent: l.bullet }] : [];
      if (l.tabs) return [...mark, ...l.tabs.map(sp => ({ tagName: 'tspan', attrs: { x: l.x + sp.at, y: l.y, fill: tone(t.Color), 'text-anchor': 'start', ...(deco && { 'text-decoration': deco }) }, textContent: sp.text }))];
      if (!l.spans) return [...mark, { tagName: 'tspan', attrs: { x: l.x, y: l.y, fill: r === 'appear' ? BLUE : r === 'go' ? RED : tone(t.Color), ...(deco && { 'text-decoration': deco }), ...(l.ink && { 'data-ink': '' }) }, textContent: l.text }];
      // Part of it in another look: its spans one after another along the line, a superscript raised as PowerPoint raises one.
      let off = 0;
      return [...mark, { tagName: 'tspan', attrs: { x: l.x, y: l.y }, children: l.spans.map(sp => {
        const up = sp.base ? -Scene.BASE[sp.base] * px(t.Size) : 0, dy = up - off, s = sp.look, d = [s.Underline && 'underline', (s.Strike || r === 'go') && 'line-through'].filter(Boolean).join(' ');
        off = up;
        return { tagName: 'tspan', attrs: { ...(dy && { dy }), fill: r === 'appear' ? BLUE : r === 'go' ? RED : tone(s.Color), 'font-family': Scene.fontFamily(s.Font), 'font-size': px(s.Size), 'font-weight': s.Bold ? 700 : 400, 'font-style': s.Italic ? 'italic' : 'normal', ...(d && { 'text-decoration': d }) }, textContent: sp.text };
      }) }];
    }),
  };
}
// A gradient fill: a look's Fill drawn by its stops, from one colour to the next along its angle, clockwise from the right, as PowerPoint's linear gradient. One for each, in the page of the document's own that shadows are in.
const gradients = new Set();
function gradient(o) {
  const stops = o.stops ?? [], id = `dc-grad-${(o.angle ?? 0)}-${stops.map(([at, c]) => `${at}${String(c).replace('#', '')}`).join('-')}`.replace(/[^\w-]/g, '_');
  if (gradients.has(id) && document.getElementById(id)) return id;
  gradients.add(id);
  defsHere().insertAdjacentHTML('beforeend', Shapes.gradientDef(id, o));
  return id;
}
// A pattern fill: its strokes over its Fill, a tile of each in the same place.
function hatch(o, bg) {
  const id = `dc-patt-${o.prst}-${String(o.fg ?? '').replace('#', '')}-${String(bg ?? '').replace('#', '')}`.replace(/[^\w-]/g, '_');
  if (!document.getElementById(id)) defsHere().insertAdjacentHTML('beforeend', Shapes.patternDef(id, o, bg));
  return id;
}
function defsHere() {
  let defs = document.getElementById('dc-shadows');
  if (!defs) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    svg.innerHTML = '<defs id="dc-shadows"></defs>';
    document.body.append(svg);
    defs = svg.firstChild;
  }
  return defs;
}
// A shape flipped, as its row says: mirrored in its own frame, its text left to read.
const flipped = (f, w, h) => f ? `translate(${f.h ? w : 0} ${f.v ? h : 0}) scale(${f.h ? -1 : 1} ${f.v ? -1 : 1})` : null;
const paint = v => !v || v === 'none' ? 'none' : v;
// A stroke's width on screen: a whole number of the screen's pixels, one at least, by the zoom, so strokes of one weight render alike at
// any zoom. On screen only: the PDF and the deck print the weight as it is. A class for each weight, one rule each, rewritten as the zoom changes.
const weights = new Map();
let screenPerPage = 1;
function writeWeights() {
  const el = document.getElementById('dc-weights') ?? document.head.appendChild(Object.assign(document.createElement('style'), { id: 'dc-weights' }));
  el.textContent = [...weights].map(([w, c]) => `.dc .${c}{stroke-width:${Math.max(1, Math.round(w * screenPerPage)) / screenPerPage}px}`).join('');
}
const crisp = w => { const k = +w.toFixed(3); let c = weights.get(k); if (!c) { weights.set(k, c = `dcw${weights.size}`); writeWeights(); } return c; };
const zoomedTo = d => { if (d !== screenPerPage) { screenPerPage = d; writeWeights(); } };
// A box's or shape's body: its shape (a rounded rectangle's corners as its Corner says), its fill as transparent
// as its Transparency, its outline, and its Shadow.
function bodyMarkup(shape, w, h, s, red, extra = {}) {
  const stroke = red ? (red === 'appear' ? BLUE : RED) : s['Line Gradient']?.stops?.length ? `url(#${gradient(s['Line Gradient'])})` : paint(s.Outline), clear = Math.min(100, Math.max(0, s.Transparency ?? 0)), d = Scene.outlineOf(shape, w, h, s);
  const fill = s.Picture?.src && !red ? `url(#${picture(s.Picture, w, h, paint(s.Fill))})` : s.Gradient?.stops?.length && !red ? `url(#${gradient(s.Gradient)})` : s.Pattern?.prst && !red ? `url(#${hatch(s.Pattern, paint(s.Fill))})` : paint(s.Fill);
  const lineClear = s['Line Transparency'] > 0 ? { 'stroke-opacity': 1 - s['Line Transparency'] / 100 } : null, line = { stroke, 'stroke-width': px(s.Weight), class: crisp(px(s.Weight)), 'stroke-dasharray': Scene.dash(s.Dash, s.Weight) ?? (red === 'go' ? '4 3' : null), 'stroke-linejoin': s.Points?.round ? 'round' : 'miter', ...(s.Points?.round && { 'stroke-linecap': 'round' }), ...lineClear };
  const compound = s.Compound && s.Compound !== 'single' && paint(s.Outline) !== 'none' && !red, reflecting = s.Reflection && !red;
  const fx = !red && Shapes.hasEffect(s) ? { filter: `url(#${effects(drawnAt, s)})` } : Scene.shadowOf(s.Shadow) ? { filter: `url(#${shadow(drawnAt, Scene.shadowOf(s.Shadow))})` } : null;
  const main = { tagName: 'path', selector: 'body', attrs: { d, fill, ...(clear && { 'fill-opacity': 1 - clear / 100 }), ...(compound ? { stroke: 'none' } : line), ...fx, ...extra } };
  if (!compound && !reflecting) return main;
  const parts = [main];
  if (compound) parts.push({ tagName: 'path', attrs: { d, fill: 'none', ...line, filter: `url(#${hollow(s.Compound, px(s.Weight))})`, 'pointer-events': 'none', ...(extra.transform && { transform: extra.transform }) } });
  if (reflecting) {
    const r = s.Reflection, off = 2 * h + px(r.distance ?? 0) / drawnAt;
    parts.unshift({ tagName: 'path', attrs: { d, fill, stroke, 'stroke-width': px(s.Weight), transform: `translate(0 ${off}) scale(1 -1)${extra.transform ? ` ${extra.transform}` : ''}`, mask: `url(#${reflectionOf(r)})`, 'pointer-events': 'none' } });
  }
  return { tagName: 'g', children: parts };
}
// What a line has beyond its color and weight: how transparent, a gradient along what it runs, a compound's gaps.
function lineLook(ps, s) {
  const g = s['Line Gradient'], out = {};
  if (g?.stops?.length) { const xs = ps.map(p => p[0]), ys = ps.map(p => p[1]), b = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }, id = `dc-lgrad-${Shapes.hashed(JSON.stringify([g, b]))}`; out.stroke = `url(#${defined(id, () => Shapes.lineGradientDef(id, g, b))})`; }
  if (s['Line Transparency'] > 0) out.strokeOpacity = 1 - s['Line Transparency'] / 100;
  if (s.Compound && s.Compound !== 'single') out.filter = `url(#${hollow(s.Compound, px(s.Weight))})`;
  return out;
}
// A definition of the document's own that shadows are in, one for each look: all of a body's effects as one filter, its reflection's fade, a compound line's gaps, a picture filling it.
const madeDefs = new Set();
const defined = (id, def) => { if (!madeDefs.has(id) || !document.getElementById(id)) { madeDefs.add(id); defsHere().insertAdjacentHTML('beforeend', def()); } return id; };
const effects = (at, s) => { const id = `dc-fx-${Math.round(at * 1000)}-${Shapes.hashed(Shapes.effectKey(s))}`; return defined(id, () => Shapes.effectDef(id, s, px(1) / at)); };
const reflectionOf = r => { const id = `dc-refl-${Shapes.hashed(JSON.stringify(r))}`; return defined(id, () => Shapes.reflectionMask(id, r)); };
const hollow = (c, W) => { const id = `dc-cmpd-${c}-${Math.round(W * 100)}`; return defined(id, () => Shapes.compoundDef(id, c, W)); };
const picture = (o, w, h, bg) => { const id = `dc-pic-${Shapes.hashed(o.src)}-${Math.round(w)}-${Math.round(h)}-${o.tile ? 't' : 's'}-${String(bg).replace('#', '')}`; return defined(id, () => Shapes.pictureDef(id, o, w, h, bg)); };
// PowerPoint's outer shadow, as a filter for a page drawn at a scale: its distance, blur and color, each the sheet's, as a
// weight is, however much smaller the chart is drawn. One filter for each scale and shadow, in a page of the document's own,
// which every canvas's drawing refers to.
let drawnAt = 1;
const shadows = new Set();
function shadow(s, o) {
  const id = `dc-shadow-${Math.round(s * 1000)}-${[o.blur, o.distance, o.angle, o.color.replace('#', ''), o.transparency].join('-').replace(/[^\w-]/g, '_')}`;
  if (shadows.has(id) && document.getElementById(id)) return id;
  shadows.add(id);
  const a = o.angle * Math.PI / 180, dx = px(o.distance) * Math.cos(a) / s, dy = px(o.distance) * Math.sin(a) / s, blur = px(o.blur) / 2 / s;
  defsHere().insertAdjacentHTML('beforeend', `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%" color-interpolation-filters="sRGB">`
    + `<feDropShadow dx="${dx}" dy="${dy}" stdDeviation="${blur}" flood-color="${o.color}" flood-opacity="${1 - o.transparency / 100}"/></filter>`);
  return id;
}
const look = m => m.look ?? Object.fromEntries(Object.entries(m.settings).map(([k, v]) => [k, v.value]));
// An arrowhead, of its Arrowhead's style and size, at a line's end; on a route, no longer than the leg it ends (`leg`, its
// two points), so that it never reaches back past the turn into that leg (regress9 8).
const MARKERS = { triangle: () => ({ name: 'block' }), stealth: () => ({ name: 'classic', factor: 0.75 }), open: () => ({ name: 'block', open: true, fill: 'none' }), oval: (l, w) => ({ name: 'ellipse', rx: l / 2, ry: w / 2, cx: l / 2 }), diamond: () => ({ name: 'diamond' }) };
const marker = (on, w, leg = null, head = { type: 'triangle', size: 'small' }) => {
  if (!on) return null;
  const { len, wide } = Scene.headSize(head, w), k = leg ? Math.min(1, Math.hypot(leg[1][0] - leg[0][0], leg[1][1] - leg[0][1]) / len) : 1;
  return { width: len * k, height: wide * k, offset: 0, ...(MARKERS[head.type] ?? MARKERS.triangle)(len * k, wide * k) };
};
// A line's width, `w`, through `ps` with an arrowhead at its start or end. X6 ends a path short of an arrowhead's end by
// the width its attributes give the line, back toward the point before: where the leg an arrowhead ends is shorter than
// the line is wide, its attributes give it half that leg and its style the width it's drawn at, so the path ends on
// that leg, never back past the turn (regress10 7).
const widthOf = (ps, w, start, end) => {
  const leg = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]), least = Math.min(start ? leg(ps[0], ps[1] ?? ps[0]) : Infinity, end ? leg(ps.at(-1), ps.at(-2) ?? ps.at(-1)) : Infinity);
  return { strokeWidth: least < w ? least / 2 : w, class: crisp(w), ...(ps.every((p, i) => !i || p[0] === ps[i - 1][0] || p[1] === ps[i - 1][1]) && { shapeRendering: 'crispEdges' }) };
};
// How strongly a mark the view hides is drawn while it's asked about. A box keeps its fill, so no line
// behind it shows through its name.
const FAINT = 0.55;
// A blank field's name: a placeholder's grey, on the page's white.
const BLANK = '#a3a8ad';

// A cell in two parts, as JSON: where it is, which moving it changes, each of its keys apart; and what it is. A
// line's `form` is what it is less its attributes' values: which it sets, and how, which setting its attributes again
// can't take away (an arrowhead, a dash), but can give other values (a weight at another scale, a colour).
const WHERE = new Set(['x', 'y', 'width', 'height', 'angle', 'zIndex', 'source', 'target', 'vertices', 'connector']);
function partsOf(c) {
  const where = {}, what = [];
  for (const k in c) if (WHERE.has(k)) where[k] = JSON.stringify(c[k]); else what.push(k, c[k]);
  const form = c.shape === 'edge' ? JSON.stringify(what.map(x => x === c.attrs ? JSON.stringify(x, (k, v) => typeof v === 'number' || typeof v === 'string' ? typeof v : v) : x)) : null;
  return { where, what: JSON.stringify(what), form };
}
// A cell moved to where `c` puts it: the props of it that differ from `was`, set at once in the cell's store,
// which replaces each (a prop object given to the cell itself is merged into the old, keeping a line's old
// bends), and draws it once.
function moveCell(cell, c, was) {
  const moved = (...ks) => ks.some(k => was[k] !== JSON.stringify(c[k])), props = {};
  if (cell.isEdge()) { for (const k of ['source', 'target', 'vertices', 'connector']) if (moved(k)) props[k] = c[k]; }
  else {
    if (moved('x', 'y')) props.position = { x: c.x, y: c.y };
    if (moved('width', 'height')) props.size = { width: c.width, height: c.height };
    if (moved('angle')) props.angle = c.angle ?? 0;
  }
  if (moved('zIndex')) props.zIndex = c.zIndex;
  if (Object.keys(props).length) cell.store.set(props);
}

// The cells for a scene, by id, each with what it's drawn from, to redraw only what changed; with `ink`, a
// redline's (see inked), over it: what would appear in blue, a text that would change in blue under what it said,
// struck in red, and a text that would go struck in red where it is. Ink moves nothing: every cell is where the
// scene puts it.
function cellsOf(scene, ink = null) {
  drawnAt = scene.page?.scale ?? 1;
  const cells = [], z = new Map(scene.marks.map((m, i) => [m.id, i * 2]));
  // (What's on the chart's master is drawn on a page, and nothing on it can be pressed there: it's edited on the master.)
  const node = (m, kind, markup, extra = {}) => cells.push({ id: m.id, shape: 'dendra', x: m.x, y: m.y, width: Math.max(1, m.w), height: Math.max(1, m.h),
    zIndex: z.get(m.id), markup: inDepth(m, m.master ? [{ tagName: 'g', attrs: { 'pointer-events': 'none' }, children: markup }] : markup), data: { kind: m.master ? 'master' : kind, mark: m.id }, ...(m.rotate && { angle: m.rotate }), ...extra });
  // (A box or shape turned in depth, its words with it, by the one transform.)
  const inDepth = (m, markup) => { const t = m.look?.['Turn 3D'] ?? m.settings?.['Turn 3D']?.value; return t ? [{ tagName: 'g', attrs: { transform: Shapes.turned3d(t, m.w, m.h) }, children: markup }] : markup; };
  const red = m => ink?.go.has(m.record) ? 'go' : ink?.appear.has(m.record) ? 'appear' : null;
  // A text as the ink has it: a changed one's new lines under its old, struck; one appearing, blue.
  const inkOn = it => {
    const was = ink?.was.get(it.id), lh = Scene.lineHeight(it.look);
    return was === undefined ? (ink?.appear.has(it.id) ? { ...it, redline: 'appear' } : it)
      : { ...it, redline: 'appear', lines: [{ ...it.lines[0], y: it.lines[0].y - lh, text: was, red: 'go', ink: true }, ...it.lines] };
  };
  const textsOf = m => [...m.texts.map(inkOn), ...(ink?.texts.get(m.id) ?? []).map(it => ({ ...it, redline: 'go', lines: it.lines.map(l => ({ ...l, ink: true })) }))];
  for (const m of scene.marks) {
    const s = look(m);
    if (m.type === 'box') {
      // (A box of a design: its body, its parts over it, then what's in no part. They're of its one cell, so they go where it goes, fly with it and can't be picked up apart from it: dendra.md, Group designs.)
      node(m, 'box', [bodyMarkup(m.shape, m.w, m.h, s, red(m), { 'data-tour': 'box', ...(m.revealed && { 'stroke-opacity': FAINT }) }),
        ...(m.parts ?? []).map(p => partMarkup(p, m, it => textMarkup(inkOn(it), red(m), m.revealed))),
        ...textsOf(m).filter(it => !it.part).map(it => textMarkup(it, red(m), m.revealed))]);
    } else if (m.type === 'line') {
      const ps = m.points, dashed = Scene.dash(s.Dash, s.Weight) ?? (m.computed && !m.settings.Dash.note ? Scene.dash('dashed', s.Weight) : null) ?? (red(m) === 'go' ? '4 3' : null);
      const arrow = s.Arrow, r = red(m);
      // A very short line is picked by a little more than it shows: over the boxes it joins, and past its ends into them.
      const short = ps.reduce((n, p, i) => n + (i ? Math.hypot(p[0] - ps[i - 1][0], p[1] - ps[i - 1][1]) : 0), 0) < 16;
      cells.push({ id: m.id, shape: 'edge', zIndex: short ? scene.marks.length * 2 + z.get(m.id) : z.get(m.id), data: { kind: 'line', mark: m.id },
        source: { x: ps[0][0], y: ps[0][1] }, target: { x: ps[ps.length - 1][0], y: ps[ps.length - 1][1] },
        vertices: ps.slice(1, -1).map(([x, y]) => ({ x, y })), router: { name: 'normal' }, connector: m.runs ? { name: 'runs', args: { runs: m.runs } } : { name: 'normal' },
        attrs: { line: { stroke: r === 'appear' ? BLUE : r === 'go' ? RED : paint(s.Outline), ...widthOf(ps, px(s.Weight), arrow === 'start' || arrow === 'both', arrow === 'end' || arrow === 'both'), strokeDasharray: dashed,
          strokeLinecap: s.Dash === 'dotted' ? 'round' : 'butt', strokeLinejoin: 'miter', targetMarker: marker(arrow === 'end' || arrow === 'both', px(s.Weight), ps.slice(-2), Scene.headOf(s, 'end')),
          sourceMarker: marker(arrow === 'start' || arrow === 'both', px(s.Weight), ps.slice(0, 2), Scene.headOf(s, 'start')), ...(r ? null : lineLook(ps, s)), ...(m.revealed && { opacity: FAINT }) }, wrap: { strokeWidth: short ? 14 : 10, ...(short && { strokeLinecap: 'square' }) } } });
      if (m.texts.length && Number.isFinite(m.labelAt?.x) && Number.isFinite(m.labelAt?.y)) cells.push({ id: `${m.id}·label`, shape: 'dendra', x: m.labelAt.x, y: m.labelAt.y, width: m.label.w || 1, height: m.label.h || 1,
        zIndex: z.get(m.id) + 1, data: { kind: 'label', mark: m.id }, markup: [...(m.chip ? [(({ selector, ...body }) => body)(bodyMarkup(m.chip.Shape ?? 'rect', m.label.w + 8, m.label.h + 2, m.chip, null, { transform: 'translate(-4 -1)' }))] : []), ...textsOf(m).map(it => textMarkup(it, r))] });
    } else if (m.type === 'frame') {
      const d = m.lone ? '' : m.kind === 'bracket' ? `M0.5,${m.h} V${m.h - 5} H${m.w - 0.5} V${m.h}` : `M0,0 H${m.w} V${m.h} H0 Z`;
      node(m, 'frame', [{ tagName: 'path', selector: 'body', attrs: { d, fill: 'none', stroke: '#595959', 'stroke-width': px(m.settings.Weight.value), 'pointer-events': 'visibleStroke',
        'stroke-dasharray': m.kind === 'solid' || m.kind === 'bracket' ? null : Scene.dash(m.kind === 'dotted' ? 'dotted' : 'dashed', m.settings.Weight.value) } },
        { tagName: 'rect', attrs: { x: 0, y: 0, width: m.w, height: m.kind === 'bracket' ? m.h : m.label + 6, fill: 'transparent' } },
        textMarkup(m.caption)]);
    } else if (m.type === 'shape') {
      if (m.geometry === 'line') {
        const ps = m.points;
        cells.push({ id: m.id, shape: 'edge', zIndex: z.get(m.id), data: { kind: m.master ? 'master' : 'shape', mark: m.id },
          source: { x: ps[0][0], y: ps[0][1] }, target: { x: ps[ps.length - 1][0], y: ps[ps.length - 1][1] }, vertices: ps.slice(1, -1).map(([x, y]) => ({ x, y })),
          attrs: { line: { stroke: paint(s.Outline), strokeWidth: px(s.Weight), strokeDasharray: Scene.dash(s.Dash, s.Weight), targetMarker: marker(s.Arrow === 'end' || s.Arrow === 'both', px(s.Weight), null, Scene.headOf(s, 'end')),
            sourceMarker: marker(s.Arrow === 'start' || s.Arrow === 'both', px(s.Weight), null, Scene.headOf(s, 'start')), ...lineLook(ps, s), ...(m.master && { pointerEvents: 'none' }) }, wrap: { strokeWidth: m.master ? 0 : 10, ...(m.master && { pointerEvents: 'none' }) } } });
      } else if (m.geometry === 'legend') node(m, 'shape', legendMarkup(m, s));
      else if (m.geometry === 'group') continue;
      // (The footer and its number are the sheet's, set in Page setup.)
      else node(m, m.role === 'footer' || m.role === 'number' ? 'foot' : 'shape', shapeMarkup(m, s));
    }
  }
  return cells;
}
// A free shape's drawing, of its own frame: a picture, a table, or its body and its words. So a part of a design has all a free shape has (see partMarkup).
function shapeMarkup(m, s, textOf = it => textMarkup(it)) {
  if (m.geometry === 'picture') return [{ tagName: 'g', attrs: { ...(m.flip && { transform: flipped(m.flip, m.w, m.h) }) }, children: [m.crop ? croppedImage(m) : { tagName: 'image', attrs: { href: m.src, width: m.w, height: m.h, preserveAspectRatio: 'xMidYMid meet' } }] },
    { tagName: 'rect', attrs: { width: m.w, height: m.h, fill: 'transparent', stroke: paint(s.Outline === '#000000' ? 'none' : s.Outline), 'stroke-width': px(s.Weight) } }];
  if (m.geometry === 'table') return tableMarkup(m, s);
  const geometry = m.geometry === 'text' || m.geometry === 'frame' ? 'rect' : m.geometry;
  const body = bodyMarkup(geometry, m.w, m.h, s, null, { ...(m.geometry === 'frame' && { 'pointer-events': 'visibleStroke' }), ...(m.flip && { transform: flipped(m.flip, m.w, m.h) }) });
  // (A freeform with no fill is picked by its line and a little more; an icon, by the square it stands in.)
  const pick = m.geometry !== 'freeform' || paint(s.Fill) !== 'none' ? [] : s.Points?.round ? [{ tagName: 'rect', attrs: { width: m.w, height: m.h, fill: 'transparent' } }] : [{ tagName: 'path', attrs: { d: Scene.outlineOf(geometry, m.w, m.h, s), fill: 'none', stroke: 'transparent', 'stroke-width': 10, ...(m.flip && { transform: flipped(m.flip, m.w, m.h) }) } }];
  return [body, ...pick, ...(m.geometry === 'text' || m.geometry === 'frame' ? [{ tagName: 'rect', attrs: { width: m.w, height: m.geometry === 'frame' ? 18 : m.h, fill: 'transparent' } }] : []), ...m.texts.map(textOf)];
}
// A free line's drawing, by its points, less (ox, oy): its path and its arrowheads, as the swatches and the PDF draw them; how transparent, a gradient along it, a compound's gaps.
function lineMarkup(m, s, ox, oy) {
  const ps = m.points.map(([x, y]) => [x - ox, y - oy]), ink = paint(s.Outline), w = px(s.Weight), { stroke, strokeOpacity, filter } = lineLook(m.points, s);
  const head = ([x, y], [qx, qy], end) => { const h = Scene.headOf(s, end), { len, wide } = Scene.headSize(h, w), d = Math.hypot(x - qx, y - qy) || 1, ux = (x - qx) / d, uy = (y - qy) / d, at = (a, c) => `${x - ux * a - uy * c},${y - uy * a + ux * c}`;
    return { tagName: 'path', attrs: { d: `M${at(0, 0)} L${at(len, wide / 2)} L${at(len, -wide / 2)} Z`, fill: ink, stroke: 'none' } }; };
  return [{ tagName: 'path', attrs: { d: `M${ps.map(p => p.join(',')).join(' L')}`, fill: 'none', stroke: stroke ?? ink, 'stroke-width': w, 'stroke-dasharray': Scene.dash(s.Dash, s.Weight), ...(strokeOpacity != null && { 'stroke-opacity': strokeOpacity }), ...(filter && { filter }) } },
    ...['end', 'both'].includes(s.Arrow) && ink !== 'none' ? [head(ps.at(-1), ps.at(-2), 'end')] : [], ...['start', 'both'].includes(s.Arrow) && ink !== 'none' ? [head(ps[0], ps[1], 'start')] : []];
}
// A mark's drawing without what names its body, which a cell has one of: at any depth, as an effect's drawing keeps it inside a group.
const unnamed = x => { const { selector, ...rest } = x; return rest.children ? { ...rest, children: rest.children.map(unnamed) } : rest; };
// A part of a design, drawn in its box's cell, or in a swatch's room at (ox, oy): a free shape's drawing, set where it stands, turned about its middle, or in depth.
function partMarkup(p, at, textOf, ox = at.x, oy = at.y) {
  const s = look(p), deep = s['Turn 3D'];
  if (p.geometry === 'line') return { tagName: 'g', attrs: { 'data-part': p.part ?? p.id }, children: lineMarkup(p, s, ox, oy) };
  const drawn = shapeMarkup(p, s, textOf).map(unnamed);
  return { tagName: 'g', attrs: { 'data-part': p.part ?? p.id, transform: `translate(${p.x - ox} ${p.y - oy})${p.rotate ? ` rotate(${p.rotate} ${p.w / 2} ${p.h / 2})` : ''}` }, children: deep ? [{ tagName: 'g', attrs: { transform: Shapes.turned3d(deep, p.w, p.h) }, children: drawn }] : drawn };
}

// A table: each cell's fill, its rules, its words; each cell knows where it is, for a click, and each rule between columns, for a drag.
function tableMarkup(m, s) {
  const t = m.table, W = px(s.Weight), rules = paint(s.Outline) === 'none' ? '' : [...t.rows.map(r => `M0,${r.y} H${m.w}`), `M0,${m.h} H${m.w}`, ...t.xs.map(x => `M${x},0 V${m.h}`), `M${m.w},0 V${m.h}`].join(' ');
  return [
    { tagName: 'rect', selector: 'body', attrs: { width: m.w, height: m.h, fill: 'transparent' } },
    ...t.rows.flatMap(r => r.cells.map(k => ({ tagName: 'rect', attrs: { x: k.x, y: r.y, width: k.w, height: r.h, fill: paint(k.fill) === 'none' ? 'transparent' : k.fill, 'data-tcell': `${r.i},${k.c}` } }))),
    { tagName: 'path', attrs: { d: rules, fill: 'none', stroke: paint(s.Outline), 'stroke-width': W, class: crisp(W), 'pointer-events': 'none', 'stroke-dasharray': Scene.dash(s.Dash, s.Weight) } },
    ...t.rows.flatMap(r => r.cells.filter(k => k.it.lines.length).map(k => ({ ...textMarkup(k.it), attrs: { ...textMarkup(k.it).attrs, 'pointer-events': 'none' } }))),
    ...t.xs.slice(1).map((x, i) => ({ tagName: 'rect', attrs: { class: 'dc-tcol', x: x - 3, y: 0, width: 6, height: m.h, fill: 'transparent', 'data-tcol': i } })),
  ];
}
// A picture cropped: the whole of it placed where what's left falls in its frame, the rest cut by the frame.
function croppedImage(m) {
  const c = { left: 0, top: 0, right: 0, bottom: 0, ...m.crop }, fw = m.w / (1 - (c.left + c.right) / 100), fh = m.h / (1 - (c.top + c.bottom) / 100);
  return { tagName: 'svg', attrs: { class: 'dc-crop', width: m.w, height: m.h, viewBox: `0 0 ${m.w} ${m.h}` }, children: [{ tagName: 'image', attrs: { href: m.src, x: -fw * c.left / 100, y: -fh * c.top / 100, width: fw, height: fh, preserveAspectRatio: 'none' } }] };
}
function swatchMarkup(sw, box) {
  const { x, y, w, h } = box;
  if (sw.kind === 'line') {
    const ink = paint(sw.Outline), my = y + h / 2, line = { tagName: 'path', attrs: { d: `M${x},${my} H${x + w}`, stroke: ink, 'stroke-width': px(sw.Weight), 'stroke-dasharray': Scene.dash(sw.Dash, sw.Weight), fill: 'none' } };
    // Its arrowheads as its lines' (Auto is by which way a line runs, so none here).
    const head = (tip, end) => { const { len, wide } = Scene.headSize(Scene.headOf(sw, end), px(sw.Weight)), d = end === 'end' ? -1 : 1; return { tagName: 'path', attrs: { d: `M${tip},${my} L${tip + d * len},${my - wide / 2} L${tip + d * len},${my + wide / 2} Z`, fill: ink, stroke: 'none' } }; };
    const heads = [...['end', 'both'].includes(sw.Arrow) && ink !== 'none' ? [head(x + w, 'end')] : [], ...['start', 'both'].includes(sw.Arrow) && ink !== 'none' ? [head(x, 'start')] : []];
    return heads.length ? { tagName: 'g', children: [line, ...heads] } : line;
  }
  if (sw.kind === 'frame') return { tagName: 'rect', attrs: { x, y, width: w, height: h, fill: 'none', stroke: '#595959', 'stroke-width': px(sw.Weight), 'stroke-dasharray': Scene.dash('dashed', sw.Weight) } };
  const body = unnamed(bodyMarkup(sw.Shape ?? 'rect', w, h, { ...sw, Reflection: null }, null, { transform: `translate(${x},${y})` }));
  // (A design in miniature: its parts' shapes, in the swatch's room.)
  const parts = Scene.swatchParts(sw, box);
  return parts.length ? { tagName: 'g', children: [body, ...parts.map(p => partMarkup(p, { x: 0, y: 0 }))] } : body;
}
function legendMarkup(m, s) {
  return [
    { tagName: 'rect', selector: 'body', attrs: { width: m.w, height: m.h, fill: paint(s.Fill), stroke: paint(s.Outline), 'stroke-width': px(s.Weight) } },
    ...m.texts.map(it => textMarkup(it)),
    ...m.rows.map(r => ({ tagName: 'g', attrs: { 'data-row': r.key }, children: [
      { tagName: 'rect', attrs: { x: r.x - 2, y: r.y - 1, width: r.w, height: r.h + 2, fill: 'transparent' } },
      swatchMarkup(r.swatch, r.sw), textMarkup(r.caption)] })),
  ];
}

// A Key row's caption typed is the Key's own (dendra.md, The legend), so a frame's heading, or what any other place calls
// the output, stays as it was: typed as the row's own word again, it's no caption.
function keyCaption(tx, m, r, text) {
  const scene = active.peek().scene(), { [r.key]: _, ...rest } = m.captions ?? {}, own = Tree.clean(text), base = scene.legend.find(x => x.key === r.key)?.caption;
  tx.update(m.id, { captions: own && own !== base ? { ...rest, [r.key]: own } : rest });
}
// The Key put in a corner by name, within the margins; or back to where the page places it.
function keyCorner(tx, id, corner) {
  tx.update(id, { corner: corner ? { h: corner[1], v: corner[0] } : null, x: null, y: null, kept: null });
}

// ---- The canvas ----

function mount(el) {
  const root = document.createElement('div');
  root.className = 'dc';
  root.tabIndex = 0;
  root.innerHTML = '<div class="dc-graph"></div><div class="dc-over"></div>';
  el.append(root);
  const gEl = root.firstChild, over = root.lastChild;
  // What says the chart drawn is Tidy's preview (see restyle).
  const tidyLabel = over.appendChild(Object.assign(document.createElement('div'), { className: 'dc-previewing', textContent: 'Tidy preview', hidden: true }));

  let scene = null, viewShown = null, hl = null, red = null, ink = null, revealIds = null, entered = null, dragging = null, syncing = false;
  // The zoom said is the page's: 100% is the page at its size, whatever scale the chart is drawn at on it.
  const pageScale = () => scene?.page.scale ?? 1;
  const zoomRead = () => { zoomLevel.value = graph.zoom() / pageScale(); zoomedTo(graph.zoom() * (devicePixelRatio || 1)); };
  let cued = null, inReach = null; // a pen pointed at, lit; what's in reach of the pen (see cue)
  let pointing = false, hold = false;
  // The field selected, pointed at, lit from the inspector, and the box a row is dragged over (see Fields).
  let field = null, hovered = null, litKey = null, dropOn = null, dropAt = null;
  // While a design is edited (see Designs): the box it's over, which stands still, and what can be touched, the rest dulled: { box, keeps(id) }.
  let designing = null;
  const zooms = new Map();
  // In History nothing moves: the chart is as it stood.
  const still = () => App.readOnly.peek();
  // The page, as X6 restricts a move to it: a free shape stays on it; a box or frame goes where it's put, on it or off it.
  const pageRect = all => all ? { x: 0, y: 0, width: scene.page.w, height: scene.page.h } : { x: -1e6, y: -1e6, width: 2e6, height: 2e6 };

  const graph = new Graph({
    container: gEl, autoResize: true, async: false, virtual: true, background: false, grid: false,
    panning: { enabled: true, eventTypes: ['mouseWheelDown'] },
    mousewheel: { enabled: true, modifiers: ['ctrl', 'meta'], zoomAtMousePosition: true, minScale: LEAST, maxScale: 4, factor: 1.12 },
    scaling: { min: LEAST, max: 4 },
    translating: { restrict: view => scene ? pageRect(['shape', 'label'].includes(view?.cell?.getData()?.kind)) : null },
    // A line's label is dragged along its line, or off it, as its own (see movedLabel).
    interacting: view => {
      const k = view.cell.getData()?.kind, held = !!scene?.byId.get(view.cell.id)?.locked;
      if (view.cell.isEdge()) return { edgeMovable: k === 'shape' && !still() && !held, edgeLabelMovable: false, arrowheadMovable: false, vertexMovable: false, vertexAddable: false, vertexDeletable: false };
      return { nodeMovable: !pointing && !still() && !rowDrag && !held && k !== 'foot' && (!UNMARKED.has(k) || k === 'label') && view.cell.id !== designing?.box };
    },
  });
  // What a hand draws, aims and copies (see Drawing), once all it's given is made.
  let hand = null;
  // A Key's row dragged moves that row among the rest, a line showing where it would go, never the Key: which is
  // moved by its title or its edge. Let go with nothing moved, it's a click on the row.
  let rowDrag = null;
  const rowDropLine = () => over.querySelector('.dc-keydrop') ?? over.appendChild(Object.assign(document.createElement('div'), { className: 'dc-keydrop' }));
  gEl.addEventListener('mousedown', e => {
    const g = e.button === 0 && !still() && e.target.closest?.('[data-row]'), id = g && e.target.closest('[data-cell-id]')?.getAttribute('data-cell-id'), m = id && scene?.byId.get(id);
    rowDrag = m?.geometry === 'legend' ? { m, key: g.getAttribute('data-row'), x: e.clientX, y: e.clientY, to: null } : null;
    if (!rowDrag) return;
    const move = ev => {
      if (!rowDrag.to && Math.hypot(ev.clientX - rowDrag.x, ev.clientY - rowDrag.y) < 4) return;
      const p = graph.clientToLocal(ev.clientX, ev.clientY), near = (a, b) => Math.hypot(a.x - b.x, a.y - b.y), mid = r => ({ x: m.x + r.x + r.w / 2, y: m.y + r.y + r.h / 2 }), r = m.rows.reduce((a, x) => near(mid(x), p) < near(mid(a), p) ? x : a), after = p.y > m.y + r.y + r.h / 2;
      rowDrag.to = { key: r.key, after };
      const line = rowDropLine(), at = graph.localToGraph(m.x + r.x, m.y + r.y + (after ? r.h + 2 : -2));
      Object.assign(line.style, { left: `${at.x}px`, top: `${at.y}px`, width: `${r.w * graph.zoom()}px` });
    };
    const up = () => {
      removeEventListener('pointermove', move, true); removeEventListener('pointerup', up, true);
      over.querySelector('.dc-keydrop')?.remove();
      const was = rowDrag; rowDrag = null;
      if (!was?.to || was.to.key === was.key) return;
      const keys = m.all.map(r => r.key).filter(k => k !== was.key), i = keys.indexOf(was.to.key);
      keys.splice(i + (was.to.after ? 1 : 0), 0, was.key);
      App.change(tx => tx.update(m.id, { order: keys }), { dated: false, say: 'Reordered the Key' });
    };
    addEventListener('pointermove', move, true); addEventListener('pointerup', up, true);
  }, true);
  // Only the cells on screen, and a margin round it, are drawn, as X6 draws a big graph (`virtual`), so a chart
  // of hundreds of boxes costs what a screenful does; the rest wait in the model, drawn as they come on screen.
  // The canvas says where the screen is the moment the view moves, in place of X6's own, which waits for a
  // pause; and a canvas never yet seen draws everything, as it can't say, while one put away (another view
  // shown) draws what it drew, till it's seen again. The screen's size is the one last read (see seen), as reading
  // it again once anything has moved would lay the window out again.
  graph.virtualRender.stopListening();
  const AROUND = 120;
  let screen = { w: 0, h: 0 }, everSeen = false;
  const onScreen = () => {
    if (screen.w > 0 && screen.h > 0) { everSeen = true; graph.renderer.setRenderArea(graph.graphToLocal(0, 0, screen.w, screen.h).inflate(AROUND, AROUND)); }
    else if (!everSeen) graph.renderer.setRenderArea(undefined);
  };
  // What can be selected: a mark this view draws (a cell another view drew is kept hidden; see cellsTo).
  const selectable = c => { const k = c.getData()?.kind; return !!k && !UNMARKED.has(k) && c.isVisible() && (!designing || designing.keeps(c.id)); };
  const sel = new Selection({ enabled: true, multiple: true, rubberband: true, strict: true, movable: true, showNodeSelectionBox: true, showEdgeSelectionBox: false,
    pointerEvents: 'none', multipleSelectionModifiers: ['shift', 'ctrl', 'meta'], filter: selectable });
  graph.use(sel);
  const resizable = n => n.isNode() && ['box', 'shape'].includes(n.getData()?.kind) && !still() && !scene?.byId.get(n.id)?.locked;
  const lockedCell = n => { const m = scene?.byId.get(n.id); return !!m && (m.type === 'box' || m.type === 'shape') && lockedOf(m); };
  // (A free shape turns, by the handle over it, in steps of a degree; a box or the Key doesn't.)
  const turnable = n => { const m = n.isNode() && n.getData()?.kind === 'shape' && !still() ? scene?.byId.get(n.id) : null; return !!m && !['legend', 'group', 'line', 'table'].includes(m.geometry) && !m.role && !m.locked; };
  const transform = new Transform({ resizing: { enabled: resizable, minWidth: 24, minHeight: 12, orthogonal: true, preserveAspectRatio: lockedCell }, rotating: { enabled: turnable, grid: 1 } });
  graph.use(transform);
  transform.stopListening(); // it would put handles on whatever is clicked; grips() decides

  // Resize handles on a shape selected alone, however it came to be selected; a box too small on screen for
  // its side handles shows only its corners, as Office's does. (Locked, it has only its corners, and they keep its proportions.)
  let gripsLocked = false;
  const grips = () => {
    const cs = sel.getSelectedCells(), locked = cs.length === 1 && resizable(cs[0]) && lockedCell(cs[0]);
    if (locked !== gripsLocked) { transform.clearWidgets(); gripsLocked = locked; }
    if (cs.length === 1 && resizable(cs[0])) { if (!transform.widgets.has(cs[0])) transform.createWidget(cs[0]); } else transform.clearWidgets();
    const z = graph.zoom();
    for (const [cell, w] of transform.widgets) {
      const s = cell.getSize();
      w.container?.classList.toggle('narrow', s.width * z < 40);
      w.container?.classList.toggle('short', s.height * z < 40);
      // A triangle has no grip at its apex or off its slopes, where its relate handles and nothing of it are: its corners
      // and its base resize it (see showHandles).
      w.container?.classList.toggle('triangular', scene?.byId.get(cell.id)?.shape === 'triangle');
      // No grip sits on a line's label: what it would cover is what's read (a corner still takes the hand).
      const { x, y } = cell.getPosition(), labels = scene?.marks.filter(l => l.type === 'line' && l.labelAt && l.label) ?? [], r = 5 / z;
      for (const g of w.container?.querySelectorAll('.x6-widget-transform-resize') ?? []) {
        const at = g.dataset.position ?? '', gx = x + (at.includes('left') ? 0 : at.includes('right') ? s.width : s.width / 2), gy = y + (at.includes('top') ? 0 : at.includes('bottom') ? s.height : s.height / 2);
        g.classList.toggle('on-label', labels.some(l => gx > l.labelAt.x - r && gx < l.labelAt.x + l.label.w + r && gy > l.labelAt.y - r && gy < l.labelAt.y + l.label.h + r));
      }
      // (While a design is edited, a part's turning handle stands above its box, clear of the words in it.)
      const turn = w.container?.querySelector('.x6-widget-transform-rotate'), of = designing && scene?.byId.get(designing.box);
      if (turn) { if (of && cell.id !== of.id) turn.style.setProperty('top', `${-Math.max(0, (y - of.y) * z) - 22}px`, 'important'); else turn.style.removeProperty('top'); }
    }
    // (The relate handles keep clear of them, from the click that selects it.)
    if (near) showHandles(near);
  };
  // The grips of what's selected show as the pointer nears its edge; at rest, and with the pointer on what's in it, its one quiet outline.
  function gripsNear(e, onWords = false) {
    let on = false;
    if (transform.widgets.size) {
      const p = graph.clientToLocal(e.clientX, e.clientY), z = graph.zoom(), r = 22 / z, inner = 8 / z;
      for (const [cell] of transform.widgets) { const q = cell.getPosition(), s = cell.getSize(), inside = p.x > q.x && p.x < q.x + s.width && p.y > q.y && p.y < q.y + s.height; if (p.x > q.x - r && p.x < q.x + s.width + r && p.y > q.y - r && p.y < q.y + s.height + r && !(inside && onWords) && !(p.x > q.x + inner && p.x < q.x + s.width - inner && p.y > q.y + inner && p.y < q.y + s.height - inner)) on = true; }
    }
    root.classList.toggle('near-grips', on);
  }
  graph.use(new Snapline({ enabled: true, sharp: true, tolerance: 5, resizing: true, filter: c => c.isVisible() }));

  // The page: a sheet under everything, and a node no one sees, so guides find its edges and middle.
  const NS = 'http://www.w3.org/2000/svg';
  const viewport = graph.view.viewport;
  const sheet = document.createElementNS(NS, 'rect');
  sheet.setAttribute('class', 'dc-sheet');
  viewport.insertBefore(sheet, viewport.firstChild);
  const marks = document.createElementNS(NS, 'g');
  marks.setAttribute('class', 'dc-marks');
  viewport.appendChild(marks);
  // Gridlines, Snap to grid and Rulers (Arrange, Find): the session's, in no log, and never printed. A grid of a quarter inch on
  // the sheet; a ruler along the top and the left of the view, in inches from the page's corner.
  const gridLines = document.createElementNS(NS, 'path');
  gridLines.setAttribute('class', 'dc-grid');
  viewport.insertBefore(gridLines, sheet.nextSibling);
  const rulers = ['across', 'down'].map(c => over.appendChild(Object.assign(document.createElement('canvas'), { className: `dc-ruler ${c}` })));
  // A guide is dragged out of a ruler, onto the page (see Drawing).
  rulers.forEach((r, k) => r.addEventListener('pointerdown', e => { if (e.button === 0 && !still()) hand.guideDrag(e, k ? 'down' : 'across'); }));
  const gridStep = () => 24 / (scene?.page.scale ?? 1);
  // The page's margins, shown with its rulers or asked for by name, never printed.
  const marginLines = document.createElementNS(NS, 'path');
  marginLines.setAttribute('class', 'dc-margins');
  viewport.insertBefore(marginLines, gridLines.nextSibling);
  function paintAids() {
    const a = aids.value, p = scene?.page;
    if (!p) return;
    const step = gridStep();
    let d = '';
    if (a.grid) { for (let x = step; x < p.w; x += step) d += `M${x},0V${p.h}`; for (let y = step; y < p.h; y += step) d += `M0,${y}H${p.w}`; }
    gridLines.setAttribute('d', d);
    const ms = p.margins ?? { left: p.margin, right: p.margin, top: p.margin, bottom: p.margin };
    marginLines.setAttribute('d', a.margins || a.rulers ? `M${ms.left},${ms.top} H${p.w - ms.right} V${p.h - ms.bottom} H${ms.left} Z` : '');
    rulers.forEach(r => { r.hidden = !a.rulers; });
    if (!a.rulers || !root.clientWidth) return;
    const inch = 96 / p.scale, z = graph.zoom(), o = graph.localToGraph(0, 0), css = getComputedStyle(root), ink = css.getPropertyValue('--ink-3') || '#777', fill = css.getPropertyValue('--surface') || '#fff';
    rulers.forEach((r, k) => {
      const long = k ? root.clientHeight : root.clientWidth, thick = 18, dpr = devicePixelRatio || 1;
      Object.assign(r, { width: (k ? thick : long) * dpr, height: (k ? long : thick) * dpr });
      r.style.width = `${k ? thick : long}px`; r.style.height = `${k ? long : thick}px`;
      const c = r.getContext('2d');
      c.scale(dpr, dpr); c.fillStyle = fill; c.fillRect(0, 0, k ? thick : long, k ? long : thick);
      c.strokeStyle = c.fillStyle = ink; c.font = '10px sans-serif'; c.textBaseline = 'top'; c.lineWidth = 1;
      const from = k ? o.y : o.x, each = inch * z, parts = each >= 48 ? 4 : 1;
      for (let i = Math.ceil(-from / (each / parts)); from + i * each / parts < long; i++) {
        const at = Math.round(from + i * each / parts) + 0.5, whole = i % parts === 0, len = whole ? 8 : 4;
        c.beginPath();
        if (k) { c.moveTo(thick - len, at); c.lineTo(thick, at); } else { c.moveTo(at, thick - len); c.lineTo(at, thick); }
        c.stroke();
        if (whole && each >= 24) { const n = String(i / parts); if (k) c.fillText(n, 2, at + 1); else c.fillText(n, at + 2, 1); }
      }
    });
  }
  const stopAids = effect(() => { aids.value; if (scene) paintAids(); });

  // ---- Drawing the scene: App's, or a variant of it showing what's highlighted, redlined or restyled ----
  // A highlight keeps the view as it was drawn, so its boxes stay where they are. A restyle is laid out as the change,
  // made, lays it out, the boxes it keeps held where they stand (see keep), so what's pointed at is what's picked, a
  // label on the side it will be; Tidy's afresh. Neither is kept as how the view was drawn. A redline is the scene the
  // change, made, draws, with its ink (see inked).
  // The page drawn last.
  let pageWas = null, lookWas = false;
  function draw() {
    const base = App.scene.peek();
    if (!base) return;
    const view = base.view, s = styledDrawn, r = !s && redDrawn;
    scene = s || (revealIds && !r) ? Scene.of(s?.wb ?? App.shown.peek(), App.chart.peek(), view, base.day,
      { state: stateNow(), computed: App.computed.peek(), reveal: s?.wb.tidy ? null : revealIds, seen: App.seenIn(view), ahead: !!s, holds: s && !s.wb.tidy ? holdsOf(base) : null }) : r ? r.scene : base;
    // A record selected that starts later is drawn faint, with its lines, as what's revealed is.
    const later = App.later?.peek();
    if (later && scene !== base) for (const m of scene.marks) if (later[m.record]) m.revealed = true;
    ink = r ? inked(r, scene, base) : null;
    tidyLabel.hidden = !s?.wb.tidy;
    if (s?.wb.tidy) tidyLabel.textContent = `${s.wb.tidy} preview`;
    // (A look pointed at, or let go of, changes as fast as the pointer moves, and is just there; Tidy's, which is rested on, travels.)
    calmDraw = !(s && !s.wb.tidy) && !lookWas;
    lookWas = !!s && !s.wb.tidy;
    cellsTo(App.chart.peek(), view, [...cellsOf(scene, ink), ...(ink?.cells ?? []), { id: '·page', shape: 'dendra', x: 0, y: 0, width: scene.page.w, height: scene.page.h, zIndex: -1e6,
      data: { kind: 'page' }, markup: [{ tagName: 'rect', attrs: { width: scene.page.w, height: scene.page.h, fill: 'none', 'pointer-events': 'none' } }] }, ...(hand?.guideCells() ?? [])]);
    sheet.setAttribute('width', scene.page.w);
    sheet.setAttribute('height', scene.page.h);
    // Each view comes back as it was left; one not seen yet opens on its whole page. Either is so at once,
    // never drawn for a moment as the view before was. Then the chart holds still as it changes, as of another day
    // too: the zoom stays as it is, whatever the page does, and a chart placed where it stands on its page stays where
    // it is on screen as the page moves it to hold it (by its offset), so what was moved stays under the pointer.
    const page = scene.page, was = pageWas;
    pageWas = page;
    if (viewShown !== view) {
      if (viewShown) zooms.set(viewShown, left ?? { s: graph.zoom(), t: graph.translate(), framed });
      viewShown = view;
      const z = zooms.get(view);
      framed = z ? z.framed : true;
      left = z && !z.framed ? z : null;
      settle();
    } else if (was && framed && (was.scale !== page.scale || was.sheet.w !== page.sheet.w || was.sheet.h !== page.sheet.h)) {
      // (A page drawn at another scale is the same sheet: framed, it stays as large on screen. Another sheet is framed anew.)
      settle();
    } else if (was && page.placed && was.placed) {
      const dx = page.offset.x - was.offset.x, dy = page.offset.y - was.offset.y;
      if ((dx || dy) && screen.w) { const z = graph.zoom(), t = graph.translate(); quietly(() => graph.translate(t.tx - dx * z, t.ty - dy * z)); }
    }
    zoomRead();
    syncSelection();
    paintStates();
    paintAids();
    seek();
    snapSoon();
    // A field's name said on hover goes as the chart is drawn again, which may have moved it.
    tipFor(null);
    // (What's over a mark goes where it's drawn, a preview's or the chart's: the rounding handle, see FormatBar.)
    graph.trigger('drawn');
  }
  // The graph's cells made these. Each is kept by what it's drawn from, in two parts, where it is (a node's
  // place, size and stacking, a line's route) and what it is (its markup, attributes and data): one that only
  // moved is moved, a box or shape that looks different is drawn again in place, and so is a line whose attributes
  // only take other values (see partsOf), its new values set over its old, so it keeps those its shape gives it, the
  // path drawn on its route among them; only a line that sets others, or a new cell, is made anew, as making cells
  // is what costs. A cell this view doesn't draw is
  // hidden while another view of the chart drew it last, for when that one is shown again, and otherwise goes.
  const drawn = new Map(), drewLast = new Map();
  let chartDrawn = null, drawnScene = null;
  function cellsTo(chart, view, cells) {
    const leaving = chart === chartDrawn && calmDraw ? takeOff(new Set(cells.map(c => c.id))) : (grounded(), null);
    drawnScene = scene;
    if (chart !== chartDrawn) { drewLast.clear(); chartDrawn = chart; }
    const mine = new Set(cells.map(c => c.id));
    drewLast.set(view, mine);
    const kept = new Set([...drewLast.values()].flatMap(s => [...s]));
    stack(cells);
    syncing = true;
    if (!screen.w || !screen.h) seen();
    onScreen();
    if (leaving) { landing = true; queueMicrotask(() => { landing = false; land(leaving); }); }
    graph.batchUpdate(() => {
      for (const c of graph.getCells()) {
        if (mine.has(c.id)) continue;
        if (!kept.has(c.id)) { graph.removeCell(c); drawn.delete(c.id); }
        else if (c.isVisible()) c.setVisible(false);
      }
      for (const c of cells) {
        const was = drawn.get(c.id), cell = was && graph.getCellById(c.id), now = partsOf(c);
        if (cell && cell.isEdge() === (c.shape === 'edge') && (was.what === now.what || cell.isNode() || was.form === now.form)) {
          if (was.what !== now.what) { if (cell.isNode()) { cell.setMarkup(c.markup); snapped.delete(c.id); } else cell.setAttrs(c.attrs); cell.setData(c.data, { overwrite: true }); }
          moveCell(cell, c, was.where);
          if (!cell.isVisible()) cell.setVisible(true);
        } else { if (cell) graph.removeCell(cell); c.shape === 'edge' ? graph.addEdge(c) : graph.addNode(c); }
        drawn.set(c.id, now);
      }
    });
    syncing = false;
  }
  // ---- Crisp at any zoom (dendra.md, Part 3, Crisp): a stroke is a whole number of the screen's pixels (see crisp), a line square
  // to the screen drawn without anti-aliasing, so it falls on them; and a body's edges are set on them, by a hair's move and
  // stretch of its outline at this zoom and scroll, so they do too. The screen's alone: nothing's place changes. ----
  let snapping = 0, snapAt = '';
  // (Each body set at this zoom and scroll, by what it's set from: only what's new or moved, or all of them at another zoom or scroll, is set again.)
  const snapped = new Map();
  function snapBodies() {
    snapping = 0;
    if (!scene || root.closest('[hidden]')) return;
    const dpr = devicePixelRatio || 1, z = graph.zoom(), t = graph.translate(), d = z * dpr, at = `${z}|${t.tx}|${t.ty}|${dpr}`;
    if (at !== snapAt) { snapped.clear(); snapAt = at; }
    // (The middle of a pixel for a stroke of an odd width; between two for an even.)
    const onPixel = (v, odd) => odd ? Math.floor(v) + 0.5 : Math.round(v);
    for (const m of scene.marks) {
      if (!(m.type === 'box' || m.type === 'frame' || (m.type === 'shape' && !m.rotate && m.geometry !== 'line' && m.geometry !== 'group'))) continue;
      const weight = m.settings?.Weight?.value ?? m.look?.Weight ?? 0.75, key = `${m.x}|${m.y}|${m.w}|${m.h}|${weight}`;
      if (snapped.get(m.id) === key) continue;
      const c = graph.getCellById(m.id), v = c && graph.findViewByCell(c), body = v?.container.firstElementChild;
      if (!body || !body.getAttribute('d') && body.tagName !== 'rect' || body.tagName === 'image') continue;
      const w = Math.max(1, Math.round(px(weight) * d)), odd = w % 2 === 1;
      const a = (m.x * z + t.tx) * dpr, b = ((m.x + m.w) * z + t.tx) * dpr, e = (m.y * z + t.ty) * dpr, f = ((m.y + m.h) * z + t.ty) * dpr;
      const A = onPixel(a, odd), B = onPixel(b, odd), E = onPixel(e, odd), F = onPixel(f, odd);
      body.setAttribute('transform', `translate(${+((A - a) / d).toFixed(3)},${+((E - e) / d).toFixed(3)}) scale(${+((B - A) / Math.max(b - a, 0.01)).toFixed(4)},${+((F - E) / Math.max(f - e, 0.01)).toFixed(4)})`);
      snapped.set(m.id, key);
    }
  }
  const snapSoon = () => { if (!snapping) snapping = requestAnimationFrame(snapBodies); };

  // ---- Travel (dendra.md, Part 3, Motion): what stands in both goes from where it was on screen to where it now is, its lines
  // following; what's new comes up, what's gone goes down. The cells are drawn where they end at once, as ever: only what the
  // eye sees travels, a transition over them, so nothing reads or writes a place that isn't so, and the next act lands at once.
  // Never with reduced motion, nor where it would cost a frame: past FLIGHT cells on screen it's skipped, and a window that
  // can't keep up lands where it's going, then skips what's as large from there on.
  const TRAVEL = { duration: 200, easing: 'cubic-bezier(.2, 0, 0, 1)', fill: 'none' }, COMES = { duration: 150, delay: 50, easing: 'ease-out', fill: 'backwards' }, GOES = { duration: 120, easing: 'ease-in' };
  let FLIGHT = 360;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  // Whether this draw travels: not a look pointed at, which changes as fast as the pointer moves (Tidy's preview does, which is rested on).
  let calmDraw = false, flight = null, landing = false;
  // (A hand on the chart lands it, so what's taken hold of is where it's drawn.)
  gEl.addEventListener('pointerdown', () => grounded(), true);
  const ghosts = document.createElementNS(NS, 'g');
  ghosts.setAttribute('class', 'dc-ghosts');
  viewport.insertBefore(ghosts, marks);
  const pointsOf = c => { const s = c.getSource(), t = c.getTarget(), vs = c.getVertices(); return [[s.x, s.y], ...vs.map(v => [v.x, v.y]), [t.x, t.y]]; };
  const lerp = (a, b, p) => a + (b - a) * p;
  // Where a cell in flight is on screen just now, by how far along the flight is.
  function flown() {
    const p = flight?.anims[0]?.effect?.getComputedTiming().progress;
    return p == null ? null : { p, rects: flight.rects, lines: flight.lines };
  }
  function grounded() {
    if (!flight) return;
    for (const a of flight.anims) a.cancel();
    root.classList.remove('flying');
    flight = null;
  }
  // A scene's cells, by what they're drawn from: `rect`, a box's, a frame's, a shape's and a line's label's; `route`, a line's.
  function eachDrawn(sc, rect, route) {
    for (const m of sc.marks) {
      if (m.type === 'line' || m.geometry === 'line') {
        route(m.id, m.points, m);
        if (m.type === 'line' && m.texts?.length && Number.isFinite(m.labelAt?.x) && Number.isFinite(m.labelAt?.y)) rect(`${m.id}·label`, { x: m.labelAt.x, y: m.labelAt.y, w: m.label.w || 1, h: m.label.h || 1 }, m);
      } else if (m.geometry !== 'group' && (m.type === 'box' || m.type === 'frame' || m.type === 'shape')) rect(m.id, { x: m.x, y: m.y, w: Math.max(1, m.w), h: Math.max(1, m.h) }, m);
    }
  }
  // Where everything is on screen as a draw begins, in flight or not; and a copy of what's about to go, to fade out. All from the scene
  // drawn last, which costs nothing, but what a drag has left astray, which only the cell knows.
  function takeOff(next) {
    const sc = drawnScene, z = graph.zoom(), t = graph.translate();
    // (Whether it can be seen, by what hides it: asking the window its width here would lay it out, and again once it's drawn.)
    if (reduced.matches || !screen.w || root.closest('[hidden]') || !sc) { grounded(); return null; }
    const up = flown(), rects = new Map(), lines = new Map(), going = [], stray = id => { const d = drawn.get(id); return d && !('zIndex' in d.where) ? graph.getCellById(id) : null; };
    // (What goes is copied only where it's few: more than a frame could fade is simply gone.)
    let toGo = 0;
    eachDrawn(sc, id => { if (!next.has(id)) toGo++; }, id => { if (!next.has(id)) toGo++; });
    const goes = id => { if (toGo > 64 || next.has(id)) return; const c = graph.getCellById(id), v = c?.isVisible() && graph.findViewByCell(c); if (!v) return; const copy = v.container.cloneNode(true); copy.removeAttribute('data-cell-id'); copy.querySelectorAll('[data-tour]').forEach(n => n.removeAttribute('data-tour')); going.push(copy); };
    eachDrawn(sc, (id, rc) => {
      const was = up?.rects.get(id), c = !was && stray(id), p = c ? { ...c.getPosition(), ...((({ width, height }) => ({ w: width, h: height }))(c.getSize())) } : rc;
      rects.set(id, was ? { x: lerp(was[0].x, was[1].x, up.p), y: lerp(was[0].y, was[1].y, up.p), w: lerp(was[0].w, was[1].w, up.p), h: lerp(was[0].h, was[1].h, up.p) } : { x: p.x * z + t.tx, y: p.y * z + t.ty, w: p.w * z, h: p.h * z });
      goes(id);
    }, (id, points) => {
      const was = up?.lines.get(id), c = !was && stray(id);
      lines.set(id, was ? was[0].map((q, i) => [lerp(q[0], was[1][i][0], up.p), lerp(q[1], was[1][i][1], up.p)]) : (c ? pointsOf(c) : points).map(([x, y]) => [x * z + t.tx, y * z + t.ty]));
      goes(id);
    });
    const pw = +sheet.getAttribute('width') || 0, ph = +sheet.getAttribute('height') || 0;
    grounded();
    return { rects, lines, going, z, t, sheet: pw && { x: t.tx, y: t.ty, w: pw * z, h: ph * z } };
  }
  // Two routes, point for point: as they stand where they've as many, or else each at every share of its length the other turns at.
  function matched(a, b) {
    if (a.length === b.length) return [a, b];
    const shares = ps => { const ds = [0]; ps.slice(1).forEach((q, i) => ds.push(ds[i] + Math.hypot(q[0] - ps[i][0], q[1] - ps[i][1]))); const all = ds.at(-1) || 1; return ds.map(d => d / all); };
    const sa = shares(a), sb = shares(b), all = [...new Set([...sa, ...sb])].sort((x, y) => x - y);
    const at = (ps, ss, u) => { let i = 1; while (i < ss.length - 1 && ss[i] < u) i++; const f = (u - ss[i - 1]) / ((ss[i] - ss[i - 1]) || 1); return [lerp(ps[i - 1][0], ps[i][0], f), lerp(ps[i - 1][1], ps[i][1], f)]; };
    return [all.map(u => at(a, sa, u)), all.map(u => at(b, sb, u))];
  }
  const pathOf = ps => `path("${ps.map(([x, y], i) => `${i ? 'L' : 'M'} ${+x.toFixed(2)} ${+y.toFixed(2)}`).join(' ')}")`;
  // What's stood in both, flown; what's new, faded up; what's gone, faded down: each by the transform or path the browser
  // tweens, so a frame costs only painting it.
  let arrival = null;
  function land(off) {
    const came = arrival;
    queueMicrotask(() => { if (arrival === came) arrival = null; });
    if (!scene || flight) return;
    const z = graph.zoom(), t = graph.translate(), todo = [], fades = [];
    const near = (a, b) => Math.abs(a - b) < 0.6;
    const seenNow = (x, y, w, h) => x + w > -AROUND && y + h > -AROUND && x < screen.w + AROUND && y < screen.h + AROUND;
    const rects = new Map(), lines = new Map(), viewOfCell = id => { const c = graph.getCellById(id); return c ? graph.findViewByCell(c) : null; };
    // (What's moved is found from the scene, which costs nothing; only if it's few enough is it looked for among the cells.)
    const moving = [], routing = [];
    eachDrawn(scene, (id, rc, m) => {
      const was = off.rects.get(id) ?? (m.type === 'box' ? arrival : null), r = { x: rc.x * z + t.tx, y: rc.y * z + t.ty, w: rc.w * z, h: rc.h * z };
      if (!was) { if (seenNow(r.x, r.y, r.w, r.h)) fades.push(id); return; }
      if ((near(was.x, r.x) && near(was.y, r.y) && near(was.w, r.w) && near(was.h, r.h)) || (!seenNow(r.x, r.y, r.w, r.h) && !seenNow(was.x, was.y, was.w, was.h))) return;
      moving.push([id, was, r, rc, m]);
    }, (id, points) => {
      const was = off.lines.get(id), ps = points.map(([x, y]) => [x * z + t.tx, y * z + t.ty]);
      if (!was) { fades.push(id); return; }
      if (ps.length === was.length && ps.every((q, i) => near(q[0], was[i][0]) && near(q[1], was[i][1]))) return;
      routing.push([id, was, ps]);
    });
    if (moving.length + routing.length + fades.length + off.going.length > FLIGHT) return;
    for (const [id, was, r, rc, m] of moving) {
      const v = viewOfCell(id);
      if (!v) continue;
      rects.set(id, [was, r]);
      const a = m.rotate || 0, turn = a ? ` translate(${rc.w / 2}px, ${rc.h / 2}px) rotate(${a}deg) translate(${-rc.w / 2}px, ${-rc.h / 2}px)` : '';
      // (By one scale both ways, its middle where its middle was, so its words aren't drawn out of shape on the way.)
      const k = Math.sqrt((was.w / Math.max(r.w, 0.01)) * (was.h / Math.max(r.h, 0.01))), x0 = was.x + was.w / 2 - r.w * k / 2, y0 = was.y + was.h / 2 - r.h * k / 2;
      todo.push([v.container, 'transform', `translate(${(x0 - t.tx) / z}px, ${(y0 - t.ty) / z}px)${turn} scale(${k})`, `translate(${rc.x}px, ${rc.y}px)${turn} scale(1)`]);
    }
    for (const [id, was, ps] of routing) {
      const line = viewOfCell(id)?.container.querySelector(':scope > path + path');
      if (!line) continue;
      const [a, b] = matched(was, ps);
      lines.set(id, [a, b]);
      todo.push([line, 'd', a.map(([x, y]) => [(x - t.tx) / z, (y - t.ty) / z]), b.map(([x, y]) => [(x - t.tx) / z, (y - t.ty) / z])]);
    }
    const toSheet = { x: t.tx, y: t.ty, w: (+sheet.getAttribute('width') || 0) * z, h: (+sheet.getAttribute('height') || 0) * z }, fromSheet = off.sheet;
    const sheetMoved = fromSheet && !(near(fromSheet.x, toSheet.x) && near(fromSheet.y, toSheet.y) && near(fromSheet.w, toSheet.w) && near(fromSheet.h, toSheet.h));
    // Past what a frame can paint, it's just there, as it always was.
    if (!(todo.length || fades.length || off.going.length || sheetMoved)) return;
    const anims = [];
    if (sheetMoved) anims.push(sheet.animate([{ transform: `translate(${(fromSheet.x - t.tx) / z}px, ${(fromSheet.y - t.ty) / z}px) scale(${fromSheet.w / Math.max(toSheet.w, 1)}, ${fromSheet.h / Math.max(toSheet.h, 1)})` }, { transform: 'translate(0px, 0px) scale(1, 1)' }], TRAVEL));
    // (All on the page's own clock, box and line in step: a property only it can tween keeps a box's transform off the compositor's.)
    for (const [el, prop, a, b] of todo) anims.push(el.animate(prop === 'd' ? [{ d: pathOf(a) }, { d: pathOf(b) }] : [{ transform: a, outlineOffset: '0px' }, { transform: b, outlineOffset: '0px' }], TRAVEL));
    for (const id of fades) { const el = viewOfCell(id)?.container; if (el) anims.push(el.animate([{ opacity: 0 }, { opacity: 1 }], COMES)); }
    if (off.going.length) {
      const g = ghosts.appendChild(document.createElementNS(NS, 'g')), k = off.z / z;
      g.setAttribute('transform', `translate(${(off.t.tx - t.tx) / z},${(off.t.ty - t.ty) / z}) scale(${k})`);
      g.setAttribute('pointer-events', 'none');
      g.append(...off.going);
      g.animate([{ opacity: 1 }, { opacity: 0 }], GOES).finished.finally(() => g.remove());
    }
    if (!anims.length) return;
    const mine = flight = { anims, rects, lines };
    root.classList.add('flying');
    showHandles(null);
    const done = () => { if (flight === mine) { flight = null; root.classList.remove('flying'); } };
    anims[0].finished.then(done, () => {});
    // A window that can't keep up lands where it's going, and no flight as large goes from there on.
    let last = performance.now(), slow = 0;
    const watch = now => {
      if (flight !== mine) return;
      if (now - last > 34 && ++slow >= 2) { FLIGHT = Math.max(24, Math.min(FLIGHT, Math.floor(anims.length * 0.75))); for (const a of anims) a.finish(); return done(); }
      last = now;
      requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
  }

  // The cells stacked in the scene's order, bottom first, as their z. A cell drawn before keeps its z wherever
  // that's still in order, the most of them that can (the longest run of them in order), and the rest go
  // between their neighbours: a change restacks only what it moves in the stack, as X6 sorts every cell again
  // each time one's z changes.
  function stack(cells) {
    const order = [...cells].sort((a, b) => a.zIndex - b.zIndex), was = order.map(c => graph.getCellById(c.id)?.getZIndex());
    const tails = [], before = order.map(() => -1), keep = new Set();
    order.forEach((c, i) => {
      if (was[i] == null) return;
      let lo = 0, hi = tails.length;
      while (lo < hi) { const m = (lo + hi) >> 1; if (was[tails[m]] < was[i]) lo = m + 1; else hi = m; }
      before[i] = lo ? tails[lo - 1] : -1;
      tails[lo] = i;
    });
    for (let i = tails.at(-1) ?? -1; i >= 0; i = before[i]) keep.add(i);
    for (let i = 0; i < order.length;) {
      if (keep.has(i)) { order[i].zIndex = was[i]; i++; continue; }
      let j = i;
      while (j < order.length && !keep.has(j)) j++;
      const lo = i ? order[i - 1].zIndex : (j < order.length ? was[j] : 0) - (j - i + 1), hi = j < order.length ? was[j] : lo + (j - i + 1), step = (hi - lo) / (j - i + 1);
      // Where halving has left no room between them, every cell is stacked afresh.
      if (step < 1e-6) { order.forEach((c, k) => { c.zIndex = k; }); return; }
      for (let k = i; k < j; k++) order[k].zIndex = lo + step * (k - i + 1);
      i = j;
    }
  }

  // ---- Selection: X6's, kept in step with the shell's keys ----
  const groups = () => scene ? scene.marks.filter(m => m.geometry === 'group') : [];
  const groupOf = id => groups().find(g => g.members.includes(id) && g.id !== entered);
  // A line's cell draws its record and those of the lines drawn as one with it (Scene's `merged`), as the
  // BDC's to every box in a frame are.
  const standing = new WeakMap();
  function drawsFor(id) {
    if (!scene) return [id];
    let by = standing.get(scene);
    if (!by) {
      standing.set(scene, by = new Map());
      for (const m of new Set(scene.byId.values())) if (m.merged) (by.get(m.merged) ?? by.set(m.merged, [m.merged]).get(m.merged)).push(m.id);
    }
    return by.get(id) ?? [id];
  }
  function cellsFor(keys) {
    const out = [];
    for (const k of keys) {
      const [id] = keyParts(k);
      const m = scene?.byId.get(id);
      if (m?.geometry === 'group') out.push(...m.members); else out.push(m?.merged ?? id);
    }
    return [...new Set(out)].map(id => graph.getCellById(id)).filter(Boolean);
  }
  // The legend row selected, however it came to be: clicked, or by Back, Find or another part.
  const keyRow = () => {
    const ks = Shell.selection.peek(), [legend, key] = ks.length === 1 ? keyParts(ks[0]) : [];
    return key && scene?.byId.get(legend)?.geometry === 'legend' ? { legend, key } : null;
  };
  // The keys of what's selected on the chart: a group's member, the group; a line, the records it draws, those
  // of them selected from elsewhere, or all of them when it was clicked (`whole`) or nothing it draws was.
  function keysOfSelection(whole = new Set()) {
    const ids = sel.getSelectedCells().map(c => c.id), keys = [], r = keyRow(), now = Shell.selection.peek();
    for (const id of ids) {
      const g = groupOf(id), all = drawsFor(id), some = whole.has(id) ? [] : all.filter(k => now.includes(k));
      for (const k of g ? [g.id] : r && r.legend === id && ids.length === 1 ? [`${id}#${r.key}`] : some.length ? some : all) if (!keys.includes(k)) keys.push(k);
    }
    return keys;
  }
  // X6 lets go of a cell drawn again, so the selection is taken up again from the keys.
  function syncSelection() {
    const keys = Shell.selection.peek().filter(k => scene.byId.has(keyParts(k)[0]));
    const want = cellsFor(keys), have = sel.getSelectedCells();
    if (want.length !== have.length || want.some(c => !have.includes(c))) { syncing = true; sel.reset(want); syncing = false; }
    grips();
  }
  // What's selected on the chart, taken up as keys. Selecting a member of a group selects the group, unless it
  // has been entered; and a line clicked (`pressed`), every line drawn along it where it was clicked, as a
  // trunk's lines are drawn, each for all it draws: so what's selected is what's drawn there.
  let pressed = null;
  // Of the lines drawn along a stretch clicked: with a box selected that one of them leaves or meets, that line; else all of
  // them, the run, and each click after at that place the next of them alone, and then the run again.
  let lastRun = null;
  function ofRun(found, { p, was }) {
    if (found.length < 2) return found;
    const along = [...found].sort(), boxes = new Set(was.map(k => scene.byId.get(keyParts(k)[0])).filter(m => m?.type === 'box').map(m => m.id));
    const mine = along.filter(id => { const l = scene.byId.get(id); return boxes.has(l?.from) || boxes.has(l?.to); });
    if (mine.length === 1) { lastRun = { p, along, i: along.indexOf(mine[0]) + 1 }; return mine; }
    const again = lastRun && same(lastRun.along, along) && Math.hypot(lastRun.p[0] - p[0], lastRun.p[1] - p[1]) * graph.zoom() < 6, i = again ? (lastRun.i + 1) % (along.length + 1) : 0;
    lastRun = { p, along, i };
    return i ? [along[i - 1]] : along;
  }
  function reselect() {
    const ids = sel.getSelectedCells().map(c => c.id), along = pressed ? alongside(pressed.id, pressed.p) : [], on = ids.includes(along[0]);
    // (X6 goes from one line to another by way of none: the press waits for the line it's of.)
    if (pressed && !on && !pressed.more && !ids.length) return;
    const run = on && !pressed.more ? ofRun(along, pressed) : along;
    pressed = null;
    const cells = xs => xs.map(id => graph.getCellById(id)).filter(Boolean);
    const grow = [...new Set(ids.map(groupOf).filter(Boolean))].flatMap(g => g.members).concat(on ? run : []).filter(id => !ids.includes(id));
    const drop = on ? along.filter(id => !run.includes(id) && ids.includes(id)) : along.filter(id => ids.includes(id));
    if (grow.length || drop.length) { syncing = true; sel.select(cells(grow)); sel.unselect(cells(drop)); syncing = false; }
    const keys = keysOfSelection(new Set(run));
    if (!same(keys, Shell.selection.peek())) pick(keys);
    grips();
    paintStates();
    // (One of a run, alone: X6 selects what was under the pointer as its press ends, so that's set right after it.)
    if (on && run.length < along.length) setTimeout(() => {
      if (!scene || sel.getSelectedCells().length === run.length && run.every(id => sel.isSelected(graph.getCellById(id)))) return;
      syncing = true; sel.reset(cells(run)); syncing = false;
      pick(keysOfSelection(new Set(run))); grips(); paintStates();
    });
  }
  graph.on('selection:changed', () => { if (!syncing) reselect(); });
  // A click that left X6's selection as it was (the line clicked was selected alone already) is taken up too.
  graph.on('edge:click', () => { if (pressed && !hold) reselect(); });
  // The lines drawn along the stretch of a line nearest p, it first: those running on it there, as a trunk's
  // lines do, and not those crossing it. With no p, the line alone.
  function alongside(id, p) {
    const l = scene?.byId.get(id), legs = m => (m.runs ?? [m.points]).flatMap(r => r.slice(1).map((b, i) => [r[i], b])), ls = l?.points ? legs(l) : [];
    if (!p || !ls.length) return [id];
    const [a, b] = ls.reduce((best, s) => toSegment(p, ...s) < toSegment(p, ...best) ? s : best);
    const n = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, t = clamp(((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / (n * n), 0, 1);
    const q = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], d = [(b[0] - a[0]) / n, (b[1] - a[1]) / n];
    const runs = ([c, e]) => Math.abs(d[0] * (e[1] - c[1]) - d[1] * (e[0] - c[0])) < 0.01 * Math.hypot(e[0] - c[0], e[1] - c[1]) && toSegment(q, c, e) < 0.5;
    return [id, ...scene.marks.filter(m => m.type === 'line' && m.id !== id && graph.getCellById(m.id)?.isVisible() && legs(m).some(runs)).map(m => m.id)];
  }
  // What's selected from elsewhere (Find, F8, the status bar, the inspector, Back) or by Tab is brought on
  // screen, at the zoom the view is at; what's picked on the chart, by a click or the marquee, is there.
  // What isn't drawn yet, in a view about to be shown or a relation the view hides that its highlight will
  // show, is brought once it is.
  let picked = [], wanted = null;
  const pick = keys => { picked = keys; Shell.select(keys); };
  const stopSel = effect(() => {
    const keys = Shell.selection.value;
    // A field is of its mark selected alone.
    if (field && !(keys.length === 1 && keyParts(keys[0])[0] === field.box)) field = null;
    if (!scene || syncing) return;
    syncSelection(); paintStates();
    wanted = same(keys, picked) ? null : keys;
    if (App.scene.peek()?.view === scene.view) seek();
  });
  function seek() {
    const ms = wanted ? marksOf(wanted) : [];
    if (ms.length) { wanted = null; bring(ms); }
  }
  // Selects a mark, or the group it's in, unless it's selected already.
  function take(cell) {
    if (sel.isSelected(cell)) return;
    syncing = true; sel.reset(cellsFor([groupOf(cell.id)?.id ?? cell.id])); syncing = false;
    pick(keysOfSelection());
  }

  // While a formula's row is edited (point mode), a click on a box or line names its record to the formula
  // bar and selects nothing. A click on a computed line the bar has lit, or on the line lit in its place,
  // shows its reasons there.
  function point(on) { pointing = !!on; root.classList.toggle('pointing', pointing); showHandles(null); }
  function pointed(cell) {
    const d = cell.getData() ?? {}, m = scene?.byId.get(d.kind === 'label' ? d.mark : cell.id), st = App.state.peek();
    if (!m || (m.type !== 'box' && m.type !== 'line')) return false;
    const why = m.type === 'line' && [m.record, ...[...standIns].filter(([, l]) => l === m.id).map(([id]) => id)].find(id => st[id]?.computed && hl?.map.has(id));
    if (pointing) FormulaBar.point(m.record);
    else if (why) Shell.emit('why-open', why);
    else return false;
    hold = true;
    sel.disable();
    addEventListener('mouseup', () => setTimeout(() => { hold = false; sel.enable(); }), { once: true });
    return true;
  }
  graph.on('edge:mousedown', ({ e, edge }) => {
    const p = graph.clientToLocal(e.clientX, e.clientY);
    pressed = !pointed(edge) && edge.getData()?.kind === 'line' ? { id: edge.id, p: [p.x, p.y], was: Shell.selection.peek(), more: e.shiftKey || e.ctrlKey || e.metaKey } : null;
  });

  // A click on the page clears the selection, and a drag across it is the marquee; a click on a line's
  // label is a click on its line; a second click on a legend selects the row under it.
  // What a press found, for the click and the double-click after it: the mark, whether it was selected already, and
  // where; `twice`, the first press of a double-click's.
  let down = null, twice = null;
  graph.on('node:mousedown', ({ e, node }) => {
    const k = node.getData()?.kind, id = k === 'label' ? node.getData().mark : node.id, cell = graph.getCellById(id), t = performance.now();
    const now = { id, selected: !!cell && sel.isSelected(cell), x: e.clientX, y: e.clientY, t };
    twice = down && down.id === id && t - down.t < 500 ? down : now;
    down = now;
    pressed = null;
    root.focus({ preventScroll: true });
    if (k === 'page') { if (e.button === 0) { if (!e.shiftKey) sel.clean(); sel.startRubberband(e); } return; }
    if (pointed(node)) return;
    if (UNMARKED.has(k) || e.shiftKey || e.ctrlKey || e.metaKey) return;
    take(node);
  });
  graph.on('blank:mousedown', () => { pressed = null; root.focus({ preventScroll: true }); });
  graph.on('node:click', ({ e, node }) => {
    const k = node.getData()?.kind;
    if (hold) return;
    // A click on a field of a mark already selected selects the field; on its own room, the mark again.
    const atRest = down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 4;
    picked_foot = null;
    if ((k === 'box' || k === 'label') && atRest && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      // (A footnote's marker, as a field is; its line on the footnotes shape, below.)
      const f = fieldUnder(e.clientX, e.clientY), mk = down.selected && f && markerUnder(f.m, e.clientX, e.clientY);
      if (mk) { picked_foot = mk; pickField(null); return; }
      // (A blank says what a click on it is for, so it's picked the first time, what's typed going there and not over the name.)
      if ((down.selected || f?.it?.blank) && f?.it) { pickField(f); if (k === 'label') return; }
      else pickField(null);
    }
    if (atRest && down.selected && scene.byId.get(node.id)?.role === 'footnotes') { const fm = scene.byId.get(node.id), got = footAt(fm, e.clientX, e.clientY); if (got) { picked_foot = { f: got }; paintFields(); } }
    if (k === 'label') {
      const line = graph.getCellById(node.getData().mark);
      if (line) { pressed = { id: line.id }; if (e.shiftKey) sel.isSelected(line) ? sel.unselect(line) : sel.select(line); else sel.reset(line); pressed = null; }
      return;
    }
    const m = scene.byId.get(node.id), key = e.target.closest?.('[data-row]')?.getAttribute('data-row');
    if (m?.geometry === 'legend') {
      if (key && legendWas === m.id) pick([`${m.id}#${key}`]);
      else if (!key && keyRow()) pick([m.id]);
    }
  });
  // A click on a legend already selected selects the row under it.
  let legendWas = null;
  graph.on('node:mousedown', ({ node }) => { legendWas = scene.byId.get(node.id)?.geometry === 'legend' && sel.isSelected(node) ? node.id : null; });
  graph.on('blank:click', () => { entered = null; });

  // ---- Gestures, each one change ----
  const viewOf = () => scene.view;
  // (Or what the page draws of what's gone, which stands where it stood.)
  const treeOf = id => Tree.treeOf(App.state.peek(), id) ?? (scene?.since ? Tree.treeOf(scene.state, id) : null);
  // Places for marks, written: a box's Position at its record in this view, where it is on the page less what the page
  // moved a chart placed so to hold it (Scene's furnish), as a chart the layout alone placed is placed once anything is,
  // `hand`, so it stands exactly there, as large as it's made; a free shape's own place, where it is on the page, kept on
  // it, as a PowerPoint shape's is.
  const origin = (page = scene.page) => page.placed ? page.offset : { x: 0, y: 0 };
  const own = (x, y, page = scene.page) => { const o = origin(page); return [round(x - o.x), round(y - o.y)]; };
  let baked = null;
  // In a chart with a box a hand put somewhere, no box moves for the lanes: so what the room for them had moved stands where it's
  // drawn from now on, as a place of its own. → Map(record → place), but of what's `except`.
  function stoodFor(base, except) {
    const out = new Map(), n = App.notes.peek();
    if (base.page.placed) for (const b of base.marks) {
      if (b.type !== 'box' || !b.laid || b.exact || except.has(b.id) || Math.abs(b.y - base.page.offset.y - b.laid.y) < 0.01) continue;
      const t = treeOf(b.record), old = t && n.position(t, base.view), [x, y] = own(b.x, b.y, base.page);
      if (t) out.set(b.record, { x, y, w: round(b.w), ...(old?.h && { h: old.h }), kept: true });
    }
    return out;
  }
  function place(tx, places) {
    const view = viewOf(), n = App.notes.peek(), page = scene.page;
    baked = new Set();
    if ([...places.keys()].some(id => scene.byId.get(id)?.type === 'box')) for (const [id, p] of stoodFor(scene, places)) { tx.note('Position', treeOf(id), p, { view }); baked.add(id); }
    for (const [id, p] of places) {
      const m = scene.byId.get(id);
      if (!m || footOf(m) || m.locked) continue;
      if (m.type === 'box') {
        // (A drag lands on the half pixel; what's typed is kept as typed.)
        const old = n.position(treeOf(m.record), view), o = origin(page), r = p.typed ? v => v : round;
        // A move moves, and leaves the size as it's drawn: where that's the height its rank shared, or the triangles of its width,
        // that's kept as well, `soft`, as what its own text can still grow it past (Scene). Joining a row, it shares the row's. A width changed leaves its height to its text.
        const held = p.h !== undefined ? { h: r(p.h) } : p.w === undefined && !p.joins ? (old?.h && !old.soft ? { h: r(old.h) } : { h: r(m.h), soft: true }) : old?.h && !old.soft ? { h: r(old.h) } : {};
        tx.note('Position', treeOf(m.record), { x: r(p.x - o.x), y: r(p.y - o.y), w: r(p.w ?? m.w), ...held, ...(old?.lock && { lock: true }), hand: true }, { view });
      } else if (m.type === 'shape') {
        const row = rowOf(id), points = row?.points ?? (m.geometry === 'line' ? m.points : null), r = p.typed ? v => v : round;
        // A line: moved, and its width and height its ends' distance across and down; an end it's moved off what it's glued to, unless that moves with it, lets go.
        if (points) {
          const dx = p.dx ?? p.x - m.x, dy = p.dy ?? p.y - m.y, across = p.w !== undefined, down = p.h !== undefined, fx = across && m.w ? p.w / m.w : 1, fy = down && m.h ? p.h / m.h : 1;
          const next = points.map(([x, y], i) => [r(m.x + dx + (x - m.x) * fx + (across && !m.w && i ? p.w : 0)), r(m.y + dy + (y - m.y) * fy + (down && !m.h && i ? p.h : 0))]);
          const ends = row?.ends?.map(e => e && places.has(e) ? e : null);
          tx.update(id, { x: next[0][0], y: next[0][1], points: next, ...(ends && { ends: ends.some(Boolean) ? ends : null }) });
          continue;
        }
        const w = Math.min(p.w ?? m.w, page.w), h = Math.min(p.h ?? m.h, page.h);
        // (A Key put by hand is in no corner by name now.)
        tx.update(id, { x: r(clamp(p.x, 0, page.w - w)), y: r(clamp(p.y, 0, page.h - h)), ...((p.w !== undefined || p.h !== undefined) && { w: r(w), h: r(h) }), ...(rowOf(id)?.corner && { corner: null }) });
      }
    }
    // (What a hand put, the same change doesn't keep where the layout had it: see keep.)
    for (const id of places.keys()) { const m = scene.byId.get(id); if (m?.type === 'box') placedNow.add(m.record); }
  }
  // Marks moved, written, as one change; and nothing, where nothing moved. What was moved stays where it was put,
  // and nothing else moves (see draw, and keep).
  function moveTo(places) {
    if (places.size) App.change(tx => place(tx, places));
  }
  // A place or size typed, in the page's terms: what's locked keeps its proportions; a group's members go with it, as one.
  // (A picture is, till it's unlocked, as PowerPoint's is.)
  const lockedOf = m => { if (m.type !== 'box') { const row = rowOf(m.id); return row?.lock ?? m.geometry === 'picture'; } const t = treeOf(m.record); return !!t && !!App.notes.peek().position(t, viewOf())?.lock; };
  function put(id, at) {
    const m = scene.byId.get(id);
    if (!m) return;
    if (m.geometry === 'group') {
      const fx = (at.w ?? m.w) / m.w, fy = (at.h ?? m.h) / m.h, x = at.x ?? m.x, y = at.y ?? m.y;
      return moveTo(new Map(m.members.map(i => scene.byId.get(i)).filter(Boolean).map(b => [b.id, { x: x + (b.x - m.x) * fx, y: y + (b.y - m.y) * fy, ...(fx !== 1 && { w: b.w * fx }), ...(fy !== 1 && { h: b.h * fy }) }])));
    }
    const k = lockedOf(m) ? ('w' in at ? { h: at.w * m.h / m.w } : 'h' in at ? { w: at.h * m.w / m.h } : {}) : {};
    moveTo(new Map([[id, { x: m.x, y: m.y, ...k, ...at, typed: true }]]));
    // Read back as typed, or it says why not: a free shape stays on its page, and a text box holds its text.
    const now = m.type === 'shape' && App.scene.peek()?.byId.get(id), name = { w: 'Width', h: 'Height', x: 'Left', y: 'Top' }, pts = v => `${+(Scene.toSlide(scene.page, v / Scene.PT)).toFixed(1)} pt`;
    if (now) for (const f of Object.keys(at)) if (Math.abs(now[f] - at[f]) > 0.6) { Shell.toast(`${name[f]} stays ${pts(now[f])}: ${m.geometry === 'text' && f === 'h' && now[f] > at[f] ? 'its text needs that' : 'it stays on the page'}`, { ms: 3500 }); break; }
  }
  // A free shape turned, by its handle or its Rotation typed, by degrees clockwise, its row's own.
  // (A line by the way it runs; a group, about its middle, its shapes with it: see Drawing.)
  const turn = (id, angle) => { const a = ((Math.round(angle * 10) / 10) % 360 + 360) % 360, m = scene.byId.get(id); if (m?.geometry === 'line') return hand.aimLine(id, a); if (m?.geometry === 'group') return hand.turnBy(a - (rowOf(id)?.rotate ?? 0), [m]); if (m && a !== (m.rotate ?? 0)) App.change(tx => tx.update(id, { rotate: a || undefined }), { dated: false, say: `Rotated ${called(m)} to ${a}°` }); };
  // Its proportions locked, as PowerPoint's Lock aspect ratio: as either is typed or a corner dragged, the other follows.
  function lockSize(id, on) {
    const m = scene.byId.get(id);
    if (m?.type !== 'box') return;
    const old = App.notes.peek().position(treeOf(m.record), viewOf()), [x, y] = own(m.x, m.y);
    App.change(tx => tx.note('Position', treeOf(m.record), { ...old, x: old?.x ?? x, y: old?.y ?? y, w: old?.w ?? round(m.w), ...(on ? { lock: true, h: old?.h ?? round(m.h) } : { lock: undefined }), hand: true }, { view: viewOf() }), { dated: false, say: `${on ? 'Locked' : 'Unlocked'} the proportions of ${called(m)}` });
  }
  // A box with its middle level with a row of its like joins it, its top on theirs, so it shares their height; but one on
  // another stays just where it is. → the top it takes, or null. So what's let go goes where the drag has already shown it.
  function rowJoined(m, x, y) {
    if (m?.type !== 'box') return null;
    const tri = m.shape === 'triangle', row = scene.marks.filter(b => b.type === 'box' && b.id !== m.id && (b.shape === 'triangle') === tri && y + m.h / 2 > b.y && y + m.h / 2 < b.y + b.h && Math.abs(b.y - y) <= m.h / 2);
    const near = row.sort((a, b) => Math.abs(a.x + a.w / 2 - x - m.w / 2) - Math.abs(b.x + b.w / 2 - x - m.w / 2))[0];
    return near && !row.some(b => x < b.x + b.w && b.x < x + m.w) ? near.y : null;
  }
  function moved(ids) {
    const places = new Map();
    for (const id of ids) {
      const c = graph.getCellById(id), m = scene.byId.get(id);
      if (!c || !m) continue;
      if (c.isEdge()) {
        if (m.geometry !== 'line') continue;
        const s = c.getSource(), d = { dx: s.x - m.points[0][0], dy: s.y - m.points[0][1] };
        if (d.dx || d.dy) places.set(id, { x: m.x + d.dx, y: m.y + d.dy, ...d });
        continue;
      }
      const p = c.getPosition(), sz = c.getSize();
      if (m.type === 'frame') {
        const dx = p.x - m.x, dy = p.y - m.y;
        if (dx || dy) for (const b of membersOf(m)) places.set(b.id, { x: b.x + dx, y: b.y + dy });
      } else {
        // (A height dragged is the box's own; a width alone leaves its height to its text. A free shape's are both its own.)
        const dw = Math.abs(sz.width - m.w) > 0.01, dh = Math.abs(sz.height - m.h) > 0.01;
        if (dw || dh || Math.abs(p.x - m.x) > 0.01 || Math.abs(p.y - m.y) > 0.01) places.set(id, { x: p.x, y: p.y, ...(dw && { w: sz.width }), ...(dh && { h: sz.height }) });
      }
    }
    if (places.size === 1) {
      const [[id, p]] = places, m = scene.byId.get(id);
      if (p.w === undefined && p.h === undefined) { const y = rowJoined(m, p.x, p.y); if (y !== null) { p.y = y; p.joins = true; } }
    }
    // With Snap to grid, what's dropped lands on the grid; a group by its first, so it stays as it is.
    if (aids.peek().snap && places.size) {
      const step = gridStep(), first = places.values().next().value, dx = Math.round(first.x / step) * step - first.x, dy = Math.round(first.y / step) * step - first.y;
      for (const p of places.values()) if (p.w === undefined && p.h === undefined) { p.x += dx; p.y += dy; if (p.dx !== undefined) { p.dx += dx; p.dy += dy; } }
    }
    moveTo(places);
  }
  const membersOf = f => [...f.members.map(id => scene.byId.get(id)), ...f.frames.flatMap(id => membersOf(scene.byId.get(id)))].filter(Boolean);
  // A line's label dragged: where it's put, kept by its line as it runs (Layout.pin), the line's Position in this view.
  // (A click that shook the label by a hair leaves it where it was.)
  function movedLabel(node) {
    const m = scene.byId.get(node.getData().mark), p = node.getPosition();
    if (!m?.points || !m.label || !m.labelAt) return;
    if (Math.hypot(p.x - m.labelAt.x, p.y - m.labelAt.y) * graph.zoom() < 3) return node.setPosition(m.labelAt.x, m.labelAt.y);
    const at = Layout.pin(m.points, { x: p.x, y: p.y, w: m.label.w, h: m.label.h });
    App.change(tx => tx.note('Position', treeOf(m.record), at, { view: viewOf() }), { dated: false, say: `Moved the label of ${called(m)}` });
  }
  graph.on('node:moved', ({ node, e }) => { dragging = null; root.classList.remove('dragging'); if (node.getData()?.kind === 'label') return movedLabel(node); if (joining(node, e)) return; if (['box', 'shape'].includes(node.getData()?.kind)) hand.equalGaps(node); moved([...new Set([node.id, ...sel.getSelectedCells().map(c => c.id)])]); });
  graph.on('node:resized', ({ node }) => { dragging = null; root.classList.remove('dragging'); moved([node.id]); spilt([node.id]); });
  graph.on('node:rotating', ({ node }) => { dragging = node.id; showHandles(null); astray(node.id); });
  graph.on('node:rotated', ({ node }) => { dragging = null; turn(node.id, node.getAngle()); });
  graph.on('edge:mouseup', ({ edge }) => { if (scene.byId.get(edge.id)?.geometry === 'line') moved([edge.id]); });

  // While a box moves, its lines follow and its frames grow round it; a frame carries its members.
  // What's moved or redrawn so is no longer as the scene drew it, and is put right by the next draw.
  let pending = 0;
  const astray = (id, looks = false) => { const d = drawn.get(id); if (d) { d.where = {}; if (looks) d.what = null; } };
  function follow(node) {
    const m = scene.byId.get(node.id);
    astray(node.id);
    if (m?.type === 'frame') {
      const p = node.getPosition(), dx = p.x - m.x, dy = p.y - m.y;
      for (const b of membersOf(m)) { graph.getCellById(b.id)?.setPosition(b.x + dx, b.y + dy, { silent: false }); astray(b.id); }
    }
    if (pending) return;
    pending = requestAnimationFrame(() => {
      pending = 0;
      const rects = new Map();
      for (const b of scene.marks.filter(x => x.type === 'box')) {
        const c = graph.getCellById(b.id);
        if (c) { const p = c.getPosition(), s = c.getSize(); rects.set(b.id, { x: p.x, y: p.y, w: s.width, h: s.height }); }
      }
      const live = Scene.reflow(scene, rects), glued = new Map(rects);
      for (const b of scene.marks.filter(x => x.type === 'shape' && hand?.gluable(x))) { const c = graph.getCellById(b.id); if (c) { const p = c.getPosition(), s = c.getSize(); glued.set(b.id, { x: p.x, y: p.y, w: s.width, h: s.height, geometry: b.geometry }); } }
      hand?.followLines(glued);
      graph.batchUpdate(() => {
        for (const l of live.lines) {
          const e = graph.getCellById(l.id), ps = l.points;
          if (!e) continue;
          e.setSource({ x: ps[0][0], y: ps[0][1] }); e.setTarget({ x: ps[ps.length - 1][0], y: ps[ps.length - 1][1] });
          e.setVertices(ps.slice(1, -1).map(([x, y]) => ({ x, y })));
          astray(l.id);
          const lab = graph.getCellById(`${l.id}·label`);
          if (lab && l.labelAt) { lab.setPosition(l.labelAt.x, l.labelAt.y); astray(lab.id); }
        }
        for (const f of live.frames) {
          const c = graph.getCellById(f.id);
          if (!c || c === node) continue;
          c.setPosition(f.x, f.y); c.setSize(f.w, f.h);
          // (New objects: the cell draws a markup only where it differs from what it holds, so one changed in place never is.)
          const [body, hit, cap] = c.getMarkup();
          c.setMarkup([{ ...body, attrs: { ...body.attrs, d: f.kind === 'bracket' ? `M0.5,${f.h} V${f.h - 5} H${f.w - 0.5} V${f.h}` : `M0,0 H${f.w} V${f.h} H0 Z` } }, { ...hit, attrs: { ...hit.attrs, width: f.w } }, cap]);
          astray(f.id, true);
        }
      });
      paintStates();
    });
  }
  // The snap shows as it's dragged, not as it's let go: a row a box would join, and the grid.
  function snapMoving(node) {
    if (sel.getSelectedCells().length > 1) return;
    const p = node.getPosition();
    let x = p.x, y = rowJoined(scene.byId.get(node.id), p.x, p.y) ?? p.y;
    if (aids.peek().snap) { const step = gridStep(); x = Math.round(x / step) * step; y = Math.round(y / step) * step; }
    if (Math.abs(y - p.y) > 0.01 || Math.abs(x - p.x) > 0.01) node.setPosition(x, y);
  }
  // A text box dragged over a box: the box lit, with all the pen reaches, so it's plain it would join them. (While a design is edited, a text box is a part, and stands where it's put.)
  const textBoxOf = node => { const m = node.getData()?.kind === 'shape' && !designing && !still() ? scene.byId.get(node.id) : null; return m?.geometry === 'text' && !m.role && !m.locked && sel.getSelectedCells().length <= 1 && rowOf(m.id)?.text?.trim() ? m : null; };
  const boxAtPointer = e => { if (!e) return null; const p = graph.clientToLocal(e.clientX, e.clientY); return [...scene.marks].reverse().find(b => b.type === 'box' && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) ?? null; };
  function joinCue(node, e) {
    const b = textBoxOf(node) && boxAtPointer(e);
    if ((b?.id ?? null) === dropOn) return;
    dropOn = b?.id ?? null;
    const s = b && scoped(b);
    cue(b ? (s.own ? [b.id] : [...s.marks]) : null);
    paintFields();
  }
  function joining(node, e) {
    const m = textBoxOf(node), b = m && boxAtPointer(e);
    if (dropOn) { dropOn = null; cue(null); paintFields(); }
    if (!b) return false;
    const p = node.getPosition();
    // (Back where it was till that's made, so nothing's left hanging over the box; and the box it joined selected.)
    node.setPosition(m.x, m.y);
    const made = joinText(m, b, { x: p.x, y: p.y });
    if (made) Shell.select([b.id]);
    return made;
  }
  graph.on('node:moving', ({ node, e }) => { dragging = node.id; root.classList.add('dragging'); showHandles(null); if (node.getData()?.kind === 'label') astray(node.id); else { snapMoving(node); follow(node); joinCue(node, e); } });
  graph.on('node:resizing', ({ node }) => { dragging = node.id; root.classList.add('dragging'); showHandles(null); follow(node); });

  // ---- Double-click to type: a box's text edits its record, a shape's its own ----
  function textAt(m, target) {
    const id = target?.closest?.('[data-text]')?.getAttribute('data-text');
    return m.texts?.find(it => it.id === id) ?? m.texts?.find(it => Tree.isField(App.state.peek()[it.id] ?? {})) ?? m.texts?.[0];
  }
  // A field typed over, in a box or on a line's label: a value, as entered; an option, from its list; a tag, ticked or
  // ruled out; a blank, its record made as it's typed; a free text, its words, {Entry} and all (see Fields).
  function editField(m, it, typed) {
    if (!it) return;
    if (still()) return Shell.toast(App.whyNot());
    // What's typed in is the field selected, so Tab goes on from it and its row stays lit.
    if (isField(it)) field = { box: m.id, id: it.id };
    if (it.free) return writeText(m, it, typed);
    // A part's own words, typed over, are what's said over the design at the pen (Figma's override); a part with none, the design's own.
    if (it.of || (it.part && !it.blank && st()[it.id]?.edge === undefined)) {
      const part = partOf(m, it), raw = m.design.value.parts.find(p => p.id === part?.part)?.text ?? '';
      // (What reads a field is said in Edit design, its fields as chips, and never by its token.)
      if (!part || !part.texts.length || (typed === undefined && /\{[^{}\n]+\}/.test(raw))) return Designs.edit(m);
      return openEditor(it.of ? part.texts[0] : it, it.of ? fieldRect(m, m.texts.find(x => x.part === part.part)) : fieldRect(m, it), typed ?? raw, text => saidOfPart(`Changed the words of a part of ${whereSaid([m], scopeNow(canvas))}`, tx => Designs.say(tx, m, part.part, { text: text.trim() }, scopeNow(canvas))), { multiline: true, selectAll: typed === undefined, complete: wordsOf(m), kept: true });
    }
    const r = it.blank ? null : st()[it.id], kind = it.blank ? specOfField(m.record, it.blank.edge) : r && { type: Tree.typeOf(r), datatype: r.field };
    if (!kind || kind.type === 'object' || (r && r.args)) return;
    Shell.emit('field-edit', { box: m.id, id: it.id });
    const rect = fieldRect(m, it), at = graph.localToGraph(rect.x, rect.y + rect.h), box = root.getBoundingClientRect(), menuAt = { x: box.left + at.x, y: box.top + at.y + 2 };
    // The record, or a blank's: typed over where it's worked out, as the inspector enters one.
    // A blank of an entry its record's kind hasn't yet gives the kind the entry, as the inspector's Add does.
    // One that has one to replace goes as the inspector's does, asking from when where it has history to keep (App.put).
    const put = (out, auto = true) => r ? App.put(it.id, r, out, { auto }) : App.change(tx => {
      const { at, edge } = it.blank, spec = { out: 'field' in out ? { field: out.field } : 'choice' in out ? { choice: out.choice } : { tag: out.tag }, args: [{ edge, loc: Tree.specOf(treeOf(at)) }] };
      if (!App.schema.peek()[Tree.key(spec)]) tx.add('spec', { tree: spec });
      tx.add('record', { at, edge, ...out });
    });
    // A menu under the field, from which Tab goes on to the next field, as from one typed in.
    const picker = (items, o = {}) => {
      let close = null;
      const tabbed = e => { if (e.key !== 'Tab') return; e.preventDefault(); e.stopPropagation(); close?.(); stepField(e.shiftKey ? -1 : 1, true); };
      addEventListener('keydown', tabbed, true);
      close = Shell.menu(menuAt, items, { ...o, onClose: () => removeEventListener('keydown', tabbed, true) });
    };
    // An option is picked from its list, which what's typed narrows; one typed that isn't on it is a new option.
    if (kind.type === 'choice') {
      const now = r?.choice, opts = optionsOf(r ? r.at : it.blank.at, r ? r.edge : it.blank.edge);
      const items = q => {
        const k = Tree.norm(q ?? ''), xs = opts.filter(o => Tree.norm(o).includes(k)).map(o => ({ label: o, checked: !!now && Tree.same(o, now), run: () => !(now && Tree.same(o, now)) && put({ choice: o }) }));
        return k && !opts.some(o => Tree.same(o, q)) ? [...xs, ...(xs.length ? ['-'] : []), { label: `New option: ${Tree.clean(q)}`, run: () => put({ choice: Tree.clean(q) }) }] : xs;
      };
      return picker(items, { search: true, query: typed ?? '' });
    }
    if (kind.type === 'tag') return picker([{ label: r?.edge ?? it.blank.edge, checked: r?.tag === true, run: () => r?.tag !== true && put({ tag: true }) },
      { label: `Not ${r?.edge ?? it.blank.edge}`, checked: r?.tag === false, run: () => r?.tag !== false && put({ tag: false }) }]);
    const raw = r ? Tree.format(r.field, r.value) : '';
    openEditor(it.blank ? { ...it, look: { ...it.look } } : it, { ...rect, x: m.type === 'box' ? m.x : rect.x - 4, w: m.type === 'box' ? m.w : Math.max(rect.w + 8, 80) }, typed ?? raw, (text, keys) => {
      // (= begins a rule, as in a spreadsheet, and never the words.)
      if (/^\s*=\s*\S/.test(text) && FormulaBar.typed(r?.at ?? it.blank.at, r?.edge ?? it.blank.edge, Tree.clean(text), kind.datatype)) return;
      const v = Tree.parse(kind.datatype ?? Tree.classify(text), text);
      if (v === undefined || Tree.clean(text) === '' || (r && v === r.value)) return;
      put({ field: kind.datatype ?? Tree.classify(text), value: v }, !!keys);
    }, { selectAll: typed === undefined, ph: it.blank?.edge, tab: d => stepField(d, true) });
  }
  function edit(key, target, typed) {
    const [id, rowKey] = keyParts(key);
    const m = scene.byId.get(id);
    if (!m || still()) return;
    if (m.geometry === 'table') return hand.editCell(m, target, typed);
    // (What's gone by the day shown has nothing to type over.)
    if (m.change === 'Gone') return Shell.toast(`Not in the chart as of ${Tree.formatDate(scene.day, 'short')}`);
    // What's typed over: a record's value as entered, not as the chart reads it; a shape's text as written.
    let it = null, rect, save, raw, escaped = null;
    const view = viewOf(), N = App.notes.peek();
    // A caption typed as the output's own name is no caption.
    const caption = (tx, p, text) => { const c = Tree.clean(text); tx.note('Caption', p, c && c !== Scene.outputName(N, p) ? c : undefined, { view }); };
    if (m.type === 'box' || (m.type === 'line' && m.texts?.length)) {
      it = textAt(m, target);
      return editField(m, it?.free || it?.blank || it?.part || App.state.peek()[it?.id]?.edge !== undefined ? it : m.texts.find(x => App.state.peek()[x.id]?.edge !== undefined) ?? it, typed);
    } else if (m.type === 'frame') {
      it = m.caption;
      rect = { x: m.x, y: m.y, w: Math.max(160, m.w), h: m.label + 8 };
      save = text => App.change(tx => caption(tx, m.output, text));
    } else if (m.geometry === 'legend' && rowKey) {
      const r = m.rows.find(x => x.key === rowKey);
      if (!r) return;
      it = r.caption;
      rect = { x: m.x + r.x + r.sw.w + 6, y: m.y + r.y, w: r.w - r.sw.w - 6, h: r.h + 2 };
      // The Key's own: no other place's word for it changes.
      save = text => App.change(tx => keyCaption(tx, m, r, text));
    } else if (m.role === 'number') {
      return Export.setup();
    } else if (m.role === 'footer') {
      // The chart's footer's words, on every chart view.
      it = m.texts[0];
      rect = { x: m.x, y: m.y, w: Math.max(m.w, 240), h: m.h };
      raw = footNote().text;
      save = text => App.change(tx => { const { format, ...f } = footNote(), t = text.trim(); tx.note('Footer', { kind: 'View' }, t || f.number ? { ...f, text: t, ...(format && { format }) } : undefined); }, { dated: false, say: 'Set the footer' });
    } else if (m.type === 'shape' && !['line', 'picture', 'group'].includes(m.geometry)) {
      const legend = m.geometry === 'legend', row = rowOf(m.id);
      // (While a design is edited, what's typed in the part its other fields go in stands under them; the fields stay fields.)
      it = legend ? m.texts[0] : !row?.rest && m.texts[0] ? m.texts[0] : { look: m.look, text: '', lines: [] };
      rect = legend ? { x: m.x, y: m.y + 4, w: m.w, h: 18 } : { x: m.x, y: m.y, w: m.w, h: m.h };
      raw = legend ? m.title : row?.text;
      // (While a design is edited, a part that reads a field is typed in the panel, its fields as chips, and never by its token.)
      if (designing && typed === undefined && /\{[^{}\n]+\}/.test(raw ?? '')) { Shell.select([m.id]); return setTimeout(() => document.querySelector('.part-words .words-in')?.focus(), 30); }
      // A text box left empty goes, however it's left, as PowerPoint's does.
      const gone = tx => tx.remove(m.id);
      save = (text, keys, runs) => { const said = App.change(tx => { if (m.geometry === 'text' && !text.trim() && !row?.rest) return gone(tx); tx.update(m.id, legend ? { title: text } : { text, runs: runs?.length ? runs : undefined }); if (designing) Designs.holdWords(tx, m.id, text); }); if (said && !legend && m.geometry === 'text' && !designing) askedOf(m.id, text); };
      if (m.geometry === 'text' && !raw?.trim() && !row?.rest) escaped = () => App.change(gone);
    }
    if (!it) return;
    // (Its words can be set part by part: a shape's own, not the Key's title or what a formula says. While a design is edited, a `{` offers what its box can read.)
    const parts = m.type === 'shape' && m.geometry !== 'legend' && !m.role && !/^\s*=/.test(raw ?? '') && !rowOf(m.id)?.rest;
    const reads = m.type === 'shape' && m.geometry !== 'legend' && !m.role ? (designing ? scene.byId.get(designing.box) : boxOver(m)) : null;
    openEditor(it, rect, typed ?? raw ?? it.text ?? '', save, { multiline: m.type === 'shape' && m.geometry !== 'legend', selectAll: typed === undefined, grow: !!m.auto, escaped, kept: m.type === 'shape', ...(reads && { complete: wordsOf(reads) }), ...(parts && { rich: { runs: typed !== undefined ? [] : rowOf(m.id)?.runs ?? [] } }) });
  }
  // The box a free shape stands on, by its middle: the topmost.
  const boxOver = m => { const cx = m.x + m.w / 2, cy = m.y + m.h / 2; return [...scene.marks].reverse().find(b => b.type === 'box' && cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h) ?? null; };
  // A text box that asks for a field reads the box it stands on, as text dropped there does; on none, it's said it won't print, and how it can.
  function askedOf(id, text) {
    if (!/\{[^{}\n]+\}/.test(text) || /^\s*=/.test(text)) return;
    const m = scene.byId.get(id), b = m && boxOver(m);
    if (b) return joinText(m, b);
    Shell.toast(`${text.match(/\{[^{}\n]+\}/)[0]} reads a box, so this won’t print here: drag it onto one`, { ms: 5000 });
  }
  // A text box dropped on a box joins it, its free text at the pen, its words and its look kept; where it's a mistake, it can stand loose where it was dropped.
  function joinText(m, b, place = null) {
    const s = scoped(b), row = rowOf(m.id), view = viewOf(), N = App.notes.peek(), { Layer, ...kept } = row.format ?? {}, look = Object.fromEntries(Object.entries(kept).filter(([k]) => k in Scene.DEFAULTS.text));
    const said = `Added text to ${whereSaid([b], s)}`;
    return App.change(tx => {
      for (const p of s.own ? [treeOf(b.record)] : s.outputs) { const was = N.notes('Text').find(n => n.view === view && Tree.key(n.pattern) === Tree.key(p))?.value; tx.note('Text', p, was?.text ? { ...was, text: `${was.text}\n${row.text}` } : { ...look, text: row.text, ...(row.runs?.length && { runs: row.runs }) }, { view }); }
      tx.remove(m.id);
      tx.says(said);
    }, { dated: false, say: said, go: place ? () => ['Leave it loose', () => { Shell.parts.peek().undo?.undo(); moveTo(new Map([[m.id, place]])); }] : null });
  }
  // Typing in place, over the mark: Enter keeps it (a shape's begins a paragraph: see below), Esc doesn't, as a cell's in
  // Excel (but does what `escaped` says), unless it's `kept`, as a shape's text in PowerPoint; and leaving keeps it.
  // `grow`: it widens as it's typed, a text box nobody has sized; `box`: a new box, named as it's typed, its kind
  // chosen beside it (see kindChooser) from `box.kinds`, `box.kind` first, each chosen told to `box.pick`.
  // `rich`, its words can be set part by part: what's selected in it takes a look from the format bar or its keys, and what it saves has its runs too.
  let richEdit = null;
  function openEditor(it, rect, text, save, { multiline = false, selectAll = false, grow = false, box = null, escaped = null, ph = null, complete = null, tab = null, kept = false, rich = null } = {}) {
    over.querySelectorAll('.dc-edit, .dc-kind, .dc-kinds').forEach(x => x.remove());
    tipFor(null);
    const z = graph.zoom(), p = graph.localToGraph(rect.x, rect.y), t = it.look, size = px(t.Size) * z;
    const ed = document.createElement('div');
    ed.className = 'dc-edit' + (grow ? ' grow' : '') + (box || ph ? ' new' : '');
    ed.contentEditable = 'plaintext-only';
    ed.spellcheck = false;
    if (ph) ed.dataset.ph = ph;
    Object.assign(ed.style, { left: `${p.x}px`, top: `${p.y}px`, [grow ? 'minWidth' : 'width']: `${rect.w * z}px`, minHeight: `${rect.h * z}px`,
      font: `${t.Bold ? 700 : 400} ${t.Italic ? 'italic' : ''} ${size}px/${1.2 * (t.Spacing ?? 1)} ${Scene.fontFamily(t.Font)}`, textAlign: t.Align ?? 'center', color: t.Color,
      padding: box ? `${Math.max(0, (rect.h * z - size * 1.2 * (t.Spacing ?? 1)) / 2)}px ${9.6 * z}px` : `${2 * z}px ${7.2 * z}px` });
    ed.textContent = text;
    over.appendChild(ed);
    ed.focus();
    const parts = rich && richEditor(ed, text, rich.runs ?? [], it.look);
    if (parts) richEdit = parts;
    // Double-click selects it all, to type over; typing over starts after what was typed.
    const range = document.createRange(), s = getSelection();
    range.selectNodeContents(ed);
    if (!selectAll) range.collapse(false);
    s.removeAllRanges(); s.addRange(range);
    let done = false;
    const list = complete && completing(ed, complete), kind = box && kindChooser(ed, box, () => finish(true));
    const finish = (ok, keys) => { if (done) return; done = true; list?.close(); kind?.close(); const runs = parts?.runs(), v = (parts ? ed.textContent : ed.innerText).replace(/\n$/, ''); parts?.close(); if (parts && richEdit === parts) richEdit = null; removeEventListener('pointerdown', outside, true); ed.remove(); root.focus({ preventScroll: true }); if (ok) save(v, keys, runs); else escaped?.(); };
    // (Going to the format bar's palette, it stays open, what's selected kept, till a press anywhere else.)
    const outside = e => { if (!e.target.closest?.('.dc-edit, .fb, .float')) finish(true); };
    ed.addEventListener('keydown', e => {
      e.stopPropagation();
      if (list?.key(e) || kind?.key(e)) return;
      if (parts?.key(e)) return;
      if (e.key === 'Escape') { e.preventDefault(); finish(kept); }
      // A shape's words, as PowerPoint's: Enter begins a paragraph, Ctrl+Enter, Esc or a click away ends the typing. (With nothing typed there's no paragraph to end: it ends.)
      else if (e.key === 'Enter' && multiline && !(e.ctrlKey || e.metaKey) && (e.shiftKey || ed.textContent)) { e.preventDefault(); paragraph(ed); }
      else if (e.key === 'Enter') { e.preventDefault(); finish(true, true); }
      // In a box's field, Tab keeps it and goes on to type in the next, as a form's does; Shift+Tab, the one before.
      else if (e.key === 'Tab' && tab) { e.preventDefault(); finish(true); setTimeout(() => tab(e.shiftKey ? -1 : 1)); }
      // (In a shape's words, a tab, as PowerPoint's: the next stop.)
      else if (e.key === 'Tab' && multiline && !e.shiftKey) { e.preventDefault(); document.execCommand('insertText', false, '\t'); }
    });
    ed.addEventListener('blur', e => { if (parts && e.relatedTarget?.closest?.('.fb, .float')) return addEventListener('pointerdown', outside, true); if (kind && e.relatedTarget?.closest?.('.dc-kinds')) return; finish(true); });
    return ed;
  }
  // A new line at the caret, as text, so a run's places stay in its characters. (At the very end, a second, which keeping the words takes off, as a last line break draws nothing to type on.)
  function paragraph(ed) {
    const s = getSelection();
    if (!s.rangeCount) return;
    const r = s.getRangeAt(0), rest = r.cloneRange();
    r.deleteContents();
    rest.selectNodeContents(ed); rest.setStart(r.endContainer, r.endOffset);
    const n = document.createTextNode(rest.toString() ? '\n' : '\n\n');
    r.insertNode(n);
    r.setStart(n, 1); r.collapse(true); s.removeAllRanges(); s.addRange(r);
    ed.dispatchEvent(new Event('input', { bubbles: true }));
  }
  // Words being typed set part by part (Scene's runs). Each run is a span of the editor's, saying what it is, so typing in it stays in it; what's selected, or else the word the
  // caret's in, takes a look; Ctrl+B, Ctrl+I, Ctrl+U, Ctrl+Shift+X, and Ctrl+Shift+= and Ctrl+= for a superscript and subscript, as PowerPoint's; Ctrl+] and Ctrl+[ its size.
  function richEditor(ed, text, runs, base) {
    let last = [0, 0];
    const css = r => [r.Bold !== undefined && `font-weight:${r.Bold ? 700 : 400}`, r.Italic !== undefined && `font-style:${r.Italic ? 'italic' : 'normal'}`, (r.Underline || r.Strike) && `text-decoration:${[r.Underline && 'underline', r.Strike && 'line-through'].filter(Boolean).join(' ')}`, r.Color && `color:${r.Color}`, r.Font && `font-family:${Scene.fontFamily(r.Font).replace(/"/g, "'")}`, r.Size && `font-size:${px(r.Size) / pageScale() * graph.zoom() * (r.Base ? 0.66 : 1)}px`, r.Base && `vertical-align:${r.Base === 'up' ? 'super' : 'sub'}`, r.Base && !r.Size && 'font-size:66%'].filter(Boolean).join(';');
    const esc = t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const paint = (txt, rs) => {
      let html = '', at = 0;
      for (const r of [...rs].sort((a, b) => a.from - b.from)) { const { from, to, ...look } = r; if (from > at) html += esc(txt.slice(at, from)); html += `<span data-run='${JSON.stringify(look).replace(/'/g, '&#39;')}' style="${css(look)}">${esc(txt.slice(from, to))}</span>`; at = to; }
      ed.innerHTML = html + esc(txt.slice(at));
    };
    const read = () => {
      const out = []; let at = 0;
      const walk = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT);
      for (let n; (n = walk.nextNode());) { const own = n.parentElement.closest('[data-run]'), look = own && JSON.parse(own.dataset.run); if (look && n.length) { const prev = out.at(-1); if (prev && prev.to === at && JSON.stringify({ ...prev, from: 0, to: 0 }) === JSON.stringify({ from: 0, to: 0, ...look })) prev.to = at + n.length; else out.push({ from: at, to: at + n.length, ...look }); } at += n.length; }
      return out;
    };
    const place = (a, b) => {
      const walk = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT), r = document.createRange(), s = getSelection();
      let at = 0, began = false, ended = false;
      for (let n; (n = walk.nextNode());) { if (!began && a <= at + n.length) { r.setStart(n, a - at); began = true; } if (began && b <= at + n.length) { r.setEnd(n, b - at); ended = true; break; } at += n.length; }
      if (!began) { r.selectNodeContents(ed); r.collapse(false); } else if (!ended) r.collapse(true);
      s.removeAllRanges(); s.addRange(r);
    };
    const now = () => {
      const s = getSelection();
      if (s.rangeCount && ed.contains(s.anchorNode) && ed.contains(s.focusNode)) {
        const of = (n, o) => { const r = document.createRange(); r.selectNodeContents(ed); r.setEnd(n, o); return r.toString().length; }, a = of(s.anchorNode, s.anchorOffset), b = of(s.focusNode, s.focusOffset);
        last = [Math.min(a, b), Math.max(a, b)];
      }
      return last;
    };
    // The look at what's selected, for the format bar to say.
    const lookNow = () => { const [a] = now(), r = read().find(x => x.from <= a && x.to > a); return { ...base, ...(r ?? {}), Bold: !!(r?.Bold ?? base.Bold), Italic: !!(r?.Italic ?? base.Italic), Underline: !!(r?.Underline ?? base.Underline), Strike: !!(r?.Strike ?? base.Strike) }; };
    const told = () => { rich.value = lookNow(); };
    const moved = () => { if (document.activeElement === ed) told(); };
    document.addEventListener('selectionchange', moved);
    // A look given what's selected, or the word the caret's in; a yes-or-no given its opposite where it has it throughout.
    function set(label, value) {
      let [a, b] = now();
      const t = ed.textContent;
      if (a === b) { while (a > 0 && /\S/.test(t[a - 1])) a--; while (b < t.length && /\S/.test(t[b])) b++; }
      if (a === b) return false;
      const rs = read(), scale = pageScale();
      const has = (l, at) => { const r = rs.find(x => x.from <= at && x.to > at); return r?.[l] ?? (l === 'Base' ? undefined : base[l]); };
      const yes = v => v === undefined ? !Array.from({ length: b - a }, (_, i) => has(label, a + i)).every(Boolean) : v;
      const v = label === 'Bold' || label === 'Italic' || label === 'Underline' || label === 'Strike' ? yes(value) : value;
      // (A look the same as the rest's goes, so a run says only what's other than its text; a word in a bold box can still be not bold.)
      paint(t, Scene.runsWith(rs, a, b, label, v, { ...base, Size: base.Size * scale }));
      place(a, b); last = [a, b]; ed.focus(); told();
      return true;
    }
    const sized = by => { const [a] = now(), r = read().find(x => x.from <= a && x.to > a), at = r?.Size ?? Math.round(base.Size * pageScale() * 2) / 2; return set('Size', Math.max(1, at + by)); };
    paint(text, runs);
    told();
    return { runs: read, close() { document.removeEventListener('selectionchange', moved); rich.value = null; }, set,
      key(e) {
        if (!(e.ctrlKey || e.metaKey) || e.altKey) return false;
        const k = e.key.toLowerCase(), act = !e.shiftKey && k === 'b' ? () => set('Bold') : !e.shiftKey && k === 'i' ? () => set('Italic') : !e.shiftKey && k === 'u' ? () => set('Underline') : e.shiftKey && k === 'x' ? () => set('Strike')
          : e.shiftKey && (k === '+' || k === '=') ? () => set('Base', lookNow().Base === 'up' ? undefined : 'up') : !e.shiftKey && k === '=' ? () => set('Base', lookNow().Base === 'down' ? undefined : 'down')
          : !e.shiftKey && k === ']' || (e.shiftKey && k === '>') ? () => sized(1) : !e.shiftKey && k === '[' || (e.shiftKey && k === '<') ? () => sized(-1) : null;
        if (!act) return false;
        e.preventDefault();
        act();
        return true;
      } };
  }
  // A new box's kind, chosen beside its name as it's typed: "Entity ▾" at the name's right, its placeholder "New entity".
  // A click opens the kinds, the one it is ticked; Tab and Shift+Tab step through them. The keys stay in the name all the
  // while, so Enter makes the box and Esc makes nothing, wherever the pointer went.
  function kindChooser(ed, { kinds: known, kind, pick }, leave) {
    const ks = [...known];
    let at = Math.max(0, ks.indexOf(kind)), pane = null;
    const chip = document.createElement('button'), label = document.createElement('span');
    chip.type = 'button';
    chip.className = 'btn dd dc-kind';
    chip.tabIndex = -1;
    chip.setAttribute('aria-haspopup', 'listbox');
    chip.append(label);
    over.appendChild(chip);
    const keep = e => e.preventDefault();
    const set = i => { at = (i + ks.length) % ks.length; label.textContent = ks[at]; ed.dataset.ph = `New ${lowered(ks[at])}`; chip.setAttribute('aria-label', `Kind: ${ks[at]}`); pick(ks[at]); };
    const shut = () => { const was = pane; pane = null; was?.remove(); chip.setAttribute('aria-expanded', 'false'); };
    // (The keys back in the name, after what's been typed of it.)
    const toName = () => { ed.focus(); const r = document.createRange(), s = getSelection(); r.selectNodeContents(ed); r.collapse(false); s.removeAllRanges(); s.addRange(r); };
    const open = () => {
      pane = document.createElement('div');
      pane.className = 'menu dc-kinds';
      pane.setAttribute('role', 'listbox');
      pane.append(...ks.map((k, i) => {
        const o = document.createElement('div');
        o.className = 'menu-item';
        o.setAttribute('role', 'option');
        o.setAttribute('aria-selected', String(i === at));
        o.innerHTML = `<span class="check">${i === at ? Shell.iconMarkup('check') : ''}</span><span class="label"></span>`;
        o.lastChild.textContent = k;
        o.addEventListener('pointerdown', e => { keep(e); const away = pane.contains(document.activeElement); set(i); shut(); if (away) toName(); });
        return o;
      }));
      // A kind of a new name, typed under them: the chip clicked, the keys go to it for as long as that takes, and back to the name.
      const typed = document.createElement('input');
      Object.assign(typed, { className: 'dc-newkind', placeholder: 'New kind', spellcheck: false, autocomplete: 'off' });
      typed.setAttribute('aria-label', 'New kind');
      typed.addEventListener('keydown', e => {
        e.stopPropagation();
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          const name = Tree.clean(typed.value), had = ks.findIndex(k => Tree.same(k, name));
          if (name) { if (had < 0) ks.push(name); set(had < 0 ? ks.length - 1 : had); }
          shut(); toName();
        } else if (e.key === 'Escape') { e.preventDefault(); shut(); toName(); }
      });
      typed.addEventListener('blur', e => { if (pane && e.relatedTarget !== ed) leave(); });
      pane.append(typed);
      pane.addEventListener('pointerdown', e => { if (e.target !== typed) keep(e); });
      over.appendChild(pane);
      Object.assign(pane.style, { left: `${chip.offsetLeft}px`, top: `${chip.offsetTop + chip.offsetHeight + 4}px` });
      chip.setAttribute('aria-expanded', 'true');
    };
    chip.addEventListener('pointerdown', e => { keep(e); if (e.button === 0) { if (pane) { const away = pane.contains(document.activeElement); shut(); if (away) toName(); } else { open(); pane.querySelector('.dc-newkind').focus(); } } });
    set(at);
    // At the name's right, level with it; or at its left, where the right runs off the view.
    const x = ed.offsetLeft + ed.offsetWidth + 6;
    Object.assign(chip.style, { left: `${x + chip.offsetWidth > root.clientWidth - 8 ? ed.offsetLeft - chip.offsetWidth - 6 : x}px`, top: `${ed.offsetTop + (ed.offsetHeight - chip.offsetHeight) / 2}px` });
    return {
      close() { shut(); chip.remove(); },
      key(e) {
        if (e.key === 'Tab') { set(at + (e.shiftKey ? -1 : 1)); if (pane) { shut(); open(); } }
        else if (e.key === 'Escape' && pane) shut();
        else return false;
        e.preventDefault();
        return true;
      },
    };
  }
  // Typing `{` in a free text offers the record's entries, as a form letter's fields: the list narrows as the name is
  // typed, the arrows move in it, and Enter or Tab puts `{Entry}` in; Esc, or a key that isn't in a name, leaves it.
  // `labels`, the entries to offer.
  function completing(ed, labels) {
    const pane = document.createElement('div');
    pane.className = 'dc-complete';
    pane.setAttribute('role', 'listbox');
    pane.hidden = true;
    over.appendChild(pane);
    let items = [], at = 0, from = -1;
    const before = () => { const s = getSelection(); if (!s.rangeCount || !ed.contains(s.focusNode)) return null; const r = document.createRange(); r.selectNodeContents(ed); r.setEnd(s.focusNode, s.focusOffset); return r.toString(); };
    const caret = n => { const w = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT); for (let x; (x = w.nextNode());) { if (n <= x.length) return getSelection().collapse(x, n); n -= x.length; } getSelection().collapse(ed, ed.childNodes.length); };
    const draw = () => {
      pane.replaceChildren(...items.map((l, i) => { const o = document.createElement('div'); o.className = 'menu-item' + (i === at ? ' on' : ''); o.setAttribute('role', 'option'); o.textContent = l;
        o.addEventListener('pointerdown', e => { e.preventDefault(); at = i; put(); }); return o; }));
      const r = ed.getBoundingClientRect(), b = over.getBoundingClientRect();
      Object.assign(pane.style, { left: `${r.left - b.left}px`, top: `${r.bottom - b.top + 2}px` });
    };
    const close = () => { pane.hidden = true; from = -1; };
    const look = () => {
      const s = before(), m = s && /\{([^{}\n]*)$/.exec(s);
      if (!m) return close();
      from = s.length - m[0].length;
      const q = m[1].toLowerCase();
      items = labels.filter(l => l.toLowerCase().includes(q)).sort((a, b) => !a.toLowerCase().startsWith(q) - !b.toLowerCase().startsWith(q));
      at = Math.min(at, Math.max(0, items.length - 1));
      pane.hidden = !items.length;
      if (items.length) draw();
    };
    function put() {
      const s = before() ?? '', all = ed.innerText.replace(/\n$/, ''), word = `{${items[at]}}`, rest = all.slice(s.length).replace(/^[^{}\s]*\}?/, '');
      ed.textContent = all.slice(0, from) + word + rest;
      caret(from + word.length);
      close();
    }
    ed.addEventListener('input', () => { at = 0; look(); });
    ed.addEventListener('click', look);
    return {
      close() { pane.remove(); },
      key(e) {
        if (pane.hidden) return false;
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { at = (at + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length; draw(); }
        else if (e.key === 'Enter' || e.key === 'Tab') put();
        else if (e.key === 'Escape') close();
        else return false;
        e.preventDefault();
        return true;
      },
    };
  }
  graph.on('node:dblclick', ({ e, node }) => {
    const k = node.getData()?.kind;
    if (k === 'page') return addAt(e);
    if (k === 'foot') return edit(node.id, e.target);
    // A footnote's line double-clicked is typed over, for all that carry it.
    if (scene.byId.get(node.id)?.role === 'footnotes') { const fm = scene.byId.get(node.id), got = footAt(fm, e.clientX, e.clientY); return got ? editFoot(fm, got) : undefined; }
    // A field double-clicked is typed in, a line's label's too; the room of a box that was selected already starts
    // a free text there.
    if (k === 'box' || k === 'label') {
      const f = fieldUnder(e.clientX, e.clientY);
      if (f?.it) { pickField(f); return editField(f.m, f.it); }
      if (k === 'box' && twice?.selected && twice.id === node.id && !still()) return writeText(scene.byId.get(node.id));
    }
    if (UNMARKED.has(k)) return;
    const g = groupOf(node.id);
    if (g) { entered = g.id; sel.reset(node); }
    const m = scene.byId.get(node.id);
    edit(m?.geometry === 'legend' && keyRow() ? Shell.selection.peek()[0] : node.id, e.target);
  });
  graph.on('blank:dblclick', ({ e }) => addAt(e));

  // ---- Fields: a box's texts as a form's (dendra.md, Fields) ----
  // Each text in a box, or on a line's label, that's an entry, a blank or a free text is a field. Pointed at, it's
  // outlined quietly, with the text pointer and its entry's name; a click on one in a mark already selected selects it,
  // as a second click into a PowerPoint shape goes into its text; a double-click, F2, Enter or a key typed edits it in
  // place. Selected, Delete clears it, Ctrl+C copies it, and a right-click offers what applies. Its row in
  // the inspector lights with it, and pointing at the row lights it here. Showing or hiding one is a Shown note at the
  // entry's pattern at the scope; a free text is a Text note there; each act is one change.
  const st = () => App.state.peek();
  // (A part of a design is reached as a field is: with its box selected, a click on it selects it. Dendra.md, Group designs.)
  const isField = it => !!it && (it.blank || it.free || it.part || it.of || st()[it.id]?.edge !== undefined);
  // A field's part, where it's in one: { m: the part's mark, id }.
  const partOf = (m, it) => it?.of ? it : it?.part ? m?.parts?.find(p => p.part === it.part) ?? null : null;
  // A text's rect on the page, as the scene sets its lines in its mark.
  function fieldRect(m, it) {
    if (it.of) return { x: it.x, y: it.y, w: it.w, h: it.h };
    const o = m.type === 'line' ? m.labelAt ?? { x: 0, y: 0 } : m, t = it.look, lh = Scene.lineHeight(t);
    const xs = it.lines.map(l => l.x - (t.Align === 'center' ? l.w / 2 : t.Align === 'right' ? l.w : 0));
    return { x: o.x + Math.min(...xs), y: o.y + Math.min(...it.lines.map(l => l.y)) - Scene.baseline(t), w: Math.max(1, ...it.lines.map(l => l.w)), h: it.lines.length * lh };
  }
  // The field under a point on screen: of the topmost box there, or line label, the text within a few pixels of it, or
  // null for the box's own room. → { m, it } or null.
  function fieldUnder(cx, cy) {
    if (!scene) return null;
    const p = graph.clientToLocal(cx, cy), pad = 3 / graph.zoom();
    const inside = (r, d = 0) => p.x >= r.x - d && p.x <= r.x + r.w + d && p.y >= r.y - d && p.y <= r.y + r.h + d;
    for (let i = scene.marks.length - 1; i >= 0; i--) {
      const m = scene.marks[i];
      if (m.type === 'box' ? !inside(m) : !(m.type === 'line' && m.labelAt && m.label && inside({ ...m.labelAt, w: m.label.w, h: m.label.h }, pad))) continue;
      // The text the point is on, or else the one it's within a few pixels of.
      const it = m.texts.find(x => x.lines?.length && inside(fieldRect(m, x))) ?? m.texts.find(x => x.lines?.length && inside(fieldRect(m, x), pad));
      // (Or else the part of a design there, the topmost, where it has something to show.)
      const part = !isField(it) ? [...m.parts ?? []].reverse().find(q => q.geometry !== 'text' && q.geometry !== 'line' && inside(q)) : null;
      return { m, it: part ?? (isField(it) ? it : null) };
    }
    return null;
  }
  // Where a field's row is in the inspector: its record's, or a blank's place there.
  const rowKey = it => !it || it.of ? null : it.blank ? `${it.blank.at}|${Tree.norm(it.blank.edge)}` : it.free ? null : it.id;
  const fieldName = it => it.blank ? it.blank.edge : it.free ? 'Text' : it.of ? it.name ?? Shapes.name(it.geometry) ?? 'Part' : st()[it.id]?.edge ?? (it.part ? 'Part' : '');
  // A field of a mark by its key: one of its texts, or a part of a design.
  const fieldIn = (m, id) => m?.texts?.find(x => x.id === id) ?? m?.parts?.find(x => x.id === id);
  // The field selected, as the scene now draws it; a blank typed into, its record now; null once it isn't drawn.
  const filled = (m, id) => { const [at, edge] = id.slice(6).split('|'); return m?.texts?.find(x => st()[x.id]?.at === at && Tree.same(st()[x.id].edge, edge)); };
  const fieldNow = () => {
    const m = field && scene?.byId.get(field.box), it = fieldIn(m, field?.id) ?? (field?.id.startsWith('blank:') ? filled(m, field.id) : null);
    if (it && it.id !== field.id) field = { ...field, id: it.id };
    return it ? { m, it } : null;
  };
  // A field's outline, drawn over the chart: pointed at, quiet; selected, the accent's; lit from the inspector, its row
  // pointed at; and a box a row is dragged over, as the drop's target.
  function paintFields() {
    marks.querySelectorAll('.dc-field').forEach(n => n.remove());
    if (!scene) return;
    const draw = (r, cls, pad = 2) => {
      const p = document.createElementNS(NS, 'rect');
      Object.entries({ x: r.x - pad, y: r.y - pad, width: r.w + 2 * pad, height: r.h + 2 * pad, rx: 1.5, class: `dc-field ${cls}` }).forEach(([k, v]) => p.setAttribute(k, v));
      marks.appendChild(p);
    };
    const f = fieldNow();
    if (!f && field) field = null;
    if (f) draw(fieldRect(f.m, f.it), 'on');
    const h = hovered && fieldIn(scene.byId.get(hovered.box), hovered.id);
    // What was pointed at and is drawn no longer (a blank typed into) is pointed at no longer, till the pointer moves.
    if (hovered && !h) { hovered = null; tipFor(null); root.classList.remove('on-field'); }
    // (Only in what's selected: a click on any other takes the box, so its words aren't what's on offer yet.)
    if (h && hovered.id !== field?.id && sel.isSelected(graph.getCellById(hovered.box) ?? {})) draw(fieldRect(scene.byId.get(hovered.box), h), 'hover');
    if (litKey) for (const m of scene.marks) for (const it of m.texts ?? []) if (rowKey(it) === litKey && it.lines?.length) draw(fieldRect(m, it), 'lit');
    const d = dropOn && scene.byId.get(dropOn);
    if (d) draw(d, 'drop', 4);
    // A footnote's line, or a marker, selected.
    if (picked_foot?.rect) draw(picked_foot.rect, 'on', 1);
    if (picked_foot?.f) { const fm = scene.marks.find(x => x.role === 'footnotes'); if (fm?.feet?.some(y => y.n === picked_foot.f.n)) draw(footRect(fm, picked_foot.f), 'on', 1); else picked_foot = null; }
    fieldLit.value = rowKey((h && hovered ? h : null) ?? fieldNow()?.it) ?? null;
    fieldPicked.value = field ? `${field.box}|${field.id}` : null;
  }
  // Its entry's name, on hover, a moment after the pointer stops on it, as a tooltip shows.
  const tip = document.createElement('div');
  tip.className = 'dc-tip';
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  over.appendChild(tip);
  let tipTimer = 0, tipQuiet = null;
  function tipFor(f) {
    clearTimeout(tipTimer);
    tip.hidden = true;
    if (!f?.it) return;
    tipTimer = setTimeout(() => {
      if (tipQuiet) return;
      tip.textContent = f.it.blank ? `${fieldName(f.it)}, blank` : fieldName(f.it);
      tip.style.visibility = 'hidden'; tip.hidden = false;
      // It covers nothing that's read: over what it names, or under it, or beside it, the first place clear of every box,
      // label and shape on the page (and where there's none, the row its inspector lights says it, alone).
      const z = graph.zoom(), w = tip.offsetWidth / z, h = tip.offsetHeight / z, g = 5 / z, r = fieldRect(f.m, f.it), o = f.m.type === 'box' ? f.m : r, mid = r.y + r.h / 2 - h / 2;
      const taken = scene.marks.flatMap(m => m.type === 'line' ? (m.labelAt && m.label ? [{ ...m.labelAt, w: m.label.w, h: m.label.h }] : []) : m.geometry === 'group' || m.geometry === 'line' || m.type === 'frame' ? [] : [m]);
      const at = [[o.x + o.w / 2, o.y - h - g], [o.x + o.w / 2, o.y + o.h + g], [o.x + o.w + g + w / 2, mid], [o.x - g - w / 2, mid]]
        .find(([x, y]) => !taken.some(q => x - w / 2 < q.x + q.w && x + w / 2 > q.x && y < q.y + q.h && y + h > q.y));
      if (!at) { tip.hidden = true; tip.style.visibility = ''; return; }
      const a = graph.localToGraph(at[0], at[1]);
      Object.assign(tip.style, { left: `${a.x}px`, top: `${a.y}px`, visibility: '' });
    }, 600);
  }
  // The pointer says what a click does: the text pointer over a field, move over a selected box's room.
  function hover(f) {
    const was = hovered;
    if (tipQuiet && pointerAt && Math.hypot(pointerAt.x - tipQuiet.x, pointerAt.y - tipQuiet.y) > 4) tipQuiet = null;
    hovered = f?.it && !dragging ? { box: f.m.id, id: f.it.id } : null;
    root.classList.toggle('on-field', !!hovered);
    root.classList.toggle('on-grab', !!hovered && !designing && !still() && f.m.type === 'box' && grabbable(fieldNow(), f));
    root.classList.toggle('on-body', !!f && !f.it && f.m.type === 'box' && sel.isSelected(graph.getCellById(f.m.id) ?? {}));
    if (was?.id !== hovered?.id || was?.box !== hovered?.box) { paintFields(); tipFor(hovered && sel.isSelected(graph.getCellById(hovered.box) ?? {}) ? f : null); }
  }
  function pickField(f) {
    field = f?.it && isField(f.it) ? { box: f.m.id, id: f.it.id } : null;
    paintFields();
  }
  // The field after the one selected in its box (`by` 1), or before it (-1), round; with `edit`, typed in at once.
  function stepField(by, edit = false) {
    const f = fieldNow(), all = f?.m.texts.filter(x => isField(x) && x.lines?.length) ?? [];
    if (!all.length) return false;
    const it = all[(all.findIndex(x => x.id === f.it.id) + by + all.length) % all.length];
    pickField({ m: f.m, it });
    if (edit) editField(f.m, it);
  }

  // The entry a mark's record has of a label: at it, or else nearest it.
  function entryIn(at, edge) {
    const s = st(), es = Tree.index(s).entries;
    for (let todo = [at], i = 0; i < todo.length; i++) for (const e of es.get(todo[i]) ?? []) { if (Tree.same(s[e].edge, edge)) return e; todo.push(e); }
    return null;
  }
  // What an entry of a label takes at a record, by the schema: { type, datatype?, fits }, where `fits` says the record's
  // kind has it; where it hasn't, what the label takes at an object of any kind, which the kind gets as it's typed (as
  // the inspector's Add gives it), or null where the chart has no such entry.
  function specOfField(at, edge) {
    const t = treeOf(at), S = Object.values(App.schema.peek()).filter(x => x.args?.length === 1 && Tree.same(x.args[0].edge, edge));
    const mine = t && S.find(x => Tree.narrower(t, x.args[0].loc)), s = mine ?? (t && !t.args && S.find(x => !x.args[0].loc.args));
    return !s ? null : { ...('field' in s.out ? { type: 'field', datatype: s.out.field } : 'choice' in s.out ? { type: 'choice' } : { type: 'tag' }), fits: !!mine };
  }
  // A choice's options at a record, in their list's order: its kind's, or where it hasn't the entry, every kind's.
  function optionsOf(at, edge) {
    const t = treeOf(at), all = Object.values(App.schema.peek()).filter(x => x.args?.length === 1 && Tree.same(x.args[0].edge, edge) && 'choice' in x.out);
    const fit = all.filter(x => t && Tree.narrower(t, x.args[0].loc));
    return App.notes.peek().optionsOf(fit.length ? fit : all.filter(x => !x.args[0].loc.args));
  }
  // The entries a mark's record has, or could have by its kind's: their labels, in the inspector's order.
  function entriesOf(m) {
    const s = st(), t = treeOf(m.record), N = App.notes.peek(), out = new Map();
    for (const e of Tree.index(s).entries.get(m.record) ?? []) out.set(Tree.norm(s[e].edge), s[e].edge);
    for (const x of Object.values(App.schema.peek())) if (t && x.args?.length === 1 && Tree.narrower(t, x.args[0].loc) && !N.check(Tree.bare(x))) out.set(Tree.norm(x.args[0].edge), x.args[0].edge);
    const order = e => Tree.same(e, 'Name') ? -1 : N.order({ args: [{ edge: e, loc: t }] }) ?? Infinity;
    return [...out.values()].sort((a, b) => order(a) - order(b) || a.localeCompare(b));
  }
  // What a mark's words can read, by name: its entries, then a relative's ("Owner's name"), each what `{` offers and what's read.
  const wordsOf = m => Scene.readable(st(), App.notes.peek(), App.schema.peek(), m.record).map(x => x.label);
  // Whether a mark shows an entry of a label at a record (its own, or one in it), as a field or a blank.
  const shows = (m, edge, at = m.record) =>(m.texts ?? []).some(it => it.blank ? it.blank.at === at && Tree.same(it.blank.edge, edge) : st()[it.id]?.at === at && Tree.same(st()[it.id].edge, edge));
  // The pen, for a mark: where it reaches that, the pen's place; else that mark alone, as what's dragged onto a box the pen doesn't reach is.
  const scoped = (m, s = scopeOfBox()) => !s.own && s.marks?.has(m.id) ? s : { own: true };
  // A row's field, from the panel: where it's the field picked, the field's own place; any other, the box's.
  const scopeOfField = edge => { const f = fieldNow(); return f?.it && Tree.same(fieldName(f.it), edge) ? scopeNow() : scopeOfBox(); };
  // Where a scope reaches, said: a mark by its name, several by their count, a group as the Key calls it.
  const whereSaid = (ms, s) => s.own ? (ms.length === 1 ? called(ms[0]) : counted(ms.map(m => ({ type: m.type, name: called(m) })))) : named(s);

  // Shows or hides an entry, by its label, in marks at a scope: in each, its record's entry of that label, or a blank
  // where it has none; showing one in an entry, the entries it's in too. The scope's own, the marks' records' each.
  function setField(ms, edge, on, s = scopeNow(canvas), at = null) {
    ms = ms.filter(m => m.type === 'box' || m.type === 'line');
    if (!ms.length || still()) return null;
    const view = viewOf(), s0 = st();
    return App.change(tx => {
      for (const m of ms) {
        const rec = treeOf(m.record), e = at && at !== m.record ? Tree.entryAt(s0, at, edge) : entryIn(m.record, edge);
        if (!rec || (!e && !specOfField(m.record, edge))) continue;
        const steps = e ? Tree.pathOf(s0, e).slice(Tree.pathOf(s0, m.record).length) : [];
        const trees = e ? (on ? steps : steps.slice(-1)).map(x => treeOf(x)) : [{ args: [{ edge, loc: rec }] }];
        for (const t of trees) for (const p of s.own ? [rec] : s.outputs) {
          const [pattern, param] = fieldAt(t, rec, scopeAt(p, t.args[0].edge), t.args[0].edge);
          tx.note('Shown', pattern, on, { view, ...(param && { param }) });
        }
      }
    }, { dated: false, say: () => {
      // A group's boxes that a narrower note, or a later group's, keeps as they were, said, as the format bar says a
      // box keeps its own.
      const now = App.scene.peek(), kept = s.marks ? [...s.marks].filter(id => { const m = now?.byId.get(id); return m && m.type === ms[0].type && shows(m, edge) !== on; }) : [];
      const m0 = kept.length && now.byId.get(kept[0]), by = m0 && groupOfNote(m0, m0.texts.find(it => Tree.same(fieldName(it), edge))?.shownBy, now);
      const why = !kept.length ? '' : by ? `; ${named(by)} still ${on ? 'hides' : 'shows'} it in ${kept.length === 1 ? called(m0) : `${kept.length} of them`}`
        : `; ${kept.length === 1 ? `${called(m0)} keeps its own` : `${kept.length} ${ms[0].type === 'line' ? 'lines' : 'boxes'} keep their own`}`;
      return `${on ? 'Showed' : 'Hid'} ${edge} ${on ? 'in' : 'from'} ${whereSaid(ms, s)}${why}`;
    } });
  }
  // A free text written in a mark at a scope, as it's typed in place (new, where `it` is none): its words, {Entry} and
  // all, its look kept. Left empty, it's taken away (see unText).
  function writeText(m, it, typed) {
    // (While a design is edited, words begun on its box are a part of it.)
    if (designing && !it) return Designs.addWords();
    const s = it ? scopeNow(canvas) : scopeOfBox(), view = viewOf(), rec = treeOf(m.record), N = App.notes.peek();
    const at = p => N.notes('Text').find(n => n.view === view && Tree.key(n.pattern) === Tree.key(p));
    // A new one goes under the mark's texts: in a box, across it; on a line, under its label, or at its middle.
    const raw = it?.free.text ?? '', drawn = m.texts.filter(x => x.lines?.length).map(x => fieldRect(m, x)), mid = m.points?.[Math.floor(m.points.length / 2)] ?? [m.x, m.y];
    const look = it?.look ?? { ...Scene.DEFAULTS.text, ...Object.fromEntries(Object.keys(Scene.DEFAULTS.text).map(k => [k, m.settings[k]?.value]).filter(([, v]) => v !== undefined)), Bold: false };
    const under = drawn.length ? Math.max(...drawn.map(r => r.y + r.h)) : m.type === 'box' ? m.y + m.h / 2 - 8 : mid[1];
    const rect = it ? fieldRect(m, it) : { x: m.type === 'box' ? m.x : drawn[0]?.x ?? mid[0], y: under, w: m.type === 'box' ? m.w : 120, h: px(look.Size) * 1.2 };
    const labels = wordsOf(m);
    openEditor({ look }, { ...rect, x: m.type === 'box' ? m.x : rect.x - 4, w: m.type === 'box' ? m.w : Math.max(rect.w + 8, 120) }, typed ?? raw, (text, keys, runs) => {
      if (!Tree.clean(text)) return it && unText(m);
      App.change(tx => { for (const p of s.own ? [rec] : s.outputs) { const { runs: _, ...was } = at(p)?.value ?? {}; tx.note('Text', p, { ...was, text: text.trim(), ...(runs?.length && { runs }) }, { view }); } },
        { dated: false, say: it ? null : `Added text to ${whereSaid([m], s)}` });
    }, { multiline: true, selectAll: typed === undefined && !!raw, ph: 'Text', complete: labels, tab: it ? d => stepField(d, true) : null, kept: true, rich: { runs: typed !== undefined ? [] : it?.free.runs ?? [] } });
  }
  // A relative's field on a box ("Owner's name"), shown or hidden at the pen: a line of its free text, reading it. So where a design has a part that names it, the part says it; where not, it stands with the box's other fields.
  const LINE = label => new RegExp(`^\\{${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}$`, 'i');
  const showsWord = (m, label) => { const s = m.texts?.find(x => x.free)?.free.text ?? '', named = m.design?.value.parts?.some(p => LINE(label).test(String(p.text ?? '').trim())); return !!named || s.split('\n').some(l => LINE(label).test(l.trim())); };
  function setWord(ms, label, on, s = scopeNow(canvas)) {
    ms = ms.filter(m => m.type === 'box' || m.type === 'line');
    if (!ms.length || still()) return null;
    const view = viewOf(), N = App.notes.peek(), said = `${on ? 'Showed' : 'Hid'} ${label} ${on ? 'in' : 'from'} ${whereSaid(ms, s)}`;
    return App.change(tx => {
      for (const p of s.own ? ms.map(m => treeOf(m.record)) : s.outputs) {
        const was = N.notes('Text').find(n => n.view === view && Tree.key(n.pattern) === Tree.key(p))?.value, lines = String(was?.text ?? '').split('\n').filter(l => l.trim() && !LINE(label).test(l.trim()));
        if (on) lines.push(`{${label}}`);
        tx.note('Text', p, lines.length ? { ...was, text: lines.join('\n') } : undefined, { view });
      }
      tx.says(said);
    }, { dated: false, say: said });
  }
  // A free text written from the panel, at the pen.
  function putText(m, text, s = scoped(m)) {
    const view = viewOf(), N = App.notes.peek();
    return App.change(tx => { for (const p of s.own ? [treeOf(m.record)] : s.outputs) { const was = N.notes('Text').find(n => n.view === view && Tree.key(n.pattern) === Tree.key(p))?.value; tx.note('Text', p, { ...was, text: text.trim() }, { view }); } }, { dated: false, say: `Added text to ${whereSaid([m], s)}` });
  }
  // ---- Footnotes (dendra.md, Footnotes) ----
  // A Footnote note at the pen, its param its name, so a box carries one of each; a free shape's are in its row. What the page places them in, a shape of its own with
  // the role footnotes, comes with the first on a page. What a footnote can read of: the entries of what the pen reaches.
  const wordsAt = (m, s = scoped(m)) => { const all = (s.own ? [m] : [...s.marks].map(id => scene.byId.get(id)).filter(Boolean)).flatMap(x => x.record ? wordsOf(x) : []); return [...new Set(all)]; };
  const footRowHere = () => App.shown.peek().rows(App.chart.peek()).find(r => 'shape' in r && r.view === viewOf() && r.role === 'footnotes');
  function addFoot(m, text, s, field) {
    const view = viewOf(), key = `fn${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`, row = footRowHere(), said = `Added a footnote to ${m ? (m.type === 'shape' ? `the ${SHAPE[m.geometry] ?? 'shape'}` : whereSaid([m], s)) : named(s)}`;
    return App.change(tx => {
      if (!row) tx.add('shape', { view, geometry: 'text', role: 'footnotes', name: 'Footnotes', text: '' });
      else if (row.hidden) tx.update(row.shape, { hidden: false });
      if (m?.type === 'shape') tx.update(m.id, { footnotes: [...rowOf(m.id)?.footnotes ?? [], { key, text }] });
      else for (const p of s.own ? [treeOf(m.record)] : s.outputs) tx.note('Footnote', p, { text, ...(field && { field }) }, { view, param: key });
      tx.says(said);
    }, { dated: false, say: () => { const o = footOver(); return o ? `${said}; ${o}` : said; }, go: () => footOver() ? ['Tidy, to make room', () => tidy()] : null });
  }
  // Where a chart placed leaves no room for them anywhere at its foot, that's said, as a Key over a box is.
  const footOver = () => Scene.says(App.scene.peek(), b => App.notes.peek().shortOf(App.state.peek(), b.record)).find(t => t.startsWith('The footnotes block overlaps'));
  // Begun (Ctrl+Alt+F, Insert, a right-click): typed in where its line will go; Enter makes it, and it goes where the pen is.
  function footnote(m = selected().length === 1 ? selected()[0] : null) {
    if (still()) return Shell.toast(App.whyNot());
    const ok = x => x?.type === 'box' || x?.type === 'line' || (x?.type === 'shape' && !x.role && !x.master && !['legend', 'group', 'line', 'picture', 'table'].includes(x.geometry));
    const s = m?.type === 'shape' ? { own: true } : m ? scoped(m) : scopeNow(canvas);
    // (A footnote is a page's, numbered on it: the master, which every page shares, has none of its own.)
    if (scene.view === Scene.MASTER) return Shell.toast('A footnote is a page’s: add it on a page');
    if (m ? !ok(m) : s.own) return Shell.toast('A footnote goes on a box, a line or a shape with words: select one first');
    const f = m && fieldNow()?.m.id === m.id && !fieldNow().it.free ? fieldName(fieldNow().it) : null, foot = scene.marks.find(x => x.role === 'footnotes'), ms = scene.page.margins, u = 1 / (scene.page.scale ?? 1);
    const look = foot?.texts[0]?.look ?? { ...Scene.DEFAULTS.text, Size: 8 * u, Align: 'left', Bold: false, Color: '#595959' }, lh = Scene.lineHeight(look);
    const rect = foot ? { x: foot.x, y: Math.min(foot.y + foot.h, scene.page.h - lh * 1.5), w: foot.w, h: lh * 1.4 } : { x: ms.left, y: scene.page.h - ms.bottom - lh * 1.4, w: scene.page.w - ms.left - ms.right, h: lh * 1.4 };
    openEditor({ look }, rect, '', text => { const t = text.trim(); if (t) addFoot(m, t, s, f); }, { ph: 'Footnote', complete: m?.record ? wordsAt(m, s) : [], kept: true });
  }
  // One of those the page lists: what it's made from rewritten, or taken away; an entry that reads differently for different boxes is several lines, each of them.
  function footWritten(f, change) {
    const view = viewOf();
    return tx => { const shapes = new Map(); for (const x of f.from) { if (x.shape) shapes.set(x.shape, x); else tx.note('Footnote', x.pattern, change(x.value), { view, param: x.key }); }
      for (const [id, x] of shapes) { const all = rowOf(id)?.footnotes ?? [], v = change(x.value); tx.update(id, { footnotes: v ? all.map(y => y.key === x.key ? { ...y, ...v } : y) : all.filter(y => y.key !== x.key) }); } };
  }
  const footDelete = f => App.change(tx => { footWritten(f, () => undefined)(tx); tx.says(`Deleted footnote ${f.n}`); }, { dated: false, say: `Deleted footnote ${f.n}` });
  const footsDelete = m => App.change(tx => { for (const f of m.feet ?? []) footWritten(f, () => undefined)(tx); tx.remove(m.id); tx.says('Deleted the footnotes of this page'); }, { dated: false, say: 'Deleted the footnotes of this page' });
  // A number under a point on the footnotes shape, by the line there and the first of its paragraph; and its first line's rect.
  function footAt(m, cx, cy) {
    const p = graph.clientToLocal(cx, cy), it = m.texts[0], lh = Scene.lineHeight(it.look), ls = it.lines ?? [], near = ls.findIndex(l => p.y - m.y < l.y + lh * 0.3 && p.y - m.y >= l.y - lh * 0.9 && ((m.look?.Columns?.n ?? 1) < 2 || (p.x - m.x >= l.x - 2 && p.x - m.x <= l.x + m.w / m.look.Columns.n)));
    for (let i = near < 0 ? ls.length - 1 : near; i >= 0; i--) if (ls[i].spans?.[0]?.base) return m.feet?.find(f => f.n === +ls[i].spans[0].text) ?? null;
    return null;
  }
  function footRect(m, f) {
    const it = m.texts[0], lh = Scene.lineHeight(it.look), i = it.lines.findIndex(l => l.spans?.[0]?.base && +l.spans[0].text === f.n), l = it.lines[i];
    return { x: m.x + l.x, y: m.y + l.y - Scene.baseline(it.look), w: Math.max(l.w, 60), h: lh };
  }
  function editFoot(m, f) {
    if (still()) return Shell.toast(App.whyNot());
    picked_foot = null;
    const raw = String(f.from[0].value?.text ?? f.text), box = f.from[0].shape ? null : scene.marks.find(x => x.feet?.some(y => y.n === f.n && y.key === f.from[0].key));
    openEditor({ look: m.texts[0].look }, { ...footRect(m, f), w: m.w }, raw, text => { const t = text.trim(); if (!t) return footDelete(f); if (t !== raw) App.change(tx => { footWritten(f, v => ({ ...v, text: t }))(tx); tx.says(`Reworded footnote ${f.n}`); }, { dated: false, say: `Reworded footnote ${f.n}` }); }, { ph: 'Footnote', complete: box?.record ? wordsOf(box) : [], kept: true });
  }
  // A marker selected in a box selected, by a click on it: Delete takes its footnotes away. → the marker under a point, of its marks' first lines.
  let picked_foot = null;
  function markerUnder(m, cx, cy) {
    if (!m?.feet?.length || m.type === 'shape') return null;
    const p = graph.clientToLocal(cx, cy), o = m.type === 'line' ? m.labelAt ?? { x: 0, y: 0 } : m;
    for (const it of m.texts ?? []) { const l = it.lines?.[0]; if (!l?.footW) continue; const x0 = o.x + l.x - (it.look.Align === 'center' ? l.w / 2 : it.look.Align === 'right' ? l.w : 0) + l.w - l.footW, y0 = o.y + l.y - Scene.baseline(it.look);
      if (p.x >= x0 - 2 && p.x <= x0 + l.footW + 2 && p.y >= y0 - 2 && p.y <= y0 + Scene.lineHeight(it.look) + 2) return { box: m.id, rect: { x: x0, y: y0, w: l.footW, h: Scene.lineHeight(it.look) * 0.7 }, ns: l.spans.at(-1).text.split(',').map(Number) }; }
    return null;
  }
  // A free text taken away at the scope: the scope's own note goes; and where the mark's own is taken away but a group's
  // would still give it text, it keeps an empty one, the narrowest, which gives none.
  function unText(m, s = scopeNow(canvas)) {
    const view = viewOf(), rec = treeOf(m.record), N = App.notes.peek(), s0 = st();
    const ids = [...Tree.dependents(s0, [m.record])].filter(id => id === m.record || s0[id]?.at);
    return App.change(tx => {
      // (And what gives this mark its text, where that's elsewhere, so it goes as it's asked to.)
      if (!s.own) { const n = N.notes('Text').find(x => x.note === m.texts?.find(y => y.free)?.free.note); s.outputs.forEach(p => tx.note('Text', p, undefined, { view })); if (n && !s.outputs.some(p => Tree.key(p) === Tree.key(n.pattern))) tx.note('Text', n.pattern, undefined, { view }); return; }
      const others = N.notes('Text').some(n => n.view === view && Tree.key(n.pattern) !== Tree.key(rec) && ids.some(id => Tree.fits(s0, id, n.pattern)));
      tx.note('Text', rec, others ? { text: '' } : undefined, { view });
    }, { dated: false, say: `Removed the text from ${whereSaid([m], s)}` });
  }
  // What Delete takes: a footnote's line or marker selected; the footnotes, with their shape; a field; or else what's selected.
  function deleting() {
    const fm = scene.marks.find(x => x.role === 'footnotes'), one = selected().length === 1 ? selected()[0] : null;
    if (picked_foot?.f) { const f = picked_foot.f; picked_foot = null; return footDelete(f); }
    if (picked_foot?.ns && fm?.feet) { const fs = fm.feet.filter(f => picked_foot.ns.includes(f.n)); picked_foot = null; return App.change(tx => { fs.forEach(f => footWritten(f, () => undefined)(tx)); tx.says(`Deleted footnote ${fs.map(f => f.n).join(', ')}`); }, { dated: false, say: `Deleted footnote ${fs.map(f => f.n).join(', ')}` }); }
    if (one?.role === 'footnotes') return footsDelete(one);
    return fieldNow() ? clearField() : remove(true);
  }
  // A field dragged off its box, to the panel or into empty room, is taken away at the pen, what it reaches lit as it goes. On a box selected, the first drag from a field's words takes the field,
  // the pointer saying so (a hand, and its name), as its name stands for the box, which a press on it moves, as a press anywhere else in it does.
  const grabbable = (f, u = f) => !!u?.it && !u.it.of && u.it.lines?.length && (u.it.id === f?.it?.id || (!u.it.name && u.m.type === 'box' && sel.isSelected(graph.getCellById(u.m.id) ?? {}) && sel.getSelectedCells().length === 1));
  gEl.addEventListener('mousedown', e => {
    if (e.button !== 0 || e.shiftKey || e.ctrlKey || e.metaKey || still() || designing) return;
    const u = fieldUnder(e.clientX, e.clientY), now = fieldNow(), f = u?.it && u.it.id === now?.it.id && u.m.id === now.m.id ? now : u?.m.type === 'box' && grabbable(null, u) ? u : null;
    if (!f || f.m.type !== 'box') return;
    e.stopPropagation();
    root.focus({ preventScroll: true });
    const x0 = e.clientX, y0 = e.clientY, s = scoped(f.m, f === now ? scopeNow() : scopeOfBox()), off = ev => { const p = graph.clientToLocal(ev.clientX, ev.clientY); return p.x < f.m.x || p.x > f.m.x + f.m.w || p.y < f.m.y || p.y > f.m.y + f.m.h; };
    let ghost = null, gone = false;
    const move = ev => {
      if (!ghost && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) return;
      ghost ??= document.body.appendChild(Object.assign(document.createElement('div'), { className: 'drag-field', textContent: fieldName(f.it) }));
      Object.assign(ghost.style, { left: `${ev.clientX + 12}px`, top: `${ev.clientY + 10}px` });
      const now = off(ev);
      if (now !== gone) { gone = now; ghost.classList.toggle('going', now); ghost.textContent = now ? `Hide ${fieldName(f.it)}` : fieldName(f.it); cue(now ? (s.own ? [f.m.id] : [...s.marks]) : null); }
    };
    const up = ev => {
      removeEventListener('pointermove', move, true); removeEventListener('pointerup', up, true); removeEventListener('mouseup', up, true);
      ghost?.remove();
      cue(null);
      if (ghost && off(ev)) hideField(f, s);
      // (No drag: the click it was, on a field of the box selected, selects the field.)
      else if (!ghost) pickField(f);
    };
    addEventListener('pointermove', move, true);
    addEventListener('pointerup', up, true);
    addEventListener('mouseup', up, true);
  }, true);
  // A field hidden: its entry, or a blank, at the scope; a free text taken away.
  function hideField(f = fieldNow(), s) {
    if (!f) return;
    field = null;
    if (f.it.of || (f.it.part && st()[f.it.id]?.edge === undefined)) return hidePart(f, s);
    if (f.it.free) return unText(f.m, s);
    setField([f.m], fieldName(f.it), false, s);
  }
  // A field cleared, as Delete clears a cell in a table: the value entered there goes, from the day shown, one change
  // that Undo takes back, and one a formula works out shows its own again; a free text, its words. The field stays,
  // a blank where it's shown at a scope; hiding it is the eye's, or its menu's. Only what's entered clears.
  const clears = f => !!f?.it && (!!f.it.free || (!f.it.blank && f.it.id in App.entered.peek()));
  // A part taken away at the pen, the design standing: Reset to design brings it back.
  // (What's said of a part is said in words, History having none for it.)
  const saidOfPart = (said, f) => App.change(tx => { f(tx); tx.says(said); }, { dated: false, say: said });
  const hidePart = (f, s = scopeNow(canvas)) => { field = null; return saidOfPart(`Took a part of the design away from ${whereSaid([f.m], s)}`, tx => Designs.say(tx, f.m, partOf(f.m, f.it).part, { hidden: true }, s)); };
  function clearField(f = fieldNow()) {
    if (!f?.it) return;
    if (still()) return Shell.toast(App.whyNot());
    if (f.it.of || (f.it.part && st()[f.it.id]?.edge === undefined)) return hidePart(f);
    if (!clears(f)) return f.it.blank ? undefined : Shell.toast('A formula works this out');
    if (f.it.free) return unText(f.m);
    App.change(tx => tx.remove(f.it.id), { say: c => Time.describe(c) });
  }
  // Every mark of the group that's lit, a Styles row aimed at or the scope's group chosen, for what's lit is what's meant; or else of
  // the narrowest group the selection's first box or line is in, as the Key and Styles group them.
  function selectLike() {
    const lit = FormatBar.lit?.();
    if (lit?.marks?.size) return void Shell.select([...lit.marks]);
    const m = selected().find(x => x.type === 'box' || x.type === 'line');
    if (!m) return false;
    const gs = groupsAt(scene, m), g = gs.find(x => x.marks.size > 1) ?? gs[0];
    if (g) Shell.select([...g.marks]);
  }

  // ---- Adding a box: a record of a kind, named as it's typed ----
  // Nothing is made until a name is, and Esc makes nothing. Its kind is chosen beside its name, the one asked for first,
  // then the one last made (see kindChooser). The box is dropped where it was asked for, clear of what's there, and
  // loosely: once a line relates it, it goes beside its relatives (Scene). What's made on a chart, the chart shows: where
  // the view would hide it, the same change shows it there (App.showMade).
  // `guide`, the line a handle was dragged out on, stays drawn to it while it's named, so it's plain the two will be related.
  function create(kind, at, { relate, guide, typed = '' } = {}) {
    if (still() || !scene || !kind) return guide?.remove();
    if (!at) { const r = root.getBoundingClientRect(); at = graph.clientToLocal(r.left + r.width / 2, r.top + r.height / 2); }
    // (Its placeholder is the size it will be: a box of its kind's on this chart, the middle one, or else what a short name makes.)
    const alike = scene.marks.filter(m => m.type === 'box' && m.shape !== 'triangle' && App.state.peek()[m.record]?.kind === kind).sort((a, b) => a.w - b.w), mid = alike[alike.length >> 1];
    const w = mid?.w ?? 138, h = mid?.h ?? 44, p = freeSpot(scene, w, h, at, { last: true }), view = viewOf(), [x, y] = own(p.x, p.y), last = Shell.store.get('kind');
    const ks = kinds(), choice = [...new Set([kind, ...ks.filter(k => k === last), ...ks])];
    let now = kind;
    guide?.setAttribute('d', guide.getAttribute('d').replace(/L[^L]*$/, `L${p.x + w / 2},${p.y + h / 2}`));
    openEditor({ look: { ...Scene.DEFAULTS.text, Bold: true } }, { x: p.x, y: p.y, w, h }, typed, name => {
      guide?.remove();
      name = Tree.clean(name);
      if (!name) return;
      let id = null;
      // (It goes from the placeholder to the box it makes.)
      const g = graph.localToGraph(p.x, p.y), z = graph.zoom();
      arrival = { x: g.x, y: g.y, w: w * z, h: h * z };
      if (!App.change(tx => {
        id = tx.add('record', { kind: now });
        tx.add('record', { at: id, edge: 'Name', field: 'text', value: name });
        tx.note('Position', { id, kind: now }, { x, y, loose: true }, { view });
        App.showMade(tx, [id], view);
      })) return;
      Shell.store.set('kind', now);
      if (relate) Shell.emit('relate-open', Object.assign([relate, id], { made: true })); else Shell.select([id]);
    }, { box: { kinds: choice, kind, pick: k => { now = k; } }, escaped: () => guide?.remove() });
  }
  const addAt = e => { if (!still()) create(lastKind(), graph.clientToLocal(e.clientX, e.clientY)); };

  // ---- Relating: from near a box's edge to another box, or to empty page for a new one ----
  // The handles show on the box whose outline the pointer nears, on the outline, as PowerPoint's connection
  // points are: at the middle of each side (a triangle's apex, slopes and base), or off it along the side as far
  // as keeps them clear of the lines there, of the box's grips and of each other, so a click by a box on a line
  // takes the line. A side with no such place has none. On a box selected, whose grips hold those middles and which is
  // the box a person has just made, they stand a little off the outline, as FigJam's do, so a drag from a side's middle
  // resizes and one from the dot beyond it relates, each where it's seen; a triangle's stay, as its sides have no grips.
  let near = null, placed = null, pointerAt = null;
  const handles = ['n', 'e', 's', 'w'].map(side => {
    const h = document.createElement('div');
    h.className = `dc-handle ${side}`;
    h.addEventListener('pointerdown', e => { if (near && h.at && e.button === 0) { e.preventDefault(); e.stopPropagation(); relating(near, h.from, e); } });
    over.appendChild(h);
    return h;
  });
  // A point t of the way along a side of a box's outline: a triangle's slopes and base, and its top, the apex
  // with the top of each slope (APEX of the way down it) either side; an oval's quarters; or else its frame's
  // sides.
  const APEX = 0.35;
  function sidePoint(m, side, t) {
    const { x, y, w, h } = m, along = (a, b, u = t) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
    if (m.shape === 'oval') { const a = ({ n: -1, e: 0, s: 1, w: 2 }[side] + t - 0.5) * Math.PI / 2; return [x + w / 2 * (1 + Math.cos(a)), y + h / 2 * (1 + Math.sin(a))]; }
    if (m.shape === 'triangle') {
      const apex = [x + w / 2, y], right = [x + w, y + h], left = [x, y + h];
      return side === 'n' ? along(apex, t < 0.5 ? left : right, Math.abs(t - 0.5) * 2 * APEX) : along(...{ e: [apex, right], s: [right, left], w: [left, apex] }[side]);
    }
    return along(...{ n: [[x, y], [x + w, y]], e: [[x + w, y], [x + w, y + h]], s: [[x + w, y + h], [x, y + h]], w: [[x, y + h], [x, y]] }[side]);
  }
  // A box's outline as a polygon, to say how near a point is to it.
  const outlineOf = m => m.shape === 'triangle' || m.shape === 'oval' ? [...['e', 's', 'w'], ...(m.shape === 'oval' ? ['n'] : [])].flatMap(s => [0, 0.25, 0.5, 0.75].map(t => sidePoint(m, s, t)))
    : [[m.x, m.y], [m.x + m.w, m.y], [m.x + m.w, m.y + m.h], [m.x, m.y + m.h]];
  const toSegment = ([x, y], [ax, ay], [bx, by]) => {
    const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy, t = l ? clamp(((x - ax) * dx + (y - ay) * dy) / l, 0, 1) : 0;
    return Math.hypot(x - ax - t * dx, y - ay - t * dy);
  };
  // How far off the middle a handle may go, and how clear it keeps, in screen pixels: its reach and a line's.
  const ALONG = [0.5, 0.38, 0.62, 0.26, 0.74, 0.14, 0.86], CLEAR = 16, STANDOFF = 18, OUTWARD = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
  function showHandles(m = near) {
    near = m && !pointing && !still() && !dragging ? m : null;
    if (!near) { root.classList.remove('relating-on'); placed = null; return; }
    const z = graph.zoom(), cell = graph.getCellById(m.id), gripped = transform.widgets.has(cell), t = graph.translate();
    const now = [m, scene, z, t.tx, t.ty, gripped];
    if (placed && same(placed, now)) return root.classList.add('relating-on');
    placed = now;
    // What's near the box: the lines' legs, and its grips, at its corners and the middles of its sides long
    // enough to have one (see grips).
    const r = CLEAR / z, segs = [];
    for (const k of scene.marks) if (k.points) k.points.slice(1).forEach((p, i) => {
      const q = k.points[i];
      if (Math.max(p[0], q[0]) >= m.x - r && Math.min(p[0], q[0]) <= m.x + m.w + r && Math.max(p[1], q[1]) >= m.y - r && Math.min(p[1], q[1]) <= m.y + m.h + r) segs.push([q, p]);
    });
    // (A triangle's, selected or not, so its handles stand where they stand either way: its base and corners alone.)
    const tri = m.shape === 'triangle';
    const dots = tri ? [[m.x, m.y + m.h], [m.x + m.w, m.y + m.h], ...m.w * z >= 40 ? [[m.x + m.w / 2, m.y + m.h]] : []]
      : !gripped ? [] : [0, 0.5, 1].flatMap(fx => [0, 0.5, 1].filter(fy => (fx !== 0.5 || fy !== 0.5) && (fx !== 0.5 || m.w * z >= 40) && (fy !== 0.5 || m.h * z >= 40))
      .map(fy => [m.x + m.w * fx, m.y + m.h * fy]));
    // (And a free shape's selected beside it, whose grips are its own to drag.)
    for (const [c] of transform.widgets) if (c !== cell && c.getData()?.kind === 'shape') { const q = c.getPosition(), s = c.getSize(); for (const fx of [0, 0.5, 1]) for (const fy of [0, 0.5, 1]) if (fx !== 0.5 || fy !== 0.5) dots.push([q.x + s.width * fx, q.y + s.height * fy]); }
    // (Nor on a line's label, what it would cover being what's read.)
    const nearLabels = scene.marks.filter(k => k.type === 'line' && k.labelAt && k.label && k.labelAt.x < m.x + m.w + r && k.labelAt.x + k.label.w > m.x - r && k.labelAt.y < m.y + m.h + r && k.labelAt.y + k.label.h > m.y - r);
    const offLabels = p => { const g = 8 / z; return nearLabels.every(k => p[0] < k.labelAt.x - g || p[0] > k.labelAt.x + k.label.w + g || p[1] < k.labelAt.y - g || p[1] > k.labelAt.y + k.label.h + g); };
    const clear = p => offLabels(p) && segs.every(([a, b]) => toSegment(p, a, b) * z >= CLEAR) && dots.every(d => Math.hypot(p[0] - d[0], p[1] - d[1]) * z >= CLEAR);
    const off = gripped && !tri ? STANDOFF / z : 0, onNoBox = p => !scene.marks.some(k => k.type === 'box' && k.id !== m.id && p[0] > k.x && p[0] < k.x + k.w && p[1] > k.y && p[1] < k.y + k.h);
    for (const h of handles) {
      const side = h.classList[1], [nx, ny] = OUTWARD[side], beyond = q => [q[0] + nx * off, q[1] + ny * off], along = ALONG.map(f => sidePoint(m, side, f)).filter(Boolean);
      const edge = off ? along.find(q => clear(beyond(q)) && onNoBox(beyond(q))) : null, p = edge ? beyond(edge) : along.find(clear);
      h.at = p ?? null;
      h.from = edge ?? p ?? null;
      h.hidden = !p;
      // (On a free shape, only the dot itself begins a line: grabbed anywhere else near its edge, it moves.)
      h.classList.toggle('slim', m.type === 'shape');
      if (p) { const g = graph.localToGraph(p[0], p[1]); h.style.left = `${g.x}px`; h.style.top = `${g.y}px`; dots.push(p); }
    }
    root.classList.add('relating-on');
  }
  // The box whose outline a point is within 12 px of, on screen, the nearest; or a box selected, as far as its handles stand off it.
  function nearEdge(p) {
    const z = graph.zoom();
    let best = null, bd = Infinity;
    for (const m of scene.marks) {
      if (m.type !== 'box') continue;
      const gripped = transform.widgets.has(graph.getCellById(m.id)), reach = gripped ? STANDOFF + 12 : 12, r = reach / z;
      if (p.x < m.x - r || p.x > m.x + m.w + r || p.y < m.y - r || p.y > m.y + m.h + r) continue;
      const o = outlineOf(m), d = Math.min(...o.map((a, i) => toSegment([p.x, p.y], a, o[(i + 1) % o.length]))) * z;
      // (Inside a box selected, only right at its edge: further in, the pointer's on what's in it.)
      if (gripped && d > 8 && p.x > m.x && p.x < m.x + m.w && p.y > m.y && p.y < m.y + m.h) continue;
      if (d <= reach && d < bd) { best = m; bd = d; }
    }
    edgeOff = bd;
    return best;
  }
  let edgeOff = Infinity;
  // Pointing at a box shows its handles, as Lucidchart's do; at a field of the box selected, that it's one (see Fields). One thing at a time: near its edge, what takes hold of its edge; on its words, the words.
  root.addEventListener('pointermove', e => {
    pointerAt = { x: e.clientX, y: e.clientY };
    if (scene) { gripsNear(e); dotsNear(e); }
    if (!scene || e.target.closest?.('.dc-handle, .dc-edit, .dc-complete')) return;
    // A free shape is no box: on one, or on its grips, there's nothing to relate, whatever box is under or beside it; but one not selected has dots too, for a line
    // drawn from it, which only glues (see relating).
    const onCell = graph.getCellById(e.target.closest?.('[data-cell-id]')?.getAttribute('data-cell-id') ?? '');
    if (e.target.closest?.('.x6-widget-transform')) { showHandles([...transform.widgets.keys()].map(c => scene.byId.get(c.id)).find(x => x?.type === 'box' && x.shape !== 'triangle') ?? null); return hover(null); }
    if (onCell?.getData()?.kind === 'shape') { const fs = scene.byId.get(onCell.id); showHandles(hand?.gluable(fs) && !sel.isSelected(onCell) && !e.buttons ? fs : null); return hover(null); }
    const f = e.buttons || pointing || root.classList.contains('relating') ? null : fieldUnder(e.clientX, e.clientY), mine = f?.m.type === 'box' && transform.widgets.has(graph.getCellById(f.m.id));
    const edge = e.buttons ? null : nearEdge(graph.clientToLocal(e.clientX, e.clientY)), words = mine && f.it && !(edge?.id === f.m.id && edgeOff <= 4);
    if (words) gripsNear(e, true);
    showHandles(e.buttons || words ? null : edge ?? (f?.m.type === 'box' && !mine ? f.m : null));
    hover(mine && f.it && !words ? null : f);
  });
  root.addEventListener('pointerleave', e => { root.classList.remove('near-grips'); if (!e.relatedTarget?.closest?.('.dc-handle')) { showHandles(null); hover(null); } });
  // The dot the pointer is coming to stands up as it nears: the rest stay small, so a box pointed at isn't buried.
  function dotsNear(e) {
    const b = root.getBoundingClientRect();
    for (const h of handles) if (h.at) { const g = graph.localToGraph(h.at[0], h.at[1]); h.classList.toggle('close', Math.hypot(e.clientX - b.left - g.x, e.clientY - b.top - g.y) < 20); }
  }
  // What a press lands on: no name said of it, no frame round its words and no grips or dots, till the pointer has moved on.
  root.addEventListener('pointerdown', e => {
    tipFor(null); tipQuiet = { x: e.clientX, y: e.clientY };
    if (e.target.closest?.('.dc-handle, .x6-widget-transform, .dc-edit')) return;
    root.classList.remove('near-grips'); showHandles(null); hover(null);
  }, true);
  for (const name of ['scale', 'translate']) graph.on(name, () => { if (!quiet) { framed = false; left = wanted = null; onScreen(); } showHandles(null); grips(); if (name === 'scale') bendGrips(); if (aids.peek().rulers) paintAids(); zoomRead(); snapSoon(); });

  // A connector: a line glued to what it joins, a free shape's row with no record and no meaning attached, in the deck a real connector. From one to another, or from one to a point. Selected, as what was just made.
  function connect(a, b, q = null, given = {}) {
    let id = null;
    if (still()) return Shell.toast(App.whyNot());
    const pts = [Scene.edgePoint(a, b ? [b.x + b.w / 2, b.y + b.h / 2] : q), b ? Scene.edgePoint(b, [a.x + a.w / 2, a.y + a.h / 2]) : q].map(([u, v]) => [round(u), round(v)]), look = { ...hand.newLook('line'), ...given };
    if (App.change(tx => { id = tx.add('shape', { view: viewOf(), geometry: 'line', x: pts[0][0], y: pts[0][1], points: pts, ends: [a.id, b?.id ?? null], ...(Object.keys(look).length && { format: look }) }); }, { dated: false, say: `Drew a line from ${called(a)}${b ? ` to ${called(b)}` : ''}` })) Shell.select([id]);
  }
  // A relation being drawn from a box: from one of its handles while the button is held (`down`, its press),
  // or from the middle of the box, for Relate…, until the next click. On another box, the two's relations are
  // asked for; on empty page, a new box of a kind, or a line. A handle clicked, not dragged, is a click on its box.
  // (`only`: With…, asking what's between it and another box, which makes nothing: so Viewing asks it too.)
  function relating(from, start = [from.x + from.w / 2, from.y + from.h / 2], down = null, only = false) {
    const line = document.createElementNS(NS, 'path'), click = !down;
    line.setAttribute('class', 'dc-relating');
    marks.appendChild(line);
    let target = null, unlayer = null, stopSel = null;
    root.classList.add('relating');
    const at = ev => graph.clientToLocal(ev.clientX, ev.clientY);
    // (Any mark a line can be glued to: a line to a box is asked about, a line to a free shape, or from one, only glues.)
    const boxAt = p => hand.markAt(p, [from.id]);
    // Begun from a menu, nothing else says what comes next: it's said beside the box, and then beside the pointer, where the eye is; begun by
    // the keys, in their words.
    const others = scene.marks.some(m => m.type === 'box' && m.id !== from.id);
    const next = click ? over.appendChild(Object.assign(document.createElement('div'), { className: 'dc-tip dc-next', textContent: Shell.keyed() ? (others ? (only ? 'Now Tab to the other box and press Enter' : 'Now Tab to the other box and press Enter, or type a new name') : 'Now type its name') : others ? 'Now click the other box' : 'Now click where the other box goes' })) : null;
    const beside = m => { const g = graph.localToGraph(m.x + m.w, m.y + m.h / 2); Object.assign(next.style, { left: `${g.x + 8}px`, top: `${g.y - 12}px` }); };
    if (next) beside(from);
    const lit = () => paintStates(new Map([[from.id, ['accent', 1]], ...(target ? [[target.id, ['accent', 1]]] : [])]));
    const move = ev => {
      const p = at(ev);
      target = boxAt(p);
      line.setAttribute('d', `M${start[0]},${start[1]} L${p.x},${p.y}`);
      if (next) { const r = root.getBoundingClientRect(); Object.assign(next.style, { left: `${ev.clientX - r.left + 14}px`, top: `${ev.clientY - r.top + 14}px` }); }
      lit();
    };
    const end = () => {
      removeEventListener('pointermove', move); removeEventListener(click ? 'mousedown' : 'pointerup', up, true); removeEventListener('keydown', esc, true);
      unlayer?.(); stopSel?.(); relateNow = null; line.remove(); next?.remove(); root.classList.remove('relating'); paintStates();
    };
    // By the keys: Tab or Ctrl+Alt+arrow walks to the other box, drawn to as a pointer would, and Enter or Space takes it; a name typed makes a
    // new box and asks the same of the two, as a drop in empty room does; Esc makes nothing, and the box it began from is selected again.
    if (click) {
      stopSel = Shell.on('select', keys => {
        const m = keys.length === 1 ? scene.byId.get(keyParts(keys[0])[0]) : null;
        target = m?.type === 'box' && m.id !== from.id ? m : null;
        line.setAttribute('d', target ? `M${start[0]},${start[1]} L${target.x + target.w / 2},${target.y + target.h / 2}` : '');
        if (next) beside(target ?? from);
        lit();
      });
      relateNow = {
        take: () => { const m = target; if (!m) return; end(); Shell.emit('relate-open', [from.id, m.id]); },
        name: typed => { if (only) return; end(); Shell.select([from.id]); const g = graph.localToGraph(from.x + from.w / 2, from.y + from.h + 72), r = root.getBoundingClientRect(); const guide = marks.appendChild(line.cloneNode()); guide.setAttribute('d', `M${start[0]},${start[1]} L${start[0]},${start[1]}`); create(lastKind(), graph.clientToLocal(r.left + g.x, r.top + g.y), { relate: from.id, guide, typed }); },
      };
    }
    // Dropped on another box, the two's relations are asked for, in the two-box panel, a relation ticked there pending
    // through the bar; dropped in empty room, a new box goes there, of the kind last made, named as it's typed, as
    // Lucidchart's does, and then the two's relations are asked for; Esc, or dropping where it began, makes nothing.
    const up = ev => {
      if (click) { ev.preventDefault(); ev.stopPropagation(); }
      end();
      if (down && Math.hypot(ev.clientX - down.clientX, ev.clientY - down.clientY) < 4) return take(graph.getCellById(from.id));
      const p = at(ev);
      target = boxAt(p);
      // A line with no relation in mind: to or from a free shape, there's none it could be, so it's glued; into empty room from one, it ends there. (Asking what's between two boxes makes nothing, so it glues nothing.)
      if (target && (target.type !== 'box' || from.type !== 'box')) { if (!only) connect(from, target); }
      else if (target) Shell.emit('relate-open', [from.id, target.id]);
      else if (only || !ev.target.closest?.('.dc') || ev.target.closest?.('.dc-edit') || ev.button !== 0) return;
      else if (Math.hypot(p.x - start[0], p.y - start[1]) > 12 / graph.zoom()) {
        if (from.type !== 'box') return connect(from, null, [p.x, p.y]);
        const guide = marks.appendChild(line.cloneNode()); create(lastKind(), p, { relate: from.id, guide });
      }
    };
    const esc = ev => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); end(); } };
    addEventListener('pointermove', move);
    addEventListener(click ? 'mousedown' : 'pointerup', up, true);
    if (click) unlayer = Shell.layer(() => { end(); Shell.select([from.id]); root.focus({ preventScroll: true }); }); else addEventListener('keydown', esc, true);
  }
  let relateNow = null;

  // ---- Right-click: what applies to what's under the pointer ----
  root.addEventListener('contextmenu', e => {
    e.preventDefault();
    if (!e.keyed) return;
    // Shift+F10 or the context-menu key: what's selected, as a right-click on it, its menu under it; or the page's, at the middle of the screen.
    const ms = selected(), r = root.getBoundingClientRect(), m = ms[0], b = m && !m.points && graph.localToClient(m.x + m.w / 2, m.y + m.h);
    const at = b ? { x: b.x, y: b.y + 4 } : { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    Shell.menu(at, ms.length ? markItems() : pageItems(graph.clientToLocal(at.x, at.y)));
  });
  const contextOf = ({ e, node, edge }) => {
    let cell = node ?? edge ?? null;
    if (cell?.getData()?.kind === 'label') cell = graph.getCellById(cell.getData().mark);
    const at = { x: e.clientX, y: e.clientY }, k = cell?.getData()?.kind, p = graph.clientToLocal(at.x, at.y);
    if (!cell || k === 'page' || k === 'ink') { pageAt = at; return Shell.menu(at, pageItems(p)); }
    // The mark's menu, and with it selected alone, under it a field's it was on, as a click selects one; with several
    // selected, theirs, wherever on one of them it lands.
    // A mark of the group that's lit: the group's, as what's lit is what's meant, its menu for all of them.
    const lit = FormatBar.lit?.();
    if (lit?.marks?.size > 1 && lit.marks.has(cell.id) && !sel.isSelected(cell)) { Shell.select([...lit.marks]); return setTimeout(() => Shell.menu(at, markItems())); }
    const multi = sel.isSelected(cell) && sel.getSelectedCells().length > 1, f = (k === 'box' || k === 'line') && sel.isSelected(cell) && !multi ? fieldUnder(at.x, at.y) : null;
    if (f?.it && f.m.id === cell.id) { pickField(f); return Shell.menu(at, markItems(f)); }
    pickField(null);
    // A line is taken as a click takes it, with the lines drawn along it there.
    if (edge && k === 'line' && !sel.isSelected(cell)) { pressed = { id: cell.id, p: [p.x, p.y], was: [], more: false }; sel.reset(cell); } else take(cell);
    Shell.menu(at, markItems());
  };
  for (const name of ['node:contextmenu', 'edge:contextmenu', 'blank:contextmenu']) graph.on(name, contextOf);
  const ORDER = () => [{ label: 'Bring to front', keys: '$mod+Shift+]', run: () => order('front') }, { label: 'Bring forward', keys: '$mod+]', run: () => order('forward') },
    { label: 'Send backward', keys: '$mod+[', run: () => order('backward') }, { label: 'Send to back', keys: '$mod+Shift+[', run: () => order('back') }];
  // What applies to what's selected, and with `f`, the field it was opened on, that field's, one row of its own under Edit text.
  function markItems(f = null) {
    const ms = selected(), one = ms.length === 1 ? ms[0] : null, bound = ms.filter(m => m.type === 'box' || m.type === 'line'), ro = still();
    // The footnotes: their columns, whether the page places them, their look; hidden in this view, or gone.
    if (one?.role === 'footnotes') { const row = rowOf(one.id) ?? {}; return [{ label: 'Columns', disabled: ro, items: [1, 2, 3].map(n => ({ label: String(n), checked: (row.format?.Columns?.n ?? 1) === n, run: () => App.change(tx => tx.update(one.id, { format: { ...row.format, Columns: n > 1 ? { n, gap: row.format?.Columns?.gap ?? 7.2 } : null } }), { dated: false, say: `Set the footnotes in ${n === 1 ? 'one column' : `${n} columns`}` }) })) },
      { label: 'Where the page places them', disabled: ro || row.x == null, run: () => App.change(tx => tx.update(one.id, { x: null, y: null, w: null }), { dated: false, say: 'Let the page place the footnotes' }) }, ...formatItems(ms, ro), '-', { label: 'Hide in this view', disabled: ro, run: () => App.change(tx => tx.update(one.id, { hidden: true }), { dated: false, say: 'Hid the footnotes in this view' }) }, '-', { label: 'Delete all footnotes', keys: 'Delete', danger: true, disabled: ro, run: () => footsDelete(one) }]; }
    // The footer: its words, its font and its page's setup; the page places it.
    if (ms.length && ms.every(footOf)) return [...(one?.role === 'footer' ? [{ label: 'Edit text', keys: 'Enter', disabled: ro, run: () => edit(one.id) }] : []), ...formatItems(ms, ro), '-', { label: 'Page setup…', disabled: ro, run: () => Export.setup() }, '-', { label: 'Delete', keys: 'Delete', danger: true, disabled: ro, run: () => remove(true) }];
    // The Key: in a corner by name, or where the page places it.
    const inCorner = one?.geometry === 'legend' && !keyRow() && !ro ? [{ label: 'Put in a corner', items: [['Top left', 'top', 'left'], ['Top right', 'top', 'right'], ['Bottom left', 'bottom', 'left'], ['Bottom right', 'bottom', 'right']].map(([label, v, h]) => {
      const now = rowOf(one.id)?.corner; return { label, checked: now?.v === v && now?.h === h && (now.dx ?? scene.page.margin * scene.page.scale) === scene.page.margin * scene.page.scale, run: () => App.change(tx => keyCorner(tx, one.id, [v, h]), { dated: false, say: `Put the Key in the ${label.toLowerCase()} corner` }) }; }).concat(['-', { label: 'Where the page places it', checked: !rowOf(one.id)?.corner && rowOf(one.id)?.x == null, run: () => App.change(tx => keyCorner(tx, one.id, null), { dated: false, say: 'Let the page place the Key' }) }]) }, '-'] : [];
    const text = one?.type === 'shape' && !['line', 'picture', 'group'].includes(one.geometry), fielded = bound.length && bound.length === ms.length;
    const worded = one && (one.type === 'box' || (one.type === 'line' && one.texts?.some(isField)));
    const free = ms.filter(m => m.type === 'shape' && m.geometry !== 'legend' && !m.role), pictured = one?.geometry === 'picture';
    // About a dozen rows, in one order on everything: what it says; what it's made of and related to; the clipboard; how it looks, and all else (More); and what takes it away, last, so nothing goes by a slip. A row that isn't for this thing isn't there; the rest keep their order.
    // (What a structure chart is made of: its owner and its holding, or what else its first lists call them, as a list's + asks; many, one row.)
    const adds = one?.type === 'box' && !ro ? addsOf(one) : [];
    // A company's own: merged into another, and each stake in it, sold or ended from the company, not only from its thin line.
    const deals = one?.type === 'box' ? [...(App.endsOf(one.record).some(e => e.rel) ? [{ label: 'Merge into…', disabled: !App.canAsk(), run: () => App.merging(one.record) }] : []), ...stakeItems(one)] : [];
    const more = [
      ...(placeable().length ? [{ label: ms.every(m => m.type === 'box') ? 'Duplicate as a new box…' : 'Duplicate', keys: '$mod+KeyD', disabled: ro, run: duplicate }] : []),
      ...(bound.length ? [{ label: 'Select all like this', keys: '$mod+Shift+Space', run: selectLike }] : []),
      '-',
      { label: 'Order', disabled: ro || ms.every(m => m.type === 'frame'), items: ORDER() },
      ...(free.some(m => m.geometry !== 'table') || ms.some(m => m.geometry === 'group') ? [{ label: 'Flip and turn', disabled: ro, items: FLIPS() }] : []),
      ...(ms.some(m => m.geometry === 'group') ? [{ label: 'Ungroup', keys: '$mod+Shift+G', disabled: ro, run: ungroup }]
        : placeable().length > 1 ? [{ label: 'Group', keys: '$mod+G', disabled: ro, run: group }] : []),
      ...hand.shapeItems(ms, one, ro),
      ...(pictured ? [{ label: 'Alt text…', disabled: ro, run: () => focusRow('alt') }] : []),
      ...(free.length && !ms.some(m => m.type === 'box') && !pictured && !one?.geometry?.startsWith?.('group') ? [...(one?.geometry === 'table' ? [] : [{ label: 'Set as default', disabled: ro || !one, run: () => hand.setDefault() }]), ...(one ? [{ label: 'Alt text…', disabled: ro, run: () => focusRow('alt') }] : [])] : []),
      ...(deals.length ? [{ label: 'Transactions', items: deals }] : []),
      '-',
      // Their own History; what's shown of them.
      ...(bound.length ? [{ label: 'History', run: () => Time.of(bound.map(m => m.record)) }] : []),
      ...(bound.length ? [{ label: 'Hide in this view', disabled: ro && !App.seeing(), run: () => App.seeing() ? App.see(viewOf(), bound.map(m => m.record), false) : remove() }] : []),
      ...(ms.some(m => m.type === 'box') ? [{ label: 'Show only these', disabled: !canShowOnly(), run: showOnly }] : []),
      // What the word for an act hides, offered plainly: a mistake is taken back as never held.
      ...(bound.length && bound.some(m => App.endOf(m.record) !== false) ? ['-', { label: 'Delete as a mistake…', danger: true, disabled: !App.canAsk(), run: () => { remove(true); App.neverHeld(); } }] : []),
    ].filter((it, i, all) => it !== '-' || (i && all[i - 1] !== '-' && i < all.length - 1));
    return [
      ...(one?.geometry === 'table' ? hand.tableItems(one, ro) : text && !ro ? [{ label: 'Edit text', keys: 'Enter', run: () => edit(one.id) }, ...(one.geometry !== 'line' && scene.view !== Scene.MASTER && free.length ? [{ label: 'Add footnote', keys: '$mod+Alt+KeyF', run: () => footnote(one) }] : []), '-'] : []), ...inCorner,
      ...(fielded ? [...(worded ? [{ label: 'Edit text', keys: 'Enter', disabled: ro, run: () => f ? editField(f.m, f.it) : edit(one.id) }] : []),
        ...(f ? [{ label: fieldName(f.it), items: fieldRows(f) }] : []),
        { label: 'Show on chart', disabled: ro, items: showItems(bound) }, ...(one ? [{ label: 'Add text', disabled: ro, run: () => writeText(one) }, { label: 'Add footnote', keys: '$mod+Alt+KeyF', disabled: ro, run: () => footnote(one) }] : []), '-'] : []),
      ...(pictured ? [{ label: 'Crop', disabled: ro, run: () => hand.crop(one.id) }, { label: 'Change picture…', disabled: ro, run: () => hand.changePicture(one.id) }, '-'] : []),
      ...(adds.length > 3 ? [{ label: 'Add', items: adds }] : adds),
      // What's between it and another box: asked for, a tick in the two's panel relates them; Viewing, it reads what's there, and makes nothing.
      ...(one?.type === 'box' ? [{ label: ro ? 'With…' : 'Relate…', run: () => relating(one, undefined, null, ro) }] : []),
      // A relation recorded, as its panel's ⋯ has it: renamed where it's seen; given to another (App.transferring). Viewing, each of these is a what-if: redlined, and made only from Editing.
      ...(one?.type === 'line' && !ro ? [{ label: `Rename ${App.notes.peek().nameOf(App.state.peek(), one.record)}…`, run: () => Shell.parts.peek().inspector?.renameLine?.(one.record) }] : []),
      ...(one?.type === 'line' && App.transferable(one.record) ? [{ label: 'Transfer…', disabled: !App.canAsk(), run: () => App.transferring(one.record) }] : []),
      ...(one?.type === 'line' && App.interposable(one.record) ? [{ label: App.interposeWord(one.record), disabled: !App.canAsk(), run: () => App.interposing(one.record) }] : []),
      ...(one?.type === 'box' || one?.type === 'line' ? ['-'] : []),
      { label: 'Copy', keys: '$mod+C', run: copyOut }, { label: 'Paste', keys: '$mod+V', disabled: ro || !(clip?.items.length || clip?.field || clip?.free !== undefined), run: () => paste() },
      '-',
      ...formatItems(ms, ro),
      ...(typeof Designs === 'undefined' ? [] : Designs.makes(ms, ro)),
      { label: 'More', items: more },
      '-',
      // (On the Key, what it deletes, the row selected or the Key, in its own label.)
      { label: bound.length ? `${App.deleteVerb(bound.map(m => m.record))}…` : one?.geometry === 'legend' ? (keyRow() ? `Delete the row ${one.rows.find(r => r.key === keyRow().key)?.caption.text ?? ''}`.trim() : 'Delete the Key') : 'Delete', keys: 'Delete', danger: true, disabled: bound.length ? !App.canAsk() : ro, run: () => remove(true) },
    ];
  }
  // Flip and turn: as PowerPoint's Rotate list. On what can't, it says why as it's asked.
  const FLIPS = () => [{ label: 'Flip across', run: () => hand.flip('h') }, { label: 'Flip upside down', run: () => hand.flip('v') }, '-',
    { label: 'Turn right 90°', run: () => hand.turnBy(90) }, { label: 'Turn left 90°', run: () => hand.turnBy(-90) }];
  // A row of the panel, gone to, the panel brought back for it: its alt text, say.
  const focusRow = name => { Shell.showPanel?.(); setTimeout(() => { const f = document.querySelector(`.insp [data-row="${name}"] textarea, .insp [data-row="${name}"] input`); f?.scrollIntoView({ block: 'center' }); f?.focus(); }, 60); };
  // Each stake in a box, by who holds it and how much: a transfer of it, or its end, begun from the company as from its line.
  function stakeItems(m) {
    const st = App.entered.peek(), N = App.notes.peek(), stakes = (Tree.index(st).relations.get(m.record) ?? []).map(rid => ({ rid, tr: App.transferable(rid, st) })).filter(({ rid, tr }) => tr?.amount && Tree.objectOf(st, tr.first.at) !== m.record);
    if (!stakes.length) return [];
    const said = s => `${N.shortOf(st, Tree.objectOf(st, s.tr.first.at))}, ${Tree.format(st[s.tr.amount].field, st[s.tr.amount].value)}`, off = !App.canAsk();
    return [{ label: 'Transfer a stake', disabled: off, items: stakes.map(s => ({ label: said(s), run: () => App.transferring(s.rid) })) },
      { label: 'End a stake', disabled: off, items: stakes.map(s => ({ label: said(s), run: () => Shell.parts.peek().inspector?.ending?.(s.rid) })) }];
  }
  // Add owner…, Add holding…: its search opens under the box, where the eye is, as the list's + opens it.
  const addsOf = m => (Shell.parts.peek().inspector?.adds?.(m.record) ?? []).map(x => ({ label: x.label, run: () => { const g = graph.localToClient(m.x + m.w / 2, m.y + m.h); x.run({ x: g.x, y: g.y + 4 }); } }));
  // Show on chart: each entry the selection's records have, or could have, a checkbox row, ticked where every one of
  // them shows it; switched at the scope.
  // Then what's over them, by name: of each list of their relatives, one's name ("Owner's name"), and behind one row, what else is said of them.
  const showItems = ms => {
    const own = entriesOf(ms[0]).filter(e => ms.every(m => entriesOf(m).some(x => Tree.same(x, e)))).map(e => { const on = ms.every(m => shows(m, e)); return { label: e, checked: on, run: () => setField(ms, e, !on) }; });
    const all = Scene.readable(st(), App.notes.peek(), App.schema.peek(), ms[0].record).filter(x => x.of && ms.every(m => wordsOf(m).includes(x.label)));
    const row = x => { const on = ms.every(m => showsWord(m, x.label)); return { label: x.label, checked: on, run: () => setWord(ms, x.label, !on) }; };
    // (Those it has any of first, or all, where there are few. A chart's lists can run long, and a menu mustn't.)
    const has = new Set(Scene.listsAt(st(), App.notes.peek(), ms[0].record).map(l => Tree.norm(l.name))), firsts = all.filter(x => x.first), front = firsts.length <= 5 ? firsts : firsts.filter(x => has.has(Tree.norm(x.of))), rest = all.filter(x => !front.includes(x));
    return [...own, ...(front.length ? ['-', ...front.map(row)] : []), ...(rest.length ? [...(front.length ? [] : ['-']), { label: 'More of what’s over it', items: rest.map(row) }] : [])];
  };
  // Format: the format bar's Fill, Outline and Font, opened from here; and its painter's Copy and Paste formatting.
  function formatItems(ms, ro) {
    if (!ms.length) return [];
    const bar = typeof FormatBar !== 'undefined' ? FormatBar : {}, open = what => () => bar.open ? bar.open(what) : document.querySelector(`.fb [data-fb="${what}"]`)?.click();
    const boxy = ms.some(m => m.type === 'box' || (m.type === 'shape' && m.geometry !== 'line'));
    const designs = typeof Designs === 'undefined' ? [] : Designs.items(ms, ro);
    return [{ label: 'Format', items: [...(ms.some(m => m.type === 'box') ? [{ label: 'Design…', disabled: ro, run: open('design') }, ...designs, '-'] : []), ...(boxy ? [{ label: 'Fill…', disabled: ro, run: open('fill') }] : []), { label: 'Outline…', disabled: ro, run: open('outline') }, ...(boxy ? [{ label: 'Effects…', disabled: ro, run: open('effects') }] : []), { label: 'Font…', disabled: ro, run: open('font') },
      ...(!ms.some(m => m.type === 'box') && designs.length ? ['-', ...designs] : []),
      ...(bar.copyLook ? ['-', { label: 'Copy formatting', keys: '$mod+Shift+KeyC', run: () => bar.copyLook() }, { label: 'Paste formatting', keys: '$mod+Shift+KeyV', disabled: ro || !bar.canPasteLook?.(), run: () => bar.pasteLook() }] : [])] }];
  }
  // The group whose note decides a field, where it's a group's: one beside an output, or at the entry wherever it is,
  // as the Key and Styles group them; null for a box's own, or where none says.
  function groupOfNote(m, note, sc = scene) {
    if (!note || !note.view || Tree.idsIn(note.pattern).size) return null;
    // Or, at a pattern no style keys, the boxes whose texts it gives, called by what it's at.
    return groupsAt(sc, m).find(g => g.outputs.some(p => Tree.key(p) === Tree.key(note.pattern)))
      ?? { caption: calledAt(note.pattern), outputs: [note.pattern], marks: new Set(sc.marks.filter(x => x.texts?.some(it => it.shownBy === note)).map(x => x.id)) };
  }
  // What a pattern a note is at calls the boxes it reaches: an entry's at a kind, that kind's (Entities); at no kind,
  // boxes; an output, by its name (Main Fund).
  const calledAt = p => { const loc = p.args?.length === 1 && !p.out ? p.args[0].loc : null;
    return loc && !loc.args ? (loc.kind ? Tree.plural(loc.kind) : 'boxes') : !p.args ? (p.kind ? Tree.plural(p.kind) : 'boxes') : Scene.outputName(App.notes.peek(), p); };
  // A field's look, on tx: at the field's own pattern at the scope, as a format given there lands on its text; a free
  // text's, in its Text note. The format bar's, for a text property, while a field is selected.
  function styleField(tx, f, label, v, s = scopeNow(canvas)) {
    const view = viewOf(), name = fieldName(f.it);
    // A part's look goes to the part, at the pen: said over its design, only what's different.
    // (But a field in the part its other fields go in is still that field, in words.)
    if (f.it.of || (f.it.part && !(f.it.rested && label in Scene.DEFAULTS.text))) return Designs.say(tx, f.m, partOf(f.m, f.it).part, { format: { [label]: v } }, s);
    if (f.it.free) { const N = App.notes.peek(), n = N.notes('Text').find(x => x.note === f.it.free.note); if (n) tx.note('Text', n.pattern, { ...n.value, [label]: v }, { view }); return; }
    // A group that names the boxes by an entry of theirs (Jurisdiction: Cayman Islands) gives the look beside it, the field
    // in each of its boxes, as Shown beside an output shows it.
    const rec = treeOf(f.m.record), e = f.it.blank ? { args: [{ edge: name, loc: rec }] } : treeOf(f.it.id);
    for (const p of s.own ? [rec] : s.outputs) { const [pattern, param] = fieldAt(e, rec, scopeAt(p, name), name); tx.note(label, pattern, v, { view, ...(param && { param }) }); }
  }
  // A field's own: cleared, hidden from this box or from all like it, shown in every box or with its name.
  function fieldRows(f) {
    // All like it: the group whose note shows the field here, so hiding it there takes back what showed it; else the
    // scope's group, or the narrowest.
    const ro = still(), s = scopeNow(canvas), all = !s.own ? s : groupOfNote(f.m, f.it.shownBy) ?? groupsAt(scene, f.m).find(x => x.marks.size > 1);
    return [
      { label: 'Clear contents', keys: 'Delete', disabled: ro || !clears(f), run: () => clearField(f) },
      '-', { label: f.m.type === 'line' ? 'Hide from this line' : 'Hide from this box', disabled: ro, run: () => hideField(f, { own: true }) },
      ...(all ? [{ label: `Hide from ${named(all)}`, disabled: ro, run: () => hideField(f, all),
        // Pointed at, the boxes it reaches are cued on the chart, as the scope's are (the format bar's cue).
        point: on => canvas.cue?.(on && all.marks ? [...all.marks] : null) }] : []),
      ...(f.it.free || f.it.of || !st()[f.it.id] ? [] : ['-', { label: 'In every box that has it', checked: fields.everywhere(fieldName(f.it)), disabled: ro, run: () => fields.setEverywhere(fieldName(f.it), !fields.everywhere(fieldName(f.it))) },
        { label: 'With its name', checked: fields.captioned(fieldName(f.it)), disabled: ro, run: () => fields.setCaptioned(fieldName(f.it), !fields.captioned(fieldName(f.it))) }]),
    ];
  }
  // The page's own right-click: what can be put on it, right there; and how it's set up.
  const pageItems = p => [
    ...[...kinds()].sort().map(k => ({ label: `New ${lowered(k)}`, disabled: still(), run: () => create(k, p) })), '-',
    { label: 'New shape', disabled: still(), items: Shapes.gallery().flatMap(g => [{ head: g.head }, ...g.shapes.map(([id, name]) => ({ label: name, run: () => insert(id, { ...placedAt(p, 140, 70), ...(Shapes.OPEN.has(id) && { format: { Fill: 'none' } }) }) }))]) },
    { label: 'New text box', disabled: still(), run: () => insert('text', { x: round(p.x), y: round(p.y) }) },
    { label: 'New line', disabled: still(), run: () => insert('line', { points: [[round(p.x), round(p.y)], [round(p.x + 96 / pageScale()), round(p.y)]] }) },
    { label: 'New arrow', disabled: still(), run: () => insert('arrow-line', { points: [[round(p.x), round(p.y)], [round(p.x + 96 / pageScale()), round(p.y)]] }) }, '-',
    { label: 'Paste', keys: '$mod+V', disabled: still() || !clip?.items.length, run: () => paste() },
    { label: 'Select all', keys: '$mod+KeyA', run: () => sel.reset(graph.getCells().filter(selectable)) }, '-',
    { label: 'Tidy', disabled: still(), run: tidy },
    { label: 'Page setup…', disabled: still(), run: () => Export.setup() },
    { label: 'More', items: [{ label: 'Selection pane', keys: 'Alt+F10', run: () => hand.pane(true) }, { label: 'Zoom to fit', keys: 'Shift+Digit1', run: () => zoom('fit') }, '-', { label: 'Filter…', disabled: !App.canAsk(), run: () => filter(pageAt.x ? pageAt : null) },
      ...(App.shownOf() ? [{ label: 'Show all', run: () => App.showAll(viewOf()) }] : []), '-', aidsRow()] },
  ];
  const placedAt = (p, w, h) => ({ x: round(clamp(p.x - w / 2, 0, scene.page.w - w)), y: round(clamp(p.y - h / 2, 0, scene.page.h - h)), w, h });
  let pageAt = {};

  // ---- States others ask for: highlight, redline, hidden records drawn ----
  // A record not drawn as text lights the box or line it sits in, or the line that stands in for it.
  const markFor = id => { const st = App.state.peek(); for (let x = id; x; x = st[x]?.at) { const m = scene?.byId.get(x) ?? scene?.byId.get(standIns.get(x)); if (m) return m; } return null; };
  // The box or line it is, or is in: a text's, the box or line it's written in.
  const hostOf = id => { const m = markFor(id); return m?.type !== 'text' ? m : scene.marks.find(h => h.texts?.includes(m)) ?? null; };
  // The marks a selection's keys name: a record's or a shape's, a legend's for its row, a relation's text's
  // box; a relation drawn nowhere, its sides'.
  const marksOf = keys => [...new Set(keys.flatMap(k => {
    const id = keyParts(k)[0].split('@')[0], m = hostOf(id);
    return m ? [m] : (App.state.peek()[id]?.args ?? []).map(a => hostOf(a.at)).filter(Boolean);
  }))];
  // What a line can be traced with: a highlight's hue and depth, a legend row's, the selection's, the scope's.
  const TRACES = ['dc-hl', 'dc-row', 'dc-sel', 'dc-cue', 'dc-reach', 'strong', 'deep', 'pulse', 'hloop', 'haccent', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
  function paintStates(extra) {
    if (!scene) return;
    marks.querySelectorAll('.dc-hl, .dc-row, .dc-group, .dc-cue, .dc-reach').forEach(n => n.remove());
    // A box or a text is outlined over the chart; a line is traced where it lies, under the boxes, so a
    // line lit never crosses a name. A line drawn once for others traces them, in the strongest light of
    // theirs: the deeper reasons are lit first, so a witness's is over them.
    const traced = new Map(), lights = new Set(TRACES.filter(c => c !== 'dc-row' && c !== 'dc-sel'));
    const outline = (m, cls, pad = 3) => {
      if (m.points) { const id = m.merged ?? m.id, was = traced.get(id) ?? []; return traced.set(id, [...cls.startsWith('dc-hl') ? was.filter(c => !lights.has(c)) : was, ...cls.split(' ')]); }
      const p = document.createElementNS(NS, 'path');
      // Round a box by its own outline; a triangle's grows from its apex, so it stays clear of it.
      const k = m.shape === 'triangle' ? 2.2 : 1;
      p.setAttribute('d', Scene.path(m.type === 'box' ? m.shape : 'rect', m.w + 2 * pad * k, m.h + 2 * pad * (k === 1 ? 1 : 1.4)));
      p.setAttribute('transform', `translate(${m.x - pad * k},${m.y - pad * (k === 1 ? 1 : 1.8)})`);
      p.setAttribute('class', cls);
      marks.appendChild(p);
    };
    const hosts = new Map();
    for (const m of scene.marks) for (const it of m.texts ?? []) hosts.set(it.id, m);
    const lit = new Set();
    // Each record lit takes its hue, and its depth: 0 a witness, heavier; 2 a deeper reason, lighter.
    for (const [id, [hue, depth]] of [...(hl?.map ?? []), ...(extra ?? [])].sort((a, b) => (b[1][1] ?? 1) - (a[1][1] ?? 1))) {
      const m = markFor(id);
      if (!m) continue;
      const cls = `dc-hl h${hue}` + (depth === 0 ? ' strong' : depth === 2 ? ' deep' : '') + (hl?.pulse.has(id) ? ' pulse' : '');
      if (m.type === 'text') {
        const h = hosts.get(m.id);
        if (!h) continue;
        lit.add(h.id);
        const o = h.type === 'line' ? h.labelAt ?? { x: 0, y: 0 } : h;
        const xs = m.lines.map(l => l.x - (m.look.Align === 'center' ? l.w / 2 : m.look.Align === 'right' ? l.w : 0)), ys = m.lines.map(l => l.y);
        outline({ type: 'box', x: o.x + Math.min(...xs), y: o.y + Math.min(...ys) - Scene.baseline(m.look), w: Math.max(...m.lines.map(l => l.w)), h: m.lines.length * Scene.lineHeight(m.look) }, cls, 1.5);
      } else { lit.add(m.merged ?? m.id); outline(m, cls); }
    }
    // A selected legend row, and an entered or selected group.
    const kr = keyRow(), lg = kr && scene.byId.get(kr.legend), r = lg?.rows?.find(x => x.key === kr.key);
    if (r) {
      outline({ type: 'box', x: lg.x + r.x - 2, y: lg.y + r.y - 1, w: r.w, h: r.h + 2 }, 'dc-row', 0);
      // And every mark with that look.
      const outs = new Set(r.outputs.map(p => Tree.key(p)));
      for (const m of scene.marks) if (m.settings && Object.values(m.settings).some(s => s.note && outs.has(Tree.key(s.note.pattern)))) outline(m, 'dc-row', 3);
    }
    for (const g of groups()) if (g.members.some(id => sel.isSelected(graph.getCellById(id) ?? {}))) outline(g, 'dc-group', 4);
    // What's selected is outlined by its own shape, not by a frame round it; X6's frame shows only while it's dragged (see the stylesheet).
    for (const c of sel.getSelectedCells()) if (c.isNode()) {
      const m = scene.byId.get(c.id);
      if (!m || m.points) continue;
      outline(m, 'dc-group dc-shaped', 0);
      if (m.rotate) marks.lastChild.setAttribute('transform', `${marks.lastChild.getAttribute('transform')} rotate(${m.rotate} ${m.w / 2} ${m.h / 2})`);
    }
    // A pen pointed at: each mark it would reach lit on its own edge, so there's one rule and not two. And at rest, what's in reach of the pen, a faint tint.
    const drawnOf = ids => ids && new Set([...ids].map(id => scene.byId.get(id)).filter(m => m && (m.type === 'box' || m.type === 'line')).map(m => m.merged ?? m.id));
    const cuedHere = drawnOf(cued), reachHere = drawnOf(inReach);
    for (const id of cuedHere ?? []) outline(scene.byId.get(id), 'dc-cue', 0);
    if (!cuedHere) for (const id of reachHere ?? []) outline(scene.byId.get(id), 'dc-reach', 0);
    // A selected line is traced in the accent, as Office marks one.
    for (const c of sel.getSelectedCells()) if (c.isEdge()) { const m = scene.byId.get(c.id); if (m?.points) outline(m, 'dc-sel'); }
    bendGrips();
    const dim = !!hl?.dim && lit.size;
    for (const c of graph.getCells()) {
      const v = graph.findViewByCell(c);
      if (!v) continue;
      const k = c.getData()?.kind, id = k === 'label' ? c.getData().mark : c.id, el = v.container;
      // What a pending change would add or take away isn't dimmed: it's what's being asked about.
      el.classList.toggle('dc-dim', !!dim && k !== 'page' && !lit.has(id) && !ink?.lit.has(id));
      // And every mark the scope doesn't reach is dulled, the page's own furniture with them; and while a design is edited, all but it, and out of reach.
      const off = !!designing && k !== 'page' && k !== 'ink' && !designing.keeps(id);
      el.classList.toggle('dc-locked', off);
      el.classList.toggle('dc-dull', off || (!!cuedHere && k !== 'page' && k !== 'ink' && !cuedHere.has(id)));
      // A mark selected, or in the scope chosen, shows its blanks' names.
      el.classList.toggle('dc-on', sel.isSelected(k === 'label' ? graph.getCellById(id) ?? c : c) || !!cuedHere?.has(id) || !!reachHere?.has(id));
      if (c.isEdge()) { el.classList.remove(...TRACES); el.classList.add(...traced.get(c.id) ?? []); }
    }
    paintFields();
  }
  // A line selected alone: a yellow grip on each of its legs, as PowerPoint's on an elbow connector, its first and last among
  // them. Dragged, the leg moves square to itself; let go, the route's middle legs are the line's Bend, in a place's terms,
  // which the router leaves alone. A click that moves it by nothing writes nothing.
  function bendGrips() {
    marks.querySelectorAll('.dc-bend').forEach(n => n.remove());
    hand?.paint();
    const cs = sel.getSelectedCells(), m = cs.length === 1 && cs[0].isEdge() && !still() ? scene.byId.get(cs[0].id) : null;
    if (m?.type !== 'line' || m.straight || !m.points || m.points.length < 2) return;
    const z = graph.zoom();
    m.points.slice(1).forEach((q, i) => {
      const p = m.points[i], up = Math.abs(p[0] - q[0]) < 0.5, flat = Math.abs(p[1] - q[1]) < 0.5;
      if (up === flat) return;
      const c = document.createElementNS(NS, 'rect'), s = 9 / z, [x, y] = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
      c.setAttribute('class', 'dc-bend' + (up ? ' across' : ' updown'));
      Object.entries({ x: x - s / 2, y: y - s / 2, width: s, height: s, rx: s / 2, 'stroke-width': 1 / z }).forEach(([k, v]) => c.setAttribute(k, v));
      c.addEventListener('pointerdown', e => bendLeg(e, m, i, up, c));
      c.addEventListener('mousedown', e => e.stopPropagation());
      // (Right-clicked, it's the line.)
      c.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); Shell.menu({ x: e.clientX, y: e.clientY }, markItems()); });
      marks.appendChild(c);
    });
  }
  // How far along its edge a box takes a leg moved square to itself: a leg upright at any x over its width (axis 0), or a
  // leg level at any y over its height (axis 1), a little in from its corners; a triangle's apex takes what comes down
  // to it, there alone. `away`, the leg's other end. → [lo, hi]
  function edgeTakes(b, axis, away) {
    if (!b) return [Infinity, -Infinity];
    if (axis === 0 && b.shape === 'triangle' && away[1] < b.y + b.h / 2) return [b.x + b.w / 2, b.x + b.w / 2];
    const [at, len] = axis ? [b.y, b.h] : [b.x, b.w], inset = Math.min(8, len / 4);
    return [at + inset, at + len - inset];
  }
  // A line's route with its k-th leg moved to v on its axis. A leg between others takes its two corners with it. A first or
  // last leg goes on leaving its box square, along the edge, as far as the box takes it; past that it adds a jog, from where
  // the edge ends, a stub's length out, across to where it was dragged. So a straight line, which is both, moved aside
  // keeps its ends and adds a jog at each it must.
  function legMoved(m, k, axis, v) {
    const ps = m.points, n = ps.length - 1, at = (p, c) => (axis ? [p[0], c] : [c, p[1]]);
    const end = (b, p, q) => {
      const [lo, hi] = edgeTakes(b, axis, q);
      if (v >= lo && v <= hi) return [at(p, v)];
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]), s = Math.min(16, len / 3) / (len || 1), o = at(p, lo > hi ? p[axis] : clamp(v, lo, hi));
      const j = [o[0] + (q[0] - p[0]) * s, o[1] + (q[1] - p[1]) * s];
      return [o, j, at(j, v)];
    };
    const head = k === 0 ? end(scene.byId.get(m.from), ps[0], ps[1]) : ps.slice(0, k).concat([at(ps[k], v)]);
    const tail = k === n - 1 ? end(scene.byId.get(m.to), ps[n], ps[n - 1]).reverse() : [at(ps[k + 1], v)].concat(ps.slice(k + 2));
    return [...head, ...tail];
  }
  function bendLeg(e, m, k, up, grip) {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const axis = up ? 0 : 1, start = graph.clientToLocal(e.clientX, e.clientY), was = m.points[k][axis], cell = graph.getCellById(m.id);
    const lab = graph.getCellById(`${m.id}·label`);
    let v = was;
    astray(m.id); if (lab) astray(lab.id);
    cell?.setConnector({ name: 'normal' });
    // (The rest of its grips stand on legs that are moving: they're back with the line drawn.)
    marks.querySelectorAll('.dc-bend').forEach(n => { if (n !== grip) n.remove(); });
    const move = ev => {
      const q = graph.clientToLocal(ev.clientX, ev.clientY);
      v = was + (axis ? q.y - start.y : q.x - start.x);
      const r = legMoved(m, k, axis, v);
      cell?.setSource({ x: r[0][0], y: r[0][1] }); cell?.setTarget({ x: r.at(-1)[0], y: r.at(-1)[1] });
      cell?.setVertices(r.slice(1, -1).map(([x, y]) => ({ x, y })));
      grip.setAttribute(axis ? 'y' : 'x', v - +grip.getAttribute(axis ? 'height' : 'width') / 2);
    };
    const end = () => {
      removeEventListener('pointermove', move, true); removeEventListener('pointerup', end, true);
      // (A click on it that moves nothing is a click on the line there.)
      if (Math.abs(v - was) < 0.5) { pressed = { id: m.id, p: [start.x, start.y], was: Shell.selection.peek(), more: false }; reselect(); return show(true); }
      const o = origin(), r = legMoved(m, k, axis, round(v)).map(([x, y]) => [round(x - o.x), round(y - o.y)]);
      // (Its middle legs; a straight line slid along both its boxes has none, and a point on it says where it runs.)
      const ps = r.length > 2 ? r.slice(1, -1) : [[(r[0][0] + r[1][0]) / 2, (r[0][1] + r[1][1]) / 2]];
      const c = App.change(tx => tx.note('Bend', treeOf(m.record), { points: ps }, { view: viewOf() }), { dated: false, say: `Bent ${called(m)}` });
      if (!c) show(true);
    };
    addEventListener('pointermove', move, true); addEventListener('pointerup', end, true);
  }
  // Range Finder: colors { [record id]: [hue 1–6 or 'loop', depth 0–2] }, each record outlined in its hue;
  // pulse, what a hovered part of a formula means. With dim, the rest fades. null clears it.
  function highlight(colors, { dim = false, pulse = [] } = {}) {
    const map = new Map(Object.entries(colors ?? {}));
    hl = map.size ? { map, dim, pulse: new Set(pulse) } : null;
    show();
  }
  // A pending change, as comparison software shows one, on the scene the change, made, draws: `records`, the state
  // it would leave, and `computed`, its working-out (the formula bar's, where it gives none), laid out as Enter lays
  // it out, its routes and its page; and `appear`, `go` and `changed`, by record, its ink (see inked). Laid out at
  // once on a chart of a few hundred marks, and past that ahead, and drawn then. null clears it.
  // Cleared, it's drawn away once what cleared it is done: a change made as it was previewed draws its scene, the
  // redline's, at once, and nothing in between.
  let clearing = false;
  function redline(r) {
    const R2 = typeof FormulaBar !== 'undefined' && FormulaBar.pending.peek()?.R2;
    red = r ? { state: r.records, computed: r.computed ?? (R2?.records === r.records ? R2 : App.computed.peek()), appear: new Set(r.appear ?? []), go: new Set(r.go ?? []),
      changed: new Set(Object.keys(r.changed ?? {})), scene: null, wb: r?.shows ? (rows => ({ ...App.shown.peek(), rows: () => rows, notes: () => Notes.index(rows.filter(x => 'note' in x)) }))([...App.shown.peek().rows(App.chart.peek()), ...r.shows]) : null } : null;
    if (r) return show();
    if (!clearing) { clearing = true; queueMicrotask(() => { clearing = false; show(); }); }
  }
  // A redline's ink, on the scene the change, made, draws (`after`), against the scene drawn now (`before`): what would
  // appear, blue; a text that would change, blue under what it said, struck in red; and what would go, struck in red
  // where it's drawn now, as the page will set it (by its offset), a line whose boxes will stand elsewhere taking a
  // way of its own among them (Layout.around). It moves nothing: `cells`, what goes, drawn over the scene; `lit`, every
  // cell inked, which a highlight doesn't dim.
  function inked(r, after, before) {
    const near = (a, b) => Math.abs(a - b) < 0.01, dx = origin(after.page).x - origin(before.page).x, dy = origin(after.page).y - origin(before.page).y;
    const was = new Map(), texts = new Map(), lit = new Set();
    for (const id of r.changed) { const a = after.byId.get(id), b = before.byId.get(id); if (a?.type === 'text' && b?.type === 'text' && a.text !== b.text) was.set(id, b.text); }
    for (const m of before.marks) if (m.texts && after.byId.has(m.id)) { const its = m.texts.filter(it => r.go.has(it.id) && after.byId.get(it.id)?.type !== 'text'); if (its.length) texts.set(m.id, its); }
    const boxes = before.marks.filter(m => m.type === 'box' && r.go.has(m.record) && !after.byId.has(m.id)).map(m => ({ ...m, x: m.x + dx, y: m.y + dy }));
    const geo = new Map([...after.marks.filter(m => m.type === 'box'), ...boxes].map(b => [b.id, b]));
    const stands = id => { const a = before.byId.get(id), b = geo.get(id); return !!a && !!b && near(a.x + dx, b.x) && near(a.y + dy, b.y) && near(a.w, b.w) && near(a.h, b.h); };
    const shift = ps => ps.map(([x, y]) => [x + dx, y + dy]);
    // Clear of every box, the Key and the free shapes, and the labels drawn.
    const avoid = [...after.marks.filter(m => m.type === 'shape' && m.geometry !== 'line' && m.geometry !== 'group'),
      ...after.marks.filter(m => m.type === 'line' && m.labelAt && m.label).map(m => ({ x: m.labelAt.x, y: m.labelAt.y, w: m.label.w, h: m.label.h }))].map(({ x, y, w, h }) => ({ x, y, w, h }));
    const way = l => { try { return geo.has(l.from) && geo.has(l.to) ? Layout.around(geo, l.from, l.to, { page: after.page, avoid }) : null; } catch { return null; } };
    // A struck line keeps its label only where it's clear of every label and box of the scene Enter makes; else it's
    // struck without it, as what goes is said in the bar and counted in the formula bar.
    const clear = (a, pad = 1) => ![...avoid, ...geo.values()].some(b => a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad);
    const lines = before.marks.filter(m => m.type === 'line' && r.go.has(m.record) && !after.byId.has(m.id)).map(l => {
      if (stands(l.from) && stands(l.to)) {
        const at = l.labelAt && { x: l.labelAt.x + dx, y: l.labelAt.y + dy };
        return { ...l, points: shift(l.points), runs: l.runs?.map(shift), ...(at && l.label && clear({ ...at, w: l.label.w, h: l.label.h }) ? { labelAt: at } : { labelAt: null, texts: [] }) };
      }
      const ps = way(l);
      return ps && { ...l, points: ps, runs: null, labelAt: null, texts: [] };
    }).filter(Boolean);
    const gone = [...lines, ...boxes];
    const cells = cellsOf({ marks: gone }, { appear: new Set(), go: new Set(gone.map(m => m.record)), was: new Map(), texts: new Map() })
      .map((c, i) => ({ ...c, zIndex: 1e6 + i, data: { kind: 'ink', mark: c.data.mark } }));
    for (const m of after.marks) if (r.appear.has(m.record) || texts.has(m.id) || m.texts?.some(it => was.has(it.id) || r.appear.has(it.id))) lit.add(m.id);
    for (const c of cells) lit.add(c.id);
    return { appear: r.appear, go: r.go, was, texts, cells, lit };
  }
  // A pen pointed at, on the chart, its cue: `ids`, the marks it would reach (boxes and lines, by id), each lit with the
  // group light and every other mark dulled; null clears it. It's drawn over the scene and changes nothing in it, so no
  // export draws it. And `reach`, what's in reach of the pen at rest: a thin outline, nothing else touched.
  function cue(ids) {
    const next = ids ? new Set(ids) : null;
    if (JSON.stringify(next && [...next]) === JSON.stringify(cued && [...cued])) return;
    cued = next;
    paintStates();
  }
  function reach(ids) {
    const next = ids ? new Set(ids) : null;
    if (JSON.stringify(next && [...next]) === JSON.stringify(inReach && [...inReach])) return;
    inReach = next;
    paintStates();
  }
  // A format pointed at in the format bar, as it would look: the chart drawn from `wb`, the workbook as the
  // change would leave it, laid out as making it lays it out (see draw), PowerPoint's live preview. null ends it.
  // Tidy's (`wb.tidy`), which moves everything, only once the pointer has rested on it half a second, and said on
  // the chart to be its preview.
  const RESTING = 500;
  let resting = 0;
  function restyle(wb) {
    clearTimeout(resting);
    const next = wb && { wb };
    if (wb?.tidy && !styled?.wb.tidy) { if (styled) { styled = null; show(); } resting = setTimeout(() => { styled = next; show(); }, RESTING); return; }
    styled = next; show();
  }
  // Boxes and lines the view hides are drawn while they're highlighted, redlined, or asked for. (An entry
  // isn't: it lights what it sits in, so no box changes size under the pointer. Nor is a record of a kind the
  // view hides, a tax year say, or a relation to one: they aren't of this chart.) A preview is drawn while
  // it's quick: a redline or a restyle on a chart of a few hundred marks, and the hidden drawn only while
  // they're a few dozen; past that, what's drawn is lit, and the formula bar says the rest.
  const QUICK = { marks: 400, hidden: 40 };
  let asked = [], redDrawn = null, styled = null, styledDrawn = null, standIns = new Map();
  function reveal(ids) { asked = ids ? [...ids] : []; show(); }
  // What's drawn from: the chart's state, and a record selected that starts after the day shown, as it will be then
  // (App.later), revealed where it will be.
  function stateNow() { const l = App.later?.peek(); return l ? { ...App.state.peek(), ...l } : App.state.peek(); }
  function show(again = false) {
    const base = App.scene.peek(), quick = (base?.marks.length ?? 0) <= QUICK.marks, s = styled && quick ? styled : null;
    // The scene a redline draws, for the view and day shown: laid out now where the chart is quick, else ahead.
    if (red && base && !(red.scene?.view === base.view && red.scene.day === base.day))
      red.scene = laidAhead.get(red.state)?.get(`${base.view}|${base.day}`) ?? (quick ? Scene.of(red.wb ?? App.shown.peek(), App.chart.peek(), base.view, base.day, { state: red.state, computed: red.computed, ahead: true, holds: holdsFor(base) }) : null);
    const r = red?.scene ? red : null;
    const st = stateNow(), N = App.notes.peek();
    const away = id => { const k = st[Tree.objectOf(st, id)]?.kind; return !!k && N.value('Shown', { kind: k }, base?.view) === false; };
    const hidden = id => { const x = st[id]; return x && (Tree.isObject(x) || x.args?.length === 2) && !base?.byId.has(id) && ![id, ...(x.args ?? []).map(a => a.at)].some(away); };
    // A relation the view hides, lit or stepped through, whose two boxes a line drawn here already joins (one
    // lit, of two), is lit on that line, not routed a second time beside it. (One a redline adds is drawn, as
    // what would change.)
    const joins = new Map(), pair = (a, b) => [a, b].sort().join(' ');
    for (const m of base?.byId.values() ?? []) if (m.type === 'line') {
      const k = pair(m.from, m.to), was = joins.get(k);
      if (!was || (!hl?.map.has(was.record) && hl?.map.has(m.record))) joins.set(k, m);
    }
    standIns = new Map();
    for (const id of [...asked, ...(hl ? hl.map.keys() : [])]) {
      const x = st[id], line = hidden(id) && x.args?.length === 2 && joins.get(pair(...x.args.map(a => Tree.objectOf(st, a.at))));
      if (line) standIns.set(id, line.merged ?? line.id);
    }
    const ids = [...new Set([...asked, ...(hl ? hl.map.keys() : []), ...Object.entries(App.later?.peek() ?? {}).filter(([, x]) => Tree.isObject(x)).map(([x]) => x)])].filter(id => hidden(id) && !standIns.has(id)).sort();
    const next = ids.length && ids.length <= QUICK.hidden ? ids : null;
    if (again || JSON.stringify(next) !== JSON.stringify(revealIds) || r !== redDrawn || s !== styledDrawn) { revealIds = next; redDrawn = r; styledDrawn = s; draw(); } else paintStates();
    ahead();
  }
  // Drawn ahead once the window is idle, so that what's drawn next is drawn at once: the chart as a change
  // previewed would leave it, redlined or restyled, however big, so that making the change draws it as laid out
  // then; and the chart's other views, so that showing one draws it as it is (Scene keeps a view's latest scenes
  // by what they're drawn from). A step at a time (see Scene.steps): an idle moment takes one, and another only
  // while it has time left for one as long as the longest taken yet, so the window is never held up longer than a
  // step; and given up once what they're drawn from changes. Each idle moment is asked for after a frame, as a
  // still window has none of its own until something is drawn. A day about to be shown (`toward`, one typed in the
  // date's popover) is laid out first, its working-out a step of its own (App.workOn), so showing it draws it at once.
  let aheadOf = null, longest = 0, soon = null;
  function toward(d) { soon = d ?? null; ahead(); }
  function* on(d, view) { const R = App.workOn(d); yield; return yield* Scene.steps(App.shown.peek(), App.chart.peek(), view, d, { state: R.records, computed: R, ahead: true }); }
  // A redline not yet laid out (a big chart's) is drawn once it is, kept by the state it leaves, for the view and the
  // day, however often it's asked for again meanwhile.
  const laidAhead = new WeakMap();
  function* redAhead(r, base) {
    const sc = yield* Scene.steps(r.wb ?? App.shown.peek(), App.chart.peek(), base.view, base.day, { state: r.state, computed: r.computed, ahead: true, holds: holdsFor(base) });
    (laidAhead.get(r.state) ?? laidAhead.set(r.state, new Map()).get(r.state)).set(`${base.view}|${base.day}`, sc);
    if (red?.state === r.state && !red.scene) show();
  }
  function ahead() {
    const base = App.scene.peek(), r = red && !red.scene ? red : null, wb = styled?.wb ?? App.shown.peek(), state = r?.state ?? (styled ? App.state.peek() : null);
    if (!base || typeof requestIdleCallback !== 'function') { aheadOf = null; return; }
    if (aheadOf?.wb === wb && aheadOf.state === state && aheadOf.base === base && aheadOf.soon === soon) return;
    const mine = aheadOf = { wb, state, base, soon }, chart = App.chart.peek(), computed = App.computed.peek();
    const jobs = [...soon && soon !== base.day ? [on(soon, base.view)] : [], ...r ? [redAhead(r, base)] : styled ? [Scene.steps(wb, chart, base.view, base.day, { state, computed, ahead: true, holds: styled.wb.tidy ? null : holdsOf(base) })] : [],
      ...App.views.peek().filter(v => v.layout === 'chart' && v.id !== base.view).map(v => Scene.steps(App.shown.peek(), chart, v.id, base.day, { state: App.state.peek(), computed }))];
    const live = () => aheadOf === mine && App.scene.peek() === base && jobs.length;
    const step = idle => {
      // (Not while the chart travels, which it would cost a frame.)
      if (flight) return later();
      for (let first = true; live() && (first || idle.timeRemaining() > longest); first = false) {
        const t = performance.now();
        if (jobs[0].next().done) jobs.shift();
        longest = Math.max(longest, performance.now() - t);
      }
      if (live()) later();
    };
    // A redline waiting to be drawn takes its steps even where the window is never idle long, a step a frame.
    const later = () => requestAnimationFrame(() => requestIdleCallback(step, r ? { timeout: 100 } : undefined));
    if (live()) later();
  }

  // ---- Commands ----
  const selected = () => keysOfSelection().map(k => scene.byId.get(keyParts(k)[0])).filter(Boolean);
  const placeable = () => selected().flatMap(m => m.geometry === 'group' ? m.members.map(id => scene.byId.get(id)) : [m]).filter(m => m && (m.type === 'box' || m.type === 'shape') && !footOf(m));
  // A new shape goes into free space, never over what's drawn: near the middle of what's on screen, as
  // PowerPoint puts one; a text box, a frame and a key in the page's bands round the chart, where they have room, so
  // none lands in the chart's midst; a key at the bottom right, in two columns. A text box typed in has room for a line
  // of it (ROOM), and as it's made, a longer one is placed again, nearest where it was typed, so it never lands on a
  // box, a line or the Key.
  const SIZE = { line: [160, 8], 'arrow-line': [160, 8], frame: [320, 200], picture: [160, 100] }, ROOM = px(216);
  const spot = (s, w, h, near, banded, close = false) => {
    const p = (banded && freeSpot(s, w, h, near, { bands: true })) || (close && freeSpot(s, w, h, near, { gap: 5, lane: 5 })) || freeSpot(s, w, h, near) || freeSpot(s, w, h, near, { last: true });
    return { x: clamp(p.x, 0, s.page.w - w), y: clamp(p.y, 0, s.page.h - h) };
  };
  // A picture lands in free room, as large as it can be there up to its size, its proportions kept, in the page's bands if they've the room, or anywhere clear of what's drawn;
  // on a page with none, as it is, and that's said.
  function pictureSpot(s, w, h, near) {
    for (const k of [1, 0.75, 0.5, 0.33, 0.2]) for (const o of [{ bands: true, gap: 8, lane: 8 }, { gap: 8, lane: 8 }]) { const p = freeSpot(s, w * k, h * k, near, o); if (p) return { ...p, w: round(w * k), h: round(h * k) }; }
    Shell.toast('The page has no free room: the picture is over what’s drawn', { ms: 3500 });
    return { ...spot(s, w, h, near), w, h };
  }
  function insert(geometry, opts = {}) {
    // (While a design is edited, a text box is words begun on its box: a part, in the free band of it.)
    if (geometry === 'text' && designing && opts.x === undefined) return Designs.addWords();
    const view = viewOf(), s = scene, r = root.getBoundingClientRect(), mid = graph.clientToLocal(r.left + r.width / 2, r.top + r.height / 2), sel0 = placeable(), stands = opts.x !== undefined;
    let row = { view, geometry, ...opts }, besideIt = null;
    if (geometry === 'arrow-line') row = { ...row, geometry: 'line', format: { Arrow: 'end', ...opts.format } };
    if (geometry === 'legend') row = { title: 'Key', columns: 2, ...row };
    if (geometry === 'text') row.text = opts.text ?? '';
    // What's set as the default of its family, and what its shape asks for itself.
    const given = hand.newLook(geometry, row.format);
    if (Object.keys(given).length && !['legend', 'frame', 'picture', 'table'].includes(geometry)) row.format = given;
    if (geometry === 'frame' && sel0.length && opts.x === undefined) {
      const b = { x: Math.min(...sel0.map(m => m.x)), y: Math.min(...sel0.map(m => m.y)), r: Math.max(...sel0.map(m => m.x + m.w)), d: Math.max(...sel0.map(m => m.y + m.h)) };
      row = { ...row, x: round(b.x - 14), y: round(b.y - 28), w: round(b.r - b.x + 28), h: round(b.d - b.y + 42), text: opts.text ?? 'Frame',
        format: { Layer: -1 + Math.min(0, ...s.marks.map(m => m.settings?.Layer?.value ?? m.look?.Layer ?? 0)) } };
    } else if (row.geometry === 'line' && opts.points) Object.assign(row, { x: opts.points[0][0], y: opts.points[0][1] });
    else if (opts.x === undefined && geometry === 'picture') {
      const p = pictureSpot(s, opts.w ?? 160, opts.h ?? 100, mid);
      Object.assign(row, { x: round(p.x), y: round(p.y), w: p.w, h: p.h });
    } else if (opts.x === undefined) {
      const drawn = geometry === 'text' || geometry === 'legend' ? Scene.shapeOf(row, s) : null;
      const [w, h] = drawn ? [drawn.w, drawn.h] : [opts.w, opts.h].every(Number.isFinite) ? [opts.w, opts.h] : SIZE[geometry] ?? [140, 70];
      // With something selected, a note is about it: the free room nearest beside it, first on its right, on its level.
      if (geometry === 'text' && sel0.length) { const b = sel0.reduce((r, m) => ({ x: Math.max(r.x, m.x + m.w), y: Math.min(r.y, m.y) }), { x: -Infinity, y: Infinity }), ofIt = sel0.find(m => m.y === b.y); besideIt = { left: b.x + 8, y: ofIt.y + ofIt.h / 2 }; }
      const p = spot(s, geometry === 'text' && !row.text && !besideIt ? Math.max(w, ROOM) : w, h, besideIt ? { x: besideIt.left + w / 2, y: besideIt.y } : geometry === 'legend' ? { x: s.page.w, y: s.page.h } : mid, !besideIt && ['text', 'legend', 'frame'].includes(geometry), !!besideIt);
      if (geometry === 'table' && !freeSpot(s, w, h, mid)) Shell.toast('The page has no free room: the table is over what’s drawn', { ms: 3500 });
      Object.assign(row, { x: round(p.x), y: round(p.y) }, drawn ? {} : { w, h });
      if (row.geometry === 'line') Object.assign(row, { h: 0, points: [[row.x, row.y + h / 2], [row.x + w, row.y + h / 2]] });
    }
    // A text box is made once something is typed in it, as a box is once it's named: left empty, however it's
    // left, it makes nothing. Placed on the page, where it is on it (see place).
    const typing = geometry === 'text' && !row.text && Scene.shapeOf(row, s), at = typing && { x: row.x, y: row.y, w: typing.w, h: typing.h };
    if (row.x !== undefined) [row.x, row.y] = [round(row.x), round(row.y)];
    if (row.points) row.points = row.points.map(([x, y]) => [round(x), round(y)]);
    const add = it => { let id = null; if (!App.change(tx => { id = tx.add('shape', it); })) return null; Shell.select([id]); return id; };
    if (!typing) return add(row);
    Shell.select([]);
    openEditor({ look: typing.look }, at, '', (text, keys, runs) => {
      if (!text.trim()) return;
      // (Put by a hand, it stands where it's put; left to the page, it's placed again, as long as it's come out.)
      const made = Scene.shapeOf({ ...row, x: at.x, y: at.y, text }, scene), q = stands ? { x: at.x, y: at.y } : spot(scene, made.w, made.h, besideIt ? { x: besideIt.left + made.w / 2, y: besideIt.y } : { x: at.x + made.w / 2, y: at.y + made.h / 2 }, !besideIt, !!besideIt);
      const id = add({ ...row, x: round(q.x), y: round(q.y), text, ...(runs?.length && { runs }) });
      if (id && !designing) askedOf(id, text);
    }, { multiline: true, grow: !!typing.auto, kept: true, rich: {} });
    return null;
  }
  // Hide in this view hides what's selected in this view and deletes a free shape; with `records`, Delete, it
  // deletes the records too, and what's in or on them, as every deletion of a record is made: redlined first, the
  // bar asking when it ends (App.deleting), Enter making it. A toast says what went.
  function remove(records = false) {
    const keys = keysOfSelection(), view = viewOf(), st = App.state.peek();
    if (!keys.length) return;
    const hid = [], gone = [], worked = [], doomed = [];
    // What a toast calls each: a box by its record's name, a line by its relation's, a shape by what it is.
    const as = (m, name = called(m)) => ({ type: m.type, name });
    const marks = keys.map(k => [...keyParts(k), scene.byId.get(keyParts(k)[0])]).filter(([, , m]) => m), bound = m => m.type === 'box' || m.type === 'line';
    if (records) for (const [, , m] of marks) if (bound(m)) { if (st[m.record]?.computed) worked.push(m); else doomed.push(m); }
    const rest = tx => {
      for (const [id, rowKey, m] of marks) {
        if (bound(m)) { if (!records) { tx.note('Shown', treeOf(m.record), false, { view }); hid.push(as(m)); } }
        else if (m.type === 'frame') { tx.note('Frame', m.output, undefined, { view }); hid.push(as(m)); }
        else if (m.geometry === 'legend' && rowKey) { tx.update(id, { hide: [...m.hide, rowKey] }); hid.push({ type: 'row', name: m.rows.find(x => x.key === rowKey)?.caption.text }); }
        else if (m.geometry === 'group') { tx.remove(id); for (const x of m.members) if (scene.byId.get(x)?.type === 'shape') tx.remove(x); gone.push(as(m)); }
        // (The footer's the chart's, on every page: taken off one by one, as Page setup does.)
        else if (footOf(m)) { if (marks.length === 1 || marks.every(([, , x]) => footOf(x))) { unfoot(tx, m); gone.push(as(m)); } }
        else { tx.remove(id); gone.push(as(m)); }
      }
    };
    if (doomed.length) return App.deleting(doomed.map(m => m.record), counted(doomed.map(m => as(m))), { source: 'chart', auto: true, also: rest, done: () => Shell.select([]) });
    const c = App.change(rest, { say: () => said(hid, gone, view) });
    if (c) Shell.select([]);
    else if (worked.length) Shell.toast(worked.length > 1 ? 'Formulas work these out' : 'A formula works this out');
  }
  const SHAPE = { text: 'text box', legend: 'key', picture: 'picture', line: 'line', group: 'group', frame: 'frame', table: 'table', freeform: 'freeform' };
  // A line by its relation, at its place (Notes.segmentOf), as History and the formula bar say it: Ownership: The BDC →
  // Northpine Software, LLC.
  const lineOf = id => { const N = App.notes.peek(), st = App.state.peek(); return `${N.nameOf(st, id)}: ${N.segmentOf(st, id)}`; };
  const called = m => m.type === 'box' ? nameOf(m.record) : m.type === 'line' ? lineOf(m.record) : m.type === 'frame' ? `the ${m.caption.text} frame`
    : m.role === 'footer' ? 'the footer' : m.role === 'number' ? 'the page number' : m.role === 'footnotes' ? 'the footnotes' : m.name ?? `the ${SHAPE[m.geometry] ?? 'shape'}`;
  const counted = ms => ms.length === 1 ? ms[0].name : ms.every(m => m.type === 'box') ? `${ms.length} boxes` : ms.every(m => m.type === 'line') ? `${ms.length} lines` : `${ms.length} items`;
  function said(hid, gone, view) {
    const rows = hid.filter(m => m.type === 'row'), marks = hid.filter(m => m.type !== 'row');
    const parts = [marks.length && `hid ${counted(marks)} in ${viewName(view)}`, rows.length && `hid ${counted(rows)} in the key`, gone.length && `deleted ${counted(gone)}`].filter(Boolean);
    const s = parts.join(' and ');
    return s && s[0].toUpperCase() + s.slice(1);
  }
  // Show only these: what's lit, the group a Styles row or the scope has lit, or else the boxes selected. It's a look (dendra.md,
  // Workbook), a state with a way back: the band says it, with Show all, and Keep makes it the page's.
  const onlyThese = () => { const lit = FormatBar.lit?.(), by = App.page.peek() ?? scene; return lit?.marks?.size ? [...(FormatBar.litOn?.(lit, by) ?? lit.marks)].map(id => by.byId.get(id) ?? scene.byId.get(id)).filter(m => m?.type === 'box') : placeable().filter(m => m.type === 'box'); };
  const canShowOnly = () => !!scene && App.canAsk() && onlyThese().length > 0;
  function showOnly() {
    const ms = onlyThese(), view = viewOf(), by = App.page.peek() ?? scene, keep = new Set(ms.map(m => m.id));
    if (!ms.length) return;
    if (!by.marks.some(m => m.type === 'box' && !m.revealed && !keep.has(m.id))) return Shell.toast('These are all the boxes there are', { ms: 2500 });
    App.showOnly(view, ms.map(m => m.record), `Showed only ${ms.length === 1 ? called(ms[0]) : `these ${ms.length} boxes`}`);
    FormatBar.aim?.(null);
  }
  // Filter…: by what a chart knows of each box, as a table's filter is by what its columns hold: first what by, then its values
  // ticked, with how many of each. A look: said by the band, with Show all.
  const FIELD_MAX = 3;
  function fieldsOf() {
    const st = App.state.peek(), { entries } = Tree.index(st), boxes = (App.page.peek() ?? scene).marks.filter(m => m.type === 'box' && !m.revealed), n = new Map();
    // (What's a choice or a yes-or-no first, what most boxes have, as what a chart's filtered by; what's only words after.)
    const rank = r => ('choice' in r ? 0 : 'tag' in r ? 1 : r.field === 'text' ? 3 : 2);
    const walk = (id, path, depth) => { for (const e of entries.get(id) ?? []) { const r = st[e]; if (!r?.edge || r.field === 'document') continue; const p = [...path, r.edge], k = p.join(' › '), x = n.get(k) ?? { c: 0, rank: rank(r) + (depth > 1 ? 4 : 0) }; x.c++; n.set(k, x); if (depth < FIELD_MAX) walk(e, p, depth + 1); } };
    for (const m of boxes) walk(m.record, [], 1);
    return [{ key: App.KIND, label: 'Kind' }, ...[...n].sort((a, b) => a[1].rank - b[1].rank || b[1].c - a[1].c || a[0].localeCompare(b[0])).map(([key]) => ({ key, label: key }))];
  }
  function filter(anchor) {
    const view = viewOf(), at = anchor ?? { x: root.getBoundingClientRect().left + 60, y: root.getBoundingClientRect().top + 40 }, on = App.lookOf(view)?.filters ?? [];
    Shell.menu(at, [...fieldsOf().map(f => ({ label: f.label, checked: on.some(x => x.key === f.key), run: () => Shell.popover(at, close => Shell.html`<${ChartFilter} view=${view} field=${f} close=${close} />`, { placement: 'bottom-start' }) })),
      ...(on.length ? ['-', { label: 'Clear filters', run: () => App.showAll(view) }] : [])], { search: true });
  }
  // What's copied is marks of one view, and their names: pasting a box shows it where it was in the chart, a
  // shape is copied.
  let clip = null;
  const marksNow = () => ({ view: viewOf(), items: placeable().map(m => m.type === 'box' ? { box: m.record, x: m.x - origin().x, y: m.y - origin().y, w: m.w } : { row: rowOf(m.id) }).filter(x => x.box || x.row) });
  function copy() {
    const c = marksNow();
    if (!c.items.length) return false;
    clip = { ...c, text: c.items.map(it => it.box ? nameOf(it.box) : it.row.text || SHAPE[it.row.geometry] || 'shape').join('\n') };
    return true;
  }
  // A copy from the menu puts the names on the system's clipboard too, as it can.
  const copyOut = () => { if (field ? copyField(fieldNow()) : copy()) navigator.clipboard?.writeText(clip.text).catch(() => {}); };
  // A field copied is its entry, by its label, or a free text's words: pasted on a box, the box shows its own entry of
  // that label, as a form's field shows its record's, or the same words, at the scope (see Fields). Its text is what
  // the system's clipboard holds of it.
  function copyField(f, text = f?.it.text) {
    if (!f?.it) return false;
    clip = { items: [], text: text ?? '', ...(f.it.free ? { free: f.it.free.text } : { field: fieldName(f.it) }) };
    return true;
  }
  function paste(c = clip) {
    if (c?.field || c?.free !== undefined) {
      const ms = selected().filter(m => m.type === 'box' || m.type === 'line'), s = scopeNow(canvas), view = viewOf();
      if (c.field) return setField(ms, c.field, true, s);
      return ms.length && App.change(tx => ms.forEach(m => (s.own ? [treeOf(m.record)] : s.outputs).forEach(p => tx.note('Text', p, { text: c.free }, { view }))),
        { dated: false, say: `Added text to ${whereSaid(ms, s)}` });
    }
    if (!c?.items.length) return;
    const view = viewOf(), here = view === c.view, ids = [];
    App.change(tx => {
      for (const it of c.items) {
        if (it.box) {
          const t = treeOf(it.box);
          if (!t) continue;
          tx.note('Shown', t, scene.byId.has(it.box) ? undefined : true, { view });
          if (!here || !scene.byId.has(it.box)) tx.note('Position', t, { x: it.x, y: it.y, w: it.w }, { view });
          ids.push(it.box);
        } else {
          // Pasted in its own view, a shape lands a step down and right of the last copy, as PowerPoint's do.
          const d = here ? 12 : 0;
          it.row = { ...it.row, x: it.row.x + d, y: it.row.y + d, ...(it.row.points && { points: it.row.points.map(([x, y]) => [x + d, y + d]) }) };
          ids.push(tx.add('shape', { ...it.row, view }));
        }
      }
    });
    Shell.select(ids);
  }
  // Ctrl+D: a shape copied a step down and right; a box, a new record of its kind with its look, named as it's typed (see Drawing), leaving the clipboard as it was.
  const duplicate = () => hand.duplicate();
  const nudge = (dx, dy) => moveTo(new Map(placeable().map(m => [m.id, { x: m.x + dx, y: m.y + dy, ...(m.points && { dx, dy }) }])));
  // The arrow keys nudge: one after another, of one selection, they're one change, as History lists it. The marks move
  // at once, as a drag moves them, and the change is made as the nudging stops: a moment after the last, or as anything
  // else is done (another key, a click, another selection).
  let run = null;
  function nudging(dx, dy) {
    const ms = placeable(), key = ms.map(m => m.id).join();
    if (still() || !ms.length) return nudge(dx, dy);
    if (run && run.key !== key) nudged();
    run ??= { key, ms, dx: 0, dy: 0, timer: 0 };
    run.dx += dx; run.dy += dy;
    showHandles(null);
    graph.batchUpdate(() => { for (const m of ms) graph.getCellById(m.id)?.translate(dx, dy); });
    for (const m of ms) { const c = graph.getCellById(m.id); if (c?.isNode()) follow(c); else astray(m.id); }
    clearTimeout(run.timer);
    run.timer = setTimeout(nudged, 600);
  }
  function nudged() {
    const r = run;
    if (!r) return;
    run = null;
    clearTimeout(r.timer);
    moveTo(new Map(r.ms.map(m => [m.id, { x: m.x + r.dx, y: m.y + r.dy, ...(m.points && { dx: r.dx, dy: r.dy }) }])));
  }
  const nudgeEnds = e => { if (run && !(e.type === 'keydown' && /^(Arrow|Shift|Control|Meta)/.test(e.key))) nudged(); };
  addEventListener('keydown', nudgeEnds, true);
  addEventListener('pointerdown', nudgeEnds, true);
  const stopNudge = Shell.on('select', () => nudged());
  function align(how) {
    const ms = placeable();
    if (still()) return Shell.toast(App.whyNot());
    if (!ms.length) return;
    const one = ms.length === 1, b = one ? { x: 0, y: 0, r: scene.page.w, d: scene.page.h }
      : { x: Math.min(...ms.map(m => m.x)), y: Math.min(...ms.map(m => m.y)), r: Math.max(...ms.map(m => m.x + m.w)), d: Math.max(...ms.map(m => m.y + m.h)) };
    const at = m => ({ left: { x: b.x }, center: { x: (b.x + b.r - m.w) / 2 }, right: { x: b.r - m.w }, top: { y: b.y }, middle: { y: (b.y + b.d - m.h) / 2 }, bottom: { y: b.d - m.h } })[how];
    // (With nothing to do, it says so; a change writes nothing and shows nothing.)
    if (ms.every(m => { const p = { x: m.x, y: m.y, ...at(m) }; return Math.abs(p.x - m.x) < 0.5 && Math.abs(p.y - m.y) < 0.5; })) return Shell.toast('Already aligned', { ms: 2500 });
    moveTo(new Map(ms.map(m => { const p = { x: m.x, y: m.y, ...at(m) }; return [m.id, { ...p, ...(m.points && { dx: p.x - m.x, dy: p.y - m.y }) }]; })));
  }
  function distribute(axis) {
    const ms = placeable();
    if (still()) return Shell.toast(App.whyNot());
    if (ms.length < 3) return;
    const [pos, size] = axis === 'down' ? ['y', 'h'] : ['x', 'w'];
    const sorted = [...ms].sort((a, b) => a[pos] - b[pos]), first = sorted[0], last = sorted[sorted.length - 1];
    const gap = (last[pos] + last[size] - first[pos] - sorted.reduce((s, m) => s + m[size], 0)) / (ms.length - 1);
    let at = first[pos];
    const places = new Map();
    for (const m of sorted) { places.set(m.id, { x: m.x, y: m.y, [pos]: at }); at += m[size] + gap; }
    if (sorted.every(m => Math.abs(places.get(m.id)[pos] - m[pos]) < 0.5)) return Shell.toast('Already evenly spaced', { ms: 2500 });
    moveTo(places);
  }
  function match(dim) {
    const ms = placeable();
    if (ms.length < 2) return;
    // (As the one first selected, and it says so.)
    const key = dim === 'width' ? 'w' : 'h', v = ms[0][key], rest = ms.filter(m => Math.abs(m[key] - v) > 0.25), word = dim === 'width' ? 'wide' : 'tall';
    if (still()) return Shell.toast(App.whyNot());
    if (!rest.length) return Shell.toast(`Already as ${word} as each other`, { ms: 2500 });
    App.change(tx => place(tx, new Map(rest.map(m => [m.id, { x: m.x, y: m.y, ...(dim === 'width' ? { w: v } : { h: v }) }]))), { say: `Made ${rest.length === 1 ? called(rest[0]) : `${rest.length} ${rest.every(m => m.type === 'box') ? 'boxes' : 'items'}`} as ${word} as ${called(ms[0])}` });
    spilt(rest.map(m => m.id));
  }
  // What a hand has made too small for its words says so: they're never broken mid-word to fit, nor shrunk where it isn't asked.
  function spilt(ids) {
    const sp = ids.map(id => App.scene.peek()?.byId.get(id)).filter(m => m?.spills);
    if (sp.length) Shell.toast(`${sp.length === 1 ? `${called(sp[0])}: its text runs` : `${sp.length} of them: their text runs`} out at that size`, { ms: 4000 });
  }
  function order(how) {
    const ms = selected().filter(m => m.type !== 'frame' && m.geometry !== 'group').concat(selected().filter(m => m.geometry === 'group').flatMap(g => g.members.map(id => scene.byId.get(id)).filter(Boolean)));
    if (still()) return Shell.toast(App.whyNot());
    if (!ms.length) return;
    // One order over everything drawn (dendra.md, Layers). What it would go past, or nothing: then it says so, and nothing's written.
    const layer = m => m.settings?.Layer?.value ?? m.look?.Layer ?? 0, view = viewOf(), all = scene.marks.filter(m => m.geometry !== 'group'), them = new Set(ms.map(m => m.id));
    const up = how === 'front' || how === 'forward', at = m => all.indexOf(m), rest = all.filter(m => !them.has(m.id));
    const past = up ? rest.filter(o => ms.some(m => at(o) > at(m))) : rest.filter(o => ms.some(m => at(o) < at(m)));
    const rectOf = m => m.points ? extent([m]) : m;
    const meets = (a, b) => { const [p, q] = [rectOf(a), rectOf(b)]; return p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h; };
    if (!past.length) return Shell.toast(up ? 'Already at the front' : 'Already at the back', { ms: 2500 });
    const top = Math.max(...all.map(layer)), bottom = Math.min(...all.map(layer));
    // (Forward and backward go past the next it overlaps, or the next there is: a layer's a layer, so what's level is gone past by one.)
    const near = past.filter(o => ms.some(m => meets(o, m))), by = up ? Math.min(...(near.length ? near : past).map(layer)) : Math.max(...(near.length ? near : past).map(layer));
    const said = `${up ? 'Brought' : 'Sent'} ${ms.length === 1 ? called(ms[0]) : `${ms.length} items`} ${{ front: 'to front', back: 'to back', forward: 'forward', backward: 'backward' }[how]}`;
    App.change(tx => {
      for (const m of ms) {
        const v = how === 'front' ? top + 1 : how === 'back' ? bottom - 1 : up ? Math.max(layer(m), by) + 1 : Math.min(layer(m), by) - 1;
        if (m.type === 'shape') tx.update(m.id, { format: { ...rowOf(m.id).format, Layer: v } });
        else tx.note('Layer', treeOf(m.record), v, { view });
      }
    }, { say: near.length ? said : `${said}; it overlaps nothing there, so nothing shows`, dated: false });
  }
  function group() {
    const ms = placeable();
    if (ms.length < 2) return;
    let id = null;
    App.change(tx => {
      for (const g of groups()) if (g.members.some(x => ms.some(m => m.id === x))) tx.remove(g.id);
      id = tx.add('shape', { view: viewOf(), geometry: 'group', members: ms.map(m => m.id) });
    });
    if (id) Shell.select([id]);
  }
  function ungroup() {
    const gs = selected().filter(m => m.geometry === 'group');
    if (gs.length && App.change(tx => gs.forEach(g => tx.remove(g.id)))) Shell.select(gs.flatMap(g => g.members));
  }
  // Tidy (dendra.md, The layout): the boxes selected, or with none, the view's. Each one's place goes, but for where it
  // stands across, its `order` among what's beside it, which the layout keeps; and with none selected, a label's place
  // goes too, and the view is framed on its page again, as it opens. Boxes selected are tidied `around` what stands,
  // which stays where it is, those the layout placed kept where they're drawn. What it lays out is entered, by the same
  // change, each place still saying `order` (so History says Tidy): every box stands where Tidy drew it, on every day shown
  // after. `tidied` is the workbook as the layout finds it for Tidy, which a preview draws; `tidyName`, what it's called, by which.
  const placedHere = () => [...App.notes.peek().notes('Position'), ...App.notes.peek().notes('Bend')].filter(n => n.view === viewOf());
  const scaleHere = () => App.notes.peek().notes('Scale').filter(n => n.pattern.id === viewOf());
  // (Two or more: one box selected is only what was last worked on, and Tidy is of the page.)
  const tidyBoxes = () => { const base = App.scene.peek(), ms = !base || !scene ? [] : placeable().filter(m => m.type === 'box').map(m => base.byId.get(m.id)).filter(Boolean); return ms.length > 1 ? ms : []; };
  const tidySaid = n => `${n} box${n === 1 ? '' : 'es'}`;
  const tidyName = () => { const n = tidyBoxes().length; return n > 1 ? `Tidy ${tidySaid(n)}` : pinnedHere().size ? 'Tidy around what’s pinned' : 'Tidy'; };
  const pinnedHere = () => new Set(App.notes.peek().notes('Pinned').filter(p => p.view === viewOf() && p.value === true && p.pattern.id).map(p => p.pattern.id));
  // Whether there's anything to tidy: a selection; with none, a place other than Tidy gave, a box drawn beside Tidy's with none, or a Key over a box: one in a corner Tidy sets the chart clear of, and one a hand put there it gives back to the page.
  const saysKeyOver = sc => Scene.says(sc).some(t => t.startsWith('The Key overlaps'));
  const tidyable = () => { const ns = placedHere(), byTidy = n => Number.isFinite(n.value?.order), key = App.scene.peek()?.marks.find(m => m.geometry === 'legend');
    return !!tidyBoxes().length || ns.some(n => (Number.isFinite(n.value?.x) && !byTidy(n)) || Number.isFinite(n.value?.along) || n.label === 'Bend') || (ns.some(byTidy) && !!App.scene.peek()?.marks.some(m => m.type === 'box' && !m.entered && !m.revealed))
      || (!!key && (!!rowOf(key.id)?.corner || Number.isFinite(rowOf(key.id)?.x)) && saysKeyOver(App.scene.peek())); };
  // Whether the page has yet to be arranged, nobody having placed a box and Tidy not having been: what's across is then the order they were made in, of no one's choosing, and Tidy is free of it.
  const firstTidy = () => !tidyBoxes().length && !placedHere().some(n => n.label === 'Position' && (Number.isFinite(n.value?.order) || (Number.isFinite(n.value?.x) && !n.value?.kept)));
  // (`only`: one box of its own, as its Reset is.)
  function tidying(only) {
    const base = App.scene.peek(), some = only ? [base.byId.get(only)].filter(Boolean) : tidyBoxes(), writes = new Map();
    for (const m of some.length ? some : base.marks.filter(m => m.type === 'box' && !m.revealed)) writes.set(m.record, { order: round(m.x), ...(some.length && { around: true }) });
    if (some.length) for (const [id, p] of holdsOf(base)) if (!writes.has(id) && treeOf(id)) writes.set(id, p);
    const ws = [...writes].map(([id, value]) => ({ id, t: treeOf(id), value })).filter(w => w.t), keys = new Set(ws.map(w => Tree.key(w.t)));
    // (Tidy places the Key afresh, as it does the chart.)
    const drawn = base.marks.find(m => m.geometry === 'legend'), freed = !some.length && !!drawn && !drawn.byPage && Number.isFinite(rowOf(drawn.id)?.x) && saysKeyOver(base);
    const key = !some.length && (freed || (drawn?.byPage && rowOf(drawn.id)?.kept)) ? drawn : null;
    // (A line's bend goes with what it's bent among: all of them, or those of the boxes tidied. And all of them, the scale, set afresh.)
    const these = new Set(some.map(m => m.record)), bentHere = n => n.label === 'Bend' && [...Tree.idsIn(n.pattern)].some(id => these.has(id));
    return { writes: ws, gone: some.length ? placedHere().filter(bentHere) : [...placedHere().filter(n => !keys.has(Tree.key(n.pattern))), ...scaleHere()], n: some.length, key: key?.id, freed };
  }
  let triedTidy = 0;
  function tidied(only, over = false) {
    const { writes, gone, key, freed, n } = tidying(only), wb = App.shown.peek(), view = viewOf(), out = new Set(gone.map(n => n.note)), keys = new Set(writes.map(w => Tree.key(w.t)));
    // (Boxes laid out around what stands go around the Key too, where it's drawn.)
    const standing = n ? App.scene.peek().marks.find(m => m.geometry === 'legend') : null;
    // (Each note tried is new, as a look tried is, so nothing worked out from another is kept for it.)
    const rows = [...wb.rows(App.chart.peek()).filter(r => !out.has(r.note) && !(r.label === 'Position' && r.view === view && keys.has(Tree.key(r.pattern)))).map(r => key && r.shape === key ? { ...r, kept: null, ...(freed && { x: null, y: null }) } : standing && r.shape === standing.id && r.x == null ? { ...r, x: standing.x - 16, y: standing.y - 16, w: standing.w + 32, h: standing.h + 32 } : r),
      ...(!only && firstTidy() ? [] : writes.map(w => { const id = `·tidy${++triedTidy}`; return { id, note: id, label: 'Position', pattern: w.t, view, value: w.value }; }))];
    const notes = Notes.index(rows.filter(r => 'note' in r));
    const wbTried = { ...wb, rows: () => rows, notes: () => notes, tidy: tidyName() };
    // (And in its preview, as in the change, what's laid over a box goes with it: see Scene.annotated.)
    if (!over && App.scene.peek()?.marks.some(m => m.type === 'shape' && !m.role && m.geometry !== 'legend' && m.geometry !== 'group')) {
      const moved = Scene.annotated(App.scene.peek(), Scene.of(wbTried, App.chart.peek(), view, App.scene.peek().day, { state: App.state.peek(), computed: App.computed.peek(), ahead: true })).rows;
      if (moved.size) { const seen = rows.map(r => moved.has(r.shape) ? { ...r, ...moved.get(r.shape) } : r); return { ...wbTried, rows: () => seen }; }
    }
    return wbTried;
  }
  function tidy(o) {
    const { writes, gone, n, freed } = tidying(o?.only), view = viewOf(), base = App.scene.peek();
    // (What its preview draws, entered: the place of each box it lays out, in a place's terms, and the Key where it set it.)
    const after = Scene.of(tidied(o?.only, true), App.chart.peek(), view, base.day, { state: App.state.peek(), computed: App.computed.peek(), ahead: true }), laid = holdsOf(after), keyId = !n && base.marks.find(m => m.geometry === 'legend' && (m.byPage || freed))?.id;
    const first = !o?.only && firstTidy();
    // What's pinned stands where it stood on the sheet, the rest laid out as ever (dendra.md, Measured and pinned): the chart is laid out whole, and it's put back.
    const pins = !o?.only && !tidyBoxes().length ? pinnedHere() : new Set(), oAfter = after.page.placed ? after.page.offset : { x: 0, y: 0 }, k = base.page.scale / after.page.scale;
    const pinnedAt = id => { const m = base.marks.find(q => q.type === 'box' && q.record === id); return m && { x: round(m.x * k - oAfter.x), y: round(m.y * k - oAfter.y), w: round(m.w * k), h: round(m.h * k) }; };
    const entered = w => { if (pins.has(w.id)) return pinnedAt(w.id) ?? w.value; if (!Number.isFinite(w.value.order) || !laid.has(w.id)) return w.value; const { kept, ...p } = laid.get(w.id); return { ...p, ...w.value, ...(pins.size ? { order: undefined } : {}), ...(first && !pins.size && { order: p.x }) }; };
    // What's laid over a box goes with it; what's tied to nothing stays, which is said.
    const ann = Scene.annotated(base, after), stays = n || !ann.stay.length ? '' : `; ${ann.stay.length === 1 ? `${called(ann.stay[0])} stays where it was: it’s on no box` : `${ann.stay.length} shapes stay where they were: they’re on no box`}`;
    if (!App.change(tx => { gone.filter(g => g.label !== 'Scale').forEach(g => tx.remove(g.note)); writes.forEach(w => tx.note('Position', w.t, entered(w), { view })); if (keyId) tx.update(keyId, { kept: laid.get(keyId) ?? null, ...(freed && { x: null, y: null }) }); if (!n) tx.note('Scale', { id: view, kind: 'View' }, laid.page); for (const [id, c] of ann.rows) tx.update(id, c); }, { say: o?.say ?? `${n ? `Tidied ${tidySaid(n)}` : 'Tidied the layout'}${stays}`, keep: false, dated: false })) return;
    if (n) return;
    framed = true; left = null;
    settle();
  }

  // Tidy for every date: every box the view draws on any day laid out as one chart, those places entered, so each day shows
  // its boxes in one set of places, and only what changed moves. What it reads: the chart's records of every day there's a
  // different set of them, each as of the last of them; less a line that skips what's between its ends on no day it holds with
  // it (Fund III's to the Blocker, before Holdco came between them), which runs straight through its empty place on those days,
  // and ranks nothing here. `every` is the scene that is, kept while the workbook stands.
  let everyKept = null;
  function everyDay() {
    const wb = App.shown.peek(), c = App.chart.peek(), view = viewOf(), k = `${App.version.peek()}|${view}`;
    if (everyKept?.k === k) return everyKept.sc;
    const days = new Set([App.day.peek()]);
    for (const r of wb.rows(c)) if ('record' in r) { if (r.since) days.add(r.since); if (r.before) days.add(r.before); if (r.field === 'date' && typeof r.value === 'string') days.add(r.value); }
    const seen = new Set(), states = [];
    for (const d of [...days].sort()) {
      const key = Object.keys(wb.asOf(c, d)).sort().join();
      if (seen.has(key)) continue;
      seen.add(key);
      states.push(d === App.day.peek() ? App.state.peek() : App.workOn(d).records);
    }
    const union = Object.assign({}, ...states), computed = App.computed.peek();
    // (Without the notes that place anything, or the scale, as Tidy lays it out.)
    const placed = new Set([...placedHere(), ...scaleHere()].map(n => n.note)), rows = wb.rows(c).filter(r => !placed.has(r.note)).map(r => r.geometry === 'legend' && r.kept ? { ...r, kept: null } : r), notes = Notes.index(rows.filter(r => 'note' in r)), bare = { ...wb, rows: () => rows, notes: () => notes };
    const lay = st => Scene.of(bare, c, view, App.day.peek(), { state: st, computed, ahead: true });
    let sc = lay(union);
    // A line skips what's between its ends where another way runs from one to the other, by boxes none of which holds with it on any day.
    const lines = sc.marks.filter(m => m.type === 'line').flatMap(l => l.merged ? [] : [l]), downs = new Map();
    for (const l of lines) (downs.get(l.from) ?? downs.set(l.from, []).get(l.from)).push(l);
    const skips = lines.filter(l => {
      const on = states.filter(st => st[l.record]), withIt = id => on.some(st => st[id]);
      const walk = (at, seenBy) => (downs.get(at) ?? []).some(n => n !== l && n.to !== l.from && !seenBy.has(n.to) && (n.to === l.to ? at !== l.from : !withIt(n.to) && walk(n.to, new Set([...seenBy, n.to]))));
      return walk(l.from, new Set([l.from]));
    });
    if (skips.length) { const drop = new Set(skips.map(l => l.record)), st = { ...union }; for (const id of Object.keys(st)) if (drop.has(id) || drop.has(st[id].at)) delete st[id]; sc = lay(st); }
    return (everyKept = { k, sc, union }).sc;
  }
  function everyWrites() {
    const sc = everyDay(), laid = holdsOf(sc), union = everyKept.union, ws = [];
    for (const [id, p] of laid) { const t = Tree.treeOf(union, id); if (t) { const { kept, ...at } = p; ws.push({ t, value: { ...at, order: at.x, every: true } }); } }
    return { ws, key: sc.marks.find(m => m.geometry === 'legend' && m.byPage)?.id, keyAt: laid };
  }
  function tidiedEvery() {
    const { ws, key, keyAt } = everyWrites(), wb = App.shown.peek(), view = viewOf(), out = new Set([...placedHere(), ...scaleHere()].map(n => n.note));
    const rows = [...wb.rows(App.chart.peek()).filter(r => !out.has(r.note)).map(r => key && r.shape === key ? { ...r, kept: keyAt.get(key) } : r),
      ...ws.map(w => { const id = `·tidy${++triedTidy}`; return { id, note: id, label: 'Position', pattern: w.t, view, value: w.value }; }),
      // (Every date at the one scale, that holds them all: not as large as the day shown would be alone.)
      { id: `·tidy${++triedTidy}`, note: `·tidy${triedTidy}`, label: 'Scale', pattern: { id: view, kind: 'View' }, value: keyAt.page }];
    const notes = Notes.index(rows.filter(r => 'note' in r));
    return { ...wb, rows: () => rows, notes: () => notes, tidy: 'Tidy for every date' };
  }
  function tidyEvery() {
    if (still()) return Shell.toast(App.whyNot());
    const { ws, key, keyAt } = everyWrites(), view = viewOf(), out = placedHere();
    if (!App.change(tx => { out.forEach(n => tx.remove(n.note)); ws.forEach(w => tx.note('Position', w.t, w.value, { view })); if (key) tx.update(key, { kept: keyAt.get(key) ?? null }); tx.note('Scale', { id: view, kind: 'View' }, keyAt.page); }, { say: 'Tidied the layout for every date', keep: false, dated: false })) return;
    framed = true; left = null;
    settle();
  }

  // ---- Keeping: a change made while the chart is shown keeps where they're drawn the boxes it doesn't place itself,
  // those the layout placed (and one made loosely that stands, though related), entering each where it stands, as
  // `kept`. So a change moves only what it touches: a box added goes beside its relatives, and nothing else moves. A
  // change pending is drawn so, as making it will draw it (see show) ----
  // (In a chart placed, each where the layout put it among the places entered, in their terms: not where the room their
  // lanes took moved it with them, which drawing it again gives it again. In one the layout alone placed, where it's drawn.)
  function holdsOf(base) {
    const o = origin(base.page), out = new Map();
    for (const m of base.marks) if (m.type === 'box' && !m.placed && !m.revealed) {
      const [x, y] = base.page.placed && m.laid ? [m.laid.x, m.laid.y] : [m.x - o.x, m.y - o.y];
      // (A box of a design has the design's size: its own isn't kept, so it goes back to what it was with the design taken away.)
      out.set(m.record, { x: round(x), y: round(y), ...(!m.design && { w: round(m.w) }), kept: true });
    }
    // And the Key the page placed, where it's drawn on the sheet, so it keeps its corner as the chart is edited.
    const key = base.marks.find(m => m.geometry === 'legend' && m.byPage), s = base.page.scale;
    if (key) out.set(key.id, { x: round(key.x * s), y: round(key.y * s) });
    // And the scale it's drawn at, and how far the page has moved it (a kept note; see Scene's furnish).
    out.page = { scale: s, x: o.x, y: o.y };
    return out;
  }
  const stopKeep = App.keeping(tx => {
    const base = App.scene.peek();
    if (!base || still() || active.peek() !== canvas || base.view !== viewShown || Shell.view.peek() !== base.view || !root.clientWidth) return;
    const view = base.view, holds = holdsOf(base), at = { id: view, kind: 'View' };
    if (JSON.stringify(tx.noteAt('Scale', at)?.value) !== JSON.stringify(holds.page)) tx.note('Scale', at, holds.page);
    const placed = placedNow, done = baked;
    placedNow = new Set();
    baked = null;
    for (const [id, p] of holds) {
      if (placed.has(id)) continue;
      const t = treeOf(id);
      if (!t) { const was = rowOf(id)?.kept; if (rowOf(id) && (was?.x !== p.x || was?.y !== p.y)) tx.update(id, { kept: p }); continue; }
      const old = tx.noteAt('Position', t, { view })?.value;
      if (tx.item(id).length && !done?.has(id) && (old?.loose ?? true)) tx.note('Position', t, { ...p, ...(old?.h != null && { h: old.h }) }, { view });
    }
  });

  // ---- Zoom: the levels, and framing. A view opens on its whole page, as PowerPoint opens a slide, and Fit
  // (Shift+1) and Tidy frame it so again. Only they, and the zoom, change it: the chart holds still as it's edited,
  // the window or the page changing size (see draw). What's brought on screen is scrolled to, never zoomed to. A
  // canvas that can't be seen (a table shown, the inspector widened) is never measured or moved: it's framed, or put
  // back as it was left, once it's seen again (`owed`); and one framed is framed again as the window changes size
  // while the chart is as it was framed (`framedFor`), as the window settles round it ----
  let framed = true, left = null, quiet = false, owed = true, framedFor = null;
  const quietly = fn => { quiet = true; try { fn(); } finally { quiet = false; } onScreen(); };
  const seen = () => { screen = { w: root.clientWidth, h: root.clientHeight }; return screen.w > 0 && screen.h > 0; };
  const LEVELS = [0.05, 0.1, 0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.25, 1.5, 2, 3, 4];
  const extent = ms => {
    const ext = ms.flatMap(m => m.points ? m.points.map(([x, y]) => ({ x, y, w: 0, h: 0 })) : [m]), x = Math.min(...ext.map(m => m.x)), y = Math.min(...ext.map(m => m.y));
    return { x, y, w: Math.max(...ext.map(m => m.x + m.w)) - x, h: Math.max(...ext.map(m => m.y + m.h)) - y };
  };
  // Shows a rect as large as fits within pad of the edges, between lo and hi: in the middle; or, where
  // it's too big, from its top left.
  function showRect(r, pad, lo, hi) {
    const W = root.clientWidth, H = root.clientHeight;
    const s = clamp(Math.min((W - 2 * pad) / Math.max(1, r.w), (H - 2 * pad) / Math.max(1, r.h)), lo, hi);
    const at = (x, w, room) => Math.round(w * s > room - 2 * pad ? pad - x * s : (room - w * s) / 2 - x * s);
    quietly(() => { graph.zoomTo(s); graph.translate(at(r.x, r.w, W), at(r.y, r.h, H)); });
    zoomRead();
  }
  // The view as it's to be, once it can be seen: as it was left, or framed on its page.
  function settle() {
    owed = true;
    if (!scene || !seen()) return;
    const p = scene.page;
    owed = false;
    if (left) { const z = left; left = null; quietly(() => { graph.zoomTo(z.s); graph.translate(z.t.tx, z.t.ty); }); zoomRead(); }
    else if (framed) { showRect({ x: 0, y: 0, w: p.w, h: p.h }, Math.round(clamp(Math.min(root.clientWidth, root.clientHeight) * 0.03, 12, 28)), LEAST, 2); framedFor = scene; }
  }
  function zoom(k) {
    if (!scene) return;
    const was = aboutToGlide();
    if (k === 'fit') { framed = true; left = null; settle(); return glide(was); }
    if (!seen()) return;
    const s = pageScale();
    if (k === 'in' || k === 'out') {
      // Through a level, about what's selected, or else the middle of what's on screen, so what was looked at is still looked at.
      const z = graph.zoom() / s, next = k === 'in' ? LEVELS.find(v => v > z + 0.001) ?? 4 : [...LEVELS].reverse().find(v => v < z - 0.001) ?? LEVELS[0];
      const ms = selected(), e = ms.length ? extent(ms) : null, r = root.getBoundingClientRect();
      const c = e ? { x: e.x + e.w / 2, y: e.y + e.h / 2 } : graph.clientToLocal(r.left + r.width / 2, r.top + r.height / 2), was = graph.localToGraph(c.x, c.y);
      graph.zoomTo(next * s);
      const now = graph.localToGraph(c.x, c.y), t = graph.translate();
      graph.translate(t.tx + was.x - now.x, t.ty + was.y - now.y);
    } else graph.zoomTo(k * s);
    zoomRead();
    glide(was);
  }
  // The whole page glides from where it was, as what's on it travels, where only the view of it changes: a zoom asked for, or what's
  // brought on screen. (The wheel is a hand on it, and goes as the hand does.)
  const aboutToGlide = () => ({ s: graph.zoom(), t: graph.translate() });
  function glide(was) {
    const s = graph.zoom(), t = graph.translate();
    if (reduced.matches || flight || landing || root.closest('[hidden]') || graph.getCells().length > FLIGHT || (s === was.s && t.tx === was.t.tx && t.ty === was.t.ty)) return;
    const a = viewport.animate([{ transform: `translate(${was.t.tx}px, ${was.t.ty}px) scale(${was.s})` }, { transform: `translate(${t.tx}px, ${t.ty}px) scale(${s})` }], TRAVEL), mine = flight = { anims: [a], rects: new Map(), lines: new Map() };
    root.classList.add('flying');
    const done = () => { if (flight === mine) { flight = null; root.classList.remove('flying'); } };
    a.finished.then(done, () => {});
  }
  const resized = new ResizeObserver(() => { showHandles(null); seen(); if (owed || (framed && scene === framedFor)) settle(); onScreen(); });
  resized.observe(root);
  // Brings marks on screen at the zoom the view is at, as Excel's Go To scrolls to a cell: by the least that
  // shows them all, or the first of them where they don't all fit, or its top left where it's larger than the
  // window. Where they're on screen, nothing moves. The formula bar brings a reason it steps down to so.
  function bring(ms, pad = 24) {
    if (!ms.length || !(screen.w || seen())) return;
    const W = screen.w, H = screen.h, z = graph.zoom(), all = extent(ms);
    const r = all.w * z <= W - 2 * pad && all.h * z <= H - 2 * pad ? all : extent(ms.slice(0, 1));
    const a = graph.localToGraph(r.x, r.y), b = graph.localToGraph(r.x + r.w, r.y + r.h);
    const into = (lo, hi, room, top = pad) => lo < top ? top - lo : hi > room - pad ? Math.max(top - lo, room - pad - hi) : 0;
    // (Clear of the formula bar, over the chart's top as what's brought is selected.)
    const dx = into(a.x, b.x, W), dy = into(a.y, b.y, H, Math.max(pad, 44)), t = graph.translate();
    if (dx || dy) { const was = aboutToGlide(); graph.translate(t.tx + dx, t.ty + dy); glide(was); }
  }

  // Tab and Shift+Tab select the next box and the one before, in reading order (by rows, top down, then
  // left to right), as PowerPoint's step through its shapes. Esc lets go of a box and not the place: the next goes on from the one
  // it let go of (`walked`), while nothing else has been selected.
  let walked = null;
  const hereNow = () => keysOfSelection()[0] ?? walked;
  const stopWalk = Shell.on('select', keys => { if (keys.length) walked = null; });
  function next(by) {
    const rows = [];
    for (const b of scene.marks.filter(m => m.type === 'box').sort((a, b) => a.y - b.y)) {
      const r = rows.at(-1);
      if (r && b.y < r[0].y + r[0].h / 2) r.push(b); else rows.push([b]);
    }
    const boxes = rows.flatMap(r => r.sort((a, b) => a.x - b.x)), at = boxes.findIndex(b => b.id === hereNow());
    const m = boxes.at(at < 0 ? (by > 0 ? 0 : -1) : (at + by) % boxes.length);
    if (!m) return false;
    Shell.select([m.id]);
  }
  // Ctrl+Alt+arrow goes to the box that way: of those whose middle is past this one's edge, what stands in line with it before what's off
  // to the side, the nearest first. Nothing that way, it stays. It looks, and writes nothing, where the arrows alone nudge.
  function walk(dx, dy) {
    const boxes = scene.marks.filter(m => m.type === 'box'), from = boxes.find(b => b.id === hereNow());
    if (!from) return next(1);
    const off = (a0, a1, b0, b1) => Math.max(0, Math.max(a0, b0) - Math.min(a1, b1));
    let best = null, least = Infinity;
    for (const b of boxes) {
      if (b === from) continue;
      const mx = b.x + b.w / 2, my = b.y + b.h / 2, ahead = dx > 0 ? mx > from.x + from.w : dx < 0 ? mx < from.x : dy > 0 ? my > from.y + from.h : my < from.y;
      if (!ahead) continue;
      const along = dx ? Math.abs(mx - (from.x + from.w / 2)) : Math.abs(my - (from.y + from.h / 2)), side = dx ? off(from.y, from.y + from.h, b.y, b.y + b.h) : off(from.x, from.x + from.w, b.x, b.x + b.w), cost = along + side * 4;
      if (cost < least) { least = cost; best = b; }
    }
    if (best) { pickField(null); Shell.select([best.id]); }
  }

  // ---- Keys: PowerPoint's, Ctrl+[ and Ctrl+] among them for the order ----
  const keyMap = {
    // Tab steps through the boxes, or with a field selected, through its box's fields, as a form's.
    'Tab': () => fieldNow() ? stepField(1) : next(1), 'Shift+Tab': () => fieldNow() ? stepField(-1) : next(-1),
    // Delete deletes what's selected, a box or a line as a change pending (App.deleting); a field selected, it clears.
    // (Viewing, a what-if is asked for by its word; a key pressed in passing writes nothing and begins nothing.)
    'Delete': () => still() ? Shell.toast(App.whyNot()) : deleting(), 'Backspace': () => still() ? Shell.toast(App.whyNot()) : deleting(),
    // PowerPoint's: an arrow moves a step, the grid's with Snap to grid, or else 6 pt on the sheet; Ctrl+arrow 1.25 pt; Shift+arrow sizes about its middle, and with Ctrl finely; Alt+arrow
    // turns by 15 degrees what can turn (and with nothing that can, walks the trail, as it always has).
    ...Object.fromEntries([['ArrowLeft', -1, 0], ['ArrowRight', 1, 0], ['ArrowUp', 0, -1], ['ArrowDown', 0, 1]].flatMap(([k, a, b]) => {
      const coarse = () => (aids.peek().snap ? gridStep() : 8 / pageScale()), fine = () => 5 / 3 / pageScale();
      return [[k, () => nudging(a * coarse(), b * coarse())], [`$mod+${k}`, () => nudging(a * fine(), b * fine())], [`Shift+${k}`, () => hand.sizeBy(a * coarse(), -b * coarse())], [`$mod+Shift+${k}`, () => hand.sizeBy(a * fine(), -b * fine())]];
    })),
    'Alt+ArrowLeft': () => turnsNow() ? hand.turnBy(-15) : false, 'Alt+ArrowRight': () => turnsNow() ? hand.turnBy(15) : false,
    'F4': () => hand.repeat(), 'Alt+F10': () => hand.pane(),
    // The shapes' alignments have keys of their own.
    ...Object.fromEntries([['KeyL', 'left'], ['KeyE', 'center'], ['KeyR', 'right'], ['KeyT', 'top'], ['KeyM', 'middle'], ['KeyB', 'bottom']].map(([k, how]) => [`Alt+Shift+${k}`, () => align(how)])),
    '$mod+KeyA': () => { sel.reset(graph.getCells().filter(selectable)); },
    '$mod+KeyD': () => duplicate(), '$mod+KeyG': () => group(), '$mod+Shift+KeyG': () => ungroup(),
    // (With a field selected, as with text in PowerPoint, its size; with a mark, its order.)
    '$mod+BracketRight': () => fieldNow() ? FormatBar.resize?.(1) : order('forward'), '$mod+BracketLeft': () => fieldNow() ? FormatBar.resize?.(-1) : order('backward'),
    '$mod+Shift+BracketRight': () => order('front'), '$mod+Shift+BracketLeft': () => order('back'),
    'F2': () => { const f = fieldNow(); if (f) return editField(f.m, f.it); const k = keysOfSelection(); if (k.length === 1) edit(k[0]); },
    'Enter': () => { if (relateNow) return relateNow.take(); const f = fieldNow(); if (f) return editField(f.m, f.it); const k = keysOfSelection(); if (k.length !== 1) return false; edit(k[0]); },
    // Esc backs out a step: from a field to its box, from the selection to none.
    'Escape': () => { if (fieldNow()) return pickField(null); const k = keysOfSelection(); if (!k.length) return false; entered = null; Shell.select([]); walked = k[0]; },
  };
  const turnsNow = () => selected().some(m => m.geometry === 'group' || (m.type === 'shape' && !['legend'].includes(m.geometry) && !m.role));
  const wrapped = Object.fromEntries(Object.entries(keyMap).map(([k, f]) => [k, e => { if (f(e) !== false) { e.preventDefault(); e.stopPropagation(); } }]));
  const unbind = tinykeys.tinykeys(root, wrapped);
  // Ctrl+Shift+Space, Select all like this, by the space typed, whatever key code it comes with.
  root.addEventListener('keydown', e => {
    if ((e.key === ' ' || e.code === 'Space') && (e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && selectLike() !== false) { e.preventDefault(); e.stopPropagation(); }
  });
  // Typing over a selected box or shape starts editing it, with what was typed; the window's own keys (? for
  // the shortcuts, say) come first.
  const typeOver = e => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1 || e.target !== root) return;
    // (Relating, Space takes the box the keys are on, and a name typed is a new box.)
    if (relateNow) { e.preventDefault(); return e.key === ' ' ? relateNow.take() : relateNow.name(e.key); }
    const k = keysOfSelection(), f = fieldNow();
    if (f) { e.preventDefault(); editField(f.m, f.it, e.key); }
    else if (k.length === 1) { e.preventDefault(); edit(k[0], null, e.key); }
  };
  addEventListener('keydown', typeOver);
  // The clipboard is the system's, as Office's is. A copy puts the marks' names on it; a paste is of the marks
  // while those names are still what it holds. Anything else pasted onto the chart, a link onto a selected
  // box, say, goes on to whoever takes it.
  const mine = () => root.contains(document.activeElement) && !document.activeElement.closest('.dc-edit');
  const clipboard = e => {
    if (!mine()) return;
    if (e.type === 'paste') {
      // A picture on the clipboard comes in as a picture, in the free room there is.
      const image = !still() && [...e.clipboardData?.items ?? []].find(i => i.kind === 'file' && i.type.startsWith('image/'));
      if (image) { e.preventDefault(); return hand.pastePicture(image.getAsFile()); }
      if (!still() && clip && e.clipboardData?.getData('text/plain') === clip.text) { e.preventDefault(); paste(); } return;
    }
    // A field selected is copied as a field; cut, it's hidden.
    const f = fieldNow();
    if (!(f ? copyField(f) : copy())) return;
    e.preventDefault();
    e.clipboardData?.setData('text/plain', clip.text);
    if (e.type === 'cut') { if (f) hideField(f); else remove(); }
  };
  const CLIP = ['copy', 'cut', 'paste'];
  CLIP.forEach(n => document.addEventListener(n, clipboard));
  // A wheel scrolls the page; with Ctrl, X6 zooms.
  gEl.addEventListener('wheel', e => { if (e.ctrlKey || e.metaKey) return; e.preventDefault(); const t = graph.translate(); graph.translate(t.tx - e.deltaX, t.ty - e.deltaY); }, { passive: false });

  // A restyle is of the chart as it was: one that changes ends it.
  const stopDraw = effect(() => { App.scene.value; App.later?.value; clearTimeout(resting); styled = styledDrawn = null; show(true); });
  // A Key that has come to stand over a box, as a chart grew under one a hand put, or a corner holds, says so as it happens, with what mends it.
  let keyOver = null, keyView = null;
  const stopKeyOver = effect(() => {
    const sc = App.scene.value;
    if (!sc || sc.view !== viewShown) return;
    const over = Scene.says(sc, b => App.notes.peek().shortOf(App.state.peek(), b.record)).filter(t => t.startsWith('The Key overlaps')), fresh = keyView === sc.view && keyOver ? over.filter(t => !keyOver.includes(t)) : [];
    keyOver = over; keyView = sc.view;
    if (fresh.length && active.peek() === canvas && !App.readOnly.peek()) Shell.toast(fresh[0], { go: ['Tidy, to make room', () => tidy()] });
  });
  // A mark's fields, asked of by the inspector (see Fields): `shown`, whether the mark a record draws shows an entry of a
  // label; `show`, shows or hides one there, at the scope where the mark is what's selected; `light`, outlines the field
  // a row's key names, as its row is pointed at; `over`, the box under a point on screen as a row is dragged, outlined as
  // its target (null ends it), and `drop`, the label dropped there; `clip`, a row copied, as a field.
  const marked = id => scene?.byId.get(id);
  const fields = {
    shown: (id, edge, at = id) => { const m = marked(id); return !!m && shows(m, edge, at); },
    // A relative's field, by name, from a list's heading: whether it's shown; shown or hidden at the pen; and all a box can read, for a list's menu.
    wordShown: (id, label) => { const m = marked(id); return !!m && showsWord(m, label); },
    showWord: (id, label, on) => { const m = marked(id); return !m ? null : designing ? (on ? Designs.dropped(m, label, null) : null) : setWord([m], label, on, scoped(m, scopeOfBox())); },
    readable: id => { const m = marked(id); return m?.record ? Scene.readable(st(), App.notes.peek(), App.schema.peek(), m.record) : []; },
    // From the panel, at the pen: a free text, a footnote, and what they can read.
    words: id => { const m = marked(id); return m ? wordsAt(m) : []; },
    addText: (id, text) => { const m = marked(id); return m && putText(m, text); },
    editText: id => { const m = marked(id), it = m?.texts?.find(x => x.free); if (it) writeText(m, it); },
    dropText: id => { const m = marked(id); return m && unText(m, scoped(m)); },
    addFoot: (id, text) => { const m = marked(id); return m && addFoot(m, text, scoped(m), null); },
    footDelete: (id, key) => { const fm = scene.marks.find(x => x.role === 'footnotes'), f = fm?.feet?.find(y => y.from.some(z => z.key === key)); return f && footDelete(f); },
    footEdit: (id, key) => { const fm = scene.marks.find(x => x.role === 'footnotes'), f = fm?.feet?.find(y => y.from.some(z => z.key === key)); if (f) editFoot(fm, f); },
    scope: scopeOfField,
    show: (id, edge, on, at = id) => { const m = marked(id); return m && setField([m], edge, on, scoped(m, scopeOfField(edge)), at); },
    showHere: (id, edge, on, at = id) => { const m = marked(id); return m && setField([m], edge, on, { own: true }, at); },
    // In every box that has it, as more get it too: a note at the entry wherever it is (dendra.md, Fields); a choice
    // alone wouldn't say what it is ("High"), so it says so ("Risk Rating: High"), unless a note says how it reads.
    everywhere: edge => App.notes.peek().value('Shown', entryAnywhere(edge), viewOf()) === true,
    setEverywhere: (edge, on) => App.change(tx => {
      const view = viewOf(), p = entryAnywhere(edge), N = App.notes.peek();
      tx.note('Shown', p, on ? true : undefined, { view });
      if (on && N.resolve('Format', p, view) === null && Object.values(App.schema.peek()).some(s => s.args?.length === 1 && Tree.same(s.args[0].edge, edge) && 'choice' in s.out)) tx.note('Format', p, 'label', { view });
      if (!on && N.value('Format', p, view) === 'label') tx.note('Format', p, undefined, { view });
      tx.says(`${on ? 'Showed' : 'Stopped showing'} ${edge} in every box that has it in ${viewName(view)}`);
    }, { dated: false }),
    captioned: edge => App.notes.peek().value('Format', entryAnywhere(edge), viewOf()) === 'label',
    setCaptioned: (edge, on) => App.change(tx => tx.note('Format', entryAnywhere(edge), on ? 'label' : undefined, { view: viewOf() }), { dated: false, say: `${on ? 'Named' : 'Stopped naming'} ${edge} where it’s shown` }),
    light: key => { if (litKey !== key) { litKey = key; paintFields(); } },
    over(cx, cy) {
      // (While a design is edited, a part stood on the page takes a row dropped too.)
      const p = cx == null ? null : graph.clientToLocal(cx, cy), m = p && [...scene.marks].reverse().find(b => (b.type === 'box' || (designing && b.type === 'shape' && designing.keeps(b.id))) && (!designing || designing.keeps(b.id)) && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h);
      dropAt = p;
      if ((m?.id ?? null) !== dropOn) { dropOn = m?.id ?? null; paintFields(); }
      // Those it would go to lit: what the pen reaches; or else the one box it's over, where the pen doesn't reach that.
      const s = scopeOfBox(), many = s.own ? null : s.marks;
      cue(cx == null ? null : m && !many?.has(m.id) ? [m.id] : many ? [...many] : m ? [m.id] : null);
      return m ?? null;
    },
    drop(edge) {
      const m = marked(dropOn), at = dropAt;
      dropOn = null;
      cue(null);
      paintFields();
      if (m && designing) return Designs.dropped(m, edge, at);
      // (Onto a part of a design: its token there, at the pen, the design standing. Onto the rest of the box, shown as ever.)
      const part = m && at && [...m.parts ?? []].reverse().find(q => q.geometry !== 'line' && at.x >= q.x && at.x <= q.x + q.w && at.y >= q.y && at.y <= q.y + q.h);
      if (part && !m.design.value.parts.find(p => p.id === part.part)?.rest) return saidOfPart(`Put ${edge} in a part of ${whereSaid([m], scoped(m))}`, tx => Designs.say(tx, m, part.part, { text: Designs.tokenIn(m, part.part, edge) }, scoped(m)));
      // (A relative's, by name, is read in the words it's given; anything else is its own entry.)
      if (m && wordsOf(m).includes(edge) && !entriesOf(m).includes(edge)) return setWord([m], edge, true, scoped(m));
      return m && setField([m], edge, true, scoped(m));
    },
    clip: (edge, text) => { clip = { items: [], text, field: edge }; },
  };
  // A box inserted between two (App.interposing): set square over the lower, midway under the upper; where that hasn't the
  // room for it and a lane either side, the lower and what it holds move down to make it, each from where it stands.
  // → Map(record → place), the new box's under `id`. A redline is laid out with them held, as Enter will enter them.
  function placesBetween(base, { up, low, under, id }) {
    const a = base?.byId.get(up), b = base?.byId.get(low), out = new Map();
    if (!a || !b || still() || base.view !== viewShown || active.peek() !== canvas) return out;
    const N = App.notes.peek(), holds = holdsOf(base), LANE = 24, foot = a.y + a.h;
    // (Under whatever line crosses there, but the one it goes between: no row moves to make it room.)
    const crossing = base.marks.filter(m => m.type === 'line' && m.points && !(m.from === up && m.to === low)).flatMap(m => m.points.slice(1).map((p, i) => [m.points[i], p]))
      .filter(([p, q]) => Math.abs(p[1] - q[1]) < 0.5 && p[1] > foot && p[1] < b.y && Math.max(p[0], q[0]) > b.x && Math.min(p[0], q[0]) < b.x + b.w).map(([p]) => p[1]);
    const top = Math.max(foot, ...crossing), room = b.y - top, dy = Math.max(0, b.h + 2 * LANE - room);
    if (dy) for (const x of [low, ...under]) {
      const t = treeOf(x), old = t && N.resolve('Position', t, base.view)?.value, p = old && Number.isFinite(old.x) && !old.loose ? old : holds.get(x);
      if (base.byId.has(x) && p) out.set(x, { ...p, y: round(own(0, base.byId.get(x).y, base.page)[1] + dy) });
    }
    const [x, y] = own(b.x, top + (room + dy - b.h) / 2, base.page);
    // (Placed as a hand places it, so no row moves for the lanes it brings; what they'd moved stands where it's drawn.)
    out.set(id, { x, y, w: round(b.w), kept: true, hand: true });
    for (const [r, p] of stoodFor(base, out)) out.set(r, p);
    return out;
  }
  // (What it places, the same change doesn't keep where it stood: see keep.)
  let placedNow = new Set();
  function between(tx, at, kind) { const base = App.scene.peek(), places = placesBetween(base, at); placedNow = new Set(places.keys()); for (const [x, p] of places) tx.note('Position', x === at.id ? { id: x, kind } : treeOf(x), p, { view: base.view }); }
  // What a change pending keeps where it stands, and what it places itself, over any place entered.
  function holdsFor(base) { const h = holdsOf(base), at = App.pending.peek()?.placing?.(); if (at) for (const [x, p] of placesBetween(base, at)) h.set(x, { ...p, over: true }); return h; }
  const canvas = {
    scene: () => scene, graph, root, selected, keys: keysOfSelection, highlight, redline, reveal, restyle, cue, reach, point, toward, between, zoomTo: ids => bring(marksOf([].concat(ids ?? []).filter(Boolean))),
    insert, create, remove, copy: copyOut, paste: () => paste(), duplicate, nudge, walk, align, distribute, match, order, group, ungroup, edit: key => edit(key), tidy, tidied, tidyName, tidyable, tidyEvery, tidiedEvery, zoom, put, lockSize, turn, showOnly, canShowOnly, filter, withAnother: () => { const m = selected().find(x => x.type === 'box'); if (m) relating(m, undefined, null, true); },
    // Insert's: drawn by dragging, or a click to place; a text box typed straight in, where the page has room, or drawn.
    connect: (a, b) => { const p = scene.byId.get(a), q = scene.byId.get(b); if (p && q) connect(p, q); }, draw: (g, o) => hand.arm(g, o), drawText: () => { hand.arm('text'); insert('text'); const ed = over.querySelector('.dc-edit'); ed?.addEventListener('input', () => hand.disarm(), { once: true }); ed?.addEventListener('keydown', e => { if (e.key === 'Escape' || e.key === 'Enter') hand.disarm(); }); },
    table: (rows, cols, o) => hand.newTable(rows, cols, o), cell: id => hand.cell(id), link: id => hand.setLink(id), pastePicture: f => hand.pastePicture(f), editPoints: id => hand.editPoints(id), merge: kind => hand.merge(kind), alongLine: () => hand.alongLine(), mergeable: () => hand.mergeable(), lineAmong: () => hand.lineAmong(), flip: how => hand.flip(how), turnBy: by => hand.turnBy(by), crop: id => hand.crop(id), changePicture: id => hand.changePicture(id), setDefault: () => hand.setDefault(), pane: on => hand.pane(on), repeat: () => hand.repeat(), did: fn => hand.did(fn), angleOf: m => hand.angleOf(m),
    // What's being typed part by part takes a look (Bold, a color, a size) in place of the mark it's in. → whether it did.
    richSet: (label, v) => !!richEdit?.set(label, v),
    fields, field: () => fieldNow(), styleField, selectLike, addText: id => { const m = marked(id); if (m) writeText(m); }, footnote: id => footnote(id ? marked(id) : undefined),
    // Editing a design: what can be touched; and the zoom, brought to the box and put back (see Designs). A part selected, of a box (see Fields).
    designing: d => { designing = d; root.classList.toggle('designing', !!d); document.body.classList.toggle('designing', !!d); if (!d) { field = null; } paintStates(); }, whereNow: () => ({ s: graph.zoom(), t: graph.translate() }),
    // (It moves, from the box and back to it: the page gliding as a zoom asked for does.)
    bringTo: r => { const was = aboutToGlide(); showRect(r, 90, LEAST, 4); glide(was); }, goBack: w => { const was = aboutToGlide(); quietly(() => { graph.zoomTo(w.s); graph.translate(w.t.tx, w.t.ty); }); zoomRead(); glide(was); }, partOf, reorder: (m, to, after, said) => hand.reorder(m, to, after, said),
    // Relate…: from the one box selected, a line drawn to the next box clicked, as its menu begins one.
    relate: () => { const s = selected(); if (s.length === 1 && s[0].type === 'box' && !still()) relating(s[0]); },
    relatable: () => { const s = selected(); return s.length === 1 && s[0].type === 'box'; },
    destroy() {
      nudged(); stopNudge(); stopWalk(); removeEventListener('keydown', nudgeEnds, true); removeEventListener('pointerdown', nudgeEnds, true);
      stopDraw(); stopKeyOver(); stopSel(); stopKeep(); stopAids(); clearTimeout(resting); unbind(); resized.disconnect(); removeEventListener('keydown', typeOver); CLIP.forEach(n => document.removeEventListener(n, clipboard));
      hand.destroy(); graph.dispose(); root.remove(); if (active.peek() === canvas) active.value = null;
    },
  };
  hand = Drawing.attach({ graph, sel, root, over, marks, NS, gEl, transform, scene: () => scene, scale: pageScale, still, insert, rowOf, called, viewOf, treeOf, origin, extent, markItems, moveTo, follow, astray, showHandles, lockedCell, lockedOf, gridStep, openEditor, paintStates, show, placeableAll: placeable, selectedNow: selected, connect });
  active.value = canvas;
  return canvas;
}

// A chart's filter, the same control as a table's: a search, Select all, each value ticked with how many boxes have it among those
// the other filters leave, Blank at the foot, Clear filter and Done; nothing ticked isn't applied, and Done waits for one.
function ChartFilter({ view, field, close }) {
  const { useState } = preactHooks, html = Shell.html;
  App.looks.value;
  const [q, setQ] = useState(''), [none, setNone] = useState(false), st = App.state.value, page = App.page.value;
  if (!page) return null;
  const all = App.lookOf(view)?.filters ?? [], mine = all.find(f => f.key === field.key) ?? null, others = all.filter(f => f !== mine), counts = new Map();
  for (const m of page.marks) if (m.type === 'box' && !m.revealed && others.every(f => f.values.includes(App.valueAt(st, m.record, f.key)))) { const v = App.valueAt(st, m.record, field.key); counts.set(v, (counts.get(v) ?? 0) + 1); }
  for (const v of mine?.values ?? []) if (!counts.has(v)) counts.set(v, 0);
  const vals = [...counts.keys()].sort((a, b) => (a === null) - (b === null) || String(a).localeCompare(String(b), 'en', { numeric: true })), t = q.trim().toLowerCase(), list = t ? vals.filter(v => String(v ?? 'Blank').toLowerCase().includes(t)) : vals;
  const kept = none ? new Set() : new Set(mine?.values ?? vals), every = list.length > 0 && list.every(v => kept.has(v)), some = list.some(v => kept.has(v));
  const set = ks => { const v = vals.filter(x => ks.has(x)); setNone(!v.length); if (v.length) App.filterBy(view, field.key, field.label, v.length === vals.length ? null : v); };
  const toggle = v => { const ks = new Set(kept); if (ks.has(v)) ks.delete(v); else ks.add(v); set(ks); };
  const flip = () => { const ks = new Set(kept); list.forEach(v => (every ? ks.delete(v) : ks.add(v))); set(ks); };
  const keys = e => { if (e.key === 'Enter' && t && list.length) { e.preventDefault(); setNone(false); App.filterBy(view, field.key, field.label, list); close(); } };
  return html`<div class="tfilter">
    <input type="search" class="tf-find" placeholder="Find" aria-label="Find" value=${q} autofocus spellcheck=${false} onInput=${e => setQ(e.target.value)} onKeyDown=${keys} />
    <div class="tf-list" role="group" aria-label=${field.label}>
      ${list.length ? html`<label class="tf-row all"><input type="checkbox" ref=${x => { if (x) x.indeterminate = some && !every; }} checked=${every} onChange=${flip} /><span class="v">Select all</span></label>` : html`<div class="tf-none">No match</div>`}
      ${list.map(v => html`<label class="tf-row" key=${String(v)}><input type="checkbox" checked=${kept.has(v)} onChange=${() => toggle(v)} /><span class=${'v' + (v === null ? ' muted' : '')}>${v ?? 'Blank'}</span><span class="n">${counts.get(v)}</span></label>`)}
    </div>
    <div class="tf-foot"><button type="button" class="btn" disabled=${!mine && !none} onClick=${() => { setNone(false); App.filterBy(view, field.key, field.label, null); }}>Clear filter</button><button type="button" class="btn primary" disabled=${none} onClick=${close}>Done</button></div>
  </div>`;
}
// The other parts call the canvas shown through the shell (Shell.parts.value.canvas).
const call = name => (...a) => active.peek()?.[name](...a);
Shell.register('canvas', { mount(el) { const c = mount(el); return () => c.destroy(); }, active: () => active.peek(),
  highlight: call('highlight'), redline: call('redline'), reveal: call('reveal'), cue: call('cue'), point: call('point'), toward: call('toward'), zoomTo: call('zoomTo'),
  kinds: () => [...kinds()].sort().map(k => ({ label: k, run: () => call('create')(k) })) });
// A chart is shown, not just kept behind a table.
const here = () => !!active.value && active.value.root.clientWidth > 0;
// What the keys do on a chart, for the list of them: said beside keyMap, so a key changed there is changed here.
Shell.register('keys', { head: 'On a chart', rows: [['Tab', 'Next box, in reading order'], ['Shift+Tab', 'Box before'], ['Arrows', 'Nudge what’s selected'], ['$mod+Arrows', 'Nudge it finely'], ['Shift+Arrows', 'Size it about its middle'], ['$mod+Shift+Arrows', 'Size it finely'], ['Alt+ArrowLeft', 'Turn it left, where it can turn'], ['Alt+ArrowRight', 'Turn it right, where it can turn'], ['F4', 'Do the last thing again'], ['Alt+F10', 'The Selection pane'], ['Alt+Shift+KeyL', 'Align left'], ['Alt+Shift+KeyE', 'Align center'], ['Alt+Shift+KeyR', 'Align right'], ['Alt+Shift+KeyT', 'Align top'], ['Alt+Shift+KeyM', 'Align middle'], ['Alt+Shift+KeyB', 'Align bottom'], ['Enter', 'Type in its name; on a field, in that'], ['F2', 'Type in its name'], ['A letter', 'Type over its name'], ['Enter, then Esc', 'Select the field, to format it alone'], ['Delete', 'Delete or end what’s selected, or clear a field'],
  ['$mod+KeyA', 'Select everything'], ['$mod+Shift+Space', 'Select all like this'], ['$mod+KeyC', 'Copy'], ['$mod+KeyX', 'Cut'], ['$mod+KeyV', 'Paste'], ['$mod+KeyD', 'Duplicate'], ['$mod+KeyG', 'Group'], ['$mod+Shift+KeyG', 'Ungroup'], ['$mod+]', 'Bring forward'], ['$mod+[', 'Send backward'], ['$mod+Shift+]', 'Bring to front'], ['$mod+Shift+[', 'Send to back'],
  ['Shift+F10', 'What a box adds, Relate… and the rest of its menu'], ['Enter', 'While relating: take the box the keys are on'], ['A letter', 'While relating: a new box, named as it’s typed']] });
Shell.register('action', { id: 'chart.tidy', name: 'Tidy', enabled: here, run: call('tidy') });
Shell.register('action', { id: 'chart.fit', name: 'Zoom to fit', keys: 'Shift+Digit1', enabled: here, run: () => call('zoom')('fit') });
// The zoom's, and the walk's, wherever the keys are on a chart shown: a look, writing nothing.
Shell.register('action', { id: 'chart.zoomin', name: 'Zoom in', names: ['Larger', 'Magnify'], keys: '$mod+Equal', enabled: here, run: () => call('zoom')('in') });
Shell.register('action', { id: 'chart.zoomout', name: 'Zoom out', names: ['Smaller'], keys: '$mod+Minus', enabled: here, run: () => call('zoom')('out') });
Shell.register('action', { id: 'chart.zoom100', name: 'Zoom to 100%', names: ['Actual size'], keys: 'Shift+Digit0', enabled: here, run: () => call('zoom')(1) });
for (const [word, names, k, dx, dy] of [['above', 'up', 'ArrowUp', 0, -1], ['below', 'down', 'ArrowDown', 0, 1], ['to the left', 'left', 'ArrowLeft', -1, 0], ['to the right', 'right', 'ArrowRight', 1, 0]])
  Shell.register('action', { id: `chart.walk.${names}`, name: `Go to the box ${word}`, names: ['Walk', 'Next box', 'Box to box', 'Move between boxes'], keys: `$mod+Alt+${k}`, enabled: here, run: () => call('walk')(dx, dy), why: () => 'Show a chart first' });
const aidToggle = k => () => { aids.value = { ...aids.peek(), [k]: !aids.peek()[k] }; };
// What helps the eye and never prints, one row of a menu, its ticks a step in, so the menus it's on fit the window they open in.
const aidsRow = () => ({ label: 'Gridlines and guides', items: [['Gridlines', 'grid'], ['Snap to grid', 'snap'], ['Rulers', 'rulers'], ['Margins', 'margins'], ['Guides', 'guides']].map(([label, k]) => ({ label, checked: aids.peek()[k], run: aidToggle(k) })) });
for (const [id, name, k, names] of [['chart.grid', 'Gridlines', 'grid', ['Grid', 'Show grid']], ['chart.snap', 'Snap to grid', 'snap', ['Grid', 'Snap', 'Align to grid']], ['chart.rulers', 'Rulers', 'rulers', ['Ruler', 'Show rulers', 'Guides']]])
  Shell.register('action', { id, name, names, enabled: here, run: aidToggle(k) });
Shell.register('action', { id: 'chart.rotate', name: 'Rotate…', names: ['Rotation', 'Turn', 'Angle'], enabled: () => here() && !App.readOnly.peek() && active.peek().selected().length === 1 && active.peek().selected()[0].type === 'shape',
  run: () => { Shell.showPanel?.(); setTimeout(() => { const f = document.querySelector('.insp [data-place="r"] input'); f?.scrollIntoView({ block: 'center' }); f?.focus(); f?.select(); }, 60); },
  why: () => !here() ? 'Show a chart first' : App.readOnly.peek() ? App.whyNot() : 'Select one free shape first' });
Shell.register('action', { id: 'chart.tidyEvery', name: 'Tidy for every date', names: ['Tidy all dates', 'Tidy across dates', 'Line up the dates', 'Same places on every date'], enabled: () => here() && !App.readOnly.peek(), run: call('tidyEvery'),
  why: () => !here() ? 'Show a chart first' : App.whyNot() });
Shell.register('action', { id: 'chart.only', name: 'Show only these', names: ['Hide the rest', 'Only these', 'Keep only these', 'Hide others'], enabled: () => here() && !!active.peek().canShowOnly(), run: call('showOnly'),
  why: () => !here() ? 'Show a chart first' : !App.canAsk() ? App.whyNot() : 'Select some boxes first' });
Shell.register('action', { id: 'chart.showAll', name: 'Show all', names: ['Back to the chart', 'Clear filters', 'Clear filter', 'Unfilter', 'Show everything'], enabled: () => here() && !!App.shownOf(), run: () => App.showAll(active.peek().scene().view),
  why: () => !here() ? 'Show a chart first' : 'This page shows all it has' });
// What's between two boxes, offered where someone asks; which makes nothing.
Shell.register('action', { id: 'chart.with', name: 'With another box…', names: ['With', 'Between', 'Between two boxes', 'Why not', 'Why isn’t', 'Why isnt', 'What holds between', 'Relationship between', 'Compare two'], enabled: () => here() && App.canAsk() && active.peek().selected().some(m => m.type === 'box'), run: call('withAnother'),
  why: () => !here() ? 'Show a chart first' : !App.canAsk() ? App.whyNot() : 'Select a box first' });
// A box's size, typed in its panel; so with a shape's.
Shell.register('action', { id: 'chart.size', name: 'Size…', names: ['Height', 'Width', 'Resize', 'Lock proportions', 'Aspect ratio'], enabled: () => here() && !App.readOnly.peek() && active.peek().selected().length === 1 && ['box', 'shape'].includes(active.peek().selected()[0].type),
  run: () => { Shell.showPanel?.(); setTimeout(() => { const f = document.querySelector('.insp [data-place="h"] input') ?? document.querySelector('.insp [data-place="w"] input'); f?.scrollIntoView({ block: 'center' }); f?.focus(); f?.select(); }, 60); },
  why: () => !here() ? 'Show a chart first' : App.readOnly.peek() ? App.whyNot() : 'Select one box first' });
Shell.register('action', { id: 'chart.relate', name: 'Relate…', names: ['Connect', 'Link', 'Add a relation', 'Draw a line'], enabled: () => here() && !App.readOnly.peek() && !!active.peek().relatable(), run: call('relate'),
  why: () => !here() ? 'Show a chart first' : App.readOnly.peek() ? App.whyNot() : 'Select one box first' });
// A line's route: its elbow or straight, in the Outline menu, and its yellow grips; what a hand bent, taken away. The panel's Reset does that too.
const lineNow = () => { const s = here() ? active.peek().selected() : []; return s.length === 1 && s[0].type === 'line' ? s[0] : null; };
const bendNote = () => { const m = lineNow(), t = m && Tree.treeOf(App.state.peek(), m.record); return t ? App.notes.peek().resolve('Bend', t, active.peek().scene().view)?.note : null; };
Shell.register('action', { id: 'chart.route', name: 'Route…', names: ['Bend', 'Bend a line', 'Move a line', 'Jog', 'Reroute', 'Elbow', 'Straight', 'Connector'], enabled: () => !App.readOnly.peek() && !!lineNow(), run: () => FormatBar.open('outline'),
  why: () => !here() ? 'Show a chart first' : App.readOnly.peek() ? App.whyNot() : 'Select a line first, then drag a yellow grip on it' });
Shell.register('action', { id: 'chart.unbend', name: 'Reset the route', names: ['Bend', 'Route', 'Unbend', 'Take away the bend', 'Straighten'], enabled: () => !App.readOnly.peek() && !!bendNote(),
  run: () => { const m = lineNow(), n = bendNote(); if (n) App.change(tx => tx.remove(n.note), { dated: false, say: `Reset the route of ${App.notes.peek().nameOf(App.state.peek(), m.record)}: ${App.notes.peek().segmentOf(App.state.peek(), m.record)}` }); },
  why: () => !here() ? 'Show a chart first' : App.readOnly.peek() ? App.whyNot() : 'Select a line a hand has bent first' });

return { active, zoom: zoomLevel, keyParts, kinds, fieldLit, fieldPicked, rich, scope: () => scopeNow(), named, groupsAt, aids, aidToggle, aidsRow, keyCaption, keyCorner };
})();
