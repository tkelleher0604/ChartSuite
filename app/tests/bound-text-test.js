// Real schema/relationship/history contracts. These tests exercise the planner independently
// of the DOM and verify that no rejected plan can leak a partial record mutation.
const results = [], check = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail });
const chart = 'bound-text', day = '2026-11-07', root = { kind: 'Object' };
const entry = (loc, edge, out) => ({ out, args: [{ edge, loc }] });
const field = (loc, edge, datatype = 'text') => entry(loc, edge, { field: datatype });
const category = value => entry(root, 'Category', { choice: value });
function fixture() {
  const wb = Log.open(), person = category('Person'), company = category('Company');
  const job = { out: { tag: true }, args: [{ edge: 'Employee', loc: person }, { edge: 'Employer', loc: company }] };
  const tx = wb.edit({ chart, who: 'Bound text test' });
  tx.add('chart', { name: 'Bound text' }, chart);
  for (const tree of [root, field(root, 'Name'), field(root, 'Role'), field(root, 'Notes'), field(root, 'Rate', 'percent'),
    field(root, 'Started', 'date'), entry(root, 'Enabled', { tag: true }), person, company,
    field(person, 'License'), field(company, 'Budget', 'money'), job]) tx.add('spec', { tree });
  for (const [id, name, choice] of [['a', 'Alice', 'Person'], ['b', 'Bob', 'Person'], ['c', 'Cedar Labs', 'Company'], ['d', 'Dune Labs', 'Company']]) {
    tx.add('record', { kind: 'Object' }, id);
    tx.add('record', { at: id, edge: 'Name', field: 'text', value: name }, `${id}-name`);
    tx.add('record', { at: id, edge: 'Category', choice }, `${id}-category`);
  }
  tx.add('record', { at: 'a', edge: 'Role', field: 'text', value: 'Engineer', since: '2020-01-01' }, 'a-role');
  tx.add('record', { at: 'b', edge: 'Role', field: 'text', value: 'Designer', since: '2020-01-01' }, 'b-role');
  tx.add('record', { at: 'a-category', edge: 'License', field: 'text', value: 'A-1' }, 'license');
  for (const id of ['a', 'b']) tx.add('record', { args: [{ edge: 'Employee', at: `${id}-category` }, { edge: 'Employer', at: 'c-category' }], tag: true }, `${id}-job`);
  tx.note('Name', Tree.bare(job), 'Employment');
  tx.note('Name', Tree.bare(job), 'Employers', { param: 'Employer' });
  tx.note('Name', Tree.bare(job), 'Employees', { param: 'Employee' });
  const c = tx.commit(); if (typeof c === 'string') throw Error(c);
  return wb;
}
const context = wb => ({ state: wb.asOf(chart, day), schema: wb.schema(chart), notes: wb.notes(chart), day });
const edit = (wb, fn, opts = {}) => { const tx = wb.edit({ chart, who: 'Bound text test', ...opts }); fn(tx); const c = tx.commit(); if (typeof c === 'string') throw Error(c); return c; };
// Exactly the storage operations supplied by App.putting, with real transactions/history.
const writer = ctx => (tx, id, slot, out) => !out ? id && tx.remove(id) : id ? tx.set(id, { at: ctx.state[id].at, edge: ctx.state[id].edge, ...out }) : tx.add('record', { ...slot, ...out });
function run() {
  const wb = fixture(), ctx = context(wb), bind = token => BoundText.resolve(ctx, 'a', token);
  check('An entered field identifies its exact record and typed slot', bind('Role').editable && bind('Role').target.id === 'a-role' && bind('Role').text === 'Engineer' && bind('Role').target.slot.at === 'a');
  check('A blank schema field remains an editable target', bind('Notes').editable && bind('Notes').text === '' && bind('Notes').target.id === null && bind('Notes').target.datatype === 'text');
  check('Conditional fields target the classification entry, not the object root', bind('License').target.slot.at === 'a-category' && bind('Category › License').target.id === 'license');
  check('Related fields target their single owning object', bind("Employer's name").target.id === 'c-name' && bind("Employer's name").target.recordId === 'c' && bind('Employer.Name').text === 'Cedar Labs');
  check('Relation-side tokens use the same owning object target', BoundText.resolve(ctx, 'a-job', 'Employer').target.id === 'c-name');
  const shared = BoundText.planValue(ctx, { recordIds: ['a', 'b'], token: "Employer's name", text: 'Cedar Works' });
  check('Two selected records pointing to one employer produce one write', shared.ok && shared.typed.length === 1 && shared.typed[0].id === 'c-name');
  check('Transforms display their value but cannot invent an inverse write', bind('Name|initials').text === 'A' && !bind('Name|initials').editable && bind('Name|initials').code === 'transformed-value');
  check('Missing records and unmatched fields are read-only failures', !BoundText.resolve(ctx, 'gone', 'Name').editable && !bind('Missing').editable);
  const source = String.raw`\{literal\} {Name} — {Role}\nAgain: {Name}`.replace('\\n', '\n');
  const from = TextTemplate.characters(source).indexOf('{Name}'), projection = BoundText.project(ctx, 'a', source, [{ from, to: from + 6, Bold: true }]);
  const fields = projection.spans.filter(s => s.kind === 'field');
  check('Resolved paragraphs preserve literal braces, separators and line breaks', projection.text === '{literal} Alice — Engineer\nAgain: Alice');
  check('Every field occurrence has distinct display and decoded source ranges', fields.length === 3 && fields[0].source.from === from && fields[2].display.from > fields[0].display.to && projection.spans.at(-1).source.to === TextTemplate.characters(source).length);
  check('Rich text ranges expand over the complete resolved field value', projection.runs.length === 1 && projection.runs[0].from === fields[0].display.from && projection.runs[0].to === fields[0].display.to && projection.runs[0].Bold);
  check('Caret targeting selects the field being edited without changing the scope', BoundText.selection(projection, fields[1].display.from + 2)[0] === fields[1] && fields[1].binding.target.id === 'a-role');
  const para = 'Lead engineer\n  Research and prototyping', literal = BoundText.planValue(ctx, { recordIds: ['a'], token: 'Role', text: para });
  check('A value edit preserves exact text and paragraphs and never rewrites the template', literal.ok && literal.typed[0].out.value === para && projection.source === source);
  check('An empty value clears the entry and retains its schema/template target', BoundText.planValue(ctx, { recordIds: ['a'], token: 'Role', text: '' }).typed[0].out === null);
  check('Unchanged and empty absent values create no history commands', !BoundText.planValue(ctx, { recordIds: ['a'], token: 'Role', text: 'Engineer' }).typed.length && !BoundText.planValue(ctx, { recordIds: ['a'], token: 'Notes', text: '' }).typed.length);
  check('The planner requires an explicit scope and never guesses visible objects', !BoundText.planValue(ctx, { recordIds: [], token: 'Role', text: 'Lead' }).ok);
  check('Percentages, dates and Yes/No use typed values', BoundText.planValue(ctx, { recordIds: ['a'], token: 'Rate', text: '12.5%' }).typed[0].out.value === .125 && BoundText.planValue(ctx, { recordIds: ['a'], token: 'Started', text: 'Jan 12, 2024' }).typed[0].out.value === '2024-01-12' && BoundText.planValue(ctx, { recordIds: ['a'], token: 'Enabled', text: 'No' }).typed[0].out.tag === false);
  const precise = BoundText.planOutput(ctx, { recordIds: ['a', 'b'], token: 'Rate', out: { field: 'percent', value: .123456789012345 } });
  check('Canonical panel values retain their full precision across a broad edit', precise.ok && precise.values.length === 2 && precise.values.every(t => t.out.value === .123456789012345));
  check('Canonical panel writes cannot silently change another target’s field datatype', !BoundText.planOutput(ctx, { recordIds: ['a'], token: 'Rate', out: { field: 'text', value: '12' } }).ok);
  check('Invalid typed values and unknown choice options reject all commands', !BoundText.planValue(ctx, { recordIds: ['a', 'b'], token: 'Rate', text: 'twelve' }).ok && !BoundText.planValue(ctx, { recordIds: ['a'], token: 'Started', text: 'not a date' }).ok && !BoundText.planValue(ctx, { recordIds: ['a'], token: 'Category', text: 'New kind' }).ok);
  check('Choice edits retain the existing schema’s canonical spelling', BoundText.planValue(ctx, { recordIds: ['a'], token: 'Category', text: 'person' }).typed.length === 0);
  const rejected = BoundText.planValue(ctx, { recordIds: ['a', 'c'], token: 'License', text: 'All' });
  check('One incompatible record rejects the complete broad edit without partial commands', !rejected.ok && !rejected.typed.length && wb.asOf(chart, day).license.value === 'A-1');
  check('Clearing a classification with dependent data requires panel review', !BoundText.planValue(ctx, { recordIds: ['a'], token: 'Category', text: '' }).ok);
  const broad = BoundText.planValue(ctx, { recordIds: ['a', 'b', 'a'], token: 'Role', text: 'Lead' });
  const changed = edit(wb, tx => BoundText.apply(tx, broad, { put: writer(ctx) }), { day: '2025-01-01' });
  check('A broad edit is one transaction and changes only the explicit records', changed && wb.asOf(chart, day)['a-role'].value === 'Lead' && wb.asOf(chart, day)['b-role'].value === 'Lead' && wb.asOf(chart, day)['c-name'].value === 'Cedar Labs');
  check('Applying a dated plan preserves both previous values in history', wb.asOf(chart, '2024-12-31')['a-role'].value === 'Engineer' && wb.asOf(chart, '2024-12-31')['b-role'].value === 'Designer');
  wb.reverse(changed.id, 'Bound text test');
  check('One Undo restores every target in the scoped edit', wb.asOf(chart, day)['a-role'].value === 'Engineer' && wb.asOf(chart, day)['b-role'].value === 'Designer');
  const mult = fixture();
  edit(mult, tx => tx.add('record', { args: [{ edge: 'Employee', at: 'a-category' }, { edge: 'Employer', at: 'd-category' }], tag: true }));
  const aggregate = BoundText.resolve(context(mult), 'a', "Employer's name");
  check('An aggregated relative value remains readable but cannot pick a record to overwrite', aggregate.text === 'Cedar Labs, Dune Labs' && !aggregate.editable && aggregate.code === 'multiple-related-records');
  const short = fixture();
  edit(short, tx => tx.add('record', { at: 'c', edge: 'Short Name', field: 'text', value: 'CL' }, 'short-name'));
  check('Bare related-list tokens target the displayed short name without changing full-name bindings', BoundText.resolve(context(short), 'a', 'Employers').target.id === 'short-name' && BoundText.resolve(context(short), 'a', 'Employers').text === 'CL' && BoundText.resolve(context(short), 'a', "Employer's name").target.id === 'c-name');
  const nested = fixture(), home = entry(root, 'Home', { choice: 'Active' }), work = entry(root, 'Work', { choice: 'Active' });
  edit(nested, tx => {
    for (const tree of [field(home, 'Code'), field(work, 'Code')]) tx.add('spec', { tree });
    for (const edge of ['Home', 'Work']) tx.add('record', { at: 'a', edge, choice: 'Active' }, edge);
    tx.add('record', { at: 'Home', edge: 'Code', field: 'text', value: 'H-1' }, 'home-code');
  });
  const nc = context(nested), ambiguous = BoundText.resolve(nc, 'a', 'Code');
  check('Legacy ambiguous labels keep their display but never silently target the first value', ambiguous.text === 'H-1' && !ambiguous.editable && ambiguous.code === 'ambiguous-field');
  check('Qualified existing and blank duplicates address independent slots', BoundText.resolve(nc, 'a', 'Home › Code').target.id === 'home-code' && BoundText.resolve(nc, 'a', 'Work › Code').target.slot.at === 'Work');
  edit(nested, tx => tx.note('Formula', Tree.bare(field(home, 'Code')), [{ formula: '"Calculated"' }]));
  check('An applicable formula prevents direct edits even before its value has been computed', !BoundText.resolve(context(nested), 'a', 'Home › Code').editable);
  const calculated = { ...ctx, state: { ...ctx.state, 'a-role': { ...ctx.state['a-role'], computed: true } } };
  check('Computed output is read-only even when schema and record paths are ordinary', !BoundText.resolve(calculated, 'a', 'Role').editable);
  const mixed = fixture(), mctx = context(mixed);
  const mixedChange = edit(mixed, tx => {
    const correcting = tx.at(null);
    correcting.set('a-role', { at: 'a', edge: 'Role', field: 'text', value: 'Corrected' });
    correcting.add('record', { at: 'a', edge: 'Notes', field: 'text', value: 'Fixed blank' }, 'fixed-blank');
    tx.set('b-role', { at: 'b', edge: 'Role', field: 'text', value: 'Promoted' });
    tx.add('record', { at: 'b', edge: 'Notes', field: 'text', value: 'Dated blank' }, 'dated-blank');
  }, { day: '2025-01-01' });
  check('A local correction keeps the Fixed fact’s period without a historical split', mixed.item(chart, 'a-role').length === 1 && mixed.asOf(chart, '2024-01-01')['a-role'].value === 'Corrected' && mixed.item(chart, 'a-role')[0].since === mctx.state['a-role'].since);
  check('Local transaction dates do not leak into parent set/add operations', mixed.item(chart, 'b-role').length === 2 && mixed.asOf(chart, '2024-01-01')['b-role'].value === 'Designer' && mixed.item(chart, 'dated-blank')[0].since === '2025-01-01' && !mixed.item(chart, 'fixed-blank')[0].since);
  mixed.reverse(mixedChange.id, 'Bound text test');
  check('Mixed corrections, dated updates and additions all reverse in one Undo', mixed.asOf(chart, day)['a-role'].value === 'Engineer' && mixed.asOf(chart, day)['b-role'].value === 'Designer' && !mixed.asOf(chart, day)['fixed-blank'] && !mixed.asOf(chart, day)['dated-blank']);
  const unchanged = mixed.changes().length;
  try { const tx = mixed.edit({ chart, who: 'Bound text test' }); BoundText.apply(tx, rejected, { put: writer(context(mixed)) }); tx.commit(); } catch (_) {}
  check('A failed broad plan cannot partially commit through the apply boundary', mixed.changes().length === unchanged && mixed.asOf(chart, day)['a-role'].value === 'Engineer');
}
try { run(); } catch (e) { results.push({ name: 'Bound text fixture runs', ok: false, detail: e.stack ?? String(e) }); }
const failed = results.filter(x => !x.ok);
document.title = `bound-text test: ${results.length - failed.length} pass, ${failed.length} fail`;
document.getElementById('out').textContent = [`${results.length - failed.length} passed, ${failed.length} failed`, ...results.map(x => `${x.ok ? 'pass' : 'FAIL'} ${x.name}${x.detail ? ': ' + x.detail : ''}`)].join('\n');
