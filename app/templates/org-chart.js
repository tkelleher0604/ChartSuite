// An org chart: people and who they report to. Each person's Start Date and End Date are when they're on the chart.
Templates.register({
  id: 'org-chart',
  name: 'Org chart',
  order: 2,
  rows: Templates.rows(t => {
    const person = { kind: 'Person' }, field = (edge, type = 'text') => ({ out: { field: type }, ...t.entry(edge, {}) });
    t.kind('Person', { Name: 'text', Title: 'text', Department: 'text', Location: 'text', Email: 'text', 'Start Date': 'date', 'End Date': 'date', Vacant: 'tag' });
    t.starts('Start Date', person);
    t.ends('End Date', person);
    const reports = t.relation('Reports To', ['Manager', 'Report'], { kinds: [['Person', 'Person']], lists: { Manager: 'Manager', Report: 'Reports' } });
    const dotted = t.relation('Dotted Line To', ['Dotted Line Manager', 'Dotted Line Report'], { kinds: [['Person', 'Person']], lists: { 'Dotted Line Manager': 'Dotted Line Managers', 'Dotted Line Report': 'Dotted Line Manager Of' }, above: 'none' });
    t.rule('Direct Reports', { at: person, type: 'number', rows: [['', '= COUNT(Reports)']], about: 'How many people report to this person.' });
    t.rule('Span', { at: person, type: 'number', rows: [['Reports, and all under them', '= COUNT(Reports) + SUM(EACH(Reports, @.Span))']], about: 'How many people are under this person, at every level.' });

    t.page('org', 'Org Chart', 1, { title: { format: { Font: 'Georgia', Bold: false, Color: '#1f3a5f' } }, date: { format: { Size: 10, Color: '#5f6b78' } }, key: false });
    t.shown('org', field('Name'), { Bold: true, Color: '#1c2733' });
    t.shown('org', t.entry('Title', person), { Color: '#5f6b78' });
    t.style('org', person, 'Person', { Shape: 'rounded', Fill: '#eef2f7', Outline: '#1f3a5f', Weight: 1 });
    t.design('org', person, { id: 'org-person', name: 'A band over them', h: 56, base: { Shape: 'rounded' }, parts: [
      { id: 'band', geometry: 'rect', x: 0, y: 0, w: 1, h: 0.14, format: { Fill: '{Outline}', Outline: 'none' } },
      { id: 'rest', rest: true, geometry: 'text', x: 0, y: 0.14, w: 1, h: 0.86, format: { Align: 'center', Valign: 'middle' } }] });
    t.style('org', { out: { tag: true }, ...t.entry('Vacant', {}) }, 'Vacant', { Fill: '#ffffff', Outline: '#8a94a0', Dash: 'dashed' });
    t.style('org', { out: { tag: true }, ...reports }, 'Reports to', { Outline: '#3a4653', Weight: 1 });
    t.note('Shown', { out: { tag: true }, ...reports }, true, { view: 'org' });
    t.note('Format', { out: { tag: true }, ...reports }, 'none', { view: 'org' });
    t.style('org', { out: { tag: true }, ...dotted }, 'Dotted line', { Outline: '#3a4653', Weight: 1, Dash: 'dashed' });
    t.note('Shown', { out: { tag: true }, ...dotted }, true, { view: 'org' });
    t.note('Format', { out: { tag: true }, ...dotted }, 'none', { view: 'org' });
    t.table('people', 'People', 2, person);
    t.table('lines', 'Reporting lines', 3, reports);
  }),
  example: {
    boxes: { a: ['Person', { Name: 'Ana Reyes', Title: 'Chief Executive' }], b: ['Person', { Name: 'Sam Okoye', Title: 'Finance' }], c: ['Person', { Name: 'Lee Park', Title: 'Sales' }], d: ['Person', { Name: 'Kai Lund', Title: 'Accounts' }], e: ['Person', { Name: 'Mo Haddad', Title: 'Field' }], f: ['Person', { Name: 'Ivy Chen', Title: 'Partners' }] },
    lines: [{ Manager: 'a', Report: 'b' }, { Manager: 'a', Report: 'c' }, { Manager: 'b', Report: 'd' }, { Manager: 'c', Report: 'e' }, { Manager: 'c', Report: 'f' }],
  },
});
