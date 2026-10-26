// Table views (dendra.md, Views): a view laid out as a table is one Tabulator grid. Its rows are the records
// of one kind (Entities), one relation (Ownership), or every entry of one datatype (Dates, Documents), as its
// Layout note says; its columns are what's located at the rows. In the view, a Shown note at a column's
// pattern shows or hides it, and Order notes place the columns. Every edit, paste or deletion is one change,
// so one Undo takes it back.

const Table = (() => {
  const { effect } = Shell;
  const { clean, norm, same, plural } = Tree;

  const below = (p, path) => path.reduce((loc, edge) => ({ args: [{ edge, loc }] }), p);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
  const count = (n, one, many = plural(one)) => `${n} ${n === 1 ? one : many}`;
  const BLANK = '\u0000blank';
  const entryAt = (st, at, edge) => at && Tree.entryAt(st, at, edge);
  const valueOf = r => !r ? undefined : 'tag' in r ? r.tag : 'choice' in r ? r.choice : r.value;
  const viewOf = id => App.views.value.find(v => v.id === id);

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
    const st = App.state.value, C = App.computed.value, N = App.notes.value, S = App.schema.value;
    const rows = viewOf(view)?.rows;
    if (!rows) return null;
    const isDatatype = typeof rows === 'string', isKind = !isDatatype && !rows.args;
    const order = (p, path) => path.map((_, i) => N.order(below(p, path.slice(0, i + 1))) ?? Infinity);
    const lead = [], trail = [];   // columns that keep their place: a datatype's value and entry first, Of last
    let cols = [], ids, base = null, up = false;

    if (isDatatype) {
      // Every entry of the datatype. Where each is at an object of one kind (every link at a Document), the
      // kind's other entries are columns too; otherwise one column says what each is of.
      ids = Object.keys(st).filter(id => st[id].field === rows);
      const labels = new Set(ids.map(id => norm(st[id].edge ?? ''))), kinds = new Set(ids.map(id => st[st[id].at]?.kind ?? null));
      const kind = kinds.size === 1 && [...kinds][0];
      lead.push({ key: '$value', title: Tree.DATATYPES[rows], type: rows, shown: true });
      if (labels.size !== 1) lead.push({ key: '$entry', title: 'What', type: 'text', shown: true });
      if (kind) { base = { kind }; up = true; } else trail.push({ key: '$of', title: 'Whose', type: 'text', shown: true });
    } else {
      base = isKind ? { kind: rows.kind } : rows;
      ids = isKind ? Tree.index(st).kinds.get(norm(rows.kind)) ?? []
        : Object.keys(st).filter(id => st[id].args?.length > 1 && Tree.fits(st, id, rows));
      // A relation's sides come first, each a column whose notes are the relation's at that edge.
      if (!isKind) {
        const specs = Object.values(S).filter(t => t.args?.length > 1 && Tree.narrower(t, rows));
        cols.push(...N.edges(rows).map((edge, i) => ({ key: '@' + norm(edge), edge, title: edge, type: 'edge', pattern: rows, param: edge, base: [-1, i] })));
        const out = typed({ key: '$out', title: N.name(rows), base: [-1, 1e9] }, specs);
        if (out.type !== 'tag') cols.push(out);
      }
    }
    if (base) {
      const isRow = base.args ? loc => loc.args?.length > 1 && Tree.narrower(loc, base) : loc => !loc.args && same(loc.kind, base.kind);
      const own = up && ids.length && norm(st[ids[0]].edge);
      for (const c of entryColumns(S, isRow)) if (!(up && c.path.length === 1 && norm(c.path[0]) === own))
        cols.push(typed({ ...c, up, pattern: below(base, c.path), title: c.path.at(-1), parent: c.path.slice(0, -1).join(' › '), base: order(base, c.path) }, c.specs));
      // In the view, Order places a column and Shown shows it; by default every entry at the row shows.
      for (const c of cols) {
        const o = c.pattern && N.resolve('Order', c.pattern, view, c.param);
        c.place = o?.note.view === view ? o.value : Infinity;
        c.shown = !c.pattern || (N.value('Shown', c.pattern, view, c.param) ?? (!!c.param || c.path.length === 1));
      }
      const lex = (a, b) => { for (let i = 0; i < Math.max(a.length, b.length); i++) { const d = (a[i] ?? -2) - (b[i] ?? -2); if (d) return d; } return 0; };
      cols.sort((a, b) => a.place - b.place || lex(a.base, b.base) || a.key.localeCompare(b.key));
    }
    cols = [...lead, ...cols, ...trail];

    // Each cell: the record there, if any, and where one would go.
    const cellOf = (row, c) => {
      if (c.type === 'edge') {
        const a = st[row].args.find(x => same(x.edge, c.edge));
        return { at: a?.at, v: a ? N.nameOf(st, Tree.objectOf(st, a.at)) : undefined };
      }
      if (c.key === '$out') return { id: row, at: null, v: valueOf(st[row]) };
      if (c.key === '$value') return { id: row, at: st[row].at, v: st[row].value };
      if (c.key === '$entry') return { v: N.nameOf(st, row) };
      if (c.key === '$of') return { v: N.placeOf(st, st[row].args ? row : st[row].at) };
      let at = c.up ? st[row].at : row;
      for (const e of c.path.slice(0, -1)) at = entryAt(st, at, e);
      const id = entryAt(st, at, c.path.at(-1));
      return { id, at, v: valueOf(st[id]) };
    };
    const today = App.day.value, data = ids.map(id => {
      const row = { id, _m: {} };
      cols.forEach((c, i) => {
        const m = cellOf(id, c), r = m.id && st[m.id], f = 'f' + i;
        row[f] = m.v ?? null;
        // The engine says what it worked out, and what entered it also covers; a date a formula gives is a deadline.
        const fx = !!C.computed?.[m.id], over = !!C.covered?.[m.id];
        row._m[f] = { id: m.id, at: m.at, fx, over, due: (fx || over) && r.field === 'date' && r.value < today };
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
    } else if (cols[0]) data.sort((a, b) => text(cols[0].type, a.f0).localeCompare(text(cols[0].type, b.f0)));

    const noun = (isDatatype ? Tree.DATATYPES[rows] : isKind ? rows.kind : N.name(rows)).toLowerCase();
    return { view, rows, isKind, isDatatype, cols, data, groups, noun };
  }

  // ---- How cells read, copy and edit ----
  const NUMERIC = new Set(['number', 'percent', 'money']);
  const text = (type, v) => v === null || v === undefined ? '' : type === 'tag' ? (v ? 'Yes' : 'No')
    : type === 'date' ? Tree.formatDate(v, 'short') : type === 'document' || NUMERIC.has(type) ? Tree.format(type, v) : String(v);
  // What a cell copies and exports as: a document as its address, so the link survives.
  const plain = (type, v) => type === 'document' ? String(v ?? '') : type === 'date' ? (v ? Tree.formatDate(v) : '') : text(type, v);
  const typing = (type, v) => v === null || v === undefined ? '' : type === 'date' ? Tree.formatDate(v) : type === 'document' ? String(v) : text(type, v);
  const YES = /^(yes|y|true|x|✓|✔|1)$/i, NO = /^(no|n|false|0)$/i;
  const meta = cell => cell.getRow().getData()._m[cell.getField()];
  const LIST = { autocomplete: true, listOnEmpty: true, placeholderEmpty: 'No match', placeholderLoading: '' };   // Tabulator's dropdowns, worded as the shell's menus

  function formatter(c) {
    return cell => {
      const el = cell.getElement(), m = meta(cell), v = cell.getValue();
      el.classList.toggle('fx', !!m?.fx);
      el.classList.toggle('over', !!m?.over);
      el.classList.toggle('due', !!m?.due);
      el.classList.toggle('none', c.type !== 'edge' && !c.key.startsWith('$') && !m?.at);
      if (c.type === 'tag') return v === null ? '<span class="tag"></span>' : `<span class="tag ${v ? 'yes' : 'no'}${m?.fx ? ' fx' : ''}"></span>`;
      if (c.type === 'document' && v) return `<a href="${esc(v)}" target="_blank" rel="noopener">${esc(Tree.format('document', v))}</a>`;
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
      // A heading's filter offers the values the column has now, as they read, and Blank where it has one.
      const values = () => {
        const vs = [...new Set(current.data.map(r => r[f]).filter(v => v !== null))].sort((a, b) => typeof a === 'number' ? a - b : String(a).localeCompare(String(b)));
        return [...vs.map(v => ({ label: text(c.type, v), value: v })), ...(current.data.some(r => r[f] === null) ? [{ label: 'Blank', value: BLANK }] : [])];
      };
      return {
        title: c.title, field: f, minWidth: c.type === 'tag' ? 56 : 72, maxInitialWidth: 340,
        titleFormatter: c.parent ? () => `<span class="up">${esc(c.parent)}</span>${esc(c.title)}` : undefined,
        hozAlign: NUMERIC.has(c.type) ? 'right' : 'left', cssClass: 'c-' + (c.type === 'edge' ? 'edge' : c.type),
        sorter: NUMERIC.has(c.type) ? 'number' : c.type === 'tag' ? 'boolean' : 'string', sorterParams: { alignEmptyValues: 'bottom' },
        formatter: formatter(c),
        editable: cell => !App.readOnly.peek() && (c.type === 'edge' || !!meta(cell)?.at || c.key === '$out'),
        editor: !editable ? false : c.type === 'choice' || c.type === 'edge' ? 'list' : editor(c, put),
        editorParams: c.type === 'choice' ? { ...LIST, values: c.options, freetext: true, allowEmpty: true }
          : c.type === 'edge' ? () => ({ ...LIST, values: objects(m, c) }) : undefined,
        headerFilter: 'list', headerFilterParams: { ...LIST, valuesLookup: values, clearable: true },
        headerFilterFunc: (want, v) => want === BLANK ? v === null || v === '' : v === want,
        headerFilterEmptyCheck: v => v === undefined || v === null || v === '',
        accessorClipboard: v => plain(c.type, v), accessorDownload: v => csvSafe(plain(c.type, v)),
      };
    });
    if (defs[0]) defs[0].frozen = true;
    return defs;
  }
  const csvSafe = s => /^[=+\-@]/.test(s) && !Tree.isNumber(s) ? `'${s}` : s;
  // The kinds of object a relation's side can be at, as the schema has them (under the entry it's at, if any).
  function sideKinds(m, edge) {
    const kinds = new Set(), root = loc => loc.args ? root(loc.args[0].loc) : loc.kind;
    for (const t of Object.values(App.schema.value)) if (t.args?.length > 1 && Tree.narrower(t, m.rows))
      for (const a of t.args) if (same(a.edge, edge) && root(a.loc)) kinds.add(norm(root(a.loc)));
    return kinds;
  }
  const objects = (m, c) => { const st = App.state.value; return [...sideKinds(m, c.edge)].flatMap(k => Tree.index(st).kinds.get(k) ?? []).map(id => App.notes.peek().nameOf(st, id)).sort(); };
  // An object of those kinds by its Name, or else its Short Name.
  const find = (st, name, kinds) => {
    const n = norm(name), N = App.notes.peek(), of = Object.keys(st).filter(id => Tree.isObject(st[id]) && kinds.has(norm(st[id].kind)));
    return of.find(id => norm(N.nameOf(st, id)) === n) ?? of.find(id => norm(N.shortOf(st, id)) === n);
  };
  // Where a relation's side is at under an object: the object, or the entry the side's pattern names there.
  const follow = (st, id, loc) => !loc.args ? id : (x => x && entryAt(st, x, loc.args[0].edge))(follow(st, id, loc.args[0].loc));
  const sideLoc = (m, edge) => m.rows.args.find(a => same(a.edge, edge)).loc;

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
        groupHeader: (g, n) => `${g === 'overdue' ? 'Overdue' : Tree.formatDate(g + '-01', 'month')}<span>${n}</span>`,
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
    if (!el || v?.layout !== 'table') return;
    const m = model(view);
    current = m;
    // A table whose rows aren't chosen yet.
    if (!m) { table?.destroy(); table = null; built = null; el.innerHTML = '<div class="empty">No rows</div>'; return; }
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

  // ---- Writing: each edit, paste or deletion one change ----
  const edit = (fn, say) => !!App.change(fn, { say });
  const typeIn = (c, r) => r ? ('choice' in r ? 'choice' : 'tag' in r ? 'tag' : r.field) : c.type;
  const columnOf = cell => current.cols[+cell.getField().slice(1)];
  const readable = (cell, raw) => { const c = columnOf(cell), m = meta(cell); return !clean(raw) || c.type === 'edge' || !!value(typeIn(c, m.id && App.state.value[m.id]), clean(raw)); };
  // A value typed or chosen in a cell, as one change: a correction, or with a day shown, from that day on.
  function put(cell, raw) {
    const c = columnOf(cell), m = meta(cell), st = App.state.value, r = m.id && st[m.id], entered = m.id in App.entered.value;
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
    return v === undefined ? null : { field: type, value: typeof v === 'number' ? +v.toPrecision(12) : v };   // 67.3% is 0.673
  };
  function write(tx, m, c, out) {
    if (m.id && m.id in App.entered.value) return tx.update(m.id, out);
    if (c.key === '$out') return;
    return tx.add('record', { at: m.at, edge: c.path?.at(-1) ?? App.state.value[m.id].edge, ...out });
  }
  // A relation's side moved to another object, found by name.
  function side(tx, st, row, edge, name) {
    const o = find(st, name, sideKinds(current, edge)), to = o && follow(st, o, sideLoc(current, edge));
    if (to) tx.update(row, { args: st[row].args.map(a => same(a.edge, edge) ? { edge: a.edge, at: to } : a) });
  }
  // A tag's box: blank, attested, ruled out, and blank again; over a formula, entering wins and clearing
  // gives the formula back.
  function flip(cell) {
    const m = meta(cell), c = columnOf(cell), v = cell.getValue(), entered = m.id in App.entered.value;
    if (!m.at || App.readOnly.peek()) return;
    edit(tx => v === true ? write(tx, m, c, { tag: false }) : v === false && entered ? tx.remove(m.id) : write(tx, m, c, { tag: true }));
    Shell.emit('tag-flip', m.id);
  }
  // Clears the cells of the range: the values entered there go, as one change.
  function clear() {
    const ids = new Set(), entered = App.entered.value;
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
    if (!m || !grid.length || App.readOnly.peek()) return;
    const st = App.state.value, entered = App.entered.value, N = App.notes.peek();
    // A row is found by its key: an object by its Name (or Short Name), a relation by the names at its sides.
    const keys = m.isKind ? m.cols.filter(c => c.path?.length === 1 && same(c.title, 'Name')) : m.cols.filter(c => c.type === 'edge');
    const names = (d, k) => {
      const o = k.type === 'edge' ? Tree.objectOf(st, st[d.id].args.find(a => same(a.edge, k.edge))?.at) : d.id;
      return o ? [N.nameOf(st, o), N.shortOf(st, o)].map(norm) : [];
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
      // A side named in the paste: an object of the kinds that side can be, or a new one of the commonest.
      const sideAt = (edge, name) => follow(st, find(st, name, sideKinds(m, edge)) ?? made.get(norm(name)) ?? make(name, kindAt(m, edge)), sideLoc(m, edge));
      for (const p of plan) {
        let row = p.row;
        if (!row) {
          if (!p.key.length || p.key.some(x => !x)) { skipped += p.cells.filter(([, raw]) => clean(raw)).length; continue; }
          if (m.isKind) row = made.get(norm(p.key[0])) ?? make(p.key[0], m.rows.kind);
          else {
            const args = keys.map((k, i) => ({ edge: k.edge, at: sideAt(k.edge, p.key[i]) }));
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
          let at = c.up ? st[row]?.at : row;
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
    const st = App.state.value, n = new Map();
    for (const d of m.data) { const a = st[d.id].args.find(x => same(x.edge, edge)), k = a && st[Tree.objectOf(st, a.at)]?.kind; if (k) n.set(k, (n.get(k) ?? 0) + 1); }
    return [...n].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Entity';
  }

  // ---- Columns: Show/Hide and Order are the column's own notes in the view ----
  const note = (tx, label, c, view, value) => tx.note(label, c.pattern, value, { view, param: c.param });
  const show = (c, on) => edit(tx => note(tx, 'Shown', c, current.view, on), `${on ? 'Showed' : 'Hid'} ${c.title}`);
  function placeColumns() {
    const m = current, cols = table.getColumns().map(c => c.getField()).filter(Boolean).map(f => m.cols[+f.slice(1)]);
    edit(tx => [...cols, ...m.cols.filter(c => !cols.includes(c))].filter(c => c.pattern).forEach((c, i) => note(tx, 'Order', c, m.view, i + 1)));
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
    const st = App.state.value, ids = [...new Set([row.getData().id, ...[...picked].filter(inGrid)])].filter(id => id in App.entered.value);
    if (!ids.length || App.readOnly.peek()) return;
    const what = ids.length === 1 ? (current.isKind ? App.notes.peek().nameOf(st, ids[0]) : count(1, current.noun)) : count(ids.length, current.noun);
    Shell.menu({ x: e.clientX, y: e.clientY }, [{ label: 'Delete', danger: true, run: () => edit(tx => ids.forEach(id => tx.remove(id)), () => `Deleted ${what}`) }]);
  }

  // ---- Selection: a row selected is the record selected, and the other way round ----
  let picked = new Set(), picking = false;
  // Whether a record is a row of the grid shown (Tabulator warns of a row asked for that isn't).
  const inGrid = id => !!current?.data.some(r => r.id === id);
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
    for (const id of new Set([...picked, ...now])) inGrid(id) && table.getRow(id).getElement().classList.toggle('picked', now.has(id));
    picked = now;
  }

  function keydown(e) {
    if (!table || table.modules.edit?.currentCell || e.target.closest('.tabulator-header')) return;
    const cell = table.modules.selectRange?.getActiveCell()?.getComponent();
    if (!cell) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && !App.readOnly.peek()) { e.preventDefault(); clear(); }
    else if (e.key === ' ' && current.cols[+cell.getField()?.slice(1)]?.type === 'tag') { e.preventDefault(); flip(cell); }
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && cell.getField()) {
      const c = current.cols[+cell.getField().slice(1)];
      if (c.type === 'tag' || c.type === 'choice' || c.type === 'edge' || App.readOnly.peek()) return;
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
        effect(() => { App.state.value; App.notes.value; App.schema.value; Shell.time.value; refresh(); }),
        effect(() => { Shell.selection.value; if (!picking) { mark(); const id = Shell.selection.value[0]; if (id && table && inGrid(id)) table.scrollToRow(id, 'nearest', false).catch(() => {}); } }),
        // A grid drawn while its slot was hidden is measured again once it shows.
        effect(() => { Shell.view.value; requestAnimationFrame(() => { if (table && ready && el?.offsetParent) table.redraw(); }); }),
      ];
      return () => { offs.forEach(f => f()); table?.destroy(); table = null; el = null; };
    },
  });

  // Export: what the table shows, as CSV, while a table is shown.
  let unexport = null;
  effect(() => {
    const on = viewOf(Shell.view.value)?.layout === 'table';
    if (on && !unexport) unexport = Shell.register('export', { name: 'CSV', run: () => {
      const chart = App.shown.peek().charts().find(c => c.chart === App.chart.peek())?.name;
      table?.download('csv', `${[chart, viewOf(Shell.view.peek())?.name].filter(Boolean).join(' – ')}.csv`, { bom: true });
    } });
    if (!on && unexport) { unexport(); unexport = null; }
  });

  return { model, paste, get grid() { return table; } };
})();
