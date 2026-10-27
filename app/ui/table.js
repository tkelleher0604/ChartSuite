// Table views (dendra.md, Views): a view laid out as a table is one Tabulator grid. Its rows are the records
// of one kind (Entities), one relation (Ownership), or every entry of one datatype (Dates, Documents), as its
// Layout note says; its columns are what's located at the rows. In the view, a Shown note at a column's
// pattern shows or hides it, and Order notes place the columns. Every edit, paste or deletion is one change,
// so one Undo takes it back. A pending change, whoever asks (FormulaBar.preview), is redlined in the grid, and
// a paste waits there for Enter.

const Table = (() => {
  const { effect, html, signal } = Shell;
  const { clean, norm, same, plural } = Tree;

  const below = (p, path) => path.reduce((loc, edge) => ({ args: [{ edge, loc }] }), p);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
  const count = (n, one, many = plural(one)) => `${n} ${n === 1 ? one : many}`;
  const list = xs => xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`;
  const BLANK = '\u0000blank';
  const entryAt = (st, at, edge) => at && Tree.entryAt(st, at, edge);
  const valueOf = r => !r ? undefined : 'tag' in r ? r.tag : 'choice' in r ? r.choice : r.value;
  const viewOf = id => App.views.value.find(v => v.id === id);

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
  // What a column holds, from its specifications: the commonest type, and a choice's options.
  function typed(c, specs) {
    const types = specs.map(t => 'field' in t.out ? t.out.field : 'choice' in t.out ? 'choice' : 'tag');
    const type = types.sort((a, b) => types.filter(x => x === b).length - types.filter(x => x === a).length)[0];
    return { ...c, type, options: [...new Set(specs.filter(t => 'choice' in t.out).map(t => t.out.choice))].sort() };
  }

  function model(view, R = App.computed.value, S = App.schema.value) {
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
      for (const c of entryColumns(S, isRow)) if (!(up && c.path.length === 1 && norm(c.path[0]) === own))
        cols.push(typed({ ...c, up, pattern: below(base, c.path), title: c.path.at(-1), parent: c.path.slice(0, -1).join(' › '), base: order(base, c.path) }, c.specs));
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
      cols.forEach((c, i) => {
        const m = cellOf(id, c), r = m.id && st[m.id], f = 'f' + i;
        row[f] = m.v ?? null;
        // The engine says what it worked out, and what entered it also covers; a date a formula gives is a deadline.
        const fx = !!R.computed?.[m.id], cov = !!R.covered?.[m.id], over = R.covered?.[m.id]?.agrees === false;
        row._m[f] = { id: m.id, at: m.at, fx, over, due: (fx || cov) && r.field === 'date' && r.value < today };
      });
      row._ruled = st[id].tag === false;
      return row;
    });
    // A check's column is drawn only while a row fails it, as the inspector shows a check only where it fails.
    cols.forEach((c, i) => { if (c.check) c.fails = data.some(r => r['f' + i] === false); });

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

  // ---- The redline: the grid as a pending change would leave it, beside the grid now ----
  // A row that would appear is blue, one that would go is struck in red, and a value that would change shows
  // the old struck beside the new; the cell keeps what it was as `was`.
  function redlined(now, then) {
    const was = new Map(now.data.map(r => [r.id, r])), fieldOf = new Map(now.cols.map((c, i) => [c.key, 'f' + i]));
    const old = (r, c) => fieldOf.has(c.key) ? r[fieldOf.get(c.key)] ?? null : null;
    const data = then.data.map(r => {
      const w = was.get(r.id);
      if (!w) return { ...r, _red: 'add' };
      const _m = { ...r._m };
      then.cols.forEach((c, i) => { const f = 'f' + i, v = old(w, c); if (v !== r[f]) _m[f] = { ..._m[f], was: v }; });
      return { ...r, _m };
    });
    const kept = new Set(then.data.map(r => r.id));
    for (const w of now.data) if (!kept.has(w.id)) data.push({ ...Object.fromEntries(then.cols.map((c, i) => ['f' + i, old(w, c)])), id: w.id, _g: w._g, _red: 'go',
      _m: Object.fromEntries(then.cols.map((c, i) => ['f' + i, w._m[fieldOf.get(c.key)] ?? {}])) });
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
    const shown = (v, m) => c.type === 'tag' ? (!c.check ? box(v, m) : v === false ? box(v, m) : '')
      : c.type === 'document' && v ? `<a href="${esc(SharePoint.href(v))}" target="_blank" rel="noopener" tabindex="-1">${esc(c.filed ? filed(v) : Tree.format('document', v))}</a>`
      : esc(text(c.type, v));
    return cell => {
      const el = cell.getElement(), m = meta(cell), v = cell.getValue();
      el.tabIndex = -1;   // the grid is one stop in the tab order, and the arrows move within it
      el.classList.toggle('fx', !!m?.fx);
      el.classList.toggle('over', !!m?.over);
      el.classList.toggle('due', !!m?.due);
      el.classList.toggle('none', c.type !== 'edge' && !c.key.startsWith('$') && !m?.at);
      if (!m || !('was' in m) || c.type === 'tag') return shown(v, m);
      return [m.was !== null && `<span class="del">${shown(m.was)}</span>`, v !== null && `<span class="add">${shown(v, m)}</span>`].filter(Boolean).join(' ');
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
      if (!readable(cell, input.value)) { input.classList.add('bad'); input.setAttribute('aria-invalid', 'true'); return false; }
      done = true;
      cancel();
      put(cell, input.value);
      return true;
    };
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); if (keep()) move('down'); }
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
      if (sr?.activeRange) sr.navigate(false, false, d);
      back();
    }, 0);
  }

  // ---- The grid ----
  let table = null, ready = false, built = null, current = null, real = null, el = null, cells = null, bar = null;
  // The grid is laid out as Excel's is. Each column is as wide as what it holds in every row, drawn or not, to a
  // cap, and a tag's column as narrow as its heading set on two lines; nothing is cut to fit. The first column,
  // the names, has no cap but half the grid, past which a name goes on to a second line. Where there's room,
  // what's cut short has it first, the least cut first, so the most come out whole; what's left stays at the
  // right edge. Where there isn't, the grid scrolls across under its first column, which stays put, a column at
  // a time. A column the user has sized keeps its width.
  const TAG = /\bc-tag\b/, PIN = /\bpin\b/, sized = new WeakSet();   // sized here, so free to size again
  const ruler = document.createElement('canvas').getContext('2d');
  // The widest of a column's values as its cells set them, in every row.
  function widest(c) {
    const col = current?.cols[+c.getField().slice(1)], cell = c.cells.find(x => x.element?.isConnected)?.element;
    if (!col || !cell) return 0;
    const s = getComputedStyle(cell), f = c.getField(), said = v => col.type === 'document' ? (col.filed ? filed(v) : Tree.format('document', v)) : text(col.type, v);
    ruler.font = `${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
    let w = 0;
    for (const row of c.table.rowManager.rows) { const v = row.data[f]; if (v !== null && v !== undefined) w = Math.max(w, ruler.measureText(said(v)).width); }
    return Math.ceil(w + parseFloat(s.paddingLeft) + parseFloat(s.paddingRight) + parseFloat(s.borderRightWidth)) + 2;
  }
  // Where a column the grid scrolls to starts: clear of the row numbers and the first column.
  const pinned = t => t.element.style.setProperty('--pinned', `${48 + (t.getColumns().find(c => c.getField())?.getWidth() ?? 0)}px`);
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
  Tabulator.extendModule('layout', 'modes', { fitDataSlack(columns) {
    const shown = columns.filter(c => c.visible), free = shown.filter(c => !c.widthFixed || sized.has(c)), full = new Map(), w = widthOf(this.table);
    for (const c of free) {
      if (TAG.test(c.definition.cssClass)) c.setWidthActual(twoLines(c));
      else {
        const cap = c.maxInitialWidth;
        c.maxInitialWidth = null; c.reinitializeWidth(); c.maxInitialWidth = cap;
        const all = c.getField() ? widest(c) : 0;
        if (all > c.getWidth()) c.setWidthActual(all);
      }
      full.set(c, c.getWidth());
      const most = PIN.test(c.definition.cssClass) ? Math.floor(w / 2) : c.maxInitialWidth;
      if (c.getWidth() > most) c.setWidthActual(most);
    }
    laid.set(this.table, w);
    let room = w - shown.reduce((s, c) => s + c.getWidth(), 0);
    const give = (c, d) => { if (c && d > 0) { c.setWidth(c.getWidth() + d); sized.add(c); room -= d; } };
    for (const c of [...free].sort((a, b) => (full.get(a) - a.getWidth()) - (full.get(b) - b.getWidth()))) give(c, Math.min(room, full.get(c) - c.getWidth()));
    pinned(this.table);
  } });

  const drawn = c => c.pasted || (c.shown && (!c.check || c.fails));
  function columnDefs(m) {
    const defs = m.cols.filter(drawn).map(c => {
      const f = 'f' + m.cols.indexOf(c), editable = c.type !== 'tag' && c.key !== '$entry' && c.key !== '$of';
      // A heading's filter offers the values its column has now, as they read, and Blank where it has one; none
      // once its grid has given way to another.
      const values = () => {
        const i = current?.view === m.view ? current.cols.findIndex(x => x.key === c.key) : -1, g = 'f' + i;
        if (i < 0) return [];
        const vs = [...new Set(current.data.map(r => r[g]).filter(v => v !== null))].sort((a, b) => typeof a === 'number' ? a - b : String(a).localeCompare(String(b)));
        return [...vs.map(v => ({ label: text(c.type, v), value: v })), ...(current.data.some(r => r[g] === null) ? [{ label: 'Blank', value: BLANK }] : [])];
      };
      const right = NUMERIC.has(c.type) ? 'right' : 'left';
      return {
        title: c.title, field: f, minWidth: c.type === 'tag' ? 56 : 72, maxInitialWidth: 340,
        titleFormatter: c.parent ? () => `<span class="up">${esc(c.parent)}</span>${esc(c.title)}` : undefined,
        hozAlign: right, headerHozAlign: right, cssClass: 'c-' + (c.type === 'edge' ? 'edge' : c.type),
        sorter: NUMERIC.has(c.type) ? 'number' : c.type === 'tag' ? 'boolean' : 'string', sorterParams: { alignEmptyValues: 'bottom' },
        formatter: formatter(c),
        editable: cell => !App.readOnly.peek() && !current?.red && (c.type === 'edge' || !!meta(cell)?.at || c.key === '$out'),
        editor: !editable ? false : c.type === 'choice' || c.type === 'edge' ? 'list' : editor(c, put),
        editorParams: c.type === 'choice' ? { ...LIST, values: c.options, freetext: true, allowEmpty: true }
          : c.type === 'edge' ? () => ({ ...LIST, values: objects(m, c) }) : undefined,
        headerFilter: 'list', headerFilterParams: { ...LIST, valuesLookup: values, clearable: true },
        headerFilterFunc: (want, v) => want === BLANK ? v === null || v === '' : v === want,
        headerFilterEmptyCheck: v => v === undefined || v === null || v === '',
        accessorClipboard: v => plain(c.type, v), accessorDownload: v => csvSafe(plain(c.type, v)),
      };
    });
    if (defs[0]) defs[0].cssClass += ' pin';   // kept in view by table.css, not frozen: Tabulator's range selection takes only the row numbers frozen
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
    cells.replaceChildren();
    const host = document.createElement('div');
    cells.appendChild(host);
    built = { view: m.view, sig: signature(m) };
    reds = new Set();
    flight = null;
    const t = table = new Tabulator(host, {
      index: 'id', data: m.data, columns: columnDefs(m), height: '100%', layout: 'fitDataSlack',
      placeholder: m.isKind ? `No ${plural(m.noun)}` : 'No rows',
      rowHeader: { formatter: 'rownum', headerSort: false, resizable: false, frozen: true, hozAlign: 'right', width: 48, minWidth: 48, cssClass: 'rn' },
      selectableRange: 1, selectableRangeColumns: true, selectableRangeRows: true, selectableRangeInitializeDefault: false,
      editTriggerEvent: 'dblclick',
      // Tab leaves the grid, as it leaves any control; the arrows move within it.
      keybindings: { navPrev: false, navNext: false },
      clipboard: true, clipboardCopyStyled: false, clipboardCopyRowRange: 'range',
      clipboardCopyConfig: { columnHeaders: false, columnGroups: false, rowHeaders: false, rowGroups: false, columnCalcs: false, formatCells: false },
      // A link pasted onto a row isn't the grid's: it goes on to link a document (inspector.js).
      clipboardPasteParser: text => { const to = onto(text); return to === 'record' ? false : { text: to === 'cell' ? text : '' }; },
      clipboardPasteAction: ({ text }) => { if (text) paste(text); return []; },
      movableColumns: !m.isDatatype, headerSortClickElement: 'icon', columnHeaderVertAlign: 'bottom',
      rowFormatter: row => {
        const d = row.getData(), e = row.getElement();
        e.classList.toggle('ruled', !!d._ruled);
        e.classList.toggle('picked', picked.has(d.id));
        e.classList.toggle('red-add', d._red === 'add');
        e.classList.toggle('red-go', d._red === 'go');
      },
      ...(m.groups && {
        groupBy: '_g', groupValues: [m.groups], groupToggleElement: 'header',
        groupHeader: (g, n) => `${g === 'overdue' ? 'Overdue' : Tree.formatDate(g + '-01', 'month')}<span>${n}</span>`,
      }),
    });
    t.on('cellEdited', cell => { const d = m.cols[+cell.getField().slice(1)]; if (d.type === 'choice' || d.type === 'edge') put(cell, cell.getValue() ?? ''); back(); });
    t.on('cellEditCancelled', () => back());
    t.on('cellClick', (e, cell) => { if (e.target.closest('.tag')) flip(cell); });
    t.on('rangeChanged', range => pick(range));
    t.on('rangeAdded', range => pick(range));
    t.on('columnMoved', () => placeColumns());
    t.on('columnResized', col => { sized.delete(col._column); pinned(t); });
    t.on('headerContext', (e, col) => { e.preventDefault(); columnMenu(e, col); });
    t.on('rowContext', (e, row) => { e.preventDefault(); rowMenu(e, row); });
    t.on('renderComplete', regain);
    t.on('tableBuilt', () => {
      ready = true;
      // The first column stays put beside the row numbers (table.css), so the keys scroll a cell clear of both.
      const sr = t.modules.selectRange, numbers = sr.getRowHeaderWidth.bind(sr);
      sr.getRowHeaderWidth = () => numbers() + (t.getColumns().find(c => c.getField())?.getWidth() ?? 0);
      // One stop in the tab order: the rows, not the headings and their filters.
      host.querySelectorAll('.tabulator-header, .tabulator-header-filter input').forEach(x => x.setAttribute('tabindex', '-1'));
      mark();
      reveal(Shell.selection.peek()[0]);
      regain();
    });
  }
  // What the columns are; when it changes, the grid is built again rather than refreshed.
  const signature = m => JSON.stringify([m.view, m.cols.filter(drawn).map(c => [c.key, c.title, c.type, c.options, c.filed, c.check]), m.groups]);

  let reds = new Set(), seen = null;
  function refresh() {
    const view = Shell.view.value, v = viewOf(view), p = FormulaBar.pending.value;
    if (!el || v?.layout !== 'table') return;
    const now = model(view);
    real = now;
    // A table whose rows aren't chosen yet.
    if (!now) { table?.destroy(); table = null; built = null; current = null; cells.innerHTML = '<div class="empty">No rows</div>'; return; }
    let m = now;
    if (p) {
      m = redlined(now, model(view, p.R2, schemaWith(p)));
      // A paste into a column the view hides shows it while the paste is pending.
      for (const c of m.cols) if (staged.peek()?.cols.has(c.key)) c.pasted = true;
    }
    current = m;
    if (!table || built.view !== view || built.sig !== signature(m)) { since(now); return build(m); }
    if (!ready) return table.on('tableBuilt', () => refresh());
    // One update at a time: another asked for meanwhile follows it.
    if (flight) { flight.again = true; return; }
    // Rows keep their place while they're edited; a sort or a filter applies again only when asked.
    const t = table, lit = p ? [] : since(now), red = new Set(m.data.filter(isRed).map(r => r.id)), first = !reds.size && (m.data.find(r => r._red) ?? m.data.find(isRed))?.id;
    const f = flight = { again: false };
    t.blockRedraw();
    t.updateOrAddData(m.data).then(() => {
      if (flight === f) flight = null;
      if (t !== table) return;
      const keep = new Set(m.data.map(r => r.id)), rows = new Map();
      for (const row of t.getRows()) if (!keep.has(row.getData().id)) row.delete(); else rows.set(row.getData().id, row);
      for (const id of new Set([...reds, ...red])) rows.get(id)?.reformat();
      reds = red;
      t.restoreRedraw();
      mark();
      if (first) reveal(first);
      flash(lit);
      regain();
      if (f.again) refresh();
    });
  }
  let flight = null;

  // ---- Quiet feedback: the cells a change just made light for a moment, whoever made it ----
  // The cells that differ from the grid last drawn, at this view, with these columns, at this time.
  function since(now) {
    const s = seen, key = signature(now) + JSON.stringify(Shell.time.peek());
    seen = { key, version: App.version.peek(), data: now.data };
    if (!s || s.key !== key || s.version === seen.version) return [];
    const old = new Map(s.data.map(r => [r.id, r])), out = [];
    for (const r of now.data) {
      const o = old.get(r.id), fs = Object.keys(r).filter(f => /^f\d+$/.test(f) && (!o || o[f] !== r[f]));
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
  document.addEventListener('pointerdown', e => { inside = !!cells?.contains(e.target); pressed = e.timeStamp; }, true);
  const holder = () => cells?.querySelector('.tabulator-tableholder');
  // A redraw that drops the keys gives them back.
  function regain() {
    const a = document.activeElement;
    if (inside && table && el?.offsetParent && (!a || a === document.body) && !table.modules.edit?.currentCell) holder()?.focus({ preventScroll: true });
  }
  const back = () => { inside = true; requestAnimationFrame(regain); };
  // A cell made active for the keys: the selected record's row, or the first, in the first column.
  function activate() {
    const sr = table?.modules.selectRange;
    if (!ready || !sr || sr.activeRange) return;
    const rows = table.getRows('active'), id = Shell.selection.peek().find(inGrid);
    const row = (id && rows.find(r => r.getData().id === id)) || rows[0], col = table.getColumns().find(c => c.getField());
    if (!row || !col) return;
    table.addRange(row.getCell(col), row.getCell(col));
    reveal(row.getData().id);
  }
  // F6 and the like give the grid the keys, at its active cell.
  function focus() {
    const h = holder();
    if (!h || !el?.offsetParent) return false;
    inside = true;
    h.focus({ preventScroll: true });
    activate();
    return true;
  }
  // Before Tabulator hears a key: with no cell active, a key that moves makes one; while a paste is pending,
  // Enter makes it; and on a cell that can't be edited, Enter moves down, as Excel's does.
  const canEdit = cell => { const d = cell.getColumn().getDefinition(); return !!d.editor && (typeof d.editable !== 'function' || d.editable(cell)); };
  function first(e) {
    if (!table || table.modules.edit?.currentCell) return;
    const cell = e.key === 'Enter' && !staged.peek() && table.modules.selectRange?.getActiveCell()?.getComponent();
    if (e.key === 'Enter' && staged.peek()) { e.preventDefault(); e.stopPropagation(); commit(); }
    else if (cell && !canEdit(cell)) { e.preventDefault(); e.stopPropagation(); move('down'); }
    else if (/^(Arrow|Page|Home$|End$)/.test(e.key) && !table.modules.selectRange?.activeRange) { e.preventDefault(); e.stopPropagation(); activate(); }
  }

  // ---- Writing: each edit, paste or deletion one change ----
  const edit = (fn, say) => !!App.change(fn, { say });
  // Records entered as one change: a new one under its own id, an entered one set from the day shown.
  const enter = (records, say) => edit(tx => {
    const entered = App.entered.peek();
    for (const [id, r] of Object.entries(records)) { const { since: _, before: __, ...rec } = r; if (id in entered) tx.update(id, rec); else tx.add('record', rec, id); }
  }, say);
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
    const p = placed(m, c, out);
    return !p || enter(Object.fromEntries([p]));
  }
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
  // Either way the paste is redlined in the grid, and Enter makes it, as one change.
  function paste(textIn) {
    if (staged.peek() && FormulaBar.pending.peek()?.change !== staged.peek().change) unstage();
    const m = real, grid = tsv(textIn);
    if (!m || m !== current || !grid.length || App.readOnly.peek() || staged.peek()) return;
    let head = headings(m, grid);
    if (head && m.isDatatype) { grid.shift(); head = null; }   // a datatype's rows have no names to match by
    if (!head) return stage(m, byPlace(m, grid));
    const asked = grid[0].some((h, j) => !head[j] && clean(h));
    (asked ? ask(m, grid, head) : Promise.resolve(head)).then(h => h && stage(m, byName(m, grid, h)));
  }

  // The column a heading names: by its title, or its place (Entity Type › Tax Classification); a relation's
  // side by its edge, its list's name (Owners) or the one kind only it can be; the Name by the kind (Entity).
  // Singular or plural alike.
  function named(m, h) {
    const N = App.notes.peek(), is = (a, b) => same(a, b) || same(plural(a), b) || same(a, plural(b));
    const kinds = new Map(m.cols.filter(c => c.type === 'edge').map(c => [c, sideKinds(m, c.edge)]));
    const names = c => [c.title, c.parent && `${c.parent} › ${c.title}`,
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
  // By name: each pasted row (under its headings) is the table's row whose names it gives, or a new one.
  function byName(m, grid, head) {
    const st = App.state.peek(), N = App.notes.peek(), keys = keysOf(m, head);
    const missing = m.isKind ? (keys.length ? null : 'Name') : keys.find(k => !head.includes(k))?.title;
    if (missing) return `Couldn’t paste: no ${missing} column`;
    const names = (d, k) => {
      const o = k.type === 'edge' ? Tree.objectOf(st, st[d.id].args.find(a => same(a.edge, k.edge))?.at) : d.id;
      return o ? [N.nameOf(st, o), N.shortOf(st, o)].map(norm) : [];
    };
    const rowFor = key => m.data.find(d => keys.every((k, i) => names(d, k).includes(norm(key[i]))))?.id ?? null;
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
    const head = grid[0].map((_, j) => shown[c0 + j] ? m.cols[+shown[c0 + j].getField().slice(1)] : null), ks = keysOf(m, head);
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

  // The change a plan makes, as FormulaBar.preview takes one, its new records under new ids; with what it does.
  function changeOf(m, { keys, plan }) {
    const st = App.state.peek(), entered = App.entered.peek(), records = {}, made = new Map(), kids = new Map();
    const x = { records, values: 0, rows: [], made: [], skipped: 0, cols: new Set() };
    const put = (rec, id = Log.newId()) => { records[id] = rec; return id; };
    const make = (name, kind) => { const o = put({ kind }); put({ at: o, edge: 'Name', field: 'text', value: name }); made.set(norm(name), o); return o; };
    const childAt = (at, edge) => kids.get(`${at}|${norm(edge)}`) ?? entryAt(st, at, edge);
    // A side named in the paste: an object of the kinds that side can be, or a new one of the commonest.
    const sideAt = (edge, name) => {
      let o = find(st, name, sideKinds(m, edge)) ?? made.get(norm(name));
      if (!o) { const kind = kindAt(m, edge); o = make(name, kind); x.made.push([kind, name]); }
      return follow(st, o, sideLoc(m, edge));
    };
    for (const p of plan) {
      let row = p.row;
      if (!row) {
        if (!p.key.length || p.key.some(k => !k)) { x.skipped += p.cells.filter(([, raw]) => clean(raw)).length; continue; }
        if (m.isKind) row = made.get(norm(p.key[0])) ?? make(p.key[0], m.rows.kind);
        else {
          const args = keys.map((k, i) => ({ edge: k.edge, at: sideAt(k.edge, p.key[i]) }));
          if (args.some(a => !a.at)) { x.skipped += p.cells.length; continue; }
          const own = p.cells.find(([c]) => c.key === '$out');
          row = put({ args, ...(own ? value(own[0].type, clean(own[1])) ?? { tag: true } : { tag: true }) });
        }
        x.rows.push(row);
      }
      for (const [c, raw] of p.cells) {
        if (!clean(raw) || (!p.row && c.key === '$out')) continue;
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
        x.values++;
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

  // ---- A paste pending: redlined in the grid, with a bar saying what it does; Enter makes it, Esc doesn't ----
  const staged = signal(null);   // { change, x, say, cols }
  let unlayer = null;
  function stage(m, r) {
    if (typeof r === 'string') return Shell.toast(r);
    const x = changeOf(m, r);
    if (!Object.keys(x.records).length) return Shell.toast(x.skipped ? `Left out ${count(x.skipped, 'value')}` : 'Nothing new to paste');
    const made = x.made.map(([, name]) => name), noun = m.noun;
    const added = [x.rows.length && count(x.rows.length, noun), ...(made.length > 3 ? [...made.slice(0, 2), `${made.length - 2} more`] : made)].filter(Boolean);
    const say = [x.values && `Pasted ${count(x.values, 'value')}`, added.length && `added ${list(added)}`, x.skipped && `${count(x.skipped, 'value')} left out`]
      .filter(Boolean).join(', ').replace(/^a/, 'A');
    const shownCols = new Set(m.cols.filter(drawn).map(c => c.key));
    staged.value = { change: { records: x.records }, x, say, cols: new Set([...x.cols].filter(k => !shownCols.has(k))), noun, select: x.rows.length === 1 && x.rows };
    unlayer = Shell.layer(cancel);
    FormulaBar.preview(staged.peek().change, 'paste');
    back();
  }
  function unstage() {
    if (!staged.peek()) return;
    staged.value = null;
    unlayer?.(); unlayer = null;
  }
  function cancel() {
    const s = staged.peek();
    unstage();
    if (s && FormulaBar.pending.peek()?.change === s.change) FormulaBar.preview(null);
    back();
  }
  function commit() {
    const s = staged.peek();
    if (!s) return;
    unstage();
    FormulaBar.preview(null);
    if (enter(s.change.records, s.say) && s.select) Shell.select(s.select);
    back();
  }
  // The bar under the grid while a paste is pending: what it does, the day it takes effect, and the choice.
  function PasteBar() {
    const s = staged.value, p = FormulaBar.pending.value, day = Shell.time.value?.asOf;
    if (!s || p?.change !== s.change) return null;
    const { x, noun } = s, made = x.made.slice(0, 3);
    const parts = [x.values && count(x.values, 'value'), x.rows.length && `${x.rows.length} new ${x.rows.length === 1 ? noun : plural(noun)}`,
      ...made.map(([kind, name]) => html`new ${kind} <span class="add">${name}</span>`), x.made.length > 3 && `${x.made.length - 3} more`,
      x.skipped && `${count(x.skipped, 'value')} left out`].filter(Boolean);
    return html`<div class="pastebar" role="region" aria-label="Paste">
      <span class="what">${parts.map((t, i) => html`${i ? html`<span class="sep">·</span>` : null}${t}`)}</span>
      ${day ? html`<span class="when">From ${Tree.formatDate(day, 'short')}</span>` : null}
      <button class="btn" onClick=${cancel}>Discard</button>
      <button class="btn primary" onClick=${commit}>Paste</button>
    </div>`;
  }
  // A paste pending goes when what it was worked out from changes: the view, the day, the workbook; or when
  // another change is previewed in its place.
  effect(() => { Shell.view.value; Shell.time.value; App.version.value; if (staged.peek()) cancel(); });
  let ours = false;
  effect(() => {
    const p = typeof FormulaBar === 'undefined' ? null : FormulaBar.pending.value, s = staged.peek();
    if (!s) { ours = false; return; }
    if (p?.change === s.change) ours = true;
    else if (p || ours) unstage();
  });
  // Enter, wherever the keys are, unless something else is being typed or pressed.
  addEventListener('keydown', e => {
    if (e.key === 'Enter' && staged.peek() && !e.defaultPrevented && !e.target.closest?.('input, textarea, select, button, [contenteditable], .CodeMirror, dialog')) { e.preventDefault(); commit(); }
  });

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
      ...(c.pattern && !m.red ? ['-', { label: 'Hide', run: () => show(c, false) }, { label: 'Columns', items: columnItems(m) }] : []),
    ]);
  }
  function rowMenu(e, row) {
    const st = App.state.value, ids = [...new Set([row.getData().id, ...[...picked].filter(inGrid)])].filter(id => id in App.entered.value);
    if (!ids.length || App.readOnly.peek() || current.red) return;
    const what = ids.length === 1 ? (current.isKind ? App.notes.peek().nameOf(st, ids[0]) : count(1, current.noun)) : count(ids.length, current.noun);
    Shell.menu({ x: e.clientX, y: e.clientY }, [{ label: 'Delete', danger: true, run: () => edit(tx => ids.forEach(id => tx.remove(id)), () => `Deleted ${what}`) }]);
  }

  // ---- Selection: a row selected is the record selected, and the other way round ----
  let picked = new Set(), picking = false;
  // Whether a record is a row the grid shows, built, filtered and folded as it is (Tabulator warns of a row
  // asked for that isn't); and its row brought into view if it is.
  const inGrid = id => { const row = ready && id && table?.rowManager.findRow(id); return !!row && table.rowManager.getDisplayRows().includes(row); };
  const reveal = id => { if (inGrid(id)) table.scrollToRow(id, 'nearest', false).catch(() => {}); };
  function pick(range) {
    if (!range || !current) return;
    const rows = range.getRows(), all = table.getRows('active').length;
    if (!rows.length || (rows.length === all && all > 1)) return;   // a whole column: an entry in general, not its rows
    const st = App.state.peek(), ids = [...new Set(rows.map(r => r.getData().id))].filter(id => st[id]);   // never a row only a pending change has
    if (!ids.length) return;
    picking = true;
    Shell.select(ids.slice(0, 50));
    picking = false;
  }
  function mark() {
    if (!table) return;
    const now = new Set(Shell.selection.peek()), rows = new Map(table.getRows().map(r => [r.getData().id, r]));
    for (const id of new Set([...picked, ...now])) rows.get(id)?.getElement().classList.toggle('picked', now.has(id));
    picked = now;
  }

  function keydown(e) {
    if (!table || table.modules.edit?.currentCell || e.target.closest('.tabulator-header') || current?.red) return;
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
      cells = document.createElement('div');
      cells.className = 'cells';
      bar = document.createElement('div');
      el.append(cells, bar);
      preact.render(html`<${PasteBar} />`, bar);
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
      // As the grid's slot changes size, a grid laid out in another room (drawn while its slot was hidden, or as the
      // inspector glided) is laid out again; and Tabulator, drawing its rows again, drops the keys, which come back.
      const sized = new ResizeObserver(() => requestAnimationFrame(() => {
        if (table && ready && el?.offsetParent && laid.get(table) !== widthOf(table)) table.redraw();
        regain();
      }));
      sized.observe(cells);
      const offs = [
        effect(() => { App.state.value; App.notes.value; App.schema.value; Shell.time.value; refresh(); }),
        // The rows of the records selected are marked; selected elsewhere, the first is brought into view.
        effect(() => { const id = Shell.selection.value[0]; mark(); if (!picking) reveal(id); }),
      ];
      return () => { offs.forEach(f => f()); sized.disconnect(); unstage(); preact.render(null, bar); table?.destroy(); table = null; el = cells = bar = null; };
    },
    focus,
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

  return { model, paste, focus, get grid() { return table; } };
})();
