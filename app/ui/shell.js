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
//   'canvas', 'table'  { mount(el) → unmount? }   the view, as a chart or a table   (canvas.js, table.js);
//                      the canvas also kinds() → menu items, a box of each kind it can add (never none), which
//                      a chart with no box offers as its one action, "Add a box"
//   'inspector'        { mount(el) → unmount? }   the selection                      (inspector.js)
//   'formatbar'        { mount(el) → unmount? }   on a chart, under the title bar    (formatbar.js)
//   'formulabar'       a component                under the format bar               (formulabar.js)
//   'views'      { list() → [{ id, name, layout }], rename(id, name), move(id, i), add(anchor) → Promise of an
//                  id or null, menu(id) → items }          the sheet tabs           (app.js)
//   'workbook'   { charts() → [{ id, name }], current() → id, open(id), rename(id, name), menu() → items }
//                  the chart menu, and the chart's name in the title bar, renamed there (app.js)
//   'undo'       { undo(), redo(), canUndo(), canRedo() }                                    (app.js)
//   'time'       { When({ close }), Ruler(), today() }   the date's popover, the ruler under the view, and
//                back to today from another day or the past                                  (time.js)
//   'evaluate'   (text, selection) → { value } | { items } | { error }   Find's "="            (formulabar.js)
// Any number of: 'action' { id, name, run, keys?, inputs?, enabled?, menu?: 'chart', order? } (the chart
// menu by order: files 1–4, History 10, Settings 20, Light and Dark 30, Tour 40), its keys bound in the
// window (in fields too, with inputs) and listed by ? ; 'find' { items() → menu items }, Find's records,
// lists and definitions, an item with its kind (detail: 'Entity', which heads it), any other names it goes by
// (names: […]) and a key, and what's within it (a list, "AIV-1 › Signatories") with of: that key; 'export'
// { name, run }; 'status' { render() }; 'attention' { items() → [{ kind: 'overdue' | 'error' | 'soon' |
// 'blank', go() }] }, what needs attention, counted in the status bar and stepped through by F8 in that
// order, the worst first, from App.needs (Formulas.attention): inspector.js counts deadlines, blanks and errors,
// aiming at their rows; app.js the checks failed, as errors.
//
// THE BUS, for what more than one part hears (Shell.on(name, fn) → off, Shell.emit(name, detail)):
//   select        the selection changed; its keys       the shell        → the tour, the formula bar
//   view-switch   another view is shown; its id         the shell        → the tour, time.js
//   why-open      a computed record's reasons asked     inspector, canvas, app → the bar
//   relate-open   two boxes' relations asked for [a, b] the canvas       → the inspector, the tour
// Anything else one part asks of another is a call: FormulaBar.preview(change), App.change(fn), Canvas.zoom.
// Shell.ready and Shell.launched are promises: the window is drawn; the launch screen is gone.
//
// APP (app.js) is the workbook: App.wb; signals chart, version, day, readOnly (in History); computed shown,
// entered, schema, notes, definitions, relations, computed (Formulas.computeState's), state, views
// ([{ id, name, layout, rows, keeps }]), scene (the view shown, drawn), layouts; App.change(fn(tx), { say,
// dated }) → the change, every edit's one way in; App.reverse(changeId) and App.restore(item), History's;
// App.asksDay(record, recs?), whether a record about to be added asks the day it holds from (a relation with no
// start entry), and App.From({ day, set, auto }), the control that asks it in the redline ("From" a day, or
// "All along"), wherever a record is added (the inspector, a table's paste); App.addView; App.who(); App.blank().
//
// THE PIECES: Shell.menu(anchor, items, opts) and Shell.popover(anchor, draw, opts) on Floating UI; dialog()
// and confirm() on <dialog>; toast(text, { undo } or { redo }); keys(map, opts) on tinykeys, and keyLabel(key)
// as shown; aside(component | null), in the inspector's place; layer(close) → remove, the Esc stack every layer
// joins; drag(e, { item, items, axis, onDrop, onClick }), reordering by drag; find(query); icon(name);
// store.get/set, this browser's settings; widen() and narrow(); theme. A menu item is '-', { head }, or
// { label, detail?, keys?, checked?, disabled?, danger?, run?, items?, point? }; one without run or items is
// shown, not chosen, and one with point(on) shows what it would do while it's pointed at or reached by the keys.
//
// THE REGIONS, which F6 and Shift+F6 step through: the bars, the view, the inspector and the tabs
// (data-region). Tab stays inside a dialog, a popover and the tour's last card, and Tab leaves a menu.

