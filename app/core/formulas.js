// Formulas: records worked out from other records, the way a spreadsheet works out cells (see formulas.md).
// Nothing here touches the page.
//
// ---- What it needs from the core (app/core/tree.js) ----
//   Tree.norm(text)       a label as labels are compared: without regard to case, with spaces collapsed. Two
//                         names are the same name when their norms are equal.
//   Tree.formatDate(iso)  a date as it reads: '2025-02-11' as "February 11, 2025".
// Everything else it reads off the records, whose shapes are the core's:
//   { kind }                      an object
//   { at, edge, field, value }    a field: its datatype ('text', 'number', 'percent', 'money', 'date', …) and
//                                 its value, canonical for the datatype (a number, or an ISO date)
//   { at, edge, choice }          a choice
//   { at, edge, tag }             a tag: true is attested, false ruled out
//   { args: [{ edge, at }], … }   a relation: any of the outputs above, with arguments for `at` and `edge`
// The input is a plain state: the entered records as of one day, by id.
//
// ---- Definitions ----
//   { id, name, covers, rows: [{ label, formula }], type, datatype, self, options }
//   name      an entry's label, or a relation's name
//   covers    the parameterizations it covers, as parameterization keys: each parameter's edge and its
//             location's specification key, as model.js's parameterization() spells them. parameterizationKey()
//             and locationKey() spell them, and coversOf() turns locations written as paths from a kind
//             ({ at: ['Entity › Entity Type: Corporation'] }, or for a relation { args: [{ edge, at }] }) into them.
//   rows      each row's formula starts with = (gives a value) or ← (`<-` as typed), short for = IF(c, TRUE)
//   type      'tag', 'choice' or 'field', and for a field its datatype ('number' if none). A pattern says these;
//             until patterns replace `covers`, the definition does. Rows all ← make a tag.
//   self      the relation may relate a thing to itself
//   options   a choice's options, where the core knows them
// A relation's arguments go in the order of its name's edges (below), or else as its parameterizations list them.
// Names: { relations: [{ name, type, edges: [...], form, lists: { [from edge]: { [listed edge]: list name } } }] }.
// A list without a name goes by the edge label it lists. `form` is optional, keyed as model.js keys forms.
//
// ---- The API ----
// computeState(entered, definitions, names) → R, the computed state:
//   records     entered and computed. A computed one has `computed`, its definition's id, and an id from its
//               argumentation (computedId), the same from one working-out to the next.
//   computed    { [id]: { def, row, label, holds, stage } }: the row that gave it (its index and label), every
//               row that holds there (indexes; for a tag), and its stage, the round it first appeared in.
//   covered     { [entered id]: { def, row, label, holds, value, agrees } }: what the rows give where an entry
//               stands, which wins (row zero).
//   errors      [{ def, id, args | at, error }], error being { code, msg }. defErrors: { [def]: { message, row, pos } }.
//   loops       { [def]: [{ row, from, to, monotone }] }: where each row reads its own loop, for underlining.
//   rows        all of it per definition; keptAside, order, steps, ms; and state, the engine's own.
// ground(R, id) → why a record is there, as records, not words, for unfolding one level at a time:
//   { id, def, entered, stage, rows: [{ row, label, stage, parts }] }. rows[0] is the ground: the row that gave
//   it, or for a tag whose rows are all ←, the holding row of least stage; the others hold too. A part is
//   { id, from, to, items? }: a record read (id null where what was read was nothing), the span of the formula
//   that read it, and for an item counted or found, what it was counted or found with. A computed record in
//   a part has a ground of its own; under a computed tag, each comes from an earlier group or round.
// groundText(R, id) → the ground on one line, for exports: "Formation Date February 11, 2025 · Annual Tax Paid —".
// evaluateRow(R, def, row, at) → { value, names: [{ from, to, ids }], parts: [{ from, to, values }] }: a row
//   (its index, or a formula as typed) worked out at a record (its id, or { [edge]: object id } for a pair that
//   has none): each name with the records it resolves to there, and each part's values (several inside FILTER).
// diff(before, after) → { appear, go, change }: the record ids that would appear, go, or change output.
// check(text, { computed, def }) → { kind, problems: [{ from, to, message }] }, for an editor's squiggles.
// suggest(text, cursor, { computed, def, at }) → { from, to, list: [{ text, name, kind }] }, for completion.
// evaluateAt(R, text, at, def) works an expression out at a record; formatValue(R, v) shows a value.
// Spans are character offsets into the row's formula, prefix included.

