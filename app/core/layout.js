// Layout (dendra.md, Views): where the boxes go that nobody has placed, and the routes of the lines.
// ELK's layered algorithm places the boxes in rows ranked by the lines, each line's Above side on top, with
// frames as clusters; entered positions win, and a box placed among them goes beside its relatives, clear
// of boxes and of lines it isn't on. The trunk router, Dendra's own, routes the lines as structure charts
// draw them: a box's lines of one look leave it on one trunk and fan out along a lane, and arrive spread
// across the top of what they reach. Pure: it reads geometry and gives geometry, keeping what it worked out
// by what it read (and ELK's layouts in a store, where it's given one).
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

// Boxes 16 pt apart in a rank, and ranks 40 pt apart, at the least: a chart is as compact as its lines allow.
const GAP = { across: 21, down: 53 };
const OPTIONS = {
  'elk.algorithm': 'layered',
  'elk.direction': 'DOWN',
  'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
  'elk.spacing.nodeNode': String(GAP.across),
  'elk.layered.spacing.nodeNodeBetweenLayers': String(GAP.down),
  'elk.spacing.componentComponent': '36',
  'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
  'elk.edgeRouting': 'ORTHOGONAL',
};
// A big chart is laid out the quick way: Brandes and Köpf's placement, and one sweep against crossings.
// Network simplex takes seconds there, and recurses once for each box and line, past what the stack holds.
const QUICK = { 'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF', 'elk.layered.thoroughness': '1', 'elk.layered.crossingMinimization.greedySwitch.type': 'OFF' };
const BIG = 120;   // boxes and lines
// The room a chart has on a slide, where no other is given: within its margins, under its title and date.
const ROOM = { w: 1184, h: 538 };

// Distances, in pixels: lanes at least 15 pt apart, so 12 pt on a slide that draws the page at 0.8; a lane
// passing over a triangle's apex, or a junction, at least 16 pt clear of it; a line's last leg at least this
// long where it carries no label.
const LANE = 20, CLEAR = 21, STEM = 14;

// What's worked out from geometry, kept by what it read, the latest 24.
function keeping() {
  const kept = new Map();
  return (k, make) => {
    if (kept.has(k)) { const v = kept.get(k); kept.delete(k); kept.set(k, v); return v; }
    const v = make();
    kept.set(k, v);
    if (kept.size > 24) kept.delete(kept.keys().next().value);
    return v;
  };
}

