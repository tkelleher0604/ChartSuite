// The same small chart modeled with two kinds, or one kind and a classification.
// Real schema, log, note resolution, scene and SVG export; no application or UI stubs.
const out = [], check = (name, ok, detail = '') => out.push({ name, ok: !!ok, detail });
const chart = 'classification', view = 'page', day = '2026-11-07';
const entry = (loc, edge, out) => ({ out, args: [{ edge, loc }] });
const field = (loc, edge, type = 'text') => entry(loc, edge, { field: type });
const category = choice => entry({ kind: 'Object' }, 'Category', { choice });
const edit = (wb, change) => {
  const tx = wb.edit({ chart, who: 'Model comparison' }); change(tx);
  const result = tx.commit(); if (typeof result === 'string') throw Error(result);
  return result;
};
function fixture(classified) {
  const wb = Log.open(), person = classified ? category('Person') : { kind: 'Person' }, company = classified ? category('Company') : { kind: 'Company' };
  const roots = classified ? [{ kind: 'Object' }] : [person, company];
  const employment = { out: { tag: true }, args: [{ edge: 'Employee', loc: person }, { edge: 'Employer', loc: company }] };
  const design = { id: 'employee-card', name: 'Employee card', base: {}, parts: [
    { id: 'name', geometry: 'text', x: 0, y: 0, w: 1, h: .4, text: '{Name}' },
    { id: 'employer', geometry: 'text', x: 0, y: .4, w: 1, h: .6, text: "Works at {Employer's name}" },
  ] };
  edit(wb, tx => {
    tx.add('chart', { name: classified ? 'Classification' : 'Kinds' }, chart);
    for (const tree of [{ kind: 'View' }, ...roots.flatMap(r => [r, field(r, 'Name'), field(r, 'Country')]), person, company,
      field(person, 'Born', 'date'), field(person, 'License'), field(company, 'Revenue', 'number'), employment]) tx.add('spec', { tree });
    tx.add('record', { kind: 'View' }, view);
    for (const [id, name, choice] of [['a', 'Ada', 'Person'], ['b', 'Bright Labs', 'Company'], ['c', 'Casey', 'Person']]) {
      tx.add('record', { kind: classified ? 'Object' : choice }, id);
      tx.add('record', { at: id, edge: 'Name', field: 'text', value: name }, `${id}-name`);
      if (classified) tx.add('record', { at: id, edge: 'Category', choice }, `${id}-category`);
    }
    tx.add('record', { at: classified ? 'a-category' : 'a', edge: 'Born', field: 'date', value: '1990-04-12' }, 'born');
    tx.add('record', { at: classified ? 'b-category' : 'b', edge: 'Revenue', field: 'number', value: 42 }, 'revenue');
    tx.add('record', { args: [{ edge: 'Employee', at: classified ? 'a-category' : 'a' }, { edge: 'Employer', at: classified ? 'b-category' : 'b' }], tag: true }, 'job');
    for (const root of roots) tx.note('Shown', root, true, { view });
    tx.note('Name', Tree.bare(employment), 'Employment');
    tx.note('Name', Tree.bare(employment), 'Employers', { param: 'Employer' });
    tx.note('Name', Tree.bare(employment), 'Employees', { param: 'Employee' });
    tx.note('Shown', Tree.bare(employment), true, { view });
    tx.note('Above', Tree.bare(employment), 'Employer', { view });
    tx.note('Design', person, design, { view });
  });
  return { wb, person, company, employment };
}
const state = f => f.wb.asOf(chart, day), notes = f => f.wb.notes(chart), schema = f => f.wb.schema(chart);
const offers = (f, id) => Scene.readable(state(f), notes(f), schema(f), id).map(x => x.label);
const read = (f, id, token) => Scene.reader(state(f), notes(f))(id, token).text;
const scene = f => Scene.of(f.wb, chart, view, day, { state: state(f) });
const words = box => (box?.parts ?? []).flatMap(p => p.texts ?? []).map(t => t.text).join('\n');

