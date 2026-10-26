// The chart: a sheet with a box for each object and a line for each two-argument relation, drawn the way
// the styles say (styles.js). The ribbon sits above it, the record panel on the right, and along the
// bottom the view tabs, the legend's switch and the zoom. The location hash says what's selected, so
// clicking a box opens its object in the panel, and opening a record in the panel selects its box. The
// page starts the shell at the end of this file.

const chart = {
  zoom: 1,
  engaged: null,   // { styleId, output }: the style picked to format, if one was picked; see currentEngaged
  editing: null,   // { id, text }: a field whose text is being typed over in its box
  move: null,      // { id, startX, startY, place, x, y, moved, line }: a box being pressed or dragged
  connect: null,   // { from, x0, y0, x, y, over }: a relation being drawn from a box's handle
  quick: null,     // { x, y, kind, name }: the new-object menu, then the new box being named
  geometry: {},    // each box as last drawn: { x, y, w, h, shape }
  ask: null,       // { text, choices: [{ label, run, primary }] }: a question about what to do, over the chart
  renaming: null,  // { id, text, select }: a view tab whose name is being typed
  tabDrag: null,   // { id, x0, moved, to }: a view tab being dragged to a new place
  presenting: null, // { view, zoom, left, top }: while presenting, the view to come back to
  fitPending: false, // whether the next drawing fits the sheet to the screen, as after a chart switch
  looked: false,   // whether the page has looked at the chart yet (see lookAtChart)
  undoDepth: 0,    // how deep the undo stack was at the last drawing, to tell whether a change was an edit
  selectionKey: '',
  tab: 'home',
};

const GRID = 5;
const snap = v => Math.round(v / GRID) * GRID;

// ---- Selection ----

// What the hash selects: a box (an object, or a record in one), a relation's line (the relation, or a
// record located at it, like an ownership's Percentage), or the two sides of a relation being added.
function selection() {
  const view = currentView();
  if (view.relate) return { relate: view.relate };
  if (!view.id) return {};
  const head = objectOf(view.id);
  if (isRelation(records[head])) return { relation: head, record: view.id };
  return { object: head, record: view.id };
}

// Moves the selection, re-rendering even when the hash doesn't change.
function go(hash) {
  if (readHash() === hash) render();
  else location.hash = hash;
}

// ---- The engaged style ----

// The engaged style is the one the ribbon's formatting controls edit, and that the panel and chart point
// out. It's the one picked, if any; otherwise it follows the selection: a selected record's own style, or
// the last style to set the look of the selected box, or the selected line's own style.
function currentEngaged() {
  const s = chart.engaged && styleById(chart.engaged.styleId);
  if (s) return { style: s, output: chart.engaged.output };
  return defaultEngaged();
}

function defaultEngaged() {
  const sel = selection();
  if (sel.relation) {
    const id = sel.record !== sel.relation && styleOf(sel.record) ? sel.record : sel.relation;
    const s = styleOf(id);
    return s ? { style: s, output: outputKey(records[id]) } : null;
  }
  if (sel.object) {
    if (sel.record !== sel.object) {
      const s = styleOf(sel.record);
      if (s) return { style: s, output: outputKey(records[sel.record]) };
    }
    const { applied } = boxLook(sel.object);
    const a = applied.filter(x => BOX_PROPS.some(p => x.props[p] !== undefined)).at(-1) ?? applied[0];
    if (a) return { style: a.style, output: a.output };
  }
  const kind = styles.find(isKindStyle);
  return kind ? { style: kind, output: Object.keys(kind.map)[0] } : null;
}

// Picks a style to format. Its output is the selection's, if the style applies to the selection.
function engage(styleId, output) {
  chart.engaged = { styleId, output: output ?? selectionOutput(styleById(styleId)) ?? styleOutputs(styleById(styleId))[0]?.[0] ?? '*' };
}

// The output through which a style applies to the selection, if it does: to the selected box, or to the
// selected line or something located at it.
function selectionOutput(style) {
  const sel = selection();
  if (sel.relation) {
    const id = panelOrder(sel.relation).find(k => formKeyOf(k) === style.form);
    return id ? outputKey(records[id]) : undefined;
  }
  if (sel.object) return boxLook(sel.object).applied.find(a => a.style === style)?.output;
}

// A new selection keeps the engaged style if it applies there too, now through the selection's output.
function syncEngaged() {
  const key = location.hash;
  if (key === chart.selectionKey) return;
  chart.selectionKey = key;
  const s = chart.engaged && styleById(chart.engaged.styleId);
  const output = s && selectionOutput(s);
  chart.engaged = output ? { styleId: s.id, output } : null;
}

// The boxes, lines of text and relation lines the engaged style's entry reaches, to point them out.
function coveredBy(eng) {
  const ids = new Set(eng ? recordsWithOutput(eng.style, eng.output) : []);
  return { ids, objects: new Set([...ids].map(objectOf).filter(id => !isRelation(records[id]))) };
}

// ---- Drawing ----

// A box the view draws for the first time, for an object made on another page or in the panel, goes near
// what it's related to: below the boxes it's owned or controlled by (as Tidy reads relations, the first
// side above the second), or else above those it owns; related to nothing drawn, it goes in the middle of
// what the chart is showing. Either way it keeps clear of the boxes there. Its place is kept in the view's
// layout from then on, as if it had been put there by hand; where a view first puts a box isn't an edit.
function placeNewBoxes(ids) {
  const unplaced = ids.filter(id => !layout[id]);
  if (!unplaced.length) return;
  const drawn = new Set(ids);
  const next = { ...layout };
  const box = id => ({ ...next[id], w: next[id].w ?? 200, h: chart.geometry[id]?.h ?? 60 });
  const clear = (p, h) => ids.filter(id => next[id]).map(box).every(b => p.x >= b.x + b.w + 20 || p.x + p.w + 20 <= b.x || p.y >= b.y + b.h + 30 || p.y + h + 30 <= b.y);
  for (const id of unplaced) {
    const above = [], below = [];
    for (const [rid, r] of Object.entries(records)) {
      if (!isRelation(r) || r.args.length !== 2 || isComputed(rid)) continue;
      const [a, b] = r.args.map(x => objectOf(x.at));
      if (a === id && b !== id && drawn.has(b) && next[b]) below.push(box(b));
      if (b === id && a !== id && drawn.has(a) && next[a]) above.push(box(a));
    }
    const near = above.length ? above : below;
    const middle = gs => gs.reduce((s, g) => s + g.x + g.w / 2, 0) / gs.length;
    const [cx, cy] = near.length ? [middle(near), 0] : viewCenter(ids.filter(k => next[k]).map(box));
    const y = Math.max(20, above.length ? Math.max(...above.map(g => g.y + g.h)) + 80
      : below.length ? Math.min(...below.map(g => g.y)) - 140 : cy - 30);
    // The nearest clear place in its row, trying right and left in turn, then the rows below.
    const w = 200, steps = [0, ...Array.from({ length: 16 }, (_, i) => (i % 2 ? -1 : 1) * Math.ceil((i + 1) / 2) * (w + 40))];
    let place = null;
    for (let row = 0; !place && row < 6; row++)
      for (const dx of steps) {
        const p = { x: Math.max(20, snap(cx - w / 2 + dx)), y: snap(y + row * 110), w };
        if (clear(p, 60)) { place = p; break; }
      }
    next[id] = place ?? { x: Math.max(20, snap(cx - w / 2)), y: snap(y), w };
  }
  layout = next;
  saveState();
}

// The middle of what the chart is showing, once the page has looked at it; before that, of the boxes.
function viewCenter(boxes) {
  if (chart.looked) return visibleCenter();
  if (!boxes.length) return [480, 300];
  const mid = (lo, hi) => (Math.min(...lo) + Math.max(...hi)) / 2;
  return [mid(boxes.map(g => g.x), boxes.map(g => g.x + g.w)), mid(boxes.map(g => g.y), boxes.map(g => g.y + g.h))];
}

function placeOf(id) {
  const place = { w: 200, ...layout[id] };
  if (chart.move?.id === id && chart.move.moved) return { ...place, x: chart.move.x, y: chart.move.y };
  return place;
}

function nodeHtml(id, place, look, state) {
  const { box, lines } = look;
  const cls = ['node', `shape-${box.shape}`, state.selected && 'is-selected', state.side && 'is-side', state.target && 'is-target',
    chart.move?.id === id && chart.move.moved && 'is-moving'].filter(Boolean).join(' ');
  const vars = `left:${place.x}px;top:${place.y}px;width:${place.w}px;--w:${place.w}px;--fill:${box.fill};--stroke:${box.stroke};--sw:${box.strokeWidth}px;--dash:${box.dash}`;
  const shape = box.shape !== 'triangle' ? '' : `<svg class="node-shape" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
    <polygon points="50,0.8 99.3,99.3 0.7,99.3" fill="${box.fill}" stroke="${box.stroke}" stroke-width="${box.strokeWidth}" stroke-dasharray="${DASH_ARRAYS[box.dash]}" stroke-linejoin="round" vector-effect="non-scaling-stroke" /></svg>`;
  const text = lines.map(l => lineHtml(l, state)).join('') || '<div class="node-empty">No text shown</div>';
  const handles = ['n', 'e', 's', 'w'].map(h => `<span class="handle handle-${h}" data-handle="${id}" title="Drag to another box to relate them"></span>`).join('');
  // Something required that's blank is flagged on the box, as it is in the panel.
  const missing = id === '__new' ? [] : [...new Set(missingUnder(id).map(m => m.label))];
  const flag = missing.length ? `<span class="node-flag" title="Required, but blank: ${esc(missing.join(', '))}">*</span>` : '';
  // A box the view's filter couldn't be worked out at is shown, and marked with why.
  const fault = id === '__new' ? null : filterOutcome(viewFilter()).errors.get(id);
  const filterFlag = fault ? `<span class="node-flag is-filter" title="This view’s filter gives ${esc(fault.code)} here: ${esc(fault.msg ?? '')}">!</span>` : '';
  // A box takes the focus, so Tab reaches it (see the keys below).
  const focus = id === '__new' ? '' : ` tabindex="0" role="button" aria-label="${esc(objectName(id))}"`;
  return `<div class="${cls}" data-node="${id}"${focus} style="${vars}">${shape}<div class="node-text">${text}</div>${flag}${filterFlag}${handles}</div>`;
}

// Text a formula works out is set in italics, so it reads as computed.
const computedLook = (id, look) => isComputed(id) ? { ...look, italic: true } : look;

// A line of text too long to show whole in its box (see .node-line) gives its whole text on hover.
const LONG_LINE = 90;

function lineHtml(l, state) {
  const editing = chart.editing?.id === l.id;
  const engaged = state.covered.ids.has(l.id) && state.engagedStyle === l.styleId;
  const cls = `node-line${editing ? ' is-editing' : ''}${engaged ? ' is-engaged' : ''}`;
  const hint = isComputed(l.id) ? 'Worked out by a formula' : isField(records[l.id]) ? 'Double-click to edit' : '';
  const tip = [l.text.length > LONG_LINE && l.text, hint].filter(Boolean).join('\n');
  const attrs = editing ? ' contenteditable="plaintext-only" spellcheck="false" data-chart-edit' : tip ? ` title="${esc(tip)}"` : '';
  return `<div class="${cls}" data-line="${l.id}" data-style="${l.styleId}"${attrs} style="${textCss(computedLook(l.id, l.look))}">${esc(editing ? chart.editing.text : l.text)}</div>`;
}

