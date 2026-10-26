// Dendra's window (dendra.md, Part 2), and the contract between its parts. Preact, htm and signals, all classic
// scripts; each part is one global, loaded after this one, that registers with the shell.
//
// THE COORDINATES are signals, held in the address (location.hash) so any state can be linked:
//   Shell.view       the id of the view shown
//   Shell.selection  a list of keys: a record's id (a box, row, line or text); a free shape's id; `legend#row`,
//                    a legend's row; `frame:/…`, a frame; `id@box`, a relation's text in one of its boxes; and
//                    `~json`, an entry, relation or kind in general (Shell.general(pattern), Shell.pattern(key))
//   Shell.time       null for today, { asOf: 'yyyy-mm-dd' }, or { stood: changeId, at: isoTime } in History
// Shell.show(id), Shell.select(keys) and Shell.at(time) change them, each a step on the trail Alt+Left and
// Alt+Right walk ({ replace: true } for a change that isn't a step).
//
// THE PARTS register with Shell.register(kind, thing) → unregister. One of each:
//   'canvas', 'table'  { mount(el) → unmount? }   the view, as a chart or a table   (canvas.js, table.js)
//   'inspector'        { mount(el) → unmount? }   the selection                      (inspector.js)
//   'formatbar'        { mount(el) → unmount? }   on a chart, under the title bar    (formatbar.js)
//   'formulabar'       a component                under the format bar               (formulabar.js)
//   'views'      { list() → [{ id, name, layout }], rename(id, name), move(id, i), add(anchor) → Promise of an
//                  id or null, menu(id) → items }          the sheet tabs           (app.js)
//   'workbook'   { charts() → [{ id, name }], current() → id, open(id), menu() → items }   the chart menu (app.js)
//   'undo'       { undo(), redo(), canUndo(), canRedo() }                                    (app.js)
//   'time'       { When({ close }), Strip() }   the date's popover, the strip under the view  (time.js)
//   'attention'  { items() → [{ kind: 'overdue' | 'blank' | 'error', go() }] }   counted; F8   (inspector.js)
//   'evaluate'   (text, selection) → { value } | { items } | { error }   Find's "="            (formulabar.js)
// Any number of: 'action' { id, name, run, keys?, enabled?, menu?: 'chart', order? } (the chart menu by
// order: files 1–4, History 10, Settings 20, Light and Dark 30, Tour 40); 'find' { items() → menu items },
// Find's records and lists; 'export' { name, run }; 'status' { render() }.
//
// THE BUS, for what more than one part hears (Shell.on(name, fn) → off, Shell.emit(name, detail)):
//   select        the selection changed; its keys       the shell        → the tour, the formula bar
//   view-switch   another view is shown; its id         the shell        → the tour, time.js
//   why-open      a computed record's reasons asked     inspector, canvas, formula bar → the bar, the tour
//   tag-flip      a tag was attested or ruled out       inspector, table, formula bar  → the tour
//   relate-open   two boxes' relations asked for [a, b] the canvas       → the inspector, the tour
// Anything else one part asks of another is a call: FormulaBar.preview(change), App.change(fn), Canvas.zoom.
// Shell.ready and Shell.launched are promises: the window is drawn; the launch screen is gone.
//
// APP (app.js) is the workbook: App.wb; signals chart, version, day, readOnly (in History); computed shown,
// entered, schema, notes, definitions, relations, computed (Formulas.computeState's), state, views
// ([{ id, name, layout, rows, keeps }]), scene (the view shown, drawn), layouts; App.change(fn(tx), { say,
// dated }) → the change, every edit's one way in; App.restore(changeId); App.addView; App.who(); App.blank().
//
// THE PIECES: Shell.menu(anchor, items, opts) and Shell.popover(anchor, draw, opts) on Floating UI; dialog()
// and confirm() on <dialog>; toast(text, { undo }); keys(map, opts) on tinykeys; aside(component | null), in
// the inspector's place; layer(close) → remove, the Esc stack every layer joins; drag(e, { item, items, axis,
// onDrop, onClick }), reordering by drag; find(query); icon(name); store.get/set, this browser's settings;
// widen() and narrow(); theme. A menu item is '-', { head }, or { label, detail?, keys?, checked?, disabled?,
// danger?, mono?, run?, items? }; one without run or items is shown, not chosen.

