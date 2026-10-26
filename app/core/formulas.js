// Formulas: records worked out from other records, the way a spreadsheet works out cells (see formulas.md).
//
// Formulas.computeState(entered, definitions, names) works out a chart's computed state from its entered
// records. Formulas.evaluateAt(computed, text, at) works out one expression at a record, for a scratch box.
// Nothing here touches the page, so the panel and the chart can use it the way the formula lab does.
// It needs common.js (norm, same, clean) and model.js (the record predicates, argsOf, formatDate).
//
// A definition is a computed entry or relation: what it covers, and its formula. It's plain JSON, to live
// in the state beside the styles and required entries:
//   { id, name, type: 'field' | 'choice' | 'tag', datatype (for a field), self (may relate a thing to itself),
//     covers: [parameterization, ...]            model.js parameterization() keys, so rekey() can move them
//     formula: '= …'                             a value formula; or, for a tag,
//     implications: [{ label, formula: '← …' }] }
// An entry's name is its edge label. A relation's name is its pilot name (below), and its parameters go
// in that relation's order. Instead of `covers`, a definition can give locations, which are easier to write:
//   at: [location, ...]                          an entry: where it can be located
//   args: [{ edge, at: [location, ...] }]        a relation: its parameters, in order
// A location is a path from a kind, like 'Entity › Entity Type: Limited Partnership'. Each segment is a
// choice ('Edge: Option'), an attested tag ('Edge') or a ruled-out one ('Not Edge').
//
// `names` holds the pilot's names for relations and their lists of relatives (formulas.md, "Names for
// relations and lists"), keyed by output type and edge labels:
//   { relations: [{ name, type, edges: [...], lists: { [from edge]: { [listed edge]: list name } } }] }
// A list without a name goes by the edge label of the role it lists.