// The new box being named, before it's added.
function quickNodeHtml() {
  const q = chart.quick;
  if (!q?.kind) return '';
  const look = { box: { ...BOX_DEFAULTS, ...pickProps(styles.find(isKindStyle)?.map[norm(q.kind)] ?? KIND_PRESET, BOX_PROPS) }, lines: [] };
  const name = `<div class="node-line is-editing" contenteditable="plaintext-only" spellcheck="false" data-quick-name style="${textCss({ ...TEXT_DEFAULTS, bold: true })}">${esc(q.name)}</div>`;
  return nodeHtml('__new', { x: q.x - 100, y: q.y - 25, w: 200 }, look, { selected: true, covered: { ids: new Set() } })
    .replace('<div class="node-empty">No text shown</div>', name);
}

// Where a line meets a box's outline at height y, on its left or right side.
function sideX(g, y, right) {
  const cx = g.x + g.w / 2;
  let half = g.w / 2;
  if (g.shape === 'triangle') half = g.w / 2 * Math.min(1, Math.max(0, (y - g.y) / g.h));
  if (g.shape === 'oval') { const t = (y - (g.y + g.h / 2)) / (g.h / 2); half = g.w / 2 * Math.sqrt(Math.max(0, 1 - t * t)); }
  return right ? cx + half : cx - half;
}

// Where a line leaving a box at x meets its outline, on its bottom or top.
function edgeY(g, x, bottom) {
  if (g.shape !== 'oval') return bottom ? g.y + g.h : g.y;
  const t = (x - (g.x + g.w / 2)) / (g.w / 2);
  const half = g.h / 2 * Math.sqrt(Math.max(0, 1 - t * t));
  return g.y + g.h / 2 + (bottom ? half : -half);
}

// Lays out each line. One that goes down (or up) leaves its source's bottom (or top), turns along a lane
// just past the source, and drops onto the target, where lines arrive spread across its top (all at the
// apex, for a triangle) in the order of where they start, so they don't cross there.
// - Lines of one look from one box share a trunk: they leave it together and turn along one lane, as a
//   parent's lines do on a structure chart. Trunks of different looks (ownership and positions, say)
//   leave a box apart, spread along its edge in the order of where they go.
// - Trunks leaving boxes level with each other turn along lanes stacked in the space below them (or above),
//   in the order that crosses the fewest of the others' lines, as yEd's channel routing does. Trunks that
//   don't overlap share a lane.
// - Boxes level with each other are joined side to side, unless another box is in the way; then the line
//   goes under the boxes between, on a lane of its own, and comes up into the target's bottom.
function route(lines, geo) {
  const between = (l, y) => {
    const s = geo[l.from], t = geo[l.to];
    const x0 = Math.min(s.x + s.w, t.x + t.w), x1 = Math.max(s.x, t.x);
    return Object.entries(geo).filter(([id, g]) => id !== l.from && id !== l.to && g.y < y && g.y + g.h > y && g.x < x1 && g.x + g.w > x0).map(([, g]) => g);
  };
  for (const l of lines) {
    const s = geo[l.from], t = geo[l.to];
    l.dir = t.y >= s.y + s.h + 16 ? 'down' : s.y >= t.y + t.h + 16 ? 'up' : 'side';
    if (l.dir === 'side') {
      const y = (Math.max(s.y, t.y) + Math.min(s.y + s.h, t.y + t.h)) / 2;
      const blocking = between(l, y);
      if (blocking.length) Object.assign(l, { dir: 'under', floor: Math.max(s.y + s.h, t.y + t.h, ...blocking.map(g => g.y + g.h)) });
    }
  }
  const groupBy = (list, key) => list.reduce((m, l) => m.set(key(l), [...(m.get(key(l)) ?? []), l]), new Map());
  const centerX = g => g.x + g.w / 2;
  // Each box's trunks, and where each leaves it. A triangle's lines up leave by its sides (below).
  const vertical = lines.filter(l => l.dir === 'down' || l.dir === 'up');
  const trunks = [...groupBy(vertical, l => `${l.from}|${l.dir}|${JSON.stringify(pickProps(l.look, LINE_PROPS))}`).values()]
    .map(ls => ({ ls, from: ls[0].from, dir: ls[0].dir }));
  const heading = t => t.ls.reduce((sum, l) => sum + centerX(geo[l.to]), 0) / t.ls.length;
  for (const group of groupBy(trunks, t => `${t.from}|${t.dir}`).values()) {
    const s = geo[group[0].from];
    const sides = s.shape === 'triangle' && group[0].dir === 'up';
    group.sort((a, b) => heading(a) - heading(b)).forEach((t, i) => {
      t.x = sides ? centerX(s) : s.x + s.w * (i + 1) / (group.length + 1);
      t.y = edgeY(s, t.x, t.dir === 'down');
      t.edge = t.dir === 'down' ? s.y + s.h : s.y;
      for (const l of t.ls) l.sx = t.x;
    });
  }
  const arriving = lines.filter(l => l.dir !== 'side');
  for (const ls of groupBy(arriving, l => `${l.to}|${l.dir === 'down' ? 'top' : 'bottom'}`).values()) {
    const t = geo[ls[0].to];
    const start = l => l.sx ?? centerX(geo[l.from]);
    ls.sort((p, q) => start(p) - start(q));
    // Labels just above the target are staggered when lines arrive close together, on three levels for many.
    const levels = ls.length > 4 ? 3 : 2;
    ls.forEach((l, i) => {
      l.tx = t.shape === 'triangle' && l.dir === 'down' ? t.x + t.w / 2 : t.x + t.w * (i + 1) / (ls.length + 1);
      l.stagger = ls.length > 2 || (ls.length === 2 && t.w < 260) ? i % levels : 0;
    });
  }
  // Lines going under leave their source's bottom, each on its own lane below whatever is in the way.
  lines.filter(l => l.dir === 'under').forEach((l, j) => {
    const s = geo[l.from], t = geo[l.to];
    const lane = l.floor + 16 + 9 * j;
    l.points = [[centerX(s), s.y + s.h], [centerX(s), lane], [l.tx, lane], [l.tx, t.y + t.h]];
  });
  // The lanes. A trunk placed nearer its boxes than another crosses it where the other's stem rises through
  // its lane, and where its own drops pass the other's lane; each channel's trunks are stacked, nearest
  // first, by picking each time the one whose place there crosses the fewest of those left.
  for (const t of trunks) { const xs = [t.x, ...t.ls.map(l => l.tx)]; t.span = [Math.min(...xs), Math.max(...xs)]; }
  const within = (x, [a, b]) => x > a + 0.5 && x < b - 0.5;
  const crossings = (near, far) => within(far.x, near.span) + near.ls.filter(l => within(l.tx, far.span)).length;
  const overlap = (a, b) => a.span[0] < b.span[1] + 6 && b.span[0] < a.span[1] + 6;
  const channels = [];
  for (const t of [...trunks].sort((a, b) => a.x - b.x)) {
    const ch = channels.find(c => c.dir === t.dir && Math.abs(c.edge - t.edge) < 40);
    if (ch) ch.trunks.push(t); else channels.push({ dir: t.dir, edge: t.edge, trunks: [t] });
  }
  for (const ch of channels) {
    // A trunk that runs straight down (or up) needs no lane.
    const left = ch.trunks.filter(t => t.span[1] - t.span[0] >= 1), placed = [];
    for (const t of ch.trunks) t.lane = 0;
    while (left.length) {
      const cost = t => left.reduce((sum, o) => sum + (o === t ? 0 : crossings(t, o)), 0);
      const next = left.reduce((best, t) => cost(t) < cost(best) ? t : best);
      left.splice(left.indexOf(next), 1);
      next.lane = Math.max(-1, ...placed.filter(o => overlap(o, next)).map(o => o.lane)) + 1;
      placed.push(next);
    }
  }
  for (const t of trunks) {
    const s = geo[t.from];
    if (t.dir === 'down') {
      const limit = Math.min(...t.ls.map(l => geo[l.to].y)) - 14;
      t.laneY = Math.max(t.edge + 8, Math.min(t.edge + 18 + 10 * t.lane, limit));
      for (const l of t.ls) l.points = [[t.x, t.y], [t.x, t.laneY], [l.tx, t.laneY], [l.tx, geo[l.to].y]];
    } else if (s.shape === 'triangle') {
      // A triangle's apex is where lines come in, so lines up from one leave by its sloping sides.
      const y = s.y + s.h * 0.6;
      for (const l of t.ls) {
        const right = l.tx >= t.x;
        l.points = [[sideX(s, y, right), y], [l.tx + (Math.abs(l.tx - t.x) < s.w / 2 ? (right ? s.w / 2 + 16 : -s.w / 2 - 16) : 0), y]];
        const turn = l.points[1][0];
        l.points.push([turn, geo[l.to].y + geo[l.to].h + 14], [l.tx, geo[l.to].y + geo[l.to].h + 14], [l.tx, geo[l.to].y + geo[l.to].h]);
      }
    } else {
      const limit = Math.max(...t.ls.map(l => geo[l.to].y + geo[l.to].h)) + 14;
      t.laneY = Math.min(t.edge - 8, Math.max(t.edge - 18 - 10 * t.lane, limit));
      for (const l of t.ls) l.points = [[t.x, t.y], [t.x, t.laneY], [l.tx, t.laneY], [l.tx, geo[l.to].y + geo[l.to].h]];
    }
  }
  for (const l of lines.filter(l => l.dir === 'side')) {
    const s = geo[l.from], t = geo[l.to];
    const y = (Math.max(s.y, t.y) + Math.min(s.y + s.h, t.y + t.h)) / 2;
    const rightward = s.x + s.w / 2 < t.x + t.w / 2;
    l.points = [[sideX(s, y, rightward), y], [sideX(t, y, !rightward), y]];
  }
  for (const l of lines) {
    l.points = l.points.filter((p, i, ps) => i === 0 || Math.hypot(p[0] - ps[i - 1][0], p[1] - ps[i - 1][1]) > 0.5);
    if (l.points.length === 3 && Math.abs(l.points[0][0] - l.points[2][0]) < 1) l.points = [l.points[0], l.points[2]];
    l.label = labelSpot(l, geo);
  }
  // A trunk whose lines all say the same thing, like a GP's to each of its funds, says it once, on its lane.
  // That's for a relation's name or option; an amount, like a percentage, is said on each line.
  for (const t of trunks) {
    const own = t.ls.every(l => l.look.parts.length === 1 && l.look.parts[0].id === l.id && !isField(records[l.id]));
    if (t.ls.length < 2 || !own || new Set(t.ls.map(l => l.look.label)).size > 1 || t.laneY === undefined) continue;
    t.ls.forEach((l, i) => { l.label = i ? null : { x: (t.span[0] + t.span[1]) / 2, y: t.laneY - 7 }; });
  }
}

