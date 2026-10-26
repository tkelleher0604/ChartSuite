// The open workbook, and what every part reads from it and changes it through (shell.js lists the API).
const App = (() => {
  const { signal, computed, effect } = preactSignals;
  const { html, store } = Shell;

  // Empty until Store has opened the workbook, which the launch screen covers.
  const book = signal(Log.open({ dendra: 1, changes: [] }));
  const version = signal(0);
  const chart = signal(null);
  let unsubscribe = null;
  function use(wb) {
    // The layouts this browser keeps, so a reload lays out again nothing it laid out before.
    if (typeof Layout !== 'undefined') Layout.keepIn(store);
    // Another workbook: nothing of the last one is selected, and it shows as it is now.
    if (unsubscribe) { Shell.select([], { replace: true }); Shell.at(null, { replace: true }); unsubscribe(); }
    unsubscribe = wb.subscribe(() => { version.value++; });
    book.value = wb;
    if (!wb.charts().some(c => c.chart === chart.peek())) chart.value = wb.charts()[0]?.chart ?? null;
    version.value++;
    listBooks();
  }
  Store.open({ sample: SAMPLE }).then(use, () => use(Log.open(SAMPLE)));

  const who = () => Store.who() || 'You';
  const day = computed(() => Shell.time.value?.asOf ?? Log.today());
  // In History, the workbook as it stood just after the change picked, which can't be changed.
  const readOnly = computed(() => !!Shell.time.value?.stood);
  const stood = computed(() => {
    const t = Shell.time.value;
    if (!t?.stood) return null;
    const wb = book.value;
    return wb.at(t.at ?? wb.changes().find(c => c.id === t.stood)?.when);
  });
  const shown = computed(() => { version.value; return stood.value ?? book.value; });
  const entered = computed(() => { version.value; return chart.value ? shown.value.asOf(chart.value, day.value) : {}; });
  // The notes and the schema are kept while they say the same, so what's worked out from them is kept too:
  // the notes while no note changes, the schema while no record's shape does.
  const keptWhile = (key, make) => { let k, v; return computed(() => { const now = key(); if (v === undefined || now !== k) { k = now; v = make(); } return v; }); };
  const schemaNow = computed(() => { version.value; return chart.value ? shown.value.schema(chart.value) : {}; });
  const schema = keptWhile(() => JSON.stringify(schemaNow.value), () => schemaNow.value);
  const notes = keptWhile(() => { version.value; return chart.value ? `${chart.value}|${shown.value.rows(chart.value).filter(r => 'note' in r).map(r => r.id)}` : ''; },
    () => chart.peek() ? shown.peek().notes(chart.peek()) : Notes.index([]));
  // The formulas work the chart out from its Formula notes, and its relations' names and lists, each time
  // from the working-out before (see Formulas.computeState).
  const definitions = computed(() => notes.value.definitions(schema.value));
  const relations = computed(() => notes.value.relations(schema.value));
  let worked;
  const result = computed(() => worked = Formulas.computeState(entered.value, definitions.value, { relations: relations.value, schema: schema.value }, worked));
  const state = computed(() => result.value.records);
  // A record a change takes away (a deadline once paid) leaves the selection with it; one that's only not
  // there on the day or at the moment shown stays selected.
  let held = null;
  effect(() => {
    const st = state.value, at = `${chart.value} ${JSON.stringify(Shell.time.value)}`, was = held;
    held = { at, st };
    const keys = Shell.selection.peek(), gone = k => k.split('@')[0] in was.st && !(k.split('@')[0] in st);
    if (was?.at === at && keys.some(gone)) Shell.select(keys.filter(k => !gone(k)), { replace: true });
  });

  // ---- Changing ----
  // Undo and Redo are this window's (dendra.md, Workbook: the session's, in no log): each chart's stack of the
  // changes made here, whoever is named as making them, kept for the tab as its address is. Making a chart
  // isn't one of them. Each says what it took back or put back, by the change that made it, or why it didn't.
  const stacks = signal((() => { try { return JSON.parse(sessionStorage.getItem('dendra.undo')) ?? {}; } catch { return {}; } })());
  const stackOf = c => stacks.value[c] ?? { undo: [], redo: [] };
  const keep = (c, s) => { stacks.value = { ...stacks.peek(), [c]: s }; try { sessionStorage.setItem('dendra.undo', JSON.stringify(stacks.peek())); } catch {} };
  const made = c => { const s = stackOf(c.chart); keep(c.chart, { undo: [...s.undo, c.id], redo: [] }); return c; };
  const origin = c => { const all = book.peek().changes(); while (c?.reverses) c = all.find(x => x.id === c.reverses); return c; };
  function step(back) {
    if (readOnly.peek()) return Shell.toast('Can’t change the past');
    const c = chart.peek(), s = stacks.peek()[c] ?? { undo: [], redo: [] }, [from, to] = back ? ['undo', 'redo'] : ['redo', 'undo'];
    const r = s[from].length ? book.peek().reverse(s[from].at(-1), who()) : null;
    // A change kept from before a reload that never reached the workbook is passed over.
    if (r === null && s[from].length) { keep(c, { ...s, [from]: s[from].slice(0, -1) }); return step(back); }
    if (!r) return Shell.toast(back ? 'Nothing to undo' : 'Nothing to redo', { ms: 2000 });
    if (typeof r === 'string') return Shell.toast(r);
    keep(c, { [from]: s[from].slice(0, -1), [to]: [...s[to], r.id] });
    Shell.toast(`${back ? 'Undid' : 'Redid'}: ${Time.describe(origin(r))}`, back ? { redo } : { undo });
  }
  const undo = () => step(true), redo = () => step(false);
  // One change, by the user: refused while the past is shown; dated from the day shown unless `dated` is false
  // (a view isn't a fact about the world). `say`, a string or a function of the change, is toasted with Undo.
  function change(fn, { say, dated = true } = {}) {
    if (readOnly.peek()) { Shell.toast('Can’t change the past'); return null; }
    const tx = book.peek().edit({ chart: chart.peek(), who: who(), day: dated ? Shell.time.peek()?.asOf ?? null : null });
    fn(tx);
    const c = tx.commit();
    if (typeof c === 'string') { Shell.toast(c); return null; }
    if (!c) return null;
    made(c);
    const said = typeof say === 'function' ? say(c) : say;
    if (said) Shell.toast(said, { undo });
    return c;
  }
  // Restore: the reverse of a change, as it stood or deleted, made now.
  function restore(id, say = 'Restored 1 change') {
    const c = book.peek().reverse(id, who());
    if (typeof c === 'string') return Shell.toast(c);
    Shell.at(null);
    if (c) { made(c); Shell.toast(say, { undo }); }
  }

  // ---- The chart menu: the workbook's charts, a new one, and the workbooks this browser keeps ----
  const books = signal([]);
  const listBooks = () => Store.books().then(bs => { books.value = bs; });
  // A new chart, added to a workbook: the chart shown without its records. It keeps the schema, and the views
  // with every note that isn't at one of the records: the definitions, names, descriptions and styles; a view
  // named after one of the records stays behind. With none kept, one view. Each chart's page starts afresh.
  function startChart(wb) {
    const c = Log.newId(), names = new Set(wb.charts().map(x => Tree.norm(x.name))), from = chart.peek(), src = book.peek();
    let name = 'Untitled', i = 2;
    while (names.has(Tree.norm(name))) name = `Untitled ${i++}`;
    const tx = wb.edit({ chart: c, who: who() }), kept = new Map(), pages = [];
    tx.add('chart', { name }, c);
    if (from) {
      const rows = src.rows(from), st = state.peek(), N = notes.peek(), words = s => ` ${Tree.norm(s).replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `;
      const theirs = Object.keys(st).filter(id => Tree.isObject(st[id]) && !Tree.isView(st[id]))
        .flatMap(id => [N.nameOf(st, id), N.shortOf(st, id)].filter(n => n && !Tree.same(n, st[id].kind))).map(words);
      for (const tree of Object.values(src.schema(from))) tx.add('spec', { tree });
      for (const v of views.peek()) if (!theirs.some(n => words(v.name).includes(n))) {
        kept.set(v.id, tx.add('record', { kind: 'View' }));
        if (v.layout === 'chart') pages.push(kept.get(v.id));
      }
      const moved = t => t.args ? { ...t, args: t.args.map(a => ({ ...a, loc: moved(a.loc) })) } : t.id === undefined ? t : { ...t, id: kept.get(t.id) };
      for (const r of rows) if ('note' in r && (!r.view || kept.has(r.view)) && [...Tree.idsIn(r.pattern)].every(id => kept.has(id)))
        tx.note(r.label, moved(r.pattern), r.value, { view: kept.get(r.view), param: r.param });
    }
    if (!kept.size) { const id = tx.add('record', { kind: 'View' }); tx.note('Name', viewTree(id), 'Chart'); pages.push(id); }
    pages.forEach(id => page(tx, id, name));
    return tx.commit();
  }
  // A chart's page, begun: its title, the chart's name, and under it the day it's as of, which the page sets
  // at the sheet's size and places, as it does every page's.
  function page(tx, view, title) {
    tx.add('shape', { view, geometry: 'text', role: 'title', text: title });
    tx.add('shape', { view, geometry: 'text', role: 'date', text: '="As of " & TEXT(@AsOf, "mmmm d, yyyy")' });
  }
  function newChart() {
    if (readOnly.peek()) return Shell.toast('Can’t change the past');
    const c = startChart(book.peek());
    if (typeof c === 'string') return Shell.toast(c);
    chart.value = c.chart;
    Shell.select([]);
  }
  const blank = () => { const wb = Log.open([]), c = startChart(wb); if (typeof c === 'string') return Shell.toast(c); return opened(Store.open({ id: Log.newId(), sample: wb })); };
  Shell.register('workbook', {
    charts: () => (version.value, book.value.charts().map(c => ({ id: c.chart, name: c.name }))),
    current: () => chart.value,
    open: id => { chart.value = id; Shell.select([]); },
    menu: () => [{ label: 'New chart', run: newChart }, { label: 'Workbooks', items: [
      ...books.value.map(b => ({ label: b.name, checked: b.id === Store.where()?.id, run: () => b.id !== Store.where()?.id && opened(Store.open({ id: b.id })) })),
      ...(books.value.length ? ['-'] : []), { label: 'New workbook', run: blank }] }],
  });
  Shell.register('undo', {
    undo, redo,
    canUndo: () => !readOnly.value && stackOf(chart.value).undo.length > 0,
    canRedo: () => !readOnly.value && stackOf(chart.value).redo.length > 0,
  });

  // ---- Views: View objects, each described by its own notes, never dated ----
  const viewTree = id => ({ id, kind: 'View' });
  const views = computed(() => {
    const st = entered.value, N = notes.value;
    return (Tree.index(st).kinds.get('view') ?? []).map(id => {
      const t = viewTree(id), lay = N.value('Layout', t);
      return { id, name: N.nameOf(st, id), layout: lay && typeof lay === 'object' ? 'table' : 'chart', rows: lay?.rows ?? null,
        keeps: N.value('As Of', t) ?? null, order: N.order(t) ?? Infinity };
    }).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  });
  // The view shown, drawn: what the canvas, the format bar and the inspector's Look read.
  const scene = computed(() => {
    const v = views.value.find(x => x.id === Shell.view.value);
    return v?.layout !== 'chart' ? null : Scene.of(shown.value, chart.value, v.id, day.value, { state: state.value, computed: result.value });
  });
  // What a table's rows can be: each kind, each relation (its edges, every other label removed), and dates
  // and documents.
  const strip = t => t.args ? { args: t.args.map(a => ({ edge: a.edge, loc: strip(a.loc) })) } : {};
  const layouts = computed(() => {
    const N = notes.value, rels = new Map(), kinds = new Set(), byName = (a, b) => a.name.localeCompare(b.name);
    for (const t of Object.values(schema.value)) {
      if (!t.args) { if (!Tree.isView(t)) kinds.add(t.kind); }
      else if (t.args.length > 1) { const p = strip(t); rels.set(Tree.key(p), p); }
    }
    return {
      kinds: [...kinds].map(kind => ({ name: Tree.plural(kind), rows: { kind } })).sort(byName),
      relations: [...rels.values()].map(p => ({ name: N.name(p), rows: p })).sort(byName),
      datatypes: ['date', 'document'].map(d => ({ name: Tree.plural(Tree.DATATYPES[d]), rows: d })),
    };
  });
  // A new view after the one it copies, or at the end: a chart, or a table of `rows`. A copy takes the
  // original's notes and shapes, but its name. A new chart takes the styles and Shown of the chart shown, or
  // else of the first, but not where it put things, and its page starts afresh.
  function addView(name, rows, from) {
    const vs = views.peek(), at = from ? vs.findIndex(v => v.id === from) + 1 : vs.length, taken = new Set(vs.map(v => Tree.norm(v.name)));
    const like = from ?? (rows === undefined ? (vs.find(v => v.id === Shell.view.peek() && v.layout === 'chart') ?? vs.find(v => v.layout === 'chart'))?.id : null);
    let n = name, i = 2;
    while (taken.has(Tree.norm(n))) n = `${name} ${i++}`;
    let id = null;
    change(tx => {
      id = tx.add('record', { kind: 'View' });
      const t = viewTree(id);
      tx.note('Name', t, n);
      [...vs.slice(0, at), { id }, ...vs.slice(at)].forEach((v, k) => tx.note('Order', viewTree(v.id), k + 1));
      if (rows !== undefined) tx.note('Layout', t, { rows });
      if (like) for (const { id: _, ...r } of book.peek().rows(chart.peek())) {
        if ('note' in r && r.view === like && (from || r.label !== 'Position')) { const { note, ...x } = r; tx.add('note', { ...x, view: id }); }
        else if (!from) continue;
        else if ('shape' in r && r.view === from) { const { shape, ...s } = r; tx.add('shape', { ...s, view: id }); }
        else if ('note' in r && !r.view && r.pattern.id === from && r.label !== 'Order' && r.label !== 'Name') tx.note(r.label, t, r.value);
      }
      if (!from && rows === undefined) page(tx, id, book.peek().charts().find(c => c.chart === chart.peek())?.name ?? n);
    }, { dated: false });
    return id;
  }
  const order = ids => change(tx => ids.forEach((id, k) => tx.note('Order', viewTree(id), k + 1)), { dated: false });
  // What a view can show, as menu items: a chart, or a table of a kind's records, a relation's, or every date or
  // document, each picked as pick(name, rows). Given a view, what it shows is checked.
  function shows(pick, v) {
    const L = layouts.peek(), on = rows => v && v.layout === 'table' && JSON.stringify(v.rows) === JSON.stringify(rows);
    const as = l => ({ label: l.name, checked: on(l.rows), run: () => pick(l.name, l.rows) });
    const group = (label, ls) => ({ label, checked: v && ls.some(l => on(l.rows)), items: ls.map(as) });
    return [{ label: 'Chart', checked: v && v.layout === 'chart', run: () => pick('Chart') }, '-', group('Records', L.kinds), group('Relations', L.relations), ...L.datatypes.map(as)];
  }
  Shell.register('views', {
    list: () => views.value,
    rename: (id, name) => change(tx => tx.note('Name', viewTree(id), name), { dated: false }),
    move: (id, i) => { const ids = views.peek().map(v => v.id).filter(x => x !== id); ids.splice(i, 0, id); order(ids); },
    // A new view of what's picked: its id, or null if none is.
    add: anchor => new Promise(done => {
      let chosen = false;
      Shell.menu(anchor, shows((name, rows) => { chosen = true; done(addView(name, rows)); }),
        { placement: 'top-start', onClose: () => queueMicrotask(() => chosen || done(null)) });
    }),
    // A view's own menu, on its tab: what it shows, as the inspector's view panel sets it, and copying or
    // deleting it.
    menu: id => {
      const v = views.peek().find(x => x.id === id);
      return [
        { label: 'Show', items: shows((_, rows) => change(tx => tx.note('Layout', viewTree(id), rows && { rows }), { dated: false }), v) },
        '-',
        { label: 'Duplicate', run: () => { const copy = addView(v.name, undefined, id); if (copy) Shell.show(copy); } },
        { label: 'Delete', danger: true, disabled: views.peek().length < 2, run: () => {
          const next = views.peek().find(x => x.id !== id);
          if (change(tx => tx.remove(id), { say: `Deleted ${v.name}`, dated: false }) && Shell.view.peek() === id) Shell.show(next.id, { replace: true });
        } },
      ];
    },
  });
  // Find reaches each definition, as its pattern in general: the statute it encodes (inspector.js).
  Shell.register('find', { items: () => { const N = notes.peek(); return N.notes('Formula').map(n => ({ label: N.name(n.pattern), detail: 'Definition', run: () => Shell.select([Shell.general(n.pattern)]) })); } });

  // ---- Where the workbook is kept: its status at the foot, and opening and saving it in the chart menu ----
  const status = signal(Store.status());
  Store.subscribe(st => { status.value = st; });
  Shell.register('status', {
    render: () => {
      const st = status.value;
      return st.fix ? html`<button class="status-fix" onClick=${() => Store.fix()}>${st.text}</button>`
        : html`<span class=${'status-store' + (st.tone ? ' is-' + st.tone : '')} title=${st.detail ?? ''}>${st.text}</span>`;
    },
  });
  const opened = p => p.then(wb => wb && use(wb), e => e?.name === 'AbortError' || Shell.toast(e?.message || 'Couldn’t open it'));
  const saved = p => p.then(listBooks, e => e?.name === 'AbortError' || Shell.toast(e?.message || 'Couldn’t save it'));

  // Settings: who you are, and signing in to the SharePoint library the team keeps its workbooks and documents
  // in. The connection to it is IT's to set up (docs/sharepoint-setup.md), so it's folded away, and opens
  // when signing in needs it.
  function settings() {
    const v = { name: store.get('name') ?? '', ...SharePoint.settings() };
    const keep = () => SharePoint.configure({ tenant: v.tenant.trim(), client: v.client.trim(), library: v.library.trim() });
    const field = (k, label) => html`<label class="field"><span>${label}</span><input value=${v[k]} spellcheck="false" onInput=${e => { v[k] = e.target.value; }} /></label>`;
    function Body() {
      const [me, setMe] = preactHooks.useState(SharePoint.account()), connection = preactHooks.useRef();
      const go = p => p.then(() => setMe(SharePoint.account()), e => {
        Shell.toast(e?.message || 'Couldn’t sign in');
        if (!SharePoint.configured()) connection.current.open = true;
      });
      return html`<div class="settings">
        ${field('name', 'Your name')}
        <div class="field"><span>SharePoint</span><span class="account">${me
          ? html`<span class="who">${me.name}</span><button type="button" class="btn" onClick=${() => go(SharePoint.signOut())}>Sign out</button>`
          : html`<button type="button" class="btn" onClick=${() => { keep(); go(SharePoint.signIn()); }}>Sign in</button>`}</span></div>
        <details ref=${connection}><summary>Connection</summary><div class="settings">${field('tenant', 'Tenant ID')}${field('client', 'Client ID')}${field('library', 'Library')}</div></details>
      </div>`;
    }
    Shell.dialog({ title: 'Settings', width: 480, actions: [{ label: 'Cancel', value: false }, { label: 'Done', value: true, primary: true }], body: () => html`<${Body} />` })
      .then(ok => { if (ok) { store.set('name', Tree.clean(v.name) || null); keep(); } });
  }
  [
    { id: 'file.open', name: 'Open…', keys: '$mod+O', run: () => opened(Store.openFile()) },
    { id: 'file.save', name: 'Save a copy…', keys: '$mod+Shift+S', run: () => saved(Store.saveAs('file')) },
    { id: 'file.library', name: 'Save to SharePoint…', run: () => saved(Store.saveAs('library')) },
    { id: 'file.download', name: 'Download', run: () => Store.download() },
  ].forEach((a, i) => Shell.register('action', { ...a, menu: 'chart', order: 1 + i }));
  Shell.register('action', { id: 'settings', name: 'Settings', menu: 'chart', order: 20, run: settings });
  Shell.register('action', { id: 'chart.new', name: 'New chart', run: newChart });
  Shell.register('action', { id: 'file.new', name: 'New workbook', run: blank });

  return {
    get wb() { return book.value; },
    chart, version, day, shown, entered, schema, notes, definitions, relations, computed: result, state,
    readOnly, change, restore, views, scene, layouts, addView, who, blank,
  };
})();
