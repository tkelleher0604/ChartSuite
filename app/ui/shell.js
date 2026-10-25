// The shell every page of the app shares: the sidebar, the page's top bar, the command palette, menus,
// dialogs and toasts, and the keys that work everywhere. A page loads the core, then this, then its own
// script, which starts the shell with what the page shows:
//   Shell.start({ area, title, crumbs, actions, create, render, after, commands, undo, keys })
// - area: the sidebar item that's current: 'home', 'chart', 'documents', 'calendar', 'history', 'schema',
//   'settings', or 'records' (with `kind` naming the kind, or a function giving it);
// - title: the page's title in the top bar, shown there once the page's own heading (its .page-title) has
//   scrolled away; crumbs: links before it, [{ text, href }]; actions: markup for the top bar's right;
//   create: the page's create action, { label, cmd, title, disabled }, drawn last there as the primary
//   button and offered in the palette. Each may be a function, worked out on every render;
// - render(): the page's content, as markup for <main>. A page that draws its own content (the chart)
//   leaves render out, and the shell moves the page's own markup into <main> instead;
// - after(): runs once the content is in place;
// - commands: what the page adds to the palette, [{ title, hint, keywords, run }], or a function giving them;
// - undo: false where the page handles the undo keys itself (the pages with the record panel);
// - keys: the page's own shortcuts, [[keys, what they do]], for the ? sheet: keys as pressed (Shift+1, G then A).
// The shell's keys come after the page's: a key the page has used (preventDefault) is left to it. An
// address with ?do=<handler> runs that handler once the page is drawn, as the palette asks from elsewhere.
// Clicks on an element with data-cmd run the handler registered under that name with Shell.on(name, fn),
// called with the element and the event. Everything the shell draws over the page (dialogs, the palette,
// menus, toasts) lives in #layer, so re-rendering the page leaves it be. `render()` re-renders the page; pages with more to draw define
// their own, calling Shell.render().

