// Create the chart and reusable type through controls. Model APIs below only inspect results.
const checks = [], $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const check = (name, ok, detail = '') => { checks.push({ name, ok: !!ok, detail }); if (!ok) throw Error(name + ': ' + detail); };
const visible = el => !!el && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
const label = el => (el.querySelector('.label') ?? el).textContent.replace(/\s+/g, ' ').trim();
const button = (text, selector = 'button') => $$(selector).find(el => visible(el) && label(el) === text);
async function click(selector) { const el = typeof selector === 'string' ? $(selector) : selector; if (!visible(el) || el.disabled) throw Error('Unavailable control: ' + selector); el.click(); await wait(180); }
const menu = text => click(button(text, '.float .menu-item'));
async function input(selector, value) { const el = $(selector); if (!visible(el)) throw Error('Unavailable input: ' + selector); el.focus(); el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); await wait(100); }
async function select(selector, value) { const el = $(selector); el.value = value; el.dispatchEvent(new Event('change', { bubbles: true })); await wait(140); }
async function key(el, key, options = {}) { el.focus(); el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options })); await wait(220); }
const box = name => App.scene.peek().marks.find(m => m.type === 'box' && App.notes.peek().nameOf(App.state.peek(), m.record) === name);
const editor = () => $('.dc-text-editor .words-in');
const body = name => box(name).design.value.parts.find(p => p.text?.includes('contact details'));
const declared = edge => Object.values(App.schema.peek()).filter(s => s.args?.[0]?.edge === edge && s.args[0].loc.kind === 'Contact');
const entry = (name, edge) => App.state.peek()[Tree.entryAt(App.state.peek(), box(name).record, edge)];
const point = el => { const r = el.getBoundingClientRect(); return { bubbles: true, cancelable: true, button: 0, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }; };
function caret(el) { el.focus(); const range = document.createRange(); range.selectNodeContents(el); range.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(range); el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); }
async function open(name, broad = false) {
  const m = box(name), path = $(`.x6-node[data-cell-id="${m.id}"] path`), p = point(path);
  path.dispatchEvent(new MouseEvent('mousedown', p)); document.dispatchEvent(new MouseEvent('mouseup', p)); path.dispatchEvent(new MouseEvent('click', p)); await wait(180);
  await click(broad ? '[data-fb="like"]' : '[data-fb="own"]');
  const text = $(`.x6-node[data-cell-id="${m.id}"] [data-part="${body(name).id}"] [data-text]`);
  text.dispatchEvent(new MouseEvent('dblclick', point(text))); await wait(260);
  if (!editor()) throw Error('No live paragraph for ' + name);
  caret(editor());
}
const close = () => key(editor(), 'Enter', { ctrlKey: true });
async function fieldDialog(name, datatype = 'text') {
  caret(editor()); await click('.dc-text-editor .add-field'); await menu('New field…');
  await input('dialog [aria-label="Field name"]', name); await select('dialog [aria-label="Field type"]', datatype);
}
async function create(name, datatype = 'text') { await fieldDialog(name, datatype); await click(button('Insert field', 'dialog button')); await wait(250); }
async function fill(token, value) {
  const el = editor().querySelector(`[data-token="${token}"] [data-bound-value]`);
  if (!el || el.contentEditable !== 'plaintext-only') throw Error('Field is not editable: ' + token);
  el.focus(); const range = document.createRange(); range.selectNodeContents(el); getSelection().removeAllRanges(); getSelection().addRange(range);
  document.execCommand('insertText', false, value); await wait(160);
}
async function undo() { await click('[aria-label="Undo"]'); await wait(180); }
async function run() {
  await wait(450); await click('.chartmenu'); await menu('New chart'); await click('[data-card="blank"]');
  await input('dialog [aria-label="Name"]', 'Create live fields'); await click(button('Begin', 'dialog button')); await wait(280);
  await click('.dc-empty .design-card');
  const words = $('.inspector .words-in'); caret(words); document.execCommand('insertText', false, ' contact details: '); words.blur(); await wait(160);
  await click(button('Save as object type…', '.inspector button'));
  await input('dialog [aria-label="Object type"]', 'Contact'); await input('dialog [aria-label="First object name"]', 'Alice'); await click(button('Save', 'dialog button')); await wait(300);
  await click('[data-fb="add-object"]'); await input('dialog [aria-label="Name"]', 'Bob'); await click(button('Add', 'dialog button')); await wait(250);
  check('The visible blank-card workflow creates two independently named reusable objects', !!box('Alice') && !!box('Bob') && body('Alice').text === body('Bob').text);
  const original = body('Alice').text;
  await open('Alice');
  let before = App.wb.changes().length;
  await fieldDialog('Canceled', 'number'); await click(button('Cancel', 'dialog button'));
  check('Canceling a live field dialog leaves schema, paragraph and history untouched', !declared('Canceled').length && body('Alice').text === original && App.wb.changes().length === before);
  await fieldDialog('Name', 'number');
  check('An incompatible existing field type is rejected before insertion', ! $('dialog [aria-label="Field name"]').checkValidity() && !!$('dialog .err') && App.wb.changes().length === before);
  await click(button('Cancel', 'dialog button'));
  await create('Notes');
  check('A named live text field and its binding are saved in one change', declared('Notes')[0]?.out.field === 'text' && body('Alice').text.includes('{Notes}') && App.wb.changes().length === before + 1);
  check('A new live field is blank and editable while other objects keep their wording', !entry('Alice', 'Notes') && editor().querySelector('[data-token="Notes"] [data-bound-value]')?.contentEditable === 'plaintext-only' && body('Bob').text === original);
  await fill('Notes', 'Remote research');
  check('The record panel mirrors a new field while its value is being typed', $('.inspector .canvas-text-handoff.live-value')?.textContent.includes('Remote research'));
  await close();
  check('Typing the new text field writes its record and synchronizes the panel', entry('Alice', 'Notes')?.value === 'Remote research' && $('.inspector [aria-label="Notes"]')?.value === 'Remote research');
  await undo();
  check('Undoing the value leaves its blank binding and declaration intact', !entry('Alice', 'Notes') && declared('Notes').length && body('Alice').text.includes('{Notes}'));
  await undo();
  check('One more Undo removes the new declaration and binding together', !declared('Notes').length && body('Alice').text === original && body('Bob').text === original);
  await open('Alice', true); before = App.wb.changes().length;
  await create('Capacity', 'number');
  check('Broad live field creation declares the chosen type and inserts on every scoped object atomically', declared('Capacity')[0]?.out.field === 'number' && ['Alice', 'Bob'].every(name => body(name).text.includes('{Capacity}')) && App.wb.changes().length === before + 1);
  await fill('Capacity', '24'); await close();
  check('Typing the new numeric binding updates the explicit scope with numeric values', ['Alice', 'Bob'].every(name => entry(name, 'Capacity')?.field === 'number' && entry(name, 'Capacity').value === 24));
  await undo();
  check('One Undo restores both new values to their schema-backed blank slots', ['Alice', 'Bob'].every(name => !entry(name, 'Capacity') && body(name).text.includes('{Capacity}')) && declared('Capacity').length);
  await undo();
  check('One Undo removes the broad binding insertion and schema together', !declared('Capacity').length && ['Alice', 'Bob'].every(name => body(name).text === original));
}
addEventListener('error', e => checks.push({ name: 'No uncaught browser errors', ok: false, detail: e.error?.stack ?? e.message }));
addEventListener('unhandledrejection', e => checks.push({ name: 'No unhandled promises', ok: false, detail: e.reason?.stack ?? String(e.reason) }));
Shell.ready.then(run).catch(e => checks.push({ name: 'Live field creation fixture finishes', ok: false, detail: e.stack ?? String(e) })).finally(() => {
  const failed = checks.filter(x => !x.ok).length;
  document.title = `live-field-create test: ${checks.length - failed} pass, ${failed} fail`;
  $('#out').textContent = [`${checks.length - failed} passed, ${failed} failed`, ...checks.map(x => `${x.ok ? 'pass' : 'FAIL'} ${x.name}${x.detail ? ': ' + x.detail : ''}`)].join('\n');
});
