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
//                      a chart with no box offers as its one action, "Add a box"; and toward(day), a day about to
//                      be shown, laid out ahead (one typed in the date's popover), null for none
//   'inspector'        { mount(el) → unmount? }   the selection                      (inspector.js)
//   'formatbar'        { mount(el) → unmount? }   on a chart, under the title bar    (formatbar.js)
//   'formulabar'       a component                under the format bar               (formulabar.js)
//   'views'      { list() → [{ id, name, layout }], rename(id, name), move(id, i), add(anchor) → Promise of an
//                  id or null, menu(id) → items }          the sheet tabs           (app.js)
//   'workbook'   { charts() → [{ id, name }], current() → id, open(id), rename(id, name), menu() → items }
//                  the chart menu, and the chart's name in the title bar, renamed there (app.js)
//   'undo'       { undo(), redo(), canUndo(), canRedo(), steps() → the words of what Undo takes back, the latest first,
//                undoTo(n) }                                                                 (app.js)
//   'time'       { When({ close }), Ruler(), Band(), away(), today(), newSinceToday() }   the date's popover, the ruler under the
//                view, the band across it as it stood or on a look, what the date's × goes back to, going back, and what's new
//                on the status lists as of a day to come       (time.js)
//   'evaluate'   (text, selection) → { value } | { items } | { error }   Find's "="            (formulabar.js)
// Any number of: 'action' { id, name, run, keys?, inputs?, enabled?, menu?: 'chart', order?, names? } (the chart
// menu by order: files 1–4, History 10, Settings 20, Light and Dark 30, Tour 40), its keys bound in the
// window (in fields too, with inputs) and listed by ?, and Find reaching it by any other names it goes by;
// 'find' { items() → menu items }, Find's records, lists and definitions, an item with its kind (detail:
// 'Entity', which heads it), any other names it goes by (names: […]) and a key, and what's within it (a list,
// "AIV-1 › Signatories") with of: that key; 'export' { name, run }; 'status' { render() }; 'attention'
// { items() → [{ kind: 'overdue' | 'error' | 'soon' | 'blank', id, edge?, error?, go() }] }, what needs attention,
// counted in the status bar, listed by a count clicked and stepped through by F8 in that order, the worst first, from
// App.needs (Formulas.attention): inspector.js counts deadlines, blanks and errors, aiming at their rows; app.js the
// checks failed, as errors. One 'needs' (item) → { what, where, figure } says an item in its words (formulabar.js).
//
// THE BUS, for what more than one part hears (Shell.on(name, fn) → off, Shell.emit(name, detail)):
//   select        the selection changed; its keys       the shell        → the tour, the formula bar
//   view-switch   another view is shown; its id         the shell        → the tour, time.js
//   why-open      a computed record's reasons asked     inspector, canvas, app → the bar
//   relate-open   two boxes' relations asked for [a, b] the canvas       → the inspector, the tour
// Anything else one part asks of another is a call: FormulaBar.preview(change), App.change(fn), Canvas.zoom.
// Shell.ready and Shell.launched are promises: the window is drawn; the launch screen is gone.
//
// APP (app.js) is the workbook: App.wb; signals version, day, readOnly (in History, or Viewing), viewing, set by
// App.setViewing(on), and opensViewing, by App.setOpensViewing(on); App.whyNot(), why it can't be changed now, in words;
// computed chart (the one the
// view shown is of, so the address opens it), shown, entered, schema, notes, definitions, relations, computed
// (Formulas.computeState's), state, views
// ([{ id, name, layout, rows, keeps }]), scene (the view shown, drawn), layouts; App.change(fn(tx), { say,
// dated, ids }) → the change, every edit's one way in, and App.would(fn(tx), { dated, ids }), the chart it would
// leave as of the day shown, unmade, which its redline previews; App.reverse(changeId) and App.restore(item), History's;
// App.asksDay(record, recs?), whether a record about to be added asks the day it holds from (a relation with no
// start entry), App.endOf(id), how deleting one ends it (by its end entry, on a day said, or as a value), and
// App.From({ day, set, auto, asks, word }), the control that asks either ("From" a day or "All along"; "Ends on" a
// day or "Never held"; a transfer's "On" a day); App.pending, the one change pending, begun by App.stage(…),
// App.deleting(ids, what) or App.transferring(id) (where App.transferable(id)), made by App.commit() and dropped by
// App.discard(), which says so, with Redo; App.Pending, its bar, the window's one, which the shell shows under
// whichever view is shown, and App.Asking, its controls where it was asked; App.workOn(day), another day's working-out,
// as showing it would work it out; App.addView; App.who(); App.blank(); App.showMade(tx, ids, view), boxes a change makes
// on a chart shown there by it, where the view would hide them; App.put(id, slot, out, { auto }), a value typed, made at
// once or asking from when (App.asksFrom), App.held(id), what's pending of it, and App.overriding(id), a computed tag's
// Rule out… or Attest…; App.interposing(id) (where App.interposable(id)) and App.merging(id); App.spanOf(id), when a record
// holds, App.heldUntil(id), the day it ended before the day shown, App.enteredBy(id), who typed it and when; App.noTone(id),
// what a "no" is ('fails', 'heeds' or plain).
//
// THE PIECES: Shell.menu(anchor, items, opts) and Shell.popover(anchor, draw, opts) on Floating UI; dialog()
// and confirm() on <dialog>; toast(text, { undo } or { redo }); keys(map, opts) on tinykeys, and keyLabel(key)
// as shown; aside(component | null), in the inspector's place; layer(close) → remove, the Esc stack every layer
// joins; drag(e, { item, items, axis, onDrop, onClick }), reordering by drag; find(query); icon(name), a Lucide icon, and
// iconMarkup(name), the same as HTML;
// store.get/set, this browser's settings; widen() and narrow(), and gliding, a signal true while the inspector
// glides in or out, so the view's slot has settled once it's false again; theme. A menu item is '-', { head }, or
// { label, detail?, keys?, checked?, disabled?, tip?, danger?, run?, items?, point?, icon?, glyph?, font? }, an icon by Shell.icon's name or a
// glyph drawn before its label, its label in a font where `font` (a CSS family) says; one without run or items is
// shown, not chosen, and one with point(on) shows what it would do while it's pointed at or reached by the keys; `tip`, its
// tooltip, says why one is disabled.
//
// THE REGIONS, which F6 and Shift+F6 step through: the bars, the view, the bar a change pending has, the inspector and the tabs
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
  const at = (t, o) => go(() => { time.value = (t?.asOf ? { ...t, asOf: Tree.firstDay(t.asOf) } : t) || null; }, o);
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
  let glided = 0;
  const glide = () => { gliding.value = true; clearTimeout(glided); glided = setTimeout(() => { gliding.value = false; }, 240); };
  const widen = () => { if (!wide.peek()) { glide(); wide.value = true; } };
  const narrow = () => { if (wide.peek()) { glide(); wide.value = false; } };
  // The inspector is always beside the view, so nothing moves under the pointer as the selection changes. Only the
  // user puts it away (its button, Ctrl+\, or its divider dragged to the edge) and brings it back; a flow that needs
  // it brings it back too (showPanel).
  const shut = signal(store.get('panel') === 'shut');
  const setShut = on => { if (shut.peek() === on) return; glide(); shut.value = on; store.set('panel', on ? 'shut' : 'open'); };
  const showPanel = () => setShut(false);
  // What takes the inspector's place, while it does: History.
  const aside = signal(null);

  // ---- Keys, and the Esc stack ----
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
  const KEY = { ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Equal: '=', Minus: '−', PageUp: 'PgUp', PageDown: 'PgDn', Escape: 'Esc' };
  // A shifted mark is said by what it types, as PowerPoint says Ctrl+Shift+>.
  const keyLabel = k => !k ? '' : k.replace(/Shift\+Period/, 'Shift+>').replace(/Shift\+Comma/, 'Shift+<').replace(/\[Shift\]\+/g, '').replace(/\$mod/g, isMac ? 'Cmd' : 'Ctrl').replace(/Key([A-Z])|Digit(\d)/g, '$1$2').replace(/\w+/g, w => KEY[w] ?? w);
  // A key a part has already taken (typing over a box, say) isn't the window's too.
  function keys(map, o = {}) {
    const wrapped = {};
    for (const [k, fn] of Object.entries(map)) wrapped[k] = e => { if (!e.defaultPrevented && fn(e) !== false) e.preventDefault(); };
    return tinykeys.tinykeys(o.target || window, wrapped, { ignore: o.inputs ? e => e.isComposing : typing });
  }
  // A key held, or one in what's typed in (a text field, a list, an editor), isn't the window's; one on a checkbox
  // or a button is, so Ctrl+Z after a tick undoes it.
  const TYPED = '[contenteditable]:not([contenteditable="false"]), select, textarea, input:not([type=checkbox], [type=radio], [type=range], [type=button], [type=submit], [type=reset], [type=color], [type=file])';
  const typing = e => e.repeat || e.isComposing || (e.target !== e.currentTarget && !!e.target.matches?.(TYPED));
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
  const REGIONS = ['bars', 'view', 'bar', 'inspector', 'tabs'], lastIn = {};
  document.addEventListener('focusin', e => { const r = e.target.closest?.('[data-region]'); if (r) lastIn[r.dataset.region] = e.target; });
  const els = n => [...document.querySelectorAll(`[data-region="${n}"]`)].filter(shown);
  // A region given the keys: the view's part, where it takes them itself (a table, at its active cell, as a sheet
  // shown in Excel does); else where it last had them, or else its first control, or itself.
  function enter(n) {
    if (n === 'view' && part(current.peek()?.layout ?? 'chart')?.focus?.()) return;
    // The window's bar, under the view while a change is pending: at the day it asks, selected, to type over.
    const day = n === 'bar' && els(n)[0]?.querySelector('.when input');
    if (day) { day.focus(); day.select(); return; }
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

  // ---- Icons: only functional ones, each the familiar one, Lucide's (vendor/lucide), at 16 px ----
  // By the names the parts use: a Lucide icon's own name works too (icon('PaintBucket')).
  const ICONS = {
    chevron: 'ChevronDown', 'chevron-right': 'ChevronRight', 'chevron-left': 'ChevronLeft', 'chevron-up': 'ChevronUp', check: 'Check', plus: 'Plus', x: 'X',
    undo: 'Undo2', redo: 'Redo2', grip: 'GripVertical', search: 'Search', filter: 'Filter', eye: 'Eye', 'eye-off': 'EyeOff', download: 'Download', open: 'ArrowUpRight',
    fill: 'PaintBucket', outline: 'Pen', color: 'Baseline', bold: 'Bold', italic: 'Italic', underline: 'Underline', strike: 'Strikethrough',
    'align-left': 'AlignLeft', 'align-center': 'AlignCenter', 'align-right': 'AlignRight', layers: 'Layers', group: 'Group', ungroup: 'Ungroup',
    painter: 'Paintbrush', eraser: 'Eraser', grow: 'AArrowUp', shrink: 'AArrowDown', copy: 'Copy', paste: 'ClipboardPaste', trash: 'Trash2',
    front: 'BringToFront', back: 'SendToBack', forward: 'ArrowUpFromLine', backward: 'ArrowDownFromLine', panel: 'PanelRight', more: 'Ellipsis', alert: 'TriangleAlert',
  };
  const lucideOf = name => typeof lucide === 'undefined' ? null : lucide[ICONS[name] ?? name];
  const icon = name => html`<svg class="i lu" viewBox="0 0 24 24" aria-hidden="true">${lucideOf(name)?.[2].map(([tag, a]) => h(tag, a)) ?? null}</svg>`;
  // The same as markup, for what's drawn as HTML (a table's headings).
  const iconMarkup = name => `<svg class="i lu" viewBox="0 0 24 24" aria-hidden="true">${(lucideOf(name)?.[2] ?? [])
    .map(([tag, a]) => `<${tag} ${Object.entries(a).map(([k, v]) => `${k}="${v}"`).join(' ')}/>`).join('')}</svg>`;
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
    const update = () => computePosition(ref, el, { strategy: 'fixed', placement, middleware: [offset(gap), flip({ padding: 8 }), shift({ padding: 8, crossAxis: true })] })
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
      ${f.kind === 'menu' ? html`<${Menu} f=${f} />` : html`<div class="pop" role="dialog">${f.draw(f.close, f.id)}</div>`}</div>`;
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
  // to more others first (the fund before its general partner); a name that holds another's found too, as a
  // document's names what it's about (Form D, Co-Invest (Corvane) holds Co-Invest), after every name that
  // doesn't; and what's within a thing (AIV-1 › Signatories, of its key) after every thing found, so "blocker"
  // finds both blockers before their lists.
  const words = s => (s.match(/\S*[\p{L}\p{N}]\S*/gu) ?? []).length;
  // How many others a record is related to, counted once for each state.
  const relatedBy = new WeakMap();
  function relatives(id) {
    const st = App.state.peek(), known = relatedBy.get(st) ?? relatedBy.set(st, new Map()).get(st);
    if (known.has(id)) return known.get(id);
    const out = new Set();
    for (const r of Tree.index(st).relations.get(id) ?? []) for (const a of st[r].args) out.add(Tree.objectOf(st, a.at));
    out.delete(id);
    known.set(id, out.size);
    return out.size;
  }
  function rank(items, q, limit = 50) {
    const related = x => x.key === undefined || typeof App === 'undefined' ? 0 : relatives(x.key);
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
    const things = found.filter(x => !within(x)), named = [...new Set(things.flatMap(names))].map(n => [n, n.toLowerCase()]);
    const res = new Map(), word = (n, s) => (res.get(n) ?? res.set(n, new RegExp(`(?:^|[^\\p{L}\\p{N}-])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}-])`, 'iu')).get(n)).test(s);
    const about = x => { const s = x.label.toLowerCase(); return named.some(([n, l]) => l.length < s.length && s.includes(l) && !names(x).includes(n) && word(n, x.label)); };
    return [...new Set([...found.filter(x => names(x).some(n => norm(n) === typed)), ...things.filter(x => !about(x)), ...things, ...found])].slice(0, limit);
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

  // A menu; with `search`, a field that ranks its items, or that `items(query)` answers. An item `asked` (a new option named
  // as it's typed, from `more(query)`) is what Enter takes only where it's highlighted: by the pointer or the arrows, or
  // of itself where nothing else is found.
  function Menu({ f }) {
    const [q, setQ] = useState(f.query ?? '');
    const [act, setAct] = useState(-1);
    const items = typeof f.items === 'function' ? f.items(q.trim()) : f.search && q.trim() ? [...rank(f.items.filter(it => selectable(it) && !it.asked), q), ...(f.more?.(q.trim()) ?? [])] : f.items;
    const live = items.map((it, i) => selectable(it) ? i : -1).filter(i => i >= 0);
    const active = f.search && q.trim() && act < 0 ? live.find(i => !items[i].asked) ?? live[0] ?? -1 : act;
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
            aria-disabled=${it.disabled ? 'true' : null} aria-haspopup=${it.items ? 'menu' : null} data-tip=${it.tip ?? null} aria-description=${it.tip ?? null}
            class=${'menu-item' + (i === active || it.lit ? ' on' : '') + (it.items ? ' sub' : '') + (it.danger ? ' danger' : '') + (selectable(it) || it.disabled ? '' : ' said')}
            onPointerMove=${() => { if (i !== act && selectable(it)) { setAct(i); if (it.items) openSub(it, el(i)); else floats.peek().filter(x => x.parent === f.id).forEach(x => x.close()); } }}
            onClick=${() => selectable(it) && run(it)}>
            ${checks ? html`<span class="check">${it.checked ? icon('check') : null}</span>` : null}
            ${it.icon || it.glyph ? html`<span class="glyph">${it.glyph ?? icon(it.icon)}</span>` : null}
            <span class="label" style=${it.font ? `font-family:${it.font}` : null}>${marked(it.label, it.ranges)}</span>
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

  // ---- A red ring always says why in words: whatever's marked invalid says it beside it while it's marked, its own words
  // (data-why) or else by what it takes. Marked and pointed at it says so too. ----
  const ringed = signal(null);
  const marked_ = el => el.hasAttribute?.('aria-invalid') && el.getAttribute('aria-invalid') !== 'false';
  const whyOf = el => el.dataset.why ?? (el.classList.contains('date') ? Tree.notA('date') : 'Not a value this takes');
  new MutationObserver(ms => { for (const { target: el } of ms) {
    if (marked_(el)) { if (whyOf(el)) { if (!el.dataset.tip) el.dataset.tip = whyOf(el); ringed.value = el; } }
    else if (el.dataset.tip === whyOf(el)) delete el.dataset.tip;
    if (ringed.peek() === el && !marked_(el)) ringed.value = null;
  } }).observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['aria-invalid'] });
  function Ringed() {
    const el = ringed.value, ref = useRef();
    useLayoutEffect(() => { if (!el) return; ref.current.showPopover?.(); const stop = place(el, ref.current, 'bottom-start', 4), t = setInterval(() => { if (!el.isConnected || !marked_(el)) { if (ringed.peek() === el) ringed.value = null; } }, 300); return () => { stop(); clearInterval(t); }; }, [el]);
    return el ? html`<div class="float tip why" popover="manual" role="alert" ref=${ref}>${whyOf(el)}</div>` : null;
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

  // ---- Toasts: a verb, an object and Undo, or Redo once it's undone; one with a way to see what it did (`go`, [label,
  // run]: Show Jan 15, 2027) stays till that's taken or it's dismissed ----
  const toasts = signal([]);
  let tid = 0;
  function toast(text, o = {}) {
    const t = { id: ++tid, text, acts: [...(o.go ? [o.go] : []), ...(o.undo ? [['Undo', o.undo]] : o.redo ? [['Redo', o.redo]] : [])], stay: !!o.go, timer: 0 };
    const dismiss = () => { clearTimeout(t.timer); toasts.value = toasts.peek().filter(x => x !== t); };
    t.arm = () => { clearTimeout(t.timer); if (!t.stay) t.timer = setTimeout(dismiss, o.ms || 6000); };
    t.dismiss = dismiss;
    toasts.peek().forEach(x => clearTimeout(x.timer));
    toasts.value = [t];
    t.arm();
    return dismiss;
  }
  // A toast never covers what's being worked on: the field being typed in, the cell or box selected, or the pointer.
  // It stands at the foot of the view, in its middle; where that covers one of them, at its foot's left, its right,
  // or its top, the first that's clear. It's placed as it comes and again as the selection or the keys move, never
  // as the pointer does, so its Undo stays where it was seen; and in each place it takes no click for a moment, so a
  // click meant for what was there goes there.
  let pointer = null;
  addEventListener('pointermove', e => { pointer = { x: e.clientX, y: e.clientY }; }, { capture: true, passive: true });
  const busy = () => {
    const out = [], add = el => { const r = el?.getBoundingClientRect?.(); if (r && r.width + r.height > 0) out.push(r); };
    const a = document.activeElement;
    if (a && a !== document.body && a.matches?.(TYPED) && !a.closest('.toasts')) add(a);
    document.querySelectorAll('#view .tabulator-range-cell-active, #view .tabulator-editing, #view .dc-edit').forEach(add);
    for (const k of selection.peek().slice(0, 40)) { const id = String(k).split('@')[0]; document.querySelectorAll(`#view [data-cell-id="${CSS.escape(id)}"]`).forEach(add); }
    if (pointer) out.push(new DOMRect(pointer.x - 12, pointer.y - 12, 24, 24));
    return out;
  };
  const overlap = (a, b, pad = 8) => Math.max(0, Math.min(a.right + pad, b.right) - Math.max(a.left - pad, b.left)) * Math.max(0, Math.min(a.bottom + pad, b.bottom) - Math.max(a.top - pad, b.top));
  let settling = 0;
  function placeToasts(fresh = false) {
    const el = document.querySelector('.toasts'), view = document.getElementById('view')?.getBoundingClientRect();
    if (!el || !el.children.length || !view) return;
    // One being pointed at stays, or a press on its button would move it out from under the click.
    if (!fresh && el.matches(':hover')) return;
    const was = el.style.translate;
    el.style.translate = '';
    const r = el.getBoundingClientRect(), hit = busy(), gap = 16;
    const at = [[0, 0], [view.left + gap - r.left, 0], [view.right - gap - r.right, 0], [0, view.top + gap - r.top]];
    const cost = ([dx, dy]) => hit.reduce((s, b) => s + overlap(new DOMRect(r.left + dx, r.top + dy, r.width, r.height), b), 0);
    const [dx, dy] = at.find(p => !cost(p)) ?? at.reduce((x, p) => cost(p) < cost(x) ? p : x);
    const now = dx || dy ? `${Math.round(dx)}px ${Math.round(dy)}px` : '';
    el.style.translate = now;
    if (fresh || now !== was) { el.classList.add('settling'); clearTimeout(settling); settling = setTimeout(() => el.classList.remove('settling'), 400); }
  }
  const replace = () => requestAnimationFrame(() => placeToasts());
  on('select', replace);
  document.addEventListener('focusin', replace);
  document.addEventListener('keyup', e => { if (/^(Arrow|Tab|Enter|Page|Home|End)/.test(e.key)) replace(); });
  function Toasts() {
    const list = toasts.value;
    // Placed as it comes, and again once the view has drawn what the change did (a table's cells laid out anew).
    useLayoutEffect(() => { if (!list.length) return; placeToasts(true); const t = setTimeout(() => placeToasts(), 120); return () => clearTimeout(t); }, [list]);
    return html`<div class="toasts" aria-live="polite">${list.map(t => html`
      <div class="toast" key=${t.id} onPointerEnter=${() => clearTimeout(t.timer)} onPointerLeave=${t.arm}>
        <span>${t.text}</span>${t.acts.map(([label, run]) => html`<button onClick=${() => { t.dismiss(); run(); }}>${label}</button>`)}${t.stay
          ? html`<button class="x" aria-label="Dismiss" data-tip="Dismiss" onClick=${t.dismiss}>${icon('x')}</button>` : null}</div>`)}</div>`;
  }

  // ---- Find: records, lists, definitions, what needs attention, views and actions, ranked as you type, each
  // under its kind's head; "=" works a formula out; "?" lists the keys ----
  let findButton = null;
  // Each kind under its head, the heads in the order of the best each has; what's within a thing under that
  // thing's. An answer doesn't say its kind again.
  function headed(found, all = found) {
    const keyed = new Map(all.filter(x => x.key !== undefined).map(x => [x.key, x])), heads = new Map();
    const kind = x => x.of !== undefined && keyed.has(x.of) ? kind(keyed.get(x.of)) : x.detail ?? '';
    for (const x of found) { const k = kind(x); if (!heads.has(k)) heads.set(k, []); heads.get(k).push({ ...x, detail: x.why ?? null }); }
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
    // An action that can't be done now is still found, greyed, saying why where it can, so nothing looked for is
    // missing; with nothing typed, only what can be done is listed.
    const acts = many('action').filter(a => a.id !== 'find').map(a => { const off = !!a.enabled && !a.enabled();
      return { id: a.id, label: a.name, names: a.names, detail: 'Action', why: off ? a.why?.() ?? 'Not now' : null, keys: a.keys, disabled: off, run: a.run }; });
    // The keys, but not the two ways here.
    if (q.startsWith('?')) { const ks = acts.filter(a => a.keys && a.id !== 'keys').map(a => ({ ...a, detail: null })); return q.slice(1).trim() ? rank(ks, q.slice(1).trim()) : ks; }
    const vs = views.value.map(v => ({ label: v.name, detail: 'View', run: () => show(v.id) })), can = acts.filter(a => !a.disabled);
    if (!q) return headed([...vs, ...can]);
    const all = [...many('find').flatMap(s => s.items(q)), ...counted(), ...vs, ...acts];
    return headed(rank(all, q), all);
  }
  // A result chosen keeps the focus it gave itself (a field, a dialog); otherwise the view has the keys, wherever
  // Find was opened from.
  function find(q = '') {
    closeAll();
    const was = document.activeElement;
    let chosen = false;
    const items = s => answers(s).map(it => it.run ? { ...it, run: () => { chosen = true; it.run(); } } : it);
    const land = () => setTimeout(() => { const a = document.activeElement; if (!a || a === document.body || chosen && a === was) enter('view'); });
    menu(findButton, items, { search: true, query: q, cls: 'findpal', placement: 'bottom', gap: -32, onClose: land });
  }

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

  // The chart menu: the chart's own (its name, and the workbook's: app.js), then the actions; nothing in it moves as the
  // workbook's charts are added.
  function chartMenu() {
    const wb = part('workbook'), items = [];
    if (wb) items.push({ label: 'Rename', disabled: App.readOnly.value, run: nameChart }, ...wb.menu(), '-');
    const themes = { order: 30, seg: THEMES.map(([label, t]) => ({ label, pressed: theme.value === t, run: () => setTheme(t) })) };
    // Editing or Viewing, as the title bar's switch says it.
    const modes = { order: 5, seg: [['Editing', false], ['Viewing', true]].map(([label, on]) => ({ label, pressed: App.viewing.value === on, run: () => App.setViewing(on) })) };
    const acts = many('action').filter(a => a.menu === 'chart').map(a => ({ order: a.order ?? 25, label: a.name, keys: a.keys, disabled: a.enabled && !a.enabled(), run: a.run }));
    for (const it of [...acts, modes, themes].sort((a, b) => a.order - b.order)) {
      if (it.seg && items.length && items[items.length - 1] !== '-') items.push('-');
      items.push(it);
      if (it.seg) items.push('-');
    }
    if (items[items.length - 1] === '-') items.pop();
    return items;
  }
  // A name cut short is shown whole on hover, as the formula bar's is.
  const whole = e => { const b = e.currentTarget, n = b.querySelector('.name'); if (n && n.scrollWidth > n.clientWidth) b.dataset.tip = n.textContent; else delete b.dataset.tip; };
  // Editing or Viewing, as Word's switch is; and whether this chart opens in Viewing, in this browser.
  const modeMenu = e => menu(e.currentTarget, () => [
    { label: 'Editing', checked: !App.viewing.value, run: () => App.setViewing(false) },
    { label: 'Viewing', checked: App.viewing.value, run: () => App.setViewing(true) }, '-',
    { label: 'Open this chart in Viewing', checked: App.opensViewing.value, run: () => App.setOpensViewing(!App.opensViewing.peek()) }]);
  // Undo's list: the steps it can take back, the latest first, by their words; picking one undoes back to there, and pointing
  // at one lights it and the later ones it takes too, as Office's does.
  const undoList = e => {
    const u = part('undo'), lit = signal(0), words = u.steps(), points = words.map((_, i) => on => { lit.value = on ? i + 1 : 0; });
    menu(e.currentTarget, () => words.map((label, i) => ({ label, lit: i < lit.value, run: () => u.undoTo(i + 1), point: points[i] })), { cls: 'undolist', placement: 'bottom-end' });
  };
  function TitleBar() {
    const u = part('undo'), t = time.value;
    return html`<header class="titlebar" data-region="bars">
      <div class="left">${naming.value ? html`<${Naming} key=${naming.value} />` : html`<button class="btn ghost dd chartmenu" aria-haspopup="menu" onPointerOver=${whole}
        ref=${el => { if (el && refocus) { refocus = false; el.focus(); } }} onClick=${e => menu(e.currentTarget, chartMenu)} onDblClick=${nameChart}>${mark}<span class="name">${chartName.value || 'Dendra'}</span></button>`}${part('keeping')?.render()}</div>
      <button class="find" aria-haspopup="menu" ref=${el => { findButton = el; }} onClick=${() => find()}><span>Find</span><kbd>${keyLabel('$mod+KeyK')}</kbd></button>
      <div class="right">
        ${part('time') ? html`<span class=${'asof' + (t ? ' past' : '')}><button class="btn ghost dd" aria-haspopup="dialog" onClick=${e => popover(e.currentTarget, close => html`<${part('time').When} close=${close} />`, { placement: 'bottom-end' })}>${fmtTime(t)}</button>${part('time').away()
          ? html`<button class="btn icon" aria-label=${part('time').away()} data-tip=${part('time').away()} onClick=${() => part('time').today()}>${icon('x')}</button>` : null}</span>` : null}
        <span class="sep" />
        <button class="btn icon" aria-label=${away.value ? 'Show panel' : 'Hide panel'} data-tip=${away.value ? 'Show panel' : 'Hide panel'} data-keys=${keyLabel('$mod+Backslash')}
          aria-pressed=${!away.value} onClick=${() => wide.peek() ? narrow() : setShut(!away.peek())}>${icon('panel')}</button>
        <button class="btn icon" aria-label="Undo" data-tip="Undo" data-keys=${keyLabel('$mod+KeyZ')} disabled=${!u?.canUndo()} onClick=${() => u.undo()}>${icon('undo')}</button>
        <button class="btn icon undo-list" aria-label="Undo list" data-tip="Undo list" aria-haspopup="menu" disabled=${!u?.canUndo()} onClick=${undoList}>${icon('chevron')}</button>
        <button class="btn icon" aria-label="Redo" data-tip="Redo" data-keys=${keyLabel('$mod+KeyY')} disabled=${!u?.canRedo()} onClick=${() => u.redo()}>${icon('redo')}</button>
        <span class="sep" />
        ${part('workbook') ? html`<span class=${'mode' + (App.viewing.value ? ' viewing' : '')}><button class="btn ghost dd" aria-haspopup="menu" onClick=${modeMenu}>${App.viewing.value ? 'Viewing' : 'Editing'}</button></span>` : null}
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
  // Put away, the inspector leaves the view the width, unless History takes its place or it's widened.
  const away = computed(() => shut.value && !wide.value && !aside.value);
  function Main() {
    const v = current.value, layout = v?.layout || 'chart', kinds = layout === 'chart' && part('canvas')?.kinds;
    const bare = kinds && v && !App.readOnly.value && App.scene.value && !App.scene.value.marks.some(m => m.type === 'box') && !App.later.value;
    const resize = e => {
      if (e.button !== 0) return;
      e.preventDefault();
      const el = e.currentTarget, W = innerWidth;
      el.setPointerCapture(e.pointerId);
      el.classList.add('drag');
      // Dragged to the window's edge, it's put away; dragged out again, it's back.
      const move = ev => {
        const w = W - ev.clientX;
        wide.value = w > W - 160;
        shut.value = w < 140;
        if (!wide.value && !shut.value) insp.value = Math.round(Math.min(Math.max(w, 280), W - 320));
      };
      const up = () => { el.classList.remove('drag'); el.removeEventListener('pointermove', move); store.set('inspector', insp.value); store.set('panel', shut.peek() ? 'shut' : 'open'); };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up, { once: true });
    };
    return html`<div class=${'main' + (wide.value ? ' wide' : '') + (away.value ? ' shut' : '') + (gliding.value ? ' anim' : '')} style=${`--insp:${insp.value}px`}>
      <div class="view" id="view" role="tabpanel" aria-labelledby=${v ? 'tab-' + v.id : null} data-region="view" tabindex="-1" aria-hidden=${wide.value ? 'true' : null}>
        <${Host} kind="canvas" hidden=${layout !== 'chart'} />
        <${Host} kind="table" hidden=${layout !== 'table'} />
        ${bare ? html`<div class="empty void"><button class="btn dd" aria-haspopup="menu" onClick=${e => menu(e.currentTarget, kinds(), { placement: 'bottom' })}>Add a box</button></div>` : null}
        ${part('time') ? h(part('time').Band) : null}
        ${part('broken') ? h(part('broken')) : null}
        ${h(App.Pending)}
        <${OpenList} />
        ${part('time') ? h(part('time').Ruler) : null}
      </div>
      <div class="divider" role="separator" aria-orientation="vertical" onPointerDown=${resize} onDblClick=${() => wide.value ? narrow() : widen()} />
      <aside class="inspector" aria-label="Inspector" data-region="inspector" tabindex="-1">${wide.value && v ? html`<button class="btn ghost back" data-tip="Back" data-keys="Esc" onClick=${narrow}>${icon('chevron-left')}<span>${v.name}</span></button>` : null}<${Host} kind="inspector" hidden=${!!aside.value} />${aside.value ? html`<div class="host aside">${h(aside.value)}</div>` : null}</aside>
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
    // A tab clicked shows its view, the record's page put back first where it was widened over it.
    const down = (e, v) => {
      if (e.button !== 0 || editing.peek()) return;
      narrow();
      show(v.id);
      if (!App.readOnly.peek()) drag(e, { item: e.currentTarget, items: [...ref.current.children], axis: 'x', onDrop: (from, i) => vp.move(list[from].id, i) });
    };
    const commit = (v, name) => { editing.value = null; name = name.trim(); if (name && name !== v.name) vp.rename(v.id, name); };
    // A tab's menu, at the pointer, or over the tab from the keyboard.
    const tabMenu = (e, v) => {
      e.preventDefault(); show(v.id);
      menu(e.clientX || e.clientY ? { x: e.clientX, y: e.clientY } : e.currentTarget, [{ label: 'Rename', disabled: App.readOnly.peek(), run: () => { editing.value = v.id; } }, ...vp.menu(v.id)], { placement: 'top-start' });
    };
    const onKey = e => {
      const k = list.findIndex(x => x.id === view.peek()), d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!d || editing.peek()) return;
      e.preventDefault();
      const next = list[(k + d + list.length) % list.length];
      show(next.id);
      ref.current.children[list.indexOf(next)]?.focus();
    };
    // Viewing, or at a past moment, a new view says why it can't be, rather than doing nothing.
    const add = e => App.readOnly.peek() ? toast(App.whyNot()) : vp.add(e.currentTarget).then(id => { if (id) { show(id); editing.value = id; } });
    const name = v => { if (!App.readOnly.peek()) editing.value = v.id; };
    const all = e => menu(e.currentTarget, list.map(v => ({ label: v.name, checked: v.id === view.peek(), run: () => show(v.id) })), { placement: 'top-end' });
    return html`<div class="sheets" role="tablist" aria-label="Views" ref=${ref} onKeyDown=${onKey} onScroll=${more} onWheel=${e => { if (e.deltaY && !e.deltaX) { e.preventDefault(); ref.current.scrollLeft += e.deltaY * (e.deltaMode ? 16 : 1); } }}>
      ${list.map(v => editing.value === v.id
        ? html`<div class="sheet" aria-selected="true"><input aria-label="Name" value=${v.name} style=${`width:${v.name.length + 3}ch`} ref=${el => el && !el.dataset.on && (el.dataset.on = 1, el.focus(), el.select())}
            onKeyDown=${e => { if (e.key === 'Enter') commit(v, e.target.value); else if (e.key === 'Escape') { e.stopPropagation(); editing.value = null; } }}
            onBlur=${e => commit(v, e.target.value)} /></div>`
        : html`<button key=${v.id} id=${'tab-' + v.id} class="sheet" role="tab" aria-selected=${v.id === view.value} aria-controls="view" tabindex=${v.id === view.value ? 0 : -1} data-tour=${v.id === view.value ? null : 'sheet'}
            onPointerDown=${e => down(e, v)} onDblClick=${() => name(v)} onContextMenu=${e => tabMenu(e, v)}>${v.name}${v.keeps ? html`<span class="keeps">${Tree.formatDate(v.keeps, 'short').replace(`, ${Log.today().slice(0, 4)}`, '')}</span>` : null}</button>`)}
    </div>${over ? html`<button class="btn icon views" aria-haspopup="menu" aria-label="All views" data-tip="All views" onClick=${all}>${icon('chevron')}</button>` : null}<button class="btn icon" aria-label="New view" data-tip=${App.readOnly.value ? App.whyNot() : 'New view'} aria-disabled=${App.readOnly.value ? 'true' : null} onClick=${add}>${icon('plus')}</button>`;
  }

  // ---- The status bar: what needs attention, counted, the worst first; F8 steps through it in that order ----
  // Each kind as the bar says it, what it means on hover where its name doesn't say, and the words Find reaches it by
  // besides: a deadline is settled by Paid… or Filed… (inspector.js).
  const KINDS = [['overdue', n => `${n} overdue`, ['Paid', 'Filed']], ['error', n => n === 1 ? '1 error' : `${n} errors`, []],
    ['soon', n => `${n} due soon`, ['Paid', 'Filed'], 'Due within 30 days'], ['blank', n => `${n} blank`, []]];
  const worst = it => KINDS.findIndex(([k]) => k === it.kind);
  const needs = () => many('attention').flatMap(a => a.items());
  // F8 goes on from wherever it is through them all.
  let stepAt = -1;
  function attend(d = 1) {
    const items = needs().sort((a, b) => worst(a) - worst(b));
    stepAt = items.length ? (stepAt + d + items.length) % items.length : -1;
    items[stepAt]?.go();
  }
  // ---- What's open (dendra.md, Moving): one list, under the view, of everything the status bar counts, each kind a tab of it, which
  // stays open as its rows are clicked, so five errors are five clicks; and that can be copied or exported as a sheet, with who's
  // responsible and why. What's one problem lists as one, under a head. Dates can be kept with what's overdue, how soon being its
  // own choice. What nothing requires stands apart, under Blank; and what's been said isn't ours. ----
  const opened = signal(null);
  let closeOpen = null;
  const shutList = () => { closeOpen?.(); closeOpen = null; opened.value = null; };
  function listOf(kind) {
    const o = opened.peek();
    if (o?.tab === kind) return shutList();
    if (!o) closeOpen = layer(shutList);
    opened.value = { tab: kind, within: o?.within ?? 30, q: '', apart: kind === 'blank' };
  }
  const SAY = { overdue: 'Overdue', error: 'Error', soon: 'Due soon', blank: 'Blank' };
  function openRows({ tab, within, q }) {
    const say = part('needs'), st = App.state.peek(), dated = it => st[it.id]?.value ?? '', atts = many('attention');
    const rowOf = it => {
      const w = say?.(it) ?? { what: '', where: '', figure: '' };
      let why = '';
      if (it.error?.rule) why = it.error.error.msg ?? ''; else if (it.kind !== 'blank' && !it.error) { try { why = FormulaBar.because(it.id) || App.enteredBy?.(it.id)?.note || ''; } catch {} } else if (it.error) why = it.error.error.msg ?? '';
      return { it, w, kind: it.kind, on: it.kind === 'blank' ? App.responsible?.(it.id)?.name ?? '' : App.responsible?.(it.id)?.name ?? '', why };
    };
    const soon = within === 30 ? needs().filter(it => it.kind === 'soon') : atts.flatMap(a => a.within?.(within) ?? []);
    const main = [...needs().filter(it => it.kind !== 'soon'), ...soon].filter(it => tab === 'all' || it.kind === tab).sort((a, b) => worst(a) - worst(b) || String(dated(a)).localeCompare(String(dated(b)))).map(rowOf);
    const apart = tab === 'all' || tab === 'blank' ? atts.flatMap(a => a.apart?.() ?? []).map(rowOf) : [];
    const has = r => { const t = q.trim().toLowerCase(); return !t || [r.w.what, r.w.where, r.w.figure, r.on, r.why].some(x => String(x ?? '').toLowerCase().includes(t)); };
    return { main: main.filter(has), optional: apart.filter(r => r.it.apart === 'optional' && has(r)), ours: apart.filter(r => r.it.apart === 'ours' && has(r)) };
  }
  // A sheet of it, or the same as text: a kind, what, whose, its date or figure, who's on the hook and why.
  const OPEN_HEAD = ['Kind', 'What', 'Whose', 'Date or figure', 'Responsible', 'Why'];
  const openLines = o => { const { main, optional, ours } = openRows(o), iso = r => { const v = App.state.peek()[r.it.id]; return (r.kind === 'overdue' || r.kind === 'soon') && v?.value ? Tree.firstDay(v.value) : r.w.figure ?? ''; };
    return [...main.map(r => [SAY[r.kind], r.w.what, r.w.where, iso(r), r.on, r.why]), ...optional.map(r => ['Blank, not required', r.w.what, r.w.where, '', r.on, r.it.list ? 'No one says who' : '']), ...ours.map(r => ['Not ours', r.w.what, r.w.where, '', r.on, ''])]; };
  async function copyOpen(o) {
    const lines = openLines(o), text = [OPEN_HEAD, ...lines].map(l => l.map(x => String(x ?? '').replace(/\s+/g, ' ')).join('\t')).join('\n');
    try { await navigator.clipboard.writeText(text); toast(`Copied ${lines.length} ${lines.length === 1 ? 'row' : 'rows'}`); } catch { toast('This browser didn’t allow the copy'); }
  }
  const OPEN_MARK = { Overdue: 'overdue', Error: 'fail', 'Due soon': 'soon', Blank: 'soon' };
  async function sheetOpen(o) {
    const lines = openLines(o), name = chartName.peek() ?? 'Chart', asOf = App.asOfWords().line;
    await Table.plainFile({ name: `${name} - What's open`, sheet: 'What’s open', title: `${asOf} · ${name}: what’s open: ${tally.peek().map(c => c.say(c.n)).join(', ') || 'nothing'}`, head: OPEN_HEAD, rows: lines, widths: [16, 34, 34, 16, 22, 70], wrap: [1, 2, 5], marks: lines.map(l => ({ 0: OPEN_MARK[l[0]] ?? 'wrap' })) });
  }
  // Going to one, what's selected on the chart comes out from under the list, as a wheel scrolls the chart, by as little as will do.
  function goFromList(it) {
    it.go();
    setTimeout(() => {
      const chart = document.querySelector('.dc-graph'), list = document.querySelector('.openlist'), id = selection.peek()[0];
      const box = chart && list && id && chart.querySelector(`[data-cell-id="${CSS.escape(String(id))}"]`)?.getBoundingClientRect();
      const top = list?.getBoundingClientRect().top;
      if (box && box.bottom > top - 8) chart.dispatchEvent(new WheelEvent('wheel', { deltaY: box.bottom - top + 24, bubbles: true, cancelable: true }));
    }, 60);
  }
  function OpenList() {
    const o = opened.value;
    if (!o) return null;
    App.version.value; App.chart.value; time.value;
    const set = x => { opened.value = { ...opened.peek(), ...x }; }, sel = selection.value, { main, optional, ours } = openRows(o), isNew = part('time')?.newSinceToday?.();
    const counts_ = tally.value, row = (r, label) => html`<div class=${'ol-row k-' + r.kind} role="button" tabindex="0" aria-current=${sel.some(k => k === r.it.id || App.state.peek()[r.it.id]?.at === k) ? 'true' : null}
        onClick=${() => goFromList(r.it)} onKeyDown=${e => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goFromList(r.it); }
          else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); (e.key === 'ArrowDown' ? e.currentTarget.nextElementSibling : e.currentTarget.previousElementSibling)?.focus?.(); } }}>
        <span class="c what">${label ?? r.w.what}</span><span class="c where">${r.w.where}</span><span class="c fig">${r.w.figure}</span><span class="c who">${r.on}</span><span class="c why" data-tip=${r.why || null}>${r.why}</span>
        ${r.it.say && !App.readOnly.value ? html`<button type="button" class="lk ours" onClick=${e => { e.stopPropagation(); r.it.say(); }}>${r.it.apart === 'ours' ? 'Ours after all…' : 'Not ours…'}</button>` : null}</div>`;
    // What's one problem lists as one.
    const grouped = xs => { const heads = new Map(); for (const x of xs) { const k = x.w.who ? `${x.w.what}|${x.w.who}` : `${x.w.what}|${x.w.where}|${x.it.id}`; if (!heads.has(k)) heads.set(k, []); heads.get(k).push(x); }
      return [...heads.values()].flatMap(g => g.length < 2 ? g.map(x => row(x)) : [html`<div class="ol-head">${g[0].w.what} · ${g[0].w.who} (${g.length})</div>`, ...g.map(x => row(x, ''))]); };
    const told = xs => { if (!isNew) return grouped(xs); const fresh = xs.filter(x => isNew(x.it)), old = xs.filter(x => !isNew(x.it));
      return [html`<div class="ol-head">${fresh.length ? `New since today (${fresh.length})` : 'Nothing new since today'}</div>`, ...grouped(fresh), ...(old.length ? [html`<div class="ol-head">On today’s lists too</div>`, ...grouped(old)] : [])]; };
    // What nothing requires, by what's blank: EIN (7), each by whose.
    const byWhat = xs => { const m = new Map(); for (const x of xs) { if (!m.has(x.w.what)) m.set(x.w.what, []); m.get(x.w.what).push(x); } return [...m].flatMap(([what, g]) => [html`<div class="ol-head sub">${what} (${g.length})</div>`, ...g.map(x => row(x, ''))]); };
    const sections = o.tab === 'all' ? KINDS.flatMap(([k, s]) => { const xs = main.filter(r => r.kind === k); return xs.length ? [html`<div class=${'ol-head ' + k}>${s(xs.length)}</div>`, ...told(xs)] : []; }) : told(main);
    return html`<section class="openlist" aria-label="What’s open" data-region="bar">
      <div class="ol-bar">
        <div class="menu-seg ol-tabs" role="tablist">${[['all', 'All'], ...counts_.map(c => [c.k, c.say(c.n)])].map(([k, label]) => html`<button role="tab" aria-pressed=${o.tab === k} aria-selected=${o.tab === k} class=${k} onClick=${() => set({ tab: k, apart: k === 'blank' || o.apart })}>${label}</button>`)}</div>
        ${o.tab === 'all' || o.tab === 'soon' ? html`<div class="menu-seg ol-days">${[30, 60, 90].map(n => html`<button aria-pressed=${o.within === n} onClick=${() => set({ within: n })}>Next ${n} days</button>`)}</div>` : null}
        <input type="search" class="cell ol-find" placeholder="Find" aria-label="Find in what’s open" spellcheck=${false} value=${o.q} onInput=${e => set({ q: e.target.value })} />
        <span class="ol-acts"><button type="button" class="btn ghost" onClick=${() => copyOpen(o)}>Copy</button><button type="button" class="btn ghost" onClick=${() => sheetOpen(o)}>Excel</button>
          <button type="button" class="btn icon" aria-label="Close" data-tip="Close" data-keys="Esc" onClick=${shutList}>${icon('x')}</button></span>
      </div>
      <div class="ol-cols" aria-hidden="true"><span>What</span><span>Whose</span><span>Date or figure</span><span>Responsible</span><span>Why</span></div>
      <div class="ol-rows">
        ${sections}
        ${!main.length && !optional.length && !ours.length ? html`<div class="ol-none">Nothing</div>` : null}
        ${optional.length ? html`<button type="button" class="ol-head apart" aria-expanded=${!!o.apart} onClick=${() => set({ apart: !o.apart })}>${icon(o.apart ? 'chevron-up' : 'chevron')}Blank, not required (${optional.length})</button>${o.apart ? byWhat(optional) : null}` : null}
        ${ours.length ? html`<div class="ol-head apart">Not ours (${ours.length})</div>${ours.map(r => row(r))}` : null}
      </div>
    </section>`;
  }
  const countButton = kind => document.querySelector(`.status .counts > .${kind}`);
  const counts = () => { const items = needs(); return KINDS.map(([k, say, names, tip]) => ({ k, say, names, tip, n: items.filter(it => it.kind === k).length })).filter(c => c.n); };
  // In Find, each count opens its list, as the bar's does.
  const counted = () => counts().map(c => ({ label: c.say(c.n), names: c.names, detail: 'Problem', run: () => setTimeout(() => listOf(c.k)) }));
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
      ${many('status').map(s => s.render())}
      <span class="counts" role="status">${tally.value.map((c, i) => html`${i ? html`<span class="muted">·</span>` : null}<button class=${'btn ghost ' + c.k} aria-expanded=${opened.value?.tab === c.k} data-tip=${c.tip ?? null}
        onPointerEnter=${c.k === 'blank' ? e => { const apart = App.blanksApart.peek(), n = apart.filter(b => b.ours).length, o = apart.length - n; e.currentTarget.dataset.tip = `Blank where it’s required.${n ? ` ${n} more aren’t required, listed apart.` : ''}${o ? ` ${o} not ours.` : ''}`; } : null}
        onClick=${() => listOf(c.k)}>${c.say(c.n)}</button>`)}</span>
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
    <${Toasts} /><${Tip} /><${Ringed} />`;

  // The shell's own actions and keys.
  const problems = () => needs().length > 0;
  [
    { id: 'find', name: 'Find', keys: '$mod+KeyK', inputs: true, run: () => { floats.peek().some(f => f.cls === 'findpal') ? closeAll() : find(); } },
    // What the title bar's Export does, for Find, by what it makes: a chart's slides or pages, the dates, and a table's
    // sheet, each with why not where it can't.
    ...[['pptx', 'PowerPoint'], ['pdf', 'PDF'], ['ics', 'Calendar']].map(([f, name]) => ({ id: 'export.' + f, name: `Export to ${name}`,
      enabled: () => typeof Export !== 'undefined' && (f === 'ics' || views.peek().some(v => v.layout === 'chart')), why: () => 'Add a chart view first', run: () => Export.open(f) })),
    { id: 'export.xlsx', name: 'Export to Excel', names: ['Excel', 'Spreadsheet', 'xlsx'], enabled: () => typeof Export !== 'undefined' && many('export').some(x => x.name === 'Excel'),
      why: () => 'Show a table first', run: () => Export.open('Excel') },
    // Printing is the PDF, as it would print: the browser would print the window.
    { id: 'print', name: 'Print', keys: '$mod+KeyP', inputs: true, enabled: () => typeof Export !== 'undefined', run: () => Export.open(current.peek()?.layout === 'chart' ? 'pdf' : undefined) },
    { id: 'keys', name: 'Keyboard shortcuts', keys: '[Shift]+?', run: () => find('?') },
    // With nothing to undo, Undo says so.
    { id: 'undo', name: 'Undo', keys: '$mod+KeyZ', enabled: () => !!part('undo'), run: () => part('undo').undo() },
    { id: 'redo', name: 'Redo', keys: '$mod+KeyY', enabled: () => !!part('undo'), run: () => part('undo').redo() },
    { id: 'back', name: 'Back', keys: 'Alt+ArrowLeft', run: back },
    { id: 'forward', name: 'Forward', keys: 'Alt+ArrowRight', run: forward },
    { id: 'view.prev', name: 'Previous view', keys: '$mod+Shift+PageUp', run: () => stepView(-1) },
    { id: 'view.next', name: 'Next view', keys: '$mod+Shift+PageDown', run: () => stepView(1) },
    // The day the chart is shown as of, as the title bar's date opens it.
    { id: 'asof', name: 'Show as of a day…', names: ['As of', 'Date', 'Go to date', 'Past', 'Keep', 'Keep a date', 'Keep this day', 'Freeze date'], enabled: () => !!part('time'), run: () => {
      const b = document.querySelector('.titlebar .asof > button');
      if (b) popover(b, close => html`<${part('time').When} close=${close} />`, { placement: 'bottom-end' });
    } },
    { id: 'chart.rename', name: 'Rename chart', enabled: () => !!part('workbook')?.current() && !App.readOnly.peek(), run: nameChart },
    { id: 'view.rename', name: 'Rename view', enabled: () => !!current.peek() && !App.readOnly.peek(), run: () => { editing.value = view.peek(); } },
    { id: 'panel', get name() { return away.peek() ? 'Show panel' : 'Hide panel'; }, keys: '$mod+Backslash', run: () => setShut(!away.peek()) },
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
    register, on, emit, keys, keyLabel, layer, drag, menu, popover, closeAll, dialog, confirm, toast, find, icon, iconMarkup, store, nameChart,
    widen, narrow, wide, gliding, showPanel, theme, setTheme, html, h, signal, computed, effect, parts: reg,
    problems: () => counts().map(c => ({ kind: c.k, said: c.say(c.n) })), listProblems: kind => listOf(kind),
    aside: c => { aside.value = c; },
  };
})();
