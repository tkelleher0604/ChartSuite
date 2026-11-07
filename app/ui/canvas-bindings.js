// The canvas's adapter for live record text. Selection and scope are captured separately;
// the paragraph editor neither discovers records nor writes the workbook itself.
const CanvasBindings = (() => {
const focus = preactSignals.signal(null), draft = preactSignals.signal(null), active = preactSignals.signal(null);
const context = () => ({ state: App.state.peek(), notes: App.notes.peek(), schema: App.schema.peek(), computed: App.computed.peek(), day: App.day.peek() });
const keyOf = target => target?.id ?? (target?.slot ? `${target.slot.at}|${Tree.norm(target.slot.edge)}` : null);
function recordScope(recordId) {
  const mark = App.scene.peek()?.marks.find(m => m.type === 'box' && m.record === recordId);
  if (!mark || Designs.editing.peek()) return null;
  const chosen = Designs.scope(mark, FormatBar.scope(true), 'Edit values');
  return chosen.recordIds.includes(recordId) ? chosen : null;
}
function panelPlan(id, slot, out) {
  if (out?.args || typeof Canvas === 'undefined') return null;
  const ctx = context(), row = ctx.state[id] ?? slot, recordId = row?.at && Tree.objectOf(ctx.state, row.at);
  const pending = App.pending.peek(), bound = pending?.source === 'bound-text' && pending.chart === App.chart.peek();
  const scope = recordId && (recordScope(recordId) ?? (bound ? { own: true, recordIds: [recordId] } : null));
  if (!scope || (scope.own && scope.recordIds.length <= 1 && !bound) || (out === false && !bound)) return null;
  const candidates = Scene.readable(ctx.state, ctx.notes, ctx.schema, recordId).filter(f => !f.of).filter(f => {
    const target = BoundText.resolve(ctx, recordId, f.label).target;
    return target && (id ? target.id === id : target.slot.at === row.at && Tree.same(target.slot.edge, row.edge));
  });
  const token = candidates[0]?.label;
  let plan = token ? BoundText.planOutput(ctx, { recordIds: scope.recordIds, token, out: out === false ? null : out }) : { ok: false, error: 'This field cannot be edited for that scope. Choose this object to edit it.' };
  if (token && out === false) {
    // Reverting a broad draft restores each target's own stored value, not the anchor's
    // value copied over everyone else, and leaves other fields in the proposal intact.
    const plans = scope.recordIds.map(recordId => {
      const target = BoundText.resolve(ctx, recordId, token).target, row = target?.id && ctx.state[target.id];
      const out = !row ? null : row.field ? { field: row.field, value: row.value } : 'choice' in row ? { choice: row.choice } : { tag: row.tag };
      return BoundText.planOutput(ctx, { recordIds: [recordId], token, out });
    });
    plan = plans.find(p => !p.ok) ?? { ok: true, values: plans.flatMap(p => p.values), typed: plans.flatMap(p => p.typed) };
  }
  return { ctx, scope, token, plan };
}
function putPanel(id, slot, out, options) {
  const prepared = panelPlan(id, slot, out);
  if (!prepared) return null;
  const { scope, token, plan } = prepared;
  const result = plan.ok ? App.putBatch(plan.values, { auto: options?.auto ?? false, say: `Changed ${token} for ${scope.recordIds.length} objects` }) : plan;
  if (!result.ok) Shell.toast(result.error);
  return { handled: true, result };
}
function previewPanel(id, slot, out) {
  const prepared = panelPlan(id, slot, out);
  if (!prepared) return null;
  const { plan } = prepared;
  return { handled: true, change: plan.ok ? App.would(tx => BoundText.apply(tx, plan, { put: (edit, id, slot, out) => App.putting(App.fixedAt(id, slot) ? edit.at(null) : edit, id, slot, out) }), { dated: plan.typed.some(t => App.asksFrom(t.id, t.out)) ? App.day.peek() : true }) : null };
}
const pendingBatch = () => {
  const p = App.pending.peek();
  return p?.source === 'bound-text' && p.chart === App.chart.peek() ? p : null;
};
let proposed = null;
// A pending paragraph belongs to the proposal, not the editor which first typed it.
// Replay its actions into an uncommitted transaction so reopening any affected object
// uses exactly the same note layering and schema as the eventual commit.
function editingContext() {
  const ctx = context(), pending = pendingBatch(), book = App.shown.peek();
  if (!pending?.boundAppenders?.length) { proposed = null; return ctx; }
  if (proposed?.pending !== pending || proposed.book !== book || proposed.notes !== ctx.notes || proposed.schema !== ctx.schema) {
    const tx = book.edit({ chart: App.chart.peek() });
    for (const addition of pending.boundAppenders) addition.run(tx);
    const changed = tx.noted(() => true), removed = new Set(changed.removed.map(r => r.id));
    const notes = Notes.index([...book.rows(App.chart.peek()).filter(r => 'note' in r && !removed.has(r.id)), ...changed.added]);
    const trees = tx.added().filter(r => 'spec' in r).map(r => r.tree);
    proposed = { pending, book, notes: ctx.notes, schema: ctx.schema, result: { notes, schema: trees.length ? Tree.schema([...Object.values(ctx.schema), ...trees]) : ctx.schema } };
  }
  return { ...ctx, ...proposed.result };
}
const textKey = (view, part, pattern) => JSON.stringify(['canvas-text', view, part, Tree.key(pattern)]);
function textAppenders(mark, partId, value, scope) {
  return scope.outputs.map(pattern => ({
    key: textKey(scope.view, partId, pattern),
    canvasText: { view: scope.view, partId, pattern, value },
    run: tx => Designs.say(tx, mark, partId, value, { ...scope, outputs: [pattern] }),
  }));
}
function schemaAppender(trees) {
  return { key: JSON.stringify(['canvas-schema', ...trees.map(Tree.key).sort()]), schemaTrees: trees, run: tx => {
    const added = new Set(tx.added().filter(r => 'spec' in r).map(r => Tree.key(r.tree)));
    for (const tree of trees) if (!added.has(Tree.key(tree))) { tx.add('spec', { tree }); added.add(Tree.key(tree)); }
  } };
}
function part(mark, partId, requestedScope) {
  const chart = App.chart.peek(), view = App.scene.peek().view;
  const scope = { ...Designs.scope(mark, requestedScope, 'Edit text'), view };
  // Accepted dialog definitions stay inert until insertion saves a paragraph containing
  // their token. Cancel, failed validation, or a blocked insertion cannot leave schema behind.
  const newFields = new Map();
  const kindsOf = ctx => [...new Set(scope.recordIds.map(id => ctx.state[id]?.kind).filter(Boolean))];
  const current = () => App.scene.peek()?.byId.get(mark.id);
  const valid = () => App.chart.peek() === chart && App.scene.peek()?.view === view && !!current();
  const sourceFor = (recordId, ctx = editingContext()) => {
    const design = pendingBatch()?.boundAppenders?.length
      ? Scene.recordDesign(App.scene.peek().state ?? ctx.state, ctx.notes, recordId, view)
      : App.scene.peek().marks.find(m => m.type === 'box' && m.record === recordId)?.design ?? Scene.recordDesign(App.scene.peek().state ?? ctx.state, ctx.notes, recordId, view);
    return design?.value.parts?.find(p => p.id === partId);
  };
  const source = () => sourceFor(mark.record);
  const read = token => {
    const binding = BoundText.resolve(editingContext(), mark.record, token), target = binding.target;
    const pending = App.pending.peek(), held = (pending?.typed ?? pending?.boundValues)?.find(t => target && (target.id ? t.id === target.id : !t.id && t.slot?.at === target.slot.at && Tree.same(t.slot.edge, target.slot.edge)));
    return held ? { ...binding, text: held.out ? Tree.outputText(held.out) : '' } : binding;
  };
  const clearField = () => { focus.value = null; draft.value = null; Canvas.fieldLit.value = null; };
  const leave = () => { clearField(); if (active.peek() === adapter) active.value = null; };
  const bindings = {
    read,
    focus(token) {
      if (!token) return clearField();
      const binding = read(token), target = binding.target;
      focus.value = { token, binding, target, key: keyOf(target), scope, owner: target && App.notes.peek().nameOf(App.state.peek(), target.recordId) };
      Canvas.fieldLit.value = keyOf(target);
    },
    draft(token, value) { draft.value = value ? { ...value, token, key: keyOf(value.target ?? read(token).target) } : null; },
    putValue(token, text) {
      if (!valid()) return { error: 'This chart is no longer open.' };
      const plan = BoundText.planValue(editingContext(), { recordIds: scope.recordIds, token, text });
      if (!plan.ok) return { error: plan.error };
      const result = App.putBatch(plan.values ?? plan.typed, { auto: false, say: `Changed ${TextTemplate.label(token)} for ${scope.recordIds.length} ${scope.recordIds.length === 1 ? 'object' : 'objects'}` });
      return result.ok ? true : { error: result.error ?? 'The value could not be saved.' };
    },
  };
  const adapter = { recordId: mark.record, partId, scope, bindings, source, valid, leave, activate: () => { active.value = adapter; },
    createField(suggested) {
      if (!valid()) return null;
      const ctx = editingContext(), kinds = kindsOf(ctx);
      if (!kinds.length) { Shell.toast('Choose an object before creating a field.'); return null; }
      return Designs.createField(suggested, { ...ctx, record: mark.record, kinds, newFields, valid, summary: scope.summary });
    },
    prepareExtraction(selection, { own = false } = {}) {
      if (!valid()) return { error: 'This chart is no longer open.' };
      const chosen = own ? { ...Designs.scope(mark, { own: true, records: [mark.record], view }, 'Make a field'), view } : scope;
      const ctx = editingContext(), sourcesByRecord = {};
      if (pendingBatch()?.boundAppenders?.some(a => a.schemaTrees)) return { error: 'Finish the pending field creation before extracting another value.' };
      for (const recordId of chosen.recordIds) {
        const part = sourceFor(recordId, ctx);
        if (part) sourcesByRecord[recordId] = { text: part.text ?? '', runs: part.runs ?? [] };
      }
      return { ctx, recordId: mark.record, recordName: App.notes.peek().nameOf(App.state.peek(), mark.record), recordIds: chosen.recordIds, scope: chosen, source: source()?.text ?? '', runs: source()?.runs ?? [], sourcesByRecord };
    },
    applyExtraction(plan) {
      if (!valid()) return { ok: false, error: 'This chart is no longer open.' };
      const only = plan.scope?.own && plan.recordIds?.length === 1 && plan.recordIds[0] === mark.record;
      const prepared = adapter.prepareExtraction(plan.selection, { own: only });
      if (prepared.error) return { ok: false, error: prepared.error };
      const latest = FieldExtraction.plan(prepared.ctx, { ...prepared, name: plan.name, selection: plan.selection });
      if (!latest.ok) return latest;
      const targetMark = current(), value = { text: latest.text, runs: latest.runs ?? [] };
      return App.putBatch(latest.values, { say: `Made ${latest.name} a record field`,
        appenders: [...textAppenders(targetMark, partId, value, latest.scope), schemaAppender(latest.trees)],
      });
    },
    put(text, runs) {
      if (!valid()) return { error: 'This chart is no longer open.' };
      const used = new Set(TextTemplate.fields(text).map(token => Tree.norm(token.split('|')[0])));
      const fields = [...newFields.values()].filter(field => used.has(Tree.norm(field.label))), ctx = editingContext();
      const declarations = DesignSchema.declarations(ctx.schema, fields.length ? kindsOf(ctx) : [], fields);
      if (declarations.error) return { error: declarations.error };
      const was = source();
      if (!declarations.trees.length && was?.text === text && JSON.stringify(was.runs ?? []) === JSON.stringify(runs ?? [])) return;
      const targetMark = current(), value = { text, runs: runs ?? [] }, result = App.putBatch([], {
        appenders: [...textAppenders(targetMark, partId, value, scope), ...(declarations.trees.length ? [schemaAppender(declarations.trees)] : [])], say: scope.summary,
      });
      if (!result.ok) return { error: result.error };
      for (const field of fields) newFields.delete(Tree.norm(field.label));
      return true;
    },
  };
  return adapter;
}
return { part, focus, draft, active, keyOf, recordScope, putPanel, previewPanel };
})();
