// The inspector (dendra.md, Part 2): the panel on the right, showing whatever is selected.
//
// Shell.selection, as the inspector reads it:
//   []                        the view: its name, its layout, and its styles in their order
//   [id]                      a record, as a box, a row, a line or a text selects it: its path and name, its
//                             output, its entries as a tree, its relatives by list, its documents, and on a
//                             chart its look and position
//   [a, b]                    two records: every relation the two are in or could be in
//   [Inspector.general(p)]    an entry, relation or kind in general, by its pattern ('~' and its JSON)
// On the shell's bus it emits:
//   'tag-flip'      a tag was switched; detail, its id (or where a new one went)
//   'why-open'      a computed value was clicked; detail, its id
//   'preview'       a tag's checkbox is hovered: the change switching it would make, { removes: [id],
//                   adds: [record with its id] }; null when the pointer leaves
//   'formula-open'  a definition's rows were clicked: { note, pattern }
//   'formula-new'   Formula… was chosen: { at }, the record to work an entry out at
// and takes 'relate-open' ([a, b]) as the selection of the two. It feeds 'attention' with what's overdue,
// blank where required, or in error.
//
// Hooks for parts written alongside it:
//   Scene.settingsOf(id, view) → { [property]: { value, note } }, as the chart last drew the mark
//   A view's layout is the choice Layout (Chart, Table) at its View object, with the choice Rows at Table.

