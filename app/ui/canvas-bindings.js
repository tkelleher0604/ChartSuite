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
function part(mark, partId, requestedScope) {
  const chart = App.chart.peek(), view = App.scene.peek().view;
  const scope = { ...Designs.scope(mark, requestedScope, 'Edit text'), view };
  const appendKey = `${view}|${mark.record}|${partId}`; let presentation = null;
  const extractionTrees = new Map();
  const editingContext = () => {
    const ctx = context(), pending = App.pending.peek(), keys = new Set(pending?.source === 'bound-text' ? (pending.boundAppenders ?? []).map(a => a.key) : []);
    for (const key of extractionTrees.keys()) if (!keys.has(key)) extractionTrees.delete(key);
    const trees = [...extractionTrees.values()].flat();
    return trees.length ? { ...ctx, schema: Tree.schema([...Object.values(ctx.schema), ...trees]) } : ctx;
  };
  const current = () => App.scene.peek()?.byId.get(mark.id);
  const valid = () => App.chart.peek() === chart && App.scene.peek()?.view === view && !!current();
  const source = () => {
    const part = current()?.design?.value.parts?.find(p => p.id === partId);
    if (App.pending.peek()?.source !== 'bound-text') presentation = null;
    return presentation && part ? { ...part, ...presentation } : part;
  };
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
    prepareExtraction(selection, { own = false } = {}) {
      if (!valid()) return { error: 'This chart is no longer open.' };
      const chosen = own ? { ...Designs.scope(mark, { own: true, records: [mark.record], view }, 'Make a field'), view } : scope;
      const ctx = editingContext(), sourcesByRecord = {};
      if (extractionTrees.size) return { error: 'Finish the pending field creation before extracting another value.' };
      for (const recordId of chosen.recordIds) {
        const shown = App.scene.peek().marks.find(m => m.type === 'box' && m.record === recordId);
        const part = recordId === mark.record ? source() : (shown?.design ?? Scene.recordDesign(App.scene.peek().state ?? ctx.state, ctx.notes, recordId, view))?.value.parts?.find(p => p.id === partId);
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
      const targetMark = current(), value = { text: latest.text, runs: latest.runs ?? [] }, schemaKey = `${appendKey}|schema:${Tree.norm(latest.name)}`;
      const result = App.putBatch(latest.values, { appendKey, say: `Made ${latest.name} a record field`,
        append: tx => Designs.say(tx, targetMark, partId, value, latest.scope),
        appenders: [{ key: schemaKey, run: tx => {
          const added = new Set(tx.added().filter(r => 'spec' in r).map(r => Tree.key(r.tree)));
          for (const tree of latest.trees) if (!added.has(Tree.key(tree))) { tx.add('spec', { tree }); added.add(Tree.key(tree)); }
        } }],
      });
      if (result.ok) {
        presentation = result.status === 'pending' ? value : null;
        if (result.status === 'pending') extractionTrees.set(schemaKey, latest.trees);
      }
      return result;
    },
    put(text, runs) {
      if (!valid()) return { error: 'This chart is no longer open.' };
      const was = source();
      if (was?.text === text && JSON.stringify(was.runs ?? []) === JSON.stringify(runs ?? [])) return;
      const targetMark = current(), value = { text, runs: runs ?? [] }, result = App.putBatch([], { append: tx => Designs.say(tx, targetMark, partId, value, scope), appendKey, say: scope.summary });
      if (!result.ok) return { error: result.error };
      presentation = result.status === 'pending' ? value : null;
      return true;
    },
  };
  return adapter;
}
return { part, focus, draft, active, keyOf, recordScope, putPanel, previewPanel };
})();
