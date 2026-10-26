// The record panel: views of a record, a kind or everything, with forms for adding and editing entries.
// Pages that use it define render(), which calls renderPanel() along with whatever else the page draws.
// It's shown beside the chart (chart.html), and as the Details of a record's own page (record.html); see
// panelOptions for what each host sets.

const ui = {
  expanded: new Set(),
  showRoot: false,  // whether the "All › Kind" start of the path is revealed
  menu: null,       // the open menu: 'add:<id>', 'opt:<id>' (a choice's options) or 'col:<table>:<column>'
  form: null,       // the entry being added or edited; see startForm
  focus: null,      // which box of the form gets focus: 'name', 'other' or 'output'
  error: null,      // why the form couldn't be saved
  notice: null,     // why some other change couldn't be made
  drag: null,       // { id, at, target, after } while an entry is dragged
  focusGrip: null,  // id of the entry whose drag handle gets focus after a keyboard move
  fullPaths: false, // whether locations show every segment below their object, not just the distinguishing ones
  filters: {},      // per relation table, the location picked in each column's dropdown
  relEdit: null,    // id of the relation whose value is being typed over
  info: null,       // what a change just did, when it's worth saying
  why: null,        // id of the record whose formula is explained under it
  fx: null,         // the definition being edited: { key, draft, error }; see "Formulas" below
  edgeEdit: null,   // a relation's edge being relabeled: { id, edge, text, scope, error }; see argumentRows
  describing: null, // the form whose meaning is being written; see meaningHtml
};

// ---- Changes made from the panel ----

// Moves an entry one place up (-1) or down (1) among its siblings, from the keyboard.
function nudgeEntry(id, step) {
  const siblings = entriesOf(records[id].at).filter(e => !isObjectName(e));
  const target = siblings[siblings.indexOf(id) + step];
  if (target) moveEntry(id, target, step > 0);
  ui.focusGrip = id;
}

// Whether an entry built from the form has the same output as a record: a field's value (values are
// canonical, so typed and computed ones compare plainly), a choice's option, or a tag's Boolean.
const sameOutput = (r, e) => isField(r) ? r.field === e.field && r.value === e.value : isChoice(r) ? same(r.choice, e.choice) : r.tag === e.tag;

// Builds the entry's own properties from the form, or returns a message saying what's missing.
// A label or option that matches an existing one, ignoring case, takes the existing one's capitalization.
function buildEntry(f) {
  const typed = clean(f.name);
  if (!typed) return 'Give it a name.';
  const match = schemaAt(f.at).find(p => p.type === f.type && same(p.label, typed));
  const edge = match ? match.label : typed;
  if (f.type === 'tag') return { edge, tag: !f.not };
  if (f.type === 'choice') {
    const output = clean(f.output);
    if (!output) return 'Choose or create an option.';
    return { edge, choice: match?.outputs.find(o => same(o, output)) ?? output };
  }
  const { datatype, value, raw } = fieldReading({ ...f, name: edge });
  if (!raw) return 'Give it a value.';
  if (value === undefined) return `${edge} takes ${asPhrase(datatype)} here${datatype === 'date' ? ', like March 4, 2019' : ''}.`;
  return { edge, field: datatype, value };
}

// Builds a two-argument relation from the form, with its arguments in the order the existing ones use.
function buildRelation(f) {
  const t = f.rel;
  if (!f.otherId) return `Choose the ${t.other}.`;
  const own = { edge: t.own, at: f.at }, other = { edge: t.other, at: f.otherId };
  const args = t.ownFirst ? [own, other] : [other, own];
  if (t.type === 'tag') return { args, tag: !f.not };
  if (t.type === 'choice') {
    const output = clean(f.output);
    if (!output) return 'Choose or create an option.';
    return { args, choice: t.outputs.find(o => same(o, output)) ?? output };
  }
  const { datatype, value, raw } = fieldReading(f);
  if (!raw) return 'Give it a value.';
  if (value === undefined) return `${t.other} takes ${asPhrase(datatype)} here.`;
  return { args, field: datatype, value };
}

function saveForm() {
  const f = ui.form;
  if (f.type === 'object') {
    const name = clean(f.name);
    if (!name) return 'Give it a name.';
    return createObject(f.kind, name).error ?? null;
  }
  if (f.type === 'relation') {
    const relation = buildRelation(f);
    if (typeof relation === 'string') return relation;
    const id = newId();
    const error = commit({ ...records, [id]: relation });
    if (!error) ensureRelationStyle(id);
    return error;
  }
  // A value typed starting with = (or ← for a tag) is a formula for every location like this one.
  if (isFormulaText(f.type === 'tag' ? f.formula : f.output)) return saveFormulaFromForm(f);
  const entry = buildEntry(f);
  if (typeof entry === 'string') return entry;
  // A computed record saved as it was shown isn't an override.
  if (f.id && isComputed(f.id) && same(records[f.id].edge, entry.edge) && sameOutput(records[f.id], entry)) return null;
  const oldLabel = f.id && records[f.id].edge;
  const id = f.id ?? newId();
  const record = { at: f.at, ...entry };
  const renamed = oldLabel && !same(oldLabel, entry.edge);
  if (!renamed) return commit({ ...records, [id]: record });
  // Renaming every entry like this one (of its form), the default where there are others, relabels them
  // all, and the schema, in the same step; computed ones follow their definition. Renaming here only
  // moves this one to a new specification, and its old one with it if nothing else has it.
  const like = likeRecords(id);
  if (f.scope !== 'here' && like.length > 1) {
    const error = renameEvery(id, oldLabel, entry.edge, { [id]: { ...record, edge: entry.edge } });
    if (!error) ui.info = `Renamed ${oldLabel} to ${entry.edge} at ${count(like.length, 'location')}, and in the formulas and names that use it.`;
    return error;
  }
  const error = commit({ ...records, [id]: record }, { moves: true });
  if (!error) keepPlace(f.at, oldLabel, entry.edge);
  return error;
}

// How a deleted record is listed under Deleted: an object by its name, a relation by its name and sides,
// an entry by its label and what it was in.
function deletedLabel(id) {
  const r = records[id];
  if (isObject(r)) return objectName(id);
  if (isRelation(r)) return `${relationNameOf(id)}: ${r.args.map(a => placeName(a.at)).join(' and ')}`;
  return `${r.edge} on ${placeName(id)}`;
}

// Deleting puts a record and whatever depends on it under Deleted (see deleteRecords). When others
// depend on it, it asks first.
function deleteEntry(id) {
  const label = deletedLabel(id);
  const dependents = withDependents([id]).size - 1;
  const run = () => {
    ui.notice = deleteRecords([id], label);
    if (!ui.notice) ui.info = `Deleted ${label}. Undo, or restore it from Deleted.`;
  };
  if (!dependents) return run();
  ui.pending = { message: `Delete ${recordLabel(id)}, with the ${count(dependents, 'record')} that depend on it? They can be restored from Deleted.`, yes: 'Delete', apply: run };
}

// Switching a computed tag overrides its formula, so it asks first, saying what implies it.
function flipTag(id) {
  const r = records[id];
  const apply = () => { ui.notice = commit({ ...records, [id]: { ...r, tag: !r.tag } }); };
  const info = isComputed(id) && formulaInfo(id);
  if (!info) return apply();
  const d = definitionOf(info.def);
  const why = info.labels.length ? `implied by ${listing(info.labels)} in ${d.name}` : `worked out by ${d.name}’s formula`;
  const to = r.tag ? 'Rule it out' : 'Attest it';
  ui.pending = { message: `${recordTitle(id)} is ${why}. ${to} anyway? It stays that way, overriding the formula, until you use the formula again.`, yes: to, apply };
}

function setChoice(id, choice) {
  confirmMove(id, choice, () => { ui.notice = commit({ ...records, [id]: { ...records[id], choice } }); });
}

// Changing a choice's option changes the specification of everything located at it, which then moves to
// the new option. That's easy to do by accident from a dropdown, so it waits for a yes in `ui.pending`.
function confirmMove(id, choice, apply) {
  const n = entriesOf(id).length, m = relationsAt(id).length;
  if (same(choice, records[id].choice) || !n && !m) return apply();
  const what = [n && count(n, 'entry'), m && count(m, 'relation')].filter(Boolean).join(' and ');
  ui.pending = { message: `Changing ${recordLabel(id)} to ${choice} takes its ${what} with it.`, apply };
}

// In the app's pages the shell undoes, so an undo says what it took back, and can take back a change
// made on another page; its undo listeners close the forms.
function undo() {
  if (typeof Shell === 'object') Shell.undoOrRedo(false);
  else if (undoState()) clearForms();
}

function redo() {
  if (typeof Shell === 'object') Shell.undoOrRedo(true);
  else if (redoState()) clearForms();
}

function resetSample() {
  resetState();
  clearForms();
}

function clearForms() {
  ui.form = ui.focus = ui.error = ui.menu = ui.relEdit = ui.pending = ui.fx = ui.edgeEdit = ui.describing = null;
  closeSuggest();
}

// ui.form is { mode: 'add' | 'edit', type, at, id, name, output, not, step, typed, cell, scope }.
// `name` and `output` hold what's in the name box and in the value or option box, `not` rules a tag out,
// and `step` stays 'name' until a name is chosen. `typed` marks the boxes typed in since they were filled,
// whose lists are filtered by what's in them. `cell` means only the value or option is being edited.
// `scope` says whether a new label renames this entry only ('here') or every entry like it ('every').
function startForm(mode, type, at, id, { focus = 'name', cell = false } = {}) {
  clearForms();
  const r = id ? records[id] : null;
  ui.form = {
    mode, type, at, id, cell,
    name: r?.edge ?? '',
    output: !r ? '' : isField(r) ? displayValue(r) : isChoice(r) ? r.choice : '',
    formula: '',  // a new tag's implication, typed in place of attesting it
    not: !!r && isTag(r) && !r.tag,
    step: mode === 'edit' ? 'output' : 'name',
    typed: {},
    scope: 'every',
  };
  ui.focus = focus;
  if (at) ui.expanded.add(at);
}

// Adding to a two-argument relation from one side: `other` is what's typed in the box that picks the
// other side, `otherId` what was picked, and `output` the option or value once it's picked.
function startRelationForm(at, key) {
  clearForms();
  const rel = relationTypesAt(at).find(t => t.key === key);
  ui.form = { mode: 'add', type: 'relation', at, rel, name: rel.other, other: '', otherId: null, output: '', not: false, step: 'other', typed: {} };
  ui.focus = 'other';
  for (const k of pathTo(at)) ui.expanded.add(k);
}

// A tag relation is added as soon as its other side is picked; others move on to their option or value.
function chooseOther(id) {
  const f = ui.form;
  Object.assign(f, { otherId: id, other: placeName(id) });
  f.typed.other = false;
  ui.error = null;
  if (f.rel.type === 'tag') return submitForm();
  f.step = 'output';
  ui.focus = 'output';
  render();
}

function startObjectForm(kind) {
  clearForms();
  ui.form = { mode: 'add', type: 'object', kind, name: '' };
  ui.focus = 'name';
}

function submitForm() {
  const f = ui.form;
  const save = () => {
    ui.error = saveForm();
    if (!ui.error) clearForms();
  };
  if (f.mode === 'edit' && f.type === 'choice') confirmMove(f.id, clean(f.output), save);
  else save();
  render();
}

// A tag is added as soon as its name is chosen; a field or choice moves on to its value or option.
function chooseName(value) {
  const f = ui.form;
  f.name = value;
  f.typed.name = false;
  ui.error = null;
  if (f.type === 'tag') return submitForm();
  f.step = 'output';
  ui.focus = 'output';
  render();
}

function chooseOutput(value) {
  ui.form.output = value;
  submitForm();
}

// ---- Name and option boxes ----

// The options of a box, in alphabetical order, or once it's typed in (`filter`), only those matching what's
// typed, as rankBy ranks them: an exact match first, then the start, whole words, and so on. `texts` gives
// what an option can be known by (an object by its Short Name too), its best match counting. Those that
// can't be picked (with a note) go last.
function ranked(options, text, filter, texts = o => [o.value]) {
  const sorted = [...options].sort((a, b) => byLabel(a.value, b.value));
  const kept = !filter ? sorted : [...new Set(rankBy(sorted.flatMap(o => texts(o).map(t => [o, t])), text, ([, t]) => t).map(([o]) => o))];
  return kept.sort((a, b) => !!a.note - !!b.note);
}

// Labels of this type already used at locations like this one (only those matching `text`, if `filter`),
// then Create. A label taken here can't be reused, and labels of different types can't be shared.
function nameOptions(f, text, filter) {
  const q = norm(text);
  const here = new Map(entriesOf(f.at).filter(id => id !== f.id).map(id => [norm(records[id].edge), records[id]]));
  const schema = schemaAt(f.at);
  const blocked = label => {
    const r = here.get(norm(label));
    if (r && isTag(r) && f.type === 'tag') return r.tag ? 'Already tagged' : 'Ruled out here';
    if (r) return `Already a ${typeOf(r)} here`;
    const other = schema.find(p => same(p.label, label) && p.type !== f.type);
    return other ? `A ${other.type} elsewhere` : '';
  };
  const meta = p => p.type === 'field' ? DATATYPE_NAMES[p.datatype] : p.type === 'choice' ? count(p.outputs.length, 'option') : '';
  const options = ranked(schema.filter(p => p.type === f.type).map(p => ({ value: p.label, meta: meta(p), note: blocked(p.label) })), text, filter);
  if (q && !schema.some(p => p.type === f.type && norm(p.label) === q))
    options.push({ value: clean(text), create: true, note: blocked(text) });
  return options;
}

// The outputs of the chosen choice's parameterization (ranked as above), then Create.
function outputOptions(f, text, filter) {
  const q = norm(text);
  const outputs = f.type === 'relation' ? f.rel.outputs
    : schemaAt(f.at).find(p => p.type === 'choice' && same(p.label, f.name))?.outputs ?? [];
  const options = ranked(outputs.map(o => ({ value: o })), text, filter);
  if (q && !outputs.some(o => norm(o) === q)) options.push({ value: clean(text), create: true });
  return options;
}

// Locations that could be the other side of the relation being added: every record with a specification
// seen there before, known by its object's name or any text of the object's own, like its Short Name.
// Those already related to this location this way can't be picked again.
function otherOptions(f, text, filter) {
  const related = new Set(relationGroups(f.at).find(g => g.key === f.rel.key)?.ids
    .map(id => records[id].args.find(a => a.at !== f.at)?.at));
  const texts = o => [o.value, ...entriesOf(objectOf(o.id)).filter(k => isField(records[k]) && records[k].field === 'text').map(k => records[k].value)];
  return ranked(Object.keys(records).filter(id => f.rel.otherSpecs.has(specKey(records, id)))
    .map(id => ({ value: placeName(id), id, note: related.has(id) ? 'Already related' : '' })), text, filter, texts);
}

// What the other side's listbox is headed with: the kinds of location it lists, e.g. "Entities, by way of
// Entity Type: Limited Partnership".
function otherHeading(f) {
  return [...f.rel.otherSpecs].map(spec => {
    const sample = Object.keys(records).find(id => specKey(records, id) === spec);
    const [head, ...tail] = pathTo(sample);
    const kinds = isObject(records[head]) ? plural(records[head].kind) : segmentText(head);
    return tail.length ? `${kinds}, by way of ${tail.map(segmentText).join(' › ')}` : kinds;
  }).join(' or ');
}

const OPTION_SOURCES = { name: nameOptions, other: otherOptions, output: outputOptions };

// The listbox that's open, its options, and the one Enter picks.
const listbox = { input: null, options: [], active: -1 };
const selectable = () => listbox.options.map((o, i) => o.note ? -1 : i).filter(i => i >= 0);

// Enter picks an exact match if there is one. Otherwise, once typed in, it picks the first match,
// or Create when nothing matches; but not Create beside a match that's taken, to avoid near-duplicates.
// A box that's only been filled, not typed in, lists everything and picks what's in it.
function openListbox(input) {
  const role = input.dataset.input;
  const typed = !!ui.form.typed[role];
  const options = OPTION_SOURCES[role](ui.form, input.value, typed);
  Object.assign(listbox, { input, options });
  const ids = selectable();
  const exact = ids.find(i => !options[i].create && same(options[i].value, input.value));
  const create = ids.find(i => options[i].create);
  const takenMatch = options.some(o => o.note && !o.create);
  listbox.active = exact ?? (typed ? ids.find(i => !options[i].create) ?? (takenMatch ? undefined : create) : create) ?? -1;
  drawListbox();
}

