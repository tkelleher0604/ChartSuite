// Literal extraction through the canvas, record panel, naming prompt and ordinary Undo.
const out = [], $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const check = (name, ok, detail = '') => { out.push({ name, ok: !!ok, detail }); if (!ok) throw new Error(name + ': ' + detail); };
const visible = el => el && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
const label = el => (el.querySelector('.label') ?? el).textContent.replace(/\s+/g, ' ').trim();
const button = (text, selector = 'button') => $$(selector).find(el => visible(el) && label(el) === text);
async function click(selector) { const el = typeof selector === 'string' ? $(selector) : selector; if (!visible(el) || el.disabled) throw new Error('Unavailable control: ' + selector); el.click(); await wait(180); }
const menu = text => click(button(text, '.float .menu-item'));
async function input(selector, value) { const el = $(selector); el.focus(); el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); await wait(80); }
async function key(el, key, options = {}) { el.focus(); el.dispatchEvent(new KeyboardEvent('keydown', { key, code: /^[a-z]$/i.test(key) ? 'Key' + key.toUpperCase() : key, bubbles: true, cancelable: true, ...options })); await wait(180); }
const box = name => App.scene.peek().marks.find(m => m.type === 'box' && App.notes.peek().nameOf(App.state.peek(), m.record) === name);
const editor = () => $('.dc-text-editor .words-in');
const source = name => box(name).design.value.parts.find(p => p.text && TextTemplate.fields(p.text).includes('Name')).text;
const field = (name, edge) => { const state = App.state.peek(); return state[Tree.entryAt(state, box(name).record, edge)]; };
const declared = edge => Object.values(App.schema.peek()).some(s => s.args?.[0].edge === edge);
async function selectText(el, text, occurrence = 0) {
  el.focus(); const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let node; (node = walk.nextNode());) {
    if (node.parentElement.closest('[data-bound]')) continue;
    let at = -1;
    while ((at = node.data.indexOf(text, at + 1)) >= 0) if (!occurrence--) {
      const range = document.createRange(); range.setStart(node, at); range.setEnd(node, at + text.length);
      getSelection().removeAllRanges(); getSelection().addRange(range); el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); await wait(120); return;
    }
  }
  throw new Error('Literal text is unavailable: ' + text);
}
async function pick(name) {
  const m = box(name), el = $(`.x6-node[data-cell-id="${m.id}"] path`), r = el.getBoundingClientRect(), p = { bubbles: true, cancelable: true, button: 0, clientX: r.x + 5, clientY: r.y + 5 };
  el.dispatchEvent(new MouseEvent('mousedown', p)); document.dispatchEvent(new MouseEvent('mouseup', p)); el.dispatchEvent(new MouseEvent('click', p)); await wait(180);
}
async function live(name) {
  await pick(name); const m = box(name), part = m.parts.find(p => p.texts.some(t => t.text.includes('Engineer')));
  const el = $(`.x6-node[data-cell-id="${m.id}"] [data-part="${part.part}"] [data-text]`), r = el.getBoundingClientRect();
  el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, button: 0, clientX: r.x + 8, clientY: r.y + 8 })); await wait(250);
}
async function run() {
  await wait(500); await click('.chartmenu'); await menu('New chart'); await click('[data-card="blank"]'); await input('dialog [aria-label="Name"]', 'Field extraction'); await click(button('Begin', 'dialog button')); await wait(250);
  await click('.dc-empty .design-card');
  const initial = $('.words-in'); initial.focus(); const all = document.createRange(); all.selectNodeContents(initial); getSelection().removeAllRanges(); getSelection().addRange(all); document.execCommand('insertText', false, 'Engineer / Engineer for '); initial.blur(); await wait(120);
  await click('.add-field'); await menu('Name');
  await click(button('Save as object type…', '.inspector button')); await input('dialog [aria-label="Object type"]', 'Staff'); await input('dialog [aria-label="First object name"]', 'Alice'); await click(button('Save', 'dialog button')); await wait(250);
  await click('[data-fb="add-object"]'); await input('dialog [aria-label="Name"]', 'Bob'); await input('dialog [aria-label="Object type"]', 'Staff'); await click(button('Add', 'dialog button')); await wait(250);
  await live('Alice'); await selectText(editor(), 'Engineer', 1);
  check('A literal selection exposes the keyboard extraction action beside its record', visible(button('Make selected text a field')) && !button('Make selected text a field').disabled && CanvasWords.selection.peek()?.text === 'Engineer');
  const original = source('Alice'); await click(button('Make selected text a field')); await input('dialog [aria-label="Field name"]', 'Role'); await click(button('Cancel', 'dialog button'));
  check('Cancel leaves the record, schema and literal paragraph unchanged', !field('Alice', 'Role') && !declared('Role') && source('Alice') === original && source('Bob') === original);
  await selectText(editor(), 'Engineer', 1); const transfer = new DataTransfer(), target = $('.field-extraction');
  editor().dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: transfer })); target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer })); target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer })); await wait(180);
  check('Dragging selected literal text into the record panel opens the naming prompt', !!$('dialog [aria-label="Field name"]') && $('dialog blockquote')?.textContent === 'Engineer');
  await input('dialog [aria-label="Field name"]', 'Role'); await click(button('Create field', 'dialog button')); await wait(250);
  check('The accepted selection becomes Alice’s field value and only that occurrence becomes a binding', field('Alice', 'Role')?.value === 'Engineer' && declared('Role') && source('Alice') === 'Engineer / {Role} for {Name}');
  check('Default extraction leaves the other record and its repeated literals intact', !field('Bob', 'Role') && source('Bob') === original);
  await key(editor(), 'Enter', { ctrlKey: true }); await click('[aria-label="Undo"]'); await wait(250);
  check('One Undo removes the new entry, declaration and template replacement together', !field('Alice', 'Role') && !declared('Role') && source('Alice') === original);
  await pick('Alice'); await click('[data-fb="like"]'); await live('Alice'); await selectText(editor(), 'Engineer', 0); await click(button('Make selected text a field'));
  check('An explicit broad extraction states its scope and affected count before acceptance', !!$('dialog [aria-label="Extraction scope"]') && $('dialog').textContent.includes('2 objects will receive this value'));
  await input('dialog [aria-label="Field name"]', 'Role'); await click(button('Create field', 'dialog button')); await wait(250); await key(editor(), 'Enter', { ctrlKey: true });
  check('Broad extraction assigns the selected value and binding to both matching records', ['Alice', 'Bob'].every(n => field(n, 'Role')?.value === 'Engineer' && source(n) === '{Role} / Engineer for {Name}'));
  await pick('Bob'); await click('[data-fb="own"]'); await input('.inspector [aria-label="Role"]', 'Designer'); await key($('.inspector [aria-label="Role"]'), 'Enter'); await wait(200);
  await pick('Alice'); await click('[data-fb="like"]'); await live('Alice'); await selectText(editor(), 'Engineer', 0); await click(button('Make selected text a field')); await input('dialog [aria-label="Field name"]', 'Role'); await click(button('Create field', 'dialog button'));
  check('A conflicting value blocks the complete broad extraction in the prompt', !!$('dialog [role="alert"]') && field('Alice', 'Role')?.value === 'Engineer' && field('Bob', 'Role')?.value === 'Designer');
  await click(button('Cancel', 'dialog button')); await key(editor(), 'Enter', { ctrlKey: true });
  check('Cancelling the conflict preserves the existing binding and both independent values', source('Alice') === '{Role} / Engineer for {Name}' && source('Bob') === '{Role} / Engineer for {Name}' && field('Bob', 'Role')?.value === 'Designer');
}
addEventListener('error', e => out.push({ name: 'No browser error', ok: false, detail: e.error?.stack ?? e.message }));
addEventListener('unhandledrejection', e => out.push({ name: 'No unhandled rejection', ok: false, detail: e.reason?.stack ?? String(e.reason) }));
Shell.ready.then(run).catch(e => out.push({ name: 'Field extraction flow completes', ok: false, detail: e.stack ?? String(e) })).finally(() => {
  const failed = out.filter(x => !x.ok).length; document.title = `field extraction GUI test: ${out.length - failed} pass, ${failed} fail`;
  $('#out').textContent = [`${out.length - failed} passed, ${failed} failed`, ...out.map(x => `${x.ok ? 'pass' : 'FAIL'} ${x.name}${x.detail ? ': ' + x.detail : ''}`)].join('\n');
});
