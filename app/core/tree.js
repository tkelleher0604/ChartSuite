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
const norm = s => clean(s).toLowerCase();
const same = (a, b) => norm(a) === norm(b);
const push = (map, k, v) => { if (!map.has(k)) map.set(k, []); map.get(k).push(v); };

// ---- Records ----

const isObject = r => 'kind' in r;
const isField = r => 'field' in r;
const isTag = r => 'tag' in r;
const isChoice = r => 'choice' in r;
const isRelation = r => 'args' in r;
const typeOf = r => isObject(r) ? 'object' : isField(r) ? 'field' : isTag(r) ? 'tag' : 'choice';
const argsOf = r => r.args ?? (r.at ? [{ edge: r.edge, at: r.at }] : []);
const rootLabel = r => isTag(r) ? `tag:${r.tag}` : isChoice(r) ? `choice:${norm(r.choice)}` : `field:${r.field}`;

// A set of records is never changed in place, so what's worked out from one is kept with it.
const perRecs = new WeakMap();
const kept = (recs, name) => { let m = perRecs.get(recs); if (!m) perRecs.set(recs, m = {}); return m[name] ??= new Map(); };
const remember = (cache, t, make) => { let v = cache.get(t); if (v === undefined) cache.set(t, v = make()); return v; };

// A record's tree, or null while a location is missing.
function treeOf(recs, id) {
  const m = kept(recs, 'tree');
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
function index(recs) {
  const m = kept(recs, 'index');
  if (!m.size) {
    const entries = new Map(), relations = new Map(), kinds = new Map();
    for (const [id, r] of Object.entries(recs)) {
      if (r.at) push(entries, r.at, id);
      if (r.args) for (const at of new Set(r.args.map(a => a.at))) push(relations, at, id);
      if (isObject(r)) push(kinds, norm(r.kind), id);
    }
    m.set(0, { entries, relations, kinds });
  }
  return m.get(0);
}

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
function objectName(recs, id) {
  const n = (index(recs).entries.get(id) ?? []).find(e => isField(recs[e]) && same(recs[e].edge, 'Name'));
  return n ? recs[n].value : recs[id]?.kind ?? '';
}

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
// amount of money a number; a date an ISO day; a document its address.

const DATATYPES = { text: 'Text', number: 'Number', percent: 'Percent', money: 'Money', date: 'Date', document: 'Document' };
const PHRASES = { text: 'text', number: 'a number', percent: 'a percentage', money: 'an amount of money', date: 'a date',
  document: 'a link to a document', choice: 'a choice', tag: 'a checkbox' };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthOf = w => { w = w.toLowerCase().replace(/\.$/, ''); return MONTHS.findIndex(m => m.toLowerCase() === w || m.slice(0, 3).toLowerCase() === w || (w === 'sept' && m === 'September')) + 1; };

// 2019-03-04, 3/4/2019, 3-4-19, March 4, 2019, Mar. 4, 2019 or 4 March 2019, as an ISO day; null if not a date.
// A two-digit year reads as Excel reads it: 00–29 in the 2000s.
function parseDate(s) {
  let m, y, mo, d;
  s = clean(s);
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) [, y, mo, d] = m;
  else if ((m = s.match(/^(\d{1,2})([/-])(\d{1,2})\2(\d{4}|\d{2})$/))) { [, mo, , d, y] = m; if (y.length === 2) y = (+y < 30 ? 2000 : 1900) + +y; }
  else if ((m = s.match(/^([A-Za-z]+\.?) (\d{1,2}),? (\d{4})$/))) [y, mo, d] = [m[3], monthOf(m[1]), m[2]];
  else if ((m = s.match(/^(\d{1,2}) ([A-Za-z]+\.?),? (\d{4})$/))) [y, mo, d] = [m[3], monthOf(m[2]), m[1]];
  else return null;
  [y, mo, d] = [y, mo, d].map(Number);
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (!mo || date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
const formatDate = iso => { const [y, m, d] = iso.split('-').map(Number); return `${MONTHS[m - 1]} ${d}, ${y}`; };

// 1,000, $750,000,000 or 12.5%. A leading zero (0803456789) marks an identifier, which is text.
const isNumber = s => /^[-+]?\$?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?%?$/.test(s) && !/^[-+]?\$?0\d/.test(s);
const isAddress = s => /^[a-z][a-z0-9+.-]*:\/\/\S+$/i.test(s) || /^\\\\[^\\\s]+\\\S+/.test(s);
// The datatype something typed reads as, where nothing else says.
const classify = s => (s = clean(s), isAddress(s) ? 'document' : parseDate(s) ? 'date' : !isNumber(s) ? 'text'
  : s.endsWith('%') ? 'percent' : /^[-+]?\$/.test(s) ? 'money' : 'number');
// What's typed, as a value of the datatype, or undefined. In a percentage a bare number is one: 25 is 25%.
function parse(datatype, raw) {
  const s = clean(raw);
  if (!s) return undefined;
  if (datatype === 'date') return parseDate(s) ?? undefined;
  if (datatype === 'document') return isAddress(s) ? s : undefined;
  if (datatype === 'text') return s;
  if (!isNumber(s) || (datatype !== 'percent' && s.endsWith('%'))) return undefined;
  const n = Number(s.replace(/[$,%]/g, ''));
  return datatype === 'percent' ? n / 100 : n;
}
// A document goes by its file name, the last part of its address.
function documentName(address) {
  const last = String(address).replace(/[?#].*$/, '').replace(/[\\/]+$/, '').split(/[\\/]/).pop();
  try { return decodeURIComponent(last || address); } catch { return last || String(address); }
}
// How a value reads: 71.6%, $750,000,000, 1,000, February 14, 2023.
function format(datatype, v) {
  if (v === null || v === undefined) return '';
  if (datatype === 'date') return formatDate(v);
  if (datatype === 'document') return documentName(v);
  if (typeof v !== 'number') return String(v);
  const n = (x, min = 0) => x.toLocaleString('en-US', { minimumFractionDigits: min, maximumFractionDigits: 2 });
  if (datatype === 'percent') return `${n(v * 100)}%`;
  if (datatype === 'money') return `${v < 0 ? '-' : ''}$${n(Math.abs(v), Number.isInteger(v) ? 0 : 2)}`;
  return n(v);
}

return {
  clean, norm, same,
  isObject, isField, isTag, isChoice, isRelation, typeOf, argsOf, rootLabel,
  treeOf, index, dependents, pathOf, objectOf, objectName,
  specOf, bare, key, paramKey, shapeOf, weight, narrower, fits, idsIn, renamed, rename, lift,
  // A record's specification key and parameterization key, as formulas.js has always read them.
  specKey: (recs, id) => { const t = treeOf(recs, id); return t && key(specOf(t)); },
  parameterization: (recs, id) => { const t = treeOf(recs, id); return t && paramKey(t); },
  schema, schemaError,
  DATATYPES, PHRASES, MONTHS, parseDate, formatDate, isNumber, isAddress, classify, parse, format, documentName,
};
})();