function drawListbox() {
  const { input, options, active } = listbox;
  const box = document.getElementById(input.getAttribute('aria-controls'));
  const f = ui.form;
  const role = input.dataset.input;
  const isName = role === 'name';
  const existing = options.filter(o => !o.create);
  const empty = role !== 'other' && (!clean(input.value) || !f.typed[role]);
  const heading = isName ? `${plural(TYPE_NAMES[f.type])} ${whereAt(f.at)}`
    : role === 'other' ? otherHeading(f) : `Options for ${clean(f.name)}`;
  let html = existing.length ? `<div class="listbox-head">${esc(heading)}</div>` : '';
  html += options.map((o, i) => {
    const sep = o.create && existing.length ? '<div class="listbox-sep" role="presentation"></div>' : '';
    const label = o.create
      ? `${icon('plus')}<span class="option-label">Create <strong>${esc(o.value)}</strong></span>`
      : `<span class="option-label">${esc(o.value)}</span>`;
    const meta = o.note || o.meta;
    return `${sep}<div class="option${o.create ? ' option-create' : ''}" id="${box.id}-${i}" role="option" data-index="${i}" aria-selected="${i === active}"${o.note ? ' aria-disabled="true"' : ''}>${label}${meta ? `<span class="option-meta">${esc(meta)}</span>` : ''}</div>`;
  }).join('');
  if (empty) html += `<div class="listbox-foot">${existing.length
    ? `Or type a new ${isName ? 'name' : 'option'} to create it`
    : isName ? `No ${plural(TYPE_NAMES[f.type]).toLowerCase()} ${whereAt(f.at)} yet. Type a name to create one.` : 'No options yet. Type one to create it.'}</div>`;
  box.innerHTML = html;
  box.hidden = false;
  input.setAttribute('aria-expanded', 'true');
  if (active >= 0) {
    input.setAttribute('aria-activedescendant', `${box.id}-${active}`);
    document.getElementById(`${box.id}-${active}`).scrollIntoView({ block: 'nearest' });
  } else {
    input.removeAttribute('aria-activedescendant');
  }
}

function closeListbox() {
  const { input } = listbox;
  if (!input) return;
  const box = document.getElementById(input.getAttribute('aria-controls'));
  if (box) box.hidden = true;
  input.setAttribute('aria-expanded', 'false');
  input.removeAttribute('aria-activedescendant');
  listbox.input = null;
}

function moveActive(step) {
  const ids = selectable();
  if (!ids.length) return;
  const at = ids.indexOf(listbox.active);
  listbox.active = at < 0 ? ids[step > 0 ? 0 : ids.length - 1] : ids[(at + step + ids.length) % ids.length];
  drawListbox();
}

function pick(index) {
  const o = listbox.options[index];
  if (!o || o.note) return;
  const role = listbox.input.dataset.input;
  closeListbox();
  if (role === 'name') chooseName(o.value);
  else if (role === 'other') chooseOther(o.id);
  else chooseOutput(o.value);
}

// What a field's value will be read as: the datatype fields with this label (or relations of this kind)
// already have here, or a guess from the value.
function fieldReading(f) {
  const fixed = f.type === 'relation' ? f.rel.datatype : fieldDatatype(f.at, f.name, f.id);
  const raw = clean(f.output);
  const datatype = fixed ?? (raw ? classify(raw) : 'text');
  return { fixed: !!fixed, datatype, raw, value: raw ? parseValue(datatype, raw) : undefined };
}

function fieldHint(f) {
  const { fixed, datatype, raw, value } = fieldReading(f);
  const name = clean(f.name);
  if (isFormulaText(raw)) {
    const problem = Formulas.check(raw).error;
    return problem ? { cls: 'is-warn', text: `${problem.message} (at ${problem.pos + 1})` }
      : { text: `A formula: ${name || 'this'} is worked out at every location like this one` };
  }
  if (raw && value === undefined)
    return { cls: 'is-warn', text: `${name} takes ${asPhrase(datatype)} here${datatype === 'date' ? ', like March 4, 2019' : ''}` };
  if (!raw) return { text: fixed ? `${name} takes ${asPhrase(datatype)} here` : 'Its datatype is detected as you type' };
  // Show how a date was read only when it was typed some other way.
  const shown = datatype === 'date' && formatDate(value) !== raw ? `: ${formatDate(value)}` : '';
  const others = f.type === 'relation' ? `in other ${name} relations` : `on other ${name} fields`;
  return { text: `${fixed ? `${DATATYPE_NAMES[datatype]}, as ${others}` : `Reads as ${asPhrase(datatype)}`}${shown}` };
}

// ---- Rendering ----

const row = (depth, label, value, actions, cls = '') =>
  `<div class="row${cls}" style="--depth:${depth}">${depth ? '<span class="guides"></span>' : ''}
    <div class="cell-label">${label}</div><div class="cell-value">${value}</div><div class="cell-actions">${actions}</div></div>`;

// What the page hosting the panel sets:
// - engaged: on a page with a chart, a function giving the engaged style ({ style, output }); the panel then
//   marks each styled entry with a swatch that engages its style, and highlights the engaged one;
// - page: true on a record's own page, whose header names the record and gives its path, and which puts
//   the panel's actions (addMenu) in a bar of its own, so the panel's head keeps only what's under its title;
// - href: where a link to one of the panel's views goes, given its address as the hash writes it (a
//   record's id, or kind:…, relate:…, definition:…; see currentView). By default, to that view, here;
// - ask: how to put a question that comes from leaving, not from something done in the panel, given
//   { title, message, yes, apply }. By default it's in the panel's own bar; a page that may have the panel
//   out of sight asks in a dialog instead;
// - createInHead: whether the Schema view's head offers New definition. The Schema page has it as its
//   create action, in the top bar, instead.
const panelOptions = { engaged: null, page: false, href: hash => `#${hash}`, ask: null, createInHead: true };

// A link to one of the panel's views, by its address. Going to one goes where its link would.
const panelHref = hash => panelOptions.href(hash);
const panelGo = hash => { location.href = panelHref(hash); };

const engagedHere = id => {
  const eng = panelOptions.engaged?.();
  return !!eng && eng.style === styleOf(id) && (eng.output === '*' || eng.output === outputKey(records[id]));
};

// A small preview of what a record's style does for its output (see stylePreview). As a button, it engages
// the style; as a span, it sits inside a button that does.
function styleDot(id, asSpan = false) {
  if (!panelOptions.engaged) return '';
  const s = styleOf(id);
  if (!s) return '';
  const r = records[id];
  const inner = stylePreview(s, s.map[outputKey(r)] ?? {});
  if (asSpan) return `<span class="style-dot">${inner}</span>`;
  return `<button class="style-dot" data-action="style-engage" data-style="${s.id}" data-output="${esc(outputKey(r))}"
    title="Styled by ${esc(describeStyle(s).label)}. Click to format it in the ribbon.">${inner}</button>`;
}

// Records at or below a location that could have a chart style but don't yet, for Add › Style.
function unstyledUnder(at) {
  const seen = new Set();
  return panelOrder(at).filter(id => {
    if (isObject(records[id])) return false;
    const f = formKeyOf(id);
    if (styleOfForm(f) || seen.has(f)) return false;
    seen.add(f);
    return true;
  });
}

function twisty(id) {
  if (!hasEntries(id)) return '<span class="twisty"></span>';
  const open = ui.expanded.has(id);
  return `<button class="twisty" data-action="toggle" data-id="${id}" aria-expanded="${open}" aria-label="${open ? 'Collapse' : 'Expand'} ${esc(records[id].edge)}">${icon('chevron-right')}</button>`;
}

const grip = id => isObjectName(id) ? ''
  : `<button class="grip" data-grip="${id}" aria-label="Move ${esc(records[id].edge)} (Alt+Up or Alt+Down; Alt+Left moves it up a level)" title="Drag to reorder">${icon('grip-vertical')}</button>`;

const ADD_TYPES = [
  ['field', 'A value, like a date, an amount or a name'],
  ['tag', 'Something that’s true of it, or ruled out'],
  ['choice', 'One option from a list'],
];

// The two-argument relations a location like this one takes part in (relationTypesAt), and those the
// entries inside it take part in, each with where it's added: a fund's General Partners are the fund's own
// to add, though the relation's fund side sits at its Entity Type. [{ t, loc }], computed relations last.
function relationsHere(at) {
  const inside = id => entriesOf(id).filter(k => !isField(records[k])).flatMap(k => [k, ...inside(k)]);
  return [at, ...inside(at)].flatMap(loc => relationTypesAt(loc).map(t => ({ t, loc })))
    .sort((a, b) => a.t.computed - b.t.computed || byLabel(a.t.list, b.t.list));
}

// The Add menu: path entries, then the two-argument relations a location like this one already takes part in,
// then any relation at all (which opens the Relate view), and on a page with a chart, a style.
function addMenu(at, compact = false) {
  const key = `add:${at}`;
  const styleKey = `add-style:${at}`;
  const open = ui.menu === key || ui.menu === styleKey;
  const trigger = compact
    ? `<button class="icon-btn" data-action="menu" data-menu="${key}" aria-haspopup="menu" aria-expanded="${open}" aria-label="Add inside ${esc(recordLabel(at))}" title="Add inside">${icon('plus')}</button>`
    : `<button class="btn" data-action="menu" data-menu="${key}" aria-haspopup="menu" aria-expanded="${open}">${icon('plus')}Add</button>`;
  if (!open) return `<span class="menu-anchor">${trigger}</span>`;
  if (ui.menu === styleKey) {
    const list = unstyledUnder(at).map(id => styleFormItem(formKeyOf(id), id)).join('');
    return `<span class="menu-anchor">${trigger}<div class="pop menu" role="menu"><div class="menu-head">Style the chart by</div>${list || '<div class="menu-note" style="padding:6px 10px 8px">Everything here already has a style.</div>'}</div></span>`;
  }
  const items = ADD_TYPES.map(([type, desc]) =>
    `<button class="menu-item" role="menuitem" data-action="add" data-type="${type}" data-id="${at}">
      <span class="menu-text"><span class="menu-title">${TYPE_NAMES[type]}</span><span class="menu-desc">${desc}</span></span><kbd>${TYPE_NAMES[type][0]}</kbd></button>`).join('');
  // General actions first, then shortcuts for the relations a location like this one is already in.
  const general = `<button class="menu-item" role="menuitem" data-action="open-relate" data-id="${at}">
      <span class="menu-text"><span class="menu-title">Relation…</span><span class="menu-desc">Any relation, with anything, or a new one</span></span><kbd>R</kbd></button>`
    + `<a class="menu-item" role="menuitem" href="${esc(panelHref(`definition:new:entry:${at}`))}">
      <span class="menu-text"><span class="menu-title">Definition…</span><span class="menu-desc">A computed entry, worked out by formula at every location like this one</span></span></a>`
    + (panelOptions.engaged ? `<button class="menu-item" role="menuitem" data-action="menu" data-menu="${styleKey}">
      <span class="menu-text"><span class="menu-title">Style…</span><span class="menu-desc">Format the chart by an entry here</span></span><kbd>S</kbd></button>` : '');
  // Each relation by the list it adds to here, then its name and which side this record is on, so a list
  // and its inverse (a fund's General Partners, and the Funds a GP is general partner of) can't be taken
  // for each other. A computed one can still be attested by hand, overriding its definition.
  const relations = relationsHere(at).map(({ t, loc }) =>
    `<button class="menu-item" role="menuitem" data-action="add-relation" data-id="${loc}" data-key="${esc(t.key)}">
      <span class="menu-text"><span class="menu-title">${esc(t.list)}</span><span class="menu-desc">${esc(t.name)}, with this as the ${esc(t.own)}${t.computed ? ' · Computed · attest by hand' : ''}</span></span></button>`).join('');
  return `<span class="menu-anchor">${trigger}<div class="pop menu" role="menu">${items}<div class="menu-sep" role="separator"></div>${general}${relations
    ? `<div class="menu-sep" role="separator"></div><div class="menu-head">Relations here</div>${relations}` : ''}</div></span>`;
}

// A computed record can't be deleted, only kept as entered or overridden (see whyBlock).
function deleteButton(id, small = false) {
  if (isComputed(id)) return '';
  const r = records[id];
  const reason = isObjectName(id) ? `Every ${records[r.at].kind.toLowerCase()} needs a Name` : '';
  const cls = small ? 'icon-btn is-small' : 'icon-btn';
  return reason
    ? `<span title="${esc(reason)}"><button class="${cls}" disabled aria-label="Delete">${icon('trash')}</button></span>`
    : `<button class="${cls}" data-action="delete" data-id="${id}" aria-label="Delete ${esc(recordLabel(id))}" title="Delete">${icon('trash')}</button>`;
}

// A choice's option with a chevron that opens the other options of its parameterization, wherever it's shown.
function choiceSelect(id, cls = '') {
  const r = records[id];
  const key = `opt:${id}`;
  const open = ui.menu === key;
  const items = open ? outputsOf(id).map(o =>
    `<button class="menu-item" role="menuitemradio" aria-checked="${same(o, r.choice)}" data-action="set-choice" data-id="${id}" data-value="${esc(o)}">
      <span class="menu-text">${esc(o)}</span>${same(o, r.choice) ? icon('check') : ''}</button>`).join('') : '';
  return `<span class="menu-anchor"><button class="select ${cls}${isComputed(id) ? ' is-computed' : ''}" data-action="menu" data-menu="${key}" aria-haspopup="menu" aria-expanded="${open}">
      <span class="select-text">${esc(r.choice)}</span>${icon('chevron-down')}</button>${open ? `<div class="pop menu menu-left" role="menu">${items}</div>` : ''}</span>`;
}

// A location as its object's name, then the segments below the object: all of them if full paths are on,
// otherwise just the last `keep`. In a relation's header, a "…" marks the hidden ones; in rows, where the
// row's parameter already implies them, the object's name alone stands in, with the full path on hover.
function locationHtml(id, keep = 0, marked = false) {
  const [head, ...tail] = pathTo(id);
  const shown = ui.fullPaths ? tail : tail.slice(tail.length - keep);
  const full = esc([head, ...tail].map(segmentText).join(' › '));
  const parts = [`<a href="${esc(panelHref(head))}" title="${full}">${esc(segmentText(head))}</a>`];
  if (marked && shown.length < tail.length)
    parts.push(`<button class="path-more" data-action="full-paths" aria-label="Show full paths" title="${full}">…</button>`);
  parts.push(...shown.map(p => `<a class="path-seg" href="${esc(panelHref(p))}">${esc(segmentText(p))}</a>`));
  return `<span class="loc">${parts.join('<span class="path-sep">›</span>')}</span>`;
}

// A relation's value, or a field located at it, typed over in place; `label` names it in an error, as the
// row it's in does.
function relationValue(id, label, title = 'Change') {
  const edit = ui.relEdit?.id === id ? ui.relEdit : null;
  if (!edit) return `<button class="rel-value${isComputed(id) ? ' is-computed' : ''}" data-action="rel-edit" data-id="${id}" data-label="${esc(label)}" title="${esc(title)}">${esc(displayValue(records[id]))}</button>`;
  return `<input class="input rel-input" data-rel-edit="${id}" value="${esc(edit.text)}" autocomplete="off" spellcheck="false" data-autofocus>`
    + (edit.error ? `<span class="rel-error">${esc(edit.error)}</span>` : '');
}

// The fields located at a relation, such as an ownership's Percentage, read and changed at a glance after
// its output. A date says what it is (Admission Date February 11, 2025), since a date alone could mean
// anything, where a percentage or a title reads for itself. A field that relations like it have, or that's
// required at it, but it lacks shows as a blank to fill in, flagged if it's required.
function relationDetails(id) {
  const have = entriesOf(id).filter(e => isField(records[e]));
  const required = missingAt(id).filter(([, req]) => req.type === 'field').map(([, req]) => ({ label: req.label, datatype: req.datatype, required: true }));
  const blanks = [...required, ...detailFieldsOf(id).filter(d => !required.some(x => same(x.label, d.label)))].filter(d => !have.some(e => same(records[e].edge, d.label)));
  const value = e => (records[e].field === 'date' ? `<span class="rel-detail-label">${esc(records[e].edge)}</span>` : '') + relationValue(e, records[e].edge, records[e].edge);
  const parts = have.map(value).concat(blanks.map(d => detailBlank(id, d)));
  return parts.length ? `<span class="rel-details">${parts.map(p => `<span class="rel-detail">${p}</span>`).join('')}</span>` : '';
}

