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
const BLUE = '#1f5fbf', RED = '#c2372b';
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

// Where a w × h shape can go on a scene's page: the nearest place to `near` (its middle) clear of every box,
// frame, shape, label and line, on a grid; with `bands`, clear of the chart too, in the page's bands above,
// below or beside it. Where the page has no such place, just below everything, and the page grows to hold it.
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
  const g = gap / 2;
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

// A text; `faint`, in a box drawn only while it's asked about.
function textMarkup(it, red, faint) {
  const t = it.look, tone = c => red === 'appear' ? BLUE : red === 'go' ? RED : c;
  return {
    tagName: 'text', attrs: {
      'font-family': Scene.fontFamily(t.Font), 'font-size': px(t.Size), 'font-weight': t.Bold ? 700 : 400,
      'font-style': t.Italic || it.computed ? 'italic' : 'normal', 'text-anchor': ANCHOR[t.Align] ?? 'middle', 'data-text': it.id, ...(faint && { opacity: FAINT }),
    },
    children: it.lines.map(l => {
      const r = l.red ?? it.redline ?? red;
      const deco = [t.Underline && 'underline', r === 'go' && 'line-through'].filter(Boolean).join(' ');
      return { tagName: 'tspan', attrs: { x: l.x, y: l.y, fill: r === 'appear' ? BLUE : r === 'go' ? RED : tone(t.Color), ...(deco && { 'text-decoration': deco }) }, textContent: l.text };
    }),
  };
}
const paint = v => !v || v === 'none' ? 'none' : v;
function bodyMarkup(shape, w, h, s, red, extra = {}) {
  const stroke = red === 'appear' ? BLUE : red === 'go' ? RED : paint(s.Outline);
  return { tagName: 'path', selector: 'body', attrs: { d: Scene.path(shape, w, h), fill: paint(s.Fill), stroke, 'stroke-width': px(s.Weight),
    'stroke-dasharray': Scene.dash(s.Dash, s.Weight) ?? (red === 'go' ? '4 3' : null), 'stroke-linejoin': 'miter', ...extra } };
}
const look = m => m.look ?? Object.fromEntries(Object.entries(m.settings).map(([k, v]) => [k, v.value]));
const marker = (on, w) => on ? { name: 'block', width: 5 + w * 3, height: 4 + w * 2.4, offset: 0 } : null;
// How strongly a mark the view hides is drawn while it's asked about. A box keeps its fill, so no line
// behind it shows through its name.
const FAINT = 0.55;

