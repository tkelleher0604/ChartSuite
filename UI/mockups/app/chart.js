// The chart: a sheet with a box for each object and a line for each two-argument relation, drawn the way
// the styles say (styles.js). The record panel sits on the right. The location hash says what's selected,
// so clicking a box opens its object in the panel, and opening a record in the panel selects its box.

const chart = {
  zoom: 1,
  engaged: null,   // { styleId, output }: the style picked to format, if one was picked; see currentEngaged
  editing: null,   // { id, text }: a field whose text is being typed over in its box
  move: null,      // { id, startX, startY, place, x, y, moved, line }: a box being pressed or dragged
  connect: null,   // { from, x0, y0, x, y, over }: a relation being drawn from a box's handle
  quick: null,     // { x, y, kind, name }: the new-object menu, then the new box being named
  geometry: {},    // each box as last drawn: { x, y, w, h, shape }
  notice: null,    // { text, error }: a message in the status bar
  selectionKey: '',
  tab: 'home',
};

const GRID = 5;
const snap = v => Math.round(v / GRID) * GRID;

// ---- Selection ----

// What the hash selects: a box (an object, or a record in one), a relation's line, or the two sides of a
// relation being added.
function selection() {
  const view = currentView();
  if (view.relate) return { relate: view.relate };
  if (!view.id) return {};
  if (isRelation(records[view.id])) return { relation: view.id, record: view.id };
  return { object: objectOf(view.id), record: view.id };
}

// Moves the selection, re-rendering even when the hash doesn't change.
function go(hash) {
  if (decodeURIComponent(location.hash.slice(1)) === hash) render();
  else location.hash = hash;
}

// ---- The engaged style ----

// The engaged style is the one the ribbon's formatting controls edit, and that the panel and chart point
// out. It's the one picked, if any; otherwise it follows the selection: a selected record's own style, or
// the last style to set the look of the selected box, or the selected line's style.
function currentEngaged() {
  const s = chart.engaged && styleById(chart.engaged.styleId);
  if (s) return { style: s, output: chart.engaged.output };
  return defaultEngaged();
}

