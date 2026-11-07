// Paragraph authoring through the visible GUI. Model APIs are read only assertions.
const out = [], $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const check = (name, ok, detail = '') => { out.push({ name, ok: !!ok, detail }); if (!ok) throw new Error(name + ': ' + detail); };
const visible = el => el && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
const words = el => (el.querySelector('.label') ?? el).textContent.replace(/\s+/g, ' ').trim();
const button = (label, selector = 'button') => $$(selector).find(el => visible(el) && words(el) === label);
async function click(selector) {
  const el = typeof selector === 'string' ? $(selector) : selector;
  if (!visible(el) || el.disabled) throw new Error('Unavailable control: ' + selector);
  el.click(); await wait(180); return el;
}
async function menu(label) { return click(button(label, '.float .menu-item')); }
async function input(selector, value) { const el = $(selector); if (!visible(el)) throw new Error('Unavailable input: ' + selector); el.focus(); el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); await wait(80); }
async function key(el, key, options = {}) { el.focus(); el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options })); await wait(220); }
async function select(selector, value) { const el = $(selector); el.value = value; el.dispatchEvent(new Event('change', { bubbles: true })); await wait(160); }
const rowOf = id => App.shown.peek().item(App.chart.peek(), id).at(-1);
const shape = () => App.scene.peek().byId.get(Shell.selection.peek()[0]);
const box = name => App.scene.peek().marks.find(m => m.type === 'box' && App.notes.peek().nameOf(App.state.peek(), m.record) === name);
const readText = name => [box(name), ...box(name)?.parts ?? []].flatMap(m => m?.texts ?? []).map(t => t.text).join('\n');
const editor = () => $('.dc-text-editor .words-in');
function point(el) { const r = el.getBoundingClientRect(); return { bubbles: true, cancelable: true, button: 0, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }; }
async function pickBox(name) { const m = box(name), el = $(`.x6-node[data-cell-id="${m.id}"] path`), p = point(el); el.dispatchEvent(new MouseEvent('mousedown', p)); document.dispatchEvent(new MouseEvent('mouseup', p)); el.dispatchEvent(new MouseEvent('click', p)); await wait(240); }
async function editShape(id) { const el = $(`.x6-node[data-cell-id="${id}"] [data-text]`) ?? $(`.x6-node[data-cell-id="${id}"] path`); el.dispatchEvent(new MouseEvent('dblclick', point(el))); await wait(350); }
async function value(label, text) { await input(`.inspector [aria-label="${label}"]`, text); await key($(`.inspector [aria-label="${label}"]`), 'Enter'); }
function range(el, from, to = from) {
  el.focus(); const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), r = document.createRange(); let at = 0, began = false;
  for (let n; (n = walk.nextNode());) { if (n.parentElement.closest('[data-token]')) continue; if (!began && from <= at + n.length) { r.setStart(n, from - at); began = true; } if (began && to <= at + n.length) { r.setEnd(n, to - at); break; } at += n.length; }
  const s = getSelection(); s.removeAllRanges(); s.addRange(r); el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
}
function afterText(text) {
  const el = editor(), walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let literal = '';
  for (let n; (n = walk.nextNode());) if (!n.parentElement.closest('[data-token]')) literal += n.data;
  const at = literal.indexOf(text); if (at < 0) throw new Error('No literal text at caret: ' + text);
  range(el, at + text.length);
}
async function type(text) { document.execCommand('insertText', false, text); await wait(100); }
async function field(name, fresh = false) {
  await click('.dc-text-editor .add-field'); await menu(fresh ? 'New field…' : name);
  if (fresh) { await input('dialog input[aria-label="Field name"]', name); await click(button('Insert field', 'dialog button')); }
  await wait(180);
}
async function finish() { await click(button('Done', '.dc-designbar button')); await wait(350); }
async function liveCard(name, keepSelection = false) {
  if (!keepSelection) await pickBox(name);
  const m = box(name), part = m.parts.find(p => p.texts.some(t => t.text.includes('Please contact')));
  const text = $(`.x6-node[data-cell-id="${m.id}"] [data-part="${part.part}"] [data-text]`);
  text.dispatchEvent(new MouseEvent('dblclick', point(text))); await wait(300);
  return part.part;
}
async function boundValue(token, text) {
  const host = editor()?.querySelector(`[data-token="${token}"] [data-bound-value]`);
  if (!host) throw new Error('No editable resolved value: ' + token);
  host.focus(); const range = document.createRange(); range.selectNodeContents(host); getSelection().removeAllRanges(); getSelection().addRange(range);
  document.execCommand('insertText', false, text); await wait(160); return host;
}
async function run() {
  await wait(500); await click('.chartmenu'); await menu('New chart'); await click('[data-card="blank"]'); await input('dialog input[aria-label="Name"]', 'Project notes'); await click(button('Begin', 'dialog button')); await wait(300);
  await click('.dc-empty .design-card'); const drawing = shape().id; await editShape(drawing);
  check('A mixed text box opens directly on the canvas with an atomic field chip', visible(editor()) && editor().querySelector('[data-token="Name"]'));
  check('Only the canvas owns the live text draft', !$('.inspector .words-in') && !!button('Editing on canvas', '.inspector button'));
  const r = document.createRange(); r.selectNodeContents(editor()); getSelection().removeAllRanges(); getSelection().addRange(r);
  await type('Please contact  about .\nTarget: . Notes: {keep literal}.');
  afterText('Please contact '); await field('Name');
  afterText(' about '); await field('Project', true);
  afterText('Target: '); await field('Due date', true);
  check('Fields sit inside sentences with surrounding punctuation and a second paragraph', rowOf(drawing).text === 'Please contact {Name} about {Project}.\nTarget: {Due date}. Notes: \\{keep literal\\}.', rowOf(drawing).text);
  check('The editor contains exactly the inserted fields; typed braces stay ordinary words', editor().querySelectorAll('.word-chip').length === 3 && editor().textContent.includes('{keep literal}'));
  range(editor(), 0, 14); await click('[data-fb="bold"]');
  if (new URLSearchParams(location.search).get('stop') === 'paragraph') return;
  await key(editor(), 'Enter', { ctrlKey: true });
  check('Finishing in-place editing returns to the canvas and retains a literal-text style range', !editor() && rowOf(drawing).runs?.some(r => r.from === 0 && r.to === 14 && r.Bold));
  await click(button('Save as object type…', '.inspector button')); await input('dialog [aria-label="Object type"]', 'Contact'); await input('dialog [aria-label="First object name"]', 'Maya'); await select('dialog [aria-label="Type of Due date"]', 'date'); await click(button('Save', 'dialog button')); await wait(300);
  check('A paragraph drawing becomes a reusable record type with typed schema', !!box('Maya') && Object.values(App.schema.peek()).some(s => s.args?.[0]?.loc.kind === 'Contact' && s.args[0].edge === 'Due date' && s.out.field === 'date'));
  await value('Project', 'the launch'); await value('Due date', '2026-12-01');
  await click('[data-fb="add-object"]'); await input('dialog [aria-label="Name"]', 'Noah'); await click(button('Add', 'dialog button')); await wait(250); await value('Project', 'the review'); await value('Due date', '2026-12-15');
  check('The same constant paragraph renders independent field values for each object', readText('Maya').includes('Please contact Maya about the launch.') && readText('Noah').includes('Please contact Noah about the review.') && ['Maya', 'Noah'].every(n => readText(n).includes('Notes: {keep literal}.')));
  await pickBox('Maya'); await click('[aria-label="Edit shared design"]'); await wait(300);
  const layer = App.scene.peek().marks.find(m => m.type === 'shape' && rowOf(m.id)?.text?.startsWith('Please contact'));
  await click(`.part-rows [data-part="${layer.id}"]`); await editShape(layer.id);
  check('An existing shared paragraph reopens on the canvas with its fields and formatting', !!editor() && editor().querySelectorAll('.word-chip').length === 3 && rowOf(layer.id).runs?.some(r => r.Bold));
  afterText('Please contact '); await click('.design-field[data-field="Name"]');
  check('The persistent palette inserts at the canvas caret rather than appending a new line', rowOf(layer.id).text.startsWith('Please contact {Name}{Name} about'), rowOf(layer.id).text);
  await key(editor(), 'z', { ctrlKey: true });
  check('Undo in the canvas editor removes just the inserted field', rowOf(layer.id).text.startsWith('Please contact {Name} about'));
  await key(editor(), 'y', { ctrlKey: true });
  check('Redo restores the inline field at its original position', rowOf(layer.id).text.startsWith('Please contact {Name}{Name} about'));
  // Delete a whole field chip through its normal menu, then continue literal text at the caret.
  await click(editor().querySelector('.word-chip')); await menu('Take it out');
  check('Removing an inline chip preserves the surrounding sentence', rowOf(layer.id).text.startsWith('Please contact {Name} about'));
  afterText(' about '); await type('the team working on ');
  await key(editor(), 'z', { ctrlKey: true });
  check('Text and field edits share one Undo sequence while editing a paragraph', !editor().textContent.includes('the team working on'));
  await key(editor(), 'y', { ctrlKey: true });
  await click(button('Edit in panel', '.inspector button')); await wait(150);
  check('Moving to the panel commits the canvas draft once and opens the same paragraph', !editor() && $('.inspector .words-in')?.textContent.includes('the team working on ') && rowOf(layer.id).text.includes('the team working on {Project}'));
  await editShape(layer.id); afterText('Notes: '); await type('Shared note. '); await key(editor(), 'Escape');
  check('Escape finishes canvas text without discarding the typed words', !editor() && rowOf(layer.id).text.includes('Notes: Shared note.'));
  await finish();
  check('The shared paragraph edit reaches both objects without changing their data', readText('Maya').includes('the team working on the launch') && readText('Noah').includes('the team working on the review') && ['Maya', 'Noah'].every(n => readText(n).includes('Shared note.')));
  await click('[aria-label="Undo"]'); await wait(250);
  check('One Undo restores the complete prior shared paragraph', ['Maya', 'Noah'].every(n => !readText(n).includes('Shared note.') && !readText(n).includes('the team working on')));
  await click('[aria-label="Redo"]'); await wait(250);
  await click('.chartmenu'); await menu('Save as…'); await click('.chartmenu'); await menu('Open…'); await wait(350);
  check('Save and reopen retain literal braces, multiple inline fields and shared edits', ['Maya', 'Noah'].every(n => readText(n).includes('Notes: Shared note. {keep literal}.')) && readText('Maya').includes('the launch') && readText('Noah').includes('the review'));
  await liveValues();
  if (new URLSearchParams(location.search).get('stop') === 'live') return;
  await panelScopes();
}
async function liveValues() {
  const part = await liveCard('Maya'), source = box('Maya').design.value.parts.find(p => p.id === part).text;
  check('Ordinary paragraph editing displays resolved values without entering the design sandbox', !!editor()?.querySelector('[data-token="Project"] [data-bound-value]') && editor().textContent.includes('the launch') && !Designs.editing.peek());
  await boundValue('Project', 'the revised launch');
  check('Typing in a bound value highlights its panel row and mirrors the live draft', !!$('.inspector .row.lit') && $('.inspector .live-value')?.textContent.includes('the revised launch') && $('.bound-field-status')?.textContent.includes('Project'));
  if (new URLSearchParams(location.search).get('stop') === 'live') return;
  afterText('Notes: '); await wait(200);
  check('Leaving a bound value updates its record while preserving the template and other record', readText('Maya').includes('the revised launch') && readText('Noah').includes('the review') && box('Maya').design.value.parts.find(p => p.id === part).text === source);
  const sameEditor = editor(), beforePart = box('Maya').parts.find(p => p.part === part);
  await boundValue('Project', 'extended launch details '.repeat(36).trim()); afterText('Notes: ');
  const caretNode = getSelection().anchorNode, caretOffset = getSelection().anchorOffset;
  await wait(300);
  const canvas = Canvas.active.peek(), reflowed = canvas.scene().byId.get(box('Maya').id).parts.find(p => p.part === part), overlay = CanvasWords.active.peek().element;
  const at = canvas.graph.localToGraph(reflowed.x, reflowed.y), zoom = canvas.graph.zoom(), near = (a, b) => Math.abs(a - b) < 1;
  check('A longer bound value reflows the card and keeps its editor over the current paragraph',
    (Math.abs(reflowed.h - beforePart.h) > 1 || Math.abs(reflowed.w - beforePart.w) > 1)
      && near(parseFloat(overlay.style.left), at.x) && near(parseFloat(overlay.style.top), at.y)
      && near(parseFloat(overlay.style.width), Math.max(120, reflowed.w * zoom)) && near(parseFloat(overlay.style.minHeight), Math.max(28, reflowed.h * zoom)),
    JSON.stringify({ before: [beforePart.w, beforePart.h], after: [reflowed.w, reflowed.h], actual: [overlay.style.left, overlay.style.top, overlay.style.width, overlay.style.minHeight], at, zoom }));
  check('Card reflow retains the same editor and literal caret', editor() === sameEditor && getSelection().anchorNode === caretNode && getSelection().anchorOffset === caretOffset && editor().contains(caretNode));
  await boundValue('Project', 'the revised launch'); afterText('Notes: '); await wait(200);
  await key(editor(), 'Enter', { ctrlKey: true });
  await value('Project', 'the panel revision');
  check('Editing the record panel updates the same value in the canvas paragraph', readText('Maya').includes('the panel revision') && !readText('Noah').includes('the panel revision'));
  await liveCard('Maya'); await boundValue('Due date', 'not a date'); await key(editor(), 'Enter', { ctrlKey: true });
  check('An invalid field value keeps the editor open with an explanation and does not change the record', !!editor() && !!$('.bound-error')?.textContent && !readText('Maya').includes('not a date'));
  await boundValue('Due date', '2026-12-03'); await key(editor(), 'Enter', { ctrlKey: true });
  check('Correcting a live date commits the parsed record value and closes normally', !editor() && App.state.peek()[Tree.entryAt(App.state.peek(), box('Maya').record, 'Due date')]?.value === '2026-12-03');
  await liveCard('Maya'); await boundValue('Project', ''); afterText('Notes: '); await wait(200);
  check('Clearing a live value retains the binding and schema for entering it again', !!editor()?.querySelector('[data-token="Project"]') && box('Maya').design.value.parts.find(p => p.id === part).text.includes('{Project}') && !Tree.entryAt(App.state.peek(), box('Maya').record, 'Project'));
  await boundValue('Project', 'the restored launch'); await key(editor(), 'Enter', { ctrlKey: true });
  check('An empty bound span accepts a new value into the same field', readText('Maya').includes('the restored launch'));
  await click('[data-fb="like"]'); await liveCard('Maya');
  check('A broader scope is explicit before a live value is changed', CanvasBindings.focus.peek()?.scope?.recordIds.length === 2 || FormatBar.scope(true)?.own === false);
  await boundValue('Project', 'the shared programme'); await key(editor(), 'Enter', { ctrlKey: true });
  check('A scoped bound-value edit changes both records while retaining their individual names', ['Maya', 'Noah'].every(n => readText(n).includes('the shared programme') && readText(n).includes(n)));
  await click('[aria-label="Undo"]'); await wait(200);
  check('One Undo restores every previous value from a scoped record edit', readText('Maya').includes('the restored launch') && readText('Noah').includes('the review'));
  await click('[data-fb="like"]'); await liveCard('Maya'); afterText('Notes: '); await type('For everyone. '); await key(editor(), 'Enter', { ctrlKey: true });
  check('The same broader scope applies literal wording without changing field values', ['Maya', 'Noah'].every(n => readText(n).includes('For everyone.')) && readText('Maya').includes('the restored launch') && readText('Noah').includes('the review'));
  await liveCard('Maya'); range(editor(), 0, 14); await click('[data-fb="bold"]'); await key(editor(), 'Enter', { ctrlKey: true });
  await click('.chartmenu'); await menu('Save as…'); await click('.chartmenu'); await menu('Open…'); await wait(300);
  check('Clearing an inherited range survives save/reopen along with live values', box('Maya').design.value.parts.find(p => p.id === part).runs?.every(r => !r.Bold) && readText('Maya').includes('the restored launch') && readText('Noah').includes('For everyone.'));
}
async function panelScopes() {
  await click('[data-fb="add-object"]'); await input('dialog [aria-label="Name"]', 'Rowan'); await click(button('Add', 'dialog button')); await wait(220);
  await click('[data-fb="own"]'); await value('Project', 'the separate task');
  const names = ['Maya', 'Noah', 'Rowan'], before = Object.fromEntries(names.map(name => [name, readText(name)]));
  await pickBox('Maya'); await click('[data-fb="like"]');
  check('The record panel announces a deliberately broadened data scope', $('.object-data-label')?.textContent.includes('For 3 objects'));
  await value('Project', 'the panel programme');
  check('One panel value edit reaches the explicit full scope and preserves each name', names.every(name => readText(name).includes('the panel programme') && readText(name).includes(name)));
  await click('[aria-label="Undo"]'); await wait(220);
  check('One Undo restores the different original values from a broad panel edit', names.every(name => readText(name) === before[name]));
  await pickBox('Maya'); await click('[data-fb="like"]'); await value('Project', '');
  check('Clearing through the scoped panel removes each value but keeps every merge binding', names.every(name => !Tree.entryAt(App.state.peek(), box(name).record, 'Project') && box(name).design.value.parts.some(p => p.text?.includes('{Project}'))));
  await click('[aria-label="Undo"]'); await wait(220);
  check('One Undo restores all scoped clears without altering templates', names.every(name => readText(name) === before[name]));
  await pickBox('Maya'); await click('[data-fb="own"]'); await value('Name', 'Mira');
  check('The selected-only name edit leaves other records and their names unchanged', !!box('Mira') && !box('Maya') && readText('Noah') === before.Noah && readText('Rowan') === before.Rowan);
  await click('[aria-label="Undo"]'); await wait(220);
  await pickBox('Maya'); await click('[data-fb="own"]'); await value('Project', '');
  check('A selected-only panel clear works on an undated chart and leaves other values alone', !Tree.entryAt(App.state.peek(), box('Maya').record, 'Project') && readText('Noah') === before.Noah && readText('Rowan') === before.Rowan);
  await click('[aria-label="Undo"]'); await wait(220);
  await pickBox('Maya'); await click('[data-fb="own"]');
  const second = box('Noah'), el = $(`.x6-node[data-cell-id="${second.id}"] path`), p = { ...point(el), shiftKey: true };
  el.dispatchEvent(new MouseEvent('mousedown', p)); document.dispatchEvent(new MouseEvent('mouseup', p)); el.dispatchEvent(new MouseEvent('click', p)); await wait(220);
  check('Shift selection captures two objects without broadening to their type', Shell.selection.peek().length === 2 && FormatBar.scope(true)?.own && FormatBar.scope(true).records.length === 2);
  await liveCard('Maya', true); afterText('Notes: '); await type('Selected pair. '); await key(editor(), 'Enter', { ctrlKey: true });
  check('A live literal edit follows the two-object selection and excludes an unselected matching object', ['Maya', 'Noah'].every(name => readText(name).includes('Selected pair.')) && !readText('Rowan').includes('Selected pair.') && ['Maya', 'Noah'].every(name => readText(name).includes(name)));
  await click('[aria-label="Undo"]'); await wait(220);
  check('One Undo restores both selected paragraphs and leaves the third untouched', names.every(name => readText(name) === before[name]));
}
addEventListener('error', e => out.push({ name: 'No browser error', ok: false, detail: e.error?.stack ?? e.message }));
addEventListener('unhandledrejection', e => out.push({ name: 'No unhandled rejection', ok: false, detail: e.reason?.stack ?? String(e.reason) }));
Shell.ready.then(run).catch(e => out.push({ name: 'Canvas paragraph flow completes', ok: false, detail: e.stack ?? String(e) })).finally(() => {
  const failed = out.filter(x => !x.ok).length; document.title = `canvas paragraph test: ${out.length - failed} pass, ${failed} fail`;
  $('#out').textContent = [`${out.length - failed} passed, ${failed} failed`, ...out.map(x => `${x.ok ? 'pass' : 'FAIL'} ${x.name}${x.detail ? ': ' + x.detail : ''}`)].join('\n');
  if (new URLSearchParams(location.search).has('stop') && !failed) $('#out').hidden = true;
});
