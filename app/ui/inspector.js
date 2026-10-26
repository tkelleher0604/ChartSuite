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
const termOf = at => { const o = objectOf(at), s = shortOf(o); return s !== nameOf(o) ? s.replace(/^The /, 'the ') : s; };
// Why a formula gives a record: the row the formula bar says decided it, by its clause cited in full
// (§2(a)(3)(C)), so both panes give one reason; `label` is that row's own.
function because(id) {
  const g = FormulaBar.reason?.(id);
  if (g) return { label: g.label, cite: g.cite ?? g.label };
  const c = App.computed.value.computed[id];
  return c?.label ? { label: c.label, cite: FormulaBar.citeOf?.(c.def, c.label) ?? c.label } : null;
}

// A date a formula gives is overdue once the day shown is past it, and due soon within 30 days of it.
const later = (iso, days) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + days); return T.isoOf(d); };
function dueOf(id) {
  const r = recs()[id], day = App.day.value;
  if (r?.field !== 'date' || !(fx(id) || over(id))) return null;
  return r.value < day ? 'overdue' : r.value <= later(day, 30) ? 'soon' : null;
}
const DUE = { overdue: 'overdue', soon: 'due soon' };
// A date's text, kept on one line: red when overdue and amber when due soon, saying so to a screen reader.
const dated = (id, text) => { const d = dueOf(id); return html`<span class=${'date' + (d ? ' ' + d : '')}>${text}${d ? html`<span class="sr"> (${DUE[d]})</span>` : null}</span>`; };

// What a filing records for a due date: the first date its rule reads, at it or beside it, that's neither a
// start, an end nor worked out (Last Filed, Annual Tax Paid). The rule is the due date's own row, and then
// the row that gave the relation it's at.
function filingOf(due) {
  const R = App.computed.value;
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
  const p = specs[0] && T.bare(specs[0]), rank = o => { const r = N().resolve('Order', { out: { choice: o }, args: p.args }); return r?.note.pattern.out ? r.value : Infinity; };
  return [...new Set(specs.filter(s => 'choice' in s.out).map(s => s.out.choice))].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}
function kindAt(t, edge) {
  const specs = specsAt(t, edge), s = specs[0];
  return !s ? { type: 'field', datatype: null } : 'field' in s.out ? { type: 'field', datatype: s.out.field } : 'choice' in s.out ? { type: 'choice', options: optionsOf(specs) } : { type: 'tag' };
}

// Required entries that are blank at a record: their label, and what each takes.
function blanksAt(at) {
  const t = tree(at), have = new Set(entriesAt(at).map(e => T.norm(recs()[e].edge))), out = [];
  for (const n of N().notes('Required')) {
    const a = !n.view && n.pattern.args?.length === 1 && n.pattern.args[0];
    if (!a || have.has(T.norm(a.edge)) || out.some(b => T.same(b.edge, a.edge)) || !T.narrower(t, a.loc)) continue;
    if (N().required({ args: [{ edge: a.edge, loc: t }] })) out.push({ at, edge: a.edge });
  }
  return out;
}

// Where an error stands, as the entry its value would be: the record it's at, and its label.
const placeOf = e => e.args?.length === 1 ? e.args[0] : e.at ? { at: e.at, edge: App.definitions.value.find(d => d.id === e.def)?.name } : null;

