// The inspector (dendra.md, Part 2): the panel on the right, showing whatever is selected. Nothing: the view.
// A record: its entries as a tree, its relatives by list, its documents, and on a chart its look. Two: what
// holds between them, in sentences, and what else could. An entry, relation or kind in general: what it's called and means, and its
// definition, set out as the statute it encodes, whose rows the formula bar edits. A free shape: its text, look
// and place; the Key, its title, columns and rows.
const Inspector = (() => {
const { html, emit, on, select, menu, icon, general } = Shell;
const { render } = preact;
const { useState, useRef, useLayoutEffect } = preactHooks;
const { signal, computed } = preactSignals;
const T = Tree;

// ---- Reading ----
const recs = () => App.state.value;
const N = () => App.notes.value;
const fx = id => !!App.computed.value.computed?.[id];
const over = id => !!App.computed.value.covered?.[id];
// An entry overrides its formula only where it says otherwise; there, and only there, the amber corner.
const overrides = id => App.computed.value.covered?.[id]?.agrees === false;
const tree = id => T.treeOf(recs(), id);
const entriesAt = id => T.index(recs()).entries.get(id) ?? [];
const relationsAt = id => T.index(recs()).relations.get(id) ?? [];
const within = id => { const out = [id]; for (let i = 0; i < out.length; i++) out.push(...entriesAt(out[i])); return out; };
const objectOf = id => T.objectOf(recs(), id);
const entryNamed = (id, edge) => T.entryAt(recs(), id, edge);
const nameOf = id => N().nameOf(recs(), id);
const shortOf = id => N().shortOf(recs(), id);
const patternOf = id => { const t = tree(id); return t.args ? T.bare(T.specOf(t)) : { kind: t.kind }; };
// A tree with every label removed but its edges: what renaming an edge or option reaches.
const loose = t => t.args ? { args: t.args.map(a => ({ edge: a.edge, loc: loose(a.loc) })) } : {};
const short = iso => T.formatDate(iso, 'short');
const typeName = s => 'field' in s.out ? T.DATATYPES[s.out.field] : 'choice' in s.out ? 'Choice' : 'Tag';
// Where a specification is, as a pattern reads: its kind, then each step's label (and option).
const step = (edge, out) => out && 'choice' in out ? `${edge}: ${out.choice}` : out?.tag === false ? `Not ${edge}` : edge;
const where = s => s.kind !== undefined ? s.kind : !s.args ? '' : s.args.length > 1 ? N().name(s) : `${where(s.args[0].loc)} › ${step(s.args[0].edge, s.out)}`;
const viewShown = () => App.views.value.find(v => v.id === Shell.view.value) ?? null;
const openDef = id => { const n = N().notes('Formula').find(x => x.note === id && !x.view); if (n) select([general(n.pattern)]); };
// Words: "a" or "an"; words begun mid-sentence, in lower case but for initials (GP, BDC); a sentence's first
// letter; and a record by its short name mid-sentence, which as a defined term reads "the BDC".
const article = w => /^[aeiou]/i.test(w) ? 'an' : 'a';
const lower = s => s.replace(/\b[A-Z](?=[a-z])/g, c => c.toLowerCase());
const upper = s => s.replace(/^./, c => c.toUpperCase());
// A name as the chart sets it, its suffix kept to it ("BDC, Inc."), so it never stands alone on a line.
const bound = s => Scene.bind(s);
const termOf = at => { const o = objectOf(at), s = shortOf(o); return bound(s !== nameOf(o) ? s.replace(/^The /, 'the ') : s); };
// A record as a step on its path, in the chart's words, as the formula bar says it: "AIV-1, tax year 2025".
const segment = x => bound(N().segmentOf(recs(), x));
// The way down to a record in its object, where a side is at one ("› Jurisdiction: Delaware"), said only where
// the object has another record there, so that the side could be at either (two jurisdictions, say).
const placeIn = x => JSON.stringify(T.pathOf(recs(), x).slice(1).map(y => T.norm(recs()[y].edge)));
const trail = at => { const o = objectOf(at), p = placeIn(at);
  return at !== o && within(o).some(x => x !== at && placeIn(x) === p) ? T.pathOf(recs(), at).slice(1).map(segment).join(' › ') : null; };
// Why a formula gives a record: the row the formula bar says decided it, by its clause cited in full
// (§2(a)(3)(C)), so both panes give one reason, and the statute's words for it; `label` is that row's own.
function because(id) {
  const g = FormulaBar.reason?.(id);
  if (g) return { label: g.label, cite: g.cite ?? g.label, words: g.words ?? null };
  const c = App.computed.value.computed[id];
  return c?.label ? { label: c.label, cite: FormulaBar.citeOf?.(c.def, c.label) ?? c.label, words: null } : null;
}

// What needs attention as of the day shown (App.needs), by record: a date a formula gives is overdue once the
// day is past it, and due soon within 30 days of it; a blank is a required entry missing.
const needsAt = computed(() => Map.groupBy(App.needs.value, a => a.id));
const later = (iso, days) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + days); return T.isoOf(d); };
const dueOf = id => needsAt.value.get(id)?.find(a => a.kind === 'overdue' || a.kind === 'soon')?.kind ?? null;
const DUE = { overdue: 'overdue', soon: 'due soon' };
// A date's text, kept on one line: red when overdue and amber when due soon, saying so to a screen reader.
const dated = (id, text) => { const d = dueOf(id); return html`<span class=${'date' + (d ? ' ' + d : '')}>${text}${d ? html`<span class="sr"> (${DUE[d]})</span>` : null}</span>`; };

// What a filing records for a due date: the first date its rule reads, at it or beside it, that's neither a
// start, an end nor worked out (Last Annual Amendment, Annual Tax Paid). The rule is the due date's own row, and then
// the row that gave the relation it's at. Kept for each working-out, as Find asks it at each key typed.
const filings = new WeakMap();
function filingOf(due) {
  const R = App.computed.value, kept = filings.get(R) ?? filings.set(R, new Map()).get(R);
  if (!kept.has(due)) kept.set(due, filingIn(R, due));
  return kept.get(due);
}
function filingIn(R, due) {
  for (let id = due; recs()[id] && R.computed[id]; id = recs()[id].at) {
    const c = R.computed[id], text = App.definitions.value.find(d => d.id === c.def)?.rows[c.row]?.formula, at = recs()[id].args ? id : recs()[id].at;
    let ev = null;
    try { ev = text && Formulas.evaluateRow(R, c.def, c.row, at); } catch {}
    for (const nm of ev?.names ?? []) {
      const r = recs()[nm.ids[0]], before = text[nm.from - 1] === '.' && ev.names.find(p => p.to === nm.from - 1);
      const loc = r ? r.at : before ? before.ids[0] : at, edge = r?.edge ?? text.slice(nm.from, nm.to).replace(/^\[|\]$/g, '');
      if (!recs()[loc] || (r && (r.field !== 'date' || fx(nm.ids[0])))) continue;
      const spec = specsAt(tree(loc), edge).find(s => s.out.field === 'date');
      if (!spec) continue;
      const t = { out: { field: 'date' }, args: [{ edge, loc: tree(loc) }] };
      if (!N().isStart(t) && !N().isEnd(t)) return { id: r ? nm.ids[0] : null, at: loc, edge: spec.args[0].edge };
    }
  }
  return null;
}

// The specifications of entries with this edge at locations like t, and what one takes there.
const specsAt = (t, edge) => Object.values(App.schema.value).filter(s => s.args?.length === 1 && T.same(s.args[0].edge, edge) && T.narrower(t, s.args[0].loc));
const optionsOf = specs => N().optionsOf(specs);
function kindAt(t, edge) {
  const specs = specsAt(t, edge), s = specs[0];
  return !s ? { type: 'field', datatype: null } : 'field' in s.out ? { type: 'field', datatype: s.out.field } : 'choice' in s.out ? { type: 'choice', options: optionsOf(specs) } : { type: 'tag' };
}

// Required entries that are blank at a record: their label.
const blanksAt = at => (needsAt.value.get(at) ?? []).filter(a => a.kind === 'blank').map(a => ({ at, edge: a.edge }));

// Where an error stands, as the entry its value would be: the record it's at, and its label.
const placeOf = e => e.args?.length === 1 ? e.args[0] : e.at ? { at: e.at, edge: App.definitions.value.find(d => d.id === e.def)?.name } : null;

// A record's entries, the errors where a formula would put one, and blank required ones (or, `all`, every
// entry it could have and hasn't, but a check, which is its formula's to give and shows where it fails); in
// Order, Name first.
function slots(at, all) {
  const r = recs(), own = !!r[at]?.kind, slot = (edge, x) => ({ edge, ...x, t: { args: [{ edge, loc: tree(at) }] } });
  const ents = entriesAt(at).map(id => ({ id, edge: r[id].edge, t: tree(id), pinned: T.same(r[id].edge, 'Name') }));
  // (What can't be said of a yes-or-no for want of a value stands where its box would, in its own state: dendra.md, Definitions: Can't say.)
  const errors = App.computed.value.errors.map(e => [e, placeOf(e)]).filter(([, p]) => p?.edge && p.at === at && !entryNamed(at, p.edge)).map(([e, p]) => slot(p.edge, { error: e, at, cant: e.error.code === '#N/A' && App.definitions.value.find(d => d.id === e.def)?.type === 'tag' }));
  const blanks = blanksAt(at).filter(b => !errors.some(e => T.same(e.edge, b.edge))).map(b => slot(b.edge, { ...b, blank: true }));
  // A tag its rule hasn't tested here says so, apart from no (dendra.md, Definitions: Not tested); and one whose rule reads a rule in
  // error says it can't say, for its silence here would read as no.
  const { reach } = App.broken.value, silent = d => d.type === 'tag' && !d.edges && ![...errors, ...blanks].some(x => T.same(x.edge, d.name)) && Formulas.silence(N(), App.schema.value, r, at, d.name);
  const unsure = reach.size ? App.definitions.value.filter(d => reach.has(d.id) && silent(d)).map(d => slot(d.name, { at, unsure: d.id })) : [];
  const untested = App.definitions.value.filter(d => !reach.has(d.id) && silent(d) === 'untested').map(d => slot(d.name, { at, na: true }));
  // What a check that says something here reads of this record, where it has none, is an empty row: what's missing can be seen, and typed.
  const known = [...errors, ...blanks, ...unsure, ...untested], R = App.computed.value, read = own ? App.definitions.value.filter(d => d.type === 'tag' && !d.edges && (R.rows[d.id] ?? []).some(x => x.at === at) && N().check({ args: [{ edge: d.name, loc: tree(at) }] }))
    .flatMap(d => Formulas.readsAt(R, d.id)).filter((e, i, l) => l.findIndex(x => T.same(x, e)) === i && !entryNamed(at, e) && !known.some(x => T.same(x.edge, e)) && specsAt(tree(at), e).length && !App.definitions.value.some(d => T.same(d.name, e))).map(e => slot(e, { at, open: true })) : [];
  const given = [...known, ...read], asked = offered.value.filter(o => o.at === at && !entryNamed(at, o.edge) && !given.some(x => T.same(x.edge, o.edge))).map(o => slot(o.edge, { at, open: true, made: true }));
  const open = all ? unentered(at).map(s => s.args[0].edge).filter(e => ![...given, ...asked].some(x => T.same(x.edge, e))).map(edge => slot(edge, { at, open: true })).filter(x => !N().check(x.t)) : [];
  const out = [...ents.filter(e => !(own && e.pinned)), ...given, ...asked, ...open].map(x => ({ ...x, o: x.pinned ? -1 : N().order(x.t) ?? Infinity, p: placed(at, x) }))
    .sort((a, b) => a.o - b.o || a.p - b.p || a.edge.localeCompare(b.edge));
  // Offered, the first not yet given, blank or not, is typed into at once.
  const first = all && out.find(x => x.open || x.blank);
  if (first) first.auto = true;
  return out;
}
// Where an entry no Order places goes, as a form sets its fields: what it is (an option, words), then its
// figures, then its dates, the start first and the end last, then its tags and its documents.
function placed(at, x) {
  const r = x.id && recs()[x.id], k = r ? { type: T.typeOf(r), datatype: r.field } : kindAt(tree(at), x.edge), dt = k.datatype;
  if (k.type === 'choice' || dt === 'text') return 0;
  if (k.type === 'tag') return 5;
  if (dt === 'document') return 6;
  if (dt !== 'date') return 1;
  const t = { out: { field: 'date' }, args: [{ edge: x.edge, loc: tree(at) }] };
  return N().isStart(t) ? 2 : N().isEnd(t) ? 4 : 3;
}
// The specifications of entries a record could have and hasn't, Name aside, one an edge.
function unentered(at) {
  const t = tree(at), have = new Set(entriesAt(at).map(e => T.norm(recs()[e].edge))), known = new Map();
  for (const s of Object.values(App.schema.value)) if (s.args?.length === 1 && !have.has(T.norm(s.args[0].edge)) && !T.same(s.args[0].edge, 'Name') && T.narrower(t, s.args[0].loc)) known.set(T.norm(s.args[0].edge), s);
  return [...known.values()];
}

// A document is an object with a link among its entries.
const linkOf = id => entriesAt(id).find(e => recs()[e].field === 'document');
// A kind whose records can have a link: a document, whether or not this one has it yet.
const docKinds = computed(() => new Set(Object.values(App.schema.value).filter(s => s.out?.field === 'document' && s.args?.length === 1 && s.args[0].loc.kind).map(s => T.norm(s.args[0].loc.kind))));
const docKind = k => !!k && docKinds.value.has(T.norm(k));
// A record's relatives by list (Owners, Holdings), and its documents. A relation located anywhere in it
// lists its other sides under the name of their list, the first side by its edges' order and the rest beside.
// A relation ruled out makes no relative: it's said once, as a "not", on the side its edges name first.
// Kept for each record while the state and the notes stand, as Find asks it of every object at each key typed.
const relativesKept = new WeakMap();
function relatives(id) {
  const r = recs(), n = N();
  let kept = relativesKept.get(r);
  if (kept?.n !== n) relativesKept.set(r, kept = { n, by: new Map() });
  return kept.by.get(id) ?? kept.by.set(id, relativesOf(id)).get(id);
}
function relativesOf(id) {
  const r = recs(), lists = new Map(), docs = [], nots = [];
  for (const loc of within(id)) for (const rid of relationsAt(loc)) {
    const rel = r[rid], t = tree(rid), mine = rel.args.find(a => a.at === loc);
    if (!t || !mine) continue;
    const edges = N().edges(t), arg = e => rel.args.find(a => a !== mine && T.same(a.edge, e)), [first, ...rest] = edges.filter(e => !T.same(e, mine.edge)).map(arg);
    if (!first) continue;
    const item = { rid, obj: objectOf(first.at), rest, mine: mine.edge, edge: first.edge };
    if (rel.tag === false) { if (T.same(edges[0], mine.edge)) nots.push(item); continue; }
    if (linkOf(item.obj)) { docs.push(item); continue; }
    // (One list for one kind of paper: a certificate with no link yet is a document as any is.)
    if (docKind(r[item.obj]?.kind)) { docs.push(item); continue; }
    const name = N().listName(t, first.edge);
    (lists.get(name) ?? lists.set(name, []).get(name)).push(item);
  }
  // Each by its short name, read once.
  const shorts = new Map(), named = o => shorts.get(o) ?? shorts.set(o, r[o]?.args ? segment(o) : shortOf(o)).get(o), by = (a, b) => named(a.obj).localeCompare(named(b.obj));
  return { lists: [...lists].sort(([a], [b]) => a.localeCompare(b)).map(([name, items]) => [name, items.sort(by)]), docs: docs.sort(by), nots: nots.sort(by) };
}

// What's coming (dendra.md, Time): relations that hold only from a later day, by the object each is at, shown in its lists,
// faint, with the day. Those that can be: a relation with a row or a date after the day shown, or at what has one. Kept
// while the workbook and the day stand.
const coming = computed(() => {
  App.version.value;
  const wb = App.shown.value, c = App.chart.value, now = App.day.value, st = recs(), n = N(), out = new Map();
  if (!c) return out;
  const rows = wb.rows(c).filter(r => 'record' in r), ahead = new Set(), rels = new Set();
  for (const r of rows) { if (r.since > now) ahead.add(r.record); if (r.field === 'date' && r.value > now && r.at) ahead.add(r.at); if (r.args?.length > 1 && !st[r.record]) rels.add(r); }
  const seen = new Set();
  for (const r of rels) {
    if (seen.has(r.record) || !(ahead.has(r.record) || r.args.some(a => ahead.has(a.at)))) continue;
    seen.add(r.record);
    const on = App.heldFrom(r.record, now), then = on && wb.asOf(c, on), rel = then?.[r.record], t = rel && T.treeOf(then, r.record);
    if (!t) continue;
    const edges = n.edges(t), at = T.index(then).entries.get(r.record) ?? [], figure = at.map(x => then[x]).find(x => ['percent', 'number', 'money'].includes(x.field));
    const role = 'choice' in rel ? rel.choice : figure ? T.format(figure.field, figure.value) : at.map(x => then[x]).find(x => 'choice' in x)?.choice ?? null;
    for (const a of rel.args) {
      const o = T.objectOf(then, a.at), other = edges.filter(e => !T.same(e, a.edge)).map(e => rel.args.find(b => T.same(b.edge, e)))[0];
      if (!other || !o) continue;
      const them = T.objectOf(then, other.at), doc = (T.index(then).entries.get(them) ?? []).some(x => then[x].field === 'document');
      if (doc) continue;
      (out.get(o) ?? out.set(o, []).get(o)).push({ rid: r.record, on, then, obj: them, role, name: n.listName(t, other.edge), says: then[them]?.args ? n.segmentOf(then, them) : n.shortOf(then, them), full: n.nameOf(then, them) });
    }
  }
  return out;
});

// Rows that disagree, by the record each is of: both answers, each with who gave it.
const disagreeing = computed(() => {
  const m = new Map();
  App.version.value;
  for (const g of App.shown.value.disagreements(App.chart.value)) for (const x of g.rows) if (x.row.record) m.set(x.row.record, g);
  return m;
});

// ---- Changing: each edit one change, through App.change ----
// A record, or a blank one, with another output (App.put), asking from when where it has history to keep. A start or an
// end entry typed past the day shown takes what it's at out of the chart then, and all that's at that: the redline
// strikes it, and the toast says why (App.change).
const withOut = (id, slot, out) => { const r = recs()[id] ?? slot; return { ...(r.args ? { args: r.args } : { at: r.at, edge: r.edge }), ...out }; };
const { enterAt, putting, put } = App;
// What it would change, as the formula bar redlines it: the records it would leave, as it would leave them.
const putChange = (id, slot, out) => App.would(tx => putting(tx, id, slot, out), { dated: App.asksFrom(id, out) ? App.day.peek() : true });
const flipped = id => ({ tag: !(recs()[id]?.tag ?? false) });
const flip = (id, slot) => put(id, slot, flipped(id), { auto: true });
// Deleting, as every deletion is made: redlined first, the bar asking until when where a record ends on a day
// (App.deleting), Enter making it. A relation by its place, an entry by where it is.
const said = id => { const r = recs()[id]; return r.args ? `${nameOf(id)}: ${segment(id)}` : r.edge !== undefined ? `${r.edge} of ${N().whereOf(recs(), r)}` : nameOf(id); };
// A relation gone to from a record's panel, ended, comes back to that record, scrolled where it was (dendra.md, inspector).
const remove = (id, o = {}) => { const from = cameFrom?.to === id ? cameFrom : null; App.deleting([id], said(id), { source: 'inspector', ...o, ...(from && { done: () => { backTo = { key: from.keys.join(), top: from.top }; select(from.keys); } }) }); };
// A deletion pending of a record, as its redline shows it here as on the chart: the end entry it gives it, in blue, and
// the record struck where it goes as of the day shown.
const deletion = id => { const p = App.pending.value; return p?.verb === 'Delete' && p.chart === App.chart.value && p.needs?.includes(id) ? p : null; };
const ending = (id, edge) => { const p = deletion(id); return p && typeof p.word === 'string' && p.day && T.same(p.word, edge) ? p.day : null; };
// Struck wherever a change pending takes it away as of the day shown: deleted, or transferred whole.
const goes = id => { const p = App.pending.value, red = FormulaBar.pending.value; return p?.chart === App.chart.value && red?.from === 'pending' && !!recs()[id] && !!red.R2 && !(id in red.R2.records); };
// Adds an entry, and its specification if the schema hasn't got it.
function addEntry(at, edge, out, { recurs = false } = {}) {
  const spec = { out: 'field' in out ? { field: out.field } : 'choice' in out ? { choice: out.choice } : { tag: out.tag }, args: [{ edge, loc: T.specOf(tree(at)) }] };
  // (A date that recurs, a questionnaire's, says its own day: it holds from then, and the next stands beside it. dendra.md, Time.)
  App.change(tx => { if (!App.schema.value[T.key(spec)]) tx.add('spec', { tree: spec }); if (recurs) tx.note('Fixed', T.bare(spec), false); tx.add('record', enterAt(tx, { at, edge, ...out, ...(recurs && out.value <= App.day.peek() && { since: out.value }) })); }, recurs ? { dated: false } : undefined);
}
// A new yes-or-no is only specified: this record's answer is left to a rule, or to its box, offered here, ticked by a hand that means
// it. A hand tick from making the field would beat the rule written next. A check is one whose failures count as errors, and it goes
// straight to its rule. One change either way.
const offered = signal([]);     // yes-or-noes made from a record, offered in its panel till it's left: [{ at, edge }]
function makeTag(at, edge, check = false) {
  const spec = { out: { tag: true }, args: [{ edge, loc: T.specOf(tree(at)) }] }, p = T.bare(spec), what = check ? 'check' : 'yes-or-no';
  App.change(tx => { if (!App.schema.value[T.key(spec)]) tx.add('spec', { tree: spec }); if (check) tx.note('Check', p, true); tx.says(`Added the ${what} ${edge}`); }, { dated: false, say: `Added the ${what} ${edge}` });
  if (!check) { offered.value = [...offered.peek(), { at, edge }]; return; }
  select([general(p)]);
  FormulaBar.define(p);
}
const moved = (list, from, i) => { const l = list.slice(); l.splice(i, 0, l.splice(from, 1)[0]); return l; };
// Reordering writes Order at each sibling's pattern: its edge at its location's specification.
function reorder(at, ids) {
  const loc = T.specOf(tree(at));
  App.change(tx => ids.forEach((e, i) => { if (N().order(tree(e)) !== i + 1) tx.note('Order', { args: [{ edge: recs()[e].edge, loc }] }, i + 1); }));
}
const rename = (id, to) => { const r = recs()[id]; if (to && !T.same(to, r.edge)) App.change(tx => tx.rename({ args: [{ edge: r.edge, loc: loose(tree(r.at)) }] }, r.edge, to)); };
const moveUp = id => { const r = recs()[id]; App.change(tx => tx.moveUp({ args: [{ edge: r.edge, loc: T.bare(T.specOf(tree(r.at))) }] }), { say: `Moved ${r.edge} up` }); };

// Links a document the chart's way: an object with a link, related to the record as the relation whose
// other side has one (Concerns), or else a Document, Concerning it as its Subject.
function link(at, url, name = T.linkOf(url).short) {
  const S = Object.values(App.schema.value), t = tree(at);
  const linkSpec = loc => S.find(s => s.out?.field === 'document' && s.args?.length === 1 && loc.kind && T.same(s.args[0].loc.kind, loc.kind));
  const rel = S.find(s => s.args?.length === 2 && s.args.some(a => linkSpec(a.loc)) && s.args.some(a => !linkSpec(a.loc) && T.narrower(t, a.loc)));
  const doc = rel?.args.find(a => linkSpec(a.loc)), subj = rel?.args.find(a => a !== doc);
  const kind = doc?.loc.kind ?? 'Document', edge = doc ? linkSpec(doc.loc).args[0].edge : 'Link';
  App.change(tx => {
    const d = tx.add('record', { kind });
    tx.add('record', { at: d, edge: 'Name', field: 'text', value: name });
    tx.add('record', { at: d, edge, field: 'document', value: url });
    tx.add('record', { args: [{ edge: doc?.edge ?? 'Document', at: d }, { edge: subj?.edge ?? 'Subject', at }], tag: true });
  }, { say: `Linked ${name}` });
}
const pickLink = at => SharePoint.pick({ multiple: true }).then(items => (items ?? []).forEach(it => it.link && link(at, it.link, it.name)), e => Shell.toast(e.message));

// ---- Pieces ----
const GRIP = Shell.icon('grip');
const OPEN = Shell.icon('open');
const draft = signal(null);     // an entry being added: { at, type, edge?, datatype?, options? }
const renaming = signal(null);  // the entry whose label is being typed over
const aim = signal(null);       // a row or list to bring into view and focus, by its key
const linking = signal(null);   // the record a link is being typed for
const fresh = signal(null);     // a relation the two-box panel just added, its entries offered at once: { a, b, key }
const naming = signal(null);    // a relation of a new name being typed in the two-box panel: { a, b, name, ra, rb }

// A relation between two boxes, begun as a change pending (App.relating), however it's begun: ticked and redlined in the
// two-box panel, its amount and its day asked in its row there and in the bar (its Percentage, then From the day shown,
// or its start entry); Enter adds it with them, and the panel offers its entries. `key` names the panel's row; `out`, its
// tick, role or value.
function begin(a, b, key, out, rec) {
  const st = { ...recs(), '': rec }, sides = N().placed(recs(), null, rec.args).map(s => s.join + (recs()[s.id]?.args ? rowName(s.id) : s.text)).join('');
  // A document said to evidence or concern something offers its own date.
  const papered = rec.args.map(x => objectOf(x.at)).find(x => docKind(recs()[x]?.kind)), dated = papered && entriesAt(papered).map(e => recs()[e]).find(e => e.field === 'date')?.value;
  App.relating(rec, { what: `${N().nameOf(st, '')}: ${sides}`, source: `relate ${a} ${b}`, relate: { a, b, key, out }, ...(dated && { day: dated }),
    needs: rec.args.map(x => x.at).filter(x => !fx(x)), make: tx => tx.add('record', enterAt(tx, rec)), say: c => Time.describe(c), done: () => { fresh.value = { a, b, key }; } });
}

// A name that selects what it names: a button, reached by Tab, set as text. `tip` is said on hover: where it goes, or a
// reason's own words. A relation gone to from a record's panel is remembered, so ending it comes back there (`cameFrom`).
let cameFrom = null, backTo = null;
// Gone to from a panel, the way back is at its top, named for where it came from, scrolled where it was (Alt+← walks further).
const cameBack = signal(null);
const goTo = to => {
  const ks = [].concat(to), now = Shell.selection.peek(), top = host?.closest('.inspector')?.scrollTop ?? 0;
  if (ks.length === 1 && recs()[ks[0]]?.args && now.length === 1 && recs()[now[0]]) cameFrom = { to: ks[0], keys: now, top };
  cameBack.value = now.length === 1 && recs()[now[0]] && (recs()[now[0]].kind || recs()[now[0]].args) ? { to: ks.join(), keys: now, top, name: recs()[now[0]].args ? `${nameOf(now[0])}: ${segment(now[0])}` : shortOf(now[0]) } : null;
  select(ks);
};
const CameBack = ({ id }) => { const b = cameBack.value; return b?.to === id ? html`<button type="button" class="lk crumb" onClick=${() => { cameBack.value = null; backTo = { key: b.keys.join(), top: b.top }; select(b.keys); }}>${icon('chevron-left')}<span>${bound(b.name)}</span></button>` : null; };
const Go = ({ to, cls = '', title, tip, children }) => html`<button class=${'lk ' + cls} title=${title} data-tip=${tip || null} onClick=${() => goTo(to)}>${children}</button>`;

// Where Enter goes from a value or a tag's box, as in Excel: down (d = 1) or up (-1) to the next value to type in its
// part of the panel (a section, or a relation's entries), never one a formula gives, whose why would take the chart
// over; or else to its own row, so that a key typed next is the window's.
const PART = 'section, .rr-at, .relate';
function onward(el, d) {
  const part = el.closest(PART), all = [...el.closest('.insp')?.querySelectorAll('.hug > .cell') ?? []].filter(x => x.closest(PART) === part && !x.disabled && !('fx' in x.dataset));
  const after = x => el.compareDocumentPosition(x) & Node.DOCUMENT_POSITION_FOLLOWING;
  const to = d > 0 ? all.find(after) : all.findLast(x => x !== el && !after(x)), row = !to && el.closest('.row, .rr, .ih');
  if (row) row.tabIndex = -1;
  return to ?? row;
}

// Drags a row among its siblings (those with the same data-drag); a click without moving is a click.
function drag(e, onDrop, onClick) {
  if (App.readOnly.peek()) return;
  const grip = e.currentTarget, item = grip.closest('[data-drag]');
  Shell.drag(e, { item, items: [...item.parentElement.children].filter(x => x.dataset.drag === item.dataset.drag), onDrop, onClick: onClick && (() => onClick(grip)) });
}