// Positions for every box, top left at 0, 0: { id → { x, y } }. Laid out again only when what it reads
// changes: the boxes, their sizes and classes, the lines that rank them, and the frames; and where a store is
// given (keepIn: { get, set } of text), not even after a reload, the latest six being kept there. Should ELK
// fail, the boxes are set out in rows by rank, so a chart is always drawn.
const placed = keeping();
let store = null;
const keepIn = s => { store = s; };
const laidBefore = () => { try { return JSON.parse(store?.get('layouts') ?? '[]'); } catch { return []; } };
function place({ boxes, links, clusters, room = ROOM }) {
  const quick = boxes.length + links.length > BIG;
  const k = JSON.stringify([OPTIONS, quick, [room.w, room.h, room.key?.w, room.key?.h], boxes.map(b => [b.id, Math.round(b.w), Math.round(b.h), b.class ?? null]), links.map(l => [l.from, l.to, l.trunk, l.room ?? 0]), clusters.map(c => [c.id, c.parent, c.members, c.top])]);
  return placed(k, () => {
    const before = laidBefore().find(([key]) => key === k);
    if (before) return new Map(before[1].map(([id, x, y]) => [id, { x, y }]));
    let out = null;
    for (const options of quick ? [{ ...OPTIONS, ...QUICK }] : [OPTIONS, { ...OPTIONS, ...QUICK }]) {
      try { out = elkPlace(boxes, links, clusters, options, room); break; } catch { /* the next way, or rows */ }
    }
    out ??= rows(boxes, links);
    store?.set('layouts', JSON.stringify([[k, [...out].map(([id, p]) => [id, p.x, p.y])], ...laidBefore().filter(([key]) => key !== k)].slice(0, 6)));
    return out;
  });
}
// The tier of each box, its row counted from the top, as a structure chart sets them: what nothing ranks over
// in the top row, so investors sit in one row above the funds; each other box a row under the lowest box
// that ranks it, or level with one of its own class that does (boxes a style fills alike, in one frame or in
// none, like a feeder fund and the fund it invests in, are peers, joined side to side). A class sits in one
// tier wherever the lines allow it: those of its members that rank anything go down to the lowest of them,
// unless that moves one under another; one that ranks nothing stays under what ranks it. The last line of
// a loop, as a search from the top meets it, ranks nothing. And tiers are as few as the lines allow: a tier
// joins the one under it where all it ranks there it ranks by lines of another look than the chart's own
// (ownership's, the look most lines have), which meet a box's side, and the chart is drawn no smaller for it.
// A tier too wide for the room wraps, as a line of text does: its frames that rank nothing outside them go on
// rows of their own under it, as many as draw the chart largest, a column of panels.
// → { tier: { id → tier }, wraps: [[each frame's boxes in a column, a row each]] }
function tiers(boxes, links, room = ROOM, clusters = []) {
  // Each box's outermost frame; boxes filled alike are of one class only in one frame, or in none.
  const parent = new Map(clusters.map(c => [c.id, c.parent])), framed = new Map(clusters.flatMap(c => c.members.map(m => [m, c.id])));
  const outer = id => { let f = framed.get(id); while (f && parent.get(f)) f = parent.get(f); return f ?? null; };
  const cls = new Map(boxes.map(b => [b.id, b.class ? `${b.class}|${outer(b.id) ?? ''}` : null])), down = new Map(boxes.map(b => [b.id, []]));
  const looks = groupBy(links, l => l.trunk), main = [...looks.entries()].sort((a, b) => b[1].length - a[1].length)[0]?.[0];
  const strict = new Set(links.filter(l => l.trunk === main).map(l => `${l.from}>${l.to}`));
  for (const l of links) if (down.has(l.from) && down.has(l.to) && l.from !== l.to && !down.get(l.from).includes(l.to)) down.get(l.from).push(l.to);
  // A search from the top, in the order given: what it finishes last comes first, and a line back up a path
  // it's on is a loop's.
  const state = new Map(), order = [], ups = new Map(boxes.map(b => [b.id, []]));
  for (const b of boxes) {
    if (state.has(b.id)) continue;
    const stack = [[b.id, 0]];
    state.set(b.id, 1);
    while (stack.length) {
      const top = stack[stack.length - 1], [id, i] = top, next = down.get(id)[i];
      if (next === undefined) { stack.pop(); state.set(id, 2); order.push(id); continue; }
      top[1]++;
      if (state.get(next) === 1) continue;
      ups.get(next).push(id);
      if (!state.has(next)) { state.set(next, 1); stack.push([next, 0]); }
    }
  }
  order.reverse();
  const len = (u, v) => cls.get(u) && cls.get(u) === cls.get(v) ? 0 : 1;
  const settle = t => { for (const v of order) for (const u of ups.get(v)) if (t.get(u) + len(u, v) > t.get(v)) t.set(v, t.get(u) + len(u, v)); return t; };
  let tier = settle(new Map(boxes.map(b => [b.id, 0])));
  const classes = [...groupBy(boxes.filter(b => cls.get(b.id) && down.get(b.id).length), b => cls.get(b.id)).values()].map(bs => bs.map(b => b.id)).filter(ms => ms.length > 1);
  for (let again = true, n = 0; again && n < 2 * classes.length + 2; n++) {
    again = false;
    for (const ms of classes) {
      const t = Math.max(...ms.map(id => tier.get(id)));
      if (ms.every(id => tier.get(id) === t)) continue;
      const tried = settle(new Map([...tier, ...ms.map(id => [id, t])]));
      if (ms.every(id => tried.get(id) === t)) { tier = tried; again = true; }
    }
  }
  // Each tier as what's side by side in it: a box, or a frame's boxes there, framed (its outermost frame's).
  const pad = new Map(clusters.map(c => [c.id, c.top]));
  const units = bs => [...groupBy(bs, b => outer(b.id) ?? b.id).entries()].map(([k, ms]) => {
    const f = outer(ms[0].id), w = ms.reduce((w, b) => w + b.w + GAP.across, -GAP.across), h = Math.max(...ms.map(b => b.h));
    return { ms, framed: !!f, w: f ? w + 20 + GAP.across : w, h: f ? h + pad.get(f) + 10 : h };
  });
  let rows = [...groupBy(boxes, b => tier.get(b.id)).entries()].sort((a, b) => a[0] - b[0]).map(([, bs]) => bs);
  const fitOf = rs => fit(rs.map(units), room);
  for (let t = 0; t < rows.length - 1; t++) {
    const here = new Set(rows[t].map(b => b.id)), next = rows[t + 1];
    if (next.some(b => [...here].some(id => strict.has(`${id}>${b.id}`)))) continue;
    const merged = [...rows.slice(0, t), [...rows[t], ...next], ...rows.slice(t + 2)];
    if (fitOf(merged) >= fitOf(rows)) rows = merged, t--;
  }
  // A box that only lines of another look rank from the tier over it sits in that tier, beside what ranks it,
  // where the chart is drawn no smaller for it.
  for (let t = 1; t < rows.length; t++) for (const b of [...rows[t]]) {
    const over = new Set(rows[t - 1].map(x => x.id)), here = new Set(rows[t].map(x => x.id)), ins = links.filter(l => l.to === b.id && over.has(l.from));
    if (!ins.length || ins.some(l => strict.has(`${l.from}>${l.to}`)) || links.some(l => l.to === b.id && here.has(l.from))) continue;
    const moved = rows.map((r, i) => i === t ? r.filter(x => x !== b) : i === t - 1 ? [...r, b] : r);
    if (moved[t].length && fitOf(moved) >= fitOf(rows)) rows = moved;
  }
  // A tier of frames, each ranking nothing outside it, too wide for the room is a column of them instead, where
  // that draws the chart larger.
  const wraps = [];
  for (let t = 0; t < rows.length; t++) {
    const us = units(rows[t]), free = us.filter(u => u.framed && u.ms.every(b => down.get(b.id).every(id => u.ms.some(m => m.id === id))));
    if (free.length < 2) continue;
    const fixed = us.filter(u => !free.includes(u)).flatMap(u => u.ms), column = [...rows.slice(0, t), [...fixed, ...free[0].ms], ...free.slice(1).map(u => u.ms), ...rows.slice(t + 1)];
    if (fitOf(column) <= fitOf(rows)) continue;
    rows = column;
    wraps.push(free.map(u => u.ms.map(b => b.id)));
    t += free.length - 1;
  }
  return { tier: new Map(rows.flatMap((bs, t) => bs.map(b => [b.id, t]))), wraps };
}
// How large rows would be drawn in a room, roughly: each row as wide as what's in it side by side, and as tall as
// its tallest, with the gaps the layout leaves. rows: lists of { w, h }.
function fit(rows, room) {
  const w = Math.max(...rows.map(us => us.reduce((w, u) => w + u.w + GAP.across, -GAP.across)));
  const h = rows.reduce((h, us) => h + Math.max(...us.map(u => u.h)) + GAP.down, -GAP.down);
  return Math.min(room.w / w, room.h / h);
}
// ELK lays the tiers out as rows, each given its place (see tiers), and orders and places what's in each. Ranking
// lines that run level aren't ELK's to place, but keep their boxes together: each set of boxes so joined, in one
// frame, is one block to ELK, they side by side in it (see lineUp), its lines meeting it where its boxes are.
function elkPlace(boxes, links, clusters, options, room) {
  const { tier, wraps } = tiers(boxes, links, room, clusters), K = 1e5, first = new Map();
  for (const c of [...clusters].reverse()) first.set(c.id, Math.min(...c.members.map(m => tier.get(m) ?? Infinity), ...clusters.filter(d => d.parent === c.id).map(d => first.get(d.id))));
  const topOf = id => id == null ? 0 : first.get(id);
  const home = new Map(clusters.flatMap(c => c.members.map(m => [m, c.id])));
  const ids = new Set(boxes.map(b => b.id)), ranked = links.filter(l => ids.has(l.from) && ids.has(l.to) && l.from !== l.to);
  // The blocks: boxes joined by level lines, within one frame; each box's place in its block.
  const block = new Map(boxes.map(b => [b.id, b.id])), find = id => block.get(id) === id ? id : find(block.get(id));
  const level = ranked.filter(l => tier.get(l.from) === tier.get(l.to) && home.get(l.from) === home.get(l.to));
  for (const l of level) block.set(find(l.to), find(l.from));
  // Deep branches first, so that ELK, where nothing else decides, sets them to the left, and what reaches least
  // far down to the right, where the Key goes under the chart.
  const below = new Map(), reach = id => {
    if (!below.has(id)) { below.set(id, tier.get(id)); below.set(id, Math.max(tier.get(id), ...ranked.filter(l => l.from === id && tier.get(l.to) > tier.get(id)).map(l => reach(l.to)))); }
    return below.get(id);
  };
  const deep = bs => Math.max(...bs.map(b => reach(b.id)));
  const blocks = [...groupBy(boxes, b => find(b.id)).values()].map(bs => lineUp(bs, level)).sort((a, b) => deep(b) - deep(a)), inBlock = new Map();
  // Boxes in a block 16 pt apart, or as far as the label of a line joining them needs (`room`), less what a
  // triangle's side gives, a quarter of its width in where the line meets it.
  const inset = g => g.shape === 'triangle' ? g.w / 4 : 0;
  const apart = (a, b) => Math.max(GAP.across, ...level.filter(l => (l.from === a.id && l.to === b.id) || (l.from === b.id && l.to === a.id)).map(l => (l.room ?? 0) - inset(a) - inset(b)));
  for (const bs of blocks) bs.reduce((x, b, i) => { inBlock.set(b.id, { block: bs, x }); return x + b.w + (i < bs.length - 1 ? apart(b, bs[i + 1]) : 0); }, 0);
  const widthOf = bs => inBlock.get(bs.at(-1).id).x + bs.at(-1).w;
  const nodeOf = id => inBlock.get(id).block.length > 1 ? `·blk:${inBlock.get(id).block[0].id}` : id;
  const root = { id: '·root', layoutOptions: { ...options, 'elk.layered.layering.strategy': 'INTERACTIVE', 'elk.layered.cycleBreaking.strategy': 'INTERACTIVE', 'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES' }, children: [], edges: [] }, node = new Map([[null, root]]);
  for (const c of clusters) node.set(c.id, { id: c.id, x: 0, y: (first.get(c.id) - topOf(c.parent)) * K, width: 1, height: 1, children: [],
    layoutOptions: { 'elk.padding': `[top=${c.top},left=10,bottom=10,right=10]`, 'elk.layered.layering.strategy': 'INTERACTIVE' } });
  for (const c of clusters) node.get(c.parent ?? null).children.push(node.get(c.id));
  blocks.forEach((bs, i) => {
    const w = widthOf(bs), h = Math.max(...bs.map(b => b.h)), n = { id: nodeOf(bs[0].id), x: i, y: (tier.get(bs[0].id) - topOf(home.get(bs[0].id))) * K, width: w, height: h };
    if (bs.length > 1) Object.assign(n, { layoutOptions: { 'elk.portConstraints': 'FIXED_POS' }, ports: bs.flatMap(b => [['n', 0, 'NORTH'], ['s', h, 'SOUTH']]
      .map(([k, y, side]) => ({ id: `${n.id}|${b.id}|${k}`, x: inBlock.get(b.id).x + b.w / 2, y, width: 1, height: 1, layoutOptions: { 'elk.port.side': side } }))) });
    node.get(home.get(bs[0].id) ?? null).children.push(n);
  });
  const end = (id, k) => inBlock.get(id).block.length > 1 ? `${nodeOf(id)}|${id}|${k}` : id, seen = new Set();
  ranked.forEach((l, i) => {
    const [s, t] = [end(l.from, 's'), end(l.to, 'n')], e = `${s}>${t}`;
    if (seen.has(e) || tier.get(l.from) >= tier.get(l.to)) return;
    seen.add(e);
    root.edges.push({ id: `·e${i}`, sources: [s], targets: [t] });
  });
  run(root);
  const at = new Map(), out = new Map();
  const walk = (n, ox, oy) => {
    for (const c of n.children ?? []) {
      const x = ox + (c.x ?? 0), y = oy + (c.y ?? 0);
      at.set(c.id, { x, y });
      walk(c, x, y);
    }
  };
  walk(root, 0, 0);
  for (const b of boxes) { const p = at.get(nodeOf(b.id)); out.set(b.id, { x: p.x + inBlock.get(b.id).x, y: p.y }); }
  // A tier's boxes top-aligned, as ELK sets them on their middles.
  for (const bs of groupBy(boxes, b => tier.get(b.id)).values()) { const y = Math.min(...bs.map(b => out.get(b.id).y)); for (const b of bs) out.get(b.id).y = y; }
  // Of the layout and its mirror image, the one that leaves the Key more room under the chart's right end, where
  // the page sets it when it isn't beside the title.
  if (room.key && !wraps.length) {
    const x0 = Math.min(...boxes.map(b => out.get(b.id).x)), x1 = Math.max(...boxes.map(b => out.get(b.id).x + b.w));
    const y0 = Math.min(...boxes.map(b => out.get(b.id).y)), y1 = Math.max(...boxes.map(b => out.get(b.id).y + b.h));
    const kw = room.key.w / Math.min(1, room.w / (x1 - x0), room.h / (y1 - y0)), xOf = (b, flip) => flip ? x0 + x1 - out.get(b.id).x - b.w : out.get(b.id).x;
    const rise = flip => Math.max(y0, ...boxes.filter(b => xOf(b, flip) + b.w > x1 - kw).map(b => out.get(b.id).y + b.h));
    if (rise(true) < rise(false) - 0.5) for (const b of boxes) out.get(b.id).x = xOf(b, true);
  }
  // A column of frames has them under one another from one left, 12 pt apart, as panels; the first stays where
  // ELK put it unless it's alone in its tier, and what's under the column comes up with it. What reaches into
  // them from above stands over their left, its middle 12 pt short of it, so its lines run down its side and
  // into each, where nothing else in its tier is in the way.
  const size = new Map(boxes.map(b => [b.id, b])), outer = id => { let f = home.get(id); while (f && node.get(f).parent) f = node.get(f).parent; return f; };
  for (const c of clusters) node.get(c.id).parent = c.parent;
  for (const column of wraps) {
    const alone = boxes.every(b => tier.get(b.id) !== tier.get(column[0][0]) || column[0].includes(b.id)), them = new Set(column.flat());
    const leftOf = ids => Math.min(...ids.map(id => out.get(id).x)), left = alone ? Math.min(...column.map(leftOf)) : leftOf(column[0]);
    for (const ids of column) { const dx = left - leftOf(ids); for (const id of ids) out.get(id).x += dx; }
    let up = 0;
    const first = tier.get(column[0][0]), over = boxes.filter(b => tier.get(b.id) === first - 1);
    column.reduce((bottom, ids) => {
      const f = outer(ids[0]), top = at.get(f).y, dy = (bottom ?? top) + (bottom === null ? 0 : 16) - top;
      for (const id of ids) out.get(id).y += dy;
      up = dy;
      return top + dy + node.get(f).height;
    }, alone && over.length ? Math.max(...over.map(b => out.get(b.id).y + b.h)) + 16 : null);
    const last = tier.get(column.at(-1)[0]);
    for (const b of boxes) if (tier.get(b.id) > last) out.get(b.id).y += up;
    for (const h of boxes.filter(b => !them.has(b.id) && ranked.some(l => l.from === b.id && them.has(l.to)))) {
      // With what it's joined to level in its tier after it.
      const row = [h, ...boxes.filter(b => tier.get(b.id) === tier.get(h.id) && ranked.some(l => l.from === h.id && l.to === b.id))];
      const x = left - 10 - 16 - h.w / 2, w = row.reduce((w, b) => w + b.w + 3 * GAP.across, -3 * GAP.across);
      if (boxes.some(b => !row.includes(b) && tier.get(b.id) === tier.get(h.id) && out.get(b.id).x < x + w + GAP.across && out.get(b.id).x + size.get(b.id).w + GAP.across > x)) continue;
      row.reduce((x, b) => { out.get(b.id).x = x; return x + b.w + 3 * GAP.across; }, x);
    }
  }
  return out;
}
// A block's boxes side by side, in the order of the level lines that join them: along them where they make a
// path, each line's upper end first; else out from the box with the most, alternately right and left.
function lineUp(bs, level) {
  if (bs.length < 2) return bs;
  const ids = new Set(bs.map(b => b.id)), by = new Map(bs.map(b => [b.id, b])), near = new Map(bs.map(b => [b.id, []]));
  for (const l of level) if (ids.has(l.from) && ids.has(l.to)) { near.get(l.from).push(l.to); near.get(l.to).push(l.from); }
  for (const [id, ns] of near) near.set(id, [...new Set(ns)]);
  const seen = new Set(), row = [];
  if (bs.every(b => near.get(b.id).length <= 2)) {
    const ends = bs.filter(b => near.get(b.id).length < 2);
    for (let id = (ends.find(b => level.some(l => l.from === b.id && ids.has(l.to))) ?? ends[0] ?? bs[0]).id; id && !seen.has(id); id = near.get(id).find(n => !seen.has(n))) { seen.add(id); row.push(by.get(id)); }
    return row.length === bs.length ? row : bs;
  }
  const hub = bs.reduce((a, b) => near.get(b.id).length > near.get(a.id).length ? b : a), left = [], right = [];
  seen.add(hub.id);
  const out = (id, side) => { for (const n of near.get(id)) if (!seen.has(n)) { seen.add(n); const s = side ?? (right.length <= left.length ? right : left); s.push(by.get(n)); out(n, s); } };
  out(hub.id, null);
  return [...left.reverse(), hub, ...right, ...bs.filter(b => !seen.has(b.id))];
}
// Boxes in rows by rank, each a step below everything that ranks it (a box in a loop, in the top row), left to
// right in the order given.
function rows(boxes, links) {
  const below = new Map(boxes.map(b => [b.id, []])), over = new Map(boxes.map(b => [b.id, 0])), rank = new Map();
  for (const l of links) if (below.has(l.from) && below.has(l.to) && l.from !== l.to) { below.get(l.from).push(l.to); over.set(l.to, over.get(l.to) + 1); }
  const ready = boxes.filter(b => !over.get(b.id)).map(b => b.id);
  for (const id of ready) for (const to of below.get(id)) {
    rank.set(to, Math.max(rank.get(to) ?? 0, (rank.get(id) ?? 0) + 1));
    over.set(to, over.get(to) - 1);
    if (!over.get(to)) ready.push(to);
  }
  const out = new Map(), byRank = groupBy(boxes, b => over.get(b.id) ? 0 : rank.get(b.id) ?? 0);
  let y = 0;
  for (const r of [...byRank.keys()].sort((a, b) => a - b)) {
    let x = 0;
    for (const b of byRank.get(r)) { out.set(b.id, { x, y }); x += b.w + GAP.across; }
    y += Math.max(...byRank.get(r).map(b => b.h)) + GAP.down;
  }
  return out;
}

