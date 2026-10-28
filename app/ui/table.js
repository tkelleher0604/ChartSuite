// Table views (dendra.md, Views): a view laid out as a table is one Tabulator grid, edited as Excel's is. Its rows are
// the records of one kind (Entities), one relation (Ownership), or every entry of one datatype (Dates, Documents), as
// its Layout note says; its columns are what's located at the rows, and a Shown note in the view at a pattern below the
// rows where no record is yet (a column just inserted, named as it's typed). In the view, a Shown note at a column's
// pattern shows or hides it, and Order notes place the columns: a heading dragged, its menu (the chevron, or a
// right-click, or Alt+Down), or the Columns control above the grid. Every edit, fill, paste, deletion or new row is one
// change, so one Undo takes it back. How one person looks at a table (its sort, filters, grouping, frozen columns and
// widths) is kept per view in this browser (Shell.store), never a change. A pending change, whoever asks
// (FormulaBar.preview), is redlined in the grid, and a paste waits there for Enter. Export offers the table as an Excel
// workbook (SheetJS, loaded the first time it's needed) or CSV; the status bar counts, sums and averages the cells
// selected.

const Table = (() => {
  const SCRIPT = document.currentScript?.src ?? location.href;
  const { effect, html } = Shell;
  const { clean, norm, same, plural } = Tree;
  const { useState, useRef } = preactHooks;

  const below = (p, path) => path.reduce((loc, edge) => ({ args: [{ edge, loc }] }), p);
  // The path of edges from `base` down to a pattern built by `below`, or null if it isn't one.
  const pathBelow = (p, base) => {
    const path = [], k = Tree.key(base);
    while (p?.args?.length === 1 && Tree.key(p) !== k) { path.unshift(p.args[0].edge); p = p.args[0].loc; }
    return p && path.length && Tree.key(p) === k ? path : null;
  };
  const esc = s => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
  const count = (n, one, many = plural(one)) => `${n} ${n === 1 ? one : many}`;
  const list = xs => xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`;
  const BLANK = '\u0000blank';
  const entryAt = (st, at, edge) => at && Tree.entryAt(st, at, edge);
  const valueOf = r => !r ? undefined : 'tag' in r ? r.tag : 'choice' in r ? r.choice : r.value;
  const viewOf = id => App.views.value.find(v => v.id === id);
  const blank = v => v === null || v === undefined || v === '';

  // ---- How one person looks at a table: per view, in this browser, never a change ----
  // { sort: { key, dir }, filters: { key: [values, null for Blank] }, group: key, frozen: columns kept in view (1, the
  // names, unless said), widths: { key: px } }.
  const lookKey = view => `table.${App.chart.peek()}.${view}`;
  function lookOf(view) { try { return JSON.parse(Shell.store.get(lookKey(view)) || '{}') || {}; } catch { return {}; } }
  function setLook(view, patch) {
    const l = { ...lookOf(view), ...patch };
    for (const k of Object.keys(l)) if (l[k] === undefined || l[k] === null || (typeof l[k] === 'object' && !Object.keys(l[k]).length)) delete l[k];
    Shell.store.set(lookKey(view), Object.keys(l).length ? JSON.stringify(l) : null);
    looked.value++;
    return l;
  }
  const looked = Shell.signal(0);
  const frozenOf = l => l.frozen ?? 1;

  // How a column's values compare, as its sort, its filter's list and its groups put them: numbers and dates as such,
  // a choice in its options' order, a tag Yes first, text and names as words, figures in them as numbers.
  function compare(c) {
    const at = v => { const i = c.options?.indexOf(v) ?? -1; return i < 0 ? Infinity : i; };
    return (a, b) => {
      if (typeof a === 'number' && typeof b === 'number') return a - b;
      if (typeof a === 'boolean' && typeof b === 'boolean') return b - a;
      const i = at(a), j = at(b);
      return i !== j ? (i < j ? -1 : 1) : String(a).localeCompare(String(b), 'en', { numeric: true, sensitivity: 'base' });
    };
  }
  // …and blank last, whichever way it's sorted.
  const sorter = c => { const cmp = compare(c); return (a, b, _a, _b, _c, dir) => blank(a) || blank(b) ? (blank(a) - blank(b)) * (dir === 'desc' ? -1 : 1) : cmp(a, b); };
  // What sorting a column is called, as Excel calls it for what it holds.
  const SORTS = { number: ['smallest to largest', 'largest to smallest'], date: ['oldest to newest', 'newest to oldest'], tag: ['Yes first', 'No first'] };
  const sortWords = c => SORTS[NUMERIC.has(c.type) ? 'number' : c.type === 'yearly' ? 'date' : c.type] ?? ['A to Z', 'Z to A'];

  // ---- The model: a table's columns and rows, worked out from a computed state (App's, or a pending one) ----
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
  // What a column holds, from its specifications: the commonest type, and a choice's options in their order, as
  // the inspector lists them (an Order at each), and after those by name.
  function typed(c, specs, N = App.notes.value) {
    const types = specs.map(t => 'field' in t.out ? t.out.field : 'choice' in t.out ? 'choice' : 'tag');
    const type = types.sort((a, b) => types.filter(x => x === b).length - types.filter(x => x === a).length)[0];
    const rank = new Map();
    for (const t of specs) if ('choice' in t.out) rank.set(t.out.choice, Math.min(rank.get(t.out.choice) ?? Infinity, N.optionOrder(t) ?? Infinity));
    return { ...c, type, options: [...rank.keys()].sort((a, b) => rank.get(a) - rank.get(b) || a.localeCompare(b)) };
  }

  function model(view, R = App.computed.value, S = App.schema.value, look = lookOf(view)) {
    const st = R.records, N = App.notes.value;
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
      const column = (path, specs, fresh) => ({ key: path.map(norm).join('›'), path, specs, up, pattern: below(base, path), title: path.at(-1), parent: path.slice(0, -1).join(' › '), base: order(base, path), ...fresh });
      const mine = path => !(up && path.length === 1 && norm(path[0]) === own);
      for (const c of entryColumns(S, isRow)) if (mine(c.path)) cols.push(typed(column(c.path, c.specs), c.specs));
      // A column with no values yet: a Shown note in the view at a pattern below the rows, where no record is. It's
      // titled by its edge, and the first value typed into it says what it holds.
      const have = new Set(cols.map(c => c.key));
      for (const n of N.notes('Shown')) {
        const path = n.view === view && !n.param && pathBelow(n.pattern, base);
        if (!path || !mine(path) || have.has(path.map(norm).join('›'))) continue;
        const c = column(path, [], { type: 'text', options: [], fresh: true });
        have.add(c.key);
        cols.push(c);
      }
      // In the view, Order places a column and Shown shows it; by default every entry at the row shows. A tag
      // a Check note covers is a check, which says only where it fails.
      for (const c of cols) {
        const o = c.pattern && N.resolve('Order', c.pattern, view, c.param);
        c.place = o?.note.view === view ? o.value : Infinity;
        c.shown = !c.pattern || (N.value('Shown', c.pattern, view, c.param) ?? (!!c.param || c.path.length === 1));
        c.check = c.type === 'tag' && !!c.specs?.some(s => N.value('Check', s) === true);
      }
      const lex = (a, b) => { for (let i = 0; i < Math.max(a.length, b.length); i++) { const d = (a[i] ?? -2) - (b[i] ?? -2); if (d) return d; } return 0; };
      cols.sort((a, b) => a.place - b.place || lex(a.base, b.base) || a.key.localeCompare(b.key));
      // Beside a row's Name, its link says where the document is filed rather than its name again.
      if (isKind && cols.some(c => c.path?.length === 1 && same(c.title, 'Name'))) for (const c of cols) if (c.type === 'document' && c.path.length === 1) c.filed = true;
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
      if (c.key === '$of') return { v: Time.whose(st, st[row].args ? row : st[row].at, N) };
      let at = c.up ? st[row].at : row;
      for (const e of c.path.slice(0, -1)) at = entryAt(st, at, e);
      const id = entryAt(st, at, c.path.at(-1));
      return { id, at, v: valueOf(st[id]) };
    };
    const today = App.day.value, data = ids.map(id => {
      const row = { id, _m: {}, _red: null };   // _red: 'add' or 'go' while a change is pending (redlined)
      for (const c of cols) {
        const m = cellOf(id, c), r = m.id && st[m.id], f = field(c), type = typeIn(c, r);
        row[f] = m.v ?? null;
        // The engine says what it worked out, and what entered it also covers; a date a formula gives is a deadline.
        // A value of another datatype than its column's reads as its own.
        const fx = !!R.computed?.[m.id], cov = !!R.covered?.[m.id], over = R.covered?.[m.id]?.agrees === false;
        row._m[f] = { id: m.id, at: m.at, fx, over, due: (fx || cov) && r.field === 'date' && r.value < today, ...(type !== c.type && { type }) };
      }
      row._ruled = st[id].tag === false;
      return row;
    });
    // A check's column is drawn only while a row fails it, as the inspector shows a check only where it fails.
    for (const c of cols) if (c.check) c.fails = data.some(r => r[field(c)] === false);

    // Dates fall into months, with what's overdue first, then from this month on, then back from it.
    let groups = null, named = null;
    const f0 = cols[0] && field(cols[0]), by = cols.find(c => c.key === look.group);
    if (rows === 'date') {
      const month = today.slice(0, 7);
      for (const r of data) r._g = r._m[f0].due ? 'overdue' : r[f0].slice(0, 7);
      const keys = [...new Set(data.map(r => r._g))];
      const ahead = keys.filter(k => k !== 'overdue' && k >= month).sort(), past = keys.filter(k => k !== 'overdue' && k < month).sort().reverse();
      groups = [...(keys.includes('overdue') ? ['overdue'] : []), ...ahead, ...past];
      const at = new Map(groups.map((g, i) => [g, i]));
      data.sort((a, b) => at.get(a._g) - at.get(b._g) || (a._g < month ? b[f0].localeCompare(a[f0]) : a[f0].localeCompare(b[f0])));
    } else if (f0) data.sort((a, b) => text(typeOf(cols[0], a), a[f0]).localeCompare(text(typeOf(cols[0], b), b[f0])));
    // Grouped by a column, the rows fall under its values, in the order it sorts them, Blank last.
    if (rows !== 'date' && by) {
      const f = field(by), cmp = sorter(by), seen = new Map();
      for (const r of data) { r._g = blank(r[f]) ? BLANK : JSON.stringify(r[f]); if (!seen.has(r._g)) seen.set(r._g, r); }
      const firsts = [...seen.values()].sort((a, b) => cmp(a[f], b[f], null, null, null, 'asc'));
      groups = firsts.map(r => r._g);
      named = new Map(firsts.map(r => [r._g, r._g === BLANK ? 'Blank' : text(typeOf(by, r), r[f])]));
    }

    const noun = (isDatatype ? Tree.DATATYPES[rows] : isKind ? rows.kind : N.name(rows)).toLowerCase();
    const m = { view, rows, isKind, isDatatype, base, cols, byField: new Map(cols.map(c => [field(c), c])), data, groups, named, noun };
    entitle(m);
    return m;
  }
  // A column's field in the grid's rows: its own key, so a column added or hidden beside it never moves it.
  const field = c => 'f:' + c.key;
  // A column's heading, in the grid and in the file alike: its own name, where no other column drawn reads alike; else as
  // much of its path as tells it from those (Jurisdiction › Due beside Due), the shortest end of it that ends no other's.
  function entitle(m) {
    const cs = m.cols.filter(drawn), paths = cs.map(c => c.path ?? [c.title]), keys = paths.map(p => p.map(norm));
    const ends = (a, b, k) => b.length >= k && a.slice(-k).join('›') === b.slice(-k).join('›');
    cs.forEach((c, i) => {
      let k = 1;
      while (k < paths[i].length && keys.some((o, j) => j !== i && ends(keys[i], o, k))) k++;
      c.head = paths[i].slice(-k);
    });
  }
  const headed = c => (c.head ?? [c.title]).join(' › ');

  // ---- The redline: the grid as a pending change would leave it, beside the grid now ----
  // A row that would appear is blue, one that would go is struck in red, and a value that would change shows
  // the old struck beside the new; the cell keeps what it was as `was`.
  function redlined(now, then) {
    const was = new Map(now.data.map(r => [r.id, r]));
    const data = then.data.map(r => {
      const w = was.get(r.id);
      if (!w) return { ...r, _red: 'add' };
      const _m = { ...r._m };
      for (const c of then.cols) { const f = field(c), v = w[f] ?? null; if (v !== r[f]) _m[f] = { ..._m[f], was: v }; }
      return { ...r, _m };
    });
    const kept = new Set(then.data.map(r => r.id));
    for (const w of now.data) if (!kept.has(w.id)) data.push({ ...w, _red: 'go' });
    return { ...then, data, red: true };
  }
  const isRed = r => !!r._red || Object.values(r._m).some(m => 'was' in m);
  // The schema as a pending change would leave it, so a heading pasted that the chart hasn't got is a column.
  function schemaWith(p) {
    const S = App.schema.value, recs = p.change.records ?? {};
    const ts = Object.keys(recs).filter(id => recs[id]).map(id => Tree.treeOf(p.R2.records, id)).filter(Boolean).map(Tree.specOf);
    return ts.every(t => S[Tree.key(t)]) ? S : Tree.schema([...Object.values(S), ...ts]);
  }

  // ---- How cells read, copy and edit ----
  const NUMERIC = new Set(['number', 'percent', 'money']);
  const text = (type, v) => v === null || v === undefined ? '' : type === 'tag' ? (v ? 'Yes' : 'No')
    : type === 'date' ? Tree.formatDate(v, 'short') : Tree.format(type, v);
  // What a cell copies and exports as: a document as its address, so the link survives.
  const plain = (type, v) => type === 'document' ? String(v ?? '') : type === 'date' ? (v ? Tree.formatDate(v) : '') : text(type, v);
  const typing = (type, v) => v === null || v === undefined ? '' : type === 'date' ? Tree.formatDate(v) : type === 'document' ? String(v) : text(type, v);
  // Where a document is filed: its folder, else its library or host.
  const filed = v => { const l = Tree.linkOf(v); return l.folder ? l.folder.split('/').join(' › ') : l.library || l.host || l.short; };
  const YES = /^(yes|y|true|x|✓|✔|1)$/i, NO = /^(no|n|false|0)$/i;
  const meta = cell => cell.getRow().getData()._m[cell.getField()];
  const LIST = { autocomplete: true, listOnEmpty: true, placeholderEmpty: 'No match', placeholderLoading: '' };   // Tabulator's dropdowns, worded as the shell's menus

  function formatter(c) {
    // A tag's box, blank, attested or ruled out; a check's only where it fails.
    const box = (v, m) => v === null ? '<span class="tag"></span>' : `<span class="tag ${v ? 'yes' : 'no'}${m?.fx ? ' fx' : ''}${m && 'was' in m ? ' pend' : ''}"></span>`;
    const shown = (v, m, type = m?.type ?? c.type) => type === 'tag' ? (!c.check ? box(v, m) : v === false ? box(v, m) : '')
      : type === 'document' && v ? `<a href="${esc(SharePoint.href(v))}" target="_blank" rel="noopener" tabindex="-1">${esc(c.filed ? filed(v) : Tree.format('document', v))}</a>`
      : esc(text(type, v));
    return cell => {
      const el = cell.getElement(), m = meta(cell), v = cell.getValue();
      el.tabIndex = -1;   // the grid is one stop in the tab order, and the arrows move within it
      el.classList.toggle('fx', !!m?.fx);
      el.classList.toggle('over', !!m?.over);
      el.classList.toggle('due', !!m?.due);
      el.classList.toggle('none', c.type !== 'edge' && !c.key.startsWith('$') && !m?.at);
      if (!m || !('was' in m) || c.type === 'tag') return shown(v, m);
      return [m.was !== null && `<span class="del">${shown(m.was, null, m.type ?? c.type)}</span>`, v !== null && `<span class="add">${shown(v, m)}</span>`].filter(Boolean).join(' ');
    };
  }
  // The datatype a cell's value reads as: its own, where it isn't its column's.
  const typeOf = (c, d) => d?._m[field(c)]?.type ?? c.type;

  // A text editor, as Excel's: Enter or leaving keeps what's typed, Esc puts it back, and what can't be read
  // stays open, marked. Begun by typing, it holds what's typed; by F2, the value with the caret at its end; else the
  // value selected. Ctrl+Enter keeps what's typed in every cell of the range.
  let typed0 = null, atEnd = false;
  const editor = (c, put) => (cell, onRendered, success, cancel) => {
    const input = document.createElement('input');
    input.className = 'typed';
    input.value = typed0 ?? typing(typeOf(c, cell.getRow().getData()), cell.getValue());
    const first = typed0 !== null || atEnd;
    typed0 = null; atEnd = false;
    onRendered(() => { input.focus(); if (!first) input.select(); else input.setSelectionRange(input.value.length, input.value.length); });
    let done = false;
    const bad = () => { input.classList.add('bad'); input.setAttribute('aria-invalid', 'true'); return false; };
    const keep = () => {
      if (done) return true;
      if (!readable(cell, input.value)) return bad();
      done = true;
      cancel();
      put(cell, input.value);
      return true;
    };
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.stopPropagation(); if (!readable(cell, input.value)) return bad(); const cs = ranged; done = true; cancel(); fillWith(cell, input.value, cs); }
      else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); if (keep()) move(e.shiftKey ? 'up' : 'down'); }
      else if (e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); if (keep()) move(e.shiftKey ? 'left' : 'right'); }
      else if (e.key === 'Escape') { e.stopPropagation(); done = true; cancel(); back(); }
    });
    input.addEventListener('blur', () => { if (!keep()) { done = true; cancel(); } });
    return input;
  };
  // After an edit, the active cell moves as Excel's does, and the grid keeps the keys.
  function move(d) {
    setTimeout(() => {
      const sr = table?.modules.selectRange;
      if (sr?.activeRange) {
        if (d === 'left' || d === 'right') { tabbed ??= sr.getActiveCell()?.column; step(d); }
        else { const col = d === 'down' ? tabbed : null; tabbed = null; step(d, col); }
      }
      back();
    }, 0);
  }

  // ---- The grid ----
  let table = null, ready = false, built = null, current = null, real = null, el = null, cells = null, pins = null;
  // The grid is laid out as Excel's is. Each column is as wide as what it holds in every row, drawn or not, to a
  // cap, and a tag's column as narrow as its heading set on two lines; nothing is cut to fit. The first column,
  // the names, has no cap but half the grid, past which a name goes on to a second line. Where there's room,
  // what's cut short has it first, the least cut first, so the most come out whole; what's left stays at the
  // right edge. Where there isn't, the grid scrolls across under its first column, which stays put, a column at
  // a time. A column the user has sized keeps its width.
  const TAG = /\bc-tag\b/, PIN = /\bpin\b/, LEAD = /\blead\b/, sized = new WeakSet();   // sized here, so free to size again
  const ruler = document.createElement('canvas').getContext('2d');
  // The widest of a column's values as its cells set them, in every row.
  function widest(c) {
    const col = current?.byField.get(c.getField()), cell = c.cells.find(x => x.element?.isConnected)?.element;
    if (!col || !cell) return 0;
    const s = getComputedStyle(cell), f = c.getField(), said = (v, type) => type === 'document' ? (col.filed ? filed(v) : Tree.format('document', v)) : text(type, v);
    ruler.font = `${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
    let w = 0;
    for (const row of c.table.rowManager.rows) { const v = row.data[f]; if (v !== null && v !== undefined) w = Math.max(w, ruler.measureText(said(v, typeOf(col, row.data))).width); }
    return Math.ceil(w + parseFloat(s.paddingLeft) + parseFloat(s.paddingRight) + parseFloat(s.borderRightWidth)) + 2;
  }
  // The columns kept in view (frozen, as Excel says: the first, the names, unless the user says otherwise) each stay
  // put where the row numbers and those before them end; a column the grid scrolls to starts clear of them all.
  const pinsOf = t => t.getColumns().filter(c => c.getField() && PIN.test(c.getDefinition().cssClass));
  const frozenWidth = t => pinsOf(t).reduce((s, c) => s + c.getWidth(), 0);
  function pinned(t) {
    let left = 48;
    const rules = pinsOf(t).map((c, i) => { const r = `.grid .tabulator .tabulator-header .tabulator-col.pin-${i}, .grid .tabulator-row .tabulator-cell.pin-${i} { left: ${left}px; }`; left += c.getWidth(); return r; });
    if (pins) pins.textContent = rules.join('\n');
    t.element.style.setProperty('--pinned', `${left}px`);
    requestAnimationFrame(strip);
  }
  // The room a grid has, to the whole pixel below, since its slot is measured as the inspector glides, between
  // pixels; and the room each grid was last laid out in, so one laid out in another is laid out again.
  const widthOf = t => { const h = t.rowManager.element; return Math.floor(h.getBoundingClientRect().width - (h.offsetWidth - h.clientWidth)); };
  const laid = new WeakMap();
  // A heading's width on two lines: the break between its words that leaves the longer line shortest.
  function twoLines(c) {
    const t = getComputedStyle(c.getElement().querySelector('.tabulator-col-title')), b = getComputedStyle(c.getElement().querySelector('.tabulator-col-content'));
    ruler.font = `${t.fontWeight} ${t.fontSize} ${t.fontFamily}`;
    const words = String(c.definition.title).split(' '), w = ws => ruler.measureText(ws.join(' ')).width;
    let line = w(words);
    for (let i = 1; i < words.length; i++) line = Math.min(line, Math.max(w(words.slice(0, i)), w(words.slice(i))));
    return Math.ceil(line + parseFloat(b.paddingLeft) + parseFloat(b.paddingRight)) + 1;
  }
  // Each column is measured as Tabulator fits a column to its data, but all of them at once: every column's width let
  // go, then every one measured, then every one set, so the grid is laid out once to measure them, not once a column.
  Tabulator.extendModule('layout', 'modes', { fitDataSlack(columns) {
    const shown = columns.filter(c => c.visible), free = shown.filter(c => !c.widthFixed || sized.has(c)), full = new Map(), w = widthOf(this.table);
    const plain = free.filter(c => !TAG.test(c.definition.cssClass)), fits = new Map();
    for (const c of plain) { c.widthFixed = false; c.dispatch('column-width-fit-before', c); c.element.style.width = ''; c.cells.forEach(x => x.clearWidth()); }
    for (const c of free) fits.set(c, TAG.test(c.definition.cssClass) ? twoLines(c)
      : { data: Math.max(c.element.offsetWidth, ...c.cells.map(x => x.getWidth())) + 1, all: c.getField() ? widest(c) : 0 });
    for (const c of free) {
      const fit = fits.get(c);
      if (typeof fit === 'number') c.setWidthActual(fit);
      else {
        c.setWidthActual(fit.data);
        c.dispatch('column-width-fit-after', c);
        if (fit.all > c.getWidth()) c.setWidthActual(fit.all);
      }
      full.set(c, c.getWidth());
      const most = LEAD.test(c.definition.cssClass) ? Math.floor(w / 2) : c.maxInitialWidth;
      if (c.getWidth() > most) c.setWidthActual(most);
    }
    laid.set(this.table, w);
    let room = w - shown.reduce((s, c) => s + c.getWidth(), 0);
    const give = (c, d) => { if (c && d > 0) { c.setWidth(c.getWidth() + d); sized.add(c); room -= d; } };
    for (const c of [...free].sort((a, b) => (full.get(a) - a.getWidth()) - (full.get(b) - b.getWidth()))) give(c, Math.min(room, full.get(c) - c.getWidth()));
    pinned(this.table);
  } });

  const drawn = c => c.pasted || (c.shown && (!c.check || c.fails));
  // A heading: its name (under as much of its path as tells it from another's, entitle), a funnel while it's filtered,
  // which opens its filter, and the chevron that opens its menu, shown while it's pointed at.
  const FUNNEL = Shell.iconMarkup('filter'), CHEVRON = Shell.iconMarkup('chevron');
  const heading = c => `${c.head?.length > 1 ? `<span class="up">${esc(c.head.slice(0, -1).join(' › '))}</span>` : ''}<span class="t">${esc(c.title)}</span>`
    + `<span class="funnel" role="button" aria-label="Filter" data-tip="Filter">${FUNNEL}</span>`
    + `<button type="button" class="col-menu" tabindex="-1" aria-haspopup="menu" aria-label="${esc(c.title)}" data-tip="Column menu" data-keys="Alt+↓">${CHEVRON}</button>`;
  function columnDefs(m, look = lookOf(m.view)) {
    const defs = m.cols.filter(drawn).map(c => {
      const editable = c.type !== 'tag' && c.key !== '$entry' && c.key !== '$of', right = NUMERIC.has(c.type) ? 'right' : 'left', width = look.widths?.[c.key];
      return {
        title: c.title, titleDownload: headed(c), field: field(c), minWidth: c.type === 'tag' ? 56 : 72, maxInitialWidth: 340, ...(width && { width }),
        titleFormatter: () => heading(c),
        hozAlign: right, headerHozAlign: right, cssClass: 'c-' + (c.type === 'edge' ? 'edge' : c.type) + (look.filters?.[c.key] ? ' filtered' : '') + (look.sort?.key === c.key ? ' sorted' : ''),
        sorter: sorter(c),
        formatter: formatter(c),
        editable: cell => !App.readOnly.peek() && !current?.red && (c.type === 'edge' || !!meta(cell)?.at || c.key === '$out'),
        editor: !editable ? false : c.type === 'choice' || c.type === 'edge' ? 'list' : editor(c, put),
        editorParams: c.type === 'choice' ? { ...LIST, values: c.options, freetext: true, allowEmpty: true }
          : c.type === 'edge' ? () => ({ ...LIST, values: objects(m, c) }) : undefined,
        accessorClipboard: (v, d) => plain(typeOf(c, d), v), accessorDownload: (v, d) => csvSafe(plain(typeOf(c, d), v)),
      };
    });
    // The columns kept in view are kept so by table.css, not frozen: Tabulator's range selection takes only the row
    // numbers frozen. The first column's rows are as tall as a name wrapped takes.
    const n = Math.min(frozenOf(look), defs.length);
    defs.forEach((d, i) => { if (i < n) d.cssClass += ` pin pin-${i}${i === n - 1 ? ' pin-last' : ''}`; });
    if (defs[0]) Object.assign(defs[0], { cssClass: defs[0].cssClass + ' lead', variableHeight: true });
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
  const objectsOf = (st, kinds) => [...kinds].flatMap(k => Tree.index(st).kinds.get(norm(k)) ?? []);
  // ---- Names as people write them ----
  // A name read for what it names: its letters and figures, whatever their case, the spaces and punctuation between them
  // aside, so "Calder Ridge Capital Partners III L.P." reads as "Calder Ridge Capital Partners III, L.P.".
  const loose = s => String(s ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  // An object of those kinds by its Name, or else its Short Name: as written, or else the one alone that reads alike.
  const find = (st, name, kinds) => {
    const n = norm(name), l = loose(name), N = App.notes.peek(), of = objectsOf(st, kinds), one = xs => xs.length === 1 ? xs[0] : undefined;
    return of.find(id => norm(N.nameOf(st, id)) === n) ?? of.find(id => norm(N.shortOf(st, id)) === n)
      ?? (l ? one(of.filter(id => loose(N.nameOf(st, id)) === l)) ?? one(of.filter(id => loose(N.shortOf(st, id)) === l)) : undefined);
  };
  // How far apart two names are as read (loose): the fewest letters put in, taken out or changed to make one the other.
  function apart(a, b) {
    let row = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      const next = [i];
      for (let j = 1; j <= b.length; j++) next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      row = next;
    }
    return row[b.length];
  }
  // The object of those kinds a new name is close to, if any, the closest: its Name or Short Name, as read, a fifth of
  // the longer's letters from it, or less (a figure, a word's ending: "Partners 3" for "Partners III", "Holdings Inc" for
  // "Holdings, LLC"), or begun by it, the shorter most of the longer ("Partners III" for "Partners III, L.P.").
  function near(st, name, kinds) { return rivals(st, name, kinds).find(x => x.d < Infinity)?.id ?? null; }
  // How close an object's names are to a name, as read: the fewest letters apart, where that's close; else Infinity.
  function closeness(l, names) {
    let d0 = Infinity;
    if (l.length >= 3) for (const o of names.map(loose)) {
      if (!o) continue;
      const [p, q] = l.length < o.length ? [l, o] : [o, l], begun = q.startsWith(p) && p.length >= 0.6 * q.length, d = begun ? q.length - p.length : apart(l, o);
      if (begun || d <= Math.max(1, Math.floor(q.length / 5))) d0 = Math.min(d0, d);
    }
    return d0;
  }
  // The objects a new name might be instead: those close to it, the closest first; then the rest by name.
  const rivals = (st, name, kinds) => { const l = loose(name), N = App.notes.peek();
    return objectsOf(st, kinds).map(id => { const n = N.nameOf(st, id), s = N.shortOf(st, id); return { id, name: n, short: s, d: closeness(l, [n, s]) }; })
      .sort((a, b) => (a.d - b.d || 0) || a.name.localeCompare(b.name)); };
  // Where a relation's side is at under an object: the object, or the entry the side's pattern names there.
  const follow = (st, id, loc) => !loc.args ? id : (x => x && entryAt(st, x, loc.args[0].edge))(follow(st, id, loc.args[0].loc));
  const sideLoc = (m, edge) => m.rows.args.find(a => same(a.edge, edge)).loc;

  function build(m) {
    // Built again in its view (a column shown, hidden or kept in view), the grid stays where it was scrolled, with what was
    // selected in it: its first and last rows and columns, a column selected whole whole.
    const look = lookOf(m.view), h = table?.rowManager.element, r = ready && table.getRanges()[0];
    const ends = xs => xs.length ? [xs[0], xs.at(-1)] : null, rs = r && ends(r.getRows().map(x => x.getData().id)), cs = r && ends(r.getColumns().map(c => c.getField()).filter(Boolean));
    const was = table && ready && built?.view === m.view ? { left: h.scrollLeft, top: h.scrollTop, rs, cs, whole: r && r.getRows().length === table.getRows('active').length,
      fields: table.getColumns().map(c => c.getField()).filter(Boolean), pins: pinsOf(table).map(c => c.getField()) } : null;
    if (table) { table.destroy(); table = null; }
    ready = false;
    cells.replaceChildren();
    const host = document.createElement('div');
    cells.appendChild(host);
    built = { view: m.view, sig: signature(m) };
    // The rows redlined as built, so they're drawn again as they are once the redline goes.
    reds = new Set(m.red ? m.data.filter(isRed).map(r => r.id) : []);
    flight = null;
    const sorted = look.sort && m.cols.find(c => c.key === look.sort.key && drawn(c)), passes = filterOf(m, look);
    const t = table = new Tabulator(host, {
      // A column is sized at its heading's edge, as Excel's is, and a row is only its cells. A field is a column's
      // key as it stands, dots and all. The grid is laid out again as settle says, not as Tabulator watches its size.
      index: 'id', data: m.data, columns: columnDefs(m, look), columnDefaults: { resizable: 'header' }, nestedFieldSeparator: false, height: '100%', layout: 'fitDataSlack', autoResize: false,
      placeholder: m.isKind ? `No ${plural(m.noun)}` : 'No rows',
      rowHeader: { formatter: 'rownum', headerSort: false, resizable: false, frozen: true, hozAlign: 'right', width: 48, minWidth: 48, cssClass: 'rn' },
      selectableRange: 1, selectableRangeColumns: true, selectableRangeRows: true, selectableRangeInitializeDefault: false,
      editTriggerEvent: 'dblclick',
      // Tab, Home and End are the grid's own, as Excel's (keydown); F6 leaves it.
      keybindings: { navPrev: false, navNext: false, scrollToStart: false, scrollToEnd: false },
      clipboard: true, clipboardCopyStyled: false, clipboardCopyRowRange: 'range',
      clipboardCopyConfig: { columnHeaders: false, columnGroups: false, rowHeaders: false, rowGroups: false, columnCalcs: false, formatCells: false },
      // A link pasted onto a row isn't the grid's: it goes on to link a document (inspector.js).
      clipboardPasteParser: text => { const to = onto(text); return to === 'record' ? false : { text: to === 'cell' ? text : '' }; },
      clipboardPasteAction: ({ text }) => { if (text) paste(text); return []; },
      // A heading is moved by dragging it at once (headings), not after Tabulator's pause.
      movableColumns: false, headerSortClickElement: 'icon', columnHeaderVertAlign: 'bottom',
      rowFormatter: row => {
        const d = row.getData(), e = row.getElement();
        e.classList.toggle('ruled', !!d._ruled);
        e.classList.toggle('picked', picked.has(d.id));
        e.classList.toggle('red-add', d._red === 'add');
        e.classList.toggle('red-go', d._red === 'go');
      },
      ...(m.groups && {
        groupBy: '_g', groupValues: [m.groups], groupToggleElement: 'header',
        groupHeader: (g, n) => `${esc(m.named ? m.named.get(g) : g === 'overdue' ? 'Overdue' : Tree.formatDate(g + '-01', 'month'))}<span>${n}</span>`,
      }),
      ...(sorted && { initialSort: [{ column: field(sorted), dir: look.sort.dir }] }),
      ...(passes && { initialFilter: passes }),
    });
    // Laid out, the grid draws its rows again from where it's scrolled, each drawn row measured at the columns'
    // new widths and the rest reckoned from them. Tabulator would measure every row, drawn or not, but go on
    // reckoning the rows it hasn't drawn from the rows first drawn, before the columns were laid out: rows a
    // narrow first column had wrapped, so the grid ran on three times its rows' height, blank.
    t.rowManager.normalizeHeight = function () { this.renderer.rerenderRows(); };
    t.on('cellEdited', cell => { const d = columnOf(cell); if (d.type === 'choice' || d.type === 'edge') put(cell, cell.getValue() ?? ''); back(); });
    t.on('cellEditCancelled', () => back());
    t.on('cellClick', (e, cell) => { if (e.target.closest('.tag')) flip(cell); });
    t.on('rangeChanged', () => { soon(); tally(); });
    t.on('rangeAdded', range => { if (quiet.has(range)) quiet.delete(range); else soon(); tally(); });
    t.on('rangeRemoved', tally);
    t.on('dataSorted', sorters => { if (ready && t === table) keepSort(sorters); });
    t.on('columnMoved', () => placeColumns());
    // A width the user gives a column is kept, in this view.
    t.on('columnResized', col => { sized.delete(col._column); keepWidth(col); pinned(t); });
    t.on('headerContext', (e, col) => { e.preventDefault(); columnMenu({ x: e.clientX, y: e.clientY }, col); });
    t.on('rowContext', (e, row) => { e.preventDefault(); rowMenu(e, row); });
    t.on('renderComplete', () => { regain(); strip(); });
    t.on('scrollVertical', strip);
    // What's selected is outlined only where the grid scrolls, never over the columns kept in view (table.css).
    t.on('scrollHorizontal', left => t.element.style.setProperty('--across', `${left}px`));
    for (const ev of ['dataFiltered', 'dataSorted', 'rowAdded', 'rowDeleted', 'groupVisibilityChanged']) t.on(ev, () => requestAnimationFrame(strip));
    // Filtered or sorted, the cells under the selection are others: they're counted again (a moment later, once the rows are).
    t.on('dataFiltered', () => { looked.value++; setTimeout(tally); });
    t.on('dataSorted', () => setTimeout(tally));
    // A grid built again before this one was, this one's building done is nothing: it would ready, and lay out, the next.
    t.on('tableBuilt', () => {
      if (t !== table) return;
      ready = true;
      // The columns kept in view stay put beside the row numbers (table.css), so the keys scroll a cell clear of them.
      const sr = t.modules.selectRange, numbers = sr.getRowHeaderWidth.bind(sr);
      sr.getRowHeaderWidth = () => numbers() + frozenWidth(t);
      // One stop in the tab order: the rows, not the headings.
      host.querySelectorAll('.tabulator-header').forEach(x => x.setAttribute('tabindex', '-1'));
      wireHeadings(t);
      tall.set(t, t.element.clientHeight);
      mark();
      if (was?.rs && was.cs) {
        const all = t.getRows('active'), row = id => t.rowManager.findRow(id)?.getComponent(), col = f => t.getColumns().find(c => c.getField() === f);
        const [r0, r1] = was.whole ? [all[0], all.at(-1)] : was.rs.map(row), [c0, c1] = was.cs.map(col);
        if (r0 && r1 && c0 && c1) hold(r0.getCell(c0), r1.getCell(c1));
      }
      reveal(Shell.selection.peek()[0]);
      regain();
      settle();
      if (was) { t.rowManager.element.scrollLeft = was.left; t.rowManager.element.scrollTop = was.top; }
      // Built again in its view, what came into it (a column shown, inserted or pasted into) is shown where it is; or what
      // moved in it, into or out of the columns kept in view, with the column that went out of them, or came in, for it,
      // as they're kept by place (Excel's frozen panes): so none goes under them unseen.
      if (was) {
        const now = t.getColumns().map(c => c.getField()).filter(Boolean), pins = pinsOf(t).map(c => c.getField()), come = now.filter(f => !was.fields.includes(f));
        const moved = movedIn(was.fields, now), crossed = now.filter(f => moved.length && was.fields.includes(f) && !moved.includes(f) && was.pins.includes(f) !== pins.includes(f));
        arrive(come.length ? come : [...moved, ...crossed]);
      } else moving = null;
      strip();
      tally(); looked.value++;
    });
  }
  // What the columns are, in any order (a column moved is moved in the grid: arrange); when it changes, the grid is
  // built again rather than refreshed.
  const signature = m => JSON.stringify([m.view, m.cols.filter(drawn).map(c => [c.key, c.title, c.type, c.options, c.filed, c.check, c.head]).sort((a, b) => a[0] < b[0] ? -1 : 1),
    m.groups, m.named && [...m.named.values()]]);

  let reds = new Set(), seen = null;
  // Whether a row's data says what the grid's row does, whatever order its columns' fields are in: a column moved
  // changes no row.
  const sameIn = (a, b) => typeof a === 'object' && a !== null && typeof b === 'object' && b !== null && Object.keys(a).length === Object.keys(b).length
    && Object.keys(a).every(k => a[k] === b[k] || (k in b && JSON.stringify(a[k]) === JSON.stringify(b[k])));
  const sameRow = (a, b) => !!b && Object.keys(a).length === Object.keys(b).length
    && Object.keys(a).every(k => a[k] === b[k] || (typeof a[k] === 'object' && a[k] !== null && (k === '_m' ? sameIn(a[k], b[k]) : JSON.stringify(a[k]) === JSON.stringify(b[k]))));
  function refresh() {
    const view = Shell.view.value, v = viewOf(view), p = FormulaBar.pending.value;
    if (!el || v?.layout !== 'table') return;
    // A grid is built and drawn only in its slot shown; asked for while it's hidden, it's done once the slot shows.
    owed = !el.offsetParent;
    if (owed) return;
    // What it shows is worked out from these: shown again with them as they were, the grid is as it was.
    const from = [view, p, App.computed.value, App.schema.value, App.notes.value, App.views.value, App.day.value];
    if (table && ready && !flight && drewFrom?.every((x, i) => x === from[i])) return settle();
    const now = model(view);
    real = now;
    // A table whose rows aren't chosen yet.
    if (!now) { table?.destroy(); table = null; built = null; current = null; cells.innerHTML = '<div class="empty">No rows</div>'; return; }
    let m = now;
    if (p) {
      m = redlined(now, model(view, p.R2, schemaWith(p)));
      // A paste into a column the view hides shows it while the paste is pending.
      for (const c of m.cols) if (App.pending.peek()?.cols?.has(c.key)) c.pasted = true;
      entitle(m);
    }
    current = m;
    shownM.value = m;
    // Under a table whose rows are a kind's or a relation's, a row for a new one, where the chart can be changed.
    el.classList.toggle('adds', !m.isDatatype && !m.red && !App.readOnly.peek());
    if (!table || built.view !== view || built.sig !== signature(m)) { drewFrom = from; since(now); return build(m); }
    if (!ready) return table.on('tableBuilt', () => refresh());
    if (!flight && !arrange(m)) { drewFrom = from; since(now); return build(m); }
    // One update at a time: another asked for meanwhile follows it.
    if (flight) { flight.again = true; return; }
    drewFrom = from;
    // Rows keep their place while they're edited; a sort or a filter applies again only when asked.
    // (Only a redlined grid has rows redlined.)
    const t = table, lit = p ? [] : since(now), red = new Set(m.red ? m.data.filter(isRed).map(r => r.id) : []), first = m.red && !reds.size && (m.data.find(r => r._red) ?? m.data.find(isRed))?.id;
    const f = flight = { again: false };
    // Only the rows that say something else are updated, as Tabulator measures every row it's given again; a row that
    // comes (back, by Undo, or pasted) goes where its records put it, after the row before it, not at the end.
    const had = new Map(t.getRows().map(row => [row.getData().id, row.getData()])), changed = m.data.filter(r => !sameRow(r, had.get(r.id)));
    const updated = changed.filter(r => had.has(r.id)), there = new Set(had.keys());
    const come = () => m.data.filter(r => !had.has(r.id)).reduce((p, r) => p.then(() => {
      const before = m.data.slice(0, m.data.indexOf(r)).findLast(x => there.has(x.id));
      there.add(r.id);
      return before ? t.addRow(r, false, before.id) : t.addRow(r, true);
    }), Promise.resolve());
    // However it ends, the next update can go; one that failed has left rows that can't be trusted, so the grid
    // is built again from what's there.
    let ok = false;
    t.blockRedraw();
    (updated.length ? t.updateData(updated) : Promise.resolve()).then(come).then(() => {
      if (t !== table) return;
      const keep = new Set(m.data.map(r => r.id)), rows = new Map();
      for (const row of t.getRows()) if (!keep.has(row.getData().id)) row.delete(); else rows.set(row.getData().id, row);
      for (const id of new Set([...reds, ...red])) rows.get(id)?.reformat();
      reds = red;
      t.restoreRedraw();
      ok = true;
    }).finally(() => {
      if (flight === f) flight = null;
      if (t !== table) return;
      if (!ok) return build(current);
      mark();
      if (first) reveal(first);
      flash(lit);
      regain();
      tally(); looked.value++;
      strip();
      if (f.again) refresh(); else settle();
    });
  }
  let flight = null, owed = false, drewFrom = [];
  // Built again, as what's kept in this browser (the look) changes what the grid is: its groups, its widths, the columns
  // kept in view.
  const rebuild = () => { if (built) built.sig = null; drewFrom = null; refresh(); };

  // ---- The grid's room, which one owner lays it out in ----
  // A grid is laid out as it's built, in its slot shown. It's laid out again here, and only here, once its slot has
  // settled, shown and not gliding (Shell.gliding), in another room than it was laid out in: the columns fitted again
  // for another width, the rows drawn again for another height. So the inspector gliding in or out lays it out once,
  // at the end, and a view shown again in the room it was laid out in costs nothing. A cell being edited keeps the
  // layout it's edited in until it's left (back), and rows being updated until they are (refresh).
  const tall = new WeakMap();
  function settle() {
    if (!el?.offsetParent || Shell.gliding.peek()) return;
    if (owed) return refresh();
    const t = table;
    if (!t || !ready || flight || t.modules.edit?.currentCell) return;
    const h = t.element.clientHeight;
    if (laid.get(t) !== widthOf(t)) t.redraw();
    else if (tall.get(t) !== h) t.rowManager.redraw();
    else return;
    tall.set(t, h);
    regain();
  }

  // ---- Quiet feedback: the cells a change just made light for a moment, whoever made it ----
  // The cells that differ from the grid last drawn, at this view, with these columns, at this time.
  function since(now) {
    const s = seen, key = signature(now) + JSON.stringify(Shell.time.peek());
    seen = { key, version: App.version.peek(), data: now.data };
    if (!s || s.key !== key || s.version === seen.version) return [];
    const old = new Map(s.data.map(r => [r.id, r])), out = [];
    for (const r of now.data) {
      const o = old.get(r.id), fs = Object.keys(r).filter(f => f.startsWith('f:') && (!o || o[f] !== r[f]));
      if (fs.length) out.push([r.id, fs]);
    }
    return out.length > 60 ? [] : out;   // a sweeping change isn't one to light up cell by cell
  }
  function flash(lit) {
    if (!lit.length || !table) return;
    // The rows, not a grouped grid's month headings.
    const shown = new Set(table.getColumns().map(c => c.getField()).filter(Boolean)), rows = new Map(table.getRows('active').map(r => [r.getData().id, r]));
    for (const [id, fs] of lit) for (const f of fs) {
      const e = shown.has(f) && rows.get(id)?.getElement().isConnected && rows.get(id).getCell(f)?.getElement();
      if (!e) continue;
      e.classList.remove('lit');
      void e.offsetWidth;   // so the light starts again
      e.classList.add('lit');
      e.addEventListener('animationend', () => e.classList.remove('lit'), { once: true });
    }
  }

  // ---- The keys: the grid is one stop in the tab order, and keeps the keys through its redraws ----
  let inside = false, pressed = 0;   // whether the grid had the keys last; when the pointer last went down
  document.addEventListener('pointerdown', e => {
    inside = !!cells?.contains(e.target); pressed = e.timeStamp;
    if (inside) tabbed = null;
    // A right-click before anything's selected selects the cell, or the row by its number, as a click would:
    // Tabulator, keeping a range the cell is in, would look in a range that isn't there.
    const row = inside && e.button === 2 && ready && !table.modules.selectRange?.activeRange ? e.target.closest('.tabulator-row') : null;
    const cs = row ? table.getRows().find(x => x.getElement() === row)?.getCells().filter(c => c.getField()) : null;
    if (cs?.length) { const c = cs.find(x => x.getElement().contains(e.target)); table.addRange(c ?? cs[0], c ?? cs.at(-1)); }
  }, true);
  const holder = () => cells?.querySelector('.tabulator-tableholder');
  // A redraw that drops the keys gives them back.
  function regain() {
    const a = document.activeElement;
    if (inside && table && el?.offsetParent && (!a || a === document.body) && !table.modules.edit?.currentCell) holder()?.focus({ preventScroll: true });
  }
  const back = () => { inside = true; ranged = null; requestAnimationFrame(regain); setTimeout(settle); };
  // A cell made active for the keys: the selected record's row, or the first, in the first column. It selects nothing,
  // so a record selected elsewhere (Find, the chart) stays selected, though the filters leave it out (hold); while they
  // do, the grid given the keys has no cell active, till a key that moves makes the first one so (`keyed`).
  function activate(keyed = false) {
    const sr = table?.modules.selectRange;
    if (!ready || !sr || sr.activeRange || (!keyed && hidden(Shell.selection.peek()[0]))) return;
    const rows = table.getRows('active'), id = Shell.selection.peek().find(inGrid);
    const row = (id && rows.find(r => r.getData().id === id)) || rows[0], col = table.getColumns().find(c => c.getField());
    if (!row || !col) return;
    hold(row.getCell(col), row.getCell(col));
    reveal(row.getData().id);
  }
  // F6 and the like give the grid the keys, at its active cell.
  // A grid still being built takes them once it is.
  function focus() {
    if (!table || !el?.offsetParent) return false;
    if (!ready) { const t = table; t.on('tableBuilt', () => { if (t === table) focus(); }); return true; }
    const h = holder();
    if (!h) return false;
    inside = true;
    h.focus({ preventScroll: true });
    activate();
    return true;
  }
  // Before Tabulator hears a key, the keys move as Excel's do: with no cell active, a key that moves makes one; Enter
  // and Shift+Enter move down and up, Enter back to the column a run of Tabs began in; Tab and Shift+Tab move across.
  // Ctrl+Enter, in a dropdown being typed in, keeps what's typed in every cell of the range (a cell typed in keeps it
  // itself: editor). While a change is pending, Enter is App's, which makes it.
  const canEdit = cell => { const d = cell.getColumn().getDefinition(); return !!d.editor && (typeof d.editable !== 'function' || d.editable(cell)); };
  let tabbed = null;   // the column a run of Tabs began in
  let ranged = null;   // the cells selected as a cell began to be typed in, which Tabulator narrows to that cell
  function first(e) {
    if (!table) return;
    const sr = table.modules.selectRange, editing = table.modules.edit?.currentCell;
    if (editing) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.target.classList?.contains('typed')) {
        e.preventDefault(); e.stopPropagation();
        const raw = e.target.value ?? '', cell = editing.getComponent(), cs = ranged;
        cell.cancelEdit();
        fillWith(cell, raw, cs);
      }
      return;
    }
    if (e.target.closest?.('.tabulator-header')) return;
    if (/^(Arrow|Page|Home$|End$|Tab$|Enter$|F2$)/.test(e.key) && !sr?.activeRange) { e.preventDefault(); e.stopPropagation(); activate(true); return; }
    // Alt+Down opens the active cell's column's menu, as it opens a heading's filter in Excel; the cell stays where it is.
    if (e.key === 'ArrowDown' && e.altKey && !current?.red) {
      e.preventDefault(); e.stopPropagation();
      const col = sr.getActiveCell()?.column.getComponent();
      if (col?.getField()) columnMenu(col.getElement().querySelector('.col-menu') ?? col.getElement(), col);
      return;
    }
    if ((e.key === 'Enter' || e.key === 'Tab') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault(); e.stopPropagation();
      if (e.key === 'Tab') { tabbed ??= sr.getActiveCell()?.column; step(e.shiftKey ? 'left' : 'right'); }
      else { const col = tabbed; tabbed = null; step(e.shiftKey ? 'up' : 'down', col); }
    } else if (/^Arrow/.test(e.key)) tabbed = null;
  }
  // The active cell moved a cell, and on down to the column a run of Tabs began in; brought whole into view.
  function step(d, col) {
    const sr = table?.modules.selectRange;
    if (!sr?.activeRange) return;
    sr.navigate(false, false, d);
    const a = sr.getActiveCell();
    if (col && a && a.column !== col && col.visible) { const cell = a.row.getCell(col)?.getComponent(); if (cell) table.addRange(cell, cell); }
    across();
  }

  // ---- Writing: each edit, paste or deletion one change ----
  const edit = (fn, say, dated) => !!App.change(fn, { say, dated });
  // Records entered as one change: a new one under its own id, an entered one set from the day shown, or from
  // the day `dated` gives (App.change).
  const fill = (tx, records) => {
    const entered = App.entered.peek();
    for (const [id, r] of Object.entries(records)) { const { since: _, before: __, ...rec } = r; if (id in entered) tx.update(id, rec); else tx.add('record', rec, id); }
  };
  const enter = (records, say, dated) => edit(tx => fill(tx, records), say, dated);
  const typeIn = (c, r) => r ? ('choice' in r ? 'choice' : 'tag' in r ? 'tag' : r.field) : c.type;
  const columnOf = cell => current.byField.get(cell.getField());
  // The datatype what's typed is read as: the value's own where there is one, else its column's; in a column with no
  // values yet, what it reads as, as a pasted column's first values say theirs (newColumn).
  const typeFor = (c, r, s) => r ? typeIn(c, r) : c.fresh ? (/^(yes|no|true|false|y|n|x|✓|✔)$/i.test(s) ? 'tag' : Tree.classify(s)) : c.type;
  const readable = (cell, raw) => { const c = columnOf(cell), m = meta(cell), s = clean(raw); return !s || c.type === 'edge' || !!value(typeFor(c, m.id && App.state.value[m.id], s), s); };
  // What typing `raw` into a cell writes: { put: [id, record] }, a value entered; { gone: id }, one cleared; or { side:
  // [row, edge, name] }, a relation's side moved. Null where it writes nothing; false where it can't be read.
  function writing(cell, raw) {
    const c = columnOf(cell), m = meta(cell), st = App.state.peek(), r = m?.id && st[m.id], entered = !!m?.id && m.id in App.entered.peek();
    if (!c || !m) return null;
    if (c.type === 'edge') return clean(raw) ? { side: [cell.getRow().getData().id, c.edge, raw] } : null;
    const s = clean(raw);
    if (!s) return entered ? { gone: m.id } : null;
    const out = value(typeFor(c, r, s), s);
    if (!out) return false;
    if (entered && JSON.stringify(valueOf(out)) === JSON.stringify(valueOf(r))) return null;
    const p = placed(m, c, out);
    return p ? { put: p } : null;
  }
  // What several cells write, as one change: a correction, or with a day shown, from that day on.
  function write(ws, say) {
    ws = ws.filter(Boolean);
    if (!ws.length || App.readOnly.peek() || current?.red) return false;
    const st = App.state.peek(), records = Object.fromEntries(ws.filter(w => w.put).map(w => w.put));
    return edit(tx => { fill(tx, records); ws.forEach(w => w.gone ? tx.remove(w.gone) : w.side && side(tx, st, ...w.side)); }, say);
  }
  // A value typed or chosen in a cell.
  function put(cell, raw) { const w = writing(cell, raw); return w === false ? false : !w || write([w]); }
  const value = (type, s) => {
    if (type === 'choice') return { choice: s };
    if (type === 'tag') return YES.test(s) ? { tag: true } : NO.test(s) ? { tag: false } : null;
    const v = Tree.parse(type, s);
    return v === undefined ? null : { field: type, value: typeof v === 'number' ? +v.toPrecision(12) : v };   // 67.3% is 0.673
  };
  // Where a value goes at a cell, as [id, record]: the record entered there, with it; or a new one in its place.
  function placed(m, c, out) {
    const entered = App.entered.peek();
    if (m.id && m.id in entered) return [m.id, { ...entered[m.id], ...out }];
    if (c.key === '$out' || !m.at) return null;
    return [Log.newId(), { at: m.at, edge: c.path?.at(-1) ?? App.state.peek()[m.id].edge, ...out }];
  }
  // A relation's side moved to another object, found by name.
  function side(tx, st, row, edge, name) {
    const o = find(st, name, sideKinds(current, edge)), to = o && follow(st, o, sideLoc(current, edge));
    if (to) tx.update(row, { args: st[row].args.map(a => same(a.edge, edge) ? { edge: a.edge, at: to } : a) });
  }
  // A tag's box: blank, attested, ruled out, and blank again; over a formula, entering wins and clearing
  // gives the formula back. A check has a box only where it fails.
  function flip(cell) {
    const m = meta(cell), c = columnOf(cell), v = cell.getValue(), entered = m.id in App.entered.value;
    if (!m.at || App.readOnly.peek() || current.red || (c.check && v !== false)) return;
    if (v === false && entered) edit(tx => tx.remove(m.id));
    else { const p = placed(m, c, { tag: v !== true }); if (p) enter(Object.fromEntries([p])); }
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
    return rows.filter(r => r.some(x => clean(x))).map(r => r.map(x => x.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￿]/g, '')));
  }

  // A link pasted onto a row links a document to its record, as a link pasted anywhere does (inspector.js):
  // onto a relation's side, to that side. Only a cell of links, itself the target, takes one as its value.
  // Says 'cell' (paste it here), 'record' (let it go on) or 'none' (onto several rows: nothing).
  function onto(text) {
    if (!Tree.isAddress(clean(text)) || /[\t\n]/.test(text.trim())) return 'cell';
    const cs = table.getRanges()[0]?.getCells().flat() ?? [], c = cs.length === 1 && columnOf(cs[0]);
    if (c?.type === 'document') return 'cell';
    const rows = [...new Set(cs.map(x => x.getRow().getData().id))];
    if (rows.length > 1 || current.red) return 'none';
    const at = c?.type === 'edge' && meta(cs[0])?.at, o = at && Tree.objectOf(App.state.peek(), at);
    if (rows.length) Shell.select([o || rows[0]]);
    return 'record';
  }

  // With a heading row, columns match by heading and rows by name, and what's new is added: rows, objects at
  // a relation's sides, and entries under headings the table hasn't got. A heading nothing matches is asked
  // about, never guessed by its place. Without a heading row, the cells fill the grid from the active cell.
  // Either way the paste is redlined in the grid, and Enter makes it, as one change. A name finds what it names as people
  // write it (find); a new one close to a name the chart has asks whether it's that (near), and any new one can be
  // pointed at a record the chart has, in the bar, before Enter (stage).
  // Pasted while another change is pending, it's pasted into the table as it is, and takes that one's place, which says
  // so (App.stage); never dropped without a word.
  function paste(textIn, { file = null } = {}) {
    const m = real, grid = tsv(textIn);
    if (!m || !grid.length || App.readOnly.peek()) return;
    // A file's first row is its headings, though none of them is a column's yet: they're asked about.
    let head = headings(m, grid) ?? (file && grid.length > 1 ? grid[0].map(h => clean(h) ? named(m, h) : null) : null);
    if (head && m.isDatatype) { grid.shift(); head = null; }   // a datatype's rows have no names to match by
    if (!head) { const r = byPlace(m, grid); return stage(m, () => r, file); }
    const asked = grid[0].some((h, j) => !head[j] && clean(h));
    (asked ? ask(m, grid, head) : Promise.resolve(head)).then(h => h && stage(m, as => byName(m, grid, h, as), file));
  }

  // The column a heading names: by its title, or its place, as much of it as is given (Entity Type › Tax Classification),
  // as its heading in the grid and the file says it; a relation's side by its edge, its list's name (Owners) or the one
  // kind only it can be; the Name by the kind (Entity). Singular or plural alike.
  function named(m, h) {
    const N = App.notes.peek(), is = (a, b) => same(a, b) || same(plural(a), b) || same(a, plural(b));
    const kinds = new Map(m.cols.filter(c => c.type === 'edge').map(c => [c, sideKinds(m, c.edge)]));
    const names = c => [c.title, ...(c.path ?? []).map((_, i, p) => i && p.slice(-i - 1).join(' › ')),
      ...(c.type === 'edge' ? [N.listName(m.rows, c.edge), ...[...kinds.get(c)].filter(k => [...kinds].every(([d, ks]) => d === c || !ks.has(k)))] : []),
      ...(m.isKind && c.path?.length === 1 && same(c.title, 'Name') ? [m.rows.kind, `${m.rows.kind} Name`] : [])].filter(Boolean);
    const hits = m.cols.filter(c => names(c).some(n => is(clean(h), n)));
    return hits.length === 1 ? hits[0] : null;
  }
  // A heading row, as the columns its headings name: one of them names a column; or every one is words over
  // a column of something else (amounts, dates). Null if the block has none.
  function headings(m, grid) {
    if (grid.length < 2) return null;
    const head = grid[0].map(h => clean(h) ? named(m, h) : null);
    if (head.some(Boolean)) return head;
    const words = grid[0].every(h => !clean(h) || Tree.classify(h) === 'text');
    const over = grid[0].some((h, j) => clean(h) && grid.slice(1).some(r => clean(r[j] ?? '') && Tree.classify(r[j]) !== 'text'));
    return words && over ? head : null;
  }
  // The columns a pasted row is found by: an object's Name (or its Short Name), a relation's sides.
  const keysOf = (m, head) => m.isKind
    ? [head.find(c => c?.path?.length === 1 && same(c.title, 'Name')) ?? head.find(c => c?.path?.length === 1 && same(c.title, 'Short Name'))].filter(Boolean)
    : m.cols.filter(c => c.type === 'edge');

  // Headings nothing matches, asked about in one dialog: each a column of the table, a new one, or left out.
  // Resolves to every heading's column, or null if cancelled.
  function ask(m, grid, head) {
    const asked = grid[0].map((h, j) => !head[j] && clean(h) ? j : -1).filter(j => j >= 0);
    const cols = m.cols.filter(c => c.key !== '$entry' && c.key !== '$of');
    const label = c => c.parent ? `${c.parent} › ${c.title}` : c.title;
    const choice = asked.map(() => '');
    // Where one heading is left and one column a row is found by, it's that one.
    const open = keysOf(m, cols).filter(k => !head.includes(k));
    if (asked.length === 1 && open.length === 1) choice[0] = open[0].key;
    function Match() {
      const [, redraw] = preactHooks.useState(0);
      const taken = new Set([...head.filter(Boolean).map(c => c.key), ...choice.filter(k => k && k !== 'new')]);
      return html`<div class="match">${asked.map((j, i) => html`<label class="match-row">
        <span class="h"><b>${clean(grid[0][j])}</b><span class="muted">${clean(grid[1]?.[j] ?? '')}</span></span>
        <select value=${choice[i]} onChange=${e => { choice[i] = e.target.value; redraw(n => n + 1); }}>
          <option value="">Leave out</option>
          ${cols.map(c => html`<option value=${c.key} disabled=${taken.has(c.key) && choice[i] !== c.key}>${label(c)}</option>`)}
          <option value="new">New column</option>
        </select></label>`)}</div>`;
    }
    return Shell.dialog({ title: 'Match columns', width: 440, body: html`<${Match} />`, actions: [{ label: 'Cancel', value: false }, { label: 'OK', value: true, primary: true }] })
      .then(ok => !ok ? null : head.map((c, j) => {
        const k = c ? null : choice[asked.indexOf(j)];
        return c ?? (k === 'new' ? newColumn(clean(grid[0][j]), grid.slice(1).map(r => r[j] ?? '')) : cols.find(x => x.key === k) ?? null);
      }));
  }
  // A heading the table hasn't got is a new entry, of the datatype its values read as.
  function newColumn(title, vals) {
    vals = vals.map(clean).filter(Boolean);
    const type = vals.length && vals.every(v => YES.test(v) || NO.test(v)) ? 'tag' : [...new Set(vals.map(Tree.classify))].length === 1 ? Tree.classify(vals[0]) : 'text';
    return { key: 'new:' + norm(title), title, path: [title], type, options: [] };
  }

  // A plan: [{ row: id or null, key: [names], cells: [[column, raw]] }], with the columns rows are found by.
  // By name: each pasted row (under its headings) is the table's row whose names it gives, as written, or else the one
  // alone they name as people write them (loose), a name pointed at a record (`as`, by its loose reading) naming that;
  // or a new one.
  function byName(m, grid, head, as = new Map()) {
    const st = App.state.peek(), N = App.notes.peek(), keys = keysOf(m, head);
    const missing = m.isKind ? (keys.length ? null : 'Name') : keys.find(k => !head.includes(k))?.title;
    if (missing) return `Couldn’t paste: no ${missing} column`;
    const objectAt = (d, k) => k.type === 'edge' ? Tree.objectOf(st, st[d.id].args.find(a => same(a.edge, k.edge))?.at) : d.id;
    const names = (d, k, read) => { const o = objectAt(d, k); return o ? [N.nameOf(st, o), N.shortOf(st, o)].map(read) : []; };
    const is = (d, k, name, read) => as.has(loose(name)) ? objectAt(d, k) === as.get(loose(name)) : names(d, k, read).includes(read(name));
    const rowFor = key => {
      const by = read => m.data.filter(d => keys.every((k, i) => is(d, k, key[i], read)));
      const exact = by(norm), alike = exact.length ? exact : by(loose);
      return exact[0]?.id ?? (alike.length === 1 ? alike[0].id : null);
    };
    const plan = grid.slice(1).map(r => {
      const key = keys.map(k => clean(r[head.indexOf(k)] ?? ''));
      return { row: rowFor(key), key, cells: head.map((c, j) => c && !keys.includes(c) && [c, r[j] ?? '']).filter(Boolean) };
    });
    return { keys, plan };
  }
  // By place: the cells fill the grid from the active cell; past the last row, a name makes a new one. Rows
  // that give the names a row is found by (a Name, a relation's sides) and more find it by them instead.
  function byPlace(m, grid) {
    const active = table.modules.selectRange?.getActiveCell()?.getComponent(), shown = table.getColumns().filter(c => c.getField());
    const c0 = active ? Math.max(0, shown.findIndex(c => c.getField() === active.getField())) : 0;
    const head = grid[0].map((_, j) => shown[c0 + j] ? m.byField.get(shown[c0 + j].getField()) : null), ks = keysOf(m, head);
    if (!m.isDatatype && ks.length && ks.every(k => head.includes(k)) && head.some(c => c && !ks.includes(c))) return byName(m, [head, ...grid], head);
    const keys = keysOf(m, m.cols), rows = table.getRows('active').map(r => r.getData().id);
    const r0 = active ? Math.max(0, rows.indexOf(active.getRow().getData().id)) : rows.length;
    const plan = grid.map((r, i) => {
      const cells = r.map((raw, j) => head[j] && [head[j], raw]).filter(Boolean);
      const row = rows[r0 + i] ?? null, name = m.isKind && cells.find(([c]) => keys.includes(c));
      return row ? { row, key: [], cells } : name ? { row: null, key: [clean(name[1])], cells: cells.filter(([c]) => !keys.includes(c)) } : { row: null, key: [], cells };
    });
    return { keys, plan };
  }

  // The change a plan makes, as FormulaBar.preview takes one, its new records under new ids; with what it does. `made`,
  // each object it adds, named: { kind, name, kinds (those it could be instead), near (one it's close to), row (a row
  // of a kind's table) }. A name pointed at a record (`as`) is that record.
  function changeOf(m, { keys, plan }, as = new Map()) {
    const st = App.state.peek(), entered = App.entered.peek(), records = {}, made = new Map(), kids = new Map();
    const x = { records, values: 0, rows: [], made: [], skipped: 0, cols: new Set() };
    const put = (rec, id = Log.newId()) => { records[id] = rec; return id; };
    const make = (name, kind, kinds, row = false) => {
      const o = put({ kind });
      put({ at: o, edge: 'Name', field: 'text', value: name });
      made.set(loose(name), o);
      x.made.push({ kind, name, kinds, near: near(st, name, kinds), row });
      return o;
    };
    const childAt = (at, edge) => kids.get(`${at}|${norm(edge)}`) ?? entryAt(st, at, edge);
    // A side named in the paste: an object of the kinds that side can be, or a new one of the commonest.
    const sideAt = (edge, name) => {
      const kinds = sideKinds(m, edge), o = as.get(loose(name)) ?? find(st, name, kinds) ?? made.get(loose(name)) ?? make(name, kindAt(m, edge), kinds);
      return follow(st, o, sideLoc(m, edge));
    };
    for (const p of plan) {
      let row = p.row ?? (m.isKind && p.key[0] && as.get(loose(p.key[0]))) ?? null;
      const was = !!row;
      if (!row) {
        if (!p.key.length || p.key.some(k => !k)) { x.skipped += p.cells.filter(([, raw]) => clean(raw)).length; continue; }
        if (m.isKind) {
          row = made.get(loose(p.key[0]));
          if (!row) { row = make(p.key[0], m.rows.kind, new Set([norm(m.rows.kind)]), true); x.rows.push(row); }
        } else {
          const args = keys.map((k, i) => ({ edge: k.edge, at: sideAt(k.edge, p.key[i]) }));
          if (args.some(a => !a.at)) { x.skipped += p.cells.length; continue; }
          const own = p.cells.find(([c]) => c.key === '$out');
          row = put({ args, ...(own ? value(own[0].type, clean(own[1])) ?? { tag: true } : { tag: true }) });
          x.rows.push(row);
        }
      }
      for (const [c, raw] of p.cells) {
        if (!clean(raw) || (!was && c.key === '$out')) continue;
        if (c.key === '$entry' || c.key === '$of' || c.type === 'edge') { x.skipped++; continue; }
        const path = c.key === '$value' || c.key === '$out' ? null : c.path;
        let at = c.up ? st[row]?.at : row;
        if (path) for (const e of path.slice(0, -1)) at = at && childAt(at, e);
        const id = path ? at && childAt(at, path.at(-1)) : row, r = id && (records[id] ?? st[id]);
        const out = at && value(typeIn(c, r), clean(raw));
        if (!out) { x.skipped++; continue; }
        if (r && JSON.stringify(valueOf(out)) === JSON.stringify(valueOf(r))) continue;
        if (r && id in entered) records[id] = { ...entered[id], ...out };
        else if (records[id]) records[id] = { ...records[id], ...out };
        else if (path) kids.set(`${at}|${norm(path.at(-1))}`, put({ at, edge: path.at(-1), ...out }));
        else { x.skipped++; continue; }
        // A value is counted where it changes a row that was there; one in a row it adds is that row's.
        if (was) x.values++;
        x.cols.add(c.key);
      }
    }
    return x;
  }
  // The kind most of a relation's sides are, for a new object on that side.
  function kindAt(m, edge) {
    const st = App.state.value, n = new Map();
    for (const d of m.data) { const a = st[d.id].args.find(x => same(x.edge, edge)), k = a && st[Tree.objectOf(st, a.at)]?.kind; if (k) n.set(k, (n.get(k) ?? 0) + 1); }
    return [...n].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Entity';
  }

  // ---- A paste or a deletion: a change pending (App.stage), redlined in the grid, with the window's bar saying what
  // it does; Enter makes it, Esc doesn't. A paste that adds a row asking its day (App.asksDay), an ownership say, asks
  // it there, from the day shown or all along (App.From), and the paste is made from that day, the values it sets
  // with it, as a closing's schedule is; a deletion asks until when, as App.deleting does. Until what's typed there is
  // a day, it isn't made. Each name it adds is a choice in the bar, of a record the chart has instead, the closest first;
  // one close to a name the chart has asks "or" that one, taken by a click. Taken, the paste is pending again as it then
  // is, from the day it was asked from ----
  function stage(m, planOf, file = null, as = new Map()) {
    const r = planOf(as);
    if (typeof r === 'string') return Shell.toast(r);
    const x = changeOf(m, r, as), st = App.state.peek(), N = App.notes.peek();
    // Pointed at what the chart has, a paste that then changes nothing is done with.
    if (!Object.keys(x.records).length) {
      if (as.size && App.pending.peek()?.source === 'paste ' + m.view) App.discard();
      return Shell.toast(x.skipped ? `Left out ${count(x.skipped, 'value')}` : `Nothing new to ${file ? `import from ${file}` : 'paste'}`);
    }
    const made = x.made.filter(o => !o.row).map(o => o.name), noun = m.noun, source = 'paste ' + m.view, was = App.pending.peek();
    const added = [x.rows.length && count(x.rows.length, noun), ...(made.length > 3 ? [...made.slice(0, 2), `${made.length - 2} more`] : made)].filter(Boolean);
    const say = [x.values && `${file ? 'Imported' : 'Pasted'} ${count(x.values, 'value')}`, added.length && `added ${list(added)}`, x.skipped && `${count(x.skipped, 'value')} left out`]
      .filter(Boolean).join(', ').replace(/^a/, 'A').replace(/^Added/, file ? 'Imported' : 'Added') + (file ? ` from ${file}` : '');
    const shownCols = new Set(m.cols.filter(drawn).map(c => c.key));
    // What it does, in the redline's ink, as the bar says it; what's left out, which it doesn't do, plain. The names it
    // adds, each a choice: those close to one the chart has, every one, asking; then the rest, three in all.
    const ink = t => html`<span class="add">${t}</span>`, take = (o, id) => stage(m, planOf, file, new Map([...as, [loose(o.name), id]]));
    const choose = (anchor, o) => Shell.menu(anchor, q => {
      const t = norm(q), l = loose(q), hit = rivals(st, o.name, o.kinds).filter(y => !q || norm(y.name).includes(t) || norm(y.short).includes(t) || loose(y.name).includes(l));
      return [...hit.slice(0, 60).map(y => ({ label: y.name, run: () => take(o, y.id) })), ...(hit.length ? ['-'] : []), { label: `New ${o.kind} ${o.name}`, checked: true, run: () => {} }];
    }, { search: true, placement: 'top-start' });
    const named = o => html`<span class="named"><button type="button" class="add dd" aria-haspopup="menu" onClick=${e => choose(e.currentTarget, o)}>new ${o.kind} ${o.name}</button>${o.near
      ? html`<span class="or">, or <button type="button" class="lk" onClick=${() => take(o, o.near)}>${N.nameOf(st, o.near)}</button>?</span>` : null}</span>`;
    const asked = x.made.filter(o => o.near), plain = x.made.filter(o => !o.near && !o.row), listed = [...asked, ...plain.slice(0, Math.max(0, 3 - asked.length))];
    const more = asked.length + plain.length - listed.length;
    const parts = [x.values && ink(count(x.values, 'value')), x.rows.length && ink(`${x.rows.length} new ${x.rows.length === 1 ? noun : plural(noun)}`),
      ...listed.map(named), more && ink(`${more} more`), x.skipped && `${count(x.skipped, 'value')} left out`].filter(Boolean);
    const recs = { ...st, ...x.records }, asks = x.rows.some(id => App.asksDay(x.records[id], recs)), entered = App.entered.peek();
    // What it's at: the records it writes over, and those it adds at.
    const needs = [...new Set(Object.entries(x.records).flatMap(([id, r]) => [id, ...Tree.argsOf(r).map(a => a.at)]))].filter(id => id in entered);
    App.stage({ verb: file ? 'Import' : 'Paste', what: list(added.length ? added : [count(x.values, 'value')]), parts, source, say, needs, cols: new Set([...x.cols].filter(k => !shownCols.has(k))),
      ...(asks && { asks: 'from', day: as.size && was?.source === source && was.asks ? was.day : App.day.peek() }), make: tx => fill(tx, x.records), done: () => { if (x.rows.length === 1) Shell.select(x.rows); } });
    back();
  }
  // Rows deleted, as one change pending: the records entered there, and what's at them, each ended as App.deleting says.
  function deletion(ids) {
    const st = App.state.peek(), N = App.notes.peek();
    // A relation by its name and its sides, as the chart and History say it.
    const what = ids.length > 1 || current.isDatatype ? count(ids.length, current.noun) : current.isKind ? N.nameOf(st, ids[0]) : `${N.nameOf(st, ids[0])}: ${Time.whose(st, ids[0], N)}`;
    return { change: { records: Object.fromEntries(ids.map(id => [id, null])) }, stage: () => { App.deleting(ids, what, { source: 'rows ' + current.view }); back(); } };
  }
  // The rows a range takes whole, as the row numbers select them, that were entered and so can be deleted.
  function wholeRows() {
    const n = table.getColumns().filter(c => c.getField()).length, entered = App.entered.peek();
    return [...new Set(table.getRanges().filter(r => r.getColumns().filter(c => c.getField()).length === n).flatMap(r => r.getRows().map(x => x.getData().id)))].filter(id => id in entered);
  }

  // ---- Columns: Show/Hide and Order are the column's own notes in the view ----
  const note = (tx, label, c, view, value) => tx.note(label, c.pattern, value, { view, param: c.param });
  const called = c => c.parent ? `${c.parent} › ${c.title}` : c.title;
  const canWrite = () => !App.readOnly.peek() && !current?.red;
  const show = (c, on) => edit(tx => note(tx, 'Shown', c, current.view, on), ch => Time.describe(ch));
  // The columns in this order, as Order notes in the view, as one change: those given, then the rest as they were;
  // `also`, what else the change does (a column inserted shows); `moved`, the column a gesture moved, which the grid
  // then shows where it went (arrive). It says what it did as History says it.
  function place(order, say = ch => Time.describe(ch), also, moved = null) {
    const m = current, rest = m.cols.filter(c => c.pattern && !order.includes(c));
    moving = moved && field(moved);
    const ok = edit(tx => { [...order, ...rest].filter(c => c.pattern).forEach((c, i) => note(tx, 'Order', c, m.view, i + 1)); also?.(tx); }, say);
    if (!ok) moving = null;
    return ok;
  }
  // As the grid has them, its columns moved by Tabulator (moveColumn); not while the grid is being put in the model's order.
  let arranging = false;
  function placeColumns() {
    if (arranging) return;
    const m = current;
    place(table.getColumns().map(c => m.byField.get(c.getField())).filter(Boolean));
  }
  // A column moved in the model, moved in the grid rather than the grid built again: where the columns kept in view are
  // as they were. False where it can't be. The grid stays where it was scrolled, rather than snapping to the column it
  // had stopped at wherever that's gone (so a column dropped beside those kept in view would go under them), and what
  // moved comes into view where it went (arrive).
  function arrange(m) {
    const want = m.cols.filter(drawn).map(field), now = () => table.getColumns().map(c => c.getField()).filter(Boolean);
    if (now().join('\n') === want.join('\n')) return true;
    const n = Math.max(1, frozenOf(lookOf(m.view)));
    if (now().length !== want.length || now().slice(0, n).join('\n') !== want.slice(0, n).join('\n')) return false;
    const h = holder(), left = h.scrollLeft, was = now();
    h.style.scrollSnapType = 'none';
    // A column selected whole stays selected, where it's gone (Tabulator would leave one of its cells selected). Tabulator
    // moves the selection with a column, and can't where there's none, so one is lent it for the move.
    const sr = table.modules.selectRange, r = table.getRanges()[0], rows = table.getRows('active'), first = table.getColumns().find(c => c.getField());
    const whole = r && rows.length > 1 && r.getRows().length === rows.length && r.getColumns().filter(c => c.getField()), lent = !sr.activeRange;
    if (lent && !rows.length) return false;
    // Moved as Tabulator moves a column (moveColumn), its heading and its cells, but for laying every drawn row out again,
    // each measured in turn, where nothing in a row but its cells' order changes: each drawn row's cells are put in it in
    // their new order.
    const cm = table.columnManager, move = (f, at) => {
      const a = cm.findColumn(f), b = cm.findColumn(at);
      b.element.parentNode.insertBefore(a.element, b.element);
      cm.moveColumnActual(a, b, false);
      cm.verticalAlignHeaders();
    };
    arranging = true;
    try {
      if (lent) hold(rows[0].getCell(first));
      want.forEach((f, i) => { const at = now()[i]; if (at !== f) move(f, at); });
      for (const row of table.rowManager.rows) if (row.initialized && row.element && row.cells?.length) row.element.append(...row.cells.map(c => c.getElement()));
      sr.layoutElement();
      if (whole?.length) { const cs = table.getColumns().filter(c => whole.includes(c)); hold(rows[0].getCell(cs[0]), rows.at(-1).getCell(cs.at(-1))); }
      if (lent) unhold();
    } finally { arranging = false; }
    pinned(table);
    h.scrollLeft = left;
    h.style.scrollSnapType = '';
    arrive(movedIn(was, want));
    return true;
  }
  // ---- A column come into the grid (shown, inserted, pasted into) or moved in it comes whole into view, and lights for a
  // moment, as the cells a change makes do ----
  let moving = null;   // the column a gesture moved, by its field (place)
  // The columns an order moved, of those it had: the one a gesture moved; else those off the longest run kept in order.
  function movedIn(was, now) {
    const hint = moving;
    moving = null;
    if (hint && now.includes(hint) && was.includes(hint)) return [hint];
    const L = was.map(() => new Array(now.length + 1).fill(0));
    L.push(new Array(now.length + 1).fill(0));
    for (let i = was.length - 1; i >= 0; i--) for (let j = now.length - 1; j >= 0; j--) L[i][j] = was[i] === now[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    const kept = new Set();
    for (let i = 0, j = 0; i < was.length && j < now.length;) {
      if (was[i] === now[j]) { kept.add(was[i]); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++;
    }
    return now.filter(f => was.includes(f) && !kept.has(f));
  }
  // The first that scrolls brought into view (but a check's, which comes as a row fails it, not as it's asked for), each
  // lit; not a sweeping change's.
  function arrive(fields) {
    if (!fields.length || fields.length > 4 || !table) return;
    const cols = fields.map(f => table.getColumns().find(c => c.getField() === f)).filter(Boolean);
    into(cols.find(c => !current?.byField.get(c.getField())?.check && !PIN.test(c.getDefinition().cssClass)));
    for (const col of cols) for (const e of [col.getElement(), ...cells.querySelectorAll(`.tabulator-row .tabulator-cell[tabulator-field="${CSS.escape(col.getField())}"]`)]) {
      if (!e?.isConnected) continue;
      e.classList.remove('come');
      void e.offsetWidth;   // so the light starts again
      e.classList.add('come');
      e.addEventListener('animationend', () => e.classList.remove('come'), { once: true });
    }
  }
  // A column brought whole into view, clear of the columns kept in view, the grid stopping at a column's edge as it does
  // when it's scrolled (table.css): at its own edge, where it's past the left or wider than the room; past the right, at
  // the first edge that shows it.
  function into(col) {
    const h = holder(), e = col?.getElement();
    if (!h || !e?.isConnected || PIN.test(col.getDefinition().cssClass)) return;
    const at = 48 + frozenWidth(table), left = e.offsetLeft - at, need = e.offsetLeft + e.offsetWidth - h.clientWidth;
    if (h.scrollLeft > left || need > left) h.scrollLeft = left;
    else if (h.scrollLeft < need) h.scrollLeft = table.getColumns().filter(c => c.getField() && c.isVisible() && !PIN.test(c.getDefinition().cssClass))
      .map(c => c.getElement().offsetLeft - at).find(x => x >= need) ?? h.scrollWidth;
  }

  // The patterned columns the grid draws, in its order: those a drag or a menu moves among.
  const movable = () => table.getColumns().map(c => current.byField.get(c.getField())).filter(c => c?.pattern);
  function shift(c, d) {
    const order = movable(), i = order.indexOf(c);
    if (i < 0 || !order[i + d]) return;
    order.splice(i + d, 0, order.splice(i, 1)[0]);
    place(order, undefined, undefined, c);
  }
  // A column named as it's typed, before the column `before` (or last), as one change: shown in the view at its
  // pattern, below the rows, whether or not any record has it yet; one the table has already is shown, there.
  function addColumn(name, before = null) {
    const m = current, s = clean(name);
    if (!s || !m?.base || !canWrite()) return false;
    const had = m.cols.find(c => c.path?.length === 1 && c.key === norm(s));
    const it = had ?? { pattern: below(m.base, [s]), title: s };
    const order = movable().filter(c => c !== had), at = before ? order.indexOf(before) : -1;
    order.splice(at < 0 ? order.length : at, 0, it);
    return place(order, had ? `Showed ${had.title}` : `Added column ${s}`, tx => tx.note('Shown', it.pattern, true, { view: m.view }));
  }
  // A column with no values yet goes with its notes.
  const dropColumn = c => edit(tx => { note(tx, 'Shown', c, current.view, undefined); note(tx, 'Order', c, current.view, undefined); }, `Deleted column ${c.title}`);
  // An entry's column can be renamed; not a relation's side, nor a row's Name, by which everything names it.
  const renamable = c => !!c?.pattern && c.type !== 'edge' && !(c.path?.length === 1 && same(c.title, 'Name'));
  // Renamed, an entry is renamed wherever it's at a row of this kind: its records, its specification, its notes.
  // How it's looked at goes with it: its width, its sort, its filter, its grouping.
  function renameColumn(c, to) {
    if (!to || to === c.title || !edit(tx => tx.rename(c.pattern, c.title, to), `Renamed ${c.title} to ${to}`)) return;
    const was = c.key, now = [...c.path.slice(0, -1), to].map(norm).join('›'), l = lookOf(current.view), move = o => o && was in o ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k === was ? now : k, v])) : o;
    setLook(current.view, { widths: move(l.widths), filters: move(l.filters), sort: l.sort?.key === was ? { ...l.sort, key: now } : l.sort, group: l.group === was ? now : l.group });
  }
  const columnItems = m => m.cols.filter(c => c.pattern).map(c => ({ label: called(c), checked: c.shown, run: () => show(c, !c.shown) }));

  // ---- How it's looked at: sorted, filtered, grouped, kept in view, sized ----
  // Sorted by a column, which the heading's arrow shows and flips; kept as Tabulator sorts (dataSorted).
  function sortBy(c, dir) { if (!table) return; if (c) table.setSort(field(c), dir); else table.clearSort(); }
  function keepSort(sorters) {
    const m = current, s = sorters[0], c = s && m?.byField.get(s.field), was = lookOf(m.view).sort;
    const now = c ? { key: c.key, dir: s.dir } : null;
    if (JSON.stringify(was ?? null) === JSON.stringify(now)) return;
    setLook(m.view, { sort: now });
    funnels();
    if (!was !== !now || was?.key !== now?.key) setTimeout(relayout);
  }
  // A filter keeps the rows whose value in each filtered column is one of those chosen (null, Blank).
  function filterOf(m, l = lookOf(m.view)) {
    const fs = Object.entries(l.filters ?? {}).filter(([k]) => m.cols.some(c => c.key === k)).map(([k, vs]) => ['f:' + k, new Set(vs.map(v => JSON.stringify(v)))]);
    return fs.length ? d => fs.every(([f, ok]) => ok.has(JSON.stringify(blank(d[f]) ? null : d[f]))) : null;
  }
  function filterBy(c, values) {
    const m = current, fs = { ...lookOf(m.view).filters };
    if (values) fs[c.key] = values; else delete fs[c.key];
    setLook(m.view, { filters: fs });
    refilter();
  }
  const clearFilters = () => { setLook(current.view, { filters: null }); refilter(); };
  function refilter() {
    if (!table || !ready) return;
    const p = filterOf(current);
    if (p) table.setFilter(p); else table.clearFilter();
    funnels();
    relayout();
  }
  // A heading's arrow or funnel coming or going, its column is fitted again, so its name stays whole.
  const relayout = () => { if (table && ready) { laid.delete(table); settle(); } };
  // A filtered column's heading shows its funnel, and a sorted one's its arrow, each with room for it.
  function funnels() {
    const l = lookOf(current.view), fs = l.filters ?? {};
    for (const col of table.getColumns()) {
      const c = current.byField.get(col.getField()), e = col.getElement();
      e.classList.toggle('filtered', !!c && c.key in fs);
      e.classList.toggle('sorted', !!c && l.sort?.key === c.key);
    }
  }
  const group = c => { setLook(current.view, { group: c?.key }); rebuild(); };
  const freeze = n => { setLook(current.view, { frozen: n === 1 ? undefined : n }); rebuild(); };
  function keepWidth(col) {
    const m = current, c = m?.byField.get(col.getField());
    if (c) setLook(m.view, { widths: { ...lookOf(m.view).widths, [c.key]: Math.round(col.getWidth()) } });
  }
  // As wide as what it holds, every row's, or its heading; as a double-click on its edge does.
  function fit(col) {
    const c = col._column;
    let w;
    if (TAG.test(c.definition.cssClass)) w = twoLines(c);
    else { c.reinitializeWidth(true); w = Math.max(c.getWidth(), widest(c)); }
    sized.delete(c);
    col.setWidth(w);
    keepWidth(col);
    pinned(table);
  }

  // ---- A column's menu: the chevron on its heading, a right-click on it, or Alt+Down ----
  function columnMenu(at, col) {
    const m = current, c = m?.byField.get(col.getField());
    if (!c) return;
    const l = lookOf(m.view), [up, down] = sortWords(c), sorted = l.sort?.key === c.key, filtered = !!l.filters?.[c.key];
    const shown = table.getColumns().filter(x => x.getField()), i = shown.indexOf(col), frozen = Math.min(frozenOf(l), shown.length);
    const order = movable(), k = order.indexOf(c), writes = canWrite() && !!c.pattern;
    col.getElement().classList.add('open');
    return Shell.menu(at, [
      { label: `Sort ${up}`, run: () => sortBy(c, 'asc') },
      { label: `Sort ${down}`, run: () => sortBy(c, 'desc') },
      ...(sorted ? [{ label: 'Clear sort', run: () => sortBy(null) }] : []),
      { label: 'Filter…', run: () => filterPop(c) },
      ...(filtered ? [{ label: 'Clear filter', run: () => filterBy(c, null) }] : []),
      '-',
      ...(m.base && canWrite() ? [{ label: 'Insert column left', run: () => insert(col, false) }, { label: 'Insert column right', run: () => insert(col, true) }] : []),
      ...(writes && renamable(c) ? [{ label: 'Rename column', run: () => rename(col) }] : []),
      ...(writes ? [{ label: 'Hide column', run: () => show(c, false) },
        { label: 'Move left', disabled: k <= 0, run: () => shift(c, -1) }, { label: 'Move right', disabled: k < 0 || k === order.length - 1, run: () => shift(c, 1) }] : []),
      ...(writes && c.fresh ? [{ label: 'Delete column', danger: true, run: () => dropColumn(c) }] : []),
      '-',
      i === frozen - 1 ? { label: 'Unfreeze columns', run: () => freeze(0) } : { label: 'Freeze up to here', run: () => freeze(i + 1) },
      { label: 'Fit width', run: () => fit(col) },
      ...(m.rows === 'date' ? [] : [l.group === c.key ? { label: 'Ungroup', run: () => group(null) } : { label: 'Group by this column', run: () => group(c) }]),
      ...(c.pattern && canWrite() ? ['-', { label: 'Columns', items: columnItems(m) }] : []),
    ], { onClose: () => col.getElement().classList.remove('open') });
  }

  // ---- Headings: dragged to move at once, their menu, their funnel, a double-click to rename or, on the edge, to fit ----
  const colAt = el => { const e = el?.closest?.('.tabulator-col'); return e ? table?.getColumns().find(c => c.getField() && c.getElement() === e) ?? null : null; };
  function wireHeadings(t) {
    const head = t.columnManager.getElement();
    funnels();
    // The chevron, the funnel and a heading's name being typed are pressed without selecting the column.
    head.addEventListener('mousedown', e => { if (e.target.closest('.col-menu, .funnel, .col-name')) e.stopPropagation(); }, true);
    head.addEventListener('click', e => {
      const col = colAt(e.target), menu = e.target.closest('.col-menu'), funnel = e.target.closest('.funnel');
      if (!col || (!menu && !funnel)) return;
      e.stopPropagation();
      if (menu) columnMenu(menu, col); else filterPop(current.byField.get(col.getField()));
    }, true);
    head.addEventListener('dblclick', e => {
      const handle = e.target.closest('.tabulator-col-resize-handle'), col = colAt(handle ? handle.previousElementSibling : e.target);
      if (!col || e.target.closest('.col-menu, .funnel, .col-name, .tabulator-col-sorter')) return;
      e.stopPropagation(); e.preventDefault();
      if (handle) fit(col); else rename(col);
    }, true);
    head.addEventListener('pointerdown', e => dragHeading(e, t));
  }
  // A heading dragged moves its column at once, as Excel's selected column moves: a ghost of it follows the pointer, a
  // bar shows where it will drop, and dropped, it's placed there, as one change; Esc leaves it. A click selects the
  // column, and Shift-click widens the selection, as ever.
  function dragHeading(e, t) {
    if (e.button !== 0 || !ready || t !== table || !canWrite() || e.shiftKey || e.ctrlKey || e.metaKey) return;
    if (e.target.closest('.tabulator-col-resize-handle, .col-menu, .funnel, .col-name, .tabulator-col-sorter')) return;
    const col = colAt(e.target), c = col && current.byField.get(col.getField());
    if (!c?.pattern) return;
    const x0 = e.clientX, colEl = col.getElement(), box = colEl.getBoundingClientRect(), dx = x0 - box.left;
    let ghost = null, bar = null, to = -1, raf = 0, lastX = x0;
    // Where it can drop, as drawn: before each column, at its left edge, and after the last. A column kept in view is
    // where it's kept; one the grid has scrolled under them can't be dropped before, and the first that shows beside
    // them is dropped before at their edge. Each is where the rows are scrolled to, which the headings follow a frame later.
    const order = () => movable(), colOf = o => t.getColumns().find(x => x.getField() === field(o));
    const edges = () => {
      const os = order(), h = holder(), r = h.getBoundingClientRect(), stop = r.left + 48 + frozenWidth(t), x0 = r.left - h.scrollLeft;
      const at = (o, end) => {
        const col = colOf(o), e = col.getElement(), x = x0 + e.offsetLeft + (end ? e.offsetWidth : 0);
        return PIN.test(col.getDefinition().cssClass) ? e.getBoundingClientRect()[end ? 'right' : 'left'] : end ? Math.max(x, stop) : x + e.offsetWidth <= stop + 1 ? null : Math.max(x, stop);
      };
      return [...os.map(o => at(o)), at(os.at(-1), true)];
    };
    const place0 = x => {
      ghost.style.left = `${x - dx}px`;
      const es = edges(), from = order().indexOf(c);
      to = es.reduce((best, ex, i) => ex !== null && (best < 0 || Math.abs(ex - x) < Math.abs(es[best] - x)) ? i : best, -1);
      const still = to === from || to === from + 1, r = cells.getBoundingClientRect();
      bar.hidden = still;
      bar.style.left = `${Math.round(es[to] - r.left - 1)}px`;
      bar.style.height = `${Math.round(Math.min(t.rowManager.tableElement.getBoundingClientRect().bottom, t.rowManager.element.getBoundingClientRect().bottom) - r.top)}px`;
    };
    // Near an edge of the grid, it scrolls across under the pointer.
    const roll = () => {
      raf = 0;
      if (!ghost) return;
      const h = holder(), r = h.getBoundingClientRect(), left = r.left + 48 + frozenWidth(t);
      const d = lastX > r.right - 40 ? 12 : lastX < left + 40 && h.scrollLeft > 0 ? -12 : 0;
      if (d) { h.scrollLeft += d; place0(lastX); raf = requestAnimationFrame(roll); }
    };
    const move = ev => {
      lastX = ev.clientX;
      if (!ghost) {
        if (Math.abs(ev.clientX - x0) < 6) return;
        t.modules.selectRange.mousedown = false;   // it moves the column; it doesn't widen the selection
        ghost = Object.assign(document.createElement('div'), { className: 'col-ghost', textContent: headed(c) });
        Object.assign(ghost.style, { top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` });
        bar = Object.assign(document.createElement('div'), { className: 'col-drop' });
        document.body.append(ghost); cells.append(bar);
        colEl.classList.add('moving');
        holder().style.scrollSnapType = 'none';   // it rolls smoothly as it's dragged, and stops at a column's edge once dropped
      }
      place0(ev.clientX);
      if (!raf) raf = requestAnimationFrame(roll);
    };
    const end = drop => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('keydown', esc, true);
      cancelAnimationFrame(raf);
      if (!ghost) return;
      ghost.remove(); bar.remove(); colEl.classList.remove('moving');
      holder().style.scrollSnapType = '';
      // Dropped where it's no longer drawn (another view shown meanwhile), it isn't dropped.
      if (!el?.offsetParent || t !== table) return;
      const os = order(), from = os.indexOf(c);
      if (drop && to >= 0 && to !== from && to !== from + 1) { os.splice(to > from ? to - 1 : to, 0, os.splice(from, 1)[0]); place(os, undefined, undefined, c); }
    };
    const up = () => end(true), esc = ev => { if (ev.key === 'Escape' && ghost) { ev.preventDefault(); ev.stopPropagation(); end(false); } };
    addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('keydown', esc, true);
  }
  // A heading named in place: a field over its name, Enter or leaving keeping what's typed, Esc putting it back.
  function nameIn(colEl, value, done) {
    const input = Object.assign(document.createElement('input'), { className: 'col-name', value, spellcheck: false });
    input.setAttribute('aria-label', 'Column name');
    colEl.querySelector('.tabulator-col-content').append(input);
    input.focus(); input.select();
    let over = false;
    const end = keep => { if (over) return; over = true; const s = clean(input.value); input.remove(); done(keep ? s : ''); back(); };
    input.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); end(true); } else if (e.key === 'Escape') { e.preventDefault(); end(false); }
    });
    input.addEventListener('blur', () => end(true));
    return input;
  }
  function rename(col) {
    const c = current.byField.get(col.getField());
    if (renamable(c) && canWrite()) nameIn(col.getElement(), c.title, s => renameColumn(c, s));
  }
  // Insert column: an empty column where it's asked for, its name typed in its heading; nothing's made until it's named.
  function insert(col, right) {
    const t = table, m = current, c = m.byField.get(col.getField());
    if (!m.base || !canWrite()) return;
    const after = movable(), before = right ? after[after.indexOf(c) + 1] ?? null : c, temp = 'f:\u0000new';
    t.addColumn({ title: '', field: temp, headerSort: false, resizable: false, width: 180, minWidth: 120, cssClass: 'c-new', formatter: () => '' }, !right, col.getField()).then(nc => {
      nc.scrollTo?.(undefined, false)?.catch?.(() => {});
      nameIn(nc.getElement(), '', s => { if (!(s && addColumn(s, before)) && t === table) t.deleteColumn(temp); });
    });
  }

  // ---- A column's filter, as Excel's: its values, of the rows the other filters leave, each a checkbox ----
  function filterPop(c, anchor) {
    const col = table?.getColumns().find(x => x.getField() === field(c));
    if (!col) return;
    if (!anchor) { col.getElement().scrollIntoView({ block: 'nearest', inline: 'nearest' }); anchor = col.getElement(); }
    const view = current.view;
    Shell.popover(anchor, close => html`<${Filter} c=${c} view=${view} close=${close} />`, { placement: 'bottom-start' });
  }
  function Filter({ c, view, close }) {
    looked.value;
    const [q, setQ] = useState('');
    const m = shownM.value;
    if (!m || m.view !== view) return null;
    const l = lookOf(view), f = field(c), on = l.filters?.[c.key] ?? null, rest = { ...l.filters };
    delete rest[c.key];
    const others = filterOf(m, { ...l, filters: rest });
    const counts = new Map();
    for (const r of m.data) if (r._red !== 'add' && (!others || others(r))) {
      const v = blank(r[f]) ? null : r[f], k = JSON.stringify(v);
      if (!counts.has(k)) counts.set(k, { v, k, n: 0, label: v === null ? 'Blank' : text(typeOf(c, r), v) });
      counts.get(k).n++;
    }
    for (const v of on ?? []) { const k = JSON.stringify(v); if (!counts.has(k)) counts.set(k, { v, k, n: 0, label: v === null ? 'Blank' : text(c.type, v) }); }
    const cmp = sorter(c), vals = [...counts.values()].sort((a, b) => cmp(a.v, b.v, null, null, null, 'asc'));
    const t = q.trim().toLowerCase(), list = t ? vals.filter(x => x.label.toLowerCase().includes(t)) : vals;
    const kept = new Set((on ?? vals.map(x => x.v)).map(v => JSON.stringify(v))), isOn = x => kept.has(x.k);
    // Every value kept is no filter at all.
    const set = ks => filterBy(c, vals.every(x => ks.has(x.k)) ? null : vals.filter(x => ks.has(x.k)).map(x => x.v));
    const toggle = x => { const ks = new Set(kept); if (ks.has(x.k)) ks.delete(x.k); else ks.add(x.k); set(ks); };
    const every = list.length > 0 && list.every(isOn), some = list.some(isOn);
    const flipAll = () => { const ks = new Set(kept); list.forEach(x => every ? ks.delete(x.k) : ks.add(x.k)); set(ks); };
    // Enter, with something typed, keeps just what it finds.
    const keys = e => { if (e.key === 'Enter' && t) { e.preventDefault(); filterBy(c, list.map(x => x.v)); close(); } };
    return html`<div class="tfilter">
      <input type="search" class="tf-find" placeholder="Find" aria-label="Find" value=${q} autofocus spellcheck=${false} onInput=${e => setQ(e.target.value)} onKeyDown=${keys} />
      <div class="tf-list" role="group" aria-label=${headed(c)}>
        ${list.length ? html`<label class="tf-row all"><input type="checkbox" ref=${x => { if (x) x.indeterminate = some && !every; }} checked=${every} onChange=${flipAll} /><span class="v">Select all</span></label>` : html`<div class="tf-none">No match</div>`}
        ${list.map(x => html`<label class="tf-row" key=${x.k}><input type="checkbox" checked=${isOn(x)} onChange=${() => toggle(x)} /><span class=${'v' + (x.v === null ? ' muted' : '')}>${x.label}</span><span class="n">${x.n}</span></label>`)}
      </div>
      <div class="tf-foot"><button type="button" class="btn" disabled=${!on} onClick=${() => filterBy(c, null)}>Clear filter</button><button type="button" class="btn primary" onClick=${close}>Done</button></div>
    </div>`;
  }

  // ---- Above the grid: its columns, and how it's sorted, filtered and grouped, each saying so while it's on ----
  const shownM = Shell.signal(null);
  function Tools() {
    looked.value;
    const m = shownM.value, view = Shell.view.value;
    if (!m || m.view !== view) return null;
    const l = lookOf(view), by = k => m.cols.find(c => c.key === k);
    const sortC = l.sort && by(l.sort.key), groupC = l.group && m.named && by(l.group), fs = Object.keys(l.filters ?? {}).map(by).filter(Boolean);
    const total = m.data.filter(r => r._red !== 'add').length, showing = table && ready ? table.getRows('active').filter(r => r.getData()._red !== 'add').length : total;   // the rows as kept, not copies of them
    // The record selected (in Find, say) a row the filters leave out: it stays selected, and the bar says so.
    const sel = Shell.selection.value[0], passes = fs.length && filterOf(m, l), out = passes && m.data.find(r => r.id === sel && r._red !== 'add' && !passes(r));
    return html`<div class="tbar" role="toolbar" aria-label="Table">
      <button type="button" class="btn ghost dd" aria-haspopup="dialog" onClick=${e => Shell.popover(e.currentTarget, () => html`<${Columns} view=${view} />`, { placement: 'bottom-start' })}>Columns</button>
      <button type="button" class=${'btn ghost dd' + (sortC ? ' on' : '')} aria-haspopup="menu" onClick=${e => sortMenu(e.currentTarget)}>${sortC ? html`Sorted by ${headed(sortC)}` : 'Sort'}</button>
      <button type="button" class=${'btn ghost dd' + (fs.length ? ' on' : '')} aria-haspopup="menu" onClick=${e => filterMenu(e.currentTarget)}>${fs.length ? html`Filtered by ${list(fs.map(headed))}` : 'Filter'}</button>
      ${m.rows === 'date' ? null : html`<button type="button" class=${'btn ghost dd' + (groupC ? ' on' : '')} aria-haspopup="menu" onClick=${e => groupMenu(e.currentTarget)}>${groupC ? html`Grouped by ${headed(groupC)}` : 'Group'}</button>`}
      ${fs.length ? html`<button type="button" class="btn ghost" onClick=${clearFilters}>Clear filters</button>` : null}
      ${m.isDatatype ? null : html`<button type="button" class="btn ghost" disabled=${App.readOnly.value} onClick=${importFile}>Import…</button>`}
      ${out ? html`<span class="tout" role="status"><b>${rowName(sel)}</b> is filtered out<span class="sep">·</span><button type="button" class="lk" onClick=${() => { clearFilters(); setTimeout(() => track(sel)); }}>Clear filters</button></span>` : null}
      <span class="tcount">${showing !== total ? `${showing} of ${count(total, m.noun)}` : count(total, m.noun)}</span>
    </div>`;
  }
  // A row's record by name, short as a list of dates says it (Time.whose): an object by its short name, a relation by its
  // sides as the chart joins them.
  const rowName = id => Time.whose(App.state.peek(), id, App.notes.peek());
  function sortMenu(anchor) {
    const m = current, l = lookOf(m.view), sc = l.sort && m.cols.find(c => c.key === l.sort.key);
    Shell.menu(anchor, [
      ...(sc ? [{ seg: sortWords(sc).map((w, i) => ({ label: w, pressed: l.sort.dir === (i ? 'desc' : 'asc'), run: () => { Shell.closeAll(); sortBy(sc, i ? 'desc' : 'asc'); } })) }, '-'] : []),
      ...m.cols.filter(drawn).map(c => ({ label: headed(c), checked: c === sc, run: () => sortBy(c, c === sc ? l.sort.dir : 'asc') })),
      ...(sc ? ['-', { label: 'Clear sort', run: () => sortBy(null) }] : []),
    ]);
  }
  function filterMenu(anchor) {
    const m = current, fs = lookOf(m.view).filters ?? {};
    Shell.menu(anchor, [...m.cols.filter(drawn).map(c => ({ label: headed(c), checked: c.key in fs, run: () => filterPop(c, anchor) })),
      ...(Object.keys(fs).length ? ['-', { label: 'Clear filters', run: clearFilters }] : [])]);
  }
  function groupMenu(anchor) {
    const m = current, g = lookOf(m.view).group;
    Shell.menu(anchor, [{ label: 'None', checked: !g, run: () => group(null) }, '-', ...m.cols.filter(drawn).map(c => ({ label: headed(c), checked: c.key === g, run: () => group(c) }))]);
  }
  // Every column, each a checkbox that shows or hides it, dragged by its row to reorder; and a new one, named as it's typed.
  const GRIP = Shell.iconMarkup('grip');
  function Columns({ view }) {
    looked.value;
    const ref = useRef(), [naming, setNaming] = useState(false), [found0, setQ] = useState(['', view]);
    const m = shownM.value, q = found0[1] === view ? found0[0] : '';   // what's typed is the view's: another table starts afresh
    if (!m || m.view !== view) return null;
    // Found as they're typed, as a long list's fields are; dragged among those found, each lands among them all.
    const t = q.trim().toLowerCase(), found = c => !t || called(c).toLowerCase().includes(t);
    const writes = canWrite(), mv = m.cols.filter(c => c.pattern), vis = mv.filter(found);
    const down = (e, c) => {
      if (!writes || e.target.closest('input, button')) return;
      Shell.drag(e, { item: e.currentTarget, items: [...ref.current.querySelectorAll('.colrow.mv')], onDrop: (from, i) => {
        const a = vis[from], rest = vis.filter(x => x !== a), o = mv.filter(x => x !== a), anchor = rest[i];
        o.splice(anchor ? o.indexOf(anchor) : rest.length ? o.indexOf(rest.at(-1)) + 1 : o.length, 0, a);
        place(o, undefined, undefined, a);
      } });
    };
    const add = e => { if (e.key === 'Enter') { e.preventDefault(); if (addColumn(e.target.value)) e.target.value = ''; } else if (e.key === 'Escape') { e.stopPropagation(); setNaming(false); } };
    return html`<div class="cols" ref=${ref}>
      <input type="search" class="col-find" placeholder="Find" aria-label="Find" value=${q} spellcheck=${false} onInput=${e => setQ([e.target.value, view])} />
      <div class="cols-list">
      ${m.cols.filter(found).map(c => c.pattern
        ? html`<div class="colrow mv" key=${c.key} onPointerDown=${e => down(e, c)}><span class="colgrip" aria-hidden="true" dangerouslySetInnerHTML=${{ __html: GRIP }} />
            <label><input type="checkbox" checked=${c.shown} disabled=${!writes} onChange=${() => show(c, !c.shown)} /><span>${called(c)}</span></label></div>`
        : html`<div class="colrow" key=${c.key}><span class="colgrip" /><label><input type="checkbox" checked disabled /><span>${called(c)}</span></label></div>`)}
      ${m.base && writes ? naming
        ? html`<div class="colrow new"><span class="colgrip" /><input class="col-new" placeholder="New column" aria-label="New column" spellcheck=${false} ref=${x => x && !x.dataset.on && (x.dataset.on = 1, x.focus())} onKeyDown=${add} onBlur=${e => { if (!clean(e.target.value)) setNaming(false); }} /></div>`
        : html`<button type="button" class="colrow new" onClick=${() => setNaming(true)}><span class="colgrip">${Shell.icon('plus')}</span><span>New column</span></button>` : null}
      </div>
    </div>`;
  }

  // ---- The new row, under the last: a name typed there makes a record of the table's kind, as one change; a relation's
  // asks its sides, each from the objects that side can be (or a new one, named), and waits on Enter as a relation added does ----
  function NewRow() {
    looked.value;
    const m = shownM.value;
    if (!m || m.isDatatype || m.red || App.readOnly.value) return null;
    const label = `New ${m.noun}`;
    if (m.isKind) return html`<div class="newrow"><span class="plus">${Shell.icon('plus')}</span>
      <input class="nr-name" placeholder=${label} aria-label=${label} spellcheck=${false} autocomplete="off" onKeyDown=${newName} /></div>`;
    // While its sides are picked, the row says those picked, and the side asked for next.
    const so = choosing.value;
    return html`<div class="newrow"><span class="plus">${Shell.icon('plus')}</span><button type="button" class=${'nr-go' + (so ? ' on' : '')} aria-haspopup="menu" onClick=${e => relate(e.currentTarget)}>${so
      ? html`${so.picked.map(n => html`<span class="nr-side">${n}</span><span class="nr-to">→</span>`)}<span class="nr-next">${so.next}</span>` : label}</button></div>`;
  }
  const choosing = Shell.signal(null);
  // Enter makes it and stays for the next; Tab makes it and goes on to its next cell; Esc leaves it.
  function newName(e) {
    const input = e.currentTarget, s = clean(input.value);
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); input.value = ''; focus(); return; }
    if ((e.key !== 'Enter' && e.key !== 'Tab') || !s) return;
    e.preventDefault();
    const m = current;
    let id = null;
    if (!App.change(tx => { id = tx.add('record', { kind: m.rows.kind }); tx.add('record', { at: id, edge: 'Name', field: 'text', value: s }); })) return;
    input.value = '';
    landed(id, () => {
      if (e.key !== 'Tab') return reveal(id);
      Shell.select([id]);
      // Once the inspector has come in beside it and the grid is laid out again for its room.
      const go = (tries = 30) => {
        if ((Shell.gliding.peek() || laid.get(table) !== widthOf(table)) && tries) return setTimeout(() => go(tries - 1), 30);
        const row = table.rowManager.findRow(id)?.getComponent(), col = table.getColumns().filter(c => c.getField())[1];
        if (row && col) { table.addRange(row.getCell(col), row.getCell(col)); focus(); across(); table.modules.selectRange.layoutElement(); }
      };
      go();
    });
  }
  // Once a record made is a row of the grid (or the grid's filters leave it out, which the toast says).
  function landed(id, then, tries = 40) {
    if (inGrid(id)) return then();
    if (table?.rowManager.findRow(id)) return Shell.toast(`Added ${App.notes.peek().nameOf(App.state.peek(), id)}, which a filter hides`, { undo: () => Shell.parts.peek().undo?.undo() });
    if (tries) setTimeout(() => landed(id, then, tries - 1), 25);
  }
  function relate(anchor) {
    const m = current, sides = m.cols.filter(c => c.type === 'edge'), picked = {}, st = App.state.peek(), N = App.notes.peek();
    const say = o => typeof o === 'string' ? N.nameOf(st, o) : clean(o.name);
    const next = i => {
      if (i === sides.length) return addRelation(m, sides, picked);
      choosing.value = { picked: sides.slice(0, i).map(c => say(picked[c.edge])), next: sides[i].title };
      pickSide(anchor, m, sides[i], o => { picked[sides[i].edge] = o; next(i + 1); });
    };
    next(0);
  }
  // One side, from the objects it can be, found as they're typed; or a new one of the kind most of its rows have.
  function pickSide(anchor, m, c, done) {
    const st = App.state.peek(), N = App.notes.peek(), kind = kindAt(m, c.edge);
    const all = [...sideKinds(m, c.edge)].flatMap(k => Tree.index(st).kinds.get(k) ?? []).map(id => ({ id, name: N.nameOf(st, id), short: N.shortOf(st, id) }))
      .sort((a, b) => a.name.localeCompare(b.name));
    Shell.menu(anchor, q => {
      // Found as typed, or as people write it ("Partners III LP"); a new one offered only where none reads alike.
      const t = norm(q), l = loose(q), hit = all.filter(x => !t || norm(x.name).includes(t) || norm(x.short).includes(t) || (l && loose(x.name).includes(l)));
      return [{ head: c.title }, ...hit.slice(0, 60).map(x => ({ label: x.name, run: () => done(x.id) })),
        ...(q && l && !all.some(x => loose(x.name) === l || loose(x.short) === l) ? [{ label: `New ${kind}: ${q}`, run: () => done({ name: q, kind }) }] : [])];
    }, { search: true, placement: 'top-start', onClose: () => { choosing.value = null; } });
  }
  function addRelation(m, sides, picked) {
    const st = App.state.peek(), N = App.notes.peek(), records = {}, made = [];
    const at = (c, o) => {
      if (typeof o !== 'string') { const id = Log.newId(); records[id] = { kind: o.kind }; records[Log.newId()] = { at: id, edge: 'Name', field: 'text', value: clean(o.name) }; made.push(id); o = id; }
      return follow({ ...st, ...records }, o, sideLoc(m, c.edge));
    };
    const args = sides.map(c => ({ edge: c.edge, at: at(c, picked[c.edge]) }));
    if (args.some(a => !a.at)) return Shell.toast(`Couldn’t add the ${m.noun}`);
    const rel = Log.newId();
    records[rel] = { args, tag: true };
    const recs = { ...st, ...records }, asks = App.asksDay(records[rel], recs), entered = App.entered.peek();
    App.stage({ verb: 'Add', what: `${N.nameOf(recs, rel)}: ${N.placed(recs, rel).map(s => s.join + s.text).join('')}`, source: 'row ' + m.view,
      ...(asks && { asks: 'from', day: App.day.peek(), auto: true }), needs: args.map(a => a.at).filter(id => id in entered),
      say: c => Time.describe(c), make: tx => fill(tx, records), done: () => landed(rel, () => Shell.select([rel])) });
  }
  // The new row's place: under the last row, or, where the rows run on past the grid's foot, there.
  let rowEl = null;
  function strip() {
    if (!rowEl || !el || !table || !ready || !el.classList.contains('adds')) return;
    const h = table.rowManager.element, tb = table.rowManager.tableElement;
    const y = Math.min(tb.getBoundingClientRect().bottom, h.getBoundingClientRect().bottom) - el.getBoundingClientRect().top;
    rowEl.style.top = `${Math.round(y)}px`;
    el.style.setProperty('--lead', `${table.getColumns().find(c => c.getField())?.getWidth() ?? 240}px`);
  }

  // ---- The cells selected, counted, summed and averaged in the status bar, as Excel's ----
  const stats = Shell.signal(null);
  function tally() {
    if (!table || !ready || !current) { stats.value = null; return; }
    const seen = new Set(), got = [];
    for (const r of table.getRanges()) for (const cell of r.getCells().flat()) {
      const k = cell.getRow().getData().id + '\n' + cell.getField();
      if (cell.getField() && !seen.has(k)) { seen.add(k); got.push(cell); }
    }
    if (got.length < 2) { stats.value = null; return; }
    let n = 0, nums = 0, sum = 0;
    const types = new Set();
    for (const cell of got) {
      const v = cell.getValue(), c = columnOf(cell), type = c && typeOf(c, cell.getRow().getData());
      if (blank(v)) continue;
      n++;
      if (typeof v === 'number' && NUMERIC.has(type)) { nums++; sum += v; types.add(type); }
    }
    // An average of percentages to two places of a percent, as a sum is to the places its values have.
    const type = types.size === 1 ? [...types][0] : 'number', say = v => Tree.format(type, +v.toPrecision(12));
    stats.value = !n ? null : { n, ...(nums && { sum: say(sum), avg: say(type === 'percent' ? +(sum / nums).toFixed(4) : sum / nums) }) };
  }
  function Stats() {
    const s = stats.value;
    if (!s || viewOf(Shell.view.value)?.layout !== 'table') return null;
    return html`<span class="tstats" role="status"><span>Count <b>${s.n}</b></span>${s.sum !== undefined ? html`<span>Sum <b>${s.sum}</b></span><span>Average <b>${s.avg}</b></span>` : null}</span>`;
  }
  Shell.register('status', { render: () => html`<${Stats} />` });

  // ---- Filling: Ctrl+D and Ctrl+R, and Ctrl+Enter, as Excel's, each one change ----
  const cellsOf = () => { const seen = new Set(); return table.getRanges().flatMap(r => r.getCells().flat()).filter(x => x.getField() && !seen.has(x) && seen.add(x)); };
  const rawOf = cell => typing(typeOf(columnOf(cell), cell.getRow().getData()), cell.getValue());
  const filled = n => `Filled ${count(n, 'cell')}`;
  // What's typed into every cell of the range it was typed in (`cs`, as it was before the typing began), that cell among
  // them; the range left selected, as Excel leaves it.
  function fillWith(cell, raw, cs) {
    cs = cs?.includes(cell) ? cs : [cell];
    const ws = cs.map(x => writing(x, raw)).filter(Boolean);
    write(ws, filled(ws.length));
    if (cs.length > 1) table.addRange(cs[0], cs.at(-1));
    back();
  }
  // Down: each column of the range takes its top cell's value, or, the range a row tall, the cell's above. Right: each
  // row takes its left cell's, or, a column wide, the cell's to its left.
  function fillFrom(down) {
    const rows = table.getRows('active'), cols = table.getColumns().filter(c => c.getField()), ws = [];
    for (const r of table.getRanges()) {
      const rs = r.getRows(), cs = r.getColumns().filter(c => c.getField()), along = down ? rs : cs, over = down ? cs : rs;
      const all = down ? rows : cols, first = along.length > 1 ? along[0] : all[all.indexOf(along[0]) - 1], to = along.length > 1 ? along.slice(1) : along;
      if (!first) continue;
      for (const x of over) {
        const cellAt = y => down ? y.getCell(x) : x.getCell(y), raw = rawOf(cellAt(first));
        for (const y of to) ws.push(writing(cellAt(y), raw));
      }
    }
    const done = ws.filter(Boolean);
    if (done.length) write(done, filled(done.length));
  }

  // ---- A cell's menu: what applies to the cells selected and their rows ----
  function rowMenu(e, row) {
    const cell = row.getCells().find(x => x.getElement().contains(e.target) && x.getField()), c = cell && columnOf(cell);
    const ids = [...new Set([row.getData().id, ...[...picked].filter(inGrid)])].filter(id => id in App.entered.value);
    const writes = canWrite(), d = ids.length && writes && deletion(ids), cs = cellsOf(), many = new Set(cs.map(x => x.getRow())).size > 1;
    const v = cell?.getValue();
    Shell.menu({ x: e.clientX, y: e.clientY }, [
      { label: 'Copy', keys: '$mod+KeyC', run: () => table.copyToClipboard('range') },
      ...(writes ? [{ label: 'Clear contents', keys: 'Delete', run: clear }, { label: 'Fill down', keys: '$mod+KeyD', run: () => fillFrom(true) }] : []),
      ...(c ? ['-', { label: 'Filter by this value', run: () => filterBy(c, [blank(v) ? null : v]) }] : []),
      ...(!current.isDatatype && writes ? ['-', { label: `New ${current.noun}`, run: () => rowEl?.querySelector('input, button')?.[current.isKind ? 'focus' : 'click']() }] : []),
      ...(d ? [{ label: ids.length > 1 || many ? `Delete ${count(ids.length, 'row')}` : 'Delete row', danger: true, point: on => FormulaBar.preview(on ? d.change : null), run: () => { FormulaBar.preview(null); d.stage(); } }] : []),
    ]);
  }

  // ---- Selection: a row the user selects is the record selected, and the other way round ----
  let picked = new Set(), picking = false;
  // Whether a record is a row the grid shows, built, filtered and folded as it is (Tabulator warns of a row
  // asked for that isn't); and its row brought into view if it is.
  const inGrid = id => { const row = ready && id && table?.rowManager.findRow(id); return !!row && table.rowManager.getDisplayRows().includes(row); };
  const reveal = id => { if (inGrid(id)) table.scrollToRow(id, 'nearest', false).catch(() => {}); };
  // The cells the user selects, by the pointer or the keys, select their rows' records, once they're selected: Tabulator
  // selects in steps (a click first makes the first cell a range, then moves its start, then its end, each said), so the
  // range is read at the end of the task, as it's left. Rows only a pending change has select nothing, as they're no
  // record yet; a column selected whole is an entry in general, not its rows. A range the grid makes itself (`hold`: the
  // keys' cell, a range put back as the grid is built, the selection tracked) selects nothing, so it never takes the
  // place of a record selected elsewhere.
  let due = false;
  const quiet = new WeakSet();
  const soon = () => { if (arranging || due) return; due = true; queueMicrotask(() => { due = false; pick(); }); };
  function hold(a, b = a) { const r = table.addRange(a, b); quiet.add(r.getComponent()); return r; }
  // No cell active, and none drawn so (Tabulator leaves the last drawn where it was).
  function unhold() { const sr = table.modules.selectRange; sr.clearRanges(); sr.activeRange = false; sr.layoutElement(); sr.overlay.style.visibility = 'hidden'; }
  function pick() {
    const range = ready && table?.modules.selectRange?.activeRange;
    if (!range?.initialized || range.destroyed || !current) return;
    const rows = range.getComponent().getRows(), all = table.getRows('active').length;
    if (!rows.length || (rows.length === all && all > 1)) return;
    const st = App.state.peek(), ids = [...new Set(rows.map(r => r.getData().id))].filter(id => st[id]);
    picking = true;
    Shell.select(ids.slice(0, 50));
    picking = false;
  }
  // Selected elsewhere, a record the grid shows is brought into view and its row made the keys' (in the column they
  // were in); one it doesn't show leaves no cell active, so the keys begin again from it, or the first row.
  const hidden = id => !!id && !inGrid(id) && !!current?.data.some(r => r.id === id && r._red !== 'add');
  function track(id) {
    const sr = table?.modules.selectRange;
    if (!id || !ready || !sr || !el?.offsetParent || table.modules.edit?.currentCell) return;
    if (!inGrid(id)) {
      if (sr.activeRange && hidden(id)) unhold();
      return;
    }
    reveal(id);
    const row = table.getRow(id), r = sr.activeRange?.getComponent?.();
    if (r && r.getRows().some(x => x.getData().id === id)) return;
    const col = sr.getActiveCell?.()?.column?.getComponent() ?? table.getColumns().find(c => c.getField());
    if (row && col?.getField()) hold(row.getCell(col));
  }
  function mark() {
    if (!table) return;
    const now = new Set(Shell.selection.peek()), rows = new Map(table.getRows().map(r => [r.getData().id, r]));
    for (const id of new Set([...picked, ...now])) rows.get(id)?.getElement().classList.toggle('picked', now.has(id));
    picked = now;
  }

  // Moved across by the keys, the active cell's column comes whole into view (into). A cell made active by a range added
  // (Home, End, a new row's next cell) is only so once Tabulator has placed the range, a moment later, so it's brought
  // into view then too.
  function across() { acrossNow(); setTimeout(acrossNow); }
  const acrossNow = () => into(table?.modules.selectRange?.getActiveCell()?.column?.getComponent());
  // The grid's own keys, as Excel's: Delete clears, Space flips a tag, typing begins a value (in a dropdown, finding
  // it), F2 edits the value as it is; Ctrl+Space and Shift+Space select the column and the row, Ctrl+A everything;
  // Home and End go to the row's first and last cells, with Ctrl the grid's; Alt+Down opens the column's menu; Ctrl+D
  // and Ctrl+R fill down and right.
  function keydown(e) {
    if (!table || table.modules.edit?.currentCell || e.target.closest('.tabulator-header') || current?.red) return;
    const cell = table.modules.selectRange?.getActiveCell()?.getComponent(), mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (!cell) return;
    const rows = table.getRows('active'), cols = table.getColumns().filter(c => c.getField()), r0 = table.getRanges()[0];
    const to = (a, b = a) => { e.preventDefault(); if (a && b) table.addRange(a, b); };
    if (e.key === ' ' && mod && !e.shiftKey) { const cs = r0.getColumns().filter(c => c.getField()); return rows.length && to(rows[0].getCell(cs[0]), rows.at(-1).getCell(cs.at(-1))); }
    if (e.key === ' ' && e.shiftKey && !mod) { const rs = r0.getRows(); return to(rs[0]?.getCell(cols[0]), rs.at(-1)?.getCell(cols.at(-1))); }
    if (k === 'a' && mod && !e.shiftKey && !e.altKey) return rows.length && to(rows[0].getCell(cols[0]), rows.at(-1).getCell(cols.at(-1)));
    if (e.key === 'Home' || e.key === 'End') {
      const row = mod ? rows[e.key === 'Home' ? 0 : rows.length - 1] : cell.getRow();
      to(row.getCell(cols[e.key === 'Home' ? 0 : cols.length - 1]));
      reveal(row.getData().id);
      if (e.key === 'Home') { const h = holder(); if (h) h.scrollLeft = 0; return; }
      return across();
    }
    if (/^(ArrowLeft|ArrowRight)$/.test(e.key)) return across();
    if (mod && (k === 'd' || k === 'r') && !e.shiftKey && !e.altKey) { e.preventDefault(); if (canWrite()) fillFrom(k === 'd'); return; }
    if (e.key === 'F2') { e.preventDefault(); if (canEdit(cell)) { ranged = cellsOf(); atEnd = true; cell.edit(true); if (!table.modules.edit.currentCell) atEnd = false; } return; }
    // Delete clears the cells of the range; rows selected whole, by their numbers, it deletes, after the redline.
    if ((e.key === 'Delete' || e.key === 'Backspace') && !App.readOnly.peek()) { e.preventDefault(); const ids = wholeRows(); if (ids.length) deletion(ids).stage(); else clear(); }
    else if (e.key === ' ' && columnOf(cell)?.type === 'tag') { e.preventDefault(); flip(cell); }
    else if (e.key.length === 1 && !mod && !e.altKey && cell.getField()) {
      const c = columnOf(cell);
      if (c.type === 'tag' || App.readOnly.peek() || !canEdit(cell)) return;
      // A dropdown opens with its field taking the key, so what's typed finds an option.
      if (c.type === 'choice' || c.type === 'edge') { ranged = cellsOf(); return cell.edit(true); }
      typed0 = e.key; ranged = cellsOf();
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
      const tools = document.createElement('div');
      tools.className = 'tools';
      cells = document.createElement('div');
      cells.className = 'cells';
      rowEl = document.createElement('div');
      rowEl.className = 'newslot';
      pins = document.createElement('style');
      el.append(tools, cells, rowEl, pins);
      preact.render(html`<${Tools} />`, tools);
      preact.render(html`<${NewRow} />`, rowEl);
      cells.addEventListener('keydown', first, true);
      cells.addEventListener('keydown', keydown);
      // Keys arriving from outside (F6 onto the view) go to the rows, not a heading's filter, which would open.
      cells.addEventListener('focus', e => {
        if (e.target.closest?.('.tabulator-header') && !cells.contains(e.relatedTarget) && e.timeStamp - pressed > 500) { e.stopPropagation(); focus(); }
      }, true);
      cells.addEventListener('focusin', e => {
        inside = true;
        if (e.target.classList.contains('tabulator-tableholder') && e.target.matches(':focus-visible')) activate();
      });
      cells.addEventListener('focusout', e => { if (e.relatedTarget && !cells.contains(e.relatedTarget)) inside = false; });
      // The slot settles as it's shown, as the inspector stops gliding, and as the window or the divider sizes it.
      const sized = new ResizeObserver(() => requestAnimationFrame(settle)), shown = new MutationObserver(settle);
      sized.observe(cells);
      shown.observe(el, { attributes: true, attributeFilter: ['hidden'] });
      const offs = [
        effect(() => { if (!Shell.gliding.value) preactSignals.untracked(settle); }),
        effect(() => { App.state.value; App.notes.value; App.schema.value; Shell.time.value; refresh(); }),
        // The rows of the records selected are marked; selected elsewhere, the first is brought into view, its row the keys'.
        effect(() => { const id = Shell.selection.value[0]; mark(); if (!picking) preactSignals.untracked(() => track(id)); }),
      ];
      return () => { offs.forEach(f => f()); sized.disconnect(); shown.disconnect(); preact.render(null, tools); preact.render(null, rowEl); table?.destroy(); table = null; el = cells = rowEl = pins = null; };
    },
    focus,
  });

  // ---- Export: what the table shows, in its order, as an Excel workbook or as CSV, while a table is shown ----
  const VENDOR = new URL('../../vendor/', SCRIPT);
  let sheetjs = null;
  const loadSheetJS = () => sheetjs ??= new Promise((ok, fail) => document.head.append(Object.assign(document.createElement('script'), {
    src: new URL('xlsx/xlsx.full.min.js', VENDOR).href, onload: () => ok(window.XLSX), onerror: () => { sheetjs = null; fail(new Error('Couldn’t load the Excel writer')); } })));
  const fileName = ext => `${[App.shown.peek().charts().find(c => c.chart === App.chart.peek())?.name, viewOf(Shell.view.peek())?.name].filter(Boolean).join(' – ').replace(/[\\/:*?"<>|]+/g, '') || 'Table'}.${ext}`;
  // A day as Excel counts it, from December 30, 1899.
  const serial = iso => { const [y, m, d] = iso.split('-').map(Number); return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 864e5; };
  // A percentage as precise as the grid says it, to four places: 28.4% is 0.0%, 100% is 0%.
  const pct = v => { const s = String(+(v * 100).toFixed(4)), i = s.indexOf('.'); return `0${i < 0 ? '' : '.' + '0'.repeat(s.length - i - 1)}%`; };
  // The sheet: the headings, then each row the grid shows, in its order, each value Excel's own kind of cell in the format
  // the grid reads it in: a number a number, a percentage a percentage, an amount of money money, a date a date; a link
  // to a document a link, named as the grid names it; a tag Yes or No. Its columns as wide as the grid's, with Excel's
  // filter on its headings. A row a change pending would add isn't there yet, and a value it would change is as it is.
  function sheet(X) {
    const m = current, cols = table.getColumns().filter(c => c.getField()).map(col => [col, m.byField.get(col.getField())]).filter(([, c]) => c);
    const rows = table.getRows('active').map(r => r.getData()).filter(d => d._red !== 'add');
    const value = (d, c) => { const mm = d._m[field(c)]; return mm && 'was' in mm ? mm.was : d[field(c)]; };
    const ws = {}, at = (r, j) => X.utils.encode_cell({ r, c: j });
    cols.forEach(([, c], j) => {
      ws[at(0, j)] = { t: 's', v: headed(c) };
      rows.forEach((d, i) => {
        const v = value(d, c), type = typeOf(c, d);
        if (blank(v)) return;
        ws[at(i + 1, j)] = type === 'tag' ? { t: 's', v: v ? 'Yes' : 'No' }
          : typeof v === 'number' && NUMERIC.has(type) ? { t: 'n', v, ...(type === 'percent' ? { z: pct(v) } : type === 'money' ? { z: `"$"#,##0${Number.isInteger(v) ? '' : '.00'}` } : {}) }
          : type === 'date' && /^\d{4}-\d\d-\d\d$/.test(v) ? { t: 'n', v: serial(v), z: 'mmm d, yyyy' }
          : type === 'document' ? { t: 's', v: c.filed ? filed(v) : Tree.format('document', v), l: { Target: String(v) } }
          : { t: 's', v: text(type, v) };
      });
    });
    ws['!ref'] = X.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: Math.max(0, cols.length - 1) } });
    ws['!cols'] = cols.map(([col]) => ({ wpx: Math.round(col.getWidth()) }));
    ws['!autofilter'] = { ref: ws['!ref'] };
    return ws;
  }
  async function workbook() {
    const X = await loadSheetJS(), wb = X.utils.book_new(), name = viewOf(Shell.view.peek())?.name ?? 'Table';
    X.utils.book_append_sheet(wb, sheet(X), name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Table');
    wb.Props = { Title: fileName('xlsx').replace(/\.xlsx$/, ''), Author: App.who() ?? '' };
    return wb;
  }
  async function excel() {
    const X = await loadSheetJS(), blob = new Blob([X.write(await workbook(), { bookType: 'xlsx', type: 'array', compression: true })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    if (typeof Export !== 'undefined' && Export.onFile) return Export.onFile(blob, fileName('xlsx'));
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: fileName('xlsx') });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    return blob;
  }
  // Import: a file of rows, Excel's or CSV, read as a paste with a heading row, so its rows are found by their names and
  // what's new is added, the headings nothing matches asked about, the whole redlined until Enter. A date reads as its
  // day, whatever format the sheet shows it in.
  function importFile() {
    if (App.readOnly.peek()) return Shell.toast('Can’t change the past');
    const input = Object.assign(document.createElement('input'), { type: 'file', accept: '.xlsx,.xlsm,.xls,.csv,.tsv,.txt' });
    input.onchange = async () => {
      const f = input.files[0];
      if (!f) return;
      try {
        const X = await loadSheetJS(), wb = X.read(await f.arrayBuffer(), { cellNF: true }), ws = wb.Sheets[wb.SheetNames[0]], pad = n => String(n).padStart(2, '0');
        for (const [k, c] of Object.entries(ws)) if (k[0] !== '!' && c.t === 'n' && c.z && X.SSF.is_date(c.z)) { const d = X.SSF.parse_date_code(c.v); c.w = `${d.y}-${pad(d.m)}-${pad(d.d)}`; }
        const text = X.utils.sheet_to_csv(ws, { FS: '\t', blankrows: false });
        if (!text.trim()) return Shell.toast(`${f.name} has no rows`);
        paste(text, { file: f.name });
      } catch (e) { Shell.toast(`Couldn’t read ${f.name}`); }
    };
    input.click();
  }
  Shell.register('action', { id: 'table.import', name: 'Import…', enabled: () => viewOf(Shell.view.peek())?.layout === 'table' && !!real && !real.isDatatype, run: importFile });
  let unexport = null;
  effect(() => {
    const on = viewOf(Shell.view.value)?.layout === 'table';
    if (on && !unexport) {
      const offs = [Shell.register('export', { name: 'Excel', run: () => table && excel().catch(e => Shell.toast(e?.message || 'Couldn’t export')) }),
        Shell.register('export', { name: 'CSV', run: () => table?.download('csv', fileName('csv'), { bom: true }) })];
      unexport = () => offs.forEach(f => f());
    }
    if (!on && unexport) { unexport(); unexport = null; }
  });

  return { model, paste, focus, look: lookOf, workbook, Columns, get grid() { return table; } };
})();
