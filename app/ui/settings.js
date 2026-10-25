// Settings: your name and the theme; where the workbook is kept, with export and import; the SharePoint
// connection; this chart; and, last, clearing this browser's copy. The layout is Vercel's (see
// docs/ui-research.md): the sections listed on the left, and one column of cards, each with a title, a line
// on what it's for, its control, and a Save in its footer where a change is consequential. Preferences save
// at once. Where the workbook is kept is store.js's business; this page shows it and acts on it.

const SECTIONS = [['you', 'You'], ['workbook', 'Workbook'], ['sharepoint', 'SharePoint'], ['chart', 'This chart'], ['danger', 'Danger zone']];
const SP_FIELDS = ['mode', 'tenantId', 'clientId', 'siteUrl', 'library', 'workbookFolder', 'redirectUri'];
const COLLEAGUE = 'Margaret A. Chen';

const settings = {
  drafts: {},          // what's typed and not yet saved, by field, so a re-render keeps it
  errors: {},          // an action's failure, shown in its card, by card
  busy: null,          // the card whose action is under way
  account: undefined,  // who's signed in to SharePoint: undefined until known, null for no one
  test: null,          // the connection test's steps so far: [{ ok, text }]
  section: 'you',      // the section the list marks as current
  pinned: null,        // a section picked from the list, current until the page is scrolled by hand
  importMode: 'replace',
  dialog: false,       // a dialog is open, so a re-render waits for it to close
  stale: false,
};

// ---- Small parts ----

const draft = (key, saved) => settings.drafts[key] ?? saved;
const ownName = () => currentUser() === 'You' ? '' : currentUser();
const spConfig = () => SharePoint.connector.config();
// Whether a card has changes to save, by its Save button's key.
const PENDING = {
  name: () => clean(draft('name', ownName())) !== ownName(),
  chart: () => !!clean(draft('chart', chartInUse().name)) && clean(draft('chart', chartInUse().name)) !== chartInUse().name,
  sp: () => SP_FIELDS.some(k => `sp.${k}` in settings.drafts && clean(settings.drafts[`sp.${k}`]) !== (spConfig()[k] ?? '')),
};
const saveButton = (cmd, key) => `<button class="btn btn-sm btn-primary" data-cmd="${cmd}" data-saves="${key}"${PENDING[key]() ? '' : ' disabled'}>Save</button>`;
const button = (cmd, label, { primary = false, danger = false, disabled = false, title = '', data = {} } = {}) =>
  `<button class="btn btn-sm${primary ? ' btn-primary' : ''}${danger ? ' btn-danger' : ''}" data-cmd="${cmd}"${Object.entries(data).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('')}${disabled || settings.busy ? ' disabled' : ''}${title ? ` title="${esc(title)}"` : ''}>${esc(label)}</button>`;

// When something happened, as a phrase: "at 3:42 PM" today, "on Oct 12 at 3:42 PM" before.
function moment(stamp) {
  if (!stamp) return '';
  const t = new Date(stamp), time = t.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return t.toDateString() === new Date().toDateString() ? `at ${time}` : `on ${Parts.date(t.toLocaleDateString('en-CA'))} at ${time}`;
}

// A card: its title and a line on what it's for, with its control beside them (aside) or below (body); rows
// run edge to edge beneath; the footer holds a note and the card's Save.
function card({ title, desc = '', aside = '', body = '', rows = '', note = '', foot = '', error = '', tone = '' }) {
  return `<div class="set-card${tone ? ` is-${tone}` : ''}">
    <div class="set-main">
      <div class="set-head"><h3 class="set-title">${title}</h3>${desc ? `<p class="set-desc">${desc}</p>` : ''}</div>
      ${aside ? `<div class="set-aside">${aside}</div>` : ''}
    </div>
    ${body ? `<div class="set-body">${body}</div>` : ''}
    ${error ? `<p class="set-error" role="alert">${esc(error)}</p>` : ''}
    ${rows ? `<div class="set-rows">${rows}</div>` : ''}
    ${note || foot ? `<div class="set-foot"><span class="set-note">${note}</span>${foot}</div>` : ''}
  </div>`;
}
// A row in a card: a name, a line on it, and its actions on the right.
const row = ({ name, desc, actions = '', extra = '', current = false }) => `<div class="set-row${current ? ' is-current' : ''}">
    <div class="set-row-text"><div class="set-row-name">${name}</div><div class="set-row-desc">${desc}</div>${extra}</div>
    ${actions ? `<div class="set-row-actions">${actions}</div>` : ''}</div>`;
