// The formula bar (dendra.md, Part 2): the selection's output and its definition's rows, those that hold in
// ink and the rest grey. Each name in the cited row takes a colour, and what it means here is outlined on the
// chart in that colour; deeper reasons in the same hue, lighter, down to entered records (Range Finder).
// Hovering part of a formula shows its value here. Clicking a computed record in the highlight steps down to
// its own reason. Two objects in no computed relation show that relation's rows, all grey (why not). Any
// pending change is redlined before it's made. Rows are edited here in CodeMirror 5, and a definition's page
// is laid out like the statute it encodes.
//
// ON THE BUS (Shell.on and Shell.emit; tour.js lists the other parts' events):
//   heard  select              the bar follows Shell.selection: one record, or two objects
//          why-open  id        show this record until the selection changes (the inspector, on a computed value)
//          preview   change    redline a hypothetical change; null ends it. The inspector sends one on hovering
//                              a tag's checkbox and on typing a value, and commits it itself. A change is
//                              { records?: { [id]: record | null }, rows?: { [definition id]: rows | null } }:
//                              a record under a new id is added, under its own id replaces that one, and null
//                              removes it with its dependents; rows, [{ label, formula }], replace a
//                              definition's, and null deletes the definition.
//          definition-open id  open a definition's page (the inspector's "entry in general")
//          point     id        a record clicked on the chart while point-mode is on, from a canvas that does it
//   said   why-open  id        when it shows a computed record's reasons
//          point-mode on       true while a row is edited: a click on the chart then inserts that record's name
//          tag-flip  id        when its own checkbox attests or rules out a tag
//          highlight, redline  the same as the canvas calls below, for any other part that draws records
//
// ON THE CANVAS (Shell.parts.value.canvas), where it has them; `chart` below is the adapter:
//   highlight(colors, { dim, strong, deep, pulse })  colors { [record id]: CSS colour }, its alpha the depth;
//                         strong: witnesses; deep: deeper reasons; pulse: what a hovered part means. Records the
//                         view hides are drawn while highlighted. null clears.
//   redline({ appear, go, changed, records })        ids that would appear and go; changed { [id]: { before,
//                         after } } as text; records: the hypothetical state's, for what isn't drawn yet. null clears.
// A canvas without point mode still works: a selection made while a row is edited counts as the click, and is
// put back.
//
// It also registers 'evaluate', Find's "=", worked out at the selection. It reads App.computed, the engine's
// result, and works a preview out from App's own inputs with one thing changed.

