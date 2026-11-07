// Classification authoring from a blank chart. Writes go through visible controls only.
const out = [], $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const check = (name, ok, detail = '') => { out.push({ name, ok: !!ok, detail }); if (!ok) throw Error(name + ': ' + detail); };
const visible = el => el && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
const words = el => (el.querySelector('.label') ?? el).textContent.replace(/\s+/g, ' ').trim();
const button = (label, selector = 'button') => $$(selector).find(el => visible(el) && words(el) === label);
async function click(selector) { const el = typeof selector === 'string' ? $(selector) : selector; if (!visible(el) || el.disabled) throw Error('Unavailable control: ' + selector); el.click(); await wait(180); }
async function menu(label) { await click(button(label, '.float .menu-item')); }
async function input(selector, text) { const el = $(selector); if (!visible(el)) throw Error('Unavailable input: ' + selector); el.focus(); el.value = text; el.dispatchEvent(new Event('input', { bubbles: true })); await wait(80); }
async function key(el, key, options = {}) { el.focus(); el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options })); await wait(220); }
const records = () => App.state.peek(), nameOf = id => App.notes.peek().nameOf(records(), id);
const named = name => Object.keys(records()).find(id => records()[id].kind && nameOf(id) === name);
const entries = (id, label) => Object.entries(records()).filter(([, r]) => r.at === id && r.edge === label);
const category = name => entries(named(name), 'Category')[0]?.[0];
const row = label => $$('.inspector .row').find(r => words(r.querySelector('.k') ?? r) === label);
async function object(name) {
  await click('[data-fb="add-object"]'); await input('dialog [aria-label="Name"]', name); await input('dialog [aria-label="Object type"]', 'Object'); await click(button('Add', 'dialog button')); await wait(250);
}
async function choice(label, option) { await click(row(label)?.querySelector('button.sel')); await menu(option); }
async function pick(name) {
  const id = named(name), el = $(`.x6-node[data-cell-id="${id}"] path`), r = el.getBoundingClientRect(), point = { bubbles: true, cancelable: true, button: 0, clientX: r.x + 8, clientY: r.y + 8 };
  el.dispatchEvent(new MouseEvent('mousedown', point)); document.dispatchEvent(new MouseEvent('mouseup', point)); el.dispatchEvent(new MouseEvent('click', point)); await wait(220);
}
async function run() {
  await wait(500);
  await click('.chartmenu'); await menu('New chart'); await click('[data-card="blank"]'); await input('dialog [aria-label="Name"]', 'People and companies'); await click(button('Begin', 'dialog button')); await wait(400);
  await object('Ada');
  await click('.add-entry'); await menu('New choice'); await input('.draft [aria-label="Name"]', 'Category'); await key($('.draft [aria-label="Name"]'), 'Enter');
  await input('.draft [aria-label="New options"]', 'Person, Company'); await key($('.draft [aria-label="New options"]'), 'Enter'); await choice('Category', 'Person');
  check('A user can declare and choose classification options on a blank chart', records()[category('Ada')]?.choice === 'Person');
  await key(row('Category'), 'ContextMenu'); await menu('Add'); await menu('New value');
  await input('.draft [aria-label="Name"]', 'License'); await key($('.draft [aria-label="Name"]'), 'Enter');
  await input('.draft .v input, .draft .v textarea', 'P-101'); await key($('.draft .v input, .draft .v textarea'), 'Enter'); await wait(220);
  check('A field authored under a choice belongs to that classification entry', entries(category('Ada'), 'License')[0]?.[1].value === 'P-101');
  const conditional = Object.values(App.schema.peek()).find(s => s.args?.[0]?.edge === 'License');
  check('The GUI records a conditional schema field without creating another kind', conditional?.args[0].loc.out?.choice === 'Person' && Object.values(records()).filter(r => r.kind && r.kind !== 'View').every(r => r.kind === 'Object'));
  const box = App.scene.peek().byId.get(named('Ada')), source = row('License').querySelector('.k'), from = source.getBoundingClientRect(), to = $(`.x6-node[data-cell-id="${box.id}"]`).getBoundingClientRect();
  source.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: from.x + 10, clientY: from.y + 10 }));
  window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, buttons: 1, clientX: to.x + to.width / 2, clientY: to.y + to.height / 2 })); await wait(120);
  window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, clientX: to.x + to.width / 2, clientY: to.y + to.height / 2 })); await wait(250);
  check('A conditional field can be dragged from the inspector onto its canvas object', App.scene.peek().byId.get(named('Ada')).texts.some(t => t.text.includes('P-101')));
  await object('Casey'); await choice('Category', 'Person');
  check('Another object with the same category offers its conditional field', visible(row('License')) && !entries(category('Casey'), 'License').length);
  await input('.inspector [aria-label="License"]', 'P-202'); await key($('.inspector [aria-label="License"]'), 'Enter');
  check('Each category member retains its own field value', entries(category('Ada'), 'License')[0][1].value === 'P-101' && entries(category('Casey'), 'License')[0][1].value === 'P-202');
  await object('Bright Labs'); await choice('Category', 'Company');
  check('A different category does not offer Person fields', !visible(row('License')));
  await choice('Category', 'Person');
  check('Changing classification makes applicable fields immediately editable', visible(row('License')));
  await choice('Category', 'Company'); await pick('Ada');
  check('Changing another object’s classification preserves existing Person values', entries(category('Ada'), 'License')[0][1].value === 'P-101');
  // A stock gallery design applied to two classifications is not a shared custom identity.
  // Editing Person's card must not silently widen the target to Company or the Object kind.
  const card = name => App.scene.peek().byId.get(named(name));
  const cardWords = name => [card(name), ...(card(name)?.parts ?? [])].flatMap(p => p.texts ?? []).map(t => t.text).join('\n');
  async function stock(name, classification) {
    await pick(name); await click('[data-fb="groups"]');
    await click($$('.float .menu-item').find(el => words(el).startsWith(`Category: ${classification} (`)));
    await click('[data-fb="design"]'); await click('.picker.designs button.tile[aria-label="Header band"]'); await wait(250);
  }
  await stock('Ada', 'Person'); await stock('Bright Labs', 'Company');
  check('The GUI can apply the same stock design to two independent classification scopes', card('Ada').design.value.id === 'header' && card('Casey').design.value.id === 'header' && card('Bright Labs').design.value.id === 'header');
  const companyDesign = JSON.stringify(card('Bright Labs').design.value);
  await pick('Ada'); await click('[aria-label="Edit shared design"]'); await wait(350);
  check('The shared editor states the Person category instead of widening to Object', $('.design-reach')?.textContent.includes('Person') && !$('.design-reach')?.textContent.includes('Company'));
  const part = App.scene.peek().marks.find(m => m.type === 'shape' && App.shown.peek().item(App.chart.peek(), m.id).at(-1)?.part === 'name');
  await click(`.part-rows [data-part="${part.id}"]`);
  const editor = $('.words-in'); editor.focus(); const range = document.createRange(); range.selectNodeContents(editor); range.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(range);
  document.execCommand('insertText', false, 'Team member '); editor.blur(); await wait(180);
  await click(button('Done', '.dc-designbar button')); await wait(350);
  check('Editing a category’s shared stock design changes its members only', cardWords('Ada').includes('Team member Ada') && cardWords('Casey').includes('Team member Casey') && JSON.stringify(card('Bright Labs').design.value) === companyDesign);
  check('Editing a stock design gives that category an independent custom identity', card('Ada').design.value.id !== 'header' && card('Ada').design.value.id === card('Casey').design.value.id && card('Bright Labs').design.value.id === 'header');
}
addEventListener('error', e => out.push({ name: 'No uncaught browser errors', ok: false, detail: e.error?.stack ?? e.message }));
addEventListener('unhandledrejection', e => out.push({ name: 'No unhandled promises', ok: false, detail: e.reason?.stack ?? String(e.reason) }));
Shell.ready.then(run).catch(e => out.push({ name: 'Classification authoring finishes', ok: false, detail: e.stack ?? String(e) })).finally(() => {
  const failed = out.filter(x => !x.ok).length;
  document.title = `classification authoring test: ${out.length - failed} pass, ${failed} fail`;
  $('#out').textContent = [`${out.length - failed} passed, ${failed} failed`, ...out.map(x => `${x.ok ? 'pass' : 'FAIL'} ${x.name}${x.detail ? ': ' + x.detail : ''}`)].join('\n');
});