// A grid of rects, for finding what's near a place without looking at everything: near(r) gives the
// indexes, in order, of every rect that could touch r; any(r, f), whether f holds for any of them. A rect
// with no finite place or size is nowhere.
function grid(rects, size = 96) {
  const cells = new Map(), cell = v => Math.floor(v / size);
  const each = (r, f) => {
    if (![r.x, r.y, r.w, r.h].every(Number.isFinite)) return false;
    for (let i = cell(r.x); i <= cell(r.x + r.w); i++) for (let j = cell(r.y); j <= cell(r.y + r.h); j++) if (f(i * 100003 + j)) return true;
    return false;
  };
  const g = {
    add(r, k) { each(r, c => { (cells.get(c) ?? cells.set(c, []).get(c)).push(k); }); },
    near(r) { const out = new Set(); each(r, c => { for (const k of cells.get(c) ?? []) out.add(k); }); return [...out].sort((a, b) => a - b); },
    any: (r, f) => each(r, c => cells.get(c)?.some(f)),
  };
  rects.forEach((r, k) => g.add(r, k));
  return g;
}
// Things sorted by a number of each, f, to find those whose number is within r of v, as sorted(list, f)(v, r)
// gives them: in the order given.
function sorted(list, f) {
  const at = list.map((x, i) => [f(x), i]).sort((a, b) => a[0] - b[0]);
  return (v, r) => {
    let lo = 0, hi = at.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (at[m][0] < v - r) lo = m + 1; else hi = m; }
    const out = [];
    for (let i = lo; i < at.length && at[i][0] <= v + r; i++) out.push(at[i][1]);
    return out.sort((a, b) => a - b).map(i => list[i]);
  };
}
// A segment's bounding rect.
const span = ([a, b]) => ({ x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(a[0] - b[0]), h: Math.abs(a[1] - b[1]) });
const meets = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// ---- What's drawn, as obstacles ----

// A box's outline as a convex polygon: a triangle's, a diamond's, an oval's as a 24-gon; any other shape's
// bounding rect, which holds it.
function hull(g) {
  const { x, y, w, h } = g;
  if (g.shape === 'triangle') return [[x + w / 2, y], [x + w, y + h], [x, y + h]];
  if (g.shape === 'diamond') return [[x + w / 2, y], [x + w, y + h / 2], [x + w / 2, y + h], [x, y + h / 2]];
  if (g.shape === 'oval') return Array.from({ length: 24 }, (_, i) => [x + w / 2 + w / 2 * Math.cos(i * Math.PI / 12), y + h / 2 + h / 2 * Math.sin(i * Math.PI / 12)]);
  return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
}
// How deep two convex polygons (a segment is one of two points) run into each other: the least distance either
// must move along an axis that could part them to come apart; at most 0 where they don't meet. Separating
// axes, as collision detection finds it.
function depth(P, Q) {
  let least = Infinity;
  for (const S of [P, Q]) for (let i = 0; i < S.length; i++) {
    const [ax, ay] = S[i], [bx, by] = S[(i + 1) % S.length], nx = ay - by, ny = bx - ax, len = Math.hypot(nx, ny);
    if (len < 1e-9) continue;
    const on = ps => ps.map(([px, py]) => (px * nx + py * ny) / len), p = on(P), q = on(Q);
    least = Math.min(least, Math.max(...p) - Math.min(...q), Math.max(...q) - Math.min(...p));
    if (least <= 0) return least;
  }
  return least;
}
// A rect as a polygon, grown by `pad` all round.
const corners = (r, pad = 0) => [[r.x - pad, r.y - pad], [r.x + r.w + pad, r.y - pad], [r.x + r.w + pad, r.y + r.h + pad], [r.x - pad, r.y + r.h + pad]];
// Whether a segment runs through a box's inside, more than a hair: along its outline, or ending on it, isn't.
const SKIN = 0.75;
const through = (g, a, b) => Math.max(a[0], b[0]) > g.x && Math.min(a[0], b[0]) < g.x + g.w && Math.max(a[1], b[1]) > g.y && Math.min(a[1], b[1]) < g.y + g.h
  && depth([a, b], hull(g)) > SKIN;