function detailBlank(at, d) {
  const edit = !ui.relEdit?.id && ui.relEdit?.at === at && same(ui.relEdit.label, d.label) ? ui.relEdit : null;
  if (!edit) return `<button class="rel-value is-blank${d.required ? ' is-required' : ''}" data-action="detail-add" data-id="${at}" data-label="${esc(d.label)}" data-datatype="${d.datatype}"
    title="${d.required ? `${esc(d.label)} is required. Add it` : `Add its ${esc(d.label)}`}">${esc(d.label)}${d.required ? Parts.required() : ''}</button>`;
  return `<input class="input rel-input" data-rel-edit="${at}" value="${esc(edit.text)}" placeholder="${esc(d.label)}" autocomplete="off" spellcheck="false" data-autofocus>`
    + (edit.error ? `<span class="rel-error">${esc(edit.error)}</span>` : '');
}

// A relation's output in a row or table: a checkbox for a tag, a dropdown for a choice, a value for a field.
const relationOutput = (id, label) => {
  const r = records[id];
  return isTag(r) ? tagBox(id) : isChoice(r) ? choiceSelect(id) : relationValue(id, label);
};

// A tag's checkbox (Parts.tagBox), which a click switches. An implied one is outlined rather than filled.
const tagBox = id => Parts.tagBox(id, `data-action="tag-flip" data-id="${id}"`);

const openRelation = id =>
  `<a class="icon-btn is-small" href="${esc(panelHref(id))}" aria-label="Open this relation" title="Open">${icon('arrow-right')}</a>`;

// A two-argument relation at a location reads like any entry: labeled with the other side's edge, with the
// other side's location as its value. Relations sharing that label are listed together in one row. A tag's
// checkbox comes first; a field's value or a choice's option, and the fields located at the relation, last.
// The row is labeled with the pilot's name for the list, like Owners, if the relation has one.
// A row of computed relations only starts collapsed, with a count, since formulas can list many.
function relationRow(g, at, depth) {
  const name = g.list;
  const key = `rel|${at}|${g.key}`;
  const computedOnly = g.ids.every(isComputed);
  const open = !computedOnly || ui.expanded.has(key);
  const twist = computedOnly ? `<button class="twisty" data-action="toggle" data-id="${esc(key)}" aria-expanded="${open}" aria-label="${open ? 'Collapse' : 'Expand'} ${esc(name)}">${icon('chevron-right')}</button>` : '<span class="twisty"></span>';
  const label = `${twist}<span class="label-text">${esc(name)}</span>`;
  if (!open) {
    const others = g.ids.map(id => placeName((records[id].args.find(a => a.at !== at) ?? records[id].args[0]).at));
    const summary = `<button class="rel-summary" data-action="toggle" data-id="${esc(key)}" title="Show them">${g.ids.length} · ${esc(others.slice(0, 3).join(', '))}${others.length > 3 ? ', …' : ''}</button>`;
    return row(depth, label, summary, '', ' is-computed-group');
  }
  const items = g.ids.map(id => {
    const r = records[id];
    const other = r.args.find(a => a.at !== at) ?? r.args[0];
    const output = (isTag(r) ? '' : relationOutput(id, name)) + relationDetails(id);
    const lead = isTag(r) ? `<span class="rel-lead">${relationOutput(id)}${locationHtml(other.at)}</span>` : locationHtml(other.at);
    return `<div class="rel-item"><span class="rel-head">${lead}${formulaMark(id)}
      <span class="rel-item-actions">${openRelation(id)}${deleteButton(id, true)}</span></span>
      ${output ? `<span class="rel-output">${output}</span>` : ''}</div>${ui.why === id ? whyBlock(id) : ''}`;
  }).join('');
  const canAdd = relationTypesAt(at).some(t => t.key === g.key);
  const actions = canAdd ? `<button class="icon-btn" data-action="add-relation" data-id="${at}" data-key="${esc(g.key)}" aria-label="Add another ${esc(name)}" title="Add another">${icon('plus')}</button>` : '';
  return row(depth, label, `<div class="rel-items">${items}</div>`, actions);
}

// A relation with more arguments shows as a table under its name (Signing Authority), with a column per
// other argument, headed by its edge. Each heading is a dropdown that narrows the rows to one location
// there, offering only the locations left in rows that match the other columns, until the rows that remain
// show their outputs alone.
function relationTable(g, at, depth) {
  const table = `${at}|${g.key}`;
  const filters = ui.filters[table] ?? {};
  const rows = g.ids.map(id => {
    const rest = records[id].args.filter(a => a.at !== at);
    return { id, cells: g.others.map(edge => rest.splice(rest.findIndex(a => same(a.edge, edge)), 1)[0].at) };
  });
  const matches = (row, except) => Object.entries(filters).every(([c, at]) => Number(c) === except || row.cells[c] === at);
  const shown = rows.filter(row => matches(row, -1));
  const withValue = g.type !== 'tag';
  const style = `--depth:${depth}; --cols:${g.others.length - 1 + (withValue ? 1 : 0)}`;
  const heads = g.others.map((edge, c) => columnFilter(table, c, edge, rows.filter(row => matches(row, c)).map(row => row.cells[c]), filters[c]));
  const head = `<div class="rel-row is-head"><div class="rel-c0"><span class="twisty"></span>${heads[0]}</div>
    ${heads.slice(1).map(h => `<div class="rel-c">${h}</div>`).join('')}${withValue ? '<div class="rel-c"></div>' : ''}</div>`;
  const body = shown.map(({ id, cells }) => `<div class="rel-row">
      <div class="rel-c0">${g.type === 'tag' ? relationOutput(id) : '<span class="twisty"></span>'}${locationHtml(cells[0])}</div>
      ${cells.slice(1).map(c => `<div class="rel-c">${locationHtml(c)}</div>`).join('')}
      ${withValue ? `<div class="rel-c">${relationOutput(id, relationNameOf(id))}</div>` : ''}
      <div class="rel-acts">${openRelation(id)}${deleteButton(id, true)}</div></div>`).join('');
  const note = shown.length < rows.length
    ? `<div class="rel-note">Showing ${shown.length} of ${rows.length} · <button class="link-btn" data-action="col-clear" data-key="${esc(table)}">Show all</button></div>` : '';
  const title = `<div class="rel-title"><span class="twisty"></span><span class="label-text">${esc(formName(g.form))}</span></div>`;
  return `<div class="rel-table" style="${style}">${depth ? '<span class="guides"></span>' : ''}${title}${head}${body}${note}</div>`;
}

function columnFilter(table, c, edge, locations, picked) {
  const key = `col:${table}:${c}`;
  const open = ui.menu === key;
  const counts = new Map();
  for (const at of locations) counts.set(at, (counts.get(at) ?? 0) + 1);
  const item = (value, text, n) =>
    `<button class="menu-item" role="menuitemradio" aria-checked="${(picked ?? '') === value}" data-action="col-filter" data-key="${esc(table)}" data-col="${c}" data-value="${value}">
      <span class="menu-text">${esc(text)}</span>${n ? `<span class="menu-note">${n}</span>` : ''}${(picked ?? '') === value ? icon('check') : ''}</button>`;
  const items = open ? item('', 'Any', 0) + [...counts].sort((a, b) => byLabel(placeName(a[0]), placeName(b[0])))
    .map(([at, n]) => item(at, placeName(at), n)).join('') : '';
  return `<span class="menu-anchor"><button class="col-filter${picked ? ' is-active' : ''}" data-action="menu" data-menu="${esc(key)}" aria-haspopup="menu" aria-expanded="${open}"
      title="${esc(picked ? `${edge}: ${placeName(picked)}` : edge)}"><span class="col-filter-text">${esc(edge)}${picked ? `<span class="col-picked">: ${esc(placeName(picked))}</span>` : ''}</span>${icon('chevron-down')}</button>
    ${open ? `<div class="pop menu menu-left" role="menu">${items}</div>` : ''}</span>`;
}

// A relation's arguments, for its own panel's header: one row per location, labeled with the edges that
// lead there, so arguments that meet at one location share a row. Each location shows its object and
// just enough segments, counted back from the relation, to tell its parameter from others with the same
// edge label; copies of one parameter can't be told apart that way and are told apart by their objects.
// Each edge label can be renamed in place (see edgeLabel).
function argumentRows(id) {
  const r = records[id];
  // Each segment compared as shown: an object by its kind, a path entry by its edge and root label.
  const segment = p => { const s = records[p]; return isObject(s) || isRelation(s) ? specKey(records, p) : JSON.stringify([norm(s.edge), rootLabel(s)]); };
  const info = r.args.map(a => ({ ...a, spec: specKey(records, a.at), segs: pathTo(a.at).map(segment) }));
  const keep = new Map();
  for (const x of info) {
    const rivals = info.filter(y => y !== x && same(y.edge, x.edge) && y.spec !== x.spec);
    const suffix = (segs, n) => JSON.stringify(segs.slice(segs.length - n));
    let n = 0;
    while (n < x.segs.length - 1 && rivals.some(y => suffix(y.segs, n) === suffix(x.segs, n))) n++;
    keep.set(x.at, Math.max(keep.get(x.at) ?? 0, n));
  }
  const byLocation = new Map();
  for (const a of r.args) byLocation.set(a.at, [...new Set([...(byLocation.get(a.at) ?? []), a.edge])]);
  const editing = ui.edgeEdit?.id === id ? ui.edgeEdit : null;
  return `<div class="args">${[...byLocation].map(([at, edges]) =>
    `<div class="arg-label">${edges.map(e => edgeLabel(id, e)).join('<span class="arg-sep">·</span>')}</div><div class="arg-value">${locationHtml(at, keep.get(at), true)}</div>`
    + (editing && edges.some(e => same(e, editing.edge)) ? edgeEditor(id, editing) : '')).join('')}</div>`;
}

// An edge label in a relation's header, with a way to rename it: in place for an entered relation, and in
// its definition for a computed one (or an entered one a formula covers), whose edges are the definition's.
function edgeLabel(id, edge) {
  const editing = ui.edgeEdit?.id === id && same(ui.edgeEdit.edge, edge);
  if (editing) return `<input class="input edge-input" data-edge-edit value="${esc(ui.edgeEdit.text)}" aria-label="New label for ${esc(edge)}" autocomplete="off" spellcheck="false" data-autofocus>`;
  const def = formulaInfo(id) && definitionOf(formulaInfo(id).def);
  const rename = def
    ? `<a class="icon-btn is-small edge-rename" href="${esc(panelHref(`definition:${def.id}`))}" aria-label="Rename ${esc(edge)} in ${esc(def.name)}" title="Its edges are ${esc(def.name)}’s: rename them in its definition">${icon('pencil')}</a>`
    : `<button class="icon-btn is-small edge-rename" data-action="edge-edit" data-id="${id}" data-edge="${esc(edge)}" aria-label="Rename ${esc(edge)}" title="Rename ${esc(edge)}">${icon('pencil')}</button>`;
  return `<span class="arg-edge"><span>${esc(edge)}</span>${rename}</span>`;
}

// Under the edge being renamed: here only or every relation like this one, then save or cancel.
function edgeEditor(id, edit) {
  const like = likeRecords(id).length;
  const r = records[id];
  const scope = like > 1 ? renameScope('edge-scope', edit.scope, `Every ${relationNameOf(id)}`, like,
    `Rename ${edit.edge} on every relation like this one, whatever kinds it relates, and in the formulas and names that use it`) : '';
  const error = edit.error ? `<span class="note-text is-error">${icon('alert-triangle')}${esc(edit.error)}</span>` : '';
  return `<div class="edge-edit">${scope}<span class="edge-edit-actions">${error}
    <button class="icon-btn is-primary" data-action="edge-save" aria-label="Save" title="Save">${icon('check')}</button>
    <button class="icon-btn" data-action="cancel" aria-label="Cancel" title="Cancel">${icon('x')}</button></span></div>`;
}

// Relabels the edge being edited. Returns why it couldn't, if it couldn't.
function saveEdge() {
  const edit = ui.edgeEdit;
  const to = clean(edit.text);
  if (!to) return 'Give it a label.';
  if (same(to, edit.edge) && to === edit.edge) return null;
  if (records[edit.id].args.some(a => !same(a.edge, edit.edge) && same(a.edge, to))) return `This relation already has a ${to}.`;
  const every = edit.scope !== 'here' && likeRecords(edit.id).length > 1;
  const n = every ? likeRecords(edit.id).length : 1;
  const error = renameEdge(edit.id, edit.edge, to, every);
  if (error) return error;
  if (!every) ensureRelationStyle(edit.id);
  ui.info = every ? `Renamed ${edit.edge} to ${to} on ${count(n, 'relation')}, and in the formulas and names.` : `Renamed ${edit.edge} to ${to} on this relation only.`;
  return null;
}

// A box with a listbox of existing names or options; a chevron marks an option box.
function combo(role, value, placeholder, chevron = false) {
  return `<span class="combo"><span class="combo-field">
      <input class="input combo-input" data-input="${role}" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="listbox-${role}"
        value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off" spellcheck="false"${ui.focus === role ? ' data-autofocus' : ''}>
      ${chevron ? icon('chevron-down', 'combo-chevron') : ''}</span>
    <div class="pop listbox" id="listbox-${role}" role="listbox" hidden></div></span>`;
}

// The line under a form: a hint or error, and the keys that save or cancel.
function formNote(plain = false) {
  const f = ui.form;
  let text = '', cls = '';
  if (ui.error) [text, cls] = [`${icon('alert-triangle')}${esc(ui.error)}`, 'is-error'];
  else if (takesValue(f) && f.step === 'output') ({ text, cls = '' } = fieldHint(f));
  const more = f.type === 'relation' ? f.step === 'other' && f.rel.type !== 'tag' : f.step === 'name' && f.type !== 'tag';
  const enter = more ? 'next' : f.mode === 'add' ? 'add' : 'save';
  return `<div class="form-note${plain ? ' is-plain' : ''}"><div class="form-note-inner">
      <span class="note-text ${cls}" data-note>${text}</span>${editExtras(f)}
      <span class="form-keys"><span><kbd>Enter</kbd> ${enter}</span><span><kbd>Esc</kbd> cancel</span></span>
    </div>${scopeLine(f)}</div>`;
}

// Under the note, where other entries are like the one being edited: whether a new label renames this
// one only, or every one like it (see renameScope).
function scopeLine(f) {
  if (f.mode !== 'edit' || f.cell || !f.id || isObjectName(f.id)) return '';
  const like = likeRecords(f.id).length;
  if (like < 2) return '';
  return `<div class="form-note-inner form-scope"><span class="scope-label">A new name reaches</span>${renameScope('rename-scope', f.scope, `Every ${records[f.id].edge}`, like,
    `Rename ${records[f.id].edge} wherever it has this form (${describeForm(formKeyOf(f.id)).where}), and in the formulas and names that use it`)}</div>`;
}

// Editing an entry also offers to require it at every location like this one, and to move it up a level.
function editExtras(f) {
  if (f.mode !== 'edit' || f.cell || !f.id || isObjectName(f.id)) return '';
  const on = isRequired(parameterization(records, f.id));
  const loc = records[f.at];
  const up = !isObject(loc) && !isRelation(loc)
    ? `<button class="link-btn" data-action="move-up" data-id="${f.id}" title="Put it at ${esc(segmentText(loc.at))} instead (Alt+Left on its handle)">Move up a level</button>` : '';
  return `<span class="form-extras"><button class="link-btn" data-action="toggle-required" data-id="${f.id}" aria-pressed="${on}"
    title="Flag it wherever it’s blank">${box(on ? true : null)}Required ${esc(whereAt(f.at))}</button>${up}</span>`;
}

// Where a rename reaches: here only, or every record like this one (`count` of them, this one included).
function renameScope(action, scope, every, count, title) {
  return `<span class="seg rename-scope" role="group" aria-label="Rename">
    <button data-action="${action}" data-value="here" aria-pressed="${scope === 'here'}" title="Rename only this one">Here only</button>
    <button data-action="${action}" data-value="every" aria-pressed="${scope !== 'here'}" title="${esc(title)}">${esc(every)} (${count})</button></span>`;
}

// A required entry that's blank: its label flagged with an asterisk, and a prompt to fill it in.
function requiredRow(at, param, req, depth) {
  const label = `<span class="twisty"></span><span class="label-text">${esc(req.label)}${Parts.required()}</span>`;
  const data = `data-action="fill-required" data-id="${at}" data-param="${esc(param)}"`;
  const value = req.type === 'tag' ? checkbox(null, data)
    : `<button class="value-btn req-blank" ${data}>${req.type === 'choice' ? 'Choose an option' : req.datatype === 'date' ? 'Enter a date' : 'Enter a value'}</button>`;
  const actions = `<button class="icon-btn" data-action="unrequire" data-param="${esc(param)}" aria-label="Stop requiring ${esc(req.label)}" title="Stop requiring it">${icon('x')}</button>`;
  return `<div class="entry is-blank">${row(depth, label, value, actions, ' is-required')}</div>`;
}