const section = (id, title, html) => `<section class="set-section" id="${id}" aria-labelledby="${id}-title"><h2 class="set-section-title" id="${id}-title">${esc(title)}</h2>${html}</section>`;

// ---- You ----

function youSection() {
  const a = settings.account;
  const offer = a?.name && !same(a.name, ownName())
    ? `<button class="link-btn set-offer" data-cmd="settings.use-account-name">Use ${esc(a.name)}, your Microsoft 365 name</button>` : 'Kept in this browser.';
  return section('you', 'You', card({
    title: 'Your name', desc: 'The History records each change you make under it.',
    body: `<input class="input set-input is-short" data-field="name" data-enter="settings.save-name" value="${esc(draft('name', ownName()))}" placeholder="Your name" aria-label="Your name" maxlength="80" autocomplete="name" spellcheck="false">`,
    note: offer, foot: saveButton('settings.save-name', 'name'),
  }) + card({
    title: 'Theme', desc: 'How Rboreal looks in this browser. System follows your computer’s light or dark setting.',
    aside: `<div class="seg" role="group" aria-label="Theme">${[['system', 'System'], ['light', 'Light'], ['dark', 'Dark']].map(([value, label]) =>
      `<button data-cmd="settings.theme" data-value="${value}" aria-pressed="${(prefs.theme ?? 'system') === value}">${label}</button>`).join('')}</div>`,
  }));
}

// ---- Workbook: where it's kept, and copies ----

function workbookSection() {
  const p = Store.place();
  return section('workbook', 'Workbook', (p.conflict ? conflictCard(p) : '') + placesCard(p) + copiesCard());
}

// The status line under the place in use, with what puts a problem right.
function statusLine(s) {
  const fix = { 'sign-in': ['settings.sign-in', 'Sign in'], allow: ['settings.allow-file', 'Allow access'], retry: ['settings.retry', 'Try again'] }[s.fix];
  return `<div class="set-status${s.tone ? ` is-${s.tone}` : ''}" role="status"><span>${esc(s.text)}</span>${fix ? button(fix[0], fix[1]) : ''}</div>`;
}

function placesCard(p) {
  const s = Store.status(), demo = SharePoint.connector.isDemo();
  const inUse = kind => p.place === kind ? Parts.badge('In use', 'accent') : '';
  const status = kind => p.place === kind && (kind !== 'browser' || s.tone) ? statusLine(s) : '';
  const fileDesc = p.place === 'file' ? `${esc(p.name)}, saved as you work. In a folder OneDrive or SharePoint syncs, others can open it too.`
    : Store.canUseFiles ? 'A .rboreal.json file of your choosing. In a folder that OneDrive or SharePoint syncs, your team can open it too.'
    : 'This browser can’t keep a file open, as Chrome and Edge can, but it can download the workbook, and open one that was downloaded.';
  const libraryDesc = p.place === 'sharepoint' ? `${esc(p.name)}, in ${esc(p.where)}${demo ? ' (the demo)' : ''}. Your team opens the same one, under SharePoint’s permissions and version history.`
    : `${esc(Store.libraryName())}${demo ? ', in the demo' : ''}. Your team opens the same workbook, under SharePoint’s permissions and version history.`;
  return card({
    title: 'Where it’s kept',
    desc: 'Every page works on a copy in this browser, so it opens at once and stays in step across tabs. Changes are saved as you make them, to one of these.',
    error: settings.errors.where,
    rows: [
      row({ name: `This browser${inUse('browser')}`, desc: 'Only here: nothing to set up, but no one else can open it.', extra: status('browser'), current: p.place === 'browser',
        actions: p.place === 'browser' ? '' : button('settings.use-browser', 'Keep it only here') }),
      row({ name: `A file${inUse('file')}`, desc: fileDesc, extra: status('file'), current: p.place === 'file',
        actions: Store.canUseFiles ? button('settings.open-file', 'Open…') + button('settings.save-file', 'Save as…')
          : button('settings.open-copy', 'Open…') + button('settings.export', 'Download') }),
      row({ name: `A SharePoint library${inUse('sharepoint')}`, desc: libraryDesc, extra: status('sharepoint'), current: p.place === 'sharepoint',
        actions: button('settings.open-library', 'Open…') + button('settings.save-library', 'Save as…') }),
    ].join(''),
  });
}

