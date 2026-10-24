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
      toks.push({ k: 'num', v: readNumber(m[0]), pos: i });
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
        x = { k: 'dot', x, name: t.v };
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
    if (t.k === 'num' || t.k === 'str') return { k: 'lit', v: t.v };
    if (t.k === 'kw' && (t.v === 'TRUE' || t.v === 'FALSE')) return { k: 'lit', v: t.v === 'TRUE' };
    if (t.k === 'name') return { k: 'name', name: t.v };
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
  let key = `kind:${norm(loc.kind)}`;
  for (const s of loc.segs)
    key = JSON.stringify([s.choice !== undefined ? `choice:${norm(s.choice)}` : `tag:${s.tag}`, JSON.stringify([norm(s.edge), key])]);
  return key;
}

const parameterizationKey = params => JSON.stringify(params.map(p => JSON.stringify([norm(p.edge), p.spec])).sort());

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

const argKey = args => JSON.stringify(args.map(a => JSON.stringify([norm(a.edge), a.at])).sort());

function push(map, key, value) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
}

function addRecord(S, id, r) {
  S.memo?.clear();
  S.recs[id] = r;
  if (r.at) push(S.byAt, r.at, id);
  if (r.args) {
    for (const at of new Set(r.args.map(a => a.at))) push(S.relsAt, at, id);
    for (const obj of new Set(r.args.map(a => objectOf(S, a.at)))) push(S.relsAtObj, obj, id);
  }
}

// A relation's pilot name and list names, from its output type and edge labels.
const signature = (type, edges) => `${type}:${edges.map(norm).sort().join('|')}`;
const relationOf = (S, r) => S.P.reg.bySig.get(signature(typeOf(r), r.args.map(a => a.edge)));
const listNameOf = (rel, from, listed) => rel?.lists.get(`${norm(from)}|${norm(listed)}`) ?? listed;

// ---- Looking names up ----

// While a formula is worked out, the entries and relation records it reads are noted, to say why its
// record is there.
const note = (S, id) => { if (S.reads) S.reads.add(id); };

// What a name gives where nothing has it: an empty list for a list the schema has somewhere, BLANK for
// any other name the schema has somewhere, and an error for a name it doesn't have at all.
function missing(S, name) {
  const n = norm(name);
  if (S.P.known.lists.has(n)) return [];
  if (S.P.known.values.has(n)) return null;
  return err('#NAME?', `Nothing is called ${name}.`);
}

// The relatives listed under `n` at a location: the other arguments' objects, each remembering the relation
// record that links it. A ruled-out tag doesn't make a relative. Null if no relation here gives that list.
// An object also has the lists of relations whose parameter sits below it, the way a relation call fills a
// parameter through the object's record there: a fund's General Partners, though the relation is located
// at its Entity Type.
const listAt = (S, id, n) => remembered(S, `list|${id}|${n}`, () => listHere(S, id, n));
function listHere(S, id, n) {
  let hit = false;
  const items = [];
  const onObject = isObject(S.recs[id]);
  for (const rid of (onObject ? S.relsAtObj : S.relsAt).get(id) ?? []) {
    const r = S.recs[rid];
    const rel = relationOf(S, r);
    r.args.forEach((own, i) => {
      if (onObject ? objectOf(S, own.at) !== id : own.at !== id) return;
      r.args.forEach((other, j) => {
        if (i === j || norm(listNameOf(rel, own.edge, other.edge)) !== n) return;
        hit = true;
        if (isTag(r) && r.tag !== true) return;
        items.push(recOf(objectOf(S, other.at), rid));
        note(S, rid);
      });
    });
  }
  return hit ? items : null;
}

const ambiguous = name => err('#NAME?', `${name} could mean more than one thing here.`);