const Shell = (() => {
  const { h, render } = preact;
  const { useLayoutEffect, useRef, useState } = preactHooks;
  const { signal, computed, effect, batch } = preactSignals;
  const { computePosition, autoUpdate, offset, flip, shift } = FloatingUIDOM;
  const html = htm.bind(h);
  const store = {
    get: k => { try { return localStorage.getItem('dendra.' + k); } catch { return null; } },
    set: (k, v) => { try { v == null ? localStorage.removeItem('dendra.' + k) : localStorage.setItem('dendra.' + k, v); } catch {} },
  };

  // ---- The bus ----
  const bus = new EventTarget();
  const on = (name, fn) => { const f = e => fn(e.detail); bus.addEventListener(name, f); return () => bus.removeEventListener(name, f); };
  const emit = (name, detail) => bus.dispatchEvent(new CustomEvent(name, { detail }));
  let isReady, isLaunched;
  const ready = new Promise(r => { isReady = r; }), launched = new Promise(r => { isLaunched = r; });

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
    const q = Object.fromEntries(hash.replace(/^#/, '').split('&').filter(Boolean).map(p => [p.slice(0, p.indexOf('=') >>> 0), p.slice(p.indexOf('=') + 1)]));
    const dec = s => { try { return decodeURIComponent(s); } catch { return s; } }, t = q.t;
    return {
      view: q.v ? dec(q.v) : null,
      selection: q.s ? q.s.split(',').map(dec) : [],
      time: !t ? null : t[0] === '@' ? { stood: dec(t.slice(1)) } : /^\d{4}-\d\d-\d\d$/.test(t) ? { asOf: t } : null,
    };
  }
  let step = history.state?.dendra ?? 0, restoring = false, replacing = false, started = false;
  const url = a => location.href.split('#')[0] + (a === '#' ? '' : a);
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
    if (e.state?.dendra == null) history.replaceState({ dendra: ++step }, '', location.href);
    else step = e.state.dendra;
    apply(parse(location.hash));
  });
  const go = (fn, o) => { replacing = !!o?.replace; batch(fn); replacing = false; };
  const select = (keys, o) => go(() => { const k = [].concat(keys ?? []); if (!same(k, selection.peek())) selection.value = k; }, o);
  const show = (id, o) => go(() => { view.value = id; }, o);
  const at = (t, o) => go(() => { time.value = t || null; }, o);
  // An entry, relation or kind in general, as a selection key; and a key's pattern, if it's one of those.
  const general = p => '~' + JSON.stringify(p);
  const pattern = key => { if (key?.[0] !== '~') return null; try { return JSON.parse(key.slice(1)); } catch { return null; } };
  const back = () => { if (step > 0) history.back(); };
  const forward = () => history.forward();
  let lastSel = [], lastView = null;
  effect(() => { const s = selection.value; if (!same(s, lastSel)) { lastSel = s; emit('select', s); } });
  effect(() => { const v = view.value; if (v !== lastView) { lastView = v; emit('view-switch', v); } });
  const views = computed(() => part('views')?.list() || []);
  const current = computed(() => views.value.find(v => v.id === view.value));
  effect(() => { const vs = views.value; if (vs.length && !current.value) show(vs[0].id, { replace: true }); });

  // ---- Theme, and the inspector's width ----
  const theme = signal(document.documentElement.dataset.theme || 'light');
  function setTheme(t, keep = true) { theme.value = t; document.documentElement.dataset.theme = t; if (keep) store.set('theme', t); }
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => { if (!store.get('theme')) setTheme(e.matches ? 'dark' : 'light', false); });
  const insp = signal(Math.min(Math.max(280, +store.get('inspector') || 384), Math.max(280, innerWidth - 320)));
  const wide = signal(false), gliding = signal(false);
  const glide = () => { gliding.value = true; setTimeout(() => { gliding.value = false; }, 240); };
  const widen = () => { if (!wide.peek()) { glide(); wide.value = true; } };
  const narrow = () => { if (wide.peek()) { glide(); wide.value = false; } };
  // What takes the inspector's place, while it does: History.
  const aside = signal(null);

  // ---- Keys, and the Esc stack ----
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
  const keyLabel = k => !k ? '' : k.replace(/\$mod/g, isMac ? 'Cmd' : 'Ctrl').replace(/Key([A-Z])/g, '$1').replace(/Digit(\d)/g, '$1').replace(/Arrow(\w+)/g, '$1');
  function keys(map, o = {}) {
    const wrapped = {};
    for (const [k, fn] of Object.entries(map)) wrapped[k] = e => { if (fn(e) !== false) e.preventDefault(); };
    return tinykeys.tinykeys(o.target || window, wrapped, o.inputs ? { ignore: e => e.isComposing } : {});
  }
  // Esc closes the topmost layer open: a menu or popover, a dialog, History, the tour. Text being typed puts
  // itself back first, unless the layer is a menu, whose only text is its search.
  const layers = [];
  function layer(close, o = {}) {
    const l = { close, always: !!o.always };
    layers.push(l);
    return () => { const i = layers.indexOf(l); if (i >= 0) layers.splice(i, 1); };
  }
  addEventListener('keydown', e => {
    const top = layers.at(-1);
    if (e.key !== 'Escape' || !top || e.defaultPrevented) return;
    if (!top.always && e.target.closest?.('input, textarea, [contenteditable], .CodeMirror')) return;
    e.preventDefault(); e.stopPropagation();
    top.close();
  }, true);

  // ---- Dragging to reorder: an item among its siblings, a drop line where it would go ----
  function drag(e, { item, items, axis = 'y', onDrop, onClick }) {
    if (e.button !== 0) return;
    const x0 = e.clientX, y0 = e.clientY, across = axis === 'x';
    let moving = false, to = -1;
    const clear = () => items.forEach(x => { delete x.dataset.drop; delete x.dataset.dragging; });
    const move = ev => {
      if (!moving && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) return;
      moving = true;
      clear();
      item.dataset.dragging = '';
      to = items.findIndex(x => { const r = x.getBoundingClientRect(); return across ? ev.clientX < r.left + r.width / 2 : ev.clientY < r.top + Math.min(r.height, 28) / 2; });
      if (to < 0) { to = items.length; items.at(-1).dataset.drop = across ? 'right' : 'bottom'; } else items[to].dataset.drop = across ? 'left' : 'top';
    };
    const up = () => {
      removeEventListener('pointermove', move);
      clear();
      if (!moving) return onClick?.();
      const from = items.indexOf(item), i = to > from ? to - 1 : to;
      if (to >= 0 && i !== from) onDrop(from, i);
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up, { once: true });
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
    let shut = false, unlayer = null;
    const close = () => {
      if (shut) return;
      shut = true;
      unlayer();
      floats.peek().filter(x => x.parent === id).forEach(x => x.close());
      floats.value = floats.peek().filter(x => x.id !== id);
      f.onClose?.();
      if (!f.parent && back?.isConnected && document.activeElement?.closest?.('.float')) back.focus();
    };
    unlayer = layer(close, { always: true });
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

  const uf = new uFuzzy({ intraMode: 1 });
  function rank(items, q, limit = 50) {
    const hay = items.map(x => x.label);
    let [idxs, info, order] = uf.search(hay, q);   // in order, ranked and highlighted
    if (!idxs?.length) [idxs, info, order] = uf.search(hay, q, 1);   // or the words in any order
    if (!idxs) return [];
    if (!order) return idxs.slice(0, limit).map(i => items[i]);
    return order.slice(0, limit).map(o => ({ ...items[info.idx[o]], ranges: info.ranges[o] }));
  }
  const marked = (label, ranges) => !ranges ? label : uFuzzy.highlight(label, ranges, (p, m) => m ? html`<b>${p}</b>` : p, [], (a, p) => { a.push(p); });
  const selectable = it => it && it !== '-' && !it.head && !it.seg && !it.disabled && (it.run || it.items);

  // A menu; with `search`, a field that ranks its items, or that `items(query)` answers.
  function Menu({ f }) {
    const [q, setQ] = useState(f.query ?? '');
    const [act, setAct] = useState(-1);
    const items = typeof f.items === 'function' ? f.items(q.trim()) : f.search && q.trim() ? rank(f.items.filter(selectable), q) : f.items;
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
      else if (e.key === 'Home' && !f.search) setAct(live[0]);
      else if (e.key === 'End' && !f.search) setAct(live[live.length - 1]);
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
    return html`<div class=${'menu' + (f.cls ? ' ' + f.cls : '')} role="menu" tabindex="-1" onKeyDown=${onKey}>
      ${f.search ? html`<input class=${'menu-find' + (q.startsWith('=') ? ' mono' : '')} placeholder="Find" value=${q} spellcheck="false" autocomplete="off"
        onInput=${e => { setQ(e.target.value); setAct(-1); }} />` : null}
      ${items.map((it, i) => it === '-' ? html`<div class="menu-sep" />`
        : it.head ? html`<div class="menu-head">${it.head}</div>`
        : it.seg ? html`<div class="menu-seg">${it.seg.map(s => html`<button aria-pressed=${!!s.pressed} onClick=${s.run}>${s.label}</button>`)}</div>`
        : html`<div role="menuitem" data-mi=${`${f.id}-${i}`} aria-disabled=${it.disabled ? 'true' : null}
            class=${'menu-item' + (i === active ? ' on' : '') + (it.items ? ' sub' : '') + (it.danger ? ' danger' : '') + (selectable(it) || it.disabled ? '' : ' said')}
            onPointerMove=${() => { if (i !== act && selectable(it)) { setAct(i); if (it.items) openSub(it, document.querySelector(`[data-mi="${f.id}-${i}"]`)); else floats.peek().filter(x => x.parent === f.id).forEach(x => x.close()); } }}
            onClick=${() => selectable(it) && run(it)}>
            ${checks ? html`<span class="check">${it.checked ? icon('check') : null}</span>` : null}
            <span class=${'label' + (it.mono ? ' mono' : '')}>${marked(it.label, it.ranges)}</span>
            ${it.detail ? html`<span class="detail">${it.detail}</span>` : null}
            ${it.keys ? html`<kbd>${keyLabel(it.keys)}</kbd>` : null}
          </div>`)}
      ${f.search && q.trim() && q.trim() !== '=' && !items.length ? html`<div class="menu-none">No match</div>` : null}
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
      let done = false, unlayer = null;
      const settle = v => { if (done) return; done = true; unlayer(); if (el.open) el.close(); render(null, el); el.remove(); resolve(v); };
      unlayer = layer(() => settle(undefined));
      el.addEventListener('cancel', () => settle(undefined));
      el.addEventListener('close', () => settle(undefined));
      const primary = actions.find(a => a.primary);
      render(html`<form method="dialog" onSubmit=${e => { e.preventDefault(); settle(primary?.value); }}>
        ${title ? html`<div class="dlg-head">${title}</div>` : null}
        <div class="dlg-body">${typeof body === 'function' ? body(settle) : body}</div>
        <div class="dlg-foot">${actions.map(a => html`<button type=${a.primary ? 'submit' : 'button'} autofocus=${!!a.focus}
          class=${'btn' + (a.primary ? ' primary' : a.danger ? ' danger' : '')} onClick=${a.primary ? undefined : () => settle(a.value)}>${a.label}</button>`)}</div>
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

  // ---- Find: views, records, lists and actions, ranked as you type; "=" works a formula out ----
  let findButton = null;
  function answers(q) {
    if (q.startsWith('=')) {
      const ev = part('evaluate');
      if (!ev || !q.slice(1).trim()) return [];
      let r;
      try { r = ev(q, selection.peek()); } catch (e) { r = { error: e.message || String(e) }; }
      if (r?.error) return [{ label: r.error, danger: true }];
      return r?.items ?? [{ label: String(r?.value ?? ''), mono: true }];
    }
    const vs = views.value.map(v => ({ label: v.name, detail: 'View', run: () => show(v.id) }));
    const acts = many('action').filter(a => !a.enabled || a.enabled()).map(a => ({ label: a.name, detail: keyLabel(a.keys), run: a.run }));
    if (!q) return [...(vs.length ? [{ head: 'Views' }, ...vs] : []), ...(acts.length ? [{ head: 'Actions' }, ...acts] : [])];
    return rank([...vs, ...many('find').flatMap(s => s.items()), ...acts], q);
  }
  const find = (q = '') => { closeAll(); menu(findButton, answers, { search: true, query: q, cls: 'findpal', placement: 'bottom', gap: -32 }); };

  // ---- The title bar ----
  const fmtTime = t => !t ? 'As of today' : t.asOf ? 'As of ' + Tree.formatDate(t.asOf, 'short')
    : 'As it stood' + (t.at ? ' ' + new Date(t.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');
  const chartName = computed(() => { const wb = part('workbook'); return wb ? wb.charts().find(c => c.id === wb.current())?.name : null; });
  effect(() => { document.title = chartName.value ? `${chartName.value} – Dendra` : 'Dendra'; });

  function chartMenu() {
    const wb = part('workbook'), items = [];
    if (wb) items.push(...wb.charts().map(c => ({ label: c.name, checked: c.id === wb.current(), run: () => wb.open(c.id) })), ...wb.menu(), '-');
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
  function TitleBar() {
    const u = part('undo'), ex = many('export'), t = time.value;
    return html`<header class="titlebar">
      <div class="left"><button class="btn ghost dd chartmenu" onClick=${e => menu(e.currentTarget, chartMenu)}>${mark}<span class="name">${chartName.value || 'Dendra'}</span></button></div>
      <button class="find" ref=${el => { findButton = el; }} onClick=${() => find()}><span>Find</span><kbd>${keyLabel('$mod+K')}</kbd></button>
      <div class="right">
        ${part('time') ? html`<button class=${'btn ghost dd asof' + (t ? ' past' : '')} onClick=${e => popover(e.currentTarget, close => html`<${part('time').When} close=${close} />`, { placement: 'bottom-end' })}>${fmtTime(t)}</button>` : null}
        <span class="sep" />
        <button class="btn icon" aria-label="Undo" data-tip="Undo" data-keys=${keyLabel('$mod+Z')} disabled=${!u?.canUndo()} onClick=${() => u.undo()}>${icon('undo')}</button>
        <button class="btn icon" aria-label="Redo" data-tip="Redo" data-keys=${keyLabel('$mod+Y')} disabled=${!u?.canRedo()} onClick=${() => u.redo()}>${icon('redo')}</button>
        <button class="btn primary dd" disabled=${!ex.length} onClick=${e => menu(e.currentTarget, ex.map(x => ({ label: x.name, run: x.run })), { placement: 'bottom-end' })}>Export</button>
      </div>
    </header>`;
  }

  // ---- Slots: where the other parts draw ----
  function Host({ kind, hidden }) {
    const p = part(kind), ref = useRef(), [seen, setSeen] = useState(!hidden);
    if (!hidden && !seen) setSeen(true);
    useLayoutEffect(() => {
      if (!p || !seen) return;
      const el = ref.current;
      if (typeof p === 'function') { render(h(p), el); return () => render(null, el); }
      const off = p.mount(el);
      return () => { if (typeof off === 'function') off(); el.replaceChildren(); };
    }, [p, seen]);
    return p ? html`<div class="host" ref=${ref} hidden=${hidden} />` : null;
  }
  const Bar = ({ kind, hidden }) => part(kind) ? html`<div class=${'slot ' + kind} hidden=${hidden}><${Host} kind=${kind} /></div>` : html`<div hidden />`;

  // ---- The view and the inspector ----
  function Main() {
    const layout = current.value?.layout || 'chart';
    const resize = e => {
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
        <${Host} kind="canvas" hidden=${layout !== 'chart'} />
        <${Host} kind="table" hidden=${layout !== 'table'} />
        ${part('time') ? html`<div class="strip">${h(part('time').Strip)}</div>` : null}
      </div>
      <div class="divider" role="separator" aria-orientation="vertical" onPointerDown=${resize} onDblClick=${() => wide.value ? narrow() : widen()} />
      <aside class="inspector"><${Host} kind="inspector" hidden=${!!aside.value} />${aside.value ? html`<div class="host aside">${h(aside.value)}</div>` : null}</aside>
    </div>`;
  }

  // ---- The sheet tabs ----
  function Sheets() {
    const vp = part('views'), list = views.value, ref = useRef();
    const [editing, setEditing] = useState(null);
    useLayoutEffect(() => { ref.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }, [view.value, list.length]);
    if (!vp) return html`<div class="sheets" />`;
    const down = (e, v) => {
      if (e.button !== 0 || editing) return;
      show(v.id);
      drag(e, { item: e.currentTarget, items: [...ref.current.children], axis: 'x', onDrop: (from, i) => vp.move(list[from].id, i) });
    };
    const commit = (v, name) => { setEditing(null); name = name.trim(); if (name && name !== v.name) vp.rename(v.id, name); };
    const tabMenu = (e, v) => { e.preventDefault(); show(v.id); menu({ x: e.clientX, y: e.clientY }, [{ label: 'Rename', run: () => setEditing(v.id) }, ...vp.menu(v.id)]); };
    const onKey = e => {
      const k = list.findIndex(x => x.id === view.peek()), d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!d || editing) return;
      e.preventDefault();
      const next = list[(k + d + list.length) % list.length];
      show(next.id);
      ref.current.children[list.indexOf(next)]?.focus();
    };
    const add = e => vp.add(e.currentTarget).then(id => { if (id) { show(id); setEditing(id); } });
    return html`<div class="sheets" role="tablist" ref=${ref} onKeyDown=${onKey} onWheel=${e => { if (e.deltaY) ref.current.scrollLeft += e.deltaY; }}>
      ${list.map(v => editing === v.id
        ? html`<div class="sheet" aria-selected="true"><input value=${v.name} style=${`width:${v.name.length + 3}ch`} ref=${el => el && !el.dataset.on && (el.dataset.on = 1, el.focus(), el.select())}
            onKeyDown=${e => { if (e.key === 'Enter') commit(v, e.target.value); else if (e.key === 'Escape') { e.stopPropagation(); setEditing(null); } }}
            onBlur=${e => commit(v, e.target.value)} /></div>`
        : html`<button key=${v.id} class="sheet" role="tab" aria-selected=${v.id === view.value} tabindex=${v.id === view.value ? 0 : -1} data-tour=${v.id === view.value ? null : 'sheet'}
            onPointerDown=${e => down(e, v)} onDblClick=${() => setEditing(v.id)} onContextMenu=${e => tabMenu(e, v)}>${v.name}</button>`)}
    </div><button class="btn icon" aria-label="New view" data-tip="New view" onClick=${add}>${icon('plus')}</button>`;
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
    const items = part('attention')?.items() || [];
    const counts = KINDS.map(([k, say]) => [k, say, items.filter(it => it.kind === k).length]).filter(c => c[2]);
    return html`<div class="status">
      ${counts.map(([k, say, n], i) => html`${i ? html`<span class="muted">·</span>` : null}<button class=${'btn ghost ' + k} onClick=${() => attend(1, k)}>${say(n)}</button>`)}
      ${many('status').map(s => s.render())}
    </div>`;
  }

  // ---- The window ----
  const Window = () => html`
    <div class="shell">
      <${TitleBar} />
      <${Bar} kind="formatbar" hidden=${current.value?.layout === 'table'} />
      <${Bar} kind="formulabar" />
      <${Main} />
      <footer class="foot"><${Sheets} /><${Status} /></footer>
    </div>
    ${floats.value.map(f => html`<${Float} key=${f.id} f=${f} />`)}
    <${Toasts} /><${Tip} />`;

  // The shell's own actions and keys.
  register('action', { id: 'back', name: 'Back', keys: 'Alt+ArrowLeft', run: back });
  register('action', { id: 'forward', name: 'Forward', keys: 'Alt+ArrowRight', run: forward });
  register('action', { id: 'attend', name: 'Next problem', keys: 'F8', enabled: () => !!part('attention')?.items().length, run: () => attend(1) });
  keys({ '$mod+KeyK': () => { floats.peek().some(f => f.cls === 'findpal') ? closeAll() : find(); } }, { inputs: true });
  keys({
    '$mod+KeyZ': () => part('undo')?.canUndo() ? part('undo').undo() : false,
    '$mod+KeyY': () => part('undo')?.canRedo() ? part('undo').redo() : false,
    '$mod+Shift+KeyZ': () => part('undo')?.canRedo() ? part('undo').redo() : false,
    'Shift+F8': () => attend(-1),
    '$mod+Shift+PageUp': () => stepView(-1),
    '$mod+Shift+PageDown': () => stepView(1),
    // With no layer open: the widened inspector narrows, and then the selection clears.
    'Escape': () => { if (wide.peek()) narrow(); else if (selection.peek().length) select([]); else return false; },
  });
  function stepView(d) {
    const vs = views.peek(), k = vs.findIndex(v => v.id === view.peek());
    if (vs.length) show(vs[(k + d + vs.length) % vs.length].id);
  }
  addEventListener('resize', () => {
    if (insp.peek() > innerWidth - 320) insp.value = Math.max(280, innerWidth - 320);
    floats.peek().filter(f => !(f.anchor instanceof Element)).forEach(f => f.close()); // a menu at a point
  });

  // Draws the window, then tells the launch screen it's ready.
  function start() {
    if (started) return;
    apply(parse(location.hash));
    history.replaceState({ dendra: step }, '', url(addressOf(view.peek(), selection.peek(), time.peek())));
    started = true;
    render(html`<${Window} />`, document.getElementById('app'));
    requestAnimationFrame(() => {
      isReady();
      if (typeof Splash !== 'undefined') { Splash.done(); Splash.ended.then(isLaunched); } else isLaunched();
    });
  }
  document.addEventListener('DOMContentLoaded', start);

  return {
    view, selection, time, show, select, at, back, forward, general, pattern, ready, launched,
    register, on, emit, keys, layer, drag, menu, popover, closeAll, dialog, confirm, toast, find, icon, store,
    widen, narrow, wide, theme, setTheme, html, h, signal, computed, effect, parts: reg,
    aside: c => { aside.value = c; },
  };
})();