// The obstacles a route mustn't enter: the boxes it doesn't end at, and the rects of `avoid` (frames' captions).
// → the first point of a route inside one, as { at, what }, or null.
function blockedRoute(ps, own, solid, avoid, near) {
  for (let i = 1; i < ps.length; i++) {
    const a = ps[i - 1], b = ps[i], r = span([a, b]);
    for (const k of near.boxes(r)) { const g = solid[k]; if (!own.has(g.id) && through(g, a, b)) return { at: i, what: g.id }; }
    for (const k of near.avoid(r)) { const q = avoid[k]; if (depth([a, b], corners(q)) > SKIN) return { at: i, what: 'caption' }; }
  }
  return null;
}

// Every box's position. Entered ones stand, and in a preview, so do the rest of the boxes it had (`keep`,
// the view's positions as last drawn): only what the preview adds is placed, roughly, and ELK isn't asked.
// With none standing, ELK's layout, where the page will put it (see Scene's page). With some, each other box
// goes beside its relatives: in the row of the boxes that share them (a new owner among the owners of what it
// owns), or between rows, at the nearest place that's clear of every box, shape and line it isn't on, and,
// where `bounds` is given (a preview's page, which stays as it was), on it. Worked out again only when what it
// reads changes.
// boxes: [{ id, w, h, shape }]; links: the ranking lines { from, to }; lines: every line { id, from, to,
// trunk, straight }, to route among the boxes already placed; obstacles: free shapes' rects.
const arranged = keeping();
function arrange(a) {
  const { boxes, links, clusters, entered, page, lines = [], obstacles = [], keep = null, bounds = null } = a;
  const at = m => m && [...m].map(([id, p]) => [id, p.x, p.y]);
  return arranged(JSON.stringify([boxes.map(b => [b.id, b.w, b.h, b.shape, b.class ?? null]), links.map(l => [l.from, l.to, l.trunk, l.room ?? 0]), clusters.map(c => [c.id, c.parent, c.members, c.top]),
    at(entered), page.margin, page.room && [page.room.w, page.room.h, page.room.key?.w, page.room.key?.h], lines.map(l => [l.id, l.from, l.to, l.trunk, l.straight]), obstacles.map(o => [o.x, o.y, o.w, o.h]), at(keep), bounds && [bounds.w, bounds.h]]), () => arranging(a));
}
function arranging({ boxes, links, clusters, entered, page, lines = [], obstacles = [], keep = null, bounds = null }) {
  const out = new Map();
  for (const b of boxes) { const p = entered.get(b.id) ?? keep?.get(b.id); if (p) out.set(b.id, { x: p.x, y: p.y }); }
  const rest = boxes.filter(b => !out.has(b.id));
  if (!rest.length) return out;
  const ups = groupBy(links, l => l.to), downs = groupBy(links, l => l.from);
  const at = keep && out.size ? rough(boxes, ups, downs, out) : place({ boxes, links, clusters, room: page.room }), size = new Map(boxes.map(b => [b.id, b]));
  if (!out.size) return new Map(boxes.map(b => [b.id, { ...at.get(b.id) }]));
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
  const placedBoxes = [...geo.values()], nearBoxes = grid(placedBoxes), nearShapes = grid(obstacles), nearSegs = grid(segs.map(span));
  const wide = (p, gx, gy) => ({ x: p.x - gx, y: p.y - gy, w: p.w + 2 * gx, h: p.h + 2 * gy }), m = page.margin;
  const within = p => !bounds || (p.x + p.w <= bounds.w - m / 2 && p.y + p.h <= bounds.h - m / 2);
  const clear = p => p.x >= m / 2 && p.y >= m / 2 && within(p) && !nearBoxes.any(wide(p, 16, 24), i => !apart(p, placedBoxes[i], 16, 24))
    && !nearShapes.any(wide(p, 16, 16), i => !apart(p, obstacles[i], 16, 16)) && !nearSegs.any(wide(p, 8, 8), i => meets(p, segs[i], 8));
  const linked = (id, dir) => [...new Set((dir === 'down' ? downs.get(id)?.map(l => l.to) : ups.get(id)?.map(l => l.from)) ?? [])];
  for (const b of rest.sort((a, c) => at.get(a.id).y - at.get(c.id).y || at.get(a.id).x - at.get(c.id).x)) {
    const kids = linked(b.id, 'down').filter(id => geo.has(id)), parents = linked(b.id, 'up').filter(id => geo.has(id));
    const near = [...kids, ...parents];
    const [dx, dy] = near.length ? shift(near.filter(id => out.has(id) && at.has(id))) : all;
    const x0 = at.get(b.id).x + (Number.isFinite(dx) ? dx : all[0]), y0 = at.get(b.id).y + (Number.isFinite(dy) ? dy : all[1]);
    const cx = near.length ? near.reduce((s, id) => s + geo.get(id).x + geo.get(id).w / 2, 0) / near.length : x0 + b.w / 2;
    // The row of the boxes that share its relatives, and the rows between it and them: halfway, or as near
    // halfway as clears the lines that run there.
    const sibs = [...new Set([...kids.flatMap(id => linked(id, 'up')), ...parents.flatMap(id => linked(id, 'down'))])].filter(id => id !== b.id && geo.has(id)).map(id => geo.get(id));
    const sib = sibs.sort((p, q) => Math.abs(p.x + p.w / 2 - cx) - Math.abs(q.x + q.w / 2 - cx))[0];
    const rows = [];
    if (sib) rows.push({ y: sib.y, cost: 0 });
    rows.push({ y: y0, cost: 120 });
    const between = (lo, hi) => { const mid = (lo + hi - b.h) / 2; for (let y = lo + 24; y <= hi - 24 - b.h; y += 8) rows.push({ y, cost: 120 + Math.abs(y - mid) * 0.5 }); rows.push({ y: mid, cost: 120 }); };
    if (kids.length) { const top = Math.min(...kids.map(id => geo.get(id).y)); between(sib ? sib.y + sib.h : top - b.h - 96, top); }
    if (parents.length) { const bottom = Math.max(...parents.map(id => geo.get(id).y + geo.get(id).h)); between(bottom, sib ? sib.y : bottom + b.h + 96); }
    // On a page that stays as it is, any row on it, nearest first, where none near its relatives is clear.
    if (bounds) for (let y = m / 2; y <= bounds.h - m / 2 - b.h; y += 24) rows.push({ y, cost: 240 + Math.abs(y - y0) * 0.5 });
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
    const p = best ?? { x: Math.max(m, bounds ? Math.min(x0, bounds.w - m - b.w) : x0), y: Math.max(m, bounds ? Math.min(y0, bounds.h - m - b.h) : y0), w: b.w, h: b.h };
    geo.set(b.id, { id: b.id, x: p.x, y: p.y, w: b.w, h: b.h, shape: b.shape });
    nearBoxes.add(geo.get(b.id), placedBoxes.push(geo.get(b.id)) - 1);
    out.set(b.id, { x: p.x, y: p.y });
  }
  return out;
}
// Where the boxes not yet placed would go, roughly, in place of ELK's layout: a row below what ranks a box,
// or above what it ranks, nearest relatives first; a box related to nothing placed, in a row under all.
function rough(boxes, ups, downs, out) {
  const at = new Map(out), size = new Map(boxes.map(b => [b.id, b]));
  for (let left = boxes.filter(b => !at.has(b.id)); left.length;) {
    const next = left.filter(b => {
      const parents = (ups.get(b.id) ?? []).map(l => l.from).filter(id => at.has(id)), kids = (downs.get(b.id) ?? []).map(l => l.to).filter(id => at.has(id));
      const near = parents.length ? parents : kids;
      if (!near.length) return true;
      const cx = near.reduce((s, id) => s + at.get(id).x + size.get(id).w / 2, 0) / near.length;
      at.set(b.id, { x: cx - b.w / 2, y: parents.length ? Math.max(...parents.map(id => at.get(id).y + size.get(id).h)) + 64 : Math.min(...kids.map(id => at.get(id).y)) - 64 - b.h });
      return false;
    });
    if (next.length === left.length) {
      const y = Math.max(...[...at].map(([id, p]) => p.y + size.get(id).h)) + 64;
      next.reduce((x, b) => { at.set(b.id, { x, y }); return x + b.w + 24; }, 0);
      break;
    }
    left = next;
  }
  return at;
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

// Routes each line: { id, from, to, trunk, straight, label: { w, h, base, shared, text } }, `trunk` naming its
// relation, from its Above side to the other, gains `points`, `labelAt` (the label's top left) and `down`
// (whether it runs down from its Above side, so an arrowhead would say nothing). A line going down (or up)
// leaves its box's bottom (or top), turns along a lane just past it, and drops onto the box it reaches, where
// lines arrive spread across the top in the order of where they start, so they don't cross there.
// - A triangle's apex takes the chart's main relation, ownership, all its lines meeting there. A line of
//   another, like a general partner's, comes down beside it and meets its side at mid-height, the lane it
//   comes along kept 16 pt clear of the apexes it passes; where the box it leaves sits too close above for
//   that, its trunk leaves the box's side instead.
// - Lines of one relation from one box share a trunk: they leave it together and fan out along one lane.
//   Trunks of different relations leave a box apart, spread along its edge in the order of where they go.
// - Trunks leaving boxes level with each other turn along lanes stacked in the space below them, 12 pt
//   apart, in the order that crosses the fewest of the others' lines, as channel routing does; trunks that
//   don't overlap share a lane. Under the lowest, the room the labels of what they reach take; a gap too
//   shallow for all that says what it `lack`s, for the boxes under it to move down by (see Scene's deepen).
// - Boxes level with each other are joined side to side (a triangle's at its mid-height, where it can be),
//   unless another box is in the way; then the line goes under the boxes between, on a lane of its own, and
//   comes up into the far box's bottom.
// - A line landing on a frame (see land) beside the box it leaves runs down that box's spine and into the
//   frame's near side.
// - No route runs through a box it doesn't end at, or through what `avoid` holds (frames' captions): one that
//   would goes `around`.
// Labels go only on their own lines, where nothing else is drawn (see placeLabels); one that can't is
// `crowded`. Routes are kept by what they read: the boxes, the lines and their labels, the frames and what to
// avoid.
const routes = keeping();
const ROUTED = ['from', 'to', 'points', 'labelAt', 'down', 'landed', 'around', 'astray', 'blocked', 'crowded', 'quiet', 'lane', 'apex', 'crowd', 'kin', 'lack'];
function route(geo, lines, opts = {}) {
  const k = JSON.stringify([[...geo.values()].map(g => [g.id, g.x, g.y, g.w, g.h, g.shape]), opts.frames?.map(f => [f.id, f.x, f.y, f.w, f.h, f.members, f.depth]), opts.labels,
    opts.avoid?.map(r => [r.x, r.y, r.w, r.h]), lines.map(l => [l.id, l.from, l.to, l.trunk, l.straight, l.arrow, l.label && [l.label.w, l.label.h, l.label.base, l.label.shared, l.label.text]])]);
  const out = routes(k, () => { routing(geo, lines, opts); return lines.map(l => Object.fromEntries(ROUTED.map(p => [p, l[p]]))); });
  lines.forEach((l, i) => Object.assign(l, out[i]));
}
function routing(geo, lines, { frames = [], labels = true, avoid = [] } = {}) {
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
  // Where nothing stands over (or under) a box between it and the lanes its lines come along, 6 pt past the
  // boxes they come from: the widest stretch of its edge clear of what does, 6 pt either side; or null where
  // nothing stands there.
  const clearOf = (t, ls, top) => {
    const from = top ? Math.max(...ls.map(l => G(l.from).y + G(l.from).h)) + 8 : Math.min(...ls.map(l => G(l.from).y)) - 8;
    const [y0, y1] = top ? [from, t.y] : [t.y + t.h, from], own = new Set([t.id, ...ls.map(l => l.from)]);
    const over = [...geo.values()].filter(g => g.shape !== 'frame' && !own.has(g.id) && g.y < y1 && g.y + g.h > y0 && g.x < t.x + t.w && g.x + g.w > t.x)
      .map(g => [g.x - 8, g.x + g.w + 8]).sort((a, b) => a[0] - b[0]);
    if (!over.length) return null;
    let best = [t.x, t.x], x = t.x;
    for (const [a, b] of [...over, [t.x + t.w, t.x + t.w]]) { if (a - x > best[1] - best[0]) best = [x, a]; x = Math.max(x, b); }
    return best[1] > best[0] ? best : null;
  };
  for (const ls of groupBy(arriving, l => `${l.to}|${l.dir === 'down' ? 'top' : 'bottom'}`).values()) {
    const t = G(ls[0].to), start = l => l.sx ?? centerX(G(l.from));
    ls.sort((p, q) => start(p) - start(q));
    // Room after each drop for its label, which sits right of it, and 12 pt clear of the next one's.
    const levels = ls.length > 4 ? 3 : 2, xs = arrivals(t, ls.map(start), ls.map(l => l.label ? l.label.w + 4 + 16 : 14), clearOf(t, ls, ls[0].dir === 'down'));
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
  // each time the one whose place there crosses the fewest of those left. A line that would drop from its lane
  // through a box goes around it instead (see below), and its trunk's lane `lands` only the rest.
  const solids = [...geo.values()].filter(g => g.shape !== 'frame');
  for (const t of trunks) {
    const s = G(t.from), drop = l => t.dir === 'down' ? [[l.tx, s.y + s.h + 8], [l.tx, l.ty]] : [[l.tx, l.ty], [l.tx, s.y - 8]];
    t.lands = t.ls.filter(l => l.flank || !solids.some(g => g.id !== l.from && g.id !== l.to && through(g, ...drop(l))));
    const xs = [t.x, ...t.lands.map(l => l.tx)];
    t.span = [Math.min(...xs), Math.max(...xs)];
  }
  const within = (x, [a, b]) => x > a + 0.5 && x < b - 0.5;
  const crossings = (near, far) => within(far.x, near.span) + near.lands.filter(l => within(l.tx, far.span)).length;
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
  // line meeting a triangle's side, 16 pt clear of its apex; and a lane over other lines' drops, as far short
  // of where they arrive as their labels need.
  const room = l => l.label ? l.label.h + 5.3 + 4 : 0, short = l => l.flank ? CLEAR : Math.max(STEM, room(l));
  const landing = trunks.filter(t => t.dir === 'down').flatMap(t => t.lands).filter(l => !l.flank && l.label);
  const over = t => landing.filter(a => !t.ls.includes(a) && within(a.tx, t.span) && a.ty > t.edge).map(a => a.ty - room(a));
  // Level runs already fixed, which a lane keeps 12 pt from where they overlap: a trunk's along its box's
  // side, and a line from side to side.
  const fixed = [...trunks.filter(t => t.flankSide).map(t => ({ y: t.laneY, x0: t.span[0], x1: t.span[1] })),
    ...lines.filter(l => l.dir === 'side' && l.y !== undefined).map(l => { const xs = [G(l.from), G(l.to)].flatMap(g => [g.x, g.x + g.w]).sort((a, b) => a - b); return { y: l.y, x0: xs[1], x1: xs[2] }; })];
  // A gap too shallow for its lanes, a lane each 8 pt past the boxes they leave and 15 pt apart, and the room
  // under the lowest, is short by what it `lack`s: { top, bottom, by }, the gap's top and bottom and how much
  // deeper it must be, for the boxes from its bottom down to move down by (see Scene's deepen).
  for (const l of lines) l.lack = null;
  for (const t of trunks) {
    const s = G(t.from), lanes = laneOf.get(t)?.lanes ?? 1, ls = t.lands.length ? t.lands : t.ls;
    if (t.flankSide) {
      // Already placed, along the box's side.
    } else if (t.dir === 'down') {
      const limit = Math.min(...ls.map(l => l.ty - short(l)), ...over(t)) - LANE * (lanes - 1 - t.lane), floor = t.edge + 8 + LANE * t.lane;
      t.laneY = Math.max(floor, Math.min(t.edge + 18 + LANE * t.lane, limit));
      for (const f of fixed) {
        if (Math.min(f.x1, t.span[1]) - Math.max(f.x0, t.span[0]) < 4 || Math.abs(t.laneY - f.y) >= LANE) continue;
        if (f.y + LANE <= limit) t.laneY = f.y + LANE;
        else if (f.y - LANE >= floor) t.laneY = f.y - LANE;
      }
      if (t.lands.length && floor > limit + 0.25) t.lack = { top: t.edge, bottom: Math.min(...ls.map(l => G(l.to).y)), by: floor - limit };
    } else if (s.shape !== 'triangle') {
      const limit = Math.max(...ls.map(l => l.ty + short(l))) + LANE * (lanes - 1 - t.lane), floor = t.edge - 8 - LANE * t.lane;
      t.laneY = Math.min(floor, Math.max(t.edge - 18 - LANE * t.lane, limit));
      if (t.lands.length && floor < limit - 0.25) t.lack = { top: Math.max(...ls.map(l => G(l.to).y + G(l.to).h)), bottom: t.edge, by: limit - floor };
    }
    for (const l of t.ls) l.lack = t.lack ?? null;
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
    // Boxes that touch are joined where they touch, by a line of no length.
    if (l.points.length === 1) l.points.push([...l.points[0]]);
    if (l.points.length === 3 && Math.abs(l.points[0][0] - l.points[2][0]) < 1) l.points = [l.points[0], l.points[2]];
    const [a, b] = [l.points[0], l.points[l.points.length - 1]];
    l.down = l.dir === 'down' || l.dir === 'ell' || ((l.dir === 'straight' || l.dir === 'stub') && b[1] > a[1] + 1);
  }
  // No route runs through a box it doesn't end at, or through a frame's caption: one that would is found again
  // around what's drawn (see around), from where it leaves its box to where it meets the other, as it would
  // have, or else, `astray`, from and to any side; crossing the other lines rather than running along them;
  // 9 pt clear of the boxes, or 2 pt where the gaps are narrower. One with no way at all is `blocked`.
  const solid = [...geo.values()].filter(g => g.shape !== 'frame'), nearSolid = grid(solid), nearAvoid = grid(avoid);
  const near = { boxes: r => nearSolid.near(r), avoid: r => nearAvoid.near(r) };
  const legsOf = l => (l.points ?? []).slice(1).map((p, i) => [l.points[i], p]);
  for (const l of lines) {
    l.around = false; l.astray = false; l.blocked = false;
    if (!l.points || l.points.length < 2 || !blockedRoute(l.points, new Set([l.from, l.to]), solid, avoid, near)) continue;
    const port = (p, q, at) => { const dx = Math.sign(Math.round(p[0] - q[0])), dy = Math.sign(Math.round(p[1] - q[1])), dir = dy < 0 ? 0 : dx > 0 ? 1 : dy > 0 ? 2 : 3, [ux, uy] = [[0, -1], [1, 0], [0, 1], [-1, 0]][dir];
      return pad => ({ at, out: [at[0] + ux * (pad + 0.25), at[1] + uy * (pad + 0.25)], dir }); };
    const ps = l.points, n = ps.length, first = port(ps[1], ps[0], ps[0]), last = port(ps[n - 2], ps[n - 1], ps[n - 1]);
    const segs = lines.filter(o => o !== l).flatMap(legsOf), clear = way => way && !blockedRoute(way, new Set([l.from, l.to]), solid, avoid, near);
    let way = null, astray = false;
    for (const [pad, own] of [[12, true], [2.7, true], [8, false], [2.7, false]]) {
      const w = around(geo, l.from, l.to, { avoid, segs, pad, ports: own ? { from: [first(pad)], to: [last(pad)] } : null });
      if (clear(w)) { way = w; astray = !own; break; }
    }
    if (way) Object.assign(l, { points: way, around: true, astray, apex: false, down: way.at(-1)[1] > way[0][1] + 1 });
    else l.blocked = true;
  }
  if (!labels) return;
  // A trunk whose lines all say the same thing, like a GP's to each of its funds, says it once, on its lane: the
  // rest are `quiet`, and all of them `kin`, one route to their label.
  for (const l of lines) { l.quiet = false; l.lane = null; l.kin = null; }
  for (const t of trunks) {
    if (t.ls.length < 2 || t.laneY === undefined || t.ls.some(l => l.around) || !t.ls.every(l => l.label?.shared) || new Set(t.ls.map(l => l.label.text)).size > 1) continue;
    t.ls.slice(1).forEach(l => { l.labelAt = null; l.quiet = true; });
    t.ls.forEach(l => { l.kin = t.ls[0].id; });
    // (Where it's drawn, to the quarter pixel, as its route is.)
    const xs = t.flankSide ? [t.x, ...t.ls.map(l => l.gx)] : [t.span[0], t.span[1]], q = v => Math.round(v * 4) / 4;
    t.ls[0].lane = { y: q(t.laneY), x0: q(Math.min(...xs)), x1: q(Math.max(...xs)), from: q(t.x) };
  }
  // Lines drawn one over another, landing on one frame, say it once.
  for (const ls of groupBy(lines.filter(l => l.landed), l => `${l.from}|${l.to}|${l.trunk}`).values()) {
    ls.slice(1).forEach(l => { l.labelAt = null; l.quiet = true; });
    ls.forEach(l => { l.kin ??= ls[0].id; });
  }
  placeLabels(geo, lines.filter(l => !l.quiet), lines, [], avoid);
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
function arrivals(t, starts, after = [], clear = null) {
  const n = starts.length, m = Math.min(12, t.w / 4), [x0, x1] = clear ?? [t.x, t.x + t.w];
  const lo = Math.max(t.x + m, x0), hi = Math.max(lo, Math.min(t.x + t.w - m, x1));
  const even = starts.map((_, i) => x0 + (x1 - x0) * (i + 1) / (n + 1));
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
// place isn't free, the label steps away from what it reaches, a line's height at a time, as far as the leg
// goes; then it looks along its lane, or beside its longest legs; and then anywhere beside its route, on either
// side, from the end it reaches back. A place is free where the label is on its own line, and on nothing else:
// its route (or its kin's, the lines it's said once for) within 4 pt of it, no other line within 4 pt and no
// line through it; and no box, caption or other label within 3 pt of its words' ends, or 1 pt of the leading
// over and under them, as its ink is 3 pt from them there too. The first free place 8 pt from every other label
// wins, or else the first free one. Where none is free the label is `crowded`, and goes where it covers no box,
// caption or label, beside its own line where it can, with the fewest lines near or through it; and only where
// there's no such place, where it covers least. `taken`: labels already placed, which stay where they are;
// `avoid`: what else no label may cover, frames' captions; `keep`: a label stays where it is while that's still
// free, as when its words are set again a little larger or smaller.
const APART = 32 / 3, ON = 16 / 3, CLEAR_LABEL = { x: 4 - 1 / 4, y: 4 / 3 };
// How far a rect is from a segment: 0 where they meet. Two convex shapes apart are nearest at a corner of one.
function gap(r, a, b) {
  if (a[0] === b[0] || a[1] === b[1]) return Math.hypot(Math.max(0, r.x - Math.max(a[0], b[0]), Math.min(a[0], b[0]) - r.x - r.w), Math.max(0, r.y - Math.max(a[1], b[1]), Math.min(a[1], b[1]) - r.y - r.h));
  const box = corners(r);
  if (depth([a, b], box) > 0) return 0;
  const toRect = ([x, y]) => Math.hypot(Math.max(0, r.x - x, x - r.x - r.w), Math.max(0, r.y - y, y - r.y - r.h));
  const toSeg = ([x, y]) => { const dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy))); return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy); };
  return Math.min(toRect(a), toRect(b), ...box.map(toSeg));
}
function placeLabels(geo, lines, all = lines, taken = [], avoid = [], keep = false) {
  const boxes = [...geo.values()].filter(b => b.shape !== 'frame'), hulls = boxes.map(hull), placed = [];
  const segs = all.flatMap(l => (l.points ?? []).slice(1).map((p, i) => ({ l, a: l.points[i], b: p })));
  const nearBoxes = grid(boxes), nearSegs = grid(segs.map(s => span([s.a, s.b]))), nearPlaced = grid([]), nearAvoid = grid(avoid);
  for (const r of taken) nearPlaced.add(r, placed.push(r) - 1);
  const grow = (r, dx, dy = dx) => ({ x: r.x - dx, y: r.y - dy, w: r.w + 2 * dx, h: r.h + 2 * dy });
  const area = (r, q) => Math.max(0, Math.min(r.x + r.w, q.x + q.w) - Math.max(r.x, q.x)) * Math.max(0, Math.min(r.y + r.h, q.y + q.h) - Math.max(r.y, q.y));
  for (const l of lines) {
    const ps = l.points, lab = l.label, at = keep && l.labelAt;
    l.labelAt = null; l.crowded = false;
    if (!lab || !ps || ps.length < 2) continue;
    const w = lab.w, h = lab.h, legs = ps.slice(1).map((p, i) => ({ a: ps[i], b: p, len: Math.hypot(p[0] - ps[i][0], p[1] - ps[i][1]) }));
    // Its own route: its line's, and its kin's.
    const self = l.kin == null ? new Set([l]) : new Set(all.filter(o => o === l || o.kin === l.kin));
    const own = segs.filter(s => self.has(s.l));
    // Where it was, set again larger or smaller than it was placed (`size`): the sides of it that face its route
    // stay where they were.
    const was = at && (() => {
      const r = { ...at, ...(l.size ?? lab) }, g = own.reduce((m, s) => { const d = gap(r, s.a, s.b); return d < m.d ? { d, s } : m; }, { d: Infinity }).s;
      return { x: g && Math.min(g.a[0], g.b[0]) >= r.x + r.w ? r.x + r.w - w : r.x, y: g && Math.min(g.a[1], g.b[1]) >= r.y + r.h ? r.y + r.h - h : r.y };
    })();
    const upright = g => Math.abs(g.a[0] - g.b[0]) < 1, level = g => Math.abs(g.a[1] - g.b[1]) < 1, last = legs[legs.length - 1];
    // The label's last baseline sits `base` below its top.
    const base = lab.base ?? h * 0.8;
    // The places, in the order they're preferred.
    function* spots() {
      if (was) yield was;
      // A label said once for a trunk sits by its lane, 4 pt above it (or below, where its box is too near), 8 pt
      // along from where it leaves its box, on the side it runs further first, stepping on past a line in the
      // way; or else along the lane.
      if (l.lane) {
        const { x0, x1, from, y } = l.lane, along = 10.7, sides = [from - x0, x1 - from];
        for (const top of [y - 5.3 - h, y + 4]) {
          for (const k of sides[0] > sides[1] ? [0, 1] : [1, 0])
            for (let d = along; d + w <= sides[k] && d <= along + 120; d += 12) yield { x: k ? from + d : from - d - w, y: top };
        }
        for (const f of [0.5, 0.3, 0.7, 0.15, 0.85]) yield { x: x0 + (x1 - x0) * f - w / 2, y: y - 5.3 - h };
      }
      // Lines that meet at an apex share its last leg; one that joins it along a lane says what it says on
      // the lane, just short of where it joins.
      const join = legs.length > 1 && l.apex && l.crowd > 1 && !upright(legs[legs.length - 2]) ? legs[legs.length - 2] : null;
      if (join) {
        const fromLeft = join.b[0] > join.a[0], x = fromLeft ? join.b[0] - w - 6 : join.b[0] + 6;
        yield { x, y: join.b[1] - h - 2 };
        yield { x, y: join.b[1] + 3 };
      }
      if (upright(last)) {
        const down = last.b[1] > last.a[1], x = last.b[0] + 4, [top, bottom] = down ? [last.a[1], last.b[1]] : [last.b[1], last.a[1]];
        const y0 = down ? last.b[1] - 5.3 - base : last.b[1] + 5.3;
        for (let k = 0, y = y0; k < 4 && y + h > top && y < bottom; k++, y = down ? y0 - k * (h + 2) : y0 + k * (h + 2)) yield { x, y };
      } else {
        const tipped = l.arrow === 'end' || l.arrow === 'both' || (l.arrow === 'auto' && !l.down);
        const leftward = last.b[0] < last.a[0], y = last.b[1], pad = 6 + (tipped ? 8 : 0);
        for (let k = 0; k < 3; k++) yield { x: leftward ? last.b[0] + pad + k * 12 : last.b[0] - pad - w - k * 12, y: y - h - 2 };
        yield { x: leftward ? last.b[0] + pad : last.b[0] - pad - w, y: y + 3 };
      }
      for (const g of [...legs].sort((p, q) => q.len - p.len).slice(0, 2)) {
        for (const f of [0.5, 0.3, 0.7]) {
          const x = g.a[0] + (g.b[0] - g.a[0]) * f, y = g.a[1] + (g.b[1] - g.a[1]) * f;
          yield upright(g) ? { x: x + 4, y: y - h / 2 } : { x: x - w / 2, y: y - h - 2 };
        }
        // Across a short leg, the label may hang past either end of it, above or below.
        if (!upright(g)) {
          const [x0, x1] = [Math.min(g.a[0], g.b[0]), Math.max(g.a[0], g.b[0])], y = g.a[1];
          for (const s of [{ x: x0, y: y - h - 2 }, { x: x1 - w, y: y - h - 2 }, { x: (x0 + x1 - w) / 2, y: y + 3 }, { x: x0, y: y + 3 }, { x: x1 - w, y: y + 3 }]) yield s;
        }
      }
      // Anywhere beside the route, every 3 pt along each leg from the end it reaches back: right of an upright
      // leg, then left; over a level one, then under, hanging past its ends as far as its width.
      for (const g of [...legs].reverse()) {
        if (upright(g)) {
          const dir = Math.sign(g.b[1] - g.a[1]) || 1;
          for (let d = 0; d <= g.len; d += 4) for (const x of [g.b[0] + 4, g.b[0] - 4 - w]) yield { x, y: g.b[1] - dir * d - h / 2 };
        } else if (level(g)) {
          const dir = Math.sign(g.b[0] - g.a[0]) || 1;
          for (let d = -w / 2; d <= g.len + w / 2; d += 4) for (const y of [g.b[1] - h - 2, g.b[1] + 3]) yield { x: g.b[0] - dir * d - w / 2, y };
        }
      }
    }
    // What a place covers: boxes, captions, labels (hard); the lines through it; whether it's beside its own
    // route, and the other lines within 4 pt of it; labels within 8 pt.
    const judge = (s, i) => {
      const r = { x: s.x, y: s.y, w, h }, clear = grow(r, CLEAR_LABEL.x, CLEAR_LABEL.y), [x0, x1, y0, y1] = [r.x + 0.5, r.x + w - 0.5, r.y + 0.5, r.y + h - 0.5];
      let hard = 0, covers = 0;
      for (const k of nearBoxes.near(clear)) if (meets(clear, boxes[k]) && (hulls[k].length === 4 && boxes[k].shape !== 'diamond' || depth(corners(clear), hulls[k]) > 0)) { hard++; covers += area(clear, boxes[k]); }
      for (const k of nearAvoid.near(clear)) if (meets(clear, avoid[k])) { hard++; covers += area(clear, avoid[k]); }
      for (const k of nearPlaced.near(clear)) if (meets(clear, placed[k])) { hard++; covers += area(clear, placed[k]) * 1.5; }
      let crossed = 0;
      const others = new Set();
      for (const k of nearSegs.near(grow(r, ON))) {
        const { l: o, a, b } = segs[k];
        if (a[0] === b[0] ? a[0] > x0 && a[0] < x1 && Math.max(a[1], b[1]) > y0 && Math.min(a[1], b[1]) < y1
          : a[1] === b[1] ? a[1] > y0 && a[1] < y1 && Math.max(a[0], b[0]) > x0 && Math.min(a[0], b[0]) < x1
          : depth([a, b], corners(r, -0.5)) > 0) crossed++;
        if (!self.has(o) && !others.has(o) && gap(r, a, b) <= ON) others.add(o);
      }
      const beside = own.some(g => gap(r, g.a, g.b) <= ON), room = grow(r, APART), near = nearPlaced.near(room).some(k => meets(room, placed[k]));
      return { ...s, i, hard, covers, crossed, beside, others: others.size, on: beside && !others.size && !crossed, near };
    };
    // Of two places that aren't free, the better: one that covers nothing, or else less; then one beside its own
    // line; then one with fewer lines near or through it; then the one preferred.
    const better = (a, b) => (!a.hard !== !b.hard ? !a.hard : a.hard && a.covers !== b.covers ? a.covers < b.covers
      : a.beside !== b.beside ? a.beside : a.others + a.crossed !== b.others + b.crossed ? a.others + a.crossed < b.others + b.crossed : a.i < b.i);
    let free = null, least = null, i = 0;
    for (const s of spots()) {
      const j = judge(s, i++);
      if (!j.hard && j.on && (!j.near || (was && j.i === 0))) { free = j; break; }
      if (!j.hard && j.on) free ??= j;
      if (!least || better(j, least)) least = j;
    }
    const best = free ?? least;
    l.labelAt = { x: best.x, y: best.y };
    l.crowded = !free;
    const mine = { x: best.x, y: best.y, w, h };
    nearPlaced.add(mine, placed.push(mine) - 1);
  }
}

