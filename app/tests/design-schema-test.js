// Pure schema planning: no App, DOM editor, scene or transaction is needed.
const out = [], check = (name, ok) => out.push({ name, ok: !!ok });
const field = (kind, edge, type = 'text') => ({ out: { field: type }, args: [{ edge, loc: { kind } }] });
const choice = (kind, edge, value) => ({ out: { choice: value }, args: [{ edge, loc: { kind } }] });
const nested = (loc, edge, type = 'text') => ({ out: { field: type }, args: [{ edge, loc }] });
const schema = Tree.schema([
  field('Person', 'Name'), field('Company', 'Name'), field('Company', 'Budget', 'money'), { kind: 'Unused' }, { kind: 'View' },
  choice('Person', 'Status', 'Active'), choice('Person', 'Status', 'Away'),
  choice('Company', 'Status', 'Public'), choice('Company', 'Status', 'Private'),
  nested(choice('Person', 'Status', 'Active'), 'Details'), nested(choice('Person', 'Status', 'Away'), 'Details'),
  nested(field('Person', 'Address'), 'Since', 'date'), field('Company', 'Since', 'number'),
]);
const before = JSON.stringify(schema), D = DesignSchema;
const infer = (text, opts = {}) => D.fields([{ text }], schema, opts);
const notes = [
  { pattern: { kind: 'Person' }, view: 'page1', value: { id: 'shared', parts: [] } },
  { pattern: { kind: 'Company' }, view: 'page2', param: 'test', value: { id: 'shared', parts: [], over: { base: { Fill: 'blue' } } } },
  { pattern: { kind: 'Unused' }, view: 'page3', value: { id: 'shared', parts: [] } },
  { pattern: { kind: 'Other' }, view: 'page2', value: { id: 'different', parts: [] } },
];
const targets = D.targets(notes, 'shared', [{ kind: 'Person' }], 'page1');
check('Shared edits target every view, without duplicate destination notes', targets.length === 3);
check('Shared targets retain note parameters and overrides', targets[1].param === 'test' && targets[1].value.over.base.Fill === 'blue');
const kinds = D.kinds(targets, schema, {});
check('Kinds come from notes, including off-page and instance-free types', kinds.join() === 'Person,Company,Unused');
check('A copied gallery design targets only its destination', D.targets(notes, null, [{ kind: 'Person' }], 'page4').length === 1);
check('A new destination in another view joins the shared targets', D.targets(notes, 'shared', [{ kind: 'Person' }], 'page4').length === 4);
check('An entry-scoped design declares on the containing object type', D.kinds([{ pattern: choice('Person', 'Status', 'Active') }], schema, {}).join() === 'Person');
check('An id-only pattern resolves its record kind', D.kinds([{ pattern: { id: 'a' } }], schema, { a: { kind: 'Person' } }).join() === 'Person');
check('Broad patterns include declared kinds but exclude View', D.kinds([{ pattern: {} }], schema, {}).join() === 'Person,Company,Unused');
const overrides = [{ pattern: { kind: 'Person' }, view: 'page4', value: { over: { hidden: true } } }];
check('A destination retains a partial override without promoting it to a shared note', D.targets(notes, null, [{ kind: 'Person' }], 'page4', overrides)[0].value.over.hidden);