// A cell in two parts, as JSON: where it is, which moving it changes, each of its keys apart; and what it is.
const WHERE = new Set(['x', 'y', 'width', 'height', 'zIndex', 'source', 'target', 'vertices', 'connector']);
function partsOf(c) {
  const where = {}, what = [];
  for (const k in c) if (WHERE.has(k)) where[k] = JSON.stringify(c[k]); else what.push(k, c[k]);
  return { where, what: JSON.stringify(what) };
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

// The cells for a scene, by id, each with what it's drawn from, to redraw only what changed.
function cellsOf(scene) {
  const cells = [], z = new Map(scene.marks.map((m, i) => [m.id, i * 2]));
  const node = (m, kind, markup, extra = {}) => cells.push({ id: m.id, shape: 'dendra', x: m.x, y: m.y, width: Math.max(1, m.w), height: Math.max(1, m.h),
    zIndex: z.get(m.id), markup, data: { kind, mark: m.id }, ...extra });
  for (const m of scene.marks) {
    const s = look(m);
    if (m.type === 'box') {
      node(m, 'box', [bodyMarkup(m.shape, m.w, m.h, s, m.redline, { 'data-tour': 'box', ...(m.revealed && { 'stroke-opacity': FAINT }) }),
        ...m.texts.map(it => textMarkup(it, m.redline, m.revealed))]);
    } else if (m.type === 'line') {
      const ps = m.points, dashed = Scene.dash(s.Dash, s.Weight) ?? (m.computed && !m.settings.Dash.note ? Scene.dash('dashed', s.Weight) : null);
      const arrow = s.Arrow;
      cells.push({ id: m.id, shape: 'edge', zIndex: z.get(m.id), data: { kind: 'line', mark: m.id },
        source: { x: ps[0][0], y: ps[0][1] }, target: { x: ps[ps.length - 1][0], y: ps[ps.length - 1][1] },
        vertices: ps.slice(1, -1).map(([x, y]) => ({ x, y })), router: { name: 'normal' }, connector: m.runs ? { name: 'runs', args: { runs: m.runs } } : { name: 'normal' },
        attrs: { line: { stroke: m.redline === 'appear' ? BLUE : m.redline === 'go' ? RED : paint(s.Outline), strokeWidth: px(s.Weight), strokeDasharray: dashed,
          strokeLinecap: s.Dash === 'dotted' ? 'round' : 'butt', strokeLinejoin: 'miter', targetMarker: marker(arrow === 'end' || arrow === 'both', px(s.Weight)),
          sourceMarker: marker(arrow === 'start' || arrow === 'both', px(s.Weight)), ...(m.revealed && { opacity: FAINT }) }, wrap: { strokeWidth: 10 } } });
      if (m.texts.length && Number.isFinite(m.labelAt?.x) && Number.isFinite(m.labelAt?.y)) cells.push({ id: `${m.id}·label`, shape: 'dendra', x: m.labelAt.x, y: m.labelAt.y, width: m.label.w || 1, height: m.label.h || 1,
        zIndex: z.get(m.id) + 1, data: { kind: 'label', mark: m.id }, markup: m.texts.map(it => textMarkup(it, m.redline)) });
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
  return { tagName: 'path', attrs: { d: Scene.path(shape, w, sh), transform: `translate(${x},${sy})`, fill: paint(sw.Fill), stroke: paint(sw.Outline), 'stroke-width': px(sw.Weight), 'stroke-dasharray': Scene.dash(sw.Dash, sw.Weight) } };
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
  el.appendChild(root);
  const gEl = root.firstChild, over = root.lastChild;

  let scene = null, viewShown = null, hl = null, red = null, revealIds = null, entered = null, dragging = null, syncing = false;
  let pointing = false, hold = false;
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
      return { nodeMovable: !pointing && !still() && k !== 'page' && k !== 'label' };
    },
  });
  // Only the cells on screen, and a margin round it, are drawn, as X6 draws a big graph (`virtual`), so a chart
  // of hundreds of boxes costs what a screenful does; the rest wait in the model, drawn as they come on screen.
  // The canvas says where the screen is the moment the view moves, in place of X6's own, which waits for a
  // pause; and a canvas that can't be seen draws everything, as it can't say. The screen's size is the one last
  // read (see seen), as reading it again once anything has moved would lay the window out again.
  graph.virtualRender.stopListening();
  const AROUND = 120;
  let screen = { w: 0, h: 0 };
  const onScreen = () => graph.renderer.setRenderArea(screen.w > 0 && screen.h > 0 ? graph.graphToLocal(0, 0, screen.w, screen.h).inflate(AROUND, AROUND) : undefined);
  // What can be selected: a mark this view draws (a cell another view drew is kept hidden; see cellsTo).
  const selectable = c => { const k = c.getData()?.kind; return !!k && k !== 'page' && k !== 'label' && c.isVisible(); };
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
  // A restyle is drawn as an empty redline is, so its boxes stay where they are, as in every preview; one that
  // moves them, Tidy's, is laid out afresh, and not kept as how the view was drawn.
  // The page drawn last; and `moving`, while a gesture's change is made (see moveTo).
  let pageWas = null, moving = false;
  function draw() {
    const base = App.scene.peek();
    if (!base) return;
    const view = base.view, s = styledDrawn;
    scene = revealIds || redDrawn || s ? Scene.of(s?.wb ?? App.shown.peek(), App.chart.peek(), view, base.day,
      { state: App.state.peek(), computed: App.computed.peek(), reveal: revealIds, redline: redDrawn ?? (s && !s.moves ? {} : null), ahead: !!s?.moves }) : base;
    cellsTo(App.chart.peek(), view, [...cellsOf(scene), { id: '·page', shape: 'dendra', x: 0, y: 0, width: scene.page.w, height: scene.page.h, zIndex: -1e6,
      data: { kind: 'page' }, markup: [{ tagName: 'rect', attrs: { width: scene.page.w, height: scene.page.h, fill: 'none', 'pointer-events': 'none' } }] }]);
    sheet.setAttribute('width', scene.page.w);
    sheet.setAttribute('height', scene.page.h);
    // Each view comes back as it was left; one not seen yet opens on its whole page. Either is so at once,
    // never drawn for a moment as the view before was. A framed view is framed again on a page that grows or
    // shrinks, Tidy's preview's too (every other preview keeps the page as it was). Otherwise, and under a
    // gesture, the chart stays where it is on screen as the page sets it again (by its offset), so what was
    // moved stays under the pointer; a gesture that changes the page's size leaves the view framed no more.
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
      if (framed && resized && !moving) settle();
      else if ((dx || dy) && (moving || !framed) && screen.w) { const z = graph.zoom(), t = graph.translate(); quietly(() => graph.translate(t.tx - dx * z, t.ty - dy * z)); }
      if (moving && resized) framed = false;
    }
    syncSelection();
    paintStates();
    seek();
  }
  // The graph's cells made these. Each is kept by what it's drawn from, in two parts, where it is (a node's
  // place, size and stacking, a line's route) and what it is (its markup, attributes and data): one that only
  // moved is moved, a box or shape that looks different is drawn again in place, and only a line that looks
  // different, or a new cell, is made anew, as making cells is what costs. A cell this view doesn't draw is
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
        if (cell && cell.isEdge() === (c.shape === 'edge') && (was.what === now.what || cell.isNode())) {
          if (was.what !== now.what) { cell.setMarkup(c.markup); cell.setData(c.data, { overwrite: true }); }
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
  function cellsFor(keys) {
    const out = [];
    for (const k of keys) {
      const [id] = keyParts(k);
      const m = scene?.byId.get(id);
      if (m?.geometry === 'group') out.push(...m.members); else if (graph.getCellById(id)) out.push(id);
    }
    return [...new Set(out)].map(id => graph.getCellById(id)).filter(Boolean);
  }
  // The legend row selected, however it came to be: clicked, or by Back, Find or another part.
  const keyRow = () => {
    const ks = Shell.selection.peek(), [legend, key] = ks.length === 1 ? keyParts(ks[0]) : [];
    return key && scene?.byId.get(legend)?.geometry === 'legend' ? { legend, key } : null;
  };
  function keysOfSelection() {
    const ids = sel.getSelectedCells().map(c => c.id), keys = [], r = keyRow();
    for (const id of ids) {
      const g = groupOf(id), k = g ? g.id : r && r.legend === id && ids.length === 1 ? `${id}#${r.key}` : id;
      if (!keys.includes(k)) keys.push(k);
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
  graph.on('selection:changed', () => {
    if (syncing) return;
    // Selecting a member of a group selects the group, unless it has been entered.
    const ids = sel.getSelectedCells().map(c => c.id);
    const grow = [...new Set(ids.map(groupOf).filter(Boolean))].flatMap(g => g.members).filter(id => !ids.includes(id));
    if (grow.length) { syncing = true; sel.select(grow.map(id => graph.getCellById(id)).filter(Boolean)); syncing = false; }
    const keys = keysOfSelection();
    if (!same(keys, Shell.selection.peek())) pick(keys);
    grips();
    paintStates();
  });
  // What's selected from elsewhere (Find, F8, the status bar, the inspector, Back) or by Tab is brought on
  // screen, at the zoom the view is at; what's picked on the chart, by a click or the marquee, is there.
  // What isn't drawn yet, in a view about to be shown or a relation the view hides that its highlight will
  // show, is brought once it is.
  let picked = [], wanted = null;
  const pick = keys => { picked = keys; Shell.select(keys); };
  const stopSel = effect(() => {
    const keys = Shell.selection.value;
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
  graph.on('edge:mousedown', ({ edge }) => pointed(edge));

  // A click on the page clears the selection, and a drag across it is the marquee; a click on a line's
  // label is a click on its line; a second click on a legend selects the row under it.
  graph.on('node:mousedown', ({ e, node }) => {
    const k = node.getData()?.kind;
    root.focus({ preventScroll: true });
    if (k === 'page') { if (e.button === 0) { if (!e.shiftKey) sel.clean(); sel.startRubberband(e); } return; }
    if (pointed(node)) return;
    if (k === 'label' || e.shiftKey || e.ctrlKey || e.metaKey) return;
    take(node);
  });
  graph.on('blank:mousedown', () => root.focus({ preventScroll: true }));
  graph.on('node:click', ({ e, node }) => {
    const k = node.getData()?.kind;
    if (hold) return;
    if (k === 'label') {
      const line = graph.getCellById(node.getData().mark);
      if (line) { if (e.shiftKey) sel.isSelected(line) ? sel.unselect(line) : sel.select(line); else sel.reset(line); }
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
  // Marks moved, written: a gesture, so what was moved stays where it was put, however the page sets the
  // chart again or grows (see draw).
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
  function edit(key, target, typed) {
    const [id, rowKey] = keyParts(key);
    const m = scene.byId.get(id);
    if (!m || still()) return;
    // What's typed over: a record's value as entered, not as the chart reads it; a shape's text as written.
    let it = null, rect, save, raw;
    const view = viewOf(), N = App.notes.peek();
    // A caption typed as the output's own name is no caption.
    const caption = (tx, p, text) => { const c = Tree.clean(text); tx.note('Caption', p, c && c !== Scene.outputName(N, p) ? c : undefined, { view }); };
    if (m.type === 'box') {
      it = textAt(m, target);
      const r = it && App.state.peek()[it.id];
      if (!r || !(Tree.isField(r) || Tree.isChoice(r))) return;
      raw = Tree.isField(r) ? Tree.format(r.field, r.value) : r.choice;
      rect = { x: m.x, y: m.y + Math.min(...it.lines.map(l => l.y)) - px(it.look.Size), w: m.w, h: it.lines.length * px(it.look.Size) * 1.2 + 4 };
      save = text => {
        const v = Tree.isField(r) ? Tree.parse(r.field, text) : Tree.clean(text);
        if (v === undefined || v === '' || v === (Tree.isField(r) ? r.value : r.choice)) return;
        App.change(tx => tx.update(it.id, Tree.isField(r) ? { value: v } : { choice: v }));
      };
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
      // A text box left empty goes, as PowerPoint's does.
      save = text => App.change(tx => m.geometry === 'text' && !text.trim() ? tx.remove(m.id) : tx.update(m.id, legend ? { title: text } : { text }));
    }
    if (!it) return;
    openEditor(it, rect, typed ?? raw ?? it.text ?? '', save, { multiline: m.type === 'shape' && m.geometry !== 'legend', selectAll: typed === undefined, grow: !!m.auto });
  }
  // Typing in place, over the mark: Enter keeps it (Shift+Enter breaks a shape's line), Esc doesn't, and
  // leaving keeps it. `grow`: it widens as it's typed, a text box nobody has sized; `box`: a new box of a kind.
  function openEditor(it, rect, text, save, { multiline = false, selectAll = false, grow = false, box = null } = {}) {
    over.querySelector('.dc-edit')?.remove();
    const z = graph.zoom(), p = graph.localToGraph(rect.x, rect.y), t = it.look, size = px(t.Size) * z;
    const ed = document.createElement('div');
    ed.className = 'dc-edit' + (grow ? ' grow' : '') + (box ? ' new' : '');
    ed.contentEditable = 'plaintext-only';
    ed.spellcheck = false;
    if (box) ed.dataset.ph = box;
    Object.assign(ed.style, { left: `${p.x}px`, top: `${p.y}px`, [grow ? 'minWidth' : 'width']: `${rect.w * z}px`, minHeight: `${rect.h * z}px`,
      font: `${t.Bold ? 700 : 400} ${t.Italic ? 'italic' : ''} ${size}px/${1.2} ${Scene.fontFamily(t.Font)}`, textAlign: t.Align ?? 'center', color: t.Color,
      padding: box ? `${Math.max(0, (rect.h * z - size * 1.2) / 2)}px ${9.6 * z}px` : `${2 * z}px ${7.2 * z}px` });
    ed.textContent = text;
    over.appendChild(ed);
    ed.focus();
    // Double-click selects it all, to type over; typing over starts after what was typed.
    const range = document.createRange(), s = getSelection();
    range.selectNodeContents(ed);
    if (!selectAll) range.collapse(false);
    s.removeAllRanges(); s.addRange(range);
    let done = false;
    const finish = ok => { if (done) return; done = true; const v = ed.innerText.replace(/\n$/, ''); ed.remove(); root.focus({ preventScroll: true }); if (ok) save(v); };
    ed.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); finish(false); }
      else if (e.key === 'Enter' && !(multiline && e.shiftKey)) { e.preventDefault(); finish(true); }
    });
    ed.addEventListener('blur', () => finish(true));
  }
  graph.on('node:dblclick', ({ e, node }) => {
    const k = node.getData()?.kind;
    if (k === 'page') return addAt(e);
    if (k === 'label') return;
    const g = groupOf(node.id);
    if (g) { entered = g.id; sel.reset(node); }
    const m = scene.byId.get(node.id);
    edit(m?.geometry === 'legend' && keyRow() ? Shell.selection.peek()[0] : node.id, e.target);
  });
  graph.on('blank:dblclick', ({ e }) => addAt(e));

  // ---- Adding a box: a record of a kind, named as it's typed ----
  // Nothing is made until a name is, and Esc makes nothing. The box is dropped where it was asked for, clear
  // of what's there, and loosely: once a line relates it, it goes beside its relatives (Scene).
  function create(kind, at, { relate } = {}) {
    if (still() || !scene || !kind) return;
    if (!at) { const r = root.getBoundingClientRect(); at = graph.clientToLocal(r.left + r.width / 2, r.top + r.height / 2); }
    Shell.store.set('kind', kind);
    const w = 200, h = 44, p = freeSpot(scene, w, h, at), view = viewOf(), [x, y] = own(p.x, p.y);
    openEditor({ look: { ...Scene.DEFAULTS.text, Bold: true } }, { x: p.x, y: p.y, w, h }, '', name => {
      name = Tree.clean(name);
      if (!name) return;
      let id = null;
      if (!App.change(tx => {
        id = tx.add('record', { kind });
        tx.add('record', { at: id, edge: 'Name', field: 'text', value: name });
        tx.note('Position', { id, kind }, { x, y, loose: true }, { view });
      })) return;
      if (relate) Shell.emit('relate-open', [relate, id]); else Shell.select([id]);
    }, { box: kind });
  }
  const addAt = e => { if (!still()) create(lastKind(), graph.clientToLocal(e.clientX, e.clientY)); };

  // ---- Relating: from near a box's edge to another box, or to empty page for a new one ----
  // The handles show on the box whose outline the pointer nears, on the outline, as PowerPoint's connection
  // points are: at the middle of each side (a triangle's slopes and base), or off it along the side as far as
  // keeps them clear of the lines there and of the box's grips, so a click by a box on a line takes the line.
  // A side with no such place has none.
  let near = null, placed = null;
  const handles = ['n', 'e', 's', 'w'].map(side => {
    const h = document.createElement('div');
    h.className = `dc-handle ${side}`;
    h.addEventListener('pointerdown', e => { if (near && h.at && e.button === 0) { e.preventDefault(); e.stopPropagation(); relating(near, h.at, e); } });
    over.appendChild(h);
    return h;
  });
  // A point t of the way along a side of a box's outline: a triangle's slopes and base (it has no top), an
  // oval's quarters, or else its frame's sides.
  function sidePoint(m, side, t) {
    const { x, y, w, h } = m, along = (a, b) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    if (m.shape === 'oval') { const a = ({ n: -1, e: 0, s: 1, w: 2 }[side] + t - 0.5) * Math.PI / 2; return [x + w / 2 * (1 + Math.cos(a)), y + h / 2 * (1 + Math.sin(a))]; }
    const sides = m.shape === 'triangle' ? { e: [[x + w / 2, y], [x + w, y + h]], s: [[x + w, y + h], [x, y + h]], w: [[x, y + h], [x + w / 2, y]] }
      : { n: [[x, y], [x + w, y]], e: [[x + w, y], [x + w, y + h]], s: [[x + w, y + h], [x, y + h]], w: [[x, y + h], [x, y]] };
    return sides[side] ? along(...sides[side]) : null;
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
      if (p) { const g = graph.localToGraph(p[0], p[1]); h.style.left = `${g.x}px`; h.style.top = `${g.y}px`; }
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
  root.addEventListener('pointermove', e => {
    if (!scene || e.target.closest?.('.dc-handle, .dc-edit')) return;
    showHandles(e.buttons ? null : nearEdge(graph.clientToLocal(e.clientX, e.clientY)));
  });
  root.addEventListener('pointerleave', e => { if (!e.relatedTarget?.closest?.('.dc-handle')) showHandles(null); });
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
      removeEventListener('pointermove', move); removeEventListener(click ? 'mousedown' : 'pointerup', up, true);
      unlayer?.(); line.remove(); root.classList.remove('relating'); paintStates();
    };
    const up = ev => {
      if (click) { ev.preventDefault(); ev.stopPropagation(); }
      end();
      if (down && Math.hypot(ev.clientX - down.clientX, ev.clientY - down.clientY) < 4) return take(graph.getCellById(from.id));
      const p = at(ev);
      target = boxAt(p);
      if (target) Shell.emit('relate-open', [from.id, target.id]);
      else if (!ev.target.closest?.('.dc') || ev.button !== 0) return;
      else if (Math.hypot(p.x - start[0], p.y - start[1]) > 12 / graph.zoom()) Shell.menu({ x: ev.clientX, y: ev.clientY }, [
        ...kinds().map(k => ({ label: `New ${k}`, run: () => create(k, p, { relate: from.id }) })), '-',
        { label: 'Line', run: () => insert('line', { points: [start, [p.x, p.y]], ends: [from.id, null] }) }]);
    };
    addEventListener('pointermove', move);
    addEventListener(click ? 'mousedown' : 'pointerup', up, true);
    if (click) unlayer = Shell.layer(end);
  }

  // ---- Right-click: what applies to what's under the pointer ----
  root.addEventListener('contextmenu', e => e.preventDefault());
  const contextOf = ({ e, node, edge }) => {
    let cell = node ?? edge ?? null;
    if (cell?.getData()?.kind === 'label') cell = graph.getCellById(cell.getData().mark);
    const at = { x: e.clientX, y: e.clientY }, k = cell?.getData()?.kind;
    if (!cell || k === 'page') return Shell.menu(at, pageItems(graph.clientToLocal(at.x, at.y)));
    take(cell);
    Shell.menu(at, markItems());
  };
  for (const name of ['node:contextmenu', 'edge:contextmenu', 'blank:contextmenu']) graph.on(name, contextOf);
  const ORDER = () => [{ label: 'Bring to front', keys: '$mod+Shift+]', run: () => order('front') }, { label: 'Bring forward', keys: '$mod+]', run: () => order('forward') },
    { label: 'Send backward', keys: '$mod+[', run: () => order('backward') }, { label: 'Send to back', keys: '$mod+Shift+[', run: () => order('back') }];
  function markItems() {
    const ms = selected(), one = ms.length === 1 ? ms[0] : null, bound = ms.some(m => m.type === 'box' || m.type === 'line'), ro = still();
    const text = one?.type === 'shape' && !['line', 'picture', 'group'].includes(one.geometry);
    return [
      ...(one?.type === 'box' && !ro ? [{ label: 'Relate…', run: () => relating(one) }, '-'] : []),
      ...(text && !ro ? [{ label: 'Edit text', keys: 'Enter', run: () => edit(one.id) }, '-'] : []),
      ...(bound ? [{ label: 'Hide in this view', keys: 'Delete', disabled: ro, run: () => remove() }] : []),
      { label: 'Delete', keys: bound ? 'Shift+Delete' : 'Delete', danger: true, disabled: ro, run: () => remove(bound) },
      '-', ...ORDER().map(x => ({ ...x, disabled: ro || ms.every(m => m.type === 'frame') })),
      '-', { label: 'Copy', keys: '$mod+C', run: copyOut }, { label: 'Paste', keys: '$mod+V', disabled: ro || !clip?.items.length, run: () => paste() },
      ...(ms.some(m => m.geometry === 'group') ? [{ label: 'Ungroup', keys: '$mod+Shift+G', disabled: ro, run: ungroup }]
        : placeable().length > 1 ? [{ label: 'Group', keys: '$mod+G', disabled: ro, run: group }] : []),
    ];
  }
  const pageItems = p => [
    ...kinds().map(k => ({ label: `New ${k}`, disabled: still(), run: () => create(k, p) })), '-',
    { label: 'Paste', keys: '$mod+V', disabled: still() || !clip?.items.length, run: () => paste() }, '-',
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
  // What a line can be traced with: a highlight's hue and depth, a legend row's, the selection's.
  const TRACES = ['dc-hl', 'dc-row', 'dc-sel', 'strong', 'deep', 'pulse', 'hloop', 'haccent', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
  function paintStates(extra) {
    if (!scene) return;
    marks.querySelectorAll('.dc-hl, .dc-row, .dc-group').forEach(n => n.remove());
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
        outline({ type: 'box', x: o.x + Math.min(...xs), y: o.y + Math.min(...ys) - px(m.look.Size), w: Math.max(...m.lines.map(l => l.w)), h: m.lines.length * px(m.look.Size) * 1.2 }, cls, 1.5);
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
    // A selected line is traced in the accent, as Office marks one.
    for (const c of sel.getSelectedCells()) if (c.isEdge()) { const m = scene.byId.get(c.id); if (m?.points) outline(m, 'dc-sel'); }
    const dim = !!hl?.dim && lit.size;
    for (const c of graph.getCells()) {
      const v = graph.findViewByCell(c);
      if (!v) continue;
      const k = c.getData()?.kind, id = k === 'label' ? c.getData().mark : c.id, el = v.container;
      el.classList.toggle('dc-dim', !!dim && k !== 'page' && !lit.has(id));
      if (c.isEdge()) { el.classList.remove(...TRACES); el.classList.add(...traced.get(c.id) ?? []); }
    }
  }
  // Range Finder: colors { [record id]: [hue 1–6 or 'loop', depth 0–2] }, each record outlined in its hue;
  // pulse, what a hovered part of a formula means. With dim, the rest fades. null clears it.
  function highlight(colors, { dim = false, pulse = [] } = {}) {
    const map = new Map(Object.entries(colors ?? {}));
    hl = map.size ? { map, dim, pulse: new Set(pulse) } : null;
    show();
  }
  // A pending change, as comparison software shows one: what would appear in blue, what would go in red and
  // struck through, and a changed value's old text struck before its new. records: the state it would leave,
  // so what doesn't exist yet can be drawn. null clears it.
  function redline(r) {
    const now = App.state.peek();
    red = r ? { state: r.records ?? null, appear: new Set(r.appear ?? []), go: new Set(r.go ?? []),
      changed: new Map(Object.entries(r.changed ?? {}).map(([id, c]) => [id, now[id] ?? c?.before ?? c])) } : null;
    show();
  }
  // A format pointed at in the format bar, as it would look: the chart drawn from `wb`, the workbook as the
  // change would leave it, PowerPoint's live preview; with `moves`, laid out again (Tidy). null ends it.
  function restyle(wb, { moves = false } = {}) { styled = wb && { wb, moves }; show(); }
  // Boxes and lines the view hides are drawn while they're highlighted, redlined, or asked for. (An entry
  // isn't: it lights what it sits in, so no box changes size under the pointer.) A preview is drawn while
  // it's quick: a redline or a restyle on a chart of a few hundred marks, and the hidden drawn only while
  // they're a few dozen; past that, what's drawn is lit, and the formula bar says the rest.
  const QUICK = { marks: 400, hidden: 40 };
  let asked = [], redDrawn = null, styled = null, styledDrawn = null, standIns = new Map();
  function reveal(ids) { asked = ids ? [...ids] : []; show(); }
  function show() {
    const base = App.scene.peek(), quick = (base?.marks.length ?? 0) <= QUICK.marks, r = red && quick ? red : null, s = styled && quick ? styled : null;
    const st = r?.state ? { ...App.state.peek(), ...r.state } : App.state.peek();
    const hidden = id => { const x = st[id]; return x && (Tree.isObject(x) || x.args?.length === 2) && !base?.byId.has(id); };
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
    const ids = [...new Set([...asked, ...(hl ? hl.map.keys() : []), ...(r ? [...r.appear, ...r.go, ...r.changed.keys()] : [])])].filter(id => hidden(id) && !standIns.has(id)).sort();
    const next = ids.length && ids.length <= QUICK.hidden ? ids : null;
    if (JSON.stringify(next) !== JSON.stringify(revealIds) || r !== redDrawn || s !== styledDrawn) { revealIds = next; redDrawn = r; styledDrawn = s; draw(); } else paintStates();
    ahead();
  }
  // Drawn ahead once the window is idle, so that what's drawn next is drawn at once: the chart as a change
  // previewed would leave it, redlined or restyled, however big, so that making the change draws it as laid out
  // then; and the chart's other views, so that showing one draws it as it is (Scene keeps a view's latest scenes
  // by what they're drawn from). A step at a time, an idle moment's each (see Scene.steps), so the window is never
  // held up long; and given up once what they're drawn from changes.
  let aheadOf = null;
  function ahead() {
    const base = App.scene.peek(), wb = styled?.wb ?? App.shown.peek(), state = red?.state ?? (styled ? App.state.peek() : null);
    if (!base || typeof requestIdleCallback !== 'function') { aheadOf = null; return; }
    if (aheadOf?.wb === wb && aheadOf.state === state && aheadOf.base === base) return;
    const mine = aheadOf = { wb, state, base }, chart = App.chart.peek(), computed = App.computed.peek();
    const jobs = [...state ? [Scene.steps(wb, chart, base.view, base.day, { state, computed, ahead: true })] : [],
      ...App.views.peek().filter(v => v.layout === 'chart' && v.id !== base.view).map(v => Scene.steps(App.shown.peek(), chart, v.id, base.day, { state: App.state.peek(), computed }))];
    const live = () => aheadOf === mine && App.scene.peek() === base && jobs.length;
    const step = idle => {
      while (live()) { if (jobs[0].next().done) jobs.shift(); if (idle.timeRemaining() <= 0) break; }
      if (live()) requestIdleCallback(step);
    };
    if (live()) requestIdleCallback(step);
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
    // Placed on the page, kept as the chart's own (see place).
    if (row.x !== undefined) [row.x, row.y] = own(row.x, row.y);
    if (row.points) row.points = row.points.map(([x, y]) => own(x, y));
    let id = null;
    if (!App.change(tx => { id = tx.add('shape', row); })) return null;
    Shell.select([id]);
    if (geometry === 'text' && !opts.text) requestAnimationFrame(() => edit(id));
    return id;
  }
  // Delete hides what's selected in this view and deletes a free shape; with `records`, Shift+Delete, it
  // deletes the records too, everywhere, and what's in or on them. Either way a toast says what went.
  function remove(records = false) {
    const keys = keysOfSelection(), view = viewOf(), st = App.state.peek();
    if (!keys.length) return;
    const hid = [], gone = [], worked = [];
    // What a toast calls each: a box by its record's name, a line by its relation's, a shape by what it is.
    const as = (m, name = called(m)) => ({ type: m.type, name });
    const c = App.change(tx => {
      for (const k of keys) {
        const [id, rowKey] = keyParts(k), m = scene.byId.get(id);
        if (!m) continue;
        if (m.type === 'box' || m.type === 'line') {
          if (!records) { tx.note('Shown', treeOf(m.record), false, { view }); hid.push(as(m)); }
          else if (st[m.record]?.computed) worked.push(m);
          else { gone.push(as(m)); tx.remove(m.record); }
        } else if (m.type === 'frame') { tx.note('Frame', m.output, undefined, { view }); hid.push(as(m)); }
        else if (m.geometry === 'legend' && rowKey) { tx.update(id, { hide: [...m.hide, rowKey] }); hid.push({ type: 'row', name: m.rows.find(x => x.key === rowKey)?.caption.text }); }
        else if (m.geometry === 'group') { tx.remove(id); for (const x of m.members) if (scene.byId.get(x)?.type === 'shape') tx.remove(x); gone.push(as(m)); }
        else { tx.remove(id); gone.push(as(m)); }
      }
    }, { say: () => said(hid, gone, view) });
    if (c) Shell.select([]);
    else if (worked.length) Shell.toast(worked.length > 1 ? 'Formulas work these out' : 'A formula works this out');
  }
  const SHAPE = { text: 'text box', legend: 'key', picture: 'picture', line: 'line', group: 'group', frame: 'frame' };
  const called = m => m.type === 'box' ? nameOf(m.record) : m.type === 'line' ? `the ${nameOf(m.record)} line` : m.type === 'frame' ? `the ${m.caption.text} frame`
    : `the ${SHAPE[m.geometry] ?? 'shape'}`;
  const counted = ms => ms.length === 1 ? ms[0].name : ms.every(m => m.type === 'box') ? `${ms.length} boxes` : ms.every(m => m.type === 'line') ? `${ms.length} lines` : `${ms.length} items`;
  // A record deleted with a day shown is gone from that day on, and the toast says so.
  function said(hid, gone, view) {
    const rows = hid.filter(m => m.type === 'row'), marks = hid.filter(m => m.type !== 'row'), day = Shell.time.peek()?.asOf;
    const from = day && gone.some(m => m.type === 'box' || m.type === 'line') ? ` as of ${Tree.formatDate(day, 'short')}` : '';
    const parts = [marks.length && `hid ${counted(marks)} in ${viewName(view)}`, rows.length && `hid ${counted(rows)} in the key`, gone.length && `deleted ${counted(gone)}${from}`].filter(Boolean);
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
  const copyOut = () => { if (copy()) navigator.clipboard?.writeText(clip.text).catch(() => {}); };
  function paste(c = clip) {
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
  // it's zoomed or scrolled, or a gesture changes the page's size (see draw). Nothing else moves the view:
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
    'Tab': () => next(1), 'Shift+Tab': () => next(-1),
    'Delete': () => remove(), 'Backspace': () => remove(), 'Shift+Delete': () => remove(true), 'Shift+Backspace': () => remove(true),
    'ArrowLeft': () => nudge(-1, 0), 'ArrowRight': () => nudge(1, 0), 'ArrowUp': () => nudge(0, -1), 'ArrowDown': () => nudge(0, 1),
    'Shift+ArrowLeft': () => nudge(-10, 0), 'Shift+ArrowRight': () => nudge(10, 0), 'Shift+ArrowUp': () => nudge(0, -10), 'Shift+ArrowDown': () => nudge(0, 10),
    '$mod+KeyA': () => { sel.reset(graph.getCells().filter(selectable)); },
    '$mod+KeyD': () => duplicate(), '$mod+KeyG': () => group(), '$mod+Shift+KeyG': () => ungroup(),
    '$mod+BracketRight': () => order('forward'), '$mod+BracketLeft': () => order('backward'),
    '$mod+Shift+BracketRight': () => order('front'), '$mod+Shift+BracketLeft': () => order('back'),
    '$mod+Equal': () => zoom('in'), '$mod+Minus': () => zoom('out'), 'Shift+Digit0': () => zoom(1),
    'F2': () => { const k = keysOfSelection(); if (k.length === 1) edit(k[0]); },
    'Enter': () => { const k = keysOfSelection(); if (k.length !== 1) return false; edit(k[0]); },
    'Escape': () => { if (!keysOfSelection().length) return false; entered = null; Shell.select([]); },
  };
  const wrapped = Object.fromEntries(Object.entries(keyMap).map(([k, f]) => [k, e => { if (f(e) !== false) { e.preventDefault(); e.stopPropagation(); } }]));
  const unbind = tinykeys.tinykeys(root, wrapped);
  // Typing over a selected box or shape starts editing it, with what was typed; the window's own keys (? for
  // the shortcuts, say) come first.
  const typeOver = e => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1 || e.target !== root) return;
    const k = keysOfSelection();
    if (k.length === 1) { e.preventDefault(); edit(k[0], null, e.key); }
  };
  addEventListener('keydown', typeOver);
  // The clipboard is the system's, as Office's is. A copy puts the marks' names on it; a paste is of the marks
  // while those names are still what it holds. Anything else pasted onto the chart, a link onto a selected
  // box, say, goes on to whoever takes it.
  const mine = () => root.contains(document.activeElement) && !document.activeElement.closest('.dc-edit');
  const clipboard = e => {
    if (!mine()) return;
    if (e.type === 'paste') { if (!still() && clip && e.clipboardData?.getData('text/plain') === clip.text) { e.preventDefault(); paste(); } return; }
    if (!copy()) return;
    e.preventDefault();
    e.clipboardData?.setData('text/plain', clip.text);
    if (e.type === 'cut') remove();
  };
  const CLIP = ['copy', 'cut', 'paste'];
  CLIP.forEach(n => document.addEventListener(n, clipboard));
  // A wheel scrolls the page; with Ctrl, X6 zooms.
  gEl.addEventListener('wheel', e => { if (e.ctrlKey || e.metaKey) return; e.preventDefault(); const t = graph.translate(); graph.translate(t.tx - e.deltaX, t.ty - e.deltaY); }, { passive: false });

  // A restyle is of the chart as it was: one that changes ends it.
  const stopDraw = effect(() => { App.scene.value; styled = styledDrawn = null; draw(); ahead(); });
  const canvas = {
    scene: () => scene, graph, root, selected, keys: keysOfSelection, highlight, redline, reveal, restyle, point, zoomTo: ids => bring(marksOf([].concat(ids ?? []).filter(Boolean))),
    insert, create, remove, copy: copyOut, paste: () => paste(), duplicate, nudge, align, distribute, match, order, group, ungroup, edit: key => edit(key), tidy, tidied, zoom,
    destroy() {
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
  highlight: call('highlight'), redline: call('redline'), reveal: call('reveal'), point: call('point'), zoomTo: call('zoomTo'),
  kinds: () => kinds().map(k => ({ label: k, run: () => call('create')(k) })) });
// A chart is shown, not just kept behind a table.
const here = () => !!active.value && active.value.root.clientWidth > 0;
Shell.register('action', { id: 'chart.tidy', name: 'Tidy', enabled: here, run: call('tidy') });
Shell.register('action', { id: 'chart.fit', name: 'Zoom to fit', keys: 'Shift+Digit1', enabled: here, run: () => call('zoom')('fit') });

return { active, zoom: zoomLevel, keyParts, kinds };
})();
