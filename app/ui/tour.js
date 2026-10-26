// The tour: five steps, each advanced by doing what it teaches, then one card. It runs by itself on the very
// first launch, once the launch screen is gone, if a chart is drawn; after that, from Tour in the chart menu or
// Find. Enter skips a step, Skip goes to the last card, and Esc ends it. Each step waits for its event on the
// shell's bus, and points at what the parts mark with data-tour.
const Tour = (() => {
  const { html, signal, on, store } = Shell;
  const { render } = preact;
  const { useLayoutEffect, useRef, useState } = preactHooks;
  const { computePosition, offset, flip, shift } = FloatingUIDOM;
  const STEPS = [
    { event: 'select', target: 'box', act: 'Click a box.', say: 'Every box is a record.', when: s => s?.length },
    { event: 'relate-open', target: 'box', act: 'Drag from one box’s edge to another.', say: 'Every relation they can be in is listed.' },
    { event: 'why-open', target: 'computed', act: 'Click an italic value.', say: 'Italic means a formula worked it out. Type over it and yours wins.' },
    { event: 'tag-flip', target: 'tag', act: 'Click a tag.', say: 'Green is attested; red is ruled out.' },
    { event: 'view-switch', target: 'sheet', act: 'Switch view.', say: 'Views share the records; each has its own styles. Export any of them.' },
  ];
  const at = signal(-1); // the step shown; STEPS.length is the last card
  let unlayer = null;

  function start() {
    store.set('toured', '1');
    Shell.closeAll();
    if (at.peek() < 0) unlayer = Shell.layer(end);
    at.value = 0;
  }
  const next = () => { if (at.peek() >= 0 && at.peek() < STEPS.length) at.value = at.peek() + 1; };
  function end() { if (at.peek() < 0) return; at.value = -1; unlayer(); }
  for (const [i, s] of STEPS.entries()) on(s.event, d => { if (at.peek() === i && (!s.when || s.when(d))) next(); });
  Shell.launched.then(() => { if (store.get('toured') !== '1' && Shell.parts.peek().canvas) start(); });
  document.addEventListener('keydown', e => {
    if (at.peek() < 0 || at.peek() >= STEPS.length || e.defaultPrevented || e.key !== 'Enter' || e.target.closest?.('input, textarea, select, button, [contenteditable], .CodeMirror')) return;
    next();
    e.preventDefault(); e.stopPropagation();
  }, true);

  // The one visible thing a step points at, if it's on screen.
  const find = name => [...document.querySelectorAll(`[data-tour="${name}"]`)].find(el => el.getClientRects().length);

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
      const tick = () => {
        const el = step && find(step.target), r = el?.getBoundingClientRect();
        h.classList.toggle('none', !r);
        Object.assign(h.style, r ? { left: r.left - 4 + 'px', top: r.top - 4 + 'px', width: r.width + 8 + 'px', height: r.height + 8 + 'px' } : { left: '50%', top: '50%', width: 0, height: 0 });
        if (el) computePosition(el, c, { strategy: 'fixed', placement: 'right-start', middleware: [offset(16), flip({ padding: 12 }), shift({ padding: 12 })] })
          .then(({ x, y }) => { c.style.left = x + 'px'; c.style.top = y + 'px'; });
        else { c.style.left = (innerWidth - c.offsetWidth) / 2 + 'px'; c.style.top = innerHeight - c.offsetHeight - 72 + 'px'; }
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
          <div class="acts"><button class="skip" onClick=${() => { at.value = STEPS.length; }}>Skip</button></div>
        </div>`
      : html`<form class="tour-card" ref=${card} role="dialog" aria-modal="true" aria-label="Tour" data-trap
          onSubmit=${e => { e.preventDefault(); finish(false); }} onKeyDown=${e => { if (e.key === 'Escape') finish(false); }}>
          <p><b>${Shell.keyLabel('$mod+KeyZ')}</b> undoes anything.</p>
          <label>Your name<input value=${name} onInput=${e => setName(e.target.value)} ref=${el => el && !el.dataset.on && (el.dataset.on = 1, el.focus({ preventScroll: true }))} /></label>
          <div class="acts"><button type="button" class="btn" onClick=${() => finish(true)}>Start blank</button><button class="btn primary">Keep this chart</button></div>
        </form>`}`;
  }
  const host = document.createElement('div');
  document.addEventListener('DOMContentLoaded', () => { document.body.appendChild(host); render(html`<${Layer} />`, host); });

  Shell.register('action', { id: 'tour', name: 'Tour', menu: 'chart', order: 40, run: start });
  return { start, end };
})();