// Saved elsewhere while this browser had changes too: both are kept until the person chooses.
function conflictCard(p) {
  const c = p.conflict, file = p.place === 'file';
  const choice = (cmd, label, desc) => row({ name: button(cmd, label, { primary: cmd === 'settings.keep-mine' }), desc });
  return card({
    tone: 'alert',
    title: c.by ? `${esc(c.by)} saved a newer version` : `${esc(p.name)} changed`,
    desc: `${file ? 'It changed' : 'It was saved'} ${moment(c.at)}, after this browser last saved${file ? ', perhaps from another computer' : ''}. Both copies are kept, ${file ? 'the file’s' : 'theirs in the library'} and yours here, until you choose.`,
    error: settings.errors.conflict,
    rows: [
      choice('settings.keep-mine', 'Keep mine', file ? 'Save yours over the file.' : 'Save yours over theirs. Theirs stays in SharePoint’s version history.'),
      choice('settings.take-theirs', 'Take theirs', 'Replace your changes here with theirs.'),
      choice('settings.save-mine', 'Save mine as a copy…', file ? 'Leave the file as it is, and save yours to a new one.' : 'Leave theirs as it is, and save yours under a new name.'),
    ].join(''),
  });
}

function copiesCard() {
  return card({
    title: 'Export and import', desc: 'The workbook as one JSON file: every chart, with its views and history.',
    error: settings.errors.copies,
    rows: row({ name: 'Export', desc: 'Downloads a copy. Where the workbook is kept doesn’t change.', actions: button('settings.export', 'Export') })
      + row({ name: 'Import', desc: 'Brings in the charts of a workbook file. One that’s here too is replaced, as one change that Undo takes back and the History records; the rest are added.',
        actions: button('settings.import', 'Import…') }),
  });
}

// ---- SharePoint ----

function sharepointSection() {
  return section('sharepoint', 'SharePoint', connectionCard() + accountCard() + testCard() + (SharePoint.connector.isDemo() ? demoCard() : ''));
}

function connectionCard() {
  const cfg = spConfig(), value = k => draft(`sp.${k}`, cfg[k] ?? '');
  const live = value('mode') === 'live';
  const input = (k, label, placeholder, { wide = false, ident = false } = {}) => `<label class="set-field${wide ? ' is-wide' : ''}"><span class="set-label">${label}</span>
    <input class="input set-input${ident ? ' ident' : ''}" data-field="sp.${k}" value="${esc(value(k))}" placeholder="${esc(placeholder)}" spellcheck="false" autocomplete="off"></label>`;
  const fromFile = live && location.protocol === 'file:'
    ? '<p class="set-warn">Signing in needs the app served from an https:// address, or from localhost. Opened as a file, it can’t sign in.</p>' : '';
  // The tenant's details matter only to Live; the demo needs none.
  const fields = live ? `<div class="set-fields">
        ${input('tenantId', 'Tenant ID', '0a1b2c3d-…', { ident: true })}${input('clientId', 'Client ID', '4e5f6a7b-…', { ident: true })}
        ${input('siteUrl', 'Site URL', 'https://contoso.sharepoint.com/sites/FundLegal', { wide: true })}
        ${input('library', 'Library', 'Documents')}${input('workbookFolder', 'Workbook folder', 'Rboreal')}
        ${input('redirectUri', 'Redirect URI', 'Leave blank to use this page’s address', { wide: true })}
      </div>${fromFile}`
    : '<p class="set-hint">The demo needs no setup. Choose Live to connect your organization’s tenant, with the details from registering Rboreal.</p>';
  return card({
    title: 'Connection',
    desc: 'Rboreal reads documents and keeps the workbook through Microsoft Graph, as whoever is signed in. Until your organization’s tenant is set up, it uses a demo site.',
    body: `<label class="set-field"><span class="set-label">Mode</span><span class="set-select"><select class="input set-input" data-field="sp.mode">
        <option value="demo"${live ? '' : ' selected'}>Demo: Contoso’s Fund Legal site, with sample documents</option>
        <option value="live"${live ? ' selected' : ''}>Live: your organization’s Microsoft 365</option></select>${icon('chevron-down')}</span></label>
      ${fields}`,
    error: settings.errors.connection,
    note: `How to register Rboreal in Microsoft Entra ID: <a class="link" href="../docs/sharepoint-setup.md" target="_blank" rel="noopener">the setup guide</a>`,
    foot: saveButton('settings.save-connection', 'sp'),
  });
}

