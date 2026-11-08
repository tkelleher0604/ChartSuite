// Turn one selected literal range into a record field. Planning is pure; the active canvas
// adapter owns the single data/schema/template transaction and its temporal policy.
const FieldExtraction = (() => {
const failed = error => ({ ok: false, error, trees: [], values: [], typed: [] });
const eligible = selection => !!(selection?.literal && Number.isInteger(selection.from) && Number.isInteger(selection.to) && selection.to > selection.from && String(selection.text ?? '').trim());
function replacement(source, from, to, name) {
  let at = 0, inserted = false, text = '';
  for (const part of TextTemplate.parts(source)) {
    const value = part.field === undefined ? part.text : TextTemplate.field(part.field), end = at + value.length;
    if (end <= from || at >= to) text += part.field === undefined ? TextTemplate.literal(value) : value;
    else {
      text += TextTemplate.literal(value.slice(0, Math.max(0, from - at)));
      if (!inserted) { text += TextTemplate.field(name); inserted = true; }
      text += TextTemplate.literal(value.slice(Math.max(0, to - at)));
    }
    at = end;
  }
  return text;
}
function replacedRuns(runs, from, to, length) {
  const by = length - (to - from);
  return (runs ?? []).flatMap(run => {
    if (run.to <= from) return [run];
    if (run.from >= to) return [{ ...run, from: run.from + by, to: run.to + by }];
    // A look covering the selected words covers the resulting field value too.
    if (run.from <= from && run.to >= to) return [{ ...run, to: run.to + by }];
    return [{ ...run, to: Math.min(run.to, from) }, { ...run, from: Math.max(run.from, to) + by, to: run.to + by }].filter(r => r.to > r.from);
  });
}
function plan(ctx, request) {
  const { selection, source, version, scope, sourcesByRecord = {}, runs = [] } = request;
  if (!eligible(selection)) return failed('Select ordinary text without a merge field first.');
  if (TextTemplate.formula(source)) return failed('A formula cannot be converted to a record field.');
  if (source !== selection.source || (version !== undefined && version !== selection.version)) return failed('The selected text has changed. Select it again.');
  const characters = TextTemplate.characters(source), { from, to } = selection;
  if (from < 0 || to > characters.length || characters.slice(from, to) !== selection.text) return failed('The selected text is no longer at this position. Select it again.');
  let at = 0;
  for (const part of TextTemplate.parts(source)) {
    const end = at + (part.field === undefined ? part.text.length : TextTemplate.field(part.field).length);
    if (part.field !== undefined && from < end && to > at) return failed('Select ordinary text without a merge field first.');
    at = end;
  }
  const name = Tree.clean(request.name);
  if (!name) return failed('Enter a field name.');
  if (/[{}|\n\r›]/.test(request.name)) return failed('Use a field name without braces, a vertical bar, or a path separator.');
  const recordIds = [...new Set(request.recordIds ?? [])];
  if (!recordIds.length) return failed('Choose the objects this field should belong to.');
  const kinds = new Set();
  for (const recordId of recordIds) {
    const record = ctx.state[recordId];
    if (!record?.kind || Tree.isView(record)) return failed('The field must belong to an existing object.');
    kinds.add(record.kind);
    const part = sourcesByRecord[recordId];
    if (!part || part.text !== source || JSON.stringify(part.runs ?? []) !== JSON.stringify(runs)) return failed('Some objects have different text or formatting in this layer. Choose only the current object, or edit a matching group.');
    const existing = (Tree.index(ctx.state).entries.get(recordId) ?? []).filter(id => Tree.same(ctx.state[id].edge, name));
    if (existing.length > 1) return failed(`${name} has more than one value on an object. Resolve that in the record panel first.`);
    const row = existing.length && ctx.state[existing[0]];
    if (row && (row.field !== 'text' || (row.value !== '' && row.value !== selection.text))) return failed(`${name} already has a different value or data type. Choose another field name.`);
  }
  const declarations = DesignSchema.declarations(ctx.schema, [...kinds], [{ label: name, paths: [name], datatype: 'text', outputs: [{ field: 'text' }] }]);
  if (declarations.error) return failed(declarations.error);
  const schema = Tree.schema([...Object.values(ctx.schema), ...declarations.trees]);
  const values = BoundText.planValue({ ...ctx, schema }, { recordIds, token: name, text: selection.text });
  if (!values.ok) return failed(values.error);
  const text = replacement(source, from, to, name), nextRuns = replacedRuns(runs, from, to, TextTemplate.field(name).length);
  return { ...values, name, recordIds, scope, selection: { ...selection }, source, value: selection.text, text, runs: nextRuns, trees: declarations.trees };
}

let carried = null;
function drag(event, selection, adapter) {
  if (!adapter || !eligible(selection)) return;
  carried = { adapter, selection: { ...selection } };
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData('application/x-dendra-literal', 'selected-text');
    event.dataTransfer.setData('text/plain', selection.text);
  }
  event.currentTarget?.addEventListener('dragend', () => { carried = null; }, { once: true });
}
async function start(adapter, selected = CanvasWords.selection.peek()) {
  if (!adapter || !eligible(selected)) return Shell.toast('Select ordinary text in the canvas first.');
  const selection = { ...selected };
  if (CanvasWords.flush() === false) return;
  let name = '', own = false;
  const prepare = () => {
    try { return adapter.prepareExtraction(selection, { own }); }
    catch (error) { return { error: error.message ?? 'The text is no longer available.' }; }
  };
  const initial = prepare();
  if (initial.error) return Shell.toast(initial.error);
  const broad = !initial.scope?.own, recordName = initial.recordName ?? 'This object';
  const current = () => { const prepared = prepare(); return prepared.error ? failed(prepared.error) : plan(prepared.ctx, { ...prepared, name, selection }); };
  const html = htm.bind(preact.h);
  function Prompt() {
    const [, redraw] = preactHooks.useState(0), input = preactHooks.useRef(null), result = current(), prepared = prepare();
    preactHooks.useLayoutEffect(() => input.current?.setCustomValidity(result.error ?? ''), [result.error]);
    const refresh = () => redraw(n => n + 1);
    return html`<div class="settings design-field-create">
      <p class="design-help">The selected text becomes a field value. The paragraph will show that field.</p>
      <blockquote style="margin:10px 0;padding:8px 10px;border-left:2px solid var(--accent);white-space:pre-wrap">${selection.text}</blockquote>
      ${broad ? html`<label class="field"><span>Apply to</span><select aria-label="Extraction scope" value=${own ? 'own' : 'current'} onChange=${e => { own = e.target.value === 'own'; refresh(); }}><option value="current">${initial.scope.summary ?? `${initial.recordIds.length} matching objects`}</option><option value="own">${recordName} only</option></select></label>` : null}
      <p class="design-help">${prepared.recordIds?.length === 1 ? `${recordName} will receive this value.` : `${prepared.recordIds?.length ?? 0} objects will receive this value.`}</p>
      <label class="field"><span>Field name</span><input ref=${input} aria-label="Field name" required autofocus autocomplete="off" placeholder="e.g. Role" value=${name} onInput=${e => { name = e.target.value; refresh(); }} /></label>
      ${result.error && name ? html`<p class="err" role="alert">${result.error}</p>` : null}
    </div>`;
  }
  const accepted = await Shell.dialog({ title: 'Turn text into a field', width: 390, body: () => html`<${Prompt} />`, actions: [{ label: 'Cancel', value: false }, { label: 'Create field', value: true, primary: true }] });
  if (!accepted) return;
  const result = current();
  if (!result.ok) return Shell.toast(result.error);
  const saved = adapter.applyExtraction(result);
  if (saved === false || saved?.ok === false || saved?.error) return Shell.toast(saved?.error ?? 'The field could not be created.');
  return saved;
}
function Dropzone({ recordId, adapter }) {
  const selection = CanvasWords.selection.value, [over, setOver] = preactHooks.useState(false), html = htm.bind(preact.h);
  if (!adapter || adapter.recordId !== recordId) return null;
  const ready = eligible(selection), ours = () => carried?.adapter === adapter && eligible(carried.selection);
  if (!ready && !ours()) return null;
  return html`<div class=${'field-extraction' + (over ? ' over' : '')} role="region" aria-label="Turn selected text into a record field"
    style=${`margin:10px 16px;padding:10px;border:1px ${over ? 'solid var(--accent)' : 'dashed var(--edge)'};border-radius:5px;background:${over ? 'var(--selected)' : 'var(--surface)'}`}
    onDragOver=${e => { if (ours()) { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; setOver(true); } }} onDragLeave=${() => setOver(false)}
    onDrop=${e => { if (!ours()) return; e.preventDefault(); e.stopPropagation(); const held = carried; carried = null; setOver(false); start(adapter, held.selection); }}>
    <button type="button" class="btn ghost" disabled=${!ready} onClick=${() => start(adapter, selection)}>Make selected text a field</button>
    <p class="design-help" style="margin-bottom:0">Select ordinary text on the canvas, then drag it here or use this button.</p>
  </div>`;
}
return { plan, drag, start, Dropzone };
})();
