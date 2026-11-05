// Blank: one kind, Box, with a Name, and a page. No relation till one's named.
Templates.register({
  id: 'blank',
  name: 'Blank',
  order: 1,
  rows: Templates.rows(t => {
    t.kind('Box', { Name: 'text' });
    t.page('chart', 'Chart', 1, { title: { format: { Font: 'Georgia', Bold: false, Color: '#1f3a5f' } }, date: { format: { Size: 10, Color: '#5f6b78' } }, key: { format: { Outline: 'none' } } });
    t.shown('chart', { out: { field: 'text' }, ...t.entry('Name', {}) });
  }),
  example: { boxes: { a: ['Box', {}], b: ['Box', {}], c: ['Box', {}] }, lines: [] },
});