// A value typed over, as a cell is in Excel. Focused, it's selected whole, so typing replaces it, and until
// something is typed Undo and Redo are the window's. Enter keeps what's typed and goes down to the next value
// (Shift+Enter, up), or else to its row; leaving keeps it; Esc puts it back. So a value never shows other than
// the record but while it's typed, and then the new text is redlined in blue and the old struck in red. A
// document shows its name, and its address to edit. `label` names it; `due` marks a date overdue or due soon.
// Text, and a title, wrap, as many lines as they take; a title's name keeps its suffix (Scene.bind). With `preview`,
// what keeping it would change (out → a change), the formula bar redlines that while it's typed, as it does a value
// typed in the bar, so the chart is laid out ahead as Enter leaves it.
function Field({ r, datatype, put, preview, fx, over, id, auto, ph, cls = '', title, label, due, held = null, reads, looks, children }) {
  const doc = datatype === 'document', shown = r ? T.format(r.field, r.value) : '', raw = r ? (doc ? r.value : shown) : '';
  // What's typed, null while nothing is; kept in a ref too, as a blur can come after the record has gone. `held`, what
  // was typed, pending (App.put): shown as typed is, till it's made or discarded, and typed over again.
  const [text, setText] = useState(null), [bad, setBad] = useState(false), ref = useRef(), typed = useRef(null), clicked = useRef(false), previewed = useRef(null), now = text ?? held;
  // What text typed keeps: its output, null where it's cleared, undefined where it doesn't read; false where it's as it was.
  const outOf = t => {
    if (t === null || t === T.clean(raw)) return false;
    const dt = datatype ?? T.classify(t), v = t ? (reads ?? (x => T.parse(dt, x)))(t) : null;
    return v === undefined ? undefined : t ? { field: dt, value: v } : null;
  };
  const redline = c => { const k = c ? JSON.stringify(c) : null; if (k !== previewed.current) { previewed.current = k; FormulaBar.preview(c); } };
  const type = t => {
    typed.current = t;
    setText(t);
    if (preview) { const out = t === null ? false : outOf(T.clean(t)); redline(out === false || out === undefined ? null : preview(out)); }
  };
  useLayoutEffect(() => { if (auto) ref.current?.focus(); return () => { if (previewed.current) FormulaBar.preview(null); }; }, []);
  const typing = () => typed.current !== null && T.clean(typed.current) !== T.clean(raw), dirty = now !== null && T.clean(now) !== T.clean(raw);
  // Keeps what's typed, where it reads; false where it doesn't. Typed back to what it was, what's pending of it goes.
  const done = keys => {
    const out = outOf(typed.current === null ? null : T.clean(typed.current)), back = held !== null && typed.current !== null;
    if (out === false) { type(null); if (back) put(false); return true; }
    if (out === undefined) { setBad(true); return false; }
    type(null);
    put(out, { auto: keys });
    return true;
  };
  const asked = () => !!id && !!App.pending.peek()?.typed?.some(t => t.id === id);
  const key = e => {
    const el = e.currentTarget, mod = (e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase();
    // Enter keeps it and goes on, but where it asks from when, whose day the keys go to, and from a name, which stays on
    // its head, not selecting the next field to be typed over. Pending and left as it is, Enter makes it.
    if (e.key === 'Enter') {
      e.preventDefault();
      if (held !== null && typed.current === null) { App.commit(); return; }
      const to = title ? el.closest('.ih') : onward(el, e.shiftKey ? -1 : 1);
      if (title && to) to.tabIndex = -1;
      if (done(true) && !asked()) to?.focus();
    }
    // Esc puts back what was typed and keeps the keys here, the value selected, as Excel's keeps its cell; with
    // nothing typed, it leaves for its row, so a key typed next is the window's. What's pending of it, Esc discards.
    else if (e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation();
      if (typing() || bad) { type(null); setBad(false); setTimeout(() => el.isConnected && el.select()); }
      // What's waiting, from here or from a value beside it, goes; it's the thing there is to escape.
      else if (held !== null || App.pending.peek()?.typed) { type(null); App.discard(); setTimeout(() => el.isConnected && el.select()); }
      else { const row = el.closest('.row, .rr, .ih'); if (row) { row.tabIndex = -1; row.focus(); } else el.blur(); }
    }
    else if ((mod === 'z' || mod === 'y') && !typing()) {
      e.preventDefault(); type(null); setBad(false);
      Shell.parts.peek().action?.find(a => a.id === (mod === 'y' || e.shiftKey ? 'redo' : 'undo'))?.run();
      setTimeout(() => document.activeElement === el && el.select());
    }
  };
  const wrap = title || (r?.field ?? datatype) === 'text', Box = wrap ? 'textarea' : 'input';
  // Typed over, what it said is struck before what's typed, whole, as comparison software prints the two.
  return html`<label class=${'cellbox' + (title ? ' title' : '') + cls}>${dirty && raw ? html`<s class=${'del' + ((r?.field ?? datatype) === 'date' ? ' date' : '')}>${shown}</s>` : null}<span class=${'hug' + (over ? ' over' : '') + (due && now === null ? ' ' + due : '')}>
    <${Box} ref=${ref} rows=${wrap ? 1 : null} class=${'cell' + ((r?.field ?? datatype) === 'date' ? ' date' : '') + (fx && now === null ? ' fx' : '') + (dirty && T.clean(now) ? ' add' : '') + (bad ? ' bad' : '')}
      value=${now ?? (title ? Scene.bind(shown) : shown)} placeholder=${ph} disabled=${looks ? !App.canAsk() : App.readOnly.value} spellcheck=${false} autocomplete="off" aria-invalid=${bad ? 'true' : null}
      aria-label=${label ? label + (due ? `, ${DUE[due]}` : '') : ph} data-tour=${fx ? 'computed' : null} data-fx=${fx ? '' : null}
      onPointerDown=${e => { clicked.current = document.activeElement !== e.currentTarget; }} onMouseUp=${e => { if (clicked.current) e.preventDefault(); clicked.current = false; }}
      onFocus=${e => { const el = e.currentTarget; if (doc) { type(raw); setTimeout(() => el.select()); } else el.select(); if (fx) emit('why-open', id); }}
      onInput=${e => { type(e.target.value); setBad(false); }} onKeyDown=${key} onBlur=${() => done()}
      onCopy=${title ? e => { const el = e.currentTarget; e.clipboardData.setData('text/plain', el.value.slice(el.selectionStart, el.selectionEnd).replace(/\u00a0/g, ' ')); e.preventDefault(); } : null} /></span>
    ${doc && r && text === null ? html`<a class="btn icon open" href=${SharePoint.href(r.value)} target="_blank" rel="noopener" aria-label="Open" data-tip="Open">${OPEN}</a>` : null}
    ${dirty ? null : children}
  </label>`;
}

// A choice's option, from its dropdown, or (unless the options are fixed) a new one typed.
// The option a record's name already says, as a legal form ends a name: the initials of one (…, L.P. a Limited
// Partnership; LLC), or the forms that say a corporation (Inc., Corp.) or a company (Ltd., the fewest words of those);
// none where its last word says none.
const SAYS = { inc: 'corporation', incorporated: 'corporation', corp: 'corporation', ltd: 'company', limited: 'company' };
function namedOption(name, options) {
  const tail = String(name ?? '').split(/[\s,()]+/).filter(Boolean).at(-1)?.replace(/\./g, '').toLowerCase();
  if (!tail || !options.length) return null;
  const words = o => T.norm(o).split(/\s+/), initials = o => words(o).map(w => w[0]).join('');
  return options.find(o => words(o).length > 1 && initials(o) === tail)
    ?? (SAYS[tail] ? options.filter(o => words(o).at(-1) === SAYS[tail]).sort((a, b) => words(a).length - words(b).length)[0] : null) ?? null;
}
// What a chart's compared with, a look (Time.showChanges), with Keep where it's this window's alone; and what that marks, by name,
// so what's different since that day can be read as well as seen.
function ComparedRows({ v }) {
  const look = App.lookOf(v.id)?.compare, can = !App.readOnly.value, marks = App.scene.value?.marks ?? [], of = w => marks.filter(m => m.change === w && m.type === 'box');
  App.looks.value;
  const lists = [['New', of('New')], ['Changed', of('Changed')], ['Gone', of('Gone')]].filter(([, ms]) => ms.length);
  return html`<div class="row"><div class="k">Changes</div><div class="v ctl"><${Choice} fixed looks label="Changes" r=${{ choice: !v.changes ? 'None' : v.changes.since ? 'Since a date' : 'Since the page before' }} options=${['None', 'Since the page before', 'Since a date']}
      put=${out => Time.showChanges(v.id, out.choice === 'None' ? null : out.choice === 'Since a date' ? { since: v.changes?.since ?? Time.dayBefore(App.day.peek()) } : { page: true })} />
      ${look ? html`<button class="btn ghost keeps" aria-disabled=${can ? null : 'true'} data-tip=${can ? null : App.whyNot()} onClick=${() => Time.keepChanges(v.id)}>Keep</button>` : null}</div></div>
    ${v.changes?.since ? html`<div class="row in"><div class="k">Since</div><div class="v ctl"><${Field} looks r=${{ field: 'date', value: v.changes.since }} datatype="date" label="Since" put=${out => out && Time.showChanges(v.id, { since: out.value })} /></div></div>` : null}
    ${v.changes ? lists.map(([w, ms]) => html`<div class="row in marked" key=${w}><div class="k">${w}</div><div class="v">${ms.map((m, i) => html`${i ? ', ' : ''}<${Go} to=${m.record}>${bound(shortOf(m.record) || m.name)}</${Go}>`)}</div></div>`) : null}`;
}
// What a chart keeps by what its boxes know (Canvas's filter): a look, as a table's filter is, its words a click from changing them.
function FilterRow({ v }) {
  const said = App.lookWordsOf(v.id);
  return html`<div class="row"><div class="k">Filter</div><div class="v ctl"><button class="sel dd" aria-haspopup="menu" aria-label=${`Filter: ${said.join(', ') || 'None'}`} disabled=${!App.canAsk()} onClick=${e => Canvas.active.peek()?.filter(e.currentTarget)}><span>${said.join(' · ') || 'None'}</span></button></div></div>`;
}
function Choice({ r, options, put, fx, over, id, fixed, label, ph, hint, was, looks, children }) {
  const [typing, setTyping] = useState(false);
  if (typing) return html`<span class="cellbox"><input class="cell" placeholder="New option" aria-label=${label ?? 'New option'} ref=${el => el && !el.dataset.on && (el.dataset.on = 1, el.focus())}
    onKeyDown=${e => { if (e.key === 'Enter') { const t = T.clean(e.target.value); setTyping(false); if (t) put({ choice: t }); } else if (e.key === 'Escape') { e.stopPropagation(); setTyping(false); } }}
    onBlur=${() => setTyping(false)} /></span>`;
  const open = e => {
    const at = e.currentTarget;
    if (fx) emit('why-open', id);
    // A long list is found in, what's typed that it hasn't offered as a new option, asked for by name (see Menu).
    menu(at, [...options.map(o => ({ label: o, checked: !!r && T.same(o, r.choice), run: () => !(r && T.same(o, r.choice)) && put({ choice: o }) })),
      ...(fixed ? [] : [...(options.length ? ['-'] : []), { label: 'New option', asked: true, run: () => setTyping(true) }])],
      { search: options.length > 7, more: fixed ? null : q => options.some(o => T.same(o, q)) ? [] : ['-', { label: `New option: ${q}`, asked: true, run: () => put({ choice: q }) }] });
  };
  return html`<span class="cellbox">${was ? html`<s class="del">${was}</s>` : null}<span class=${'hug' + (over ? ' over' : '')}><button class=${'sel dd' + (fx ? ' fx' : '') + (was ? ' add' : '')} disabled=${looks ? !App.canAsk() : App.readOnly.value} data-tour=${fx ? 'computed' : null}
    aria-label=${label ? `${label}: ${r?.choice ?? 'none'}` : null} aria-haspopup="menu" onClick=${open}><span class=${r ? null : 'ph'}>${r?.choice ?? ph ?? ''}</span></button></span>${!r && hint && !App.readOnly.value
      ? html`<button class="lk hint" data-tip="From its name" onClick=${() => put({ choice: hint })}>${hint}?</button>` : null}${children}</span>`;
}
// A tag's checkbox: green attested, outlined when computed; a "no" a plain X, but red where it's a check failed and amber
// where it needs attention (`tone`, App.noTone). One a formula gives only says: a click or Space opens its reason, as its
// label does, where overriding it is a labelled command (`reason`). Any other, pointed at or reached by the keys, shows
// the other state, and the formula bar redlines what switching it would change; a click or Space switches it, as a
// checkbox's do, and Enter goes on, as from any value, so no key meant to move on changes it. After a switch nothing is
// previewed until it's left, so the tag shows what was just done, even remounted under it. `to` is what a click leaves
// (a relation unticked goes, its box empty); `fixed`, the box only says; `still`, drawn again as what it began is
// discarded, it previews nothing till it's left, so it never looks ticked as it goes; `held`, its other state pending.
let clicked = false;
function TagBox({ r, flip, fx, over, change, label, to, fixed, still, reason, tone, held, children }) {
  const [peek, setPeek] = useState(false), [hush, setHush] = useState(!!still), on = held ? held.tag : r?.tag, show = peek ? (to === undefined ? !(on ?? false) : to) : on;
  // A box that previews nothing (a relation not yet ticked, which its tick begins) leaves the redline to others.
  const hover = p => { if (reason || (p && (clicked || hush))) return; setPeek(p); if (change) FormulaBar.preview(p ? change() : null); };
  const leave = () => { clicked = false; setHush(false); if (peek) hover(false); };
  // (A box a rule covers has nothing to switch: Space asks why, with the keys in the reason.)
  const key = e => { if (reason && e.key === ' ') { e.preventDefault(); flip(); FormulaBar.open.value = true; FormulaBar.into(); return; } if (e.key !== 'Enter') return; e.preventDefault(); onward(e.currentTarget, e.shiftKey ? -1 : 1)?.focus(); };
  // (Reached by the keys, only what would be added previews: a box that's ticked is what stands, and passing it strikes nothing.)
  return html`<span class="cellbox"><span class=${'hug' + (over ? ' over' : '')}><button class=${'tag' + (show === true ? ' yes' : show === false ? ` no${tone ? ' ' + tone : ''}` : '') + (fx && !peek ? ' fx' : '') + (peek || held ? ' peek' : '')}
    role="checkbox" aria-checked=${on ? 'true' : 'false'} aria-label=${label && (on === false ? `${label}, ruled out` : label)} disabled=${(App.readOnly.value && !reason) || !!fixed}
    onPointerEnter=${() => hover(true)} onPointerLeave=${leave} onFocus=${e => e.currentTarget.matches(':focus-visible') && !on && hover(true)} onBlur=${leave} onKeyDown=${key}
    onClick=${() => { hover(false); clicked = true; flip(); }} /></span>${children}</span>`;
}

// The record's other values, by time, as a count ("2 earlier"): each goes to the chart as of a day it held.
function Versions({ id }) {
  App.version.value;
  const rows = App.shown.value.item(App.chart.value, id), now = App.day.value, others = rows.filter(v => !Log.validOn(v, now));
  if (!others.length) return null;
  const n = others.length, ahead = others.filter(v => v.since > now), said = `${n} ${!ahead.length ? 'earlier' : ahead.length === n ? 'later' : 'other'}`;
  // What's coming stands beside the value it'll replace: "55% from Feb 1, 2027", the next of them.
  const next = ahead[0], say = next ? `${T.outputText(next)} from ${short(next.since)}${n > 1 ? ` · ${n - 1} ${n - 1 === ahead.length - 1 ? 'later' : ahead.length === 1 ? 'earlier' : 'other'}` : ''}` : said;
  const period = v => v.since && v.before ? `${short(v.since)} – ${short(v.before)}` : v.since ? `Since ${short(v.since)}` : v.before ? `Before ${short(v.before)}` : '';
  const day = v => v.since ?? later(v.before, -1);
  const still = App.readOnly.value;
  // Each its own From: the chart then, and Change this day….
  const items = v => [{ label: 'Show the chart then', run: () => showDay(day(v)) }, ...(v.since && !still ? [{ label: 'Change this day…', run: () => App.amendingRow(id, v) }] : [])];
  const list = () => (next && n === 1 ? items(next) : rows.map(v => ({ label: T.outputText(v), detail: period(v), checked: Log.validOn(v, now), items: items(v) })));
  return html`<button class=${'btn ghost ver' + (next ? ' coming' : '')} aria-label=${`${said} values`} aria-haspopup="menu" onClick=${e => menu(e.currentTarget, list(), { placement: 'bottom-end' })}>${say}</button>`;
}

// Beside a due date, always, after it, its filing: the entry its rule reads, typed in a popover while the formula bar
// redlines where the due date would move, or go once paid. Its button says what it records (Paid…, Renewed…), and a
// filing of any other name is Filed…. Enter keeps it, at what the rule reads it at.
const settleWord = slot => (slot.edge.match(/\b(\w+ed|paid)\b/gi) ?? ['Filed']).at(-1);
function Filed({ id }) {
  const slot = !App.readOnly.value && filingOf(id);
  if (!slot) return null;
  const open = e => Shell.popover(e.currentTarget, close => html`<${Filing} due=${id} slot=${slot} close=${close} />`, { placement: 'bottom-end', onClose: () => FormulaBar.preview(null) });
  return html`<button class=${'btn ghost ver filed' + (dueOf(id) ? ' due' : '')} aria-label=${`Record ${slot.edge}`} aria-haspopup="dialog" onClick=${open}>${settleWord(slot)}…</button>`;
}
// A deadline settled from anywhere it's found, as its own Filed… settles it: the record selected's, or the deadline's
// own panel, its button pressed. → the menu item for it, or null where nothing settles it (the Dates table's right-click).
function settle(x) {
  const one = theOne();
  if (one !== x) { if (one && recs()[one] && within(objectOf(one)).includes(x)) aim.value = x; else select([x]); }
  Shell.showPanel?.();
  setTimeout(() => document.querySelector(`.insp [data-key="${CSS.escape(x)}"] .filed`)?.click(), 150);
}
const settling = x => { const slot = !App.readOnly.peek() && recs()[x] && fx(x) && recs()[x].field === 'date' && filingOf(x); return slot ? { label: `${settleWord(slot)}…`, run: () => settle(x) } : null; };
// A filing is a fact of the day it was made: it's recorded from that day, as the sample's are, so the chart
// as of a day before still has the deadline it had; and it's redlined as of the day shown, where it holds only
// if made by then. A yearly deadline's payment is a record of its own, settling the earliest year unsettled
// (Formulas.pay), so one paid before is kept; any other filing is the entry its rule reads, typed over. Kept, the
// selection stays on the record, at the filing's row, or moves to the filing where the deadline selected goes with it.
function Filing({ due, slot, close }) {
  const [text, setText] = useState(T.formatDate(App.day.peek(), 'short')), value = T.parse('date', T.clean(text) || '-');
  const rec = value ? { at: slot.at, edge: slot.edge, field: 'date', value } : null;
  let made = slot.id;
  // (A filing is said as what it is, a renewal as Renewed, never as a correction of its date.)
  const write = tx => {
    if (Formulas.pay?.({ R: App.computed.peek(), due, day: value, add: r => (made = tx.add('record', enterAt(tx, r))) })) return;
    if (slot.id) tx.set(slot.id, rec); else made = tx.add('record', enterAt(tx, rec));
    tx.says(`${settleWord(slot)} ${recs()[slot.at]?.args ? N().segmentOf(recs(), slot.at) : termOf(slot.at)} on ${short(value)}`);
  };
  useLayoutEffect(() => { FormulaBar.preview(rec ? App.would(write, { dated: value }) : null); }, [value]);
  const was = recs()[due], p = FormulaBar.pending.value, next = p ? nextDue(p.R2.records, due) : undefined;
  const keep = () => {
    if (!rec) return;
    close();
    const sel = Shell.selection.peek(), at = was.at;
    if (!App.change(write, { dated: value, say: c => Time.describe(c) })) return;
    const where = recs()[made]?.at, to = [...new Set(sel.map(k => recs()[k] ? k : k === at && where ? where : made))];
    aim.value = made;
    select(to);
  };
  return html`<div class="filing">
    <label class="field"><span>${slot.edge}</span><input class="cell" value=${text} spellcheck=${false} aria-invalid=${value ? null : 'true'}
      ref=${el => el && !el.dataset.on && (el.dataset.on = 1, el.focus(), el.select())} onInput=${e => setText(e.target.value)}
      onKeyDown=${e => { if (e.key === 'Enter') { e.preventDefault(); keep(); } }} /></label>
    <p class="meta">${was.edge} ${next === undefined || next?.value === was.value ? short(was.value) : html`<s class="del">${short(was.value)}</s>`}${next && next.value !== was.value ? html` <span class="add">${short(next.value)}</span>` : null}</p>
  </div>`;
}

// The deadline that takes a due date's place once it's settled, in `R2`, the chart the settling leaves: itself, moved,
// or the next of its name where it shares what it's at (a tax's next year, of the same taxpayer); null where none does.
function nextDue(R2, due) {
  if (R2[due]) return R2[due];
  const was = recs()[due], own = new Set(T.argsOf(recs()[was.at] ?? {}).map(a => a.at));
  return Object.entries(R2).filter(([x, r]) => !recs()[x] && r.field === 'date' && T.same(r.edge, was.edge) && T.argsOf(R2[r.at] ?? {}).some(a => own.has(a.at)))
    .map(([, r]) => r).sort((a, b) => a.value.localeCompare(b.value))[0] ?? null;
}
// A value with two answers: both, each with who gave it; choosing one keeps it.
function Answers({ g }) {
  return html`<span class="answers">${g.rows.map(x => html`<button class="btn ghost" key=${x.row.id} disabled=${App.readOnly.value}
    onClick=${() => App.change(tx => tx.keep(x.row.id), { say: `Kept ${T.outputText(x.row)}` })}>${T.outputText(x.row)}<span class="who">${x.who}</span></button>`)}</span>`;
}

// A tag is its box, before its name; but where two people gave it at once, its two answers, beside it.
const boxed = id => 'tag' in recs()[id] && !disagreeing.value.get(id);

// The first day a relation entered at a record holds from, or null.
const firstRelated = at => App.shown.value.rows(App.chart.value).filter(r => r.since && r.args?.some(a => a.at === at)).map(r => r.since).sort()[0] ?? null;
// A record's output, or a blank one's, in place: typed, chosen or ticked; named `label`.
function Output({ id, slot, label }) {
  if (slot?.na) return html`<span class="na" data-tip="Not tested: its rule doesn’t apply here">n/a</span>`;
  if (slot?.cant) return html`<button class="cant" data-tip=${FormulaBar.blankSaid(slot.error)} onClick=${() => emit('why-open', slot.error.id)}>Can’t say</button>`;
  if (slot?.unsure) return html`<button class="errv err" data-tip="Its rule reads a rule that doesn’t work" onClick=${() => openDef(slot.unsure)}>Can’t say</button>`;
  // An error where the value would be: what it needs, in words ("Needs Fiscal Year End"), its code on hover;
  // with no words, its code, in red. Clicked, the bar says why.
  if (slot?.error) { const { code, msg } = slot.error.error, say = msg?.replace(/\.$/, '');
    return html`<button class=${'errv' + (say ? '' : ' err')} data-tip=${say ? code : null} aria-label=${say ? `${say} (${code})` : null} onClick=${() => emit('why-open', slot.error.id)}>${say || code}</button>`; }
  const g = id && disagreeing.value.get(id);
  if (g) return html`<${Answers} g=${g} />`;
  const r = id ? recs()[id] : null, f = !!id && fx(id), o = !!id && overrides(id);
  const k = r ? null : slot.type ? slot : kindAt(tree(slot.at), slot.edge);
  const type = r ? T.typeOf(r) : k.type, set = (out, o2) => put(id, slot, out, o2), held = id ? App.held(id) : undefined;
  // A start entry blank offers the day the record's first relation holds from (a company inserted on Dec 1, its Formation Date).
  const firstDay = !r && k?.datatype === 'date' && recs()[slot.at]?.kind && !App.readOnly.value && N().isStart({ out: { field: 'date' }, args: [{ edge: slot.edge, loc: tree(slot.at) }] }) ? firstRelated(slot.at) : null;
  const more = !r ? (firstDay ? html`<button class="lk hint" data-tip="From its first relation" onClick=${() => set({ field: 'date', value: firstDay })}>${short(firstDay)}?</button>` : null) : !f ? html`<${Versions} id=${id} />` : r.field === 'date' ? html`<${Filed} id=${id} />` : null;
  // A box a rule covers, worked out or typed over, says why, clicked, and changes nothing, here as in a table.
  const ruled = f || (!!id && over(id));
  return type === 'tag' ? html`<${TagBox} r=${r} fx=${f && !held} over=${o} label=${label} reason=${ruled && !held} tone=${id ? App.noTone(id) : ''} held=${held}
        flip=${() => (held ? set(false) : ruled ? emit('why-open', id) : flip(id, slot))} change=${ruled || held ? null : () => putChange(id, slot, flipped(id))}>${more}</${TagBox}>`
    : type === 'choice' ? html`<${Choice} r=${held ? { ...r, ...held } : r} was=${held ? r.choice : null} id=${id} fx=${f && !held} over=${o} put=${out => (held && T.same(out.choice, r.choice) ? set(false) : set(out, { auto: true }))} label=${label} options=${r ? (r.args ? slot.options ?? [] : kindAt(tree(r.at), r.edge).options) : k.options ?? []}
        hint=${!r && recs()[slot.at]?.kind ? namedOption(nameOf(slot.at), k.options ?? []) : null}>${more}</${Choice}>`
    : html`<${Field} r=${r} id=${id} fx=${f} over=${o} put=${set} preview=${out => putChange(id, slot, out)} label=${label} due=${id && dueOf(id)} datatype=${r?.field ?? k.datatype} auto=${!r && slot.auto}
        held=${held ? T.format(held.field, held.value) : null}>${more}</${Field}>`;
}

// What the keys do in the panel, for the list of them.
Shell.register('keys', { head: 'In the panel', rows: [['Tab', 'Next field, or the next list'], ['ArrowUp ArrowDown', 'Through a list’s rows'], ['Enter', 'On a row: open it. On a value: keep it and go on'], ['Space', 'Tick a box; on one a rule covers, say why'], ['F1', 'Why this holds'], ['F2', 'Rename'], ['Shift+F10', 'The row’s menu'], ['Esc', 'Back to the view; with nothing selected, put the panel away']] });
// ---- The record's entries, as a tree ----
function entryMenu(anchor, id) {
  const r = recs()[id], f = fx(id);
  menu(anchor, [
    ...(f ? [{ label: 'Why', keys: 'F1', run: () => { emit('why-open', id); FormulaBar.open.value = true; FormulaBar.into(); } }] : []),
    { label: 'Rule', run: () => select([general(patternOf(id))]) },
    // What a formula gives is overridden only by saying so (App.overriding), as its reason in the formula bar offers it; and what's typed over one goes back the same way.
    ...(f && 'tag' in r && !App.readOnly.peek() ? [{ label: 'Override…', run: () => App.overriding(id) }] : []),
    ...(!f && over(id) && !App.readOnly.peek() ? [{ label: 'Back to the rule…', run: () => App.backToRule(id) }] : []),
    ...(f || App.readOnly.peek() ? [] : [{ label: 'Rename', run: () => { renaming.value = id; } }, ...(recs()[r.at]?.at ? [{ label: 'Move up a level', run: () => moveUp(id) }] : [])]),
    ...('field' in r || App.readOnly.peek() ? [] : [{ label: 'Add', items: addItems(id, anchor) }]),
    ...(f || overrides(id) || App.readOnly.peek() ? [] : ['-', { label: 'Delete', danger: true, run: () => remove(id) }]),
  ]);
}
function addItems(at, anchor) {
  const t = tree(at), start = (type, edge) => () => { draft.value = { at, type, ...(edge && { edge, ...kindAt(t, edge) }) }; };
  // (What a rule gives isn't added: a tag of one is its rule's to answer, and overriding it is a command of its own.)
  const items = unentered(at).filter(s => !('tag' in s.out && N().resolve('Formula', T.bare(s)))).sort((a, b) => a.args[0].edge.localeCompare(b.args[0].edge)).map(s => ({ label: s.args[0].edge, detail: typeName(s),
    run: 'tag' in s.out ? () => addEntry(at, s.args[0].edge, { tag: true }) : start('field' in s.out ? 'field' : 'choice', s.args[0].edge) }));
  const others = () => [...T.index(recs()).kinds].flatMap(([, ids]) => ids).filter(x => !T.isView(recs()[x]) && x !== objectOf(at))
    .map(x => ({ label: nameOf(x), detail: recs()[x].kind, run: () => select([at, x]) })).sort((a, b) => a.label.localeCompare(b.label));
  // (An object's lists; of what isn't one, a date's own record, who's Responsible, as its deadline asks.)
  const lists = recs()[at].kind ? listItems(at, anchor) : listItems(at, anchor).filter(x => /^Responsible/.test(x.label));
  return [{ label: 'Check…', names: ['Rule', 'Test', 'Compliance'], run: start('check') }, { label: 'New yes-or-no', names: ['Tag', 'Yes or no', 'Checkbox', 'Flag'], run: start('tag') }, { label: 'New value', names: ['Value', 'Field', 'Text', 'Number', 'Date'], run: start('field') }, { label: 'New choice', names: ['Choice', 'Dropdown', 'Option', 'List'], run: start('choice') }, '-',
    ...(lists.length ? [...lists, '-'] : []), ...items, ...(items.length ? ['-'] : []),
    { label: 'Relation…', run: () => menu(anchor, others(), { search: true }) }, ...(recs()[at].kind && !linkOf(at) ? [{ label: 'Document…', run: () => linkAdd(anchor, at) }] : [])];
}
// What Add makes of a name typed that it doesn't know: a thing of each sort, named so.
function addNamed(at, q) {
  const name = T.clean(q), t = tree(at), have = specsAt(t, name).length || entryNamed(at, name);
  if (!name || have) return [];
  return ['-', { label: `New yes-or-no: ${name}`, asked: true, run: () => makeTag(at, name) }, { label: `Check: ${name}`, asked: true, run: () => makeTag(at, name, true) },
    { label: `New value: ${name}`, asked: true, run: () => { draft.value = { at, type: 'field', edge: name, datatype: null }; } }, { label: `New choice: ${name}`, asked: true, run: () => { draft.value = { at, type: 'choice', edge: name, options: [] }; } }];
}
// The lists of relatives a record's kind can have, by their names (Owners, General Partners, Holdings), as its sections
// name them once it has some: each the relations of the schema, entered not worked out, of two sides, one of which the
// record (or a record in it) fits. → [{ name, ways }]
function listsOf(id, docs = false) {
  const n = N(), own = within(id), lists = new Map(), S = Object.values(App.schema.value);
  // A document is linked by Document…, not listed here; `docs`, those alone, for what's linked to by a relation of its own
  // (Evidence, of an ownership).
  const doc = loc => !!loc.kind && S.some(s => s.out?.field === 'document' && s.args?.length === 1 && T.same(s.args[0].loc.kind ?? '', loc.kind));
  for (const s of S) if (s.args?.length === 2 && ('tag' in s.out || 'choice' in s.out) && !n.resolve('Formula', T.bare(s))) for (const sm of s.args) {
    const sl = s.args.find(a => a !== sm), at = own.find(x => T.narrower(tree(x), sm.loc));
    if (!at || !sl || doc(sl.loc) !== docs) continue;
    const name = n.listName(T.bare(s), sl.edge), was = lists.get(T.norm(name));
    if (!was) lists.set(T.norm(name), { name, ways: [{ s, sm, sl, at }] }); else if (!was.ways.some(w => T.key(w.sl.loc) === T.key(sl.loc) && T.same(w.sm.edge, sm.edge))) was.ways.push({ s, sm, sl, at });
  }
  return [...lists.values()].sort((a, b) => a.name.localeCompare(b.name));
}
// Adding to a list, from Add or from the list's own +: one way, a search of who, by name: one the chart has, or a new one
// typed, of a kind the other side can be; then it's related, pending, its amount and day asked (App.relating).
const addTo = (anchor, id, l) => menu(anchor, q => whoFor(id, l, q), { search: true });
const listItems = (id, anchor) => listsOf(id).map(l => ({ label: `${l.name}…`, run: () => addTo(anchor, id, l) }));
// Who can be in a list: each record the chart has that fits its other side, by name, as typed, but those it has already;
// and a new one of each kind the side can be, named as typed.
function whoFor(id, l, q) {
  // (Found by either side, in any order: "blocker halvard". A stake, with its amount, before what only says that it holds.)
  const out = [], seen = new Set(relatives(id).lists.find(([name]) => T.same(name, l.name))?.[1].map(it => it.obj) ?? []), words = T.norm(q ?? '').split(' ').filter(Boolean);
  for (const w of l.ways) for (const x of Object.keys(recs())) {
    const b = objectOf(x);
    if (seen.has(b) || b === id || 'field' in recs()[x] || !T.narrower(tree(x), w.sl.loc) || T.isView(recs()[b] ?? {})) continue;
    const hay = T.norm(`${placeName(b)} ${recs()[b].args ? '' : shortOf(b)}`);
    if (!words.every(word => hay.includes(word))) continue;
    seen.add(b);
    out.push({ label: placeName(b), detail: recs()[b].kind ?? nameOf(b), rank: recs()[b].args && !App.transferable(b)?.amount ? 1 : 0, run: () => joinTo(id, b, w, x) });
  }
  out.sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label));
  // The kinds a new one can be, in one order, as Insert offers them, the one its name says first.
  const named = T.clean(q ?? ''), kinds = App.newKinds([...new Map(l.ways.filter(w => w.sl.loc.kind).map(w => [T.norm(w.sl.loc.kind), w])).values()], named, w => w.sl.loc.kind);
  if (named && kinds.length && !out.some(o => T.same(o.label, named))) out.push('-', ...kinds.map(w => ({ label: `New ${w.sl.loc.kind}: ${named}`, run: () => joinTo(id, null, w, null, { kind: w.sl.loc.kind, name: named }) })));
  return out;
}
// Relates a record to another as a list's side, or to a new one (`fresh`, { kind, name }) made with it: a role to choose
// opens the two-box panel; any other is a change pending, as one ticked there is (App.relating), redlined and asked in
// its row of the two-box panel, or, for a new one, in the bar; Enter makes it, the new one with it, as one change.
function joinTo(id, b, w, lb, fresh = null) {
  // What's added here is left to the view (dendra.md, Views): related to nothing a page draws, the new one is kept off it by the
  // same change (App.keepOff), and the toast says so, with Show.
  let o = null, kept = [];
  const v = viewShown(), chart = v?.layout === 'chart' ? v : null, make = tx => { o = tx.add('record', { kind: fresh.kind }); tx.add('record', { at: o, edge: 'Name', field: 'text', value: fresh.name }); return o; };
  // (Or the chart shown leaves its like out by a filter.)
  const offOf = () => (chart ? (o && !linkOf(o) && !App.scene.peek()?.byId.has(o) ? chart : null) : kept[0] ?? null);
  const told = { go: () => (offOf() ? ['Show', () => showHere([o], offOf())] : null) }, saying = () => `${fresh?.name} isn’t on ${offOf()?.name}`;
  const rec = (other, out = { tag: true }) => ({ args: [{ edge: w.sm.edge, at: w.at }, { edge: w.sl.edge, at: other }], ...out });
  const p = T.bare(w.s), first = T.same(N().edges(p)[0], w.sm.edge), here = rowName(id), there = fresh?.name ?? rowName(lb), standIn = { ...recs(), ...(fresh && { '§new': { kind: fresh.kind } }) }, at = lb ?? '§new';
  // A role to choose goes straight to the kind and the day, in its bar: who's named, so what's left is what they are, and from when.
  if ('choice' in w.s.out) {
    const options = optionsOf(N().fitting(App.schema.value, p));
    return App.relating(rec(at, { choice: options[0] }), { what: `${N().name(w.s)}: ${first ? `${here} → ${there}` : `${there} → ${here}`}`, source: `list ${id}`, needs: [id, ...(lb ? [lb] : [])], Fill: RoleFill, role: { options, now: null, first: first ? here : there, then: first ? there : here }, ready: q => !!q.role.now, ...told,
      make: (tx, d, q) => { const n = fresh ? make(tx) : lb, r = tx.add('record', enterAt(tx, rec(n, { choice: q.role.now ?? options[0] }))); if (fresh) kept = App.keepOff(tx, [n]); return r; },
      say: c => (offOf() ? saying() : Time.describe(c)) }, standIn);
  }
  if (!fresh) {
    begin(id, b, [w.sm.edge, w.sl.edge, w.at, lb].join('|').toLowerCase(), { tag: true }, rec(lb));
    return select([id, b]);
  }
  // The new one, related as it's made. What it asks is asked of a stand-in of its kind.
  const what = `${N().name(w.s)}: ${first ? `${here} → ${fresh.name}` : `${fresh.name} → ${here}`}`;
  const made = tx => { const n = make(tx), r = tx.add('record', enterAt(tx, rec(n))); kept = App.keepOff(tx, [n]); return r; };
  App.relating(rec('§new'), { what, source: `list ${id}`, needs: [id], make: made, ...told, say: c => (offOf() ? saying() : Time.describe(c)) }, standIn);
}
// A role asked in its bar: "Elena Vasquez is a [ … ] of GP III", its list open at once, picked, the keys go on to the day.
function RoleFill({ p }) {
  const at = useRef(), r = p.role;
  const choose = el => menu(el, r.options.map(o => ({ label: o, checked: T.same(o, r.now ?? ''), run: () => { App.amendPending(p, { role: { ...App.pending.peek().role, now: o } }); setTimeout(() => { const i = at.current?.closest('.pendbar')?.querySelector('.when input'); i?.focus(); i?.select(); }); } })), { search: true });
  useLayoutEffect(() => { if (at.current && !r.now) { at.current.focus(); choose(at.current); } }, []);
  return html`<span class="transfer"><span>${bound(r.first)} is ${r.now ? article(r.now) : 'a'} <button ref=${at} type="button" class=${'sel dd' + (r.now ? '' : ' ph')} aria-haspopup="menu" aria-label=${`Role: ${r.now ?? 'none'}`} onClick=${e => choose(e.currentTarget)}><span>${r.now ? lower(r.now) : '…'}</span></button> of ${bound(r.then)}</span></span>`;
}
// A document linked: picked from SharePoint, where it's set up, or its link typed.
const linkAdd = (anchor, at) => SharePoint.configured() ? menu(anchor, [{ label: 'SharePoint…', run: () => pickLink(at) }, { label: 'Link…', run: () => { linking.value = at; } }]) : (linking.value = at);