// A turning line's label sits on its last leg just short of the box it arrives at, as percentages do on
// structure charts, staggered when lines arrive side by side; with no room there, or on a straight line
// or into a triangle's apex, it sits midway along the longest leg. A line with no length has no label.
function labelSpot(l, geo) {
  const ps = l.points;
  if (ps.length < 2) return null;
  const legs = ps.slice(1).map((p, i) => ({ a: ps[i], b: p, len: Math.hypot(p[0] - ps[i][0], p[1] - ps[i][1]) }));
  const last = legs.at(-1);
  if (ps.length > 2 && last.len >= 30 && geo[l.to].shape !== 'triangle') {
    const off = 12 + (l.stagger ?? 0) * 14;
    return l.dir === 'down' ? { x: last.b[0], y: Math.max(last.a[1] + 8, last.b[1] - off) } : { x: last.b[0], y: Math.min(last.a[1] - 8, last.b[1] + off) };
  }
  const leg = last.len >= 34 ? last : legs.reduce((m, g) => g.len > m.len ? g : m);
  const flat = Math.abs(leg.a[1] - leg.b[1]) < 1;
  return { x: (leg.a[0] + leg.b[0]) / 2, y: (leg.a[1] + leg.b[1]) / 2 - (flat ? 7 : 0) };
}

// A path through the points with gently rounded corners.
function pathD(points, r = 6) {
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i - 1], [x, y] = points[i], [nx, ny] = points[i + 1];
    const k = Math.min(r, Math.hypot(x - px, y - py) / 2, Math.hypot(nx - x, ny - y) / 2);
    const ax = x - Math.sign(x - px) * k, ay = y - Math.sign(y - py) * k;
    const bx = x + Math.sign(nx - x) * k, by = y + Math.sign(ny - y) * k;
    d += ` L${ax},${ay} Q${x},${y} ${bx},${by}`;
  }
  const end = points.at(-1);
  return `${d} L${end[0]},${end[1]}`;
}

// A line's label is in parts: the relation's own text, and each record at it that shows, like a
// Percentage. Clicking a part engages its style, as clicking a line of text in a box does.
function labelPart(p, covered, eng) {
  const engaged = covered.ids.has(p.id) && eng?.style.id === p.styleId ? ' is-engaged' : '';
  return `<tspan class="wire-text${engaged}" data-wire-text="${p.id}" style="${textCss(computedLook(p.id, p.look))}" fill="${p.look.color}">${esc(p.text)}</tspan>`;
}

// The lines this view draws between the boxes in `geo`, routed: each with its look, its points, and where
// its label sits. The chart draws these, and the exports draw them again (see export.js).
function chartLines(geo) {
  const lines = [];
  const hidden = hiddenHere();
  for (const [id, r] of Object.entries(records)) {
    if (!isRelation(r) || r.args.length !== 2 || hidden.has(id)) continue;
    const [from, to] = r.args.map(a => objectOf(a.at));
    if (from === to || !geo[from] || !geo[to]) continue;
    const look = lineLook(id);
    if (look.show) lines.push({ id, from, to, look });
  }
  route(lines, geo);
  return lines;
}

function wiresSvg(lines, sel, eng, covered) {
  return lines.map(l => {
    const d = pathD(l.points);
    const { look } = l;
    const selected = sel.relation === l.id ? ' is-selected' : '';
    const label = look.parts.length && l.label ? `<text class="wire-label" x="${l.label.x}" y="${l.label.y}" text-anchor="middle" dominant-baseline="middle">${look.parts.map(p => labelPart(p, covered, eng)).join(' ')}</text>` : '';
    return `<g class="wire${selected}" data-wire="${l.id}" tabindex="0" role="button" aria-label="${esc(relationTitle(l.id))}"><path class="wire-hit" d="${d}" data-wire="${l.id}" />
      <path class="wire-line" d="${d}" stroke="${look.stroke}" stroke-width="${look.strokeWidth}" stroke-dasharray="${DASH_ARRAYS[look.dash]}" stroke-linecap="${look.dash === 'dotted' ? 'round' : 'butt'}" />${label}</g>`;
  }).join('');
}

// Where the straight line between two boxes' centers leaves the first box.
function boxExit(g, toward) {
  const cx = g.x + g.w / 2, cy = g.y + g.h / 2;
  const dx = toward[0] - cx, dy = toward[1] - cy;
  const k = Math.min(dx ? (g.w / 2) / Math.abs(dx) : Infinity, dy ? (g.h / 2) / Math.abs(dy) : Infinity, 1);
  return [cx + dx * k, cy + dy * k];
}
const centerOf = g => [g.x + g.w / 2, g.y + g.h / 2];

// The provisional lines: one following the pointer from a handle, and the moving one between the two
// sides of a relation being added.
function overlaySvg(geo, sel) {
  if (chart.connect) {
    const c = chart.connect;
    const end = c.over && geo[c.over] ? boxExit(geo[c.over], [c.x0, c.y0]) : [c.x, c.y];
    return `<path class="connect-line" d="M${c.x0},${c.y0} L${end[0]},${end[1]}" /><circle class="relate-end" cx="${c.x0}" cy="${c.y0}" r="3.5" />`;
  }
  const r = sel.relate;
  if (!r?.b) return '';
  const a = geo[objectOf(r.a)], b = geo[objectOf(r.b)];
  if (!a || !b || a === b) return '';
  const p = boxExit(a, centerOf(b)), q = boxExit(b, centerOf(a));
  return `<path class="relate-line" d="M${p[0]},${p[1]} L${q[0]},${q[1]}" /><circle class="relate-end" cx="${p[0]}" cy="${p[1]}" r="4" /><circle class="relate-end" cx="${q[0]}" cy="${q[1]}" r="4" />`;
}

function quickMenuHtml() {
  const q = chart.quick;
  if (!q || q.kind) return '';
  const kinds = kindsInState().map(k => `<button class="menu-item" data-action="quick-kind" data-kind="${esc(k)}"><span class="menu-text">${esc(k)}</span></button>`).join('');
  return `<div class="quick" style="left:${q.x * chart.zoom}px;top:${q.y * chart.zoom}px"><div class="pop menu" role="menu">
    <div class="menu-head">New object here</div>${kinds}<div class="menu-sep"></div>
    <input class="input menu-input" data-quick-kind placeholder="New kind, like Trust" autocomplete="off" spellcheck="false"></div></div>`;
}

function lockBarHtml(sel) {
  const r = sel.relate;
  if (!r) return '';
  const name = id => esc(segmentText(objectOf(id)) + (objectOf(id) === id ? '' : ` › ${segmentText(id)}`));
  const text = r.b ? `Relating <strong>${name(r.a)}</strong> and <strong>${name(r.b)}</strong>. Add relations in the panel.`
    : `Choose what to relate <strong>${name(r.a)}</strong> to: click a box, or pick in the panel.`;
  return `<div class="lock-bar" role="status"><span class="lock-text">${text}</span>
    <button class="btn btn-sm${r.b ? ' btn-primary' : ''}" data-action="relate-done">${r.b ? 'Done' : 'Cancel'}</button></div>`;
}

// A question over the chart, such as whether to delete something or only hide it in this view.
function askHtml() {
  const a = chart.ask;
  if (!a) return '';
  const buttons = a.choices.map((c, i) => `<button class="btn btn-sm${c.primary ? ' btn-primary' : ''}" data-cmd="chart.ask" data-choice="${i}">${esc(c.label)}</button>`).join('');
  return `<div class="lock-bar is-ask" role="alertdialog"><span class="lock-text">${esc(a.text)}</span>${buttons}</div>`;
}

// ---- Along the bottom: the view tabs, the legend's switch, and the zoom ----

// The view tabs, like a workbook's sheet tabs: one per view, the current one raised, with a menu on it.
function viewTabsHtml() {
  const tabs = views.map(v => {
    const current = v.id === viewId;
    if (chart.renaming?.id === v.id)
      return `<span class="view-tab is-current" data-view-tab="${v.id}"><input class="view-tab-input" data-view-rename value="${esc(chart.renaming.text)}"
        size="${Math.max(6, chart.renaming.text.length + 1)}" aria-label="View name" spellcheck="false" autocomplete="off"></span>`;
    const chev = current ? `<button class="view-tab-chev" data-cmd="chart.view-menu" data-view="${v.id}" aria-haspopup="menu" aria-label="${esc(v.name)} options" title="Rename, duplicate or delete this view">${icon('chevron-down')}</button>` : '';
    const drop = chart.tabDrag?.moved && chart.tabDrag.over === v.id ? ` is-drop-${chart.tabDrag.side}` : '';
    return `<span class="view-tab${current ? ' is-current' : ''}${chart.tabDrag?.moved && chart.tabDrag.id === v.id ? ' is-dragging' : ''}${drop}" data-view-tab="${v.id}">
      <button class="view-tab-name" data-cmd="chart.view" data-view="${v.id}" role="tab" aria-selected="${current}"
        title="${current ? 'Double-click to rename; drag to reorder' : `Switch to ${esc(v.name)}`}">${esc(v.name)}</button>${chev}</span>`;
  }).join('');
  return `<div class="view-tabs" role="tablist" aria-label="Views">${tabs}
    <button class="view-more" data-cmd="chart.view-more" aria-haspopup="menu" hidden></button>
    <button class="icon-btn view-add" data-cmd="chart.view-add" aria-label="New view" title="New view, starting as a copy of this one">${icon('plus')}</button></div>`;
}

// Tabs that don't fit the bar fold, from the last, into a menu after the rest, as a workbook's do; the
// current tab always shows.
function drawCanvasBar() {
  const bar = document.getElementById('status');
  bar.innerHTML = canvasBarHtml();
  const strip = bar.querySelector('.view-tabs'), more = strip.querySelector('.view-more');
  const folded = [];
  for (const tab of [...strip.querySelectorAll('.view-tab:not(.is-current)')].reverse()) {
    if (strip.scrollWidth <= strip.clientWidth + 1) break;
    tab.hidden = true;
    folded.unshift(tab.dataset.viewTab);
    Object.assign(more, { hidden: false, innerHTML: `${folded.length} more${icon('chevron-down')}`, title: `${count(folded.length, 'more view')}` });
  }
  more.dataset.views = folded.join(' ');
}

function moreViewsMenu(anchor) {
  Shell.menu(anchor, anchor.dataset.views.split(' ').map(id => views.find(v => v.id === id)).filter(Boolean)
    .map(v => ({ label: v.name, run: () => switchToView(v.id) })), 'chart:views');
}

const legendShown = () => prefs.legend !== false;

