// The tour (identity.md §3.5): five steps, each advanced by doing what it teaches, then one card. It runs by
// itself on the very first launch, once the launch screen is gone, if a chart is drawn; after that, from
// Tour in the chart menu or in Find. Enter skips a step, Skip goes to the last card, and Esc ends it.
//
// It waits for these events on the shell's bus, which the parts emit with Shell.emit(name, detail):
//   select        something was selected; detail, the selection      the shell, whenever Shell.selection changes
//   relate-open   the relations two boxes could be in were listed     the canvas, on a drag from edge to box
//   why-open      a computed value's reasons were shown               the formula bar, the inspector
//   tag-flip      a tag was attested or ruled out                     the inspector, the canvas
//   view-switch   another view was shown; detail, its id              the shell, whenever Shell.view changes
// It points at what the parts mark with data-tour: "box" (a box on the canvas), "computed" (an italic
// value), "tag" (a tag's checkbox) and "sheet" (a sheet tab not shown; the shell marks these). It emits
// 'start-blank' when the last card's Start blank is chosen, and 'tour-end' when it ends.

const Tour = (() => {
  const { html, signal, on, emit, user } = Shell;
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
  const toured = () => { try { return localStorage.getItem('dendra.toured') === '1'; } catch { return true; } };

  function start() {
    try { localStorage.setItem('dendra.toured', '1'); } catch {}
    Shell.closeAll();
    at.value = 0;
  }
  const next = () => { if (at.peek() >= 0 && at.peek() < STEPS.length) at.value = at.peek() + 1; };
  const end = () => { if (at.peek() < 0) return; at.value = -1; emit('tour-end'); };
  for (const [i, s] of STEPS.entries()) on(s.event, d => { if (at.peek() === i && (!s.when || s.when(d))) next(); });
  on('launched', () => { if (!toured() && Shell.parts.peek().canvas) start(); });
  document.addEventListener('keydown', e => {
    if (at.peek() < 0 || e.defaultPrevented) return;
    if (e.key === 'Escape') end();
    else if (e.key === 'Enter' && at.peek() < STEPS.length && !e.target.closest?.('input, textarea, select, button, [contenteditable], .CodeMirror')) next();
    else return;
    e.preventDefault(); e.stopPropagation();
  }, true);

  // The one visible thing a step points at, if it's on screen.
  const find = name => [...document.querySelectorAll(`[data-tour="${name}"]`)].find(el => el.getClientRects().length);

  function Layer() {
    const i = at.value, hole = useRef(), card = useRef(), prev = useRef(-1), [name, setName] = useState(user.peek().name);
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
    const finish = blank => { if (name.trim() && !user.peek().signedIn) user.value = { ...user.peek(), name: name.trim() }; end(); if (blank) emit('start-blank'); };
    return html`
      <div class="tour-hole" ref=${hole} />
      <div class="tour-card" ref=${card} role="dialog" aria-live="polite">
        ${step ? html`
          <div class="step">${i + 1} / ${STEPS.length}</div>
          <p><b>${step.act}</b> ${step.say}</p>
          <div class="acts"><button class="skip" onClick=${() => { at.value = STEPS.length; }}>Skip</button></div>`
        : html`
          <p><b>Ctrl+Z</b> undoes anything.</p>
          ${user.value.signedIn ? null : html`<label>Name for the History<input value=${name} onInput=${e => setName(e.target.value)} /></label>`}
          <div class="acts"><button class="btn" onClick=${() => finish(true)}>Start blank</button><button class="btn primary" onClick=${() => finish(false)}>Keep the sample</button></div>`}
      </div>`;
  }
  const host = document.createElement('div');
  document.addEventListener('DOMContentLoaded', () => { document.body.appendChild(host); render(html`<${Layer} />`, host); });

  Shell.register('action', { id: 'tour', name: 'Tour', menu: 'chart', order: 40, run: start });
  return { start, end };
})();