// A clock time and a day, as History says when something was typed.
const whenTyped = iso => { const d = new Date(iso); return `${short(T.isoOf(d))}, ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`; };
// Who typed a fact and when: its author, the time, and any note on the change, with the way to its History.
function typedBy(anchor, id) {
  const by = App.enteredBy(id);
  if (!by) return;
  Shell.popover(anchor, close => html`<div class="typed">
    <p class="who">${by.who}</p><p class="meta">${whenTyped(by.when)}${by.since ? ` · from ${short(by.since)}` : ''}${by.before ? ` · until ${short(by.before)}` : ''}</p>
    ${by.note ? html`<p class="note">${by.note}</p>` : null}
    <button class="btn ghost" onClick=${() => { close(); select([id]); Time.of([id]); }}>History</button></div>`, { placement: 'bottom-start' });
}
function Label({ it, fx }) {
  const r = it.id && recs()[it.id];
  if (r && renaming.value === it.id) return html`<input class="cell" value=${r.edge} ref=${el => el && !el.dataset.on && (el.dataset.on = 1, el.focus(), el.select())}
    onKeyDown=${e => { if (e.key === 'Enter') e.target.blur(); else if (e.key === 'Escape') { e.stopPropagation(); e.target.value = r.edge; e.target.blur(); } }}
    onBlur=${e => { renaming.value = null; rename(it.id, T.clean(e.target.value)); }} />`;
  const click = e => { if (e.altKey && it.id) select([general(patternOf(it.id))]); else if (fx) emit('why-open', it.id); else if (r) typedBy(e.currentTarget, it.id); };
  // (One with no record yet has a rule's way in too, where it's a yes-or-no just made or one a rule says nothing of here.)
  const none = e => { if (!it.t) return; e.preventDefault(); menu({ x: e.clientX, y: e.clientY }, [{ label: 'Rule', run: () => select([general(slotPattern(it))]) }, ...(it.cant && !App.readOnly.peek() ? [{ label: 'Override…', run: () => App.overriding(null, { at: it.at, edge: it.edge }) }] : [])]); };
  return html`<span class=${'lbl' + (fx || r ? ' asks' : '')} onClick=${click} onContextMenu=${e => { if (it.id) { e.preventDefault(); entryMenu({ x: e.clientX, y: e.clientY }, it.id); } else none(e); }}>
    ${it.edge}${it.blank ? html`<i class="req" aria-label="Required" />` : null}</span>${it.made ? html`<button class="lk muted to-rule" onClick=${() => select([general(slotPattern(it))])}>Rule</button>` : null}`;
}
// What a row with no record yet is of: its entry in general, as patternOf gives it for one with.
const slotPattern = it => T.bare({ args: [{ edge: it.edge, loc: T.specOf(it.t.args[0].loc) }] });

// A tag ruled out where its definition's Check note says that's a problem (Ownership Adds Up): an error,
// said in place in red, where any other ruled out is quiet, but one a Check note says needs attention, in amber.
const failed = id => App.noTone(id) === 'fails';
// ---- An entry on the chart: a field of the box (or line) its record is drawn as (dendra.md, Fields) ----
// The box or line on the chart shown that an entry at `at` would be drawn in: the nearest record up from it that's one.
function hostIn(at) {
  const sc = App.scene.value;
  for (let x = at; x && sc; x = recs()[x]?.at) { const m = sc.byId.get(x); if (m && (m.type === 'box' || m.type === 'line')) return x; }
  return null;
}
// The key a field goes by on the chart and here: its record's id, or a blank's place.
const fieldKey = (it, at) => it.id ?? `${at}|${T.norm(it.edge)}`;
const charted = () => typeof Canvas !== 'undefined';
// Whether a row's field is the one lit on the chart, each row asking of its own: so as the pointer goes from field to
// field, only the two rows whose light changes are drawn again.
const lits = new Map();
const lit = (it, at) => {
  if (!charted()) return false;
  const k = fieldKey(it, at);
  if (!lits.has(k)) { if (lits.size > 4000) lits.clear(); lits.set(k, computed(() => Canvas.fieldLit.value === k)); }
  return lits.get(k).value;
};
const fields = () => charted() ? Canvas.active.peek()?.fields : null;
// Show on chart: at the row's end, shown in this box a quiet eye, pointed at a way to show or hide it there, at the
// format bar's scope; the tooltip says where.
// At a group scope it's on only where every mark the group reaches shows the field, so with one of five showing it it says
// "Show in all 5 limited partnerships", and its click shows it in the other four; the scope is asked again as it's
// pointed at and clicked, as it may have been chosen since.
function OnChart({ it, at }) {
  const c = charted() ? Canvas.active.value : null, host = c && hostIn(at), [pointed, setPointed] = useState(null);
  if (!host || !c || App.readOnly.value || it.error || it.na) return null;
  App.scene.value; Shell.selection.value;
  const state = () => { const s = Canvas.scope(); return { s, on: s.own ? c.fields.shown(host, it.edge, at) : [...s.marks].every(id => { const x = alikeIn(host, at, id); return !!x && c.fields.shown(id, it.edge, x); }) }; };
  const { s, on } = pointed ?? state();
  const say = ({ s, on }) => `${on ? 'Hide from' : 'Show in'} ${s.own ? (recs()[host]?.args ? 'this line' : 'this box') : Canvas.named(s)}`;
  // Its right-click: here, or in every box that has it, kept true as more get it; and with its name, so "High" says what it is.
  const where = e => { e.preventDefault(); e.stopPropagation(); const here = c.fields.shown(host, it.edge, at), all = c.fields.everywhere(it.edge), named = c.fields.captioned(it.edge);
    menu({ x: e.clientX, y: e.clientY }, [{ label: recs()[host]?.args ? 'In this line' : 'In this box', checked: here, run: () => c.fields.showHere(host, it.edge, !here, at) }, { label: 'In every box that has it', checked: all, run: () => c.fields.setEverywhere(it.edge, !all) }, '-', { label: 'With its name', checked: named, run: () => c.fields.setCaptioned(it.edge, !named) }]); };
  return html`<button class=${'btn icon onchart' + (on ? ' on' : '')} tabindex="-1" aria-pressed=${on} aria-label=${on ? 'Shown on chart' : 'Show on chart'} data-tip=${say({ s, on })} onContextMenu=${where}
    onPointerEnter=${e => { const now = state(); setPointed(now); e.currentTarget.dataset.tip = say(now); if (now.s.marks) c.cue?.([...now.s.marks]); }} onPointerLeave=${() => { setPointed(null); c.cue?.(null); }}
    onClick=${e => { e.stopPropagation(); const now = state(); c.fields.show(host, it.edge, !now.on, at); setPointed(null); }}>${Shell.icon('eye')}</button>`;
}
// The record of mark `id` at the place `at` is at in `host`'s: an entry's place in each box alike, by its labels (a
// File Number at its Jurisdiction); null where that box has none there.
function alikeIn(host, at, id) {
  if (at === host) return id;
  let x = id;
  for (const step of T.pathOf(recs(), at).slice(T.pathOf(recs(), host).length)) { x = entryNamed(x, recs()[step].edge); if (!x) return null; }
  return x;
}
// A row dragged onto the chart, by its grip or its label: the box under the pointer is lit as the target, and dropped
// there, it shows the entry. `reorder`, where the grip also reorders the row among its siblings, which a drop on the
// chart doesn't. → whether the drop was on the chart, asked as the row's own drag ends.
function carry(e, it) {
  if (e.button !== 0 || App.readOnly.peek() || !fields()) return () => false;
  const x0 = e.clientX, y0 = e.clientY;
  let ghost = null, over = null, onChart = false;
  const move = ev => {
    if (!ghost && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) return;
    onChart = !!document.elementFromPoint(ev.clientX, ev.clientY)?.closest?.('.dc');
    ghost ??= Object.assign(document.createElement('div'), { className: 'drag-field', textContent: it.edge });
    if (!ghost.isConnected) document.body.appendChild(ghost);
    ghost.hidden = !onChart;
    Object.assign(ghost.style, { left: `${ev.clientX + 12}px`, top: `${ev.clientY + 10}px` });
    over = onChart ? fields()?.over(ev.clientX, ev.clientY) : (fields()?.over(null), null);
  };
  const up = () => {
    removeEventListener('pointermove', move); removeEventListener('pointerup', up);
    ghost?.remove();
    if (over) fields()?.drop(it.edge); else fields()?.over(null);
  };
  addEventListener('pointermove', move);
  addEventListener('pointerup', up);
  return () => onChart;
}
// A row copied, Ctrl+C on it or on its value: its entry, as a field, which Ctrl+V on a box shows there (see Fields).
function copied(e, it, at) {
  if (!fields() || it.error) return;
  const el = e.target, typed = el.matches?.('input, textarea') ? el.value.slice(el.selectionStart, el.selectionEnd) : null;
  const r = it.id && recs()[it.id], text = typed ?? (r ? T.outputText(r) : it.edge);
  if (typed === null) { e.preventDefault(); e.clipboardData?.setData('text/plain', text); }
  fields().clip(it.edge, text);
}

