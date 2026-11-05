// Drawing: what a hand does on a page beyond moving what's there, as PowerPoint's hand expects. Insert draws by dragging; a line
// goes where it's aimed, either end by its handle, and a line's end on a box, a free shape or a text box glues it, with no
// meaning attached; Ctrl+drag and Ctrl+D copy; Shift keeps proportions and snaps a turn, Ctrl sizes from the middle; flip and turn;
// guides from the rulers; equal spacing shown as a thing is dragged; a picture's crop handles; the Selection Pane. Each act is one
// change through App.change, as every gesture of the canvas is, and the canvas draws the scene that follows.
const Drawing = (() => {
const { h, render } = preact;
const html = htm.bind(h);
const { signal, effect } = preactSignals;
const { useState } = preactHooks;
const round = v => Math.round(v * 2) / 2;
const lowered = s => String(s).replace(/\b[A-Z](?=[a-z])/g, c => c.toLowerCase());
// What a line's end can be glued to: a box, or a free shape that has an outline, a table too (not a line, a group, the Key or the page's own texts).
const gluable = m => !!m && !m.revealed && !m.master && (m.type === 'box' || (m.type === 'shape' && !['line', 'group', 'legend'].includes(m.geometry) && !m.role));
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
  let traced = false;
  function disarm() { armed = null; traced = false; const u = unarm; unarm = null; u?.(); root.classList.remove('drawing'); }
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
    // (Being traced point by point, the trace has it.)
    if (traced) return;
    e.preventDefault(); e.stopPropagation();
    // (A text box begun by Insert, its first letter not yet typed, makes nothing as the pointer leaves it.)
    const a = armed;
    over.querySelector('.dc-edit')?.blur();
    if (a.geometry === 'freeform' || a.geometry === 'curve') { traced = true; return trace(a, e); }
    draw(a, e);
  }, true);
  // (The press that draws isn't X6's as well.)
  root.addEventListener('mousedown', e => { if (armed || drawingNow) { e.preventDefault(); e.stopPropagation(); } }, true);
  // Enter, armed: where a new shape goes with no hand to say, in free room near the middle of the screen.
  root.addEventListener('keydown', e => { if (armed && !traced && e.key === 'Enter' && armed.geometry !== 'freeform' && armed.geometry !== 'curve') { e.preventDefault(); e.stopPropagation(); const a = armed; disarm(); x.insert(a.geometry, { ...a.opts, format: newLook(a.geometry, a.opts.format) }); } }, true);

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
  const flippable = m => m.type === 'shape' && !['legend', 'group', 'table'].includes(m.geometry) && !m.role;
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
  // ---- A table on the page: a cell picked and typed in, as Excel's and PowerPoint's; a row or column added or taken away; a rule dragged ----
  // A cell picked, and with Shift, a drag or Ctrl+A, a range of them: `r`, `c` where it began, `r2`, `c2` where it's got to, each as drawn. What's joined comes whole.
  let cellNow = null;
  const tableOfRow = id => x.rowOf(id)?.table;
  const blank = n => Array.from({ length: n }, () => ({ text: '' }));
  const putTable = (id, table, say, more = {}) => App.change(tx => tx.update(id, { table, ...more }), { dated: false, keep: false, say });
  const cellAt = t => { const v = t?.closest?.('[data-tcell]')?.getAttribute('data-tcell'); return v ? v.split(',').map(Number) : null; };
  // The cell a point falls in, as drawn, a joined one by its first row and column; held to the table, for a drag that's left it.
  function cellOver(m, p) {
    const px = Math.max(0, Math.min(m.w - 0.01, p.x - m.x)), py = Math.max(0, Math.min(m.h - 0.01, p.y - m.y));
    for (const r of m.table.rows) for (const k of r.cells) if (!k.covered && px >= k.x && px < k.x + k.w && py >= r.y && py < r.y + k.h) return [r.i, k.c];
    return null;
  }
  // The range as rows and columns, grown till nothing joined is cut by it.
  function rangeOf(m, at = cellNow) {
    if (!at || at.id !== m.id) return null;
    let r0 = Math.min(at.r, at.r2 ?? at.r), r1 = Math.max(at.r, at.r2 ?? at.r), c0 = Math.min(at.c, at.c2 ?? at.c), c1 = Math.max(at.c, at.c2 ?? at.c);
    for (let again = true; again;) {
      again = false;
      for (const r of m.table.rows) for (const k of r.cells) {
        if (k.covered) continue;
        const b = r.i + (k.down ?? 1) - 1, e = k.c + (k.across ?? 1) - 1;
        if (r.i <= r1 && b >= r0 && k.c <= c1 && e >= c0 && (r.i < r0 || b > r1 || k.c < c0 || e > c1)) { r0 = Math.min(r0, r.i); r1 = Math.max(r1, b); c0 = Math.min(c0, k.c); c1 = Math.max(c1, e); again = true; }
      }
    }
    return { r0, r1, c0, c1 };
  }
  // The cells of the range, as drawn, what's joined under another left out. → [{ r, k }]
  const inRange = (m, g = rangeOf(m)) => !g ? [] : m.table.rows.filter(r => r.i >= g.r0 && r.i <= g.r1).flatMap(r => r.cells.filter(k => !k.covered && k.c >= g.c0 && k.c <= g.c1).map(k => ({ r, k })));
  function paintCell() {
    marks.querySelectorAll('.dc-tcell').forEach(n => n.remove());
    if (!cellNow) return;
    const m = scene().byId.get(cellNow.id), g = m?.table && rangeOf(m), a = g && m.table.rows[g.r0], b = g && m.table.rows[g.r1];
    if (!a || !b || !sel.getSelectedCells().some(c => c.id === cellNow.id)) { cellNow = null; Canvas.fieldPicked.value = null; return; }
    const last = m.table.rows[g.r1], w = m.table.xs[g.c1] + m.table.cols[g.c1] - m.table.xs[g.c0], bottom = Math.max(...inRange(m, g).map(({ r, k }) => r.y + k.h), last.y);
    svg('rect', { class: `dc-tcell${inRange(m, g).length > 1 ? ' range' : ''}`, x: m.x + m.table.xs[g.c0], y: m.y + a.y, width: w, height: bottom - a.y, 'stroke-width': 2 / zoom() });
  }
  function pickCell(id, r, c) { cellNow = { id, r, c }; paintCell(); Canvas.fieldPicked.value = `${id}|${r},${c}`; }
  // As far as (r, c) from where it began.
  function reach(id, r, c) { if (cellNow?.id !== id) return pickCell(id, r, c); cellNow = { ...cellNow, r2: r, c2: c }; paintCell(); Canvas.fieldPicked.value = `${id}|${cellNow.r},${cellNow.c}|${r},${c}`; }
  const rangeIsOne = m => inRange(m).length <= 1;
  // Keeps what's typed, as a table's cell, at what it was written at: a row a list repeats is one row's words, read for each.
  function setCell(id, src, c, text, runs) {
    const t = tableOfRow(id), was = t.rows[src]?.cells?.[c];
    if ((was?.text ?? '') === text && JSON.stringify(was?.runs ?? []) === JSON.stringify(runs ?? was?.runs ?? [])) return true;
    return putTable(id, { ...t, rows: t.rows.map((r, i) => i !== src ? r : { ...r, cells: r.cells.map((k, j) => { if (j !== c) return k; const { runs: _, ...rest } = k; return { ...rest, text, ...(runs?.length && { runs }) }; }) }) });
  }
  // What a cell can read, offered by `{` and on its right-click: a row a list repeats, what the list's relatives say and what's at the relation; else the record the table reads.
  function fieldsAt(m, src) {
    const t = tableOfRow(m.id), each = t?.rows[src]?.each;
    if (each) { const st = App.state.peek(), l = Scene.listsAt(st, App.notes.peek(), each.of).find(q => Tree.same(q.name, each.list)); return !l ? [] : [...new Set([l.edge, ...l.items.flatMap(it => (Tree.index(st).entries.get(it.rid) ?? []).map(e => st[e].edge))])]; }
    return t?.of ? x.entriesOf({ record: t.of }) : [];
  }
  function editCell(m, target, typed) {
    if (x.still()) return;
    const at = cellAt(target) ?? (cellNow?.id === m.id ? [cellNow.r, cellNow.c] : [0, 0]), r = m.table.rows[at[0]], k = r?.cells[at[1]];
    if (!k || k.covered) return;
    pickCell(m.id, at[0], at[1]);
    const said = tableOfRow(m.id)?.rows[r.src]?.cells?.[at[1]], raw = said?.text ?? '';
    x.openEditor({ look: k.it.look, text: raw, lines: [] }, { x: m.x + k.x, y: m.y + r.y, w: k.w, h: k.h }, typed ?? raw, (text, keys, runs) => {
      setCell(m.id, r.src, at[1], text, runs);
      // Enter goes on down its column, as Excel's does.
      if (keys) setTimeout(() => { const n = scene().byId.get(m.id), down = at[0] + (k.down ?? 1); if (n?.table?.rows[down]) { const q = n.table.rows[down].cells[at[1]]; if (!q.covered) { pickCell(m.id, down, at[1]); editCell(n); } } });
    }, { selectAll: typed === undefined, kept: true, tab: d => stepCell(m.id, at, d), complete: fieldsAt(m, r.src), rich: { runs: typed !== undefined ? [] : said?.runs ?? [] } });
  }
  // Tab goes on to the next cell, what's joined being one, and past the last adds a row, as PowerPoint's does; Shift+Tab the one before.
  function stepCell(id, [r, c], d) {
    let n = scene().byId.get(id);
    if (!n) return;
    const cols = n.table.cols.length;
    for (let at = r * cols + c + d; at >= 0 && at < n.table.rows.length * cols; at += d) {
      const q = n.table.rows[Math.floor(at / cols)].cells[at % cols];
      if (q.covered) continue;
      pickCell(id, Math.floor(at / cols), at % cols);
      return editCell(n);
    }
    if (d < 0) return;
    const t = tableOfRow(id), src = n.table.rows.at(-1).src, rows = n.table.rows.length;
    if (!putTable(id, { ...t, rows: [...t.rows.slice(0, src + 1), { cells: blank(cols) }, ...t.rows.slice(src + 1)] }, 'Added a row', { h: round(n.h + n.h / rows) })) return;
    return setTimeout(() => { const q = scene().byId.get(id); if (q) { pickCell(id, rows, 0); editCell(q); } });
  }
  // A row taken in or out at `i`: what's joined across it longer or shorter, and what stood in the row going out, its words and its join, handed to the next.
  const rowsWithNew = (t, i) => ({ ...t, rows: [...t.rows.slice(0, i), { cells: blank(t.cols.length) }, ...t.rows.slice(i)].map((r, y) => y >= i ? r : { ...r, cells: r.cells.map(k => (k.down ?? 1) > 1 && y + k.down > i ? { ...k, down: k.down + 1 } : k) }) });
  const colsWithNew = (t, i, share) => ({ ...t, cols: [...t.cols.slice(0, i), share, ...t.cols.slice(i)], rows: t.rows.map(r => ({ ...r, cells: [...r.cells.slice(0, i).map((k, j) => (k.across ?? 1) > 1 && j + k.across > i ? { ...k, across: k.across + 1 } : k), { text: '' }, ...r.cells.slice(i)] })) });
  function rowsLess(t, i) {
    const gone = t.rows[i], next = t.rows[i + 1];
    return { ...t, rows: t.rows.map((r, y) => y === i + 1 ? { ...r, cells: r.cells.map((k, j) => (gone.cells[j]?.down ?? 1) > 1 ? { ...gone.cells[j], down: gone.cells[j].down - 1 } : k) } : y < i ? { ...r, cells: r.cells.map(k => (k.down ?? 1) > 1 && y + k.down > i ? { ...k, down: k.down - 1 } : k) } : r).filter((_, y) => y !== i) };
  }
  function colsLess(t, i) {
    return { ...t, cols: t.cols.filter((_, j) => j !== i), rows: t.rows.map(r => ({ ...r, cells: r.cells.map((k, j) => j === i + 1 && (r.cells[i]?.across ?? 1) > 1 ? { ...r.cells[i], across: r.cells[i].across - 1 } : j < i && (k.across ?? 1) > 1 && j + k.across > i ? { ...k, across: k.across - 1 } : k).filter((_, j) => j !== i) })) };
  }
  function rowInto(m, below) {
    const t = tableOfRow(m.id), at = cellNow?.id === m.id ? rangeOf(m) : null, i = (m.table.rows[at ? (below ? at.r1 : at.r0) : 0] ?? m.table.rows[0]).src + (below ? 1 : 0);
    putTable(m.id, rowsWithNew(t, i), 'Added a row', { h: round(m.h + m.h / m.table.rows.length) });
  }
  function columnInto(m, right) {
    const t = tableOfRow(m.id), at = cellNow?.id === m.id ? rangeOf(m) : null, i = (at ? (right ? at.c1 : at.c0) : 0) + (right ? 1 : 0), cols = t.cols;
    putTable(m.id, colsWithNew(t, i, cols.reduce((a, b) => a + b, 0) / cols.length), 'Added a column');
  }
  function rowOut(m) {
    const t = tableOfRow(m.id), g = (cellNow?.id === m.id ? rangeOf(m) : null) ?? { r0: 0, r1: 0 }, srcs = [...new Set(m.table.rows.filter(r => r.i >= g.r0 && r.i <= g.r1).map(r => r.src))].sort((a, b) => b - a);
    if (t.rows.length <= srcs.length) return App.change(tx => tx.remove(m.id), { dated: false, say: 'Deleted the table' });
    cellNow = null;
    putTable(m.id, srcs.reduce(rowsLess, t), srcs.length > 1 ? `Deleted ${srcs.length} rows` : 'Deleted a row', { h: round(m.h * (m.table.rows.length - srcs.length) / m.table.rows.length) });
  }
  function columnOut(m) {
    const t = tableOfRow(m.id), g = (cellNow?.id === m.id ? rangeOf(m) : null) ?? { c0: 0, c1: 0 }, n = g.c1 - g.c0 + 1;
    if (t.cols.length <= n) return App.change(tx => tx.remove(m.id), { dated: false, say: 'Deleted the table' });
    cellNow = null;
    putTable(m.id, Array.from({ length: n }, (_, j) => g.c1 - j).reduce(colsLess, t), n > 1 ? `Deleted ${n} columns` : 'Deleted a column');
  }
  // What's selected of the table joined as one: its words, each cell's in reading order, in the first; as PowerPoint's Merge Cells. A row a list repeats is joined across, never down.
  function mergeCells(m) {
    const g = rangeOf(m), t = tableOfRow(m.id);
    if (!g || rangeIsOne(m)) return;
    const shown = m.table.rows.filter(r => r.i >= g.r0 && r.i <= g.r1), srcs = shown.map(r => r.src);
    if (srcs.length > 1 && (new Set(srcs).size < srcs.length || srcs.some(s => t.rows[s]?.each))) return Shell.toast('A row a list repeats joins across, not down', { ms: 3000 });
    const first = srcs[0], words = srcs.flatMap(s => t.rows[s].cells.slice(g.c0, g.c1 + 1).map(k => k.text)).filter(w => String(w ?? '').trim()).join(' ');
    cellNow = { id: m.id, r: g.r0, c: g.c0 };
    putTable(m.id, { ...t, rows: t.rows.map((r, y) => !srcs.includes(y) ? r : { ...r, cells: r.cells.map((k, j) => {
      if (j < g.c0 || j > g.c1) return k;
      const { across: _a, down: _d, runs: _r, ...rest } = k;
      return y === first && j === g.c0 ? { ...rest, text: words, ...(g.c1 > g.c0 && { across: g.c1 - g.c0 + 1 }), ...(srcs.length > 1 && { down: srcs.length }) } : { text: '' };
    }) }) }, `Merged ${inRange(m, g).length} cells`);
  }
  // A cell joined comes apart, its words in its first; one that isn't is cut in two, its column or row made in two for it, the rest of that column or row staying whole as one cell over the two, as PowerPoint's Split Cells.
  function unmerge(m) {
    const t = tableOfRow(m.id), cells = inRange(m).filter(({ k }) => k.across || k.down);
    if (!cells.length) return;
    putTable(m.id, { ...t, rows: t.rows.map((r, y) => ({ ...r, cells: r.cells.map((k, j) => { if (!cells.some(q => q.r.src === y && q.k.c === j)) return k; const { across: _a, down: _d, ...rest } = k; return rest; }) })) }, cells.length > 1 ? `Split ${cells.length} cells` : 'Split the cell');
  }
  function splitAcross(m) {
    const at = cellNow?.id === m.id ? cellNow : null, r = at && m.table.rows[at.r], k = r?.cells[at.c];
    if (!k) return;
    const t = tableOfRow(m.id), end = k.c + (k.across ?? 1), after = colsWithNew(t, end, t.cols[end - 1] / 2);
    // (What's in its column, in the rows but this one, runs over the new one too.)
    const rows = after.rows.map((row, y) => { if (y >= r.src && y < r.src + (k.down ?? 1)) return row; const headAt = row.cells.findIndex((q, j) => j < end && j + (q.across ?? 1) >= end); return headAt < 0 || (row.cells[headAt].across ?? 1) > 1 && headAt + row.cells[headAt].across > end ? row : { ...row, cells: row.cells.map((q, j) => j === headAt ? { ...q, across: (q.across ?? 1) + 1 } : q) }; });
    putTable(m.id, { ...after, cols: after.cols.map((w, j) => j === end - 1 ? w / 2 : w), rows }, 'Split the cell into two columns');
  }
  function splitDown(m) {
    const at = cellNow?.id === m.id ? cellNow : null, r = at && m.table.rows[at.r], k = r?.cells[at.c], t = tableOfRow(m.id);
    if (!k) return;
    if (t.rows[r.src]?.each) return Shell.toast('A row a list repeats joins across, not down', { ms: 3000 });
    const end = r.src + (k.down ?? 1), after = rowsWithNew(t, end), last = end - 1;
    // (What's beside it, in the row it was in, runs over the new one too; and it's in the columns it was.)
    const rows = after.rows.map((row, y) => { if (y !== last && !(y < last && row.cells.some((q, j) => y + (q.down ?? 1) > last))) return row; return { ...row, cells: row.cells.map((q, j) => j >= k.c && j < k.c + (k.across ?? 1) ? q : y + (q.down ?? 1) === last + 1 ? { ...q, down: (q.down ?? 1) + 1 } : q) }; });
    putTable(m.id, { ...after, rows }, 'Split the cell into two rows', { h: round(m.h + m.h / m.table.rows.length) });
  }
  // A blank table told to read a record shows it: a row for each of what it has, what it's called and what it says.
  function readsFrom(id, of) {
    const m = scene().byId.get(id), t = tableOfRow(id), st = App.state.peek(), N = App.notes.peek();
    if (!of) return putTable(id, { ...t, of: undefined }, 'The table reads nothing now');
    const name = N.nameOf(st, of), blankNow = t.rows.every(r => r.cells.every(k => !String(k.text ?? '').trim())), said = (Tree.index(st).entries.get(of) ?? []).map(e => st[e].edge), list = [...new Set(said)];
    if (!blankNow || t.cols.length < 2 || !list.length) return putTable(id, { ...t, of }, `Made the table read ${name}`);
    const rows = [...(t.header === false ? [] : [{ cells: t.cols.map((_, j) => ({ text: j === 0 ? name : '' })) }]), ...list.map(e => ({ cells: t.cols.map((_, j) => ({ text: j === 0 ? e : j === 1 ? `{${e}}` : '' })) }))];
    putTable(id, { ...t, of, rows }, `Made the table read ${name}`, { h: round(m.h * rows.length / m.table.rows.length) });
  }
  // A table's look, as PowerPoint's Table Styles: what its heading, rules and bands are, from the chart's colors.
  const HAIR = '#a6a6a6';
  const TABLE_STYLES = [['Hairlines', a => ({ Fill: 'none', Outline: HAIR, rules: 'across', banded: false, headRule: a })], ['Heading in color', a => ({ Fill: a, Outline: HAIR, rules: 'across', banded: false })], ['Soft heading', a => ({ Fill: Shapes.shaded(a, 0.2, 0.8), Outline: HAIR, rules: 'across', banded: false })],
    ['Bands', a => ({ Fill: a, Outline: 'none', rules: 'none', banded: true })], ['Soft bands', a => ({ Fill: Shapes.shaded(a, 0.2, 0.8), Outline: 'none', rules: 'none', banded: true })], ['Grid', a => ({ Fill: 'none', Outline: HAIR, rules: 'grid', banded: false, headRule: a })], ['Grid in color', a => ({ Fill: a, Outline: a, rules: 'grid', banded: false })], ['Plain', a => ({ Fill: 'none', Outline: 'none', rules: 'none', banded: false })]];
  // The chart's own colors a table's style can take: its palette's accents, or what it draws in.
  function tableAccents() {
    const p = FormatBar.paletteOf?.(), own = p ? p.colors.slice(4, 8) : FormatBar.chartAccents?.() ?? [];
    return (own.length ? own : ['#1f3a5f', '#44546a']).slice(0, 4);
  }
  function giveStyle(id, name, accent) {
    const row = x.rowOf(id), o = TABLE_STYLES.find(s => s[0] === name)?.[1](accent);
    if (!row || !o) return;
    const { Fill, Outline, rules, banded, headRule } = o, { headRule: _, ...t } = row.table;
    App.change(tx => tx.update(id, { table: { ...t, rules, banded, ...(headRule && { headRule }) }, format: { ...row.format, Fill, Outline } }), { dated: false, keep: false, say: `Gave the table the style ${name}` });
  }
  // What a style's look draws, small: a heading, rules and bands, as the gallery of designs draws what's real.
  function styleTile(o, accent) {
    const W = 54, H = 36, n = 4, rh = H / n, head = o.Fill !== 'none' ? o.Fill : null, band = o.banded ? (head ? Shapes.shaded(head, 0.1, 0.9) : '#f2f2f2') : null, line = o.Outline !== 'none' ? o.Outline : null;
    const inked = head && Scene.tooDark?.({ Fill: head }) ? '#ffffff' : '#44505c';
    return html`<svg viewBox="0 0 ${W} ${H}" width=${W} height=${H} aria-hidden="true">
      ${head ? html`<rect width=${W} height=${rh} fill=${head} />` : null}
      ${band ? [1, 3].map(i => html`<rect y=${i * rh} width=${W} height=${rh} fill=${band} />`) : null}
      ${line ? [0, 1, 2, 3, 4].filter(i => !head || i > 1 || line === o.Fill).map(i => html`<path d="M0,${i * rh - (i === 4 ? 0.5 : 0)} H${W}" stroke=${line} stroke-width="0.75" />`) : null}
      ${line && o.rules === 'grid' ? [0, 1, 2, 3].map(i => html`<path d="M${i * W / 3 - (i === 3 ? 0.5 : 0) + (i ? 0 : 0.5)},0 V${H}" stroke=${line} stroke-width="0.75" />`) : null}
      ${o.headRule ? html`<path d="M0,${rh} H${W}" stroke=${o.headRule} stroke-width="1.5" />` : null}
      ${[0, 1, 2, 3].map(i => [0, 1, 2].map(j => html`<rect x=${4 + j * W / 3} y=${i * rh + rh / 2 - 1.25} width=${W / 3 - 8} height="2.5" rx="1" fill=${i === 0 ? (head ? inked : '#44505c') : '#b5bcc4'} />`))}
    </svg>`;
  }
  // The gallery: a color, then each style drawn in it, at the pointer, drawn on the chart as it's pointed at.
  function StyleGallery({ id, close }) {
    const accents = tableAccents(), [a, setA] = useState(x.rowOf(id)?.table?.headRule ?? (x.rowOf(id)?.format?.Fill && x.rowOf(id).format.Fill !== 'none' ? x.rowOf(id).format.Fill : accents[0]));
    const row = x.rowOf(id), now = o => (row?.table?.rules ?? 'across') === o.rules && (row?.table?.banded !== false) === o.banded && (row?.format?.Fill ?? 'none') === o.Fill;
    return html`<div class="tstyles" role="group" aria-label="Table style">
      <div class="tcolors" role="group" aria-label="Color">${accents.map(c => html`<button type="button" class=${c === a ? 'on' : ''} aria-label=${FormatBar.colorName?.(c) ?? c} aria-pressed=${c === a} style=${`background:${c}`} onClick=${() => setA(c)} />`)}</div>
      <div class="ttiles" data-grid=":scope > button">${TABLE_STYLES.map(([name, make]) => { const o = make(a); return html`<button type="button" class=${now(o) ? 'on' : ''} aria-label=${name} data-tip=${name} aria-pressed=${now(o)} onClick=${() => { close?.(); giveStyle(id, name, a); }}>${styleTile(o, a)}</button>`; })}</div>
    </div>`;
  }
  const under = m => { const p = graph.localToClient(m.x, m.y + m.h); return { x: p.x, y: p.y }; };
  const styleGallery = (at, id) => Shell.popover(at, close => html`<${StyleGallery} id=${id} close=${close} />`, { placement: 'bottom-start' });
  // The right-click's: what it does to the cell the pointer was on, its rows and its columns; the cells selected joined or apart; a heading row and bands, as PowerPoint's table options; its style; and where it reads from, with what's there to read.
  function tableItems(m, ro) {
    const t = tableOfRow(m.id) ?? {}, g = cellNow?.id === m.id ? rangeOf(m) : null, picked = !!g, many = picked && !rangeIsOne(m), joined = picked && inRange(m).some(({ k }) => k.across || k.down), cellK = picked && m.table.rows[cellNow.r]?.cells[cellNow.c], src = picked ? m.table.rows[cellNow.r]?.src : null;
    const fields = picked ? fieldsAt(m, src) : [], st = App.state.peek(), N = App.notes.peek(), boxes = scene().marks.filter(b => b.type === 'box').map(b => b.record), rowsN = g ? g.r1 - g.r0 + 1 : 1, colsN = g ? g.c1 - g.c0 + 1 : 1;
    const putField = e => { const said = t.rows[src]?.cells?.[cellNow.c], was = String(said?.text ?? ''); setCell(m.id, src, cellNow.c, `${was}${was && !/\s$/.test(was) ? ' ' : ''}{${e}}`); };
    return [{ label: 'Edit cell', keys: 'Enter', disabled: ro, run: () => editCell(m) },
      ...(fields.length ? [{ label: 'Field', disabled: ro, items: fields.map(e => ({ label: e, run: () => putField(e) })) }] : []),
      { label: 'Insert', disabled: ro, items: [{ label: 'Row above', run: () => rowInto(m, false) }, { label: 'Row below', run: () => rowInto(m, true) }, { label: 'Column left', run: () => columnInto(m, false) }, { label: 'Column right', run: () => columnInto(m, true) }] },
      { label: 'Delete rows or columns', disabled: ro, items: [{ label: rowsN > 1 ? `These ${rowsN} rows` : 'This row', run: () => rowOut(m) }, { label: colsN > 1 ? `These ${colsN} columns` : 'This column', run: () => columnOut(m) }] },
      { label: 'Merge cells', disabled: ro || !many, run: () => mergeCells(m) },
      { label: 'Split cell', disabled: ro || !picked, items: [...(joined ? [{ label: 'Unmerge', run: () => unmerge(m) }, '-'] : []), { label: 'Into two columns', disabled: many, run: () => splitAcross(m) }, { label: 'Into two rows', disabled: many, run: () => splitDown(m) }] },
      '-',
      { label: 'Table style…', disabled: ro, run: () => styleGallery(under(m), m.id) },
      { label: 'Heading row', checked: t.header !== false, disabled: ro, run: () => putTable(m.id, { ...t, header: t.header === false }, t.header === false ? 'Gave the table a heading row' : 'Took the heading row off') },
      { label: 'Banded rows', checked: t.banded !== false, disabled: ro, run: () => putTable(m.id, { ...t, banded: t.banded === false }, t.banded === false ? 'Banded the table' : 'Took the bands off') },
      ...(boxes.length ? [{ label: 'Reads', disabled: ro, items: [{ label: 'Nothing', checked: !t.of, run: () => readsFrom(m.id, null) }, '-', ...boxes.map(b => ({ label: N.nameOf(st, b), checked: t.of === b, run: () => readsFrom(m.id, b) }))] }] : []),
      '-'];
  }
  // A table drawn in free room, its first cell open to type in, in hairlines and the chart's first color; with `of` a record and `list` one of its lists, one that reads that list, live: a heading, a row for each relative, and where it holds figures, a total.
  function newTable(rows, cols, o = {}) {
    const s = x.scale(), row = o.list ? capTable(o.of, o.list) : { cols: Array(cols).fill(1), rows: Array.from({ length: rows }, () => ({ cells: blank(cols) })), header: true, banded: false, rules: 'across', headRule: tableAccents()[0] };
    if (!row) return null;
    const n = row.rows.length + (o.list ? Math.max(0, (Scene.listsAt(App.state.peek(), App.notes.peek(), o.of).find(l => l.name === o.list)?.items.length ?? 1) - 1) : 0), w = round((o.list ? row.cols.reduce((a, b) => a + b, 0) : Math.max(120 + (row.cols.length - 1) * 90, 240)) / s), h = round(n * 26 / s);
    const id = x.insert('table', { w, h, table: row });
    if (id && !o.list) setTimeout(() => { const m = scene().byId.get(id); if (m) editCell(m, null); });
    return id;
  }
  function capTable(of, list) {
    const st = App.state.peek(), N = App.notes.peek(), l = Scene.listsAt(st, N, of).find(q => q.name === list);
    if (!l) return null;
    const entries = [...new Set(l.items.flatMap(it => (Tree.index(st).entries.get(it.rid) ?? []).filter(e => 'value' in st[e] || 'choice' in st[e]).map(e => st[e].edge)))];
    const figures = entries.filter(e => l.items.some(it => /^\s*-?[\d,.]+\s*%?\s*$/.test(String((Tree.index(st).entries.get(it.rid) ?? []).map(q => st[q]).find(q => q.edge === e)?.value ?? '')) || /percent/i.test(e)));
    const heads = [l.edge, ...entries], tokens = heads.map(e => `{${e}}`);
    const rows = [{ cells: heads.map(text => ({ text })) }, { each: { of, list }, cells: tokens.map(text => ({ text })) }, ...(figures.length ? [{ cells: heads.map((e, i) => ({ text: !i ? 'Total' : figures.includes(e) ? '=SUM(ABOVE)' : '' })) }] : [])];
    // (Each column as wide as its heading's longest word, so none breaks in two; the first, of names, twice the rest.)
    const fit = h => Math.ceil(Math.max(...h.split(/\s+/).map(w => Scene.measure(w, { Bold: true, Size: 10 }))) + 21);
    return { of, cols: heads.map((h, i) => Math.max(i ? 75 : 150, fit(h))), rows, header: true, banded: false, rules: 'across', headRule: tableAccents()[0] };
  }
  // A rule between two columns, dragged: what one gains the other gives, one change.
  x.gEl.addEventListener('mousedown', e => {
    const at = e.button === 0 && e.target.closest?.('[data-tcol]');
    if (!at || x.still()) return;
    const id = e.target.closest('[data-cell-id]')?.getAttribute('data-cell-id'), m = id && scene().byId.get(id);
    if (m?.geometry !== 'table') return;
    e.stopPropagation(); e.preventDefault();
    // (No narrower either side than its longest word, so words stay apart: Scene's tableOf.)
    const i = +at.getAttribute('data-tcol'), t = m.table, x0 = local(e).x, ghost = svg('path', { class: 'dc-draft', d: `M${m.x + t.xs[i + 1]},${m.y} V${m.y + m.h}` }), lo = t.xs[i] + Math.max(t.least?.[i] ?? 0, 12 / x.scale()), hi = t.xs[i + 1] + t.cols[i + 1] - Math.max(t.least?.[i + 1] ?? 0, 12 / x.scale());
    let at0 = t.xs[i + 1];
    const move = ev => { at0 = Math.max(lo, Math.min(hi, t.xs[i + 1] + local(ev).x - x0)); ghost.setAttribute('d', `M${m.x + at0},${m.y} V${m.y + m.h}`); };
    const up = () => {
      removeEventListener('mousemove', move, true); removeEventListener('mouseup', up, true); ghost.remove();
      const d = at0 - t.xs[i + 1];
      if (Math.abs(d) < 0.5) return;
      const cols = t.cols.map((w, k) => (k === i ? w + d : k === i + 1 ? w - d : w) / m.w);
      putTable(id, { ...tableOfRow(id), cols: cols.map(v => Math.round(v * 1e4) / 1e4) }, 'Sized a column');
    };
    addEventListener('mousemove', move, true); addEventListener('mouseup', up, true);
  }, true);
  // A press in a table picks the cell under it, the first selecting the table; a drag from there, or Shift, goes as far as the cell it gets to, as Excel's does. (It's by its grip or its edge that a table's moved: see paintGrip.)
  function pressCell(e, m) {
    const at = cellAt(e.target) ?? (e.target.closest?.('[data-link]') ? cellOver(m, local(e)) : null);
    if (!at || e.button !== 0) return;
    if (e.shiftKey && cellNow?.id === m.id) reach(m.id, at[0], at[1]); else pickCell(m.id, at[0], at[1]);
    const move = ev => { const q = scene().byId.get(m.id), g = q?.table && cellOver(q, local(ev)); if (g && (g[0] !== (cellNow?.r2 ?? cellNow?.r) || g[1] !== (cellNow?.c2 ?? cellNow?.c))) reach(m.id, g[0], g[1]); };
    const up = () => { removeEventListener('mousemove', move, true); removeEventListener('mouseup', up, true); };
    addEventListener('mousemove', move, true); addEventListener('mouseup', up, true);
  }
  graph.on('node:mousedown', ({ e, node }) => { const m = scene().byId.get(node.id); if (m?.geometry === 'table' && sel.isSelected(node) && !e.shiftKey && !e.ctrlKey && !e.metaKey) pressCell(e, m); });
  // (With Shift, a table selected isn't taken off the selection: it's the cells that go on.)
  x.gEl.addEventListener('mousedown', e => { if (!e.shiftKey || !cellNow || e.button !== 0) return; const id = e.target.closest?.('[data-tcell]') && e.target.closest('[data-cell-id]')?.getAttribute('data-cell-id'), m = id === cellNow.id && scene().byId.get(id); if (!m?.table) return; e.preventDefault(); e.stopPropagation(); pressCell(e, m); }, true);
  // The pointer's right-click picks the cell under it, unless that's among those picked.
  x.gEl.addEventListener('contextmenu', e => { const at = cellAt(e.target), id = at && e.target.closest('[data-cell-id]')?.getAttribute('data-cell-id'), m = id && scene().byId.get(id), g = m && rangeOf(m); if (id && !(g && at[0] >= g.r0 && at[0] <= g.r1 && at[1] >= g.c0 && at[1] <= g.c1)) { cellNow = { id, r: at[0], c: at[1] }; Canvas.fieldPicked.value = `${id}|${at[0]},${at[1]}`; setTimeout(paintCell); } }, true);
  // The keys, a cell picked: the arrows go from cell to cell, what's joined being one, and with Shift, a range, Ctrl+A the whole table, again everything; Enter or a letter types in it, Delete clears what's picked, Esc goes back to the table.
  root.addEventListener('keydown', e => {
    if (!cellNow || e.target.closest?.('.dc-edit')) return;
    const m = scene().byId.get(cellNow.id);
    if (!m?.table) return;
    const step = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
    if (step && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault(); e.stopPropagation();
      const from = e.shiftKey ? [cellNow.r2 ?? cellNow.r, cellNow.c2 ?? cellNow.c] : [cellNow.r, cellNow.c], here = m.table.rows[from[0]]?.cells[from[1]], r = from[0] + (step[0] > 0 ? here?.down ?? 1 : step[0]), c = from[1] + (step[1] > 0 ? here?.across ?? 1 : step[1]), q = m.table.rows[r]?.cells[c];
      if (!q) return;
      const head = q.covered ? (rc => rc)(cellOver(m, { x: m.x + q.x + 0.5, y: m.y + m.table.rows[r].y + 0.5 })) : [r, c];
      if (e.shiftKey) reach(m.id, head[0], head[1]); else pickCell(m.id, head[0], head[1]);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && !e.shiftKey) { const g = rangeOf(m); if (g.r0 === 0 && g.c0 === 0 && g.r1 === m.table.rows.length - 1 && g.c1 === m.table.cols.length - 1) { cellNow = null; Canvas.fieldPicked.value = null; paintCell(); return; } e.preventDefault(); e.stopPropagation(); cellNow = { id: m.id, r: 0, c: 0, r2: m.table.rows.length - 1, c2: m.table.cols.length - 1 }; paintCell(); Canvas.fieldPicked.value = `${m.id}|all`; return; }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cellNow = null; Canvas.fieldPicked.value = null; paintCell(); return; }
    if (x.still()) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault(); e.stopPropagation();
      const t = tableOfRow(m.id), on = inRange(m), n = on.filter(({ r, k }) => String(t.rows[r.src]?.cells?.[k.c]?.text ?? '')).length;
      if (n) putTable(m.id, { ...t, rows: t.rows.map((r, y) => ({ ...r, cells: r.cells.map((k, j) => { if (!on.some(q => q.r.src === y && q.k.c === j)) return k; const { runs: _, ...rest } = k; return { ...rest, text: '' }; }) })) }, n > 1 ? `Cleared ${n} cells` : 'Cleared a cell');
      return;
    }
    if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); e.stopPropagation(); editCell(m); return; }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); e.stopPropagation(); editCell(m, null, e.key); }
  }, true);
  // The clipboard, a cell picked: cells go out as a spreadsheet takes them, tabs and lines, and what comes in fills from the cell picked, as far as it goes, the table growing for it, as Excel's and PowerPoint's.
  const cellsClip = e => {
    if (!cellNow || !root.contains(document.activeElement) || document.activeElement.closest?.('.dc-edit')) return;
    const m = scene().byId.get(cellNow.id), t = tableOfRow(cellNow.id);
    if (!m?.table || !t) return;
    if (e.type === 'paste') {
      const said = e.clipboardData?.getData('text/plain');
      if (!said || x.still()) return;
      e.preventDefault(); e.stopImmediatePropagation();
      const lines = said.replace(/\r/g, '').replace(/\n$/, '').split('\n').map(l => l.split('\t')), r0 = m.table.rows[cellNow.r].src, c0 = cellNow.c, wide = Math.max(t.cols.length, c0 + Math.max(...lines.map(l => l.length))), avg = t.cols.reduce((a, b) => a + b, 0) / t.cols.length;
      let next = t; while (next.cols.length < wide) next = colsWithNew(next, next.cols.length, avg);
      while (next.rows.length < r0 + lines.length) next = rowsWithNew(next, next.rows.length);
      next = { ...next, rows: next.rows.map((r, y) => y < r0 || y >= r0 + lines.length ? r : { ...r, cells: r.cells.map((k, j) => { const w = lines[y - r0][j - c0]; if (j < c0 || w === undefined) return k; const { runs: _, ...rest } = k; return { ...rest, text: w }; }) }) };
      const added = next.rows.length - t.rows.length;
      return putTable(m.id, next, `Pasted ${lines.flat().length === 1 ? 'a cell' : `${lines.flat().length} cells`}`, added ? { h: round(m.h * next.rows.length / t.rows.length) } : {});
    }
    const g = rangeOf(m), raw = m.table.rows.filter(r => r.i >= g.r0 && r.i <= g.r1).map(r => r.cells.filter(k => k.c >= g.c0 && k.c <= g.c1).map(k => k.it.text).join('\t')).join('\n');
    e.preventDefault(); e.stopImmediatePropagation();
    e.clipboardData?.setData('text/plain', raw);
    if (e.type === 'cut' && !x.still()) { const on = inRange(m); putTable(m.id, { ...t, rows: t.rows.map((r, y) => ({ ...r, cells: r.cells.map((k, j) => { if (!on.some(q => q.r.src === y && q.k.c === j)) return k; const { runs: _, ...rest } = k; return { ...rest, text: '' }; }) })) }, on.length > 1 ? `Cut ${on.length} cells` : 'Cut a cell'); }
  };
  ['copy', 'cut', 'paste'].forEach(n => document.addEventListener(n, cellsClip, true));
  // A table selected, its grip over its corner and its edges to take it by, moved as a whole, as PowerPoint's by its border; a press in it is for its cells.
  function paintGrip() {
    marks.querySelectorAll('.dc-tmove').forEach(n => n.remove());
    const cs = sel.getSelectedCells(), m = cs.length === 1 && !x.still() ? scene().byId.get(cs[0].id) : null;
    if (m?.geometry !== 'table' || m.locked) return;
    const z = zoom(), s = 14 / z, at = { x: m.x - s - 3 / z, y: m.y - s - 3 / z }, take = el => { el.addEventListener('mousedown', e => e.stopPropagation()); el.addEventListener('pointerdown', e => moveTable(e, m)); return el; };
    for (const [ax, ay, w, h] of [[m.x, m.y - 3 / z, m.w, 6 / z], [m.x, m.y + m.h - 3 / z, m.w, 6 / z], [m.x - 3 / z, m.y, 6 / z, m.h], [m.x + m.w - 3 / z, m.y, 6 / z, m.h]]) take(svg('rect', { class: 'dc-tmove edge', x: ax, y: ay, width: w, height: h, fill: 'transparent' }));
    const g = take(svg('g', { class: 'dc-tmove dc-tgrip', transform: `translate(${at.x} ${at.y}) scale(${s / 14})` }));
    svg('rect', { width: 14, height: 14, rx: 2 }, g);
    svg('path', { d: 'M7 2.5v9M2.5 7h9M7 2.5 5.5 4M7 2.5 8.5 4M7 11.5 5.5 10M7 11.5 8.5 10M2.5 7 4 5.5M2.5 7 4 8.5M11.5 7 10 5.5M11.5 7 10 8.5' }, g);
  }
  function moveTable(e, m) {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const cell = graph.getCellById(m.id), s = local(e);
    let dx = 0, dy = 0, moved = false;
    const go = ev => { const p = local(ev), q = held({ x: m.x + p.x - s.x, y: m.y + p.y - s.y }); dx = q.x - m.x; dy = q.y - m.y; if (!moved && Math.hypot(dx, dy) * zoom() < 3) return; moved = true; cell?.setPosition(m.x + dx, m.y + dy); followLines(new Map([[m.id, { x: m.x + dx, y: m.y + dy, w: m.w, h: m.h }]])); marks.querySelectorAll('.dc-tmove, .dc-tcell').forEach(n => n.setAttribute('visibility', 'hidden')); };
    const up = () => { removeEventListener('pointermove', go, true); removeEventListener('pointerup', up, true); if (!moved) return paintGrip(); x.moveTo(new Map([[m.id, { x: m.x + dx, y: m.y + dy, w: m.w, h: m.h }]])); };
    addEventListener('pointermove', go, true); addEventListener('pointerup', up, true);
  }

  // Painted with the selection, a line's ends, a picture's crop handles and a group's turning handle.
  function paint() { paintEnds(); paintCrop(); paintTurn(); paintCell(); paintGrip(); paintPoints(); paintPins(); paintLinks(); }
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

  // ---- A freeform and a curve, drawn point by point: a click a point, a press and drag a run of them as the hand goes (a freeform's), Enter or a double-click to end, a click on its first point to close it, Esc to let it go ----
  function trace(a, down) {
    const curved = a.geometry === 'curve', pts = [], start = local(down), ghost = svg('path', { class: 'dc-draft', fill: 'none' }), near = 8 / zoom();
    let hover = [start.x, start.y], pressed = true, ran = false, lastAt = [down.clientX, down.clientY], lastT = down.timeStamp;
    pts.push([start.x, start.y]);
    drawingNow = true;
    const nodesOf = (ps, closed) => Shapes.throughPoints(ps, curved, closed);
    const paintIt = () => ghost.setAttribute('d', Shapes.path('freeform', 1, 1, 0, { paths: [{ closed: false, nodes: nodesOf([...pts, ...(pressed ? [] : [hover])], false) }] }));
    const finish = closed => {
      cleanup();
      const ps = pts.filter((p, i) => !i || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 1 / zoom());
      if (ps.length < 2) return;
      const raw = { paths: [{ closed, nodes: nodesOf(ps, closed) }] }, b = Shapes.boundsOf(raw), w = Math.max(b.w, 1), h = Math.max(b.h, 1);
      x.insert('freeform', { x: round(b.x), y: round(b.y), w: round(w), h: round(h), format: { ...newLook('freeform', closed ? {} : { Fill: 'none' }), Points: Shapes.refit(raw, { x: b.x, y: b.y, w, h }) } });
    };
    const move = e => {
      const p = local(e);
      hover = [p.x, p.y];
      if (pressed && !curved) {
        // A freeform's press and drag draws as the hand goes.
        if (ran || Math.hypot(e.clientX - lastAt[0], e.clientY - lastAt[1]) > 3) { ran = true; const q = pts.at(-1); if (Math.hypot(p.x - q[0], p.y - q[1]) > 2 / zoom()) pts.push(hover); }
      }
      paintIt();
    };
    const press = e => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      const p = local(e), first = pts[0], twice = e.timeStamp - lastT < 400 && Math.hypot(e.clientX - lastAt[0], e.clientY - lastAt[1]) < 6;
      lastAt = [e.clientX, e.clientY]; lastT = e.timeStamp;
      if (pts.length > 2 && Math.hypot(p.x - first[0], p.y - first[1]) < near) return finish(true);
      if (twice) return finish(false);
      pts.push([p.x, p.y]); pressed = true; ran = false; paintIt();
    };
    const up = () => { pressed = false; if (ran) { ran = false; } paintIt(); };
    const keys = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cleanup(); } else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); finish(false); } };
    const cleanup = () => { removeEventListener('pointermove', move, true); removeEventListener('pointerup', up, true); root.removeEventListener('pointerdown', press, true); removeEventListener('keydown', keys, true); ghost.remove(); drawingNow = false; disarm(); };
    addEventListener('pointermove', move, true); addEventListener('pointerup', up, true); root.addEventListener('pointerdown', press, true); addEventListener('keydown', keys, true);
    paintIt();
  }

  // ---- Edit points: any shape's outline as points to drag, a shape that isn't a freeform becoming one as it's first changed; a double-click on the outline adds one, on a point takes it away, its right-click says the rest ----
  let pointing = null;
  const ofMark = m => { const s = m.settings ? Object.fromEntries(Object.entries(m.settings).map(([k, v]) => [k, v.value])) : m.look, g = m.shape ?? m.geometry; return g === 'freeform' && (s.Points ?? m.look?.Points) ? s.Points ?? m.look.Points : Shapes.pointsOf(g === 'text' ? 'rect' : g, m.w, m.h, s.Corner, s.Tail); };
  function editPoints(id) {
    if (x.still()) return Shell.toast(App.whyNot());
    const m = id ? scene().byId.get(id) : x.selectedNow()[0];
    if (!m || !(m.type === 'box' || (m.type === 'shape' && !['line', 'picture', 'group', 'legend', 'table'].includes(m.geometry) && !m.role))) return Shell.toast('Select a shape first', { ms: 2500 });
    pointing = { id: m.id, P: JSON.parse(JSON.stringify(ofMark(m))), at: null };
    paintPoints();
  }
  function endPoints() { pointing = null; marks.querySelectorAll('.dc-pts').forEach(n => n.remove()); }
  // Where a point of a frame falls on the page, and back, as it's turned and flipped.
  const framing = m => { const a = (m.rotate ?? 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), cx = m.x + m.w / 2, cy = m.y + m.h / 2, fx = m.flip?.h ? -1 : 1, fy = m.flip?.v ? -1 : 1;
    return { to: (u, v) => { const dx = (u - 0.5) * m.w * fx, dy = (v - 0.5) * m.h * fy; return [cx + dx * c - dy * s, cy + dx * s + dy * c]; }, from: (px, py) => { const dx = px - cx, dy = py - cy; return [(dx * c + dy * s) * fx / m.w + 0.5, (-dx * s + dy * c) * fy / m.h + 0.5]; } }; };
  function paintPoints() {
    marks.querySelectorAll('.dc-pts').forEach(n => n.remove());
    if (!pointing) return;
    const m = scene().byId.get(pointing.id);
    if (!m || !x.selectedNow().some(q => q.id === m.id)) return endPoints();
    const z = zoom(), f = framing(m), r = 4 / z, P = pointing.P, d = P.paths.map(({ nodes, closed }) => { const seq = closed ? [...nodes, nodes[0]] : nodes, pt = (u, v) => f.to(u, v).join(','); return `M${pt(nodes[0][0], nodes[0][1])} ${seq.slice(1).map((b, i) => { const a = seq[i]; return a[4] != null || b[2] != null ? `C${pt(a[4] ?? a[0], a[5] ?? a[1])} ${pt(b[2] ?? b[0], b[3] ?? b[1])} ${pt(b[0], b[1])}` : `L${pt(b[0], b[1])}`; }).join(' ')}${closed ? ' Z' : ''}`; }).join(' ');
    svg('path', { class: 'dc-pts outline', d, fill: 'none', 'stroke-width': 1.25 / z });
    // (A wide, unseen line along it, to add a point by.)
    const hit = svg('path', { class: 'dc-pts hit', d, fill: 'none', 'stroke-width': 10 / z });
    hit.addEventListener('dblclick', e => { e.stopPropagation(); addPoint(local(e), m); });
    hit.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); const q = local(e); Shell.menu({ x: e.clientX, y: e.clientY }, [{ label: 'Add point', run: () => addPoint(q, m) }, { label: 'Done', run: endPoints }]); });
    hit.addEventListener('mousedown', e => e.stopPropagation());
    P.paths.forEach((path, pi) => path.nodes.forEach((q, i) => {
      const [nx, ny] = f.to(q[0], q[1]), picked = pointing.at?.[0] === pi && pointing.at?.[1] === i;
      if (picked) for (const [a, b] of [[2, 3], [4, 5]]) if (q[a] != null) { const [hx, hy] = f.to(q[a], q[b]); svg('path', { class: 'dc-pts arm', d: `M${nx},${ny} L${hx},${hy}`, 'stroke-width': 1 / z }); const c = svg('circle', { class: 'dc-pts ctl', cx: hx, cy: hy, r: r * 0.8, 'stroke-width': 1 / z }); grabPoint(c, m, pi, i, a); }
      const c = svg('rect', { class: `dc-pts node${picked ? ' on' : ''}`, x: nx - r, y: ny - r, width: 2 * r, height: 2 * r, 'stroke-width': 1.25 / z });
      grabPoint(c, m, pi, i, 0);
      c.addEventListener('dblclick', e => { e.stopPropagation(); removePoint(pi, i, m); });
      c.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); pointing.at = [pi, i]; paintPoints(); Shell.menu({ x: e.clientX, y: e.clientY }, [{ label: 'Delete point', keys: 'Delete', run: () => removePoint(pi, i, m) }, { label: 'Smooth point', run: () => setSmooth(pi, i, m, true) }, { label: 'Corner point', run: () => setSmooth(pi, i, m, false) }, '-', { label: path.closed ? 'Open the path here' : 'Close the path', run: () => toggleClosed(pi, i, m) }, '-', { label: 'Done', run: endPoints }]); });
    }));
  }
  // A press on a point or a handle, and the drag: a point takes its handles with it, a smooth point's handles stay in line unless Alt is down.
  function grabPoint(el, m, pi, i, which) {
    el.addEventListener('mousedown', e => e.stopPropagation());
    el.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      pointing.at = [pi, i];
      const f = framing(m), q0 = [...pointing.P.paths[pi].nodes[i]];
      let moved = false;
      const move = ev => {
        moved = true;
        const p = local(ev), [u, v] = f.from(p.x, p.y), q = pointing.P.paths[pi].nodes[i];
        if (!which) { const du = u - q0[0], dv = v - q0[1]; q[0] = u; q[1] = v; for (const [a, b] of [[2, 3], [4, 5]]) if (q0[a] != null) { q[a] = q0[a] + du; q[b] = q0[b] + dv; } }
        else { q[which] = u; q[which + 1] = v; const [oa, ob] = which === 2 ? [4, 5] : [2, 3]; if (!ev.altKey && q[oa] != null) { const L = Math.hypot(q0[oa] - q0[0], q0[ob] - q0[1]), dx = q[0] - u, dy = q[1] - v, D = Math.hypot(dx, dy) || 1; q[oa] = q[0] + dx / D * L; q[ob] = q[1] + dy / D * L; } }
        paintPoints();
      };
      const up = () => { removeEventListener('pointermove', move, true); removeEventListener('pointerup', up, true); if (moved) putPoints(m); else paintPoints(); };
      addEventListener('pointermove', move, true); addEventListener('pointerup', up, true);
    });
  }
  function addPoint(p, m) {
    const f = framing(m), [u, v] = f.from(p.x, p.y);
    let best = null;
    pointing.P.paths.forEach((path, pi) => { const ns = path.nodes, n = path.closed ? ns.length : ns.length - 1; for (let i = 0; i < n; i++) { const a = ns[i], b = ns[(i + 1) % ns.length]; for (let t = 0; t <= 1; t += 0.05) { const w = [(1 - t) ** 3, 3 * (1 - t) ** 2 * t, 3 * (1 - t) * t * t, t ** 3], X = w[0] * a[0] + w[1] * (a[4] ?? a[0]) + w[2] * (b[2] ?? b[0]) + w[3] * b[0], Y = w[0] * a[1] + w[1] * (a[5] ?? a[1]) + w[2] * (b[3] ?? b[1]) + w[3] * b[1], d = Math.hypot((X - u) * m.w, (Y - v) * m.h); if (!best || d < best.d) best = { d, pi, i, t, X, Y }; } } });
    if (!best) return;
    const ns = pointing.P.paths[best.pi].nodes, a = ns[best.i], b = ns[(best.i + 1) % ns.length], curved = a[4] != null || b[2] != null, node = [best.X, best.Y];
    // (On a curve, a de Casteljau split, so the curve doesn't change for it.)
    if (curved) { const t = best.t, L = (P, Q) => [P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t], p0 = [a[0], a[1]], p1 = [a[4] ?? a[0], a[5] ?? a[1]], p2 = [b[2] ?? b[0], b[3] ?? b[1]], p3 = [b[0], b[1]], q0 = L(p0, p1), q1 = L(p1, p2), q2 = L(p2, p3), r0 = L(q0, q1), r1 = L(q1, q2); a[4] = q0[0]; a[5] = q0[1]; b[2] = q2[0]; b[3] = q2[1]; node.push(r0[0], r0[1], r1[0], r1[1]); }
    ns.splice(best.i + 1, 0, node);
    pointing.at = [best.pi, best.i + 1];
    putPoints(m);
  }
  function removePoint(pi, i, m) {
    const path = pointing.P.paths[pi];
    if (path.nodes.length <= 2) return Shell.toast('A path has two points at least', { ms: 2500 });
    path.nodes.splice(i, 1);
    pointing.at = null;
    putPoints(m);
  }
  function setSmooth(pi, i, m, on) {
    const ns = pointing.P.paths[pi].nodes, q = ns[i];
    if (on) { const a = ns[(i - 1 + ns.length) % ns.length], b = ns[(i + 1) % ns.length], dx = (b[0] - a[0]) / 6, dy = (b[1] - a[1]) / 6; q[2] = q[0] - dx; q[3] = q[1] - dy; q[4] = q[0] + dx; q[5] = q[1] + dy; }
    else q.length = 2;
    putPoints(m);
  }
  function toggleClosed(pi, i, m) {
    const path = pointing.P.paths[pi];
    if (path.closed) { path.nodes = [...path.nodes.slice(i), ...path.nodes.slice(0, i)]; path.closed = false; } else path.closed = true;
    putPoints(m);
  }
  // Written as one change: a free shape's frame round what it now draws, where it stood; a box keeps its frame, and takes its Points at the pen, as a look does.
  function putPoints(m) {
    const P = pointing.P, say = 'Edited the points';
    if (m.type === 'box') { FormatBar.applyPairs([['Shape', 'freeform'], ['Points', P]]); pointing.P = JSON.parse(JSON.stringify(P)); return setTimeout(paintPoints); }
    const b = Shapes.boundsOf(P), w = Math.max(b.w, 1e-3), h = Math.max(b.h, 1e-3), fitted = Shapes.refit(P, { x: b.x, y: b.y, w, h }), row = x.rowOf(m.id), f = framing(m), [cx, cy] = f.to(b.x + w / 2, b.y + h / 2), W = m.w * w, H = m.h * h;
    const c = App.change(tx => tx.update(m.id, { geometry: 'freeform', x: round(cx - W / 2), y: round(cy - H / 2), w: round(W), h: round(H), format: { ...row.format, Shape: undefined, Points: fitted } }), { dated: false, say });
    if (c) { pointing.P = JSON.parse(JSON.stringify(fitted)); setTimeout(paintPoints); } else endPoints();
  }
  root.addEventListener('keydown', e => {
    if (!pointing) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); endPoints(); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && pointing.at) { e.preventDefault(); e.stopPropagation(); removePoint(pointing.at[0], pointing.at[1], scene().byId.get(pointing.id)); }
  }, true);

  // ---- Merge Shapes: what's selected of free shapes as one, or in pieces, in the look of the first picked, as PowerPoint's. Its curves are flattened fine enough to print, its points editable as any freeform's ----
  const mergeable = () => { const ms = x.selectedNow().filter(m => m.type === 'shape' && !['line', 'picture', 'group', 'legend', 'table'].includes(m.geometry) && !m.role); return ms.length > 1 && ms.length === x.selectedNow().length ? ms : null; };
  function ringsOf(m) {
    const f = framing(m), P = m.geometry === 'freeform' ? m.look.Points : Shapes.pointsOf(m.geometry === 'text' ? 'rect' : m.geometry, m.w, m.h, m.look.Corner, m.look.Tail);
    return Shapes.flatten(P, m.w, m.h).filter(r => r.ring.length > 2).map(r => r.ring.map(([px, py]) => f.to(px / m.w, py / m.h)));
  }
  function merge(kind) {
    if (x.still()) return Shell.toast(App.whyNot());
    const ms = mergeable();
    if (!ms) return Shell.toast(x.selectedNow().some(m => m.type === 'box') ? 'A box is a record, so it doesn’t merge: its shape says what it is' : 'Select two shapes or more first', { ms: 3500 });
    const parts = Shapes.merge(kind, ms.map(ringsOf));
    if (!parts.length) return Shell.toast('Nothing’s left of those: they don’t overlap', { ms: 3000 });
    const first = x.rowOf(ms[0].id), { flip, rotate, ends, kept, shape, id: _id, ...base } = first, made = [];
    App.change(tx => {
      for (const m of ms) tx.remove(m.id);
      parts.forEach((rings, i) => { const f = Shapes.framed(rings); made.push(tx.add('shape', { ...base, view: x.viewOf(), geometry: 'freeform', x: round(f.x), y: round(f.y), w: round(f.w), h: round(f.h), ...(i && { text: '' }), format: { ...base.format, Shape: undefined, Points: f.Points } })); });
    }, { dated: false, say: `${{ union: 'Merged', combine: 'Combined', fragment: 'Fragmented', intersect: 'Intersected', subtract: 'Subtracted from' }[kind]} ${ms.length} shapes` });
    Shell.select(made);
  }

  // ---- Distribute along a line: what's selected evenly along a free line selected with it, each middle on it ----
  const lineAmong = () => { const ms = x.selectedNow(), l = ms.filter(m => m.geometry === 'line'); return l.length === 1 && ms.length >= 3 ? l[0] : null; };
  function alongLine() {
    if (x.still()) return Shell.toast(App.whyNot());
    const l = lineAmong();
    if (!l) return Shell.toast('Select a line and two or more things to go along it', { ms: 3000 });
    const ms = x.selectedNow().filter(m => m !== l && (m.type === 'box' || m.type === 'shape') && m.geometry !== 'line'), legs = l.points.slice(1).map((p, i) => [l.points[i], p]), len = legs.reduce((a, [p, q]) => a + Math.hypot(q[0] - p[0], q[1] - p[1]), 0);
    const at = d => { for (const [p, q] of legs) { const L = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d <= L || q === legs.at(-1)[1]) return [p[0] + (q[0] - p[0]) * d / (L || 1), p[1] + (q[1] - p[1]) * d / (L || 1)]; d -= L; } return l.points.at(-1); };
    const proj = m => { const c = [m.x + m.w / 2, m.y + m.h / 2]; let best = 0, seen = 0, least = Infinity; for (const [p, q] of legs) { const L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1, t = Math.max(0, Math.min(1, ((c[0] - p[0]) * (q[0] - p[0]) + (c[1] - p[1]) * (q[1] - p[1])) / (L * L))), d = Math.hypot(c[0] - (p[0] + (q[0] - p[0]) * t), c[1] - (p[1] + (q[1] - p[1]) * t)); if (d < least) { least = d; best = seen + t * L; } seen += L; } return best; };
    const sorted = [...ms].sort((a, b) => proj(a) - proj(b)), places = new Map(sorted.map((m, i) => { const [cx, cy] = at(sorted.length > 1 ? i * len / (sorted.length - 1) : len / 2); return [m.id, { x: cx - m.w / 2, y: cy - m.h / 2 }]; }));
    x.moveTo(places);
  }

  // ---- Pinned: a box Tidy goes around, a pin on it to say so (never printed) ----
  const pinned = id => { const t = x.treeOf(id); return !!t && App.notes.peek().resolve('Pinned', t, x.viewOf())?.value === true; };
  function setPinned(ms, on) { App.change(tx => { for (const m of ms) tx.note('Pinned', x.treeOf(m.record), on ? true : undefined, { view: x.viewOf() }); }, { dated: false, keep: false, say: `${on ? 'Pinned' : 'Unpinned'} ${ms.length === 1 ? x.called(ms[0]) : `${ms.length} boxes`}` }); }
  function paintPins() {
    marks.querySelectorAll('.dc-pin').forEach(n => n.remove());
    const N = App.notes.peek(), sc = scene(), z = zoom();
    for (const p of N.notes('Pinned')) if (p.view === sc.view && p.value === true && p.pattern.id) { const m = sc.marks.find(q => q.type === 'box' && q.record === p.pattern.id); if (m) svg('path', { class: 'dc-pin', transform: `translate(${m.x + m.w - 7 / z} ${m.y - 7 / z}) scale(${0.5 / z})`, d: 'M12 17v5M9 10.76V6h6v4.76l2 3.24H7zM8 2h8', 'stroke-width': 2 }); }
  }

  // ---- A link, as PowerPoint's: on a shape or on words as they're typed, a web address, or a page of this chart; Ctrl+click follows it, and it says where ----
  function LinkForm({ now, put, close }) {
    const pages = App.views.peek().filter(v => v.layout === 'chart'), [url, setUrl] = useState(now?.url ?? ''), [view, setView] = useState(now?.view ?? '');
    const done = () => { const u = url.trim(); close(); put(view ? { view } : u ? { url: /^[a-z]+:/i.test(u) ? u : `https://${u}` } : undefined); };
    return html`<form class="linkform" onSubmit=${e => { e.preventDefault(); done(); }}>
      <label class="row"><span class="k">Address</span><input class="cell" type="text" autofocus value=${url} aria-label="Address" spellcheck="false" placeholder="https://" onInput=${e => setUrl(e.currentTarget.value)} onKeyDown=${e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); done(); } else if (e.key === 'Escape') { e.preventDefault(); close(); } }} /></label>
      <label class="row"><span class="k">Or a page</span><${Shell.Pick} label="Page" value=${view} onPick=${setView} options=${[['', 'None'], ...pages.map(v => [v.id, v.name])]} /></label>
      <div class="acts">${now ? html`<button type="button" class="btn" onClick=${() => { close(); put(undefined); }}>Remove link</button>` : null}<button type="submit" class="btn primary">OK</button></div></form>`;
  }
  const askLink = (at, now, put) => Shell.popover(at, close => html`<${LinkForm} now=${now} put=${put} close=${close} />`, { placement: 'bottom-start' });
  function setLink(id) {
    const m = id ? scene().byId.get(id) : x.selectedNow()[0];
    if (!m || m.type !== 'shape') return Shell.toast('Select a shape first', { ms: 2500 });
    const row = x.rowOf(m.id), p = graph.localToClient(m.x, m.y + m.h);
    askLink({ x: p.x, y: p.y }, row.link ?? null, link => App.change(tx => tx.update(m.id, { link }), { dated: false, keep: false, say: link ? `Linked ${x.called(m)} to ${link.url ?? App.views.peek().find(v => v.id === link.view)?.name}` : `Took the link off ${x.called(m)}` }));
  }
  const linkAt = (e, m) => { const w = e.target.closest?.('[data-link]'); return w ? JSON.parse(w.getAttribute('data-link')) : m?.link ?? null; };
  const saidOfLink = l => `Ctrl+click: ${l.url ?? App.views.peek().find(v => v.id === l.view)?.name ?? ''}`;
  x.gEl.addEventListener('click', e => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const id = e.target.closest?.('[data-cell-id]')?.getAttribute('data-cell-id'), l = linkAt(e, id && scene().byId.get(id));
    if (!l) return;
    e.preventDefault(); e.stopPropagation();
    if (l.view) Shell.show(l.view); else window.open(l.url, '_blank', 'noopener');
  }, true);
  x.gEl.addEventListener('mouseover', e => { const id = e.target.closest?.('[data-cell-id]')?.getAttribute('data-cell-id'), l = linkAt(e, id && scene().byId.get(id)); root.title = l ? saidOfLink(l) : ''; });
  // A shape with a link shows it, never printed; words with one read as one.
  function paintLinks() {
    marks.querySelectorAll('.dc-linkmark').forEach(n => n.remove());
    const z = zoom();
    for (const m of scene().marks) if (m.link && m.type === 'shape' && !m.master) svg('path', { class: 'dc-linkmark', transform: `translate(${m.x + m.w + 2 / z} ${m.y - 12 / z}) scale(${0.45 / z})`, d: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.8 1.8M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.8-1.8', 'stroke-width': 2 });
  }

  // A box's alt text: what a reader's told of it in the deck, as a free shape's is; a note at its own tree, so it can be said of a group too.
  async function boxAlt(m) {
    const t = x.treeOf(m.record), now = { v: App.notes.peek().resolve('Alt Text', t, x.viewOf())?.value ?? '' };
    const go = await Shell.dialog({ title: 'Alt text', width: 420, body: () => html`<div class="ex palette-def"><label class="row"><span class="k">Says</span><input class="cell" type="text" autofocus value=${now.v} aria-label="Alt text" onInput=${e => { now.v = e.currentTarget.value; }} /></label></div>`, actions: [{ label: 'Cancel', value: false }, { label: 'OK', value: true, primary: true }] });
    if (go) App.change(tx => tx.note('Alt Text', t, Tree.clean(now.v) || undefined, { view: x.viewOf() }), { dated: false, say: `Set the alt text of ${x.called(m)}` });
  }
  // A picture off the clipboard, as Insert's picture is.
  function pastePicture(file) {
    const r = new FileReader();
    r.onload = () => { const img = new Image(); img.onload = () => { const w = Math.min(240, img.width), k = w / img.width; const id = x.insert('picture', { src: r.result, w, h: Math.round(img.height * k) }); if (id) Shell.toast('Pasted the picture', { ms: 2000 }); }; img.src = r.result; };
    r.readAsDataURL(file);
  }

  // The menu's, for what's selected: Edit points, Merge shapes, Link, Pin; each said only where it can be asked.
  const MERGES = [['union', 'Union'], ['combine', 'Combine'], ['fragment', 'Fragment'], ['intersect', 'Intersect'], ['subtract', 'Subtract']];
  function shapeItems(ms, one, ro) {
    const editable = one && (one.type === 'box' || (one.type === 'shape' && !['line', 'picture', 'group', 'legend', 'table'].includes(one.geometry) && !one.role)), boxes = ms.filter(m => m.type === 'box');
    return [
      ...(editable ? [{ label: 'Edit points', disabled: ro, run: () => editPoints(one.id) }] : []),
      ...(mergeable() ? [{ label: 'Merge shapes', disabled: ro, items: MERGES.map(([k, label]) => ({ label, run: () => merge(k) })) }] : []),
      ...(one?.type === 'shape' && !one.role ? [{ label: 'Link…', disabled: ro, run: () => setLink(one.id) }] : []),
      ...(boxes.length ? [{ label: boxes.every(m => pinned(m.record)) ? 'Unpin' : 'Pin', disabled: ro, run: () => setPinned(boxes, !boxes.every(m => pinned(m.record))) }] : []),
      ...(one?.type === 'box' ? [{ label: 'Alt text…', disabled: ro, run: () => boxAlt(one) }] : []),
    ];
  }

  // ---- Measured with Alt, as Figma's: with something selected, Alt and a point at another says how far it is, side by side; at nothing, how far from the page's edges ----
  let measuring = false;
  const clearMeasure = () => { marks.querySelectorAll('.dc-measure').forEach(n => n.remove()); };
  function measureAt(e) {
    clearMeasure();
    const ms = x.selectedNow().filter(m => m.w != null);
    if (!e.altKey || !ms.length) return;
    const a = x.extent(ms), z = zoom(), sc = scene(), p = local(e), hit = [...sc.marks].reverse().find(m => !ms.includes(m) && m.w != null && m.type !== 'line' && m.geometry !== 'group' && !m.master && p.x >= m.x && p.x <= m.x + m.w && p.y >= m.y && p.y <= m.y + m.h);
    const b = hit ?? { x: 0, y: 0, w: sc.page.w, h: sc.page.h }, inside = !hit, sheet = v => `${Math.round(Math.abs(v) * x.scale() / Scene.PT * 10) / 10} pt`;
    const say = (x1, y1, x2, y2) => { if (Math.hypot(x2 - x1, y2 - y1) < 0.5) return; svg('path', { class: 'dc-gap dc-measure', d: `M${x1},${y1} L${x2},${y2}`, 'stroke-width': 1.25 / z }); const t = svg('text', { class: 'dc-gap dc-measure', x: (x1 + x2) / 2 + 4 / z, y: (y1 + y2) / 2 - 4 / z, 'font-size': 11 / z }); t.textContent = sheet(Math.hypot(x2 - x1, y2 - y1)); };
    svg('rect', { class: 'dc-measure dc-measured', x: b.x, y: b.y, width: b.w, height: b.h, 'stroke-width': 1 / z, fill: 'none' });
    const cy = Math.max(a.y, b.y) < Math.min(a.y + a.h, b.y + b.h) ? (Math.max(a.y, b.y) + Math.min(a.y + a.h, b.y + b.h)) / 2 : a.y + a.h / 2, cx = Math.max(a.x, b.x) < Math.min(a.x + a.w, b.x + b.w) ? (Math.max(a.x, b.x) + Math.min(a.x + a.w, b.x + b.w)) / 2 : a.x + a.w / 2;
    if (inside) { say(0, a.y + a.h / 2, a.x, a.y + a.h / 2); say(a.x + a.w, a.y + a.h / 2, sc.page.w, a.y + a.h / 2); say(a.x + a.w / 2, 0, a.x + a.w / 2, a.y); say(a.x + a.w / 2, a.y + a.h, a.x + a.w / 2, sc.page.h); return; }
    if (b.x >= a.x + a.w) say(a.x + a.w, cy, b.x, cy); else if (a.x >= b.x + b.w) say(b.x + b.w, cy, a.x, cy);
    if (b.y >= a.y + a.h) say(cx, a.y + a.h, cx, b.y); else if (a.y >= b.y + b.h) say(cx, b.y + b.h, cx, a.y);
    // (Over one another: how far in, each way.)
    if (b.x < a.x + a.w && a.x < b.x + b.w && b.y < a.y + a.h && a.y < b.y + b.h) { say(a.x, cy, b.x, cy); say(a.x + a.w, cy, b.x + b.w, cy); say(cx, a.y, cx, b.y); say(cx, a.y + a.h, cx, b.y + b.h); }
  }
  const altMove = e => { if (e.altKey && !armed && root.contains(e.target)) { measuring = true; measureAt(e); } else if (measuring) { measuring = false; clearMeasure(); } };
  const altUp = e => { if (e.key === 'Alt' && measuring) { measuring = false; clearMeasure(); } if (e.key === 'Alt') e.preventDefault(); };
  addEventListener('pointermove', altMove, true);
  addEventListener('keyup', altUp, true);

  // ---- The chart's master, being edited: its page is all that's drawn, with a bar that says so and closes it, as Esc does with nothing selected ----
  const masterEl = over.appendChild(Object.assign(document.createElement('div'), { className: 'dc-masterhost' }));
  let wasMastering = false;
  const stopMaster = effect(() => {
    const on = App.mastering.value;
    root.classList.toggle('mastering', on);
    // (What was selected on one page is no selection on the other.)
    if (on !== wasMastering) { wasMastering = on; queueMicrotask(() => Shell.select([])); }
    render(on ? html`<div class="dc-masterbar" role="status"><span>Master</span><button class="btn primary" onClick=${() => { App.mastering.value = false; }}>Close master</button></div>` : null, masterEl);
  });
  const leaveMaster = e => { if (e.key === 'Escape' && App.mastering.peek() && !armed && !x.selectedNow().length && !e.target.closest?.('.dc-edit')) { e.preventDefault(); e.stopPropagation(); App.mastering.value = false; } };
  root.addEventListener('keydown', leaveMaster);

  // ---- The Selection Pane ----
  const paneOpen = signal(false);
  const paneEl = over.appendChild(Object.assign(document.createElement('div'), { className: 'dc-panehost' }));
  const pane = on => { paneOpen.value = on ?? !paneOpen.peek(); if (paneOpen.peek()) paintPane(); else render(null, paneEl); };
  function paintPane() { if (paneOpen.peek()) render(html`<${Pane} key=${x.viewOf()} />`, paneEl); }
  const SHAPE_WORD = { text: 'Text box', legend: 'Key', picture: 'Picture', line: 'Line', group: 'Group', frame: 'Frame', table: 'Table', freeform: 'Freeform' };
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
    const rows = [...sc.marks].filter(m => m.geometry !== 'group' && m.type !== 'frame' && !m.master).reverse();
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

  return { editPoints, endPoints, merge, mergeable, alongLine, lineAmong, shapeItems, pastePicture, setLink, askLink, editCell, tableItems, newTable, readsFrom, styleGallery, StyleGallery, cell: id => (cellNow && (!id || cellNow.id === id) ? cellNow : null), cellsPicked: id => { const m = id && scene().byId.get(id); return m?.table ? inRange(m) : []; }, arm, disarm, armed: () => !!armed, paint, followLines, duplicate, copyTo, flip, turnBy, angleOf, aimLine, crop, endCrop, changePicture, setDefault, sizeBy, did, repeat, pane, paintPane, paneOpen, guideCells, guideDrag, guidesNow, putGuides, equalGaps, clearGaps, gluable, markAt, newLook,
    destroy() { ['copy', 'cut', 'paste'].forEach(n => document.removeEventListener(n, cellsClip, true)); stopMaster(); render(null, masterEl); removeEventListener('pointermove', altMove, true); removeEventListener('keyup', altUp, true); removeEventListener('pointermove', heldKeys, true); removeEventListener('keydown', sizeEnds, true); removeEventListener('pointerdown', sizeEnds, true); removeEventListener('keydown', fromPanel); disarm(); render(null, paneEl); } };
}
return { attach };
})();