const Shell = (() => {
  const { h, render } = preact;
  const { useEffect, useLayoutEffect, useRef, useState } = preactHooks;
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
  const MANY = new Set(['action', 'find', 'export', 'status', 'attention']);
  const reg = signal({});
  const part = kind => reg.value[kind];
  const many = kind => reg.value[kind] || [];
  function register(kind, thing) {
    const r = reg.peek();
    reg.value = { ...r, [kind]: MANY.has(kind) ? [...(r[kind] || []), thing] : thing };
    const unbind = kind === 'action' && thing.keys
      ? keys({ [thing.keys]: () => { if (thing.enabled && !thing.enabled()) return false; thing.run(); } }, { inputs: thing.inputs }) : null;
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
  let lastSel = [], lastView = null, seen = [];
  effect(() => { const s = selection.value; if (!same(s, lastSel)) { lastSel = s; emit('select', s); } });
  effect(() => { const v = view.value; if (v !== lastView) { lastView = v; seen = [...seen.filter(x => x !== v), v]; emit('view-switch', v); } });
  const views = computed(() => part('views')?.list() || []);
  const current = computed(() => views.value.find(v => v.id === view.value));
  // A view that goes (deleted, undone, or not yet made as it stood) leaves the one shown before it.
  effect(() => { const vs = views.value; if (vs.length && !current.value) show((seen.findLast(id => vs.some(v => v.id === id)) ?? vs[0].id), { replace: true }); });

  // ---- Theme, and the inspector's width ----
  const theme = signal(document.documentElement.dataset.theme || 'light'), THEMES = [['Light', 'light'], ['Dark', 'dark']];
  function setTheme(t, keep = true) { theme.value = t; document.documentElement.dataset.theme = t; if (keep) store.set('theme', t); }
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => { if (!store.get('theme')) setTheme(e.matches ? 'dark' : 'light', false); });
  // The inspector: as the user left it, or 30% of the window between 300 and 384 px, so a small screen keeps its chart.
  const insp = signal(Math.min(Math.max(280, +store.get('inspector') || Math.round(Math.min(384, Math.max(300, innerWidth * .3)))), Math.max(280, innerWidth - 320)));
  const wide = signal(false), gliding = signal(false);
  const glide = () => { gliding.value = true; setTimeout(() => { gliding.value = false; }, 240); };
  const widen = () => { if (!wide.peek()) { glide(); wide.value = true; } };
  const narrow = () => { if (wide.peek()) { glide(); wide.value = false; } };
  // What takes the inspector's place, while it does: History.
  const aside = signal(null);

  // ---- Keys, and the Esc stack ----
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
  const KEY = { ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', BracketLeft: '[', BracketRight: ']', Equal: '=', Minus: '−', PageUp: 'PgUp', PageDown: 'PgDn', Escape: 'Esc' };
  const keyLabel = k => !k ? '' : k.replace(/\[Shift\]\+/g, '').replace(/\$mod/g, isMac ? 'Cmd' : 'Ctrl').replace(/Key([A-Z])|Digit(\d)/g, '$1$2').replace(/\w+/g, w => KEY[w] ?? w);
  // A key a part has already taken (typing over a box, say) isn't the window's too.
  function keys(map, o = {}) {
    const wrapped = {};
    for (const [k, fn] of Object.entries(map)) wrapped[k] = e => { if (!e.defaultPrevented && fn(e) !== false) e.preventDefault(); };
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

  // ---- Focus: the regions F6 steps through, each remembering where it was; Tab kept inside a dialog ----
  const TABBABLE = ['a[href]', 'button:not(:disabled)', 'input:not(:disabled)', 'select:not(:disabled)', 'textarea:not(:disabled)', '[tabindex]', '[contenteditable="true"]'].map(s => s + ':not([tabindex="-1"])').join(', ');
  const shown = el => el.getClientRects().length > 0;
  const tabbables = box => [...box.querySelectorAll(TABBABLE)].filter(shown);
  const REGIONS = ['bars', 'view', 'inspector', 'tabs'], lastIn = {};
  document.addEventListener('focusin', e => { const r = e.target.closest?.('[data-region]'); if (r) lastIn[r.dataset.region] = e.target; });
  const els = n => [...document.querySelectorAll(`[data-region="${n}"]`)].filter(shown);
  // A region given the keys: the view's part, where it takes them itself (a table, at its active cell, as a sheet
  // shown in Excel does); else where it last had them, or else its first control, or itself.
  function enter(n) {
    if (n === 'view' && part(current.peek()?.layout ?? 'chart')?.focus?.()) return;
    const last = lastIn[n];
    (last?.isConnected && shown(last) && !last.disabled ? last : els(n).map(el => tabbables(el)[0]).find(Boolean) ?? els(n)[0])?.focus();
  }
  function region(d) {
    const live = REGIONS.filter(n => els(n).length), here = live.indexOf(document.activeElement?.closest?.('[data-region]')?.dataset.region);
    if (live.length) enter(live[here < 0 ? (d > 0 ? 0 : live.length - 1) : (here + d + live.length) % live.length]);
  }
  addEventListener('keydown', e => {
    const box = e.key === 'Tab' && !e.defaultPrevented && document.activeElement?.closest?.('dialog[open], .float .pop, [data-trap]');
    if (!box) return;
    const t = tabbables(box), i = t.indexOf(document.activeElement);
    if (!t.length) e.preventDefault();
    else if (e.shiftKey ? i <= 0 : i === t.length - 1) { e.preventDefault(); t.at(e.shiftKey ? -1 : 0).focus(); }
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
  // The mark, the page's one #mark symbol (index.html, from app/assets/mark-small.svg).
  const mark = html`<svg viewBox="0 0 16 16" aria-hidden="true"><use href="#mark" /></svg>`;

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
      // A menu takes the keys; a popover, the control it marks autofocus, or else its first, unless what it
      // draws took focus itself.
      if (f.kind === 'menu') (el.querySelector('.menu-find') || el.querySelector('.menu'))?.focus({ preventScroll: true });
      else if (!el.contains(document.activeElement)) (el.querySelector('[autofocus]') ?? tabbables(el)[0])?.focus({ preventScroll: true });
      return stop;
    }, []);
    return html`<div class="float in" popover="manual" ref=${ref}>
      ${f.kind === 'menu' ? html`<${Menu} f=${f} />` : html`<div class="pop" role="dialog">${f.draw(f.close)}</div>`}</div>`;
  }
  document.addEventListener('pointerdown', e => {
    const open = floats.peek();
    if (!open.length || e.target.closest?.('.float')) return;
    const top = open.find(x => !x.parent);
    if (top?.anchor instanceof Element && top.anchor.contains(e.target)) return; // its click toggles it
    closeAll();
  }, true);

  const uf = new uFuzzy({ intraMode: 1 });
  const norm = s => s.toLowerCase().replace(/\s+/g, ' ').trim();
  // Ranked as uFuzzy ranks their names (a label, and any others), except that a name typed exactly comes
  // first; a name with fewer words around what matched before one with more (Fund III before Fund III
  // Blocker, Northpine Software before a document naming Northpine); between those alike, a record related
  // to more others first (the fund before its general partner); and what's within a thing (AIV-1 ›
  // Signatories, of its key) after every thing found, so "blocker" finds both blockers before their lists.
  const words = s => (s.match(/\S*[\p{L}\p{N}]\S*/gu) ?? []).length;
  function relatives(id) {
    const st = App.state.peek(), out = new Set();
    for (const r of Tree.index(st).relations.get(id) ?? []) for (const a of st[r].args) out.add(Tree.objectOf(st, a.at));
    out.delete(id);
    return out.size;
  }
  function rank(items, q, limit = 50) {
    const known = new Map(), related = x => x.key === undefined || typeof App === 'undefined' ? 0 : known.get(x.key) ?? known.set(x.key, relatives(x.key)).get(x.key);
    const names = x => [x.label, ...(x.names || [])], hay = [], of = [];
    items.forEach((x, i) => names(x).forEach((n, k) => { hay.push(n); of.push([i, k]); }));
    let [idxs, info, order] = uf.search(hay, q);   // in order, ranked and highlighted
    if (!idxs?.length) [idxs, info, order] = uf.search(hay, q, 1);   // or the words in any order
    if (!idxs) return [];
    const best = new Map();   // each item at its best-ranked name, highlighted if that's its label
    for (const [h, ranges] of order ? order.map(o => [info.idx[o], info.ranges[o]]) : idxs.map(h => [h])) {
      const [i, k] = of[h];
      if (!best.has(i)) best.set(i, { ...items[i], ranges: k ? null : ranges, extra: ranges ? words(hay[h].slice(0, Math.min(...ranges))) + words(hay[h].slice(Math.max(...ranges))) : 0 });
    }
    const found = [...best.values()].sort((a, b) => a.extra - b.extra || related(b) - related(a));
    const within = x => x.of !== undefined || x.label.includes(' › '), typed = norm(q);
    return [...new Set([...found.filter(x => names(x).some(n => norm(n) === typed)), ...found.filter(x => !within(x)), ...found])].slice(0, limit);
  }
  const marked = (label, ranges) => !ranges ? label : uFuzzy.highlight(label, ranges, (p, m) => m ? html`<b>${p}</b>` : p, [], (a, p) => { a.push(p); });
  const selectable = it => it && it !== '-' && !it.head && !it.seg && !it.disabled && (it.run || it.items);

  // A menu's search field: plain text, set as the formula bar sets it, so after "=" a function's name is in
  // small capitals. It keeps its text itself, and the caret where it was.
  let FN = null;
  const esc = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  const typeset = q => !q.startsWith('=') ? esc(q)
    : esc(q).replace(FN ??= new RegExp(`\\b(${Formulas.FUNCTION_NAMES.join('|')})(?=\\s*\\()`, 'gi'), '<span class="fn">$1</span>');
  function caretIn(el) {
    const s = getSelection();
    if (!s.rangeCount || !el.contains(s.focusNode)) return null;
    const r = document.createRange();
    r.selectNodeContents(el); r.setEnd(s.focusNode, s.focusOffset);
    return r.toString().length;
  }
  function caretAt(el, n) {
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let t; (t = w.nextNode());) { if (n <= t.length) return getSelection().collapse(t, n); n -= t.length; }
    getSelection().collapse(el, el.childNodes.length);
  }
  function Field({ q, onQuery, at }) {
    const ref = useRef();
    useLayoutEffect(() => {
      const el = ref.current, markup = typeset(q);
      if (el.innerHTML === markup) return;
      const n = caretIn(el);
      el.innerHTML = markup;
      if (n !== null) caretAt(el, n);
    }, [q]);
    const read = e => { if (!e.isComposing) onQuery(e.currentTarget.textContent.replace(/[\n ]/g, ' ')); };
    return html`<div class="menu-find" ref=${ref} contenteditable="plaintext-only" role="searchbox" aria-label="Find" aria-activedescendant=${at} spellcheck="false" data-placeholder="Find"
      onInput=${read} onCompositionEnd=${read} onKeyDown=${e => { if (e.key === 'Enter') e.preventDefault(); }} onFocus=${e => caretAt(e.currentTarget, Infinity)} />`;
  }

  // A menu; with `search`, a field that ranks its items, or that `items(query)` answers.
  function Menu({ f }) {
    const [q, setQ] = useState(f.query ?? '');
    const [act, setAct] = useState(-1);
    const items = typeof f.items === 'function' ? f.items(q.trim()) : f.search && q.trim() ? rank(f.items.filter(selectable), q) : f.items;
    const live = items.map((it, i) => selectable(it) ? i : -1).filter(i => i >= 0);
    const active = f.search && q.trim() && act < 0 ? live[0] : act;
    const checks = items.some(it => it && it.checked !== undefined);
    const mi = i => `mi${f.id}-${i}`, el = i => document.getElementById(mi(i));
    const run = it => {
      if (it.items) return openSub(it, el(items.indexOf(it)));
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
      else if (e.key === 'Tab') return closeAll();   // and focus goes on from what opened it
      else if (!f.search && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const k = e.key.toLowerCase(), from = live.indexOf(active);
        const next = [...live.slice(from + 1), ...live.slice(0, from + 1)].find(i => items[i].label.toLowerCase().startsWith(k));
        if (next === undefined) return;
        setAct(next);
      } else return;
      e.preventDefault();
    };
    useLayoutEffect(() => { el(active)?.scrollIntoView({ block: 'nearest' }); }, [active]);
    // An item pointed at, or reached by the keys, shows what it would do (its `point`) until it's left.
    const pointed = items[active]?.point;
    useEffect(() => { if (!pointed) return; pointed(true); return () => pointed(false); }, [pointed]);
    // The menu, or its field, keeps focus; the item the keys are on is its active descendant.
    const at = active >= 0 && items[active] ? mi(active) : null;
    return html`<div class=${'menu' + (f.cls ? ' ' + f.cls : '')} role="menu" tabindex="-1" aria-activedescendant=${f.search ? null : at} onKeyDown=${onKey}>
      ${f.search ? html`<${Field} q=${q} at=${at} onQuery=${t => { setQ(t); setAct(-1); }} />` : null}
      ${items.map((it, i) => it === '-' ? html`<div class="menu-sep" role="separator" />`
        : it.head ? html`<div class="menu-head" role="presentation">${it.head}</div>`
        : it.seg ? html`<div class="menu-seg" role="group">${it.seg.map(s => html`<button aria-pressed=${!!s.pressed} onClick=${s.run}>${s.label}</button>`)}</div>`
        : html`<div role=${it.checked === undefined ? 'menuitem' : 'menuitemcheckbox'} aria-checked=${it.checked === undefined ? null : !!it.checked} id=${mi(i)}
            aria-disabled=${it.disabled ? 'true' : null} aria-haspopup=${it.items ? 'menu' : null}
            class=${'menu-item' + (i === active ? ' on' : '') + (it.items ? ' sub' : '') + (it.danger ? ' danger' : '') + (selectable(it) || it.disabled ? '' : ' said')}
            onPointerMove=${() => { if (i !== act && selectable(it)) { setAct(i); if (it.items) openSub(it, el(i)); else floats.peek().filter(x => x.parent === f.id).forEach(x => x.close()); } }}
            onClick=${() => selectable(it) && run(it)}>
            ${checks ? html`<span class="check">${it.checked ? icon('check') : null}</span>` : null}
            <span class="label">${marked(it.label, it.ranges)}</span>
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
    return el ? html`<div class="float tip" popover="manual" role="tooltip" ref=${ref}>${el.dataset.tip}${el.dataset.keys ? html`<kbd>${el.dataset.keys}</kbd>` : null}</div>` : null;
  }

  // ---- Dialogs, on <dialog>: modal, named by their title ----
  let did = 0;
  function dialog({ title, body, actions = [{ label: 'OK', value: true, primary: true }], width }) {
    return new Promise(resolve => {
      const el = document.createElement('dialog'), head = 'dlg' + ++did;
      el.className = 'dlg';
      if (title) el.setAttribute('aria-labelledby', head);
      if (width) el.style.width = `min(${width}px, calc(100vw - 32px))`;
      let done = false, unlayer = null;
      const settle = v => { if (done) return; done = true; unlayer(); if (el.open) el.close(); render(null, el); el.remove(); resolve(v); };
      unlayer = layer(() => settle(undefined));
      el.addEventListener('cancel', () => settle(undefined));
      el.addEventListener('close', () => settle(undefined));
      const primary = actions.find(a => a.primary);
      render(html`<form method="dialog" onSubmit=${e => { e.preventDefault(); settle(primary?.value); }}>
        ${title ? html`<div class="dlg-head" id=${head}>${title}</div>` : null}
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

  // ---- Toasts: a verb, an object and Undo, or Redo once it's undone ----
  const toasts = signal([]);
  let tid = 0;
  function toast(text, o = {}) {
    const t = { id: ++tid, text, act: o.undo ? ['Undo', o.undo] : o.redo ? ['Redo', o.redo] : null, timer: 0 };
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
      <span>${t.text}</span>${t.act ? html`<button onClick=${() => { t.dismiss(); t.act[1](); }}>${t.act[0]}</button>` : null}</div>`)}</div>`;

  // ---- Find: records, lists, definitions, what needs attention, views and actions, ranked as you type, each
  // under its kind's head; "=" works a formula out; "?" lists the keys ----
  let findButton = null;
  // Each kind under its head, the heads in the order of the best each has; what's within a thing under that
  // thing's. An answer doesn't say its kind again.
  function headed(found, all = found) {
    const keyed = new Map(all.filter(x => x.key !== undefined).map(x => [x.key, x])), heads = new Map();
    const kind = x => x.of !== undefined && keyed.has(x.of) ? kind(keyed.get(x.of)) : x.detail ?? '';
    for (const x of found) { const k = kind(x); if (!heads.has(k)) heads.set(k, []); heads.get(k).push({ ...x, detail: null }); }
    return [...heads].flatMap(([k, xs]) => [...(k ? [{ head: Tree.plural(k) }] : []), ...xs]);
  }
  function answers(q) {
    if (q.startsWith('=')) {
      const ev = part('evaluate');
      if (!ev || !q.slice(1).trim()) return [];
      let r;
      try { r = ev(q, selection.peek()); } catch (e) { r = { error: e.message || String(e) }; }
      if (r?.error) return [{ label: r.error, danger: true }];
      return r?.items ?? [{ label: String(r?.value ?? '') }];
    }
    const acts = many('action').filter(a => a.id !== 'find').map(a => ({ id: a.id, label: a.name, detail: 'Action', keys: a.keys, disabled: a.enabled && !a.enabled(), run: a.run }));
    // The keys, but not the two ways here.
    if (q.startsWith('?')) { const ks = acts.filter(a => a.keys && a.id !== 'keys').map(a => ({ ...a, detail: null })); return q.slice(1).trim() ? rank(ks, q.slice(1).trim()) : ks; }
    const vs = views.value.map(v => ({ label: v.name, detail: 'View', run: () => show(v.id) })), can = acts.filter(a => !a.disabled);
    if (!q) return headed([...vs, ...can]);
    const all = [...many('find').flatMap(s => s.items()), ...counted(), ...vs, ...can];
    return headed(rank(all, q), all);
  }
  // A result chosen keeps the focus it gave itself (a field, a dialog); otherwise the view has the keys.
  const land = () => setTimeout(() => { if (!document.activeElement || document.activeElement === document.body) enter('view'); });
  const find = (q = '') => { closeAll(); menu(findButton, answers, { search: true, query: q, cls: 'findpal', placement: 'bottom', gap: -32, onClose: land }); };

  // ---- The title bar ----
  // The day shown. Another day, or the log as it stood, fills the date in the accent, with an × back to today.
  const fmtTime = t => !t ? 'As of today' : t.asOf ? 'As of ' + Tree.formatDate(t.asOf)
    : 'As it stood' + (t.at ? ` ${Tree.formatDate(Tree.isoOf(new Date(t.at)))}, ${new Date(t.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : '');
  const chartName = computed(() => { const wb = part('workbook'); return wb ? wb.charts().find(c => c.id === wb.current())?.name : null; });
  effect(() => { document.title = chartName.value ? `${chartName.value} – Dendra` : 'Dendra'; });
  // The chart's name is renamed in place, as a sheet's is: from the chart menu, Find, a double-click on it, or
  // as a new chart begins. Enter or leaving keeps what's typed, Esc puts it back; another chart shown ends it.
  const naming = signal(null);
  const nameChart = () => { const id = part('workbook')?.current(); if (id && !App.readOnly.peek()) { closeAll(); naming.value = id; } };
  effect(() => { const id = part('workbook')?.current(); if (naming.peek() && naming.peek() !== id) naming.value = null; });
  let refocus = false;
  function Naming() {
    const id = naming.value, was = chartName.peek() ?? '', [text, setText] = useState(was);
    const done = (keep, value, back) => {
      if (naming.peek() !== id) return;
      naming.value = null; refocus = back;
      const name = Tree.clean(value ?? '');
      if (keep && name && name !== was) part('workbook').rename(id, name);
    };
    return html`<div class="chartmenu naming">${mark}<input class="name" aria-label="Chart name" value=${text} spellcheck="false" style=${`width:${text.length + 2}ch`}
      ref=${el => el && !el.dataset.on && (el.dataset.on = 1, el.focus(), el.select())} onInput=${e => setText(e.target.value)}
      onKeyDown=${e => { if (e.key === 'Enter') { e.preventDefault(); done(true, e.target.value, true); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false, null, true); } }}
      onBlur=${e => done(true, e.target.value, false)} /></div>`;
  }

  function chartMenu() {
    const wb = part('workbook'), items = [];
    if (wb) items.push(...wb.charts().map(c => ({ label: c.name, checked: c.id === wb.current(), run: () => wb.open(c.id) })),
      { label: 'Rename', disabled: App.readOnly.value, run: nameChart }, ...wb.menu(), '-');
    const themes = { order: 30, seg: THEMES.map(([label, t]) => ({ label, pressed: theme.value === t, run: () => setTheme(t) })) };
    const acts = many('action').filter(a => a.menu === 'chart').map(a => ({ order: a.order ?? 25, label: a.name, keys: a.keys, disabled: a.enabled && !a.enabled(), run: a.run }));
    for (const it of [...acts, themes].sort((a, b) => a.order - b.order)) {
      if (it.seg && items.length && items[items.length - 1] !== '-') items.push('-');
      items.push(it);
      if (it.seg) items.push('-');
    }
    if (items[items.length - 1] === '-') items.pop();
    return items;
  }
  // A name cut short is shown whole on hover, as the formula bar's is.
  const whole = e => { const b = e.currentTarget, n = b.querySelector('.name'); if (n && n.scrollWidth > n.clientWidth) b.dataset.tip = n.textContent; else delete b.dataset.tip; };
  function TitleBar() {
    const u = part('undo'), t = time.value;
    return html`<header class="titlebar" data-region="bars">
      <div class="left">${naming.value ? html`<${Naming} key=${naming.value} />` : html`<button class="btn ghost dd chartmenu" aria-haspopup="menu" onPointerOver=${whole}
        ref=${el => { if (el && refocus) { refocus = false; el.focus(); } }} onClick=${e => menu(e.currentTarget, chartMenu)} onDblClick=${nameChart}>${mark}<span class="name">${chartName.value || 'Dendra'}</span></button>`}</div>
      <button class="find" aria-haspopup="menu" ref=${el => { findButton = el; }} onClick=${() => find()}><span>Find</span><kbd>${keyLabel('$mod+KeyK')}</kbd></button>
      <div class="right">
        ${part('time') ? html`<span class=${'asof' + (t ? ' past' : '')}><button class="btn ghost dd" aria-haspopup="dialog" onClick=${e => popover(e.currentTarget, close => html`<${part('time').When} close=${close} />`, { placement: 'bottom-end' })}>${fmtTime(t)}</button>${t
          ? html`<button class="btn icon" aria-label="Today" data-tip="Today" onClick=${() => part('time').today()}>${icon('x')}</button>` : null}</span>` : null}
        <span class="sep" />
        <button class="btn icon" aria-label="Undo" data-tip="Undo" data-keys=${keyLabel('$mod+KeyZ')} disabled=${!u?.canUndo()} onClick=${() => u.undo()}>${icon('undo')}</button>
        <button class="btn icon" aria-label="Redo" data-tip="Redo" data-keys=${keyLabel('$mod+KeyY')} disabled=${!u?.canRedo()} onClick=${() => u.redo()}>${icon('redo')}</button>
        <button class="btn primary" aria-haspopup="dialog" onClick=${() => Export.open()}>Export</button>
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
  const BARS = { formatbar: 'Format', formulabar: 'Formula' };
  const Bar = ({ kind, hidden }) => part(kind)
    ? html`<div class=${'slot ' + kind} role="region" aria-label=${BARS[kind]} data-region="bars" hidden=${hidden}><${Host} kind=${kind} /></div>` : html`<div hidden />`;

  // ---- The view and the inspector; a chart with no box offers its one action ----
  function Main() {
    const v = current.value, layout = v?.layout || 'chart', kinds = layout === 'chart' && part('canvas')?.kinds;
    const bare = kinds && v && !App.readOnly.value && App.scene.value && !App.scene.value.marks.some(m => m.type === 'box');
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
    // A table with nothing selected has the width: the inspector would show only the view's settings.
    const alone = layout === 'table' && !wide.value && !aside.value && !selection.value.length;
    return html`<div class=${'main' + (wide.value ? ' wide' : '') + (alone ? ' alone' : '') + (gliding.value ? ' anim' : '')} style=${`--insp:${insp.value}px`}>
      <div class="view" id="view" role="tabpanel" aria-labelledby=${v ? 'tab-' + v.id : null} data-region="view" tabindex="-1" aria-hidden=${wide.value ? 'true' : null}>
        <${Host} kind="canvas" hidden=${layout !== 'chart'} />
        <${Host} kind="table" hidden=${layout !== 'table'} />
        ${bare ? html`<div class="empty void"><button class="btn dd" aria-haspopup="menu" onClick=${e => menu(e.currentTarget, kinds(), { placement: 'bottom' })}>Add a box</button></div>` : null}
        ${part('time') ? h(part('time').Ruler) : null}
      </div>
      <div class="divider" role="separator" aria-orientation="vertical" onPointerDown=${resize} onDblClick=${() => wide.value ? narrow() : widen()} />
      <aside class="inspector" aria-label="Inspector" data-region="inspector" tabindex="-1"><${Host} kind="inspector" hidden=${!!aside.value} />${aside.value ? html`<div class="host aside">${h(aside.value)}</div>` : null}</aside>
    </div>`;
  }

  // ---- The sheet tabs ----
  // A view's tab is renamed in place: from its menu, Find, a double-click on it, or as a new view begins.
  const editing = signal(null);
  function Sheets() {
    const vp = part('views'), list = views.value, ref = useRef(), [over, setOver] = useState(false);
    useLayoutEffect(() => { ref.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }, [view.value, list.length]);
    // Tabs that run on past an edge fade into it, and then every view is a click away in a list, as Excel's
    // sheets are; the wheel turns them across.
    const more = () => {
      const el = ref.current;
      if (!el) return;
      const left = el.scrollLeft > 1, right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
      if (left || right) el.dataset.more = left && right ? 'both' : left ? 'left' : 'right'; else delete el.dataset.more;
      setOver(el.scrollWidth > el.clientWidth + 1);
    };
    useLayoutEffect(more);
    useLayoutEffect(() => { const ro = new ResizeObserver(() => requestAnimationFrame(more)); if (ref.current) ro.observe(ref.current); return () => ro.disconnect(); }, [!!vp]);
    if (!vp) return html`<div class="sheets" />`;
    const down = (e, v) => {
      if (e.button !== 0 || editing.peek()) return;
      show(v.id);
      drag(e, { item: e.currentTarget, items: [...ref.current.children], axis: 'x', onDrop: (from, i) => vp.move(list[from].id, i) });
    };
    const commit = (v, name) => { editing.value = null; name = name.trim(); if (name && name !== v.name) vp.rename(v.id, name); };
    // A tab's menu, at the pointer, or over the tab from the keyboard.
    const tabMenu = (e, v) => {
      e.preventDefault(); show(v.id);
      menu(e.clientX || e.clientY ? { x: e.clientX, y: e.clientY } : e.currentTarget, [{ label: 'Rename', run: () => { editing.value = v.id; } }, ...vp.menu(v.id)], { placement: 'top-start' });
    };
    const onKey = e => {
      const k = list.findIndex(x => x.id === view.peek()), d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!d || editing.peek()) return;
      e.preventDefault();
      const next = list[(k + d + list.length) % list.length];
      show(next.id);
      ref.current.children[list.indexOf(next)]?.focus();
    };
    const add = e => vp.add(e.currentTarget).then(id => { if (id) { show(id); editing.value = id; } });
    const all = e => menu(e.currentTarget, list.map(v => ({ label: v.name, checked: v.id === view.peek(), run: () => show(v.id) })), { placement: 'top-end' });
    return html`<div class="sheets" role="tablist" aria-label="Views" ref=${ref} onKeyDown=${onKey} onScroll=${more} onWheel=${e => { if (e.deltaY && !e.deltaX) { e.preventDefault(); ref.current.scrollLeft += e.deltaY * (e.deltaMode ? 16 : 1); } }}>
      ${list.map(v => editing.value === v.id
        ? html`<div class="sheet" aria-selected="true"><input aria-label="Name" value=${v.name} style=${`width:${v.name.length + 3}ch`} ref=${el => el && !el.dataset.on && (el.dataset.on = 1, el.focus(), el.select())}
            onKeyDown=${e => { if (e.key === 'Enter') commit(v, e.target.value); else if (e.key === 'Escape') { e.stopPropagation(); editing.value = null; } }}
            onBlur=${e => commit(v, e.target.value)} /></div>`
        : html`<button key=${v.id} id=${'tab-' + v.id} class="sheet" role="tab" aria-selected=${v.id === view.value} aria-controls="view" tabindex=${v.id === view.value ? 0 : -1} data-tour=${v.id === view.value ? null : 'sheet'}
            onPointerDown=${e => down(e, v)} onDblClick=${() => { editing.value = v.id; }} onContextMenu=${e => tabMenu(e, v)}>${v.name}</button>`)}
    </div>${over ? html`<button class="btn icon views" aria-haspopup="menu" aria-label="All views" data-tip="All views" onClick=${all}>${icon('chevron')}</button>` : null}<button class="btn icon" aria-label="New view" data-tip="New view" onClick=${add}>${icon('plus')}</button>`;
  }

  // ---- The status bar: what needs attention, counted, the worst first; F8 steps through it in that order ----
  // Each kind as the bar says it, and the words Find reaches it by besides: a deadline is settled by Paid… or
  // Filed… (inspector.js).
  const KINDS = [['overdue', n => `${n} overdue`, ['Paid', 'Filed']], ['error', n => n === 1 ? '1 error' : `${n} errors`, []],
    ['soon', n => `${n} due soon`, ['Paid', 'Filed']], ['blank', n => `${n} blank`, []]];
  const worst = it => KINDS.findIndex(([k]) => k === it.kind);
  const needs = () => many('attention').flatMap(a => a.items());
  // A count goes to the first of its kind, and F8 goes on from there.
  let stepAt = -1;
  function attend(d = 1, kind) {
    const items = needs().sort((a, b) => worst(a) - worst(b));
    stepAt = kind ? items.findIndex(it => it.kind === kind) : items.length ? (stepAt + d + items.length) % items.length : -1;
    items[stepAt]?.go();
  }
  const counts = () => { const items = needs(); return KINDS.map(([k, say, names]) => ({ k, say, names, n: items.filter(it => it.kind === k).length })).filter(c => c.n); };
  // In Find, each count goes where the bar's does.
  const counted = () => counts().map(c => ({ label: c.say(c.n), names: c.names, detail: 'Problem', run: () => attend(1, c.k) }));
  // The bar counts once the window has drawn what changed, as Excel's catches up, for on a big chart counting takes
  // a while; whatever it counts is of the workbook, the chart and the time shown.
  const tally = signal([]);
  let counting = false;
  const recount = () => { if (!counting) { counting = true; afterPaint(() => { counting = false; tally.value = counts(); }); } };
  // After the next frame is drawn, as Preact runs an effect; or in 100 ms, where none is.
  const afterPaint = f => { let raf = 0; const t = setTimeout(done, 100); function done() { clearTimeout(t); cancelAnimationFrame(raf); setTimeout(f); } raf = requestAnimationFrame(done); };
  function Status() {
    useLayoutEffect(() => effect(() => { if (part('workbook')) { App.version.value; App.chart.value; } time.value; recount(); }), []);
    // The counts are announced as they change; how the workbook is kept, which ages by the minute, isn't.
    return html`<div class="status">
      <span class="counts" role="status">${tally.value.map((c, i) => html`${i ? html`<span class="muted">·</span>` : null}<button class=${'btn ghost ' + c.k} onClick=${() => attend(1, c.k)}>${c.say(c.n)}</button>`)}</span>
      ${many('status').map(s => s.render())}
    </div>`;
  }

  // ---- The window ----
  const Window = () => html`
    <div class="shell">
      <${TitleBar} />
      <${Bar} kind="formatbar" hidden=${current.value?.layout === 'table' || wide.value} />
      <${Bar} kind="formulabar" />
      <${Main} />
      <footer class="foot" data-region="tabs"><${Sheets} /><${Status} /></footer>
    </div>
    ${floats.value.map(f => html`<${Float} key=${f.id} f=${f} />`)}
    <${Toasts} /><${Tip} />`;

  // The shell's own actions and keys.
  const problems = () => needs().length > 0;
  [
    { id: 'find', name: 'Find', keys: '$mod+KeyK', inputs: true, run: () => { floats.peek().some(f => f.cls === 'findpal') ? closeAll() : find(); } },
    // What the title bar's Export does, for Find, by what it makes: a chart's slides or pages, and the dates.
    ...[['pptx', 'PowerPoint'], ['pdf', 'PDF'], ['ics', 'Calendar']].map(([f, name]) => ({ id: 'export.' + f, name: `Export to ${name}`,
      enabled: () => typeof Export !== 'undefined' && (f === 'ics' || views.peek().some(v => v.layout === 'chart')), run: () => Export.open(f) })),
    { id: 'keys', name: 'Keyboard shortcuts', keys: '[Shift]+?', run: () => find('?') },
    // With nothing to undo, Undo says so.
    { id: 'undo', name: 'Undo', keys: '$mod+KeyZ', enabled: () => !!part('undo'), run: () => part('undo').undo() },
    { id: 'redo', name: 'Redo', keys: '$mod+KeyY', enabled: () => !!part('undo'), run: () => part('undo').redo() },
    { id: 'back', name: 'Back', keys: 'Alt+ArrowLeft', run: back },
    { id: 'forward', name: 'Forward', keys: 'Alt+ArrowRight', run: forward },
    { id: 'view.prev', name: 'Previous view', keys: '$mod+Shift+PageUp', run: () => stepView(-1) },
    { id: 'view.next', name: 'Next view', keys: '$mod+Shift+PageDown', run: () => stepView(1) },
    { id: 'chart.rename', name: 'Rename chart', enabled: () => !!part('workbook')?.current() && !App.readOnly.peek(), run: nameChart },
    { id: 'view.rename', name: 'Rename view', enabled: () => !!current.peek() && !App.readOnly.peek(), run: () => { editing.value = view.peek(); } },
    { id: 'pane.next', name: 'Next pane', keys: 'F6', inputs: true, run: () => region(1) },
    { id: 'pane.prev', name: 'Previous pane', keys: 'Shift+F6', inputs: true, run: () => region(-1) },
    // F8 goes on from a blank field it brought you to, as F6 does.
    { id: 'attend', name: 'Next problem', keys: 'F8', inputs: true, enabled: problems, run: () => attend(1) },
    { id: 'attend.prev', name: 'Previous problem', keys: 'Shift+F8', inputs: true, enabled: problems, run: () => attend(-1) },
    // Light and Dark, which the chart menu sets side by side.
    ...THEMES.map(([name, t]) => ({ id: 'theme.' + t, name, run: () => setTheme(t) })),
  ].forEach(a => register('action', a));
  keys({
    '$mod+Shift+KeyZ': () => part('undo') ? part('undo').redo() : false,
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
    register, on, emit, keys, keyLabel, layer, drag, menu, popover, closeAll, dialog, confirm, toast, find, icon, store, nameChart,
    widen, narrow, wide, theme, setTheme, html, h, signal, computed, effect, parts: reg,
    aside: c => { aside.value = c; },
  };
})();
