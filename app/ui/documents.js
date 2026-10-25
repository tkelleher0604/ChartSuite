// The Documents area: the index to the team's document library. SharePoint, or another document system,
// keeps the files; the chart keeps what each one is and which records it concerns.
//
// A document is a record whose output is a field of datatype `document`: its address. Most sit on objects
// of the Document kind, with a type, a date, a status and a version beside them and a relation, Concerns,
// to the records they're about. So this page is also the Document kind's table, and the sidebar doesn't
// list the kind under Records. A document field anywhere else (a link on an entity, say) is listed too, as
// concerning the record it's on.
//
// Each file's own details (its version, who changed it and when, the library's columns, its versions) are
// read live from the library through SharePoint.connector (core/sharepoint.js), which runs against a demo
// library until a real one is connected in Settings. The page has three tabs:
// - Linked: every document, with facets, search and sorting, and a pane previewing the one selected;
// - Not linked: files in the library that no record links to, each linked in one click;
// - Broken links: documents whose link no longer leads to a file, to be linked again.
// Linking, editing details and relinking are each one undoable change, made through the model.

(() => {
const connector = SharePoint.connector;
const DOC_KIND = Shell.DOCUMENT_KIND;
const DEMO_HOST = new URL(SharePoint.DEMO.site).host;

// ---- What a document's record holds ----

// The entries a document's columns are read from, by label, in order of preference; a new document's are
// labeled with the first, unless the schema already labels documents' entries otherwise. Each role says
// what its entry is: a choice, or a field of a datatype.
const ROLES = {
  link: { labels: ['Link'], type: 'field', datatype: 'document' },
  type: { labels: ['Document Type', 'Type'], type: 'choice' },
  date: { labels: ['Document Date', 'Effective Date', 'Date'], type: 'field', datatype: 'date' },
  status: { labels: ['Status'], type: 'choice' },
  version: { labels: ['Version'], type: 'field', datatype: 'text' },
};
// The statuses offered before any document has one (docs/domain-research.md, §4).
const STATUSES = ['Draft', 'Executed', 'Filed', 'Superseded'];
// How a status reads: in force, in progress, or no longer current.
const STATUS_TONES = { executed: 'success', filed: 'success', final: 'success', signed: 'success', superseded: 'faint', terminated: 'faint', expired: 'faint', withdrawn: 'faint' };
// The relation a document's subjects are recorded by, when the chart has none yet, and its list's name
// seen from a subject: an entity's Documents.
const CONCERNS = { name: 'Concerns', doc: 'Document', subject: 'Subject', list: 'Documents' };

const isDocField = r => isField(r) && r.field === 'document';
const isDocObject = id => !!records[id] && isObject(records[id]) && same(records[id].kind, DOC_KIND);
const docKindKey = () => `kind:${norm(DOC_KIND)}`;

// The entry for a role at a record: the first of the role's labels it has. A document's link is
// whichever document field it has, if none is labeled Link.
function entryFor(at, role) {
  const entries = entriesOf(at);
  for (const label of ROLES[role].labels) {
    const id = entries.find(e => same(records[e].edge, label));
    if (id) return id;
  }
  return role === 'link' ? entries.find(e => isDocField(records[e])) ?? null : null;
}

// The entries the schema has on documents: label → { label, type, datatype, outputs }.
function docSchema() {
  const out = new Map();
  for (const k of indexOf().entriesAt.get(docKindKey()) ?? []) {
    const t = schema[k], label = t.args[0].edge, key = norm(label);
    if (!out.has(key)) out.set(key, { label, type: typeOfTree(t), datatype: t.out.field, outputs: [] });
    if ('choice' in t.out && !out.get(key).outputs.some(o => same(o, t.out.choice))) out.get(key).outputs.push(t.out.choice);
  }
  return out;
}
// How a role's entry is written on a new document: its label and type, the schema's where it has them.
function entrySpec(role) {
  const known = docSchema();
  const label = ROLES[role].labels.find(l => known.has(norm(l))) ?? ROLES[role].labels[0];
  const s = known.get(norm(label));
  return { label: s?.label ?? label, type: s?.type ?? ROLES[role].type, datatype: s?.datatype ?? ROLES[role].datatype };
}
// The options a role's choice offers: those the schema has, or for a status, the usual ones too.
function optionsOf(role) {
  const have = docSchema().get(norm(entrySpec(role).label))?.outputs ?? [];
  const extra = role === 'status' ? STATUSES.filter(s => !have.some(o => same(o, s))) : [];
  return [...have, ...extra].sort(byLabel);
}

// The objects a record belongs to: an entry's object, or the objects a relation relates.
function holdersOf(at) {
  const r = records[at];
  if (!r) return [];
  if (isObject(r)) return [at];
  return isRelation(r) ? [...new Set(r.args.flatMap(a => holdersOf(a.at)))] : holdersOf(r.at);
}

// Worked out once for each set of records: the relations at each location, every document, and what
// each object owns.
const memo = { recs: null, names: null, rels: null, rows: null, owns: null };
function fresh() {
  if (memo.recs === records && memo.names === names) return memo;
  memo.recs = records; memo.names = names;
  memo.rels = new Map();
  for (const [id, r] of Object.entries(records))
    if (isRelation(r)) for (const at of new Set(r.args.map(a => a.at))) pushTo(memo.rels, at, id);
  memo.owns = null;
  memo.rows = documentRows();
  return memo;
}

// The records a document concerns: the objects it's related to, other documents aside, in the order they
// were related, each with the relation that relates them and whether a formula worked it out. A
// ruled-out tag relates nothing.
function subjectsOf(docId) {
  const out = new Map();
  for (const rid of fresh().rels.get(docId) ?? []) {
    const r = records[rid];
    if (isTag(r) && !r.tag) continue;
    for (const a of r.args) {
      if (a.at === docId) continue;
      for (const h of holdersOf(a.at)) if (h !== docId && !isDocObject(h) && !out.has(h)) out.set(h, { id: h, rel: rid, computed: isComputed(rid) });
    }
  }
  return [...out.values()];
}

// A file's title: its name less its extension. A legal name's last period goes with the extension
// (Partners III, L.P.pdf), so it comes back.
const titleOf = name => String(name ?? '').replace(/\.[a-z0-9]{1,5}$/i, '').replace(/\b([A-Z]\.[A-Z])$/, '$1.');
const fileNameOf = link => SharePoint.parseDocUrl(link).fileName ?? documentName(link);

// A document as the table lists it:
//   { id, record, own, name, link, linkId, url, type, date, status, version, subjects }
// `id` is the Document object's id, or the field's for a document field elsewhere; `record` is what its
// name opens; `own` says whether it's a Document record, whose details can be edited here. `url` is what
// its link points at (parseDocUrl). type, status and version are { id, text, computed }, date { id, iso,
// computed }, each null where the record has none.
function indexRow(id) {
  const cell = role => { const e = entryFor(id, role); return e ? { id: e, text: Parts.outputText(records[e]), computed: isComputed(e) } : null; };
  const linkId = entryFor(id, 'link');
  const link = linkId && isDocField(records[linkId]) ? records[linkId].value : null;
  const dateId = entryFor(id, 'date');
  return {
    id, record: id, own: true, name: objectName(id), link, linkId, url: link ? SharePoint.parseDocUrl(link) : null,
    type: cell('type'), status: cell('status'), version: cell('version'),
    date: dateId && records[dateId].field === 'date' ? { id: dateId, iso: records[dateId].value, computed: isComputed(dateId) } : null,
    subjects: subjectsOf(id),
  };
}
function fieldRow(id) {
  const r = records[id];
  return {
    id, record: pathTo(id)[0], own: false, name: titleOf(fileNameOf(r.value)), link: r.value, linkId: id, url: SharePoint.parseDocUrl(r.value),
    type: { id, text: r.edge, computed: false }, status: null, version: null, date: null,
    subjects: holdersOf(r.at).map(h => ({ id: h, rel: null, computed: false })),
  };
}
// Every document: the Document records, then document fields elsewhere. A field linking to a file a
// document already links to is a reference to that document, not another one; a computed field is a
// reference too.
function documentRows() {
  const rows = objectsOfKind(DOC_KIND).map(indexRow);
  const byLink = new Map(rows.filter(r => r.link).map(r => [linkKey(r.link), r]));
  for (const [id, r] of Object.entries(records)) {
    if (!isDocField(r) || isComputed(id) || isDocObject(pathTo(id)[0])) continue;
    const row = fieldRow(id), seen = byLink.get(linkKey(r.value));
    if (!seen) { byLink.set(linkKey(r.value), row); rows.push(row); }
    else if (!seen.own) seen.subjects = [...new Map([...seen.subjects, ...row.subjects].map(s => [s.id, s])).values()];
  }
  return rows;
}
const rowById = id => fresh().rows.find(r => r.id === id) ?? null;

// What each object owns, directly or through what it owns, by the relation named Ownership, whose first
// edge is the owner's (as the chart's Tidy layout reads ownership too).
function ownedBelow(ids) {
  if (!memo.owns) {
    memo.owns = new Map();
    for (const [rid, r] of Object.entries(records)) {
      if (!isRelation(r) || r.args.length !== 2 || !isTag(r) || r.tag !== true || !same(relationNameOf(rid), 'Ownership')) continue;
      const edges = names[formKeyOf(rid)]?.edges;
      const [owner, owned] = edges ? edges.map(e => r.args.find(a => same(a.edge, e))) : r.args;
      if (owner && owned) pushTo(memo.owns, objectOf(owner.at), objectOf(owned.at));
    }
  }
  const out = new Set(ids);
  for (const queue = [...ids]; queue.length;)
    for (const next of memo.owns.get(queue.shift()) ?? []) if (!out.has(next)) { out.add(next); queue.push(next); }
  return out;
}

// ---- Where a document lives ----

// A link as a key, so the same file's addresses compare equal: decoded, without its query, in lower case.
function linkKey(url) {
  const s = String(url ?? '').split(/[?#]/)[0];
  try { return decodeURIComponent(s).toLowerCase(); } catch { return s.toLowerCase(); }
}
const isEdgar = p => /(^|\.)sec\.gov$/.test(p?.host ?? '');
const SYSTEM_NAMES = { sharepoint: 'SharePoint', onedrive: 'OneDrive', netdocuments: 'NetDocuments', imanage: 'iManage', file: 'File share' };
const systemName = p => isEdgar(p) ? 'EDGAR' : SYSTEM_NAMES[p.system] ?? p.host ?? 'the web';
// Where a link says its file is: the folders below the library, for SharePoint; the system, elsewhere.
function whereText(p) {
  if (!p) return '';
  if (p.isSharePoint) {
    if (p.isSharingLink) return `${systemName(p)} sharing link`;
    const folders = p.folderPath ? p.folderPath.split('/') : [];
    const lib = p.library && !same(p.library, 'Shared Documents') && !same(p.library, connector.config().library) ? [p.library] : [];
    return [...lib, ...folders].join(' › ') || p.library || systemName(p);
  }
  return p.system === 'file' && p.folderPath ? `${systemName(p)} › ${p.folderPath.split('/').join(' › ')}` : systemName(p);
}
const openLabel = p => !p ? 'Open' : p.system === 'sharepoint' ? 'Open in SharePoint' : p.system === 'web' && !isEdgar(p) ? 'Open link'
  : p.system === 'file' ? 'Open file' : `Open in ${systemName(p)}`;
const glyph = (kind, cls = '') => { const g = SharePoint.docIcon(kind); return `<span class="doc-glyph ${cls}" title="${esc(g.title)}">${g.svg}</span>`; };
const sizeText = n => n == null ? '' : n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`;
const folderText = path => String(path ?? '').split('/').filter(Boolean).join(' › ');
// A library column's internal name as people read it: DocumentType is Document Type.
const columnName = key => key.replace(/_x0020_/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ').trim();
const columnText = v => Array.isArray(v) ? v.map(columnText).join('; ') : v && typeof v === 'object' ? v.LookupValue ?? v.Label ?? v.Email ?? '' : String(v ?? '');
const isoDay = v => /^\d{4}-\d{2}-\d{2}/.test(String(v ?? '')) ? String(v).slice(0, 10) : null;

// The library this page reads, as people name it: Contoso › Fund Legal › Documents.
function libraryName() {
  const c = connector.config();
  const site = connector.isDemo() ? SharePoint.DEMO.site : c.siteUrl;
  let host = '', path = '';
  try { const u = new URL(site); host = u.hostname.split('.')[0]; path = decodeURIComponent(u.pathname.split('/').filter(Boolean).at(-1) ?? ''); } catch {}
  const words = s => s.replace(/([a-z])([A-Z])/g, '$1 $2');
  return [host && host[0].toUpperCase() + host.slice(1), path && words(path), connector.isDemo() ? 'Documents' : c.library || 'Documents'].filter(Boolean).join(' › ');
}

// ---- The library, read live ----
// What's been read from the library this session: each link's file (or why it couldn't be read), each
// file's versions, and every file in the library, for what no record links to. Reads go a few at a time.

const lib = {
  checks: new Map(),   // a link's key → { state: 'checking' | 'ok' | 'missing' | 'denied' | 'error', item, message }
  versions: new Map(), // a file's id → { state: 'loading' | 'ok' | 'error', list, message }
  files: { state: 'idle', list: [], capped: false, message: '' },
  signedIn: connector.isDemo(),
  who: null,
};
const FILE_LIMIT = 2000, FOLDER_LIMIT = 300;

let active = 0;
const waiting = [];
function queued(task) {
  return new Promise((resolve, reject) => { waiting.push({ task, resolve, reject }); pump(); });
}
function pump() {
  while (active < 4 && waiting.length) {
    const { task, resolve, reject } = waiting.shift();
    active++;
    Promise.resolve().then(task).then(resolve, reject).finally(() => { active--; pump(); });
  }
}

// Whether a link can be read from the library: a SharePoint link, and in demo mode one to the demo's.
function checkable(link) {
  const p = link && SharePoint.parseDocUrl(link);
  return !!p?.isSharePoint && (!connector.isDemo() || p.host === DEMO_HOST);
}
function failure(e) {
  if (e instanceof SharePoint.NotFoundError) return { state: 'missing', message: 'SharePoint can’t find this file. It may have been moved, renamed or deleted.' };
  if (e instanceof SharePoint.AuthError) return { state: 'denied', message: e.message };
  return { state: 'error', message: e?.message ?? 'SharePoint couldn’t be reached.' };
}
const checkOf = link => !checkable(link) ? null : lib.checks.get(linkKey(link)) ?? { state: 'checking' };
function check(link) {
  if (!checkable(link) || !lib.signedIn || lib.checks.has(linkKey(link))) return;
  const key = linkKey(link);
  lib.checks.set(key, { state: 'checking' });
  queued(() => connector.getItem(link)).then(item => ({ state: 'ok', item }), failure).then(result => { lib.checks.set(key, result); refresh(); });
}
const itemOf = link => { const c = checkOf(link); return c?.state === 'ok' ? c.item : null; };
const isBroken = row => checkOf(row.link)?.state === 'missing';

function versionsOf(item) {
  if (!item || lib.versions.has(item.id)) return;
  lib.versions.set(item.id, { state: 'loading' });
  queued(() => connector.listVersions(item.driveId, item.id))
    .then(list => ({ state: 'ok', list }), e => ({ state: 'error', message: e.message }))
    .then(v => { lib.versions.set(item.id, v); refresh(); });
}

// Every file in the library, folder by folder, leaving out the folder workbooks are saved in.
async function scanLibrary() {
  if (lib.files.state === 'loading' || !lib.signedIn) return;
  lib.files = { state: 'loading', list: [], capped: false, message: '' };
  const skip = connector.config().workbookFolder || 'Rboreal';
  const files = [], folders = [null];
  try {
    for (let n = 0; folders.length && files.length < FILE_LIMIT && n < FOLDER_LIMIT; n++) {
      const folder = folders.shift();
      const items = await queued(() => folder ? connector.listChildren(folder.driveId, folder.id) : connector.listChildren());
      for (const it of items) {
        if (!it.isFolder) files.push(it);
        else if (folder || !same(it.name, skip)) folders.push(it);
      }
    }
    lib.files = { state: 'ok', list: files, capped: folders.length > 0, message: '' };
  } catch (e) {
    lib.files = { state: 'error', list: [], capped: false, message: failure(e).message };
  }
  refresh();
}
// The library's files that no record links to: matched by the file a link was read as, or by address.
function unlinkedFiles() {
  const rows = fresh().rows;
  const ids = new Set(rows.map(r => itemOf(r.link)?.id).filter(Boolean));
  const keys = new Set(rows.filter(r => r.link).map(r => linkKey(r.link)));
  return lib.files.list.filter(f => !ids.has(f.id) && !keys.has(linkKey(f.webUrl)));
}
const fileById = id => lib.files.list.find(f => f.id === id) ?? null;

// In live mode, whether someone's signed in; until they are, nothing is read.
async function startLibrary() {
  if (!connector.isDemo()) {
    try { lib.signedIn = await connector.isSignedIn(); } catch { lib.signedIn = false; }
    if (lib.signedIn) connector.whoAmI().then(me => { lib.who = me.name; refresh(); }, () => {});
  }
  scanLibrary();
  refresh();
}
async function signIn() {
  try {
    await connector.signIn();
    lib.signedIn = true;
    lib.checks.clear(); lib.versions.clear(); lib.files = { state: 'idle', list: [], capped: false, message: '' };
    await startLibrary();
  } catch (e) { Shell.toast(e.message ?? 'Couldn’t sign in to SharePoint.', { tone: 'error' }); }
}

// ---- The page's own state ----

const ui = {
  tab: 'linked',              // 'linked', 'unlinked' or 'broken'
  query: '',
  facets: { type: new Set(), status: new Set(), subject: new Set() },
  below: false,               // a Concerns filter takes in what the records chosen own, too
  sort: { linked: { key: 'date', dir: -1 }, unlinked: { key: 'where', dir: 1 }, broken: { key: 'name', dir: 1 } },
  selected: null,             // a document's id, or on Not linked a file's
  entering: false,            // the pane has just opened, and slides in
  allVersions: false,
  pop: null,                  // an open facet: { facet, query }
  dialog: null,               // the Link document dialog, or Edit details: see "The dialog"
  keep: { list: 0, pane: 0, focus: null },
};
const TABS = [['linked', 'Linked'], ['unlinked', 'Not linked'], ['broken', 'Broken links']];

function readHash() {
  const h = decodeURIComponent(location.hash.slice(1));
  if (h === 'not-linked') ui.tab = 'unlinked';
  else if (h === 'broken') ui.tab = 'broken';
  else if (h) { ui.tab = 'linked'; ui.selected = h; }
}
function writeHash() {
  const h = ui.tab === 'unlinked' ? 'not-linked' : ui.tab === 'broken' ? 'broken' : ui.selected ?? '';
  history.replaceState(null, '', h ? `#${encodeURIComponent(h)}` : location.pathname + location.search);
}

// Redraws the page once whatever just arrived from the library has, along with the dialog if it's open.
let pending = 0;
function refresh() {
  if (pending) return;
  pending = requestAnimationFrame(() => { pending = 0; Shell.render(); if (ui.dialog) drawDialog(); });
}

// ---- Filtering and sorting ----

const FACETS = { type: 'Type', status: 'Status', subject: 'Concerns' };
const facetKey = (facet, row) => facet === 'subject' ? row.subjects.map(s => s.id) : [norm(row[facet]?.text ?? '')];
const hay = row => norm([row.name, row.type?.text, row.status?.text, row.version?.text, whereText(row.url), row.link ? fileNameOf(row.link) : '',
  ...row.subjects.map(s => objectName(s.id))].join(' '));
const matches = (text, query) => norm(query).split(' ').filter(Boolean).every(w => text.includes(w));

function passes(row, except = null) {
  for (const [facet, chosen] of Object.entries(ui.facets)) {
    if (facet === except || !chosen.size) continue;
    const want = facet === 'subject' && ui.below ? ownedBelow([...chosen]) : chosen;
    if (!facetKey(facet, row).some(k => want.has(k))) return false;
  }
  return !ui.query || matches(hay(row), ui.query);
}
const anyFilter = () => !!clean(ui.query) || Object.values(ui.facets).some(s => s.size);

// Sorting keeps blanks last, whichever way it goes.
const SORTS = {
  name: r => r.name, type: r => r.type?.text, subjects: r => r.subjects[0] && objectName(r.subjects[0].id),
  date: r => r.date?.iso, status: r => r.status?.text, where: r => whereText(r.url),
};
const FILE_SORTS = { name: f => f.name, type: f => columnText(f.fields?.DocumentType), where: f => `${f.path}/${f.name}`, modified: f => f.lastModified };
function sorted(list, keyOf, { key, dir }) {
  const k = keyOf[key];
  return [...list].sort((a, b) => {
    const x = k(a) || '', y = k(b) || '';
    if (!x !== !y) return x ? -1 : 1;
    return dir * (String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: 'base' })) || byLabel(a.name, b.name);
  });
}

// ---- Drawing the page ----

function page() {
  const { rows } = fresh();
  const files = lib.files.state === 'ok' ? unlinkedFiles() : [];
  const broken = rows.filter(isBroken);
  if (ui.selected && !(ui.tab === 'unlinked' ? fileById(ui.selected) : rowById(ui.selected))) ui.selected = null;
  // Until the library can be read, what it holds isn't counted.
  const counts = { linked: rows.length, unlinked: !lib.signedIn ? '' : lib.files.state === 'ok' ? files.length : null, broken: lib.signedIn ? broken.length : '' };
  const body = ui.tab === 'linked' ? linkedView(rows) : ui.tab === 'unlinked' ? unlinkedView(files) : brokenView(broken);
  const pane = !ui.selected ? '' : ui.tab === 'unlinked' ? filePane(fileById(ui.selected)) : docPane(rowById(ui.selected));
  ui.entering = false;
  return `<div class="docs">
    <div class="docs-main">
      <div class="docs-head">
        <div class="page-head"><div class="page-head-text"><h2 class="page-title">Documents</h2>
          <p class="page-sub">What each file in the library is, and which records it concerns. The files themselves stay in SharePoint.</p></div></div>
        <div class="tabs" role="tablist" aria-label="Documents">${TABS.map(([id, label]) => {
          const n = counts[id];
          return `<button class="tab" role="tab" aria-selected="${ui.tab === id}" data-cmd="docs.tab" data-tab="${id}">${label}<span class="tab-count${id === 'broken' && n ? ' is-alert' : ''}">${n ?? '…'}</span></button>`;
        }).join('')}</div>
      </div>
      ${body}
    </div>
    ${pane}
  </div>`;
}

function toolbar({ facets, shown, total, noun }) {
  const chips = facets ? Object.keys(FACETS).map(facetChip).join('') + (anyFilter() ? '<button class="link-btn docs-clear" data-cmd="docs.clear">Clear filters</button>' : '') : '';
  return `<div class="docs-toolbar">
    <label class="search-input">${icon('search')}<input class="input" type="search" placeholder="Search ${esc(noun)}" value="${esc(ui.query)}" data-docs-input="query" aria-label="Search ${esc(noun)}" autocomplete="off" spellcheck="false"></label>
    ${chips ? `<div class="filters">${chips}</div>` : ''}
    <span class="docs-count">${shown === total ? count(total, noun.replace(/s$/, '')) : `${shown} of ${total}`}</span>
  </div>`;
}
function facetChip(facet) {
  const chosen = [...ui.facets[facet]];
  const open = ui.pop?.facet === facet;
  if (!chosen.length) return `<button class="filter-chip" data-cmd="docs.facet" data-facet="${facet}" aria-haspopup="dialog" aria-expanded="${open}">${icon('plus')}${FACETS[facet]}</button>`;
  const label = facet === 'subject' ? objectName(chosen[0]) : chosen[0] ? optionText(facet, chosen[0]) : `No ${FACETS[facet].toLowerCase()}`;
  const more = [chosen.length > 1 ? `+${chosen.length - 1}` : '', facet === 'subject' && ui.below ? 'and below' : ''].filter(Boolean);
  return `<span class="filter-chip is-set"><button class="filter-chip-main" data-cmd="docs.facet" data-facet="${facet}" aria-haspopup="dialog" aria-expanded="${open}">
      ${FACETS[facet]}:<span class="filter-chip-value">${esc(label)}</span>${more.map(m => `<span class="filter-chip-more">${m}</span>`).join('')}</button>
    <button class="filter-chip-clear" data-cmd="docs.unfacet" data-facet="${facet}" aria-label="Clear the ${FACETS[facet]} filter">${icon('x')}</button></span>`;
}
// An option as written, from its key.
function optionText(facet, key) {
  const row = fresh().rows.find(r => norm(r[facet]?.text ?? '') === key);
  return row?.[facet]?.text ?? key;
}

const sortHead = (tab, key, label, cls) => {
  const s = ui.sort[tab], on = s.key === key;
  return `<th class="${cls}"${on ? ` aria-sort="${s.dir > 0 ? 'ascending' : 'descending'}"` : ''}><button class="th-sort${on ? ' is-on' : ''}" data-cmd="docs.sort" data-key="${key}">${label}<span class="th-arrow" aria-hidden="true">${on ? (s.dir > 0 ? '↑' : '↓') : ''}</span></button></th>`;
};
const tableWrap = (head, body) => `<div class="docs-body"><div class="table-wrap docs-scroll" data-keep="list"><table class="table docs-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div></div>`;

// The records a document concerns, as chips: in a table's cell the first, and how many more, since
// legal names run long and alike.
function subjectChips(subjects, max = 1) {
  if (!subjects.length) return '<span class="faint">—</span>';
  const more = subjects.length - max;
  return `<div class="chips docs-chips">${subjects.slice(0, max).map(s => Parts.chip(s.id, { computed: s.computed })).join('')}${more > 0
    ? `<span class="docs-more" title="${esc(subjects.slice(max).map(s => objectName(s.id)).join(', '))}">+${more}</span>` : ''}</div>`;
}
const statusBadge = cell => !cell ? '' : `<span class="${cell.computed ? 'computed-text' : ''}"${cell.computed ? ' title="Worked out by formula"' : ''}>${Parts.badge(cell.text, STATUS_TONES[norm(cell.text)] ?? '')}</span>`;
const cellText = (cell, cls = '') => !cell ? '' : `<span class="${cls}${cell.computed ? ' computed-text' : ''}"${cell.computed ? ' title="Worked out by formula"' : ''}>${esc(cell.text)}</span>`;

function linkedView(rows) {
  const shown = sorted(rows.filter(r => passes(r)), SORTS, ui.sort.linked);
  const tools = toolbar({ facets: true, shown: shown.length, total: rows.length, noun: 'documents' });
  if (!rows.length) return `<div class="docs-body is-empty">${Parts.empty({ title: 'No documents linked yet', desc: 'Link files from the library to record what they are and what they concern.', action: { label: 'Link document', cmd: 'docs.link' } })}</div>`;
  if (!shown.length) return `${tools}<div class="docs-body">${Parts.empty({ title: 'No documents match', desc: 'Nothing linked fits these filters.', action: { label: 'Clear filters', cmd: 'docs.clear' } })}</div>`;
  const head = `<th class="c-glyph"><span class="visually-hidden">File type</span></th>${sortHead('linked', 'name', 'Name', 'c-name')}${sortHead('linked', 'type', 'Type', 'c-type')}`
    + `${sortHead('linked', 'subjects', 'Concerns', 'c-subjects')}${sortHead('linked', 'date', 'Date', 'c-date')}${sortHead('linked', 'status', 'Status', 'c-status')}${sortHead('linked', 'where', 'Where it lives', 'c-where')}`;
  return tools + tableWrap(head, shown.map(row => {
    const check = checkOf(row.link);
    const flag = check?.state === 'missing' ? '<span class="docs-flag">Broken link</span>' : !row.link ? '<span class="docs-flag is-quiet">No file</span>' : '';
    return `<tr data-row="${esc(row.id)}" aria-selected="${ui.selected === row.id}">
      <td class="c-glyph">${glyph(row.url?.kind ?? 'other', row.link ? '' : 'is-empty')}</td>
      <td class="c-name"><div class="c-name-in"><a class="row-link" href="${Shell.recordHref(row.record)}" title="${esc(row.name)}">${esc(row.name)}</a>${flag}</div></td>
      <td class="c-type">${cellText(row.type)}</td>
      <td class="c-subjects">${subjectChips(row.subjects)}</td>
      <td class="c-date tnum">${row.date ? `<span class="${row.date.computed ? 'computed-text' : ''}">${Parts.date(row.date.iso)}</span>` : ''}</td>
      <td class="c-status">${statusBadge(row.status)}</td>
      <td class="c-where" title="${esc(row.link ?? '')}"><bdi>${esc(whereText(row.url))}</bdi></td></tr>`;
  }).join(''));
}

// While the library is read: rows of quiet bars the shape of the table to come.
const skeletonRows = (n, cols) => Array.from({ length: n }, (_, i) => `<tr class="is-skeleton">${cols.map(c => `<td class="${c}"><span class="skeleton" style="width:${c === 'c-name' ? 40 + ((i * 37) % 45) : 60}%"></span></td>`).join('')}</tr>`).join('');

function libraryNotice() {
  if (!lib.signedIn) return `<div class="docs-body">${Parts.empty({ title: 'Sign in to SharePoint', desc: 'Rboreal reads the library as you, so you see only files you can open.', action: { label: 'Sign in', cmd: 'docs.signin' } })}</div>`;
  if (lib.files.state === 'error') return `<div class="docs-body"><div class="notice is-danger">${esc(lib.files.message)} <button class="link-btn" data-cmd="docs.rescan">Try again</button></div></div>`;
  return '';
}

function unlinkedView(files) {
  const notice = libraryNotice();
  const loading = lib.files.state !== 'ok';
  const shown = sorted(files.filter(f => !ui.query || matches(norm(`${f.name} ${f.path} ${Object.values(f.fields ?? {}).map(columnText).join(' ')}`), ui.query)), FILE_SORTS, ui.sort.unlinked);
  const tools = toolbar({ facets: false, shown: shown.length, total: files.length, noun: 'files' });
  if (notice) return notice;
  const head = `<th class="c-glyph"><span class="visually-hidden">File type</span></th>${sortHead('unlinked', 'name', 'Name', 'c-name')}${sortHead('unlinked', 'type', 'Type in the library', 'c-type')}`
    + `${sortHead('unlinked', 'where', 'Folder', 'c-where c-folder')}${sortHead('unlinked', 'modified', 'Modified', 'c-date')}<th class="c-act"><span class="visually-hidden">Link</span></th>`;
  if (loading) return tools + tableWrap(head, skeletonRows(6, ['c-glyph', 'c-name', 'c-type', 'c-where c-folder', 'c-date', 'c-act']));
  if (!files.length) return `${tools}<div class="docs-body">${Parts.empty({ title: 'Every file is linked', desc: 'Each file in the library has a record that links to it.' })}</div>`;
  if (!shown.length) return `${tools}<div class="docs-body">${Parts.empty({ title: 'No files match', desc: 'No file that isn’t linked fits this search.', action: { label: 'Clear search', cmd: 'docs.clear' } })}</div>`;
  const capped = lib.files.capped ? `<p class="docs-foot faint">Showing the first ${count(lib.files.list.length, 'file')} in the library.</p>` : '';
  return tools + tableWrap(head, shown.map(f => `<tr data-row="${esc(f.id)}" aria-selected="${ui.selected === f.id}">
      <td class="c-glyph">${glyph(f.kind)}</td>
      <td class="c-name"><div class="c-name-in"><span class="docs-file-name" title="${esc(f.name)}">${esc(titleOf(f.name))}</span></div></td>
      <td class="c-type">${esc(columnText(f.fields?.DocumentType))}</td>
      <td class="c-where c-folder" title="${esc(f.path)}"><bdi>${esc(folderText(f.path))}</bdi></td>
      <td class="c-date tnum">${f.lastModified ? Parts.date(f.lastModified.slice(0, 10)) : ''}</td>
      <td class="c-act"><button class="btn btn-sm" data-cmd="docs.link-file" data-id="${esc(f.id)}" title="Link it, with the details its name and the library’s columns give">Link</button></td></tr>`).join('')) + capped;
}

function brokenView(broken) {
  const notice = !lib.signedIn ? libraryNotice() : '';
  if (notice) return notice;
  const shown = sorted(broken.filter(r => passes(r)), SORTS, ui.sort.broken);
  const tools = toolbar({ facets: false, shown: shown.length, total: broken.length, noun: 'documents' });
  const checking = fresh().rows.some(r => checkOf(r.link)?.state === 'checking');
  if (!broken.length) return `${tools}<div class="docs-body">${checking ? Parts.empty({ title: 'Checking links…', desc: 'Each SharePoint link is being looked up in the library.' })
    : Parts.empty({ title: 'Every link works', desc: 'Each SharePoint link leads to a file in the library.' })}</div>`;
  const head = `<th class="c-glyph"><span class="visually-hidden">File type</span></th>${sortHead('broken', 'name', 'Name', 'c-name')}${sortHead('broken', 'subjects', 'Concerns', 'c-subjects')}`
    + `${sortHead('broken', 'where', 'Linked to', 'c-where')}<th class="c-act is-wide"><span class="visually-hidden">Link again</span></th>`;
  return tools + tableWrap(head, shown.map(row => `<tr data-row="${esc(row.id)}" aria-selected="${ui.selected === row.id}">
      <td class="c-glyph">${glyph(row.url?.kind ?? 'other')}</td>
      <td class="c-name"><div class="c-name-in"><a class="row-link" href="${Shell.recordHref(row.record)}" title="${esc(row.name)}">${esc(row.name)}</a></div></td>
      <td class="c-subjects">${subjectChips(row.subjects)}</td>
      <td class="c-where" title="${esc(row.link)}"><bdi>${esc(whereText(row.url))}${row.url?.fileName ? ` › ${esc(row.url.fileName)}` : ''}</bdi></td>
      <td class="c-act is-wide"><button class="btn btn-sm" data-cmd="docs.relink" data-id="${esc(row.id)}">Link again…</button></td></tr>`).join(''));
}

// ---- The preview pane ----

const prop = (label, value) => value ? `<dt>${esc(label)}</dt><dd>${value}</dd>` : '';
const section = (title, body, note = '') => `<section class="pane-section"><h3 class="pane-h">${esc(title)}${note ? `<span class="pane-h-note">${note}</span>` : ''}</h3>${body}</section>`;
const skeleton = n => `<div class="skeleton-lines">${Array.from({ length: n }, (_, i) => `<span class="skeleton" style="width:${[72, 54, 64, 40][i % 4]}%"></span>`).join('')}</div>`;

function paneFrame({ kind, title, href, sub, actions, body }) {
  return `<aside class="docs-pane${ui.entering ? ' is-entering' : ''}" aria-label="Preview" data-keep="pane">
    <div class="pane-top">
      <div class="pane-head">
        ${glyph(kind, 'is-large')}
        <div class="pane-title-block">
          <h2 class="pane-title">${href ? `<a href="${href}">${esc(title)}</a>` : esc(title)}</h2>
          ${sub ? `<div class="pane-sub">${sub}</div>` : ''}
        </div>
        <button class="icon-btn" data-cmd="docs.close" aria-label="Close the preview" title="Close (Esc)">${icon('x')}</button>
      </div>
      <div class="pane-actions">${actions}</div>
    </div>
    ${body}
  </aside>`;
}
function openButton(link, p, primary = true) {
  return link ? `<a class="btn btn-sm${primary ? ' btn-primary' : ''}" href="${esc(link)}" target="_blank" rel="noopener" data-docs-open>${esc(openLabel(p))} ↗</a>` : '';
}

function docPane(row) {
  const check = checkOf(row.link);
  const item = check?.state === 'ok' ? check.item : null;
  const sub = [row.type && cellText(row.type, 'pane-sub-part'), row.date && `<span class="pane-sub-part tnum">${Parts.date(row.date.iso)}</span>`].filter(Boolean).join('<span class="dot-sep">·</span>');
  // A link that leads nowhere is linked again before anything else.
  const actions = [
    check?.state === 'missing' && row.own ? '<button class="btn btn-sm btn-primary" data-cmd="docs.relink">Link again…</button>'
      : row.link ? openButton(row.link, row.url) : row.own ? '<button class="btn btn-sm btn-primary" data-cmd="docs.relink">Link a file…</button>' : '',
    row.link ? `<button class="btn btn-sm" data-cmd="docs.copy" data-link="${esc(row.link)}">Copy link</button>` : '',
    row.own ? '<button class="btn btn-sm" data-cmd="docs.edit">Edit details</button>' : `<a class="btn btn-sm" href="${Shell.recordHref(row.record)}">Open record</a>`,
  ].join('');
  const groups = row.own ? relationSections(row.id) : section('Concerns', subjectChips(row.subjects, Infinity));
  return paneFrame({ kind: item?.kind ?? row.url?.kind ?? 'other', title: row.name, href: Shell.recordHref(row.record), sub, actions,
    body: groups + detailsSection(row) + librarySection(row, check) + versionsSection(item) });
}

// The relations a document is in, a section for each: Concerns, and any others. A relation's name reads
// from its first argument (a document concerns its subjects), so a section is titled by its list name
// where it has one, or else the relation's name if the document comes first, or the other side's label.
function relationSections(docId) {
  const groups = relationGroups(docId).filter(g => g.others.length);
  if (!groups.length) return section('Concerns', `<p class="pane-empty">No records yet. <button class="link-btn" data-cmd="docs.edit">Add the records it concerns</button></p>`);
  return groups.map(g => {
    const first = names[g.form]?.edges?.[0] ?? records[g.ids[0]].args[0].edge;
    const title = !same(g.list, g.others[0]) ? g.list : same(first, g.own[0]) ? formName(g.form) : g.others[0];
    const chips = g.ids.filter(rid => !(isTag(records[rid]) && !records[rid].tag)).flatMap(rid => records[rid].args.filter(a => a.at !== docId)
      .flatMap(a => holdersOf(a.at)).map(h => ({ id: h, computed: isComputed(rid), detail: isTag(records[rid]) ? '' : Parts.outputText(records[rid]) })));
    const body = chips.length ? `<div class="chips">${chips.map(c => Parts.chip(c.id, c)).join('')}</div>` : '<p class="pane-empty">None</p>';
    return section(title, body);
  }).join('');
}

// What the chart records about the document, besides its name and link: its status, type, date and
// version, then whatever else it has.
function detailsSection(row) {
  if (!row.own) return section('Details', `<dl class="props">${prop('Recorded as', esc(row.type.text))}${prop('On', isObject(records[row.record]) ? Parts.link(row.record) : esc(segmentText(row.record)))}</dl>`);
  const shown = new Set([nameRecordOf(row.id), row.linkId, row.type?.id, row.date?.id, row.status?.id, row.version?.id]);
  const rest = entriesOf(row.id).filter(e => !shown.has(e));
  // Dates read as they do everywhere on this page.
  const value = id => isField(records[id]) && records[id].field === 'date'
    ? `<span class="tnum${isComputed(id) ? ' computed-text' : ''}"${isComputed(id) ? ' title="Worked out by formula"' : ''}>${Parts.date(records[id].value)}</span>` : Parts.output(id);
  const out = cell => cell ? prop(records[cell.id].edge, value(cell.id)) : '';
  const body = prop('Status', row.status && statusBadge(row.status)) + out(row.type) + out(row.date) + out(row.version)
    + rest.map(e => prop(records[e].edge, value(e))).join('');
  return section('Details', body ? `<dl class="props">${body}</dl>` : `<p class="pane-empty">Nothing recorded yet. <button class="link-btn" data-cmd="docs.edit">Add details</button></p>`);
}

// What the library says about the file, read just now: where it is, its version, who changed it last,
// and the library's own columns, each marked where it differs from what the chart records.
function librarySection(row, check) {
  if (!row.link) return '';
  const title = row.url?.isSharePoint ? 'In SharePoint' : `In ${systemName(row.url)}`;
  if (!check) {
    const why = row.url?.isSharePoint ? 'The demo reads only its own library. Connect this tenant in Settings to read it.' : `Rboreal reads a file’s details from SharePoint; this one is in ${systemName(row.url)}.`;
    return section(title, `<dl class="props">${prop('Address', `<span class="docs-address">${esc(row.link)}</span>`)}</dl><p class="pane-note">${esc(why)}</p>`);
  }
  if (!lib.signedIn) return section(title, `<p class="pane-note">Sign in to read this file’s details. <button class="link-btn" data-cmd="docs.signin">Sign in</button></p>`);
  if (check.state === 'checking') return section(title, skeleton(4));
  if (check.state !== 'ok') return section(title, `<div class="notice${check.state === 'missing' ? ' is-danger' : ''}">${esc(check.message)}</div>
    <dl class="props">${prop('Linked to', `<span class="docs-address">${esc(whereText(row.url))}${row.url?.fileName ? ` › ${esc(row.url.fileName)}` : ''}</span>`)}</dl>`);
  return section(title, itemProps(check.item, row), '<span class="live-dot" aria-hidden="true"></span>Read live from the library');
}
function itemProps(item, row = null) {
  const differs = (label, theirs) => {
    if (!row?.own || !theirs) return '';
    const role = ['type', 'date'].find(r => ROLES[r].labels.some(l => same(l, label)));
    const ours = role === 'type' ? row.type?.text : role === 'date' ? row.date?.iso : null;
    if (!role || !ours) return '';
    const mismatch = role === 'date' ? isoDay(theirs) !== ours : !same(theirs, ours);
    return mismatch ? `<span class="docs-differs" title="The chart records ${esc(role === 'date' ? Parts.date(ours) : ours)}">Differs from the record</span>` : '';
  };
  const columns = Object.entries(item.fields ?? {}).map(([k, v]) => {
    const text = columnText(v), label = columnName(k);
    return prop(label, text ? `${esc(isoDay(text) ? Parts.date(isoDay(text)) : text)}${differs(label, text)}` : '');
  }).join('');
  return `<dl class="props">
    ${prop('Folder', esc([connector.isDemo() ? 'Documents' : connector.config().library || 'Documents', ...item.path.split('/').filter(Boolean)].join(' › ')))}
    ${prop('File', `<span class="docs-address">${esc(item.name)}</span>`)}
    ${prop('Version', item.version ? `<span class="tnum">${esc(item.version)}</span>` : '')}
    ${prop('Modified', item.lastModified ? `<span class="tnum">${Parts.date(item.lastModified.slice(0, 10))}</span>${item.lastModifiedBy ? ` by ${esc(item.lastModifiedBy)}` : ''}` : '')}
    ${prop('Created by', item.createdBy && item.createdBy !== item.lastModifiedBy ? esc(item.createdBy) : '')}
    ${prop('Size', item.size ? `<span class="tnum">${sizeText(item.size)}</span>` : '')}
  </dl>${columns ? `<h4 class="pane-h4">Library columns</h4><dl class="props">${columns}</dl>` : ''}`;
}
function versionsSection(item) {
  if (!item) return '';
  const v = lib.versions.get(item.id) ?? { state: 'loading' };
  if (v.state === 'loading') return section('Versions', skeleton(2));
  if (v.state === 'error') return section('Versions', `<p class="pane-note">${esc(v.message)}</p>`);
  if (!v.list.length) return '';
  const list = ui.allVersions ? v.list : v.list.slice(0, 4);
  return section('Versions', `<ol class="versions">${list.map((x, i) => `<li class="version">
      <span class="version-id tnum">${esc(x.id)}</span>
      <span class="version-what">${x.lastModified ? `<span class="tnum">${Parts.date(x.lastModified.slice(0, 10))}</span>` : ''}${x.lastModifiedBy ? `<span class="faint"> · ${esc(x.lastModifiedBy)}</span>` : ''}</span>
      ${i === 0 ? Parts.badge('Current', 'faint') : '<span></span>'}</li>`).join('')}</ol>
    ${v.list.length > list.length ? `<button class="link-btn pane-more" data-cmd="docs.versions">Show all ${v.list.length}</button>` : ''}`, v.list.length > 1 ? `${v.list.length} in SharePoint` : '');
}

// A file no record links to: what Link would record, then what the library says.
function filePane(file) {
  const g = guess(file);
  const p = SharePoint.parseDocUrl(file.webUrl);
  const actions = `<button class="btn btn-sm btn-primary" data-cmd="docs.link-file" data-id="${esc(file.id)}">Link document</button>
    <button class="btn btn-sm" data-cmd="docs.link-details" data-id="${esc(file.id)}">Link with details…</button>${openButton(file.webUrl, p, false)}`;
  const would = `<dl class="props">${prop('Name', esc(g.name))}${prop(entrySpec('type').label, g.type ? esc(g.type) : '<span class="faint">None found</span>')}
    ${prop(entrySpec('date').label, g.date ? `<span class="tnum">${Parts.date(g.date)}</span>` : '<span class="faint">None found</span>')}
    ${g.status ? prop('Status', statusBadge({ text: g.status })) : ''}
    ${prop('Concerns', g.subjects.length ? `<div class="chips">${g.subjects.map(id => Parts.chip(id)).join('')}</div>` : '<span class="faint">No records found</span>')}</dl>`;
  return paneFrame({ kind: file.kind, title: titleOf(file.name), sub: `<span class="faint">${esc(folderText(file.path) || 'Documents')}</span>`, actions,
    body: section('Link will record', would, 'from its name and the library’s columns') + section('In SharePoint', itemProps(file), '<span class="live-dot" aria-hidden="true"></span>Read live from the library') + versionsSection(file) });
}

// ---- Guessing what a file is ----

// What a file suggests about itself: what to call it, its type, date and status, and the records it
// concerns. The library's columns say first; the file's name, failing them. `from` lists what the
// library's columns gave.
function guess(file) {
  const title = titleOf(file.name);
  const cols = new Map(Object.entries(file.fields ?? {}).map(([k, v]) => [norm(columnName(k)), columnText(v)]));
  const col = labels => labels.map(l => cols.get(norm(l))).find(v => clean(v));
  const from = [];
  const fromCol = (role, labels, read) => { const v = col(labels); const out = v ? read(v) : null; if (out) from.push(role); return out; };
  const typeOptions = optionsOf('type'), statusOptions = optionsOf('status');
  const pick = (options, v) => options.find(o => same(o, v)) ?? clean(v);
  const type = fromCol('type', ROLES.type.labels, v => pick(typeOptions, v))
    ?? [...typeOptions].sort((a, b) => b.length - a.length).find(o => norm(title).includes(norm(o))) ?? '';
  const date = fromCol('date', ROLES.date.labels, v => parseDate(isoDay(v) ?? clean(v)))
    ?? parseDate(/\b(\d{4}-\d{2}-\d{2})\b/.exec(title)?.[1] ?? '') ?? '';
  const word = [['executed', 'Executed'], ['signed', 'Executed'], ['filed', 'Filed'], ['draft', 'Draft'], ['superseded', 'Superseded']].find(([w]) => new RegExp(`\\b${w}\\b`, 'i').test(title));
  const status = fromCol('status', ROLES.status.labels, v => pick(statusOptions, v)) ?? (word ? pick(statusOptions, word[1]) : '');
  const named = col(['Entity', 'Entities', 'Subject', 'Concerns']);
  if (named) from.push('subjects');
  return { name: title, link: file.webUrl, type, date, status, version: '', subjects: subjectsNamedIn([named, title].filter(Boolean).join(' | ')), from };
}
// The objects whose names a text mentions, longest names first, so a feeder's name isn't also read as its
// main fund's. Documents aside; short names are too likely to be words.
function subjectsNamedIn(text) {
  let t = norm(text);
  const out = [];
  const candidates = Object.keys(records).filter(id => isObject(records[id]) && !isDocObject(id))
    .map(id => [id, norm(objectName(id)).replace(/[.,]+$/, '')]).filter(([, n]) => n.length >= 6).sort((a, b) => b[1].length - a[1].length);
  for (const [id, n] of candidates) if (t.includes(n)) { out.push(id); t = t.split(n).join(' | '); }
  return out;
}

// ---- Writing to the chart ----
// Every edit is one change through the model, so it can be undone and is recorded in the History.

// The relation a document's subjects are recorded by: the chart's relation named Concerns, between a
// document and something else, or one with Concerns' edges, or Concerns as it would be made.
function concernsRelation() {
  const doc = docKindKey();
  let likely = null;
  for (const k of indexOf().relationsAt.get(doc) ?? []) {
    const t = schema[k];
    if (t.args.length !== 2 || !('tag' in t.out)) continue;
    const i = t.args.findIndex(a => treeKey(a.loc) === doc);
    if (treeKey(t.args[1 - i].loc) === doc) continue;
    const rel = { doc: t.args[i].edge, subject: t.args[1 - i].edge, form: formOfTree(t) };
    if (same(formName(rel.form), CONCERNS.name)) return rel;
    if (same(rel.doc, CONCERNS.doc) && same(rel.subject, CONCERNS.subject)) likely ??= rel;
  }
  return likely ?? { doc: CONCERNS.doc, subject: CONCERNS.subject, form: null };
}
// The names with Concerns named, if the relation just recorded (`relId`, in `next`) is of a form that has
// no name yet, and its subjects' list named Documents.
function namesWithConcerns(next, relId) {
  const t = relId && treeOf(next, relId);
  if (!t) return names;
  const form = formOfTree(t);
  if (names[form]?.name) return names;
  const rel = concernsRelation();
  return { ...names, [form]: { lists: { [rel.subject]: { [rel.doc]: CONCERNS.list } }, ...names[form], name: CONCERNS.name, edges: [rel.doc, rel.subject] } };
}
// A new kind's boxes would crowd the structure chart, so a chart's first document gets the Kind style's
// preset in every view with its boxes hidden. View › Show on the chart shows them.
function introduceKind() {
  ensureKindStyles(DOC_KIND);
  const k = norm(DOC_KIND);
  forEveryView(list => list.map(s => isKindStyle(s) ? { ...s, map: { ...s.map, [k]: { ...KIND_PRESET, ...s.map[k], show: false } } } : s));
}

// An entry's record, with a value of its role's type: a choice's option, or a field's value.
function entryRecord(at, spec, value) {
  if (spec.type === 'choice') return { at, edge: spec.label, choice: clean(value) };
  const v = spec.datatype === 'date' || spec.datatype === 'document' ? value : parseValue(spec.datatype ?? 'text', value) ?? clean(value);
  return { at, edge: spec.label, field: spec.datatype ?? 'text', value: v };
}
// A form's value for a role, as stored: dates as ISO dates, the rest as typed.
const formValue = (form, role) => role === 'date' ? form.dateIso : clean(form[role]);

// Records a file as a new Document, with its details and the records it concerns, as one change.
// Returns { id } or { error }.
function linkDocument(form) {
  const obj = newId();
  const next = { ...records, [obj]: { kind: DOC_KIND } };
  next[newId()] = { at: obj, edge: 'Name', field: 'text', value: clean(form.name) };
  for (const role of Object.keys(ROLES)) {
    const v = formValue(form, role);
    if (v) next[newId()] = entryRecord(obj, entrySpec(role), v);
  }
  const rel = concernsRelation();
  let relId = null;
  for (const s of form.subjects) next[relId = newId()] = { args: [{ edge: rel.doc, at: obj }, { edge: rel.subject, at: s }], tag: true };
  const newKind = !kindsInState().some(k => same(k, DOC_KIND));
  const error = change({ entered: enteredPart(next), names: namesWithConcerns(next, relId) }, newKind ? { after: introduceKind } : {});
  return error ? { error } : { id: obj };
}

// Saves a document's details as edited, as one change: each role's entry set, changed or removed (with
// whatever's located at it), and the records it concerns added or let go. What's left as it was isn't
// touched, so a computed value stays computed. Returns why not, if it couldn't.
function saveDetails(row, form) {
  const next = { ...records };
  const drop = ids => { for (const k of withDependents(ids)) delete next[k]; };
  const nameId = nameRecordOf(row.id);
  if (records[nameId].value !== clean(form.name)) next[nameId] = { ...records[nameId], value: clean(form.name) };
  for (const role of Object.keys(ROLES)) {
    const id = role === 'link' ? row.linkId : row[role]?.id, r = id && records[id];
    const v = formValue(form, role);
    if (!r) { if (v) next[newId()] = entryRecord(row.id, entrySpec(role), v); continue; }
    if (!v) { drop([id]); continue; }
    if (isChoice(r)) { if (!same(r.choice, v)) next[id] = { ...r, choice: v }; continue; }
    const value = entryRecord(row.id, { label: r.edge, type: 'field', datatype: r.field }, v).value;
    if (r.value !== value) next[id] = { ...r, value };
  }
  const rel = concernsRelation();
  const had = subjectsOf(row.id), want = new Set(form.subjects);
  drop(had.filter(s => !s.computed && !want.has(s.id) && records[s.rel] && !isComputed(s.rel)).map(s => s.rel));
  let relId = null;
  for (const s of form.subjects) if (!had.some(h => h.id === s)) next[relId = newId()] = { args: [{ edge: rel.doc, at: row.id }, { edge: rel.subject, at: s }], tag: true };
  return change({ entered: enteredPart(next), names: namesWithConcerns(next, relId) });
}

// Points a document at another file, keeping everything else: its link, or a new Link if it had none.
function relink(row, url) {
  if (row.linkId) return saveFieldValue(row.linkId, url);
  return addFieldValue(row.id, entrySpec('link').label, url, 'document');
}

// One click on a file no record links to: linked, with what its name and the library's columns give.
function linkFile(file) {
  const g = guess(file);
  const { error, id } = linkDocument({ ...g, dateIso: g.date });
  if (error) return Shell.toast(error, { tone: 'error' });
  if (ui.selected === file.id) {
    const list = sorted(unlinkedFiles(), FILE_SORTS, ui.sort.unlinked);
    ui.selected = list[0]?.id ?? null;
  }
  render();
  Shell.toast(`Linked ${g.name}`, { undo: true });
  return id;
}

// ---- The facet menus ----
// A facet's menu stays open while options are picked, and closes on a click elsewhere or Esc.

function facetOptions(facet) {
  const rows = fresh().rows.filter(r => passes(r, facet));
  const counts = new Map();
  for (const r of rows) for (const k of facetKey(facet, r)) counts.set(k, (counts.get(k) ?? 0) + 1);
  for (const k of ui.facets[facet]) if (!counts.has(k)) counts.set(k, 0);
  const text = k => facet === 'subject' ? objectName(k) : k ? optionText(facet, k) : `No ${FACETS[facet].toLowerCase()}`;
  let list = [...counts].map(([key, n]) => ({ key, n, text: text(key), title: facet === 'subject' && records[key] ? Shell.subtitleOf(key) : '' }));
  if (facet === 'subject' && ui.pop?.query) list = list.filter(o => matches(norm(o.text), ui.pop.query));
  return list.sort((a, b) => (!a.key) - (!b.key) || byLabel(a.text, b.text));
}
function popHtml() {
  const { facet } = ui.pop;
  const options = facetOptions(facet);
  const item = o => `<button class="menu-item" role="menuitemcheckbox" aria-checked="${ui.facets[facet].has(o.key)}" data-cmd="docs.pick" data-value="${esc(o.key)}" title="${esc(o.title || o.text)}">
      <span class="menu-check">${ui.facets[facet].has(o.key) ? icon('check') : ''}</span><span class="menu-text">${esc(o.text)}</span><span class="menu-hint tnum">${o.n}</span></button>`;
  return `<div class="pop docs-pop" role="dialog" aria-label="Filter by ${FACETS[facet].toLowerCase()}">
    ${facet === 'subject' ? `<div class="docs-pop-search"><input class="input" placeholder="Find a record" value="${esc(ui.pop.query)}" data-docs-input="pop" aria-label="Find a record" autocomplete="off"></div>` : ''}
    <div class="docs-pop-list">${options.map(item).join('') || '<div class="menu-head">Nothing to filter by</div>'}</div>
    ${facet === 'subject' ? `<div class="menu-sep"></div><button class="menu-item" role="menuitemcheckbox" aria-checked="${ui.below}" data-cmd="docs.below">
      <span class="menu-check">${ui.below ? icon('check') : ''}</span><span class="menu-text"><span class="menu-title">Include what they own</span><span class="menu-desc">Documents concerning anything below them by ownership</span></span></button>` : ''}
  </div>`;
}

// ---- The dialog: linking a document, and editing one's details ----
// ui.dialog is { mode, step, ... }: mode 'link' (a new document), 'edit' (a document's details) or
// 'relink' (another file for a document); step 'browse' (picking a file) or 'details' (the form).
// Browsing keeps the folders opened (`trail`), what's in the last (`list`), a search, and a pasted link.
// The form keeps the file and every value as typed.

const layerEl = () => document.getElementById('docs-layer');

function openDialog(d) {
  closePop();
  ui.dialog = { error: '', cq: '', cqOpen: false, cqActive: 0, ...d };
  ui.dialog.returnFocus = document.activeElement;
  if (ui.dialog.step === 'browse') browseTo([]);
  drawDialog(true);
}
function closeDialog() {
  const back = ui.dialog?.returnFocus;
  ui.dialog = null;
  drawDialog();
  if (back?.isConnected) back.focus();
}

function browseTo(trail) {
  const d = ui.dialog;
  d.trail = trail;
  d.query = '';
  d.list = { state: 'loading', items: [] };
  const folder = trail.at(-1);
  const at = d;
  queued(() => folder ? connector.listChildren(folder.driveId, folder.id) : connector.listChildren())
    .then(items => ({ state: 'ok', items }), e => ({ state: 'error', items: [], message: failure(e).message }))
    .then(list => { if (ui.dialog === at && at.trail === trail) { at.list = list; drawDialog(); } });
}
let searchTimer = 0;
function searchLibrary(query) {
  const d = ui.dialog;
  d.query = query;
  clearTimeout(searchTimer);
  if (!clean(query)) { d.results = null; return drawDialog(); }
  d.results = d.results ?? { state: 'loading', items: [] };
  searchTimer = setTimeout(() => {
    queued(() => connector.search(query)).then(items => ({ state: 'ok', items }), e => ({ state: 'error', items: [], message: failure(e).message }))
      .then(results => { if (ui.dialog === d && d.query === query) { d.results = results; drawDialog(); } });
  }, 200);
  drawDialog();
}

// A file picked, by browsing or by its link: on to its details, or for a relink, saved at once.
function chooseFile(file) {
  const d = ui.dialog;
  if (d.mode === 'relink') {
    const row = rowById(d.rowId);
    const error = relink(row, file.webUrl);
    if (error) { d.error = error; return drawDialog(); }
    closeDialog();
    render();
    return Shell.toast(`Linked ${row.name} again`, { undo: true });
  }
  if (d.mode === 'edit') { Object.assign(d.form, { file, link: file.webUrl }); d.step = 'details'; return drawDialog(true); }
  const g = guess(file);
  d.form = { file, name: g.name, link: g.link, type: g.type, date: g.date ? Parts.date(g.date) : '', status: g.status, version: '', subjects: g.subjects, from: g.from };
  d.step = 'details';
  drawDialog(true);
}
// A pasted link: read from SharePoint where it can be, or taken as it is (an EDGAR filing, a DMS link).
async function usePasted() {
  const d = ui.dialog, url = clean(d.paste);
  if (!isAddress(url)) { d.pasteError = 'That isn’t a link. Paste the address of a file, from SharePoint’s Copy link or the address bar.'; return drawDialog(); }
  const p = SharePoint.parseDocUrl(url);
  if (!checkable(url)) return chooseFile({ name: p.fileName ?? documentName(url), webUrl: url, path: p.folderPath, kind: p.kind, fields: {} });
  d.pasteError = '';
  d.pasting = true;
  drawDialog();
  let item = null;
  try { item = await connector.resolveShareUrl(url); } catch (e) { d.pasteError = failure(e).message; }
  d.pasting = false;
  if (ui.dialog !== d) return;
  item ? chooseFile(item) : drawDialog();
}

function dialogHtml() {
  const d = ui.dialog;
  const title = d.mode === 'edit' && d.step === 'details' ? 'Edit details' : d.mode === 'link' ? 'Link document' : d.mode === 'relink' ? `Link ${esc(rowById(d.rowId)?.name ?? 'the document')} again` : 'Choose another file';
  const sub = d.step === 'browse' ? `Pick a file in ${esc(libraryName())}, or paste a link to one.` : d.mode === 'link' ? 'Say what it is and which records it concerns.' : '';
  const body = d.step === 'browse' ? browseHtml(d) : formHtml(d);
  const actions = d.step === 'browse'
    ? `${d.mode === 'edit' ? '<button class="btn" data-cmd="docs.dd-back">Back</button>' : ''}<span class="dd-spacer"></span><button class="btn" data-cmd="docs.dd-close">Cancel</button>`
    : `${d.mode === 'link' ? '<button class="btn" data-cmd="docs.dd-change">Back</button>' : ''}<span class="dd-spacer"></span><button class="btn" data-cmd="docs.dd-close">Cancel</button>
       <button class="btn btn-primary" data-cmd="docs.dd-save">${d.mode === 'link' ? 'Link document' : 'Save'}</button>`;
  // The dialog animates in once; drawn again, it stays put.
  const settled = d.drawn ? ' is-settled' : '';
  d.drawn = true;
  return `<div class="scrim docs-scrim${settled}" data-cmd="docs.dd-close"></div>
    <div class="dialog docs-dialog${d.step === 'browse' ? ' is-browse' : ''}${settled}" role="dialog" aria-modal="true" aria-labelledby="docs-dialog-title">
      <div class="dd-head"><h2 class="dialog-title" id="docs-dialog-title">${title}</h2>${sub ? `<p class="dd-sub">${sub}</p>` : ''}</div>
      <div class="dd-body">${body}</div>
      ${d.error ? `<div class="dd-error" role="alert">${esc(d.error)}</div>` : ''}
      <div class="dialog-actions dd-actions">${actions}</div>
    </div>`;
}

function browseHtml(d) {
  const linked = new Map(fresh().rows.filter(r => r.link).map(r => [linkKey(r.link), r]));
  const linkedTo = it => linked.get(linkKey(it.webUrl)) ?? fresh().rows.find(r => itemOf(r.link)?.id === it.id);
  const searching = !!clean(d.query);
  const list = searching ? d.results ?? { state: 'loading', items: [] } : d.list;
  const crumbs = [{ name: 'Documents' }, ...d.trail].map((f, i, all) => i === all.length - 1 && !searching
    ? `<span class="dd-crumb is-here">${esc(f.name)}</span>` : `<button class="dd-crumb" data-cmd="docs.dd-folder" data-index="${i}">${esc(f.name)}</button>`).join(`<span class="dd-crumb-sep">›</span>`);
  const row = it => {
    const doc = !it.isFolder && linkedTo(it);
    const meta = it.isFolder ? '' : `<span class="dd-item-meta tnum">${it.lastModified ? Parts.date(it.lastModified.slice(0, 10)) : ''}</span>`;
    const where = searching && it.path ? `<span class="dd-item-path">${esc(folderText(it.path))}</span>` : '';
    if (doc && d.mode !== 'relink') return `<div class="dd-item is-linked" title="Linked as ${esc(doc.name)}">${glyph(it.kind)}<span class="dd-item-text"><span class="dd-item-name">${esc(it.name)}</span>${where}</span><span class="dd-item-tag">Linked</span>${meta}</div>`;
    return `<button class="dd-item" data-cmd="${it.isFolder ? 'docs.dd-open' : 'docs.dd-file'}" data-id="${esc(it.id)}">${glyph(it.kind)}<span class="dd-item-text"><span class="dd-item-name">${esc(it.name)}</span>${where}</span>${meta}${it.isFolder ? icon('chevron-right', 'dd-item-chevron') : ''}</button>`;
  };
  const items = list.state === 'loading' ? `<div class="dd-loading">${skeleton(5)}</div>`
    : list.state === 'error' ? `<div class="dd-empty">${esc(list.message)}</div>`
    : !list.items.length ? `<div class="dd-empty">${searching ? `Nothing in the library matches “${esc(d.query)}”.` : 'This folder is empty.'}</div>`
    : list.items.filter(it => !(it.isFolder && !d.trail.length && same(it.name, connector.config().workbookFolder || 'Rboreal'))).map(row).join('');
  return `<label class="search-input dd-search">${icon('search')}<input class="input" type="search" placeholder="Search the library" value="${esc(d.query ?? '')}" data-docs-input="dd-query" aria-label="Search the library" autocomplete="off" spellcheck="false" data-autofocus></label>
    <nav class="dd-crumbs" aria-label="Folder">${searching ? '<span class="dd-crumb is-here">Search results</span>' : crumbs}</nav>
    <div class="dd-list" role="list">${items}</div>
    <div class="dd-paste">
      <label class="dd-paste-label" for="dd-paste">Or paste a link</label>
      <input class="input" id="dd-paste" value="${esc(d.paste ?? '')}" placeholder="https://contoso.sharepoint.com/…" data-docs-input="dd-paste" autocomplete="off" spellcheck="false">
      <button class="btn btn-sm" data-cmd="docs.dd-paste"${d.pasting ? ' disabled' : ''}>${d.pasting ? 'Reading…' : 'Use link'}</button>
    </div>
    ${d.pasteError ? `<p class="dd-field-error">${esc(d.pasteError)}</p>` : ''}`;
}

function formHtml(d) {
  const f = d.form;
  const file = f.file;
  const p = SharePoint.parseDocUrl(f.link);
  const where = file?.path !== undefined ? folderText(file.path) : whereText(p);
  const fileRow = `<div class="dd-file">${glyph(file?.kind ?? p.kind, 'is-large')}<div class="dd-file-text"><div class="dd-file-name">${esc(file?.name ?? fileNameOf(f.link) ?? f.link ?? 'No file')}</div>
      <div class="dd-file-where">${esc(where || systemName(p))}</div></div>
      <button class="btn btn-sm btn-ghost" data-cmd="docs.dd-change">${f.link ? 'Change file' : 'Choose a file'}</button></div>`;
  const label = role => esc(entrySpec(role).label);
  const select = role => `<button class="docs-select${f[role] ? '' : ' is-empty'}" data-cmd="docs.dd-choose" data-role="${role}" aria-haspopup="menu" id="dd-${role}">
      <span class="docs-select-text">${esc(f[role] || (role === 'type' ? 'Choose a type' : 'Choose a status'))}</span>${icon('chevron-down')}</button>`;
  const from = f.from?.length ? `<p class="dd-note">Filled in from the library’s columns: ${esc(joinList(f.from.map(r => ({ type: 'the type', date: 'the date', status: 'the status', subjects: 'the records it concerns' })[r])))}.</p>` : '';
  const computed = d.mode === 'edit' ? subjectsOf(d.rowId).filter(s => s.computed) : [];
  return `${fileRow}
    <div class="dd-form">
      <label for="dd-name">Name</label><input class="input" id="dd-name" value="${esc(f.name)}" data-docs-input="name" autocomplete="off" spellcheck="false" data-autofocus>
      <label for="dd-type">${label('type')}</label>${select('type')}
      <label for="dd-date">${label('date')}</label><input class="input" id="dd-date" value="${esc(f.date)}" placeholder="Like Jun 30, 2024" data-docs-input="date" autocomplete="off">
      <label for="dd-status">${label('status')}</label>${select('status')}
      <label for="dd-version">${label('version')}</label><input class="input" id="dd-version" value="${esc(f.version)}" placeholder="Like A&amp;R 2024" data-docs-input="version" autocomplete="off">
      <label for="dd-cq">Concerns</label>${subjectsField(f, computed)}
    </div>${from}`;
}
// The records a document concerns, as chips to take away, and a box to find more. Those a formula
// worked out stay, since the formula would only put them back.
function subjectsField(f, computed) {
  const chosen = f.subjects.map(id => `<span class="chip">${esc(objectName(id))}<button class="chip-x" data-cmd="docs.dd-unsubject" data-id="${esc(id)}" aria-label="Remove ${esc(objectName(id))}">${icon('x')}</button></span>`);
  const fixed = computed.map(s => Parts.chip(s.id, { computed: true }));
  const options = subjectOptions(f);
  const d = ui.dialog;
  const list = d.cqOpen && options.length ? `<div class="pop listbox dd-listbox" id="dd-cq-list" role="listbox">${options.map((id, i) => `<div class="option" role="option" id="dd-cq-${i}" aria-selected="${i === d.cqActive}" data-cmd="docs.dd-subject" data-id="${esc(id)}">
      <span class="option-label">${esc(objectName(id))}</span><span class="option-meta">${esc(Shell.subtitleOf(id))}</span></div>`).join('')}</div>` : '';
  return `<div class="dd-subjects">
    ${chosen.length || fixed.length ? `<div class="chips">${[...fixed, ...chosen].join('')}</div>` : ''}
    <div class="combo"><input class="input" id="dd-cq" value="${esc(d.cq)}" placeholder="Add a record…" data-docs-input="cq" role="combobox" aria-expanded="${!!list}" aria-controls="dd-cq-list" autocomplete="off" spellcheck="false"${list ? ` aria-activedescendant="dd-cq-${d.cqActive}"` : ''}>${list}</div>
  </div>`;
}
function subjectOptions(f) {
  const q = ui.dialog.cq;
  const taken = new Set(f.subjects);
  return Object.keys(records).filter(id => isObject(records[id]) && !isDocObject(id) && !taken.has(id) && (!clean(q) || matches(norm(`${objectName(id)} ${records[id].kind}`), q)))
    .sort((a, b) => byLabel(objectName(a), objectName(b))).slice(0, 8);
}

function saveDialog() {
  const d = ui.dialog, f = d.form;
  if (!clean(f.name)) { d.error = 'A document needs a name.'; return drawDialog(); }
  f.dateIso = clean(f.date) ? parseDate(clean(f.date)) : '';
  if (f.dateIso === null) { d.error = `${entrySpec('date').label} takes a date, like Jun 30, 2024.`; return drawDialog(); }
  if (d.mode === 'link') {
    const { error, id } = linkDocument(f);
    if (error) { d.error = error; return drawDialog(); }
    closeDialog();
    Object.assign(ui, { tab: 'linked', selected: id, entering: true });
    writeHash();
    render();
    return Shell.toast(`Linked ${clean(f.name)}`, { undo: true });
  }
  const error = saveDetails(rowById(d.rowId), f);
  if (error) { d.error = error; return drawDialog(); }
  closeDialog();
  render();
  Shell.toast('Saved the details', { undo: true });
}

// Edit details starts from the document as it's recorded.
function editForm(row) {
  return { file: itemOf(row.link) ?? (row.link ? { name: fileNameOf(row.link), path: undefined, kind: row.url.kind } : null), name: row.name, link: row.link ?? '',
    type: row.type?.text ?? '', date: row.date ? Parts.date(row.date.iso) : '', status: row.status?.text ?? '', version: row.version?.text ?? '',
    subjects: subjectsOf(row.id).filter(s => !s.computed).map(s => s.id) };
}

// Draws the dialog and the facet menu, keeping the focus and the caret where they were.
function drawLayer(focusFirst = false) {
  const el = layerEl();
  if (!el) return;
  const was = document.activeElement, key = was?.dataset?.docsInput, at = key ? [was.selectionStart, was.selectionEnd] : null;
  const listTop = el.querySelector('.dd-list')?.scrollTop ?? 0;
  el.innerHTML = (ui.dialog ? dialogHtml() : '') + (ui.pop ? popHtml() : '');
  if (ui.pop) placePop();
  const list = el.querySelector('.dd-list');
  if (list && !focusFirst) list.scrollTop = listTop;
  const again = key && el.querySelector(`[data-docs-input="${key}"]`);
  const lost = !document.activeElement || document.activeElement === document.body || !document.activeElement.isConnected;
  if (again) { again.focus(); try { again.setSelectionRange(...at); } catch {} }
  else if (focusFirst || (ui.dialog && lost)) el.querySelector('[data-autofocus]')?.focus();
}
const drawDialog = drawLayer;

function placePop() {
  const pop = layerEl().querySelector('.docs-pop');
  const anchor = document.querySelector(`[data-facet="${ui.pop.facet}"]`);
  if (!pop || !anchor) return;
  const a = anchor.closest('.filter-chip').getBoundingClientRect();
  pop.style.left = `${Math.max(8, Math.min(a.left, innerWidth - pop.offsetWidth - 8))}px`;
  pop.style.top = `${a.bottom + 6}px`;
}
function closePop() { if (ui.pop) { ui.pop = null; drawLayer(); render(); } }

// ---- The library's own menu, in the top bar ----

function sourceMenu(el) {
  const demo = connector.isDemo();
  Shell.menu(el, [
    { head: demo ? 'A demo library, so the app works offline' : lib.signedIn ? `Signed in as ${lib.who ?? 'you'}` : 'Not signed in' },
    { label: libraryName(), hint: '↗', run: () => openLink(demo ? SharePoint.DEMO.library : connector.config().siteUrl) },
    { sep: true },
    ...(demo ? [] : [lib.signedIn ? { label: 'Sign out', run: async () => { await connector.signOut(); lib.signedIn = false; render(); } } : { label: 'Sign in', run: signIn }]),
    { label: demo ? 'Connect your SharePoint…' : 'SharePoint settings', run: () => { location.href = 'settings.html'; } },
    { label: 'Read the library again', run: () => { lib.files = { state: 'idle', list: [], capped: false, message: '' }; lib.checks.clear(); lib.versions.clear(); scanLibrary(); render(); } },
  ], 'docs-source');
}
const sourceButton = () => {
  const demo = connector.isDemo();
  return `<button class="btn btn-ghost btn-sm docs-source" data-cmd="docs.source" aria-haspopup="menu" title="${esc(libraryName())}">
    <span class="docs-source-dot${demo ? ' is-demo' : lib.signedIn ? '' : ' is-off'}" aria-hidden="true"></span>${demo ? 'Demo library' : esc(libraryName().split(' › ').slice(1).join(' › ') || 'SharePoint')}</button>`;
};

// A file opened in its own system. The demo's files aren't anywhere, so it says so instead.
function openLink(url) {
  const p = SharePoint.parseDocUrl(url);
  if (connector.isDemo() && p.host === DEMO_HOST) return Shell.toast('The demo library has no real files to open. Connected to your SharePoint, this opens the file.');
  window.open(url, '_blank', 'noopener');
}
async function copyLink(url) {
  let ok = false;
  try { await navigator.clipboard.writeText(url); ok = true; } catch {
    const ta = Object.assign(document.createElement('textarea'), { value: url });
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    try { ok = document.execCommand('copy'); } catch {}
    ta.remove();
  }
  Shell.toast(ok ? 'Copied the link' : 'Couldn’t copy the link', ok ? {} : { tone: 'error' });
}

// ---- Events ----

function setTab(tab) {
  if (ui.tab === tab) return;
  Object.assign(ui, { tab, selected: null, query: tab === ui.tab ? ui.query : '' });
  ui.keep.list = 0;
  closePop();
  writeHash();
  render();
}
function select(id) {
  if (ui.selected === id) return;
  ui.entering = !ui.selected;
  ui.selected = id;
  ui.allVersions = false;
  ui.keep.pane = 0;
  writeHash();
  render();
}
function shownIds() {
  const { rows } = fresh();
  if (ui.tab === 'unlinked') return [...document.querySelectorAll('.docs-table tbody tr[data-row]')].map(tr => tr.dataset.row);
  return sorted((ui.tab === 'broken' ? rows.filter(isBroken) : rows).filter(r => passes(r)), SORTS, ui.sort[ui.tab]).map(r => r.id);
}

Shell.on('docs.tab', el => setTab(el.dataset.tab));
Shell.on('docs.sort', el => {
  const s = ui.sort[ui.tab], key = el.dataset.key;
  ui.sort[ui.tab] = s.key === key ? { key, dir: -s.dir } : { key, dir: key === 'date' || key === 'modified' ? -1 : 1 };
  render();
});
Shell.on('docs.facet', el => {
  const facet = el.dataset.facet;
  ui.pop = ui.pop?.facet === facet ? null : { facet, query: '' };
  render();
  drawLayer();
  layerEl().querySelector('.docs-pop input, .docs-pop .menu-item')?.focus();
});
Shell.on('docs.unfacet', el => { ui.facets[el.dataset.facet].clear(); if (el.dataset.facet === 'subject') ui.below = false; ui.pop = null; drawLayer(); render(); });
Shell.on('docs.pick', el => {
  const set = ui.facets[ui.pop.facet], v = el.dataset.value;
  set.has(v) ? set.delete(v) : set.add(v);
  render();
  drawLayer();
});
Shell.on('docs.below', () => { ui.below = !ui.below; render(); drawLayer(); });
Shell.on('docs.clear', () => { for (const s of Object.values(ui.facets)) s.clear(); ui.below = false; ui.query = ''; ui.pop = null; drawLayer(); render(); });
Shell.on('docs.close', () => { ui.selected = null; writeHash(); render(); });
Shell.on('docs.copy', el => copyLink(el.dataset.link));
Shell.on('docs.versions', () => { ui.allVersions = true; render(); });
Shell.on('docs.source', el => sourceMenu(el));
Shell.on('docs.signin', signIn);
Shell.on('docs.rescan', () => { lib.files.state = 'idle'; scanLibrary(); render(); });
Shell.on('docs.link', () => openDialog({ mode: 'link', step: 'browse' }));
Shell.on('docs.link-file', el => { const f = fileById(el.dataset.id); if (f) linkFile(f); });
Shell.on('docs.link-details', el => { const f = fileById(el.dataset.id); if (!f) return; openDialog({ mode: 'link', step: 'browse' }); chooseFile(f); });
Shell.on('docs.edit', () => { const row = rowById(ui.selected); if (row?.own) openDialog({ mode: 'edit', step: 'details', rowId: row.id, form: editForm(row) }); });
Shell.on('docs.relink', el => { const row = rowById(el.dataset.id ?? ui.selected); if (row) openDialog({ mode: 'relink', step: 'browse', rowId: row.id }); });

Shell.on('docs.dd-close', closeDialog);
Shell.on('docs.dd-folder', el => browseTo(ui.dialog.trail.slice(0, Number(el.dataset.index))));
Shell.on('docs.dd-open', el => {
  const d = ui.dialog, list = clean(d.query) ? d.results : d.list;
  const folder = list.items.find(it => it.id === el.dataset.id);
  if (folder) browseTo(clean(d.query) ? [folder] : [...d.trail, folder]);
});
Shell.on('docs.dd-file', el => {
  const d = ui.dialog, list = clean(d.query) ? d.results : d.list;
  const file = list?.items.find(it => it.id === el.dataset.id);
  if (file) chooseFile(file);
});
Shell.on('docs.dd-paste', usePasted);
Shell.on('docs.dd-change', () => { const d = ui.dialog; d.step = 'browse'; d.error = ''; browseTo(d.trail ?? []); drawDialog(true); });
Shell.on('docs.dd-back', () => { ui.dialog.step = 'details'; drawDialog(true); });
Shell.on('docs.dd-save', saveDialog);
Shell.on('docs.dd-unsubject', el => { const f = ui.dialog.form; f.subjects = f.subjects.filter(id => id !== el.dataset.id); drawDialog(); });
Shell.on('docs.dd-subject', el => addSubject(el.dataset.id));
Shell.on('docs.dd-choose', el => {
  const role = el.dataset.role, f = ui.dialog.form;
  const set = v => { f[role] = v; drawDialog(); document.getElementById(`dd-${role}`)?.focus(); };
  const noun = role === 'type' ? 'type' : 'status';
  Shell.menu(el, [
    ...optionsOf(role).concat(f[role] && !optionsOf(role).some(o => same(o, f[role])) ? [f[role]] : []).map(o => ({ label: o, checked: same(o, f[role]), run: () => set(o) })),
    { sep: true },
    { label: `New ${noun}…`, run: async () => { const v = await Shell.prompt({ title: `New ${entrySpec(role).label.toLowerCase()}`, placeholder: role === 'type' ? 'Like Side Letter' : 'Like Executed', confirm: 'Use it' }); if (v !== null && clean(v)) set(clean(v)); else drawDialog(); } },
    ...(f[role] ? [{ label: 'None', run: () => set('') }] : []),
  ], `docs-${role}`);
});
function addSubject(id) {
  const d = ui.dialog;
  if (id && !d.form.subjects.includes(id)) d.form.subjects = [...d.form.subjects, id];
  Object.assign(d, { cq: '', cqActive: 0, cqOpen: true });
  drawDialog();
}

// Typing: the search filters as it goes; the dialog keeps what's typed without drawing again, except where
// it changes what's listed.
document.addEventListener('input', e => {
  const key = e.target.dataset?.docsInput;
  if (!key) return;
  const v = e.target.value;
  if (key === 'query') { ui.query = v; ui.keep.list = 0; return render(); }
  if (key === 'pop') { ui.pop.query = v; return drawLayer(); }
  const d = ui.dialog;
  if (!d) return;
  if (key === 'dd-query') return searchLibrary(v);
  if (key === 'dd-paste') { d.paste = v; d.pasteError = ''; return; }
  if (key === 'cq') { Object.assign(d, { cq: v, cqOpen: true, cqActive: 0 }); return drawDialog(); }
  d.form[key] = v;
  if (d.error) { d.error = ''; drawDialog(); }
});
document.addEventListener('focusin', e => {
  const d = ui.dialog;
  if (d?.step === 'details' && e.target.dataset?.docsInput === 'cq' && !d.cqOpen) { d.cqOpen = true; drawDialog(); }
});

// Clicks: a row selects its document (its links still go where they go); the demo's files say they
// aren't real; a click outside a facet's menu closes it, and outside the subjects box closes its list.
document.addEventListener('click', e => {
  const open = e.target.closest?.('a[data-docs-open]');
  if (open) { e.preventDefault(); return openLink(open.getAttribute('href')); }
  if (ui.pop && !e.target.closest('.docs-pop, [data-facet]')) closePop();
  const d = ui.dialog;
  if (d?.cqOpen && !e.target.closest('.dd-subjects')) { d.cqOpen = false; drawDialog(); }
  const tr = e.target.closest('.docs-table tbody tr[data-row]');
  if (tr && !e.target.closest('a, button, input')) select(tr.dataset.row);
});

// Keys: the dialog's stay in it. On the page, ↑ and ↓ (or J and K) move through the documents, Enter
// opens the one selected, Esc closes the preview.
document.addEventListener('keydown', e => {
  if (!e.target.closest?.('#docs-layer')) return;
  e.stopPropagation();
  const d = ui.dialog;
  if (e.key === 'Escape') {
    e.preventDefault();
    if (d?.cqOpen && e.target.dataset.docsInput === 'cq') { d.cqOpen = false; return drawDialog(); }
    return d ? closeDialog() : closePop();
  }
  if (!d) return;
  const key = e.target.dataset.docsInput;
  if (key === 'cq') {
    const options = subjectOptions(d.form);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); d.cqOpen = true; d.cqActive = (d.cqActive + (e.key === 'ArrowDown' ? 1 : -1) + options.length) % Math.max(options.length, 1); return drawDialog(); }
    if (e.key === 'Enter') { e.preventDefault(); if (d.cqOpen && options[d.cqActive]) addSubject(options[d.cqActive]); return; }
    if (e.key === 'Backspace' && !e.target.value && d.form.subjects.length) { d.form.subjects = d.form.subjects.slice(0, -1); return drawDialog(); }
  }
  if (e.key === 'Enter' && key === 'dd-paste') { e.preventDefault(); return usePasted(); }
  if (e.key === 'Enter' && d.step === 'details' && e.target.matches('input')) { e.preventDefault(); return saveDialog(); }
  if (e.key === 'Tab') {
    const focusable = [...layerEl().querySelectorAll('.docs-dialog button:not(:disabled), .docs-dialog input')];
    const i = focusable.indexOf(e.target);
    if (e.shiftKey && i === 0) { e.preventDefault(); focusable.at(-1).focus(); }
    else if (!e.shiftKey && i === focusable.length - 1) { e.preventDefault(); focusable[0].focus(); }
  }
}, true);
document.addEventListener('keydown', e => {
  if (ui.dialog || e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.('input, textarea, select, [contenteditable="true"], #docs-layer')) return;
  if (document.querySelector('#layer .palette, #layer .dialog, #layer .float-menu')) return;
  if (e.key === 'Escape' && ui.pop) { e.preventDefault(); return closePop(); }
  if (e.key === 'Escape' && ui.selected) { e.preventDefault(); ui.selected = null; writeHash(); return render(); }
  const step = { ArrowDown: 1, j: 1, ArrowUp: -1, k: -1 }[e.key];
  if (step) {
    const ids = shownIds();
    if (!ids.length) return;
    e.preventDefault();
    const i = ids.indexOf(ui.selected);
    select(ids[i < 0 ? (step > 0 ? 0 : ids.length - 1) : Math.max(0, Math.min(ids.length - 1, i + step))]);
    document.querySelector('.docs-table tr[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }
  if (e.key === 'Enter' && ui.selected && ui.tab !== 'unlinked') { e.preventDefault(); location.href = Shell.recordHref(rowById(ui.selected).record); }
});
addEventListener('resize', () => { if (ui.pop) placePop(); });
addEventListener('hashchange', () => { readHash(); render(); });

// ---- The page ----

// Keeps where the list and the pane were scrolled to, and what had the focus, across a drawing.
function keep() {
  const main = document.getElementById('main');
  for (const k of ['list', 'pane']) { const el = main?.querySelector(`[data-keep="${k}"]`); if (el) ui.keep[k] = el.scrollTop; }
  const f = document.activeElement;
  ui.keep.focus = f?.dataset?.docsInput && main?.contains(f) ? [f.dataset.docsInput, f.selectionStart, f.selectionEnd] : null;
}
function restore() {
  const main = document.getElementById('main');
  for (const k of ['list', 'pane']) { const el = main.querySelector(`[data-keep="${k}"]`); if (el) el.scrollTop = ui.keep[k]; }
  if (ui.keep.focus) {
    const [key, a, b] = ui.keep.focus;
    const el = main.querySelector(`[data-docs-input="${key}"]`);
    if (el) { el.focus(); try { el.setSelectionRange(a, b); } catch {} }
  }
}
// After each drawing: what the page shows is read from the library, if it hasn't been.
function load() {
  if (!lib.signedIn) return;
  for (const row of fresh().rows) check(row.link);
  const row = ui.tab !== 'unlinked' && ui.selected && rowById(ui.selected);
  versionsOf(row ? itemOf(row.link) : ui.tab === 'unlinked' && ui.selected ? fileById(ui.selected) : null);
}

readHash();
Shell.onChartChange(() => { ui.selected = null; for (const s of Object.values(ui.facets)) s.clear(); });
Shell.start({
  area: 'documents',
  title: 'Documents',
  actions: () => `${sourceButton()}<button class="btn btn-sm" data-cmd="docs.link">Link document</button>`,
  render: () => { keep(); return page(); },
  after: () => { restore(); load(); if (ui.pop) placePop(); },
  commands: () => [
    { title: 'Link document', keywords: 'add file sharepoint index', run: () => openDialog({ mode: 'link', step: 'browse' }) },
    { title: 'Show files not linked', keywords: 'reconcile library unlinked sharepoint', run: () => setTab('unlinked') },
    { title: 'Show broken links', keywords: 'reconcile missing moved deleted', run: () => setTab('broken') },
  ],
});
document.body.insertAdjacentHTML('beforeend', '<div id="docs-layer" class="docs-layer"></div>');
startLibrary();
})();