function defaultEngaged() {
  const sel = selection();
  if (sel.relation) {
    const s = styleOf(sel.relation);
    return s ? { style: s, output: outputKey(records[sel.relation]) } : null;
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

// The output through which a style applies to the selection, if it does.
function selectionOutput(style) {
  const sel = selection();
  if (sel.relation) return style.param === parameterization(records, sel.relation) ? outputKey(records[sel.relation]) : undefined;
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
  return { ids, objects: new Set([...ids].filter(id => !isRelation(records[id])).map(objectOf)) };
}

// ---- Drawing ----

// Objects with no position yet (made in the record panel, say) line up below everything else.
function autoPlaces() {
  const placed = Object.keys(layout).filter(id => records[id]);
  const bottom = Math.max(0, ...placed.map(id => layout[id].y + (chart.geometry[id]?.h ?? 60)));
  const unplaced = Object.keys(records).filter(id => isObject(records[id]) && !layout[id]);
  return Object.fromEntries(unplaced.map((id, i) => [id, { x: 40 + (i % 5) * 230, y: bottom + 70 + Math.floor(i / 5) * 110, w: 200 }]));
}

function placeOf(id, auto) {
  const place = { w: 200, ...(layout[id] ?? auto[id]) };
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
  return `<div class="${cls}" data-node="${id}" style="${vars}">${shape}<div class="node-text">${text}</div>${handles}</div>`;
}

function lineHtml(l, state) {
  const editing = chart.editing?.id === l.id;
  const engaged = state.covered.ids.has(l.id) && state.engagedStyle === l.styleId;
  const cls = `node-line${editing ? ' is-editing' : ''}${engaged ? ' is-engaged' : ''}`;
  const attrs = editing ? ' contenteditable="plaintext-only" spellcheck="false" data-chart-edit' : isField(records[l.id]) ? ' title="Double-click to edit"' : '';
  return `<div class="${cls}" data-line="${l.id}" data-style="${l.styleId}"${attrs} style="${textCss(l.look)}">${esc(editing ? chart.editing.text : l.text)}</div>`;
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

// Lays out each line. One that goes down (or up) leaves its source's bottom (or top) middle, turns along a
// lane just past the source, and drops onto the target, where lines arrive spread across its top (all
// at the apex, for a triangle). Sources side by side get lanes a step apart, so their lanes don't overlap.
// Boxes level with each other are joined side to side.
function route(lines, geo) {
  for (const l of lines) {
    const s = geo[l.from], t = geo[l.to];
    l.dir = t.y >= s.y + s.h + 16 ? 'down' : s.y >= t.y + t.h + 16 ? 'up' : 'side';
  }
  const groupBy = (list, key) => list.reduce((m, l) => m.set(key(l), [...(m.get(key(l)) ?? []), l]), new Map());
  const vertical = lines.filter(l => l.dir !== 'side');
  for (const ls of groupBy(vertical, l => `${l.to}|${l.dir}`).values()) {
    const t = geo[ls[0].to];
    ls.sort((p, q) => (geo[p.from].x + geo[p.from].w / 2) - (geo[q.from].x + geo[q.from].w / 2));
    ls.forEach((l, i) => { l.tx = t.shape === 'triangle' && l.dir === 'down' ? t.x + t.w / 2 : t.x + t.w * (i + 1) / (ls.length + 1); });
  }
  const sources = [...groupBy(vertical, l => `${l.from}|${l.dir}`).values()];
  for (const ls of sources) {
    const s = geo[ls[0].from], dir = ls[0].dir;
    const edge = dir === 'down' ? s.y + s.h : s.y;
    const near = sources.filter(o => o[0].dir === dir && Math.abs((dir === 'down' ? geo[o[0].from].y + geo[o[0].from].h : geo[o[0].from].y) - edge) < 40)
      .map(o => geo[o[0].from].x).sort((a, b) => a - b);
    const j = near.indexOf(s.x);
    const sx = s.x + s.w / 2;
    if (dir === 'down') {
      const limit = Math.min(...ls.map(l => geo[l.to].y)) - 14;
      const lane = Math.max(edge + 8, Math.min(edge + 18 + 10 * j, limit));
      for (const l of ls) l.points = [[sx, edge], [sx, lane], [l.tx, lane], [l.tx, geo[l.to].y]];
    } else {
      const limit = Math.max(...ls.map(l => geo[l.to].y + geo[l.to].h)) + 14;
      const lane = Math.min(edge - 8, Math.max(edge - 18 - 10 * j, limit));
      for (const l of ls) l.points = [[sx, edge], [sx, lane], [l.tx, lane], [l.tx, geo[l.to].y + geo[l.to].h]];
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
    l.label = labelSpot(l);
  }
}

// A label sits on the last leg if there's room, centered on it; otherwise on the longest leg.
function labelSpot(l) {
  const ps = l.points;
  const legs = ps.slice(1).map((p, i) => ({ a: ps[i], b: p, len: Math.hypot(p[0] - ps[i][0], p[1] - ps[i][1]) }));
  const last = legs.at(-1);
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

function wiresSvg(geo, sel, eng) {
  const lines = [];
  for (const [id, r] of Object.entries(records)) {
    if (!isRelation(r) || r.args.length !== 2) continue;
    const [from, to] = r.args.map(a => objectOf(a.at));
    if (from === to || !geo[from] || !geo[to]) continue;
    const look = lineLook(id);
    if (look.show) lines.push({ id, from, to, look });
  }
  route(lines, geo);
  return lines.map(l => {
    const d = pathD(l.points);
    const { look } = l;
    const selected = sel.relation === l.id ? ' is-selected' : '';
    const label = look.label ? `<text class="wire-label" x="${l.label.x}" y="${l.label.y}" text-anchor="middle" dominant-baseline="middle" style="${textCss(look)}" fill="${look.color}">${esc(look.label)}</text>` : '';
    return `<g class="wire${selected}" data-wire="${l.id}"><path class="wire-hit" d="${d}" data-wire="${l.id}" />
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
  return `<div class="lock-bar" role="status">${icon('link')}<span class="lock-text">${text}</span>
    <button class="btn${r.b ? ' btn-primary' : ''}" data-action="relate-done">${r.b ? 'Done' : 'Cancel'}</button></div>`;
}

function statusHtml() {
  const n = chart.notice ?? (ui.notice ? { text: ui.notice, error: true } : null);
  return `<span class="zoom"><button class="icon-btn" data-action="zoom" data-step="-1" aria-label="Zoom out" title="Zoom out">${icon('minus')}</button>
    <button class="zoom-pct" data-action="zoom-reset" title="Zoom to 100%">${Math.round(chart.zoom * 100)}%</button>
    <button class="icon-btn" data-action="zoom" data-step="1" aria-label="Zoom in" title="Zoom in">${icon('plus')}</button></span>
    ${n ? `<span class="notice${n.error ? ' is-error' : ''}">${esc(n.text)}</span>` : ''}`;
}

function renderChart() {
  const sel = selection();
  const eng = currentEngaged();
  const covered = coveredBy(eng);
  const sides = sel.relate ? [sel.relate.a, sel.relate.b].filter(Boolean).map(objectOf) : [];
  const auto = autoPlaces();
  const objects = Object.keys(records).filter(id => isObject(records[id]));
  const nodes = document.getElementById('nodes');
  nodes.innerHTML = objects.map(id => nodeHtml(id, placeOf(id, auto), boxLook(id), {
    selected: sel.object === id && !chart.quick?.kind,
    side: sides.includes(id),
    target: chart.connect?.over === id,
    covered, engagedStyle: eng?.style.id,
  })).join('') + quickNodeHtml();
  chart.geometry = {};
  for (const el of nodes.querySelectorAll('.node')) {
    const shape = [...el.classList].find(c => c.startsWith('shape-')).slice(6);
    chart.geometry[el.dataset.node] = { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight, shape };
  }
  const geo = chart.geometry;
  const w = Math.max(1180, ...Object.values(geo).map(g => g.x + g.w + 80));
  const h = Math.max(780, ...Object.values(geo).map(g => g.y + g.h + 80));
  const sheet = document.getElementById('sheet');
  Object.assign(sheet.style, { width: `${w}px`, height: `${h}px`, transform: `scale(${chart.zoom})` });
  sheet.classList.toggle('has-grid', prefs.grid !== false);
  Object.assign(document.getElementById('sizer').style, { width: `${w * chart.zoom}px`, height: `${h * chart.zoom}px` });
  for (const svg of sheet.querySelectorAll('svg.wires, svg.overlay')) svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  document.getElementById('wires').innerHTML = wiresSvg(geo, sel, eng);
  document.getElementById('overlay').innerHTML = overlaySvg(geo, sel);
  document.getElementById('quick').innerHTML = quickMenuHtml();
  const stage = document.getElementById('stage');
  stage.classList.toggle('is-locked', !!sel.relate?.b);
  document.body.classList.toggle('is-relating', !!sel.relate);
  stage.classList.toggle('is-picking', !!sel.relate && !sel.relate.b);
  stage.classList.toggle('is-connecting', !!chart.connect);
  document.getElementById('lock').innerHTML = lockBarHtml(sel);
  document.getElementById('status').innerHTML = statusHtml();
  focusChartEditor();
}

// Puts the caret in the box being typed in: at the end, or around the whole text when it's just opened.
function focusChartEditor() {
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

function setNotice(text, error = false) { chart.notice = text ? { text, error } : null; }

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
  const error = saveFieldValue(ed.id, ed.text);
  setNotice(error, true);
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
  setNotice(error, true);
  if (id) go(id); else render();
}

// Deletes an object along with everything recorded about it: its entries, the relations it's in, and
// anything recorded about those relations.
function deleteObject(obj) {
  const doomed = new Set(recordsUnder(obj));
  for (let grew = true; grew;) {
    grew = false;
    for (const [k, r] of Object.entries(records))
      if (!doomed.has(k) && argsOf(r).some(a => doomed.has(a.at))) { doomed.add(k); grew = true; }
  }
  const error = commit(Object.fromEntries(Object.entries(records).filter(([k]) => !doomed.has(k))));
  if (error) return setNotice(error, true);
  const { [obj]: _, ...rest } = layout;
  layout = rest;
  saveState();
  location.hash = '';
}

function confirmDelete(obj) {
  const inside = recordsUnder(obj).length - 1;
  const rels = new Set(recordsUnder(obj).flatMap(id => relationsAt(id))).size;
  const what = [inside && count(inside, 'entry'), rels && count(rels, 'relation')].filter(Boolean).join(' and ');
  ui.pending = { message: `Delete ${objectName(obj)}${what ? `, with its ${what}` : ''}?`, yes: 'Delete', apply: () => deleteObject(obj) };
}

function moveBox(id, x, y) {
  const auto = autoPlaces();
  pushUndo();
  layout = { ...layout, [id]: { ...placeOf(id, auto), x: Math.max(0, snap(x)), y: Math.max(0, snap(y)) } };
  saveState();
}

function setZoom(z, anchor) {
  const stage = document.getElementById('stage');
  const old = chart.zoom;
  chart.zoom = Math.min(2, Math.max(0.3, Math.round(z * 100) / 100));
  const [ax, ay] = anchor ?? [stage.clientWidth / 2, stage.clientHeight / 2];
  const sx = (stage.scrollLeft + ax) / old, sy = (stage.scrollTop + ay) / old;
  renderChart();
  stage.scrollLeft = sx * chart.zoom - ax;
  stage.scrollTop = sy * chart.zoom - ay;
}

// Sheet coordinates of a pointer event.
function sheetPoint(e) {
  const rect = document.getElementById('sheet').getBoundingClientRect();
  return [(e.clientX - rect.left) / chart.zoom, (e.clientY - rect.top) / chart.zoom];
}

// The middle of what's visible of the sheet, for things inserted from the ribbon.
function visibleCenter() {
  const stage = document.getElementById('stage');
  const sizer = document.getElementById('sizer');
  return [snap((stage.scrollLeft + stage.clientWidth / 2 - sizer.offsetLeft) / chart.zoom), snap((stage.scrollTop + stage.clientHeight / 2 - sizer.offsetTop) / chart.zoom)];
}

Object.assign(actions, {
  zoom: d => setZoom(chart.zoom + Number(d.step) * 0.1),
  'zoom-reset': () => setZoom(1),
  'quick-kind': d => { chart.quick = { ...chart.quick, kind: d.kind, name: '' }; },
});

// ---- Pointer and keyboard ----

const stageEl = () => document.getElementById('stage');

document.addEventListener('pointerdown', e => {
  if (!e.target.closest('#stage') || e.button !== 0) return;
  if (e.target.closest('.lock-bar, .status, .quick')) return;
  const sel = selection();
  setNotice(null);
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
    chart.move = { id, startX: x, startY: y, place: placeOf(id, autoPlaces()), x: 0, y: 0, moved: false, line };
    return;
  }
  if (wire) return go(wire.dataset.wire);
  if (e.target.closest('#sheet')) go('');
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
      return render();
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
  if (!e.target.closest('#sheet') || selection().relate) return;
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
  if (t.closest('input, textarea, [contenteditable="true"], [contenteditable="plaintext-only"]')) return;
  const sel = selection();
  if (e.key === 'Escape') {
    if (chart.quick) { chart.quick = null; return renderChart(); }
    if (sel.relate) { location.hash = sel.relate.a; return; }
  }
  if (!sel.object || e.ctrlKey || e.metaKey || e.altKey || ui.form || ui.menu) return;
  if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    if (sel.record !== sel.object) location.hash = sel.object;
    confirmDelete(sel.object);
    return render();
  }
  const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  if (arrows[e.key] && !t.closest('.panel')) {
    e.preventDefault();
    const g = chart.geometry[sel.object];
    const step = e.shiftKey ? 20 : GRID;
    moveBox(sel.object, g.x + arrows[e.key][0] * step, g.y + arrows[e.key][1] * step);
    return render();
  }
  // Typing over a selected box starts a new name, as typing over a spreadsheet cell does; F2 edits it.
  const nameId = nameRecordOf(sel.object);
  if (!nameId || t.closest('.panel')) return;
  if (e.key === 'F2' || e.key === 'Enter') { e.preventDefault(); startEditing(nameId); return render(); }
  if (e.key.length === 1 && e.key !== ' ') { e.preventDefault(); startEditing(nameId, e.key); render(); }
});

document.addEventListener('wheel', e => {
  if (!(e.ctrlKey || e.metaKey) || !e.target.closest('#stage')) return;
  e.preventDefault();
  const rect = stageEl().getBoundingClientRect();
  setZoom(chart.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1), [e.clientX - rect.left, e.clientY - rect.top]);
}, { passive: false });

// The panel's width follows its left edge when dragged, and is remembered.
document.addEventListener('pointerdown', e => {
  const bar = e.target.closest('.resizer');
  if (!bar) return;
  e.preventDefault();
  bar.classList.add('is-active');
  const workspace = document.querySelector('.workspace');
  const onMove = ev => {
    const w = Math.min(Math.max(320, workspace.getBoundingClientRect().right - ev.clientX), workspace.clientWidth - 360);
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

// On opening, a sheet wider than the stage is zoomed out to fit its width, down to 60%.
function fitWidth() {
  const stage = document.getElementById('stage');
  const sheet = document.getElementById('sheet');
  const z = Math.floor((stage.clientWidth - 56) / sheet.offsetWidth * 20) / 20;
  if (z < 1) setZoom(Math.max(0.6, z), [0, 0]);
}
