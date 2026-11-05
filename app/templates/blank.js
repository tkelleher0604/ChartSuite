// Blank: one kind, Box, with a Name, and a page. No relation till one's named.
Templates.register({
  id: 'blank',
  name: 'Blank',
  order: 1,
  rows: Templates.rows(t => {
    t.kind('Box', { Name: 'text' });
    t.undated();
    // (Type of its own, a face every copy of Office has, so the deck carries it.)
    t.note('Theme Fonts', { kind: 'View' }, { heading: 'Gill Sans MT', body: 'Gill Sans MT' });
    t.page('chart', 'Chart', 1, { title: { format: { Bold: false, Color: '#1f3a5f' } }, date: false, key: false });
    t.shown('chart', { out: { field: 'text' }, ...t.entry('Name', {}) });
  }),
  example: { boxes: { a: ['Box', {}], b: ['Box', {}], c: ['Box', {}] }, lines: [] },
});
