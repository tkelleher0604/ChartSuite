// Acceptance tests of chart authoring. All changes go through visible controls, editable text,
// pointer events or keyboard shortcuts. App/Scene are read only here, to check what those actions made.
const out = [], $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
addEventListener('error', e => out.push({ name: 'No uncaught browser errors', ok: false, detail: e.error?.stack ?? e.message }));
addEventListener('unhandledrejection', e => out.push({ name: 'No unhandled promises', ok: false, detail: e.reason?.stack ?? String(e.reason) }));
const wait = ms => new Promise(r => setTimeout(r, ms));
const check = (name, ok, detail = '') => { out.push({ name, ok: !!ok, detail }); if (!ok) throw new Error(name + ': ' + detail); };
const visible = el => el && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
const words = el => (el.querySelector('.label') ?? el).textContent.replace(/\s+/g, ' ').trim();
async function click(selector) {
  const el = typeof selector === 'string' ? $(selector) : selector;
  if (!visible(el) || el.disabled || el.getAttribute('aria-disabled') === 'true') throw new Error('Control unavailable: ' + selector);
  el.click(); await wait(180); return el;
}
const button = (label, selector = 'button, [role="menuitem"]') => $$(selector).find(el => visible(el) && words(el) === label);
async function menu(label) { return click(button(label, '.float .menu-item')); }
async function input(selector, value) {
  const el = $(selector); if (!visible(el)) throw new Error('Input unavailable: ' + selector);
  el.focus(); el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); await wait(50);
}
async function key(el, name, opts = {}) {
  el.focus(); el.dispatchEvent(new KeyboardEvent('keydown', { key: name, code: /^[a-z]$/i.test(name) ? 'Key' + name.toUpperCase() : name, bubbles: true, cancelable: true, ...opts })); await wait(180);
  el.dispatchEvent(new KeyboardEvent('keyup', { key: name, bubbles: true, ...opts })); await wait(80);
}
async function prose(value) {
  const el = $('.words-in'); if (!visible(el)) throw new Error('Text editor unavailable');
  el.focus(); el.textContent = value;
  const r = document.createRange(); r.selectNodeContents(el); r.collapse(false);
  getSelection().removeAllRanges(); getSelection().addRange(r);
  el.dispatchEvent(new Event('input', { bubbles: true })); el.blur(); await wait(150);
}
async function field(name, fresh = false) {
  await click('.add-field'); await menu(fresh ? 'New field…' : name);
  if (fresh) { await input('dialog input[aria-label="Field name"]', name); await click(button('Insert field', 'dialog button')); }
  await wait(200);
}
async function value(label, text) {
  const selector = `.inspector [aria-label="${label}"]`;
  await input(selector, text); await key($(selector), 'Enter'); await wait(200);
}
async function editDesign() {
  await click('[data-fb="design"]'); await click(button('Edit design', '.picker.designs button')); await wait(400);
}
const rowOf = id => App.shown.peek().item(App.chart.peek(), id).at(-1);
async function dragField(label, target) {
  const source = $$('.inspector .row .k').find(el => words(el) === label), from = source.getBoundingClientRect();
  const to = $(`.x6-node[data-cell-id="${target.id}"]`).getBoundingClientRect();
  source.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: from.x + 8, clientY: from.y + 8 }));
  window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: to.x + 12, clientY: to.y + 12, buttons: 1 })); await wait(100);
  window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: to.x + 12, clientY: to.y + 12, button: 0 })); await wait(300);
}
async function connect(from, to) {
  // Read the rendered box geometry, excluding selection widgets and labels in the SVG bounds.
  const graph = Canvas.active.peek().graph, a = graph.localToClient(from.x + from.w, from.y + from.h / 2), b = graph.localToClient(to.x + to.w / 2, to.y + to.h / 2);
  const point = (type, x, y, target = window, buttons = type.endsWith('up') ? 0 : 1) => target.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0, buttons }));
  point('pointerleave', 0, 0, $('.dc'), 0); point('pointermove', a.x, a.y, $('.dc'), 0); await wait(150);
  const handle = $$('.dc-handle.e').find(visible), r = handle?.getBoundingClientRect();
  if (!r) throw new Error('Connection handle unavailable');
  const x = r.x + r.width / 2, y = r.y + r.height / 2, endX = b.x, endY = b.y;
  point('pointerdown', x, y, handle);
  for (let i = 1; i <= 8; i++) { point('pointermove', x + (endX - x) * i / 8, y + (endY - y) * i / 8); await wait(20); }
  point('pointerup', endX, endY, document.elementFromPoint(endX, endY)); await wait(300);
}
const shapes = () => App.scene.peek().marks.filter(m => m.type === 'shape' && !m.role && m.geometry !== 'group');
const specs = kind => Object.values(App.schema.peek()).filter(s => s.args?.length === 1 && s.args[0].loc.kind === kind);
const box = name => App.scene.peek().marks.find(m => m.type === 'box' && m.record === named(name)?.[0]);
const drawnText = m => [m, ...m?.parts ?? []].flatMap(p => p?.texts?.map(t => t.text) ?? []).join('\n');
const records = () => Object.entries(App.state.peek()).filter(([, r]) => r.kind && r.kind !== 'View');
const named = name => records().find(([id]) => App.notes.peek().nameOf(App.state.peek(), id) === name);
const stop = new URLSearchParams(location.search).get('stop');
async function chart(name) {
  await click('.chartmenu'); await menu('New chart');
  await click('[data-card="blank"]');
  await input('dialog input[aria-label="Name"]', name);
  await click(button('Begin', 'dialog button')); await wait(500);
  check('Blank chart opens through the gallery: ' + name, records().length === 0);
}
async function object(name, type) {
  await click('[data-fb="add-object"]');
  await input('dialog input[aria-label="Name"]', name);
  await input('dialog input[aria-label="Object type"]', type);
  await click(button('Add', 'dialog button')); await wait(300);
  check('Add object creates ' + name + ' as ' + type, named(name)?.[1].kind === type);
}
async function showView(id) {
  const tab = $(`#tab-${id}`), r = tab.getBoundingClientRect();
  tab.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: r.x + 8, clientY: r.y + 8 }));
  window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, clientX: r.x + 8, clientY: r.y + 8 }));
  await wait(400);
}
async function selectBox(name, context = false) {
  const m = box(name), el = $(`.x6-node[data-cell-id="${m.id}"] path`), r = el.getBoundingClientRect();
  const opts = { bubbles: true, cancelable: true, button: 0, clientX: r.x + 8, clientY: r.y + 8 };
  el.dispatchEvent(new MouseEvent('mousedown', opts));
  document.dispatchEvent(new MouseEvent('mouseup', opts));
  el.dispatchEvent(new MouseEvent(context ? 'contextmenu' : 'click', opts));
  await wait(200);
}
async function sharedDesignAcrossViews() {
  const staffView = App.scene.peek().view;
  await click('[aria-label="New view"]'); await menu('Blank chart');
  await input('.sheets input[aria-label="Name"]', 'Companies');
  await key($('.sheets input[aria-label="Name"]'), 'Enter'); await wait(300);
  const companyView = App.scene.peek().view;
  await object('Acme', 'Company');
  await click('[data-fb="design"]'); await click('.picker.designs button.tile[aria-label="Staff card"]');
  const sharedId = box('Acme')?.design?.value.id;
  check('Another object type can reuse a saved design through the gallery', !!sharedId && box('Acme').design.value.name === 'Staff card');
  await showView(staffView);
  if (box('Acme')) { await selectBox('Acme', true); await menu('More'); await menu('Hide in this view'); }
  check('The other type is absent from the page being edited', !box('Acme'));
  await selectBox('Alex'); await editDesign();
  const part = shapes().find(m => rowOf(m.id)?.text?.startsWith('Team'));
  await click(`.part-rows [data-part="${part.id}"]`); await field('Team code', true);
  await click(button('Done', '.dc-designbar button')); await wait(400);
  const hasCode = kind => specs(kind).some(s => s.args[0].edge === 'Team code');
  const saysCode = view => App.notes.peek().notes('Design').some(n => n.view === view && n.value?.id === sharedId && n.value.parts?.some(p => TextTemplate.fields(p.text).includes('Team code')));
  check('Done declares a shared new field on an off-page object type', hasCode('Staff') && hasCode('Company'));
  check('Both views receive the shared design change', saysCode(staffView) && saysCode(companyView));
  await click('[aria-label="Undo"]'); await wait(300);
  check('One Undo removes both declarations and both design changes', !hasCode('Staff') && !hasCode('Company') && !saysCode(staffView) && !saysCode(companyView));
  await click('[aria-label="Redo"]'); await wait(300);
  check('Redo restores the complete shared change', hasCode('Staff') && hasCode('Company') && saysCode(staffView) && saysCode(companyView));
  await showView(companyView); await selectBox('Acme'); await value('Team code', 'ACME');
  check('The off-page type exposes the new field and renders its own value', drawnText(box('Acme')).includes('ACME'));
  await editDesign();
  const companyPart = shapes().find(m => rowOf(m.id)?.text?.startsWith('Team'));
  await click(`.part-rows [data-part="${companyPart.id}"]`); await field('Discarded shared field', true);
  await click(button('Discard', '.dc-designbar button')); await wait(300);
  check('Discard does not leak a field to either kind', ['Staff', 'Company'].every(kind => !specs(kind).some(s => s.args[0].edge === 'Discarded shared field')));
}
async function richDrawingToType() {
  await chart('Rich text');
  await click('[data-fb="insert"]'); await click('.insert .shapes button[aria-label="Rectangle"]');
  await key($('.dc'), 'Enter'); await value('Width', '340'); await value('Height', '70');
  const shape = shapes()[0], text = '=Note {literal}\\  echo echo  ', from = text.lastIndexOf('echo');
  await key($('.dc'), 'Enter');
  const editor = $('.dc-edit');
  if (!visible(editor)) throw new Error('Inline text editor unavailable');
  editor.textContent = text; editor.dispatchEvent(new Event('input', { bubbles: true }));
  const range = document.createRange(); range.setStart(editor.firstChild, from); range.setEnd(editor.firstChild, text.length);
  getSelection().removeAllRanges(); getSelection().addRange(range);
  await key(editor, 'b', { ctrlKey: true }); await key(editor, 'Enter', { ctrlKey: true });
  const run = rowOf(shape.id)?.runs?.[0], source = rowOf(shape.id)?.text;
  check('Inline bold uses the selected second word after literal braces and a backslash', source === TextTemplate.literal(text) && run?.from === from && run.to === text.length && run.Bold);
  await key($('.dc'), 'Enter');
  check('Reopening a literal leading equals sign retains rich text editing', $('.dc-edit')?.textContent === text && $('.dc-edit [data-run]')?.textContent === text.slice(from));
  await key($('.dc-edit'), 'Enter', { ctrlKey: true });
  await click(button('Save as object type…', '.inspector button'));
  await input('dialog input[aria-label="Design name"]', 'Rich card'); await input('dialog input[aria-label="Object type"]', 'Rich card');
  await click(button('Save', 'dialog button')); await wait(350);
  const literalPart = name => box(name)?.parts?.find(p => p.texts?.some(t => t.text === text))?.texts[0];
  const preserved = part => part?.runs?.length === 1 && part.runs[0].from === from && part.runs[0].to === text.length && part.runs[0].Bold;
  check('Saving a drawing as a type preserves exact bold offsets and spaces', preserved(literalPart('Rich card')));
  await object('Second card', 'Rich card');
  check('The next object retains the same literal text and bold occurrence', preserved(literalPart('Second card')));
  await click('.chartmenu'); await menu('Save as…'); await click('.chartmenu'); await menu('Open…'); await wait(400);
  check('Saving and reopening retain the formatted literal text', preserved(literalPart('Second card')));
}
async function run() {
  await wait(500);
  await chart('Team');
  check('A blank page has a visible first-object action', visible($('.dc-empty button')) && !$('.dc-empty').hidden);
  if (stop === 'blank') return;
  await object('Alice', 'Person');
  check('Adding a type does not require editing the schema separately', Object.values(App.schema.peek()).some(s => s.kind === 'Person'));
  await object('Bob', 'Person');
  check('The first-object prompt gives way to the chart', $('.dc-empty').hidden && records().length === 2);
  if (stop === 'objects') return;
  await chart('Cards');
  await click('[data-fb="insert"]');
  await click($('.insert .shapes button[aria-label="Rectangle"]'));
  await key($('.dc'), 'Enter'); await wait(300);
  check('A shape can be drawn on a blank chart through Insert', App.scene.peek().marks.some(m => m.type === 'shape' && !m.role));
  check('A free shape offers merge fields in its text panel', visible($('.part-words .add-field')));
  await value('Width', '180'); await value('Height', '48');
  await value('Left', '240'); await value('Top', '180');
  await prose('Team {Name}: ');
  await field('Name');
  check('Typed braces stay literal beside an explicit field chip', $('.words-in').textContent === 'Team {Name}: Name' && $$('.words-in .word-chip').length === 1);
  await key($('.dc'), 'd', { ctrlKey: true });
  await value('Left', '240'); await value('Top', '228');
  await prose('Role: '); await field('Role', true);
  check('A new field is inserted as a chip, without a schema editing detour', $('.word-chip')?.dataset.token === 'Role');
  check('A drawing alone does not add a type or fields to the schema', !Object.values(App.schema.peek()).some(s => s.kind === 'Staff'));
  await key($('.dc'), 'a', { ctrlKey: true });
  await key($('.dc'), 'g', { ctrlKey: true });
  check('Shapes can be grouped with the standard keyboard shortcut', App.scene.peek().marks.some(m => m.geometry === 'group' && m.members.length === 2));
  await click(button('Save as object type…', '.inspector button'));
  check('A drawing on a blank chart defaults to a new object type', $('dialog select[aria-label="For"]').value === 'new');
  await input('dialog input[aria-label="Design name"]', 'Staff card');
  await input('dialog input[aria-label="Object type"]', 'Staff');
  check('The save dialog lists only actual merge fields', $$('dialog .design-fields label').map(words).join('|').includes('Role') && $$('dialog .design-fields label').length === 2);
  if (stop === 'save') return;
  await click(button('Cancel', 'dialog button'));
  check('Cancel keeps the drawing and creates no schema entries', !specs('Staff').length && App.scene.peek().marks.some(m => m.geometry === 'group'));
  await click(button('Save as object type…', '.inspector button'));
  await input('dialog input[aria-label="Design name"]', 'Staff card');
  await input('dialog input[aria-label="Object type"]', 'View');
  await click(button('Save', 'dialog button'));
  check('Reserved object types are rejected before any change', !!$('dialog') && !named('View'));
  await input('dialog input[aria-label="Object type"]', 'Staff');
  await click(button('Save', 'dialog button')); await wait(500);
  check('Saving a grouped drawing creates its first record', !!named('Staff'));
  check('Its merge fields become backend schema entries', ['Name', 'Role'].every(edge => specs('Staff').some(s => s.args[0].edge === edge && s.out.field === 'text')));
  check('The design is the standard for the new type', App.notes.peek().resolve('Design', { kind: 'Staff' }, App.scene.peek().view)?.value?.name === 'Staff card');
  check('Typed text and record text render separately', drawnText(box('Staff')).includes('Team {Name}: Staff'), drawnText(box('Staff')));
  await click('[aria-label="Undo"]'); await wait(300);
  check('One Undo restores the grouping and removes the new type', !named('Staff') && !specs('Staff').length && App.scene.peek().marks.some(m => m.geometry === 'group'));
  await click('[aria-label="Redo"]'); await wait(300);
  check('Redo restores the type, schema and object together', !!named('Staff') && specs('Staff').length === 2);
  await object('Alex', 'Staff');
  check('The next object automatically uses the saved design', box('Alex')?.design?.value.name === 'Staff card');
  check('One design reads each object’s own name', drawnText(box('Alex')).includes('Team {Name}: Alex') && drawnText(box('Staff')).includes('Team {Name}: Staff'));
  await value('Role', 'Designer');
  check('Editing a record field updates only that object’s merged text', drawnText(box('Alex')).includes('Role: Designer') && !drawnText(box('Staff')).includes('Designer'));
  if (stop === 'cards') return;
  await editDesign();
  const namePart = shapes().find(m => rowOf(m.id)?.text?.startsWith('Team'));
  await dragField('Role', namePart);
  check('Dragging a record field from the panel adds it to a graphical part', rowOf(namePart.id)?.text === 'Team \\{Name\\}: {Name}\n{Role}', rowOf(namePart.id)?.text);
  await click(`.part-rows [data-part="${namePart.id}"]`);
  await field('Department', true);
  check('New fields in a design are staged until Done', !specs('Staff').some(s => s.args[0].edge === 'Department'));
  await click(button('Done', '.dc-designbar button')); await wait(400);
  check('Done saves the new field with the design', specs('Staff').some(s => s.args[0].edge === 'Department') && box('Alex')?.design?.value.parts.some(p => TextTemplate.fields(p.text).includes('Department')));
  await value('Department', 'Product');
  check('The newly created field can be filled in immediately', drawnText(box('Alex')).includes('Product'));
  await editDesign();
  const part = shapes().find(m => rowOf(m.id)?.text?.startsWith('Team'));
  await click(`.part-rows [data-part="${part.id}"]`); await field('Temporary', true);
  await click(button('Discard', '.dc-designbar button')); await wait(300);
  check('Discard leaves no schema entry or merge field behind', !specs('Staff').some(s => s.args[0].edge === 'Temporary') && !box('Alex')?.design?.value.parts.some(p => TextTemplate.fields(p.text).includes('Temporary')));
  await connect(box('Alex'), box('Staff'));
  check('Dragging a connection between new objects offers a relationship form', visible($('.rr.new .form-acts')));
  const inputs = $$('.rr.new input.cell');
  for (const [i, text] of ['Reports To', 'Manager', 'Report'].entries()) { inputs[i].focus(); inputs[i].value = text; inputs[i].dispatchEvent(new Event('input', { bubbles: true })); await wait(60); }
  await click($('.rr.new .sel')); await menu('Manager above');
  await click($('.rr.new .form-acts .primary')); await wait(400);
  check('The GUI creates a schema-backed connection on a previously blank chart', App.scene.peek().marks.some(m => m.type === 'line' && App.state.peek()[m.record]?.args?.length === 2));
  await click('.chartmenu'); await menu('Save as…');
  check('Save includes the type, fields, design and connection', savedFile && JSON.parse(savedFile).changes.length > 0);
  await click('.chartmenu'); await menu('Open…'); await wait(500);
  check('Reopening retains both objects and their merged text', !!named('Alex') && !!named('Staff') && drawnText(box('Alex')).includes('Product'));
  check('Reopening retains a valid schema and reusable design', !Tree.schemaError(App.schema.peek()) && specs('Staff').some(s => s.args[0].edge === 'Department') && box('Staff')?.design?.value.name === 'Staff card');
  if (stop === 'finished') return;
  await sharedDesignAcrossViews();
  await richDrawingToType();
}
Shell.ready.then(run).catch(e => out.push({ name: 'GUI flow finishes', ok: false, detail: e.stack ?? String(e) })).finally(() => {
  const failed = out.filter(x => !x.ok);
  document.title = `builder test: ${out.length - failed.length} pass, ${failed.length} fail`;
  $('#out').textContent = [`${out.length - failed.length} passed, ${failed.length} failed`, ...out.map(x => `${x.ok ? 'pass' : 'FAIL'} ${x.name}${x.detail ? ': ' + x.detail : ''}`)].join('\n');
  if (stop && !failed.length) $('#out').hidden = true;
});