function canvasBarHtml() {
  const legend = `<button class="bar-check" data-cmd="chart.legend" aria-pressed="${legendShown()}" title="Show or hide what the view’s looks mean">${box(legendShown() ? true : null)}Legend</button>`;
  const zoom = `<span class="zoom" role="group" aria-label="Zoom">
    <button class="icon-btn" data-cmd="chart.zoom" data-step="-1" aria-label="Zoom out" title="Zoom out">${icon('minus')}</button>
    <button class="zoom-pct" data-cmd="chart.zoom-menu" aria-haspopup="menu" title="Zoom">${Math.round(chart.zoom * 100)}%</button>
    <button class="icon-btn" data-cmd="chart.zoom" data-step="1" aria-label="Zoom in" title="Zoom in">${icon('plus')}</button></span>`;
  const fitButton = `<button class="bar-btn" data-cmd="chart.fit" title="Fit the chart to the screen (Shift+1)">Fit</button>`;
  return `${viewTabsHtml()}<div class="bar-end">${legend}<span class="bar-sep"></span>${zoom}${fitButton}</div>`;
}

// ---- The legend ----
// What the view's looks mean, read off its styles: for each style that shapes boxes, a row for each look
// it gives boxes drawn here (outputs that look alike share a row), then a row for each kind of line drawn,
// named by its relation. Text styles aren't listed, since text reads for itself; text a formula works out
// gets a row saying that italics mean computed. It's worded for a board as much as for its author: kinds
// need no heading, since an Entity's box says what it is, and a tag's looks read Yes and No, under no
// heading either (Good Standing: No). Rows are { head } (which starts a group, under no heading if it's
// empty) or { label, box | line | text, computed, n }, n being how many boxes or lines a row stands for.
// The sheet draws them under the drawing, the panel lists them, and the exports draw the same rows (see
// legendBlock in export.js).

function legendRows(geo = chart.geometry, lines = chartLines(geo)) {
  const drawn = Object.keys(geo).filter(id => records[id]);
  const reached = new Map();
  for (const obj of drawn) for (const id of panelOrder(obj)) pushTo(reached, `${formKeyOf(id)}|${outputKey(records[id])}`, obj);
  const rows = [];
  for (const style of styles) {
    if (isLineStyle(style) || isLineTextStyle(style)) continue;
    const { label } = describeStyle(style);
    const tag = !isKindStyle(style) && JSON.parse(style.form)[0] === 'tag';
    const looks = new Map();
    for (const [key, text] of styleOutputs(style)) {
      const props = pickProps(style.map[key] ?? {}, BOX_PROPS);
      const boxes = reached.get(`${style.form}|${key}`);
      if (!Object.keys(props).length || !boxes) continue;
      const look = { ...BOX_DEFAULTS, ...props };
      const l = looks.get(JSON.stringify(look)) ?? { box: look, labels: [], boxes: new Set() };
      l.labels.push(tag ? `${label}: ${key === 'true' ? 'Yes' : 'No'}` : text);
      for (const b of boxes) l.boxes.add(b);
      looks.set(JSON.stringify(look), l);
    }
    if (!looks.size) continue;
    rows.push({ head: isKindStyle(style) || tag ? '' : label });
    for (const l of looks.values()) rows.push({ box: l.box, label: l.labels.join(', '), n: l.boxes.size });
  }
  // A line's look is its line properties; relations of one name drawn alike share a row. Where one name
  // has rows for different outputs, each says its outputs; computed ones are set in italics.
  const kinds = new Map();
  for (const l of lines) {
    const line = pickProps(l.look, LINE_PROPS);
    const key = JSON.stringify([formKeyOf(l.id), line, isComputed(l.id)]);
    const k = kinds.get(key) ?? { line, form: formKeyOf(l.id), name: relationNameOf(l.id), outputs: new Set(), computed: isComputed(l.id), n: 0 };
    k.outputs.add(outputText(records[l.id]));
    k.n++;
    kinds.set(key, k);
  }
  if (kinds.size) {
    rows.push({ head: 'Lines' });
    const all = [...kinds.values()];
    const outputsOf = k => [...k.outputs].sort().join(', ');
    for (const k of all.sort((a, b) => a.computed - b.computed || byLabel(a.name, b.name))) {
      const split = all.some(o => o !== k && o.form === k.form && outputsOf(o) !== outputsOf(k));
      rows.push({ line: k.line, label: split ? `${k.name}: ${outputsOf(k)}` : k.name, computed: k.computed, n: k.n });
    }
  }
  const computedText = drawn.some(obj => boxLook(obj).lines.some(l => isComputed(l.id)))
    || lines.some(l => l.look.parts.some(p => isComputed(p.id)));
  if (computedText) rows.push({ text: true, label: 'Worked out by formula', computed: true });
  return rows;
}

// A sheet with no boxes says why, and how to add one: the chart has none yet, or this view shows none.
// It's over the middle of the canvas, at its own size, whatever the zoom.
function emptySheetHtml(shown) {
  if (shown || chart.quick) return '';
  const any = Object.values(records).some(isObject);
  const [title, desc, action] = !any ? ['No boxes yet', 'Double-click the sheet to add the first one, of any kind.', '']
    : viewFilter() ? [`${viewInUse().name} shows no boxes`, 'Its filter holds at none of them.', '<button class="btn btn-sm" data-action="filter-clear">Clear filter</button>']
    : [`${viewInUse().name} shows no boxes`, 'View › Show and Hidden say what it leaves out.', ''];
  return `<div class="sheet-empty"><div class="sheet-empty-title">${esc(title)}</div><div class="sheet-empty-desc">${esc(desc)}</div>${action}</div>`;
}

// Where the sheet's legend goes: under everything drawn, right-aligned with it.
function sheetLegend(geo, lines) {
  const gs = Object.entries(geo).filter(([id]) => records[id]).map(([, g]) => g);
  if (!legendShown() || !gs.length) return null;
  const bottom = Math.max(...gs.map(g => g.y + g.h), ...lines.flatMap(l => l.points.map(p => p[1])));
  return legendUnder(legendRows(geo, lines), { left: Math.min(...gs.map(g => g.x)), right: Math.max(...gs.map(g => g.x + g.w)), bottom: bottom + 40 });
}

// ---- The view, in the panel ----
// With nothing selected, the panel is about the view in use, as Figma's is about the page: its name and
// as-of date; what in it needs attention, each a link that selects it; its legend, readable at any zoom;
// what it shows, by kind of box, line and text, each ticked on or off; its filter; and last, the chart's
// records by kind, as the panel lists them.

// What needs attention among the boxes drawn: a required entry left blank (amber, something to do), and a
// filter or a formula that gives an error there (red). Each is { href, name, what, tone }.
function attentionItems(drawn = new Set(drawnObjects())) {
  const items = [];
  for (const id of drawn) {
    const labels = [...new Set(missingUnder(id).map(m => m.label))];
    if (labels.length) items.push({ href: id, name: objectName(id), what: `${joinList(labels)} blank`, tone: 'warn' });
  }
  for (const [id, e] of filterOutcome(viewFilter()).errors)
    if (drawn.has(id)) items.push({ href: id, name: objectName(id), what: `The filter gives ${e.code}`, tone: 'danger' });
  for (const e of formulaResult.errors ?? []) {
    const objs = (e.args ?? []).map(a => objectOf(a.at));
    if (!objs.length || !objs.every(o => drawn.has(o))) continue;
    items.push({ href: objs.length > 1 ? `definition:${e.def}` : objs[0], name: objs.map(objectName).join(' → '),
      what: `${definitionOf(e.def)?.name ?? 'A formula'} gives ${e.error.code}`, tone: 'danger' });
  }
  return items;
}

// A legend row's picture, on a scrap of paper, since the chart's colors are paper's.
const keySwatch = r => `<span class="vp-swatch"><svg viewBox="0 0 22 12" aria-hidden="true">${legendSwatch(r, 1, 1, 20, 10)}</svg></span>`;

function viewLegendHtml() {
  return legendRows().map((r, i) => 'head' in r ? (r.head ? `<div class="vp-sub">${esc(r.head)}</div>` : i ? '<div class="vp-gap"></div>' : '')
    : `<div class="vp-key">${keySwatch(r)}<span class="vp-key-label${r.computed ? ' is-computed' : ''}">${esc(r.label)}</span>${r.n ? `<span class="vp-count">${r.n}</span>` : ''}</div>`).join('');
}

// What the view draws, as View › Show lists it (see showable in styles.js): kinds as boxes, relations as
// lines, and the entries shown as text, with the rest of them a search away.
function viewShowsHtml() {
  const { boxes, lines, text } = showable();
  const check = it => {
    const { shown, total } = shownCount(it);
    const partly = shown && shown < total ? `<span class="vp-count">${shown} of ${total}</span>` : '';
    return `<button class="vp-check" role="checkbox" aria-checked="${shown === 0 ? 'false' : shown < total ? 'mixed' : 'true'}" data-action="show-form" data-key="${esc(it.key)}" data-on="${shown === 0}"
      title="${esc(it.where ?? `Boxes for ${it.label.toLowerCase()}`)}">${box(shown ? true : null)}<span class="vp-check-label">${esc(it.label)}</span>${partly}</button>`;
  };
  const group = (title, items) => items.length ? `<div class="vp-sub">${title}</div>${items.map(check).join('')}` : '';
  const shownText = text.filter(it => shownCount(it).shown);
  const more = text.length > shownText.length ? `<button class="link-btn vp-more" data-cmd="chart.show-text" aria-haspopup="menu">${shownText.length ? 'More text…' : 'Show text…'}</button>` : '';
  return group('Boxes', boxes) + group('Lines', lines.filter(x => !x.computed)) + group('Computed lines', lines.filter(x => x.computed))
    + (text.length ? `<div class="vp-sub">Text</div>${shownText.map(check).join('')}${more}` : '');
}

// Every entry this view could show as text, ticked where it does, found by what's typed.
function showTextMenu(anchor) {
  Shell.menu(anchor, query => {
    const items = showable().text.filter(it => !clean(query) || matchRank(`${it.label} ${it.where}`, query) > 0);
    return items.length ? items.map(it => {
      const on = shownCount(it).shown > 0;
      return { label: it.label, desc: it.where, ticked: on, run: () => { setShown(it, !on); render(); } };
    }) : [{ note: 'No entry is called that' }];
  }, 'chart:show-text', { search: 'Find an entry' });
}

function viewPanelHtml() {
  const v = viewInUse();
  const head = panelHead({ title: esc(v.name), sub: `View of ${esc(chartInUse().name)} · As of ${esc(Parts.date(todayIso()))}` });
  const section = (title, html) => html ? `<section class="vp-section"><h2 class="vp-head">${title}</h2>${html}</section>` : '';
  const attention = attentionItems().map(a => `<a class="vp-item" href="${esc(panelHref(a.href))}"><span class="vp-dot is-${a.tone}"></span>
    <span class="vp-item-name">${esc(a.name)}</span><span class="vp-item-what">${esc(a.what)}</span></a>`).join('');
  const f = viewFilter();
  const total = Object.values(records).filter(isObject).length;
  const filter = `<div class="vp-line">${f ? `<code class="vp-filter">${esc(Formulas.splitFormula(f).body.trim())}</code>` : '<span>Every box</span>'}
    <button class="link-btn" data-action="view-filter">${f ? 'Change' : 'Add a condition'}</button></div>
    ${f ? `<div class="vp-note">Shows ${drawnObjects().length} of ${count(total, 'box')}</div>` : ''}`;
  return head + `<div class="rows view-panel">${section('Needs attention', attention)}${section('Legend', viewLegendHtml())}
    ${section('Shows', viewShowsHtml())}${section('Filter', filter)}${section('Records', allView()[1])}</div>`;
}

