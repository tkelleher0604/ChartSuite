// Test the persisted formatting contract without a toolbar, canvas, App or UI stubs.
const out = [], check = (name, ok) => out.push({ name, ok: !!ok });
const chart = 'formatting', view = 'page', otherView = 'other-page', who = 'Formatting test';
const person = { kind: 'Person' }, name = { out: { field: 'text' }, args: [{ edge: 'Name', loc: person }] };
const stateOf = wb => wb.asOf(chart), treeOf = (wb, id) => Tree.treeOf(stateOf(wb), id);
const mark = id => ({ id, record: id, type: 'box', texts: [] });
const edit = wb => wb.edit({ chart, who });
const setup = configure => {
  const wb = Log.open({ dendra: 1, changes: [] }), tx = edit(wb);
  tx.add('chart', { name: 'Formatting' }, chart);
  for (const tree of [person, name, { kind: 'View' }]) tx.add('spec', { tree });
  for (const id of ['a', 'b']) {
    tx.add('record', { kind: 'Person' }, id);
    tx.add('record', { at: id, edge: 'Name', field: 'text', value: id.toUpperCase() }, `${id}-name`);
  }
  for (const id of [view, otherView]) tx.add('record', { kind: 'View' }, id);
  tx.commit();
  if (configure) { const next = edit(wb); configure(next, wb); next.commit(); }
  return wb;
};
const context = (wb, tx, scope, marks, more = {}) => ({
  records: stateOf(wb), notes: wb.notes(chart), view, scope, marks, scopeMarks: marks,
  rows: new Map(marks.filter(m => m.type === 'shape').map(m => [m.id, tx.item(m.id).at(-1)])),
  footer: tx.noteAt('Footer', { kind: 'View' })?.value, ...more,
});
const apply = (wb, tx, scope, marks, label, value, more) => Formatting.apply(tx, Formatting.plan(context(wb, tx, scope, marks, more), label, value));
const resolved = (wb, label, id, page = view) => wb.notes(chart).resolve(label, treeOf(wb, id), page)?.value;

