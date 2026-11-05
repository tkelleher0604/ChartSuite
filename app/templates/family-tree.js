// A family tree: people, their parents and whom they married. Spouses stand side by side, and their children under them.
// A person who's died is still on the tree, so Died is a plain date; a marriage's dates are when it holds.
Templates.register({
  id: 'family-tree',
  name: 'Family tree',
  order: 3,
  rows: Templates.rows(t => {
    const person = { kind: 'Person' }, field = (edge, type = 'text') => ({ out: { field: type }, ...t.entry(edge, {}) });
    t.kind('Person', { Name: 'text', Born: 'date', Died: 'date', Birthplace: 'text', 'Maiden Name': 'text' });
    const parent = t.relation('Parent Of', ['Parent', 'Child'], { kinds: [['Person', 'Person']], lists: { Parent: 'Parents', Child: 'Children' } });
    const married = t.relation('Married To', ['Spouse', 'Partner'], { kinds: [['Person', 'Person']], lists: { Spouse: 'Spouses', Partner: 'Spouses' }, at: { Married: 'date', Ended: 'date' }, above: 'level' });
    t.starts('Married', married);
    t.ends('Ended', married);

    t.page('tree', 'Family Tree', 1, { title: { format: { Font: 'Georgia', Bold: false, Color: '#3d2f1f' } }, date: { format: { Size: 10, Color: '#6b6256' } }, key: { format: { Outline: 'none' } } });
    t.shown('tree', field('Name'), { Bold: true, Color: '#2b241b' });
    t.shown('tree', t.entry('Born', person), { Color: '#6b6256', Format: 'label' });
    t.shown('tree', field('Died', 'date'), { Color: '#6b6256', Format: 'label' });
    t.style('tree', person, 'Person', { Shape: 'rounded', Fill: '#f6f1e7', Outline: '#7a6a52', Weight: 1 });
    t.style('tree', { out: { tag: true }, ...parent }, 'Parent of', { Outline: '#7a6a52', Weight: 1 });
    t.note('Shown', { out: { tag: true }, ...parent }, true, { view: 'tree' });
    t.note('Format', { out: { tag: true }, ...parent }, 'none', { view: 'tree' });
    t.style('tree', { out: { tag: true }, ...married }, 'Married to', { Outline: '#7a6a52', Weight: 1.5 });
    t.note('Shown', { out: { tag: true }, ...married }, true, { view: 'tree' });
    t.note('Format', { out: { tag: true }, ...married }, 'none', { view: 'tree' });
    t.table('people', 'People', 2, person);
  }),
  example: {
    boxes: { a: ['Person', { Name: 'Rose Hale' }], b: ['Person', { Name: 'Tom Hale' }], c: ['Person', { Name: 'Ada Hale' }], d: ['Person', { Name: 'Ben Hale' }], e: ['Person', { Name: 'Joe Hale' }] },
    lines: [{ Spouse: 'a', Partner: 'b' }, { Parent: 'a', Child: 'c' }, { Parent: 'b', Child: 'c' }, { Parent: 'a', Child: 'd' }, { Parent: 'b', Child: 'd' }, { Parent: 'a', Child: 'e' }, { Parent: 'b', Child: 'e' }],
  },
});
