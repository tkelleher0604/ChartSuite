// Data-bound text editing, independent of the DOM, selection controls and transactions.
// Selection identifies a span; explicit scope identifies records; intent chooses data or template.
// Existing {Field} source and rich-text offsets remain the storage adapter, not the editing model.
const BoundText = (() => {
const same = Tree.same, unique = xs => [...new Set(xs)];
const failure = (text, label, code, error) => ({ text, label, editable: false, code, error });
const read = (ctx, id, token) => Scene.reader(ctx.state, ctx.notes, ctx.computed, ctx.day)(id, token).text;
const fields = (ctx, id) => Scene.readable(ctx.state, ctx.notes, ctx.schema, id).filter(f => !f.of);
const type = out => out && ('field' in out ? out.field : 'choice' in out ? 'choice' : 'tag' in out ? 'tag' : null);

function ownPath(ctx, id, token) {
  const offered = fields(ctx, id), path = token.split(/\s*›\s*/).map(Tree.clean);
  let found = offered.filter(f => same(f.label, token) || same(f.paths?.join(' › ') ?? '', token));
  if (!found.length && path.length === 1) {
    found = offered.filter(f => same(f.paths?.at(-1) ?? f.label, token));
    // Preserve an explicit root field's familiar short name. Two equally near nested leaves
    // require qualification; the old reader's first-found display is not a write target.
    const nearest = Math.min(...found.map(f => f.paths?.length ?? 1));
    found = found.filter(f => (f.paths?.length ?? 1) === nearest);
  }
  const paths = [...new Map(found.map(f => [JSON.stringify(f.paths ?? [f.label]), f.paths ?? [f.label]])).values()];
  return paths.length === 1 ? { path: paths[0] } : paths.length > 1 ? { error: 'This field name is ambiguous. Choose its full path.', code: 'ambiguous-field' } : null;
}

function atPath(ctx, recordId, path) {
  const { state, schema, notes } = ctx, entries = Tree.index(state).entries;
  let at = recordId;
  for (const edge of path.slice(0, -1)) {
    const ids = (entries.get(at) ?? []).filter(id => same(state[id].edge, edge));
    if (ids.length !== 1) return { error: ids.length ? 'This field path has more than one location.' : 'Choose the missing classification before editing this field.', code: ids.length ? 'ambiguous-location' : 'missing-location' };
    at = ids[0];
  }
  const edge = path.at(-1), ids = (entries.get(at) ?? []).filter(id => same(state[id].edge, edge));
  if (ids.length > 1) return { error: 'This field has more than one value at this location.', code: 'ambiguous-value' };
  const id = ids[0] ?? null, row = id && state[id], loc = Tree.treeOf(state, at);
  const specs = Object.values(schema).filter(s => s.out && s.args?.length === 1 && same(s.args[0].edge, edge) && Tree.narrower(loc, s.args[0].loc));
  const types = unique([...(row ? [type(row)] : []), ...specs.map(s => type(s.out))].filter(Boolean));
  if (types.length !== 1) return { error: types.length ? 'This field has incompatible declarations.' : 'This field has no applicable declaration.', code: 'invalid-schema' };
  const datatype = types[0], pattern = { args: [{ edge, loc }] };
  if (row?.computed || state[at]?.computed || (id && ctx.computed?.computed?.[id]) || notes.resolve('Formula', pattern))
    return { error: 'This value is calculated. Edit its inputs or use the record panel to override it.', code: 'computed-value' };
  return { target: { id, slot: { at, edge: row?.edge ?? specs[0]?.args[0].edge ?? edge }, recordId, path, datatype,
    options: unique(specs.flatMap(s => 'choice' in s.out ? [s.out.choice] : [])) } };
}

function resolve(ctx, recordId, rawToken) {
  const token = String(rawToken ?? ''), [label, transform] = token.split('|').map(Tree.clean), text = read(ctx, recordId, token);
  if (!ctx.state[recordId]) return failure(text, label, 'missing-record', 'The associated record no longer exists.');
  if (transform) return failure(text, label, 'transformed-value', 'This field shows a transformed value. Edit the original value in the record panel.');
  const directSide = ctx.state[recordId].args?.find(a => same(a.edge, label));
  let owner = recordId, found = directSide ? null : ownPath(ctx, owner, label);
  if (!found) {
    const relative = /^(.+?)(?:['’]s\s+|\.)(.+)$/.exec(label), side = ctx.state[recordId].args?.find(a => same(a.edge, relative?.[1] ?? label));
    const relation = relative?.[1] ?? label;
    const lists = Scene.listsAt(ctx.state, ctx.notes, recordId).filter(l => same(l.name, relation) || same(l.edge, relation) || same(Scene.oneOf(l.name), relation));
    const owners = unique(side ? [Tree.objectOf(ctx.state, side.at) ?? side.at] : lists.flatMap(l => l.items.map(i => i.obj)));
    if (owners.length !== 1) return failure(text, label, owners.length ? 'multiple-related-records' : 'unresolved-field', owners.length ? 'This field combines several related records. Choose one record in the panel to edit it.' : 'This field has no unambiguous record to edit.');
    owner = owners[0];
    // Bare list tokens render short names, while a relation's named side and explicit
    // possessive Name render full names. Target the field actually visible in the span.
    const field = relative?.[2] ?? (!side && Tree.entryAt(ctx.state, owner, 'Short Name') ? 'Short Name' : 'Name');
    found = ownPath(ctx, owner, field);
  }
  if (!found) return failure(text, label, 'unresolved-field', 'This field has no applicable path on the related record.');
  if (found.error) return failure(text, label, found.code, found.error);
  const result = atPath(ctx, owner, found.path);
  return result.error ? failure(text, label, result.code, result.error) : { text, label, editable: true, target: result.target };
}

// Both range systems are explicit: source uses decoded template characters, display uses
// resolved values. A field repeated twice has two spans but one deduplicated data target.
function project(ctx, recordId, source, runs = []) {
  const spans = [], cache = new Map(); let from = 0, shown = 0;
  const bound = token => { if (!cache.has(token)) cache.set(token, resolve(ctx, recordId, token)); return cache.get(token); };
  for (const p of TextTemplate.parts(source)) {
    const binding = p.field !== undefined ? bound(p.field) : null, original = binding ? TextTemplate.field(p.field) : p.text, text = binding ? binding.text : p.text;
    spans.push({ kind: binding ? 'field' : 'literal', text, source: { from, to: from + original.length }, display: { from: shown, to: shown + text.length }, ...(binding && { token: p.field, binding }) });
    from += original.length; shown += text.length;
  }
  const rendered = TextTemplate.renderRuns(source, token => bound(token).text, runs);
  return { source, text: spans.map(s => s.text).join(''), spans, runs: rendered.runs };
}
const selection = (projection, from, to = from) => projection.spans.filter(s => from === to
  ? s.display.from <= from && (from < s.display.to || s.display.from === s.display.to)
  : s.display.from < to && s.display.to > from);

function output(target, raw) {
  const text = String(raw ?? ''), clean = Tree.clean(text), { datatype } = target;
  if (!clean) return { out: null };
  if (datatype === 'choice') {
    const value = target.options.find(o => same(o, clean));
    return value === undefined ? { error: 'Choose one of this field’s existing options.' } : { out: { choice: value } };
  }
  if (datatype === 'tag') {
    if (same(clean, target.slot.edge)) return { out: { tag: true } };
    if (same(clean, `Not ${target.slot.edge}`)) return { out: { tag: false } };
    return /^(yes|true|no|false)$/i.test(clean) ? { out: { tag: /^(yes|true)$/i.test(clean) } } : { error: 'Enter Yes or No.' };
  }
  // Text values preserve the user's characters and paragraphs. Parsing of numeric/date
  // values is shared with the record panel, including percentages and partial dates.
  const value = datatype === 'text' ? text : Tree.parse(datatype, text);
  return value === undefined ? { error: Tree.notA(datatype) } : { out: { field: datatype, value } };
}

function plan(ctx, { recordIds, token }, valueFor) {
  const typed = [], values = [], targets = [], seen = new Set(), fail = error => ({ ok: false, error, typed: [], values: [], targets: [] });
  if (!recordIds?.length) return fail('Choose the records this edit should change.');
  for (const recordId of unique(recordIds)) {
    const binding = resolve(ctx, recordId, token);
    if (!binding.editable) return fail(binding.error);
    const target = binding.target, key = target.id ?? JSON.stringify([target.slot.at, Tree.norm(target.slot.edge)]);
    if (seen.has(key)) continue;
    seen.add(key); targets.push(target);
    const result = valueFor(target);
    if (result.error) return fail(result.error);
    if (!result.out && target.id && Tree.dependents(ctx.state, [target.id]).size > 1) return fail('This value has dependent data. Clear it from the record panel to review what would be removed.');
    const before = target.id && ctx.state[target.id], out = result.out;
    values.push({ id: target.id, slot: target.slot, out });
    if (!out ? !before : before && Object.keys(out).every(k => before[k] === out[k])) continue;
    typed.push({ id: target.id, slot: target.slot, out });
  }
  return { ok: true, typed, values, targets };
}
const planValue = (ctx, request) => plan(ctx, request, target => output(target, request.text));
// Panel values are already typed. Formatting then reparsing them would round numbers and
// lose document addresses; validate the canonical output against every target instead.
function planOutput(ctx, request) {
  return plan(ctx, request, target => {
    const out = request.out;
    if (!out) return { out: null };
    if (type(out) !== target.datatype) return { error: 'This field has a different type on another record in the scope.' };
    if (target.datatype === 'choice') return output(target, out.choice);
    if (target.datatype === 'tag') return typeof out.tag === 'boolean' ? { out: { tag: out.tag } } : { error: 'Enter Yes or No.' };
    const datatype = target.datatype, value = out.value;
    if (datatype === 'text') return typeof value === 'string' ? output(target, value) : { error: 'Enter text for this field.' };
    if (['number', 'percent', 'money'].includes(datatype)) return typeof value === 'number' && Number.isFinite(value) ? { out: { field: datatype, value } } : { error: Tree.notA(datatype) };
    return typeof value === 'string' && Tree.parse(datatype, value) !== undefined ? { out: { field: datatype, value } } : { error: Tree.notA(datatype) };
  });
}

// The host supplies App.putting so date replacement, Name rewording and blank removal use
// the same rules as the panel. The caller commits this callback once, never one target at a time.
function apply(tx, plan, { put }) {
  if (!plan.ok) throw new Error(plan.error);
  for (const item of plan.typed) put(tx, item.id, item.slot, item.out);
}
return { resolve, project, selection, planValue, planOutput, apply };
})();