function renderChart() {
  const sel = selection();
  const eng = currentEngaged();
  const covered = coveredBy(eng);
  const sides = sel.relate ? [sel.relate.a, sel.relate.b].filter(Boolean).map(objectOf) : [];
  const objects = drawnObjects();
  placeNewBoxes(objects);
  // Boxes come in reading order, row by row, so Tab goes through them that way. A box or line with the
  // focus keeps it as the chart is drawn again.
  objects.sort((a, b) => layout[a].y - layout[b].y || layout[a].x - layout[b].x);
  const focused = document.activeElement?.closest?.('#nodes [data-node], #wires [data-wire]');
  const refocus = focused && (focused.dataset.node ? `#nodes [data-node="${focused.dataset.node}"]` : `#wires g[data-wire="${focused.dataset.wire}"]`);
  const nodes = document.getElementById('nodes');
  nodes.innerHTML = objects.map(id => nodeHtml(id, placeOf(id), boxLook(id), {
    selected: sel.object === id && !chart.quick?.kind,
    side: sides.includes(id),
    target: chart.connect?.over === id,
    covered, engagedStyle: eng?.style.id,
  })).join('') + quickNodeHtml();
  document.getElementById('empty').innerHTML = emptySheetHtml(objects.length);
  // A triangle's text sits low enough for its widest line to clear the sloping sides. The text is at most
  // 60% as wide as the box, which takes a gap above it of one and a half times its height (with padding).
  for (const el of nodes.querySelectorAll('.node.shape-triangle')) {
    const text = el.querySelector('.node-text');
    el.style.paddingTop = `${Math.max(el.offsetWidth * 0.3, 1.5 * (text.offsetHeight + 12))}px`;
  }
  chart.geometry = {};
  for (const el of nodes.querySelectorAll('.node')) {
    const shape = [...el.classList].find(c => c.startsWith('shape-')).slice(6);
    chart.geometry[el.dataset.node] = { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight, shape };
  }
  const geo = chart.geometry;
  const lines = chartLines(geo);
  const legend = sheetLegend(geo, lines);
  const w = Math.max(960, ...Object.values(geo).map(g => g.x + g.w + 80), legend ? legend.x + legend.w + 80 : 0);
  const h = Math.max(720, ...Object.values(geo).map(g => g.y + g.h + 80), legend ? legend.y + legend.h + 60 : 0);
  const sheet = document.getElementById('sheet');
  Object.assign(sheet.style, { width: `${w}px`, height: `${h}px`, transform: `scale(${chart.zoom})` });
  sheet.classList.toggle('has-grid', prefs.grid !== false);
  Object.assign(document.getElementById('sizer').style, { width: `${w * chart.zoom}px`, height: `${h * chart.zoom}px` });
  for (const svg of sheet.querySelectorAll('svg.wires, svg.overlay')) svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  document.getElementById('wires').innerHTML = wiresSvg(lines, sel, eng, covered) + (legend ? legendG(legend) : '');
  document.getElementById('overlay').innerHTML = overlaySvg(geo, sel);
  document.getElementById('quick').innerHTML = quickMenuHtml();
  const stage = stageEl();
  stage.classList.toggle('is-locked', !!sel.relate?.b);
  document.body.classList.toggle('is-relating', !!sel.relate);
  stage.classList.toggle('is-picking', !!sel.relate && !sel.relate.b);
  stage.classList.toggle('is-connecting', !!chart.connect);
  document.getElementById('lock').innerHTML = lockBarHtml(sel) || askHtml();
  drawCanvasBar();
  if (refocus) document.querySelector(refocus)?.focus({ preventScroll: true });
  focusChartEditor();
}

// Puts the caret in the box being typed in: at the end, or around the whole text when it's just opened.
// A view tab being renamed starts with its whole name selected.
function focusChartEditor() {
  const tab = document.querySelector('[data-view-rename]');
  if (tab) {
    if (document.activeElement !== tab) tab.focus();
    if (chart.renaming?.select) { tab.select(); chart.renaming.select = false; }
    return;
  }
  const el = document.querySelector('[data-chart-edit], [data-quick-name]');
  if (!el || document.activeElement === el) return;
  el.focus();
  const range = document.createRange();
  range.selectNodeContents(el);
  if (!chart.editing?.selectAll) range.collapse(false);
  if (chart.editing) chart.editing.selectAll = false;
  const s = getSelection();
  s.removeAllRanges();
  s.addRange(range);
}

// ---- Changes made on the chart ----

// Says what a change did, in a toast: with Undo when it was an edit, in red when it couldn't be made.
const say = (text, opts = {}) => { if (text) Shell.toast(text, opts); };
const sayError = text => say(text, { tone: 'error' });

// What the panel says it just did, or why it couldn't, said the same way.
function announce() {
  const depth = undoStack.length;
  if (ui.notice) sayError(ui.notice);
  else if (ui.info) say(ui.info, { undo: depth > chart.undoDepth });
  ui.notice = ui.info = null;
  chart.undoDepth = depth;
}

// Starts typing over a field shown in a box. Its style is engaged while it's being typed in.
function startEditing(id, text) {
  const r = records[id];
  if (!r || !isField(r)) return;
  const style = styleOf(id);
  if (style) chart.engaged = { styleId: style.id, output: outputKey(r) };
  chart.editing = { id, text: text ?? displayValue(r), selectAll: text === undefined };
}

function commitEditing() {
  const ed = chart.editing;
  if (!ed) return;
  chart.editing = null;
  sayError(saveFieldValue(ed.id, ed.text));
  render();
}

function cancelEditing() {
  chart.editing = null;
  render();
}

// Live sync: as a field is typed over in its box, the panel shows the new text too.
function syncLive(id, text) {
  for (const el of document.querySelectorAll(`[data-live="${id}"]`)) el.textContent = text;
}

function commitQuick() {
  const q = chart.quick;
  const name = clean(q.name);
  if (!name) { chart.quick = null; return render(); }
  const { id, error } = createObject(q.kind, name, { x: snap(q.x - 100), y: snap(q.y - 25), w: 200 });
  chart.quick = null;
  sayError(error);
  if (id) go(id); else render();
}

// Deletes an object with everything that depends on it (its entries, the relations it's in, and what's
// recorded about those), into Deleted, where it can be restored with them.
function deleteObject(obj) {
  const name = objectName(obj);
  const error = deleteRecords([obj], name);
  if (error) return sayError(error);
  say(`Deleted ${name}`, { undo: true });
  location.hash = '';
}

// A relation as people would name it: by its form's name, or by its edges, and what it relates.
const relationTitle = id => `${relationNameOf(id)}: ${records[id].args.map(a => segmentText(objectOf(a.at))).join(' → ')}`;

function deleteRelation(id) {
  const label = relationTitle(id);
  const error = deleteRecords([id], label);
  if (error) return sayError(error);
  say(`Deleted ${label}`, { undo: true });
  location.hash = '';
}

// Hides a box or a line in this view only; the record stays, and the other views still show it.
function hideInView(id) {
  setHiddenInView([...hiddenInView(), id]);
  const label = isObject(records[id]) ? objectName(id) : relationTitle(id);
  say(`Hid ${label} in ${viewInUse().name}; View › Hidden shows it again`, { undo: true });
  location.hash = '';
}

// Ruling out a tag a formula implies is entered, and overrides the formula there (formulas.md).
function ruleOut(id) {
  const error = commit({ ...records, [id]: { ...records[id], tag: false } });
  if (error) return sayError(error);
  say(`Ruled out ${relationTitle(id)}, overriding the formula there`, { undo: true });
}

// Removing something from the chart asks whether to delete it, which takes it out of every view, or to
// hide it in this view only. A line a formula works out can't be deleted, since the formula would put it
// back; it can be hidden, or, for a tag, ruled out, which overrides the formula there.
function askRemove(sel) {
  const id = sel.object ?? sel.relation;
  const hide = { label: 'Hide in this view', run: () => hideInView(id) };
  const cancel = { label: 'Cancel' };
  const elsewhere = views.length > 1 ? ' It goes from every view, not just this one.' : '';
  if (sel.relation && isComputed(id)) {
    const def = definitionOf(records[id].computed);
    chart.ask = { text: `${relationTitle(id)} is worked out by ${def ? `the ${def.name} formula` : 'a formula'}, so it can’t be deleted.`,
      choices: [{ ...hide, primary: true }, ...(isTag(records[id]) ? [{ label: 'Rule it out', run: () => ruleOut(id) }] : []), cancel] };
  } else if (sel.relation) {
    chart.ask = { text: `Delete ${relationTitle(id)}, with what’s recorded at it?${elsewhere} It can be restored from Deleted.`,
      choices: [{ label: 'Delete', primary: true, run: () => deleteRelation(id) }, hide, cancel] };
  } else {
    const inside = recordsUnder(id).filter(k => !isComputed(k)).length - 1;
    const rels = new Set(recordsUnder(id).flatMap(k => relationsAt(k)).filter(k => !isComputed(k))).size;
    const what = [inside && count(inside, 'entry'), rels && count(rels, 'relation')].filter(Boolean).join(' and ');
    chart.ask = { text: `Delete ${objectName(id)}${what ? `, with its ${what}` : ''}?${elsewhere} It can be restored from Deleted.`,
      choices: [{ label: 'Delete', primary: true, run: () => deleteObject(id) }, hide, cancel] };
  }
}

function moveBox(id, x, y) {
  pushUndo();
  layout = { ...layout, [id]: { ...placeOf(id), x: Math.max(0, snap(x)), y: Math.max(0, snap(y)) } };
  saveState();
}

// ---- Zoom ----

const ZOOMS = [0.1, 0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
const ZOOM_MIN = ZOOMS[0], ZOOM_MAX = ZOOMS.at(-1);

// Zooms about a point of the stage (its middle, unless given), keeping what's under it in place.
function setZoom(z, anchor) {
  const stage = stageEl();
  const sizer = document.getElementById('sizer');
  const old = chart.zoom;
  chart.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100));
  const [ax, ay] = anchor ?? [stage.clientWidth / 2, stage.clientHeight / 2];
  const px = (stage.scrollLeft + ax - sizer.offsetLeft) / old, py = (stage.scrollTop + ay - sizer.offsetTop) / old;
  renderChart();
  stage.scrollLeft = px * chart.zoom + sizer.offsetLeft - ax;
  stage.scrollTop = py * chart.zoom + sizer.offsetTop - ay;
  keepViewport();
}

