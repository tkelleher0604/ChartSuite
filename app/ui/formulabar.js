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
// clear of what they're about: those that hold in ink, the rest grey. Two objects show the most derived
// relation that holds between them; one picked that doesn't shows its rows, all grey (why not). Any pending
// change is redlined before it's made, whoever asks (FormulaBar.preview). It also answers Find's "=", and gives
// the other panes a record's reason, the sentence it says for a record (FormulaBar.sentence), and a relation's
// words. Where a record is, it says by the core's place rule (Notes.placed, whereOf).
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
      title: P?.name ?? (rec?.args ? N().nameOf(Rv.records, id) : spot.edge), ...argsOf(Rv, spot, id) };
    m.out = err ? { error: err.error } : outputOf(rec);
    m.rows = rowsOf(m, Rv, dr);
    return m;
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
    const m = o.id ? describe({ id: o.id }, Rv, dr) : { id: null, def: o.d, at: o.at, absent: true, title: o.d.name, out: { tag: null }, ...argsOf(Rv, o) };
    if (!o.id) m.rows = rowsOf(m, Rv, dr);
    return { ...m, options, option: o };
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
      // Where the rows rule it out, what the sentence says: what held and what failed, not what a list held.
      const no = notsOf(Rv, m.id);
      (no ? [...no.held, ...no.failed].flatMap(x => x.parts ?? []) : g.parts).forEach(walk);
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
    hover.value = null; touch.value = null; pick.value = null;
    if (draft.peek()) { draft.value = null; preview(null); }
    trail.value = k >= 0 ? t.slice(0, k) : down ? [...t, last.crumb] : [];
    last = { key, map: finder.peek().map, crumb: m && { id: m.id, title: m.title, clause: m.clause, place: placeText(m) } };
    if (down || k >= 0) {
      const ids = [m.id, ...last.map.keys()];
      requestAnimationFrame(() => { Shell.parts.peek().canvas?.zoomTo?.(ids); clear(); });
    }
  });
  // The rows close when the selection changes, unless a row is being edited; and what the inspector pointed at
  // goes with what it was in: a clause lights nothing, and a tag's preview is redlined no more.
  on('select', () => { if (!editing.peek()) open.value = false; lit.value = null; if (pending.peek()?.from === 'outside') preview(null); });
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
      for (const k of ['OR', 'AND']) { const xs = cut(a, b, t => kw(t, k)); if (xs.length > 1) return { ...n, k, kids: sub(xs) }; }
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
  // read: the row's ground for its own row, and for a row before, the records its names read there.
  function whyNot(Rv, d, g, id) {
    const held = [], failed = [], spanned = (ps, n) => ps.filter(p => p.from >= n.from && p.to <= n.to);
    const truth = (n, lets) => ask(Rv, d, id, lets, n.text, '←')?.value === true;
    const attests = sk => sk?.k === 'IF' && sk.kids.length === 2 && /^TRUE$/i.test(sk.kids[1]?.text ?? '') ? sk.kids[0] : null;
    d.rows.slice(0, g.row + 1).forEach((row, i) => {
      const sk = skeleton(row.formula), own = i === g.row, cond = own ? sk : Formulas.splitFormula(row.formula).kind === 'implies' ? sk : attests(sk);
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
        else failed.push(...missed(Rv, d, id, n, lets, within));
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
  function missed(Rv, d, id, n, lets, within) {
    if (n.k === 'NOT') return [{ parts: within(n.kids[0]) }];
    if (n.k === 'ANY' || (n.k === 'IN' && isObj(Rv.records[ask(Rv, d, id, lets, n.kids[0].text)?.value?.id]))) return nearest(Rv, d, id, n, lets);
    if (n.k !== 'CMP' && n.k !== 'IN') return [{ parts: within(n) }];
    // The side that read records is what was found; the other, what was wanted.
    const [x, y] = n.kids, found = within(y).length && !within(x).length ? y : x, wanted = found === x ? y : x, parts = within(found);
    if (!parts.length) return absent(Rv, d, id, lets, found) ?? [];
    if (within(wanted).length) return [{ parts: [...parts, ...within(wanted)] }];
    const v = ask(Rv, d, id, lets, found.text)?.value, w = ask(Rv, d, id, lets, wanted.text)?.value, recs = Rv.records;
    const pct = /%/.test(wanted.text) || parts.some(p => recs[p.id]?.field === 'percent'), one = parts.length === 1 && !parts[0].items?.length;
    // What it missed by: not what it wanted, or the other side of the line it had to cross.
    const op = n.k === 'IN' ? '=' : found === x ? n.op : { '<': '>', '>': '<', '<=': '>=', '>=': '<=' }[n.op] ?? n.op;
    const miss = { '=': `not ${either([w].flat().map(z => show(z, pct)))}`, '>': `${show(w, pct)} or less`, '>=': `less than ${show(w, pct)}`, '<': `${show(w, pct)} or more`, '<=': `more than ${show(w, pct)}` }[op];
    if (op === '=' && one && v?.t === 'rec' && v.id) return [{ parts, not: { ids: [v.id], text: notOf(recs, v.id, w, pct) } }];
    return [{ parts, then: miss && (one ? miss : `${show(v, pct)}, ${miss}`) }];
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
    return absent(Rv, d, id, at, B, { x: x && ask(Rv, d, id, lets, x.text)?.value?.id, c: !x && some ? all[0] : null }) ?? [];
  }
  // A list with none of what was sought, said of whose list it is: x isn't among GP III's general partners;
  // the signing authority is not evidenced by anything; Fund III-A has no documents, or no Certificate of
  // Limited Partnership (what its Document Type names), or none with a status of Filed.
  function absent(Rv, d, id, lets, B, { x = null, c = null } = {}) {
    const m = /^(?:(.*\S)\s*\.\s*)?(?:\[([^\]]+)\]|([A-Za-z_]\w*))$/.exec(B.text.replace(/^COUNT\((.*)\)$/i, '$1').trim());
    if (!m) return null;
    const recs = Rv.records, list = m[2] ?? m[3], o = ask(Rv, d, id, lets, m[1] ?? '@')?.value?.id, up = o && Tree.objectOf(recs, o), owner = isObj(recs[up]) ? up : o;
    if (!recs[owner]) return null;
    const named = isObj(recs[owner]), p = predicate(list), who = named ? [] : [`the ${lower(N().nameOf(recs, owner))}`];
    // A list named as a predicate is said with it (is not evidenced by); any other, as what the owner has.
    let pre, obj = [];
    if (x && p) [pre, obj] = [[...who, verbal(p, true) + p.prep], [{ name: x }]];
    else if (x) return [{ clause: { subj: x, pre: [' is not among '], obj: [...(named ? [{ name: owner }, possessive(Rv, owner)] : [`${who[0]}’s`]), ` ${lower(list)}`], post: [] } }];
    else if (!c) pre = [...who, p ? `${verbal(p, true)}${p.prep}anything` : ` has no ${lower(list)}`];
    else {
      const [side, other] = c.kids?.[0]?.at ? c.kids : [...(c.kids ?? [])].reverse(), e = /^@\s*\.\s*(?:\[([^\]]+)\]|([A-Za-z_]\w*))$/.exec(side?.text ?? '');
      const w = e && (c.k === 'IN' || c.op === '=') && !other.at && ask(Rv, d, id, lets, other.text)?.value;
      if (w === undefined || w === null || w === false || p) return null;
      const entry = e[1] ?? e[2], noun = singular(list), ws = either([w].flat().map(z => show(z)));
      pre = [...who, typeOf(entry, noun) ? ` has no ${ws}` : ` has no ${lower(noun)} with ${article(entry)} ${lower(entry)} of ${ws}`];
    }
    return [{ clause: { subj: named ? owner : null, pre, obj, post: [] } }];
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
      return 'tag' in x ? [`${and}${x.tag ? 'with' : 'without'} ${lower(x.edge)}`] : [`${and}${i ? '' : 'with '}${article(x.edge)} ${lower(x.edge)} of `, term(e, Tree.outputText(x))]; });
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
    return Object.assign(c, { subj: O, poss: true, pre: [` ${lower(r.edge)}`, once ? (would ? ' would have been on ' : ' was on ') : be(), term(id, v)] });
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
    return { id, ids: [id], ...whose(Rv, id, what), post: [is, point, ...(roll ? [` (${roll})`] : [])] };
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

  // A record's reasons as pieces, { join, c: clause, cite?, self? } or { text }: its facts, the one reason
  // unfolded (if `unfold`) last; where the rows rule it out, ", but" and what failed (see whyNot); then ", so"
  // and what they give with its clause.
  function reasons(Rv, id, clause, unfold, top, would) {
    const g = reasonOf(Rv, id, clause), d = defOfRecord(Rv, id), recs = Rv.records;
    if (!g || !d) return null;
    // What the row reads as @, where that's a value (an entity's Entity Type), is a fact too. A default, a row
    // that reads nothing, gives because the rows before it gave nothing: its facts are what those rows read.
    // What only excludes is no reason (exclusions).
    const text = d.rows[g.row]?.formula ?? '', excluded = exclusions(text), seen = new Set(), loc = recs[id].at, read = i => Formulas.evaluateRow(Rv, d.id, i, id)?.names ?? [];
    const at = loc && !isObj(recs[loc]) && read(g.row).some(n => text.slice(n.from, n.to) === '@' && n.ids.length === 1 && n.ids[0] === loc && !excluded(n)) ? [{ id: loc }] : [];
    const kept = ps => ps.filter(p => !excluded(p)).map(p => p.items ? { ...p, items: kept(p.items) } : p);
    const no = notsOf(Rv, id), otherwise = !no && !g.parts.length && g.row > 0;
    const parts = no ? [...at, ...no.held.flatMap(h => h.parts)] : !otherwise ? [...at, ...kept(g.parts)] : d.rows.slice(0, g.row).flatMap((_, i) => read(i)).flatMap(x => x.ids.map(y => ({ id: y })));
    // The records read, each said with the entries read at it, as one fact: a relation with its percentage; an
    // item a list found (the record linking it) with what was read of the item.
    const gather = ps => {
      const groups = new Map(), walk = (p, link) => {
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
    };
    // What failed is said in full, so a fact it shares with what held is said there.
    const failed = (no?.failed ?? []).flatMap(f => f.clause ? [{ c: f.clause }] : gather(f.parts).map((x, i, l) => {
      const c = factOf(Rv, x.host, x.reads);
      return { c: f.not && [x.host, ...x.reads].some(y => f.not.ids.includes(y)) ? { ...c, not: f.not } : c, then: i === l.length - 1 ? f.then : null };
    }));
    // In short, for the bar's one row, a ruled-out record is what failed and what follows.
    const facts = (top && !unfold && failed.length ? [] : gather(parts)).map(x => {
      const cl = clauseOf(Rv, x.host, text, x.p), reason = !!Rv.computed[x.host] && 'tag' in recs[x.host] && !x.reads.length;
      const why = reason && reasonOf(Rv, x.host, cl);
      return { ...x, cl, reason, c: factOf(Rv, x.host, x.reads), cite: why ? citeOf(defOfRecord(Rv, x.host)?.id, why.label) : null };
    });
    const tags = facts.filter(f => f.reason), deeper = unfold && !otherwise && tags.length === 1 ? reasons(Rv, tags[0].host, tags[0].cl, false, false) : null;
    const given = top ? givenOf(Rv, id, would, g.row) : factOf(Rv, id);
    // A fact that only names an object (the tax year is 2026) isn't said where another clause names it: no side
    // twice.
    const names = c => c.names ? [] : [c.subj, ...[...c.pre, ...c.obj, ...c.post].map(s => s?.name)];
    const named = new Set([given, ...facts.map(f => f.c), ...failed.map(f => f.c), ...(deeper ?? []).map(p => p.c)].filter(Boolean).flatMap(names).filter(Boolean));
    // The facts about one subject together; past three of a kind, the rest counted: and 38 more owners.
    const leaves = facts.filter(f => !(deeper && f === tags[0]) && !named.has(f.c.names)), subjects = [...new Set(leaves.map(f => f.c.subj))], kinds = new Map();
    leaves.sort((x, y) => subjects.indexOf(x.c.subj) - subjects.indexOf(y.c.subj));
    const kindOf = f => { const r = recs[f.host], [a] = r.args ? N().sides(recs, f.host) : [], t = a && Tree.treeOf(recs, f.host);
      return a ? [`${N().nameOf(recs, f.host)}|${norm(a.edge)}`, lower(t ? N().listName(t, a.edge) : a.edge)] : [norm(r.edge), lower(Tree.plural(r.edge))]; };
    const shown = leaves.filter(f => { const [k, noun] = kindOf(f), x = kinds.get(k) ?? { n: 0, noun }; kinds.set(k, x); return x.n++ < 3; });
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
  const possessive = (Rv, id) => /s$/.test(N().shortOf(Rv.records, id)) ? '’' : '’s';
  // The pieces as runs, each clause said after the one before: the same subject again is "it" (a person is
  // named again), and after "and" or "but" isn't said, nor is "is" after "and" and a clause that ends at its
  // object; and a relation said again, as whose a value is, is "the" (so the capacity is held). A name that ends
  // in a parenthesis takes no possessive: the voting percentage of Fund III-A Investors (U.S. ERISA Plans) in Fund
  // III-A, an "of" after it "in". What a value isn't follows it: is a member, not a managing member, of GP III.
  function sentence(Rv, pieces) {
    const runs = [], said = new Set();
    let prev = null;
    for (const p of pieces ?? []) {
      if (p.text) { runs.push({ text: p.text }); continue; }
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
  // give and why. None for a record no row gives.
  function whyOf(Rv, id, clause = null) {
    const rec = Rv.records[id], c = Rv.covered[id], v = c?.value;
    if (!rec || !(Rv.computed[id] || c) || !defOfRecord(Rv, id)) return null;
    if (c && (v === null || v === undefined || Formulas.isError(v))) return null;
    const would = c && !c.agrees ? asGiven(rec, v) : null;
    try {
      const full = sentence(Rv, reasons(Rv, id, clause, true, true, would));
      return full && { full, short: sentence(Rv, reasons(Rv, id, clause, false, true, would)) };
    } catch { return null; }
  }
  // The sentence the bar says for a record, in full, as plain text, for other panes and exports; null for a
  // record no row gives.
  const sentenceFor = id => { const Rv = R.peek(), w = whyOf(Rv, id); return w ? plain(Rv.records, w.full) : null; };
  // The subject's, but while its definition's rows are being edited.
  const why = computed(() => {
    const m = model.value, dr = draft.value;
    return !m?.rec || m.err || !m.def || dr?.def === m.def.id ? null : whyOf(R.value, m.id, m.clause);
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
      return () => { wrap.remove(); if (hover.peek()?.key === props.current.row.key) hover.value = null; };
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
    const go = e => { e.preventDefault(); e.stopPropagation(); stepTo(fact); };
    return html`<span class="fx-fact go" role="button" tabindex="0" ...${point} onClick=${go} onKeyDown=${e => { if (e.key === 'Enter' || e.key === ' ') go(e); }}>${children}</span>`;
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

  // The output, in its own control: a tag's checkbox, which previews the other state pointed at or reached by
  // the keys, and switches to it on a click or Space, as a checkbox's do, committing the change on screen; Enter
  // goes on, as from a value and as in Excel, back to the view, so no key meant to move on changes it. Or a
  // value, typed over to enter one. The amber corner where an entry overrides rows.
  const onward = e => { if (e.key !== 'Enter') return; e.preventDefault(); e.stopPropagation(); document.getElementById('view')?.focus(); };
  function Output({ m }) {
    const o = m.out, point = usePoint(() => m.rec && preview(flipped(m), 'tag'), () => pending.peek()?.from === 'tag' && previewDraft());
    if (!o) return null;
    if (o.error) return html`<span class="fx-out err">${o.error.code}</span>`;
    const a = after(m);
    if ('tag' in o) {
      const state = v => v === true ? ' yes' : v === false ? ' no' : '';
      const cls = 'tag' + (a !== undefined ? ' pend' + state(a?.tag) : state(o.tag) + (m.computed ? ' fx' : ''));
      return html`<span class=${'fx-out' + (m.covered && !m.covered.agrees ? ' over' : '')}><button class=${cls} data-tour="tag" aria-label=${m.title} disabled=${!!m.absent || App.readOnly.value}
        ...${point} onKeyDown=${onward} onClick=${() => { if (!m.rec) return; preview(null); commit(flipped(m)); }} /></span>`;
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
    const Rv = R.peek();
    Shell.menu(e.currentTarget, m.options.map(o => ({ label: o.d.name, detail: placeText(argsOf(Rv, o), 'name'), checked: o === m.option, run: () => { pick.value = o.key; } })));
  }

  // A row: its label, its formula, and what the rows would give where an entry overrides them.
  function Row({ r, m, colors, editable }) {
    const cls = 'fx-row' + (r.cited ? ' cited' : r.ink ? ' alt' : ' grey') + (r.gone ? ' gone' : '') + (editing.value?.key === r.key ? ' editing' : '') + (editable ? ' editable' : '');
    const keep = r.gone, point = usePoint(() => !keep && preview(rowsChange({ ...draftOf(m.def.id), rows: draftOf(m.def.id).rows.map(x => x.key === r.key ? { ...x, gone: true } : x) }), 'row'),
      () => pending.peek()?.from === 'row' && previewDraft());
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
      ${editable ? html`<button class="btn icon fx-x" aria-label=${keep ? 'Keep row' : 'Delete row'} data-tip=${keep ? 'Keep row' : 'Delete row'} ...${point}
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
    reason, citeOf, phrase, sentence: sentenceFor, model, finder, pending, draft, hover, open };
})();
