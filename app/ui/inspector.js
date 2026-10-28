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
function optionsOf(specs) {
  const p = specs[0] && T.bare(specs[0]), rank = o => N().optionOrder({ out: { choice: o }, args: p.args }) ?? Infinity;
  return [...new Set(specs.filter(s => 'choice' in s.out).map(s => s.out.choice))].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}
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
  const errors = App.computed.value.errors.map(e => [e, placeOf(e)]).filter(([, p]) => p?.edge && p.at === at && !entryNamed(at, p.edge)).map(([e, p]) => slot(p.edge, { error: e }));
  const blanks = blanksAt(at).filter(b => !errors.some(e => T.same(e.edge, b.edge))).map(b => slot(b.edge, { ...b, blank: true }));
  const open = all ? unentered(at).map(s => s.args[0].edge).filter(e => ![...errors, ...blanks].some(x => T.same(x.edge, e))).map(edge => slot(edge, { at, open: true })).filter(x => !N().check(x.t)) : [];
  const out = [...ents.filter(e => !(own && e.pinned)), ...errors, ...blanks, ...open].map(x => ({ ...x, o: x.pinned ? -1 : N().order(x.t) ?? Infinity, p: placed(at, x) }))
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
    const name = N().listName(t, first.edge);
    (lists.get(name) ?? lists.set(name, []).get(name)).push(item);
  }
  // Each by its short name, read once.
  const shorts = new Map(), named = o => shorts.get(o) ?? shorts.set(o, shortOf(o)).get(o), by = (a, b) => named(a.obj).localeCompare(named(b.obj));
  return { lists: [...lists].sort(([a], [b]) => a.localeCompare(b)).map(([name, items]) => [name, items.sort(by)]), docs: docs.sort(by), nots: nots.sort(by) };
}

// Rows that disagree, by the record each is of: both answers, each with who gave it.
const disagreeing = computed(() => {
  const m = new Map();
  App.version.value;
  for (const g of App.shown.value.disagreements(App.chart.value)) for (const x of g.rows) if (x.row.record) m.set(x.row.record, g);
  return m;
});

// ---- Changing: each edit one change, through App.change ----
// A record, or a blank one, with another output. Typing over a computed record enters it; clearing an
// entered one removes it, and lets a formula stand.
const entered = id => !!id && !!recs()[id] && !recs()[id].computed;
const withOut = (id, slot, out) => { const r = recs()[id] ?? slot; return { ...(r.args ? { args: r.args } : { at: r.at, edge: r.edge }), ...out }; };
// A record to add, at what it's at entered: an entry is only ever at a record the timeline holds, so one a
// formula gives is entered as it stands, with what it's at (a tax year owed, entered with its payment).
function enterAt(tx, r) {
  const enter = id => { if (!fx(id)) return id; const { computed: _, ...x } = recs()[id]; return tx.add('record', enterAt(tx, x)); };
  return r.args ? { ...r, args: r.args.map(a => ({ ...a, at: enter(a.at) })) } : r.at ? { ...r, at: enter(r.at) } : r;
}
function putting(tx, id, slot, out) {
  if (!out) return entered(id) && tx.remove(id);
  if (entered(id)) tx.set(id, withOut(id, slot, out)); else tx.add('record', enterAt(tx, withOut(id, slot, out)));
}
// A start or an end entry typed past the day shown takes what it's at out of the chart then, and all that's at that:
// the redline strikes it, and the toast says why (App.change).
const put = (id, slot, out) => App.change(tx => putting(tx, id, slot, out));
// What it would change, as the formula bar redlines it: the records it would leave, as it would leave them.
const putChange = (id, slot, out) => App.would(tx => putting(tx, id, slot, out));
const flipped = id => ({ tag: !(recs()[id]?.tag ?? false) });
const flip = (id, slot) => put(id, slot, flipped(id));
// Deleting, as every deletion is made: redlined first, the bar asking until when where a record ends on a day
// (App.deleting), Enter making it. A relation by its place, an entry by where it is.
const said = id => { const r = recs()[id]; return r.args ? `${nameOf(id)}: ${segment(id)}` : r.edge !== undefined ? `${r.edge} of ${N().whereOf(recs(), r)}` : nameOf(id); };
const remove = (id, o = {}) => App.deleting([id], said(id), { source: 'inspector', ...o });
// A deletion pending of a record, as its redline shows it here as on the chart: the end entry it gives it, in blue, and
// the record struck where it goes as of the day shown.
const deletion = id => { const p = App.pending.value; return p?.verb === 'Delete' && p.chart === App.chart.value && p.needs?.includes(id) ? p : null; };
const ending = (id, edge) => { const p = deletion(id); return p && typeof p.word === 'string' && p.day && T.same(p.word, edge) ? p.day : null; };
// Struck wherever a change pending takes it away as of the day shown: deleted, or transferred whole.
const goes = id => { const p = App.pending.value, red = FormulaBar.pending.value; return p?.chart === App.chart.value && red?.from === 'pending' && !!recs()[id] && !!red.R2 && !(id in red.R2.records); };
// Adds an entry, and its specification if the schema hasn't got it.
function addEntry(at, edge, out) {
  const spec = { out: 'field' in out ? { field: out.field } : 'choice' in out ? { choice: out.choice } : { tag: out.tag }, args: [{ edge, loc: T.specOf(tree(at)) }] };
  App.change(tx => { if (!App.schema.value[T.key(spec)]) tx.add('spec', { tree: spec }); tx.add('record', enterAt(tx, { at, edge, ...out })); });
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
  const st = { ...recs(), '': rec }, sides = N().placed(recs(), null, rec.args).map(s => s.join + s.text).join('');
  App.relating(rec, { what: `${N().nameOf(st, '')}: ${sides}`, source: `relate ${a} ${b}`, relate: { a, b, key, out }, inline: true,
    needs: rec.args.map(x => x.at).filter(x => !fx(x)), make: tx => tx.add('record', enterAt(tx, rec)), say: c => Time.describe(c), done: () => { fresh.value = { a, b, key }; } });
}