const status = infer('{Status}', { kind: 'Person' }).find(f => f.label === 'Status');
check('Inference uses the source type', status.datatype === 'choice' && status.outputs.map(o => o.choice).join() === 'Active,Away');
check('Unrelated choice options are not combined without a source type', infer('{Status}').find(f => f.label === 'Status').datatype === 'text');
check('Inference resolves the whole nested path', infer('{Address › Since}', { kind: 'Person' }).find(f => f.label.includes('Since')).datatype === 'date');
const shortNested = infer('{Since}', { kind: 'Person', readable: [{ label: 'Since', paths: ['Address', 'Since'] }] }).find(f => f.label === 'Since');
check('A short readable label retains its nested schema path', shortNested.datatype === 'date' && shortNested.paths.join(' › ') === 'Address › Since');
const copiedShort = D.declarations(schema, ['Worker'], [shortNested]);
check('Reusing a short nested label declares it at its original depth', !copiedShort.error && copiedShort.trees.some(s => s.args?.[0].edge === 'Since' && s.args[0].loc.args?.[0].edge === 'Address') && !copiedShort.trees.some(s => s.args?.[0].edge === 'Since' && s.args[0].loc.kind === 'Worker'));
check('An unrelated root field does not type an unknown nested path', infer('{Unknown › Since}', { kind: 'Person' }).find(f => f.label.includes('Since')).datatype === 'text');
check('Modifiers and repeated labels do not create extra fields', infer('{Status|initials} {status}').length === 2);
check('Literal braces and formula strings do not become declarations', D.fields([{ text: TextTemplate.literal('{Fake}') }, { text: '="{Also fake}"' }], schema).length === 1);
const linked = infer("{Owner.Name} {Owners}", { kind: 'Person', readable: [{ label: "Owner's name", of: 'Owners', first: true }] });
check('Relative aliases and list names remain linked fields', linked.filter(f => f.linked).length === 2);
check('Linked tokens never declare own fields', D.declarations(schema, ['Person'], linked.filter(f => f.linked)).trees.length === 0);
const ownRelative = Tree.schema([...Object.values(schema), field('Person', 'Owner.Name')]);
check('An explicit own field takes precedence over a relative-looking label', !D.fields([{ text: '{Owner.Name}' }], ownRelative, { kind: 'Person', readable: [{ label: "Owner's name", of: 'Owners' }] }).find(f => f.label === 'Owner.Name').linked);

const newField = { label: 'Department', paths: ['Department'], datatype: 'text', outputs: [] };
const added = D.declarations(schema, kinds, [newField]);
check('A shared new field is declared on every affected type', !added.error && added.trees.length === 3 && added.trees.every(s => s.args[0].edge === 'Department'));
check('Replanning an already applied declaration is idempotent', D.declarations(Tree.schema([...Object.values(schema), ...added.trees]), kinds, [newField]).trees.length === 0);
const conflict = D.declarations(schema, ['Person', 'Company'], [{ ...newField, label: 'Budget', paths: ['Budget'] }]);
check('A conflicting datatype returns no partial declarations', !!conflict.error && conflict.trees.length === 0);
check('A conflict identifies the affected kind and field', conflict.error.includes('Company') && conflict.error.includes('Budget'));
const copied = D.declarations(schema, ['Worker'], infer('{Status} {Status › Details}', { kind: 'Person' }));
const copiedSchema = Tree.schema([...Object.values(schema), ...copied.trees]);
check('A new type copies all choice options', !copied.error && ['Active', 'Away'].every(value => copiedSchema[Tree.key(choice('Worker', 'Status', value))]));
check('Nested declarations retain every choice branch', ['Active', 'Away'].every(value => copiedSchema[Tree.key(nested(choice('Worker', 'Status', value), 'Details'))]));
check('Nested source declarations do not import another type’s options', !copied.trees.some(s => ['Public', 'Private'].includes(s.out?.choice)));
check('The resulting schema satisfies the existing model invariant', !Tree.schemaError(copiedSchema));
const nestedNew = D.declarations(schema, ['Person'], [{ label: 'Status › Extra', paths: ['Status', 'Extra'], datatype: 'text', outputs: [] }]);
check('An unknown nested field is added to every existing option branch', !nestedNew.error && nestedNew.trees.length === 2);
const invalidChoice = D.declarations(schema, ['Person'], [{ label: 'Empty', paths: ['Empty'], datatype: 'choice', outputs: [] }]);
check('A choice without options fails cleanly', !!invalidChoice.error && !invalidChoice.trees.length);
const changed = { ...status, datatype: 'text' };
check('The selected datatype overrides the inferred type for a new kind', D.declarations(schema, ['Worker'], [changed]).trees.some(s => s.out?.field === 'text'));
check('Planning never mutates the input schema', JSON.stringify(schema) === before);

const failed = out.filter(x => !x.ok);
document.title = `design schema test: ${out.length - failed.length} pass, ${failed.length} fail`;
document.getElementById('out').textContent = [`${out.length - failed.length} passed, ${failed.length} failed`, ...out.map(x => `${x.ok ? 'pass' : 'FAIL'} ${x.name}`)].join('\n');
