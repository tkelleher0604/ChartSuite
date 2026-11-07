// Application boundary acceptance. Historical fixture rows are intentionally old; the value
// planner and App adapter are real. The separate canvas text flow exercises actual authoring.
const checks = [], $ = s => document.querySelector(s), wait = ms => new Promise(r => setTimeout(r, ms));
const check = (name, ok, detail = '') => { checks.push({ name, ok: !!ok, detail }); if (!ok) throw Error(name + ': ' + detail); };
const field = (kind, edge, datatype = 'text') => ({ out: { field: datatype }, args: [{ edge, loc: { kind } }] });
const ctx = () => ({ state: App.state.peek(), schema: App.schema.peek(), notes: App.notes.peek(), computed: App.computed.peek(), day: App.day.peek() });
const plan = (recordIds, token, text) => BoundText.planValue(ctx(), { recordIds, token, text });
async function run() {
  await wait(350); App.setViewing(false); App.begin({ template: 'blank', name: 'Scoped value history' }); await wait(180);
  const chart = App.chart.peek(), wb = App.wb, tx = wb.edit({ chart, who: 'Earlier author', when: '2020-01-01T00:00:00.000Z' });
  for (const kind of ['Fixed member', 'Member']) {
    for (const tree of [{ kind }, field(kind, 'Name'), field(kind, 'Role'), field(kind, 'Notes'), field(kind, 'Rate', 'percent')]) tx.add('spec', { tree });
  }
  for (const [id, kind, name, role] of [['a', 'Fixed member', 'Alice', 'Engineer'], ['b', 'Member', 'Bob', 'Designer']]) {
    tx.add('record', { kind }, id);
    tx.add('record', { at: id, edge: 'Name', field: 'text', value: name }, id + '-name');
    tx.add('record', { at: id, edge: 'Role', field: 'text', value: role, since: '2020-01-01' }, id + '-role');
  }
  tx.note('Fixed', Tree.bare(field('Fixed member', 'Role')), true);
  tx.note('Dated', { kind: 'View' }, true);
  const setup = tx.commit(); if (typeof setup === 'string') throw Error(setup); await wait(220);
  check('The fixture has a fixed field and an older changing field', App.fixedAt('a-role') && !App.asksFrom('a-role', { field: 'text', value: 'Lead' }) && App.asksFrom('b-role', { field: 'text', value: 'Lead' }));
  const before = wb.changes().length, first = App.putBatch(plan(['a', 'b'], 'Role', 'Lead').values);
  check('A mixed broad edit asks one date without committing any record', first.ok && first.status === 'pending' && wb.changes().length === before && wb.asOf(chart, App.day.peek())['a-role'].value === 'Engineer');
  App.amendPending(App.pending.peek(), { day: '2025-01-01' });
  const pendingId = App.pending.peek().n;
  const amended = App.putBatch(plan(['a'], 'Notes', 'Exact\n  paragraph').values);
  check('A second span joins the same pending proposal and keeps its chosen date', amended.status === 'pending' && App.pending.peek().n === pendingId && App.pending.peek().day === '2025-01-01' && App.pending.peek().boundValues.length === 3);
  App.putBatch(plan(['a'], 'Role', 'Engineer').values);
  check('Restoring a span’s stored value removes its earlier pending write', App.pending.peek().boundValues.length === 2 && !App.pending.peek().boundValues.some(t => t.id === 'a-role'));
  App.putBatch(plan(['a'], 'Role', 'Lead').values);
  const pattern = { kind: 'Member' };
  App.putBatch([], { appenders: [{ key: 'extracted-schema', run: edit => edit.add('spec', { tree: field('Member', 'Extracted') }) }], appendKey: 'paragraph', append: edit => edit.note('Text', pattern, 'Old template', { view: Shell.view.peek() }) });
  App.putBatch([], { appendKey: 'paragraph', append: edit => edit.note('Text', pattern, 'Final template', { view: Shell.view.peek() }) });
  check('Repeated literal drafts replace only their own hook and retain separate schema work', App.pending.peek().boundAppenders.length === 2 && wb.changes().length === before);
  const committed = App.commit(); await wait(220);
  check('The pending proposal commits values and template in one change', !!committed && wb.changes().length === before + 1 && App.notes.peek().value('Text', pattern, Shell.view.peek()) === 'Final template');
  check('Separate schema and paragraph hooks commit atomically in that same change', Object.values(App.schema.peek()).some(t => t.args?.[0]?.edge === 'Extracted'));
  check('Fixed facts are corrected without splitting while changing facts keep their past', wb.item(chart, 'a-role').length === 1 && wb.asOf(chart, '2024-01-01')['a-role'].value === 'Lead' && wb.item(chart, 'b-role').length === 2 && wb.asOf(chart, '2024-01-01')['b-role'].value === 'Designer' && wb.asOf(chart, '2025-01-01')['b-role'].value === 'Lead');
  check('A newly filled paragraph starts on the chosen date and preserves whitespace', !Object.values(wb.asOf(chart, '2024-01-01')).some(r => r.at === 'a' && r.edge === 'Notes') && Object.values(wb.asOf(chart, '2025-01-01')).find(r => r.at === 'a' && r.edge === 'Notes')?.value === 'Exact\n  paragraph');
  const undo = $('[aria-label="Undo"]'); check('The committed scoped proposal exposes normal Undo', !!undo && !undo.disabled); undo.click(); await wait(220);
  check('One user Undo restores every value, the empty field and the template', wb.asOf(chart, App.day.peek())['a-role'].value === 'Engineer' && wb.asOf(chart, App.day.peek())['b-role'].value === 'Designer' && !Object.values(wb.asOf(chart, App.day.peek())).some(r => r.at === 'a' && r.edge === 'Notes') && !App.notes.peek().value('Text', pattern, Shell.view.peek()));
  check('The same Undo also removes the separate schema declaration', !Object.values(App.schema.peek()).some(t => t.args?.[0]?.edge === 'Extracted'));
  const changedCount = wb.changes().length;
  const invalid = plan(['a', 'b'], 'Rate', 'unknown');
  check('An invalid broad value has no commands or partial mutation', !invalid.ok && !invalid.values.length && wb.changes().length === changedCount);
  const rejected = App.putBatch([{ id: 'missing', slot: { at: 'a', edge: 'Role' }, out: { field: 'text', value: 'Wrong' } }]);
  check('A stale target is an error and does not begin a proposal', !rejected.ok && rejected.status === 'error' && !App.pending.peek() && wb.changes().length === changedCount);
  const failed = App.putBatch(plan(['a'], 'Notes', 'Temporary').values, { append: () => { throw Error('Append failed'); } });
  check('An append failure leaves the record writes uncommitted', failed.status === 'error' && !Object.values(wb.asOf(chart, App.day.peek())).some(r => r.at === 'a' && r.edge === 'Notes') && wb.changes().length === changedCount);
  const single = App.putBatch(plan(['a'], 'Role', 'Corrected').values);
  check('A fixed fact commits immediately through the same adapter', single.status === 'committed' && !App.pending.peek() && wb.item(chart, 'a-role').length === 1);
  check('An unchanged desired value adds no Undo step', App.putBatch(plan(['a'], 'Role', 'Corrected').values).status === 'unchanged');
  const filled = App.putBatch(plan(['a'], 'Notes', 'Temporary').values);
  const clear = App.putBatch(plan(['a'], 'Notes', '').values);
  check('An empty bound span clears its entry and retains an editable schema slot', filled.ok && clear.status === 'committed' && BoundText.resolve(ctx(), 'a', 'Notes').editable && BoundText.resolve(ctx(), 'a', 'Notes').target.id === null);
  App.putBatch(plan(['b'], 'Role', 'Manager').values);
  const canceled = App.putBatch(plan(['b'], 'Role', 'Designer').values);
  check('Reverting the final pending span cancels the proposal without a write', canceled.status === 'unchanged' && !App.pending.peek() && wb.asOf(chart, App.day.peek())['b-role'].value === 'Designer');
  App.putBatch(plan(['b'], 'Role', 'Manager').values, {
    appendKey: 'paragraph', append: edit => edit.note('Text', pattern, 'Kept paragraph', { view: Shell.view.peek() }),
    appenders: [{ key: 'schema', run: edit => edit.add('spec', { tree: field('Member', 'Kept field') }) }],
  });
  App.amendPending(App.pending.peek(), { day: '2025-03-01' });
  const keptId = App.pending.peek().n, keptCount = wb.changes().length;
  const reverted = App.put('b-role', App.state.peek()['b-role'], false);
  check('A direct table-style revert of the sole value preserves the paragraph and schema proposal', reverted.status === 'pending' && App.pending.peek().n === keptId && !App.pending.peek().boundValues.length && App.pending.peek().boundAppenders.length === 2 && wb.changes().length === keptCount);
  const retouched = App.put('b-role', App.state.peek()['b-role'], { field: 'text', value: 'Coordinator' });
  check('A direct legacy editor write amends that proposal with its date and actions intact', retouched.status === 'pending' && App.pending.peek().n === keptId && App.pending.peek().day === '2025-03-01' && App.pending.peek().boundValues[0].out.value === 'Coordinator' && App.pending.peek().boundAppenders.length === 2);
  App.commit(); await wait(220);
  check('The amended value, schema and paragraph still commit together', wb.changes().length === keptCount + 1 && wb.asOf(chart, '2025-03-01')['b-role'].value === 'Coordinator' && wb.asOf(chart, '2025-02-28')['b-role'].value === 'Designer' && App.notes.peek().value('Text', pattern, Shell.view.peek()) === 'Kept paragraph' && Object.values(App.schema.peek()).some(t => t.args?.[0]?.edge === 'Kept field'));
  $('[aria-label="Undo"]').click(); await wait(220);
  check('One Undo restores the complete proposal amended from another editor', wb.asOf(chart, App.day.peek())['b-role'].value === 'Designer' && !App.notes.peek().value('Text', pattern, Shell.view.peek()) && !Object.values(App.schema.peek()).some(t => t.args?.[0]?.edge === 'Kept field'));
  App.stage({ verb: 'Change', source: 'other-action', what: 'another action', asks: 'from', day: '2025-01-01', make: () => {} });
  const other = App.pending.peek();
  check('A different pending action is preserved with an explicit error', App.putBatch(plan(['a'], 'Notes', 'Not now').values).status === 'error' && App.pending.peek() === other);
  App.discard({ quiet: true }); App.setViewing(true);
  check('Viewing cannot silently write record values', App.putBatch(plan(['a'], 'Notes', 'Read only').values).status === 'error' && !Object.values(wb.asOf(chart, App.day.peek())).some(r => r.at === 'a' && r.edge === 'Notes'));
}
addEventListener('error', e => checks.push({ name: 'No uncaught browser errors', ok: false, detail: e.error?.stack ?? e.message }));
addEventListener('unhandledrejection', e => checks.push({ name: 'No unhandled promises', ok: false, detail: e.reason?.stack ?? String(e.reason) }));
Shell.ready.then(run).catch(e => checks.push({ name: 'Batch application fixture finishes', ok: false, detail: e.stack ?? String(e) })).finally(() => {
  const failed = checks.filter(x => !x.ok).length;
  document.title = `put-batch test: ${checks.length - failed} pass, ${failed} fail`;
  $('#out').textContent = [`${checks.length - failed} passed, ${failed} failed`, ...checks.map(x => `${x.ok ? 'pass' : 'FAIL'} ${x.name}${x.detail ? ': ' + x.detail : ''}`)].join('\n');
});