// The zoom and scroll are kept for the session, for each chart, so coming back to the page finds the chart
// as it was left. A chart not looked at yet shows whole, fitted to the screen, but no larger than life.
const VIEWPORT_KEY = 'rboreal.chart.viewport';
function keptViewports() {
  try { return JSON.parse(sessionStorage.getItem(VIEWPORT_KEY)) ?? {}; } catch { return {}; }
}
function keepViewport() {
  const stage = stageEl();
  const at = chart.presenting ?? { zoom: chart.zoom, left: stage.scrollLeft, top: stage.scrollTop };
  try { sessionStorage.setItem(VIEWPORT_KEY, JSON.stringify({ ...keptViewports(), [workbook.chartId]: at })); } catch {}
}
// A box opened from elsewhere (Open on chart, chart.html#<id>) is then brought into view, at a size it reads at.
function lookAtChart() {
  const stage = stageEl();
  const kept = keptViewports()[workbook.chartId];
  if (kept) {
    setZoom(kept.zoom);
    Object.assign(stage, { scrollLeft: kept.left, scrollTop: kept.top });
  } else fitToScreen(1);
  chart.looked = true;
  const { object } = selection();
  if (object) reveal(object, { readable: true });
}

// Brings a box into view, scrolling it to the middle of the stage unless most of it shows already;
// `readable` zooms in first, if need be, to a size its text can be read at.
const READABLE = 0.75;
function reveal(id, { readable = false } = {}) {
  const g = chart.geometry[id];
  if (!g) return;
  const stage = stageEl(), sizer = document.getElementById('sizer');
  if (readable && chart.zoom < READABLE) setZoom(READABLE);
  const z = chart.zoom;
  const box = { left: sizer.offsetLeft + g.x * z - stage.scrollLeft, top: sizer.offsetTop + g.y * z - stage.scrollTop, w: g.w * z, h: g.h * z };
  const shown = Math.max(0, Math.min(box.left + box.w, stage.clientWidth) - Math.max(box.left, 0)) * Math.max(0, Math.min(box.top + box.h, stage.clientHeight) - Math.max(box.top, 0));
  if (shown >= 0.6 * box.w * box.h) return;
  stage.scrollTo({ left: stage.scrollLeft + box.left + box.w / 2 - stage.clientWidth / 2, top: stage.scrollTop + box.top + box.h / 2 - stage.clientHeight / 2,
    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}
// A box selected from the panel or the palette is brought into view too.
window.addEventListener('hashchange', () => { const { object } = selection(); if (object) reveal(object); });
let keepTimer = 0;
document.addEventListener('scroll', e => {
  if (e.target.id === 'stage') { clearTimeout(keepTimer); keepTimer = setTimeout(keepViewport, 200); }
}, true);
window.addEventListener('pagehide', keepViewport);

// The next zoom along the steps, in (1) or out (-1).
const zoomStep = dir => dir > 0 ? ZOOMS.find(z => z > chart.zoom + 0.001) ?? ZOOM_MAX : ZOOMS.findLast(z => z < chart.zoom - 0.001) ?? ZOOM_MIN;

// Fits the whole sheet in the stage, centered, at no more than `most`.
function fitToScreen(most = ZOOM_MAX) {
  const stage = stageEl();
  const sheet = document.getElementById('sheet');
  const pad = chart.presenting ? 24 : 32;
  setZoom(Math.min(most, (stage.clientWidth - 2 * pad) / sheet.offsetWidth, (stage.clientHeight - 2 * pad) / sheet.offsetHeight));
  stage.scrollLeft = (stage.scrollWidth - stage.clientWidth) / 2;
  stage.scrollTop = (stage.scrollHeight - stage.clientHeight) / 2;
}

function zoomMenu(anchor) {
  const at = z => Math.abs(chart.zoom - z) < 0.005;
  Shell.menu(anchor, [
    { label: 'Fit to screen', hint: 'Shift+1', run: fit },
    { label: 'Zoom in', run: () => zoomTo(zoomStep(1)) },
    { label: 'Zoom out', run: () => zoomTo(zoomStep(-1)) },
    { sep: true },
    ...[0.5, 0.75, 1, 1.5, 2].map(z => ({ label: `${z * 100}%`, checked: at(z), run: () => zoomTo(z) })),
  ], 'chart:zoom');
}

// ---- Motion ----
// Switching views, Tidy layout, Fit and the zoom steps move the chart, and nothing moves without an
// animation the eye can follow: the sheet glides to its new place and size, each box glides to its new
// place and size on it (or fades in, new to the view), and the lines, which can't be followed cheaply,
// fade in once the boxes are nearly there. Only transforms and opacity animate, and nothing does where
// motion is reduced. The change runs first, drawing the chart where it ends up; the animations then
// start from where things were, once whatever the change set off has drawn.
const GLIDE = 240;
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
function glide(change) {
  if (reducedMotion()) return change();
  const origin = document.getElementById('sheet').getBoundingClientRect();
  const from = { left: origin.left, top: origin.top, zoom: chart.zoom, boxes: { ...chart.geometry } };
  change();
  queueMicrotask(() => glideFrom(from));
}
function glideFrom(from) {
  const sheet = document.getElementById('sheet');
  const timing = { duration: GLIDE, easing: getComputedStyle(document.documentElement).getPropertyValue('--ease').trim() || 'ease-out' };
  const now = sheet.getBoundingClientRect();
  const dx = from.left - now.left, dy = from.top - now.top;
  if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5 || Math.abs(from.zoom - chart.zoom) > 0.001)
    sheet.animate([{ transform: `translate(${dx}px, ${dy}px) scale(${from.zoom})` }, { transform: `scale(${chart.zoom})` }], timing);
  let moved = false;
  for (const el of document.querySelectorAll('#nodes .node')) {
    const was = from.boxes[el.dataset.node], g = chart.geometry[el.dataset.node];
    if (!g) continue;
    if (!was) { el.animate([{ opacity: 0 }, { opacity: 1 }], timing); moved = true; continue; }
    const mx = was.x + was.w / 2 - (g.x + g.w / 2), my = was.y + was.h / 2 - (g.y + g.h / 2);
    if (Math.abs(mx) < 0.5 && Math.abs(my) < 0.5 && Math.abs(was.w - g.w) < 1 && Math.abs(was.h - g.h) < 1) continue;
    el.animate([{ transform: `translate(${mx}px, ${my}px) scale(${was.w / g.w}, ${was.h / g.h})` }, { transform: 'none' }], timing);
    moved = true;
  }
  if (moved) document.getElementById('wires').animate([{ opacity: 0 }, { opacity: 0, offset: 0.6 }, { opacity: 1 }], { ...timing, duration: GLIDE + 120 });
}

const fit = () => glide(() => fitToScreen());
const zoomTo = z => glide(() => setZoom(z));
const switchToView = id => glide(() => { showView(id); render(); });

// Sheet coordinates of a pointer event.
function sheetPoint(e) {
  const rect = document.getElementById('sheet').getBoundingClientRect();
  return [(e.clientX - rect.left) / chart.zoom, (e.clientY - rect.top) / chart.zoom];
}

// The middle of what's visible of the sheet, for things inserted from the ribbon.
function visibleCenter() {
  const stage = stageEl();
  const sizer = document.getElementById('sizer');
  return [snap((stage.scrollLeft + stage.clientWidth / 2 - sizer.offsetLeft) / chart.zoom), snap((stage.scrollTop + stage.clientHeight / 2 - sizer.offsetTop) / chart.zoom)];
}

// ---- Views ----

// Switching views redraws everything; the selection stays, unless the new view hides it.
function showView(id) {
  switchView(id);
  chart.engaged = null;
  const sel = selection();
  const shownId = sel.object ?? sel.relation;
  if (shownId && hiddenHere().has(shownId)) location.hash = '';
}

// Lays the boxes this view shows out again, in rows by how far down the chains of ownership and control
// each one sits: owners and controllers above what they own and control. Each row keeps the order of the
// row above, and the rows are centered on the widest. Only this view's box positions change.
function tidyView() {
  const ids = drawnObjects();
  const shown = new Set(ids);
  const above = new Map(ids.map(id => [id, []]));
  for (const [rid, r] of Object.entries(records)) {
    if (!isRelation(r) || r.args.length !== 2 || !isTag(r) || r.tag !== true) continue;
    if (!['ownership', 'control'].includes(norm(relationNameOf(rid)))) continue;
    const [a, b] = r.args.map(x => objectOf(x.at));
    if (a !== b && shown.has(a) && shown.has(b)) above.get(b).push(a);
  }
  const depth = new Map(), visiting = new Set();
  const depthOf = id => {
    if (depth.has(id)) return depth.get(id);
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const d = Math.max(-1, ...above.get(id).map(depthOf)) + 1;
    visiting.delete(id);
    depth.set(id, d);
    return d;
  };
  ids.forEach(depthOf);
  const geo = chart.geometry;
  const rows = [];
  for (const id of ids) (rows[depth.get(id)] ??= []).push(id);
  const placed = new Map();
  const GAP = 40, ROW_GAP = 80;
  let y = 40;
  rows.forEach((row, i) => {
    const x0 = id => geo[id]?.x ?? 0;
    const pull = id => {
      const xs = above.get(id).filter(a => placed.has(a)).map(a => placed.get(a).x + placed.get(a).w / 2);
      return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : x0(id);
    };
    row.sort((a, b) => (i ? pull(a) - pull(b) : 0) || x0(a) - x0(b));
    let x = 0;
    for (const id of row) {
      const w = layout[id]?.w ?? geo[id]?.w ?? 200;
      placed.set(id, { x, y, w });
      x += w + GAP;
    }
    row.width = x - GAP;
    // The next row starts below this one's tallest box, as it's drawn now.
    y = snap(y + Math.max(...row.map(id => geo[id]?.h ?? 60)) + ROW_GAP);
  });
  const widest = Math.max(...rows.filter(Boolean).map(r => r.width));
  const next = { ...layout };
  for (const row of rows.filter(Boolean)) {
    const shift = 40 + (widest - row.width) / 2;
    for (const id of row) { const p = placed.get(id); next[id] = { ...(layout[id] ?? {}), x: snap(p.x + shift), y: p.y, w: p.w }; }
  }
  pushUndo();
  layout = next;
  saveState();
}

function tidyLayout() {
  glide(() => {
    tidyView();
    say(`Laid out the boxes ${viewInUse().name} shows`, { undo: true });
    render();
  });
}

function startRenaming(id) {
  const v = views.find(x => x.id === id);
  if (v) chart.renaming = { id, text: v.name, select: true };
}

function commitRenaming() {
  const r = chart.renaming;
  if (!r) return;
  chart.renaming = null;
  const v = views.find(x => x.id === r.id);
  if (v && clean(r.text) && clean(r.text) !== v.name) renameView(r.id, r.text);
  render();
}

function addViewHere() {
  addView(freeViewName(`${viewInUse().name} copy`));
  startRenaming(viewId);
  render();
}

function duplicateViewHere(id) {
  const v = views.find(x => x.id === id);
  duplicateView(id, freeViewName(`${v.name} copy`));
  startRenaming(viewId);
  render();
}

// Deleting a view takes effect at once; Undo brings it back.
function deleteViewHere(id) {
  const v = views.find(x => x.id === id);
  if (!v || views.length < 2) return;
  deleteView(id);
  chart.engaged = null;
  say(`Deleted the view ${v.name}`, { undo: true });
  render();
}

function viewMenu(anchor, id) {
  const v = views.find(x => x.id === id);
  if (!v) return;
  Shell.menu(anchor, [
    { head: v.name },
    { label: 'Rename', run: () => { if (id !== viewId) showView(id); startRenaming(id); render(); } },
    { label: 'Duplicate', run: () => duplicateViewHere(id) },
    { sep: true },
    { label: 'Delete', danger: true, disabled: views.length < 2, run: () => deleteViewHere(id) },
  ], `view:${id}`);
}

Object.assign(actions, {
  'quick-kind': d => { chart.quick = { ...chart.quick, kind: d.kind, name: '' }; },
  // The view's filter is written in the ribbon's menu for it, under View.
  'view-filter': () => { chart.tab = 'view'; ui.menu = 'rb:filter'; },
});
Shell.on('chart.show-text', el => showTextMenu(el));

Shell.on('chart.ask', el => {
  const choice = chart.ask?.choices[Number(el.dataset.choice)];
  chart.ask = null;
  choice?.run?.();
  render();
});
// A click that ends dragging a tab doesn't also switch to it.
Shell.on('chart.view', el => {
  if (chart.tabDrag?.done) { chart.tabDrag = null; return; }
  if (el.dataset.view !== viewId) switchToView(el.dataset.view);
});
Shell.on('chart.view-add', addViewHere);
Shell.on('chart.view-menu', el => viewMenu(el, el.dataset.view));
Shell.on('chart.view-more', el => moreViewsMenu(el));
Shell.on('chart.zoom', el => zoomTo(zoomStep(Number(el.dataset.step))));
Shell.on('chart.zoom-menu', el => zoomMenu(el));
Shell.on('chart.fit', fit);
Shell.on('chart.legend', toggleLegend);

function toggleLegend() {
  prefs.legend = !legendShown();
  savePrefs();
  render();
}

// ---- Pointer and keyboard ----

const stageEl = () => document.getElementById('stage');
// Whether the shell has something open over the page: the palette, a dialog or a menu.
const shellBusy = () => !!document.querySelector('#layer .palette, #layer .dialog, #layer .float-menu');

document.addEventListener('pointerdown', e => {
  if (!e.target.closest('#stage') || e.button !== 0 || chart.presenting) return;
  if (e.target.closest('.quick')) return;
  const sel = selection();
  const asked = chart.ask;
  chart.ask = null;
  const handle = e.target.closest('[data-handle]');
  const node = e.target.closest('[data-node]');
  const wire = e.target.closest('[data-wire]');
  if (chart.editing && e.target.closest('[data-chart-edit]')) return;
  if (chart.quick?.kind && node?.dataset.node === '__new') return;
  if (chart.editing) commitEditing();
  if (chart.quick) { chart.quick = null; renderChart(); }
  // While the other side of a relation is being picked, a click on a box picks it.
  if (sel.relate && !sel.relate.b) {
    if (node && node.dataset.node !== objectOf(sel.relate.a)) location.hash = `relate:${sel.relate.a}:${node.dataset.node}`;
    return;
  }
  if (sel.relate) return;
  if (handle) {
    e.preventDefault();
    const [x, y] = sheetPoint(e);
    const g = chart.geometry[handle.dataset.handle];
    const r = handle.getBoundingClientRect();
    const [hx, hy] = sheetPoint({ clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 });
    chart.connect = { from: handle.dataset.handle, x0: g ? hx : x, y0: g ? hy : y, x, y, over: null };
    return renderChart();
  }
  if (node) {
    const [x, y] = sheetPoint(e);
    const id = node.dataset.node;
    const line = e.target.closest('[data-line]')?.dataset.line;
    chart.move = { id, startX: x, startY: y, place: placeOf(id), x: 0, y: 0, moved: false, line };
    return;
  }
  if (wire) {
    // A click on a part of the label located at the relation engages that part's style; a click elsewhere
    // on an already selected line goes back to the style that follows the selection.
    const part = e.target.closest('[data-wire-text]')?.dataset.wireText;
    const style = part && part !== wire.dataset.wire && styleOf(part);
    if (style) chart.engaged = { styleId: style.id, output: outputKey(records[part]) };
    else if (sel.relation === wire.dataset.wire) chart.engaged = null;
    return go(wire.dataset.wire);
  }
  if (e.target.closest('#sheet')) go('');
  else if (asked) renderChart();
});

document.addEventListener('pointermove', e => {
  if (chart.move) {
    const m = chart.move;
    const [x, y] = sheetPoint(e);
    if (!m.moved && Math.hypot(x - m.startX, y - m.startY) < 4) return;
    m.moved = true;
    m.x = Math.max(0, snap(m.place.x + x - m.startX));
    m.y = Math.max(0, snap(m.place.y + y - m.startY));
    renderChart();
  } else if (chart.connect) {
    const c = chart.connect;
    [c.x, c.y] = sheetPoint(e);
    const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-node]')?.dataset.node;
    c.over = over && over !== c.from ? over : null;
    renderChart();
  }
});