const Shell = (() => {
  const AREAS = [
    { id: 'home', name: 'Home', href: 'index.html', key: 'h', words: 'dashboard attention missing overdue' },
    { id: 'chart', name: 'Chart', href: 'chart.html', key: 'c', words: 'structure diagram org slide' },
    { id: 'documents', name: 'Documents', href: 'documents.html', key: 'd', words: 'docs files sharepoint library dms agreements' },
    { id: 'calendar', name: 'Calendar', href: 'calendar.html', key: 'a', words: 'deadlines due dates overdue filings agenda' },
    { id: 'history', name: 'History', href: 'history.html', key: 'y', words: 'changes audit log who when' },
  ];
  const FOOT_AREAS = [
    { id: 'schema', name: 'Schema', href: 'schema.html', key: 's', words: 'definitions formulas vocabulary fields' },
    { id: 'settings', name: 'Settings', href: 'settings.html', key: ',', words: 'preferences storage saving sharepoint name theme' },
  ];
  // The Documents area is the table of the Document kind, with the library beside it, so the kind isn't
  // listed again under Records.
  const DOCUMENT_KIND = Documents.KIND;
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
    const create = value(page.create);
    return `
      <button class="icon-btn" data-cmd="shell.sidebar" aria-label="Show or hide the sidebar" title="Show or hide the sidebar (${modKey}+\\)">${icon('layout-sidebar')}</button>
      <div class="tb-crumbs">${crumbs.map(c => `<a href="${esc(c.href)}">${esc(c.text)}</a>${icon('chevron-right')}`).join('')}</div>
      <h1 class="tb-title">${esc(value(page.title) ?? '')}</h1>
      <div class="tb-actions">${value(page.actions) ?? ''}${create ? `<button class="btn btn-sm btn-primary" data-cmd="${esc(create.cmd)}"${create.title ? ` title="${esc(create.title)}"` : ''}${create.disabled ? ' disabled' : ''}>${icon('plus')}${esc(create.label)}</button>` : ''}</div>`;
  }

  // The page names itself once: its title is in the top bar only while its own heading (main's
  // .page-title) is out of view, or for good where it has none, as the chart has.
  let headingWatch = null;
  function watchHeading() {
    const bar = document.getElementById('topbar'), heading = document.querySelector('#main .page-title');
    headingWatch?.disconnect();
    if (!heading) return bar.classList.add('show-title');
    headingWatch = new IntersectionObserver(([e]) => bar.classList.toggle('show-title', !e.isIntersecting), { root: document.getElementById('main') });
    headingWatch.observe(heading);
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
    watchHeading();
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
    // ?do=<handler> in the address is an action asked for on another page (actionsElsewhere): it's taken out
    // of the address, so going back or reloading doesn't do it again, and run once the page is in place,
    // after the welcome if that's asked first.
    const arrival = new URLSearchParams(location.search).get('do');
    if (arrival) history.replaceState(history.state, '', location.pathname + location.hash);
    render();
    const ready = () => setTimeout(async () => { await welcome(); if (arrival) runCommand(arrival); });
    if (document.readyState === 'complete') ready(); else addEventListener('load', ready, { once: true });
  }

  // ---- The layer: dialogs, and above them the palette, a menu and toasts ----
  // Each dialog has a place of its own in the layer, drawn only when it asks; the rest is drawn afresh.
  function renderLayer() {
    const el = document.getElementById('layer-top');
    if (!el) return;
    const keep = el.querySelector('.palette-input');
    if (layer.palette && keep) { drawPaletteList(); el.querySelector('.toasts').outerHTML = toastsHtml(); return; }
    // An open menu is drawn again in place, keeping what's typed in its search, and its focus.
    if (layer.menu && el.querySelector(`.float-menu[data-menu="${layer.menu.n}"]`)) { redrawMenu(); el.querySelector('.toasts').outerHTML = toastsHtml(); return; }
    el.innerHTML = [
      layer.palette ? `<div class="scrim" data-cmd="shell.dismiss"></div>${paletteHtml()}` : '',
      layer.menu ? menuHtml() : '',
      toastsHtml(),
    ].join('');
    if (layer.palette) { drawPaletteList(); el.querySelector('.palette-input').focus(); }
    if (layer.menu) placeMenu();
  }
  const closeLayer = () => { layer.palette = null; dropMenu(); renderLayer(); };

  // ---- Command palette ----
  // Matching is common.js's matchRank: exact first, then starts, words, anywhere and initials ("GP" finds
  // General Partner); every word of the query has to match somewhere. An item's title counts double; each of
  // its other texts (its meta, and keywords: a record's kind and the text it holds) counts on its own, so an
  // exact match to any of them (a Short Name) comes first, and all of them together count too.
  const score = (item, query) => {
    const texts = [item.meta ?? '', ...[].concat(item.keywords ?? [])];
    return Math.max(matchRank(item.title, query) * 2, ...texts.map(t => matchRank(t, query)), matchRank([item.title, ...texts].join(' '), query));
  };
  // What a record holds that someone might look it up by: its kind, and the text of its entries (a Short
  // Name, an EIN, a file number).
  const keywordsOf = id => [records[id].kind, ...entriesOf(id).filter(k => isField(records[k]) && records[k].field === 'text').map(k => records[k].value)];

  function paletteGroups(query) {
    const go = [...AREAS, ...FOOT_AREAS].map(a => ({ title: `Go to ${a.name}`, meta: `G then ${a.key.toUpperCase()}`, keywords: `${a.name} ${a.words}`, run: () => { location.href = a.href; } }))
      .concat(recordKinds().map(k => ({ title: `Go to ${plural(k)}`, meta: 'Records', keywords: `${k} ${same(k, 'Individual') ? 'people persons' : ''}`, run: () => { location.href = kindHref(k); } })));
    const objects = Object.keys(records).filter(id => isObject(records[id]));
    const toItem = id => ({ title: objectName(id), meta: subtitleOf(id), keywords: keywordsOf(id), run: () => { visited(id); location.href = recordHref(id); } });
    const actions = [...pageCommands(), ...actionsElsewhere(), ...globalCommands()];
    if (!clean(query)) {
      const rec = recent().slice(0, 5).map(toItem);
      return [['Recent', rec], ['Actions', actions.slice(0, 6)], ['Go to', go.slice(0, AREAS.length + FOOT_AREAS.length)]];
    }
    const ranked = items => items.map(i => [i, score(i, query)]).filter(([, s]) => s).sort((a, b) => b[1] - a[1]).map(([i]) => i);
    // Documents are listed apart, after the entities and people they concern.
    const isDoc = id => same(records[id].kind, DOCUMENT_KIND);
    return [['Records', ranked(objects.filter(id => !isDoc(id)).map(toItem)).slice(0, 8)], ['Actions', ranked(actions).slice(0, 6)],
      ['Go to', ranked(go).slice(0, 4)], ['Documents', ranked(objects.filter(isDoc).map(toItem)).slice(0, 5)]];
  }

  // What the page offers: its create action, then its own commands.
  function pageCommands() {
    const create = value(page.create);
    return [...(create && !create.disabled ? [{ title: create.label, keywords: 'new add create', run: () => runCommand(create.cmd) }] : []), ...(value(page.commands) ?? [])];
  }

  // ---- What can be done from any page ----
  // The actions people reach for wherever they are, each done on the page it belongs to, by that page's
  // handler (`cmd`). From another page the palette goes there with ?do=<cmd> in the address, and the shell
  // runs the handler once the page is drawn (see start); on its own page, the page offers it itself.
  const areaOf = id => [...AREAS, ...FOOT_AREAS].find(a => a.id === id);
  function actionsElsewhere() {
    return [
      { title: 'Export the chart…', area: 'chart', cmd: 'chart.export', keywords: 'pdf powerpoint pptx svg download deck print' },
      { title: 'Present the chart', area: 'chart', cmd: 'chart.present', keywords: 'full screen slideshow meeting' },
      { title: 'Link document', area: 'documents', cmd: 'docs.link', keywords: 'add file sharepoint library' },
      ...recordKinds().map(k => ({ title: `New ${k.toLowerCase()}`, area: 'records', kind: k, cmd: 'records.new', keywords: `add create ${plural(k)}` })),
      { title: 'Show overdue deadlines', area: 'calendar', cmd: 'cal.overdue', keywords: 'late past due dates deadlines filings' },
      { title: 'Show what’s missing', area: 'home', cmd: 'home.missing', keywords: 'required blank empty attention needs' },
    ].filter(a => !(a.area === page.area && (!a.kind || same(a.kind, value(page.kind) ?? '')))).map(a => {
      const [file, hash] = (a.kind ? kindHref(a.kind) : areaOf(a.area).href).split('#');
      return { title: a.title, meta: a.kind ? 'Records' : areaOf(a.area).name, keywords: a.keywords, run: () => { location.href = `${file}?do=${encodeURIComponent(a.cmd)}${hash ? `#${hash}` : ''}`; } };
    });
  }
  // Runs a page's handler by its name, as a click on the page's control for it would (a disabled control
  // does nothing), or with no control where the page shows none, as for an action arriving from elsewhere.
  function runCommand(cmd) {
    const el = [...document.querySelectorAll('[data-cmd]')].find(x => x.dataset.cmd === cmd && !x.closest('#layer') && x.getClientRects().length);
    if (el) return el.disabled || el.click();
    handlers[cmd]?.(null, null);
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

  // A title with what the query matched in it in bold: each word of the query where a word of the title
  // starts with it, or else where it first appears. What matched elsewhere (initials, an item's other
  // texts) isn't marked.
  function marked(title, query) {
    const lower = title.toLowerCase(), spans = [];
    for (const w of clean(query).toLowerCase().split(' ').filter(Boolean)) {
      let at = -1;
      for (let i = lower.indexOf(w); i >= 0; i = lower.indexOf(w, i + 1)) {
        if (spans.some(([a, b]) => i < b && i + w.length > a)) continue;
        if (i === 0 || !/[\p{L}\p{N}]/u.test(lower[i - 1])) { at = i; break; }
        if (at < 0) at = i;
      }
      if (at >= 0) spans.push([at, at + w.length]);
    }
    let out = '', pos = 0;
    for (const [a, b] of spans.sort((x, y) => x[0] - y[0])) { out += `${esc(title.slice(pos, a))}<b>${esc(title.slice(a, b))}</b>`; pos = b; }
    return out + esc(title.slice(pos));
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
        <span class="palette-title">${marked(item.title, layer.palette.query)}</span>${item.meta ? `<span class="palette-meta">${esc(item.meta)}</span>` : ''}</div>`;
    }).join('')).join('') : `<div class="palette-empty">Nothing matches “${esc(layer.palette.query)}”.</div>`;
    list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }
  function openPalette() { dropMenu(); layer.palette = { query: '', active: 0, items: [] }; renderLayer(); }
  function runPicked(index) {
    const item = layer.palette?.items[index];
    if (!item) return;
    layer.palette = null;
    renderLayer();
    item.run();
  }

  // ---- Menus ----
  // Shell.menu(anchor, items, id, { search, onClose }): a menu under the anchor. Opening the same menu again
  // closes it. Items are { label, desc, hint, run, checked, ticked, keep, disabled, danger }, { sep: true },
  // { head: 'text' }, { note: 'text' }, or { label, select: [[value, text]], value, run(value) }:
  // - checked marks the one chosen of several, with a check; ticked, one of several that can be chosen
  //   together, with a tick box. desc is a line under the label; hint, a note at its end, like a count;
  // - picking a ticked item, or one marked keep, or changing a select, leaves the menu open: it's drawn again
  //   from `items`, which may be a function for that, given what's typed in its search. Anything else closes
  //   it, then runs;
  // - search: a box at its top, with this placeholder, that narrows what `items` lists as it's typed in.
  //   The arrow keys move through the list, and Enter picks;
  // - onClose(): runs when it closes, however it does.
  // The menu stays with its anchor as the page is drawn again, so a filter chip can change as its menu is used.
  let menuCount = 0;  // each menu opened, numbered, so it's drawn again in place while it's open
  function menu(anchor, items, id = 'menu', { search = null, onClose = null } = {}) {
    const again = layer.menu?.id === id;
    dropMenu();
    if (!again) layer.menu = { n: ++menuCount, id, items, search, onClose, query: '', active: 0, list: [], anchor: anchor.getBoundingClientRect(), anchorEl: anchor, anchorKey: controlKey(anchor) };
    renderLayer();
    renderSidebar();
  }
  // Lets go of the menu, saying so to whoever opened it.
  function dropMenu() {
    const m = layer.menu;
    layer.menu = null;
    m?.anchorEl?.removeAttribute?.('aria-expanded');
    m?.onClose?.();
  }
  const menuList = () => { const m = layer.menu; return (m.list = typeof m.items === 'function' ? m.items(m.query) : m.items); };
  function menuHtml() {
    const m = layer.menu;
    return `<div class="pop menu float-menu${m.search ? ' has-search' : ''}" role="menu" data-menu="${m.n}">${m.search
      ? `<div class="search-input menu-search">${icon('search')}<input class="input menu-search-input" value="${esc(m.query)}" placeholder="${esc(m.search)}" aria-label="${esc(m.search)}" autocomplete="off" spellcheck="false"></div>` : ''}
      <div class="menu-list">${menuItemsHtml()}</div></div>`;
  }
  function menuItemsHtml() {
    const m = layer.menu, items = menuList();
    const checks = items.some(i => 'checked' in i);
    // What the arrow keys move through, in a menu with a search: the items that can be picked.
    m.pickable = items.map((item, i) => item.label !== undefined && !item.select && !item.disabled ? i : -1).filter(i => i >= 0);
    m.active = Math.max(0, Math.min(m.active, m.pickable.length - 1));
    return items.map((item, i) => {
      if (item.sep) return '<div class="menu-sep"></div>';
      if (item.head) return `<div class="menu-head">${esc(item.head)}</div>`;
      if (item.note) return `<div class="menu-note">${esc(item.note)}</div>`;
      if (item.select) return `<label class="menu-choice"><span class="menu-choice-label">${esc(item.label)}</span><select class="menu-select" data-index="${i}" aria-label="${esc(item.label)}">${
        item.select.map(([v, t]) => `<option value="${esc(v)}"${v === item.value ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
      const ticks = 'ticked' in item;
      const role = ticks ? 'menuitemcheckbox' : 'checked' in item ? 'menuitemradio' : 'menuitem';
      const state = ticks ? ` aria-checked="${!!item.ticked}"` : 'checked' in item ? ` aria-checked="${!!item.checked}"` : '';
      const mark = ticks ? `<span class="menu-tick">${item.ticked ? icon('check') : ''}</span>` : checks ? `<span class="menu-check">${item.checked ? icon('check') : ''}</span>` : '';
      const text = item.desc ? `<span class="menu-text"><span class="menu-title">${esc(item.label)}</span><span class="menu-desc">${esc(item.desc)}</span></span>` : `<span class="menu-text">${esc(item.label)}</span>`;
      const active = m.search && m.pickable[m.active] === i ? ' aria-selected="true"' : '';
      return `<button class="menu-item${item.danger ? ' is-danger' : ''}" role="${role}"${state} data-cmd="shell.menu-pick" data-index="${i}"${item.disabled ? ' disabled' : ''}${active}${item.title ? ` title="${esc(item.title)}"` : ''}>
        ${mark}${text}${item.hint ? `<span class="menu-hint">${esc(item.hint)}</span>` : ''}</button>`;
    }).join('');
  }
  // Under its anchor (a filter chip, or a column's heading, as a whole), or above it where there's no room
  // below. An anchor drawn again since is found again, by the same attributes.
  function placeMenu() {
    const el = document.querySelector('#layer .float-menu');
    const m = layer.menu;
    if (!m.anchorEl?.isConnected && m.anchorKey) m.anchorEl = document.querySelector(m.anchorKey) ?? m.anchorEl;
    if (m.anchorEl?.isConnected) { m.anchor = (m.anchorEl.closest('.filter-chip, th') ?? m.anchorEl).getBoundingClientRect(); m.anchorEl.setAttribute('aria-expanded', 'true'); }
    const a = m.anchor;
    const w = el.offsetWidth, h = el.offsetHeight;
    const left = Math.max(8, Math.min(a.left, innerWidth - w - 8));
    const below = a.bottom + 4 + h <= innerHeight - 8;
    el.style.left = `${left}px`;
    el.style.top = `${below ? a.bottom + 4 : Math.max(8, a.top - h - 4)}px`;
    if (!el.contains(document.activeElement)) (el.querySelector('.menu-search-input') ?? el.querySelector('.menu-item:not(:disabled)'))?.focus({ preventScroll: true });
  }
  // Draws the menu's list again in place, as what's typed in its search, or a pick that keeps it open,
  // changes it; the focus stays where it was, or on the item in its place.
  const menuFocus = () => { const a = document.activeElement; return a?.closest?.('#layer .float-menu') ? a.dataset.index ?? 'search' : null; };
  function redrawMenu(focus = menuFocus()) {
    const el = document.querySelector('#layer .float-menu');
    if (!el || !layer.menu) return;
    const list = el.querySelector('.menu-list');
    const top = list.scrollTop;
    list.innerHTML = menuItemsHtml();
    list.scrollTop = top;
    if (focus === 'search') el.querySelector('.menu-search-input')?.focus({ preventScroll: true });
    else if (focus !== null) el.querySelector(`[data-index="${focus}"]`)?.focus({ preventScroll: true });
    placeMenu();
    el.querySelector('.menu-item[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }
  function pickFromMenu(index, value) {
    const item = layer.menu?.list[index];
    if (!item || item.disabled) return;
    if ('ticked' in item || item.keep || item.select) {
      const focus = menuFocus();
      item.run(value);
      return redrawMenu(focus);
    }
    dropMenu();
    renderLayer();
    renderSidebar();
    item.run();
  }

  // ---- The record picker ----
  // Finding a record by what's typed, as the palette does: by name, kind, or what tells it apart, word starts
  // first, then anywhere, then initials.
  const findsRecord = (id, query) => !clean(query) || score({ title: objectName(id), meta: subtitleOf(id), keywords: keywordsOf(id) }, query) > 0;
  // Shell.pickRecord(anchor, { pick, among, placeholder, id }): a menu under the anchor for finding an object:
  // a box to type in, and the objects that match, grouped by kind in the sidebar's order, each named, with
  // what tells it apart from like names below. `among` is the objects it offers, by default all; pick(id)
  // takes the one picked.
  function pickRecord(anchor, { pick, among = null, placeholder = 'Find a record', id = 'pick-record' }) {
    const detail = k => subtitleOf(k).split(' · ').slice(1).join(' · ');
    const items = query => {
      const ids = (among ?? Object.keys(records).filter(k => isObject(records[k]))).filter(k => records[k] && findsRecord(k, query));
      const rank = k => clean(query) ? score({ title: objectName(k), meta: subtitleOf(k) }, query) : 0;
      const out = [...recordKinds(), DOCUMENT_KIND].flatMap(kind => {
        const group = ids.filter(k => same(records[k].kind, kind)).sort((a, b) => rank(b) - rank(a) || byLabel(objectName(a), objectName(b)));
        return group.length ? [{ head: plural(kind) }, ...group.map(k => ({ label: objectName(k), desc: detail(k), title: `${objectName(k)} · ${subtitleOf(k)}`, run: () => pick(k) }))] : [];
      });
      return out.length ? out : [{ note: clean(query) ? `Nothing is called “${clean(query)}”.` : 'No records yet.' }];
    };
    menu(anchor, items, id, { search: placeholder });
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
    layer.palette = null;
    dropMenu();
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

  // Shell.confirm({ title, body, confirm, cancel, danger }) and Shell.prompt({ title, body, value,
  // placeholder, confirm, cancel }) ask in a dialog, and resolve with the answer: true or false, or the text
  // (null if cancelled). `html` stands in for a body of markup; `cancel` names the button that declines.
  // Enter answers, except where the answer destroys (`danger`): there Cancel has the focus, so Enter
  // declines and the destructive button must be chosen.
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
        keys: e => { if (e.key === 'Enter' && !e.target.matches('button') && !options.danger) { e.preventDefault(); ok(); } },
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
        ${d.kind === 'info' ? '' : `<button class="btn" data-cmd="shell.dialog-cancel"${d.danger ? ' data-default' : ''}>${esc(d.cancel ?? 'Cancel')}</button>`}
        <button class="btn ${d.danger ? 'btn-danger' : 'btn-primary'}" data-cmd="shell.dialog-ok"${d.danger ? '' : ' data-default'}>${esc(d.confirm ?? (d.kind === 'info' ? 'Done' : 'OK'))}</button>
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
  // Whether you've given your name, which the history records your changes under (Someone until you do).
  const named = () => { try { return !!localStorage.getItem(USER_KEY); } catch { return false; } };
  function userMenu(anchor) {
    menu(anchor, [
      { head: named() ? `Your changes are recorded as ${authorName()}` : 'Your changes are recorded as “Someone”' },
      { label: named() ? 'Your name…' : 'Add your name…', run: setName },
      { label: 'Settings', run: () => { location.href = 'settings.html'; } },
      { sep: true }, { head: 'Theme' },
      ...[['system', 'System'], ['light', 'Light'], ['dark', 'Dark']].map(([t, label]) => ({ label, checked: (prefs.theme ?? 'system') === t, run: () => setTheme(t) })),
      { sep: true },
      { label: 'Keyboard shortcuts', hint: '?', run: showKeys },
    ], 'user');
  }
  async function setName() {
    const name = await prompt({ title: 'Your name', body: 'The history records each change under the name of whoever made it.', value: named() ? authorName() : '', placeholder: 'Your name', confirm: 'Save' });
    if (name === null) return;
    setCurrentUser(name);
    render();
  }
  // On the first launch, the shell asks your name, once, so the history can say who made each change and
  // Home can greet you; Skip leaves it for later, under your name at the foot of the sidebar. Resolves once
  // it's answered, or at once where it isn't asked.
  async function welcome() {
    if (prefs.welcomed || named()) return;
    const name = await prompt({ title: 'Welcome to Rboreal', body: 'What should we call you? Your name goes beside the changes you make, so whoever reads the history knows who made them.',
      placeholder: 'Your name', confirm: 'Continue', cancel: 'Skip' });
    prefs.welcomed = true;
    savePrefs();
    if (name !== null && clean(name)) { setCurrentUser(name); render(); }
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

  // The shortcuts: what works everywhere, the page's own (its `keys`), and one row for each area G goes to.
  // Keys are written as they're pressed, Ctrl+K or G then A, and each key is drawn as one; words between
  // them ("Double-click", "start typing") stay words.
  const keysHtml = text => text.split(' then ').map(step => step.split(/\+(?=.)/)
    .map(k => /^\S{1,9}$/.test(k) ? `<kbd>${esc(k)}</kbd>` : esc(k)).join('')).join(' <span class="faint">then</span> ');
  function showKeys() {
    const group = (head, rows) => rows.length ? `<section class="keys-group"><h3 class="keys-head">${esc(head)}</h3>
      <dl class="keys">${rows.map(([k, what]) => `<dt>${esc(what)}</dt><dd>${keysHtml(k)}</dd>`).join('')}</dl></section>` : '';
    const everywhere = [[`${modKey}+K`, 'Search and commands'], [`${modKey}+Z`, 'Undo'], [isMac ? '⇧+⌘+Z' : 'Ctrl+Y', 'Redo'],
      [`${modKey}+\\`, 'Show or hide the sidebar'], ['?', 'These shortcuts'], ['Esc', 'Close']];
    const go = [...AREAS, { name: 'Records', key: 'r' }, ...FOOT_AREAS].map(a => [`G then ${a.key.toUpperCase()}`, a.name]);
    ask({ kind: 'info', title: 'Keyboard shortcuts', wide: true,
      html: `<div class="keys-cols"><div>${group('Everywhere', everywhere)}${group('On this page', page.keys ?? [])}</div>${group('Go to', go)}</div>` });
  }

  // ---- Undo ----
  // The toast says what was taken back or put back, as the history records it ("Undid “Deleted …”").
  function undoOrRedo(redo) {
    const last = historyLog[0];
    if (!(redo ? redoState() : undoState())) return redo ? toast('Nothing to redo') : takeBackLatest();
    for (const fn of undoListeners) fn();
    render();
    toast(historyLog[0] !== last ? historyLog[0].summary : redo ? 'Redone' : 'Undone', redo ? {} : { action: { label: 'Redo', run: () => undoOrRedo(true) } });
  }
  // With nothing to undo in this page (the change was made on another, or before it opened), an undo takes
  // back your latest change as the history has it, if it can still be taken back, the way History's Restore
  // does; and says why not, if not.
  function takeBackLatest() {
    const mine = historyLog.find(h => h.who === authorName() && !['undo', 'redo', 'restore'].includes(h.source) && h.changes?.length);
    if (!mine) return toast('Nothing to undo');
    const toHistory = { action: { label: 'Open History', run: () => { location.href = 'history.html'; } } };
    if (restoreBlock(mine)) return toast(`Nothing to undo here: your last change, “${mine.summary}”, has changed since.`, toHistory);
    const error = restoreChange(mine);
    if (error) return toast(error, { tone: 'error' });
    for (const fn of undoListeners) fn();
    render();
    // Taking back is a change of its own, so putting it back again is undoing that.
    toast(`Took back “${mine.summary}”`, { action: { label: 'Redo', run: () => undoOrRedo(false) } });
  }

  // ---- Events ----
  Object.assign(handlers, {
    'shell.palette': openPalette,
    'shell.pick': el => runPicked(Number(el.dataset.index)),
    'shell.dismiss': closeLayer,
    'shell.charts': el => chartsMenu(el),
    'shell.user': el => userMenu(el),
    'shell.sidebar': toggleSidebar,
    'shell.menu-pick': el => pickFromMenu(Number(el.dataset.index)),
    'shell.dialog-ok': el => dialogOf(el)?.ok(),
    'shell.dialog-cancel': el => { const d = dialogOf(el); if (d) closeDialog(d); },
    'shell.dialog-dismiss': () => closeDialog(topDialog()),
    'shell.toast-action': el => { const t = layer.toasts.find(x => x.id === Number(el.dataset.id)); dropToast(t.id); t.action.run(); },
    'shell.toast-close': el => dropToast(Number(el.dataset.id)),
  });
  const on = (name, fn) => { handlers[name] = fn; };

  // A click outside the open menu closes it, unless it's on the menu's own anchor, which toggles it.
  document.addEventListener('click', e => {
    const el = e.target.closest?.('[data-cmd]');
    const m = layer.menu;
    if (m && !e.target.closest?.('.float-menu') && !(el && (el === m.anchorEl || (m.anchorKey && el.matches(m.anchorKey))))) {
      dropMenu();
      renderLayer();
      renderSidebar();
      if (!el) return;
    }
    if (!el || el.disabled) return;
    const fn = handlers[el.dataset.cmd];
    if (fn) { e.preventDefault(); fn(el, e); }
  });
  document.addEventListener('input', e => {
    if (e.target.matches('.menu-search-input') && layer.menu) {
      layer.menu.query = e.target.value;
      layer.menu.active = 0;
      return redrawMenu();
    }
    if (!e.target.matches('.palette-input')) return;
    layer.palette.query = e.target.value;
    layer.palette.active = 0;
    drawPaletteList();
  });
  document.addEventListener('change', e => {
    if (e.target.matches('#layer .menu-select')) pickFromMenu(Number(e.target.dataset.index), e.target.value);
  });
  // A right-click on a table's column heading opens its menu, where it has one (Parts.columnHead).
  document.addEventListener('contextmenu', e => {
    const button = e.target.closest?.('th')?.querySelector('.th-menu');
    if (!button) return;
    e.preventDefault();
    button.click();
  });
  document.addEventListener('mousemove', e => {
    const item = e.target.closest?.('.palette-item');
    if (!item || Number(item.dataset.index) === layer.palette?.active) return;
    layer.palette.active = Number(item.dataset.index);
    for (const x of document.querySelectorAll('#layer .palette-item')) x.setAttribute('aria-selected', x === item);
  });

  // In a menu, the arrow keys move through its items and Esc closes it. With a search, the focus stays in
  // the box as the arrows move, and Enter picks. Returns whether it used the key.
  function menuKeys(e) {
    const m = layer.menu;
    const step = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
    if (e.key === 'Escape') { e.preventDefault(); closeLayer(); renderSidebar(); return true; }
    if (m.search && e.target.matches('.menu-search-input')) {
      const n = m.pickable.length;
      if (step && n) { e.preventDefault(); m.active = (m.active + step + n) % n; redrawMenu(); return true; }
      if (e.key === 'Enter') { e.preventDefault(); if (n) pickFromMenu(m.pickable[m.active]); return true; }
      return false;
    }
    const items = [...document.querySelectorAll('#layer .float-menu .menu-item:not(:disabled)')];
    const at = items.indexOf(document.activeElement);
    if (step) { e.preventDefault(); items[(at + step + items.length) % items.length]?.focus(); return true; }
    return false;
  }
  // In the palette, the arrow keys move, Enter runs what's lit, and Esc, or Ctrl+K again, closes it.
  function paletteKeys(e) {
    const n = layer.palette.items.length;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); closeLayer(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      layer.palette.active = (layer.palette.active + (e.key === 'ArrowDown' ? 1 : -1) + n) % Math.max(n, 1);
      drawPaletteList();
    }
    else if (e.key === 'Enter') { e.preventDefault(); runPicked(layer.palette.active); }
    else if (e.key === 'Escape') { e.preventDefault(); closeLayer(); }
  }

  // What's above the page hears the keys before the page does, and what it uses goes no further. A dialog
  // takes every key: a menu opened over it first, then its own handler, then Esc closes it and Tab keeps to
  // it. The palette takes every key too. A menu takes the keys it uses.
  window.addEventListener('keydown', e => {
    const d = topDialog();
    if (d) {
      e.stopPropagation();
      if (layer.menu) return menuKeys(e);
      d.keys?.(e);
      if (e.defaultPrevented) return;
      if (e.key === 'Escape') { e.preventDefault(); closeDialog(d); }
      else if (e.key === 'Tab') trapTab(e, d.el);
      return;
    }
    if (layer.palette) { e.stopPropagation(); return paletteKeys(e); }
    if (layer.menu && menuKeys(e)) e.stopPropagation();
  }, true);

  // The shell's own keys come last, once the page has heard them: a key the page has used (preventDefault)
  // is the page's, as a letter typed over a table's cell is, G included. G then a letter goes to an area.
  let goPending = 0;
  window.addEventListener('keydown', e => {
    if (e.defaultPrevented || !page) { goPending = 0; return; }
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (mod && key === 'k') { e.preventDefault(); return openPalette(); }
    if (mod && e.key === '\\') { e.preventDefault(); return toggleSidebar(); }
    if (layer.menu || typing(e.target) || e.altKey) return;
    if (mod && (key === 'z' || key === 'y') && page.undo) { e.preventDefault(); return undoOrRedo(key === 'y' || e.shiftKey); }
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
    start, render, on, menu, dialog, confirm, prompt, toast, pickRecord, findsRecord,
    visited, recent, recordHref, kindHref, subtitleOf, DOCUMENT_KIND,
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
