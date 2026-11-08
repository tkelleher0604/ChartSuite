// Visual authoring acceptance: actions use rendered controls, pointer/keyboard events and selection.
// Model reads only verify the result; workbook writes all go through the GUI.
const out = [], $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const check = (name, ok, detail = '') => { out.push({ name, ok: !!ok, detail }); if (!ok) throw new Error(name + ': ' + detail); };
const visible = el => el && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
const words = el => (el.querySelector('.label') ?? el).textContent.replace(/\s+/g, ' ').trim();
const button = (label, selector = 'button') => $$(selector).find(el => visible(el) && words(el) === label);
async function click(selector) { const el = typeof selector === 'string' ? $(selector) : selector; if (!visible(el) || el.disabled) throw new Error('Unavailable control: ' + selector); el.click(); await wait(180); return el; }
async function menu(label) { return click(button(label, '.float .menu-item')); }
async function input(selector, value) { const el = $(selector); if (!visible(el)) throw new Error('Unavailable input: ' + selector); el.focus(); el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); await wait(80); }
async function key(el, key, options = {}) { el.focus(); el.dispatchEvent(new KeyboardEvent('keydown', { key, code: /^[a-z]$/i.test(key) ? 'Key' + key.toUpperCase() : key, bubbles: true, cancelable: true, ...options })); await wait(220); }
async function select(selector, value) { const el = $(selector); el.value = value; el.dispatchEvent(new Event('change', { bubbles: true })); await wait(150); }
const rowOf = id => App.shown.peek().item(App.chart.peek(), id).at(-1);
const box = name => App.scene.peek().marks.find(m => m.type === 'box' && App.notes.peek().nameOf(App.state.peek(), m.record) === name);
const readText = name => [box(name), ...box(name)?.parts ?? []].flatMap(m => m?.texts ?? []).map(t => t.text).join('\n');
const specs = edge => Object.values(App.schema.peek()).filter(s => s.args?.length === 1 && s.args[0].loc.kind === 'Room' && (!edge || s.args[0].edge === edge));
const shape = () => App.scene.peek().byId.get(Shell.selection.peek()[0]);
async function pickBox(name) {
  const m = box(name), el = $(`.x6-node[data-cell-id="${m.id}"] path`), r = el.getBoundingClientRect(), o = { bubbles: true, cancelable: true, button: 0, clientX: r.x + 8, clientY: r.y + 8 };
  el.dispatchEvent(new MouseEvent('mousedown', o)); document.dispatchEvent(new MouseEvent('mouseup', o)); el.dispatchEvent(new MouseEvent('click', o)); await wait(250);
}
async function object(name, kind = 'Room') {
  await click('[data-fb="add-object"]'); await input('dialog input[aria-label="Name"]', name); await input('dialog input[aria-label="Object type"]', kind); await click(button('Add', 'dialog button')); await wait(300);
}
async function value(label, value) { await input(`.inspector [aria-label="${label}"]`, value); await key($(`.inspector [aria-label="${label}"]`), 'Enter'); }
async function choice(label, option) { const row = $$('.inspector .row').find(r => words(r.querySelector('.k') ?? r) === label); await click(row.querySelector('button.sel')); await menu(option); }
async function paint(control, color) { await click(`[data-fb="${control}"]`); await input('.palette [aria-label="Color by its hex"]', color); await key($('.palette [aria-label="Color by its hex"]'), 'Enter'); }
async function shared() { await click('[aria-label="Edit shared design"]'); await wait(350); }
async function finish(keep = true) { await click(button(keep ? 'Done' : 'Discard', '.dc-designbar button')); await wait(350); }
async function layer(token = 'Name') {
  const q = App.scene.peek().marks.find(m => m.type === 'shape' && !rowOf(m.id)?.rest && TextTemplate.fields(rowOf(m.id)?.text).includes(token));
  if (!q) throw new Error('No layer reading ' + token);
  await click(`.part-rows [data-part="${q.id}"]`); return q;
}
function caret(editor, end = true) { editor.focus(); const r = document.createRange(); r.selectNodeContents(editor); r.collapse(!end); getSelection().removeAllRanges(); getSelection().addRange(r); editor.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); }
async function typePrefix(text) { const editor = $('.words-in'); caret(editor, false); document.execCommand('insertText', false, text); editor.blur(); await wait(180); }
async function newField(name, type = 'text', options = null) {
  await click(button('New field', '.design-field-palette button')); await input('dialog input[aria-label="Field name"]', name); await select('dialog select[aria-label="Field type"]', type);
  if (options) await input('dialog input[aria-label="Field options"]', options);
  await click(button('Insert field', 'dialog button')); await wait(200);
}
async function run() {
  await wait(500);
  if (new URLSearchParams(location.search).get('stop') === 'arranged') { await arrangedDrawing(); verifyScopedTextPlan(); return; }
  await click('.chartmenu'); await menu('New chart'); await click('[data-card="blank"]'); await input('dialog input[aria-label="Name"]', 'Rooms'); await click(button('Begin', 'dialog button')); await wait(400);
  await click('.dc-empty .design-card'); await wait(250);
  const editor = $('.words-in'); caret(editor); document.execCommand('insertText', false, '\nCapacity: '); editor.blur(); await wait(150);
  await click('.add-field'); await menu('New field…'); await input('dialog input[aria-label="Field name"]', 'Capacity'); await click(button('Insert field', 'dialog button'));
  await paint('fill', '#17324d');
  await click(button('Save as object type…', '.inspector button'));
  check('Saving a reusable card asks for type and first object, without a second design name or scope', !!$('dialog [aria-label="First object name"]') && !$('dialog [aria-label="Design name"]') && !$('dialog [aria-label="For"]'));
  await input('dialog [aria-label="Object type"]', 'Room'); await input('dialog [aria-label="First object name"]', 'Cedar'); await select('dialog [aria-label="Type of Capacity"]', 'number'); await click(button('Save', 'dialog button')); await wait(350);
  check('The first card is already named and its numeric field is declared', !!box('Cedar') && specs('Capacity')[0]?.out.field === 'number');
  const initialHeight = box('Cedar').h;
  check('A full-card backing is stored once as the design background', box('Cedar').design.value.base.Shape === 'rounded' && box('Cedar').design.value.base.Outline !== 'none' && box('Cedar').design.value.parts.filter(p => !p.rest).every(p => p.format?.Fill === 'none' && p.format?.Outline === 'none'));
  const automaticPart = box('Cedar').parts.find(p => p.texts.some(t => t.text.includes('Cedar'))).part;
  check('A promoted rectangular card label becomes a text layer with retained margins', box('Cedar').design.value.parts.find(p => p.id === automaticPart).geometry === 'text' && box('Cedar').design.value.parts.find(p => p.id === automaticPart).format.Inset.t >= 3.6);
  const ink = part => box('Cedar').parts.find(p => p.part === part)?.texts[0]?.look.Color;
  const liveInk = part => { const q = App.scene.peek().marks.find(m => m.type === 'shape' && rowOf(m.id)?.part === part); return q && $(`.x6-node[data-cell-id="${q.id}"] [data-text] tspan`)?.getAttribute('fill'); };
  check('Promoting a dark drawing preserves automatic readable text instead of freezing white', ink(automaticPart) === '#ffffff' && box('Cedar').design.value.parts.find(p => p.id === automaticPart).format.Color === undefined);
  await shared(); await click('[aria-label="Select card background"]'); await paint('fill', '#ffffff');
  check('Automatic text contrast updates on the canvas before Done', !!liveInk(automaticPart) && liveInk(automaticPart) !== '#ffffff');
  await finish();
  check('Changing the card background to light recomputes the automatic text color', ink(automaticPart) !== '#ffffff' && box('Cedar').design.value.parts.find(p => p.id === automaticPart).format.Color === undefined);
  await value('Capacity', '12'); await object('Maple'); await value('Capacity', '8');
  check('A second object inherits the card with its own values', readText('Cedar').includes('12') && readText('Maple').includes('8') && box('Cedar').design.value.id === box('Maple').design.value.id);
  await pickBox('Cedar'); const committedBook = App.wb; await shared();
  const editingChart = App.chart.peek(), editingBook = App.shown.peek(), editingLog = JSON.stringify(editingBook);
  $('.new-chart').click(); await wait(120);
  check('New chart is unavailable while a design draft is open', $('.new-chart').disabled && !$('dialog[open]') && !!$('.dc-designbar') && App.chart.peek() === editingChart);
  for (const action of ['New chart', 'New workbook', 'Duplicate chart', 'Delete chart', 'Open…']) {
    await click('.chartmenu'); await menu(action);
    check(`${action} from the menu preserves the active design draft`, !$('dialog[open]') && !!$('.dc-designbar') && App.chart.peek() === editingChart && App.shown.peek() === editingBook && JSON.stringify(editingBook) === editingLog);
  }
  await click('.chartmenu'); await menu('Rename'); await input('[aria-label="Chart name"]', 'Changed during design'); await key($('[aria-label="Chart name"]'), 'Enter');
  check('Renaming during a design draft cannot write a transient chart name', $('.chartmenu .name')?.textContent === 'Rooms' && JSON.stringify(editingBook) === editingLog && !!$('.dc-designbar'));
  await click(button('Export', '.titlebar button'));
  check('Export waits for a finished design instead of exporting temporary editing shapes', !$('dialog[open]') && !!$('.dc-designbar') && JSON.stringify(editingBook) === editingLog);
  check('The committed workbook remains separate from the temporary design draft', committedBook !== editingBook && !committedBook.rows(editingChart).some(r => r.value?.editing) && editingBook.rows(editingChart).some(r => r.value?.editing));
  check('Shared design editing states its reach before saving', $('.design-reach')?.textContent.includes('Room') && $('.design-reach').textContent.includes('Chart'));
  await layer();
  check('Fields remain available while a layer and its text are selected', visible($('.words-in')) && visible($('.design-field[data-field="Capacity"]')) && visible($('.part-rows')));
  check('Fields show the selected record’s sample values', $('.design-field[data-field="Capacity"] .field-sample')?.textContent === '12');
  await input('[aria-label="Find a merge field"]', 'cap');
  check('Search filters fields without changing the selected layer', $$('.design-field').length === 1 && $('.design-field')?.dataset.field === 'Capacity' && visible($('.words-in')));
  await input('[aria-label="Find a merge field"]', '');
  if (new URLSearchParams(location.search).get('stop') === 'palette') return;
  const original = rowOf(shape().id).text, at = $('.words-in'); caret(at, false); await click('.design-field[data-field="Capacity"]');
  check('Clicking a field inserts at the saved caret and preserves existing text', rowOf(shape().id).text === '{Capacity}' + original, rowOf(shape().id).text);
  const destination = shape(), beforeDrop = rowOf(destination.id).text, source = $('.design-field[data-field="Capacity"]'), from = source.getBoundingClientRect(), to = $(`.x6-node[data-cell-id="${destination.id}"]`).getBoundingClientRect();
  caret($('.words-in'), false); document.execCommand('insertText', false, 'Keep these words ');
  source.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: from.x + 12, clientY: from.y + 12 }));
  window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, buttons: 1, clientX: to.x + to.width / 2, clientY: to.y + to.height / 2 })); await wait(100);
  window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, clientX: to.x + to.width / 2, clientY: to.y + to.height / 2 })); await wait(220);
  check('Dragging a field preserves both committed text and a pending text draft', rowOf(destination.id).text === TextTemplate.append('Keep these words ' + beforeDrop, 'Capacity'));
  await newField('Temporary', 'number');
  check('A typed new field remains staged before Done', !specs('Temporary').length && $('.design-field[data-field="Temporary"] .field-state')?.textContent === 'New');
  await finish(false);
  check('Discard removes staged schema and restores the original shared design', !specs('Temporary').length && box('Cedar').design.value.parts.some(p => p.text === original));
  check('Discard returns to formatting only the selected object', $('[data-fb="own"]')?.getAttribute('aria-pressed') === 'true');
  await shared(); await click(button('Add text', '.parts-of button')); await wait(200);
  const emptyLayer = shape().id;
  check('Add text creates an editable layer on the card', !!$('.dc-edit') && !!rowOf(emptyLayer));
  if (button('Edit in panel', '.inspector button')) await click(button('Edit in panel', '.inspector button'));
  const sidebarText = $('.inspector .words-in');
  sidebarText.focus(); await wait(180);
  check('Moving from empty canvas text to the sidebar retains the layer and focus', !!rowOf(emptyLayer) && document.activeElement === sidebarText);
  document.execCommand('insertText', false, 'Amenities: '); sidebarText.blur(); await wait(200);
  check('Text entered in the sidebar after Add text is retained', TextTemplate.characters(rowOf(emptyLayer).text) === 'Amenities: ');
  await newField('Budget', 'number'); await newField('Building', 'choice', 'North, South'); await newField('Projector', 'tag');
  check('Number, choice and checkbox definitions remain staged together', !specs('Budget').length && !specs('Building').length && !specs('Projector').length);
  await finish();
  check('Done retains the text layer authored through the sidebar', readText('Cedar').includes('Amenities:'));
  check('The single background grows with added fields and surrounds every text layer', box('Cedar').h > initialHeight && box('Cedar').settings.Outline.value !== 'none' && box('Cedar').parts.every(p => p.y + p.h <= box('Cedar').y + box('Cedar').h + 1));
  check('Done returns to formatting only the selected object', $('[data-fb="own"]')?.getAttribute('aria-pressed') === 'true');
  check('Done saves numeric, choice and checkbox schema with the shared design', specs('Budget')[0]?.out.field === 'number' && specs('Building').map(s => s.out.choice).sort().join() === 'North,South' && specs('Projector').some(s => s.out.tag === true) && specs('Projector').some(s => s.out.tag === false));
  const sharedId = box('Maple').design.value.id;
  check('Both existing cards inherit the edited shared design', box('Cedar').design.value.id === sharedId && box('Maple').design.value.parts.some(p => TextTemplate.fields(p.text).includes('Budget')));
  await click('[aria-label="Undo"]'); await wait(250);
  check('One Undo removes the saved fields and design edit together', !specs('Budget').length && !specs('Building').length && !specs('Projector').length && box('Cedar').h <= initialHeight + 1);
  await click('[aria-label="Redo"]'); await wait(250);
  check('Redo restores the typed schema and growing background together', specs('Budget')[0]?.out.field === 'number' && box('Cedar').design.value.id === sharedId && box('Cedar').h > initialHeight);
  await shared(); const colored = await layer('Budget'), coloredPart = rowOf(colored.id).part; await paint('color', '#c00000');
  await click('[aria-label="Select card background"]'); await paint('fill', '#17324d');
  check('The open editor previews automatic white text and the explicit red text', liveInk(automaticPart) === '#ffffff' && liveInk(coloredPart) === '#c00000');
  await click('[aria-label="Undo"]'); await wait(200);
  check('One Undo reverses the background without a separate automatic-color change', !!liveInk(automaticPart) && liveInk(automaticPart) !== '#ffffff' && liveInk(coloredPart) === '#c00000');
  await click('[aria-label="Redo"]'); await wait(200);
  check('Redo restores the live background contrast in the same step', liveInk(automaticPart) === '#ffffff' && liveInk(coloredPart) === '#c00000');
  await finish();
  check('A dark background updates automatic text while keeping an explicit text color', ink(automaticPart) === '#ffffff' && ink(coloredPart) === '#c00000');
  await shared(); await click('[aria-label="Select card background"]'); await paint('fill', '#ffffff');
  check('The live light-background preview preserves an explicitly chosen color', !!liveInk(automaticPart) && liveInk(automaticPart) !== '#ffffff' && liveInk(coloredPart) === '#c00000');
  await finish();
  check('Returning to a light background keeps automatic and explicit colors distinct', ink(automaticPart) !== '#ffffff' && ink(coloredPart) === '#c00000' && box('Cedar').design.value.parts.find(p => p.id === coloredPart).format.Color === '#c00000');
  await value('Budget', '120'); await choice('Building', 'North'); await pickBox('Maple'); await choice('Building', 'South'); await object('Birch'); await value('Capacity', '6'); await choice('Building', 'North');
  await pickBox('Cedar'); await click('[data-fb="groups"]');
  const north = $$('.float .menu-item').find(el => words(el).includes('North'));
  check('A choice-defined group is available as an explicit formatting scope', !!north);
  await click(north); await click('[data-fb="design"]'); await click(button('Edit design', '.picker.designs button')); await wait(300); await layer();
  check('A narrower group edit clearly names its scope', $('.design-reach').textContent.includes('North'));
  await typePrefix('North wing\n'); await finish();
  const northId = box('Cedar').design.value.id;
  check('Editing a narrower group forks its design without changing other rooms', northId !== sharedId && box('Birch').design.value.id === northId && box('Maple').design.value.id === sharedId);
  check('Literal group text repeats while merge values remain independent', readText('Cedar').includes('North wing') && readText('Birch').includes('North wing') && !readText('Maple').includes('North wing') && readText('Cedar').includes('12') && readText('Birch').includes('6'));
  await pickBox('Cedar'); await value('Capacity', '123456789012345');
  const roomSeparated = name => { const m = box(name), a = m.parts.find(p => p.part === automaticPart), b = m.parts.find(p => p.part === coloredPart); return b.y >= a.y + a.h - 1; };
  check('Growing the original card label and its Capacity value keeps following text clear', ['Cedar', 'Birch'].every(roomSeparated));
  await value('Capacity', '12');
  await pickBox('Cedar'); await click('[data-fb="own"]');
  let m = box('Cedar'), part = m.parts.find(p => p.texts.some(t => t.text.includes('Cedar')));
  const otherBold = JSON.stringify(box('Birch').parts.find(p => p.part === part.part).texts.map(t => t.look.Bold));
  let text = $(`.x6-node[data-cell-id="${m.id}"] [data-part="${part.part}"] [data-text]`); text = text.querySelector('tspan') ?? text;
  let r = text.getBoundingClientRect(), point = { bubbles: true, cancelable: true, button: 0, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 };
  text.dispatchEvent(new MouseEvent('mousedown', point)); text.dispatchEvent(new MouseEvent('mouseup', point)); text.dispatchEvent(new MouseEvent('click', point)); await wait(200);
  await click('[data-fb="bold"]');
  check('Formatting the selected text creates a visible record-specific override', box('Cedar').parts.find(p => p.part === part.part)?.texts.some(t => t.look.Bold === true) && JSON.stringify(box('Birch').parts.find(p => p.part === part.part).texts.map(t => t.look.Bold)) === otherBold);
  m = box('Cedar'); text = $(`.x6-node[data-cell-id="${m.id}"] [data-part="${part.part}"] [data-text]`); text = text.querySelector('tspan') ?? text; r = text.getBoundingClientRect();
  text.dispatchEvent(new MouseEvent('dblclick', { ...point, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 })); await wait(550);
  check('Double-clicking mixed text opens its live paragraph and resolved values on the canvas', !Designs.editing.peek() && visible($('.dc-text-editor .words-in')) && $$('.dc-text-editor [data-bound]').some(el => el.textContent.includes('Cedar')));
  await key($('.dc-text-editor .words-in'), 'Enter', { ctrlKey: true });
  await pickBox('Cedar');
  await click('[data-fb="own"]'); await click('[data-fb="design"]'); await click(button('Edit design', '.picker.designs button')); await wait(250); await layer();
  check('Explicit own design editing selects its layer and states that only this record will change', !!Designs.editing.peek() && rowOf(shape().id)?.part === part.part && $('.design-reach').textContent.includes('Cedar only'));
  const galleryCount = App.notes.peek().value('Designs', { kind: 'View' }).list.length;
  await typePrefix('Cedar only\n'); await finish();
  check('An individual edit preserves prior text formatting and affects only that object', box('Cedar').parts.find(p => p.part === part.part)?.texts.some(t => t.look.Bold === true) && readText('Cedar').includes('Cedar only') && !readText('Birch').includes('Cedar only') && !readText('Maple').includes('Cedar only'));
  check('An individual fork does not add duplicate designs to the gallery', App.notes.peek().value('Designs', { kind: 'View' }).list.length === galleryCount);
  const ownId = box('Cedar').design.value.id, cedar = box('Cedar').record;
  const otherNotes = () => JSON.stringify(App.shown.peek().rows(App.chart.peek()).filter(row => 'note' in row && row.pattern?.id === cedar && row.label !== 'Design').map(row => [row.label, row.value]));
  const beforeRejoin = otherNotes();
  await shared();
  check('Shared editing from an individual fork finds the narrower shared group', Designs.editing.peek().d.id === northId && $('.design-reach').textContent.includes('North'));
  await finish(false);
  const originalView = App.scene.peek().view, originalTab = $('.sheets .sheet[aria-selected="true"]');
  originalTab.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })); await wait(150); await menu('Duplicate'); await wait(350);
  check('Duplicating a view retains the private design on the same object in both views', App.scene.peek().view !== originalView && App.notes.peek().notes('Design').filter(n => n.value?.id === ownId && n.pattern?.id === cedar).length === 2);
  await pickBox('Cedar'); await shared();
  check('A private fork copied across views still opens the wider shared group', Designs.editing.peek().d.id === northId && $('.design-reach').textContent.includes('North') && App.views.peek().every(v => $('.design-reach').textContent.includes(v.name)));
  await layer(); await typePrefix('Across views\n'); await finish();
  check('The shared edit updates the copied view while retaining its private fork', readText('Birch').includes('Across views') && readText('Cedar').includes('Cedar only') && !readText('Cedar').includes('Across views') && !readText('Maple').includes('Across views'));
  const tab = document.getElementById('tab-' + originalView), tabBox = tab.getBoundingClientRect(), tabPoint = { bubbles: true, cancelable: true, button: 0, clientX: tabBox.x + tabBox.width / 2, clientY: tabBox.y + tabBox.height / 2 };
  tab.dispatchEvent(new PointerEvent('pointerdown', tabPoint)); window.dispatchEvent(new PointerEvent('pointerup', tabPoint)); await wait(350);
  check('The same shared edit reaches the original view without touching its private fork', App.scene.peek().view === originalView && readText('Birch').includes('Across views') && readText('Cedar').includes('Cedar only') && !readText('Cedar').includes('Across views'));
  await click('[aria-label="Undo"]'); await click('[aria-label="Undo"]'); await wait(300);
  check('Undo restores the shared text and removes the duplicate view independently', App.views.peek().length === 1 && readText('Birch').includes('North wing') && !readText('Birch').includes('Across views') && readText('Cedar').includes('Cedar only') && otherNotes() === beforeRejoin);
  await pickBox('Cedar');
  await click(button('Use shared design', '.inspector button'));
  check('Use shared design rejoins only this object and retains its data and other formatting', box('Cedar').design.value.id === northId && !readText('Cedar').includes('Cedar only') && readText('Cedar').includes('120') && readText('Birch').includes('North wing') && box('Maple').design.value.id === sharedId && otherNotes() === beforeRejoin);
  check('A group design cannot be removed by the single-object rejoin action', !button('Use shared design', '.inspector button') && box('Birch').design.value.id === northId);
  await click('[aria-label="Undo"]'); await wait(250);
  check('One Undo restores the individual design after rejoining', box('Cedar').design.value.id === ownId && readText('Cedar').includes('Cedar only') && otherNotes() === beforeRejoin);
  await click('[aria-label="Redo"]'); await wait(250);
  await shared(); await layer(); await typePrefix('Updated north\n'); await finish();
  check('Later shared edits reach the rejoined object and preserve the group boundary', readText('Cedar').includes('Updated north') && readText('Birch').includes('Updated north') && !readText('Maple').includes('Updated north') && otherNotes() === beforeRejoin);
  await click(button('Export', '.titlebar button')); await wait(400);
  const preview = $('dialog .ex-drawn svg'), backgrounds = [...preview.querySelectorAll('path')].filter(p => p.getAttribute('stroke') === box('Cedar').settings.Outline.value && p.getAttribute('fill') !== 'none');
  const exportedText = [...preview.querySelectorAll('text')].filter(t => /Cedar|Amenities:|120/.test(t.textContent));
  const inside = (text, path) => { const t = text.getBoundingClientRect(), b = path.getBoundingClientRect(); return t.left >= b.left - 1 && t.right <= b.right + 1 && t.top >= b.top - 1 && t.bottom <= b.bottom + 1; };
  check('Export preview keeps one growing background per card and contains the added text', backgrounds.length === 3 && exportedText.length >= 4 && exportedText.every(t => backgrounds.some(p => inside(t, p))), `${backgrounds.length} backgrounds; ${exportedText.length} text rows`);
  await click(button('Cancel', 'dialog button'));
  await click('.chartmenu'); await menu('Save as…'); await click('.chartmenu'); await menu('Open…'); await wait(350);
  check('Save and reopen preserve scoped literal text, independent values and typed fields', readText('Cedar').includes('Updated north') && readText('Birch').includes('Updated north') && readText('Maple').includes('8') && specs('Budget')[0]?.out.field === 'number' && specs('Building').length === 2);
  await object('Annex', 'Annex'); await click('[data-fb="like"]'); await click('[data-fb="design"]'); await click('.picker.designs button.tile[aria-label="Room"]');
  const annexFields = edge => Object.values(App.schema.peek()).filter(s => s.args?.length === 1 && s.args[0].loc.kind === 'Annex' && s.args[0].edge === edge);
  check('A custom design can be shared with a kind missing one of its fields', box('Annex').design.value.id === box('Maple').design.value.id && !annexFields('Budget').length);
  await pickBox('Maple'); await shared(); await layer();
  await click(button('New field', '.design-field-palette button')); await input('dialog input[aria-label="Field name"]', 'Budget');
  check('Explicit reuse starts with the existing field datatype', $('dialog select[aria-label="Field type"]').value === 'number');
  await select('dialog select[aria-label="Field type"]', 'text'); await click(button('Insert field', 'dialog button'));
  check('A conflicting reused datatype stays in the dialog with an inline explanation', !!$('dialog') && $('dialog [role="alert"]')?.textContent.includes('Budget') && $('dialog [role="alert"]').textContent.includes('Room') && !annexFields('Budget').length);
  await select('dialog select[aria-label="Field type"]', 'number'); await click(button('Insert field', 'dialog button'));
  check('Explicit reuse stages the declaration even when the source kind already has it', Designs.editing.peek().newFields.get('budget')?.datatype === 'number' && !annexFields('Budget').length);
  await finish(false);
  check('Discard also drops staged reuse on a kind where the field was missing', !annexFields('Budget').length && specs('Budget').length === 1);
  await shared(); const reusedLayer = await layer('Budget'), reusedText = rowOf(reusedLayer.id).text;
  await click('.words-in .word-chip[data-token="Budget"]'); await menu('New field…'); await input('dialog input[aria-label="Field name"]', 'Budget'); await select('dialog select[aria-label="Field type"]', 'number'); await click(button('Insert field', 'dialog button'));
  check('Explicit reuse can replace a field chip without changing the design text', rowOf(reusedLayer.id).text === reusedText);
  await finish();
  check('Done saves a missing declaration even when the visual design is unchanged', annexFields('Budget')[0]?.out.field === 'number' && specs('Budget').length === 1);
  await click('[aria-label="Undo"]'); await wait(250);
  check('The schema-only reuse is one undoable change', !annexFields('Budget').length && specs('Budget').length === 1);
  await shared(); await layer(); await newField('Budget', 'number'); await newField('Building', 'choice', 'North, South, West'); await finish();
  check('Done declares reused fields across all shared kinds without duplicating existing fields', annexFields('Budget').length === 1 && annexFields('Budget')[0].out.field === 'number' && specs('Budget').length === 1 && annexFields('Building').map(s => s.out.choice).sort().join() === 'North,South,West' && specs('Building').map(s => s.out.choice).sort().join() === 'North,South,West');
  await click('[aria-label="Undo"]'); await wait(250);
  check('One Undo removes only the new shared declarations and preserves the prior schema', !annexFields('Budget').length && !annexFields('Building').length && specs('Budget').length === 1 && specs('Building').length === 2);
  await click('[aria-label="Redo"]'); await wait(250); await pickBox('Annex'); await value('Budget', '90');
  check('The newly declared field is editable through the other kind’s form and renders its own value', readText('Annex').includes('90') && !readText('Maple').includes('90'));
  await stackedTextFlow();
  await arrangedDrawing();
  verifyScopedTextPlan();
}
async function stackedTextFlow() {
  await click('.chartmenu'); await menu('New chart'); await click('[data-card="org-chart"]'); await input('dialog input[aria-label="Name"]', 'Text flow'); await click(button('Begin', 'dialog button')); await wait(350);
  for (const [name, title] of [['Alex', 'Lead'], ['Morgan', 'Director'], ['Casey', 'Designer']]) { await object(name, 'Person'); await value('Title', title); }
  await pickBox('Alex'); await shared(); await click(button('Add text', '.parts-of button')); await wait(150);
  const teamRow = shape().id, teamPart = rowOf(teamRow).part, editor = $('.words-in'); editor.focus(); document.execCommand('insertText', false, 'Team member'); editor.blur(); await wait(180);
  await click('[aria-label="Select card background"]'); await newField('Focus', 'text');
  const focusPart = rowOf(shape().id).part;
  await finish();
  for (const [name, focus] of [['Alex', 'Roadmap'], ['Morgan', 'Research'], ['Casey', 'Delivery']]) { await pickBox(name); await value('Focus', focus); }
  await pickBox('Alex'); await shared();
  const team = App.scene.peek().marks.find(m => m.type === 'shape' && rowOf(m.id)?.part === teamPart);
  await click(`.part-rows [data-part="${team.id}"]`); await click('.design-field[data-field="Name"]'); await click('.design-field[data-field="Title"]');
  const live = part => App.scene.peek().marks.find(m => m.type === 'shape' && rowOf(m.id)?.part === part);
  check('Adding merge-field lines moves the following text layer before Done', live(focusPart).y >= live(teamPart).y + live(teamPart).h - 1, JSON.stringify({ scale: App.scene.peek().page.scale, layers: [teamPart, focusPart].map(id => { const m = live(id); return { source: rowOf(m.id).text, y: m.y, height: m.h, authoredHeight: rowOf(m.id).h, size: m.look.Size }; }) }));
  const after = part => box('Alex').parts.find(p => p.part === part), separated = name => { const m = box(name), a = m.parts.find(p => p.part === teamPart), b = m.parts.find(p => p.part === focusPart); return b.y >= a.y + a.h - 1; };
  await finish();
  check('Expanded shared text stays separate from the following field on every object', ['Alex', 'Morgan', 'Casey'].every(separated));
  const band = box('Alex').parts.find(p => p.part === 'band');
  check('Moving the remaining fields into text layers removes the empty overflow gap', after(teamPart).y - (band.y + band.h) < 12);
  await pickBox('Morgan'); await value('Title', 'Principal director of research and international customer experience'); await value('Focus', 'Long-term customer research and product discovery');
  check('Longer values on a different object grow the card without text collisions', ['Alex', 'Morgan', 'Casey'].every(separated) && readText('Morgan').includes('international customer experience'));
  await click(button('Add manager', '.inspector button')); await menu('Alex'); await wait(250); await pickBox('Morgan');
  const designBefore = structuredClone(box('Morgan').design.note.value), shortBefore = box('Casey').h, scaleBefore = App.scene.peek().page.scale;
  const sizeBefore = box('Casey').parts.find(p => p.part === teamPart).texts[0].look.Size;
  await shared(); await layer('Name'); await click('.design-field[data-field="Manager\'s name"]'); await finish();
  const designAfter = box('Morgan').design.note.value, modelPart = (d, id) => d.parts.find(p => p.id === id), geometry = p => [p.x, p.y, p.w, p.h].join();
  check('Editing a long-text instance preserves the shared template frame and part geometry', designAfter.h === designBefore.h && designAfter.w === designBefore.w && [teamPart, focusPart].every(id => geometry(modelPart(designAfter, id)) === geometry(modelPart(designBefore, id))));
  check('One related-field line does not inflate shorter cards or change their authored typography', box('Casey').h <= shortBefore + 30 / scaleBefore && App.scene.peek().page.scale >= scaleBefore * 0.8 && Math.abs(box('Casey').parts.find(p => p.part === teamPart).texts[0].look.Size - sizeBefore) < 0.01, JSON.stringify({ shortBefore, shortAfter: box('Casey').h, scaleBefore, scaleAfter: App.scene.peek().page.scale, sizeBefore, sizeAfter: box('Casey').parts.find(p => p.part === teamPart).texts[0].look.Size }));
  check('The related field keeps its binding and all records remain separated', readText('Morgan').includes('Alex') && ['Alex', 'Morgan', 'Casey'].every(separated));
  check('Automatic preview geometry is absent from the saved shared design', !JSON.stringify(designAfter).includes('"flow"'));
  const beforeManual = structuredClone(designAfter);
  await shared(); await layer('Name'); await typePrefix('Review\n');
  const following = App.scene.peek().marks.find(m => m.type === 'shape' && rowOf(m.id)?.part === focusPart);
  await click(`.part-rows [data-part="${following.id}"]`);
  const topControl = $('.inspector [aria-label="Top"]'), widthControl = $('.inspector [aria-label="Width"]');
  await value('Top', String(parseFloat(topControl.value) + 12)); await value('Width', String(parseFloat(widthControl.value) + 24));
  await finish();
  const manual = box('Morgan').design.note.value;
  check('Explicit positioning and resizing after automatic growth remain authored geometry', modelPart(manual, focusPart).y > modelPart(beforeManual, focusPart).y && modelPart(manual, focusPart).w > modelPart(beforeManual, focusPart).w && !JSON.stringify(manual).includes('"flow"'));
  await click('[aria-label="Undo"]'); await wait(250);
  check('One Undo restores both the prior template text and its geometry', JSON.stringify(box('Morgan').design.note.value) === JSON.stringify(beforeManual));
  const beforeNewLayer = structuredClone(box('Morgan').design.note.value), shortWithFields = box('Casey').h, newLayerScale = App.scene.peek().page.scale;
  await shared(); await click('[aria-label="Select card background"]'); await newField('Review note', 'text');
  const newPart = rowOf(shape().id).part;
  await finish();
  const afterNewLayer = box('Morgan').design.note.value;
  check('Adding a separate layer from a long-text object preserves every existing template frame', beforeNewLayer.parts.every(p => geometry(modelPart(afterNewLayer, p.id)) === geometry(p)) && afterNewLayer.w === beforeNewLayer.w && afterNewLayer.h === beforeNewLayer.h);
  await pickBox('Casey'); await value('Review note', 'Ready');
  const shortCard = box('Casey'), shortFocus = shortCard.parts.find(p => p.part === focusPart), shortNew = shortCard.parts.find(p => p.part === newPart);
  check('A new layer follows the shorter object’s content without inheriting the long-object gap', shortNew.y >= shortFocus.y + shortFocus.h - 1 && shortNew.y - shortFocus.y - shortFocus.h < 12 / newLayerScale && shortCard.h <= shortWithFields + 35 / newLayerScale && !JSON.stringify(afterNewLayer).includes('"flow"'));
  await click('.chartmenu'); await menu('Save as…'); await click('.chartmenu'); await menu('Open…'); await wait(350);
  check('Reload preserves the expanded text flow and independent field values', ['Alex', 'Morgan', 'Casey'].every(separated) && readText('Alex').includes('Roadmap') && readText('Morgan').includes('product discovery') && readText('Casey').includes('Delivery'));
}
async function arrangedDrawing() {
  await click('.chartmenu'); await menu('New chart'); await click('[data-card="blank"]'); await input('dialog input[aria-label="Name"]', 'Arranged cards'); await click(button('Begin', 'dialog button')); await wait(300);
  const textFrame = async (literal, token, x, align, fresh = false) => {
    await click('[data-fb="insert"]'); await menu('Text box'); await wait(150);
    const typing = $('.dc-edit'); typing.focus(); document.execCommand('insertText', false, literal); await key(typing, 'Enter', { ctrlKey: true });
    await value('Width', '150'); await value('Height', '54'); await value('Left', String(x)); await value('Top', '180');
    await click('[data-fb="paragraph"]'); await click(`[aria-label="Align ${align}"]`); await key($('.dc'), 'Escape');
    const panel = $('.inspector .words-in'); caret(panel); await click('.inspector .add-field'); await menu(fresh ? 'New field…' : token);
    if (fresh) { await input('dialog [aria-label="Field name"]', token); await click(button('Insert field', 'dialog button')); }
    await wait(150); return shape().id;
  };
  const leftId = await textFrame('Contact: ', 'Name', 180, 'left'), rightId = await textFrame('Capacity: ', 'Capacity', 370, 'right', true);
  await click('[data-fb="insert"]'); await click('.insert .shapes button[aria-label="Rectangle"]'); await key($('.dc'), 'Enter');
  await value('Width', '340'); await value('Height', '8'); await value('Left', '180'); await value('Top', '165'); await paint('fill', '#17324d');
  const decorationId = shape().id, source = [leftId, rightId, decorationId].map(id => App.scene.peek().byId.get(id)), l = Math.min(...source.map(p => p.x)), top = Math.min(...source.map(p => p.y)), w = Math.max(...source.map(p => p.x + p.w)) - l, h = Math.max(...source.map(p => p.y + p.h)) - top;
  const expected = source.map(p => ({ x: (p.x - l) / w, y: (p.y - top) / h, w: p.w / w, align: rowOf(p.id).format?.Align }));
  await key($('.dc'), 'a', { ctrlKey: true }); await key($('.dc'), 'g', { ctrlKey: true });
  await click(button('Save as object type…', '.inspector button')); await input('dialog [aria-label="Object type"]', 'Studio'); await input('dialog [aria-label="First object name"]', 'Aster'); await select('dialog [aria-label="Type of Capacity"]', 'number'); await click(button('Save', 'dialog button')); await wait(300);
  const saved = box('Aster').design.value, parts = [saved.parts.find(p => TextTemplate.fields(p.text).includes('Name')), saved.parts.find(p => TextTemplate.fields(p.text).includes('Capacity')), saved.parts.find(p => !p.rest && !p.text)];
  check('Saving an assembled drawing preserves its separate text frames and decoration', saved.layout === 'free' && parts.every((p, i) => p && ['x', 'y', 'w'].every(k => Math.abs(p[k] - expected[i][k]) < 0.001)) && parts[0].format.Align === 'left' && parts[1].format.Align === 'right', JSON.stringify({ expected, layout: saved.layout, parts: saved.parts }));
  await value('Capacity', '24'); await object('Birch Studio', 'Studio'); await value('Capacity', '40');
  check('Arranged reusable cards keep constant words and bind fields independently', readText('Aster').includes('Contact: Aster') && readText('Aster').includes('Capacity: 24') && readText('Birch Studio').includes('Contact: Birch Studio') && readText('Birch Studio').includes('Capacity: 40'));
  await shared();
  check('The card layout control shows the arrangement that was saved', $('[aria-label="Card layout"]').value === 'free');
  await select('[aria-label="Card layout"]', 'stack'); await finish(false);
  check('Discarding a layout change preserves the authored free arrangement', box('Aster').design.value.layout === 'free');
  await shared(); await select('[aria-label="Card layout"]', 'stack'); await finish();
  check('Choosing Stack text saves one shared layout choice', box('Aster').design.value.layout === 'stack' && box('Birch Studio').design.value.layout === 'stack');
  await click('[aria-label="Undo"]'); await wait(250);
  check('One Undo restores the free layout and its authored frames', box('Aster').design.value.layout === 'free' && JSON.stringify(box('Aster').design.value.parts) === JSON.stringify(saved.parts));
  await pickBox('Aster');
  const beforeOther = box('Aster'), placed = beforeOther.parts.filter(p => !saved.parts.find(q => q.id === p.part)?.rest).map(p => ({ id: p.part, x: p.x - beforeOther.x, y: p.y - beforeOther.y, w: p.w, h: p.h }));
  await click('.inspector .add-entry'); await menu('New value'); await input('.draft [aria-label="Name"]', 'Location'); await key($('.draft [aria-label="Name"]'), 'Enter');
  await input('.draft .v input, .draft .v textarea', 'Garden office'); await key($('.draft .v input, .draft .v textarea'), 'Enter'); await wait(250);
  await click($('.inspector [aria-label="Location"]').closest('.row').querySelector('.onchart'));
  const withOther = box('Aster'), footer = withOther.parts.find(p => saved.parts.find(q => q.id === p.part)?.rest);
  check('A new unmatched field grows the automatic footer without moving the free arrangement', readText('Aster').includes('Garden office') && footer.h > 8 && withOther.h > beforeOther.h && placed.every(p => { const q = withOther.parts.find(q => q.part === p.id); return Math.abs(q.x - withOther.x - p.x) < 0.1 && Math.abs(q.y - withOther.y - p.y) < 0.1 && Math.abs(q.w - p.w) < 0.1 && Math.abs(q.h - p.h) < 0.1; }), JSON.stringify({ beforeHeight: beforeOther.h, afterHeight: withOther.h, footerHeight: footer.h, placed, after: withOther.parts.map(p => ({ id: p.part, x: p.x - withOther.x, y: p.y - withOther.y, w: p.w, h: p.h })) }));
}
// Inspect the command emitted after a deferred data review, without changing the workbook.
// The cards and fields used here were all built through the preceding visible controls.
function verifyScopedTextPlan() {
  const m = box('Aster'), part = m.design.value.parts.find(p => TextTemplate.fields(p.text).includes('Name'));
  const records = [m.record, box('Birch Studio').record], targetView = 'captured-original-view';
  const captured = Designs.scope(m, { own: true, records, view: targetView }, 'Edit text'), planned = new Map();
  const initial = { over: { base: { Fill: '#f0f0f0' }, parts: { [part.id]: { format: { Color: '#123456' }, runs: [{ from: 0, to: 4, Bold: true }] } } } };
  const keyOf = (pattern, view) => `${view}:${Tree.key(pattern)}`;
  const tx = { noteAt: (label, pattern, { view }) => planned.get(keyOf(pattern, view)) ?? { value: initial }, note: (label, pattern, value, { view }) => planned.set(keyOf(pattern, view), { label, pattern, value, view }) };
  Designs.say(tx, m, part.id, { text: 'Scoped {Name}', runs: undefined }, captured);
  Designs.say(tx, m, part.id, { format: { Bold: false } }, captured);
  const writes = [...planned.values()];
  check('A deferred text command retains its captured view and every selected record', writes.length === 2 && writes.every(n => n.view === targetView) && records.every(id => writes.some(n => n.pattern.id === id)));
  check('Text and formatting in one transaction preserve each other and unrelated overrides', writes.every(n => n.value.over.base.Fill === '#f0f0f0' && n.value.over.parts[part.id].text === 'Scoped {Name}' && n.value.over.parts[part.id].format.Color === '#123456' && n.value.over.parts[part.id].format.Bold === false));
  const saved = JSON.parse(JSON.stringify(writes[0].value)), original = { ...m.design.value, parts: m.design.value.parts.map(p => p.id === part.id ? { ...p, runs: [{ from: 0, to: 4, Bold: true }] } : p) };
  check('Cleared inherited rich ranges remain cleared after serialization', Scene.overDesign(original, saved.over).parts.find(p => p.id === part.id).runs.length === 0);
}
addEventListener('error', e => out.push({ name: 'No browser error', ok: false, detail: e.error?.stack ?? e.message }));
addEventListener('unhandledrejection', e => out.push({ name: 'No unhandled rejection', ok: false, detail: e.reason?.stack ?? String(e.reason) }));
Shell.ready.then(run).catch(e => out.push({ name: 'Design editor flow completes', ok: false, detail: e.stack ?? String(e) })).finally(() => {
  const failed = out.filter(x => !x.ok).length; document.title = `design editor test: ${out.length - failed} pass, ${failed} fail`;
  $('#out').textContent = [`${out.length - failed} passed, ${failed} failed`, ...out.map(x => `${x.ok ? 'pass' : 'FAIL'} ${x.name}${x.detail ? ': ' + x.detail : ''}`)].join('\n');
  if (new URLSearchParams(location.search).has('stop') && !failed) $('#out').hidden = true;
});