const takesValue = f => f.type === 'field' || f.rel?.type === 'field';

// Refreshes a field form's hint as its boxes are typed in, without re-rendering.
function refreshFieldHint() {
  const f = ui.form;
  const note = document.querySelector('[data-note]');
  if (!note || f.step !== 'output') return;
  const { text, cls = '' } = fieldHint(f);
  note.className = `note-text ${cls}`;
  note.textContent = text;
}

const saveButton = `<button class="icon-btn is-primary" data-action="save" aria-label="Save" title="Save">${icon('check')}</button>`;
const cancelButton = `<button class="icon-btn" data-action="cancel" aria-label="Cancel" title="Cancel">${icon('x')}</button>`;

function formBlock(depth) {
  const f = ui.form;
  const label = '<span class="twisty"></span>'
    + (f.cell ? `<span class="label-text">${esc(f.name)}</span>` : combo('name', f.name, `${TYPE_NAMES[f.type]} name`));
  // A new tag's checkbox starts green and can be switched to red before the tag is added. Instead, it can
  // be given an implication, which works it out at every location like this one.
  const tagFormula = f.mode === 'add' && !f.required
    ? `<input class="input fx-inline" data-input="formula" value="${esc(f.formula)}" placeholder="or ← a condition" autocomplete="off" spellcheck="false" title="Type ← (or <-) and a condition to work this tag out by formula">` : '';
  const value = f.type === 'tag' ? `<span class="fx-tag-value">${checkbox(!f.not, 'data-action="toggle-not"')}${tagFormula}</span>`
    : f.step === 'name' ? `<span class="ghost">${f.type === 'choice' ? `Option${icon('chevron-down')}` : 'Value'}</span>`
    : f.type === 'choice' ? combo('output', f.output, 'Option', true)
    : `<input class="input" data-input="output" value="${esc(f.output)}" placeholder="Value, or = a formula" autocomplete="off" spellcheck="false"${ui.focus === 'output' ? ' data-autofocus' : ''}>`;
  const actions = (f.type === 'tag' || f.step === 'output' ? saveButton : '') + cancelButton;
  const formula = f.mode === 'edit' && !f.cell && f.id && !isObjectName(f.id) ? formulaSection(f.id) : '';
  return `<div class="form-block">${row(depth, label, value, actions)}${formNote()}${formula}</div>`;
}

// Adding to a two-argument relation: labeled like its row, with a box that picks the other side, then its option or value.
function relationForm(depth) {
  const f = ui.form;
  const t = f.rel;
  const box = t.type === 'tag' ? checkbox(!f.not, 'data-action="toggle-not"') : '';
  const value = f.step === 'other' ? `<div class="rel-item">${box}${combo('other', f.other, `Choose ${t.other}`)}</div>`
    : `<div class="rel-item">${box}${locationHtml(f.otherId)}<span class="rel-output">${t.type === 'choice' ? combo('output', f.output, 'Option', true)
      : `<input class="input rel-input" data-input="output" value="${esc(f.output)}" placeholder="Value" autocomplete="off" spellcheck="false"${ui.focus === 'output' ? ' data-autofocus' : ''}>`}</span></div>`;
  const actions = (t.type === 'tag' || f.step === 'output' ? saveButton : '') + cancelButton;
  return `<div class="form-block">${row(depth, `<span class="twisty"></span><span class="label-text">${esc(t.list)}</span>`, value, actions)}${formNote()}</div>`;
}

function entryRow(id, depth) {
  const f = ui.form;
  if (f?.mode === 'edit' && f.id === id) return formBlock(depth);
  const r = records[id];
  const computed = isComputed(id);
  let label = grip(id) + twisty(id), value;
  if (isField(r)) {
    label += `<span class="label-text" title="${esc(r.edge)}">${esc(r.edge)}</span>`;
    value = `<button class="value-btn${computed ? ' is-computed' : ''}" data-action="edit-cell" data-id="${id}" data-live="${id}">${esc(displayValue(r))}</button>`;
    // A document is edited like any value, and opened from beside it.
    if (r.field === 'document') value += `<a class="icon-btn is-small doc-open" href="${esc(SharePoint.openUrl(r.value))}" target="_blank" rel="noopener" aria-label="Open ${esc(displayValue(r))}" title="Open ${esc(displayValue(r))}">${icon('external-link')}</a>`;
  } else if (isChoice(r)) {
    label += `<a class="label-text" href="${esc(panelHref(id))}" title="Open ${esc(r.edge)}">${esc(r.edge)}</a>`;
    value = `<button class="select${computed ? ' is-computed' : ''}" data-action="edit-cell" data-id="${id}" aria-haspopup="listbox" title="Change ${esc(r.edge)}">
      <span class="select-text">${esc(r.choice)}</span>${icon('chevron-down')}</button>`;
  } else {
    label += `<a class="label-text" href="${esc(panelHref(id))}" title="Open ${esc(r.edge)}">${esc(r.edge)}</a>`;
    value = tagBox(id);
  }
  // A collapsed entry with something required blank below it says so.
  if (!isField(r) && !ui.expanded.has(id) && missingUnder(id).length)
    label += `<span class="req-below">${Parts.required('Something required below is blank')}</span>`;
  // A computed entry isn't edited or deleted here; its formula is, from the explanation under it.
  const actions = (isField(r) ? '' : addMenu(id, true)) + (computed ? ''
    : `<button class="icon-btn" data-action="edit" data-id="${id}" aria-label="${isTag(r) ? 'Rename' : 'Edit'} ${esc(r.edge)}" title="${isTag(r) ? 'Rename' : 'Edit'}">${icon('pencil')}</button>${deleteButton(id)}`);
  return row(depth, label + styleDot(id), `<span class="fx-value">${value}${formulaMark(id)}</span>`, actions, engagedHere(id) ? ' is-engaged' : '');
}

// A formula's results that are errors at a location, such as a #CIRCULAR! 3(c)(1) Count, shown where the
// entry would be.
function errorRows(at, depth) {
  return (formulaResult.errors ?? []).filter(e => e.args?.length === 1 && e.args[0].at === at && !entriesOf(at).some(k => same(records[k].edge, e.args[0].edge)))
    .map(e => {
      const d = definitionOf(e.def);
      const label = `<span class="twisty"></span><span class="label-text">${esc(e.args[0].edge)}</span>`;
      const value = Parts.formulaError(e.error.code, { href: panelHref(`definition:${e.def}`), title: `${e.error.msg} (${d?.name ?? 'a formula'})` });
      return `<div class="entry">${row(depth, label, value, '')}</div>`;
    }).join('');
}

// Each entry is wrapped with its expanded entries, so it can be dragged among its siblings as a unit.
// The relations at the location follow, grouped into rows (two arguments) or tables (more).
function entryRows(at, depth) {
  const f = ui.form;
  let html = f?.mode === 'add' && f.at === at && f.type !== 'relation' && !f.required ? formBlock(depth) : '';
  for (const id of entriesOf(at)) {
    const children = ui.expanded.has(id) ? entryRows(id, depth + 1) : '';
    const why = ui.why === id && !(f?.mode === 'edit' && f.id === id) ? whyBlock(id, depth) : '';
    html += `<div class="entry" data-entry="${id}" data-at="${at}"${isObjectName(id) ? ' data-pinned' : ''} style="--depth:${depth}">${entryRow(id, depth)}${why}${children}</div>`;
  }
  html += errorRows(at, depth);
  // Required entries that are blank here, each filled in where it stands.
  for (const [param, req] of missingAt(at))
    html += f?.mode === 'add' && f.at === at && f.required === param ? formBlock(depth) : requiredRow(at, param, req, depth);
  // A relation being added appears under the row it'll join, or after the rest if it starts a new one.
  // Rows of computed relations come after the entered ones.
  const adding = f?.type === 'relation' && f.at === at;
  const groups = relationGroups(at);
  const computedOnly = g => g.ids.every(isComputed);
  for (const g of [...groups.filter(g => !computedOnly(g)), ...groups.filter(computedOnly)]) {
    html += g.others.length > 1 ? relationTable(g, at, depth) : relationRow(g, at, depth);
    if (adding && g.key === f.rel.key) html += relationForm(depth);
  }
  if (adding && !groups.some(g => g.key === f.rel.key)) html += relationForm(depth);
  return html;
}

// On a record's own page, the page has the path, the title and the actions, so the head keeps the rest.
const panelHead = ({ crumbs = '', title, sub, actions = '', extra = '' }) => panelOptions.page
  ? (extra ? `<div class="panel-head is-page">${extra}</div>` : '') : `
  <div class="panel-head">
    ${crumbs ? `<nav class="crumbs" aria-label="Path">${crumbs}</nav>` : ''}
    <div class="title-row">
      <div class="title-block"><h1>${title}</h1><div class="subtitle">${sub}</div></div>
      <div class="head-actions">${actions}</div>
    </div>
    ${extra}
  </div>`;

// A row linking to one of the panel's views, by its address.
const listRow = (hash, title, meta) =>
  `<a class="list-row" href="${esc(panelHref(hash))}"><span class="list-title">${esc(title)}</span><span class="list-meta">${esc(meta)}</span>${icon('chevron-right', 'list-chevron')}</a>`;
const allLink = () => `<a href="${esc(panelHref(''))}">All</a>`;

const kindHash = kind => `kind:${encodeURIComponent(kind)}`;

// A segment of the header path. A choice's option opens a dropdown there too, as it does in its row.
// A relation's segment names its edges, with its arguments on hover.
const crumb = id => {
  const r = records[id];
  if (isChoice(r) && !isRelation(r))
    return `<span class="crumb-choice"><a href="${esc(panelHref(id))}">${esc(r.edge)}</a>${choiceSelect(id, 'in-crumbs')}</span>`;
  const title = isRelation(r) ? ` title="${esc(r.args.map(a => `${a.edge}: ${placeName(a.at)}`).join('; '))}"` : '';
  return `<a href="${esc(panelHref(id))}"${title}>${esc(segmentText(id))}</a>`;
};

function recordView(id) {
  const r = records[id];
  if (isRelation(r)) return relationView(id);
  const path = pathTo(id);
  const head = records[path[0]];
  const start = !isObject(head) ? []
    : ui.showRoot ? [allLink(), `<a href="${esc(panelHref(kindHash(head.kind)))}">${esc(plural(head.kind))}</a>`]
    : [`<button class="crumb-more" data-action="reveal" aria-label="Show full path" title="Show full path">${icon('dots')}</button>`];
  const crumbs = [...start, ...path.slice(0, -1).map(crumb)].join(icon('chevron-right', 'crumb-sep'));
  const title = isObject(r) ? { title: `<span data-live="${nameRecordOf(id) ?? ''}">${esc(objectName(id))}</span>`, sub: kindChip(id) }
    : isTag(r) ? { title: `${box(r.tag)}<span>${esc(r.edge)}</span>`, sub: r.tag ? 'Tag' : 'Tag · ruled out' }
    : isChoice(r) ? { title: `<span>${esc(r.edge)}</span>${choiceSelect(id, 'in-title')}`, sub: 'Choice' }
    : { title: esc(r.edge), sub: `${DATATYPE_NAMES[r.field]} field: ${esc(displayValue(r))}` };
  const rows = isField(r) ? '' : entryRows(id, 0);
  const body = rows || `<div class="empty">${isField(r) ? 'A field holds a value and has no entries.' : 'Nothing recorded here yet.'}</div>`;
  const extra = !isObject(r) && formulaInfo(id) ? whyBlock(id, 0, true) : '';
  return [panelHead({ ...title, crumbs, actions: isField(r) ? '' : addMenu(id), extra }), body];
}

// An object's kind under its name. On a page with a chart it engages the kind's entry in the Kind style,
// and is highlighted while that's engaged.
function kindChip(id) {
  const r = records[id];
  const s = panelOptions.engaged && styles.find(isKindStyle);
  if (!s) return esc(r.kind);
  const eng = panelOptions.engaged();
  const on = eng?.style === s && (eng.output === '*' || eng.output === norm(r.kind));
  return `<button class="kind-chip${on ? ' is-engaged' : ''}" data-action="style-engage" data-style="${s.id}" data-output="${esc(norm(r.kind))}"
    title="The Kind style gives every ${esc(r.kind.toLowerCase())} its box. Click to format it.">${styleDot(id, true)}${esc(r.kind)}</button>`;
}

// A relation's own panel: its edges and output as the title, its arguments in place of a path, and below,
// any entries located at it.
// It's titled with its relation's name (see formName); its roles follow in the subtitle. A computed one, or
// one a definition also covers, says so under its arguments, along with the definition for relations like it.
function relationView(id) {
  const r = records[id];
  const name = relationNameOf(id);
  const title = (isTag(r) ? relationOutput(id) : '') + `<span>${esc(name)}</span>`
    + (isChoice(r) ? choiceSelect(id, 'in-title') : isField(r) ? `<span class="title-output">${relationValue(id, name)}</span>` : '');
  const style = panelOptions.engaged && styleOf(id);
  const type = isComputed(id) ? `Computed ${TYPE_NAMES[typeOf(r)].toLowerCase()}` : TYPE_NAMES[typeOf(r)];
  const sub = `${type} relation · ${esc(joinList(r.args.map(a => a.edge)))}${isTag(r) && !r.tag ? ' · ruled out' : ''}`
    + (style ? ` · <button class="kind-chip${engagedHere(id) ? ' is-engaged' : ''}" data-action="style-engage" data-style="${style.id}" data-output="${esc(outputKey(r))}">${styleDot(id, true)}Line style</button>` : '');
  // A computed relation is all its explanation says; one that's entered may have more recorded about it.
  const rows = isField(r) ? '' : entryRows(id, 0);
  const body = rows || (isComputed(id) ? '' : `<div class="empty">${isField(r) ? 'A field relation holds a value and has no entries.' : 'Nothing recorded about this relation yet.'}</div>`);
  const extra = argumentRows(id) + (formulaInfo(id) ? whyBlock(id, 0, true) : formulaSection(id));
  return [panelHead({ title, sub, actions: isField(r) ? '' : addMenu(id), extra }), body];
}

// The kinds a chart with nothing in it yet offers to start from.
const STARTING_KINDS = ['Entity', 'Individual'];

// A kind's objects, and New to add one. A kind the chart doesn't have, as an address cut short or mistyped
// may name, says so rather than offer to start it; only an empty chart starts its kinds here.
function kindView(kind) {
  const kinds = kindsInState();
  if (!kinds.some(k => same(k, kind)) && !(!kinds.length && STARTING_KINDS.some(k => same(k, kind))))
    return [panelHead({ crumbs: allLink(), title: esc(kind), sub: 'No such kind' }),
      `<div class="empty">This chart has no ${esc(kind)}. Its kinds are listed under <a class="link" href="${esc(panelHref(''))}">All</a>.</div>`];
  const ids = objectsOfKind(kind);
  const f = ui.form;
  const form = f?.type === 'object' ? `<div class="form-block"><div class="list-row">
      <input class="input" data-input="name" value="${esc(f.name)}" placeholder="${esc(kind)} name" autocomplete="off" spellcheck="false" data-autofocus>
      ${saveButton}${cancelButton}</div>${formNote(true)}</div>` : '';
  // A one-line summary of each object: the options of its top-level choices.
  const summary = id => entriesOf(id).filter(e => isChoice(records[e])).map(e => records[e].choice).join(' · ');
  const head = panelHead({
    crumbs: allLink(), title: esc(plural(kind)), sub: count(ids.length, kind.toLowerCase()),
    actions: `<button class="btn btn-primary" data-action="add" data-type="object" data-kind="${esc(kind)}">${icon('plus')}New ${esc(kind)}</button>`,
  });
  return [head, form + ids.map(id => listRow(id, objectName(id), summary(id))).join('')];
}

// A chart with nothing in it yet offers the usual kinds to start from, since objects are added from their
// kind's view.
function allView() {
  const kinds = kindsInState();
  const head = panelHead({ title: 'All', sub: kinds.length ? 'Browse records by kind' : 'Nothing here yet. Start with a kind.' });
  const deleted = archive.length ? listRow('deleted', 'Deleted', String(archive.length)) : '';
  const schemaRow = listRow('schema', 'Schema', `${count(formsOfSchema().length, 'form')}${definitions.length ? ` · ${count(definitions.length, 'definition')}` : ''}`);
  return [head, (kinds.length ? kinds : STARTING_KINDS).map(k => listRow(kindHash(k), plural(k), String(countOfKind(k)))).join('') + schemaRow + deleted];
}