function accountCard() {
  const a = settings.account, demo = SharePoint.connector.isDemo();
  const desc = a === undefined ? 'Checking…'
    : a ? `Signed in as ${esc(a.name)}${a.email ? `, ${esc(a.email)}` : ''}${demo ? ', in the demo' : ''}.`
    : demo ? 'Not signed in. The demo signs in as Demo User, with no password.' : 'Not signed in. You sign in with your Microsoft 365 account; Rboreal never sees your password.';
  return card({
    title: 'Account', desc, error: settings.errors.account,
    aside: a === undefined ? '' : a ? button('settings.sign-out', 'Sign out') : button('settings.sign-in', 'Sign in', { primary: true }),
  });
}

function testCard() {
  const steps = settings.test;
  return card({
    title: 'Test the connection', desc: 'Signs in if need be, then finds the site, the library and the workbook folder.',
    aside: button('settings.test', settings.busy === 'test' ? 'Testing…' : 'Test connection'),
    body: steps?.length ? `<ol class="set-steps">${steps.map(s => `<li class="${s.ok ? 'is-ok' : 'is-fail'}">${icon(s.ok ? 'check' : 'x')}<span>${esc(s.text)}</span></li>`).join('')}</ol>` : '',
  });
}

// In the demo, a colleague can save the library's copy, to show what happens when two people save at once.
function demoCard() {
  const there = Store.place().place === 'sharepoint';
  return card({
    title: 'Two people at once',
    desc: `In the demo, ${COLLEAGUE} can save the library’s copy as if from her own computer. Change something here afterwards, and your save meets hers.${there ? '' : ' Save the workbook to the library first.'}`,
    aside: button('settings.colleague', `Have ${COLLEAGUE.split(' ')[0]} save it`, { disabled: !there }),
  });
}

// ---- This chart ----

function chartSection() {
  const sample = isSampleChart();
  return section('chart', 'This chart', card({
    title: 'Name', desc: 'What the chart menu and exports call this chart.',
    body: `<input class="input set-input is-short" data-field="chart" data-enter="settings.save-chart" value="${esc(draft('chart', chartInUse().name))}" aria-label="Chart name" maxlength="120" autocomplete="off" spellcheck="false">`,
    note: workbook.charts.length > 1 ? `One of ${workbook.charts.length} charts in this workbook.` : 'The only chart in this workbook.',
    foot: saveButton('settings.save-chart', 'chart'),
  }) + card({
    title: 'Reset to the sample',
    desc: sample ? 'Puts the sample chart back as it started, with its views and formulas. Undo brings your changes back, and the History records the reset.'
      : 'Only the sample chart can be reset, and this one didn’t start from it.',
    aside: button('settings.reset', 'Reset to the sample', { disabled: !sample }),
  }));
}

// ---- Danger zone ----

function dangerSection() {
  const p = Store.place();
  return section('danger', 'Danger zone', card({
    tone: 'danger', title: 'Clear this browser’s copy',
    desc: p.place === 'browser' ? 'The workbook is kept only in this browser, so clearing it deletes every chart for good. The sample takes its place.'
      : `This browser forgets the workbook and where it’s kept. The copy in ${esc(p.where)} stays, to open again.`,
    note: 'Your name, the theme and the SharePoint settings stay.',
    foot: button('settings.clear', 'Clear this browser’s copy', { danger: true }),
  }));
}

// ---- The page ----

function renderSettings() {
  return `<div class="settings">
    <div class="page-head"><div class="page-head-text"><h2 class="page-title">Settings</h2>
      <p class="page-sub">Your name, where the workbook is kept, the SharePoint connection, and this chart.</p></div></div>
    <div class="set-layout">
      <nav class="set-nav" aria-label="Sections">${SECTIONS.map(([id, name]) =>
        `<a href="#${id}" data-cmd="settings.go" data-section="${id}" aria-current="${settings.section === id}">${name}</a>`).join('')}</nav>
      <div class="set-column">${youSection()}${workbookSection()}${sharepointSection()}${chartSection()}${dangerSection()}</div>
    </div>
  </div>`;
}

