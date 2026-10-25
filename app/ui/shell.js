// The shell every page of the app shares: the sidebar, the page's top bar, the command palette, menus,
// dialogs and toasts, and the keys that work everywhere. A page loads the core, then this, then its own
// script, which starts the shell with what the page shows:
//   Shell.start({ area, title, crumbs, actions, render, after, commands, undo, keys })
// - area: the sidebar item that's current: 'home', 'chart', 'documents', 'calendar', 'history', 'schema',
//   'settings', or 'records' (with `kind` naming the kind, or a function giving it);
// - title: the page's title in the top bar; crumbs: links before it, [{ text, href }]; actions: markup
//   for the top bar's right. Each may be a function, worked out on every render;
// - render(): the page's content, as markup for <main>. A page that draws its own content (the chart)
//   leaves render out, and the shell moves the page's own markup into <main> instead;
// - after(): runs once the content is in place;
// - commands: what the page adds to the palette, [{ title, hint, keywords, run }], or a function giving them;
// - undo: false where the page handles the undo keys itself (the pages with the record panel);
// - keys: the page's own shortcuts, [[keys, what they do]], for the ? sheet.
// Clicks on an element with data-cmd run the handler registered under that name with Shell.on(name, fn),
// called with the element and the event. Everything the shell draws over the page (dialogs, the palette,
// menus, toasts) lives in #layer, so re-rendering the page leaves it be. `render()` re-renders the page; pages with more to draw define
// their own, calling Shell.render().