// A name that selects what it names: a button, reached by Tab, set as text. `tip` is said on hover: a
// reason's own words.
const Go = ({ to, cls = '', title, tip, children }) => html`<button class=${'lk ' + cls} title=${title} data-tip=${tip || null} onClick=${() => select([].concat(to))}>${children}</button>`;

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
function Field({ r, datatype, put, preview, fx, over, id, auto, ph, cls = '', title, label, due, children }) {
  const doc = datatype === 'document', shown = r ? T.format(r.field, r.value) : '', raw = r ? (doc ? r.value : shown) : '';
  // What's typed, null while nothing is; kept in a ref too, as a blur can come after the record has gone.
  const [text, setText] = useState(null), [bad, setBad] = useState(false), ref = useRef(), typed = useRef(null), clicked = useRef(false), previewed = useRef(null);
  // What text typed keeps: its output, null where it's cleared, undefined where it doesn't read; false where it's as it was.
  const outOf = t => {
    if (t === null || t === T.clean(raw)) return false;
    const dt = datatype ?? T.classify(t), v = t ? T.parse(dt, t) : null;
    return v === undefined ? undefined : t ? { field: dt, value: v } : null;
  };
  const redline = c => { const k = c ? JSON.stringify(c) : null; if (k !== previewed.current) { previewed.current = k; FormulaBar.preview(c); } };
  const type = t => {
    typed.current = t;
    setText(t);
    if (preview) { const out = t === null ? false : outOf(T.clean(t)); redline(out === false || out === undefined ? null : preview(out)); }
  };
  useLayoutEffect(() => { if (auto) ref.current?.focus(); return () => { if (previewed.current) FormulaBar.preview(null); }; }, []);
  const typing = () => typed.current !== null && T.clean(typed.current) !== T.clean(raw), dirty = text !== null && T.clean(text) !== T.clean(raw);
  // Keeps what's typed, where it reads; false where it doesn't.
  const done = () => {
    const out = outOf(typed.current === null ? null : T.clean(typed.current));
    if (out === false) { type(null); return true; }
    if (out === undefined) { setBad(true); return false; }
    type(null);
    put(out);
    return true;
  };
  const key = e => {
    const el = e.currentTarget, mod = (e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase();
    if (e.key === 'Enter') { e.preventDefault(); const to = onward(el, e.shiftKey ? -1 : 1); if (done()) to?.focus(); }
    // Esc puts back what was typed and keeps the keys here, the value selected, as Excel's keeps its cell; with
    // nothing typed, it leaves for its row, so a key typed next is the window's.
    else if (e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation();
      if (typing() || bad) { type(null); setBad(false); setTimeout(() => el.isConnected && el.select()); }
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
  return html`<label class=${'cellbox' + (title ? ' title' : '') + cls}>${dirty && raw ? html`<s class=${'del' + ((r?.field ?? datatype) === 'date' ? ' date' : '')}>${shown}</s>` : null}<span class=${'hug' + (over ? ' over' : '') + (due && text === null ? ' ' + due : '')}>
    <${Box} ref=${ref} rows=${wrap ? 1 : null} class=${'cell' + ((r?.field ?? datatype) === 'date' ? ' date' : '') + (fx && text === null ? ' fx' : '') + (dirty && T.clean(text) ? ' add' : '') + (bad ? ' bad' : '')}
      value=${text ?? (title ? Scene.bind(shown) : shown)} placeholder=${ph} disabled=${App.readOnly.value} spellcheck=${false} autocomplete="off" aria-invalid=${bad ? 'true' : null}
      aria-label=${label ? label + (due ? `, ${DUE[due]}` : '') : ph} data-tour=${fx ? 'computed' : null} data-fx=${fx ? '' : null}
      onPointerDown=${e => { clicked.current = document.activeElement !== e.currentTarget; }} onMouseUp=${e => { if (clicked.current) e.preventDefault(); clicked.current = false; }}
      onFocus=${e => { const el = e.currentTarget; if (doc) { type(raw); setTimeout(() => el.select()); } else el.select(); if (fx) emit('why-open', id); }}
      onInput=${e => { type(e.target.value); setBad(false); }} onKeyDown=${key} onBlur=${done}
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
function Choice({ r, options, put, fx, over, id, fixed, label, ph, hint, children }) {
  const [typing, setTyping] = useState(false);
  if (typing) return html`<span class="cellbox"><input class="cell" placeholder="New option" aria-label=${label ?? 'New option'} ref=${el => el && !el.dataset.on && (el.dataset.on = 1, el.focus())}
    onKeyDown=${e => { if (e.key === 'Enter') { const t = T.clean(e.target.value); setTyping(false); if (t) put({ choice: t }); } else if (e.key === 'Escape') { e.stopPropagation(); setTyping(false); } }}
    onBlur=${() => setTyping(false)} /></span>`;
  // An option chosen keeps where they are on screen the rows after its own, as the entries it brings come or go (steady).
  const open = e => {
    const at = e.currentTarget;
    if (fx) emit('why-open', id);
    menu(at, [...options.map(o => ({ label: o, checked: !!r && T.same(o, r.choice), run: () => !(r && T.same(o, r.choice)) && steady(at, () => put({ choice: o })) })),
      ...(fixed ? [] : [...(options.length ? ['-'] : []), { label: 'New option', run: () => setTyping(true) }])]);
  };
  return html`<span class="cellbox"><span class=${'hug' + (over ? ' over' : '')}><button class=${'sel dd' + (fx ? ' fx' : '')} disabled=${App.readOnly.value} data-tour=${fx ? 'computed' : null}
    aria-label=${label ? `${label}: ${r?.choice ?? 'none'}` : null} aria-haspopup="menu" onClick=${open}><span class=${r ? null : 'ph'}>${r?.choice ?? ph ?? ''}</span></button></span>${!r && hint && !App.readOnly.value
      ? html`<button class="lk hint" data-tip="From its name" onClick=${e => { const at = e.currentTarget; steady(at, () => put({ choice: hint })); }}>${hint}?</button>` : null}${children}</span>`;
}
// A change made from a row of the panel that brings rows under it or takes them away (an Entity Type's Tax Classification
// and documents) keeps the rows after it where they were on screen, the panel scrolled by what came or went above them,
// so a click meant for the next row (Jurisdiction) lands on it. Where the panel has no room to scroll, it's given some
// at its foot, till another record is shown.
// The row held is set back where it was as the record's panel is next drawn, before it's painted (RecordView), or let go.
let steadying = null;
function steady(el, run) {
  const s = host?.closest('.inspector'), mine = el?.closest('.ent') ?? el?.closest('.row');
  const next = s && mine && [...s.querySelectorAll('.insp .row[data-key]')].find(x => !mine.contains(x) && (mine.compareDocumentPosition(x) & Node.DOCUMENT_POSITION_FOLLOWING));
  const held = steadying = next ? { s, key: next.dataset.key, top: next.getBoundingClientRect().top } : null;
  run();
  setTimeout(() => { if (steadying === held) steadying = null; }, 400);
}
function steadied() {
  const h = steadying, now = h && h.s.querySelector(`.insp .row[data-key="${CSS.escape(h.key)}"]`), by = now ? now.getBoundingClientRect().top - h.top : 0;
  if (!by) return;
  steadying = null;
  const need = h.s.scrollTop + by - (h.s.scrollHeight - h.s.clientHeight);
  if (need > 0) host.style.minHeight = `${h.s.scrollHeight + need}px`;
  h.s.scrollTop += by;
}

// A tag's checkbox: green attested, red ruled out, outlined when computed. Pointed at, or reached by the keys,
// it shows the other state, and the formula bar redlines what switching it would change; a click or Space
// switches it, as a checkbox's do, and Enter goes on, as from any value, so no key meant to move on changes
// it. After a switch nothing is previewed until it's left, so the tag shows what was just done, even remounted
// under it. `to` is what a click leaves (a relation unticked goes, its box empty); `fixed`, the box only says; `still`,
// drawn again as what it began is discarded, it previews nothing till it's left, so it never looks ticked as it goes.
let clicked = false;
function TagBox({ r, flip, fx, over, change, label, to, fixed, still, children }) {
  const [peek, setPeek] = useState(false), [hush, setHush] = useState(!!still), on = r?.tag, show = peek ? (to === undefined ? !(on ?? false) : to) : on;
  // A box that previews nothing (a relation not yet ticked, which its tick begins) leaves the redline to others.
  const hover = p => { if (p && (clicked || hush)) return; setPeek(p); if (change) FormulaBar.preview(p ? change() : null); };
  const leave = () => { clicked = false; setHush(false); if (peek) hover(false); };
  const key = e => { if (e.key !== 'Enter') return; e.preventDefault(); onward(e.currentTarget, e.shiftKey ? -1 : 1)?.focus(); };
  return html`<span class="cellbox"><span class=${'hug' + (over ? ' over' : '')}><button class=${'tag' + (show === true ? ' yes' : show === false ? ' no' : '') + (fx && !peek ? ' fx' : '') + (peek ? ' peek' : '')}
    role="checkbox" aria-checked=${on ? 'true' : 'false'} aria-label=${label && (on === false ? `${label}, ruled out` : label)} disabled=${App.readOnly.value || !!fixed}
    onPointerEnter=${() => hover(true)} onPointerLeave=${leave} onFocus=${e => e.currentTarget.matches(':focus-visible') && hover(true)} onBlur=${leave} onKeyDown=${key}
    onClick=${() => { hover(false); clicked = true; flip(); }} /></span>${children}</span>`;
}

// The record's other values, by time, as a count ("2 earlier"): each goes to the chart as of a day it held.
function Versions({ id }) {
  App.version.value;
  const rows = App.shown.value.item(App.chart.value, id), now = App.day.value, others = rows.filter(v => !Log.validOn(v, now));
  if (!others.length) return null;
  const n = others.length, ahead = others.filter(v => v.since > now).length, say = `${n} ${!ahead ? 'earlier' : ahead === n ? 'later' : 'other'}`;
  const period = v => v.since && v.before ? `${short(v.since)} – ${short(v.before)}` : v.since ? `Since ${short(v.since)}` : v.before ? `Before ${short(v.before)}` : '';
  const day = v => v.since ?? later(v.before, -1);
  return html`<button class="btn ghost ver" aria-label=${`${say} values`} onClick=${e => menu(e.currentTarget, rows.map(v => ({
    label: T.outputText(v), detail: period(v), checked: Log.validOn(v, now), run: () => Shell.at(day(v) === Log.today() ? null : { asOf: day(v) }) })), { placement: 'bottom-end' })}>${say}</button>`;
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
  let made = slot.id, said = null;
  const write = tx => {
    const paid = Formulas.pay?.({ tx, R: App.computed.peek(), N: N(), due, day: value, add: r => (made = tx.add('record', enterAt(tx, r))) });
    if (paid) { said = typeof paid === 'string' ? paid : null; return; }
    if (slot.id) tx.set(slot.id, rec); else made = tx.add('record', enterAt(tx, rec));
  };
  useLayoutEffect(() => { FormulaBar.preview(rec ? App.would(write, { dated: value }) : null); }, [value]);
  const was = recs()[due], p = FormulaBar.pending.value, next = p ? nextDue(p.R2.records, due) : undefined;
  const keep = () => {
    if (!rec) return;
    close();
    const sel = Shell.selection.peek(), at = was.at;
    if (!App.change(write, { dated: value, say: c => said ?? Time.describe(c) })) return;
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

// A record's output, or a blank one's, in place: typed, chosen or ticked; named `label`.
function Output({ id, slot, label }) {
  // An error where the value would be: what it needs, in words ("Needs Fiscal Year End"), its code on hover;
  // with no words, its code, in red. Clicked, the bar says why.
  if (slot?.error) { const { code, msg } = slot.error.error, say = msg?.replace(/\.$/, '');
    return html`<button class=${'errv' + (say ? '' : ' err')} data-tip=${say ? code : null} aria-label=${say ? `${say} (${code})` : null} onClick=${() => emit('why-open', slot.error.id)}>${say || code}</button>`; }
  const g = id && disagreeing.value.get(id);
  if (g) return html`<${Answers} g=${g} />`;
  const r = id ? recs()[id] : null, f = !!id && fx(id), o = !!id && overrides(id);
  const k = r ? null : slot.type ? slot : kindAt(tree(slot.at), slot.edge);
  const type = r ? T.typeOf(r) : k.type, set = out => put(id, slot, out);
  const more = !r ? null : !f ? html`<${Versions} id=${id} />` : r.field === 'date' ? html`<${Filed} id=${id} />` : null;
  return type === 'tag' ? html`<${TagBox} r=${r} fx=${f} over=${o} label=${label} flip=${() => flip(id, slot)} change=${() => putChange(id, slot, flipped(id))}>${more}</${TagBox}>`
    : type === 'choice' ? html`<${Choice} r=${r} id=${id} fx=${f} over=${o} put=${set} label=${label} options=${r ? (r.args ? slot.options ?? [] : kindAt(tree(r.at), r.edge).options) : k.options ?? []}
        hint=${!r && recs()[slot.at]?.kind ? namedOption(nameOf(slot.at), k.options ?? []) : null}>${more}</${Choice}>`
    : html`<${Field} r=${r} id=${id} fx=${f} over=${o} put=${set} preview=${out => putChange(id, slot, out)} label=${label} due=${id && dueOf(id)} datatype=${r?.field ?? k.datatype} auto=${!r && slot.auto}>${more}</${Field}>`;
}

// ---- The record's entries, as a tree ----
function entryMenu(anchor, id) {
  const r = recs()[id], f = fx(id);
  menu(anchor, [
    { label: `All ${T.plural(r.edge)}`, keys: 'Alt+Click', run: () => select([general(patternOf(id))]) },
    ...(f || App.readOnly.peek() ? [] : [{ label: 'Rename', run: () => { renaming.value = id; } }, ...(recs()[r.at]?.at ? [{ label: 'Move up a level', run: () => moveUp(id) }] : [])]),
    ...('field' in r || App.readOnly.peek() ? [] : [{ label: 'Add', items: addItems(id, anchor) }]),
    ...(f || App.readOnly.peek() ? [] : ['-', { label: 'Delete', danger: true, run: () => remove(id) }]),
  ]);
}
function addItems(at, anchor) {
  const t = tree(at), start = (type, edge) => () => { draft.value = { at, type, ...(edge && { edge, ...kindAt(t, edge) }) }; };
  const items = unentered(at).sort((a, b) => a.args[0].edge.localeCompare(b.args[0].edge)).map(s => ({ label: s.args[0].edge, detail: typeName(s),
    run: 'tag' in s.out ? () => addEntry(at, s.args[0].edge, { tag: true }) : start('field' in s.out ? 'field' : 'choice', s.args[0].edge) }));
  const others = () => [...T.index(recs()).kinds].flatMap(([, ids]) => ids).filter(x => !T.isView(recs()[x]) && x !== objectOf(at))
    .map(x => ({ label: nameOf(x), detail: recs()[x].kind, run: () => select([at, x]) })).sort((a, b) => a.label.localeCompare(b.label));
  const lists = recs()[at].kind ? listItems(at, anchor) : [];
  return [...(lists.length ? [...lists, '-'] : []), ...items, ...(items.length ? ['-'] : []), { label: 'Value', run: start('field') }, { label: 'Tag', run: start('tag') }, { label: 'Choice', run: start('choice') }, '-',
    { label: 'Relation…', run: () => menu(anchor, others(), { search: true }) }, ...(recs()[at].kind && !linkOf(at) ? [{ label: 'Document…', run: () => linkAdd(anchor, at) }] : [])];
}
// The lists of relatives a record's kind can have, by their names (Owners, General Partners, Holdings), as its sections
// name them once it has some: each the relations of the schema, entered not worked out, of two sides, one of which the
// record (or a record in it) fits. → [{ name, ways }]
function listsOf(id) {
  const n = N(), own = within(id), lists = new Map(), S = Object.values(App.schema.value);
  // A document is linked by Document…, not listed here.
  const doc = loc => !!loc.kind && S.some(s => s.out?.field === 'document' && s.args?.length === 1 && T.same(s.args[0].loc.kind ?? '', loc.kind));
  for (const s of S) if (s.args?.length === 2 && ('tag' in s.out || 'choice' in s.out) && !n.resolve('Formula', T.bare(s))) for (const sm of s.args) {
    const sl = s.args.find(a => a !== sm), at = own.find(x => T.narrower(tree(x), sm.loc));
    if (!at || !sl || doc(sl.loc)) continue;
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
  const out = [], seen = new Set(relatives(id).lists.find(([name]) => T.same(name, l.name))?.[1].map(it => it.obj) ?? []), words = T.norm(q ?? '');
  for (const w of l.ways) for (const x of Object.keys(recs())) {
    const b = objectOf(x);
    if (seen.has(b) || b === id || 'field' in recs()[x] || !T.narrower(tree(x), w.sl.loc) || T.isView(recs()[b] ?? {}) || !T.norm(nameOf(b)).includes(words)) continue;
    seen.add(b);
    out.push({ label: nameOf(b), detail: recs()[b].kind, run: () => joinTo(id, b, w, x) });
  }
  out.sort((a, b) => a.label.localeCompare(b.label));
  // The kinds a new one can be, those the chart draws most first, as Insert offers them.
  const drawn = charted() ? Canvas.kinds().map(T.norm) : [], rank = k => { const i = drawn.indexOf(T.norm(k)); return i < 0 ? Infinity : i; };
  const kinds = [...new Map(l.ways.filter(w => w.sl.loc.kind).map(w => [T.norm(w.sl.loc.kind), w])).values()].sort((a, b) => rank(a.sl.loc.kind) - rank(b.sl.loc.kind)), named = T.clean(q ?? '');
  if (named && kinds.length && !out.some(o => T.same(o.label, named))) out.push('-', ...kinds.map(w => ({ label: `New ${w.sl.loc.kind}: ${named}`, run: () => joinTo(id, null, w, null, { kind: w.sl.loc.kind, name: named }) })));
  return out;
}
// Relates a record to another as a list's side, or to a new one (`fresh`, { kind, name }) made with it: a role to choose
// opens the two-box panel; any other is a change pending, as one ticked there is (App.relating), redlined and asked in
// its row of the two-box panel, or, for a new one, in the bar; Enter makes it, the new one with it, as one change.
function joinTo(id, b, w, lb, fresh = null) {
  const make = tx => { const o = tx.add('record', { kind: fresh.kind }); tx.add('record', { at: o, edge: 'Name', field: 'text', value: fresh.name }); return o; };
  if ('choice' in w.s.out) { if (fresh) { let o = null; if (!App.change(tx => { o = make(tx); App.showMade(tx, [o]); })) return; b = o; } return select([id, b]); }
  const rec = other => ({ args: [{ edge: w.sm.edge, at: w.at }, { edge: w.sl.edge, at: other }], tag: true });
  if (!fresh) {
    begin(id, b, [w.sm.edge, w.sl.edge, w.at, lb].join('|').toLowerCase(), { tag: true }, rec(lb));
    return select([id, b]);
  }
  // The new one, related as it's made, is shown on the chart shown, where that would hide it, by the same change. What it
  // asks is asked of a stand-in of its kind.
  const p = T.bare(w.s), first = T.same(N().edges(p)[0], w.sm.edge), what = `${N().name(p)}: ${first ? `${shortOf(id)} → ${fresh.name}` : `${fresh.name} → ${shortOf(id)}`}`;
  const made = tx => { const o = make(tx), r = tx.add('record', enterAt(tx, rec(o))); App.showMade(tx, [o]); return r; };
  App.relating(rec('§new'), { what, source: `list ${id}`, needs: [id], make: made, say: c => Time.describe(c) }, { ...recs(), '§new': { kind: fresh.kind } });
}
// A document linked: picked from SharePoint, where it's set up, or its link typed.
const linkAdd = (anchor, at) => SharePoint.configured() ? menu(anchor, [{ label: 'SharePoint…', run: () => pickLink(at) }, { label: 'Link…', run: () => { linking.value = at; } }]) : (linking.value = at);

function Label({ it, fx }) {
  const r = it.id && recs()[it.id];
  if (r && renaming.value === it.id) return html`<input class="cell" value=${r.edge} ref=${el => el && !el.dataset.on && (el.dataset.on = 1, el.focus(), el.select())}
    onKeyDown=${e => { if (e.key === 'Enter') e.target.blur(); else if (e.key === 'Escape') { e.stopPropagation(); e.target.value = r.edge; e.target.blur(); } }}
    onBlur=${e => { renaming.value = null; rename(it.id, T.clean(e.target.value)); }} />`;
  const click = e => { if (e.altKey && it.id) select([general(patternOf(it.id))]); else if (fx) emit('why-open', it.id); };
  return html`<span class="lbl" onClick=${click} onContextMenu=${e => { if (it.id) { e.preventDefault(); entryMenu({ x: e.clientX, y: e.clientY }, it.id); } }}>
    ${it.edge}${it.blank ? html`<i class="req" aria-label="Required" />` : null}</span>`;
}

// A tag ruled out where its definition's Check note says that's a problem (Ownership Adds Up): an error,
// said in place in red, where any other ruled out is quiet.
const failed = id => N().check(tree(id));
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
  if (!host || !c || App.readOnly.value || it.error) return null;
  App.scene.value; Shell.selection.value;
  const state = () => { const s = Canvas.scope(); return { s, on: s.own ? c.fields.shown(host, it.edge, at) : [...s.marks].every(id => { const x = alikeIn(host, at, id); return !!x && c.fields.shown(id, it.edge, x); }) }; };
  const { s, on } = pointed ?? state();
  const say = ({ s, on }) => `${on ? 'Hide from' : 'Show in'} ${s.own ? (recs()[host]?.args ? 'this line' : 'this box') : Canvas.named(s)}`;
  return html`<button class=${'btn icon onchart' + (on ? ' on' : '')} tabindex="-1" aria-pressed=${on} aria-label=${on ? 'Shown on chart' : 'Show on chart'} data-tip=${say({ s, on })}
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
  const tag = r ? boxed(it.id) : !it.error && kindAt(tree(at), it.edge).type === 'tag', day = ending(at, it.edge), end = day !== r?.value ? day : null;
  const keyMenu = e => { if (r && (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10'))) { e.preventDefault(); entryMenu(e.target, it.id); } };
  // A press on its label takes the keys to the row, so Ctrl+C copies it, and may drag it onto the chart.
  const press = e => { if (e.target.closest('input, textarea, button')) return; const row = e.currentTarget.closest('.row'); row.tabIndex = -1; row.focus({ preventScroll: true }); carry(e, it); };
  const k = html`<div class="k" onPointerDown=${press}><${Label} it=${it} fx=${f} /></div>`, v = end
    ? html`<div class="v redline">${r ? html`<s class="del date">${short(r.value)}</s>` : null}<span class="add date">${short(end)}</span></div>`
    : html`<div class="v ctl"><${Output} id=${it.id} slot=${it} label=${it.edge} /></div>`;
  const light = on => fields()?.light(on ? fieldKey(it, at) : null);
  const grip = e => { const chart = carry(e, it); drag(e, (from, i) => { if (!chart()) reorder(at, moved(sibs(), from, i)); }, g => entryMenu(g, it.id)); };
  return html`<div class="ent" data-drag=${r ? at : null}>
    <div class=${'row' + (tag ? ' chk' : '') + (r?.tag === false ? (failed(it.id) ? ' failed' : ' ruled') : '') + (lit(it, at) ? ' lit' : '')} data-key=${it.id ?? `${at}|${it.edge}`} style=${`--depth:${depth}`}
      onKeyDown=${keyMenu} onPointerEnter=${() => light(true)} onPointerLeave=${() => light(false)} onCopy=${e => copied(e, it, at)}>
      ${r ? html`<button class="grip" tabindex="-1" aria-hidden="true" onPointerDown=${grip}>${GRIP}</button>` : null}
      ${tag ? [v, k] : [k, v]}
      <${OnChart} it=${it} at=${at} />
    </div>
    ${r && !('field' in r) ? html`<${Entries} at=${it.id} depth=${depth + 1} />` : null}
  </div>`;
}

// An entry being added: its name, then its value, option or tick. Esc, or leaving it empty, drops it.
function Draft({ d, depth }) {
  const [edge, setEdge] = useState(d.edge ?? ''), [k, setK] = useState(d), box = useRef();
  const named = () => { const e = T.clean(edge); if (e && !d.edge) setK({ ...d, ...kindAt(tree(d.at), e), type: d.type, datatype: kindAt(tree(d.at), e).datatype }); return e; };
  const finish = out => { const e = named(); if (!e || !out) return; draft.value = null; addEntry(d.at, e, out); };
  // Leaving keeps a named tag, and drops anything else not finished; a dropdown's menu isn't leaving.
  const leave = e => {
    if (!box.current || box.current.contains(e.relatedTarget) || e.relatedTarget?.closest?.('.float')) return;
    if (k.type === 'tag' && T.clean(edge)) finish({ tag: true }); else if (draft.peek() === d) draft.value = null;
  };
  const key = e => { if (e.key === 'Escape') { e.stopPropagation(); draft.value = null; } };
  const nameKey = e => { if (e.key !== 'Enter') return; e.preventDefault(); if (!named()) return; if (k.type === 'tag') finish({ tag: true }); else box.current.querySelector('.v input, .v button')?.focus(); };
  const tag = k.type === 'tag', name = html`<div class="k">${d.edge ? html`<span class="lbl">${d.edge}</span>` : html`<input class="cell" placeholder="Name" aria-label="Name" value=${edge}
      ref=${el => el && !el.dataset.on && (el.dataset.on = 1, el.focus())} onInput=${e => setEdge(e.target.value)} onKeyDown=${nameKey} onBlur=${named} />`}</div>`;
  const value = html`<div class="v ctl">${tag ? html`<span class="cellbox"><button class="tag yes" role="checkbox" aria-checked="true" aria-label=${T.clean(edge) || 'Tag'} onClick=${() => finish({ tag: true })} /></span>`
      : k.type === 'choice' && k.options?.length ? html`<${Choice} options=${k.options} label=${T.clean(edge) || 'Choice'} put=${finish} />`
      : k.type === 'choice' ? html`<span class="cellbox"><input class="cell" placeholder="New option" aria-label="New option" onKeyDown=${e => { const o = T.clean(e.target.value); if (e.key === 'Enter' && o) finish({ choice: o }); }} /></span>`
      : html`<${Field} datatype=${k.datatype ?? null} auto=${!!d.edge} label=${T.clean(edge) || 'Value'} put=${finish} />`}</div>`;
  return html`<div class=${'row draft' + (tag ? ' chk' : '')} ref=${box} style=${`--depth:${depth}`} onFocusOut=${leave} onKeyDown=${key}>${tag ? [value, name] : [name, value]}</div>`;
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
function Section({ title, n, shut = false, act, id, children }) {
  const [open, setOpen] = useState(!shut);
  // Aimed at, as Find aims at a list, it opens.
  if (!open && aim.value === id) setOpen(true);
  return html`<section class=${open ? 'open' : ''} data-key=${id}><h3 class="sect"><button class="fold" aria-expanded=${open} onClick=${() => setOpen(!open)}>${title}</button>
    ${n ? html`<span class="n">${n}</span>` : null}${act}</h3>${open ? children : null}</section>`;
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
  const facts = [...at.filter(([, e]) => e.tag === false).map(([id, e]) => ({ text: `${e.edge}: No`, no: !N().notes('Check').length || failed(id) })),
    ...further(it).map(a => ({ text: `${lower(a.edge)} ${termOf(a.at)}` })),
    ...words.filter(w => !(role && T.same(w, role))).map(text => ({ text })),
    ...at.filter(([id, e]) => 'field' in e && !['text', 'date', 'document'].includes(e.field) && !(fx(id) && e.value === 0)).map(([, e]) => ({ text: value(e) })).filter(f => f.text),
    ...at.filter(([, e]) => e.field === 'date').map(([e, f]) => ({ date: e, text: `${N().isStart(tree(e)) ? 'since' : N().isEnd(tree(e)) ? 'ends' : lower(f.edge)} ${short(f.value)}` }))];
  const ev = relatives(it.rid).docs.find(d => linkOf(d.obj)), why = !role && !facts.length && because(it.rid);
  return { role: role ?? (why ? why.cite : null), tip: why?.words, facts: facts.slice(0, 3),
    doc: ev && { name: nameOf(ev.obj), href: SharePoint.href(recs()[linkOf(ev.obj)].value) } };
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

// A list's + adds to it as Add's list of it does (addTo): who, one the chart has or a new one named.
function Relatives({ id }) {
  const { lists, docs, nots } = relatives(id);
  const add = (e, name) => { const l = listsOf(id).find(x => T.same(x.name, name)); if (l) addTo(e.currentTarget, id, l); };
  // A relative takes two lines: its name and role, then the facts; with no role, the facts take its place.
  // The name is the long thing and the role or figure the short one, set at the right.
  // One the chart shown leaves out, though it draws others of its list, says so, with Show (leftOut).
  const left = new Map(leftHere(id).flatMap(p => p.items.map(it => [it.rid, it.show]))), v = viewShown();
  const item = it => { const f = fx(it.rid), d = detail(it), out = left.get(it.rid);
    return html`<div class="row rel" key=${it.rid}>
      <div class=${'k' + (d.role || d.facts.length || d.doc ? '' : ' wide')}><${Go} to=${it.obj} cls=${f ? 'fx' : ''} title=${nameOf(it.obj)}>${bound(shortOf(it.obj))}</${Go}></div>
      <div class="v">${d.role || d.facts.length ? html`<${Go} to=${it.rid} cls=${f ? 'fx' : ''} tip=${d.tip}>${d.role ?? facts(d.facts, true)}</${Go}>` : null}
        ${d.doc ? html`<a class="btn icon open" href=${d.doc.href} target="_blank" rel="noopener" aria-label=${`Open ${d.doc.name}`} data-tip=${d.doc.name}>${OPEN}</a>` : null}
        ${entriesAt(it.rid).filter(dueOf).map(e => html`<${Filed} key=${e} id=${e} />`)}</div>
      ${d.role && d.facts.length ? html`<div class="facts">${facts(d.facts)}</div>` : null}
      ${out ? html`<div class="facts here">Not shown here${App.readOnly.value ? null : html` · <button class="lk" onClick=${() => showHere(out, v)}>Show</button>`}</div>` : null}</div>`; };
  // A document by its name, its first choice and date beneath, and a way to open it.
  const docRow = it => { const l = recs()[linkOf(it.obj)], s = slots(it.obj).filter(x => x.id).map(x => recs()[x.id]);
    const sub = [s.find(x => 'choice' in x)?.choice, s.find(x => x.field === 'date')].filter(Boolean).map(x => x.value ? short(x.value) : x);
    return html`<div class="doc" key=${it.rid}><${Go} to=${it.obj}>${bound(nameOf(it.obj))}</${Go}>
      ${l ? html`<a class="btn icon open" href=${SharePoint.href(l.value)} target="_blank" rel="noopener" aria-label="Open" data-tip="Open">${OPEN}</a>` : null}
      ${sub.length ? html`<span class="meta">${sub.join(' · ')}</span>` : null}</div>`; };
  // Lists someone entered first; those a formula gave, folded, after; then documents, once there are any; and
  // last, quieter, what's ruled out, each with its reason's words on hover.
  const worked = items => items.every(it => fx(it.rid)), typing = linking.value === id;
  const held = lists.flatMap(([, items]) => items);
  return html`${[...lists.filter(([, x]) => !worked(x)), ...lists.filter(([, x]) => worked(x))].map(([name, items]) => html`<${Section} key=${name} id=${'list:' + name} title=${name} n=${items.length}
      shut=${worked(items)} act=${items[0].rest.length || worked(items) ? null : plus(`Add to ${name}`, e => add(e, name))}>${items.map(item)}</${Section}>`)}
    ${docs.length || typing ? html`<${Section} title="Documents" n=${docs.length} act=${recs()[id].kind ? plus('Link a document', e => linkAdd(e.currentTarget, id)) : null}>
      ${docs.map(docRow)}
      ${typing ? html`<div class="row"><div class="k wide"><input class="cell" placeholder="Link" aria-label="Link" ref=${el => el && !el.dataset.on && (el.dataset.on = 1, el.focus())}
        onKeyDown=${e => { if (e.key === 'Enter') { const u = T.clean(e.target.value); if (T.isAddress(u)) { linking.value = null; link(id, u); } else e.target.setAttribute('aria-invalid', 'true'); } else if (e.key === 'Escape') { e.stopPropagation(); linking.value = null; } }}
        onBlur=${() => { linking.value = null; }} /></div></div>` : null}</${Section}>` : null}
    ${nots.length ? html`<div class="nots">${nots.map(it => html`<div class="row" key=${it.rid}><div class="k wide"><${Go} to=${it.rid} tip=${because(it.rid)?.words}>${notText(it, held)}</${Go}></div></div>`)}</div>` : null}`;
}

// Look: each format property set for a mark and its value, under where it comes from, said once, as an
// entry's entries sit under it; shown once there is one. A color goes by PowerPoint's name for it, a code
// only for one of the user's own; a size or a weight is the slide's, as the format bar has it, a size to the
// half point and a weight as PowerPoint gives it. Format is what a mark's own text shows, as the scene sets it:
// a box's and a tag's is its name, whatever the format, unless it's none, so there it says whether the name is
// shown; what's recorded at it (a line's percentage) is a text of its own, so a line can hide its name and
// still draw its 64%.
const TEXTS = { value: 'Value', label: 'Name and value', paren: 'Value in parentheses', none: 'None' };
const labelOf = (label, named) => label !== 'Format' ? label : named ? 'Name' : 'Text';
const colorName = v => (typeof FormatBar !== 'undefined' && FormatBar.colorName?.(v)) || v.toUpperCase();
const val = (label, v, named) => typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v) ? html`<i class="chip" style=${`background:${v}`} />${colorName(v)}`
  : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : label === 'Size' ? `${Math.round(Scene.toSlide(App.scene.value?.page, v) * 2) / 2} pt`
  : label === 'Weight' ? `${+Scene.toSlide(App.scene.value?.page, v).toFixed(2)} pt`
  : label === 'Format' ? (named ? (v === 'none' ? 'Hidden' : 'Shown') : TEXTS[v] ?? upper(String(v)))
  : label === 'Shape' ? SHAPES[v] ?? upper(String(v)) : upper(String(v));
function LookSection({ look, reset, named }) {
  if (!look.length) return null;
  const from = [...new Set(look.map(x => x.from))];
  return html`<${Section} title="Look" act=${reset}>${from.map(f => html`
    ${f ? html`<div class="row src" key=${f}><div class="k wide">${f}</div></div>` : null}
    ${look.filter(x => x.from === f).map(x => html`<div class="row" key=${x.label} style=${`--depth:${f ? 1 : 0}`}><div class="k">${labelOf(x.label, named)}</div><div class="v">${val(x.label, x.value, named)}</div></div>`)}`)}</${Section}>`;
}
// A place on the page, as entered, in points on the slide (the page is drawn smaller to fit it, by its
// scale, and moves a chart placed only as far as holds it, by its offset), so the numbers are the ones PowerPoint shows:
// typed over to move it. `at` is in the chart's own terms, as a place is written: a box's Position, or a free shape
// drawn, less the offset.
const PLACES = [['Left', 'x'], ['Top', 'y'], ['Width', 'w'], ['Height', 'h']];
const Place = ({ at, put, reset, keys = 'xyw' }) => { const page = App.scene.value?.page, off = k => page?.offset?.[k] ?? 0;
  return html`<${Section} title="Position" act=${reset}>
  ${PLACES.filter(([, k]) => keys.includes(k) && at[k] != null).map(([label, k]) => html`<div class="row" key=${k}><div class="k">${label}</div><div class="v ctl">
    <${Field} r=${{ field: 'number', value: Math.round(Scene.toSlide(page, (at[k] + off(k)) / Scene.PT)) }} datatype="number" label=${label}
      put=${out => out && put(k, Math.round((Scene.fromSlide(page, out.value) * Scene.PT - off(k)) * 2) / 2)}><span class="unit">pt</span></${Field}></div></div>`)}</${Section}>`; };
// Reset takes away what's entered for this mark alone, and says what, as History says it.
const resetting = (own, labels) => App.readOnly.value || !own.some(x => labels(x.label)) ? null
  : html`<button class="btn ghost reset" onClick=${() => App.change(tx => own.filter(x => labels(x.label)).forEach(x => tx.remove(x.note)), { say: c => Time.describe(c), dated: false })}>Reset</button>`;

// A record's look, as the view's scene has it: each property a note decides, from this box (or line) alone, a
// style's output (by its caption, the style's name first where the caption doesn't say it), or the chart's
// default, in that order; and its place, where one is entered, as it's drawn (one made loosely goes beside its
// relatives once related, and reads where it is).
function Look({ id }) {
  const sc = App.scene.value, v = sc.view, t = tree(id), n = N(), entered = recs()[id].kind ? n.position(t, v) : null, drawn = entered && sc.byId.get(id);
  const pos = drawn ? { x: drawn.x - sc.page.offset.x, y: drawn.y - sc.page.offset.y, w: drawn.w, ...(entered.h != null && { h: drawn.h }) } : entered;
  // This mark's own: a box's at its object, a line's at its relation's own tree, as the format bar notes them.
  const mine = x => x.pattern.id === id || (!!recs()[id].args && T.key(T.bare(x.pattern)) === T.key(T.bare(t)));
  const rank = x => mine(x) ? 0 : x.view ? 1 : 2;
  const from = x => mine(x) ? (recs()[id].args ? 'This line' : 'This box') : !x.view ? 'Default'
    : (s => { const c = Scene.captionOf(n, x.pattern, v); return T.norm(c).startsWith(T.norm(s)) ? c : `${s}: ${c}`; })(Scene.styleName(n, T.bare(x.pattern)));
  const look = Object.entries(sc.byId.get(id)?.settings ?? {}).filter(([label, s]) => s?.note && label !== 'Shown' && label !== 'Position')
    .map(([label, s]) => ({ label, value: s.value, from: from(s.note), rank: rank(s.note) })).sort((a, b) => a.rank - b.rank);
  const own = [...Object.values(n.formats(t, v)).map(r => r.note), n.resolve('Position', t, v)?.note].filter(x => x && x.view === v && mine(x));
  const move = (k, x) => App.change(tx => tx.note('Position', t, { ...pos, [k]: x }, { view: v }), { dated: false });
  return html`<${LookSection} look=${look} named=${'tag' in recs()[id] || !!recs()[id].kind} reset=${resetting(own, l => l !== 'Position')} />
    ${pos ? html`<${Place} at=${pos} put=${move} reset=${resetting(own, l => l === 'Position')} />` : null}`;
}

// ---- The views of a selection ----
// A header: its eyebrow, where it says more than the title does, and the title, or `children` in its place.
// `more`, what can be done with what's shown, as its box's or row's right-click offers it: behind ⋯ at the top right.
function Head({ path = [], title, more, children }) {
  const said = path.length && !(path.length === 1 && T.same(path[0].label, title));
  return html`<header class="ih">
    ${said ? html`<nav class="path">${path.map(p => p.go ? html`<button class="lk" data-tip=${p.tip ?? null} onClick=${p.go}>${p.label}</button>` : html`<span>${p.label}</span>`)}</nav>` : null}
    ${more ? html`<button class="btn icon more" aria-label="More" data-tip="More" aria-haspopup="menu" onClick=${e => menu(e.currentTarget, more(), { placement: 'bottom-end' })}>${icon('more')}</button>` : null}
    ${children ?? html`<h2 class="ih-title">${title}</h2>`}</header>`;
}
// What can be done with a record from its panel: what its box's or line's right-click has that isn't the chart's own
// arranging, in sections, none empty: where to see more of it (its table, every box of its option, its History); hiding
// or showing it in this view; and changing what it records (a relation's Transfer…, Delete…).
function moreOf(id) {
  const r = recs()[id], v = viewShown(), chart = v?.layout === 'chart', drawn = chart && App.scene.value?.byId.has(id), first = r.kind && slots(id).find(s => s.id && 'choice' in recs()[s.id]);
  const hide = () => App.change(tx => tx.note('Shown', tree(id), false, { view: v.id }), { say: ch => Time.describe(ch) }), still = App.readOnly.value;
  const sections = [
    [...(r.kind ? [{ label: `Open in ${T.plural(r.kind)}`, run: () => kindTable(id) }] : []),
      ...(first ? [{ label: `Select every ${recs()[first.id].choice}`, disabled: !chart, run: () => alike(first.id) }] : []),
      { label: 'History', run: () => { select([id]); Time.open('all'); } }],
    chart && (r.kind || r.args) ? [drawn ? { label: 'Hide in this view', disabled: still, run: hide }
      : hiddenNote(id, v.id) ? { label: 'Show in this view', disabled: still, run: () => showHere([id], v) } : null].filter(Boolean) : [],
    [...(App.transferable(id) ? [{ label: 'Transfer…', disabled: still, run: () => App.transferring(id) }] : []),
      { label: `${App.deleteVerb([id])}…`, danger: true, disabled: still, run: () => remove(id, { auto: true, inline: true }) }],
  ];
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
function alike(id) {
  const r = recs()[id], sc = App.scene.peek(), ids = !sc ? [] : Object.keys(recs()).filter(x => recs()[x].at && T.same(recs()[x].edge, r.edge) && T.same(recs()[x].choice ?? '', r.choice) && sc.byId.get(recs()[x].at)?.type === 'box').map(x => recs()[x].at);
  if (ids.length) select([...new Set(ids)]); else select([id]);
}
// Add: what a record (at `at`), or a panel's own `items`, can have that it hasn't; `also`, another quiet action beside it.
const AddRow = ({ at, items = anchor => addItems(at, anchor), also = null }) => App.readOnly.value ? null
  : html`<div class="row addrow"><div class="k wide"><button class="btn ghost add-entry" onClick=${e => menu(e.currentTarget, items(e.currentTarget), { search: true })}>${icon('plus')}Add</button>${also}</div></div>`;

function RecordView({ id }) {
  const r = recs()[id];
  useLayoutEffect(steadied);
  useLayoutEffect(() => {
    const a = aim.peek();
    if (!a) return;
    aim.value = null;
    aimed = Shell.selection.peek().join();
    // A due date is aimed at to be filed, so its Filed… takes the focus; anything else, its value.
    const el = document.querySelector(`.insp [data-key="${CSS.escape(a)}"]`);
    el?.scrollIntoView({ block: 'center' });
    (el?.querySelector('.filed') ?? el?.querySelector('input, textarea, button.sel, button.tag, .errv'))?.focus();
  });
  // Not there on the day shown, it says so, and where it starts later, when, by its start entry's act ("Formed Jan 15,
  // 2027"), or From that day, with a way to the chart then; gone, it's nothing.
  if (!r) return html`<${LaterView} id=${id} />`;
  const path = T.pathOf(recs(), id), first = slots(id).find(s => s.id && 'choice' in recs()[s.id]), name = r.kind ? null : nameOf(id);
  // An object's title is its Name, typed over (cleared, it stays); a relation's or an entry's is what it is,
  // with its tag's box before it, as the formula bar has it.
  const head = r.kind
    ? html`<${Head} more=${() => moreOf(id)} path=${[{ label: r.kind, go: () => kindTable(id), tip: `Open ${T.plural(r.kind)}` }, ...(first ? [{ label: recs()[first.id].choice, go: () => alike(first.id), tip: `Select every ${recs()[first.id].choice}` }] : [])]}>
        <${Field} r=${recs()[entryNamed(id, 'Name')]} datatype="text" ph="Name" title put=${out => out && put(entryNamed(id, 'Name'), { at: id, edge: 'Name' }, out)}
          preview=${out => out && putChange(entryNamed(id, 'Name'), { at: id, edge: 'Name' }, out)} /></${Head}>`
    : html`<${Head} title=${name} more=${r.args ? () => moreOf(id) : null} path=${r.args ? [] : path.slice(0, -1).map(x => ({ label: segment(x), go: () => select([x]) }))}>
        ${boxed(id) ? html`<h2 class="ih-title ih-tag" data-key=${id}><${Output} id=${id} slot=${r} label=${name} /><span class="nm">${name}</span></h2>` : null}</${Head}>`;
  const sides = r.args ? N().sides(recs(), id) : [];
  // A deletion or a transfer of it pending is asked here too, atop its panel, as in the bar; a relation that can be
  // transferred says so quietly beside Add, as its line's menus do.
  const p = App.pending.value, here = p?.chart === App.chart.value && (p.transfer?.rid === id || (p.verb === 'Delete' && p.needs?.length === 1 && p.needs[0] === id)) ? p : null;
  const moving = !here && !App.readOnly.value && r.args && App.transferable(id)
    ? html`<button class="btn ghost add-entry" onClick=${() => App.transferring(id)}>${icon('ArrowRightLeft')}Transfer…</button>` : null;
  // A record whose period ends after the day shown (deleted, or transferred, from a later day) says the day it ends on,
  // the first it no longer holds, a link to the chart then.
  const ends = App.shown.value.item(App.chart.value, id).find(v => Log.validOn(v, App.day.value))?.before;
  return html`<div class=${'insp' + (goes(id) ? ' going' : '')}>${head}
    ${here ? html`<${App.Asking} key=${here.n} p=${here} />` : null}
    <div class="rows">
      ${sides.map(a => { const way = trail(a.at);
        return html`<div class="row" key=${a.edge}><div class="k">${a.edge}</div><div class="v"><${Go} to=${objectOf(a.at)}>${bound(nameOf(objectOf(a.at)))}</${Go}>
        ${way ? html`<span class="muted"> › ${way}</span>` : null}</div></div>`; })}
      ${ends ? html`<div class="row ends" key="ends"><div class="k">Ends on</div><div class="v"><button class="lk" onClick=${() => Shell.at({ asOf: ends })}>${T.formatDate(ends)}</button></div></div>` : null}
      ${r.kind || boxed(id) ? null : html`<div class="row" data-key=${id}><div class="k"><span class="lbl">${name}</span></div>
        <div class="v ctl"><${Output} id=${id} slot=${r} label=${name} /></div></div>`}
      ${'field' in r ? null : html`<${Entries} at=${id} depth=${0} /><${AddRow} at=${id} also=${moving} />`}
    </div>
    <${Relatives} id=${id} />
    <${HiddenHere} id=${id} />
    ${(r.kind || r.args) && App.scene.value?.byId.has(id) ? html`<${Look} id=${id} />` : null}
  </div>`;
}
// A record not in the chart on the day shown. One that starts after it says when, by the act its start entry records
// (Formed) or else From, with Show the chart then; any other, that it isn't in the chart then.
function LaterView({ id }) {
  App.version.value;
  const c = App.chart.value, wb = App.shown.value, d = App.heldFrom(id, App.day.value);
  if (!wb.item(c, id).length) return null;
  const then = d && wb.asOf(c, d), x = then?.[id];
  if (!x) return html`<div class="empty"><span>Not in the chart as of ${short(App.day.value)}</span>
    ${Shell.time.value ? html`<button class="btn" onClick=${() => Shell.at(null)}>Today</button>` : null}</div>`;
  const start = (T.index(then).entries.get(id) ?? []).find(e => then[e].field === 'date' && then[e].value === d && N().isStart(T.treeOf(then, e)));
  const said = (start && App.actOf(then[start].edge)?.[1]) || 'From', name = x.kind ? N().nameOf(then, id) : `${N().nameOf(then, id)}: ${N().segmentOf(then, id)}`;
  return html`<div class="insp"><${Head} path=${x.kind ? [{ label: x.kind }] : []} title=${bound(name)} />
    <div class="later"><span>${said} ${short(d)}</span><button class="btn" onClick=${() => Shell.at(d === Log.today() ? null : { asOf: d })}>Show the chart then</button></div></div>`;
}
// A box or line the chart shown hides by its own note (Delete, Hide in this view): said, with the way to show it
// there again, its own Shown in the view, as the narrowest decides. Any other way out of a chart is the view's.
const hiddenNote = (id, view) => { const n = N().resolve('Shown', tree(id), view); return n?.value === false && n.note.view === view && n.note.pattern.id === id ? n.note : null; };
const showHere = (ids, v) => App.change(tx => ids.forEach(x => tx.note('Shown', tree(x), true, { view: v.id })), { say: ch => Time.describe(ch) });
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
  const hid = [...new Set(N().notes('Shown').filter(n => n.view === v.id && n.value === false && n.pattern.id !== undefined).map(n => n.pattern.id))]
    .filter(x => recs()[x] && (recs()[x].kind || recs()[x].args) && hiddenNote(x, v.id));
  // And what it leaves out of the boxes it draws, by list: "Not shown here: 2 owners of Fund III".
  const sc = App.scene.value, left = sc ? [...leftOut(sc, [...sc.byId.keys()])].flatMap(([id, parts]) => parts.map(p => ({ id, ...p }))) : [];
  if (!hid.length && !left.length) return null;
  const said = x => recs()[x].args ? `${nameOf(x)} · ${segment(x)}` : nameOf(x), still = App.readOnly.value;
  const all = [...hid, ...left.flatMap(g => g.items.flatMap(it => it.show))];
  return html`<${Section} title="Hidden" n=${hid.length + left.reduce((n, g) => n + g.items.length, 0)} act=${still || hid.length + left.length < 2 ? null : html`<button class="btn" onClick=${() => showHere(all, v)}>Show all</button>`}>
    ${hid.map(x => html`<div class="rr" key=${x}><span /><span class="nm"><${Go} to=${x}>${said(x)}</${Go}></span>
      <span class="val">${still ? null : html`<button class="btn" onClick=${() => showHere([x], v)}>Show</button>`}</span></div>`)}
    ${left.map(g => html`<div class="rr" key=${g.id + g.list}><span /><span class="nm">Not shown here: <${Go} to=${g.id} title=${g.items.map(it => nameOf(it.obj)).join('\n')}>${g.items.length} ${lower(g.items.length === 1 ? relOne(g.list) : g.list)} of ${bound(shortOf(g.id))}</${Go}></span>
      <span class="val">${still ? null : html`<button class="btn" onClick=${() => showHere(g.items.flatMap(it => it.show), v)}>Show</button>`}</span></div>`)}</${Section}>`;
}
function HiddenHere({ id }) {
  const v = viewShown(), r = recs()[id];
  if (!v || v.layout !== 'chart' || !(r.kind || r.args) || App.scene.value?.byId.has(id) || !hiddenNote(id, v.id)) return null;
  return html`<${Section} title=${`Hidden in ${v.name}`} act=${App.readOnly.value ? null : html`<button class="btn" onClick=${() => showHere([id], v)}>Show</button>`} />`;
}

// A style's outputs, each as the legend draws it (Scene's swatch), with its caption; each 2 px inside its chip,
// a box's outline too, however heavy, so none runs along the chip's edge.
function Swatch({ sw, off }) {
  const stroke = sw.Outline === 'none' ? 'none' : sw.Outline, dash = Scene.dash(sw.Dash, sw.Weight), w = stroke === 'none' ? 0 : Math.min(sw.Weight * Scene.PT, 2.5);
  return html`<svg class=${'sw' + (off ? ' off' : '')} viewBox="0 0 28 16" aria-hidden="true">${sw.kind === 'line'
    ? html`<path d="M2 8H26" fill="none" stroke=${stroke} stroke-width=${Math.min(sw.Weight * Scene.PT, 3)} stroke-dasharray=${dash} />`
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
  // The styles listed, by their groups (Scene.groupsOf) in their order, each group a row as the Key has it: those
  // under their style's name, then apart, after them all, the styles that are their one row (Names).
  const blocks = [...Map.groupBy(Scene.groupsOf(n, v).filter(g => listed.has(g.style)), g => g.style)].map(([k, rows]) => ({ s: styleAt.get(k), rows, lone: !rows[0].name }));
  const parts = [blocks.filter(b => !b.lone), blocks.filter(b => b.lone)];
  // Dragged among those of its part; the rest keep their places in the view's order.
  const order = part => (from, i) => { const q = moved(part.map(b => b.s), from, i), keys = new Set(q.map(s => s.key));
    App.change(tx => all.map(s => keys.has(s.key) ? q.shift() : s).forEach((s, k) => s.order !== k + 1 && tx.note('Order', s.pattern, k + 1, { view: v }))); };
  // A caption typed as an output's own name is no caption.
  const cap = (ps, text) => App.change(tx => ps.forEach(p => tx.note('Caption', p, text && text !== Scene.outputName(n, p) ? text : undefined, { view: v })));
  const grip = part => only || App.readOnly.value ? null : html`<button class="grip" tabindex="-1" aria-hidden="true" onPointerDown=${e => drag(e, order(part))}>${GRIP}</button>`;
  // A row: its swatch, its caption (the Key's word, typed over, which captions each output in it), and, where a
  // caption calls it, what it stands for: beneath, where several, or on hover. A style's one row, `alone`, is
  // dragged among that part.
  const output = (g, alone) => {
    const names = g.outputs.map(p => Scene.outputName(n, p)), said = g.outputs.some((p, i) => Scene.captionOf(n, p, v) !== names[i]);
    return html`<div class=${'row out' + (alone ? ' lone' : '')} key=${g.key}>${alone ? grip(alone) : null}<div class="k"><${Swatch} sw=${g.swatch} off=${g.off} /></div>
      <div class="v" title=${said && names.length === 1 ? names[0] : null}><${Caption} g=${g} label=${names.join(', ')} put=${out => cap(g.outputs, out?.value ?? '')} />
        ${said && names.length > 1 ? html`<span class="oname">${names.join(', ')}</span>` : null}</div></div>`;
  };
  // A style that is its one group is that row alone: Names, not Name over Names.
  return parts.flatMap(part => part.map(({ s, rows, lone }) => html`<div class=${'ent style' + (lone ? ' lone' : '')} data-drag=${only ? null : lone ? 'lone' : 'style'} key=${s.key}>
    ${lone ? output(rows[0], part) : html`<div class="row" style="--depth:0">${grip(part)}<div class="k sname"><${Go} to=${general(s.pattern)}>${rows[0].name}</${Go}></div></div>${rows.map(g => output(g))}`}
  </div>`));
}

// A Styles row's caption. Clicked, it lights on the chart the boxes and lines it reaches, as the scope's group is cued,
// till it's left; double-clicked, F2 or Enter, or Rename from its menu, it's typed over, as a name is.
function Caption({ g, label, put }) {
  const [typing, setTyping] = useState(false), [on, setOn] = useState(false);
  if (typing) return html`<span class="cellbox" onFocusOut=${e => { if (!e.currentTarget.contains(e.relatedTarget)) setTyping(false); }}>
    <${Field} r=${{ field: 'text', value: g.caption }} datatype="text" label=${label} cls=${g.off ? ' off' : ''} auto put=${out => { setTyping(false); put(out); }} /></span>`;
  const c = charted() ? Canvas.active.peek() : null;
  const light = () => { const sc = App.scene.peek(); if (!c || !sc) return; setOn(true); c.cue?.(reachedBy(sc, g.outputs)); };
  const dark = () => { if (!on) return; setOn(false); typeof FormatBar !== 'undefined' ? FormatBar.cue?.(false) : c?.cue?.(null); };
  const rename = () => { dark(); if (!App.readOnly.peek()) setTyping(true); };
  return html`<button type="button" class=${'cap' + (on ? ' on' : '') + (g.off ? ' off' : '')} aria-label=${label} aria-pressed=${on} onClick=${() => (on ? dark() : light())} onDblClick=${rename} onBlur=${dark}
    onKeyDown=${e => { if (e.key === 'F2' || e.key === 'Enter') { e.preventDefault(); rename(); } }}
    onContextMenu=${e => { e.preventDefault(); menu({ x: e.clientX, y: e.clientY }, [{ label: 'Rename', keys: 'F2', disabled: App.readOnly.peek(), run: rename }]); }}>${g.caption}</button>`;
}
// The boxes and lines of a scene that a Styles row's outputs reach, as the scope's groups reach them.
function reachedBy(sc, outputs) {
  const out = new Set();
  for (const m of sc.marks) if ((m.type === 'box' || m.type === 'line') && !m.revealed)
    for (const r of Scene.reach(App.shown.peek(), App.chart.peek(), sc.view, sc, m.id, recs())) if (outputs.some(p => T.narrower(r.output, p))) out.add(m.id);
  return [...out];
}

// The view: its layout and its rows (its own notes), and its styles in their order. Its name is its tab's,
// and the formula bar's.
function ViewPanel() {
  const v = viewShown();
  if (!v) return null;
  const t = { id: v.id, kind: 'View' }, L = App.layouts.value, all = [...L.kinds, ...L.relations, ...L.datatypes];
  const rowsName = all.find(l => JSON.stringify(l.rows) === JSON.stringify(v.rows))?.name;
  const layout = value => App.change(tx => tx.note('Layout', t, value), { dated: false });
  return html`<div class="insp">
    <div class="rows">
      <div class="row"><div class="k">Layout</div><div class="v ctl"><${Choice} fixed label="Layout" r=${{ choice: v.layout === 'table' ? 'Table' : 'Chart' }} options=${['Chart', 'Table']}
        put=${out => layout(out.choice === 'Table' ? { rows: v.rows } : undefined)} /></div></div>
      ${v.layout === 'table' ? html`<div class="row in"><div class="k">Rows</div><div class="v ctl"><${Choice} fixed label="Rows" r=${rowsName ? { choice: rowsName } : null} options=${all.map(l => l.name)}
        put=${out => layout({ rows: all.find(l => l.name === out.choice).rows })} /></div></div>` : null}
    </div>
    ${v.layout === 'chart' && stylesOf(v.id).length ? html`<${Section} title="Styles"><div class="styles"><${Styles} v=${v.id} /></div></${Section}>` : null}
    ${v.layout === 'table' && typeof Table !== 'undefined' ? html`<${Section} title="Columns"><${Table.Columns} view=${v.id} /></${Section}>` : null}
    ${v.layout === 'chart' ? html`<${HiddenList} v=${v} />` : null}
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
  // The Key's rows, those drawn and then those hidden, each a box to show or hide it.
  const hidden = (row.hide ?? []).map(k => n.styles(v).flatMap(s => s.outputs).find(o => T.key(o.pattern) === k)).filter(Boolean)
    .map(o => ({ key: T.key(o.pattern), caption: Scene.captionOf(n, o.pattern, v), swatch: Scene.swatchOf(o.pattern, o.formats) }));
  const rows = key ? [...(m?.rows ?? []).map(r => ({ key: r.key, caption: r.caption.text, swatch: r.swatch })), ...hidden] : [];
  const show = (k, on) => set({ hide: on ? (row.hide ?? []).filter(x => x !== k) : [...(row.hide ?? []), k] });
  return html`<div class="insp">
    <${Head} path=${key ? [{ label: name }] : []} title=${key ? row.title ?? 'Key' : name}>${key ? html`<${Field} r=${{ field: 'text', value: row.title ?? 'Key' }} datatype="text" ph="Title" label="Title" title
      put=${out => set({ title: out?.value ?? '' })} />` : null}</${Head}>
    <div class="rows">
      ${worded ? html`<div class="row"><div class="k">Text</div><div class="v ctl"><${Prose} text=${row.text ?? ''} label="Text" put=${text => set({ text })} /></div></div>` : null}
      ${key ? html`<div class="row"><div class="k">Columns</div><div class="v ctl"><${Choice} fixed label="Columns" r=${{ choice: String(row.columns ?? 1) }} options=${['1', '2', '3']}
        put=${out => set({ columns: +out.choice })} /></div></div>` : null}
    </div>
    ${rows.length ? html`<${Section} title="Rows" n=${m?.rows.length ?? 0}>${rows.map(r => html`<label class=${'row keyrow' + (r.key === part ? ' on' : '')} key=${r.key}>
      <span class="k"><input type="checkbox" checked=${!(row.hide ?? []).includes(r.key)} disabled=${still} onChange=${e => show(r.key, e.target.checked)} /><${Swatch} sw=${r.swatch} /></span>
      <span class="v">${r.caption}</span></label>`)}</${Section}>` : null}
    <${LookSection} look=${look} reset=${reset} />
    ${m && g !== 'line' ? html`<${Place} at=${{ ...m, x: m.x - (App.scene.value.page.offset?.x ?? 0), y: m.y - (App.scene.value.page.offset?.y ?? 0) }} keys=${g === 'text' || key ? 'xyw' : 'xywh'} put=${(k, x) => set({ [k]: x })} />` : null}
  </div>`;
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
  // A relation added that asks its day (App.asksDay) is a change pending (begin), ticked and redlined here until
  // Enter, its day asked in the bar under the view; a click away leaves it pending. Which (its key), as what (its
  // tick, role or value). A list's Add, or the New relation form, may have begun one. One held that's being deleted
  // is struck, its box empty, till Enter deletes it.
  const p = App.pending.value, draft = p?.relate?.a === a && p.relate.b === b ? p.relate : null;
  const going = new Set(p?.verb === 'Delete' && p.chart === App.chart.value ? p.needs : []);
  // The row whose tick or untick a change pending began, as it goes, is drawn again still (TagBox).
  const hosted = draft?.key ?? (going.size === 1 ? [...going][0] : null), was = useRef(null), settled = !hosted ? was.current : null;
  was.current = hosted;
  const [adding, setAdding] = useState(!!draft), form = naming.value?.a === a && naming.value.b === b ? naming.value : null;
  // Asked here, it's confirmed here: its day, Discard and its verb under its row, the bar's state (App.Asking).
  const ask = q => html`<div class="ask"><${App.Asking} key=${q.n} p=${q} /></div>`;
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
  const side = (at, first) => first ? bound(shortOf(objectOf(at))) : termOf(at);
  // A role chosen in the sentence: its option in its place, or "…" till one is, a dropdown of the options.
  const role = (label, now, options, choose) => said => html`<button class=${'sel dd' + (now ? '' : ' ph')} aria-label=${`${label}: ${now ?? 'none'}`} aria-haspopup="menu"
    onClick=${e => menu(e.currentTarget, options.map(o => ({ label: o, checked: !!now && T.same(o, now), run: () => !(now && T.same(o, now)) && choose(o) })))}><span>${said}</span></button>`;

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
          : html`<${TagBox} r=${{ tag: true }} fx=${f} fixed=${f} to=${null} label=${x.name} still=${x.id === settled || x.key === settled} flip=${() => remove(x.id, { source: `relate ${a} ${b}`, auto: true, inline: true })} change=${() => ({ records: { [x.id]: null } })} />`}</span>
        <span class="nm">${sentence(tree(x.id), n.placed(r, x.id).map(s => s.edge), (e, first) => side(at(e), first), { choice: rel.choice, not: rel.tag === false, role: chosen,
          wrap: words => html`<${Go} to=${x.id} cls=${f ? 'fx' : ''}>${words}</${Go}>` })}</span>
        <span class="val">${'field' in rel ? html`<${Output} id=${x.id} slot=${rel} label=${x.name} />` : null}</span>
        ${why ? html`<span class="why" data-tip=${why.words || null}>${why.cite}</span>` : null}
        ${gone && p.needs.length === 1 ? ask(p) : null}
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
      <span class="when"><button class="lk" onClick=${() => Shell.at({ asOf: x.since })}>From ${short(x.since)}</button></span>
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
      ${d ? ask(p) : null}
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
      make: tx => { tx.add('record', rec); tx.note('Name', p, name); tx.note('Order', p, 1, { param: ra }); tx.note('Order', p, 2, { param: rb }); },
      done: () => { naming.value = null; fresh.value = { a, b, key: [ra, rb, a, b].join('|').toLowerCase() }; } });
  };
  const formKeys = e => {
    if (e.key === 'Enter') { e.preventDefault(); if (ours) App.commit(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); naming.value = null; if (ours) App.discard(); }
  };
  const inp = (k, label, first) => html`<input class="cell" placeholder=${first ? 'New relation' : null} aria-label=${label} value=${form[k]} spellcheck=${false} autocomplete="off"
    onInput=${e => type(k, e.target.value)} ref=${first ? el => el && !el.dataset.on && (el.dataset.on = 1, el.focus()) : null} />`;
  // What someone entered first, then what a formula gives, and last what's ruled out; each by name, then the
  // first's side first.
  const order = (x, y) => (r[x.id].tag === false) - (r[y.id].tag === false) || fx(x.id) - fx(y.id) || x.name.localeCompare(y.name);
  // What could be, those the chart would draw as the two stand first: the box above, on the side drawn on top (an
  // owner over what it owns, as the chart sets them), so dragging down from a fund offers it as an owner first.
  const sc = App.scene.value, ya = sc?.byId.get(a)?.y, yb = sc?.byId.get(b)?.y, view = Shell.view.value;
  const onTop = x => { const p = T.bare(x.s), above = n.value('Above', p, view) ?? n.edges(p)[0]; return T.same(above ?? '', x.ea) === (ya < yb); };
  const fits = x => ya === undefined || yb === undefined || ya === yb ? 0 : onTop(x) ? 0 : 1;
  // Then those the chart records most, as Add offers the kinds it draws most.
  const uses = new Map();
  for (const id of Object.keys(r)) if (r[id].args?.length > 1 && !fx(id)) { const k = T.norm(nameOf(id)); uses.set(k, (uses.get(k) ?? 0) + 1); }
  const used = x => uses.get(T.norm(x.name)) ?? 0;
  const holds = [...held.values()].sort(order), could = [...open.values()].sort((x, y) => fits(x) - fits(y) || used(y) - used(x) || x.name.localeCompare(y.name) || (y.la === a) - (x.la === a)), after = [...later.values()].sort((x, y) => x.since.localeCompare(y.since));
  const name = x => html`<${Go} to=${x}>${bound(nameOf(objectOf(x)))}${x !== objectOf(x) ? html`<span class="muted"> › ${segment(x)}</span>` : null}</${Go}>`;
  // What else could hold, once asked for; at once where nothing did.
  const ghost = (label, run) => html`<div class="rr new"><button class="btn ghost add-entry" onClick=${run}>${icon('plus')}${label}</button></div>`;
  none.current ??= !holds.length;
  return html`<div class="insp">
    <header class="ih"><h2 class="ih-title">${name(a)} <span class="and">and</span> ${name(b)}</h2></header>
    ${holds.length || after.length ? html`<div class="relate">${holds.map(heldRow)}${after.map(laterRow)}</div>` : null}
    ${still ? null : !adding && !draft && !form && !none.current ? html`<div class="relate">${ghost('Add a relation', () => setAdding(true))}</div>` : html`<div class="relate">
      ${could.map(openRow)}
      ${form ? html`<div class=${'rr new' + (ours ? ' adding' : '')} onKeyDown=${formKeys}><span class="ctl"><span class=${'tag' + (ours ? ' yes' : '')} /></span><span class="form">
          ${inp('name', 'Name', true)}<span class="side">${side(a, true)}</span>${inp('ra', `${nameOf(a)}’s role`)}<span class="side">${side(b, true)}</span>${inp('rb', `${nameOf(b)}’s role`)}</span>
          ${ours ? ask(p) : null}</div>`
        : ghost('New relation', () => { if (draft) App.discard(); naming.value = { a, b, name: '', ra: '', rb: '' }; })}
    </div>`}
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
  const lines = [[text.slice(0, f.offset)]];
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
  return html`<div class="st-set" onClick=${() => FormulaBar.focus('r' + r.i)}>${lines.map((l, i) => html`<div class=${i ? 'cont' : null}>${l}</div>`)}</div>`;
}
// How many records a clause gives, in the words of the list they make ("15 close affiliates") or of the kind
// they're at ("3 entities").
function counted(p, ids) {
  const n = N(), one = ids.length === 1, e = p.args?.length > 1 && n.edges(p)[0];
  if (e) return lower(one ? e : n.listName(p, e));
  const kinds = [...new Set(ids.map(id => recs()[objectOf(id)]?.kind))];
  return kinds.length === 1 && kinds[0] ? lower(one ? kinds[0] : T.plural(kinds[0])) : one ? 'record' : 'records';
}
function Statute({ def, p, law }) {
  const { lead, groups, tail, put } = law, mine = Object.entries(App.computed.value.computed).filter(([, c]) => c.def === def.note);
  const gives = g => mine.filter(([, c]) => g.rows.some(r => c.holds?.length ? c.holds.includes(r.i) : c.row === r.i)).map(([id]) => id);
  const write = g => () => { const key = 'n' + Math.random().toString(36).slice(2, 8), tag = App.definitions.value.find(d => d.id === def.note)?.type === 'tag';
    FormulaBar.edit(def.note, xs => [...xs, { key, label: g.label, formula: tag ? '← ' : '= ' }]); FormulaBar.focus(key); };
  const words = (x, cls) => x.at === undefined ? html`<span class=${cls} />`
    : html`<${Prose} cls=${cls} text=${x.law} label=${x.label || 'Description'} put=${to => App.change(tx => tx.note('Description', p, put(x, to) || undefined))} />`;
  return html`<div class="statute">
    ${lead.map(x => words(x, 'st-lead'))}
    <ol class="st-clauses">${groups.map((g, k) => { const ids = gives(g);
      return html`<li class="st-clause" key=${k} onPointerEnter=${() => FormulaBar.light(ids)} onPointerLeave=${() => FormulaBar.light(null)}>
        <span class="st-label">${g.label}</span>${words(g, 'st-law')}
        <div class="st-forms">${g.rows.length ? g.rows.map(r => html`<${Typeset} key=${r.i} r=${r} def=${def.note} />`)
          : App.readOnly.value ? null : html`<button class="st-write" onClick=${write(g)}>${'='}</button>`}</div>
        ${ids.length ? html`<button class="st-n" onClick=${() => select(ids)}>${ids.length} ${counted(p, ids)}</button>` : html`<span class="st-n" />`}</li>`; })}</ol>
    ${tail.map(x => words(x, 'st-lead'))}
  </div>`;
}

// A yes or no about an entry in general, a checkbox row as a tag is: its box, then its label.
const checkRow = (label, on, set) => html`<label class="row chk" key=${label}><span class="v ctl"><input type="checkbox" checked=${on} disabled=${App.readOnly.value}
  onChange=${e => set(e.target.checked)} /></span><span class="k">${label}</span></label>`;

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
  const setName = to => { if (!to || to === name) return; App.change(tx => kind ? tx.rename(p, p.kind, to) : rel ? tx.note('Name', p, to) : tx.rename(loose(p), p.args[0].edge, to)); };
  const flag = (label, q, v) => App.change(tx => tx.note(label, q, v));
  const options = type === 'choice' ? optionsOf(specs) : [];
  const reorderOpts = (from, i) => App.change(tx => moved(options, from, i).forEach((o, k) => tx.note('Order', { out: { choice: o }, args: p.args }, k + 1)));
  const ats = kind ? [] : rel ? n.edges(p).map(e => [e, [...new Set(specs.map(s => where(s.args.find(a => T.same(a.edge, e)).loc)))].join(', ')])
    : [['At', [...new Set(specs.map(s => where(s.args[0].loc)))].join('\n')]];
  const below = kind ? [...new Map(Object.values(S).filter(s => s.args?.length === 1 && s.args[0].loc.kind && T.same(s.args[0].loc.kind, p.kind)).map(s => [T.norm(s.args[0].edge), s])).values()] : [];
  const addFormula = () => { if (App.change(tx => tx.note('Formula', p, [{ label: '', formula: type === 'tag' ? '← ' : '= ' }]))) FormulaBar.focus('r0'); };
  const v = viewShown()?.layout === 'chart' ? Shell.view.value : null, described = !law?.any && (describing || !!n.description(p));
  const adds = still ? [] : [...(law?.any || described ? [] : [{ label: 'Description', run: () => setDescribing(true) }]), ...(def || kind ? [] : [{ label: 'Formula', run: addFormula }])];
  return html`<div class="insp">
    <${Head} title=${name} path=${style ? [{ label: 'Style' }] : kind || rel ? [] : [{ label: T.DATATYPES[s0?.out.field] ?? (type === 'choice' ? 'Choice' : 'Tag') }]}>
      <${Field} r=${{ field: 'text', value: name }} datatype="text" label="Name" title put=${out => out && setName(out.value)} /></${Head}>
    <div class="rows">
      ${described ? html`<div class="row"><div class="k">Description</div><div class="v ctl"><${Prose} text=${n.description(p) ?? ''} label="Description" auto=${describing}
        put=${text => { setDescribing(false); App.change(tx => tx.note('Description', p, text || undefined)); }} done=${() => setDescribing(false)} /></div></div>` : null}
      ${ats.map(([k, x]) => html`<div class="row" key=${k}><div class="k">${k}</div><div class="v lines">${x}</div></div>`)}
      ${rel ? n.edges(p).map(e => html`<div class="row" key=${'l' + e}><div class="k">${e} list</div><div class="v ctl"><${Field} r=${{ field: 'text', value: n.listName(p, e) }} datatype="text"
        label=${`${e} list`} put=${out => App.change(tx => tx.note('Name', p, out?.value === e ? undefined : out?.value, { param: e }))} /></div></div>`) : null}
      ${kind || rel ? null : checkRow('Required', n.required(p), on => flag('Required', p, on))}
      ${dated ? ['Start', 'End'].map(l => checkRow(l, l === 'Start' ? n.isStart(dp) : n.isEnd(dp), on => flag(l, dp, on))) : null}
      ${adds.length ? html`<${AddRow} items=${() => adds} />` : null}
    </div>
    ${type === 'choice' ? html`<${Section} title="Options" n=${options.length}>
      ${options.map(o => html`<div class="ent" data-drag="opt" key=${o}><div class="row" style="--depth:0">${still ? null : html`<button class="grip" tabindex="-1" aria-hidden="true" onPointerDown=${e => drag(e, reorderOpts)}>${GRIP}</button>`}
        <div class="k wide"><${Field} r=${{ field: 'text', value: o }} datatype="text" label="Option" put=${out => out && out.value !== o && App.change(tx => tx.rename(loose(p), o, out.value))} /></div></div></div>`)}
      ${still ? null : html`<div class="row"><div class="k wide"><${Field} datatype="text" ph="New option" put=${out => out && App.change(tx => tx.add('spec', { tree: { ...T.specOf(s0), out: { choice: out.value } } }))} /></div></div>`}</${Section}>` : null}
    ${below.length ? html`<${Section} title="Entries" n=${below.length}>
      ${below.sort((x, y) => (n.order(x) ?? Infinity) - (n.order(y) ?? Infinity) || x.args[0].edge.localeCompare(y.args[0].edge)).map(s => html`<div class="row" key=${T.key(s)}>
        <div class="k"><${Go} to=${general(T.bare(s))}>${s.args[0].edge}</${Go}></div><div class="v muted">${typeName(s)}</div></div>`)}</${Section}>` : null}
    ${def ? html`<${Section} title="Formula"><${Statute} def=${def} p=${p} law=${law} /></${Section}>` : null}
    ${v && stylesOf(v, p).length ? html`<${Section} title="Styles"><${Styles} v=${v} only=${p} /></${Section}>` : null}
  </div>`;
}

// Several selected: each by what it is, a relation by its place (Ownership · Fund III → Fund III Blocker), so a
// trunk's lines or a frame's are told apart.
function Many({ ids }) {
  return html`<div class="insp"><${Head} title=${`${ids.length} selected`} /><div class="rows">
    ${ids.filter(x => recs()[x]).map(x => html`<div class="row" key=${x}><div class="k wide"><${Go} to=${x}>${recs()[x].args ? html`${nameOf(x)} · ${segment(x)}` : bound(nameOf(objectOf(x)))}</${Go}></div></div>`)}</div></div>`;
}

// Each new selection is shown from the panel's top, as a new page is, but where a row is aimed at (RecordView), which
// it's scrolled to; `aimed`, the selection an aim was taken for.
let host = null, aimed = null;
function Inspector() {
  const sel = Shell.selection.value, key = sel.join();
  useLayoutEffect(() => { const s = host?.closest('.inspector'); if (host) host.style.minHeight = ''; if (s && aimed !== key) s.scrollTop = 0; aimed = null; }, [key]);
  return chosen(sel);
}
// What a selection key names: a free shape (or a row of a Key) has its own panel; a relation's text in one box
// is the relation.
function chosen(sel) {
  const p = sel.length === 1 && Shell.pattern(sel[0]);
  if (!App.chart.value) return null;   // opening
  if (p) return html`<${GeneralView} key=${sel[0]} p=${p} />`;
  if (sel.length === 2 && sel.every(k => T.isObject(recs()[k] ?? {}))) return html`<${RelateView} key=${sel.join()} a=${sel[0]} b=${sel[1]} />`;
  if (sel.length > 1) return html`<${Many} ids=${sel} />`;
  // A frame is drawn by a style: selecting it shows the entry the style is of, with its styles.
  const frame = sel.length === 1 && sel[0].startsWith('frame:') && App.scene.value?.byId.get(sel[0]);
  if (frame?.output) return html`<${GeneralView} key=${sel[0]} p=${T.bare(frame.output)} style />`;
  if (sel.length === 1) {
    const [id, part] = sel[0].split('#'), rid = id.split('@')[0], rows = App.shown.value.item(App.chart.value, rid);
    if (rows.at(-1) && 'shape' in rows.at(-1)) return html`<${ShapeView} key=${rid} id=${rid} part=${part} />`;
    if (recs()[rid] || rows.length) return html`<${RecordView} key=${rid} id=${rid} />`;
  }
  return html`<${ViewPanel} />`;
}

// ---- What needs attention: deadlines overdue and due soon, blanks where required, and errors ----
// Going to one selects the record it's at and aims at its row, with the formula bar on it: a deadline's why, as an
// error's; an error, which is no record, at the row where its value would be, the formula that gave it asked. A blank
// has no formula: its row takes the keys, to be typed into. A failed check is app.js's.
const attention = computed(() => App.needs.value.filter(a => a.kind !== 'error' || a.error).map(a => {
  const go = (id, edge, why) => () => {
    const obj = recs()[id] && objectOf(id);
    if (!obj) return;
    aim.value = edge ? `${id}|${edge}` : id;
    select([obj]);
    if (why) emit('why-open', why);
  };
  const p = a.error && (placeOf(a.error) ?? a.error.args?.[0]);
  return { kind: a.kind, go: a.error ? go(p?.at, p?.edge, a.id) : a.kind === 'blank' ? go(a.id, a.edge) : go(a.id, null, a.id) };
}));

Shell.register('inspector', { mount(el) { host = el; render(html`<${Inspector} />`, el); return () => render(null, el); } });
Shell.register('attention', { items: () => attention.value });
// What the panel's ⋯ changes, for Find, of the one record selected: Transfer… (by the words a sale goes by) and Delete…,
// with why not, where they can't be.
const theOne = () => { const ks = Shell.selection.peek(); return ks.length === 1 && recs()[ks[0]] ? ks[0] : null; };
const notNow = (can, what) => () => App.readOnly.peek() ? 'Can’t change the past' : !theOne() ? `Select ${what} first` : can;
Shell.register('action', { id: 'record.transfer', name: 'Transfer…', names: ['Sell', 'Sale', 'Assign', 'Transfer ownership'],
  enabled: () => !App.readOnly.peek() && !!theOne() && !!App.transferable(theOne()), run: () => App.transferring(theOne()),
  why: notNow('Only a relation of two sides transfers', 'an ownership or another relation') });
Shell.register('action', { id: 'record.delete', get name() { return `${theOne() ? App.deleteVerb([theOne()]) : 'Delete'}…`; }, names: ['Delete', 'Remove', 'Dissolve', 'End'],
  enabled: () => !App.readOnly.peek() && !!theOne(), run: () => remove(theOne(), { auto: true, inline: true }), why: notNow('', 'what to delete') });
// Renamed in its panel's title, its Name, which the keys go to.
Shell.register('action', { id: 'record.rename', name: 'Rename', names: ['Change name', 'Edit name'], enabled: () => !App.readOnly.peek() && !!theOne() && !!recs()[theOne()].kind,
  run: () => { Shell.showPanel?.(); setTimeout(() => { const t = document.querySelector('.insp .ih .cellbox.title textarea'); t?.focus(); t?.select(); }, 60); },
  why: notNow('Only a record with a name is renamed', 'what to rename') });
// Hidden in the chart shown, or shown there again, as its ⋯ does it.
const drawnHere = () => !!App.scene.peek()?.byId.has(theOne());
Shell.register('action', { id: 'record.hide', get name() { return theOne() && !drawnHere() ? 'Show in this view' : 'Hide in this view'; }, names: ['Hide box', 'Show box', 'Unhide'],
  enabled: () => !App.readOnly.peek() && !!theOne() && viewShown()?.layout === 'chart' && !!(recs()[theOne()].kind || recs()[theOne()].args),
  run: () => { const id = theOne(), v = viewShown(); if (drawnHere()) App.change(tx => tx.note('Shown', tree(id), false, { view: v.id }), { say: ch => Time.describe(ch) }); else showHere([id], v); },
  why: () => viewShown()?.layout !== 'chart' ? 'Show a chart first' : notNow('Only a box or a line is hidden', 'a box or a line')() });
// Settling a deadline of the record selected, or the deadline selected, as its Paid… or Filed… does, by the words for it.
Shell.register('find', { items: () => {
  const id = theOne();
  if (!id || App.readOnly.peek()) return [];
  const dates = recs()[id].field === 'date' ? [id] : within(objectOf(id)).filter(x => recs()[x].field === 'date' && fx(x));
  return dates.map(x => [x, settling(x)]).filter(([, s]) => s).map(([x, s]) => ({ label: `${s.label} ${recs()[x].edge}, ${short(recs()[x].value)}`, detail: 'Action',
    names: ['Mark paid', 'Paid', 'Pay', 'Mark filed', 'Filed', 'File', 'Renewed', 'Renew', 'Affirmed', 'Settle'], run: s.run }));
} });
// Add to each of the selected record's lists, by the word for one of it ("Add owner"), as its + does: Find opens its search.
const one = w => w.replace(/ies$/, 'y').replace(/(?<!s)s$/, '');
Shell.register('find', { items: () => {
  const id = theOne();
  if (!id || App.readOnly.peek() || !(recs()[id].kind || recs()[id].args)) return [];
  return relatives(id).lists.filter(([, items]) => !items[0].rest.length && !items.every(it => fx(it.rid))).map(([list]) => ({ label: `Add to ${list}…`, detail: 'Action',
    names: [`Add ${one(list).toLowerCase()}`, `New ${one(list).toLowerCase()}`], run: () => {
      aim.value = 'list:' + list;
      // Once Find has closed and the list is open, brought into view, its + pressed.
      setTimeout(() => {
        const s = document.querySelector(`.insp [data-key="${CSS.escape('list:' + list)}"]`);
        s?.scrollIntoView({ block: 'start' });
        s?.querySelector('.sect .btn.icon')?.click();
      }, 150);
    } }));
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
on('relate-open', d => { Shell.showPanel?.(); select(d); });
// A relation just added offers its entries while its two boxes stay selected.
on('select', () => { fresh.value = null; });
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

// What settles a deadline, as a menu item, for the Dates table's right-click (settling).
return { settling };
})();
