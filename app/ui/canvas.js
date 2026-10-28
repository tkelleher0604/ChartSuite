// Canvas: a view laid out as a chart, drawn on X6. It draws App.scene and nothing else, and keeps no copy of
// formats or positions: a gesture is a change through App.change, and the scene that follows is drawn. The
// gestures are PowerPoint's: click, Shift+click and the marquee; drag, with guides, a shape kept on the page;
// resize; Tab through the boxes, and the arrow keys; copy and paste; align, order and group; double-click to
// type; right-click for what applies. Delete hides what's selected in this view, Shift+Delete deletes it.
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
// The field pointed at or selected on the chart, by its row's key in the inspector, which lights that row.
const fieldLit = signal(null);
// The field selected, as its box and record ("fund|fund_juris"), for what formats it (the format bar); null for none.
const fieldPicked = signal(null);
const BLUE = '#1f5fbf', RED = '#c2372b';
// Cells that draw no mark of their own, so nothing selects or moves them: the page, a line's label, a redline's ink.
const UNMARKED = new Set(['page', 'label', 'ink']);
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
const viewName = id => App.views.peek().find(v => v.id === id)?.name ?? 'this view';

// The kinds a box can be added as here: the chart's, less those the view hides, the most drawn first; in a
// chart with none yet, an Entity.
function kinds(scene = App.scene.peek()) {
  const st = App.state.peek(), N = App.notes.peek(), count = new Map();
  for (const m of scene?.marks ?? []) if (m.type === 'box') { const k = st[m.record]?.kind; if (k) count.set(k, (count.get(k) ?? 0) + 1); }
  const all = new Set([...count.keys(), ...Object.values(App.schema.peek()).filter(s => !s.args && s.kind && !Tree.isView(s)).map(s => s.kind)]);
  const ks = [...all].filter(k => count.has(k) || !scene || N.value('Shown', { kind: k }, scene.view) !== false)
    .sort((a, b) => (count.get(b) ?? 0) - (count.get(a) ?? 0) || a.localeCompare(b));
  return ks.length ? ks : ['Entity'];
}
// The kind last added, while it can be; or the most drawn.
const lastKind = () => { const ks = kinds(), k = Shell.store.get('kind'); return ks.includes(k) ? k : ks[0]; };

// ---- Groups and the scope (dendra.md, Fields) ----
// What each style reaches in a scene, by its output: the marks a record of it is in or at.
const reached = new WeakMap();
function reachOf(sc) {
  let by = reached.get(sc);
  if (by) return by;
  reached.set(sc, by = new Map());
  for (const m of sc.marks) if ((m.type === 'box' || m.type === 'line') && !m.revealed)
    for (const r of Scene.reach(App.shown.peek(), App.chart.peek(), sc.view, sc, m.id, App.state.peek()))
      (by.get(Tree.key(r.output)) ?? by.set(Tree.key(r.output), { output: r.output, marks: new Set() }).get(Tree.key(r.output))).marks.add(m.id);
  return by;
}
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
// a line or reads as on it, on a grid; with `bands`, clear of the chart too, in the page's bands above, below or beside
// it. Where the page has no such place, just below everything, and the page grows to hold it.
function freeSpot(scene, w, h, near, { bands = false, gap = 16 } = {}) {
  const page = scene.page, m = page.margin, rects = [], segs = [], chart = { x: Infinity, y: Infinity, r: -Infinity, d: -Infinity };
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
  const g = Math.max(gap, 24);
  const clear = (x, y) => !(bands && x < chart.r + gap && x + w + gap > chart.x && y < chart.d + gap && y + h + gap > chart.y)
    && !rects.some(r => x < r.x + r.w + gap && x + w + gap > r.x && y < r.y + r.h + gap && y + h + gap > r.y)
    && !segs.some(([a, b]) => Math.max(a[0], b[0]) >= x - g && Math.min(a[0], b[0]) <= x + w + g && Math.max(a[1], b[1]) >= y - g && Math.min(a[1], b[1]) <= y + h + g);
  const x0 = m, y0 = m, x1 = page.w - m - w, y1 = page.h - m - h, cx = clamp(near.x - w / 2, x0, x1), cy = clamp(near.y - h / 2, y0, y1);
  const step = Math.max(8, Math.ceil(Math.max(page.w, page.h) / 160)), spots = [];
  for (let x = x0; x <= x1; x += step) for (let y = y0; y <= y1; y += step) spots.push({ x, y, d: Math.hypot(x - cx, y - cy) });
  const best = spots.sort((a, b) => a.d - b.d).find(p => clear(p.x, p.y));
  return best ?? { x: cx, y: Math.max(0, ...rects.map(r => r.y + r.h), ...segs.flat().map(p => p[1])) + gap * 2 };
}

// ---- Drawing: each mark as X6 cells ----

// A text; `faint`, in a box drawn only while it's asked about. A blank field is its entry's name, faint, the canvas's
// alone (dendra.md, Fields).
function textMarkup(it, red, faint) {
  const t = it.blank ? { ...it.look, Color: BLANK, Bold: false, Underline: false } : it.look, tone = c => red === 'appear' ? BLUE : red === 'go' ? RED : c;
  return {
    tagName: 'text', attrs: {
      'font-family': Scene.fontFamily(t.Font), 'font-size': px(t.Size), 'font-weight': t.Bold ? 700 : 400,
      'font-style': t.Italic || it.computed || it.blank ? 'italic' : 'normal', 'text-anchor': ANCHOR[t.Align] ?? 'middle', 'data-text': it.id, ...(faint && { opacity: FAINT }),
    },
    children: it.lines.map(l => {
      const r = l.red ?? it.redline ?? red;
      const deco = [t.Underline && 'underline', (t.Strike || r === 'go') && 'line-through'].filter(Boolean).join(' ');
      return { tagName: 'tspan', attrs: { x: l.x, y: l.y, fill: r === 'appear' ? BLUE : r === 'go' ? RED : tone(t.Color), ...(deco && { 'text-decoration': deco }), ...(l.ink && { 'data-ink': '' }) }, textContent: l.text };
    }),
  };
}
const paint = v => !v || v === 'none' ? 'none' : v;
// A box's or shape's body: its shape (a rounded rectangle's corners as its Corner says), its fill as transparent
// as its Transparency, its outline, and its Shadow.
function bodyMarkup(shape, w, h, s, red, extra = {}) {
  const stroke = red === 'appear' ? BLUE : red === 'go' ? RED : paint(s.Outline), clear = Math.min(100, Math.max(0, s.Transparency ?? 0));
  return { tagName: 'path', selector: 'body', attrs: { d: Scene.path(shape, w, h, s.Corner), fill: paint(s.Fill), ...(clear && { 'fill-opacity': 1 - clear / 100 }),
    stroke, 'stroke-width': px(s.Weight), 'stroke-dasharray': Scene.dash(s.Dash, s.Weight) ?? (red === 'go' ? '4 3' : null), 'stroke-linejoin': 'miter',
    ...(s.Shadow === 'soft' && { filter: `url(#${shadow(drawnAt)})` }), ...extra } };
}
// PowerPoint's soft outer shadow, as a filter for a page drawn at a scale: 3 pt below and to the right, blurred 4 pt,
// black at 40%, each the sheet's, as a weight is, however much smaller the chart is drawn. One filter for each scale,
// in a page of the document's own, which every canvas's drawing refers to.
let drawnAt = 1;
const shadows = new Set();
function shadow(s) {
  const id = `dc-shadow-${Math.round(s * 1000)}`;
  if (shadows.has(id) && document.getElementById(id)) return id;
  shadows.add(id);
  let defs = document.getElementById('dc-shadows');
  if (!defs) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    svg.innerHTML = '<defs id="dc-shadows"></defs>';
    document.body.append(svg);
    defs = svg.firstChild;
  }
  const d = px(3) * Math.SQRT1_2 / s, blur = px(2) / s;
  defs.insertAdjacentHTML('beforeend', `<filter id="${id}" x="-25%" y="-25%" width="160%" height="160%" color-interpolation-filters="sRGB">`
    + `<feDropShadow dx="${d}" dy="${d}" stdDeviation="${blur}" flood-color="#000000" flood-opacity="0.4"/></filter>`);
  return id;
}
const look = m => m.look ?? Object.fromEntries(Object.entries(m.settings).map(([k, v]) => [k, v.value]));
// An arrowhead, X6's block, at a line's end; on a route, no longer than the leg it ends (`leg`, its two points), so
// that it never reaches back past the turn into that leg (regress9 8).
const marker = (on, w, leg = null) => {
  if (!on) return null;
  const k = leg ? Math.min(1, Math.hypot(leg[1][0] - leg[0][0], leg[1][1] - leg[0][1]) / (5 + w * 3)) : 1;
  return { name: 'block', width: (5 + w * 3) * k, height: (4 + w * 2.4) * k, offset: 0 };
};
// A line's width, `w`, through `ps` with an arrowhead at its start or end. X6 ends a path short of an arrowhead's end by
// the width its attributes give the line, back toward the point before: where the leg an arrowhead ends is shorter than
// the line is wide, its attributes give it half that leg and its style the width it's drawn at, so the path ends on
// that leg, never back past the turn (regress10 7).
const widthOf = (ps, w, start, end) => {
  const leg = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]), least = Math.min(start ? leg(ps[0], ps[1] ?? ps[0]) : Infinity, end ? leg(ps.at(-1), ps.at(-2) ?? ps.at(-1)) : Infinity);
  return least < w ? { strokeWidth: least / 2, style: { strokeWidth: w } } : { strokeWidth: w };
};
// How strongly a mark the view hides is drawn while it's asked about. A box keeps its fill, so no line
// behind it shows through its name.
const FAINT = 0.55;
// A blank field's name: a placeholder's grey, on the page's white.
const BLANK = '#a3a8ad';

