// Table views (dendra.md, Views): a view laid out as a table is one Tabulator grid. Its rows are the records
// of one kind (Entities), one relation (Ownership), or every entry of one datatype (Dates, Documents); its
// columns are what's located at the rows. This part also feeds the sheet tabs from the chart's View objects.
//
// A view is a View object. Its Name entry names it, an Order note at it places its tab, and a Layout note at
// it says what a table's rows are: { rows: pattern }, a kind ({ kind }) or a relation (its edges with every
// other label removed), or { rows: datatype }. With no Layout note it's a chart. In the view, a Shown note at
// a column's pattern shows or hides the column, and Order notes place the columns.
//
// Every edit, paste or deletion is one change through App.edit, so one Undo takes it back. While History shows
// the chart as it stood, the grid is read-only.

const Table = (() => {
  const { effect } = Shell;
  const { clean, norm, same } = Tree;

  const viewTree = id => ({ id, kind: 'View' });
  const strip = t => t.args ? { args: t.args.map(a => ({ edge: a.edge, loc: strip(a.loc) })) } : {};
  const below = (p, path) => path.reduce((loc, edge) => ({ args: [{ edge, loc }] }), p);
  const plural = w => /[^aeiou]y$/i.test(w) ? w.slice(0, -1) + 'ies' : /(s|x|z|ch|sh)$/i.test(w) ? w + 'es' : w + 's';
  const esc = s => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
  const day = iso => new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const count = (n, one, many = plural(one)) => `${n} ${n === 1 ? one : many}`;
  const readOnly = () => !!Shell.time.peek()?.stood;
  const BLANK = '\u0000blank';

  // The chart as shown, read so that any change redraws what read it (App.version, since the workbook object
  // itself stays the same). The computed state is the entered one until the engine lands: swap it here.
  const now = {
    wb: () => (App.version.value, App.shown.value),
    entered: () => now.wb().asOf(App.chart.value, App.day.value),
    state: () => now.entered(),
    schema: () => now.wb().schema(App.chart.value),
    notes: () => now.wb().notes(App.chart.value),
  };

  // ---- The chart's words ----
  const entryAt = (st, at, edge) => at && (Tree.index(st).entries.get(at) ?? []).find(id => same(st[id].edge, edge));
  const nameOf = (st, id) => Tree.objectName(st, id);
  const shortOf = (st, id) => { const s = entryAt(st, id, 'Short Name'); return s ? st[s].value : nameOf(st, id); };
  const valueOf = r => !r ? undefined : 'tag' in r ? r.tag : 'choice' in r ? r.choice : r.value;
  // A relation's sides, in its order, by the names of the objects they're at.
  function sides(st, id, N, name = nameOf) {
    const t = Tree.treeOf(st, id), order = N.edges(t);
    return [...st[id].args].sort((a, b) => order.indexOf(a.edge) - order.indexOf(b.edge)).map(a => name(st, Tree.objectOf(st, a.at)));
  }
  // What a record is at, said as the chart says it: Fund III › Delaware, or Cayman GP → Offshore Feeder.
  function whose(st, at, N) {
    const path = Tree.pathOf(st, at), root = st[path[0]];
    const head = root?.args ? sides(st, path[0], N, shortOf).join(' → ') : shortOf(st, path[0]);
    return [head, ...path.slice(1).map(id => st[id].choice ?? st[id].edge)].join(' › ');
  }

  // ---- Views ----
  const views = () => {
    const st = now.entered(), N = now.notes();
    return (Tree.index(st).kinds.get('view') ?? []).map(id => ({ id, name: nameOf(st, id), order: N.order(viewTree(id)) ?? Infinity, layout: N.value('Layout', viewTree(id)) }))
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  };
  const viewOf = id => views().find(v => v.id === id);

  // What a table's rows can be, for the + menu: each kind, each relation, and the dates and the documents.
  function layouts() {
    const S = now.schema(), N = now.notes(), rels = new Map(), kinds = new Set();
    for (const t of Object.values(S)) {
      if (!t.args) { if (t.kind && !same(t.kind, 'View')) kinds.add(t.kind); }
      else if (t.args.length > 1) { const p = strip(t); rels.set(Tree.key(p), p); }
    }
    const byName = (a, b) => a.name.localeCompare(b.name);
    return {
      kinds: [...kinds].map(kind => ({ name: plural(kind), rows: { kind } })).sort(byName),
      relations: [...rels.values()].map(p => ({ name: N.name(p), rows: p })).sort(byName),
      datatypes: ['date', 'document'].map(d => ({ name: plural(Tree.DATATYPES[d]), rows: d })),
    };
  }

  // ---- The model: a table's columns and rows, worked out from the state shown ----
  // A column of entries is a path of edges from the row down, with every specification there.
  function entryColumns(S, isRow) {
    const cols = new Map();
    const pathOf = t => {
      if (t.args?.length !== 1) return null;
      const { edge, loc } = t.args[0];
      if (isRow(loc)) return [edge];
      const up = pathOf(loc);
      return up && [...up, edge];
    };
    for (const t of Object.values(S)) {
      const path = pathOf(t);
      if (!path) continue;
      const k = path.map(norm).join('›');
      if (!cols.has(k)) cols.set(k, { key: k, path, specs: [] });
      cols.get(k).specs.push(t);
    }
    return [...cols.values()];
  }
  // What a column holds, from its specifications: the commonest type, and a choice's options.
  function typed(c, specs) {
    const types = specs.map(t => 'field' in t.out ? t.out.field : 'choice' in t.out ? 'choice' : 'tag');
    const type = types.sort((a, b) => types.filter(x => x === b).length - types.filter(x => x === a).length)[0];
    return { ...c, type, options: [...new Set(specs.filter(t => 'choice' in t.out).map(t => t.out.choice))].sort() };
  }

  function model(view) {
    const st = now.state(), entered = now.entered(), N = now.notes(), S = now.schema();
    const rows = viewOf(view)?.layout?.rows;
    if (!rows) return null;
    const isDatatype = typeof rows === 'string', isKind = !isDatatype && !rows.args;
    let cols = [], ids;
    const order = (p, path) => path.map((_, i) => N.order(below(p, path.slice(0, i + 1))) ?? Infinity);

    if (isDatatype) {
      ids = Object.keys(st).filter(id => st[id].field === rows);
      cols = [
        { key: '$value', title: Tree.DATATYPES[rows], type: rows, fixed: true },
        { key: '$entry', title: 'Entry', type: 'text', fixed: true },
        { key: '$of', title: 'Of', type: 'text', fixed: true },
      ];
    } else {
      const isRow = isKind ? loc => !loc.args && same(loc.kind, rows.kind) : loc => loc.args?.length > 1 && Tree.narrower(loc, rows);
      ids = isKind ? Tree.index(st).kinds.get(norm(rows.kind)) ?? []
        : Object.keys(st).filter(id => st[id].args?.length > 1 && Tree.fits(st, id, rows));
      // A relation's sides come first, each a column whose notes are the relation's at that edge.
      if (!isKind) {
        const specs = Object.values(S).filter(t => t.args?.length > 1 && Tree.narrower(t, rows));
        cols.push(...N.edges(rows).map((edge, i) => ({ key: '@' + norm(edge), edge, title: edge, type: 'edge', pattern: rows, param: edge, base: [i] })));
        const out = typed({ key: '$out', title: N.name(rows), base: [Infinity] }, specs);
        if (out.type !== 'tag') cols.push(out);
      }
      for (const c of entryColumns(S, isRow)) {
        const pattern = below(isKind ? { kind: rows.kind } : rows, c.path);
        cols.push(typed({ ...c, pattern, title: c.path.at(-1), parent: c.path.slice(0, -1).join(' › '), base: order(isKind ? { kind: rows.kind } : rows, c.path) }, c.specs));
      }
      // In the view, Order places a column and Shown shows it; by default every entry at the row shows.
      for (const c of cols) {
        const o = c.pattern && N.resolve('Order', c.pattern, view, c.param);
        c.place = o?.note.view === view ? o.value : Infinity;
        c.shown = c.pattern ? N.value('Shown', c.pattern, view, c.param) ?? (c.param || c.path.length === 1) : true;
      }
      const lex = (a, b) => { for (let i = 0; i < Math.max(a.length, b.length); i++) { const d = (a[i] ?? -1) - (b[i] ?? -1); if (d) return d; } return 0; };
      cols.sort((a, b) => a.place - b.place || lex(a.base, b.base) || a.key.localeCompare(b.key));
    }

    // Each cell: the record there, if any, and where one would go.
    const cellOf = (row, c) => {
      if (c.type === 'edge') {
        const a = st[row].args.find(x => same(x.edge, c.edge));
        return { at: a?.at, v: a ? nameOf(st, Tree.objectOf(st, a.at)) : undefined };
      }
      if (c.key === '$out') return { id: row, at: null, v: valueOf(st[row]) };
      if (c.key === '$value') return { id: row, at: st[row].at, v: st[row].value };
      if (c.key === '$entry') return { v: st[row].args ? N.name(Tree.treeOf(st, row)) : st[row].edge };
      if (c.key === '$of') return { v: st[row].args ? sides(st, row, N, shortOf).join(' → ') : whose(st, st[row].at, N) };
      let at = row;
      for (const e of c.path.slice(0, -1)) at = entryAt(st, at, e);
      const id = entryAt(st, at, c.path.at(-1));
      return { id, at, v: valueOf(st[id]) };
    };
    const today = App.day.value, data = ids.map(id => {
      const row = { id, _m: {} };
      cols.forEach((c, i) => {
        const m = cellOf(id, c), r = m.id && st[m.id], f = 'f' + i;
        row[f] = m.v ?? null;
        const fx = !!r && !(m.id in entered), formula = r && !Tree.isObject(r) && N.resolve('Formula', Tree.treeOf(st, m.id));
        row._m[f] = { id: m.id, at: m.at, fx, over: !fx && !!formula, due: !!formula && r.field === 'date' && r.value < today };
      });
      row._ruled = st[id].tag === false;
      return row;
    });

    // Dates fall into months, with what's overdue first, then from this month on, then back from it.
    let groups = null;
    if (rows === 'date') {
      const month = today.slice(0, 7);
      for (const r of data) r._g = r._m.f0.due ? 'overdue' : r.f0.slice(0, 7);
      const keys = [...new Set(data.map(r => r._g))];
      const ahead = keys.filter(k => k !== 'overdue' && k >= month).sort(), past = keys.filter(k => k !== 'overdue' && k < month).sort().reverse();
      groups = [...(keys.includes('overdue') ? ['overdue'] : []), ...ahead, ...past];
      const at = new Map(groups.map((g, i) => [g, i]));
      data.sort((a, b) => at.get(a._g) - at.get(b._g) || (a._g < month ? b.f0.localeCompare(a.f0) : a.f0.localeCompare(b.f0)));
    } else if (cols[0]) data.sort((a, b) => String(a.f0 ?? '').localeCompare(String(b.f0 ?? '')));

    const noun = isDatatype ? Tree.DATATYPES[rows].toLowerCase() : isKind ? rows.kind.toLowerCase() : 'row';
    return { view, rows, isKind, isDatatype, cols, data, groups, noun };
  }

  // ---- How cells read, copy and edit ----
  const NUMERIC = new Set(['number', 'percent', 'money']);
  const text = (type, v) => v === null || v === undefined ? '' : type === 'tag' ? (v ? 'Yes' : 'No')
    : type === 'date' ? day(v) : type === 'document' ? Tree.documentName(v) : NUMERIC.has(type) ? Tree.format(type, v) : String(v);
  // What a cell copies and exports as: a document as its address, so the link survives.
  const plain = (type, v) => type === 'document' ? String(v ?? '') : type === 'date' ? (v ? Tree.formatDate(v) : '') : text(type, v);
  const typing = (type, v) => v === null || v === undefined ? '' : type === 'date' ? Tree.formatDate(v) : type === 'document' ? String(v) : text(type, v);
  const YES = /^(yes|y|true|x|✓|✔|1)$/i, NO = /^(no|n|false|0)$/i;
  const meta = cell => cell.getRow().getData()._m[cell.getField()];

  function formatter(c) {
    return cell => {
      const el = cell.getElement(), m = meta(cell), v = cell.getValue();
      el.classList.toggle('fx', !!m?.fx);
      el.classList.toggle('over', !!m?.over);
      el.classList.toggle('due', !!m?.due);
      el.classList.toggle('none', c.type !== 'edge' && !c.key.startsWith('$') && !m?.at);
      if (c.type === 'tag') return v === null ? '<span class="tag"></span>' : `<span class="tag ${v ? 'yes' : 'no'}${m?.fx ? ' fx' : ''}"></span>`;
      if (c.type === 'document' && v) return `<a href="${esc(v)}" target="_blank" rel="noopener">${esc(Tree.documentName(v))}</a>`;
      return esc(text(c.type, v));
    };
  }

  // A text editor, as Excel's: Enter or leaving keeps what's typed, Esc puts it back, and what can't be read
  // stays open, marked.
  let typed0 = null;
  const editor = (c, put) => (cell, onRendered, success, cancel) => {
    const input = document.createElement('input');
    input.value = typed0 ?? typing(c.type, cell.getValue());
    const first = typed0 !== null;
    typed0 = null;
    onRendered(() => { input.focus(); if (!first) input.select(); });
    let done = false;
    const keep = () => {
      if (done) return true;
      if (!readable(cell, input.value)) { input.classList.add('bad'); return false; }
      done = true;
      cancel();
      put(cell, input.value);
      return true;
    };
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); if (keep()) move('down'); }
      else if (e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); if (keep()) move(e.shiftKey ? 'left' : 'right'); }
      else if (e.key === 'Escape') { e.stopPropagation(); done = true; cancel(); }
    });
    input.addEventListener('blur', () => { if (!keep()) { done = true; cancel(); } });
    return input;
  };
  let move = () => {};

  // ---- The grid ----
  let table = null, ready = false, built = null, current = null, el = null;

  function columnDefs(m) {
    const defs = m.cols.filter(c => c.shown).map(c => {
      const f = 'f' + m.cols.indexOf(c), editable = c.type !== 'tag' && c.key !== '$entry' && c.key !== '$of';
      const values = [...new Map(m.data.map(r => [r[f], r[f]]).filter(([v]) => v !== null)).keys()]
        .sort((a, b) => typeof a === 'number' ? a - b : String(a).localeCompare(String(b)))
        .map(v => ({ label: text(c.type, v) || (c.type === 'tag' ? '' : String(v)), value: v }));
      if (m.data.some(r => r[f] === null)) values.push({ label: 'Blank', value: BLANK });
      return {
        title: c.title, field: f, minWidth: c.type === 'tag' ? 56 : 72, maxInitialWidth: 340,
        titleFormatter: c.parent ? () => `<span class="up">${esc(c.parent)}</span>${esc(c.title)}` : undefined,
        hozAlign: NUMERIC.has(c.type) ? 'right' : 'left', cssClass: 'c-' + (c.type === 'edge' ? 'edge' : c.type),
        sorter: NUMERIC.has(c.type) ? 'number' : c.type === 'tag' ? 'boolean' : 'string', sorterParams: { alignEmptyValues: 'bottom' },
        formatter: formatter(c),
        editable: cell => !readOnly() && (c.type === 'edge' || !!meta(cell)?.at || c.key === '$out'),
        editor: !editable ? false : c.type === 'choice' || c.type === 'edge' ? 'list' : editor(c, put),
        editorParams: c.type === 'choice' ? { values: c.options, autocomplete: true, freetext: true, listOnEmpty: true, allowEmpty: true }
          : c.type === 'edge' ? () => ({ values: objects(m, c), autocomplete: true, listOnEmpty: true }) : undefined,
        headerFilter: 'list', headerFilterParams: { values, autocomplete: true, listOnEmpty: true, clearable: true },
        headerFilterFunc: (want, v) => want === BLANK ? v === null || v === '' : v === want,
        headerFilterEmptyCheck: v => v === undefined || v === null || v === '',
        accessorClipboard: v => plain(c.type, v), accessorDownload: v => csvSafe(plain(c.type, v)),
      };
    });
    if (defs[0]) defs[0].frozen = true;
    return defs;
  }
  const csvSafe = s => /^[=+\-@]/.test(s) && !Tree.isNumber(s) ? `'${s}` : s;
  // The objects a relation's side can be at: those of the kinds the schema has there.
  function objects(m, c) {
    const st = now.state(), S = now.schema(), kinds = new Set();
    for (const t of Object.values(S)) if (t.args?.length > 1 && Tree.narrower(t, m.rows)) for (const a of t.args) if (same(a.edge, c.edge) && a.loc.kind) kinds.add(norm(a.loc.kind));
    return [...kinds].flatMap(k => Tree.index(st).kinds.get(k) ?? []).map(id => nameOf(st, id)).sort();
  }

  function build(m) {
    if (table) { table.destroy(); table = null; }
    ready = false;
    el.replaceChildren();
    const host = document.createElement('div');
    el.appendChild(host);
    const cols = columnDefs(m);
    built = { view: m.view, sig: signature(m) };
    table = new Tabulator(host, {
      index: 'id', data: m.data, columns: cols, height: '100%', layout: 'fitData',
      placeholder: m.isKind ? `No ${plural(m.noun)}` : 'No rows',
      rowHeader: { formatter: 'rownum', headerSort: false, resizable: false, frozen: true, hozAlign: 'right', width: 48, minWidth: 48, cssClass: 'rn' },
      selectableRange: 1, selectableRangeColumns: true, selectableRangeRows: true, selectableRangeInitializeDefault: false,
      editTriggerEvent: 'dblclick',
      clipboard: true, clipboardCopyStyled: false, clipboardCopyRowRange: 'range',
      clipboardCopyConfig: { columnHeaders: false, columnGroups: false, rowHeaders: false, rowGroups: false, columnCalcs: false, formatCells: false },
      clipboardPasteParser: function (text) { return { text }; },
      clipboardPasteAction: function ({ text }) { paste(text); return []; },
      movableColumns: !m.isDatatype, headerSortClickElement: 'icon', columnHeaderVertAlign: 'bottom',
      rowFormatter: row => { const d = row.getData(), e = row.getElement(); e.classList.toggle('ruled', !!d._ruled); e.classList.toggle('picked', picked.has(d.id)); },
      ...(m.groups && {
        groupBy: '_g', groupValues: [m.groups], groupToggleElement: 'header',
        groupHeader: (g, n) => `${g === 'overdue' ? 'Overdue' : new Date(g + '-15T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}<span>${n}</span>`,
      }),
    });
    table.on('cellEdited', cell => { const d = m.cols[+cell.getField().slice(1)]; if (d.type === 'choice' || d.type === 'edge') put(cell, cell.getValue() ?? ''); });
    table.on('cellClick', (e, cell) => { if (e.target.closest('.tag')) flip(cell); });
    table.on('rangeChanged', range => pick(range));
    table.on('rangeAdded', range => pick(range));
    table.on('columnMoved', () => placeColumns());
    table.on('headerContext', (e, col) => { e.preventDefault(); columnMenu(e, col); });
    table.on('rowContext', (e, row) => { e.preventDefault(); rowMenu(e, row); });
    table.on('tableBuilt', () => { ready = true; mark(); });
    move = d => setTimeout(() => table?.modules.selectRange?.navigate(false, false, d) && table.modules.selectRange.restoreFocus(), 0);
    host.addEventListener('keydown', keydown);
  }
  // What the columns are; when it changes, the grid is built again rather than refreshed.
  const signature = m => JSON.stringify([m.view, m.cols.filter(c => c.shown).map(c => [c.key, c.title, c.type, c.options]), m.groups]);

  function refresh() {
    const view = Shell.view.value, v = viewOf(view);
    if (!el || !v?.layout) return;
    const m = model(view);
    current = m;
    if (!table || built.view !== view || built.sig !== signature(m)) return build(m);
    if (!ready) return table.on('tableBuilt', () => refresh());
    // Rows keep their place while they're edited; a sort or a filter applies again only when asked.
    table.blockRedraw();
    table.updateOrAddData(m.data).then(() => {
      const keep = new Set(m.data.map(r => r.id));
      for (const row of table.getRows()) if (!keep.has(row.getData().id)) row.delete();
      table.restoreRedraw();
      mark();
    });
  }

  // ---- Writing ----
  // One change, said in a toast with Undo when `say` is given. Views and notes pass { day: null }: they aren't
  // facts about the world, so they're never dated.
  function edit(fn, say, opts) {
    if (readOnly()) return false;
    const tx = App.edit(opts);
    fn(tx);
    const c = tx.commit();
    if (typeof c === 'string') { Shell.toast(c); return false; }
    const said = c && say?.();
    if (said) Shell.toast(said, { undo: () => Shell.parts.peek().undo?.undo() });
    return true;
  }
  const typeIn = (c, r) => r ? ('choice' in r ? 'choice' : 'tag' in r ? 'tag' : r.field) : c.type;
  const columnOf = cell => current.cols[+cell.getField().slice(1)];
  const readable = (cell, raw) => { const c = columnOf(cell), m = meta(cell); return !clean(raw) || c.type === 'edge' || !!value(typeIn(c, m.id && now.state()[m.id]), clean(raw)); };
  // A value typed or chosen in a cell, as one change: a correction, or with a day shown, from that day on.
  function put(cell, raw) {
    const c = columnOf(cell), m = meta(cell), st = now.state(), r = m.id && st[m.id], entered = m.id in now.entered();
    if (c.type === 'edge') return edit(tx => side(tx, st, cell.getRow().getData().id, c.edge, raw));
    const s = clean(raw);
    if (!s) return !entered || edit(tx => tx.remove(m.id));
    const out = value(typeIn(c, r), s);
    if (!out) return false;
    if (entered && JSON.stringify(valueOf(out)) === JSON.stringify(valueOf(r))) return true;
    return edit(tx => write(tx, m, c, out));
  }
  const value = (type, s) => {
    if (type === 'choice') return { choice: s };
    if (type === 'tag') return YES.test(s) ? { tag: true } : NO.test(s) ? { tag: false } : null;
    const v = Tree.parse(type, s);
    return v === undefined ? null : { field: type, value: v };
  };
  function write(tx, m, c, out) {
    const st = now.state(), r = m.id && st[m.id];
    if (m.id && m.id in now.entered()) {
      const { since, before, ...rest } = r;
      const { field, value: v, choice, tag, ...where } = rest;
      return tx.set(m.id, { ...where, ...out });
    }
    if (c.key === '$out') return;
    return tx.add('record', { at: m.at, edge: c.path?.at(-1) ?? r.edge, ...out });
  }
  // A relation's side moved to another object, found by name.
  function side(tx, st, row, edge, name) {
    const to = find(st, name);
    if (!to) return;
    const r = st[row], { since, before, ...rest } = r;
    tx.set(row, { ...rest, args: r.args.map(a => same(a.edge, edge) ? { edge: a.edge, at: to } : a) });
  }
  const find = (st, name) => {
    const n = norm(name);
    return Object.keys(st).find(id => Tree.isObject(st[id]) && norm(nameOf(st, id)) === n)
      ?? Object.keys(st).find(id => Tree.isObject(st[id]) && norm(shortOf(st, id)) === n);
  };
  // A tag's box: blank, attested, ruled out, and blank again; over a formula, entering wins and clearing
  // gives the formula back.
  function flip(cell) {
    const m = meta(cell), c = columnOf(cell), v = cell.getValue(), entered = m.id in now.entered();
    if (!m.at || readOnly()) return;
    edit(tx => v === true ? write(tx, m, c, { tag: false }) : v === false && entered ? tx.remove(m.id) : write(tx, m, c, { tag: true }));
    Shell.emit('tag-flip', m.id);
  }
  // Clears the cells of the range: the values entered there go, as one change.
  function clear() {
    const ids = new Set(), entered = now.entered();
    for (const r of table.getRanges()) for (const cell of r.getCells().flat()) {
      const m = cell.getField() && meta(cell);
      if (m?.id && m.id in entered && columnOf(cell).type !== 'edge' && columnOf(cell).key !== '$out') ids.add(m.id);
    }
    if (ids.size) edit(tx => ids.forEach(id => tx.remove(id)), () => `Cleared ${count(ids.size, 'value')}`);
  }

  // ---- Pasting from Excel ----
  // Excel copies cells as rows of tab-separated text, quoting a cell that holds a tab, a line break or a quote.
  function tsv(s) {
    s = String(s).replace(/\r\n?/g, '\n').replace(/\n$/, '');
    const rows = [[]];
    let cell = '', quoted = false;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (quoted) { if (ch === '"' && s[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false; else cell += ch; }
      else if (ch === '"' && cell === '') quoted = true;
      else if (ch === '\t') { rows.at(-1).push(cell); cell = ''; }
      else if (ch === '\n') { rows.at(-1).push(cell); rows.push([]); cell = ''; }
      else cell += ch;
    }
    rows.at(-1).push(cell);
    return rows.filter(r => r.some(x => clean(x)));
  }

  // With a heading row, columns match by heading and rows by name, and what's new is added: rows, and entries
  // under headings the table hasn't got. Without one, the cells fill the grid from the active cell. Either
  // way the paste is one change.
  function paste(textIn) {
    const m = current, grid = tsv(textIn);
    if (!m || !grid.length || readOnly()) return;
    const st = now.state(), entered = now.entered();
    // A row is found by its key: an object by its Name (or Short Name), a relation by the names at its sides.
    const keys = m.isKind ? m.cols.filter(c => c.path?.length === 1 && same(c.title, 'Name')) : m.cols.filter(c => c.type === 'edge');
    const names = (d, k) => {
      const o = k.type === 'edge' ? Tree.objectOf(st, st[d.id].args.find(a => same(a.edge, k.edge))?.at) : d.id;
      return o ? [nameOf(st, o), shortOf(st, o)].map(norm) : [];
    };
    const rowFor = key => m.data.find(d => keys.every((k, i) => names(d, k).includes(norm(key[i]))))?.id ?? null;
    const head = grid[0].map(h => m.cols.find(c => same(c.title, h) || same([c.parent, c.title].filter(Boolean).join(' › '), h)) ?? null);
    const headed = !m.isDatatype && grid.length > 1 && keys.length > 0 && keys.every(k => head.includes(k));
    const plan = [];   // [{ row: id or null, key: [names], cells: [[column, raw]] }]
    if (headed) {
      const fresh = new Map();
      grid[0].forEach((h, j) => { if (!head[j] && clean(h)) head[j] = fresh.get(norm(h)) ?? fresh.set(norm(h), newColumn(clean(h), grid.slice(1).map(r => r[j] ?? ''))).get(norm(h)); });
      for (const r of grid.slice(1)) {
        const key = keys.map(k => clean(r[head.indexOf(k)] ?? ''));
        plan.push({ row: rowFor(key), key, cells: head.map((c, j) => c && !keys.includes(c) && [c, r[j] ?? '']).filter(Boolean) });
      }
    } else {
      const active = table.modules.selectRange?.getActiveCell()?.getComponent(), shown = table.getColumns().filter(c => c.getField());
      const rows = table.getRows('active').map(r => r.getData().id);
      const r0 = active ? Math.max(0, rows.indexOf(active.getRow().getData().id)) : rows.length;
      const c0 = active ? Math.max(0, shown.findIndex(c => c.getField() === active.getField())) : 0;
      grid.forEach((r, i) => {
        const cells = r.map((raw, j) => shown[c0 + j] && [m.cols[+shown[c0 + j].getField().slice(1)], raw]).filter(Boolean);
        const row = rows[r0 + i] ?? null, name = m.isKind && cells.find(([c]) => keys.includes(c));
        if (row) plan.push({ row, key: [], cells });
        else if (name) plan.push({ row: null, key: [clean(name[1])], cells: cells.filter(([c]) => !keys.includes(c)) });
      });
    }

    let values = 0, added = 0, skipped = 0;
    const made = new Map(), kids = new Map();
    edit(tx => {
      const make = (name, kind) => {
        const o = tx.add('record', { kind });
        tx.add('record', { at: o, edge: 'Name', field: 'text', value: name });
        made.set(norm(name), o);
        return o;
      };
      const childAt = (at, edge) => kids.get(`${at}|${norm(edge)}`) ?? entryAt(st, at, edge);
      // Where a relation's side is at, under an object: the object, or the entry the side's pattern names.
      const follow = (id, loc) => !loc.args ? id : (x => x && childAt(x, loc.args[0].edge))(follow(id, loc.args[0].loc));
      for (const p of plan) {
        let row = p.row;
        if (!row) {
          if (!p.key.length || p.key.some(x => !x)) { skipped += p.cells.filter(([, raw]) => clean(raw)).length; continue; }
          if (m.isKind) row = made.get(norm(p.key[0])) ?? make(p.key[0], m.rows.kind);
          else {
            const args = keys.map((k, i) => ({ edge: k.edge, at: follow(find(st, p.key[i]) ?? made.get(norm(p.key[i])) ?? make(p.key[i], kindAt(m, k.edge)), m.rows.args.find(a => same(a.edge, k.edge)).loc) }));
            if (args.some(a => !a.at)) { skipped += p.cells.length; continue; }
            const own = p.cells.find(([c]) => c.key === '$out');
            row = tx.add('record', { args, ...(own ? value(own[0].type, clean(own[1])) ?? { tag: true } : { tag: true }) });
          }
          added++;
        }
        for (const [c, raw] of p.cells) {
          if (!clean(raw) || (!p.row && c.key === '$out')) continue;
          if (c.key === '$entry' || c.key === '$of' || c.type === 'edge') { skipped++; continue; }
          const path = c.key === '$value' || c.key === '$out' ? null : c.path;
          let at = row;
          if (path) for (const e of path.slice(0, -1)) at = at && childAt(at, e);
          const id = path ? at && childAt(at, path.at(-1)) : row, r = id && st[id];
          const out = at && value(typeIn(c, r), clean(raw));
          if (!out) { skipped++; continue; }
          if (r && id in entered && JSON.stringify(valueOf(out)) === JSON.stringify(valueOf(r))) continue;
          if (r && id in entered) write(tx, { id, at }, c, out);
          else if (path) kids.set(`${at}|${norm(path.at(-1))}`, tx.add('record', { at, edge: path.at(-1), ...out }));
          else { skipped++; continue; }
          values++;
        }
      }
    }, () => [values && `Pasted ${count(values, 'value')}`, added && `${values ? 'added' : 'Added'} ${count(added, m.noun)}`, skipped && `${count(skipped, 'value')} left out`].filter(Boolean).join(', '));
  }
  // A heading the table hasn't got is a new entry, of the datatype its values read as.
  function newColumn(title, vals) {
    vals = vals.map(clean).filter(Boolean);
    const type = vals.length && vals.every(v => YES.test(v) || NO.test(v)) ? 'tag' : [...new Set(vals.map(Tree.classify))].length === 1 ? Tree.classify(vals[0]) : 'text';
    return { key: 'new:' + norm(title), title, path: [title], type, options: [] };
  }
  // The kind most of a relation's sides are, for a new object on that side.
  function kindAt(m, edge) {
    const st = now.state(), n = new Map();
    for (const d of m.data) { const a = st[d.id].args.find(x => same(x.edge, edge)), k = a && st[Tree.objectOf(st, a.at)]?.kind; if (k) n.set(k, (n.get(k) ?? 0) + 1); }
    return [...n].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Entity';
  }

  // ---- Columns: Show/Hide and Order are notes in the view ----
  // The column's own note in the view, written over or added.
  function note(tx, label, c, view, value) {
    const r = now.notes().resolve(label, c.pattern, view, c.param), n = { label, pattern: c.pattern, view, value, ...(c.param && { param: c.param }) };
    r?.note.view === view && Tree.key(r.note.pattern) === Tree.key(c.pattern) ? tx.set(r.note.note, n) : tx.add('note', n);
  }
  const show = (c, on) => edit(tx => note(tx, 'Shown', c, current.view, on), () => `${on ? 'Showed' : 'Hid'} ${c.title}`, { day: null });
  function placeColumns() {
    const m = current, cols = table.getColumns().map(c => c.getField()).filter(Boolean).map(f => m.cols[+f.slice(1)]);
    edit(tx => [...cols, ...m.cols.filter(c => !cols.includes(c))].filter(c => c.pattern).forEach((c, i) => note(tx, 'Order', c, m.view, i + 1)), null, { day: null });
  }
  const columnItems = m => m.cols.filter(c => c.pattern).map(c => ({ label: c.parent ? `${c.parent} › ${c.title}` : c.title, checked: c.shown, run: () => show(c, !c.shown) }));
  function columnMenu(e, col) {
    const m = current, c = col.getField() && m.cols[+col.getField().slice(1)];
    if (!c) return;
    Shell.menu({ x: e.clientX, y: e.clientY }, [
      { label: 'Sort A to Z', run: () => table.setSort(col.getField(), 'asc') },
      { label: 'Sort Z to A', run: () => table.setSort(col.getField(), 'desc') },
      ...(c.pattern ? ['-', { label: 'Hide', run: () => show(c, false) }, { label: 'Columns', items: columnItems(m) }] : []),
    ]);
  }
  function rowMenu(e, row) {
    const st = now.state(), ids = [...new Set([row.getData().id, ...[...picked].filter(id => table.getRow(id))])].filter(id => id in now.entered());
    if (!ids.length || readOnly()) return;
    const what = ids.length === 1 ? (current.isKind ? nameOf(st, ids[0]) : count(1, current.noun)) : count(ids.length, current.noun);
    Shell.menu({ x: e.clientX, y: e.clientY }, [{ label: 'Delete', danger: true, run: () => edit(tx => ids.forEach(id => tx.remove(id)), () => `Deleted ${what}`) }]);
  }

  // ---- Selection: a row selected is the record selected, and the other way round ----
  let picked = new Set(), picking = false;
  function pick(range) {
    if (!range || !current) return;
    const rows = range.getRows(), all = table.getRows('active').length;
    if (!rows.length || (rows.length === all && all > 1)) return;   // a whole column: an entry in general, not its rows
    picking = true;
    Shell.select([...new Set(rows.map(r => r.getData().id))].slice(0, 50));
    picking = false;
  }
  function mark() {
    if (!table) return;
    const now = new Set(Shell.selection.peek());
    for (const id of new Set([...picked, ...now])) table.getRow(id)?.getElement().classList.toggle('picked', now.has(id));
    picked = now;
  }

  function keydown(e) {
    if (!table || table.modules.edit?.currentCell || e.target.closest('.tabulator-header')) return;
    const cell = table.modules.selectRange?.getActiveCell()?.getComponent();
    if (!cell) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && !readOnly()) { e.preventDefault(); clear(); }
    else if (e.key === ' ' && current.cols[+cell.getField()?.slice(1)]?.type === 'tag') { e.preventDefault(); flip(cell); }
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && cell.getField()) {
      const c = current.cols[+cell.getField().slice(1)];
      if (c.type === 'tag' || c.type === 'choice' || c.type === 'edge' || readOnly()) return;
      typed0 = e.key;
      e.preventDefault();
      cell.edit(true);
      if (!table.modules.edit.currentCell) typed0 = null;
    }
  }

  // ---- The part ----
  Shell.register('table', {
    mount(host) {
      el = host;
      el.classList.add('grid');
      const offs = [
        effect(() => { now.state(); now.notes(); now.schema(); Shell.time.value; refresh(); }),
        effect(() => { Shell.selection.value; if (!picking) { mark(); const id = Shell.selection.value[0]; if (id && table?.getRow(id)) table.scrollToRow(id, 'nearest', false).catch(() => {}); } }),
        // A grid drawn while its slot was hidden is measured again once it shows.
        effect(() => { Shell.view.value; requestAnimationFrame(() => { if (table && ready && el?.offsetParent) table.redraw(); }); }),
      ];
      return () => { offs.forEach(f => f()); table?.destroy(); table = null; el = null; };
    },
  });

  // Export: what the table shows, as CSV, while a table is shown.
  let unexport = null;
  effect(() => {
    const on = !!viewOf(Shell.view.value)?.layout;
    if (on && !unexport) unexport = Shell.register('export', { name: 'CSV', run: () => {
      const chart = Shell.parts.peek().workbook?.charts().find(c => c.id === App.chart.peek())?.name;
      table?.download('csv', `${[chart, viewOf(Shell.view.peek())?.name].filter(Boolean).join(' – ')}.csv`, { bom: true });
    } });
    if (!on && unexport) { unexport(); unexport = null; }
  });

  // ---- The sheet tabs: the View objects, in their Order ----
  const fresh = name => { const names = new Set(views().map(v => norm(v.name))); let n = name, i = 2; while (names.has(norm(n))) n = `${name} ${i++}`; return n; };
  // A new view, after the one it copies or at the end. A copy takes the original's notes and shapes.
  function addView(name, layout, from) {
    let id;
    const vs = views(), at = from ? vs.findIndex(v => v.id === from) + 1 : vs.length, mine = viewTree(from);
    edit(tx => {
      id = tx.add('record', { kind: 'View' });
      tx.add('record', { at: id, edge: 'Name', field: 'text', value: fresh(name) });
      [...vs.slice(0, at), { id }, ...vs.slice(at)].forEach((v, i) => order(tx, v.id, i + 1));
      if (layout) tx.add('note', { label: 'Layout', pattern: viewTree(id), value: layout });
      if (from) for (const { id: _, ...r } of App.wb.rows(App.chart.peek())) {
        if ('shape' in r && r.view === from) { const { shape: __, ...s } = r; tx.add('shape', { ...s, view: id }); }
        else if ('note' in r && r.view === from) { const { note: __, ...n } = r; tx.add('note', { ...n, view: id }); }
        else if ('note' in r && !r.view && r.label !== 'Order' && Tree.key(r.pattern) === Tree.key(mine)) { const { note: __, ...n } = r; tx.add('note', { ...n, pattern: viewTree(id) }); }
      }
    }, null, { day: null });
    if (!id) return;
    Shell.show(id);
    // The new tab's name is typed into, as the shell does for a tab double-clicked.
    requestAnimationFrame(() => document.querySelector('.sheets .sheet[aria-selected="true"]')?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
  }
  function order(tx, id, i) {
    const n = now.notes().resolve('Order', viewTree(id))?.note;
    if (n && Tree.key(n.pattern) === Tree.key(viewTree(id))) { if (n.value !== i) tx.set(n.note, { label: 'Order', pattern: viewTree(id), value: i }); }
    else tx.add('note', { label: 'Order', pattern: viewTree(id), value: i });
  }
  const undated = (fn, say) => edit(fn, say && (() => say), { day: null });
  function addMenu() {
    const anchor = document.querySelector('.foot > .btn.icon[aria-label="New view"]');
    const { kinds, relations, datatypes } = layouts(), as = l => ({ label: l.name, run: () => addView(l.name, { rows: l.rows }) });
    Shell.menu(anchor, [
      { label: 'Chart', run: () => addView('Chart') },
      '-',
      { label: 'Records', items: kinds.map(as) },
      { label: 'Relations', items: relations.map(as) },
      ...datatypes.map(as),
    ], { placement: 'top-start' });
  }

  Shell.register('views', {
    list: () => views().map(v => ({ id: v.id, name: v.name, layout: v.layout ? 'table' : 'chart' })),
    rename: (id, name) => {
      const st = now.entered(), n = entryAt(st, id, 'Name');
      undated(tx => n ? tx.set(n, { at: id, edge: 'Name', field: 'text', value: name }) : tx.add('record', { at: id, edge: 'Name', field: 'text', value: name }));
    },
    move: (id, i) => {
      const vs = views().filter(v => v.id !== id);
      vs.splice(i, 0, { id });
      undated(tx => vs.forEach((v, k) => order(tx, v.id, k + 1)));
    },
    add: () => { addMenu(); return null; },
    menu: id => {
      const v = viewOf(id), m = current?.view === id ? current : null;
      return [
        ...(v?.layout && m ? [{ label: 'Columns', items: columnItems(m) }] : []),
        { label: 'Duplicate', run: () => addView(v.name, null, id) },
        { label: 'Delete', danger: true, disabled: views().length < 2, run: () => {
          const next = views().find(x => x.id !== id);
          undated(tx => tx.remove(id), `Deleted ${v.name}`);
          if (Shell.view.peek() === id && next) Shell.show(next.id, { replace: true });
        } },
      ];
    },
  });

  return { model, layouts, views, paste: t => paste(t), get grid() { return table; } };
})();