const Shell = (() => {
  const AREAS = [
    { id: 'home', name: 'Home', href: 'index.html', key: 'h' },
    { id: 'chart', name: 'Chart', href: 'chart.html', key: 'c' },
    { id: 'documents', name: 'Documents', href: 'documents.html', key: 'd' },
    { id: 'calendar', name: 'Calendar', href: 'calendar.html', key: 'a' },
    { id: 'history', name: 'History', href: 'history.html', key: 'y' },
  ];
  const FOOT_AREAS = [
    { id: 'schema', name: 'Schema', href: 'schema.html', key: 's' },
    { id: 'settings', name: 'Settings', href: 'settings.html', key: ',' },
  ];
  // The Documents area is the table of the Document kind, with the library beside it, so the kind isn't
  // listed again under Records.
  const DOCUMENT_KIND = 'Document';
  const RECENT_KEY = 'rboreal.recent';
  const MARK = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5.5" y="1.75" width="5" height="3.5" rx="1"/><rect x="1.5" y="10.75" width="5" height="3.5" rx="1"/><rect x="9.5" y="10.75" width="5" height="3.5" rx="1"/><path d="M8 5.25v2.75M4 10.75V8h8v2.75"/></svg>';
  const modKey = isMac ? '⌘' : 'Ctrl';

  let page = null;
  const handlers = {};
  const chartListeners = [], undoListeners = [];
  const layer = { palette: null, menu: null, toasts: [] };
  const dialogs = [];  // the dialogs open, the last on top
  let status = { text: 'Saved in this browser', tone: '' };

  const value = x => typeof x === 'function' ? x() : x;
  const typing = el => !!el?.closest?.('input, textarea, select, [contenteditable="true"]');

  // ---- Records, as the shell lists and finds them ----
  const recordHref = id => `record.html#${encodeURIComponent(id)}`;
  const kindHref = kind => `records.html#${encodeURIComponent(kind)}`;
  const recordKinds = () => kindsInState().filter(k => !same(k, DOCUMENT_KIND));
  // A line under an object's name: its kind, then its first choices' outputs, so that like-named entities
  // can be told apart (Entity · Limited Partnership · Delaware).
  function subtitleOf(id) {
    const choices = entriesOf(id).filter(k => isChoice(records[k])).slice(0, 2).map(k => records[k].choice);
    return [records[id].kind, ...choices].join(' · ');
  }
  function recent() {
    try { return (JSON.parse(localStorage.getItem(RECENT_KEY)) ?? []).filter(id => records[id] && isObject(records[id])); } catch { return []; }
  }
  // Remembers a record as just opened, for the palette's Recent list.
  function visited(id) {
    try { localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...recent().filter(x => x !== id)].slice(0, 8))); } catch {}
  }

  // ---- The sidebar ----
  const navItem = (a, current, count = '') =>
    `<a class="sb-item" href="${esc(a.href)}"${current ? ' aria-current="page"' : ''} title="${esc(a.name)} (G then ${a.key.toUpperCase()})">
      <span class="sb-item-text">${esc(a.name)}</span>${count}</a>`;

  function sidebarHtml() {
    const kind = page.area === 'records' ? value(page.kind) : null;
    const kinds = recordKinds().map(k => {
      const n = countOfKind(k);
      return navItem({ name: plural(k), href: kindHref(k), key: 'r' }, kind && same(kind, k), `<span class="sb-count">${n}</span>`);
    }).join('');
    const docs = countOfKind(DOCUMENT_KIND);
    return `
      <div class="sb-head">
        <button class="sb-workspace" data-cmd="shell.charts" aria-haspopup="menu" aria-expanded="${layer.menu?.id === 'charts'}" title="Charts in this workbook">
          <span class="sb-mark">${MARK}</span>
          <span class="sb-ws-text"><span class="sb-ws-app">Rboreal</span><span class="sb-ws-name">${esc(chartInUse().name)}</span></span>
          ${icon('chevron-down')}
        </button>
      </div>
      <button class="sb-search" data-cmd="shell.palette">${icon('search')}<span>Search</span><kbd>${modKey} K</kbd></button>
      <nav class="sb-nav" aria-label="Areas">
        ${AREAS.map(a => navItem(a, page.area === a.id, a.id === 'documents' && docs ? `<span class="sb-count">${docs}</span>` : '')).join('')}
        <div class="sb-group">Records</div>
        ${kinds || '<div class="sb-item faint">No records yet</div>'}
      </nav>
      <div class="sb-foot">
        ${FOOT_AREAS.map(a => navItem(a, page.area === a.id)).join('')}
        <a class="sb-status ${status.tone ? `is-${status.tone}` : ''}" href="settings.html#workbook" role="status" title="Where the workbook is kept">${esc(status.text)}</a>
        <button class="sb-user" data-cmd="shell.user" aria-haspopup="menu" aria-expanded="${layer.menu?.id === 'user'}">
          ${Parts.avatar(currentUser())}<span class="sb-item-text">${esc(currentUser())}</span>
        </button>
      </div>`;
  }

  function topbarHtml() {
    const crumbs = value(page.crumbs) ?? [];
    return `
      <button class="icon-btn" data-cmd="shell.sidebar" aria-label="Show or hide the sidebar" title="Show or hide the sidebar (${modKey}+\\)">${icon('layout-sidebar')}</button>
      <div class="tb-crumbs">${crumbs.map(c => `<a href="${esc(c.href)}">${esc(c.text)}</a>${icon('chevron-right')}`).join('')}</div>
      <h1 class="tb-title">${esc(value(page.title) ?? '')}</h1>
      <div class="tb-actions">${value(page.actions) ?? ''}</div>`;
  }

  // ---- When this browser can't keep the workbook ----
  // A problem with keeping the workbook here (model.js's storageProblem) is said at the top of every page
  // until it's resolved, with a way to keep a copy: a change that can't be kept mustn't look as if it was.
  const BANNERS = {
    unreadable: ['The workbook saved in this browser couldn’t be read, so the sample has opened in its place. The unreadable copy is kept aside; nothing has been lost.', 'Download the unreadable copy', 'unreadable'],
    'unreadable-unkept': ['The workbook saved in this browser couldn’t be read, and there’s no room to keep it aside, so nothing is being saved over it. Download it before changing anything.', 'Download it', 'unreadable'],
    unavailable: ['This browser isn’t letting Rboreal keep anything, so changes last only while this page is open. Keep the workbook in a file or a SharePoint library instead.', 'Download a copy', 'copy'],
    unsaved: ['Your latest changes couldn’t be saved: this browser’s storage is full. Download a copy, then keep the workbook in a file or a SharePoint library.', 'Download a copy', 'copy'],
  };
  const renderBanner = () => { const el = document.getElementById('banner'); if (el) el.innerHTML = bannerHtml(); };
  function bannerHtml() {
    const b = typeof storageProblem === 'string' && BANNERS[storageProblem];
    return b ? `<div class="banner is-danger" role="alert"><span class="banner-text">${esc(b[0])}</span>
      <button class="btn btn-sm" data-cmd="shell.download" data-what="${b[2]}">${esc(b[1])}</button>
      <a class="btn btn-sm btn-ghost" href="settings.html#workbook">Where it’s kept</a></div>` : '';
  }
  function downloadText(text, name) {
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([text], { type: 'application/json' })), download: name });
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  handlers['shell.download'] = el => {
    if (el.dataset.what === 'copy' && typeof Store !== 'undefined') return Store.exportWorkbook();
    let text = null;
    try { text = localStorage.getItem(UNREADABLE_KEY) ?? localStorage.getItem(WORKBOOK_KEY); } catch {}
    if (text) downloadText(text, 'Unreadable workbook.rboreal.json');
  };

  // ---- Rendering ----
  const renderSidebar = () => { document.getElementById('sidebar').innerHTML = sidebarHtml(); };
  function render() {
    renderSidebar();
    document.getElementById('topbar').innerHTML = topbarHtml();
    renderBanner();
    if (page.render) document.getElementById('main').innerHTML = page.render();
    const title = value(page.title);
    document.title = title && title !== 'Home' ? `${title} · Rboreal` : 'Rboreal';
    page.after?.();
    renderLayer();
  }

  function start(options) {
    page = { undo: true, ...options };
    initState();
    applyTheme();
    const own = [...document.body.childNodes].filter(n => !(n.nodeName === 'SCRIPT'));
    document.body.classList.add('app');
    document.body.insertAdjacentHTML('afterbegin', `
      <aside class="sidebar" id="sidebar" aria-label="Sidebar"></aside>
      <div class="page"><header class="topbar" id="topbar"></header><div id="banner"></div><main class="main" id="main"></main></div>
      <div id="layer"><div id="layer-dialogs"></div><div id="layer-top"></div></div>`);
    const main = document.getElementById('main');
    if (!page.render) for (const n of own) main.appendChild(n);
    render();
  }

  // ---- The layer: dialogs, and above them the palette, a menu and toasts ----
  // Each dialog has a place of its own in the layer, drawn only when it asks; the rest is drawn afresh.
  function renderLayer() {
    const el = document.getElementById('layer-top');
    if (!el) return;
    const keep = el.querySelector('.palette-input');
    if (layer.palette && keep) { drawPaletteList(); el.querySelector('.toasts').outerHTML = toastsHtml(); return; }
    el.innerHTML = [
      layer.palette ? `<div class="scrim" data-cmd="shell.dismiss"></div>${paletteHtml()}` : '',
      layer.menu ? menuHtml() : '',
      toastsHtml(),
    ].join('');
    if (layer.palette) { drawPaletteList(); el.querySelector('.palette-input').focus(); }
    if (layer.menu) placeMenu();
  }
  const closeLayer = () => { layer.palette = layer.menu = null; renderLayer(); };

  // ---- Command palette ----
  // Matching is by word starts, then anywhere, then initials ("GP" finds General Partner); every word of
  // the query has to match somewhere in the item's title, meta or keywords.
  function matchScore(text, word) {
    const t = norm(text);
    if (!word) return 1;
    if (t.startsWith(word)) return 4;
    const words = t.split(/[^a-z0-9%$§]+/).filter(Boolean);
    if (words.some(w => w.startsWith(word))) return 3;
    if (t.includes(word)) return 2;
    return words.map(w => w[0]).join('').startsWith(word) ? 1 : 0;
  }
  function score(item, query) {
    const words = norm(query).split(' ').filter(Boolean);
    const hay = [item.title, item.meta ?? '', item.keywords ?? ''].join(' ');
    let total = 0;
    for (const w of words) {
      const s = Math.max(matchScore(item.title, w) * 2, matchScore(hay, w));
      if (!s) return 0;
      total += s;
    }
    return total || 1;
  }

  function paletteGroups(query) {
    const go = [...AREAS, ...FOOT_AREAS].map(a => ({ title: `Go to ${a.name}`, meta: `G then ${a.key.toUpperCase()}`, keywords: a.name, run: () => { location.href = a.href; } }))
      .concat(recordKinds().map(k => ({ title: `Go to ${plural(k)}`, meta: 'Records', keywords: k, run: () => { location.href = kindHref(k); } })));
    const objects = Object.keys(records).filter(id => isObject(records[id]));
    const toItem = id => ({ title: objectName(id), meta: subtitleOf(id), keywords: records[id].kind, run: () => { visited(id); location.href = recordHref(id); } });
    const actions = [...(value(page.commands) ?? []), ...globalCommands()];
    if (!clean(query)) {
      const rec = recent().slice(0, 5).map(toItem);
      return [['Recent', rec], ['Actions', actions.slice(0, 6)], ['Go to', go.slice(0, AREAS.length + FOOT_AREAS.length)]];
    }
    const ranked = items => items.map(i => [i, score(i, query)]).filter(([, s]) => s).sort((a, b) => b[1] - a[1]).map(([i]) => i);
    return [['Records', ranked(objects.map(toItem)).slice(0, 8)], ['Actions', ranked(actions).slice(0, 6)], ['Go to', ranked(go).slice(0, 4)]];
  }

  function globalCommands() {
    const charts = workbook.charts.filter(c => c.id !== workbook.chartId)
      .map(c => ({ title: `Switch to ${c.name}`, meta: 'Chart', keywords: 'chart workbook switch', run: () => switchTo(c.id) }));
    return [
      { title: 'Undo', meta: `${modKey}+Z`, run: () => undoOrRedo(false) },
      { title: 'Redo', meta: isMac ? '⇧⌘Z' : 'Ctrl+Y', run: () => undoOrRedo(true) },
      ...charts,
      { title: 'New chart', keywords: 'workbook structure', run: newChart },
      { title: 'Rename this chart', keywords: 'workbook', run: renameThisChart },
      ...['system', 'light', 'dark'].map(t => ({ title: `Theme: ${t[0].toUpperCase()}${t.slice(1)}`, keywords: 'appearance dark mode', run: () => setTheme(t) })),
      { title: 'Show or hide the sidebar', meta: `${modKey}+\\`, run: toggleSidebar },
      { title: 'Keyboard shortcuts', meta: '?', keywords: 'keys help', run: showKeys },
    ];
  }

  function paletteHtml() {
    return `<div class="palette" role="dialog" aria-label="Search and commands">
      <div class="palette-input-row">${icon('search')}<input class="palette-input" value="${esc(layer.palette.query)}" placeholder="Search records, go to an area, or run a command…" aria-label="Search" autocomplete="off" spellcheck="false"></div>
      <div class="palette-list" role="listbox"></div>
      <div class="palette-foot"><span><kbd>↑</kbd><kbd>↓</kbd>to move</span><span><kbd>Enter</kbd>to open</span><span><kbd>Esc</kbd>to close</span></div>
    </div>`;
  }
  function drawPaletteList() {
    const list = document.querySelector('#layer .palette-list');
    if (!list) return;
    const groups = paletteGroups(layer.palette.query).filter(([, items]) => items.length);
    layer.palette.items = groups.flatMap(([, items]) => items);
    layer.palette.active = Math.min(layer.palette.active, Math.max(0, layer.palette.items.length - 1));
    let i = 0;
    list.innerHTML = groups.length ? groups.map(([name, items]) => `<div class="palette-group">${esc(name)}</div>` + items.map(item => {
      const n = i++;
      return `<div class="palette-item" role="option" data-cmd="shell.pick" data-index="${n}" aria-selected="${n === layer.palette.active}">
        <span class="palette-title">${esc(item.title)}</span>${item.meta ? `<span class="palette-meta">${esc(item.meta)}</span>` : ''}</div>`;
    }).join('')).join('') : `<div class="palette-empty">Nothing matches “${esc(layer.palette.query)}”.</div>`;
    list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }
  function openPalette() { layer.menu = null; layer.palette = { query: '', active: 0, items: [] }; renderLayer(); }
  function runPicked(index) {
    const item = layer.palette?.items[index];
    if (!item) return;
    layer.palette = null;
    renderLayer();
    item.run();
  }

  // ---- Menus ----
  // Shell.menu(anchor, items, id): a menu under the anchor. Items are { label, hint, run, checked,
  // disabled, danger }, { sep: true } or { head: 'text' }. Opening the same menu again closes it.
  function menu(anchor, items, id = 'menu') {
    layer.menu = layer.menu?.id === id ? null : { id, items, anchor: anchor.getBoundingClientRect() };
    renderLayer();
    renderSidebar();
  }
  function menuHtml() {
    const checks = layer.menu.items.some(i => 'checked' in i);
    return `<div class="pop menu float-menu" role="menu">${layer.menu.items.map((item, n) => item.sep ? '<div class="menu-sep"></div>'
      : item.head ? `<div class="menu-head">${esc(item.head)}</div>`
      : `<button class="menu-item${item.danger ? ' is-danger' : ''}" role="${'checked' in item ? 'menuitemradio' : 'menuitem'}"${'checked' in item ? ` aria-checked="${!!item.checked}"` : ''} data-cmd="shell.menu-pick" data-index="${n}"${item.disabled ? ' disabled' : ''}>
          ${checks ? `<span class="menu-check">${item.checked ? icon('check') : ''}</span>` : ''}<span class="menu-text">${esc(item.label)}</span>${item.hint ? `<span class="menu-hint">${esc(item.hint)}</span>` : ''}</button>`).join('')}</div>`;
  }
  function placeMenu() {
    const el = document.querySelector('#layer .float-menu');
    const a = layer.menu.anchor;
    const w = el.offsetWidth, h = el.offsetHeight;
    const left = Math.max(8, Math.min(a.left, innerWidth - w - 8));
    const below = a.bottom + 4 + h <= innerHeight - 8;
    el.style.left = `${left}px`;
    el.style.top = `${below ? a.bottom + 4 : Math.max(8, a.top - h - 4)}px`;
    el.querySelector('.menu-item:not(:disabled)')?.focus({ preventScroll: true });
  }

  // ---- Dialogs ----
  // Shell.dialog({ title, render, width, className, onOpen, onDraw, keys, onClose }) opens a dialog over the
  // page, above any already open, and returns it: { el, redraw(options), close() }.
  // - render(): the dialog's markup, from the page's state, inside its frame: .dialog-title, .dialog-body and
  //   .dialog-actions, or parts of its own. title names it (for screen readers); it, and className, may be
  //   functions, worked out at each drawing. width is in pixels, within the window;
  // - redraw() draws it again from the state, in place: it doesn't animate in again, and what had the focus
  //   keeps it, caret and all, as its lists keep their place. redraw({ fresh: true }) starts it afresh, as for
  //   another step: lists from the top, and the focus on its first control (see onOpen);
  // - onOpen(el) runs once it's first drawn, to put the focus; by default the focus goes to
  //   [data-autofocus], else [data-default], else the first control. onDraw(el) runs after every drawing;
  // - keys(e): its own keys, before the shell's; preventDefault() keeps the shell from acting on one;
  // - onClose() runs once it's closed, however that was: Esc, a click beside it, or close().
  // While a dialog is open it has the keyboard: Esc closes it, Tab keeps to it, and no key reaches the page
  // or the shell's shortcuts. A menu opened from it, or a dialog over it, has the keys in its turn. Closed,
  // it gives the focus back to where it was.
  const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])';
  function dialog(options) {
    layer.palette = layer.menu = null;
    renderLayer();
    const host = document.createElement('div');
    host.className = 'dialog-layer';
    host.innerHTML = '<div class="scrim" data-cmd="shell.dialog-dismiss"></div><div class="dialog" role="dialog" aria-modal="true"></div>';
    const d = { ...options, host, el: host.lastElementChild, back: document.activeElement };
    if (options.width) d.el.style.width = `min(${options.width}px, calc(100vw - 32px))`;
    document.getElementById('layer-dialogs').appendChild(host);
    dialogs.push(d);
    d.handle = { el: d.el, redraw: o => drawDialog(d, o), close: () => closeDialog(d) };
    drawDialog(d, { fresh: true, open: true });
    return d.handle;
  }
  const topDialog = () => dialogs.at(-1);
  const dialogOf = el => dialogs.find(d => d.el.contains(el));
  const focusFirst = el => (el.querySelector('[data-autofocus]') ?? el.querySelector('[data-default]') ?? el.querySelector(FOCUSABLE))?.focus();
  // A control, or a list, as a selector, to find it again once the dialog's drawn anew: by its id, or else
  // its data attributes, name and type; a list by its classes.
  function controlKey(x) {
    if (x.id) return `#${CSS.escape(x.id)}`;
    const attrs = [...x.attributes].filter(a => a.name.startsWith('data-') || a.name === 'name' || a.name === 'type').map(a => `[${a.name}="${CSS.escape(a.value)}"]`).join('');
    return attrs && x.tagName.toLowerCase() + attrs;
  }
  const listKey = x => x.tagName.toLowerCase() + [...x.classList].map(c => `.${CSS.escape(c)}`).join('');
  function drawDialog(d, { fresh = false, open = false } = {}) {
    if (!dialogs.includes(d)) return;
    const el = d.el, top = d === topDialog();
    const was = document.activeElement;
    const focus = !fresh && el.contains(was) ? controlKey(was) : null;
    let caret = null;
    try { if (focus && typeof was.selectionStart === 'number') caret = [was.selectionStart, was.selectionEnd]; } catch {}
    const lists = fresh ? [] : [...el.querySelectorAll('div, section, ol, ul, nav')].filter(x => x.scrollTop > 0).map(x => [listKey(x), x.scrollTop]);
    el.className = `dialog${d.className ? ` ${value(d.className)}` : ''}`;
    el.setAttribute('aria-label', value(d.title) ?? '');
    el.innerHTML = d.render();
    for (const [key, y] of lists) { const x = el.querySelector(key); if (x) x.scrollTop = y; }
    if (top) {
      const again = focus && el.querySelector(focus);
      if (again) { again.focus({ preventScroll: true }); if (caret) try { again.setSelectionRange(...caret); } catch {} }
      else if (open) (d.onOpen ?? focusFirst)(el);
      else if (fresh || !el.contains(document.activeElement)) focusFirst(el);
    }
    d.onDraw?.(el);
  }
  function closeDialog(d) {
    const i = dialogs.indexOf(d);
    if (i < 0) return;
    dialogs.splice(i, 1);
    d.host.remove();
    if (d.back?.isConnected) d.back.focus({ preventScroll: true });
    else if (topDialog()) focusFirst(topDialog().el);
    d.onClose?.();
  }
  // Keeps Tab within the dialog on top, going round from its last control to its first.
  function trapTab(e, el) {
    const items = [...el.querySelectorAll(FOCUSABLE)].filter(x => x.getClientRects().length);
    if (!items.length) return;
    const at = items.indexOf(document.activeElement);
    const next = e.shiftKey ? (at <= 0 ? items.length - 1 : at - 1) : (at < 0 || at === items.length - 1 ? 0 : at + 1);
    e.preventDefault();
    items[next].focus();
  }

  // Shell.confirm({ title, body, confirm, danger }) and Shell.prompt({ title, body, value, placeholder,
  // confirm }) ask in a dialog, and resolve with the answer: true or false, or the text (null if cancelled).
  // `html` stands in for a body of markup.
  function ask(options) {
    return new Promise(resolve => {
      let answer = null;
      const ok = () => {
        answer = options.kind === 'prompt' ? d.el.querySelector('.dialog-input').value : true;
        d.close();
      };
      const d = dialog({
        title: options.title, width: options.wide ? 640 : null, render: () => askHtml(options), ok,
        onOpen: el => { const input = el.querySelector('.dialog-input'); if (input) { input.focus(); input.select(); } else focusFirst(el); },
        keys: e => { if (e.key === 'Enter' && !e.target.matches('button')) { e.preventDefault(); ok(); } },
        onClose: () => resolve(answer),
      });
    });
  }
  const confirm = d => ask({ ...d, kind: 'confirm' }).then(x => x === true);
  const prompt = d => ask({ ...d, kind: 'prompt' });
  function askHtml(d) {
    const body = d.html ?? (d.body ? esc(d.body) : '');
    return `<h2 class="dialog-title">${esc(d.title)}</h2>
      ${body ? `<div class="dialog-body">${body}</div>` : ''}
      ${d.kind === 'prompt' ? `<input class="input dialog-input" value="${esc(d.value ?? '')}" placeholder="${esc(d.placeholder ?? '')}" aria-label="${esc(d.title)}" autocomplete="off" spellcheck="false">` : ''}
      <div class="dialog-actions">
        ${d.kind === 'info' ? '' : '<button class="btn" data-cmd="shell.dialog-cancel">Cancel</button>'}
        <button class="btn ${d.danger ? 'btn-danger' : 'btn-primary'}" data-cmd="shell.dialog-ok" data-default>${esc(d.confirm ?? (d.kind === 'info' ? 'Done' : 'OK'))}</button>
      </div>`;
  }

  // ---- Toasts ----
  // Shell.toast(text, { action: { label, run }, undo, tone }): a note confirming what was just done, with
  // Undo if `undo`. It goes after a few seconds, longer with an action, and waits while hovered.
  let toastId = 0;
  function toast(text, { action = null, undo = false, tone = '' } = {}) {
    if (undo) action = { label: 'Undo', run: () => undoOrRedo(false) };
    const t = { id: ++toastId, text, action, tone };
    layer.toasts = [...layer.toasts.slice(-2), t];
    schedule(t, action ? 8000 : 4000);
    renderLayer();
  }
  function schedule(t, ms) {
    clearTimeout(t.timer);
    t.timer = setTimeout(() => {
      if (document.querySelector(`#layer .toast[data-id="${t.id}"]:hover`)) return schedule(t, 1500);
      dropToast(t.id);
    }, ms);
  }
  const dropToast = id => { layer.toasts = layer.toasts.filter(x => x.id !== id); renderLayer(); };
  const toastsHtml = () => `<div class="toasts" aria-live="polite">${layer.toasts.map(t => `
    <div class="toast${t.tone ? ` is-${t.tone}` : ''}" data-id="${t.id}"><span class="toast-text">${esc(t.text)}</span>
      ${t.action ? `<button class="toast-action" data-cmd="shell.toast-action" data-id="${t.id}">${esc(t.action.label)}</button>` : ''}
      <button class="toast-close" data-cmd="shell.toast-close" data-id="${t.id}" aria-label="Dismiss">${icon('x')}</button></div>`).join('')}</div>`;

  // ---- Charts in the workbook ----
  function chartChanged() {
    history.replaceState(null, '', location.pathname + location.search);
    for (const fn of chartListeners) fn();
    render();
  }
  function switchTo(id) { switchChart(id); chartChanged(); toast(`Switched to ${chartInUse().name}`); }
  async function newChart() {
    const name = await prompt({ title: 'New chart', body: 'A chart starts empty and shares nothing with the others.', placeholder: 'Name', confirm: 'Create' });
    if (name === null) return;
    addChart(clean(name) || freeChartName('New chart'));
    chartChanged();
    toast(`Created ${chartInUse().name}`);
  }
  async function renameThisChart() {
    const name = await prompt({ title: 'Rename this chart', value: chartInUse().name, confirm: 'Rename' });
    if (name === null || !clean(name)) return;
    renameChart(workbook.chartId, name);
    render();
  }
  async function deleteThisChart() {
    const name = chartInUse().name;
    if (!await confirm({ title: `Delete ${name}?`, body: 'Its records, views and history go with it. It can be restored from this menu.', confirm: 'Delete chart', danger: true })) return;
    const error = deleteChart(workbook.chartId);
    if (error) return toast(error, { tone: 'error' });
    chartChanged();
    toast(`Deleted ${name}`, { action: { label: 'Restore', run: () => { const c = workbook.deleted.find(x => x.name === name); if (c) { restoreChart(c.id); chartChanged(); } } } });
  }
  function chartsMenu(anchor) {
    const others = workbook.charts.filter(c => c.id !== workbook.chartId);
    menu(anchor, [
      { head: 'Charts in this workbook' },
      ...workbook.charts.map(c => ({ label: c.name, checked: c.id === workbook.chartId, run: () => c.id !== workbook.chartId && switchTo(c.id) })),
      { sep: true },
      { label: 'New chart…', run: newChart },
      { label: 'Duplicate this chart', run: () => { duplicateChart(workbook.chartId); chartChanged(); toast(`Created ${chartInUse().name}`); } },
      { label: 'Rename this chart…', run: renameThisChart },
      { label: 'Delete this chart…', danger: true, disabled: workbook.charts.length < 2, run: deleteThisChart },
      ...(others.length ? [{ sep: true }, { head: 'Copy definitions from' }, ...others.map(c => ({ label: c.name, run: () => {
        const error = copyDefinitionsFrom(c.id);
        error ? toast(error, { tone: 'error' }) : (render(), toast(`Copied definitions from ${c.name}`, { undo: true }));
      } }))] : []),
      ...(workbook.deleted.length ? [{ sep: true }, { head: 'Deleted' }, ...workbook.deleted.map(c => ({ label: `Restore ${c.name}`, run: () => { restoreChart(c.id); chartChanged(); } }))] : []),
    ], 'charts');
  }

  // ---- You, and the theme ----
  function setTheme(theme) { prefs.theme = theme; savePrefs(); applyTheme(); render(); }
  function userMenu(anchor) {
    menu(anchor, [
      { head: currentUser() === 'You' ? 'Changes are recorded as yours' : `Signed in as ${currentUser()}` },
      { label: 'Your name…', run: setName },
      { label: 'Settings', run: () => { location.href = 'settings.html'; } },
      { sep: true }, { head: 'Theme' },
      ...[['system', 'System'], ['light', 'Light'], ['dark', 'Dark']].map(([t, label]) => ({ label, checked: (prefs.theme ?? 'system') === t, run: () => setTheme(t) })),
      { sep: true },
      { label: 'Keyboard shortcuts', hint: '?', run: showKeys },
    ], 'user');
  }
  async function setName() {
    const name = await prompt({ title: 'Your name', body: 'The history records each change under the name of whoever made it.', value: currentUser() === 'You' ? '' : currentUser(), placeholder: 'Your name', confirm: 'Save' });
    if (name === null) return;
    setCurrentUser(name);
    render();
  }
  function toggleSidebar() {
    prefs.sidebar = document.documentElement.dataset.sidebar === 'hidden';
    savePrefs();
    applySidebar();
  }
  function applySidebar() {
    if (prefs.sidebar === false) document.documentElement.dataset.sidebar = 'hidden';
    else delete document.documentElement.dataset.sidebar;
  }

  function showKeys() {
    const keys = [[`${modKey}+K`, 'Search and commands'], ['G then H, C, D, A, Y, R or S', 'Go to an area'], [`${modKey}+Z`, 'Undo'],
      [isMac ? '⇧⌘Z' : 'Ctrl+Y', 'Redo'], [`${modKey}+\\`, 'Show or hide the sidebar'], ['?', 'These shortcuts'], ['Esc', 'Close']];
    keys.push(...(page.keys ?? []));
    ask({ kind: 'info', title: 'Keyboard shortcuts', html: `<dl class="keys">${keys.map(([k, what]) => `<dt>${esc(what)}</dt><dd><kbd>${esc(k)}</kbd></dd>`).join('')}</dl>` });
  }

  // ---- Undo ----
  // The toast says what was taken back or put back, as the history records it ("Undid “Deleted …”").
  function undoOrRedo(redo) {
    const last = historyLog[0];
    if (!(redo ? redoState() : undoState())) return toast(redo ? 'Nothing to redo' : 'Nothing to undo');
    for (const fn of undoListeners) fn();
    render();
    toast(historyLog[0] !== last ? historyLog[0].summary : redo ? 'Redone' : 'Undone',redo ? {} : { action: { label: 'Redo', run: () => undoOrRedo(true) } });
  }

  // ---- Events ----
  Object.assign(handlers, {
    'shell.palette': openPalette,
    'shell.pick': el => runPicked(Number(el.dataset.index)),
    'shell.dismiss': closeLayer,
    'shell.charts': el => chartsMenu(el),
    'shell.user': el => userMenu(el),
    'shell.sidebar': toggleSidebar,
    'shell.menu-pick': el => { const item = layer.menu.items[Number(el.dataset.index)]; layer.menu = null; renderLayer(); renderSidebar(); item.run(); },
    'shell.dialog-ok': el => dialogOf(el)?.ok(),
    'shell.dialog-cancel': el => { const d = dialogOf(el); if (d) closeDialog(d); },
    'shell.dialog-dismiss': () => closeDialog(topDialog()),
    'shell.toast-action': el => { const t = layer.toasts.find(x => x.id === Number(el.dataset.id)); dropToast(t.id); t.action.run(); },
    'shell.toast-close': el => dropToast(Number(el.dataset.id)),
  });
  const on = (name, fn) => { handlers[name] = fn; };

  document.addEventListener('click', e => {
    const el = e.target.closest?.('[data-cmd]');
    if (layer.menu && !e.target.closest?.('.float-menu') && el?.dataset.cmd !== 'shell.charts' && el?.dataset.cmd !== 'shell.user') {
      layer.menu = null;
      renderLayer();
      renderSidebar();
      if (!el) return;
    }
    if (!el || el.disabled) return;
    const fn = handlers[el.dataset.cmd];
    if (fn) { e.preventDefault(); fn(el, e); }
  });
  document.addEventListener('input', e => {
    if (!e.target.matches('.palette-input')) return;
    layer.palette.query = e.target.value;
    layer.palette.active = 0;
    drawPaletteList();
  });
  document.addEventListener('mousemove', e => {
    const item = e.target.closest?.('.palette-item');
    if (!item || Number(item.dataset.index) === layer.palette?.active) return;
    layer.palette.active = Number(item.dataset.index);
    for (const x of document.querySelectorAll('#layer .palette-item')) x.setAttribute('aria-selected', x === item);
  });

  function menuKeys(e) {
    const items = [...document.querySelectorAll('#layer .float-menu .menu-item:not(:disabled)')];
    const at = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); items[(at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus(); }
    if (e.key === 'Escape') { e.preventDefault(); closeLayer(); renderSidebar(); }
  }

  // A dialog has the keys before anything else hears them, and they go no further: to its own handler
  // first, then Esc closes it and Tab keeps to it. A menu opened over it has them first.
  window.addEventListener('keydown', e => {
    const d = topDialog();
    if (!d) return;
    e.stopPropagation();
    if (layer.menu) return menuKeys(e);
    d.keys?.(e);
    if (e.defaultPrevented) return;
    if (e.key === 'Escape') { e.preventDefault(); closeDialog(d); }
    else if (e.key === 'Tab') trapTab(e, d.el);
  }, true);

  let goPending = 0;
  document.addEventListener('keydown', e => {
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (mod && key === 'k') { e.preventDefault(); return layer.palette ? closeLayer() : openPalette(); }
    if (mod && e.key === '\\') { e.preventDefault(); return toggleSidebar(); }
    if (layer.palette) {
      const n = layer.palette.items.length;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        layer.palette.active = (layer.palette.active + (e.key === 'ArrowDown' ? 1 : -1) + n) % Math.max(n, 1);
        drawPaletteList();
      }
      if (e.key === 'Enter') { e.preventDefault(); runPicked(layer.palette.active); }
      if (e.key === 'Escape') { e.preventDefault(); closeLayer(); }
      return;
    }
    if (layer.menu) return menuKeys(e);
    if (typing(e.target) || e.altKey) return;
    if (mod && (key === 'z' || key === 'y') && page?.undo) { e.preventDefault(); return undoOrRedo(key === 'y' || e.shiftKey); }
    if (mod) return;
    if (e.key === '?') { e.preventDefault(); return showKeys(); }
    if (e.key === '/') { e.preventDefault(); return openPalette(); }
    if (key === 'g') { goPending = Date.now(); return; }
    if (goPending && Date.now() - goPending < 1200) {
      goPending = 0;
      const area = [...AREAS, ...FOOT_AREAS].find(a => a.key === key);
      if (area) { e.preventDefault(); location.href = area.href; }
      else if (key === 'r') { e.preventDefault(); location.href = kindHref(recordKinds()[0] ?? 'Entity'); }
    }
  });

  // Another tab changed the workbook: take its state, which is now the saved one, and start undo afresh.
  // While you're typing here, it waits until you're done, so what you're typing isn't swept away.
  let otherTab = false;
  function takeOtherTab() {
    otherTab = false;
    initState();
    undoStack.length = redoStack.length = 0;
    undoByChart.clear();
    for (const fn of chartListeners) fn();
    if (typeof window.render === 'function') window.render(); else render();
  }
  window.addEventListener('storage', e => {
    if (e.key !== WORKBOOK_KEY || !page) return;
    if (typing(document.activeElement)) otherTab = true; else takeOtherTab();
  });
  document.addEventListener('focusout', () => { if (otherTab) setTimeout(() => { if (otherTab && !typing(document.activeElement)) takeOtherTab(); }); });

  applySidebar();

  return {
    start, render, on, menu, dialog, confirm, prompt, toast, visited, recent, recordHref, kindHref, subtitleOf, DOCUMENT_KIND,
    // Says where the workbook is saved, and how that's going: tone '', 'busy' or 'error'.
    setStatus(text, tone = '') { status = { text, tone }; if (page) { renderSidebar(); renderBanner(); } },
    // Runs when the workbook switches to another chart, or another tab changes it, so a page can let go
    // of what it held about the old one.
    onChartChange(fn) { chartListeners.push(fn); },
    // Runs after an undo or redo the shell makes (from a toast, the palette or the keys), so a page can let
    // go of a form or selection the step made stale.
    onUndo(fn) { undoListeners.push(fn); },
    undoOrRedo,
    get page() { return page; },
  };
})();

function render() { Shell.render(); }