// Re-renders, keeping the caret where it was. While a dialog is open, it waits, so the dialog keeps its state.
function rerender() {
  if (settings.dialog) { settings.stale = true; return; }
  const el = document.activeElement;
  const field = el?.dataset?.field, cmd = el?.dataset?.cmd, caret = field && el.selectionStart != null ? [el.selectionStart, el.selectionEnd] : null;
  render();
  const again = field ? document.querySelector(`[data-field="${field}"]`) : cmd ? document.querySelector(`[data-cmd="${cmd}"]:not(:disabled)`) : null;
  again?.focus({ preventScroll: true });
  if (caret) try { again.setSelectionRange(...caret); } catch {}
}
async function ask(kind, d) {
  settings.dialog = true;
  try { return await (kind === 'prompt' ? Shell.prompt(d) : Shell.confirm(d)); } finally {
    settings.dialog = false;
    if (settings.stale) { settings.stale = false; rerender(); }
  }
}
// Runs a card's action, showing its failure in the card.
async function act(cardKey, fn) {
  settings.errors[cardKey] = null;
  settings.busy = cardKey;
  rerender();
  try { return await fn(); } catch (e) {
    settings.errors[cardKey] = e.message || String(e);
  } finally {
    settings.busy = null;
    rerender();
  }
}
function refreshSaves() {
  for (const b of document.querySelectorAll('[data-saves]')) b.disabled = !PENDING[b.dataset.saves]();
}

async function refreshAccount() {
  settings.errors.account = null;
  try { settings.account = (await Store.isSignedIn()) ? await SharePoint.connector.whoAmI() : null; } catch (e) {
    settings.account = null;
    settings.errors.account = e.message;
  }
  rerender();
}

// ---- The list of sections, following the scroll ----

function spy() {
  const main = document.getElementById('main');
  let current = settings.pinned;
  if (!current) {
    const line = main.getBoundingClientRect().top + 120;
    current = SECTIONS[0][0];
    for (const [id] of SECTIONS) if (document.getElementById(id)?.getBoundingClientRect().top <= line) current = id;
    if (main.scrollTop > 0 && main.scrollTop + main.clientHeight >= main.scrollHeight - 2) current = SECTIONS.at(-1)[0];
  }
  settings.section = current;
  for (const a of document.querySelectorAll('.set-nav a')) a.setAttribute('aria-current', String(a.dataset.section === current));
}
function go(id, smooth = true) {
  settings.pinned = id;
  document.getElementById(id)?.scrollIntoView({ behavior: smooth && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'instant' });
  history.replaceState(null, '', `#${id}`);
  spy();
}
let started = false;
function afterRender() {
  refreshSaves();
  if (!started) {
    started = true;
    const main = document.getElementById('main');
    main.addEventListener('scroll', spy, { passive: true });
    for (const type of ['wheel', 'touchstart', 'keydown']) main.addEventListener(type, () => { settings.pinned = null; }, { passive: true });
    const first = location.hash.slice(1);
    if (SECTIONS.some(([id]) => id === first)) requestAnimationFrame(() => go(first, false));
  }
  spy();
}

// ---- Actions ----

