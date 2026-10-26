// Layout (dendra.md, Views): where the boxes go that nobody has placed, and the routes of the lines.
// ELK's layered algorithm places the boxes in rows ranked by the lines, each line's Above side on top, with
// frames as clusters; entered positions win, and a box placed among them goes beside its relatives, clear
// of boxes and of lines it isn't on. The trunk router, Dendra's own, routes the lines as structure charts
// draw them: a box's lines of one look leave it on one trunk and fan out along a lane, and arrive spread
// across the top of what they reach. Pure: it reads geometry and gives geometry.
const Layout = (() => {

// ---- ELK, in this thread ----
// elk.bundled.js runs ELK behind a stand-in worker whose dispatcher lays a graph out the moment it's handed
// one; the promise is only the worker's envelope. Calling the dispatcher keeps the scene synchronous.
let elk = null, ready = false;
function run(graph) {
  elk ??= new ELK();
  const d = elk.worker?.worker?.dispatcher;
  if (!d) throw new Error('elk.bundled.js has no stand-in worker to lay out with.');
  if (!ready) { d.dispatch({ data: { id: -1, cmd: 'register', algorithms: ['layered'] } }); ready = true; }
  d.dispatch({ data: { id: -1, cmd: 'layout', graph, layoutOptions: {}, options: {} } });
  return graph;
}

const OPTIONS = {
  'elk.algorithm': 'layered',
  'elk.direction': 'DOWN',
  'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
  'elk.spacing.nodeNode': '24',
  'elk.layered.spacing.nodeNodeBetweenLayers': '64',
  'elk.spacing.componentComponent': '36',
  'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
  'elk.edgeRouting': 'ORTHOGONAL',
};

// Distances, in pixels: lanes at least 12 pt apart; a lane passing over a triangle's apex, or a junction,
// at least 16 pt clear of it; a line's last leg at least this long where it carries no label.
const LANE = 16, CLEAR = 21, STEM = 14;

// Positions for every box, top left at 0, 0: { id → { x, y } }. Laid out again only when what it reads
// changes: the boxes and their sizes, the lines that rank them, and the frames.
const cache = new Map();
function place({ boxes, links, clusters }) {
  const k = JSON.stringify([OPTIONS, boxes.map(b => [b.id, Math.round(b.w), Math.round(b.h)]), links.map(l => [l.from, l.to]), clusters.map(c => [c.id, c.parent, c.members, c.top])]);
  if (cache.has(k)) { const v = cache.get(k); cache.delete(k); cache.set(k, v); return v; }
  const started = now();
  const root = { id: '·root', layoutOptions: OPTIONS, children: [], edges: [] }, node = new Map([[null, root]]);
  for (const c of clusters) node.set(c.id, { id: c.id, children: [], layoutOptions: { 'elk.padding': `[top=${c.top},left=10,bottom=10,right=10]` } });
  for (const c of clusters) node.get(c.parent ?? null).children.push(node.get(c.id));
  const home = new Map(clusters.flatMap(c => c.members.map(m => [m, c.id])));
  const ids = new Set(boxes.map(b => b.id));
  for (const b of boxes) node.get(home.get(b.id) ?? null).children.push({ id: b.id, width: b.w, height: b.h });
  const seen = new Set();
  links.forEach((l, i) => {
    const e = `${l.from}>${l.to}`;
    if (!ids.has(l.from) || !ids.has(l.to) || seen.has(e)) return;
    seen.add(e);
    root.edges.push({ id: `·e${i}`, sources: [l.from], targets: [l.to] });
  });
  run(root);
  const out = new Map();
  const walk = (n, ox, oy) => {
    for (const c of n.children ?? []) {
      const x = ox + (c.x ?? 0), y = oy + (c.y ?? 0);
      if (ids.has(c.id)) out.set(c.id, { x, y });
      walk(c, x, y);
    }
  };
  walk(root, 0, 0);
  out.ms = now() - started;
  cache.set(k, out);
  if (cache.size > 24) cache.delete(cache.keys().next().value);
  return out;
}
const now = () => (typeof performance === 'object' ? performance.now() : Date.now());

// Every box's position. Entered ones stand. With none entered, ELK's layout sits in the middle of the page,
// below any shapes across its top (a title). With some, each other box goes beside its relatives: in the
// row of the boxes that share them (a new owner among the owners of what it owns), or between rows, at the
// nearest place that's clear of every box, shape and line it isn't on.
// boxes: [{ id, w, h, shape }]; links: the ranking lines { from, to }; lines: every line { id, from, to,
// trunk, straight }, to route among the boxes already placed; obstacles: free shapes' rects.
function arrange({ boxes, links, clusters, entered, page, lines = [], obstacles = [] }) {
  const out = new Map();
  for (const b of boxes) if (entered.has(b.id)) { const p = entered.get(b.id); out.set(b.id, { x: p.x, y: p.y }); }
  const rest = boxes.filter(b => !entered.has(b.id));
  if (!rest.length) return out;
  const at = place({ boxes, links, clusters }), size = new Map(boxes.map(b => [b.id, b]));
  if (!out.size) {
    const r = Math.max(...boxes.map(b => at.get(b.id).x + b.w)), d = Math.max(...boxes.map(b => at.get(b.id).y + b.h));
    const band = Math.max(0, ...obstacles.filter(o => o.y < page.h / 3).map(o => o.y + o.h + 24));
    const m = page.margin, dx = Math.max(m, (page.w - r) / 2), dy = Math.max(m, band, (page.h - d) / 2);
    for (const b of boxes) out.set(b.id, { x: at.get(b.id).x + dx, y: at.get(b.id).y + dy });
    return out;
  }
  const known = [...out.keys()];
  const shift = ids => [0, 1].map(k => ids.reduce((s, id) => s + (k ? out.get(id).y - at.get(id).y : out.get(id).x - at.get(id).x), 0) / ids.length);
  const all = shift(known);
  const geo = new Map(known.map(id => [id, { id, ...out.get(id), w: size.get(id).w, h: size.get(id).h, shape: size.get(id).shape }]));
  // The lines already routed among what's placed, which a new box mustn't sit on.
  const routed = lines.filter(l => geo.has(l.from) && geo.has(l.to) && l.from !== l.to).map(l => ({ id: l.id, from: l.from, to: l.to, trunk: l.trunk, straight: l.straight }));
  route(geo, routed, { labels: false });
  const segs = routed.flatMap(l => (l.points ?? []).slice(1).map((p, i) => [l.points[i], p]));
  const meets = (r, [a, b], pad) => Math.max(a[0], b[0]) >= r.x - pad && Math.min(a[0], b[0]) <= r.x + r.w + pad && Math.max(a[1], b[1]) >= r.y - pad && Math.min(a[1], b[1]) <= r.y + r.h + pad;
  const apart = (p, q, gx, gy) => p.x >= q.x + q.w + gx || p.x + p.w + gx <= q.x || p.y >= q.y + q.h + gy || p.y + p.h + gy <= q.y;
  const clear = p => p.x >= page.margin / 2 && p.y >= page.margin / 2 && [...geo.values()].every(q => apart(p, q, 16, 24))
    && obstacles.every(q => apart(p, q, 16, 16)) && segs.every(s => !meets(p, s, 8));
  const linked = (id, dir) => [...new Set(links.flatMap(l => dir === 'down' ? (l.from === id ? [l.to] : []) : (l.to === id ? [l.from] : [])))];
  for (const b of rest.sort((a, c) => at.get(a.id).y - at.get(c.id).y || at.get(a.id).x - at.get(c.id).x)) {
    const kids = linked(b.id, 'down').filter(id => geo.has(id)), parents = linked(b.id, 'up').filter(id => geo.has(id));
    const near = [...kids, ...parents];
    const [dx, dy] = near.length ? shift(near.filter(id => out.has(id) && at.has(id))) : all;
    const x0 = at.get(b.id).x + (Number.isFinite(dx) ? dx : all[0]), y0 = at.get(b.id).y + (Number.isFinite(dy) ? dy : all[1]);
    const cx = near.length ? near.reduce((s, id) => s + geo.get(id).x + geo.get(id).w / 2, 0) / near.length : x0 + b.w / 2;
    // The row of the boxes that share its relatives, and the rows between it and them.
    const sibs = [...new Set([...kids.flatMap(id => linked(id, 'up')), ...parents.flatMap(id => linked(id, 'down'))])].filter(id => id !== b.id && geo.has(id)).map(id => geo.get(id));
    const sib = sibs.sort((p, q) => Math.abs(p.x + p.w / 2 - cx) - Math.abs(q.x + q.w / 2 - cx))[0];
    const rows = [];
    if (sib) rows.push({ y: sib.y, cost: 0 });
    rows.push({ y: y0, cost: 120 });
    if (kids.length) { const top = Math.min(...kids.map(id => geo.get(id).y)), above = sib ? sib.y + sib.h : top - b.h - 96; rows.push({ y: (above + top - b.h) / 2, cost: 120 }); }
    if (parents.length) { const bottom = Math.max(...parents.map(id => geo.get(id).y + geo.get(id).h)), below = sib ? sib.y : bottom + b.h + 96; rows.push({ y: (bottom + below - b.h) / 2, cost: 120 }); }
    let best = null;
    for (const row of rows) {
      const y = Math.max(page.margin / 2, row.y), ideal = cx - b.w / 2;
      for (let i = 0; i < 600; i++) {
        const d = (i % 2 ? -1 : 1) * Math.ceil(i / 2) * 8, cost = row.cost + Math.abs(d) + Math.abs(y - y0) * 0.25;
        if (best && cost >= best.cost) break;
        const q = { x: Math.max(page.margin / 2, ideal + d), y, w: b.w, h: b.h };
        if (clear(q)) { best = { ...q, cost }; break; }
      }
    }
    const p = best ?? { x: Math.max(page.margin, x0), y: Math.max(page.margin, y0), w: b.w, h: b.h };
    geo.set(b.id, { id: b.id, x: p.x, y: p.y, w: b.w, h: b.h, shape: b.shape });
    out.set(b.id, { x: p.x, y: p.y });
  }
  return out;
}

// ---- The trunk router ----

// Where a line meets a box's outline at height y on its left or right, and at x on its top or bottom.
function sideX(g, y, right) {
  const cx = g.x + g.w / 2;
  let half = g.w / 2;
  if (g.shape === 'triangle') half = g.w / 2 * Math.min(1, Math.max(0, (y - g.y) / g.h));
  if (g.shape === 'oval') { const t = (y - (g.y + g.h / 2)) / (g.h / 2); half = g.w / 2 * Math.sqrt(Math.max(0, 1 - t * t)); }
  if (g.shape === 'diamond') half = g.w / 2 * (1 - Math.abs(y - (g.y + g.h / 2)) / (g.h / 2));
  return right ? cx + half : cx - half;
}
function edgeY(g, x, bottom) {
  if (g.shape === 'oval') {
    const t = (x - (g.x + g.w / 2)) / (g.w / 2), half = g.h / 2 * Math.sqrt(Math.max(0, 1 - t * t));
    return g.y + g.h / 2 + (bottom ? half : -half);
  }
  if (g.shape === 'diamond') {
    const half = g.h / 2 * (1 - Math.min(1, Math.abs(x - (g.x + g.w / 2)) / (g.w / 2)));
    return g.y + g.h / 2 + (bottom ? half : -half);
  }
  return bottom ? g.y + g.h : g.y;
}
// Where the straight line between two boxes' centers leaves the first.
function exit(g, [tx, ty]) {
  const cx = g.x + g.w / 2, cy = g.y + g.h / 2, dx = tx - cx, dy = ty - cy;
  const k = Math.min(dx ? (g.w / 2) / Math.abs(dx) : Infinity, dy ? (g.h / 2) / Math.abs(dy) : Infinity, 1);
  return [cx + dx * k, cy + dy * k];
}
const centerX = g => g.x + g.w / 2;
const centerOf = g => [g.x + g.w / 2, g.y + g.h / 2];
const groupBy = (list, f) => list.reduce((m, x) => { const k = f(x); (m.get(k) ?? m.set(k, []).get(k)).push(x); return m; }, new Map());

// A box's lines of one look to every box in a frame, and to no others there, land on the frame as one line:
// each such line is routed to the frame instead of its box. Outer frames first, so the fewest lines show.
// frames: [{ id, x, y, w, h, members: [box ids, at any depth], depth }].
function land(geo, lines, frames) {
  for (const f of [...frames].sort((a, b) => a.depth - b.depth)) {
    const inside = new Set(f.members), open = lines.filter(l => !l.landed && inside.has(l.from) !== inside.has(l.to));
    for (const ls of groupBy(open, l => `${l.trunk}|${inside.has(l.from) ? l.to : l.from}`).values()) {
      const far = new Set(ls.map(l => inside.has(l.from) ? l.from : l.to));
      if (ls.length < 2 || far.size !== inside.size) continue;
      geo.set(f.id, { id: f.id, x: f.x, y: f.y, w: f.w, h: f.h, shape: 'frame' });
      for (const l of ls) { l.landed = f.id; if (inside.has(l.from)) l.from = f.id; else l.to = f.id; }
    }
  }
}

// Routes each line: { id, from, to, trunk, straight, label: { w, h, base, shared, text } }, from its Above
// side to the other, gains `points`, `labelAt` (the label's top left) and `down` (whether it runs down from
// its Above side, so an arrowhead would say nothing). A line going down (or up) leaves its box's bottom (or
// top), turns along a lane just past it, and drops onto the box it reaches, where lines arrive spread across
// the top in the order of where they start, so they don't cross there.
// - A triangle's apex takes the chart's main look, ownership's, all its lines meeting there. A line of
//   another look, like a general partner's, comes down beside it and meets its side at mid-height, the lane
//   it comes along kept 16 pt clear of the apexes it passes; where the box it leaves sits too close above
//   for that, its trunk leaves the box's side instead.
// - Lines of one look from one box share a trunk: they leave it together and fan out along one lane.
//   Trunks of different looks leave a box apart, spread along its edge in the order of where they go.
// - Trunks leaving boxes level with each other turn along lanes stacked in the space below them, 12 pt
//   apart, in the order that crosses the fewest of the others' lines, as channel routing does; trunks that
//   don't overlap share a lane.
// - Boxes level with each other are joined side to side (a triangle's at its mid-height, where it can be),
//   unless another box is in the way; then the line goes under the boxes between, on a lane of its own, and
//   comes up into the far box's bottom.
// - A line landing on a frame (see land) beside the box it leaves runs down that box's spine and into the
//   frame's near side.
function route(geo, lines, { frames = [], labels = true } = {}) {
  geo = new Map(geo);
  if (frames.length) land(geo, lines, frames);
  const G = id => geo.get(id);
  const looks = groupBy(lines, l => l.trunk), main = [...looks.entries()].sort((a, b) => b[1].length - a[1].length)[0]?.[0];
  for (const l of lines) {
    const s = G(l.from), t = G(l.to);
    l.points = null;
    if (l.straight) { l.dir = 'straight'; continue; }
    l.dir = t.y >= s.y + s.h + 16 ? 'down' : s.y >= t.y + t.h + 16 ? 'up' : 'side';
    if (l.dir === 'down' && t.shape === 'frame' && (t.x > centerX(s) + 8 || t.x + t.w < centerX(s) - 8)) { l.dir = 'ell'; continue; }
    l.flank = l.dir === 'down' && t.shape === 'triangle' && l.trunk !== main;
    // Boxes nearly touching, one over the other, are joined straight across the gap.
    const ox0 = Math.max(s.x, t.x), ox1 = Math.min(s.x + s.w, t.x + t.w);
    if (l.dir === 'side' && ox1 - ox0 >= 16 && (t.y >= s.y + s.h - 1 || s.y >= t.y + t.h - 1)) {
      const x = (ox0 + ox1) / 2, below = t.y >= s.y + s.h - 1;
      Object.assign(l, { dir: 'stub', points: below ? [[x, edgeY(s, x, true)], [x, edgeY(t, x, false)]] : [[x, edgeY(s, x, false)], [x, edgeY(t, x, true)]] });
      continue;
    }
    if (l.dir === 'side') {
      const y = sideY(s, t);
      const x0 = Math.min(s.x + s.w, t.x + t.w), x1 = Math.max(s.x, t.x);
      const blocking = [...geo.values()].filter(g => g !== s && g !== t && g.shape !== 'frame' && g.y < y && g.y + g.h > y && g.x < x1 && g.x + g.w > x0);
      if (blocking.length) Object.assign(l, { dir: 'under', floor: Math.max(s.y + s.h, t.y + t.h, ...blocking.map(g => g.y + g.h)) });
      else l.y = y;
    }
  }
  // Each box's trunks, and where each leaves it. A triangle's lines up leave by its sloping sides.
  const vertical = lines.filter(l => l.dir === 'down' || l.dir === 'up');
  const trunks = [...groupBy(vertical, l => `${l.from}|${l.dir}|${l.trunk}`).values()].map(ls => ({ ls, from: ls[0].from, dir: ls[0].dir }));
  const heading = t => t.ls.reduce((sum, l) => sum + centerX(G(l.to)), 0) / t.ls.length;
  for (const group of groupBy(trunks, t => `${t.from}|${t.dir}`).values()) {
    const s = G(group[0].from), sides = s.shape === 'triangle' && group[0].dir === 'up';
    group.sort((a, b) => heading(a) - heading(b)).forEach((t, i) => {
      t.x = sides ? centerX(s) : s.x + s.w * (i + 1) / (group.length + 1);
      t.y = edgeY(s, t.x, t.dir === 'down');
      t.edge = t.dir === 'down' ? s.y + s.h : s.y;
      for (const l of t.ls) l.sx = t.x;
    });
  }
  const arriving = lines.filter(l => ((l.dir === 'down' || l.dir === 'up') && !l.flank) || l.dir === 'under');
  for (const ls of groupBy(arriving, l => `${l.to}|${l.dir === 'down' ? 'top' : 'bottom'}`).values()) {
    const t = G(ls[0].to), start = l => l.sx ?? centerX(G(l.from));
    ls.sort((p, q) => start(p) - start(q));
    // Room after each drop for its label, which sits right of it.
    const levels = ls.length > 4 ? 3 : 2, xs = arrivals(t, ls.map(start), ls.map(l => l.label ? l.label.w + 10 : 14));
    ls.forEach((l, i) => {
      l.apex = t.shape === 'triangle' && l.dir === 'down';
      l.tx = l.apex ? centerX(t) : xs[i];
      l.ty = l.dir === 'down' ? edgeY(t, l.tx, false) : edgeY(t, l.tx, true);
      l.crowd = ls.length;
      l.stagger = ls.length > 2 || (ls.length === 2 && t.w < 220) ? i % levels : 0;
    });
  }
  // A line meeting a triangle's side comes down a gutter beside it, halfway to whatever is next to it there,
  // at mid-height, or above a line from the side already meeting it there.
  const taken = lines.filter(l => l.dir === 'side' && l.y !== undefined).flatMap(l => [[l.from, l.y], [l.to, l.y]]);
  for (const l of lines.filter(x => x.flank)) {
    const s = G(l.from), t = G(l.to), right = centerX(s) > centerX(t);
    let my = t.y + t.h / 2;
    const other = taken.filter(([id, y]) => id === t.id && Math.abs(y - my) < 14).map(([, y]) => y);
    if (other.length) my = Math.min(...other) - 30;
    const side = sideX(t, my, right);
    const next = [...geo.values()].filter(g => g !== t && g !== s && g.shape !== 'frame' && g.y < my && g.y + g.h > t.y - CLEAR)
      .map(g => g.shape === 'triangle' ? sideX(g, Math.min(my, g.y + g.h), !right) : right ? g.x : g.x + g.w)
      .filter(x => right ? x > side : x < side);
    const room = next.length ? Math.min(...next.map(x => Math.abs(x - side))) : 96;
    l.gx = side + (right ? 1 : -1) * Math.min(48, room / 2);
    l.my = my; l.side = side;
    l.tx = l.gx; l.ty = t.y;
  }
  // A box's one line leaves it straight above (or below) where it arrives, if the box spans that point.
  for (const group of groupBy(trunks, t => `${t.from}|${t.dir}`).values()) {
    const [t] = group, l = t.ls[0], s = G(t.from), m = Math.min(12, s.w / 4);
    if (group.length !== 1 || t.ls.length !== 1 || l.flank || l.tx < s.x + m || l.tx > s.x + s.w - m || (s.shape === 'triangle' && t.dir === 'up')) continue;
    t.x = l.sx = l.tx;
    t.y = edgeY(s, t.x, t.dir === 'down');
  }
  // Lines going under leave their box's bottom, each on its own lane below what's in the way.
  lines.filter(l => l.dir === 'under').forEach((l, j) => {
    const s = G(l.from), lane = l.floor + 16 + LANE * j;
    l.points = [[centerX(s), s.y + s.h], [centerX(s), lane], [l.tx, lane], [l.tx, G(l.to).y + G(l.to).h]];
  });
  // A trunk whose lines meet triangles' sides, leaving a box too close above them for a lane clear of their
  // apexes, leaves by the box's side, at its mid-height.
  for (const t of trunks) {
    if (t.dir !== 'down' || !t.ls.some(l => l.flank)) continue;
    const s = G(t.from), apexes = Math.min(...t.ls.map(l => G(l.to).y)), heading = t.ls.reduce((sum, l) => sum + l.tx, 0) / t.ls.length;
    if (apexes - CLEAR >= s.y + s.h + 8 || s.y + s.h / 2 > apexes - CLEAR) continue;
    const right = heading > centerX(s);
    if (t.ls.some(l => right ? l.tx < s.x + s.w : l.tx > s.x)) continue;
    t.flankSide = true;
    t.x = right ? sideX(s, s.y + s.h / 2, true) : sideX(s, s.y + s.h / 2, false);
    t.y = t.laneY = s.y + s.h / 2;
  }
  // The lanes. A trunk nearer its boxes than another crosses it where the other's stem passes its lane,
  // and where its own drops pass the other's; each channel's trunks are stacked, nearest first, picking
  // each time the one whose place there crosses the fewest of those left.
  for (const t of trunks) { const xs = [t.x, ...t.ls.map(l => l.tx)]; t.span = [Math.min(...xs), Math.max(...xs)]; }
  const within = (x, [a, b]) => x > a + 0.5 && x < b - 0.5;
  const crossings = (near, far) => within(far.x, near.span) + near.ls.filter(l => within(l.tx, far.span)).length;
  const overlap = (a, b) => a.span[0] < b.span[1] + 6 && b.span[0] < a.span[1] + 6;
  const channels = [];
  for (const t of [...trunks].filter(t => !t.flankSide).sort((a, b) => a.x - b.x)) {
    const ch = channels.find(c => c.dir === t.dir && Math.abs(c.edge - t.edge) < 40);
    if (ch) ch.trunks.push(t); else channels.push({ dir: t.dir, edge: t.edge, trunks: [t] });
  }
  for (const ch of channels) {
    const left = ch.trunks.filter(t => t.span[1] - t.span[0] >= 1), placed = [];
    for (const t of ch.trunks) t.lane = 0;
    while (left.length) {
      const cost = t => left.reduce((sum, o) => sum + (o === t ? 0 : crossings(t, o)), 0);
      const next = left.reduce((best, t) => cost(t) < cost(best) ? t : best);
      left.splice(left.indexOf(next), 1);
      next.lane = Math.max(-1, ...placed.filter(o => overlap(o, next)).map(o => o.lane)) + 1;
      placed.push(next);
    }
    ch.lanes = Math.max(0, ...ch.trunks.map(t => t.lane)) + 1;
  }
  const laneOf = new Map(channels.flatMap(ch => ch.trunks.map(t => [t, ch])));
  // How far short of what it reaches a lane must stop: room for the label beside the last leg, and for a
  // line meeting a triangle's side, 16 pt clear of its apex.
  const short = l => l.flank ? CLEAR : Math.max(STEM, l.label ? l.label.h + 5.3 + 4 : 0);
  // Level runs already fixed, which a lane keeps 12 pt from where they overlap: a trunk's along its box's
  // side, and a line from side to side.
  const fixed = [...trunks.filter(t => t.flankSide).map(t => ({ y: t.laneY, x0: t.span[0], x1: t.span[1] })),
    ...lines.filter(l => l.dir === 'side' && l.y !== undefined).map(l => { const xs = [G(l.from), G(l.to)].flatMap(g => [g.x, g.x + g.w]).sort((a, b) => a - b); return { y: l.y, x0: xs[1], x1: xs[2] }; })];
  for (const t of trunks) {
    const s = G(t.from), lanes = laneOf.get(t)?.lanes ?? 1;
    if (t.flankSide) {
      // Already placed, along the box's side.
    } else if (t.dir === 'down') {
      const limit = Math.min(...t.ls.map(l => l.ty - short(l))) - LANE * (lanes - 1 - t.lane), floor = t.edge + 8 + Math.min(LANE, 8) * t.lane;
      t.laneY = Math.max(floor, Math.min(t.edge + 18 + LANE * t.lane, limit));
      for (const f of fixed) {
        if (Math.min(f.x1, t.span[1]) - Math.max(f.x0, t.span[0]) < 4 || Math.abs(t.laneY - f.y) >= LANE) continue;
        if (f.y + LANE <= limit) t.laneY = f.y + LANE;
        else if (f.y - LANE >= floor) t.laneY = f.y - LANE;
      }
    } else if (s.shape !== 'triangle') {
      const limit = Math.max(...t.ls.map(l => l.ty + short(l))) + LANE * (lanes - 1 - t.lane);
      t.laneY = Math.min(t.edge - 8 - Math.min(LANE, 8) * t.lane, Math.max(t.edge - 18 - LANE * t.lane, limit));
    }
    if (t.dir === 'down') {
      for (const l of t.ls) {
        const start = t.flankSide ? [[t.x, t.y]] : [[t.x, t.y], [t.x, t.laneY]];
        l.points = l.flank ? [...start, [l.gx, t.laneY], [l.gx, l.my], [l.side, l.my]] : [...start, [l.tx, t.laneY], [l.tx, l.ty]];
      }
    } else if (s.shape === 'triangle') {
      const y = s.y + s.h * 0.6;
      for (const l of t.ls) {
        const right = l.tx >= t.x, b = G(l.to);
        const turn = l.tx + (Math.abs(l.tx - t.x) < s.w / 2 ? (right ? s.w / 2 + 16 : -s.w / 2 - 16) : 0);
        l.points = [[sideX(s, y, right), y], [turn, y], [turn, b.y + b.h + 14], [l.tx, b.y + b.h + 14], [l.tx, l.ty]];
      }
    } else {
      for (const l of t.ls) l.points = [[t.x, t.y], [t.x, t.laneY], [l.tx, t.laneY], [l.tx, l.ty]];
    }
  }
  // Lines landing on a frame beside their box run down the box's spine and into the frame's near side.
  for (const l of lines.filter(x => x.dir === 'ell')) {
    const s = G(l.from), t = G(l.to), x = centerX(s), y = t.y + t.h / 2;
    l.points = [[x, s.y + s.h], [x, y], [t.x > x ? t.x : t.x + t.w, y]];
  }
  for (const l of lines) {
    const s = G(l.from), t = G(l.to);
    if (l.dir === 'side') {
      const rightward = centerX(s) < centerX(t);
      l.points = [[sideX(s, l.y, rightward), l.y], [sideX(t, l.y, !rightward), l.y]];
    } else if (l.dir === 'straight') l.points = [exit(s, centerOf(t)), exit(t, centerOf(s))];
    l.points = l.points.filter((p, i, ps) => i === 0 || Math.hypot(p[0] - ps[i - 1][0], p[1] - ps[i - 1][1]) > 0.5)
      .map(([x, y]) => [Math.round(x * 4) / 4, Math.round(y * 4) / 4]);
    if (l.points.length === 3 && Math.abs(l.points[0][0] - l.points[2][0]) < 1) l.points = [l.points[0], l.points[2]];
    const [a, b] = [l.points[0], l.points[l.points.length - 1]];
    l.down = l.dir === 'down' || l.dir === 'ell' || ((l.dir === 'straight' || l.dir === 'stub') && b[1] > a[1] + 1);
  }
  if (!labels) return;
  // A trunk whose lines all say the same thing, like a GP's to each of its funds, says it once, on its lane.
  const once = new Set();
  for (const t of trunks) {
    if (t.ls.length < 2 || t.laneY === undefined || !t.ls.every(l => l.label?.shared) || new Set(t.ls.map(l => l.label.text)).size > 1) continue;
    t.ls.slice(1).forEach(l => { l.labelAt = null; once.add(l); });
    const xs = t.flankSide ? [t.x, ...t.ls.map(l => l.gx)] : [t.span[0], t.span[1]];
    t.ls[0].lane = { y: t.laneY, x0: Math.min(...xs), x1: Math.max(...xs), down: true };
  }
  // Lines drawn one over another, landing on one frame, say it once.
  for (const ls of groupBy(lines.filter(l => l.landed), l => `${l.from}|${l.to}|${l.trunk}`).values()) ls.slice(1).forEach(l => { l.labelAt = null; once.add(l); });
  placeLabels(geo, lines.filter(l => !once.has(l)), lines);
}

// The height a side-to-side line runs at: the middle of where the two boxes overlap, or a triangle's
// mid-height, where it's within that.
function sideY(s, t) {
  const lo = Math.max(s.y, t.y), hi = Math.min(s.y + s.h, t.y + t.h), mid = (lo + hi) / 2;
  const tri = [t, s].find(g => g.shape === 'triangle');
  if (tri) { const y = tri.y + tri.h / 2; if (y > lo + 6 && y < hi - 6) return y; }
  return mid;
}

// Where lines arrive along a box's edge, in the order of where they start: straight below (or above) where
// each starts, if the box reaches that far; otherwise spread evenly; and never closer than each one's room
// (`after`, the space its label takes beside it), as far as the box allows.
function arrivals(t, starts, after = []) {
  const n = starts.length, m = Math.min(12, t.w / 4), lo = t.x + m, hi = t.x + t.w - m;
  const even = starts.map((_, i) => t.x + t.w * (i + 1) / (n + 1));
  const xs = starts.map((s, i) => s >= lo && s <= hi ? s : even[i]);
  const want = starts.map((_, i) => after[i] ?? 14), total = want.slice(0, -1).reduce((a, b) => a + b, 0);
  const k = Math.min(1, (hi - lo) / Math.max(1, total)), gap = i => want[i] * k;
  // Pushed apart rightward then leftward, or the other way: whichever moves least the lines that drop
  // straight from where they start.
  const right = ys => { for (let i = 1; i < n; i++) ys[i] = Math.max(ys[i], ys[i - 1] + gap(i - 1)); for (let i = n - 1; i >= 0; i--) ys[i] = Math.min(ys[i], i < n - 1 ? ys[i + 1] - gap(i) : hi); return ys; };
  const left = ys => { for (let i = n - 2; i >= 0; i--) ys[i] = Math.min(ys[i], ys[i + 1] - gap(i)); for (let i = 0; i < n; i++) ys[i] = Math.max(ys[i], i ? ys[i - 1] + gap(i - 1) : lo); return ys; };
  const moved = ys => ys.reduce((s, x, i) => s + (starts[i] >= lo && starts[i] <= hi ? Math.abs(x - starts[i]) : 0), 0);
  const [a, b] = [right([...xs]), left([...xs])];
  const out = moved(b) < moved(a) && b[n - 1] <= hi + 0.5 ? b : a;
  return out[0] < lo - 0.5 ? even : out;
}

// Labels. A label goes in one place, the same on every line: beside the last leg, just short of what the
// line reaches, as percentages sit. On a drop, right of it, 3 pt off, its last baseline 4 pt above the top
// it meets (below the bottom, going up); on a level last leg, above it, just past the arrowhead. Where that
// place is taken by another label, a box or a line, the label steps away from what it reaches, a line's
// height at a time; only where all of those are taken does it look elsewhere: along its lane, or beside its
// longest leg. Each place costs what it covers (boxes most, then other labels, then lines it crosses) and
// how far down that order it is; the cheapest wins.
function placeLabels(geo, lines, all = lines) {
  // What a box covers: a triangle its lower half, and the middle of its upper half.
  const boxes = [...geo.values()].filter(b => b.shape !== 'frame').flatMap(b => b.shape !== 'triangle' ? [b]
    : [{ x: b.x, y: b.y + b.h / 2, w: b.w, h: b.h / 2 }, { x: b.x + b.w / 4, y: b.y, w: b.w / 2, h: b.h / 2 }]), placed = [];
  const segs = all.flatMap(l => (l.points ?? []).slice(1).map((p, i) => ({ l, a: l.points[i], b: p })));
  const meets = (r, a, b) => {
    const [x0, x1] = [Math.min(a[0], b[0]), Math.max(a[0], b[0])], [y0, y1] = [Math.min(a[1], b[1]), Math.max(a[1], b[1])];
    return x1 >= r.x && x0 <= r.x + r.w && y1 >= r.y && y0 <= r.y + r.h;
  };
  const overlap = (r, q) => Math.max(0, Math.min(r.x + r.w, q.x + q.w) - Math.max(r.x, q.x)) * Math.max(0, Math.min(r.y + r.h, q.y + q.h) - Math.max(r.y, q.y));
  for (const l of lines) {
    const ps = l.points, lab = l.label;
    l.labelAt = null;
    if (!lab || !ps || ps.length < 2) continue;
    const w = lab.w, h = lab.h, legs = ps.slice(1).map((p, i) => ({ a: ps[i], b: p, len: Math.hypot(p[0] - ps[i][0], p[1] - ps[i][1]) }));
    const upright = g => Math.abs(g.a[0] - g.b[0]) < 1, last = legs[legs.length - 1];
    // The label's last baseline sits `base` below its top.
    const base = lab.base ?? h * 0.8;
    const spots = [];
    if (l.lane) for (const f of [0.5, 0.3, 0.7, 0.15, 0.85]) spots.push({ x: l.lane.x0 + (l.lane.x1 - l.lane.x0) * f - w / 2, y: l.lane.down ? l.lane.y - h - 2 : l.lane.y + 2 });
    // Lines that meet at an apex share its last leg; one that joins it along a lane says what it says on
    // the lane, just short of where it joins.
    const join = legs.length > 1 && l.apex && l.crowd > 1 && !upright(legs[legs.length - 2]) ? legs[legs.length - 2] : null;
    if (join) {
      const fromLeft = join.b[0] > join.a[0], x = fromLeft ? join.b[0] - w - 6 : join.b[0] + 6;
      spots.push({ x, y: join.b[1] - h - 2 }, { x, y: join.b[1] + 3 });
    }
    if (upright(last)) {
      const down = last.b[1] > last.a[1], x = last.b[0] + 4;
      const y0 = down ? last.b[1] - 5.3 - base : last.b[1] + 5.3;
      for (let k = 0; k < 4; k++) spots.push({ x, y: down ? y0 - k * (h + 2) : y0 + k * (h + 2) });
    } else {
      const tipped = l.arrow === 'end' || l.arrow === 'both' || (l.arrow === 'auto' && !l.down);
      const leftward = last.b[0] < last.a[0], y = last.b[1], pad = 6 + (tipped ? 8 : 0);
      for (let k = 0; k < 3; k++) {
        const x = leftward ? last.b[0] + pad + k * 12 : last.b[0] - pad - w - k * 12;
        spots.push({ x, y: y - h - 2 });
      }
      spots.push({ x: leftward ? last.b[0] + pad : last.b[0] - pad - w, y: y + 3 });
    }
    for (const g of [...legs].sort((p, q) => q.len - p.len).slice(0, 2)) {
      for (const f of [0.5, 0.3, 0.7]) {
        const x = g.a[0] + (g.b[0] - g.a[0]) * f, y = g.a[1] + (g.b[1] - g.a[1]) * f;
        spots.push(upright(g) ? { x: x + 4, y: y - h / 2 } : { x: x - w / 2, y: y - h - 2 });
      }
      // Across a short leg, the label may hang past either end of it, above or below.
      if (!upright(g)) {
        const [x0, x1] = [Math.min(g.a[0], g.b[0]), Math.max(g.a[0], g.b[0])], y = g.a[1];
        spots.push({ x: x0, y: y - h - 2 }, { x: x1 - w, y: y - h - 2 }, { x: (x0 + x1 - w) / 2, y: y + 3 }, { x: x0, y: y + 3 }, { x: x1 - w, y: y + 3 });
      }
    }
    let best = null;
    spots.forEach((s, i) => {
      const r = { x: s.x, y: s.y, w, h };
      let cost = i * 2;
      for (const b of boxes) cost += overlap(r, b) * 4;
      for (const q of placed) cost += overlap(r, q) * 6;
      for (const sg of segs) if (sg.l !== l && meets(r, sg.a, sg.b)) cost += 40;
      if (!best || cost < best.cost) best = { ...s, cost };
    });
    l.labelAt = { x: best.x, y: best.y };
    placed.push({ x: best.x, y: best.y, w, h });
  }
}

return { place, arrange, route, OPTIONS };
})();