document.addEventListener('pointerup', () => {
  if (chart.move) {
    const m = chart.move;
    chart.move = null;
    if (m.moved) {
      moveBox(m.id, m.x, m.y);
      return go(m.id);
    }
    // A click: select the box, and if it was on a line of text, engage that line's style. A click on an
    // already selected box, off its text, goes back to the style that follows the selection.
    const style = m.line && styleOf(m.line);
    if (style) chart.engaged = { styleId: style.id, output: outputKey(records[m.line]) };
    else if (selection().object === m.id) chart.engaged = null;
    go(m.id);
  } else if (chart.connect) {
    const c = chart.connect;
    chart.connect = null;
    if (c.over) location.hash = `relate:${c.from}:${c.over}`;
    else renderChart();
  }
});

document.addEventListener('dblclick', e => {
  if (!e.target.closest('#sheet') || selection().relate || chart.presenting) return;
  const line = e.target.closest('[data-line]');
  const node = e.target.closest('[data-node]');
  if (node?.dataset.node === '__new') return;
  if (line && isField(records[line.dataset.line])) {
    startEditing(line.dataset.line);
    return render();
  }
  if (node) {
    const nameId = nameRecordOf(node.dataset.node);
    if (nameId) { startEditing(nameId); render(); }
    return;
  }
  const [x, y] = sheetPoint(e);
  chart.quick = { x, y };
  renderChart();
  document.querySelector('.quick .menu-item')?.focus();
});

document.addEventListener('input', e => {
  if (e.target.matches('[data-chart-edit]') && chart.editing) {
    chart.editing.text = e.target.textContent;
    syncLive(chart.editing.id, e.target.textContent);
  } else if (e.target.matches('[data-quick-name]') && chart.quick) {
    chart.quick.name = e.target.textContent;
  }
});

document.addEventListener('focusout', e => {
  if (e.target.matches('[data-chart-edit]') && chart.editing && e.target.isConnected) commitEditing();
});

document.addEventListener('keydown', e => {
  const t = e.target;
  if (t.matches('[data-chart-edit]')) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitEditing(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancelEditing(); }
    return;
  }
  if (t.matches('[data-quick-name]')) {
    if (e.key === 'Enter') { e.preventDefault(); commitQuick(); }
    else if (e.key === 'Escape') { e.preventDefault(); chart.quick = null; renderChart(); }
    return;
  }
  if (t.matches('[data-quick-kind]')) {
    if (e.key === 'Enter' && clean(t.value)) { e.preventDefault(); chart.quick = { ...chart.quick, kind: clean(t.value), name: '' }; renderChart(); }
    else if (e.key === 'Escape') { chart.quick = null; renderChart(); }
    return;
  }
  // Keys the shell has taken (the palette, the shortcuts), and keys while it has something open, are its.
  if (e.defaultPrevented || shellBusy() || t.closest('input, textarea, select, [contenteditable="true"], [contenteditable="plaintext-only"]')) return;
  if (chart.presenting) return presentKey(e);
  // Shift+1 fits the chart to the screen, as in Figma.
  if (e.shiftKey && e.code === 'Digit1' && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); return fit(); }
  const sel = selection();
  if (e.key === 'Escape') {
    if (chart.quick) { chart.quick = null; return renderChart(); }
    if (sel.relate) { location.hash = sel.relate.a; return; }
  }
  if (e.key === 'Escape' && chart.ask) { chart.ask = null; return renderChart(); }
  // Tab goes through the boxes, then the lines; Enter or Space selects the one with the focus, as a click
  // would, and then the keys below work on it.
  const focused = t.closest?.('#nodes [data-node], #wires g[data-wire]');
  const focusedId = focused?.dataset.node ?? focused?.dataset.wire;
  if (focusedId && (e.key === 'Enter' || e.key === ' ') && focusedId !== (sel.object ?? sel.relation)) { e.preventDefault(); return go(focusedId); }
  if (!(sel.object || sel.relation) || e.ctrlKey || e.metaKey || e.altKey || ui.form || ui.menu) return;
  if ((e.key === 'Delete' || e.key === 'Backspace') && !t.closest('.panel, .ribbon, button, a')) {
    e.preventDefault();
    askRemove(sel);
    return render();
  }
  if (!sel.object) return;
  const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  if (arrows[e.key] && !t.closest('.panel')) {
    e.preventDefault();
    const g = chart.geometry[sel.object];
    const step = e.shiftKey ? 20 : GRID;
    moveBox(sel.object, g.x + arrows[e.key][0] * step, g.y + arrows[e.key][1] * step);
    return render();
  }
  // Typing over a selected box starts a new name, as typing over a spreadsheet cell does; F2 edits it. ?
  // and /, which no name starts with, stay the shell's: the shortcuts and the palette, on every page.
  const nameId = nameRecordOf(sel.object);
  if (!nameId || t.closest('.panel')) return;
  if (e.key === 'F2' || e.key === 'Enter') { e.preventDefault(); startEditing(nameId); return render(); }
  if (e.key.length === 1 && !' ?/'.includes(e.key)) { e.preventDefault(); startEditing(nameId, e.key); render(); }
});

document.addEventListener('wheel', e => {
  if (!(e.ctrlKey || e.metaKey) || !e.target.closest('#stage')) return;
  e.preventDefault();
  const rect = stageEl().getBoundingClientRect();
  setZoom(chart.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1), [e.clientX - rect.left, e.clientY - rect.top]);
}, { passive: false });

// ---- View tabs: renaming, the menu, and dragging to reorder ----

// A double-click on a tab renames it. (The first click has already switched to it.)
document.addEventListener('click', e => {
  const name = e.target.closest('.view-tab-name');
  if (!name || e.detail !== 2) return;
  startRenaming(name.dataset.view);
  render();
});

// A right-click on a tab opens its menu, as in a workbook.
document.addEventListener('contextmenu', e => {
  const tab = e.target.closest('[data-view-tab]');
  if (!tab) return;
  e.preventDefault();
  if (tab.dataset.viewTab !== viewId) switchToView(tab.dataset.viewTab);
  viewMenu(document.querySelector(`[data-view-tab="${tab.dataset.viewTab}"]`) ?? tab, tab.dataset.viewTab);
});