const ago = when => {
  const min = Math.round((Date.now() - when) / 60000);
  return min < 1 ? 'just now' : min < 60 ? `${min} min ago` : min < 1440 ? `${Math.round(min / 60)} h ago` : new Date(when).toLocaleDateString();
};

// Deleted records, newest first, each batch with what depended on it, to restore.
function deletedView() {
  const head = panelHead({ crumbs: allLink(), title: 'Deleted', sub: 'Restoring brings back what depended on it, too' });
  const rows = archive.map(b => {
    const n = Object.keys(b.records).length - 1;
    return `<div class="list-row"><span class="list-title">${esc(b.label)}</span>
      <span class="list-meta">${n ? `with ${count(n, 'dependent')} · ` : ''}${ago(b.when)}</span>
      <button class="btn" data-action="restore" data-id="${b.id}">Restore</button></div>`;
  }).join('');
  return [head, rows || '<div class="empty">Nothing’s deleted. Deleted records show up here, and can be restored.</div>'];
}

// ---- The Schema view ----
// The chart's vocabulary, a row for each form (see "The schema" and "Forms" in model.js): kinds, entries
// and relations. A form's row opens onto everything keyed by it or by its parameterizations: where its
// records are and whether they're required, its outputs, a relation's name, roles and list names, the
// definitions that compute it and, on a page with a chart, whether this view shows it and its style. The
// filters narrow it to computed forms, or to forms with specifications nothing has, which can be removed.

const SCHEMA_FILTERS = [['all', 'All'], ['computed', 'Computed'], ['unused', 'Unused']];

// What sort of thing a form is, as its badge says (see sortName), a kind's being Kind.
const sortText = form => form === 'object' ? 'Kind' : sortName(JSON.parse(form)[0], isRelationForm(form));

// Where a parameterization's records are: an entry's location, or each of a relation's edges with its
// location. '' if the schema no longer has it.
function paramWhere(param) {
  const t = specsWithParam(param)[0];
  if (!t) return '';
  if (t.kind !== undefined) return 'Anywhere';
  return t.args.length > 1 ? t.args.map(a => `${a.edge} (${placeText(a.loc)})`).join(' → ') : placeText(t.args[0].loc);
}

// A relation form's names to edit: its own, or none yet, with its edges in the schema's order.
const namesOfForm = form => names[form] ?? { name: '', edges: specsOfForm(form)[0]?.args.map(a => a.edge) ?? [], lists: {} };

// The New definition menu's items, here and in the ribbon: an entry, or a relation, from the given sides
// if there are any.
function newDefinitionItems(sides = []) {
  const from = sides.length ? `, starting from ${sides.map(id => objectName(id)).join(' and ')}` : '';
  const item = (hash, title, desc) => `<button class="menu-item" role="menuitem" data-action="open" data-hash="${esc(hash)}">
    <span class="menu-text"><span class="menu-title">${title}</span><span class="menu-desc">${esc(desc)}</span></span></button>`;
  return item('definition:new:entry', 'Entry', 'A field, choice or tag, computed at every location like one')
    + item(['definition:new:relation', ...sides].join(':'), 'Relation', `Computed between objects${from}`);
}

// A definition's rule, in short: its formula, or its implications'.
const ruleText = d => d.implications ? d.implications.map(i => i.formula).join('   ') : d.formula;
const errorCount = defId => recordErrors(defId).length + (definitionError(defId) ? 1 : 0);

function schemaView({ filter = 'all' }) {
  const used = usage();
  const unused = new Set(unusedSpecs());
  const covered = coveredForms();
  // The subsets of the one list, as tabs (Parts.tabs), each with how many forms it holds.
  const keeps = { all: () => true, computed: f => covered.has(f), unused: f => indexOf().byForm.get(f).some(k => unused.has(k)) };
  const filters = `<div class="schema-filters">${Parts.tabs(SCHEMA_FILTERS.map(([id, label]) => ({ id, label, count: formsOfSchema().filter(keeps[id]).length })),
    { current: filter, cmd: 'schema.subset', label: 'Show' })}</div>`;
  const removeAll = filter === 'unused' && unused.size ? `<button class="btn" data-action="schema-remove" data-keys="${esc(JSON.stringify([...unused]))}" title="Remove every specification nothing has">Remove unused (${unused.size})</button>` : '';
  const open = ui.menu === 'schema-new';
  const add = !panelOptions.createInHead ? '' : `<span class="menu-anchor"><button class="btn" data-action="menu" data-menu="schema-new" aria-haspopup="menu" aria-expanded="${open}">${icon('plus')}New definition${icon('chevron-down')}</button>
    ${open ? `<div class="pop menu" role="menu">${newDefinitionItems()}</div>` : ''}</span>`;
  const head = panelHead({ crumbs: allLink(), title: 'Schema', sub: 'Every kind of entry and relation in this chart: what it means, where it’s used, and which a formula works out',
    actions: removeAll || add, extra: filters });
  const forms = formsOfSchema().filter(keeps[filter] ?? keeps.all);
  const byLabelOf = (a, b) => byLabel(describeForm(a).label, describeForm(b).label);
  const row = f => schemaFormRow(f, { used, unused, covered });
  const section = (title, list) => list.length ? `<div class="section-head">${title}</div>${list.sort(byLabelOf).map(row).join('')}` : '';
  // A definition covering nothing in the schema, as one whose locations were all removed may.
  const loose = filter === 'unused' ? [] : definitions.filter(d => !d.scope.some(p => specsWithParam(p).length)).map(d => asWritten(d));
  const looseRows = loose.length ? `<div class="section-head">Definitions <span class="section-note">covering nothing in the schema</span></div>
    ${loose.map(d => listRow(`definition:${d.id}`, d.name || 'Untitled', errorCount(d.id) ? count(errorCount(d.id), 'error') : 'Covers nothing')).join('')}` : '';
  const body = section('Kinds', forms.filter(f => f === 'object')) + section('Entries', forms.filter(f => formArity(f) === 1))
    + section('Relations', forms.filter(isRelationForm)) + looseRows;
  const empty = filter === 'computed' ? 'Nothing’s computed yet. A definition works out an entry or a relation by formula; start one above, or from Add › Definition… on a record.'
    : filter === 'unused' ? 'Nothing’s unused. Every specification here has records, or something located at it.'
    : 'The schema is empty. It grows as records are entered.';
  return [head, body || `<div class="empty">${empty}</div>`];
}

// A form's row: what it is, where, and its records or errors, then what it means; opened, everything
// keyed by it. Computed is its one badge, so the purple stands out; its sort is plain text.
function schemaFormRow(f, { used, unused, covered }) {
  const keys = indexOf().byForm.get(f);
  const users = k => (used.get(k) ?? []).length;
  const d = describeForm(f);
  const defs = f === 'object' ? [] : definitionsOfForm(f);
  const errors = defs.reduce((s, x) => s + errorCount(x.id), 0);
  const n = keys.reduce((s, k) => s + users(k), 0);
  const key = `schema|${f}`;
  const open = ui.expanded.has(key);
  const badges = (f === 'object' ? '' : `<span class="schema-sort">${esc(sortText(f))}</span>`) + (covered.has(f) ? Parts.badge('Computed', 'computed') : '');
  return `<div class="schema-form"><button class="schema-head" data-action="toggle" data-id="${esc(key)}" aria-expanded="${open}">${icon('chevron-right', 'schema-twist')}
      <span class="list-title">${esc(d.label)}</span>${badges}<span class="schema-desc">${esc(d.where)}</span>
      <span class="list-meta${errors ? ' is-error' : ''}">${errors ? count(errors, 'error') : count(n, 'record')}</span></button>
    ${f === 'object' ? '' : meaningHtml(f)}
    ${open ? `<div class="schema-body">${schemaFormBody(f, keys, defs, users, unused)}</div>` : ''}</div>`;
}

// What a form means, in words (descriptionOf), as its row in the Schema and its definition show it: once
// clicked, edited in place, saving as it's left (setDescription). Every Why leads with it.
function meaningHtml(f, cls = 'schema-meaning') {
  const text = descriptionOf(f);
  if (ui.describing === f) return `<textarea class="input ${cls}-input" data-describe="${esc(f)}" rows="2" placeholder="Say what this means…" aria-label="What ${esc(describeForm(f).label)} means" spellcheck="true" data-autofocus>${esc(text)}</textarea>`;
  return `<button class="${cls}${text ? '' : ' is-empty'}" data-action="describe" data-form="${esc(f)}" title="${text ? 'Change what it means' : 'Say in words what it means, for its Why to lead with'}">${esc(text || 'Say what this means…')}</button>`;
}

function schemaFormBody(f, keys, defs, users, unused) {
  const part = (title, html) => html ? `<div class="schema-part-title">${title}</div><div class="schema-part">${html}</div>` : '';
  const isRel = isRelationForm(f);
  // Where its records are, by parameterization, and whether an entry's are required.
  const params = [...new Set(keys.map(k => treeParam(schema[k])))];
  const where = params.map(p => {
    const n = keys.filter(k => treeParam(schema[k]) === p).reduce((s, k) => s + users(k), 0);
    const on = isRequired(p);
    const req = formArity(f) === 1 ? `<button class="link-btn" data-action="schema-required" data-param="${esc(p)}" aria-pressed="${on}"
      title="Flag it wherever it’s blank">${box(on ? true : null)}Required</button>` : '';
    return `<div class="schema-spec"><span class="schema-where">${esc(paramWhere(p))}</span><span class="list-meta">${count(n, 'record')}</span>${req}</div>`;
  }).join('');
  // Its outputs, and its specifications nothing has, to remove.
  const outputs = formOutputs(f).map(([, text]) => `<span class="schema-output">${esc(String(text))}</span>`).join('');
  const gone = keys.filter(k => unused.has(k)).map(k => `<div class="schema-spec is-unused">
      <span class="schema-where">${esc(treeOutput(schema[k])[1])} · ${esc(paramWhere(treeParam(schema[k])))}</span><span class="list-meta">Nothing has it</span>
      <button class="link-btn" data-action="schema-remove" data-keys="${esc(JSON.stringify([k]))}">Remove</button></div>`).join('');
  // A relation's name and roles, and its list names from each side. Each saves as it's left.
  let naming = '';
  if (isRel) {
    const r = namesOfForm(f);
    const lists = r.edges.flatMap(from => r.edges.filter(to => to !== from).map(to => `<label class="names-list"><span class="names-list-label">From ${esc(from)}, its ${esc(to)} list</span>
      <input class="input" data-names="list" data-form="${esc(f)}" data-from="${esc(from)}" data-to="${esc(to)}" value="${esc(listNameIn(r, from, to))}" placeholder="${esc(to)}" autocomplete="off" spellcheck="false"></label>`)).join('');
    naming = `<div class="names-head"><input class="input names-name" data-names="name" data-form="${esc(f)}" value="${esc(r.name)}" placeholder="${esc(formName(f))}" aria-label="Relation name" autocomplete="off" spellcheck="false">
        <span class="names-edges">Roles, as a formula calls it: ${esc(r.edges.join(', '))}</span>
        ${names[f] ? `<button class="icon-btn is-small" data-action="names-remove" data-form="${esc(f)}" aria-label="Forget its names" title="Forget its name and list names, so it goes by its edge labels">${icon('x')}</button>` : ''}</div>${lists}`;
  }
  // The definitions that compute it, and one to add where none covers it yet.
  const add = f !== 'object' && uncoveredParams(f).length ? `<div class="schema-spec"><span class="schema-where">${defs.length ? 'Entered at its other locations' : 'Entered, not computed'}</span>
      <a class="link-btn" href="${esc(panelHref(`definition:new:form:${encodeURIComponent(f)}`))}">${icon('plus')}Add definition</a></div>` : '';
  const definition = defs.map(x => `<div class="schema-spec"><code class="schema-rule">${esc(ruleText(x))}</code>
      <span class="list-meta${errorCount(x.id) ? ' is-error' : ''}">${errorCount(x.id) ? count(errorCount(x.id), 'error') : `${computedCount(x.id)} computed`}</span>
      <a class="link-btn" href="${esc(panelHref(`definition:${x.id}`))}">Edit definition</a></div>`).join('') + add;
  // On a page with a chart: whether the view in use shows it, and its style.
  let drawing = '';
  if (panelOptions.engaged) {
    const items = Object.values(showable()).flat().filter(x => f === 'object' ? x.kind : x.form === f);
    const shows = items.map(it => {
      const { shown, total } = shownCount(it);
      const label = f === 'object' ? it.label : 'Shown';
      return `<button class="link-btn" data-action="show-form" data-key="${esc(it.key)}" data-on="${shown === 0}" aria-pressed="${shown > 0}">${box(shown === 0 ? null : true)}${esc(label)}${shown && shown < total ? ` (${shown} of ${total})` : ''}</button>`;
    }).join('');
    const s = styleOfForm(f);
    const style = s ? `<button class="link-btn" data-action="style-engage" data-style="${s.id}" title="Format it in the ribbon">Style</button>`
      : `<button class="link-btn" data-action="style-form" data-form="${esc(f)}" title="Give it a style, and format it in the ribbon">${icon('plus')}Style</button>`;
    drawing = `<div class="schema-spec schema-drawing">${shows}${style}</div>`;
  }
  return part('Where', where) + part('Outputs', `<div class="schema-outputs">${outputs}</div>`) + (isRel ? part('Names', naming) : '')
    + part('Definition', definition) + part(`In ${esc(viewInUse()?.name ?? 'this view')}`, drawing) + part('Unused', gone);
}

// The hash is empty for All, "kind:<kind>" for a kind, "relate:<a>" or "relate:<a>:<b>" for relating
// two things (see relate.js), "deleted" for Deleted, "schema", "schema:computed" or "schema:unused" for the
// schema, "definition:<id>" for a definition (or "definition:new:entry[:<location>]",
// "definition:new:relation[:<a>:<b>]" or "definition:new:form:<form>" for a new one), or a record id. The older
// "formulas" and "formula:…" still lead to the same places.
function currentView() {
  const h = readHash().replace(/^formula:/, 'definition:');
  if (h === 'deleted') return { deleted: true };
  if (h === 'schema' || h === 'schema:computed' || h === 'schema:unused') return { schema: { filter: h.split(':')[1] ?? 'all' } };
  if (h === 'formulas') return { schema: { filter: 'computed' } };
  if (h.startsWith('definition:new:form:')) return { formula: { isNew: true, form: h.slice(20) } };
  if (h.startsWith('definition:new:')) {
    const [kind, ...sides] = h.slice(15).split(':');
    return { formula: { isNew: true, relation: kind === 'relation', sides: sides.filter(s => records[s]) } };
  }
  if (h.startsWith('definition:')) return { formula: { id: h.slice(11) } };
  if (h.startsWith('kind:')) return { kind: h.slice(5) };
  if (h.startsWith('relate:')) {
    const [a, b] = h.slice(7).split(':');
    if (records[a] && !isField(records[a])) return { relate: { a, b: records[b] && !isField(records[b]) && b !== a ? b : undefined } };
  }
  if (records[h]) return { id: h };
  return {};
}

// Draws the panel into #panel. The page's render() calls this, then draws its own parts. It draws the view
// the hash names, or another a page gives it (a record's page always shows the record it's about).
function renderPanel(view = currentView()) {
  listbox.input = null;
  startVisit(shownHash);
  const kind = view.kind && (Object.values(records).find(r => isObject(r) && same(r.kind, view.kind))?.kind ?? view.kind);
  const [head, body] = view.relate ? relateView(view.relate) : view.deleted ? deletedView() : view.schema ? schemaView(view.schema)
    : view.formula ? definitionView(view.formula)
    : view.id ? recordView(view.id) : kind ? kindView(kind) : allView();
  const pending = ui.pending ? `<div class="pending" role="alertdialog"><span class="pending-text">${esc(ui.pending.message)}</span>
    <button class="btn btn-primary" data-action="pending-yes">${esc(ui.pending.yes ?? 'Change it')}</button><button class="btn" data-action="pending-no">Cancel</button></div>` : '';
  document.getElementById('panel').innerHTML = `${head}<div class="rows${view.id ? ' is-tree' : ''}">${pending}${body}</div>`;
}

// Puts focus where the last change left it: a form's box, or a drag handle moved from the keyboard.
function restoreFocus() {
  const auto = document.querySelector('[data-autofocus]');
  if (auto) {
    auto.focus();
    auto.setSelectionRange(auto.value.length, auto.value.length);
  }
  if (ui.focusGrip) {
    document.querySelector(`[data-grip="${ui.focusGrip}"]`)?.focus();
    ui.focusGrip = null;
  }
}