// A record's entries, the errors where a formula would put one, and blank required ones (or, `all`, every
// entry it could have and hasn't); in Order, Name first.
function slots(at, all) {
  const r = recs(), own = !!r[at]?.kind, slot = (edge, x) => ({ edge, ...x, t: { args: [{ edge, loc: tree(at) }] } });
  const ents = entriesAt(at).map(id => ({ id, edge: r[id].edge, t: tree(id), pinned: T.same(r[id].edge, 'Name') }));
  const errors = App.computed.value.errors.map(e => [e, placeOf(e)]).filter(([, p]) => p?.edge && p.at === at && !entryNamed(at, p.edge)).map(([e, p]) => slot(p.edge, { error: e }));
  const blanks = blanksAt(at).filter(b => !errors.some(e => T.same(e.edge, b.edge))).map(b => slot(b.edge, { ...b, blank: true }));
  const open = all ? unentered(at).map(s => s.args[0].edge).filter(e => ![...errors, ...blanks].some(x => T.same(x.edge, e))).map(edge => slot(edge, { at, open: true })) : [];
  const out = [...ents.filter(e => !(own && e.pinned)), ...errors, ...blanks, ...open].map(x => ({ ...x, o: x.pinned ? -1 : N().order(x.t) ?? Infinity }))
    .sort((a, b) => a.o - b.o || a.edge.localeCompare(b.edge));
  // The first of those it could have is typed into at once.
  const first = out.find(x => x.open);
  if (first) first.auto = true;
  return out;
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
function relatives(id) {
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
  const by = (a, b) => shortOf(a.obj).localeCompare(shortOf(b.obj));
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
function put(id, slot, out) {
  App.change(tx => {
    if (!out) return entered(id) && tx.remove(id);
    if (entered(id)) tx.set(id, withOut(id, slot, out)); else tx.add('record', withOut(id, slot, out));
  });
}
const flipped = id => ({ tag: !(recs()[id]?.tag ?? false) });
const flip = (id, slot) => { put(id, slot, flipped(id)); emit('tag-flip', id ?? slot); };
// The change a tag's flip would make, as the formula bar redlines one.
const flipChange = (id, slot) => ({ records: { [entered(id) ? id : 'fx-pending']: withOut(id, slot, flipped(id)) } });
const remove = id => App.change(tx => tx.remove(id), { say: `Deleted ${recs()[id].args ? nameOf(id) : recs()[id].edge ?? nameOf(id)}` });
// Adds an entry, and its specification if the schema hasn't got it.
function addEntry(at, edge, out) {
  const spec = { out: 'field' in out ? { field: out.field } : 'choice' in out ? { choice: out.choice } : { tag: out.tag }, args: [{ edge, loc: T.specOf(tree(at)) }] };
  App.change(tx => { if (!App.schema.value[T.key(spec)]) tx.add('spec', { tree: spec }); tx.add('record', { at, edge, ...out }); });
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
const GRIP = html`<svg class="i" viewBox="0 0 16 16" aria-hidden="true"><g fill="currentColor" stroke="none"><circle cx="6" cy="4" r="1.1"/><circle cx="10" cy="4" r="1.1"/><circle cx="6" cy="8" r="1.1"/><circle cx="10" cy="8" r="1.1"/><circle cx="6" cy="12" r="1.1"/><circle cx="10" cy="12" r="1.1"/></g></svg>`;
const OPEN = html`<svg class="i" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 4h6v6M12 4l-7.5 7.5"/></svg>`;
const draft = signal(null);     // an entry being added: { at, type, edge?, datatype?, options? }
const renaming = signal(null);  // the entry whose label is being typed over
const aim = signal(null);       // a row or list to bring into view and focus, by its key
const linking = signal(null);   // the record a link is being typed for

// A name that selects what it names: a button, reached by Tab, set as text.
const Go = ({ to, cls = '', title, children }) => html`<button class=${'lk ' + cls} title=${title} onClick=${() => select([].concat(to))}>${children}</button>`;

// Drags a row among its siblings (those with the same data-drag); a click without moving is a click.
function drag(e, onDrop, onClick) {
  if (App.readOnly.peek()) return;
  const grip = e.currentTarget, item = grip.closest('[data-drag]');
  Shell.drag(e, { item, items: [...item.parentElement.children].filter(x => x.dataset.drag === item.dataset.drag), onDrop, onClick: onClick && (() => onClick(grip)) });
}

// A value typed over: Enter or leaving keeps it, Esc puts it back. While it differs, the new text is
// redlined in blue and the old struck in red. A document shows its name, and its address to edit. `label`
// names it; `due` marks a date overdue or due soon. Text, and a title, wrap, as many lines as they take.
function Field({ r, datatype, put, fx, over, id, auto, ph, cls = '', title, label, due, children }) {
  const doc = datatype === 'document', shown = r ? T.format(r.field, r.value) : '', raw = r ? (doc ? r.value : shown) : '';
  // What's typed, null while not typing; kept in a ref too, as a blur can come after the record has gone.
  const [text, setText] = useState(null), [bad, setBad] = useState(false), ref = useRef(), typed = useRef(null);
  const type = t => { typed.current = t; setText(t); };
  useLayoutEffect(() => { if (auto) ref.current?.focus(); }, []);
  const dirty = text !== null && T.clean(text) !== raw;
  const done = () => {
    const t = typed.current === null ? null : T.clean(typed.current);
    if (t === null || t === raw) return type(null);
    const dt = datatype ?? T.classify(t), v = t ? T.parse(dt, t) : null;
    if (v === undefined) return setBad(true);
    type(null);
    put(t ? { field: dt, value: v } : null);
  };
  const key = e => {
    if (e.key === 'Enter') { e.preventDefault(); done(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); type(null); setBad(false); e.target.blur(); }
  };
  const wrap = title || (r?.field ?? datatype) === 'text', Box = wrap ? 'textarea' : 'input';
  return html`<label class=${'cellbox' + (title ? ' title' : '') + cls}><span class=${'hug' + (over ? ' over' : '') + (due && text === null ? ' ' + due : '')}>
    <${Box} ref=${ref} rows=${wrap ? 1 : null} class=${'cell' + ((r?.field ?? datatype) === 'date' ? ' date' : '') + (fx && text === null ? ' fx' : '') + (dirty && T.clean(text) ? ' add' : '') + (bad ? ' bad' : '')}
      value=${text ?? shown} placeholder=${ph} disabled=${App.readOnly.value} spellcheck=${false} autocomplete="off" aria-invalid=${bad ? 'true' : null}
      aria-label=${label ? label + (due ? `, ${DUE[due]}` : '') : ph}
      data-tour=${fx ? 'computed' : null} onFocus=${() => { type(raw); if (fx) emit('why-open', id); }}
      onInput=${e => { type(e.target.value); setBad(false); }} onKeyDown=${key} onBlur=${done} /></span>
    ${dirty && raw ? html`<s class="del">${shown}</s>` : null}
    ${doc && r && text === null ? html`<a class="btn icon open" href=${SharePoint.href(r.value)} target="_blank" rel="noopener" aria-label="Open" data-tip="Open">${OPEN}</a>` : null}
    ${dirty ? null : children}
  </label>`;
}

// A choice's option, from its dropdown, or (unless the options are fixed) a new one typed.
function Choice({ r, options, put, fx, over, id, fixed, label, ph, children }) {
  const [typing, setTyping] = useState(false);
  if (typing) return html`<span class="cellbox"><input class="cell" placeholder="New option" aria-label=${label ?? 'New option'} ref=${el => el && !el.dataset.on && (el.dataset.on = 1, el.focus())}
    onKeyDown=${e => { if (e.key === 'Enter') { const t = T.clean(e.target.value); setTyping(false); if (t) put({ choice: t }); } else if (e.key === 'Escape') { e.stopPropagation(); setTyping(false); } }}
    onBlur=${() => setTyping(false)} /></span>`;
  const open = e => {
    if (fx) emit('why-open', id);
    menu(e.currentTarget, [...options.map(o => ({ label: o, checked: !!r && T.same(o, r.choice), run: () => !(r && T.same(o, r.choice)) && put({ choice: o }) })),
      ...(fixed ? [] : [...(options.length ? ['-'] : []), { label: 'New option', run: () => setTyping(true) }])]);
  };
  return html`<span class="cellbox"><span class=${'hug' + (over ? ' over' : '')}><button class=${'sel dd' + (fx ? ' fx' : '')} disabled=${App.readOnly.value} data-tour=${fx ? 'computed' : null}
    aria-label=${label ? `${label}: ${r?.choice ?? 'none'}` : null} aria-haspopup="menu" onClick=${open}><span class=${r ? null : 'ph'}>${r?.choice ?? ph ?? ''}</span></button></span>${children}</span>`;
}

// A tag's checkbox: green attested, red ruled out, outlined when computed. Hovering shows the other state,
// and the formula bar redlines what switching it would change; clicking switches it. After a click nothing
// is previewed until the pointer has left, so the tag shows what was just done, even remounted under it.
let clicked = false;
function TagBox({ r, flip, fx, over, change, label, children }) {
  const [peek, setPeek] = useState(false), on = r?.tag, show = peek ? !(on ?? false) : on;
  const hover = p => { if (p && clicked) return; setPeek(p); FormulaBar.preview(p && change ? change() : null); };
  return html`<span class="cellbox"><span class=${'hug' + (over ? ' over' : '')}><button class=${'tag' + (show === true ? ' yes' : show === false ? ' no' : '') + (fx && !peek ? ' fx' : '') + (peek ? ' peek' : '')}
    role="checkbox" aria-checked=${on ? 'true' : 'false'} aria-label=${label && (on === false ? `${label}, ruled out` : label)} disabled=${App.readOnly.value} data-tour="tag"
    onPointerEnter=${() => hover(true)} onPointerLeave=${() => { clicked = false; hover(false); }} onClick=${() => { hover(false); clicked = true; flip(); }} /></span>${children}</span>`;
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

// Beside a due date, its filing: the entry its rule reads, typed in a popover while the formula bar redlines
// where the due date would move. Enter keeps it.
function Filed({ id }) {
  const slot = !App.readOnly.value && filingOf(id);
  if (!slot) return null;
  const open = e => Shell.popover(e.currentTarget, close => html`<${Filing} due=${id} slot=${slot} close=${close} />`, { placement: 'bottom-end', onClose: () => FormulaBar.preview(null) });
  // Overdue or due soon, it's what someone came for: always shown.
  return html`<button class=${'btn ghost ver filed' + (dueOf(id) ? ' due' : '')} aria-label=${`Record ${slot.edge}`} aria-haspopup="dialog" onClick=${open}>${/paid/i.test(slot.edge) ? 'Paid…' : 'Filed…'}</button>`;
}
function Filing({ due, slot, close }) {
  const [text, setText] = useState(T.formatDate(App.day.peek(), 'short')), value = T.parse('date', T.clean(text) || '-');
  const rec = value ? { at: slot.at, edge: slot.edge, field: 'date', value } : null;
  useLayoutEffect(() => { FormulaBar.preview(rec && { records: { [slot.id ?? 'fx-filing']: rec } }); }, [value]);
  const was = recs()[due], p = FormulaBar.pending.value, next = p?.R2.records[due];
  const keep = () => { if (!rec) return; close(); App.change(tx => slot.id ? tx.set(slot.id, rec) : tx.add('record', rec), { say: `Recorded ${slot.edge}` }); };
  return html`<div class="filing">
    <label class="field"><span>${slot.edge}</span><input class="cell" value=${text} spellcheck=${false} aria-invalid=${value ? null : 'true'}
      ref=${el => el && !el.dataset.on && (el.dataset.on = 1, el.focus(), el.select())} onInput=${e => setText(e.target.value)}
      onKeyDown=${e => { if (e.key === 'Enter') { e.preventDefault(); keep(); } }} /></label>
    <p class="meta">${was.edge} <s class="del">${short(was.value)}</s>${next && next.value !== was.value ? html` <span class="add">${short(next.value)}</span>` : null}</p>
  </div>`;
}

// A value with two answers: both, each with who gave it; choosing one keeps it.
function Answers({ g }) {
  return html`<span class="answers">${g.rows.map(x => html`<button class="btn ghost" key=${x.row.id} disabled=${App.readOnly.value}
    onClick=${() => App.change(tx => tx.keep(x.row.id), { say: `Kept ${T.outputText(x.row)}` })}>${T.outputText(x.row)}<span class="who">${x.who}</span></button>`)}</span>`;
}

// A record's output, or a blank one's, in place: typed, chosen or ticked; named `label`.
function Output({ id, slot, label }) {
  // An error where the value would be: what it needs, in words ("Needs Fiscal Year End"), its code on hover;
  // with no words, its code, in red. Clicked, the bar says why.
  if (slot?.error) { const { code, msg } = slot.error.error, say = msg?.replace(/\.$/, '');
    return html`<button class=${'errv' + (say ? '' : ' err')} data-tip=${say ? code : null} aria-label=${say ? `${say} (${code})` : null} onClick=${() => emit('why-open', slot.error.id)}>${say || code}</button>`; }
  const g = id && disagreeing.value.get(id);
  if (g) return html`<${Answers} g=${g} />`;
  const r = id ? recs()[id] : null, f = !!id && fx(id), o = !!id && over(id);
  const k = r ? null : slot.type ? slot : kindAt(tree(slot.at), slot.edge);
  const type = r ? T.typeOf(r) : k.type, set = out => put(id, slot, out);
  const more = !r ? null : !f ? html`<${Versions} id=${id} />` : r.field === 'date' ? html`<${Filed} id=${id} />` : null;
  return type === 'tag' ? html`<${TagBox} r=${r} fx=${f} over=${o} label=${label} flip=${() => flip(id, slot)} change=${() => flipChange(id, slot)}>${more}</${TagBox}>`
    : type === 'choice' ? html`<${Choice} r=${r} id=${id} fx=${f} over=${o} put=${set} label=${label} options=${r ? (r.args ? slot.options ?? [] : kindAt(tree(r.at), r.edge).options) : k.options ?? []}>${more}</${Choice}>`
    : html`<${Field} r=${r} id=${id} fx=${f} over=${o} put=${set} label=${label} due=${id && dueOf(id)} datatype=${r?.field ?? k.datatype} auto=${!r && slot.auto}>${more}</${Field}>`;
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
  return [...items, ...(items.length ? ['-'] : []), { label: 'Value', run: start('field') }, { label: 'Tag', run: start('tag') }, { label: 'Choice', run: start('choice') }, '-',
    { label: 'Relation…', run: () => menu(anchor, others(), { search: true }) }, ...(recs()[at].kind && !linkOf(at) ? [{ label: 'Document…', run: () => linkAdd(anchor, at) }] : [])];
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

// An entry's row. Its grip drags it, and clicked opens its menu, as the context-menu key does from its value.
// A tag is a checkbox row, its box before its name, as the two-box panel draws one; its entries beneath it.
function Entry({ it, at, depth }) {
  const r = it.id ? recs()[it.id] : null, f = !!r && fx(it.id), sibs = () => slots(at).filter(s => s.id).map(s => s.id);
  const tag = r ? 'tag' in r : !it.error && kindAt(tree(at), it.edge).type === 'tag';
  const keyMenu = e => { if (r && (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10'))) { e.preventDefault(); entryMenu(e.target, it.id); } };
  const k = html`<div class="k"><${Label} it=${it} fx=${f} /></div>`, v = html`<div class="v ctl"><${Output} id=${it.id} slot=${it} label=${it.edge} /></div>`;
  return html`<div class="ent" data-drag=${r ? at : null}>
    <div class=${'row' + (tag ? ' chk' : '') + (r?.tag === false ? ' ruled' : '')} data-key=${it.id ?? `${at}|${it.edge}`} style=${`--depth:${depth}`} onKeyDown=${keyMenu}>
      ${r ? html`<button class="grip" tabindex="-1" aria-hidden="true" onPointerDown=${e => drag(e, (from, i) => reorder(at, moved(sibs(), from, i)), g => entryMenu(g, it.id))}>${GRIP}</button>` : null}
      ${tag ? [v, k] : [k, v]}
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

// A record's entries; `offer`ed, with every entry it could have and hasn't, each blank, to fill at once.
function Entries({ at, depth, offer }) {
  const d = draft.value;
  return html`${slots(at, offer).map(it => html`<${Entry} key=${it.id ?? it.edge} it=${it} at=${at} depth=${depth} />`)}
    ${d?.at === at ? html`<${Draft} key=${JSON.stringify(d)} d=${d} depth=${depth} />` : null}`;
}

// ---- Relatives, documents and look: sections, each folding under its heading ----
function Section({ title, n, shut = false, act, id, children }) {
  const [open, setOpen] = useState(!shut);
  return html`<section class=${open ? 'open' : ''} data-key=${id}><h3 class="sect"><button class="fold" aria-expanded=${open} onClick=${() => setOpen(!open)}>${title}</button>
    ${n ? html`<span class="n">${n}</span>` : null}${act}</h3>${open ? children : null}</section>`;
}
const plus = (label, run) => App.readOnly.value ? null : html`<button class="btn icon" aria-label=${label} data-tip=${label} onClick=${run}>${icon('plus')}</button>`;

// What a relation with a relative says: its role (its option or value, else the reason a formula gives it,
// as the formula bar gives it), then at most three facts: a check that fails, in red ("Capacity Held: No");
// the others in it ("via GP III"); words, options and values recorded at it (a second percentage saying
// which, "0% voting", where it says something else); dates (a start or an end saying so). Words that say the
// role more fully ("Director (Chair)") are the role. The document that evidences it is a link, to open.
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
  const facts = [...at.filter(([, e]) => e.tag === false).map(([, e]) => ({ text: `${e.edge}: No`, no: true })),
    ...it.rest.map(a => ({ text: `${lower(a.edge)} ${termOf(a.at)}` })),
    ...words.filter(w => !(role && T.same(w, role))).map(text => ({ text })),
    ...at.filter(([, e]) => 'field' in e && !['text', 'date', 'document'].includes(e.field)).map(([, e]) => ({ text: value(e) })).filter(f => f.text),
    ...at.filter(([, e]) => e.field === 'date').map(([e, f]) => ({ date: e, text: `${N().isStart(tree(e)) ? 'since' : N().isEnd(tree(e)) ? 'until' : lower(f.edge)} ${short(f.value)}` }))];
  const ev = relatives(it.rid).docs.find(d => linkOf(d.obj));
  return { role: role ?? (facts.length ? null : because(it.rid)?.cite), facts: facts.slice(0, 3),
    doc: ev && { name: nameOf(ev.obj), href: SharePoint.href(recs()[linkOf(ev.obj)].value) } };
}
const fact = (f, first) => { const text = first ? upper(f.text) : f.text; return f.date ? dated(f.date, text) : f.no ? html`<span class="no">${text}</span>` : text; };
const facts = (list, first) => list.map((f, i) => html`${i ? ' · ' : ''}${fact(f, first && !i)}`);

// A relation said as a sentence, its first side first: "Fund III is an owner of Fund III Blocker", "Margaret
// A. Chen is a managing member of GP III", and any further side after ("…, via GP III"). `side(edge, first)`
// says who's at an edge; an option says the role.
function sentence(edges, side, { choice, not } = {}) {
  const [e0, e1, ...rest] = edges, r = choice ?? e0;
  return html`${side(e0, true)} is ${not ? 'not ' : ''}${article(r)} ${lower(r)} of ${side(e1)}${rest.map(e => html`, ${lower(e)} ${side(e)}`)}`;
}
// A relation ruled out, said plainly: "Not a remote affiliate of the BDC". Where a formula rules it out
// because another relation holds between the two, that one is said after it, with the clause that rules:
// "Not a remote affiliate: a close affiliate of the BDC (§57(b))".
function notText(it, held) {
  const why = because(it.rid), [, head, clause] = /^(.*?)\s*(\(.*\))?$/.exec(why?.label ?? ''), cite = why && why.cite !== why.label ? `(${why.cite})` : clause;
  const by = held.find(x => x.obj === it.obj && T.same(nameOf(x.rid), head)), rest = (by ?? it).rest.map(a => `, ${lower(a.edge)} ${termOf(a.at)}`).join('');
  const not = `Not ${article(it.mine)} ${lower(it.mine)}`;
  return by ? `${not}: ${article(by.mine)} ${lower(by.mine)} of ${termOf(it.obj)}${rest}${cite ? ' ' + cite : ''}`
    : `${not} of ${termOf(it.obj)}${rest}${why ? `: ${lower(why.cite)}` : ''}`;
}

function Relatives({ id }) {
  const { lists, docs, nots } = relatives(id);
  const add = (e, items) => {
    const it = items[0], own = within(id), have = new Set(items.map(x => x.obj)), seen = new Set(), out = [];
    for (const s of N().fitting(App.schema.value, loose(tree(it.rid)))) {
      const sm = s.args.length === 2 && s.args.find(a => T.same(a.edge, it.mine)), sl = sm && s.args.find(a => a !== sm), at = sm && own.find(x => T.narrower(tree(x), sm.loc));
      if (at) for (const x of Object.keys(recs())) if (!('field' in recs()[x]) && !seen.has(x) && !have.has(objectOf(x)) && objectOf(x) !== id && T.narrower(tree(x), sl.loc)) {
        seen.add(x);
        out.push({ label: nameOf(objectOf(x)), run: () => 'tag' in s.out ? App.change(tx => tx.add('record', { args: [{ edge: sm.edge, at }, { edge: sl.edge, at: x }], tag: true })) : select([id, objectOf(x)]) });
      }
    }
    menu(e.currentTarget, out.sort((a, b) => a.label.localeCompare(b.label)), { search: true });
  };
  // A relative takes two lines: its name and role, then the facts; with no role, the facts take its place.
  const item = it => { const f = fx(it.rid), d = detail(it);
    return html`<div class="row rel" key=${it.rid}>
      <div class=${'k' + (d.role || d.facts.length || d.doc ? '' : ' wide')}><${Go} to=${it.obj} cls=${f ? 'fx' : ''} title=${nameOf(it.obj)}>${shortOf(it.obj)}</${Go}></div>
      <div class="v">${d.role || d.facts.length ? html`<${Go} to=${it.rid} cls=${f ? 'fx' : ''}>${d.role ?? facts(d.facts, true)}</${Go}>` : null}
        ${d.doc ? html`<a class="btn icon open" href=${d.doc.href} target="_blank" rel="noopener" aria-label=${`Open ${d.doc.name}`} data-tip=${d.doc.name}>${OPEN}</a>` : null}
        ${entriesAt(it.rid).filter(dueOf).map(e => html`<${Filed} key=${e} id=${e} />`)}</div>
      ${d.role && d.facts.length ? html`<div class="facts">${facts(d.facts)}</div>` : null}</div>`; };
  // A document by its name, its first choice and date beneath, and a way to open it.
  const docRow = it => { const l = recs()[linkOf(it.obj)], s = slots(it.obj).filter(x => x.id).map(x => recs()[x.id]);
    const sub = [s.find(x => 'choice' in x)?.choice, s.find(x => x.field === 'date')].filter(Boolean).map(x => x.value ? short(x.value) : x);
    return html`<div class="doc" key=${it.rid}><${Go} to=${it.obj}>${nameOf(it.obj)}</${Go}>
      ${l ? html`<a class="btn icon open" href=${SharePoint.href(l.value)} target="_blank" rel="noopener" aria-label="Open" data-tip="Open">${OPEN}</a>` : null}
      ${sub.length ? html`<span class="meta">${sub.join(' · ')}</span>` : null}</div>`; };
  // Lists someone entered first; those a formula gave, folded, after. Documents show once there are any.
  const worked = items => items.every(it => fx(it.rid)), typing = linking.value === id;
  const held = lists.flatMap(([, items]) => items);
  return html`${nots.length ? html`<div class="nots">${nots.map(it => html`<div class="row" key=${it.rid}><div class="k wide"><${Go} to=${it.rid}>${notText(it, held)}</${Go}></div></div>`)}</div>` : null}
    ${[...lists.filter(([, x]) => !worked(x)), ...lists.filter(([, x]) => worked(x))].map(([name, items]) => html`<${Section} key=${name} id=${'list:' + name} title=${name} n=${items.length}
      shut=${worked(items)} act=${items[0].rest.length || worked(items) ? null : plus(`Add to ${name}`, e => add(e, items))}>${items.map(item)}</${Section}>`)}
    ${docs.length || typing ? html`<${Section} title="Documents" n=${docs.length} act=${recs()[id].kind ? plus('Link a document', e => linkAdd(e.currentTarget, id)) : null}>
      ${docs.map(docRow)}
      ${typing ? html`<div class="row"><div class="k wide"><input class="cell" placeholder="Link" aria-label="Link" ref=${el => el && !el.dataset.on && (el.dataset.on = 1, el.focus())}
        onKeyDown=${e => { if (e.key === 'Enter') { const u = T.clean(e.target.value); if (T.isAddress(u)) { linking.value = null; link(id, u); } else e.target.setAttribute('aria-invalid', 'true'); } else if (e.key === 'Escape') { e.stopPropagation(); linking.value = null; } }}
        onBlur=${() => { linking.value = null; }} /></div></div>` : null}</${Section}>` : null}`;
}

// Look: each format property set for a mark and its value, under where it comes from, said once, as an entry's
// entries sit under it; shown once there is one. A color goes by PowerPoint's name for it, a code only for one of the user's own; a size or a
// weight is the slide's, to the half point, as the format bar has it. Format is what a text says: its Label.
const LABELS = { Format: 'Label' };
const colorName = v => (typeof FormatBar !== 'undefined' && FormatBar.colorName?.(v)) || v.toUpperCase();
const val = (label, v) => typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v) ? html`<i class="chip" style=${`background:${v}`} />${colorName(v)}`
  : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : label === 'Size' || label === 'Weight' ? `${Math.round(Scene.toSlide(App.scene.value?.page, v) * 2) / 2} pt`
  : label === 'Shape' ? SHAPES[v] ?? upper(String(v)) : upper(String(v));
function LookSection({ look, reset }) {
  if (!look.length) return null;
  const from = [...new Set(look.map(x => x.from))];
  return html`<${Section} title="Look" act=${reset}>${from.map(f => html`
    ${f ? html`<div class="row src" key=${f}><div class="k wide">${f}</div></div>` : null}
    ${look.filter(x => x.from === f).map(x => html`<div class="row" key=${x.label} style=${`--depth:${f ? 1 : 0}`}><div class="k">${LABELS[x.label] ?? x.label}</div><div class="v">${val(x.label, x.value)}</div></div>`)}`)}</${Section}>`;
}
// A place on the page, as entered, in points on the slide (the page is drawn smaller to fit it, by its
// scale), so the numbers are the ones PowerPoint shows: typed over to move it.
const PLACES = [['Left', 'x'], ['Top', 'y'], ['Width', 'w'], ['Height', 'h']];
const Place = ({ at, put, reset, keys = 'xyw' }) => { const page = App.scene.value?.page;
  return html`<${Section} title="Position" act=${reset}>
  ${PLACES.filter(([, k]) => keys.includes(k) && at[k] != null).map(([label, k]) => html`<div class="row" key=${k}><div class="k">${label}</div><div class="v ctl">
    <${Field} r=${{ field: 'number', value: Math.round(Scene.toSlide(page, at[k] / Scene.PT)) }} datatype="number" label=${label} put=${out => out && put(k, Math.round(Scene.fromSlide(page, out.value) * Scene.PT * 2) / 2)}><span class="unit">pt</span></${Field}></div></div>`)}</${Section}>`; };
const resetting = (own, labels, say) => App.readOnly.value || !own.some(x => labels(x.label)) ? null
  : html`<button class="btn ghost reset" onClick=${() => App.change(tx => own.filter(x => labels(x.label)).forEach(x => tx.remove(x.note)), { say })}>Reset</button>`;

// A record's look, as the view's scene has it: each property a note decides, from this box (or line) alone, a
// style's output (by its caption, the style's name first where the caption doesn't say it), or the chart's
// default, in that order; and its place, where one is entered.
function Look({ id }) {
  const sc = App.scene.value, v = sc.view, t = tree(id), n = N(), pos = recs()[id].kind ? n.position(t, v) : null;
  const rank = x => x.pattern.id === id ? 0 : x.view ? 1 : 2;
  const from = x => x.pattern.id === id ? (recs()[id].args ? 'This line' : 'This box') : !x.view ? 'Default'
    : (s => { const c = Scene.captionOf(n, x.pattern, v); return T.norm(c).startsWith(T.norm(s)) ? c : `${s}: ${c}`; })(Scene.styleName(n, T.bare(x.pattern)));
  const look = Object.entries(sc.byId.get(id)?.settings ?? {}).filter(([label, s]) => s?.note && label !== 'Shown' && label !== 'Position')
    .map(([label, s]) => ({ label, value: s.value, from: from(s.note), rank: rank(s.note) })).sort((a, b) => a.rank - b.rank);
  const own = [...Object.values(n.formats(t, v)).map(r => r.note), n.resolve('Position', t, v)?.note].filter(x => x && x.view === v && x.pattern.id === id);
  const move = (k, x) => App.change(tx => tx.note('Position', t, { ...pos, [k]: x }, { view: v }), { dated: false });
  return html`<${LookSection} look=${look} reset=${resetting(own, l => l !== 'Position', 'Reset the look')} />
    ${pos ? html`<${Place} at=${pos} put=${move} reset=${resetting(own, l => l === 'Position', 'Reset the position')} />` : null}`;
}

// ---- The views of a selection ----
// A header: its eyebrow, where it says more than the title does, and the title, or `children` in its place.
function Head({ path = [], title, children }) {
  const said = path.length && !(path.length === 1 && T.same(path[0].label, title));
  return html`<header class="ih">
    ${said ? html`<nav class="path">${path.map(p => p.go ? html`<button class="lk" onClick=${p.go}>${p.label}</button>` : html`<span>${p.label}</span>`)}</nav>` : null}
    ${children ?? html`<h2 class="ih-title">${title}</h2>`}</header>`;
}
// Add: what a record (at `at`), or a panel's own `items`, can have that it hasn't.
const AddRow = ({ at, items = anchor => addItems(at, anchor) }) => App.readOnly.value ? null
  : html`<div class="row addrow"><div class="k wide"><button class="btn ghost add-entry" onClick=${e => menu(e.currentTarget, items(e.currentTarget))}>${icon('plus')}Add</button></div></div>`;

function RecordView({ id }) {
  const r = recs()[id];
  useLayoutEffect(() => {
    const a = aim.peek();
    if (!a) return;
    aim.value = null;
    // A due date is aimed at to be filed, so its Filed… takes the focus; anything else, its value.
    const el = document.querySelector(`.insp [data-key="${CSS.escape(a)}"]`);
    el?.scrollIntoView({ block: 'center' });
    (el?.querySelector('.filed') ?? el?.querySelector('input, textarea, button.sel, button.tag, .errv'))?.focus();
  });
  if (!r) {
    const rows = App.shown.value.item(App.chart.value, id);
    return html`<div class="empty"><span>${rows.length ? `Not in the chart as of ${short(App.day.value)}` : 'Deleted'}</span>
      ${rows.length && Shell.time.value ? html`<button class="btn" onClick=${() => Shell.at(null)}>Today</button>` : null}</div>`;
  }
  const path = T.pathOf(recs(), id), first = slots(id).find(s => s.id && 'choice' in recs()[s.id]), name = r.kind ? null : nameOf(id);
  // An object's title is its Name, typed over (cleared, it stays); a relation's or an entry's is what it is,
  // with its tag's box before it, as the formula bar has it.
  const head = r.kind
    ? html`<${Head} path=${[{ label: r.kind, go: () => select([general({ kind: r.kind })]) }, ...(first ? [{ label: recs()[first.id].choice, go: () => select([first.id]) }] : [])]}>
        <${Field} r=${recs()[entryNamed(id, 'Name')]} datatype="text" ph="Name" title put=${out => out && put(entryNamed(id, 'Name'), { at: id, edge: 'Name' }, out)} /></${Head}>`
    : html`<${Head} title=${name} path=${r.args ? [] : path.slice(0, -1).map(x => ({ label: N().segmentOf(recs(), x), go: () => select([x]) }))}>
        ${'tag' in r ? html`<h2 class="ih-title ih-tag" data-key=${id}><${Output} id=${id} slot=${r} label=${name} /><span>${name}</span></h2>` : null}</${Head}>`;
  const sides = r.args ? N().sides(recs(), id) : [];
  return html`<div class="insp">${head}
    <div class="rows">
      ${sides.map(a => html`<div class="row" key=${a.edge}><div class="k">${a.edge}</div><div class="v"><${Go} to=${objectOf(a.at)}>${nameOf(objectOf(a.at))}</${Go}>
        ${a.at !== objectOf(a.at) ? html`<span class="muted"> › ${T.pathOf(recs(), a.at).slice(1).map(x => N().segmentOf(recs(), x)).join(' › ')}</span>` : null}</div></div>`)}
      ${r.kind || 'tag' in r ? null : html`<div class="row" data-key=${id}><div class="k"><span class="lbl">${name}</span></div>
        <div class="v ctl"><${Output} id=${id} slot=${r} label=${name} /></div></div>`}
      ${'field' in r ? null : html`<${Entries} at=${id} depth=${0} /><${AddRow} at=${id} />`}
    </div>
    <${Relatives} id=${id} />
    ${(r.kind || r.args) && App.scene.value?.byId.has(id) ? html`<${Look} id=${id} />` : null}
  </div>`;
}

// A style's outputs, each as the legend draws it (Scene's swatch), with its caption.
function Swatch({ sw, off }) {
  const stroke = sw.Outline === 'none' ? 'none' : sw.Outline, dash = Scene.dash(sw.Dash, sw.Weight);
  return html`<svg class=${'sw' + (off ? ' off' : '')} viewBox="0 0 28 16" aria-hidden="true">${sw.kind === 'line'
    ? html`<path d="M2 8H26" fill="none" stroke=${stroke} stroke-width=${Math.min(sw.Weight * Scene.PT, 3)} stroke-dasharray=${dash} />`
    : sw.kind === 'text' ? html`<text x="14" y="12" text-anchor="middle" font-family=${Scene.fontFamily(sw.Font)} font-size="11" fill=${sw.Color}
        font-weight=${sw.Bold ? 700 : 400} font-style=${sw.Italic ? 'italic' : 'normal'}>Aa</text>`
    : html`<path d=${Scene.path(sw.Shape ?? 'rect', 25, 13)} transform="translate(1.5 1.5)" fill=${sw.Fill === 'none' ? 'none' : sw.Fill} stroke=${stroke}
        stroke-width=${Math.min(sw.Weight * Scene.PT, 2.5)} stroke-dasharray=${dash} />`}</svg>`;
}
// A view's styles (those reaching `only`, if given), each with the outputs it formats: an output that only
// shows or hides is a filter, which the legend doesn't key and nor does this.
const stylesOf = (v, only) => N().styles(v).filter(s => !only || T.narrower(only, s.pattern) || T.narrower(s.pattern, only))
  .map(s => ({ ...s, outputs: s.outputs.filter(o => Object.keys(o.formats).some(k => k !== 'Shown')) })).filter(s => s.outputs.length);
function Styles({ v, only }) {
  const n = N(), all = n.styles(v), list = stylesOf(v, only);
  // Dragged among those listed; the rest keep their places in the view's order.
  const order = (from, i) => { const q = moved(list, from, i), keys = new Set(list.map(s => s.key));
    App.change(tx => all.map(s => keys.has(s.key) ? q.shift() : s).forEach((s, k) => s.order !== k + 1 && tx.note('Order', s.pattern, k + 1, { view: v }))); };
  // A caption typed as an output's own name is no caption.
  const cap = (os, text) => App.change(tx => os.forEach(o => tx.note('Caption', o.pattern, text && text !== Scene.outputName(n, o.pattern) ? text : undefined, { view: v })));
  // A style's outputs drawn alike and captioned alike are one row, as in the Key: its swatch, its caption (the
  // Key's word, typed over), and beneath, the outputs, where they say other than the caption.
  const rowsOf = s => [...s.outputs.reduce((m, o) => { const sw = Scene.swatchOf(o.pattern, o.formats), caption = Scene.captionOf(n, o.pattern, v), k = JSON.stringify([caption, sw, o.formats.Shown === false]);
    (m.get(k) ?? m.set(k, { caption, sw, off: o.formats.Shown === false, os: [] }).get(k)).os.push(o); return m; }, new Map()).values()];
  const grip = () => only || App.readOnly.value ? null : html`<button class="grip" tabindex="-1" aria-hidden="true" onPointerDown=${e => drag(e, order)}>${GRIP}</button>`;
  const output = (g, lone) => {
    const names = g.os.map(o => Scene.outputName(n, o.pattern)), said = names.length > 1 || !T.same(names[0], g.caption);
    return html`<div class=${'row out' + (lone ? ' lone' : '')} key=${T.key(g.os[0].pattern)}>${lone ? grip() : null}<div class="k"><${Swatch} sw=${g.sw} off=${g.off} /></div>
      <div class="v"><${Field} r=${{ field: 'text', value: g.caption }} datatype="text" label=${names.join(', ')} cls=${g.off ? ' off' : ''} put=${out => cap(g.os, out?.value ?? '')} />
        ${said ? html`<span class="oname">${names.join(', ')}</span>` : null}</div></div>`;
  };
  // A style whose one row is captioned as the style is named is that row alone: Name, not Name over Name.
  return list.map(s => { const rows = rowsOf(s), name = Scene.styleName(n, s.pattern), lone = rows.length === 1 && rows[0].os.length === 1 && T.same(rows[0].caption, name) && T.same(Scene.outputName(n, rows[0].os[0].pattern), name);
    return html`<div class="ent style" data-drag=${only ? null : 'style'} key=${s.key}>
      ${lone ? output(rows[0], true) : html`<div class="row" style="--depth:0">${grip()}<div class="k sname"><${Go} to=${general(s.pattern)}>${name}</${Go}></div></div>${rows.map(g => output(g))}`}
    </div>`; });
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
  </div>`;
}

// ---- A free shape: its text, its look and its place; the Key: its title, its columns and its rows ----
const SHAPES = { text: 'Text box', legend: 'Key', rect: 'Rectangle', rounded: 'Rounded rectangle' };
function ShapeView({ id, part }) {
  const row = App.shown.value.item(App.chart.value, id).at(-1), m = App.scene.value?.byId.get(id), n = N(), v = App.scene.value?.view, still = App.readOnly.value;
  const set = (changes, say) => App.change(tx => tx.update(id, changes), { dated: false, say });
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
    ${m && g !== 'line' ? html`<${Place} at=${m} keys=${g === 'text' || key ? 'xyw' : 'xywh'} put=${(k, x) => set({ [k]: x })} />` : null}
  </div>`;
}

// Prose typed over in place, its box growing with it: kept on leaving, put back with Esc. `auto` focuses
// it; `done` hears that it was left as it was.
function Prose({ text, put, label, cls = 'desc', auto, done }) {
  const [typed, setTyped] = useState(null), now = useRef(null), type = t => { now.current = t; setTyped(t); };
  return html`<textarea class=${'cell prose ' + cls} rows="1" value=${typed ?? text} disabled=${App.readOnly.value} aria-label=${label} ref=${el => auto && el && !el.dataset.on && (el.dataset.on = 1, el.focus())}
    onInput=${e => type(e.target.value)} onBlur=${() => { const t = now.current; type(null); if (t !== null && T.clean(t) !== T.clean(text)) put(t.trim()); else done?.(); }}
    onKeyDown=${e => { if (e.key === 'Escape') { e.stopPropagation(); type(null); e.target.blur(); } }} />`;
}

// Two records: what holds between them, each said as a sentence with what's recorded at it beneath; then,
// behind Add a relation, what else someone could enter between them (what a formula works out isn't
// offered). A side fills a relation's parameter through itself or a record located in it that fits there (a
// fund is a GP's Fund Owned through its Entity Type).
function RelateView({ a, b }) {
  const r = recs(), n = N(), [picks, setPicks] = useState({}), [form, setForm] = useState(null), [adding, setAdding] = useState(false), [fresh, setFresh] = useState(null), none = useRef(null), still = App.readOnly.value;
  if (!r[a] || !r[b]) return html`<div class="empty">Not in the chart</div>`;
  const ca = within(a).filter(x => !('field' in r[x])), cb = within(b).filter(x => !('field' in r[x])), inB = new Set(cb), held = new Map(), open = new Map();
  for (const x of ca) for (const rid of relationsAt(x)) {
    const sa = r[rid].args.find(g => g.at === x), sb = r[rid].args.find(g => g !== sa && inB.has(g.at));
    if (sb && !held.has(rid)) held.set(rid, { id: rid, name: nameOf(rid), key: [sa.edge, sb.edge, x, sb.at].join('|').toLowerCase() });
  }
  const taken = new Set([...held.values()].map(x => x.key));
  for (const s of Object.values(App.schema.value)) if (s.args?.length > 1 && !n.resolve('Formula', T.bare(s))) s.args.forEach((pa, i) => s.args.forEach((pb, j) => {
    if (i === j) return;
    const la = ca.find(x => T.narrower(tree(x), pa.loc)), lb = cb.find(x => T.narrower(tree(x), pb.loc)), key = [pa.edge, pb.edge, la, lb].join('|').toLowerCase();
    if (!la || !lb || (taken.has(key) && s.args.length === 2)) return;
    const row = open.get(key) ?? open.set(key, { key, name: n.name(T.bare(s)), ea: pa.edge, eb: pb.edge, la, lb, s, rest: s.args.filter((_, k) => k !== i && k !== j), options: [] }).get(key);
    if ('choice' in s.out && !row.options.includes(s.out.choice)) row.options.push(s.out.choice);
  }));
  const slotOf = x => { const got = x.rest.map(p => picks[x.key + p.edge]); return got.every(Boolean) ? { args: [{ edge: x.ea, at: x.la }, { edge: x.eb, at: x.lb }, ...x.rest.map((p, k) => ({ edge: p.edge, at: got[k] }))], options: x.options } : null; };
  const pick = (e, x, p) => menu(e.currentTarget, Object.keys(r).filter(y => !('field' in r[y]) && T.narrower(tree(y), p.loc)).map(y => ({ label: nameOf(objectOf(y)), run: () => setPicks({ ...picks, [x.key + p.edge]: y }) })), { search: true });
  const side = (at, first) => first ? shortOf(objectOf(at)) : termOf(at);

  // What holds: a tag's box first, the sentence (italic where a formula gives it, and why beneath, as the
  // formula bar says it), a value after it; and what's recorded at it, as the record's own entries are, one
  // just related with every entry it could have, to fill at once.
  const heldRow = x => { const rel = r[x.id], f = fx(x.id), at = e => rel.args.find(g => T.same(g.edge, e)).at, why = f && because(x.id)?.cite;
    return html`<div class=${'rr' + (rel.tag === false ? ' ruled' : '')} key=${x.id} data-key=${x.id}>
        <span class="ctl">${'tag' in rel ? html`<${Output} id=${x.id} slot=${rel} label=${x.name} />` : null}</span>
        <${Go} to=${x.id} cls=${'nm' + (f ? ' fx' : '')}>${sentence(n.edges(tree(x.id)), (e, first) => side(at(e), first), { choice: rel.choice, not: rel.tag === false })}</${Go}>
        <span class="val">${'field' in rel ? html`<${Output} id=${x.id} slot=${rel} label=${x.name} />` : null}</span>
        ${why ? html`<span class="why">${why}</span>` : null}
      </div>
      ${f ? null : html`<div class="rr-at" key=${x.id + '@'}><${Entries} at=${x.id} depth=${0} offer=${x.key === fresh} /></div>`}`; };
  // What could: a tag's box to tick, or an option or value to give; a further side, picked in the sentence.
  const relate = (x, slot, out) => { setFresh(x.key); put(null, slot, out); };
  const openRow = x => { const slot = slotOf(x), tag = 'tag' in x.s.out, fill = e => T.same(e, x.ea) ? x.la : T.same(e, x.eb) ? x.lb : null;
    const say = (e, first) => { if (fill(e)) return side(fill(e), first);
      const p = x.rest.find(q => T.same(q.edge, e)), y = picks[x.key + p.edge];
      return html`<button class=${'sel dd' + (y ? '' : ' ph')} aria-label=${`${p.edge}: ${y ? nameOf(objectOf(y)) : 'none'}`} onClick=${ev => pick(ev, x, p)}><span>${y ? shortOf(objectOf(y)) : lower(p.edge)}</span></button>`; };
    return html`<div class="rr" key=${x.key} data-key=${x.key}>
      <span class="ctl">${!tag ? null : slot ? html`<${TagBox} label=${x.name} flip=${() => { relate(x, slot, { tag: true }); emit('tag-flip', slot); }} />` : html`<span class="tag" aria-disabled="true" />`}</span>
      <span class="nm">${sentence(n.edges(x.s), say)}</span>
      <span class="val">${tag || !slot ? null : 'choice' in x.s.out ? html`<${Choice} options=${x.options} label=${x.name} ph=${x.name} put=${out => relate(x, slot, out)} />`
        : html`<${Field} datatype=${x.s.out.field} label=${x.name} ph=${x.name} put=${out => out && relate(x, slot, out)} />`}</span>
    </div>`; };
  const make = () => {
    const [name, ra, rb] = ['name', 'ra', 'rb'].map(k => T.clean(form[k]));
    if (!name || !ra || !rb || T.same(ra, rb)) return;
    const p = { args: [{ edge: ra, loc: {} }, { edge: rb, loc: {} }] };
    if (App.change(tx => { tx.add('record', { args: [{ edge: ra, at: a }, { edge: rb, at: b }], tag: true }); tx.note('Name', p, name);
      tx.note('Order', p, 1, { param: ra }); tx.note('Order', p, 2, { param: rb }); })) setForm(null);
  };
  const inp = (k, ph) => html`<input class="cell" placeholder=${ph} aria-label=${ph} value=${form[k]} onInput=${e => setForm({ ...form, [k]: e.target.value })}
    onKeyDown=${e => { if (e.key === 'Enter') make(); else if (e.key === 'Escape') { e.stopPropagation(); setForm(null); } }} ref=${k === 'name' ? el => el && !el.dataset.on && (el.dataset.on = 1, el.focus()) : null} />`;
  // What someone entered first, then what a formula gives; each by name, then the first's side first.
  const order = (x, y) => fx(x.id) - fx(y.id) || x.name.localeCompare(y.name);
  const holds = [...held.values()].sort(order), could = [...open.values()].sort((x, y) => x.name.localeCompare(y.name) || (y.la === a) - (x.la === a));
  const name = x => html`<${Go} to=${x}>${nameOf(objectOf(x))}${x !== objectOf(x) ? html`<span class="muted"> › ${n.segmentOf(r, x)}</span>` : null}</${Go}>`;
  // What else could hold, once asked for; at once where nothing did.
  const ghost = (label, run) => html`<div class="rr new"><button class="btn ghost add-entry" onClick=${run}>${icon('plus')}${label}</button></div>`;
  none.current ??= !holds.length;
  return html`<div class="insp">
    <header class="ih"><h2 class="ih-title">${name(a)} <span class="and">and</span> ${name(b)}</h2></header>
    ${holds.length ? html`<div class="relate">${holds.map(heldRow)}</div>` : null}
    ${still ? null : !adding && !none.current ? html`<div class="relate">${ghost('Add a relation', () => setAdding(true))}</div>` : html`<div class="relate">
      ${could.map(openRow)}
      ${form ? html`<div class="rr new"><span class="ctl"><span class="tag yes" /></span><span class="form">${inp('name', 'Name')}${inp('ra', 'Role')}${inp('rb', 'Role')}</span></div>`
        : ghost('New relation', () => setForm({ name: '', ra: '', rb: '' }))}
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

function Many({ ids }) {
  return html`<div class="insp"><${Head} title=${`${ids.length} selected`} /><div class="rows">
    ${ids.filter(x => recs()[x]).map(x => html`<div class="row" key=${x}><div class="k wide"><${Go} to=${x}>${nameOf(objectOf(x))}</${Go}></div></div>`)}</div></div>`;
}

// What a selection key names: a free shape (or a row of a Key) has its own panel; a relation's text in one box
// is the relation.
function Inspector() {
  const sel = Shell.selection.value, p = sel.length === 1 && Shell.pattern(sel[0]);
  if (!App.chart.value) return null;   // opening
  if (p) return html`<${GeneralView} key=${sel[0]} p=${p} />`;
  if (sel.length === 2) return html`<${RelateView} key=${sel.join()} a=${sel[0]} b=${sel[1]} />`;
  if (sel.length > 2) return html`<${Many} ids=${sel} />`;
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
// Going to one selects the record it's at and aims at its row; an error, which is no record, at the row
// where its value would be, with the formula that gave it open in the bar.
const attention = computed(() => {
  const w = App.computed.value, items = [];
  const go = (id, edge, why) => () => {
    const obj = recs()[id] && objectOf(id);
    if (!obj) return;
    aim.value = edge ? `${id}|${edge}` : id;
    select([obj]);
    if (why) emit('why-open', why);
  };
  for (const [id, r] of Object.entries(w.records)) {
    const due = r.field === 'date' && dueOf(id);
    if (due) items.push({ kind: due, go: go(id) });
    if (!('field' in r)) for (const b of blanksAt(id)) items.push({ kind: 'blank', go: go(id, b.edge) });
  }
  for (const e of w.errors) { const p = placeOf(e) ?? e.args?.[0]; items.push({ kind: 'error', go: go(p?.at, p?.edge, e.id) }); }
  return items;
});

Shell.register('inspector', { mount(el) { render(html`<${Inspector} />`, el); return () => render(null, el); } });
Shell.register('attention', { items: () => attention.value });
// Find reaches every record by its name, and every list of relatives by whose it is (AIV-1 › Signatories).
Shell.register('find', { items: () => {
  const st = App.state.peek(), n = App.notes.peek(), out = [];
  for (const ids of T.index(st).kinds.values()) for (const id of ids) if (!T.isView(st[id])) {
    out.push({ key: id, label: n.nameOf(st, id), names: [n.shortOf(st, id)].filter(s => s && s !== n.nameOf(st, id)), detail: st[id].kind, run: () => select([id]) });
    for (const [list] of relatives(id).lists) out.push({ of: id, label: `${n.shortOf(st, id)} › ${list}`, detail: 'List', run: () => { aim.value = 'list:' + list; select([id]); } });
  }
  return out;
} });
on('relate-open', d => select(d));
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

return {};
})();
