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
  'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
  'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
  'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
  'elk.layered.crossingMinimization.forceNodeModelOrder': 'false',
  'elk.edgeRouting': 'ORTHOGONAL',
};

// Positions for every box, top left at 0, 0: { id → { x, y } }. Laid out again only when what it reads
// changes: the boxes and their sizes, the lines that rank them, and the frames.
const cache = new Map();
function place({ boxes, links, clusters }) {
  const k = JSON.stringify([boxes.map(b => [b.id, Math.round(b.w), Math.round(b.h)]), links.map(l => [l.from, l.to]), clusters.map(c => [c.id, c.parent, c.members, c.top])]);
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
// grown to hold it; with some, the others keep ELK's arrangement, moved to line up with the entered ones on
// average, and each then takes the nearest clear place in its row.
function arrange({ boxes, links, clusters, entered, page }) {
  const out = new Map();
  for (const b of boxes) if (entered.has(b.id)) { const p = entered.get(b.id); out.set(b.id, { x: p.x, y: p.y }); }
  const rest = boxes.filter(b => !entered.has(b.id));
  if (!rest.length) return out;
  const at = place({ boxes, links, clusters }), size = new Map(boxes.map(b => [b.id, b]));
  if (!out.size) {
    const r = Math.max(...boxes.map(b => at.get(b.id).x + b.w)), d = Math.max(...boxes.map(b => at.get(b.id).y + b.h));
    const m = page.margin, grow = Math.max(1, (r + 2 * m) / page.w, (d + 2 * m) / page.h);
    const dx = (page.w * grow - r) / 2, dy = Math.max(m, (page.h * grow - d) / 2);
    for (const b of boxes) out.set(b.id, { x: at.get(b.id).x + dx, y: at.get(b.id).y + dy });
    return out;
  }
  const known = [...out.keys()];
  const dx = known.reduce((s, id) => s + out.get(id).x - at.get(id).x, 0) / known.length;
  const dy = known.reduce((s, id) => s + out.get(id).y - at.get(id).y, 0) / known.length;
  const placed = known.map(id => ({ ...out.get(id), w: size.get(id).w, h: size.get(id).h }));
  const clear = p => placed.every(q => p.x >= q.x + q.w + 16 || p.x + p.w + 16 <= q.x || p.y >= q.y + q.h + 24 || p.y + p.h + 24 <= q.y);
  for (const b of rest.sort((a, c) => at.get(a.id).y - at.get(c.id).y || at.get(a.id).x - at.get(c.id).x)) {
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
  const arriving = lines.filter(l => l.dir !== 'side' && l.dir !== 'straight');
  for (const ls of groupBy(arriving, l => `${l.to}|${l.dir === 'down' ? 'top' : 'bottom'}`).values()) {
    const t = G(ls[0].to), start = l => l.sx ?? centerX(G(l.from));
    ls.sort((p, q) => start(p) - start(q));
    const levels = ls.length > 4 ? 3 : 2;
    ls.forEach((l, i) => {
      l.apex = t.shape === 'triangle' && l.dir === 'down';
      l.tx = l.apex ? centerX(t) : t.x + t.w * (i + 1) / (ls.length + 1);
      l.ty = l.dir === 'down' ? edgeY(t, l.tx, false) : edgeY(t, l.tx, true);
      l.crowd = ls.length;
      l.stagger = ls.length > 2 || (ls.length === 2 && t.w < 220) ? i % levels : 0;
    });
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
    l.labelAt = labelSpot(l, G);
  }
  // A trunk whose lines all say the same thing, like a GP's to each of its funds, says it once, on its lane.
  for (const t of trunks) {
    if (t.ls.length < 2 || t.laneY === undefined || !t.ls.every(l => l.label?.shared) || new Set(t.ls.map(l => l.label.text)).size > 1) continue;
    const lab = t.ls[0].label;
    t.ls.forEach((l, i) => { l.labelAt = i ? null : { x: (t.span[0] + t.span[1]) / 2 - lab.w / 2, y: t.dir === 'down' ? t.laneY - lab.h - 2 : t.laneY + 2 }; });
  }
}

// A label sits beside the last leg of its line, just short of the box it reaches, as percentages do on
// structure charts, a step higher for each line arriving beside it; where there's no room there, or the
// line shares a triangle's apex with others, beside or above the middle of its longest leg.
function labelSpot(l, G) {
  const ps = l.points, lab = l.label;
  if (!lab || ps.length < 2) return null;
  const legs = ps.slice(1).map((p, i) => ({ a: ps[i], b: p, len: Math.hypot(p[0] - ps[i][0], p[1] - ps[i][1]) }));
  const upright = g => Math.abs(g.a[0] - g.b[0]) < 1;
  const last = legs[legs.length - 1];
  if (upright(last) && last.len >= lab.h + 12 && !(l.apex && l.crowd > 1)) {
    const down = last.b[1] > last.a[1], off = 4 + (l.stagger ?? 0) * (lab.h + 1);
    return { x: last.b[0] + 4, y: down ? last.b[1] - off - lab.h : last.b[1] + off };
  }
  const leg = legs.reduce((m, g) => g.len > m.len ? g : m);
  if (upright(leg)) return { x: leg.a[0] + 4, y: (leg.a[1] + leg.b[1]) / 2 - lab.h / 2 };
  return { x: (leg.a[0] + leg.b[0]) / 2 - lab.w / 2, y: Math.min(leg.a[1], leg.b[1]) - lab.h - 2 };
}

return { place, arrange, route };
})();