document.addEventListener('input', e => {
  if (e.target.matches('[data-view-rename]') && chart.renaming) {
    chart.renaming.text = e.target.value;
    e.target.size = Math.max(6, e.target.value.length + 1);
  }
});

document.addEventListener('keydown', e => {
  if (!e.target.matches('[data-view-rename]')) return;
  if (e.key === 'Enter') { e.preventDefault(); commitRenaming(); }
  else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); chart.renaming = null; render(); }
}, true);

document.addEventListener('focusout', e => {
  if (e.target.matches('[data-view-rename]') && chart.renaming && e.target.isConnected) commitRenaming();
});

// Dragging a tab along the row moves it; the tab it's over shows which side it will land on.
document.addEventListener('pointerdown', e => {
  const name = e.target.closest('.view-tab-name');
  if (!name || e.button !== 0) return;
  chart.tabDrag = { id: name.dataset.view, x0: e.clientX, moved: false };
});

document.addEventListener('pointermove', e => {
  const d = chart.tabDrag;
  if (!d || d.done) return;
  if (!d.moved && Math.abs(e.clientX - d.x0) < 6) return;
  d.moved = true;
  const tabs = [...document.querySelectorAll('[data-view-tab]')];
  const over = tabs.find(t => { const r = t.getBoundingClientRect(); return e.clientX >= r.left && e.clientX <= r.right; })
    ?? (e.clientX < tabs[0].getBoundingClientRect().left ? tabs[0] : tabs.at(-1));
  const r = over.getBoundingClientRect();
  const side = e.clientX < r.left + r.width / 2 ? 'before' : 'after';
  if (d.over !== over.dataset.viewTab || d.side !== side) {
    Object.assign(d, { over: over.dataset.viewTab, side });
    drawCanvasBar();
  }
});

document.addEventListener('pointerup', () => {
  const d = chart.tabDrag;
  if (!d) return;
  if (!d.moved) { chart.tabDrag = null; return; }
  // The click that follows the drag is ignored by chart.view, which clears this.
  d.done = true;
  const order = views.map(v => v.id).filter(id => id !== d.id);
  if (d.over && d.over !== d.id) {
    const at = order.indexOf(d.over) + (d.side === 'after' ? 1 : 0);
    moveView(d.id, at);
  }
  setTimeout(() => { if (chart.tabDrag === d) { chart.tabDrag = null; render(); } });
  render();
});

// The panel's width follows its left edge when dragged, and is remembered.
document.addEventListener('pointerdown', e => {
  const bar = e.target.closest('.resizer');
  if (!bar) return;
  e.preventDefault();
  bar.classList.add('is-active');
  const workspace = document.getElementById('workspace');
  const onMove = ev => {
    const w = Math.min(Math.max(280, workspace.getBoundingClientRect().right - ev.clientX), workspace.clientWidth - 420);
    workspace.style.setProperty('--panel-w', `${w}px`);
    prefs.panelWidth = w;
  };
  const onUp = () => {
    bar.classList.remove('is-active');
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    savePrefs();
  };
  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
});

// ---- Presenting ----
// Present hides everything but the chart (the sidebar, top bar, ribbon, panel and the bar along the
// bottom), full screen where the browser allows, and fits the chart to it. The arrow keys step through
// the views, each fitted, and Esc comes back to where things were: the view presenting started from, at
// its zoom and scroll. Full screen, the page keeps Esc for itself where the browser lets it, so one Esc
// does one thing: with the palette open, it closes the palette, and the next one ends the presentation.

function startPresenting() {
  if (chart.presenting) return;
  const stage = stageEl();
  chart.presenting = { view: viewId, zoom: chart.zoom, left: stage.scrollLeft, top: stage.scrollTop };
  Object.assign(chart, { editing: null, quick: null, ask: null, connect: null, move: null });
  document.documentElement.classList.add('is-presenting');
  document.documentElement.requestFullscreen?.().then(() => navigator.keyboard?.lock?.(['Escape'])).catch(() => {});
  render();
  fitToScreen();
  caption();
}

function stopPresenting() {
  const was = chart.presenting;
  if (!was) return;
  chart.presenting = null;
  document.documentElement.classList.remove('is-presenting');
  navigator.keyboard?.unlock?.();
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  document.getElementById('caption').innerHTML = '';
  showView(was.view);
  render();
  setZoom(was.zoom);
  Object.assign(stageEl(), { scrollLeft: was.left, scrollTop: was.top });
}

// The view's name, and how to move on, for a moment at the foot of the screen.
let captionTimer = 0;
function caption() {
  const el = document.getElementById('caption');
  const n = views.findIndex(v => v.id === viewId);
  el.innerHTML = `<span class="present-pill"><strong>${esc(viewInUse().name)}</strong>${views.length > 1 ? `<span>${n + 1} of ${views.length}</span><span>← → views</span>` : ''}<span>Esc to exit</span></span>`;
  el.classList.add('is-shown');
  clearTimeout(captionTimer);
  captionTimer = setTimeout(() => el.classList.remove('is-shown'), 2600);
}

function presentKey(e) {
  const step = { ArrowRight: 1, ArrowDown: 1, PageDown: 1, ' ': 1, ArrowLeft: -1, ArrowUp: -1, PageUp: -1 }[e.key];
  if (e.key === 'Escape') { e.preventDefault(); return stopPresenting(); }
  if (e.shiftKey && e.code === 'Digit1') { e.preventDefault(); return fit(); }
  if (!step || views.length < 2) return;
  e.preventDefault();
  const n = views.findIndex(v => v.id === viewId);
  glide(() => {
    showView(views[(n + step + views.length) % views.length].id);
    render();
    fitToScreen();
  });
  caption();
}

// Leaving full screen (by Esc, which the browser keeps for itself there) ends presenting too.
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && chart.presenting) stopPresenting(); });
// A window resized fits the chart again while presenting, and folds the view tabs again to fit.
window.addEventListener('resize', () => { if (chart.presenting) fitToScreen(); else drawCanvasBar(); });

// ---- The page ----

panelOptions.engaged = currentEngaged;

// Everything the chart page draws besides the shell, after each change.
function drawPage() {
  syncEngaged();
  const workspace = document.getElementById('workspace');
  if (prefs.panelWidth) workspace.style.setProperty('--panel-w', `${prefs.panelWidth}px`);
  workspace.classList.toggle('is-panel-hidden', prefs.panel === false);
  document.getElementById('panel').hidden = prefs.panel === false;
  renderRibbon();
  renderChart();
  // With nothing selected the panel is about the view, whose legend is read off the chart just drawn.
  if (readHash()) renderPanel();
  else document.getElementById('panel').innerHTML = viewPanelHtml();
  restoreFocus();
  announce();
  if (chart.fitPending) { chart.fitPending = false; lookAtChart(); }
}

// What the page adds to the palette: its actions, the views to switch to, and on the sample, Reset sample.
function chartCommands() {
  const sel = selection();
  const others = views.filter(v => v.id !== viewId).map(v => ({ title: `Switch to ${v.name}`, meta: 'View', keywords: 'view tab', run: () => switchToView(v.id) }));
  return [
    { title: 'Export…', meta: 'PDF, PowerPoint or SVG', keywords: 'export pdf powerpoint pptx svg download deck print', run: openExport },
    { title: 'Present', meta: 'Esc returns', keywords: 'present full screen slideshow', run: startPresenting },
    { title: 'Fit to screen', meta: 'Shift+1', keywords: 'zoom fit all', run: fit },
    { title: 'New view', keywords: 'view tab copy', run: addViewHere },
    { title: legendShown() ? 'Hide the legend' : 'Show the legend', keywords: 'legend key', run: toggleLegend },
    { title: 'Tidy layout', keywords: 'arrange layout rows', run: tidyLayout },
    ...others,
    { title: 'Rename this view', keywords: 'view tab', run: () => { startRenaming(viewId); render(); } },
    { title: 'Duplicate this view', keywords: 'view tab copy', run: () => duplicateViewHere(viewId) },
    { title: 'Zoom in', run: () => zoomTo(zoomStep(1)) },
    { title: 'Zoom out', run: () => zoomTo(zoomStep(-1)) },
    { title: 'Zoom to 100%', keywords: 'actual size', run: () => zoomTo(1) },
    { title: prefs.panel === false ? 'Show the record panel' : 'Hide the record panel', keywords: 'panel side', run: () => { prefs.panel = prefs.panel === false; savePrefs(); render(); } },
    { title: prefs.grid === false ? 'Show gridlines' : 'Hide gridlines', keywords: 'grid dots', run: () => { prefs.grid = prefs.grid === false; savePrefs(); render(); } },
    ...(sel.object ? [{ title: `Export a profile of ${objectName(sel.object)}`, meta: 'PDF', keywords: 'export profile pdf record', run: () => exportProfile(sel.object) }] : []),
    ...(isSampleChart() ? [{ title: 'Reset sample', meta: 'Undo brings your changes back', keywords: 'reset sample start over', run: resetSampleChart }] : []),
  ];
}

// Puts the sample chart back as it started, as one undoable step.
function resetSampleChart() {
  resetSample();
  Object.assign(chart, { engaged: null, editing: null, quick: null, ask: null, renaming: null, fitPending: true });
  history.replaceState(null, '', location.pathname + location.search);
  say('Put the sample back as it started', { undo: true });
  render();
}

Shell.on('chart.present', startPresenting);
Shell.on('chart.export', openExport);

// A switch to another chart, or another tab's change, lets go of what was held about this one.
Shell.onChartChange(() => {
  clearForms();
  Object.assign(chart, { engaged: null, editing: null, move: null, connect: null, quick: null, ask: null, renaming: null, filterDraft: null, fitPending: true });
  closeExport();
});

// The chart leads, so the page starts without the app's sidebar, and keeps its own choice of it. Undo and
// Redo sit in the top bar, as Office keeps them in its title bar; each can always try, since with nothing
// left in this page an undo takes back your latest change from the history, and a redo puts it back (see
// Shell.undoOrRedo).
Shell.start({
  area: 'chart',
  title: () => chartInUse().name,
  sidebar: false,
  actions: () => `<button class="btn btn-sm btn-ghost" data-action="undo" title="Undo (${undoKey})">Undo</button>
    <button class="btn btn-sm btn-ghost" data-action="redo" title="Redo (${redoKey})">Redo</button>
    <button class="btn btn-sm" data-cmd="chart.export" title="Export the chart as PDF, PowerPoint or SVG">Export…</button>
    <button class="btn btn-sm" data-cmd="chart.present" title="Show only the chart, full screen. Esc returns">Present</button>`,
  after: drawPage,
  commands: chartCommands,
  undo: false,
  keys: [['Double-click', 'Add a box, on the sheet'], ['F2', 'Rename the selected box, as typing over it does'], ['Tab', 'Go from box to box, then to the lines'],
    ['Enter', 'Select the box or line with the focus'], ['Arrow keys', 'Nudge the selected box'], ['Delete', 'Delete or hide what’s selected'],
    ['Shift+1', 'Fit the chart'], ['Esc', 'Leave Present, or stop relating']],
});
chart.undoDepth = undoStack.length;
lookAtChart();