function run() {
  const wb = setup((tx, w) => {
    tx.note('Fill', person, 'gray', { view });
    tx.note('Fill', treeOf(w, 'a'), 'green', { view });
    tx.note('Fill', person, 'white', { view: otherView });
  });
  const before = JSON.stringify(wb.changes()), tx = edit(wb);
  const plan = Formatting.plan(context(wb, tx, { own: true }, [mark('a')]), 'Fill', 'blue');
  check('Planning a selection change leaves the log untouched', JSON.stringify(wb.changes()) === before);
  Formatting.apply(tx, plan); const change = tx.commit();
  check('Selection formatting changes only the selected record', resolved(wb, 'Fill', 'a') === 'blue' && resolved(wb, 'Fill', 'b') === 'gray');
  check('Selection formatting stays in its view', resolved(wb, 'Fill', 'a', otherView) === 'white');
  const saved = Log.open(JSON.parse(JSON.stringify(wb.changes())));
  check('The same selection format survives serialization and reopen', resolved(saved, 'Fill', 'a') === 'blue' && resolved(saved, 'Fill', 'b') === 'gray');
  wb.reverse(change.id, who);
  check('One Undo restores the previous override without altering its shared style', resolved(wb, 'Fill', 'a') === 'green' && resolved(wb, 'Fill', 'b') === 'gray');
  const shared = edit(wb); apply(wb, shared, { outputs: [person] }, [mark('a'), mark('b')], 'Fill', 'orange'); shared.commit();
  check('A shared style updates inheriting objects while retaining explicit instance overrides', resolved(wb, 'Fill', 'a') === 'green' && resolved(wb, 'Fill', 'b') === 'orange');

  const fields = setup((tx, w) => {
    tx.note('Size', name, 10, { view });
    tx.note('Size', treeOf(w, 'a-name'), 30, { view });
    tx.note('Size', treeOf(w, 'a'), 32, { view, param: 'Name' });
    tx.note('Size', treeOf(w, 'a-name'), 44, { view: otherView });
    tx.note('Bold', treeOf(w, 'a-name'), true, { view });
  });
  const size = edit(fields); apply(fields, size, { own: true }, [mark('a')], 'Size', 20); size.commit();
  check('Whole-object text formatting clears that property on its own fields', !fields.notes(chart).notes('Size').some(n => n.view === view && Tree.idsIn(n.pattern).size && (n.param || n.pattern.args)));
  check('Whole-object text formatting preserves shared field styles', resolved(fields, 'Size', 'a-name') === 10 && resolved(fields, 'Size', 'b-name') === 10);
  check('Clearing field overrides leaves unrelated properties and other views intact', resolved(fields, 'Bold', 'a-name') === true && resolved(fields, 'Size', 'a-name', otherView) === 44);
  const shown = ['a', 'b'].map(id => ({ ...mark(id), texts: [{ id: `${id}-name`, settings: { Size: fields.notes(chart).resolve('Size', treeOf(fields, `${id}-name`), view) } }] }));
  const groupText = edit(fields); apply(fields, groupText, { outputs: [person] }, shown, 'Size', 24); groupText.commit();
  check('Group text formatting also reaches fields with their own shared style', fields.notes(chart).fields(treeOf(fields, 'b'), view, 'Size').Name?.value === 24);
  const oneField = edit(fields); apply(fields, oneField, { outputs: [name], swatch: { kind: 'text' } }, shown, 'Size', 16); oneField.commit();
  check('Formatting an entry style updates existing group-level field overrides', fields.notes(chart).fields(treeOf(fields, 'b'), view, 'Size').Name?.value === 16);
  const hasName = edit(fields); apply(fields, hasName, { has: true, outputs: [name] }, shown, 'Font', 'Arial'); hasName.commit();
  check('Entry-row font formatting remains scoped to that field', fields.notes(chart).notes('Font').every(n => Tree.key(n.pattern) === Tree.key(name) && n.param === 'Name'));

  const failed = { out: { tag: false }, args: [{ edge: 'Approved', loc: person }] };
  const checks = setup(tx => {
    tx.note('Check', { out: { tag: true }, args: failed.args }, true);
    tx.note('Fill', failed, 'red', { view });
  });
  const failStyle = edit(checks); apply(checks, failStyle, { outputs: [failed] }, [], 'Fill', 'pink'); failStyle.commit();
  const failNotes = checks.notes(chart).notes('Fill');
  check('Failing-check styles apply across views and remove their stale view override', failNotes.length === 1 && failNotes[0].view === undefined && failNotes[0].value === 'pink');

  const drawings = setup(tx => {
    tx.add('shape', { view, geometry: 'rect', format: { Fill: 'white' } }, 'shape');
    tx.add('shape', { view, geometry: 'table', format: { Size: 10 }, table: { widths: [120, 80], rows: [{ label: 'row', cells: [
      { text: 'A', format: { Size: 20, Bold: true }, span: 1 }, { text: 'B', format: { Size: 22, Italic: true } },
    ] }] } }, 'table');
    tx.note('Footer', { kind: 'View' }, { text: 'Company', number: true, format: { Color: 'gray' } });
  });
  const shape = { id: 'shape', type: 'shape', geometry: 'rect' }, table = { id: 'table', type: 'shape', geometry: 'table' };
  const several = edit(drawings);
  apply(drawings, several, { own: true }, [shape], 'Outline', 'blue');
  apply(drawings, several, { own: true }, [shape], 'Weight', 2);
  several.commit();
  check('Multiple settings in one transaction preserve each other on free shapes', drawings.item(chart, 'shape').at(-1).format.Outline === 'blue' && drawings.item(chart, 'shape').at(-1).format.Weight === 2);
  const cells = edit(drawings); apply(drawings, cells, { own: true }, [table], 'Size', 18, { cells: [{ r: 0, c: 1 }] }); cells.commit();
  const cellRows = drawings.item(chart, 'table').at(-1).table.rows;
  check('Cell selection uses source coordinates and leaves unselected cells unchanged', cellRows[0].cells[0].format.Size === 20 && cellRows[0].cells[1].format.Size === 18);
  check('Cell formatting preserves text and other formatting', cellRows[0].cells[1].text === 'B' && cellRows[0].cells[1].format.Italic);
  const whole = edit(drawings); apply(drawings, whole, { own: true }, [table], 'Size', 12); whole.commit();
  const tableRow = drawings.item(chart, 'table').at(-1);
  check('Whole-table text formatting clears that property on every cell', tableRow.format.Size === 12 && tableRow.table.rows[0].cells.every(c => c.format.Size === undefined));
  check('Whole-table formatting preserves unrelated cell overrides and table structure', tableRow.table.rows[0].cells[0].format.Bold && tableRow.table.rows[0].cells[1].format.Italic && tableRow.table.widths.join() === '120,80' && tableRow.table.rows[0].label === 'row');
  const foot = edit(drawings), footer = { id: 'footer', type: 'shape', role: 'footer' };
  apply(drawings, foot, { own: true }, [footer], 'Bold', true);
  apply(drawings, foot, { own: true }, [footer], 'Size', 14);
  foot.commit();
  const footnote = drawings.notes(chart).resolve('Footer', { kind: 'View' }).value;
  check('Multiple footer settings in one transaction preserve each other', footnote.format.Bold && footnote.format.Size === 14 && footnote.format.Color === 'gray');
  check('Footer formatting preserves its text and numbering settings', footnote.text === 'Company' && footnote.number);
  const allText = edit(drawings); apply(drawings, allText, { root: true }, [], 'Size', 11); allText.commit();
  check('All text writes the current page default without changing other pages', drawings.notes(chart).resolve('Size', { id: view, kind: 'View' })?.value === 11 && !drawings.notes(chart).resolve('Size', { id: otherView, kind: 'View' }));
  const plainBefore = JSON.stringify(tableRow), pure = context(drawings, edit(drawings), { own: true }, [table]);
  Formatting.plan(pure, 'Bold', false);
  check('Planning table formatting never mutates supplied rows', JSON.stringify(tableRow) === plainBefore);
  check('The command layer has no application, canvas or document dependency', typeof App === 'undefined' && typeof Canvas === 'undefined');
}
try { run(); } catch (e) { out.push({ name: 'Formatting contract runs', ok: false, detail: e.stack ?? String(e) }); }
const failed = out.filter(x => !x.ok);
document.title = `formatting test: ${out.length - failed.length} pass, ${failed.length} fail`;
document.getElementById('out').textContent = [`${out.length - failed.length} passed, ${failed.length} failed`, ...out.map(x => `${x.ok ? 'pass' : 'FAIL'} ${x.name}${x.detail ? ': ' + x.detail : ''}`)].join('\n');