// ---- Definitions ----
// Computed records (see formulas.md, and "Computed records" in model.js): how they're set apart in rows,
// why each one is there, overriding them, and the views for writing definitions.

const isFormulaText = text => /^\s*(=|←|<-)/.test(String(text ?? ''));

// How a record reads in a sentence: an entry's label, or a relation's name and its sides.
function recordTitle(id) {
  const r = records[id];
  if (!isRelation(r)) return r.edge;
  return `${relationNameOf(id)} (${r.args.map(a => placeName(a.at)).join(' → ')})`;
}

// What sort of thing an entry or relation is, by its output's sort: Tag, Choice, Percent field, Tag
// relation, ….
const sortName = (sort, isRel) => `${DATATYPE_NAMES[sort] ? `${DATATYPE_NAMES[sort]} field` : TYPE_NAMES[sort]}${isRel ? ' relation' : ''}`;
const isRelationDef = d => !!d.args || (d.covers ?? []).some(k => JSON.parse(k).length > 1);
const definitionType = d => sortName(d.type === 'field' ? d.datatype ?? 'number' : d.type, isRelationDef(d));
const computedCount = defId => Object.values(formulaResult.computed ?? {}).filter(c => c.def === defId).length;

// The mark after a record's output: "fx" on a computed one, which explains it when clicked, and the corner
// mark (Parts.overrideMark) on an entered one a formula also covers, which explains that.
function formulaMark(id) {
  const info = formulaInfo(id);
  const d = info && definitionOf(info.def);
  if (!d) return '';
  const open = ui.why === id;
  if (isComputed(id))
    return `<button class="fx-mark" data-action="why" data-id="${esc(id)}" aria-expanded="${open}" title="Worked out by ${esc(d.name)}. Click to see why.">fx</button>`;
  return Parts.overrideMark(id, `data-action="why" data-id="${esc(id)}" aria-expanded="${open}"`);
}

// Why a computed record is there, or what a formula says about an entered one, in words (Why.html): under
// its row, or in its panel's header (`inHead`). A check that doesn't hold offers to add what's missing to
// the lists it looked at (a document to its Documents); and it offers to keep a computed record as
// entered, or to clear an override, and to edit the definition.
function whyBlock(id, depth = 0, inHead = false) {
  const info = formulaInfo(id);
  const d = info && definitionOf(info.def);
  if (!d) return '';
  const strong = info.mark === 'differs' || info.mark === 'overrides';
  const add = Why.fails(id) ? Why.addable(id).map(({ at, type }) =>
    `<button class="link-btn" data-action="add-relation" data-id="${esc(at)}" data-key="${esc(type.key)}">Add to ${esc(type.list)}</button>`).join('') : '';
  const actions = add + (isComputed(id)
    ? `<button class="link-btn" data-action="keep-entered" data-id="${esc(id)}" title="Record this output by hand, so it stays whatever the formula says">Keep as entered</button>`
    : `<button class="link-btn" data-action="use-formula" data-id="${esc(id)}" title="Drop what’s entered here, so the formula’s output stands">${strong ? 'Use formula' : 'Clear'}</button>`)
    + `<a class="link-btn" href="${esc(panelHref(`definition:${d.id}`))}">Edit definition</a>`;
  return `<div class="why-at${inHead ? ' in-head' : ''}" style="--depth:${depth}">${Why.html(id, { href: panelHref, actions })}</div>`;
}

// ---- Writing formulas ----
// ui.fx holds the definition being edited, as a draft: { key, draft, isNew, atRecord, error }. `key` says
// where: 'inline:<record id>' in an edit form, 'def:<id>' or 'new:…' in the definition view. Typing changes
// the draft without redrawing, so the box keeps its focus; Save hands it to saveDefinition().

// A record's location as a definition writes it, a path from a kind (see pathText); null under a relation.
const pathOfRecord = id => { const t = treeOf(records, id); return t ? pathText(t) : null; };

// Every location the schema has, as a path from a kind, for the location pickers.
const schemaLocations = () => [...new Set(Object.values(schema).map(pathText).filter(Boolean))].sort(byLabel);

// What a definition covers, in words, read from the schema.
function coverageText(d) {
  if (d.args && d.args.every(a => a.at)) return d.args.map(a => `${a.edge || '?'} (${a.at.join(' or ') || '?'})`).join(' → ');
  if (d.at) return d.at.join('; ') || 'nowhere yet';
  return [...new Set((d.covers ?? []).map(param => paramWhere(param) || 'locations the schema no longer has'))].join('; ');
}

// A new definition: an entry at a location, or a relation between two sides, or from one, if they're given.
function newDefinition(relation, sides) {
  const id = newId();
  if (relation) return { id, name: '', type: 'tag',
    args: [sides[0], sides[1]].map(s => ({ edge: '', at: s && pathOfRecord(s) ? [pathOfRecord(s)] : [] })),
    implications: [{ label: '', formula: '← ' }] };
  const at = sides[0] && pathOfRecord(sides[0]);
  return { id, name: '', type: 'field', datatype: 'number', at: at ? [at] : [], formula: '= ' };
}

// The parameterizations of a form that no definition covers yet.
const uncoveredParams = form => [...new Set(specsOfForm(form).map(treeParam))].filter(p => !definitionCovering(p));

// A new definition covering a form's parameterizations that none covers yet, from the Schema view, as
// people write it.
function newDefinitionOfForm(form) {
  const tag = JSON.parse(form)[0] === 'tag';
  return asWritten({ id: newId(), scope: uncoveredParams(form), ...(tag ? { implications: [{ label: '', formula: '← ' }] } : { formula: '= ' }) });
}

// A formula for the records like `id`, which has none yet: covering exactly its parameterization.
function draftFor(id) {
  const r = records[id];
  const base = { id: newId(), name: isRelation(r) ? relationNameOf(id) : r.edge, type: typeOf(r), covers: [parameterization(records, id)] };
  if (isField(r)) base.datatype = r.field;
  return isTag(r) ? { ...base, implications: [{ label: '', formula: '← ' }] } : { ...base, formula: '= ' };
}

// The formula section of an entry's edit form, or of a relation's panel: the definition covering records
// like it, editable in place, or an offer to add one.
function formulaSection(id) {
  const key = `inline:${id}`;
  const d = definitionCovering(parameterization(records, id));
  if (ui.fx?.key !== key) {
    if (!d) return `<div class="fx-section is-quiet"><button class="link-btn" data-action="fx-add" data-id="${esc(id)}">${icon('plus')}Add a definition</button>
      <span class="fx-hint">to work out ${esc(isRelation(records[id]) ? recordTitle(id).replace(/ \(.*/, '') : records[id].edge)} at every location like this one</span></div>`;
    ui.fx = { key, draft: structuredClone(d), error: null };
  }
  const fx = ui.fx;
  const title = definitionOf(fx.draft.id) ? `Definition: <a href="${esc(panelHref(`definition:${fx.draft.id}`))}">${esc(fx.draft.name)}</a>` : 'New definition';
  return `<div class="fx-section"><div class="fx-section-head">${title}<span class="fx-hint">${esc(coverageText(fx.draft))}</span></div>
    ${formulaFields(fx)}${draftFoot(fx, true)}</div>`;
}

// The formula boxes for a draft: one = box, or for a tag written as implications, a row for each.
function formulaFields(fx) {
  const d = fx.draft;
  if (d.type === 'tag' && d.implications) {
    const rows = d.implications.map((imp, i) => `<div class="fx-imp" data-imp="${i}">
        <button class="fx-grip" aria-label="Drag to reorder" title="Drag to reorder">${icon('grip-vertical')}</button>
        <input class="input fx-label" data-fx="imp-label" data-i="${i}" value="${esc(imp.label)}" placeholder="Label, like (A)" autocomplete="off" spellcheck="false">
        ${formulaBox(`imp:${i}`, imp.formula, '← a condition')}
        <button class="icon-btn is-small" data-action="fx-imp-remove" data-i="${i}" aria-label="Remove this implication" title="Remove">${icon('x')}</button></div>`).join('');
    return `<div class="fx-imps">${rows}</div><div class="fx-row-actions"><button class="link-btn" data-action="fx-imp-add">${icon('plus')}Add an implication</button>
      <button class="link-btn" data-action="fx-tag-mode" title="Attested where it gives TRUE, ruled out where FALSE">Write as one = formula instead</button></div>`;
  }
  const mode = d.type === 'tag' ? `<div class="fx-row-actions"><button class="link-btn" data-action="fx-tag-mode" title="Attested wherever a condition holds; never ruled out">Write as implications (←) instead</button></div>` : '';
  return formulaBox('formula', d.formula, '= an expression') + mode;
}

function formulaBox(field, text, placeholder) {
  return `<div class="fx-field"><textarea class="input fx-input" rows="1" data-fx="${field}" placeholder="${esc(placeholder)}" spellcheck="false" autocomplete="off">${esc(text ?? '')}</textarea>
    <div class="pop listbox fx-suggest" data-fx-suggest hidden></div><div class="fx-note" data-fx-note>${fxNoteHtml(text)}</div></div>`;
}

// A formula's first problem, with where it is: the text up to it, and the character it's at, marked.
function fxNoteHtml(text) {
  const t = String(text ?? '');
  if (!clean(t) || /^\s*(=|←|<-)\s*$/.test(t)) return '';
  const c = Formulas.check(t);
  if (!c.kind) return '<span class="fx-problem">A formula starts with = (or ← for an implication).</span>';
  if (!c.error) return '';
  const p = c.error.pos;
  const from = Math.max(0, p - 24);
  return `<span class="fx-problem">${esc(c.error.message)}</span> <code class="fx-where">${from ? '…' : ''}${esc(t.slice(from, p))}<mark>${esc(t[p] ?? ' ')}</mark></code>`;
}

// Under a draft: Save, and Revert (or in an edit form, Cancel for a new formula, or a link to the whole
// definition for one that exists).
function draftFoot(fx, inline) {
  const error = fx.error ? `<span class="fx-error-text">${icon('alert-triangle')}${esc(fx.error)}</span>` : '';
  const other = !inline ? '<button class="link-btn" data-action="fx-revert">Revert</button>'
    : definitionOf(fx.draft.id) ? `<a class="link-btn" href="${esc(panelHref(`definition:${fx.draft.id}`))}">Open the whole definition</a>`
    : '<button class="link-btn" data-action="fx-close">Cancel</button>';
  return `<div class="fx-foot"><button class="btn btn-primary" data-action="fx-save">Save definition</button>${other}${error}
    <span class="fx-keys"><span><kbd>Enter</kbd> save</span></span></div>`;
}

// The draft as it would be saved: trimmed, with the arrow tidied, an unlabeled implication numbered, and
// locations not yet picked left out. Returns a message instead if something's missing.
function finishedDraft(fx) {
  const d = structuredClone(fx.draft);
  d.name = clean(d.name);
  if (!d.name) return 'Give it a name.';
  if (d.implications) d.implications = d.implications.map((imp, i) => ({ label: clean(imp.label) || `(${i + 1})`, formula: Formulas.tidyArrow(String(imp.formula).trim()) }));
  else d.formula = String(d.formula ?? '').trim();
  if (d.args) {
    d.args = d.args.map(a => ({ edge: clean(a.edge), at: a.at }));
    if (d.args.length < 2) return 'A relation needs at least two parameters.';
    if (d.args.some(a => !a.edge)) return 'Give each parameter an edge label, like Controller.';
    if (d.args.some(a => !a.at.length)) return 'Give each parameter at least one location.';
    if (new Set(d.args.map(a => norm(a.edge))).size < d.args.length) return 'Each parameter needs its own edge label.';
  } else if (d.at && !d.at.length && !fx.atRecord) return 'Give it at least one location.';
  if (fx.atRecord && d.at && !d.at.length) { delete d.at; d.covers = [paramAt(d.name, fx.atRecord)]; }
  for (const text of d.implications ? d.implications.map(i => i.formula) : [d.formula]) {
    const c = Formulas.check(text);
    if (!c.kind || c.error) return `Fix the formula first: ${c.error?.message ?? 'it should start with = or ←.'}`;
  }
  if (d.type !== 'field') delete d.datatype;
  return d;
}

// Saves the draft as written; the model stores it, its relation's name going to the names (see
// canonicalFormulas), and a new name reaching the formulas and filters that mention the old one.
function saveDraft() {
  const fx = ui.fx;
  const d = finishedDraft(fx);
  if (typeof d === 'string') { fx.error = d; return; }
  fx.error = saveDefinition(d);
  if (fx.error) return;
  fx.draft = structuredClone(d);
  ui.info = `Saved ${d.name}; the formulas are worked out again.`;
  if (fx.isNew) panelGo(`definition:${d.id}`);
}

// The Excel-like shortcut: a value typed starting with = (or a tag's ← condition) becomes the formula for
// every location like this one, in place of the value. The entered record goes, so the formula's output
// stands here, unless something is located at it.
function saveFormulaFromForm(f) {
  const text = Formulas.tidyArrow(clean(f.type === 'tag' ? f.formula : f.output));
  const c = Formulas.check(text);
  if (c.error) return `${c.error.message} (at character ${c.error.pos + 1})`;
  if (c.kind === 'implies' && f.type !== 'tag') return 'Only a tag can be implied. Start a value’s formula with =.';
  const typed = clean(f.name);
  if (!typed) return 'Give it a name.';
  const edge = schemaAt(f.at).find(p => same(p.label, typed))?.label ?? typed;
  const param = paramAt(edge, f.at);
  const old = definitionCovering(param);
  const n = (old?.implications?.length ?? 0) + 1;
  const formula = c.kind === 'implies'
    ? { implications: [...(old?.implications ?? []), { label: `(${n})`, formula: text }], formula: undefined }
    : { formula: text, implications: undefined };
  const def = JSON.parse(JSON.stringify(old ? { ...old, ...formula }
    : { id: newId(), name: edge, type: f.type, ...(f.type === 'field' && { datatype: guessDatatype(text, f.at) }), covers: [param], ...formula }));
  const next = { ...records };
  const keep = f.id && (entriesOf(f.id).length || relationsAt(f.id).length);
  if (f.id && !keep) delete next[f.id];
  const error = commitWithFormulas(next, old ? definitions.map(x => x.id === old.id ? def : x) : [...definitions, def]);
  if (!error) ui.info = `${edge} is worked out by formula at every location like this one${keep ? '; what’s entered here stays, with what’s located at it' : ''}.`;
  return error;
}

// The datatype a new field formula's values have, from what it gives here.
function guessDatatype(text, at) {
  const fixed = fieldDatatype(at, ui.form?.name ?? '');
  if (fixed) return fixed;
  let v = null;
  try { v = Formulas.evaluateAt(formulaResult, text, at); } catch {}
  if (Array.isArray(v) && v.length === 1) v = v[0];
  return typeof v === 'string' ? 'text' : v?.t === 'date' ? 'date' : 'number';
}

// ---- Names, as the Schema view edits them ----

// A relation or list given a new name takes it into the formulas and filters that mention the old one.
// A list that had no name went by an edge label, which formulas use for other things too, so naming it
// for the first time renames nothing; nor does naming a relation that went by its edge labels. `fn`
// returns the form's names changed, or null to forget them.
const changeName = (form, fn, from, to) => {
  const changed = fn(structuredClone(namesOfForm(form)));
  const { [form]: _, ...rest } = names;
  const next = changed ? { ...rest, [form]: changed } : rest;
  const renames = from && to ? [[from, to]] : [];
  ui.notice = changeFormulas(renamedInFormulas(definitions, from, to), next, renames);
};

// A list's own name, or '' where it goes by its edge label.
const listNameIn = (r, from, to) =>
  Object.entries(Object.entries(r.lists ?? {}).find(([k]) => same(k, from))?.[1] ?? {}).find(([k]) => same(k, to))?.[1] ?? '';

function onNamesChange(el) {
  const form = el.dataset.form;
  if (el.dataset.names === 'name') {
    if (!clean(el.value) || clean(el.value) === formName(form)) return;
    if (Object.keys(names).some(f => f !== form && same(formName(f), el.value))) { ui.notice = `Another relation is called ${clean(el.value)}. Give this one a name of its own.`; return; }
    changeName(form, r => ({ ...r, name: clean(el.value) }), names[form]?.name, clean(el.value));
  } else if (el.dataset.names === 'list') {
    const was = listNameIn(namesOfForm(form), el.dataset.from, el.dataset.to);
    if (clean(el.value) === was) return;
    const now = clean(el.value) || el.dataset.to;
    changeName(form, r => {
      const from = Object.keys(r.lists ?? {}).find(k => same(k, el.dataset.from)) ?? norm(el.dataset.from);
      const lists = { ...(r.lists ?? {}) };
      const own = { ...(lists[from] ?? {}) };
      const to = Object.keys(own).find(k => same(k, el.dataset.to)) ?? norm(el.dataset.to);
      if (clean(el.value)) own[to] = clean(el.value); else delete own[to];
      lists[from] = own;
      return { ...r, lists };
    }, was, was && now);
  }
}