function run() {
  const kinds = fixture(false), choices = fixture(true), both = [kinds, choices];
  check('Both models have a coherent schema and every record fits its schema', both.every(f => !Tree.schemaError(schema(f)) && Object.keys(state(f)).every(id => !!schema(f)[Tree.key(Tree.specOf(Tree.treeOf(state(f), id)))])));
  const common = f => Object.values(schema(f)).filter(s => s.args?.length === 1 && ['Name', 'Country'].includes(s.args[0].edge));
  check('One root kind halves the duplicated common field declarations', common(kinds).length === 4 && common(choices).length === 2);
  check('The generic model pays for classification with one entry per object', Object.keys(state(choices)).length === Object.keys(state(kinds)).length + 3);
  check('Both models constrain the Employee and Employer endpoint specifications', both.every(f => Tree.narrower(Tree.treeOf(state(f), 'job'), f.employment) && !Tree.narrower({ out: { tag: true }, args: [...f.employment.args].map(a => ({ ...a, loc: a.edge === 'Employee' ? f.company : f.person })) }, f.employment)));
  check('Owned traversal includes conditional fields without entering related objects', Tree.within(state(choices), 'a').includes('born') && !Tree.within(state(choices), 'a').some(id => ['job', 'b', 'revenue'].includes(id)));
  const cyclic = { a: { at: 'b', edge: 'A', choice: 'a' }, b: { at: 'a', edge: 'B', choice: 'b' } };
  check('Owned traversal terminates and visits cyclic input once', Tree.within(cyclic, 'a').join() === 'a,b');
  check('Missing objects have no owned entries', Tree.within(cyclic, 'missing').length === 0);
  check('Both models offer entered and blank applicable fields', both.every(f => ['Name', 'Country', 'Born', 'License'].every(e => offers(f, 'a').includes(e))));
  check('Conditional field discovery does not offer another category’s fields', !offers(choices, 'a').includes('Revenue') && !offers(choices, 'b').includes('Born'));
  check('A missing classification does not imply an unchosen category', !Scene.readable({ z: { kind: 'Object' } }, notes(choices), schema(choices), 'z').some(x => ['Born', 'Revenue', 'License'].includes(x.label)));
  check('A schema-only addition immediately becomes a merge-field suggestion', (() => {
    const st = state(choices), n = notes(choices), old = schema(choices);
    Scene.readable(st, n, old, 'a');
    const extra = Tree.schema([...Object.values(old), field(choices.person, 'Badge')]);
    return Scene.readable(st, n, extra, 'a').some(x => x.label === 'Badge');
  })());
  check('Conditional values read by label and by explicit entry path', read(choices, 'a', 'Born') === read(kinds, 'a', 'Born') && read(choices, 'a', 'Category › Born') === read(kinds, 'a', 'Born'));
  check('Both models offer the employer’s common and classification fields', both.every(f => ["Employer's name", "Employer's Country", "Employer's Revenue"].every(e => offers(f, 'a').includes(e))));
  check('Both models resolve a constrained relation to the owning object’s name', both.every(f => read(f, 'a', "Employer's name") === 'Bright Labs' && read(f, 'job', 'Employer') === 'Bright Labs'));
  check('Relative merge fields read the related object’s conditional values', both.every(f => read(f, 'a', "Employer's Revenue") === '42' && read(f, 'b', "Employee's Born") === read(f, 'a', 'Born')));
  const addresses = fixture(true), home = entry({ kind: 'Object' }, 'Home', { choice: 'Active' }), work = entry({ kind: 'Object' }, 'Work', { choice: 'Active' });
  edit(addresses.wb, tx => {
    for (const tree of [field(home, 'Code'), field(work, 'Code'), field(home, 'City')]) tx.add('spec', { tree });
    for (const id of ['a', 'c']) for (const edge of ['Home', 'Work']) tx.add('record', { at: id, edge, choice: 'Active' }, `${id}-${edge}`);
    tx.add('record', { at: 'a-Home', edge: 'Code', field: 'text', value: 'H-101' }, 'home-code');
  });
  check('Duplicate leaf labels offer distinct paths for entered and blank fields', ['a', 'c'].every(id => {
    const fields = offers(addresses, id);
    return fields.includes('Home › Code') && fields.includes('Work › Code') && !fields.includes('Code');
  }));
  check('Unambiguous nested fields keep their short labels', offers(addresses, 'a').includes('City') && !offers(addresses, 'a').includes('Home › City'));
  check('Short field labels retain their source path for schema reuse', Scene.readable(state(addresses), notes(addresses), schema(addresses), 'a').find(x => x.label === 'City').paths.join(' › ') === 'Home › City');
  check('Qualified tokens distinguish a value from another branch’s blank', read(addresses, 'a', 'Home › Code') === 'H-101' && read(addresses, 'a', 'Work › Code') === '' && read(addresses, 'c', 'Home › Code') === '' && read(addresses, 'c', 'Work › Code') === '');
  edit(addresses.wb, tx => tx.add('record', { at: 'a-Work', edge: 'Code', field: 'text', value: 'W-202' }, 'work-code'));
  check('Each qualified token reads its own value after the blank is filled', read(addresses, 'a', 'Home › Code') === 'H-101' && read(addresses, 'a', 'Work › Code') === 'W-202');
  check('Filling a duplicate field preserves both offered paths', offers(addresses, 'a').filter(x => x.endsWith(' › Code')).join('|') === 'Home › Code|Work › Code');
  check('Existing unqualified tokens retain their nearest-first interpretation', read(addresses, 'a', 'Code') === 'H-101');
  check('Field discovery retains declarations at open locations', Scene.readable({ x: { kind: 'Object' } }, notes(addresses), Tree.schema([field(Tree.OPEN, 'Open value')]), 'x').some(x => x.label === 'Open value'));
  check('Relationship lists contain owning objects and preserve relation identifiers', both.every(f => Scene.listsAt(state(f), notes(f), 'a').find(x => x.name === 'Employers')?.items[0].obj === 'b' && Scene.listsAt(state(f), notes(f), 'a')[0].items[0].rid === 'job'));
  check('Relationship-list caching follows immutable state changes', (() => {
    const before = state(choices), n = notes(choices), old = Scene.listsAt(before, n, 'a'), after = { ...before, job: { ...before.job, tag: false } };
    return old.some(x => x.items.some(i => i.rid === 'job')) && !Scene.listsAt(after, n, 'a').some(x => x.items.some(i => i.rid === 'job'));
  })());
  check('A relation reaching two entries of one object appears once', (() => {
    const st = { ...state(choices), loop: { tag: true, args: [{ edge: 'Employee', at: 'a-category' }, { edge: 'Employer', at: 'born' }] } };
    return Scene.listsAt(st, notes(choices), 'a').flatMap(x => x.items).filter(x => x.rid === 'loop').length === 1;
  })());
  check('Relationship labels use object names rather than Category', both.every(f => notes(f).placed(state(f), 'job').map(x => x.text).join('|') === 'Ada|Bright Labs'));
  const scenes = both.map(scene);
  check('Both models draw their relation between the owning boxes', scenes.every(s => s.byId.get('job') && new Set([s.byId.get('job').from, s.byId.get('job').to]).size === 2 && [s.byId.get('job').from, s.byId.get('job').to].every(id => ['a', 'b'].includes(id))));
  check('A category-scoped design renders the same literals and relative fields as a kind design', scenes.every(s => words(s.byId.get('a')).includes('Works at Bright Labs') && !s.byId.get('b').design));
  check('SVG exports retain names and resolved classification design text', scenes.every(s => { const svg = Export.svg(s); return svg.includes('Ada') && svg.includes('Bright Labs') && !svg.includes("Employer's name"); }));
  const reopened = { ...choices, wb: Log.open(JSON.parse(JSON.stringify(choices.wb.toJSON()))) };
  check('Classification schema, relations and design fields survive reopening', read(reopened, 'a', "Employer's name") === 'Bright Labs' && words(scene(reopened).byId.get('a')).includes('Works at Bright Labs') && offers(reopened, 'a').includes('License'));
  // A late classification on an otherwise empty record changes applicable fields and designs.
  const changed = edit(choices.wb, tx => tx.update('c-category', { choice: 'Company' }));
  check('Changing a choice refreshes applicable blank fields', offers(choices, 'c').includes('Revenue') && !offers(choices, 'c').includes('Born'));
  check('Changing a choice removes the old category’s design', !scene(choices).byId.get('c').design);
  choices.wb.reverse(changed.id, 'Model comparison');
  check('Undo restores the category’s applicable fields and design', offers(choices, 'c').includes('Born') && !!scene(choices).byId.get('c').design);
  // This is a real limitation, deliberately captured before deciding on a migration:
  // the log infers specifications from entered data, so reclassifying a populated branch
  // preserves its values and expands the inferred schema. It is not a hard type constraint.
  edit(choices.wb, tx => tx.update('a-category', { choice: 'Company' }));
  check('Reclassification preserves entered conditional data and relations', state(choices).born.value === '1990-04-12' && !!state(choices).job);
  check('Reclassification can broaden inferred schema beyond the original relationship contract', !Tree.narrower(Tree.treeOf(state(choices), 'job'), choices.employment) && !!schema(choices)[Tree.key(Tree.specOf(Tree.treeOf(state(choices), 'job')))]);
}
try { run(); } catch (e) { out.push({ name: 'Classification comparison runs', ok: false, detail: e.stack ?? String(e) }); }
const failed = out.filter(x => !x.ok);
document.title = `classification test: ${out.length - failed.length} pass, ${failed.length} fail`;
document.getElementById('out').textContent = [`${out.length - failed.length} passed, ${failed.length} failed`, ...out.map(x => `${x.ok ? 'pass' : 'FAIL'} ${x.name}${x.detail ? ': ' + x.detail : ''}`)].join('\n');