// ---- A line routed around what's drawn ----

// The segments of lines drawn, level ones by their height and upright ones by their x (see sorted), kept for
// each list of them given, as every line a preview adds is routed among the same.
const runsOf = new WeakMap();
function runs(segs) {
  let r = runsOf.get(segs);
  if (!r) runsOf.set(segs, r = { byLevel: sorted(segs.filter(([a, b]) => Math.abs(a[1] - b[1]) < 0.5), s => s[0][1]), byUpright: sorted(segs.filter(([a, b]) => Math.abs(a[0] - b[0]) < 0.5), s => s[0][0]) });
  return r;
}

// A line added to a drawing that stays as it is, a highlight's or a redline's, or one whose route would run
// through a box: square, from the side of its box that faces the other to the side of the other that faces it
// (or from and to the `ports` given, { from, to }, each { at, out, dir }: where it meets its box, a step out,
// and the way out, 0 up, 1 right, 2 down, 3 left), `pad` (6 pt) clear of every other box and of what `avoid`
// holds (labels and captions), crossing the lines already drawn (`segs`) rather than running along them or close beside them, with
// as few turns as it can, on the page (`page`, { w, h, margin }) where one is given. Found on the grid of the
// places where something drawn begins or ends, and the gutters halfway between, as an orthogonal connector
// router searches it, within 120 pt of the two boxes, or failing that 360. → its points, or null where there's
// no way within reach.
function around(geo, from, to, { avoid = [], segs = [], page = null, far = 160, pad = 8, ports: given = null } = {}) {
  const s = geo.get(from), t = geo.get(to);
  if (!s || !t || s === t) return null;
  const C = pad, BEND = 24, ALONG = 4, NEAR = 16, CROSS = 6, m = page ? page.margin / 2 : -Infinity;
  const reach = { x: Math.max(m, Math.min(s.x, t.x) - far), y: Math.max(m, Math.min(s.y, t.y) - far),
    r: Math.min(page ? page.w - m : Infinity, Math.max(s.x + s.w, t.x + t.w) + far), d: Math.min(page ? page.h - m : Infinity, Math.max(s.y + s.h, t.y + t.h) + far) };
  const walls = [...[...geo.values()].filter(g => g.shape !== 'frame'), ...avoid]
    .filter(g => g.x < reach.r && g.x + g.w > reach.x && g.y < reach.d && g.y + g.h > reach.y).map(g => ({ x: g.x - C, y: g.y - C, r: g.x + g.w + C, d: g.y + g.h + C }));
  const blocked = (x, y) => x < reach.x - 0.01 || x > reach.r + 0.01 || y < reach.y - 0.01 || y > reach.d + 0.01
    || walls.some(w => x > w.x + 0.01 && x < w.r - 0.01 && y > w.y + 0.01 && y < w.d - 0.01);
  // Each box's four ports: where a line meets its side, a step out from it, and the way out.
  const ports = g => { const cx = g.x + g.w / 2, cy = g.y + g.h / 2; return [
    { at: [cx, edgeY(g, cx, false)], out: [cx, g.y - C], dir: 0 }, { at: [sideX(g, cy, true), cy], out: [g.x + g.w + C, cy], dir: 1 },
    { at: [cx, edgeY(g, cx, true)], out: [cx, g.y + g.h + C], dir: 2 }, { at: [sideX(g, cy, false), cy], out: [g.x - C, cy], dir: 3 }]; };
  const STEP = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  const starts = (given?.from ?? ports(s)).filter(p => !blocked(...p.out)), ends = (given?.to ?? ports(t)).filter(p => !blocked(...p.out));
  const coords = (k, extra) => {
    const vs = [...new Set([...walls.flatMap(w => k ? [w.y, w.d] : [w.x, w.r]), ...extra, k ? reach.y : reach.x, k ? reach.d : reach.r].map(v => Math.round(v * 4) / 4))].sort((a, b) => a - b);
    return [...new Set([...vs, ...vs.slice(1).map((v, i) => (v + vs[i]) / 2)])].sort((a, b) => a - b);
  };
  const xs = coords(0, [...starts, ...ends].map(p => p.out[0])), ys = coords(1, [...starts, ...ends].map(p => p.out[1]));
  if (xs.length * ys.length > 40000 || !starts.length || !ends.length) return null;
  const X = new Map(xs.map((v, i) => [v, i])), Y = new Map(ys.map((v, i) => [v, i])), node = (i, j) => i * ys.length + j;
  // What a step costs beyond its length: running along a line drawn, or within 12 pt of one beside it, or across one. The lines drawn are looked
  // up by where they run (see runs), each once for each step of the grid, and counted in the order given.
  const { byLevel, byUpright } = runs(segs);
  const toll = (x0, y0, x1, y1) => {
    let c = 0;
    const [lo, hi] = x0 === x1 ? [Math.min(y0, y1), Math.max(y0, y1)] : [Math.min(x0, x1), Math.max(x0, x1)];
    for (const [a, b] of (x0 === x1 ? byUpright : byLevel)(x0 === x1 ? x0 : y0, NEAR)) {
      const [p, q] = x0 === x1 ? [a[0], x0] : [a[1], y0];
      if (Math.abs(p - q) > NEAR) continue;
      const [u, v] = x0 === x1 ? [Math.min(a[1], b[1]), Math.max(a[1], b[1])] : [Math.min(a[0], b[0]), Math.max(a[0], b[0])];
      c += Math.max(0, Math.min(hi, v) - Math.max(lo, u)) * (Math.abs(p - q) <= 2 ? ALONG : 2);
    }
    for (const [a, b] of (x0 === x1 ? byLevel : byUpright)((lo + hi) / 2, (hi - lo) / 2 + 1)) {
      const across = x0 === x1 ? a[1] : a[0], [u, v] = x0 === x1 ? [Math.min(a[0], b[0]), Math.max(a[0], b[0])] : [Math.min(a[1], b[1]), Math.max(a[1], b[1])];
      if (across > lo && across < hi && (x0 === x1 ? x0 : y0) > u && (x0 === x1 ? x0 : y0) < v) c += CROSS;
    }
    return c;
  };
  const goal = new Map(ends.map(p => [node(X.get(Math.round(p.out[0] * 4) / 4), Y.get(Math.round(p.out[1] * 4) / 4)), p]));
  // What's known of the grid as the search reaches it, each worked out once: whether a node is clear, and the
  // middle of the step from it rightward and downward (2 a step, +1 down), that step's toll, and how far a node
  // is from the nearest end at least.
  const N = xs.length * ys.length, clearAt = new Int8Array(N), clearStep = new Int8Array(2 * N), tollOf = new Float64Array(2 * N).fill(NaN), near = new Float64Array(N).fill(NaN);
  const h = (i, j) => {
    const n = node(i, j);
    if (Number.isNaN(near[n])) { let m = Infinity; for (const p of ends) m = Math.min(m, Math.abs(xs[i] - p.out[0]) + Math.abs(ys[j] - p.out[1])); near[n] = m; }
    return near[n];
  };
  // A* over (node, heading), its frontier a binary heap of each one's estimate and key, side by side. Each
  // reached is known by the one it was reached from, or, -1, as where a port starts.
  const fs = [], ks = [], best = new Float64Array(4 * N).fill(Infinity), from_ = new Int32Array(4 * N), port = new Map();
  const swap = (a, b) => { [fs[a], fs[b]] = [fs[b], fs[a]]; [ks[a], ks[b]] = [ks[b], ks[a]]; };
  const push = (f, k) => { fs.push(f); ks.push(k); for (let i = fs.length - 1; i > 0;) { const p = (i - 1) >> 1; if (fs[p] <= fs[i]) break; swap(p, i); i = p; } };
  const pop = () => {
    const f = fs[0], k = ks[0], lf = fs.pop(), lk = ks.pop();
    if (fs.length) { fs[0] = lf; ks[0] = lk; for (let i = 0; ;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < fs.length && fs[l] < fs[m]) m = l; if (r < fs.length && fs[r] < fs[m]) m = r; if (m === i) break; swap(m, i); i = m; } }
    return [f, k];
  };
  const toward = (p, g) => { const [dx, dy] = STEP[p.dir]; return dx * (centerX(g) - p.at[0]) + dy * (g.y + g.h / 2 - p.at[1]) > 0 ? 0 : 2 * BEND; };
  for (const p of starts) {
    const i = X.get(Math.round(p.out[0] * 4) / 4), j = Y.get(Math.round(p.out[1] * 4) / 4), k = node(i, j) * 4 + p.dir, g = C + toward(p, t);
    if (g < best[k]) { best[k] = g; from_[k] = -1; port.set(k, p); push(g + h(i, j), k); }
  }
  let done = null;
  while (fs.length) {
    const [f, k] = pop(), g = best[k], n = k >> 2, dir = k & 3, i = Math.floor(n / ys.length), j = n % ys.length;
    if (f - h(i, j) > g + 1e-6) continue;
    const end = goal.get(n);
    if (end) {
      const last = g + (dir === (end.dir + 2) % 4 ? 0 : BEND) + toward(end, s);
      if (!done || last < done.cost) done = { cost: last, k, end };
      continue;
    }
    if (done && f >= done.cost) break;
    for (let d = 0; d < 4; d++) {
      if (d === (dir + 2) % 4) continue;
      const ni = i + STEP[d][0], nj = j + STEP[d][1];
      if (ni < 0 || nj < 0 || ni >= xs.length || nj >= ys.length) continue;
      const x0 = xs[i], y0 = ys[j], x1 = xs[ni], y1 = ys[nj], nn = node(ni, nj), e = d % 2 ? node(Math.min(i, ni), j) * 2 : node(i, Math.min(j, nj)) * 2 + 1;
      if (!clearAt[nn]) clearAt[nn] = blocked(x1, y1) ? 2 : 1;
      if (clearAt[nn] === 2) continue;
      if (!clearStep[e]) clearStep[e] = blocked((x0 + x1) / 2, (y0 + y1) / 2) ? 2 : 1;
      if (clearStep[e] === 2) continue;
      if (Number.isNaN(tollOf[e])) tollOf[e] = toll(x0, y0, x1, y1);
      const nk = nn * 4 + d, ng = g + Math.abs(x1 - x0) + Math.abs(y1 - y0) + (d === dir ? 0 : BEND) + tollOf[e];
      if (ng < best[nk]) { best[nk] = ng; from_[nk] = k; push(ng + h(ni, nj), nk); }
    }
  }
  if (!done) return far < 480 ? around(geo, from, to, { avoid, segs, page, far: 480, pad, ports: given }) : null;
  const ps = [done.end.at, done.end.out];
  let k = done.k;
  for (;;) {
    const n = k >> 2;
    ps.push([xs[Math.floor(n / ys.length)], ys[n % ys.length]]);
    if (from_[k] < 0) { ps.push(port.get(k).at); break; }
    k = from_[k];
  }
  // Points where the way doesn't turn go.
  const way = ps.reverse().map(([x, y]) => [Math.round(x * 4) / 4, Math.round(y * 4) / 4]).filter((p, i, a) => i === 0 || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1]);
  return way.filter((p, i) => i === 0 || i === way.length - 1 || !((p[0] === way[i - 1][0] && p[0] === way[i + 1][0]) || (p[1] === way[i - 1][1] && p[1] === way[i + 1][1])));
}

return { place, arrange, route, around, labels: placeLabels, keepIn, OPTIONS };
})();