const Inspector = (() => {
const { html, emit, on, select, menu, toast, icon } = Shell;
const { render } = preact;
const { useState, useRef, useLayoutEffect } = preactHooks;
const { signal, computed } = preactSignals;
const T = Tree;

// ---- What the engine says ----
// The computed state; which of its records are computed; which entered ones a formula also covers; errors.
const W = computed(() => {
  const recs = App.state.value, c = App.computed.value;
  return { recs, fx: id => !!c.computed?.[id], over: id => !!c.covered?.[id], errors: c.errors ?? [] };
});
const worked = () => W.value;

// ---- Reading ----
const recs = () => worked().recs;
const N = () => App.notes.value;
const tree = id => T.treeOf(recs(), id);
const entriesAt = id => T.index(recs()).entries.get(id) ?? [];
const relationsAt = id => T.index(recs()).relations.get(id) ?? [];
const within = id => { const out = [id]; for (let i = 0; i < out.length; i++) out.push(...entriesAt(out[i])); return out; };
const objectOf = id => T.objectOf(recs(), id);
const entryNamed = (id, edge) => entriesAt(id).find(e => T.same(recs()[e].edge, edge));
const nameOf = id => recs()[id]?.args ? N().name(tree(id)) : T.objectName(recs(), id);
const shortOf = id => { const s = entryNamed(id, 'Short Name'); return s ? recs()[s].value : nameOf(id); };
const still = () => !!Shell.time.value?.stood;
const general = p => '~' + JSON.stringify(p);
const patternOf = id => { const t = tree(id); return t.args ? T.bare(T.specOf(t)) : { kind: t.kind }; };
// A tree with every label removed but its edges: what renaming an edge or option reaches.
const loose = t => t.args ? { args: t.args.map(a => ({ edge: a.edge, loc: loose(a.loc) })) } : {};
const short = iso => new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const outText = r => 'field' in r ? T.format(r.field, r.value) : 'choice' in r ? r.choice : r.tag ? 'Attested' : 'Ruled out';
const typeName = s => 'field' in s.out ? T.DATATYPES[s.out.field] : 'choice' in s.out ? 'Choice' : 'Tag';
const segment = r => 'choice' in r ? `${r.edge}: ${r.choice}` : r.tag === false ? `Not ${r.edge}` : r.edge;
const where = s => s.kind !== undefined ? s.kind : !s.args ? '' : s.args.length > 1 ? N().name(s) : `${where(s.args[0].loc)} › ${segment({ edge: s.args[0].edge, ...s.out })}`;
const viewObjects = computed(() => (T.index(App.entered.value).kinds.get('view') ?? []).slice()
  .sort((a, b) => (App.notes.value.order(T.treeOf(App.entered.value, a)) ?? Infinity) - (App.notes.value.order(T.treeOf(App.entered.value, b)) ?? Infinity)));
const viewId = computed(() => Shell.view.value ?? Shell.parts.value.views?.list()[0]?.id ?? viewObjects.value[0] ?? null);
const layoutOf = v => Shell.parts.value.views?.list().find(x => x.id === v)?.layout ?? (recs()[entryNamed(v, 'Layout')]?.choice ?? 'Chart').toLowerCase();

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

// A record's entries, the errors where a formula would put one, and blank required ones; in Order, Name first.
function slots(at) {
  const r = recs(), own = !!r[at]?.kind, slot = (edge, x) => ({ edge, ...x, t: { args: [{ edge, loc: tree(at) }] } });
  const ents = entriesAt(at).map(id => ({ id, edge: r[id].edge, t: tree(id), pinned: T.same(r[id].edge, 'Name') }));
  const errors = worked().errors.filter(e => e.args?.length === 1 && e.args[0].at === at && !entryNamed(at, e.args[0].edge)).map(e => slot(e.args[0].edge, { error: e }));
  const blanks = blanksAt(at).filter(b => !errors.some(e => T.same(e.edge, b.edge))).map(b => slot(b.edge, { ...b, blank: true }));
  return [...ents.filter(e => !(own && e.pinned)), ...errors, ...blanks].map(x => ({ ...x, o: x.pinned ? -1 : N().order(x.t) ?? Infinity }))
    .sort((a, b) => a.o - b.o || a.edge.localeCompare(b.edge));
}

// A document is an object with a link among its entries.
const linkOf = id => entriesAt(id).find(e => recs()[e].field === 'document');
// A record's relatives by list (Owners, Holdings), and its documents. A relation located anywhere in it
// lists its other sides under the name of their list, the first side by its edges' order and the rest beside.
function relatives(id) {
  const r = recs(), lists = new Map(), docs = [];
  for (const loc of within(id)) for (const rid of relationsAt(loc)) {
    const rel = r[rid], t = tree(rid), mine = rel.args.find(a => a.at === loc);
    if (!t || !mine) continue;
    const arg = e => rel.args.find(a => a !== mine && T.same(a.edge, e)), [first, ...rest] = N().edges(t).filter(e => !T.same(e, mine.edge)).map(arg);
    if (!first) continue;
    const item = { rid, obj: objectOf(first.at), rest, mine: mine.edge, edge: first.edge };
    if (linkOf(item.obj)) { docs.push(item); continue; }
    const name = N().listName(t, first.edge);
    (lists.get(name) ?? lists.set(name, []).get(name)).push(item);
  }
  const by = (a, b) => shortOf(a.obj).localeCompare(shortOf(b.obj));
  return { lists: [...lists].sort(([a], [b]) => a.localeCompare(b)).map(([name, items]) => [name, items.sort(by)]), docs: docs.sort(by) };
}

// ---- Changing ----
const undo = () => Shell.parts.peek().undo?.undo();
function change(fn, say) {
  if (still()) return null;
  const tx = App.edit();
  fn(tx);
  const c = tx.commit();
  if (typeof c === 'string') { toast(c); return null; }
  if (c && say) toast(say, { undo });
  return c;
}
// A record, or a blank one, with another output. Typing over a computed record enters it; clearing an
// entered one removes it, and lets a formula stand.
const entered = id => !!id && !!recs()[id] && !recs()[id].computed;
const withOut = (id, slot, out) => { const r = recs()[id] ?? slot; return { ...(r.args ? { args: r.args } : { at: r.at, edge: r.edge }), ...out }; };
function put(id, slot, out) {
  change(tx => {
    if (!out) return entered(id) && tx.remove(id);
    if (entered(id)) tx.set(id, withOut(id, slot, out)); else tx.add('record', withOut(id, slot, out));
  });
}
const flipped = (id, slot) => ({ tag: !(recs()[id]?.tag ?? false) });
const flip = (id, slot) => { put(id, slot, flipped(id, slot)); emit('tag-flip', id ?? slot); };
const preview = (id, slot) => ({ removes: entered(id) ? [id] : [], adds: [{ id: entered(id) ? id : 'preview', ...withOut(id, slot, flipped(id, slot)) }] });
const remove = id => { const say = `Deleted ${recs()[id].args ? nameOf(id) : recs()[id].edge ?? nameOf(id)}`; change(tx => tx.remove(id), say); };
// Adds an entry, and its specification if the schema hasn't got it.
function addEntry(at, edge, out) {
  const spec = { out: 'field' in out ? { field: out.field } : 'choice' in out ? { choice: out.choice } : { tag: out.tag }, args: [{ edge, loc: T.specOf(tree(at)) }] };
  change(tx => { if (!App.schema.value[T.key(spec)]) tx.add('spec', { tree: spec }); tx.add('record', { at, edge, ...out }); });
}
// A note's value set where it decides: the note that decides it now, or a new one at the pattern.
function decide(tx, label, p, value, extra = {}) {
  const n = extra.exact ? N().notes(label).find(n => T.key(n.pattern) === T.key(p) && n.view === extra.view && n.param === extra.param)
    : N().resolve(label, p, extra.view, extra.param)?.note;
  const blank = value === '' || value == null;
  if (n) { const { id, note, ...row } = n; if (blank) tx.remove(note); else if (JSON.stringify(n.value) !== JSON.stringify(value)) tx.set(note, { ...row, value }); }
  else if (!blank) tx.add('note', { label, pattern: p, ...(extra.view && { view: extra.view }), ...(extra.param && { param: extra.param }), value });
}
// Reordering writes Order at each sibling's pattern: its edge at its location's specification.
function reorder(at, ids) {
  const loc = T.specOf(tree(at));
  change(tx => ids.forEach((e, i) => { if (N().order(tree(e)) !== i + 1) decide(tx, 'Order', { args: [{ edge: recs()[e].edge, loc }] }, i + 1, { exact: true }); }));
}
const rename = (id, to) => { const r = recs()[id]; if (to && !T.same(to, r.edge)) change(tx => tx.rename({ args: [{ edge: r.edge, loc: loose(tree(r.at)) }] }, r.edge, to)); };
const moveUp = id => { const r = recs()[id]; change(tx => tx.moveUp({ args: [{ edge: r.edge, loc: T.bare(T.specOf(tree(r.at))) }] }), `Moved ${r.edge} up`); };

// Links a document the chart's way: an object with a link, related to the record as the relation whose
// other side has one (Concerns), or else a Document, Concerning it as its Subject.
function link(at, url, name = T.documentName(url)) {
  const S = Object.values(App.schema.value), t = tree(at);
  const linkSpec = loc => S.find(s => s.out?.field === 'document' && s.args?.length === 1 && loc.kind && T.same(s.args[0].loc.kind, loc.kind));
  const rel = S.find(s => s.args?.length === 2 && s.args.some(a => linkSpec(a.loc)) && s.args.some(a => !linkSpec(a.loc) && T.narrower(t, a.loc)));
  const doc = rel?.args.find(a => linkSpec(a.loc)), subj = rel?.args.find(a => a !== doc);
  const kind = doc?.loc.kind ?? 'Document', edge = doc ? linkSpec(doc.loc).args[0].edge : 'Link';
  change(tx => {
    const d = tx.add('record', { kind });
    tx.add('record', { at: d, edge: 'Name', field: 'text', value: name });
    tx.add('record', { at: d, edge, field: 'document', value: url });
    tx.add('record', { args: [{ edge: doc?.edge ?? 'Document', at: d }, { edge: subj?.edge ?? 'Subject', at }], tag: true });
  }, `Linked ${name}`);
}
const sharepoint = () => typeof SharePoint !== 'undefined' ? SharePoint : null;
const pickLink = at => SharePoint.pick({ multiple: true }).then(items => (items ?? []).forEach(it => it.link && link(at, it.link, it.name)), e => toast(e.message));
const href = u => sharepoint()?.href(u) ?? u;

// ---- Pieces ----
const GRIP = html`<svg class="i" viewBox="0 0 16 16" aria-hidden="true"><g fill="currentColor" stroke="none"><circle cx="6" cy="4" r="1.1"/><circle cx="10" cy="4" r="1.1"/><circle cx="6" cy="8" r="1.1"/><circle cx="10" cy="8" r="1.1"/><circle cx="6" cy="12" r="1.1"/><circle cx="10" cy="12" r="1.1"/></g></svg>`;
const OPEN = html`<svg class="i" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 4h6v6M12 4l-7.5 7.5"/></svg>`;
const draft = signal(null);     // an entry being added: { at, type, edge?, datatype?, options? }
const renaming = signal(null);  // the entry whose label is being typed over
const aim = signal(null);       // a row to bring into view and focus, by its key

// Drags a row among its siblings, as the sheet tabs drag; a click without moving is a click.
function drag(e, onDrop, onClick) {
  if (e.button !== 0 || still()) return;
  const grip = e.currentTarget, item = grip.closest('[data-drag]'), sibs = [...item.parentElement.children].filter(x => x.dataset.drag === item.dataset.drag);
  const y0 = e.clientY;
  let moving = false, to = -1;
  const clear = () => sibs.forEach(s => s.classList.remove('drop-before', 'drop-after'));
  const move = ev => {
    if (!moving && Math.abs(ev.clientY - y0) < 4) return;
    if (!moving) { moving = true; item.classList.add('dragging'); }
    clear();
    to = sibs.findIndex(s => { const r = s.getBoundingClientRect(); return ev.clientY < r.top + Math.min(r.height, 28) / 2; });
    if (to < 0) { to = sibs.length; sibs.at(-1).classList.add('drop-after'); } else sibs[to].classList.add('drop-before');
  };
  const up = () => {
    removeEventListener('pointermove', move);
    clear(); item.classList.remove('dragging');
    if (!moving) return onClick?.(grip);
    const from = sibs.indexOf(item), i = to > from ? to - 1 : to;
    if (to >= 0 && i !== from) onDrop(from, i);
  };
  addEventListener('pointermove', move);
  addEventListener('pointerup', up, { once: true });
}
const moved = (list, from, i) => { const l = list.slice(); l.splice(i, 0, l.splice(from, 1)[0]); return l; };

// A value typed over: Enter or leaving keeps it, Esc puts it back. While it differs, the new text is
// redlined in blue and the old struck in red. A document shows its file name, and its address to edit.
function Field({ r, datatype, put, fx, over, id, auto, ph, cls = '', children }) {
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
  return html`<label class=${'cellbox' + cls}><span class=${'hug' + (over ? ' over' : '')}>
    <input ref=${ref} class=${'cell' + (fx && text === null ? ' fx' : '') + (dirty && T.clean(text) ? ' add' : '') + (bad ? ' bad' : '')}
      value=${text ?? shown} placeholder=${ph} disabled=${still()} spellcheck=${false} autocomplete="off" aria-invalid=${bad ? 'true' : null}
      data-tour=${fx ? 'computed' : null} onFocus=${() => { type(raw); if (fx) emit('why-open', id); }}
      onInput=${e => { type(e.target.value); setBad(false); }} onKeyDown=${key} onBlur=${done} /></span>
    ${dirty && raw ? html`<s class="del">${shown}</s>` : null}
    ${doc && r && text === null ? html`<a class="btn icon open" href=${href(r.value)} target="_blank" rel="noopener" aria-label="Open" data-tip="Open">${OPEN}</a>` : null}
    ${text === null ? children : null}
  </label>`;
}

// A choice's option, from its dropdown, or a new one typed.
function Choice({ r, options, put, fx, over, id, children }) {
  const [typing, setTyping] = useState(false);
  if (typing) return html`<span class="cellbox"><input class="cell" placeholder="New option" ref=${el => el && !el.dataset.on && (el.dataset.on = 1, el.focus())}
    onKeyDown=${e => { if (e.key === 'Enter') { const t = T.clean(e.target.value); setTyping(false); if (t) put({ choice: t }); } else if (e.key === 'Escape') { e.stopPropagation(); setTyping(false); } }}
    onBlur=${() => setTyping(false)} /></span>`;
  const open = e => {
    if (fx) emit('why-open', id);
    menu(e.currentTarget, [...options.map(o => ({ label: o, checked: !!r && T.same(o, r.choice), run: () => !(r && T.same(o, r.choice)) && put({ choice: o }) })),
      ...(options.length ? ['-'] : []), { label: 'New option', run: () => setTyping(true) }]);
  };
  return html`<span class="cellbox"><span class=${'hug' + (over ? ' over' : '')}><button class=${'sel dd' + (fx ? ' fx' : '')} disabled=${still()} data-tour=${fx ? 'computed' : null} onClick=${open}><span>${r?.choice ?? ''}</span></button></span>${children}</span>`;
}

// A tag's checkbox: green attested, red ruled out, outlined when computed. Hovering shows the other state,
// redlines the label and previews the change; clicking makes it.
function TagBox({ r, flip, fx, over, change, children }) {
  const [peek, setPeek] = useState(false), on = r?.tag, show = peek ? !(on ?? false) : on;
  const hover = p => { setPeek(p); emit('preview', p && change ? change() : null); };
  return html`<span class="cellbox"><span class=${'hug' + (over ? ' over' : '')}><button class=${'tag' + (show === true ? ' yes' : show === false ? ' no' : '') + (fx && !peek ? ' fx' : '') + (peek ? ' peek' : '')}
    role="checkbox" aria-checked=${on ? 'true' : 'false'} disabled=${still()} data-tour="tag"
    onPointerEnter=${() => hover(true)} onPointerLeave=${() => hover(false)} onClick=${() => { hover(false); flip(); }} /></span>${children}</span>`;
}

// The record's other values, by time: each goes to the chart as of a day it held.
function Versions({ id }) {
  App.version.value;
  const rows = App.shown.value.item(App.chart.value, id);
  if (rows.length < 2) return null;
  const period = v => v.since && v.before ? `${short(v.since)} – ${short(v.before)}` : v.since ? `Since ${short(v.since)}` : v.before ? `Before ${short(v.before)}` : '';
  const day = v => { if (v.since) return v.since; const d = new Date(v.before + 'T12:00:00'); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); };
  return html`<button class="btn icon ver" aria-label="Other values" data-tip="Other values" onClick=${e => menu(e.currentTarget, rows.map(v => ({
    label: outText(v), detail: period(v), checked: Log.validOn(v, App.day.value), run: () => Shell.at(day(v) === Log.today() ? null : { asOf: day(v) }) })), { placement: 'bottom-end' })}>${icon('chevron')}</button>`;
}

// A record's output, or a blank one's, in place: typed, chosen or ticked.
function Output({ id, slot }) {
  if (slot?.error) return html`<button class="err errv" onClick=${() => emit('why-open', slot.error.id)}>${slot.error.error.code}</button>`;
  const w = worked(), r = id ? w.recs[id] : null, fx = !!id && w.fx(id), over = !!id && w.over(id);
  const k = r ? null : slot.type ? slot : kindAt(tree(slot.at), slot.edge);
  const type = r ? T.typeOf(r) : k.type, set = out => put(id, slot, out), more = r && !fx ? html`<${Versions} id=${id} />` : null;
  return type === 'tag' ? html`<${TagBox} r=${r} fx=${fx} over=${over} flip=${() => flip(id, slot)} change=${() => preview(id, slot)}>${more}</${TagBox}>`
    : type === 'choice' ? html`<${Choice} r=${r} id=${id} fx=${fx} over=${over} put=${set} options=${r ? (r.args ? slot.options ?? [] : kindAt(tree(r.at), r.edge).options) : k.options ?? []}>${more}</${Choice}>`
    : html`<${Field} r=${r} id=${id} fx=${fx} over=${over} put=${set} datatype=${r?.field ?? k.datatype}>${more}</${Field}>`;
}

// ---- The record's entries, as a tree ----
function entryMenu(anchor, id) {
  const r = recs()[id], fx = worked().fx(id);
  menu(anchor, [
    { label: 'In general', keys: 'Alt+Click', run: () => select([general(patternOf(id))]) },
    ...(fx ? [] : [{ label: 'Rename', run: () => { renaming.value = id; } }, ...(recs()[r.at]?.at ? [{ label: 'Move up a level', run: () => moveUp(id) }] : [])]),
    ...('field' in r ? [] : [{ label: 'Add', items: addItems(id, anchor) }]),
    ...(fx ? [] : ['-', { label: 'Delete', danger: true, run: () => remove(id) }]),
  ]);
}
function addItems(at, anchor) {
  const t = tree(at), have = new Set(entriesAt(at).map(e => T.norm(recs()[e].edge))), known = new Map();
  for (const s of Object.values(App.schema.value)) if (s.args?.length === 1 && !have.has(T.norm(s.args[0].edge)) && !T.same(s.args[0].edge, 'Name') && T.narrower(t, s.args[0].loc)) known.set(T.norm(s.args[0].edge), s);
  const start = (type, edge) => () => { draft.value = { at, type, ...(edge && { edge, ...kindAt(t, edge) }) }; };
  const items = [...known.values()].sort((a, b) => a.args[0].edge.localeCompare(b.args[0].edge)).map(s => ({ label: s.args[0].edge, detail: typeName(s),
    run: 'tag' in s.out ? () => addEntry(at, s.args[0].edge, { tag: true }) : start('field' in s.out ? 'field' : 'choice', s.args[0].edge) }));
  const others = () => [...T.index(recs()).kinds].filter(([k]) => k !== 'view').flatMap(([, ids]) => ids)
    .filter(x => x !== objectOf(at)).map(x => ({ label: nameOf(x), detail: recs()[x].kind, run: () => select([at, x]) })).sort((a, b) => a.label.localeCompare(b.label));
  return [...items, ...(items.length ? ['-'] : []), { label: 'Field', run: start('field') }, { label: 'Tag', run: start('tag') }, { label: 'Choice', run: start('choice') }, '-',
    { label: 'Relation…', run: () => menu(anchor, others(), { search: true }) }, { label: 'Formula…', run: () => emit('formula-new', { at }) }];
}

function Label({ it, fx }) {
  const r = it.id && recs()[it.id];
  if (r && renaming.value === it.id) return html`<input class="cell" value=${r.edge} ref=${el => el && !el.dataset.on && (el.dataset.on = 1, el.focus(), el.select())}
    onKeyDown=${e => { if (e.key === 'Enter') e.target.blur(); else if (e.key === 'Escape') { e.stopPropagation(); e.target.value = r.edge; e.target.blur(); } }}
    onBlur=${e => { renaming.value = null; rename(it.id, T.clean(e.target.value)); }} />`;
  const click = e => { if (e.altKey && it.id) select([general(patternOf(it.id))]); else if (fx) emit('why-open', it.id); };
  return html`<span class="lbl" onClick=${click} onContextMenu=${e => { if (it.id) { e.preventDefault(); entryMenu({ x: e.clientX, y: e.clientY }, it.id); } }}>
    ${it.edge}${it.blank ? html`<i class="req" aria-label="Required" />` : null}</span>`;
}

function Entry({ it, at, depth }) {
  const r = it.id ? recs()[it.id] : null, fx = !!r && worked().fx(it.id), sibs = () => slots(at).filter(s => s.id).map(s => s.id);
  return html`<div class="ent" data-drag=${r ? at : null}>
    <div class=${'row' + (r?.tag === false ? ' ruled' : '')} data-key=${it.id ?? `${at}|${it.edge}`} style=${`--depth:${depth}`}>
      ${r ? html`<button class="grip" aria-label=${`Move ${it.edge}`} onPointerDown=${e => drag(e, (from, i) => reorder(at, moved(sibs(), from, i)), g => entryMenu(g, it.id))}
        onKeyDown=${e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); entryMenu(e.currentTarget, it.id); } }}>${GRIP}</button>` : null}
      <div class="k"><${Label} it=${it} fx=${fx} /></div>
      <div class="v ctl"><${Output} id=${it.id} slot=${it} /></div>
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
  return html`<div class="row draft" ref=${box} style=${`--depth:${depth}`} onFocusOut=${leave} onKeyDown=${key}>
    <div class="k">${d.edge ? html`<span class="lbl">${d.edge}</span>` : html`<input class="cell" placeholder="Name" value=${edge}
      ref=${el => el && !el.dataset.on && (el.dataset.on = 1, el.focus())} onInput=${e => setEdge(e.target.value)} onKeyDown=${nameKey} onBlur=${named} />`}</div>
    <div class="v ctl">${k.type === 'tag' ? html`<span class="cellbox"><button class="tag yes" role="checkbox" aria-checked="true" onClick=${() => finish({ tag: true })} /></span>`
      : k.type === 'choice' && k.options?.length ? html`<${Choice} options=${k.options} put=${finish} />`
      : k.type === 'choice' ? html`<span class="cellbox"><input class="cell" placeholder="New option" onKeyDown=${e => { const o = T.clean(e.target.value); if (e.key === 'Enter' && o) finish({ choice: o }); }} /></span>`
      : html`<${Field} datatype=${k.datatype ?? null} auto=${!!d.edge} put=${finish} />`}</div>
  </div>`;
}

function Entries({ at, depth }) {
  const d = draft.value;
  return html`${slots(at).map(it => html`<${Entry} key=${it.id ?? it.edge} it=${it} at=${at} depth=${depth} />`)}
    ${d?.at === at ? html`<${Draft} key=${JSON.stringify(d)} d=${d} depth=${depth} />` : null}`;
}

// ---- Relatives, documents, look, deleted: sections, each folding under its heading ----
function Section({ title, n, shut = false, act, children }) {
  const [open, setOpen] = useState(!shut);
  return html`<section class=${open ? 'open' : ''}><div class="sect"><button class="fold" aria-expanded=${open} onClick=${() => setOpen(!open)}>${title}</button>
    ${n ? html`<span class="n">${n}</span>` : null}${act}</div>${open ? children : null}</section>`;
}

function Relatives({ id }) {
  const { lists, docs } = relatives(id), obj = !!recs()[id].kind, w = worked(), [linking, setLinking] = useState(false);
  const add = (e, items) => {
    const it = items[0], own = within(id), have = new Set(items.map(x => x.obj)), seen = new Set(), out = [];
    for (const s of N().fitting(App.schema.value, loose(tree(it.rid)))) {
      const sm = s.args.length === 2 && s.args.find(a => T.same(a.edge, it.mine)), sl = sm && s.args.find(a => a !== sm), at = sm && own.find(x => T.narrower(tree(x), sm.loc));
      if (at) for (const x of Object.keys(recs())) if (!('field' in recs()[x]) && !seen.has(x) && !have.has(objectOf(x)) && objectOf(x) !== id && T.narrower(tree(x), sl.loc)) {
        seen.add(x);
        out.push({ label: nameOf(objectOf(x)), run: () => 'tag' in s.out ? change(tx => tx.add('record', { args: [{ edge: sm.edge, at }, { edge: sl.edge, at: x }], tag: true })) : select([id, objectOf(x)]) });
      }
    }
    menu(e.currentTarget, out.sort((a, b) => a.label.localeCompare(b.label)), { search: true });
  };
  const plus = (label, run) => still() ? null : html`<button class="btn icon" aria-label=${label} data-tip=${label} onClick=${run}>${icon('plus')}</button>`;
  // Beside a relative: the others in the relation, and what's recorded at it, a start or end date saying so.
  const detail = it => [...it.rest.map(a => html`<span class="via">${a.edge} <a onClick=${() => select([objectOf(a.at)])}>${shortOf(objectOf(a.at))}</a></span>`),
    ...entriesAt(it.rid).filter(e => 'field' in recs()[e]).map(e => { const f = recs()[e], t = tree(e);
      return f.field !== 'date' ? T.format(f.field, f.value) : `${N().isStart(t) ? 'Since' : N().isEnd(t) ? 'Until' : f.edge} ${short(f.value)}`; })];
  const item = it => { const rel = recs()[it.rid], fx = w.fx(it.rid);
    return html`<div class=${'row rel' + (rel.tag === false ? ' ruled' : '')} key=${it.rid}>
      <div class="k">${rel.tag === false ? html`<span class="tag no mini" />` : null}<a class=${fx ? 'fx' : ''} title=${nameOf(it.obj)} onClick=${() => select([it.obj])}>${shortOf(it.obj)}</a></div>
      <div class="v"><a class=${'muted' + (fx ? ' fx' : '')} onClick=${() => select([it.rid])}>${detail(it).map((d, i) => html`${i ? ' · ' : ''}${d}`)}</a></div></div>`; };
  // A document by its name, its first choice and date beneath, and a way to open it.
  const docRow = it => { const l = recs()[linkOf(it.obj)], s = slots(it.obj).filter(x => x.id).map(x => recs()[x.id]);
    const sub = [s.find(x => 'choice' in x)?.choice, s.find(x => x.field === 'date')].filter(Boolean).map(x => x.value ? short(x.value) : x);
    return html`<div class="doc" key=${it.rid}><a onClick=${() => select([it.obj])}>${nameOf(it.obj)}</a>
      ${l ? html`<a class="btn icon open" href=${href(l.value)} target="_blank" rel="noopener" aria-label="Open" data-tip="Open">${OPEN}</a>` : null}
      ${sub.length ? html`<span class="meta">${sub.join(' · ')}</span>` : null}</div>`; };
  const linkAdd = e => sharepoint()?.configured() ? menu(e.currentTarget, [{ label: 'SharePoint…', run: () => pickLink(id) }, { label: 'Link…', run: () => setLinking(true) }]) : setLinking(true);
  // Lists someone entered first; those a formula gave, folded, after.
  const worked1 = items => items.every(it => w.fx(it.rid));
  return html`${[...lists.filter(([, x]) => !worked1(x)), ...lists.filter(([, x]) => worked1(x))].map(([name, items]) => html`<${Section} key=${name} title=${name} n=${items.length}
      shut=${worked1(items)} act=${items[0].rest.length || worked1(items) ? null : plus(`Add to ${name}`, e => add(e, items))}>${items.map(item)}</${Section}>`)}
    ${obj ? html`<${Section} title="Documents" n=${docs.length} act=${plus('Link a document', linkAdd)}>
      ${docs.map(docRow)}
      ${linking ? html`<div class="row"><div class="k wide"><input class="cell" placeholder="Link" ref=${el => el && !el.dataset.on && (el.dataset.on = 1, el.focus())}
        onKeyDown=${e => { if (e.key === 'Enter') { const u = T.clean(e.target.value); if (T.isAddress(u)) { setLinking(false); link(id, u); } else e.target.setAttribute('aria-invalid', 'true'); } else if (e.key === 'Escape') { e.stopPropagation(); setLinking(false); } }}
        onBlur=${() => setLinking(false)} /></div></div>` : null}</${Section}>` : null}`;
}

// Look: each format property a note decides for the mark, as the chart drew it, and where it comes from:
// this box (or line) alone, a style and its output, or the chart's default.
function lookOf(id, v) {
  const from = n => n.pattern.id === id ? (recs()[id].args ? 'This line' : 'This box') : !n.view ? 'Default'
    : (s => { const c = caption(n.pattern, {}); return c === s ? s : `${s} · ${c}`; })(styleName(T.bare(n.pattern)));
  return Object.entries(globalThis.Scene?.settingsOf(id, v) ?? {})
    .filter(([label, s]) => s?.note && label !== 'Shown' && label !== 'Position')
    .map(([label, s]) => ({ label, value: s.value, from: from(s.note) }));
}
function Look({ id }) {
  const v = viewId.value, t = tree(id), n = N(), pos = recs()[id].kind ? n.position(t, v) : null;
  const own = [...Object.values(n.formats(t, v)).map(r => r.note), n.resolve('Position', t, v)?.note].filter(x => x && x.view === v && x.pattern.id === id);
  const reset = (labels, say) => still() || !own.some(x => labels(x.label)) ? null
    : html`<button class="btn ghost reset" onClick=${() => change(tx => own.filter(x => labels(x.label)).forEach(x => tx.remove(x.note)), say)}>Reset</button>`;
  const val = x => html`<span class="val">${typeof x.value === 'string' && /^#[0-9a-f]{3,8}$/i.test(x.value) ? html`<i class="chip" style=${`background:${x.value}`} />${x.value.toUpperCase()}`
    : typeof x.value === 'boolean' ? (x.value ? 'Yes' : 'No') : typeof x.value === 'number' ? `${x.value} pt` : String(x.value).replace(/^./, c => c.toUpperCase())}</span>`;
  return html`<${Section} title="Look" act=${reset(l => l !== 'Position', 'Reset the look')}>
      ${lookOf(id, v).map(x => html`<div class="row" key=${x.label}><div class="k">${x.label}</div><div class="v look">${val(x)}<span class="from">${x.from}</span></div></div>`)}</${Section}>
    ${recs()[id].kind ? html`<${Section} title="Position" act=${reset(l => l === 'Position', 'Reset the position')}>
      ${pos ? [['Left', pos.x], ['Top', pos.y], ['Width', pos.w]].filter(p => p[1] != null).map(([k, x]) => html`<div class="row" key=${k}><div class="k">${k}</div><div class="v">${x}</div></div>`)
        : html`<div class="row"><div class="k">Place</div><div class="v muted">Automatic</div></div>`}</${Section}>` : null}`;
}

// What was deleted from these records, or deleted objects, each with Restore.
function Deleted({ of }) {
  App.version.value;
  const all = App.shown.value.deleted(App.chart.value).filter(d => d.type === 'record'), live = of && new Set(of);
  const items = all.filter(d => { const r = d.rows.at(-1); return live ? (r.at && live.has(r.at)) || r.args?.some(a => live.has(a.at)) : 'kind' in r && r.kind !== 'View'; });
  if (!items.length) return null;
  const label = d => { const r = d.rows.at(-1); return 'kind' in r ? all.find(x => x.rows.at(-1).at === d.item && T.same(x.rows.at(-1).edge, 'Name'))?.rows.at(-1).value ?? r.kind
    : r.args ? r.args.filter(a => !live?.has(a.at)).map(a => nameOf(objectOf(a.at)) || a.edge).join(', ') : r.edge; };
  const restore = d => { const c = App.wb.reverse(d.change, App.who()); if (typeof c === 'string') toast(c); else toast(`Restored ${label(d)}`, { undo }); };
  return html`<${Section} title="Deleted" n=${items.length} shut>${items.map(d => { const r = d.rows.at(-1); return html`<div class="row" key=${d.item}><div class="k">${label(d)}</div>
    <div class="v gone"><span class="muted">${'kind' in r ? r.kind : r.args ? '' : outText(r)}</span>${still() ? null : html`<button class="btn ghost" onClick=${() => restore(d)}>Restore</button>`}</div></div>`; })}</${Section}>`;
}

// ---- The views of a selection ----
function Head({ path = [], title, children }) {
  return html`<header class="ih">
    ${path.length ? html`<nav class="path">${path.map(p => p.go ? html`<a onClick=${p.go}>${p.label}</a>` : html`<span>${p.label}</span>`)}</nav>` : null}
    ${children ?? html`<h2 class="ih-title">${title}</h2>`}</header>`;
}
const AddRow = ({ at }) => still() ? null : html`<div class="row addrow"><div class="k"><button class="btn ghost add-entry" onClick=${e => menu(e.currentTarget, addItems(at, e.currentTarget))}>${icon('plus')}Add</button></div></div>`;

function RecordView({ id }) {
  const r = recs()[id];
  useLayoutEffect(() => {
    const a = aim.peek();
    if (!a) return;
    aim.value = null;
    const el = document.querySelector(`.insp [data-key="${CSS.escape(a)}"]`);
    el?.scrollIntoView({ block: 'center' });
    el?.querySelector('input, button.sel, button.tag')?.focus();
  });
  if (!r) {
    const rows = App.shown.value.item(App.chart.value, id);
    return html`<div class="empty"><span>${rows.length ? `Not in the chart as of ${short(App.day.value)}` : 'Deleted'}</span>
      ${rows.length && Shell.time.value ? html`<button class="btn" onClick=${() => Shell.at(null)}>Today</button>` : null}</div>`;
  }
  const path = T.pathOf(recs(), id), first = slots(id).find(s => s.id && 'choice' in recs()[s.id]);
  const head = r.kind
    ? html`<${Head} path=${[{ label: r.kind, go: () => select([general({ kind: r.kind })]) }, ...(first ? [{ label: recs()[first.id].choice, go: () => select([first.id]) }] : [])]}>
        <${Field} r=${recs()[entryNamed(id, 'Name')]} datatype="text" ph="Name" cls=" title" put=${out => put(entryNamed(id, 'Name'), { at: id, edge: 'Name' }, out)} /></${Head}>`
    : html`<${Head} title=${r.args ? nameOf(id) : r.edge} path=${r.args ? [] : path.slice(0, -1).map((x, i) => ({ label: i ? segment(recs()[x]) : nameOf(x), go: () => select([x]) }))} />`;
  const sides = r.args ? N().edges(tree(id)).map(e => r.args.find(a => T.same(a.edge, e))).filter(Boolean) : [];
  return html`<div class="insp">${head}
    <div class="rows">
      ${sides.map(a => html`<div class="row" key=${a.edge}><div class="k">${a.edge}</div><div class="v"><a onClick=${() => select([objectOf(a.at)])}>${nameOf(objectOf(a.at))}</a>
        ${a.at !== objectOf(a.at) ? html`<span class="muted"> › ${T.pathOf(recs(), a.at).slice(1).map(x => segment(recs()[x])).join(' › ')}</span>` : null}</div></div>`)}
      ${r.kind ? null : html`<div class=${'row' + (r.tag === false ? ' ruled' : '')} data-key=${id}><div class="k"><span class="lbl">${r.args ? nameOf(id) : r.edge}</span></div>
        <div class="v ctl"><${Output} id=${id} slot=${r} /></div></div>`}
      ${'field' in r ? null : html`<${Entries} at=${id} depth=${0} /><${AddRow} at=${id} />`}
    </div>
    <${Relatives} id=${id} />
    ${(r.kind || r.args) && layoutOf(viewId.value) === 'chart' && viewId.value ? html`<${Look} id=${id} />` : null}
    <${Deleted} of=${within(id)} />
  </div>`;
}

// A style's name, and an output's caption: a Caption note, or the output itself.
const styleName = p => !p.args ? 'Kind' : N().name(p) || p.args.map(a => a.edge).join(' · ');
const caption = (p, f) => f.Caption ?? (p.kind !== undefined ? p.kind : p.out?.choice ?? (p.out?.tag === false ? `Not ${styleName(T.bare(p))}` : styleName(T.bare(p))));
const DASH = { dashed: '4 3', dotted: '1.2 2.4' };
// An output's look, drawn as on the page: a box, a line, or text.
function Swatch({ p, f }) {
  const text = ['Color', 'Bold', 'Italic', 'Size', 'Font', 'Format'].some(k => k in f), line = p.args?.length > 1, box = !line && (!p.args || Object.keys(f).some(k => BOX.has(k)));
  const st = { fill: f.Fill ?? '#ffffff', stroke: f.Outline ?? '#3f4441', 'stroke-width': Math.min(f.Weight ?? 1, 2.5), 'stroke-dasharray': DASH[f.Dash] ?? null };
  const shape = f.Shape === 'oval' ? html`<ellipse cx="14" cy="8" rx="12.5" ry="6.5" ...${st} />` : f.Shape === 'triangle' ? html`<path d="M14 1.5 26.5 14.5H1.5Z" ...${st} />`
    : html`<rect x="1.5" y="1.5" width="25" height="13" rx=${f.Shape === 'rounded' ? 3.5 : 0} ...${st} />`;
  return html`<svg class=${'sw' + (f.Shown === false ? ' off' : '')} viewBox="0 0 28 16" aria-hidden="true">
    ${line ? html`<path d="M2 8H26" fill="none" stroke=${f.Outline ?? f.Color ?? '#3f4441'} stroke-width=${Math.min(f.Weight ?? 1.25, 3)} stroke-dasharray=${DASH[f.Dash] ?? null} />` : box ? shape : null}
    ${!line && (text || !box) ? html`<text x="14" y="12" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" fill=${f.Color ?? '#1b1e1d'}
      font-weight=${f.Bold ? 700 : 400} font-style=${f.Italic ? 'italic' : 'normal'}>Aa</text>` : null}</svg>`;
}
function Styles({ v, only }) {
  const all = N().styles(v), list = only ? all.filter(s => T.narrower(only, s.pattern) || T.narrower(s.pattern, only)) : all;
  const order = (from, i) => change(tx => moved(all, from, i).forEach((s, k) => s.order !== k + 1 && decide(tx, 'Order', s.pattern, k + 1, { view: v, exact: true })));
  const cap = (o, text) => change(tx => decide(tx, 'Caption', o.pattern, text === caption(o.pattern, {}) ? '' : text, { view: v, exact: true }));
  return list.map(s => html`<div class="ent style" data-drag=${only ? null : 'style'} key=${s.key}>
    <div class="row" style="--depth:0">${only || still() ? null : html`<button class="grip" aria-label=${`Move ${styleName(s.pattern)}`} onPointerDown=${e => drag(e, order)}>${GRIP}</button>`}
      <div class="k sname"><a onClick=${() => select([general(s.pattern)])}>${styleName(s.pattern)}</a></div></div>
    ${s.outputs.map(o => html`<div class="row out" key=${T.key(o.pattern)}><div class="k"><${Swatch} p=${o.pattern} f=${o.formats} /></div>
      <div class="v ctl"><${Field} r=${{ field: 'text', value: caption(o.pattern, o.formats) }} datatype="text" cls=${o.formats.Shown === false ? ' off' : ''} put=${out => cap(o, out?.value ?? '')} /></div></div>`)}
  </div>`);
}

function ViewPanel() {
  const v = viewId.value;
  if (!v || !recs()[v]) return html`<div class="empty">No view</div>`;
  const nameId = entryNamed(v, 'Name'), lay = entryNamed(v, 'Layout'), layout = layoutOf(v), views = Shell.parts.value.views;
  const rows = lay && entryNamed(lay, 'Rows'), S = Object.values(App.schema.value);
  const rowOptions = [...new Set([...S.filter(s => s.kind && !T.same(s.kind, 'View')).map(s => s.kind), ...S.filter(s => s.args?.length > 1).map(s => N().name(T.bare(s))), 'Dates', 'Documents'])];
  return html`<div class="insp">
    <${Head} path=${[{ label: 'View' }]}><${Field} r=${recs()[nameId]} datatype="text" ph="Name" cls=" title"
      put=${out => out && (views?.rename ? views.rename(v, out.value) : put(nameId, { at: v, edge: 'Name' }, out))} /></${Head}>
    <div class="rows">
      <div class="row"><div class="k">Layout</div><div class="v ctl"><${Choice} r=${{ choice: layout[0].toUpperCase() + layout.slice(1) }} options=${['Chart', 'Table']} put=${out => put(lay, { at: v, edge: 'Layout' }, out)} /></div></div>
      ${layout === 'table' && lay ? html`<div class="row in"><div class="k">Rows</div><div class="v ctl"><${Choice} r=${recs()[rows]} options=${rowOptions} put=${out => put(rows, { at: lay, edge: 'Rows' }, out)} /></div></div>` : null}
    </div>
    <${Section} title="Styles"><div class="styles"><${Styles} v=${v} /></div></${Section}>
    <${Deleted} />
  </div>`;
}

// Two records: every relation the two are in or could be in. A side fills a relation's parameter through
// itself or a record located in it that fits there (a fund is a GP's Fund Owned through its Entity Type).
function RelateView({ a, b }) {
  const r = recs(), N0 = N(), w = worked(), [picks, setPicks] = useState({}), [form, setForm] = useState(null);
  if (!r[a] || !r[b]) return html`<div class="empty">Not in the chart</div>`;
  const ca = within(a).filter(x => !('field' in r[x])), cb = within(b).filter(x => !('field' in r[x])), inB = new Set(cb), rows = new Map();
  for (const x of ca) for (const rid of relationsAt(x)) {
    const sa = r[rid].args.find(g => g.at === x), sb = r[rid].args.find(g => g !== sa && inB.has(g.at));
    if (sb && !rows.has(rid)) rows.set(rid, { id: rid, name: nameOf(rid), ea: sa.edge, eb: sb.edge, key: [sa.edge, sb.edge, x, sb.at].join('|').toLowerCase() });
  }
  const taken = new Set([...rows.values()].map(x => x.key));
  for (const s of Object.values(App.schema.value)) if (s.args?.length > 1) s.args.forEach((pa, i) => s.args.forEach((pb, j) => {
    if (i === j) return;
    const la = ca.find(x => T.narrower(tree(x), pa.loc)), lb = cb.find(x => T.narrower(tree(x), pb.loc)), key = [pa.edge, pb.edge, la, lb].join('|').toLowerCase();
    if (!la || !lb || (taken.has(key) && s.args.length === 2)) return;
    const row = rows.get(key) ?? rows.set(key, { key, name: N0.name(T.bare(s)), ea: pa.edge, eb: pb.edge, la, lb, s, rest: s.args.filter((_, k) => k !== i && k !== j), options: [] }).get(key);
    if ('choice' in s.out && !row.options.includes(s.out.choice)) row.options.push(s.out.choice);
  }));
  const list = [...rows.values()].sort((x, y) => x.name.localeCompare(y.name) || !!y.id - !!x.id || x.ea.localeCompare(y.ea));
  const slotOf = x => { const got = x.rest.map(p => picks[x.key + p.edge]); return got.every(Boolean) ? { args: [{ edge: x.ea, at: x.la }, { edge: x.eb, at: x.lb }, ...x.rest.map((p, k) => ({ edge: p.edge, at: got[k] }))], options: x.options } : null; };
  const pick = (e, x, p) => menu(e.currentTarget, Object.keys(r).filter(y => !('field' in r[y]) && T.narrower(tree(y), p.loc)).map(y => ({ label: nameOf(objectOf(y)), run: () => setPicks({ ...picks, [x.key + p.edge]: y }) })), { search: true });
  const cells = x => x.id ? entriesAt(x.id).filter(e => 'field' in r[e]).map(e => html`<span class="relv" key=${e}><span class="muted">${r[e].edge}</span><${Field} r=${r[e]} id=${e} fx=${w.fx(e)} over=${w.over(e)} datatype=${r[e].field} put=${out => put(e, r[e], out)} /></span>`) : [];
  // A tag's box leads its row; a value or option sits on the line below, with what's recorded at the relation.
  const isTag = x => x.id ? 'tag' in r[x.id] : 'tag' in x.s.out;
  const output = x => { const slot = x.id ? r[x.id] : slotOf(x);
    if (!slot) return html`<span class="tag" aria-disabled="true" />`;
    if (x.id) return html`<${Output} id=${x.id} slot=${{ ...slot, options: x.options }} />`;
    return 'tag' in x.s.out ? html`<${TagBox} flip=${() => { put(null, slot, { tag: true }); emit('tag-flip', slot); }} />`
      : 'choice' in x.s.out ? html`<${Choice} options=${x.options} put=${out => put(null, slot, out)} />` : html`<${Field} datatype=${x.s.out.field} put=${out => put(null, slot, out)} />`; };
  const make = () => {
    const [name, ra, rb] = ['name', 'ra', 'rb'].map(k => T.clean(form[k]));
    if (!name || !ra || !rb || T.same(ra, rb)) return;
    const p = { args: [{ edge: ra, loc: {} }, { edge: rb, loc: {} }] };
    if (change(tx => { tx.add('record', { args: [{ edge: ra, at: a }, { edge: rb, at: b }], tag: true }); tx.add('note', { label: 'Name', pattern: p, value: name });
      tx.add('note', { label: 'Order', pattern: p, param: ra, value: 1 }); tx.add('note', { label: 'Order', pattern: p, param: rb, value: 2 }); })) setForm(null);
  };
  const inp = (k, ph) => html`<input class="cell" placeholder=${ph} value=${form[k]} onInput=${e => setForm({ ...form, [k]: e.target.value })}
    onKeyDown=${e => { if (e.key === 'Enter') make(); else if (e.key === 'Escape') { e.stopPropagation(); setForm(null); } }} ref=${k === 'name' ? el => el && !el.dataset.on && (el.dataset.on = 1, el.focus()) : null} />`;
  return html`<div class="insp">
    <header class="ih two">${[a, b].map(x => html`<a class="ih-title" key=${x} onClick=${() => select([x])}>${nameOf(objectOf(x))}${x !== objectOf(x) ? html`<span class="muted"> › ${segment(r[x])}</span>` : null}</a>`)}</header>
    <div class="relate">
      <div class="rr head"><span /><span /><span title=${nameOf(a)}>${shortOf(objectOf(a))}</span><span title=${nameOf(b)}>${shortOf(objectOf(b))}</span></div>
      ${list.map(x => html`<div class=${'rr' + (x.id && r[x.id].tag === false ? ' ruled' : '')} key=${x.id ?? x.key} data-key=${x.id ?? x.key}>
        <span class="ctl">${isTag(x) ? output(x) : null}</span><a class=${'nm' + (x.id && w.fx(x.id) ? ' fx' : '')} title=${x.name} onClick=${() => x.id ? select([x.id]) : select([general(T.bare(x.s))])}>${x.name}</a>
        <span>${x.ea}</span><span>${x.eb}</span>
        ${x.rest?.length && !x.id ? html`<span class="more">${x.rest.map(p => html`<span class="relv"><span class="muted">${p.edge}</span><button class="sel dd" onClick=${e => pick(e, x, p)}><span>${picks[x.key + p.edge] ? nameOf(objectOf(picks[x.key + p.edge])) : ''}</span></button></span>`)}</span>` : null}
        ${!isTag(x) || cells(x).length ? html`<span class="more">${isTag(x) ? null : html`<span class="relv">${output(x)}</span>`}${cells(x)}</span>` : null}
      </div>`)}
      ${still() ? null : form ? html`<div class="rr new"><span class="ctl"><span class="tag yes" /></span>${inp('name', 'Name')}${inp('ra', 'Role')}${inp('rb', 'Role')}</div>`
        : html`<div class="rr new"><span /><button class="btn ghost add-entry" onClick=${() => setForm({ name: '', ra: '', rb: '' })}>${icon('plus')}New relation</button></div>`}
    </div>
  </div>`;
}

// An entry, relation or kind in general: what it's called and means, its options, whether it's required,
// a start or an end, where it's at, its definition's rows and its styles.
function GeneralView({ p }) {
  const n = N(), S = App.schema.value, specs = n.fitting(S, p), kind = !p.args, rel = p.args?.length > 1, s0 = specs[0];
  const type = kind ? 'kind' : !s0 ? null : 'field' in s0.out ? 'field' : 'choice' in s0.out ? 'choice' : 'tag';
  const name = n.name(p), def = !kind && n.resolve('Formula', p)?.note, dated = type === 'field' && s0.out.field === 'date', dp = { out: { field: 'date' }, args: p.args };
  const setName = to => { if (!to || to === name) return; change(tx => kind ? tx.rename(p, p.kind, to) : rel ? decide(tx, 'Name', p, to) : tx.rename(loose(p), p.args[0].edge, to)); };
  const flag = (label, q, v) => change(tx => decide(tx, label, q, v));
  const options = type === 'choice' ? optionsOf(specs) : [];
  const reorderOpts = (from, i) => change(tx => moved(options, from, i).forEach((o, k) => decide(tx, 'Order', { out: { choice: o }, args: p.args }, k + 1, { exact: true })));
  const [desc, setDesc] = useState(null), d0 = n.description(p) ?? '';
  const ats = kind ? [] : rel ? n.edges(p).map(e => [e, [...new Set(specs.map(s => where(s.args.find(a => T.same(a.edge, e)).loc)))].join(', ')])
    : [['At', [...new Set(specs.map(s => where(s.args[0].loc)))].join('\n')]];
  const below = kind ? [...new Map(Object.values(S).filter(s => s.args?.length === 1 && s.args[0].loc.kind && T.same(s.args[0].loc.kind, p.kind)).map(s => [T.norm(s.args[0].edge), s])).values()] : [];
  const grow = el => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 2 + 'px'; } };
  return html`<div class="insp">
    <${Head} path=${[{ label: kind ? 'Kind' : rel ? 'Relation' : T.DATATYPES[s0?.out.field] ?? (type === 'choice' ? 'Choice' : 'Tag') }]}>
      <${Field} r=${{ field: 'text', value: name }} datatype="text" cls=" title" put=${out => out && setName(out.value)} /></${Head}>
    <div class="rows">
      <div class="row"><div class="k">Description</div><div class="v ctl"><textarea class="cell desc" rows="1" ref=${grow} value=${desc ?? d0} disabled=${still()}
        onInput=${e => { setDesc(e.target.value); grow(e.target); }} onBlur=${() => { if (desc !== null && T.clean(desc) !== d0) change(tx => decide(tx, 'Description', p, T.clean(desc))); setDesc(null); }}
        onKeyDown=${e => { if (e.key === 'Escape') { e.stopPropagation(); setDesc(null); e.target.blur(); } }} /></div></div>
      ${ats.map(([k, v]) => html`<div class="row" key=${k}><div class="k">${k}</div><div class="v lines">${v}</div></div>`)}
      ${rel ? n.edges(p).map(e => html`<div class="row" key=${'l' + e}><div class="k">${e} list</div><div class="v ctl"><${Field} r=${{ field: 'text', value: n.listName(p, e) }} datatype="text"
        put=${out => change(tx => decide(tx, 'Name', p, out?.value === e ? '' : out?.value, { param: e }))} /></div></div>`) : null}
      ${kind || rel ? null : html`<div class="row"><div class="k">Required</div><div class="v ctl"><input type="checkbox" checked=${n.required(p)} disabled=${still()} onChange=${e => flag('Required', p, e.target.checked)} /></div></div>`}
      ${dated ? ['Start', 'End'].map(l => html`<div class="row" key=${l}><div class="k">${l}</div><div class="v ctl"><input type="checkbox" checked=${l === 'Start' ? n.isStart(dp) : n.isEnd(dp)} disabled=${still()} onChange=${e => flag(l, dp, e.target.checked)} /></div></div>`) : null}
    </div>
    ${type === 'choice' ? html`<${Section} title="Options" n=${options.length}>
      ${options.map(o => html`<div class="ent" data-drag="opt" key=${o}><div class="row" style="--depth:0">${still() ? null : html`<button class="grip" aria-label=${`Move ${o}`} onPointerDown=${e => drag(e, reorderOpts)}>${GRIP}</button>`}
        <div class="k wide"><${Field} r=${{ field: 'text', value: o }} datatype="text" put=${out => out && out.value !== o && change(tx => tx.rename(loose(p), o, out.value))} /></div></div></div>`)}
      ${still() ? null : html`<div class="row"><div class="k wide"><${Field} datatype="text" ph="New option" put=${out => out && change(tx => tx.add('spec', { tree: { ...T.specOf(s0), out: { choice: out.value } } }))} /></div></div>`}</${Section}>` : null}
    ${below.length ? html`<${Section} title="Entries" n=${below.length}>
      ${below.sort((x, y) => (n.order(x) ?? Infinity) - (n.order(y) ?? Infinity) || x.args[0].edge.localeCompare(y.args[0].edge)).map(s => html`<div class="row" key=${T.key(s)}>
        <div class="k"><a onClick=${() => select([general(T.bare(s))])}>${s.args[0].edge}</a></div><div class="v muted">${typeName(s)}</div></div>`)}</${Section}>` : null}
    ${def ? html`<${Section} title="Formula"><button class="formula" onClick=${() => emit('formula-open', { note: def.note, pattern: p })}>
      ${def.value.map((row, i) => html`<span class="frow" key=${i}>${row.label ? html`<span class="muted">${row.label}</span>` : null}<code class="mono">${row.formula}</code></span>`)}</button></${Section}>` : null}
    ${viewId.value && n.styles(viewId.value).some(s => T.narrower(p, s.pattern) || T.narrower(s.pattern, p)) ? html`<${Section} title="Styles"><${Styles} v=${viewId.value} only=${p} /></${Section}>` : null}
  </div>`;
}

function Many({ ids }) {
  return html`<div class="insp"><${Head} title=${`${ids.length} selected`} /><div class="rows">
    ${ids.filter(x => recs()[x]).map(x => html`<div class="row" key=${x}><div class="k wide"><a onClick=${() => select([x])}>${nameOf(objectOf(x))}</a></div></div>`)}</div></div>`;
}

function Inspector() {
  const sel = Shell.selection.value;
  if (sel.length === 1 && sel[0][0] === '~') { try { return html`<${GeneralView} key=${sel[0]} p=${JSON.parse(sel[0].slice(1))} />`; } catch { return html`<${ViewPanel} />`; } }
  if (sel.length === 2) return html`<${RelateView} key=${sel.join()} a=${sel[0]} b=${sel[1]} />`;
  if (sel.length > 2) return html`<${Many} ids=${sel} />`;
  if (sel.length === 1 && (recs()[sel[0]] || App.shown.value.item(App.chart.value, sel[0]).length)) return html`<${RecordView} key=${sel[0]} id=${sel[0]} />`;
  return html`<${ViewPanel} />`;
}

// ---- What needs attention: overdue deadlines, blanks where required, and errors ----
const attention = computed(() => {
  const w = worked(), day = App.day.value, n = App.notes.value, items = [];
  const dated = new Set(n.definitions(App.schema.value).filter(d => d.datatype === 'date').flatMap(d => d.covers));
  const go = (id, edge) => () => { aim.value = edge ? `${id}|${edge}` : id; select([objectOf(id)]); };
  for (const [id, r] of Object.entries(w.recs)) {
    if (r.field === 'date' && r.value < day && dated.has(T.parameterization(w.recs, id))) items.push({ kind: 'overdue', go: go(id) });
    if (!('field' in r)) for (const b of blanksAt(id)) items.push({ kind: 'blank', go: go(id, b.edge) });
  }
  for (const e of w.errors) items.push({ kind: 'error', go: go(e.id ?? e.args?.[0]?.at) });
  return items;
});

Shell.register('inspector', { mount(el) { render(html`<${Inspector} />`, el); return () => render(null, el); } });
Shell.register('attention', { items: () => attention.value });
on('relate-open', d => { const k = Array.isArray(d) ? d : d ? Object.values(d) : []; if (k.length === 2) select(k); });
// A link pasted with a record selected, not into a box, links a document to it.
document.addEventListener('paste', e => {
  const text = T.clean(e.clipboardData?.getData('text/plain')), sel = Shell.selection.peek(), id = sel.length === 1 && recs()[sel[0]] && objectOf(sel[0]);
  if (e.defaultPrevented || !id || !recs()[id]?.kind || !T.isAddress(text) || e.target.closest?.('input, textarea, [contenteditable]')) return;
  e.preventDefault();
  link(id, text);
});

return { general, worked };
})();
