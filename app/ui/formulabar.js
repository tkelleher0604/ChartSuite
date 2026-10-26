// The formula bar (dendra.md, Part 2): one row that never changes height, as Excel's doesn't. It names the
// selection, or the view when nothing is, with its output and, inline, why: the facts that gave it as a
// sentence ("… so it is a remote affiliate of the BDC (§57(e)(1)(A))"), cut short where it doesn't fit. Each
// name in the row of its definition that gave it takes a colour, and what it means here is outlined on the
// chart in that colour; deeper reasons in the same hue, lighter, down to entered records (Range Finder).
// Hovering part of a formula shows its value. Clicking a fact, or a lit computed line, steps down to its
// reason, by the clause the parent cited, and the breadcrumb steps back. The definition's rows drop over the
// view under the sentence (the chevron, Ctrl+Shift+U, or a click on the sentence) until the selection changes,
// clear of what they're about: those that hold in ink, the rest grey. Two objects show the most derived
// relation that holds between them; one picked that doesn't shows its rows, all grey (why not). Any pending
// change is redlined before it's made, whoever asks (FormulaBar.preview). It also answers Find's "=", and gives
// the other panes a record's reason, and a relation's words.
const FormulaBar = (() => {
  const { html, signal, computed, effect, on, emit } = Shell;
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
  const defs = computed(() => new Map(App.definitions.value.map(d => [d.id, { ...d, isRelation: (d.edges?.length ?? 0) > 1 }])));
  const defOf = id => id ? defs.peek().get(id) : undefined;
  const defOfRecord = (Rv, id) => defOf(Rv.computed[id]?.def ?? Rv.covered[id]?.def);
  const noteOf = id => N().notes('Formula').find(n => n.note === id && !n.view);
  // A definition's rows as kept, each keyed by its place.
  const kept = def => (defOf(def)?.rows ?? []).map((r, i) => ({ key: 'r' + i, label: r.label, formula: r.formula }));
  const errorOf = (Rv, id) => Rv.errors.find(e => e.id === id);
  const argKey = args => args.map(a => `${norm(a.edge)}=${a.at}`).sort().join('&');
  // How records read here: an object by its Name; anything else as a step on its path.
  const nameOf = (Rv, id) => { const r = Rv.records[id]; return !r ? '—' : isObj(r) ? N().nameOf(Rv.records, id) : N().segmentOf(Rv.records, id); };
  // Grounds are worked out on demand; each, once per working-out.
  const grounds = new WeakMap();
  function groundOf(Rv, id) {
    if (!grounds.has(Rv)) grounds.set(Rv, new Map());
    const memo = grounds.get(Rv);
    if (!memo.has(id)) { let g = null; try { g = Formulas.ground(Rv, id); } catch {} memo.set(id, g?.rows?.length ? g : null); }
    return memo.get(id);
  }
  // A record's reason: the row of its ground with the clause its parent cited (Affiliated Person's (C), where
  // Close Affiliate reads `.[(C)]`), or else the ground's own.
  function reasonOf(Rv, id, clause) {
    const g = groundOf(Rv, id);
    return g && ((clause && g.rows.find(r => Tree.same(r.label, clause))) || g.rows[0]);
  }
  // The clause a row cites of a record it reads: a label of that record's rows, after a dot, just after the part.
  function clauseOf(Rv, id, text, p) {
    const m = /^\s*\.\s*(?:\[([^\]]+)\]|([A-Za-z_]\w*))/.exec(String(text ?? '').slice(p.to)), c = m && (m[1] ?? m[2]);
    return c && defOfRecord(Rv, id)?.rows.some(r => Tree.same(r.label, c)) ? c : null;
  }
  // A definition's own screen is the inspector's, for its pattern in general.
  const openDef = id => { const n = noteOf(id); if (n) Shell.select([Shell.general(n.pattern)]); };

  // ---- What the bar is about ----
  const asked = signal(null);     // { id, clause, under }: a record asked about, while the selection is still `under`
  const editing = signal(null);   // { cm, key, subject } while a row is edited: the bar holds still
  const draft = signal(null);     // { def, rows: [{ key, label, formula, gone? }] }: a definition being edited
  const open = signal(false);     // the rows dropped over the view, as Excel's expanded bar
  const pick = signal(null);      // for two objects, the relation shown
  const hover = signal(null);     // { key, from, to }: the part of a row under the pointer
  const touch = signal(null);     // the records of a fact under the pointer, in the sentence that says why
  const trail = signal([]);       // [{ id, title, clause }]: the records stepped down from, for the breadcrumb
  const aim = signal(null);       // a row to put the cursor in, by its key
  on('why-open', id => { asked.value = { id, clause: finder.peek().via.get(id) ?? null, under: Shell.selection.peek() }; });

  const subject = computed(() => {
    const ed = editing.value;
    if (ed) return ed.subject;
    const Rv = R.value, a = asked.value, keys = Shell.selection.value;
    if (a?.under === keys && (Rv.records[a.id] || errorOf(Rv, a.id))) return { id: a.id, clause: a.clause };
    const p = keys.length === 1 && Shell.pattern(keys[0]), def = p && App.notes.value.resolve('Formula', p)?.note;
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

  // Records between two objects that a definition covers, by definition and objects in its edges' order.
  const pairs = computed(() => {
    const Rv = R.value, out = new Map();
    for (const [id, r] of Object.entries(Rv.records)) if (r.args?.length === 2) {
      const def = Rv.computed[id]?.def ?? Rv.covered[id]?.def, d = def && defOf(def);
      if (!d) continue;
      const by = new Map(r.args.map(a => [norm(a.edge), Tree.objectOf(Rv.records, a.at)]));
      out.set(`${def}|${d.edges.map(e => by.get(norm(e))).join('|')}`, id);
    }
    return out;
  });

  // ---- The model: what the bar shows for its subject ----
  const model = computed(() => describe(subject.value, R.value, draft.value, pick.value));

  function describe(s, Rv, dr, pk) {
    if (!s) return null;
    if (s.pair) return describePair(s, Rv, dr, pk);
    if (s.general) {
      // A definition in general: worked out, for its names, at one of the records it gives.
      const P = defOf(s.general);
      if (!P) return null;
      const m = { id: null, def: P, general: true, title: P.name, place: '', at: Object.keys(Rv.computed).find(k => Rv.computed[k].def === P.id) ?? null };
      m.rows = rowsOf(m, Rv, dr);
      return m;
    }
    const id = s.id, rec = Rv.records[id], err = !rec && errorOf(Rv, id);
    if (isObj(rec)) return { id, object: true, title: nameOf(Rv, id), place: rec.kind, rows: [] };
    const said = Rv.computed[id] ?? Rv.covered[id] ?? null, spot = rec ?? err;
    const P = defOf(said?.def ?? err?.def) ?? null;
    const at = rec ? id : err.args ? Object.fromEntries(err.args.map(a => [a.edge, Tree.objectOf(Rv.records, a.at) ?? a.at])) : err.at;
    const m = { id, rec, err, def: P, at, said, clause: s.clause ?? null, computed: !!Rv.computed[id], covered: Rv.covered[id] ?? null,
      title: P?.name ?? (rec?.args ? N().nameOf(Rv.records, id) : spot.edge), ...argsOf(Rv, spot, P, id) };
    m.out = err ? { error: err.error } : outputOf(rec);
    m.rows = rowsOf(m, Rv, dr);
    return m;
  }

  // Where a record is, said as far as it needs: its object, or the path down to it where the object has another
  // record of its label (a file number at its jurisdiction and one elsewhere). Counted once per working-out.
  const labelled = new WeakMap();
  function whereOf(Rv, id) {
    const recs = Rv.records, at = recs[id].at, O = Tree.objectOf(recs, at), key = x => `${Tree.objectOf(recs, x)}|${norm(recs[x].edge)}`;
    if (!isObj(recs[O]) || at === O) return N().placeOf(recs, at);
    if (!labelled.has(Rv)) {
      const n = new Map();
      for (const x in recs) if (!isObj(recs[x]) && !recs[x].args) n.set(key(x), (n.get(key(x)) ?? 0) + 1);
      labelled.set(Rv, n);
    }
    return labelled.get(Rv).get(key(id)) > 1 ? N().placeOf(recs, at) : N().shortOf(recs, O);
  }

  // Two objects: the computed relations they could be in, each way round. The one picked shows as its record
  // if they're in it, or else as its rows at the pair, all grey (why not). Unpicked, it's the most derived one
  // that holds, a tag before a value, the first selected first: the pension is a remote affiliate of the BDC,
  // and here's why. Where none holds, nothing.
  function describePair(s, Rv, dr, pk) {
    const options = [];
    for (const def of Rv.order.flat()) {
      const d = defOf(def);
      if (!d?.isRelation || Rv.defErrors[def] || d.edges.length !== 2) continue;
      for (const [a, b] of [s.pair, [s.pair[1], s.pair[0]]]) {
        const at = { [d.edges[0]]: a, [d.edges[1]]: b };
        if (!Formulas.evaluateRow(Rv, def, 0, at)) continue;
        const id = pairs.value.get(`${def}|${a}|${b}`) ?? null;
        options.push({ key: `${def}|${a}|${b}`, d, at, a, b, id, on: id ? Rv.records[id].tag : null });
      }
    }
    const held = options.filter(x => x.id && x.on !== false), first = l => l.findLast(x => x.a === s.pair[0]) ?? l.at(-1);
    const o = options.find(x => x.key === pk) ?? first(held.filter(x => x.on === true)) ?? first(held);
    if (!o) return null;
    const m = o.id ? describe({ id: o.id }, Rv, dr) : {
      id: null, def: o.d, at: o.at, absent: true, title: o.d.name, out: { tag: null },
      args: o.d.edges.map((e, i) => ({ edge: e, id: i ? o.b : o.a, ...namesOf(Rv, i ? o.b : o.a) })),
    };
    if (!o.id) m.rows = rowsOf(m, Rv, dr);
    return { ...m, options, option: o };
  }

  function argsOf(Rv, r, P, id) {
    if (!r.args) return { place: whereOf(Rv, id) };
    const by = new Map(r.args.map(a => [norm(a.edge), a.at]));
    return { args: (P?.edges ?? r.args.map(a => a.edge)).map(e => {
      const o = Tree.objectOf(Rv.records, by.get(norm(e))) ?? by.get(norm(e));
      return { edge: e, id: o, ...namesOf(Rv, o) };
    }) };
  }
  // An argument by its name, and by its Short Name, which the bar's one row has room for.
  const namesOf = (Rv, id) => ({ name: nameOf(Rv, id), short: isObj(Rv.records[id]) ? N().shortOf(Rv.records, id) : nameOf(Rv, id) });
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
    const lit = m.rows.filter(r => ed ? r.key === ed.key : r.cited || hv?.key === r.key);
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
      g.parts.forEach(walk);
    }
    if (m.err) {
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
    const down = k < 0 && !!m?.computed && last.map.has(m.id);
    hover.value = null; pick.value = null;
    if (draft.peek()) { draft.value = null; preview(null); }
    trail.value = k >= 0 ? t.slice(0, k) : down ? [...t, last.crumb] : [];
    last = { key, map: finder.peek().map, crumb: m && { id: m.id, title: m.title, clause: m.clause, place: m.args?.map(a => a.short).join(' → ') ?? m.place } };
    if (down || k >= 0) {
      const ids = [m.id, ...last.map.keys()];
      requestAnimationFrame(() => { Shell.parts.peek().canvas?.zoomTo?.(ids); clear(); });
    }
  });
  // The rows close when the selection changes, unless a row is being edited.
  on('select', () => { if (!editing.peek()) open.value = false; });
  // Back to a record on the breadcrumb, the last by default.
  function back(i = trail.peek().length - 1) {
    const to = trail.peek()[i];
    if (to) asked.value = { id: to.id, clause: to.clause, under: Shell.selection.peek() };
  }

  // ---- Why, in words: the facts that fired, as a sentence ----
  // The ground said as a lawyer would say it. Each record it reads is a fact in the chart's words ("Northstar
  // is an owner of the BDC with a voting percentage of 7%"), and what they give follows with "so" and the
  // clause that gave it ("so it is an affiliated person (§2(a)(3)(A))"). A computed reason that's the only one
  // among its facts unfolds into its own, a level down; any other is said with its clause, and a click steps
  // down into it. A row comparing with a number says the number: (5% or more).
  // Words: a term in lower case mid-sentence, names kept (BDC, Form PF); "a" or "an"; one of a list (Owners →
  // owner); and whether an object is a person, whom "it" doesn't name.
  const lower = s => String(s).replace(/\b[A-Z][a-z]+\b(?!\s+(?:[A-Z]{1,4}|\d+)\b)/g, w => w.toLowerCase());
  const article = w => /^[aeiou]/i.test(w) ? 'an' : 'a';
  const singular = w => [w.replace(/ies$/, 'y'), w.replace(/es$/, ''), w.replace(/s$/, '')].find(x => x !== w && Tree.same(Tree.plural(x), w)) ?? w;
  const isPerson = (Rv, id) => /individual|person/i.test(Rv.records[id]?.kind ?? '');
  // A clause's citation: the section its Description starts with ("Section 2(a)(3): …") and the row's label,
  // (A) reading §2(a)(3)(A), and (e)(1)(A) under 57(e) §57(e)(1)(A); a label of words follows the section.
  function citeOf(def, label) {
    const n = noteOf(def), lead = n ? String(N().description(n.pattern) ?? '').split('\n')[0] : '', l = Tree.clean(label);
    const sec = /^(?:Section|§)\s*(\d[\w.]*)((?:\([^)\s]+\))*)/i.exec(lead);
    if (l.includes('§')) return /§\s*\d[\w.]*(?:\([^)\s]+\))*/.exec(l)?.[0] ?? l;
    if (!sec) return l || null;
    const groups = s => s.match(/\([^)]+\)/g) ?? [], own = /^(?:\([^)\s]+\))+/.exec(l);
    if (!own) { const head = l.split(':')[0]; return `§${sec[1]}${sec[2]}${head ? `, ${head[0].toLowerCase()}${head.slice(1)}` : ''}`; }
    const a = groups(sec[2]), b = groups(own[0]);
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
  // The one row that decided a computed record, the one its sentence cites (its ground's holding row of least
  // stage): its label, its citation, and the statute's words for it, where the Description gives them.
  function reason(id) {
    const Rv = R.value, c = Rv.computed[id];
    if (!c) return null;
    const label = reasonOf(Rv, id)?.label ?? c.label ?? '';
    return { label, cite: citeOf(c.def, label), words: wordsOf(c.def, label) };
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

  // Words read as a predicate, and how they're said: a noun with "is a" (an investor in), a participle with
  // "is" (is evidenced by), a verb as it is (signs for). Without a preposition, only a verb of one word is one
  // (Concerns), and only where a relation's own name says it.
  function predicate(words, bare) {
    const w = Tree.clean(words), m = /^(.+?)\s+(of|in|for|to|by|with|from|on|at)$/i.exec(w) ?? (bare && /^[a-z]+[^s\W]s$/i.test(w) ? [w, w, ''] : null);
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
    const words = w.form === 'noun' ? ` is ${not ? 'not ' : ''}${article(w.head)} ${w.head}` : w.form === 'participle' ? ` is ${not ? 'not ' : ''}${w.head}`
      : not ? ` does not ${w.head.replace(/s\b/, '')}` : ` ${w.head}`;
    return w.flip && !choice ? [b, words + w.prep, a] : [a, words + w.prep, b];
  }

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
    const withs = reads.flatMap(e => { const x = recs[e]; return 'tag' in x ? [` ${x.tag ? 'with' : 'without'} ${lower(x.edge)}`] : [` with ${article(x.edge)} ${lower(x.edge)} of `, term(e, Tree.outputText(x))]; });
    if (r.args) {
      const [a, b, ...rest] = n.sides(recs, id), A = Tree.objectOf(recs, a.at), B = b && Tree.objectOf(recs, b.at), t = Tree.treeOf(recs, id);
      // Each side's list of the other: Holdings, and Owners.
      const theirs = t && b ? n.listName(t, a.edge) : a.edge, yes = r.tag !== false;
      const q = !B ? null : t ? predicateOf(t, a.edge, b.edge, { tag: 'tag' in r, name: n.nameOf(recs, id) }) : predicate(n.nameOf(recs, id), true);
      const p = q && !q.flip && !q.role ? q : null, flip = q?.flip ? q : null;
      const of = B ? [p?.form === 'noun' && !('field' in r) ? p.prep : ' of ', { name: B }] : [];
      c.post = [...rest.flatMap(x => [`, ${lower(x.edge)} `, { name: Tree.objectOf(recs, x.at) }]), ...(rest.length && withs.length ? [','] : []), ...withs];
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
      // A tag described as "A fund that …" is a noun: Fund III is a private fund. Any other is a condition, by
      // its name: Ownership Adds Up holds for Fund III.
      const noun = /^an?\s/i.test(n.description(Tree.treeOf(recs, id) ?? { args: [{ edge: r.edge, loc: {} }] }) ?? '');
      return Object.assign(c, noun ? { subj: O, pre: [be(r.tag), `${article(r.edge)} `, term(id, lower(r.edge))] }
        : { pre: [term(id, r.edge), holds(r.tag)], obj: isObj(o) ? [' for ', { name: O }] : [] });
    }
    const v = Tree.outputText(r), named = o && n.nameOf(recs, O);
    // An entry that names its object (a tax year's Year) says what the object is: the tax year is 2026.
    if (named && [v, String(r.value)].some(x => Tree.same(named, x))) return Object.assign(c, { pre: [`the ${lower(o.kind)}`, be(), term(id, named)] });
    // A date named for what was done on it says it was done then: it last filed on …; it filed its annual return on ….
    const done = r.field === 'date' && /^(?:(last|first) )?(?:(.+) )?(\S+ed|paid)(?: on)?$/i.exec(Tree.clean(r.edge));
    if (done) return Object.assign(c, { subj: O, pre: [` ${[would && 'would have', done[1]?.toLowerCase(), done[3].toLowerCase(), done[2] && `its ${lower(done[2])}`, 'on '].filter(Boolean).join(' ')}`, term(id, v)] });
    return Object.assign(c, { subj: O, poss: true, pre: [` ${lower(r.edge)}`, be(), term(id, v)] });
  }
  // What the subject is, as the sentence's last clause: a relation, or a tag, as a fact; a value by its name,
  // its object's where it has one: the Manager's Form ADV is due March 31, 2027; at a relation, as the bar
  // names its place: the annual tax is due June 1, 2027.
  function givenOf(Rv, id, would) {
    const recs = Rv.records, r = would ?? recs[id];
    if (r.args || 'tag' in r) return factOf(Rv, id, [], would);
    const name = defOfRecord(Rv, id)?.name ?? r.edge, due = /^(.*\S)\s+Due$/.exec(name), O = Tree.objectOf(recs, id);
    const what = lower(due?.[1] ?? name), is = (would ? ' would be' : /\b[a-z]+[^siu]s$/.test(what) ? ' are' : ' is') + (due ? ' due ' : ' ');
    const point = { term: Tree.outputText(r), id, fx: !!Rv.computed[id] || !!would };
    return isObj(recs[O]) ? { id, ids: [id], subj: O, poss: true, pre: [` ${what}`, is, point], obj: [], post: [] }
      : { id, ids: [id], subj: null, pre: [`the ${what}`, is, point], obj: [], post: [] };
  }
  // A record as its definition's rows give it, where an entry overrides them.
  const asGiven = (r, v) => 'tag' in r ? { ...r, tag: v } : 'choice' in r ? { ...r, choice: v } : { ...r, value: v?.t === 'date' ? v.iso : v };

  // A record's reasons as pieces, { join, c: clause, cite?, self? } or { text }: its facts, the one reason
  // unfolded (if `unfold`) last, then ", so" and what they give with its clause.
  function reasons(Rv, id, clause, unfold, top, would) {
    const g = reasonOf(Rv, id, clause), d = defOfRecord(Rv, id), recs = Rv.records;
    if (!g || !d) return null;
    // What the row reads as @, where that's a value (an entity's Entity Type), is a fact too. A default, a row
    // that reads nothing, gives because the rows before it gave nothing: its facts are what those rows read.
    const text = d.rows[g.row]?.formula ?? '', groups = new Map(), seen = new Set(), loc = recs[id].at, read = i => Formulas.evaluateRow(Rv, d.id, i, id)?.names ?? [];
    const at = loc && !isObj(recs[loc]) && read(g.row).some(n => text.slice(n.from, n.to) === '@' && n.ids.length === 1 && n.ids[0] === loc) ? [{ id: loc }] : [];
    const otherwise = !g.parts.length && g.row > 0;
    const parts = !otherwise ? [...at, ...g.parts] : d.rows.slice(0, g.row).flatMap((_, i) => read(i)).flatMap(x => x.ids.map(y => ({ id: y })));
    const walk = p => {
      const r = p.id && recs[p.id];
      if (r && !isObj(r) && !seen.has(p.id)) {
        seen.add(p.id);
        const host = !r.args && recs[r.at]?.args ? r.at : p.id;
        if (host !== id) {
          if (!groups.has(host)) groups.set(host, { host, reads: [], p });
          if (host === p.id) groups.get(host).p = p; else groups.get(host).reads.push(p.id);
        }
      }
      (p.items ?? []).forEach(walk);
    };
    parts.forEach(walk);
    const facts = [...groups.values()].map(x => {
      const cl = clauseOf(Rv, x.host, text, x.p), reason = !!Rv.computed[x.host] && 'tag' in recs[x.host] && !x.reads.length;
      const why = reason && reasonOf(Rv, x.host, cl);
      return { ...x, cl, reason, c: factOf(Rv, x.host, x.reads), cite: why ? citeOf(defOfRecord(Rv, x.host)?.id, why.label) : null };
    });
    const tags = facts.filter(f => f.reason), deeper = unfold && !otherwise && tags.length === 1 ? reasons(Rv, tags[0].host, tags[0].cl, false, false) : null;
    // The facts about one subject together; past three of a kind, the rest counted: and 38 more owners.
    const leaves = deeper ? facts.filter(f => f !== tags[0]) : facts, subjects = [...new Set(leaves.map(f => f.c.subj))], kinds = new Map();
    leaves.sort((x, y) => subjects.indexOf(x.c.subj) - subjects.indexOf(y.c.subj));
    const kindOf = f => { const r = recs[f.host], [a] = r.args ? N().sides(recs, f.host) : [], t = a && Tree.treeOf(recs, f.host);
      return a ? [`${N().nameOf(recs, f.host)}|${norm(a.edge)}`, lower(t ? N().listName(t, a.edge) : a.edge)] : [norm(r.edge), lower(Tree.plural(r.edge))]; };
    const shown = leaves.filter(f => { const [k, noun] = kindOf(f), x = kinds.get(k) ?? { n: 0, noun }; kinds.set(k, x); return x.n++ < 3; });
    const more = [...kinds.values()].filter(x => x.n > 3).map(x => `${x.n - 3} more ${x.noun}`);
    const out = shown.map((f, i) => ({ join: !i ? '' : i < shown.length - 1 || more.length || deeper ? ', ' : ' and ', c: f.c, cite: f.cite }));
    // The number compared with follows the fact that carries a number.
    const t = shown.length && thresholdOf(text), numeric = f => [f.host, ...f.reads].some(x => typeof recs[x].value === 'number');
    if (t) out[Math.max(0, shown.findLastIndex(numeric))].then = t;
    if (more.length) out.push({ text: ` and ${more.join(' and ')}` });
    if (deeper) out.push({ ...deeper[0], join: !shown.length ? '' : shown.length > 1 ? ', and ' : ' and ' }, ...deeper.slice(1));
    out.push({ join: out.length ? ', so ' : '', c: top ? givenOf(Rv, id, would) : factOf(Rv, id), cite: citeOf(d.id, g.label), self: top });
    return out;
  }
  // The pieces as runs, each clause said after the one before: the same subject again is "it" (a person is
  // named again), and after "and" isn't said, nor is "is" after a clause that ends at its object.
  function sentence(Rv, pieces) {
    const runs = [];
    let prev = null;
    for (const p of pieces ?? []) {
      if (p.text) { runs.push({ text: p.text }); continue; }
      if (p.join) runs.push({ text: p.join });
      const c = p.c, again = !!c.subj && c.subj === prev?.subj, and = !!p.join && p.join !== ', so ';
      const of = c.poss ? [/s$/.test(N().shortOf(Rv.records, c.subj)) ? '’' : '’s'] : [];
      let subj = !c.subj ? [] : again && !isPerson(Rv, c.subj) ? [c.poss ? 'its' : 'it'] : [{ name: c.subj }, ...of], pre = c.pre;
      if (again && and && !c.poss && !prev.poss) {
        subj = [];
        pre = pre[0] === ' is ' && prev.pre[0] === ' is ' && !prev.post.length ? pre.slice(1) : [String(pre[0]).trimStart(), ...pre.slice(1)];
      }
      runs.push({ fact: c, self: !!p.self, segs: [...subj, ...pre, ...c.obj, ...c.post].filter(s => s !== '') });
      if (p.cite) runs.push({ cite: p.cite });
      if (p.then) runs.push({ text: ` (${p.then})` });
      prev = c;
    }
    return runs.length ? runs : null;
  }
  // The subject's reasons said in full, and a level shallower for the bar's one row: why the rows give it, or
  // where an entry overrides them, what they would give and why. None for a record no row gives, or while its
  // definition's rows are being edited.
  const why = computed(() => {
    const m = model.value, Rv = R.value, dr = draft.value, v = m?.covered?.value;
    if (!(m?.computed || m?.covered) || !m.rec || m.err || !m.def || dr?.def === m.def.id) return null;
    if (m.covered && (v === null || v === undefined || Formulas.isError(v))) return null;
    const would = m.covered && !m.covered.agrees ? asGiven(m.rec, v) : null;
    try {
      const full = sentence(Rv, reasons(Rv, m.id, m.clause, true, true, would));
      return full && { full, short: sentence(Rv, reasons(Rv, m.id, m.clause, false, true, would)) };
    } catch { return null; }
  });
  // A fact clicked: a computed one steps down into its reasons, by the clause that cited it; an entered one is
  // selected.
  function stepTo(c) {
    touch.value = null;
    if (R.peek().computed[c.id]) asked.value = { id: c.id, clause: finder.peek().via.get(c.id) ?? null, under: Shell.selection.peek() };
    else Shell.select([c.id]);
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
    const run = () => { const t = performance.now(); pending.value = { change, from, ...hypothetical(change) }; slow = performance.now() - t; };
    // A big chart waits for a pause in typing: a change that replaces the one shown from the same place. A
    // hover, or the first key, shows at once.
    if (slow < 40 || pending.peek()?.from !== from) run(); else timer = setTimeout(run, 300);
  }

  // The state as the change would leave it, and what would appear, go and change, per definition.
  function hypothetical(change) {
    let entered = App.entered.peek(), ds = App.definitions.peek();
    if (change.records) {
      entered = { ...entered };
      const gone = Object.keys(change.records).filter(id => change.records[id] === null && entered[id]);
      if (gone.length) for (const id of Tree.dependents(entered, gone)) delete entered[id];
      for (const [id, r] of Object.entries(change.records)) if (r) entered[id] = r;
    }
    if (change.rows) ds = ds.flatMap(d => !(d.id in change.rows) ? [d] : change.rows[d.id] ? [{ ...d, rows: change.rows[d.id] }] : []);
    const before = R.peek();
    const R2 = Formulas.computeState(entered, ds, { relations: App.relations.peek(), schema: App.schema.peek() }), diff = Formulas.diff(before, R2);
    return { R2, diff, deltas: deltasOf(diff, before, R2) };
  }
  // Per definition, the records it would attest or give more, fewer, and with another value. A record at one
  // that comes or goes comes or goes with it, and isn't counted again: a tax paid is one Annual Tax fewer, not
  // its due date and amount too.
  function deltasOf(d, A, B) {
    const by = new Map(), name = (X, id) => { const def = X.computed[id]?.def ?? X.covered[id]?.def; return def && defOf(def)?.name; };
    const bump = (n, k) => { if (!n) return; if (!by.has(n)) by.set(n, { name: n, plus: 0, minus: 0, changed: 0 }); by.get(n)[k]++; };
    const counts = r => !('tag' in r) || r.tag === true;
    const tops = (ids, X) => { const all = new Set(ids); return ids.filter(id => !all.has(X.records[id]?.at) && !(X.records[id]?.args ?? []).some(a => all.has(a.at))); };
    for (const id of tops(d.appear, B)) if (counts(B.records[id])) bump(name(B, id), 'plus');
    for (const id of tops(d.go, A)) if (counts(A.records[id])) bump(name(A, id), 'minus');
    for (const id of d.change) { const a = A.records[id], b = B.records[id]; bump(name(B, id) ?? name(A, id), 'tag' in a ? (b.tag ? 'plus' : 'minus') : 'changed'); }
    return [...by.values()].sort((x, y) => (y.plus + y.minus + y.changed) - (x.plus + x.minus + x.changed));
  }
  effect(() => {
    const p = pending.value, canvas = Shell.parts.peek().canvas;
    if (!p) return canvas?.redline(null);
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

  // A change made: records entered, set or removed, and definitions' rows.
  function commit(change, say) {
    const entered = App.entered.peek();
    return App.change(tx => {
      for (const [id, r] of Object.entries(change.records ?? {})) {
        if (r === null) { tx.remove(id); continue; }
        const { computed: _, ...rec } = r;
        if (entered[id]) tx.set(id, rec); else tx.add('record', rec);
      }
      for (const [def, rows] of Object.entries(change.rows ?? {})) {
        const n = noteOf(def);
        if (rows === null) tx.remove(def);
        else tx.note('Formula', n.pattern, rows.map(r => ({ label: r.label.trim(), formula: Formulas.tidyArrow(r.formula).trim() })));
      }
    }, { say });
  }

  // ---- Editing a definition: a draft of its rows, redlined as it changes ----
  const draftOf = def => { const d = draft.peek(); return d?.def === def ? d : { def, rows: kept(def) }; };
  const rowsChange = d => ({ rows: { [d.def]: d.rows.filter(r => !r.gone).map(({ label, formula }) => ({ label, formula })) } });
  const unchanged = d => JSON.stringify(rowsChange(d).rows[d.def]) === JSON.stringify(kept(d.def).map(({ label, formula }) => ({ label, formula })));
  // A row that doesn't read yet, and its first problem.
  const unread = d => { for (const r of d.rows) { const p = !r.gone && Formulas.check(r.formula).problems[0]; if (p) return { key: r.key, ...p }; } return null; };
  const problem = signal(null);   // { key, message }: why a row can't be committed, said once Enter asks
  function change(def, fn) {
    claimed = true;
    open.value = true;
    problem.value = null;
    draft.value = { def, rows: fn(draftOf(def).rows.map(r => ({ ...r }))) };
    previewDraft();
  }
  function previewDraft(d = draft.peek()) {
    if (!d || unchanged(d)) return preview(null);
    if (!unread(d)) preview(rowsChange(d), 'bar');   // while a row doesn't read, the redline stays as it was
  }
  // Enter, or Done: the draft made, as one change; a row that doesn't read says why, the cursor where it
  // goes wrong.
  function commitDraft() {
    const d = draft.peek(), bad = d && unread(d);
    if (bad) {
      problem.value = { key: bad.key, message: bad.message };
      const cm = document.querySelector(`.fxbar .fx-row[data-key="${bad.key}"] .CodeMirror`)?.CodeMirror;
      if (cm) { cm.focus(); cm.setCursor(cm.posFromIndex(bad.from)); }
      return;
    }
    endEditing();
    if (!d) return;
    draft.value = null; preview(null);
    if (!unchanged(d)) commit(rowsChange(d), `Edited ${defOf(d.def)?.name ?? 'the formula'}`);
  }
  function discard() {
    endEditing();
    problem.value = null;
    if (draft.peek()) { draft.value = null; preview(null); }
    const a = document.activeElement;
    if (a?.closest?.('.fxbar')) a.blur();
  }
  // Esc, while the rows are open, discards a draft, and then closes them.
  let unlayer = null;
  effect(() => {
    const on = open.value || !!draft.value;
    if (on && !unlayer) unlayer = Shell.layer(() => { if (draft.peek() || editing.peek()) discard(); else open.value = false; });
    else if (!on && unlayer) { unlayer(); unlayer = null; }
  });
  // The chevron, or Ctrl+Shift+U: the rows open, or closed, a draft still pending.
  function toggle() {
    if (open.peek()) endEditing();
    open.value = !open.peek();
  }
  // The rows open with the cursor in one, to type into.
  const openAt = key => { claimed = true; open.value = true; aim.value = key; };
  // While a row is edited, a click on the chart names a record in it (point mode), and the panel holds just
  // that row.
  function startEditing(cm, key) {
    const ed = editing.peek();
    if (ed?.cm === cm) return;
    editing.value = { cm, key, subject: ed?.subject ?? subject.peek() };
    if (!ed) Shell.parts.peek().canvas?.point(true);
  }
  // The rows never cover what they're about: the boxes of the record worked out are scrolled into the view
  // below them, as a wheel scrolls the chart, as little as will do, its top left first where not all fit.
  function clear() {
    const m = model.peek(), recs = R.peek().records, panel = document.querySelector('.fx-panel'), chart = document.querySelector('.dc-graph');
    if (!m || !panel || !chart) return;
    const ids = [...(m.args ?? []).map(a => a.id), m.id && Tree.objectOf(recs, m.id)].filter(id => isObj(recs[id]));
    const boxes = ids.map(id => chart.querySelector(`[data-cell-id="${CSS.escape(id)}"]`)?.getBoundingClientRect()).filter(Boolean);
    if (!boxes.length) return;
    const v = chart.getBoundingClientRect(), p = panel.getBoundingClientRect(), pad = 16;
    const into = (lo, hi, from, to) => lo < from + pad ? from + pad - lo : hi > to - pad ? Math.max(from + pad - lo, to - pad - hi) : 0;
    const dx = into(Math.min(...boxes.map(b => b.left)), Math.max(...boxes.map(b => b.right)), Math.max(v.left, p.left), Math.min(v.right, p.right));
    const dy = into(Math.min(...boxes.map(b => b.top)), Math.max(...boxes.map(b => b.bottom)), Math.max(v.top, p.bottom), v.bottom);
    if (dx || dy) chart.dispatchEvent(new WheelEvent('wheel', { deltaX: -dx, deltaY: -dy, bubbles: true, cancelable: true }));
  }
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
  function Formula({ row, m, colors, grey, would, focus }) {
    const host = useRef(), cmr = useRef(), props = useRef();
    props.current = { row, m, colors, would };
    useLayoutEffect(() => {
      const ctx = () => ({ computed: R.peek(), def: props.current.m.def?.id, at: props.current.m.at });
      const hint = c => {
        const s = Formulas.suggest(c.getValue(), c.indexFromPos(c.getCursor()), ctx());
        return s.list.length ? { list: s.list.slice(0, 60).map(x => ({ text: x.text, displayText: x.name, className: 'fx-hint ' + x.kind })),
          from: c.posFromIndex(s.from), to: c.posFromIndex(s.to) } : null;
      };
      const cm = CodeMirror(host.current, {
        value: row.formula, mode: 'dendra', lineWrapping: true, matchBrackets: true, viewportMargin: Infinity, scrollbarStyle: null, readOnly: App.readOnly.peek(),
        extraKeys: { Enter: () => commitDraft(), Esc: () => discard(), 'Ctrl-Space': c => c.showHint({ hint, completeSingle: false }) },
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
        const { m, row } = props.current;
        change(m.def.id, rows => rows.map(r => r.key === row.key ? { ...r, formula: v } : r));
      });
      cm.on('inputRead', (c, ch) => { if (/[\w[.]/.test(ch.text.join(''))) c.showHint({ hint, completeSingle: false }); });
      cm.on('focus', c => { hover.value = null; startEditing(c, props.current.row.key); });
      const wrap = cm.getWrapperElement();
      wrap.addEventListener('mousemove', e => {
        const { row } = props.current;
        if (!row.ev || editing.peek()?.cm === cm) return;
        const pos = cm.coordsChar({ left: e.clientX, top: e.clientY }, 'window'), box = cm.charCoords(pos, 'window');
        const off = cm.indexFromPos(pos) - (e.clientX < box.left ? 1 : 0);
        const part = row.ev.parts.filter(p => p.from <= off && off < p.to).sort((a, b) => (a.to - a.from) - (b.to - b.from))[0];
        const hv = hover.peek();
        if (!part) { if (hv?.key === row.key) hover.value = null; }
        else if (hv?.key !== row.key || hv.from !== part.from || hv.to !== part.to) hover.value = { key: row.key, from: part.from, to: part.to };
      });
      wrap.addEventListener('mouseleave', () => { if (hover.peek()?.key === props.current.row.key) hover.value = null; });
      cmr.current = cm;
      if (focus) requestAnimationFrame(() => { cm.focus(); cm.setCursor(cm.lineCount(), 0); });
      return () => wrap.remove();
    }, []);
    useLayoutEffect(() => {
      const cm = cmr.current, { row, m, colors, would } = props.current, hv = hover.value;
      if (aim.value === row.key) { aim.value = null; requestAnimationFrame(() => { cm.focus(); cm.setCursor(cm.lineCount(), 0); }); }
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
        // What's been typed, as a redline against the row as kept: new text in blue, what it replaced struck.
        if (draft.peek()?.def === m.def?.id) {
          const a = kept(m.def.id).find(r => r.key === row.key)?.formula ?? '', b = cm.getValue();
          let i = 0, j = 0;
          while (i < a.length && i < b.length && a[i] === b[i]) i++;
          while (j < a.length - i && j < b.length - i && a[a.length - 1 - j] === b[b.length - 1 - j]) j++;
          if (b.length - j > i) mark(i, b.length - j, 'add');
          if (a.length - j > i) widget(i, 'del', el => { el.textContent = a.slice(i, a.length - j); });
        }
      });
    });
    return html`<div class=${'fx-cm' + (grey ? ' grey' : '')} ref=${host} />`;
  }

  // ---- The bar ----
  function Bar() {
    const m = model.value, p = pending.value;
    // With nothing to say, the bar names the view, as Excel's Name Box names the cell.
    if (!m) return html`<div class="fxbar"><span class="fx-view">${App.views.value.find(v => v.id === Shell.view.value)?.name}</span><span class="fx-end"><${Delta} p=${p} /></span></div>`;
    const f = finder.value, cited = m.rows.find(r => r.cited), shut = !open.value || !m.def;
    const tint = edge => { const c = cited && [...f.colors].find(([n]) => norm(unbracket(cited.formula.slice(n.from, n.to))) === norm(edge)); return c ? ` fx-rf fx-c${c[1]}` : ''; };
    // A tag's checkbox comes first, as a checkbox does before its label; a value after its name and place.
    const boxed = !!m.out && 'tag' in m.out;
    return html`<div class="fxbar" onKeyDown=${onKey}>
      ${trail.value.map((t, i) => html`<button class="fx-crumb" key=${t.id} title=${t.place} onClick=${() => back(i)}>${t.title}${t.clause ? ` ${t.clause}` : ''}</button><span class="fx-sep" aria-hidden="true">›</span>`)}
      ${boxed ? html`<${Output} m=${m} />` : null}
      ${m.options ? html`<button class="btn ghost dd fx-name" onClick=${e => pickMenu(e, m)}>${m.title}</button>`
        : m.def && !m.general ? html`<button class="fx-name" onClick=${() => openDef(m.def.id)}>${m.title}</button>` : html`<span class="fx-name">${m.title}</span>`}
      <span class="fx-args">${m.args ? m.args.map((a, i) => html`${i ? html`<span class="to">${m.args.length === 2 ? '→' : '·'}</span>` : null}<span class=${'fx-arg' + tint(a.edge)} title=${a.short !== a.name ? a.name : null}>${a.short}</span>`) : m.place}</span>
      ${boxed ? null : html`<${Output} m=${m} />`}
      ${m.def && shut ? html`<${Inline} m=${m} />` : null}
      <span class="fx-end">
        <${Delta} p=${p} />
        ${draft.value && !unchanged(draft.value) ? html`<span class="fx-acts">
          <button class="btn ghost" data-tip="Discard" data-keys="Esc" onClick=${discard}>Discard</button>
          <button class="btn primary" data-tip="Done" data-keys="Enter" onClick=${commitDraft}>Done</button></span>` : null}
        ${m.def ? html`<button class="btn icon fx-open" aria-expanded=${!shut} aria-label=${toggled(shut)} data-tip=${toggled(shut)} data-keys=${EXPAND} onClick=${toggle}>${Shell.icon('chevron')}</button>` : null}
      </span>
      ${shut ? null : html`<${Panel} m=${m} />`}
    </div>`;
  }

  // Enter and Esc in a row's label belong to the bar while it has something to commit or discard.
  function onKey(e) {
    if (e.key !== 'Escape' && e.key !== 'Enter') return;
    if (e.target.closest?.('.CodeMirror')) { e.stopPropagation(); return; }
    if (!draft.peek() || !e.target.matches?.('input.fx-label')) return;
    e.stopPropagation(); e.preventDefault();
    if (e.key === 'Enter') commitDraft(); else discard();
  }

  // Why, said: each fact a quiet button (a span, so that it wraps as words do), its point in weight and in the
  // hue its records are outlined in on the chart. Hovered, its records pulse there; clicked, it steps down into
  // its reasons, or selects what was entered.
  function Said({ runs, cls, onClick }) {
    const { map } = finder.value, recs = R.value.records;
    let first = true;
    const seg = s => {
      const start = first;
      first = false;
      if (typeof s === 'string') return start ? s[0].toUpperCase() + s.slice(1) : s;
      if (s.name) {
        const short = N().shortOf(recs, s.name), full = N().nameOf(recs, s.name);
        return html`<span title=${short !== full ? full : null}>${start ? short : short.replace(/^The\b/, 'the')}</span>`;
      }
      const hue = map.get(s.id)?.[0];
      return html`<b class=${[s.fx && 'fx', hue && `fx-rf fx-c${hue}`].filter(Boolean).join(' ') || null}>${start ? s.term[0].toUpperCase() + s.term.slice(1) : s.term}</b>`;
    };
    return html`<span class=${cls} onClick=${onClick}>${runs.map(r => r.text ? seg(r.text)
      : r.cite ? html`<span class="fx-cite"> (${r.cite})</span>`
      : r.self ? html`<span class="fx-fact">${r.segs.map(seg)}</span>`
      : html`<span class="fx-fact go" role="button" tabindex="0" onPointerEnter=${() => { touch.value = r.fact.ids; }} onPointerLeave=${() => { touch.value = null; }}
          onClick=${e => { e.stopPropagation(); stepTo(r.fact); }} onKeyDown=${e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); stepTo(r.fact); } }}>${r.segs.map(seg)}</span>`)}.</span>`;
  }

  // In the bar's one row: why, said in full where it fits, or else in short, cut short where even that
  // doesn't; an error, in its words; or else the rows' labels, a clause once. Never the formula: a click drops
  // the rows, where it's read and edited.
  function Inline({ m }) {
    const w = why.value, ref = useRef(), [fit, setFit] = useState(0), width = useRef(0);
    const says = [w?.full, w?.short].filter(Boolean), said = says[Math.min(fit, says.length - 1)];
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
    for (const r of m.rows) labels.set(r.label || '—', labels.get(r.label || '—') || r.ink);
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
    useLayoutEffect(clear, [m.id ?? m.def?.id, !!editing.value]);
    const w = why.value;
    return html`<div class=${'fx-panel' + (editing.value ? ' editing' : '')} ref=${ref}>
      ${w ? html`<p class="fx-said"><${Said} runs=${w.full} cls="fx-why" /></p>` : null}
      <div class="fx-rows">${m.rows.map(r => html`<${Row} key=${r.key} r=${r} m=${m} colors=${r.cited || editing.value?.key === r.key || hover.value?.key === r.key ? f.colors : null} editable=${editable} />`)}</div>
      <div class="fx-foot">
        ${editable ? html`<button class="btn icon fx-add" aria-label="Add a row" data-tip="Add a row" onClick=${() => addRow(m)}>${Shell.icon('plus')}</button>` : null}
        <${Uses} m=${m} />
      </div>
    </div>`;
  }

  // The output, in its own control: a tag's checkbox, which previews the other state on hover and switches to
  // it on a click, or a value, typed over to enter one; with the amber corner where an entry overrides rows.
  function Output({ m }) {
    const o = m.out;
    if (!o) return null;
    if (o.error) return html`<span class="fx-out err">${o.error.code}</span>`;
    const a = after(m);
    if ('tag' in o) {
      const state = v => v === true ? ' yes' : v === false ? ' no' : '';
      const cls = 'tag' + (a !== undefined ? ' pend' + state(a?.tag) : state(o.tag) + (m.computed ? ' fx' : ''));
      return html`<span class=${'fx-out' + (m.covered ? ' over' : '')}><button class=${cls} data-tour="tag" aria-label=${m.title} disabled=${!!m.absent || App.readOnly.value}
        onPointerEnter=${() => m.rec && preview(flipped(m), 'tag')} onPointerLeave=${() => pending.peek()?.from === 'tag' && previewDraft()}
        onClick=${() => { if (!m.rec) return; preview(null); commit(flipped(m)); }} /></span>`;
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
    const o = m.out, wrap = 'fx-out' + (m.covered ? ' over' : ''), typing = pending.value?.from === 'value', still = App.readOnly.value;
    if (!o.field) {
      const options = m.def?.options ?? [], enter = choice => commit({ records: m.computed ? { 'fx-pending': { ...spotOf(m.rec), choice } } : { [m.id]: { ...spotOf(m.rec), choice } } });
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
      if (c) commit(c); else e.target.value = o.text;
      e.target.blur();
    };
    return html`<span class=${wrap}>${typing ? html`<span class="del fx-was">${o.text}</span>` : null}<input key=${m.id + '|' + o.text} disabled=${still}
      class=${'bare fx-value' + (m.computed ? ' fx' : '') + (typing ? ' fx-typed' : '')} defaultValue=${o.text} size=${Math.max(4, o.text.length + 1)}
      spellcheck="false" aria-label=${m.title} onInput=${e => { const c = typed(e.target.value); c ? preview(c, 'value') : preview(null); }}
      onKeyDown=${key} onBlur=${e => { if (pending.peek()?.from === 'value') preview(null); e.target.value = o.text; }} /></span>`;
  }

  // What reads this definition, from the engine's plan; each opens its own.
  function Uses({ m }) {
    const uses = R.value.uses ?? {}, by = m.def ? Object.keys(uses).filter(d => uses[d].includes(m.def.id)).map(defOf).filter(Boolean) : [];
    if (!by.length) return null;
    const link = d => html`<button class="fx-link" onClick=${() => openDef(d.id)}>${d.name}</button>`;
    return html`<span class="fx-used">Used by ${by.slice(0, 3).map((d, i) => html`${i ? ', ' : ''}${link(d)}`)}${by.length > 3
      ? html`, <button class="fx-link" onClick=${e => Shell.menu(e.currentTarget, by.slice(3).map(d => ({ label: d.name, run: () => openDef(d.id) })), { placement: 'bottom-end' })}>${by.length - 3} more</button>` : null}</span>`;
  }

  // What a pending change does, per definition, in words: Control: 11 fewer.
  const Delta = ({ p }) => p && html`<span class="fx-delta">${p.deltas.slice(0, 3).map(d => html`<span>${d.name}: ${[d.plus && html`<b class="plus">${d.plus} more</b>`,
    d.minus && html`<b class="minus">${d.minus} fewer</b>`, d.changed && html`<b class="changed">${d.changed} changed</b>`].filter(Boolean).map((x, i) => html`${i ? ', ' : ''}${x}`)}</span>`)}</span>`;

  function pickMenu(e, m) {
    const Rv = R.peek(), nm = id => nameOf(Rv, id);
    Shell.menu(e.currentTarget, m.options.map(o => ({ label: o.d.name, detail: `${nm(o.a)} → ${nm(o.b)}`, checked: o === m.option, run: () => { pick.value = o.key; } })));
  }

  // A row: its label, its formula, and what the rows would give where an entry overrides them.
  function Row({ r, m, colors, editable }) {
    const cls = 'fx-row' + (r.cited ? ' cited' : r.ink ? ' alt' : ' grey') + (r.gone ? ' gone' : '') + (editing.value?.key === r.key ? ' editing' : '') + (editable ? ' editable' : '');
    const keep = r.gone;
    const reorder = e => {
      const item = e.currentTarget.closest('.fx-row'), items = [...item.parentElement.querySelectorAll(':scope > .fx-row')];
      Shell.drag(e, { item, items, onDrop: (from, i) => change(m.def.id, rows => { const l = rows.slice(); l.splice(i, 0, l.splice(from, 1)[0]); return l; }) });
    };
    return html`<div class=${cls} data-key=${r.key}>
      ${editable ? html`<span class="fx-grip" aria-hidden="true" onPointerDown=${reorder} />` : null}
      ${editable ? html`<input class="bare fx-label" value=${r.label} size=${Math.max(2, r.label.length)} spellcheck="false" aria-label="Label"
          onInput=${e => change(m.def.id, rows => rows.map(x => x.key === r.key ? { ...x, label: e.target.value } : x))} />`
        : html`<span class="fx-label" title=${r.label.length > 28 ? r.label : null}>${r.label}</span>`}
      ${r.gone ? html`<div class="fx-cm gone">${r.formula}</div>` : html`<${Formula} row=${r} m=${m} colors=${colors} grey=${!r.ink} would=${wouldOf(m, r)} focus=${r.key === fresh} />`}
      ${problem.value?.key === r.key ? html`<p class="fx-problem" role="alert">${problem.value.message}</p>` : null}
      ${editable ? html`<button class="btn icon fx-x" aria-label=${keep ? 'Keep row' : 'Delete row'} data-tip=${keep ? 'Keep row' : 'Delete row'}
          onPointerEnter=${() => !keep && preview(rowsChange({ ...draftOf(m.def.id), rows: draftOf(m.def.id).rows.map(x => x.key === r.key ? { ...x, gone: true } : x) }), 'row')}
          onPointerLeave=${() => previewDraft()}
          onClick=${() => change(m.def.id, rows => rows.map(x => x.key === r.key ? { ...x, gone: !x.gone } : x))}>${Shell.icon('x')}</button>` : null}
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
    change(m.def.id, rows => [...rows, { key: fresh, label: '', formula: m.def.type === 'tag' ? '← ' : '= ' }]);
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

  Shell.register('formulabar', Bar);
  // What the chevron and its key will do, said as it will do it.
  const toggled = shut => shut ? 'Expand formula bar' : 'Collapse formula bar';
  Shell.register('action', { id: 'formulas', get name() { return toggled(!open.peek()); }, keys: '$mod+Shift+KeyU', run: toggle });
  return { preview, commit, edit: change, commitEdit: commitDraft, discard, back, flipped, reaching, point: pointAt, focus: openAt, light: ids => { lit.value = ids; },
    reason, citeOf, phrase, model, finder, pending, draft, hover, open };
})();