// A name on the relation record a relative was reached through: its arguments by edge label, its output
// by the relation's name, and the entries located at it.
function linkLookup(S, rid, n, name) {
  const r = S.recs[rid];
  if (!r) return null;
  const found = [];
  const arg = r.args.find(a => norm(a.edge) === n);
  if (arg) found.push(recOf(objectOf(S, arg.at)));
  if (norm(relationOf(S, r)?.name ?? '') === n) found.push(recOf(rid));
  const pending = forceEntry(S, rid, n);
  if (pending) return { v: pending };
  const entry = (S.byAt.get(rid) ?? []).find(e => norm(S.recs[e].edge) === n);
  if (entry) { found.push(recOf(entry)); note(S, entry); }
  else if (S.failed.has(`${rid}|${n}`)) found.push(S.failed.get(`${rid}|${n}`));
  if (found.length > 1) return { v: ambiguous(name) };
  return found.length ? { v: found[0] } : null;
}

// A name on one record: its entries by label, its lists of relatives by name, and a relation record's
// arguments by edge label.
function ownLookup(S, id, n, name) {
  const found = [];
  const pending = forceEntry(S, id, n) ?? forceLists(S, id, n);
  if (pending) return { v: pending };
  const entry = (S.byAt.get(id) ?? []).find(e => norm(S.recs[e].edge) === n);
  if (entry) { found.push(recOf(entry)); note(S, entry); }
  else if (S.failed.has(`${id}|${n}`)) found.push(S.failed.get(`${id}|${n}`));
  const list = listAt(S, id, n);
  if (list) found.push(list);
  const r = S.recs[id];
  const arg = isRelation(r) && r.args.find(a => norm(a.edge) === n);
  if (arg) found.push(recOf(objectOf(S, arg.at)));
  if (found.length > 1) return { v: ambiguous(name) };
  return found.length ? { v: found[0] } : null;
}