// An entry's row. Its grip drags it, and clicked opens its menu, as the context-menu key does from its value; dragged
// onto the chart, by its grip or its label, it shows there. A tag is a checkbox row, its box before its name, as the
// two-box panel draws one; its entries beneath it. Pointed at, its field on the chart lights, and the other way round.
function Entry({ it, at, depth }) {
  const r = it.id ? recs()[it.id] : null, f = !!r && fx(it.id), sibs = () => slots(at).filter(s => s.id).map(s => s.id);
  const tag = r ? boxed(it.id) : it.na || (!it.error && !it.unsure && kindAt(tree(at), it.edge).type === 'tag'), day = ending(at, it.edge), end = day !== r?.value ? day : null;
  const keyMenu = e => { if (r && (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10'))) { e.preventDefault(); entryMenu(e.target, it.id); } };
  // A press on its label takes the keys to the row, so Ctrl+C copies it, and may drag it onto the chart.
  const press = e => { if (e.target.closest('input, textarea, button')) return; const row = e.currentTarget.closest('.row'); row.tabIndex = -1; row.focus({ preventScroll: true }); carry(e, it); };
  const k = html`<div class="k" onPointerDown=${press}><${Label} it=${it} fx=${f} /></div>`, v = end
    ? html`<div class="v redline">${r ? html`<s class="del date">${short(r.value)}</s>` : null}<span class="add date">${short(end)}</span></div>`
    : html`<div class="v ctl"><${Output} id=${it.id} slot=${it} label=${it.edge} /></div>`;
  const light = on => fields()?.light(on ? fieldKey(it, at) : null);
  const grip = e => { const chart = carry(e, it); drag(e, (from, i) => { if (!chart()) reorder(at, moved(sibs(), from, i)); }, g => entryMenu(g, it.id)); };
  const tone = r?.tag === false ? App.noTone(it.id) : '';
  return html`<div class="ent" data-drag=${r ? at : null}>
    <div class=${'row' + (tag ? ' chk' : '') + (r?.tag === false ? (tone === 'fails' ? ' failed' : tone === 'heeds' ? ' heeds' : ' ruled') : '') + (lit(it, at) ? ' lit' : '')} data-key=${it.id ?? `${at}|${it.edge}`} style=${`--depth:${depth}`}
      onKeyDown=${keyMenu} onPointerEnter=${() => light(true)} onPointerLeave=${() => light(false)} onCopy=${e => copied(e, it, at)}>
      ${r ? html`<button class="grip" tabindex="-1" aria-hidden="true" onPointerDown=${grip}>${GRIP}</button>` : null}
      ${tag ? [v, k] : [k, v]}
      <${OnChart} it=${it} at=${at} />
    </div>
    ${r && overrides(it.id) ? html`<${TypedOver} id=${it.id} depth=${depth} />` : null}
    ${r && !('field' in r) ? html`<${Entries} at=${it.id} depth=${depth + 1} />` : null}
  </div>`;
}
// What a value typed over a rule says, under it, so no reader can miss that it isn't what the rule says; and the way back to the rule.
const ruleSays = id => App.ruleSaid(id, App.computed.value);
// (Who said so, why and until when go with it: a decision kept in the open, dendra.md, Definitions: Typed over.)
const backToRule = id => App.backToRule(id);
function TypedOver({ id, depth }) {
  const o = App.overOf(id);
  return html`<div class="typedover" style=${`--depth:${depth}`}><span>Typed over: the rule ${ruleSays(id)}${o?.until ? `, until ${short(o.until)}` : ''}</span>${App.readOnly.value ? null : html`<button class="lk" onClick=${() => backToRule(id)}>Back to the rule…</button>`}${o?.why ? html`<span class="tov-why">${o.why} · ${o.who}, ${short(T.isoOf(new Date(o.when)))}</span>` : null}</div>`;
}

// Options as they're typed where several can be: each after a comma, once.
const optionsTyped = s => [...new Set(String(s).split(',').map(T.clean).filter(Boolean))];
// An entry being added: its name, then its value, option or tick. Esc, or leaving it empty, drops it.
function Draft({ d, depth }) {
  const [edge, setEdge] = useState(d.edge ?? ''), [k, setK] = useState(d), box = useRef();
  // A new value's first figure says what it is: a date, typed here, is offered as one that recurs, ticked, as a questionnaire's does, the next from its own day and this one standing on its (dendra.md, Time).
  const [dated, setDated] = useState(false), [recurs, setRecurs] = useState(true), fresh = !specsAt(tree(d.at), T.clean(edge)).length;
  const typing = e => { if (k.type !== 'field' || e.target.matches?.('[type=checkbox]')) return; setDated(fresh && !!T.clean(e.target.value) && T.parseDate(T.clean(e.target.value)) !== null); };
  const named = () => { const e = T.clean(edge); if (e && !d.edge) setK({ ...d, ...kindAt(tree(d.at), e), type: d.type, datatype: kindAt(tree(d.at), e).datatype }); return e; };
  const finish = out => { const e = named(); if (!e || !out) return; draft.value = null; addEntry(d.at, e, out, { recurs: out.field === 'date' && dated && recurs }); };
  // A yes-or-no or a check named is made, nothing ticked (makeTag).
  const tagged = d.type === 'tag' || d.type === 'check', made = () => { const e = named(); if (!e) return; draft.value = null; makeTag(d.at, e, d.type === 'check'); };
  // Options set up front, as Excel's list takes them, by commas: each made, in the order typed, as one change; the record's
  // own is then picked from them, here, or never.
  const several = os => {
    const e = named();
    if (!e) return;
    App.change(tx => os.forEach(o => tx.add('spec', { tree: { out: { choice: o }, args: [{ edge: e, loc: T.specOf(tree(d.at)) }] } })));
    draft.value = { at: d.at, type: 'choice', edge: e, ...kindAt(tree(d.at), e) };
  };
  useLayoutEffect(() => { if (d.edge && d.type === 'choice') box.current?.querySelector('.v button')?.focus(); }, []);
  // Leaving keeps a named tag, and drops anything else not finished; a dropdown's menu isn't leaving.
  const leave = e => {
    if (!box.current || box.current.contains(e.relatedTarget) || e.relatedTarget?.closest?.('.float')) return;
    if (tagged && T.clean(edge)) made(); else if (draft.peek() === d) draft.value = null;
  };
  const key = e => { if (e.key === 'Escape') { e.stopPropagation(); draft.value = null; } };
  const nameKey = e => { if (e.key !== 'Enter') return; e.preventDefault(); if (!named()) return; if (tagged) made(); else box.current.querySelector('.v input, .v button')?.focus(); };
  const tag = tagged, name = html`<div class="k">${d.edge ? html`<span class="lbl">${d.edge}</span>` : html`<input class="cell" placeholder="Name" aria-label="Name" value=${edge}
      ref=${el => el && !el.dataset.on && (el.dataset.on = 1, el.focus())} onInput=${e => setEdge(e.target.value)} onKeyDown=${nameKey} onBlur=${named} />`}</div>`;
  const value = html`<div class="v ctl">${tag ? html`<span class="cellbox"><span class="tag" aria-hidden="true" /></span>`
      : k.type === 'choice' && k.options?.length ? html`<${Choice} options=${k.options} label=${T.clean(edge) || 'Choice'} put=${finish} />`
      : k.type === 'choice' ? html`<span class="cellbox"><input class="cell" placeholder="New options" aria-label="New options" ref=${el => d.edge && el && !el.dataset.on && (el.dataset.on = 1, el.focus())} onKeyDown=${e => { const os = optionsTyped(e.target.value); if (e.key !== 'Enter' || !os.length) return; if (os.length > 1) several(os); else finish({ choice: os[0] }); }} /></span>`
      : html`<${Field} datatype=${k.datatype ?? null} auto=${!!d.edge} label=${T.clean(edge) || 'Value'} put=${finish} />`}</div>`;
  return html`<div class=${'row draft' + (tag ? ' chk' : '') + (dated ? ' asks-recurs' : '')} ref=${box} style=${`--depth:${depth}`} onFocusOut=${leave} onKeyDown=${key} onInput=${typing}>${tag ? [value, name] : [name, value]}
    ${dated ? html`<label class="recurs"><input type="checkbox" checked=${recurs} onMouseDown=${e => e.preventDefault()} onChange=${e => setRecurs(e.target.checked)} />Changes over time</label>` : null}</div>`;
}

// A record's entries; `offer`ed, with every entry it could have and hasn't, each blank, to fill at once. Each
// is keyed by its label, so a blank one filled, or a computed one typed over, is the same row, still focused.
function Entries({ at, depth, offer }) {
  const d = draft.value, list = slots(at, offer), p = App.pending.value;
  // The end entry a deletion pending gives it, where it has none yet.
  if (p?.verb === 'Delete' && typeof p.word === 'string' && ending(at, p.word) && !list.some(s => T.same(s.edge, p.word))) list.push({ edge: p.word, at });
  return html`${list.map(it => html`<${Entry} key=${T.norm(it.edge)} it=${it} at=${at} depth=${depth} />`)}
    ${d?.at === at ? html`<${Draft} key=${JSON.stringify(d)} d=${d} depth=${depth} />` : null}`;
}

// ---- Relatives, documents and look: sections, each folding under its heading ----
function Section({ title, n, shut = false, act, id, cls = '', list, children }) {
  const [open, setOpen] = useState(!shut);
  // Aimed at, as Find aims at a list, it opens.
  if (!open && aim.value === id) setOpen(true);
  // (`list`, its rows: one stop for Tab, the arrows going through them, as every list a click opens.)
  return html`<section class=${(open ? 'open' : '') + cls} data-key=${id} data-title=${title} data-list=${list ?? null}><h3 class="sect"><button class="fold" aria-expanded=${open} onClick=${() => setOpen(!open)}>${title}</button>
    ${n ? html`<span class="n">${n}</span>` : null}${act}</h3>${open ? children : null}</section>`;
}
// A long panel's strip, sticky at its top: the record, then each section by its name, a click from each, folded or not;
// Look and Position last, always shown, however many there are before them. It shows once the panel runs past the window.
function Strip() {
  App.state.value; App.scene.value;   // (Sections come and go with the chart.)
  const [names, setNames] = useState([]), [long, setLong] = useState(false), [more, setMore] = useState(false), [at, setAt] = useState(null), ref = useRef();
  useLayoutEffect(() => {
    const panel = ref.current?.parentElement, pane = panel?.closest('.inspector');
    if (!panel) return;
    const now = [...panel.querySelectorAll(':scope > section')].map(s => s.dataset.title);
    if (now.join('|') !== names.join('|')) setNames(now);
    if (!long && pane && pane.scrollHeight > pane.clientHeight + 8) setLong(true);
    const row = ref.current.querySelector('.names'), over = !!row && row.scrollWidth > row.clientWidth + 1;
    if (over !== more) setMore(over);
  });
  // Where you are: the section under the strip, marked, and in view along it.
  useLayoutEffect(() => {
    const panel = ref.current?.parentElement, pane = panel?.closest('.inspector');
    if (!pane) return;
    const here = () => {
      const edge = ref.current.getBoundingClientRect().bottom + 4, s = [...panel.querySelectorAll(':scope > section')].filter(x => x.getBoundingClientRect().top <= edge).at(-1), to = pane.scrollTop < 8 ? null : s?.dataset.title ?? null;
      setAt(a => (a === to ? a : to));
    };
    pane.addEventListener('scroll', here, { passive: true });
    return () => pane.removeEventListener('scroll', here);
  }, []);
  useLayoutEffect(() => { const row = ref.current?.querySelector('.names'), on = row?.querySelector('.lk.on'); if (on) { if (on.offsetLeft < row.scrollLeft) row.scrollLeft = on.offsetLeft; else if (on.offsetLeft + on.offsetWidth > row.scrollLeft + row.clientWidth - 16) row.scrollLeft = on.offsetLeft + on.offsetWidth - row.clientWidth + 16; } }, [at]);
  const go = title => {
    const panel = ref.current.parentElement, pane = panel.closest('.inspector');
    if (!title) { pane.scrollTop = 0; return; }
    const s = [...panel.querySelectorAll(':scope > section')].find(x => x.dataset.title === title);
    s?.querySelector('.fold[aria-expanded="false"]')?.click();
    setTimeout(() => s?.scrollIntoView({ block: 'start' }));
  };
  const chip = (title, label = title) => html`<button class=${'lk' + (at === title ? ' on' : '')} key=${label} aria-current=${at === title ? 'true' : null} onClick=${() => go(title)}>${label}</button>`, pinned = ['Position', 'Look'].filter(x => names.includes(x)), rest = names.filter(x => !pinned.includes(x));
  // Those there's no room for are a click away, all by name, where you are ticked.
  const all = e => menu(e.currentTarget, [{ label: 'Record', checked: !at, run: () => go(null) }, ...rest.map(x => ({ label: x, checked: at === x, run: () => go(x) }))], { search: rest.length > 7 });
  return html`<nav class=${'strip' + (long ? '' : ' none')} ref=${ref} aria-label="Sections">
    <span class=${'names' + (more ? ' more' : '')} onWheel=${e => { if (e.deltaY) { e.currentTarget.scrollLeft += e.deltaY; e.preventDefault(); } }}>${chip(null, 'Record')}${rest.map(x => chip(x))}</span>
    ${more ? html`<button class="btn icon strip-more" aria-haspopup="menu" aria-label="All sections" data-tip="All sections" onClick=${all}>${icon('chevron')}</button>` : null}
    ${pinned.length ? html`<span class="pinned">${pinned.map(x => chip(x))}</span>` : null}</nav>`;
}
const plus = (label, run) => App.readOnly.value ? null : html`<button class="btn icon" aria-label=${label} data-tip=${label} onClick=${run}>${icon('plus')}</button>`;

// A relative's other sides, but the one it's named as: "signs for the Manager", not "…, via the Manager".
const further = it => it.rest.filter(a => objectOf(a.at) !== it.obj);
// What a relation with a relative says: its role (its option or value, else the reason a formula gives it,
// as the formula bar gives it, its words on hover), then at most three facts: a tag ruled out, in red where
// it's a check that fails ("Capacity Held: No"), or anywhere in a chart with no Check notes; the others in it
// ("via GP III"); words, options and values recorded at it (a second percentage saying which, "20% voting",
// where it says something else), but a figure worked out to nothing more than zero, which is no news (a limited
// partner's 0% voting); dates (a start or an end saying so). Words that say the role more fully
// ("Director (Chair)") are the role. The document that evidences it is a link, to open.
function detail(it) {
  const rel = recs()[it.rid], firsts = new Map(), at = slots(it.rid).filter(s => s.id).map(s => [s.id, recs()[s.id]]);
  const value = f => { const v = T.format(f.field, f.value), first = firsts.get(f.field);
    if (!first) { firsts.set(f.field, { edge: f.edge, v }); return v; }
    if (v === first.v) return null;
    const own = f.edge.split(/\s+/).filter(w => !first.edge.split(/\s+/).some(x => T.same(x, w))).join(' ');
    return `${v} ${(own || f.edge).toLowerCase()}`; };
  const words = [...at.filter(([, e]) => 'choice' in e).map(([, e]) => e.choice), ...at.filter(([, e]) => e.field === 'text').map(([, e]) => e.value)];
  let role = 'choice' in rel ? rel.choice : 'field' in rel ? T.format(rel.field, rel.value) : at.some(([, e]) => 'choice' in e) ? words[0] : null;
  role = (role && words.find(w => w.length > role.length && T.norm(w).startsWith(T.norm(role)))) ?? role;
  const figures = at.filter(([id, e]) => 'field' in e && !['text', 'date', 'document'].includes(e.field) && !(fx(id) && e.value === 0)).map(([, e]) => value(e)).filter(Boolean);
  // With no role, its figures stand for one, at the right.
  const figure = !role && figures.length ? figures.join(' · ') : null;
  const facts = [...at.filter(([, e]) => e.tag === false).map(([id, e]) => ({ text: `${e.edge}: No`, no: failed(id) })),
    ...further(it).map(a => ({ text: `${lower(a.edge)} ${termOf(a.at)}` })),
    ...words.filter(w => !(role && T.same(w, role))).map(text => ({ text })),
    ...(figure ? [] : figures.map(text => ({ text }))),
    ...at.filter(([, e]) => e.field === 'date').map(([e, f]) => ({ date: e, text: `${N().isStart(tree(e)) ? 'since' : N().isEnd(tree(e)) ? 'ends' : lower(f.edge)} ${short(f.value)}` }))];
  // When it holds, where it has no date of its own to say so: an ownership's period, or what's at its sides'; a row dates the
  // value it shows ("85% since Dec 20"), so where its figure has held for less than the relation has, from then. What's
  // coming stands beside it ("55% from Feb 1, 2027").
  const entered = !fx(it.rid), span = entered && !at.some(([, e]) => e.field === 'date') && App.spanOf(it.rid);
  const lead = at.find(([id, e]) => FIGURES.has(e.field) && !fx(id)), rows = lead ? App.shown.value.item(App.chart.value, lead[0]) : [], now = rows.find(v => Log.validOn(v, App.day.value)), next = rows.find(v => v.since > App.day.value);
  const since = [span?.from?.day, now?.since].filter(Boolean).sort().at(-1);
  // (What a record's end records, a merger, is no period: it's its day.)
  if (span?.until && App.endsAct(it.rid)) facts.push({ text: short(span.until.day) });
  else {
    if (since) facts.push({ text: `since ${short(since)}` });
    if (span?.until) facts.push({ text: `until ${short(span.until.day)}` });
  }
  if (next) facts.unshift({ text: `${T.outputText(next)} from ${short(next.since)}`, coming: true });
  const ev = relatives(it.rid).docs.find(d => linkOf(d.obj)), why = !role && !figure && !facts.length && because(it.rid), ground = why && groundSaid(it);
  // A role stated of a relation a check fails at doesn't hold, and is drawn so where it's stated (Okafor's "Managing Member").
  const fails = at.some(([id, e]) => e.tag === false && failed(id));
  return { role: role ?? figure ?? (why ? why.cite : null), tip: why?.words, facts: [...(ground ? [{ text: ground }] : []), ...facts].slice(0, 3), held: entered, fails,
    doc: ev && { name: nameOf(ev.obj), href: SharePoint.href(recs()[linkOf(ev.obj)].value) } };
}
const FIGURES = new Set(['percent', 'number', 'money']);
// A computed relative's ground, in words, where the rows that gave it have some (a label that's a citation has none): a row
// of words ("general partner"), or, through another, whom and how: "via GP III, its general partner"; and how the
// relative stands to that one, where its row has words ("managing member there").
function groundSaid(it) {
  const R = App.computed.value, r = recs(), rel = r[it.rid], def = R.computed[it.rid]?.def, word = l => l && !/^[(§]/.test(l) ? lower(l) : null;
  let row = null;
  try { row = Formulas.ground(R, it.rid)?.rows?.[0]; } catch {}
  if (!row) return null;
  const mine = rel.args.find(a => T.same(a.edge, it.mine))?.at, other = rel.args.find(a => T.same(a.edge, it.edge))?.at;
  const down = ps => (ps ?? []).flatMap(p => [p.id, ...down(p.items)]), ids = down(row.parts).filter(x => x && x !== it.rid && R.computed[x]?.def === def);
  const to = ids.find(x => r[x]?.args?.some(a => a.at === mine)), from = ids.find(x => r[x]?.args?.some(a => a.at === other));
  // Reached through a record it holds by the same relation, the words its row has say whose they are: more than 25% of voting securities,
  // via AIV-1 Blocker, not as if it held them itself.
  if (!to) { const by = from && r[from].args.find(a => a.at !== other)?.at; return by ? [word(row.label), `via ${termOf(by)}`].filter(Boolean).join(', ') : word(row.label); }
  const via = r[to].args.find(a => a.at !== mine)?.at, near = word(because(to)?.label), far = from && word(because(from)?.label);
  // (Never via the one it's of: the same two the other way round is no way through.)
  if (via === other) return word(row.label);
  // (What names a role is its: its general partner. What says how isn't: through a controlled company.)
  return `via ${termOf(via)}${near ? `, ${near.includes(':') || /^(?:through|by|via|as|under|more|presumed)\b/i.test(near) ? '' : 'its '}${near}` : ''}${far ? `; ${far} there` : ''}`;
}
const fact = (f, first) => { const text = first ? upper(f.text) : f.text; return f.date ? dated(f.date, text) : f.no ? html`<span class="no">${text}</span>` : text; };
const facts = (list, first) => list.map((f, i) => html`${i ? ' · ' : ''}${fact(f, first && !i)}`);

// A relation `t` said as a sentence, in the formula bar's words: "Fund III is an investor in Fund III
// Blocker", "Margaret A. Chen is a managing member of GP III", and any further side after ("…, via GP III").
// `side(edge, first)` says who's at an edge; an option says the role, and `role`, given, draws it in its
// place, a dropdown ("is a [director ▾] of the BDC"), the words either side each `wrap`ped.
function sentence(t, edges, side, { choice, not, role, wrap = x => x } = {}) {
  const [e0, e1, ...rest] = edges, r = choice ?? e0;
  const [a, words, b] = FormulaBar.phrase?.(t, e0, e1, { choice, not }) ?? [e0, ` is ${not ? 'not ' : ''}${article(r)} ${lower(r)} of `, e1];
  const i = role ? words.toLowerCase().lastIndexOf(String(choice).toLowerCase()) : -1, after = html`${side(b)}${rest.map(e => html`, ${lower(e)} ${side(e)}`)}`;
  return i < 0 ? html`${wrap(html`${side(a, true)}${words}${after}`)}${role ? html` ${role(choice)}` : null}`
    : html`${wrap(html`${side(a, true)}${words.slice(0, i)}`)}${role(words.slice(i, i + choice.length))}${wrap(html`${words.slice(i + choice.length)}${after}`)}`;
}
// A relation ruled out, said plainly, as the formula bar says it but for whose record it is: "Not a remote
// affiliate of the BDC", "Does not sign for the Manager". Where a formula rules it out because another
// relation holds between the two, that one is said after it, with the clause that rules: "Not a remote
// affiliate: a close affiliate of the BDC (§57(b))".
function notText(it, held) {
  const why = because(it.rid), [, head, clause] = /^(.*?)\s*(\(.*\))?$/.exec(why?.label ?? ''), cite = why && why.cite !== why.label ? `(${why.cite})` : clause;
  const by = held.find(x => x.obj === it.obj && T.same(nameOf(x.rid), head)), rest = further(by ?? it).map(a => `, ${lower(a.edge)} ${termOf(a.at)}`).join('');
  const not = `Not ${article(it.mine)} ${lower(it.mine)}`, said = FormulaBar.phrase?.(tree(it.rid), it.mine, it.edge, { not: true });
  const says = said && T.same(said[0], it.mine) ? upper(said[1].trim().replace(/^is /, '')) : `${not} of`;
  return by ? `${not}: ${article(by.mine)} ${lower(by.mine)} of ${termOf(it.obj)}${rest}${cite ? ' ' + cite : ''}`
    : `${says} ${termOf(it.obj)}${rest}${why ? `: ${lower(why.cite)}` : ''}`;
}

// A list a formula gives can be opened as a table, of its relation's rows and why each holds (Table.openList).
const asTable = () => typeof Table !== 'undefined';
// A document linked to a record, from its Documents section's +: an object's by a link; a relation's (an ownership, a position)
// by the relation it's evidenced by, one the chart has, or a new one named as it's typed, as a list's Add asks who.
const docList = id => recs()[id].args ? listsOf(id, true)[0] ?? null : null;
const docAdd = id => { const l = docList(id); return recs()[id].kind ? plus('Link a document', e => linkAdd(e.currentTarget, id)) : l ? plus('Add a document', e => addTo(e.currentTarget, id, l)) : null; };
// How long a list a formula gives can be and stay open.
const SHORT = 5;
// Rows ticked in the panel's lists, the session's, till the selection moves on.
const ticked = signal(new Set());
// A relative as its row names it: an object by its short name; a relation by the place rule, with what it says (its role,
// or its amount): "Margaret A. Chen → Cayman GP, Director", "Holdco → Blocker, 100%". placeName, as a tooltip or a search has
// it: an object's name in full.
function rowName(x) {
  const r = recs()[x];
  if (!r?.args) return shortOf(x);
  const lead = 'choice' in r ? r.choice : (t => t?.amount ? T.outputText(recs()[t.amount]) : null)(App.transferable(x)) ?? slots(x).map(s => s.id && recs()[s.id]).find(e => e && 'choice' in e)?.choice;
  return `${segment(x)}${lead ? `, ${lead}` : ''}`;
}
const placeName = x => recs()[x]?.args ? rowName(x) : nameOf(x);
// What's worked out of a list's chains, kept with what it's worked out from.
const chains = new WeakMap();
// A list's + adds to it as Add's list of it does (addTo): who, one the chart has or a new one named.
function Relatives({ id }) {
  const { lists: held0, docs, nots } = relatives(id), later = coming.value.get(id) ?? [];
  // What's coming goes in the list it'll be looked for in; a list with only that has its heading too.
  const lists = [...held0, ...[...new Set(later.map(x => x.name))].filter(n => !held0.some(([k]) => T.same(k, n))).map(n => [n, []])];
  const laterIn = name => later.filter(x => T.same(x.name, name));
  const isnts = FormulaBar.notOn?.(id) ?? [];
  const add = (e, name) => { const l = listsOf(id).find(x => T.same(x.name, name)); if (l) addTo(e.currentTarget, id, l); };
  // A relative takes two lines: its name and role, then the facts; with no role, the facts take its place.
  // The name is the long thing and the role or figure the short one, set at the right.
  // One the chart shown leaves out, though it draws others of its list, says so, with Show (leftOut).
  const left = new Map(leftHere(id).flatMap(p => p.items.map(it => [it.rid, it.show]))), v = viewShown(), picked = ticked.value, still = App.readOnly.value;
  const pick = rid => { const s = new Set(ticked.peek()); s.has(rid) ? s.delete(rid) : s.add(rid); ticked.value = s; };
  // A relative's name goes to the record, its figure or role to the relation; each says so on hover, as a link does. An
  // entered one has a box to tick, for ending several at once (see Section's End these…).
  const item = (it, nest = 0) => { const f = fx(it.rid), d = detail(it), out = left.get(it.rid), going = goes(it.rid) || App.pending.value?.too?.includes(it.rid);
    // Its right-click has what its line's menu has: its panel's ⋯, End… among it, the panel staying on this record.
    const whyOf = () => { emit('why-open', it.rid); FormulaBar.open.value = true; FormulaBar.into(); };
    const rowMenu = e => { if (e.target.closest('input, textarea') || (f && !e.keyed)) return; e.preventDefault(); menu({ x: e.clientX, y: e.clientY }, f ? [{ label: 'Open', keys: 'Enter', run: () => goTo(it.rid) }, { label: 'Why', keys: 'F1', run: whyOf }] : moreOf(it.rid, { stay: true })); };
    // A row that lights opens on a click, anywhere on it: what's said of it, as its figure or role does; and on Enter, the row having the keys.
    const rowClick = e => { if (!e.target.closest('button, a, input, textarea, label') && !getSelection()?.toString()) goTo(it.rid); };
    const rowKey = e => { if (e.key === 'Enter' && e.target === e.currentTarget) { e.preventDefault(); e.stopPropagation(); goTo(it.rid); } };
    return html`<div class=${'row rel' + (going ? ' going' : '')} key=${it.rid} data-why=${it.rid} style=${nest ? `--nest:${nest}` : null} onClick=${rowClick} onContextMenu=${rowMenu} onKeyDown=${rowKey}>
      ${d.held && !still ? html`<input type="checkbox" class="tick" aria-label=${`Tick ${nameOf(it.obj)}`} checked=${picked.has(it.rid)} onChange=${() => pick(it.rid)} />` : null}
      <div class=${'k' + (d.role || d.facts.length || d.doc ? '' : ' wide')}><${Go} to=${it.obj} cls=${f ? 'fx' : ''} tip=${`Open ${placeName(it.obj)}`}>${bound(rowName(it.obj))}</${Go}></div>
      <div class="v">${d.role || d.facts.length ? html`<${Go} to=${it.rid} cls=${(f ? 'fx' : '') + (d.fails ? ' fails' : '')} tip=${d.tip || `Open this ${lower(nameOf(it.rid))}`}>${d.role ?? facts(d.facts, true)}</${Go}>` : null}
        ${d.doc ? html`<a class="btn icon open" href=${d.doc.href} target="_blank" rel="noopener" aria-label=${`Open ${d.doc.name}`} data-tip=${d.doc.name}>${OPEN}</a>` : null}
        ${entriesAt(it.rid).filter(e => fx(e) && recs()[e].field === 'date').map(e => html`<span class="due-at" data-key=${e}><${Filed} id=${e} /></span>`)}</div>
      ${d.role && d.facts.length ? html`<div class="facts">${facts(d.facts)}</div>` : null}
      ${out ? html`<div class="facts here">Not shown here${App.readOnly.value && !App.seeing() ? null : html` · <button class="lk" onClick=${() => showHere(out, v)}>Show</button>`}</div>` : null}</div>`; };
  // A document by its name, its first choice and date beneath, and a way to open it.
  const docRow = it => { const l = recs()[linkOf(it.obj)], s = slots(it.obj).filter(x => x.id).map(x => recs()[x.id]);
    const sub = [s.find(x => 'choice' in x)?.choice, s.find(x => x.field === 'date')].filter(Boolean).map(x => x.value ? short(x.value) : x);
    return html`<div class="doc" key=${it.rid}><${Go} to=${it.obj} tip=${`Open ${nameOf(it.obj)}`}>${bound(nameOf(it.obj))}</${Go}>
      ${l ? html`<a class="btn icon open" href=${SharePoint.href(l.value)} target="_blank" rel="noopener" aria-label="Open" data-tip="Open">${OPEN}</a>` : null}
      ${sub.length ? html`<span class="meta">${sub.join(' · ')}</span>` : null}</div>`; };
  // Lists someone entered first; those a formula gave, folded, after; then documents, once there are any; and
  // last, quieter, what's ruled out, each with its reason's words on hover.
  const worked = items => !!items.length && items.every(it => fx(it.rid)), typing = linking.value === id;
  // Faint, in its list, by the day it holds from, a real control; and what it'll say then.
  const laterRow = x => html`<div class="row rel coming" key=${'later' + x.rid + x.obj}>
    <div class="k"><${Go} to=${x.obj} tip=${`Open ${x.full}`}>${bound(x.says)}</${Go}></div>
    <div class="v">${x.role ? html`<${Go} to=${x.rid} tip=${`Open this ${lower(N().nameOf(x.then, x.rid))}`}>${x.role}</${Go}>` : null}</div>
    <div class="facts">from <${DayOf} id=${x.rid} side="from" day=${x.on} shows=${x.on} /></div></div>`;
  const held = lists.flatMap(([, items]) => items);
  // A list's count says how many of it a check fails at: "3 · 1 doesn't hold"; and one a rule in error gives, that it's no answer.
  // A figure worked out through others on the same list is the same stake, nested under what it runs through (dendra.md, Finding your way):
  // so three rows of 66% are said to be one, and nobody adds them.
  const chained = items => {
    if (!worked(items) || !items.every(it => recs()[it.rid]?.field === 'percent')) return null;
    const R = App.computed.value, r = recs(), by = new Set(items.map(it => it.rid)), up = new Map(), k = items.map(it => it.rid).join(), memo = chains.get(R) ?? chains.set(R, new Map()).get(R);
    if (memo.has(k)) return memo.get(k);
    const down = ps => (ps ?? []).flatMap(p => [p.id, ...down(p.items)]);
    for (const it of items) {
      let row = null;
      try { row = Formulas.ground(R, it.rid)?.rows?.[0]; } catch {}
      const here = r[it.rid].args.find(a => T.same(a.edge, it.mine))?.at, to = row && down(row.parts).find(x => x && x !== it.rid && by.has(x) && r[x]?.args?.some(a => a.at === here));
      if (to) up.set(it.rid, to);
    }
    if (!up.size) { memo.set(k, null); return null; }
    const under = new Map(), depth = new Map(), rows = [];
    for (const it of items) { const p = up.get(it.rid); if (p) (under.get(p) ?? under.set(p, []).get(p)).push(it); }
    const roots = items.filter(it => !up.has(it.rid)), put = (it, d) => { rows.push(it); depth.set(it.rid, d); (under.get(it.rid) ?? []).forEach(x => put(x, d + 1)); };
    roots.forEach(it => put(it, 0));
    const out = { rows, depth, stakes: roots.length, total: T.format('percent', roots.reduce((s, it) => s + r[it.rid].value, 0)) };
    memo.set(k, out);
    return out;
  };
  const counted = (items, chain = chained(items)) => { const bad = items.filter(it => entriesAt(it.rid).some(e => recs()[e].tag === false && failed(e))).length;
    if (App.broken.value.reach.has(App.computed.value.computed[items[0].rid]?.def)) return html`${items.length} · <span class="no">can’t be relied on</span>`;
    if (chain) return html`${items.length} · ${chain.stakes === 1 ? `one stake, ${chain.total}` : `${chain.stakes} stakes, ${chain.total}`}`;
    return bad ? html`${items.length} · <span class="no">${bad} ${bad === 1 ? 'doesn’t' : 'don’t'} hold</span>` : items.length; };
  // Ticked rows of a list end together, on one day, as a change pending; the panel stays on this record.
  const endRows = items => { const ids = items.filter(it => picked.has(it.rid)).map(it => it.rid);
    return !ids.length || still ? null : html`<button class="btn ghost ends" onClick=${() => { const n = ids.length; App.deleting(ids, n === 1 ? said(ids[0]) : `${n} ${lower(T.plural(nameOf(ids[0])))}`, { source: 'inspector', auto: true, done: () => { ticked.value = new Set(); } }); }}>${App.deleteVerb(ids)} ${ids.length > 1 ? 'these' : 'this'}…</button>`; };
  const adds = (name, items) => items[0]?.rest.length || worked(items) ? null : plus(`Add to ${name}`, e => add(e, name));
  // Those a check fails at after those that hold, so a list never leads with the one that doesn't (Okafor's signing).
  const holdingFirst = items => { const bad = it => entriesAt(it.rid).some(e => recs()[e].tag === false && failed(e)); return [...items.filter(it => !bad(it)), ...items.filter(bad)]; };
  // A list a formula gives is folded where it's long; a short answer (a fund's Controllers) shows.
  return html`${[...lists.filter(([, x]) => !worked(x)), ...lists.filter(([, x]) => worked(x))].map(([name, items]) => html`<${Section} key=${name} id=${'list:' + name} title=${name} n=${items.length ? counted(items) : null} list=":scope > .row.rel"
      cls=${items.some(it => picked.has(it.rid)) ? ' ticking' : ''} shut=${worked(items) && items.length > SHORT} act=${html`${endRows(items)}${adds(name, items)}`}>${(c => (c ? c.rows.map(it => item(it, c.depth.get(it.rid))) : holdingFirst(items).map(it => item(it))))(chained(items))}${laterIn(name).map(laterRow)}
      ${worked(items) && asTable() ? html`<button class="lk as-table" onClick=${() => Table.openList(name, items[0].rid, id)}>Open ${name} as a table</button>` : null}
      ${worked(items) && FormulaBar.isntHere(id, items[0].rid, items[0].edge).length ? html`<div class="row"><button class="lk muted why-isnt" onClick=${e => FormulaBar.whyIsnt(e.currentTarget, id, items[0].rid, items[0].edge)}>Why isn’t… on this list?</button></div>` : null}</${Section}>`)}
    ${(FormulaBar.emptyLists?.(id, lists.map(([n]) => n)) ?? []).map(e => html`<section class="none-list" key=${'none' + e.name} data-title=${e.name}><span class="nm">${e.name}</span><span class="val">${App.broken.value.reach.has(e.def) ? html`<span class="no">can’t be relied on</span>` : 'none'}</span><button class="lk why-isnt" onClick=${ev => FormulaBar.isntOn(ev.currentTarget, id, e.def, e.side)}>Why isn’t…</button></section>`)}
    ${docs.length || typing || docList(id) ? html`<${Section} title="Documents" id="docs" n=${docs.length} act=${docAdd(id)}>
      ${docs.map(docRow)}
      ${typing ? html`<div class="row"><div class="k wide"><input class="cell" placeholder="Link" aria-label="Link" ref=${el => el && !el.dataset.on && (el.dataset.on = 1, el.focus())}
        onKeyDown=${e => { if (e.key === 'Enter') { const u = T.clean(e.target.value); if (T.isAddress(u)) { linking.value = null; link(id, u); } else e.target.setAttribute('aria-invalid', 'true'); } else if (e.key === 'Escape') { e.stopPropagation(); linking.value = null; } }}
        onBlur=${() => { linking.value = null; }} /></div></div>` : null}</${Section}>` : null}
    ${nots.length || isnts.length ? html`<div class="nots">${nots.map(it => html`<div class="row" key=${it.rid}><div class="k wide"><${Go} to=${it.rid} tip=${because(it.rid)?.words}>${notText(it, held)}</${Go}></div></div>`)}
      ${isnts.map(x => html`<div class="row" key=${x.key}><div class="k wide"><button class="lk" onClick=${x.run}>${x.label}</button></div></div>`)}</div>` : null}`;
}

// Look: each format property set for a mark and its value, under where it comes from, said once, as an
// entry's entries sit under it; shown once there is one. A color goes by PowerPoint's name for it, a code
// only for one of the user's own; a size is as typed, what it prints at, and a weight as PowerPoint gives it. Format is what a mark's own text shows, as the scene sets it:
// a box's and a tag's is its name, whatever the format, unless it's none, so there it says whether the name is
// shown; what's recorded at it (a line's percentage) is a text of its own, so a line can hide its name and
// still draw its 64%.
const TEXTS = { value: 'Value', label: 'Name and value', paren: 'Value in parentheses', none: 'None' };
const labelOf = (label, named) => label === 'Corner' ? 'Rounding' : label === 'Dash' ? 'Dashes' : label !== 'Format' ? label : named ? 'Name' : 'Text';
const DASHES = { dotted: 'Round dot', 'square-dot': 'Square dot', dashed: 'Dash', 'dash-dot': 'Dash dot', 'long-dash': 'Long dash', 'long-dash-dot': 'Long dash dot', 'long-dash-dot-dot': 'Long dash dot dot' };
const shadowSaid = v => { const o = Scene.shadowOf(v); return !o ? 'None' : `${o.blur} pt blur, ${o.distance} pt at ${o.angle}°`; };
const headSaid = v => Object.entries(v ?? {}).map(([end, h]) => `${upper(end)}: ${h.type}, ${h.size}`).join('; ') || 'Triangle, small';
const colorName = v => (typeof FormatBar !== 'undefined' && FormatBar.colorName?.(v)) || v.toUpperCase();
const val = (label, v, named) => typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v) ? html`<i class="chip" style=${`background:${v}`} />${colorName(v)}`
  : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : label === 'Size' ? `${v} pt`
  : label === 'Weight' ? `${+Scene.toSlide(App.scene.value?.page, v).toFixed(2)} pt`
  : label === 'Format' ? (named ? (v === 'none' ? 'Hidden' : 'Shown') : TEXTS[v] ?? upper(String(v)))
  : label === 'Corner' || label === 'Transparency' ? `${Math.round(v)}%`
  : label === 'Shadow' ? shadowSaid(v) : label === 'Arrowhead' ? headSaid(v) : label === 'Dash' ? DASHES[v] ?? upper(String(v))
  : label === 'Shape' ? (typeof FormatBar !== 'undefined' && FormatBar.shapeName?.(v)) || SHAPES[v] || upper(String(v)) : upper(String(v));
function LookSection({ look, reset, named }) {
  if (!look.length) return null;
  const from = [...new Set(look.map(x => x.from))];
  return html`<${Section} title="Look" id="look" act=${reset}>${from.map(f => html`
    ${f ? html`<div class="row src" key=${f}><div class="k wide">${f}</div></div>` : null}
    ${look.filter(x => x.from === f).map(x => html`<div class="row" key=${x.label} style=${`--depth:${f ? 1 : 0}`}><div class="k">${labelOf(x.label, named)}</div><div class="v">${x.said ?? val(x.label, x.value, named)}</div></div>`)}`)}</${Section}>`;
}
// A place on the page, where it's drawn, in points on the slide (the page is drawn smaller to fit it, by its scale), so the
// numbers are the ones PowerPoint shows: typed over to move or size it, and read back as typed, to a tenth. `lock`, keeping
// its proportions as either is typed: { on, set }.
const PLACES = [['Left', 'x'], ['Top', 'y'], ['Width', 'w'], ['Height', 'h']];
// A place typed in any measure a person says it in: points, or pixels (96 to the inch, as 100% draws the page), inches,
// centimetres or millimetres, read as points. → points, or undefined where it doesn't read, which it says.
const MEASURES = { pt: 1, point: 1, points: 1, px: 0.75, pixel: 0.75, pixels: 0.75, in: 72, inch: 72, inches: 72, '"': 72, cm: 72 / 2.54, mm: 72 / 25.4 };
function pointsOf(t) {
  const m = /^\s*(-?[\d,]*\.?\d+)\s*([a-z"]*)\.?\s*$/i.exec(t), k = m && (m[2] ? MEASURES[m[2].toLowerCase()] : 1);
  if (k) return Math.round(parseFloat(m[1].replace(/,/g, '')) * k * 100) / 100;
  Shell.toast(`“${T.clean(t)}” isn’t a measure: type points, or px, in or cm after the number`, { ms: 4000 });
}
const Place = ({ at, put, reset, keys = 'xywh', lock, turn }) => { const page = App.scene.value?.page;
  return html`<${Section} title="Position" id="place" act=${reset}>
  ${PLACES.filter(([, k]) => keys.includes(k) && at[k] != null).map(([label, k]) => html`<div class="row" key=${k} onClick=${e => { if (!e.target.closest('input')) e.currentTarget.querySelector('input')?.focus(); }}><div class="k">${label}</div><div class="v ctl" data-place=${k}>
    <${Field} r=${{ field: 'number', value: Math.round(Scene.toSlide(page, at[k] / Scene.PT) * 10) / 10 }} datatype="number" reads=${pointsOf} label=${label}
      put=${out => out && put(k, Math.round(Scene.fromSlide(page, out.value) * Scene.PT * 100) / 100)}><span class="unit">pt</span></${Field}></div></div>`)}
  ${turn ? html`<div class="row" key="r" onClick=${e => { if (!e.target.closest('input')) e.currentTarget.querySelector('input')?.focus(); }}><div class="k">Rotation</div><div class="v ctl" data-place="r"><${Field} r=${{ field: 'number', value: turn.at ?? 0 }} datatype="number" label="Rotation" put=${out => out && turn.set(out.value)}><span class="unit">°</span></${Field}></div></div>` : null}
  ${lock ? html`<label class="row lockrow"><span class="k wide"><input type="checkbox" checked=${!!lock.on} disabled=${App.readOnly.value} onChange=${e => lock.set(e.target.checked)} />Lock proportions</span></label>` : null}</${Section}>`; };
// Reset takes away what's entered for this mark alone, and says what, as History says it.
const resetting = (own, labels) => App.readOnly.value || !own.some(x => labels(x.label)) ? null
  : html`<button class="btn ghost reset" onClick=${() => App.change(tx => own.filter(x => labels(x.label)).forEach(x => tx.remove(x.note)), { say: c => Time.describe(c), dated: false })}>Reset</button>`;

// A record's look, as the view's scene has it: each property a note decides, from this box (or line) alone, a
// style's output (by its caption, the style's name first where the caption doesn't say it), or the chart's
// default, in that order; and a box's place and size, as it's drawn, however it came to be there. Reset takes its place
// away alone, the box going beside its relatives around what stands (the canvas's Tidy of that box).
function Look({ id }) {
  const sc = App.scene.value, v = sc.view, t = tree(id), n = N(), drawn = recs()[id].kind ? sc.byId.get(id) : null, entered = drawn ? n.position(t, v) : null, cv = Shell.parts.peek().canvas?.active?.();
  // This mark's own: a box's at its object, a line's at its relation's own tree, as the format bar notes them.
  const mine = x => x.pattern.id === id || (!!recs()[id].args && T.key(T.bare(x.pattern)) === T.key(T.bare(t)));
  const rank = x => mine(x) ? 0 : x.view ? 1 : x.pattern.kind === 'View' ? 2 : 3;
  // (The page's own, a note at the view itself, is what All text says.)
  const from = x => mine(x) ? (recs()[id].args ? 'This line' : 'This box') : x.pattern.kind === 'View' ? 'All text' : !x.view ? 'Default'
    : (s => { const c = Scene.captionOf(n, x.pattern, v); return T.norm(c).startsWith(T.norm(s)) ? c : `${s}: ${c}`; })(Scene.styleName(n, T.bare(x.pattern)));
  const bent = n.resolve('Bend', t, v)?.note;
  // An arrow its style leaves Auto is said so: this line has it by which way it runs, and it's no look of this line's own.
  const look = [...Object.entries(sc.byId.get(id)?.settings ?? {}).filter(([label, s]) => s?.note && label !== 'Shown' && label !== 'Position')
    .map(([label, s]) => ({ label, value: s.value, ...(label === 'Arrow' && s.note.value === 'auto' && { said: `Auto: ${s.value === 'none' ? 'none, as it runs down' : `${s.value === 'both' ? 'both ends' : `at the ${s.value}`}, as it doesn’t run down`}` }), from: from(s.note), rank: rank(s.note) })), ...(bent ? [{ label: 'Route', value: 'Bent', from: 'This line', rank: 0 }] : [])].sort((a, b) => a.rank - b.rank);
  // (And what's this box's alone of its fields, beside it, as a look pasted on it gives.)
  const beside = n.notes('Size').length ? ['Font', 'Size', 'Bold', 'Italic', 'Underline', 'Strike', 'Color', 'Align', 'Spacing'].flatMap(l => Object.values(n.fields(t, v, l)).map(r => r.note)) : [];
  const own = [...Object.values(n.formats(t, v)).map(r => r.note), ...beside, n.resolve('Position', t, v)?.note, bent].filter(x => x && x.view === v && mine(x));
  const resetPlace = !App.readOnly.value && Number.isFinite(entered?.x) && !Number.isFinite(entered?.order) ? html`<button class="btn ghost reset" onClick=${() => cv?.tidy({ say: `Reset the position of ${n.nameOf(recs(), id)}` })}>Reset</button>` : null;
  // (Its position before its look, so a row or a section the look gains moves no field under the pointer.)
  return html`${drawn ? html`<${Place} at=${drawn} put=${(k, x) => cv?.put(id, { [k]: x })} reset=${resetPlace} lock=${{ on: entered?.lock, set: on => cv?.lockSize(id, on) }} />` : null}
    <${LookSection} look=${look} named=${'tag' in recs()[id] || !!recs()[id].kind} reset=${resetting(own, l => l !== 'Position')} />`;
}

// ---- The views of a selection ----
// A header: its eyebrow, where it says more than the title does, and the title, or `children` in its place.
// `more`, what can be done with what's shown, as its box's or row's right-click offers it: behind ⋯ at the top right.
// `span`, when it holds, under its title.
function Head({ path = [], title, more, span, children }) {
  const said = path.length && !(path.length === 1 && T.same(path[0].label, title));
  return html`<header class="ih">
    ${said ? html`<nav class="path">${path.map(p => p.menu ? html`<button class="lk dd kind" aria-haspopup="menu" aria-label=${`Kind: ${p.label}`} onClick=${e => menu(e.currentTarget, p.menu())}>${p.label}</button>` : p.go ? html`<button class="lk" data-tip=${p.tip ?? null} onClick=${p.go}>${p.label}</button>` : html`<span>${p.label}</span>`)}</nav>` : null}
    ${more ? html`<button class="btn icon more" aria-label="More" data-tip="More" aria-haspopup="menu" onClick=${e => menu(e.currentTarget, more(), { placement: 'bottom-end' })}>${icon('more')}</button>` : null}
    ${children ?? html`<h2 class="ih-title">${title}</h2>`}${span}</header>`;
}
// When a record holds, as its head says it (App.spanOf): "From May 22, 2023, when Fund III Blocker was formed", "Until
// Feb 1, 2027"; an object's by the act its entries record ("Formed", "Dissolved"). Each day is a link to the chart then.
function Span({ id }) {
  App.version.value; App.day.value;
  const { from, until } = App.spanOf(id), before = d => later(d, -1);
  if (!from && !until) return null;
  return html`<p class="span">
    ${from ? html`<span>${from.word ?? 'From'} <${DayOf} id=${id} side="from" day=${from.day} shows=${from.day} />${from.when ? `, ${from.when}` : ''}</span>` : null}
    ${until ? html`<span>${until.word ?? 'Until'} <${DayOf} id=${id} side="until" day=${until.day} shows=${until.day <= App.day.value ? before(until.day) : until.day} />${until.when ? `, ${until.when}` : ''}</span>` : null}</p>`;
}
// A day a record holds from or until, wherever it's said, is a real control: the chart then, and Change this day…, the entry that
// says it to type over (at the record it's in), the act that made it, its bar, or the day alone (dendra.md, Change).
const showDay = d => Shell.at(d === Log.today() ? null : { asOf: d });
function dayItems(id, side, shows) {
  const items = [{ label: 'Show the chart then', run: () => showDay(shows) }];
  if (App.readOnly.peek()) return items;
  const c = App.dayChanger(id, side);
  if (c) items.push(c.why ? { label: 'Change this day…', disabled: true, tip: c.why } : { label: 'Change this day…', run: () => { if (c.run) return c.run(); if (c.show) showDay(c.show); if (c.aim) aim.value = c.aim; select([c.at]); Shell.showPanel?.(); } });
  return items;
}
const DayOf = ({ id, side, day, shows, cls = '' }) => html`<button type="button" class=${'lk day' + cls} aria-haspopup="menu" onClick=${e => { e.stopPropagation(); menu(e.currentTarget, dayItems(id, side, shows)); }}>${short(day)}</button>`;
// What can be done with a record from its panel: what its box's or line's right-click has that isn't the chart's own
// arranging, in sections, none empty: where to see more of it (its table, every box of its option, its History); hiding
// or showing it in this view; and changing what it records (a relation's Transfer…, Delete…).
function moreOf(id, o = {}) {
  const r = recs()[id], v = viewShown(), chart = v?.layout === 'chart', drawn = chart && App.scene.value?.byId.has(id), first = r.kind && slots(id).find(s => s.id && 'choice' in recs()[s.id]);
  // (What's begun here is a what-if in Viewing: it can be asked, never made. Only the past can't.)
  const still = !App.canAsk(), stillHere = App.readOnly.value && !App.seeing(), verb = App.deleteVerb([id]), asked = { auto: true };
  const sections = [
    [...(r.kind ? [{ label: `Open in ${T.plural(r.kind)}`, run: () => kindTable(id) }] : []),
      ...(first ? [{ label: `Select every ${recs()[first.id].choice}`, disabled: !chart, run: () => alike(first.id) }] : []),
      { label: 'History', run: () => { select([id]); Time.of([id]); } }],
    chart && (r.kind || r.args) ? [drawn ? { label: 'Hide in this view', disabled: stillHere, run: () => showHere([id], v, false) }
      : hiddenHere(id, v.id) ? { label: 'Show in this view', disabled: stillHere, run: () => showHere([id], v) } : null].filter(Boolean) : [],
    [...(App.transferable(id) ? [{ label: 'Transfer…', disabled: still, run: () => App.transferring(id) }] : []),
      ...(App.interposable(id) ? [{ label: 'Insert an entity between…', disabled: still, run: () => App.interposing(id) }] : []),
      ...(App.endsOf(id).some(e => e.rel) ? [{ label: 'Merge into…', disabled: still, run: () => App.merging(id) }] : []),
      { label: `${verb}…`, danger: true, disabled: still, run: () => remove(id, asked) },
      // What the word for an act hides, offered plainly: a mistake is taken back as never held.
      ...(App.endOf(id) !== false ? [{ label: 'Delete as a mistake…', danger: true, disabled: still, run: () => { remove(id, asked); App.neverHeld(); } }] : [])],
  ];
  // (A relation's own page, where it's named and its sides are, a click from any record of it: what renaming it starts from.)
  if (r.args) sections[0].push({ label: 'The relation', run: () => select([general(N().relationPattern(tree(id)))]) });
  return sections.filter(s => s.length).flatMap((s, i) => i ? ['-', ...s] : s);
}
// The breadcrumb's kind opens its table, at the record's row, where the chart has one, or else says the kind in general;
// its option selects every box on the chart shown that has it, as Select all like this does.
function kindTable(id) {
  const k = recs()[id].kind, v = App.views.peek().find(x => x.layout === 'table' && x.rows?.kind && T.same(x.rows.kind, k));
  if (!v) return select([general({ kind: k })]);
  Shell.show(v.id);
  select([id]);
}
// A record's kind, changed (dendra.md, Time): what its relations still fit, on any day, and why not, by the relation that doesn't.
// A kind that's the app's, or a document's, isn't what a box is made into. → [{ kind, why }]
function kindChoices(id) {
  const S = App.schema.value, n = N(), rows = App.shown.value.rows(App.chart.value).filter(r => 'record' in r), raw = {};
  for (const r of rows) if (!raw[r.record] || (r.since ?? '') >= (raw[r.record].since ?? '')) raw[r.record] = r;
  const doc = k => Object.values(S).some(s => s.out?.field === 'document' && s.args?.length === 1 && T.same(s.args[0].loc.kind ?? '', k));
  const worked = new Set(App.definitions.value.filter(d => d.edges).flatMap(d => d.covers));
  if (doc(raw[id].kind) || T.same(raw[id].kind, 'Tax Year')) return [];
  const kinds = [...new Set(Object.values(S).filter(s => !s.args && s.kind && !T.isView(s)).map(s => s.kind))].filter(k => !doc(k) && !T.same(k, 'Tax Year'));
  // The relations it's a side of, itself, entered, each as a specification with its side at the kind.
  const rels = Object.values(raw).filter(r => r.args?.some(a => a.at === id)).map(r => ({ r, t: T.treeOf(raw, r.record) })).filter(x => x.t && !worked.has(T.paramKey(x.t)));
  const fits = (x, k) => { const p = { ...(x.t.out && { out: 'value' in x.t.out ? { field: x.t.out.field } : x.t.out }), args: x.t.args.map(a => ({ edge: a.edge, loc: a.loc.id === id ? { kind: k } : T.specOf(a.loc) })) }; return n.fitting(S, p).length > 0; };
  return kinds.sort((a, b) => a.localeCompare(b)).map(kind => { const bad = T.same(kind, raw[id].kind) ? null : rels.find(x => !fits(x, kind)); return { kind, why: bad ? `${n.name(T.bare(bad.t))}: ${[...bad.r.args].map(a => n.shortOf(raw, T.objectOf(raw, a.at))).join(' → ')} doesn’t take one` : null }; });
}
function kindMenu(id) {
  // Made a kind whose form it hasn't got, it draws as a box of no form does and Export names it, so the toast says the same, a click from that row.
  const lacks = () => App.scene.peek()?.page?.formless?.find(f => f.record === id)?.what;
  const r = recs()[id], choices = App.readOnly.peek() ? [] : kindChoices(id), choose = k => App.change(tx => tx.rekind(id, k), { dated: false, say: c => `${Time.describe(c)}${lacks() ? `; it has no ${lacks()}` : ''}`,
    go: () => (lacks() ? [`${lacks()}…`, () => { aim.value = `${id}|${lacks()}`; select([id]); }] : null) });
  return [...choices.map(({ kind, why }) => ({ label: kind, checked: T.same(kind, r.kind), disabled: !!why, tip: why, detail: why ? 'Not with its relations' : null, run: () => !T.same(kind, r.kind) && choose(kind) })),
    ...(choices.length ? ['-'] : []), { label: `What ${article(r.kind)} ${lower(r.kind)} is`, run: () => select([general({ kind: r.kind })]) }, { label: `Open in ${T.plural(r.kind)}`, run: () => kindTable(id) }];
}
function alike(id) {
  const r = recs()[id], sc = App.scene.peek(), ids = !sc ? [] : Object.keys(recs()).filter(x => recs()[x].at && T.same(recs()[x].edge, r.edge) && T.same(recs()[x].choice ?? '', r.choice) && sc.byId.get(recs()[x].at)?.type === 'box').map(x => recs()[x].at);
  if (ids.length) select([...new Set(ids)]); else select([id]);
}
// Add: what a record (at `at`), or a panel's own `items`, can have that it hasn't; `also`, another quiet action beside it.
const AddRow = ({ at, items = anchor => addItems(at, anchor), also = null }) => App.readOnly.value ? null
  : html`<div class="row addrow"><div class="k wide"><button class="btn ghost add-entry" onClick=${e => menu(e.currentTarget, items(e.currentTarget), { search: true, more: at ? q => addNamed(at, q) : null })}>${icon('plus')}Add</button>${also}</div></div>`;

function RecordView({ id }) {
  const r = recs()[id];
  aim.value;   // (aimed at while it's shown too, as a toast's way to a row of it does)
  useLayoutEffect(() => {
    const a = aim.peek();
    if (!a) return;
    aim.value = null;
    aimed = Shell.selection.peek().join();
    // A due date is aimed at to be filed, so its Filed… takes the focus; anything else, its value.
    const el = document.querySelector(`.insp [data-key="${CSS.escape(a)}"]`);
    el?.scrollIntoView({ block: 'center' });
    // (A list, its first row, where the arrows go on from.)
    const first = el?.matches('section') && el.querySelector(':scope > .row.rel');
    if (first) { first.tabIndex = -1; return first.focus({ preventScroll: true }); }
    (el?.querySelector('.filed') ?? el?.querySelector('input, textarea, button.sel, button.tag, .errv'))?.focus();
  });
  // Not there on the day shown, it says so, and where it starts later, when, by its start entry's act ("Formed Jan 15,
  // 2027"), or From that day, with a way to the chart then; gone, it's nothing.
  if (!r) return html`<${LaterView} id=${id} />`;
  const path = T.pathOf(recs(), id), first = slots(id).find(s => s.id && 'choice' in recs()[s.id]), name = r.kind ? null : nameOf(id);
  // An object's title is its Name, typed over (cleared, it stays); a relation's or an entry's is what it is,
  // with its tag's box before it, as the formula bar has it.
  const nameId = entryNamed(id, 'Name'), held = nameId ? App.held(nameId) : undefined;
  const span = (r.kind || r.args) ? html`<${Span} id=${id} />` : null;
  const head = r.kind
    ? html`<${Head} more=${() => moreOf(id)} span=${span} path=${[{ label: r.kind, menu: () => kindMenu(id) }, ...(first ? [{ label: recs()[first.id].choice, go: () => alike(first.id), tip: `Select every ${recs()[first.id].choice}` }] : [])]}>
        <${Field} r=${recs()[nameId]} id=${nameId} datatype="text" ph="Name" title held=${held ? held.value : null} put=${(out, o) => (out || out === false) && put(nameId, { at: id, edge: 'Name' }, out, o)}
          preview=${out => out && putChange(nameId, { at: id, edge: 'Name' }, out)} /></${Head}>`
    : html`<${Head} title=${name} span=${span} more=${r.args ? () => moreOf(id) : null} path=${r.args ? [] : path.slice(0, -1).map(x => ({ label: segment(x), go: () => select([x]) }))}>
        ${boxed(id) ? html`<h2 class="ih-title ih-tag" data-key=${id}><${Output} id=${id} slot=${r} label=${name} /><span class="nm lbl asks" onClick=${e => (fx(id) ? emit('why-open', id) : typedBy(e.currentTarget, id))}>${name}</span></h2>` : null}</${Head}>`;
  const sides = r.args ? N().sides(recs(), id) : [];
  // A deletion or a transfer of it pending is asked in the bar, its one home: here it's struck, its end entry in blue. A relation
  // that can be transferred says so quietly beside Add, as its line's menus do.
  const p = App.pending.value, here = p?.chart === App.chart.value && (p.transfer?.rid === id || p.amending?.includes(id) || (p.verb === 'Delete' && p.needs?.length === 1 && p.needs[0] === id)) ? p : null;
  const moving = !here && !App.readOnly.value && r.args && App.transferable(id)
    ? html`<button class="btn ghost add-entry" onClick=${() => App.transferring(id)}>${icon('ArrowRightLeft')}Transfer…</button>` : null;
  return html`<div class=${'insp' + (goes(id) ? ' going' : '')}><${CameBack} id=${id} />${head}
    <${Strip} />
    <div class="rows">
      ${sides.map(a => { const way = trail(a.at);
        return html`<div class="row" key=${a.edge}><div class="k">${a.edge}</div><div class="v"><${Go} to=${objectOf(a.at)} tip=${`Open ${nameOf(objectOf(a.at))}`}>${bound(nameOf(objectOf(a.at)))}</${Go}>
        ${way ? html`<span class="muted"> › ${way}</span>` : null}</div></div>`; })}
      ${r.kind || boxed(id) ? null : html`<div class="row" data-key=${id}><div class="k"><span class="lbl">${name}</span></div>
        <div class="v ctl"><${Output} id=${id} slot=${r} label=${name} /></div></div>`}
      ${'field' in r ? null : html`<${Entries} at=${id} depth=${0} /><${AddRow} at=${id} also=${moving} />`}
    </div>
    <${MergedIn} id=${id} />
    <${Relatives} id=${id} />
    <${HiddenHere} id=${id} />
    ${(r.kind || r.args) && App.scene.value?.byId.has(id) ? html`<${Look} id=${id} />` : null}
  </div>`;
}
// What's merged into a record, and what its holders held, which the chart can't work out, so it goes on asking what they
// received (dendra.md, Time): each by what it held, and what it holds here, or a way to add that from the merger's day.
function MergedIn({ id }) {
  if (!recs()[id]?.kind) return null;
  const all = App.mergedInto(id), mine = T.index(recs()), stakeIn = who => (mine.relations.get(who) ?? []).find(x => recs()[x].args?.length === 2 && recs()[x].args.some(a => objectOf(a.at) === id) && !fx(x) && App.transferable(x)?.amount);
  if (!all.length) return null;
  const add = (m, s) => {
    const was = m.recs[s.rid], rec = { args: was.args.map(a => (T.objectOf(m.recs, a.at) === m.merged ? { edge: a.edge, at: id } : a)), tag: true };
    App.relating(rec, { what: `${nameOf(s.who)} in ${nameOf(id)}`, source: 'merged ' + id, needs: [s.who, id], day: m.on, make: tx => tx.add('record', enterAt(tx, rec)), say: c => Time.describe(c) });
  };
  return all.filter(m => m.stakes.length).map((m, i) => html`<${Section} key=${m.merged} title=${`${N().shortOf(m.recs, m.merged)}’s holders`} id=${i ? `merged${i}` : 'merged'} n=${m.stakes.length}>
    <div class="row src"><div class="k wide">Merged in ${short(m.on)}. What did they receive?</div></div>
    ${m.stakes.map(s => { const now = recs()[s.who] && stakeIn(s.who), amt = now && recs()[App.transferable(now).amount];
      return html`<div class="row rel" key=${s.rid}><div class="k">${recs()[s.who] ? html`<${Go} to=${s.who}>${bound(shortOf(s.who))}</${Go}>` : bound(N().shortOf(m.recs, s.who))}</div>
        <div class="v">${now ? html`<${Go} to=${now} tip=${`Open this ${lower(nameOf(now))}`}>${T.format(amt.field, amt.value)} here</${Go}>` : App.readOnly.value || !recs()[s.who] ? null : html`<button class="btn ghost add-entry" onClick=${() => add(m, s)}>${icon('plus')}Add</button>`}</div>
        <div class="facts">held ${s.figure}</div></div>`; })}</${Section}>`);
}
// A record not in the chart on the day shown says so as a state, with the way to the chart when it was. One that starts
// after it says when, by the act its start entry records (Formed) or else From. One that ended before it says when, by
// its end entry's act (Dissolved) or else Ended. Any other, that it isn't in the chart then.
function LaterView({ id }) {
  App.version.value;
  const c = App.chart.value, wb = App.shown.value, d = App.heldFrom(id, App.day.value), gone = !d ? App.heldUntil(id, App.day.value) : null;
  if (!wb.item(c, id).length) return null;
  const on = d ?? gone?.last, then = on && wb.asOf(c, on), x = then?.[id];
  if (!x) return html`<div class="empty"><span>Not in the chart as of ${short(App.day.value)}</span>
    ${Shell.time.value ? html`<button class="btn" onClick=${() => Shell.at(null)}>Today</button>` : null}</div>`;
  const entry = test => (T.index(then).entries.get(id) ?? []).find(e => then[e].field === 'date' && test(T.treeOf(then, e)) && then[e].value === (d ?? gone.day));
  const was = d ? entry(t => N().isStart(t)) : entry(t => N().isEnd(t));
  const words = (was && App.actOf(then[was].edge)?.[1]) || (d ? 'From' : 'Ended'), name = x.kind ? N().nameOf(then, id) : `${N().nameOf(then, id)}: ${N().segmentOf(then, id)}`;
  // (And the way to change that day, as any is.)
  const change = !App.readOnly.value && dayItems(id, d ? 'from' : 'until', on).find(it => it.label.startsWith('Change'));
  return html`<div class="insp"><${Head} path=${x.kind ? [{ label: x.kind }] : []} title=${bound(name)} />
    <div class="later"><span>${words} ${short(d ?? gone.day)}</span><button class="btn" onClick=${() => Shell.at(on === Log.today() ? null : { asOf: on })}>Show the chart then</button>${change ? html`<button class="btn" disabled=${!!change.disabled} data-tip=${change.tip ?? null} onClick=${change.run}>Change this day…</button>` : null}</div></div>`;
}
// A box or line the chart shown hides by its own note (Delete, Hide in this view): said, with the way to show it
// there again, its own Shown in the view, as the narrowest decides. Any other way out of a chart is the view's.
const hiddenNote = (id, view) => { const n = N().resolve('Shown', tree(id), view); return n?.value === false && n.note.view === view && n.note.pattern.id === id ? n.note : null; };
// Whether a record is hidden there, one by one, by its note or for the session; and shown or hidden there: as a change, or, in
// Viewing, or where a look has it (a filter, Show only), for this window, in no log (App.see).
const hiddenHere = (id, view) => { const s = App.seenIn(view)?.get(id); return s === undefined ? !!hiddenNote(id, view) : !s; };
const showHere = (ids, v, on = true) => {
  const look = App.seenIn(v.id), mine = App.seeing() ? ids : ids.filter(x => look?.has(x)), rest = ids.filter(x => !mine.includes(x));
  if (mine.length) App.see(v.id, mine, on);
  return rest.length ? App.change(tx => rest.forEach(x => tx.note('Shown', tree(x), on, { view: v.id })), { say: ch => Time.describe(ch) }) : undefined;
};
// What a chart hides one by one, each a click from being shown again there, so nothing hidden is lost from sight.
// What a chart leaves out of a box it draws, though it draws the box's others of the same list: its relatives there, each
// by the relation entered and not drawn (two of Fund III's four owners), with what Show shows of it, its line and, where
// it isn't drawn, the relative's box. It's said, never changed by itself. → Map(box → [{ list, items: [{ rid, obj, show }] }])
const relOne = w => w.replace(/ies$/, 'y').replace(/(?<!s)s$/, '');
function leftOut(sc, ids) {
  const out = new Map(), own = x => !!hiddenNote(x, sc.view);
  for (const id of ids) {
    if (!recs()[id]?.kind || !sc.byId.has(id)) continue;
    // (One hidden by its own note, or its relative's, the Hidden list has already.)
    const parts = relatives(id).lists.map(([list, items]) => ({ list, items: items.filter(it => !fx(it.rid) && !sc.byId.has(it.rid) && !own(it.rid) && !own(it.obj)), drawn: items.some(it => sc.byId.has(it.rid)) }))
      .filter(x => x.drawn && x.items.length).map(({ list, items }) => ({ list, items: items.map(it => ({ ...it, show: [it.rid, ...(sc.byId.has(it.obj) ? [] : [it.obj])] })) }));
    if (parts.length) out.set(id, parts);
  }
  return out;
}
const leftHere = id => { const v = viewShown(), sc = App.scene.value; return v?.layout === 'chart' && sc ? leftOut(sc, [id]).get(id) ?? [] : []; };
function HiddenList({ v }) {
  // (What a filter or Show only keeps off, the band says, with its way back: only what's hidden one by one is listed.)
  const hid = [...new Set([...N().notes('Shown').filter(n => n.view === v.id && n.value === false && n.pattern.id !== undefined).map(n => n.pattern.id), ...Object.keys(App.lookOf(v.id)?.ticks ?? {})])]
    .filter(x => recs()[x] && (recs()[x].kind || recs()[x].args) && hiddenHere(x, v.id));
  // And what it leaves out of the boxes it draws, by list: "Not shown here: 2 owners of Fund III".
  const sc = App.scene.value, left = sc ? [...leftOut(sc, [...sc.byId.keys()])].flatMap(([id, parts]) => parts.map(p => ({ id, ...p }))) : [];
  // Each ticked on or off where it stands: one ticked on stays on the list, ticked, till the panel's left, so no row moves under the pointer.
  const seen = useRef(new Set());
  for (const x of hid) seen.current.add(x);
  const rows = [...seen.current].filter(x => recs()[x]);
  if (!rows.length && !left.length) return null;
  const said = x => recs()[x].args ? `${nameOf(x)} · ${segment(x)}` : nameOf(x), still = App.readOnly.value && !App.seeing();
  const all = [...hid, ...left.flatMap(g => g.items.flatMap(it => it.show))];
  const drawn = sc ? sc.marks.filter(m => m.type === 'box' && !m.revealed) : [];
  const hide = ids => showHere(ids, v, false);
  return html`<${Section} title="Hidden" n=${hid.length + left.reduce((n, g) => n + g.items.length, 0)} act=${still ? null : html`<span class="hidden-acts">${hid.length + left.length > 1 ? html`<button class="btn" onClick=${() => showHere(all, v)}>Show these</button>` : null}${drawn.length ? html`<button class="btn" onClick=${() => hide(drawn.map(m => m.record))}>Hide all</button>` : null}</span>`}>
    ${rows.map(x => html`<label class="rr hiddenrow" key=${x}><input type="checkbox" checked=${!hid.includes(x)} disabled=${still} aria-label=${`Show ${said(x)}`} onChange=${e => e.target.checked ? showHere([x], v) : hide([x])} /><span class="nm"><${Go} to=${x}>${said(x)}</${Go}></span><span class="val" /></label>`)}
    ${left.map(g => html`<div class="rr" key=${g.id + g.list}><span /><span class="nm">Not shown here: <${Go} to=${g.id} title=${g.items.map(it => nameOf(it.obj)).join('\n')}>${g.items.length} ${lower(g.items.length === 1 ? relOne(g.list) : g.list)} of ${bound(shortOf(g.id))}</${Go}></span>
      <span class="val">${still ? null : html`<button class="btn" onClick=${() => showHere(g.items.flatMap(it => it.show), v)}>Show</button>`}</span></div>`)}</${Section}>`;
}
function HiddenHere({ id }) {
  const v = viewShown(), r = recs()[id];
  if (!v || v.layout !== 'chart' || !(r.kind || r.args) || App.scene.value?.byId.has(id) || !hiddenHere(id, v.id)) return null;
  return html`<${Section} title=${`Hidden in ${v.name}`} act=${App.readOnly.value && !App.seeing() ? null : html`<button class="btn" onClick=${() => showHere([id], v)}>Show</button>`} />`;
}

// A style's outputs, each as the legend draws it (Scene's swatch), with its caption; each 2 px inside its chip,
// a box's outline too, however heavy, so none runs along the chip's edge.
function Swatch({ sw, off }) {
  const stroke = sw.Outline === 'none' ? 'none' : sw.Outline, dash = Scene.dash(sw.Dash, sw.Weight), w = stroke === 'none' ? 0 : Math.min(sw.Weight * Scene.PT, 2.5);
  return html`<svg class=${'sw' + (off ? ' off' : '')} viewBox="0 0 28 16" aria-hidden="true">${sw.kind === 'line'
    ? html`<path d="M2 8H26" fill="none" stroke=${stroke} stroke-width=${Math.min(sw.Weight * Scene.PT, 3)} stroke-dasharray=${dash} />
      ${['end', 'both'].includes(sw.Arrow) && stroke !== 'none' ? html`<path d="M27 8l-6-3.2v6.4z" fill=${stroke} />` : null}${['start', 'both'].includes(sw.Arrow) && stroke !== 'none' ? html`<path d="M1 8l6-3.2v6.4z" fill=${stroke} />` : null}`
    // A frame as the chart draws one: a bracket over its boxes, or a box round them.
    : sw.kind === 'frame' ? html`<path d=${sw.Frame === 'bracket' ? 'M2 13V7H26V13' : 'M2.5 2.5H25.5V13.5H2.5Z'} fill="none" stroke="#595959" stroke-width="1"
        stroke-dasharray=${['bracket', 'solid'].includes(sw.Frame) ? null : Scene.dash(sw.Frame === 'dotted' ? 'dotted' : 'dashed', 0.75)} />`
    : sw.kind === 'text' ? html`<text x="14" y="12" text-anchor="middle" font-family=${Scene.fontFamily(sw.Font)} font-size="11" fill=${sw.Color}
        font-weight=${sw.Bold ? 700 : 400} font-style=${sw.Italic ? 'italic' : 'normal'}>Aa</text>`
    : html`<path d=${Scene.path(sw.Shape ?? 'rect', 24 - w, 12 - w)} transform=${`translate(${2 + w / 2} ${2 + w / 2})`} fill=${sw.Fill === 'none' ? 'none' : sw.Fill} fill-opacity=${sw.Transparency ? 1 - sw.Transparency / 100 : null} stroke=${stroke}
        stroke-width=${w} stroke-dasharray=${dash} />`}</svg>`;
}
// A view's styles (those reaching `only`, if given), each with the outputs it formats: an output that only
// shows or hides is a filter, which the legend doesn't key and nor does this.
const stylesOf = (v, only) => N().styles(v).filter(s => !only || T.narrower(only, s.pattern) || T.narrower(s.pattern, only))
  .map(s => ({ ...s, outputs: s.outputs.filter(o => Object.keys(o.formats).some(k => k !== 'Shown')) })).filter(s => s.outputs.length);
function Styles({ v, only }) {
  const n = N(), all = n.styles(v), listed = new Set(stylesOf(v, only).map(s => s.key)), styleAt = new Map(all.map(s => [s.key, s]));
  // What a row reaches on this page: its marks, those keeping their own and what another style decides of them.
  const fb = typeof FormatBar !== 'undefined' && FormatBar.reachOf ? FormatBar : null, sc = App.scene.value, reach = g => fb && sc?.view === v ? fb.reachOf(g) : { marks: 1, own: 0, masked: [] };
  const [offOpen, setOffOpen] = useState(false);
  const keyShape = sc?.view === v ? App.shown.value.rows(App.chart.value).find(r => 'shape' in r && r.view === v && r.geometry === 'legend') : null, keyWord = g => keyShape?.captions?.[g.key];
  const groups = Scene.groupsOf(n, v).filter(g => listed.has(g.style)), reached = new Map(groups.map(g => [g, reach(g)]));
  // The styles listed, by their groups (Scene.groupsOf) in their order, each group a row as the Key has it: those
  // under their style's name, then apart, after them all, the styles that are their one row (Names). A row that reaches
  // nothing on this page is folded apart at the foot, so a chart with no funds isn't told about funds.
  // (Which are folded is settled as the panel opens on the view, so no row moves under the pointer as a box is shown or hidden.)
  const folded = useRef(null);
  if (folded.current?.v !== v) folded.current = { v, keys: new Set(groups.filter(g => !reached.get(g).marks).map(g => g.key)), seen: new Set(groups.map(g => g.key)) };
  for (const g of groups) if (!folded.current.seen.has(g.key)) { folded.current.seen.add(g.key); if (!reached.get(g).marks) folded.current.keys.add(g.key); }
  const off = only ? [] : groups.filter(g => folded.current.keys.has(g.key)), here = groups.filter(g => !off.includes(g));
  const blocks = [...Map.groupBy(here, g => g.style)].map(([k, rows]) => ({ s: styleAt.get(k), rows, lone: !rows[0].name }));
  const parts = [blocks.filter(b => !b.lone), blocks.filter(b => b.lone)];
  // Dragged among those of its part; the rest keep their places in the view's order.
  const order = part => (from, i) => { const q = moved(part.map(b => b.s), from, i), keys = new Set(q.map(s => s.key));
    App.change(tx => all.map(s => keys.has(s.key) ? q.shift() : s).forEach((s, k) => s.order !== k + 1 && tx.note('Order', s.pattern, k + 1, { view: v }))); };
  // A caption typed as an output's own name is no caption; and what the Key called it goes, as it's named afresh.
  const cap = (g, text) => App.change(tx => { g.outputs.forEach(p => tx.note('Caption', p, text && text !== Scene.outputName(n, p) ? text : undefined, { view: v })); if (keyWord(g)) { const { [g.key]: _, ...captions } = keyShape.captions; tx.update(keyShape.shape, { captions }); } });
  const grip = part => only || App.readOnly.value ? null : html`<button class="grip" tabindex="-1" aria-hidden="true" onPointerDown=${e => drag(e, order(part))}>${GRIP}</button>`;
  // Its own place among those of its part, a step up or down: what a row's menu offers beside its grip.
  const steps = (part, s) => { const i = part.findIndex(b => b.s.key === s.key), go = to => order(part)(i, to);
    return only ? [] : [{ label: 'Move up', disabled: i < 1, run: () => go(i - 1) }, { label: 'Move down', disabled: i >= part.length - 1, run: () => go(i + 1) }]; };
  // A row: its swatch, its caption (the Key's word, typed over, which captions each output in it), and, where a
  // caption calls it, what it stands for: beneath, where several, or on hover. A style's one row, `alone`, is
  // dragged among that part. Its swatch clicked is its caption clicked.
  const output = (g, alone, part, s) => {
    const names = g.outputs.map(p => Scene.outputName(n, p)), said = g.outputs.some((p, i) => Scene.captionOf(n, p, v) !== names[i]), on = reached.get(g) ?? { own: 0, masked: [] };
    // What doesn't read as this row: those of its marks with a look of their own, and what another style decides of them all.
    const notes = [...on.own ? [`${on.own} ${on.own === 1 ? 'keeps its' : 'keep their'} own`] : [], ...on.masked.map(([l, by]) => `${l} decided by ${by}`)];
    return html`<div class=${'row out' + (alone ? ' lone' : '')} key=${g.key} onClick=${e => { if (!e.target.closest('.grip, .cellbox, input, .lk')) aimAt(g); }}>${alone ? grip(alone) : null}<div class="k" onContextMenu=${e => styleMenu(e, g, v, steps(part, s))}><${Swatch} sw=${g.swatch} off=${g.off} /></div>
      <div class="v" title=${said && names.length === 1 ? names[0] : null}><span class="capline"><${Caption} g=${keyWord(g) ? { ...g, caption: keyWord(g) } : g} label=${names.join(', ')} put=${out => cap(g, out?.value ?? '')} moves=${steps(part, s)} v=${v} />
        ${notes.length ? html`<span class="onote" title=${notes.join(', ')}>${on.own && fb ? html`<button type="button" class="lk" onClick=${() => fb.selectDiffers()}>${notes[0]}</button>` : notes[0]}${notes.length > 1 ? `, ${notes.slice(1).join(', ')}` : ''}</span>` : null}</span>
        ${said && names.length > 1 ? html`<span class="oname">${names.join(', ')}</span>` : null}</div></div>`;
  };
  // A style that is its one group is that row alone: Names, not Name over Names.
  return html`${parts.flatMap(part => part.map(({ s, rows, lone }) => html`<div class=${'ent style' + (lone ? ' lone' : '')} data-drag=${only ? null : lone ? 'lone' : 'style'} key=${s.key}>
    ${lone ? output(rows[0], part, part, s) : html`<div class="row" style="--depth:0">${grip(part)}<div class="k sname">${Scene.isChange(s.pattern) ? rows[0].name : html`<${Go} to=${general(s.pattern)}>${rows[0].name}</${Go}>`}</div></div>${rows.map(g => output(g, null, part, s))}`}
  </div>`))}
  ${off.length ? html`<div class="row styles-off"><button type="button" class="lk" aria-expanded=${offOpen} onClick=${() => setOffOpen(x => !x)}>Not on this page (${off.length})</button></div>
    ${offOpen ? off.map(g => { const s = styleAt.get(g.style); return html`<div class="ent style lone" key=${g.key}>${output(g, null, [], s)}</div>`; }) : null}` : null}`;
}

// A Styles row aimed at: the ribbon's scope, what it reaches lit on the chart (the format bar's aim), till it's clicked again.
const aimAt = g => { if (typeof FormatBar !== 'undefined') FormatBar.aim?.(FormatBar.aimedAt?.(g) ? null : g); };
// What a Styles row's right-click offers, as they apply: Rename; a step up or down; Copy look and Paste look; Delete, which
// takes away what it gives the view.
function styleMenu(e, g, v, moves, rename) {
  e.preventDefault();
  const fb = typeof FormatBar !== 'undefined' && FormatBar.aim ? FormatBar : null, ro = App.readOnly.peek(), keys = new Set(g.outputs.map(p => T.key(p)));
  const look = () => { const on = !fb.aimedAt(g); if (on) fb.aim(g); };
  const given = App.shown.peek().rows(App.chart.peek()).filter(x => 'note' in x && x.view === v && keys.has(T.key(x.pattern)) && Notes.looksLike(x));
  menu({ x: e.clientX, y: e.clientY }, [
    ...(rename ? [{ label: 'Rename', keys: 'F2', disabled: ro, run: rename }] : []), ...moves.map(m => ({ ...m, disabled: ro || m.disabled })),
    // What it's the row of, as what's lit is what's meant.
    ...(fb && App.views.peek().find(x => x.id === v)?.layout === 'chart' ? [...(rename || moves.length ? ['-'] : []), { label: 'Show only these', disabled: !App.canAsk(), run: () => { look(); Canvas.active.peek()?.showOnly(); } }, { label: 'Select all like this', run: () => { look(); Canvas.active.peek()?.selectLike(); } }] : []),
    ...(fb ? [...(rename || moves.length ? ['-'] : []), { label: 'Copy look', run: () => { look(); fb.copyLook(); Shell.toast(`Copied the look of ${g.caption}`); } }, { label: 'Paste look', disabled: ro || !fb.canPasteLook(), run: () => { look(); fb.pasteLook(); } }] : []),
    ...(given.length ? ['-', { label: 'Delete', danger: true, disabled: ro, run: () => { if (fb?.aimedAt(g)) fb.aim(null); App.change(tx => { given.forEach(x => tx.remove(x.note)); tx.says(`Deleted the style ${g.caption} in ${N().nameOf(App.state.peek(), v)}`); }, { dated: false }); } }] : []),
  ]);
}
// A Styles row's caption. Clicked, it aims the ribbon at the row; double-clicked, F2 or Enter, or Rename from its menu,
// it's typed over, as a name is.
function Caption({ g, label, put, moves, v }) {
  const [typing, setTyping] = useState(false);
  if (typing) return html`<span class="cellbox" onFocusOut=${e => { if (!e.currentTarget.contains(e.relatedTarget)) setTyping(false); }}>
    <${Field} r=${{ field: 'text', value: g.caption }} datatype="text" label=${label} cls=${g.off ? ' off' : ''} auto put=${out => { setTyping(false); put(out); }} /></span>`;
  const on = typeof FormatBar !== 'undefined' && !!FormatBar.aimedAt?.(g);
  const rename = () => App.readOnly.peek() ? Shell.toast(App.whyNot()) : setTyping(true);
  return html`<button type="button" class=${'cap' + (on ? ' on' : '') + (g.off ? ' off' : '')} aria-label=${label} aria-pressed=${on} onDblClick=${rename}
    onKeyDown=${e => { if (e.key === 'F2' || e.key === 'Enter') { e.preventDefault(); rename(); } }}
    onContextMenu=${e => styleMenu(e, g, v, moves, rename)}>${g.caption}</button>`;
}

// The view: its layout and its rows (its own notes), and its styles in their order. Its name is its tab's,
// and the formula bar's.
function ViewPanel() {
  const v = viewShown(), blankAt = useRef({});
  if (!v) return null;
  // (A chart found with nothing drawn has its Hidden list first, where it's ticked from; and it stays there, so nothing moves under the pointer.)
  if (blankAt.current.v !== v.id) blankAt.current = { v: v.id, first: v.layout === 'chart' && !!App.scene.value && !App.scene.value.marks.some(m => m.type === 'box') };
  const hiddenFirst = blankAt.current.first;
  const t = { id: v.id, kind: 'View' }, L = App.layouts.value, all = [...L.kinds, ...L.relations, ...L.datatypes];
  const rowsName = all.find(l => JSON.stringify(l.rows) === JSON.stringify(v.rows))?.name;
  const layout = value => App.change(tx => tx.note('Layout', t, value), { dated: false });
  return html`<div class="insp">
    <div class="rows">
      <div class="row"><div class="k">Layout</div><div class="v ctl"><${Choice} fixed label="Layout" r=${{ choice: v.layout === 'table' ? 'Table' : 'Chart' }} options=${['Chart', 'Table']}
        put=${out => layout(out.choice === 'Table' ? { rows: v.rows } : undefined)} /></div></div>
      ${v.layout === 'table' ? html`<div class="row in"><div class="k">Rows</div><div class="v ctl"><${Choice} fixed label="Rows" r=${rowsName ? { choice: rowsName } : null} options=${all.map(l => l.name)}
        put=${out => layout({ rows: all.find(l => l.name === out.choice).rows })} /></div></div>` : null}
      ${v.layout === 'chart' ? html`<${ComparedRows} v=${v} /><${FilterRow} v=${v} />` : null}
      ${v.plan ? html`<div class="row"><div class="k">Look and places</div><div class="v ctl"><${Choice} fixed label="Look and places" r=${{ choice: 'Shared by the plan' }} options=${['Shared by the plan', 'This page’s own']}
        put=${out => { if (out.choice !== 'Shared by the plan') App.change(tx => tx.note('Plan', t, undefined), { dated: false, say: `Gave ${v.name} its own look and places` }); }} /></div></div>` : null}
    </div>
    ${hiddenFirst ? html`<${HiddenList} key=${v.id} v=${v} />` : null}
    ${v.layout === 'chart' && stylesOf(v.id).length ? html`<${Section} title="Styles"><div class="styles"><${Styles} v=${v.id} /></div></${Section}>` : null}
    ${v.layout === 'table' && typeof Table !== 'undefined' ? html`<${Section} title="Columns"><${Table.Columns} view=${v.id} /></${Section}>` : null}
    ${v.layout === 'chart' && !hiddenFirst ? html`<${HiddenList} key=${v.id} v=${v} />` : null}
  </div>`;
}

// ---- A free shape: its text, its look and its place; the Key: its title, its columns and its rows ----
const SHAPES = { text: 'Text box', legend: 'Key', rect: 'Rectangle', rounded: 'Rounded rectangle' };
function ShapeView({ id, part }) {
  const row = App.shown.value.item(App.chart.value, id).at(-1), m = App.scene.value?.byId.get(id), n = N(), v = App.scene.value?.view, still = App.readOnly.value;
  if (!row) return null;
  const set =(changes, say) => App.change(tx => tx.update(id, changes), { dated: false, say });
  const g = row.geometry ?? 'rect', name = SHAPES[g] ?? g[0].toUpperCase() + g.slice(1), key = g === 'legend', worded = !['line', 'picture', 'group', 'legend'].includes(g);
  const look = Object.entries(row.format ?? {}).map(([label, value]) => ({ label, value, from: null }));
  const reset = still || !look.length ? null : html`<button class="btn ghost reset" onClick=${() => set({ format: {} }, 'Reset the look')}>Reset</button>`;
  // The Key's rows in its order, each with a box to show or hide it, which leaves it where it is, so nothing moves under
  // the pointer; hidden ones it has no row for now (nothing drawn is keyed by them) after them.
  const all = m?.all ?? [], hidden = (row.hide ?? []).filter(k => !all.some(r => r.key === k)).map(k => n.styles(v).flatMap(s => s.outputs).find(o => T.key(o.pattern) === k)).filter(Boolean)
    .map(o => ({ key: T.key(o.pattern), outputs: [o.pattern], caption: Scene.captionOf(n, o.pattern, v), swatch: Scene.swatchOf(o.pattern, o.formats) }));
  const rows = key ? [...all, ...hidden] : [];
  const show = (k, on) => set({ hide: on ? (row.hide ?? []).filter(x => x !== k) : [...(row.hide ?? []), k] });
  const keyOrder = (from, i) => set({ order: moved(rows.map(r => r.key), from, i) }, 'Reordered the Key');
  return html`<div class="insp">
    <${Head} path=${key ? [{ label: name }] : []} title=${key ? row.title ?? 'Key' : name}>${key ? html`<${Field} r=${{ field: 'text', value: row.title ?? 'Key' }} datatype="text" ph="Title" label="Title" title
      put=${out => set({ title: out?.value ?? '' })} />` : null}</${Head}>
    <div class="rows">
      ${worded ? html`<div class="row"><div class="k">Text</div><div class="v ctl"><${Prose} text=${row.text ?? ''} label="Text" put=${text => set({ text })} /></div></div>` : null}
      ${key ? html`<div class="row"><div class="k">Columns</div><div class="v ctl"><${Choice} fixed label="Columns" r=${{ choice: String(row.columns ?? 1) }} options=${['1', '2', '3']}
        put=${out => set({ columns: +out.choice })} /></div></div>
      <div class="row"><div class="k">Corner</div><div class="v ctl"><${Choice} fixed label="Corner" r=${{ choice: row.x != null ? 'Where it was put' : row.corner ? upper(`${row.corner.v} ${row.corner.h}`) : 'Where the page places it' }} options=${[...(row.x != null ? ['Where it was put'] : []), 'Where the page places it', 'Top left', 'Top right', 'Bottom left', 'Bottom right']}
        put=${out => { if (out.choice === 'Where it was put') return; const [v, h] = out.choice.toLowerCase().split(' '); App.change(tx => Canvas.keyCorner(tx, id, out.choice === 'Where the page places it' ? null : [v, h]), { dated: false, say: out.choice === 'Where the page places it' ? 'Let the page place the Key' : `Put the Key in the ${out.choice.toLowerCase()} corner` }); }} /></div></div>` : null}
    </div>
    ${rows.length ? html`<${Section} title="Rows" n=${m?.rows.length ?? 0}>${rows.map(r => html`<${KeyRow} key=${r.key} r=${r} id=${id} row=${row} m=${m} on=${r.key === part} shown=${!(row.hide ?? []).includes(r.key)} show=${show} order=${keyOrder} still=${still} />`)}</${Section}>` : null}
    ${m && g !== 'line' ? html`<${Place} at=${m} keys=${key ? 'xyw' : 'xywh'} put=${(k, x) => Shell.parts.peek().canvas?.active?.()?.put(m.id, { [k]: x })} lock=${g === 'text' || key || g === 'group' ? null : { on: row.lock, set: on => set({ lock: on || undefined }) }} turn=${key || g === 'group' || row.role ? null : { at: row.rotate, set: a => Shell.parts.peek().canvas?.active?.()?.turn(m.id, a) }} />` : null}
    ${g === 'picture' && m ? html`<${Crop} m=${m} row=${row} set=${set} />` : null}
    <${LookSection} look=${look} reset=${reset} />
  </div>`;
}
// The footer: its words and whether pages are numbered, the chart's own, on every chart view; its look, which the ribbon
// gives it; the page places it.
function FootView() {
  const f = N().resolve('Footer', { kind: 'View' })?.value ?? {}, still = App.readOnly.value, write = next => App.change(tx => tx.note('Footer', { kind: 'View' }, next.text || next.number ? next : undefined), { dated: false, say: next.text || next.number ? 'Set the footer' : 'Took the footer off' });
  const look = Object.entries(f.format ?? {}).map(([label, value]) => ({ label, value, from: null })), { format: _, ...plain } = f;
  return html`<div class="insp">
    <${Head} title="Footer" />
    <div class="rows">
      <div class="row"><div class="k">Text</div><div class="v ctl"><${Prose} text=${f.text ?? ''} label="Footer" put=${text => write({ ...f, text })} /></div></div>
      <label class="row lockrow"><span class="k wide"><input type="checkbox" checked=${!!f.number} disabled=${still} onChange=${e => write({ ...f, number: e.target.checked })} />Page numbers</span></label>
    </div>
    <${LookSection} look=${look} reset=${still || !look.length ? null : html`<button class="btn ghost reset" onClick=${() => write(plain)}>Reset</button>`} />
  </div>`;
}
// A row of the Key's panel: its grip, dragged among the rest; its box, which shows or hides it where it stands; and its
// caption, clicked to select the row, double-clicked to type over it. Its right-click offers Rename, Hide and Reset.
function KeyRow({ r, id, row, m, on, shown, show, order, still }) {
  const [typing, setTyping] = useState(false), rename = () => still ? Shell.toast(App.whyNot()) : setTyping(true);
  const owned = !!row.captions?.[r.key] || !!row.order?.includes(r.key) || !shown || r.outputs?.some(p => { const c = N().resolve('Caption', p, App.scene.peek()?.view); return c?.note && T.key(c.note.pattern) === T.key(p) && c.note.view; });
  const reset = () => App.change(tx => { const v = App.scene.peek().view, { [r.key]: _, ...captions } = row.captions ?? {};
    tx.update(id, { captions, hide: (row.hide ?? []).filter(k => k !== r.key), order: (row.order ?? []).filter(k => k !== r.key) });
    if (r.outputs?.length === 1) tx.note('Caption', r.outputs[0], undefined, { view: v }); }, { dated: false, say: `Reset the Key’s row ${r.caption}` });
  const put = out => { setTyping(false); App.change(tx => Canvas.keyCaption(tx, { ...m, id }, r, out?.value ?? ''), { dated: false }); };
  const menuOf = e => { e.preventDefault(); menu({ x: e.clientX, y: e.clientY }, [{ label: 'Rename', keys: 'F2', disabled: still, run: rename }, { label: shown ? 'Hide' : 'Show', disabled: still, run: () => show(r.key, !shown) }, { label: 'Reset', disabled: still || !owned, run: reset }]); };
  return html`<div class=${'row keyrow' + (on ? ' on' : '')} data-drag="keyrow" onContextMenu=${menuOf}>
    ${still ? null : html`<button class="grip" tabindex="-1" aria-hidden="true" onPointerDown=${e => drag(e, order)}>${GRIP}</button>`}
    <span class="k"><input type="checkbox" aria-label=${shown ? `Hide ${r.caption}` : `Show ${r.caption}`} checked=${shown} disabled=${still} onChange=${e => show(r.key, e.target.checked)} /><${Swatch} sw=${r.swatch} /></span>
    <span class="v">${typing ? html`<span class="cellbox" onFocusOut=${e => { if (!e.currentTarget.contains(e.relatedTarget)) setTyping(false); }}><${Field} r=${{ field: 'text', value: r.caption }} datatype="text" label="Caption" auto put=${put} /></span>`
      : html`<button type="button" class="cap" onClick=${() => Shell.select([`${id}#${r.key}`])} onDblClick=${rename} onKeyDown=${e => { if (e.key === 'F2' || e.key === 'Enter') { e.preventDefault(); rename(); } }}>${r.caption}</button>`}</span>
  </div>`;
}
// A picture's Crop: how much of each side of it is cut off, in percent of the whole picture, typed. The picture stays the
// size and where it was on the page: what's cut goes, and its frame shrinks round the rest.
function Crop({ m, row, set }) {
  const c = { left: 0, top: 0, right: 0, bottom: 0, ...row.crop }, fullW = m.w / (1 - (c.left + c.right) / 100), fullH = m.h / (1 - (c.top + c.bottom) / 100), page = App.scene.value?.page;
  const put = (side, x) => { const was = c[side], v = Math.max(0, Math.min(95 - (side === 'left' || side === 'right' ? c.left + c.right - was : c.top + c.bottom - was), x)), d = (v - was) / 100, crop = { ...c, [side]: v };
    set({ crop, ...(side === 'left' && { x: m.x + fullW * d, w: m.w - fullW * d }), ...(side === 'right' && { w: m.w - fullW * d }), ...(side === 'top' && { y: m.y + fullH * d, h: m.h - fullH * d }), ...(side === 'bottom' && { h: m.h - fullH * d }) }, 'Cropped the picture'); };
  const any = Object.values(c).some(Boolean);
  return html`<${Section} title="Crop" act=${any && !App.readOnly.value ? html`<button class="btn ghost reset" onClick=${() => set({ crop: null, x: m.x - fullW * c.left / 100, y: m.y - fullH * c.top / 100, w: fullW, h: fullH }, 'Took the crop off the picture')}>Reset</button>` : null}>
    ${[['Left', 'left'], ['Top', 'top'], ['Right', 'right'], ['Bottom', 'bottom']].map(([label, side]) => html`<div class="row" key=${side}><div class="k">${label}</div><div class="v ctl">
      <${Field} r=${{ field: 'number', value: c[side] }} datatype="number" label=${`Crop ${label}`} put=${out => out && put(side, out.value)}><span class="unit">%</span></${Field}></div></div>`)}</${Section}>`;
}

// Prose typed over in place, its box growing with it: kept on leaving, put back with Esc. `auto` focuses
// it; `done` hears that it was left as it was.
function Prose({ text, put, label, cls = 'desc', auto, done }) {
  const [typed, setTyped] = useState(null), now = useRef(null), type = t => { now.current = t; setTyped(t); };
  return html`<textarea class=${'cell prose ' + cls} rows="1" value=${typed ?? text} disabled=${App.readOnly.value} aria-label=${label} ref=${el => auto && el && !el.dataset.on && (el.dataset.on = 1, el.focus())}
    onInput=${e => type(e.target.value)} onBlur=${() => { const t = now.current; type(null); if (t !== null && T.clean(t) !== T.clean(text)) put(t.trim()); else done?.(); }}
    onKeyDown=${e => { if (e.key !== 'Escape') return; e.stopPropagation(); const el = e.target;
      // As a value's Esc: what's typed put back, the keys kept here; with nothing typed, to its row.
      if (now.current !== null) { type(null); setTimeout(() => el.isConnected && el.select()); } else { const row = el.closest('.row'); if (row) { row.tabIndex = -1; row.focus(); } else el.blur(); } }} />`;
}

// Two records: what holds between them, each said as a sentence with what's recorded at it beneath; then,
// behind Add a relation, what else someone could enter between them (what a formula works out isn't
// offered). A side fills a relation's parameter through itself or a record located in it that fits there (a
// fund is a GP's Partnership through its Entity Type). Every side is said by the place rule (Notes.placed),
// so none twice.
function RelateView({ a, b }) {
  const r = recs(), n = N(), [picks, setPicks] = useState({}), none = useRef(null), still = App.readOnly.value;
  // A relation added is a change pending (begin), ticked and redlined here until Enter, its amount and its day asked
  // under its row and in the bar under the view; a click away leaves it pending. Which (its key), as what (its
  // tick, role or value). A list's Add, or the New relation form, may have begun one. One held that's being deleted
  // is struck, its box empty, till Enter deletes it.
  const p = App.pending.value, draft = p?.relate?.a === a && p.relate.b === b ? p.relate : null;
  const going = new Set(p?.verb === 'Delete' && p.chart === App.chart.value ? p.needs : []);
  // The row whose tick or untick a change pending began, as it goes, is drawn again still (TagBox).
  const hosted = draft?.key ?? (going.size === 1 ? [...going][0] : null), was = useRef(null), settled = !hosted ? was.current : null;
  was.current = hosted;
  const [adding, setAdding] = useState(!!draft), form = naming.value?.a === a && naming.value.b === b ? naming.value : null;
  const added = fresh.value?.a === a && fresh.value.b === b ? fresh.value.key : null;
  if (!r[a] || !r[b]) return [a, b].some(x => !r[x] && !App.shown.value.item(App.chart.value, x).length) ? null : html`<div class="empty">Not in the chart</div>`;
  const ca = within(a).filter(x => !('field' in r[x])), cb = within(b).filter(x => !('field' in r[x])), inB = new Set(cb), held = new Map(), open = new Map();
  for (const x of ca) for (const rid of relationsAt(x)) {
    const sa = r[rid].args.find(g => g.at === x), sb = r[rid].args.find(g => g !== sa && inB.has(g.at));
    if (sb && !held.has(rid)) held.set(rid, { id: rid, name: nameOf(rid), key: [sa.edge, sb.edge, x, sb.at].join('|').toLowerCase() });
  }
  // What's recorded between them but holds only from a later day, said with its day and its entries then, not
  // offered again as though it were never recorded.
  const later = new Map(), dayNow = App.day.value, inA = new Set(ca);
  for (const row of App.shown.value.rows(App.chart.value)) if (row.args?.length > 1 && !r[row.record] && !held.has(row.record) && row.since > dayNow) {
    const sa = row.args.find(g => inA.has(g.at)), sb = row.args.find(g => g !== sa && inB.has(g.at)), was = later.get(row.record);
    const { id: _, record: __, ...rec } = row;
    if (sa && sb && (!was || row.since < was.since)) later.set(row.record, { id: row.record, since: row.since, rec, key: [sa.edge, sb.edge, sa.at, sb.at].join('|').toLowerCase() });
  }
  const taken = new Set([...held.values(), ...later.values()].map(x => x.key));
  for (const s of Object.values(App.schema.value)) if (s.args?.length > 1 && !n.resolve('Formula', T.bare(s))) s.args.forEach((pa, i) => s.args.forEach((pb, j) => {
    if (i === j) return;
    const la = ca.find(x => T.narrower(tree(x), pa.loc)), lb = cb.find(x => T.narrower(tree(x), pb.loc)), key = [pa.edge, pb.edge, la, lb].join('|').toLowerCase();
    if (!la || !lb || (taken.has(key) && s.args.length === 2)) return;
    const row = open.get(key) ?? open.set(key, { key, name: n.name(T.bare(s)), ea: pa.edge, eb: pb.edge, la, lb, s, rest: s.args.filter((_, k) => k !== i && k !== j), options: [] }).get(key);
    if ('choice' in s.out && !row.options.includes(s.out.choice)) row.options.push(s.out.choice);
  }));
  const slotOf = x => { const got = x.rest.map(p => picks[x.key + p.edge]); return got.every(Boolean) ? { args: [{ edge: x.ea, at: x.la }, { edge: x.eb, at: x.lb }, ...x.rest.map((p, k) => ({ edge: p.edge, at: got[k] }))], options: x.options } : null; };
  const pick = (e, x, p) => menu(e.currentTarget, Object.keys(r).filter(y => !('field' in r[y]) && T.narrower(tree(y), p.loc)).map(y => ({ label: nameOf(objectOf(y)), run: () => setPicks({ ...picks, [x.key + p.edge]: y }) })), { search: true });
  const side = (at, first) => r[at]?.args ? rowName(at) : first ? bound(shortOf(objectOf(at))) : termOf(at);
  // A role chosen in the sentence: its option in its place, or "…" till one is, a dropdown of the options.
  const role = (label, now, options, choose) => said => html`<button class=${'sel dd' + (now ? '' : ' ph')} aria-label=${`${label}: ${now ?? 'none'}`} aria-haspopup="menu"
    onClick=${e => menu(e.currentTarget, options.map(o => ({ label: o, checked: !!now && T.same(o, now), run: () => !(now && T.same(o, now)) && choose(o) })))}><span>${said}</span></button>`;

  // What's between them, as the formula bar says it (FormulaBar.between): a figure's chain written out, and each relation a
  // formula could give the two that doesn't hold, why not, in a sentence; clicked, the bar is on it. One ruled out by name is
  // said among what holds.
  const between = T.isObject(r[a]) && T.isObject(r[b]) ? FormulaBar.between?.(a, b) : null, chainOf = id => between?.holds.find(l => l.id === id)?.chain ?? null;
  const notRow = l => html`<div class="rr not" key=${l.key}><span class="ctl"><span class="tag" aria-disabled="true" /></span>
    <span class="nm"><button class="lk" onClick=${() => FormulaBar.pickLine?.(l.key)}>${l.sentence}</button></span></div>`;
  // What holds: its box first, ticked whatever its output (a tag a formula gives, or one ruled out, flips as a tag's
  // does; any other entered, unticked, goes, as a deletion does, its bar asking until when); the sentence, its role
  // a dropdown where it's entered (italic where a formula gives it, and why beneath, as the formula bar says it, its
  // words on hover); a value after it; and what's recorded at it, as the record's own entries are, one just related
  // with every entry it could have, to fill at once.
  const heldRow = x => { const rel = r[x.id], f = fx(x.id), at = e => rel.args.find(g => T.same(g.edge, e)).at, why = f && because(x.id);
    const chosen = 'choice' in rel && !f && !still && role(x.name, rel.choice, optionsOf(n.fitting(App.schema.value, T.bare(T.specOf(tree(x.id))))), o => put(x.id, rel, { choice: o }));
    const fact = rel.tag === true && !f && !n.resolve('Formula', T.bare(T.specOf(tree(x.id))));
    const gone = going.has(x.id);
    return html`<div class=${'rr' + (rel.tag === false ? ' ruled' : '') + (gone ? ' going' : '')} key=${x.id} data-key=${x.id}>
        <span class="ctl">${gone ? html`<button class="tag" role="checkbox" aria-checked="false" aria-label=${x.name} onClick=${() => App.discard()} />`
          : 'tag' in rel && !fact ? html`<${Output} id=${x.id} slot=${rel} label=${x.name} />`
          : html`<${TagBox} r=${{ tag: true }} fx=${f} fixed=${f} to=${null} label=${x.name} still=${x.id === settled || x.key === settled} flip=${() => remove(x.id, { source: `relate ${a} ${b}`, auto: true })} change=${() => ({ records: { [x.id]: null } })} />`}</span>
        <span class="nm">${sentence(tree(x.id), n.placed(r, x.id).map(s => s.edge), (e, first) => side(at(e), first), { choice: rel.choice, not: rel.tag === false, role: chosen,
          wrap: words => html`<${Go} to=${x.id} cls=${f ? 'fx' : ''}>${words}</${Go}>` })}</span>
        <span class="val">${'field' in rel ? html`<${Output} id=${x.id} slot=${rel} label=${x.name} />` : null}</span>
        ${why || chainOf(x.id) ? html`<span class="why" data-tip=${why?.words || null}>${[why?.cite, chainOf(x.id)].filter(Boolean).join(' · ')}</span>` : null}
      </div>
      ${f ? null : html`<div class="rr-at" key=${x.id + '@'}><${Entries} at=${x.id} depth=${0} offer=${x.key === added} /></div>`}`; };
  // Recorded, but holding only from a later day: its box empty, its sentence, and that day, which shows the chart
  // then; and what's recorded at it then.
  const laterRow = x => {
    const then = App.shown.value.asOf(App.chart.value, x.since), rel = then[x.id] ?? x.rec, st = { ...r, [x.id]: rel }, at = e => rel.args.find(g => T.same(g.edge, e)).at;
    const its = [rel, ...(T.index(then).entries.get(x.id) ?? []).map(e => then[e])].filter(e => e && ('field' in e || 'choice' in e)).map(T.outputText);
    return html`<div class="rr later" key=${x.id} data-key=${x.id}>
      <span class="ctl"><span class="tag" aria-disabled="true" /></span>
      <span class="nm">${sentence(T.treeOf(st, x.id), n.placed(st, x.id).map(s => s.edge), (e, first) => side(at(e), first), { choice: rel.choice })}</span>
      <span class="val">${its.join(' · ')}</span>
      <span class="when">From <${DayOf} id=${x.id} side="from" day=${x.since} shows=${x.since} /></span>
    </div>`;
  };
  // What could: a tag's box to tick, a role to choose in the sentence, or a value to give; a further side,
  // picked in the sentence. Each is a change pending (begin), its amount and its day asked in its row, till Enter adds it,
  // or Esc or Discard drops it.
  const relate = (x, slot, out) => { naming.value = null; begin(a, b, x.key, out, withOut(null, slot, out)); };
  const openRow = x => { const slot = slotOf(x), tag = 'tag' in x.s.out, chosen = !tag && slot && 'choice' in x.s.out, fill = e => T.same(e, x.ea) ? x.la : T.same(e, x.eb) ? x.lb : null;
    const d = draft?.key === x.key && slot ? draft : null;
    const say = (e, first) => { if (fill(e)) return side(fill(e), first);
      const p = x.rest.find(q => T.same(q.edge, e)), y = picks[x.key + p.edge];
      return html`<button class=${'sel dd' + (y ? '' : ' ph')} aria-label=${`${p.edge}: ${y ? nameOf(objectOf(y)) : 'none'}`} onClick=${ev => pick(ev, x, p)}><span>${y ? bound(shortOf(objectOf(y))) : '…'}</span></button>`; };
    const said = d && 'choice' in d.out ? { choice: d.out.choice, role: role(x.name, d.out.choice, x.options, o => relate(x, slot, { choice: o })) }
      : chosen ? { choice: '…', role: role(x.name, null, x.options, o => relate(x, slot, { choice: o })) } : {};
    // A role still to choose says which relation it's of, where two read alike ("is a … of"): Membership, Position.
    return html`<div class=${'rr' + (d ? ' adding' : '')} key=${x.key} data-key=${x.key}>
      <span class="ctl">${d ? html`<button class="tag yes" role="checkbox" aria-checked="true" aria-label=${x.name} onClick=${() => App.discard()} />`
        : !tag ? null : slot ? html`<${TagBox} label=${x.name} still=${x.key === settled} flip=${() => relate(x, slot, { tag: true })} />` : html`<span class="tag" aria-disabled="true" />`}</span>
      <span class="nm">${sentence(x.s, slot ? n.placed(r, null, slot.args).map(s => s.edge) : n.edges(x.s), say, said)}</span>
      <span class="val">${d && 'field' in d.out ? T.format(d.out.field, d.out.value) : tag || !slot || chosen ? null : html`<${Field} datatype=${x.s.out.field} label=${x.name} ph=${x.name} put=${out => out && relate(x, slot, out)} />`}</span>
      ${chosen && !d ? html`<span class="why">${x.name}</span>` : null}
    </div>`; };
  // A relation of a new name, between the two: named, then each side's role after the side, as the relation's own rows
  // set them; once all three are given, a change pending as one ticked is (begin), its redline drawn, its day asked in
  // the bar, Enter adding it. Esc leaves the form, with what it began.
  const ours = draft?.key === 'new' ? draft : null;
  const type = (k, v) => {
    const f = naming.value = { ...form, [k]: v }, [name, ra, rb] = [f.name, f.ra, f.rb].map(T.clean);
    if (!name || !ra || !rb || T.same(ra, rb)) { if (App.pending.peek()?.relate === ours && ours) App.discard({ quiet: true }); return; }
    const p = { args: [{ edge: ra, loc: {} }, { edge: rb, loc: {} }] }, rec = { args: [{ edge: ra, at: a }, { edge: rb, at: b }], tag: true };
    const was = App.pending.peek()?.relate?.key === 'new' && App.pending.peek().relate.a === a && App.pending.peek().relate.b === b ? App.pending.peek() : null;
    App.stage({ verb: 'Add', what: `${name}: ${n.placed(r, null, rec.args).map(s => s.join + s.text).join('')}`, source: `relate ${a} ${b}`, relate: { a, b, key: 'new', out: { tag: true } },
      asks: 'from', day: was ? was.day : App.day.peek(), needs: [a, b], say: c => Time.describe(c),
      // (Its lists go by their roles, plural, as any list's name is: Holders, Funds.)
      make: tx => { tx.add('record', rec); tx.note('Name', p, name); tx.note('Order', p, 1, { param: ra }); tx.note('Order', p, 2, { param: rb }); tx.note('Name', p, T.plural(ra), { param: ra }); tx.note('Name', p, T.plural(rb), { param: rb }); },
      done: () => { naming.value = null; fresh.value = { a, b, key: [ra, rb, a, b].join('|').toLowerCase() }; } });
  };
  // Enter goes on to the next it asks, until it's all given, and then makes it.
  const formKeys = e => {
    if (e.key === 'Enter') { e.preventDefault(); if (ours) App.commit(); else { const all = [...e.currentTarget.querySelectorAll('input.cell')]; all[all.indexOf(e.target) + 1]?.focus(); } }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); naming.value = null; if (ours) App.discard(); }
  };
  const inp = (k, label, first) => html`<input class=${'cell' + (first ? '' : ' role')} placeholder=${first ? 'New relation' : 'New role'} aria-label=${label} value=${form[k]} spellcheck=${false} autocomplete="off"
    onInput=${e => type(k, e.target.value)} ref=${first ? el => el && !el.dataset.on && (el.dataset.on = 1, el.focus()) : null} />`;
  // A role another relation has is said as it's written: a formula reading it would read both.
  const sharedRole = k => { const v = T.clean(form?.[k] ?? ''), of = v && App.relations.value.filter(x => !T.same(x.name, form.name) && x.edges?.some(e => T.same(e, v))).map(x => x.name); return of?.length ? html`<span class="role-shared">${v} is a side of ${of.join(' and ')} too.</span>` : null; };
  // What someone entered first, then what a formula gives, and last what's ruled out; each by name, then the
  // first's side first.
  const order = (x, y) => (r[x.id].tag === false) - (r[y.id].tag === false) || fx(x.id) - fx(y.id) || x.name.localeCompare(y.name);
  // What could be: first what a box's name says, a word of its name being its side's (…GP, LLC, the side named GP); then
  // those the chart would draw as the two stand. One above the other, the box above on the side drawn on top, a solid line
  // before a dashed one (an owner over what it owns), so dragging down from a fund offers it as an owner first; side by
  // side, a dashed line, as a chart draws a general partner or an adviser, but one the other box already has goes after,
  // as a fund has one general partner.
  const sc = App.scene.value, ma = sc?.byId.get(a), mb = sc?.byId.get(b), ya = ma?.y, yb = mb?.y, view = Shell.view.value;
  const upright = !!ma && !!mb && Math.abs(ya + ma.h / 2 - yb - mb.h / 2) > (ma.h + mb.h) / 4;
  const onTop = x => { const p = T.bare(x.s), above = n.value('Above', p, view) ?? n.edges(p)[0]; return T.same(above ?? '', x.ea) === (ya < yb); };
  const dashed = x => (n.resolve('Dash', x.s, view)?.value ?? n.resolve('Dash', T.bare(x.s), view)?.value ?? 'solid') !== 'solid';
  const fits = x => !ma || !mb ? 0 : upright ? (!onTop(x) ? 2 : dashed(x) ? 1 : 0) : dashed(x) ? 0 : 1;
  const says = (id, edge) => T.norm(nameOf(id)).split(/[\s,.()]+/).includes(T.norm(edge));
  const named = x => says(a, x.ea) || says(b, x.eb) ? 0 : 1;
  const filled = x => dashed(x) && Object.keys(r).some(id => r[id].args?.some(s => s.at === x.lb && T.same(s.edge, x.eb)) && !fx(id) && T.same(nameOf(id), x.name)) ? 1 : 0;
  // Then those the chart records most, as Add offers the kinds it draws most.
  const uses = new Map();
  for (const id of Object.keys(r)) if (r[id].args?.length > 1 && !fx(id)) { const k = T.norm(nameOf(id)); uses.set(k, (uses.get(k) ?? 0) + 1); }
  const used = x => uses.get(T.norm(x.name)) ?? 0;
  // And what says how much (an owner's percentage) before what only says that it holds (a member).
  const much = x => 'field' in x.s.out ? 0 : 1;
  const holds = [...held.values()].sort(order), could = [...open.values()].sort((x, y) => named(x) - named(y) || filled(x) - filled(y) || fits(x) - fits(y) || used(y) - used(x) || much(x) - much(y) || x.name.localeCompare(y.name) || (y.la === a) - (x.la === a)), after = [...later.values()].sort((x, y) => x.since.localeCompare(y.since));
  const name = x => html`<${Go} to=${x}>${r[x].args ? bound(`${nameOf(x)}: ${rowName(x)}`) : html`${bound(nameOf(objectOf(x)))}${x !== objectOf(x) ? html`<span class="muted"> › ${segment(x)}</span>` : null}`}</${Go}>`;
  // What else could hold, once asked for; at once where nothing did.
  const ghost = (label, run) => html`<div class="rr new"><button class="btn ghost add-entry" onClick=${run}>${icon('plus')}${label}</button></div>`;
  none.current ??= !holds.length;
  return html`<div class="insp" data-tour="pair">
    <header class="ih"><h2 class="ih-title">${name(a)} <span class="and">and</span> ${name(b)}</h2></header>
    ${holds.length || after.length ? html`<div class="relate">${holds.map(heldRow)}${after.map(laterRow)}</div>` : null}
    ${still ? null : !adding && !draft && !form && !none.current ? html`<div class="relate">${ghost('Add a relation', () => setAdding(true))}</div>` : html`<div class="relate">
      ${could.map(openRow)}
      ${form ? html`<div class=${'rr new' + (ours ? ' adding' : '')} onKeyDown=${formKeys}><span class="ctl"><span class=${'tag' + (ours ? ' yes' : '')} /></span><span class="form">
          ${inp('name', 'Name', true)}<span class="side">${side(a, true)}</span>${inp('ra', `${nameOf(a)}’s role`)}${sharedRole('ra')}<span class="side">${side(b, true)}</span>${inp('rb', `${nameOf(b)}’s role`)}${sharedRole('rb')}</span>
          </div>`
        : ghost('New relation', () => { if (draft) App.discard(); naming.value = { a, b, name: '', ra: '', rb: '' }; })}
    </div>`}
    ${(l => l.length ? html`<${Section} title="What doesn’t hold" n=${l.length} shut=${true} id="nots-of"><div class="relate nots-of">${l.map(notRow)}</div></${Section}>` : null)(between?.not.filter(l => !held.has(l.id) && l.sentence) ?? [])}
  </div>`;
}

// ---- A definition, set out as the statute it encodes ----
// The Description, paragraph by paragraph: one that starts with a row's label sits beside that row; rows that
// share a label are one clause; a labelled paragraph with no row yet is a clause still to write. Each keeps
// its place, so its words are typed over where they're shown: put(paragraph, words) is the Description then.
function clausesOf(rows, text) {
  const parts = String(text ?? '').split(/(\n+)/), labels = [...new Set(rows.map(r => r.label).filter(Boolean))].sort((a, b) => b.length - a.length);
  const groups = [], lead = [], tail = [];
  for (const r of rows) { const g = groups.at(-1); if (g && r.label && T.same(g.label, r.label)) g.rows.push(r); else groups.push({ label: r.label, rows: [r], law: '' }); }
  let any = false;
  parts.forEach((raw, k) => {
    const p = raw.trim();
    if (k % 2 || !p) return;
    const l = labels.find(x => p.toLowerCase().startsWith(x.toLowerCase()) && !/\w/.test(p[x.length] ?? ' '));
    const g = l && groups.find(x => T.same(x.label, l) && x.at === undefined);
    if (g) { Object.assign(g, { law: p.slice(l.length).replace(/^[\s.:—–-]+/, ''), at: k }); any = true; return; }
    const own = any && /^(\([^)]+\)(?:\([^)]+\))*)\s+(.*)$/.exec(p);
    if (own) groups.push({ label: own[1], rows: [], law: own[2], at: k }); else (any ? tail : lead).push({ law: p, at: k });
  });
  const put = (x, to) => { const q = parts.slice(), p = q[x.at].trim(); q[x.at] = to ? p.slice(0, p.length - x.law.length) + to : ''; return q.join('').trim(); };
  // A Description no clause takes is the Description's alone, shown above.
  return { lead: any ? lead : [], groups, tail, any, put };
}
// A row set as a statute sets a clause: a top-level OR or AND on a line of its own with a hanging indent,
// functions and keywords in small capitals, other definitions' names as links. Clicked, it's edited in the bar.
function Typeset({ r, def }) {
  const text = r.formula, f = Formulas.splitFormula(text), byName = new Map(App.definitions.value.map(d => [T.norm(d.name), d]));
  let toks = [];
  try { toks = Formulas.tokenize(f.body, f.offset).slice(0, -1); } catch {}
  const lines = [[html`<span title=${FormulaBar.startSaid(f.kind)}>${text.slice(0, f.offset)}</span>`]];
  let depth = 0, last = f.offset;
  toks.forEach((t, i) => {
    const gap = text.slice(last, t.pos), src = text.slice(t.pos, t.end);
    last = t.end;
    if (t.k === 'op' && (t.v === '(' || t.v === '{')) depth++;
    if (t.k === 'op' && (t.v === ')' || t.v === '}')) depth--;
    if (!depth && t.k === 'kw' && (t.v === 'AND' || t.v === 'OR') && lines.at(-1).some(x => typeof x !== 'string' || x.trim())) lines.push([]); else lines.at(-1).push(gap);
    const call = toks[i + 1]?.k === 'op' && toks[i + 1].v === '(', d = t.k === 'name' && byName.get(T.norm(t.v));
    lines.at(-1).push(t.k === 'kw' || (call && Formulas.FUNCTION_NAMES.includes(t.v.toUpperCase())) ? html`<span class="sc">${src}</span>`
      : d && d.id !== def ? html`<button class="fx-link" onClick=${e => { e.stopPropagation(); openDef(d.id); }}>${src}</button>`
      : t.k === 'str' || t.k === 'op' ? html`<span class="muted">${src}</span>` : src);
  });
  if (last < text.length) lines.at(-1).push(text.slice(last));
  return html`<div class="st-set" onClick=${e => FormulaBar.focus('r' + r.i, { write: e.detail > 1 && !App.readOnly.peek() })}>${lines.map((l, i) => html`<div class=${i ? 'cont' : null}>${l}</div>`)}</div>`;
}
// How many records a clause gives, in the words of the list they make ("15 close affiliates") or of the kind
// they're at ("3 entities"). A yes-or-no is said by how many it holds at, for that it was asked at some says nothing of them: "3 hold,
// 3 don't".
function counted(p, ids) {
  const n = N(), one = ids.length === 1, e = p.args?.length > 1 && n.edges(p)[0];
  const said = (k, x) => `${k} ${x}`;
  if (e) return said(ids.length, lower(one ? e : n.listName(p, e)));
  if (ids.length && ids.every(id => 'tag' in recs()[id])) {
    const yes = ids.filter(id => recs()[id].tag === true).length, no = ids.length - yes;
    return [yes || !no ? `${yes} ${yes === 1 ? 'holds' : 'hold'}` : null, no ? `${no} ${no === 1 ? 'doesn’t' : 'don’t'}` : null].filter(Boolean).join(', ');
  }
  const kinds = [...new Set(ids.map(id => recs()[objectOf(id)]?.kind))];
  return said(ids.length, kinds.length === 1 && kinds[0] ? lower(one ? kinds[0] : T.plural(kinds[0])) : one ? 'record' : 'records');
}
function Statute({ def, p, law }) {
  const { lead, groups, tail, put } = law, mine = Object.entries(App.computed.value.computed).filter(([, c]) => c.def === def.note);
  const gives = g => mine.filter(([, c]) => g.rows.some(r => c.holds?.length ? c.holds.includes(r.i) : c.row === r.i)).map(([id]) => id);
  const write = g => () => { const key = 'n' + Math.random().toString(36).slice(2, 8), tag = App.definitions.value.find(d => d.id === def.note)?.type === 'tag';
    FormulaBar.edit(def.note, xs => [...xs, { key, label: g.label, formula: tag ? '← ' : '= ' }]); FormulaBar.focus(key, { write: true }); };
  const words = (x, cls) => x.at === undefined ? html`<span class=${cls} />`
    : html`<${Prose} cls=${cls} text=${x.law} label=${x.label || 'Description'} put=${to => App.change(tx => tx.note('Description', p, put(x, to) || undefined))} />`;
  return html`<div class="statute">
    ${lead.map(x => words(x, 'st-lead'))}
    <ol class="st-clauses">${groups.map((g, k) => { const ids = gives(g);
      return html`<li class="st-clause" key=${k} onPointerEnter=${() => FormulaBar.light(ids)} onPointerLeave=${() => FormulaBar.light(null)}>
        <span class="st-label">${g.label}</span>${words(g, 'st-law')}
        <div class="st-forms">${g.rows.length ? g.rows.map(r => html`<${Typeset} key=${r.i} r=${r} def=${def.note} />`)
          : App.readOnly.value ? null : html`<button class="st-write" onClick=${write(g)}>${'='}</button>`}</div>
        ${ids.length && !(groups.length === 1 && ids.every(id => 'tag' in recs()[id])) ? html`<button class="st-n" onClick=${() => select(ids)}>${counted(p, ids)}</button>` : html`<span class="st-n" />`}</li>`; })}</ol>
    ${tail.map(x => words(x, 'st-lead'))}
  </div>`;
}

// A yes or no about an entry in general, a checkbox row as a tag is: its box, then its label.
const checkRow = (label, on, set) => html`<label class="row chk" key=${label}><span class="v ctl"><input type="checkbox" checked=${on} disabled=${App.readOnly.value}
  onChange=${e => set(e.target.checked)} /></span><span class="k">${label}</span></label>`;

// Who last changed a rule, when and why, what it did, and its History: what a regulator asks of it, asked of the rule. Each of its
// changes is what's said at its pattern (`keys`), the rest of what the change held left out.
function RuleLog({ keys, name }) {
  const log = Time.ruleLog(keys), last = log.at(-1), [typing, setTyping] = useState(false), still = App.readOnly.value;
  useLayoutEffect(() => { if (last && !last.fx) Time.ask(last.change); }, [last?.change.id]);
  if (!last) return null;
  // (Done with, the keys go back to what asked it.)
  const backToSay = () => setTimeout(() => document.querySelector('.insp .acts .why-add')?.focus({ preventScroll: true }));
  const say = e => { if (e.key === 'Escape') { e.stopPropagation(); setTyping(false); backToSay(); } else if (e.key === 'Enter') { e.preventDefault(); const text = e.target.value; setTyping(false); App.annotate(last.change.id, text); backToSay(); } };
  return html`<div class="rule-log">
    <p class="who"><span class="what">${last.head}</span> · ${last.who} · ${whenTyped(last.when)}</p>
    ${last.reasons.map(r => html`<p class="why">${r.text}${r.own ? null : html`<span class="by"> · ${r.who}, ${short(T.isoOf(new Date(r.when)))}</span>`}</p>`)}
    ${last.fx?.said ? html`<p class="did" title=${last.fx.said}>${last.fx.said}</p>` : null}
    ${typing ? html`<label class="why-in"><span>Why</span><input class="cell" spellcheck=${false} autocomplete="off" aria-label="Why" ref=${el => el && !el.dataset.on && (el.dataset.on = 1, el.focus())} onKeyDown=${say} onBlur=${() => setTyping(false)} /></label>`
      : html`<p class="acts">${still ? null : html`<button class="lk why-add" onClick=${() => setTyping(true)}>Say why…</button>`}<button class="lk" onClick=${() => Time.ofRule(keys, name)}>History</button></p>`}
  </div>`;
}
// What a rule won't stand behind: what's wrong with it, or the rule it reads that's in error.
function RuleInError({ def }) {
  const { roots, reach } = App.broken.value, own = roots.find(r => r.def === def), warned = (App.computed.value.flaws?.[def] ?? []).filter(f => f.warn), none = !reach.has(def) && FormulaBar.nobody(App.computed.value, def);
  if (!reach.has(def) && !warned.length && !none) return null;
  return html`<div class="rule-err" role="alert">${own ? own.problems.map(t => html`<p>${t}</p>`) : reach.has(def) ? html`<p>It reads ${roots.map(r => r.name).join(' and ')}, whose formula doesn’t work: what it gives can’t be relied on.</p>` : null}
    ${none ? html`<p class="warn">${none}</p>` : null}${warned.map(f => html`<p class="warn">${f.message}</p>`)}</div>`;
}
// What a yes-or-no with a rule says of what it covers, counted, each a click from who: holds, fails or doesn't, can't say, typed over, and of what it says
// nothing of, by what its silence means (n/a; no; fine). (dendra.md, Definitions.) So a rule that holds nowhere can't look like one that found nothing.
function RuleCovers({ def, check }) {
  const R = App.computed.value, c = Formulas.coverage(R, def), d = App.definitions.value.find(x => x.id === def);
  if (!c || d?.type !== 'tag') return null;
  const nm = x => { const r = recs()[x]; return r?.args ? segment(x) : r?.at ? bound(N().whereOf(recs(), r)) : r ? bound(nameOf(x)) : x; }, errOf = x => R.errors.find(e => e.id === x);
  const say = x => { const e = errOf(x); return e ? (e.args?.length > 1 ? e.args.map(a => shortOf(objectOf(a.at))).join(' → ') : bound(nameOf(objectOf(e.at)))) : nm(x); }, go = x => { const e = errOf(x); return e ? e.args?.length > 1 ? () => emit('why-open', x) : () => { select([objectOf(e.at)]); emit('why-open', x); } : () => select([recs()[x]?.args ? x : objectOf(x) ?? x]); };
  const quiet = c.quiet?.length && c.silent ? [{ n: c.silent === 'untested' ? 'n/a' : c.silent === 'no' ? (c.quiet.length === 1 ? 'doesn’t' : 'don’t') : 'nothing wrong', ids: c.quiet, plain: true }] : [];
  const parts = [{ n: c.holds.length === 1 ? 'holds' : 'hold', ids: c.holds }, { n: check ? (c.fails.length === 1 ? 'fails' : 'fail') : (c.fails.length === 1 ? 'doesn’t' : 'don’t'), ids: c.fails, cls: check ? 'bad' : null }, { n: 'can’t say', ids: c.cant, cls: 'unsure' }, { n: 'can’t be worked out', ids: c.broken, cls: 'bad' }, { n: 'typed over', ids: c.typed, cls: 'unsure' }, ...quiet].filter(p => p.ids.length);
  if (!parts.length) return null;
  const open = (e, p) => menu(e.currentTarget, p.ids.map(x => ({ label: p.plain ? bound(nameOf(objectOf(x) ?? x)) : say(x), run: p.plain ? () => select([objectOf(x) ?? x]) : go(x) })), { search: p.ids.length > 7 });
  return html`<p class="rule-covers">${parts.map((p, i) => html`${i ? ' · ' : ''}<button class=${'lk' + (p.cls ? ` ${p.cls}` : '')} aria-haspopup="menu" onClick=${e => open(e, p)}>${p.ids.length} ${p.n}</button>`)}</p>`;
}
// Each of a rule's records a tag's rule says no of, or a hand has typed over, by name: who fails, on its page; and the way back to the rule.
function RuleRecords({ def, check }) {
  const R = App.computed.value, nm = x => recs()[x]?.args ? segment(x) : bound(N().whereOf(recs(), recs()[x])), to = x => objectOf(x) ?? x;
  const no = Object.keys(R.computed).filter(x => R.computed[x].def === def && recs()[x]?.tag === false).sort((a, b) => nm(a).localeCompare(nm(b)));
  const typed = Object.keys(R.covered).filter(x => R.covered[x].def === def && !R.covered[x].agrees && recs()[x]).sort((a, b) => nm(a).localeCompare(nm(b)));
  return html`
    ${no.length ? html`<${Section} title=${check ? 'Fails at' : 'Doesn’t hold at'} n=${no.length} shut=${no.length > 8}>${no.map(x => html`<div class="row" key=${x}><div class="k wide"><${Go} to=${recs()[x].args ? x : to(x)}>${nm(x)}</${Go}></div></div>`)}</${Section}>` : null}
    ${typed.length ? html`<${Section} title="Typed over" n=${typed.length}>${typed.map(x => html`<div class="row" key=${x}><div class="k wide"><${Go} to=${recs()[x].args ? x : to(x)}>${nm(x)}</${Go}></div>
      <div class="v"><span class="muted">${T.outputText(recs()[x])}; the rule ${ruleSays(x)}</span>${App.readOnly.value ? null : html` <button class="lk" onClick=${() => backToRule(x)}>Back to the rule…</button>`}</div></div>`)}</${Section}>` : null}`;
}
// What a rule can be limited to, of what its records have: each yes-or-no, and each option of a choice, at what it's at. Its rows
// go under it, in the bar, n/a elsewhere (dendra.md, Not tested): nothing's made till Done.
function limits(s0, def) {
  const k = s0?.args?.[0]?.loc?.kind, S = Object.values(App.schema.value);
  if (!k || !def) return [];
  const at = S.filter(s => s.args?.length === 1 && s.out && s.args[0].loc.kind && T.same(s.args[0].loc.kind, k) && !T.same(s.args[0].edge, s0.args[0].edge)), nm = Formulas.nameText;
  const tags = at.filter(s => 'tag' in s.out).map(s => ({ label: s.args[0].edge, run: () => FormulaBar.limit(def.note, nm(s.args[0].edge)) }));
  const opts = at.filter(s => 'choice' in s.out).map(s => ({ label: `${s.args[0].edge}: ${s.out.choice}`, run: () => FormulaBar.limit(def.note, `${nm(s.args[0].edge)} = "${s.out.choice}"`) }));
  return [...new Map([...tags, ...opts].map(x => [x.label, x])).values()].sort((a, b) => a.label.localeCompare(b.label));
}

// An entry, relation or kind in general: what it's called and means, its options, whether it's required,
// a start or an end, where it's at, its definition, and its styles. Seen as a `style` (a frame selected), it
// says so. A Description or a Formula not yet written is added from Add.
function GeneralView({ p, style }) {
  const n = N(), S = App.schema.value, specs = n.fitting(S, p), kind = !p.args, rel = p.args?.length > 1, s0 = specs[0], still = App.readOnly.value;
  const [describing, setDescribing] = useState(false);
  const type = kind ? 'kind' : !s0 ? null : 'field' in s0.out ? 'field' : 'choice' in s0.out ? 'choice' : 'tag';
  const name = n.name(p), def = !kind && n.resolve('Formula', p)?.note, dated = type === 'field' && s0.out.field === 'date', dp = { out: { field: 'date' }, args: p.args };
  // Where the Description is the statute the Formula sets out, it's said there, clause by clause, and only there.
  const law = def && clausesOf(def.value.map((r, i) => ({ ...r, i })), n.description(p));
  // (A selection names what its page is of, so a page renamed goes with its new name.)
  const setName = to => {
    if (!to || to === name) return;
    const made = App.change(tx => kind ? tx.rename(p, p.kind, to) : rel ? tx.note('Name', p, to) : tx.rename(loose(p), p.args[0].edge, to));
    if (made && !rel) select([general(kind ? { ...p, kind: to } : { ...p, args: [{ ...p.args[0], edge: to }] })]);
  };
  const flag = (label, q, v) => App.change(tx => tx.note(label, q, v));
  const options = type === 'choice' ? optionsOf(specs) : [];
  const reorderOpts = (from, i) => App.change(tx => moved(options, from, i).forEach((o, k) => tx.note('Order', { out: { choice: o }, args: p.args }, k + 1)));
  const ats = kind ? [] : rel ? n.edges(p).map(e => [e, [...new Set(specs.map(s => where(s.args.find(a => T.same(a.edge, e)).loc)))].join(', ')])
    : [['At', [...new Set(specs.map(s => where(s.args[0].loc)))].join('\n')]];
  const below = kind ? [...new Map(Object.values(S).filter(s => s.args?.length === 1 && s.args[0].loc.kind && T.same(s.args[0].loc.kind, p.kind)).map(s => [T.norm(s.args[0].edge), s])).values()] : [];
  // A first formula is written in the bar, and is nothing till it's Done (FormulaBar.define).
  const addFormula = () => FormulaBar.define(p), writing = FormulaBar.draft.value?.fresh && T.key(FormulaBar.draft.value.pattern) === T.key(p);
  const v = viewShown()?.layout === 'chart' ? Shell.view.value : null, described = !law?.any && (describing || !!n.description(p));
  const adds = still ? [] : [...(law?.any || described ? [] : [{ label: 'Description', run: () => setDescribing(true) }]), ...(def || kind || writing ? [] : [{ label: 'Formula', run: addFormula }])];
  // What's said of it in a sentence (a role renamed, say, is every tree of it relabeled, and every formula that cites it).
  const renameRole = (e, to) => {
    if (!to || T.same(to, e)) return;
    const said = `Renamed the role ${e} of ${name} to ${to}`, made = App.change(tx => { tx.rename(loose(p), e, to); tx.says(said); }, { say: said, dated: false });
    if (made) select([general({ ...p, args: p.args.map(a => T.same(a.edge, e) ? { ...a, edge: to } : a) })]);
  };
  const keys = [...new Set([T.key(p), ...(def ? [T.key(def.pattern)] : [])])], cond = rel || kind || !def ? [] : limits(s0, def);
  // As of a day past, today's rule is what's read: where it's changed since, it says so.
  const since = def && typeof Time !== 'undefined' ? Time.ruleSince(def.pattern) : null;
  return html`<div class="insp">
    <${Head} title=${name} path=${style ? [{ label: 'Style' }] : kind ? [] : rel ? [{ label: 'Relation' }] : [{ label: T.DATATYPES[s0?.out.field] ?? (type === 'choice' ? 'Choice' : 'Yes or no') }]}>
      <${Field} r=${{ field: 'text', value: name }} datatype="text" label="Name" title put=${out => out && setName(out.value)} /></${Head}>
    ${since ? html`<div class="later"><span>Today’s rule: changed ${since.day} by ${since.who}</span>${since.stand ? html`<button class="btn" onClick=${since.stand}>As it stood</button>` : null}</div>` : null}
    <div class="rows">
      ${def ? html`<${RuleInError} def=${def.note} />` : null}
      ${kind ? null : html`<${RuleLog} keys=${keys} name=${name} />`}
      ${described ? html`<div class="row"><div class="k">Description</div><div class="v ctl"><${Prose} text=${n.description(p) ?? ''} label="Description" auto=${describing}
        put=${text => { setDescribing(false); App.change(tx => tx.note('Description', p, text || undefined)); }} done=${() => setDescribing(false)} /></div></div>` : null}
      ${ats.map(([k, x]) => html`<div class="row" key=${k}><div class="k">${k}</div><div class="v lines">${cond.length && !still ? html`<button class="sel dd" aria-haspopup="menu" data-tip="Limit it to" onClick=${e => menu(e.currentTarget, cond, { search: cond.length > 7 })}><span>${x}</span></button>` : x}</div></div>`)}
      ${rel ? n.edges(p).map(e => html`<div class="row" key=${'r' + e}><div class="k">Role</div><div class="v ctl"><${Field} r=${{ field: 'text', value: e }} datatype="text" label=${`Role ${e}`} put=${out => out && renameRole(e, out.value)} /></div></div>
        <div class="row" key=${'l' + e}><div class="k">${e} list</div><div class="v ctl"><${Field} r=${{ field: 'text', value: n.listName(p, e) }} datatype="text"
        label=${`${e} list`} put=${out => App.change(tx => tx.note('Name', p, out?.value === e ? undefined : out?.value, { param: e }))} /></div></div>`) : null}
      ${kind || rel || (type === 'tag' && def && !n.required(p)) ? null : checkRow('A blank needs filling in', n.required(p), on => flag('Required', p, on))}
      ${type === 'tag' ? checkRow('A no needs attention', n.value('Check', p) === true, on => flag('Check', p, on)) : null}
      ${kind || rel || def || writing || (dated && (n.isStart(dp) || n.isEnd(dp))) ? null : checkRow('Changes over time', dated ? n.changing(p) : !n.fixed(p), on => flag('Fixed', p, dated ? (on ? false : undefined) : (on ? undefined : true)))}
      ${dated ? ['Start', 'End'].map(l => checkRow(l, l === 'Start' ? n.isStart(dp) : n.isEnd(dp), on => flag(l, dp, on))) : null}
      ${adds.length ? html`<${AddRow} items=${() => adds} />` : null}
    </div>
    ${type === 'choice' ? html`<${Section} title="Options" n=${options.length}>
      ${options.map(o => html`<div class="ent" data-drag="opt" key=${o}><div class="row" style="--depth:0">${still ? null : html`<button class="grip" tabindex="-1" aria-hidden="true" onPointerDown=${e => drag(e, reorderOpts)}>${GRIP}</button>`}
        <div class="k wide"><${Field} r=${{ field: 'text', value: o }} datatype="text" label="Option" put=${out => out && out.value !== o && App.change(tx => tx.rename(loose(p), o, out.value))} /></div></div></div>`)}
      ${still ? null : html`<div class="row"><div class="k wide"><${Field} datatype="text" ph="New options" put=${out => out && App.change(tx => optionsTyped(out.value).forEach(o => tx.add('spec', { tree: { ...T.specOf(s0), out: { choice: o } } })))} /></div></div>`}</${Section}>` : null}
    ${below.length ? html`<${Section} title="Entries" n=${below.length}>
      ${below.sort((x, y) => (n.order(x) ?? Infinity) - (n.order(y) ?? Infinity) || x.args[0].edge.localeCompare(y.args[0].edge)).map(s => html`<div class="row" key=${T.key(s)}>
        <div class="k"><${Go} to=${general(T.bare(s))}>${s.args[0].edge}</${Go}></div><div class="v muted">${typeName(s)}</div></div>`)}</${Section}>` : null}
    ${def ? html`<${Section} title="Formula"><${Statute} def=${def} p=${p} law=${law} /><${RuleCovers} def=${def.note} check=${n.value('Check', p) === true} /></${Section}>` : null}
    ${def ? html`<${RuleRecords} def=${def.note} check=${n.value('Check', p) === true} />` : null}
    ${v && stylesOf(v, p).length ? html`<${Section} title="Styles"><${Styles} v=${v} only=${p} /></${Section}>` : null}
  </div>`;
}

// Several selected: each by what it is, a relation by its place (Ownership · Fund III → Fund III Blocker), so a
// trunk's lines or a frame's are told apart.
function Many({ ids }) {
  // (Counted as the format bar counts them: by what's drawn, a group by its members.)
  const sc = App.scene.value, n = !sc ? ids.length : new Set(ids.flatMap(k => { const m = sc.byId.get(k.split('#')[0]); return m?.geometry === 'group' ? m.members : [m?.merged ?? m?.id ?? k]; })).size;
  // As every list a click opens: the arrows through it, Enter opening a row, F1 its reason. Reached from the keys (a rule's "24 hold"), they go into it.
  const box = useRef();
  useLayoutEffect(() => { const a = document.activeElement; if (Shell.keyed() && (!a || a === document.body || !a.isConnected || a.closest('.insp'))) box.current?.querySelector('.row')?.focus({ preventScroll: true }); }, []);
  return html`<div class="insp"><${Head} title=${`${n} selected`} /><div class="rows" ref=${box} data-list=":scope > .row">
    ${ids.filter(x => recs()[x]).map(x => html`<div class="row" key=${x} tabindex="-1" data-why=${x} onKeyDown=${e => { if (e.key === 'Enter' && e.target === e.currentTarget) { e.preventDefault(); e.stopPropagation(); goTo(x); } }}><div class="k wide"><${Go} to=${x}>${recs()[x].args ? html`${nameOf(x)} · ${segment(x)}` : bound(nameOf(objectOf(x)))}</${Go}></div></div>`)}</div></div>`;
}

// Each new selection is shown from the panel's top, as a new page is, but where a row is aimed at (RecordView), which
// it's scrolled to; `aimed`, the selection an aim was taken for.
let host = null, aimed = null;
// A row added, or a section or the strip appearing, doesn't move what's under the pointer: the panel scrolls by as much, before it's
// drawn (dendra.md, inspector).
function holdsStill(pane) {
  let at = null, top = 0;
  // (Where it is in the panel: the panel itself moving, a format bar coming back over it, is nothing to scroll for.)
  const here = el => el.getBoundingClientRect().top - pane.getBoundingClientRect().top;
  const mark = e => { at = e.target.closest?.('.row, .rr, .sect, .doc, .ih') ?? null; top = at ? here(at) : 0; };
  // (Left by the pointer, what has the keys is what's held.)
  const leave = () => { at = pane.contains(document.activeElement) ? document.activeElement.closest('.row, .rr, .sect, .doc, .ih') : null; top = at ? here(at) : 0; }, scrolled = () => { if (at?.isConnected) top = here(at); };
  const seen = new MutationObserver(() => {
    if (!at?.isConnected) return;
    const d = here(at) - top;
    if (Math.abs(d) >= 1) pane.scrollTop += d;
    top = here(at);
  });
  pane.addEventListener('pointermove', mark, { passive: true });
  pane.addEventListener('pointerleave', leave);
  pane.addEventListener('focusin', leave);
  pane.addEventListener('scroll', scrolled, { passive: true });
  seen.observe(pane, { childList: true, subtree: true });
  return () => { seen.disconnect(); pane.removeEventListener('pointermove', mark); pane.removeEventListener('pointerleave', leave); pane.removeEventListener('focusin', leave); pane.removeEventListener('scroll', scrolled); };
}
function Inspector() {
  const sel = Shell.selection.value, key = sel.join();
  useLayoutEffect(() => {
    const pane = host?.closest('.inspector');
    if (!pane) return;
    // Esc from a row of the panel, with what's typed in its own hands, drops a value waiting, before the selection goes.
    // Else, the keys here, Esc backs out a step, as from anywhere: to the view, at what's selected, which stays so; and with nothing selected, it puts the
    // panel away, as its button and Ctrl+\ do, the view having the keys.
    const esc = e => {
      if (e.key !== 'Escape' || e.defaultPrevented || e.target.closest('input, textarea, select, [contenteditable], .CodeMirror, .float, dialog')) return;
      e.preventDefault(); e.stopPropagation();
      if (App.pending.peek()?.typed) return App.discard();
      if (Shell.wide.peek()) { Shell.narrow(); return Shell.enter('view'); }
      if (!Shell.selection.peek().length) Shell.parts.peek().action?.find(a => a.id === 'panel')?.run();
      Shell.enter('view');
    };
    pane.addEventListener('keydown', esc);
    const off = holdsStill(pane);
    return () => { off(); pane.removeEventListener('keydown', esc); };
  }, []);
  useLayoutEffect(() => {
    const s = host?.closest('.inspector'), top = backTo?.key === key ? backTo.top : null;
    // (Again once it's drawn, as its strip takes its room only then.)
    if (s && top !== null) { s.scrollTop = top; requestAnimationFrame(() => { s.scrollTop = top; }); }
    else if (s && aimed !== key) s.scrollTop = 0;
    aimed = null; backTo = null;
  }, [key]);
  return chosen(sel);
}
// What a selection key names: a free shape (or a row of a Key) has its own panel; a relation's text in one box
// is the relation.
function chosen(sel) {
  const p = sel.length === 1 && Shell.pattern(sel[0]);
  if (!App.chart.value) return null;   // opening
  if (p) return html`<${GeneralView} key=${sel[0]} p=${p} />`;
  // (Two records either of which may be a relation: an ownership and the certificate that evidences it.)
  if (sel.length === 2 && sel.some(k => T.isObject(recs()[k] ?? {})) && sel.every(k => T.isObject(recs()[k] ?? {}) || recs()[k]?.args)) return html`<${RelateView} key=${sel.join()} a=${sel[0]} b=${sel[1]} />`;
  if (sel.length > 1) return html`<${Many} ids=${sel} />`;
  // A frame is drawn by a style: selecting it shows the entry the style is of, with its styles.
  const frame = sel.length === 1 && sel[0].startsWith('frame:') && App.scene.value?.byId.get(sel[0]);
  if (frame?.output) return html`<${GeneralView} key=${sel[0]} p=${T.bare(frame.output)} style />`;
  if (sel.length === 1) {
    const [id, part] = sel[0].split('#'), rid = id.split('@')[0], rows = App.shown.value.item(App.chart.value, rid);
    if (rid === Scene.FOOTER || rid === Scene.NUMBER) return html`<${FootView} key=${rid} />`;
    if (rows.at(-1) && 'shape' in rows.at(-1)) return html`<${ShapeView} key=${rid} id=${rid} part=${part} />`;
    if (recs()[rid] || rows.length) return html`<${RecordView} key=${rid} id=${rid} />`;
  }
  return html`<${ViewPanel} />`;
}

// ---- What needs attention: deadlines overdue and due soon, blanks where required, and errors ----
// Going to one selects the record it's at and aims at its row, with the formula bar on it: a deadline's why, as an
// error's; an error, which is no record, at the row where its value would be, the formula that gave it asked. A blank
// has no formula: its row takes the keys, to be typed into. A failed check is app.js's.
const attending = a => {
  const go = (id, edge, why) => () => {
    const obj = recs()[id] && objectOf(id);
    if (!obj) return;
    aim.value = edge ? `${id}|${edge}` : id;
    select([obj]);
    if (why) emit('why-open', why);
  };
  // (A rule in error that shows at no record goes to the rule.)
  const toRule = () => { const q = N().notes('Formula').find(x => x.note === a.error.def)?.pattern; if (q) select([general(q)]); };
  const p = a.error && (placeOf(a.error) ?? a.error.args?.[0]);
  return { kind: a.kind, id: a.id, edge: a.edge, error: a.error, by: a.by, go: a.error?.rule ? toRule : a.error ? go(p?.at, p?.edge, a.id) : a.kind === 'blank' ? go(a.id, a.edge) : go(a.id, null, a.id) };
};
const attention = computed(() => App.needs.value.filter(a => a.kind !== 'error' || a.error).map(attending));

// A list's Add, asked for from elsewhere (a transfer's toast: Add an owner of Holdco…): the record shown, its Add's search open
// on that list's who.
function addToList(id, list) {
  const l = listsOf(id).find(x => T.same(x.name, list));
  Shell.showPanel?.();
  select([id]);
  if (l) setTimeout(() => { const at = document.querySelector('.insp .addrow .add-entry'); if (at) addTo(at, id, l); }, 120);
}
// What a box's right-click adds to it, where it's clicked (`at`): each list of a relation with a percentage at it, the
// stakes a structure chart is made of, by the word for one of it (Add owner…, Add holding…), its first side's first.
function addsOf(id) {
  const stake = w => Object.values(App.schema.value).some(s => s.args?.length === 1 && s.out?.field === 'percent' && T.narrower(w.s, s.args[0].loc));
  return listsOf(id).filter(l => l.ways.some(stake)).sort((a, b) => a.ways[0].s.args.indexOf(a.ways[0].sl) - b.ways[0].s.args.indexOf(b.ways[0].sl))
    .map(l => ({ label: `Add ${one(l.name).toLowerCase()}…`, run: at => addTo(at, id, l) }));
}
Shell.register('inspector', { addTo: addToList, adds: addsOf, ending: rid => remove(rid, { auto: true }), ask: into => { Shell.showPanel?.(); aim.value = 'merged'; select([into]); }, mount(el) { host = el; render(html`<${Inspector} />`, el); return () => render(null, el); } });
Shell.register('attention', { items: () => attention.value, within: days => App.needsWithin(days).filter(a => a.kind === 'soon').map(attending) });
// What the panel's ⋯ changes, for Find, of the one record selected: Transfer… (by the words a sale goes by) and Delete…,
// with why not, where they can't be.
const theOne = () => { const ks = Shell.selection.peek(); return ks.length === 1 && recs()[ks[0]] ? ks[0] : null; };
const notNow = (can, what) => () => App.readOnly.peek() ? App.whyNot() : !theOne() ? `Select ${what} first` : can;
// (Viewing, these are what-ifs: redlined, and made only from Editing. Only the past can't ask.)
const notAsked = (can, what) => () => !App.canAsk() ? App.whyNot() : !theOne() ? `Select ${what} first` : can;
const WHAT_IF = ['What if', 'Scenario', 'Preview', 'Hypothetical'];
Shell.register('action', { id: 'record.transfer', name: 'Transfer…', names: ['Sell', 'Sale', 'Assign', 'Transfer ownership', ...WHAT_IF],
  enabled: () => App.canAsk() && !!theOne() && !!App.transferable(theOne()), run: () => App.transferring(theOne()),
  why: notAsked('Only a relation of two sides transfers', 'an ownership or another relation') });
Shell.register('action', { id: 'record.interpose', name: 'Insert an entity between…', names: ['Insert', 'Interpose', 'Holdco', ...WHAT_IF],
  enabled: () => App.canAsk() && !!theOne() && !!App.interposable(theOne()), run: () => App.interposing(theOne()),
  why: notAsked('Only an ownership takes one between', 'an ownership') });
// What a formula gives, overridden by saying so, as the reason in the formula bar offers it.
const computedTag = () => { const id = theOne(); return id && fx(id) && 'tag' in recs()[id] ? id : null; };
Shell.register('action', { id: 'record.override', name: 'Override…', names: ['Rule out', 'Attest', 'Override', 'Waive', 'Waiver', 'Exception', 'Type over'],
  enabled: () => !App.readOnly.peek() && !!computedTag(), run: () => App.overriding(computedTag()), why: notNow('Only what a formula gives is overridden', 'what a formula gives') });
Shell.register('action', { id: 'record.merge', name: 'Merge into…', names: ['Merger', 'Merged into', 'Merge', ...WHAT_IF],
  enabled: () => App.canAsk() && !!theOne() && App.endsOf(theOne()).some(e => e.rel), run: () => App.merging(theOne()), why: notAsked('Only what can merge merges', 'an entity') });
Shell.register('action', { id: 'record.delete', get name() { return `${theOne() ? App.deleteVerb([theOne()]) : 'Delete'}…`; }, names: ['Delete', 'Remove', 'Dissolve', 'End', 'Sell', 'Sale', ...WHAT_IF],
  enabled: () => App.canAsk() && !!theOne() && App.scene.peek()?.byId.get(theOne())?.change !== 'Gone', run: () => remove(theOne(), { auto: true }), why: notAsked('', 'what to delete') });
// The list of the rules, from the chart's menu and Find: what checks something first, then every other, then the relations entered,
// each a click from its page.
function rulesList(anchor = { x: 40, y: 44 }) {
  const n = N(), S = App.schema.peek(), { roots } = App.broken.peek(), defs = n.notes('Formula').filter(x => !x.view);
  const item = (p, detail) => ({ label: n.name(p), detail: roots.some(r => T.same(r.name, n.name(p))) ? 'Doesn’t work' : detail, run: () => select([general(p)]) }), by = (a, b) => a.label.localeCompare(b.label);
  const of = x => x.pattern.args?.length > 1 ? 'Relation' : 'field' in (n.fitting(S, x.pattern)[0]?.out ?? {}) ? 'Value' : 'choice' in (n.fitting(S, x.pattern)[0]?.out ?? {}) ? 'Choice' : 'Yes or no';
  const checks = defs.filter(x => n.value('Check', x.pattern) === true), rest = defs.filter(x => !checks.includes(x));
  const worked = new Set(defs.filter(x => x.pattern.args?.length > 1).map(x => T.norm(n.name(x.pattern))));
  const relations = App.layouts.peek().relations.filter(l => !worked.has(T.norm(l.name))).map(l => item(l.rows, 'Relation'));
  const part = (head, xs) => xs.length ? [{ head }, ...xs.sort(by)] : [];
  // Every value typed over a rule, on the one list: whose, what the rule says, why and who said so.
  const R = App.computed.peek(), overs = Object.keys(R.covered).filter(x => !R.covered[x].agrees && recs()[x]).map(x => { const o = App.overOf(x), r = recs()[x]; return { label: `${r.args ? segment(x) : `${r.edge} · ${bound(N().whereOf(recs(), r))}`}`, detail: `${T.outputText(r)}; the rule ${ruleSays(x)}`, tip: [`${T.outputText(r)}; the rule ${ruleSays(x)}`, o?.why].filter(Boolean).join(' · '), names: ['Typed over', 'Override', 'Overrides', 'Waiver', 'Exception', o?.why ?? ''], run: () => { select([r.args ? x : objectOf(x)]); emit('why-open', x); } }; });
  menu(anchor, [...part('Checks', checks.map(x => item(x.pattern, 'Check'))), ...part('Rules', rest.map(x => item(x.pattern, of(x)))), ...part('Relations', relations), ...part('Typed over', overs)], { search: true });
}
Shell.register('action', { id: 'rules', name: 'Rules', names: ['Checks', 'Check', 'Definitions', 'Formulas', 'List of rules', 'Relations', 'Overrides', 'Typed over', 'Waivers'], menu: 'chart', order: 11, run: () => setTimeout(() => rulesList()) });
// A relation no rule gives is reopened from Find too, by its name, as a rule is: its page names it, and its roles.
Shell.register('find', { items: () => {
  const n = N(), given = new Set(n.notes('Formula').filter(x => x.pattern.args?.length > 1).map(x => T.norm(n.name(x.pattern))));
  return App.layouts.peek().relations.filter(l => !given.has(T.norm(l.name))).map(l => ({ label: l.name, detail: 'Relation', names: ['Relation', 'Rename relation'], run: () => select([general(l.rows)]) }));
} });
// Renamed in its panel's title, its Name, which the keys go to.
Shell.register('action', { id: 'record.rename', name: 'Rename', names: ['Change name', 'Edit name'], enabled: () => !App.readOnly.peek() && !!theOne() && !!recs()[theOne()].kind,
  run: () => { Shell.showPanel?.(); setTimeout(() => { const t = document.querySelector('.insp .ih .cellbox.title textarea'); t?.focus(); t?.select(); }, 60); },
  why: notNow('Only a record with a name is renamed', 'what to rename') });
// Hidden in the chart shown, or shown there again, as its ⋯ does it.
const drawnHere = () => !!App.scene.peek()?.byId.has(theOne());
Shell.register('action', { id: 'record.hide', get name() { return theOne() && !drawnHere() ? 'Show in this view' : 'Hide in this view'; }, names: ['Hide box', 'Show box', 'Unhide'],
  enabled: () => (!App.readOnly.peek() || App.seeing()) && !!theOne() && viewShown()?.layout === 'chart' && !!(recs()[theOne()].kind || recs()[theOne()].args),
  run: () => showHere([theOne()], viewShown(), !drawnHere()),
  why: () => viewShown()?.layout !== 'chart' ? 'Show a chart first' : notNow('Only a box or a line is hidden', 'a box or a line')() });
// Settling a deadline of the record selected, or the deadline selected, as its Paid… or Filed… does, by the words for it:
// the record's own, and those of its relations (its tax years).
Shell.register('find', { items: () => {
  const id = theOne();
  if (!id || App.readOnly.peek()) return [];
  const own = within(objectOf(id)), at = [...own, ...own.flatMap(x => relationsAt(x)).flatMap(within)];
  const dates = recs()[id].field === 'date' ? [id] : [...new Set(at)].filter(x => recs()[x]?.field === 'date' && fx(x));
  const whose = x => recs()[recs()[x].at]?.args ? ` · ${segment(recs()[x].at)}` : '';
  return dates.map(x => [x, settling(x)]).filter(([, s]) => s).map(([x, s]) => ({ label: `${s.label} ${recs()[x].edge}, ${short(recs()[x].value)}${whose(x)}`, detail: 'Action',
    names: ['Mark paid', 'Paid', 'Pay', 'Mark filed', 'Filed', 'File', 'Renewed', 'Renew', 'Affirmed', 'Settle'], run: s.run }));
} });
// A field of the record selected, by its name ("file number"), where the panel has it, on a chart: one it has, at its value;
// one it hasn't, begun as Add begins it. (In a table, its column says it: Table.)
Shell.register('find', { items: q => {
  const id = theOne();
  if (!q || !id || viewShown()?.layout !== 'chart') return [];
  const o = objectOf(id), name = shortOf(o), inside = within(o), r = recs(), label = edge => ({ of: '§fields', label: `${name} › ${edge}`, names: [edge], detail: 'Field' });
  return [...inside.filter(x => x !== o && r[x].edge && !T.same(r[x].edge, 'Name')).map(x => ({ ...label(r[x].edge), run: () => { aim.value = x; select([o]); } })),
    // (Where it has its row already, blank, the keys go there, rather than to a second one begun.)
    ...(App.readOnly.peek() ? [] : inside.flatMap(at => unentered(at).filter(s => !('tag' in s.out)).map(s => ({ ...label(s.args[0].edge), run: () => { if (slots(at).some(x => !x.id && T.same(x.edge, s.args[0].edge))) { aim.value = `${at}|${s.args[0].edge}`; select([o]); return; } select([o]); draft.value = { at, type: 'field' in s.out ? 'field' : 'choice', edge: s.args[0].edge, ...kindAt(tree(at), s.args[0].edge) }; } }))))];
} });
// Add to each of the selected record's lists, by the word for one of it ("Add owner"), as its + does: Find opens its search.
const one = w => w.replace(/ies$/, 'y').replace(/(?<!s)s$/, '');
Shell.register('find', { items: () => {
  const id = theOne();
  if (!id || App.readOnly.peek() || !(recs()[id].kind || recs()[id].args)) return [];
  const has = relatives(id).lists;
  return [...has.filter(([, items]) => !items[0].rest.length && !items.every(it => fx(it.rid))).map(([list]) => ({ label: `Add to ${list}…`, detail: 'Action',
    names: [`Add ${one(list).toLowerCase()}`, `New ${one(list).toLowerCase()}`], run: () => {
      aim.value = 'list:' + list;
      // Once Find has closed and the list is open, brought into view, its + pressed.
      setTimeout(() => {
        const s = document.querySelector(`.insp [data-key="${CSS.escape('list:' + list)}"]`);
        s?.scrollIntoView({ block: 'start' });
        s?.querySelector('.sect .btn.icon')?.click();
      }, 150);
    } })),
    // A list it has nothing on yet is as much to add to: its Add's search, on that list's who.
    ...(recs()[id].kind ? listsOf(id).filter(l => !has.some(([n]) => T.same(n, l.name))).map(l => ({ label: `Add ${one(l.name).toLowerCase()}…`, detail: 'Action',
      names: [`Add to ${l.name}`, `New ${one(l.name).toLowerCase()}`], run: () => setTimeout(() => addToList(id, l.name)) })) : [])];
} });
// Who's Responsible, for the record selected, or a date's own record: Find asks it by the word for it, as its Add does.
Shell.register('find', { items: () => {
  const id = theOne();
  if (!id || App.readOnly.peek()) return [];
  const at = recs()[id].field === 'date' ? recs()[id].at : id, l = recs()[at] && listsOf(at).find(x => T.same(x.name, 'Responsible'));
  if (!l) return [];
  const by = App.responsible(at);
  return [{ label: `Responsible…${by ? ` ${by.name}` : ''}`, detail: 'Action', names: ['Who’s responsible', 'On the hook', 'Add responsible', 'Owner of this date'], run: () => { const b = document.querySelector('.insp .addrow .add-entry') ?? document.querySelector('.titlebar .find'); menu(b, q => whoFor(at, l, q), { search: true }); } }];
} });
// Each list a formula gives the selected record, as a table with why each holds; and all of what each relation a formula
// gives holds, where no such list of the record's goes by its name.
Shell.register('find', { items: () => {
  if (!asTable()) return [];
  const id = theOne(), st = recs(), N = App.notes.peek(), opened = (list, rid, at) => ({ label: `Open ${list} as a table`, detail: 'Action', names: [`${list} table`, 'As a table', `Why ${list}`], run: () => Table.openList(list, rid, at) });
  const mine = id && st[id].kind ? relatives(id).lists.filter(([, items]) => items.every(it => fx(it.rid))).map(([list, items]) => opened(list, items[0].rid, id)) : [];
  const given = new Set(N.notes('Formula').filter(n => n.pattern.args?.length > 1).map(n => T.norm(N.name(n.pattern)))), told = new Set(mine.map(x => x.label));
  return [...mine, ...App.layouts.peek().relations.filter(l => given.has(T.norm(l.name))).flatMap(l => { const rid = Object.keys(st).find(x => st[x].args?.length > 1 && T.fits(st, x, l.rows)), it = rid && opened(T.plural(l.name), rid); return it && !told.has(it.label) ? [it] : []; })];
} });
// Find reaches every record by its name, and every list of relatives by whose it is (AIV-1 › Signatories). They're the
// same while the state and the notes stand, so they're found once, not at each key typed; and found ahead, an object
// at a time, while the window is idle after either changes, so the first key typed in Find finds at once.
let findable = null;
function* finding(st, n, out) {
  for (const ids of T.index(st).kinds.values()) for (const id of ids) if (!T.isView(st[id])) {
    out.push({ key: id, label: n.nameOf(st, id), names: [n.shortOf(st, id)].filter(s => s && s !== n.nameOf(st, id)), detail: st[id].kind, run: () => select([id]) });
    for (const [list] of relatives(id).lists) out.push({ of: id, label: `${n.shortOf(st, id)} › ${list}`, detail: 'List', run: () => { aim.value = 'list:' + list; select([id]); } });
    yield;
  }
}
function findableNow() {
  const st = App.state.peek(), n = App.notes.peek();
  if (findable?.st !== st || findable.n !== n) { const out = []; findable = { st, n, out, steps: finding(st, n, out) }; }
  return findable;
}
Shell.register('find', { items: () => { const f = findableNow(); while (!f.steps.next().done); return f.out; } });
// And what the chart has only on another day: what's to come, and what's ended, said so, each gone to as any is, its panel saying when.
let away = null;
Shell.register('find', { items: () => {
  const c = App.chart.peek(), wb = App.shown.peek(), st = App.state.peek(), day = App.day.peek(), version = App.version.peek();
  if (away?.version === version && away.c === c && away.day === day) return away.out;
  const out = new Map();
  for (const r of wb.rows(c)) if (r.kind && r.kind !== 'View' && !st[r.record] && !out.has(r.record)) {
    const on = App.heldFrom(r.record, day), off = on ? null : App.heldUntil(r.record, day), then = (on ?? off?.last) && wb.asOf(c, on ?? off.last);
    out.set(r.record, then?.[r.record] ? { key: r.record, label: N().nameOf(then, r.record), detail: `${r.kind}, ${on ? 'from' : 'ended'} ${short(on ?? off.day)}`, run: () => select([r.record]) } : null);
  }
  away = { version, c, day, out: [...out.values()].filter(Boolean) };
  return away.out;
} });
let warming = false;
preactSignals.effect(() => {
  App.state.value; App.notes.value;
  if (warming || typeof requestIdleCallback !== 'function') return;
  warming = true;
  requestIdleCallback(function step(idle) {
    const f = findableNow();
    while (idle.timeRemaining() > 4) if (f.steps.next().done) { warming = false; return; }
    requestIdleCallback(step);
  });
});
// The two-box panel asked for (a handle dropped on a box, a box made from one, Relate…) is seen, the panel brought back if
// it was put away.
// (By the keys, they go with it, to the first tick or the first thing to fill: the two are chosen so as to say how. The tour teaches the way there itself.)
on('relate-open', d => { Shell.showPanel?.(); select(d); if (Shell.usingKeys.peek() && !document.querySelector('.tour-card')) setTimeout(() => document.querySelector('.insp[data-tour="pair"] .relate .rr :is(button.tag, button.sel, input)')?.focus()); });
// A relation just added offers its entries while its two boxes stay selected.
on('select', () => { fresh.value = null; if (ticked.peek().size) ticked.value = new Set(); if (offered.peek().length) offered.value = []; });
// A definition opened from the formula bar widens the inspector, since its statute set out wide is what the
// bar was asked for.
on('select', keys => { const p = keys.length === 1 && Shell.pattern(keys[0]); if (p && document.activeElement?.closest('.formulabar') && N().resolve('Formula', p)) Shell.widen(); });
// A link pasted with an object or a relation selected, not into a box, links a document to it.
document.addEventListener('paste', e => {
  const text = T.clean(e.clipboardData?.getData('text/plain')), sel = Shell.selection.peek(), r = sel.length === 1 && recs()[sel[0]];
  const id = r && (r.args ? sel[0] : objectOf(sel[0]));
  if (e.defaultPrevented || !id || !(recs()[id]?.kind || recs()[id]?.args) || !T.isAddress(text) || e.target.closest?.('input, textarea, [contenteditable]')) return;
  e.preventDefault();
  link(id, text);
});

// What settles a deadline, as a menu item, for the Dates table's right-click (settling); and a style's swatch, for the format bar's list of what a house style holds.
return { settling, Swatch };
})();