// Opening a workbook replaces the working copy, so ask first if that would lose anything.
async function confirmReplace({ name }) {
  const risk = Store.atRisk(), p = Store.place();
  if (!risk) return true;
  const body = risk === 'workbook'
    ? `<p>It replaces the workbook in this browser, which isn’t kept anywhere else, so its ${count(workbook.charts.length, 'chart')} would be lost.</p><p>Export this one first to keep a copy, or import the file instead, to add its charts to this workbook.</p>`
    : `<p>It replaces the workbook here, and the changes not yet saved to ${esc(p.where)} would be lost.</p>`;
  return ask('confirm', { title: `Open ${name}?`, html: body, confirm: 'Open it', danger: true });
}
// A file the person picks, or null.
function pickFile(accept) {
  return new Promise(resolve => {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept });
    input.addEventListener('change', () => resolve(input.files[0] ?? null));
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

// The library's actions sign in as part of them, on the click that confirmed the name.
const signedIn = async () => { if (!(await Store.isSignedIn())) await Store.signIn(); };
const openLibrary = () => act('where', async () => {
  const name = await ask('prompt', { title: 'Open from the library', body: `The name of a workbook in ${Store.libraryName()}.`,
    value: Store.place().place === 'sharepoint' ? Store.place().name : '', placeholder: 'Workbook name', confirm: 'Open' });
  if (!clean(name ?? '')) return;
  await signedIn();
  const opened = await Store.openLibrary(name, { confirm: confirmReplace });
  if (opened) { await refreshAccount(); Shell.toast(`Opened ${opened} from ${Store.libraryName()}`); }
});
const saveLibrary = (title = 'Save to the library', value = Store.workbookName()) => act(Store.place().conflict ? 'conflict' : 'where', async () => {
  const name = await ask('prompt', { title, body: `Saves the workbook in ${Store.libraryName()}, and keeps it there from then on.`, value, placeholder: 'Workbook name', confirm: 'Save' });
  if (!clean(name ?? '')) return;
  await signedIn();
  const saved = await Store.saveLibraryAs(name);
  if (saved) { await refreshAccount(); Shell.toast(`Saved to ${Store.libraryName()} as ${saved}`); }
});

function exportNow() {
  Shell.toast(`Exported ${Store.exportWorkbook()}`);
}

async function importNow() {
  const file = await pickFile('.json,application/json');
  if (file) await importFile(file);
}
async function importFile(file) {
  let found;
  try { found = await Store.readFile(file); } catch (e) { settings.errors.copies = e.message; return rerender(); }
  const wb = found.workbook, here = new Set(workbook.charts.map(c => c.id));
  const shared = wb.charts.filter(c => here.has(c.id)).length;
  settings.importMode = shared ? 'replace' : 'add';
  const html = `<p>It has ${count(wb.charts.length, 'chart')}:</p>
    <ul class="set-import">${wb.charts.map(c => `<li><span>${esc(c.name)}</span><span class="faint">${here.has(c.id) ? 'Here too' : 'New'}</span></li>`).join('')}</ul>
    ${shared ? `<label class="set-field"><span class="set-label">${shared === wb.charts.length ? 'These charts are here too' : 'The charts that are here too'}</span><span class="set-select"><select class="input set-input" data-import-mode>
        <option value="replace">Replace them: one change each, which Undo takes back</option>
        <option value="add">Add them again, as new charts</option></select>${icon('chevron-down')}</span></label>
      ${shared < wb.charts.length ? '<p class="set-hint">The new ones are added, each with its own history.</p>' : ''}`
      : '<p>Each is added as a new chart, with its own history.</p>'}`;
  if (!await ask('confirm', { title: `Import ${found.name}?`, html, confirm: 'Import', wide: true })) return;
  const { replaced, added } = Store.importWorkbook(wb, { source: found.name, asNew: settings.importMode === 'add' });
  settings.errors.copies = null;
  rerender();
  const what = [replaced.length && `replaced ${count(replaced.length, 'chart')}`, added.length && `added ${count(added.length, 'chart')}`].filter(Boolean).join(' and ');
  Shell.toast(`Imported ${found.name}: ${what}`, { undo: replaced.includes(chartInUse().name) });
}

async function testConnection() {
  if (settings.busy) return;
  const c = SharePoint.connector, cfg = c.config(), steps = settings.test = [];
  const step = (ok, text) => { steps.push({ ok, text }); rerender(); return ok; };
  settings.busy = 'test';
  rerender();
  try {
    if (!(await Store.isSignedIn())) await Store.signIn();
    const me = await c.whoAmI();
    step(true, `Signed in as ${me.name}${c.isDemo() ? ', in the demo' : ''}`);
    const site = c.isDemo() ? SharePoint.DEMO.site : cfg.siteUrl;
    const drives = await c.listDrives(site);
    step(true, `Found the site, ${site.replace(/^https:\/\//, '')}, with ${count(drives.length, 'library')}`);
    const want = norm(cfg.library || 'Documents');
    const lib = drives.find(d => norm(d.name) === want || decodeURIComponent(d.webUrl ?? '').toLowerCase().endsWith(`/${want}`));
    if (!step(!!lib, lib ? `Found the library, ${lib.name}` : `There’s no library called ${cfg.library} there`)) return;
    const top = await c.listChildren(lib.id);
    step(true, `Read the library: ${count(top.length, 'item')} at its top`);
    const folder = top.find(x => x.isFolder && same(x.name, cfg.workbookFolder || 'Rboreal'));
    step(true, folder ? `Found the ${folder.name} folder, where workbooks are kept` : `The ${cfg.workbookFolder || 'Rboreal'} folder isn’t there yet; the first save makes it`);
    await refreshAccount();
  } catch (e) {
    step(false, e.message || String(e));
  } finally {
    settings.busy = null;
    rerender();
  }
}

async function clearCopy() {
  const p = Store.place(), risk = Store.atRisk();
  const lose = p.place === 'browser'
    ? risk ? `The workbook is kept only here, so its ${count(workbook.charts.length, 'chart')}, with their records, views and history, will be gone for good. Export it first to keep a copy.`
      : 'It’s the sample as it started, so nothing is lost.'
    : risk ? `Changes not yet saved to ${p.where} will be lost. The rest is kept there, to open again.` : `Nothing is lost: it’s all in ${p.where}, to open again.`;
  const html = `<p>${esc(lose)}</p><p>What stays: your name, the theme and the SharePoint settings. The sample takes the workbook’s place here.</p>`;
  if (!await ask('confirm', { title: 'Clear this browser’s copy?', html, confirm: 'Clear it', danger: true })) return;
  Store.clearBrowserCopy();
  settings.drafts = {};
  Shell.toast('Cleared this browser’s copy');
}

function resetChart() {
  if (!isSampleChart()) return;
  resetState();
  delete settings.drafts.chart;
  rerender();
  Shell.toast('Reset the chart to the sample', { undo: true });
}

Object.entries({
  'settings.go': el => go(el.dataset.section),
  'settings.theme': el => { prefs.theme = el.dataset.value; savePrefs(); applyTheme(); rerender(); },
  'settings.save-name': () => {
    if (!PENDING.name()) return;
    setCurrentUser(draft('name', ownName()));
    delete settings.drafts.name;
    rerender();
    Shell.toast(ownName() ? `Changes are now recorded as ${ownName()}’s` : 'Changes are now recorded as yours');
  },
  'settings.use-account-name': () => { settings.drafts.name = settings.account.name; rerender(); document.querySelector('[data-field="name"]')?.focus(); },
  'settings.use-browser': () => { Store.useBrowser(); Shell.toast('The workbook is kept only in this browser now'); },
  'settings.open-file': () => act('where', async () => { const name = await Store.openFile({ confirm: confirmReplace }); if (name) Shell.toast(`Opened ${name}`); }),
  'settings.save-file': () => act('where', async () => { const name = await Store.saveFileAs(); if (name) Shell.toast(`Saved to ${name}`); }),
  'settings.open-copy': () => act('where', async () => {
    const file = await pickFile('.json,application/json');
    if (!file) return;
    const { name, text } = await Store.readFile(file);
    if (!await confirmReplace({ name })) return;
    Store.openCopy(text, name);
    Shell.toast(`Opened ${name}`);
  }),
  'settings.allow-file': () => act('where', () => Store.allowFile()),
  'settings.retry': () => Store.sync({ look: true }),
  'settings.open-library': openLibrary,
  'settings.save-library': () => saveLibrary(),
  'settings.keep-mine': () => act('conflict', async () => { await Store.keepMine(); Shell.toast('Saved yours over theirs'); }),
  'settings.take-theirs': () => act('conflict', async () => {
    if (!await ask('confirm', { title: 'Take theirs?', body: 'Your changes here since this browser last saved will be replaced by theirs. To keep yours as well, save yours as a copy instead.', confirm: 'Take theirs', danger: true })) return;
    await Store.takeTheirs();
    Shell.toast('Took their version');
  }),
  'settings.save-mine': () => {
    const p = Store.place();
    if (p.place === 'file') return act('conflict', async () => { const name = await Store.saveMineAs(); if (name) Shell.toast(`Saved yours to ${name}`); });
    saveLibrary('Save yours as a copy', `${p.name} (${ownName() || 'my copy'})`);
  },
  'settings.export': exportNow,
  'settings.import': importNow,
  'settings.save-connection': () => {
    const cfg = spConfig();
    const next = Object.fromEntries(SP_FIELDS.map(k => [k, clean(draft(`sp.${k}`, cfg[k] ?? ''))]));
    if (next.mode === 'live') {
      const missing = [['tenantId', 'tenant ID'], ['clientId', 'client ID'], ['siteUrl', 'site URL']].filter(([k]) => !next[k]).map(([, label]) => label);
      settings.errors.connection = missing.length ? `Live needs the ${joinList(missing)}.`
        : !/^https:\/\/[^/]+\.sharepoint(-df)?\.(com|us|de|cn)(\/|$)/i.test(next.siteUrl) ? 'The site URL should look like https://contoso.sharepoint.com/sites/FundLegal.' : null;
      if (settings.errors.connection) return rerender();
    }
    const was = Store.place().place;
    Store.configure(next);
    for (const k of SP_FIELDS) delete settings.drafts[`sp.${k}`];
    settings.errors.connection = null;
    settings.account = undefined;
    settings.test = null;
    rerender();
    refreshAccount();
    Shell.toast(was === 'sharepoint' && Store.place().place === 'browser' ? 'Saved the connection. The workbook is kept in this browser until you open or save it in the library.' : 'Saved the connection');
  },
  'settings.sign-in': () => act('account', async () => { await Store.signIn(); await refreshAccount(); }),
  'settings.sign-out': () => act('account', async () => { await Store.signOut(); await refreshAccount(); }),
  'settings.test': testConnection,
  'settings.colleague': () => {
    SharePoint.connector.demo.touch(Store.place().path, COLLEAGUE);
    Shell.toast(`${COLLEAGUE} saved the workbook in the library. Change something here to see the two meet.`);
  },
  'settings.save-chart': () => {
    if (!PENDING.chart()) return;
    renameChart(workbook.chartId, draft('chart', chartInUse().name));
    delete settings.drafts.chart;
    rerender();
    Shell.toast(`Renamed the chart to ${chartInUse().name}`);
  },
  'settings.reset': resetChart,
  'settings.clear': clearCopy,
}).forEach(([name, fn]) => Shell.on(name, fn));

document.addEventListener('input', e => {
  const key = e.target.dataset?.field;
  if (!key) return;
  settings.drafts[key] = e.target.value;
  if (e.target.matches('select')) rerender(); else refreshSaves();
});
document.addEventListener('change', e => { if (e.target.matches('[data-import-mode]')) settings.importMode = e.target.value; });
document.addEventListener('keydown', e => {
  const cmd = e.target.dataset?.enter;
  if (e.key === 'Enter' && cmd) { e.preventDefault(); document.querySelector(`[data-cmd="${cmd}"]`)?.click(); }
  if (e.key === 'Escape' && e.target.dataset?.field && e.target.dataset.field in settings.drafts) { delete settings.drafts[e.target.dataset.field]; rerender(); }
});

// The page follows the store: where the workbook is kept, and how its saving stands.
let lastShown = '';
Store.onChange(() => {
  const shown = JSON.stringify([Store.place(), Store.status()]);
  if (shown !== lastShown) { lastShown = shown; rerender(); }
});
Shell.onChartChange(() => { delete settings.drafts.chart; });

Shell.start({
  area: 'settings',
  title: 'Settings',
  render: renderSettings,
  after: afterRender,
  commands: () => [
    { title: 'Export the workbook', keywords: 'download json backup copy', run: exportNow },
    { title: 'Import a workbook…', keywords: 'upload json charts', run: importNow },
    { title: 'Test the SharePoint connection', keywords: 'graph tenant check', run: () => { go('sharepoint'); testConnection(); } },
    settings.account ? { title: 'Sign out of SharePoint', keywords: 'microsoft 365 account', run: () => act('account', async () => { await Store.signOut(); await refreshAccount(); }) }
      : { title: 'Sign in to SharePoint', keywords: 'microsoft 365 account', run: () => act('account', async () => { await Store.signIn(); await refreshAccount(); }) },
    ...(isSampleChart() ? [{ title: 'Reset this chart to the sample', keywords: 'sample start over', run: resetChart }] : []),
    { title: 'Clear this browser’s copy…', keywords: 'delete wipe local storage', run: clearCopy },
  ],
});
refreshAccount();