// A dot: on a list, the name on each item; on a record reached through a relation, the relation first;
// then the record itself, and on up its path to its object.
function lookupOn(S, v, name) {
  if (Array.isArray(v)) {
    const out = [];
    for (const x of v) {
      const y = lookupOn(S, x, name);
      if (isErr(y)) return y;
      if (Array.isArray(y)) out.push(...y); else out.push(y);
    }
    return out;
  }
  if (v === null || v === undefined || isErr(v)) return v ?? null;
  if (!isRec(v)) return err('#VALUE!', `Can’t look up ${name} on ${describe(S, v)}.`);
  if (v.id === null || !S.recs[v.id]) return null;
  const n = norm(name);
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
function lookupBare(c, name) {
  const n = norm(name);
  for (let l = c.lets; l; l = l.up) if (l.n === n) return l.v;
  if (c.self.args) return c.self.args.has(n) ? recOf(c.self.args.get(n)) : err('#NAME?', `${name} isn’t one of this relation’s arguments.`);
  return lookupOn(c.S, recOf(c.self.loc), name);
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
  if (r.computed) return r.value;
  if (r.field === 'number') return readNumber(r.value) ?? r.value;
  if (r.field === 'date') return { t: 'date', iso: r.value };
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
const toList = v => isErr(v) ? v : v === null ? [] : flatten(v);

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

function ordering(S, a, b) {
  if (a === null) a = typeof b === 'string' ? '' : typeof b === 'boolean' ? false : 0;
  if (b === null) b = typeof a === 'string' ? '' : typeof a === 'boolean' ? false : 0;
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
    case 'name': return lookupBare(c, node.name);
    case 'dot': return lookupOn(S, ev(node.x, c), node.name);
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
      for (const x of list) { const s = scalar(S, x); if (isErr(s)) return s; if (equal(a, s)) return true; }
      return false;
    }
    case 'bin': return arithmetic(S, node.op, ev(node.a, c), ev(node.b, c));
  }
  return err('#VALUE!', 'Unknown expression.');
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
  MIN(a, c) {
    const xs = numbersOf(a, c);
    return isErr(xs) ? xs : xs.length ? Math.min(...xs) : 0;
  },
  MAX(a, c) {
    const xs = numbersOf(a, c);
    return isErr(xs) ? xs : xs.length ? Math.max(...xs) : 0;
  },
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
    for (const item of list) { const t = truth(c.S, ev(a[1].x, { ...c, at: item })); if (isErr(t) || t) return t; }
    return false;
  },
  ALL(a, c) {
    const bad = arity('ALL', a, 2);
    if (bad) return bad;
    const list = toList(ev(a[0].x, c));
    if (isErr(list)) return list;
    for (const item of list) { const t = truth(c.S, ev(a[1].x, { ...c, at: item })); if (isErr(t) || !t) return t; }
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
      lets = { n: norm(a[i].x.name), v, up: lets };
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
    return remembered(c.S, `reach|${queue.join(',')}|${norm(step)}`, () => {
      const seen = new Set(), out = [];
      while (queue.length) {
        const items = toList(lookupOn(c.S, recOf(queue.shift()), step));
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
    const from = asRec(c.S, ev(a[0].x, c)), to = asRec(c.S, ev(a[1].x, c));
    if (isErr(from)) return from;
    if (isErr(to)) return to;
    if (!from?.id || !to?.id) return null;
    const out = new Map(), queue = [from.id], seen = new Set([from.id]);
    while (queue.length) {
      const u = queue.shift(), edges = [];
      const items = toList(lookupOn(c.S, recOf(u), step));
      if (isErr(items)) return items;
      for (const item of items) {
        if (!isRec(item) || !item.id) continue;
        const f = toNumber(c.S, lookupOn(c.S, item, factor));
        if (isErr(f)) return f;
        edges.push([item.id, f]);
        if (!seen.has(item.id)) { seen.add(item.id); queue.push(item.id); }
      }
      out.set(u, edges);
    }
    const total = new Map();
    let wave = new Map([[from.id, 1]]);
    for (let k = 0; wave.size; k++) {
      if (k > 10000) return err('#VALUE!', 'The look-through doesn’t settle: a loop multiplies to 100% or more.');
      const next = new Map();
      for (const [u, w] of wave) for (const [v, f] of out.get(u) ?? []) next.set(v, (next.get(v) ?? 0) + w * f);
      let size = 0;
      for (const [v, w] of next) { total.set(v, (total.get(v) ?? 0) + w); size = Math.max(size, Math.abs(w)); }
      wave = size < 1e-15 ? new Map() : next;
    }
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
    const held = c.S.prov.get(argKey(argsOf(r))) ?? new Set();
    for (const x of a.slice(1)) {
      const label = toText(c.S, ev(x.x, c));
      if (isErr(label)) return label;
      if (held.has(norm(label))) return true;
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

function eachItem(a, c, use) {
  const list = toList(ev(a[0].x, c));
  if (isErr(list)) return list;
  const out = [];
  for (const item of list) {
    const stop = use(item, ev(a[1].x, { ...c, at: item }), out);
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

function textFn(a, c, name, min, max, fn) {
  const bad = arity(name, a, min, max);
  if (bad) return bad;
  const t = toText(c.S, ev(a[0].x, c));
  if (isErr(t)) return t;
  const n = a[1] ? toNumber(c.S, ev(a[1].x, c)) : undefined;
  return isErr(n) ? n : fn(t, n);
}

function call(node, c) {
  const fn = FUNCTIONS[node.name.toUpperCase()];
  if (fn) return fn(node.args, c);
  const rel = c.S.P.reg.byName.get(norm(node.name));
  if (rel) return callRelation(c, rel, node.args);
  return err('#NAME?', `There’s no function or relation called ${node.name}.`);
}

// A relation by its name: the record between the given arguments, or a record with no id where none is
// recorded. An object given for a parameter that sits below its objects fills it through its record there.
function callRelation(c, rel, a) {
  const S = c.S;
  if (a.length !== rel.edges.length) return err('#VALUE!', `${rel.name} takes ${rel.edges.length} arguments.`);
  const given = new Map();
  if (a.some(x => x.label)) {
    for (const x of a) {
      const edge = rel.edges.find(e => same(e, x.label ?? ''));
      if (!edge) return err('#NAME?', `${rel.name} has no argument called ${x.label ?? '(unlabeled)'}.`);
      given.set(norm(edge), x.x);
    }
    if (given.size !== rel.edges.length) return err('#VALUE!', `Give each of ${rel.name}’s arguments once.`);
  } else rel.edges.forEach((e, i) => given.set(norm(e), a[i].x));
  const ids = new Map();
  for (const [edge, x] of given) {
    const v = asRec(S, ev(x, c));
    if (isErr(v)) return v;
    if (!v?.id) return recOf(null);
    ids.set(edge, v.id);
  }
  const first = objectOf(S, [...ids.values()][0]);
  const pending = forceRelation(S, first, rel.name);
  if (pending) return pending;
  for (const rid of S.relsAtObj.get(first) ?? []) {
    const r = S.recs[rid];
    if (signature(typeOf(r), r.args.map(x => x.edge)) !== signature(rel.type, rel.edges)) continue;
    const fits = r.args.every(x => {
      const g = ids.get(norm(x.edge));
      return isObject(S.recs[g]) ? objectOf(S, x.at) === g : x.at === g;
    });
    if (fits) { note(S, rid); return recOf(rid); }
  }
  // A value formula that gave an error there passes it on.
  for (const { args, error } of S.failed.get(`rel|${first}|${norm(rel.name)}`) ?? [])
    if (args.every(x => { const g = ids.get(norm(x.edge)); return isObject(S.recs[g]) ? objectOf(S, x.at) === g : x.at === g; })) return error;
  return recOf(null);
}


// ---- Definitions, and the order they're worked out in ----

const typeOfDef = d => d.type === 'field' ? 'field' : d.type === 'choice' ? 'choice' : 'tag';

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
        return { label: clean(i.label), ast: parseExpression(f.body) };
      });
    } else {
      const f = splitFormula(def.formula);
      if (f.kind === 'implies') throw new FormulaError(d.type === 'tag' ? 'Write a tag’s implications as separate rows.' : 'Only a tag can be implied; start this formula with =.', 0);
      if (f.kind !== 'value') throw new FormulaError('A formula starts with = (or ← for a tag’s implication).', 0);
      d.ast = parseExpression(f.body);
    }
  } catch (e) {
    d.error = e instanceof FormulaError ? e.message : String(e);
  }
  return d;
}

const writtenEdge = (d, edge) => d.edges.find(e => norm(e) === edge) ?? edge;
const edgeIndex = (d, edge) => d.edges.findIndex(e => norm(e) === edge);

// The names a formula mentions: every name after a dot, every relation it calls, and every name on its own
// that isn't one of its own arguments. Names inside WITHOUT are kept apart too.
function namesIn(ast, own) {
  const refs = new Set(), inWithout = new Set();
  const walk = (n, w) => {
    if (!n) return;
    const add = name => { refs.add(norm(name)); if (w) inWithout.add(norm(name)); };
    if (n.k === 'name') { if (!own.has(norm(n.name))) add(n.name); return; }
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

// What a definition provides names for: its own name, and for a relation, its lists of relatives.
function namesProvided(d, reg) {
  const out = new Set([norm(d.name)]);
  if (d.isRelation) {
    const rel = reg.byName.get(norm(d.name));
    d.edges.forEach((own, i) => d.edges.forEach((other, j) => { if (i !== j) out.add(norm(listNameOf(rel, own, other))); }));
  }
  return out;
}

function registry(names, defs) {
  const rels = (names?.relations ?? []).map(r => ({ ...r }));
  for (const d of defs) if (d.isRelation && !rels.some(r => same(r.name, d.name)))
    rels.push({ name: d.name, type: typeOfDef(d), edges: d.edges, lists: {} });
  const reg = { byName: new Map(), bySig: new Map() };
  for (const r of rels) {
    const lists = new Map();
    for (const [from, listed] of Object.entries(r.lists ?? {}))
      for (const [to, name] of Object.entries(listed)) lists.set(`${norm(from)}|${norm(to)}`, name);
    const rel = { name: r.name, type: r.type, edges: r.edges, lists };
    reg.byName.set(norm(r.name), rel);
    reg.bySig.set(signature(r.type, r.edges), rel);
  }
  return reg;
}

// Every name the schema has somewhere, so a name missing at one record can read as BLANK there.
function knownNames(entered, defs, reg) {
  const lists = new Set(), values = new Set();
  const addRelation = (type, edges) => {
    const rel = reg.bySig.get(signature(type, edges));
    edges.forEach((own, i) => edges.forEach((other, j) => { if (i !== j) lists.add(norm(listNameOf(rel, own, other))); }));
    edges.forEach(e => values.add(norm(e)));
    if (rel) values.add(norm(rel.name));
  };
  for (const r of Object.values(entered)) {
    if (r.args) addRelation(typeOf(r), r.args.map(a => a.edge));
    else if (r.edge) values.add(norm(r.edge));
  }
  for (const d of defs) {
    if (d.isRelation) addRelation(typeOfDef(d), d.edges);
    else values.add(norm(d.name));
    for (const ps of d.params) for (const p of ps) edgesInSpec(p.spec).forEach(e => values.add(e));
  }
  for (const rel of reg.byName.values()) addRelation(rel.type, rel.edges);
  return { lists, values };
}

// Groups definitions that depend on each other, dependencies first (Tarjan's algorithm).
function plan(defs, reg) {
  const provides = new Map();
  for (const d of defs) for (const n of namesProvided(d, reg)) push(provides, n, d);
  const deps = new Map();
  for (const d of defs) {
    const own = new Set(d.isRelation ? d.edges.map(norm) : []);
    const asts = d.error ? [] : d.imps ? d.imps.map(i => i.ast) : [d.ast];
    const refs = new Set(), inWithout = new Set();
    for (const ast of asts) {
      const found = namesIn(ast, own);
      found.refs.forEach(n => refs.add(n));
      found.inWithout.forEach(n => inWithout.add(n));
    }
    // A location that runs through another definition's records depends on them too.
    for (const ps of d.params) for (const p of ps) edgesInSpec(p.spec).forEach(e => refs.add(e));
    d.dependsOn = new Set([...refs].flatMap(n => provides.get(n) ?? []));
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
const rootLabel = r => isTag(r) ? `tag:${r.tag}` : isChoice(r) ? `choice:${norm(r.choice)}` : `field:${r.field}`;
function specOf(S, id) {
  if (S.specs.has(id)) return S.specs.get(id);
  const r = S.recs[id];
  if (!r) return null;
  let key = `kind:${norm(r.kind)}`;
  if (!isObject(r)) {
    const parts = [];
    for (const a of argsOf(r)) {
      const s = specOf(S, a.at);
      if (s === null) return null;
      parts.push(JSON.stringify([norm(a.edge), s]));
    }
    key = JSON.stringify([rootLabel(r), ...parts.sort()]);
  }
  S.specs.set(id, key);
  push(S.bySpec, key, id);
  return key;
}

// A computed record's id comes from its argumentation, so it stays the same from one working-out to the next.
const computedId = args => `fx:${args.map(a => `${norm(a.edge)}=${a.at}`).sort().join('&')}`;

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
  if (d.isRelation) return { S, def: d, self: { args: new Map(cand.args.map(a => [norm(a.edge), objectOf(S, a.at)])) }, at: null, lets: null };
  return { S, def: d, self: { loc: cand.at }, at: recOf(cand.at), lets: null };
}

function makeRecord(d, cand, out) {
  const base = d.isRelation ? { args: cand.args } : { at: cand.at, edge: d.name };
  const type = typeOfDef(d);
  if (type === 'tag') return { ...base, tag: out, computed: d.id };
  if (type === 'choice') return { ...base, choice: out, computed: d.id };
  return { ...base, field: d.datatype ?? 'number', value: out, computed: d.id };
}

// The options a choice's formula may give: those its entries have already, and any written into it.
function optionsOf(S, d) {
  if (!d.options) {
    const opts = [];
    const add = o => { if (!opts.some(x => same(x, o))) opts.push(o); };
    for (const r of Object.values(S.entered)) if (isChoice(r) && !r.args && same(r.edge, d.name)) add(r.choice);
    const walk = n => {
      if (!n || typeof n !== 'object') return;
      if (n.k === 'lit' && typeof n.v === 'string') add(n.v);
      for (const x of Object.values(n)) Array.isArray(x) ? x.forEach(y => walk(y?.x ?? y)) : walk(x);
    };
    walk(d.ast);
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
  if (d.datatype === 'text') { const t = toText(S, v); return isErr(t) ? { error: t } : { out: t }; }
  return typeof v === 'number' ? { out: v } : wrong('a number');
}

// ---- Working out the state ----

function stateFor(P, entered) {
  const S = { P, entered, recs: {}, byAt: new Map(), relsAt: new Map(), relsAtObj: new Map(), specs: new Map(), bySpec: new Map(),
    enteredByKey: new Map(), prov: new Map(), rows: new Map(), lazy: null, reads: null, done: 0, cf: new Map(), memo: new Map(), steps: [],
    failed: new Map() };
  for (const [id, r] of Object.entries(entered)) addRecord(S, id, r);
  for (const [id, r] of Object.entries(entered)) {
    specOf(S, id);
    if (!isObject(r)) S.enteredByKey.set(argKey(argsOf(r)), id);
  }
  return S;
}

function addComputed(S, id, r) {
  addRecord(S, id, r);
  specOf(S, id);
}

// Works out one step: a group of definitions that read each other.
function runStep(S, i) {
  const started = now();
  const group = S.P.order[i].filter(d => !d.error);
  const kinds = new Set(group.map(d => d.imps ? 'implies' : 'value'));
  if (kinds.size > 1) {
    for (const d of group) d.error = 'This loops through a = formula and implications together (#CIRCULAR!).';
  } else if (kinds.has('implies')) settleImplications(S, group);
  else settleValues(S, group);
  S.steps.push({ defs: S.P.order[i].map(d => d.id), ms: now() - started });
}

function runUpTo(S, limit) {
  for (; S.done < limit; S.done++) runStep(S, S.done);
}

const now = () => typeof performance === 'object' ? performance.now() : Date.now();

// Works out an expression with what it reads noted. What it reads counts as read by any expression
// it's part of, too.
function reading(S, fn) {
  const outer = S.reads;
  S.reads = new Set();
  try { return { v: fn(), reads: [...S.reads] }; }
  finally {
    if (outer) for (const id of S.reads) outer.add(id);
    S.reads = outer;
  }
}

// Lookups are kept until the state changes, which in a round of implications is not until its end.
function remembered(S, key, fn) {
  if (!S.memo.has(key)) S.memo.set(key, reading(S, fn));
  const { v, reads } = S.memo.get(key);
  reads.forEach(id => note(S, id));
  return v;
}

function safeEv(ast, c) {
  try { return ev(ast, c); }
  catch (e) { return err('#VALUE!', e instanceof RangeError ? 'This goes around too many times.' : String(e)); }
}

// Value formulas are worked out on demand, so a record can read the same definition's records elsewhere,
// as a spreadsheet cell reads other cells. Asking for a record that's being worked out is a loop.
function settleValues(S, group) {
  S.lazy = { cands: new Map(), entry: new Map(), lists: new Map(), rels: new Map() };
  const overlaps = [];
  for (const d of group) for (const cand of candidatesOf(S, d)) {
    if (S.enteredByKey.has(cand.key)) { overlaps.push({ d, cand }); continue; }
    S.lazy.cands.set(cand.key, { d, cand, state: 'todo' });
    if (!d.isRelation) S.lazy.entry.set(`${cand.at}|${norm(d.name)}`, cand.key);
    else {
      const rel = S.P.reg.byName.get(norm(d.name));
      cand.args.forEach((own, i) => cand.args.forEach((other, j) => {
        if (i === j) return;
        const list = norm(listNameOf(rel, own.edge, other.edge));
        push(S.lazy.lists, `${own.at}|${list}`, cand.key);
        const obj = objectOf(S, own.at);
        if (obj !== own.at) push(S.lazy.lists, `${obj}|${list}`, cand.key);
      }));
      for (const obj of new Set(cand.args.map(a => objectOf(S, a.at)))) push(S.lazy.rels, `${obj}|${norm(d.name)}`, cand.key);
    }
  }
  for (const key of S.lazy.cands.keys()) force(S, key);
  for (const { d, cand } of overlaps) {
    const { v, reads } = reading(S, () => safeEv(d.ast, contextFor(S, d, cand)));
    const res = asOutput(S, d, v);
    const enteredId = S.enteredByKey.get(cand.key);
    const mark = res.error || res.none ? null : equal(scalar(S, recOf(enteredId)), res.out) ? 'agrees' : 'differs';
    addRow(S, d, { ...cand, entered: enteredId, formula: res.error ?? res.out ?? null, mark, reads });
  }
  S.lazy = null;
}

function force(S, key) {
  const job = S.lazy?.cands.get(key);
  if (!job || job.state === 'done') return null;
  if (job.state === 'busy') return circular();
  job.state = 'busy';
  const { v, reads } = reading(S, () => safeEv(job.d.ast, contextFor(S, job.d, job.cand)));
  const res = asOutput(S, job.d, v);
  job.state = 'done';
  if (res.error) {
    addRow(S, job.d, { ...job.cand, error: res.error, reads });
    // Whatever reads the record reads the error instead.
    if (!job.d.isRelation) S.failed.set(`${job.cand.at}|${norm(job.d.name)}`, res.error);
    else for (const obj of new Set(job.cand.args.map(a => objectOf(S, a.at)))) push(S.failed, `rel|${obj}|${norm(job.d.name)}`, { args: job.cand.args, error: res.error });
  } else if (!res.none) {
    addComputed(S, job.cand.id, makeRecord(job.d, job.cand, res.out));
    addRow(S, job.d, { ...job.cand, value: res.out, reads });
  }
  return null;
}

const forceEntry = (S, at, n) => S.lazy?.entry.has(`${at}|${n}`) ? force(S, S.lazy.entry.get(`${at}|${n}`)) : null;
function forceMany(S, keys) {
  for (const k of keys ?? []) { const e = force(S, k); if (e) return e; }
  return null;
}
const forceLists = (S, at, n) => S.lazy ? forceMany(S, S.lazy.lists.get(`${at}|${n}`)) : null;
const forceRelation = (S, obj, name) => S.lazy ? forceMany(S, S.lazy.rels.get(`${obj}|${norm(name)}`)) : null;

// Implications that read each other are worked out together: start with nothing attested by them, attest
// whatever some implication holds for, and repeat until nothing more is attested. That's the fewest
// attestations they support. Each round reads the state as the last one left it, so lookups can be kept
// for the round. The last round, which attests nothing new, says which implications hold for each record;
// a record none hold for any more came from a loop through something like NOT, and is marked circular.
function settleImplications(S, group) {
  const derived = new Set();
  let held;
  for (let round = 0; round < 1000; round++) {
    held = new Map();
    const fresh = [];
    for (const d of group) for (const cand of candidatesOf(S, d)) {
      const h = holding(S, d, cand);
      held.set(cand.key, { d, cand, ...h });
      if (h.labels.length && !S.enteredByKey.has(cand.key) && !derived.has(cand.key)) fresh.push({ d, cand });
    }
    if (!fresh.length) break;
    for (const { d, cand } of fresh) {
      derived.add(cand.key);
      addComputed(S, cand.id, makeRecord(d, cand, true));
    }
  }
  for (const { d, cand, labels, errors, reads } of held.values()) {
    const enteredId = S.enteredByKey.get(cand.key);
    if (derived.has(cand.key) && !labels.length) addRow(S, d, { ...cand, error: circular(), errors });
    else if (enteredId) {
      const tag = S.entered[enteredId].tag;
      if (labels.length || errors.length)
        addRow(S, d, { ...cand, entered: enteredId, formula: labels.length ? true : null, labels, errors, reads,
          mark: labels.length ? tag ? 'also implied' : 'overrides' : null });
    } else if (labels.length) addRow(S, d, { ...cand, value: true, labels, errors, reads });
    else if (errors.length) addRow(S, d, { ...cand, error: errors[0].error, errors });
  }
}

// Which of a definition's implications hold at a candidate, with what each one read.
function holding(S, d, cand) {
  const labels = [], errors = [], reads = {};
  for (const imp of d.imps) {
    const { v, reads: r } = reading(S, () => truth(S, safeEv(imp.ast, contextFor(S, d, cand))));
    if (isErr(v)) errors.push({ label: imp.label, error: v });
    else if (v) {
      if (!labels.includes(imp.label)) labels.push(imp.label);
      reads[imp.label] = [...new Set([...(reads[imp.label] ?? []), ...r])];
    }
  }
  S.prov.set(cand.key, new Set(labels.map(norm)));
  return { labels, errors, reads };
}

function addRow(S, d, row) {
  if (!S.rows.has(d.id)) S.rows.set(d.id, []);
  S.rows.get(d.id).push({ def: d.id, ...row });
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
  const add = (name, kind) => { if (!out.has(norm(name))) out.set(norm(name), { name, kind }); };
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
      for (const rid of S.relsAt.get(id) ?? []) {
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
  const P = { defs, reg, known: knownNames(entered, defs, reg) };
  P.order = plan(defs, reg);
  const S = stateFor(P, entered);
  runUpTo(S, P.order.length);
  const keptAside = Object.keys(S.recs).filter(id => !S.recs[id].computed && argsOf(S.recs[id]).some(a => !S.recs[a.at]));
  const records = Object.fromEntries(Object.entries(S.recs).filter(([id]) => !keptAside.includes(id)));
  const computed = {}, covered = {}, errors = [];
  for (const rows of S.rows.values()) for (const row of rows) {
    if (row.error) errors.push({ def: row.def, id: row.id, args: row.args, error: row.error });
    else if (row.entered) covered[row.entered] = { def: row.def, mark: row.mark, formula: row.formula, labels: row.labels ?? [] };
    else if (S.recs[row.id]) computed[row.id] = { def: row.def, labels: row.labels ?? [], reads: row.reads ?? [] };
  }
  const defErrors = Object.fromEntries(defs.filter(d => d.error).map(d => [d.id, d.error]));
  const ms = (typeof performance === 'object' ? performance.now() : Date.now()) - started;
  return { records, computed, covered, errors, rows: Object.fromEntries(S.rows), defErrors, keptAside,
    order: P.order.map(g => g.map(d => d.id)), steps: S.steps, ms, state: S };
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
  const defs = definitions.map(d => ({
    ...d,
    name: d.args || d.covers && paramsOf(d.covers[0] ?? '[]').length > 1 ? d.name : swap(d.name),
    ...(d.formula !== undefined && { formula: renameName(d.formula, from, to) }),
    ...(d.implications && { implications: d.implications.map(i => ({ ...i, formula: renameName(i.formula, from, to) })) }),
    ...(d.at && { at: d.at.map(inLocation) }),
    ...(d.args && { args: d.args.map(a => ({ edge: swap(a.edge), at: a.at.map(inLocation) })) }),
  }));
  const rels = (names?.relations ?? []).map(r => ({
    ...r, edges: r.edges.map(swap),
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
  return names.filter(x => norm(x.name).startsWith(norm(partial)));
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
  computeState, evaluateAt, check, suggest, renameName, relabel, formatValue,
  coversOf, locationKey, parameterizationKey, computedId, splitFormula, tidyArrow, argKey,
  place: (computed, id) => placeOf(computed.state, id), nameOf: (computed, id) => nameOf(computed.state, id),
  isError: isErr, FUNCTION_NAMES: Object.keys(FUNCTIONS),
};

})();
