// Layout (dendra.md, Views): where the boxes go that nobody has placed, and the routes of the lines.
// ELK's layered algorithm places the boxes in rows ranked by the lines, each line's Above side on top, with
// frames as clusters; entered positions win. The trunk router, Dendra's own, routes the lines as structure
// charts draw them: a box's lines of one look leave it on one trunk and fan out along a lane, and arrive
// spread across the top of what they reach. Pure: it reads geometry and gives geometry.
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

// Every box's position. Entered ones stand. With none entered, ELK's layout sits in the middle of the page;
// with some, each other box keeps its place in ELK's arrangement relative to the entered boxes it's linked
// to (or to all of them, if none), and then takes the nearest clear place in its row.
function arrange({ boxes, links, clusters, entered, page }) {
  const out = new Map();
  for (const b of boxes) if (entered.has(b.id)) { const p = entered.get(b.id); out.set(b.id, { x: p.x, y: p.y }); }
  const rest = boxes.filter(b => !entered.has(b.id));
  if (!rest.length) return out;
  const at = place({ boxes, links, clusters }), size = new Map(boxes.map(b => [b.id, b]));
  if (!out.size) {
    const r = Math.max(...boxes.map(b => at.get(b.id).x + b.w)), d = Math.max(...boxes.map(b => at.get(b.id).y + b.h));
    const m = page.margin, dx = Math.max(m, (page.w - r) / 2), dy = Math.max(m, (page.h - d) / 2);
    for (const b of boxes) out.set(b.id, { x: at.get(b.id).x + dx, y: at.get(b.id).y + dy });
    return out;
  }
  const known = [...out.keys()];
  const shift = ids => [0, 1].map(k => ids.reduce((s, id) => s + (k ? out.get(id).y - at.get(id).y : out.get(id).x - at.get(id).x), 0) / ids.length);
  const all = shift(known);
  const placed = known.map(id => ({ ...out.get(id), w: size.get(id).w, h: size.get(id).h }));
  const clear = p => placed.every(q => p.x >= q.x + q.w + 16 || p.x + p.w + 16 <= q.x || p.y >= q.y + q.h + 24 || p.y + p.h + 24 <= q.y);
  for (const b of rest.sort((a, c) => at.get(a.id).y - at.get(c.id).y || at.get(a.id).x - at.get(c.id).x)) {
    const near = [...new Set(links.flatMap(l => l.from === b.id ? [l.to] : l.to === b.id ? [l.from] : []))].filter(id => out.has(id));
    const [dx, dy] = near.length ? shift(near) : all;
    const x0 = Math.max(page.margin, at.get(b.id).x + dx), y0 = Math.max(page.margin, at.get(b.id).y + dy);
    let p = null;
    for (let row = 0; !p && row < 8; row++)
      for (let i = 0; !p && i < 24; i++) {
        const dxs = (i % 2 ? -1 : 1) * Math.ceil(i / 2) * (b.w + 24) / 2;
        const q = { x: Math.max(page.margin, x0 + dxs), y: y0 + row * (b.h + 40), w: b.w, h: b.h };
        if (clear(q)) p = q;
      }
    p ??= { x: x0, y: y0, w: b.w, h: b.h };
    placed.push(p);
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

// Routes each line: { id, from, to, trunk, straight, label: { w, h, shared, text } }, from its Above side to
// the other, gains `points` and `labelAt` (the label's top left). A line going down (or up) leaves its box's
// bottom (or top), turns along a lane just past it, and drops onto the box it reaches, where lines arrive
// spread across the top in the order of where they start (all at the apex of a triangle), so they don't
// cross there.
// - Lines of one look from one box share a trunk: they leave it together and fan out along one lane.
//   Trunks of different looks leave a box apart, spread along its edge in the order of where they go.
// - Trunks leaving boxes level with each other turn along lanes stacked in the space below them, in the
//   order that crosses the fewest of the others' lines, as channel routing does; trunks that don't overlap
//   share a lane.
// - Boxes level with each other are joined side to side, unless another box is in the way; then the line
//   goes under the boxes between, on a lane of its own, and comes up into the far box's bottom.
function route(geo, lines) {
  const G = id => geo.get(id);
  for (const l of lines) {
    const s = G(l.from), t = G(l.to);
    if (l.straight) { l.dir = 'straight'; continue; }
    l.dir = t.y >= s.y + s.h + 16 ? 'down' : s.y >= t.y + t.h + 16 ? 'up' : 'side';
    // Boxes nearly touching, one over the other, are joined straight across the gap.
    const ox0 = Math.max(s.x, t.x), ox1 = Math.min(s.x + s.w, t.x + t.w);
    if (l.dir === 'side' && ox1 - ox0 >= 16 && (t.y >= s.y + s.h - 1 || s.y >= t.y + t.h - 1)) {
      const x = (ox0 + ox1) / 2, below = t.y >= s.y + s.h - 1;
      Object.assign(l, { dir: 'stub', points: below ? [[x, edgeY(s, x, true)], [x, edgeY(t, x, false)]] : [[x, edgeY(s, x, false)], [x, edgeY(t, x, true)]] });
      continue;
    }
    if (l.dir === 'side') {
      const y = (Math.max(s.y, t.y) + Math.min(s.y + s.h, t.y + t.h)) / 2;
      const x0 = Math.min(s.x + s.w, t.x + t.w), x1 = Math.max(s.x, t.x);
      const blocking = [...geo.values()].filter(g => g !== s && g !== t && g.y < y && g.y + g.h > y && g.x < x1 && g.x + g.w > x0);
      if (blocking.length) Object.assign(l, { dir: 'under', floor: Math.max(s.y + s.h, t.y + t.h, ...blocking.map(g => g.y + g.h)) });
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
  const arriving = lines.filter(l => l.dir === 'down' || l.dir === 'up' || l.dir === 'under');
  for (const ls of groupBy(arriving, l => `${l.to}|${l.dir === 'down' ? 'top' : 'bottom'}`).values()) {
    const t = G(ls[0].to), start = l => l.sx ?? centerX(G(l.from));
    ls.sort((p, q) => start(p) - start(q));
    const levels = ls.length > 4 ? 3 : 2, xs = arrivals(t, ls.map(start));
    ls.forEach((l, i) => {
      l.apex = t.shape === 'triangle' && l.dir === 'down';
      l.tx = l.apex ? centerX(t) : xs[i];
      l.ty = l.dir === 'down' ? edgeY(t, l.tx, false) : edgeY(t, l.tx, true);
      l.crowd = ls.length;
      l.stagger = ls.length > 2 || (ls.length === 2 && t.w < 220) ? i % levels : 0;
    });
  }
  // A box's one line leaves it straight above (or below) where it arrives, if the box spans that point.
  for (const group of groupBy(trunks, t => `${t.from}|${t.dir}`).values()) {
    const [t] = group, l = t.ls[0], s = G(t.from), m = Math.min(12, s.w / 4);
    if (group.length !== 1 || t.ls.length !== 1 || l.tx < s.x + m || l.tx > s.x + s.w - m || (s.shape === 'triangle' && t.dir === 'up')) continue;
    t.x = l.sx = l.tx;
    t.y = edgeY(s, t.x, t.dir === 'down');
  }
  // Lines going under leave their box's bottom, each on its own lane below what's in the way.
  lines.filter(l => l.dir === 'under').forEach((l, j) => {
    const s = G(l.from), lane = l.floor + 16 + 9 * j;
    l.points = [[centerX(s), s.y + s.h], [centerX(s), lane], [l.tx, lane], [l.tx, G(l.to).y + G(l.to).h]];
  });
  // The lanes. A trunk nearer its boxes than another crosses it where the other's stem passes its lane,
  // and where its own drops pass the other's; each channel's trunks are stacked, nearest first, picking
  // each time the one whose place there crosses the fewest of those left.
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
    const s = G(t.from);
    if (t.dir === 'down') {
      const limit = Math.min(...t.ls.map(l => l.ty)) - 14;
      t.laneY = Math.max(t.edge + 8, Math.min(t.edge + 18 + 10 * t.lane, limit));
      for (const l of t.ls) l.points = [[t.x, t.y], [t.x, t.laneY], [l.tx, t.laneY], [l.tx, l.ty]];
    } else if (s.shape === 'triangle') {
      const y = s.y + s.h * 0.6;
      for (const l of t.ls) {
        const right = l.tx >= t.x, b = G(l.to);
        const turn = l.tx + (Math.abs(l.tx - t.x) < s.w / 2 ? (right ? s.w / 2 + 16 : -s.w / 2 - 16) : 0);
        l.points = [[sideX(s, y, right), y], [turn, y], [turn, b.y + b.h + 14], [l.tx, b.y + b.h + 14], [l.tx, l.ty]];
      }
    } else {
      const limit = Math.max(...t.ls.map(l => l.ty)) + 14;
      t.laneY = Math.min(t.edge - 8, Math.max(t.edge - 18 - 10 * t.lane, limit));
      for (const l of t.ls) l.points = [[t.x, t.y], [t.x, t.laneY], [l.tx, t.laneY], [l.tx, l.ty]];
    }
  }
  for (const l of lines) {
    const s = G(l.from), t = G(l.to);
    if (l.dir === 'side') {
      const y = (Math.max(s.y, t.y) + Math.min(s.y + s.h, t.y + t.h)) / 2, rightward = centerX(s) < centerX(t);
      l.points = [[sideX(s, y, rightward), y], [sideX(t, y, !rightward), y]];
    } else if (l.dir === 'straight') l.points = [exit(s, centerOf(t)), exit(t, centerOf(s))];
    l.points = l.points.filter((p, i, ps) => i === 0 || Math.hypot(p[0] - ps[i - 1][0], p[1] - ps[i - 1][1]) > 0.5)
      .map(([x, y]) => [Math.round(x * 4) / 4, Math.round(y * 4) / 4]);
    if (l.points.length === 3 && Math.abs(l.points[0][0] - l.points[2][0]) < 1) l.points = [l.points[0], l.points[2]];
  }
  // A trunk whose lines all say the same thing, like a GP's to each of its funds, says it once, on its lane.
  const once = new Set();
  for (const t of trunks) {
    if (t.ls.length < 2 || t.laneY === undefined || !t.ls.every(l => l.label?.shared) || new Set(t.ls.map(l => l.label.text)).size > 1) continue;
    t.ls.slice(1).forEach(l => { l.labelAt = null; once.add(l); });
    t.ls[0].lane = { y: t.laneY, x0: t.span[0], x1: t.span[1], down: t.dir === 'down' };
  }
  placeLabels(geo, lines.filter(l => !once.has(l)));
}

// Where lines arrive along a box's edge, in the order of where they start: straight below (or above) where
// each starts, if the box reaches that far; otherwise spread evenly; and never closer than a step apart.
function arrivals(t, starts) {
  const n = starts.length, m = Math.min(12, t.w / 4), lo = t.x + m, hi = t.x + t.w - m;
  const even = starts.map((_, i) => t.x + t.w * (i + 1) / (n + 1));
  const xs = starts.map((s, i) => s >= lo && s <= hi ? s : even[i]);
  const gap = Math.min(14, (hi - lo) / Math.max(1, n - 1));
  for (let i = 1; i < n; i++) xs[i] = Math.max(xs[i], xs[i - 1] + gap);
  for (let i = n - 1; i >= 0; i--) xs[i] = Math.min(xs[i], i < n - 1 ? xs[i + 1] - gap : hi);
  return xs[0] < lo - 0.5 ? even : xs;
}

// Labels, each where it reads best and hides least. A label's places, in the order structure charts
// prefer them: beside the last leg just short of the box it reaches, as percentages sit, a step higher for
// each line arriving beside it; beside the top of that leg; along its lane; beside or above its longest
// leg. Each place costs what it covers (boxes most, then other labels, then lines it crosses) and how far
// down that order it is; the cheapest wins.
function placeLabels(geo, lines) {
  // What a box covers: a triangle its lower half, and the middle of its upper half.
  const boxes = [...geo.values()].flatMap(b => b.shape !== 'triangle' ? [b]
    : [{ x: b.x, y: b.y + b.h / 2, w: b.w, h: b.h / 2 }, { x: b.x + b.w / 4, y: b.y, w: b.w / 2, h: b.h / 2 }]), placed = [];
  const segs = lines.flatMap(l => (l.points ?? []).slice(1).map((p, i) => ({ l, a: l.points[i], b: p })));
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
    const spots = [];
    if (l.lane) for (const f of [0.5, 0.3, 0.7, 0.15, 0.85]) spots.push({ x: l.lane.x0 + (l.lane.x1 - l.lane.x0) * f - w / 2, y: l.lane.down ? l.lane.y - h - 2 : l.lane.y + 2 });
    if (upright(last) && !(l.apex && l.crowd > 1)) {
      const down = last.b[1] > last.a[1], x = last.b[0] + 4;
      for (let k = 0; k < 3; k++) {
        const off = 4 + ((l.stagger ?? 0) + k) % 3 * (h + 1);
        spots.push({ x, y: down ? last.b[1] - off - h : last.b[1] + off });
      }
      spots.push({ x, y: down ? last.a[1] - h - 2 : last.a[1] + 2 }, { x: last.b[0] - w - 4, y: down ? last.b[1] - 4 - h : last.b[1] + 4 });
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
      for (const sg of segs) if (meets(r, sg.a, sg.b)) cost += 40;
      if (!best || cost < best.cost) best = { ...s, cost };
    });
    l.labelAt = { x: best.x, y: best.y };
    placed.push({ x: best.x, y: best.y, w, h });
  }
}

return { place, arrange, route, OPTIONS };
})();