// A cell in two parts, as JSON: where it is, which moving it changes, each of its keys apart; and what it is. A
// line's `form` is what it is less its attributes' values: which it sets, and how, which setting its attributes again
// can't take away (an arrowhead, a dash), but can give other values (a weight at another scale, a colour).
const WHERE = new Set(['x', 'y', 'width', 'height', 'zIndex', 'source', 'target', 'vertices', 'connector']);
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
  const node = (m, kind, markup, extra = {}) => cells.push({ id: m.id, shape: 'dendra', x: m.x, y: m.y, width: Math.max(1, m.w), height: Math.max(1, m.h),
    zIndex: z.get(m.id), markup, data: { kind, mark: m.id }, ...extra });
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
      node(m, 'box', [bodyMarkup(m.shape, m.w, m.h, s, red(m), { 'data-tour': 'box', ...(m.revealed && { 'stroke-opacity': FAINT }) }),
        ...textsOf(m).map(it => textMarkup(it, red(m), m.revealed))]);
    } else if (m.type === 'line') {
      const ps = m.points, dashed = Scene.dash(s.Dash, s.Weight) ?? (m.computed && !m.settings.Dash.note ? Scene.dash('dashed', s.Weight) : null) ?? (red(m) === 'go' ? '4 3' : null);
      const arrow = s.Arrow, r = red(m);
      cells.push({ id: m.id, shape: 'edge', zIndex: z.get(m.id), data: { kind: 'line', mark: m.id },
        source: { x: ps[0][0], y: ps[0][1] }, target: { x: ps[ps.length - 1][0], y: ps[ps.length - 1][1] },
        vertices: ps.slice(1, -1).map(([x, y]) => ({ x, y })), router: { name: 'normal' }, connector: m.runs ? { name: 'runs', args: { runs: m.runs } } : { name: 'normal' },
        attrs: { line: { stroke: r === 'appear' ? BLUE : r === 'go' ? RED : paint(s.Outline), ...widthOf(ps, px(s.Weight), arrow === 'start' || arrow === 'both', arrow === 'end' || arrow === 'both'), strokeDasharray: dashed,
          strokeLinecap: s.Dash === 'dotted' ? 'round' : 'butt', strokeLinejoin: 'miter', targetMarker: marker(arrow === 'end' || arrow === 'both', px(s.Weight), ps.slice(-2)),
          sourceMarker: marker(arrow === 'start' || arrow === 'both', px(s.Weight), ps.slice(0, 2)), ...(m.revealed && { opacity: FAINT }) }, wrap: { strokeWidth: 10 } } });
      if (m.texts.length && Number.isFinite(m.labelAt?.x) && Number.isFinite(m.labelAt?.y)) cells.push({ id: `${m.id}·label`, shape: 'dendra', x: m.labelAt.x, y: m.labelAt.y, width: m.label.w || 1, height: m.label.h || 1,
        zIndex: z.get(m.id) + 1, data: { kind: 'label', mark: m.id }, markup: textsOf(m).map(it => textMarkup(it, r)) });
    } else if (m.type === 'frame') {
      const d = m.lone ? '' : m.kind === 'bracket' ? `M0.5,${m.h} V${m.h - 5} H${m.w - 0.5} V${m.h}` : `M0,0 H${m.w} V${m.h} H0 Z`;
      node(m, 'frame', [{ tagName: 'path', selector: 'body', attrs: { d, fill: 'none', stroke: '#595959', 'stroke-width': px(m.settings.Weight.value), 'pointer-events': 'visibleStroke',
        'stroke-dasharray': m.kind === 'solid' || m.kind === 'bracket' ? null : Scene.dash(m.kind === 'dotted' ? 'dotted' : 'dashed', m.settings.Weight.value) } },
        { tagName: 'rect', attrs: { x: 0, y: 0, width: m.w, height: m.kind === 'bracket' ? m.h : m.label + 6, fill: 'transparent' } },
        textMarkup(m.caption)]);
    } else if (m.type === 'shape') {
      if (m.geometry === 'line') {
        const ps = m.points;
        cells.push({ id: m.id, shape: 'edge', zIndex: z.get(m.id), data: { kind: 'shape', mark: m.id },
          source: { x: ps[0][0], y: ps[0][1] }, target: { x: ps[ps.length - 1][0], y: ps[ps.length - 1][1] }, vertices: ps.slice(1, -1).map(([x, y]) => ({ x, y })),
          attrs: { line: { stroke: paint(s.Outline), strokeWidth: px(s.Weight), strokeDasharray: Scene.dash(s.Dash, s.Weight), targetMarker: marker(s.Arrow === 'end' || s.Arrow === 'both', px(s.Weight)),
            sourceMarker: marker(s.Arrow === 'start' || s.Arrow === 'both', px(s.Weight)) }, wrap: { strokeWidth: 10 } } });
      } else if (m.geometry === 'legend') node(m, 'shape', legendMarkup(m, s));
      else if (m.geometry === 'picture') node(m, 'shape', [{ tagName: 'image', attrs: { href: m.src, width: m.w, height: m.h, preserveAspectRatio: 'xMidYMid meet' } },
        { tagName: 'rect', attrs: { width: m.w, height: m.h, fill: 'transparent', stroke: paint(s.Outline === '#000000' ? 'none' : s.Outline), 'stroke-width': px(s.Weight) } }]);
      else if (m.geometry === 'group') continue;
      else {
        const geometry = m.geometry === 'text' || m.geometry === 'frame' ? 'rect' : m.geometry;
        const body = bodyMarkup(geometry, m.w, m.h, s, null, m.geometry === 'frame' ? { 'pointer-events': 'visibleStroke' } : {});
        node(m, 'shape', [body, ...(m.geometry === 'text' || m.geometry === 'frame' ? [{ tagName: 'rect', attrs: { width: m.w, height: m.geometry === 'frame' ? 18 : m.h, fill: 'transparent' } }] : []),
          ...m.texts.map(it => textMarkup(it))]);
      }
    }
  }
  return cells;
}

