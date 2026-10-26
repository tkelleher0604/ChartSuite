// Canvas: a view laid out as a chart, drawn on X6. It draws App.scene and nothing else, and keeps no copy of
// formats or positions: a gesture is a change through App.change, and the scene that follows is drawn. The
// gestures are PowerPoint's: click, Shift+click and the marquee; drag, with guides; resize; the arrow keys;
// Delete; copy and paste; align, order and group; double-click to type; and a drag from a box's edge to another
// box, to relate them. The formula bar's highlight, redline and point mode are drawn over the scene, or as a
// variant of it, which shows what the view hides.
const Canvas = (() => {
const { Graph, Selection, Transform, Snapline } = X6;
const { signal, effect } = preactSignals;
Graph.registerNode('dendra', { markup: [], attrs: {} }, true);

const active = signal(null);
const zoomLevel = signal(1);
const BLUE = '#1f5fbf', RED = '#c2372b';
const ANCHOR = { left: 'start', center: 'middle', right: 'end' };
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
// A selection key's mark, and the legend row it names after the first '#', if it names one.
const keyParts = k => { const i = k.indexOf('#'); return i < 0 ? [k, null] : [k.slice(0, i), k.slice(i + 1)]; };
const round = v => Math.round(v * 2) / 2;
// Sizes and weights are points; the canvas draws in pixels.
const px = pt => pt * Scene.PT;

// A free shape's row, as it's kept.
const rowOf = id => { const r = App.shown.peek().item(App.chart.peek(), id)[0]; if (!r) return null; const { id: _, shape, ...p } = r; return p; };

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

function mount(el) {
  const root = document.createElement('div');
  root.className = 'dc';
  root.tabIndex = 0;
  root.innerHTML = '<div class="dc-graph"></div><div class="dc-over"></div>';
  el.appendChild(root);
  const gEl = root.firstChild, over = root.lastChild;

  let scene = null, viewShown = null, hl = null, red = null, revealIds = null, entered = null, row = null, dragging = null, syncing = false;
  let pointing = false, hold = false;
  const cellSig = new Map();
  const zooms = new Map();
  // In History nothing moves: the chart is as it stood.
  const still = () => App.readOnly.peek();

  const graph = new Graph({
    container: gEl, autoResize: true, async: false, background: false, grid: false,
    panning: { enabled: true, eventTypes: ['mouseWheelDown'] },
    mousewheel: { enabled: true, modifiers: ['ctrl', 'meta'], zoomAtMousePosition: true, minScale: 0.1, maxScale: 4, factor: 1.12 },
    scaling: { min: 0.1, max: 4 },
    interacting: view => {
      const k = view.cell.getData()?.kind;
      if (view.cell.isEdge()) return { edgeMovable: k === 'shape' && !still(), edgeLabelMovable: false, arrowheadMovable: false, vertexMovable: false, vertexAddable: false, vertexDeletable: false };
      return { nodeMovable: !pointing && !still() && k !== 'page' && k !== 'label' };
    },
  });
  const sel = new Selection({ enabled: true, multiple: true, rubberband: true, strict: true, movable: true, showNodeSelectionBox: true, showEdgeSelectionBox: false,
    pointerEvents: 'none', multipleSelectionModifiers: ['shift', 'ctrl', 'meta'], filter: c => { const k = c.getData()?.kind; return k && k !== 'page' && k !== 'label'; } });
  graph.use(sel);
  const resizable = n => n.isNode() && ['box', 'shape'].includes(n.getData()?.kind) && !still();
  const transform = new Transform({ resizing: { enabled: resizable, minWidth: 24, minHeight: 12, orthogonal: true }, rotating: false });
  graph.use(transform);
  transform.stopListening(); // it would put handles on whatever is clicked; grips() decides

  // Resize handles on a shape selected alone, however it came to be selected.
  const grips = () => {
    const cs = sel.getSelectedCells();
    if (cs.length === 1 && resizable(cs[0])) { if (!transform.widgets.has(cs[0])) transform.createWidget(cs[0]); } else transform.clearWidgets();
    showHandles();
  };
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

  // ---- Drawing the scene: App's, or a variant of it showing what's highlighted or redlined ----
  function draw() {
    const base = App.scene.peek();
    if (!base) return;
    const view = base.view;
    scene = revealIds || red ? Scene.of(App.shown.peek(), App.chart.peek(), view, base.day, { state: App.state.peek(), computed: App.computed.peek(), reveal: revealIds, redline: red }) : base;
    const cells = [...cellsOf(scene), { id: '·page', shape: 'dendra', x: 0, y: 0, width: scene.page.w, height: scene.page.h, zIndex: -1e6, data: { kind: 'page' },
      markup: [{ tagName: 'rect', attrs: { width: scene.page.w, height: scene.page.h, fill: 'none', 'pointer-events': 'none' } }] }];
    sheet.setAttribute('width', scene.page.w);
    sheet.setAttribute('height', scene.page.h);
    const keep = new Set(cells.map(c => c.id));
    syncing = true;
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
    syncing = false;
    if (viewShown !== view) {
      if (viewShown && graph) zooms.set(viewShown, { s: graph.zoom(), t: graph.translate() });
      viewShown = view;
      const z = zooms.get(view);
      if (z) { graph.zoomTo(z.s); graph.translate(z.t.tx, z.t.ty); } else requestAnimationFrame(() => zoom('fit'));
    }
    syncSelection();
    paintStates();
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
  function keysOfSelection() {
    const ids = sel.getSelectedCells().map(c => c.id), keys = [];
    for (const id of ids) {
      const g = groupOf(id), k = g ? g.id : row && row.legend === id && ids.length === 1 ? `${id}#${row.key}` : id;
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
    if (row && !ids.includes(row.legend)) row = null;
    const keys = keysOfSelection();
    if (!same(keys, Shell.selection.peek())) Shell.select(keys);
    grips();
    paintStates();
  });
  const stopSel = effect(() => { const keys = Shell.selection.value; if (scene && !syncing) { if (!keys.some(k => k.includes('#'))) row = null; syncSelection(); paintStates(); } });

  // While a formula's row is edited (point mode), a click on a box or line names its record to the formula
  // bar and selects nothing. A click on a computed line the bar has lit shows its reasons there.
  function point(on) { pointing = !!on; root.classList.toggle('pointing', pointing); showHandles(); }
  function pointed(cell) {
    const d = cell.getData() ?? {}, m = scene?.byId.get(d.kind === 'label' ? d.mark : cell.id);
    if (!m || (m.type !== 'box' && m.type !== 'line')) return false;
    if (pointing) FormulaBar.point(m.record);
    else if (m.type === 'line' && m.computed && hl?.map.has(m.record)) Shell.emit('why-open', m.record);
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
    if (k === 'page') { if (!e.shiftKey) sel.clean(); sel.startRubberband(e); return; }
    if (pointed(node)) return;
    if (k === 'label' || e.shiftKey || e.ctrlKey || e.metaKey) return;
    if (!sel.isSelected(node)) { syncing = true; sel.reset(cellsFor([groupOf(node.id)?.id ?? node.id])); syncing = false; Shell.select(keysOfSelection()); }
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
      if (key && legendWas === m.id) { row = { legend: m.id, key }; Shell.select([`${m.id}#${key}`]); paintStates(); }
      else if (!key) row = null;
    }
  });
  // A click on a legend already selected selects the row under it.
  let legendWas = null;
  graph.on('node:mousedown', ({ node }) => { legendWas = scene.byId.get(node.id)?.geometry === 'legend' && sel.isSelected(node) ? node.id : null; });
  graph.on('blank:click', () => { row = null; entered = null; });

  // ---- Gestures, each one change ----
  const viewOf = () => scene.view;
  const treeOf = id => Tree.treeOf(App.state.peek(), id);
  // Places for marks, written: a box's Position at its record in this view, a free shape's own place.
  function place(tx, places) {
    const view = viewOf(), n = App.notes.peek();
    for (const [id, p] of places) {
      const m = scene.byId.get(id);
      if (!m) continue;
      if (m.type === 'box') {
        const old = n.position(treeOf(m.record), view);
        tx.note('Position', treeOf(m.record), { x: round(p.x), y: round(p.y), w: round(p.w ?? m.w), ...((p.h !== undefined || old?.h) && { h: round(p.h ?? old.h) }) }, { view });
      } else if (m.type === 'shape') {
        const points = rowOf(id)?.points;
        tx.update(id, { x: round(p.x), y: round(p.y), ...(p.w !== undefined && { w: round(p.w), h: round(p.h) }),
          ...(points && p.dx !== undefined && { points: points.map(([x, y]) => [round(x + p.dx), round(y + p.dy)]) }) });
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
    if (places.size) App.change(tx => place(tx, places));
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
    return m.texts?.find(it => it.id === id) ?? m.texts?.find(it => Tree.isField(App.state.peek()[it.id] ?? {})) ?? m.texts?.[0];
  }
  function edit(key, target, typed) {
    const [id, rowKey] = keyParts(key);
    const m = scene.byId.get(id);
    if (!m || still()) return;
    // What's typed over: a record's value as entered, not as the chart reads it; a shape's text as written.
    let it = null, rect, save, raw;
    const view = viewOf(), caption = (tx, p, text) => tx.note('Caption', p, Tree.clean(text) || undefined, { view });
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
      save = text => App.change(tx => r.outputs.forEach(p => caption(tx, p, text)));
    } else if (m.type === 'shape' && !['line', 'picture', 'group'].includes(m.geometry)) {
      const legend = m.geometry === 'legend';
      it = legend ? m.texts[0] : m.texts[0] ?? { look: m.look, text: '', lines: [] };
      rect = legend ? { x: m.x, y: m.y + 4, w: m.w, h: 18 } : { x: m.x, y: m.y, w: m.w, h: m.h };
      raw = legend ? m.title : rowOf(m.id)?.text;
      // A text box left empty goes, as PowerPoint's does.
      save = text => App.change(tx => m.geometry === 'text' && !text.trim() ? tx.remove(m.id) : tx.update(m.id, legend ? { title: text } : { text }));
    }
    if (!it) return;
    openEditor(it, rect, typed ?? raw ?? it.text ?? '', save, m.type === 'shape' && m.geometry !== 'legend', typed === undefined);
  }
  function openEditor(it, rect, text, save, multiline, selectAll) {
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
    if (k === 'page' || k === 'label') return;
    const g = groupOf(node.id);
    if (g) { entered = g.id; sel.reset(node); }
    const m = scene.byId.get(node.id);
    edit(m?.geometry === 'legend' && row ? `${m.id}#${row.key}` : node.id, e.target);
  });

  // ---- Relating: drag from a box's edge to another box ----
  // The handles sit on the box under the pointer, or else the box selected alone.
  let hoverBox = null, relateBox = null;
  const handles = ['n', 'e', 's', 'w'].map(side => {
    const h = document.createElement('div');
    h.className = `dc-handle ${side}`;
    h.addEventListener('pointerdown', e => startRelate(e, side));
    over.appendChild(h);
    return h;
  });
  function showHandles(hovered = hoverBox) {
    hoverBox = hovered;
    const cs = sel.getSelectedCells(), alone = cs.length === 1 && scene?.byId.get(cs[0].id);
    const m = relateBox = hoverBox ?? (alone?.type === 'box' ? alone : null);
    if (!m || pointing || cs.length > 1) { root.classList.remove('relating-on'); return; }
    // The middles of its sides, on its outline: a triangle's slopes, a diamond's corners.
    const inset = m.shape === 'triangle' ? m.w / 4 : 0;
    // They stand a little off it, clear of the resize handles.
    const a = graph.localToGraph(m.x + inset, m.y), b = graph.localToGraph(m.x + m.w - inset, m.y + m.h), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2, o = 12;
    const at = { n: [cx, a.y - o], e: [b.x + o, cy], s: [cx, b.y + o], w: [a.x - o, cy] };
    handles.forEach(h => { const [x, y] = at[h.classList[1]]; h.style.left = `${x}px`; h.style.top = `${y}px`; });
    root.classList.add('relating-on');
  }
  graph.on('node:mouseenter', ({ node }) => { const m = scene.byId.get(node.id); if (m?.type === 'box' && !dragging) showHandles(m); });
  graph.on('node:mouseleave', ({ e }) => { if (!e.relatedTarget?.closest?.('.dc-handle')) showHandles(null); });
  for (const name of ['scale', 'translate']) graph.on(name, () => { showHandles(); zoomLevel.value = graph.zoom(); });
  function startRelate(e, side) {
    const from = relateBox;
    if (!from) return;
    e.preventDefault(); e.stopPropagation();
    const line = document.createElementNS(NS, 'path');
    line.setAttribute('class', 'dc-relating');
    marks.appendChild(line);
    const inset = from.shape === 'triangle' ? from.w / 4 : 0;
    const start = { n: [from.x + from.w / 2, from.y], e: [from.x + from.w - inset, from.y + from.h / 2], s: [from.x + from.w / 2, from.y + from.h], w: [from.x + inset, from.y + from.h / 2] }[side];
    let target = null;
    const move = ev => {
      const p = graph.clientToLocal(ev.clientX, ev.clientY);
      target = scene.marks.find(m => m.type === 'box' && m.id !== from.id && p.x >= m.x && p.x <= m.x + m.w && p.y >= m.y && p.y <= m.y + m.h) ?? null;
      line.setAttribute('d', `M${start[0]},${start[1]} L${p.x},${p.y}`);
      paintStates(target ? new Map([[target.id, ['accent', 1]]]) : null);
    };
    const up = ev => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', up);
      line.remove(); paintStates();
      const p = graph.clientToLocal(ev.clientX, ev.clientY);
      if (target) Shell.emit('relate-open', [from.id, target.id]);
      else if (Math.hypot(p.x - start[0], p.y - start[1]) > 12) insert('line', { points: [start, [p.x, p.y]], ends: [from.id, null] });
    };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  }

  // ---- States others ask for: highlight, redline, hidden records drawn ----
  function paintStates(extra) {
    if (!scene) return;
    marks.querySelectorAll('.dc-hl, .dc-row, .dc-group, .dc-sel').forEach(n => n.remove());
    const outline = (m, cls, pad = 3) => {
      const p = document.createElementNS(NS, 'path');
      if (m.type === 'line') p.setAttribute('d', `M${m.points.map(q => q.join(',')).join(' L')}`);
      else {
        // Round a box by its own outline; a triangle's grows from its apex, so it stays clear of it.
        const k = m.shape === 'triangle' ? 2.2 : 1;
        p.setAttribute('d', Scene.path(m.type === 'box' ? m.shape : 'rect', m.w + 2 * pad * k, m.h + 2 * pad * (k === 1 ? 1 : 1.4)));
        p.setAttribute('transform', `translate(${m.x - pad * k},${m.y - pad * (k === 1 ? 1 : 1.8)})`);
      }
      p.setAttribute('class', cls + (m.type === 'line' ? ' line' : ''));
      marks.appendChild(p);
    };
    const hosts = new Map();
    for (const m of scene.marks) for (const it of m.texts ?? []) hosts.set(it.id, m);
    // A record not drawn as text lights the box or line it sits in.
    const markFor = id => { const st = App.state.peek(); for (let x = id; x; x = st[x]?.at) { const m = scene.byId.get(x); if (m) return m; } return null; };
    const lit = new Set();
    // Each record lit takes its hue, and its depth: 0 a witness, heavier; 2 a deeper reason, lighter.
    for (const [id, [hue, depth]] of [...(hl?.map ?? []), ...(extra ?? [])]) {
      const m = markFor(id);
      if (!m) continue;
      const cls = `dc-hl h${hue}` + (depth === 0 ? ' strong' : depth === 2 ? ' deep' : '') + (hl?.pulse.has(id) ? ' pulse' : '');
      if (m.type === 'text') {
        const h = hosts.get(m.id);
        if (!h) continue;
        lit.add(h.id);
        const o = h.type === 'line' ? h.labelAt ?? { x: 0, y: 0 } : h;
        const ys = m.lines.map(l => l.y), xs = m.lines.map(l => l.x - (m.look.Align === 'center' ? l.w / 2 : m.look.Align === 'right' ? l.w : 0));
        outline({ type: 'box', x: o.x + Math.min(...xs), y: o.y + Math.min(...ys) - px(m.look.Size), w: Math.max(...m.lines.map(l => l.w)), h: m.lines.length * px(m.look.Size) * 1.2 }, cls, 1.5);
      } else { lit.add(m.id); outline(m, cls); }
    }
    // A selected legend row, and an entered or selected group.
    const lg = row && scene.byId.get(row.legend), r = lg?.rows?.find(x => x.key === row.key);
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
      const k = c.getData()?.kind, id = k === 'label' ? c.getData().mark : c.id;
      v.container.classList.toggle('dc-dim', !!dim && k !== 'page' && !lit.has(id));
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
  // Boxes and lines the view hides are drawn while they're highlighted, redlined, or asked for. (An entry
  // isn't: it lights what it sits in, so no box changes size under the pointer.)
  let asked = [], redDrawn = null;
  function reveal(ids) { asked = ids ? [...ids] : []; show(); }
  function show() {
    const st = red?.state ? { ...App.state.peek(), ...red.state } : App.state.peek();
    const drawable = id => { const r = st[id]; return r && (Tree.isObject(r) || r.args?.length === 2); };
    const ids = [...new Set([...asked, ...(hl ? hl.map.keys() : []), ...(red ? [...red.appear, ...red.go, ...red.changed.keys()] : [])])].filter(drawable).sort();
    const next = ids.length ? ids : null;
    if (JSON.stringify(next) !== JSON.stringify(revealIds) || red !== redDrawn) { revealIds = next; redDrawn = red; draw(); } else paintStates();
  }


  // ---- Commands ----
  const selected = () => keysOfSelection().map(k => scene.byId.get(keyParts(k)[0])).filter(Boolean);
  const placeable = () => selected().flatMap(m => m.geometry === 'group' ? m.members.map(id => scene.byId.get(id)) : [m]).filter(m => m && (m.type === 'box' || m.type === 'shape'));
  const moveTo = places => places.size && App.change(tx => place(tx, places));
  function insert(geometry, opts = {}) {
    // A new shape goes in the middle of what's on screen, as PowerPoint puts one.
    const view = viewOf(), s = scene, r = root.getBoundingClientRect(), mid = graph.clientToLocal(r.left + r.width / 2, r.top + r.height / 2);
    const cx = Math.min(Math.max(mid.x, 80), s.page.w - 80), cy = Math.min(Math.max(mid.y, 60), s.page.h - 60);
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
    let id = null;
    if (!App.change(tx => { id = tx.add('shape', row); })) return null;
    Shell.select([id]);
    if (geometry === 'text' && !opts.text) requestAnimationFrame(() => edit(id));
    return id;
  }
  // Deleting from a chart hides a box or line in this view, and deletes a shape.
  function remove() {
    const keys = keysOfSelection(), view = viewOf();
    if (!keys.length) return;
    App.change(tx => {
      for (const k of keys) {
        const [id, rowKey] = keyParts(k), m = scene.byId.get(id);
        if (!m) continue;
        if (m.type === 'box' || m.type === 'line') tx.note('Shown', treeOf(m.record), false, { view });
        else if (m.type === 'frame') tx.note('Frame', m.output, undefined, { view });
        else if (m.geometry === 'legend' && rowKey) tx.update(id, { hide: [...m.hide, rowKey] });
        else if (m.geometry === 'group') { tx.remove(id); for (const x of m.members) if (scene.byId.get(x)?.type === 'shape') tx.remove(x); }
        else tx.remove(id);
      }
    });
    Shell.select([]);
  }
  // The clipboard holds marks of one view: pasting a box shows it, a shape is copied.
  let clip = null;
  function copy() { clip = { view: viewOf(), items: placeable().map(m => m.type === 'box' ? { box: m.record, x: m.x, y: m.y, w: m.w } : { row: rowOf(m.id) }).filter(x => x.box || x.row) }; }
  function cut() { copy(); remove(); }
  function paste() {
    if (!clip?.items.length) return;
    const view = viewOf(), here = view === clip.view, ids = [];
    App.change(tx => {
      for (const it of clip.items) {
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
  function duplicate() { copy(); paste(); }
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
  function tidy() {
    const view = viewOf();
    App.change(tx => App.notes.peek().notes('Position').filter(n => n.view === view).forEach(n => tx.remove(n.note)), { say: 'Tidied the layout' });
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
    zoomLevel.value = graph.zoom();
  }

  // ---- Keys: PowerPoint's, Ctrl+[ and Ctrl+] among them for the order ----
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
    'Escape': () => { if (!keysOfSelection().length) return false; entered = null; row = null; Shell.select([]); },
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

  const stopDraw = effect(() => { App.scene.value; draw(); });
  const canvas = {
    scene: () => scene, graph, root, selected, keys: keysOfSelection, highlight, redline, reveal, point,
    insert, remove, copy, cut, paste, duplicate, nudge, align, distribute, match, order, group, ungroup, edit: key => edit(key), tidy, zoom,
    destroy() { stopDraw(); stopSel(); unbind(); graph.dispose(); root.remove(); if (active.peek() === canvas) active.value = null; },
  };
  active.value = canvas;
  return canvas;
}

// The other parts call the canvas shown through the shell (Shell.parts.value.canvas).
const call = name => (...a) => active.peek()?.[name](...a);
Shell.register('canvas', { mount(el) { const c = mount(el); return () => c.destroy(); },
  highlight: call('highlight'), redline: call('redline'), reveal: call('reveal'), point: call('point') });
const here = () => !!active.value;
Shell.register('action', { id: 'chart.tidy', name: 'Tidy', enabled: here, run: call('tidy') });
Shell.register('action', { id: 'chart.fit', name: 'Zoom to fit', keys: '$mod+Digit0', enabled: here, run: () => call('zoom')('fit') });

return { active, zoom: zoomLevel, keyParts };
})();
