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
  // (What's asked of how it looks, a sort, a filter, a group or what's kept in view, is a step Undo can take where it takes looks.)
  const LOOKS = { sort: 'Sorted', filters: 'Filtered', group: 'Grouped', frozen: 'Froze columns of' };
  function setLook(view, patch) {
    const was = Shell.store.get(lookKey(view)), l = { ...lookOf(view), ...patch };
    for (const k of Object.keys(l)) if (l[k] === undefined || l[k] === null || (typeof l[k] === 'object' && !Object.keys(l[k]).length)) delete l[k];
    const now = Object.keys(l).length ? JSON.stringify(l) : null, asked = !('widths' in patch) && Object.keys(LOOKS).find(k => k in patch);
    Shell.store.set(lookKey(view), now);
    looked.value++;
    if (asked && (was ?? null) !== now) { const back = to => () => { Shell.store.set(lookKey(view), to); looked.value++; viewed.value++; rebuild(); }; App.lookStep?.(`${LOOKS[asked]} ${viewOf(view)?.name ?? 'the table'}`, back(was), back(now)); }
    return l;
  }
  const looked = Shell.signal(0);
  const frozenOf = l => l.frozen ?? 1;
  // The columns shown and hidden are a look too (dendra.md, Workbook): a column's key and whether it shows, per view, over what
  // the view's own Shown notes say, till Keep makes them the view's. In Editing and Viewing alike, in no log.
  const viewed = Shell.signal(0);
  const shownAs = new Map();
  const shownIn = view => { if (shownAs.get(view)?.n !== viewed.peek()) shownAs.set(view, { n: viewed.peek(), l: lookOf(view).shown ?? null }); return shownAs.get(view).l; };
  function putColumns(view, shown) { setLook(view, { shown }); viewed.value++; }
  function seeColumns(view, cs, on, say) {
    const was = lookOf(view).shown, now = { ...was };
    for (const c of cs) now[c.key] = on;
    if (JSON.stringify(was ?? {}) === JSON.stringify(now)) return true;
    putColumns(view, now);
    const words = say ?? `${on ? 'Showed' : 'Hid'} ${cs.length === 1 ? (cs[0].title ?? 'Why') : `${cs.length} columns`} in ${viewOf(view)?.name}`;
    App.lookStep(words, () => putColumns(view, was), () => putColumns(view, now));
    Shell.toast(words, { undo: App.undoLook, ms: 2500 });
    return true;
  }
  const seenAs = (view, c) => c.pattern ? shownIn(view)?.[c.key] : undefined;

  // A tag's cell where its rule hasn't tested the record (Formulas.notTested): its own value, apart from Yes, No and blank.
  const NA = 'n/a';
  // Where it applies and what it reads is blank: its own value, apart from all of those (dendra.md, Definitions: Can't say).
  const CANT = 'Can’t say';
  // How a column's values compare, as its sort, its filter's list and its groups put them: numbers and dates as such,
  // a choice in its options' order, a tag Yes first, then No, then can't say, then n/a, text and names as words, figures in them as numbers.
  function compare(c) {
    const at = v => { const i = c.options?.indexOf(v) ?? -1; return i < 0 ? Infinity : i; };
    return (a, b) => {
      if (a === NA || b === NA) return (a === NA) - (b === NA);
      if (a === CANT || b === CANT) return (a === CANT) - (b === CANT);
      if (typeof a === 'number' && typeof b === 'number') return a - b;
      if (typeof a === 'boolean' && typeof b === 'boolean') return b - a;
      const i = at(a), j = at(b);
      return i !== j ? (i < j ? -1 : 1) : String(a).localeCompare(String(b), 'en', { numeric: true, sensitivity: 'base' });
    };
  }
  // …and blank last, whichever way it's sorted.
  const sorter = c => { const cmp = compare(c); return (a, b, _a, _b, _c, dir) => blank(a) || blank(b) ? (blank(a) - blank(b)) * (dir === 'desc' ? -1 : 1) : cmp(a, b); };
  // What sorting a column is called, as Excel calls it for what it holds.
  const SORTS = { number: ['smallest first', 'largest first'], date: ['oldest first', 'newest first'], tag: ['Yes first', 'No first'] };
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
  // What a column holds, from its specifications: the commonest type, and a choice's options in their list's order (Notes.optionsOf).
  function typed(c, specs, N = App.notes.value) {
    const types = specs.map(t => 'field' in t.out ? t.out.field : 'choice' in t.out ? 'choice' : 'tag');
    const type = types.sort((a, b) => types.filter(x => x === b).length - types.filter(x => x === a).length)[0];
    return { ...c, type, options: N.optionsOf(specs) };
  }
  // A record's lists of relatives as columns (dendra.md, Views: Columns): each list a relation of two sides makes, of the
  // schema's, one side at the row's record (or at an entry down from it: a Principal at its Jurisdiction), named as its
  // panel names it (Registered Agents, Owners, Holdings); its cells the other side's names. Its pattern is the relation's,
  // with the side listed its param, as a relation's side is a column; its documents are the record's documents, not a list.
  const shape = t => t.args ? { args: t.args.map(a => ({ edge: a.edge, loc: shape(a.loc) })) } : {};
  function listColumns(S, base, N, up) {
    const root = loc => loc.args ? root(loc.args[0].loc) : loc.kind;
    const pathTo = loc => !loc.args ? (loc.kind !== undefined && same(loc.kind, base.kind) ? [] : null) : loc.args.length === 1 ? (p => p && [...p, loc.args[0].edge])(pathTo(loc.args[0].loc)) : null;
    const docs = new Set(Object.values(S).filter(s => s.out?.field === 'document' && s.args?.length === 1 && s.args[0].loc.kind !== undefined).map(s => norm(s.args[0].loc.kind)));
    const lists = new Map();
    for (const s of Object.values(S)) if (s.args?.length === 2 && s.out && !('field' in s.out)) for (const mine of s.args) {
      const other = s.args.find(a => a !== mine), minePath = pathTo(mine.loc), kind = root(other.loc);
      if (!minePath || kind === undefined || docs.has(norm(kind))) continue;
      const pattern = N.relationPattern(s), title = N.listName(pattern, other.edge), k = Tree.key(pattern) + '|' + norm(other.edge);
      if (!lists.has(k)) lists.set(k, { key: '~' + norm(title), title, type: 'list', pattern, param: other.edge, mine: mine.edge, other: other.edge, minePath, up,
        otherLoc: shape(other.loc), kinds: new Set(), kindNames: [], base: [Infinity, Infinity, Infinity], fx: !!N.resolve('Formula', pattern), choice: false,
        reach: N.name(other.loc), holds: N.name(pattern) });
      const c = lists.get(k);
      if (!c.kinds.has(norm(kind))) { c.kinds.add(norm(kind)); c.kindNames.push(kind); }
      // A side that's a relation (Evidence's Evidenced) is read in the cell by its place, and can't be named there.
      if ('choice' in s.out || other.loc.args?.length > 1) c.choice = true;
    }
    // Two lists of one name are told apart by the side they're seen from; of one side, by what they reach, as their
    // headings and the Columns list say (Entity › Agents, Investor Group › Agents).
    const out = [...lists.values()], alike = () => { const n = new Map(); for (const c of out) n.set(c.key, (n.get(c.key) ?? 0) + 1); return k => n.get(k) > 1; };
    const sided = alike();
    for (const c of out) if (sided(c.key)) c.key += '|' + norm(c.mine);
    const reached = alike();
    for (const c of out) if (reached(c.key)) { c.key += '|' + norm(c.reach); c.parent = c.reach; c.told = [c.reach, c.title]; }
    return out;
  }
  // A record as a cell names it: an object by its name; a relation, which has none, by the place rule and what it is
  // (Margaret A. Chen → Cayman GP, Director; Holdco → Blocker, 100%).
  function saidOf(st, id, N = App.notes.peek()) {
    const r = st[id];
    if (!r?.args) return N.nameOf(st, id);
    const at = (Tree.index(st).entries.get(id) ?? []).map(e => st[e]), amount = at.find(e => NUMERIC.has(e.field));
    const what = 'choice' in r ? r.choice : at.find(e => 'choice' in e)?.choice ?? (amount && Tree.format(amount.field, amount.value));
    return `${N.segmentOf(st, id)}${what ? `, ${what}` : ''}`;
  }
  // The relatives a list's cell names, at the record its side is at: each relation of it held there, by the other side's name.
  const relativesIn = (st, at, c, N = App.notes.peek()) => (Tree.index(st).relations.get(at) ?? []).flatMap(rid => {
    const r = st[rid];
    if (r.args?.length !== 2 || r.tag === false) return [];
    const mine = r.args.find(a => a.at === at && same(a.edge, c.mine)), other = mine && r.args.find(a => a !== mine && same(a.edge, c.other));
    const obj = other && Tree.objectOf(st, other.at);
    return obj && Tree.fits(st, rid, c.pattern) ? [{ rid, obj, name: saidOf(st, obj, N) }] : [];
  }).sort((a, b) => a.name.localeCompare(b.name));
  // The record a record is of: the object it's in; for one in a relation (a tax year's), the object its sentence begins with.
  function ownerOf(st, id, N) {
    const top = Tree.objectOf(st, id), r = st[top];
    if (!r?.args) return top;
    const t = Tree.treeOf(st, top), e = t && N.edges(t)[0], a = r.args.find(x => same(x.edge, e ?? '')) ?? r.args[0];
    return Tree.objectOf(st, a.at);
  }
  // Names as a list's cell holds them, each on its own or after a semicolon.
  const namesIn = raw => String(raw ?? '').split(/[;\n]/).map(clean).filter(Boolean);

  // ---- What's scheduled: read off the log, what starts, ends or changes after the day shown, which the chart as of that day
  // doesn't show: each { id, day, what, whose, owner }. A record or relation not in the chart then that holds later, from
  // the first day it does, as its start entry says it where that's the day (Formation Date), or else "Ownership starts"; one
  // whose rows end later; a value at what the chart has now, from a later day, as a transfer's part is ("Percentage changes
  // to 41%"). Kept while the log and the day stand ----
  let scheduling = null;
  function scheduled() {
    const wb = App.shown.peek(), c = App.chart.peek(), day = App.day.peek(), version = App.version.peek();
    if (scheduling?.wb === wb && scheduling.c === c && scheduling.day === day && scheduling.version === version) return scheduling.out;
    const N = App.notes.peek(), entered = App.entered.peek(), rows = wb.rows(c).filter(r => 'record' in r), by = new Map(), out = [], then = new Map();
    for (const r of rows) (by.get(r.record) ?? by.set(r.record, []).get(r.record)).push(r);
    const asOf = d => then.get(d) ?? then.set(d, wb.asOf(c, d)).get(d);
    // What the chart keeps off its first page (a tax year, a document) is no event of the structure's.
    const page = App.views.peek().find(v => v.layout === 'chart')?.id, kept = o => !page || N.value('Shown', { kind: o.kind }, page) !== false;
    const onPage = (recs, id) => { const r = recs[id]; return r.args ? r.args.every(a => kept(recs[Tree.objectOf(recs, a.at)] ?? {})) : !Tree.isObject(r) || kept(r); };
    const put = (id, on, what, recs = asOf(on), starts = false) => { if (recs[id]) out.push({ id, day: on, what, starts, onPage: onPage(recs, id), whose: Time.whose(recs, recs[id].args || Tree.isObject(recs[id]) ? id : recs[id].at, N), owner: N.shortOf(recs, ownerOf(recs, id, N)) }); };
    const asked = (recs, id) => Tree.isObject(recs[id]) ? recs[id].kind : N.nameOf(recs, id);
    for (const [id, rs] of by) {
      const r = rs[0];
      if (Tree.isObject(r) || r.args?.length > 1) {
        if (!entered[id]) {
          const on = App.heldFrom(id, day);
          if (on) put(id, on, rows.find(x => x.at === id && x.field === 'date' && x.value === on)?.edge ?? `${asked(asOf(on), id)} starts`, asOf(on), true);
        } else {
          const now = rs.find(x => Log.validOn(x, day));
          if (now?.before && !rs.some(x => x.since === now.before)) put(id, now.before, `${asked(entered, id)} ends`, entered);
        }
      } else if (entered[r.at] && r.field !== 'date') for (const x of rs) if (x.since > day && 'field' in x) put(id, x.since, `${x.edge} changes to ${Tree.format(x.field, x.value)}`);
    }
    out.sort((a, b) => a.day.localeCompare(b.day));
    scheduling = { wb, c, day, version, out };
    return out;
  }
  // A reason, once per working-out: a table's Why asks every row's at every change.
  const reasons = new WeakMap();
  const reasonIn = (R, id, say) => { const m = reasons.get(R) ?? reasons.set(R, new Map()).get(R); if (!m.has(id)) m.set(id, say(id)); return m.get(id); };
  // A table's own order of its columns, where the view doesn't place them: as its entries are ordered, then by name.
  function ownOrder(a, b) {
    for (let i = 0; i < Math.max(a.base.length, b.base.length); i++) { const d = (a.base[i] ?? -2) - (b.base[i] ?? -2); if (d) return d; }
    return a.key.localeCompare(b.key);
  }
  // Months as Dates has them: what's overdue first, then from this month on, then back from it.
  const monthsIn = (gs, month) => { const keys = [...new Set(gs)], ahead = keys.filter(k => k !== 'overdue' && k >= month).sort(), past = keys.filter(k => k !== 'overdue' && k < month).sort().reverse();
    return [...(keys.includes('overdue') ? ['overdue'] : []), ...ahead, ...past]; };
  // Rows stay under the cursor (dendra.md, A table view). Saved, a value re-sorts nothing, as the grid's own rows keep their
  // place through an edit; but a date has a place by its day, its month's group and its order there, so a row that would
  // go elsewhere, here or anywhere in Dates, stays where it stood, each by the group and the day it had, till the grid is
  // left: another view, another day, or a record selected from outside it.
  let still = null, stillIn = null, stillAt = null, stillVersion = null;
  function holdRows(view) {
    const v = App.version.peek(), at = `${view}|${App.chart.peek()}|${JSON.stringify(Shell.time.peek())}`;
    if (stillAt !== at) { still = null; stillIn = view; stillAt = at; }
    else if (!still && stillVersion !== v && real?.view === view && real.rows === 'date' && real.data[0]?._g !== undefined && !real.named) still = new Map(real.data.map(r => [r.id, { g: r._g, at: r._at }]));
    stillVersion = v;
  }
  function letGo() { if (still) { still = null; rebuild(); } }
  // What's ended by the day shown, of records and relations (dendra.md, A table view): each { id, day, last, then }, then the chart as of its
  // last day. Kept while the log and the day stand.
  let ending = null;
  function endedBy() {
    const wb = App.shown.peek(), c = App.chart.peek(), day = App.day.peek(), version = App.version.peek();
    if (ending?.wb === wb && ending.c === c && ending.day === day && ending.version === version) return ending.out;
    const entered = App.entered.peek(), seen = new Set(), out = [], then = new Map(), asOf = d => then.get(d) ?? then.set(d, wb.asOf(c, d)).get(d), rows = wb.rows(c).filter(r => 'record' in r);
    // (Only what could have ended by then: what has an end on or before the day, or stands at or on what has, as a relation does at a side dissolved. Of a chart seen long before it's made, that's little, however much isn't there yet.)
    const stopped = new Set(rows.filter(r => r.before && r.before <= day).map(r => r.record)), ends = new Set(App.notes.peek().notes('End').map(n => norm(n.pattern.args?.[0]?.edge ?? '')));
    for (const r of rows) if (r.field === 'date' && r.at && r.value <= day && ends.has(norm(r.edge ?? ''))) stopped.add(r.at);
    for (let grew = true; grew;) { grew = false; for (const r of rows) if (!stopped.has(r.record) && (r.at ? stopped.has(r.at) : Tree.argsOf(r).some(a => stopped.has(a.at)))) { stopped.add(r.record); grew = true; } }
    for (const r of rows) if (stopped.has(r.record) && !seen.has(r.record) && (Tree.isObject(r) ? r.kind !== 'View' : r.args?.length > 1) && !entered[r.record]) {
      seen.add(r.record);
      const off = App.heldUntil(r.record, day);
      if (off) out.push({ id: r.record, day: off.day, last: off.last, then: asOf(off.last) });
    }
    ending = { wb, c, day, version, out };
    return out;
  }
  function model(view, R = App.computed.value, S = App.schema.value, look = lookOf(view), rows = viewOf(view)?.rows) {
    let st = R.records;
    const N = App.notes.value;
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
      // Who's on the hook for a date, where the chart says: its own record's Responsible, or else that of what it's of.
      if (rows === 'date' && ids.some(id => App.responsible(id, st))) trail.push({ key: '$resp', title: 'Responsible', type: 'text', shown: true });
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
    // What's ended, which a table as of a day leaves out, says how many; asked for, its rows are read as of its last day, faint.
    const endedHere = isDatatype || R !== App.computed.value ? [] : endedBy().filter(e => e.then[e.id] && (isKind ? same(e.then[e.id].kind ?? '', rows.kind) : !!e.then[e.id].args && Tree.fits(e.then, e.id, rows)));
    const endedOn = new Map();
    if (look.ended && endedHere.length) {
      st = { ...st };
      for (const e of endedHere) {
        const I = Tree.index(e.then), put = x => { if (!e.then[x] || x in st) return; st[x] = e.then[x]; (I.entries.get(x) ?? []).forEach(put); Tree.argsOf(e.then[x]).forEach(a => put(a.at)); };
        put(e.id);
        ids = [...ids, e.id];
        endedOn.set(e.id, e.day);
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
      if (!base.args) cols.push(...listColumns(S, base, N, up));
      // In the view, Order places a column and Shown shows it; by default every entry at the row shows, and no list, nor
      // a tag a Check note covers: a check is marked where it fails, on its row, and only shows as a column ticked.
      for (const c of cols) {
        const o = c.pattern && N.resolve('Order', c.pattern, view, c.param);
        c.place = o?.note.view === view ? o.value : Infinity;
        c.check = c.type === 'tag' && !!c.specs?.some(s => N.check(s));
        const said = c.pattern ? N.value('Shown', c.pattern, view, c.param) : undefined;
        c.shown = !c.pattern || (seenAs(view, c) ?? said ?? (c.type !== 'list' && !c.check && (!!c.param || c.path.length === 1)));
      }
      cols.sort((a, b) => a.place - b.place || ownOrder(a, b));
      // Beside a row's Name, its link says where the document is filed rather than its name again.
      if (isKind && cols.some(c => c.path?.length === 1 && same(c.title, 'Name'))) for (const c of cols) if (c.type === 'document' && c.path.length === 1) c.filed = true;
    }
    // Why: a table of what's worked out, deadlines among dates or a relation a formula gives, can show why each row holds,
    // in words, after the rest unless it's moved. It's the view's own column: a Shown note at the view, Why its param.
    let why = null;
    if (rows === 'date' || (!isKind && !isDatatype && Object.values(S).some(t => t.args?.length > 1 && Tree.narrower(t, rows) && N.resolve('Formula', t)))) {
      const pattern = { id: view, kind: 'View' }, o = N.resolve('Order', pattern, view, 'Why');
      why = { key: '$why', title: 'Why', type: 'text', pattern, param: 'Why', place: o?.value ?? Infinity, base: [Infinity] };
      why.shown = (seenAs(view, why) ?? N.value('Shown', pattern, view, 'Why')) === true;
    }
    if (why && base) { const at = cols.findIndex(c => c.place > why.place); cols.splice(at < 0 ? cols.length : at, 0, why); }
    cols = [...lead, ...cols, ...trail, ...(why && !base ? [why] : [])];
    const said = id => R === App.computed.value ? FormulaBar.because(id) : FormulaBar.sentenceIn(R, id);

    // Each cell: the record there, if any, and where one would go.
    const cellOf = (row, c) => {
      if (c.key === '$why') return { v: c.shown ? reasonIn(R, row, said) || undefined : undefined };
      if (c.type === 'edge') {
        const a = st[row].args.find(x => same(x.edge, c.edge));
        return { at: a?.at, v: a ? saidOf(st, Tree.objectOf(st, a.at), N) : undefined };
      }
      if (c.key === '$out') return { id: row, at: null, v: valueOf(st[row]) };
      if (c.key === '$value') return { id: row, at: st[row].at, v: st[row].value };
      if (c.key === '$entry') return { v: N.nameOf(st, row) };
      if (c.key === '$of') { const o = ownerOf(st, st[row].args ? row : st[row].at, N); return { v: Time.whose(st, st[row].args ? row : st[row].at, N), group: N.shortOf(st, o), gid: o }; }
      if (c.key === '$resp') return { v: App.responsible(row, st)?.short };
      let at = c.up ? st[row].at : row;
      if (c.type === 'list') {
        for (const e of c.minePath) at = entryAt(st, at, e);
        const rels = at ? relativesIn(st, at, c, N) : [];
        return { at, v: rels.length ? rels.map(x => x.name).join('; ') : undefined, names: rels.map(x => x.name), rels: rels.map(x => x.rid) };
      }
      for (const e of c.path.slice(0, -1)) at = entryAt(st, at, e);
      const id = entryAt(st, at, c.path.at(-1));
      return { id, at, v: valueOf(st[id]) };
    };
    // The checks failing at each record, by their labels: in it, a record ruled out where a Check note says that's a problem.
    const fails = new Map();
    if (R === App.computed.value) for (const a of App.needs.value) if (a.kind === 'error' && !a.error && st[a.id]) { const o = Tree.objectOf(st, a.id); fails.set(o, [...new Set([...(fails.get(o) ?? []), st[a.id].edge])]); }
    // A blank said not to be ours reads so.
    const notOurs = new Set(App.blanksApart.value.filter(b => !b.ours).map(b => `${b.id}|${norm(b.edge)}`));
    const wanting = new Map((R.errors ?? []).filter(e => e.at && e.error.code === '#N/A').map(e => [`${e.at}|${Tree.norm(e.args?.[0]?.edge ?? '')}`, e]));
    const today = App.day.value, data = ids.map(id => {
      const row = { id, _m: {}, _red: null };   // _red: 'add' or 'go' while a change is pending (redlined)
      if (endedOn.has(id)) row._ended = endedOn.get(id);
      for (const c of cols) {
        const m = cellOf(id, c), r = m.id && st[m.id], f = field(c), type = typeIn(c, r);
        // A tag no row has said: what it can't say, for want of a value, or what its definition's silence says (Formulas.silence).
        const cant = c.type === 'tag' && !r && m.at ? wanting.get(`${m.at}|${Tree.norm(c.path.at(-1))}`) : null, quiet = c.type === 'tag' && !r && m.at && !cant ? Formulas.silence(N, S, st, m.at, c.path.at(-1)) : null;
        if (cant) m.cant = cant;
        row[f] = cant ? CANT : quiet === 'untested' ? NA : m.v ?? null;
        // The engine says what it worked out, and what entered it also covers; a date a formula gives is a deadline.
        // A value of another datatype than its column's reads as its own.
        const fx = !!R.computed?.[m.id] || (!!m.rels && (c.fx || m.rels.some(x => R.computed?.[x]))), cov = !!R.covered?.[m.id], over = R.covered?.[m.id]?.agrees === false;
        // What's coming stands beside the value it'll replace (dendra.md, Time).
        const next = c.type !== 'tag' && m.id && App.shown.value.item(App.chart.value, m.id).find(x => x.since > today);
        row._m[f] = { id: m.id, at: m.at, fx, over, ...(m.cant && { cant: m.cant }), due: (fx || cov) && r?.field === 'date' && r.value < today, ...(notOurs.size && m.v == null && c.title && notOurs.has(`${c.up ? st[id]?.at : id}|${norm(c.title)}`) && { notours: true }), ...(next && { next: Tree.comingText(next) }), ...(type !== c.type && { type }), ...(m.rels && { names: m.names, rels: m.rels }), ...(m.group && { group: m.group, gid: m.gid }), ...(quiet && quiet !== 'untested' && { quiet }) };
      }
      row._ruled = st[id].tag === false;
      row._fails = fails.get(id) ?? null;
      return row;
    });
    // What's scheduled is among a list of dates' deadlines, by its day, as no entry there is; and a table of records says
    // which of its rows start later (Tools).
    let later = [];
    if (rows === 'date') { if (cols.some(c => c.key === '$of')) for (const s of scheduled()) if (s.onPage) data.push({ id: `later:${s.id}:${s.day}:${s.what}`, _rec: s.id, _red: null, _ruled: false, _fails: null, 'f:$value': s.day, ...(cols.some(c => c.key === '$entry') && { 'f:$entry': s.what }), 'f:$of': s.whose,
      _m: { 'f:$value': {}, 'f:$entry': {}, 'f:$of': { group: s.owner } } }); }
    else if (!isDatatype) {
      const wb = App.shown.peek(), c = App.chart.peek(), then = s => wb.asOf(c, s.day);
      later = scheduled().filter(s => s.starts && (isKind ? same(then(s)[s.id].kind ?? '', rows.kind) : !!then(s)[s.id].args && Tree.fits(then(s), s.id, rows)))
        .map(s => ({ id: s.id, day: s.day, name: isKind ? N.nameOf(then(s), s.id) : s.whose }));
    }
    // Dates fall into months, with what's overdue first, then from this month on, then back from it; grouped by a column
    // instead (whose, or what falls due), each group's by its days.
    let groups = null, named = null;
    const f0 = cols[0] && field(cols[0]), by = cols.find(c => c.key === look.group);
    if (rows === 'date' && by) data.sort((a, b) => a[f0].localeCompare(b[f0]));
    else if (rows === 'date') {
      // (A row a change has just moved stays where it was, till the grid's left: holdRows.)
      const month = today.slice(0, 7), held = view === stillIn ? still : null;
      for (const r of data) { const k = held?.get(r.id); r._g = k?.g ?? (r._m[f0].due ? 'overdue' : Tree.firstDay(r[f0]).slice(0, 7)); r._at = k?.at ?? r[f0]; }
      groups = monthsIn(data.map(r => r._g), month);
      const at = new Map(groups.map((g, i) => [g, i]));
      data.sort((a, b) => at.get(a._g) - at.get(b._g) || (a._g < month ? b._at.localeCompare(a._at) : a._at.localeCompare(b._at)));
    // (The row being typed stays where it's typed, under the rest, till it's left.)
    } else if (f0) data.sort((a, b) => (a.id === keeping) - (b.id === keeping) || text(typeOf(cols[0], a), a[f0]).localeCompare(text(typeOf(cols[0], b), b[f0])));
    // Grouped by a column, the rows fall under its values, in the order it sorts them, Blank last.
    // Whose a date is, grouped, is the record it's of: AIV-1, for its annual tax and its Delaware franchise tax alike. A
    // group that's one record (a side's, the Name's, whose a date is) is that record's, as its checks say (`grec`).
    let grec = null;
    if (by) {
      const f = field(by), cmp = sorter(by), seen = new Map(), gv = r => r._m[f]?.group ?? r[f];
      for (const r of data) { r._g = blank(gv(r)) ? BLANK : JSON.stringify(gv(r)); if (!seen.has(r._g)) seen.set(r._g, r); }
      const firsts = [...seen.values()].sort((a, b) => cmp(gv(a), gv(b), null, null, null, 'asc'));
      groups = firsts.map(r => r._g);
      named = new Map(firsts.map(r => [r._g, r._g === BLANK ? 'Blank' : r._m[f]?.group ?? text(typeOf(by, r), r[f])]));
      const recOf = r => by.type === 'edge' ? r._m[f]?.at && Tree.objectOf(st, r._m[f].at) : r._m[f]?.gid ?? (isKind && by.path?.length === 1 && same(by.title, 'Name') ? r.id : null);
      grec = new Map(firsts.map(r => [r._g, recOf(r)]));
    }

    const noun = (isDatatype ? Tree.DATATYPES[rows] : isKind ? rows.kind : N.name(rows)).toLowerCase();
    const m = { view, rows, isKind, isDatatype, base, cols, byField: new Map(cols.map(c => [field(c), c])), data, groups, named, grec, fails, later, noun,
      ended: endedHere.map(e => ({ id: e.id, day: e.day, name: isKind ? N.nameOf(e.then, e.id) : Time.whose(e.then, e.id, N) })) };
    entitle(m);
    return m;
  }
  // A column's field in the grid's rows: its own key, so a column added or hidden beside it never moves it.
  const field = c => 'f:' + c.key;
  // A column's heading, in the grid and in the file alike: its own name, where no other column of the table reads alike,
  // shown or not; else as much of its path as tells it from those (Jurisdiction › File Number, as Regulation D Offering has
  // one too), the shortest end of it that ends no other's.
  function entitle(m) {
    const paths = m.cols.map(c => c.path ?? [c.title]), keys = paths.map(p => p.map(norm));
    const ends = (a, b, k) => b.length >= k && a.slice(-k).join('›') === b.slice(-k).join('›');
    m.cols.forEach((c, i) => {
      if (c.told) { c.head = c.told; return; }
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
      // Under a change pending a row stays in the group it's in, so the grid holds still as it's previewed.
      return { ...r, _m, _fails: w._fails, ...(w._g !== undefined && { _g: w._g, _at: w._at }) };
    });
    const kept = new Set(then.data.map(r => r.id));
    for (const w of now.data) if (!kept.has(w.id)) data.push({ ...w, _red: 'go' });
    const used = new Set(data.map(r => r._g));
    const groups = !then.groups ? null : then.rows === 'date' && !then.named ? monthsIn([...used], App.day.peek().slice(0, 7))
      : [...then.groups, ...(now.groups ?? []).filter(g => !then.groups.includes(g))].filter(g => used.has(g));
    return { ...then, data, groups, red: true, fails: now.fails, ...(then.named && { named: new Map([...(now.named ?? []), ...then.named]), grec: new Map([...(now.grec ?? []), ...(then.grec ?? [])]) }) };
  }
  const isRed = r => !!r._red || Object.values(r._m).some(m => 'was' in m);
  // Values typed, pending, in their rows as they were typed, whatever the day they're from: one from a later day changes
  // nothing as of the day shown, but it's still what's waiting, and it's not to be typed twice.
  function typedIn(m, now, typed) {
    let out = null;
    for (const t of typed) if (!t.out.args) for (const d of now.data) for (const c of now.cols) {
      const f = field(c);
      if (d._m[f]?.id !== t.id) continue;
      const rows = (out ?? m).data, i = rows.findIndex(r => r.id === d.id), row = rows[i], x = row?._m[f], v = valueOf(t.out);
      if (!x || 'was' in x || row[f] === v) continue;
      out ??= { ...m, red: true, data: m.data.slice() };
      out.data[i] = { ...row, [f]: v, _m: { ...row._m, [f]: { ...x, was: d[f] ?? null } } };
    }
    return out ?? m;
  }
  // The schema as a pending change would leave it, so a heading pasted that the chart hasn't got is a column.
  function schemaWith(p) {
    const S = App.schema.value, recs = p.change.records ?? {};
    const ts = Object.keys(recs).filter(id => recs[id]).map(id => Tree.treeOf(p.R2.records, id)).filter(Boolean).map(Tree.specOf);
    return ts.every(t => S[Tree.key(t)]) ? S : Tree.schema([...Object.values(S), ...ts]);
  }

  // ---- How cells read, copy and edit ----
  const NUMERIC = new Set(['number', 'percent', 'money']);
  const text = (type, v) => v === null || v === undefined ? '' : v === NA || v === CANT ? v : type === 'tag' ? (v ? 'Yes' : 'No')
    : type === 'date' ? Tree.formatDate(v, 'short') : type === 'list' ? String(v) : Tree.format(type, v);
  // What a cell copies and exports as: a document as its address, so the link survives.
  const plain = (type, v) => type === 'document' ? String(v ?? '') : type === 'date' ? (v ? Tree.formatDate(v) : '') : text(type, v);
  const typing = (type, v) => v === null || v === undefined ? '' : type === 'date' ? Tree.formatDate(v) : type === 'document' ? String(v) : text(type, v);
  // Where a document is filed: its folder, else its library or host.
  const filed = v => { const l = Tree.linkOf(v); return l.folder ? l.folder.split('/').join(' › ') : l.library || l.host || l.short; };
  const YES = /^(yes|y|true|x|✓|✔|1)$/i, NO = /^(no|n|false|0)$/i;
  const meta = cell => cell.getRow().getData()._m[cell.getField()];
  // What's really at a cell, under what a change pending shows there.
  const atCell = cell => (current?.red && real?.data.find(r => r.id === cell.getRow().getData().id)?._m[cell.getField()]) || meta(cell);
  // A change pending of values typed, in the chart shown (App.put): the grid goes on being typed in, each going with it. Any
  // other keeps the grid as it would leave it, till it's made or discarded.
  const running = () => { const p = App.pending.peek(); return !!p?.typed && p.chart === App.chart.peek(); };
  const locked = () => !!current?.red && !running();

  // What a cell's marks mean, on hover: italic is worked out, the corner is typed over what's worked out, and n/a untested.
  function markTip(c, m, v) {
    if (v === NA) return 'Not tested: its rule doesn’t apply here';
    if (v === CANT) return FormulaBar.blankSaid(m.cant);
    if (m?.over) { const was = App.computed.peek().covered?.[m.id]?.value; return `Typed over what’s worked out, which is ${typeof was === 'boolean' ? (was ? 'Yes' : 'No') : was?.t === 'date' ? Tree.formatDate(was.iso, 'short') : typeof was === 'number' ? Tree.format(m.type ?? c.type, was) : was ?? 'nothing'}`; }
    return m?.quiet === 'no' ? 'No: worked out by a formula' : m?.quiet === 'fine' ? 'Nothing wrong: worked out by a formula' : m?.fx ? 'Worked out by a formula' : null;
  }
  function formatter(c) {
    // A tag's box, blank, attested or ruled out; or that it isn't tested.
    const box = (v, m) => v === NA ? `<span class="na">${NA}</span>` : v === CANT ? `<span class="cant">${CANT}</span>` : v === null ? '<span class="tag"></span>' : `<span class="tag ${v ? 'yes' : `no ${m?.id ? App.noTone(m.id) : ''}`}${m?.fx ? ' fx' : ''}${m && 'was' in m ? ' pend' : ''}"></span>`;
    const shown = (v, m, type = m?.type ?? c.type) => type === 'tag' ? box(v, m)
      : type === 'document' && v ? `<a href="${esc(SharePoint.href(v))}" target="_blank" rel="noopener" tabindex="-1">${esc(c.filed ? filed(v) : Tree.format('document', v))}</a>`
      : esc(text(type, v));
    return cell => {
      const el = cell.getElement(), m = meta(cell), v = cell.getValue(), tip = markTip(c, m, v);
      el.tabIndex = -1;   // the grid is one stop in the tab order, and the arrows move within it
      el.classList.toggle('fx', !!m?.fx);
      el.classList.toggle('over', !!m?.over);
      el.classList.toggle('due', !!m?.due);
      el.classList.toggle('none', c.type !== 'edge' && !c.key.startsWith('$') && !m?.at);
      // (What's blank, for Blanks to mark.)
      el.classList.toggle('empty', v === null && c.type !== 'tag' && !c.key.startsWith('$') && !m?.notours);
      if (m?.notours) return '<span class="notours">Not ours</span>';
      el.classList.toggle('pend', !!m && 'was' in m && c.type !== 'tag' && m.was !== null && v !== null);
      if (tip) el.dataset.tip = tip; else delete el.dataset.tip;
      el.classList.toggle('coming', !!m?.next && !('was' in m));
      if (m?.next && !('was' in m)) { if (!tip) el.dataset.tip = m.next; return `${shown(v, m)} <span class="nx">${esc(m.next)}</span>`; }
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
  // What's typed in a cell is shown whole, as Excel's is: the field runs on over the cells beside it, never scrolling its
  // first letters out of sight.
  function grow(input, cell) {
    const s = getComputedStyle(input), w = cell.getElement().offsetWidth;
    ruler.font = `${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
    input.style.width = `${Math.max(w, Math.ceil(ruler.measureText(input.value).width + parseFloat(s.paddingLeft) + parseFloat(s.paddingRight) + 4))}px`;
  }
  const editor = (c, put) => (cell, onRendered, success, cancel) => {
    const input = document.createElement('input');
    input.className = 'typed';
    input.value = typed0 ?? typing(typeOf(c, cell.getRow().getData()), cell.getValue());
    const first = typed0 !== null || atEnd;
    typed0 = null; atEnd = false;
    input.addEventListener('input', () => grow(input, cell));
    onRendered(() => { grow(input, cell); input.focus(); if (!first) input.select(); else input.setSelectionRange(input.value.length, input.value.length); });
    let done = false;
    const bad = () => { input.classList.add('bad'); input.dataset.why = Tree.notA(typeOf(c, cell.getRow().getData())); input.setAttribute('aria-invalid', 'true'); return false; };
    const keep = o => {
      if (done) return true;
      // (= begins a rule, as in Excel, and never the words: for a value of its own column, in the formula bar.)
      if (/^\s*=\s*\S/.test(input.value) && ruleTyped(cell, input.value)) { done = true; cancel(); return true; }
      if (!readable(cell, input.value)) return bad();
      done = true;
      cancel();
      put(cell, input.value, o);
      return true;
    };
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.stopPropagation(); if (!readable(cell, input.value)) return bad(); const cs = ranged; done = true; cancel(); fillWith(cell, input.value, cs); }
      else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); if (keep()) move(e.shiftKey ? 'up' : 'down'); }
      else if (e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); if (keep()) move(e.shiftKey ? 'left' : 'right'); }
      // F6 keeps it and goes on to the day it asks, where it asks one.
      else if (e.key === 'F6' && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); if (keep({ auto: true })) back(); }
      else if (e.key === 'Escape') { e.stopPropagation(); done = true; cancel(); back(); }
    });
    input.addEventListener('blur', () => { if (!keep()) { done = true; cancel(); } });
    return input;
  };
  // A choice's editor, as Excel's list is validated: what's typed finds its options, those it begins first, the first lit,
  // and Enter or Tab takes the one lit and moves on, as from text; Ctrl+Enter takes it into every cell of the range. Text
  // that finds none is never kept: it stays, outlined, "Not an option", till an option is picked or "New option: …", its
  // own item, never lit of itself, is chosen. A relation's side is one of the objects it can be, and nothing new. Esc puts
  // it back; leaving keeps only an option named whole, or nothing, which clears it.
  const chooser = c => (cell, onRendered, success, cancel) => {
    const input = document.createElement('input'), now = cell.getValue(), was = now === null || now === undefined ? '' : String(now);
    input.className = 'typed';
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-expanded', 'true');
    let typing = typed0 !== null;
    input.value = typed0 ?? was;
    const caret = typing || atEnd;
    typed0 = null; atEnd = false;
    const pop = Object.assign(document.createElement('div'), { className: 'float pick' }), list = Object.assign(document.createElement('div'), { className: 'menu' });
    list.setAttribute('role', 'listbox');
    pop.append(list);
    let done = false, lit = -1, items = [], wrong = null;
    const options = () => c.type === 'edge' ? objects(current, c) : c.options ?? [];
    function draw() {
      const q = clean(input.value), k = norm(q), opts = options();
      const found = !typing || !q ? opts : [...opts.filter(o => norm(o).startsWith(k)), ...opts.filter(o => !norm(o).startsWith(k) && norm(o).includes(k))];
      items = found.map(o => ({ label: o, value: o }));
      const none = !!q && typing && !found.length, fresh = c.type === 'choice' && !!q && typing && !opts.some(o => same(o, q));
      if (fresh) items.push({ label: `New option: ${q}`, value: q, fresh: true });
      lit = !typing ? found.findIndex(o => same(o, was)) : found.length ? 0 : -1;
      wrong = none && c.type === 'edge' ? otherKind(current, c.edge, q) : null;
      input.classList.toggle('bad', none);
      input.dataset.why = '';   // (Its list says why.)
      input.toggleAttribute('aria-invalid', none);
      paint(none);
    }
    function paint(none = input.classList.contains('bad')) {
      const said = none ? `<div class="menu-none">${esc(c.type === 'choice' ? 'Not an option' : wrong ?? 'No match')}</div>${items.length ? '<div class="menu-sep"></div>' : ''}` : '';
      list.innerHTML = said + items.map((it, i) => `<div class="menu-item${i === lit ? ' on' : ''}" role="option" aria-selected="${i === lit}" data-i="${i}"><span class="label">${esc(it.label)}</span></div>`).join('');
      list.querySelector('.menu-item.on')?.scrollIntoView({ block: 'nearest' });
      const r = cell.getElement().getBoundingClientRect(), h = pop.offsetHeight;
      Object.assign(pop.style, { left: `${Math.round(r.left)}px`, minWidth: `${Math.round(Math.max(r.width, 200))}px`,
        top: `${Math.round(r.bottom + 2 + h > innerHeight - 8 && r.top - 2 - h > 8 ? r.top - 2 - h : r.bottom + 2)}px` });
    }
    const close = () => { pop.remove(); removeEventListener('scroll', place, true); };
    const place = () => { if (input.isConnected) paint(); else close(); };
    // Taken, the cell is written as one typed in is (put), or every cell of the range (fillWith); left blank, it's cleared.
    const take = (value, then) => { if (done) return; done = true; close(); cancel(); if (then === 'fill') fillWith(cell, value, ranged); else { put(cell, value, then === 'day' ? { auto: true } : undefined); if (then && then !== 'day') move(then); else back(); } };
    const leave = () => { if (done) return; done = true; close(); cancel(); back(); };
    input.addEventListener('input', () => { typing = true; grow(input, cell); draw(); });
    input.addEventListener('keydown', e => {
      const q = clean(input.value), it = items[lit], go = e.key === 'Tab' ? (e.shiftKey ? 'left' : 'right') : e.shiftKey ? 'up' : 'down';
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); if (items.length) { lit = lit < 0 ? (e.key === 'ArrowDown' ? 0 : items.length - 1) : (lit + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; paint(); } }
      else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.stopPropagation(); if (it) take(it.value, 'fill'); }
      else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); if (it) take(it.value, go); else if (!q) take('', go); }
      else if (e.key === 'F6' && !e.shiftKey && it) { e.preventDefault(); e.stopPropagation(); take(it.value, 'day'); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); leave(); }
      else if (e.key === 'Home' || e.key === 'End' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') e.stopPropagation();
    });
    input.addEventListener('blur', () => { const q = clean(input.value), o = options().find(x => same(x, q)); if (o !== undefined && !same(o, was)) take(o); else if (!q && was) take(''); else leave(); });
    // Picked by the pointer, the field keeps the keys till it's taken.
    list.addEventListener('pointerdown', e => e.preventDefault());
    list.addEventListener('pointermove', e => { const i = +e.target.closest('.menu-item')?.dataset.i; if (i >= 0 && i !== lit) { lit = i; paint(); } });
    list.addEventListener('click', e => { const i = +e.target.closest('.menu-item')?.dataset.i; if (i >= 0) take(items[i].value, 'down'); });
    onRendered(() => {
      grow(input, cell);
      document.body.append(pop);
      draw();
      addEventListener('scroll', place, true);
      input.focus();
      if (caret) input.setSelectionRange(input.value.length, input.value.length); else input.select();
    });
    return input;
  };
  // After an edit, the active cell moves as Excel's does, and the grid keeps the keys: where the edit built the grid again
  // (an option new to its column), from the cell it puts back, once that's placed.
  function move(d, tries = 40) {
    setTimeout(() => {
      const sr = ready && table?.modules.selectRange;
      if (table && (!sr || (sr.activeRange && sr.activeRange.start?.row === undefined)) && tries) return move(d, tries - 1);
      if (tabbed && tabbed.table !== table) tabbed = table?.columnManager.findColumn(tabbed.field) || null;
      if (sr?.activeRange) {
        if (d === 'left' || d === 'right') { tabbed ??= sr.getActiveCell()?.column; step(d); }
        else { const col = d === 'down' ? tabbed : null; tabbed = null; step(d, col); }
      }
      back();
    }, tries < 40 ? 20 : 0);
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
    // A group's sums, each under its column (groupHead).
    let x = 0;
    for (const c of t.getColumns()) { if (!c.isVisible()) continue; const w = c.getWidth(); if (c.getField()) rules.push(`.grid .tabulator-group .gsum[data-f="${c.getField().replace(/["\\]/g, '\\$&')}"] { left: ${x}px; width: ${w}px; }`); x += w; }
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
    // (Its slot hidden as it's laid out, built as the window went to another view: it has no width to fit to, and is fitted once it shows: settle.)
    if (!w) { laid.delete(this.table); return; }
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

  const drawn = c => c.pasted || c.shown;
  // A heading: its name (under as much of its path as tells it from another's, entitle), a funnel while it's filtered,
  // which opens its filter, and the chevron that opens its menu, shown while it's pointed at.
  const FUNNEL = Shell.iconMarkup('filter'), CHEVRON = Shell.iconMarkup('chevron');
  const heading = c => `${c.head?.length > 1 ? `<span class="up">${esc(c.head.slice(0, -1).join(' › '))}</span>` : ''}<span class="t">${esc(c.title)}</span>`
    + `<span class="funnel" role="button" aria-label="Filter" data-tip="Filter">${FUNNEL}</span>`
    + `<button type="button" class="col-menu" tabindex="-1" aria-haspopup="menu" aria-label="${esc(c.title)}" data-tip="Column menu" data-keys="Alt+↓">${CHEVRON}</button>`;
  // (`widths`, by field: built again under a redline, a column keeps the width it had, so no width changes under a preview.)
  function columnDefs(m, look = lookOf(m.view), widths = null) {
    const defs = m.cols.filter(drawn).map(c => {
      const editable = c.type !== 'tag' && c.key !== '$entry' && c.key !== '$of' && c.key !== '$why' && c.key !== '$resp', right = NUMERIC.has(c.type) ? 'right' : 'left', width = widths?.get(field(c)) ?? look.widths?.[c.key];
      return {
        title: c.title, titleDownload: headed(c), field: field(c), minWidth: c.type === 'tag' ? 56 : 72, maxInitialWidth: 340, ...(width && { width }), ...(c.key === '$why' && { variableHeight: true }),
        titleFormatter: () => heading(c),
        hozAlign: right, headerHozAlign: right, cssClass: 'c-' + (c.key === '$why' ? 'why' : c.type === 'edge' ? 'edge' : c.type) + (look.filters?.[c.key] ? ' filtered' : '') + (look.sort?.key === c.key ? ' sorted' : ''),
        sorter: sorter(c),
        formatter: formatter(c),
        editable: cell => !App.readOnly.peek() && !locked() && !cell.getRow().getData()._ended && (c.type === 'list' ? !c.fx && !c.choice && !!meta(cell)?.at : c.type === 'edge' || !!meta(cell)?.at || c.key === '$out'),
        editor: !editable ? false : c.type === 'choice' || c.type === 'edge' ? chooser(c) : editor(c, put),
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
  const sideLocs = (m, edge) => Object.values(App.schema.value).filter(t => t.args?.length > 1 && Tree.narrower(t, m.rows)).flatMap(t => t.args.filter(a => same(a.edge, edge)).map(a => a.loc));
  function sideKindNames(m, edge) {
    const kinds = new Map(), root = loc => loc.args ? root(loc.args[0].loc) : loc.kind;
    for (const loc of sideLocs(m, edge)) if (root(loc) && !kinds.has(norm(root(loc)))) kinds.set(norm(root(loc)), root(loc));
    return [...kinds.values()];
  }
  const sideKinds = (m, edge) => new Set(sideKindNames(m, edge).map(norm));
  // A side that's a relation (what a document evidences) is one of that relation's records, by the place rule; nothing new
  // can be named into being there.
  const onRelation = (m, edge) => sideLocs(m, edge).some(l => l.args?.length > 1);
  function sideRecords(m, edge) {
    const st = App.state.value, ls = sideLocs(m, edge);
    return Object.keys(st).filter(id => st[id].args?.length > 1 && ls.some(l => Tree.fits(st, id, l))).map(id => ({ id, name: saidOf(st, id) })).sort((a, b) => a.name.localeCompare(b.name));
  }
  const objects = (m, c) => { const st = App.state.value; return onRelation(m, c.edge) ? sideRecords(m, c.edge).map(x => x.name) : [...sideKinds(m, c.edge)].flatMap(k => Tree.index(st).kinds.get(k) ?? []).map(id => App.notes.peek().nameOf(st, id)).sort(); };
  const objectsOf = (st, kinds) => [...kinds].flatMap(k => Tree.index(st).kinds.get(norm(k)) ?? []);
  // A name that reads as a record the chart has of another kind than a side or a list takes, said as what it is and what
  // this takes, so nothing new of the wrong sort is offered: "Fund III is an entity; this takes individuals". Else null.
  function wrongKind(kinds, names, name) {
    const st = App.state.value, N = App.notes.peek(), others = [...Tree.index(st).kinds.keys()].filter(k => k !== 'view' && !kinds.has(k)), id = name && find(st, name, others);
    if (!id) return null;
    const what = st[id].kind.toLowerCase(), takes = names.map(k => plural(k).toLowerCase());
    return `${N.shortOf(st, id)} is ${/^[aeiou]/.test(what) ? 'an' : 'a'} ${what}; this takes ${takes.length < 2 ? takes.join('') : `${takes.slice(0, -1).join(', ')} or ${takes.at(-1)}`}`;
  }
  // …of a relation's side.
  const otherKind = (m, edge, name) => onRelation(m, edge) ? wrongKind(new Set(), [...new Set(sideLocs(m, edge).map(l => App.notes.peek().name(l)))], name) : wrongKind(sideKinds(m, edge), sideKindNames(m, edge), name);
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
  const follow = (st, id, loc) => !loc.args || loc.args.length > 1 ? id : (x => x && entryAt(st, x, loc.args[0].edge))(follow(st, id, loc.args[0].loc));
  const sideLoc = (m, edge) => m.rows.args.find(a => same(a.edge, edge)).loc;

  // A group's header: its name and count, and under each column of numbers its rows' sum, as Excel's subtotal is (placed
  // under its column: pinned); red, the check's words on it, where the group is a record a check fails at, so Fund III's
  // owners at 101.6% are red at Fund III, beside its 101.6%.
  function groupHead(m, g, n, rows) {
    const name = m.named ? m.named.get(g) : g === 'overdue' ? 'Overdue' : Tree.formatDate(g + '-01', 'month'), fails = m.fails?.get(m.grec?.get(g));
    const sums = m.cols.filter(c => drawn(c) && NUMERIC.has(c.type)).map(c => {
      const vs = rows.map(d => d[field(c)]).filter(v => typeof v === 'number');
      return vs.length ? `<span class="gsum" data-f="${esc(field(c))}">${esc(Tree.format(c.type, +vs.reduce((s, v) => s + v, 0).toPrecision(12)))}</span>` : '';
    }).join('');
    return `<span class="gname${fails ? ' no' : ''}"${fails ? ` data-tip="${esc(fails.join(', '))}"` : ''}>${esc(name)}</span><span class="gn">${n}</span>${fails ? sums.replace(/class="gsum"/g, 'class="gsum no"') : sums}`;
  }
  // How far the grid is scrolled across is by what's there, not by how many pixels: the column at the edge of those kept in
  // view, how far into it, and those after it. So a column hidden before it moves nothing under the pointer, and one hidden
  // where it is gives way to the next, which never goes under those kept in view for it.
  function scrolled(t) {
    const h = t.rowManager.element, at = 48 + frozenWidth(t), cs = t.getColumns().filter(c => c.getField() && !PIN.test(c.getDefinition().cssClass));
    const i = Math.max(0, cs.findIndex(c => c.getElement().offsetLeft + c.getElement().offsetWidth - at > h.scrollLeft)), e = cs[i]?.getElement();
    return { left: h.scrollLeft, from: cs.slice(i).map(c => c.getField()), into: e ? h.scrollLeft - (e.offsetLeft - at) : 0 };
  }
  function rescroll(t, { left, from, into }) {
    const h = t.rowManager.element, f = left > 0 && from.find(x => t.getColumns().some(c => c.getField() === x && !PIN.test(c.getDefinition().cssClass)));
    h.scrollLeft = f ? t.getColumns().find(c => c.getField() === f).getElement().offsetLeft - (48 + frozenWidth(t)) + (f === from[0] ? into : 0) : 0;
  }
  function build(m) {
    // Built again in its view (a column shown, hidden or kept in view), the grid stays where it was scrolled, with what was
    // selected in it, by its records and columns (stay), and its headings as tall as they were, so a two-line heading hidden
    // moves no row under the pointer; in another, with nothing.
    const look = lookOf(m.view), h = table?.rowManager.element;
    const was = table && ready && built?.view === m.view ? { ...scrolled(table), top: h.scrollTop, tall: Math.max(...table.getColumns().map(c => c.getElement().offsetHeight)),
      fields: table.getColumns().map(c => c.getField()).filter(Boolean), pins: pinsOf(table).map(c => c.getField()), widths: new Map(table.getColumns().filter(c => c.getField()).map(c => [c.getField(), c.getWidth()])) } : null;
    if (!was) chosen = keeping = null;
    if (table) { table.destroy(); table = null; }
    ready = false;
    cells.replaceChildren();
    const host = document.createElement('div');
    cells.appendChild(host);
    built = { view: m.view, sig: signature(m) };
    // The rows redlined as built, so they're drawn again as they are once the redline goes.
    reds = new Set(m.red ? m.data.filter(isRed).map(r => r.id) : []);
    flight = null;
    const sorted = look.sort && m.cols.find(c => c.key === look.sort.key && drawn(c)), passes = gridFilter(m, look);
    const t = table = new Tabulator(host, {
      // A column is sized at its heading's edge, as Excel's is, and a row is only its cells. A field is a column's
      // key as it stands, dots and all. The grid is laid out again as settle says, not as Tabulator watches its size.
      index: 'id', data: m.data, columns: columnDefs(m, look, m.red ? was?.widths : null), columnDefaults: { resizable: 'header' }, nestedFieldSeparator: false, height: '100%', layout: 'fitDataSlack', autoResize: false,
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
        // A record a check fails at: its number red, the check's words on it.
        e.classList.toggle('fails', !!d._fails);
        const rn = e.querySelector('.tabulator-cell.rn');
        if (rn) { if (d._fails) rn.dataset.tip = d._fails.join(', '); else delete rn.dataset.tip; }
        e.classList.toggle('ended', !!d._ended);
        e.classList.toggle('picked', picked.has(d.id));
        e.classList.toggle('red-add', d._red === 'add');
        e.classList.toggle('red-go', d._red === 'go');
      },
      ...(m.groups && {
        groupBy: '_g', groupValues: [grouped(m, passes)], groupToggleElement: 'header',
        groupHeader: (g, n, rows) => groupHead(current ?? m, g, n, rows),
      }),
      ...(sorted && { initialSort: [{ column: field(sorted), dir: look.sort.dir }] }),
      ...(passes && { initialFilter: passes }),
    });
    if (was) host.style.setProperty('--heading', `${was.tall}px`);
    // Laid out, the grid draws its rows again from where it's scrolled, each drawn row measured at the columns'
    // new widths and the rest reckoned from them. Tabulator would measure every row, drawn or not, but go on
    // reckoning the rows it hasn't drawn from the rows first drawn, before the columns were laid out: rows a
    // narrow first column had wrapped, so the grid ran on three times its rows' height, blank.
    t.rowManager.normalizeHeight = function () { this.renderer.rerenderRows(); };
    t.on('cellEditCancelled', () => back());
    t.on('cellClick', (e, cell) => { if (e.target.closest('.tag, .cant') && !cell.getRow().getData()._ended) flip(cell); });
    t.on('rangeChanged', range => { remember(range); soon(); tally(); });
    t.on('rangeAdded', range => { remember(range); if (quiet.has(range)) quiet.delete(range); else soon(); tally(); });
    t.on('rangeRemoved', tally);
    t.on('dataSorted', sorters => { if (ready && t === table) keepSort(sorters); });
    t.on('columnMoved', () => placeColumns());
    // A width the user gives a column is kept, in this view.
    t.on('columnResized', col => { sized.delete(col._column); keepWidth(col); pinned(t); });
    t.on('headerContext', (e, col) => { e.preventDefault(); columnMenu({ x: e.clientX, y: e.clientY }, col); });
    t.on('rowContext', (e, row) => { e.preventDefault(); rowMenu(e, row); });
    // (A copy says what it took, as nothing on the grid shows it.)
    t.on('clipboardCopied', () => { const n = cellsOf().length; Shell.toast(`Copied ${n === 1 ? 'a cell' : `${n} cells`}`, { ms: 2500 }); });
    t.on('renderComplete', () => { regain(); strip(); });
    t.on('scrollVertical', strip);
    // What's selected is outlined only where the grid scrolls, never over the columns kept in view (table.css).
    t.on('scrollHorizontal', left => t.element.style.setProperty('--across', `${left}px`));
    for (const ev of ['dataFiltered', 'dataSorted', 'rowAdded', 'rowDeleted', 'groupVisibilityChanged']) t.on(ev, () => requestAnimationFrame(strip));
    // Filtered, sorted or grouped, what's selected follows its records (a moment later, once the rows are).
    t.on('dataFiltered', () => { looked.value++; setTimeout(stay); });
    t.on('dataSorted', () => setTimeout(stay));
    t.on('dataGrouped', () => setTimeout(stay));
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
      // Built again in its view, it stays where it was scrolled: bringing the record selected into view first would draw
      // the rows there, and being put back where it was, with no scroll for the rows to hear of, leave the grid blank.
      if (was) stay(); else reveal(Shell.selection.peek()[0]);
      regain();
      settle();
      if (was) { rescroll(t, was); t.rowManager.element.scrollTop = was.top; }
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
    const view = Shell.view.value, v = viewOf(view), p = FormulaBar.pending.value, q = App.pending.value, typed = q?.typed && q.chart === App.chart.peek() ? q.typed : null;
    if (!el || v?.layout !== 'table') return;
    // A grid is built and drawn only in its slot shown; asked for while it's hidden, it's done once the slot shows.
    owed = !el.offsetParent;
    if (owed) return;
    // What it shows is worked out from these: shown again with them as they were, the grid is as it was.
    // (The log's version among them: a change from a later day leaves the chart as of today as it was, but Dates lists it, and a cell says it's coming.)
    const from = [view, p, typed, App.version.value, App.computed.value, App.schema.value, App.notes.value, App.views.value, App.day.value, App.viewing.value, viewed.value];
    if (table && ready && !flight && drewFrom?.every((x, i) => x === from[i])) return settle();
    holdRows(view);
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
    if (typed) m = typedIn(m, now, typed);
    current = m;
    shownM.value = m;
    // Under a table whose rows are a kind's or a relation's, a row for a new one, where the chart can be changed.
    el.classList.toggle('adds', !m.isDatatype && !m.red && !App.readOnly.peek());
    el.classList.toggle('marks-blanks', !!lookOf(view).blanks);
    if (!table || built.view !== view || built.sig !== signature(m)) { drewFrom = from; since(now); return build(m); }
    if (!ready) return table.on('tableBuilt', () => refresh());
    if (!flight && !arrange(m)) { drewFrom = from; since(now); return build(m); }
    // One update at a time: another asked for meanwhile follows it.
    if (flight) { flight.again = true; return; }
    drewFrom = from;
    // Rows keep their place while they're edited; a sort or a filter applies again only when asked, or to rows that come
    // (an import's, a paste's: resort), or a row typed once it's left (leave). (Only a redlined grid has rows redlined.)
    // What's redlined comes into view as it begins, where the grid has the keys: a row that comes or goes; a value that changes,
    // only where no row is in hand. So a preview never takes the grid from the row being worked on, nor moves it for what's
    // being done elsewhere.
    const hand = Shell.selection.peek()[0], t = table, lit = p ? [] : since(now), red = new Set(m.red ? m.data.filter(isRed).map(r => r.id) : []), first = m.red && !reds.size && inside && !red.has(hand) && (m.data.find(r => r._red) ?? (inGrid(hand) ? null : m.data.find(isRed)))?.id;
    const f = flight = { again: false };
    // Only the rows that say something else are updated, as Tabulator measures every row it's given again; a row that
    // comes (back, by Undo, or pasted) goes where its records put it, after the row before it, not at the end.
    const had = new Map(t.getRows().map(row => [row.getData().id, row.getData()])), changed = m.data.filter(r => !sameRow(r, had.get(r.id)));
    const updated = changed.filter(r => had.has(r.id)), there = new Set(had.keys());
    // (A cell whose value stands isn't drawn again by that; one saying something else is coming is.)
    const ahead = updated.filter(r => Object.keys(r._m).some(f => r._m[f].next !== had.get(r.id)._m[f]?.next)).map(r => r.id);
    // Rows come: new to the grid, or made from the redline's (an import's, a paste's), which the sort then places.
    const came = m.data.some(r => !r._red && (!had.has(r.id) || had.get(r.id)._red === 'add'));
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
      // A row come after one the filters leave out is placed only among all the rows: the filters are run again, so it's
      // shown as they say (and the row being typed, as it is).
      if (t.getFilters().length && m.data.some(r => !had.has(r.id))) t.refreshFilter();
      for (const id of new Set([...reds, ...red, ...ahead])) rows.get(id)?.reformat();
      reds = red;
      t.restoreRedraw();
      ok = true;
    }).finally(() => {
      if (flight === f) flight = null;
      if (t !== table) return;
      if (!ok) return build(current);
      if (came) resort();
      // A group's sums and checks say what its rows now hold.
      if (m.groups) for (const g of t.getGroups()) g._group.generateGroupHeaderContents();
      // (A record selected from outside, a payment's in its row just come: the keys' cell goes with it, so the two never part.)
      const inHand = Shell.selection.peek()[0];
      if (!inside && !m.red && inGrid(inHand) && t.modules.selectRange?.getActiveCell()?.row.getData().id !== inHand) track(inHand);
      mark();
      if (first) reveal(first);
      flash(lit);
      regain();
      stay();
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
    const h = t.element.clientHeight, shrunk = h < (tall.get(t) ?? 0);
    // (Built with its slot hidden, it's never been fitted, and has no rows drawn to fit it to: it's drawn afresh.)
    if (laid.get(t) !== widthOf(t)) t.redraw(!laid.has(t));
    else if (tall.get(t) !== h) t.rowManager.redraw();
    else return;
    tall.set(t, h);
    // (The bar come up under it, the cell being typed down stays in view.)
    if (shrunk && running()) { const a = t.modules.selectRange?.getActiveCell(); if (a) reveal(a.row.getData().id); }
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
    // Pressed in the grid off the row being typed, it's left.
    if (keeping && inside && table?.getRows().find(x => x.getElement().contains(e.target))?.getData().id !== keeping) setTimeout(leave);
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
  // A cell being typed in has the keys itself (editor, chooser). While a change is pending, Enter is App's, which makes it.
  const canEdit = cell => { const d = cell.getColumn().getDefinition(); return !!d.editor && (typeof d.editable !== 'function' || d.editable(cell)); };
  let tabbed = null;   // the column a run of Tabs began in
  let ranged = null;   // the cells selected as a cell began to be typed in, which Tabulator narrows to that cell
  function first(e) {
    if (!table) return;
    const sr = table.modules.selectRange;
    if (table.modules.edit?.currentCell) return;
    if (e.target.closest?.('.tabulator-header')) return;
    // Esc from the cells drops what's waiting on the bar, as it does from the bar.
    if (e.key === 'Escape' && running()) { e.preventDefault(); e.stopPropagation(); App.discard(); return; }
    if (/^(Arrow|Page|Home$|End$|Tab$|Enter$|F2$)/.test(e.key) && !sr?.activeRange) { e.preventDefault(); e.stopPropagation(); activate(true); return; }
    // Down from the last row goes on to the new one under it.
    if (e.key === 'ArrowDown' && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && el?.classList.contains('adds') && shownRows().at(-1)?.getData().id === sr.getActiveCell()?.row.getData().id) {
      e.preventDefault(); e.stopPropagation();
      rowEl?.querySelector('input, button')?.focus();
      return;
    }
    // Shift+F10 or the context-menu key: the cell's menu, as a right-click on it.
    if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
      const c = sr.getActiveCell()?.getComponent(), at = c?.getElement();
      if (!at) return;
      e.preventDefault(); e.stopPropagation();
      const r = at.getBoundingClientRect();
      at.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: Math.round(r.left + 8), clientY: Math.round(r.bottom), button: 2 }));
      return;
    }
    // Alt+Down opens a list's cell's list, as Excel's validated list does; else the active cell's column's menu, as it opens a heading's filter in Excel; the cell stays where it is.
    if (e.key === 'ArrowDown' && e.altKey && !current?.red) {
      e.preventDefault(); e.stopPropagation();
      const now = sr.getActiveCell()?.getComponent();
      if (now && columnOf(now)?.type === 'choice' && canEdit(now) && !App.readOnly.peek()) { ranged = cellsOf(); atEnd = true; now.edit(true); if (!table.modules.edit.currentCell) atEnd = false; return; }
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
    offRow();
  }
  // The keys gone on from the row being typed, it's left.
  const offRow = () => { const a = keeping && table?.modules.selectRange?.getActiveCell(); if (a && a.row.getData().id !== keeping) setTimeout(leave); };

  // ---- Writing: each edit, paste or deletion one change ----
  const edit = (fn, say, dated) => !!App.change(fn, { say, dated });
  // Records entered as one change: a new one under its own id, an entered one set from the day shown, or from
  // the day `dated` gives (App.change).
  const fill = (tx, records) => {
    const entered = App.entered.peek();
    for (const [id, r] of Object.entries(records)) { const { since: _, before: __, ...rec } = r; if (id in entered) tx.update(id, rec); else tx.add('record', rec, id); }
  };
  const typeIn = (c, r) => r ? ('choice' in r ? 'choice' : 'tag' in r ? 'tag' : r.field) : c.type;
  const columnOf = cell => current.byField.get(cell.getField());
  // The datatype what's typed is read as: the value's own where there is one, else its column's; in a column with no
  // values yet, what it reads as, as a pasted column's first values say theirs (newColumn).
  const typeFor = (c, r, s) => r ? typeIn(c, r) : c.fresh ? (/^(yes|no|true|false|y|n|x|✓|✔)$/i.test(s) ? 'tag' : Tree.classify(s)) : c.type;
  const readable = (cell, raw) => { const c = columnOf(cell), m = meta(cell), s = clean(raw); return !s || c.type === 'edge' || c.type === 'list' || !!value(typeFor(c, m.id && App.state.value[m.id], s), s); };
  // What typing `raw` into a cell writes: { put: [id, record] }, a value entered; { gone: id }, one cleared; { side:
  // [row, edge, name] }, a relation's side moved; or { list: [row, column, names] }, a list's relatives named. Null where
  // it writes nothing; false where it can't be read.
  const ruleTyped = (cell, raw) => { const c = columnOf(cell), m = atCell(cell), r = m?.id && App.state.peek()[m.id], at = r?.at ?? m?.at, edge = r?.edge ?? c?.path?.at(-1); return !!at && !!edge && !['edge', 'list'].includes(c.type) && c.key !== '$why' && FormulaBar.typed(at, edge, clean(raw), r?.field ?? null); };
  function writing(cell, raw) {
    const c = columnOf(cell), m = atCell(cell), st = App.state.peek(), r = m?.id && st[m.id], entered = !!m?.id && m.id in App.entered.peek(), row = cell.getRow().getData().id;
    if (!c || !m) return null;
    // Typed back to what it is, what's waiting of it goes (App.put).
    const back = id => App.held(id) !== undefined ? { back: id } : null;
    if (c.type === 'edge') {
      const args = clean(raw) && sideTo(st, row, c.edge, raw);
      if (!args) return null;
      return JSON.stringify(args) === JSON.stringify(st[row].args) ? back(row) : { side: [row, c.edge, raw], typed: { id: row, slot: st[row], out: { args, ...outputOf(st[row]) } } };
    }
    if (c.key === '$why') return null;
    if (c.type === 'list') return m.at && !c.fx && !c.choice && namesIn(raw).join('\n') !== (m.names ?? []).join('\n') ? { list: [row, c, raw] } : null;
    const s = clean(raw);
    if (!s) return back(m.id) ?? (m.over ? { rule: m.id } : entered ? { gone: m.id } : null);
    const out = value(typeFor(c, r, s), s);
    if (!out) return false;
    if (r && JSON.stringify(valueOf(out)) === JSON.stringify(valueOf(r))) return back(m.id);
    const p = placed(m, c, out);
    return p ? { put: p, typed: { id: m.id ?? null, slot: r || { at: m.at, edge: c.path?.at(-1) }, out } } : null;
  }
  // A record's output alone.
  const outputOf = r => 'choice' in r ? { choice: r.choice } : 'tag' in r ? { tag: r.tag } : 'field' in r ? { field: r.field, value: r.value } : {};
  // What several cells write. A value is typed as in the panel, by the one rule (App.put): where it asks from when, it waits
  // on the window's bar, redlined here, with all else typed in the run, from the one day asked; what asks nothing is made at
  // once, as one change, from the day shown or else corrected, a first value or a date among them. Relatives named in a
  // list's cells relate it as a paste does, a change pending (stage), and those it no longer names end, as Delete… asks.
  // `auto`: the keys go to the day, where one's asked.
  function write(ws, say, { auto = false } = {}) {
    ws = ws.filter(Boolean);
    if (!ws.length || App.readOnly.peek() || locked()) return false;
    const lists = ws.filter(w => w.list), st = App.state.peek();
    ws = ws.filter(w => !w.list);
    if (lists.length) stage(real, () => ({ keys: [], plan: lists.map(({ list: [row, c, raw] }) => ({ row, key: [], cells: [[c, raw]] })) }), { verb: 'Add' });
    // (What doesn't change over time goes the same way, so it's corrected for all time, whatever the day shown.)
    const waits = w => !!w.back || (w.typed && (App.held(w.typed.id) !== undefined || App.asksFrom(w.typed.id, w.typed.out) || App.fixedAt(w.typed.id, w.typed.slot)));
    const asked = ws.filter(waits), overs = ws.filter(w => w.rule).map(w => w.rule);
    ws = ws.filter(w => !waits(w) && !w.rule);
    asked.forEach((w, i) => {
      ran = true;
      if (w.back) App.put(w.back, st[w.back], false);
      else App.put(w.typed.id, w.typed.slot, w.typed.out, { auto: auto && i === asked.length - 1 });
    });
    // (Cleared, what's typed over a rule goes back to it, which asks why.)
    if (overs.length) { ran = true; App.backToRule(overs); }
    if (!ws.length) return true;
    const records = Object.fromEntries(ws.filter(w => w.put).map(w => w.put));
    return edit(tx => { fill(tx, records); ws.forEach(w => w.gone ? tx.remove(w.gone) : w.side && side(tx, st, ...w.side)); }, say);
  }
  let ran = false;   // the grid began what's waiting on the bar, so the keys come back to it after
  // A value typed or chosen in a cell.
  function put(cell, raw, o) { const w = writing(cell, raw); return w === false ? false : !w || write([w], undefined, o); }
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
  // A relation's sides with one moved to another object, found by name; null where the name finds none.
  function sideTo(st, row, edge, name) {
    const o = onRelation(current, edge) ? sideRecords(current, edge).find(x => same(x.name, name))?.id : find(st, name, sideKinds(current, edge)), to = o && follow(st, o, sideLoc(current, edge));
    return to ? st[row].args.map(a => same(a.edge, edge) ? { edge: a.edge, at: to } : a) : null;
  }
  function side(tx, st, row, edge, name) {
    const args = sideTo(st, row, edge, name);
    if (args) tx.update(row, { args });
  }
  // A tag's box: blank, attested, ruled out, and blank again, each typed as a value is (App.put), asking from when where it
  // has history to keep. A box a formula covers is no click from a false fact: worked out or typed over, clicked or by Space,
  // it opens its reason, where overriding it is a command of its own; one it has said nothing of, or not tested, has no reason
  // to open and writes nothing.
  function flip(cell) {
    const m = atCell(cell), c = columnOf(cell), v = cell.getValue(), r = m.id && App.state.peek()[m.id];
    // (What it can't say says why, as any answer of a rule's does.)
    if (v === CANT && !locked()) { const row = cell.getRow().getData().id; if (!Shell.selection.peek().includes(row)) Shell.select([row]); return Shell.emit('why-open', m.cant.id); }
    if (!m.at || locked() || v === NA || m.quiet) return;
    if (m.fx || App.computed.peek().covered?.[m.id]) {
      const row = cell.getRow().getData().id;
      if (!Shell.selection.peek().includes(row)) Shell.select([row]);
      return Shell.emit('why-open', m.id);
    }
    if (App.readOnly.peek() || (c.check && v !== false)) return;
    const next = v === true ? false : v === false ? null : true, held = !!m.id && App.held(m.id) !== undefined;
    if (held && (next === null || r?.tag === next)) { App.put(m.id, r, false); return; }
    if (next === null) { if (m.id in App.entered.peek()) edit(tx => tx.remove(m.id)); return; }
    write([{ put: placed(m, c, { tag: next }), typed: { id: m.id ?? null, slot: r || { at: m.at, edge: c.path?.at(-1) }, out: { tag: next } } }]);
  }
  // Clears the cells of the range: the values entered there go, as one change; what's waiting of them on the bar goes from
  // it; a list's relatives end, as Delete… asks.
  function clear() {
    const ids = new Set(), entered = App.entered.value, lists = [], st = App.state.peek(), overs = [];
    for (const r of table.getRanges()) for (const cell of r.getCells().flat()) {
      const m = cell.getField() && atCell(cell);
      if (columnOf(cell)?.type === 'list') lists.push(writing(cell, ''));
      else if (m?.id && App.held(m.id) !== undefined) App.put(m.id, st[m.id], false);
      else if (m?.over && m.id) overs.push(m.id);
      else if (m?.id && m.id in entered && columnOf(cell).type !== 'edge' && columnOf(cell).key !== '$out') ids.add(m.id);
    }
    if (lists.some(Boolean)) write(lists);
    if (ids.size) edit(tx => ids.forEach(id => tx.remove(id)), () => `Cleared ${count(ids.size, 'value')}`);
    if (overs.length) { ran = true; App.backToRule(overs); }
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
    if (!head) {
      const r = byPlace(m, grid);
      // Rows that would make new rows are read as Import reads them, shown, each column asked where it goes; never by the
      // place they happen to land in, a jurisdiction in Short Name.
      if (!file && !m.isDatatype && typeof r !== 'string' && grid.length + grid[0].length > 2 && r.plan.some(p => !p.row)) return importDialog({ text: textIn, view: m.view });
      return stage(m, () => r, { file, single: !file && grid.length === 1 && grid[0].length === 1 });
    }
    // Headings nothing matches are asked about there too.
    if (!file && grid[0].some((h, j) => !head[j] && clean(h))) return importDialog({ text: textIn, view: m.view });
    stage(m, as => byName(m, grid, head, as), { file });
  }

  // The column a heading names: by its title, or its place, as much of it as is given (Entity Type › Tax Classification),
  // as its heading in the grid and the file says it; a relation's side by its edge, its list's name (Owners) or the one
  // kind only it can be; the Name by the kind (Entity). Singular or plural alike.
  function named(m, h) {
    const N = App.notes.peek(), is = (a, b) => same(a, b) || same(plural(a), b) || same(a, plural(b));
    const kinds = new Map(m.cols.filter(c => c.type === 'edge').map(c => [c, sideKinds(m, c.edge)]));
    const names = c => [...(c.told ? [c.told.join(' › ')] : [c.title]), ...(c.path ?? []).map((_, i, p) => i && p.slice(-i - 1).join(' › ')),
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

  // ---- Import: rows from a file, or typed or pasted in, shown as they'll be read, before anything's staged. What the first
  // row is, headings or data, is asked over them, and what each column is over it: one of the table's, a new one, or left
  // out. What's asked is guessed first: headings where any names a column (or, of a file, where its first row reads as no
  // data); else each column by what it holds, an option of a choice by that choice, a percentage by the first figure, and
  // the columns rows are found by, in their order, from those left. Import stages it, redlined in its table, the bar naming
  // what it adds. ----
  const FORM = /(^|[\s,])(llc|l\.?l\.?c\.?|l\.?p\.?|inc\.?|corp\.?|ltd\.?|limited|plc|gmbh|trust|fund)$/i;
  const importable = m => m.cols.filter(c => c.key !== '$entry' && c.key !== '$of' && c.key !== '$why' && c.key !== '$resp' && c.key !== '$value');
  function firstRowIs(m, grid, file) {
    const heads = headings(m, grid);
    if (heads?.some(Boolean)) return 'head';
    if (grid.length < 2) return 'data';
    // (What reads as data is data, a value in it that doesn't read being no heading: a legal form, an option, a record's name.)
    const st = App.state.peek(), kinds = m.isKind ? [m.rows.kind] : [];
    const data = grid[0].some(h => { const s = clean(h); return !!s && (Tree.classify(s) !== 'text' || FORM.test(s) || m.cols.some(c => c.options?.some(o => same(o, s))) || !!find(st, s, kinds)); });
    return data ? 'data' : heads || file ? 'head' : 'data';
  }
  // Each column's key, as its heading names it, or as it holds, by what the first row is.
  function guessed(m, grid, first) {
    const cols = importable(m), width = Math.max(0, ...grid.map(r => r.length)), out = new Array(width).fill('');
    if (first === 'head') {
      const head = grid[0].map(h => clean(h) ? named(m, h) : null);
      grid[0].forEach((h, j) => { if (head[j]) out[j] = head[j].key; });
      // Where one heading is left and one column a row is found by, it's that one.
      const asked = out.map((k, j) => !k && clean(grid[0][j] ?? '') ? j : -1).filter(j => j >= 0), open = keysOf(m, cols).filter(k => !head.includes(k));
      if (asked.length === 1 && open.length === 1) out[asked[0]] = open[0].key;
      return out;
    }
    const taken = new Set(), of = j => grid.map(r => clean(r[j] ?? '')).filter(Boolean);
    // By what most of it holds, as a stray row is no reason to leave a column out: the choice most of it's an option of, those
    // shown first; a percentage; a date, its first column that's a date.
    const most = (vs, ok) => vs.filter(ok).length * 2 > vs.length, free = t => [...cols.filter(x => x.type === t && !taken.has(x.key) && x.shown), ...cols.filter(x => x.type === t && !taken.has(x.key) && !x.shown)];
    for (let j = 0; j < width; j++) {
      const vs = of(j);
      // (What only a stray row or two has is no column of the rows'.)
      if (vs.length * 2 < grid.length) continue;
      const isOption = x => v => x.options?.some(o => same(o, v)), hits = x => vs.filter(isOption(x)).length;
      const choice = free('choice').filter(x => most(vs, isOption(x))).sort((a, b) => hits(b) - hits(a))[0];
      const c = choice ?? (most(vs, v => Tree.classify(v) === 'percent') ? free('percent')[0] : most(vs, v => Tree.classify(v) === 'date' || /^\d{4}$/.test(v)) && vs.some(v => Tree.classify(v) === 'date') ? free('date')[0] : null);
      if (c) { out[j] = c.key; taken.add(c.key); }
    }
    const keys = keysOf(m, m.cols).filter(k => !taken.has(k.key));
    for (let j = 0; j < width && keys.length; j++) if (!out[j] && of(j).some(v => Tree.classify(v) === 'text')) out[j] = keys.shift().key;
    return out;
  }
  // The rows of a file: Excel's or CSV, read as tab-separated text, a date as its day whatever format the sheet shows it in,
  // and a first line this exported saying its day taken off.
  const noDay = s => s.replace(/^As (of|it stood on) [^\t\n]*\t*\r?\n/, '');
  async function rowsOf(f) {
    // (A text file as it's written: what it says of a date is what's known, and SheetJS would make "Mar 2022" a day.)
    const X = await loadSheetJS(), wb = X.read(await f.arrayBuffer(), { cellNF: true, raw: /\.(csv|tsv|txt)$/i.test(f.name) }), ws = wb.Sheets[wb.SheetNames[0]], pad = n => String(n).padStart(2, '0');
    for (const [k, c] of Object.entries(ws)) if (k[0] !== '!' && c.t === 'n' && c.z && X.SSF.is_date(c.z)) { const d = X.SSF.parse_date_code(c.v), month = /m/i.test(c.z), day = /d/i.test(c.z) || (!month && !/^y+$/i.test(c.z)); c.w = day ? `${d.y}-${pad(d.m)}-${pad(d.d)}` : month ? `${d.y}-${pad(d.m)}` : `${d.y}`; }
    return X.utils.sheet_to_csv(ws, { FS: '\t', blankrows: false });
  }
  const pickRows = then => {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept: '.xlsx,.xlsm,.xls,.csv,.tsv,.txt' });
    input.onchange = async () => { const f = input.files[0]; if (f) { try { then(await rowsOf(f), f.name); } catch { Shell.toast(`Couldn’t read ${f.name}`); } } };
    input.click();
  };
  function Importer({ start, done }) {
    const tables = importTables(), [text, setTextOnly] = useState(start.text ?? ''), [file, setFile] = useState(start.file ?? null), go = useRef();
    const [to, setTo] = useState(start.view ?? null), [first, setFirst] = useState(null), [keys, setKeys] = useState(null);
    // The rows as fixed here (null till one is), and the cell being typed in.
    const [fixed, setFixed] = useState(null), [typing, setTyping] = useState(null), [all, setAll] = useState(false);
    const setText = t => { setTextOnly(t); setFixed(null); setTyping(null); };
    const grid = fixed ?? tsv(noDay(text)), fits = tables.map(v => [v.id, fitOf(v.id, grid[0] ?? [])]), best = fits.reduce((a, b) => b[1] > a[1] ? b : a, [null, 0]);
    const here = tables.find(v => v.id === Shell.view.peek())?.id, view = to ?? (fits.find(([v]) => v === here)?.[1] ? here : best[1] ? best[0] : here ?? tables[0]?.id);
    const m = preactHooks.useMemo(() => view && model(view), [view]);
    if (!m) return null;
    const row1 = first ?? firstRowIs(m, grid, file), auto = guessed(m, grid, row1), chosen = (keys ?? auto).slice(0, Math.max(1, ...grid.map(r => r.length))), cols = importable(m);
    const load = (t, name) => { setText(t); setFile(name ?? null); setFirst(null); setKeys(null); setTo(start.view ?? null); };
    // A file read, Enter imports it, as Ctrl+Enter does what's typed or pasted in the box.
    preactHooks.useLayoutEffect(() => { if (file) go.current?.focus(); }, [file]);
    const asColumns = chosen.map(k => k && k !== 'new' ? m.cols.find(c => c.key === k) ?? null : null);
    const missing = !m.isKind ? keysOf(m, m.cols).find(k => !asColumns.includes(k))?.title : keysOf(m, asColumns).length ? null : 'Name';
    const base = row1 === 'head' ? 1 : 0, shown = grid.slice(base), width = chosen.length;
    // What's wrong with a row, before anything's made. More values than the rows have columns: a comma has cut one, so it's held
    // back, with its mend, till it's fixed. A value that doesn't read as its column's: left out, and said why. One that's none
    // of a choice's options: a new option, unless it's mended to one.
    const lengthOf = r => { let n = r.length; while (n && !clean(r[n - 1] ?? '')) n--; return n; };
    const counted = new Map(); for (const r of shown) counted.set(lengthOf(r), (counted.get(lengthOf(r)) ?? 0) + 1);
    // (What the rows have: as many as its headings; or else what most have, which it takes two rows to say.)
    const most = [...counted].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0], usual = base ? lengthOf(grid[0]) : most?.[1] >= 2 ? most[0] : 0, over = r => usual > 0 && lengthOf(r) > usual;
    const cutAt = r => { const j = r.findIndex((v, i) => i > 0 && FORM.test(clean(v))); return j > 0 ? j - 1 : 0; };
    const put = (i, row) => { const g = grid.map(r => r.slice()); g[base + i] = row; setFixed(g); setTyping(null); };
    const mend = (r, i) => { const j = cutAt(r); put(i, [...r.slice(0, j), `${clean(r[j])}, ${clean(r[j + 1])}`, ...r.slice(j + 2)]); };
    const colAt = j => chosen[j] && chosen[j] !== 'new' ? m.cols.find(c => c.key === chosen[j]) ?? null : null;
    const reading = (c, raw) => { const s = clean(raw);
      // (n/a in a file brought back is what a rule hasn't tested, which says nothing to type: changeOf.)
      if (!s || !c || c.type === 'edge' || c.type === 'list' || s === NA || s === CANT || c.key.startsWith('$')) return {};
      if (c.type === 'choice') return c.options?.some(o => same(o, s)) ? {} : { tone: 'new', why: `New option of ${called(c)}` };
      const v = value(c.type, s);
      return !v ? { tone: 'bad', why: `“${s}” isn’t ${Tree.PHRASES[c.type] ?? 'a value'}` } : c.type === 'date' ? { as: Tree.formatDate(v.value, 'short') } : {}; };
    // A choice's mend, in the dialog as its columns' are: its options, the closest first; or kept as a new one.
    const optionsOf = (c, raw) => { const l = loose(raw); return [...(c.options ?? [])].sort((a, b) => apart(l, loose(a)) - apart(l, loose(b))); };
    const held = shown.filter(over), going = shown.filter(r => !over(r)), wrongs = going.flatMap(r => r.map((v, j) => reading(colAt(j), v)).filter(x => x.tone === 'bad')).length;
    const newOnes = [...new Set(going.flatMap(r => r.flatMap((v, j) => reading(colAt(j), v).tone === 'new' ? [`${clean(v)}`] : [])))];
    const LIMIT = 200, rows = all ? shown : shown.slice(0, LIMIT);
    const cellOf = (r, i, j) => { const raw = r[j] ?? '', c = colAt(j), said = reading(c, raw);
      if (typing?.i === i && typing?.j === j && c?.type === 'choice') return html`<td class="typing"><select class="cell" aria-label=${called(c)} ref=${x => { if (x && !x.dataset.on) { x.dataset.on = 1; x.focus(); } }} onBlur=${() => setTyping(null)}
        onKeyDown=${e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setTyping(null); } }} onChange=${e => put(i, r.map((x, k) => k === j ? e.target.value : x))}>
        ${c.options?.some(o => same(o, raw)) ? null : html`<option value=${clean(raw)} selected>New option: ${clean(raw)}</option>`}${optionsOf(c, raw).map(o => html`<option value=${o} selected=${same(o, raw)}>${o}</option>`)}</select></td>`;
      if (typing?.i === i && typing?.j === j) return html`<td class="typing"><input class="cell" aria-label=${c ? called(c) : `Column ${j + 1}`} value=${raw} spellcheck=${false} ref=${x => { if (x && !x.dataset.on) { x.dataset.on = 1; x.focus(); x.select(); } }}
        onKeyDown=${e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); put(i, r.map((x, k) => k === j ? e.target.value : x)); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setTyping(null); } }}
        onBlur=${e => { if (typing) put(i, Array.from({ length: Math.max(r.length, j + 1) }, (_, k) => k === j ? e.target.value : r[k] ?? '')); }} /></td>`;
      return html`<td class=${(chosen[j] ? '' : 'out') + (said.tone ? ' ' + said.tone : '')} data-tip=${said.why ?? null} tabindex="0" role="button" aria-label=${`${clean(raw) || 'Blank'}${said.why ? `, ${said.why}` : ''}`}
        onClick=${() => setTyping({ i, j })} onKeyDown=${e => { if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); e.stopPropagation(); e.currentTarget.click(); } }}>${said.as ?? clean(raw)}</td>`; };
    const pickBox = html`<button type="button" class="btn" onClick=${() => pickRows(load)}>${file ? 'Another file…' : 'Choose a file…'}</button>`;
    return html`<div class="imp" onKeyDown=${e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !go.current?.disabled) { e.preventDefault(); go.current?.click(); } }}>
      ${file ? null : html`<textarea class="imp-rows" rows="4" aria-label="Rows" placeholder="Rows" spellcheck=${false} ref=${x => x && !x.dataset.on && (x.dataset.on = 1, x.focus())} value=${text}
          onInput=${e => { setText(e.target.value); setFirst(null); setKeys(null); }} />`}
      <div class="imp-bar">${grid.length ? html`<label>Into <select class="import-to" aria-label="Into" onChange=${e => { setTo(e.target.value); setFirst(null); setKeys(null); }}>${tables.map(t => html`<option value=${t.id} selected=${t.id === view}>${t.name}</option>`)}</select></label>
          <label>First row <select class="imp-first" aria-label="First row" onChange=${e => { setFirst(e.target.value); setKeys(null); }}><option value="head" selected=${row1 === 'head'}>Headings</option><option value="data" selected=${row1 === 'data'}>Data</option></select></label>` : null}
        <span class="imp-file">${file ?? ''}</span>${pickBox}</div>
      ${!grid.length ? null : html`<div class="imp-grid"><table><thead>
          ${row1 === 'head' ? html`<tr class="heads">${Array.from({ length: width }, (_, j) => html`<th>${clean(grid[0][j] ?? '')}</th>`)}</tr>` : null}
          <tr class="to">${chosen.map((k, j) => html`<th><select aria-label=${`Column ${j + 1}`} onChange=${e => setKeys(chosen.map((x, i) => i === j ? e.target.value : x === e.target.value && x !== 'new' ? '' : x))}>
            <option value="" selected=${!k}>Leave out</option>
            ${cols.map(c => html`<option value=${c.key} selected=${k === c.key}>${called(c)}</option>`)}
            ${row1 === 'head' ? html`<option value="new" selected=${k === 'new'}>New column</option>` : null}</select></th>`)}</tr></thead>
          <tbody>${rows.map((r, i) => { const wrong = r.map((v, j) => reading(colAt(j), v)).filter(x => x.tone === 'bad'), cut = over(r);
            return html`<tr class=${cut ? 'held' : ''}>${Array.from({ length: width }, (_, j) => cellOf(r, i, j))}</tr>
              ${cut || wrong.length ? html`<tr class="flag"><td colspan=${width}>${cut ? html`<span>${lengthOf(r)} values, where the rows have ${usual}: held back</span> <button type="button" class="lk" onClick=${() => mend(r, i)}>Read as “${clean(r[cutAt(r)])}, ${clean(r[cutAt(r) + 1])}”</button>` : wrong.map(x => html`<span>${x.why}: left out</span> `)}</td></tr>` : null}`; })}</tbody></table></div>
        ${shown.length > rows.length ? html`<button type="button" class="lk imp-more" onClick=${() => setAll(true)}>${shown.length - rows.length} more</button>` : null}`}
      <div class="imp-foot">${grid.length && missing ? html`<span class="imp-miss">No ${missing} column</span>` : html`<span class="imp-says">${[held.length && count(held.length, 'row') + ' held back', wrongs && count(wrongs, 'value') + ' left out', newOnes.length && (newOnes.length > 3 ? count(newOnes.length, 'new option') : `New: ${list(newOnes)}`)].filter(Boolean).join(' · ')}</span>`}
        <button type="button" class="btn" onClick=${() => done(null)}>Cancel</button>
        <button ref=${go} type="button" class="btn primary" disabled=${!shown.length || held.length === shown.length || !!missing} onClick=${() => done({ view, grid: grid.filter(r => !held.includes(r)), keys: chosen, first: row1, file, held: held.map(r => clean(r.find(v => clean(v)) ?? '')) })}>Import</button></div>
    </div>`;
  }
  function importDialog(start = {}) {
    if (App.readOnly.peek()) return Shell.toast(App.whyNot());
    if (!importTables().length) return Shell.toast('Add a table first');
    Shell.dialog({ title: 'Import', width: 760, actions: [], body: settle => html`<${Importer} start=${start} done=${settle} />` }).then(o => { if (o) importInto(o); });
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
  // of a kind's table), names (the kinds it could be, as they're called) }; `rels`, the relations a list's cells add, and
  // `ends`, those they no longer name. A name pointed at a record (`as`, its id) is that record; at a kind (`as`, { kind }),
  // a new one of it.
  function changeOf(m, { keys, plan }, as = new Map()) {
    const st = App.state.peek(), entered = App.entered.peek(), records = {}, made = new Map(), kids = new Map();
    const x = { records, values: 0, rows: [], made: [], skipped: 0, left: [], matched: 0, cols: new Set(), rels: [], ends: [], wrong: [] };
    // What's left out, each by what it was and where, so it's said which.
    const leave = (p, c, raw) => { x.skipped++; x.left.push({ row: p.key?.filter(Boolean).join(' → ') || '', col: c ? called(c) : '', raw: clean(raw) }); };
    const refused = said => { if (said && !x.wrong.includes(said)) x.wrong.push(said); return !!said; };
    const put = (rec, id = Log.newId()) => { records[id] = rec; return id; };
    const make = (name, kind, kinds, row = false, names = [kind]) => {
      const o = put({ kind });
      put({ at: o, edge: 'Name', field: 'text', value: name });
      made.set(loose(name), o);
      x.made.push({ kind, name, kinds, names, near: near(st, name, kinds), row });
      return o;
    };
    const asId = name => { const a = as.get(loose(name)); return typeof a === 'string' ? a : null; };
    const childAt = (at, edge) => kids.get(`${at}|${norm(edge)}`) ?? entryAt(st, at, edge);
    // A side named in the paste: an object of the kinds that side can be, or a new one, of the kind it's pointed at, or
    // else of the kind those like it are (kindAt), `other` being the rest of its row, each side's record the chart has.
    const rel = edge => onRelation(m, edge);
    const has = (edge, name) => asId(name) ?? (rel(edge) ? sideRecords(m, edge).find(y => loose(y.name) === loose(name))?.id : find(st, name, sideKinds(m, edge)) ?? made.get(loose(name)));
    // Nothing new of the wrong sort: a name of a record of another kind says so, and a side that's a relation takes only its records.
    const sideAt = (edge, name, other) => {
      const o = has(edge, name) ?? (refused(otherKind(m, edge, name)) || rel(edge) ? null : make(name, as.get(loose(name))?.kind ?? kindAt(m, edge, other), sideKinds(m, edge), false, sideKindNames(m, edge)));
      return o && follow(st, o, sideLoc(m, edge));
    };
    for (const p of plan) {
      let row = p.row ?? (m.isKind && p.key[0] && asId(p.key[0])) ?? null;
      const was = !!row;
      if (was) x.matched++;
      if (!row) {
        if (!p.key.length || p.key.some(k => !k)) { p.cells.filter(([, raw]) => clean(raw)).forEach(([c, raw]) => leave(p, c, raw)); continue; }
        if (m.isKind) {
          row = made.get(loose(p.key[0]));
          if (!row) { row = make(p.key[0], m.rows.kind, new Set([norm(m.rows.kind)]), true); x.rows.push(row); }
        } else {
          const other = new Map(keys.map((k, i) => [norm(k.edge), has(k.edge, p.key[i])]));
          const args = keys.map((k, i) => ({ edge: k.edge, at: sideAt(k.edge, p.key[i], other) }));
          if (args.some(a => !a.at)) { p.cells.forEach(([c, raw]) => leave(p, c, raw)); continue; }
          const own = p.cells.find(([c]) => c.key === '$out');
          row = put({ args, ...(own ? value(own[0].type, clean(own[1])) ?? { tag: true } : { tag: true }) });
          x.rows.push(row);
        }
      }
      const lists = [];
      for (const [c, raw] of p.cells) {
        if (c.key === '$why') continue;   // a file exported and brought back: what's worked out isn't typed
        if (c.type === 'list') { lists.push([c, raw]); continue; }
        // (A file exported and brought back: n/a is what a rule hasn't tested, and says nothing to type.)
        if (!clean(raw) || clean(raw) === NA || clean(raw) === CANT || (!was && c.key === '$out')) continue;
        if (c.key === '$entry' || c.key === '$of' || c.type === 'edge') { leave(p, c, raw); continue; }
        const path = c.key === '$value' || c.key === '$out' ? null : c.path;
        let at = c.up ? st[row]?.at : row;
        if (path) for (const e of path.slice(0, -1)) at = at && childAt(at, e);
        const id = path ? at && childAt(at, path.at(-1)) : row, r = id && (records[id] ?? st[id]);
        const out = at && value(typeIn(c, r), clean(raw));
        if (!out) { leave(p, c, raw); continue; }
        if (r && JSON.stringify(valueOf(out)) === JSON.stringify(valueOf(r))) continue;
        if (r && id in entered) records[id] = { ...entered[id], ...out };
        else if (records[id]) records[id] = { ...records[id], ...out };
        else if (path) kids.set(`${at}|${norm(path.at(-1))}`, put({ at, edge: path.at(-1), ...out }));
        else { leave(p, c, raw); continue; }
        // A value is counted where it changes a row that was there; one in a row it adds is that row's.
        if (was) x.values++;
        x.cols.add(c.key);
      }
      // A list's cell names the row's relatives in it, once what's at the row is (a Principal at the Jurisdiction pasted
      // beside it): each named that isn't, a record the chart has by its name as people write it or a new one, is related;
      // each it no longer names ends.
      for (const [c, raw] of lists) {
        let at = c.up ? (records[row] ?? st[row])?.at : row;
        for (const e of c.minePath) at = at && childAt(at, e);
        if (!at || c.fx || c.choice) { if (clean(raw)) leave(p, c, raw); continue; }
        const had = st[at] ? relativesIn(st, at, c) : [], want = [];
        for (const name of namesIn(raw)) {
          const o = asId(name) ?? find(st, name, c.kinds) ?? made.get(loose(name)) ?? (refused(wrongKind(c.kinds, c.kindNames, name)) ? null : make(name, as.get(loose(name))?.kind ?? listKind(m, c), c.kinds, false, c.kindNames));
          if (o && !want.includes(o)) want.push(o);
        }
        for (const o of want) if (!had.some(h => h.obj === o)) {
          const to = follow({ ...st, ...records }, o, c.otherLoc);
          if (to) x.rels.push(put({ args: [{ edge: c.mine, at }, { edge: c.other, at: to }], tag: true })); else leave(p, c, raw);
        }
        for (const h of had) if (!want.includes(h.obj)) x.ends.push(h.rid);
        x.cols.add(c.key);
      }
    }
    return x;
  }
  // The kind most of a list's relatives are, for a new one named in it; else the first it can be.
  function listKind(m, c) {
    const st = App.state.peek(), n = new Map();
    for (const d of m.data) for (const rid of d._m[field(c)]?.rels ?? []) {
      const r = st[rid], a = r?.args.find(x => same(x.edge, c.other)), k = a && st[Tree.objectOf(st, a.at)]?.kind;
      if (k) n.set(k, (n.get(k) ?? 0) + 1);
    }
    return [...n].sort((a, b) => b[1] - a[1])[0]?.[0] ?? c.kindNames[0];
  }
  // The kind a new record on a relation's side starts on: the one most of those like it in the table's rows are of. Like it,
  // first, beside it: in a row with the rest of its row (`other`, the records named there, by edge); and as it's new, on no
  // row at the other side, as an investor among a fund's owners is, where a feeder that has owners of its own isn't. So an
  // investor imported among investor groups is one; failing those, the rest of its row's, those on no other side, or any.
  function kindAt(m, edge, other = new Map()) {
    const st = App.state.value, sideOf = (d, e) => { const a = st[d.id]?.args?.find(x => same(x.edge, e)); return a && Tree.objectOf(st, a.at); };
    const rest = m.cols.filter(c => c.type === 'edge' && !same(c.edge, edge)).map(c => c.edge), mine = m.data.map(d => [d, sideOf(d, edge)]).filter(([, o]) => st[o]?.kind);
    const elsewhere = new Set(m.data.flatMap(d => rest.map(e => sideOf(d, e))));
    const beside = ([d]) => rest.some(e => other.get(norm(e))) && rest.every(e => !other.get(norm(e)) || sideOf(d, e) === other.get(norm(e))), alone = ([, o]) => !elsewhere.has(o);
    const like = [mine.filter(x => beside(x) && alone(x)), mine.filter(beside), mine.filter(alone), mine].find(l => l.length) ?? [], n = new Map();
    for (const [, o] of like) n.set(st[o].kind, (n.get(st[o].kind) ?? 0) + 1);
    return [...n].sort((a, b) => b[1] - a[1])[0]?.[0] ?? sideKindNames(m, edge)[0] ?? 'Entity';
  }

  // ---- A paste or a deletion: a change pending (App.stage), redlined in the grid, with the window's bar saying what
  // it does; Enter makes it, Esc doesn't. A paste that adds a row asking its day (App.asksDay), an ownership say, asks
  // it there, from the day shown or all along (App.From), and the paste is made from that day, the values it sets
  // with it, as a closing's schedule is; a deletion asks until when, as App.deleting does. Until what's typed there is
  // a day, it isn't made. Each name it adds is a choice in the bar, of a record the chart has instead, the closest first;
  // one close to a name the chart has asks "or" that one, taken by a click. Taken, the paste is pending again as it then
  // is, from the day it was asked from. A list's cells typed or pasted are the same, their verb Add: what they relate is
  // added from the day asked, and what they no longer name ends then; naming none, they're a deletion, which asks until
  // when. One cell pasted that only changes a value is made at once, as one typed is, Undo taking it back ----
  // What was left out of an import, by name, as its bar and History say it: one or two whole, more counted.
  const leftWord = l => [l.col && `${l.col} “${l.raw}”`, l.row && `of ${l.row}`].filter(Boolean).join(' ') || `“${l.raw}”`;
  const leftWords = x => x.left.length && x.left.length <= 2 ? x.left.map(leftWord).join(' and ') : count(x.skipped, 'value');
  function stage(m, planOf, { file = null, as = new Map(), verb = null, single = false, held = [] } = {}) {
    const r = planOf(as);
    if (typeof r === 'string') return Shell.toast(r);
    const x = changeOf(m, r, as), st = App.state.peek(), N = App.notes.peek(), source = 'paste ' + m.view, was = App.pending.peek();
    const rel = id => `${N.nameOf(st, id)}: ${Time.whose(st, id, N)}`;
    // Pointed at what the chart has, a paste that then changes nothing is done with; one that only ends what a list named,
    // a deletion.
    if (!Object.keys(x.records).length) {
      if (as.size && was?.source === source) App.discard();
      if (x.wrong.length) { Shell.toast(x.wrong.join('. ')); return back(); }
      if (x.ends.length) { App.deleting(x.ends, x.ends.length > 1 ? count(x.ends.length, N.nameOf(st, x.ends[0]).toLowerCase()) : rel(x.ends[0]), { source }); return back(); }
      return Shell.toast(x.skipped ? `Left out ${leftWords(x)}` : `Nothing new to ${file ? `import from ${file}` : 'paste'}`);
    }
    // What it adds is named, a few by their names, or how many: a row a person might have meant is never only a count.
    const made = x.made.filter(o => !o.row).map(o => o.name), noun = m.noun, recs = { ...st, ...x.records }, few = x.rows.length <= 3;
    const related = x.rels.length > 2 ? [count(x.rels.length, N.nameOf(recs, x.rels[0]).toLowerCase())] : x.rels.map(id => `${N.nameOf(recs, id)}: ${N.placed(recs, id).map(s => s.join + s.text).join('')}`);
    const rowsSaid = !few ? [] : m.isKind ? x.made.filter(o => o.row).map(o => o.name) : x.rows.map(id => N.placed(recs, id).map(s => s.join + s.text).join(''));
    const added = [!few && count(x.rows.length, noun), ...rowsSaid, ...related, ...(made.length > 3 ? [...made.slice(0, 2), `${made.length - 2} more`] : made)].filter(Boolean);
    const say = !x.values && !x.rows.length ? ch => Time.describe(ch)
      : [x.values && `${file ? 'Imported' : 'Pasted'} ${count(x.values, 'value')}`, added.length && `added ${list(added)}`, x.skipped && `left out ${leftWords(x)}`, held.length && `${count(held.length, 'row')} held back (${list(held)})`]
        .filter(Boolean).join(', ').replace(/^a/, 'A').replace(/^Added/, file ? 'Imported' : 'Added') + (file ? ` from ${file}` : '');
    // By the one rule (App.put): a value over one with history to keep asks from when, as one typed there does.
    const over = Object.keys(x.records).filter(id => App.asksFrom(id, x.records[id]));
    const asks = over.length > 0 || [...x.rows, ...x.rels].some(id => App.asksDay(x.records[id], recs));
    // What's new, related to nothing a page draws, isn't placed on it: the toast offers Show (App.keepOff).
    const brand = Object.keys(x.records).filter(id => 'kind' in x.records[id]);
    let off = [];
    const make = (tx, d, p) => { fill(tx, x.records); for (const id of x.ends) tx.remove(id, p?.asks === 'from' ? d : App.day.peek()); off = brand.length ? App.keepOff(tx, brand) : []; };
    const offered = () => (off.length ? ['Put on the chart', () => App.change(tx => brand.forEach(id => tx.note('Shown', { id, kind: x.records[id].kind }, true, { view: off[0].id })), { say: c => Time.describe(c) })] : null);
    if (single && !x.rows.length && !x.made.length && !x.rels.length && !x.ends.length) {
      if (over.length) { ran = true; const [id] = over; App.put(id, st[id], x.records[id]); return back(); }
      if (!asks) { App.change(tx => make(tx), { say }); return back(); }
    }
    const shownCols = new Set(m.cols.filter(drawn).map(c => c.key));
    // What it does, in the redline's ink, as the bar says it; what's left out, which it doesn't do, plain. The names it
    // adds, each a choice: those close to one the chart has, every one, asking; then the rest, three in all.
    const ink = t => html`<span class="add">${t}</span>`, take = (o, to) => stage(m, planOf, { file, verb, as: new Map([...as, [loose(o.name), to]]) });
    // A new one, of each kind it could be, that it is checked; then the records it could be, the closest first; those first
    // once something's typed to find them by.
    const choose = (anchor, o) => Shell.menu(anchor, q => {
      const t = norm(q), l = loose(q), hit = rivals(st, o.name, o.kinds).filter(y => !q || norm(y.name).includes(t) || norm(y.short).includes(t) || loose(y.name).includes(l));
      const anew = o.names.map(k => ({ label: `New ${k} ${o.name}`, checked: same(k, o.kind), run: () => { if (!same(k, o.kind)) take(o, { kind: k }); } })), found = hit.slice(0, 60).map(y => ({ label: y.name, checked: false, run: () => take(o, y.id) }));
      return found.length ? (q ? [...found, '-', ...anew] : [...anew, '-', ...found]) : anew;
    }, { search: true, placement: 'top-start' });
    const named = o => html`<span class="named"><button type="button" class="add dd" aria-haspopup="menu" onClick=${e => choose(e.currentTarget, o)}>new ${o.kind} ${o.name}</button>${o.near
      ? html`<span class="or">, or <button type="button" class="lk" onClick=${() => take(o, o.near)}>${N.nameOf(st, o.near)}</button>?</span>` : null}</span>`;
    const asked = x.made.filter(o => o.near), plain = x.made.filter(o => !o.near && (!o.row || few)), listed = [...asked, ...plain.slice(0, Math.max(0, 3 - asked.length))];
    const more = asked.length + plain.length - listed.length;
    const ended = x.ends.length > 2 ? [count(x.ends.length, N.nameOf(st, x.ends[0]).toLowerCase())] : x.ends.map(rel);
    const parts = [x.values && ink(count(x.values, 'value')), !few && ink(`${x.rows.length} new ${plural(noun)}`), ...(few && !m.isKind ? rowsSaid.map(t => ink(`new ${noun} ${t}`)) : []),
      ...related.map(ink), ...ended.map(t => html`<span class="del">${t}</span>`), ...listed.map(named), more && ink(`${more} more`), x.skipped && html`<button type="button" class="lk" aria-haspopup="menu" onClick=${e => Shell.menu(e.currentTarget, x.left.map(l => ({ label: leftWord(l) })), { placement: 'top-start' })}>${count(x.skipped, 'value')} left out</button>`, held.length && `${count(held.length, 'row')} held back`, ...x.wrong,
      // An import says how many of its rows are records the chart has already.
      file && x.matched && `${x.matched} already in the chart`].filter(Boolean);
    const entered = App.entered.peek();
    // What it's at: the records it writes over, those it adds at, and those it ends.
    const needs = [...new Set([...Object.entries(x.records).flatMap(([id, r]) => [id, ...Tree.argsOf(r).map(a => a.at)]), ...x.ends])].filter(id => id in entered);
    App.stage({ verb: verb ?? (file ? 'Import' : 'Paste'), what: list(added.length ? added : [count(x.values, 'value')]), parts, source, say, needs, ...(x.left.length && { note: `Left out: ${x.left.map(leftWord).join('; ')}` }), cols: new Set([...x.cols].filter(k => !shownCols.has(k))),
      ...(asks && { asks: 'from', day: as.size && was?.source === source && was.asks ? was.day : over.length ? App.day.peek() : App.begins() }), make, go: offered, done: () => { if (x.rows.length === 1) Shell.select(x.rows); } });
    back();
  }
  // Rows deleted, as one change pending: the records entered there, and what's at them, each ended as App.deleting says.
  function deletion(ids) {
    const st = App.state.peek(), N = App.notes.peek();
    // A relation by its name and its sides, as the chart and History say it.
    const what = ids.length > 1 || current.isDatatype ? count(ids.length, current.noun) : current.isKind ? N.nameOf(st, ids[0]) : `${N.nameOf(st, ids[0])}: ${Time.whose(st, ids[0], N)}`;
    return { change: { records: Object.fromEntries(ids.map(id => [id, null])) }, stage: () => {
      // Made, the keys stay about where they were: on the row that's taken its place, in the same column, or else the last.
      const sr = table?.modules.selectRange, col = sr?.getActiveCell()?.column.getComponent(), rows = table?.getRows('active') ?? [], at = rows.findIndex(r => ids.includes(r.getData().id));
      App.deleting(ids, what, { source: 'rows ' + current.view, done: () => setTimeout(() => {
        if (!table || !el?.offsetParent) return;
        const left = table.getRows('active'), row = left[Math.min(Math.max(0, at), left.length - 1)], use = col && table.getColumns().includes(col) ? col : table.getColumns().find(c => c.getField());
        if (row && use && !App.pending.peek()) { hold(row.getCell(use), row.getCell(use)); reveal(row.getData().id); focus(); }
      }, 60) });
      back();
    } };
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
  // Columns shown or hidden, every way there is of asking: a look, in no log (seeColumns).
  const showing = (cs, on, say) => seeColumns(current.view, cs, on, typeof say === 'string' ? say : undefined);
  // A column ticked comes at once, and whatever else the grid was doing, it's drawn: a tick never says what the grid doesn't.
  const show = (c, on) => { const out = showing([c], on), view = current?.view; if (on) setTimeout(() => { if (current?.view === view && el?.offsetParent && table && ready && !table.getColumns().some(x => x.getField() === field(c))) { drewFrom = null; refresh(); } }, 120); return out; };
  // Whether columns can be shown and hidden: anywhere but the past and a redline.
  const canShow = () => !Shell.time.peek()?.stood && !current?.red;
  // Those shown here, made the view's, as one change: who opens the table then has them.
  function keepColumns(m = current) {
    const l = lookOf(m.view).shown;
    if (!l) return;
    keepHere();
    if (edit(tx => { for (const c of m.cols) if (c.key in l && c.pattern) note(tx, 'Shown', c, m.view, l[c.key]); }, `Kept the columns of ${viewOf(m.view)?.name}`)) putColumns(m.view, null);
  }
  // What's written at a table only in this window is written once it's the chart's.
  const keepHere = () => { if (viewOf(current?.view)?.look) App.keepTable(current.view); };
  // The columns in this order, as Order notes in the view, as one change: those given, then the rest as they were;
  // `also`, what else the change does (a column inserted shows); `moved`, the column a gesture moved, which the grid
  // then shows where it went (arrive). It says what it did as History says it.
  function place(order, say = ch => Time.describe(ch), also, moved = null) {
    keepHere();
    const m = current, rest = m.cols.filter(c => c.pattern && !order.includes(c));
    moving = moved && field(moved);
    const ok = edit(tx => { [...order, ...rest].filter(c => c.pattern).forEach((c, i) => note(tx, 'Order', c, m.view, i + 1)); also?.(tx); }, say);
    if (!ok) moving = null;
    return ok;
  }
  // What a move says (Time.describe), from the Order notes a change wrote in a table's view, each with its place before if
  // it had one: the one column that moved against the order before, the table's own where a place wasn't given, and the
  // column shown it's now after: "Moved EIN after Name in Entities", or, first of them, before the next. Those shown are
  // read first, as a first move places the hidden after them, then all. Two side by side, either moved: the one that went
  // right. Null where it isn't a table's columns, or more than one moved.
  function moved(view, notes) {
    const m = viewOf(view)?.layout === 'table' ? (real?.view === view ? real : model(view)) : null;
    if (!m?.cols) return null;
    const keyOf = (p, param) => `${Tree.key(p)}|${norm(param ?? '')}`, cols = new Map(m.cols.filter(c => c.pattern).map(c => [keyOf(c.pattern, c.param), c]));
    const cs = notes.map(n => ({ c: cols.get(keyOf(n.note.pattern, n.note.param)), now: n.note.value, was: n.was ?? Infinity }));
    if (cs.some(x => !x.c)) return null;
    const after = xs => [...xs].sort((a, b) => a.now - b.now), before = xs => [...xs].sort((a, b) => a.was - b.was || ownOrder(a.c, b.c));
    const against = xs => {
      const a = after(xs), b = before(xs), rest = x => a.filter(y => y !== x).every((y, i) => y === b.filter(z => z !== x)[i]);
      const it = a.filter(rest).sort((x, y) => (a.indexOf(y) - b.indexOf(y)) - (a.indexOf(x) - b.indexOf(x)))[0];
      return it && a.indexOf(it) !== b.indexOf(it) ? it : null;
    };
    const went = against(cs.filter(x => x.c.shown)) ?? against(cs);
    if (!went) return null;
    const shown = after(cs).filter(y => y === went || y.c.shown), at = shown.indexOf(went), name = viewOf(view).name;
    return at > 0 ? `Moved ${called(went.c)} after ${called(shown[at - 1].c)} in ${name}` : shown[1] ? `Moved ${called(went.c)} before ${called(shown[1].c)} in ${name}` : null;
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
  // The first that scrolls brought into view, each lit; not a sweeping change's.
  function arrive(fields) {
    if (!fields.length || fields.length > 4 || !table) return;
    const cols = fields.map(f => table.getColumns().find(c => c.getField() === f)).filter(Boolean);
    into(cols.find(c => !PIN.test(c.getDefinition().cssClass)));
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
  const renamable = c => !!c?.pattern && c.type !== 'edge' && c.type !== 'list' && c.key !== '$why' && !(c.path?.length === 1 && same(c.title, 'Name'));
  // Renamed, an entry is renamed wherever it's at a row of this kind: its records, its specification, its notes.
  // How it's looked at goes with it: its width, its sort, its filter, its grouping.
  function renameColumn(c, to) {
    if (!to || to === c.title || !edit(tx => tx.rename(c.pattern, c.title, to), `Renamed ${c.title} to ${to}`)) return;
    const was = c.key, now = [...c.path.slice(0, -1), to].map(norm).join('›'), l = lookOf(current.view), move = o => o && was in o ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k === was ? now : k, v])) : o;
    setLook(current.view, { widths: move(l.widths), filters: move(l.filters), sort: l.sort?.key === was ? { ...l.sort, key: now } : l.sort, group: l.group === was ? now : l.group });
  }
  const columnItems = m => m.cols.filter(c => c.pattern).map(c => ({ label: called(c), checked: c.shown, run: () => show(c, !c.shown) }));
  // What's always kept in a table: what names its rows, a Name or a relation's sides.
  const naming = c => c.type === 'edge' || (c.path?.length === 1 && same(c.title, 'Name'));
  const keptOf = m => { const cs = m.cols.filter(c => c.pattern && naming(c)); return cs.length || m.cols.some(c => !c.pattern) ? cs : m.cols.filter(c => c.pattern).slice(0, 1); };
  // Show all and Hide all: every column found, or every one of them but what names the rows, shown as one is, saying how many.
  const showEvery = (m, on, among) => { const keep = on ? [] : keptOf(m), cs = among.filter(c => !keep.includes(c) && !!c.shown !== on);
    return !!cs.length && showing(cs, on, `${on ? 'Showed' : 'Hid'} ${count(cs.length, 'column')} in ${viewOf(m.view)?.name}`); };
  // A new table opens with what names its rows and a few more, in its own order, and its columns offered beside it: the
  // rest it would show are hidden by the change that makes it.
  const FEW = 5;
  function opening(tx, view, rows) {
    const m = model(null, App.computed.peek(), App.schema.peek(), {}, rows);
    if (!m?.cols) return;
    const cs = m.cols.filter(c => c.pattern && c.shown), keep = new Set(keptOf(m));
    for (const c of cs) if (keep.size < FEW) keep.add(c);
    for (const c of cs) if (!keep.has(c)) tx.note('Shown', c.pattern, false, { view, param: c.param });
  }

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
  // A filter keeps the rows whose value in each filtered column is one of those chosen (null, Blank), a list's any of its
  // names; or, a date's, in a range of days from the day shown: before it (overdue), the next 30, 60 or 90, or between two.
  const valuesIn = (c, d) => c.type === 'list' ? (d._m[field(c)]?.names?.length ? d._m[field(c)].names : [null]) : (v => [blank(v) ? null : v])(d[field(c)]);
  const later = (day, n) => { const [y, mo, d] = day.split('-').map(Number); return Tree.isoOf(new Date(y, mo - 1, d + n)); };
  function rangeOf(r, today = App.day.peek()) {
    return r.range === 'overdue' ? { to: later(today, -1) } : typeof r.range === 'number' ? { from: r.overdue ? null : today, to: later(today, r.range) } : { from: r.from, to: r.to };
  }
  const rangeWords = r => r.range === 'overdue' ? 'overdue' : typeof r.range === 'number' ? `${r.overdue ? 'overdue and ' : ''}next ${r.range} days`
    : `${r.from ? Tree.formatDate(r.from, 'short') : '…'} to ${r.to ? Tree.formatDate(r.to, 'short') : '…'}`;
  function filterOf(m, l = lookOf(m.view)) {
    const fs = Object.entries(l.filters ?? {}).map(([k, vs]) => [m.cols.find(c => c.key === k), vs]).filter(([c, vs]) => c && !(Array.isArray(vs) && !vs.length)).map(([c, vs]) => {
      // (Overdue is of what falls due: what's only past isn't late.)
      if (!Array.isArray(vs)) { const { from, to } = rangeOf(vs), f = field(c), late = vs.range === 'overdue' || vs.overdue; return d => { if (blank(d[f])) return false; const v = Tree.firstDay(d[f]); return (!from || v >= from) && (!to || v <= to) && (!late || v >= App.day.peek() || !!d._m[f]?.due); }; }
      const ok = new Set(vs.map(v => JSON.stringify(v)));
      return d => valuesIn(c, d).some(v => ok.has(JSON.stringify(v)));
    });
    return fs.length ? d => fs.every(ok => ok(d)) : null;
  }
  function filterBy(c, values) {
    const m = current, fs = { ...lookOf(m.view).filters };
    if (values) fs[c.key] = values; else delete fs[c.key];
    setLook(m.view, { filters: fs });
    refilter();
  }
  // (The button pressed goes with them, so the keys go back to the grid, at the cell it has.)
  const clearFilters = () => { setLook(current.view, { filters: null }); refilter(); setTimeout(focus); };
  function refilter() {
    if (!table || !ready) return;
    const p = gridFilter(current);
    if (current.groups) table.setGroupValues([grouped(current, p)]);
    if (p) table.setFilter(p); else table.clearFilter();
    funnels();
    relayout();
  }
  // The groups a grid shows: those the filters leave a row in, as a pivot leaves out what's empty.
  const grouped = (m, p) => m.groups.filter(g => m.data.some(r => r._g === g && (!p || p(r))));
  // ---- A row being typed stays where it is, in view, till it's left: then the filters and the sort apply to it, as to
  // any row come or changed, and the toast says where a filter hides it ----
  let keeping = null;
  // The grid's filter: the view's, but for the row being typed.
  const gridFilter = (m, l) => { const p = filterOf(m, l); return p && (d => d.id === keeping || p(d)); };
  function leave() {
    const id = keeping;
    if (!id || !table || !ready) return void (keeping = null);
    keeping = null;
    const p = filterOf(current), d = current.data.find(r => r.id === id);
    if (p && d && !p(d)) { refilter(); Shell.toast(`Added ${App.notes.peek().nameOf(App.state.peek(), id)}, which a filter hides`); }
    settleRow(id);
  }
  // Sorted, the rows are sorted again, so a row come or changed takes its place; not while a row is being typed.
  function resort() {
    const s = !keeping && table?.getSorters();
    if (s?.length) table.setSort(s.map(x => ({ column: x.field, dir: x.dir })));
  }
  // Left, a row typed goes where the sort says, or, with none, where the table's own order of its names does.
  function settleRow(id) {
    if (table.getSorters().length) return resort();
    const f0 = current?.cols[0] && field(current.cols[0]), row = table.rowManager.findRow(id), of = d => text(typeOf(current.cols[0], d), d[f0]);
    if (!row || !f0 || current.rows === 'date' || current.groups) return;
    const rows = table.getRows().filter(r => r.getData().id !== id), mine = of(row.getData()), at = rows.findIndex(r => of(r.getData()).localeCompare(mine) > 0);
    if (at >= 0) table.getRow(id).move(rows[at], true);
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
  const group = c => { still = null; setLook(current.view, { group: c?.key }); rebuild(); };
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
    const order = movable(), k = order.indexOf(c), writes = canWrite() && !!c.pattern, shows = canShow() && !!c.pattern;
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
      ...(shows ? [{ label: 'Hide column', run: () => show(c, false) }] : []),
      ...(writes ? [{ label: 'Move left', disabled: k <= 0, run: () => shift(c, -1) }, { label: 'Move right', disabled: k < 0 || k === order.length - 1, run: () => shift(c, 1) }] : []),
      ...(writes && c.fresh ? [{ label: 'Delete column', danger: true, run: () => dropColumn(c) }] : []),
      '-',
      i === frozen - 1 ? { label: 'Unfreeze columns', run: () => freeze(0) } : { label: 'Freeze up to here', run: () => freeze(i + 1) },
      { label: 'Fit width', run: () => fit(col) },
      l.group === c.key ? { label: 'Ungroup', run: () => group(null) } : { label: 'Group by this column', run: () => group(c) },
      ...(c.pattern && canShow() ? ['-', { label: 'Columns', items: columnItems(m) }] : []),
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
    // where it's kept; one whose edge the grid has scrolled under them can't be dropped before, but the first that scrolls
    // is dropped before at their edge, so a heading dropped beside them lands beside them, never past a column hidden
    // under them, and comes into view there. Each is where the rows are scrolled to, which the headings follow a frame later.
    const order = () => movable(), colOf = o => t.getColumns().find(x => x.getField() === field(o));
    const edges = () => {
      const os = order(), h = holder(), r = h.getBoundingClientRect(), stop = r.left + 48 + frozenWidth(t), x0 = r.left - h.scrollLeft, free = os.find(o => !PIN.test(colOf(o).getDefinition().cssClass));
      const at = (o, end) => {
        const col = colOf(o), e = col.getElement(), x = x0 + e.offsetLeft + (end ? e.offsetWidth : 0);
        return PIN.test(col.getDefinition().cssClass) ? e.getBoundingClientRect()[end ? 'right' : 'left'] : end ? Math.max(x, stop) : x >= stop - 1 ? x : o === free ? stop : null;
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
  // A date's, above its values: Overdue (before the day shown), the next 30, 60 or 90 days, or between two days.
  const RANGES = [['overdue', 'Overdue'], [30, 'Next 30 days'], [60, 'Next 60 days'], [90, 'Next 90 days']];
  function Filter({ c, view, close }) {
    looked.value;
    const [q, setQ] = useState(''), [none, setNone] = useState(false);   // `none`: every value unticked, which isn't applied
    const m = shownM.value;
    if (!m || m.view !== view) return null;
    const l = lookOf(view), on = l.filters?.[c.key] ?? null, ranged = !!on && !Array.isArray(on), rest = { ...l.filters };
    delete rest[c.key];
    const others = filterOf(m, { ...l, filters: rest }), inRange = ranged && filterOf(m, { filters: { [c.key]: on } });
    const counts = new Map();
    for (const r of m.data) if (r._red !== 'add' && (!others || others(r))) for (const v of valuesIn(c, r)) {
      const k = JSON.stringify(v);
      if (!counts.has(k)) counts.set(k, { v, k, n: 0, label: v === null ? 'Blank' : c.type === 'list' ? v : text(typeOf(c, r), v), in: false });
      counts.get(k).n++;
      if (inRange && inRange(r)) counts.get(k).in = true;
    }
    for (const v of Array.isArray(on) ? on : []) { const k = JSON.stringify(v); if (!counts.has(k)) counts.set(k, { v, k, n: 0, label: v === null ? 'Blank' : text(c.type, v) }); }
    const cmp = sorter(c), vals = [...counts.values()].sort((a, b) => cmp(a.v, b.v, null, null, null, 'asc'));
    const t = q.trim().toLowerCase(), list = t ? vals.filter(x => x.label.toLowerCase().includes(t)) : vals;
    const kept = none ? new Set() : new Set(ranged ? vals.filter(x => x.in).map(x => x.k) : (on ?? vals.map(x => x.v)).map(v => JSON.stringify(v))), isOn = x => kept.has(x.k);
    // Every value kept is no filter at all. None kept is no filter either, as Excel greys its OK: the grid stays as it was,
    // and Done waits for one to be ticked.
    const set = ks => { const v = vals.filter(x => ks.has(x.k)); setNone(!v.length); if (v.length) filterBy(c, v.length === vals.length ? null : v.map(x => x.v)); };
    const toggle = x => { const ks = new Set(kept); if (ks.has(x.k)) ks.delete(x.k); else ks.add(x.k); set(ks); };
    const every = list.length > 0 && list.every(isOn), some = list.some(isOn);
    const flipAll = () => { const ks = new Set(kept); list.forEach(x => every ? ks.delete(x.k) : ks.add(x.k)); set(ks); };
    // Enter, with something typed, keeps just what it finds.
    const keys = e => { if (e.key === 'Enter' && t && list.length) { e.preventDefault(); setNone(false); filterBy(c, list.map(x => x.v)); close(); } };
    const today = App.day.peek(), between = ranged && on.range === 'between';
    const day = (label, k) => html`<input class="cell date" aria-label=${label} spellcheck=${false} autocomplete="off" value=${on?.[k] ? Tree.formatDate(on[k], 'short') : ''}
      onChange=${e => { const d = Tree.firstDay(Tree.parseKnown(clean(e.target.value))); if (d || !clean(e.target.value)) filterBy(c, { ...on, [k]: d ?? null }); else e.target.setAttribute('aria-invalid', 'true'); }} />`;
    return html`<div class="tfilter" onKeyDown=${listKeys}>
      <input type="search" class="tf-find" placeholder="Find" aria-label="Find" value=${q} autofocus spellcheck=${false} onInput=${e => setQ(e.target.value)} onKeyDown=${keys} />
      ${c.type === 'date' ? html`<div class="tf-ranges" role="radiogroup" aria-label="Days">
        ${(c.key === '$value' || c.fx || m.data.some(r => r._m[field(c)]?.due) ? RANGES : RANGES.filter(([r]) => r === 'never')).map(([r, label]) => html`<label class="tf-row"><input type="radio" name="tf-range" checked=${ranged && on.range === r} onChange=${() => filterBy(c, { range: r, ...(typeof r === 'number' && on?.overdue && { overdue: true }) })} /><span class="v">${label}</span></label>`)}
        ${ranged && typeof on.range === 'number' ? html`<label class="tf-row with-late"><input type="checkbox" checked=${!!on.overdue} onChange=${e => filterBy(c, { range: on.range, ...(e.target.checked && { overdue: true }) })} /><span class="v">And what’s overdue</span></label>` : null}
        <label class="tf-row"><input type="radio" name="tf-range" checked=${between} onChange=${() => filterBy(c, { range: 'between', from: today, to: later(today, 30) })} /><span class="v">Between…</span></label>
        ${between ? html`<div class="tf-between">${day('From', 'from')}<span>and</span>${day('To', 'to')}</div>` : null}
      </div>` : null}
      <div class="tf-list" role="group" aria-label=${headed(c)}>
        ${list.length ? html`<label class="tf-row all"><input type="checkbox" ref=${x => { if (x) x.indeterminate = some && !every; }} checked=${every} onChange=${flipAll} /><span class="v">Select all</span></label>` : html`<div class="tf-none">No match</div>`}
        ${list.map(x => html`<label class="tf-row" key=${x.k}><input type="checkbox" checked=${isOn(x)} onChange=${() => toggle(x)} /><span class=${'v' + (x.v === null ? ' muted' : '')}>${x.label}</span><span class="n">${x.n}</span></label>`)}
      </div>
      <div class="tf-foot"><button type="button" class="btn" disabled=${!on && !none} onClick=${() => { setNone(false); filterBy(c, null); }}>Clear filter</button><button type="button" class="btn primary" disabled=${none} onClick=${close}>Done</button></div>
    </div>`;
  }
  // A list of ticks under a search, as Excel's are, moved through by the arrows: Down from the search to the first, Up from
  // the first back to it; Space or Enter ticks; a letter typed goes on to the search.
  function listKeys(e) {
    const box = e.currentTarget, find = box.querySelector('input[type="search"]'), ticks = [...box.querySelectorAll('input[type="checkbox"]:not(:disabled)')], i = ticks.indexOf(e.target), at = e.target === find ? -1 : i;
    if (e.target !== find && i < 0) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const to = at + (e.key === 'ArrowDown' ? 1 : -1);
      (to < 0 ? find : ticks[Math.min(to, ticks.length - 1)])?.focus();
    } else if (i >= 0 && e.key === 'Enter') { e.preventDefault(); e.target.click(); }
    else if (i >= 0 && e.key.length === 1 && e.key !== ' ' && !e.ctrlKey && !e.metaKey && !e.altKey) find?.focus();
  }

  // ---- Above the grid: its columns, and how it's sorted, filtered and grouped, each saying so while it's on ----
  const shownM = Shell.signal(null);
  function Tools() {
    looked.value;
    const m = shownM.value, view = Shell.view.value;
    if (!m || m.view !== view) return null;
    const l = lookOf(view), by = k => m.cols.find(c => c.key === k);
    const sortC = l.sort && by(l.sort.key) && drawn(by(l.sort.key)) ? by(l.sort.key) : null, groupC = l.group && m.named && by(l.group), fs = Object.keys(l.filters ?? {}).map(by).filter(Boolean);
    const total = m.data.filter(r => r._red !== 'add').length, showing = table && ready ? table.getRows('active').filter(r => r.getData()._red !== 'add').length : total;   // the rows as kept, not copies of them
    // The record selected (in Find, say) a row the filters leave out: it stays selected, and the bar says so.
    const sel = Shell.selection.value[0], passes = fs.length && gridFilter(m, l), out = passes && m.data.find(r => r.id === sel && r._red !== 'add' && !passes(r));
    return html`<div class="tbar" role="toolbar" aria-label="Table">
      <button type="button" class="btn ghost dd" data-tool="columns" aria-haspopup="dialog" onClick=${e => Shell.popover(e.currentTarget, () => html`<${Columns} view=${view} />`, { placement: 'bottom-start' })}>Columns</button>
      <button type="button" data-tool="sort" class=${'btn ghost dd' + (sortC ? ' on' : '')} aria-haspopup="menu" onClick=${e => sortMenu(e.currentTarget)}>${sortC ? `${headed(sortC)}, ${sortWords(sortC)[l.sort.dir === "desc" ? 1 : 0]}` : "Sort"}</button>
      <button type="button" data-tool="filter" class=${'btn ghost dd' + (fs.length ? ' on' : '')} aria-haspopup="menu" onClick=${e => filterMenu(e.currentTarget)}>${fs.length ? html`Filtered by ${list(fs.map(c => Array.isArray(l.filters[c.key]) ? headed(c) : `${headed(c)}, ${rangeWords(l.filters[c.key])}`))}` : 'Filter'}</button>
      <button type="button" data-tool="group" class=${"btn ghost dd" + (groupC ? " on" : "")} aria-haspopup="menu" onClick=${e => groupMenu(e.currentTarget)}>${groupC ? `Grouped by ${headed(groupC)}` : m.rows === "date" ? "Grouped by month" : "Group"}</button>
      ${fs.length ? html`<button type="button" class="btn ghost" onClick=${clearFilters}>Clear filters</button>` : null}
      ${m.isDatatype ? null : html`<button type="button" class="btn ghost" disabled=${App.readOnly.value} onClick=${importFile}>Import…</button>`}
      <button type="button" data-tool="blanks" class=${'btn ghost' + (l.blanks ? ' on' : '')} aria-pressed=${!!l.blanks} onClick=${() => { setLook(view, { blanks: l.blanks ? undefined : true }); el?.classList.toggle('marks-blanks', !l.blanks); }}>Blanks</button>
      ${m.ended?.length ? html`<span class="tout ended" role="status"><span>${l.ended ? `With ${m.ended.length} ended` : `${m.ended.length} ended left out`}</span><button type="button" class="lk" data-tip=${m.ended.slice(0, 6).map(e => `${e.name}, ${Tree.formatDate(e.day, 'short')}`).join('; ')} onClick=${() => { setLook(view, { ended: l.ended ? undefined : true }); drewFrom = null; refresh(); }}>${l.ended ? 'Leave out' : 'Include'}</button></span>` : null}
      ${out ? html`<span class="tout" role="status"><b>${rowName(sel)}</b> is filtered out<span class="sep">·</span><button type="button" class="lk" onClick=${() => { clearFilters(); setTimeout(() => track(sel)); }}>Clear filters</button></span>` : null}
      ${m.later?.length ? html`<span class="tout later" role="status">${m.later.length} ${m.later.length === 1 ? 'starts' : 'start'} later:${' '}<button type="button" class="lk" onClick=${() => Shell.at({ asOf: m.later[0].day })}><b>${m.later[0].name}</b>, ${Tree.formatDate(m.later[0].day, 'short')}</button>${m.later.length > 1 ? ` and ${m.later.length - 1} more` : ''}</span>` : null}
      <span class="tcount">${m.rows?.args && App.definitions.value.some(d => d.edges && App.broken.value.reach.has(d.id) && Tree.same(d.name, App.notes.value.name(m.rows))) ? html`<span class="no">Can’t be relied on</span> · ` : null}${showing !== total ? `${showing} of ${count(total, m.noun)}` : count(total, m.noun)}</span>
    </div>`;
  }
  // A row's record by name, short as a list of dates says it (Time.whose): an object by its short name, a relation by its
  // sides as the chart joins them.
  const rowName = id => Time.whose(App.state.peek(), id, App.notes.peek());
  function sortMenu(anchor) {
    const m = current, l = lookOf(m.view), sc = l.sort && m.cols.find(c => c.key === l.sort.key);
    Shell.menu(anchor, [
      ...(sc ? [{ seg: sortWords(sc).map((w, i) => ({ label: w[0].toUpperCase() + w.slice(1), pressed: l.sort.dir === (i ? 'desc' : 'asc'), run: () => { Shell.closeAll(); sortBy(sc, i ? 'desc' : 'asc'); } })) }, '-'] : []),
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
    // Dates are grouped by month till grouped otherwise: by whose, or by what falls due.
    const m = current, g = lookOf(m.view).group;
    Shell.menu(anchor, [{ label: m.rows === 'date' ? 'Month' : 'None', checked: !g, run: () => group(null) }, '-', ...m.cols.filter(drawn).map(c => ({ label: headed(c), checked: c.key === g, run: () => group(c) }))]);
  }
  // How many columns stay in view: up to any of them, as its heading's menu says it, or none.
  function freezeMenu(anchor) {
    const m = current, frozen = frozenOf(lookOf(m.view)), cs = table.getColumns().filter(c => c.getField()).map(c => m.byField.get(c.getField()));
    Shell.menu(anchor, [...cs.map((c, i) => ({ label: `Freeze up to ${headed(c)}`, checked: frozen === i + 1, run: () => freeze(i + 1) })), '-', { label: 'Unfreeze columns', checked: frozen === 0, run: () => freeze(0) }]);
  }
  // Every column as wide as what it holds, the widths given it let go.
  const fitColumns = () => { setLook(current.view, { widths: null }); rebuild(); };
  // The table's commands, for Find, by the words for each, with why not where they can't run.
  const tool = name => el?.querySelector(`.tbar [data-tool="${name}"]`);
  [{ id: 'table.clear', name: 'Clear filters', names: ['Show all rows', 'Unfilter', 'No filter', 'Remove filter'], enabled: () => !!current && !!Object.keys(lookOf(current.view).filters ?? {}).length, why: () => current ? 'No filter is on' : 'Show a table first', run: clearFilters },
    { id: 'table.delete', name: 'Delete this row…', names: ['Delete', 'Delete row', 'Remove row', 'End…', 'Dissolve…'], keys: '$mod+Minus', enabled: () => !!current && !current.red && !!table?.modules.selectRange?.getActiveCell() && !!el?.offsetParent && !App.readOnly.peek(), why: () => (current ? App.whyNot() : 'Show a table first'), run: deleteRows },
    { id: 'table.sort', name: 'Sort by…', names: ['Sort', 'Sort column', 'Sort rows', 'Order by'], run: () => sortMenu(tool('sort')) },
    { id: 'table.filter', name: 'Filter…', names: ['Filter', 'Filter column', 'Filter rows', 'Show only'], run: () => filterMenu(tool('filter')) },
    { id: 'table.group', name: 'Group by…', names: ['Group', 'Subtotal', 'Pivot'], run: () => groupMenu(tool('group')) },
    { id: 'table.freeze', name: 'Freeze…', names: ['Freeze columns', 'Freeze panes', 'Unfreeze', 'Lock columns'], run: () => freezeMenu(tool('columns')) },
    { id: 'table.fit', name: 'Fit columns', names: ['Autofit', 'Fit width', 'Column width', 'Resize columns'], run: fitColumns },
  ].forEach(a => { const shownHere = () => viewOf(Shell.view.peek())?.layout === 'table' && !!current && ready;
    Shell.register('action', { ...a, enabled: () => shownHere() && (a.enabled?.() ?? true), why: () => (shownHere() && a.why?.()) || 'Show a table first',
      // (A chart filters by what it knows of each box, as a table does by what it holds, by the one word.)
      ...(a.id === 'table.filter' && { enabled: () => shownHere() || (typeof Canvas !== 'undefined' && viewOf(Shell.view.peek())?.layout === 'chart' && App.canAsk()), run: () => (viewOf(Shell.view.peek())?.layout === 'chart' ? Canvas.active.peek()?.filter() : filterMenu(tool('filter'))) }) }); });
  // Every column, each a checkbox that shows or hides it, dragged by its row to reorder; and a new one, named as it's typed.
  // Opened, those ticked come first; a row then stays where it is as it's ticked or unticked, so nothing moves under the
  // pointer, and the search finds among them all. Show all and Hide all are at its top, what names the rows always kept.
  const GRIP = Shell.iconMarkup('grip');
  const pathed = c => c.parent ? html`<span class="up">${c.parent} › </span>${c.title}` : c.title;
  function Columns({ view }) {
    looked.value;
    const ref = useRef(), [typingName, setNaming] = useState(false), [found0, setQ] = useState(['', view]);
    const m = shownM.value, q = found0[1] === view ? found0[0] : '';   // what's typed is the view's: another table starts afresh
    if (!m || m.view !== view) return null;
    // (The table's own order, every time it's opened, so a row is where it was: none moves for being ticked.)
    const rows = m.cols;
    // Found as they're typed, as a long list's fields are; dragged among those found, each lands among them all, after the
    // row it's dropped after, and among the ticked or the rest as that row is.
    // (A list is found by what it holds as well as what it's called: Taxed For, by "annual tax".)
    const t = q.trim().toLowerCase(), found = c => !t || [called(c), c.holds, c.reach].some(x => x?.toLowerCase().includes(t));
    const writes = canWrite(), shows = canShow(), mv = m.cols.filter(c => c.pattern), vis = rows.filter(c => c.pattern && found(c)), kept = keptOf(m);
    const down = (e, c) => {
      if (!writes || e.target.closest('input, button')) return;
      Shell.drag(e, { item: e.currentTarget, items: [...ref.current.querySelectorAll('.colrow.mv')], onDrop: (from, i) => {
        const a = vis[from], rest = vis.filter(x => x !== a), o = mv.filter(x => x !== a), before = rest[i - 1], next = rest[i];
        o.splice(before ? o.indexOf(before) + 1 : next ? o.indexOf(next) : o.length, 0, a);
        place(o, undefined, undefined, a);
      } });
    };
    const add = e => { if (e.key === 'Enter') { e.preventDefault(); if (addColumn(e.target.value)) e.target.value = ''; } else if (e.key === 'Escape') { e.stopPropagation(); setNaming(false); } };
    return html`<div class="cols" ref=${ref} onKeyDown=${listKeys}>
      <input type="search" class="col-find" placeholder="Find" aria-label="Find" value=${q} spellcheck=${false} onInput=${e => setQ([e.target.value, view])} />
      ${mv.length ? html`<div class="col-all"><button type="button" class="btn ghost" disabled=${!shows || vis.every(c => c.shown)} onClick=${() => showEvery(m, true, vis)}>Show all</button>
        <button type="button" class="btn ghost" disabled=${!shows || vis.every(c => !c.shown || kept.includes(c))} onClick=${() => showEvery(m, false, vis)}>Hide all</button>
        ${lookOf(view).shown ? html`<button type="button" class="btn ghost col-keep" aria-disabled=${writes ? null : 'true'} data-tip=${writes ? null : App.whyNot()} onClick=${() => (writes ? keepColumns(m) : Shell.toast(App.whyNot()))}>Keep these</button>` : null}</div>` : null}
      <div class="cols-list">
      ${rows.filter(found).map(c => c.pattern
        ? html`<div class="colrow mv" key=${c.key} onPointerDown=${e => down(e, c)}><span class="colgrip" aria-hidden="true" dangerouslySetInnerHTML=${{ __html: GRIP }} />
            <label><input type="checkbox" checked=${c.shown} disabled=${!shows} onChange=${() => show(c, !c.shown)} /><span>${pathed(c)}</span></label></div>`
        : html`<div class="colrow" key=${c.key}><span class="colgrip" /><label><input type="checkbox" checked disabled /><span>${pathed(c)}</span></label></div>`)}
      ${m.base && writes ? typingName
        ? html`<div class="colrow new"><span class="colgrip" /><input class="col-new" placeholder="New column" aria-label="New column" spellcheck=${false} ref=${x => x && !x.dataset.on && (x.dataset.on = 1, x.focus())} onKeyDown=${add} onBlur=${e => { if (!clean(e.target.value)) setNaming(false); }} /></div>`
        : html`<button type="button" class="colrow new" onClick=${() => setNaming(true)}><span class="colgrip">${Shell.icon('plus')}</span><span>New column</span></button>` : null}
      </div>
    </div>`;
  }

  // A list a formula gives a record, as a table (the panel's Open … as a table, and Find): its relation's rows, with why
  // each holds, in the table of them the chart has, or a new one named for the list; and, where others have such lists,
  // this record's, by a filter of its side.
  function openList(name, rid, at) {
    const st = App.state.peek(), N = App.notes.peek(), rows = App.layouts.peek().relations.find(l => Tree.fits(st, rid, l.rows))?.rows;
    if (!rows) return;
    // Opening it is looking (dendra.md, Workbook): a table the chart has shows Why for this window; or else one's opened for this
    // window, which a tab of its own says, and Keep makes the chart's.
    if (Shell.time.peek()?.stood) return Shell.toast(App.whyNot());
    let v = App.views.peek().find(x => x.layout === 'table' && JSON.stringify(x.rows) === JSON.stringify(rows))?.id;
    if (!v) v = App.lookTable(name, rows, true);
    else if (N.value('Shown', { id: v, kind: 'View' }, v, 'Why') !== true) seeColumns(v, [{ key: '$why', title: 'Why' }], true);
    if (!v) return;
    const side = st[rid].args.find(a => Tree.objectOf(st, a.at) === at), held = new Set(Object.keys(st).filter(id => st[id].args?.length > 1 && Tree.fits(st, id, rows)).map(id => Tree.objectOf(st, st[id].args.find(a => same(a.edge, side?.edge))?.at)));
    if (side && held.size > 1) setLook(v, { filters: { ...lookOf(v).filters, ['@' + norm(side.edge)]: [N.nameOf(st, at)] } });
    Shell.show(v);
  }

  // ---- The new row, under the last: a name typed there makes a record of the table's kind, as one change; a relation's
  // asks its sides, each from the objects that side can be (or a new one, named), and waits on Enter as a relation added does ----
  function NewRow() {
    looked.value;
    const m = shownM.value;
    if (!m || m.isDatatype || m.red || App.readOnly.value) return null;
    const label = `New ${m.noun}`;
    if (m.isKind) return html`<div class="newrow"><span class="plus">${Shell.icon('plus')}</span>
      <input class="nr-name" placeholder=${label} aria-label=${label} spellcheck=${false} autocomplete="off" onKeyDown=${newName} onPaste=${pastedNew} /></div>`;
    // While its sides are picked, the row says those picked, and the side asked for next.
    const so = choosing.value;
    return html`<div class="newrow"><span class="plus">${Shell.icon('plus')}</span><button type="button" class=${'nr-go' + (so ? ' on' : '')} aria-haspopup="menu" onKeyDown=${offNew} onClick=${e => relate(e.currentTarget)}>${so
      ? html`${so.picked.map(n => html`<span class="nr-side">${n}</span><span class="nr-to">→</span>`)}<span class="nr-next">${so.next}</span>` : label}</button></div>`;
  }
  const choosing = Shell.signal(null);
  // Enter makes it and stays for the next; Tab makes it and goes on to its next cell; Esc leaves it.
  // Nothing typed, the arrows leave it as they would a cell: Up to the row over it, Right to that row's next cell.
  function offNew(e) {
    if (e.currentTarget.value || (e.key !== 'ArrowUp' && e.key !== 'ArrowRight') || !table || !ready) return false;
    const rows = shownRows(), row = rows.find(r => r.getData().id === keeping) ?? rows.at(-1), cols = table.getColumns().filter(c => c.getField()), col = cols[e.key === 'ArrowRight' ? 1 : 0] ?? cols[0];
    if (!row || !col) return false;
    e.preventDefault(); e.stopPropagation();
    table.addRange(row.getCell(col), row.getCell(col));
    focus();
    reveal(row.getData().id);
    across();
    return true;
  }
  // Rows pasted there, not one name: Import, with them shown.
  function pastedNew(e) {
    const s = e.clipboardData?.getData('text') ?? '';
    if (!/[\t\n]/.test(s.trim())) return;
    e.preventDefault();
    importDialog({ text: s });
  }
  function newName(e) {
    const input = e.currentTarget, s = clean(input.value);
    if (offNew(e)) return;
    // Esc goes back to the grid as it stands: to the row just made, selected, or, with none, wherever it's scrolled.
    if (e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation(); input.value = '';
      inside = true;
      holder()?.focus({ preventScroll: true });
      if (keeping && inGrid(keeping)) Shell.select([keeping]);
      return;
    }
    if ((e.key !== 'Enter' && e.key !== 'Tab') || !s) return;
    e.preventDefault();
    const m = current;
    let id = null;
    leave();
    // The row made is the row being typed, kept in view under the filters till it's left.
    // And related to nothing a page draws, it isn't placed on it: the toast offers Show (App.keepOff).
    let off = [];
    if (!App.change(tx => { id = keeping = tx.add('record', { kind: m.rows.kind }); tx.add('record', { at: id, edge: 'Name', field: 'text', value: s }); off = App.keepOff(tx, [id]); },
      { say: () => (off.length ? `${s} isn’t on ${off[0].name}` : null), go: () => (off.length ? ['Put on the chart', () => App.change(tx => tx.note('Shown', { id, kind: m.rows.kind }, true, { view: off[0].id }), { say: c => Time.describe(c) })] : null) })) { keeping = null; return; }
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
  // Once a record made is a row of the grid (or the grid's filters leave it out, a relation's, which the toast says).
  function landed(id, then, tries = 40) {
    if (inGrid(id)) return then();
    if (table?.rowManager.findRow(id)) return Shell.toast(`Added ${App.notes.peek().nameOf(App.state.peek(), id)}, which a filter hides`, { undo: () => Shell.parts.peek().undo?.undo() });
    if (tries) setTimeout(() => landed(id, then, tries - 1), 25);
  }
  function relate(anchor) {
    const m = current, sides = m.cols.filter(c => c.type === 'edge'), picked = {}, st = App.state.peek();
    const say = o => typeof o === 'string' ? saidOf(st, o) : clean(o.name);
    const next = i => {
      if (i === sides.length) return addRelation(m, sides, picked);
      choosing.value = { picked: sides.slice(0, i).map(c => say(picked[c.edge])), next: sides[i].title };
      pickSide(anchor, m, sides[i], o => { picked[sides[i].edge] = o; next(i + 1); }, new Map(sides.filter(c => typeof picked[c.edge] === 'string').map(c => [norm(c.edge), picked[c.edge]])));
    };
    next(0);
  }
  // One side, from the objects it can be, found as they're typed; or a new one of each kind it can be, that most like it first.
  function pickSide(anchor, m, c, done, other = new Map()) {
    const st = App.state.peek(), N = App.notes.peek(), rel = onRelation(m, c.edge), first = rel ? null : kindAt(m, c.edge, other), kinds = rel ? [] : [first, ...sideKindNames(m, c.edge).filter(k => !same(k, first))];
    const all = rel ? sideRecords(m, c.edge).map(x => ({ ...x, short: x.name })) : [...sideKinds(m, c.edge)].flatMap(k => Tree.index(st).kinds.get(k) ?? []).map(id => ({ id, name: N.nameOf(st, id), short: N.shortOf(st, id) }))
      .sort((a, b) => a.name.localeCompare(b.name));
    Shell.menu(anchor, q => {
      // Found as typed, or as people write it ("Partners III LP"); a new one offered only where none reads alike, and where
      // the name isn't of a record the side doesn't take, which is said instead.
      const t = norm(q), l = loose(q), hit = all.filter(x => !t || norm(x.name).includes(t) || norm(x.short).includes(t) || (l && loose(x.name).includes(l)));
      const wrong = q && l && !hit.length ? otherKind(m, c.edge, q) : null;
      return [{ head: c.title }, ...hit.slice(0, 60).map(x => ({ label: x.name, run: () => done(x.id) })), ...(wrong ? [{ label: wrong }] : []),
        ...(!wrong && q && l && !all.some(x => loose(x.name) === l || loose(x.short) === l) ? kinds.map(kind => ({ label: `New ${kind}: ${q}`, run: () => done({ name: q, kind }) })) : [])];
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
      ...(asks && { asks: 'from', day: App.begins(), auto: true }), needs: args.map(a => a.at).filter(id => id in entered),
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

  // The rows of the cells selected, deleted as Delete on rows selected whole deletes them: their bar first.
  function deleteRows() {
    if (App.readOnly.peek()) return Shell.toast(App.whyNot());
    const ids = [...new Set(cellsOf().map(c => c.getRow().getData().id))].filter(id => id in App.entered.peek());
    if (ids.length) deletion(ids).stage(); else Shell.toast('Nothing here can be deleted');
  }
  // What the keys do in a table, for the list of them.
  Shell.register('keys', { head: 'In a table', rows: [['Arrows', 'Move'], ['Enter', 'Down, to where a run of Tabs began'], ['Shift+Enter', 'Up'], ['Tab', 'Across'], ['Shift+Tab', 'Back across'], ['A letter', 'Type over the cell, or find its option'], ['F2', 'Edit the cell, or open its list'], ['Alt+ArrowDown', 'A list’s cell: open its list; any other: its column’s menu'], ['Delete', 'Clear the cells; rows selected whole, delete them'], ['Space', 'Tick a box; on one a rule covers, say why'],
    ['$mod+Space', 'Select the column'], ['Shift+Space', 'Select the row'], ['$mod+KeyA', 'Select everything'], ['Shift+Arrows', 'Stretch what’s selected'], ['Home End', 'First and last cell of the row'], ['$mod+Home $mod+End', 'First and last cell of the grid'], ['$mod+KeyC', 'Copy'], ['$mod+KeyV', 'Paste'], ['$mod+KeyD', 'Fill down'], ['$mod+KeyR', 'Fill right'], ['$mod+Enter', 'What’s typed in every cell selected'], ['Shift+F10', 'The row’s menu'], ['F6', 'To the toolbar, the bar’s day or the panel']] });
  // ---- A cell's menu: what applies to the cells selected and their rows ----
  const m0ours = (id, c) => { const st = App.state.peek(), o = c.up ? st[id]?.at : id; return st[o]?.kind ? o : null; };
  function rowMenu(e, row) {
    const cell = row.getCells().find(x => x.getElement().contains(e.target) && x.getField()), c = cell && columnOf(cell);
    const ids = [...new Set([row.getData().id, ...[...picked].filter(inGrid)])].filter(id => id in App.entered.value);
    const writes = canWrite(), d = ids.length && writes && deletion(ids), cs = cellsOf(), many = new Set(cs.map(x => x.getRow())).size > 1;
    const settles = typeof Inspector !== 'undefined' && Inspector.settling?.(row.getData().id);
    // A blank cell of a record's own value or list: what says it isn't ours (dendra.md, Ours to track).
    const oursAt = c && !c.key.startsWith('$') && c.type !== 'tag' && m0ours(row.getData().id, c), says = oursAt && cell.getValue() === null && App.notOurs(oursAt, c.title);
    // A rule's box: typed over, or back to the rule, as its entry's menu in the panel has it.
    const m = writes && c && atCell(cell), ruled = c?.type === 'tag' && m?.id && 'tag' in (App.state.peek()[m.id] ?? {}) && App.computed.peek().computed?.[m.id];
    const ruling = !m ? null : m.cant ? { label: 'Override…', run: () => App.overriding(null, { at: m.at, edge: c.path.at(-1) }) } : ruled ? { label: 'Override…', run: () => App.overriding(m.id) } : m.over ? { label: 'Back to the rule…', run: () => App.backToRule(m.id) } : null;
    Shell.menu({ x: e.clientX, y: e.clientY }, [
      ...(writes && oursAt && cell.getValue() === null ? [{ label: says ? 'Ours after all…' : 'Not ours…', run: () => App.sayNotOurs(oursAt, c.title, !says) }, '-'] : []),
      // A deadline's row: what settles it (Paid…, Filed…), as its panel's button does.
      ...(settles ? [settles, '-'] : []),
      ...(ruling ? [ruling, '-'] : []),
      { label: 'Copy', keys: '$mod+KeyC', run: () => table.copyToClipboard('range') },
      ...(writes ? [{ label: 'Clear contents', keys: 'Delete', run: clear }, { label: 'Fill down', keys: '$mod+KeyD', run: () => fillFrom(true) }] : []),
      ...(c ? ['-', { label: 'Filter by this value', run: () => filterBy(c, valuesIn(c, row.getData())) }] : []),
      ...(!current.isDatatype && writes ? ['-', { label: `New ${current.noun}`, run: () => rowEl?.querySelector('input, button')?.[current.isKind ? 'focus' : 'click']() }] : []),
      // Named for what it records, as the panel's and the chart's are (App.deleteVerb).
      ...(d ? [{ label: `${App.deleteVerb(ids)}${ids.length > 1 || many ? ` ${count(ids.length, 'row')}` : ''}…`, keys: '$mod+Minus', danger: true, point: on => FormulaBar.preview(on ? d.change : null), run: () => { FormulaBar.preview(null); d.stage(); } }] : []),
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
  function unhold() { chosen = null; const sr = table.modules.selectRange; sr.clearRanges(); sr.activeRange = false; sr.layoutElement(); sr.overlay.style.visibility = 'hidden'; }
  // What's selected is records and columns, not places on the screen (`chosen`: the range's rows by their records, its
  // columns by their fields, as it was last made). Sorted, filtered, grouped, built again, or with rows come or gone, the
  // range follows them: the run of them in a row from the first that's still shown, or nothing where they're all gone. So
  // the status bar counts, sums and averages what was selected, always.
  let chosen = null, following = false;
  const shownRows = () => table.rowManager.getDisplayRows().filter(r => r.type === 'row').map(r => r.getComponent());
  function remember(range) {
    if (following || arranging || !table) return;
    const r = range ?? table.getRanges().at(-1), rows = r?.getRows() ?? [];
    chosen = !rows.length ? null : { rows: rows.map(x => x.getData().id), cols: r.getColumns().map(c => c.getField()).filter(Boolean), whole: rows.length > 1 && rows.length === shownRows().length };
  }
  function stay() {
    // A range just made is placed a moment later, and is then what's chosen (remember).
    const pending = table?.modules.selectRange?.activeRange;
    if (!chosen || !table || !ready || (pending && !pending.initialized)) return;
    const shown = shownRows(), at = new Map(shown.map((r, i) => [r.getData().id, i])), was = chosen;
    const idx = was.whole ? shown.map((_, i) => i) : was.rows.map(id => at.get(id)).filter(i => i !== undefined).sort((x, y) => x - y);
    const cols = table.getColumns().filter(c => was.cols.includes(c.getField()));
    following = true;
    try {
      if (!idx.length || !cols.length) return unhold();
      let b = idx[0];
      while (idx.includes(b + 1)) b++;
      const rows = shown.slice(idx[0], b + 1), r = table.getRanges()[0], ids = rs => rs.map(x => x.getData().id).join(), fs = cs => cs.map(c => c.getField()).join();
      if (!r || ids(r.getRows()) !== ids(rows) || fs(r.getColumns().filter(c => c.getField())) !== fs(cols)) hold(rows[0].getCell(cols[0]), rows.at(-1).getCell(cols.at(-1)));
      chosen = { ...was, rows: rows.map(x => x.getData().id) };
      // Kept to fewer of them than were selected (the rest gone apart), the records selected are those it keeps.
      if (!was.whole && rows.length < was.rows.length && was.rows.some(id => Shell.selection.peek().includes(id))) { picking = true; Shell.select(chosen.rows.filter(id => App.state.peek()[id])); picking = false; }
    } finally { following = false; tally(); }
  }
  function pick() {
    const range = ready && table?.modules.selectRange?.activeRange;
    if (!range?.initialized || range.destroyed || !current) return;
    const rows = range.getComponent().getRows(), all = table.getRows('active').length;
    if (!rows.length || (rows.length === all && all > 1)) return;
    // A scheduled date's row is the record it's of, though that starts later.
    const st = App.state.peek(), ids = [...new Set(rows.map(r => r.getData()._rec ?? r.getData().id))].filter(id => st[id] || App.heldFrom(id) || App.heldUntil(id));
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
    if (!table || table.modules.edit?.currentCell || e.target.closest('.tabulator-header') || locked()) return;
    const cell = table.modules.selectRange?.getActiveCell()?.getComponent(), mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    const rows = table.getRows('active'), cols = table.getColumns().filter(c => c.getField()), r0 = table.getRanges()[0];
    const to = (a, b = a) => { e.preventDefault(); if (a && b) table.addRange(a, b); };
    // (Everything is everything, whether a cell's been placed yet or not.)
    if (k === 'a' && mod && !e.shiftKey && !e.altKey) return rows.length && to(rows[0].getCell(cols[0]), rows.at(-1).getCell(cols.at(-1)));
    if (!cell) return;
    if (e.key === ' ' && mod && !e.shiftKey) { const cs = r0.getColumns().filter(c => c.getField()); return rows.length && to(rows[0].getCell(cs[0]), rows.at(-1).getCell(cs.at(-1))); }
    if (e.key === ' ' && e.shiftKey && !mod) { const rs = r0.getRows(); return to(rs[0]?.getCell(cols[0]), rs.at(-1)?.getCell(cols.at(-1))); }
    if (e.key === 'Home' || e.key === 'End') {
      const row = mod ? rows[e.key === 'Home' ? 0 : rows.length - 1] : cell.getRow();
      to(row.getCell(cols[e.key === 'Home' ? 0 : cols.length - 1]));
      reveal(row.getData().id);
      if (e.key === 'Home') { const h = holder(); if (h) h.scrollLeft = 0; return; }
      return across();
    }
    if (/^(Arrow|Page)/.test(e.key)) offRow();
    if (/^(ArrowLeft|ArrowRight)$/.test(e.key)) return across();
    if (mod && (k === 'd' || k === 'r') && !e.shiftKey && !e.altKey) { e.preventDefault(); if (canWrite()) fillFrom(k === 'd'); return; }
    if (e.key === 'F2') { e.preventDefault(); if (canEdit(cell)) { ranged = cellsOf(); atEnd = true; cell.edit(true); if (!table.modules.edit.currentCell) atEnd = false; } return; }
    // Delete clears the cells of the range; rows selected whole, by their numbers, it deletes, after the redline.
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); if (App.readOnly.peek()) return Shell.toast(App.whyNot()); const ids = wholeRows(); if (ids.length) deletion(ids).stage(); else clear(); }
    else if (e.key === ' ' && columnOf(cell)?.type === 'tag') { e.preventDefault(); flip(cell); }
    else if (e.key.length === 1 && !mod && !e.altKey && cell.getField()) {
      const c = columnOf(cell);
      if (App.readOnly.peek() && c.type !== 'tag') return Shell.toast(App.whyNot());
      if (c.type === 'tag' || !canEdit(cell)) return;
      // What's typed begins the value, or in a choice finds its option.
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
      tools.dataset.region = 'tools';
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
        effect(() => { App.state.value; App.notes.value; App.schema.value; Shell.time.value; viewed.value; refresh(); }),
        // What the grid began on the bar done with, the keys come back to it (App.after puts them in the view).
        effect(() => { if (App.pending.value?.typed || !ran) return; ran = false; setTimeout(() => setTimeout(() => { const a = document.activeElement; if (el?.offsetParent && (!a || a === document.body || a.id === 'view')) focus(); })); }),
        // The rows of the records selected are marked; selected elsewhere, the first is brought into view, its row the keys'.
        effect(() => { const ids = Shell.selection.value, id = ids[0]; mark(); if (!picking) preactSignals.untracked(() => track(id)); if (keeping && ids.length && !ids.includes(keeping)) setTimeout(leave); if (still && !picking && !inside) setTimeout(letGo); }),
      ];
      return () => { offs.forEach(f => f()); sized.disconnect(); shown.disconnect(); preact.render(null, tools); preact.render(null, rowEl); table?.destroy(); table = null; el = cells = rowEl = pins = null; };
    },
    focus,
    // What the active cell says, where a formula gives it, or a rule covers it: F1 asks why of that.
    whyAt: () => { const c = el?.offsetParent && table?.modules.selectRange?.getActiveCell()?.getComponent(), m = c && c.getField() && atCell(c); return m?.id ?? null; },
  });

  // What a file of the table writes, as its Export and its first line say it: its rows, filtered by what, sorted how, and what's ended that it leaves out.
  // What a filter leaves by what's there now: a row kept under the cursor that no longer passes it stays on the screen, and isn't in a file said to be filtered.
  const stands = () => { const p = filterOf(current), ds = table.getRows('active').map(r => r.getData()); return p ? ds.filter(p) : ds; };
  function rowsWords(all = false) {
    const m = current, l = lookOf(m.view), by = k => m.cols.find(c => c.key === k), n = table.getRows().length, shown = stands().length;
    const said = k => { const c = by(k), on = l.filters[k]; if (!c) return null; if (!Array.isArray(on)) return `${headed(c)} (${rangeWords(on)})`; const vs = on.map(v => v === null ? 'Blank' : c.type === 'list' ? v : text(c.type, v)); return `${headed(c)} (${vs.length > 3 ? `${vs.length} values` : vs.join(', ')})`; };
    const fs = Object.keys(l.filters ?? {}).map(said).filter(Boolean), s = !all && l.sort && by(l.sort.key), sorted = s && drawn(s) ? s : null;
    const left = !l.ended && m.ended?.length ? `; leaves out ${m.ended.length} ended (${m.ended.length > 2 ? count(m.ended.length, m.noun) : m.ended.map(e => `${e.name}, ${Tree.formatDate(e.day, 'short')}`).join('; ')})` : '';
    return `${all || shown === n ? `All ${count(n, m.noun)}` : `${shown} of ${count(n, m.noun)}, filtered by ${list(fs)}`}${sorted ? `, sorted by ${headed(sorted)}` : ''}${left}`;
  }
  // ---- Export: what the table shows, in its order, as an Excel workbook or as CSV, while a table is shown ----
  const VENDOR = new URL('../../vendor/', SCRIPT);
  let sheetjs = null;
  const loadSheetJS = () => sheetjs ??= new Promise((ok, fail) => document.head.append(Object.assign(document.createElement('script'), {
    src: new URL('xlsx/xlsx.full.min.js', VENDOR).href, onload: () => ok(window.XLSX), onerror: () => { sheetjs = null; fail(new Error('Couldn’t load the Excel writer')); } })));
  // (Named as a chart's file is, its as-of day in it where that's not today, or the moment while the past is shown: "… - Tax - as of Feb 1, 2027.xlsx".)
  const fileName = ext => `${Tree.nameOfFile(App.shown.peek().charts().find(c => c.chart === App.chart.peek())?.name, viewOf(Shell.view.peek())?.name, App.asOfWords().name) || 'Table'}.${ext}`;
  // A day as Excel counts it, from December 30, 1899.
  const serial = iso => { const [y, m, d] = iso.split('-').map(Number); return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 864e5; };
  // A percentage as precise as the grid says it, to four places: 28.4% is 0.0%, 100% is 0%.
  const pct = v => { const s = String(+(v * 100).toFixed(4)), i = s.indexOf('.'); return `0${i < 0 ? '' : '.' + '0'.repeat(s.length - i - 1)}%`; };
  // The sheet: a first line saying the day it's as of or the moment it stood, the headings, then each row the grid shows, in its order, each value
  // Excel's own kind of cell in the format the grid reads it in: a number a number, a percentage a percentage, an amount of
  // money money, a date a date; a link to a document a link, named as the grid names it; a tag Yes or No. Its columns as
  // wide as the grid's, with Excel's filter on its headings. A row a change pending would add isn't there yet, and a value it
  // would change is as it is.
  // What's marked stays marked (dendra.md, A table view): what's overdue or due soon, a failed check's cell, a blank that's
  // required or, with Blanks on, any, what's typed over, with a note of who and why, by a fill; each row's status in a column of
  // its own where any has one; and the file says what it is in its first line, its day, its chart and table, and what it's narrowed to.
  function statusOf(m, d, kinds, blanks) {
    const out = [], say = kinds.get(d.id);
    if (d._ended) out.push(`Ended ${Tree.formatDate(d._ended, 'short')}`);
    if (say?.has('overdue')) out.push('Overdue');
    if (say?.has('soon')) out.push('Due soon');
    if (d._fails) out.push(`Fails ${d._fails.join(', ')}`);
    const errs = kinds.get(`at:${d.id}`);
    if (errs) out.push(`Fails ${[...errs].join(', ')}`);
    const miss = blanks.filter(b => b.id === d.id).map(b => b.edge);
    if (miss.length) out.push(`Blank: ${miss.join(', ')}`);
    return out.join('; ');
  }
  function sheet(X, all = false) {
    const m = current, cols = table.getColumns().filter(c => c.getField()).map(col => [col, m.byField.get(col.getField())]).filter(([, c]) => c), look = lookOf(m.view);
    const rows = (all ? table.getRows().map(r => r.getData()) : stands()).filter(d => d._red !== 'add');
    const value = (d, c) => { const mm = d._m[field(c)]; return mm && 'was' in mm ? mm.was : d[field(c)]; };
    const needs = App.needs.peek(), st = App.state.peek(), kinds = new Map(), requires = needs.filter(a => a.kind === 'blank' && !a.error);
    for (const a of needs) { if (!kinds.has(a.id)) kinds.set(a.id, new Set()); kinds.get(a.id).add(a.kind); if (a.kind === 'error' && !a.error && st[a.id]?.at) { const k = `at:${st[a.id].at}`; if (!kinds.has(k)) kinds.set(k, new Set()); kinds.get(k).add(st[a.id].edge); } }
    const failing = new Set(needs.filter(a => a.kind === 'error' && !a.error).map(a => a.id)), marks = new Map();
    const line = [App.asOfWords().line, [App.shown.peek().charts().find(c => c.chart === App.chart.peek())?.name, viewOf(m.view)?.name].filter(Boolean).join(', '), rowsWords(all)].filter(Boolean).join(' · ');
    const ws = { A1: { t: 's', v: line } }, at = (r, j) => X.utils.encode_cell({ r, c: j });
    const status = rows.map(d => statusOf(m, d, kinds, requires)), withStatus = status.some(Boolean), statusAt = cols.length;
    cols.forEach(([, c], j) => {
      ws[at(1, j)] = { t: 's', v: headed(c) };
      rows.forEach((d, i) => {
        const v = value(d, c), type = typeOf(c, d), ref = at(i + 2, j), mm = d._m[field(c)], f = c.path?.at(-1) ?? c.title;
        const mark = mm?.id && kinds.get(mm.id)?.has('overdue') ? 'overdue' : mm?.id && kinds.get(mm.id)?.has('soon') ? 'soon' : mm?.id && failing.has(mm.id) ? 'fail' : mm?.over ? 'over' : mm?.cant ? 'soon' : c.key === '$why' ? 'wrap' : null;
        if (mark) marks.set(ref, mark);
        // (What the rule says, why, who and until when, as its note.)
        if (mm?.over && mm.id) { const o = App.overOf(mm.id); ws[ref] = { c: Object.assign([{ a: o?.who ?? 'Dendra', t: `Typed over: the rule ${App.ruleSaid(mm.id)}.${o?.why ? ` ${o.why}.` : ''}${o?.until ? ` Until ${Tree.formatDate(o.until, 'short')}.` : ''}${o ? ` ${o.who}, ${Tree.formatDate(Tree.isoOf(new Date(o.when)), 'short')}.` : ''}` }], { hidden: true }) }; }
        if (blank(v)) {
          const ours = mm?.notours, required = requires.some(b => b.id === d.id && same(b.edge, f));
          if (ours) ws[ref] = { t: 's', v: 'Not ours' };
          else if (required || (look.blanks && mm?.at && c.key !== '$why')) { ws[ref] = { t: 's', v: '' }; marks.set(ref, 'blank'); }
          return;
        }
        ws[ref] = { ...(ws[ref] ?? {}), ...(type === 'tag' ? { t: 's', v: text('tag', v) }
          : typeof v === 'number' && NUMERIC.has(type) ? { t: 'n', v, ...(type === 'percent' ? { z: pct(v) } : type === 'money' ? { z: `"$"#,##0${Number.isInteger(v) ? '' : '.00'}` } : {}) }
          : type === 'date' && /^\d{4}(-\d\d){0,2}$/.test(v) ? { t: 'n', v: serial(Tree.firstDay(v)), z: v.length === 4 ? 'yyyy' : v.length === 7 ? 'mmm yyyy' : 'mmm d, yyyy' }
          : type === 'document' ? { t: 's', v: c.filed ? filed(v) : Tree.format('document', v), l: { Target: String(v) } }
          : { t: 's', v: text(type, v) }) };
      });
    });
    if (withStatus) { ws[at(1, statusAt)] = { t: 's', v: 'Status' }; status.forEach((s, i) => { if (s) { ws[at(i + 2, statusAt)] = { t: 's', v: s }; marks.set(at(i + 2, statusAt), /Overdue|Fails/.test(s) ? 'fail' : /Due soon|Blank/.test(s) ? 'soon' : 'wrap'); } }); }
    const last = Math.max(0, cols.length - 1 + (withStatus ? 1 : 0));
    ws['!ref'] = X.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length + 1, c: last } });
    // (Why wraps, as wide as a line of it reads, so a page wide holds it at a size that can be read.)
    ws['!cols'] = [...cols.map(([col, c]) => ({ wpx: c.key === '$why' ? 420 : Math.round(col.getWidth()) })), ...(withStatus ? [{ wpx: 180 }] : [])];
    ws['!autofilter'] = { ref: X.utils.encode_range({ s: { r: 1, c: 0 }, e: { r: rows.length + 1, c: last } }) };
    ws['!margins'] = { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 };
    ws['!marks'] = marks;
    return ws;
  }
  async function workbook(all = false) {
    const X = await loadSheetJS(), wb = X.utils.book_new(), name = (viewOf(Shell.view.peek())?.name ?? 'Table').replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Table';
    X.utils.book_append_sheet(wb, sheet(X, all), name);
    wb.Props = { Title: fileName('xlsx').replace(/\.xlsx$/, ''), Author: App.who() ?? '' };
    // Its day and its headings print at the top of every page.
    wb.Workbook = { Names: [{ Name: '_xlnm.Print_Titles', Sheet: 0, Ref: `'${name.replace(/'/g, "''")}'!$1:$2` }] };
    return wb;
  }
  // The file as Excel opens it: what SheetJS doesn't write, written into its parts: its headings bold, its day and headings
  // frozen with the columns the grid keeps in view, and turned to print one page wide.
  async function excelFile(all = false) {
    const X = await loadSheetJS(), wb = await workbook(all), marks = wb.Sheets[wb.SheetNames[0]]['!marks'] ?? new Map();
    return marked(X, X.write(wb, { bookType: 'xlsx', type: 'array', compression: true }), { frozen: Math.min(frozenOf(lookOf(current.view)), table.getColumns().filter(c => c.getField()).length), marks });
  }
  // The looks a cell is marked with, each kept to what it was (a date a date): what's late or failing red, what's soon or blank amber, what's typed over amber,
  // each wrapped where it's long, so the printed page reads.
  const MARKS = { overdue: { fill: 'FFF8D7DA', ink: 'FF9C0006' }, fail: { fill: 'FFF8D7DA', ink: 'FF9C0006', wrap: true }, soon: { fill: 'FFFFF2CC', wrap: true }, blank: { fill: 'FFFFEB9C' }, over: { fill: 'FFFFE699' }, wrap: { wrap: true } };
  // What SheetJS doesn't write, written into the parts of a file it wrote: its first two rows' headings bold, its day and headings frozen with
  // the columns kept in view, what's marked marked, and turned to print one page wide.
  function marked(X, bytes, { frozen = 0, marks = new Map() }) {
    const zip = X.CFB.read(new Uint8Array(bytes), { type: 'array' });
    const part = name => X.CFB.find(zip, `/${name}`), read = p => new TextDecoder().decode(p.content), write = (p, s) => { p.content = new TextEncoder().encode(s); p.size = p.content.length; };
    const styles = part('xl/styles.xml'), page = part('xl/worksheets/sheet1.xml');
    if (!styles || !page) return bytes;
    // A bold font, the sheet's own with <b/>, and a cell format of it; each mark's fill and ink.
    let s = read(styles), bold = 0, plainFont = '';
    const fonts = [], fills = [], xfs = [];
    s = s.replace(/<fonts count="(\d+)"([^>]*)>([\s\S]*?)<\/fonts>/, (_, n, rest, inner) => { bold = +n; plainFont = inner.match(/<font>([\s\S]*?)<\/font>/)?.[1] ?? ''; fonts.push(`<font><b/>${plainFont}</font>`); return `<fonts§${n}§${rest}>${inner}</fonts>`; });
    const fontOf = ink => { fonts.push(`<font>${plainFont.replace(/<color\b[^>]*\/>/, '')}<color rgb="${ink}"/></font>`); return bold + fonts.length - 1; };
    let fillBase = 2;
    s = s.replace(/<fills count="(\d+)"([^>]*)>([\s\S]*?)<\/fills>/, (_, n, rest, inner) => { fillBase = +n; return `<fills§${n}§${rest}>${inner}</fills>`; });
    const fillOf = argb => { fills.push(`<fill><patternFill patternType="solid"><fgColor rgb="${argb}"/><bgColor indexed="64"/></patternFill></fill>`); return fillBase + fills.length - 1; };
    const looks = new Map(Object.entries(MARKS).map(([k, v]) => [k, { fill: v.fill ? fillOf(v.fill) : 0, font: v.ink ? fontOf(v.ink) : 0, wrap: !!v.wrap }]));
    let xf = 0, base = [];
    s = s.replace(/<cellXfs count="(\d+)">([\s\S]*?)<\/cellXfs>/, (_, n, inner) => { xf = +n; base = inner.match(/<xf\b[^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g) ?? []; return `<cellXfs§${n}>${inner}</cellXfs>`; });
    xfs.push(`<xf numFmtId="0" fontId="${bold}" fillId="0" borderId="0" xfId="0" applyFont="1"/>`);
    const made = new Map(), xfOf = (from, mark) => {
      const k = `${from}|${mark}`;
      if (made.has(k)) return made.get(k);
      const l = looks.get(mark), num = base[from]?.match(/numFmtId="(\d+)"/)?.[1] ?? '0';
      xfs.push(`<xf numFmtId="${num}" fontId="${l.font}" fillId="${l.fill}" borderId="0" xfId="0" applyNumberFormat="1"${l.font ? ' applyFont="1"' : ''}${l.fill ? ' applyFill="1"' : ''}${l.wrap ? ' applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' : '/>'}`);
      made.set(k, xf + xfs.length - 1);
      return xf + xfs.length - 1;
    };
    const pane = `<pane ${frozen ? `xSplit="${frozen}" ` : ''}ySplit="2" topLeftCell="${X.utils.encode_cell({ r: 2, c: frozen })}" activePane="${frozen ? 'bottomRight' : 'bottomLeft'}" state="frozen"/>`;
    let w = read(page);
    // What's marked, and where it's blank, a cell with nothing in it, as a blank is.
    if (marks.size) w = w.replace(/<c r="([A-Z]+\d+)"([^>]*?)(\/>|>([\s\S]*?)<\/c>)/g, (all, ref, attrs, rest) => {
      const mark = marks.get(ref);
      if (!mark) return all;
      const from = +(attrs.match(/\bs="(\d+)"/)?.[1] ?? 0), n = xfOf(from, mark), a = attrs.replace(/\s*\bs="\d+"/, '');
      return mark === 'blank' ? `<c r="${ref}" s="${n}"/>` : `<c r="${ref}" s="${n}"${a}${rest}`;
    });
    s = s.replace(/<fonts§(\d+)§([^>]*)>([\s\S]*?)<\/fonts>/, (_, n, rest, inner) => `<fonts count="${+n + fonts.length}"${rest}>${inner}${fonts.join('')}</fonts>`);
    s = s.replace(/<fills§(\d+)§([^>]*)>([\s\S]*?)<\/fills>/, (_, n, rest, inner) => `<fills count="${+n + fills.length}"${rest}>${inner}${fills.join('')}</fills>`);
    s = s.replace(/<cellXfs§(\d+)>([\s\S]*?)<\/cellXfs>/, (_, n, inner) => `<cellXfs count="${+n + xfs.length}">${inner}${xfs.join('')}</cellXfs>`);
    write(styles, s);
    w = /<sheetPr\b[^>]*\/>/.test(w) ? w.replace(/<sheetPr\b([^>]*)\/>/, '<sheetPr$1><pageSetUpPr fitToPage="1"/></sheetPr>')
      : /<sheetPr\b/.test(w) ? w.replace('</sheetPr>', '<pageSetUpPr fitToPage="1"/></sheetPr>') : w.replace(/(<worksheet\b[^>]*>)/, '$1<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>');
    w = /<sheetViews>/.test(w) ? w.replace(/<sheetView ([^>]*?)\/>/, `<sheetView $1>${pane}</sheetView>`) : w.replace(/(<sheetData\b|<cols\b|<sheetFormatPr\b)/, `<sheetViews><sheetView workbookViewId="0">${pane}</sheetView></sheetViews>$1`);
    w = w.replace(/<row r="2"[^>]*>[\s\S]*?<\/row>/, row => row.replace(/<c r="([A-Z]+2)"(?: s="\d+")?/g, `<c r="$1" s="${xf}"`));
    w = w.replace(/(<pageMargins\b[^>]*\/>)/, '$1<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>');
    write(page, w);
    return X.CFB.write(zip, { fileType: 'zip', compression: true, type: 'array' });
  }
  async function excel(all = false) {
    const blob = new Blob([await excelFile(all)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    if (typeof Export !== 'undefined' && Export.onFile) return Export.onFile(blob, fileName('xlsx'));
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: fileName('xlsx') });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    Shell.toast(`Downloaded ${fileName('xlsx')}`);
    return blob;
  }
  // A sheet of what isn't a table: a first line saying what it is, headings bold and frozen, each row its values, long ones wrapped,
  // a Date a date, printed one page wide; a cell's mark, by a row's `marks` [column → mark]. { name, sheet, title, head, rows, widths, when, wrap, marks }.
  async function plainFile(o) {
    const X = await loadSheetJS(), ws = { A1: { t: 's', v: o.title } }, at = (r, j) => X.utils.encode_cell({ r, c: j }), marks = new Map();
    o.head.forEach((h, j) => { ws[at(1, j)] = { t: 's', v: h }; });
    o.rows.forEach((row, i) => row.forEach((v, j) => {
      const ref = at(i + 2, j), mark = o.marks?.[i]?.[j];
      if (mark) marks.set(ref, mark); else if (o.wrap?.includes(j)) marks.set(ref, 'wrap');
      if (v === null || v === undefined || v === '') return;
      ws[ref] = v instanceof Date ? { t: 'n', v: (v.getTime() - v.getTimezoneOffset() * 6e4 - Date.UTC(1899, 11, 30)) / 864e5, z: 'mmm d, yyyy h:mm AM/PM' } : typeof v === 'number' ? { t: 'n', v } : /^\d{4}-\d\d-\d\d$/.test(v) ? { t: 'n', v: serial(v), z: 'mmm d, yyyy' } : { t: 's', v: String(v) };
    }));
    ws['!ref'] = X.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: o.rows.length + 1, c: o.head.length - 1 } });
    ws['!cols'] = o.widths.map(wch => ({ wch }));
    ws['!autofilter'] = { ref: X.utils.encode_range({ s: { r: 1, c: 0 }, e: { r: o.rows.length + 1, c: o.head.length - 1 } }) };
    ws['!margins'] = { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 };
    const wb = X.utils.book_new(), name = o.sheet.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31);
    X.utils.book_append_sheet(wb, ws, name);
    wb.Props = { Title: o.name, Author: App.who() ?? '' };
    wb.Workbook = { Names: [{ Name: '_xlnm.Print_Titles', Sheet: 0, Ref: `'${name.replace(/'/g, "''")}'!$1:$2` }] };
    const bytes = marked(X, X.write(wb, { bookType: 'xlsx', type: 'array', compression: true }), { frozen: 0, marks }), file = `${Tree.nameOfFile(o.name)}.xlsx`, blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    if (typeof Export !== 'undefined' && Export.onFile) return Export.onFile(blob, file);
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: file });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    Shell.toast(`Downloaded ${file}`);
    return blob;
  }
  // Import…: the dialog, empty, to take rows typed or pasted, or a file; rows that came otherwise, shown in it.
  const importFile = () => importDialog();
  const importing = (text, file) => importDialog({ text, file });
  // The table it goes to, unless said: the one shown, where its headings fit it; else the one they fit best, which opens
  // with it staged, as if it had been imported there; fitting none, the one shown, or the first. A table is fitted where its
  // headings name the columns its rows are found by (a Name, a relation's sides); the best, where they name the most of them.
  const importTables = () => App.views.peek().filter(v => v.layout === 'table' && v.rows && typeof v.rows !== 'string');
  function fitOf(view, headings) {
    const m = model(view);
    if (!m) return 0;
    const head = headings.map(h => clean(h) ? named(m, h) : null), keys = keysOf(m, head);
    return keys.length && keys.every(k => head.includes(k)) ? head.filter(Boolean).length : 0;
  }
  // Staged in the table, once it's shown and built, as the dialog read it. A first row of data goes under a heading row of nothing.
  function importInto(o, tries = 200) {
    if (Shell.view.peek() !== o.view) Shell.show(o.view);
    if (!(real?.view === o.view && built?.view === o.view && ready && el?.offsetParent)) { if (tries) setTimeout(() => importInto(o, tries - 1), 25); return; }
    const m = real, rows = o.first === 'head' ? o.grid : [o.keys.map(() => ''), ...o.grid];
    const cols = o.keys.map((k, j) => k === 'new' ? newColumn(clean(rows[0][j] ?? ''), rows.slice(1).map(r => r[j] ?? '')) : k ? m.cols.find(c => c.key === k) ?? null : null);
    stage(m, as => byName(m, rows, cols, as), { file: o.file, held: o.held ?? [] });
    // (The keys to the grid, so Enter makes it, not back to what opened the dialog.)
    focus();
  }
  Shell.register('action', { id: 'table.import', name: 'Import…', names: ['Import a file', 'Import CSV', 'Import Excel', 'Paste rows', 'Upload'], enabled: () => !App.readOnly.peek() && importTables().length > 0,
    why: () => App.readOnly.peek() ? App.whyNot() : 'Add a table first', run: importFile });
  // ---- Find reaches what a clerk looks for: a table's columns, and the dates (dendra.md, Moving) ----
  // Each is within what it's in, so what's named comes first; "file number" goes to the column, shown if it's hidden, its cell
  // at the record selected, and "annual tax fund iii blocker" to its row in Dates, itself selected, never its owner's page.
  const columnsIn = v => {
    const base = v.rows.args ? v.rows : { kind: v.rows.kind }, isRow = base.args ? loc => loc.args?.length > 1 && Tree.narrower(loc, base) : loc => !loc.args && same(loc.kind, base.kind);
    return entryColumns(App.schema.peek(), isRow).map(c => ({ key: c.key, title: c.path.at(-1), path: c.path, parent: c.path.slice(0, -1).join(' › ') }));
  };
  function goColumn(view, key) {
    if (Shell.view.peek() !== view) Shell.show(view);
    const at = (tries = 200) => {
      if (!(real?.view === view && built?.view === view && ready && el?.offsetParent)) { if (tries) setTimeout(() => at(tries - 1), 25); return; }
      const c = current.cols.find(x => x.key === key);
      if (!c) return;
      if (!drawn(c)) { if (!canShow()) return Shell.toast(App.whyNot()); show(c, true); }
      const land = (more = 80) => {
        const col = ready && table.getColumns().find(x => x.getField() === field(c));
        if (!col) { if (more) setTimeout(() => land(more - 1), 25); return; }
        const rows = shownRows(), sel = Shell.selection.peek()[0], active = table.modules.selectRange?.getActiveCell()?.row.getData().id;
        const row = rows.find(r => r.getData().id === sel) ?? rows.find(r => r.getData().id === active) ?? rows[0];
        if (!row) return void focus();
        table.scrollToRow(row.getData().id, 'nearest', false).catch(() => {}).then(() => { hold(row.getCell(col)); focus(); into(col); });
      };
      land();
    };
    at();
  }
  // A date's row in Dates, selected, the keys on its date to type over.
  function goDate(view, id) {
    letGo();
    if (Shell.view.peek() !== view) Shell.show(view);
    Shell.select([id]);
    const at = (tries = 200) => {
      if (!(real?.view === view && built?.view === view && ready && el?.offsetParent)) { if (tries) setTimeout(() => at(tries - 1), 25); return; }
      const col = table.getColumns().find(c => c.getField());
      if (!inGrid(id) || !col) return void focus();
      // (In view first: a row not drawn takes no cell made active.)
      table.scrollToRow(id, 'nearest', false).catch(() => {}).then(() => { if (inGrid(id)) table.addRange(table.getRow(id).getCell(col)); focus(); });
    };
    at();
  }
  let found = null;
  function foundIn() {
    const R = App.computed.peek(), N = App.notes.peek(), S = App.schema.peek(), view = Shell.view.peek();
    if (found?.R === R && found.N === N && found.S === S && found.view === view) return found.out;
    const st = R.records, tables = App.views.peek().filter(v => v.layout === 'table' && v.rows && typeof v.rows !== 'string'), shown = tables.find(v => v.id === view), out = [];
    // (The table shown's by their names, and first; any other's under its own.)
    for (const v of [...(shown ? [shown] : []), ...tables.filter(t => t !== shown)]) {
      const cols = columnsIn(v);
      for (const c of cols) out.push({ of: '§columns', label: `${v === shown ? '' : `${v.name} › `}${c.parent ? `${c.parent} › ` : ''}${c.title}`, names: [c.title], detail: 'Column', run: () => goColumn(v.id, c.key) });
    }
    // Dates, each as the table says it: what, and whose.
    const dates = App.views.peek().find(v => v.layout === 'table' && v.rows === 'date');
    if (dates) for (const id of Object.keys(st)) if (st[id].field === 'date') {
      const whose = Time.whose(st, st[id].args ? id : st[id].at, N), what = N.nameOf(st, id);
      out.push({ of: '§dates', label: `${what} · ${whose}`, names: [`${what} ${whose}`, `${whose} ${what}`], detail: 'Date', why: Tree.formatDate(st[id].value, 'short'), run: () => goDate(dates.id, id) });
    }
    found = { R, N, S, view, out };
    return out;
  }
  Shell.register('find', { items: q => q ? foundIn() : [] });
  let unexport = null;
  effect(() => {
    const on = viewOf(Shell.view.value)?.layout === 'table';
    if (on && !unexport) {
      // What a file writes, as the Export dialog says it: the rows as shown, filtered and sorted so, or every row; and the
      // columns shown, in their order.
      const writes = all => { const m = current, cols = table.getColumns().filter(c => c.getField() && m.byField.get(c.getField())).length;
        return `${rowsWords(all)}; ${count(cols, 'column')}, in their order`; };
      const offs = [Shell.register('export', { name: 'Excel', says: writes, run: ({ all } = {}) => table && excel(all).catch(e => Shell.toast(e?.message || 'Couldn’t export')) }),
        Shell.register('export', { name: 'CSV', says: writes, run: ({ all } = {}) => { table?.download('csv', fileName('csv'), { bom: true }, all ? 'all' : () => stands().map(d => d.id)); Shell.toast(`Downloaded ${fileName('csv')}`); } })];
      unexport = () => offs.forEach(f => f());
    }
    if (!on && unexport) { unexport(); unexport = null; }
  });

  return { model, paste, focus, look: lookOf, workbook, excelFile, plainFile, Columns, importFile, importing, moved, opening, openList, get grid() { return table; } };
})();
