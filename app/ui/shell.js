// Dendra's window (dendra.md, Part 2): the title bar, the format and formula bars, the view beside the
// inspector, and the sheet tabs with the status bar; and the pieces every part uses: menus, popovers,
// dialogs, toasts, keys, Find and an event bus. Preact with htm and signals, all classic scripts.
//
// THE COORDINATES are signals, and the address (location.hash) holds them, so any state can be linked:
//   Shell.view       the id of the view shown
//   Shell.selection  what is selected: a list of keys, in whatever form the part that selects them uses
//   Shell.time       null for today, { asOf: 'yyyy-mm-dd' }, or { stood: changeId, at: isoTime }
// Shell.show(id), Shell.select(keys) and Shell.at(time) change them, each a step on the trail that
// Alt+Left and Alt+Right walk (pass { replace: true } for a change that isn't a step).
//
// THE PARTS register with Shell.register(kind, thing), which returns a function that unregisters it.
// What a provider's functions read while the window draws (signals included) redraws it when it changes.
// One of each:
//   'canvas', 'table'   { mount(el) → unmount? }  draws the view, when it's laid out as a chart or a table
//   'inspector'         { mount(el) → unmount? }  shows the selection
//   'formatbar'         { mount(el) → unmount? }  under the title bar, on views laid out as charts
//   'formulabar'        { mount(el) → unmount? }  under the format bar
//   'views'      { list() → [{ id, name, layout: 'chart' | 'table' }], rename(id, name), move(id, index),
//                  add?() → id, menu?(id) → items }                          the sheet tabs
//   'workbook'   { charts() → [{ id, name }], current() → id, open(id), menu?() → items }   the chart menu
//   'undo'       { undo(), redo(), canUndo() → bool, canRedo() → bool }
//   'time'       { days() → ['yyyy-mm-dd', …] }   the days on which something starts or ends
//   'attention'  { items() → [{ kind: 'overdue' | 'blank' | 'error', go() }] }   counted; F8 steps through
//   'evaluate'   (text, selection) → { value } | { items: [{ label, detail?, run }] } | { error }   Find's "="
// Any number of:
//   'action'  { id, name, run, keys?, enabled?() → bool, menu?: 'chart', order? }   in Find, the chart
//             menu (by order: History 10, Settings 20, Light and Dark 30, Tour 40) and the keys
//   'find'    { items() → [{ label, detail?, run }] }    Find's other sources: records, lists
//   'export'  { name, run }                              the Export menu
//   'status'  { render() → vnode }                       beside the counts in the status bar
// A part's mount may instead be a Preact component, which the slot renders.
//
// THE PIECES: Shell.menu(anchor, items, opts) and Shell.popover(anchor, render, opts) on Floating UI;
// Shell.dialog(opts) and Shell.confirm(text, opts) on <dialog>; Shell.toast(text, { undo }); Shell.keys(map,
// opts) on tinykeys; Shell.find(query) opens Find; Shell.icon(name); Shell.on(event, fn) and
// Shell.emit(event, detail), the bus (tour.js lists the events the parts emit); Shell.widen() and
// Shell.narrow() for the inspector; Shell.theme and Shell.user, signals; Shell.html, htm bound to Preact.
// A menu item is '-', { head }, or { label, detail?, keys?, checked?, disabled?, danger?, run?, items? }.
//
// With ?slots in the address, a slot nothing has registered for shows its name, muted.