// ---- A definition's view ----

const fxCrumbs = () => `${allLink()}${icon('chevron-right', 'crumb-sep')}<a href="${esc(panelHref('schema:computed'))}">Schema</a>`;

// A definition's own view: what it is and covers, its formula or implications, and what it works out.
// A new one comes blank, or from two sides or a location, or covering what a form's row in the Schema view
// has uncovered.
function definitionView({ id, isNew, relation, sides = [], form }) {
  const key = form ? `new:form:${form}` : isNew ? `new:${relation ? 'relation' : 'entry'}:${sides.join(':')}` : `def:${id}`;
  if (ui.fx?.key !== key) {
    const d = form ? (formsOfSchema().includes(form) && uncoveredParams(form).length ? newDefinitionOfForm(form) : null)
      : isNew ? newDefinition(relation, sides) : definitionOf(id);
    if (!d) return form
      ? [panelHead({ crumbs: fxCrumbs(), title: 'Definition', sub: 'Nothing left to cover' }), '<div class="empty">Every location of this form already has a definition. Edit that one from the Schema view.</div>']
      : [panelHead({ crumbs: fxCrumbs(), title: 'Definition', sub: 'Not found' }), '<div class="empty">There’s no definition here. It may have been deleted; Undo brings it back.</div>'];
    const atRecord = isNew && !relation && sides[0] && !pathOfRecord(sides[0]) ? sides[0] : null;
    ui.fx = { key, draft: structuredClone(d), isNew, atRecord, error: null };
  }
  const fx = ui.fx, d = fx.draft;
  const isRel = isRelationDef(d);
  const sub = isNew ? `New definition of ${isRel ? 'a relation' : 'an entry'}` : `${definitionType(d)} · works out ${count(computedCount(d.id), 'record')}`;
  const actions = isNew ? '' : `<button class="btn" data-action="fx-delete">${icon('trash')}Delete</button>`;
  const head = panelHead({ crumbs: fxCrumbs(), title: esc(d.name || 'New definition'), sub, actions });
  const field = (label, html, note = '') => `<div class="fx-label-cell">${label}</div><div class="fx-value-cell">${html}${note ? `<div class="fx-hint">${note}</div>` : ''}</div>`;
  const typeValue = d.type === 'field' ? `field:${d.datatype ?? 'number'}` : d.type;
  const types = [['tag', sortName('tag')], ['choice', sortName('choice')], ...Object.keys(DATATYPE_NAMES).map(k => [`field:${k}`, sortName(k)])];
  const typeSelect = `<select class="input fx-select" data-fx="type">${types.map(([v, t]) => `<option value="${v}"${v === typeValue ? ' selected' : ''}>${t}</option>`).join('')}</select>`;
  let where;
  if (d.args) {
    where = field('Parameters', d.args.map((a, i) => `<div class="fx-param">
        <input class="input fx-edge" data-fx="edge" data-i="${i}" value="${esc(a.edge)}" placeholder="Edge, like ${i ? 'Controlled' : 'Controller'}" autocomplete="off" spellcheck="false">
        ${locationPicker(a.at, i)}
        ${d.args.length > 2 ? `<button class="icon-btn is-small" data-action="fx-param-remove" data-i="${i}" aria-label="Remove this parameter" title="Remove">${icon('x')}</button>` : ''}</div>`).join('')
      + `<div class="fx-row-actions"><button class="link-btn" data-action="fx-param-add">${icon('plus')}Add a parameter</button>
        <label class="fx-check"><input type="checkbox" data-fx="self"${d.self ? ' checked' : ''}> May relate a thing to itself</label></div>`,
      'Each parameter is an edge label and the locations its records can be at. Bare names in the formula are these edges.');
  } else if (d.at) {
    where = field('Locations', locationPicker(d.at, null), fx.atRecord ? `Or, with none picked, every location like ${esc(Why.readText(fx.atRecord))}.` : 'Where it’s worked out. Bare names in the formula are the location’s own names, looked up its path.');
  } else {
    where = field('Covers', `<span class="fx-covers">${esc(coverageText(d))}</span>`, 'Every location like the record it was added from.');
  }
  const errors = [definitionError(d.id) && `<div class="fx-result-line is-error">${esc(definitionError(d.id))}</div>`,
    ...recordErrors(d.id).slice(0, 8).map(e => `<div class="fx-result-line is-error">${Parts.formulaError(e.error.code)}
      ${e.args.map(a => `<a href="${esc(panelHref(a.at))}">${esc(placeName(a.at))}</a>`).join(' → ')}: ${esc(e.error.msg)}</div>`)].filter(Boolean).join('');
  const results = Object.entries(formulaResult.computed ?? {}).filter(([, c]) => c.def === d.id).map(([k]) => k).filter(k => records[k]);
  const resultList = results.slice(0, 12).map(k => `<a class="fx-result" href="${esc(panelHref(k))}">${esc(resultText(k))}</a>`).join('')
    + (results.length > 12 ? `<span class="fx-hint">and ${results.length - 12} more</span>` : '');
  // What the form it covers means, once there's a form: saved as it's left, apart from the draft.
  const stored = !isNew && definitions.find(x => x.id === d.id);
  const covering = stored && formOfDefinition(stored);
  const body = `<div class="fx-editor">
      ${field('Name', `<input class="input" data-fx="name" value="${esc(d.name)}" placeholder="${isRel ? 'Relation name, like Control' : 'Entry name, like 3(c)(1) Count'}" autocomplete="off" spellcheck="false">`,
        isRel ? 'The relation’s name, for calling it in formulas.' : 'The entry’s label, as its rows show it.')}
      ${covering ? field('Meaning', meaningHtml(covering, 'fx-meaning'), 'What it means, in words a lawyer reads. Every Why leads with it.') : ''}
      ${field('Type', typeSelect)}
      ${where}
      ${field(d.type === 'tag' && d.implications ? 'Implied by' : 'Formula', formulaFields(fx))}
    </div>${draftFoot(fx, false)}
    ${isNew ? '' : `<div class="section-head">Results <span class="section-note">${count(results.length, 'record')}${errors ? ', with errors' : ''}</span></div>
      <div class="fx-results">${errors}${resultList || (errors ? '' : '<div class="fx-hint">Nothing yet.</div>')}</div>`}`;
  return [head, body];
}

// A computed record as the results list shows it: an entry's location, or a relation's sides, and its output.
function resultText(id) {
  const r = records[id];
  const out = isTag(r) ? (r.tag ? '' : ' (ruled out)') : `: ${isField(r) ? displayValue(r) : r.choice}`;
  return isRelation(r) ? `${r.args.map(a => placeName(a.at)).join(' → ')}${out}` : `${Why.readText(r.at)}${out}`;
}

function locationPicker(list, i) {
  const chips = list.map((loc, k) => `<span class="fx-chip">${esc(loc)}<button class="fx-chip-x" data-action="fx-loc-remove" data-i="${i ?? ''}" data-k="${k}" aria-label="Remove ${esc(loc)}">${icon('x')}</button></span>`).join('');
  const options = schemaLocations().filter(l => !list.some(x => same(x, l)));
  return `<div class="fx-chips">${chips}<select class="input fx-select fx-add-loc" data-fx="add-loc" data-i="${i ?? ''}"><option value="">Add a location…</option>${options.map(o => `<option>${esc(o)}</option>`).join('')}</select></div>`;
}

// Changing a draft's type keeps its formula where it can: a tag can be implications or one = formula.
function setDraftType(d, value) {
  const [type, datatype] = value.split(':');
  if (type === 'tag' && !d.implications) { d.implications = [{ label: '', formula: '← ' }]; delete d.formula; }
  if (type !== 'tag' && d.implications) { d.formula = '= '; delete d.implications; }
  d.type = type;
  if (datatype) d.datatype = datatype; else delete d.datatype;
}

// Typing in a draft's boxes. A formula's `<-` turns into ←, its note says what's wrong, and names are offered.
function onFxInput(el) {
  const fx = ui.fx;
  if (!fx) return;
  const d = fx.draft, f = el.dataset.fx, i = Number(el.dataset.i);
  fx.error = null;
  if (f === 'formula' || f.startsWith('imp:')) {
    const tidied = Formulas.tidyArrow(el.value);
    if (tidied !== el.value) {
      const pos = el.selectionStart - (el.value.length - tidied.length);
      el.value = tidied;
      el.setSelectionRange(pos, pos);
    }
    if (f === 'formula') d.formula = el.value; else d.implications[Number(f.slice(4))].formula = el.value;
    const note = el.closest('.fx-field').querySelector('[data-fx-note]');
    if (note) note.innerHTML = fxNoteHtml(el.value);
    openSuggest(el);
  } else if (f === 'name') d.name = el.value;
  else if (f === 'imp-label') d.implications[i].label = el.value;
  else if (f === 'edge') d.args[i].edge = el.value;
}

function onFxChange(el) {
  const fx = ui.fx;
  if (!fx) return false;
  const d = fx.draft, f = el.dataset.fx;
  if (f === 'type') setDraftType(d, el.value);
  else if (f === 'self') d.self = el.checked;
  else if (f === 'add-loc' && el.value) (el.dataset.i === '' ? d.at : d.args[Number(el.dataset.i)].at).push(el.value);
  else return false;
  return true;
}

// ---- Names offered while typing a formula ----

const suggestion = { el: null, items: [], active: 0 };

// Every name a dot can look up somewhere in the schema: entries' labels, and lists of relatives by their
// names.
function schemaNames() {
  const out = new Map();
  const add = (name, kind) => { if (!out.has(norm(name))) out.set(norm(name), { name, kind }); };
  for (const t of Object.values(schema)) {
    if (!t.args) continue;
    if (t.args.length === 1) { add(t.args[0].edge, 'entry'); continue; }
    const form = formOfTree(t);
    for (const own of t.args) for (const other of t.args) if (own !== other) add(listName(form, own.edge, other.edge), 'list');
  }
  return [...out.values()].sort((a, b) => byLabel(a.name, b.name));
}

// Where a draft's formula is worked out, for names offered on its own: a record at its first location.
function suggestAt(fx) {
  const d = fx?.draft;
  if (!d || d.args) return undefined;
  if (fx.atRecord) return fx.atRecord;
  const spec = d.at?.[0] ? Formulas.locationKey(d.at[0]) : null;
  if (spec) return Object.keys(records).find(k => specKey(records, k) === spec);
  const param = d.covers?.[0];
  const sample = param && Object.keys(records).find(k => !isObject(records[k]) && parameterization(records, k) === param);
  return sample ? records[sample].at : undefined;
}