const Formulas = (() => {

// ---- Values ----
// BLANK is null. Numbers, text and TRUE/FALSE stand for themselves. A record is { t: 'rec', id, link }, with
// `link` the relation record it was reached through when it came from a list of relatives. A relation call
// that finds nothing gives a record whose id is null, which reads as BLANK. A date is { t: 'date', iso },
// a list is an array, and an error is { t: 'err', code, msg }.

const err = (code, msg) => ({ t: 'err', code, msg });
const isErr = v => v?.t === 'err';
const isRec = v => v?.t === 'rec';
const isDate = v => v?.t === 'date';
const recOf = (id, link = null) => ({ t: 'rec', id, link });
const circular = () => err('#CIRCULAR!', 'This depends on itself.');

// Names and labels compared without regard to case (common.js's norm), kept once worked out: the same few
// are compared over and over as a chart is worked out.
const normals = new Map();
function normal(s) {
  let n = normals.get(s);
  if (n === undefined) {
    if (normals.size > 50000) normals.clear();
    normals.set(s, n = norm(s));
  }
  return n;
}

// Numbers as the chart stores them: 1,000, $750,000,000, 71.6%.
function readNumber(s) {
  const m = /^\s*([-+]?)\$?((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+)(%?)\s*$/.exec(String(s));
  if (!m) return null;
  const n = Number(m[2].replace(/,/g, '')) * (m[1] === '-' ? -1 : 1);
  return m[3] ? n / 100 : n;
}

// ---- Reading formulas ----

class FormulaError extends Error {
  constructor(message, pos) { super(message); this.pos = pos; }
}

const KEYWORDS = new Set(['AND', 'OR', 'NOT', 'IN', 'TRUE', 'FALSE']);

// Numbers take `$` and `%` as typed in the chart. A thousands comma only counts after a `$`, since
// `IF(x, 1,000)` would otherwise be ambiguous.
function tokenize(src) {
  const toks = [];
  let i = 0, m;
  while (i < src.length) {
    const rest = src.slice(i);
    if (/^\s/.test(rest)) { i++; continue; }
    if ((m = /^\$(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?%?/.exec(rest)) || (m = /^(?:\d+(?:\.\d+)?|\.\d+)%?/.exec(rest))) {
      toks.push({ k: 'num', v: readNumber(m[0]), pct: m[0].endsWith('%'), pos: i });
      i += m[0].length;
    } else if (rest[0] === '"') {
      let j = i + 1, s = '';
      for (;;) {
        if (j >= src.length) throw new FormulaError('A text in quotes isn’t closed.', i);
        if (src[j] === '"') { if (src[j + 1] === '"') { s += '"'; j += 2; continue; } break; }
        s += src[j++];
      }
      toks.push({ k: 'str', v: s, pos: i });
      i = j + 1;
    } else if (rest[0] === '[') {
      const j = src.indexOf(']', i);
      if (j < 0) throw new FormulaError('A name in brackets isn’t closed.', i);
      toks.push({ k: 'name', v: clean(src.slice(i + 1, j)), pos: i, end: j + 1 });
      i = j + 1;
    } else if ((m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(rest))) {
      const w = m[0].toUpperCase();
      toks.push(KEYWORDS.has(w) ? { k: 'kw', v: w, pos: i } : { k: 'name', v: m[0], pos: i, end: i + m[0].length });
      i += m[0].length;
    } else if ((m = /^(<>|<=|>=|[-+*/&=<>(),.{}:@])/.exec(rest))) {
      toks.push({ k: 'op', v: m[0], pos: i });
      i += m[0].length;
    } else throw new FormulaError(`“${rest[0]}” isn’t part of a formula.`, i);
  }
  toks.push({ k: 'end', pos: src.length });
  return toks;
}

// Precedence, loosest first: OR, AND, NOT, comparisons and IN, &, + and -, * and /, unary minus, then dots
// and calls. A name directly followed by parentheses is a call: a function, or a relation by its name.
function parseExpression(src) {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const next = () => toks[p++];
  const isOp = v => peek().k === 'op' && peek().v === v;
  const isKw = v => peek().k === 'kw' && peek().v === v;
  const expect = v => { if (!isOp(v)) throw new FormulaError(`Expected “${v}”.`, peek().pos); next(); };
  const CMP = ['=', '<>', '<', '>', '<=', '>='];

  const or = () => { let a = and(); while (isKw('OR')) { next(); a = { k: 'or', a, b: and() }; } return a; };
  const and = () => { let a = not(); while (isKw('AND')) { next(); a = { k: 'and', a, b: not() }; } return a; };
  const not = () => isKw('NOT') ? (next(), { k: 'not', x: not() }) : cmp();
  const cmp = () => {
    let a = concat();
    for (;;) {
      if (peek().k === 'op' && CMP.includes(peek().v)) { const op = next().v; a = { k: 'cmp', op, a, b: concat() }; }
      else if (isKw('IN')) { next(); a = { k: 'in', a, b: concat() }; }
      else return a;
    }
  };
  const concat = () => { let a = add(); while (isOp('&')) { next(); a = { k: 'bin', op: '&', a, b: add() }; } return a; };
  const add = () => { let a = mul(); while (isOp('+') || isOp('-')) { const op = next().v; a = { k: 'bin', op, a, b: mul() }; } return a; };
  const mul = () => { let a = unary(); while (isOp('*') || isOp('/')) { const op = next().v; a = { k: 'bin', op, a, b: unary() }; } return a; };
  const unary = () => isOp('-') || isOp('+') ? { k: 'neg', op: next().v, x: unary() } : postfix();
  const postfix = () => {
    let x = primary();
    for (;;) {
      if (isOp('.')) {
        next();
        const t = next();
        if (t.k !== 'name') throw new FormulaError('Expected a name after the dot.', t.pos);
        x = { k: 'dot', x, name: t.v, n: normal(t.v) };
      } else if (isOp('(') && x.k === 'name') {
        next();
        x = { k: 'call', name: x.name, args: callArgs() };
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
    if (t.k === 'num' || t.k === 'str') return { k: 'lit', v: t.v, pct: t.pct };
    if (t.k === 'kw' && (t.v === 'TRUE' || t.v === 'FALSE')) return { k: 'lit', v: t.v === 'TRUE' };
    if (t.k === 'name') return { k: 'name', name: t.v, n: normal(t.v) };
    if (t.k === 'op' && t.v === '@') return { k: 'at' };
    if (t.k === 'op' && t.v === '(') { const x = or(); expect(')'); return x; }
    if (t.k === 'op' && t.v === '{') {
      const items = [];
      if (!isOp('}')) for (;;) { items.push(or()); if (!isOp(',')) break; next(); }
      expect('}');
      return { k: 'arr', items };
    }
    if (t.k === 'end') throw new FormulaError('The formula ends too soon.', t.pos);
    throw new FormulaError(`Didn’t expect “${t.v}” here.`, t.pos);
  };

  const ast = or();
  if (peek().k !== 'end') throw new FormulaError(`Didn’t expect “${peek().v}” here.`, peek().pos);
  return ast;
}

// A formula's kind from how it starts: `=` for a value formula, `←` (or `<-` as typed) for an implication.
function splitFormula(text) {
  const s = String(text ?? '').trim();
  if (s.startsWith('←')) return { kind: 'implies', body: s.slice(1) };
  if (s.startsWith('<-')) return { kind: 'implies', body: s.slice(2) };
  if (s.startsWith('=')) return { kind: 'value', body: s.slice(1) };
  return { kind: null, body: s };
}

// Typing `<-` at the start of a formula turns it into `←`.
const tidyArrow = text => String(text ?? '').replace(/^(\s*)<-/, '$1←');

// ---- Locations and parameterizations ----
// Keys follow model.js: a location's specification is specKey(), and a parameterization is a sorted list of
// [edge, location specification] pairs, each serialized.

// 'Entity › Entity Type: Limited Partnership' as a kind and the segments below it.
function parseLocation(text) {
  const [kind, ...segs] = String(text).split(/\s*[›>]\s*/).map(clean).filter(Boolean);
  return {
    text: clean(text), kind,
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

// The parameterizations a definition written with locations covers: for a relation, every combination of
// its parameters' locations.
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

// The parameterizations of the specifications a specification key runs through, itself included: a
// specification's key is its root label and its parameterization's pairs, sorted as a parameterization
// key sorts them.
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
  const nameId = (S.byAt.get(id) ?? []).find(e => isField(S.recs[e]) && same(S.recs[e].edge, 'Name'));
  return nameId ? String(S.recs[nameId].value) : `${r.kind} ${id}`;
}

function segmentOf(S, id) {
  const r = S.recs[id];
  if (isObject(r)) return nameOf(S, id);
  if (isRelation(r)) return r.args.map(a => a.edge).join(' · ');
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

// Lookups kept from before (see remembered) are let go when a record comes or goes, unless the step being
// worked out keeps track of what each one read (see runStep).
function addRecord(S, id, r, known) {
  if (S.forgetting) S.memo?.clear();
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
  S.indexed.set(id, { objs, edges, sig, call, key: known?.key ?? null, seq: S.seq++ });
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

// The relation records at an object that can make a list called `n` (or every one), in the order they
// came in.
function relationsFor(S, obj, n = null) {
  let out = null, merged = false;
  for (const [sig, rids] of S.byObject.get(obj) ?? []) if (rids.length && (n === null || listNamesOf(S, sig).has(n))) {
    merged = !!out;
    out = out ? out.concat(rids) : rids;
  }
  if (merged) out.sort((a, b) => S.indexed.get(a).seq - S.indexed.get(b).seq);
  return out ?? [];
}

// Takes a record back out, as when a step is worked out again.
function removeRecord(S, id) {
  const r = S.recs[id];
  if (!r) return;
  if (S.forgetting) S.memo?.clear();
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

// A relation's pilot name and list names belong to its form (model.html §2): its specification's shape,
// with every node label erased, and its sort. Names given without a form fall back on the relation's
// output type and edge labels, its signature. Records don't change, so each one's is worked out once.
const signature = (type, edges) => `${type}:${edges.map(normal).sort().join('|')}`;
const sigCache = new WeakMap();
function signatureOf(r) {
  if (!sigCache.has(r)) sigCache.set(r, signature(typeOf(r), r.args.map(a => a.edge)));
  return sigCache.get(r);
}
// A record's form, keyed as model.js keys forms: [sort, ...[edge, shape of its location]], sorted. A
// record's shape depends on its locations' shapes, and a location can move between one working-out and the
// next, so shapes and forms are kept per state. A record whose location isn't there yet, being a computed
// record not yet worked out, has no form yet (null), and that isn't kept.
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

// ---- Looking names up ----

// While a formula is worked out, the entries and relation records it reads are noted, to say why its
// record is there (see reading).
const note = (S, id) => { if (S.reads) S.reads.ids.push(id); };

// While a step with implications is worked out (see settleStep), a lookup by a name the step's own
// definitions give records under notes its key, found or not: that's what the formula being worked out
// depends on, since one of the step's candidates could turn up there. `kind` is how it was looked for:
// 'entry' (at a location, by name), 'lists' (a list of relatives at a location), 'calls' (a relation call,
// by callKey), and, for finding candidates (see holdsWhere), 'rel' (a relation's records with one argument
// given, by relation name, edge and object), 'held' (the same, holding a label) and 'inverse' (whose list
// of a name an object is on). candidateKeys gives the keys under which a candidate could turn up.
function depend(S, kind, name, key) {
  if (S.reads && S.dep?.[kind].has(name)) { S.reads.keys.push(`${kind}|${key}`); S.dep.watched.add(kind); }
}

// What a name gives where nothing has it: an empty list for a list the schema has somewhere, BLANK for
// any other name the schema has somewhere, and an error for a name it doesn't have at all.
function missing(S, name) {
  const n = normal(name);
  if (S.P.known.lists.has(n)) return [];
  if (S.P.known.values.has(n)) return null;
  return err('#NAME?', `Nothing is called ${name}.`);
}

// The relatives listed under `n` at a location: the other arguments' objects, each remembering the relation
// record that links it. A ruled-out tag doesn't make a relative. Null if no relation here gives that list.
// An object also has the lists of relations whose parameter sits below it, the way a relation call fills a
// parameter through the object's record there: a fund's General Partners, though the relation is located
// at its Entity Type. A list answers to its name and also to the edge label it lists, so a formula written
// before the list was named keeps working.
const listAt = (S, id, n) => remembered(S, `list|${id}|${n}`, () => { depend(S, 'lists', n, `${id}|${n}`); return listHere(S, id, n); });
function listHere(S, id, n) {
  let hit = false;
  const items = [];
  const onObject = isObject(S.recs[id]);
  for (const rid of onObject ? relationsFor(S, id, n) : S.relsAt.get(id) ?? []) {
    const r = S.recs[rid];
    for (const { own, other, list, alias } of listsOf(S, r)) {
      if ((list !== n && alias !== n) || (onObject ? objectOf(S, own.at) !== id : own.at !== id)) continue;
      hit = true;
      if (isTag(r) && r.tag !== true) continue;
      items.push(recOf(objectOf(S, other.at), rid));
      note(S, rid);
    }
  }
  return hit ? items : null;
}

// The lists of relatives a relation record makes: for each argument, seen from each other argument, the
// list's name, normalized. And its arguments by normalized edge label. Worked out once per record, once
// its form is known (see formOfRecord).
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

// A name on the relation record a relative was reached through: its arguments by edge label, its output
// by the relation's name, and the entries located at it. Where a relation is named like one of its edges
// (Close Affiliate), the edge wins; a relation call still reaches its output.
function linkLookup(S, rid, n, name) {
  const r = S.recs[rid];
  if (!r) return null;
  const found = [];
  const arg = argByEdge(r, n);
  if (arg) found.push(recOf(objectOf(S, arg.at)));
  else if (relationOf(S, r)?.n === n) found.push(recOf(rid));
  depend(S, 'entry', n, `${rid}|${n}`);
  const pending = forceEntry(S, rid, n);
  if (pending) return { v: pending };
  const entry = S.byAtName.get(`${rid}|${n}`);
  if (entry) { found.push(recOf(entry)); note(S, entry); }
  else if (S.failed.has(`${rid}|${n}`)) found.push(S.failed.get(`${rid}|${n}`));
  if (found.length > 1) return { v: ambiguous(name) };
  return found.length ? { v: found[0] } : null;
}

// A name on one record: its entries by label, its lists of relatives by name, and a relation record's
// arguments by edge label.
function ownLookup(S, id, n, name) {
  const found = [];
  depend(S, 'entry', n, `${id}|${n}`);
  const pending = forceEntry(S, id, n) ?? forceLists(S, id, n);
  if (pending) return { v: pending };
  const entry = S.byAtName.get(`${id}|${n}`);
  if (entry) { found.push(recOf(entry)); note(S, entry); }
  else if (S.failed.has(`${id}|${n}`)) found.push(S.failed.get(`${id}|${n}`));
  const list = listAt(S, id, n);
  if (list) found.push(list);
  const r = S.recs[id];
  const arg = isRelation(r) && argByEdge(r, n);
  if (arg) found.push(recOf(objectOf(S, arg.at)));
  if (found.length > 1) return { v: ambiguous(name) };
  return found.length ? { v: found[0] } : null;
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

// A name on its own: a LET name; in a relation's formula, one of its arguments, as an object; in an
// entry's formula, a name on its location, looked up the path.
function lookupBare(c, name, n = normal(name)) {
  for (let l = c.lets; l; l = l.up) if (l.n === n) return l.v;
  if (c.self.args) return c.self.args.has(n) ? recOf(c.self.args.get(n)) : err('#NAME?', `${name} isn’t one of this relation’s arguments.`);
  return lookupOn(c.S, recOf(c.self.loc), name, n);
}

// ---- Turning values into one value ----

// Where one value is expected: a list of one is its item, an empty list is BLANK, and a record is its
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
const toList = v => isErr(v) ? v : v === null ? [] : !Array.isArray(v) ? [v] : v.some(Array.isArray) ? v.flatMap(flatten) : v;

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
  if (isDate(v)) return formatDate(v.iso);
  if (isRec(v)) return nameOf(S, v.id);
  return String(v);
}

function describe(S, v) {
  if (v === null) return 'BLANK';
  if (isRec(v)) return v.id === null ? 'BLANK' : nameOf(S, v.id);
  if (Array.isArray(v)) return `a list of ${v.length}`;
  if (typeof v === 'string') return `“${v}”`;
  return toText(S, v);
}

// ---- Comparing ----

const near = (a, b) => Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(a), Math.abs(b));

// As in Excel, BLANK equals 0, empty text and FALSE. Objects are equal only to themselves, and text
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

// BLANK takes the least value of the other side's kind, as in Excel: 0, empty text, FALSE, or a date
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
// A context `c` holds the state S, `self` (a relation's arguments by edge, as objects, or an entry's
// location), `at` for `@`, and any LET names.

function ev(node, c) {
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
      const x = toNumber(S, ev(node.x, c));
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
    case 'in': {
      const a = scalar(S, ev(node.a, c));
      if (isErr(a)) return a;
      const list = toList(ev(node.b, c));
      if (isErr(list)) return list;
      if (isRec(a)) { const ids = objectIds(S, list); if (ids) return ids.has(a.id); }
      for (const x of list) { const s = scalar(S, x); if (isErr(s)) return s; if (equal(a, s)) return true; }
      return false;
    }
    case 'bin': return arithmetic(S, node.op, ev(node.a, c), ev(node.b, c));
  }
  return err('#VALUE!', 'Unknown expression.');
}

// A long list of objects, like REACH's, as the set of their ids, for IN: worked out once per list, since a
// lookup gives the same list until the state changes. An object is in it just when its id is.
const listIds = new WeakMap();
function objectIds(S, list) {
  if (list.length < 8) return null;
  if (!listIds.has(list)) listIds.set(list, list.every(x => isRec(x) && x.id && isObject(S.recs[x.id])) ? new Set(list.map(x => x.id)) : null);
  return listIds.get(list);
}

function arithmetic(S, op, a, b) {
  if (op === '&') {
    const x = toText(S, a), y = toText(S, b);
    return isErr(x) ? x : isErr(y) ? y : x + y;
  }
  a = scalar(S, a);
  if (isErr(a)) return a;
  b = scalar(S, b);
  if (isErr(b)) return b;
  // Dates subtract to a number of days, and move by a number of days.
  if (isDate(a) && isDate(b) && op === '-') return dayOf(a) - dayOf(b);
  if (isDate(a) && (op === '+' || op === '-')) {
    const n = toNumber(S, b);
    return isErr(n) ? n : fromDay(dayOf(a) + (op === '+' ? n : -n));
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

// MIN and MAX: of numbers, or of dates (the earliest or latest), skipping blanks and text. With nothing
// to compare, BLANK, which counts as 0 where a number is wanted, as Excel's 0 does, and as no date at all
// where a date is.
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

// The name a step argument gives, for REACH and LOOKTHROUGH.
const stepName = x => x.k === 'name' ? x.name : null;

// The functions in formulas.md's table. Each gets its argument nodes, so that IF, FILTER and the like can
// work out only what they need, and with `@` set to each item.
const FUNCTIONS = {
  IF(a, c) {
    const bad = arity('IF', a, 2, 3);
    if (bad) return bad;
    const t = truth(c.S, ev(a[0].x, c));
    if (isErr(t)) return t;
    return t ? ev(a[1].x, c) : a[2] ? ev(a[2].x, c) : false;
  },
  IFS(a, c) {
    if (!a.length || a.length % 2) return err('#VALUE!', 'IFS takes pairs of a condition and a value.');
    for (let i = 0; i < a.length; i += 2) {
      const t = truth(c.S, ev(a[i].x, c));
      if (isErr(t)) return t;
      if (t) return ev(a[i + 1].x, c);
    }
    return null;
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
  ISRULEDOUT(a, c) {
    const bad = arity('ISRULEDOUT', a, 1);
    if (bad) return bad;
    const v = asRec(c.S, ev(a[0].x, c));
    if (isErr(v)) return v;
    const r = v?.id ? c.S.recs[v.id] : null;
    return !!r && isTag(r) && r.tag === false;
  },
  COUNT(a, c) {
    const items = flatArgs(a, c);
    return isErr(items) ? items : items.filter(x => x !== null).length;
  },
  SUM(a, c) {
    const xs = numbersOf(a, c);
    return isErr(xs) ? xs : xs.reduce((s, x) => s + x, 0);
  },
  MIN(a, c) { return extremeOf('MIN', a, c, -1); },
  MAX(a, c) { return extremeOf('MAX', a, c, 1); },
  AVERAGE(a, c) {
    const xs = numbersOf(a, c);
    if (isErr(xs)) return xs;
    return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : err('#DIV/0!', 'Nothing to average.');
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
    if (isErr(v) || !v?.id) return v?.id ? v : isErr(v) ? v : null;
    return c.S.recs[objectOf(c.S, v.id)]?.kind ?? null;
  },
  // The object whose Name is the text, without regard to case: BLANK if there's none, an error if several.
  OBJECT(a, c) {
    const bad = arity('OBJECT', a, 1);
    if (bad) return bad;
    const name = toText(c.S, ev(a[0].x, c));
    if (isErr(name)) return name;
    const hits = remembered(c.S, `object|${normal(name)}`, () => Object.keys(c.S.recs).filter(id => {
      if (!isObject(c.S.recs[id])) return false;
      depend(c.S, 'entry', 'name', `${id}|name`);
      const nameId = c.S.byAtName.get(`${id}|name`);
      if (!nameId) return false;
      note(c.S, nameId);
      return same(c.S.recs[nameId].value, name);
    }));
    if (hits.length > 1) return err('#VALUE!', `More than one thing is called ${name}.`);
    return hits.length ? recOf(hits[0]) : null;
  },
  // Everything reached from the start by following the named list one or more times.
  REACH(a, c) {
    const bad = arity('REACH', a, 2);
    if (bad) return bad;
    const step = stepName(a[1].x);
    if (!step) return err('#VALUE!', 'REACH’s second argument names a list, like [Controlled Companies].');
    const starts = toList(ev(a[0].x, c));
    if (isErr(starts)) return starts;
    const queue = [];
    for (const s of starts) { const r = asRec(c.S, s); if (isErr(r)) return r; if (r?.id) queue.push(r.id); }
    const stepN = a[1].x.n;
    return remembered(c.S, `reach|${queue.join(',')}|${stepN}`, () => {
      const seen = new Set(), out = [];
      while (queue.length) {
        const items = toList(lookupOn(c.S, recOf(queue.shift()), step, stepN));
        if (isErr(items)) return items;
        for (const item of items) {
          if (!isRec(item) || !item.id || seen.has(item.id)) continue;
          seen.add(item.id);
          out.push(recOf(item.id));
          queue.push(item.id);
        }
      }
      return out;
    });
  },
  // The sum, over every way of getting from `from` to `to` by following the list, of the product of the
  // factor along the way. Loops make infinitely many ways; the sum is taken to its limit.
  LOOKTHROUGH(a, c) {
    const bad = arity('LOOKTHROUGH', a, 4);
    if (bad) return bad;
    const step = stepName(a[2].x), factor = stepName(a[3].x);
    if (!step || !factor) return err('#VALUE!', 'LOOKTHROUGH’s third and fourth arguments name a list and a factor, like Holdings and Percentage.');
    const stepN = a[2].x.n, factorN = a[3].x.n;
    const from = asRec(c.S, ev(a[0].x, c)), to = asRec(c.S, ev(a[1].x, c));
    if (isErr(from)) return from;
    if (isErr(to)) return to;
    if (!from?.id || !to?.id) return null;
    const total = lookThrough(c.S, from.id, step, stepN, factor, factorN);
    if (isErr(total)) return total;
    return total.has(to.id) ? total.get(to.id) : null;
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
  // Whether the tag is attested, and one of the implications with these labels holds there.
  IMPLIEDBY(a, c) {
    if (a.length < 2) return err('#VALUE!', 'IMPLIEDBY takes a tag and one or more labels.');
    const v = asRec(c.S, ev(a[0].x, c));
    if (isErr(v)) return v;
    const r = v?.id ? c.S.recs[v.id] : null;
    if (!r) return false;
    if (!isTag(r)) return err('#VALUE!', 'IMPLIEDBY asks about a tag.');
    if (r.tag !== true) return false;
    const held = c.S.prov.get(keyOf(r)) ?? new Set();
    for (const x of a.slice(1)) {
      const label = toText(c.S, ev(x.x, c));
      if (isErr(label)) return label;
      if (held.has(normal(label))) return true;
    }
    return false;
  },
  TODAY(a) { return arity('TODAY', a, 0) ?? { t: 'date', iso: isoOf(new Date()) }; },
  DATE(a, c) {
    const bad = arity('DATE', a, 3);
    if (bad) return bad;
    const [y, m, d] = a.map(x => toNumber(c.S, ev(x.x, c)));
    const e = [y, m, d].find(isErr);
    return e ?? { t: 'date', iso: isoOf(new Date(Date.UTC(y, m - 1, d))) };
  },
  YEAR(a, c) { return datePart(a, c, 'YEAR', 0); },
  MONTH(a, c) { return datePart(a, c, 'MONTH', 1); },
  DAY(a, c) { return datePart(a, c, 'DAY', 2); },
  // As in Excel: the date some months on, kept within the month it lands in; and the last day of that month.
  EDATE(a, c) { return monthsOn(a, c, 'EDATE', false); },
  EOMONTH(a, c) { return monthsOn(a, c, 'EOMONTH', true); },
  // The next date with a month and day, on or after a date (today, if none is given): when an annual
  // deadline next falls. February 29 falls on February 28 in other years.
  NEXTDATE(a, c) {
    const bad = arity('NEXTDATE', a, 2, 3);
    if (bad) return bad;
    const [m, d] = a.slice(0, 2).map(x => toNumber(c.S, ev(x.x, c)));
    const e = [m, d].find(isErr);
    if (e) return e;
    const from = a[2] ? scalar(c.S, ev(a[2].x, c)) : { t: 'date', iso: isoOf(new Date()) };
    if (isErr(from)) return from;
    if (!isDate(from)) return err('#VALUE!', 'NEXTDATE’s third argument is a date.');
    const at = y => { const last = new Date(Date.UTC(y, m, 0)).getUTCDate(); return isoOf(new Date(Date.UTC(y, m - 1, Math.min(d, last)))); };
    const y = Number(from.iso.slice(0, 4));
    return { t: 'date', iso: at(y) >= from.iso ? at(y) : at(y + 1) };
  },
  // As in Excel, without holidays: the date some working days (Monday to Friday) after a date, or before
  // it for a negative count. WORKDAY(d - 1, 1) is the first working day on or after d, where a deadline
  // that falls on a weekend moves to.
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

// LOOKTHROUGH from one record: for each record reached by following the list, the sum over every way of
// getting there of the product of the factor along the way. The same from a start for every `to`, so it's
// kept as a lookup is (see remembered).
function lookThrough(S, from, step, stepN, factor, factorN) {
  return remembered(S, `through|${from}|${step}|${factor}`, () => {
    const out = new Map(), queue = [from], seen = new Set([from]);
    while (queue.length) {
      const u = queue.shift(), edges = [];
      const items = toList(lookupOn(S, recOf(u), step, stepN));
      if (isErr(items)) return items;
      for (const item of items) {
        if (!isRec(item) || !item.id) continue;
        const f = toNumber(S, lookupOn(S, item, factor, factorN));
        if (isErr(f)) return f;
        edges.push([item.id, f]);
        if (!seen.has(item.id)) { seen.add(item.id); queue.push(item.id); }
      }
      out.set(u, edges);
    }
    const total = new Map();
    let wave = new Map([[from, 1]]);
    for (let k = 0; wave.size; k++) {
      if (k > 10000) return err('#VALUE!', 'The look-through doesn’t settle: a loop multiplies to 100% or more.');
      const next = new Map();
      for (const [u, w] of wave) for (const [v, f] of out.get(u) ?? []) next.set(v, (next.get(v) ?? 0) + w * f);
      let size = 0;
      for (const [v, w] of next) { total.set(v, (total.get(v) ?? 0) + w); size = Math.max(size, Math.abs(w)); }
      wave = size < 1e-15 ? new Map() : next;
    }
    return total;
  });
}

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
  if (node.fn === undefined) node.fn = FUNCTIONS[node.name.toUpperCase()] ?? null;
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
  // The call's key (see callKey) and the records it can find (see indexByObjects) share their arguments.
  const pairs = [...ids].map(([edge, g]) => `${edge}=${objectOf(S, g)}`).sort().join('&');
  const key = `${rel.n}|${pairs}`;
  depend(S, 'calls', rel.n, key);
  const pending = forceRelation(S, key);
  if (pending) return pending;
  for (const rid of S.relsByCall.get(`${rel.sig}|${pairs}`) ?? []) {
    const r = S.recs[rid];
    // Records with the relation's edges but of another form are another relation.
    if (rel.form && formOfRecord(S, r) !== rel.form) continue;
    if (fitsCall(S, r, ids)) { note(S, rid); return recOf(rid); }
  }
  // A value formula that gave an error there passes it on.
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

// Whether a record (or a value formula's failure, with its args) is the one a call with these arguments
// finds: an object given fills a parameter through its record there, and any other record fills it as is.
// An argument given as undefined is left open.
const fitsCall = (S, r, ids) => r.args.every(x => {
  const g = ids.get(normal(x.edge));
  return g === undefined || (isObject(S.recs[g]) ? objectOf(S, x.at) === g : x.at === g);
});


// ---- Definitions, and the order they're worked out in ----

const typeOfDef = d => d.type === 'field' ? 'field' : d.type === 'choice' ? 'choice' : 'tag';

// Formulas parsed already, by their text: the same definitions are worked out after every edit.
const parsedCache = new Map();
function parseCached(body) {
  if (!parsedCache.has(body)) {
    if (parsedCache.size > 500) parsedCache.clear();
    parsedCache.set(body, parseExpression(body));
  }
  return parsedCache.get(body);
}

// Parses a definition's formulas and what it covers. Problems are kept on it as `error`.
function prepareDef(def, names) {
  const d = { ...def, error: null, covers: [], params: [], edges: [def.name] };
  try {
    d.covers = coversOf(def);
    d.params = d.covers.map(paramsOf);
    d.isRelation = def.args ? true : d.params.some(ps => ps.length > 1);
    // A relation's edges as written, in its own order: from its locations, or else from its pilot name.
    const named = (names?.relations ?? []).find(r => same(r.name, def.name));
    if (d.isRelation) d.edges = def.args?.map(a => a.edge) ?? named?.edges ?? d.params[0]?.map(p => p.edge) ?? [];
    if (def.implications?.length && d.type === 'tag') {
      d.imps = def.implications.map(i => {
        const f = splitFormula(i.formula);
        if (f.kind !== 'implies') throw new FormulaError(`The implication “${i.label}” should start with ←.`, 0);
        return { label: clean(i.label), ast: parseCached(f.body) };
      });
    } else {
      const f = splitFormula(def.formula);
      if (f.kind === 'implies') throw new FormulaError(d.type === 'tag' ? 'Write a tag’s implications as separate rows.' : 'Only a tag can be implied; start this formula with =.', 0);
      if (f.kind !== 'value') throw new FormulaError('A formula starts with = (or ← for a tag’s implication).', 0);
      d.ast = parseCached(f.body);
    }
  } catch (e) {
    d.error = e instanceof FormulaError ? e.message : String(e);
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
    if (n.k === 'name') { if (!own.has(normal(n.name))) add(n.name); return; }
    if (n.k === 'dot') { walk(n.x, w); add(n.name); return; }
    if (n.k === 'call') {
      const f = n.name.toUpperCase();
      if (!FUNCTIONS[f]) add(n.name);
      n.args.forEach((x, i) => walk(x.x, w || (f === 'WITHOUT' && i === 1)));
      return;
    }
    walk(n.x, w); walk(n.a, w); walk(n.b, w);
    n.items?.forEach(x => walk(x, w));
  };
  walk(ast, false);
  return { refs, inWithout };
}

// What a definition provides names for: its own name, and for a relation, its lists of relatives, which
// also answer to the edge labels they list.
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
    rels.push({ name: d.name, type: typeOfDef(d), edges: d.edges, form: d.form, lists: {} });
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

// Every name the schema has somewhere, so a name missing at one record can read as BLANK there.
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
    if (d.isRelation) addRelation(typeOfDef(d), d.edges);
    else values.add(normal(d.name));
    for (const ps of d.params) for (const p of ps) edgesInSpec(p.spec).forEach(e => values.add(e));
  }
  for (const rel of reg.byName.values()) addRelation(rel.type, rel.edges, rel);
  return { lists, values };
}

// Groups definitions that depend on each other, dependencies first (Tarjan's algorithm), whatever order
// they're listed in. A definition depends on those providing the names its formulas use, and on those
// covering the specifications its locations run through, whose records it's located at.
function plan(defs, reg) {
  const provides = new Map(), covering = new Map();
  for (const d of defs) for (const n of namesProvided(d, reg)) push(provides, n, d);
  for (const d of defs) for (const p of d.covers) push(covering, p, d);
  const deps = new Map();
  for (const d of defs) {
    const own = new Set(d.isRelation ? d.edges.map(normal) : []);
    const asts = d.error ? [] : d.imps ? d.imps.map(i => i.ast) : [d.ast];
    const refs = new Set(), inWithout = new Set();
    for (const ast of asts) {
      const found = namesIn(ast, own);
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
  order.forEach((group, i) => group.forEach(d => { d.step = i; }));
  // WITHOUT can't read what's being worked out alongside it: that's always a loop.
  for (const group of order) for (const d of group)
    if (!d.error && group.some(e => d.withoutReads.has(e)))
      d.error = 'WITHOUT reads something that depends on this, which is a loop (#CIRCULAR!).';
  return order;
}

// ---- Candidates ----

// A record's underlying specification, as model.js's specKey() gives it; null while something it's
// located at isn't there.
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

// A computed record's id comes from its argumentation, so it stays the same from one working-out to the next.
const computedId = args => `fx:${args.map(a => `${normal(a.edge)}=${a.at}`).sort().join('&')}`;

// The argumentations a definition could give an output at: for each parameterization it covers, every way
// of filling its parameters with records of their locations' specifications, skipping ways that use one
// object twice unless the definition allows it.
function candidatesOf(S, d) {
  const out = [];
  for (const params of d.params) {
    const ordered = d.isRelation ? [...params].sort((a, b) => edgeIndex(d, a.edge) - edgeIndex(d, b.edge)) : params;
    const pools = ordered.map(p => S.bySpec.get(p.spec) ?? []);
    const fill = (i, picked) => {
      if (i === pools.length) {
        const args = ordered.map((p, k) => ({ edge: writtenEdge(d, p.edge), at: picked[k] }));
        out.push({ key: argKey(args), args, at: d.isRelation ? undefined : picked[0], id: computedId(args) });
        return;
      }
      for (const id of pools[i]) {
        if (!d.self && picked.some(p => objectOf(S, p) === objectOf(S, id))) continue;
        fill(i + 1, [...picked, id]);
      }
    };
    fill(0, []);
  }
  return out;
}

function contextFor(S, d, cand) {
  if (d.isRelation) return { S, def: d, self: { args: new Map(cand.args.map(a => [normal(a.edge), objectOf(S, a.at)])) }, at: null, lets: null };
  return { S, def: d, self: { loc: cand.at }, at: recOf(cand.at), lets: null };
}

function makeRecord(d, cand, out) {
  const base = d.isRelation ? { args: cand.args } : { at: cand.at, edge: d.name };
  const type = typeOfDef(d);
  if (type === 'tag') return { ...base, tag: out, computed: d.id };
  if (type === 'choice') return { ...base, choice: out, computed: d.id };
  return { ...base, field: d.datatype ?? 'number', value: isDate(out) ? out.iso : out, computed: d.id };
}

// The texts a formula can give as its value: written in a place its value comes from, which is the formula
// itself, a branch of IF or IFS, or the end of LET. Text it only compares, like "Corporation" in
// `@ = "Corporation"`, isn't among them.
function givenTexts(ast) {
  const out = [];
  const walk = n => {
    if (!n) return;
    if (n.k === 'lit' && typeof n.v === 'string') return out.push(n.v);
    if (n.k !== 'call') return;
    const f = n.name.toUpperCase(), a = n.args.map(x => x.x);
    if (f === 'IF') a.slice(1).forEach(walk);
    else if (f === 'IFS') a.filter((_, i) => i % 2 === 1).forEach(walk);
    else if (f === 'LET') walk(a.at(-1));
  };
  walk(ast);
  return out;
}
function optionsWritten(text) {
  try { return givenTexts(parseExpression(splitFormula(text).body)); } catch { return []; }
}

// The options a choice's formula may give: those its schema has (`knownOptions`, where the caller knows
// them; otherwise those its entries have already), and any its formula gives as written.
function optionsOf(S, d) {
  if (!d.options) {
    const opts = [];
    const add = o => { if (!opts.some(x => same(x, o))) opts.push(o); };
    if (d.knownOptions) d.knownOptions.forEach(add);
    else for (const r of Object.values(S.entered)) if (isChoice(r) && !r.args && same(r.edge, d.name)) add(r.choice);
    givenTexts(d.ast).forEach(add);
    d.options = opts;
  }
  return d.options;
}

// A value formula's result as an output for the definition: { out }, { none } for BLANK, or { error }.
function asOutput(S, d, v) {
  v = scalar(S, v);
  if (isErr(v)) return { error: v };
  if (v === null) return { none: true };
  const type = typeOfDef(d);
  const wrong = what => ({ error: err('#VALUE!', `${describe(S, v)} isn’t ${what}.`) });
  if (type === 'tag') return typeof v === 'boolean' ? { out: v } : wrong('TRUE or FALSE');
  if (type === 'choice') {
    if (typeof v !== 'string') return wrong('an option');
    const option = optionsOf(S, d).find(o => same(o, v));
    return option ? { out: option } : { error: err('#OPTION?', `“${v}” isn’t one of ${d.name}’s options.`) };
  }
  if (d.datatype === 'date') return isDate(v) ? { out: v } : wrong('a date');
  if (d.datatype === 'text' || d.datatype === 'document') { const t = toText(S, v); return isErr(t) ? { error: t } : { out: t }; }
  return typeof v === 'number' ? { out: v } : wrong('a number');
}

// ---- Where a formula can hold ----
// A relation's candidates are every way of filling its parameters, and for a relation between two kinds of
// object most of them come to nothing: an implication doesn't hold there, a value formula gives BLANK. So
// where a formula's form says where it can come to something, a step finds its candidates there, the way a
// database joins tables, instead of trying every pair.
//
// For one argument, the free one, given the others: a support is the set of objects outside of which the
// formula is sure to come to nothing, exactly FALSE or BLANK and no error, as { bits, exact }, the objects
// being bits by their numbers in the state (see numberOf). Where it's exact, an implication is sure to hold
// just there, so there's nothing to work out. A support is worked out with the same lookups the formula
// would make, so it's worked out again when what they found changes (see settleStep). Where the form
// doesn't tell, there's no support (null), and every candidate is tried. holdsWhere and the rest compile a
// formula to a function from the given arguments (in a context, as ev takes) to a support, or to null.
//
// They compile it for a step (see supportContext): the relations it works out, which of their labels
// settle in its first round, and which have no entered records. What a support works out it works out once
// for every value of the free argument, and once for a whole round of the step, so it may use only what's
// steady (see steady).

const AT = { at: true };   // `@` as the free variable: the item a condition is asked of
const isVar = (n, v) => v === AT ? n.k === 'at' : n.k === 'name' && n.n === v.name;
const isCall = (n, f) => n.k === 'call' && n.name.toUpperCase() === f;
const ITEM_FUNCTIONS = new Set(['FILTER', 'ANY', 'ALL', 'EACH']);
const parts = n => [n.x, n.a, n.b, ...(n.items ?? []), ...(n.args ?? []).map(x => x.x)].filter(x => x && typeof x === 'object');
const withAt = (c, at) => ({ S: c.S, def: c.def, self: c.self, at, lets: c.lets });

// Whether an expression uses the free variable: an argument by its name, or `@` outside the conditions of
// FILTER and the like, where it means their items.
function uses(n, v) {
  if (isVar(n, v)) return true;
  if (v === AT && n.k === 'call' && ITEM_FUNCTIONS.has(n.name.toUpperCase())) return !!n.args[0] && uses(n.args[0].x, v);
  return parts(n).some(x => uses(x, v));
}

// Whether an expression comes out the same all through a round. It reads no OBJECT, which reads Names that
// no formula names; and no IMPLIEDBY, whose answer can change within a round, unless of a relation another
// step works out, or of one this step works out with labels that are settled by the time its records are
// there (see supportContext).
function steady(K, n) {
  if (n.k === 'call') {
    const f = n.name.toUpperCase(), tag = n.args[0]?.x;
    if (f === 'OBJECT') return false;
    if (f === 'IMPLIEDBY' && (tag?.k !== 'call' || FUNCTIONS[tag.name.toUpperCase()]
      || K.own.has(normal(tag.name)) && !(K.quiet.has(normal(tag.name)) && n.args.slice(1).every(x => x.x.k === 'lit'
        && typeof x.x.v === 'string' && K.settles.get(normal(tag.name))?.get(normal(x.x.v)) !== false)))) return false;
  }
  return parts(n).every(x => steady(K, x));
}

const callsTo = (n, f) => isCall(n, f) || parts(n).some(x => callsTo(x, f));

// Whether LET gives a name another meaning somewhere in an expression.
const binds = (n, name) => isCall(n, 'LET') && n.args.some((x, i) => i % 2 === 0 && i < n.args.length - 1 && x.x.k === 'name' && x.x.n === name)
  || parts(n).some(x => binds(x, name));

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

// Where a condition can be TRUE.
function holdsWhere(K, n, v) {
  // One that doesn't use the free variable is worked out once: where it's FALSE, it's FALSE everywhere.
  if (!uses(n, v)) return steady(K, n) && (c => truth(c.S, ev(n, c)) === false ? NOWHERE : null);
  switch (n.k) {
    case 'or': {
      const a = holdsWhere(K, n.a, v), b = holdsWhere(K, n.b, v);
      return a && b && (c => { const s = a(c); return s && union(s, b(c)); });
    }
    // AND stops at a FALSE, so it can hold only where its first side can; or, where that's worked out
    // once, only where its second side can.
    case 'and': {
      if (uses(n.a, v)) { const a = holdsWhere(K, n.a, v); return a && (c => loose(a(c))); }
      if (!steady(K, n.a)) return null;
      const b = holdsWhere(K, n.b, v);
      return c => { const t = truth(c.S, ev(n.a, c)); return t === false ? NOWHERE : t === true && b ? b(c) : null; };
    }
    case 'in': return isVar(n.a, v) && !uses(n.b, v) && steady(K, n.b) ? c => among(c.S, ev(n.b, c)) : null;
    case 'cmp': return comparedWhere(K, n, v);
    case 'call': {
      const f = n.name.toUpperCase(), a = n.args;
      if (f === 'ANY' && a.length === 2 && !uses(a[0].x, v) && steady(K, a[0].x)) {
        const h = holdsWhere(K, a[1].x, v);
        return h && (c => acrossItems(c, a[0].x, h));
      }
      // IMPLIEDBY reads its labels only where its tag is there; where they're written out, they say
      // just where it holds, once they've settled.
      if (f === 'IMPLIEDBY' && a.length >= 2 && a[0].x.k === 'call')
        return relatedWhere(K, a[0].x, v, a.slice(1).every(x => x.x.k === 'lit' && typeof x.x.v === 'string') ? a.slice(1).map(x => normal(x.x.v)) : null);
      return relatedWhere(K, n, v, null);
    }
  }
  return null;
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

// The union of a condition's supports with `@` as each item of a list worked out once: where ANY can hold,
// or FILTER can keep something.
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

// Where a list can have something in it: outside, it's sure to be empty, or BLANK, and no error.
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

// Whether an object's `n` is sure to be its list of relatives of that name: no entry, worked out or not,
// is called that at an object, and the name is a list's somewhere, so where there are none it's empty.
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

// A relation call with the free variable as one argument finds a record only among those the other
// arguments are in, so, as a condition or for IMPLIEDBY, it can hold only for their objects at its edge.
// For IMPLIEDBY with its labels written out (`labels`), only where the record found has one of them.
function relatedWhere(K, n, v, labels) {
  const rel = !FUNCTIONS[n.name.toUpperCase()] && K.P.reg.byName.get(normal(n.name));
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
    return relatedAt(c.S, rel, ids, freeEdge, labels && settledLabels(K, c.S, rel, labels));
  };
}

// IMPLIEDBY's labels, where they say for good whether it holds: those of a relation another step works
// out; or of one this step does, if the implications that give them don't read anything the step works
// out, and so come out for good in its first round: once that's done, or before, where the relation is
// quiet and has no records yet for IMPLIEDBY to find.
function settledLabels(K, S, rel, labels) {
  if (!K.own.has(rel.n)) return labels;
  return (S.settled || K.quiet.has(rel.n)) && labels.every(l => K.settles.get(rel.n)?.get(l) !== false) ? labels : null;
}

// The objects at one edge of a relation's records whose other arguments are as given, the first such
// record for each being the one a call finds; or, where a value formula gave an error there, the call's
// error. With `labels`, just where IMPLIEDBY would hold for those labels.
function relatedAt(S, rel, ids, freeEdge, labels) {
  const [edge, g] = ids.entries().next().value;
  const obj = objectOf(S, g);
  // With labels, it changes only where one of them comes or goes (see candidateKeys).
  if (labels) for (const l of labels) { depend(S, 'held', rel.n, `${rel.n}|${edge}=${obj}|${l}`); S.dep?.cited.add(`${rel.n}|${l}`); }
  else depend(S, 'rel', rel.n, `${rel.n}|${edge}=${obj}`);
  const out = [], seen = new Set();
  // Every record here has the first argument given; the others are checked.
  const checked = ids.size > 1 || !isObject(S.recs[g]);
  let exact = !!labels;
  for (const rid of S.byEdge.get(`${rel.sig}|${edge}=${obj}`) ?? []) {
    const r = S.recs[rid];
    if ((rel.form && formOfRecord(S, r) !== rel.form) || (checked && !fitsCall(S, r, ids))) continue;
    const { objs, edges, key } = S.indexed.get(rid), y = objs[edges.indexOf(freeEdge)];
    if (!y || seen.has(y)) continue;
    seen.add(y);
    if (!labels) out.push(y);
    else if (!isTag(r)) { out.push(y); exact = false; }
    else if (r.tag === true && labels.some(l => S.prov.get(key ?? keyOf(r))?.has(l))) out.push(y);
  }
  for (const failure of S.failed.get(`rel|${obj}|${rel.n}`) ?? []) {
    const a = failure.args.find(x => normal(x.edge) === freeEdge), y = a && objectOf(S, a.at);
    if (y && !seen.has(y) && fitsCall(S, failure, ids)) { seen.add(y); out.push(y); exact = false; }
  }
  return { bits: bitsOf(S, out), exact };
}

// Where a value formula can give something other than BLANK. LOOKTHROUGH gives BLANK where there's no way
// from one argument to the other.
function givesWhere(K, n, v) {
  if (!uses(n, v)) return steady(K, n) && (c => scalar(c.S, ev(n, c)) === null ? NOWHERE : null);
  if (!isCall(n, 'LOOKTHROUGH') || n.args.length !== 4) return null;
  const [from, to, step, factor] = n.args.map(x => x.x);
  if (!isVar(to, v) || uses(from, v) || !steady(K, from) || !stepName(step) || !stepName(factor)) return null;
  return c => {
    const r = asRec(c.S, ev(from, c));
    if (isErr(r)) return null;
    if (!r?.id) return NOWHERE;
    const total = lookThrough(c.S, r.id, step.name, step.n, factor.name, factor.n);
    return isErr(total) ? null : { bits: bitsOf(c.S, total.keys()), exact: false };
  };
}

// A step's context for compiling supports (see holdsWhere): the relations it works out; which of their
// labels are settled once its first round is done, those whose implications use no name the step's
// definitions give, so they came out for good in that round; and which are quiet, having no entered
// records, so that there's nothing for IMPLIEDBY to find until the end of that round.
function supportContext(S, group) {
  S.enteredSigs ??= new Set(Object.values(S.entered).filter(r => r.args).map(signatureOf));
  const quiet = new Set(group.filter(d => d.isRelation && !S.enteredSigs.has(signature(typeOfDef(d), d.edges))).map(d => normal(d.name)));
  const names = new Set(group.flatMap(d => [...namesProvided(d, S.P.reg)]));
  const settles = new Map();
  for (const d of group) if (d.isRelation && d.imps) {
    const labels = new Map(), own = new Set(d.edges.map(normal));
    for (const imp of d.imps) {
      const { refs } = namesIn(imp.ast, own);
      // OBJECT reads Names without naming them.
      const alone = ![...refs].some(n => names.has(n)) && !(names.has('name') && callsTo(imp.ast, 'OBJECT'));
      labels.set(normal(imp.label), labels.get(normal(imp.label)) !== false && alone);
    }
    settles.set(normal(d.name), labels);
  }
  return { P: S.P, own: new Set(group.filter(d => d.isRelation).map(d => normal(d.name))), settles, quiet };
}

// ---- Working out the state ----

function stateFor(P, entered) {
  const S = { P, entered, recs: {}, byAt: new Map(), byAtName: new Map(), relsAt: new Map(), byObject: new Map(), byEdge: new Map(),
    relsByCall: new Map(), indexed: new Map(), seq: 0, listNames: new Map(), specs: new Map(), bySpec: new Map(), enteredByKey: new Map(),
    prov: new Map(), rows: new Map(), lazy: null, dep: null, watch: null, reads: null, forgetting: true, settled: false, done: 0,
    cf: new Map(), memo: new Map(), steps: [], failed: new Map(), recLists: new WeakMap(), shapes: new WeakMap(), forms: new WeakMap(),
    listedOnly: new Map(), pairLists: new Map(), numbers: new Map(), numbered: [], listBits: new WeakMap(), provenances: new Map(), enteredSigs: null };
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

// A computed record comes into the state, or goes, as a step works it out (again). The candidate it's
// worked out at comes with it, with its block and its records there (picks), which tell what it shares
// with the block's other records: its signature, edges and specification, and the order of its call's
// key (see keyedBlock).
function addComputed(S, id, r, cand, b, picks) {
  let known;
  if (b?.sig && picks) {
    const objs = picks.map((k, j) => b.objects[j][k]);
    known = { objs, edges: b.normals, sig: b.sig, key: cand.key, call: b.idOrder && `${b.sig}|${b.idOrder.map(j => `${b.normals[j]}=${objs[j]}`).join('&')}` };
  }
  addRecord(S, id, r, known);
  // Its specification is its block's for its output; it's kept only where a definition is located, since
  // that's where a step looks for candidates (see blocksOf), and worked out again if it's wanted elsewhere.
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
    specOf(S, rid);
    againBelow(S, rid);
  }
}

// Works out one step: a group of definitions that read each other. Value formulas alone are worked out on
// demand; with implications among them, the step goes in rounds (see settleStep).
//
// What the step's lookups find is kept for the step (see remembered). A step of implications alone keeps
// track of what each lookup read, and at the end of each round lets go of those that read something the
// round changed. A value formula that doesn't read what it gives keeps them all. Anything else lets go of
// them all whenever a record comes or goes, as a spreadsheet recalculates.
function runStep(S, i) {
  const started = now();
  const group = S.P.order[i].filter(d => !d.error);
  S.count = { evals: 0, rounds: 0, attempts: 0, tried: 0 };
  S.memo.clear();
  S.listedOnly.clear();
  if (group.some(d => d.imps)) {
    S.forgetting = group.some(d => !d.imps);
    settleStep(S, group);
  } else {
    S.forgetting = !aloof(S.P, group);
    settleValues(S, group);
  }
  S.forgetting = true;
  S.memo.clear();
  S.steps.push({ defs: S.P.order[i].map(d => d.id), ms: now() - started, ...S.count });
}

// Whether a step is one value formula that can't read what it gives: it names none of it, and gives no
// Names, which OBJECT reads.
const aloof = (P, group) => group.length === 1 && !group[0].dependsOn.has(group[0]) && !namesProvided(group[0], P.reg).has('name');

function runUpTo(S, limit) {
  for (; S.done < limit; S.done++) runStep(S, S.done);
}

const now = () => typeof performance === 'object' ? performance.now() : Date.now();

// ---- What a formula read ----
// A formula is worked out with what it reads noted (see reading). What it read is kept as a trace: the ids
// it read itself, the keys it depends on within a step (see depend), and the traces of what it was made
// of, so a lookup used many times is kept once. The ids are spelled out (readIds) only for the records
// someone asks about. Within a step, a trace that depends on keys is watched for them, directly or
// through what it was part of (see watch and affected), so a change finds what it changes.

const NO_READS = { ids: [], keys: [], parts: [] };
function readIds(trace) {
  const out = new Set(), seen = new Set(), stack = [trace];
  while (stack.length) {
    const t = stack.pop();
    if (seen.has(t)) continue;
    seen.add(t);
    for (const id of t.ids) out.add(id);
    stack.push(...t.parts);
  }
  return [...out];
}
// The keys a trace depends on, at any depth.
function keysOf(trace, out = new Set(), seen = new Set()) {
  if (seen.has(trace)) return out;
  seen.add(trace);
  for (const k of trace.keys) out.add(k);
  for (const p of trace.parts) keysOf(p, out, seen);
  return out;
}

function reading(S, fn) {
  const outer = S.reads;
  const trace = S.reads = { ids: [], keys: [], parts: [] };
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

// The traces a change to these keys reaches, through what they're part of. A lookup kept for the step
// that's reached is let go of; the traces of what's being worked out are returned. The keys are done with.
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

// A property worked out when it's first read, and kept: what a record read is spelled out only for the
// records someone asks about.
function lazily(obj, name, fn) {
  Object.defineProperty(obj, name, { enumerable: true, configurable: true, get() {
    const value = fn();
    Object.defineProperty(obj, name, { value, enumerable: true, configurable: true, writable: true });
    return value;
  } });
  return obj;
}

// ---- Candidates, as a step finds them ----

// A definition's candidates for one parameterization it covers, as a block: its parameters in the
// relation's order, the records each can be filled with (pools, as they stand when the step starts), and
// each record's object. A candidate is one record from each pool, as indexes; its ordinal is its place in
// candidatesOf's order, so candidates found in any order are worked out in that order.
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

// The candidate with these records, or null if it uses one object twice and its definition doesn't allow
// that; and its ordinal.
function candidateIn(b, picks) {
  if (!b.d.self) for (let i = 1; i < picks.length; i++) for (let j = 0; j < i; j++) if (b.objects[i][picks[i]] === b.objects[j][picks[j]]) return null;
  const args = picks.map((k, j) => ({ edge: b.edges[j], at: b.pools[j][k] }));
  const key = `[${b.keyOrder.map(j => kept(b.keyParts[j], picks[j], () => JSON.stringify(JSON.stringify([b.normals[j], args[j].at])))).join(',')}]`;
  const id = b.idOrder ? `fx:${b.idOrder.map(j => `${b.normals[j]}=${args[j].at}`).join('&')}` : computedId(args);
  return { key, args, at: b.d.isRelation ? undefined : args[0].at, id };
}

// argKey and computedId sort their pairs, [edge, location] and edge=location, and a block's edges alone
// decide the order: two pairs differ first within their edges (or, for computedId, at the = after the
// shorter, unless an edge has = or & in it). So a block works the order out once, and a key's pairs once
// for each record of a pool.
function keyedBlock(b) {
  b.normals = b.edges.map(normal);
  b.sig = b.d.isRelation && signature(typeOfDef(b.d), b.edges);
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

// The free parameter's records for a support's objects, as indexes into its pool; all of them where
// there's no support.
function picksFor(S, b, free, s) {
  if (!s) return b.pools[free].map((_, k) => k);
  b.numbers[free] ??= b.objects[free].map(obj => obj ? numberOf(S, obj) : -1);
  const out = [];
  b.numbers[free].forEach((k, i) => { if (k >= 0 && hasBit(s.bits, k)) out.push(i); });
  return out;
}

function everyCandidate(b) {
  const out = [];
  for (const anchor of anchorsOf(b, b.pools.length - 1)) for (const k of picksFor(null, b, b.pools.length - 1, null)) {
    anchor[b.pools.length - 1] = k;
    const cand = candidateIn(b, anchor);
    if (cand) out.push({ d: b.d, b, picks: [...anchor], cand, ordinal: ordinalIn(b, anchor) });
  }
  return out;
}

// For each implication of a block, or its value formula: the parameter left free, and the support given
// the others (see holdsWhere), where its form gives one and `find` allows; else every candidate is tried.
function plansOf(K, b, find) {
  return (b.d.imps ? b.d.imps.map(i => i.ast) : [b.d.ast]).map(ast => {
    if (find && b.d.isRelation) for (let free = 0; free < b.edges.length; free++) {
      const v = { name: normal(b.edges[free]) };
      const where = !binds(ast, v.name) && (b.d.imps ? holdsWhere(K, ast, v) : givesWhere(K, ast, v));
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
// list's name and the edge label it lists, and in whose lists each object is; by the call that finds it;
// and by each argument, for finding candidates (see relatedAt).
function candidateKeys(S, d, cand, kinds = null, turned = []) {
  const want = kind => !kinds || kinds.has(kind);
  if (!d.isRelation) return want('entry') ? [`entry|${cand.at}|${normal(d.name)}`] : [];
  const n = normal(d.name), objs = cand.args.map(a => objectOf(S, a.at)), keys = [];
  if (want('calls')) keys.push(`calls|${n}|${cand.args.map((a, i) => `${normal(a.edge)}=${objs[i]}`).sort().join('&')}`);
  if (want('rel')) cand.args.forEach((a, i) => keys.push(`rel|${n}|${normal(a.edge)}=${objs[i]}`));
  if (want('held')) cand.args.forEach((a, i) => turned.forEach(l => { if (S.dep?.cited.has(`${n}|${l}`)) keys.push(`held|${n}|${normal(a.edge)}=${objs[i]}|${l}`); }));
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

// The names under which a step's own candidates can be looked for, by how (see depend).
function relevance(S, group) {
  const dep = { entry: new Set(), lists: new Set(), calls: new Set(), rel: new Set(), held: new Set(), inverse: new Set(), watched: new Set(), cited: new Set() };
  for (const d of group) {
    if (!d.isRelation) { dep.entry.add(normal(d.name)); continue; }
    dep.calls.add(normal(d.name));
    dep.rel.add(normal(d.name));
    dep.held.add(normal(d.name));
    for (const names of listsByPair(S, d).values()) for (const n of names) { dep.lists.add(n); dep.inverse.add(n); }
  }
  return dep;
}

// Candidates by the keys they could turn up under, for working value formulas out on demand and for
// finding loops (see loopsIn).
function indexCandidates(S, jobs) {
  const idx = new Map();
  for (const { d, cand } of jobs) for (const k of candidateKeys(S, d, cand)) push(idx, k, cand.key);
  return idx;
}

// A relation call by what it would find: the relation's name, and each argument's edge with its object.
const callKey = (S, name, pairs) => `${normal(name)}|${pairs.map(([edge, at]) => `${normal(edge)}=${objectOf(S, at)}`).sort().join('&')}`;

// ---- Value formulas ----

// Value formulas' candidates, ready to be worked out on demand: all but those where an entered record stands.
// A `blocked` one was found on a loop (see settleStep), and gives #CIRCULAR!.
function lazyValues(S, jobs, blocked = new Set()) {
  const todo = jobs.filter(j => !S.enteredByKey.has(j.cand.key));
  return { cands: new Map(todo.map(j => [j.cand.key, { ...j, state: 'todo', blocked: blocked.has(j.cand.key) }])), idx: indexCandidates(S, todo) };
}

// Value formulas are worked out on demand, so a record can read the same definition's records elsewhere,
// as a spreadsheet cell reads other cells. Asking for a record that's being worked out is a loop. A value
// formula that can't read what it gives (see aloof) is worked out only where its support says it can give
// something, and where an entered record stands.
function settleValues(S, group) {
  const jobs = blocksOf(S, group).flatMap(b => S.forgetting ? everyCandidate(b) : foundValues(S, b));
  S.lazy = lazyValues(S, jobs);
  S.count.tried += S.lazy.cands.size;
  for (const key of S.lazy.cands.keys()) force(S, key);
  valueOverlaps(S, jobs);
  S.lazy = null;
}

// A value formula's candidates where its support says it can give something, and where an entered record
// stands, which is marked as agreeing with it or not; in candidatesOf's order.
function foundValues(S, b) {
  const [{ free, where }] = plansOf(supportContext(S, [b.d]), b, true);
  if (!where) return everyCandidate(b);
  const found = new Map();
  const take = picks => { const ordinal = ordinalIn(b, picks); if (found.has(ordinal)) return; const cand = candidateIn(b, picks); if (cand) found.set(ordinal, { d: b.d, b, picks: [...picks], cand, ordinal }); };
  for (const anchor of anchorsOf(b, free)) {
    for (const k of picksFor(S, b, free, supportAt(S, where, anchorContext(b, free, anchor)))) { anchor[free] = k; take(anchor); }
  }
  const at = b.pools.map(pool => new Map(pool.map((id, k) => [id, k])));
  for (const id of S.enteredByKey.values()) {
    const r = S.entered[id];
    if (r.args?.length !== b.edges.length) continue;
    const picks = b.edges.map((edge, j) => at[j].get(r.args.find(a => same(a.edge, edge))?.at));
    if (picks.every(k => k !== undefined)) take(picks);
  }
  return [...found.values()].sort((x, y) => x.ordinal - y.ordinal);
}

// What a value formula gives where an entered record stands, to mark it as agreeing or differing.
function valueOverlaps(S, jobs) {
  for (const { d, cand } of jobs) {
    const enteredId = S.enteredByKey.get(cand.key);
    if (!enteredId || d.imps) continue;
    const { v, reads } = reading(S, () => safeEv(d.ast, contextFor(S, d, cand)));
    const res = asOutput(S, d, v);
    const mark = res.error || res.none ? null : equal(scalar(S, recOf(enteredId)), res.out) ? 'agrees' : 'differs';
    addRow(S, d, { ...cand, entered: enteredId, formula: res.error ?? res.out ?? null, mark }, reads);
  }
}

function force(S, key) {
  const job = S.lazy?.cands.get(key);
  if (!job || job.state === 'done') return null;
  if (job.state === 'busy') return circular();
  job.state = 'busy';
  const { v, reads } = job.blocked ? { v: circular(), reads: NO_READS } : reading(S, () => safeEv(job.d.ast, contextFor(S, job.d, job.cand)));
  const res = asOutput(S, job.d, v);
  Object.assign(job, { state: 'done', res, reads, failed: [] });
  if (res.error) {
    addRow(S, job.d, { ...job.cand, error: res.error }, reads);
    // Whatever reads the record reads the error instead.
    if (!job.d.isRelation) {
      S.failed.set(`${job.cand.at}|${normal(job.d.name)}`, res.error);
      job.failed.push([`${job.cand.at}|${normal(job.d.name)}`]);
    } else for (const obj of new Set(job.cand.args.map(a => objectOf(S, a.at)))) {
      const failure = { args: job.cand.args, error: res.error };
      push(S.failed, `rel|${obj}|${normal(job.d.name)}`, failure);
      job.failed.push([`rel|${obj}|${normal(job.d.name)}`, failure]);
    }
  } else if (!res.none) {
    addComputed(S, job.cand.id, makeRecord(job.d, job.cand, res.out), job.cand, job.b, job.picks);
    job.added = true;
    addRow(S, job.d, { ...job.cand, value: res.out }, reads);
  }
  return null;
}

// Takes back what a value formula gave at a candidate, so it can be worked out again.
function unforce(S, job) {
  if (job.added) removeComputed(S, job.cand.id);
  for (const [key, failure] of job.failed ?? []) {
    if (!failure) S.failed.delete(key);
    else S.failed.set(key, S.failed.get(key).filter(x => x !== failure));
  }
  Object.assign(job, { state: 'todo', added: false, failed: [], res: null, reads: null });
}

function forceMany(S, keys) {
  for (const k of keys ?? []) { const e = force(S, k); if (e) return e; }
  return null;
}
const forceEntry = (S, at, n) => S.lazy?.idx.size ? forceMany(S, S.lazy.idx.get(`entry|${at}|${n}`)) : null;
const forceLists = (S, at, n) => S.lazy?.idx.size ? forceMany(S, S.lazy.idx.get(`lists|${at}|${n}`)) : null;
const forceRelation = (S, key) => S.lazy?.idx.size ? forceMany(S, S.lazy.idx.get(`calls|${key}`)) : null;

// ---- Steps with implications ----
// Implications only ever attest, so a step with implications starts with nothing attested by them, attests
// whatever some implication holds for, and goes round again until a round changes nothing: the fewest
// attestations they support. Any value formulas in the step are worked out afresh each round, on demand,
// from what's attested so far.
//
// Each implication is worked out at the candidates its support allows (see holdsWhere), or at every one
// where there's none, and where the step has value formulas too, whose loops need every candidate to find.
// Where a support is exact, the implication holds just there, with nothing to work out. Within the step,
// every lookup notes the keys it depends on (see depend), so a round works out again only the
// implications, and the supports, whose inputs changed. The same notes find loops per record: once the
// step settles, a value formula's record on a loop through the step's records is circular, and so are the
// others on that loop, and the step is worked out again with them left out, giving #CIRCULAR!, so nothing
// is built on them. A loop through implications alone isn't circular. An implication's record that some
// implication held for, and none does any more, came from a loop through something like NOT, and is
// circular too.
function settleStep(S, group) {
  const blocked = new Set();
  for (let attempt = 0; ; attempt++) {
    S.count.attempts++;
    const run = attemptStep(S, group, blocked);
    const loops = attempt < 4 ? loopsIn(S, run) : [];
    if (!loops.length) return finishStep(S, run);
    undoStep(S, group, run);
    loops.forEach(k => blocked.add(k));
  }
}

// The labels of the implications that hold at a tag's candidate, in the definition's order.
function labelsOf(t) {
  const out = [];
  t.d.imps.forEach((imp, i) => { if (t.results[i]?.v === true && !out.includes(imp.label)) out.push(imp.label); });
  return out;
}
const sameLabels = (a, b) => a.length === b.length && a.every((l, i) => l === b[i]);
// A candidate's provenance, which IMPLIEDBY reads: the labels that hold there, normalized, as a set shared
// by every candidate with the same ones.
function provenance(S, labels) {
  const key = labels.map(normal).join('\n');
  if (!S.provenances.has(key)) S.provenances.set(key, new Set(labels.map(normal)));
  return S.provenances.get(key);
}
const resultKey = res => res ? JSON.stringify(res.error ? ['error', res.error.code] : res.none ? ['none'] : ['out', res.out]) : '';

const EVALUATE = Symbol('work out'), FOUND = 1, HELD = 2, STILL = 3;
function attemptStep(S, group, blocked) {
  const blocks = blocksOf(S, group);
  const find = group.every(d => d.imps), K = supportContext(S, group);
  S.dep = relevance(S, group);
  S.watch = new Map();
  S.settled = false;
  const valueJobs = blocks.filter(b => !b.d.imps).flatMap(everyCandidate);
  S.lazy = lazyValues(S, valueJobs, blocked);
  const values = [...S.lazy.cands.values()];
  // Candidates by ordinal, made when first wanted.
  const size = blocks.reduce((n, b) => Math.max(n, b.base + b.strides[0] * b.pools[0].length), 0);
  const tags = [], slots = size <= 1 << 22 ? new Int32Array(size).fill(-1) : new Map();
  const tagAt = (b, ordinal, picks) => {
    let k = slots instanceof Map ? slots.get(ordinal) ?? -1 : slots[ordinal];
    if (k < 0) {
      const at = picks(), cand = candidateIn(b, at);
      k = tags.push(cand && { d: b.d, b, picks: at, cand, ordinal, ctx: null, results: b.d.imps.map(() => null), labels: [], derived: false,
        blocked: blocked.has(cand.key), pending: null }) - 1;
      if (slots instanceof Map) slots.set(ordinal, k); else slots[ordinal] = k;
      if (cand) S.count.tried++;
    }
    return tags[k];
  };
  // The candidates with implications to work out this round, each with what's pending: an implication to
  // work out (EVALUATE), or, as a support said, holding or not (true or false). The latest word wins.
  let queue = [];
  const enqueue = (t, i, known = EVALUATE) => {
    if (!t || t.blocked) return;
    if (!t.pending) { t.pending = []; queue.push(t); }
    t.pending[i] = known;
  };
  // A finder works an implication's support out for one choice of the other arguments' objects, and queues
  // the implication where it newly allows, in each block with those objects (its targets). A target keeps,
  // for each record of the free parameter's pool, whether the implication has been queued there to be
  // worked out (FOUND), or held there as an exact support said (HELD).
  const seek = g => {
    let s = null;
    if (g.where) {
      const run = reading(S, () => supportAt(S, g.where, g.ctx));
      s = run.v;
      g.reads = run.reads;
      g.reads.job = g;
    }
    for (const x of g.targets) {
      const at = k => tagAt(x.b, x.ordinal + k * x.b.strides[x.free], () => { const picks = [...x.anchor]; picks[x.free] = k; return picks; });
      if (s && !s.exact && x.held.length) {
        // No longer exact: what it said held is worked out instead.
        for (const k of x.held) { x.state[k] = FOUND; enqueue(at(k), g.i); }
        x.held = [];
      }
      const picks = picksFor(S, x.b, x.free, s);
      if (s?.exact) {
        const held = picks.filter(k => x.state[k] !== FOUND);
        for (const k of held) { if (x.state[k] !== HELD) enqueue(at(k), g.i, true); x.state[k] = STILL; }
        for (const k of x.held) if (x.state[k] === HELD) { enqueue(at(k), g.i, false); x.state[k] = 0; }
        for (const k of held) x.state[k] = HELD;
        x.held = held;
      } else for (const k of picks) if (x.state[k] !== FOUND) { x.state[k] = FOUND; enqueue(at(k), g.i); }
    }
    if (!s) g.where = null;
  };
  const plans = new Map(), finders = new Map();
  for (const b of blocks) if (b.d.imps) {
    if (!plans.has(b.d)) plans.set(b.d, plansOf(K, b, find));
    plans.get(b.d).forEach(({ free, where }, i) => {
      for (const anchor of anchorsOf(b, free)) {
        const key = `${b.d.id}|${i}|${anchor.map((k, j) => j === free ? '' : b.objects[j][k]).join('|')}`;
        if (!finders.has(key)) finders.set(key, { i, where, ctx: where && anchorContext(b, free, anchor), targets: [], reads: null });
        finders.get(key).targets.push({ b, free, anchor, ordinal: ordinalIn(b, anchor), state: new Uint8Array(b.pools[free].length), held: [] });
      }
    });
  }
  finders.forEach(seek);
  let outputs = null, factsChanged = false;
  for (let round = 0; round < 1000 && (queue.length || (factsChanged && values.length)); round++) {
    S.count.rounds++;
    for (const job of values) unforce(S, job);
    for (const d of group) if (!d.imps) S.rows.delete(d.id);
    const changed = [];
    for (const t of queue.sort((x, y) => x.ordinal - y.ordinal)) {
      const pending = t.pending;
      t.pending = null;
      pending.forEach((known, i) => {
        if (known !== EVALUATE) t.results[i] = { v: known, reads: null };
        else {
          S.count.evals++;
          t.ctx ??= contextFor(S, t.d, t.cand);
          const { v, reads } = reading(S, () => truth(S, safeEv(t.d.imps[i].ast, t.ctx)));
          Object.assign(reads, { job: t, imp: i });
          t.results[i] = { v, reads };
        }
        const labels = labelsOf(t);
        if (sameLabels(labels, t.labels)) return;
        t.was ??= t.labels;
        t.labels = labels;
        S.prov.set(t.cand.key, provenance(S, labels));
        if (changed.at(-1) !== t) changed.push(t);
      });
    }
    queue = [];
    S.settled = true;
    for (const job of values) force(S, job.cand.key);
    // A value formula's output that differs from last round's changes what read it then.
    const now = new Map(values.map(job => [job.cand.key, resultKey(job.res)]));
    const changedValues = outputs ? values.filter(job => outputs.get(job.cand.key) !== now.get(job.cand.key)) : [];
    outputs = now;
    factsChanged = changed.length > 0 || changedValues.length > 0;
    for (const t of changed) if (t.labels.length && !t.derived && !S.enteredByKey.has(t.cand.key)) {
      t.derived = true;
      addComputed(S, t.cand.id, makeRecord(t.d, t.cand, true), t.cand, t.b, t.picks);
    }
    if (!factsChanged) continue;
    // The labels that came or went at each candidate, normalized as IMPLIEDBY compares them.
    const turned = t => [...new Set([...t.was, ...t.labels])].filter(l => t.was.includes(l) !== t.labels.includes(l)).map(normal);
    const keys = [...changed.flatMap(t => candidateKeys(S, t.d, t.cand, S.dep.watched, S.dep.watched.has('held') ? turned(t) : [])),
      ...changedValues.flatMap(x => candidateKeys(S, x.d, x.cand, S.dep.watched))];
    for (const t of changed) t.was = undefined;
    const again = [];
    for (const trace of affected(S, keys)) {
      const job = trace.job;
      if (trace.imp === undefined) { if (job.reads === trace && job.where) again.push(job); }
      else if (job.results[trace.imp]?.reads === trace) enqueue(job, trace.imp);
    }
    again.forEach(seek);
  }
  return { tags: tags.filter(Boolean).sort((x, y) => x.ordinal - y.ordinal), values, valueJobs };
}

// The candidates on loops through a value formula: in the graph of what depends on what among the step's
// candidates, each strongly connected group that loops and has a value formula's candidate in it. With
// value formulas in the step, every candidate was tried, and the graph has them all.
function loopsIn(S, run) {
  if (!run.values.length) return [];
  const idx = indexCandidates(S, [...run.tags, ...run.valueJobs]);
  const on = trace => new Set([...keysOf(trace)].flatMap(k => idx.get(k) ?? []));
  const edges = new Map(), values = new Set();
  for (const t of run.tags) if (!t.blocked) edges.set(t.cand.key, new Set(t.results.flatMap(r => r?.reads ? [...on(r.reads)] : [])));
  for (const job of run.values) if (!job.blocked) { edges.set(job.cand.key, job.reads ? on(job.reads) : new Set()); values.add(job.cand.key); }
  const index = new Map(), low = new Map(), stack = [], onStack = new Set(), out = [];
  let counter = 0;
  const visit = v => {
    index.set(v, counter); low.set(v, counter); counter++;
    stack.push(v); onStack.add(v);
    for (const w of edges.get(v)) {
      if (!edges.has(w)) continue;
      if (!index.has(w)) { visit(w); low.set(v, Math.min(low.get(v), low.get(w))); }
      else if (onStack.has(w)) low.set(v, Math.min(low.get(v), index.get(w)));
    }
    if (low.get(v) !== index.get(v)) return;
    const group = [];
    let w;
    do { w = stack.pop(); onStack.delete(w); group.push(w); } while (w !== v);
    if ((group.length > 1 || edges.get(v).has(v)) && group.some(k => values.has(k))) out.push(...group);
  };
  for (const v of edges.keys()) if (!index.has(v)) visit(v);
  return out;
}

// Takes back everything a step worked out, to work it out again.
function undoStep(S, group, run) {
  for (const job of run.values) unforce(S, job);
  for (const t of run.tags) {
    if (t.derived) removeComputed(S, t.cand.id);
    S.prov.delete(t.cand.key);
  }
  for (const d of group) S.rows.delete(d.id);
  S.dep = S.lazy = S.watch = null;
}

// What each implication that held read, by label. Where an exact support said it held, it's worked out to
// see what it reads, as explain works implications out.
function readsByLabel(S, t) {
  const reads = {};
  t.results.forEach((r, i) => {
    if (r?.v !== true) return;
    const label = t.d.imps[i].label;
    const trace = r.reads ?? reading(S, () => truth(S, safeEv(t.d.imps[i].ast, contextFor(S, t.d, t.cand)))).reads;
    reads[label] = [...new Set([...(reads[label] ?? []), ...readIds(trace)])];
  });
  return reads;
}

// The rows a settled step leaves, for its implications and where entered records stand; its value formulas
// left theirs as they were worked out.
function finishStep(S, run) {
  for (const t of run.tags) {
    const { d, cand, labels } = t;
    const errors = t.results.flatMap((r, i) => r && isErr(r.v) ? [{ label: d.imps[i].label, error: r.v }] : []);
    const enteredId = S.enteredByKey.get(cand.key);
    if (t.blocked) addRow(S, d, { ...cand, error: circular() });
    else if (t.derived && !labels.length) {
      removeComputed(S, cand.id);
      S.prov.delete(cand.key);
      addRow(S, d, { ...cand, error: circular(), errors });
    } else if (enteredId) {
      const tag = S.entered[enteredId].tag;
      if (labels.length || errors.length)
        addRow(S, d, { ...cand, entered: enteredId, formula: labels.length ? true : null, labels, errors, reads: readsByLabel(S, t),
          mark: labels.length ? tag ? 'also implied' : 'overrides' : null });
    } else if (labels.length) addRow(S, d, { ...cand, value: true, labels, errors }, () => readsByLabel(S, t));
    else if (errors.length) addRow(S, d, { ...cand, error: errors[0].error, errors });
  }
  valueOverlaps(S, run.valueJobs);
  S.dep = S.lazy = S.watch = null;
}

// A row of a definition's records, with what its formula read (`reads`, a trace or a function giving it by
// label) spelled out when it's first asked for (see lazily).
function addRow(S, d, row, reads) {
  const out = { def: d.id, ...row };
  if (reads) lazily(out, 'reads', typeof reads === 'function' ? reads : () => readIds(reads));
  push(S.rows, d.id, out);
}

// WITHOUT: the chart as if `id` and everything depending on it weren't there, with what was worked out
// in earlier steps worked out again: only the steps the definition's WITHOUT reads from, or every earlier
// step for an expression outside a definition. Kept per record and set of steps.
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

// ---- Names, for an editor ----

// The names that can follow a dot on a value: on a record reached through a relation, the relation's;
// then the record's own, and those up its path.
function namesOnValue(S, v) {
  const out = new Map();
  const add = (name, kind) => { if (!out.has(normal(name))) out.set(normal(name), { name, kind }); };
  for (const x of toList(v).slice(0, 20)) {
    if (!isRec(x) || !x.id) continue;
    const link = x.link && S.recs[x.link];
    if (link) {
      link.args.forEach(a => add(a.edge, 'argument'));
      const rel = relationOf(S, link);
      if (rel) add(rel.name, 'output');
      for (const e of S.byAt.get(x.link) ?? []) add(S.recs[e].edge, 'entry');
    }
    for (let id = x.id; id && S.recs[id]; id = S.recs[id].at) {
      for (const e of S.byAt.get(id) ?? []) add(S.recs[e].edge, 'entry');
      for (const rid of isObject(S.recs[id]) ? relationsFor(S, id) : S.relsAt.get(id) ?? []) {
        const r = S.recs[rid], rel = relationOf(S, r);
        r.args.forEach((own, i) => { if (own.at === id) r.args.forEach((other, j) => { if (i !== j) add(listNameOf(rel, own.edge, other.edge), 'list'); }); });
      }
      if (isRelation(S.recs[id])) S.recs[id].args.forEach(a => add(a.edge, 'argument'));
    }
  }
  return [...out.values()];
}

// Where a dot chain ending at the cursor starts: the tokens before it, back over names, @, dots, and
// balanced parentheses.
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

// ---- What the page uses ----

// Works out the computed state from the entered records, the definitions and the pilot names. Returns:
// - records: the effective records, entered and computed. A computed one has `computed`, its definition's
//   id, and an id from its argumentation (computedId), which stays put from one working-out to the next.
// - computed: per computed record, { def, labels, reads }: the implications that held and what they read
//   (by label), or for a value formula the records it read.
// - covered: per entered record a formula also covers, { def, mark, formula, labels }, where mark is
//   'agrees', 'differs', 'also implied' or 'overrides', and formula is what the formula gives there.
// - errors: per candidate whose formula gives an error, { def, id, args, error }.
// - rows: all of that per definition, for a list of its records; defErrors: problems with a whole
//   definition; keptAside: entered records whose location isn't computed now; ms: how long it took.
function computeState(entered, definitions, names) {
  const started = typeof performance === 'object' ? performance.now() : Date.now();
  const defs = definitions.map(d => prepareDef(d, names));
  const reg = registry(names, defs);
  // The specifications definitions are located at, where a step looks for candidates (see blocksOf).
  const P = { defs, reg, known: knownNames(entered, defs, reg), located: new Set(defs.flatMap(d => d.params.flat().map(p => p.spec))) };
  P.order = plan(defs, reg);
  const S = stateFor(P, entered);
  runUpTo(S, P.order.length);
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
    if (row.error) errors.push({ def: row.def, id: row.id, args: row.args, error: row.error });
    else if (row.entered) covered[row.entered] = { def: row.def, mark: row.mark, formula: row.formula, labels: row.labels ?? [] };
    // What it read is spelled out when it's asked for.
    else if (S.recs[row.id]) computed[row.id] = { def: row.def, labels: row.labels ?? [], get reads() { return row.reads ?? []; } };
  }
  const defErrors = Object.fromEntries(defs.filter(d => d.error).map(d => [d.id, d.error]));
  const ms = (typeof performance === 'object' ? performance.now() : Date.now()) - started;
  return { records, computed, covered, errors, rows: Object.fromEntries(S.rows), defErrors, keptAside,
    order: P.order.map(g => g.map(d => d.id)), steps: S.steps, ms, state: S };
}

// ---- Saying why ----
// Why a record is there, in a few words for each implication that holds: the comparison that decided it,
// the item ANY found, the clause IMPLIEDBY cited. That's shorter than everything the formula read, which
// for REACH can be most of the chart.

// A formula rebuilt from its parts, for quoting.
function unparse(n) {
  const nm = s => /^[A-Za-z_][A-Za-z0-9_]*$/.test(s) ? s : `[${s}]`;
  const wrap = (x, inside) => x.k === 'or' && inside === 'and' ? `(${unparse(x)})` : unparse(x);
  switch (n.k) {
    case 'lit': return typeof n.v === 'string' ? `"${n.v}"` : typeof n.v === 'boolean' ? (n.v ? 'TRUE' : 'FALSE')
      : n.pct ? `${tidyNumber(n.v * 100)}%` : String(tidyNumber(n.v));
    case 'arr': return `{${n.items.map(unparse).join(', ')}}`;
    case 'at': return '@';
    case 'name': return nm(n.name);
    case 'dot': return `${unparse(n.x)}.${nm(n.name)}`;
    case 'call': return `${nm(n.name)}(${n.args.map(a => (a.label ? `${nm(a.label)}: ` : '') + unparse(a.x)).join(', ')})`;
    case 'neg': return `${n.op}${unparse(n.x)}`;
    case 'not': return `NOT ${unparse(n.x)}`;
    case 'and': return `${wrap(n.a, 'and')} AND ${wrap(n.b, 'and')}`;
    case 'or': return `${unparse(n.a)} OR ${unparse(n.b)}`;
    case 'cmp': case 'bin': return `${unparse(n.a)} ${n.op} ${unparse(n.b)}`;
    case 'in': return `${unparse(n.a)} IN ${unparse(n.b)}`;
  }
  return '';
}

// A value as an explanation shows it: an object by its name, a number as a percentage where the formula
// wrote its other side as one.
function shown(S, v, pct) {
  v = scalar(S, v);
  if (isErr(v)) return v.code;
  if (typeof v === 'number') return pct ? `${tidyNumber(v * 100)}%` : String(tidyNumber(v));
  return describe(S, v);
}

// An expression read as words where it names things: the relation's arguments and @ by name, and a dot as
// a possessive, so Controlled.[General Partners] reads "Calder Ridge Capital Partners III, L.P.’s General Partners".
function phrase(n, c) {
  const S = c.S;
  if (n.k === 'at') return c.at ? describe(S, c.at) : '@';
  if (n.k === 'name') {
    const id = c.self.args?.get(normal(n.name));
    return id ? nameOf(S, id) : unparse(n);
  }
  if (n.k === 'dot') return `${phrase(n.x, c)}’s ${n.name}`;
  if (n.k === 'call' && n.name.toUpperCase() === 'REACH' && n.args.length === 2)
    return `${phrase(n.args[0].x, c)}’s ${unparse(n.args[1].x).replace(/^\[|\]$/g, '')}, directly or indirectly`;
  if (n.k === 'call' && n.name.toUpperCase() === 'FILTER' && n.args.length === 2)
    return `${phrase(n.args[0].x, c)} with ${unparse(n.args[1].x).replace(/@\./g, '')}`;
  if (n.k === 'call' && S.P.reg.byName.has(normal(n.name)))
    return `${n.name}: ${n.args.map(a => phrase(a.x, c)).join(' → ')}`;
  return unparse(n);
}

// Whether an expression names one of the relation's arguments, which as a value is just its name.
const isArgument = (n, c) => n.k === 'name' && !!c.self.args?.has(normal(n.name));

// Why a condition holds, in context c. It's only asked of conditions that do hold.
function why(n, c) {
  const S = c.S;
  const holds = x => truth(S, ev(x, c)) === true;
  switch (n.k) {
    case 'or': return holds(n.a) ? why(n.a, c) : why(n.b, c);
    case 'and': return `${why(n.a, c)}; ${why(n.b, c)}`;
    case 'not': return n.x.k === 'call' && S.P.reg.byName.has(normal(n.x.name))
      ? `${phrase(n.x, c)} isn’t attested` : `not ${unparse(n.x)}`;
    case 'in': {
      const value = shown(S, ev(n.a, c));
      const subject = (n.a.k === 'name' || n.a.k === 'dot') && !isArgument(n.a, c) ? `${phrase(n.a, c)} ` : '';
      return `${subject}${value} is among ${phrase(n.b, c)}`;
    }
    case 'cmp': {
      const pct = !!(n.a.pct || n.b.pct);
      const [x, lit] = n.b.k === 'lit' ? [n.a, n.b] : n.a.k === 'lit' ? [n.b, n.a] : [null, null];
      if (!x) return `${shown(S, ev(n.a, c), pct)} ${n.op} ${shown(S, ev(n.b, c), pct)}`;
      const value = shown(S, ev(x, c), pct);
      const subject = x.k === 'dot' || x.k === 'name' || x.k === 'at' ? `${phrase(x, c)} is ` : '';
      if (n.op === '=' && subject) return `${subject}${value}`;
      return subject ? `${subject}${value}, ${n.op} ${unparse(lit)}` : `${value} ${n.op} ${unparse(lit)}`;
    }
    case 'call': {
      const f = n.name.toUpperCase(), a = n.args;
      if (f === 'ANY' && a.length === 2) {
        for (const item of toList(ev(a[0].x, c))) {
          const ci = withAt(c, item);
          if (truth(S, ev(a[1].x, ci)) === true) return `through ${describe(S, item)}: ${why(a[1].x, ci)}`;
        }
        return unparse(n);
      }
      if (f === 'WITHOUT' && a.length === 2) {
        const x = asRec(S, ev(a[0].x, c));
        if (!x?.id) return why(a[1].x, c);
        return `leaving out ${nameOf(S, x.id)}, ${why(a[1].x, { ...c, S: counterfactual(S, x.id, c.def) })}`;
      }
      if (f === 'IMPLIEDBY' && a.length >= 2) {
        const v = asRec(S, ev(a[0].x, c));
        const r = v?.id ? S.recs[v.id] : null;
        const held = r ? S.prov.get(keyOf(r)) ?? new Set() : new Set();
        const labels = a.slice(1).map(x => toText(S, ev(x.x, c))).filter(l => typeof l === 'string' && held.has(normal(l)));
        return `${relationText(S, a[0].x, r)} by ${labels.join(', ')}`;
      }
      if (S.P.reg.byName.has(normal(n.name))) {
        const v = asRec(S, ev(n, c));
        return `${relationText(S, n, v?.id ? S.recs[v.id] : null)} is attested`;
      }
      return unparse(n);
    }
  }
  return phrase(n, c);
}

// A relation record as words: its name, then its arguments' objects in order.
function relationText(S, callNode, r) {
  const name = callNode.k === 'call' ? callNode.name : 'Relation';
  return r?.args ? `${name}: ${r.args.map(x => nameOf(S, objectOf(S, x.at))).join(' → ')}` : name;
}

function safeWhy(n, c) {
  try { return why(n, c); } catch { return null; }
}

// For a computed record, or an entered one a formula covers: [{ label, text }], one for each implication
// that holds there, or for a value formula the branch of an IF or IFS that gave its output.
function explain(computed, id) {
  const S = computed.state;
  const r = S.recs[id];
  const defId = r?.computed ?? computed.covered?.[id]?.def;
  const d = defId && S.P.defs.find(x => x.id === defId);
  if (!d || d.error) return [];
  const c = contextFor(S, d, d.isRelation ? { args: r.args } : { at: r.at });
  if (d.imps) return d.imps.filter(imp => truth(S, safeEv(imp.ast, c)) === true)
    .map(imp => ({ label: imp.label, text: safeWhy(imp.ast, c) }));
  const top = d.ast;
  if (top?.k === 'call' && ['IF', 'IFS'].includes(top.name.toUpperCase())) {
    const conds = top.name.toUpperCase() === 'IF' ? [top.args[0]] : top.args.filter((_, i) => i % 2 === 0);
    const hit = conds.find(x => truth(S, safeEv(x.x, c)) === true);
    if (hit) return [{ label: null, text: hit.x.k === 'lit' ? 'none of the conditions before it held' : safeWhy(hit.x, c) }];
    if (!hit && top.name.toUpperCase() === 'IF') return [{ label: null, text: `not ${unparse(top.args[0].x)}` }];
  }
  return [];
}

// Works out an expression at a record, as if it were the formula of an entry located there, or of the
// given definition at one of its candidates (`at` being the candidate's computed id or argumentation key).
function evaluateAt(computed, text, at, defId) {
  const S = computed.state;
  let ast;
  try { ast = parseExpression(splitFormula(text).body); }
  catch (e) { return err('#SYNTAX', e.message); }
  const d = defId && S.P.defs.find(x => x.id === defId);
  if (d?.isRelation) {
    const cand = candidatesOf(S, d).find(c => c.id === at || c.key === at);
    return cand ? safeEv(ast, contextFor(S, d, cand)) : err('#VALUE!', 'That isn’t one of the definition’s candidates.');
  }
  return safeEv(ast, { S, self: { loc: at }, at: at ? recOf(at) : null, lets: null });
}

// Checks a formula as typed: its kind ('value' or 'implies'), and the first problem with a position.
function check(text) {
  const f = splitFormula(text);
  const offset = String(text ?? '').length - String(text ?? '').trimStart().length + (f.kind === 'implies' && String(text).trim().startsWith('<-') ? 2 : f.kind ? 1 : 0);
  try { parseExpression(f.body); return { kind: f.kind, error: null }; }
  catch (e) { return { kind: f.kind, error: { message: e.message, pos: (e.pos ?? 0) + offset } }; }
}

// Renames a name wherever a formula mentions it, keeping the rest as typed: for a relabeled edge or
// entry, as Excel renames a table column in its formulas.
function renameName(text, from, to) {
  const s = String(text ?? '');
  const start = /^\s*(=|←|<-)?/.exec(s)[0].length;
  const bare = /^[A-Za-z_][A-Za-z0-9_]*$/.test(to) && !KEYWORDS.has(to.toUpperCase());
  let toks;
  try { toks = tokenize(s.slice(start)); } catch { return s; }
  let out = '', last = 0;
  for (const t of toks) {
    if (t.k !== 'name' || !same(t.v, from)) continue;
    out += s.slice(last, start + t.pos) + (bare ? to : `[${to}]`);
    last = start + t.end;
  }
  return out + s.slice(last);
}

// Carries a relabeled edge or entry through the definitions and the pilot names: their formulas, an
// entry definition's name, a relation's edges and list keys, and any locations written out. Definitions'
// `covers` are parameterization keys, which model.js's rekey() moves as it moves styles. Returns new copies.
function relabel(definitions, names, from, to) {
  const swap = s => same(s, from) ? to : s;
  const inLocation = text => String(text).split(/\s*›\s*/).map((seg, i) => {
    if (!i) return seg;
    const m = /^(not\s+)?(.+?)(:\s*.+)?$/i.exec(seg);
    return `${m[1] ?? ''}${swap(m[2])}${m[3] ?? ''}`;
  }).join(' › ');
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
    name: d.args || d.covers && paramsOf(d.covers[0] ?? '[]').length > 1 ? d.name : swap(d.name),
    ...(d.formula !== undefined && { formula: renameName(d.formula, from, to) }),
    ...(d.implications && { implications: d.implications.map(i => ({ ...i, formula: renameName(i.formula, from, to) })) }),
    ...(d.at && { at: d.at.map(inLocation) }),
    ...(d.args && { args: d.args.map(a => ({ edge: swap(a.edge), at: a.at.map(inLocation) })) }),
  }));
  const rels = (names?.relations ?? []).map(r => ({
    ...r, edges: r.edges.map(swap), ...(r.form && { form: formKey(r.form) }),
    lists: Object.fromEntries(Object.entries(r.lists ?? {}).map(([k, v]) => [swap(k), Object.fromEntries(Object.entries(v).map(([k2, n]) => [swap(k2), n]))])),
  }));
  return { definitions: defs, names: { ...names, relations: rels } };
}

// Names that could go at the cursor, for autocomplete: after a dot, the names on what's before it, worked
// out at one of the definition's candidates (or at `at`); otherwise its arguments or its location's names,
// the relations, and the functions. Each is { name, kind }, filtered by what's typed so far.
function suggest(computed, defId, textBefore, at) {
  const S = computed.state;
  const d = defId && S.P.defs.find(x => x.id === defId);
  const body = splitFormula(textBefore).kind ? splitFormula(textBefore).body : String(textBefore ?? '');
  const m = /(\[[^\]]*|[A-Za-z_][A-Za-z0-9_]*)?$/.exec(body);
  const partial = (m[1] ?? '').replace(/^\[/, '');
  let toks;
  try { toks = tokenize(body.slice(0, body.length - (m[1] ?? '').length)).slice(0, -1); } catch { return []; }
  const cand = d ? candidatesOf(S, d)[0] : null;
  const c = cand ? contextFor(S, d, cand) : { S, self: { loc: at }, at: at ? recOf(at) : null, lets: null };
  let names;
  if (toks.at(-1)?.k === 'op' && toks.at(-1).v === '.') {
    const start = chainStart(toks, toks.length - 1);
    const src = body.slice(toks[start]?.pos ?? 0, toks.at(-1).pos);
    let v;
    try { v = safeEv(parseExpression(src), c); } catch { v = null; }
    names = namesOnValue(S, v);
  } else {
    names = [
      ...(d?.isRelation ? d.edges.map(e => ({ name: e, kind: 'argument' })) : c.self.loc ? namesOnValue(S, recOf(c.self.loc)) : []),
      ...[...S.P.reg.byName.values()].map(r => ({ name: r.name, kind: 'relation' })),
      ...Object.keys(FUNCTIONS).map(f => ({ name: f, kind: 'function' })),
    ];
  }
  return names.filter(x => normal(x.name).startsWith(normal(partial)));
}

// How a value reads. Numbers can be shown as percentages.
function formatValue(computed, v, { percent = false } = {}) {
  const S = computed.state;
  if (isErr(v)) return v.code;
  if (Array.isArray(v)) return v.length ? v.map(x => formatValue(computed, x, { percent })).join('; ') : '(empty list)';
  if (isRec(v)) {
    if (v.id === null) return '(blank)';
    const o = output(S, v.id);
    return isRec(o) ? nameOf(S, o.id) : formatValue(computed, o, { percent });
  }
  if (v === null || v === undefined) return '(blank)';
  if (typeof v === 'number') return percent ? `${tidyNumber(v * 100)}%` : String(tidyNumber(v));
  return toText(S, v);
}

return {
  computeState, evaluateAt, explain, check, suggest, renameName, relabel, formatValue, optionsWritten,
  coversOf, locationKey, parameterizationKey, computedId, splitFormula, tidyArrow, argKey,
  place: (computed, id) => placeOf(computed.state, id), nameOf: (computed, id) => nameOf(computed.state, id),
  formOf: (computed, id) => formOfRecord(computed.state, computed.state.recs[id]),
  isError: isErr, FUNCTION_NAMES: Object.keys(FUNCTIONS),
};

})();
