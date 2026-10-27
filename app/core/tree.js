// Tree: data-model.md in code.
//
// A record is kept as a row naming its locations by id: { kind }, { at, edge, field, value },
// { at, edge, choice }, { at, edge, tag } or { args: [{ edge, at }], …output }, with optional since and
// before (ISO days). A specification, a pattern, and a record's own tree are nested trees:
//   an object node:  { id, kind } an object, { kind } a kind, {} unlabeled
//   any other node:  { out, args: [{ edge, loc }] }, where out is { field, value } a value, { field } a
//                    datatype, { choice } or { tag } a linkage, and is absent where the label is removed.
// A record's tree is the narrowest pattern it fits; its specification and parameterization are patterns.
const Tree = (() => {

const clean = s => String(s ?? '').trim().replace(/\s+/g, ' ');
// Names are few and compared often: each one's normal form kept, the latest few thousand.
const normal = new Map();
const norm = s => {
  let n = normal.get(s);
  if (n === undefined) { if (normal.size > 4000) normal.clear(); normal.set(s, n = clean(s).toLowerCase()); }
  return n;
};
const same = (a, b) => norm(a) === norm(b);
const push = (map, k, v) => { if (!map.has(k)) map.set(k, []); map.get(k).push(v); };

// ---- Records ----

const isObject = r => 'kind' in r;
const isField = r => 'field' in r;
const isTag = r => 'tag' in r;
const isChoice = r => 'choice' in r;
const isRelation = r => 'args' in r;
// View is the app's own kind, which every chart has and none lists among its kinds.
const isView = r => isObject(r) && same(r.kind, 'View');
const typeOf = r => isObject(r) ? 'object' : isField(r) ? 'field' : isTag(r) ? 'tag' : 'choice';
const argsOf = r => r.args ?? (r.at ? [{ edge: r.edge, at: r.at }] : []);
const rootLabel = r => isTag(r) ? `tag:${r.tag}` : isChoice(r) ? `choice:${norm(r.choice)}` : `field:${r.field}`;

// A set of records is never changed in place, so what's worked out from one is kept with it.
const perRecs = new WeakMap();
const kept = (recs, name, make) => { let m = perRecs.get(recs); if (!m) perRecs.set(recs, m = {}); return m[name] ??= make(); };
const remember = (cache, t, make) => { let v = cache.get(t); if (v === undefined) cache.set(t, v = make()); return v; };

// A record's tree, or null while a location is missing.
function treeOf(recs, id) {
  const m = kept(recs, 'tree', () => new Map());
  if (!m.has(id)) {
    const r = recs[id];
    let t = null;
    if (r && isObject(r)) t = { id, kind: r.kind };
    else if (r) {
      const args = argsOf(r).map(a => ({ edge: a.edge, loc: treeOf(recs, a.at) }));
      if (args.every(a => a.loc)) t = { out: isField(r) ? { field: r.field, value: r.value } : isChoice(r) ? { choice: r.choice } : { tag: r.tag }, args };
    }
    m.set(id, t);
  }
  return m.get(id);
}

// Entries and relations by the record they're located at, and objects by kind.
const index = recs => kept(recs, 'index', () => {
  const entries = new Map(), relations = new Map(), kinds = new Map();
  for (const id in recs) {
    const r = recs[id];
    if (r.at) push(entries, r.at, id);
    if (r.args) r.args.forEach((a, i) => { if (r.args.findIndex(b => b.at === a.at) === i) push(relations, a.at, id); });
    if (isObject(r)) push(kinds, norm(r.kind), id);
  }
  return { entries, relations, kinds };
});

// The records located at these, at any depth, and these.
function dependents(recs, ids) {
  const { entries, relations } = index(recs), all = new Set(ids), todo = [...ids];
  while (todo.length) {
    const id = todo.pop();
    for (const d of [...entries.get(id) ?? [], ...relations.get(id) ?? []]) if (!all.has(d)) { all.add(d); todo.push(d); }
  }
  return all;
}

// The path from an object, or a relation, down to a record.
function pathOf(recs, id) {
  const path = [];
  for (let cur = id; cur && recs[cur]; cur = recs[cur].at) path.unshift(cur);
  return path;
}
const objectOf = (recs, id) => pathOf(recs, id)[0];
// The entry at a record with this label.
const entryAt = (recs, id, edge) => (index(recs).entries.get(id) ?? []).find(e => same(recs[e].edge, edge));

// ---- Patterns ----

const specs = new WeakMap(), keys = new WeakMap(), shapes = new WeakMap();
// A tree's specification: its objects become their kinds, and a value its datatype.
const specOf = t => remember(specs, t, () => !t.args ? (t.kind === undefined ? {} : { kind: t.kind })
  : { ...(t.out && { out: 'value' in t.out ? { field: t.out.field } : t.out }), args: t.args.map(a => ({ edge: a.edge, loc: specOf(a.loc) })) });
// A tree with its root's label removed: from a specification, its parameterization.
const bare = t => t.args ? { args: t.args } : {};

const outKey = o => !o ? '*' : 'tag' in o ? `tag:${o.tag}` : 'choice' in o ? `choice:${norm(o.choice)}`
  : `field:${o.field}${'value' in o ? `=${JSON.stringify(o.value)}` : ''}`;
const argKeys = (t, f) => t.args.map(a => JSON.stringify([norm(a.edge), f(a.loc)])).sort();
// A pattern's key; a specification's is the specification key formulas.js uses.
const key = t => remember(keys, t, () => t.args ? JSON.stringify([outKey(t.out), ...argKeys(t, key)])
  : t.id !== undefined ? `id:${t.id}` : t.kind !== undefined ? `kind:${norm(t.kind)}` : '*');
// The key of its parameterization, as formulas.js keys what a definition covers.
const paramKey = t => t.args ? JSON.stringify(argKeys(specOf(t), key)) : '[]';
// Its edges with every label removed. A tree fits only patterns of its shape.
const shapeOf = t => remember(shapes, t, () => t.args ? JSON.stringify(argKeys(t, shapeOf)) : '*');
// How many labels it keeps, an object or value counting double: strictly narrower patterns weigh more.
const weight = t => t.args ? (t.out ? ('value' in t.out ? 2 : 1) : 0) + t.args.reduce((n, a) => n + weight(a.loc), 0)
  : t.id !== undefined ? 2 : t.kind !== undefined ? 1 : 0;

const outFits = (o, q) => 'tag' in q ? o.tag === q.tag : 'choice' in q ? 'choice' in o && same(o.choice, q.choice)
  : o.field === q.field && (!('value' in q) || o.value === q.value);
// Whether q is obtained from p by replacing objects with kinds, values with datatypes, and removing labels.
// A record fits a pattern when its tree is narrower.
function narrower(p, q) {
  if (!p.args || !q.args) return !p.args && !q.args
    && (q.id !== undefined ? p.id === q.id : q.kind === undefined || (p.kind !== undefined && same(p.kind, q.kind)));
  if ((q.out && !(p.out && outFits(p.out, q.out))) || p.args.length !== q.args.length) return false;
  const used = [];
  const match = i => i === q.args.length || p.args.some((a, j) => !used[j] && same(a.edge, q.args[i].edge)
    && narrower(a.loc, q.args[i].loc) && ((used[j] = true), match(i + 1) || (used[j] = false)));
  return match(0);
}
const fits = (recs, id, p) => { const t = treeOf(recs, id); return !!t && narrower(t, p); };
const idsIn = (t, out = new Set()) => { if (t.id !== undefined) out.add(t.id); t.args?.forEach(a => idsIn(a.loc, out)); return out; };

// One node, or one record's row, with `from` renamed `to`: an edge from it, its kind or its option.
function renamed(n, from, to) {
  const swap = s => same(s, from) ? to : s;
  const u = { ...n };
  if (n.args) u.args = n.args.map(a => same(a.edge, from) ? { ...a, edge: to } : a);
  if (n.edge !== undefined) u.edge = swap(n.edge);
  if (n.kind !== undefined) u.kind = swap(n.kind);
  if (n.choice !== undefined) u.choice = swap(n.choice);
  if (n.out?.choice !== undefined) u.out = { choice: swap(n.out.choice) };
  return JSON.stringify(u) === JSON.stringify(n) ? n : u;
}
// Each node of a tree rewritten from its locations up by f(original, rewritten), keeping what's unchanged.
function rewrite(t, f) {
  const args = t.args?.map(a => { const loc = rewrite(a.loc, f); return loc === a.loc ? a : { ...a, loc }; });
  return f(t, args?.some((a, i) => a !== t.args[i]) ? { ...t, args } : t);
}
// Renaming: `from` becomes `to` at every node fitting p.
const rename = (t, p, from, to) => rewrite(t, (old, u) => narrower(old, p) ? renamed(u, from, to) : u);
// Moving up a level: every node fitting p, an entry at an entry, is located at its location's location.
const lift = (t, p) => rewrite(t, (old, u) => u.args?.length === 1 && u.args[0].loc.args?.length === 1 && narrower(old, p)
  ? { ...u, args: [{ edge: u.args[0].edge, loc: u.args[0].loc.args[0].loc }] } : u);

// ---- The schema ----

// The schema these specifications make: each with every location of it, by key.
function schema(trees) {
  const S = {};
  const add = t => { const k = key(t); if (S[k]) return; S[k] = t; t.args?.forEach(a => add(a.loc)); };
  trees.forEach(t => t && add(t));
  return S;
}
// The first way a schema breaks data-model.md's conditions, in words, or null: no two specifications of
// different types, or of fields of different datatypes, share a parameterization.
function schemaError(S) {
  const byParam = new Map();
  for (const t of Object.values(S)) if (t.args) push(byParam, paramKey(t), t);
  for (const ts of byParam.values()) {
    const types = [...new Set(ts.map(t => 'field' in t.out ? t.out.field : 'choice' in t.out ? 'choice' : 'tag'))];
    if (types.length > 1) return `${ts[0].args.map(a => a.edge).join(' · ')} can’t be both ${PHRASES[types[0]]} and ${PHRASES[types[1]]}.`;
  }
  return null;
}

// ---- Values ----
// A field's value is canonical for its datatype: text a string; a number, percentage (0.716 for 71.6%) or
// amount of money a number; a date an ISO day; a day of the year, as a fiscal year ends on, ISO's --12-31;
// a document its address.

const DATATYPES = { text: 'Text', number: 'Number', percent: 'Percent', money: 'Money', date: 'Date', yearly: 'Day of the year', document: 'Document' };
const PHRASES = { text: 'text', number: 'a number', percent: 'a percentage', money: 'an amount of money', date: 'a date',
  yearly: 'a day of the year', document: 'a link to a document', choice: 'a choice', tag: 'a checkbox' };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthOf = w => { w = w.toLowerCase().replace(/\.$/, ''); return MONTHS.findIndex(m => m.toLowerCase() === w || m.slice(0, 3).toLowerCase() === w || (w === 'sept' && m === 'September')) + 1; };

// A day as typed, its year left out or not: 2019-03-04 or --03-04, 3/4/2019, 3-4-19 or 3/4, March 4, 2019 or
// March 4, Mar. 4 or 4 March. [year or null, month, day], or null if it isn't a day. A two-digit year reads as
// Excel reads it: 00–29 in the 2000s. February 29 is a day of the year, so one without a year is a leap year's.
function dayParts(s) {
  let m, y, mo, d;
  s = clean(s);
  if ((m = s.match(/^(\d{4}|-)-(\d{1,2})-(\d{1,2})$/))) [, y, mo, d] = m;
  else if ((m = s.match(/^(\d{1,2})([/-])(\d{1,2})(?:\2(\d{4}|\d{2}))?$/))) { [, mo, , d, y] = m; if (y?.length === 2) y = (+y < 30 ? 2000 : 1900) + +y; }
  else if ((m = s.match(/^([A-Za-z]+\.?) (\d{1,2})(?:,? (\d{4}))?$/))) [y, mo, d] = [m[3], monthOf(m[1]), m[2]];
  else if ((m = s.match(/^(\d{1,2}) ([A-Za-z]+\.?)(?:,? (\d{4}))?$/))) [y, mo, d] = [m[3], monthOf(m[2]), m[1]];
  else return null;
  [y, mo, d] = [y === undefined || y === '-' ? null : Number(y), Number(mo), Number(d)];
  const date = new Date(Date.UTC(y ?? 2000, mo - 1, d));
  if (!mo || (y !== null && date.getUTCFullYear() !== y) || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return [y, mo, d];
}
const pad = n => String(n).padStart(2, '0');
// An ISO day, or null if it isn't a date.
const parseDate = s => { const p = dayParts(s); return p && p[0] !== null ? `${p[0]}-${pad(p[1])}-${pad(p[2])}` : null; };
// A day of the year, as ISO writes one (--12-31), from a day typed with its year or without; null if it isn't one.
const parseYearly = s => { const p = dayParts(s); return p && `--${pad(p[1])}-${pad(p[2])}`; };
// A day as it reads: 'long' February 14, 2023 (a value); 'short' Feb 14, 2023 (the window's own); 'month'
// February 2023. A day of the year reads without a year: February 14.
function formatDate(iso, style = 'long') {
  const yearly = String(iso).startsWith('--'), [y, m, d] = String(iso).slice(yearly ? 1 : 0).split('-').map(Number), month = MONTHS[m - 1];
  if (style === 'month') return yearly ? month : `${month} ${y}`;
  return `${style === 'short' ? month.slice(0, 3) : month} ${d}${yearly ? '' : `, ${y}`}`;
}
// The day a moment falls on, on this computer's calendar.
const isoOf = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// 1,000, $750,000,000 or 12.5%. A leading zero (0803456789) marks an identifier, which is text.
const isNumber = s => /^[-+]?\$?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?%?$/.test(s) && !/^[-+]?\$?0\d/.test(s);
const isAddress = s => /^[a-z][a-z0-9+.-]*:\/\/\S+$/i.test(s) || /^\\\\[^\\\s]+\\\S+/.test(s);
// The datatype something typed reads as, where nothing else says. A day of the year is one typed with its
// month's name (June 30), since 6/30 could be a fraction.
const classify = s => (s = clean(s), isAddress(s) ? 'document' : parseDate(s) ? 'date' : parseYearly(s) && /[a-z]|^--/i.test(s) ? 'yearly'
  : !isNumber(s) ? 'text' : s.endsWith('%') ? 'percent' : /^[-+]?\$/.test(s) ? 'money' : 'number');
// What's typed, as a value of the datatype, or undefined. In a percentage a bare number is one: 25 is 25%.
function parse(datatype, raw) {
  const s = clean(raw);
  if (!s) return undefined;
  if (datatype === 'date') return parseDate(s) ?? undefined;
  if (datatype === 'yearly') return parseYearly(s) ?? undefined;
  if (datatype === 'document') return isAddress(s) ? s : undefined;
  if (datatype === 'text') return s;
  if (!isNumber(s) || (datatype !== 'percent' && s.endsWith('%'))) return undefined;
  const n = Number(s.replace(/[$,%]/g, ''));
  return datatype === 'percent' ? n / 100 : n;
}
// How a value reads: 71.6%, $750,000,000, 1,000, February 14, 2023, December 31, and a document by what its
// link names. A formatter is costly to make and values are formatted by the thousand, so each kind is made once.
const numberFormats = new Map();
const numberFormat = (min, max) => numberFormats.get(min * 10 + max)
  ?? numberFormats.set(min * 10 + max, new Intl.NumberFormat('en-US', { minimumFractionDigits: min, maximumFractionDigits: max })).get(min * 10 + max);
function format(datatype, v) {
  if (v === null || v === undefined) return '';
  if (datatype === 'date' || datatype === 'yearly') return formatDate(v);
  if (datatype === 'document') return linkOf(v).short;
  if (typeof v !== 'number') return String(v);
  const n = (x, min = 0, max = 2) => numberFormat(min, max).format(x);
  // A percentage as precise as it was entered, to four places: 26.696%.
  if (datatype === 'percent') return `${n(v * 100, 0, 4)}%`;
  if (datatype === 'money') return `${v < 0 ? '-' : ''}$${n(Math.abs(v), Number.isInteger(v) ? 0 : 2)}`;
  return n(v);
}
// How a record's output reads: a value as its datatype reads, an option as itself, a tag Yes or No.
const outputText = r => isField(r) ? format(r.field, r.value) : isChoice(r) ? r.choice : isTag(r) ? (r.tag ? 'Yes' : 'No') : '';
const plural = w => /[^aeiou]y$/i.test(w) ? w.slice(0, -1) + 'ies' : /(s|x|z|ch|sh)$/i.test(w) ? w + 'es' : w + 's';

// ---- Links: what a document's address points at, from the address alone ----

const KINDS = { doc: 'word', docx: 'word', docm: 'word', dot: 'word', dotx: 'word', rtf: 'word', pdf: 'pdf',
  xls: 'excel', xlsx: 'excel', xlsm: 'excel', xlsb: 'excel', csv: 'excel', ppt: 'powerpoint', pptx: 'powerpoint',
  pptm: 'powerpoint', msg: 'email', eml: 'email' };
// A modern SharePoint link says what it is after its first colon, /:w:/ for Word, and a sharing link
// says nothing else: :b: is any other file, most often a PDF.
const LETTERS = { w: 'word', x: 'excel', p: 'powerpoint', b: 'pdf', f: 'folder' };
const WORDS = { word: 'Word document', pdf: 'PDF', excel: 'Spreadsheet', powerpoint: 'Presentation', email: 'Email', folder: 'Folder', other: 'File' };
const SYSTEMS = { sharepoint: 'SharePoint', onedrive: 'OneDrive', edgar: 'EDGAR', netdocuments: 'NetDocuments', imanage: 'iManage', file: 'File share', web: 'Web' };
const decode = s => { try { return decodeURIComponent(s); } catch { return s; } };
const extension = name => /\.([a-z][a-z0-9]{1,4})$/i.exec(name ?? '')?.[1].toLowerCase() ?? null;
// A file's name ends in an extension, and a web page's (Doc.aspx, index.htm) names no document.
const fileName = s => extension(s) && !/^(aspx?|html?|php|jsp|cgi)$/.test(extension(s)) ? s : null;

// { link, system, kind, name, id, short, host, site, library, folder, sharing }. `system` is sharepoint,
// onedrive, edgar, netdocuments, imanage, file or web, or null if it isn't a link. `name` is the file's name
// where the link gives one; `id` the document's number in a system that has one (an EDGAR accession number,
// a NetDocuments or iManage number); `short` what the document is called. For SharePoint, `site` is the
// site's path (/sites/FundLegal), `library` the library as the address spells it, `folder` the folders below
// it, joined by /, and `sharing` says it's a sharing link, which names no file.
function linkOf(link) {
  const text = String(link ?? '').trim();
  const p = { link: text, system: null, kind: 'other', name: null, id: null, short: text, host: null, site: null, library: null, folder: '', sharing: false };
  if (/^iwl:/i.test(text)) {
    const q = Object.fromEntries(text.slice(4).split('&&').map(kv => kv.split('=')));
    return named({ ...p, system: 'imanage', id: q.num ? `${q.num}${q.ver ? `v${q.ver}` : ''}` : null });
  }
  if (/^\\\\|^file:/i.test(text)) {
    const parts = text.replace(/^file:\/*/i, '').split(/[\\/]+/).filter(Boolean).map(decode), name = fileName(parts.at(-1));
    return named({ ...p, system: 'file', host: parts[0] ?? null, name, folder: parts.slice(1, name ? -1 : undefined).join('/') });
  }
  let u;
  try { u = new URL(text); } catch { return p; }
  if (!/^https?:$/.test(u.protocol)) return p;
  const host = u.hostname.toLowerCase(), segs = u.pathname.split('/').filter(Boolean).map(decode);
  Object.assign(p, { system: 'web', host });

  if (/(^|\.)sec\.gov$/.test(host)) {
    const accession = segs.map(s => /^\d{18}$/.test(s) ? `${s.slice(0, 10)}-${s.slice(10, 12)}-${s.slice(12)}` : /^\d{10}-\d{2}-\d{6}/.exec(s)?.[0]).find(Boolean);
    const cik = u.searchParams.get('CIK') ?? u.searchParams.get('cik') ?? (/^data$/i.test(segs[2] ?? '') ? segs[3] : null);
    const last = segs.at(-1);
    return named({ ...p, system: 'edgar', name: extension(last) && !/-index\.html?$/i.test(last) ? last : null,
      id: accession ?? (cik ? `CIK ${cik}` : null) });
  }
  if (/(^|\.)(netvoyage|netdocuments)\.(com|net)$/.test(host))
    return named({ ...p, system: 'netdocuments', id: u.searchParams.get('id') ?? /\d{4}-\d{4}-\d{4}/.exec(u.pathname)?.[0] ?? null });
  if (/(^|\.)(imanage\.work|cloudimanage\.com)$/.test(host)) {
    const m = /[\w-]+!(\d+)(?:\.(\d+))?/.exec(decode(u.pathname + u.search));
    return named({ ...p, system: 'imanage', id: m ? `${m[1]}${m[2] ? `v${m[2]}` : ''}` : null });
  }
  const onedrive = /-my\.sharepoint(-df)?\.(com|us|de|cn)$/.test(host);
  if (!/\.sharepoint(-df)?\.(com|us|de|cn)$/.test(host) && !segs.some(s => /^_layouts$/i.test(s))) {
    if (/(^|\.)onedrive\.live\.com$|(^|\.)1drv\.ms$/.test(host)) return named({ ...p, system: 'onedrive', sharing: true });
    return named({ ...p, name: fileName(segs.at(-1)) });
  }
  p.system = onedrive ? 'onedrive' : 'sharepoint';
  let s = segs;

  // A modern link: /:w:/r/sites/X/Library/… spells out the path; /:b:/s/X/token is a sharing link, which
  // names no file, as is /:w:/g/personal/user/token on OneDrive.
  const modern = /^:([a-z]):$/i.exec(s[0] ?? '');
  if (modern) {
    const how = (s[1] ?? '').toLowerCase();
    s = s.slice(2);
    if (how !== 'r') {
      const site = /^(sites|teams|personal)$/i.test(s[0] ?? '') ? `/${s[0]}/${s[1] ?? ''}` : s.length > 1 ? `/${how === 't' ? 'teams' : 'sites'}/${s[0]}` : null;
      return named({ ...p, sharing: true, site, kind: LETTERS[modern[1].toLowerCase()] ?? 'other' });
    }
  }
  // A page of SharePoint's own names the file in its query: Doc.aspx?…&file=Name.docx, or a library
  // view's AllItems.aspx?id=/sites/X/Library/Folder/File.pdf.
  const id = u.searchParams.get('id'), file = u.searchParams.get('file');
  const page = s.some(x => /^_layouts$/i.test(x)) || /\.aspx$/i.test(s.at(-1) ?? '');
  if (page && id) s = id.split('/').filter(Boolean);
  else if (page) {
    const at = s.findIndex(x => /^_layouts$/i.test(x));
    s = at >= 0 ? s.slice(0, at) : s.slice(0, -1);
    if (/^forms$/i.test(s.at(-1) ?? '')) s = s.slice(0, -1);
  }
  if (/^(sites|teams|personal)$/i.test(s[0] ?? '')) { p.site = `/${s[0]}/${s[1] ?? ''}`; s = s.slice(2); }
  p.library = s[0] ?? null;
  const rest = s.slice(1), file1 = fileName(rest.at(-1));
  p.name = file1 ?? (page && file ? file : null);
  p.folder = (file1 ? rest.slice(0, -1) : rest).join('/');
  if (!p.name) p.kind = 'folder';
  return named(p);
}
function named(p) {
  if (p.name) p.kind = KINDS[extension(p.name)] ?? 'other';
  p.short = p.id ? `${SYSTEMS[p.system]} ${p.id}` : p.name
    ?? (p.sharing ? `${WORDS[p.kind]} in ${SYSTEMS[p.system]}` : p.folder ? p.folder.split('/').pop() : p.library ?? p.host ?? p.link);
  return p;
}

return {
  clean, norm, same,
  isObject, isField, isTag, isChoice, isRelation, isView, typeOf, argsOf, rootLabel,
  treeOf, index, dependents, pathOf, objectOf, entryAt,
  specOf, bare, key, paramKey, shapeOf, weight, narrower, fits, idsIn, renamed, rename, lift,
  // A record's parameterization key, as formulas.js keys what a definition covers.
  parameterization: (recs, id) => { const t = treeOf(recs, id); return t && paramKey(t); },
  schema, schemaError,
  DATATYPES, PHRASES, MONTHS, parseDate, parseYearly, formatDate, isoOf, isNumber, isAddress, classify, parse, format, outputText, plural, linkOf,
};
})();
