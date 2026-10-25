// The Records area: a table for each kind, at records.html#<kind>, kept like a spreadsheet of its objects.
// - Rows are the kind's objects. Columns are the entries the schema has at objects of the kind (fields, tags
//   and choices), in the model's entry order with Name first and kept in view, then the entries below them
//   (an Entity Type's Tax Classification), then the lists of each object's relatives by list name (Owners,
//   General Partners), each relative a chip with its one detail. A screen's worth shows at first; the View
//   menu, grouped by where an entry sits and searchable, shows the rest.
// - Cells are edited in place through the model's own functions, so each edit is one undoable step and lands
//   in the History. What a formula works out is set in italics and isn't edited here, except that a computed
//   tag can be ruled out (or attested), overriding its formula, as the panel allows.
// - Tab-separated text pasted from Excel fills cells and adds rows, as one step.
// - Rows can be sorted, filtered with chips, searched, ticked and deleted together, and what's shown
//   exported as CSV. Which columns are shown, and the sort, are kept per kind in this browser; the filters
//   and the search, in this tab.

(() => {
  // ---- What the page holds between renders ----
  // The shell renders the page again after every change, so everything here is either the user's place in
  // the table or what they're in the middle of; the records themselves are only ever read from the state.
  const ui = {
    kind: null,         // the kind whose table this is
    chart: null,        // the chart it's in
    prefs: {},          // this kind's remembered columns ({ [key]: shown }) and sort ({ key, dir })
    active: null,       // the selected cell: { row, col }, an object's id and a column's key
    edit: null,         // the cell being typed in: { row, col, text, error }
    draft: null,        // a new row being named: { text, error }
    pop: null,          // a choice's options, open under its cell: { row, col, query, active }
    checked: new Set(), // rows ticked for bulk actions
    anchor: null,       // the row last ticked, where a shift-click range starts
    added: [],          // rows added on this page, kept at the end where they were typed until the rows are sorted
    filters: [],        // [{ col, op: 'is' | 'not' | 'empty' | 'filled', values: [keys] }], one per column
    filterMenu: null,   // the column whose filter's menu is open, whose chip shows even while it's unset
    search: '',
    needs: false,       // whether only rows with a required entry blank are shown
    focus: null,        // where the keyboard was: 'grid', 'edit', 'draft', 'pop' or 'search'
    caret: null,        // [start, end] of the selection in the box being typed in
    scroll: { left: 0, top: 0 },
    toEnd: false,       // whether to scroll to the last row, where a new row is named, after the next render
    reveal: false,      // whether to bring the active cell into view after the next render
    rows: [],           // the rows shown, in order, and the keys of the columns shown, for moving and pasting
    cols: [],
  };

  const word = () => ui.kind.toLowerCase();
  const kindPlural = () => plural(ui.kind);
  const MOD = isMac ? '⌘' : 'Ctrl';

  // ---- Remembered per kind ----
  const PREFS_KEY = 'rboreal.records';
  const SESSION_KEY = 'rboreal.records.session';
  // `store` names localStorage or sessionStorage: reaching either can throw where a browser blocks storage.
  function stored(store, key) {
    try { return JSON.parse(window[store].getItem(key)) ?? {}; } catch { return {}; }
  }
  function storeFor(store, key, value) {
    const all = stored(store, key);
    all[norm(ui.kind)] = value;
    try { window[store].setItem(key, JSON.stringify(all)); } catch {}
  }
  function setPrefs(patch) {
    ui.prefs = { ...ui.prefs, ...patch };
    storeFor('localStorage', PREFS_KEY, ui.prefs);
  }
  const saveSession = () => storeFor('sessionStorage', SESSION_KEY, { filters: ui.filters, search: ui.search, needs: ui.needs });

  // ---- The kind ----
  const hashText = () => readHash();

  // The kind the address names, or else the first kind the sidebar lists. A chart with no kinds yet starts
  // its first as an Entity.
  function kindFromHash() {
    const kinds = kindsInState();
    return kinds.find(k => same(k, hashText())) ?? kinds.find(k => !same(k, Shell.DOCUMENT_KIND)) ?? kinds[0] ?? 'Entity';
  }

  // Takes up the kind the address names. Moving to another kind starts afresh there, with that kind's own
  // remembered columns, sort and filters. Returns whether the kind changed.
  function useKind() {
    const kind = kindFromHash();
    if (kind === ui.kind) return false;
    const session = stored('sessionStorage', SESSION_KEY)[norm(kind)] ?? {};
    Object.assign(ui, {
      kind, chart: workbook.chartId, prefs: stored('localStorage', PREFS_KEY)[norm(kind)] ?? {},
      active: null, edit: null, draft: null, pop: null, filterMenu: null, checked: new Set(), anchor: null, added: [],
      filters: session.filters ?? [], search: session.search ?? '', needs: !!session.needs,
      focus: null, caret: null, scroll: { left: 0, top: 0 },
    });
    if (Shell.page) Shell.page.kind = kind;
    if (location.hash && !same(hashText(), kind)) history.replaceState(null, '', `#${encodeURIComponent(kind)}`);
    return true;
  }

  // The shell draws the sidebar and the top bar before the page, so the first of them to need the kind
  // takes it up. Where the address didn't name it, the sidebar is drawn again once it's known.
  let sidebarStale = false;
  function ensureKind() {
    if (ui.kind !== null) return;
    const drawnFor = Shell.page?.kind ?? '';
    useKind();
    sidebarStale = !same(drawnFor, ui.kind);
  }

  // ---- Columns ----
  // A column of entries: { key, label, path, parent, type, datatype, options, params, computedBy, required,
  // isName }. Its path is the labels down from the object (Entity Type, Tax Classification), and its
  // parameterizations are those of its specifications, one for each location like the one above it.
  // A column of relations: { key, rel, form, own, arity, label, computed }, one for each form of relation
  // and role (`own`, an edge label) that objects of the kind, or entries below them, can take in it.

  const relKey = (form, edge) => `r:${form}|${norm(edge)}`;

  // A location tree that's a path down from an object of the kind: the kind itself, or tags and choices below it.
  const isPathOf = (loc, kind) => loc.kind !== undefined ? same(loc.kind, kind)
    : loc.args.length === 1 && !('field' in loc.out) && isPathOf(loc.args[0].loc, kind);

  let coveredMemo = { defs: null, params: null };
  function coveredParams() {
    if (coveredMemo.defs !== definitions) coveredMemo = { defs: definitions, params: new Set(definitions.flatMap(d => d.scope)) };
    return coveredMemo.params;
  }

  // The entries of objects of the kind, from the schema, in the order the model keeps for their locations,
  // each followed by the entries that can sit below it.
  function entryColumns(kind) {
    const out = [];
    const walk = (locs, path, parent) => {
      const found = new Map();
      for (const loc of locs) for (const k of indexOf().entriesAt.get(loc) ?? []) {
        const t = schema[k], label = t.args[0].edge;
        if (!found.has(norm(label))) found.set(norm(label), { label, type: typeOfTree(t), datatype: t.out.field, options: [], specs: [], params: new Set() });
        const c = found.get(norm(label));
        c.specs.push(k);
        c.params.add(treeParam(t));
        if ('choice' in t.out && !c.options.some(o => same(o, t.out.choice))) c.options.push(t.out.choice);
      }
      const compare = orderedBy(locs.map(l => order[l]).find(Boolean) ?? []);
      const isName = c => !parent && same(c.label, 'name');
      for (const c of [...found.values()].sort((a, b) => isName(b) - isName(a) || compare(a, b))) {
        const labels = [...path, c.label];
        const params = [...c.params];
        const def = params.map(definitionCovering).find(Boolean) ?? null;
        const col = { key: `e:${labels.map(norm).join(' › ')}`, label: c.label, path: labels, parent, type: c.type, datatype: c.datatype,
          options: c.options.sort(byLabel), params, computedBy: def, required: params.some(isRequired), isName: isName(c) };
        out.push(col);
        if (c.type !== 'field' && labels.length < 3) walk(c.specs, labels, col);
      }
    };
    walk([`kind:${norm(kind)}`], [], null);
    // A kind new to the chart has no Name in the schema yet, but its first row will.
    if (!out.some(c => c.isName)) out.unshift({ key: 'e:name', label: 'Name', path: ['Name'], parent: null, type: 'field', datatype: 'text',
      options: [], params: [], computedBy: null, required: false, isName: true });
    return out;
  }

  // The lists of relatives: for each form of relation, one column per role the kind can take in it, named
  // by its list name seen from that role (Owners, Holdings). A relation of more than two takes its own name,
  // with the role where the kind can take several.
  function relationColumns(kind) {
    const cols = new Map();
    for (const t of Object.values(schema)) {
      if (!(t.args?.length > 1)) continue;
      const form = formOfTree(t);
      for (const a of t.args) {
        const key = relKey(form, a.edge);
        if (!isPathOf(a.loc, kind) || cols.has(key)) continue;
        const other = t.args.find(x => x !== a);
        cols.set(key, { key, rel: true, form, own: a.edge, arity: t.args.length, path: [], computed: coveredForms().has(form),
          label: t.args.length === 2 ? listName(form, a.edge, other.edge) : formName(form) });
      }
    }
    const list = [...cols.values()];
    for (const c of list) if (c.arity > 2 && list.some(x => x !== c && x.form === c.form)) c.label = `${c.label} (${c.own})`;
    return list.sort((a, b) => a.computed - b.computed || byLabel(a.label, b.label));
  }

  // The columns, worked out again only when what they come from changes.
  let colMemo = null;
  function columns() {
    const deps = [ui.kind, schema, order, names, definitions, required];
    if (!colMemo || colMemo.deps.some((d, i) => d !== deps[i])) colMemo = { deps, cols: [...entryColumns(ui.kind), ...relationColumns(ui.kind)] };
    return colMemo.cols;
  }
  const colByKey = key => columns().find(c => c.key === key) ?? null;

  // Which columns are shown is kept per kind (ui.prefs.cols), from the first time its table is drawn:
  // a screen's worth (firstColumns). Name is always shown. A column that comes later shows if it's an entry
  // at the object (as one a paste just added), or a list of entered relatives some row has.
  function isShown(c, P) {
    if (c.isName) return true;
    const set = ui.prefs.cols?.[c.key];
    if (set !== undefined) return set;
    if (!c.rel) return !c.parent;
    return !c.computed && P.objects.some(id => P.cell(id, c).items.length);
  }

  // A screen's worth of columns, as { [key]: shown }: after Name, the first six entries at the object, in
  // the entry order, that some row has, and any that's required; then the two lists of entered relatives
  // the most rows have. Entries below entries, lists a formula works out, and what no row has start hidden.
  const FIRST_ENTRIES = 6, FIRST_LISTS = 2;
  function firstColumns(cols, P) {
    const has = c => P.objects.filter(id => { const cell = P.cell(id, c); return c.rel ? cell.items.length : cell.r; }).length;
    const entries = cols.filter(c => !c.rel && !c.parent && !c.isName);
    const lists = cols.filter(c => c.rel && !c.computed).map(c => [c, has(c)]).filter(([, n]) => n).sort((a, b) => b[1] - a[1]).map(([c]) => c);
    const first = new Set([...entries.filter(c => !P.objects.length || has(c)).slice(0, FIRST_ENTRIES), ...entries.filter(c => c.required), ...lists.slice(0, FIRST_LISTS)]);
    return Object.fromEntries(cols.map(c => [c.key, c.isName || first.has(c)]));
  }

  // ---- The records, as the table reads them ----
  // Worked out once for each state: each location's entries by label, the object each location is on, each
  // object's relations by column, its name, and the formulas' errors by where their output would be.
  const indexes = new WeakMap();
  function tableIndex() {
    const recs = records;
    if (indexes.has(recs)) return indexes.get(recs);
    const entries = new Map(), relations = new Map(), errors = new Map(), owners = new Map();
    for (const [id, r] of Object.entries(recs)) {
      if (r.args || r.at === undefined) continue;
      if (!entries.has(r.at)) entries.set(r.at, new Map());
      entries.get(r.at).set(norm(r.edge), id);
    }
    // The object a location is on: up its path to the object it starts at, if it starts at one.
    const objectAt = id => {
      if (!owners.has(id)) {
        const r = recs[id];
        owners.set(id, !r || r.args ? null : isObject(r) ? id : objectAt(r.at));
      }
      return owners.get(id);
    };
    for (const [id, r] of Object.entries(recs)) {
      if (!r.args) continue;
      const form = formKeyOf(id, recs);
      for (const a of r.args) {
        const obj = objectAt(a.at);
        if (!obj) continue;
        if (!relations.has(obj)) relations.set(obj, new Map());
        const byCol = relations.get(obj), key = relKey(form, a.edge);
        if (!byCol.has(key)) byCol.set(key, []);
        if (!byCol.get(key).includes(id)) byCol.get(key).push(id);
      }
    }
    for (const e of formulaResult.errors ?? []) if (e.args?.length === 1) errors.set(`${e.args[0].at}|${norm(e.args[0].edge)}`, e);
    const nameOf = id => { const n = entries.get(id)?.get('name'); return n && isField(recs[n]) ? String(recs[n].value) : `${recs[id]?.kind ?? 'Record'} ${id}`; };
    const ix = { entries, relations, errors, objectAt, nameOf };
    indexes.set(recs, ix);
    return ix;
  }

  // One reading of the table: its cells are read once each, as rendering, sorting, filtering and searching
  // all need them, and where each row's name parts from the others' (partingsOf), for cutting it short.
  function readPass() {
    const ix = tableIndex();
    const cells = new Map();
    const objects = Object.keys(records).filter(k => isObject(records[k]) && same(records[k].kind, ui.kind));
    let parting = null;
    return {
      ix, objects,
      cell(obj, c) {
        const k = `${obj}\u0000${c.key}`;
        if (!cells.has(k)) cells.set(k, c.rel ? relationCell(obj, c, ix) : entryCell(obj, c, ix));
        return cells.get(k);
      },
      parts: name => (parting ??= partingsOf(objects.map(ix.nameOf)))(name),
    };
  }

  // An entry's cell: `at` is where its record is, or would go (the object, or for a column below an entry,
  // that entry), and `id` and `r` its record if there is one. A blank cell may be required, or covered by a
  // definition that gives nothing there, or hold the error a formula ran into. `blocked` means the entry it
  // would go below isn't there. `text` is how it reads, `keys` what filters match, `sort` what it sorts by.
  function entryCell(obj, c, ix) {
    let at = obj;
    for (const label of c.path.slice(0, -1)) {
      at = ix.entries.get(at)?.get(norm(label));
      if (!at) return { blocked: true, text: '', keys: [], sort: null };
    }
    const id = ix.entries.get(at)?.get(norm(c.label)) ?? null;
    const r = id ? records[id] : null;
    if (!r) {
      const param = paramAt(c.label, at);
      const error = ix.errors.get(`${at}|${norm(c.label)}`)?.error ?? null;
      return { at, id: null, r: null, error, covered: coveredParams().has(param), missing: !error && required.includes(param),
        text: error?.code ?? '', keys: [], sort: null };
    }
    const base = { at, id, r, computed: isComputed(id), info: formulaInfo(id) };
    if (isTag(r)) return { ...base, text: Parts.outputText(r), keys: [String(r.tag)], sort: r.tag ? 0 : 1 };
    if (isChoice(r)) return { ...base, text: r.choice, keys: [norm(r.choice)], sort: norm(r.choice) };
    const text = displayValue(r);
    return { ...base, text, keys: [String(r.value)], sort: typeof r.value === 'number' || r.field === 'date' ? r.value : norm(text) };
  }

  // A relation column's cell: the relatives in that role, each { id, target, name, detail, computed }.
  // A ruled-out relation isn't one of the list.
  function relationCell(obj, c, ix) {
    const items = (ix.relations.get(obj)?.get(c.key) ?? []).map(id => relative(obj, c, id, ix)).filter(Boolean)
      .sort((a, b) => a.computed - b.computed || byLabel(a.name, b.name));
    return { items, text: items.map(i => i.text).join('; '), keys: items.map(i => i.target), sort: items.length ? norm(items[0].name) : null };
  }

  // One relative, seen from `obj`: the object in the first other role, in the relation's own order, with the
  // relation's detail (an ownership's Percentage, a position's option) and, for a relation of more than two,
  // the rest of its sides (Calder Ridge GP · on behalf of Fund III).
  function relative(obj, c, id, ix) {
    const r = records[id];
    if (isTag(r) && !r.tag) return null;
    const own = r.args.find(a => same(a.edge, c.own) && ix.objectAt(a.at) === obj);
    if (!own) return null;
    const edges = names[c.form]?.edges ?? [];
    const rank = a => { const i = edges.findIndex(e => same(e, a.edge)); return i < 0 ? edges.length : i; };
    const others = r.args.filter(a => a !== own).sort((a, b) => rank(a) - rank(b));
    const objs = others.map(a => ix.objectAt(a.at));
    if (!objs[0]) return null;
    const rest = others.slice(1).map((a, i) => objs[i + 1] && `${a.edge.toLowerCase()} ${ix.nameOf(objs[i + 1])}`).filter(Boolean);
    const detail = [relationDetail(id, ix), ...rest].filter(Boolean).join(' · ');
    const name = ix.nameOf(objs[0]);
    return { id, target: objs[0], name, detail, sides: rest.length > 0, computed: isComputed(id), text: detail ? `${name} (${detail})` : name };
  }

  // A relation's one detail: its option or value, or else the first field located at it.
  function relationDetail(id, ix) {
    const r = records[id];
    if (isChoice(r)) return r.choice;
    if (isField(r)) return displayValue(r);
    const fields = [...(ix.entries.get(id)?.values() ?? [])].filter(k => isField(records[k]));
    if (!fields.length) return '';
    const compare = orderedBy(order[specKey(records, id)] ?? []);
    fields.sort((a, b) => compare({ type: 'field', label: records[a].edge }, { type: 'field', label: records[b].edge }));
    return displayValue(records[fields[0]]);
  }

  // Whether a cell can be typed in or picked from here. A computed value can't, nor a blank a definition
  // covers, nor an entry whose place above is missing.
  const editable = (cell, c) => !c.rel && !cell.blocked && !cell.error && (cell.r ? !cell.computed : !cell.covered);
  const isNumeric = c => !c.rel && c.type === 'field' && ['number', 'percent', 'money'].includes(c.datatype);
  // Identifiers (an EIN, a file number) read best in tabular figures with a slashed zero.
  const looksLikeId = s => /^[A-Z0-9][A-Z0-9.\-–/]*$/i.test(s) && /\d/.test(s);

  // ---- Rows ----

  const filterOf = f => colByKey(f.col);
  const anyFilter = () => ui.filters.some(f => filterOf(f) && isActive(f)) || !!clean(ui.search) || ui.needs;
  const isActive = f => f.op === 'empty' || f.op === 'filled' || f.values.length > 0;

  function passes(f, cell) {
    const has = cell.keys.length > 0;
    if (f.op === 'empty') return !has;
    if (f.op === 'filled') return has;
    if (!f.values.length) return true;
    const hit = cell.keys.some(k => f.values.includes(k));
    return f.op === 'not' ? !hit : hit;
  }

  // Whether a row has a required entry blank, in any column of entries, shown or not.
  const lacking = (P, cols, id) => cols.some(c => c.required && !c.rel && P.cell(id, c).missing);

  // The rows shown: the objects that pass the filters and the search, sorted. Unsorted, they're in name
  // order, and either way rows added here stay at the end, where they were typed, until the rows are sorted
  // again, so a new row doesn't jump away as it's filled in.
  function shownRows(P, cols, shownCols) {
    const q = norm(ui.search);
    const filters = ui.filters.map(f => [f, filterOf(f)]).filter(([f, c]) => c && isActive(f));
    const ids = P.objects.filter(id => filters.every(([f, c]) => passes(f, P.cell(id, c)))
      && (!q || shownCols.some(c => norm(P.cell(id, c).text).includes(q)))
      && (!ui.needs || lacking(P, cols, id)));
    const byName = (a, b) => byLabel(P.ix.nameOf(a), P.ix.nameOf(b));
    const sort = ui.prefs.sort, col = sort && cols.find(c => c.key === sort.key);
    const compare = !col ? byName : (a, b) => {
      const x = P.cell(a, col).sort, y = P.cell(b, col).sort;
      if (x === null || y === null) return (x === null) - (y === null) || byName(a, b);
      return (typeof x === 'number' ? x - y : byLabel(String(x), String(y))) * sort.dir || byName(a, b);
    };
    const fresh = ui.added.filter(id => ids.includes(id));
    return [...ids.filter(id => !fresh.includes(id)).sort(compare), ...fresh];
  }

  // The values a column has across the kind, to filter by: each { key, text, n }, in its sort's order.
  function filterValues(P, c) {
    const out = new Map();
    for (const id of P.objects) {
      const cell = P.cell(id, c);
      const pairs = c.rel ? cell.items.map(i => [i.target, i.name, norm(i.name)])
        : cell.keys.map(k => [k, c.type === 'tag' ? (k === 'true' ? 'Attested' : 'Ruled out') : cell.text, cell.sort]);
      for (const [key, text, sort] of pairs) {
        if (!out.has(key)) out.set(key, { key, text, sort, n: 0 });
        out.get(key).n++;
      }
    }
    return [...out.values()].sort((a, b) => typeof a.sort === 'number' && typeof b.sort === 'number' ? a.sort - b.sort : byLabel(String(a.text), String(b.text)));
  }

  // Drops what points at rows or columns that are gone, after an undo, say, or a change in another tab.
  function tidy(shownCols) {
    const keys = new Set(shownCols.map(c => c.key));
    const there = id => !!records[id];
    if (ui.active && !(there(ui.active.row) && keys.has(ui.active.col))) ui.active = null;
    if (ui.edit && !(there(ui.edit.row) && keys.has(ui.edit.col))) ui.edit = null;
    if (ui.pop && !(there(ui.pop.row) && keys.has(ui.pop.col))) ui.pop = null;
    // A filter that filters nothing goes, once its menu is closed.
    ui.filters = ui.filters.filter(f => isActive(f) || f.col === ui.filterMenu);
    for (const id of ui.checked) if (!there(id)) ui.checked.delete(id);
  }

  // ---- Rendering ----

  // How wide a column starts, from its heading and the longest value it has, within bounds for its sort.
  // Name, which stays in view, takes no more than a quarter of the window.
  const WIDTHS = { name: [220, 340], text: [120, 280], document: [150, 280], date: [128, 168], number: [96, 150], percent: [96, 130],
    money: [112, 170], tag: [96, 176], choice: [128, 264], relation: [160, 320] };
  function widthOf(c, P) {
    const sort = c.isName ? 'name' : c.rel ? 'relation' : c.type === 'field' ? c.datatype : c.type;
    const [min, most] = WIDTHS[sort] ?? [120, 260];
    const max = c.isName ? Math.max(min, Math.min(most, innerWidth / 4)) : most;
    const head = 28 + 7.2 * (c.label.length + (c.computedBy || c.computed ? 3 : 0) + (c.required ? 2 : 0) + 2);
    // A choice leaves room for its chevron; a list of relatives, for its first chip and a count of the rest.
    let body = 0;
    if (c.type !== 'tag') for (const id of P.objects) {
      const cell = P.cell(id, c);
      body = Math.max(body, c.rel ? (cell.items.length ? 44 + 6.8 * cell.items[0].text.length + (cell.items.length > 1 ? 30 : 0) : 0)
        : 32 + 7.5 * cell.text.length + (c.type === 'choice' ? 22 : 0));
    }
    return Math.round(Math.min(max, Math.max(min, head, body)));
  }

  function columnTitle(c) {
    const lines = [c.parent ? `${c.label}, below ${c.path.slice(0, -1).join(' › ')}` : c.label];
    if (c.rel) lines.push(`${formName(c.form)}, with this ${word()} as ${c.own}`);
    const d = c.computedBy;
    if (d) lines.push(d.implications ? `Worked out by formula: implied by ${d.implications.map(i => i.label).join(', ')}` : `Worked out by formula: ${d.formula}`);
    else if (c.computed) lines.push('Worked out by formula');
    if (c.required) lines.push(`Required on every ${word()}${c.parent ? ' that has its place' : ''}`);
    return lines.join('\n');
  }

  // A heading sorts by its column when clicked, and its chevron (or a right-click) opens the column's menu;
  // dragging it reorders the entries.
  function headHtml(c) {
    const sort = ui.prefs.sort?.key === c.key ? ui.prefs.sort.dir : 0;
    const cls = ['rec-head-cell', c.isName ? 'is-sticky rec-name' : '', isNumeric(c) ? 'num' : '', c.computedBy || c.computed ? 'is-computed' : '',
      !c.isName && !c.rel && !c.parent ? 'is-movable' : ''].filter(Boolean).join(' ');
    const extra = `${c.required ? '<span class="req-mark" aria-hidden="true">*</span>' : ''}${c.computedBy || c.computed ? '<span class="rec-fx" aria-hidden="true">fx</span>' : ''}`;
    return Parts.columnHead({ label: c.label, sort, cmd: 'records.sort', menu: 'records.head', data: { col: c.key }, cls, extra, title: columnTitle(c) });
  }

  // A relative's chip, drawn by Parts once for each state, as the same relative recurs down a column.
  const chipMemo = new WeakMap();
  function chipHtml(i) {
    if (!chipMemo.has(records)) chipMemo.set(records, new Map());
    const memo = chipMemo.get(records), key = `${i.target}\u0000${i.detail}\u0000${i.computed}`;
    if (!memo.has(key)) memo.set(key, Parts.chip(i.target, { detail: i.detail, computed: i.computed }));
    return memo.get(key);
  }

  // Relatives as chips: as many as fit the cell once it's drawn (see fitChips), then how many more.
  function chipsHtml(cell) {
    if (!cell.items.length) return '';
    return `<span class="rec-chips">${cell.items.map(i => i.sides ? `<span class="rec-sides">${chipHtml(i)}</span>` : chipHtml(i)).join('')}<span class="rec-more" hidden></span></span>`;
  }

  // Hides the chips that don't fit, from the end, behind a count; one left that still doesn't fit may
  // shrink. Everything is measured before anything changes, so the table is laid out once for it all.
  function fitChips() {
    const GAP = 4, MORE = 30;
    const boxes = [...document.querySelectorAll('.rec-chips')].map(box => {
      const chips = [...box.querySelectorAll('.chip')];
      return { box, chips, room: box.clientWidth, widths: chips.map(c => c.offsetWidth) };
    });
    return () => boxes.forEach(({ box, chips, room, widths }) => {
      let used = widths.reduce((a, w) => a + w + GAP, -GAP);
      if (used <= room) return;
      let keep = chips.length;
      while (keep > 1 && used + GAP + MORE > room) used -= widths[--keep] + GAP;
      chips.slice(keep).forEach(c => { c.style.display = 'none'; });
      const more = box.querySelector('.rec-more');
      if (keep < chips.length) { more.hidden = false; more.textContent = `+${chips.length - keep}`; }
      if (used + (keep < chips.length ? GAP + MORE : 0) > room) box.classList.add('is-squeezed');
    });
  }

  function cellHtml(obj, c, P) {
    const cell = P.cell(obj, c);
    const active = ui.active?.row === obj && ui.active.col === c.key;
    const cls = ['rec-cell'];
    if (c.isName) cls.push('is-sticky', 'rec-name');
    if (isNumeric(c)) cls.push('num');
    if (c.type === 'field' && c.datatype === 'date') cls.push('tnum');
    if (active) cls.push('is-active');
    const attrs = `data-col="${esc(c.key)}" tabindex="${active ? 0 : -1}"`;
    if (ui.edit?.row === obj && ui.edit.col === c.key) {
      const e = ui.edit;
      return `<td class="${cls.join(' ')} is-editing" ${attrs}><input class="rec-input" data-focus="edit" value="${esc(e.text)}" placeholder="${esc(c.datatype === 'text' ? '' : VALUE_HINTS[c.datatype] ?? '')}"
        aria-label="${esc(c.label)}" autocomplete="off" spellcheck="false">${e.error ? `<div class="rec-error" role="alert">${esc(e.error)}</div>` : ''}</td>`;
    }
    let html = '', title = cell.text;
    const tagAttrs = 'data-tag tabindex="-1"';
    if (c.rel) html = chipsHtml(cell);
    else if (cell.blocked) {
      cls.push('is-blocked');
      title = `Needs ${c.path.at(-2)} first`;
    } else if (!cell.r) {
      if (cell.error) { html = Parts.formulaError(cell.error.code); title = `${cell.error.msg} (${c.computedBy?.name ?? 'a formula'})`; }
      else if (cell.missing) {
        cls.push('is-missing');
        html = c.type === 'tag' ? `${checkbox(null, tagAttrs)}<span class="req-mark" aria-hidden="true">*</span>` : '<span class="rec-req">Required</span>';
        title = `${c.label} is required`;
      }
      else if (cell.covered) title = 'Worked out by formula, which gives nothing here';
      else if (c.type === 'tag') html = checkbox(null, tagAttrs);
    } else if (isTag(cell.r)) {
      html = Parts.tagBox(cell.id, tagAttrs);
      title = cell.computed ? `${cell.r.tag ? 'Attested' : 'Ruled out'} by formula` : '';
    } else if (isChoice(cell.r)) {
      html = `<span class="rec-choice"><span class="rec-choice-text">${Parts.output(cell.id)}</span>${editable(cell, c) ? icon('chevron-down', 'rec-chev') : ''}</span>`;
    } else if (c.isName) {
      // Cut short, a name keeps its end, which tells it from the kind's like names; the whole is on hover.
      const [head, tail] = P.parts(cell.text);
      html = tail ? `<a class="row-link cut" href="${Shell.recordHref(obj)}"><span class="cut-head">${esc(head)}</span><span class="cut-tail">${esc(tail)}</span></a>`
        : `<a class="row-link" href="${Shell.recordHref(obj)}">${esc(cell.text)}</a>`;
    } else {
      html = looksLikeId(cell.text) ? `<span class="ident">${Parts.output(cell.id)}</span>` : Parts.output(cell.id);
      if (cell.r.field === 'document') title = cell.r.value;
    }
    if (cell.r?.computed || (!c.rel && c.computedBy && !cell.r)) cls.push('is-computed');
    // The corner mark on an entered value a formula also covers offers Use formula.
    html += cell.r ? Parts.overrideMark(cell.id, `data-cmd="records.override" data-row="${esc(obj)}" data-col="${esc(c.key)}" tabindex="-1"`) : '';
    return `<td class="${cls.join(' ')}" ${attrs}${title ? ` title="${esc(title)}"` : ''}>${html}</td>`;
  }

  function rowHtml(id, n, cols, P) {
    const checked = ui.checked.has(id);
    return `<tr data-row="${esc(id)}" aria-selected="${checked}">
      <td class="rec-sel is-sticky"><span class="rec-num">${n}</span><input type="checkbox" class="row-check" data-check="${esc(id)}"${checked ? ' checked' : ''} tabindex="-1" aria-label="Select ${esc(P.ix.nameOf(id))}"></td>
      ${cols.map(c => cellHtml(id, c, P)).join('')}<td class="rec-fill"></td></tr>`;
  }

  // The last row: a new row being named, or the way to start one.
  function endRow(cols) {
    if (!ui.draft) return `<tr class="rec-add"><td colspan="${cols.length + 2}"><button class="rec-add-btn" data-cmd="records.new">${icon('plus')}New ${esc(word())}</button></td></tr>`;
    const d = ui.draft;
    return `<tr class="rec-draft"><td class="rec-sel is-sticky"><span class="rec-num">${icon('plus')}</span></td>
      <td class="rec-cell is-sticky rec-name is-editing"><input class="rec-input" data-focus="draft" value="${esc(d.text)}" placeholder="Name" aria-label="Name of the new ${esc(word())}" autocomplete="off" spellcheck="false">
        ${d.error ? `<div class="rec-error" role="alert">${esc(d.error)}</div>` : ''}</td>
      <td class="rec-draft-hint" colspan="${cols.length}"><span><kbd>Enter</kbd> adds it</span><span><kbd>Tab</kbd> adds it and moves on</span><span><kbd>Esc</kbd> cancels</span></td></tr>`;
  }

  function tableHtml(rows, cols, P) {
    const widths = cols.map(c => widthOf(c, P));
    const total = 44 + widths.reduce((a, b) => a + b, 0);
    const all = rows.length > 0 && rows.every(id => ui.checked.has(id));
    return `<div class="table-wrap rec-wrap" style="--name-w:${widths[0]}px">
      <table class="table rec-table${ui.checked.size ? ' has-checked' : ''}" role="grid" aria-label="${esc(kindPlural())}" aria-rowcount="${rows.length + 1}" style="width:max(100%, ${total}px)">
        <colgroup><col style="width:44px">${widths.map(w => `<col style="width:${w}px">`).join('')}<col></colgroup>
        <thead><tr><th class="rec-sel is-sticky"><input type="checkbox" class="row-check" data-check="*"${all ? ' checked' : ''} tabindex="-1" aria-label="Select every row shown"></th>${cols.map(headHtml).join('')}<th class="rec-fill"></th></tr></thead>
        <tbody>${rows.map((id, i) => rowHtml(id, i + 1, cols, P)).join('')}${endRow(cols)}</tbody>
      </table></div>`;
  }

  const OPS = { is: 'is', not: 'is not', empty: 'is empty', filled: 'is not empty' };

  // A filter as its chip reads, as text and as markup: Jurisdiction is Delaware, Vehicle Type is not
  // Blocker or Feeder Fund.
  function filterSummary(f, c, P) {
    if (!isActive(f)) return { text: c.label, html: esc(c.label) };
    if (f.op === 'empty' || f.op === 'filled') return { text: `${c.label} ${OPS[f.op]}`, html: esc(`${c.label} ${OPS[f.op]}`) };
    const texts = new Map(filterValues(P, c).map(v => [v.key, v.text]));
    const vals = f.values.map(k => texts.get(k) ?? (c.rel ? 'a record no longer here' : k));
    const shown = vals.length < 3 ? vals.join(' or ') : `${vals.length} values`;
    return { text: `${c.label} ${OPS[f.op]} ${vals.join(' or ')}`, html: `${esc(c.label)} ${OPS[f.op]} <b>${esc(shown)}</b>` };
  }

  // The filters set, then, like Stripe's, a few choices offered as filters of their own, unset
  // (+ Jurisdiction): those that tell the most rows apart, as many as fit on the line (see fitFilters).
  function filtersHtml(cols, shownCols, P) {
    const set = ui.filters.map(f => {
      const c = filterOf(f);
      if (!c || !isActive(f) && ui.filterMenu !== f.col) return '';
      const s = filterSummary(f, c, P);
      return Parts.filterChip({ label: c.label, text: s.html, title: s.text, cmd: 'records.filter-open', clear: 'records.filter-remove', data: { col: c.key } });
    }).join('');
    const needs = ui.needs ? Parts.filterChip({ label: 'Missing a required entry', text: 'Missing a required entry', cmd: 'records.needs', clear: 'records.needs', tone: 'warn' }) : '';
    const quick = shownCols.filter(c => c.type === 'choice' && !c.parent && c.options.length > 1 && !ui.filters.some(f => f.col === c.key))
      .map(c => [c, P.objects.filter(id => P.cell(id, c).r).length]).filter(([, n]) => n > 1)
      .sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c]) => c);
    const more = cols.some(c => !c.isName && !quick.includes(c));
    return `<div class="filters rec-filters">${set}${needs}
      ${quick.map(c => Parts.filterChip({ label: c.label, cmd: 'records.filter-add', data: { col: c.key } })).join('')}
      ${more ? Parts.filterChip({ label: quick.length ? 'More filters' : 'Filter', cmd: 'records.filter-pick' }) : ''}
      ${conditions() > 1 ? '<button class="link-btn rec-clear" data-cmd="records.clear-filters">Clear filters</button>' : ''}</div>`;
  }
  // How many conditions narrow the rows: each filter set, the search, and Missing a required entry. One
  // is cleared by its own ×; Clear filters appears once there are more.
  const conditions = () => ui.filters.filter(f => filterOf(f) && isActive(f)).length + (clean(ui.search) ? 1 : 0) + (ui.needs ? 1 : 0);

  // Keeps the filters to one line: the unset ones offered go, from the end, until the rest fit. Measured
  // first and changed after, like fitChips, which it runs with.
  function fitFilters() {
    const bar = document.querySelector('.rec-filters');
    if (!bar) return () => {};
    const GAP = 6;
    const items = [...bar.children].map(el => ({ el, quick: el.dataset.cmd === 'records.filter-add', width: el.offsetWidth + GAP }));
    const room = bar.clientWidth + GAP;
    return () => {
      let used = items.reduce((a, i) => a + i.width, 0);
      for (const i of items.filter(x => x.quick).reverse()) {
        if (used <= room) break;
        i.el.style.display = 'none';
        used -= i.width;
      }
    };
  }

  // ---- Menus ----
  // The View menu and each filter's are the shell's (Shell.menu): what can be chosen together is ticked as
  // it's chosen, and the menu stays open, its chip following along.

  // Columns as a menu lists them: grouped by where an entry sits (on the object, or below an entry), then
  // the lists of relatives; or, once something's typed, the columns it finds, best first, each saying where.
  function columnItems(cols, query, item) {
    const where = c => c.rel ? 'Relations' : c.parent ? `Below ${c.path.slice(0, -1).join(' › ')}` : `On each ${word()}`;
    if (clean(query)) {
      const found = rankBy(cols, query, c => c.rel ? c.label : c.path.join(' '));
      return found.length ? found.map(c => ({ ...item(c), desc: where(c) })) : [{ note: `No column is called “${clean(query)}”.` }];
    }
    const groups = new Map();
    for (const c of cols) pushTo(groups, where(c), c);
    return [...groups].flatMap(([head, list], i) => [...(i ? [{ sep: true }] : []), { head }, ...list.map(item)]);
  }

  function viewItems(query) {
    const P = readPass();
    const item = c => ({ label: c.label, hint: c.computedBy || c.computed ? 'fx' : '', ticked: isShown(c, P), disabled: c.isName,
      title: columnTitle(c), run: () => setShown(c.key, !isShown(c, readPass())) });
    return [...columnItems(columns(), query, item), { sep: true },
      { label: 'Show all', keep: true, run: () => { setPrefs({ cols: Object.fromEntries(columns().map(c => [c.key, true])) }); draw(); } },
      { label: 'Reset', keep: true, run: () => { setPrefs({ cols: firstColumns(columns(), readPass()) }); draw(); } }];
  }
  const openView = el => Shell.menu(el, viewItems, 'records-view', { search: 'Find a column' });

  // A filter's menu: its condition, then the values to pick, each with how many rows have it, and a way
  // to remove it.
  function filterItems(col, query) {
    const f = ui.filters.find(x => x.col === col), c = colByKey(col);
    if (!f || !c) return [{ note: 'This filter is no longer here.' }];
    const all = filterValues(readPass(), c);
    const values = all.filter(v => !clean(query) || norm(v.text).includes(norm(query)));
    const picking = f.op === 'is' || f.op === 'not';
    const toggle = key => { f.values = f.values.includes(key) ? f.values.filter(v => v !== key) : [...f.values, key]; saveSession(); draw(); };
    return [
      { label: c.label, select: Object.entries(OPS), value: f.op, run: op => { f.op = op; saveSession(); draw(); } },
      ...(!picking ? [] : values.length ? values.map(v => ({ label: String(v.text), hint: String(v.n), ticked: f.values.includes(v.key), run: () => toggle(v.key) }))
        : [{ note: all.length ? 'Nothing matches.' : 'No values yet.' }]),
      { sep: true },
      { label: 'Remove filter', run: () => removeFilter(col) },
    ];
  }
  function openFilter(col) {
    const anchor = document.querySelector(`[data-cmd="records.filter-open"][data-col="${CSS.escape(col)}"]`);
    if (!anchor) return;
    ui.filterMenu = col;
    Shell.menu(anchor, query => filterItems(col, query), `records-filter:${col}`, {
      search: filterValues(readPass(), colByKey(col)).length > 8 ? 'Find a value' : null,
      onClose: () => { if (ui.filterMenu === col) ui.filterMenu = null; saveSession(); draw(); },
    });
  }

  // The options a choice cell offers: those its parameterization has in the schema there, or else every
  // option the column has.
  function choiceOptions(c, cell) {
    const here = specsWithParam(paramAt(c.label, cell.at)).filter(t => 'choice' in t.out).map(t => t.out.choice);
    return [...new Set(here.length ? here : c.options)].sort(byLabel);
  }

  // What's typed lists the options that match, best first, an exact match above all (rankBy), then offers
  // to add it. With nothing typed, the list opens on the cell's own option, so Enter, Enter leaves it be.
  function choicePop(P) {
    const p = ui.pop;
    const c = colByKey(p.col);
    const cell = P.cell(p.row, c);
    const options = choiceOptions(c, cell);
    const q = clean(p.query);
    p.items = [...rankBy(options, q).map(value => ({ value })), ...(q && !options.some(o => same(o, q)) ? [{ value: q, create: true }] : [])];
    if (p.active === null) p.active = p.items.findIndex(it => cell.r && same(cell.r.choice, it.value));
    p.active = Math.max(0, Math.min(p.active, p.items.length - 1));
    const items = p.items.map((it, i) => `<div class="option${it.create ? ' option-create' : ''}" role="option" data-cmd="records.choose" data-index="${i}" aria-selected="${i === p.active}">
      ${it.create ? `<span class="option-label">Add <strong>${esc(it.value)}</strong></span>` : `<span class="option-label">${esc(it.value)}</span>${cell.r && same(cell.r.choice, it.value) ? icon('check', 'rec-opt-check') : ''}`}</div>`).join('');
    return `<div class="pop rec-pop rec-choice-pop" role="dialog" aria-label="${esc(c.label)}">
      <input class="input rec-pop-search" data-focus="pop" value="${esc(p.query)}" placeholder="${options.length ? 'Find or add an option' : 'Add an option'}" aria-label="${esc(c.label)}" autocomplete="off" spellcheck="false">
      <div class="rec-options" role="listbox">${items || '<div class="rec-pop-note">Type to add an option.</div>'}</div>
      ${cell.r ? `<div class="listbox-sep"></div><div class="option" data-cmd="records.choose-clear" role="option">Clear ${esc(c.label)}</div>` : ''}</div>`;
  }

  // A choice's options are drawn with the page, and placed under the cell once it's in, or above it where
  // there's no room below, so they survive re-rendering.
  function placePop() {
    const el = document.querySelector('.rec-pop');
    const anchor = ui.pop && cellEl(ui.pop);
    if (!el || !anchor) return;
    const a = anchor.getBoundingClientRect();
    el.style.minWidth = `${Math.max(232, a.width)}px`;
    const w = el.offsetWidth, h = el.offsetHeight;
    el.style.left = `${Math.max(8, Math.min(a.left, innerWidth - w - 8))}px`;
    el.style.top = `${a.bottom + 4 + h <= innerHeight - 8 ? a.bottom + 4 : Math.max(8, a.top - h - 4)}px`;
  }

  // ---- The page ----

  let renderQueued = false;
  function pageHtml() {
    renderQueued = false;
    ensureKind();
    // The table about to be replaced says where it was scrolled to.
    const wrap = document.querySelector('.rec-wrap');
    if (wrap) ui.scroll = { left: wrap.scrollLeft, top: ui.toEnd ? 1e9 : wrap.scrollTop };
    const P = readPass();
    const cols = columns();
    if (!ui.prefs.cols) setPrefs({ cols: firstColumns(cols, P) });
    const shownCols = cols.filter(c => isShown(c, P));
    tidy(shownCols);
    const rows = shownRows(P, cols, shownCols);
    if (ui.active && !rows.includes(ui.active.row)) ui.active = null;
    ui.rows = rows;
    ui.cols = shownCols.map(c => c.key);
    const n = P.objects.length;
    const lackingRows = P.objects.filter(id => lacking(P, cols, id)).length;
    const sub = [anyFilter() ? `${rows.length} of ${count(n, word())}` : count(n, word())];
    if (lackingRows) sub.push(`<button class="link-btn rec-needs" data-cmd="records.needs" aria-pressed="${ui.needs}">${lackingRows} missing a required entry</button>`);
    const body = !n && !ui.draft
      ? Parts.empty({ title: `No ${kindPlural().toLowerCase()} yet`, desc: 'They’ll be listed here once added, here or on the chart.', action: { label: `New ${word()}`, cmd: 'records.new' } })
      : !rows.length && !ui.draft
      ? Parts.empty({ title: `No ${kindPlural().toLowerCase()} match`, desc: 'None passes the filters and the search.', action: { label: 'Clear filters', cmd: 'records.clear-filters' } })
      : tableHtml(rows, shownCols, P);
    const bar = ui.checked.size ? `<div class="rec-actionbar" role="toolbar" aria-label="Ticked rows">
        <span class="rec-actionbar-count">${count(ui.checked.size, word())} selected</span>
        <button class="btn btn-sm" data-cmd="records.copy-rows">Copy</button>
        <button class="btn btn-sm rec-delete" data-cmd="records.delete-rows">Delete</button>
        <button class="icon-btn" data-cmd="records.uncheck" aria-label="Clear the selection" title="Clear the selection (Esc)">${icon('x')}</button></div>` : '';
    return `<div class="content is-wide rec-page">
      <div class="page-head rec-head"><div class="page-head-text"><h2 class="page-title">${esc(kindPlural())}</h2><p class="page-sub">${sub.join('<span class="rec-dot">·</span>')}</p></div></div>
      ${n || ui.draft ? `<div class="rec-bar">
        <label class="search-input rec-search">${icon('search')}<input class="input" data-focus="search" value="${esc(ui.search)}" placeholder="Search ${esc(kindPlural().toLowerCase())}" aria-label="Search ${esc(kindPlural().toLowerCase())}" autocomplete="off" spellcheck="false"></label>
        ${filtersHtml(cols, shownCols, P)}
        <div class="rec-bar-end"><button class="btn btn-sm" data-cmd="records.view" aria-haspopup="menu">View${icon('chevron-down')}</button></div>
      </div>` : ''}
      ${body}${bar}${ui.pop ? choicePop(P) : ''}</div>`;
  }

  const cellEl = at => at && document.querySelector(`.rec-table tr[data-row="${CSS.escape(at.row)}"] td[data-col="${CSS.escape(at.col)}"]`);

  // Draws the page's own content again, for a change to what it shows rather than to the records, which
  // leaves the sidebar and the top bar as they are. A change to the records renders the whole page.
  function draw() {
    const main = document.getElementById('main');
    // A click that saved an edit on its way in leaves the whole page to render.
    if (!main || renderQueued) return render();
    main.innerHTML = pageHtml();
    after();
  }

  function after() {
    // Everything is measured before anything is changed, so the table is laid out as few times as can be.
    const fits = [fitChips(), fitFilters()];
    fits.forEach(fit => fit());
    const wrap = document.querySelector('.rec-wrap');
    if (wrap) {
      wrap.scrollLeft = ui.scroll.left;
      wrap.scrollTop = ui.toEnd ? wrap.scrollHeight : ui.scroll.top;
      ui.toEnd = false;
      wrap.classList.toggle('is-scrolled', wrap.scrollLeft > 0);
      const all = wrap.querySelector('[data-check="*"]');
      if (all) all.indeterminate = !all.checked && ui.rows.some(id => ui.checked.has(id));
    }
    placePop();
    // A popover eases in when it opens, on its option in view, but not each time it's drawn again while open.
    if (ui.pop?.fresh) {
      document.querySelector('.rec-pop')?.classList.add('is-opening');
      document.querySelector('.rec-choice-pop .option[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
      ui.pop.fresh = false;
    }
    // The keyboard goes back where it was: the box being typed in, the popover, the search, or the active cell.
    const box = ui.edit ? document.querySelector('[data-focus="edit"]') : ui.draft && ui.focus === 'draft' ? document.querySelector('[data-focus="draft"]')
      : ui.pop && ui.focus === 'pop' ? document.querySelector('.rec-pop [data-focus="pop"]') ?? document.querySelector('.rec-pop')
      : ui.focus === 'search' ? document.querySelector('[data-focus="search"]') : null;
    if (box) {
      box.focus({ preventScroll: true });
      if (box.setSelectionRange) { const end = box.value.length; box.setSelectionRange(...(ui.caret ?? [end, end])); }
    } else if (ui.active && ui.focus === 'grid') {
      cellEl(ui.active)?.focus({ preventScroll: true });
    }
    if (ui.reveal) { ui.reveal = false; reveal(); }
    if (sidebarStale) { sidebarStale = false; Shell.render(); }
  }

  // Brings the active cell into view, clear of the sticky header and Name column.
  function reveal() {
    const td = cellEl(ui.active) ?? document.querySelector('.rec-draft');
    td?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  // Moves the highlight to the active cell without drawing the table again, where it's already drawn.
  function showActive() {
    const td = cellEl(ui.active);
    if (!td) return draw();
    for (const x of document.querySelectorAll('.rec-table .is-active')) { x.classList.remove('is-active'); x.tabIndex = -1; }
    td.classList.add('is-active');
    td.tabIndex = 0;
    td.focus({ preventScroll: true });
    reveal();
  }

  function setActive(row, col, { show = true } = {}) {
    ui.active = { row, col };
    ui.focus = 'grid';
    ui.reveal = true;
    if (show) showActive();
  }

  // Moves the active cell by rows and columns, Tab wrapping to the next row.
  function move(dr, dc, wrap = false) {
    if (!ui.active) return;
    let r = ui.rows.indexOf(ui.active.row), c = ui.cols.indexOf(ui.active.col);
    if (r < 0 || c < 0) return;
    c += dc;
    if (wrap && c >= ui.cols.length && r < ui.rows.length - 1) { c = 0; r++; }
    if (wrap && c < 0 && r > 0) { c = ui.cols.length - 1; r--; }
    r = Math.max(0, Math.min(ui.rows.length - 1, r + dr));
    c = Math.max(0, Math.min(ui.cols.length - 1, c));
    ui.active = { row: ui.rows[r], col: ui.cols[c] };
    ui.reveal = true;
  }

  // ---- Editing ----

  // Starts typing in a field's cell, with what it holds (a document as its address), or `text` typed over it.
  function startEdit(row, c, text) {
    const cell = readPass().cell(row, c);
    if (!editable(cell, c)) return;
    const shown = cell.r ? (cell.r.field === 'document' ? String(cell.r.value) : displayValue(cell.r)) : '';
    Object.assign(ui, { active: { row, col: c.key }, edit: { row, col: c.key, text: text ?? shown, error: null }, focus: 'edit', caret: null, pop: null });
    draw();
  }

  // Saves what's typed in the cell being edited, read in its datatype. Emptying a cell clears its entry.
  // Returns why it couldn't, and the cell stays open to put it right.
  function commitEdit() {
    const e = ui.edit;
    if (!e) return null;
    const c = colByKey(e.col);
    const cell = c && records[e.row] ? readPass().cell(e.row, c) : null;
    if (!cell || !editable(cell, c)) { ui.edit = null; return null; }
    let error = null;
    if (!clean(e.text)) error = !cell.r ? null : c.isName ? `Every ${word()} needs a Name.` : clearCell(e.row, c, cell);
    else error = cell.r ? saveFieldValue(cell.id, e.text, c.label) : addFieldValue(cell.at, c.label, e.text, c.datatype);
    // A date can be typed many ways; the panel says so with an example, and so does the table.
    if (error) { e.error = error.replace(/a date here\.$/, 'a date here, like March 4, 2019.'); return error; }
    ui.edit = null;
    return null;
  }

  // Clears a cell: its entry goes to Deleted with whatever is below it, and Undo brings it back.
  function clearCell(row, c, cell = readPass().cell(row, c)) {
    if (!cell.r) return null;
    if (c.isName) return `Every ${word()} needs a Name.`;
    if (cell.computed) return `${c.label} is worked out by formula here.`;
    const below = withDependents([cell.id]).size - 1;
    const name = tableIndex().nameOf(row);
    const error = deleteRecords([cell.id], `${c.label} on ${name}`);
    if (!error) Shell.toast(below ? `Cleared ${c.label} on ${name}, with ${count(below, 'record')} below it` : `Cleared ${c.label} on ${name}`, { undo: true });
    return error;
  }

  function openChoice(row, c, query = '') {
    const cell = readPass().cell(row, c);
    if (!editable(cell, c)) return;
    Object.assign(ui, { active: { row, col: c.key }, edit: null, pop: { row, col: c.key, query, active: query ? 0 : null, fresh: true }, focus: 'pop', caret: null });
    draw();
  }

  // Sets a choice's option, matching one the schema has whatever its case, or adds a new one. What's located
  // at the choice moves with it to the new option, which the toast says, since it's easily missed.
  function setChoice(row, c, value) {
    const cell = readPass().cell(row, c);
    const option = choiceOptions(c, cell).find(o => same(o, value)) ?? clean(value);
    if (!option || (cell.r && cell.r.choice === option)) return null;
    if (!cell.r) return commit({ ...records, [newId()]: { at: cell.at, edge: c.label, choice: option } });
    const below = [...(tableIndex().entries.get(cell.id)?.keys() ?? [])].length + relationsAt(cell.id).length;
    const error = commit({ ...records, [cell.id]: { ...cell.r, choice: option } });
    if (!error && below) Shell.toast(`Changed ${c.label} to ${option}; the ${count(below, 'record')} below it moved with it`, { undo: true });
    return error;
  }

  function chooseOption(index) {
    const p = ui.pop;
    const item = p?.items?.[index];
    if (!item) return;
    const error = setChoice(p.row, colByKey(p.col), item.value);
    ui.pop = null;
    ui.focus = 'grid';
    if (error) Shell.toast(error, { tone: 'error' });
    render();
  }

  // A computed tag can be switched, overriding its formula there, once it's clear what that means.
  function confirmOverride(row, c, cell) {
    const d = cell.info && definitionOf(cell.info.def);
    const why = !d ? 'worked out by formula' : cell.info.labels?.length ? `implied by ${joinList(cell.info.labels)} in ${d.name}` : `worked out by ${d.name}’s formula`;
    const ruling = cell.r.tag;
    return Shell.confirm({
      title: `${ruling ? 'Rule out' : 'Attest'} ${c.label} for ${tableIndex().nameOf(row)}?`,
      body: `It’s ${why}. It stays ${ruling ? 'ruled out' : 'attested'}, overriding the formula, until you use the formula again.`,
      confirm: ruling ? 'Rule it out' : 'Attest it',
    });
  }

  // Ticks a tag's checkbox: an unrecorded tag is attested; an attested one is ruled out, and back.
  async function toggleTag(row, c) {
    const cell = readPass().cell(row, c);
    if (c.rel || cell.blocked || cell.error || (!cell.r && cell.covered)) return;
    let error;
    if (!cell.r) error = commit({ ...records, [newId()]: { at: cell.at, edge: c.label, tag: true } });
    else {
      if (cell.computed && !await confirmOverride(row, c, cell)) return;
      error = commit({ ...records, [cell.id]: { ...cell.r, tag: !cell.r.tag } });
      if (!error && cell.computed) Shell.toast(`${cell.r.tag ? 'Ruled out' : 'Attested'} ${c.label} for ${tableIndex().nameOf(row)}, overriding the formula`, { undo: true });
    }
    if (error) Shell.toast(error, { tone: 'error' });
    ui.active = { row, col: c.key };
    ui.focus = 'grid';
    render();
  }

  // What Enter, a click or typing does on a cell: edits a field, opens a choice's options, ticks a tag.
  function act(row, c, { text = null, viaKey = false } = {}) {
    if (c.rel) return;
    if (c.type === 'tag') return viaKey || text === null ? toggleTag(row, c) : null;
    if (c.type === 'choice') return openChoice(row, c, text ?? '');
    return startEdit(row, c, text ?? undefined);
  }

  // ---- New rows ----

  function startDraft() {
    Object.assign(ui, { draft: ui.draft ?? { text: '', error: null }, edit: null, pop: null, focus: 'draft', caret: null });
    ui.toEnd = true;
    draw();
  }

  // Adds the object being named, returning its id, or why it couldn't be added; nothing typed adds nothing.
  // `again` starts another new row under it.
  function commitDraft(again = false) {
    const name = clean(ui.draft?.text);
    if (!name) { ui.draft = null; return null; }
    const { id, error } = createObject(ui.kind, name);
    if (error) { ui.draft.error = error; return { error }; }
    ui.added.push(id);
    ui.draft = again ? { text: '', error: null } : null;
    return { id };
  }

  // ---- Deleting rows ----

  function deleteRows(ids) {
    const ix = tableIndex();
    const namesOf = ids.map(ix.nameOf);
    const label = namesOf.length < 4 ? joinList(namesOf) : `${namesOf.slice(0, 2).join(', ')} and ${namesOf.length - 2} more`;
    const error = deleteRecords(ids, label);
    if (error) return Shell.toast(error, { tone: 'error' });
    ui.checked.clear();
    ui.anchor = null;
    Shell.toast(`Deleted ${ids.length === 1 ? namesOf[0] : count(ids.length, word())}`, { undo: true });
    render();
  }

  // ---- Copying, pasting and exporting ----

  // The text a cell copies and exports as: a document as its address, a tag as Yes or No, as Excel users
  // write them (and paste reads them), and everything else as it reads.
  const cellText = (cell, c) => c.rel || !cell.r ? cell.text : cell.r.field === 'document' ? String(cell.r.value) : isTag(cell.r) ? (cell.r.tag ? 'Yes' : 'No') : cell.text;
  const tsvField = s => /[\t\n\r"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;

  function rowsAsTsv(ids) {
    const P = readPass();
    const cols = ui.cols.map(colByKey).filter(Boolean);
    return [cols.map(c => c.label), ...ids.map(id => cols.map(c => cellText(P.cell(id, c), c)))].map(r => r.map(tsvField).join('\t')).join('\r\n');
  }

  // Excel copies cells as rows of tab-separated text, quoting a cell that holds a tab, a line break or a
  // quote. A quote that doesn't open a cell quoted that way (one never closed, or closed before its cell
  // ends, as in "Smart" Fund LLC) is read as the character it is, so it can't swallow the rows after it.
  // `unclosed` counts the quotes never closed, for the paste's toast.
  function parseTsv(text) {
    const s = String(text).replace(/\r\n?/g, '\n');
    const literal = new Set();
    let unclosed = 0;
    for (;;) {
      const rows = [[]];
      let cell = '', open = -1, bad = -1;
      for (let i = 0; i < s.length && bad < 0; i++) {
        const ch = s[i];
        if (open >= 0) {
          if (ch === '"' && s[i + 1] === '"') { cell += '"'; i++; }
          else if (ch === '"') { if (i + 1 < s.length && !'\t\n'.includes(s[i + 1])) bad = open; else open = -1; }
          else cell += ch;
        } else if (ch === '"' && cell === '' && !literal.has(i)) open = i;
        else if (ch === '\t') { rows.at(-1).push(cell); cell = ''; }
        else if (ch === '\n') { rows.at(-1).push(cell); rows.push([]); cell = ''; }
        else cell += ch;
      }
      if (bad < 0 && open >= 0) { bad = open; unclosed++; }
      // Read again, with that quote as a character.
      if (bad >= 0) { literal.add(bad); continue; }
      rows.at(-1).push(cell);
      while (rows.length && rows.at(-1).every(x => !clean(x))) rows.pop();
      return Object.assign(rows, { unclosed });
    }
  }

  const YES = /^(yes|y|true|x|✓|✔|attested)$/i, NO = /^(no|n|false|ruled out)$/i;
  const yesNo = s => YES.test(clean(s)) || clean(s) === '1' ? true : NO.test(clean(s)) || clean(s) === '0' ? false : null;

  // A column pasted under a heading the kind doesn't have yet becomes a new entry, of the datatype its
  // values read as: yes-or-no values make a tag, and values of one datatype a field of it.
  function newColumn(label, values) {
    const vals = values.map(clean).filter(Boolean);
    if (vals.length && vals.every(v => YES.test(v) || NO.test(v))) return { label, path: [label], type: 'tag', options: [], fresh: true };
    const types = new Set(vals.map(classify));
    return { label, path: [label], type: 'field', datatype: types.size === 1 ? [...types][0] : 'text', options: [], fresh: true };
  }

  // Which rows and columns pasted cells land in. With a heading row naming Name, columns are matched by
  // their headings, unknown ones becoming new entries, and rows by name (`byName`), unknown ones becoming
  // new objects. Otherwise the cells fill the table from `at` (a row's and a column's place, by default the
  // active cell's), rightward and down, and rows past the last add objects, named by the Name column.
  // `notes` counts what has nowhere to go: values past the last column, or under no heading.
  function pastePlan(grid, cols, at) {
    const ix = tableIndex();
    const notes = { beyond: 0, unheaded: 0 };
    const first = grid[0];
    const nameAt = first.findIndex(h => same(h, 'name'));
    if (nameAt >= 0 && grid.length > 1) {
      const entries = cols.filter(c => !c.rel);
      const heads = first.map((h, j) => !clean(h) ? null
        : entries.find(c => !c.parent && same(c.label, h)) ?? cols.find(c => same(c.path.join(' › '), h) || same(c.label, h))
        ?? newColumn(clean(h), grid.slice(1).map(r => r[j] ?? '')));
      const byName = new Map(readPass().objects.map(id => [norm(ix.nameOf(id)), id]));
      for (const r of grid.slice(1)) notes.unheaded += r.filter((raw, j) => !heads[j] && clean(raw)).length;
      return { notes, byName: true, rows: grid.slice(1).map(r => ({ obj: byName.get(norm(r[nameAt])) ?? null, name: r[nameAt] ?? '',
        cells: heads.map((c, j) => c && [c, r[j] ?? '']).filter(Boolean) })) };
    }
    const r0 = at ? Math.max(0, at.row) : ui.rows.length;
    const c0 = at ? Math.max(0, at.col) : 0;
    return { notes, byName: false, rows: grid.map((r, i) => {
      const obj = ui.rows[r0 + i] ?? null;
      const cells = [];
      r.forEach((raw, j) => { const c = colByKey(ui.cols[c0 + j]); if (c) cells.push([c, raw]); else if (clean(raw)) notes.beyond++; });
      return { obj, name: !obj && c0 === 0 ? r[0] ?? '' : '', cells };
    }) };
  }

  // Puts one pasted value in its cell, in `next`: added, or replacing what's there. Returns true if it
  // changed something, false if it was there already, or why it was left out.
  function pasteValue(next, at, c, raw, child, adopt) {
    const id = child(at, c.label);
    const r = id ? next[id] : null;
    const fresh = !records[at];
    if (r?.computed || (!r && !fresh && coveredParams().has(paramAt(c.label, at)))) return 'computed';
    const type = r ? typeOf(r) : c.type;
    let out;
    if (type === 'tag') {
      const tag = yesNo(raw);
      if (tag === null) return `${c.label} takes Yes or No`;
      if (r?.tag === tag) return false;
      out = { tag };
    } else if (type === 'choice') {
      const choice = c.options.find(o => same(o, raw)) ?? clean(raw);
      if (r && r.choice === choice) return false;
      out = { choice };
    } else {
      const datatype = c.isName ? 'text' : r?.field ?? (fresh ? undefined : fieldDatatype(at, c.label)) ?? c.datatype ?? classify(clean(raw));
      const value = parseValue(datatype, raw);
      if (value === undefined) return `${c.label} takes ${asPhrase(datatype)}`;
      if (r && r.field === datatype && r.value === value) return false;
      out = { field: datatype, value };
    }
    if (r) next[id] = { ...modelPart(r), ...out };
    else { const nid = newId(); next[nid] = { at, edge: c.label, ...out }; adopt(at, c.label, nid); }
    return true;
  }

  // Pastes a block of cells as one change: one undo takes it all back. The toast says what was done, then
  // whatever wasn't as it might seem: values left out and why, quotes kept as typed, names given twice, a
  // percentage past 100% or below 0%, and headings that became new columns.
  function pasteGrid(grid, at = ui.active && { row: ui.rows.indexOf(ui.active.row), col: ui.cols.indexOf(ui.active.col) }) {
    if (!grid.length || !grid[0].length) return;
    const ix = tableIndex();
    const { rows, notes, byName } = pastePlan(grid, columns(), at);
    const next = { ...records };
    const kids = new Map();
    const child = (at, label) => kids.get(at)?.get(norm(label)) ?? ix.entries.get(at)?.get(norm(label));
    const adopt = (at, label, id) => { if (!kids.has(at)) kids.set(at, new Map()); kids.get(at).set(norm(label), id); };
    const left = { computed: 0, relation: 0, unread: [], blocked: 0, unnamed: 0 };
    const added = [], made = new Map(), twice = new Set(), fresh = new Set();
    const names = new Set(readPass().objects.map(id => norm(ix.nameOf(id))));
    let changed = 0;
    for (const row of rows) {
      let obj = row.obj;
      if (!obj) {
        if (!row.cells.some(([, raw]) => clean(raw))) continue;
        const name = clean(row.name);
        if (!name) { left.unnamed++; continue; }
        // Rows matched by name are one object for each name, as they would be for a name already here.
        // Rows placed by position are an object each, and a name given twice is said.
        if (made.has(norm(name)) || names.has(norm(name))) twice.add(name);
        if (byName && made.has(norm(name))) obj = made.get(norm(name));
        else {
          obj = newId();
          next[obj] = { kind: ui.kind };
          const nameId = newId();
          next[nameId] = { at: obj, edge: 'Name', field: 'text', value: name };
          adopt(obj, 'Name', nameId);
          added.push(obj);
          made.set(norm(name), obj);
        }
      }
      for (const [c, raw] of row.cells) {
        if (!clean(raw) || (c.isName && !row.obj)) continue;
        if (c.rel) { left.relation++; continue; }
        let at = obj;
        for (const label of c.path.slice(0, -1)) at = at && child(at, label);
        if (!at) { left.blocked++; continue; }
        const done = pasteValue(next, at, c, raw, child, adopt);
        if (done === true) { changed++; if (c.fresh) fresh.add(c.label); }
        else if (done === 'computed') left.computed++;
        else if (done) left.unread.push(done);
      }
    }
    const odd = Object.keys(next).filter(id => next[id] !== records[id] && next[id].field === 'percent' && (next[id].value > 1 || next[id].value < 0)).length;
    const are = (n, one, many) => n === 1 ? one : many;
    const skipped = [
      fresh.size && `${joinList([...fresh])} ${are(fresh.size, 'wasn’t a column', 'weren’t columns')} of ${kindPlural().toLowerCase()}, so ${are(fresh.size, 'it’s a new one', 'they’re new ones')}`,
      left.unread.length && `${count(left.unread.length, 'value')} couldn’t be read (${left.unread[0]})`,
      left.computed && `${count(left.computed, 'value')} in computed cells ${are(left.computed, 'was', 'were')} left as ${are(left.computed, 'it is', 'they are')}`,
      left.relation && 'relations aren’t pasted; relate records on the chart or their own pages',
      left.blocked && `${count(left.blocked, 'value')} had no entry above to go below`,
      left.unnamed && `${count(left.unnamed, 'new row')} had no Name`,
      notes.unheaded && `${count(notes.unheaded, 'value')} had no heading, and ${are(notes.unheaded, 'was', 'were')} left out`,
      notes.beyond && `${count(notes.beyond, 'value')} went past the last column`,
      grid.unclosed && `${count(grid.unclosed, 'quotation mark')} that never closed ${are(grid.unclosed, 'was', 'were')} kept as typed`,
      twice.size && (byName ? `${joinList([...twice])} ${are(twice.size, 'was', 'were each')} named in more than one row, and taken as one ${word()}`
        : `${joinList([...twice])} ${are(twice.size, 'is', 'are')} now the name of more than one ${word()}`),
      odd && `${count(odd, 'percentage')} ${are(odd, 'is', 'are')} over 100% or below 0%`,
    ].filter(Boolean);
    const sentence = list => list.length ? ` ${list.join('; ').replace(/^./, s => s.toUpperCase())}.` : '';
    // A paste into a box being typed in has closed it, so the page is drawn again whatever comes of it.
    if (!changed && !added.length) { Shell.toast(`Nothing to paste: the values are there already.${sentence(skipped)}`); return draw(); }
    const error = commit(next);
    if (error) { Shell.toast(`Couldn’t paste that: ${error}`, { tone: 'error' }); return draw(); }
    if (added.length) { ensureKindStyles(ui.kind); saveState(); ui.added.push(...added); ui.toEnd = true; }
    const did = [changed && `Pasted ${count(changed, 'value')}`, added.length && `${changed ? 'added' : 'Added'} ${count(added.length, word())}`].filter(Boolean).join(' and ');
    Shell.toast(`${did}.${sentence(skipped)}`, { undo: true });
    render();
  }

  // Saves what's shown, as it reads, in the order shown, to a CSV file that Excel opens as it is. A cell
  // Excel would take for a formula (=, +, - or @ first, and not a number) starts with an apostrophe, so it
  // stays text: a name like =HYPERLINK(…) can't run, and -5 Corp isn't an error.
  function exportCsv() {
    const P = readPass();
    const cols = columns();
    const shownCols = cols.filter(c => isShown(c, P));
    const rows = shownRows(P, cols, shownCols);
    const inert = s => /^[=+\-@\t\r]/.test(s) && !isNumber(s) ? `'${s}` : s;
    const field = s => /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    const lines = [shownCols.map(c => c.label), ...rows.map(id => shownCols.map(c => cellText(P.cell(id, c), c)))];
    // A byte-order mark first, so Excel reads the file as UTF-8.
    const csv = `${String.fromCharCode(0xFEFF)}${lines.map(l => l.map(s => field(inert(s))).join(',')).join('\r\n')}\r\n`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${chartInUse().name} - ${kindPlural()}.csv`.replace(/[\\/:*?"<>|]+/g, '-');
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    Shell.toast(`Exported ${count(rows.length, word())} as CSV`);
  }

  // ---- Columns: showing, hiding, sorting, ordering ----

  function setShown(key, on) {
    setPrefs({ cols: { ...ui.prefs.cols, [key]: on } });
    draw();
  }

  function setSort(key, dir) {
    setPrefs({ sort: key ? { key, dir } : null });
    ui.added = [];
    draw();
  }

  // How a column sorts, in its own words.
  function sortWords(c) {
    if (c.type === 'tag' && !c.rel) return ['Attested first', 'Ruled out first'];
    if (c.type === 'field' && c.datatype === 'date') return ['Oldest first', 'Newest first'];
    if (isNumeric(c)) return ['Smallest first', 'Largest first'];
    return ['A to Z', 'Z to A'];
  }

  function headMenu(el) {
    const c = colByKey(el.dataset.col);
    if (!c) return;
    const sort = ui.prefs.sort?.key === c.key ? ui.prefs.sort.dir : 0;
    const [up, down] = sortWords(c);
    const about = c.computedBy || c.computed ? 'Worked out by formula' : c.parent ? `Below ${c.path.slice(0, -1).join(' › ')}` : null;
    Shell.menu(el, [
      ...(about ? [{ head: about }] : []),
      { label: `Sort ${up.toLowerCase()}`, checked: sort > 0, run: () => setSort(c.key, 1) },
      { label: `Sort ${down.toLowerCase()}`, checked: sort < 0, run: () => setSort(c.key, -1) },
      ...(sort ? [{ label: 'Stop sorting by it', run: () => setSort(null) }] : []),
      { sep: true },
      ...(c.isName ? [] : [{ label: `Filter by ${c.label}…`, run: () => addFilter(c.key) }, { label: 'Hide column', run: () => setShown(c.key, false) }]),
    ], `records-head:${c.key}`);
  }

  // A record of the kind with this label, to stand for its column when the column is dragged: the model
  // orders entries by any one of a location's records, for every location like it.
  function standIn(label) {
    const ix = tableIndex();
    for (const obj of readPass().objects) { const id = ix.entries.get(obj)?.get(norm(label)); if (id) return id; }
    return null;
  }

  // ---- Filters ----

  // A filter of a column (one each), with its menu open under its chip. Closed with nothing picked, it goes,
  // since it wouldn't filter anything (see tidy).
  function addFilter(key) {
    if (!ui.filters.some(f => f.col === key)) ui.filters.push({ col: key, op: 'is', values: [] });
    ui.filterMenu = key;
    ui.focus = null;
    saveSession();
    draw();
    openFilter(key);
  }
  function removeFilter(key) {
    ui.filters = ui.filters.filter(f => f.col !== key);
    saveSession();
    draw();
  }

  // Closing a choice's options gives the keyboard back to the table.
  function closePop() {
    ui.pop = null;
    if (ui.focus === 'pop') ui.focus = ui.active ? 'grid' : null;
  }

  function clearFilters() {
    Object.assign(ui, { filters: [], search: '', needs: false, pop: null });
    saveSession();
    draw();
  }

  // Any column can be filtered by, shown or not, as the View menu lists them.
  function filterPicker(el) {
    const item = c => ({ label: c.label, hint: ui.filters.some(f => f.col === c.key) ? 'In use' : '', run: () => addFilter(c.key) });
    Shell.menu(el, query => columnItems(columns().filter(c => !c.isName), query, item), 'records-filter', { search: 'Find a column' });
  }

  // ---- Events ----

  Object.entries({
    'records.new': startDraft,
    'records.export': exportCsv,
    'records.view': openView,
    'records.head': el => { if (!dragged) headMenu(el); },
    // A heading's click sorts by its column: ascending, then descending.
    'records.sort': el => {
      if (dragged) return;
      const s = ui.prefs.sort;
      setSort(el.dataset.col, s?.key === el.dataset.col && s.dir > 0 ? -1 : 1);
    },
    'records.filter-add': el => addFilter(el.dataset.col),
    'records.filter-pick': el => filterPicker(el),
    'records.filter-open': el => openFilter(el.dataset.col),
    'records.filter-remove': el => removeFilter(el.dataset.col),
    'records.clear-filters': clearFilters,
    'records.needs': () => { ui.needs = !ui.needs; saveSession(); draw(); },
    'records.choose': el => chooseOption(Number(el.dataset.index)),
    'records.choose-clear': () => {
      const p = ui.pop;
      ui.pop = null;
      ui.focus = 'grid';
      const error = clearCell(p.row, colByKey(p.col));
      if (error) Shell.toast(error, { tone: 'error' });
      render();
    },
    'records.override': el => {
      const c = colByKey(el.dataset.col), row = el.dataset.row;
      const cell = readPass().cell(row, c);
      const d = cell.info && definitionOf(cell.info.def);
      if (!d) return;
      const strong = cell.info.mark === 'differs' || cell.info.mark === 'overrides';
      Shell.menu(el, [{ head: el.title }, { label: strong ? 'Use formula' : 'Clear, and use formula', run: () => {
        const error = useFormula(cell.id);
        error ? Shell.toast(error, { tone: 'error' }) : Shell.toast(`${c.label} on ${tableIndex().nameOf(row)} follows ${d.name} again`, { undo: true });
        render();
      } }], `records-override:${cell.id}`);
    },
    'records.copy-rows': () => { copyRows = true; document.execCommand('copy'); copyRows = false; },
    'records.delete-rows': () => deleteRows(ui.rows.filter(id => ui.checked.has(id)).concat([...ui.checked].filter(id => !ui.rows.includes(id)))),
    'records.uncheck': () => { ui.checked.clear(); ui.anchor = null; draw(); },
  }).forEach(([name, fn]) => Shell.on(name, fn));

  const inPage = () => !!document.querySelector('.rec-page');
  const layerOpen = () => !!document.querySelector('#layer .palette, #layer .dialog, #layer .float-menu');
  const typingIn = el => !!el?.closest?.('input:not([type="checkbox"]), textarea, select, [contenteditable="true"]');

  // A click elsewhere saves the cell being typed in, before the click does what it does: a click on
  // another cell selects that one. Where the value can't be saved, the cell stays open and says why. The
  // page is drawn again once the click is done, so the click lands on what it was aimed at.
  document.addEventListener('mousedown', e => {
    if (!inPage() || layerOpen()) return;
    const t = e.target;
    if (ui.edit && !t.closest?.('.rec-cell.is-editing')) {
      if (commitEdit()) { e.preventDefault(); draw(); return; }
      renderQueued = true;
    }
    if (ui.draft && !t.closest?.('.rec-draft')) {
      const done = commitDraft();
      if (done?.error) { e.preventDefault(); draw(); return; }
      renderQueued = true;
    }
    if (!typingIn(t) && !t.closest?.('.rec-pop, .rec-table td')) ui.focus = ui.pop ? 'pop' : null;
  }, true);
  document.addEventListener('mouseup', () => { if (renderQueued) setTimeout(() => { if (renderQueued) render(); }); });

  // Where a click starts is noted before anything handles it, as handling it may draw the page again.
  let popAtClick = null, clickInPop = false;
  document.addEventListener('click', e => { popAtClick = ui.pop; clickInPop = !!e.target.closest?.('.rec-pop, #layer'); }, true);
  document.addEventListener('click', e => {
    if (!inPage()) return;
    const t = e.target;
    const link = t.closest?.('a[href^="record.html#"]');
    // A click outside an open popover closes it, unless the click is what opened it, or is in a menu the
    // popover opened.
    if (ui.pop && ui.pop === popAtClick && !clickInPop) { closePop(); draw(); }
    if (link || t.closest?.('[data-cmd], .rec-pop, .is-editing')) return;
    const check = t.closest?.('.row-check');
    if (check) return tick(check, e);
    const td = t.closest?.('.rec-table td[data-col]');
    const row = td?.closest('tr')?.dataset.row;
    if (!row) return;
    const c = colByKey(td.dataset.col);
    if (!c) return;
    // As in Excel, a click selects a cell. A tag's checkbox is a control of its own, and ticks; a choice's
    // chevron opens its options, as a dropdown's does. Name's text is the link to the record.
    if (c.type === 'tag' && !c.rel && t.closest('.check')) return toggleTag(row, c);
    if (t.closest('.rec-chev')) return act(row, c);
    setActive(row, c.key);
  });

  // A double-click edits a cell, as Enter or typing over it does: Name too, away from its link.
  document.addEventListener('dblclick', e => {
    if (!inPage() || e.target.closest?.('a, input, .check, [data-cmd]')) return;
    const td = e.target.closest?.('.rec-table td[data-col]');
    const row = td?.closest('tr')?.dataset.row;
    const c = row && colByKey(td.dataset.col);
    if (c && !c.rel) act(row, c, { viaKey: true });
  });

  // Ticking a row's box selects it; shift-ticking selects the rows between it and the last one ticked.
  function tick(input, e) {
    const id = input.dataset.check;
    if (id === '*') {
      const all = ui.rows.length && ui.rows.every(r => ui.checked.has(r));
      for (const r of ui.rows) all ? ui.checked.delete(r) : ui.checked.add(r);
      ui.anchor = null;
      return draw();
    }
    const on = input.checked;
    if (e.shiftKey && ui.anchor && ui.rows.includes(ui.anchor)) {
      const [i, j] = [ui.rows.indexOf(ui.anchor), ui.rows.indexOf(id)].sort((a, b) => a - b);
      for (const r of ui.rows.slice(i, j + 1)) on ? ui.checked.add(r) : ui.checked.delete(r);
    } else if (on) ui.checked.add(id);
    else ui.checked.delete(id);
    ui.anchor = id;
    draw();
  }

  document.addEventListener('input', e => {
    const t = e.target;
    if (!inPage() || !t.dataset?.focus) return;
    ui.caret = [t.selectionStart, t.selectionEnd];
    if (t.dataset.focus === 'edit' && ui.edit) { ui.edit.text = t.value; ui.edit.error = null; t.parentElement.querySelector('.rec-error')?.remove(); }
    else if (t.dataset.focus === 'draft' && ui.draft) { ui.draft.text = t.value; ui.draft.error = null; }
    else if (t.dataset.focus === 'search') { ui.search = t.value; ui.focus = 'search'; saveSession(); draw(); }
    else if (t.dataset.focus === 'pop' && ui.pop) { ui.pop.query = t.value; ui.pop.active = 0; draw(); }
  });
  document.addEventListener('focusin', e => {
    if (!inPage()) return;
    if (e.target.dataset?.focus === 'search') ui.focus = 'search';
    const td = e.target.closest?.('.rec-table td[data-col]');
    if (td && e.target === td) ui.focus = 'grid';
  });
  // Keeps the caret where it is when the page is drawn again.
  document.addEventListener('keyup', e => { if (e.target.dataset?.focus) ui.caret = [e.target.selectionStart, e.target.selectionEnd]; });
  document.addEventListener('scroll', e => {
    if (!e.target.classList?.contains('rec-wrap')) return;
    ui.scroll = { left: e.target.scrollLeft, top: e.target.scrollTop };
    e.target.classList.toggle('is-scrolled', e.target.scrollLeft > 0);
    if (ui.pop) placePop();
  }, true);
  // A resized window draws the table again once it settles, as Name's width and what fits follow it.
  let resizing = 0;
  addEventListener('resize', () => {
    if (ui.pop) placePop();
    clearTimeout(resizing);
    resizing = setTimeout(() => { if (inPage() && !ui.edit && !ui.draft) draw(); }, 150);
  });

  // ---- Keys ----
  // Every key the table acts on, it claims (preventDefault), and the shell leaves a claimed key be: typing
  // over a cell can start with G, which would otherwise begin the shell's G then a letter. The shell keeps
  // Ctrl+K, ?, / and undo and redo, which no value starts with.

  function editorKeys(e) {
    const step = { Enter: [e.shiftKey ? -1 : 1, 0], Tab: [0, e.shiftKey ? -1 : 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[e.key];
    if (e.key === 'Escape') { e.preventDefault(); ui.edit = null; ui.focus = 'grid'; return draw(); }
    if (!step || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    if (commitEdit()) return draw();
    move(...step, e.key === 'Tab');
    ui.focus = 'grid';
    render();
  }

  function draftKeys(e) {
    if (e.key === 'Escape') { e.preventDefault(); ui.draft = null; ui.focus = ui.active ? 'grid' : null; return draw(); }
    if (e.key !== 'Enter' && e.key !== 'Tab') return;
    e.preventDefault();
    const done = commitDraft(e.key === 'Enter');
    if (done?.id && e.key === 'Tab' && ui.cols.length > 1) {
      const next = colByKey(ui.cols[1]);
      ui.active = { row: done.id, col: next.key };
      ui.reveal = true;
      if (next.type === 'field') { render(); return startEdit(done.id, next); }
      ui.focus = 'grid';
    } else if (!done?.error) ui.focus = ui.draft ? 'draft' : 'grid';
    ui.toEnd = true;
    render();
  }

  function popKeys(e) {
    const p = ui.pop;
    if (e.key === 'Escape') { e.preventDefault(); closePop(); return draw(); }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = p.items?.length ?? 0;
      if (!n) return;
      p.active = (p.active + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
      for (const el of document.querySelectorAll('.rec-choice-pop .option[data-index]')) el.setAttribute('aria-selected', Number(el.dataset.index) === p.active);
      document.querySelector('.rec-choice-pop .option[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
    }
    if (e.key === 'Enter') { e.preventDefault(); chooseOption(p.active); }
    if (e.key === 'Tab') { e.preventDefault(); closePop(); move(0, e.shiftKey ? -1 : 1, true); draw(); }
  }

  function gridKeys(e) {
    const a = ui.active;
    const c = colByKey(a.col);
    if (!c) return;
    const mod = e.ctrlKey || e.metaKey;
    const steps = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (steps[e.key] && !e.altKey) {
      e.preventDefault();
      const [dr, dc] = steps[e.key];
      move(mod ? dr * 1e6 : dr, mod ? dc * 1e6 : dc);
      return showActive();
    }
    if (e.key === 'Enter' && mod) { e.preventDefault(); Shell.visited(a.row); location.href = Shell.recordHref(a.row); return; }
    if (mod || e.altKey) return;
    const jump = { Home: [0, -1e6], End: [0, 1e6], PageUp: [-10, 0], PageDown: [10, 0] }[e.key];
    if (jump) { e.preventDefault(); move(...jump); return showActive(); }
    if (e.key === 'Tab') { e.preventDefault(); move(0, e.shiftKey ? -1 : 1, true); return showActive(); }
    if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); return act(a.row, c, { viaKey: true }); }
    if (e.key === ' ' && c.type === 'tag') { e.preventDefault(); return toggleTag(a.row, c); }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      const error = clearCell(a.row, c);
      if (error) Shell.toast(error, { tone: 'error' });
      return render();
    }
    // Typing over a cell that can be edited starts editing it with what's typed, as in a spreadsheet.
    if (e.key.length === 1 && !' ?/'.includes(e.key) && (c.type === 'field' || c.type === 'choice') && editable(readPass().cell(a.row, c), c)) {
      e.preventDefault();
      act(a.row, c, { text: e.key });
    }
  }

  document.addEventListener('keydown', e => {
    if (!inPage() || e.defaultPrevented || layerOpen()) return;
    const t = e.target;
    if (t.dataset?.focus === 'edit') return editorKeys(e);
    if (t.dataset?.focus === 'draft') return draftKeys(e);
    if (ui.pop && (t.closest?.('.rec-pop') || e.key === 'Escape')) return popKeys(e);
    if (t.dataset?.focus === 'search') {
      if (e.key === 'Escape') { e.preventDefault(); if (ui.search) { ui.search = ''; saveSession(); } else { ui.focus = null; t.blur(); } return draw(); }
      if (e.key === 'ArrowDown' && ui.rows.length) { e.preventDefault(); setActive(ui.rows[0], ui.active?.col ?? ui.cols[0]); }
      return;
    }
    if (typingIn(t)) return;
    if (e.key === 'Escape' && ui.checked.size) { e.preventDefault(); ui.checked.clear(); return draw(); }
    if (!ui.active) {
      // Arrows with nothing selected start at the first cell.
      if (/^Arrow/.test(e.key) && ui.rows.length && !e.altKey) { e.preventDefault(); setActive(ui.rows[0], ui.cols[0]); }
      return;
    }
    gridKeys(e);
  });

  // Pasting tab-separated text fills cells from the active one, or adds rows. While typing in a cell, or in
  // the new row's Name, a paste of one value is typed in; a paste of more does as it would in the table,
  // from that cell, or in rows of their own below the last.
  document.addEventListener('paste', e => {
    if (!inPage() || layerOpen()) return;
    const t = e.target, box = t.dataset?.focus;
    const grid = parseTsv(e.clipboardData?.getData('text/plain') ?? '');
    const many = grid.length > 1 || grid[0]?.length > 1;
    if (box === 'edit' || box === 'draft') {
      if (!many) return;
      e.preventDefault();
      if (box === 'edit') { ui.edit = null; return pasteGrid(grid); }
      ui.draft = null;
      return pasteGrid(grid, { row: ui.rows.length, col: 0 });
    }
    if (typingIn(t)) return;
    e.preventDefault();
    pasteGrid(grid);
  });

  // Copying copies the ticked rows, with their headings, or else the active cell.
  let copyRows = false;
  document.addEventListener('copy', e => {
    if (!inPage() || layerOpen() || (typingIn(e.target) && !copyRows)) return;
    const ids = ui.rows.filter(id => ui.checked.has(id));
    if (!ids.length && !copyRows && String(getSelection())) return;
    let text = null;
    if (ids.length) text = rowsAsTsv(ids);
    else if (ui.active) { const c = colByKey(ui.active.col); if (c) text = cellText(readPass().cell(ui.active.row, c), c); }
    if (text === null) return;
    e.preventDefault();
    e.clipboardData.setData('text/plain', text);
    if (ids.length) Shell.toast(`Copied ${count(ids.length, word())}, with their headings`);
  });

  // ---- Dragging a column ----
  // A column of entries at the object is dragged by its heading to reorder it among the others. That's the
  // model's entry order for objects of the kind, so the record page and the chart's panel follow suit.
  let drag = null, dragged = false;
  document.addEventListener('pointerdown', e => {
    const th = e.target.closest?.('.rec-table th.is-movable');
    if (!th || e.button !== 0) return;
    drag = { key: th.dataset.col, x: e.clientX, moved: false, target: null, after: false };
    dragged = false;
  });
  document.addEventListener('pointermove', e => {
    if (!drag) return;
    if (!drag.moved && Math.abs(e.clientX - drag.x) < 5) return;
    drag.moved = true;
    const heads = [...document.querySelectorAll('.rec-table th.is-movable')];
    for (const h of heads) h.classList.remove('is-drop-before', 'is-drop-after', 'is-dragging');
    document.querySelector(`.rec-table th[data-col="${CSS.escape(drag.key)}"]`)?.classList.add('is-dragging');
    const over = heads.find(h => { const r = h.getBoundingClientRect(); return e.clientX >= r.left && e.clientX < r.right; });
    drag.target = over && over.dataset.col !== drag.key ? over.dataset.col : null;
    if (drag.target) {
      const r = over.getBoundingClientRect();
      drag.after = e.clientX > r.left + r.width / 2;
      over.classList.add(drag.after ? 'is-drop-after' : 'is-drop-before');
    }
  });
  document.addEventListener('pointerup', () => {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (!d.moved) return;
    dragged = true;
    setTimeout(() => { dragged = false; });
    const from = colByKey(d.key), to = d.target && colByKey(d.target);
    const id = from && standIn(from.label), target = to && standIn(to.label);
    if (id && target) moveEntry(id, target, d.after);
    draw();
  });

  // ---- Starting ----

  addEventListener('hashchange', () => { if (useKind()) render(); });
  // Switching charts starts afresh; a change made to this chart in another tab keeps the place in the table.
  Shell.onChartChange(() => {
    if (ui.chart === workbook.chartId && kindsInState().includes(ui.kind)) return;
    ui.kind = null;
    useKind();
  });

  Shell.start({
    area: 'records',
    kind: hashText(),
    title: () => { ensureKind(); return kindPlural(); },
    actions: () => `<button class="btn btn-sm" data-cmd="records.export">Export CSV</button>
      <button class="btn btn-sm btn-primary" data-cmd="records.new">${icon('plus')}New ${esc(word())}</button>`,
    render: pageHtml,
    after,
    keys: [['Arrows, Tab', 'Move between cells'], ['Enter or F2', 'Edit the cell, or open its options'], ['A letter or digit', 'Type over the cell'],
      ['Space', 'Attest a tag, or rule it out'], ['Delete', 'Clear the cell'], [`${MOD}+Enter`, 'Open the row’s record'],
      [`${MOD}+C`, 'Copy the cell, or the ticked rows'], [`${MOD}+V`, 'Paste cells, as copied from Excel'], ['Esc', 'Cancel, or untick the rows']],
    commands: () => [
      { title: `New ${word()}`, keywords: 'add create row record', run: startDraft },
      { title: `Export ${kindPlural().toLowerCase()} as CSV`, keywords: 'download excel spreadsheet', run: exportCsv },
      { title: 'Show or hide columns', keywords: 'view columns fields', run: () => openView(document.querySelector('[data-cmd="records.view"]')) },
      ...(anyFilter() ? [{ title: 'Clear filters', keywords: 'search reset', run: clearFilters }] : []),
    ],
  });
})();
