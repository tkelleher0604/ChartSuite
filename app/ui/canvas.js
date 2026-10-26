// Canvas: a view laid out as a chart, drawn on X6 (canvas.md §5.4). It draws the scene and nothing else,
// and keeps no copy of formats or positions: a gesture writes notes or shape rows through the log, and the
// scene that follows is drawn. The gestures are PowerPoint's: click, Shift+click and the marquee; drag, with
// guides; resize; the arrow keys; Delete; copy and paste; align, order and group; double-click to type; and
// a drag from a box's edge to another box, to relate them.
//
// Canvas.mount(el, source) → a canvas. The source holds signals { wb, chart, view, day, state, selection }
// and edit(opts) → a transaction, select(keys), emit(name, detail); Canvas.fromApp() is the window's.
// Selection keys are mark ids: a box's or a line's record, a free shape's id, a frame's, and a legend row
// as `legend id#row key`. The canvas:
//   scene(), selected() → marks, select(keys)
//   highlight(Map id → color | null, { dim }), redline({ appear, go, changed, state } | null), reveal(ids | null)
//   insert(geometry, opts) → id, remove(), copy(), cut(), paste(), duplicate(), nudge(dx, dy)
//   align('left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'), distribute('across' | 'down'),
//   match('width' | 'height'), order('front' | 'forward' | 'backward' | 'back'), group(), ungroup()
//   edit(key), tidy(), zoom(k | 'fit' | 'in' | 'out'), on(event, fn), destroy()
// It emits 'change' (a scene was drawn), 'zoom' and, on the source, 'relate-open' ({ from, to }).
const Canvas = (() => {
const { Graph, Selection, Transform, Snapline } = X6;
const { signal, effect, computed } = preactSignals;
Graph.registerNode('dendra', { markup: [], attrs: {} }, true);

const active = signal(null);
const BLUE = '#1f5fbf', RED = '#c2372b';
const ANCHOR = { left: 'start', center: 'middle', right: 'end' };
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const round = v => Math.round(v * 2) / 2;
// Sizes and weights are points; the canvas draws in pixels.
const px = pt => pt * Scene.PT;

// ---- Writing ----

// A note at exactly this pattern, label and view: set to `value`, or removed when it's undefined.
function writeNote(tx, N, { label, pattern, view, param }, value) {
  const k = Tree.key(pattern);
  const old = N.notes(label).find(n => (n.view ?? null) === (view ?? null) && (n.param ?? null) === (param ?? null) && Tree.key(n.pattern) === k);
  if (value === undefined) { if (old) tx.remove(old.note); return; }
  const row = { label, pattern, ...(view && { view }), ...(param && { param }), value };
  if (!old) tx.add('note', row);
  else if (JSON.stringify(old.value) !== JSON.stringify(value)) tx.set(old.note, row);
}
// An item's live row as a payload for tx.set: a record's version in force on the day, or a shape's row.
function payload(wb, chart, id, day) {
  const rows = wb.item(chart, id);
  const r = rows.find(x => !('record' in x) || Log.validOn(x, day)) ?? rows[rows.length - 1];
  if (!r) return null;
  const { id: _, record, shape, since, before, ...p } = r;
  return p;
}

// ---- Drawing: each mark as X6 cells ----

function textMarkup(it, red) {
  const t = it.look, tone = c => red === 'appear' ? BLUE : red === 'go' ? RED : c;
  return {
    tagName: 'text', attrs: {
      'font-family': Scene.fontFamily(t.Font), 'font-size': px(t.Size), 'font-weight': t.Bold ? 700 : 400,
      'font-style': t.Italic || it.computed ? 'italic' : 'normal', 'text-anchor': ANCHOR[t.Align] ?? 'middle', 'data-text': it.id,
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

// The cells for a scene, by id, each with what it's drawn from, to redraw only what changed.
function cellsOf(scene) {
  const cells = [], z = new Map(scene.marks.map((m, i) => [m.id, i * 2]));
  const node = (m, kind, markup, extra = {}) => cells.push({ id: m.id, shape: 'dendra', x: m.x, y: m.y, width: Math.max(1, m.w), height: Math.max(1, m.h),
    zIndex: z.get(m.id), markup, data: { kind, mark: m.id }, ...extra });
  for (const m of scene.marks) {
    const s = look(m), dim = m.revealed ? { opacity: 0.55 } : {};
    if (m.type === 'box') {
      node(m, 'box', [bodyMarkup(m.shape, m.w, m.h, s, m.redline, { 'data-tour': 'box' }), ...m.texts.map(it => textMarkup(it, m.redline))], { attrs: { root: dim } });
    } else if (m.type === 'line') {
      const ps = m.points, dashed = Scene.dash(s.Dash, s.Weight) ?? (m.computed && !m.settings.Dash.note ? Scene.dash('dashed', s.Weight) : null);
      const arrow = s.Arrow;
      cells.push({ id: m.id, shape: 'edge', zIndex: z.get(m.id), data: { kind: 'line', mark: m.id },
        source: { x: ps[0][0], y: ps[0][1] }, target: { x: ps[ps.length - 1][0], y: ps[ps.length - 1][1] },
        vertices: ps.slice(1, -1).map(([x, y]) => ({ x, y })), router: { name: 'normal' }, connector: { name: 'normal' },
        attrs: { line: { stroke: m.redline === 'appear' ? BLUE : m.redline === 'go' ? RED : paint(s.Outline), strokeWidth: px(s.Weight), strokeDasharray: dashed,
          strokeLinecap: s.Dash === 'dotted' ? 'round' : 'butt', strokeLinejoin: 'miter', targetMarker: marker(arrow === 'end' || arrow === 'both', px(s.Weight)),
          sourceMarker: marker(arrow === 'start' || arrow === 'both', px(s.Weight)), ...(m.revealed && { opacity: 0.55 }) }, wrap: { strokeWidth: 10 } } });
      if (m.labelAt && m.texts.length) cells.push({ id: `${m.id}·label`, shape: 'dendra', x: m.labelAt.x, y: m.labelAt.y, width: m.label.w || 1, height: m.label.h || 1,
        zIndex: z.get(m.id) + 1, data: { kind: 'label', mark: m.id }, markup: m.texts.map(it => textMarkup(it, m.redline)) });
    } else if (m.type === 'frame') {
      const d = m.kind === 'bracket' ? `M0.5,${m.h} V${m.h - 5} H${m.w - 0.5} V${m.h}` : `M0,0 H${m.w} V${m.h} H0 Z`;
      node(m, 'frame', [{ tagName: 'path', selector: 'body', attrs: { d, fill: 'none', stroke: '#595959', 'stroke-width': px(0.75), 'pointer-events': 'visibleStroke',
        'stroke-dasharray': m.kind === 'solid' || m.kind === 'bracket' ? null : Scene.dash(m.kind === 'dotted' ? 'dotted' : 'dashed', 0.75) } },
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
  if (sw.kind === 'frame') return { tagName: 'rect', attrs: { x, y, width: w, height: h, fill: 'none', stroke: '#595959', 'stroke-width': px(0.75), 'stroke-dasharray': Scene.dash('dashed', 0.75) } };
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

function mount(el, src) {
  const root = document.createElement('div');
  root.className = 'dc';
  root.tabIndex = 0;
  root.innerHTML = '<div class="dc-graph"></div><div class="dc-over"></div>';
  el.appendChild(root);
  const gEl = root.firstChild, over = root.lastChild;
  const subs = new Map();
  const on = (name, fn) => { (subs.get(name) ?? subs.set(name, new Set()).get(name)).add(fn); return () => subs.get(name).delete(fn); };
  const fire = (name, d) => subs.get(name)?.forEach(f => f(d));

  let scene = null, viewShown = null, hl = null, red = null, revealIds = null, entered = null, row = null, dragging = null;
  const cellSig = new Map();
  const zooms = new Map();

  const graph = new Graph({
    container: gEl, autoResize: true, async: false, background: false, grid: false,
    panning: { enabled: true, eventTypes: ['mouseWheelDown'] },
    mousewheel: { enabled: true, modifiers: ['ctrl', 'meta'], zoomAtMousePosition: true, minScale: 0.1, maxScale: 4, factor: 1.12 },
    scaling: { min: 0.1, max: 4 },
    interacting: view => {
      const k = view.cell.getData()?.kind;
      if (view.cell.isEdge()) return { edgeMovable: k === 'shape', edgeLabelMovable: false, arrowheadMovable: false, vertexMovable: false, vertexAddable: false, vertexDeletable: false };
      return { nodeMovable: k !== 'page' && k !== 'label' };
    },
  });
  const sel = new Selection({ enabled: true, multiple: true, rubberband: true, strict: true, movable: true, showNodeSelectionBox: true, showEdgeSelectionBox: true,
    pointerEvents: 'none', multipleSelectionModifiers: ['shift', 'ctrl', 'meta'], filter: c => { const k = c.getData()?.kind; return k && k !== 'page' && k !== 'label'; } });
  graph.use(sel);
  graph.use(new Transform({ resizing: { enabled: n => ['box', 'shape'].includes(n.getData()?.kind), minWidth: 24, minHeight: 12, orthogonal: true }, rotating: false }));
  graph.use(new Snapline({ enabled: true, sharp: true, tolerance: 5 }));

  // The page: a sheet under everything, and a node no one sees, so guides find its edges and middle.
  const NS = 'http://www.w3.org/2000/svg';
  const viewport = graph.view.viewport;
  const sheet = document.createElementNS(NS, 'rect');
  sheet.setAttribute('class', 'dc-sheet');
  viewport.insertBefore(sheet, viewport.firstChild);
  const marks = document.createElementNS(NS, 'g');
  marks.setAttribute('class', 'dc-marks');
  viewport.appendChild(marks);

  // ---- Drawing the scene ----
  const read = () => ({ wb: src.wb.value, chart: src.chart.value, view: src.view.value, day: src.day.value, state: src.state.value });
  function draw() {
    const { wb, chart, view, day, state } = read();
    if (!wb || !chart || !view) return;
    scene = Scene.of(wb, chart, view, day, { state, reveal: revealIds, redline: red });
    const cells = [...cellsOf(scene), { id: '·page', shape: 'dendra', x: 0, y: 0, width: scene.page.w, height: scene.page.h, zIndex: -1e6, data: { kind: 'page' },
      markup: [{ tagName: 'rect', attrs: { width: scene.page.w, height: scene.page.h, fill: 'none', 'pointer-events': 'none' } }] }];
    sheet.setAttribute('width', scene.page.w);
    sheet.setAttribute('height', scene.page.h);
    const keep = new Set(cells.map(c => c.id));
    const chosen = sel.getSelectedCells().map(c => c.id);
    graph.batchUpdate(() => {
      for (const c of graph.getCells()) if (!keep.has(c.id)) { graph.removeCell(c); cellSig.delete(c.id); }
      for (const c of cells) {
        const sig = JSON.stringify(c);
        if (cellSig.get(c.id) === sig && graph.getCellById(c.id)) continue;
        if (graph.getCellById(c.id)) graph.removeCell(c.id);
        c.shape === 'edge' ? graph.addEdge(c) : graph.addNode(c);
        cellSig.set(c.id, sig);
      }
    });
    if (viewShown !== view) {
      if (viewShown && graph) zooms.set(viewShown, { s: graph.zoom(), t: graph.translate() });
      viewShown = view;
      const z = zooms.get(view);
      if (z) { graph.zoomTo(z.s); graph.translate(z.t.tx, z.t.ty); } else requestAnimationFrame(() => zoom('fit'));
    }
    syncSelection(chosen);
    paintStates();
    fire('change', scene);
  }

  // ---- Selection: X6's, kept in step with the source's keys ----
  let syncing = false;
  const groups = () => scene ? scene.marks.filter(m => m.geometry === 'group') : [];
  const groupOf = id => groups().find(g => g.members.includes(id) && g.id !== entered);
  function cellsFor(keys) {
    const out = [];
    for (const k of keys) {
      const id = k.includes('#') ? k.slice(0, k.indexOf('#')) : k;
      const m = scene?.byId.get(id);
      if (m?.geometry === 'group') out.push(...m.members); else if (graph.getCellById(id)) out.push(id);
    }
    return [...new Set(out)].map(id => graph.getCellById(id)).filter(Boolean);
  }
  function keysOfSelection() {
    const ids = sel.getSelectedCells().map(c => c.id), keys = [];
    for (const id of ids) {
      const g = groupOf(id), k = g ? g.id : row && row.legend === id && ids.length === 1 ? `${id}#${row.key}` : id;
      if (!keys.includes(k)) keys.push(k);
    }
    return keys;
  }
  function syncSelection(prev) {
    const keys = src.selection.peek().filter(k => scene.byId.has(k.split('#')[0]) || k.includes('#'));
    const want = cellsFor(keys).map(c => c.id);
    if (!same([...want].sort(), [...(prev ?? sel.getSelectedCells().map(c => c.id))].sort()) || !same(want, sel.getSelectedCells().map(c => c.id))) {
      syncing = true; sel.reset(cellsFor(keys)); syncing = false;
    }
  }
  graph.on('selection:changed', () => {
    if (syncing) return;
    // Selecting a member of a group selects the group, unless it has been entered.
    const ids = sel.getSelectedCells().map(c => c.id);
    const grow = [...new Set(ids.map(groupOf).filter(Boolean))].flatMap(g => g.members).filter(id => !ids.includes(id));
    if (grow.length) { syncing = true; sel.select(grow.map(id => graph.getCellById(id)).filter(Boolean)); syncing = false; }
    if (row && !ids.includes(row.legend)) row = null;
    const keys = keysOfSelection();
    if (!same(keys, src.selection.peek())) src.select(keys);
    paintStates();
  });
  const stopSel = effect(() => { const keys = src.selection.value; if (scene && !syncing) { if (!keys.some(k => k.includes('#'))) row = null; syncSelection(); paintStates(); } });

  // A click on the page clears the selection, and a drag across it is the marquee; a click on a line's
  // label is a click on its line; a second click on a legend selects the row under it.
  graph.on('node:mousedown', ({ e, node }) => {
    const k = node.getData()?.kind;
    root.focus({ preventScroll: true });
    if (k === 'page') { if (!e.shiftKey) sel.clean(); sel.startRubberband(e); return; }
    if (k === 'label' || e.shiftKey || e.ctrlKey || e.metaKey) return;
    if (!sel.isSelected(node)) { syncing = true; sel.reset(cellsFor([groupOf(node.id)?.id ?? node.id])); syncing = false; src.select(keysOfSelection()); }
  });
  graph.on('blank:mousedown', () => root.focus({ preventScroll: true }));
  graph.on('node:click', ({ e, node }) => {
    const k = node.getData()?.kind;
    if (k === 'label') {
      const line = graph.getCellById(node.getData().mark);
      if (line) { if (e.shiftKey) sel.isSelected(line) ? sel.unselect(line) : sel.select(line); else sel.reset(line); }
      return;
    }
    const m = scene.byId.get(node.id), hit = e.target.closest?.('[data-row]');
    if (m?.geometry === 'legend') {
      const key = hit?.getAttribute('data-row');
      if (key && (row?.legend === m.id || node.getData().clicked)) { row = { legend: m.id, key }; src.select([`${m.id}#${key}`]); paintStates(); }
      else if (!key) row = null;
      node.setData({ ...node.getData(), clicked: true }, { silent: true });
    }
  });
  graph.on('blank:click', () => { row = null; entered = null; });

  // ---- Gestures written through the log ----
  const N = () => src.wb.value.notes(src.chart.value);
  const commit = (tx, done) => {
    const c = tx.commit();
    if (typeof c === 'string' && typeof Shell !== 'undefined') Shell.toast(c);
    else if (c && done) Shell?.toast?.(done, { undo: () => Shell.parts.peek().undo?.undo() });
    return c;
  };
  const treeOf = id => Tree.treeOf(src.state.value, id);
  // Places for marks, written: a box's Position at its record in this view, a free shape's own place.
  function place(tx, places) {
    const view = src.view.value, n = N();
    for (const [id, p] of places) {
      const m = scene.byId.get(id);
      if (!m) continue;
      if (m.type === 'box') {
        const old = n.position(treeOf(m.record), view);
        writeNote(tx, n, { label: 'Position', pattern: treeOf(m.record), view }, { x: round(p.x), y: round(p.y), w: round(p.w ?? m.w), ...((p.h !== undefined || old?.h) && { h: round(p.h ?? old.h) }) });
      } else if (m.type === 'shape') {
        const row = payload(src.wb.value, src.chart.value, id);
        if (!row) continue;
        const next = { ...row, x: round(p.x), y: round(p.y), ...(p.w !== undefined && { w: round(p.w), h: round(p.h) }) };
        if (row.points && p.dx !== undefined) next.points = row.points.map(([x, y]) => [round(x + p.dx), round(y + p.dy)]);
        tx.set(id, next);
      }
    }
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
    if (!places.size) return;
    const tx = src.edit();
    place(tx, places);
    commit(tx);
  }
  const membersOf = f => [...f.members.map(id => scene.byId.get(id)), ...f.frames.flatMap(id => membersOf(scene.byId.get(id)))].filter(Boolean);
  graph.on('node:moved', ({ node }) => { dragging = null; moved([...new Set([node.id, ...sel.getSelectedCells().map(c => c.id)])]); });
  graph.on('node:resized', ({ node }) => { dragging = null; moved([node.id]); });
  graph.on('edge:mouseup', ({ edge }) => { if (scene.byId.get(edge.id)?.geometry === 'line') moved([edge.id]); });

  // While a box moves, its lines follow and its frames grow round it; a frame carries its members.
  let pending = 0;
  function follow(node) {
    const m = scene.byId.get(node.id);
    if (m?.type === 'frame') {
      const p = node.getPosition(), dx = p.x - m.x, dy = p.y - m.y;
      for (const b of membersOf(m)) graph.getCellById(b.id)?.setPosition(b.x + dx, b.y + dy, { silent: false });
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
          const lab = graph.getCellById(`${l.id}·label`);
          if (lab && l.labelAt) lab.setPosition(l.labelAt.x, l.labelAt.y);
        }
        for (const f of live.frames) {
          const c = graph.getCellById(f.id);
          if (!c || c === node) continue;
          c.setPosition(f.x, f.y); c.setSize(f.w, f.h);
          const [body, hit, cap] = c.getMarkup();
          body.attrs.d = f.kind === 'bracket' ? `M0.5,${f.h} V${f.h - 5} H${f.w - 0.5} V${f.h}` : `M0,0 H${f.w} V${f.h} H0 Z`;
          hit.attrs.width = f.w;
          c.setMarkup([body, hit, cap]);
          cellSig.delete(f.id);
        }
      });
      paintStates();
    });
  }
  graph.on('node:moving', ({ node }) => { dragging = node.id; follow(node); });
  graph.on('node:resizing', ({ node }) => follow(node));

  // ---- Double-click to type: a box's text edits its record, a shape's its own ----
  function textAt(m, target) {
    const id = target?.closest?.('[data-text]')?.getAttribute('data-text');
    return m.texts?.find(it => it.id === id) ?? m.texts?.find(it => Tree.isField(src.state.value[it.id] ?? {})) ?? m.texts?.[0];
  }
  function edit(key, target, typed) {
    const [id, rowKey] = key.split('#');
    const m = scene.byId.get(id);
    if (!m) return;
    let it = null, rect, save;
    const view = src.view.value, wb = src.wb.value, chart = src.chart.value, day = src.day.value;
    if (m.type === 'box') {
      it = textAt(m, target);
      const r = it && src.state.value[it.id];
      if (!r || !(Tree.isField(r) || Tree.isChoice(r))) return;
      rect = { x: m.x, y: m.y + Math.min(...it.lines.map(l => l.y)) - px(it.look.Size), w: m.w, h: it.lines.length * px(it.look.Size) * 1.2 + 4 };
      save = text => {
        const p = payload(wb, chart, it.id, day), v = Tree.isField(r) ? Tree.parse(r.field, text) : Tree.clean(text);
        if (!p || v === undefined || v === '' || v === (Tree.isField(r) ? r.value : r.choice)) return;
        const tx = src.edit();
        tx.set(it.id, { ...p, ...(Tree.isField(r) ? { value: v } : { choice: v }) });
        commit(tx);
      };
    } else if (m.type === 'frame') {
      it = m.caption;
      rect = { x: m.x, y: m.y, w: Math.max(160, m.w), h: m.label + 8 };
      save = text => { const tx = src.edit(); writeNote(tx, N(), { label: 'Caption', pattern: m.output, view }, Tree.clean(text) || undefined); commit(tx); };
    } else if (m.geometry === 'legend' && rowKey) {
      const r = m.rows.find(x => x.key === rowKey);
      if (!r) return;
      it = r.caption;
      rect = { x: m.x + r.x + r.sw.w + 6, y: m.y + r.y, w: r.w - r.sw.w - 6, h: r.h + 2 };
      save = text => { const tx = src.edit(); for (const p of r.outputs) writeNote(tx, N(), { label: 'Caption', pattern: p, view }, Tree.clean(text) || undefined); commit(tx); };
    } else if (m.type === 'shape' && !['line', 'picture', 'group'].includes(m.geometry)) {
      const legend = m.geometry === 'legend';
      it = legend ? m.texts[0] : m.texts[0] ?? { look: m.look, text: '', lines: [] };
      rect = legend ? { x: m.x, y: m.y + 4, w: m.w, h: 18 } : { x: m.x, y: m.y, w: m.w, h: m.h };
      save = text => { const p = payload(wb, chart, m.id); if (!p) return; const tx = src.edit(); tx.set(m.id, legend ? { ...p, title: text } : { ...p, text }); commit(tx); };
    }
    if (!it) return;
    openEditor(it, rect, typed ?? it.text ?? '', save, m.type === 'shape' && m.geometry !== 'legend');
  }
  function openEditor(it, rect, text, save, multiline) {
    over.querySelector('.dc-edit')?.remove();
    const z = graph.zoom(), p = graph.localToGraph(rect.x, rect.y), t = it.look;
    const ed = document.createElement('div');
    ed.className = 'dc-edit';
    ed.contentEditable = 'plaintext-only';
    ed.spellcheck = false;
    Object.assign(ed.style, { left: `${p.x}px`, top: `${p.y}px`, width: `${rect.w * z}px`, minHeight: `${rect.h * z}px`, font: `${t.Bold ? 700 : 400} ${t.Italic ? 'italic' : ''} ${px(t.Size) * z}px/${1.2} ${Scene.fontFamily(t.Font)}`,
      textAlign: t.Align ?? 'center', color: t.Color, padding: `${2 * z}px ${7.2 * z}px` });
    ed.textContent = text;
    over.appendChild(ed);
    ed.focus();
    const range = document.createRange(); range.selectNodeContents(ed); if (text === it.text) { const s = getSelection(); s.removeAllRanges(); s.addRange(range); } else { range.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(range); }
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
    if (k === 'page' || k === 'label') return;
    const g = groupOf(node.id);
    if (g) { entered = g.id; sel.reset(node); }
    const m = scene.byId.get(node.id);
    edit(m?.geometry === 'legend' && row ? `${m.id}#${row.key}` : node.id, e.target);
  });

  // ---- Relating: drag from a box's edge to another box ----
  let hoverBox = null;
  const handles = ['n', 'e', 's', 'w'].map(side => {
    const h = document.createElement('div');
    h.className = `dc-handle ${side}`;
    h.addEventListener('pointerdown', e => startRelate(e, side));
    over.appendChild(h);
    return h;
  });
  function showHandles(m) {
    hoverBox = m;
    if (!m || sel.getSelectedCells().length > 1) { root.classList.remove('relating-on'); return; }
    const a = graph.localToGraph(m.x, m.y), b = graph.localToGraph(m.x + m.w, m.y + m.h), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    const at = { n: [cx, a.y], e: [b.x, cy], s: [cx, b.y], w: [a.x, cy] };
    handles.forEach(h => { const [x, y] = at[h.classList[1]]; h.style.left = `${x}px`; h.style.top = `${y}px`; });
    root.classList.add('relating-on');
  }
  graph.on('node:mouseenter', ({ node }) => { const m = scene.byId.get(node.id); if (m?.type === 'box' && !dragging) showHandles(m); });
  graph.on('node:mouseleave', ({ e }) => { if (!e.relatedTarget?.closest?.('.dc-handle')) showHandles(null); });
  graph.on('scale translate', () => { if (hoverBox) showHandles(hoverBox); paintStates(); fire('zoom', graph.zoom()); });
  function startRelate(e, side) {
    const from = hoverBox;
    if (!from) return;
    e.preventDefault(); e.stopPropagation();
    const line = document.createElementNS(NS, 'path');
    line.setAttribute('class', 'dc-relating');
    marks.appendChild(line);
    const start = { n: [from.x + from.w / 2, from.y], e: [from.x + from.w, from.y + from.h / 2], s: [from.x + from.w / 2, from.y + from.h], w: [from.x, from.y + from.h / 2] }[side];
    let target = null;
    const move = ev => {
      const p = graph.clientToLocal(ev.clientX, ev.clientY);
      target = scene.marks.find(m => m.type === 'box' && m.id !== from.id && p.x >= m.x && p.x <= m.x + m.w && p.y >= m.y && p.y <= m.y + m.h) ?? null;
      line.setAttribute('d', `M${start[0]},${start[1]} L${p.x},${p.y}`);
      paintStates(target ? new Map([[target.id, 'var(--accent)']]) : null);
    };
    const up = ev => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', up);
      line.remove(); paintStates();
      const p = graph.clientToLocal(ev.clientX, ev.clientY);
      if (target) { src.select([from.id, target.id]); src.emit?.('relate-open', { from: from.id, to: target.id }); }
      else if (Math.hypot(p.x - start[0], p.y - start[1]) > 12) insert('line', { points: [start, [p.x, p.y]], ends: [from.id, null] });
    };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  }

  // ---- States others ask for: highlight, redline, hidden records drawn ----
  function paintStates(extra) {
    if (!scene) return;
    marks.querySelectorAll('.dc-hl, .dc-row, .dc-group').forEach(n => n.remove());
    const outline = (m, color, cls = 'dc-hl', pad = 3) => {
      const p = document.createElementNS(NS, 'path');
      if (m.type === 'line') p.setAttribute('d', `M${m.points.map(q => q.join(',')).join(' L')}`);
      else p.setAttribute('d', `M${m.x - pad},${m.y - pad} h${m.w + 2 * pad} v${m.h + 2 * pad} h${-m.w - 2 * pad} Z`);
      p.setAttribute('class', cls + (m.type === 'line' ? ' line' : ''));
      if (color) p.style.stroke = color;
      marks.appendChild(p);
    };
    const hosts = new Map();
    for (const m of scene.marks) for (const it of m.texts ?? []) hosts.set(it.id, m);
    const lit = new Set();
    for (const [id, color] of [...(hl?.map ?? []), ...(extra ?? [])]) {
      const m = scene.byId.get(id);
      if (!m) continue;
      if (m.type === 'text') {
        const h = hosts.get(id);
        if (!h) continue;
        lit.add(h.id);
        const o = h.type === 'line' ? h.labelAt ?? { x: 0, y: 0 } : h;
        const ys = m.lines.map(l => l.y), xs = m.lines.map(l => l.x - (m.look.Align === 'center' ? l.w / 2 : m.look.Align === 'right' ? l.w : 0));
        outline({ type: 'box', x: o.x + Math.min(...xs), y: o.y + Math.min(...ys) - px(m.look.Size), w: Math.max(...m.lines.map(l => l.w)), h: m.lines.length * px(m.look.Size) * 1.2 }, color, 'dc-hl', 1.5);
      } else { lit.add(id); outline(m, color); }
    }
    // A selected legend row, and an entered or selected group.
    const lg = row && scene.byId.get(row.legend), r = lg?.rows?.find(x => x.key === row.key);
    if (r) outline({ type: 'box', x: lg.x + r.x - 2, y: lg.y + r.y - 1, w: r.w, h: r.h + 2 }, null, 'dc-row', 0);
    for (const g of groups()) if (g.members.some(id => sel.isSelected(graph.getCellById(id) ?? {}))) outline(g, null, 'dc-group', 4);
    const dim = !!hl?.dim && lit.size;
    for (const c of graph.getCells()) {
      const v = graph.findViewByCell(c);
      if (!v) continue;
      const k = c.getData()?.kind, id = k === 'label' ? c.getData().mark : c.id;
      v.container.classList.toggle('dc-dim', !!dim && k !== 'page' && !lit.has(id));
    }
  }
  function highlight(map, { dim = false } = {}) {
    hl = map && map.size ? { map: new Map(map), dim } : null;
    const hidden = hl ? [...hl.map.keys()].filter(id => !scene?.byId.has(id) && src.state.value[id]) : [];
    const next = hidden.length ? hidden : null;
    if (JSON.stringify(next) !== JSON.stringify(revealIds)) { revealIds = next; draw(); } else paintStates();
  }
  function redline(r) {
    if (!r) { red = null; draw(); return; }
    const now = src.state.value, then = r.state ?? now;
    const set = x => x instanceof Set ? x : new Set(x ?? []);
    const appear = r.appear ? set(r.appear) : new Set(Object.keys(then).filter(id => !now[id]));
    const go = r.go ? set(r.go) : new Set(Object.keys(now).filter(id => !then[id]));
    const changed = r.changed ? new Map(r.changed instanceof Map ? r.changed : Object.entries(r.changed))
      : new Map(Object.keys(then).filter(id => now[id] && JSON.stringify(now[id]) !== JSON.stringify(then[id])).map(id => [id, now[id]]));
    red = { state: r.state ?? null, appear, go, changed };
    draw();
  }
  function reveal(ids) { revealIds = ids && [...ids].length ? [...ids] : null; draw(); }

  // ---- Commands ----
  const selected = () => keysOfSelection().map(k => scene.byId.get(k.split('#')[0])).filter(Boolean);
  const placeable = () => selected().flatMap(m => m.geometry === 'group' ? m.members.map(id => scene.byId.get(id)) : [m]).filter(m => m && (m.type === 'box' || m.type === 'shape'));
  function insert(geometry, opts = {}) {
    const view = src.view.value, s = scene, cx = s.page.w / 2, cy = s.page.h / 2;
    const size = { text: [240, 30], line: [160, 0], legend: [220, 0], frame: [320, 200], picture: [160, 100] }[geometry] ?? [140, 70];
    const sel0 = placeable();
    let row = { view, geometry, x: round(cx - size[0] / 2), y: round(cy - size[1] / 2), w: size[0], h: size[1], ...opts };
    if (geometry === 'frame' && sel0.length && !opts.x) {
      const b = { x: Math.min(...sel0.map(m => m.x)), y: Math.min(...sel0.map(m => m.y)), r: Math.max(...sel0.map(m => m.x + m.w)), d: Math.max(...sel0.map(m => m.y + m.h)) };
      row = { ...row, x: round(b.x - 14), y: round(b.y - 28), w: round(b.r - b.x + 28), h: round(b.d - b.y + 42), text: opts.text ?? 'Frame',
        format: { Layer: -1 + Math.min(0, ...s.marks.map(m => m.settings?.Layer?.value ?? m.look?.Layer ?? 0)) } };
    }
    if (geometry === 'line' && opts.points) Object.assign(row, { x: opts.points[0][0], y: opts.points[0][1] });
    if (geometry === 'line' && !opts.points) row.points = [[row.x, cy], [row.x + size[0], cy]];
    if (geometry === 'arrow-line') Object.assign(row, { geometry: 'line', points: [[row.x, cy], [row.x + size[0], cy]], format: { Arrow: 'end' } });
    if (geometry === 'legend') Object.assign(row, { x: round(s.page.margin), y: round(s.page.h - s.page.margin - 120), title: 'Key' });
    if (geometry === 'text') row.text = opts.text ?? '';
    const tx = src.edit(), id = tx.add('shape', row);
    commit(tx);
    src.select([id]);
    if (geometry === 'text' && !opts.text) requestAnimationFrame(() => edit(id));
    return id;
  }
  function remove() {
    const keys = keysOfSelection();
    if (!keys.length) return;
    const tx = src.edit(), n = N(), view = src.view.value;
    for (const k of keys) {
      const [id, rowKey] = k.split('#'), m = scene.byId.get(id);
      if (!m) continue;
      if (m.type === 'box' || m.type === 'line') writeNote(tx, n, { label: 'Shown', pattern: treeOf(m.record), view }, false);
      else if (m.type === 'frame') writeNote(tx, n, { label: 'Frame', pattern: m.output, view }, undefined);
      else if (m.geometry === 'legend' && rowKey) { const p = payload(src.wb.value, src.chart.value, id); tx.set(id, { ...p, hide: [...(p.hide ?? []), rowKey] }); }
      else if (m.geometry === 'group') { tx.remove(id); for (const x of m.members) if (scene.byId.get(x)?.type === 'shape') tx.remove(x); }
      else tx.remove(id);
    }
    commit(tx);
    src.select([]);
  }
  // The clipboard holds marks of one view: pasting a box shows it, a shape is copied.
  let clip = null;
  function copy() { clip = { view: src.view.value, items: placeable().map(m => m.type === 'box' ? { box: m.record, x: m.x, y: m.y, w: m.w } : { row: payload(src.wb.value, src.chart.value, m.id) }).filter(x => x.box || x.row) }; }
  function cut() { copy(); remove(); }
  function paste() {
    if (!clip?.items.length) return;
    const view = src.view.value, n = N(), tx = src.edit(), here = view === clip.view, ids = [];
    for (const it of clip.items) {
      if (it.box) {
        const t = treeOf(it.box);
        if (!t) continue;
        writeNote(tx, n, { label: 'Shown', pattern: t, view }, undefined);
        if (!here || !scene.byId.has(it.box)) { if (!scene.byId.has(it.box)) writeNote(tx, n, { label: 'Shown', pattern: t, view }, true); writeNote(tx, n, { label: 'Position', pattern: t, view }, { x: it.x, y: it.y, w: it.w }); }
        ids.push(it.box);
      } else {
        const d = here ? 12 : 0;
        ids.push(tx.add('shape', { ...it.row, view, x: it.row.x + d, y: it.row.y + d, ...(it.row.points && { points: it.row.points.map(([x, y]) => [x + d, y + d]) }) }));
      }
    }
    commit(tx);
    src.select(ids);
  }
  function duplicate() { copy(); paste(); }
  function nudge(dx, dy) {
    const places = new Map(placeable().map(m => [m.id, { x: m.x + dx, y: m.y + dy, ...(m.points && { dx, dy }) }]));
    if (!places.size) return;
    const tx = src.edit(); place(tx, places); commit(tx);
  }
  function align(how) {
    const ms = placeable();
    if (!ms.length) return;
    const one = ms.length === 1, b = one ? { x: 0, y: 0, r: scene.page.w, d: scene.page.h }
      : { x: Math.min(...ms.map(m => m.x)), y: Math.min(...ms.map(m => m.y)), r: Math.max(...ms.map(m => m.x + m.w)), d: Math.max(...ms.map(m => m.y + m.h)) };
    const at = m => ({ left: { x: b.x }, center: { x: (b.x + b.r - m.w) / 2 }, right: { x: b.r - m.w }, top: { y: b.y }, middle: { y: (b.y + b.d - m.h) / 2 }, bottom: { y: b.d - m.h } })[how];
    const tx = src.edit();
    place(tx, new Map(ms.map(m => { const p = { x: m.x, y: m.y, ...at(m) }; return [m.id, { ...p, ...(m.points && { dx: p.x - m.x, dy: p.y - m.y }) }]; })));
    commit(tx);
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
    const tx = src.edit(); place(tx, places); commit(tx);
  }
  function match(dim) {
    const ms = placeable();
    if (ms.length < 2) return;
    const v = ms[0][dim === 'width' ? 'w' : 'h'];
    const tx = src.edit();
    place(tx, new Map(ms.map(m => [m.id, { x: m.x, y: m.y, w: dim === 'width' ? v : m.w, h: dim === 'height' ? v : m.h }])));
    commit(tx);
  }
  function order(how) {
    const ms = selected().filter(m => m.type !== 'frame');
    if (!ms.length) return;
    const layer = m => m.settings?.Layer?.value ?? 0;
    const peers = scene.marks.filter(m => m.type === ms[0].type);
    const top = Math.max(0, ...peers.map(layer)), bottom = Math.min(0, ...peers.map(layer));
    const tx = src.edit(), n = N(), view = src.view.value;
    for (const m of ms) {
      const v = how === 'front' ? top + 1 : how === 'back' ? bottom - 1 : layer(m) + (how === 'forward' ? 1 : -1);
      if (m.type === 'shape') { const p = payload(src.wb.value, src.chart.value, m.id); tx.set(m.id, { ...p, format: { ...p.format, Layer: v } }); }
      else writeNote(tx, n, { label: 'Layer', pattern: treeOf(m.record), view }, v);
    }
    commit(tx);
  }
  function group() {
    const ms = placeable();
    if (ms.length < 2) return;
    const tx = src.edit();
    for (const g of groups()) if (g.members.some(id => ms.some(m => m.id === id))) tx.remove(g.id);
    const id = tx.add('shape', { view: src.view.value, geometry: 'group', members: ms.map(m => m.id) });
    commit(tx);
    src.select([id]);
  }
  function ungroup() {
    const gs = selected().filter(m => m.geometry === 'group');
    if (!gs.length) return;
    const tx = src.edit();
    for (const g of gs) tx.remove(g.id);
    commit(tx);
    src.select(gs.flatMap(g => g.members));
  }
  function tidy() {
    const view = src.view.value, tx = src.edit();
    for (const n of N().notes('Position')) if (n.view === view) tx.remove(n.note);
    commit(tx, 'Tidied the layout');
  }
  const LEVELS = [0.1, 0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.25, 1.5, 2, 3, 4];
  function zoom(k) {
    if (!scene) return;
    if (k === 'fit') graph.zoomToRect({ x: 0, y: 0, width: scene.page.w, height: scene.page.h }, { padding: 28, maxScale: 2 });
    else if (k === 'in' || k === 'out') {
      const z = graph.zoom(), next = k === 'in' ? LEVELS.find(v => v > z + 0.001) ?? 4 : [...LEVELS].reverse().find(v => v < z - 0.001) ?? 0.1;
      const c = graph.getGraphArea().center ?? null;
      graph.zoomTo(next, c ? { center: graph.graphToLocal(c) } : undefined);
    } else graph.zoomTo(k);
    fire('zoom', graph.zoom());
  }

  // ---- Keys ----
  const keyMap = {
    'Delete': () => remove(), 'Backspace': () => remove(),
    'ArrowLeft': () => nudge(-1, 0), 'ArrowRight': () => nudge(1, 0), 'ArrowUp': () => nudge(0, -1), 'ArrowDown': () => nudge(0, 1),
    'Shift+ArrowLeft': () => nudge(-10, 0), 'Shift+ArrowRight': () => nudge(10, 0), 'Shift+ArrowUp': () => nudge(0, -10), 'Shift+ArrowDown': () => nudge(0, 10),
    '$mod+KeyA': () => { sel.reset(graph.getCells().filter(c => { const k = c.getData()?.kind; return k && k !== 'page' && k !== 'label'; })); },
    '$mod+KeyC': () => copy(), '$mod+KeyX': () => cut(), '$mod+KeyV': () => paste(), '$mod+KeyD': () => duplicate(),
    '$mod+KeyG': () => group(), '$mod+Shift+KeyG': () => ungroup(),
    '$mod+BracketRight': () => order('forward'), '$mod+BracketLeft': () => order('backward'),
    '$mod+Shift+BracketRight': () => order('front'), '$mod+Shift+BracketLeft': () => order('back'),
    '$mod+Equal': () => zoom('in'), '$mod+Minus': () => zoom('out'), '$mod+Digit0': () => zoom('fit'), '$mod+Digit1': () => zoom(1),
    'F2': () => { const k = keysOfSelection(); if (k.length === 1) edit(k[0]); },
    'Enter': () => { const k = keysOfSelection(); if (k.length !== 1) return false; edit(k[0]); },
    'Escape': () => { if (!keysOfSelection().length) return false; entered = null; row = null; src.select([]); },
  };
  const wrapped = Object.fromEntries(Object.entries(keyMap).map(([k, f]) => [k, e => { if (f(e) !== false) { e.preventDefault(); e.stopPropagation(); } }]));
  const unbind = tinykeys.tinykeys(root, wrapped);
  // Typing over a selected box or shape starts editing it, with what was typed.
  root.addEventListener('keydown', e => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1 || e.target !== root) return;
    const k = keysOfSelection();
    if (k.length === 1) { e.preventDefault(); edit(k[0], null, e.key); }
  });
  // A wheel scrolls the page; with Ctrl, X6 zooms.
  gEl.addEventListener('wheel', e => { if (e.ctrlKey || e.metaKey) return; e.preventDefault(); const t = graph.translate(); graph.translate(t.tx - e.deltaX, t.ty - e.deltaY); }, { passive: false });

  const stopDraw = effect(() => { read(); src.version?.value; draw(); });
  const canvas = {
    scene: () => scene, graph, root, selected, select: keys => src.select(keys), keys: keysOfSelection,
    highlight, redline, reveal, insert, remove, copy, cut, paste, duplicate, nudge, align, distribute, match, order, group, ungroup,
    edit: key => edit(key), tidy, zoom, zoomLevel: () => graph.zoom(), on, source: src, writeNote,
    destroy() { stopDraw(); stopSel(); unbind(); graph.dispose(); root.remove(); if (active.peek() === canvas) active.value = null; },
  };
  active.value = canvas;
  return canvas;
}

// The window's source: the workbook as shown, the chart, the view (the first, where none is shown yet), the
// day and the state, the shell's selection, and its edits.
function fromApp() {
  const firstView = computed(() => {
    App.version.value;
    const st = App.shown.value.asOf(App.chart.value, App.day.value), N = App.notes.value;
    const vs = Object.keys(st).filter(id => Tree.isObject(st[id]) && Tree.same(st[id].kind, 'View'));
    return vs.sort((a, b) => (N.order({ id: a, kind: 'View' }) ?? Infinity) - (N.order({ id: b, kind: 'View' }) ?? Infinity))[0] ?? null;
  });
  return {
    wb: App.shown, chart: App.chart, day: App.day, state: App.state, version: App.version,
    view: computed(() => Shell.view.value ?? firstView.value),
    selection: Shell.selection, select: keys => Shell.select(keys), edit: opts => App.edit(opts), emit: Shell.emit,
  };
}

if (typeof Shell !== 'undefined' && typeof App !== 'undefined')
  Shell.register('canvas', { mount(el) { const c = mount(el, fromApp()); return () => c.destroy(); } });

return { mount, fromApp, active, writeNote, payload };
})();