const Shell = (() => {
  const { h, render } = preact;
  const { useEffect, useLayoutEffect, useRef, useState } = preactHooks;
  const { signal, computed, effect, batch } = preactSignals;
  const { computePosition, autoUpdate, offset, flip, shift } = FloatingUIDOM;
  const html = htm.bind(h);
  const SLOTS = new URLSearchParams(location.search).has('slots');
  const store = {
    get: k => { try { return localStorage.getItem('dendra.' + k); } catch { return null; } },
    set: (k, v) => { try { v == null ? localStorage.removeItem('dendra.' + k) : localStorage.setItem('dendra.' + k, v); } catch {} },
  };

  // ---- The bus ----
  const bus = new EventTarget();
  const on = (name, fn) => { const f = e => fn(e.detail); bus.addEventListener(name, f); return () => bus.removeEventListener(name, f); };
  const emit = (name, detail) => bus.dispatchEvent(new CustomEvent(name, { detail }));

  // ---- The registry ----
  const MANY = new Set(['action', 'find', 'export', 'status']);
  const reg = signal({});
  const part = kind => reg.value[kind];
  const many = kind => reg.value[kind] || [];
  function register(kind, thing) {
    const r = reg.peek();
    reg.value = { ...r, [kind]: MANY.has(kind) ? [...(r[kind] || []), thing] : thing };
    const unbind = kind === 'action' && thing.keys ? keys({ [thing.keys]: () => (!thing.enabled || thing.enabled()) && thing.run() }) : null;
    return () => {
      const r = reg.peek();
      reg.value = { ...r, [kind]: MANY.has(kind) ? (r[kind] || []).filter(t => t !== thing) : r[kind] === thing ? undefined : r[kind] };
      unbind?.();
    };
  }

  // ---- The coordinates, the address and the trail ----
  const view = signal(null), selection = signal([]), time = signal(null);
  const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  const enc = encodeURIComponent;
  function addressOf(v, s, t) {
    const p = [];
    if (v) p.push('v=' + enc(v));
    if (s.length) p.push('s=' + s.map(enc).join(','));
    if (t) p.push('t=' + (t.stood ? '@' + enc(t.stood) : t.asOf));
    return '#' + p.join('&');
  }
  function parse(hash) {
    const q = new URLSearchParams(hash.replace(/^#/, '')), t = q.get('t');
    return {
      view: q.get('v') || null,
      selection: q.get('s') ? q.get('s').split(',').map(decodeURIComponent) : [],
      time: !t ? null : t[0] === '@' ? { stood: decodeURIComponent(t.slice(1)) } : /^\d{4}-\d\d-\d\d$/.test(t) ? { asOf: t } : null,
    };
  }
  let step = history.state?.dendra ?? 0, restoring = false, replacing = false, started = false;
  const url = a => a === '#' ? location.pathname + location.search : a;
  function apply(a) {
    restoring = true;
    batch(() => { view.value = a.view; if (!same(selection.peek(), a.selection)) selection.value = a.selection; time.value = a.time; });
    restoring = false;
  }
  effect(() => {
    const a = addressOf(view.value, selection.value, time.value);
    if (restoring || !started || a === (location.hash || '#')) return;
    if (replacing) history.replaceState({ dendra: step }, '', url(a));
    else history.pushState({ dendra: ++step }, '', url(a));
  });
  addEventListener('popstate', e => {
    if (e.state?.dendra == null) history.replaceState({ dendra: ++step }, '', location.hash);
    else step = e.state.dendra;
    apply(parse(location.hash));
  });
  const go = (fn, o) => { replacing = !!o?.replace; batch(fn); replacing = false; };
  const select = (keys, o) => go(() => { const k = [].concat(keys ?? []); if (!same(k, selection.peek())) selection.value = k; }, o);
  const show = (id, o) => go(() => { view.value = id; }, o);
  const at = (t, o) => go(() => { time.value = t || null; }, o);
  const back = () => { if (step > 0) history.back(); };
  const forward = () => history.forward();
  let lastSel = [], lastView = null;
  effect(() => { const s = selection.value; if (!same(s, lastSel)) { lastSel = s; emit('select', s); } });
  effect(() => { const v = view.value; if (v !== lastView) { lastView = v; emit('view-switch', v); } });
  const views = computed(() => part('views')?.list() || []);
  const current = computed(() => views.value.find(v => v.id === view.value));
  effect(() => { const vs = views.value; if (vs.length && !current.value) show(vs[0].id, { replace: true }); });

  // ---- Theme, the user, the inspector's width ----
  const theme = signal(document.documentElement.dataset.theme || 'light');
  function setTheme(t, keep = true) { theme.value = t; document.documentElement.dataset.theme = t; if (keep) store.set('theme', t); emit('theme', t); }
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => { if (!store.get('theme')) setTheme(e.matches ? 'dark' : 'light', false); });
  const user = signal({ name: store.get('name') || '', signedIn: false });
  effect(() => store.set('name', user.value.name || null));
  const insp = signal(Math.max(280, +store.get('inspector') || 360));
  const wide = signal(false), gliding = signal(false);
  const glide = () => { gliding.value = true; setTimeout(() => { gliding.value = false; }, 240); };
  const widen = () => { if (!wide.peek()) { glide(); wide.value = true; } };
  const narrow = () => { if (wide.peek()) { glide(); wide.value = false; } };

  // ---- Keys ----
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
  const keyLabel = k => !k ? '' : k.replace(/\$mod/g, isMac ? 'Cmd' : 'Ctrl').replace(/Key([A-Z])/g, '$1').replace(/Digit(\d)/g, '$1').replace(/Arrow(\w+)/g, '$1');
  function keys(map, o = {}) {
    const wrapped = {};
    for (const [k, fn] of Object.entries(map)) wrapped[k] = e => { if (fn(e) !== false) e.preventDefault(); };
    return tinykeys.tinykeys(o.target || window, wrapped, o.inputs ? { ignore: e => e.isComposing } : {});
  }

  // ---- Icons: only functional ones ----
  const PATHS = {
    chevron: 'M4.5 6.5 8 10l3.5-3.5', check: 'M3.5 8.5l3 3 6-7', plus: 'M8 3.5v9M3.5 8h9', x: 'M4.5 4.5l7 7m0-7-7 7',
    undo: 'M6.5 3.5 3.5 6.5l3 3M3.5 6.5h6a3 3 0 0 1 0 6h-2', redo: 'M9.5 3.5l3 3-3 3M12.5 6.5h-6a3 3 0 0 0 0 6h2',
  };
  const icon = name => html`<svg class="i" viewBox="0 0 16 16" aria-hidden="true"><path d=${PATHS[name]} /></svg>`;
  // The mark, small cut (app/assets/mark-small.svg): a tree grown by one rule, with its roots the same rule reflected.
  const MARK = 'M9 12L9 8.9A1 1 0 0 0 7 8.9L7 12ZM8.37 8.65L6.2 5.4A0.45 0.45 0 0 0 5.45 5.9L7.63 9.15ZM6.08 5.28L3.55 3.58A0.45 0.45 0 0 0 3.05 4.33L5.58 6.03ZM3.45 3.53L1.21 2.74A0.45 0.45 0 0 0 0.91 3.58L3.14 4.38ZM3.66 3.7L2.29 1.76A0.45 0.45 0 0 0 1.56 2.28L2.93 4.22ZM6.27 5.6L5.88 2.58A0.45 0.45 0 0 0 4.98 2.69L5.38 5.71ZM5.84 2.45L4.85 0.29A0.45 0.45 0 0 0 4.04 0.66L5.02 2.82ZM5.87 2.72L6.31 0.38A0.45 0.45 0 0 0 5.42 0.22L4.99 2.55ZM8.37 9.15L10.55 5.9A0.45 0.45 0 0 0 9.8 5.4L7.63 8.65ZM10.62 5.71L11.02 2.69A0.45 0.45 0 0 0 10.12 2.58L9.73 5.6ZM11.01 2.55L10.58 0.22A0.45 0.45 0 0 0 9.69 0.38L10.13 2.72ZM10.98 2.82L11.96 0.66A0.45 0.45 0 0 0 11.15 0.29L10.16 2.45ZM10.42 6.03L12.95 4.33A0.45 0.45 0 0 0 12.45 3.58L9.92 5.28ZM13.07 4.22L14.44 2.28A0.45 0.45 0 0 0 13.71 1.76L12.34 3.7ZM12.86 4.38L15.09 3.58A0.45 0.45 0 0 0 14.79 2.74L12.55 3.53ZM7 12L7 12.93A1 1 0 0 0 9 12.93L9 12ZM7.82 12.52L5.64 13.49A0.45 0.45 0 0 0 6.01 14.31L8.18 13.34ZM5.74 13.46L3.21 13.97A0.45 0.45 0 0 0 3.38 14.85L5.91 14.35ZM3.25 13.97L1.01 14.2A0.45 0.45 0 0 0 1.11 15.1L3.34 14.86ZM3.12 14L1.75 14.58A0.45 0.45 0 0 0 2.1 15.41L3.47 14.83ZM5.41 13.72L5.02 14.63A0.45 0.45 0 0 0 5.84 14.99L6.24 14.08ZM5.18 14.43L4.2 15.08A0.45 0.45 0 0 0 4.69 15.83L5.68 15.19ZM5.05 15.05L5.48 15.75A0.45 0.45 0 0 0 6.25 15.27L5.81 14.57ZM7.82 13.34L9.99 14.31A0.45 0.45 0 0 0 10.36 13.49L8.18 12.52ZM9.76 14.08L10.16 14.99A0.45 0.45 0 0 0 10.98 14.63L10.59 13.72ZM10.19 14.57L9.75 15.27A0.45 0.45 0 0 0 10.52 15.75L10.95 15.05ZM10.32 15.19L11.31 15.83A0.45 0.45 0 0 0 11.8 15.08L10.82 14.43ZM10.09 14.35L12.62 14.85A0.45 0.45 0 0 0 12.79 13.97L10.26 13.46ZM12.53 14.83L13.9 15.41A0.45 0.45 0 0 0 14.25 14.58L12.88 14ZM12.66 14.86L14.89 15.1A0.45 0.45 0 0 0 14.99 14.2L12.75 13.97Z';
  const mark = html`<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d=${MARK} /></svg>`;

  // ---- Floating layers: menus and popovers, in the top layer, placed by Floating UI ----
  const floats = signal([]);
  let fid = 0;
  function openFloat(f) {
    const open = floats.peek();
    if (!f.parent) {
      const again = open.find(x => !x.parent && x.anchor === f.anchor && f.anchor instanceof Element);
      open.forEach(x => x.close());
      if (again) return () => {};
    }
    const id = ++fid, back = document.activeElement;
    let shut = false;
    const close = () => {
      if (shut) return;
      shut = true;
      floats.peek().filter(x => x.parent === id).forEach(x => x.close());
      floats.value = floats.peek().filter(x => x.id !== id);
      f.onClose?.();
      if (!f.parent && back?.isConnected && document.activeElement?.closest?.('.float')) back.focus();
    };
    if (f.parent) floats.peek().filter(x => x.parent === f.parent).forEach(x => x.close());
    floats.value = [...floats.peek(), { ...f, id, close }];
    return close;
  }
  const menu = (anchor, items, o = {}) => openFloat({ kind: 'menu', anchor, items, ...o });
  const popover = (anchor, draw, o = {}) => openFloat({ kind: 'pop', anchor, draw, ...o });
  const closeAll = () => floats.peek().forEach(x => x.close());
  const virtual = p => ({ getBoundingClientRect: () => ({ x: p.x, y: p.y, left: p.x, top: p.y, right: p.x, bottom: p.y, width: 0, height: 0 }) });
  function place(anchor, el, placement, gap = 4) {
    const ref = anchor instanceof Element ? anchor : virtual(anchor);
    const update = () => computePosition(ref, el, { strategy: 'fixed', placement, middleware: [offset(gap), flip({ padding: 8 }), shift({ padding: 8 })] })
      .then(({ x, y }) => { el.style.left = x + 'px'; el.style.top = y + 'px'; });
    if (!(anchor instanceof Element)) { update(); return () => {}; }
    return autoUpdate(ref, el, update);
  }
  function Float({ f }) {
    const ref = useRef();
    useLayoutEffect(() => {
      const el = ref.current;
      el.showPopover?.();
      const stop = place(f.anchor, el, f.placement || 'bottom-start', f.gap);
      if (f.kind === 'menu') (el.querySelector('.menu-find') || el.querySelector('.menu'))?.focus({ preventScroll: true });
      return stop;
    }, []);
    return html`<div class="float in" popover="manual" ref=${ref}>
      ${f.kind === 'menu' ? html`<${Menu} f=${f} />` : html`<div class="pop">${f.draw(f.close)}</div>`}</div>`;
  }
  document.addEventListener('pointerdown', e => {
    const open = floats.peek();
    if (!open.length || e.target.closest?.('.float')) return;
    const top = open.find(x => !x.parent);
    if (top?.anchor instanceof Element && top.anchor.contains(e.target)) return; // its click toggles it
    closeAll();
  }, true);
  document.addEventListener('keydown', e => {
    const open = floats.peek();
    if (e.key !== 'Escape' || !open.length) return;
    e.preventDefault(); e.stopPropagation();
    open[open.length - 1].close();
  }, true);

  const uf = new uFuzzy({ intraMode: 1 });
  function rank(items, q, limit = 50) {
    const [idxs, info, order] = uf.search(items.map(x => x.label), q, 1);
    if (!idxs) return [];
    if (!order) return idxs.slice(0, limit).map(i => items[i]);
    return order.slice(0, limit).map(o => ({ ...items[info.idx[o]], ranges: info.ranges[o] }));
  }
  const marked = (label, ranges) => !ranges ? label : uFuzzy.highlight(label, ranges, (p, m) => m ? html`<b>${p}</b>` : p, [], (a, p) => { a.push(p); });
  const selectable = it => it && it !== '-' && !it.head && !it.seg && !it.disabled;

  function Menu({ f }) {
    const [q, setQ] = useState('');
    const [act, setAct] = useState(-1);
    const all = typeof f.items === 'function' ? f.items() : f.items;
    const items = f.search && q.trim() ? rank(all.filter(selectable), q) : all;
    const live = items.map((it, i) => selectable(it) ? i : -1).filter(i => i >= 0);
    const active = f.search && q.trim() && act < 0 ? live[0] : act;
    const checks = items.some(it => it && it.checked !== undefined);
    const run = it => {
      if (it.items) return openSub(it, document.querySelector(`[data-mi="${f.id}-${items.indexOf(it)}"]`));
      closeAll();
      it.run?.();
    };
    const openSub = (it, el) => el && menu(el, it.items, { parent: f.id, placement: 'right-start', gap: 2 });
    const move = d => {
      if (!live.length) return;
      const k = live.indexOf(active);
      setAct(live[k < 0 ? (d > 0 ? 0 : live.length - 1) : (k + d + live.length) % live.length]);
    };
    const onKey = e => {
      const it = items[active];
      if (e.key === 'ArrowDown') move(1);
      else if (e.key === 'ArrowUp') move(-1);
      else if (e.key === 'Home') setAct(live[0]);
      else if (e.key === 'End') setAct(live[live.length - 1]);
      else if (e.key === 'Enter' && it) run(it);
      else if (e.key === 'ArrowRight' && it?.items) run(it);
      else if (e.key === 'ArrowLeft' && f.parent) f.close();
      else if (!f.search && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const k = e.key.toLowerCase(), from = live.indexOf(active);
        const next = [...live.slice(from + 1), ...live.slice(0, from + 1)].find(i => items[i].label.toLowerCase().startsWith(k));
        if (next === undefined) return;
        setAct(next);
      } else return;
      e.preventDefault();
    };
    useLayoutEffect(() => { document.querySelector(`[data-mi="${f.id}-${active}"]`)?.scrollIntoView({ block: 'nearest' }); }, [active]);
    return html`<div class="menu" role="menu" tabindex="-1" onKeyDown=${onKey}>
      ${f.search ? html`<input class="menu-find" placeholder="Find" value=${q} onInput=${e => { setQ(e.target.value); setAct(-1); }} />` : null}
      ${items.map((it, i) => it === '-' ? html`<div class="menu-sep" />`
        : it.head ? html`<div class="menu-head">${it.head}</div>`
        : it.seg ? html`<div class="menu-seg">${it.seg.map(s => html`<button aria-pressed=${!!s.pressed} onClick=${s.run}>${s.label}</button>`)}</div>`
        : html`<div role="menuitem" data-mi=${`${f.id}-${i}`} aria-disabled=${it.disabled ? 'true' : null}
            class=${'menu-item' + (i === active ? ' on' : '') + (it.items ? ' sub' : '') + (it.danger ? ' danger' : '')}
            onPointerMove=${() => { if (i !== act && !it.disabled) { setAct(i); if (it.items) openSub(it, document.querySelector(`[data-mi="${f.id}-${i}"]`)); else floats.peek().filter(x => x.parent === f.id).forEach(x => x.close()); } }}
            onClick=${() => !it.disabled && run(it)}>
            ${checks ? html`<span class="check">${it.checked ? icon('check') : null}</span>` : null}
            <span class="label">${marked(it.label, it.ranges)}</span>
            ${it.detail ? html`<span class="detail">${it.detail}</span>` : null}
            ${it.keys ? html`<kbd>${keyLabel(it.keys)}</kbd>` : null}
          </div>`)}
      ${f.search && q.trim() && !live.length ? html`<div class="menu-none">No match</div>` : null}
    </div>`;
  }

  // ---- The tooltip: names an icon-only control, and its key ----
  const tip = signal(null);
  let tipEl = null, tipTimer = 0;
  document.addEventListener('pointerover', e => {
    const el = e.target.closest?.('[data-tip]');
    if (el === tipEl) return;
    clearTimeout(tipTimer); tip.value = null; tipEl = el;
    if (el) tipTimer = setTimeout(() => { if (el.isConnected) tip.value = el; }, 600);
  });
  document.addEventListener('pointerdown', () => { clearTimeout(tipTimer); tip.value = null; }, true);
  function Tip() {
    const el = tip.value, ref = useRef();
    useLayoutEffect(() => { if (!el) return; ref.current.showPopover?.(); return place(el, ref.current, 'bottom', 6); }, [el]);
    return el ? html`<div class="float tip" popover="manual" ref=${ref}>${el.dataset.tip}${el.dataset.keys ? html`<kbd>${el.dataset.keys}</kbd>` : null}</div>` : null;
  }

  // ---- Dialogs, on <dialog> ----
  function dialog({ title, body, actions = [{ label: 'OK', value: true, primary: true }], width }) {
    return new Promise(resolve => {
      const el = document.createElement('dialog');
      el.className = 'dlg';
      if (width) el.style.width = `min(${width}px, calc(100vw - 32px))`;
      let result;
      const finish = v => { result = v; el.close(); };
      el.addEventListener('close', () => { render(null, el); el.remove(); resolve(result); });
      const primary = actions.find(a => a.primary);
      render(html`<form method="dialog" onSubmit=${e => { e.preventDefault(); finish(primary?.value); }}>
        ${title ? html`<div class="dlg-head">${title}</div>` : null}
        <div class="dlg-body">${typeof body === 'function' ? body(finish) : body}</div>
        <div class="dlg-foot">${actions.map(a => html`<button type=${a.primary ? 'submit' : 'button'} autofocus=${!!a.focus}
          class=${'btn' + (a.primary ? ' primary' : a.danger ? ' danger' : '')} onClick=${a.primary ? undefined : () => finish(a.value)}>${a.label}</button>`)}</div>
      </form>`, el);
      document.body.appendChild(el);
      el.showModal();
    });
  }
  const confirm = (text, o = {}) => dialog({
    title: o.title, body: html`<p>${text}</p>`,
    actions: [{ label: 'Cancel', value: false, focus: !!o.danger }, { label: o.ok || 'OK', value: true, primary: !o.danger, danger: !!o.danger }],
  });

  // ---- Toasts: a verb, an object and Undo ----
  const toasts = signal([]);
  let tid = 0;
  function toast(text, o = {}) {
    const t = { id: ++tid, text, undo: o.undo, timer: 0 };
    const dismiss = () => { clearTimeout(t.timer); toasts.value = toasts.peek().filter(x => x !== t); };
    t.arm = () => { clearTimeout(t.timer); t.timer = setTimeout(dismiss, o.ms || 6000); };
    t.dismiss = dismiss;
    toasts.peek().forEach(x => clearTimeout(x.timer));
    toasts.value = [t];
    t.arm();
    return dismiss;
  }
  const Toasts = () => html`<div class="toasts" aria-live="polite">${toasts.value.map(t => html`
    <div class="toast" key=${t.id} onPointerEnter=${() => clearTimeout(t.timer)} onPointerLeave=${t.arm}>
      <span>${t.text}</span>${t.undo ? html`<button onClick=${() => { t.dismiss(); t.undo(); }}>Undo</button>` : null}</div>`)}</div>`;

  // ---- Find: records, lists, views and actions, ranked as you type; "=" works a formula out ----
  const finding = signal(null);
  const find = (q = '') => { closeAll(); finding.value = { q }; };
  function sources() {
    const vs = views.value.map(v => ({ label: v.name, detail: 'View', run: () => show(v.id) }));
    const acts = many('action').filter(a => !a.enabled || a.enabled()).map(a => ({ label: a.name, detail: keyLabel(a.keys), run: a.run }));
    return { vs, acts, rest: many('find').flatMap(s => s.items()) };
  }
  function answers(q) {
    if (q.startsWith('=')) {
      const ev = part('evaluate');
      if (!ev || !q.slice(1).trim()) return [];
      let r;
      try { r = ev(q, selection.peek()); } catch (e) { r = { error: e.message || String(e) }; }
      if (r?.error) return [{ label: r.error, err: true }];
      if (r?.items) return r.items;
      return [{ label: String(r?.value ?? ''), mono: true }];
    }
    const { vs, acts, rest } = sources();
    if (!q.trim()) return [...(vs.length ? [{ head: 'Views' }, ...vs] : []), ...(acts.length ? [{ head: 'Actions' }, ...acts] : [])];
    return rank([...vs, ...rest, ...acts], q);
  }
  function Find() {
    const st = finding.value, ref = useRef(), list = useRef();
    const [q, setQ] = useState(st.q);
    const [act, setAct] = useState(0);
    const rows = answers(q);
    const live = rows.map((r, i) => r.head || r.err || !r.run ? -1 : i).filter(i => i >= 0);
    const active = live.includes(act) ? act : live[0] ?? -1;
    const close = () => { finding.value = null; };
    const run = r => { close(); r?.run?.(); };
    useLayoutEffect(() => { ref.current.showPopover?.(); ref.current.querySelector('input').focus(); }, []);
    useLayoutEffect(() => { list.current?.children[active]?.scrollIntoView({ block: 'nearest' }); }, [active]);
    useEffect(() => {
      const away = e => { if (!ref.current.contains(e.target)) close(); };
      document.addEventListener('pointerdown', away, true);
      return () => document.removeEventListener('pointerdown', away, true);
    }, []);
    const onKey = e => {
      const k = live.indexOf(active);
      if (e.key === 'ArrowDown' && live.length) setAct(live[(k + 1) % live.length]);
      else if (e.key === 'ArrowUp' && live.length) setAct(live[(k - 1 + live.length) % live.length]);
      else if (e.key === 'Enter') run(rows[active]);
      else if (e.key === 'Escape') close();
      else return;
      e.preventDefault(); e.stopPropagation();
    };
    return html`<div class="float findpal" popover="manual" ref=${ref} onKeyDown=${onKey}>
      <input class=${'menu-find' + (q.startsWith('=') ? ' mono' : '')} placeholder="Find" value=${q} spellcheck="false" autocomplete="off"
        onInput=${e => { setQ(e.target.value); setAct(0); }} />
      ${rows.length ? html`<div class="find-rows" ref=${list}>${rows.map((r, i) => r.head ? html`<div class="menu-head">${r.head}</div>`
        : html`<div class=${'menu-item' + (i === active ? ' on' : '') + (r.err ? ' danger' : '')} onPointerMove=${() => r.run && setAct(i)} onClick=${() => r.run && run(r)}>
            <span class=${'label' + (r.mono ? ' mono' : '')}>${marked(r.label, r.ranges)}</span>${r.detail ? html`<span class="detail">${r.detail}</span>` : null}</div>`)}</div>`
        : q.trim() && q !== '=' ? html`<div class="menu-none">No match</div>` : null}
    </div>`;
  }

  // ---- The title bar ----
  const fmtDay = iso => new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const timeLabel = t => !t ? 'As of today' : t.asOf ? 'As of ' + fmtDay(t.asOf)
    : 'As it stood' + (t.at ? ' ' + new Date(t.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');
  const chartName = computed(() => { const wb = part('workbook'); return wb ? wb.charts().find(c => c.id === wb.current())?.name : null; });
  effect(() => { document.title = chartName.value ? `${chartName.value} – Dendra` : 'Dendra'; });

  function chartMenu() {
    const wb = part('workbook'), items = [];
    if (wb) items.push(...wb.charts().map(c => ({ label: c.name, checked: c.id === wb.current(), run: () => wb.open(c.id) })), ...(wb.menu?.() || []), '-');
    const themes = { order: 30, seg: [['Light', 'light'], ['Dark', 'dark']].map(([label, t]) => ({ label, pressed: theme.value === t, run: () => setTheme(t) })) };
    const acts = many('action').filter(a => a.menu === 'chart').map(a => ({ order: a.order ?? 25, label: a.name, keys: a.keys, disabled: a.enabled && !a.enabled(), run: a.run }));
    for (const it of [...acts, themes].sort((a, b) => a.order - b.order)) {
      if (it.seg && items.length && items[items.length - 1] !== '-') items.push('-');
      items.push(it);
      if (it.seg) items.push('-');
    }
    if (items[items.length - 1] === '-') items.pop();
    return items;
  }
  function Strip({ days, value, pick }) {
    const t = d => new Date(d + 'T12:00:00').getTime(), lo = t(days[0]), hi = t(days[days.length - 1]), span = Math.max(1, hi - lo);
    const x = d => (t(d) - lo) / span * 100;
    const nearest = e => {
      const r = e.currentTarget.getBoundingClientRect(), at = lo + (e.clientX - r.left) / r.width * span;
      return days.reduce((a, b) => Math.abs(t(b) - at) < Math.abs(t(a) - at) ? b : a);
    };
    const [hover, setHover] = useState(null);
    return html`<div class="strip" onPointerMove=${e => setHover(nearest(e))} onPointerLeave=${() => setHover(null)} onClick=${e => pick(nearest(e))}>
      ${days.map(d => html`<i class=${d === value ? 'on' : d === hover ? 'hot' : ''} style=${`left:${x(d)}%`} />`)}
      <span class="strip-a">${fmtDay(hover || value || days[0])}</span>
    </div>`;
  }
  function When({ close }) {
    const t = time.value, days = part('time')?.days() || [], now = today();
    return html`<div class="when">
      <div class="when-row">
        <button class="btn" aria-pressed=${!t} onClick=${() => { at(null); close(); }}>Today</button>
        <input type="date" value=${t?.asOf || now} onChange=${e => e.target.value && at(e.target.value === now ? null : { asOf: e.target.value })} />
      </div>
      ${days.length > 1 ? html`<${Strip} days=${days} value=${t?.asOf} pick=${d => at({ asOf: d })} />` : null}
    </div>`;
  }
  function TitleBar() {
    const u = part('undo'), ex = many('export'), t = time.value;
    return html`<header class="titlebar">
      <div class="left"><button class="btn ghost dd chartmenu" onClick=${e => menu(e.currentTarget, chartMenu)}>${mark}<span class="name">${chartName.value || 'Dendra'}</span></button></div>
      <button class="find" onClick=${() => find()}><span>Find</span><kbd>${keyLabel('$mod+K')}</kbd></button>
      <div class="right">
        <button class=${'btn ghost dd asof' + (t ? ' past' : '')} onClick=${e => popover(e.currentTarget, close => html`<${When} close=${close} />`, { placement: 'bottom-end' })}>${timeLabel(t)}</button>
        <span class="sep" />
        <button class="btn icon" aria-label="Undo" data-tip="Undo" data-keys=${keyLabel('$mod+Z')} disabled=${!u?.canUndo()} onClick=${() => u.undo()}>${icon('undo')}</button>
        <button class="btn icon" aria-label="Redo" data-tip="Redo" data-keys=${keyLabel('$mod+Y')} disabled=${!u?.canRedo()} onClick=${() => u.redo()}>${icon('redo')}</button>
        <button class="btn primary dd" disabled=${!ex.length} onClick=${e => menu(e.currentTarget, ex.map(x => ({ label: x.name, run: x.run })), { placement: 'bottom-end' })}>Export</button>
      </div>
    </header>`;
  }

  // ---- Slots: where the other parts draw ----
  function Host({ kind, label, hidden, cls = 'host' }) {
    const p = part(kind), ref = useRef(), [seen, setSeen] = useState(!hidden);
    if (!hidden && !seen) setSeen(true);
    useEffect(() => {
      if (!p || !seen) return;
      const el = ref.current;
      if (typeof p === 'function') { render(h(p), el); return () => render(null, el); }
      const off = p.mount(el);
      return () => { if (typeof off === 'function') off(); el.replaceChildren(); };
    }, [p, seen]);
    if (!p) return SLOTS && !hidden ? html`<div class="ph">${label}</div>` : null;
    return html`<div class=${cls} ref=${ref} hidden=${hidden} />`;
  }
  const Bar = ({ kind, label }) => part(kind) || SLOTS ? html`<div class=${'slot ' + kind}><${Host} kind=${kind} label=${label} /></div>` : html`<div hidden />`;

  // ---- The view and the inspector ----
  function Main() {
    const layout = current.value?.layout || 'chart';
    const drag = e => {
      if (e.button !== 0) return;
      e.preventDefault();
      const el = e.currentTarget, W = innerWidth;
      el.setPointerCapture(e.pointerId);
      el.classList.add('drag');
      const move = ev => {
        const w = W - ev.clientX;
        wide.value = w > W - 160;
        if (!wide.value) insp.value = Math.round(Math.min(Math.max(w, 280), W - 320));
      };
      const up = () => { el.classList.remove('drag'); el.removeEventListener('pointermove', move); store.set('inspector', insp.value); };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up, { once: true });
    };
    return html`<div class=${'main' + (wide.value ? ' wide' : '') + (gliding.value ? ' anim' : '')} style=${`--insp:${insp.value}px`}>
      <div class="view" aria-hidden=${wide.value ? 'true' : null}>
        <${Host} kind="canvas" label="Canvas" hidden=${layout !== 'chart'} />
        <${Host} kind="table" label="Table" hidden=${layout !== 'table'} />
      </div>
      <div class="divider" role="separator" aria-orientation="vertical" onPointerDown=${drag} onDblClick=${() => wide.value ? narrow() : widen()} />
      <aside class="inspector"><${Host} kind="inspector" label="Inspector" /></aside>
    </div>`;
  }

  // ---- The sheet tabs ----
  function Sheets() {
    const vp = part('views'), list = views.value, ref = useRef();
    const [editing, setEditing] = useState(null);
    useLayoutEffect(() => { ref.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }, [view.value, list.length]);
    if (!vp) return SLOTS ? html`<div class="ph">Views</div>` : html`<div class="sheets" />`;
    const down = (e, v) => {
      if (e.button !== 0 || editing) return;
      show(v.id);
      const tab = e.currentTarget, x0 = e.clientX, tabs = [...ref.current.children];
      let dragging = false, to = -1;
      const clear = () => tabs.forEach(t => t.classList.remove('drop-before', 'drop-after', 'dragging'));
      const move = ev => {
        if (!dragging && Math.abs(ev.clientX - x0) < 5) return;
        if (!dragging) { dragging = true; tab.setPointerCapture(e.pointerId); }
        clear(); tab.classList.add('dragging');
        to = tabs.findIndex(t => { const r = t.getBoundingClientRect(); return ev.clientX < r.left + r.width / 2; });
        if (to < 0) { to = tabs.length; tabs[tabs.length - 1].classList.add('drop-after'); } else tabs[to].classList.add('drop-before');
      };
      const up = () => {
        removeEventListener('pointermove', move);
        clear();
        const from = list.findIndex(x => x.id === v.id), i = to > from ? to - 1 : to;
        if (dragging && to >= 0 && i !== from) vp.move(v.id, i);
      };
      addEventListener('pointermove', move);
      addEventListener('pointerup', up, { once: true });
    };
    const commit = (v, name) => { setEditing(null); name = name.trim(); if (name && name !== v.name) vp.rename(v.id, name); };
    const tabMenu = (e, v) => { e.preventDefault(); show(v.id); menu({ x: e.clientX, y: e.clientY }, [{ label: 'Rename', run: () => setEditing(v.id) }, ...(vp.menu?.(v.id) || [])]); };
    const onKey = e => {
      const k = list.findIndex(x => x.id === view.peek()), d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!d || editing) return;
      e.preventDefault();
      const next = list[(k + d + list.length) % list.length];
      show(next.id);
      ref.current.children[list.indexOf(next)]?.focus();
    };
    return html`<div class="sheets" role="tablist" ref=${ref} onKeyDown=${onKey} onWheel=${e => { if (e.deltaY) ref.current.scrollLeft += e.deltaY; }}>
      ${list.map(v => editing === v.id
        ? html`<div class="sheet" aria-selected="true"><input value=${v.name} ref=${el => el && !el.dataset.on && (el.dataset.on = 1, el.focus(), el.select())}
            onKeyDown=${e => { if (e.key === 'Enter') commit(v, e.target.value); else if (e.key === 'Escape') { e.stopPropagation(); setEditing(null); } }}
            onBlur=${e => commit(v, e.target.value)} /></div>`
        : html`<button key=${v.id} class="sheet" role="tab" aria-selected=${v.id === view.value} tabindex=${v.id === view.value ? 0 : -1} data-tour=${v.id === view.value ? null : 'sheet'}
            onPointerDown=${e => down(e, v)} onDblClick=${() => setEditing(v.id)} onContextMenu=${e => tabMenu(e, v)}>${v.name}</button>`)}
    </div>${vp.add ? html`<button class="btn icon" aria-label="New view" data-tip="New view" onClick=${() => { const id = vp.add(); if (id) { show(id); setEditing(id); } }}>${icon('plus')}</button>` : null}`;
  }

  // ---- The status bar: what needs attention, counted; F8 steps through it ----
  const KINDS = [['overdue', n => `${n} overdue`], ['blank', n => `${n} blank`], ['error', n => n === 1 ? '1 error' : `${n} errors`]];
  let stepAt = -1;
  function attend(d = 1, kind) {
    const items = (part('attention')?.items() || []).filter(it => !kind || it.kind === kind);
    if (!items.length) return;
    stepAt = kind ? 0 : (stepAt + d + items.length) % items.length;
    items[stepAt].go();
  }
  function Status() {
    const ap = part('attention'), items = ap?.items() || [], extra = many('status');
    const counts = KINDS.map(([k, say]) => [k, say, items.filter(it => it.kind === k).length]).filter(c => c[2]);
    return html`<div class="status">
      ${counts.map(([k, say, n], i) => html`${i ? html`<span class="muted">·</span>` : null}<button class=${'btn ghost ' + k} onClick=${() => attend(1, k)}>${say(n)}</button>`)}
      ${extra.map(s => s.render())}
      ${!ap && !extra.length && SLOTS ? html`<div class="ph">Status</div>` : null}
    </div>`;
  }

  // ---- The window ----
  const App = () => html`
    <div class="shell">
      <${TitleBar} />
      ${current.value?.layout !== 'table' ? html`<${Bar} kind="formatbar" label="Format bar" />` : html`<div hidden />`}
      <${Bar} kind="formulabar" label="Formula bar" />
      <${Main} />
      <footer class="foot"><${Sheets} /><${Status} /></footer>
    </div>
    ${floats.value.map(f => html`<${Float} key=${f.id} f=${f} />`)}
    ${finding.value ? html`<${Find} key=${finding.value} />` : null}
    <${Toasts} /><${Tip} />`;

  // The shell's own actions and keys.
  register('action', { id: 'back', name: 'Back', keys: 'Alt+ArrowLeft', run: back });
  register('action', { id: 'forward', name: 'Forward', keys: 'Alt+ArrowRight', run: forward });
  register('action', { id: 'attend', name: 'Next to attend to', keys: 'F8', enabled: () => !!part('attention')?.items().length, run: () => attend(1) });
  register('action', { id: 'light', name: 'Light theme', enabled: () => theme.value !== 'light', run: () => setTheme('light') });
  register('action', { id: 'dark', name: 'Dark theme', enabled: () => theme.value !== 'dark', run: () => setTheme('dark') });
  keys({ '$mod+KeyK': () => { finding.peek() ? (finding.value = null) : find(); } }, { inputs: true });
  keys({
    '$mod+KeyZ': () => part('undo')?.canUndo() ? part('undo').undo() : false,
    '$mod+KeyY': () => part('undo')?.canRedo() ? part('undo').redo() : false,
    '$mod+Shift+KeyZ': () => part('undo')?.canRedo() ? part('undo').redo() : false,
    'Shift+F8': () => attend(-1),
    '$mod+Shift+PageUp': () => stepView(-1),
    '$mod+Shift+PageDown': () => stepView(1),
    'Escape': () => {
      if (document.querySelector('dialog[open]')) return false;
      if (wide.peek()) narrow(); else if (selection.peek().length) select([]); else return false;
    },
  });
  function stepView(d) {
    const vs = views.peek(), k = vs.findIndex(v => v.id === view.peek());
    if (vs.length) show(vs[(k + d + vs.length) % vs.length].id);
  }
  addEventListener('resize', () => { if (insp.peek() > innerWidth - 320) insp.value = Math.max(280, innerWidth - 320); });

  // Draws the window, then tells the launch screen it's ready; 'launched' follows when the screen is gone.
  function start() {
    if (started) return;
    apply(parse(location.hash));
    history.replaceState({ dendra: step }, '', url(addressOf(view.peek(), selection.peek(), time.peek())));
    started = true;
    render(html`<${App} />`, document.getElementById('app'));
    requestAnimationFrame(() => {
      emit('ready');
      if (typeof Splash !== 'undefined') { Splash.done(); Splash.ended.then(() => emit('launched')); } else emit('launched');
    });
  }
  document.addEventListener('DOMContentLoaded', start);

  return {
    view, selection, time, show, select, at, back, forward,
    register, on, emit, keys, menu, popover, closeAll, dialog, confirm, toast, find, icon,
    widen, narrow, wide, theme, setTheme, user, html, h, signal, computed, effect, parts: reg,
  };
})();
