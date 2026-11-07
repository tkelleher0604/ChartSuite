// Scope is explicit intent, independent of what the canvas happens to draw.
const out = [], check = (name, ok) => out.push({ name, ok: !!ok });
const state = {
  ada: { kind: 'Person' }, bea: { kind: 'Person' }, cy: { kind: 'Person' }, firm: { kind: 'Company' }, page: { kind: 'View' },
  name: { at: 'ada', edge: 'Name', field: 'text', value: 'Ada' },
  aCategory: { at: 'ada', edge: 'Category', choice: 'North' }, bCategory: { at: 'bea', edge: 'Category', choice: 'South' }, cCategory: { at: 'cy', edge: 'Category', choice: 'North' },
  branch: { at: 'ada', edge: 'Office', choice: 'Home' }, city: { at: 'branch', edge: 'City', field: 'text', value: 'Oxford' },
  rel: { args: [{ at: 'ada', edge: 'Manager' }, { at: 'firm', edge: 'Company' }], tag: true },
  relName: { at: 'rel', edge: 'Name', field: 'text', value: 'Director' },
};
const before = JSON.stringify(state), ids = scope => EditScope.records(state, scope, 'ada').sort().join();
const person = { kind: 'Person' }, north = { args: [{ edge: 'Category', loc: person }], out: { choice: 'North' } };
check('An omitted scope targets the anchored object', ids() === 'ada');
check('Own scope uses the entire explicit selection and deduplicates it', ids({ own: true, records: ['ada', 'bea', 'ada'] }) === 'ada,bea');
check('An explicit empty selection does not fall back to an unrelated anchor', ids({ own: true, records: [] }) === '');
check('An owned field selection resolves to its containing object', ids({ own: true, recordIds: ['city', 'name'] }) === 'ada');
check('Missing records and view records never become data-edit targets', ids({ own: true, records: ['missing', 'page'] }) === '');
check('Kind scope includes objects absent from the visible record list', ids({ own: false, records: ['ada'], marks: new Set(['ada']), outputs: [person] }) === 'ada,bea,cy');
check('Choice scope matches owned entries across the complete record state', ids({ own: false, outputs: [north] }) === 'ada,cy');
const home = { args: [{ edge: 'Office', loc: person }], out: { choice: 'Home' } }, city = { args: [{ edge: 'City', loc: home }], out: { field: 'text', value: 'Oxford' } };
check('Nested field scopes resolve their original owner', ids({ own: false, outputs: [city] }) === 'ada');
check('Overlapping patterns select each object once', ids({ own: false, outputs: [person, north, person] }) === 'ada,bea,cy');
check('Broad resolution retains the original pattern instead of enumerating current members', JSON.stringify(EditScope.resolve(state, { own: false, outputs: [north] }).patterns) === JSON.stringify([north]));
check('An explicit shown-only pattern remains finite despite a broad caption', ids({ own: false, shown: true, caption: 'People', outputs: [{ id: 'ada' }, { id: 'bea' }] }) === 'ada,bea');
check('A relation is its own root rather than both of its related objects', ids({ own: true, records: ['relName'] }) === 'rel');
check('An object scope does not traverse relationships into another owner', !EditScope.records(state, { own: false, outputs: [person] }).includes('firm'));
check('An unspecified broad target reaches no objects', ids({ own: false }) === '');
check('Resolution does not mutate records or their fields', JSON.stringify(state) === before);
const failed = out.filter(x => !x.ok).length;
document.title = `edit scope test: ${out.length - failed} pass, ${failed} fail`;
document.getElementById('out').textContent = [`${out.length - failed} passed, ${failed} failed`, ...out.map(x => `${x.ok ? 'pass' : 'FAIL'} ${x.name}`)].join('\n');
