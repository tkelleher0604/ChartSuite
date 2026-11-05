// A company structure: entities, the individuals behind them, who owns what by how much, and their directors and officers.
Templates.register({
  id: 'company',
  name: 'Company structure',
  order: 4,
  rows: Templates.rows(t => {
    const entity = { kind: 'Entity' }, individual = { kind: 'Individual' }, field = (edge, type = 'text') => ({ out: { field: type }, ...t.entry(edge, {}) });
    const type = choice => ({ out: { choice }, ...t.entry('Entity Type', {}) });
    t.kind('Entity', {
      Name: 'text',
      'Entity Type': ['Corporation', 'Limited Liability Company', 'Limited Partnership', 'General Partnership', 'Trust', 'Branch'],
      Jurisdiction: ['Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware', 'District of Columbia', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming', 'Canada', 'United Kingdom', 'Ireland', 'Germany', 'France', 'Netherlands', 'Luxembourg', 'Switzerland', 'Singapore', 'Hong Kong', 'Japan', 'Australia', 'Cayman Islands', 'Bermuda', 'British Virgin Islands'],
      'Formation Date': 'date',
      'Dissolution Date': 'date',
    });
    t.kind('Individual', { Name: 'text' });
    t.starts('Formation Date', entity);
    t.ends('Dissolution Date', entity);
    t.note('Required', t.entry('Entity Type', entity), true);
    t.note('Required', t.entry('Jurisdiction', entity), true);
    const owns = t.relation('Ownership', ['Owner', 'Owned'], { kinds: [['Entity', 'Entity'], ['Individual', 'Entity']], lists: { Owner: 'Owners', Owned: 'Holdings' }, at: { Percentage: 'percent' } });
    const role = t.relation('Position', ['Holder', 'Company'], { kinds: [['Individual', 'Entity']], lists: { Holder: 'People', Company: 'Positions' }, roles: ['Director', 'Officer'], at: { Title: 'text', 'Start Date': 'date', 'End Date': 'date' } });
    t.starts('Start Date', role);
    t.ends('End Date', role);

    t.page('structure', 'Structure', 1, { title: { format: { Bold: false, Color: '#1f3a5f' } }, date: { format: { Size: 10, Color: '#5f6b78' } }, key: { format: { Outline: 'none' } } });
    t.shown('structure', field('Name'));
    t.shown('structure', t.entry('Jurisdiction', {}), { Color: '#5f6b78', Format: 'paren' });
    t.style('structure', individual, 'Individual', { Shape: 'oval' });
    t.style('structure', type('Corporation'), 'Corporation', { Shape: 'rect', Fill: '#eef2f7' });
    t.style('structure', type('Limited Liability Company'), 'Limited liability company', { Shape: 'rounded', Fill: '#eef2f7' });
    t.style('structure', type('Limited Partnership'), 'Partnership', { Shape: 'triangle', Fill: '#dde4ec' });
    t.style('structure', type('General Partnership'), 'Partnership', { Shape: 'triangle', Fill: '#dde4ec' });
    // (At each row it's for, so no row of its own in the Key, and a partnership keeps its triangle.)
    const banded = { id: 'company-entity', name: 'A band at its side', base: {}, parts: [
      { id: 'band', geometry: 'rect', x: 0, y: 0, w: 0.05, h: 1, format: { Fill: '{Outline}', Outline: 'none' } },
      { id: 'rest', rest: true, geometry: 'text', x: 0.05, y: 0, w: 0.95, h: 1, format: { Align: 'center', Valign: 'middle' } }] };
    t.design('structure', type('Corporation'), banded);
    t.design('structure', type('Limited Liability Company'), banded);
    t.style('structure', { out: { tag: true }, ...owns }, 'Ownership', { Outline: '#3a4653', Weight: 1 });
    t.note('Shown', { out: { tag: true }, ...owns }, true, { view: 'structure' });
    t.note('Format', { out: { tag: true }, ...owns }, 'none', { view: 'structure' });
    t.note('Arrow', { out: { tag: true }, ...owns }, 'auto', { view: 'structure' });
    t.shown('structure', { out: { field: 'percent' }, ...t.entry('Percentage', owns) });
    t.note('Shown', role, false, { view: 'structure' });
    t.table('entities', 'Entities', 2, entity);
    t.table('ownership', 'Ownership', 3, owns);
    t.table('positions', 'Directors and officers', 4, role);
  }),
  example: {
    boxes: { p: ['Individual', { Name: 'R. Vance' }], h: ['Entity', { Name: 'Holdings', 'Entity Type': 'Corporation' }], a: ['Entity', { Name: 'Opco', 'Entity Type': 'Limited Liability Company' }], b: ['Entity', { Name: 'Ventures', 'Entity Type': 'Limited Partnership' }], c: ['Entity', { Name: 'Propco', 'Entity Type': 'Corporation' }] },
    lines: [{ Owner: 'p', Owned: 'h', entries: { Percentage: 1 } }, { Owner: 'h', Owned: 'a', entries: { Percentage: 1 } }, { Owner: 'h', Owned: 'b', entries: { Percentage: 0.6 } }, { Owner: 'a', Owned: 'c', entries: { Percentage: 1 } }],
  },
});
