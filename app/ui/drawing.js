// Drawing: what a hand does on a page beyond moving what's there, as PowerPoint's hand expects. Insert draws by dragging; a line
// goes where it's aimed, either end by its handle, and a line's end on a box, a free shape or a text box glues it, with no
// meaning attached; Ctrl+drag and Ctrl+D copy; Shift keeps proportions and snaps a turn, Ctrl sizes from the middle; flip and turn;
// guides from the rulers; equal spacing shown as a thing is dragged; a picture's crop handles; the Selection Pane. Each act is one
// change through App.change, as every gesture of the canvas is, and the canvas draws the scene that follows.
const Drawing = (() => {
const { h, render } = preact;
const html = htm.bind(h);
const { signal } = preactSignals;
const { useState } = preactHooks;
const round = v => Math.round(v * 2) / 2;
const lowered = s => String(s).replace(/\b[A-Z](?=[a-z])/g, c => c.toLowerCase());
// What a line's end can be glued to: a box, or a free shape that has an outline (not a line, a group, the Key or the page's own texts).
const gluable = m => !!m && !m.revealed && (m.type === 'box' || (m.type === 'shape' && !['line', 'group', 'legend'].includes(m.geometry) && !m.role));
// What a shape that's only a line of its own takes as it's drawn: no fill.
const opening = g => (Shapes.OPEN.has(g) ? { Fill: 'none' } : {});
// What a free shape's Set as default is of: a line, a text box or a shape.
const family = g => g === 'line' || g === 'arrow-line' ? 'line' : g === 'text' ? 'text' : 'shape';
const defaults = () => App.notes.peek().resolve('Shape Defaults', { kind: 'View' })?.value ?? {};

function attach(x) {
  const { graph, sel, root, over, marks, NS } = x;
  const scene = () => x.scene();
  const zoom = () => graph.zoom();
  const local = e => graph.clientToLocal(e.clientX, e.clientY);
  const svg = (name, attrs, into = marks) => { const n = document.createElementNS(NS, name); for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) n.setAttribute(k, v); into.appendChild(n); return n; };

  // ---- What's under a point, to glue to ----
  function markAt(p, not = []) {
    const pad = 6 / zoom();
    for (const m of [...scene().marks].reverse()) if (gluable(m) && !not.includes(m.id) && p.x >= m.x - pad && p.x <= m.x + m.w + pad && p.y >= m.y - pad && p.y <= m.y + m.h + pad) return m;
    return null;
  }
  // Where a line's end lands on what it's glued to: the middle of the side that faces its other end.
  const landing = (m, other) => Scene.edgePoint(m, other);
  // A point with Shift: at its 15 degrees from where the line starts.
  const snapAngle = (p, from) => { const a = Math.round(Math.atan2(p.y - from[1], p.x - from[0]) / (Math.PI / 12)) * (Math.PI / 12), d = Math.hypot(p.x - from[0], p.y - from[1]); return { x: from[0] + d * Math.cos(a), y: from[1] + d * Math.sin(a) }; };
  // A point held to the guides and, with Snap to grid, the grid.
  function held(p) {
    const q = { ...p }, near = 6 / zoom(), a = Canvas.aids.peek(), step = x.gridStep();
    if (a.snap) { q.x = Math.round(q.x / step) * step; q.y = Math.round(q.y / step) * step; }
    const g = guidesNow();
    for (const v of g.down) if (Math.abs(p.x - v) < near) q.x = v;
    for (const v of g.across) if (Math.abs(p.y - v) < near) q.y = v;
    return q;
  }

  // ---- Insert, by dragging: armed, the next press draws; a click places it as large as it comes ----
  let armed = null, unarm = null, drawingNow = false;
  function arm(geometry, opts = {}) {
    disarm();
    if (x.still()) return Shell.toast(App.whyNot());
    // (A line with two things selected that can be glued joins them, there being nothing left to aim.)
    const two = x.selectedNow();
    if ((geometry === 'line' || geometry === 'arrow-line') && two.length === 2 && two.every(gluable)) return x.connect(two[0], two[1], null, geometry === 'arrow-line' ? { Arrow: 'end' } : {});
    armed = { geometry, opts };
    root.classList.add('drawing');
    unarm = Shell.layer(disarm);
    root.focus({ preventScroll: true });
    return true;
  }
  function disarm() { armed = null; const u = unarm; unarm = null; u?.(); root.classList.remove('drawing'); }
  // Default look of a free shape new on this chart, by family (see Set as default), and what its shape asks for itself.
  const newLook = (g, format) => ({ ...opening(g), ...defaults()[family(g)], ...format });
  function draw(a, down) {
    const start = local(down), line = a.geometry === 'line' || a.geometry === 'arrow-line', g = a.geometry, t = down;
    let from = line ? markAt(start) : null, p = start, shift = down.shiftKey, ctrl = down.ctrlKey || down.metaKey, target = null, moved = false;
    const s0 = from ? landing(from, [start.x, start.y]) : (h0 => [h0.x, h0.y])(held(start));
    const ghost = svg('path', { class: 'dc-draft' });
    const rectOf = () => {
      let dx = p.x - s0[0], dy = p.y - s0[1];
      if (shift) { const k = Math.max(Math.abs(dx), Math.abs(dy)); dx = Math.sign(dx || 1) * k; dy = Math.sign(dy || 1) * k; }
      return ctrl ? { x: s0[0] - Math.abs(dx), y: s0[1] - Math.abs(dy), w: 2 * Math.abs(dx), h: 2 * Math.abs(dy) } : { x: Math.min(s0[0], s0[0] + dx), y: Math.min(s0[1], s0[1] + dy), w: Math.abs(dx), h: Math.abs(dy) };
    };
    const paint = () => {
      if (line) {
        const q = target ? landing(target, s0) : shift ? (o => [o.x, o.y])(snapAngle(p, s0)) : (o => [o.x, o.y])(held(p));
        ghost.setAttribute('d', `M${s0[0]},${s0[1]} L${q[0]},${q[1]}`);
        return q;
      }
      const r = rectOf();
      ghost.setAttribute('d', Scene.path(g === 'text' ? 'rect' : g, Math.max(1, r.w), Math.max(1, r.h)));
      ghost.setAttribute('transform', `translate(${r.x} ${r.y})`);
      return r;
    };
    drawingNow = true;
    const move = e => {
      if (Math.hypot(e.clientX - t.clientX, e.clientY - t.clientY) > 4) moved = true;
      p = local(e); shift = e.shiftKey; ctrl = e.ctrlKey || e.metaKey;
      target = line ? markAt(p, from ? [from.id] : []) : null;
      paint();
      x.paintStates(new Map([...(from ? [[from.id, ['accent', 1]]] : []), ...(target ? [[target.id, ['accent', 1]]] : [])]));
    };
    const up = e => {
      removeEventListener('pointermove', move, true); removeEventListener('pointerup', up, true); removeEventListener('keydown', esc, true);
      const made = paint();
      ghost.remove(); drawingNow = false; x.paintStates();
      disarm();
      if (e?.type !== 'pointerup') return;
      if (line) {
        const q = moved ? made : [s0[0] + 96 / x.scale(), s0[1]], ends = [from?.id ?? null, moved ? target?.id ?? null : null];
        const id = x.insert(g, { points: [s0, q].map(([a, b]) => [round(a), round(b)]), ...(ends.some(Boolean) && { ends }), format: newLook(g, a.opts.format) });
        return id;
      }
      const placed = moved ? made : (o => ({ x: o.x - o.w / 2, y: o.y - o.h / 2, w: o.w, h: o.h }))({ x: s0[0], y: s0[1], w: 140, h: 70 });
      // (A text box clicked, not dragged, is as wide as what's typed in it.)
      if (g === 'text') return x.insert('text', { ...a.opts, x: round(moved ? placed.x : s0[0]), y: round(moved ? placed.y : s0[1]), ...(moved && { w: round(placed.w), h: round(Math.max(placed.h, 24)) }), ...(defaults().text && { format: newLook(g, a.opts.format) }) });
      return x.insert(g, { ...a.opts, x: round(placed.x), y: round(placed.y), w: round(Math.max(8, placed.w)), h: round(Math.max(8, placed.h)), format: newLook(g, a.opts.format) });
    };
    const esc = e => { if (e.key !== 'Escape') return; e.preventDefault(); e.stopPropagation(); up(e); };
    addEventListener('pointermove', move, true); addEventListener('pointerup', up, true); addEventListener('keydown', esc, true);
    paint();
  }
  root.addEventListener('pointerdown', e => {
    if (!armed) return;
    if (e.button !== 0) return disarm();
    if (e.target.closest?.('.dc-kind, .dc-kinds, .dc-complete')) return;
    e.preventDefault(); e.stopPropagation();
    // (A text box begun by Insert, its first letter not yet typed, makes nothing as the pointer leaves it.)
    const a = armed;
    over.querySelector('.dc-edit')?.blur();
    draw(a, e);
  }, true);
  // (The press that draws isn't X6's as well.)
  root.addEventListener('mousedown', e => { if (armed || drawingNow) { e.preventDefault(); e.stopPropagation(); } }, true);
  // Enter, armed: where a new shape goes with no hand to say, in free room near the middle of the screen.
  root.addEventListener('keydown', e => { if (armed && e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); const a = armed; disarm(); x.insert(a.geometry, { ...a.opts, format: newLook(a.geometry, a.opts.format) }); } }, true);

  // ---- A line's ends: a handle on each of a line selected, dragged anywhere, to any box or free shape ----
  function paintEnds() {
    marks.querySelectorAll('.dc-end').forEach(n => n.remove());
    const cs = sel.getSelectedCells(), m = cs.length === 1 && cs[0].isEdge() && !x.still() ? scene().byId.get(cs[0].id) : null;
    if (!m?.points || m.locked) return;
    const free = m.geometry === 'line';
    if (!free && !(m.type === 'line' && App.transferable(m.record))) return;
    const z = zoom(), r = 5 / z;
    [[m.points[0], 0], [m.points.at(-1), 1]].forEach(([p, end]) => {
      const on = free ? !!m.ends?.[end] : true, c = svg('circle', { class: `dc-end${on ? ' glued' : ''}`, cx: p[0], cy: p[1], r, 'stroke-width': 1.25 / z });
      c.addEventListener('pointerdown', e => endDrag(e, m, end, c));
      c.addEventListener('mousedown', e => e.stopPropagation());
      c.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); Shell.menu({ x: e.clientX, y: e.clientY }, x.markItems()); });
    });
  }
  function endDrag(e, m, end, grip) {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const cell = graph.getCellById(m.id), free = m.geometry === 'line', other = end ? m.points[0] : m.points.at(-1), o = other, was = end ? m.points.at(-1) : m.points[0];
    const otherEnd = free ? m.ends?.[1 - end] : end ? m.from : m.to, own = free ? m.ends?.[end] : end ? m.to : m.from;
    let at = was, target = null, moved = false;
    x.astray(m.id); cell?.setConnector?.({ name: 'normal' });
    marks.querySelectorAll('.dc-bend').forEach(n => n.remove());
    const put = q => {
      cell?.setVertices([]);
      if (end) { cell?.setSource({ x: o[0], y: o[1] }); cell?.setTarget({ x: q[0], y: q[1] }); } else { cell?.setSource({ x: q[0], y: q[1] }); cell?.setTarget({ x: o[0], y: o[1] }); }
      grip.setAttribute('cx', q[0]); grip.setAttribute('cy', q[1]);
    };
    const move = ev => {
      if (Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) > 3) moved = true;
      const p = local(ev);
      target = markAt(p, otherEnd ? [otherEnd] : []);
      at = target ? landing(target, o) : ev.shiftKey ? (q => [q.x, q.y])(snapAngle(p, o)) : (q => [q.x, q.y])(held(p));
      put(at);
      x.paintStates(target ? new Map([[target.id, ['accent', 1]]]) : undefined);
    };
    const up = () => {
      removeEventListener('pointermove', move, true); removeEventListener('pointerup', up, true);
      x.paintStates();
      if (!moved) return x.show(true);
      if (free) {
        const row = x.rowOf(m.id), pts = (row.points ?? m.points).map(q => [...q]), ends = [m.ends?.[0] ?? null, m.ends?.[1] ?? null];
        pts[end ? pts.length - 1 : 0] = at.map(round);
        ends[end] = target?.id ?? null;
        const c = App.change(tx => tx.update(m.id, { points: pts, x: pts[0][0], y: pts[0][1], ends: ends.some(Boolean) ? ends : null }), { dated: false, say: target ? `Glued the line to ${x.called(target)}` : own ? 'Let go of the line’s end' : 'Moved the line’s end' });
        if (!c) x.show(true);
        return;
      }
      // A relation's line isn't a drawing: another box at its end is another fact, asked for as one, or said why not.
      x.show(true);
      if (!target || target.id === own) return;
      if (target.type !== 'box') return Shell.toast(`A free shape holds no ${App.notes.peek().nameOf(App.state.peek(), m.record)}: nothing changed`, { ms: 3500 });
      App.repoint(m.record, target.record, end === 0 ? m.from : m.to);
    };
    addEventListener('pointermove', move, true); addEventListener('pointerup', up, true);
  }
  // A line glued follows what it's glued to as that's dragged (a box, or a free shape), a hand's or the keys'.
  function followLines(rects) {
    for (const m of scene().marks) if (m.geometry === 'line' && m.ends?.some(id => rects.has(id))) {
      const row = x.rowOf(m.id), o = { points: (row?.points ?? m.points).map(p => [...p]), look: m.look, ends: m.ends }, cell = graph.getCellById(m.id);
      Scene.glued(o, id => rects.get(id) ?? (mk => gluable(mk) ? mk : null)(scene().byId.get(id)));
      cell?.setSource({ x: o.points[0][0], y: o.points[0][1] }); cell?.setTarget({ x: o.points.at(-1)[0], y: o.points.at(-1)[1] }); cell?.setVertices(o.points.slice(1, -1).map(([a, b]) => ({ x: a, y: b })));
      x.astray(m.id);
    }
  }

  // ---- Copying as a hand expects: Ctrl+drag, Ctrl+D ----
  const toCopy = () => x.placeableAll();
  // A free shape, as a row at (dx, dy), its glue let go where what it's glued to isn't copied with it; a box, as a new record of its kind with its look.
  function copyRows(tx, ms, dx, dy) {
    const view = x.viewOf(), ids = new Map();
    for (const m of ms) if (m.type === 'shape' && m.geometry !== 'group') {
      const { ends, kept, ...row } = x.rowOf(m.id) ?? {};
      ids.set(m.id, tx.add('shape', { ...row, view, x: (row.x ?? m.x) + dx, y: (row.y ?? m.y) + dy, ...(row.points && { points: row.points.map(([a, b]) => [round(a + dx), round(b + dy)]) }), ...(ends && { ends: null }) }));
    }
    return ids;
  }
  // What a box is, of the new one like it: its kind, what's chosen at it (what its styles go by), and every look given it alone.
  function likeIt(tx, m, name, at) {
    const st = App.state.peek(), N = App.notes.peek(), view = x.viewOf(), r = st[m.record], t = x.treeOf(m.record), id = tx.add('record', { kind: r.kind });
    tx.add('record', { at: id, edge: 'Name', field: 'text', value: name });
    for (const e of Tree.index(st).entries.get(m.record) ?? []) if ('choice' in st[e] && !st[e].computed) tx.add('record', { at: id, edge: st[e].edge, choice: st[e].choice });
    for (const f of Object.values(N.formats(t, view))) if (f.note.view === view && f.note.pattern.id === m.record) tx.note(f.note.label, { id, kind: r.kind }, f.note.value, { view });
    tx.note('Position', { id, kind: r.kind }, { x: at.x, y: at.y, w: round(m.w), ...(N.position(t, view)?.h != null && { h: round(m.h) }), loose: true }, { view });
    App.showMade(tx, [id], view);
    return id;
  }
  const short = m => App.notes.peek().shortOf(App.state.peek(), m.record) ?? App.notes.peek().nameOf(App.state.peek(), m.record);
  // One box: named as it's typed, as every new box is, saying what it's like; empty, nothing's made. Several: each named for what it's a copy of, there to be typed over.
  function copyTo(ms, dx, dy) {
    if (x.still()) return Shell.toast(App.whyNot());
    const boxes = ms.filter(m => m.type === 'box'), shapes = ms.filter(m => m.type === 'shape'), o = x.origin();
    const finish = ids => { const sel2 = [...ids]; if (sel2.length) Shell.select(sel2); };
    if (boxes.length === 1 && !shapes.length) {
      const m = boxes[0], k = App.state.peek()[m.record].kind, like = short(m), at = { x: m.x + dx, y: m.y + dy };
      return x.openEditor({ look: { ...Scene.DEFAULTS.text, Bold: true } }, { x: at.x, y: at.y, w: m.w, h: m.h }, '', name => {
        name = Tree.clean(name);
        if (!name) return;
        let id = null;
        if (App.change(tx => { id = likeIt(tx, m, name, { x: round(at.x - o.x), y: round(at.y - o.y) }); }, { dated: false, say: `New ${lowered(k)} ${name}, like ${like}` })) finish([id]);
      }, { ph: `New ${lowered(k)} like ${like}` });
    }
    const made = [];
    if (!App.change(tx => {
      for (const m of boxes) made.push(likeIt(tx, m, `${App.notes.peek().nameOf(App.state.peek(), m.record)} (copy)`, { x: round(m.x + dx - o.x), y: round(m.y + dy - o.y) }));
      const ids = copyRows(tx, shapes, dx, dy);
      made.push(...ids.values());
      // A group copied is a group.
      for (const g of scene().marks) if (g.geometry === 'group' && g.members.every(id => ids.has(id))) made.push(tx.add('shape', { view: x.viewOf(), geometry: 'group', members: g.members.map(id => ids.get(id)) }));
    }, { dated: false, say: boxes.length ? `New ${boxes.length === 1 ? `${lowered(App.state.peek()[boxes[0].record].kind)} like ${short(boxes[0])}` : `boxes like these ${boxes.length}`}${shapes.length ? ` and ${shapes.length} ${shapes.length === 1 ? 'shape' : 'shapes'}` : ''}` : `Copied ${shapes.length === 1 ? x.called(shapes[0]) : `${shapes.length} shapes`}` })) return;
    finish(made);
  }
  const duplicate = () => {
    const ms = toCopy();
    if (!ms.length) return Shell.toast('Select a box or a shape to duplicate first', { ms: 2500 });
    const d = 12 / x.scale();
    copyTo(ms, d, d);
  };
  // A press with Ctrl on what can be copied: a drag copies it, what's copied drawn where it would land; let go where it was, it's a click, which adds it to the selection or takes it off.
  x.gEl.addEventListener('mousedown', e => {
    if (e.button !== 0 || !(e.ctrlKey || e.metaKey) || e.shiftKey || armed) return;
    const id = e.target.closest?.('[data-cell-id]')?.getAttribute('data-cell-id'), cell = id && graph.getCellById(id), k = cell?.getData?.()?.kind;
    if (!cell || !['box', 'shape'].includes(k) || e.target.closest?.('.dc-end')) return;
    const m = scene().byId.get(id);
    if (!m || m.role || m.geometry === 'legend') return;
    e.stopPropagation(); e.preventDefault();
    const start = local(e), sx = e.clientX, sy = e.clientY;
    let moved = false, ghosts = null, dx = 0, dy = 0, ms = [];
    const move = ev => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
      if (!moved) {
        moved = true;
        if (x.still()) return;
        ms = sel.isSelected(cell) ? toCopy() : [m];
        ghosts = ms.map(mk => { const v = graph.findViewByCell(graph.getCellById(mk.id)), g = svg('g', { class: 'dc-ghost' }); if (v?.container) g.appendChild(v.container.cloneNode(true)); g.querySelectorAll('[data-cell-id]').forEach(n => n.removeAttribute('data-cell-id')); return g; });
      }
      const p = local(ev);
      dx = p.x - start.x; dy = p.y - start.y;
      if (ev.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
      ghosts?.forEach(g => g.setAttribute('transform', `translate(${dx} ${dy})`));
    };
    const up = () => {
      removeEventListener('mousemove', move, true); removeEventListener('mouseup', up, true);
      ghosts?.forEach(g => g.remove());
      if (!moved) { if (sel.isSelected(cell)) sel.unselect(cell); else sel.select(cell); return; }
      if (ms.length && (Math.abs(dx) > 1 || Math.abs(dy) > 1)) copyTo(ms, dx, dy);
    };
    addEventListener('mousemove', move, true); addEventListener('mouseup', up, true);
  }, true);

  // ---- Flip and turn ----
  const flippable = m => m.type === 'shape' && !['legend', 'group'].includes(m.geometry) && !m.role;
  const mid = m => [m.x + m.w / 2, m.y + m.h / 2];
  // What can be flipped of a selection; a box can't, as its shape says what it is, and it's said which.
  function flip(how) {
    if (x.still()) return Shell.toast(App.whyNot());
    const ms = x.placeableAll(), them = ms.filter(flippable), no = ms.filter(m => m.type === 'box');
    if (!them.length) return Shell.toast(ms.length ? 'A box doesn’t flip: its shape says what it is, and its lines run square to it' : 'Select a shape to flip first', { ms: 3500 });
    const box = x.extent(them), cx = box.x + box.w / 2, cy = box.y + box.h / 2, across = how === 'h';
    App.change(tx => {
      for (const m of them) {
        const row = x.rowOf(m.id);
        if (m.geometry === 'line') { const pts = (row.points ?? m.points).map(([a, b]) => across ? [round(2 * cx - a), b] : [a, round(2 * cy - b)]); tx.update(m.id, { points: pts, x: pts[0][0], y: pts[0][1] }); continue; }
        const was = row.flip ?? {}, next = { ...was, [how]: !was[how] }, [ax, ay] = mid(m);
        tx.update(m.id, { flip: next.h || next.v ? next : null, ...(them.length > 1 && (across ? { x: round(2 * cx - ax - m.w / 2) } : { y: round(2 * cy - ay - m.h / 2) })), ...(row.rotate && { rotate: (360 - row.rotate) % 360 }) });
      }
    }, { dated: false, say: `Flipped ${them.length === 1 ? x.called(them[0]) : `${them.length} shapes`} ${across ? 'across' : 'upside down'}${no.length ? `; ${no.length === 1 ? 'a box stays' : `${no.length} boxes stay`} as ${no.length === 1 ? 'it is' : 'they are'}` : ''}` });
    did(() => flip(how));
  }
  // Turned by `by` degrees, clockwise: a free shape about its middle, a line about its middle, a group about the group's, each member with it; a box doesn't turn, which is said.
  function turnBy(by, ms = x.selectedNow(), to = null) {
    if (x.still()) return Shell.toast(App.whyNot());
    const groups = ms.filter(m => m.geometry === 'group'), one = ms.filter(m => m.geometry !== 'group' && flippable(m));
    const members = groups.flatMap(g => g.members.map(id => scene().byId.get(id)).filter(Boolean));
    const turnable = [...one, ...members.filter(flippable)], stay = [...ms, ...members].filter(m => m.type === 'box');
    if (!turnable.length) return Shell.toast(stay.length ? 'A box doesn’t turn: its lines run square to it' : 'Select a shape to turn first', { ms: 3500 });
    const a = by * Math.PI / 180, spin = ([px, py], [cx, cy]) => [cx + (px - cx) * Math.cos(a) - (py - cy) * Math.sin(a), cy + (px - cx) * Math.sin(a) + (py - cy) * Math.cos(a)];
    App.change(tx => {
      for (const m of turnable) {
        const g = groups.find(q => q.members.includes(m.id)), about = g ? mid(g) : m.points ? mid(x.extent([m])) : mid(m), row = x.rowOf(m.id);
        if (m.geometry === 'line') { const pts = (row.points ?? m.points).map(q => spin(q, about).map(v => Math.round(v * 100) / 100)); tx.update(m.id, { points: pts, x: pts[0][0], y: pts[0][1] }); continue; }
        const [nx, ny] = g ? spin(mid(m), about) : mid(m), r = (((row.rotate ?? 0) + by) % 360 + 360) % 360;
        tx.update(m.id, { rotate: r || undefined, ...(g && { x: round(nx - m.w / 2), y: round(ny - m.h / 2) }) });
      }
      for (const g of groups) { const row = x.rowOf(g.id); tx.update(g.id, { rotate: ((((row?.rotate ?? 0) + by) % 360 + 360) % 360) || undefined }); }
    }, { dated: false, say: `Turned ${groups.length === 1 && !one.length ? 'the group' : turnable.length === 1 ? x.called(turnable[0]) : `${turnable.length} shapes`} ${to != null ? `to ${Math.round(to * 10) / 10}` : Math.round(by * 10) / 10}°${stay.length ? `; ${stay.length === 1 ? `${x.called(stay[0])} stays square` : `${stay.length} boxes stay square`}` : ''}` });
    did(() => turnBy(by));
  }
  // A line's angle, as its panel reads it and takes it typed: from its start to its end, clockwise from the right.
  const angleOf = m => { const [p, q] = [m.points[0], m.points.at(-1)]; return ((Math.atan2(q[1] - p[1], q[0] - p[0]) * 180 / Math.PI) % 360 + 360) % 360; };
  function aimLine(id, angle) {
    const m = scene().byId.get(id), row = x.rowOf(id);
    if (!m?.points || !row) return;
    const by = angle - angleOf(m);
    if (Math.abs(by) < 0.05) return;
    turnBy(by, [m], ((angle % 360) + 360) % 360);
  }

  // ---- Shift and Ctrl on a drag: proportions kept, a turn snapped, sized from the middle ----
  let centre = null;
  const heldKeys = e => {
    for (const [cell, w] of x.transform.widgets) { if (w.options) { w.options.preserveAspectRatio = x.lockedCell(cell) || e.shiftKey; w.options.rotateGrid = e.shiftKey ? 15 : 1; } }
    if (centre) centre.ctrl = e.ctrlKey || e.metaKey, centre.px = e.clientX, centre.py = e.clientY;
  };
  addEventListener('pointermove', heldKeys, true);
  graph.on('node:resize', ({ node, e }) => { const p = node.getPosition(), s = node.getSize(); centre = { node, cx: p.x + s.width / 2, cy: p.y + s.height / 2, ctrl: e.ctrlKey || e.metaKey, ratio: s.width / (s.height || 1), px: e.clientX, py: e.clientY }; });
  graph.on('node:resizing', ({ node, e }) => {
    if (!centre || centre.node !== node || !(e.ctrlKey || e.metaKey)) return;
    const p = local(e), now = node.getSize(), wide = now.width, tall = now.height;
    // (The sides a handle moves: the other stays as X6 leaves it.)
    const dir = x.transform.widgets.get(node)?.handle?.getAttribute('data-position') ?? '', hor = /left|right/.test(dir), ver = /top|bottom/.test(dir);
    let w = hor ? Math.max(24, 2 * Math.abs(p.x - centre.cx)) : wide, ht = ver ? Math.max(12, 2 * Math.abs(p.y - centre.cy)) : tall;
    if (e.shiftKey || x.lockedCell(node)) { if (hor && ver) { const k = Math.max(w / wide, ht / tall); w = wide * k; ht = tall * k; } }
    node.store.set({ position: { x: centre.cx - w / 2, y: centre.cy - ht / 2 }, size: { width: w, height: ht } });
  });
  graph.on('node:resized', () => { centre = null; });

  // ---- Equal spacing, shown as a thing is dragged: marks in the gaps that come out the same ----
  const clearGaps = () => marks.querySelectorAll('.dc-gap').forEach(n => n.remove());
  function equalGaps(node) {
    clearGaps();
    const m = scene().byId.get(node.id);
    if (!m || sel.getSelectedCells().length > 1) return;
    const pos = node.getPosition(), size = node.getSize(), r = { x: pos.x, y: pos.y, w: size.width, h: size.height }, tol = 3 / zoom();
    const rest = scene().marks.filter(o => o.id !== m.id && (o.type === 'box' || (o.type === 'shape' && !['line', 'group'].includes(o.geometry) && !o.role)) && !o.revealed);
    const mark = (a, b, c, axis) => {
      const s = 4 / zoom();
      const d = axis ? `M${c},${a} V${b} M${c - s},${a} H${c + s} M${c - s},${b} H${c + s}` : `M${a},${c} H${b} M${a},${c - s} V${c + s} M${b},${c - s} V${c + s}`;
      svg('path', { class: 'dc-gap', d, 'stroke-width': 1.25 / zoom() });
      // (How far apart, in the sheet's points.)
      const mid = (a + b) / 2, off = 5 / zoom(), said = svg('text', { class: 'dc-gap', x: axis ? c + off : mid, y: axis ? mid : c - off, 'font-size': 10 / zoom(), 'text-anchor': axis ? 'start' : 'middle', 'dominant-baseline': axis ? 'middle' : 'auto' });
      said.textContent = `${Math.round(Math.abs(b - a) * x.scale() / Scene.PT * 10) / 10} pt`;
    };
    for (const axis of [0, 1]) {
      const [P, S, Q, T] = axis ? ['y', 'h', 'x', 'w'] : ['x', 'w', 'y', 'h'], overlaps = o => o[Q] < r[Q] + r[T] && o[Q] + o[T] > r[Q];
      const line = rest.filter(overlaps).sort((a, b) => a[P] - b[P]), before = line.filter(o => o[P] + o[S] <= r[P] + 0.5), after = line.filter(o => o[P] >= r[P] + r[S] - 0.5);
      const L = before.at(-1), R = after[0], c = r[Q] + r[T] / 2;
      // (Near enough, it's drawn to them: the gaps it shows the same are the same. The next move of the pointer lets it go again.)
      if (L && R && Math.abs((r[P] - (L[P] + L[S])) - (R[P] - (r[P] + r[S]))) < tol) { r[P] = (L[P] + L[S] + R[P] - r[S]) / 2; mark(L[P] + L[S], r[P], c, axis); mark(r[P] + r[S], R[P], c, axis); continue; }
      const LL = before.at(-2), RR = after[1];
      if (L && LL && Math.abs((r[P] - (L[P] + L[S])) - (L[P] - (LL[P] + LL[S]))) < tol) { r[P] = L[P] + L[S] + L[P] - (LL[P] + LL[S]); mark(LL[P] + LL[S], L[P], c, axis); mark(L[P] + L[S], r[P], c, axis); }
      else if (R && RR && Math.abs((R[P] - (r[P] + r[S])) - (RR[P] - (R[P] + R[S]))) < tol) { r[P] = R[P] - (RR[P] - (R[P] + R[S])) - r[S]; mark(r[P] + r[S], R[P], c, axis); mark(R[P] + R[S], RR[P], c, axis); }
    }
    if (r.x !== pos.x || r.y !== pos.y) node.setPosition(r.x, r.y);
  }
  graph.on('node:moving', ({ node }) => { if (['box', 'shape'].includes(node.getData()?.kind)) equalGaps(node); });
  graph.on('node:moved', clearGaps);

  // ---- Guides: dragged from the rulers, kept with the view in points on its sheet, snapped to, never printed ----
  const guidesNote = () => App.notes.peek().resolve('Guides', { id: x.viewOf(), kind: 'View' })?.value ?? { down: [], across: [] };
  const toPage = v => v * Scene.PT / x.scale(), toSheet = v => Math.round(v * x.scale() / Scene.PT * 10) / 10;
  function guidesNow() { const g = guidesNote(); return { down: (g.down ?? []).map(toPage), across: (g.across ?? []).map(toPage) }; }
  const putGuides = (next, say) => App.change(tx => tx.note('Guides', { id: x.viewOf(), kind: 'View' }, next.down.length || next.across.length ? next : undefined), { dated: false, keep: false, say });
  // The cells that draw them: each a line X6's guides find, as it finds a box's edge.
  function guideCells() {
    const sc = scene(), { w, h } = sc.page, g = guidesNow(), z = (kind, at) => ({ id: `·guide:${kind}:${at}`, shape: 'dendra', x: kind === 'down' ? at : 0, y: kind === 'down' ? 0 : at, width: kind === 'down' ? 0.01 : w, height: kind === 'down' ? h : 0.01, zIndex: 1e6, data: { kind: 'guide', axis: kind },
      markup: [{ tagName: 'path', attrs: { class: 'dc-guide', d: kind === 'down' ? `M0,0 V${h}` : `M0,0 H${w}`, fill: 'none', 'vector-effect': 'non-scaling-stroke' } }, { tagName: 'path', attrs: { class: `dc-guide-hit ${kind}`, d: kind === 'down' ? `M0,0 V${h}` : `M0,0 H${w}`, fill: 'none', stroke: 'transparent', 'stroke-width': 8, 'vector-effect': 'non-scaling-stroke' } }] });
    return Canvas.aids.peek().guides === false ? [] : [...g.down.map(v => z('down', v)), ...g.across.map(v => z('across', v))];
  }
  // A guide dragged: from a ruler, a new one; from where it is, moved; onto a ruler or off the page, gone.
  function guideDrag(e, axis, from = null) {
    e.preventDefault(); e.stopPropagation();
    const line = svg('path', { class: 'dc-guide dragging', fill: 'none', 'vector-effect': 'non-scaling-stroke' }), { w, h } = scene().page;
    let at = from;
    const place = v => line.setAttribute('d', axis === 'down' ? `M${v},0 V${h}` : `M0,${v} H${w}`);
    if (from != null) place(from);
    const move = ev => { const p = local(ev); at = axis === 'down' ? p.x : p.y; place(at); };
    const up = () => {
      removeEventListener('pointermove', move, true); removeEventListener('pointerup', up, true);
      line.remove();
      const g = guidesNote(), list = (g[axis] ?? []).filter(v => from == null || Math.abs(toPage(v) - from) > 0.01), off = at == null || at <= 0 || at >= (axis === 'down' ? w : h), next = { down: g.down ?? [], across: g.across ?? [], [axis]: off ? list : [...list, toSheet(at)] };
      if (from == null && off) return;
      putGuides(next, off ? 'Took a guide away' : from == null ? 'Added a guide' : 'Moved a guide');
    };
    addEventListener('pointermove', move, true); addEventListener('pointerup', up, true);
  }
  graph.on('node:mousedown', ({ e, node }) => { const d = node.getData(); if (d?.kind === 'guide' && !x.still()) guideDrag(e, d.axis, d.axis === 'down' ? node.getPosition().x : node.getPosition().y); });

  // ---- A picture's crop handles: dragged in from an edge, that side is cut; its frame shrinks round what's left ----
  let cropping = null;
  function crop(id) {
    if (x.still()) return Shell.toast(App.whyNot());
    const m = id ? scene().byId.get(id) : x.selectedNow().find(q => q.geometry === 'picture');
    if (m?.geometry !== 'picture') return Shell.toast('Select a picture to crop first', { ms: 2500 });
    cropping = m.id;
    paintCrop();
  }
  function endCrop() { cropping = null; marks.querySelectorAll('.dc-cropper').forEach(n => n.remove()); }
  function paintCrop() {
    marks.querySelectorAll('.dc-cropper').forEach(n => n.remove());
    const m = cropping && scene().byId.get(cropping);
    if (!m || m.geometry !== 'picture' || !x.selectedNow().some(q => q.id === m.id)) { cropping = null; return; }
    const z = zoom(), s = 16 / z, t = 5 / z;
    const box = svg('rect', { class: 'dc-cropper frame', x: m.x, y: m.y, width: m.w, height: m.h, 'stroke-width': 1 / z, fill: 'none' });
    for (const side of ['left', 'right', 'top', 'bottom']) {
      const flat = side === 'top' || side === 'bottom', cx = side === 'left' ? m.x : side === 'right' ? m.x + m.w : m.x + m.w / 2, cy = side === 'top' ? m.y : side === 'bottom' ? m.y + m.h : m.y + m.h / 2;
      const bar = svg('rect', { class: `dc-cropper bar ${flat ? 'flat' : 'tall'}`, x: cx - (flat ? s : t / 2), y: cy - (flat ? t / 2 : s), width: flat ? 2 * s : t, height: flat ? t : 2 * s });
      bar.addEventListener('mousedown', e => e.stopPropagation());
      bar.addEventListener('pointerdown', e => {
        if (e.button !== 0) return;
        e.preventDefault(); e.stopPropagation();
        const c = { left: 0, top: 0, right: 0, bottom: 0, ...x.rowOf(m.id)?.crop }, fullW = m.w / (1 - (c.left + c.right) / 100), fullH = m.h / (1 - (c.top + c.bottom) / 100), start = local(e);
        let d = 0;
        const room = v => flat ? Math.max(-c[side] / 100 * fullH, Math.min(v, m.h - 8)) : Math.max(-c[side] / 100 * fullW, Math.min(v, m.w - 8));
        const paint = () => {
          box.setAttribute('x', m.x + (side === 'left' ? d : 0)); box.setAttribute('y', m.y + (side === 'top' ? d : 0));
          box.setAttribute('width', m.w - (flat ? 0 : d)); box.setAttribute('height', m.h - (flat ? d : 0));
        };
        const move = ev => { const p = local(ev), v = side === 'left' ? p.x - start.x : side === 'right' ? start.x - p.x : side === 'top' ? p.y - start.y : start.y - p.y; d = room(v); paint(); };
        const up = () => {
          removeEventListener('pointermove', move, true); removeEventListener('pointerup', up, true);
          if (Math.abs(d) < 0.5) return paintCrop();
          const v = c[side] + d / (flat ? fullH : fullW) * 100;
          App.change(tx => tx.update(m.id, { crop: { ...c, [side]: Math.round(v * 100) / 100 }, ...(side === 'left' && { x: round(m.x + d) }), ...(side === 'top' && { y: round(m.y + d) }), ...(flat ? { h: round(m.h - d) } : { w: round(m.w - d) }) }), { dated: false, say: 'Cropped the picture' });
        };
        addEventListener('pointermove', move, true); addEventListener('pointerup', up, true);
      });
    }
  }
  // Another picture in the same frame, as wide as it stood and as tall as it needs, unless it's locked off; its crop goes.
  function changePicture(id) {
    const m = id ? scene().byId.get(id) : x.selectedNow().find(q => q.geometry === 'picture');
    if (m?.geometry !== 'picture') return Shell.toast('Select a picture first', { ms: 2500 });
    const input = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*' });
    input.onchange = () => {
      const f = input.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => { const img = new Image(); img.onload = () => { App.change(tx => tx.update(m.id, { src: r.result, crop: null, h: round(m.w * img.height / img.width) }), { dated: false, say: 'Changed the picture' }); Shell.select([m.id]); }; img.src = r.result; };
      r.readAsDataURL(f);
    };
    input.click();
  }
  // Painted with the selection, a line's ends, a picture's crop handles and a group's turning handle.
  function paint() { paintEnds(); paintCrop(); paintTurn(); }
  // A group's handle over it, dragged: it turns as a free shape's does, by degrees, Shift by 15; the shapes go round its middle as one.
  function paintTurn() {
    marks.querySelectorAll('.dc-turn').forEach(n => n.remove());
    const g = x.selectedNow().length === 1 && x.selectedNow()[0].geometry === 'group' && !x.still() ? x.selectedNow()[0] : null;
    if (!g || g.w == null) return;
    const z = zoom(), cx = g.x + g.w / 2, top = g.y - 22 / z;
    svg('path', { class: 'dc-turn stem', d: `M${cx},${g.y} V${top}`, 'stroke-width': 1 / z });
    const c = svg('circle', { class: 'dc-turn', cx, cy: top, r: 5 / z, 'stroke-width': 1.25 / z });
    c.addEventListener('mousedown', e => e.stopPropagation());
    c.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      const my = g.y + g.h / 2, a0 = Math.atan2(top - my, 0), shadow = svg('rect', { class: 'dc-draft', x: g.x, y: g.y, width: g.w, height: g.h, fill: 'none' });
      let by = 0;
      const move = ev => { const p = local(ev); by = (Math.atan2(p.y - my, p.x - cx) - a0) * 180 / Math.PI; by = ev.shiftKey ? Math.round(by / 15) * 15 : Math.round(by); shadow.setAttribute('transform', `rotate(${by} ${cx} ${my})`); };
      const up = () => { removeEventListener('pointermove', move, true); removeEventListener('pointerup', up, true); shadow.remove(); if (by) turnBy(by, [g]); };
      addEventListener('pointermove', move, true); addEventListener('pointerup', up, true);
    });
  }

  // ---- Set as default: what a shape, a line or a text box looks like, what the next of its family takes ----
  function setDefault() {
    const m = x.selectedNow().find(q => q.type === 'shape' && !['legend', 'group', 'picture'].includes(q.geometry) && !q.role);
    if (!m) return Shell.toast('Select a shape, a line or a text box first', { ms: 2500 });
    const row = x.rowOf(m.id), { Layer, ...format } = row.format ?? {}, fam = family(m.geometry);
    App.change(tx => tx.note('Shape Defaults', { kind: 'View' }, { ...defaults(), [fam]: format }), { dated: false, say: `Set the default ${fam === 'text' ? 'text box' : fam}` });
  }

  // ---- Keys, as PowerPoint's: sizes and turns ----
  // Shift+arrow sizes what's selected, about its middle, as PowerPoint's does, one change a run, as a nudge is.
  let sizing = null;
  function sizeBy(dw, dh) {
    if (x.still()) return Shell.toast(App.whyNot());
    const ms = x.placeableAll().filter(m => !m.locked);
    if (!ms.length) return;
    const key = ms.map(m => m.id).join();
    if (sizing && sizing.key !== key) sized();
    sizing ??= { key, ms, dw: 0, dh: 0, timer: 0 };
    sizing.dw += dw; sizing.dh += dh;
    x.showHandles(null);
    graph.batchUpdate(() => { for (const m of ms) { const c = graph.getCellById(m.id), p = placeOf(m, sizing); if (c?.isNode()) { c.store.set({ position: { x: p.x, y: p.y }, size: { width: p.w, height: p.h } }); x.follow(c); } } });
    clearTimeout(sizing.timer);
    sizing.timer = setTimeout(sized, 600);
  }
  const placeOf = (m, { dw, dh }) => { const locked = x.lockedOf(m), w0 = m.w, h0 = m.h, k = locked ? Math.max((w0 + dw) / w0, (h0 + dh) / h0) : 1, w = Math.max(8, locked ? w0 * k : w0 + dw), ht = Math.max(8, locked ? h0 * k : h0 + dh); return { x: m.x + (w0 - w) / 2, y: m.y + (h0 - ht) / 2, w, h: ht }; };
  function sized() {
    const r = sizing;
    if (!r) return;
    sizing = null;
    clearTimeout(r.timer);
    x.moveTo(new Map(r.ms.map(m => { const p = placeOf(m, r); return [m.id, { ...p, ...(m.points && { dx: 0, dy: 0 }) }]; })));
  }
  const sizeEnds = e => { if (sizing && !(e.type === 'keydown' && /^(Arrow|Shift|Control|Meta)/.test(e.key))) sized(); };
  addEventListener('keydown', sizeEnds, true);
  addEventListener('pointerdown', sizeEnds, true);
  // F4: the last act of a kind that can be done again, done again on what's selected now.
  let last = null;
  const did = fn => { last = fn; };
  const repeat = () => { if (last) { if (x.still()) return Shell.toast(App.whyNot()); last(); return true; } Shell.toast('Nothing to repeat yet', { ms: 2000 }); return true; };
  // Arrows after a click in the panel, on a row that takes no typing and no arrows of its own, go on nudging what's selected.
  const fromPanel = e => {
    if (!/^Arrow/.test(e.key) || e.defaultPrevented || root.contains(e.target) || !x.selectedNow().length || root.clientWidth === 0) return;
    const t = e.target, typed = t.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"]), .CodeMirror, [role=listbox], [role=menu], [role=option], [role=menuitem], [role=tablist], [role=grid], [role=slider], .float, dialog');
    if (typed || !t.closest?.('.insp, .shell-panel, aside, body')) return;
    root.focus({ preventScroll: true });
    root.dispatchEvent(new KeyboardEvent('keydown', { key: e.key, code: e.code, shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, altKey: e.altKey, metaKey: e.metaKey, bubbles: true, cancelable: true }));
    e.preventDefault();
  };
  addEventListener('keydown', fromPanel);

  // ---- The Selection Pane ----
  const paneOpen = signal(false);
  const paneEl = over.appendChild(Object.assign(document.createElement('div'), { className: 'dc-panehost' }));
  const pane = on => { paneOpen.value = on ?? !paneOpen.peek(); if (paneOpen.peek()) paintPane(); else render(null, paneEl); };
  function paintPane() { if (paneOpen.peek()) render(html`<${Pane} key=${x.viewOf()} />`, paneEl); }
  const SHAPE_WORD = { text: 'Text box', legend: 'Key', picture: 'Picture', line: 'Line', group: 'Group', frame: 'Frame' };
  const titleOf = m => m.type === 'box' || m.type === 'line' ? x.called(m) : m.type === 'frame' ? x.called(m) : m.name ?? (m.geometry === 'line' && m.ends?.some(Boolean) ? 'Connector' : m.geometry === 'text' && m.role ? m.texts[0]?.text : m.texts?.[0]?.text?.split('\n')[0] || SHAPE_WORD[m.geometry] || Shapes.name(m.geometry) || 'Shape');
  function reorder(m, to, after) {
    // (To stand just over or under `to`, in the one order: a layer between what's under it and what's over it; where those are of one layer, a layer of its own, and the fewer of them a layer further, so a shape moved among shapes leaves the boxes as they were.)
    const others = scene().marks.filter(q => q !== m && q.geometry !== 'group' && q.type !== 'frame'), layer = q => q.settings?.Layer?.value ?? q.look?.Layer ?? 0, at = others.indexOf(to) + (after ? 1 : 0), under = others.slice(0, at), over = others.slice(at);
    const a = under.length ? layer(under.at(-1)) : layer(over[0]) - 2, b = over.length ? layer(over[0]) : a + 2;
    const put = (tx, q, v) => { if (q.type === 'shape') tx.update(q.id, { format: { ...x.rowOf(q.id)?.format, Layer: v } }); else tx.note('Layer', x.treeOf(q.record), v, { view: x.viewOf() }); };
    App.change(tx => {
      if (a !== b) return put(tx, m, (a + b) / 2);
      const up = over.length <= under.length;
      put(tx, m, a + (up ? 0.5 : -0.5));
      for (const q of up ? over : under) put(tx, q, layer(q) + (up ? 1 : -1));
    }, { dated: false, keep: false, say: `Reordered ${titleOf(m)}` });
  }
  function Pane() {
    App.scene.value; Shell.selection.value;
    const sc = scene(), [naming, setNaming] = useState(null), [drop, setDrop] = useState(null), keys = Shell.selection.value.map(k => Canvas.keyParts(k)[0]), N = App.notes.peek(), ro = x.still();
    if (!sc) return null;
    const rows = [...sc.marks].filter(m => m.geometry !== 'group' && m.type !== 'frame').reverse();
    const hiddenShapes = App.shown.peek().rows(App.chart.peek()).filter(r => 'shape' in r && r.view === sc.view && r.hidden);
    const hiddenBoxes = N.notes('Shown').filter(n => n.view === sc.view && n.value === false && n.pattern.id && App.state.peek()[n.pattern.id]?.kind && !sc.byId.has(n.pattern.id));
    const hide = m => { if (m.type === 'shape') App.change(tx => tx.update(m.id, { hidden: true }), { dated: false, keep: false, say: `Hid ${titleOf(m)}` }); else if (m.type === 'box' || m.type === 'line') App.change(tx => tx.note('Shown', x.treeOf(m.record), false, { view: sc.view }), { dated: false, say: `Hid ${titleOf(m)} in this view` }); };
    const lock = m => App.change(tx => tx.update(m.id, { locked: m.locked ? undefined : true }), { dated: false, keep: false, say: `${m.locked ? 'Unlocked' : 'Locked'} ${titleOf(m)}` });
    const name = (m, v) => { setNaming(null); const t = Tree.clean(v ?? ''); if (m.type === 'shape' && t !== (m.name ?? '')) App.change(tx => tx.update(m.id, { name: t || undefined }), { dated: false, keep: false, say: `Named ${t || 'the shape'}` }); };
    const pick = (e, m) => { if (e.shiftKey || e.ctrlKey || e.metaKey) Shell.select(keys.includes(m.id) ? keys.filter(k => k !== m.id) : [...keys, m.id]); else Shell.select([m.id]); root.focus({ preventScroll: true }); };
    const grab = (e, m) => {
      if (e.button !== 0 || ro || e.target.closest('button, input')) return;
      const y0 = e.clientY;
      let on = null, after = false, moved = false;
      const list = e.currentTarget.parentElement;
      const move = ev => { if (Math.abs(ev.clientY - y0) > 4) moved = true; if (!moved) return; const r = [...list.querySelectorAll('[data-row]')].find(n => { const b = n.getBoundingClientRect(); return ev.clientY >= b.top && ev.clientY < b.bottom; }); if (!r) return; const b = r.getBoundingClientRect(); on = r.dataset.row; after = ev.clientY < b.top + b.height / 2; setDrop({ on, after }); };
      const up = () => { removeEventListener('pointermove', move, true); removeEventListener('pointerup', up, true); setDrop(null); const to = on && sc.byId.get(on); if (moved && to && to !== m) reorder(m, to, after); };
      addEventListener('pointermove', move, true); addEventListener('pointerup', up, true);
    };
    const icon = (n, label, run, off) => html`<button class="btn icon" aria-label=${label} data-tip=${label} disabled=${off} onClick=${e => { e.stopPropagation(); run(); }}>${Shell.icon(n)}</button>`;
    return html`<div class="dc-pane" role="region" aria-label="Selection">
      <header><span>Selection</span><button class="btn icon" aria-label="Close" data-tip="Close" onClick=${() => pane(false)}>${Shell.icon('x')}</button></header>
      <div class="dc-panerows" role="list">
        ${rows.map(m => html`<div class=${'row' + (keys.includes(m.id) ? ' on' : '') + (drop?.on === m.id ? (drop.after ? ' dropabove' : ' dropbelow') : '')} data-row=${m.id} role="listitem" key=${m.id} onClick=${e => pick(e, m)} onPointerDown=${e => grab(e, m)} onDblClick=${() => m.type === 'shape' && !ro && setNaming(m.id)}>
          ${naming === m.id ? html`<input class="cell" value=${m.name ?? titleOf(m)} aria-label="Name" ref=${el => el && !el.dataset.on && (el.dataset.on = 1, el.focus(), el.select())} onBlur=${e => name(m, e.target.value)} onKeyDown=${e => { e.stopPropagation(); if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setNaming(null); }} />` : html`<span class="nm" title=${titleOf(m)}>${titleOf(m)}</span>`}
          ${m.type === 'shape' && !m.role ? icon(m.locked ? 'Lock' : 'LockOpen', m.locked ? 'Unlock' : 'Lock', () => lock(m), ro) : null}
          ${m.role && m.role !== 'footnotes' ? null : icon('Eye', 'Hide', () => hide(m), ro)}
        </div>`)}
        ${hiddenShapes.map(r => html`<div class="row off" key=${r.shape}><span class="nm">${r.name ?? r.text?.split('\n')[0] ?? SHAPE_WORD[r.geometry] ?? Shapes.name(r.geometry) ?? 'Shape'}</span>${icon('EyeOff', 'Show', () => App.change(tx => tx.update(r.shape, { hidden: undefined }), { dated: false, keep: false, say: 'Showed the shape' }), ro)}</div>`)}
        ${hiddenBoxes.map(n => html`<div class="row off" key=${n.note}><span class="nm">${N.nameOf(App.state.peek(), n.pattern.id)}</span>${icon('EyeOff', 'Show', () => App.change(tx => tx.note('Shown', n.pattern, undefined, { view: sc.view }), { dated: false, say: `Showed ${N.nameOf(App.state.peek(), n.pattern.id)}` }), ro)}</div>`)}
      </div></div>`;
  }

  return { arm, disarm, armed: () => !!armed, paint, followLines, duplicate, copyTo, flip, turnBy, angleOf, aimLine, crop, endCrop, changePicture, setDefault, sizeBy, did, repeat, pane, paintPane, paneOpen, guideCells, guideDrag, guidesNow, putGuides, equalGaps, clearGaps, gluable, markAt, newLook,
    destroy() { removeEventListener('pointermove', heldKeys, true); removeEventListener('keydown', sizeEnds, true); removeEventListener('pointerdown', sizeEnds, true); removeEventListener('keydown', fromPanel); disarm(); render(null, paneEl); } };
}
return { attach };
})();
