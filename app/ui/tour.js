// The tour: five steps, each done by doing what it teaches, then one card. It runs by itself on the very
// first launch, once the launch screen is gone, if a chart is drawn; after that, from Tour in the chart menu or
// Find. Enter skips a step, Skip goes to the last card, and Esc ends it. A step waits for its event on the
// shell's bus; or for what it points at to be clicked, or focused from the keys; or, pointing, for the pointer
// to rest on what it points at and leave. It points at what the parts mark with data-tour. The tour changes
// nothing in the record: a click on what a pointing step points at only points, what a step opened closes once
// the next step is under way, and the selection it ends on is the one it began on.
const Tour = (() => {
  const { html, signal, on, store } = Shell;
  const { render } = preact;
  const { useLayoutEffect, useRef, useState } = preactHooks;
  const { computePosition, offset, flip, shift } = FloatingUIDOM;
  // A value asked about holds while the selection it was asked under does (formulabar.js), so the same
  // selection again ends it, and the chart's highlight with it.
  function unask() {
    if (document.activeElement?.closest?.('[data-tour="computed"]')) document.activeElement.blur();
    const s = Shell.selection.peek();
    preactSignals.batch(() => { Shell.select([], { replace: true }); Shell.select([...s], { replace: true }); });
  }
  const STEPS = [
    { event: 'select', target: 'box', act: 'Click a box.', say: 'Every box is a record.', when: s => s?.length },
    { event: 'relate-open', target: 'box', act: 'Drag from one box’s edge to another.', say: 'See how they’re related, or relate them.' },
    { click: true, target: 'computed', act: 'Click an italic value.', say: 'Italic means a formula worked it out, and the formula bar says why.', ends: unask },
    { point: true, target: 'tag', in: 'inspector', act: 'Point at a tag.', say: 'Green is attested, red ruled out. Pointing shows what switching it would change.' },
    { event: 'view-switch', target: 'sheet', act: 'Switch view.', say: 'Views share the records; each has its own styles. Export any of them.' },
  ];
  const at = signal(-1); // the step shown; STEPS.length is the last card
  let unlayer = null, rest = null, began = [];

  function start() {
    store.set('toured', '1');
    Shell.closeAll();
    if (at.peek() < 0) { unlayer = Shell.layer(end); began = Shell.selection.peek(); }
    at.value = 0;
  }
  // What a step opened stays while the next step is read, and closes once that one is begun or done. Once the
  // last is done, or skipped, everything the steps opened is closed, and the selection is the one begun on.
  let opened = null;
  const settle = () => { const f = opened; opened = null; f?.(); };
  const leave = () => { rest = null; settle(); opened = STEPS[at.peek()]?.ends ?? null; };
  const done = () => { leave(); settle(); Shell.select(began, { replace: true }); };
  const next = () => { const i = at.peek(); if (i < 0 || i >= STEPS.length) return; if (i < STEPS.length - 1) leave(); else done(); at.value = i + 1; };
  const skip = () => { done(); at.value = STEPS.length; };
  function end() { if (at.peek() < 0) return; if (at.peek() < STEPS.length) done(); at.value = -1; unlayer(); }
  for (const [i, s] of STEPS.entries()) if (s.event) on(s.event, d => { if (at.peek() === i && (!s.when || s.when(d))) next(); });
  Shell.launched.then(() => { if (store.get('toured') !== '1' && Shell.parts.peek().canvas) start(); });
  document.addEventListener('keydown', e => {
    if (at.peek() < 0 || at.peek() >= STEPS.length || e.defaultPrevented || e.key !== 'Enter' || e.target.closest?.('input, textarea, select, button, [contenteditable], .CodeMirror')) return;
    next();
    e.preventDefault(); e.stopPropagation();
  }, true);
  // What the step shown points at, if the event's target is in it and the step is done that way.
  const aimed = (e, how) => { const s = STEPS[at.peek()]; return s?.[how] ? e.target.closest?.(`[data-tour="${s.target}"]`) : null; };
  // A clicking step is done once what it points at is clicked, or focused from the keys, and the click goes on.
  addEventListener('focusin', e => { if (aimed(e, 'click')) next(); }, true);
  // A pointing step is begun when the pointer reaches what it points at, and done once it has rested there
  // and left, or on a click there, which goes no further.
  addEventListener('pointerover', e => { const el = aimed(e, 'point'); if (el && rest?.el !== el) { settle(); rest = { el, since: e.timeStamp }; } }, true);
  addEventListener('pointerout', e => {
    if (!rest || rest.el.contains(e.relatedTarget)) return;
    const rested = e.timeStamp - rest.since > 500;
    rest = null;
    if (rested) next();
  }, true);
  addEventListener('click', e => {
    if (aimed(e, 'click')) next();
    else if (aimed(e, 'point')) { e.preventDefault(); e.stopPropagation(); next(); }
  }, true);

  // What a step points at: the first of its kind in view, inside every pane that scrolls it, and in the
  // step's pane if one is there.
  const inView = el => { const r = el.getBoundingClientRect(); return document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2).includes(el); };
  function find(step) {
    const all = [...document.querySelectorAll(`[data-tour="${step.target}"]`)].filter(el => el.getClientRects().length);
    const mine = all.filter(el => el.closest(`[data-region="${step.in}"]`));
    return mine.find(inView) ?? all.find(inView) ?? mine[0] ?? all[0];
  }
  // Where nothing shows what a step points at in the inspector, the first box, in reading order, whose record
  // holds one is selected first: a value a formula gives, or a tag. Selecting changes nothing in the record.
  const HOLDS = { computed: (st, R, id) => !!R.computed[id] && !('tag' in st[id]), tag: (st, R, id) => 'tag' in st[id] };
  function offer(step) {
    const holds = HOLDS[step.target], sc = App.scene.peek(), st = App.state.peek(), R = App.computed.peek(), ix = Tree.index(st);
    if (!holds || !sc || find(step)) return;
    const holding = id => (ix.entries.get(id) ?? []).some(e => holds(st, R, e) || holding(e));
    const box = sc.marks.filter(m => m.type === 'box').sort((a, b) => a.y - b.y || a.x - b.x).find(m => holding(m.record));
    if (box) Shell.select([box.record], { replace: true });
  }
  // Brought into the middle of the pane that scrolls it.
  function reveal(el) {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const o = getComputedStyle(p);
      if (!/auto|scroll/.test(o.overflowX + o.overflowY)) continue;
      const r = el.getBoundingClientRect(), b = p.getBoundingClientRect();
      return p.scrollBy(r.left + r.width / 2 - (b.left + b.width / 2), r.top + r.height / 2 - (b.top + b.height / 2));
    }
  }
  // The card sits beside what it points at, level with it, on the side toward the rest of the window: right of a
  // box on the chart, left of a value in the inspector, above a tab and below a bar; or on the other side, where
  // there's no room.
  const SIDE = { view: 'right-start', inspector: 'left-start', tabs: 'top-start', bars: 'bottom-start' };
  const sideOf = el => SIDE[el.closest('[data-region]')?.dataset.region] ?? 'right-start';

  function Layer() {
    const i = at.value, hole = useRef(), card = useRef(), prev = useRef(-1), [name, setName] = useState(store.get('name') ?? '');
    const step = STEPS[i];
    // The cutout and the card follow the target directly, without redrawing; only a change of step glides.
    useLayoutEffect(() => {
      if (i < 0) { prev.current = -1; return; }
      const h = hole.current, c = card.current, gliding = prev.current >= 0;
      prev.current = i;
      for (const el of [h, c]) el.classList.toggle('glide', gliding);
      const still = gliding && setTimeout(() => [h, c].forEach(el => el.classList.remove('glide')), 240);
      // Brought into view as the step starts, a box selected first if it must be; scrolled away after, it's none.
      if (step) offer(step);
      let shown = false;
      const tick = () => {
        let el = step && find(step);
        if (el && !shown) { shown = true; if (!inView(el)) reveal(el); }
        if (el && !inView(el)) el = null;
        const r = el?.getBoundingClientRect();
        h.classList.toggle('none', !r);
        Object.assign(h.style, r ? { left: r.left - 4 + 'px', top: r.top - 4 + 'px', width: r.width + 8 + 'px', height: r.height + 8 + 'px' } : { left: '50%', top: '50%', width: 0, height: 0 });
        if (el) {
          computePosition(el, c, { strategy: 'fixed', placement: sideOf(el), middleware: [offset(16), flip({ padding: 12 }), shift({ padding: 12 })] })
            .then(({ x, y }) => { c.style.left = x + 'px'; c.style.top = y + 'px'; });
        } else { c.style.left = (innerWidth - c.offsetWidth) / 2 + 'px'; c.style.top = innerHeight - c.offsetHeight - 72 + 'px'; }
      };
      tick();
      const timer = setInterval(tick, 200);
      addEventListener('resize', tick);
      return () => { clearTimeout(still); clearInterval(timer); removeEventListener('resize', tick); };
    }, [i]);
    if (i < 0) return null;
    const finish = blank => { if (name.trim()) store.set('name', name.trim()); end(); if (blank) App.blank(); };
    // A step is said, and leaves focus in the window to do it; the last card is a dialog, which keeps it.
    return html`
      <div class="tour-hole" ref=${hole} />
      ${step ? html`<div class="tour-card" ref=${card} role="dialog" aria-label="Tour" aria-live="polite">
          <div class="step">${i + 1} / ${STEPS.length}</div>
          <p><b>${step.act}</b> ${step.say}</p>
          <div class="acts"><button class="skip" onClick=${skip}>Skip</button></div>
        </div>`
      : html`<form class="tour-card" ref=${card} role="dialog" aria-modal="true" aria-label="Tour" data-trap
          onSubmit=${e => { e.preventDefault(); finish(false); }} onKeyDown=${e => { if (e.key === 'Escape') finish(false); }}>
          <p><b>${Shell.keyLabel('$mod+KeyZ')}</b> undoes anything, and History keeps every change, signed with your name.</p>
          <label>Your name<input value=${name} onInput=${e => setName(e.target.value)} ref=${el => el && !el.dataset.on && (el.dataset.on = 1, setTimeout(() => el.focus({ preventScroll: true })))} /></label>
          <div class="acts"><button type="button" class="btn" onClick=${() => finish(true)}>Start blank</button><button class="btn primary">Keep this chart</button></div>
        </form>`}`;
  }
  const host = document.createElement('div');
  document.addEventListener('DOMContentLoaded', () => { document.body.appendChild(host); render(html`<${Layer} />`, host); });

  Shell.register('action', { id: 'tour', name: 'Tour', menu: 'chart', order: 40, run: start });
  return { start, end };
})();
