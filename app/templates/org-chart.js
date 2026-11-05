// An org chart: people and who they report to. Each person's Start Date and End Date are when they're on the chart.
Templates.register({
  id: 'org-chart',
  name: 'Org chart',
  order: 2,
  rows: Templates.rows(t => {
    const person = { kind: 'Person' }, field = (edge, type = 'text') => ({ out: { field: type }, ...t.entry(edge, {}) });
    // (Department and Location are choices, so the chart can style by each answer; what's typed that isn't one yet becomes one.)
    t.kind('Person', { Name: 'text', Title: 'text', Department: ['Executive', 'Finance', 'Operations', 'People', 'Sales', 'Marketing', 'Engineering'], Location: ['Headquarters', 'Remote'], Email: 'text', 'Start Date': 'date', 'End Date': 'date', Vacant: 'tag' });
    t.note('Grows', t.entry('Department', person), true);
    t.note('Grows', t.entry('Location', person), true);
    t.undated();
    t.starts('Start Date', person);
    t.ends('End Date', person);
    // (Said from the one who reports, as its name says it: "Reports To: Bea Cole → Avery Stone"; the manager drawn above.)
    const reports = t.relation('Reports To', ['Report', 'Manager'], { kinds: [['Person', 'Person']], lists: { Manager: 'Manager', Report: 'Reports' }, above: 'Manager' });
    const dotted = t.relation('Dotted Line To', ['Dotted Line Manager', 'Dotted Line Report'], { kinds: [['Person', 'Person']], lists: { 'Dotted Line Manager': 'Dotted Line Managers', 'Dotted Line Report': 'Dotted Line Manager Of' }, above: 'none' });
    t.rule('Direct Reports', { at: person, type: 'number', rows: [['', '= COUNT(Reports)']], about: 'How many people report to this person.' });
    t.rule('Span', { at: person, type: 'number', rows: [['Reports, and all under them', '= COUNT(Reports) + SUM(EACH(Reports, @.Span))']], about: 'How many people are under this person, at every level.' });

    t.page('org', 'Org Chart', 1, { title: { format: { Bold: false, Color: '#1f3a5f' } }, date: { format: { Size: 10, Color: '#5f6b78' } }, key: false });
    t.shown('org', field('Name'), { Bold: true, Color: '#1c2733' });
    t.shown('org', t.entry('Title', person), { Color: '#5f6b78' });
    t.style('org', person, 'Person', { Shape: 'rounded', Fill: '#eef2f7', Outline: '#1f3a5f', Weight: 1 });
    t.design('org', person, { id: 'org-person', name: 'Top band', base: { Shape: 'rounded' }, parts: [
      { id: 'band', geometry: 'rect', x: 0, y: 0, w: 1, h: 0.14, format: { Fill: '{Outline}', Outline: 'none' } },
      { id: 'rest', rest: true, geometry: 'text', x: 0, y: 0.14, w: 1, h: 0.86, format: { Align: 'center', Valign: 'middle' } }] });
    t.style('org', { out: { tag: true }, ...t.entry('Vacant', {}) }, 'Vacant', { Fill: '#ffffff', Outline: '#8a94a0', Dash: 'dashed' });
    // (A vacant seat has no one's initials, whichever design gives a face: an empty one, dashed as the seat is.)
    t.note('Design', { out: { tag: true }, ...t.entry('Vacant', {}) }, { over: { parts: { face: { text: '', format: { Fill: '#ffffff', Outline: '#8a94a0', Dash: 'dashed' } } } } }, { view: 'org' });
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