const FormulaBar = (() => {
  const { html, signal, computed, effect, on, emit } = Shell;
  const { render } = preact;
  const { useLayoutEffect, useRef } = preactHooks;
  const norm = s => Tree.norm(String(s ?? ''));
  const unbracket = s => String(s).replace(/^\./, '').replace(/^\[|\]$/g, '');
  const bracket = s => /^[A-Za-z_][A-Za-z0-9_]*$/.test(s) && !/^(AND|OR|NOT|IN|TRUE|FALSE)$/i.test(s) ? s : `[${s}]`;
  const sameKeys = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const isObj = r => !!r && 'kind' in r;
  const newKey = () => 'n' + Math.random().toString(36).slice(2, 8);

  // ---- The language: one tokenizer, for CodeMirror and for setting a row as a statute sets a clause ----
  CodeMirror.defineSimpleMode('dendra', { start: [
    { regex: /←|<-/, token: 'arrow' },
    { regex: /"(?:[^"]|"")*"?/, token: 'string' },
    { regex: /\$(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?%?|(?:\d+(?:\.\d+)?|\.\d+)%?/, token: 'number' },
    { regex: /\[[^\]]*\]?/, token: 'variable' },
    { regex: /(?:AND|OR|NOT|IN)\b/i, token: 'keyword' },
    { regex: /(?:TRUE|FALSE)\b/i, token: 'atom' },
    { regex: new RegExp(`(?:${Formulas.FUNCTION_NAMES.join('|')})(?=\\s*\\()`, 'i'), token: 'builtin' },
    { regex: /[A-Za-z_][A-Za-z0-9_]*/, token: 'variable' },
    { regex: /@/, token: 'variable-2' },
    { regex: /<>|<=|>=|[-+*/&=<>:]/, token: 'operator' },
  ] });
  const MODE = CodeMirror.getMode({}, 'dendra');
  function tokens(text) {
    const out = [], st = CodeMirror.startState(MODE), s = new CodeMirror.StringStream(String(text ?? ''));
    while (!s.eol()) { const style = MODE.token(s, st) || ''; out.push({ text: s.current(), style, from: s.start }); s.start = s.pos; }
    return out;
  }

  // ---- The computed state: App's, and the engine's inputs as App takes them, for a hypothetical one ----
  const R = App.computed;
  const inputs = computed(() => {
    const N = App.notes.value, S = App.schema.value;
    return { entered: App.entered.value, defs: N.definitions(S), names: { relations: N.relations(S) } };
  });
  // How records read: an object by its Name, anything else by the place it's at.
  const nameOf = (Rv, id) => { const r = Rv.records[id]; return !r ? '—' : isObj(r) ? Tree.objectName(Rv.records, id) : segmentOf(Rv, id); };
  const segmentOf = (Rv, id) => {
    const r = Rv.records[id];
    if (isObj(r)) return nameOf(Rv, id);
    if (r.args) return r.args.map(a => nameOf(Rv, Tree.objectOf(Rv.records, a.at))).join(' → ');
    return 'tag' in r ? `${r.tag ? '' : 'Not '}${r.edge}` : 'choice' in r ? `${r.edge}: ${r.choice}` : r.edge;
  };
  const placeOf = (Rv, id) => Tree.pathOf(Rv.records, id).map((p, i) => i ? segmentOf(Rv, p) : nameOf(Rv, p)).join(' › ');
  const argKey = args => args.map(a => `${norm(a.edge)}=${a.at}`).sort().join('&');
  const noteOf = id => App.notes.peek().notes('Formula').find(n => n.note === id && !n.view);
  const defOf = id => R.peek().state.P.byId.get(id);
  const errorOf = (Rv, id) => Rv.errors.find(e => e.id === id);
  // Grounds are worked out on demand; each, once per working-out.
  const grounds = new WeakMap();
  function groundOf(Rv, id) {
    if (!grounds.has(Rv)) grounds.set(Rv, new Map());
    const memo = grounds.get(Rv);
    if (!memo.has(id)) { let g = null; try { g = Formulas.ground(Rv, id); } catch {} memo.set(id, g?.rows?.length ? g : null); }
    return memo.get(id);
  }

  // What each definition's rows mention: relations by name or list, definitions by name, entries by label.
  const graph = computed(() => {
    const { defs, names } = inputs.value, owner = new Map(), mentions = new Map(), uses = new Map();
    for (const r of names.relations) {
      owner.set(norm(r.name), r.name);
      for (const m of Object.values(r.lists ?? {})) for (const l of Object.values(m)) owner.set(norm(l), r.name);
    }
    for (const d of defs) owner.set(norm(d.name), d.name);
    for (const d of defs) {
      const edges = new Set((d.edges ?? []).map(norm)), said = new Set(), used = [];
      for (const row of d.rows ?? []) {
        const ts = tokens(row.formula);
        ts.forEach((t, i) => {
          if (t.style !== 'variable') return;
          const n = norm(unbracket(t.text)), call = ts.slice(i + 1).find(x => x.text.trim())?.text === '(';
          if (edges.has(n) && !call) return;
          said.add(n);
          const o = owner.get(n);
          if (o && o !== d.name && !used.includes(o)) used.push(o);
        });
      }
      mentions.set(d.id, said); uses.set(d.id, used);
    }
    return { mentions, uses, defs };
  });
  const usedBy = name => {
    const g = graph.value, n = norm(name);
    return g.defs.filter(d => d.name !== name && (g.uses.get(d.id).includes(name) || g.mentions.get(d.id).has(n)));
  };
  const defNamed = name => graph.peek().defs.find(d => norm(d.name) === norm(name));

  // ---- The chart: the canvas's calls, where it has them ----
  const chart = {
    highlight(colors, o = {}) { Shell.parts.peek().canvas?.highlight?.(colors, o); emit('highlight', colors && { colors, ...o }); },
    redline(r) { Shell.parts.peek().canvas?.redline?.(r); emit('redline', r); },
  };

  // ---- What the bar is about ----
  const asked = signal(null);     // a record the inspector asked about, until the selection changes
  const editing = signal(null);   // { cm, key, keys, subject } while a row is edited: the bar holds still
  const draft = signal(null);     // { def, rows: [{ key, label, formula, gone? }] }: a definition being edited
  const expanded = signal(false); // every row in order, not just those that hold here
  const pick = signal(null);      // for two objects, the relation shown
  const hover = signal(null);     // { key, from, to }: the part of a row under the pointer
  const trail = signal([]);       // the records stepped down from, for the chevron back
  const page = signal(null);      // the definition whose page is open
  const pageEdit = signal(null);  // the key of the row edited on the page
  const pageLight = signal(null); // the records a clause on the page attests, while it's hovered
  let saying = false;
  on('select', () => { if (!editing.peek()) asked.value = null; });
  on('why-open', id => { if (!saying) asked.value = id; });
  on('definition-open', id => openPage(id));

  const subject = computed(() => {
    const ed = editing.value;
    if (ed) return ed.subject;
    const Rv = R.value, keys = asked.value ? [asked.value] : Shell.selection.value;
    const known = keys.filter(k => Rv.records[k] || errorOf(Rv, k));
    if (known.length === 1) return { id: known[0] };
    if (known.length === 2 && known.every(k => isObj(Rv.records[k]))) return { pair: known };
    return null;
  });
  const subjectKey = computed(() => { const s = subject.value; return s ? s.id ?? s.pair.join('+') : ''; });

  // A record's spot, its argumentation, which an entered record standing there would share.
  const spotOf = r => r.args ? { args: r.args } : { at: r.at, edge: r.edge };
  const sameSpot = (a, b) => !!a && !!b && (a.args ? !!b.args && argKey(a.args) === argKey(b.args)
    : !b.args && a.at === b.at && norm(a.edge) === norm(b.edge));

  // Records between two objects that a definition covers, by definition and objects in its edges' order.
  const pairs = computed(() => {
    const Rv = R.value, out = new Map();
    for (const [id, r] of Object.entries(Rv.records)) if (r.args?.length === 2) {
      const def = Rv.computed[id]?.def ?? Rv.covered[id]?.def, d = def && Rv.state.P.byId.get(def);
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
    const id = s.id, rec = Rv.records[id], err = !rec && errorOf(Rv, id);
    if (isObj(rec)) return { id, object: true, title: nameOf(Rv, id), place: rec.kind, rows: [] };
    const said = Rv.computed[id] ?? Rv.covered[id] ?? null, spot = rec ?? err;
    const P = (said?.def ?? err?.def) ? Rv.state.P.byId.get(said?.def ?? err.def) : null;
    const at = rec ? id : err.args ? Object.fromEntries(err.args.map(a => [a.edge, Tree.objectOf(Rv.records, a.at) ?? a.at])) : err.at;
    const m = { id, rec, err, def: P, at, said, computed: !!Rv.computed[id], covered: Rv.covered[id] ?? null,
      title: P?.name ?? relationName(Rv, id, spot) ?? spot.edge, ...argsOf(Rv, spot, P) };
    m.out = err ? { error: err.error } : outputOf(rec);
    m.rows = rowsOf(m, Rv, dr);
    return m;
  }

  // Two objects: the computed relations they could be in, each way round. The one picked shows as its record
  // if they're in it, or else as its rows at the pair, all grey. Unpicked, it's the most derived tag they
  // aren't in, the first selected first: the pension isn't a close affiliate of the BDC, and here's why.
  function describePair(s, Rv, dr, pk) {
    const options = [];
    for (const def of Rv.order.flat()) {
      const d = Rv.state.P.byId.get(def);
      if (!d?.isRelation || d.error || d.edges.length !== 2) continue;
      for (const [a, b] of [s.pair, [s.pair[1], s.pair[0]]]) {
        const at = { [d.edges[0]]: a, [d.edges[1]]: b };
        if (!Formulas.evaluateRow(Rv, def, 0, at)) continue;
        const id = pairs.value.get(`${def}|${a}|${b}`) ?? null;
        options.push({ key: `${def}|${a}|${b}`, d, at, a, b, id, on: id ? Rv.records[id].tag : null });
      }
    }
    if (!options.length) return null;
    const absent = options.filter(x => !x.id && x.d.type === 'tag');
    const o = options.find(x => x.key === pk) ?? absent.findLast(x => x.a === s.pair[0]) ?? absent.at(-1) ?? options[0];
    const m = o.id ? describe({ id: o.id }, Rv, dr) : {
      id: null, def: o.d, at: o.at, absent: true, title: o.d.name, out: { tag: null },
      args: o.d.edges.map((e, i) => ({ edge: e, id: i ? o.b : o.a, name: nameOf(Rv, i ? o.b : o.a) })),
    };
    if (!o.id) m.rows = rowsOf(m, Rv, dr);
    return { ...m, options, option: o };
  }

  function relationName(Rv, id, r) {
    if (!r?.args) return null;
    const key = Rv.records[id] ? Tree.parameterization(Rv.records, id) : null, rels = inputs.peek().names.relations;
    return rels.find(x => key && x.covers.includes(key))?.name
      ?? rels.find(x => x.edges.length === r.args.length && r.args.every(a => x.edges.some(e => norm(e) === norm(a.edge))))?.name ?? null;
  }
  function argsOf(Rv, r, P) {
    if (!r.args) return { place: placeOf(Rv, r.at) };
    const by = new Map(r.args.map(a => [norm(a.edge), a.at]));
    return { args: (P?.edges ?? r.args.map(a => a.edge)).map(e => {
      const o = Tree.objectOf(Rv.records, by.get(norm(e))) ?? by.get(norm(e));
      return { edge: e, id: o, name: nameOf(Rv, o) };
    }) };
  }
  const outputOf = r => 'tag' in r ? { tag: r.tag } : 'choice' in r ? { text: r.choice }
    : { text: Tree.format(r.field, r.value), field: r.field, value: r.value };

  // The rows, as the definition or the draft has them, each worked out here. Ink where it holds (a tag's ←
  // rows) or gave the output; the cited one, its ground; the rest grey. A loop's rows, where it closes.
  function rowsOf(m, Rv, dr) {
    const P = m.def;
    if (!P) return [];
    const drafted = dr?.def === P.id;
    const texts = drafted ? dr.rows : (noteOf(P.id)?.value ?? P.rows.map(r => ({ label: r.label, formula: r.text })))
      .map((r, i) => ({ key: 'r' + i, label: r.label, formula: r.formula }));
    const rows = texts.map((t, i) => ({ ...t, i, ev: t.gone ? null : Formulas.evaluateRow(Rv, P.id, t.formula, m.at) }));
    const implied = rows.every(r => /^\s*(←|<-)/.test(r.formula));
    const gives = r => r.ev && !Formulas.isError(r.ev.value) && r.ev.value !== null && r.ev.value !== undefined && !(Array.isArray(r.ev.value) && !r.ev.value.length);
    const loops = (Rv.loops[P.id] ?? []).filter(l => !drafted);
    // As worked out: a row of the definition, by its place in it. A drafted row that doesn't read yet keeps it.
    const was = i => !!m.said && (m.said.holds?.length ? m.said.holds.includes(i) : m.said.row === i);
    const unread = r => r.ev?.value?.code === '#SYNTAX' && /^r\d+$/.test(r.key);
    let ink;
    if (m.absent) ink = () => false;
    else if (m.err) ink = r => loops.some(l => l.row === r.i) || Formulas.isError(r.ev?.value);
    else if (drafted || !m.said) {
      const first = rows.findIndex(r => !r.gone && gives(r));
      ink = r => !r.gone && (unread(r) ? was(+r.key.slice(1)) : implied ? r.ev?.value === true : r.i === first);
    } else ink = r => was(r.i);
    for (const r of rows) { r.ink = ink(r); if (m.err) r.loops = loops.filter(l => l.row === r.i); }
    const g = !drafted && m.rec && groundOf(Rv, m.id);
    const cited = g ? rows[g.rows[0].row] : rows.find(r => r.ink);
    if (cited) cited.cited = true;
    return rows;
  }

  // ---- Range Finder: a colour for each name in the lit row, and what each means here, on the chart ----
  // The lit row is the cited one; or the one being edited; or, for a record that isn't there, the one hovered.
  const finder = computed(() => {
    const m = model.value, Rv = R.value, colors = new Map(), map = new Map(), ed = editing.value, hv = hover.value;
    if (!m?.rows?.length) return { colors, map, m };
    const lit = m.rows.filter(r => ed ? r.key === ed.key : m.absent ? hv?.key === r.key : r.cited);
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
    const put = (id, c, level) => {
      if (!id || id === m.id) return;
      const x = map.get(id);
      if (!x || level < x.level) map.set(id, { c, level });
      for (const a of Rv.records[id]?.args ?? []) {   // a line's boxes, in its colour, lighter
        const o = Tree.objectOf(Rv.records, a.at);
        if (o && o !== m.id && !map.has(o)) map.set(o, { c, level: 2 });
      }
    };
    for (const r of lit) for (const n of r.ev?.names ?? []) if (colors.has(n)) n.ids.forEach(id => put(id, colors.get(n), 1));
    const cited = lit.find(r => r.cited), g = cited && !ed && m.rec && groundOf(Rv, m.id);
    if (g) {
      const names = cited.ev.names.filter(n => colors.has(n));
      const colorFor = p => colors.get(names.find(n => n.ids.includes(p.id)) ?? names.filter(n => n.from >= p.from && n.to <= p.to).sort((a, b) => b.to - a.to)[0]) ?? 1;
      const items = new Map();   // a record linking an item of a list, and the item: a position line, and its holder
      for (const p of cited.ev.parts) for (const v of p.values.flat(Infinity)) if (v?.t === 'rec' && v.link) items.set(v.link, v.id);
      const seen = new Set();
      const deep = (id, c) => {
        if (seen.has(id) || seen.size > 120) return;
        seen.add(id);
        const down = q => { if (q.id) { put(q.id, c, 2); if (Rv.computed[q.id]) deep(q.id, c); } (q.items ?? []).forEach(down); };
        (groundOf(Rv, id)?.rows[0].parts ?? []).forEach(down);
      };
      const walk = p => {
        const c = colorFor(p);
        if (p.id) { put(p.id, c, 0); put(items.get(p.id), c, 0); if (Rv.computed[p.id]) deep(p.id, c); }
        (p.items ?? []).forEach(walk);
      };
      g.rows[0].parts.forEach(walk);
    }
    if (m.err) {
      // The loop: every record the definition would give that shows this error, and what closes it here.
      for (const e of Rv.errors) if (e.def === m.def.id && e.error.code === m.err.error.code)
        for (const x of e.args ?? [{ at: e.at }]) { const o = Tree.objectOf(Rv.records, x.at); if (o) map.set(o, { c: 'loop', level: 0 }); }
      for (const r of m.rows) for (const l of r.loops ?? []) for (const n of r.ev?.names ?? []) if (n.from >= l.from && n.to <= l.to) n.ids.forEach(id => map.set(id, { c: 'loop', level: 0 }));
    }
    return { colors, map, m };
  });

  // What a hovered part means: the records of the names inside it.
  const hovered = computed(() => {
    const hv = hover.value, row = hv && model.value?.rows?.find(r => r.key === hv.key);
    return row?.ev ? new Set(row.ev.names.filter(n => n.from >= hv.from && n.to <= hv.to).flatMap(n => n.ids)) : null;
  });

  const hue = (c, level) => { const v = css(`--rf-page-${c}`); return /^#[0-9a-f]{6}$/i.test(v) ? v + ['', 'c0', '70'][level] : v; };
  effect(() => {
    Shell.theme.value;
    const lit = pageLight.value;
    if (lit) return chart.highlight(lit.length ? Object.fromEntries(lit.map(id => [id, css('--rf-page-1')])) : null, { dim: true, strong: lit });
    const { map } = finder.value, pulse = hovered.value;
    if (!map.size) return chart.highlight(null);
    const colors = {}, strong = [], deep = [];
    for (const [id, x] of map) {
      colors[id] = x.c === 'loop' ? css('--no-page') : hue(x.c, pulse?.has(id) ? 0 : x.level);
      if (x.level === 0) strong.push(id); else if (x.level === 2) deep.push(id);
    }
    chart.highlight(colors, { dim: true, strong, deep, pulse: pulse ? [...pulse] : [] });
  });

  // A new subject: a click on a computed record within the highlight steps down, keeping the way back; and the
  // tour hears that a computed record's reasons are shown.
  let lit = { key: '', map: new Map() }, goingBack = false;
  effect(() => {
    const key = subjectKey.value;
    if (key === lit.key) return;
    const m = model.peek();
    hover.value = null; expanded.value = false; pick.value = null;
    if (draft.peek()) { draft.value = null; preview(null); }
    if (goingBack) goingBack = false;
    else if (m?.computed && lit.map.has(m.id)) trail.value = [...trail.peek(), { id: lit.id, title: lit.title }];
    else trail.value = [];
    lit = { key, id: m?.id, title: m?.title, map: finder.peek().map };
    if (m?.computed) { saying = true; emit('why-open', m.id); saying = false; }
  });
  function back() {
    const t = trail.peek(), to = t.at(-1);
    if (!to) return;
    trail.value = t.slice(0, -1);
    goingBack = true;
    asked.value = null;
    Shell.select([to.id]);
  }

  // ---- Values, as a hovered part shows them ----
  function show(v, pct) {
    const Rv = R.peek();
    if (v === null || v === undefined) return '—';
    if (Array.isArray(v)) return !v.length ? '—' : v.slice(0, 5).map(x => show(x, pct)).join(', ') + (v.length > 5 ? `, +${v.length - 5}` : '');
    if (v?.t === 'err') return v.code;
    if (v?.t === 'date') return Tree.formatDate(v.iso);
    if (v?.t === 'rec') {
      const r = v.id && Rv.records[v.id];
      if (!r) return '—';
      if (isObj(r)) return nameOf(Rv, v.id);
      return 'tag' in r ? (r.tag ? 'TRUE' : 'FALSE') : 'choice' in r ? r.choice : Tree.format(r.field, r.value);
    }
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
  const pending = signal(null);   // { change, from, R2, diff, deltas }
  let timer = 0, slow = 0;
  function preview(change, from = 'outside') {
    clearTimeout(timer);
    if (!change) { pending.value = null; return; }
    const run = () => { const t = performance.now(); pending.value = { change, from, ...hypothetical(change) }; slow = performance.now() - t; };
    if (slow < 40) run(); else timer = setTimeout(run, 300);   // a big chart waits for a pause in typing
  }
  on('preview', change => change ? preview(change) : previewDraft());

  // The state as the change would leave it, and what would appear, go and change, per definition.
  function hypothetical(change) {
    const inp = inputs.peek();
    let entered = inp.entered, defs = inp.defs;
    if (change.records) {
      entered = { ...entered };
      const gone = Object.keys(change.records).filter(id => change.records[id] === null && entered[id]);
      if (gone.length) for (const id of Tree.dependents(entered, gone)) delete entered[id];
      for (const [id, r] of Object.entries(change.records)) if (r) entered[id] = r;
    }
    if (change.rows) defs = defs.flatMap(d => !(d.id in change.rows) ? [d] : change.rows[d.id] ? [{ ...d, rows: change.rows[d.id] }] : []);
    const before = R.peek();
    const R2 = Formulas.computeState(entered, defs, inp.names), diff = Formulas.diff(before, R2);
    return { R2, diff, deltas: deltasOf(diff, before, R2) };
  }
  // Per definition, the records it would attest or give more, fewer, and with another value.
  function deltasOf(d, A, B) {
    const by = new Map(), name = (X, id) => { const def = X.computed[id]?.def ?? X.covered[id]?.def; return def && X.state.P.byId.get(def)?.name; };
    const bump = (n, k) => { if (!n) return; if (!by.has(n)) by.set(n, { name: n, plus: 0, minus: 0, changed: 0 }); by.get(n)[k]++; };
    const counts = r => !('tag' in r) || r.tag === true;
    for (const id of d.appear) if (counts(B.records[id])) bump(name(B, id), 'plus');
    for (const id of d.go) if (counts(A.records[id])) bump(name(A, id), 'minus');
    for (const id of d.change) { const a = A.records[id], b = B.records[id]; bump(name(B, id) ?? name(A, id), 'tag' in a ? (b.tag ? 'plus' : 'minus') : 'changed'); }
    return [...by.values()].sort((x, y) => (y.plus + y.minus + y.changed) - (x.plus + x.minus + x.changed));
  }
  effect(() => {
    const p = pending.value;
    if (!p) return chart.redline(null);
    const text = (X, id) => { const r = X.records[id]; return !r || isObj(r) ? '' : 'tag' in r ? (r.tag ? 'Yes' : 'No') : 'choice' in r ? r.choice : Tree.format(r.field, r.value); };
    const changed = Object.fromEntries(p.diff.change.map(id => [id, { before: text(R.peek(), id), after: text(p.R2, id) }]));
    chart.redline({ appear: p.diff.appear, go: p.diff.go, changed, records: p.R2.records });
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

  // One change, through App.edit.
  function commit(change) {
    const tx = App.edit(), entered = App.entered.peek();
    for (const [id, r] of Object.entries(change.records ?? {})) {
      if (r === null) { tx.remove(id); continue; }
      const { computed: _, ...rec } = r;
      if (entered[id]) tx.set(id, rec); else tx.add('record', rec);
    }
    for (const [def, rows] of Object.entries(change.rows ?? {})) {
      if (rows === null) { tx.remove(def); continue; }
      const { id: _, note: __, value: ___, ...n } = noteOf(def);
      tx.set(def, { ...n, value: rows.map(r => ({ label: r.label.trim(), formula: Formulas.tidyArrow(r.formula).trim() })) });
    }
    const c = tx.commit();
    if (typeof c === 'string') Shell.toast(c);
    return c && typeof c !== 'string' ? c : null;
  }

  // ---- Editing a definition: a draft of its rows, redlined as it changes ----
  function draftOf(def) {
    const d = draft.peek();
    return d?.def === def ? d : { def, rows: (noteOf(def)?.value ?? []).map((r, i) => ({ key: 'r' + i, label: r.label, formula: r.formula })) };
  }
  const rowsChange = d => ({ rows: { [d.def]: d.rows.filter(r => !r.gone).map(({ label, formula }) => ({ label, formula })) } });
  const unchanged = d => JSON.stringify(rowsChange(d).rows[d.def]) === JSON.stringify((noteOf(d.def)?.value ?? []).map(({ label, formula }) => ({ label, formula })));
  const unread = d => d.rows.some(r => !r.gone && Formulas.check(r.formula).problems.length);
  function change(def, fn) {
    draft.value = { def, rows: fn(draftOf(def).rows.map(r => ({ ...r }))) };
    previewDraft();
  }
  function previewDraft(d = draft.peek()) {
    if (!d || unchanged(d)) return preview(null);
    if (!unread(d)) preview(rowsChange(d), 'bar');   // while a row doesn't read, the redline stays as it was
  }
  function commitDraft() {
    const d = draft.peek();
    if (d && unread(d)) return;
    endEditing();
    if (!d) return;
    draft.value = null; preview(null);
    if (!unchanged(d) && commit(rowsChange(d))) Shell.toast(`Edited ${defOf(d.def)?.name ?? 'the definition'}`, { undo: () => Shell.parts.peek().undo?.undo() });
  }
  function discard() {
    endEditing();
    if (draft.peek()) { draft.value = null; preview(null); } else expanded.value = false;
    const a = document.activeElement;
    if (a?.closest?.('.fxbar, .fx-page')) a.blur();
  }
  function startEditing(cm, key) {
    const ed = editing.peek();
    if (ed?.cm === cm) return;
    editing.value = { cm, key, subject: ed?.subject ?? subject.peek(), keys: ed?.keys ?? Shell.selection.peek() };
    if (!ed) emit('point-mode', true);
  }
  function endEditing() {
    pageEdit.value = null;
    if (!editing.peek()) return;
    editing.value = null;
    emit('point-mode', false);
  }
  // A click anywhere but the bar, the page, the chart or a list ends editing; the draft stays pending.
  document.addEventListener('pointerdown', e => {
    if (editing.peek() && !e.target.closest?.('.fxbar, .fx-page, .view, .CodeMirror-hints, .float')) endEditing();
  }, true);

  // ---- Point mode: a click on the chart inserts the name that reaches what was clicked ----
  effect(() => {
    const sel = Shell.selection.value, ed = editing.peek();
    if (!ed || sameKeys(sel, ed.keys) || !sel.length) return;
    const id = sel[sel.length - 1];
    queueMicrotask(() => { Shell.select(ed.keys, { replace: true }); pointAt(id); });
  });
  on('point', id => pointAt(id));
  function pointAt(target) {
    const ed = editing.peek(), m = page.peek() && pageEdit.peek() ? pageModel() : model.peek();
    if (!ed?.cm || !m?.def) return;
    const found = reaching(target, m), cm = ed.cm;
    cm.focus();
    if (found.length === 1) cm.replaceSelection(found[0]);
    else if (found.length) cm.showHint({ completeSingle: false, hint: () => ({ list: found, from: cm.getCursor(), to: cm.getCursor() }) });
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
    if (m.def.isRelation) for (const r of inputs.peek().names.relations) if (r.edges.length === 2)
      for (const a of m.def.edges) for (const b of m.def.edges) {
        const t = `${bracket(r.name)}(${bracket(a)}, ${bracket(b)})`;
        if (a !== b && hit(t)) out.push(t);
      }
    return [...new Set(out)].sort((a, b) => a.length - b.length).slice(0, 8);
  }

  // ---- A row's formula, in CodeMirror ----
  // Its names in their colours, squiggles from check(), completion from suggest(), the value of the part under
  // the pointer just after it, and the name that closes a loop underlined in red. Enter commits; Esc discards.
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
        value: row.formula, mode: 'dendra', lineWrapping: true, matchBrackets: true, viewportMargin: Infinity, scrollbarStyle: null,
        extraKeys: { Enter: () => commitDraft(), Esc: () => discard(), 'Ctrl-Space': c => c.showHint({ hint, completeSingle: false }) },
        lint: { delay: 120, getAnnotations: (text, _, c) => Formulas.check(text, ctx()).problems
          .map(p => ({ from: c.posFromIndex(p.from), to: c.posFromIndex(Math.max(p.to, p.from + 1)), message: p.message, severity: 'error' })) },
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
      const cm = cmr.current, { row, colors, would } = props.current, hv = hover.value;
      if (!cm.hasFocus() && cm.getValue() !== row.formula) cm.setValue(row.formula);
      cm.operation(() => {
        for (const mk of cm.getAllMarks()) if (mk.fx) mk.clear();
        const at = i => cm.posFromIndex(i), mark = (f, t, cls) => { cm.markText(at(f), at(t), { className: cls }).fx = true; };
        for (const n of row.ev?.names ?? []) if (colors?.has(n)) mark(n.from, n.to, `fx-rf fx-c${colors.get(n)}`);
        for (const l of row.loops ?? []) mark(l.from, l.to, 'fx-loop');
        const part = hv?.key === row.key && row.ev && cm.getValue() === row.formula && row.ev.parts.find(p => p.from === hv.from && p.to === hv.to);
        if (part) {
          const name = row.ev.names.filter(n => colors?.has(n) && n.from >= part.from && n.to <= part.to).sort((a, b) => b.to - a.to)[0];
          const tint = name ? ` fx-c${colors.get(name)}` : '';
          mark(part.from, part.to, 'fx-hov' + tint);
          const el = document.createElement('span');
          el.className = 'fx-val' + tint;
          el.textContent = partText(row, part);
          cm.setBookmark(at(part.to), { widget: el, insertLeft: true }).fx = true;
        }
        if (would && !cm.hasFocus()) {
          const el = document.createElement('span');
          el.className = 'fx-would';
          render(would, el);
          cm.setBookmark(at(cm.getValue().length), { widget: el }).fx = true;
        }
      });
    });
    return html`<div class=${'fx-cm' + (grey ? ' grey' : '')} ref=${host} />`;
  }

  // ---- The bar ----
  function Bar() {
    const m = model.value, p = pending.value, f = finder.value;
    if (!m) return html`<div class="fxbar none"><span class="fx-end"><${Delta} p=${p} /></span></div>`;
    const all = expanded.value || m.absent || m.rows.every(r => r.ink) || m.rows.every(r => !r.ink);
    const shown = all ? m.rows : m.rows.filter(r => r.ink);
    const others = all ? [] : [...new Set(m.rows.filter(r => !r.ink).map(r => r.label || '—'))];
    const cited = m.rows.find(r => r.cited);
    const tint = edge => { const c = cited && [...f.colors].find(([n]) => norm(unbracket(cited.formula.slice(n.from, n.to))) === norm(edge)); return c ? ` fx-rf fx-c${c[1]}` : ''; };
    // A tag's checkbox comes first, as a checkbox does before its label; a value after its name and place.
    const t = trail.value.at(-1), editable = all && !m.absent, boxed = !!m.out && 'tag' in m.out;
    return html`<div class="fxbar" onKeyDown=${onKey}>
      <div class="fx-head">
        ${t ? html`<button class="btn ghost fx-back" onClick=${back}>${Shell.icon('chevron')}<span>${t.title}</span></button>` : null}
        ${boxed ? html`<${Output} m=${m} />` : null}
        ${m.options ? html`<button class="btn ghost dd fx-name" onClick=${e => pickMenu(e, m)}>${m.title}</button>`
          : m.def ? html`<button class="fx-name" onClick=${() => openPage(m.def.id)}>${m.title}</button>` : html`<span class="fx-name">${m.title}</span>`}
        <span class="fx-args">${m.args ? m.args.map((a, i) => html`${i ? html`<span class="to">${m.args.length === 2 ? '→' : '·'}</span>` : null}<span class=${'fx-arg' + tint(a.edge)}>${a.name}</span>`) : m.place}</span>
        ${boxed ? null : html`<${Output} m=${m} />`}
        <span class="fx-end">
          ${p ? html`<${Delta} p=${p} />` : m.object ? null : html`<${UsedBy} m=${m} />`}
          ${p?.from === 'bar' ? html`<span class="fx-acts">
            <button class="btn icon" aria-label="Discard" data-tip="Discard" data-keys="Esc" onClick=${discard}>${Shell.icon('x')}</button>
            <button class="btn icon fx-ok" aria-label="Commit" data-tip="Commit" data-keys="Enter" onClick=${commitDraft}>${Shell.icon('check')}</button></span>` : null}
        </span>
      </div>
      ${m.def ? html`<div class="fx-rows">
        ${shown.map(r => html`<${Row} key=${r.key} r=${r} m=${m} colors=${r.cited || editing.value?.key === r.key || hover.value?.key === r.key ? f.colors : null} editable=${editable} />`)}
        ${others.length ? html`<div class="fx-others">${others.map(l => html`<button onClick=${() => { expanded.value = true; }}>${l}</button>`)}</div>` : null}
        ${editable ? html`<div class="fx-more"><button class="btn icon fx-add" aria-label="Add a row" data-tip="Add a row" onClick=${() => addRow(m)}>${Shell.icon('plus')}</button></div>` : null}
      </div>` : null}
    </div>`;
  }

  // Enter and Esc belong to the bar while it has something to commit or discard, not to the shell.
  function onKey(e) {
    if (e.key !== 'Escape' && e.key !== 'Enter') return;
    if (e.target.closest?.('.CodeMirror')) { e.stopPropagation(); return; }
    if (e.key === 'Escape' && (draft.peek() || expanded.peek())) { e.stopPropagation(); e.preventDefault(); discard(); }
    else if (e.key === 'Enter' && draft.peek() && e.target.matches?.('input')) { e.stopPropagation(); e.preventDefault(); commitDraft(); }
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
      return html`<span class=${'fx-out' + (m.covered ? ' over' : '')}><button class=${cls} data-tour="tag" aria-label=${m.title} disabled=${!!m.absent}
        onPointerEnter=${() => m.rec && preview(flipped(m), 'tag')} onPointerLeave=${() => pending.peek()?.from === 'tag' && previewDraft()}
        onClick=${() => { if (!m.rec) return; preview(null); if (commit(flipped(m))) emit('tag-flip', m.id); }} /></span>`;
    }
    if (a !== undefined && a?.value !== m.rec.value && pending.value.from !== 'value')
      return html`<span class="fx-out"><span class="del">${o.text}</span> <span class="add">${a ? outputOf(a).text : '—'}</span></span>`;
    return html`<${Value} m=${m} />`;
  }
  // A tag in the other state: an entered one flipped, a computed one ruled out by an entry at its spot.
  function flipped(m) {
    const { computed: _, ...rec } = m.rec;
    return { records: m.computed ? { 'fx-pending': { ...spotOf(rec), tag: !rec.tag } } : { [m.id]: { ...rec, tag: !rec.tag } } };
  }
  // While a value is typed, what it replaces shows struck through before it, and the input keeps what's typed.
  function Value({ m }) {
    const o = m.out, wrap = 'fx-out' + (m.covered ? ' over' : ''), typing = pending.value?.from === 'value';
    if (!o.field) {
      const options = m.def?.options ?? [], enter = choice => commit({ records: m.computed ? { 'fx-pending': { ...spotOf(m.rec), choice } } : { [m.id]: { ...spotOf(m.rec), choice } } });
      return html`<span class=${wrap}>${options.length
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
    return html`<span class=${wrap}>${typing ? html`<span class="del fx-was">${o.text}</span>` : null}<input key=${m.id + '|' + o.text}
      class=${'bare fx-value' + (m.computed ? ' fx' : '') + (typing ? ' fx-typed' : '')} defaultValue=${o.text} size=${Math.max(4, o.text.length + 1)}
      spellcheck="false" aria-label=${m.title} onInput=${e => { const c = typed(e.target.value); c ? preview(c, 'value') : preview(null); }}
      onKeyDown=${key} onBlur=${e => { if (pending.peek()?.from === 'value') preview(null); e.target.value = o.text; }} /></span>`;
  }

  function UsedBy({ m }) {
    const by = usedBy(m.def?.name ?? m.title);
    if (!by.length) return null;
    const link = d => html`<button class="fx-link" onClick=${() => openPage(d.id)}>${d.name}</button>`;
    return html`<span class="fx-used">Used by ${by.slice(0, 3).map((d, i) => html`${i ? ', ' : ''}${link(d)}`)}${by.length > 3
      ? html`, <button class="fx-link" onClick=${e => Shell.menu(e.currentTarget, by.slice(3).map(d => ({ label: d.name, run: () => openPage(d.id) })), { placement: 'bottom-end' })}>${by.length - 3} more</button>` : null}</span>`;
  }

  // The net change per definition: Control −5.
  const Delta = ({ p }) => p && html`<span class="fx-delta">${p.deltas.slice(0, 4).map(d => html`<span>${d.name}${d.plus ? html` <b class="plus">+${d.plus}</b>` : null}${d.minus ? html` <b class="minus">−${d.minus}</b>` : null}${d.changed ? html` <b class="changed">${d.changed} changed</b>` : null}</span>`)}</span>`;

  function pickMenu(e, m) {
    const Rv = R.peek(), nm = id => nameOf(Rv, id);
    Shell.menu(e.currentTarget, m.options.map(o => ({ label: o.d.name, detail: `${nm(o.a)} → ${nm(o.b)}`, checked: o === m.option, run: () => { pick.value = o.key; } })));
  }

  // A row: its label, its formula, and what the rows would give where an entry overrides them.
  function Row({ r, m, colors, editable }) {
    const cls = 'fx-row' + (r.cited ? ' cited' : r.ink ? ' alt' : ' grey') + (r.gone ? ' gone' : '');
    const over = r.cited && m.covered && !m.covered.agrees && m.covered.value !== null && m.covered.value !== undefined;
    const keep = r.gone;
    return html`<div class=${cls} data-key=${r.key}>
      ${editable ? html`<span class="fx-grip" aria-hidden="true" onPointerDown=${e => dragRow(e, m.def.id)} />` : null}
      ${editable ? html`<input class="bare fx-label" value=${r.label} size=${Math.max(2, r.label.length)} spellcheck="false" aria-label="Label"
          onInput=${e => change(m.def.id, rows => rows.map(x => x.key === r.key ? { ...x, label: e.target.value } : x))} />`
        : html`<span class="fx-label" title=${r.label.length > 28 ? r.label : null}>${r.label}</span>`}
      ${r.gone ? html`<div class="fx-cm gone">${r.formula}</div>` : html`<${Formula} row=${r} m=${m} colors=${colors} grey=${!r.ink} would=${over ? overrideOf(m) : null} focus=${r.key === fresh} />`}
      ${editable ? html`<button class="btn icon fx-x" aria-label=${keep ? 'Keep row' : 'Delete row'} data-tip=${keep ? 'Keep row' : 'Delete row'}
          onPointerEnter=${() => !keep && preview(rowsChange({ ...draftOf(m.def.id), rows: draftOf(m.def.id).rows.map(x => x.key === r.key ? { ...x, gone: true } : x) }), 'row')}
          onPointerLeave=${() => previewDraft()}
          onClick=${() => change(m.def.id, rows => rows.map(x => x.key === r.key ? { ...x, gone: !x.gone } : x))}>${Shell.icon('x')}</button>` : null}
    </div>`;
  }
  // What the rows would give where an entry overrides them: "C Corporation" beside the entered election.
  function overrideOf(m) {
    const v = m.covered.value;
    if (Formulas.isError(v)) return html`<span class="err">${v.code}</span>`;
    if ('tag' in m.rec) return html`<span class=${'tag fx ' + (v ? 'yes' : 'no')} />`;
    return html`<span class="fx">${v?.t === 'date' ? Tree.formatDate(v.iso) : typeof v === 'number' ? Tree.format(m.rec.field, v) : String(v)}</span>`;
  }
  // A new row, at the end, with the cursor in it.
  let fresh = null;
  function addRow(m) {
    fresh = newKey();
    change(m.def.id, rows => [...rows, { key: fresh, label: '', formula: m.def.type === 'tag' ? '← ' : '= ' }]);
    expanded.value = true;
  }
  // A row dragged by its grip moves among its definition's rows; a clause on the page moves with all the rows
  // it holds (data-keys). The move is a pending change like any other.
  function dragRow(e, def) {
    if (e.button !== 0) return;
    e.preventDefault();
    const grip = e.currentTarget, item = grip.closest('[data-key]'), list = [...item.parentElement.querySelectorAll(':scope > [data-key]')];
    const from = list.indexOf(item);
    let to = from;
    grip.setPointerCapture(e.pointerId);
    item.classList.add('dragging');
    const clear = () => list.forEach(x => x.classList.remove('drop-before', 'drop-after'));
    const move = ev => {
      clear();
      to = list.findIndex(x => { const b = x.getBoundingClientRect(); return ev.clientY < b.top + b.height / 2; });
      if (to < 0) { to = list.length; list.at(-1).classList.add('drop-after'); } else list[to].classList.add('drop-before');
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', () => {
      grip.removeEventListener('pointermove', move);
      clear(); item.classList.remove('dragging');
      const i = to > from ? to - 1 : to;
      if (i === from) return;
      const items = list.map(x => (x.dataset.keys ?? x.dataset.key).split(' '));
      items.splice(i, 0, items.splice(from, 1)[0]);
      const order = items.flat();
      change(def, rows => [...order.map(k => rows.find(x => x.key === k)).filter(Boolean), ...rows.filter(x => !order.includes(x.key))]);
    }, { once: true });
  }

  // ---- A definition's page, in the inspector's place, widened: laid out like an annotated code section ----
  let pageEl = null;
  function openPage(id) {
    if (!defOf(id)) return;
    page.value = id;
    const main = document.querySelector('.shell > .main');
    if (!main) return;
    if (!pageEl?.isConnected) {
      pageEl = document.createElement('section');
      pageEl.className = 'fx-page';
      main.appendChild(pageEl);
      render(html`<${Page} />`, pageEl);
    }
    pageEl.scrollTop = 0;
  }
  function closePage() {
    if (pageEdit.peek()) discard();
    page.value = null; pageLight.value = null;
    if (pageEl) { render(null, pageEl); pageEl.remove(); pageEl = null; }
  }
  addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !page.peek() || e.defaultPrevented || document.querySelector('dialog[open], .float')) return;
    if (e.target.closest?.('.CodeMirror, .fxbar')) return;
    e.stopPropagation(); e.preventDefault();
    closePage();
  }, true);

  // The page's own model, for editing a row there: the definition at one of its records.
  const pageModel = () => { const Rv = R.peek(), id = page.peek(), P = Rv.state.P.byId.get(id); return P && { def: P, at: Object.keys(Rv.computed).find(k => Rv.computed[k].def === id) ?? null }; };

  // Where a definition reads: for a relation, the kinds each side can be; for an entry, where it's located.
  function sidesOf(P, note) {
    const Rv = R.peek(), kinds = new Map(Object.values(Rv.records).filter(isObj).map(r => [norm(r.kind), r.kind]));
    const kindsOf = edge => [...new Set(P.params.flat().filter(p => norm(p.edge) === norm(edge)).map(p => {
      let s = p.spec;
      while (!s.startsWith('kind:')) { const [, ...rest] = JSON.parse(s); s = JSON.parse(rest[0])[1]; }
      return kinds.get(s.slice(5)) ?? s.slice(5);
    }))].join(', ');
    const where = l => !l?.args ? '' : l.args.map(a => `${where(a.loc) || a.loc?.kind || kindsOf(a.edge)} › ${a.edge}${l.out?.choice ? `: ${l.out.choice}` : ''}`).join(', ');
    const loc = edge => note?.pattern?.args?.find(a => norm(a.edge) === norm(edge))?.loc;
    if (!P.isRelation) { const l = loc(P.name); return [{ edge: 'At', text: where(l) || l?.kind || kindsOf(P.name) }]; }
    return P.edges.map(e => ({ edge: e, text: where(loc(e)) || kindsOf(e) }));
  }
  const typeOf = P => P.type === 'tag' ? 'Tag' : P.type === 'choice' ? 'Choice' : Tree.DATATYPES[P.datatype ?? 'number'] ?? 'Number';

  // The Description, paragraph by paragraph: one that starts with a row's label sits beside that row; rows
  // that share a label are one clause; a labelled paragraph with no row yet is a clause still to write.
  function clausesOf(rows, text) {
    const paras = String(text ?? '').split(/\n+/).map(s => s.trim()).filter(Boolean);
    const labels = [...new Set(rows.map(r => r.label).filter(Boolean))].sort((a, b) => b.length - a.length);
    const groups = [], lead = [], tail = [];
    for (const r of rows) { const g = groups.at(-1); if (g && r.label && norm(g.label) === norm(r.label)) g.rows.push(r); else groups.push({ label: r.label, rows: [r], law: '' }); }
    let any = false;
    for (const p of paras) {
      const l = labels.find(x => p.toLowerCase().startsWith(x.toLowerCase()) && !/\w/.test(p[x.length] ?? ' '));
      const g = l && groups.find(x => norm(x.label) === norm(l) && !x.law);
      if (g) { g.law = p.slice(l.length).replace(/^[\s.:—–-]+/, ''); any = true; continue; }
      const own = any && /^(\([^)]+\)(?:\([^)]+\))*)\s+(.*)$/.exec(p);
      if (own) { groups.push({ label: own[1], rows: [], law: own[2] }); continue; }
      (any ? tail : lead).push(p);
    }
    return { lead, groups, tail };
  }

  function Page() {
    const id = page.value, Rv = R.value, P = id && Rv.state.P.byId.get(id);
    if (!P) return null;
    const note = noteOf(id), d = draft.value?.def === id ? draft.value : null;
    const rows = (d ? d.rows : (note?.value ?? []).map((r, i) => ({ key: 'r' + i, label: r.label, formula: r.formula }))).map((r, i) => ({ ...r, i }));
    const { lead, groups, tail } = clausesOf(rows, App.notes.value.description(note?.pattern ?? {}));
    const mine = Object.entries(Rv.computed).filter(([, c]) => c.def === id);
    const gives = mine.filter(([rid]) => !('tag' in Rv.records[rid]) || Rv.records[rid].tag === true).length;
    const attests = g => d ? [] : mine.filter(([, c]) => g.rows.some(r => c.holds?.length ? c.holds.includes(r.i) : c.row === r.i)).map(([rid]) => rid);
    const uses = graph.value.uses.get(id) ?? [], by = usedBy(P.name), m = pageModel();
    const thing = n => { const x = defNamed(n); return x && x.id !== id ? html`<button class="fx-link" onClick=${() => openPage(x.id)}>${n}</button>` : html`<span>${n}</span>`; };
    const list = xs => xs.map((n, i) => html`${i ? html`<span class="sep">·</span>` : null}${thing(n)}`);
    const p = pending.value;
    return html`<div class="fx-doc" onKeyDown=${onKey}>
      <header class="fx-doc-head">
        <h1 class="page-title">${P.name}</h1>
        <span class="fx-count">${gives}</span>
        <button class="btn icon" aria-label="Close" data-tip="Close" data-keys="Esc" onClick=${closePage}>${Shell.icon('x')}</button>
      </header>
      <div class="fx-sig">${sidesOf(P, note).filter(s => s.text).map(s => html`<span><span class="k">${s.edge}</span>${s.text}</span>`)}<span><span class="k">Type</span>${typeOf(P)}</span></div>
      ${lead.map(t => html`<p class="fx-lead">${t}</p>`)}
      <ol class="fx-clauses">${groups.map((g, gi) => {
        const ids = attests(g);
        return html`<li class=${'fx-clause' + (g.rows.length ? '' : ' unwritten') + (g.rows.every(r => r.gone) && g.rows.length ? ' gone' : '')} data-key=${g.rows[0]?.key ?? 'u' + gi} data-keys=${g.rows.length ? g.rows.map(r => r.key).join(' ') : null}
          onPointerEnter=${() => { pageLight.value = ids; }} onPointerLeave=${() => { pageLight.value = null; }}>
          ${g.rows.length ? html`<span class="fx-grip" aria-hidden="true" onPointerDown=${e => dragRow(e, id)} />` : html`<span />`}
          <span class="fx-label">${g.label}</span>
          <p class="fx-law">${g.law}</p>
          <div class="fx-forms">${g.rows.length ? g.rows.map(r => html`<${Typeset} key=${r.key} r=${r} m=${m} />`)
            : html`<button class="fx-unwritten" onClick=${() => { const key = newKey(); change(id, xs => [...xs, { key, label: g.label, formula: P.type === 'tag' ? '← ' : '= ' }]); pageEdit.value = key; }}>${P.type === 'tag' ? '←' : '='}</button>`}</div>
          ${ids.length ? html`<button class="fx-n" onClick=${() => Shell.select(ids)}>${ids.length}</button>` : html`<span class="fx-n" />`}
        </li>`;
      })}</ol>
      <button class="btn icon fx-add" aria-label="Add a row" data-tip="Add a row" onClick=${() => { const key = newKey(); change(id, xs => [...xs, { key, label: '', formula: P.type === 'tag' ? '← ' : '= ' }]); pageEdit.value = key; }}>${Shell.icon('plus')}</button>
      ${tail.map(t => html`<p class="fx-lead">${t}</p>`)}
      ${p?.from === 'bar' && d ? html`<div class="fx-doc-pend"><${Delta} p=${p} /><span class="fx-acts">
        <button class="btn" onClick=${discard}>Discard</button><button class="btn primary" onClick=${commitDraft}>Commit</button></span></div>` : null}
      ${uses.length || by.length ? html`<dl class="fx-uses">
        ${uses.length ? html`<dt>Uses</dt><dd>${list(uses)}</dd>` : null}
        ${by.length ? html`<dt>Used by</dt><dd>${list(by.map(x => x.name))}</dd>` : null}
      </dl>` : null}
    </div>`;
  }

  // A row set as a statute sets a clause: a top-level OR or AND on a line of its own with a hanging indent,
  // functions and keywords in small capitals, other definitions' names as links. Clicked, it's edited in place.
  function Typeset({ r, m }) {
    if (pageEdit.value === r.key && !r.gone) return html`<div class="fx-edit"><${Formula} row=${{ ...r, ev: null }} m=${m} focus /></div>`;
    const lines = [[]];
    let depth = 0;
    for (const t of tokens(r.formula)) {
      if (/^[({]$/.test(t.text)) depth++;
      if (/^[)}]$/.test(t.text)) depth--;
      if (!depth && t.style === 'keyword' && /^(and|or)$/i.test(t.text) && lines.at(-1).some(x => x.text.trim())) lines.push([]);
      lines.at(-1).push(t);
    }
    const span = t => {
      const x = t.style === 'variable' && defNamed(unbracket(t.text));
      if (x && x.id !== m.def.id) return html`<button class="fx-link" onClick=${e => { e.stopPropagation(); openPage(x.id); }}>${t.text}</button>`;
      return t.style ? html`<span class=${'cm-' + t.style}>${t.text}</span>` : t.text;
    };
    return html`<div class=${'fx-set' + (r.gone ? ' gone' : '')} onClick=${() => { if (!r.gone) pageEdit.value = r.key; }}>${lines.map((l, i) => html`<div class=${i ? 'cont' : null}>${l.map(span)}</div>`)}</div>`;
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
      ...inputs.peek().defs.filter(d => d.datatype === 'percent').map(d => norm(d.name))]);
    return { value: show(v, /%/.test(text) || tokens(text).some(t => t.style === 'variable' && percents.has(norm(unbracket(t.text))))) };
  });

  Shell.register('formulabar', Bar);
  // For tests and other parts: open and close a page; preview and commit a change; edit a definition's rows.
  return { open: openPage, close: closePage, preview, commit, edit: change, commitEdit: commitDraft, discard, back, flipped, reaching,
    model, finder, pending, draft, hover, page };
})();