function swatchMarkup(sw, box) {
  const { x, y, w, h } = box;
  if (sw.kind === 'line') return { tagName: 'path', attrs: { d: `M${x},${y + h / 2} H${x + w}`, stroke: paint(sw.Outline), 'stroke-width': px(sw.Weight), 'stroke-dasharray': Scene.dash(sw.Dash, sw.Weight), fill: 'none' } };
  if (sw.kind === 'frame') return { tagName: 'rect', attrs: { x, y, width: w, height: h, fill: 'none', stroke: '#595959', 'stroke-width': px(sw.Weight), 'stroke-dasharray': Scene.dash('dashed', sw.Weight) } };
  const shape = sw.Shape ?? 'rect', sh = shape === 'triangle' ? h + 2 : h, sy = shape === 'triangle' ? y - 1 : y;
  const { selector, ...body } = bodyMarkup(shape, w, sh, sw, null, { transform: `translate(${x},${sy})` });
  return body;
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

// ---- The canvas ----

function mount(el) {
  const root = document.createElement('div');
  root.className = 'dc';
  root.tabIndex = 0;
  root.innerHTML = '<div class="dc-graph"></div><div class="dc-over"></div>';
  el.append(root);
  const gEl = root.firstChild, over = root.lastChild;

  let scene = null, viewShown = null, hl = null, red = null, ink = null, revealIds = null, entered = null, dragging = null, syncing = false;
  let cued = null; // the format bar's scope, lit (see cue)
  let pointing = false, hold = false;
  // The field selected, pointed at, lit from the inspector, and the box a row is dragged over (see Fields).
  let field = null, hovered = null, litKey = null, dropOn = null;
  const zooms = new Map();
  // In History nothing moves: the chart is as it stood.
  const still = () => App.readOnly.peek();
  // The page, as X6 restricts a move to it: a free shape stays on it; a box or frame only off its left and top.
  const pageRect = all => ({ x: 0, y: 0, width: all ? scene.page.w : 1e6, height: all ? scene.page.h : 1e6 });

  const graph = new Graph({
    container: gEl, autoResize: true, async: false, virtual: true, background: false, grid: false,
    panning: { enabled: true, eventTypes: ['mouseWheelDown'] },
    mousewheel: { enabled: true, modifiers: ['ctrl', 'meta'], zoomAtMousePosition: true, minScale: LEAST, maxScale: 4, factor: 1.12 },
    scaling: { min: LEAST, max: 4 },
    translating: { restrict: view => scene ? pageRect(view?.cell?.getData()?.kind === 'shape') : null },
    interacting: view => {
      const k = view.cell.getData()?.kind;
      if (view.cell.isEdge()) return { edgeMovable: k === 'shape' && !still(), edgeLabelMovable: false, arrowheadMovable: false, vertexMovable: false, vertexAddable: false, vertexDeletable: false };
      return { nodeMovable: !pointing && !still() && !UNMARKED.has(k) };
    },
  });
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
  const selectable = c => { const k = c.getData()?.kind; return !!k && !UNMARKED.has(k) && c.isVisible(); };
  const sel = new Selection({ enabled: true, multiple: true, rubberband: true, strict: true, movable: true, showNodeSelectionBox: true, showEdgeSelectionBox: false,
    pointerEvents: 'none', multipleSelectionModifiers: ['shift', 'ctrl', 'meta'], filter: selectable });
  graph.use(sel);
  const resizable = n => n.isNode() && ['box', 'shape'].includes(n.getData()?.kind) && !still();
  const transform = new Transform({ resizing: { enabled: resizable, minWidth: 24, minHeight: 12, orthogonal: true }, rotating: false });
  graph.use(transform);
  transform.stopListening(); // it would put handles on whatever is clicked; grips() decides

  // Resize handles on a shape selected alone, however it came to be selected; a box too small on screen for
  // its side handles shows only its corners, as Office's does.
  const grips = () => {
    const cs = sel.getSelectedCells();
    if (cs.length === 1 && resizable(cs[0])) { if (!transform.widgets.has(cs[0])) transform.createWidget(cs[0]); } else transform.clearWidgets();
    const z = graph.zoom();
    for (const [cell, w] of transform.widgets) {
      const s = cell.getSize();
      w.container?.classList.toggle('narrow', s.width * z < 40);
      w.container?.classList.toggle('short', s.height * z < 40);
    }
  };
  graph.use(new Snapline({ enabled: true, sharp: true, tolerance: 5, filter: c => c.isVisible() }));

  // The page: a sheet under everything, and a node no one sees, so guides find its edges and middle.
  const NS = 'http://www.w3.org/2000/svg';
  const viewport = graph.view.viewport;
  const sheet = document.createElementNS(NS, 'rect');
  sheet.setAttribute('class', 'dc-sheet');
  viewport.insertBefore(sheet, viewport.firstChild);
  const marks = document.createElementNS(NS, 'g');
  marks.setAttribute('class', 'dc-marks');
  viewport.appendChild(marks);

  // ---- Drawing the scene: App's, or a variant of it showing what's highlighted, redlined or restyled ----
  // A restyle keeps the view as it was drawn, so its boxes stay where they are, as a highlight does; one that
  // moves them, Tidy's, is laid out afresh, and not kept as how the view was drawn. A redline is the scene the
  // change, made, draws, with its ink (see inked).
  // The page drawn last; and `moving`, while a gesture's change is made (see moveTo).
  let pageWas = null, moving = false;
  function draw() {
    const base = App.scene.peek();
    if (!base) return;
    const view = base.view, s = styledDrawn, r = !s && redDrawn;
    scene = s || (revealIds && !r) ? Scene.of(s?.wb ?? App.shown.peek(), App.chart.peek(), view, base.day,
      { state: App.state.peek(), computed: App.computed.peek(), reveal: revealIds, keep: !!s && !s.moves, ahead: !!s?.moves }) : r ? r.scene : base;
    ink = r ? inked(r, scene, base) : null;
    cellsTo(App.chart.peek(), view, [...cellsOf(scene, ink), ...(ink?.cells ?? []), { id: '·page', shape: 'dendra', x: 0, y: 0, width: scene.page.w, height: scene.page.h, zIndex: -1e6,
      data: { kind: 'page' }, markup: [{ tagName: 'rect', attrs: { width: scene.page.w, height: scene.page.h, fill: 'none', 'pointer-events': 'none' } }] }]);
    sheet.setAttribute('width', scene.page.w);
    sheet.setAttribute('height', scene.page.h);
    // Each view comes back as it was left; one not seen yet opens on its whole page. Either is so at once,
    // never drawn for a moment as the view before was. A framed view is framed again on a page that grows or
    // shrinks, a gesture's or Tidy's preview's too (every other preview keeps the page as it was), so the page
    // stays in view. Otherwise, and under a gesture, the chart stays where it is on screen as the page sets it
    // again (by its offset), so what was moved stays under the pointer.
    const page = scene.page, was = pageWas;
    pageWas = page;
    if (viewShown !== view) {
      if (viewShown) zooms.set(viewShown, left ?? { s: graph.zoom(), t: graph.translate(), framed });
      viewShown = view;
      const z = zooms.get(view);
      framed = z ? z.framed : true;
      left = z && !z.framed ? z : null;
      settle();
    } else if (was) {
      const resized = page.w !== was.w || page.h !== was.h, dx = page.offset.x - was.offset.x, dy = page.offset.y - was.offset.y;
      if (framed && resized) settle();
      else if ((dx || dy) && (moving || !framed) && screen.w) { const z = graph.zoom(), t = graph.translate(); quietly(() => graph.translate(t.tx - dx * z, t.ty - dy * z)); }
    }
    syncSelection();
    paintStates();
    seek();
    // A field's name said on hover goes as the chart is drawn again, which may have moved it.
    tipFor(null);
  }
  // The graph's cells made these. Each is kept by what it's drawn from, in two parts, where it is (a node's
  // place, size and stacking, a line's route) and what it is (its markup, attributes and data): one that only
  // moved is moved, a box or shape that looks different is drawn again in place, and so is a line whose attributes
  // only take other values (see partsOf), its new values set over its old, so it keeps those its shape gives it, the
  // path drawn on its route among them; only a line that sets others, or a new cell, is made anew, as making cells
  // is what costs. A cell this view doesn't draw is
  // hidden while another view of the chart drew it last, for when that one is shown again, and otherwise goes.
  const drawn = new Map(), drewLast = new Map();
  let chartDrawn = null;
  function cellsTo(chart, view, cells) {
    if (chart !== chartDrawn) { drewLast.clear(); chartDrawn = chart; }
    const mine = new Set(cells.map(c => c.id));
    drewLast.set(view, mine);
    const kept = new Set([...drewLast.values()].flatMap(s => [...s]));
    stack(cells);
    syncing = true;
    if (!screen.w || !screen.h) seen();
    onScreen();
    graph.batchUpdate(() => {
      for (const c of graph.getCells()) {
        if (mine.has(c.id)) continue;
        if (!kept.has(c.id)) { graph.removeCell(c); drawn.delete(c.id); }
        else if (c.isVisible()) c.setVisible(false);
      }
      for (const c of cells) {
        const was = drawn.get(c.id), cell = was && graph.getCellById(c.id), now = partsOf(c);
        if (cell && cell.isEdge() === (c.shape === 'edge') && (was.what === now.what || cell.isNode() || was.form === now.form)) {
          if (was.what !== now.what) { if (cell.isNode()) cell.setMarkup(c.markup); else cell.setAttrs(c.attrs); cell.setData(c.data, { overwrite: true }); }
          moveCell(cell, c, was.where);
          if (!cell.isVisible()) cell.setVisible(true);
        } else { if (cell) graph.removeCell(cell); c.shape === 'edge' ? graph.addEdge(c) : graph.addNode(c); }
        drawn.set(c.id, now);
      }
    });
    syncing = false;
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
  function reselect() {
    const ids = sel.getSelectedCells().map(c => c.id), along = pressed ? alongside(pressed.id, pressed.p) : [], on = ids.includes(along[0]);
    pressed = null;
    const grow = [...new Set(ids.map(groupOf).filter(Boolean))].flatMap(g => g.members).concat(on ? along : []).filter(id => !ids.includes(id));
    const drop = on ? [] : along.filter(id => ids.includes(id)), cells = xs => xs.map(id => graph.getCellById(id)).filter(Boolean);
    if (grow.length || drop.length) { syncing = true; sel.select(cells(grow)); sel.unselect(cells(drop)); syncing = false; }
    const keys = keysOfSelection(new Set(along));
    if (!same(keys, Shell.selection.peek())) pick(keys);
    grips();
    paintStates();
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
    pressed = !pointed(edge) && edge.getData()?.kind === 'line' ? { id: edge.id, p: [p.x, p.y] } : null;
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
    if ((k === 'box' || k === 'label') && atRest && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      const f = fieldUnder(e.clientX, e.clientY);
      if (down.selected && f?.it) { pickField(f); if (k === 'label') return; }
      else pickField(null);
    }
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
  const treeOf = id => Tree.treeOf(App.state.peek(), id);
  // Places for marks, written: a box's Position at its record in this view, a free shape's own place, kept
  // on the page; each the chart's own, the page's less its offset (Scene's furnish).
  const own = (x, y) => [round(x - scene.page.offset.x), round(y - scene.page.offset.y)];
  function place(tx, places) {
    const view = viewOf(), n = App.notes.peek(), page = scene.page;
    for (const [id, p] of places) {
      const m = scene.byId.get(id);
      if (!m) continue;
      if (m.type === 'box') {
        const old = n.position(treeOf(m.record), view), [x, y] = own(Math.max(0, p.x), Math.max(0, p.y));
        tx.note('Position', treeOf(m.record), { x, y, w: round(p.w ?? m.w), ...((p.h !== undefined || old?.h) && { h: round(p.h ?? old.h) }) }, { view });
      } else if (m.type === 'shape') {
        const points = rowOf(id)?.points, [x, y] = own(p.x, p.y);
        if (points) { tx.update(id, { x, y, ...(p.dx !== undefined && { points: points.map(([x, y]) => [round(x + p.dx), round(y + p.dy)]) }) }); continue; }
        const w = Math.min(p.w ?? m.w, page.w), h = Math.min(p.h ?? m.h, page.h), [cx, cy] = own(clamp(p.x, 0, page.w - w), clamp(p.y, 0, page.h - h));
        tx.update(id, { x: cx, y: cy, ...(p.w !== undefined && { w: round(w), h: round(h) }) });
      }
    }
  }
  // Marks moved, written: a gesture, so what was moved stays where it was put as the page sets the chart
  // again, and a framed page that grows for it is framed again (see draw).
  function moveTo(places) {
    if (!places.size) return;
    moving = true;
    try { App.change(tx => place(tx, places)); } finally { moving = false; }
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
      } else if (Math.abs(p.x - m.x) > 0.01 || Math.abs(p.y - m.y) > 0.01 || Math.abs(sz.width - m.w) > 0.01 || Math.abs(sz.height - m.h) > 0.01) {
        places.set(id, { x: p.x, y: p.y, ...(Math.abs(sz.width - m.w) > 0.01 || Math.abs(sz.height - m.h) > 0.01 ? { w: sz.width, h: sz.height } : {}) });
      }
    }
    moveTo(places);
  }
  const membersOf = f => [...f.members.map(id => scene.byId.get(id)), ...f.frames.flatMap(id => membersOf(scene.byId.get(id)))].filter(Boolean);
  graph.on('node:moved', ({ node }) => { dragging = null; moved([...new Set([node.id, ...sel.getSelectedCells().map(c => c.id)])]); });
  graph.on('node:resized', ({ node }) => { dragging = null; moved([node.id]); });
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
      const live = Scene.reflow(scene, rects);
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
          const [body, hit, cap] = c.getMarkup();
          body.attrs.d = f.kind === 'bracket' ? `M0.5,${f.h} V${f.h - 5} H${f.w - 0.5} V${f.h}` : `M0,0 H${f.w} V${f.h} H0 Z`;
          hit.attrs.width = f.w;
          c.setMarkup([body, hit, cap]);
          astray(f.id, true);
        }
      });
      paintStates();
    });
  }
  graph.on('node:moving', ({ node }) => { dragging = node.id; showHandles(null); follow(node); });
  graph.on('node:resizing', ({ node }) => { dragging = node.id; showHandles(null); follow(node); });

  // ---- Double-click to type: a box's text edits its record, a shape's its own ----
  function textAt(m, target) {
    const id = target?.closest?.('[data-text]')?.getAttribute('data-text');
    return m.texts?.find(it => it.id === id) ?? m.texts?.find(it => Tree.isField(App.state.peek()[it.id] ?? {})) ?? m.texts?.[0];
  }
  // A field typed over, in a box or on a line's label: a value, as entered; an option, from its list; a tag, ticked or
  // ruled out; a blank, its record made as it's typed; a free text, its words, {Entry} and all (see Fields).
  function editField(m, it, typed) {
    if (!it || still()) return;
    // What's typed in is the field selected, so Tab goes on from it and its row stays lit.
    if (isField(it)) field = { box: m.id, id: it.id };
    if (it.free) return writeText(m, it, typed);
    const st = App.state.peek(), r = it.blank ? null : st[it.id], kind = it.blank ? specOfField(m.record, it.blank.edge) : r && { type: Tree.typeOf(r), datatype: r.field };
    if (!kind || kind.type === 'object' || (r && r.args)) return;
    Shell.emit('field-edit', { box: m.id, id: it.id });
    const rect = fieldRect(m, it), at = graph.localToGraph(rect.x, rect.y + rect.h), box = root.getBoundingClientRect(), menuAt = { x: box.left + at.x, y: box.top + at.y + 2 };
    // The record, or a blank's: typed over where it's worked out, as the inspector enters one.
    // A blank of an entry its record's kind hasn't yet gives the kind the entry, as the inspector's Add does.
    const put = out => App.change(tx => {
      if (r && !r.computed) return tx.update(it.id, out);
      const at = r?.at ?? it.blank.at, edge = r?.edge ?? it.blank.edge, spec = { out: 'field' in out ? { field: out.field } : 'choice' in out ? { choice: out.choice } : { tag: out.tag }, args: [{ edge, loc: Tree.specOf(treeOf(at)) }] };
      if (it.blank && !App.schema.peek()[Tree.key(spec)]) tx.add('spec', { tree: spec });
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
    openEditor(it.blank ? { ...it, look: { ...it.look } } : it, { ...rect, x: m.type === 'box' ? m.x : rect.x - 4, w: m.type === 'box' ? m.w : Math.max(rect.w + 8, 80) }, typed ?? raw, text => {
      const v = Tree.parse(kind.datatype ?? Tree.classify(text), text);
      if (v === undefined || Tree.clean(text) === '' || (r && v === r.value)) return;
      put({ field: kind.datatype ?? Tree.classify(text), value: v });
    }, { selectAll: typed === undefined, ph: it.blank?.edge, tab: d => stepField(d, true) });
  }
  function edit(key, target, typed) {
    const [id, rowKey] = keyParts(key);
    const m = scene.byId.get(id);
    if (!m || still()) return;
    // What's typed over: a record's value as entered, not as the chart reads it; a shape's text as written.
    let it = null, rect, save, raw, escaped = null;
    const view = viewOf(), N = App.notes.peek();
    // A caption typed as the output's own name is no caption.
    const caption = (tx, p, text) => { const c = Tree.clean(text); tx.note('Caption', p, c && c !== Scene.outputName(N, p) ? c : undefined, { view }); };
    if (m.type === 'box' || (m.type === 'line' && m.texts?.length)) {
      it = textAt(m, target);
      return editField(m, it?.free || it?.blank || App.state.peek()[it?.id]?.edge !== undefined ? it : m.texts.find(x => App.state.peek()[x.id]?.edge !== undefined) ?? it, typed);
    } else if (m.type === 'frame') {
      it = m.caption;
      rect = { x: m.x, y: m.y, w: Math.max(160, m.w), h: m.label + 8 };
      save = text => App.change(tx => caption(tx, m.output, text));
    } else if (m.geometry === 'legend' && rowKey) {
      const r = m.rows.find(x => x.key === rowKey);
      if (!r) return;
      it = r.caption;
      rect = { x: m.x + r.x + r.sw.w + 6, y: m.y + r.y, w: r.w - r.sw.w - 6, h: r.h + 2 };
      // A row of one output captions that output in this view, wherever it's named. A row merging outputs
      // that look alike takes a caption of the legend's own, so no output's caption changes.
      save = text => App.change(tx => {
        const { [r.key]: _, ...rest } = m.captions, own = Tree.clean(text), base = scene.legend.find(x => x.key === r.key)?.caption;
        if (r.outputs.length > 1) tx.update(m.id, { captions: own && own !== base ? { ...rest, [r.key]: own } : rest });
        else { caption(tx, r.outputs[0], text); if (r.key in m.captions) tx.update(m.id, { captions: rest }); }
      });
    } else if (m.type === 'shape' && !['line', 'picture', 'group'].includes(m.geometry)) {
      const legend = m.geometry === 'legend';
      it = legend ? m.texts[0] : m.texts[0] ?? { look: m.look, text: '', lines: [] };
      rect = legend ? { x: m.x, y: m.y + 4, w: m.w, h: 18 } : { x: m.x, y: m.y, w: m.w, h: m.h };
      raw = legend ? m.title : rowOf(m.id)?.text;
      // A text box left empty goes, however it's left, as PowerPoint's does.
      const gone = tx => tx.remove(m.id);
      save = text => App.change(tx => m.geometry === 'text' && !text.trim() ? gone(tx) : tx.update(m.id, legend ? { title: text } : { text }));
      if (m.geometry === 'text' && !raw?.trim()) escaped = () => App.change(gone);
    }
    if (!it) return;
    openEditor(it, rect, typed ?? raw ?? it.text ?? '', save, { multiline: m.type === 'shape' && m.geometry !== 'legend', selectAll: typed === undefined, grow: !!m.auto, escaped, kept: m.type === 'shape' });
  }
  // Typing in place, over the mark: Enter keeps it (Shift+Enter breaks a shape's line), Esc doesn't, as a cell's in
  // Excel (but does what `escaped` says), unless it's `kept`, as a shape's text in PowerPoint; and leaving keeps it.
  // `grow`: it widens as it's typed, a text box nobody has sized; `box`: a new box of a kind.
  function openEditor(it, rect, text, save, { multiline = false, selectAll = false, grow = false, box = null, escaped = null, ph = null, complete = null, tab = null, kept = false } = {}) {
    over.querySelector('.dc-edit')?.remove();
    tipFor(null);
    const z = graph.zoom(), p = graph.localToGraph(rect.x, rect.y), t = it.look, size = px(t.Size) * z;
    const ed = document.createElement('div');
    ed.className = 'dc-edit' + (grow ? ' grow' : '') + (box || ph ? ' new' : '');
    ed.contentEditable = 'plaintext-only';
    ed.spellcheck = false;
    if (box || ph) ed.dataset.ph = box ?? ph;
    Object.assign(ed.style, { left: `${p.x}px`, top: `${p.y}px`, [grow ? 'minWidth' : 'width']: `${rect.w * z}px`, minHeight: `${rect.h * z}px`,
      font: `${t.Bold ? 700 : 400} ${t.Italic ? 'italic' : ''} ${size}px/${1.2 * (t.Spacing ?? 1)} ${Scene.fontFamily(t.Font)}`, textAlign: t.Align ?? 'center', color: t.Color,
      padding: box ? `${Math.max(0, (rect.h * z - size * 1.2 * (t.Spacing ?? 1)) / 2)}px ${9.6 * z}px` : `${2 * z}px ${7.2 * z}px` });
    ed.textContent = text;
    over.appendChild(ed);
    ed.focus();
    // Double-click selects it all, to type over; typing over starts after what was typed.
    const range = document.createRange(), s = getSelection();
    range.selectNodeContents(ed);
    if (!selectAll) range.collapse(false);
    s.removeAllRanges(); s.addRange(range);
    let done = false;
    const list = complete && completing(ed, complete);
    const finish = ok => { if (done) return; done = true; list?.close(); const v = ed.innerText.replace(/\n$/, ''); ed.remove(); root.focus({ preventScroll: true }); if (ok) save(v); else escaped?.(); };
    ed.addEventListener('keydown', e => {
      e.stopPropagation();
      if (list?.key(e)) return;
      if (e.key === 'Escape') { e.preventDefault(); finish(kept); }
      else if (e.key === 'Enter' && !(multiline && e.shiftKey)) { e.preventDefault(); finish(true); }
      // In a box's field, Tab keeps it and goes on to type in the next, as a form's does; Shift+Tab, the one before.
      else if (e.key === 'Tab' && tab) { e.preventDefault(); finish(true); setTimeout(() => tab(e.shiftKey ? -1 : 1)); }
    });
    ed.addEventListener('blur', () => finish(true));
    return ed;
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
  // place. Selected, Delete hides it at the scope, Ctrl+C copies it, and a right-click offers what applies. Its row in
  // the inspector lights with it, and pointing at the row lights it here. Showing or hiding one is a Shown note at the
  // entry's pattern at the scope; a free text is a Text note there; each act is one change.
  const st = () => App.state.peek();
  const isField = it => !!it && (it.blank || it.free || st()[it.id]?.edge !== undefined);
  // A text's rect on the page, as the scene sets its lines in its mark.
  function fieldRect(m, it) {
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
      return { m, it: isField(it) ? it : null };
    }
    return null;
  }
  // Where a field's row is in the inspector: its record's, or a blank's place there.
  const rowKey = it => !it ? null : it.blank ? `${it.blank.at}|${Tree.norm(it.blank.edge)}` : it.free ? null : it.id;
  const fieldName = it => it.blank ? it.blank.edge : it.free ? 'Text' : st()[it.id]?.edge ?? '';
  // The field selected, as the scene now draws it; a blank typed into, its record now; null once it isn't drawn.
  const filled = (m, id) => { const [at, edge] = id.slice(6).split('|'); return m?.texts?.find(x => st()[x.id]?.at === at && Tree.same(st()[x.id].edge, edge)); };
  const fieldNow = () => {
    const m = field && scene?.byId.get(field.box), it = m?.texts?.find(x => x.id === field.id) ?? (field?.id.startsWith('blank:') ? filled(m, field.id) : null);
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
    const h = hovered && scene.byId.get(hovered.box)?.texts?.find(x => x.id === hovered.id);
    // What was pointed at and is drawn no longer (a blank typed into) is pointed at no longer, till the pointer moves.
    if (hovered && !h) { hovered = null; tipFor(null); root.classList.remove('on-field'); }
    if (h && hovered.id !== field?.id) draw(fieldRect(scene.byId.get(hovered.box), h), 'hover');
    if (litKey) for (const m of scene.marks) for (const it of m.texts ?? []) if (rowKey(it) === litKey && it.lines?.length) draw(fieldRect(m, it), 'lit');
    const d = dropOn && scene.byId.get(dropOn);
    if (d) draw(d, 'drop', 4);
    fieldLit.value = rowKey((h && hovered ? h : null) ?? fieldNow()?.it) ?? null;
    fieldPicked.value = field ? `${field.box}|${field.id}` : null;
  }
  // Its entry's name, on hover, a moment after the pointer stops on it, as a tooltip shows.
  const tip = document.createElement('div');
  tip.className = 'dc-tip';
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  over.appendChild(tip);
  let tipTimer = 0;
  function tipFor(f) {
    clearTimeout(tipTimer);
    tip.hidden = true;
    if (!f?.it) return;
    tipTimer = setTimeout(() => {
      const r = fieldRect(f.m, f.it), a = graph.localToGraph(r.x + r.w / 2, r.y + r.h);
      tip.textContent = f.it.blank ? `${fieldName(f.it)}, blank` : fieldName(f.it);
      Object.assign(tip.style, { left: `${a.x}px`, top: `${a.y + 6}px` });
      tip.hidden = false;
    }, 450);
  }
  // The pointer says what a click does: the text pointer over a field, move over a selected box's room.
  function hover(f) {
    const was = hovered;
    hovered = f?.it && !dragging ? { box: f.m.id, id: f.it.id } : null;
    root.classList.toggle('on-field', !!hovered);
    root.classList.toggle('on-body', !!f && !f.it && f.m.type === 'box' && sel.isSelected(graph.getCellById(f.m.id) ?? {}));
    if (was?.id !== hovered?.id || was?.box !== hovered?.box) { paintFields(); tipFor(hovered ? f : null); }
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
    const t = treeOf(at), N = App.notes.peek(), all = Object.values(App.schema.peek()).filter(x => x.args?.length === 1 && Tree.same(x.args[0].edge, edge) && 'choice' in x.out);
    const fit = all.filter(x => t && Tree.narrower(t, x.args[0].loc)), specs = fit.length ? fit : all.filter(x => !x.args[0].loc.args);
    const rank = o => N.optionOrder({ out: { choice: o }, args: Tree.bare(specs[0]).args }) ?? Infinity;
    return [...new Set(specs.map(s => s.out.choice))].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  }
  // The entries a mark's record has, or could have by its kind's: their labels, in the inspector's order.
  function entriesOf(m) {
    const s = st(), t = treeOf(m.record), N = App.notes.peek(), out = new Map();
    for (const e of Tree.index(s).entries.get(m.record) ?? []) out.set(Tree.norm(s[e].edge), s[e].edge);
    for (const x of Object.values(App.schema.peek())) if (t && x.args?.length === 1 && Tree.narrower(t, x.args[0].loc) && !N.check(Tree.bare(x))) out.set(Tree.norm(x.args[0].edge), x.args[0].edge);
    const order = e => Tree.same(e, 'Name') ? -1 : N.order({ args: [{ edge: e, loc: t }] }) ?? Infinity;
    return [...out.values()].sort((a, b) => order(a) - order(b) || a.localeCompare(b));
  }
  // Whether a mark shows an entry of a label at a record (its own, or one in it), as a field or a blank.
  const shows = (m, edge, at = m.record) => (m.texts ?? []).some(it => it.blank ? it.blank.at === at && Tree.same(it.blank.edge, edge) : st()[it.id]?.at === at && Tree.same(st()[it.id].edge, edge));
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
    const s = scopeNow(canvas), view = viewOf(), rec = treeOf(m.record), N = App.notes.peek();
    const at = p => N.notes('Text').find(n => n.view === view && Tree.key(n.pattern) === Tree.key(p));
    // A new one goes under the mark's texts: in a box, across it; on a line, under its label, or at its middle.
    const raw = it?.free.text ?? '', drawn = m.texts.filter(x => x.lines?.length).map(x => fieldRect(m, x)), mid = m.points?.[Math.floor(m.points.length / 2)] ?? [m.x, m.y];
    const look = it?.look ?? { ...Scene.DEFAULTS.text, ...Object.fromEntries(Object.keys(Scene.DEFAULTS.text).map(k => [k, m.settings[k]?.value]).filter(([, v]) => v !== undefined)), Bold: false };
    const under = drawn.length ? Math.max(...drawn.map(r => r.y + r.h)) : m.type === 'box' ? m.y + m.h / 2 - 8 : mid[1];
    const rect = it ? fieldRect(m, it) : { x: m.type === 'box' ? m.x : drawn[0]?.x ?? mid[0], y: under, w: m.type === 'box' ? m.w : 120, h: px(look.Size) * 1.2 };
    const labels = entriesOf(m);
    openEditor({ look }, { ...rect, x: m.type === 'box' ? m.x : rect.x - 4, w: m.type === 'box' ? m.w : Math.max(rect.w + 8, 120) }, typed ?? raw, text => {
      if (!Tree.clean(text)) return it && unText(m);
      App.change(tx => { for (const p of s.own ? [rec] : s.outputs) tx.note('Text', p, { ...(at(p)?.value ?? {}), text: text.trim() }, { view }); },
        { dated: false, say: it ? null : `Added text to ${whereSaid([m], s)}` });
    }, { multiline: true, selectAll: typed === undefined && !!raw, ph: 'Text', complete: labels, tab: it ? d => stepField(d, true) : null, kept: true });
  }
  // A free text taken away at the scope: the scope's own note goes; and where the mark's own is taken away but a group's
  // would still give it text, it keeps an empty one, the narrowest, which gives none.
  function unText(m, s = scopeNow(canvas)) {
    const view = viewOf(), rec = treeOf(m.record), N = App.notes.peek(), s0 = st();
    const ids = [...Tree.dependents(s0, [m.record])].filter(id => id === m.record || s0[id]?.at);
    return App.change(tx => {
      if (!s.own) return s.outputs.forEach(p => tx.note('Text', p, undefined, { view }));
      const others = N.notes('Text').some(n => n.view === view && Tree.key(n.pattern) !== Tree.key(rec) && ids.some(id => Tree.fits(s0, id, n.pattern)));
      tx.note('Text', rec, others ? { text: '' } : undefined, { view });
    }, { dated: false, say: `Removed the text from ${whereSaid([m], s)}` });
  }
  // A field hidden: its entry, or a blank, at the scope; a free text taken away.
  function hideField(f = fieldNow(), s) {
    if (!f) return;
    field = null;
    if (f.it.free) return unText(f.m, s);
    setField([f.m], fieldName(f.it), false, s);
  }
  // Every mark of the narrowest group the selection's first box or line is in, as the Key and Styles group them.
  function selectLike() {
    const m = selected().find(x => x.type === 'box' || x.type === 'line');
    if (!m) return false;
    const gs = groupsAt(scene, m), g = gs.find(x => x.marks.size > 1) ?? gs[0];
    if (g) Shell.select([...g.marks]);
  }

  // ---- Adding a box: a record of a kind, named as it's typed ----
  // Nothing is made until a name is, and Esc makes nothing. The box is dropped where it was asked for, clear
  // of what's there, and loosely: once a line relates it, it goes beside its relatives (Scene).
  // `guide`, the line a handle was dragged out on, stays drawn to it while it's named, so it's plain the two will be related.
  function create(kind, at, { relate, guide } = {}) {
    if (still() || !scene || !kind) return guide?.remove();
    if (!at) { const r = root.getBoundingClientRect(); at = graph.clientToLocal(r.left + r.width / 2, r.top + r.height / 2); }
    Shell.store.set('kind', kind);
    const w = 200, h = 44, p = freeSpot(scene, w, h, at), view = viewOf(), [x, y] = own(p.x, p.y);
    guide?.setAttribute('d', guide.getAttribute('d').replace(/L[^L]*$/, `L${p.x + w / 2},${p.y + h / 2}`));
    openEditor({ look: { ...Scene.DEFAULTS.text, Bold: true } }, { x: p.x, y: p.y, w, h }, '', name => {
      guide?.remove();
      name = Tree.clean(name);
      if (!name) return;
      let id = null;
      if (!App.change(tx => {
        id = tx.add('record', { kind });
        tx.add('record', { at: id, edge: 'Name', field: 'text', value: name });
        tx.note('Position', { id, kind }, { x, y, loose: true }, { view });
      })) return;
      if (relate) Shell.emit('relate-open', [relate, id]); else Shell.select([id]);
    }, { box: kind, escaped: () => guide?.remove() });
  }
  const addAt = e => { if (!still()) create(lastKind(), graph.clientToLocal(e.clientX, e.clientY)); };

  // ---- Relating: from near a box's edge to another box, or to empty page for a new one ----
  // The handles show on the box whose outline the pointer nears, on the outline, as PowerPoint's connection
  // points are: at the middle of each side (a triangle's apex, slopes and base), or off it along the side as far
  // as keeps them clear of the lines there, of the box's grips and of each other, so a click by a box on a line
  // takes the line. A side with no such place has none.
  let near = null, placed = null;
  const handles = ['n', 'e', 's', 'w'].map(side => {
    const h = document.createElement('div');
    h.className = `dc-handle ${side}`;
    h.addEventListener('pointerdown', e => { if (near && h.at && e.button === 0) { e.preventDefault(); e.stopPropagation(); relating(near, h.at, e); } });
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
  const ALONG = [0.5, 0.38, 0.62, 0.26, 0.74, 0.14, 0.86], CLEAR = 16;
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
    const dots = !gripped ? [] : [0, 0.5, 1].flatMap(fx => [0, 0.5, 1].filter(fy => (fx !== 0.5 || fy !== 0.5) && (fx !== 0.5 || m.w * z >= 40) && (fy !== 0.5 || m.h * z >= 40))
      .map(fy => [m.x + m.w * fx, m.y + m.h * fy]));
    const clear = p => segs.every(([a, b]) => toSegment(p, a, b) * z >= CLEAR) && dots.every(d => Math.hypot(p[0] - d[0], p[1] - d[1]) * z >= CLEAR);
    for (const h of handles) {
      const side = h.classList[1], p = ALONG.map(f => sidePoint(m, side, f)).find(p => p && clear(p));
      h.at = p ?? null;
      h.hidden = !p;
      if (p) { const g = graph.localToGraph(p[0], p[1]); h.style.left = `${g.x}px`; h.style.top = `${g.y}px`; dots.push(p); }
    }
    root.classList.add('relating-on');
  }
  // The box whose outline a point is within 12 px of, on screen, the nearest.
  function nearEdge(p) {
    const z = graph.zoom(), r = 12 / z;
    let best = null, bd = Infinity;
    for (const m of scene.marks) {
      if (m.type !== 'box' || p.x < m.x - r || p.x > m.x + m.w + r || p.y < m.y - r || p.y > m.y + m.h + r) continue;
      const o = outlineOf(m), d = Math.min(...o.map((a, i) => toSegment([p.x, p.y], a, o[(i + 1) % o.length]))) * z;
      if (d <= 12 && d < bd) { best = m; bd = d; }
    }
    return best;
  }
  // Pointing at a box shows its handles, as Lucidchart's do, and at a field, that it's one (see Fields).
  root.addEventListener('pointermove', e => {
    if (!scene || e.target.closest?.('.dc-handle, .dc-edit, .dc-complete')) return;
    const f = e.buttons || pointing || root.classList.contains('relating') ? null : fieldUnder(e.clientX, e.clientY);
    showHandles(e.buttons ? null : nearEdge(graph.clientToLocal(e.clientX, e.clientY)) ?? (f?.m.type === 'box' ? f.m : null));
    hover(f);
  });
  root.addEventListener('pointerleave', e => { if (!e.relatedTarget?.closest?.('.dc-handle')) { showHandles(null); hover(null); } });
  for (const name of ['scale', 'translate']) graph.on(name, () => { if (!quiet) { framed = false; left = wanted = null; onScreen(); } showHandles(null); grips(); zoomLevel.value = graph.zoom(); });

  // A relation being drawn from a box: from one of its handles while the button is held (`down`, its press),
  // or from the middle of the box, for Relate…, until the next click. On another box, the two's relations are
  // asked for; on empty page, a new box of a kind, or a line. A handle clicked, not dragged, is a click on its box.
  function relating(from, start = [from.x + from.w / 2, from.y + from.h / 2], down = null) {
    const line = document.createElementNS(NS, 'path'), click = !down;
    line.setAttribute('class', 'dc-relating');
    marks.appendChild(line);
    let target = null, unlayer = null;
    root.classList.add('relating');
    const at = ev => graph.clientToLocal(ev.clientX, ev.clientY);
    const boxAt = p => scene.marks.find(m => m.type === 'box' && m.id !== from.id && p.x >= m.x && p.x <= m.x + m.w && p.y >= m.y && p.y <= m.y + m.h) ?? null;
    const move = ev => {
      const p = at(ev);
      target = boxAt(p);
      line.setAttribute('d', `M${start[0]},${start[1]} L${p.x},${p.y}`);
      paintStates(new Map([[from.id, ['accent', 1]], ...(target ? [[target.id, ['accent', 1]]] : [])]));
    };
    const end = () => {
      removeEventListener('pointermove', move); removeEventListener(click ? 'mousedown' : 'pointerup', up, true); removeEventListener('keydown', esc, true);
      unlayer?.(); line.remove(); root.classList.remove('relating'); paintStates();
    };
    // Dropped on another box, the two's relations are asked for, in the two-box panel, a relation ticked there pending
    // through the bar; dropped in empty room, a new box goes there, of the kind last made, named as it's typed, as
    // Lucidchart's does, and then the two's relations are asked for; Esc, or dropping where it began, makes nothing.
    const up = ev => {
      if (click) { ev.preventDefault(); ev.stopPropagation(); }
      end();
      if (down && Math.hypot(ev.clientX - down.clientX, ev.clientY - down.clientY) < 4) return take(graph.getCellById(from.id));
      const p = at(ev);
      target = boxAt(p);
      if (target) Shell.emit('relate-open', [from.id, target.id]);
      else if (!ev.target.closest?.('.dc') || ev.target.closest?.('.dc-edit') || ev.button !== 0) return;
      else if (Math.hypot(p.x - start[0], p.y - start[1]) > 12 / graph.zoom()) { const guide = marks.appendChild(line.cloneNode()); create(lastKind(), p, { relate: from.id, guide }); }
    };
    const esc = ev => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); end(); } };
    addEventListener('pointermove', move);
    addEventListener(click ? 'mousedown' : 'pointerup', up, true);
    if (click) unlayer = Shell.layer(end); else addEventListener('keydown', esc, true);
  }

  // ---- Right-click: what applies to what's under the pointer ----
  root.addEventListener('contextmenu', e => e.preventDefault());
  const contextOf = ({ e, node, edge }) => {
    let cell = node ?? edge ?? null;
    if (cell?.getData()?.kind === 'label') cell = graph.getCellById(cell.getData().mark);
    const at = { x: e.clientX, y: e.clientY }, k = cell?.getData()?.kind, p = graph.clientToLocal(at.x, at.y);
    if (!cell || k === 'page' || k === 'ink') return Shell.menu(at, pageItems(p));
    // A field of a mark selected already has its own menu, as a click selects it; anywhere else, the mark's.
    const f = (k === 'box' || k === 'line') && sel.isSelected(cell) ? fieldUnder(at.x, at.y) : null;
    if (f?.it && f.m.id === cell.id) { pickField(f); return Shell.menu(at, fieldItems(f)); }
    pickField(null);
    // A line is taken as a click takes it, with the lines drawn along it there.
    if (edge && k === 'line' && !sel.isSelected(cell)) { pressed = { id: cell.id, p: [p.x, p.y] }; sel.reset(cell); } else take(cell);
    Shell.menu(at, markItems());
  };
  for (const name of ['node:contextmenu', 'edge:contextmenu', 'blank:contextmenu']) graph.on(name, contextOf);
  const ORDER = () => [{ label: 'Bring to front', keys: '$mod+Shift+]', run: () => order('front') }, { label: 'Bring forward', keys: '$mod+]', run: () => order('forward') },
    { label: 'Send backward', keys: '$mod+[', run: () => order('backward') }, { label: 'Send to back', keys: '$mod+Shift+[', run: () => order('back') }];
  // What applies to what's selected: its text and fields first, then its look, then what it's like and related to,
  // then hiding and deleting it, its order and grouping, and the clipboard.
  function markItems() {
    const ms = selected(), one = ms.length === 1 ? ms[0] : null, bound = ms.filter(m => m.type === 'box' || m.type === 'line'), ro = still();
    const text = one?.type === 'shape' && !['line', 'picture', 'group'].includes(one.geometry), fielded = bound.length && bound.length === ms.length;
    const worded = one && (one.type === 'box' || (one.type === 'line' && one.texts?.some(isField)));
    return [
      ...(text && !ro ? [{ label: 'Edit text', keys: 'Enter', run: () => edit(one.id) }, '-'] : []),
      ...(fielded ? [...(worded ? [{ label: 'Edit text', keys: 'Enter', disabled: ro, run: () => edit(one.id) }] : []),
        { label: 'Show on chart', disabled: ro, items: showItems(bound) }, ...(one ? [{ label: 'Add text', disabled: ro, run: () => writeText(one) }] : []), '-'] : []),
      ...formatItems(ms, ro),
      ...(bound.length ? [{ label: 'Select all like this', keys: '$mod+Shift+Space', run: selectLike }] : []),
      ...(one?.type === 'box' && !ro ? [{ label: 'Relate…', run: () => relating(one) }] : []), ...(bound.length ? ['-'] : []),
      ...(bound.length ? [{ label: 'Hide in this view', keys: 'Delete', disabled: ro, run: () => remove() }] : []),
      { label: 'Delete', keys: bound.length ? 'Shift+Delete' : 'Delete', danger: true, disabled: ro, run: () => remove(!!bound.length) },
      '-', { label: 'Order', disabled: ro || ms.every(m => m.type === 'frame'), items: ORDER() },
      ...(ms.some(m => m.geometry === 'group') ? [{ label: 'Ungroup', keys: '$mod+Shift+G', disabled: ro, run: ungroup }]
        : placeable().length > 1 ? [{ label: 'Group', keys: '$mod+G', disabled: ro, run: group }] : []),
      '-', { label: 'Copy', keys: '$mod+C', run: copyOut }, { label: 'Paste', keys: '$mod+V', disabled: ro || !(clip?.items.length || clip?.field || clip?.free !== undefined), run: () => paste() },
    ];
  }
  // Show on chart: each entry the selection's records have, or could have, a checkbox row, ticked where every one of
  // them shows it; switched at the scope.
  const showItems = ms => entriesOf(ms[0]).filter(e => ms.every(m => entriesOf(m).some(x => Tree.same(x, e))))
    .map(e => { const on = ms.every(m => shows(m, e)); return { label: e, checked: on, run: () => setField(ms, e, !on) }; });
  // Format: the format bar's Fill, Outline and Font, opened from here; and its painter's Copy and Paste formatting.
  function formatItems(ms, ro) {
    if (!ms.length) return [];
    const bar = typeof FormatBar !== 'undefined' ? FormatBar : {}, open = what => () => bar.open ? bar.open(what) : document.querySelector(`.fb [data-fb="${what}"]`)?.click();
    const boxy = ms.some(m => m.type === 'box' || (m.type === 'shape' && m.geometry !== 'line'));
    return [{ label: 'Format', disabled: ro, items: [...(boxy ? [{ label: 'Fill…', run: open('fill') }] : []), { label: 'Outline…', run: open('outline') }, { label: 'Font…', run: open('font') }] },
      ...(bar.copyLook ? [{ label: 'Copy formatting', keys: '$mod+Shift+KeyC', run: () => bar.copyLook() }, { label: 'Paste formatting', keys: '$mod+Shift+KeyV', disabled: ro || !bar.canPasteLook?.(), run: () => bar.pasteLook() }] : []), '-'];
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
    if (f.it.free) { const N = App.notes.peek(), n = N.notes('Text').find(x => x.note === f.it.free.note); if (n) tx.note('Text', n.pattern, { ...n.value, [label]: v }, { view }); return; }
    // A group that names the boxes by another of their entries can't name this one's text: it's this box's.
    const rec = treeOf(f.m.record), e = f.it.blank ? { args: [{ edge: name, loc: rec }] } : treeOf(f.it.id);
    for (const p of s.own ? [rec] : s.outputs) { const [pattern, param] = fieldAt(e, rec, scopeAt(p, name), name); tx.note(label, param ? fieldAt(e, rec, rec, name)[0] : pattern, v, { view }); }
  }
  // A field's own: typed in, hidden from this box or from all like it, its text's look.
  function fieldItems(f) {
    // All like it: the group whose note shows the field here, so hiding it there takes back what showed it; else the
    // scope's group, or the narrowest.
    const ro = still(), s = scopeNow(canvas), all = groupOfNote(f.m, f.it.shownBy) ?? (s.own ? groupsAt(scene, f.m).find(x => x.marks.size > 1) : s);
    const t = f.it.look;
    const restyle = (label, v) => App.change(tx => styleField(tx, f, label, v, s), { dated: false });
    return [
      { label: f.it.free ? 'Edit text' : 'Edit', keys: 'Enter', disabled: ro, run: () => editField(f.m, f.it) },
      '-', { label: f.m.type === 'line' ? 'Hide from this line' : 'Hide from this box', keys: s.own ? 'Delete' : undefined, disabled: ro, run: () => hideField(f, { own: true }) },
      ...(all ? [{ label: `Hide from ${named(all)}`, keys: s.own ? undefined : 'Delete', disabled: ro, run: () => hideField(f, all),
        // Pointed at, the boxes it reaches are cued on the chart, as the scope's are (the format bar's cue).
        point: on => canvas.cue?.(on && all.marks ? [...all.marks] : null) }] : []),
      '-', { label: 'Format', disabled: ro, items: [
        { label: 'Bold', checked: !!t.Bold, run: () => restyle('Bold', !t.Bold) }, { label: 'Italic', checked: !!t.Italic, run: () => restyle('Italic', !t.Italic) },
        { label: 'Underline', checked: !!t.Underline, run: () => restyle('Underline', !t.Underline) }] },
      '-', { label: 'Copy', keys: '$mod+C', run: () => copyField(f) },
    ];
  }
  const pageItems = p => [
    ...kinds().map(k => ({ label: `New ${k}`, disabled: still(), run: () => create(k, p) })), '-',
    { label: 'Paste', keys: '$mod+V', disabled: still() || !clip?.items.length, run: () => paste() }, '-',
    { label: 'Select all', keys: '$mod+KeyA', run: () => sel.reset(graph.getCells().filter(selectable)) }, '-',
    { label: 'Zoom to fit', keys: 'Shift+Digit1', run: () => zoom('fit') }, '-', { label: 'Tidy', disabled: still(), run: tidy },
  ];

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
  const TRACES = ['dc-hl', 'dc-row', 'dc-sel', 'dc-cue', 'strong', 'deep', 'pulse', 'hloop', 'haccent', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
  function paintStates(extra) {
    if (!scene) return;
    marks.querySelectorAll('.dc-hl, .dc-row, .dc-group, .dc-cue').forEach(n => n.remove());
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
    // The format bar's scope, while a group is chosen or pointed at: each mark it reaches lit, as a group is.
    const cuedHere = cued && new Set([...cued].map(id => scene.byId.get(id)).filter(m => m && (m.type === 'box' || m.type === 'line')).map(m => m.merged ?? m.id));
    for (const id of cuedHere ?? []) outline(scene.byId.get(id), 'dc-cue', 3);
    // A selected line is traced in the accent, as Office marks one.
    for (const c of sel.getSelectedCells()) if (c.isEdge()) { const m = scene.byId.get(c.id); if (m?.points) outline(m, 'dc-sel'); }
    const dim = !!hl?.dim && lit.size;
    for (const c of graph.getCells()) {
      const v = graph.findViewByCell(c);
      if (!v) continue;
      const k = c.getData()?.kind, id = k === 'label' ? c.getData().mark : c.id, el = v.container;
      // What a pending change would add or take away isn't dimmed: it's what's being asked about.
      el.classList.toggle('dc-dim', !!dim && k !== 'page' && !lit.has(id) && !ink?.lit.has(id));
      // And every mark the scope doesn't reach is dulled, the page's own furniture with them.
      el.classList.toggle('dc-dull', !!cuedHere && k !== 'page' && k !== 'ink' && !cuedHere.has(id));
      if (c.isEdge()) { el.classList.remove(...TRACES); el.classList.add(...traced.get(c.id) ?? []); }
    }
    paintFields();
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
      changed: new Set(Object.keys(r.changed ?? {})), scene: null } : null;
    if (r) return show();
    if (!clearing) { clearing = true; queueMicrotask(() => { clearing = false; show(); }); }
  }
  // A redline's ink, on the scene the change, made, draws (`after`), against the scene drawn now (`before`): what would
  // appear, blue; a text that would change, blue under what it said, struck in red; and what would go, struck in red
  // where it's drawn now, as the page will set it (by its offset), a line whose boxes will stand elsewhere taking a
  // way of its own among them (Layout.around). It moves nothing: `cells`, what goes, drawn over the scene; `lit`, every
  // cell inked, which a highlight doesn't dim.
  function inked(r, after, before) {
    const near = (a, b) => Math.abs(a - b) < 0.01, dx = after.page.offset.x - before.page.offset.x, dy = after.page.offset.y - before.page.offset.y;
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
  // The format bar's scope on the chart, its cue: `ids`, the marks a group of the selection reaches (boxes and lines,
  // by id), each lit with the group light and every other mark dulled; null clears it. It's drawn over the scene and
  // changes nothing in it, so no export draws it.
  function cue(ids) {
    const next = ids ? new Set(ids) : null;
    if (JSON.stringify(next && [...next]) === JSON.stringify(cued && [...cued])) return;
    cued = next;
    paintStates();
  }
  // A format pointed at in the format bar, as it would look: the chart drawn from `wb`, the workbook as the
  // change would leave it, PowerPoint's live preview; with `moves`, laid out again (Tidy). null ends it.
  function restyle(wb, { moves = false } = {}) { styled = wb && { wb, moves }; show(); }
  // Boxes and lines the view hides are drawn while they're highlighted, redlined, or asked for. (An entry
  // isn't: it lights what it sits in, so no box changes size under the pointer. Nor is a record of a kind the
  // view hides, a tax year say, or a relation to one: they aren't of this chart.) A preview is drawn while
  // it's quick: a redline or a restyle on a chart of a few hundred marks, and the hidden drawn only while
  // they're a few dozen; past that, what's drawn is lit, and the formula bar says the rest.
  const QUICK = { marks: 400, hidden: 40 };
  let asked = [], redDrawn = null, styled = null, styledDrawn = null, standIns = new Map();
  function reveal(ids) { asked = ids ? [...ids] : []; show(); }
  function show(again = false) {
    const base = App.scene.peek(), quick = (base?.marks.length ?? 0) <= QUICK.marks, s = styled && quick ? styled : null;
    // The scene a redline draws, for the view and day shown: laid out now where the chart is quick, else ahead.
    if (red && base && !(red.scene?.view === base.view && red.scene.day === base.day))
      red.scene = laidAhead.get(red.state)?.get(`${base.view}|${base.day}`) ?? (quick ? Scene.of(App.shown.peek(), App.chart.peek(), base.view, base.day, { state: red.state, computed: red.computed, ahead: true }) : null);
    const r = red?.scene ? red : null;
    const st = App.state.peek(), N = App.notes.peek();
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
    const ids = [...new Set([...asked, ...(hl ? hl.map.keys() : [])])].filter(id => hidden(id) && !standIns.has(id)).sort();
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
    const sc = yield* Scene.steps(App.shown.peek(), App.chart.peek(), base.view, base.day, { state: r.state, computed: r.computed, ahead: true });
    (laidAhead.get(r.state) ?? laidAhead.set(r.state, new Map()).get(r.state)).set(`${base.view}|${base.day}`, sc);
    if (red?.state === r.state && !red.scene) show();
  }
  function ahead() {
    const base = App.scene.peek(), r = red && !red.scene ? red : null, wb = styled?.wb ?? App.shown.peek(), state = r?.state ?? (styled ? App.state.peek() : null);
    if (!base || typeof requestIdleCallback !== 'function') { aheadOf = null; return; }
    if (aheadOf?.wb === wb && aheadOf.state === state && aheadOf.base === base && aheadOf.soon === soon) return;
    const mine = aheadOf = { wb, state, base, soon }, chart = App.chart.peek(), computed = App.computed.peek();
    const jobs = [...soon && soon !== base.day ? [on(soon, base.view)] : [], ...r ? [redAhead(r, base)] : styled ? [Scene.steps(wb, chart, base.view, base.day, { state, computed, ahead: true })] : [],
      ...App.views.peek().filter(v => v.layout === 'chart' && v.id !== base.view).map(v => Scene.steps(App.shown.peek(), chart, v.id, base.day, { state: App.state.peek(), computed }))];
    const live = () => aheadOf === mine && App.scene.peek() === base && jobs.length;
    const step = idle => {
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
  const placeable = () => selected().flatMap(m => m.geometry === 'group' ? m.members.map(id => scene.byId.get(id)) : [m]).filter(m => m && (m.type === 'box' || m.type === 'shape'));
  // A new shape goes into free space, never over what's drawn: near the middle of what's on screen, as
  // PowerPoint puts one; a text box or frame in the page's bands round the chart; a key at the bottom right,
  // in two columns.
  const SIZE = { line: [160, 8], 'arrow-line': [160, 8], frame: [320, 200], picture: [160, 100] };
  function insert(geometry, opts = {}) {
    const view = viewOf(), s = scene, r = root.getBoundingClientRect(), mid = graph.clientToLocal(r.left + r.width / 2, r.top + r.height / 2), sel0 = placeable();
    let row = { view, geometry, ...opts };
    if (geometry === 'arrow-line') row = { ...row, geometry: 'line', format: { Arrow: 'end' } };
    if (geometry === 'legend') row = { title: 'Key', columns: 2, ...row };
    if (geometry === 'text') row.text = opts.text ?? '';
    if (geometry === 'frame' && sel0.length && opts.x === undefined) {
      const b = { x: Math.min(...sel0.map(m => m.x)), y: Math.min(...sel0.map(m => m.y)), r: Math.max(...sel0.map(m => m.x + m.w)), d: Math.max(...sel0.map(m => m.y + m.h)) };
      row = { ...row, x: round(b.x - 14), y: round(b.y - 28), w: round(b.r - b.x + 28), h: round(b.d - b.y + 42), text: opts.text ?? 'Frame',
        format: { Layer: -1 + Math.min(0, ...s.marks.map(m => m.settings?.Layer?.value ?? m.look?.Layer ?? 0)) } };
    } else if (row.geometry === 'line' && opts.points) Object.assign(row, { x: opts.points[0][0], y: opts.points[0][1] });
    else if (opts.x === undefined) {
      const drawn = geometry === 'text' || geometry === 'legend' ? Scene.shapeOf(row, s) : null;
      const [w, h] = drawn ? [drawn.w, drawn.h] : [opts.w, opts.h].every(Number.isFinite) ? [opts.w, opts.h] : SIZE[geometry] ?? [140, 70];
      const p = freeSpot(s, w, h, geometry === 'legend' ? { x: s.page.w, y: s.page.h } : mid, { bands: ['text', 'legend', 'frame'].includes(geometry) });
      Object.assign(row, { x: round(p.x), y: round(p.y) }, drawn ? {} : { w, h });
      if (row.geometry === 'line') Object.assign(row, { h: 0, points: [[row.x, row.y + h / 2], [row.x + w, row.y + h / 2]] });
    }
    // A text box is made once something is typed in it, as a box is once it's named: left empty, however it's
    // left, it makes nothing.
    const typing = geometry === 'text' && !row.text && Scene.shapeOf(row, s), at = typing && { x: row.x, y: row.y, w: typing.w, h: typing.h };
    // Placed on the page, kept as the chart's own (see place).
    if (row.x !== undefined) [row.x, row.y] = own(row.x, row.y);
    if (row.points) row.points = row.points.map(([x, y]) => own(x, y));
    const add = it => { let id = null; if (!App.change(tx => { id = tx.add('shape', it); })) return null; Shell.select([id]); return id; };
    if (!typing) return add(row);
    Shell.select([]);
    openEditor({ look: typing.look }, at, '', text => { if (text.trim()) add({ ...row, text }); }, { multiline: true, grow: !!typing.auto, kept: true });
    return null;
  }
  // Delete hides what's selected in this view and deletes a free shape; with `records`, Shift+Delete, it
  // deletes the records too, and what's in or on them, as every deletion of a record is made: redlined first, the
  // bar asking until when (App.deleting), Enter making it. A toast says what went.
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
        else { tx.remove(id); gone.push(as(m)); }
      }
    };
    if (doomed.length) return App.deleting(doomed.map(m => m.record), counted(doomed.map(m => as(m))), { source: 'chart', also: rest, done: () => Shell.select([]) });
    const c = App.change(rest, { say: () => said(hid, gone, view) });
    if (c) Shell.select([]);
    else if (worked.length) Shell.toast(worked.length > 1 ? 'Formulas work these out' : 'A formula works this out');
  }
  const SHAPE = { text: 'text box', legend: 'key', picture: 'picture', line: 'line', group: 'group', frame: 'frame' };
  // A line by its relation, at its place (Notes.segmentOf), as History and the formula bar say it: Ownership: The BDC →
  // Northpine Software, LLC.
  const lineOf = id => { const N = App.notes.peek(), st = App.state.peek(); return `${N.nameOf(st, id)}: ${N.segmentOf(st, id)}`; };
  const called = m => m.type === 'box' ? nameOf(m.record) : m.type === 'line' ? lineOf(m.record) : m.type === 'frame' ? `the ${m.caption.text} frame`
    : `the ${SHAPE[m.geometry] ?? 'shape'}`;
  const counted = ms => ms.length === 1 ? ms[0].name : ms.every(m => m.type === 'box') ? `${ms.length} boxes` : ms.every(m => m.type === 'line') ? `${ms.length} lines` : `${ms.length} items`;
  function said(hid, gone, view) {
    const rows = hid.filter(m => m.type === 'row'), marks = hid.filter(m => m.type !== 'row');
    const parts = [marks.length && `hid ${counted(marks)} in ${viewName(view)}`, rows.length && `hid ${counted(rows)} in the key`, gone.length && `deleted ${counted(gone)}`].filter(Boolean);
    const s = parts.join(' and ');
    return s && s[0].toUpperCase() + s.slice(1);
  }
  // What's copied is marks of one view, and their names: pasting a box shows it where it was in the chart, a
  // shape is copied.
  let clip = null;
  const marksNow = () => ({ view: viewOf(), items: placeable().map(m => m.type === 'box' ? { box: m.record, x: m.x - scene.page.offset.x, y: m.y - scene.page.offset.y, w: m.w } : { row: rowOf(m.id) }).filter(x => x.box || x.row) });
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
  // Ctrl+D copies in place, leaving the clipboard as it was.
  const duplicate = () => paste(marksNow());
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
  const nudgeEnds = e => { if (run && !(e.type === 'keydown' && /^(Arrow|Shift)/.test(e.key))) nudged(); };
  addEventListener('keydown', nudgeEnds, true);
  addEventListener('pointerdown', nudgeEnds, true);
  const stopNudge = Shell.on('select', () => nudged());
  function align(how) {
    const ms = placeable();
    if (!ms.length) return;
    const one = ms.length === 1, b = one ? { x: 0, y: 0, r: scene.page.w, d: scene.page.h }
      : { x: Math.min(...ms.map(m => m.x)), y: Math.min(...ms.map(m => m.y)), r: Math.max(...ms.map(m => m.x + m.w)), d: Math.max(...ms.map(m => m.y + m.h)) };
    const at = m => ({ left: { x: b.x }, center: { x: (b.x + b.r - m.w) / 2 }, right: { x: b.r - m.w }, top: { y: b.y }, middle: { y: (b.y + b.d - m.h) / 2 }, bottom: { y: b.d - m.h } })[how];
    moveTo(new Map(ms.map(m => { const p = { x: m.x, y: m.y, ...at(m) }; return [m.id, { ...p, ...(m.points && { dx: p.x - m.x, dy: p.y - m.y }) }]; })));
  }
  function distribute(axis) {
    const ms = placeable();
    if (ms.length < 3) return;
    const [pos, size] = axis === 'down' ? ['y', 'h'] : ['x', 'w'];
    const sorted = [...ms].sort((a, b) => a[pos] - b[pos]), first = sorted[0], last = sorted[sorted.length - 1];
    const gap = (last[pos] + last[size] - first[pos] - sorted.reduce((s, m) => s + m[size], 0)) / (ms.length - 1);
    let at = first[pos];
    const places = new Map();
    for (const m of sorted) { places.set(m.id, { x: m.x, y: m.y, [pos]: at }); at += m[size] + gap; }
    moveTo(places);
  }
  function match(dim) {
    const ms = placeable();
    if (ms.length < 2) return;
    const v = ms[0][dim === 'width' ? 'w' : 'h'];
    moveTo(new Map(ms.map(m => [m.id, { x: m.x, y: m.y, w: dim === 'width' ? v : m.w, h: dim === 'height' ? v : m.h }])));
  }
  function order(how) {
    const ms = selected().filter(m => m.type !== 'frame');
    if (!ms.length) return;
    const layer = m => m.settings?.Layer?.value ?? 0, view = viewOf();
    const peers = scene.marks.filter(m => m.type === ms[0].type);
    const top = Math.max(0, ...peers.map(layer)), bottom = Math.min(0, ...peers.map(layer));
    App.change(tx => {
      for (const m of ms) {
        const v = how === 'front' ? top + 1 : how === 'back' ? bottom - 1 : layer(m) + (how === 'forward' ? 1 : -1);
        if (m.type === 'shape') tx.update(m.id, { format: { ...rowOf(m.id).format, Layer: v } });
        else tx.note('Layer', treeOf(m.record), v, { view });
      }
    });
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
  // Tidy: the view's entered positions gone, the layout's in their place (dendra.md, The layout), and the view
  // framed on its page again, as it opens. `tidied` is the workbook as Tidy would leave it, which a preview draws.
  const placedHere = () => App.notes.peek().notes('Position').filter(n => n.view === viewOf());
  function tidied() {
    const wb = App.shown.peek(), gone = new Set(placedHere().map(n => n.note)), rows = wb.rows(App.chart.peek()).filter(r => !gone.has(r.note));
    const notes = Notes.index(rows.filter(r => 'note' in r));
    return { ...wb, rows: () => rows, notes: () => notes };
  }
  function tidy() {
    if (!App.change(tx => placedHere().forEach(n => tx.remove(n.note)), { say: 'Tidied the layout' })) return;
    framed = true; left = null;
    settle();
  }

  // ---- Zoom: the levels, and framing. A view opens on its whole page, as PowerPoint opens a slide, and Fit
  // (Shift+1) frames it so again. A framed view stays framed as the window and the page change size, until
  // it's zoomed or scrolled (see draw). Nothing else moves the view:
  // what's brought on screen is scrolled to, never zoomed to. A canvas that can't be seen (a table shown, the
  // inspector widened) is never measured or moved: it's framed, or put back as it was left, once it's seen
  // again ----
  let framed = true, left = null, quiet = false;
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
    const at = (x, w, room) => w * s > room - 2 * pad ? pad - x * s : (room - w * s) / 2 - x * s;
    quietly(() => { graph.zoomTo(s); graph.translate(at(r.x, r.w, W), at(r.y, r.h, H)); });
    zoomLevel.value = graph.zoom();
  }
  // The view as it's to be, once it can be seen: as it was left, or framed on its page.
  function settle() {
    if (!scene || !seen()) return;
    const p = scene.page;
    if (left) { const z = left; left = null; quietly(() => { graph.zoomTo(z.s); graph.translate(z.t.tx, z.t.ty); }); zoomLevel.value = graph.zoom(); }
    else if (framed) showRect({ x: 0, y: 0, w: p.w, h: p.h }, Math.round(clamp(Math.min(root.clientWidth, root.clientHeight) * 0.03, 12, 28)), LEAST, 2);
  }
  function zoom(k) {
    if (!scene) return;
    if (k === 'fit') { framed = true; left = null; return settle(); }
    if (!seen()) return;
    if (k === 'in' || k === 'out') {
      const z = graph.zoom(), next = k === 'in' ? LEVELS.find(v => v > z + 0.001) ?? 4 : [...LEVELS].reverse().find(v => v < z - 0.001) ?? LEAST;
      const c = graph.getGraphArea().center ?? null;
      graph.zoomTo(next, c ? { center: graph.graphToLocal(c) } : undefined);
    } else graph.zoomTo(k);
    zoomLevel.value = graph.zoom();
  }
  const resized = new ResizeObserver(() => { showHandles(null); seen(); if (framed || left) settle(); onScreen(); });
  resized.observe(root);
  // Brings marks on screen at the zoom the view is at, as Excel's Go To scrolls to a cell: by the least that
  // shows them all, or the first of them where they don't all fit, or its top left where it's larger than the
  // window. Where they're on screen, nothing moves. The formula bar brings a reason it steps down to so.
  function bring(ms, pad = 24) {
    if (!ms.length || !(screen.w || seen())) return;
    const W = screen.w, H = screen.h, z = graph.zoom(), all = extent(ms);
    const r = all.w * z <= W - 2 * pad && all.h * z <= H - 2 * pad ? all : extent(ms.slice(0, 1));
    const a = graph.localToGraph(r.x, r.y), b = graph.localToGraph(r.x + r.w, r.y + r.h);
    const into = (lo, hi, room) => lo < pad ? pad - lo : hi > room - pad ? Math.max(pad - lo, room - pad - hi) : 0;
    const dx = into(a.x, b.x, W), dy = into(a.y, b.y, H), t = graph.translate();
    if (dx || dy) graph.translate(t.tx + dx, t.ty + dy);
  }

  // Tab and Shift+Tab select the next box and the one before, in reading order (by rows, top down, then
  // left to right), as PowerPoint's step through its shapes.
  function next(by) {
    const rows = [];
    for (const b of scene.marks.filter(m => m.type === 'box').sort((a, b) => a.y - b.y)) {
      const r = rows.at(-1);
      if (r && b.y < r[0].y + r[0].h / 2) r.push(b); else rows.push([b]);
    }
    const boxes = rows.flatMap(r => r.sort((a, b) => a.x - b.x)), at = boxes.findIndex(b => b.id === keysOfSelection()[0]);
    const m = boxes.at(at < 0 ? (by > 0 ? 0 : -1) : (at + by) % boxes.length);
    if (!m) return false;
    Shell.select([m.id]);
  }

  // ---- Keys: PowerPoint's, Ctrl+[ and Ctrl+] among them for the order ----
  const keyMap = {
    // Tab steps through the boxes, or with a field selected, through its box's fields, as a form's.
    'Tab': () => fieldNow() ? stepField(1) : next(1), 'Shift+Tab': () => fieldNow() ? stepField(-1) : next(-1),
    // A field selected is hidden at the scope (see Fields); anything else, hidden in this view.
    'Delete': () => fieldNow() ? hideField() : remove(), 'Backspace': () => fieldNow() ? hideField() : remove(), 'Shift+Delete': () => remove(true), 'Shift+Backspace': () => remove(true),
    'ArrowLeft': () => nudging(-1, 0), 'ArrowRight': () => nudging(1, 0), 'ArrowUp': () => nudging(0, -1), 'ArrowDown': () => nudging(0, 1),
    'Shift+ArrowLeft': () => nudging(-10, 0), 'Shift+ArrowRight': () => nudging(10, 0), 'Shift+ArrowUp': () => nudging(0, -10), 'Shift+ArrowDown': () => nudging(0, 10),
    '$mod+KeyA': () => { sel.reset(graph.getCells().filter(selectable)); },
    '$mod+KeyD': () => duplicate(), '$mod+KeyG': () => group(), '$mod+Shift+KeyG': () => ungroup(),
    '$mod+BracketRight': () => order('forward'), '$mod+BracketLeft': () => order('backward'),
    '$mod+Shift+BracketRight': () => order('front'), '$mod+Shift+BracketLeft': () => order('back'),
    '$mod+Equal': () => zoom('in'), '$mod+Minus': () => zoom('out'), 'Shift+Digit0': () => zoom(1),
    'F2': () => { const f = fieldNow(); if (f) return editField(f.m, f.it); const k = keysOfSelection(); if (k.length === 1) edit(k[0]); },
    'Enter': () => { const f = fieldNow(); if (f) return editField(f.m, f.it); const k = keysOfSelection(); if (k.length !== 1) return false; edit(k[0]); },
    // Esc backs out a step: from a field to its box, from the selection to none.
    'Escape': () => { if (fieldNow()) return pickField(null); if (!keysOfSelection().length) return false; entered = null; Shell.select([]); },
  };
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
    if (e.type === 'paste') { if (!still() && clip && e.clipboardData?.getData('text/plain') === clip.text) { e.preventDefault(); paste(); } return; }
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
  const stopDraw = effect(() => { App.scene.value; styled = styledDrawn = null; show(true); });
  // A mark's fields, asked of by the inspector (see Fields): `shown`, whether the mark a record draws shows an entry of a
  // label; `show`, shows or hides one there, at the scope where the mark is what's selected; `light`, outlines the field
  // a row's key names, as its row is pointed at; `over`, the box under a point on screen as a row is dragged, outlined as
  // its target (null ends it), and `drop`, the label dropped there; `clip`, a row copied, as a field.
  const marked = id => scene?.byId.get(id);
  const scoped = m => Shell.selection.peek().length === 1 && keyParts(Shell.selection.peek()[0])[0] === m.id ? scopeNow(canvas) : { own: true };
  const fields = {
    shown: (id, edge, at = id) => { const m = marked(id); return !!m && shows(m, edge, at); },
    show: (id, edge, on, at = id) => { const m = marked(id); return m && setField([m], edge, on, scoped(m), at); },
    light: key => { if (litKey !== key) { litKey = key; paintFields(); } },
    over(cx, cy) {
      const p = cx == null ? null : graph.clientToLocal(cx, cy), m = p && [...scene.marks].reverse().find(b => b.type === 'box' && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h);
      if ((m?.id ?? null) !== dropOn) { dropOn = m?.id ?? null; paintFields(); }
      return m ?? null;
    },
    drop(edge) { const m = marked(dropOn); dropOn = null; paintFields(); return m && setField([m], edge, true, scoped(m)); },
    clip: (edge, text) => { clip = { items: [], text, field: edge }; },
  };
  const canvas = {
    scene: () => scene, graph, root, selected, keys: keysOfSelection, highlight, redline, reveal, restyle, cue, point, toward, zoomTo: ids => bring(marksOf([].concat(ids ?? []).filter(Boolean))),
    insert, create, remove, copy: copyOut, paste: () => paste(), duplicate, nudge, align, distribute, match, order, group, ungroup, edit: key => edit(key), tidy, tidied, zoom,
    fields, field: () => fieldNow(), styleField, selectLike, addText: id => { const m = marked(id); if (m) writeText(m); },
    destroy() {
      nudged(); stopNudge(); removeEventListener('keydown', nudgeEnds, true); removeEventListener('pointerdown', nudgeEnds, true);
      stopDraw(); stopSel(); unbind(); resized.disconnect(); removeEventListener('keydown', typeOver); CLIP.forEach(n => document.removeEventListener(n, clipboard));
      graph.dispose(); root.remove(); if (active.peek() === canvas) active.value = null;
    },
  };
  active.value = canvas;
  return canvas;
}

// The other parts call the canvas shown through the shell (Shell.parts.value.canvas).
const call = name => (...a) => active.peek()?.[name](...a);
Shell.register('canvas', { mount(el) { const c = mount(el); return () => c.destroy(); },
  highlight: call('highlight'), redline: call('redline'), reveal: call('reveal'), cue: call('cue'), point: call('point'), toward: call('toward'), zoomTo: call('zoomTo'),
  kinds: () => kinds().map(k => ({ label: k, run: () => call('create')(k) })) });
// A chart is shown, not just kept behind a table.
const here = () => !!active.value && active.value.root.clientWidth > 0;
Shell.register('action', { id: 'chart.tidy', name: 'Tidy', enabled: here, run: call('tidy') });
Shell.register('action', { id: 'chart.fit', name: 'Zoom to fit', keys: 'Shift+Digit1', enabled: here, run: () => call('zoom')('fit') });

return { active, zoom: zoomLevel, keyParts, kinds, fieldLit, fieldPicked, scope: () => scopeNow(), named, groupsAt };
})();