const Formulas = (() => {

// ---- Records ----

const isObject = r => 'kind' in r;
const isField = r => 'field' in r;
const isTag = r => 'tag' in r;
const isChoice = r => 'choice' in r;
const isRelation = r => 'args' in r;
const argsOf = r => r.args ?? (r.at ? [{ edge: r.edge, at: r.at }] : []);
const clean = s => String(s ?? '').trim().replace(/\s+/g, ' ');

// Names compared as the core compares labels, kept once worked out: the same few are compared over and over.
const normals = new Map();
function normal(s) {
  let n = normals.get(s);
  if (n === undefined) {
    if (normals.size > 50000) normals.clear();
    normals.set(s, n = Tree.norm(s));
  }
  return n;
}
const same = (a, b) => normal(String(a ?? '')) === normal(String(b ?? ''));

// ---- Values ----
// BLANK, nothing, is null. Numbers, text and TRUE/FALSE stand for themselves. A record is { t: 'rec', id, link },
// with `link` the relation record it was reached through when it came from a list of relatives. A relation
// call that finds nothing gives a record whose id is null, which is nothing. A date is { t: 'date', iso }, a
// list is an array, and an error is { t: 'err', code, msg }.

const err = (code, msg) => ({ t: 'err', code, msg });
const isErr = v => v?.t === 'err';
const isRec = v => v?.t === 'rec';
const isDate = v => v?.t === 'date';
const recOf = (id, link = null) => ({ t: 'rec', id, link });
const circular = () => err('#CIRCULAR!', 'This depends on itself.');
const isNothing = v => v === null || v === undefined || (Array.isArray(v) && !v.length) || (isRec(v) && v.id === null);

// Numbers as the chart stores them: 1,000, $750,000,000, 71.6%.
function readNumber(s) {
  const m = /^\s*([-+]?)\$?((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+)(%?)\s*$/.exec(String(s));
  if (!m) return null;
  const n = Number(m[2].replace(/,/g, '')) * (m[1] === '-' ? -1 : 1);
  return m[3] ? n / 100 : n;
}

// ---- Reading formulas ----
// Every node keeps its span in the formula as typed (from, to), so the formula bar can colour a name and say
// what a part comes to.

class FormulaError extends Error {
  constructor(message, pos) { super(message); this.pos = pos; }
}

const KEYWORDS = new Set(['AND', 'OR', 'NOT', 'IN', 'TRUE', 'FALSE']);

// Numbers take `$` and `%` as typed in the chart. A thousands comma only counts after a `$`, since
// `IF(x, 1,000)` would otherwise be ambiguous.
function tokenize(src, offset = 0) {
  const toks = [];
  let i = 0, m;
  const at = (tok, length) => { tok.pos = i + offset; tok.end = i + length + offset; toks.push(tok); i += length; };
  while (i < src.length) {
    const rest = src.slice(i);
    if (/^\s/.test(rest)) { i++; continue; }
    if ((m = /^\$(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?%?/.exec(rest)) || (m = /^(?:\d+(?:\.\d+)?|\.\d+)%?/.exec(rest))) {
      at({ k: 'num', v: readNumber(m[0]), pct: m[0].endsWith('%') }, m[0].length);
    } else if (rest[0] === '"') {
      let j = i + 1, s = '';
      for (;;) {
        if (j >= src.length) throw new FormulaError('A text in quotes isn’t closed.', i + offset);
        if (src[j] === '"') { if (src[j + 1] === '"') { s += '"'; j += 2; continue; } break; }
        s += src[j++];
      }
      at({ k: 'str', v: s }, j + 1 - i);
    } else if (rest[0] === '[') {
      const j = src.indexOf(']', i);
      if (j < 0) throw new FormulaError('A name in brackets isn’t closed.', i + offset);
      at({ k: 'name', v: clean(src.slice(i + 1, j)) }, j + 1 - i);
    } else if ((m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(rest))) {
      const w = m[0].toUpperCase();
      at(KEYWORDS.has(w) ? { k: 'kw', v: w } : { k: 'name', v: m[0] }, m[0].length);
    } else if ((m = /^(<>|<=|>=|[-+*/&=<>(),.{}:@])/.exec(rest))) {
      at({ k: 'op', v: m[0] }, m[0].length);
    } else throw new FormulaError(`“${rest[0]}” isn’t part of a formula.`, i + offset);
  }
  toks.push({ k: 'end', pos: src.length + offset, end: src.length + offset });
  return toks;
}

// Precedence, loosest first: OR, AND, NOT, comparisons and IN, &, + and -, * and /, unary minus, then dots
// and calls. A name directly followed by parentheses is a call: a function, or a relation by its name.
function parseExpression(src, offset = 0) {
  const toks = tokenize(src, offset);
  let p = 0;
  const peek = () => toks[p];
  const next = () => toks[p++];
  const isOp = v => peek().k === 'op' && peek().v === v;
  const isKw = v => peek().k === 'kw' && peek().v === v;
  const expect = v => { if (!isOp(v)) throw new FormulaError(`Expected “${v}”.`, peek().pos); return next(); };
  const span = (node, from, to) => Object.assign(node, { from, to });
  const CMP = ['=', '<>', '<', '>', '<=', '>='];
  const binary = (k, a, b, op) => span(op ? { k, op, a, b } : { k, a, b }, a.from, b.to);

  const or = () => { let a = and(); while (isKw('OR')) { next(); a = binary('or', a, and()); } return a; };
  const and = () => { let a = not(); while (isKw('AND')) { next(); a = binary('and', a, not()); } return a; };
  const not = () => { if (!isKw('NOT')) return cmp(); const t = next(), x = not(); return span({ k: 'not', x }, t.pos, x.to); };
  const cmp = () => {
    let a = concat();
    for (;;) {
      if (peek().k === 'op' && CMP.includes(peek().v)) { const op = next().v; a = binary('cmp', a, concat(), op); }
      else if (isKw('IN')) { next(); a = binary('in', a, concat()); }
      else return a;
    }
  };
  const concat = () => { let a = add(); while (isOp('&')) { next(); a = binary('bin', a, add(), '&'); } return a; };
  const add = () => { let a = mul(); while (isOp('+') || isOp('-')) { const op = next().v; a = binary('bin', a, mul(), op); } return a; };
  const mul = () => { let a = unary(); while (isOp('*') || isOp('/')) { const op = next().v; a = binary('bin', a, unary(), op); } return a; };
  const unary = () => {
    if (!isOp('-') && !isOp('+')) return postfix();
    const t = next(), x = unary();
    return span({ k: 'neg', op: t.v, x }, t.pos, x.to);
  };
  const postfix = () => {
    let x = primary();
    for (;;) {
      if (isOp('.')) {
        next();
        const t = next();
        if (t.k !== 'name') throw new FormulaError('Expected a name after the dot.', t.pos);
        x = span({ k: 'dot', x, name: t.v, n: normal(t.v), at: t.pos }, x.from, t.end);
      } else if (isOp('(') && x.k === 'name') {
        next();
        const args = callArgs();
        x = span({ k: 'call', name: x.name, args, nameTo: x.to }, x.from, toks[p - 1].end);
      } else return x;
    }
  };
  // An argument can be labeled with an edge, as in Ownership(Owner: a, Owned: b).
  const callArgs = () => {
    const args = [];
    if (isOp(')')) { next(); return args; }
    for (;;) {
      if (peek().k === 'name' && toks[p + 1].k === 'op' && toks[p + 1].v === ':') {
        const label = next().v;
        next();
        args.push({ label, x: or() });
      } else args.push({ x: or() });
      if (isOp(',')) { next(); continue; }
      expect(')');
      return args;
    }
  };
  const primary = () => {
    const t = next();
    if (t.k === 'num' || t.k === 'str') return span({ k: 'lit', v: t.v, pct: t.pct }, t.pos, t.end);
    if (t.k === 'kw' && (t.v === 'TRUE' || t.v === 'FALSE')) return span({ k: 'lit', v: t.v === 'TRUE' }, t.pos, t.end);
    if (t.k === 'name') return span({ k: 'name', name: t.v, n: normal(t.v) }, t.pos, t.end);
    if (t.k === 'op' && t.v === '@') return span({ k: 'at' }, t.pos, t.end);
    if (t.k === 'op' && t.v === '(') { const x = or(); expect(')'); return x; }
    if (t.k === 'op' && t.v === '{') {
      const items = [];
      if (!isOp('}')) for (;;) { items.push(or()); if (!isOp(',')) break; next(); }
      return span({ k: 'arr', items }, t.pos, expect('}').end);
    }
    if (t.k === 'end') throw new FormulaError('The formula ends too soon.', t.pos);
    throw new FormulaError(`Didn’t expect “${t.v}” here.`, t.pos);
  };

  const ast = or();
  if (peek().k !== 'end') throw new FormulaError(`Didn’t expect “${peek().v}” here.`, peek().pos);
  return ast;
}

// A row's kind from how it starts: `=` gives a value, `←` (or `<-` as typed) is short for = IF(c, TRUE). The
// body's offset is where it starts in the text, so spans count from the start of the row's formula.
function splitFormula(text) {
  const s = String(text ?? '');
  const m = /^(\s*)(←|<-|=)?/.exec(s);
  const kind = m[2] === '=' ? 'value' : m[2] ? 'implies' : null;
  return { kind, body: s.slice(m[0].length), offset: m[0].length };
}

// Typing `<-` at the start of a formula turns it into `←`.
const tidyArrow = text => String(text ?? '').replace(/^(\s*)<-/, '$1←');

// Formulas parsed already, by their text: the same definitions are worked out after every edit.
const parsedCache = new Map();
function parseCached(body, offset) {
  const key = `${offset}|${body}`;
  if (!parsedCache.has(key)) {
    if (parsedCache.size > 500) parsedCache.clear();
    parsedCache.set(key, parseExpression(body, offset));
  }
  return parsedCache.get(key);
}

// ---- Locations and parameterizations ----
// Keys follow model.js: a location's specification is specKey(), and a parameterization is a sorted list of
// [edge, location specification] pairs, each serialized.

// 'Entity › Entity Type: Limited Partnership' as a kind and the segments below it.
function parseLocation(text) {
  const [kind, ...segs] = String(text).split(/\s*[›>]\s*/).map(clean).filter(Boolean);
  return {
    kind,
    segs: segs.map(s => {
      let m;
      if ((m = /^(.+?):\s*(.+)$/.exec(s))) return { edge: m[1], choice: m[2] };
      if ((m = /^not\s+(.+)$/i.exec(s))) return { edge: m[1], tag: false };
      return { edge: s, tag: true };
    }),
  };
}

// A location's specification key, as model.js's specKey() would give it for a record there.
function locationKey(text) {
  const loc = parseLocation(text);
  let key = `kind:${normal(loc.kind)}`;
  for (const s of loc.segs)
    key = JSON.stringify([s.choice !== undefined ? `choice:${normal(s.choice)}` : `tag:${s.tag}`, JSON.stringify([normal(s.edge), key])]);
  return key;
}

const parameterizationKey = params => JSON.stringify(params.map(p => JSON.stringify([normal(p.edge), p.spec])).sort());

// The parameterizations a definition covers: its `covers`, or those of the locations it's written with (for a
// relation, every combination of its parameters' locations).
function coversOf(def) {
  if (def.covers) return def.covers;
  if (!def.args) return (def.at ?? []).map(at => parameterizationKey([{ edge: def.name, spec: locationKey(at) }]));
  let combos = [[]];
  for (const a of def.args) combos = combos.flatMap(c => (a.at ?? []).map(at => [...c, { edge: a.edge, spec: locationKey(at) }]));
  return combos.map(parameterizationKey);
}

// A parameterization key as its parameters: [{ edge, spec }], edges normalized.
const paramsOf = key => JSON.parse(key).map(s => { const [edge, spec] = JSON.parse(s); return { edge, spec }; });

// The edge labels a specification key mentions, at any depth.
function edgesInSpec(spec, out = new Set()) {
  if (spec.startsWith('kind:')) return out;
  const [, ...args] = JSON.parse(spec);
  for (const a of args) { const [edge, sub] = JSON.parse(a); out.add(edge); edgesInSpec(sub, out); }
  return out;
}

// The parameterizations of the specifications a specification key runs through, itself included.
function paramsInSpec(spec, out = new Set()) {
  if (spec.startsWith('kind:')) return out;
  const [, ...args] = JSON.parse(spec);
  out.add(JSON.stringify(args));
  for (const a of args) paramsInSpec(JSON.parse(a)[1], out);
  return out;
}

// ---- The state being worked out ----
// The records, entered and computed so far, indexed by where they're located.

function objectOf(S, id) {
  for (let cur = id, n = 0; cur && n < 64; n++) {
    const r = S.recs[cur];
    if (!r) return null;
    if (isObject(r)) return cur;
    cur = r.at;
  }
  return null;
}

// The records from the object down to `id`, or null if the path runs through a relation.
function pathOf(S, id) {
  const path = [];
  for (let cur = id, n = 0; cur && n < 64; n++) {
    const r = S.recs[cur];
    if (!r) return null;
    path.unshift(cur);
    if (isObject(r)) return path;
    cur = r.at;
  }
  return null;
}

function nameOf(S, id) {
  const r = S.recs[id];
  if (!r) return '(deleted)';
  if (!isObject(r)) return segmentOf(S, id);
  const nameId = S.byAtName.get(`${id}|name`);
  return nameId ? String(S.recs[nameId].value) : `${r.kind} ${id}`;
}

function segmentOf(S, id) {
  const r = S.recs[id];
  if (isObject(r)) return nameOf(S, id);
  if (isRelation(r)) return r.args.map(a => nameOf(S, objectOf(S, a.at))).join(' → ');
  if (isTag(r)) return `${r.tag ? '' : 'Not '}${r.edge}`;
  return isChoice(r) ? `${r.edge}: ${r.choice}` : r.edge;
}

// How a location reads: its object's name, then the segments below it.
const placeOf = (S, id) => (pathOf(S, id) ?? [id]).map((p, i) => i ? segmentOf(S, p) : nameOf(S, p)).join(' › ');

const argKey = args => JSON.stringify(args.map(a => JSON.stringify([normal(a.edge), a.at])).sort());
// A record's argumentation key, worked out once per record.
const keyCache = new WeakMap();
function keyOf(r) {
  if (!keyCache.has(r)) keyCache.set(r, argKey(argsOf(r)));
  return keyCache.get(r);
}

function push(map, key, value) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
}

const distinct = xs => xs.filter((x, i) => xs.indexOf(x) === i);
// Whether an id is an object's: a computed record a record is located at may not be there yet.
const isObjectAt = (S, id) => !!S.recs[id] && isObject(S.recs[id]);

// Lookups kept from before (see remembered) are let go when a record comes or goes, unless the group being
// worked out keeps track of what each read (see runGroup).
function addRecord(S, id, r, known) {
  if (S.forgetting) S.memo.clear();
  S.recs[id] = r;
  indexRecord(S, id, r, known);
}

// A record is indexed by where it's located and its name there; a relation record by each record it's
// located at, but an object, which has its relations by signature, and by its objects (see indexByObjects).
function indexRecord(S, id, r, known) {
  if (r.at) {
    push(S.byAt, r.at, id);
    S.byAtName.set(`${r.at}|${normal(r.edge)}`, id);
  }
  if (r.args) {
    for (const at of distinct(r.args.map(a => a.at))) if (!isObjectAt(S, at)) push(S.relsAt, at, id);
    indexByObjects(S, id, r, known);
  }
}

// A relation record by each object it relates, with its signature, and by the call that finds it: its
// signature with each argument's edge and object. Records of another form, or located below their objects
// elsewhere, can share a call's key, so a call still checks what it finds. The objects are kept, to take
// it back out by.
function indexByObjects(S, id, r, known) {
  const objs = known?.objs ?? r.args.map(a => objectOf(S, a.at)), sig = known?.sig ?? signatureOf(r), edges = known?.edges ?? r.args.map(a => normal(a.edge));
  const call = known?.call || `${sig}|${edges.map((e, i) => `${e}=${objs[i]}`).sort().join('&')}`;
  for (const obj of distinct(objs)) {
    if (!S.byObject.has(obj)) S.byObject.set(obj, new Map());
    push(S.byObject.get(obj), sig, id);
  }
  edges.forEach((e, i) => push(S.byEdge, `${sig}|${e}=${objs[i]}`, id));
  push(S.relsByCall, call, id);
  S.indexed.set(id, { objs, edges, sig, call, seq: S.seq++ });
  const names = listNamesOf(S, sig);
  for (const e of edges) names.add(e);
}
const pull = (map, key, id) => { const list = map?.get(key); if (list) map.set(key, list.filter(x => x !== id)); };
function unindexByObjects(S, id) {
  const { objs, edges, sig, call } = S.indexed.get(id);
  for (const obj of distinct(objs)) pull(S.byObject.get(obj), sig, id);
  edges.forEach((e, i) => pull(S.byEdge, `${sig}|${e}=${objs[i]}`, id));
  pull(S.relsByCall, call, id);
  S.indexed.delete(id);
}

// The names a relation record of a signature can make a list under: the list names any relation of that
// signature is given, and the edge labels of its records, as they come (see listsOf).
function listNamesOf(S, sig) {
  if (!S.listNames.has(sig)) {
    const names = new Set();
    for (const rel of S.P.reg.byName.values()) if (rel.sig === sig) for (const name of rel.lists.values()) names.add(normal(name));
    S.listNames.set(sig, names);
  }
  return S.listNames.get(sig);
}

// The relation records at an object that can make a list called `n` (or every one), in the order they came in.
function relationsFor(S, obj, n = null) {
  let out = null, merged = false;
  for (const [sig, rids] of S.byObject.get(obj) ?? []) if (rids.length && (n === null || listNamesOf(S, sig).has(n))) {
    merged = !!out;
    out = out ? out.concat(rids) : rids;
  }
  if (merged) out.sort((a, b) => S.indexed.get(a).seq - S.indexed.get(b).seq);
  return out ?? [];
}

// Takes a record back out.
function removeRecord(S, id) {
  const r = S.recs[id];
  if (!r) return;
  if (S.forgetting) S.memo.clear();
  if (r.at) {
    pull(S.byAt, r.at, id);
    if (S.byAtName.get(`${r.at}|${normal(r.edge)}`) === id) S.byAtName.delete(`${r.at}|${normal(r.edge)}`);
  }
  if (r.args) {
    for (const at of distinct(r.args.map(a => a.at))) if (!isObjectAt(S, at)) pull(S.relsAt, at, id);
    unindexByObjects(S, id);
  }
  const spec = S.specs.get(id);
  if (spec) { pull(S.bySpec, spec, id); S.specs.delete(id); }
  delete S.recs[id];
}

// A relation's name and list names belong to its form (model.html §2): its specification's shape, with every
// node label erased, and its sort. Names given without a form fall back on the relation's output type and
// edge labels, its signature. Records don't change, so each one's is worked out once.
const typeOf = r => isField(r) ? 'field' : isTag(r) ? 'tag' : 'choice';
const signature = (type, edges) => `${type}:${edges.map(normal).sort().join('|')}`;
const sigCache = new WeakMap();
function signatureOf(r) {
  if (!sigCache.has(r)) sigCache.set(r, signature(typeOf(r), r.args.map(a => a.edge)));
  return sigCache.get(r);
}
// A record's form, keyed as model.js keys forms: [sort, ...[edge, shape of its location]], sorted. A record
// whose location isn't there yet, being a computed record not yet worked out, has no form yet (null).
const argShapes = (S, r) => {
  const out = [];
  for (const a of argsOf(r)) {
    const shape = shapeOfRecord(S, a.at);
    if (shape === null) return null;
    out.push(JSON.stringify([normal(a.edge), shape]));
  }
  return out.sort();
};
function shapeOfRecord(S, id) {
  const r = S.recs[id];
  if (!r) return null;
  if (isObject(r)) return '•';
  if (!S.shapes.has(r)) {
    const args = argShapes(S, r);
    if (!args) return null;
    S.shapes.set(r, JSON.stringify(['∘', ...args]));
  }
  return S.shapes.get(r);
}
function formOfRecord(S, r) {
  if (!S.forms.has(r)) {
    const args = argShapes(S, r);
    if (!args) return null;
    S.forms.set(r, JSON.stringify([isField(r) ? r.field : isChoice(r) ? 'choice' : 'tag', ...args]));
  }
  return S.forms.get(r);
}
const relationOf = (S, r) => S.P.reg.byForm.get(formOfRecord(S, r)) ?? S.P.reg.bySig.get(signatureOf(r));
const listNameOf = (rel, from, listed) => rel?.lists.get(`${normal(from)}|${normal(listed)}`) ?? listed;

// While a ground is worked out (see ground), the records its group gave from its stage on are out of sight.
const inSight = (S, id) => !S.cut || !S.cut.defs.has(S.recs[id]?.computed) || S.stage.get(id) < S.cut.limit;

// ---- Looking names up ----

// While a looping group is worked out, a lookup by a name the group's own definitions give records under
// notes its key, found or not: that's what the row being worked out depends on, since one of the group's
// candidates could turn up there. `kind` is how it was looked for: 'entry' (at a location, by name), 'lists'
// (a list of relatives at a location), 'calls' (a relation call, by its arguments' objects), and, for finding
// candidates (see holdsWhere), 'rel' (a relation's records with one argument given) and 'inverse' (whose list
// of a name an object is on). candidateKeys gives the keys under which a candidate could turn up.
function depend(S, kind, name, key) {
  if (S.reads && S.dep?.[kind].has(name)) { S.reads.keys.push(`${kind}|${key}`); S.dep.watched.add(kind); if (VALUE_KINDS.has(kind)) S.dep.watchedValues.add(kind); }
}

// What a name gives where nothing has it: an empty list for a list the schema has somewhere, nothing for any
// other name the schema has somewhere, and an error for a name it doesn't have at all.
function missing(S, name) {
  const n = normal(name);
  if (S.P.known.lists.has(n)) return [];
  if (S.P.known.values.has(n)) return null;
  return err('#NAME?', `Nothing is called ${name}.`);
}

// The relatives listed under `n` at a location: the other arguments' objects, each remembering the relation
// record that links it. A ruled-out tag doesn't make a relative. Null if no relation here gives that list.
// An object also has the lists of relations whose parameter sits below it, the way a relation call fills a
// parameter through the object's record there: a fund's General Partners, though the relation is located at
// its Entity Type. A list answers to its name and also to the edge label it lists.
const listAt = (S, id, n) => remembered(S, `list|${id}|${n}`, () => { depend(S, 'lists', n, `${id}|${n}`); return listHere(S, id, n); });
function listHere(S, id, n) {
  let hit = false;
  const items = [];
  const onObject = isObject(S.recs[id]);
  for (const rid of onObject ? relationsFor(S, id, n) : S.relsAt.get(id) ?? []) {
    const r = S.recs[rid];
    if (!inSight(S, rid)) continue;
    for (const { own, other, list, alias } of listsOf(S, r)) {
      if ((list !== n && alias !== n) || (onObject ? objectOf(S, own.at) !== id : own.at !== id)) continue;
      hit = true;
      if (isTag(r) && r.tag !== true) continue;
      items.push(recOf(objectOf(S, other.at) ?? other.at, rid));
    }
  }
  return hit ? items : null;
}

// The lists of relatives a relation record makes: for each argument, seen from each other argument, the
// list's name, normalized, and the edge label it also answers to. Worked out once per record, once its form
// is known (see formOfRecord).
function listsOf(S, r) {
  if (S.recLists.has(r)) return S.recLists.get(r);
  const rel = relationOf(S, r);
  const out = [];
  r.args.forEach((own, i) => r.args.forEach((other, j) => { if (i !== j) out.push({ own, other, list: normal(listNameOf(rel, own.edge, other.edge)), alias: normal(other.edge) }); }));
  if (formOfRecord(S, r) !== null) S.recLists.set(r, out);
  return out;
}
const argEdges = new WeakMap();
function argByEdge(r, n) {
  if (!argEdges.has(r)) argEdges.set(r, new Map(r.args.map(a => [normal(a.edge), a])));
  return argEdges.get(r).get(n);
}

const ambiguous = name => err('#NAME?', `${name} could mean more than one thing here.`);

// The entry called `n` at a record, if in sight, or what its formula gave there where that was an error.
function entryAt(S, id, n, found) {
  depend(S, 'entry', n, `${id}|${n}`);
  const entry = S.byAtName.get(`${id}|${n}`);
  if (entry && inSight(S, entry)) found.push(recOf(entry));
  else if (S.failed.has(`${id}|${n}`)) found.push(S.failed.get(`${id}|${n}`));
}

// On a tag a definition covers, a row's label: TRUE where the tag is attested and a row with that label holds.
function labelOn(S, id, n) {
  const r = S.recs[id];
  if (!r || !isTag(r)) return null;
  const d = defOf(S, id);
  if (!d?.labels.has(n)) return null;
  return { v: r.tag === true && holdsLabel(S, r, n) };
}

// Whether a row with this label holds at a record's candidate; while a ground is worked out, whether it held
// before the stage in sight.
function holdsLabel(S, r, n) {
  const t = S.holds.get(keyOf(r));
  if (!t?.rows.some(i => t.d.rows[i].n === n)) return false;
  return !S.cut?.defs.has(t.d.id) || t.labels?.get(n) < S.cut.limit;
}

// A name on the relation record a relative was reached through: its arguments by edge label, its output by
// the relation's name, the entries located at it, and its rows' labels. Where a relation is named like one of
// its edges (Close Affiliate), the edge wins; a relation call still reaches its output.
function linkLookup(S, rid, n, name) {
  const r = S.recs[rid];
  if (!r) return null;
  const found = [];
  const arg = argByEdge(r, n);
  if (arg) found.push(recOf(objectOf(S, arg.at)));
  else if (relationOf(S, r)?.n === n) found.push(recOf(rid));
  entryAt(S, rid, n, found);
  if (found.length > 1) return { v: ambiguous(name) };
  return found.length ? { v: found[0] } : labelOn(S, rid, n);
}

// A name on one record: its entries by label, its lists of relatives by name, a relation record's arguments
// by edge label, and a tag's rows' labels.
function ownLookup(S, id, n, name) {
  const found = [];
  entryAt(S, id, n, found);
  const list = listAt(S, id, n);
  if (list) found.push(list);
  const r = S.recs[id];
  const arg = isRelation(r) && argByEdge(r, n);
  if (arg) found.push(recOf(objectOf(S, arg.at)));
  if (found.length > 1) return { v: ambiguous(name) };
  return found.length ? { v: found[0] } : labelOn(S, id, n);
}

// A dot: on a list, the name on each item; on a record reached through a relation, the relation first;
// then the record itself, and on up its path to its object.
function lookupOn(S, v, name, n = normal(name)) {
  if (Array.isArray(v)) {
    const out = [];
    for (const x of v) {
      const y = lookupOn(S, x, name, n);
      if (isErr(y)) return y;
      if (Array.isArray(y)) out.push(...y); else out.push(y);
    }
    return out;
  }
  if (v === null || v === undefined || isErr(v)) return v ?? null;
  if (!isRec(v)) return err('#VALUE!', `Can’t look up ${name} on ${describe(S, v)}.`);
  if (v.id === null || !S.recs[v.id]) return null;
  if (v.link) {
    const hit = linkLookup(S, v.link, n, name);
    if (hit) return hit.v;
  }
  for (let id = v.id; id && S.recs[id]; id = S.recs[id].at) {
    const hit = ownLookup(S, id, n, name);
    if (hit) return hit.v;
  }
  return missing(S, name);
}

// A name on its own: a LET name; in a relation's formula, one of its arguments, as an object; in an entry's
// formula, a name on its location, looked up the path.
function lookupBare(c, name, n = normal(name)) {
  for (let l = c.lets; l; l = l.up) if (l.n === n) return l.v;
  if (c.self.args) return c.self.args.has(n) ? recOf(c.self.args.get(n)) : err('#NAME?', `${name} isn’t one of this relation’s arguments.`);
  return lookupOn(c.S, recOf(c.self.loc), name, n);
}

// ---- Turning values into one value ----

// Where one value is expected: a list of one is its item, an empty list is nothing, and a record is its
// output, except that an object stands for itself.
function scalar(S, v) {
  if (Array.isArray(v)) {
    if (!v.length) return null;
    if (v.length > 1) return err('#VALUE!', `Expected one value but got a list of ${v.length}.`);
    return scalar(S, v[0]);
  }
  if (!isRec(v)) return v ?? null;
  return v.id === null ? null : output(S, v.id);
}

function output(S, id) {
  const r = S.recs[id];
  if (!r) return null;
  if (isObject(r)) return recOf(id);
  if (isTag(r)) return r.tag;
  if (isChoice(r)) return r.choice;
  // Values are canonical: numbers for numbers, percentages and money, ISO strings for dates.
  if (r.field === 'date') return { t: 'date', iso: r.value };
  if (typeof r.value === 'string' && r.field !== 'text') return readNumber(r.value) ?? r.value;
  return r.value;
}

// A record, where the formula needs the record itself rather than its output.
function asRec(S, v) {
  if (Array.isArray(v)) {
    if (!v.length) return null;
    if (v.length > 1) return err('#VALUE!', `Expected one record but got a list of ${v.length}.`);
    return asRec(S, v[0]);
  }
  if (v === null || isErr(v) || isRec(v)) return v;
  return err('#VALUE!', `${describe(S, v)} isn’t a record.`);
}

const flatten = v => Array.isArray(v) ? v.flatMap(flatten) : [v];
// A list without lists in it is kept as it is, not copied, so what's worked out once from a list that's
// kept (objectIds) is found again.
const toList = v => isErr(v) ? v : v === null || v === undefined ? [] : !Array.isArray(v) ? [v] : v.some(Array.isArray) ? v.flatMap(flatten) : v;

// In a condition, nothing is FALSE.
function truth(S, v) {
  v = scalar(S, v);
  if (isErr(v) || typeof v === 'boolean') return v;
  if (v === null) return false;
  if (typeof v === 'number') return v !== 0;
  return err('#VALUE!', `${describe(S, v)} isn’t TRUE or FALSE.`);
}

function toNumber(S, v) {
  v = scalar(S, v);
  if (isErr(v) || typeof v === 'number') return v;
  if (v === null) return 0;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'string' && readNumber(v) !== null) return readNumber(v);
  return err('#VALUE!', `${describe(S, v)} isn’t a number.`);
}

const tidyNumber = n => Number(n.toPrecision(12));

function toText(S, v) {
  v = scalar(S, v);
  if (isErr(v)) return v;
  if (v === null) return '';
  if (typeof v === 'number') return String(tidyNumber(v));
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (isDate(v)) return Tree.formatDate(v.iso);
  if (isRec(v)) return nameOf(S, v.id);
  return String(v);
}

function describe(S, v) {
  if (v === null) return 'nothing';
  if (isRec(v)) return v.id === null ? 'nothing' : nameOf(S, v.id);
  if (Array.isArray(v)) return `a list of ${v.length}`;
  if (typeof v === 'string') return `“${v}”`;
  return toText(S, v);
}

// ---- Comparing ----

const near = (a, b) => Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(a), Math.abs(b));

// As in Excel, nothing equals 0, empty text and FALSE. Objects are equal only to themselves, and text
// compares without regard to case.
function equal(a, b) {
  if (isRec(a) || isRec(b)) return isRec(a) && isRec(b) && a.id === b.id;
  if (a === null && b === null) return true;
  if (a === null || b === null) { const x = a ?? b; return x === 0 || x === '' || x === false; }
  if (typeof a === 'number' && typeof b === 'number') return near(a, b);
  if (typeof a === 'string' && typeof b === 'string') return same(a, b);
  if (isDate(a) && isDate(b)) return a.iso === b.iso;
  return a === b;
}

// Nothing takes the least value of the other side's kind, as in Excel: 0, empty text, FALSE, or a date
// before every date.
const EARLIEST = { t: 'date', iso: '0000-01-01' };
function ordering(S, a, b) {
  const least = x => typeof x === 'string' ? '' : typeof x === 'boolean' ? false : isDate(x) ? EARLIEST : 0;
  if (a === null) a = least(b);
  if (b === null) b = least(a);
  if (typeof a === 'number' && typeof b === 'number') return near(a, b) ? 0 : Math.sign(a - b);
  if (typeof a === 'string' && typeof b === 'string') return Math.sign(a.localeCompare(b, undefined, { sensitivity: 'base' }));
  if (typeof a === 'boolean' && typeof b === 'boolean') return a === b ? 0 : a ? 1 : -1;
  if (isDate(a) && isDate(b)) return Math.sign(a.iso.localeCompare(b.iso));
  return err('#VALUE!', `Can’t put ${describe(S, a)} and ${describe(S, b)} in order.`);
}

function compare(S, op, a, b) {
  a = scalar(S, a);
  if (isErr(a)) return a;
  b = scalar(S, b);
  if (isErr(b)) return b;
  if (op === '=') return equal(a, b);
  if (op === '<>') return !equal(a, b);
  const o = ordering(S, a, b);
  if (isErr(o)) return o;
  return op === '<' ? o < 0 : op === '>' ? o > 0 : op === '<=' ? o <= 0 : o >= 0;
}

// ---- Dates ----

const isoOf = d => d.toISOString().slice(0, 10);
const dayOf = v => Date.UTC(...v.iso.split('-').map((x, i) => Number(x) - (i === 1 ? 1 : 0))) / 864e5;
const fromDay = n => ({ t: 'date', iso: isoOf(new Date(n * 864e5)) });

// ---- Working out expressions ----
// A context `c` holds the state S, `def`, `self` (a relation's arguments by edge, as objects, or an entry's
// location), `at` for `@`, and any LET names. While the formula bar asks (see evaluateRow), S.probe hears
// every part's value.

function ev(node, c) {
  const v = evNode(node, c);
  if (c.S.probe) c.S.probe(node, v);
  return v;
}

function evNode(node, c) {
  const S = c.S;
  switch (node.k) {
    case 'lit': return node.v;
    case 'arr': {
      const out = [];
      for (const x of node.items) { const v = ev(x, c); if (isErr(v)) return v; out.push(...toList(v)); }
      return out;
    }
    case 'at': return c.at ?? err('#VALUE!', '@ means nothing here.');
    case 'name': return lookupBare(c, node.name, node.n);
    case 'dot': return lookupOn(S, ev(node.x, c), node.name, node.n);
    case 'call': return call(node, c);
    case 'neg': {
      const v = scalar(S, ev(node.x, c));
      if (v === null || isErr(v)) return v;
      const x = toNumber(S, v);
      return isErr(x) || node.op === '+' ? x : -x;
    }
    case 'not': {
      const t = truth(S, ev(node.x, c));
      return isErr(t) ? t : !t;
    }
    // AND and OR stop as soon as the answer is known.
    case 'and': case 'or': {
      const a = truth(S, ev(node.a, c));
      if (isErr(a) || a === (node.k === 'or')) return a;
      return truth(S, ev(node.b, c));
    }
    case 'cmp': return compare(S, node.op, ev(node.a, c), ev(node.b, c));
    case 'in': return among1(S, ev(node.a, c), ev(node.b, c));
    case 'bin': return arithmetic(S, node.op, ev(node.a, c), ev(node.b, c));
  }
  return err('#VALUE!', 'Unknown expression.');
}

// `x IN list`: whether x is one of the list's items.
function among1(S, x, l) {
  const a = scalar(S, x);
  if (isErr(a)) return a;
  const list = toList(l);
  if (isErr(list)) return list;
  if (isRec(a)) { const ids = objectIds(S, list); if (ids) return ids.has(a.id); }
  for (const y of list) { const s = scalar(S, y); if (isErr(s)) return s; if (equal(a, s)) return true; }
  return false;
}

// A long list of objects as the set of their ids, for IN: worked out once per list, since a lookup gives the
// same list until the state changes. An object is in it just when its id is.
const listIds = new WeakMap();
function objectIds(S, list) {
  if (list.length < 8) return null;
  if (!listIds.has(list)) listIds.set(list, list.every(x => isRec(x) && x.id && isObject(S.recs[x.id])) ? new Set(list.map(x => x.id)) : null);
  return listIds.get(list);
}

// Nothing drops out of a sum and wipes out a product.
function arithmetic(S, op, a, b) {
  if (op === '&') {
    const x = toText(S, a), y = toText(S, b);
    return isErr(x) ? x : isErr(y) ? y : x + y;
  }
  a = scalar(S, a);
  if (isErr(a)) return a;
  b = scalar(S, b);
  if (isErr(b)) return b;
  if (a === null || b === null) {
    if (op === '*' || op === '/' || (a === null && b === null)) return null;
    if (b === null) return a;
    if (op === '+') return b;
    const y = toNumber(S, b);
    return isErr(y) ? y : -y;
  }
  // Dates subtract to a number of days, and move by a number of days.
  if (isDate(a) && isDate(b) && op === '-') return dayOf(a) - dayOf(b);
  if (isDate(a) && (op === '+' || op === '-')) {
    const n = toNumber(S, b);
    return isErr(n) ? n : fromDay(dayOf(a) + (op === '+' ? n : -n));
  }
  if (isDate(b) && op === '+') {
    const n = toNumber(S, a);
    return isErr(n) ? n : fromDay(dayOf(b) + n);
  }
  const x = toNumber(S, a), y = toNumber(S, b);
  if (isErr(x)) return x;
  if (isErr(y)) return y;
  if (op === '+') return x + y;
  if (op === '-') return x - y;
  if (op === '*') return x * y;
  return y === 0 ? err('#DIV/0!', 'Division by zero.') : x / y;
}

const arity = (name, a, min, max = min) =>
  a.length < min || a.length > max ? err('#VALUE!', `${name} takes ${min === max ? min : `${min} to ${max}`} arguments.`) : null;

// The values of all the arguments, as one flat list.
function flatArgs(a, c) {
  const out = [];
  for (const x of a) { const v = toList(ev(x.x, c)); if (isErr(v)) return v; out.push(...v); }
  return out;
}

function numbersOf(a, c) {
  const items = flatArgs(a, c);
  if (isErr(items)) return items;
  const out = [];
  for (const x of items) { const s = scalar(c.S, x); if (isErr(s)) return s; if (typeof s === 'number') out.push(s); }
  return out;
}

// MIN and MAX: of numbers, or of dates (the earliest or latest), skipping nothing and text. Of nothing,
// nothing.
function extremeOf(name, a, c, sign) {
  const items = flatArgs(a, c);
  if (isErr(items)) return items;
  const nums = [], dates = [];
  for (const x of items) {
    const s = scalar(c.S, x);
    if (isErr(s)) return s;
    if (typeof s === 'number') nums.push(s); else if (isDate(s)) dates.push(s);
  }
  if (nums.length && dates.length) return err('#VALUE!', `${name} takes numbers or dates, not both.`);
  if (!dates.length) return nums.length ? (sign > 0 ? Math.max(...nums) : Math.min(...nums)) : null;
  return dates.reduce((m, d) => (sign > 0 ? d.iso > m.iso : d.iso < m.iso) ? d : m);
}

const withAt = (c, at) => ({ S: c.S, def: c.def, self: c.self, at, lets: c.lets });

// The functions in formulas.md's table. Each gets its argument nodes, so that IF, FILTER and the like can
// work out only what they need, and with `@` set to each item.
const FUNCTIONS = {
  // IF with no third argument gives nothing where its condition fails: so `← c`, which is IF(c, TRUE),
  // never rules anything out.
  IF(a, c) {
    const bad = arity('IF', a, 2, 3);
    if (bad) return bad;
    const t = truth(c.S, ev(a[0].x, c));
    if (isErr(t)) return t;
    return t ? ev(a[1].x, c) : a[2] ? ev(a[2].x, c) : null;
  },
  AND(a, c) {
    for (const x of a) for (const v of toList(ev(x.x, c))) { const t = truth(c.S, v); if (isErr(t) || !t) return t; }
    return true;
  },
  OR(a, c) {
    for (const x of a) for (const v of toList(ev(x.x, c))) { const t = truth(c.S, v); if (isErr(t) || t) return t; }
    return false;
  },
  NOT(a, c) {
    const bad = arity('NOT', a, 1);
    if (bad) return bad;
    const t = truth(c.S, ev(a[0].x, c));
    return isErr(t) ? t : !t;
  },
  BLANK(a) { return arity('BLANK', a, 0) ?? null; },
  ISBLANK(a, c) {
    const bad = arity('ISBLANK', a, 1);
    if (bad) return bad;
    const v = ev(a[0].x, c);
    if (Array.isArray(v)) return v.length === 0;
    if (isRec(v)) return v.id === null || !c.S.recs[v.id];
    return v === null;
  },
  // COUNT counts every item that's something, so COUNT of nothing is 0.
  COUNT(a, c) {
    const items = flatArgs(a, c);
    return isErr(items) ? items : items.filter(x => !isNothing(x)).length;
  },
  SUM(a, c) {
    const xs = numbersOf(a, c);
    return isErr(xs) ? xs : xs.length ? xs.reduce((s, x) => s + x, 0) : null;
  },
  MIN(a, c) { return extremeOf('MIN', a, c, -1); },
  MAX(a, c) { return extremeOf('MAX', a, c, 1); },
  AVERAGE(a, c) {
    const xs = numbersOf(a, c);
    return isErr(xs) ? xs : xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null;
  },
  UNIQUE(a, c) {
    const items = flatArgs(a, c);
    if (isErr(items)) return items;
    const out = [], seen = [];
    for (const x of items) {
      const s = scalar(c.S, x);
      if (isErr(s)) return s;
      if (!seen.some(y => equal(y, s))) { seen.push(s); out.push(x); }
    }
    return out;
  },
  TEXTJOIN(a, c) {
    if (a.length < 3) return err('#VALUE!', 'TEXTJOIN takes a delimiter, whether to skip empty text, and the text to join.');
    const delim = toText(c.S, ev(a[0].x, c));
    if (isErr(delim)) return delim;
    const skip = truth(c.S, ev(a[1].x, c));
    if (isErr(skip)) return skip;
    const items = flatArgs(a.slice(2), c);
    if (isErr(items)) return items;
    const texts = [];
    for (const x of items) { const t = toText(c.S, x); if (isErr(t)) return t; if (t !== '' || !skip) texts.push(t); }
    return texts.join(delim);
  },
  FILTER(a, c) {
    const bad = arity('FILTER', a, 2);
    if (bad) return bad;
    return eachItem(a, c, (item, v, out) => { const t = truth(c.S, v); if (isErr(t)) return t; if (t) out.push(item); });
  },
  ANY(a, c) {
    const bad = arity('ANY', a, 2);
    if (bad) return bad;
    const list = toList(ev(a[0].x, c));
    if (isErr(list)) return list;
    for (const item of list) { const t = truth(c.S, ev(a[1].x, withAt(c, item))); if (isErr(t) || t) return t; }
    return false;
  },
  ALL(a, c) {
    const bad = arity('ALL', a, 2);
    if (bad) return bad;
    const list = toList(ev(a[0].x, c));
    if (isErr(list)) return list;
    for (const item of list) { const t = truth(c.S, ev(a[1].x, withAt(c, item))); if (isErr(t) || !t) return t; }
    return true;
  },
  EACH(a, c) {
    const bad = arity('EACH', a, 2);
    if (bad) return bad;
    return eachItem(a, c, (item, v, out) => { if (isErr(v)) return v; out.push(...(Array.isArray(v) ? flatten(v) : [v])); });
  },
  LET(a, c) {
    if (a.length < 3 || a.length % 2 === 0) return err('#VALUE!', 'LET takes pairs of a name and a value, then an expression.');
    let lets = c.lets;
    for (let i = 0; i < a.length - 1; i += 2) {
      if (a[i].x.k !== 'name') return err('#VALUE!', 'LET needs a name before each value.');
      const v = ev(a[i + 1].x, { ...c, lets });
      if (isErr(v)) return v;
      lets = { n: normal(a[i].x.name), v, up: lets };
    }
    return ev(a.at(-1).x, { ...c, lets });
  },
  KIND(a, c) {
    const bad = arity('KIND', a, 1);
    if (bad) return bad;
    const v = asRec(c.S, ev(a[0].x, c));
    if (isErr(v)) return v;
    return v?.id ? c.S.recs[objectOf(c.S, v.id)]?.kind ?? null : null;
  },
  // The object whose Name is the text, without regard to case: nothing if there's none, an error if several.
  OBJECT(a, c) {
    const bad = arity('OBJECT', a, 1);
    if (bad) return bad;
    const name = toText(c.S, ev(a[0].x, c));
    if (isErr(name)) return name;
    const hits = remembered(c.S, `object|${normal(name)}`, () => Object.keys(c.S.recs).filter(id => {
      if (!isObject(c.S.recs[id])) return false;
      depend(c.S, 'entry', 'name', `${id}|name`);
      const nameId = c.S.byAtName.get(`${id}|name`);
      return !!nameId && same(c.S.recs[nameId].value, name);
    }));
    if (hits.length > 1) return err('#VALUE!', `More than one thing is called ${name}.`);
    return hits.length ? recOf(hits[0]) : null;
  },
  // The expression, worked out as if x and everything depending on it weren't in the chart.
  WITHOUT(a, c) {
    const bad = arity('WITHOUT', a, 2);
    if (bad) return bad;
    const x = asRec(c.S, ev(a[0].x, c));
    if (isErr(x)) return x;
    if (!x?.id) return ev(a[1].x, c);
    return ev(a[1].x, { ...c, S: counterfactual(c.S, x.id, c.def) });
  },
  TODAY(a) { return arity('TODAY', a, 0) ?? { t: 'date', iso: isoOf(new Date()) }; },
  // A date of nothing is nothing.
  DATE(a, c) {
    const bad = arity('DATE', a, 3);
    if (bad) return bad;
    const parts = a.map(x => scalar(c.S, ev(x.x, c)));
    const e = parts.find(isErr);
    if (e) return e;
    if (parts.some(x => x === null)) return null;
    const [y, m, d] = parts.map(x => toNumber(c.S, x));
    return [y, m, d].find(isErr) ?? { t: 'date', iso: isoOf(new Date(Date.UTC(y, m - 1, d))) };
  },
  YEAR(a, c) { return datePart(a, c, 'YEAR', 0); },
  MONTH(a, c) { return datePart(a, c, 'MONTH', 1); },
  DAY(a, c) { return datePart(a, c, 'DAY', 2); },
  // As in Excel: the date some months on, kept within the month it lands in; and the last day of that month.
  EDATE(a, c) { return monthsOn(a, c, 'EDATE', false); },
  EOMONTH(a, c) { return monthsOn(a, c, 'EOMONTH', true); },
  // As in Excel, without holidays: the date some working days (Monday to Friday) after a date, or before it
  // for a negative count. WORKDAY(d - 1, 1) is the first working day on or after d.
  WORKDAY(a, c) {
    const bad = arity('WORKDAY', a, 2);
    if (bad) return bad;
    const d = scalar(c.S, ev(a[0].x, c));
    if (isErr(d) || d === null) return d;
    if (!isDate(d)) return err('#VALUE!', 'WORKDAY takes a date first.');
    const n = toNumber(c.S, ev(a[1].x, c));
    if (isErr(n)) return n;
    const step = n < 0 ? -1 : 1;
    let day = dayOf(d);
    for (let left = Math.abs(Math.trunc(n)); left > 0;) {
      day += step;
      const weekday = new Date(day * 864e5).getUTCDay();
      if (weekday !== 0 && weekday !== 6) left--;
    }
    return fromDay(day);
  },
  // Years between two dates, counting actual days over 365.
  YEARFRAC(a, c) {
    const bad = arity('YEARFRAC', a, 2);
    if (bad) return bad;
    const [x, y] = a.map(n => scalar(c.S, ev(n.x, c)));
    if (x === null || y === null) return null;
    if (!isDate(x) || !isDate(y)) return err('#VALUE!', 'YEARFRAC takes two dates.');
    return Math.abs(dayOf(y) - dayOf(x)) / 365;
  },
  LEN(a, c) { return textFn(a, c, 'LEN', 1, 1, t => t.length); },
  LEFT(a, c) { return textFn(a, c, 'LEFT', 1, 2, (t, n = 1) => t.slice(0, n)); },
  RIGHT(a, c) { return textFn(a, c, 'RIGHT', 1, 2, (t, n = 1) => n ? t.slice(-n) : ''); },
  UPPER(a, c) { return textFn(a, c, 'UPPER', 1, 1, t => t.toUpperCase()); },
  LOWER(a, c) { return textFn(a, c, 'LOWER', 1, 1, t => t.toLowerCase()); },
  TRIM(a, c) { return textFn(a, c, 'TRIM', 1, 1, t => clean(t)); },
};
const isFunction = name => Object.hasOwn(FUNCTIONS, name.toUpperCase());

function eachItem(a, c, use) {
  const list = toList(ev(a[0].x, c));
  if (isErr(list)) return list;
  const out = [];
  for (const item of list) {
    const stop = use(item, ev(a[1].x, withAt(c, item)), out);
    if (stop !== undefined) return stop;
  }
  return out;
}

function datePart(a, c, name, i) {
  const bad = arity(name, a, 1);
  if (bad) return bad;
  const d = scalar(c.S, ev(a[0].x, c));
  if (isErr(d) || d === null) return d;
  return isDate(d) ? Number(d.iso.split('-')[i]) : err('#VALUE!', `${name} takes a date.`);
}

// A date moved by whole months: to the same day, or the month's last day if it has fewer (EDATE), or to
// the last day of the month it lands in (EOMONTH).
function monthsOn(a, c, name, toEnd) {
  const bad = arity(name, a, 2);
  if (bad) return bad;
  const d = scalar(c.S, ev(a[0].x, c));
  if (isErr(d) || d === null) return d;
  if (!isDate(d)) return err('#VALUE!', `${name} takes a date first.`);
  const n = toNumber(c.S, ev(a[1].x, c));
  if (isErr(n)) return n;
  const [y, m, day] = d.iso.split('-').map(Number);
  const last = new Date(Date.UTC(y, m - 1 + Math.trunc(n) + 1, 0)).getUTCDate();
  return { t: 'date', iso: isoOf(new Date(Date.UTC(y, m - 1 + Math.trunc(n), toEnd ? last : Math.min(day, last)))) };
}

function textFn(a, c, name, min, max, fn) {
  const bad = arity(name, a, min, max);
  if (bad) return bad;
  const t = toText(c.S, ev(a[0].x, c));
  if (isErr(t)) return t;
  const n = a[1] ? toNumber(c.S, ev(a[1].x, c)) : undefined;
  return isErr(n) ? n : fn(t, n);
}

function call(node, c) {
  if (node.fn === undefined) node.fn = isFunction(node.name) ? FUNCTIONS[node.name.toUpperCase()] : null;
  if (node.fn) return node.fn(node.args, c);
  const rel = c.S.P.reg.byName.get(normal(node.name));
  if (rel) return callRelation(c, rel, node.args);
  return err('#NAME?', `There’s no function or relation called ${node.name}.`);
}

// A relation by its name: the record between the given arguments, or a record with no id where none is
// recorded. An object given for a parameter that sits below its objects fills it through its record there.
function callRelation(c, rel, a) {
  const S = c.S;
  const given = givenArgs(rel, a);
  if (isErr(given)) return given;
  const ids = new Map();
  for (const [edge, x] of given) {
    const v = asRec(S, ev(x, c));
    if (isErr(v)) return v;
    if (!v?.id) return recOf(null);
    ids.set(edge, v.id);
  }
  const pairs = [...ids].map(([edge, g]) => `${edge}=${objectOf(S, g)}`).sort().join('&');
  depend(S, 'calls', rel.n, `${rel.n}|${pairs}`);
  for (const rid of S.relsByCall.get(`${rel.sig}|${pairs}`) ?? []) {
    const r = S.recs[rid];
    // Records with the relation's edges but of another form are another relation.
    if (rel.form && formOfRecord(S, r) !== rel.form) continue;
    if (fitsCall(S, r, ids) && inSight(S, rid)) return recOf(rid);
  }
  // A row that gave an error there passes it on.
  for (const failure of S.failed.get(`rel|${objectOf(S, ids.values().next().value)}|${rel.n}`) ?? [])
    if (fitsCall(S, failure, ids)) return failure.error;
  return recOf(null);
}

// A relation call's arguments by normalized edge label, in the order they're worked out: as labeled, or
// else in the relation's own order. Worked out once for each call written in a formula.
const givens = new WeakMap();
function givenArgs(rel, a) {
  const kept = givens.get(a);
  if (kept?.rel === rel) return kept.given;
  const given = argsGiven(rel, a);
  givens.set(a, { rel, given });
  return given;
}
function argsGiven(rel, a) {
  if (a.length !== rel.edges.length) return err('#VALUE!', `${rel.name} takes ${rel.edges.length} arguments.`);
  const given = new Map();
  if (!a.some(x => x.label)) {
    rel.edges.forEach((e, i) => given.set(normal(e), a[i].x));
    return given;
  }
  for (const x of a) {
    const edge = rel.edges.find(e => same(e, x.label ?? ''));
    if (!edge) return err('#NAME?', `${rel.name} has no argument called ${x.label ?? '(unlabeled)'}.`);
    given.set(normal(edge), x.x);
  }
  return given.size === rel.edges.length ? given : err('#VALUE!', `Give each of ${rel.name}’s arguments once.`);
}

// Whether a record (or a row's failure, with its args) is the one a call with these arguments finds: an object
// given fills a parameter through its record there, and any other record fills it as is. An argument given as
// undefined is left open.
const fitsCall = (S, r, ids) => r.args.every(x => {
  const g = ids.get(normal(x.edge));
  return g === undefined || (isObject(S.recs[g]) ? objectOf(S, x.at) === g : x.at === g);
});

// ---- Definitions, and the order they're worked out in ----

// Parses a definition's rows and what it covers. Problems are kept on it as `error`, { message, row, pos }.
function prepareDef(def, names) {
  const d = { ...def, error: null, covers: [], params: [], edges: [def.name], rows: [], labels: new Set() };
  let at = null;
  try {
    d.covers = coversOf(def);
    d.params = d.covers.map(paramsOf);
    d.isRelation = def.args ? true : d.params.some(ps => ps.length > 1);
    // A relation's edges as written, in its own order: from its name, or else from what it covers.
    const named = (names?.relations ?? []).find(r => same(r.name, def.name));
    if (d.isRelation) d.edges = def.args?.map(a => a.edge) ?? named?.edges ?? d.params[0]?.map(p => p.edge) ?? [];
    const written = (def.rows ?? []).map(row => ({ row, f: splitFormula(row.formula) }));
    d.type = def.type ?? (written.length && written.every(x => x.f.kind === 'implies') ? 'tag' : 'field');
    d.rows = written.map(({ row, f }, i) => {
      at = { row: i, pos: 0 };
      if (!f.kind) throw new FormulaError('A row’s formula starts with = or ←.', 0);
      if (f.kind === 'implies' && d.type !== 'tag') throw new FormulaError('Only a tag can be implied; start this row with =.', 0);
      return { i, label: clean(row.label), n: normal(clean(row.label)), implies: f.kind === 'implies', ast: parseCached(f.body, f.offset), text: String(row.formula) };
    });
    at = null;
    if (!d.rows.length) throw new FormulaError('A definition has at least one row.', 0);
    d.allImplied = d.type === 'tag' && d.rows.every(r => r.implies);
    d.labels = new Set(d.rows.map(r => r.n).filter(Boolean));
  } catch (e) {
    d.error = { message: e instanceof FormulaError ? e.message : String(e), row: at?.row ?? null, pos: e.pos ?? 0 };
  }
  return d;
}

const writtenEdge = (d, edge) => d.edges.find(e => normal(e) === edge) ?? edge;
const edgeIndex = (d, edge) => d.edges.findIndex(e => normal(e) === edge);

// The names a formula mentions: every name after a dot, every relation it calls, and every name on its own
// that isn't one of its own arguments. Names inside WITHOUT are kept apart too.
function namesIn(ast, own) {
  const refs = new Set(), inWithout = new Set();
  const walk = (n, w) => {
    if (!n) return;
    const add = name => { refs.add(normal(name)); if (w) inWithout.add(normal(name)); };
    if (n.k === 'name') { if (!own.has(n.n)) add(n.name); return; }
    if (n.k === 'dot') { walk(n.x, w); add(n.name); return; }
    if (n.k === 'call') {
      const f = isFunction(n.name) && n.name.toUpperCase();
      if (!f) add(n.name);
      n.args.forEach((x, i) => walk(x.x, w || (f === 'WITHOUT' && i === 1)));
      return;
    }
    walk(n.x, w); walk(n.a, w); walk(n.b, w);
    n.items?.forEach(x => walk(x, w));
  };
  walk(ast, false);
  return { refs, inWithout };
}

// What a definition provides names for: its own name, and for a relation, its lists of relatives, which also
// answer to the edge labels they list.
function namesProvided(d, reg) {
  const out = new Set([normal(d.name)]);
  if (d.isRelation) {
    const rel = reg.byName.get(normal(d.name));
    d.edges.forEach((own, i) => d.edges.forEach((other, j) => { if (i !== j) out.add(normal(listNameOf(rel, own, other))).add(normal(other)); }));
  }
  return out;
}

function registry(names, defs) {
  const rels = (names?.relations ?? []).map(r => ({ ...r }));
  for (const d of defs) if (d.isRelation && !rels.some(r => same(r.name, d.name)))
    rels.push({ name: d.name, type: d.type, edges: d.edges, form: d.form, lists: {} });
  const reg = { byName: new Map(), byForm: new Map(), bySig: new Map() };
  for (const r of rels) {
    const lists = new Map();
    for (const [from, listed] of Object.entries(r.lists ?? {}))
      for (const [to, name] of Object.entries(listed)) lists.set(`${normal(from)}|${normal(to)}`, name);
    const rel = { name: r.name, n: normal(r.name), type: r.type, edges: r.edges, form: r.form, lists, sig: signature(r.type, r.edges) };
    reg.byName.set(normal(r.name), rel);
    if (r.form) reg.byForm.set(r.form, rel);
    else reg.bySig.set(signature(r.type, r.edges), rel);
  }
  return reg;
}

// Every name the schema has somewhere, so a name missing at one record can be nothing there. Rows' labels
// count, since a tag's rows can be cited by label.
function knownNames(entered, defs, reg) {
  const lists = new Set(), values = new Set();
  const addRelation = (type, edges, rel = reg.bySig.get(signature(type, edges))) => {
    edges.forEach((own, i) => edges.forEach((other, j) => { if (i !== j) { lists.add(normal(listNameOf(rel, own, other))); lists.add(normal(other)); } }));
    edges.forEach(e => values.add(normal(e)));
    if (rel) values.add(normal(rel.name));
  };
  for (const r of Object.values(entered)) {
    if (r.args) addRelation(typeOf(r), r.args.map(a => a.edge));
    else if (r.edge) values.add(normal(r.edge));
  }
  for (const d of defs) {
    if (d.isRelation) addRelation(d.type, d.edges);
    else values.add(normal(d.name));
    for (const ps of d.params) for (const p of ps) edgesInSpec(p.spec).forEach(e => values.add(e));
    d.labels.forEach(l => values.add(l));
  }
  for (const rel of reg.byName.values()) addRelation(rel.type, rel.edges, rel);
  return { lists, values };
}

// Groups definitions that read each other, what they read first (Tarjan's algorithm), whatever order they're
// listed in. A definition depends on those providing the names its rows use, and on those covering the
// specifications its locations run through, whose records it's located at. A group loops if it reads itself;
// then its loops are checked to be monotone (see loopReads).
function plan(defs, reg) {
  const provides = new Map(), covering = new Map();
  for (const d of defs) for (const n of namesProvided(d, reg)) push(provides, n, d);
  for (const d of defs) for (const p of d.covers) push(covering, p, d);
  const deps = new Map();
  for (const d of defs) {
    const own = new Set(d.isRelation ? d.edges.map(normal) : []);
    const refs = new Set(), inWithout = new Set();
    for (const row of d.error ? [] : d.rows) {
      const found = namesIn(row.ast, own);
      found.refs.forEach(n => refs.add(n));
      found.inWithout.forEach(n => inWithout.add(n));
    }
    const located = new Set();
    for (const ps of d.params) for (const p of ps) paramsInSpec(p.spec, located);
    d.dependsOn = new Set([...[...refs].flatMap(n => provides.get(n) ?? []), ...[...located].flatMap(p => covering.get(p) ?? [])]);
    d.withoutReads = new Set([...inWithout].flatMap(n => provides.get(n) ?? []));
    deps.set(d, d.dependsOn);
  }
  const order = [], index = new Map(), low = new Map(), stack = [], onStack = new Set();
  let counter = 0;
  const visit = d => {
    index.set(d, counter); low.set(d, counter); counter++;
    stack.push(d); onStack.add(d);
    for (const e of deps.get(d)) {
      if (!index.has(e)) { visit(e); low.set(d, Math.min(low.get(d), low.get(e))); }
      else if (onStack.has(e)) low.set(d, Math.min(low.get(d), index.get(e)));
    }
    if (low.get(d) === index.get(d)) {
      const group = [];
      let e;
      do { e = stack.pop(); onStack.delete(e); group.push(e); } while (e !== d);
      order.push(group);
    }
  };
  for (const d of defs) if (!index.has(d)) visit(d);
  const groups = order.map((defs, i) => {
    defs.forEach(d => { d.step = i; });
    const loops = defs.length > 1 || defs[0].dependsOn.has(defs[0]);
    const g = { defs, loops, monotone: true, reads: [] };
    if (loops) {
      g.reads = loopReads(defs, reg);
      g.monotone = g.reads.every(x => x.monotone);
    }
    return g;
  });
  // WITHOUT can't read what's being worked out alongside it: that's always a loop.
  for (const g of groups) for (const d of g.defs)
    if (!d.error && g.defs.some(e => d.withoutReads.has(e)))
      d.error = { message: 'WITHOUT reads something that depends on this, which is a loop (#CIRCULAR!).', row: null, pos: 0 };
  return groups;
}

// ---- Loops ----
// A group that reads itself is worked out round by round from nothing, and settles at its least solution if
// nothing on its loop can go down when what it reads goes up: a tag goes up when attested, a number when it
// grows. That's checked here on the syntax: every place a row reads the group's own names must be monotone.
// The reads are kept, so the formula bar can underline them.

// For each function, which of its arguments a loop may run through. LET is handled on its own.
const MONOTONE_ARGS = {
  AND: true, OR: true, COUNT: true, SUM: true, MIN: true, MAX: true, FILTER: true, ANY: true, EACH: true, UNIQUE: true,
  IF: [false, true, true], ALL: [false, true],
};

// Every place a group's rows read the group: [{ def, row, from, to, monotone }].
function loopReads(group, reg) {
  const names = new Set(group.flatMap(d => [...namesProvided(d, reg)]));
  const labels = new Set(group.flatMap(d => [...d.labels]));
  const out = [];
  for (const d of group) {
    if (d.error) continue;
    const own = new Set(d.isRelation ? d.edges.map(normal) : []);
    d.rows.forEach((row, ri) => {
      const found = [];
      const read = (n, from, to, ok) => found.push({ def: d.id, row: ri, from, to, monotone: ok });
      // `ok` is whether the place is monotone; `lets` maps a LET name to whether its value reads the loop.
      const walk = (n, ok, lets) => {
        switch (n.k) {
          case 'name':
            if (lets.has(n.n)) { if (lets.get(n.n)) read(n, n.from, n.to, ok); }
            else if (!own.has(n.n) && names.has(n.n)) read(n, n.from, n.to, ok);
            return;
          case 'dot':
            walk(n.x, ok, lets);
            if (names.has(n.n) || labels.has(n.n)) read(n, n.at, n.to, ok);
            return;
          case 'call': {
            const f = isFunction(n.name) && n.name.toUpperCase();
            if (!f) {
              if (names.has(normal(n.name))) read(n, n.from, n.nameTo, ok);
              n.args.forEach(x => walk(x.x, ok, lets));
            } else if (f === 'LET') {
              const inner = new Map(lets);
              for (let i = 0; i + 1 < n.args.length; i += 2) {
                const before = found.length;
                walk(n.args[i + 1].x, ok, inner);
                if (n.args[i].x.k === 'name') inner.set(n.args[i].x.n, found.length > before);
              }
              if (n.args.length) walk(n.args.at(-1).x, ok, inner);
            } else {
              const m = MONOTONE_ARGS[f];
              n.args.forEach((x, i) => walk(x.x, ok && (m === true || !!(m && m[i])), lets));
            }
            return;
          }
          case 'and': case 'or': walk(n.a, ok, lets); walk(n.b, ok, lets); return;
          case 'cmp': walk(n.a, ok && (n.op === '>' || n.op === '>='), lets); walk(n.b, false, lets); return;
          case 'in': walk(n.a, false, lets); walk(n.b, ok, lets); return;
          case 'bin': { const up = ok && (n.op === '+' || n.op === '*'); walk(n.a, up, lets); walk(n.b, up, lets); return; }
          case 'not': case 'neg': walk(n.x, false, lets); return;
          case 'arr': n.items.forEach(x => walk(x, ok, lets)); return;
        }
      };
      walk(row.ast, true, new Map());
      if (found.length) {
        // The output is the first row that gives something, so a row on the loop must not be able to take over
        // from a later one with another value: past it, every row only attests. And a row that can give FALSE
        // can go down.
        const whole = { def: d.id, row: ri, from: row.ast.from, to: row.ast.to, monotone: false };
        if (d.type === 'tag' && !row.implies && !onlyTrue(row.ast)) out.push({ ...whole, why: 'can give FALSE' });
        else if (d.rows.slice(ri + 1).some(later => !(row.implies && later.implies))) out.push({ ...whole, why: 'comes before another row' });
      }
      out.push(...found);
    });
  }
  return out;
}
const onlyTrue = n => (n.k === 'lit' && n.v === true) || (n.k === 'call' && n.name.toUpperCase() === 'IF' && n.args.length === 2 && n.args[1].x.k === 'lit' && n.args[1].x.v === true);

// ---- Candidates ----

// A record's underlying specification, as model.js's specKey() gives it; null while something it's located
// at isn't there.
const rootLabel = r => isTag(r) ? `tag:${r.tag}` : isChoice(r) ? `choice:${normal(r.choice)}` : `field:${r.field}`;
function specOf(S, id) {
  if (S.specs.has(id)) return S.specs.get(id);
  const r = S.recs[id];
  if (!r) return null;
  let key = `kind:${normal(r.kind)}`;
  if (!isObject(r)) {
    const parts = [];
    for (const a of argsOf(r)) {
      const s = specOf(S, a.at);
      if (s === null) return null;
      parts.push(kept(specParts, `${normal(a.edge)}\n${s}`, () => JSON.stringify([normal(a.edge), s])));
    }
    parts.sort();
    key = kept(specKeys, `${rootLabel(r)}\n${parts.join('\n')}`, () => JSON.stringify([rootLabel(r), ...parts]));
  }
  S.specs.set(id, key);
  push(S.bySpec, key, id);
  return key;
}
// Keys spelled out once: a computed relation's records mostly share their specification.
const specParts = new Map(), specKeys = new Map();
function kept(map, k, make) {
  let v = map.get(k);
  if (v === undefined) {
    if (map.size > 50000) map.clear();
    map.set(k, v = make());
  }
  return v;
}

// The definition covering a record: its own, for a computed one; for an entered one, the one covering its
// parameterization.
function defOf(S, id) {
  const r = S.recs[id];
  if (!r || isObject(r)) return null;
  if (r.computed) return S.P.byId.get(r.computed);
  if (!S.params.has(id)) {
    const spec = specOf(S, id);
    S.params.set(id, spec && !spec.startsWith('kind:') ? S.P.coverOf.get(JSON.stringify(JSON.parse(spec).slice(1))) ?? null : null);
  }
  return S.params.get(id);
}

// A computed record's id comes from its argumentation, so it stays the same from one working-out to the next.
const computedId = args => `fx:${args.map(a => `${normal(a.edge)}=${a.at}`).sort().join('&')}`;

function contextFor(S, d, cand) {
  if (d.isRelation) return { S, def: d, self: { args: new Map(cand.args.map(a => [normal(a.edge), objectOf(S, a.at)])) }, at: null, lets: null };
  return { S, def: d, self: { loc: cand.at }, at: recOf(cand.at), lets: null };
}

// A candidate from its arguments, with the edges as the definition writes them.
function candidateFrom(d, args) {
  const named = args.map(a => ({ edge: writtenEdge(d, normal(a.edge)), at: a.at }));
  return { key: argKey(named), args: named, at: d.isRelation ? undefined : named[0].at, id: computedId(named) };
}

// The candidate at a record of a definition's (an entry's location, or a relation's record), or, for a
// relation, at objects by edge, filling each parameter through the object's record of its location.
function candidateAt(S, d, at) {
  if (typeof at === 'string') {
    const r = S.recs[at];
    if (r && !isObject(r) && defOf(S, at) === d) return candidateFrom(d, argsOf(r));
    if (!d.isRelation && S.recs[at]) return candidateFrom(d, [{ edge: d.name, at }]);
    return null;
  }
  if (!at || !d.isRelation) return null;
  const given = new Map(Object.entries(at).map(([edge, id]) => [normal(edge), id]));
  for (const params of d.params) {
    const args = [];
    for (const p of params) {
      const g = given.get(p.edge);
      const hit = g && (S.bySpec.get(p.spec) ?? []).find(id => id === g || objectOf(S, id) === g);
      if (!hit) break;
      args.push({ edge: p.edge, at: hit });
    }
    if (args.length === params.length) return candidateFrom(d, args);
  }
  return null;
}

function makeRecord(d, cand, out) {
  const base = d.isRelation ? { args: cand.args } : { at: cand.at, edge: d.name };
  if (d.type === 'tag') return { ...base, tag: out, computed: d.id };
  if (d.type === 'choice') return { ...base, choice: out, computed: d.id };
  return { ...base, field: d.datatype ?? 'number', value: isDate(out) ? out.iso : out, computed: d.id };
}

// The texts a formula can give as its value: written in a place its value comes from, which is the formula
// itself, a branch of IF, or the end of LET. Text it only compares, like "Corporation" in `@ = "Corporation"`,
// isn't among them.
function givenTexts(ast) {
  const out = [];
  const walk = n => {
    if (!n) return;
    if (n.k === 'lit' && typeof n.v === 'string') return out.push(n.v);
    if (n.k !== 'call') return;
    const f = n.name.toUpperCase(), a = n.args.map(x => x.x);
    if (f === 'IF') a.slice(1).forEach(walk);
    else if (f === 'LET') walk(a.at(-1));
  };
  walk(ast);
  return out;
}
function optionsWritten(text) {
  const f = splitFormula(text);
  if (f.kind === 'implies') return [];
  try { return givenTexts(parseExpression(f.body, f.offset)); } catch { return []; }
}

// The options a choice's rows may give: those the core knows (`options`; otherwise those its entries have
// already), and any its rows give as written.
function optionsOf(S, d) {
  if (!d.knownOptions) {
    const opts = [];
    const add = o => { if (!opts.some(x => same(x, o))) opts.push(o); };
    if (d.options) d.options.forEach(add);
    else for (const r of Object.values(S.entered)) if (isChoice(r) && !r.args && same(r.edge, d.name)) add(r.choice);
    d.rows.forEach(row => givenTexts(row.ast).forEach(add));
    d.knownOptions = opts;
  }
  return d.knownOptions;
}

// What a row gives, as an output for its definition: { out }, { none } for nothing, or { error }.
const NONE = { none: true }, TRUE_OUT = { out: true };
function asOutput(S, d, v) {
  v = scalar(S, v);
  if (isErr(v)) return { error: v };
  if (v === null) return NONE;
  const wrong = what => ({ error: err('#VALUE!', `${describe(S, v)} isn’t ${what}.`) });
  if (d.type === 'tag') return typeof v === 'boolean' ? { out: v } : wrong('TRUE or FALSE');
  if (d.type === 'choice') {
    if (typeof v !== 'string') return wrong('an option');
    const option = optionsOf(S, d).find(o => same(o, v));
    return option ? { out: option } : { error: err('#OPTION?', `“${v}” isn’t one of ${d.name}’s options.`) };
  }
  if (d.datatype === 'date') return isDate(v) ? { out: v } : wrong('a date');
  if (d.datatype === 'text' || d.datatype === 'document') { const t = toText(S, v); return isErr(t) ? { error: t } : { out: t }; }
  return typeof v === 'number' ? { out: v } : wrong('a number');
}

// ---- Where a row can give something ----
// A relation's candidates are every way of filling its parameters, and for a relation between two kinds of
// object most of them come to nothing. So where a row's form says where it can come to something, a group
// finds its candidates there, the way a database joins tables, instead of trying every pair.
//
// For one argument, the free one, given the others: a support is the set of objects outside of which the row
// is sure to give nothing, as { bits, exact }, the objects being bits by their numbers in the state (see
// numberOf). Where it's exact, a ← row is sure to hold just there, so there's nothing to work out. A support
// is worked out with the same lookups the row would make, so it's worked out again when what they found
// changes. Where the form doesn't tell, there's no support (null), and every candidate is tried. holdsWhere
// and givesWhere compile a formula to a function from the given arguments (in a context, as ev takes) to a
// support, or to null.

const AT = { at: true };   // `@` as the free variable: the item a condition is asked of
const isVar = (n, v) => v === AT ? n.k === 'at' : n.k === 'name' && n.n === v.name;
const isCall = (n, f) => n.k === 'call' && n.name.toUpperCase() === f;
const ITEM_FUNCTIONS = new Set(['FILTER', 'ANY', 'ALL', 'EACH']);
const partsOf = n => [n.x, n.a, n.b, ...(n.items ?? []), ...(n.args ?? []).map(x => x.x)].filter(x => x && typeof x === 'object');

// Whether an expression uses the free variable: an argument by its name, or `@` outside the conditions of
// FILTER and the like, where it means their items.
function uses(n, v) {
  if (isVar(n, v)) return true;
  if (v === AT && n.k === 'call' && ITEM_FUNCTIONS.has(n.name.toUpperCase())) return !!n.args[0] && uses(n.args[0].x, v);
  return partsOf(n).some(x => uses(x, v));
}

// Whether an expression comes out the same all through a round: it reads no OBJECT, which reads Names that no
// formula names.
const steady = (K, n) => !isCall(n, 'OBJECT') && partsOf(n).every(x => steady(K, x));

// Whether LET gives a name another meaning somewhere in an expression.
const binds = (n, name) => isCall(n, 'LET') && n.args.some((x, i) => i % 2 === 0 && i < n.args.length - 1 && x.x.k === 'name' && x.x.n === name)
  || partsOf(n).some(x => binds(x, name));

// Sets of objects as bits. Each object (or other record) a support names gets a number in the state.
function numberOf(S, id) {
  let k = S.numbers.get(id);
  if (k === undefined) { S.numbers.set(id, k = S.numbered.length); S.numbered.push(id); }
  return k;
}
function bitsOf(S, ids) {
  const ks = [];
  for (const id of ids) ks.push(numberOf(S, id));
  const bits = new Uint32Array((S.numbered.length >> 5) + 1);
  for (const k of ks) bits[k >> 5] |= 1 << (k & 31);
  return bits;
}
const hasBit = (bits, k) => (k >> 5) < bits.length && ((bits[k >> 5] >>> (k & 31)) & 1) === 1;
// Adds b's bits to a, making a longer where b is: returns a, or its longer copy.
function addBits(a, b) {
  if (b.length > a.length) { const longer = new Uint32Array(b.length); longer.set(a); a = longer; }
  for (let i = 0; i < b.length; i++) a[i] |= b[i];
  return a;
}
function* idsIn(S, bits) {
  for (let w = 0; w < bits.length; w++) for (let x = bits[w]; x; x &= x - 1) yield S.numbered[(w << 5) + 31 - Math.clz32(x & -x)];
}

const NOWHERE = { bits: new Uint32Array(0), exact: true };
const union = (a, b) => a && b && { bits: !a.bits.length ? b.bits : !b.bits.length ? a.bits : addBits(Uint32Array.from(a.bits), b.bits), exact: a.exact && b.exact };
const loose = s => s && { bits: s.bits, exact: false };
function meet(a, b) {
  const bits = new Uint32Array(Math.min(a.bits.length, b.bits.length));
  for (let i = 0; i < bits.length; i++) bits[i] = a.bits[i] & b.bits[i];
  return { bits, exact: false };
}

// Where a condition can be TRUE.
function holdsWhere(K, n, v) {
  // One that doesn't use the free variable is worked out once: where it's FALSE, it's FALSE everywhere.
  if (!uses(n, v)) return steady(K, n) && (c => truth(c.S, ev(n, c)) === false ? NOWHERE : null);
  switch (n.k) {
    case 'or': {
      const a = holdsWhere(K, n.a, v), b = holdsWhere(K, n.b, v);
      return a && b && (c => { const s = a(c); return s && union(s, b(c)); });
    }
    // AND stops at a FALSE, so it can hold only where its first side can; or, where that's worked out once,
    // only where its second side can.
    case 'and': {
      if (uses(n.a, v)) { const a = holdsWhere(K, n.a, v); return a && (c => loose(a(c))); }
      if (!steady(K, n.a)) return null;
      const b = holdsWhere(K, n.b, v);
      return c => { const t = truth(c.S, ev(n.a, c)); return t === false ? NOWHERE : t === true && b ? b(c) : null; };
    }
    case 'in': return isVar(n.a, v) && !uses(n.b, v) && steady(K, n.b) ? c => among(c.S, ev(n.b, c)) : null;
    case 'cmp': return comparedWhere(K, n, v);
    // A dot on a relation call is nothing where the call finds nothing; citing one of its rows by label, as
    // [Affiliated Person](Person, Affiliate).[(A)] does, holds just where that row holds.
    case 'dot': {
      if (n.x.k !== 'call') return null;
      const cited = K.P.defs.some(d => d.isRelation && !d.error && same(d.name, n.x.name) && d.labels.has(n.n));
      return relatedWhere(K, n.x, v, cited, cited ? n.n : null);
    }
    case 'call': {
      const a = n.args;
      if (isCall(n, 'ANY') && a.length === 2 && !uses(a[0].x, v) && steady(K, a[0].x)) {
        const h = holdsWhere(K, a[1].x, v);
        return h && (c => acrossItems(c, a[0].x, h));
      }
      return relatedWhere(K, n, v, true);
    }
  }
  return null;
}

// Where an expression can give something: outside, it's sure to give nothing, and no error. Nothing drops out
// of a sum, so a sum gives something where either side does; it wipes out a product, so a product gives
// something only where both sides do.
function givesWhere(K, n, v) {
  if (!uses(n, v)) return steady(K, n) && (c => { const x = ev(n, c); return !isErr(x) && isNothing(x) ? NOWHERE : null; });
  switch (n.k) {
    case 'dot': { const x = givesWhere(K, n.x, v); return x && (c => loose(x(c))); }
    case 'bin': {
      const a = givesWhere(K, n.a, v), b = givesWhere(K, n.b, v);
      if (n.op === '+' || n.op === '-') return a && b && (c => { const s = a(c); return s && loose(union(s, b(c))); });
      if (n.op === '*' || n.op === '/') return (a || b) && (c => {
        const s = a ? a(c) : null, t = b ? b(c) : null;
        return s && t ? meet(s, t) : loose(s ?? t);
      });
      return null;
    }
    case 'call': {
      const f = isFunction(n.name) && n.name.toUpperCase(), a = n.args.map(x => x.x);
      if (!f) return relatedWhere(K, n, v, false);
      if (f === 'IF' && a.length >= 2) {
        const [cond, yes, no] = a;
        if (!uses(cond, v)) {
          if (!steady(K, cond)) return null;
          const y = givesWhere(K, yes, v), z = no && givesWhere(K, no, v);
          return c => {
            const t = truth(c.S, ev(cond, c));
            if (isErr(t)) return null;
            return t ? (y ? y(c) : null) : no ? (z ? z(c) : null) : NOWHERE;
          };
        }
        if (!no) { const h = holdsWhere(K, cond, v); return h && (c => loose(h(c))); }
        const y = givesWhere(K, yes, v), z = givesWhere(K, no, v);
        return y && z && (c => { const s = y(c); return s && loose(union(s, z(c))); });
      }
      if (f === 'SUM' || f === 'MIN' || f === 'MAX') {
        const each = a.map(x => itemsGiveWhere(K, x, v));
        return each.every(Boolean) && (c => {
          let out = NOWHERE;
          for (const g of each) if (!(out = union(out, g(c)))) return null;
          return loose(out);
        });
      }
    }
  }
  return null;
}

// Where an argument of SUM and the like has an item that's something: EACH over a list worked out once, with
// the free variable in its expression; a FILTER; or the argument itself.
function itemsGiveWhere(K, n, v) {
  if (isCall(n, 'EACH') && n.args.length === 2 && !uses(n.args[0].x, v) && steady(K, n.args[0].x)) {
    const g = givesWhere(K, n.args[1].x, v);
    return g && (c => loose(acrossItems(c, n.args[0].x, g)));
  }
  return filledWhere(K, n, v) || givesWhere(K, n, v);
}

// `x IN list`, with x the free variable: TRUE just for the objects on the list, unless an item errs. A list
// that's kept (see remembered) has its bits worked out once.
function among(S, v) {
  const list = toList(v);
  if (isErr(list)) return null;
  let bits = S.listBits.get(list);
  if (!bits) {
    const ids = [];
    for (const x of list) {
      const s = scalar(S, x);
      if (isErr(s)) return null;
      if (isRec(s) && s.id) ids.push(s.id);
    }
    S.listBits.set(list, bits = bitsOf(S, ids));
  }
  return { bits, exact: true };
}

// The union of a condition's supports with `@` as each item of a list worked out once: where ANY can hold, or
// FILTER can keep something.
function acrossItems(c, list, h) {
  const items = toList(ev(list, c));
  if (isErr(items)) return null;
  let bits = new Uint32Array(0), exact = true;
  for (const item of items) {
    const s = h(withAt(c, item));
    if (!s) return null;
    exact &&= s.exact;
    bits = addBits(bits, s.bits);
  }
  return { bits, exact };
}

// `x = e`, with x the free variable: TRUE just for e's object. And a sum or count compared with a number it
// doesn't reach while what it counts is empty, as SUM(…) > 25% doesn't: it can hold only where that isn't.
function comparedWhere(K, n, v) {
  const e = n.op === '=' ? isVar(n.a, v) ? n.b : isVar(n.b, v) ? n.a : null : null;
  if (e) return !uses(e, v) && steady(K, e) ? c => {
    const s = scalar(c.S, ev(e, c));
    return isErr(s) ? null : { bits: bitsOf(c.S, isRec(s) && s.id ? [s.id] : []), exact: true };
  } : null;
  const tally = x => isCall(x, 'SUM') || isCall(x, 'COUNT');
  const [counted, lit, litFirst] = tally(n.a) && n.b.k === 'lit' ? [n.a, n.b, false] : tally(n.b) && n.a.k === 'lit' ? [n.b, n.a, true] : [];
  if (!counted || typeof lit.v !== 'number' || compare(null, n.op, litFirst ? lit.v : 0, litFirst ? 0 : lit.v) !== false) return null;
  const each = counted.args.map(x => filledWhere(K, x.x, v));
  return each.every(Boolean) && (c => {
    let out = NOWHERE;
    for (const f of each) if (!(out = union(out, f(c)))) return null;
    return loose(out);
  });
}

// Where a list can have something in it: outside, it's sure to be empty, or nothing, and no error.
function filledWhere(K, n, v) {
  if (!uses(n, v)) return steady(K, n) && (c => { const l = toList(ev(n, c)); return isErr(l) || l.length ? null : NOWHERE; });
  // A dot over FILTER's list maps it, so it's empty where that is.
  if (n.k === 'dot' && isCall(n.x, 'FILTER')) return filledWhere(K, n.x, v);
  if (!isCall(n, 'FILTER') || n.args.length !== 2) return null;
  const [list, cond] = n.args.map(x => x.x);
  if (!uses(list, v)) {
    const h = steady(K, list) && holdsWhere(K, cond, v);
    return h && (c => loose(acrossItems(c, list, h)));
  }
  // FILTER(y.List, cond), y being the free variable: an object is on y's list just where y is on that
  // object's list seen from the other side, so FILTER can keep something only for the objects on the lists
  // of those its condition can hold for.
  if (v === AT || list.k !== 'dot' || !isVar(list.x, v) || uses(cond, v)) return null;
  const h = holdsWhere(K, cond, AT);
  return h && (c => {
    if (!listedOnly(c.S, list.n)) return null;
    const s = h(c);
    if (!s) return null;
    const ids = [];
    for (const o of idsIn(c.S, s.bits)) ids.push(...listing(c.S, o, list.n));
    return { bits: bitsOf(c.S, ids), exact: false };
  });
}

// Whether an object's `n` is sure to be its list of relatives of that name: no entry, worked out or not, is
// called that at an object, and the name is a list's somewhere, so where there are none it's empty.
function listedOnly(S, n) {
  if (!S.listedOnly.has(n)) S.listedOnly.set(n, S.P.known.lists.has(n) && !S.dep?.entry.has(n)
    && ![...S.byAtName.keys(), ...S.failed.keys()].some(k => k.endsWith(`|${n}`) && isObjectAt(S, k.slice(0, -n.length - 1))));
  return S.listedOnly.get(n);
}

// The objects whose list of relatives called `n` has o on it, kept as a lookup is.
const listing = (S, o, n) => remembered(S, `listing|${o}|${n}`, () => {
  depend(S, 'inverse', n, `${o}|${n}`);
  const out = [];
  for (const rid of relationsFor(S, o, n)) {
    const r = S.recs[rid];
    if (isTag(r) && r.tag !== true) continue;
    for (const { own, other, list, alias } of listsOf(S, r))
      if ((list === n || alias === n) && objectOf(S, other.at) === o) { const y = objectOf(S, own.at); if (y) out.push(y); }
  }
  return out;
});

// A relation call with the free variable as one argument finds a record only among those the other arguments
// are in, so it can give something only for their objects at its edge. As a condition, a tag relation's call
// holds just where its record is attested; citing one of its rows by label, just where that row holds too.
function relatedWhere(K, n, v, asCondition, label = null) {
  const rel = !isFunction(n.name) && K.P.reg.byName.get(normal(n.name));
  const given = rel && givenArgs(rel, n.args);
  if (!given || isErr(given)) return null;
  const free = [...given].filter(([, x]) => uses(x, v)), others = [...given].filter(([, x]) => !uses(x, v));
  if (free.length !== 1 || !isVar(free[0][1], v) || !others.length || !others.every(([, x]) => steady(K, x))) return null;
  const freeEdge = free[0][0];
  return c => {
    const ids = new Map();
    for (const [edge, x] of others) {
      const r = asRec(c.S, ev(x, c));
      if (isErr(r)) return null;
      if (!r?.id) return NOWHERE;
      ids.set(edge, r.id);
    }
    // Kept as a lookup is: many supports share it.
    const key = `related|${rel.n}|${[...ids].map(([e, id]) => `${e}=${id}`).join('&')}|${freeEdge}|${asCondition}|${label}`;
    return remembered(c.S, key, () => relatedAt(c.S, rel, ids, freeEdge, asCondition, label));
  };
}

// The objects at one edge of a relation's records whose other arguments are as given, the first such record
// for each being the one a call finds; or, where a row gave an error there, the call's error.
function relatedAt(S, rel, ids, freeEdge, asCondition, label) {
  const [edge, g] = ids.entries().next().value;
  const obj = objectOf(S, g);
  depend(S, 'rel', rel.n, `${rel.n}|${edge}=${obj}`);
  const out = [], seen = new Set();
  // Every record here has the first argument given; the others are checked.
  const checked = ids.size > 1 || !isObject(S.recs[g]);
  let exact = asCondition;
  for (const rid of S.byEdge.get(`${rel.sig}|${edge}=${obj}`) ?? []) {
    const r = S.recs[rid];
    if ((rel.form && formOfRecord(S, r) !== rel.form) || (checked && !fitsCall(S, r, ids))) continue;
    const { objs, edges } = S.indexed.get(rid), y = objs[edges.indexOf(freeEdge)];
    if (!y || seen.has(y)) continue;
    seen.add(y);
    if (!asCondition) out.push(y);
    else if (!isTag(r) || (label && S.byAtName.has(`${rid}|${label}`))) { out.push(y); exact = false; }
    else if (r.tag === true && (!label || holdsLabel(S, r, label))) out.push(y);
  }
  for (const failure of S.failed.get(`rel|${obj}|${rel.n}`) ?? []) {
    const a = failure.args.find(x => normal(x.edge) === freeEdge), y = a && objectOf(S, a.at);
    if (y && !seen.has(y) && fitsCall(S, failure, ids)) { seen.add(y); out.push(y); exact = false; }
  }
  return { bits: bitsOf(S, out), exact };
}

// ---- Working out the state ----

function stateFor(P, entered) {
  const S = { P, entered, recs: {}, byAt: new Map(), byAtName: new Map(), relsAt: new Map(), byObject: new Map(), byEdge: new Map(),
    relsByCall: new Map(), indexed: new Map(), seq: 0, listNames: new Map(), specs: new Map(), bySpec: new Map(), enteredByKey: new Map(),
    enteredByEdges: null, params: new Map(), holds: new Map(), stage: new Map(), rows: new Map(), dep: null, watch: null, reads: null,
    forgetting: true, done: 0, cf: new Map(), memo: new Map(), steps: [], failed: new Map(), recLists: new WeakMap(), shapes: new WeakMap(),
    forms: new WeakMap(), listedOnly: new Map(), pairLists: new Map(), numbers: new Map(), numbered: [], listBits: new WeakMap(),
    cut: null, probe: null, count: null };
  // Every entered record is in before any is indexed, so each is indexed by the objects it belongs to
  // whatever order they come in.
  Object.assign(S.recs, entered);
  for (const [id, r] of Object.entries(entered)) indexRecord(S, id, r);
  for (const [id, r] of Object.entries(entered)) {
    specOf(S, id);
    if (!isObject(r)) S.enteredByKey.set(argKey(argsOf(r)), id);
  }
  return S;
}

// A computed record comes into the state, or goes, as its group works it out. The candidate it's worked out
// at comes with it, with its block and its records there (picks), which tell what it shares with the
// block's other records: its signature, edges and specification, and the order of its call's key.
function addComputed(S, id, r, b, picks) {
  let known;
  if (b?.sig && picks) {
    const objs = picks.map((k, j) => b.objects[j][k]);
    known = { objs, edges: b.normals, sig: b.sig, call: b.idOrder && `${b.sig}|${b.idOrder.map(j => `${b.normals[j]}=${objs[j]}`).join('&')}` };
  }
  addRecord(S, id, r, known);
  // Its specification is its block's for its output; it's kept only where a definition is located, since
  // that's where a group looks for candidates (see blocksOf), and worked out again if it's wanted elsewhere.
  const root = rootLabel(r);
  let spec = b?.specs.get(root);
  if (!spec) { spec = specOf(S, id); if (b && spec) b.specs.set(root, spec); }
  else if (S.P.located.has(spec)) { S.specs.set(id, spec); push(S.bySpec, spec, id); }
  againBelow(S, id);
}
function removeComputed(S, id) {
  removeRecord(S, id);
  againBelow(S, id);
}

// An entered record located at a computed one was indexed by the objects it belonged to, and given its
// specification, while that wasn't there. When it comes or goes, those located at it, and at them, are
// indexed and specified again.
function againBelow(S, id) {
  if (!S.byAt.has(id) && !S.relsAt.has(id)) return;
  for (const rid of [...(S.byAt.get(id) ?? []), ...(S.relsAt.get(id) ?? [])]) {
    const r = S.recs[rid];
    if (!r || r.computed) continue;
    if (r.args) {
      unindexByObjects(S, rid);
      indexByObjects(S, rid, r);
    }
    const spec = S.specs.get(rid);
    if (spec) {
      S.bySpec.set(spec, S.bySpec.get(spec).filter(x => x !== rid));
      S.specs.delete(rid);
    }
    S.params.delete(rid);
    specOf(S, rid);
    againBelow(S, rid);
  }
}

// Works out one group. What its lookups find is kept for the group (see remembered): records come and go only
// between rounds, and a looping group lets go, at the end of each round, of the lookups that read something
// the round changed.
function runStep(S, i) {
  const started = now();
  S.count = { evals: 0, rounds: 0, tried: 0 };
  S.memo.clear();
  S.listedOnly.clear();
  S.forgetting = false;
  runGroup(S, i);
  S.forgetting = true;
  S.memo.clear();
  S.steps.push({ defs: S.P.groups[i].defs.map(d => d.id), ms: now() - started, ...S.count });
}

function runUpTo(S, limit) {
  for (; S.done < limit; S.done++) runStep(S, S.done);
}

const now = () => typeof performance === 'object' ? performance.now() : Date.now();

// ---- What a formula read ----
// A row is worked out with what it reads noted (see reading). What it read is kept as a trace: the keys it
// depends on within a looping group (see depend), and the traces of what it was made of, so a lookup used many
// times is kept once. A trace that depends on keys is watched for them, directly or through what it was part
// of (see watch and affected), so a change finds what it changes.

function reading(S, fn) {
  const outer = S.reads;
  const trace = S.reads = { keys: [], parts: [] };
  try { return { v: fn(), reads: trace }; }
  finally {
    S.reads = outer;
    if (S.watch) watch(S, trace);
    if (outer) outer.parts.push(trace);
  }
}

// A trace that depends on keys, itself or through its parts, is found from them: each key lists the traces
// that noted it, and each part the traces it's part of.
function watch(S, trace) {
  trace.live = trace.keys.length > 0 || trace.parts.some(p => p.live);
  if (!trace.live) return;
  for (const k of trace.keys) push(S.watch, k, trace);
  for (const p of trace.parts) if (p.live) (p.up ??= []).push(trace);
}

// The traces a change to these keys reaches, through what they're part of. A lookup kept for the group that's
// reached is let go of; the traces of what's being worked out are returned. The keys are done with.
function affected(S, keys) {
  const out = [], seen = new Set(), stack = [];
  for (const k of keys) {
    const traces = S.watch.get(k);
    if (traces) { stack.push(...traces); S.watch.delete(k); }
  }
  while (stack.length) {
    const t = stack.pop();
    if (seen.has(t)) continue;
    seen.add(t);
    if (t.memo && S.memo.get(t.memo)?.reads === t) S.memo.delete(t.memo);
    if (t.job) out.push(t);
    if (t.up) stack.push(...t.up);
  }
  return out;
}

// Lookups are kept until what they read changes (see runStep).
function remembered(S, key, fn) {
  const kept = S.memo.get(key);
  if (kept) {
    if (S.reads) S.reads.parts.push(kept.reads);
    return kept.v;
  }
  const run = reading(S, fn);
  run.reads.memo = key;
  S.memo.set(key, run);
  return run.v;
}

function safeEv(ast, c) {
  try { return ev(ast, c); }
  catch (e) { return err('#VALUE!', e instanceof RangeError ? 'This goes around too many times.' : String(e)); }
}

// ---- Candidates, as a group finds them ----

// A definition's candidates for one parameterization it covers, as a block: its parameters in the relation's
// order, the records each can be filled with (pools, as they stand when the group starts), and each record's
// object. A candidate is one record from each pool, as indexes; its ordinal is its place among all of them,
// so candidates found in any order are worked out in one order.
function blocksOf(S, group) {
  const blocks = [];
  let base = 0;
  for (const d of group) for (const params of d.params) {
    const ordered = d.isRelation ? [...params].sort((a, b) => edgeIndex(d, a.edge) - edgeIndex(d, b.edge)) : params;
    const pools = ordered.map(p => [...(S.bySpec.get(p.spec) ?? [])]);
    const strides = pools.map(() => 1);
    for (let j = pools.length - 2; j >= 0; j--) strides[j] = strides[j + 1] * pools[j + 1].length;
    blocks.push(keyedBlock({ d, pools, strides, base, edges: ordered.map(p => writtenEdge(d, p.edge)), objects: pools.map(pool => pool.map(id => objectOf(S, id))), numbers: [] }));
    base += pools.length ? strides[0] * pools[0].length : 0;
  }
  return blocks;
}

// The candidate with these records, or null if it uses one object twice and its definition doesn't allow that.
function candidateIn(b, picks) {
  if (!b.d.self) for (let i = 1; i < picks.length; i++) for (let j = 0; j < i; j++) if (b.objects[i][picks[i]] === b.objects[j][picks[j]]) return null;
  const args = picks.map((k, j) => ({ edge: b.edges[j], at: b.pools[j][k] }));
  const key = `[${b.keyOrder.map(j => kept(b.keyParts[j], picks[j], () => JSON.stringify(JSON.stringify([b.normals[j], args[j].at])))).join(',')}]`;
  const id = b.idOrder ? `fx:${b.idOrder.map(j => `${b.normals[j]}=${args[j].at}`).join('&')}` : computedId(args);
  return { key, args, at: b.d.isRelation ? undefined : args[0].at, id };
}

// argKey and computedId sort their pairs, [edge, location] and edge=location, and a block's edges alone
// decide the order (unless an edge has = or & in it). So a block works the order out once, and a key's pairs
// once for each record of a pool.
function keyedBlock(b) {
  b.normals = b.edges.map(normal);
  b.sig = b.d.isRelation && signature(b.d.type, b.edges);
  b.specs = new Map();
  const order = by => b.normals.map((_, j) => j).sort((x, y) => by(x) < by(y) ? -1 : by(x) > by(y) ? 1 : 0);
  b.keyOrder = order(j => JSON.stringify([b.normals[j], '']));
  b.idOrder = b.normals.some(e => /[=&]/.test(e)) ? null : order(j => `${b.normals[j]}=`);
  b.keyParts = b.normals.map(() => new Map());
  return b;
}
const ordinalIn = (b, picks) => picks.reduce((o, k, j) => o + k * b.strides[j], b.base);

// Every choice of records for the parameters other than the free one (whose index is left 0).
function anchorsOf(b, free) {
  const out = [], picks = b.pools.map(() => 0);
  const walk = j => {
    if (j === b.pools.length) return out.push([...picks]);
    if (j === free) return walk(j + 1);
    for (let k = 0; k < b.pools[j].length; k++) { picks[j] = k; walk(j + 1); }
  };
  if (b.pools.every((pool, j) => j === free || pool.length)) walk(0);
  return out;
}
const anchorContext = (b, free, anchor) => ({ S: null, def: b.d, at: null, lets: null,
  self: { args: new Map(anchor.flatMap((k, j) => j === free ? [] : [[normal(b.edges[j]), b.objects[j][k]]])) } });

// The free parameter's records for a support's objects, as indexes into its pool; all of them where there's
// no support.
function picksFor(S, b, free, s) {
  if (!s) return b.pools[free].map((_, k) => k);
  b.numbers[free] ??= b.objects[free].map(obj => obj ? numberOf(S, obj) : -1);
  const out = [];
  b.numbers[free].forEach((k, i) => { if (k >= 0 && hasBit(s.bits, k)) out.push(i); });
  return out;
}

// Where entered records stand in a block, as picks: a row is worked out there too, to say what it would give.
function enteredPicks(S, b) {
  if (!S.enteredByEdges) {
    S.enteredByEdges = new Map();
    for (const id of S.enteredByKey.values()) push(S.enteredByEdges, argsOf(S.entered[id]).map(a => normal(a.edge)).sort().join('|'), id);
  }
  const at = b.pools.map(pool => new Map(pool.map((id, k) => [id, k])));
  const out = [];
  for (const id of S.enteredByEdges.get([...b.normals].sort().join('|')) ?? []) {
    const args = argsOf(S.entered[id]);
    const picks = b.normals.map((edge, j) => at[j].get(args.find(a => normal(a.edge) === edge)?.at));
    if (picks.every(k => k !== undefined)) out.push(picks);
  }
  return out;
}

// For each row of a block: the parameter left free, and the support given the others (see holdsWhere), where
// its form gives one; else every candidate is tried.
function plansOf(K, b) {
  return b.d.rows.map(row => {
    if (b.d.isRelation) for (let free = 0; free < b.edges.length; free++) {
      const v = { name: normal(b.edges[free]) };
      const where = !binds(row.ast, v.name) && (row.implies ? holdsWhere(K, row.ast, v) : givesWhere(K, row.ast, v));
      if (where) return { free, where };
    }
    return { free: b.edges.length - 1, where: null };
  });
}

// A support worked out for a block's anchor, or null where it can't be.
function supportAt(S, where, ctx) {
  try { return where({ ...ctx, S }); } catch { return null; }
}

// The keys under which a candidate could turn up in a lookup (see depend): an entry at its location by its
// name; a relation in each list of relatives it makes, from each argument's record and object, under the
// list's name and the edge label it lists, and in whose lists each object is; by the call that finds it; and
// by each argument, for finding candidates (see relatedAt).
function candidateKeys(S, d, cand, kinds) {
  const want = kind => kinds.has(kind);
  if (!d.isRelation) return want('entry') ? [`entry|${cand.at}|${normal(d.name)}`] : [];
  const n = normal(d.name), objs = cand.args.map(a => objectOf(S, a.at)), keys = [];
  if (want('calls')) keys.push(`calls|${n}|${cand.args.map((a, i) => `${normal(a.edge)}=${objs[i]}`).sort().join('&')}`);
  if (want('rel')) cand.args.forEach((a, i) => keys.push(`rel|${n}|${normal(a.edge)}=${objs[i]}`));
  if (!want('lists') && !want('inverse')) return keys;
  const lists = listsByPair(S, d);
  cand.args.forEach((own, i) => cand.args.forEach((other, j) => {
    if (i !== j) for (const list of lists.get(`${normal(own.edge)}|${normal(other.edge)}`)) {
      if (want('lists')) {
        keys.push(`lists|${own.at}|${list}`);
        if (objs[i] !== own.at) keys.push(`lists|${objs[i]}|${list}`);
      }
      if (want('inverse')) keys.push(`inverse|${objs[j]}|${list}`);
    }
  }));
  return keys;
}

// The names of a relation definition's lists of relatives, normalized, by the edge they're seen from and the
// edge they list: the list's name, and the edge label it also answers to.
function listsByPair(S, d) {
  if (!S.pairLists.has(d)) {
    const rel = S.P.reg.byName.get(normal(d.name)), lists = new Map();
    for (const own of d.edges) for (const other of d.edges)
      if (own !== other) lists.set(`${normal(own)}|${normal(other)}`, [...new Set([normal(listNameOf(rel, own, other)), normal(other)])]);
    S.pairLists.set(d, lists);
  }
  return S.pairLists.get(d);
}

// The names under which a group's own candidates can be looked for, by how (see depend).
function relevance(S, group) {
  const dep = { entry: new Set(), lists: new Set(), calls: new Set(), rel: new Set(), inverse: new Set(), watched: new Set(), watchedValues: new Set() };
  for (const d of group) {
    if (!d.isRelation) { dep.entry.add(normal(d.name)); continue; }
    dep.calls.add(normal(d.name));
    dep.rel.add(normal(d.name));
    for (const names of listsByPair(S, d).values()) for (const n of names) { dep.lists.add(n); dep.inverse.add(n); }
  }
  return dep;
}

// ---- A group, round by round ----
// A group starts from nothing. In each round, every row whose candidate's inputs changed in the round before
// is worked out again, reading the state as the round before left it, and then the outputs change together:
// the round in which a record first appears is its stage. Where nothing changes, the group is done. A group
// that doesn't loop is done in one round. A loop is monotone (see loopReads), so its records only go up, to
// its least solution; a number that keeps growing past ROUNDS rounds, or anything that goes down, is circular.
//
// The output at a candidate is the entered record's, if one stands there (row zero); otherwise what the first
// row that gives something gives, an error included. For a tag whose rows are all ←, any row that holds.

const ROUNDS = 1000;
const EVALUATE = Symbol('work out'), FOUND = 1, HELD = 2, STILL = 3;
// A field's value changing is read where the record is read; its coming or going, wherever it's looked for.
const VALUE_KINDS = new Set(['entry', 'lists', 'calls']);

function runGroup(S, i) {
  const g = S.P.groups[i];
  const group = g.defs.filter(d => !d.error);
  if (!group.length) return;
  if (g.loops && !g.monotone) return circularGroup(S, group);
  const loops = g.loops;
  const blocks = blocksOf(S, group);
  const K = { P: S.P };
  S.dep = loops ? relevance(S, group) : null;
  S.watch = loops ? new Map() : null;
  // Candidates by ordinal, made when first wanted.
  const size = blocks.reduce((n, b) => Math.max(n, b.base + (b.pools.length ? b.strides[0] * b.pools[0].length : 0)), 0);
  const cands = [], slots = size <= 1 << 22 ? new Int32Array(size).fill(-1) : new Map();
  const candAt = (b, ordinal, picks) => {
    let k = slots instanceof Map ? slots.get(ordinal) ?? -1 : slots[ordinal];
    if (k < 0) {
      const at = picks(), cand = candidateIn(b, at);
      k = cands.push(cand && { d: b.d, b, picks: at, cand, ordinal, ctx: null, results: b.d.rows.map(() => null), out: NONE, rows: [],
        entered: S.enteredByKey.get(cand.key) ?? null, blocked: false, pending: null }) - 1;
      if (slots instanceof Map) slots.set(ordinal, k); else slots[ordinal] = k;
      if (cand) S.count.tried++;
    }
    return cands[k];
  };
  // The candidates with rows to work out this round, each with what's pending: a row to work out (EVALUATE),
  // or, as an exact support said, holding or not (true or false). The latest word wins.
  let queue = [];
  const enqueue = (t, ri, known = EVALUATE) => {
    if (!t || t.blocked) return;
    if (!t.pending) { t.pending = []; queue.push(t); }
    t.pending[ri] = known;
  };
  // A finder works a row's support out for one choice of the other arguments' objects, and queues the row
  // where it newly allows, in each block with those objects (its targets). A target keeps, for each record of
  // the free parameter's pool, whether the row has been queued there to be worked out (FOUND), or held there
  // as an exact support said (HELD).
  const seek = f => {
    let s = null;
    if (f.where) {
      const run = reading(S, () => supportAt(S, f.where, f.ctx));
      s = run.v;
      f.reads = run.reads;
      f.reads.job = f;
    }
    for (const x of f.targets) {
      const at = k => candAt(x.b, x.ordinal + k * x.b.strides[x.free], () => { const picks = [...x.anchor]; picks[x.free] = k; return picks; });
      if (s && !s.exact && x.held.length) {
        // No longer exact: what it said held is worked out instead.
        for (const k of x.held) { x.state[k] = FOUND; enqueue(at(k), f.ri); }
        x.held = [];
      }
      const picks = picksFor(S, x.b, x.free, s);
      if (s?.exact) {
        const held = picks.filter(k => x.state[k] !== FOUND);
        for (const k of held) { if (x.state[k] !== HELD) enqueue(at(k), f.ri, true); x.state[k] = STILL; }
        for (const k of x.held) if (x.state[k] === HELD) { enqueue(at(k), f.ri, false); x.state[k] = 0; }
        for (const k of held) x.state[k] = HELD;
        x.held = held;
      } else for (const k of picks) if (x.state[k] !== FOUND) { x.state[k] = FOUND; enqueue(at(k), f.ri); }
    }
    if (!s) f.where = null;
  };
  const plans = new Map(), finders = new Map();
  for (const b of blocks) {
    if (!plans.has(b.d)) plans.set(b.d, plansOf(K, b));
    plans.get(b.d).forEach(({ free, where }, ri) => {
      for (const anchor of anchorsOf(b, free)) {
        const key = `${b.d.id}|${ri}|${anchor.map((k, j) => j === free ? '' : b.objects[j][k]).join('|')}`;
        if (!finders.has(key)) finders.set(key, { ri, where, ctx: where && anchorContext(b, free, anchor), targets: [], reads: null });
        finders.get(key).targets.push({ b, free, anchor, ordinal: ordinalIn(b, anchor), state: new Uint8Array(b.pools[free].length), held: [] });
      }
    });
    for (const picks of enteredPicks(S, b)) {
      const t = candAt(b, ordinalIn(b, picks), () => picks);
      b.d.rows.forEach((_, ri) => enqueue(t, ri));
    }
  }
  finders.forEach(seek);
  let capped = false;
  for (let round = 1; queue.length; round++) {
    S.count.rounds++;
    if (round > ROUNDS) capped = true;
    const changed = [];
    for (const t of queue.sort((x, y) => x.ordinal - y.ordinal)) {
      const pending = t.pending;
      t.pending = null;
      for (let ri = 0; ri < pending.length; ri++) {
        const known = pending[ri];
        if (known === undefined) continue;
        if (known !== EVALUATE) { t.results[ri] = { r: known ? TRUE_OUT : NONE, reads: null }; continue; }
        S.count.evals++;
        t.ctx ??= contextFor(S, t.d, t.cand);
        const { v, reads } = reading(S, () => rowGives(S, t, ri));
        reads.job = t;
        reads.row = ri;
        t.results[ri] = { r: v, reads };
      }
      const next = outcome(t);
      if (!sameOut(t.out, next.out) || !sameRows(t.rows, next.rows)) changed.push([t, next]);
    }
    queue = [];
    // The outputs change together, after the round.
    const keys = [];
    for (const [t, next] of changed) {
      if (loops && !t.entered && (capped || wentDown(t.out, next.out))) { t.blocked = true; next.out = { error: circular() }; }
      const kinds = settle(S, t, next, round);
      if (S.watch && kinds) keys.push(...candidateKeys(S, t.d, t.cand, kinds === true ? S.dep.watched : S.dep.watchedValues));
    }
    if (!S.watch || !keys.length) continue;
    const again = [];
    for (const trace of affected(S, keys)) {
      const job = trace.job;
      if (trace.row === undefined) { if (job.reads === trace && job.where) again.push(job); }
      else if (job.results[trace.row]?.reads === trace) enqueue(job, trace.row);
    }
    again.forEach(seek);
  }
  finishGroup(S, cands);
  S.dep = S.watch = null;
}

// What a row gives at a candidate.
function rowGives(S, t, ri) {
  const row = t.d.rows[ri];
  if (row.implies) {
    const v = truth(S, safeEv(row.ast, t.ctx));
    return isErr(v) ? { error: v } : v ? TRUE_OUT : NONE;
  }
  return asOutput(S, t.d, safeEv(row.ast, t.ctx));
}

// A candidate's output from its rows' results, and the rows that hold there (for a tag).
const NO_ROWS = [];
function outcome(t) {
  const d = t.d, rs = t.results;
  let rows = NO_ROWS, first = -1, error = -1;
  for (let i = 0; i < rs.length; i++) {
    const r = rs[i]?.r;
    if (!r || r.none) continue;
    if (first < 0) first = i;
    if (r.error && error < 0) error = i;
    if (r.out === true && d.type === 'tag') (rows === NO_ROWS ? rows = [] : rows).push(i);
  }
  if (t.blocked) return { out: { error: circular() }, rows };
  if (d.allImplied) {
    if (rows.length) return { out: TRUE_OUT, rows, row: rows[0] };
    return error >= 0 ? { out: rs[error].r, rows, row: error } : { out: NONE, rows };
  }
  return first >= 0 ? { out: rs[first].r, rows, row: first } : { out: NONE, rows };
}

const sameOut = (a, b) => a.none ? !!b.none : a.error ? !!b.error && a.error.code === b.error.code
  : b.out !== undefined && (typeof a.out === 'number' && typeof b.out === 'number' ? near(a.out, b.out) : isDate(a.out) ? isDate(b.out) && a.out.iso === b.out.iso : a.out === b.out);
const sameRows = (a, b) => a.length === b.length && a.every((r, i) => r === b[i]);

// Whether an output went down: anything to nothing, a tag no longer attested, a number smaller, or a value
// replaced by another.
function wentDown(a, b) {
  if (a.none || a.error || b.error) return false;
  if (b.none) return true;
  if (typeof a.out === 'number' && typeof b.out === 'number') return b.out < a.out && !near(a.out, b.out);
  if (isDate(a.out) && isDate(b.out)) return b.out.iso < a.out.iso;
  return a.out !== b.out;
}

// A candidate's new output comes into the state: its record added, changed or taken out, its error where
// readers find it, and the labels of the rows that hold there, each with the round it first held in. Returns
// the kinds of lookup that can find the change: all of them (true) where a record came, went or changed sort,
// those that read a field's value where only that changed, or none.
function settle(S, t, next, round) {
  const before = t.out;
  t.out = next.out;
  t.row = next.row;
  if (!sameRows(t.rows, next.rows)) {
    t.rows = next.rows;
    S.holds.set(t.cand.key, t);
    // Where a row is cited by label, each label keeps the round it first held in, for grounds.
    if (t.d.cited) {
      const labels = t.labels ?? new Map(), holding = new Set(next.rows.map(i => t.d.rows[i].n).filter(Boolean));
      for (const l of labels.keys()) if (!holding.has(l)) labels.delete(l);
      for (const l of holding) if (!labels.has(l)) labels.set(l, round);
      t.labels = labels;
    }
  }
  if (t.entered || sameOut(before, next.out)) return true;
  if (before.error) unfail(S, t);
  if (next.out.error) fail(S, t, next.out.error);
  const id = t.cand.id, had = before.out !== undefined, has = next.out.out !== undefined;
  if (had && has && t.d.type === 'field') {
    S.recs[id].value = isDate(next.out.out) ? next.out.out.iso : next.out.out;
    return VALUE_KINDS;
  }
  if (had) removeComputed(S, id);
  if (has) {
    addComputed(S, id, makeRecord(t.d, t.cand, next.out.out), t.b, t.picks);
    if (!S.stage.has(id)) S.stage.set(id, round);
  }
  return true;
}

// A row's error where readers of the record find it instead.
function fail(S, t, error) {
  const d = t.d;
  if (!d.isRelation) { S.failed.set(`${t.cand.at}|${normal(d.name)}`, error); return; }
  t.failures = [];
  for (const obj of new Set(t.cand.args.map(a => objectOf(S, a.at)))) {
    const failure = { args: t.cand.args, error };
    push(S.failed, `rel|${obj}|${normal(d.name)}`, failure);
    t.failures.push([`rel|${obj}|${normal(d.name)}`, failure]);
  }
}
function unfail(S, t) {
  if (!t.d.isRelation) { S.failed.delete(`${t.cand.at}|${normal(t.d.name)}`); return; }
  for (const [key, failure] of t.failures ?? []) S.failed.set(key, S.failed.get(key).filter(x => x !== failure));
  t.failures = [];
}

// What a group leaves, per candidate: a computed record, an error, or where an entry stands, what the rows
// would give there.
function finishGroup(S, cands) {
  for (const t of cands.filter(Boolean).sort((x, y) => x.ordinal - y.ordinal)) {
    const { d, cand, out } = t;
    const base = { def: d.id, key: cand.key, id: cand.id, ...(d.isRelation ? { args: cand.args } : { at: cand.at }) };
    const said = t.row === undefined ? {} : { row: t.row, label: d.rows[t.row].label };
    if (t.entered) {
      if (!out.none) addRow(S, d, { ...base, entered: t.entered, ...said, holds: t.rows, ...(out.error ? { error: out.error } : { formula: out.out }) });
    } else if (out.error) addRow(S, d, { ...base, ...said, error: out.error, holds: t.rows });
    else if (!out.none) addRow(S, d, { ...base, ...said, value: out.out, holds: t.rows, stage: S.stage.get(cand.id) });
  }
}

const addRow = (S, d, row) => push(S.rows, d.id, row);

// A group whose loop isn't monotone: every candidate where no entry stands is circular.
function circularGroup(S, group) {
  for (const b of blocksOf(S, group)) {
    const picks = b.pools.map(() => 0);
    const walk = j => {
      if (j < b.pools.length) { for (let k = 0; k < b.pools[j].length; k++) { picks[j] = k; walk(j + 1); } return; }
      const cand = candidateIn(b, picks);
      if (!cand || S.enteredByKey.has(cand.key)) return;
      const t = { d: b.d, cand };
      fail(S, t, circular());
      addRow(S, b.d, { def: b.d.id, key: cand.key, id: cand.id, ...(b.d.isRelation ? { args: cand.args } : { at: cand.at }), error: circular() });
    };
    walk(0);
  }
}

// ---- WITHOUT ----
// The chart as if `id` and everything depending on it weren't there, with what was worked out in earlier
// groups worked out again: only the groups the definition's WITHOUT reads from, or every earlier group for an
// expression outside a definition. Kept per record and set of groups.
function counterfactual(S, id, d) {
  const steps = neededSteps(S.P, d, S.done);
  const key = `${id}@${steps.join(',')}`;
  if (!S.cf.has(key)) {
    const gone = new Set([id]);
    for (let grew = true; grew;) {
      grew = false;
      for (const [k, r] of Object.entries(S.entered))
        if (!gone.has(k) && argsOf(r).some(a => gone.has(a.at))) { gone.add(k); grew = true; }
    }
    const sub = stateFor(S.P, Object.fromEntries(Object.entries(S.entered).filter(([k]) => !gone.has(k))));
    for (const i of steps) runStep(sub, i);
    sub.done = S.done;
    S.cf.set(key, sub);
  }
  return S.cf.get(key);
}

function neededSteps(P, d, limit) {
  if (!d) return [...Array(limit).keys()];
  const want = new Set(), stack = [...d.withoutReads];
  while (stack.length) {
    const e = stack.pop();
    if (want.has(e)) continue;
    want.add(e);
    stack.push(...e.dependsOn);
  }
  return [...new Set([...want].map(e => e.step))].filter(i => i < limit).sort((a, b) => a - b);
}

// ---- Grounds ----
// The ground of an expression where it gives something, by cases: for a record it reads, that record; for
// AND, a comparison or arithmetic, the grounds of its parts (less what dropped out of a sum); for IF, those of
// its condition and the branch taken; for OR and ANY, the ground of one part that holds, of least stage; for
// FILTER, SUM, COUNT and EACH, each item counted, with the ground of its condition or value; for MAX and MIN,
// the item chosen and every argument that was nothing. gv works an expression out with its ground, as
// { v, g }, g being a list of parts (see ground).

// The parts a value read at a node: the record linking each item of a list of relatives, or the record
// itself; one with no id where it read nothing. An object isn't a part: it's what the parts are about.
function partFor(S, y, n) {
  const at = id => [{ id, from: n.from, to: n.to }];
  if (isRec(y)) return y.link ? at(y.link) : y.id === null ? at(null) : y.id && !isObject(S.recs[y.id]) ? at(y.id) : [];
  return y === null || y === undefined ? at(null) : [];
}
function partsFor(S, v, n) {
  if (isErr(v)) return [];
  if (Array.isArray(v)) return v.length ? v.flatMap(y => partFor(S, y, n)) : partFor(S, null, n);
  return partFor(S, v, n);
}
// An item counted or found, as one part: its own record, with what it was counted or found with beneath.
const nest = g => g.length ? [{ ...g[0], items: g.slice(1) }] : [];

// How late a ground's records came, for choosing among grounds: the latest stage among the records of the
// group being grounded (others came before it started).
function rankOf(c, g) {
  let r = 0;
  for (const p of g) {
    if (p.id && c.groundDefs?.has(c.S.recs[p.id]?.computed)) r = Math.max(r, c.S.stage.get(p.id) ?? 0);
    if (p.items) r = Math.max(r, rankOf(c, p.items));
  }
  return r;
}

function gv(n, c) {
  const S = c.S;
  switch (n.k) {
    case 'lit': case 'at': return { v: ev(n, c), g: [] };
    case 'arr': { const xs = n.items.map(x => gv(x, c)); return { v: ev(n, c), g: xs.flatMap(x => x.g) }; }
    case 'name': {
      for (let l = c.lets; l; l = l.up) if (l.n === n.n) return { v: l.v, g: l.g ?? [] };
      const v = ev(n, c);
      return { v, g: c.self.args?.has(n.n) ? [] : partsFor(S, v, n) };
    }
    case 'dot': {
      const x = gv(n.x, c), v = lookupOn(S, x.v, n.name, n.n);
      return { v, g: [...x.g, ...partsFor(S, v, n)] };
    }
    case 'call': return isFunction(n.name) ? gfn(n, c) : (() => {
      const args = n.args.map(a => gv(a.x, c)), v = ev(n, c);
      return { v, g: [...args.flatMap(a => a.g), ...partsFor(S, v, n)] };
    })();
    case 'neg': case 'not': { const x = gv(n.x, c); return { v: ev(n, c), g: x.g }; }
    case 'and': {
      const a = gv(n.a, c), ta = truth(S, a.v);
      if (isErr(ta) || ta === false) return { v: ta, g: a.g };
      const b = gv(n.b, c), tb = truth(S, b.v);
      return { v: tb, g: tb === true ? [...a.g, ...b.g] : b.g };
    }
    case 'or': {
      const a = gv(n.a, c), ta = truth(S, a.v);
      if (isErr(ta)) return { v: ta, g: a.g };
      const b = gv(n.b, c), tb = truth(S, b.v);
      if (ta === true) return { v: true, g: tb === true && rankOf(c, b.g) < rankOf(c, a.g) ? b.g : a.g };
      return { v: tb, g: tb === true ? b.g : [...a.g, ...b.g] };
    }
    case 'cmp': { const a = gv(n.a, c), b = gv(n.b, c); return { v: compare(S, n.op, a.v, b.v), g: [...a.g, ...b.g] }; }
    case 'in': {
      const a = gv(n.a, c), L = listGround(n.b, c), v = among1(S, a.v, L.v);
      if (v !== true) return { v, g: [...a.g, ...(L.items.length ? L.items.flatMap(it => it.g) : L.g)] };
      const x = scalar(S, a.v);
      return { v, g: [...a.g, ...L.items.filter(it => equal(x, scalar(S, it.v))).flatMap(it => it.g)] };
    }
    case 'bin': {
      const a = gv(n.a, c), b = gv(n.b, c), v = arithmetic(S, n.op, a.v, b.v);
      const sum = n.op === '+' || n.op === '-';
      return { v, g: [...(sum && isNothing(scalar(S, a.v)) ? [] : a.g), ...(sum && isNothing(scalar(S, b.v)) ? [] : b.g)] };
    }
  }
  return { v: ev(n, c), g: [] };
}

// A list's items, each with its ground: for a list of relatives, the record linking each one; through FILTER,
// with the ground of its condition; through a dot or EACH, with what was read for it.
function listGround(n, c) {
  const S = c.S;
  if ((isCall(n, 'FILTER') || isCall(n, 'EACH')) && n.args.length === 2) {
    const L = listGround(n.args[0].x, c);
    if (isErr(L.v)) return L;
    const items = [];
    for (const it of L.items) {
      const x = gv(n.args[1].x, withAt(c, it.v));
      if (isCall(n, 'FILTER')) {
        const t = truth(S, x.v);
        if (isErr(t)) return { v: t, items: [], g: x.g };
        if (t) items.push({ v: it.v, g: [...it.g, ...x.g] });
      } else {
        if (isErr(x.v)) return { v: x.v, items: [], g: x.g };
        for (const y of Array.isArray(x.v) ? flatten(x.v) : [x.v]) items.push({ v: y, g: [...it.g, ...x.g] });
      }
    }
    return { v: items.map(x => x.v), items, g: L.g };
  }
  if (n.k === 'dot') {
    const L = listGround(n.x, c);
    if (isErr(L.v)) return L;
    const items = [];
    for (const it of L.items) {
      const y = lookupOn(S, it.v, n.name, n.n);
      if (isErr(y)) return { v: y, items: [], g: L.g };
      for (const z of Array.isArray(y) ? y : [y]) items.push({ v: z, g: [...it.g, ...partFor(S, z, n)] });
    }
    return { v: items.map(x => x.v), items, g: L.g.length || L.items.length ? L.g : partFor(S, null, n) };
  }
  const x = n.k === 'name' || n.k === 'at' ? null : gv(n, c);
  const v = x ? x.v : n.k === 'name' ? gv(n, c).v : ev(n, c);
  const list = toList(v);
  if (isErr(list)) return { v: list, items: [], g: x?.g ?? [] };
  const lets = n.k === 'name' && (() => { for (let l = c.lets; l; l = l.up) if (l.n === n.n) return l; return null; })();
  const items = list.map(item => ({ v: item, g: x && list.length === 1 ? x.g : lets ? lets.g ?? [] : partFor(S, item, n) }));
  return { v: list, items, g: list.length ? [] : x?.g.length ? x.g : partFor(S, null, n) };
}

// Functions, with their grounds.
function gfn(n, c) {
  const S = c.S, f = n.name.toUpperCase(), a = n.args;
  switch (f) {
    case 'IF': {
      if (a.length < 2) break;
      const cond = gv(a[0].x, c), t = truth(S, cond.v);
      if (isErr(t)) return { v: t, g: cond.g };
      const branch = t ? a[1] : a[2];
      if (!branch) return { v: null, g: cond.g };
      const b = gv(branch.x, c);
      return { v: b.v, g: [...cond.g, ...b.g] };
    }
    case 'NOT': case 'ISBLANK': case 'KIND': {
      const xs = a.map(x => gv(x.x, c));
      return { v: ev(n, c), g: xs.flatMap(x => x.g) };
    }
    case 'COUNT': case 'SUM': case 'AVERAGE': {
      const v = ev(n, c);
      if (isErr(v)) return { v, g: [] };
      const items = a.flatMap(x => listGround(x.x, c).items);
      const counted = items.filter(it => f === 'COUNT' ? !isNothing(it.v) : typeof scalar(S, it.v) === 'number');
      return { v, g: counted.flatMap(it => nest(it.g)) };
    }
    case 'MIN': case 'MAX': {
      const v = ev(n, c);
      if (isErr(v)) return { v, g: [] };
      const per = a.map(x => listGround(x.x, c));
      const chosen = per.flatMap(L => L.items).find(it => { const s = scalar(S, it.v); return s !== null && equal(s, v); });
      const nothing = per.filter(L => L.items.every(it => isNothing(it.v))).flatMap(L => L.items.length ? L.items.flatMap(it => it.g) : L.g);
      return { v, g: [...(chosen ? chosen.g : []), ...nothing] };
    }
    case 'FILTER': case 'EACH': {
      const L = listGround(n, c);
      return { v: L.v, g: L.items.flatMap(it => nest(it.g)) };
    }
    case 'ANY': case 'ALL': {
      if (a.length !== 2) break;
      const v = ev(n, c);
      if (isErr(v)) return { v, g: [] };
      const L = listGround(a[0].x, c);
      const found = [];
      for (const it of L.items) {
        const x = gv(a[1].x, withAt(c, it.v));
        if ((truth(S, x.v) === true) === (f === 'ANY' || v === true)) found.push([...it.g, ...x.g]);
      }
      if (f === 'ANY' && v === true) {
        const best = found.reduce((m, g) => !m || rankOf(c, g) < rankOf(c, m) ? g : m, null);
        return { v, g: nest(best ?? []) };
      }
      return { v, g: found.flatMap(nest) };
    }
    case 'LET': {
      if (a.length < 3 || a.length % 2 === 0) break;
      let lets = c.lets;
      for (let i = 0; i < a.length - 1; i += 2) {
        if (a[i].x.k !== 'name') break;
        const x = gv(a[i + 1].x, { ...c, lets });
        if (isErr(x.v)) return x;
        lets = { n: normal(a[i].x.name), v: x.v, g: x.g, up: lets };
      }
      return gv(a.at(-1).x, { ...c, lets });
    }
    case 'WITHOUT': {
      if (a.length !== 2) break;
      const x = asRec(S, ev(a[0].x, c));
      if (isErr(x)) return { v: x, g: [] };
      return gv(a[1].x, x?.id ? { ...c, S: counterfactual(S, x.id, c.def) } : c);
    }
  }
  const xs = a.map(x => gv(x.x, c));
  return { v: ev(n, c), g: xs.flatMap(x => x.g) };
}

// Why a record at one of a definition's candidates is there, or would be: see the header.
function ground(R, id) {
  const S = R.state, r = S.recs[id];
  const d = r && defOf(S, id);
  if (!d || d.error) return null;
  const computed = r.computed === d.id;
  const stage = computed ? S.stage.get(id) ?? null : null;
  const g = S.P.groups[d.step];
  const groundDefs = new Set(g.defs.map(e => e.id));
  // An attestation on a loop is grounded in what came before it, so unfolding grounds always ends.
  S.cut = computed && g.loops && isTag(r) && r.tag === true && stage ? { defs: groundDefs, limit: stage } : null;
  S.memo.clear();
  try {
    const cand = candidateFrom(d, argsOf(r));
    const c = { ...contextFor(S, d, cand), groundDefs };
    const rows = [];
    for (const row of d.rows) {
      const x = gv(row.ast, c);
      if (row.implies) { if (truth(S, x.v) === true) rows.push({ row: row.i, label: row.label, stage: rankOf(c, x.g), parts: x.g }); continue; }
      const out = asOutput(S, d, x.v);
      if (out.none) continue;
      rows.push({ row: row.i, label: row.label, stage: rankOf(c, x.g), parts: x.g });
      if (!d.allImplied) break;
    }
    if (d.allImplied) rows.sort((x, y) => x.stage - y.stage);
    return { id, def: d.id, entered: !computed, stage, rows };
  } finally {
    S.cut = null;
    S.memo.clear();
  }
}

// A ground on one line, for exports: each record its row read, by the name that read it, with its output.
function groundText(R, id) {
  const g = ground(R, id), S = R.state;
  const row = g?.rows[0];
  if (!row) return '';
  const text = S.P.byId.get(g.def).rows[row.row].text;
  const nameIn = p => {
    const src = text.slice(p.from, p.to).trim();
    const m = /\[([^\]]*)\]\s*$/.exec(src) ?? /([A-Za-z_][A-Za-z0-9_]*)\s*$/.exec(src) ?? /^\[?([^\](]*)\]?\s*\(/.exec(src);
    return m ? clean(m[1]) : src;
  };
  return row.parts.map(p => `${nameIn(p)} ${p.id ? outputText(S, p.id) : '—'}`).join(' · ');
}

// A record's output as text: a field's value as its datatype reads, an object or relation by name.
function outputText(S, id) {
  const r = S.recs[id];
  if (!r) return '—';
  if (isObject(r)) return nameOf(S, id);
  const value = isTag(r) ? (r.tag ? 'Yes' : 'No') : isChoice(r) ? r.choice
    : r.field === 'date' ? Tree.formatDate(r.value) : r.field === 'percent' ? `${tidyNumber(r.value * 100)}%`
    : r.field === 'money' ? `$${Number(r.value).toLocaleString('en-US')}` : String(r.value);
  return isRelation(r) ? `${segmentOf(S, id)}${isTag(r) ? '' : ` ${value}`}` : value;
}

// ---- The formula bar ----

// A row worked out at a record, with each name's records and each part's values: see the header.
function evaluateRow(R, defId, row, at) {
  const S = R.state, d = S.P.byId.get(defId);
  if (!d || (typeof row === 'number' && !d.rows[row])) return null;
  let ast, implies;
  if (typeof row === 'number') ({ ast, implies } = d.rows[row]);
  else {
    const f = splitFormula(row);
    implies = f.kind === 'implies';
    try { ast = parseExpression(f.body, f.offset); } catch (e) { return { value: err('#SYNTAX', e.message), names: [], parts: [] }; }
  }
  const cand = candidateAt(S, d, at);
  if (!cand) return null;
  const parts = new Map(), names = new Map();
  const add = (map, from, to, xs) => {
    const key = `${from}:${to}`;
    if (!map.has(key)) map.set(key, { from, to, [map === parts ? 'values' : 'ids']: [] });
    map.get(key)[map === parts ? 'values' : 'ids'].push(...xs);
  };
  const idsOf = v => isErr(v) ? [] : toList(v).flatMap(x => isRec(x) ? [x.id, x.link].filter(Boolean) : []);
  S.memo.clear();
  S.probe = (node, v) => {
    add(parts, node.from, node.to, [v]);
    if (node.k === 'name' || node.k === 'at') add(names, node.from, node.to, idsOf(v));
    else if (node.k === 'dot') add(names, node.at, node.to, idsOf(v));
    else if (node.k === 'call' && !isFunction(node.name)) add(names, node.from, node.nameTo, idsOf(v));
  };
  let value;
  try {
    const c = contextFor(S, d, cand), v = safeEv(ast, c);
    value = implies ? truth(S, v) : v;
  } finally {
    S.probe = null;
    S.memo.clear();
  }
  for (const x of names.values()) x.ids = distinct(x.ids);
  return { value, names: [...names.values()], parts: [...parts.values()] };
}

// ---- Comparing two workings-out ----

const sameRecord = (x, y) => x === y || (typeOf(x) === typeOf(y) && (isTag(x) ? x.tag === y.tag : isChoice(x) ? same(x.choice, y.choice)
  : x.field === y.field && (typeof x.value === 'number' && typeof y.value === 'number' ? near(x.value, y.value) : x.value === y.value)));

// What would appear, go, and change output between two computed states, by record id.
function diff(before, after) {
  const A = before.records, B = after.records, appear = [], go = [], change = [];
  for (const id in B) {
    const x = A[id];
    if (!x) appear.push(id);
    else if (!isObject(x) && !sameRecord(x, B[id])) change.push(id);
  }
  for (const id in A) if (!(id in B)) go.push(id);
  return { appear, go, change };
}

// ---- For an editor ----

// The names that can follow a dot on a value: on a record reached through a relation, the relation's; then
// the record's own, and those up its path; and a tag's rows' labels.
function namesOnValue(S, v) {
  const out = new Map();
  const add = (name, kind) => { if (name && !out.has(normal(name))) out.set(normal(name), { name, kind }); };
  for (const x of toList(v).slice(0, 20)) {
    if (!isRec(x) || !x.id) continue;
    const link = x.link && S.recs[x.link];
    if (link) {
      link.args.forEach(a => add(a.edge, 'argument'));
      const rel = relationOf(S, link);
      if (rel) add(rel.name, 'output');
      for (const e of S.byAt.get(x.link) ?? []) add(S.recs[e].edge, 'entry');
      defOf(S, x.link)?.rows.forEach(r => add(r.label, 'label'));
    }
    for (let id = x.id; id && S.recs[id]; id = S.recs[id].at) {
      for (const e of S.byAt.get(id) ?? []) add(S.recs[e].edge, 'entry');
      for (const rid of isObject(S.recs[id]) ? relationsFor(S, id) : S.relsAt.get(id) ?? []) {
        const r = S.recs[rid], rel = relationOf(S, r);
        r.args.forEach((own, i) => { if (own.at === id || objectOf(S, own.at) === id) r.args.forEach((other, j) => { if (i !== j) add(listNameOf(rel, own.edge, other.edge), 'list'); }); });
      }
      if (isRelation(S.recs[id])) S.recs[id].args.forEach(a => add(a.edge, 'argument'));
      if (isTag(S.recs[id])) defOf(S, id)?.rows.forEach(r => add(r.label, 'label'));
    }
  }
  return [...out.values()];
}

// Where a dot chain ending at the cursor starts: the tokens before it, back over names, @, dots, and balanced
// parentheses.
function chainStart(toks, end) {
  let i = end, depth = 0;
  while (i > 0) {
    const t = toks[i - 1];
    if (t.k === 'op' && t.v === ')') { depth++; i--; continue; }
    if (t.k === 'op' && t.v === '(') { if (!depth) break; depth--; i--; continue; }
    if (depth || t.k === 'name' || (t.k === 'op' && (t.v === '.' || t.v === '@'))) { i--; continue; }
    break;
  }
  return i;
}

// The definition and the record an editor works at: the definition's, at its first candidate or `at`.
function editorContext(ctx) {
  const R = ctx?.computed, S = R?.state;
  if (!S) return null;
  const d = ctx.def ? S.P.byId.get(ctx.def) : null;
  let cand = d && ctx.at ? candidateAt(S, d, ctx.at) : null;
  if (d && !cand) for (const params of d.params) {
    const args = params.map(p => ({ edge: p.edge, at: S.bySpec.get(p.spec)?.[0] }));
    if (args.every(a => a.at)) { cand = candidateFrom(d, args); break; }
  }
  const c = cand ? contextFor(S, d, cand) : { S, def: d, self: { loc: ctx.at ?? null }, at: ctx.at ? recOf(ctx.at) : null, lets: null };
  return { S, d, c };
}

// Checks a formula as typed: its kind ('value', 'implies' or null), and its problems, each with a span: what
// doesn't parse, and given a computed state, names the chart doesn't have.
function check(text, ctx = {}) {
  const f = splitFormula(text);
  const problems = [];
  if (!f.kind) problems.push({ from: 0, to: Math.min(1, String(text ?? '').length), message: 'A formula starts with = or ←.' });
  let ast;
  try { ast = parseExpression(f.body, f.offset); }
  catch (e) {
    const pos = e.pos ?? f.offset;
    problems.push({ from: pos, to: Math.max(pos + 1, pos), message: e.message });
    return { kind: f.kind, problems };
  }
  const E = editorContext(ctx);
  if (E) {
    const { S, d } = E, known = S.P.known;
    if (f.kind === 'implies' && d && d.type !== 'tag') problems.push({ from: 0, to: f.offset, message: 'Only a tag can be implied; start this row with =.' });
    const own = new Set(d?.isRelation ? d.edges.map(normal) : []);
    const lets = new Set();
    const walk = n => {
      if (!n) return;
      if (isCall(n, 'LET')) n.args.forEach((x, i) => { if (i % 2 === 0 && i < n.args.length - 1 && x.x.k === 'name') lets.add(x.x.n); });
      const unknown = (name, from, to) => problems.push({ from, to, message: `Nothing is called ${name}.` });
      const has = nm => known.values.has(nm) || known.lists.has(nm) || S.P.reg.byName.has(nm) || lets.has(nm);
      if (n.k === 'name' && !own.has(n.n) && !has(n.n) && !(d?.isRelation)) unknown(n.name, n.from, n.to);
      else if (n.k === 'name' && d?.isRelation && !own.has(n.n) && !lets.has(n.n)) problems.push({ from: n.from, to: n.to, message: `${n.name} isn’t one of this relation’s arguments.` });
      if (n.k === 'dot' && !has(n.n)) unknown(n.name, n.at, n.to);
      if (n.k === 'call' && !isFunction(n.name) && !S.P.reg.byName.has(normal(n.name))) problems.push({ from: n.from, to: n.nameTo, message: `There’s no function or relation called ${n.name}.` });
      partsOf(n).forEach(walk);
    };
    walk(ast);
  }
  return { kind: f.kind, problems };
}

// Names that could go at the cursor, for completion: after a dot, the names on what's before it, worked out at
// one of the definition's candidates (or at `at`); otherwise its arguments or its location's names, the
// relations, and the functions. Each is { text, name, kind }, text being what to put in, filtered by what's
// typed so far, which `from` and `to` span.
function suggest(text, cursor, ctx = {}) {
  const s = String(text ?? '');
  cursor ??= s.length;
  const before = s.slice(0, cursor);
  const m = /(\[[^\]]*|[A-Za-z_][A-Za-z0-9_]*)$/.exec(before);
  const typed = m?.[1] ?? '';
  const after = /^(?:[^\]\[(),.]*\]|[A-Za-z0-9_]*)/.exec(s.slice(cursor))?.[0] ?? '';
  const from = cursor - typed.length, to = cursor + (typed.startsWith('[') || /^[A-Za-z0-9_]/.test(after) ? after.length : 0);
  const partial = normal(typed.replace(/^\[/, ''));
  const bracket = name => !typed.startsWith('[') && /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && !KEYWORDS.has(name.toUpperCase()) ? name : `[${name}]`;
  const functions = Object.keys(FUNCTIONS).map(f => ({ name: f, kind: 'function' }));
  const E = editorContext(ctx);
  let names = functions;
  if (E) {
    const { S, d, c } = E;
    const f = splitFormula(before);
    let toks = null;
    try { toks = tokenize(f.body.slice(0, f.body.length - typed.length), f.offset).slice(0, -1); } catch { toks = null; }
    if (toks?.at(-1)?.k === 'op' && toks.at(-1).v === '.') {
      const start = chainStart(toks, toks.length - 1);
      const src = s.slice(toks[start]?.pos ?? f.offset, toks.at(-1).pos);
      let v = null;
      try { v = safeEv(parseExpression(src), c); } catch { v = null; }
      names = namesOnValue(S, v);
    } else {
      names = [
        ...(d?.isRelation ? d.edges.map(e => ({ name: e, kind: 'argument' })) : c.self.loc ? namesOnValue(S, recOf(c.self.loc)) : []),
        ...[...S.P.reg.byName.values()].map(r => ({ name: r.name, kind: 'relation' })),
        ...functions,
      ];
    }
  }
  const list = names.filter(x => normal(x.name).startsWith(partial))
    .map(x => ({ ...x, text: x.kind === 'function' ? `${x.name}(` : bracket(x.name) }));
  return { from, to, list };
}

// Renames a name wherever a formula mentions it, keeping the rest as typed: for a relabeled edge or entry, as
// Excel renames a table column in its formulas.
function renameName(text, from, to) {
  const s = String(text ?? '');
  const start = /^\s*(=|←|<-)?/.exec(s)[0].length;
  const bare = /^[A-Za-z_][A-Za-z0-9_]*$/.test(to) && !KEYWORDS.has(to.toUpperCase());
  let toks;
  try { toks = tokenize(s.slice(start), start); } catch { return s; }
  let out = '', last = 0;
  for (const t of toks) {
    if (t.k !== 'name' || !same(t.v, from)) continue;
    out += s.slice(last, t.pos) + (bare ? to : `[${to}]`);
    last = t.end;
  }
  return out + s.slice(last);
}

// Carries a relabeled edge or entry through the definitions and the names: their rows, an entry definition's
// name, a relation's edges and list keys, and the keys of what they cover. Returns new copies.
function relabel(definitions, names, from, to) {
  const swap = s => same(s, from) ? to : s;
  // Keys spell edge labels too: a parameterization's pairs [edge, location key], and a form's [edge, shape].
  const pairs = (list, inner) => list.map(s => { const [e, k] = JSON.parse(s); return JSON.stringify([e === normal(from) ? normal(to) : e, inner(k)]); }).sort();
  const specKey = k => k.startsWith('kind:') ? k : (([head, ...rest]) => JSON.stringify([head, ...pairs(rest, specKey)]))(JSON.parse(k));
  const paramKey = k => JSON.stringify(pairs(JSON.parse(k), specKey));
  const shapeKey = k => k === '•' ? k : JSON.stringify(['∘', ...pairs(JSON.parse(k).slice(1), shapeKey)]);
  const formKey = k => k === 'object' ? k : (([sort, ...rest]) => JSON.stringify([sort, ...pairs(rest, shapeKey)]))(JSON.parse(k));
  const defs = definitions.map(d => ({
    ...d,
    ...(d.covers && { covers: d.covers.map(paramKey) }),
    ...(d.form && { form: formKey(d.form) }),
    name: d.covers && paramsOf(d.covers[0] ?? '[]').length > 1 ? d.name : swap(d.name),
    rows: (d.rows ?? []).map(r => ({ ...r, formula: renameName(r.formula, from, to) })),
  }));
  const rels = (names?.relations ?? []).map(r => ({
    ...r, edges: r.edges.map(swap), ...(r.form && { form: formKey(r.form) }),
    lists: Object.fromEntries(Object.entries(r.lists ?? {}).map(([k, v]) => [swap(k), Object.fromEntries(Object.entries(v).map(([k2, n]) => [swap(k2), n]))])),
  }));
  return { definitions: defs, names: { ...names, relations: rels } };
}

// ---- What the page uses ----

// Works out the computed state from the entered records, the definitions and the names: see the header.
function computeState(entered, definitions, names) {
  const started = now();
  const defs = definitions.map(d => prepareDef(d, names));
  const reg = registry(names, defs);
  // The specifications definitions are located at, where a group looks for candidates (see blocksOf).
  const P = { defs, reg, byId: new Map(defs.map(d => [d.id, d])), coverOf: new Map(),
    located: new Set(defs.flatMap(d => d.params.flat().map(p => p.spec))) };
  for (const d of defs) if (!d.error) for (const p of d.covers) P.coverOf.set(p, d);
  // A definition whose rows some row cites by label, after a dot.
  const dotted = new Set();
  const dots = n => { if (n.k === 'dot') dotted.add(n.n); partsOf(n).forEach(dots); };
  for (const d of defs) if (!d.error) d.rows.forEach(r => dots(r.ast));
  for (const d of defs) d.cited = [...d.labels].some(l => dotted.has(l));
  P.known = knownNames(entered, defs, reg);
  P.groups = plan(defs, reg);
  const S = stateFor(P, entered);
  runUpTo(S, P.groups.length);
  const keptAside = Object.keys(S.entered).filter(id => S.recs[id] && argsOf(S.recs[id]).some(a => !S.recs[a.at]));
  // The state's own records, where none is kept aside; nothing changes them once they're worked out.
  let records = S.recs;
  if (keptAside.length) {
    const aside = new Set(keptAside);
    records = {};
    for (const id in S.recs) if (!aside.has(id)) records[id] = S.recs[id];
  }
  const computed = {}, covered = {}, errors = [];
  for (const rows of S.rows.values()) for (const row of rows) {
    const said = { def: row.def, row: row.row ?? null, label: row.label ?? null, holds: row.holds ?? [] };
    if (row.entered) covered[row.entered] = { ...said, value: row.error ?? row.formula ?? null, agrees: !row.error && sameValue(S, row.entered, row.formula) };
    else if (row.error) errors.push({ def: row.def, id: row.id, ...(row.args ? { args: row.args } : { at: row.at }), error: row.error });
    else if (S.recs[row.id]) computed[row.id] = { ...said, stage: row.stage };
  }
  const defErrors = Object.fromEntries(defs.filter(d => d.error).map(d => [d.id, d.error]));
  const loops = {};
  for (const g of P.groups) for (const x of g.reads) push2(loops, x.def, { row: x.row, from: x.from, to: x.to, monotone: x.monotone });
  return { records, computed, covered, errors, rows: Object.fromEntries(S.rows), defErrors, loops, keptAside,
    order: P.groups.map(g => g.defs.map(d => d.id)), steps: S.steps, ms: now() - started, state: S };
}
const push2 = (obj, key, value) => (obj[key] ??= []).push(value);

// Whether an entered record's output is what the rows give.
function sameValue(S, id, out) {
  const r = S.recs[id];
  if (out === undefined || out === null) return false;
  if (isTag(r)) return r.tag === out;
  if (isChoice(r)) return typeof out === 'string' && same(r.choice, out);
  return equal(scalar(S, recOf(id)), out);
}

// Works out an expression at a record, as if it were the formula of an entry located there, or of the given
// definition at one of its candidates (`at` being a record there, or objects by edge).
function evaluateAt(R, text, at, defId) {
  const S = R.state;
  const f = splitFormula(text);
  let ast;
  try { ast = parseExpression(f.body, f.offset); }
  catch (e) { return err('#SYNTAX', e.message); }
  const d = defId && S.P.byId.get(defId);
  let v;
  if (d?.isRelation) {
    const cand = candidateAt(S, d, at);
    if (!cand) return err('#VALUE!', 'That isn’t one of the definition’s candidates.');
    v = safeEv(ast, contextFor(S, d, cand));
  } else v = safeEv(ast, { S, def: d ?? null, self: { loc: at }, at: at ? recOf(at) : null, lets: null });
  return f.kind === 'implies' ? truth(S, v) : v;
}

// How a value reads. Numbers can be shown as percentages.
function formatValue(R, v, { percent = false } = {}) {
  const S = R.state;
  if (isErr(v)) return v.code;
  if (Array.isArray(v)) return v.length ? v.map(x => formatValue(R, x, { percent })).join('; ') : '(empty list)';
  if (isRec(v)) {
    if (v.id === null) return '(blank)';
    const o = output(S, v.id);
    return isRec(o) ? nameOf(S, o.id) : formatValue(R, o, { percent });
  }
  if (v === null || v === undefined) return '(blank)';
  if (typeof v === 'number') return percent ? `${tidyNumber(v * 100)}%` : String(tidyNumber(v));
  return toText(S, v);
}

return {
  computeState, ground, groundText, evaluateRow, diff, check, suggest, evaluateAt, formatValue,
  renameName, relabel, optionsWritten, coversOf, locationKey, parameterizationKey, computedId, argKey, splitFormula, tidyArrow,
  place: (R, id) => placeOf(R.state, id), nameOf: (R, id) => nameOf(R.state, id),
  formOf: (R, id) => formOfRecord(R.state, R.state.recs[id]),
  isError: isErr, FUNCTION_NAMES: Object.keys(FUNCTIONS),
};

})();