function openSuggest(el) {
  const before = el.value.slice(0, el.selectionStart);
  const partial = /(\[[^\]]*|[A-Za-z_][A-Za-z0-9_]*)$/.exec(before)?.[1] ?? '';
  const afterDot = /\.\s*$/.test(before.slice(0, before.length - partial.length));
  if (!partial && !afterDot) return closeSuggest();
  const fx = ui.fx;
  const saved = fx?.draft && definitionOf(fx.draft.id) ? fx.draft.id : null;
  let items = [];
  try { items = Formulas.suggest(formulaResult, saved, before, suggestAt(fx)); } catch {}
  const typed = norm(partial.replace(/^\[/, ''));
  // A relation not saved yet: formulas.js doesn't know its arguments, which are its edges.
  if (!saved && fx?.draft?.args && !afterDot)
    items = [...fx.draft.args.filter(a => clean(a.edge) && norm(a.edge).startsWith(typed)).map(a => ({ name: clean(a.edge), kind: 'argument' })), ...items];
  // formulas.js offers what's after a dot at one sample record. Names other records have follow.
  if (afterDot) items = [...items, ...schemaNames().filter(s => norm(s.name).startsWith(typed))];
  const seen = new Set();
  items = items.filter(s => !seen.has(norm(s.name)) && seen.add(norm(s.name))).slice(0, 12);
  if (!items.length) return closeSuggest();
  Object.assign(suggestion, { el, items, active: 0, partial });
  drawSuggest();
}

function drawSuggest() {
  const box = suggestion.el?.closest('.fx-field')?.querySelector('[data-fx-suggest]');
  if (!box) return;
  box.innerHTML = suggestion.items.map((s, i) => `<div class="option" data-suggest="${i}" aria-selected="${i === suggestion.active}">
    <span class="option-label">${esc(s.name)}</span><span class="option-meta">${esc(s.kind)}</span></div>`).join('');
  box.hidden = false;
}

function closeSuggest() {
  const box = suggestion.el?.closest('.fx-field')?.querySelector('[data-fx-suggest]');
  if (box) box.hidden = true;
  suggestion.el = null;
}

// Puts a name in place of what's been typed of it: bracketed if it needs to be, and a function with its "(".
function acceptSuggest(i = suggestion.active) {
  const { el, items, partial } = suggestion;
  const s = items[i];
  if (!el || !s) return;
  const bare = /^[A-Za-z_][A-Za-z0-9_]*$/.test(s.name);
  const text = (bare ? s.name : `[${s.name}]`) + (s.kind === 'function' ? '(' : '');
  const start = el.selectionStart - partial.length;
  el.value = el.value.slice(0, start) + text + el.value.slice(el.selectionStart);
  el.setSelectionRange(start + text.length, start + text.length);
  closeSuggest();
  onFxInput(el);
  closeSuggest();
}

// ---- Events ----

const actions = {
  open: d => panelGo(d.hash),
  toggle: d => ui.expanded.has(d.id) ? ui.expanded.delete(d.id) : ui.expanded.add(d.id),
  reveal: () => { ui.showRoot = true; },
  menu: d => { ui.menu = ui.menu === d.menu ? null : d.menu; },
  add: d => d.type === 'object' ? startObjectForm(d.kind) : startForm('add', d.type, d.id),
  'add-relation': d => startRelationForm(d.id, d.key),
  'set-choice': d => setChoice(d.id, d.value),
  'rel-edit': d => { clearForms(); ui.relEdit = { id: d.id, label: d.label, text: displayValue(records[d.id]), error: null }; },
  'detail-add': d => { clearForms(); ui.relEdit = { at: d.id, label: d.label, datatype: d.datatype, text: '', error: null }; },
  'pending-yes': () => { const { apply } = ui.pending; ui.pending = null; apply(); },
  'pending-no': () => { ui.pending = null; },
  'full-paths': () => { ui.fullPaths = !ui.fullPaths; },
  'col-filter': d => {
    const picked = { ...ui.filters[d.key] };
    if (d.value) picked[d.col] = d.value; else delete picked[d.col];
    ui.filters = { ...ui.filters, [d.key]: picked };
  },
  'col-clear': d => { ui.filters = { ...ui.filters, [d.key]: {} }; },
  edit: d => startForm('edit', typeOf(records[d.id]), records[d.id].at, d.id),
  'edit-cell': d => startForm('edit', typeOf(records[d.id]), records[d.id].at, d.id, { focus: 'output', cell: true }),
  'toggle-not': () => { ui.form.not = !ui.form.not; ui.focus = ui.form.type === 'relation' ? 'other' : 'name'; },
  'tag-flip': d => flipTag(d.id),
  pref: d => { prefs[d.key] = d.value; savePrefs(); applyTheme(); },
  save: submitForm,
  delete: d => deleteEntry(d.id),
  'schema-remove': d => {
    ui.notice = removeSpecs(JSON.parse(d.keys));
    if (!ui.notice) ui.info = 'Removed from the schema. Undo puts it back.';
  },
  restore: d => {
    ui.notice = restoreBatch(d.id);
    if (!ui.notice) ui.info = 'Restored.';
  },
  'toggle-required': d => toggleRequired(d.id),
  'schema-required': d => setRequired(d.param, !isRequired(d.param)),
  unrequire: d => stopRequiring(d.param),
  // A blank required entry is filled in where it stands: a tag is attested at once, and a field or choice
  // goes straight to its value or option.
  'fill-required': d => {
    const req = requiredInfo(d.param);
    startForm('add', req.type, d.id, undefined, { focus: 'output', cell: true });
    Object.assign(ui.form, { name: req.label, required: d.param, step: 'output' });
    if (req.type === 'tag') submitForm();
  },
  'move-up': d => {
    const error = moveUp(d.id);
    if (error) ui.error = error; else clearForms();
  },
  cancel: clearForms,
  'rename-scope': d => { ui.form.scope = d.value; },
  'edge-edit': d => { clearForms(); ui.edgeEdit = { id: d.id, edge: d.edge, text: d.edge, scope: 'every', error: null }; },
  'edge-scope': d => { ui.edgeEdit.scope = d.value; },
  'edge-save': () => {
    ui.edgeEdit.error = saveEdge();
    if (!ui.edgeEdit.error) ui.edgeEdit = null;
  },
  undo,
  redo,
  reset: resetSample,
  // Formulas
  why: d => { ui.why = ui.why === d.id ? null : d.id; },
  'keep-entered': d => {
    ui.notice = keepAsEntered(d.id);
    if (!ui.notice) { ui.why = null; ui.info = 'Kept as entered. It stays whatever the formula says.'; }
  },
  'use-formula': d => {
    ui.notice = useFormula(d.id);
    if (!ui.notice) { ui.why = null; ui.info = 'The formula’s output stands here again.'; }
  },
  'fx-add': d => { ui.fx = { key: `inline:${d.id}`, draft: draftFor(d.id), error: null }; },
  'fx-save': saveDraft,
  'fx-close': () => { ui.fx = null; },
  'fx-revert': () => { ui.fx = null; },
  'fx-delete': () => {
    const d = ui.fx.draft;
    const n = computedCount(d.id);
    ui.pending = { message: `Delete ${d.name}${n ? `, and the ${count(n, 'record')} it works out` : ''}? Formulas that use it will show errors. Undo brings it back.`, yes: 'Delete',
      apply: () => { ui.notice = deleteDefinition(d.id); if (!ui.notice) { ui.info = `Deleted ${d.name}.`; panelGo('schema:computed'); } } };
  },
  'fx-imp-add': () => { ui.fx.draft.implications.push({ label: '', formula: '← ' }); },
  'fx-imp-remove': d => {
    const imps = ui.fx.draft.implications;
    imps.splice(Number(d.i), 1);
    if (!imps.length) imps.push({ label: '', formula: '← ' });
  },
  'fx-tag-mode': () => {
    const draft = ui.fx.draft;
    if (draft.implications) { delete draft.implications; draft.formula = '= '; }
    else { delete draft.formula; draft.implications = [{ label: '', formula: '← ' }]; }
  },
  'fx-param-add': () => { ui.fx.draft.args.push({ edge: '', at: [] }); },
  'fx-param-remove': d => { ui.fx.draft.args.splice(Number(d.i), 1); },
  'fx-loc-remove': d => { (d.i === '' ? ui.fx.draft.at : ui.fx.draft.args[Number(d.i)].at).splice(Number(d.k), 1); },
  'names-remove': d => changeName(d.form, () => null),
  describe: d => { ui.describing = d.form; },
};

// Writing what a form means: Enter (without Shift) or leaving the box saves it, Esc lets it be. Leaving it
// for one of the panel's actions leaves the drawing to that action, so its click lands where it was aimed.
function saveMeaning(el, next = null) {
  if (ui.describing !== el.dataset.describe) return;
  ui.describing = null;
  setDescription(el.dataset.describe, el.value);
  if (!next?.closest?.('[data-action]')) render();
}

// Keep focus in the box while an option is clicked.
document.addEventListener('mousedown', e => {
  if (e.target.closest('.option')) e.preventDefault();
});

document.addEventListener('click', e => {
  const offered = e.target.closest('[data-suggest]');
  if (offered) return acceptSuggest(Number(offered.dataset.suggest));
  const option = e.target.closest('.option');
  if (option) return pick(Number(option.dataset.index));
  const el = e.target.closest('[data-action]');
  if (!el) {
    if (ui.menu && !e.target.closest('.pop')) { ui.menu = null; render(); }
    return;
  }
  const action = el.dataset.action;
  if (action !== 'menu') ui.menu = null;
  ui.notice = ui.info = null;
  actions[action](el.dataset);
  render();
});

// Dragging starts only from an entry's handle, so the rest of the row stays clickable and selectable.
document.addEventListener('pointerdown', e => {
  const handle = e.target.closest('.grip');
  if (handle) handle.closest('.entry').draggable = true;
});
document.addEventListener('pointerup', () => {
  document.querySelectorAll('.entry[draggable="true"]').forEach(el => { el.draggable = false; });
});

function clearDropMark() {
  document.querySelectorAll('.drop-before, .drop-after').forEach(el => el.classList.remove('drop-before', 'drop-after'));
  if (ui.drag) ui.drag.target = null;
}

document.addEventListener('dragstart', e => {
  const entry = e.target.closest?.('.entry[draggable="true"]');
  if (!entry) return;
  ui.drag = { id: entry.dataset.entry, at: entry.dataset.at };
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', records[ui.drag.id].edge);
  setTimeout(() => entry.classList.add('is-dragging'));
});

// An entry can be dropped before or after a sibling (never before Name), marked by a line.
document.addEventListener('dragover', e => {
  const d = ui.drag;
  if (!d) return;
  let target = e.target.closest?.('.entry');
  while (target && target.dataset.at !== d.at) target = target.parentElement.closest('.entry');
  if (!target || target.dataset.entry === d.id) return clearDropMark();
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const rect = target.querySelector('.row').getBoundingClientRect();
  const after = 'pinned' in target.dataset || e.clientY > rect.top + rect.height / 2;
  if (d.target === target.dataset.entry && d.after === after) return;
  clearDropMark();
  Object.assign(d, { target: target.dataset.entry, after });
  target.classList.add(after ? 'drop-after' : 'drop-before');
});

document.addEventListener('drop', e => {
  const d = ui.drag;
  if (!d?.target) return;
  e.preventDefault();
  moveEntry(d.id, d.target, d.after);
});

document.addEventListener('dragend', () => {
  ui.drag = null;
  render();
});

// A draft's implications are dragged by their handles, too, to reorder them.
let impDrag = null;
document.addEventListener('pointerdown', e => {
  const handle = e.target.closest('.fx-grip');
  if (handle) handle.closest('.fx-imp').draggable = true;
});
document.addEventListener('dragstart', e => {
  const imp = e.target.closest?.('.fx-imp[draggable="true"]');
  if (!imp) return;
  impDrag = { from: Number(imp.dataset.imp), to: null };
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', 'implication');
});
document.addEventListener('dragover', e => {
  if (!impDrag) return;
  const target = e.target.closest?.('.fx-imp');
  if (!target) return;
  e.preventDefault();
  const after = e.clientY > target.getBoundingClientRect().top + target.offsetHeight / 2;
  document.querySelectorAll('.fx-imp').forEach(el => el.classList.remove('drop-before', 'drop-after'));
  target.classList.add(after ? 'drop-after' : 'drop-before');
  impDrag.to = Number(target.dataset.imp) + (after ? 1 : 0);
});
document.addEventListener('drop', e => {
  if (!impDrag || impDrag.to === null || !ui.fx?.draft.implications) return;
  e.preventDefault();
  const imps = ui.fx.draft.implications;
  const [moved] = imps.splice(impDrag.from, 1);
  imps.splice(impDrag.to > impDrag.from ? impDrag.to - 1 : impDrag.to, 0, moved);
});
document.addEventListener('dragend', () => {
  if (!impDrag) return;
  impDrag = null;
  render();
});

// A draft's type, flags and locations change as they're picked; names save as each box is left.
document.addEventListener('change', e => {
  const t = e.target;
  if (t.matches('[data-fx]') && onFxChange(t)) return render();
  if (t.matches('[data-names]')) {
    ui.notice = ui.info = null;
    onNamesChange(t);
    render();
  }
});

document.addEventListener('focusout', e => {
  if (e.target === suggestion.el) closeSuggest();
});

// In a formula box, the names offered take the arrow keys, Tab and Enter; otherwise Enter saves.
function onFxKey(e) {
  const open = suggestion.el === e.target;
  const n = suggestion.items.length;
  if (open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
    suggestion.active = (suggestion.active + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
    drawSuggest();
  } else if (open && (e.key === 'Tab' || e.key === 'Enter')) {
    acceptSuggest();
  } else if (open && e.key === 'Escape') {
    closeSuggest();
  } else if (e.key === 'Enter' && !e.shiftKey) {
    ui.notice = ui.info = null;
    saveDraft();
    render();
  } else {
    return false;
  }
  return true;
}

document.addEventListener('focusin', e => {
  if (e.target.matches('.combo-input') && !ui.error) openListbox(e.target);
});
document.addEventListener('focusout', e => {
  if (e.target === listbox.input) closeListbox();
});

document.addEventListener('input', e => {
  if (e.target.matches('[data-fx]')) return onFxInput(e.target);
  if (e.target.matches('[data-rel-edit]')) ui.relEdit.text = e.target.value;
  if (e.target.matches('[data-edge-edit]')) { ui.edgeEdit.text = e.target.value; ui.edgeEdit.error = null; }
  const role = e.target.dataset.input;
  if (!ui.form || !role) return;
  // A new tag's condition: typing <- at its start makes the arrow.
  if (role === 'formula' && Formulas.tidyArrow(e.target.value) !== e.target.value) {
    const pos = e.target.selectionStart - 1;
    e.target.value = Formulas.tidyArrow(e.target.value);
    e.target.setSelectionRange(pos, pos);
  }
  ui.form[role] = e.target.value;
  if (ui.form.typed) ui.form.typed[role] = true;
  if (ui.error) {
    ui.error = null;
    const note = document.querySelector('[data-note]');
    if (note) { note.className = 'note-text'; note.textContent = ''; }
  }
  if (e.target.matches('.combo-input')) openListbox(e.target);
  if (takesValue(ui.form)) refreshFieldHint();
});

const leadsOn = (f, role) => role === 'name' ? f.type === 'field' || f.type === 'choice' : role === 'other' && f.rel.type !== 'tag';

function onComboKey(e) {
  const t = e.target;
  const open = listbox.input === t;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    open ? moveActive(e.key === 'ArrowDown' ? 1 : -1) : openListbox(t);
  } else if (e.key === 'Enter') {
    if (!open) openListbox(t);
    if (listbox.active >= 0) return pick(listbox.active), true;
    // Nothing to pick: say why if what's typed only matches options that can't be used.
    const blocked = listbox.options.find(o => o.note && same(o.value, t.value))
      ?? (clean(t.value) && listbox.options.every(o => o.note) ? listbox.options[0] : null);
    if (blocked) { ui.error = `Can’t use ${blocked.value}: ${blocked.note.toLowerCase()}.`; render(); }
  } else if (e.key === 'Tab' && !e.shiftKey && open && clean(t.value) && listbox.active >= 0 && leadsOn(ui.form, t.dataset.input)) {
    // Tab moves on to the next box, like Enter, but only from a box that has a next box.
    pick(listbox.active);
  } else if (e.key === 'Escape' && open) {
    closeListbox();
  } else {
    return false;
  }
  return true;
}

document.addEventListener('focusout', e => {
  if (e.target.matches?.('[data-describe]')) saveMeaning(e.target, e.relatedTarget);
});

document.addEventListener('keydown', e => {
  const t = e.target;
  if (t.matches('[data-describe]')) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); return saveMeaning(t); }
    if (e.key === 'Escape') { e.preventDefault(); ui.describing = null; return render(); }
    return;
  }
  if (t.matches('.fx-input') && onFxKey(e)) return e.preventDefault();
  if (t.matches('.combo-input') && onComboKey(e)) return e.preventDefault();
  if (e.key === 'Enter' && t.matches('input[data-input]') && !t.matches('.combo-input')) {
    e.preventDefault();
    return submitForm();
  }
  if (e.key === 'Enter' && t.matches('[data-edge-edit]')) {
    e.preventDefault();
    ui.notice = ui.info = null;
    actions['edge-save']();
    return render();
  }
  if (e.key === 'Enter' && t.matches('[data-rel-edit]')) {
    e.preventDefault();
    const edit = ui.relEdit;
    edit.error = edit.id ? saveFieldValue(edit.id, t.value, edit.label) : addFieldValue(edit.at, edit.label, t.value, edit.datatype);
    if (!edit.error) ui.relEdit = null;
    return render();
  }
  if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && t.matches('.grip')) {
    e.preventDefault();
    nudgeEntry(t.dataset.grip, e.key === 'ArrowDown' ? 1 : -1);
    return render();
  }
  if (e.altKey && e.key === 'ArrowLeft' && t.matches('.grip')) {
    e.preventDefault();
    ui.notice = moveUp(t.dataset.grip);
    ui.focusGrip = t.dataset.grip;
    return render();
  }
  if (e.key === 'Escape' && (ui.form || ui.menu || ui.relEdit || ui.edgeEdit || ui.pending || ui.notice)) {
    clearForms();
    ui.notice = null;
    return render();
  }
  if (ui.menu?.startsWith('add:') && !t.matches('input') && !e.ctrlKey && !e.metaKey && !e.altKey) {
    const at = ui.menu.slice(4);
    const k = e.key.toLowerCase();
    const type = { f: 'field', t: 'tag', c: 'choice' }[k];
    if (type || k === 'r' || (k === 's' && panelOptions.engaged)) {
      e.preventDefault();
      if (type) startForm('add', type, at);
      else if (k === 'r') { ui.menu = null; panelGo(`relate:${at}`); }
      else ui.menu = `add-style:${at}`;
      return render();
    }
  }
  const key = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && (key === 'z' || key === 'y') && !t.matches('input, textarea, select, [contenteditable="true"]')) {
    e.preventDefault();
    if (key === 'y' || e.shiftKey) redo(); else undo();
    render();
  }
});

// The object a hash's view is about, if any: a record's object, or the first side being related. A
// relation, and what's located at it, belong to no one object.
function objectOfHash(hash) {
  const h = readHash(hash);
  const id = h.startsWith('relate:') ? h.slice(7).split(':')[0] : h;
  const obj = records[id] && objectOf(id);
  return obj && isObject(records[obj]) ? obj : null;
}

const listing = items => items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;

// Leaving an object's panels asks first if this visit left something required blank: blank now, and not
// when the visit began, as when an entry was cleared, or a position added without its Start Date. An
// object just added had everything blank before the visit, so leaving it unfilled asks too. A visit that
// only looked doesn't ask; the asterisks say what's blank. The hash has already changed by the time we hear
// of it, so it's put back while the question is open. Moving between an object's own records, to fill
// things in, doesn't count as leaving.
let shownHash = location.hash;
let leaving = null;
// The object being visited, and what required was blank in it when the visit began (missingUnder), as
// keys of where and what; nothing, if it was just added, by the newest change.
let visit = null;
const missingKeys = obj => new Set(missingUnder(obj).map(m => `${m.at}|${m.param}`));
function startVisit(hash) {
  const obj = objectOfHash(hash);
  if (!obj || visit?.obj === obj) return;
  const added = historyLog[0]?.changes?.some(c => c.id === obj && !c.before);
  visit = { obj, before: added ? new Set() : missingKeys(obj) };
}
// What this visit left blank in the object.
function madeBlank(obj) {
  const before = visit?.obj === obj ? visit.before : missingKeys(obj);
  return missingUnder(obj).filter(m => !before.has(`${m.at}|${m.param}`));
}

window.addEventListener('hashchange', () => {
  const from = shownHash, to = location.hash;
  const obj = objectOfHash(from);
  const missing = obj && leaving !== to && objectOfHash(to) !== obj ? madeBlank(obj) : [];
  if (missing.length) {
    history.replaceState(null, '', from || location.pathname);
    const labels = [...new Set(missing.map(m => m.label))];
    const question = {
      title: `${labels.length > 1 ? 'Required entries are' : `${labels[0]} is`} blank`,
      message: `${objectName(obj)} has nothing for ${listing(labels)}, which ${labels.length > 1 ? 'are' : 'is'} required. Leave anyway?`,
      yes: 'Leave anyway',
      apply: () => { leaving = to; location.hash = to; },
    };
    if (panelOptions.ask) return panelOptions.ask(question);
    ui.pending = question;
    return render();
  }
  leaving = null;
  shownHash = to;
  if (objectOfHash(to) !== visit?.obj) visit = null;
  startVisit(to);
  // Leaving a panel clears its forms and any table filters.
  clearForms();
  ui.filters = {};
  render();
});

// An undo or redo the shell makes (from a toast or the palette) closes the panel's forms, as the panel's own
// undo does, since what they were editing may have changed.
if (typeof Shell === 'object') Shell.onUndo(clearForms);

// The Schema view's tabs (Parts.tabs) go to its subsets.
if (typeof Shell === 'object') Shell.on('schema.subset', el => panelGo(el.dataset.tab === 'all' ? 'schema' : `schema:${el.dataset.tab}`));
