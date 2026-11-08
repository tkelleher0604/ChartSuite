// Historical records seed the date-review boundary. All subsequent paragraph, value,
// scope and extraction edits use the rendered canvas/panel controls.
const checks = [], $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const check = (name, ok, detail = '') => { checks.push({ name, ok: !!ok, detail }); if (!ok) throw Error(name + ': ' + detail); };
const visible = el => !!el && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
const label = el => (el.querySelector('.label') ?? el).textContent.replace(/\s+/g, ' ').trim();
const button = (text, selector = 'button') => $$(selector).find(el => visible(el) && label(el) === text);
async function click(selector) { const el = typeof selector === 'string' ? $(selector) : selector; if (!visible(el) || el.disabled) throw Error('Unavailable control: ' + selector); el.click(); await wait(180); }
async function key(el, key, options = {}) { el.focus(); el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options })); await wait(220); }
async function input(selector, value) { const el = $(selector); el.focus(); el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); await wait(100); }
const box = id => App.scene.peek().marks.find(m => m.type === 'box' && m.record === id);
const editor = () => $('.dc-text-editor .words-in');
const point = el => { const r = el.getBoundingClientRect(); return { bubbles: true, cancelable: true, button: 0, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }; };
const stored = id => box(id).design.value.parts.find(p => p.id === 'paragraph').text;
async function open(id, broad = false) {
  const m = box(id), path = $(`.x6-node[data-cell-id="${m.id}"] path`), p = point(path);
  path.dispatchEvent(new MouseEvent('mousedown', p)); document.dispatchEvent(new MouseEvent('mouseup', p)); path.dispatchEvent(new MouseEvent('click', p)); await wait(180);
  await click(broad ? '[data-fb="like"]' : '[data-fb="own"]');
  const text = $(`.x6-node[data-cell-id="${m.id}"] [data-part="paragraph"] [data-text]`);
  text.dispatchEvent(new MouseEvent('dblclick', point(text))); await wait(280);
  if (!editor()) throw Error('The live paragraph did not open for ' + id);
  return CanvasBindings.active.peek();
}
async function close() { await key(editor(), 'Enter', { ctrlKey: true }); }
async function prefix(text) {
  const el = editor(); el.focus(); const range = document.createRange(); range.selectNodeContents(el); range.collapse(true);
  getSelection().removeAllRanges(); getSelection().addRange(range); document.execCommand('insertText', false, text); await wait(120);
}
async function field(token, value) {
  const el = editor().querySelector(`[data-token="${token}"] [data-bound-value]`); if (!el) throw Error('No live field: ' + token);
  el.focus(); const range = document.createRange(); range.selectNodeContents(el); getSelection().removeAllRanges(); getSelection().addRange(range);
  document.execCommand('insertText', false, value); await wait(130);
}
async function selectLiteral(text) {
  const el = editor(); el.focus(); const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let node; (node = walker.nextNode());) {
    if (node.parentElement.closest('[data-bound]')) continue;
    const at = node.data.indexOf(text); if (at < 0) continue;
    const range = document.createRange(); range.setStart(node, at); range.setEnd(node, at + text.length);
    getSelection().removeAllRanges(); getSelection().addRange(range); el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); await wait(150); return;
  }
  throw Error('No literal selection: ' + text);
}
async function extract() {
  await selectLiteral('Engineer'); await click(button('Make selected text a field'));
  await input('dialog [aria-label="Field name"]', 'Specialty'); await click(button('Create field', 'dialog button')); await wait(150);
}
const declared = edge => Object.values(App.schema.peek()).some(s => s.args?.[0]?.edge === edge);
async function run() {
  await wait(400); App.setViewing(false); App.begin({ template: 'blank', name: 'Pending paragraphs' }); await wait(200);
  const chart = App.chart.peek(), view = Shell.view.peek(), book = App.wb, tx = book.edit({ chart, who: 'Earlier author', when: '2020-01-01T00:00:00.000Z' });
  for (const tree of [{ kind: 'Member' }, ...['Name', 'Role'].map(edge => ({ out: { field: 'text' }, args: [{ edge, loc: { kind: 'Member' } }] }))]) tx.add('spec', { tree });
  for (const [id, name, role] of [['a', 'Alice', 'Engineer'], ['b', 'Bob', 'Designer']]) {
    tx.add('record', { kind: 'Member' }, id); tx.add('record', { at: id, edge: 'Name', field: 'text', value: name }, id + '-name');
    tx.add('record', { at: id, edge: 'Role', field: 'text', value: role, since: '2020-01-01' }, id + '-role');
  }
  const original = 'Engineer for {Name}: {Role}', design = { id: 'member-card', name: 'Member card', w: 300, h: 70, layout: 'stack', base: { Shape: 'rect', Fill: '#ffffff' }, parts: [{ id: 'paragraph', geometry: 'text', x: 0, y: 0, w: 1, h: 1, text: original, format: { Size: 12, Align: 'left' } }] };
  tx.note('Design', { kind: 'Member' }, design, { view }); tx.note('Dated', { kind: 'View' }, true); App.showMade(tx, ['a', 'b'], view);
  const setup = tx.commit(); if (typeof setup === 'string') throw Error(setup); await wait(350);
  const before = book.changes().length;
  await open('b'); await field('Role', 'Lead'); await close();
  check('A dated field edit stays pending after the live editor closes', App.pending.peek()?.source === 'bound-text' && !CanvasBindings.active.peek() && book.changes().length === before);
  await open('a', true); await prefix('Team: '); await close();
  const own = await open('a');
  check('Reopening recovers pending shared literal text and its field spans', own.source().text === 'Team: ' + original && editor().textContent.includes('Team: Engineer for Alice') && !!editor().querySelector('[data-token="Role"]'));
  await prefix('Personal: '); await close();
  const peer = await open('b');
  check('A peer sees the shared draft while the individual draft stays on its object', peer.source().text === 'Team: ' + original && peer.bindings.read('Role').text === 'Lead');
  await close(); const reopened = await open('a');
  check('Broad then own edits retain both target patterns after another reopen', reopened.source().text === 'Personal: Team: ' + original && App.pending.peek().boundAppenders.filter(a => a.canvasText).length === 2 && book.changes().length === before);
  await close(); await click('.pendbar .acts .primary'); await wait(220);
  check('One dated proposal commits the shared text, individual text and live value together', !App.pending.peek() && book.changes().length === before + 1 && stored('a') === 'Personal: Team: ' + original && stored('b') === 'Team: ' + original && App.state.peek()['b-role'].value === 'Lead');
  await click('[aria-label="Undo"]'); await wait(200);
  check('One user Undo restores both paragraph scopes and the old record value', stored('a') === original && stored('b') === original && App.state.peek()['b-role'].value === 'Designer');

  await open('b'); await field('Role', 'Manager'); await close(); await open('a'); await extract(); await close();
  const extracted = await open('a');
  check('Reopening a pending extraction recovers the token and its staged schema', extracted.source().text === '{Specialty} for {Name}: {Role}' && extracted.bindings.read('Specialty').editable && extracted.bindings.read('Specialty').text === 'Engineer' && !declared('Specialty'));
  await field('Specialty', 'Architect'); await close(); const again = await open('a');
  check('A reopened extracted field remains editable before the date is confirmed', again.bindings.read('Specialty').text === 'Architect' && App.pending.peek().boundAppenders.some(a => a.schemaTrees?.length) && !declared('Specialty'));
  await close(); await click(button('Discard', '.pendbar button')); await wait(180); const canceled = await open('a');
  check('Cancel removes pending schema and template from every new editor', canceled.source().text === original && !canceled.bindings.read('Specialty').editable && !declared('Specialty') && App.state.peek()['b-role'].value === 'Designer');
  await close();
  const beforeExtraction = book.changes().length;
  await open('b'); await field('Role', 'Manager'); await close(); await open('a'); await extract(); await close(); await open('a'); await field('Specialty', 'Architect'); await close();
  await click('.pendbar .acts .primary'); await wait(230);
  check('A reopened extraction commits schema, selected literal and its latest value atomically', book.changes().length === beforeExtraction + 1 && declared('Specialty') && stored('a') === '{Specialty} for {Name}: {Role}' && stored('b') === original && App.state.peek()[Tree.entryAt(App.state.peek(), 'a', 'Specialty')]?.value === 'Architect');
  await click('[aria-label="Undo"]'); await wait(180);
  check('One Undo removes extracted data and schema and restores the literal and dated value', !declared('Specialty') && !Tree.entryAt(App.state.peek(), 'a', 'Specialty') && stored('a') === original && App.state.peek()['b-role'].value === 'Designer');
}
addEventListener('error', e => checks.push({ name: 'No uncaught browser errors', ok: false, detail: e.error?.stack ?? e.message }));
addEventListener('unhandledrejection', e => checks.push({ name: 'No unhandled promises', ok: false, detail: e.reason?.stack ?? String(e.reason) }));
Shell.ready.then(run).catch(e => checks.push({ name: 'Pending binding fixture finishes', ok: false, detail: e.stack ?? String(e) })).finally(() => {
  const failed = checks.filter(x => !x.ok).length;
  document.title = `pending-bindings test: ${checks.length - failed} pass, ${failed} fail`;
  $('#out').textContent = [`${checks.length - failed} passed, ${failed} failed`, ...checks.map(x => `${x.ok ? 'pass' : 'FAIL'} ${x.name}${x.detail ? ': ' + x.detail : ''}`)].join('\n');
});
