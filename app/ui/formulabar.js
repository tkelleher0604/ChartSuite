// The formula bar (dendra.md, Part 2): one row that never changes height, as Excel's doesn't. It names the
// selection, or the view when nothing is, with its output and, inline, why: the facts that gave it as a
// sentence ("… so it is a remote affiliate of the BDC (§57(e)(1)(A))"), or for a record the rows rule out,
// what failed, after "but" ("…, but is a member, not a managing member, of GP III, so …"); cut short where it
// doesn't fit. Each name in the row of its definition that gave it takes a colour, and what it means here is
// outlined on the chart in that colour; deeper reasons in the same hue, lighter, down to entered records (Range
// Finder).
// Hovering part of a formula shows its value. Clicking a fact, or a lit computed line, steps down to its
// reason, by the clause the parent cited, and the breadcrumb steps back. The definition's rows drop over the
// view under the sentence (the chevron, Ctrl+Shift+U, or a click on the sentence) until the selection changes,
// clear of what they're about: those that hold in ink, the rest grey; read until asked to be written. Every ground
// a record has is said, the direct one first. Two objects show what's between them (FormulaBar.between): the most
// derived relation that holds, and open, all that hold and all that a formula could give them, why not. Any pending
// change is redlined before it's made, whoever asks (FormulaBar.preview). It also answers Find's "=" and two names,
// and gives the other panes a record's reason, the sentence it says for a record, as plain text with every ground
// (FormulaBar.because), and a relation's words. Where a record is, it says by the core's place rule (Notes.placed, whereOf).
const FormulaBar = (() => {
  const { html, signal, computed, effect, on, emit } = Shell;
  const { batch } = preactSignals;
  const { render } = preact;
  const { useLayoutEffect, useRef, useState } = preactHooks;
  const norm = s => Tree.norm(String(s ?? ''));
  const unbracket = s => String(s).replace(/^\./, '').replace(/^\[|\]$/g, '');
  const isObj = r => !!r && 'kind' in r;
  const newKey = () => 'n' + Math.random().toString(36).slice(2, 8);
  const N = () => App.notes.peek();
  const EXPAND = (/Mac|iPhone|iPad/.test(navigator.platform) ? 'Cmd' : 'Ctrl') + '+Shift+U';

  // The editor's tokens, for CodeMirror; the language itself is the engine's.
  const words = list => new RegExp(`(?:${list.join('|')})\\b`, 'i');
  CodeMirror.defineSimpleMode('dendra', { start: [
    { regex: /←|<-/, token: 'arrow' },
    { regex: /"(?:[^"]|"")*"?/, token: 'string' },
    { regex: /\$(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?%?|(?:\d+(?:\.\d+)?|\.\d+)%?/, token: 'number' },
    { regex: /\[[^\]]*\]?/, token: 'variable' },
    { regex: words([...Formulas.KEYWORDS].filter(k => k !== 'TRUE' && k !== 'FALSE')), token: 'keyword' },
    { regex: words(['TRUE', 'FALSE']), token: 'atom' },
    { regex: new RegExp(`(?:${Formulas.FUNCTION_NAMES.join('|')})(?=\\s*\\()`, 'i'), token: 'builtin' },
    { regex: /[A-Za-z_][A-Za-z0-9_]*/, token: 'variable' },
    { regex: /@/, token: 'variable-2' },
    { regex: /<>|<=|>=|[-+*/&=<>:]/, token: 'operator' },
  ] });

  // ---- The computed state, and the definitions as App has them ----
  const R = App.computed;
  // (And one being written for the first time, which is nothing till it's Done: see define.)
  const NEW = '§new';
  const defs = computed(() => { const m = new Map(App.definitions.value.map(d => [d.id, { ...d, isRelation: (d.edges?.length ?? 0) > 1 }])), f = draft.value?.fresh; if (f) m.set(NEW, f); return m; });
  const defOf = id => id ? defs.peek().get(id) : undefined;
  // (Of a working-out with definitions of its own, History's replays, its definition as it then was.)
  const defOfRecord = (Rv, id, k = Rv.computed[id]?.def ?? Rv.covered[id]?.def) => Rv.definitions?.find(d => d.id === k) ?? defOf(k);
  const noteOf = id => N().notes('Formula').find(n => n.note === id && !n.view);
  // A definition's rows as kept, each keyed by its place.
  const kept = def => (defOf(def)?.rows ?? []).map((r, i) => ({ key: 'r' + i, label: r.label, formula: r.formula }));
  const errorOf = (Rv, id) => Rv.errors.find(e => e.id === id);
  const argKey = args => args.map(a => `${norm(a.edge)}=${a.at}`).sort().join('&');
  // How records read here: an object by its Name; anything else as a step on its path.
  const nameOf = (Rv, id) => { const r = Rv.records[id]; return !r ? '—' : isObj(r) ? N().nameOf(Rv.records, id) : N().segmentOf(Rv.records, id); };
  // Grounds are worked out on demand; each, once per working-out, the direct one first (fewestSteps).
  const grounds = new WeakMap();
  function groundOf(Rv, id) {
    if (!grounds.has(Rv)) grounds.set(Rv, new Map());
    const memo = grounds.get(Rv);
    if (!memo.has(id)) {
      let g = null;
      try { g = Formulas.ground(Rv, id); } catch {}
      memo.set(id, g?.rows?.length ? g : null);
      if (g?.rows?.length > 1) g.rows = fewestSteps(Rv, g.rows);
    }
    return memo.get(id);
  }
  // How far a ground goes before all it reads is entered: a computed record it reads is a step, with the steps of
  // that record's own nearest ground. Fewest steps first, the rows' order deciding between equals: so being the BDC's
  // adviser, which is entered, comes before being controlled by one of its directors.
  const stepsKept = new WeakMap();
  function stepsOf(Rv, id) {
    const memo = stepsKept.get(Rv) ?? stepsKept.set(Rv, new Map()).get(Rv);
    if (memo.has(id)) return memo.get(id);
    memo.set(id, 0);
    const g = Rv.computed[id] ? groundOf(Rv, id) : null;
    memo.set(id, g ? 1 + rowSteps(Rv, g.rows[0]) : 0);
    return memo.get(id);
  }
  const rowSteps = (Rv, row) => {
    const of = ps => ps.reduce((n, p) => Math.max(n, p.id ? stepsOf(Rv, p.id) : 0, of(p.items ?? [])), 0);
    return of(row.parts);
  };
  const fewestSteps = (Rv, rows) => rows.map(r => [rowSteps(Rv, r), r]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
  // A record's reason: the row of its ground with the clause its parent cited (Affiliated Person's (C), where
  // Close Affiliate reads `.[(C)]`), or else the ground's own.
  function reasonOf(Rv, id, clause) {
    const g = groundOf(Rv, id);
    return g && ((clause && g.rows.find(r => Tree.same(r.label, clause))) || g.rows[0]);
  }
  // A record's other grounds, every row that holds but the one its reason cites, nearest first; once per working-out.
  const othersKept = new WeakMap();
  function othersOf(Rv, id, row) {
    const said = Rv.computed[id] ?? Rv.covered[id];
    if (!(said?.holds?.length > 1)) return [];
    const memo = othersKept.get(Rv) ?? othersKept.set(Rv, new Map()).get(Rv);
    if (!memo.has(id)) { let g = null; try { g = Formulas.ground(Rv, id, { all: true }); } catch {} memo.set(id, g ? fewestSteps(Rv, g.rows) : []); }
    return memo.get(id).filter(r => r.row !== row);
  }
  // Where the rows rule a record out (its output, or theirs where an entry overrides them), what held and what
  // failed (see whyNot), which the sentence says and the chart outlines; once per working-out.
  const nots = new WeakMap();
  function notsOf(Rv, id) {
    if (!nots.has(Rv)) nots.set(Rv, new Map());
    const memo = nots.get(Rv);
    if (!memo.has(id)) {
      const c = Rv.covered[id], g = reasonOf(Rv, id), d = defOfRecord(Rv, id);
      let no = null;
      try { no = g && d && (c && !c.agrees ? c.value === false : Rv.records[id]?.tag === false) ? whyNot(Rv, d, g, id) : null; } catch {}
      memo.set(id, no);
    }
    return memo.get(id);
  }
  // The clause a row cites of a record it reads: a label of that record's rows, after a dot, just after the part; or,
  // for an item of a list or a name it's given, what's asked of that (ANY(BDC.[Close Affiliates], @.[(b)(2)] …);
  // LET(a, [Affiliated Person](x, @), a.[(C)] OR a.[(D)])), the first of those that holds.
  function clauseOf(Rv, id, text, p) {
    const rest = String(text ?? '').slice(p.to), known = c => !!defOfRecord(Rv, id)?.rows.some(r => Tree.same(r.label, c));
    const m = /^\s*\.\s*(?:\[([^\]]+)\]|([A-Za-z_]\w*))/.exec(rest), c = m && (m[1] ?? m[2]);
    if (m) return known(c) ? c : null;
    const named = /^\s*,\s*(@|[A-Za-z_]\w*)\s*\./.exec(rest)?.[1];
    if (!named) return null;
    const asked = [...rest.matchAll(new RegExp(`${named === '@' ? '@' : `\\b${named}`}\\s*\\.\\s*\\[([^\\]]+)\\]`, 'g'))].map(x => x[1]).filter(known), rows = groundOf(Rv, id)?.rows ?? [];
    return asked.find(l => rows.some(r => Tree.same(r.label, l))) ?? asked[0] ?? null;
  }
  // A definition's own screen is the inspector's, for its pattern in general.
  const openDef = id => { const n = noteOf(id); if (n) Shell.select([Shell.general(n.pattern)]); };

  // ---- What the bar is about ----
  const asked = signal(null);     // { id, clause, under }: a record asked about, while the selection is still `under`
  const editing = signal(null);   // { cm, key, subject } while a row is edited: the bar holds still
  const draft = signal(null);     // { def, rows: [{ key, label, formula, gone? }], fresh?, pattern?, keep? }: a definition being edited; `fresh`, written for the first time, `keep`, what's typed under it to leave
  const whyNote = signal('');      // why, what the draft's change will say of itself
  const lasting = signal(false);  // Why to be kept as what the rule's page says of it, too
  const needsWhy = signal(false); // Save anyway asked why, and hasn't been told
  const armed = signal(false);    // a first Esc has said what a second would do
  const open = signal(false);     // the rows dropped over the view, as Excel's expanded bar
  const pick = signal(null);      // for two objects, the relation shown
  const hover = signal(null);     // { key, from, to }: the part of a row under the pointer
  const touch = signal(null);     // the records of a fact under the pointer, in the sentence that says why
  const trail = signal([]);       // [{ id, title, clause }]: the records stepped down from, for the breadcrumb
  const aim = signal(null);       // a row to put the cursor in, by its key
  const formula = signal(Shell.store.get('formula') === 'shown');   // the rows shown under why, as asked for once
  const wanted = signal(false);   // the rows asked for while they're open: a row aimed at, or one edited
  const writing = signal(null);   // the definition whose rows are being written; otherwise they're read, and nothing on them edits
  const reading = signal(null);   // the row clicked while reading, by its key: lit as the cited one is
  effect(() => { if (!open.value) { wanted.value = false; writing.value = null; reading.value = null; } });
  on('why-open', id => { asked.value = { id, clause: finder.peek().via.get(id) ?? null, under: Shell.selection.peek() }; });

  // The bar's subject is the selection, whatever the view shown is: the same click says the same thing on a table as on
  // a chart, which draws whatever is selected, revealing what it hides.
  const subject = computed(() => {
    const ed = editing.value;
    if (ed) return ed.subject;
    const Rv = R.value, a = asked.value, keys = Shell.selection.value;
    if (a?.under === keys && (Rv.records[a.id] || errorOf(Rv, a.id))) return { id: a.id, clause: a.clause };
    const p = keys.length === 1 && Shell.pattern(keys[0]), def = p && App.notes.value.resolve('Formula', p)?.note, d = draft.value;
    if (d?.fresh && p && Tree.key(p) === Tree.key(d.pattern)) return { general: NEW };
    if (def) return { general: def.note };
    const known = keys.filter(k => Rv.records[k] || errorOf(Rv, k));
    if (known.length === 1) return { id: known[0] };
    if (known.length === 2 && known.every(k => isObj(Rv.records[k]))) return { pair: known };
    return null;
  });
  const subjectKey = computed(() => { const s = subject.value; return s?.pair?.join('+') ?? s?.id ?? s?.general ?? ''; });

  // A record's spot, its argumentation, which an entered record standing there would share.
  const spotOf = r => r.args ? { args: r.args } : { at: r.at, edge: r.edge };
  const sameSpot = (a, b) => !!a && !!b && (a.args ? !!b.args && argKey(a.args) === argKey(b.args)
    : !b.args && a.at === b.at && norm(a.edge) === norm(b.edge));

  // The relations at two objects, or at anything in either, in the state's order: all that can be between them. Once
  // for each working-out and pair.
  const nearby = new WeakMap();
  function nearOf(Rv, a, b) {
    const memo = nearby.get(Rv) ?? nearby.set(Rv, new Map()).get(Rv), k = `${a}|${b}`;
    if (memo.has(k)) return memo.get(k);
    const recs = Rv.records, { entries, relations } = Tree.index(recs), near = new Set(), order = [];
    for (const o of [a, b]) for (let todo = [o], i = 0; i < todo.length; i++) { for (const r of relations.get(todo[i]) ?? []) near.add(r); todo.push(...entries.get(todo[i]) ?? []); }
    for (const id in recs) if (near.has(id)) order.push(id);
    memo.set(k, order);
    return order;
  }
  // Records between two objects that a definition covers, by definition and objects in its edges' order, the last in
  // the state's order where two say the same. Once for each working-out and pair.
  const pairsKept = new WeakMap();
  function pairsOf(Rv, a, b) {
    const memo = pairsKept.get(Rv) ?? pairsKept.set(Rv, new Map()).get(Rv), k = `${a}|${b}`;
    if (memo.has(k)) return memo.get(k);
    const recs = Rv.records, out = new Map();
    for (const id of nearOf(Rv, a, b)) {
      const r = recs[id], def = r.args?.length === 2 && (Rv.computed[id]?.def ?? Rv.covered[id]?.def), d = def && defOf(def);
      if (!d) continue;
      const by = new Map(r.args.map(x => [norm(x.edge), Tree.objectOf(recs, x.at)]));
      out.set(`${def}|${d.edges.map(e => by.get(norm(e))).join('|')}`, id);
    }
    memo.set(k, out);
    return out;
  }

  // ---- The model: what the bar shows for its subject ----
  const model = computed(() => describe(subject.value, R.value, draft.value, pick.value));

  function describe(s, Rv, dr, pk) {
    if (!s) return null;
    if (s.pair) return describePair(s, Rv, dr, pk);
    if (s.general) {
      // A definition in general: worked out, for its names, at one of the records it gives.
      const P = defOf(s.general);
      if (!P) return null;
      const m = { id: null, def: P, general: true, title: P.name, place: '', at: P.id === NEW ? P.at : Object.keys(Rv.computed).find(k => Rv.computed[k].def === P.id) ?? null };
      m.rows = rowsOf(m, Rv, dr);
      return m;
    }
    const id = s.id, rec = Rv.records[id], err = !rec && errorOf(Rv, id);
    if (isObj(rec)) return { id, object: true, title: nameOf(Rv, id), place: rec.kind, rows: [] };
    const said = Rv.computed[id] ?? Rv.covered[id] ?? null, spot = rec ?? err;
    const P = defOf(said?.def ?? err?.def) ?? null;
    const at = rec ? id : err.args ? Object.fromEntries(err.args.map(a => [a.edge, Tree.objectOf(Rv.records, a.at) ?? a.at])) : err.at;
    const m = { id, rec, err, def: P, at, said, clause: s.clause ?? null, computed: !!Rv.computed[id], covered: Rv.covered[id] ?? null,
      title: P?.name ?? (rec?.args ? N().nameOf(Rv.records, id) : spot.edge), ...argsOf(Rv, spot, id) };
    m.out = err ? { error: err.error } : outputOf(rec);
    m.rows = rowsOf(m, Rv, dr);
    return m;
  }

  // The relations two objects could be in, each way round: those a formula gives, by its rows; those entered between
  // them, as they hold.
  function optionsOf(Rv, pair) {
    const options = [], recs = Rv.records;
    for (const def of Rv.order.flat()) {
      const d = defOf(def);
      if (!d?.isRelation || Rv.defErrors[def] || d.edges.length !== 2) continue;
      for (const [a, b] of [pair, [pair[1], pair[0]]]) {
        const at = { [d.edges[0]]: a, [d.edges[1]]: b };
        if (!Formulas.evaluateRow(Rv, def, 0, at)) continue;
        const id = pairsOf(Rv, ...pair).get(`${def}|${a}|${b}`) ?? null;
        options.push({ key: `${def}|${a}|${b}`, d, at, a, b, id, on: id ? recs[id].tag : null });
      }
    }
    const given = new Set(options.map(x => x.id).filter(Boolean));
    for (const id of nearOf(Rv, ...pair)) {
      if (given.has(id) || Rv.computed[id] || !recs[id].args?.length) continue;
      const sides = N().sides(recs, id), ends = sides.map(x => Tree.objectOf(recs, x.at));
      if (!pair.every(o => ends.includes(o))) continue;
      const [a, b] = ends;
      options.push({ key: `rec|${id}`, entered: true, d: { name: N().nameOf(recs, id), edges: sides.slice(0, 2).map(x => x.edge) }, a, b, id, on: recs[id].tag ?? null });
    }
    return options;
  }
  // Two objects: all that's between them. The one picked shows as its record if they're in it, or else as its rows at
  // the pair, all grey, and why not. Unpicked, it's the most derived one that holds, a tag before a value, the first
  // selected first: the pension is a remote affiliate of the BDC, and here's why; or else one entered; or where none
  // holds, the most derived that could, the same way: MacAllister is not a remote affiliate of the BDC, and why not.
  function describePair(s, Rv, dr, pk) {
    const options = optionsOf(Rv, s.pair), first = l => l.findLast(x => x.a === s.pair[0]) ?? l.at(-1);
    const held = options.filter(x => !x.entered && x.id && x.on !== false), could = options.filter(x => !x.entered && (!x.id || x.on === false));
    const o = options.find(x => x.key === pk) ?? first(held.filter(x => x.on === true)) ?? first(held)
      ?? first(options.filter(x => x.entered && x.on !== false)) ?? first(could.filter(x => x.d.type === 'tag')) ?? first(could) ?? options[0];
    if (!o) return null;
    const m = o.id ? describe({ id: o.id }, Rv, dr) : { id: null, def: o.d, at: o.at, absent: true, title: o.d.name, out: o.d.type === 'tag' ? { tag: null } : { text: '—' }, ...argsOf(Rv, o) };
    if (!o.id) m.rows = rowsOf(m, Rv, dr);
    return { ...m, options, option: o };
  }

  // What's between two objects, as a person asks it: each relation and computed relation that holds, with its figure
  // and its chain, the entered and the direct first, the way the first was selected first; and each a formula could
  // give them that doesn't hold, saying why not. Once for each working-out and pair. Each line's `key` picks it in the
  // bar; a line that holds has its record's `id`.
  const betweens = new WeakMap();
  function betweenIn(Rv, a, b) {
    const memo = betweens.get(Rv) ?? betweens.set(Rv, new Map()).get(Rv), k = `${a}|${b}`;
    if (memo.has(k)) return memo.get(k);
    const recs = Rv.records, out = { a, b, holds: [], not: [] };
    memo.set(k, out);
    if (a === b || !isObj(recs[a]) || !isObj(recs[b])) return out;
    const options = optionsOf(Rv, [a, b]), line = o => ({ key: o.key, name: o.d.name, from: o.a, to: o.b, def: o.entered ? null : o.d.id });
    const forward = xs => [...xs.filter(o => o.a === a), ...xs.filter(o => o.a !== a)];
    for (const o of forward(options.filter(x => x.id && x.on !== false && x.entered)).concat(
      forward(options.filter(x => x.id && x.on !== false && !x.entered)).map((x, i) => [stepsOf(Rv, x.id), i, x]).sort((p, q) => p[0] - q[0] || p[1] - q[1]).map(x => x[2]))) {
      const runs = o.entered ? enteredRuns(Rv, o.id) : whyOf(Rv, o.id)?.full, r = recs[o.id], chain = chainOf(Rv, o.id);
      const figure = o.entered ? figuresAt(Rv, o.id).map(x => Tree.outputText(recs[x]))[0] ?? null : 'tag' in r ? null : Tree.outputText(r);
      out.holds.push({ ...line(o), id: o.id, computed: !o.entered, figure, chain: chain ? `${chain.sum} = ${figure}` : null, runs: runs ?? [], sentence: runs ? plain(recs, runs) : '' });
    }
    for (const o of forward(options.filter(x => !x.id || x.on === false))) {
      const runs = o.id ? whyOf(Rv, o.id)?.full : notRuns(Rv, o);
      out.not.push({ ...line(o), id: o.id ?? null, runs: runs ?? [], sentence: runs ? plain(recs, runs) : '' });
    }
    return out;
  }
  // The figures entered at a relation, its amount first.
  const figuresAt = (Rv, id) => (Tree.index(Rv.records).entries.get(id) ?? []).filter(x => typeof Rv.records[x].value === 'number');
  // A relation entered, as a fact: Fund III is an owner of Fund III Blocker with a percentage of 100%.
  const enteredRuns = (Rv, id) => sentence(Rv, [{ c: factOf(Rv, id, figuresAt(Rv, id)) }]);
  // Why a relation a formula could give two objects doesn't hold: that it doesn't, then each row's condition that
  // failed, by its clause, what it read as a reason is. A number given down a list of itself, as a look-through is, says
  // the list had none that reached it; and what connects the two instead, a record that holds the first relation of
  // theirs both lack over each of them: GP III is a controller of both.
  function notRuns(Rv, o) { try { return notSaid(Rv, o); } catch { return null; } }
  function notSaid(Rv, o) {
    const { d, a, b, at } = o, t = noteOf(d.id)?.pattern;
    if (!t) return null;
    const isTag = d.type === 'tag', [s, words] = isTag ? phrase(t, d.edges[0], d.edges[1], { not: true }) : [];
    const [x, y] = isTag && !Tree.same(s, d.edges[0]) ? [b, a] : [a, b];
    const given = isTag ? { subj: x, pre: [words], obj: [{ name: y }], post: [] } : { subj: x, pre: [` has no ${lower(d.name)} of `], obj: [{ name: y }], post: [] };
    const tight = c => c.subj === x && !c.poss ? { ...c, subj: null, pre: [String(c.pre[0]).trimStart().replace(/^is /, ''), ...c.pre.slice(1)] } : c;
    const pieces = [{ c: given, self: true }];
    if (isTag) {
      let no = null;
      try { no = whyNot(Rv, d, { row: d.rows.length - 1, parts: [], none: true }, at); } catch {}
      const seen = new Set(), said = (no?.failed ?? []).flatMap(f => f.clause ? [{ c: tight(f.clause), row: f.row }]
        : gather(Rv, null, seen, f.parts).map((h, i, l) => { const c = factOf(Rv, h.host, h.reads); return { c: tight(f.not && [h.host, ...h.reads].some(z => f.not.ids.includes(z)) ? { ...c, not: f.not } : c), then: i === l.length - 1 ? f.then : null, row: f.row }; }));
      // A reason said once, with each clause it fails; each clause cited once, after the last of what it failed by.
      const once = new Map();
      for (const f of said) { const k = JSON.stringify([f.c.subj, f.c.pre, f.c.obj, f.c.post, f.then]), x = once.get(k); if (x) x.rows.push(f.row); else once.set(k, { ...f, rows: [f.row] }); }
      const cited = f => [...new Set(f.rows.map(i => citeOf(d.id, d.rows[i]?.label ?? '')).filter(Boolean))].join(', ') || null;
      [...once.values()].forEach((f, i, l) => pieces.push({ c: f.c, then: f.then, join: i ? ', ' : ': ', self: true, cite: cited(f) !== (l[i + 1] && cited(l[i + 1])) ? cited(f) : null }));
    } else {
      const self = d.rows.map(r => /EACH\(\s*([^,]+?)\s*,/i.exec(r.formula)).find((m, i) => m && d.rows[i].formula.includes(d.name));
      if (self) {
        const list = /(?:\[([^\]]+)\]|([A-Za-z_]\w*))$/.exec(self[1]), name = lower(list?.[1] ?? list?.[2] ?? '');
        const some = [ask(Rv, d, at, [], self[1])?.value ?? []].flat(Infinity).some(v => v?.t === 'rec' && v.id);
        pieces.push({ text: some ? `: none of ${isPerson(Rv, x) ? 'their' : 'its'} ${name} reaches it` : `: no ${name}` });
      }
      const link = linkOf(Rv, o);
      if (link) pieces.push({ text: '. ', fresh: true }, { c: link, self: true });
    }
    return sentence(Rv, pieces);
  }
  // What connects two objects that a formula's relation doesn't: the first relation (the one the others read) they could
  // be in that doesn't hold between them, where a third holds it over both, the nearest such; said as that relation is.
  function linkOf(Rv, o) {
    const recs = Rv.records, def = optionsOf(Rv, [o.a, o.b]).find(x => !x.entered && x.d.type === 'tag')?.d, t = def && noteOf(def.id)?.pattern;
    if (!t || optionsOf(Rv, [o.a, o.b]).some(x => x.d === def && x.id && x.on !== false)) return null;
    const [first, second] = def.edges, holders = z => nearOf(Rv, z, z).filter(id => Rv.computed[id]?.def === def.id && recs[id].tag === true && Tree.objectOf(recs, recs[id].args.find(g => Tree.same(g.edge, second))?.at) === z)
      .map(id => ({ id, by: Tree.objectOf(recs, recs[id].args.find(g => Tree.same(g.edge, first))?.at) }));
    const ofB = new Map(holders(o.b).map(h => [h.by, h.id])), both = holders(o.a).filter(h => ofB.has(h.by)).map(h => [stepsOf(Rv, h.id) + stepsOf(Rv, ofB.get(h.by)), h.by]).sort((p, q) => p[0] - q[0]);
    if (!both.length) return null;
    const [, words] = phrase(t, first, second);
    return { subj: both[0][1], pre: [words], obj: ['both'], post: [] };
  }

  // Where a record is, as the place rule says it (Notes): an entry's place, as far as it needs; or a relation's
  // sides, each by its Short Name, which the bar's one row has room for, and its name; for two objects in no
  // relation (`pair`), the relation they'd be in.
  function argsOf(Rv, r, id) {
    if (!r.args && !r.d) return { place: N().whereOf(Rv.records, r) };
    const own = !!Rv.records[id], args = r.d ? r.d.edges.map((edge, i) => ({ edge, at: i ? r.b : r.a })) : r.args;
    return { args: N().placed(Rv.records, own ? id : null, own ? undefined : args).map(s => ({ ...s, short: s.text, name: nameOf(Rv, s.id) })) };
  }
  // A place said in a line: the sides as the place rule joins them, by `as` (their short names, or names).
  const placeText = (m, as = 'short') => m.args ? m.args.map(a => a.join + a[as]).join('') : m.place;
  const outputOf = r => 'tag' in r ? { tag: r.tag } : { text: Tree.outputText(r), ...('field' in r && { field: r.field, value: r.value }) };

  // The rows, as the definition or the draft has them, each worked out here. Ink where it holds (a tag's ←
  // rows) or gave the output; the cited one, its reason; the rest grey. A loop's rows, where it closes. In
  // general, every row is ink and none is cited.
  function rowsOf(m, Rv, dr) {
    const P = m.def;
    if (!P) return [];
    const drafted = dr?.def === P.id;
    const rows = (drafted ? dr.rows : kept(P.id)).map((t, i) => ({ ...t, i, ev: t.gone ? null : Formulas.evaluateRow(Rv, P.id, t.formula, m.at) }));
    const implied = rows.every(r => /^\s*(←|<-)/.test(r.formula));
    const gives = r => r.ev && !Formulas.isError(r.ev.value) && r.ev.value !== null && r.ev.value !== undefined && !(Array.isArray(r.ev.value) && !r.ev.value.length);
    const loops = (Rv.loops[P.id] ?? []).filter(() => !drafted);
    // As worked out: a row of the definition, by its place in it. A drafted row that doesn't read yet keeps it.
    const was = i => !!m.said && (m.said.holds?.length ? m.said.holds.includes(i) : m.said.row === i);
    const unread = r => r.ev?.value?.code === '#SYNTAX' && /^r\d+$/.test(r.key);
    let ink;
    if (m.general) ink = r => !r.gone;
    else if (m.absent) ink = () => false;
    else if (m.err) ink = r => loops.some(l => l.row === r.i) || Formulas.isError(r.ev?.value);
    else if (drafted || !m.said) {
      const first = rows.findIndex(r => !r.gone && gives(r));
      ink = r => !r.gone && (unread(r) ? was(+r.key.slice(1)) : implied ? r.ev?.value === true : r.i === first);
    } else ink = r => was(r.i);
    for (const r of rows) { r.ink = ink(r); if (m.err) r.loops = loops.filter(l => l.row === r.i); }
    if (m.general) return rows;
    const g = !drafted && m.rec && reasonOf(Rv, m.id, m.clause);
    const cited = g ? rows[g.row] : rows.find(r => r.ink);
    if (cited) cited.cited = true;
    return rows;
  }

  // ---- Range Finder: a hue for each name in the lit row, and what each means here, on the chart ----
  // The lit rows: the one being edited; or else the cited one and the one hovered. Each record lit takes
  // [hue, depth]: depth 0 a witness, 1 a name's record, 2 a deeper reason; the hue 'loop' where a loop closes.
  // `via`: the clause each lit record was cited by, for stepping down into it.
  const finder = computed(() => {
    const m = model.value, Rv = R.value, colors = new Map(), map = new Map(), via = new Map(), ed = editing.value, hv = hover.value;
    if (!m?.rows?.length) return { colors, map, via, m };
    const lit = m.rows.filter(r => ed ? r.key === ed.key : r.cited || hv?.key === r.key || reading.value === r.key);
    const keyed = new Map();
    let next = 0;
    for (const r of lit) for (const n of [...r.ev?.names ?? []].sort((a, b) => a.from - b.from)) {
      if (!n.ids.length) continue;
      const k = norm(unbracket(r.formula.slice(n.from, n.to)));
      // `@` in a list's condition is one of the list's items, so it takes the list's colour.
      const parent = k === '@' && [...colors].find(([x]) => n.ids.every(id => x.ids.includes(id)));
      const c = parent ? parent[1] : keyed.get(k) ?? (next++ % 6) + 1;
      keyed.set(k, c); colors.set(n, c);
    }
    const put = (id, c, level, clause) => {
      if (!id || id === m.id) return;
      const x = map.get(id);
      if (!x || level < x[1]) map.set(id, [c, level]);
      if (clause && !via.has(id)) via.set(id, clause);
      for (const a of Rv.records[id]?.args ?? []) {   // a line's boxes, in its colour, lighter
        const o = Tree.objectOf(Rv.records, a.at);
        if (o && o !== m.id && !map.has(o)) map.set(o, [c, 2]);
      }
    };
    // In the cited row, a name of a list lights only the items its reason found: the path cited, not every
    // member of the list (hovering the name lights the rest).
    const cited = lit.find(r => r.cited), g = cited && !ed && m.rec && reasonOf(Rv, m.id, m.clause);
    for (const r of lit) for (const n of r.ev?.names ?? []) if (colors.has(n) && (r !== cited || !g || n.ids.length === 1)) n.ids.forEach(id => put(id, colors.get(n), 1));
    if (g) {
      const names = cited.ev.names.filter(n => colors.has(n));
      const colorFor = p => colors.get(names.find(n => n.ids.includes(p.id)) ?? names.filter(n => n.from >= p.from && n.to <= p.to).sort((a, b) => b.to - a.to)[0]) ?? 1;
      const items = new Map();   // a record linking an item of a list, and the item: a position line, and its holder
      for (const p of cited.ev.parts) for (const v of p.values.flat(Infinity)) if (v?.t === 'rec' && v.link) items.set(v.link, v.id);
      const seen = new Set();
      // A computed record's own reason, by the clause that cited it, down to entered records.
      const deep = (id, c, clause) => {
        if (seen.has(id) || seen.size > 120) return;
        seen.add(id);
        const row = reasonOf(Rv, id, clause), text = row && defOfRecord(Rv, id)?.rows[row.row]?.formula;
        const down = q => { if (q.id) { const cl = clauseOf(Rv, q.id, text, q); put(q.id, c, 2, cl); if (Rv.computed[q.id]) deep(q.id, c, cl); } (q.items ?? []).forEach(down); };
        (row?.parts ?? []).forEach(down);
      };
      const walk = p => {
        const c = colorFor(p), cl = p.id && clauseOf(Rv, p.id, cited.formula, p);
        if (p.id) { put(p.id, c, 0, cl); put(items.get(p.id), c, 0); if (Rv.computed[p.id]) deep(p.id, c, cl); }
        (p.items ?? []).forEach(walk);
      };
      // Where the rows rule it out, what the sentence says: what held and what failed, not what a list held.
      const no = notsOf(Rv, m.id);
      (no ? [...no.held, ...no.failed].flatMap(x => x.parts ?? []) : g.parts).forEach(walk);
    }
    if (m.err && m.err.error.code !== '#N/A') {
      // The loop: every record the definition would give that shows this error, and what closes it here.
      for (const e of Rv.errors) if (e.def === m.def.id && e.error.code === m.err.error.code)
        for (const x of e.args ?? [{ at: e.at }]) { const o = Tree.objectOf(Rv.records, x.at); if (o) map.set(o, ['loop', 0]); }
      for (const r of m.rows) for (const l of r.loops ?? []) for (const n of r.ev?.names ?? []) if (n.from >= l.from && n.to <= l.to) n.ids.forEach(id => map.set(id, ['loop', 0]));
    }
    return { colors, map, via, m };
  });

  // What a hovered part means: the records of the names inside it, each in its name's hue.
  const hovered = computed(() => {
    const hv = hover.value, row = hv && model.value?.rows?.find(r => r.key === hv.key), { colors } = finder.value;
    return row?.ev ? new Map(row.ev.names.filter(n => n.from >= hv.from && n.to <= hv.to).flatMap(n => n.ids.map(id => [id, colors.get(n) ?? 1]))) : null;
  });
  // The chart outlines what the bar names, and a hovered part's or fact's records at full strength, though the
  // path cited passes them by; or, while a clause of a definition is pointed at, the records it gives.
  const lit = signal(null);
  effect(() => {
    const { map } = finder.value, canvas = Shell.parts.peek().canvas, shown = lit.value;
    const pulse = hovered.value ?? (touch.value && new Map(touch.value.map(id => [id, map.get(id)?.[0] ?? 1])));
    if (shown) return canvas?.highlight(shown.length ? Object.fromEntries(shown.map(id => [id, [1, 0]])) : null, { dim: true });
    // Two boxes selected are being worked on, arranged or related: what holds between them is lit, the rest left as it
    // is; its reasons are lit, the rest of the chart dulled, only once the bar is pointed at.
    const pair = subject.value?.pair;
    if (pair && !pulse?.size) {
      const Rv = R.value, both = new Set(pair), between = nearOf(Rv, ...pair).filter(id => { const as = Rv.records[id].args; return as?.length === 2 && as.every(a => both.has(Tree.objectOf(Rv.records, a.at))) && new Set(as.map(a => Tree.objectOf(Rv.records, a.at))).size === 2; });
      return canvas?.highlight(between.length ? Object.fromEntries(between.map(id => [id, [1, 0]])) : null);
    }
    if (!map.size && !pulse?.size) return canvas?.highlight(null);
    const colors = Object.fromEntries([...map].map(([id, [c, level]]) => [id, [c, pulse?.has(id) ? 0 : level]]));
    for (const [id, c] of pulse ?? []) colors[id] ??= [c, 0];
    canvas?.highlight(colors, { dim: true, pulse: pulse ? [...pulse.keys()] : [] });
  });
  // Stepping down, the records stepped through are drawn though the view hides them: the chain stays on the
  // chart, and the line just clicked stays under the pointer.
  effect(() => {
    const id = model.value?.id, t = trail.value;
    Shell.parts.peek().canvas?.reveal?.(id && t.length ? [...t.map(x => x.id), id] : null);
  });

  // A new subject. One the last lit, if computed, is a step down: the last goes on the breadcrumb, and the chart
  // zooms to what's lit now; one on the breadcrumb is a step back to it; anything else starts afresh.
  let last = { key: '', map: new Map(), crumb: null };
  effect(() => {
    const key = subjectKey.value;
    if (key === last.key) return;
    const m = model.peek(), t = trail.peek(), k = m?.id ? t.findIndex(x => x.id === m.id) : -1;
    const down = k < 0 && !!m?.computed && (stepping || last.map.has(m.id));
    hover.value = null; touch.value = null; pick.value = null; reading.value = null;
    if (key !== NEW) writing.value = null;
    if (draft.peek() && key !== NEW) { draft.value = null; preview(null); }
    trail.value = k >= 0 ? t.slice(0, k) : down ? [...t, last.crumb] : [];
    last = { key, map: finder.peek().map, crumb: m && { id: m.id, title: m.title, clause: m.clause, place: placeText(m), keys: Shell.selection.peek() } };
    if (down || k >= 0) {
      const ids = [m.id, ...last.map.keys()];
      requestAnimationFrame(() => { Shell.parts.peek().canvas?.zoomTo?.(ids); clear(); });
    }
  });
  // The rows close when the selection changes, unless a row is being edited; and what the inspector pointed at
  // goes with what it was in: a clause lights nothing, and a tag's preview is redlined no more.
  // (Stepping back and forward along the trail, Alt+← and Alt+→, is reading on: with the keys in the reason, it stays open, and they stay in it.)
  on('select', () => { if (!editing.peek() && !holding) { if (document.activeElement?.closest?.('.fx-said')) into(); else open.value = false; } lit.value = null; if (pending.peek()?.from === 'outside') preview(null); });
  // Back to a record on the breadcrumb, the last by default.
  function back(i = trail.peek().length - 1) {
    const to = trail.peek()[i];
    if (to) goTo(to.id, to.clause, to.keys, false);
  }

  // ---- Why, in words: the facts that fired, as a sentence ----
  // The ground said as a lawyer would say it. Each record it reads is a fact in the chart's words ("Northstar
  // is an owner of the BDC with a voting percentage of 7%"), and what they give follows with "so" and the
  // clause that gave it ("so it is an affiliated person (§2(a)(3)(A))"). A computed reason that's the only one
  // among its facts unfolds into its own, a level down; any other is said with its clause, and a click steps
  // down into it. A row comparing with a number says the number: (5% or more).
  // Words: a term in lower case mid-sentence, names kept (BDC, Form PF); "a" or "an"; one of a list (Owners →
  // owner); whether words name more than one, by their head before "of", not in capitals (Bylaws, Articles of
  // Incorporation, audited accounts; not CRS), which takes no article; and whether an object is a person, whom
  // "it" doesn't name.
  const lower = s => String(s).replace(/\b[A-Z][a-z]+\b(?!\s+(?:[A-Z]{1,4}|\d+)\b)/g, w => w.toLowerCase());
  const article = w => /^[aeiou]/i.test(w) ? 'an' : 'a';
  const singular = w => [w.replace(/ies$/, 'y'), w.replace(/es$/, ''), w.replace(/s$/, '')].find(x => x !== w && Tree.same(Tree.plural(x), w)) ?? w;
  const plural = w => /\b[A-Za-z][a-z]*[^siu\W]s$/.test(String(w).split(/\s+of\s+/i)[0]);
  const an = w => plural(w) ? '' : `${article(w)} `;
  const isPerson = (Rv, id) => /individual|person/i.test(Rv.records[id]?.kind ?? '');
  // An entry named for what a thing is, and Type, says what kind of that thing it is: an entity's Entity Type
  // (AIV-1 is a limited partnership); a document's Document Type, which names one a list of documents found
  // (AIV-1 has a Certificate of Limited Partnership).
  const typeOf = (edge, what) => !!what && Tree.same(edge, `${what} Type`);
  // A clause's citation: the section its Description starts with ("Section 2(a)(3): …") and the row's label,
  // (A) reading §2(a)(3)(A), and (e)(1)(A) under 57(e) §57(e)(1)(A); a label of words (General partner) is the
  // row's own, not a citation, so its section alone is cited. A row of a definition that cites no section has
  // none.
  function citeOf(def, label) {
    const n = noteOf(def), lead = n ? String(N().description(n.pattern) ?? '').split('\n')[0] : '', l = Tree.clean(label);
    const sec = /^(?:Section|§)\s*(\d[\w.]*)((?:\([^)\s]+\))*)/i.exec(lead);
    if (l.includes('§')) return /§\s*\d[\w.]*(?:\([^)\s]+\))*/.exec(l)?.[0] ?? l;
    if (!sec) return null;
    const groups = s => s.match(/\([^)]+\)/g) ?? [], own = /^(?:\([^)\s]+\))*/.exec(l)[0];
    const a = groups(sec[2]), b = groups(own);
    let k = Math.min(a.length, b.length);
    while (k && a.slice(-k).join() !== b.slice(0, k).join()) k--;
    return `§${sec[1]}${a.join('')}${b.slice(k).join('')}`;
  }
  // A clause's own words: the paragraph of its Description that starts with the row's label, as the definition's
  // page sets it beside the row, less the label and the joining words at its ends ("or any person …, or").
  function wordsOf(def, label) {
    const n = noteOf(def), l = Tree.clean(label).toLowerCase();
    const p = l && String((n && N().description(n.pattern)) ?? '').split('\n').map(x => x.trim()).find(x => x.toLowerCase().startsWith(l) && !/\w/.test(x[l.length] ?? ' '));
    return p ? p.slice(l.length).replace(/^[\s.:—–-]+(?:(?:or|and)\s+)?/i, '').replace(/[\s,;]*(?:\b(?:or|and))?[\s,;]*$/, '') || null : null;
  }
  // A computed record's grounds, as its tag says them: the row its sentence cites first (its label), then every
  // other that holds; their citations, each once ("§57(b)(2), §57(b)(1)"), and the statute's words for each, where
  // the Description gives them.
  function reason(id) {
    const Rv = R.value, c = Rv.computed[id];
    if (!c) return null;
    const first = reasonOf(Rv, id), labels = [first?.label ?? c.label ?? '', ...othersOf(Rv, id, first?.row).map(r => r.label)];
    const once = xs => [...new Set(xs.filter(Boolean))], cites = once(labels.map(l => citeOf(c.def, l))), words = once(labels.map(l => wordsOf(c.def, l)));
    return { label: labels[0], cite: cites.join(', ') || null, words: words.join(' Also: ') || null };
  }
  // The number a row compares what it reads with, said: (5% or more), (more than 25%).
  function thresholdOf(text) {
    let toks, depth = 0, at = -1;
    try { const f = Formulas.splitFormula(text); toks = Formulas.tokenize(f.body, f.offset); } catch { return null; }
    for (const [i, t] of toks.entries()) {
      if (t.k === 'op' && (t.v === '(' || t.v === '{')) depth++;
      else if (t.k === 'op' && (t.v === ')' || t.v === '}')) depth--;
      else if (!depth && t.k === 'kw' && (t.v === 'AND' || t.v === 'OR')) return null;
      else if (!depth && t.k === 'op' && ['>=', '>', '<=', '<'].includes(t.v)) { if (at >= 0) return null; at = i; }
    }
    const n = at >= 0 && toks.length === at + 3 && toks[at + 1].k === 'num' && text.slice(toks[at + 1].pos, toks[at + 1].end);
    return n ? { '>=': `${n} or more`, '>': `more than ${n}`, '<=': `${n} or less`, '<': `less than ${n}` }[toks[at].v] : null;
  }

  // ---- Why not: what failed, where the rows rule a record out ----
  // A row read as far as it decides truth: IF, LET, AND, OR and NOT, through parentheses, down to its parts; a
  // part that compares (=, >, IN) or looks through a list (ANY, FILTER) keeps its pieces. Each keeps its text,
  // its span in the row, and whether it reads `@`.
  function skeleton(text) {
    let toks;
    try { const f = Formulas.splitFormula(text); toks = Formulas.tokenize(f.body, f.offset); } catch { return null; }
    const op = (t, ...v) => t?.k === 'op' && v.includes(t.v), kw = (t, v) => t?.k === 'kw' && t.v === v, close = new Map(), open = [];
    toks.forEach((t, i) => { if (op(t, '(', '{')) open.push(i); else if (op(t, ')', '}')) close.set(open.pop(), i); });
    // toks[a, b), cut where `at` picks a token outside brackets.
    const cut = (a, b, at) => { const out = []; let s = a; for (let i = a; i < b; i++) { if (close.has(i)) i = close.get(i); else if (at(toks[i])) { out.push([s, i, toks[i]]); s = i + 1; } } return [...out, [s, b]]; };
    const read = (a, b) => {
      while (op(toks[a], '(') && close.get(a) === b - 1) { a++; b--; }
      if (a >= b) return null;
      const n = { from: toks[a].pos, to: toks[b - 1].end, text: text.slice(toks[a].pos, toks[b - 1].end), at: toks.slice(a, b).some(t => op(t, '@')) };
      const sub = xs => xs.map(([x, y]) => read(x, y)), f = toks[a].k === 'name' && toks[a].v.toUpperCase();
      // AND(a, b) and OR(a, b), as Excel writes them, are a AND b and a OR b; but `a AND (b)` is `a AND` something.
      const called = i => (kw(toks[i], 'AND') || kw(toks[i], 'OR')) && op(toks[i + 1], '(') && (i === a || toks[i - 1].k === 'op' && !op(toks[i - 1], ')', '}') || toks[i - 1].k === 'kw');
      if (called(a) && close.get(a + 1) === b - 1) { const xs = cut(a + 2, b - 1, t => op(t, ',')); return xs.length > 1 ? { ...n, k: toks[a].v, kids: sub(xs) } : read(a + 2, b - 1); }
      for (const k of ['OR', 'AND']) { let i = a; const xs = cut(a, b, t => { const at = toks.indexOf(t, i); i = at; return kw(t, k) && !called(at); }); if (xs.length > 1) return { ...n, k, kids: sub(xs) }; }
      if (kw(toks[a], 'NOT')) return { ...n, k: 'NOT', kids: [read(a + 1, b)] };
      const xs = cut(a, b, t => kw(t, 'IN') || op(t, '=', '<>', '<', '>', '<=', '>='));
      if (xs.length === 2) return { ...n, k: kw(xs[0][2], 'IN') ? 'IN' : 'CMP', op: xs[0][2].v, kids: sub(xs) };
      if (op(toks[a + 1], '(') && close.get(a + 1) === b - 1 && ['IF', 'LET', 'ANY', 'FILTER'].includes(f)) return { ...n, k: f, kids: sub(cut(a + 2, b - 1, t => op(t, ','))) };
      return { ...n, k: 'part' };
    };
    return read(0, toks.length - 1);
  }
  // A condition that holds by what a value isn't (x <> y, NOT x) only excludes: what it read is no reason, for
  // any value but the one excluded would do as well, and as NOT ANY reads nothing, it says nothing. A lawyer
  // states what a rule asks, not each exception that doesn't apply; the rows show it, in ink.
  const excludes = n => n.k === 'NOT' || (n.k === 'CMP' && n.op === '<>');
  function exclusions(text) {
    const out = [], walk = n => { if (n) excludes(n) ? out.push(n) : n.kids?.forEach(walk); };
    walk(skeleton(text));
    return n => out.some(x => n.from >= x.from && n.to <= x.to);
  }
  // A formula asked of the engine at a record, inside the LETs on the way to where it's read: its value, the
  // records each name read, and where the body asked about starts.
  function ask(Rv, d, id, lets, body, lead = '=') {
    const pre = `${lead} ${lets.map(l => `LET(${l.name}, ${l.text}, `).join('')}`;
    try { const r = Formulas.evaluateRow(Rv, d.id, pre + body + ')'.repeat(lets.length), id); return r && { ...r, at: pre.length }; } catch { return null; }
  }
  const either = xs => xs.length > 1 ? `${xs.slice(0, -1).join(', ')} or ${xs.at(-1)}` : xs[0] ?? '';
  const SOUGHT = '[·]';

  // Why the rows rule a record out. A row gives FALSE where it reaches a condition that fails: what held on the
  // way there (an IF's condition, less what only excludes) is a reason, said first, and what failed follows
  // "but". A row that gives FALSE itself where its condition holds, IF(c, FALSE), rules the record out because
  // c holds: a reason like any other, with "so". And the rows before it that would have attested it (← c, or
  // IF(c, TRUE)) gave nothing because their conditions failed: they follow "but" too. Each is said by what it
  // read: the row's ground for its own row, and for a row before, the records its names read there. For a pair with
  // no record (g.none), every row is a row before.
  function whyNot(Rv, d, g, id) {
    const held = [], failed = [], spanned = (ps, n) => ps.filter(p => p.from >= n.from && p.to <= n.to);
    const truth = (n, lets) => ask(Rv, d, id, lets, n.text, '←')?.value === true;
    const attests = sk => sk?.k === 'IF' && sk.kids.length === 2 && /^TRUE$/i.test(sk.kids[1]?.text ?? '') ? sk.kids[0] : null;
    d.rows.slice(0, g.row + 1).forEach((row, i) => {
      const sk = skeleton(row.formula), own = !g.none && i === g.row, cond = own ? sk : Formulas.splitFormula(row.formula).kind === 'implies' ? sk : attests(sk);
      if (!cond) return;
      const names = own ? null : Formulas.evaluateRow(Rv, d.id, i, id)?.names ?? [];
      const within = own ? n => spanned(g.parts, n) : n => spanned(names, n).flatMap(m => m.ids.map(y => ({ id: y })));
      const no = n => n?.k === 'part' && /^FALSE$/i.test(n.text);
      // Down to what failed: an IF's branch taken (its condition held, or failed where the other gives FALSE);
      // a LET's body; AND's part that failed; OR's every part.
      const walk = (n, lets) => {
        if (!n || no(n)) return;
        if (n.k === 'IF') { const [c, t, e] = n.kids; if (truth(c, lets)) { held.push(...leaves(c, lets).filter(x => !excludes(x)).map(x => ({ parts: within(x), then: x.k === 'CMP' ? thresholdOf(x.text) : null }))); walk(t, lets); } else walk(no(e) ? c : e, lets); }
        else if (n.k === 'LET') walk(n.kids.at(-1), [...lets, ...n.kids.slice(0, -1).flatMap((x, k, l) => k % 2 ? [] : [{ name: x.text, text: l[k + 1]?.text }])]);
        else if (n.k === 'AND') walk(n.kids.find(x => !truth(x, lets)), lets);
        else if (n.k === 'OR') n.kids.forEach(x => walk(x, lets));
        else failed.push(...missed(Rv, d, id, n, lets, within, !!g.none).map(f => ({ ...f, row: i })));
      };
      // What held, by its parts: OR's that held, AND's every one.
      const leaves = (n, lets) => n.k === 'OR' ? leaves(n.kids.find(x => truth(x, lets)) ?? n.kids[0], lets) : n.k === 'AND' ? n.kids.flatMap(x => leaves(x, lets)) : [n];
      walk(cond, []);
    });
    return { held, failed };
  }

  // What a failed part read, as reasons are said, with what it wanted beside what it found: "a member, not a
  // managing member"; "(98.4%, not 100%)". A NOT failed where what it negates held, which is said as it is. A
  // list that lacked what was sought is said by what came nearest (see nearest).
  function missed(Rv, d, id, n, lets, within, none = false) {
    if (n.k === 'NOT') return [{ parts: within(n.kids[0]) }];
    if (n.k === 'ANY' || (n.k === 'IN' && isObj(Rv.records[ask(Rv, d, id, lets, n.kids[0].text)?.value?.id]))) return nearest(Rv, d, id, n, lets);
    // A relation called, of a pair with no record, is said as it's asked: it may hold, but not by the clause cited.
    if (n.k !== 'CMP' && n.k !== 'IN') { const ps = within(n), called = none || !gather(Rv, id, new Set(), ps).length ? notCalled(Rv, d, id, lets, n) : null; return called ?? [{ parts: ps }]; }
    // Of a pair with no record, a total is said as what it counted, not by all it looked through.
    const total = none && n.kids.find(k => /^SUM\(/i.test(k.text)), counted = total && noneCounted(Rv, d, id, lets, n, total);
    if (counted) return counted;
    // The side that read records is what was found; the other, what was wanted.
    const [x, y] = n.kids, found = within(y).length && !within(x).length ? y : x, wanted = found === x ? y : x, parts = within(found);
    if (!parts.length) return absent(Rv, d, id, lets, found) ?? noneCounted(Rv, d, id, lets, n, found) ?? [];
    if (within(wanted).length) return [{ parts: [...parts, ...within(wanted)] }];
    const v = ask(Rv, d, id, lets, found.text)?.value, w = ask(Rv, d, id, lets, wanted.text)?.value, recs = Rv.records;
    const pct = /%/.test(wanted.text) || parts.some(p => recs[p.id]?.field === 'percent'), one = parts.length === 1 && !parts[0].items?.length;
    // What it missed by: not what it wanted, or the other side of the line it had to cross; and what would pass.
    const op = n.k === 'IN' ? '=' : found === x ? n.op : { '<': '>', '>': '<', '<=': '>=', '>=': '<=' }[n.op] ?? n.op, sw = show(w, pct);
    const miss = { '=': `not ${either([w].flat().map(z => show(z, pct)))}`, '>': `${sw} or less`, '>=': `less than ${sw}`, '<': `${sw} or more`, '<=': `more than ${sw}` }[op];
    const want = { '=': either([w].flat().map(z => show(z, pct))), '>': `more than ${sw}`, '>=': `${sw} or more`, '<': `less than ${sw}`, '<=': `${sw} or less` }[op];
    if (op === '=' && one && v?.t === 'rec' && v.id) return [{ parts, not: { ids: [v.id], text: notOf(recs, v.id, w, pct) } }];
    return [{ parts, want, then: miss && (one ? miss : `${show(v, pct)}, ${miss}`) }];
  }
  // A total, said by what it counted and what's asked of it: no voting percentage (more than 25% needed); a voting
  // percentage of 7% (more than 25% needed).
  function noneCounted(Rv, d, id, lets, n, found) {
    const e = /^SUM\(.*\.\s*(?:\[([^\]]+)\]|([A-Za-z_]\w*))\s*\)$/i.exec(found.text), t = thresholdOf(n.text);
    if (!e) return null;
    const what = lower(e[1] ?? e[2]), v = ask(Rv, d, id, lets, found.text)?.value;
    return [{ clause: { subj: null, pre: [typeof v === 'number' && v ? `${article(what)} ${what} of ${show(v, /%/.test(n.text))}` : `no ${what}`], obj: [], post: t ? [` (${t} needed)`] : [] } }];
  }
  // A relation a formula calls, with what it says of the sides: its pattern, for its names; its edges; the text at
  // each side; and the clauses cited of it, each a label after a dot: [Affiliated Person](x, @).[(C)].
  function relationNamed(name) {
    const d = [...defs.peek().values()].find(x => x.isRelation && x.edges.length === 2 && Tree.same(x.name, name));
    if (d) { const t = noteOf(d.id)?.pattern; return t ? { t, edges: d.edges } : null; }
    const s = Object.values(App.schema.peek()).find(x => x.args?.length === 2 && Tree.same(N().name(Tree.bare(x)), name)), t = s && Tree.bare(s);
    return t ? { t, edges: N().edges(t) } : null;
  }
  function calledIn(text) {
    let toks;
    try { toks = Formulas.tokenize(text); } catch { return null; }
    const op = (t, v) => t?.k === 'op' && t.v === v;
    for (let i = 0; i < toks.length - 1; i++) {
      if (toks[i].k !== 'name' || !op(toks[i + 1], '(')) continue;
      const rel = relationNamed(toks[i].v);
      if (!rel) continue;
      let depth = 0, cut = -1, close = -1;
      for (let j = i + 1; j < toks.length && close < 0; j++) {
        if (op(toks[j], '(') || op(toks[j], '{')) depth++;
        else if (op(toks[j], ')') || op(toks[j], '}')) { if (!--depth) close = j; }
        else if (depth === 1 && op(toks[j], ',')) cut = j;
      }
      if (close < 0 || cut < 0) continue;
      const sides = [text.slice(toks[i + 2].pos, toks[cut - 1].end), text.slice(toks[cut + 1].pos, toks[close - 1].end)];
      return { ...rel, sides, labels: [...text.matchAll(/\.\s*\[(\([^\]]*\))\]/g)].map(m => m[1]) };
    }
    return null;
  }
  // "or" between clauses cited: under (C) or (D).
  const underOf = labels => labels.length ? ` under ${either(labels)}` : '';
  // A relation called that doesn't hold, said as the relation is, with what it cites: is not a controller of the BDC;
  // or, of a tag read on a record, that it isn't one: Tessellate is not an investment company.
  function notCalled(Rv, d, id, lets, n) {
    const recs = Rv.records, objectAt = t => { const v = ask(Rv, d, id, lets, t)?.value?.id; return v && Tree.objectOf(recs, v); }, call = calledIn(n.text);
    if (call && !call.sides.includes('@')) {
      const [A, B] = call.sides.map(objectAt), [s, words] = phrase(call.t, call.edges[0], call.edges[1], { not: true });
      if (!A || !B) return null;
      const [x, y] = Tree.same(s, call.edges[0]) ? [A, B] : [B, A];
      return [{ clause: { subj: x, pre: [words], obj: [{ name: y }], post: [underOf(call.labels)].filter(Boolean) } }];
    }
    const e = /^(.*\S)\s*\.\s*(?:\[([^\]]+)\]|([A-Za-z_]\w*))$/.exec(n.text), o = e && !call && objectAt(e[1]), tag = e?.[2] ?? e?.[3];
    return isObj(recs[o]) ? [{ clause: { subj: o, pre: [` is not ${article(tag)} ${lower(tag)}`], obj: [], post: [] } }] : null;
  }
  // What a value isn't, said as the fact says what it is: a role, or a kind, with its article (not a managing
  // member; not a corporation).
  function notOf(recs, id, w, pct) {
    const r = recs[id], xs = [w].flat().map(z => show(z, pct));
    return either((r?.args && 'choice' in r) || typeOf(r?.edge, recs[Tree.objectOf(recs, id)]?.kind) ? xs.map(z => `${an(z)}${lower(z)}`) : xs);
  }

  // A list that lacked what was sought, said by what came nearest: x IN list, x IN FILTER(list, c), and
  // ANY(list, c), where c's part @ = x seeks x. Of the list before it was filtered, the items that met its
  // conditions furthest, each with what it read of the next and what that wanted (he is a member, not a
  // managing member, of GP III); or where none met the first, that x isn't among the list, or that it has none.
  function nearest(Rv, d, id, n, lets) {
    const and = c => !c ? [] : c.k === 'AND' ? c.kids : [c], recs = Rv.records;
    let x = null, B = n.kids[0], conds = and(n.kids[1]);
    if (n.k === 'IN') { x = n.kids[0]; B = n.kids[1]; conds = []; if (B.k === 'FILTER') { conds = and(B.kids[1]); B = B.kids[0]; } }
    else { const k = conds.findIndex(c => c.k === 'CMP' && c.op === '=' && c.kids.some(s => s.text === '@') && c.kids.some(s => !s.at)); if (k >= 0) { x = conds[k].kids.find(s => !s.at); conds = conds.filter((_, i) => i !== k); } }
    // A list none of which holds what's asked of each, narrowed or not, is said as that (see noneOf).
    if (!x && n.k === 'ANY') {
      const meant = t => /^@\s*\.\s*\[[^\]]+\](?:\s+OR\s+@\s*\.\s*\[[^\]]+\])*$/i.test(t), labels = t => [...t.matchAll(/\[([^\]]+)\]/g)].map(m => m[1]);
      const under = [...(B.k === 'FILTER' && meant(B.kids[1].text) ? labels(B.kids[1].text) : []), ...conds.slice(0, -1).filter(c => meant(c.text)).flatMap(c => labels(c.text))];
      const list = B.k === 'FILTER' && meant(B.kids[1].text) ? B.kids[0] : B, rest = conds.filter((c, i) => i === conds.length - 1 || !meant(c.text));
      if (rest.length === 1) { const said = noneOf(Rv, d, id, lets, list, under, rest[0]); if (said) return said; }
    }
    const at = x ? [...lets, { name: SOUGHT, text: x.text }] : lets, all = [...(x ? [{ k: 'CMP', op: '=', text: `@ = ${SOUGHT}` }] : []), ...conds];
    const filtered = k => `FILTER(${B.text}, ${all.slice(0, k).map(c => `(${c.text})`).join(' AND ')})`;
    for (let k = all.length - 1; k > 0; k--) {
      const near = [ask(Rv, d, id, at, filtered(k))?.value ?? []].flat(Infinity).filter(v => v?.t === 'rec' && v.id);
      if (!near.length) continue;
      // The next condition at those items: what its side about the item read of it (its status), under the item
      // it was read of, or else the item's own place in the list (his membership); and what the other side
      // wanted.
      const c = all[k], side = c.k === 'CMP' || c.k === 'IN' ? c.kids.find(s => s.at) ?? c : c, other = side !== c ? c.kids.find(s => s !== side) : null;
      const body = `EACH(${filtered(k)}, ${side.text})`, r = ask(Rv, d, id, at, body), from = (r?.at ?? 0) + body.length - side.text.length - 1;
      const read = [...new Set((r?.names ?? []).filter(m => m.from >= from && m.to <= from + side.text.length && side.text.slice(m.from - from, m.to - from) !== '@').flatMap(m => m.ids))]
        .filter(y => recs[y] && !isObj(recs[y]));
      const ids = read.length ? read : [...new Set(near.map(v => v.link).filter(Boolean))], w = other && !other.at ? ask(Rv, d, id, at, other.text)?.value : undefined;
      const of = y => near.find(v => v.link && recs[y].at === v.id)?.link;
      return [{ parts: ids.map(y => of(y) ? { id: of(y), items: [{ id: y }] } : { id: y }), ...(w !== undefined && (c.k === 'IN' || c.op === '=') && ids.length && { not: { ids, text: notOf(recs, ids.at(-1), w) } }) }];
    }
    const some = [ask(Rv, d, id, lets, B.text)?.value ?? []].flat(Infinity).some(v => v?.t === 'rec' && v.id);
    return absent(Rv, d, id, at, B, { x: x && ask(Rv, d, id, lets, x.text)?.value?.id, c: !x && some ? all[0] : null, rest: all.slice(1) }) ?? [];
  }
  // A list with none of what was sought, said of whose list it is: x isn't among GP III's general partners;
  // the signing authority is not evidenced by anything; Fund III-A has no documents, or no Certificate of
  // Limited Partnership (what its Document Type names), or none with a status of Filed.
  function absent(Rv, d, id, lets, B, { x = null, c = null, rest = [] } = {}) {
    const m = /^(?:(.*\S)\s*\.\s*)?(?:\[([^\]]+)\]|([A-Za-z_]\w*))$/.exec(B.text.replace(/^COUNT\((.*)\)$/i, '$1').trim());
    if (!m) return null;
    const recs = Rv.records, list = m[2] ?? m[3], o = ask(Rv, d, id, lets, m[1] ?? '@')?.value?.id, up = o && Tree.objectOf(recs, o), owner = isObj(recs[up]) ? up : o;
    if (!recs[owner]) return null;
    const named = isObj(recs[owner]), p = predicate(list), who = named ? [] : [`the ${lower(N().nameOf(recs, owner))}`];
    // A list named as a predicate is said with it (is not evidenced by); any other, as what the owner has. Each with
    // what would have it so (yes), for what clears a check.
    let pre, yes, obj = [];
    if (x && p) [pre, yes, obj] = [[...who, verbal(p, true) + p.prep], [...who, verbal(p) + p.prep], [{ name: x }]];
    else if (x) {
      // A list narrowed to one value of what links each (FILTER(Members, @.Membership = "Managing Member")) is said by that
      // value: not a managing member of GP III. Not among its members would say more than what's asked, and may be false.
      const q = rest.length === 1 && rest[0].k === 'CMP' && rest[0].op === '=' ? rest[0] : null, [s, o] = q ? (q.kids[0]?.at ? q.kids : [...q.kids].reverse()) : [], v = named && s && /^@\s*\./.test(s.text) && !o?.at && ask(Rv, d, id, lets, o.text)?.value;
      if (typeof v === 'string') { const role = `${article(v)} ${lower(v)} of `; return [{ clause: { subj: x, pre: [` is not ${role}`], obj: [{ name: owner }], post: [], yes: { subj: x, pre: [` is ${role}`], obj: [{ name: owner }], post: [] } } }]; }
      const among = [...(named ? [{ name: owner }, possessive(Rv, owner)] : [`${who[0]}’s`]), ` ${lower(list)}`]; return [{ clause: { subj: x, pre: [' is not among '], obj: among, post: [], yes: { subj: x, pre: [' is among '], obj: among, post: [] } } }];
    }
    else if (!c) { const kind = kindOfList(list); [pre, yes] = [[...who, p ? `${verbal(p, true)}${p.prep}anything` : ` has no ${lower(list)}`], [...who, p ? `${verbal(p)}${p.prep}${kind ? `${article(kind)} ${lower(kind)}` : 'something'}` : ` has ${lower(list)}`]]; }
    else {
      const [side, other] = c.kids?.[0]?.at ? c.kids : [...(c.kids ?? [])].reverse(), e = /^@\s*\.\s*(?:\[([^\]]+)\]|([A-Za-z_]\w*))$/.exec(side?.text ?? '');
      const w = e && (c.k === 'IN' || c.op === '=') && !other.at && ask(Rv, d, id, lets, other.text)?.value;
      if (w === undefined || w === null || w === false || p) return null;
      const entry = e[1] ?? e[2], noun = singular(list), ws = either([w].flat().map(z => show(z))), one = [w].flat().length === 1 ? `${an(ws)}${ws}` : `one of ${ws}`;
      // What else it would have to be, for what clears it: with a status of Executed, Filed or Final.
      const more = rest.flatMap(q => { const [s, o] = q.kids?.[0]?.at ? q.kids : [...(q.kids ?? [])].reverse(), f = /^@\s*\.\s*(?:\[([^\]]+)\]|([A-Za-z_]\w*))$/.exec(s?.text ?? ''), v = f && !o?.at && ask(Rv, d, id, lets, o.text)?.value;
        return f && v !== undefined && v !== null && v !== false ? [` with ${article(f[1] ?? f[2])} ${lower(f[1] ?? f[2])} of ${either([v].flat().map(z => show(z)))}`] : []; }).join(' and');
      [pre, yes] = typeOf(entry, noun) ? [[...who, ` has no ${ws}`], [...who, ` has ${one}${more}`]]
        : [[...who, ` has no ${lower(noun)} with ${article(entry)} ${lower(entry)} of ${ws}`], [...who, ` has ${article(noun)} ${lower(noun)} with ${article(entry)} ${lower(entry)} of ${ws}${more}`]];
    }
    const subj = named ? owner : null;
    return [{ clause: { subj, pre, obj, post: [], yes: { subj, pre: yes, obj, post: [] } } }];
  }
  // A list none of which holds what's asked of each, said of whose list it is, as the relation it asks is said: she is
  // not an affiliated person of any of the BDC's close affiliates under (b)(1) or (b)(2); none of Fund III's
  // controlled companies is a controller of Tessellate. Where the list's been narrowed, those of the rest that do hold
  // it follow, as that's what came nearest: only of Cayman GP, which isn't under (b)(1) or (b)(2). `under`, the clauses
  // it's narrowed to; c, what's asked.
  function noneOf(Rv, d, id, lets, B, under, c) {
    const m = /^(?:(.*\S)\s*\.\s*)?(?:\[([^\]]+)\]|([A-Za-z_]\w*))$/.exec(B.text), recs = Rv.records;
    if (!m) return null;
    const list = m[2] ?? m[3], o = ask(Rv, d, id, lets, m[1] ?? '@')?.value?.id, owner = o && Tree.objectOf(recs, o);
    if (!isObj(recs[owner])) return null;
    const whose = [{ name: owner }, possessive(Rv, owner), ` ${lower(list)}${underOf(under)}`], items = t => [ask(Rv, d, id, lets, t)?.value ?? []].flat(Infinity).filter(v => v?.t === 'rec' && v.id);
    if (!items(B.text).length) return [{ clause: { subj: owner, pre: [` has no ${lower(list)}`], obj: [], post: [] } }];
    const objectAt = t => { const v = ask(Rv, d, id, lets, t)?.value?.id; return v && Tree.objectOf(recs, v); }, call = calledIn(c.text);
    if (call?.sides.includes('@')) {
      const k = call.sides.indexOf('@'), other = objectAt(call.sides[1 - k]), [s, not] = phrase(call.t, call.edges[0], call.edges[1], { not: true }), [, yes] = phrase(call.t, call.edges[0], call.edges[1]);
      if (!other) return null;
      const cited = underOf(call.labels), itemFirst = (k === 0) === Tree.same(s, call.edges[0]);
      if (itemFirst) return [{ clause: { subj: null, pre: ['none of ', ...whose, yes], obj: [{ name: other }], post: [cited].filter(Boolean) } }];
      const near = under.length ? items(`FILTER(${B.text}, ${c.text})`).map(v => Tree.objectOf(recs, v.id)) : [];
      const only = near.length ? [', only of ', ...near.slice(0, 2).flatMap((y, i) => [...(i ? [' and '] : []), { name: y }]), near.length > 2 ? ` and ${near.length - 2} more` : '', `, ${near.length > 1 ? 'which are' : 'which is'} not under ${either(under)}`].filter(Boolean) : [];
      const [, head, prep] = /^(.*) (\S+) $/.exec(not) ?? [null, not.trimEnd(), ''];
      return [{ clause: { subj: other, pre: [`${head}${cited} ${prep ? `${prep} ` : ''}any of `], obj: whose, post: only } }];
    }
    // x IN @.[General Partners] OR …: the lists it might be among, of any of them.
    const among = [...c.text.matchAll(/([^\s(]+|\[[^\]]+\])\s+IN\s+(?:FILTER\(\s*)?@\s*\.\s*(?:\[([^\]]+)\]|([A-Za-z_]\w*))/gi)];
    if (among.length) {
      const x = objectAt(among[0][1]);
      if (x) return [{ clause: { subj: x, pre: [` is not among the ${either(among.map(a => lower(a[2] ?? a[3])))} of any of `], obj: whose, post: [] } }];
    }
    return null;
  }

  // Words read as a predicate, and how they're said: a noun with "is a" (an investor in), a participle with
  // "is" (is evidenced by), a verb as it is (signs for). Without a preposition, only a verb of one word is one
  // (Concerns), and only where a relation's own name says it.
  function predicate(words, bare) {
    const w = Tree.clean(words), m = /^(.+?)\s+(of|in|into|for|to|by|with|from|on|at)$/i.exec(w) ?? (bare && /^[a-z]+[^s\W]s$/i.test(w) ? [w, w, ''] : null);
    if (!m) return null;
    const head = lower(m[1]), last = head.split(' ').at(-1);
    return { head, prep: m[2] ? ` ${m[2].toLowerCase()} ` : ' ', form: /ed$/.test(last) ? 'participle' : /[^s]s$/.test(last) ? 'verb' : 'noun' };
  }
  // Which of a relation's names says it, between its sides a and b (see factOf): the first side's list of the
  // second; its own name (`name`, a record's where there is one); a tag's second side's list of the first,
  // said of the second (`flip`); or else the role the first side's list names, one of it.
  function predicateOf(t, a, b, { tag = true, name = N().name(t) } = {}) {
    const n = N(), p = predicate(n.listName(t, b)) ?? predicate(name, true), flip = !p && tag && predicate(n.listName(t, a));
    return p ?? (flip ? { ...flip, flip } : { head: lower(singular(n.listName(t, a))), prep: ' of ', form: 'noun', role: true });
  }
  // A relation in words, for a pane that says its sides itself: [the side said first, the words, the other].
  // An option says the role: is a director of; a role still to choose is "…", as a side still to choose is.
  function phrase(t, a, b, { choice = 'choice' in (t.out ?? {}) ? '…' : null, not = false } = {}) {
    const q = predicateOf(t, a, b), w = choice ? { head: lower(choice), form: 'noun', prep: q.form === 'noun' && !q.flip ? q.prep : ' of ' } : q;
    return w.flip && !choice ? [b, verbal(w, not) + w.prep, a] : [a, verbal(w, not) + w.prep, b];
  }
  // A tag's name read as a condition: what it names (`what`), then what's said of it (`said`), the name split
  // before a phrase of place (on File, In Range), a verb and its particle (Adds Up, and `verb`, add up), or a
  // last word that's a participle or an adjective (Registered, Held, Open). What it names is in words, for
  // initials don't say how they're held: CIMA Registered is registered with CIMA. Null where the name doesn't
  // read so (Good Standing, U.S. Person).
  const PLACE = /^(.+?)\s+((?:on|in|at|under|within|past)\s.+)$/i, PARTICLE = /^(.+?)\s+(\S+[^s\s]s\s(?:up|down|out|off|through))$/i, STATE = /^(.+?)\s+(\S+[^e\s]ed|held|paid|open|due)$/i;
  function conditionOf(name) {
    const w = Tree.clean(name), place = PLACE.exec(w), m = place ?? PARTICLE.exec(w) ?? STATE.exec(w);
    if (!m || /\b[A-Z]{2,}\b|[\d.()]/.test(m[1])) return null;
    const what = m[1].toLowerCase(), said = m[2].toLowerCase(), verb = !place && /s\s\S+$/.test(said) ? said.replace(/s(?=\s)/, '') : null;
    return { what, said, verb, plural: plural(what) };
  }
  // A predicate's words, or their negation: is (not) a director; is (not) evidenced; signs, does not sign.
  const verbal = (w, not) => w.form === 'noun' ? ` is ${not ? 'not ' : ''}${article(w.head)} ${w.head}` : w.form === 'participle' ? ` is ${not ? 'not ' : ''}${w.head}`
    : not ? ` does not ${w.head.replace(/s\b/, '')}` : ` ${w.head}`;

  // A record as a clause: whom it's about (an object, possessive or not), what's said of it, and of whom. Its
  // segments are text, a name (an object's id) or a term, the clause's point, italic where a formula gave it.
  // Entries read at a relation are said with it: "with a voting percentage of 7%". `would` is the record as
  // the rows would give it, where an entry overrides them: it would be a controller.
  // A relation is said by the first of its names that reads as a predicate (Notes: a list's Name, and the
  // relation's): the first side's list of the second ("Affiliated Person Of", "Investor In", "Signs For"); the
  // relation's own name ("Concerns"); or the second side's list of the first, said of the second ("Evidenced
  // By"). Any other relation is said by the role that list names, one of it (Owners): is an owner of.
  function factOf(Rv, id, reads = [], would = null) {
    const recs = Rv.records, r = would ?? recs[id], n = N(), fx = x => !!Rv.computed[x] || (!!would && x === id);
    // The point: the value read, where one is; else what the record says.
    const term = (x, text) => x === id && reads.length ? text : { term: text, id: x, fx: fx(x) };
    const be = (yes = true) => would ? (yes ? ' would be ' : ' would not be ') : yes ? ' is ' : ' is not ';
    const holds = yes => would ? (yes ? ' would hold' : ' would not hold') : yes ? ' holds' : ' does not hold';
    const c = { id: [id, ...reads].find(fx) ?? id, ids: [id, ...reads], subj: null, poss: false, pre: [], obj: [], post: [] };
    // Entries read, said with the record: with a voting percentage of 7%; with a status of Filed and a date of ….
    const withs = xs => xs.flatMap((e, i) => { const x = recs[e], and = !i ? ' ' : i < xs.length - 1 ? ', ' : ' and ';
      return 'tag' in x ? [`${and}${x.tag ? 'with' : 'without'} ${lower(x.edge)}`] : [`${and}${i ? '' : 'with '}${an(x.edge)}${lower(x.edge)} of `, term(e, Tree.outputText(x))]; });
    if (r.args) {
      // An item a list found, with what was read of it, is one fact: what the other side has, one of its list,
      // named by what kind it is (typeOf) or else as the list names one, with the rest of what was read: AIV-1
      // has a Certificate of Limited Partnership with a status of Filed. Clicked, it selects the item.
      const ends = r.args.map(x => Tree.objectOf(recs, x.at)), k = ends.length === 2 ? ends.findIndex(o => reads.some(e => recs[e].at === o)) : -1;
      if (k >= 0) {
        const t = Tree.treeOf(recs, id), noun = singular(t ? n.listName(t, r.args[k].edge) : r.args[k].edge), item = ends[k];
        const kind = reads.find(e => recs[e].at === item && typeOf(recs[e].edge, noun)) ?? Tree.entryAt(recs, item, `${noun} Type`), what = kind ? Tree.outputText(recs[kind]) : lower(noun);
        return Object.assign(c, { id: [id, ...reads].find(fx) ?? item, ids: [...c.ids, item], subj: ends[1 - k],
          pre: [' has ', an(what), reads.includes(kind) ? term(kind, what) : what], post: withs(reads.filter(e => e !== kind)) });
      }
      const [a, b] = n.sides(recs, id), A = Tree.objectOf(recs, a.at), B = b && Tree.objectOf(recs, b.at), t = Tree.treeOf(recs, id);
      // Each side's list of the other: Holdings, and Owners.
      const theirs = t && b ? n.listName(t, a.edge) : a.edge, yes = r.tag !== false;
      const q = !B ? null : t ? predicateOf(t, a.edge, b.edge, { tag: 'tag' in r, name: n.nameOf(recs, id) }) : predicate(n.nameOf(recs, id), true);
      const p = q && !q.flip && !q.role ? q : null, flip = q?.flip ? q : null;
      const of = B ? [p?.form === 'noun' && !('field' in r) ? p.prep : ' of ', { name: B }] : [];
      const rest = further(recs, id);
      c.post = [...rest, ...(rest.length && reads.length ? [','] : []), ...withs(reads)];
      if ('field' in r) return Object.assign(c, { subj: A, poss: true, pre: [` ${lower(n.nameOf(recs, id))}`], obj: of, post: [be(), term(id, Tree.outputText(r)), ...c.post] });
      const says = q => q.form === 'noun' ? [be(yes), `${article(q.head)} `, term(id, q.head)] : q.form === 'participle' ? [be(yes), term(id, q.head)]
        : yes ? (would ? [' would ', term(id, q.head.replace(/s\b/, ''))] : [' ', term(id, q.head)]) : [would ? ' would not ' : ' does not ', term(id, q.head.replace(/s\b/, ''))];
      if ('choice' in r) return Object.assign(c, { subj: A, pre: says({ head: lower(r.choice), form: 'noun' }), obj: of });
      if (p) return Object.assign(c, { subj: A, pre: says(p), obj: [p.prep, { name: B }] });
      if (flip) return Object.assign(c, { subj: B, pre: says(flip), obj: [flip.prep, { name: A }] });
      return Object.assign(c, { subj: A, pre: says({ head: lower(singular(theirs)), form: 'noun' }), obj: of });
    }
    const O = Tree.objectOf(recs, id), o = recs[O];
    if ('tag' in r) {
      // A tag described as "A fund that …" is a noun: Fund III is a private fund. Any other is a condition, said
      // as its name says it (see conditionOf), and whose it is (see whose): Fund III's ownership adds up; the
      // capacity is not held. A name that doesn't read so is said by itself: Good Standing holds for Fund III.
      const noun = /^an?\s/i.test(n.description(Tree.treeOf(recs, id) ?? { args: [{ edge: r.edge, loc: {} }] }) ?? '');
      if (noun) return Object.assign(c, { subj: O, pre: [be(r.tag), `${article(r.edge)} `, term(id, lower(r.edge))] });
      const k = conditionOf(r.edge), not = r.tag === false ? 'not ' : '';
      if (!k) return Object.assign(c, { pre: [term(id, r.edge), holds(r.tag)], obj: isObj(o) ? [' for ', { name: O }] : [] });
      const says = k.verb ? (would ? [` would ${not}`, term(id, k.verb)] : not ? [' does not ', term(id, k.verb)] : [' ', term(id, k.said)])
        : [would ? ` would ${not}be ` : ` ${k.plural ? 'are' : 'is'} ${not}`, term(id, k.said)];
      return Object.assign(c, whose(Rv, id, k.what), { post: says });
    }
    const v = Tree.outputText(r), named = o && n.nameOf(recs, O);
    // An entry that names its object (a tax year's Year) says what the object is: the tax year is 2026. It only
    // names it, so where the sentence names the object otherwise, it isn't said (see reasons).
    if (named && [v, String(r.value)].some(x => Tree.same(named, x))) return Object.assign(c, { names: O, pre: [`the ${lower(o.kind)}`, be(), term(id, named)] });
    // An entry naming what kind of thing its object is says it is one (typeOf): AIV-1 is a limited partnership.
    if (typeOf(r.edge, o?.kind)) return Object.assign(c, { subj: O, pre: [be(), an(v), term(id, lower(v))] });
    // A date named for what was done on it says it was done then: it last filed on …; it filed its annual return on ….
    const done = r.field === 'date' && /^(?:(last|first) )?(?:(.+) )?(\S+ed|paid)(?: on)?$/i.exec(Tree.clean(r.edge));
    if (done) return Object.assign(c, { subj: O, pre: [` ${[would && 'would have', done[1]?.toLowerCase(), done[3].toLowerCase(), done[2] && `its ${lower(done[2])}`, 'on '].filter(Boolean).join(' ')}`, term(id, v)] });
    // One named for the last or first of what's done is past too: the Manager's last annual amendment was on ….
    const once = r.field === 'date' && /^(?:last|first)\s/i.test(Tree.clean(r.edge));
    return Object.assign(c, { subj: O, poss: true, pre: [` ${lower(r.edge)}`, once ? (would ? ' would have been on ' : ' was on ') : plural(r.edge) && !would ? ' are ' : be(), term(id, v)] });
  }
  // A relation's sides past the second as the place rule says them (Notes.placed): each after its label, none
  // twice.
  const further = (recs, id) => N().placed(recs, id).slice(2).flatMap(s => [s.join, { name: s.id }]);
  // Whose a value or a condition is, leading its clause with what it is: its object's (the Manager's Form ADV);
  // at a relation, its sides', as the relation says them (Fund III is taxed for 2026: Fund III's annual tax for
  // 2026), which the sentence says as "the" once it has said the relation (see sentence); else "the".
  function whose(Rv, id, what) {
    const recs = Rv.records, O = Tree.objectOf(recs, id);
    if (isObj(recs[O])) return { subj: O, poss: true, pre: [` ${what}`], obj: [] };
    const rel = recs[O]?.args && factOf(Rv, O);
    return rel?.subj ? { subj: rel.subj, poss: true, pre: [` ${what}`], obj: [...rel.obj, ...further(recs, O)], of: O }
      : { subj: null, poss: false, pre: [`the ${what}`], obj: [] };
  }
  // What the subject is, as the sentence's last clause: a relation, or a tag, as a fact; a value by its name,
  // and whose it is: the Manager's Form ADV is due March 31, 2027; Fund III's annual tax for 2026 is due June 1,
  // 2027. A date before the day shown, overdue, was due: AIV-1's annual tax for 2025 was due June 1, 2026. A date
  // its row moved off a weekend says so (rollOf).
  function givenOf(Rv, id, would, row) {
    const recs = Rv.records, r = would ?? recs[id], d = defOfRecord(Rv, id);
    if (r.args || 'tag' in r) return factOf(Rv, id, [], would);
    const name = d?.name ?? r.edge, due = /^(.*\S)\s+Due$/.exec(name), roll = d && rollOf(Rv, d, row, id);
    const what = lower(due?.[1] ?? name), past = !would && r.field === 'date' && r.value < App.day.peek();
    const is = (would ? ' would be' : plural(what) ? (past ? ' were' : ' are') : past ? ' was' : ' is') + (due || past ? ' due ' : ' ');
    const point = { term: Tree.outputText(r), id, fx: !!Rv.computed[id] || !!would };
    return { id, ids: [id], ...whose(Rv, id, what), post: [is, point, ...(roll ? [` (${roll})`] : []), ...ruleOf(r, d, row)] };
  }
  // The rule behind a date, its row's label: it says why the day is the day, unless the label is only that day of
  // the year (January 31), which the date has said.
  const DAY_OF_YEAR = /^(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}$/i;
  function ruleOf(r, d, row) {
    const label = Tree.clean(d?.rows[row]?.label ?? '');
    if (r.field !== 'date' || !label || DAY_OF_YEAR.test(label)) return [];
    return [`: ${lower(label).replace(/^A (?=[a-z])/, 'a ')}`];
  }
  // A date a row moved off a weekend, in words: January 31, a Sunday, so the Friday before. The row's WORKDAY
  // that gave the date steps one working day from the day beside the one it aims at: WORKDAY(d + 1, -1) is d,
  // or the Friday before where d falls on a weekend; WORKDAY(d - 1, 1), d or the Monday after.
  const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  function rollOf(Rv, d, row, id) {
    const text = d.rows[row]?.formula, ev = text && Formulas.evaluateRow(Rv, d.id, row, id), v = ev?.value;
    if (v?.t !== 'date') return null;
    let toks;
    try { const f = Formulas.splitFormula(text); toks = Formulas.tokenize(f.body, f.offset); } catch { return null; }
    // The one value of the part from token a to token b, where it was worked out once.
    const valueAt = (a, b) => { const p = ev.parts.find(x => x.from === a.pos && x.to === b.end); return p && new Set(p.values.map(x => JSON.stringify(x))).size === 1 ? p.values[0] : undefined; };
    const op = (t, ...v) => t?.k === 'op' && v.includes(t.v);
    for (let i = 0; i < toks.length - 1; i++) {
      if (toks[i].k !== 'name' || !/^WORKDAY$/i.test(toks[i].v) || !op(toks[i + 1], '(')) continue;
      // Its close, and the commas between its arguments.
      let depth = 0, close = -1;
      const commas = [];
      for (let j = i + 1; j < toks.length && close < 0; j++) {
        if (op(toks[j], '(', '{')) depth++;
        else if (op(toks[j], ')', '}')) { if (!--depth) close = j; }
        else if (depth === 1 && op(toks[j], ',')) commas.push(j);
      }
      if (close < 0 || commas.length !== 1 || valueAt(toks[i], toks[close])?.iso !== v.iso) continue;
      const [k] = commas, from = valueAt(toks[i + 2], toks[k - 1]), n = valueAt(toks[k + 1], toks[close - 1]);
      if (from?.t !== 'date' || Math.abs(n) !== 1) return null;
      const day = new Date(from.iso + 'T12:00:00'), to = new Date(v.iso + 'T12:00:00');
      day.setDate(day.getDate() + n);
      if (Tree.isoOf(day) === v.iso) return null;
      const said = Tree.formatDate(Tree.isoOf(day)), year = day.getFullYear() === to.getFullYear();
      return `${year ? said.replace(/,\s*\d{4}$/, '') : said}, a ${WEEKDAYS[day.getDay()]}, so the ${WEEKDAYS[to.getDay()]} ${to < day ? 'before' : 'after'}`;
    }
    return null;
  }
  // A record as its definition's rows give it, where an entry overrides them.
  const asGiven = (r, v) => 'tag' in r ? { ...r, tag: v } : 'choice' in r ? { ...r, choice: v } : { ...r, value: v?.t === 'date' ? v.iso : v };

  // The records read, each said with the entries read at it, as one fact: a relation with its percentage; an
  // item a list found (the record linking it) with what was read of the item. `id` is whose reason it is, not itself
  // a fact; `seen`, what's been said.
  function gather(Rv, id, seen, ps) {
    const recs = Rv.records, groups = new Map(), walk = (p, link) => {
      const r = p.id && recs[p.id];
      if (r && !isObj(r) && !seen.has(p.id)) {
        seen.add(p.id);
        const host = !r.args && recs[r.at]?.args ? r.at : !r.args && link && recs[link].args.some(a => Tree.objectOf(recs, a.at) === r.at) ? link : p.id;
        if (host !== id) {
          if (!groups.has(host)) groups.set(host, { host, reads: [], p });
          if (host === p.id) groups.get(host).p = p; else groups.get(host).reads.push(p.id);
        }
      }
      (p.items ?? []).forEach(q => walk(q, r?.args ? p.id : link));
    };
    ps.forEach(p => walk(p));
    return [...groups.values()];
  }
  // A record's reasons as pieces, { join, c: clause, cite?, self? } or { text }: its facts, the one reason
  // unfolded (if `unfold`) last; where the rows rule it out, ", but" and what failed (see whyNot); then ", so"
  // and what they give with its clause. `row`, one of its grounds other than the one cited, said the same way.
  function reasons(Rv, id, clause, unfold, top, would, row = null) {
    const g = row ?? reasonOf(Rv, id, clause), d = defOfRecord(Rv, id), recs = Rv.records;
    if (!g || !d) return null;
    // What the row reads as @, where that's a value (an entity's Entity Type), is a fact too. A default, a row
    // that reads nothing, gives because the rows before it gave nothing: its facts are what those rows read.
    // What only excludes is no reason (exclusions).
    const text = d.rows[g.row]?.formula ?? '', excluded = exclusions(text), seen = new Set(), loc = recs[id].at, read = i => Formulas.evaluateRow(Rv, d.id, i, id)?.names ?? [];
    const at = loc && !isObj(recs[loc]) && read(g.row).some(n => text.slice(n.from, n.to) === '@' && n.ids.length === 1 && n.ids[0] === loc && !excluded(n)) ? [{ id: loc }] : [];
    const kept = ps => ps.filter(p => !excluded(p)).map(p => p.items ? { ...p, items: kept(p.items) } : p);
    const no = row ? null : notsOf(Rv, id), otherwise = !no && !g.parts.length && g.row > 0;
    const parts = no ? [...at, ...no.held.flatMap(h => h.parts)] : !otherwise ? [...at, ...kept(g.parts)] : d.rows.slice(0, g.row).flatMap((_, i) => read(i)).flatMap(x => x.ids.map(y => ({ id: y })));
    const gather_ = ps => gather(Rv, id, seen, ps);
    // What failed is said in full, so a fact it shares with what held is said there.
    const failed = (no?.failed ?? []).flatMap(f => f.clause ? [{ c: f.clause }] : gather_(f.parts).map((x, i, l) => {
      const c = factOf(Rv, x.host, x.reads);
      return { c: f.not && [x.host, ...x.reads].some(y => f.not.ids.includes(y)) ? { ...c, not: f.not } : c, then: i === l.length - 1 ? f.then : null };
    }));
    // A figure multiplied down a chain of itself says each link, the whole sum after its name; in short, only that.
    const chain = top && !would && !row ? chainOf(Rv, id) : null;
    // In short, for the bar's one row, a ruled-out record is what failed and what follows.
    const facts = (chain ? (unfold ? chain.links : []) : top && !unfold && failed.length ? [] : gather_(parts)).map(x => {
      const cl = clauseOf(Rv, x.host, text, x.p), reason = !!Rv.computed[x.host] && 'tag' in recs[x.host] && !x.reads.length;
      const why = reason && reasonOf(Rv, x.host, cl);
      return { ...x, cl, reason, c: { ...factOf(Rv, x.host, x.reads), clause: cl }, cite: why ? citeOf(defOfRecord(Rv, x.host)?.id, why.label) : null };
    });
    const tags = facts.filter(f => f.reason), deeper = unfold && !otherwise && tags.length === 1 ? reasons(Rv, tags[0].host, tags[0].cl, false, false) : null;
    const said = top ? givenOf(Rv, id, would, g.row) : factOf(Rv, id);
    const given = chain ? { ...said, post: said.post.flatMap(s => s?.id === id ? [`${chain.sum} = `, s] : [s]) } : said;
    // A fact that only names an object (the tax year is 2026) isn't said where another clause names it: no side
    // twice.
    const names = c => c.names ? [] : [c.subj, ...[...c.pre, ...c.obj, ...c.post].map(s => s?.name)];
    const named = new Set([given, ...facts.map(f => f.c), ...failed.map(f => f.c), ...(deeper ?? []).map(p => p.c)].filter(Boolean).flatMap(names).filter(Boolean));
    // The facts about one subject together; past three of a kind, the rest counted: and 38 more owners.
    const leaves = facts.filter(f => !(deeper && f === tags[0]) && !named.has(f.c.names)), subjects = [...new Set(leaves.map(f => f.c.subj))], kinds = new Map();
    leaves.sort((x, y) => subjects.indexOf(x.c.subj) - subjects.indexOf(y.c.subj));
    const kindOf = f => { const r = recs[f.host], [a] = r.args ? N().sides(recs, f.host) : [], t = a && Tree.treeOf(recs, f.host);
      return a ? [`${N().nameOf(recs, f.host)}|${norm(a.edge)}`, lower(t ? N().listName(t, a.edge) : a.edge)] : [norm(r.edge), lower(Tree.plural(r.edge))]; };
    const shown = chain ? leaves : leaves.filter(f => { const [k, noun] = kindOf(f), x = kinds.get(k) ?? { n: 0, noun }; kinds.set(k, x); return x.n++ < 3; });
    const more = [...kinds.values()].filter(x => x.n > 3).map(x => `${x.n - 3} more ${x.noun}`);
    const out = shown.map((f, i) => ({ join: !i ? '' : i < shown.length - 1 || more.length || deeper ? ', ' : ' and ', c: f.c, cite: f.cite }));
    // The number compared with follows the fact that carries a number.
    const t = shown.length && (no ? no.held.find(h => h.then)?.then : thresholdOf(text)), numeric = f => [f.host, ...f.reads].some(x => typeof recs[x].value === 'number');
    if (t && (!no || shown.some(numeric))) out[Math.max(0, shown.findLastIndex(numeric))].then = t;
    if (more.length) out.push({ text: ` and ${more.join(' and ')}` });
    if (deeper) out.push({ ...deeper[0], join: !shown.length ? '' : shown.length > 1 ? ', and ' : ' and ' }, ...deeper.slice(1));
    failed.forEach((f, i) => out.push({ ...f, join: i ? (i < failed.length - 1 ? ', ' : ' and ') : out.length ? ', but ' : '' }));
    out.push({ join: out.length ? ', so ' : '', c: given, cite: citeOf(d.id, g.label), self: top });
    return out;
  }
  // A number that reads itself down a list, as a look-through's does: each way down it, the figures it multiplies, and
  // each link's fact. { sum: "100% × 100% × 66%", ways, links }, where the ways add up to the record's value and at
  // least one goes down a level; else null. Once per working-out.
  const chains = new WeakMap();
  function chainOf(Rv, id) {
    const memo = chains.get(Rv) ?? chains.set(Rv, new Map()).get(Rv);
    if (memo.has(id)) return memo.get(id);
    memo.set(id, null);
    const recs = Rv.records, r = recs[id], d = Rv.computed[id]?.def, number = x => typeof recs[x]?.value === 'number';
    if (!d || typeof r?.value !== 'number') return null;
    let deep = false;
    // The ways of a record, each the figures read along it; the figures of an item with the ways of what it reads of itself.
    const waysOf = (x, seen) => {
      if (seen.has(x)) return null;
      const out = [], parts = groundOf(Rv, x)?.rows[0].parts ?? [], seen2 = new Set(seen).add(x);
      for (const p of parts) {
        const ids = [p.id, ...(p.items ?? []).map(q => q.id)].filter(Boolean), self = ids.filter(y => Rv.computed[y]?.def === d), figures = ids.filter(y => number(y) && !self.includes(y));
        if (self.length > 1 || (p.items?.some(q => q.items?.length))) return null;
        if (!self.length) { if (figures.length) out.push(figures); continue; }
        deep = true;
        const down = waysOf(self[0], seen2);
        if (!down) return null;
        out.push(...down.map(w => [...figures, ...w]));
      }
      return out;
    };
    const ways = waysOf(id, new Set());
    if (!deep || !ways?.length || ways.length > 6) return null;
    const total = ways.reduce((s, w) => s + w.reduce((m, y) => m * recs[y].value, 1), 0);
    if (Math.abs(total - r.value) > 1e-9) return null;
    const hosts = [...new Set(ways.flat())], links = hosts.map(y => ({ host: recs[y].at, reads: [y], p: { id: recs[y].at } }));
    const out = { ways, links, sum: ways.map(w => w.map(y => Tree.format(recs[y].field, recs[y].value)).join(' × ')).join(' + ') };
    memo.set(id, out);
    return out;
  }
  const possessive = (Rv, id) => /s$/.test(N().shortOf(Rv.records, id)) ? '’' : '’s';
  // The pieces as runs, each clause said after the one before: the same subject again is "it" (a person is
  // named again), and after "and" or "but" isn't said, nor is "is" after "and" and a clause that ends at its
  // object; and a relation said again, as whose a value is, is "the" (so the capacity is held). A name that ends
  // in a parenthesis takes no possessive: the voting percentage of Fund III-A Investors (U.S. ERISA Plans) in Fund
  // III-A, an "of" after it "in". What a value isn't follows it: is a member, not a managing member, of GP III.
  // A piece of text that begins afresh names its subject again.
  function sentence(Rv, pieces) {
    const runs = [], said = new Set();
    let prev = null;
    for (const p of pieces ?? []) {
      if (p.text) { runs.push({ text: p.text }); if (p.fresh) prev = null; continue; }
      if (p.join) runs.push({ text: p.join });
      const c = said.has(p.c.of) ? { ...p.c, subj: null, poss: false, pre: [`the${p.c.pre[0]}`, ...p.c.pre.slice(1)], obj: [] } : p.c;
      const again = !!c.subj && c.subj === prev?.subj, and = !!p.join && p.join !== ', so ';
      let subj = !c.subj ? [] : again && !isPerson(Rv, c.subj) ? [c.poss ? 'its' : 'it'] : [{ name: c.subj }, ...(c.poss ? [possessive(Rv, c.subj)] : [])], pre = c.pre, obj = c.obj;
      if (again && and && !c.poss && !prev.poss) {
        subj = [];
        pre = pre[0] === ' is ' && prev.pre[0] === ' is ' && !prev.post.length && p.join !== ', but ' ? pre.slice(1) : [String(pre[0]).trimStart(), ...pre.slice(1)];
      }
      if (subj.length === 2 && /\)$/.test(N().shortOf(Rv.records, c.subj))) {
        [subj, pre] = [[], [`the${pre[0]}`, ' of ', subj[0], ...pre.slice(1)]];
        if (obj[0] === ' of ') obj = [' in ', ...obj.slice(1)];
      }
      const segs = [...subj, ...pre, ...obj, ...c.post].filter(s => s !== ''), k = c.not ? segs.findIndex(s => s.term && c.not.ids.includes(s.id)) : -1;
      if (k >= 0) segs.splice(k + 1, 0, `, not ${c.not.text}${k < segs.length - 1 ? ',' : ''}`);
      runs.push({ fact: c, self: !!p.self || !c.ids?.length, segs });
      if (p.cite) runs.push({ cite: p.cite });
      if (p.then) runs.push({ text: ` (${p.then})` });
      prev = c;
      c.ids?.forEach(x => said.add(x));
    }
    return runs.length ? runs : null;
  }
  // A record's reasons said in full, and a level shallower for the bar's one row (for a record the rows rule
  // out, what failed and what follows): why the rows give it, or where an entry overrides them, what they would
  // give and why; each of its other grounds after "Also", by its clause; and for a check that fails, what clears
  // it. None for a record no row gives.
  function whyOf(Rv, id, clause = null) {
    const rec = Rv.records[id], c = Rv.covered[id], v = c?.value;
    if (!rec || !(Rv.computed[id] || c) || !defOfRecord(Rv, id)) return null;
    if (c && (v === null || v === undefined || Formulas.isError(v))) return null;
    const would = c && !c.agrees ? asGiven(rec, v) : null;
    try {
      const first = reasonOf(Rv, id, clause), others = !would && rec.tag === true ? othersOf(Rv, id, first?.row) : [], d = defOfRecord(Rv, id);
      const named = row => citeOf(d.id, row.label) ?? (row.label ? lower(row.label) : '');
      const also = others.flatMap(row => {
        const facts = reasons(Rv, id, null, false, false, null, row)?.slice(0, -1) ?? [];
        return [{ text: `. ${['Also', named(row)].filter(Boolean).join(' ')}${facts.length ? ': ' : ''}`, fresh: true }, ...facts];
      });
      const cites = [...new Set(others.map(named).filter(Boolean))], rest = others.length ? [{ text: `. ${['Also', cites.join(', ')].filter(Boolean).join(' ')}` }] : [];
      const clears = clearsOf(Rv, id), full = sentence(Rv, [...reasons(Rv, id, clause, true, true, would), ...also, ...clears]);
      if (!full) return null;
      // Where the whole won't fit the bar's one row: its first ground in full, or in short, the others named.
      const short = sentence(Rv, [...reasons(Rv, id, clause, false, true, would), ...rest]), mid = also.length || clears.length ? sentence(Rv, [...reasons(Rv, id, clause, true, true, would), ...rest]) : null;
      return { full, mid, short };
    } catch { return null; }
  }
  // The sentence the bar says for a record, in full, as plain text, for other panes and exports; null for a
  // record no row gives; sentenceIn, in another working-out than the chart's (a change pending's redline).
  const sentenceIn = (Rv, id) => { const w = whyOf(Rv, id); return w ? plain(Rv.records, w.full) : null; };
  const sentenceFor = id => sentenceIn(R.peek(), id);
  // Why a record is there, plain text, every ground, for a table's Why column and what it exports; empty for a record
  // no row gives.
  const because = id => sentenceFor(id) ?? '';

  // What would clear a check that fails, read off its rows. Each thing that failed, said as it would have to be (it is
  // a managing member of GP III; at 100%). And each other way the rows give that asks only for something of the
  // record's own: a row IF(an option of the record, its own list has something): or as Authorized Signatory, evidenced
  // by a document. Nothing where it can't be read off.
  function clearsOf(Rv, id) {
    const recs = Rv.records, no = notsOf(Rv, id), g = reasonOf(Rv, id), d = defOfRecord(Rv, id), t = Tree.treeOf(recs, id);
    if (recs[id]?.tag !== false || !no?.failed.length || !t || !N().check(t)) return [];
    const seen = new Set(), wants = no.failed.flatMap(f => {
      if (f.clause) return f.clause.yes ? [{ c: f.clause.yes }] : [];
      if (f.want) return [{ text: `at ${f.want}` }];
      if (!f.not) return [];
      return gather(Rv, id, seen, f.parts).flatMap(x => [x.host, ...x.reads].some(y => f.not.ids.includes(y)) ? [{ c: yesOf(factOf(Rv, x.host, x.reads), f.not) }] : []);
    });
    const ways = d.rows.flatMap((row, i) => {
      const sk = i === g.row ? null : skeleton(row.formula), [guard, test] = sk?.k === 'IF' && sk.kids.length === 2 ? sk.kids : [];
      const option = guard?.k === 'CMP' && guard.op === '=' && /^"(.*)"$/.exec(guard.kids[1]?.text ?? '')?.[1];
      const list = option && test?.k === 'CMP' && /^(?:COUNT\(\s*)(?:\[([^\]]+)\]|([A-Za-z_]\w*))\s*\)$/.exec(test.kids[0]?.text ?? '');
      if (!list || !['>', '>='].includes(test.op) || !/^[01]$/.test(test.kids[1]?.text ?? '')) return [];
      const name = list[1] ?? list[2], kind = kindOfList(name);
      return [`as ${option}, ${lower(name)} ${kind ? `${article(kind)} ${lower(kind)}` : 'something'}`];
    });
    if (!wants.length) return [];
    const said = wants.flatMap((w, i) => [...(i ? [{ text: ' and ' }] : []), w.c ? { c: w.c, self: true } : { text: w.text }]);
    return [{ text: '. Clears ', fresh: true }, ...(wants[0].c ? [{ text: 'if ' }] : []), ...said, ...ways.map(w => ({ text: `, or ${w}` }))];
  }
  // A fact as what it isn't would have it: David R. Okafor is a managing member of GP III.
  function yesOf(c, not) {
    const say = xs => xs.flatMap((s, k) => s?.term && not.ids.includes(s.id) ? [not.text] : /^an? $/.test(s) && xs[k + 1]?.term && not.ids.includes(xs[k + 1].id) ? [] : [s]);
    return { ...c, ids: [], pre: say(c.pre), obj: say(c.obj), post: say(c.post), not: null };
  }
  // The kind a list of relatives holds, where one relation names it: Evidenced By, a Document.
  function kindOfList(name) {
    for (const s of Object.values(App.schema.peek())) if (s.args?.length > 1) {
      const a = s.args.find(x => Tree.same(N().listName(Tree.bare(s), x.edge), name));
      if (a?.loc?.kind) return a.loc.kind;
    }
    return null;
  }
  // The subject's, but while its definition's rows are being edited. Two objects in a relation picked that doesn't
  // hold say why not; in one entered, the fact.
  const why = computed(() => {
    const m = model.value, dr = draft.value, o = m?.option;
    if (m?.absent) { const full = dr?.def === m.def?.id ? null : notRuns(R.value, o); return full && { full, short: full }; }
    if (o?.entered) { const full = enteredRuns(R.value, o.id); return full && { full, short: full }; }
    // What a rule can't say says why: what's blank, whose (dendra.md, Definitions: Can't say).
    if (m?.err && m.err.error.blanks?.length && m.def?.type === 'tag' && dr?.def !== m.def.id) { const full = [{ text: `${blankSaid(m.err, R.value)}, so ${m.def.name} can’t say` }]; return { full, short: full }; }
    return !m?.rec || m.err || !m.def || dr?.def === m.def.id ? null : whyOf(R.value, m.id, m.clause);
  });
  // What's wanted, in words: whose it is, and which, by its name, as it would read filled in. "Priya N. Raman’s D&O Questionnaire Date is blank".
  function blankSaid(e, Rv = R.peek()) {
    const recs = Rv.records, n = N(), xs = e.error?.blanks ?? [];
    if (!xs.length) return String(e.error?.msg ?? '').replace(/\.$/, '');
    const said = xs.map(b => { const o = Tree.objectOf(recs, b.at), s = o ? n.shortOf(recs, o) : ''; return s ? `${s}${/s$/.test(s) ? '’' : '’s'} ${b.name}` : b.name; });
    return `${sayList(said)} ${said.length > 1 ? 'are' : 'is'} blank`;
  }
  // A fact clicked: a computed one steps down into its reasons, by the clause that cited it; an entered one is
  // selected. A step down selects what it steps to, so the panel follows the band, the rows staying open.
  let stepping = false, holding = false;
  function stepTo(c) {
    touch.value = null;
    if (R.peek().computed[c.id]) goTo(c.id, c.clause ?? finder.peek().via.get(c.id) ?? null);
    else Shell.select([c.id]);
  }
  // To a record, by its clause, with what was selected for it there (two objects are asked of again as two).
  function goTo(id, clause, keys = [id], down = true) {
    stepping = down; holding = true;
    try { batch(() => { Shell.select(keys); asked.value = keys.length > 1 ? null : { id, clause, under: Shell.selection.peek() }; }); } finally { stepping = holding = false; }
  }

  // ---- Values, as a hovered part shows them ----
  function show(v, pct) {
    const Rv = R.peek();
    if (v === null || v === undefined) return '—';
    if (Array.isArray(v)) return !v.length ? '—' : v.slice(0, 5).map(x => show(x, pct)).join(', ') + (v.length > 5 ? `, +${v.length - 5}` : '');
    if (v?.t === 'err') return v.code;
    if (v?.t === 'date') return Tree.formatDate(v.iso);
    if (v?.t === 'rec') { const r = v.id && Rv.records[v.id]; return !r ? '—' : isObj(r) ? nameOf(Rv, v.id) : Tree.outputText(r); }
    if (v === true || v === false) return v ? 'TRUE' : 'FALSE';
    if (typeof v === 'number') return Tree.format(pct ? 'percent' : 'number', v);
    return String(v);
  }
  // A part's values: one, or one for each item where it sits inside FILTER, ANY or EACH.
  function partText(row, p) {
    const recs = R.peek().records, text = row.formula.slice(p.from, p.to), whole = p.from <= Formulas.splitFormula(row.formula).offset;
    const pct = /%/.test(text) || (whole && model.peek()?.def?.datatype === 'percent')
      || row.ev.names.some(n => n.from >= p.from && n.to <= p.to && n.ids.some(id => recs[id]?.field === 'percent'));
    const seen = [...new Set(p.values.map(v => show(v, pct)))];
    return seen.slice(0, 4).join(' · ') + (seen.length > 4 ? ' · …' : '');
  }

  // ---- The redline: a pending change, worked out on a copy and compared ----
  // A change is { records?: { [id]: record | null }, rows?: { [definition id]: rows | null } }: a record under
  // a new id is added, under its own id replaces that one, and null removes it with its dependents; rows,
  // [{ label, formula }], replace a definition's, and null deletes the definition.
  const pending = signal(null);   // { change, from, R2, diff, deltas }
  let timer = 0, slow = 0;
  function preview(change, from = 'outside') {
    clearTimeout(timer);
    if (!change) { pending.value = null; return; }
    // (A draft's says too what's wrong with it, and then the redline shows nothing: what a broken rule would give is no answer; and that
    // it would apply to no one, as a warning apart. A word still being typed isn't wrong yet.)
    const run = () => { const t = performance.now(), h = hypothetical(change), d = from === 'bar' ? draft.peek() : null; pending.value = { change, from, ...h, flaws: d ? flawsIn(h.R2, d, caret()) : [], nobody: d ? nobodyIn(h.R2, d) : null, ...spoilt(R.peek(), h.R2) }; slow = performance.now() - t; };
    // A big chart waits for a pause in typing: a change that replaces the one shown from the same place. A
    // hover, or the first key, shows at once.
    if (slow < 40 || pending.peek()?.from !== from) run(); else timer = setTimeout(run, 300);
  }

  // The state as the change would leave it, and what would appear, go and change, per definition: the chart as of
  // the day shown, as Log.asOf reads it, so a start entry typed past the day (a Formation Date) takes what it's at out
  // of it, with all that's at that, as an end entry on it or before does.
  function hypothetical(change) {
    let entered = App.entered.peek(), ds = App.definitions.peek();
    if (change.records) {
      entered = { ...entered };
      const N = App.notes.peek(), day = App.day.peek(), gone = Object.keys(change.records).filter(id => change.records[id] === null && entered[id]);
      for (const [id, r] of Object.entries(change.records)) if (r) entered[id] = r;
      for (const id of Object.keys(change.records)) { const x = change.records[id] && Log.outOn(N, entered, id, day); if (x) gone.push(x); }
      if (gone.length) for (const id of Tree.dependents(entered, gone)) delete entered[id];
    }
    if (change.rows) ds = ds.flatMap(d => !(d.id in change.rows) ? [d] : change.rows[d.id] ? [{ ...d, rows: change.rows[d.id] }] : []);
    if (change.fresh) ds = [...ds, { ...change.fresh, rows: change.rows[NEW] }];
    const before = R.peek();
    const R2 = Formulas.computeState(entered, ds, App.namesOn(App.day.peek())), diff = Formulas.diff(before, R2);
    return { R2, diff, deltas: deltasOf(diff, before, R2) };
  }
  // Per definition, the records it would attest or give more, fewer, and with another value, and which. A record at one
  // that comes or goes comes or goes with it, and isn't counted again: a tax paid is one Annual Tax fewer, not
  // its due date and amount too.
  function deltasOf(d, A, B, NA = N(), NB = NA) {
    const by = new Map(), def = (X, id) => defOfRecord(X, id), name = (X, id) => def(X, id)?.name;
    // Which, in words: a relation by its place, a value or a yes-or-no by whose it is.
    const who = (X, n, id) => { const r = X.records[id]; return r.args ? n.segmentOf(X.records, id) : n.whereOf(X.records, r); };
    const bump = (X, n, id, k) => { const q = name(X, id); if (!q) return; if (!by.has(q)) { const { id: did, type, edges } = def(X, id); by.set(q, { name: q, def: { id: did, name: q, type, edges }, plus: 0, minus: 0, changed: 0, of: { plus: [], minus: [], changed: [] } }); } const e = by.get(q); e[k]++; e.of[k].push({ id, kind: X.records[Tree.objectOf(X.records, id)]?.kind, get say() { return who(X, n, id); } }); };
    const counts = r => !('tag' in r) || r.tag === true;
    // Counted at what it's at only where that's counted itself: what a definition gives at an entity that goes is.
    const tops = (ids, X) => { const all = new Set(ids), counted = id => all.has(id) && !!name(X, id); return ids.filter(id => !counted(X.records[id]?.at) && !(X.records[id]?.args ?? []).some(a => counted(a.at))); };
    for (const id of tops(d.appear, B)) if (counts(B.records[id])) bump(B, NB, id, 'plus');
    for (const id of tops(d.go, A)) if (counts(A.records[id])) bump(A, NA, id, 'minus');
    for (const id of d.change) { const a = A.records[id], b = B.records[id]; bump(name(B, id) ? B : A, name(B, id) ? NB : NA, id, 'tag' in a ? (b.tag ? 'plus' : 'minus') : 'changed'); }
    // The net: of one definition, a holder that gains as many as it loses has lost nothing, so neither is counted.
    const first = (X, n, id) => { const r = X.records[id], t = r?.args?.length === 2 && Tree.treeOf(X.records, id), e = t && n.edges(t)[0]; return e ? r.args.find(a => Tree.same(a.edge, e))?.at : null; };
    const held = new Map(), tally = (X, n, ids, k) => { for (const id of tops(ids, X)) { const h = first(X, n, id), q0 = name(X, id), q = h && q0 && `${q0}|${h}`; if (q && counts(X.records[id])) { const e = held.get(q) ?? held.set(q, { n: q0, h, X, plus: [], minus: [] }).get(q); e[k].push(id); } } };
    tally(B, NB, d.appear, 'plus'); tally(A, NA, d.go, 'minus');
    for (const { n, plus, minus } of held.values()) { const both = Math.min(plus.length, minus.length); if (both) { const e = by.get(n); e.plus -= both; e.minus -= both; const at = (ids, k) => { const out = new Set(ids.slice(0, both)); e.of[k] = e.of[k].filter(x => !out.has(x.id)); }; at(plus, 'plus'); at(minus, 'minus'); } }
    // A value that goes and comes at one place, as one typed over a rule does, has changed.
    for (const e of by.values()) if (e.plus && e.minus && (e.def.edges?.length ?? 0) < 2) for (const p of [...e.of.plus]) {
      const m = e.of.minus.find(x => x.say === p.say);
      if (m) { e.of.plus.splice(e.of.plus.indexOf(p), 1); e.of.minus.splice(e.of.minus.indexOf(m), 1); e.of.changed.push(p); e.plus--; e.minus--; e.changed++; }
    }
    const out = [...by.values()].filter(x => x.plus + x.minus + x.changed).sort((x, y) => (y.plus + y.minus + y.changed) - (x.plus + x.minus + x.changed));
    // What errs where it didn't comes first, as what a wrong kind of value gives is no conclusion, and it would otherwise read as none changing.
    const ek = e => `${e.def}|${e.id}`, inA = new Set(A.errors.map(ek)), inB = new Set(B.errors.map(ek)), wanting = e => e.error.code === '#N/A', plus = B.errors.filter(e => !inA.has(ek(e)) && !wanting(e)), minus = A.errors.filter(e => !inB.has(ek(e)) && !wanting(e));
    const whereErr = errorAt;
    const said = (X, n, e) => ({ id: ek(e), get say() { return `${whereErr(X, n, e)}: ${e.error.msg ?? e.error.code}`; } });
    // And what fails a check where it didn't, or no longer does, as the status bar counts it: a no that comes or goes is otherwise no conclusion.
    // (A check still being written has no rule in the notes yet, and what it gives is what it's asked to check.)
    const asks = (X, n, id) => { const t = Tree.treeOf(X.records, id); return !!t && (n.check(t) || (!!X.computed[id] && n.value('Check', t) === true)); };
    const failing = (X, n) => Object.keys(X.records).filter(id => X.records[id].tag === false && asks(X, n, id));
    const failsA = failing(A, NA), failsB = failing(B, NB), person = (X, n, id) => ({ id, get who() { return who(X, n, id); }, get say() { return `${who(X, n, id)}: ${name(X, id) ?? Tree.treeOf(X.records, id).args?.[0]?.edge ?? 'a check'}`; } });
    const failedA = new Set(failsA), failedB = new Set(failsB);
    // Who a check would start or stop failing, said as that, by name, once: what a no that comes or goes is. What it stops failing because it no longer tests it is another thing, and is said so:
    // a rule made to apply to no one isn't good news. And who it would newly pass, of a check that didn't say.
    const checked = id => !!id && !('field' in (B.records[id] ?? A.records[id] ?? {})) && [B, A].some(X => X.records[id] && X.computed[id] && asks(X, X === B ? NB : NA, id));
    const fails = failsB.filter(id => !failedA.has(id)).map(id => person(B, NB, id)), clears = failsA.filter(id => !failedB.has(id)), stops = clears.filter(id => B.records[id]).map(id => person(A, NA, id)), untested = clears.filter(id => !B.records[id]).map(id => person(A, NA, id));
    const passes = Object.keys(B.records).filter(id => B.records[id].tag === true && !A.records[id] && B.computed[id] && asks(B, NB, id)).map(id => person(B, NB, id));
    // And who it can't say of where it could, or could say of: not knowing, by name, apart from what fails.
    const cant = B.errors.filter(e => wanting(e) && !inA.has(ek(e))).map(e => ({ id: ek(e), get who() { return whereErr(B, NB, e); }, get say() { return `${whereErr(B, NB, e)}: ${e.error.msg ?? e.error.code}`; } }));
    // (Those go here, not as what a check gives: a check's yes-or-no comes and goes as this does, and is said once.)
    for (const x of out) if (x.def?.id && x.def.type === 'tag' && !x.def.edges?.length) { const ofCheck = o => checked(o.id); for (const k of ['plus', 'minus']) { const left = x.of[k].filter(o => !ofCheck(o)); x[k] -= x.of[k].length - left.length; x.of[k] = left; } }
    const kept = out.filter(x => x.plus + x.minus + x.changed);
    const errs = { plus: plus.map(e => said(B, NB, e)), minus: minus.map(e => said(A, NA, e)) };
    if (errs.plus.length || errs.minus.length) kept.unshift({ name: 'error', def: { id: null, name: 'error', type: 'error', edges: [] }, plus: errs.plus.length, minus: errs.minus.length, changed: 0, of: { ...errs, changed: [] } });
    if (fails.length || stops.length || untested.length || passes.length || cant.length) kept.unshift({ name: 'fail', def: { id: null, name: 'fail', type: 'fail', edges: [] }, plus: fails.length, minus: stops.length, changed: 0, untested: untested.length, passes: passes.length, of: { plus: fails, minus: stops, changed: [], cant, untested, passes } });
    return kept;
  }
  // Who a check moves, in words: "Helen V. Ortiz would start failing", "3 would stop failing"; "Can't say of Priya N. Raman". `done`, once it's made.
  const MOVES = [['plus', 'would start failing', 'starts failing', 'start failing', 'take'], ['minus', 'would stop failing', 'stops failing', 'stop failing', 'add'], ['cant', '', '', '', 'change', 'Can’t say of '], ['untested', 'would no longer be tested', 'is no longer tested', 'are no longer tested', 'change'], ['passes', 'would pass', 'passes', 'pass', 'add']];
  const moves = (d, done = false) => MOVES.filter(([k]) => d.of[k]?.length).map(([k, would, did, plural_, cls, pre = '']) => { const of = d.of[k], n = of.length, words = done ? (n === 1 ? did : plural_) : would, who = n === 1 ? of[0].who : String(n); return { k, cls, of, pre, who, words, said: `${pre}${who}${words ? ` ${words}` : ''}` }; });
  // A rule that says nothing of anyone, though it could say both yes and no, applies to no one, which isn't everyone being fine (dendra.md, Definitions: Not tested). → what to say, or null.
  function nobody(Rv, def) {
    if (Rv.rows?.[def]?.length) return null;
    const c = Formulas.coverage(Rv, def);
    if (!c || c.silent !== 'untested' || c.says || !c.quiet?.length) return null;
    const recs = Rv.records, kinds = new Set(c.quiet.map(x => recs[Tree.objectOf(recs, x)]?.kind)), k = kinds.size === 1 ? [...kinds][0] : null, n = c.quiet.length;
    return `It applies to no one: n/a at ${n === 1 ? 'the one' : `all ${n}`} ${k ? (n === 1 ? lower(k) : Tree.plural(lower(k))) : n === 1 ? 'record' : 'records'}.`;
  }
  // The same of a draft: where it applies to some now, or it's new.
  function nobodyIn(R2, d) {
    const now = nobody(R2, d.fresh?.id ?? d.def);
    if (!now) return null;
    if (d.fresh) return now;
    const was = Formulas.coverage(R.peek(), d.def);
    if (!was?.says) return null;
    const recs = R.peek().records, whose = [...was.holds, ...was.fails, ...was.cant, ...was.typed, ...was.broken].map(x => { const r = recs[x] ?? R.peek().errors.find(e => e.id === x); const o = Tree.objectOf(recs, r?.at ?? r?.args?.[0]?.at ?? x); return o ? N().shortOf(recs, o) : null; }).filter(Boolean);
    const named = whose.length > 3 ? `${whose.slice(0, 3).join(', ')} and ${whose.length - 3} more` : sayList(whose);
    return `${now} It applies now to ${named}.`;
  }
  // What any change would leave of the rules, whatever it's a change of (a record renamed, say): those it would break, and those it would leave applying to no one, that apply to some now.
  function spoilt(A, B) {
    const was = new Set(Formulas.broken(A).roots.map(r => r.def)), breaks = Formulas.broken(B).roots.filter(r => !was.has(r.def));
    const emptied = N().notes('Check').flatMap(n => { const d = App.definitions.peek().find(x => x.name === n.pattern.args?.[0]?.edge && !x.edges); return d ? [d] : []; }).filter(d => !was.has(d.id) && !breaks.some(r => r.def === d.id) && A.rows?.[d.id]?.length && nobody(B, d.id));
    return { breaks, emptied };
  }
  // A definition's flaws as a draft would leave it (Formulas: A rule in error), and any other rule's it would newly flaw, each with
  // the row it's in by its key, where it's the draft's own: what the Done says. `d`, the draft.
  function flawsIn(R2, d, typing = null) {
    const was = R.peek().flaws ?? {}, seen = new Set(), rows = d.rows.filter(r => !r.gone), out = [];
    const put = f => { if (!seen.has(f.message)) { seen.add(f.message); out.push(f); } };
    // (A name the cursor's still at the end of isn't wrong yet; Done says it, whatever's typed.)
    const own = (R2.flaws ?? {})[d.def] ?? [], early = new Set(typing ? own.filter(f => f.code === '#NAME?' && rows[f.row]?.key === typing.key && f.to === typing.at).map(f => f.message) : []);
    for (const [def, fs] of Object.entries(R2.flaws ?? {})) for (const f of fs) if (def === d.def || (!f.warn && !was[def]?.some(x => x.message === f.message))) put({ ...f, def, key: def === d.def ? rows[f.row]?.key ?? null : null });
    for (const b of Formulas.broken(R2).roots) if (b.def === d.def) b.problems.forEach(message => put({ message, def: b.def, code: b.code, key: null }));
    // What it can't work out where it could, as a list where it wants one value: no conclusion, however few the places, and whatever was there before: an edit that leaves
    // errors is flawed. Not what it can't say for want of a value (a blank's to fill in), nor what its flaws already say.
    const mine = d.fresh?.id ?? d.def, said = new Set(own.map(f => f.message)), errs = (R2.errors ?? []).filter(e => e.def === mine && !['#N/A', '#NAME?', '#CIRCULAR!', '#OPTION?'].includes(e.error.code) && !said.has(e.error.msg));
    if (errs.length && !own.some(f => !f.warn)) {
      const at = errs.slice(0, 3).map(e => errorAt(R2, N(), e)).filter(Boolean);
      put({ message: `It can’t be worked out at ${sayList(errs.length > 3 ? [...at, `${errs.length - 3} more`] : at) || `${errs.length} ${errs.length === 1 ? 'place' : 'places'}`}: ${errs[0].error.msg ?? errs[0].error.code}`, def: d.def, key: null });
    }
    return early.size ? out.filter(f => !early.has(f.message)) : out;
  }
  // Whose an error is, in the place rule's words: at a record, by where it is; at what a relation would be, by its sides.
  const errorAt = (X, n, e) => e.at ? (X.records[e.at] ? (X.records[e.at].kind !== undefined ? n.shortOf(X.records, e.at) : n.whereOf(X.records, e)) : '') : (e.args ?? []).filter(a => X.records[a.at]).map(a => n.shortOf(X.records, Tree.objectOf(X.records, a.at))).join(' → ');
  // Where the cursor is in the row being typed, for what's not wrong yet.
  const caret = () => { const ed = editing.peek(), cm = ed?.cm; return cm?.hasFocus?.() && cm.somethingSelected?.() === false ? { key: ed.key, at: cm.indexFromPos(cm.getCursor()) } : null; };
  // In the bar's words, what a change does to what's worked out (Delta), and for each what it counts: a relation or a noun
  // by how many ("5 controls"); a yes-or-no named as a condition, where it holds ("Has Side Letter at 1 entity").
  const noun = d => d?.edges?.length > 1 || d?.type !== 'tag' || /^an?\s/i.test(String((d.id && noteOf(d.id) && N().description(noteOf(d.id).pattern)) ?? ''));
  const countedOf = (n, d, of = []) => {
    if (noun(d)) return `${n} ${n === 1 ? lower(d.name) : Tree.plural(lower(d.name))}`;
    const kinds = new Set(of.map(x => x.kind)), k = kinds.size === 1 ? [...kinds][0] : null;
    return `${d.name} at ${n} ${k ? (n === 1 ? lower(k) : Tree.plural(lower(k))) : n === 1 ? 'record' : 'records'}`;
  };
  const sayList = xs => xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}` : xs[0] ?? '';
  const WORDS = [['plus', 'Adds', 'add'], ['minus', 'Takes away', 'take'], ['changed', 'Changes', 'change']];
  // Those words of a change's deltas: "Adds 5 controls; takes away 2 affiliated persons", or that no conclusion changes; lower-case to follow a colon.
  const deltaWords = (ds, done = false) => {
    const rest = ds.filter(x => x.name !== 'fail'), first = ds.filter(x => x.name === 'fail').flatMap(x => moves(x, done).map(m => m.said));
    const said = WORDS.map(([k, verb], i) => { const of = rest.filter(x => x[k]); return of.length ? [verb, sayList(of.map(x => countedOf(x[k], x.def, x.of[k])))] : null; }).filter(Boolean);
    const words = said.map(([verb, xs], i) => `${i || first.length ? verb[0].toLowerCase() + verb.slice(1) : verb} ${xs}`);
    return first.length || said.length ? [...first, ...words].join('; ') : 'No conclusions change';
  };
  // What a change did to what's concluded, in the same words, and which by name, between two workings-out (History's replays): for its
  // effect. One that broke a rule says that, for what a broken rule gives is no conclusion; one that mended it, that it works, only where it now gives answers everywhere it should;
  // and one that left it applying to no one, that.
  function saying(A, B, NA, NB) {
    const was = Formulas.broken(A).roots, now = Formulas.broken(B).roots, broke = now.filter(r => !was.some(x => x.def === r.def)), mended = was.filter(r => !now.some(x => x.def === r.def));
    if (broke.length) return { said: `It doesn’t work: ${broke[0].problems[0]}`, which: [] };
    const none = (B.definitions ?? App.definitions.peek()).filter(d => d.type === 'tag' && !d.edges && nobody(B, d.id) && Formulas.coverage(A, d.id)?.says);
    if (none.length) return { said: `${none[0].name} applies to no one`, which: [] };
    const stuck = mended.find(r => B.errors.some(e => e.def === r.def && e.error.code !== '#N/A'));
    if (stuck) { const e = B.errors.find(x => x.def === stuck.def && x.error.code !== '#N/A'); return { said: `${stuck.name} can’t be worked out: ${e.error.msg ?? e.error.code}`, which: [] }; }
    if (mended.length && !nobody(B, mended[0].def)) return { said: `${mended[0].name} works again`, which: [] };
    if (mended.length) return { said: `${mended[0].name} applies to no one`, which: [] };
    // (Errors, its status line says, and what they were it opens to: so here only what else it concluded, or nothing, where errors are all it moved.)
    const all = deltasOf(Formulas.diff(A, B), A, B, NA, NB), ds = all.filter(x => x.name !== 'error' && x.name !== 'fail');
    return { said: ds.length || !all.length ? deltaWords(ds, true) : '', which: ds.flatMap(x => WORDS.filter(([k]) => x[k]).map(([k, verb]) => ({ said: `${verb} ${countedOf(x[k], x.def, x.of[k])}`, names: x.of[k].map(o => o.say) }))) };
  }
  // What a change pending leaves as it was, said in black where it takes something away: of the first definition of a
  // relation it takes from that reads as a holding (Control, not an Affiliated Person, a role), who holds what it's about
  // at the top, and still does: "Margaret A. Chen's control is unchanged".
  function steady(p) {
    const ap = p?.from === 'pending' ? App.pending.peek() : null, rid = ap?.transfer?.rid ?? (ap?.verb === 'Delete' && ap.needs?.length === 1 ? ap.needs[0] : null), A = R.peek(), B = p?.R2, rel = rid && A.records[rid];
    if (rel?.args?.length !== 2) return null;
    const n = N(), t = Tree.treeOf(A.records, rid), e0 = n.edges(t)[0], at = rel.args.find(a => !Tree.same(a.edge, e0))?.at, about = at && Tree.objectOf(A.records, at);
    for (const d of p.deltas) {
      const def = [...defs.peek().values()].find(x => x.name === d.name);
      if (!def || def.edges?.length !== 2 || !d.minus) continue;
      const mine = Object.keys(A.computed).filter(id => A.computed[id].def === def.id && A.records[id]?.args?.length === 2), held = id => { const s = n.edges(Tree.treeOf(A.records, id))[0], r = A.records[id]; return [r.args.find(a => Tree.same(a.edge, s))?.at, r.args.find(a => !Tree.same(a.edge, s))?.at]; };
      if (!mine.length || Tree.same(singular(n.listName(Tree.treeOf(A.records, mine[0]), n.edges(Tree.treeOf(A.records, mine[0]))[0])), def.name)) continue;
      const pairs = mine.map(id => [id, ...held(id)]), under = new Set(pairs.map(x => x[2])), who = pairs.filter(([id, h, o]) => o === about && !under.has(h) && B.records[id]).map(x => x[1]);
      // (Of everyone it's true of, so none reads as having changed for not being named.)
      if (who.length) { const names = who.map(h => { const s = n.shortOf(A.records, Tree.objectOf(A.records, h)); return `${s}${s.endsWith('s') ? '’' : '’s'}`; }); return `${who.length > 3 ? `${names.slice(0, 2).join(', ')} and ${who.length - 2} others’` : sayList(names)} ${lower(def.name)} is unchanged`; }
    }
    return null;
  }
  effect(() => {
    const p = pending.value, canvas = Shell.parts.peek().canvas;
    if (!p || p.unread || p.flaws?.some(f => !f.warn)) return canvas?.redline(null);
    const text = (X, id) => { const r = X.records[id]; return !r || isObj(r) ? '' : Tree.outputText(r); };
    const changed = Object.fromEntries(p.diff.change.map(id => [id, { before: text(R.peek(), id), after: text(p.R2, id) }]));
    canvas?.redline({ appear: p.diff.appear, go: p.diff.go, changed, records: p.R2.records });
  });
  // The subject as the pending change would leave it: undefined if unchanged, null if gone, or its record.
  function after(m) {
    const p = pending.value;
    if (!p || !m?.rec) return undefined;
    if (p.diff.change.includes(m.id)) return p.R2.records[m.id];
    const id = p.diff.appear.find(x => sameSpot(p.R2.records[x], m.rec));
    if (id) return p.R2.records[id];
    return p.diff.go.includes(m.id) ? null : undefined;
  }

  // A change made: records entered, set or removed, and definitions' rows; a rule written for the first time, its note made
  // where its draft says. `note`, why; `also(tx)`, what else the one change does.
  function commit(change, say, { note, also, pattern } = {}) {
    const entered = App.entered.peek();
    return App.change(tx => {
      for (const [id, r] of Object.entries(change.records ?? {})) {
        // (What's typed under a first formula, cleared to leave it to the rule, goes as never typed, whatever day is shown.)
        if (r === null) { tx.remove(id, change.fresh ? null : undefined); continue; }
        const { computed: _, ...rec } = r;
        if (entered[id]) tx.set(id, rec); else tx.add('record', rec);
      }
      for (const [def, rows] of Object.entries(change.rows ?? {})) {
        const n = def === NEW ? { pattern } : noteOf(def);
        if (rows === null) tx.remove(def);
        else tx.note('Formula', n.pattern, rows.map(r => ({ label: r.label.trim(), formula: Formulas.tidyArrow(r.formula).trim() })));
      }
      also?.(tx);
    }, { say, note });
  }

  // ---- Editing a definition: a draft of its rows, redlined as it changes ----
  const draftOf = def => { const d = draft.peek(); return d?.def === def ? d : { def, rows: kept(def) }; };
  // What's typed under a pattern a first formula is being written for, each by whether it's to go (`keep`, those it isn't).
  const typedUnder = d => { const st = App.entered.peek(); return Object.keys(st).filter(x => !isObj(st[x]) && (d.fresh.edges || st[x].at) && Tree.fits(st, x, d.pattern)); };
  const rowsChange = d => {
    const rows = { [d.def]: d.rows.filter(r => !r.gone).map(({ label, formula }) => ({ label, formula })) };
    return d.fresh ? { rows, fresh: d.fresh, records: Object.fromEntries(typedUnder(d).filter(x => !d.keep?.has(x)).map(x => [x, null])) } : { rows };
  };
  const blank = r => r.gone || /^\s*(=|←|<-)?\s*$/.test(r.formula);
  const unchanged = d => d.fresh ? d.rows.every(blank) : JSON.stringify(rowsChange(d).rows[d.def]) === JSON.stringify(kept(d.def).map(({ label, formula }) => ({ label, formula })));
  // A row that doesn't read yet, and its first problem.
  const unread = d => { for (const r of d.rows) { const p = !r.gone && Formulas.check(r.formula).problems[0]; if (p) return { key: r.key, ...p }; } return null; };
  const problem = signal(null);   // { key, message }: why a row can't be committed, said once Enter asks
  function change(def, fn) {
    claimed = true;
    open.value = true;
    problem.value = null;
    armed.value = false;
    const was = draftOf(def);
    draft.value = { ...was, rows: fn(was.rows.map(r => ({ ...r }))) };
    previewDraft();
  }
  function previewDraft(d = draft.peek()) {
    if (!d || unchanged(d)) return preview(null);
    if (!unread(d)) return preview(rowsChange(d), 'bar');
    // While a row doesn't read it's still being typed: nothing's said of it, right or wrong, till it reads or Done asks.
    const p = pending.peek();
    if (p?.from === 'bar') pending.value = { ...p, flaws: [], nobody: null, unread: true };
  }
  // A first formula for what has none: nothing's written till it's Done, as one change, and a rule's rows open on its one row to
  // type in, the `=` it starts with already there. `pattern`, what it covers.
  function define(pattern) {
    const n = N(), specs = n.fitting(App.schema.peek(), pattern), t = specs[0], rel = pattern.args?.length > 1;
    if (!t || App.readOnly.peek()) return;
    const type = 'field' in t.out ? 'field' : 'choice' in t.out ? 'choice' : 'tag', st = R.peek().records, key = newKey();
    // A record of what it's at: where what's typed is looked up, as it's looked up at one of the records a rule gives.
    const at = rel ? null : Object.keys(st).find(x => !('field' in st[x]) && Tree.fits(st, x, t.args[0].loc)) ?? null;
    const fresh = { id: NEW, name: rel ? n.name(pattern) : pattern.args[0].edge, covers: [...new Set(specs.map(Tree.paramKey))], rows: [], type, at, isRelation: rel, ...(type === 'field' && { datatype: t.out.field }), ...(type === 'choice' && { options: [...new Set(specs.map(s => s.out.choice))] }), ...(rel && { edges: n.edges(pattern) }) };
    batch(() => { whyNote.value = ''; draft.value = { def: NEW, fresh, pattern, keep: new Set(), rows: [{ key, label: '', formula: '= ' }] }; writing.value = NEW; open.value = true; wanted.value = true; aim.value = key; });
  }
  // Enter, or Done: the draft made, as one change, saying what it changed. A row that doesn't read says why, the cursor where it
  // goes wrong; a rule that reads but doesn't work (flawsIn) says so, and is made only by Save anyway, apart from Done.
  function commitDraft({ anyway = false } = {}) {
    const d = draft.peek(), bad = d && unread(d);
    if (bad) {
      problem.value = { key: bad.key, message: bad.message };
      const cm = document.querySelector(`.fxbar .fx-row[data-key="${bad.key}"] .CodeMirror`)?.CodeMirror;
      if (cm) { cm.focus(); cm.setCursor(cm.posFromIndex(bad.from)); }
      return;
    }
    const h = d && !unchanged(d) ? hypothetical(rowsChange(d)) : null, flaws = h ? flawsIn(h.R2, d) : [], none = h ? nobodyIn(h.R2, d) : null, stops = flaws.some(f => !f.warn) || !!none;
    if (stops && !anyway) {
      // (Said under the rows, Flaws, as it's typed; the keys go to the first of it, in its row where it has one, or else to what's said. What's only said, a role two relations share, stops nothing.)
      pending.value = { ...(pending.peek()?.from === 'bar' ? pending.peek() : { change: rowsChange(d), from: 'bar', ...h }), flaws, nobody: none, unread: false };
      requestAnimationFrame(() => {
        const first = flaws.find(f => !f.warn), cm = first?.key && document.querySelector(`.fxbar .fx-row[data-key="${first.key}"] .CodeMirror`)?.CodeMirror;
        if (cm) { cm.focus(); cm.setCursor(cm.posFromIndex(first.from ?? 0)); } else document.querySelector('.fxbar .fx-flaws')?.focus();
      });
      return;
    }
    // What's saved that doesn't work, or that applies to no one, is saved for a reason, which the log keeps.
    if (stops && !Tree.clean(whyNote.peek())) {
      needsWhy.value = true;
      requestAnimationFrame(() => document.querySelector('.fxbar .fx-reason input')?.focus());
      return;
    }
    endEditing();
    writing.value = null;
    problem.value = null;
    armed.value = false;
    needsWhy.value = false;
    if (!d) return;
    const note = whyNote.peek(), keepIt = lasting.peek() && !!Tree.clean(note);
    batch(() => { draft.value = null; whyNote.value = ''; lasting.value = false; preview(null); });
    if (!h) return;
    const name = defOf(d.def)?.name ?? d.fresh?.name ?? 'the formula', broke = flaws.find(f => !f.warn);
    const said = broke ? `It doesn’t work: ${broke.message}` : none ? 'It applies to no one' : deltaWords(h.deltas, true);
    const say = `${d.fresh ? `Defined ${name}` : `Changed the formula of ${name}`}. ${said}`;
    // A row's label changed takes the words the Description sets beside it with it. And Why, kept as what the rule's page says of it for good, where it's asked to be.
    const moved = d.fresh ? [] : d.rows.filter(r => !r.gone && /^r\d+$/.test(r.key)).map(r => [kept(d.def).find(x => x.key === r.key)?.label ?? '', r.label]).filter(([a, b]) => a && b && a !== b);
    const p = d.fresh ? d.pattern : noteOf(d.def)?.pattern, words = p && N().description(p);
    const also = (moved.length && words) || keepIt ? tx => { let t = words; for (const [a, b] of moved) t = t.split('\n').map(l => l.startsWith(a) ? b + l.slice(a.length) : l).join('\n'); if (keepIt && !words) t = Tree.clean(note); if (t !== words) tx.note('Description', p, t); } : null;
    commit(rowsChange(d), say, { note, also, pattern: d.pattern });
  }
  function discard() {
    endEditing();
    problem.value = null;
    writing.value = null;
    armed.value = false;
    needsWhy.value = false;
    const d = draft.peek(), note = whyNote.peek();
    if (d) {
      batch(() => { draft.value = null; whyNote.value = ''; lasting.value = false; preview(null); });
      // What's thrown away says so, and comes back: Esc is one key from a line of typing.
      if (!unchanged(d)) Shell.toast(`Discarded your edit of ${d.fresh?.name ?? defOf(d.def)?.name ?? 'the formula'}`, { ms: 15000, redo: () => { if (!draft.peek()) batch(() => { whyNote.value = note; draft.value = d; writing.value = d.def; open.value = true; wanted.value = true; previewDraft(d); }); } });
    }
    const a = document.activeElement;
    if (a?.closest?.('.fxbar')) a.blur();
  }
  // Esc is one key from a line of typing, and throws nothing away that's been typed without asking once more: a first says what a second would do. With nothing typed, it does it.
  function escape() {
    const d = draft.peek();
    if (d && !unchanged(d) && !armed.peek()) { armed.value = true; return; }
    discard();
  }
  // Esc, while the rows are open, discards a draft, and then closes them.
  let unlayer = null;
  // (One step, whether it's the rows' layer that has it or a row's own editor, the keys going back where they were as the rows close.)
  const stepOut = () => { if (draft.peek() || editing.peek() || writing.peek()) escape(); else { open.value = false; outOf(); } };
  effect(() => {
    const on = open.value || !!draft.value;
    if (on && !unlayer) unlayer = Shell.layer(stepOut);
    else if (!on && unlayer) { unlayer(); unlayer = null; }
  });
  // The chevron, or Ctrl+Shift+U: the rows open, or closed, a draft still pending. By the key, the keys go in, and come back out where they were.
  function toggle() {
    if (open.peek()) endEditing();
    open.value = !open.peek();
  }
  const toggleKeys = () => { toggle(); if (open.peek()) into(); else outOf(); };
  // The keys into the reason, on its first step, as it opens; and out again to what had them, with the same selection.
  let cameFrom = null;
  function into() {
    const a = document.activeElement;
    if (a && a !== document.body && !a.closest('.fxbar')) cameFrom = a;
    setTimeout(() => { const p = document.querySelector('.fx-panel'); if (!p) return; const to = p.querySelector('.fx-said .fx-fact.go, .fx-show, button, [tabindex="0"]') ?? p; if (to === p) p.tabIndex = -1; to.focus({ preventScroll: true }); });
  }
  function outOf() {
    const was = cameFrom;
    cameFrom = null;
    setTimeout(() => { const a = document.activeElement; if (a && a !== document.body && !a.closest('.fxbar')) return; if (was?.isConnected) was.focus({ preventScroll: true }); else Shell.land(); });
  }
  // F1: why, at what the keys are at where a formula gives it, or what a rule says of it: the row or the cell they're in, or else what's
  // selected, asked in the bar with the keys in it. Anywhere there's no why to give, the list of keys, as F1 is help.
  function whyHere() {
    const el = document.activeElement, Rv = R.peek(), said = id => !!id && (!!Rv.computed[id] || !!Rv.covered?.[id]);
    const at = el?.closest?.('[data-why]')?.dataset.why ?? el?.closest?.('[data-key]')?.dataset.key, id = said(at) ? at : Shell.parts.peek().table?.whyAt?.();
    if (said(id)) { Shell.emit('why-open', id); open.value = true; return into(); }
    const m = model.peek();
    if (m && (m.def || m.options)) { open.value = true; return into(); }
    Shell.find('?');
  }
  // The rows open on one, to read; with `write`, with the cursor in it, to type into. Reading a rule isn't editing it:
  // a row is written only by a double-click, its pencil, typing at it, or a new row.
  const openAt = (key, { write = false } = {}) => {
    claimed = true; open.value = true; wanted.value = true;
    if (!write) { reading.value = key; return; }
    writing.value = draft.peek()?.def ?? model.peek()?.def?.id ?? null;
    aim.value = key;
    document.querySelector(`.fxbar .fx-row[data-key="${key}"] .CodeMirror`)?.CodeMirror?.setOption('readOnly', false);
  };
  const writable = m => !!m.def && !m.absent && !App.readOnly.value && (writing.value === m.def.id || draft.value?.def === m.def.id);
  // While a row is edited, a click on the chart names a record in it (point mode), and the panel holds just
  // that row.
  function startEditing(cm, key) {
    const ed = editing.peek();
    if (ed?.cm === cm) return;
    editing.value = { cm, key, subject: ed?.subject ?? subject.peek() };
    if (!ed) Shell.parts.peek().canvas?.point(true);
  }
  // The rows never cover what they're about: a box of the record worked out that they or the view's edge cut (by more
  // than its outline) is scrolled into the view below them, as a wheel scrolls the chart, as little as will do, its top
  // left first where not all fit. What already shows, however near them, holds still, as the rest of the chart does.
  function clear() {
    const m = model.peek(), recs = R.peek().records, panel = document.querySelector('.fx-panel'), chart = document.querySelector('.dc-graph');
    if (!m || !panel || !chart) return;
    const ids = [...(m.args ?? []).map(a => a.id), m.id && Tree.objectOf(recs, m.id)].filter(id => isObj(recs[id]));
    const boxes = ids.map(id => chart.querySelector(`[data-cell-id="${CSS.escape(id)}"]`)?.getBoundingClientRect()).filter(Boolean);
    if (!boxes.length) return;
    const v = chart.getBoundingClientRect(), p = panel.getBoundingClientRect(), pad = 16, outline = 4;
    const into = (lo, hi, from, to) => lo < from - outline ? from + pad - lo : hi > to + outline ? Math.max(from + pad - lo, to - pad - hi) : 0;
    const dx = into(Math.min(...boxes.map(b => b.left)), Math.max(...boxes.map(b => b.right)), Math.max(v.left, p.left), Math.min(v.right, p.right));
    const dy = into(Math.min(...boxes.map(b => b.top)), Math.max(...boxes.map(b => b.bottom)), Math.max(v.top, p.bottom), v.bottom);
    if (dx || dy) { pushed.x += dx; pushed.y += dy; chart.dispatchEvent(new WheelEvent('wheel', { deltaX: -dx, deltaY: -dy, bubbles: true, cancelable: true })); }
  }
  // What the rows moved the chart aside by goes back as they close, or shrink to the one row being written: nothing's left pushed off screen.
  const pushed = { x: 0, y: 0 };
  function unpush() {
    const chart = document.querySelector('.dc-graph');
    if (chart && (pushed.x || pushed.y)) chart.dispatchEvent(new WheelEvent('wheel', { deltaX: pushed.x, deltaY: pushed.y, bubbles: true, cancelable: true }));
    pushed.x = pushed.y = 0;
  }
  effect(() => { if (!open.value) unpush(); });
  function endEditing() {
    if (!editing.peek()) return;
    editing.value = null;
    Shell.parts.peek().canvas?.point(false);
  }
  // A click outside the bar ends editing, unless what was clicked brings it to the bar (a record pointed at on
  // the chart, a row of a definition); a draft stays pending.
  let claimed = false;
  document.addEventListener('pointerdown', e => {
    if (!editing.peek() || e.target.closest?.('.fxbar, .CodeMirror-hints')) return;
    claimed = false;
    setTimeout(() => { if (!claimed) endEditing(); });
  }, true);

  // ---- Point mode: a click on the chart inserts the name that reaches what was clicked ----
  function pointAt(target) {
    claimed = true;
    const ed = editing.peek(), m = model.peek();
    if (!ed?.cm || !m?.def) return;
    const found = reaching(target, m), cm = ed.cm;
    // Once the click has done with focus (a mousedown on the chart gives it to the chart), back to the row.
    setTimeout(() => {
      cm.focus();
      if (found.length === 1) cm.replaceSelection(found[0]);
      else if (found.length) cm.showHint({ completeSingle: false, hint: () => ({ list: found, from: cm.getCursor(), to: cm.getCursor() }) });
    });
  }
  const idsOf = v => [v].flat(Infinity).flatMap(x => x?.t === 'rec' ? [x.id, x.link] : []).filter(Boolean);
  // The names that reach a record from the one being worked out: an argument or a name of its location, a
  // name on one of those, or a relation between two arguments; shortest first.
  function reaching(target, m) {
    const Rv = R.peek(), ctx = { computed: Rv, def: m.def.id, at: m.at }, out = [];
    const hit = text => { const ev = Formulas.evaluateRow(Rv, m.def.id, '= ' + text, m.at); return !!ev && idsOf(ev.value).includes(target); };
    for (const b of Formulas.suggest('= ', 2, ctx).list.filter(x => x.kind !== 'function' && x.kind !== 'relation')) {
      if (hit(b.text)) out.push(b.text);
      for (const x of Formulas.suggest(`= ${b.text}.`, b.text.length + 3, ctx).list) if (hit(`${b.text}.${x.text}`)) out.push(`${b.text}.${x.text}`);
    }
    const t = Formulas.nameText;
    if (m.def.isRelation) for (const r of App.relations.peek()) if (r.edges.length === 2)
      for (const a of m.def.edges) for (const b of m.def.edges) {
        const call = `${t(r.name)}(${t(a)}, ${t(b)})`;
        if (a !== b && hit(call)) out.push(call);
      }
    return [...new Set(out)].sort((a, b) => a.length - b.length).slice(0, 8);
  }

  // ---- A row's formula, in CodeMirror ----
  // Its names in their colours, squiggles from check() (one that runs off the end under its last character),
  // completion from suggest(), the value of the part under the pointer just after it, the name that closes a
  // loop underlined in red, and what's been typed redlined. Enter commits; Esc discards.
  function Formula({ row, m, colors, grey, would, focus, write }) {
    const host = useRef(), cmr = useRef(), props = useRef();
    props.current = { row, m, colors, would, write };
    useLayoutEffect(() => {
      const ctx = () => { const { m } = props.current; return { computed: R.peek(), def: m.def?.id, at: m.at, ...(m.def?.id === NEW && { type: m.def.type, edges: m.def.edges }) }; };
      // A suggestion is only taken where it's picked, by the arrows and then Enter or by Tab, as Excel's are: Enter else ends the formula.
      let picked = false;
      const unpicked = on => document.querySelector('.CodeMirror-hints')?.classList.toggle('unpicked', on);
      const hint = c => {
        picked = false;
        const s = Formulas.suggest(c.getValue(), c.indexFromPos(c.getCursor()), ctx());
        if (!s.list.length) return null;
        const data = { list: s.list.slice(0, 60).map(x => ({ text: x.text, displayText: x.name, className: 'fx-hint ' + x.kind })), from: c.posFromIndex(s.from), to: c.posFromIndex(s.to) };
        CodeMirror.on(data, 'shown', () => unpicked(true));
        return data;
      };
      const hints = { hint, completeSingle: false, extraKeys: { Enter: (c, h) => { if (picked) h.pick(); else { h.close(); commitDraft(); } }, Up: (c, h) => { picked = true; unpicked(false); h.moveFocus(-1); }, Down: (c, h) => { picked = true; unpicked(false); h.moveFocus(1); } } };
      const cm = CodeMirror(host.current, {
        value: row.formula, mode: 'dendra', lineWrapping: true, matchBrackets: true, viewportMargin: Infinity, scrollbarStyle: null, readOnly: App.readOnly.peek() || !write,
        // (Esc from a row being read closes the rows, as from anywhere in them: the same step as the layer's.)
        extraKeys: { Enter: () => commitDraft(), Esc: () => stepOut(), Tab: c => { c.getWrapperElement().closest('.fx-panel')?.querySelector('.fx-reason input')?.focus(); }, 'Ctrl-Space': c => c.showHint(hints) },
        lint: { delay: 120, getAnnotations: (text, _, c) => Formulas.check(text, ctx()).problems.map(p => {
          const end = text.trimEnd().length, from = p.from < end ? p.from : Math.max(0, end - 1);
          return { from: c.posFromIndex(from), to: c.posFromIndex(Math.max(p.to, from + 1)), message: p.message, severity: 'error' };
        }) },
      });
      cm.on('beforeChange', (c, ch) => { if (ch.text.length > 1) ch.update(ch.from, ch.to, [ch.text.join(' ')]); });
      cm.on('change', (c, ch) => {
        if (ch.origin === 'setValue') return;
        const v = c.getValue(), i = v.indexOf('<-');
        if (i >= 0 && Formulas.tidyArrow(v) !== v) return c.replaceRange('←', c.posFromIndex(i), c.posFromIndex(i + 2));
        // A second start typed over the first (= typed after the ← that's there) is the one meant.
        const twice = /^\s*(?:=|←)\s*(?==|←)/.exec(v);
        if (twice) return c.replaceRange('', c.posFromIndex(0), c.posFromIndex(twice[0].length));
        const { m, row } = props.current;
        change(m.def.id, rows => rows.map(r => r.key === row.key ? { ...r, formula: v } : r));
      });
      cm.on('inputRead', (c, ch) => { if (/[\w[.]/.test(ch.text.join(''))) c.showHint(hints); });
      cm.on('focus', c => { hover.value = null; if (!c.getOption('readOnly')) startEditing(c, props.current.row.key); });
      // Typed at a row being read, as at a cell selected, it's written, from where the click left the cursor; F2 too.
      cm.on('keydown', (c, e) => {
        if (!c.getOption('readOnly') || App.readOnly.peek() || !props.current.m.def || e.ctrlKey || e.metaKey || e.altKey || !(e.key.length === 1 || ['F2', 'Backspace', 'Delete'].includes(e.key))) return;
        writing.value = draft.peek()?.def ?? model.peek()?.def?.id ?? null;
        c.setOption('readOnly', false);
        startEditing(c, props.current.row.key);
      });
      const wrap = cm.getWrapperElement();
      wrap.addEventListener('mousemove', e => {
        const { row } = props.current;
        const pos = cm.coordsChar({ left: e.clientX, top: e.clientY }, 'window'), box = cm.charCoords(pos, 'window');
        const off = cm.indexFromPos(pos) - (e.clientX < box.left ? 1 : 0), start = Formulas.splitFormula(cm.getValue());
        // Its start says what it is, pointed at, and what `@` stands for.
        wrap.title = off < start.offset ? startSaid(start.kind) : cm.getValue()[off] === '@' ? '@ is this one: what’s being worked out, or in a list, each item' : '';
        if (!row.ev || editing.peek()?.cm === cm) return;
        const part = row.ev.parts.filter(p => p.from <= off && off < p.to).sort((a, b) => (a.to - a.from) - (b.to - b.from))[0];
        const hv = hover.peek();
        if (!part) { if (hv?.key === row.key) hover.value = null; }
        else if (hv?.key !== row.key || hv.from !== part.from || hv.to !== part.to) hover.value = { key: row.key, from: part.from, to: part.to };
      });
      wrap.addEventListener('mouseleave', () => { if (hover.peek()?.key === props.current.row.key) hover.value = null; });
      cmr.current = cm;
      if (focus) requestAnimationFrame(() => { cm.focus(); cm.setCursor(cm.lineCount(), 0); });
      return () => { wrap.remove(); if (hover.peek()?.key === props.current.row.key) hover.value = null; };
    }, []);
    useLayoutEffect(() => {
      const cm = cmr.current, { row, m, colors, would, write } = props.current, hv = hover.value, still = App.readOnly.peek() || !write;
      if (cm.getOption('readOnly') !== still) cm.setOption('readOnly', still);
      if (aim.value === row.key) { aim.value = null; requestAnimationFrame(() => { cm.focus(); cm.setCursor(cm.lineCount(), 0); if (!cm.getOption('readOnly')) startEditing(cm, row.key); }); }
      if (!cm.hasFocus() && cm.getValue() !== row.formula) cm.setValue(row.formula);
      cm.operation(() => {
        for (const mk of cm.getAllMarks()) if (mk.fx) mk.clear();
        const at = i => cm.posFromIndex(i), mark = (f, t, cls) => { cm.markText(at(f), at(t), { className: cls }).fx = true; };
        const widget = (i, cls, content, o) => { const el = document.createElement('span'); el.className = cls; content(el); cm.setBookmark(at(i), { widget: el, ...o }).fx = true; };
        for (const n of row.ev?.names ?? []) if (colors?.has(n)) mark(n.from, n.to, `fx-rf fx-c${colors.get(n)}`);
        for (const l of row.loops ?? []) mark(l.from, l.to, 'fx-loop');
        const part = hv?.key === row.key && row.ev && cm.getValue() === row.formula && row.ev.parts.find(p => p.from === hv.from && p.to === hv.to);
        if (part) {
          const name = row.ev.names.filter(n => colors?.has(n) && n.from >= part.from && n.to <= part.to).sort((a, b) => b.to - a.to)[0];
          const tint = name ? ` fx-c${colors.get(name)}` : '';
          mark(part.from, part.to, 'fx-hov' + tint);
          widget(part.to, 'fx-val' + tint, el => { el.textContent = partText(row, part); }, { insertLeft: true });
        }
        if (would && !cm.hasFocus()) widget(cm.getValue().length, 'fx-would', el => render(would, el));
      });
    });
    return html`<div class=${'fx-cm' + (grey ? ' grey' : '')} ref=${host} />`;
  }
  // What a row said, apart from what's typed, which the editor shows as it is: a number being typed never reads with its old
  // digits run into it. What changed is struck.
  function Before({ text, now }) {
    let i = 0, j = 0;
    while (i < text.length && i < now.length && text[i] === now[i]) i++;
    while (j < text.length - i && j < now.length - i && text[text.length - 1 - j] === now[now.length - 1 - j]) j++;
    // (Whole words: what's struck never breaks in the middle of one.)
    const word = /[\p{L}\p{N}_&%.$-]/u;
    while (i > 0 && word.test(text[i - 1]) && (word.test(text[i] ?? '') || word.test(now[i] ?? ''))) i--;
    while (j > 0 && word.test(text[text.length - j]) && (word.test(text[text.length - j - 1] ?? '') || word.test(now[now.length - j - 1] ?? ''))) j--;
    return html`<p class="fx-before"><span class="ba">Before</span> ${text.slice(0, i)}<span class="del">${text.slice(i, text.length - j)}</span>${j ? text.slice(-j) : ''}</p>`;
  }

  // ---- The bar ----
  function Bar() {
    const m = model.value, p = pending.value;
    // With nothing to say, the bar names the view, as Excel's Name Box names the cell.
    if (!m) return html`<div class="fxbar"><span class="fx-view">${App.views.value.find(v => v.id === Shell.view.value)?.name}</span><span class="fx-end"><${Delta} p=${p} /></span></div>`;
    const f = finder.value, cited = m.rows.find(r => r.cited), opens = !!(m.def || m.options), shut = !open.value || !opens;
    const tint = edge => { const c = cited && [...f.colors].find(([n]) => norm(unbracket(cited.formula.slice(n.from, n.to))) === norm(edge)); return c ? ` fx-rf fx-c${c[1]}` : ''; };
    // A tag's checkbox comes first, as a checkbox does before its label; a value after its name and place. A
    // name cut short ends in an ellipsis, and says itself whole on hover.
    const boxed = !!m.out && 'tag' in m.out, whole = text => e => { const el = e.currentTarget; el.title = el.scrollWidth > el.clientWidth ? text : ''; };
    return html`<div class="fxbar" onKeyDown=${onKey}>
      ${trail.value.map((t, i) => html`<button class="fx-crumb" key=${t.id} title=${t.place} onClick=${() => back(i)}>${t.title}${t.clause ? ` ${t.clause}` : ''}</button><span class="fx-sep" aria-hidden="true">›</span>`)}
      ${boxed ? html`<${Output} key=${m.id} m=${m} />` : null}
      ${m.options ? html`<button class="btn ghost dd fx-name" onPointerEnter=${whole(m.title)} onClick=${e => pickMenu(e, m)}>${m.title}</button>`
        : m.def && !m.general ? html`<button class="fx-name" onPointerEnter=${whole(m.title)} onClick=${() => openDef(m.def.id)}>${m.title}</button>`
        : html`<span class="fx-name" onPointerEnter=${whole(m.title)}>${m.title}</span>`}
      <span class="fx-args" onPointerEnter=${whole(placeText(m, 'name'))}>${m.args ? m.args.map(a => html`${a.join ? html`<span class="to">${a.join}</span>` : null}<span class=${'fx-arg' + tint(a.edge)} title=${a.short !== a.name ? a.name : null}>${a.short}</span>`) : m.place}</span>
      ${boxed ? null : html`<${Output} key=${m.id} m=${m} />`}
      ${opens && shut ? html`<${Inline} m=${m} />` : null}
      <span class="fx-end">
        <${Delta} p=${p} />
        ${m.computed && m.rec && 'tag' in m.rec && !m.absent && !App.readOnly.value && !draft.value && !App.held(m.id) ? html`<${Override} m=${m} />` : null}
        ${m.err && m.err.error.code === '#N/A' && m.def?.type === 'tag' && m.err.at && !App.readOnly.value && !draft.value ? html`<button class="btn fx-override" onClick=${() => { preview(null); App.overriding(null, { at: m.err.at, edge: m.def.name }); }}>Override…</button>` : null}
        ${m.covered && !m.covered.agrees && m.rec && !m.computed && !m.absent && !draft.value ? html`<span class="fx-typed-over">Typed over the rule${App.readOnly.value ? null : html` <button class="btn" onClick=${() => { preview(null); App.backToRule(m.id); }}>Back to the rule…</button>`}</span>` : null}
        ${draft.value && !unchanged(draft.value) ? html`<span class="fx-acts">
          ${armed.value ? html`<span class="fx-esc" role="status">Esc again discards your edit</span>` : null}
          <button class="btn ghost" data-tip="Discard" data-keys="Esc" onClick=${() => discard()}>Discard</button>
          <button class="btn primary" data-tip="Done" data-keys="Enter" onClick=${() => commitDraft()}>Done</button></span>` : null}
        ${opens ? html`<button class="btn icon fx-open" aria-expanded=${!shut} aria-label=${toggled(shut)} data-tip=${toggled(shut)} data-keys=${EXPAND} onClick=${toggle}>${Shell.icon('chevron')}</button>` : null}
      </span>
      ${shut ? null : html`<${Panel} m=${m} />`}
    </div>`;
  }

  // With the keys in the reason, Alt+← and Alt+→ go back along the breadcrumb and on again, the rows staying open and the keys with them.
  let ahead = [];
  function alongTrail(e) {
    const m = model.peek(), t = trail.peek(), crumb = () => ({ id: m?.id, clause: asked.peek()?.clause ?? null, keys: Shell.selection.peek() });
    if (e.key === 'ArrowLeft' && t.length) { ahead.push(crumb()); back(); }
    else if (e.key === 'ArrowRight' && ahead.length) { const to = ahead.pop(); goTo(to.id, to.clause, to.keys, true); }
    else return false;
    into();
    return true;
  }
  // Enter and Esc in a row's label belong to the bar while it has something to commit or discard.
  function onKey(e) {
    if (e.altKey && e.target.closest?.('.fx-said') && alongTrail(e)) { e.preventDefault(); e.stopPropagation(); return; }
    if (e.key !== 'Escape' && e.key !== 'Enter') return;
    if (e.target.closest?.('.CodeMirror')) { e.stopPropagation(); return; }
    if (!draft.peek() || !e.target.matches?.('input.fx-label, .fx-reason input')) return;
    e.stopPropagation(); e.preventDefault();
    if (e.key === 'Enter') commitDraft(); else escape();
  }

  // What the pointer lights goes when the pointer leaves it, and when what it points at goes: a sentence closed,
  // or said anew under a still pointer, a tag or a row no longer shown, never leaves the chart lit. Reached by
  // the keys, it lights as when pointed at, until the keys leave it.
  function usePoint(on, off) {
    const held = useRef(false), last = useRef(off);
    last.current = off;
    const enter = () => { held.current = true; on(); }, leave = () => { if (held.current) { held.current = false; last.current(); } };
    useLayoutEffect(() => leave, []);
    return { onPointerEnter: enter, onPointerLeave: leave, onFocus: e => e.currentTarget.matches(':focus-visible') && enter(), onBlur: leave };
  }

  // A segment of a sentence in words: a sentence's first letter in capitals; a name by its short name, which as
  // a defined term reads "the BDC" mid-sentence.
  const upper = s => s[0].toUpperCase() + s.slice(1);
  const wordOf = (recs, s, start) => typeof s === 'string' ? (start ? upper(s) : s)
    : s.name ? (start ? N().shortOf(recs, s.name) : N().shortOf(recs, s.name).replace(/^The\b/, 'the')) : start ? upper(s.term) : s.term;
  // Why, as plain text: the sentence's runs, its citations in parentheses, and a full stop.
  function plain(recs, runs) {
    let first = true;
    const seg = s => { const w = wordOf(recs, s, first); first = false; return w; };
    return runs.map(r => r.text ? seg(r.text) : r.cite ? ` (${r.cite})` : r.segs.map(seg).join('')).join('') + '.';
  }

  // Why, said: each fact a quiet button (a span, so that it wraps as words do), its point in weight and in the
  // hue its records are outlined in on the chart. Hovered, its records pulse there; clicked, it steps down into
  // its reasons, or selects what was entered.
  function Said({ runs, cls, onClick }) {
    const { map } = finder.value, recs = R.value.records;
    let first = true;
    const seg = s => {
      const w = wordOf(recs, s, first);
      first = false;
      if (typeof s === 'string') return w;
      if (s.name) { const full = N().nameOf(recs, s.name); return html`<span title=${N().shortOf(recs, s.name) !== full ? full : null}>${w}</span>`; }
      const hue = map.get(s.id)?.[0];
      return html`<b class=${[s.fx && 'fx', hue && `fx-rf fx-c${hue}`].filter(Boolean).join(' ') || null}>${w}</b>`;
    };
    return html`<span class=${cls} onClick=${onClick}>${runs.map((r, i) => r.text ? seg(r.text)
      : r.cite ? html`<span class="fx-cite"> (${r.cite})</span>`
      : r.self ? html`<span class="fx-fact">${r.segs.map(seg)}</span>`
      : html`<${Fact} key=${i + ':' + r.fact.ids.join()} fact=${r.fact}>${r.segs.map(seg)}</${Fact}>`)}.</span>`;
  }
  // A fact that steps down: hovered, its records pulse on the chart, until the pointer leaves it or it goes.
  function Fact({ fact, children }) {
    const mine = useRef(null), point = usePoint(() => { touch.value = mine.current = fact.ids; }, () => { if (touch.peek() === mine.current) touch.value = null; });
    // (By the keys, a new step down is a new way on, and they stay in the reason.)
    const go = e => { e.preventDefault(); e.stopPropagation(); stepTo(fact); if (e.type === 'keydown') { ahead = []; into(); } };
    return html`<span class="fx-fact go" role="button" tabindex="0" ...${point} onClick=${go} onKeyDown=${e => { if (e.key === 'Enter' || e.key === ' ') go(e); }}>${children}</span>`;
  }

  // In the bar's one row: why, said in full where it fits, or else in short, cut short where even that
  // doesn't; an error, in its words; or else the rows' labels, a clause once. Never the formula: a click drops
  // the rows, where it's read and edited.
  function Inline({ m }) {
    const w = why.value, ref = useRef(), [fit, setFit] = useState(0), width = useRef(0);
    const says = [w?.full, w?.mid, w?.short].filter(Boolean), said = says[Math.min(fit, says.length - 1)];
    useLayoutEffect(() => setFit(0), [w]);
    useLayoutEffect(() => { const s = ref.current?.querySelector(':scope > .fx-why'); if (s && fit < says.length - 1 && s.scrollWidth > s.clientWidth + 1) setFit(fit + 1); });
    useLayoutEffect(() => {
      const ro = new ResizeObserver(([e]) => { const x = Math.round(e.contentRect.width); if (x !== width.current) { width.current = x; setFit(0); } });
      if (ref.current) ro.observe(ref.current);
      return () => ro.disconnect();
    }, []);
    const drop = () => { open.value = true; };
    if (said) return html`<span class="fx-inline" ref=${ref}><${Said} runs=${said} cls="fx-why" onClick=${drop} /></span>`;
    if (m.err?.error.msg) return html`<span class="fx-inline" ref=${ref}><span class="fx-why" onClick=${drop}>${m.err.error.msg}</span></span>`;
    const labels = new Map();
    for (const r of m.rows) { const l = r.label || r.formula; labels.set(l, labels.get(l) || r.ink); }
    return html`<span class="fx-inline fx-labels" ref=${ref}>${[...labels].map(([l, ink]) => html`<button class=${ink ? null : 'grey'} onClick=${drop}>${l}</button>`)}</span>`;
  }

  // The definition's rows, over the view, and what reads it.
  function Panel({ m }) {
    const f = finder.value, editable = !m.absent && !App.readOnly.value, ref = useRef();
    aim.value;   // a row asked for, though the rows are open already
    // As wide as the view it lies over, not the inspector beside it.
    useLayoutEffect(() => {
      const el = ref.current, view = el.closest('.shell')?.querySelector(':scope > .main > .view');
      if (!view) return;
      const fit = () => {
        el.style.setProperty('--fx-w', view.offsetWidth ? view.offsetWidth + 'px' : '100%');
        el.querySelectorAll('.CodeMirror').forEach(c => c.CodeMirror.refresh());   // its lines wrap anew
      };
      const ro = new ResizeObserver(fit);
      ro.observe(view); fit();
      return () => ro.disconnect();
    }, []);
    // Opened, and as a row is edited and the panel holds just it, the chart it's about is brought clear of it.
    useLayoutEffect(() => (editing.value ? unpush() : clear()), [m.id ?? m.def?.id, !!editing.value]);
    // Read as a person reads it: why, in full, the formula behind "Show the formula", which stays shown once asked for,
    // until hidden. Where there's no why to read (a definition in general, an error), or a row is asked for or edited,
    // the rows show.
    const w = why.value, said = !!w, rows = !said || formula.value || wanted.value || !!editing.value || draft.value?.def === m.def?.id;
    const showing = on => { formula.value = on; Shell.store.set('formula', on ? 'shown' : null); };
    const d = draft.value?.def === m.def?.id ? draft.value : null, moved = !!d && !unchanged(d), pend = pending.value?.from === 'bar' ? pending.value : null;
    return html`<div class=${'fx-panel' + (editing.value ? ' editing' : '')} ref=${ref}>
      ${w ? html`<p class="fx-said"><${Said} runs=${w.full} cls="fx-why" /></p>` : null}
      <div class="fx-rows" hidden=${!rows}>${rows ? m.rows.map(r => html`<${Row} key=${r.key} r=${r} m=${m} colors=${r.cited || editing.value?.key === r.key || hover.value?.key === r.key || reading.value === r.key ? f.colors : null} editable=${editable} />`) : null}</div>
      ${moved && (pend?.flaws?.length || pend?.nobody) ? html`<${Flaws} flaws=${pend.flaws ?? []} none=${pend.nobody} d=${d} />` : null}
      ${!moved && !d && m.def && R.value.flaws?.[m.def.id]?.length ? html`<${Flaws} flaws=${R.value.flaws[m.def.id].map(x => ({ ...x, def: m.def.id }))} />` : null}
      ${moved && d.fresh ? html`<${TypedUnder} d=${d} />` : null}
      ${moved ? html`<div class=${'fx-reason' + (needsWhy.value && !Tree.clean(whyNote.value) ? ' needed' : '')}><label><span>Why</span><input class="cell" spellcheck=${false} autocomplete="off" aria-label="Why" value=${whyNote.value} onInput=${e => { whyNote.value = e.target.value; }} /></label>
        ${N().description(d.fresh ? d.pattern : noteOf(m.def.id)?.pattern ?? {}) ? null : html`<label class="fx-lasting"><input type="checkbox" checked=${lasting.value} onChange=${e => { lasting.value = e.target.checked; }} />Keep it as its description</label>`}</div>` : null}
      <div class="fx-foot">
        ${rows && editable && m.def ? html`<button class="btn icon fx-add" aria-label="Add a row" data-tip="Add a row" onClick=${() => addRow(m)}>${Shell.icon('plus')}</button>` : null}
        ${said && m.def ? html`<button class="btn ghost fx-show" onClick=${() => { wanted.value = false; showing(!rows); }}>${rows ? 'Hide the formula' : 'Show the formula'}</button>` : null}
        ${writing.value === m.def?.id && !draft.value ? html`<button class="btn ghost fx-done" data-tip="Done" data-keys="Esc" onClick=${discard}>Done</button>` : null}
        <${Uses} m=${m} />
      </div>
    </div>`;
  }

  // What a formula gives is overridden by saying so: the reason's own command, which redlines what it would change as it's
  // pointed at, and goes through the change pending's bar (App.overriding).
  function Override({ m }) {
    const point = usePoint(() => preview(flipped(m), 'tag'), () => pending.peek()?.from === 'tag' && previewDraft());
    return html`<button class="btn fx-override" ...${point} onClick=${() => { preview(null); App.overriding(m.id); }}>Override…</button>`;
  }
  // What's wrong with a rule as written, in words: a name that isn't there, a quoted value that's no option, a rule that depends on
  // itself; a click mending what's close, or making what's typed an option. Written, with a draft, Save anyway stands apart from
  // Done, which makes nothing while it's so: the rule's page says the same of one saved so.
  function Flaws({ flaws, none, d }) {
    const mend = f => change(d.def, rows => rows.map(r => r.key === f.key ? { ...r, formula: r.formula.slice(0, f.from) + f.fix + r.formula.slice(f.to) } : r));
    const option = f => {
      const s = Object.values(App.schema.peek()).find(t => t.out && 'choice' in t.out && t.args?.length && Tree.same(t.args.length > 1 ? N().name(Tree.bare(t)) : t.args[0].edge, f.label));
      if (s && App.change(tx => tx.add('spec', { tree: { ...s, out: { choice: f.value } } }), { dated: false, say: `Added the option ${f.value} to ${f.label}` })) previewDraft();
    };
    return html`<div class="fx-flaws" role="alert" tabindex="-1">${flaws.map(f => html`<p class=${'fx-flaw' + (f.warn ? ' warn' : '')} key=${f.message}>${f.message}${d && f.fix && f.key ? html` <button class="btn" onClick=${() => mend(f)}>${f.fix}</button>` : null}${d && f.value ? html` <button class="btn" onClick=${() => option(f)}>Make it an option</button>` : null}</p>`)}
      ${none ? html`<p class="fx-flaw warn nobody">${none}</p>` : null}
      ${d && (flaws.some(f => !f.warn) || none) ? html`<button class="btn fx-anyway" data-tip="Asks why" onClick=${() => commitDraft({ anyway: true })}>Save anyway</button>` : null}</div>`;
  }
  // What's typed under a first formula, by name: asked what becomes of it, each going to the rule unless it's kept. A hand tick left
  // over from making the field must never beat the rule without saying so.
  function TypedUnder({ d }) {
    const ids = typedUnder(d), recs = App.entered.value, n = N();
    if (!ids.length) return null;
    const set = (id, on) => { const keep = new Set(draft.peek().keep); if (on) keep.delete(id); else keep.add(id); draft.value = { ...draft.peek(), keep }; previewDraft(); };
    return html`<div class="fx-typed"><p class="fx-ask">Typed already. Clear each, and leave it to the rule?</p>${ids.map(id => html`<label key=${id}><input type="checkbox" checked=${!d.keep?.has(id)} onChange=${e => set(id, e.target.checked)} />${recs[id].args ? n.segmentOf(recs, id) : n.whereOf(recs, recs[id])}: ${Tree.outputText(recs[id])}</label>`)}</div>`;
  }
  // The rules in error, said across the view, on a chart or a table: what doesn't work, what reads it, and the way there. What they
  // give can't be read as an answer, however clean it looks. It goes when they work.
  function Broken() {
    const { roots, reach } = App.broken.value;
    if (!roots.length) return null;
    const first = roots[0], others = [...reach].filter(x => !roots.some(r => r.def === x)).map(defOf).filter(Boolean).map(x => x.name);
    return html`<div class="fx-band" role="alert"><span><b>${roots.length > 1 ? `${roots.length} rules don’t work` : `${first.name}’s formula doesn’t work`}</b>: ${first.problems[0]}${others.length ? ` Don’t rely on ${[...roots.map(r => r.name), ...others].slice(0, 4).join(', ')}${others.length + roots.length > 4 ? ` or ${others.length + roots.length - 4} more` : ''}.` : ` Don’t rely on what it gives.`}</span>
      <button class="btn" onClick=${() => openDef(first.def)}>Open it</button></div>`;
  }
  // The same, in a line, for what goes out of the window: what Export says first.
  const brokenSaid = () => { const { roots } = App.broken.peek(); return roots.length ? `${roots.length > 1 ? `${roots.length} rules don’t work (${roots.map(r => r.name).join(', ')})` : `${roots[0].name}’s formula doesn’t work`}: what it gives can’t be relied on.` : null; };

  // The output, in its own control: an entered tag's checkbox, which previews the other state pointed at or reached by
  // the keys, and switches to it on a click or Space, as a checkbox's do (App.put); Enter goes on, as from a value and as in
  // Excel, back to the view, so no key meant to move on changes it. One a formula gives only says, and its click opens why. Or
  // a value, typed over to enter one. The amber corner where an entry overrides rows.
  const onward = e => { if (e.key !== 'Enter') return; e.preventDefault(); e.stopPropagation(); document.getElementById('view')?.focus(); };
  function Output({ m }) {
    // (Previewed as it will be made: from the day it asks, where it asks one.)
    const asMade = () => { const out = { tag: !m.rec.tag }; return App.would(tx => App.putting(tx, m.id, m.rec, out), { dated: App.asksFrom(m.id, out) ? App.day.peek() : true }); };
    const o = m.out, point = usePoint(() => m.rec && !m.computed && !m.covered && preview(asMade(), 'tag'), () => pending.peek()?.from === 'tag' && previewDraft());
    if (!o) return null;
    if (o.error?.code === '#N/A' && m.def?.type === 'tag') return html`<span class="fx-out cant">Can’t say</span>`;
    if (o.error) return html`<span class="fx-out err">${o.error.code}</span>`;
    const a = after(m);
    if ('tag' in o) {
      const state = v => v === true ? ' yes' : v === false ? ` no ${m.rec ? App.noTone(m.id) : ''}` : '';
      const cls = 'tag' + (a !== undefined ? ' pend' + state(a?.tag) : state(o.tag) + (m.computed ? ' fx' : ''));
      return html`<span class=${'fx-out' + (m.covered && !m.covered.agrees ? ' over' : '')}><button class=${cls} aria-label=${m.title} disabled=${!!m.absent || (App.readOnly.value && !m.computed)}
        ...${point} onKeyDown=${onward} onClick=${() => { if (!m.rec) return; preview(null); if (m.computed || m.covered) open.value = true; else App.put(m.id, m.rec, { tag: !m.rec.tag }, { auto: true }); }} /></span>`;
    }
    if (a !== undefined && a?.value !== m.rec.value && pending.value.from !== 'value')
      return html`<span class="fx-out"><span class="del">${o.text}</span> <span class="add">${a ? Tree.outputText(a) : '—'}</span></span>`;
    return html`<${Value} m=${m} />`;
  }
  // A tag in the other state: an entered one flipped, a computed one ruled out by an entry at its spot.
  function flipped(m) {
    const { computed: _, ...rec } = m.rec;
    return { records: m.computed ? { 'fx-pending': { ...spotOf(rec), tag: !rec.tag } } : { [m.id]: { ...rec, tag: !rec.tag } } };
  }
  // While a value is typed, what it replaces shows struck through before it, and the input keeps what's typed.
  function Value({ m }) {
    const o = m.out, wrap = 'fx-out' + (m.covered && !m.covered.agrees ? ' over' : ''), typing = pending.value?.from === 'value', still = App.readOnly.value;
    if (!o.field) {
      const options = m.def?.options ?? [], enter = choice => App.put(m.id, m.rec, { choice }, { auto: true });
      return html`<span class=${wrap}>${options.length && !still
        ? html`<button class=${'btn ghost dd fx-text' + (m.computed ? ' fx' : '')} onClick=${e => Shell.menu(e.currentTarget, options.map(c => ({ label: c, checked: c === o.text, run: () => c !== o.text && enter(c) })))}>${o.text}</button>`
        : html`<span class=${'fx-text' + (m.computed ? ' fx' : '')}>${o.text}</span>`}</span>`;
    }
    const typed = text => {
      const v = Tree.parse(o.field, text);
      if (v === undefined || v === m.rec.value) return null;
      const rec = { ...spotOf(m.rec), field: o.field, value: v };
      return { records: m.computed ? { 'fx-pending': rec } : { [m.id]: rec } };
    };
    const key = e => {
      if (e.key !== 'Enter' && e.key !== 'Escape') return;
      e.preventDefault(); e.stopPropagation();
      const c = e.key === 'Enter' && typed(e.target.value);
      preview(null);
      if (c) App.put(m.id, m.rec, { field: o.field, value: Tree.parse(o.field, e.target.value) }, { auto: true }); else e.target.value = o.text;
      e.target.blur();
    };
    return html`<span class=${wrap}>${typing ? html`<span class="del fx-was">${o.text}</span>` : null}<input key=${m.id + '|' + o.text} disabled=${still}
      class=${'bare fx-value' + (m.computed ? ' fx' : '') + (typing ? ' fx-typed' : '')} defaultValue=${o.text} size=${Math.max(4, o.text.length + 1)}
      spellcheck="false" aria-label=${m.title} onInput=${e => { const c = typed(e.target.value); c ? preview(c, 'value') : preview(null); }}
      onKeyDown=${key} onBlur=${e => { if (pending.peek()?.from === 'value') preview(null); e.target.value = o.text; }} /></span>`;
  }

  // What reads this definition, from the engine's plan; each opens its own. "Used by" clicked opens the whole of it, as a tree: what
  // reads this, what reads those, and so on to the end of the chain.
  function Uses({ m }) {
    const uses = R.value.uses ?? {}, readers = id => Object.keys(uses).filter(d => uses[d].includes(id)).map(defOf).filter(Boolean), by = m.def ? readers(m.def.id) : [];
    // (As of a day past, where today's rule has changed since.)
    const rule = m.def && typeof Time !== 'undefined' ? N().notes('Formula').find(n => n.note === m.def.id) : null, since = rule ? Time.ruleSince(rule.pattern) : null;
    if (!by.length && !since) return null;
    const link = d => html`<button class="fx-link" onClick=${() => openDef(d.id)}>${d.name}</button>`;
    const branch = (ds, seen, close) => html`<ul class="fx-tree">${ds.map(d => html`<li key=${d.id}><button class="lk" onClick=${() => { close(); openDef(d.id); }}>${d.name}</button>${seen.has(d.id) ? null : branch(readers(d.id).filter(x => !seen.has(x.id)), new Set([...seen, d.id]), close)}</li>`)}</ul>`;
    const tree = e => Shell.popover(e.currentTarget, close => html`<div class="fx-used-tree"><p>Used by</p>${branch(by, new Set([m.def.id]), close)}</div>`, { placement: 'top-end' });
    return html`${since ? html`<span class="fx-used">Today’s rule: changed ${since.day} by ${since.who}${since.stand ? html` <button class="fx-link" onClick=${since.stand}>As it stood</button>` : null}</span>` : null}${by.length ? html`<span class="fx-used"><button class="fx-link fx-usedby" aria-haspopup="dialog" onClick=${tree}>Used by</button> ${by.slice(0, 3).map((d, i) => html`${i ? ', ' : ''}${link(d)}`)}${by.length > 3
      ? html`, <button class="fx-link" onClick=${tree}>${by.length - 3} more</button>` : null}</span>` : null}`;
  }

  // What a pending change does to what formulas give, in plain words, by what each definition gives, the most first:
  // "Adds 2 annual taxes; takes away 11 controls; changes 1 voting percentage". Each opens, clicked, to which, by name. A rule's own
  // says where it changes nothing, as silence proves nothing; and that it doesn't work, where it doesn't, for what a broken formula
  // would give is no outcome.
  const Delta = ({ p }) => {
    // (As many as it has room for, what's the preview of never cut for them; the rest are a click away, by "more".)
    const [fit, setFit] = preactHooks.useState({ of: null, n: 3 }), box = preactHooks.useRef(), n = fit.of === p?.deltas ? fit.n : 3;
    preactHooks.useLayoutEffect(() => { const el = box.current; if (el && n > 1 && el.scrollWidth > el.clientWidth + 1) setFit({ of: p?.deltas, n: n - 1 }); });
    // (What's still being typed says nothing, right or wrong.)
    if (p?.unread) return null;
    if (p?.flaws?.some(f => !f.warn)) return html`<span class="fx-delta fx-doesnt"><b class="take">The formula doesn’t work</b></span>`;
    // A rule that would apply to no one is said as that: what it took away is no conclusion, and never good news.
    if (p?.nobody) return html`<span class="fx-delta fx-doesnt"><b class="change">It would apply to no one</b></span>`;
    // What any change would do to a rule itself comes first: a rule it breaks, or leaves applying to no one, is what someone's about to do without knowing.
    const spoils = p ? [...(p.breaks ?? []).map(r => `${r.name} would stop working`), ...(p.emptied ?? []).map(d => `${d.name} would apply to no one`)] : [], fail = p?.deltas.find(d => d.name === 'fail');
    const all = p?.deltas.filter(d => d.name !== 'fail') ?? [], ds = all.slice(0, n), said = WORDS.map(([k, verb, cls]) => { const of = ds.filter(d => d[k]); return of.length ? [verb, cls, of.map(d => [countedOf(d[k], d.def, d.of[k]), d.of[k]])] : null; }).filter(Boolean), calm = p ? steady(p) : null, moved = fail ? moves(fail) : [];
    if (p?.from === 'bar' && !said.length && !moved.length && !spoils.length) return html`<span class="fx-delta">No conclusions change</span>`;
    // A transfer to one named as it's typed takes away what reached through the old holder, till the new one has its own.
    const to = p?.from === 'pending' && App.pending.peek()?.verb === 'Transfer' && App.pending.peek().transfer?.to, until = to?.kind && ds.some(d => d.minus) ? `until ${to.name} has ${lower(ownerWord(App.pending.peek().transfer.rid))}` : null;
    // Too long to read as pairs, and all with one record, it's what it means: "31 affiliated persons with Northpine", opening to who, each once.
    const withOne = of => { if (of.length < 4) return null; const A = R.peek(), B = p?.R2, objects = o => { const X = A.records[o.id] ? A : B, r = X?.records[o.id]; return r?.args ? r.args.map(a => Tree.objectOf(X.records, a.at)) : null; }, sets = of.map(objects); if (sets.some(s => !s)) return null; const one = sets[0].find(x => sets.every(s => s.includes(x))); return one ? { id: one, X: A.records[one] ? A : B, others: sets.map(s => s.find(x => x !== one)) } : null; };
    const short = one => N().shortOf(one.X.records, one.id);
    const listed = of => { const one = withOne(of); if (!one) return of.map(o => html`<li key=${o.id}>${o.say}</li>`); const n = new Map(); for (const x of one.others) n.set(x, (n.get(x) ?? 0) + 1); return [...n].map(([x, k]) => html`<li key=${x}>${N().shortOf(one.X.records, x)}${k > 1 ? ', both ways' : ''}</li>`); };
    const countedAs = (x, of) => { const one = withOne(of); return one ? `${x} with ${short(one)}` : x; };
    const which = (e, verb, x, of) => Shell.popover(e.currentTarget, () => html`<div class="fx-which"><p>${verb} ${countedAs(x, of)}</p><ul>${listed(of)}</ul></div>`, { placement: 'bottom-end' });
    // What there's no room to say here is a click away, never left out: the smallest may be what's taken away.
    const rest = all.slice(n), more = e => Shell.popover(e.currentTarget, () => html`<div class="fx-which">${rest.flatMap(x => WORDS.filter(([k]) => x[k]).map(([k, verb]) => html`<p>${verb} ${countedAs(countedOf(x[k], x.def, x.of[k]), x.of[k])}</p><ul>${listed(x.of[k])}</ul>`))}</div>`, { placement: 'bottom-end' });
    // (All of them with one record, that's said once, after them all.)
    const allWith = xs => { const ones = xs.map(([, of]) => withOne(of)), one = ones[0]; return xs.length > 1 && one && ones.every(o => o?.id === one.id) ? one : null; };
    const lead = (i, verb) => i || moved.length || spoils.length ? `${verb[0].toLowerCase()}${verb.slice(1)} ` : `${verb} `;
    return said.length || moved.length || spoils.length ? html`<span class="fx-delta" ref=${box}>${spoils.map((s, i) => html`<span><b class="change">${s}</b>${i < spoils.length - 1 || moved.length || said.length ? ';' : ''}</span>`)}${moved.map((m, i) => html`<span>${m.pre}<button type="button" class="fx-count" aria-haspopup="dialog" onClick=${e => which(e, m.pre + m.who, m.words, m.of)}><b class=${m.cls}>${m.who}</b></button>${m.words ? ` ${m.words}` : ''}${i < moved.length - 1 || said.length ? ';' : ''}</span>`)}${said.map(([verb, cls, xs], i) => html`<span>${lead(i, verb)}${xs.map(([x, of], j) =>
      html`${j ? (j === xs.length - 1 ? ' and ' : ', ') : ''}<button type="button" class="fx-count" aria-haspopup="dialog" onClick=${e => which(e, verb, x, of)}><b class=${cls}>${allWith(xs) ? x : countedAs(x, of)}</b></button>`)}${allWith(xs) ? ` with ${short(allWith(xs))}` : ''}${i < said.length - 1 || rest.length ? ';' : ''}</span>`)}${rest.length ? html`<span><button type="button" class="fx-count" aria-haspopup="dialog" onClick=${more}><b>${rest.length} more</b></button></span>` : null}${until ? html`<span>${until}</span>` : null}${calm ? html`<span class="fx-net" title=${calm}>· ${calm}</span>` : null}</span>` : null;
  };
  // What a relation's holder is called, by the list it makes ("an owner"), as a toast offers one.
  const ownerWord = rid => { const recs = R.peek().records, t = Tree.treeOf(recs, rid), one = singular(N().listName(t, N().edges(t)[0])); return `${/^[aeiou]/i.test(one) ? 'an' : 'a'} ${one}`; };

  function pickMenu(e, m) {
    const Rv = R.peek(), holds = o => !!o.id && o.on !== false;
    Shell.menu(e.currentTarget, [...m.options.filter(holds), ...m.options.filter(o => !holds(o))].map(o => ({ label: o.d.name, detail: `${placeText(argsOf(Rv, o), 'short')}${holds(o) ? '' : ' · no'}`, checked: o.key === m.option.key, run: () => { pick.value = o.key; } })), { cls: 'fx-pick' });
  }

  // A row: its label, its formula, and what the rows would give where an entry overrides them.
  // Read, until it's asked to be written (openAt): a click shows it, lit on the chart, and only a double-click or its
  // pencil gives a label to type over, a formula to type in, a grip and a way to delete it.
  function Row({ r, m, colors, editable }) {
    const write = editable && writable(m);
    const cls = 'fx-row' + (r.cited ? ' cited' : r.ink ? ' alt' : ' grey') + (r.gone ? ' gone' : '') + (editing.value?.key === r.key ? ' editing' : '') + (write ? ' editable' : '') + (reading.value === r.key ? ' reading' : '');
    const keep = r.gone, point = usePoint(() => !keep && preview(rowsChange({ ...draftOf(m.def.id), rows: draftOf(m.def.id).rows.map(x => x.key === r.key ? { ...x, gone: true } : x) }), 'row'),
      () => pending.peek()?.from === 'row' && previewDraft());
    const reorder = e => {
      const item = e.currentTarget.closest('.fx-row'), items = [...item.parentElement.querySelectorAll(':scope > .fx-row')];
      Shell.drag(e, { item, items, onDrop: (from, i) => change(m.def.id, rows => { const l = rows.slice(); l.splice(i, 0, l.splice(from, 1)[0]); return l; }) });
    };
    // A double-click by its count: the first click lights the row's names, which draws them anew under the pointer.
    const reads = write ? {} : { onClick: e => { if (e.detail > 1 && editable) openAt(r.key, { write: true }); else reading.value = reading.peek() === r.key ? null : r.key; } };
    // What it said, once it's typed over; and a figure its label says that it no longer has (W8: "more than 25%" over a rule at 20%).
    const was = draft.value?.def === m.def?.id && m.def?.id !== NEW ? kept(m.def.id).find(x => x.key === r.key)?.formula ?? null : null;
    const stale = was !== null && (r.label.match(/\d[\d.,]*\s*(?:%|per centum)?/g) ?? []).find(x => !r.formula.includes(x.replace(/\s*per centum/, '%').trim()) && was.includes(x.trim()));
    return html`<div class=${cls} data-key=${r.key} ...${reads}>
      ${write ? html`<span class="fx-grip" aria-hidden="true" onPointerDown=${reorder} />` : null}
      ${write ? html`<input class="bare fx-label" value=${r.label} size=${Math.max(2, r.label.length)} spellcheck="false" aria-label="Label"
          onInput=${e => change(m.def.id, rows => rows.map(x => x.key === r.key ? { ...x, label: e.target.value } : x))} />`
        : html`<span class="fx-label" title=${r.label.length > 28 ? r.label : null}>${r.label}</span>`}
      ${r.gone ? html`<div class="fx-cm gone">${r.formula}</div>` : html`<${Formula} row=${r} m=${m} colors=${colors} grey=${!r.ink} would=${wouldOf(m, r)} focus=${r.key === fresh} write=${write} />`}
      ${problem.value?.key === r.key ? html`<p class="fx-problem" role="alert">${problem.value.message}</p>` : null}
      ${was !== null && was !== r.formula && !r.gone ? html`<${Before} text=${was} now=${r.formula} />` : null}
      ${was !== null && was !== r.formula && !r.gone && r.label && r.label === kept(m.def.id).find(x => x.key === r.key)?.label ? html`<p class=${'fx-ask' + (stale ? ' stale' : '')}>${stale ? `The label says ${stale}; the formula doesn’t.` : 'Does the label still say it?'} <button class="lk" onClick=${e => { const el = e.currentTarget.closest('.fx-row').querySelector('input.fx-label'); el?.focus(); el?.select(); }}>${r.label}</button></p>` : null}
      ${write ? html`<button class="btn icon fx-x" aria-label=${keep ? 'Keep row' : 'Delete row'} data-tip=${keep ? 'Keep row' : 'Delete row'} ...${point}
          onClick=${() => change(m.def.id, rows => rows.map(x => x.key === r.key ? { ...x, gone: !x.gone } : x))}>${Shell.icon('x')}</button>`
        : editable ? html`<button class="btn icon fx-pencil" aria-label="Edit the formula" data-tip="Edit the formula" onClick=${e => { e.stopPropagation(); openAt(r.key, { write: true }); }}>${Shell.icon('Pencil')}</button>` : null}
    </div>`;
  }
  // What the rows would give where an entry overrides them, after the cited row: "C Corporation" beside the
  // entered election.
  function wouldOf(m, r) {
    const v = m.covered?.value;
    if (!r.cited || !m.covered || m.covered.agrees || v === null || v === undefined) return null;
    if (Formulas.isError(v)) return html`<span class="err">${v.code}</span>`;
    if ('tag' in m.rec) return html`<span class=${'tag fx ' + (v ? 'yes' : 'no')} />`;
    return html`<span class="fx">${v?.t === 'date' ? Tree.formatDate(v.iso) : typeof v === 'number' ? Tree.format(m.rec.field, v) : String(v)}</span>`;
  }
  // A new row, at the end, with the cursor in it.
  let fresh = null;
  function addRow(m) {
    fresh = newKey();
    change(m.def.id, rows => [...rows, { key: fresh, label: '', formula: '= ' }]);
  }

  // ---- Find's "=": a formula worked out at the selection ----
  // A number reads as a percentage where the formula names a percentage, as SUM(Owners.Percentage) does.
  Shell.register('evaluate', (text, selection) => {
    const Rv = R.peek(), id = selection.find(k => Rv.records[k]) ?? null;
    const def = id && (Rv.computed[id]?.def ?? Rv.covered[id]?.def);
    const v = def ? Formulas.evaluateRow(Rv, def, text, id)?.value : Formulas.evaluateAt(Rv, text, id);
    if (Formulas.isError(v)) return { error: `${v.code} ${v.msg ?? ''}`.trim() };
    const list = [v].flat(Infinity);
    if (Array.isArray(v) && list.length && list.every(x => x?.t === 'rec' && x.id))
      return { items: list.map(x => ({ label: show(x), detail: Rv.records[x.id]?.kind ?? '', run: () => Shell.select([x.id]) })) };
    const percents = new Set([...Object.values(Rv.records).filter(r => r.field === 'percent').map(r => norm(r.edge)),
      ...App.definitions.peek().filter(d => d.datatype === 'percent').map(d => norm(d.name))]);
    let names = [];
    try { names = Formulas.tokenize(Formulas.splitFormula(text).body).filter(t => t.k === 'name').map(t => norm(t.v)); } catch {}
    return { value: show(v, /%/.test(text) || names.some(n => percents.has(n))) };
  });

  // What needs attention (Formulas.attention's items), in its words and where, as the status bar's lists say it: what
  // it is, whose, and its figure where it has one. A check failed by what failed ("Ownership Adds Up", Fund III,
  // "101.6%, not 100%"); a date by what falls due, whose and its day, as the Dates table says it ("Annual Tax Due",
  // "AIV-1, tax year 2025", "Jun 1, 2026"); a blank by the entry missing and whose; an error by its definition, where,
  // and its code. Where it's at a relation, `who`, whose it first is: so what's one problem, one check failing at one
  // person's relations, lists as one. `Rv` and `n`, a working-out and notes other than those shown (History's replays).
  // → { what, where, figure, who? }
  function needOf({ kind, id, edge, error, by }, Rv = R.peek(), n = N()) {
    const recs = Rv.records, r = recs[id];
    const whose = x => recs[x] ? Time.whose(recs, x, n) : '';
    const named = defOfRecord(Rv, null, error?.def)?.name ?? error?.error.code;
    // A rule in error is said as itself, not by each record it couldn't work out: what's one problem lists as one.
    if (error?.rule) return { what: named, where: error.error.msg, figure: error.error.code };
    if (error) return { what: named, where: error.args ? placeText(argsOf(Rv, error, null), 'short') : whose(error.at), figure: error.error.code, ...(['#NAME?', '#CIRCULAR!', '#OPTION?'].includes(error.error.code) && { who: error.error.msg }) };
    if (!r) return { what: edge ?? '', where: '', figure: '' };
    // (Which rule can't say for want of it, where one can't.)
    if (kind === 'blank') return { what: edge, where: whose(id), figure: by ? `${defOfRecord(Rv, null, by.def)?.name ?? ''} can’t say` : '' };
    // What's typed over a rule, whose, what the rule says, and why, until when.
    if (kind === 'overrides') {
      const o = Rv === R.peek() ? App.overOf(id) : null;
      return { what: n.nameOf(recs, id), where: [r.args ? n.segmentOf(recs, id) : whose(r.at), o?.why].filter(Boolean).join(' · '), figure: `${Tree.outputText(r)}; the rule ${App.ruleSaid(id, Rv)}${o?.until ? `, until ${Tree.formatDate(o.until, 'short')}` : ''}` };
    }
    const where = r.args ? n.segmentOf(recs, id) : whose(r.at), rel = r.args ? r : recs[r.at]?.args ? recs[r.at] : null, t = rel && Tree.treeOf(recs, r.args ? id : r.at), first = t && n.edges(t)[0];
    const side = first && rel.args.find(a => Tree.same(a.edge, first)), who = side ? n.shortOf(recs, Tree.objectOf(recs, side.at)) : undefined;
    if (kind === 'overdue' || kind === 'soon') return { what: n.nameOf(recs, id), where, figure: Tree.formatDate(r.value, 'short'), who };
    const failed = notsOf(Rv, id)?.failed.find(f => f.then || f.not);
    return { what: n.nameOf(recs, id), where, figure: failed?.then ?? (failed?.not ? `not ${failed.not.text}` : r.tag === false ? 'No' : ''), who };
  }
  Shell.register('needs', needOf);

  Shell.register('formulabar', Bar);
  // What the chevron and its key will do, said as it will do it.
  const toggled = shut => shut ? 'Expand formula bar' : 'Collapse formula bar';
  Shell.register('action', { id: 'formulas', get name() { return toggled(!open.peek()); }, keys: '$mod+Shift+KeyU', run: toggleKeys });
  Shell.register('action', { id: 'why', name: 'Why does this hold?', names: ['Why', 'Reason', 'Explain', 'How is this worked out', 'Help'], keys: 'F1', inputs: true, run: whyHere });

  // ---- What's between two records, asked ----
  // Two objects, in plain text, for the panel (see betweenIn): { a, b, holds: [{ key, id, def, name, from, to, computed,
  // figure, chain, sentence, runs }], not: [{ key, id, def, name, from, to, sentence, runs }] }. Asked with the rows
  // open on one of them, by its line's key (pickLine).
  const between = (a, b) => betweenIn(R.value, a, b);
  const pickLine = key => { pick.value = key; open.value = true; };
  // Why isn't X here: a list of a record's computed relatives, by the relation its items are in, and who could be on it:
  // a search of every object a rule of that relation could say it of, but those on it. Picked, the two are selected,
  // with that relation open, saying why not.
  const isntKept = new WeakMap();
  function isntHere(id, relation, side) {
    const Rv = R.peek(), recs = Rv.records, def = Rv.computed[relation]?.def, d = defOf(def), memo = isntKept.get(Rv) ?? isntKept.set(Rv, new Map()).get(Rv), k = `${id}|${def}|${side}`;
    if (!d || d.edges.length !== 2) return [];
    if (memo.has(k)) return memo.get(k);
    const other = d.edges.find(e => !Tree.same(e, side)), on = new Set(nearOf(Rv, id, id).filter(r => Rv.computed[r]?.def === def && recs[r].tag !== false).flatMap(r => recs[r].args.map(g => Tree.objectOf(recs, g.at))));
    const items = Object.keys(recs).filter(x => isObj(recs[x]) && !Tree.isView(recs[x]) && x !== id && !on.has(x) && Formulas.evaluateRow(Rv, def, 0, { [side]: x, [other]: id }))
      .map(x => ({ label: nameOf(Rv, x), names: [N().shortOf(recs, x)], run: () => {
        const [a, b] = Tree.same(d.edges[0], side) ? [x, id] : [id, x];
        Shell.select([x, id]);
        pickLine(`${def}|${a}|${b}`);
      } }));
    memo.set(k, items);
    return items;
  }
  const whyIsnt = (anchor, id, relation, side) => Shell.menu(anchor, isntHere(id, relation, side), { search: true });
  // By definition and side, the kinds of what a formula gives there.
  const sidesKept = new WeakMap();
  const sidesOf = Rv => { let m = sidesKept.get(Rv); if (m) return m; sidesKept.set(Rv, m = new Map()); const recs = Rv.records; for (const id in Rv.computed) { const r = recs[id]; if (r?.args?.length !== 2 || r.tag === false) continue; for (const a of r.args) { const k = `${Rv.computed[id].def}|${norm(a.edge)}`; (m.get(k) ?? m.set(k, new Set()).get(k)).add(recs[Tree.objectOf(recs, a.at)]?.kind); } } return m; };
  // The lists a formula could give a record that it gives it none of (dendra.md, Silence): each by its name, with who could be on it, which
  // Why isn't… opens to. So a question with no one for its answer is answered: "Controllers: none". → [{ name, def, side }]
  function emptyLists(id, have) {
    const Rv = R.value, recs = Rv.records, n = N(), t = isObj(recs[id]) && !Tree.isView(recs[id]) ? Tree.treeOf(recs, id) : null, out = [];
    if (!t) return out;
    // (A list a record of its kind has somewhere: an entity's Controllers, not an individual's.)
    const kinds = sidesOf(Rv);
    for (const d of defs.value.values()) {
      if (d.id === NEW || d.edges?.length !== 2 || !d.isRelation) continue;
      const p = noteOf(d.id)?.pattern;
      if (!p?.args) continue;
      for (const mine of d.edges) {
        const loc = p.args.find(a => Tree.same(a.edge, mine))?.loc, other = d.edges.find(e => !Tree.same(e, mine));
        if (!loc || !other || !Tree.narrower(t, loc) || !kinds.get(`${d.id}|${norm(mine)}`)?.has(recs[id].kind)) continue;
        // (What a rule gives one or two things only is said of the rest in its own words: notOn.)
        if (d.type === 'tag' && Tree.same(mine, d.edges[0]) && Formulas.sideObjects(Rv, d.id, d.edges[1]).length <= FEW) continue;
        const name = n.listName(p, other);
        if (!have.some(h => Tree.same(h, name)) && !out.some(x => Tree.same(x.name, name))) out.push({ name, def: d.id, side: other });
      }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }
  // Who could be on such a list, as Why isn't… on this list? asks of a list with some on it.
  function isntOn(anchor, id, def, side) {
    const Rv = R.peek(), recs = Rv.records, d = defOf(def), other = d?.edges.find(e => !Tree.same(e, side));
    if (!d) return;
    const items = Object.keys(recs).filter(x => isObj(recs[x]) && !Tree.isView(recs[x]) && x !== id && Formulas.evaluateRow(Rv, def, 0, { [side]: x, [other]: id })).map(x => ({ label: nameOf(Rv, x), names: [N().shortOf(recs, x)], run: () => {
      const [a, b] = Tree.same(d.edges[0], side) ? [x, id] : [id, x];
      Shell.select([x, id]);
      pickLine(`${def}|${a}|${b}`);
    } }));
    if (items.length) Shell.menu(anchor, items, { search: true });
    else Shell.toast(`Nothing here could be on it`);
  }
  // Find takes two names: "Fund III Tessellate" selects them both, whose panel and bar say what's between them.
  // Each name is an object's, its name or short name, or the fewest words its name begins with or has.
  function namedIn(q) {
    const st = App.state.peek(), n = N(), words = norm(q).split(' ').filter(Boolean);
    if (words.length < 2) return [];
    const related = Tree.index(st).relations;
    const objects = Object.keys(st).filter(id => isObj(st[id]) && !Tree.isView(st[id])).map(id => ({ id, ties: related.get(id)?.length ?? 0, names: [n.shortOf(st, id), n.nameOf(st, id)].map(x => norm(x).replace(/^the /, '')) }));
    // Its name, what its name begins with, or words its name has; between equals, the one with the most relations.
    const best = part => { const t = part.join(' '), w = ` ${t} `, score = ({ names }) => names.includes(t) ? 0 : names.some(x => x.startsWith(`${t} `)) ? 1 : names.some(x => ` ${x} `.includes(w)) ? 2 : 3;
      return objects.map(o => [score(o), o.ties, o]).filter(x => x[0] < 3).sort((a, b) => a[0] - b[0] || b[1] - a[1])[0]; };
    if ((best(words)?.[0] ?? 3) < 2) return [];   // one name, already
    let pair = null;
    for (let i = 1; i < words.length; i++) {
      const a = best(words.slice(0, i)), b = best(words.slice(i));
      if (a && b && a[2].id !== b[2].id && (!pair || a[0] + b[0] < pair[0])) pair = [a[0] + b[0], a[2].id, b[2].id];
    }
    if (!pair) return [];
    // Said of the first, as a list of it is, so what names a thing or its list comes first: "Manager close" is the
    // Manager's Close Affiliate Of before it's the Manager and an analysis called Close and Remote.
    const [, a, b] = pair;
    return [{ of: a, pair: true, label: `${n.shortOf(st, a)} and ${n.shortOf(st, b)}`, names: [`${n.nameOf(st, a)} and ${n.nameOf(st, b)}`], run: () => Shell.select([a, b]) }];
  }
  Shell.register('find', { items: q => q ? namedIn(q) : [] });

  // A rule limited to what a condition holds of: each row under it, in the bar, as any edit is; it says both yes and no where the
  // condition holds, so elsewhere it hasn't tested a record, and reads n/a (dendra.md, Not tested).
  function limit(def, cond) {
    const under = r => { const f = Formulas.splitFormula(r.formula), body = f.body.trim(); return { ...r, formula: f.kind === 'implies' ? `← ${cond} AND (${body})` : `= IF(${cond}, ${body})` }; };
    batch(() => { writing.value = def; wanted.value = true; change(def, rows => rows.map(r => r.gone ? r : under(r))); });
  }
  // What a rule of few other sides says of a record that it isn't on, as its panel says the yes: a relation a formula gives to one
  // or two things only (the BDC), stated of everything it could be said of: "Not a close affiliate of the BDC". Clicked, why not.
  const FEW = 2;
  function notOn(id) {
    const Rv = R.value, recs = Rv.records, out = [];
    if (!isObj(recs[id]) || Tree.isView(recs[id])) return out;
    for (const d of defs.value.values()) {
      if (d.type !== 'tag' || d.edges?.length !== 2 || d.id === NEW) continue;
      const others = Formulas.sideObjects(Rv, d.id, d.edges[1]), t = noteOf(d.id)?.pattern;
      if (!t || !others.length || others.length > FEW) continue;
      for (const o of others) {
        const at = { [d.edges[0]]: id, [d.edges[1]]: o };
        if (o === id || pairsOf(Rv, id, o).has(`${d.id}|${id}|${o}`) || !Formulas.evaluateRow(Rv, d.id, 0, at)) continue;
        const [, words] = phrase(t, d.edges[0], d.edges[1], { not: true }), key = `${d.id}|${id}|${o}`, s = N().shortOf(recs, o);
        out.push({ key, label: `${upper(words.trim().replace(/^is /, ''))} ${s.replace(/^The /, 'the ')}`, run: () => { Shell.select([id, o]); pickLine(key); } });
      }
    }
    return out;
  }
  // What `=` and `←` say, pointed at.
  const startSaid = kind => kind === 'implies' ? '← implied by: yes where what follows holds, and says nothing elsewhere' : '= gives what follows, yes or no or a value';
  Shell.register('broken', Broken);
  return { preview, commit, edit: change, commitEdit: commitDraft, discard, back, flipped, reaching, point: pointAt, focus: openAt, define, into, light: ids => { lit.value = ids; },
    reason, citeOf, phrase, sentence: sentenceFor, sentenceIn, because, between, pickLine, isntHere, whyIsnt, emptyLists, isntOn, model, finder, pending, draft, hover, open, saying, brokenSaid, startSaid, limit, notOn, blankSaid, nobody };
})();
