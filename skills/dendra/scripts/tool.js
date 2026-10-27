// DendraTool: a Dendra workbook kept from outside the window. It reads a workbook's words (vocab), its records
// (show) and what needs attention (check); it records a plan of records, written in the chart's own words, as
// changes made by a named person (apply); and it begins a chart from another's schema, definitions and views
// (new). It is Dendra's own core at work: Tree, Notes, Log and Formulas (app/core), loaded first. Everything
// goes in and comes out as text, so one script serves Node (dendra.js) and a headless browser (dendra.sh):
//   DendraTool.run(command, { workbook, plan, template, chart, find, day, name, who, from }) →
//     { text, workbook: text or null, ok }
// See ../SKILL.md, and references/plans.md for a plan.
const DendraTool = (() => {
const T = Tree;
class Refusal extends Error {}
const refuse = msg => { throw new Refusal(msg); };
const quote = s => `“${s}”`;
const list = (xs, and = 'and') => xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} ${and} ${xs.at(-1)}`;
const today = () => Log.today();
const isDay = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && T.parseDate(d) === d;
const first = s => { const t = String(s ?? '').split(/(?<=\.)\s|\n/)[0]; return t.length > 200 ? `${t.slice(0, 199).replace(/\s+\S*$/, '')}…` : t; };

// The nearest of some names to one misspelt or abbreviated, for "did you mean": one whose initials it is (LP,
// LLC), or else the one with most pairs of letters in common.
function nearest(word, names) {
  const w = T.norm(word), initials = n => T.norm(n).split(/[\s-]+/).map(p => p[0]).join('');
  const short = names.find(n => w.replace(/[.\s]/g, '').length > 1 && initials(n) === w.replace(/[.\s]/g, ''));
  if (short) return ` Did you mean ${quote(short)}?`;
  const grams = s => new Set([...Array(Math.max(1, s.length - 1)).keys()].map(i => s.slice(i, i + 2)));
  const g = grams(w), score = n => { const h = grams(T.norm(n)); let k = 0; for (const x of g) if (h.has(x)) k++; return k / Math.max(g.size, h.size); };
  const best = names.map(n => [n, score(n)]).filter(([, s]) => s >= 0.4).sort((a, b) => b[1] - a[1]);
  return best.length ? ` Did you mean ${quote(best[0][0])}?` : '';
}

function open(text, what = 'The workbook') {
  let wb;
  try { wb = Log.open(text); } catch (e) { refuse(`${what} isn’t a Dendra workbook: ${e.message}`); }
  return wb;
}
function chartOf(wb, want) {
  const cs = wb.charts();
  if (!cs.length) refuse('The workbook has no chart. Begin one with the new command.');
  if (want === undefined || want === null || want === '') {
    if (cs.length === 1) return cs[0];
    refuse(`The workbook has ${cs.length} charts; say which: ${list(cs.map(c => quote(c.name)), 'or')}.`);
  }
  return cs.find(c => c.chart === want || T.same(c.name, want)) ?? refuse(`The workbook has no chart ${quote(want)}. Its charts: ${list(cs.map(c => quote(c.name)))}.`);
}

// A chart worked out as of a day, as the window works it out.
function work(wb, chart, day = today()) {
  const S = wb.schema(chart), N = wb.notes(chart);
  const R = Formulas.computeState(wb.asOf(chart, day), N.definitions(S), { relations: N.relations(S), schema: S }, null);
  return { S, N, R, day };
}
// Every live record in its latest version, whatever its period: what a name can find, before or after the day.
function everything(wb, chart) {
  const recs = {};
  for (const r of wb.rows(chart)) if ('record' in r) {
    const { id, record, ...rec } = r, was = recs[record];
    if (!was || (rec.since ?? '') >= (was.since ?? '')) recs[record] = rec;
  }
  return recs;
}

// ---- How things read ----
const outText = r => 'field' in r ? T.format(r.field, r.value) : 'choice' in r ? r.choice : 'tag' in r ? (r.tag ? 'Yes' : 'No') : '';
function said(N, recs, id) {
  const r = recs[id];
  if (!r) return id;
  if (T.isObject(r)) return `${r.kind} ${quote(N.nameOf(recs, id))}`;
  if (r.args) return `${N.nameOf(recs, id)}: ${N.segmentOf(recs, id)}${'tag' in r && r.tag ? '' : ` (${outText(r)})`}`;
  const place = N.placeOf(recs, id);
  return 'field' in r ? `${place}: ${outText(r)}` : place;
}
const objOf = (recs, id) => { while (recs[id]?.at) id = recs[id].at; return id; };

// ---- The chart's words: its kinds, the entries at each, and its relations ----
// What can be recorded: the schema's specifications, and the dates a Start or End note names where nothing has
// one yet (an entity's Dissolution Date, a general partner's Withdrawal Date), as patterns.
const known = (S, N) => [...Object.values(S), ...['Start', 'End'].flatMap(l => N.notes(l)).filter(n => !n.view && n.pattern.out?.field && n.pattern.args?.length === 1).map(n => n.pattern)];
function words(S, N) {
  const specs = known(S, N), worked = new Map(), single = specs.filter(s => s.args?.length === 1);
  for (const d of N.definitions(S)) for (const k of d.covers) worked.set(k, d.name);
  const rank = (p, o) => { const r = N.resolve('Order', { out: { choice: o }, args: p.args }); return r?.note.pattern.out ? r.value : Infinity; };
  // The entries at locations like loc (a kind, an option, a relation), each by its edge with what it takes.
  function entriesAt(locs) {
    const by = new Map();
    for (const loc of locs) for (const s of single.filter(q => T.narrower(loc, q.args[0].loc))) {
      const e = T.norm(s.args[0].edge);
      by.has(e) ? by.get(e).specs.push(s) : by.set(e, { edge: s.args[0].edge, specs: [s] });
    }
    return [...by.values()].map(g => {
      const s = g.specs[0], p = T.bare(s), takes = 'field' in s.out ? { field: s.out.field } : 'choice' in s.out ? { choice: true } : { tag: true };
      const options = takes.choice ? [...new Set(g.specs.map(x => x.out.choice))].sort((a, b) => rank(p, a) - rank(p, b) || a.localeCompare(b)) : null;
      const formula = g.specs.map(x => worked.get(T.paramKey(x))).find(Boolean) ?? null;
      const order = N.order(p);
      return { ...g, takes, options, formula, order: typeof order === 'number' ? order : Infinity,
        required: N.required(p), check: N.check(p), start: N.isStart(s), end: N.isEnd(s), description: N.description(p) ?? null };
    }).sort((a, b) => (T.same(a.edge, 'Name') ? -1 : T.same(b.edge, 'Name') ? 1 : 0) || a.order - b.order || a.edge.localeCompare(b.edge));
  }
  const kinds = [...new Set(specs.filter(s => s.kind && s.kind !== 'View').map(s => s.kind))];
  // A relation named in more than one place (Evidence, of a position and of a signing authority) is one.
  const byName = new Map();
  for (const r of N.relations(S)) {
    const id = `${T.norm(r.name)}|${r.edges.map(T.norm).sort()}`;
    byName.has(id) ? byName.get(id).covers.push(...r.covers) : byName.set(id, { ...r, covers: [...r.covers] });
  }
  const relations = [];
  for (const r of byName.values()) {
    const keys = new Set(r.covers), rs = specs.filter(s => s.args?.length > 1 && keys.has(T.paramKey(s)));
    if (!rs.length) continue;
    const formula = rs.map(s => worked.get(T.paramKey(s))).find(Boolean) ?? null;
    relations.push({ ...r, specs: rs, formula, description: N.description(T.bare(rs[0])) ?? null });
  }
  return { kinds, entriesAt, relations, worked, specs };
}
// What a location is, in words: a kind; a relation (a Position, as Director); or an option of an entry at one
// (an Entity whose Entity Type is Limited Partnership).
function placeWords(loc, N) {
  if (loc.kind) return loc.kind;
  if (loc.args?.length > 1) return `a ${N.name(T.bare(loc))}${loc.out?.choice ? ` (${loc.out.choice})` : ''}`;
  const a = loc.args?.[0];
  if (!a) return 'anything';
  const v = loc.out?.choice ?? (loc.out?.tag === true ? 'checked' : loc.out?.tag === false ? 'unchecked' : null);
  return `${placeWords(a.loc, N)} whose ${a.edge} is ${v ?? 'given'}`;
}
const takesWords = g => g.takes.field ? T.DATATYPES[g.takes.field].toLowerCase() : g.takes.tag ? 'a checkbox' : `one of ${list(g.options.map(quote), 'or')}`;

// vocab: what can be recorded in a chart, and what Dendra works out itself.
function vocab(wb, o) {
  const { chart, name } = chartOf(wb, o.chart), { S, N } = work(wb, chart), W = words(S, N), out = [];
  out.push(`${name}: what can be recorded`, '', 'An entry marked “worked out” is Dendra’s, from a formula: leave it out. “Required” is counted blank until given;',
    '“a check” is counted an error where it fails. “Starts it” and “ends it” are dates that bound when the record holds.', '');
  const entry = (g, depth) => {
    const pad = '  '.repeat(depth), tags = [g.required && 'required', g.start && 'starts it', g.end && 'ends it', g.formula && `worked out (${g.formula})`, g.check && 'a check'].filter(Boolean);
    out.push(`${pad}${g.edge}: ${takesWords(g)}${tags.length ? ` · ${tags.join(' · ')}` : ''}`);
    if (g.description && depth < 3) out.push(`${pad}  ${first(g.description)}`);
    for (const s of g.specs) {
      const inner = W.entriesAt([s]);
      if (!inner.length) continue;
      out.push(`${pad}  at ${g.takes.choice ? quote(s.out.choice) : g.takes.tag ? (s.out.tag ? 'checked' : 'unchecked') : 'it'}:`);
      inner.forEach(i => entry(i, depth + 2));
    }
  };
  out.push('KINDS (an object of each is a box on a chart)');
  for (const k of W.kinds) { out.push('', k); W.entriesAt([{ kind: k }]).forEach(g => entry(g, 1)); }
  out.push('', '', 'RELATIONS (each a line or a list; its sides by their edges)');
  for (const r of W.relations) {
    const sides = r.edges.map(e => `${e}: ${list([...new Set(r.specs.map(s => placeWords(s.args.find(a => T.same(a.edge, e)).loc, N)))], 'or')}`);
    const takes = r.type === 'choice' ? ` · one of ${list([...new Set(r.specs.map(s => s.out.choice).filter(Boolean))].map(quote), 'or')}` : r.type === 'field' ? ` · ${T.DATATYPES[r.specs[0].out.field]?.toLowerCase()}` : '';
    out.push('', `${r.name}${takes}${r.formula ? ` · worked out (${r.formula})` : ''}`, ...sides.map(s => `  ${s}`));
    if (r.description) out.push(`  ${first(r.description)}`);
    W.entriesAt(r.specs).forEach(g => entry(g, 1));
  }
  return { text: out.join('\n') };
}

// show: the records, each with its entries and its relations; with find, only those whose names have it.
function show(wb, o) {
  const { chart, name } = chartOf(wb, o.chart), day = o.day ?? today();
  if (!isDay(day)) refuse(`The day ${quote(day)} isn’t a day; write it as 2026-03-02.`);
  const { N, R } = work(wb, chart, day), recs = R.records, ix = T.index(recs), out = [];
  const objects = Object.keys(recs).filter(id => T.isObject(recs[id]) && recs[id].kind !== 'View');
  const want = o.find ? T.norm(o.find) : null;
  const hit = id => !want || id === o.find || T.norm(N.nameOf(recs, id)).includes(want) || T.norm(N.shortOf(recs, id)).includes(want);
  // An entered record by its id, to name it in a plan; a worked-out one as so, since it's Dendra's.
  const marks = id => R.computed[id] ? ' (worked out)' : `${R.covered[id]?.agrees === false ? ' (entered over its formula)' : ''}  [${id}]`;
  const tree = (id, depth) => {
    for (const e of ix.entries.get(id) ?? []) {
      const r = recs[e];
      out.push(`${'  '.repeat(depth)}${r.edge}: ${outText(r)}${marks(e)}`);
      tree(e, depth + 1);
    }
  };
  const shown = objects.filter(hit).sort((a, b) => recs[a].kind.localeCompare(recs[b].kind) || N.nameOf(recs, a).localeCompare(N.nameOf(recs, b)));
  out.push(`${name}, as of ${T.formatDate(day, 'long')}: ${shown.length} of ${objects.length} objects${want ? ` named like ${quote(o.find)}` : ''}`);
  if (!want) {
    out.push('(Each by its kind, name and id. Add --find <name> for its entries and relations.)', '');
    for (const id of shown) out.push(`${recs[id].kind}: ${N.nameOf(recs, id)}  [${id}]`);
    return { text: out.join('\n') };
  }
  for (const id of shown) {
    out.push('', `${recs[id].kind}: ${N.nameOf(recs, id)}  [${id}]`);
    tree(id, 1);
    const places = new Set([id, ...T.dependents(recs, [id])]), rels = new Set();
    for (const p of places) for (const x of ix.relations.get(p) ?? []) rels.add(x);
    const worked = new Map();
    for (const x of rels) {
      if (R.computed[x]) { const n = N.nameOf(recs, x); worked.has(n) ? worked.get(n).push(x) : worked.set(n, [x]); continue; }
      out.push(`  — ${said(N, recs, x)}${marks(x)}`);
      tree(x, 2);
    }
    // Worked out relations, one line each: the others in them, once each whichever way round.
    for (const [n, xs] of worked) out.push(`  — ${n} (worked out): ${list([...new Set(xs.map(x => N.sides(recs, x).map(a => objOf(recs, a.at)).filter(o => o !== id).map(o => N.shortOf(recs, o)).join(' and ') || N.shortOf(recs, id)))])}`);
  }
  return { text: out.join('\n') };
}

// check: what needs attention, as the status bar counts it, and anything else amiss in the workbook.
const KINDS = [['overdue', 'overdue'], ['error', 'errors'], ['soon', 'due soon'], ['blank', 'blank']];
function attentionText(N, R, a) {
  const recs = R.records;
  if (a.kind === 'blank') return `${N.placeOf(recs, a.id)} › ${a.edge} is blank, and required`;
  if (a.kind === 'overdue' || a.kind === 'soon') return `${N.placeOf(recs, a.id)}: ${T.formatDate(recs[a.id].value, 'long')}`;
  if (a.error) {
    const at = a.error.at ?? a.error.args?.[0]?.at, def = N.notes('Formula').find(n => n.note === a.error.def), what = def ? N.name(def.pattern) : '';
    return `${at && recs[at] ? `${N.placeOf(recs, at)} › ` : ''}${what} ${a.error.error.code}: ${a.error.error.msg}`.trim();
  }
  // A failed check, by what it's a check of: the object or relation it's at.
  const t = T.treeOf(recs, a.id), d = t && N.description(T.bare(t));
  let of = recs[a.id].at;
  while (of && !T.isObject(recs[of]) && !recs[of].args) of = recs[of].at;
  return `${of ? N.segmentOf(recs, of) : ''}: ${recs[a.id].edge} fails${d ? `. ${first(d)}` : ''}`;
}
// What a formula gives where an entry stands over it, as that entry would read.
const formulaText = (r, v) => outText('field' in r ? { field: r.field, value: v } : 'choice' in r ? { choice: v } : { tag: v });
function counts(items) {
  const c = KINDS.map(([k, w]) => [items.filter(a => a.kind === k).length, w]).filter(([n]) => n);
  return c.length ? c.map(([n, w]) => `${n} ${n === 1 && w === 'errors' ? 'error' : w}`).join(' · ') : 'nothing needs attention';
}
function check(wb, o) {
  const day = o.day ?? today();
  if (!isDay(day)) refuse(`The day ${quote(day)} isn’t a day; write it as 2026-03-02.`);
  const charts = o.chart ? [chartOf(wb, o.chart)] : wb.charts(), out = [];
  for (const { chart, name } of charts) {
    const { S, N, R } = work(wb, chart, day), items = Formulas.attention(R, N, day);
    out.push(`${name}, as of ${T.formatDate(day, 'long')}: ${counts(items)}`);
    for (const [k, w] of KINDS) {
      const of = items.filter(a => a.kind === k);
      if (of.length) out.push('', `${w[0].toUpperCase()}${w.slice(1)}:`, ...of.map(a => `  ${attentionText(N, R, a)}`));
    }
    const over = Object.keys(R.covered).filter(id => R.covered[id].agrees === false);
    if (over.length) out.push('', 'Entered over the formula that would give otherwise (an election, say; else a mistake):',
      ...over.map(id => `  ${said(N, R.records, id)}, where its formula gives ${formulaText(R.records[id], R.covered[id].value)}`));
    const dis = wb.disagreements(chart);
    if (dis.length) out.push('', 'Disagreements (two people gave one thing at once; settle each in Dendra by keeping one):',
      ...dis.map(g => `  ${g.rows.map(x => `${x.who}: ${x.row.record ? outText(x.row) || x.row.kind : ''}`).join(' / ')}`));
    const bad = T.schemaError(S);
    if (bad) out.push('', `The schema: ${bad}`);
    out.push('');
  }
  return { text: out.join('\n').trim() };
}

// ---- apply: a plan of records, written in the chart's words, recorded as changes ----
// A plan is { chart?, who, day?, records: [step] }, each step an object ({ kind, entries }), a relation
// ({ relation, sides, value?, entries }) or a record by its id ({ id, entries?, value? }); any may say remove,
// and any may give its own day. Steps on one day make one change. See references/plans.md.
function apply(wb, o) {
  let plan;
  try { plan = JSON.parse(o.plan); } catch (e) { refuse(`The plan isn’t JSON: ${e.message}`); }
  const { chart, name } = chartOf(wb, plan.chart ?? o.chart);
  const who = T.clean(plan.who ?? '');
  if (!who) refuse('The plan says who is recording it, as History will show it: "who": "Claude, for Jordan Alvarez".');
  const steps = plan.records;
  if (!Array.isArray(steps) || !steps.length) refuse('The plan has no "records".');
  if (plan.day != null && !isDay(plan.day)) refuse(`The plan’s day ${quote(plan.day)} isn’t a day; write it as 2026-03-02.`);
  const asOf = today(), before = work(wb, chart, asOf), beforeAll = everything(wb, chart);
  const groups = [];
  steps.forEach((s, i) => {
    if (!s || typeof s !== 'object' || Array.isArray(s)) refuse(`Record ${i + 1} isn’t an object.`);
    const day = s.day ?? plan.day ?? null;
    if (day !== null && !isDay(day)) refuse(`Record ${i + 1}: its day ${quote(day)} isn’t a day; write it as 2026-03-02.`);
    groups.at(-1)?.day === day ? groups.at(-1).steps.push([i, s]) : groups.push({ day, steps: [[i, s]] });
  });
  const made = [], notes = [], days = new Map();
  for (const g of groups) {
    const tx = wb.edit({ chart, who, day: g.day }), x = scope(wb, chart, tx, g.day, notes);
    for (const [i, s] of g.steps) {
      try { step(x, s); } catch (e) { if (e instanceof Refusal) refuse(`Record ${i + 1}${s.kind || s.relation ? ` (${s.relation ?? s.kind})` : ''}: ${e.message}`); throw e; }
    }
    const c = tx.commit();
    if (typeof c === 'string') refuse(`Dendra refused ${g.day ? `the change from ${g.day}` : 'the change'}: ${c}`);
    if (c) { made.push(c); days.set(c, g.day); }
  }
  const out = [`${name}: ${made.length ? `${made.length} change${made.length > 1 ? 's' : ''} by ${who}` : 'nothing to change; the chart already says all of it'}`];
  if (!made.length) return { text: out.join('\n'), workbook: null };
  // What each change says, record by record: + added, ~ changed (with what it was), − removed or ended.
  const after = work(wb, chart, asOf), afterAll = everything(wb, chart), rowsById = new Map(wb.changes().flatMap(c => c.adds).map(r => [r.id, r]));
  for (const c of made) {
    const day = days.get(c);
    out.push('', day ? `From ${T.formatDate(day, 'long')}:` : 'So all along (what was so from the start, or a correction):', ...changeText(c, day, before.N, after.N, beforeAll, afterAll, rowsById));
  }
  // What follows: what the formulas work out now that they didn't, and what needs attention that didn't.
  const d = Formulas.diff(before.R, after.R), byDef = (ids, R) => {
    const n = new Map();
    for (const id of ids) { const def = R.computed[id]?.def; const nm = def && after.N.definitions(after.S).find(x => x.id === def)?.name; if (nm) n.set(nm, (n.get(nm) ?? 0) + 1); }
    return [...n].map(([k, v]) => `${k} ${v}`);
  };
  const appear = byDef(d.appear ?? [], after.R), go = byDef(d.go ?? [], before.R);
  if (appear.length || go.length) out.push('', `Worked out: ${[appear.length && `now ${list(appear)}`, go.length && `no longer ${list(go)}`].filter(Boolean).join('; ')}.`);
  const key = a => `${a.kind}|${a.id}|${a.edge ?? ''}`, was = new Set(Formulas.attention(before.R, before.N, asOf).map(key));
  const nowItems = Formulas.attention(after.R, after.N, asOf), fresh = nowItems.filter(a => !was.has(key(a))), left = [...was].filter(k => !nowItems.some(a => key(a) === k));
  out.push('', `Needs attention now: ${counts(nowItems)}${fresh.length || left.length ? ` (${[fresh.length && `${fresh.length} new`, left.length && `${left.length} settled`].filter(Boolean).join(', ')})` : ''}`);
  for (const a of fresh) out.push(`  ${a.kind === 'error' ? 'error' : a.kind === 'soon' ? 'due soon' : a.kind}: ${attentionText(after.N, after.R, a)}`);
  const over = made.flatMap(c => c.adds).filter(r => 'record' in r && after.R.covered[r.record]?.agrees === false);
  if (over.length) out.push('', 'Entered over a formula that gives otherwise (shown with an amber corner):', ...over.map(r => `  ${said(after.N, after.R.records, r.record)}`));
  if (notes.length) out.push('', ...notes);
  return { text: out.join('\n'), workbook: JSON.stringify(wb) };
}
const stripped = ({ id, record, ...r }) => r;
// A change, record by record: + added, with what's added at it beneath; ~ changed, with what it was; − removed.
function changeText(c, day, A, B, beforeAll, afterAll, rowsById) {
  const out = [], recs = { ...afterAll }, records = [];
  for (const r of c.adds) if ('record' in r && !records.includes(r.record)) { records.push(r.record); recs[r.record] ??= stripped(r); }
  const fresh = new Set(records.filter(id => !beforeAll[id])), under = new Map();
  for (const id of fresh) { const at = recs[id].at; if (fresh.has(at)) under.has(at) ? under.get(at).push(id) : under.set(at, [id]); }
  const entry = r => `${r.edge}: ${outText(r)}`;
  const beneath = (id, depth) => { for (const k of under.get(id) ?? []) { out.push(`${'  '.repeat(depth)}${entry(recs[k])}`); beneath(k, depth + 1); } };
  for (const id of records) {
    const r = recs[id], was = beforeAll[id], rows = c.adds.filter(q => q.record === id);
    if (fresh.has(id)) { if (!fresh.has(r.at)) { out.push(`  + ${said(B, recs, id)}`); beneath(id, 3); } continue; }
    // Ended on the change's day: nothing it adds of the record holds from that day on.
    if (day && rows.every(q => q.before && q.before <= day)) { out.push(`  − ${said(A, beforeAll, id)} (ends ${T.formatDate(day, 'long')})`); continue; }
    const now = r.args ? said(B, recs, id) : `${N0(B, recs, r.at)}${entry(r)}`;
    out.push(`  ~ ${now}${outText(was) !== outText(r) ? ` (was ${outText(was)})` : ''}`);
  }
  for (const id of c.removes) { const rec = rowsById.get(id)?.record; if (rec && !records.includes(rec)) { records.push(rec); out.push(`  − ${said(A, beforeAll, rec)}`); } }
  return out;
}
const N0 = (N, recs, at) => at ? `${N.placeOf(recs, at)} › ` : '';

// What a group of steps works in: the transaction, every record as it now stands with this change's so far
// (a fresh state each time, since the core keeps what it reads of one), and the chart's words.
function scope(wb, chart, tx, day, notes) {
  const S = wb.schema(chart), N = wb.notes(chart), W = words(S, N);
  const x = { tx, recs: everything(wb, chart), S, N, W, day, notes,
    add(rec) { const id = tx.add('record', rec); x.recs = { ...x.recs, [id]: rec }; return id; },
    update(id, changes) { tx.update(id, changes); x.recs = { ...x.recs, [id]: { ...x.recs[id], ...changes } }; },
    remove(id) {
      const deps = T.dependents(x.recs, [id]), left = { ...x.recs };
      tx.remove(id);
      if (!day && deps.size > 1) notes.push(`Deleted ${said(N, x.recs, id)} and the ${deps.size - 1} record${deps.size > 2 ? 's' : ''} at it. (Something that ended is ended by a day, or by its end date, not deleted.)`);
      for (const d of deps) delete left[d];
      x.recs = left;
    },
  };
  return x;
}
function step(x, s) {
  if (s.relation) return relationStep(x, s);
  if (s.kind) return objectStep(x, s);
  if (s.id) return recordStep(x, s);
  refuse('A record says its "kind" (an object: Entity, Individual…), its "relation" (Ownership…), or the "id" of one in the chart.');
}

// An object, found by its kind and Name (or id), or else added; then its entries.
function objectStep(x, s) {
  const kind = x.W.kinds.find(k => T.same(k, s.kind));
  if (!kind && !s.new) refuse(`The chart has no kind ${quote(s.kind)}. Its kinds: ${list(x.W.kinds)}.${nearest(s.kind, x.W.kinds)} (A new kind needs "new": true.)`);
  const k = kind ?? T.clean(s.kind), entries = s.entries ?? {};
  if (typeof entries !== 'object' || Array.isArray(entries)) refuse('Its "entries" are an object: { "<label>": <value>, … }.');
  const nameKey = Object.keys(entries).find(e => T.same(e, 'Name')), nm = nameKey && (typeof entries[nameKey] === 'object' ? entries[nameKey]?.value : entries[nameKey]);
  let id = s.id ? need(x, s.id, k) : nm != null ? find(x, String(nm), [k], { quiet: true }) : null;
  if (s.remove) { if (!id) refuse(`There’s no ${k} ${quote(nm)} to remove.`); return x.remove(id); }
  // A name that found the object (its Name, or its Short Name) is how it was found, not a new Name: renaming
  // one takes its id.
  const found = id && !s.id, { [nameKey]: _, ...rest } = entries;
  if (!id) id = x.add({ kind: k });
  putEntries(x, id, found && nameKey ? rest : entries);
}
function recordStep(x, s) {
  const id = need(x, s.id);
  if (s.remove) return x.remove(id);
  const r = x.recs[id];
  if (s.value !== undefined) {
    if (T.isObject(r)) refuse(`${said(x.N, x.recs, id)} is an object; give its entries.`);
    const out = r.args ? relationValue(x, x.W.relations.find(q => r.args.every(a => q.edges.some(e => T.same(e, a.edge)))), r.args, s.value) : valueFor(x, specsLike(x, T.treeOf(x.recs, r.at), r.edge), r.edge, { value: s.value }, said(x.N, x.recs, r.at));
    if (!sameOut(r, out)) x.update(id, out);
  }
  putEntries(x, id, s.entries ?? {});
}
function need(x, id, kind) {
  const r = x.recs[id];
  if (!r) refuse(`The chart has no record with the id ${quote(id)}.`);
  if (kind && r.kind !== kind) refuse(`${quote(id)} is ${r.kind ? `an ${r.kind}` : 'not an object'}, not a ${kind}.`);
  return id;
}
// An object by its Name or Short Name, among the kinds given.
function find(x, name, kinds, { quiet = false } = {}) {
  const recs = x.recs, objs = Object.keys(recs).filter(id => T.isObject(recs[id]) && (!kinds || kinds.some(k => T.same(k, recs[id].kind))));
  const named = (id, edge) => Object.keys(recs).some(e => recs[e].at === id && T.same(recs[e].edge, edge) && T.same(recs[e].value, name));
  let hits = objs.filter(id => named(id, 'Name'));
  if (!hits.length) hits = objs.filter(id => named(id, 'Short Name'));
  if (hits.length > 1) refuse(`${hits.length} ${list(kinds ?? ['objects'], 'or')} are named ${quote(name)}: ${hits.map(h => `[${h}]`).join(', ')}. Give the one meant by its "id".`);
  if (hits.length || quiet) return hits[0] ?? null;
  const all = objs.map(id => x.N.nameOf(recs, id));
  refuse(`There’s no ${list(kinds ?? ['object'], 'or')} named ${quote(name)} in the chart.${nearest(name, all)} Add it first, or give its name as the chart has it (show --find).`);
}

// The specifications of entries with this edge at a record like t.
const specsLike = (x, t, edge) => x.W.specs.filter(s => s.args?.length === 1 && T.same(s.args[0].edge, edge) && T.narrower(t, s.args[0].loc));
const sameOut = (r, out) => 'field' in out ? r.field === out.field && r.value === out.value : 'choice' in out ? r.choice === out.choice : r.tag === out.tag;
// A record's entries: each found by its label and set, or added; null removes one.
function putEntries(x, at, entries) {
  if (typeof entries !== 'object' || Array.isArray(entries)) refuse('Its "entries" are an object: { "<label>": <value>, … }.');
  const where = said(x.N, x.recs, at), t = T.treeOf(x.recs, at) ?? refuse(`${where} isn’t whole in the chart.`);
  for (const [label, raw] of Object.entries(entries)) {
    const v = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw : { value: raw };
    const specs = specsLike(x, t, label), edge = specs[0]?.args[0].edge ?? T.clean(label);
    const has = Object.keys(x.recs).filter(e => x.recs[e].at === at && T.same(x.recs[e].edge, edge));
    if (v.value === null || v.remove) { has.forEach(e => x.remove(e)); continue; }
    let id = has[0];
    if (v.value === undefined) {
      if (!id) refuse(`${where} has no ${edge} to give entries at; give its "value".`);
    } else {
      const out = valueFor(x, specs, label, v, where, t);
      if (!id) id = x.add({ at, edge, ...out, ...validity(v) });
      else if (!sameOut(x.recs[id], out)) x.update(id, out);
    }
    if (v.entries) putEntries(x, id, v.entries);
  }
}
function validity(v) {
  for (const k of ['since', 'before']) if (v[k] != null && !isDay(v[k])) refuse(`Its ${k} ${quote(v[k])} isn’t a day; write it as 2026-03-02.`);
  return { ...(v.since && { since: v.since }), ...(v.before && { before: v.before }) };
}
// What an entry records, from what its label takes there: a value of its datatype, an option, or a tick.
function valueFor(x, specs, label, v, where, t) {
  if (!specs.length) {
    const here = t ? x.W.entriesAt([locOf(t)]).map(g => g.edge) : [];
    if (!v.new) refuse(`${where} has no entry ${quote(label)}.${here.length ? ` Its entries: ${list(here)}.${nearest(label, here)}` : ''} (A new kind of entry says "new": "text", "number", "percent", "money", "date", "yearly", "document", "choice" or "tag".)`);
    if (v.new === 'tag') return { tag: tick(label, v.value) };
    if (v.new === 'choice') return { choice: T.clean(String(v.value)) };
    if (!T.DATATYPES[v.new]) refuse(`"new": ${quote(v.new)} isn’t a datatype; say text, number, percent, money, date, yearly, document, choice or tag.`);
    return field(v.new, v.value, label);
  }
  const s = specs[0], formula = specs.map(q => x.W.worked.get(T.paramKey(q))).find(Boolean);
  if (formula && !v.override) refuse(`${where} › ${s.args[0].edge} is worked out by Dendra (${formula}): leave it out. Where an entry is meant to stand over the formula (an election, say), say "override": true.`);
  if ('field' in s.out) return field(s.out.field, v.value, s.args[0].edge);
  if ('tag' in s.out) return { tag: tick(s.args[0].edge, v.value) };
  const options = [...new Set(specs.filter(q => 'choice' in q.out).map(q => q.out.choice))], o = options.find(q => T.same(q, v.value));
  if (o) return { choice: o };
  if (v.new) return { choice: T.clean(String(v.value)) };
  refuse(`${s.args[0].edge} is one of ${list(options.map(quote), 'or')}; ${quote(v.value)} isn’t.${nearest(String(v.value), options)} (A new option says "new": true.)`);
}
// The location a record's tree gives its entries: an object's is its kind.
const locOf = t => t.id ? { kind: t.kind } : t.args ? { ...(t.out && { out: t.out }), args: t.args.map(a => ({ edge: a.edge, loc: locOf(a.loc) })) } : t;
function tick(label, value) {
  if (typeof value !== 'boolean') refuse(`${label} is a checkbox: true or false.`);
  return value;
}
function field(datatype, value, label) {
  if (value === undefined) refuse(`${label} needs a "value".`);
  if (typeof value === 'number') {
    if (datatype === 'percent') refuse(`${label} is a percentage: write it as text with its sign, "71.6%".`);
    if (datatype === 'number' || datatype === 'money') return { field: datatype, value };
  }
  const v = T.parse(datatype, String(value));
  if (v === undefined) refuse(`${label} is ${T.PHRASES[datatype] ?? datatype}; ${quote(value)} isn’t.${datatype === 'date' ? ' Write a date as 2026-03-02.' : datatype === 'document' ? ' A document is its address: a SharePoint, OneDrive, EDGAR, NetDocuments or iManage link, a web address or a file path.' : ''}`);
  return { field: datatype, value: v };
}

// A relation, found by its sides or else added; its value; then its entries.
function relationStep(x, s) {
  const rel = x.W.relations.find(r => T.same(r.name, s.relation));
  if (!rel) { const names = [...new Set(x.W.relations.map(r => r.name))]; refuse(`The chart has no relation ${quote(s.relation)}. Its relations: ${list(names)}.${nearest(s.relation, names)}`); }
  const sides = s.sides ?? refuse(`${rel.name} says its "sides": { ${rel.edges.map(e => `"${e}": …`).join(', ')} }.`);
  for (const k of Object.keys(sides)) if (!rel.edges.some(e => T.same(e, k))) refuse(`${rel.name}’s sides are ${list(rel.edges.map(quote))}; ${quote(k)} isn’t one.`);
  const objs = new Map(rel.edges.map(e => {
    const k = Object.keys(sides).find(q => T.same(q, e));
    if (k === undefined) refuse(`${rel.name} needs its ${e}: "sides": { ${rel.edges.map(q => `"${q}": …`).join(', ')} }.`);
    const v = sides[k], locs = rel.specs.map(sp => sp.args.find(a => T.same(a.edge, e)).loc);
    if (typeof v === 'object' && v?.id) return [e, need(x, v.id)];
    // A side that is itself a relation (what a document evidences: a position, a signing authority) is named by its id.
    if (locs.every(l => l.args?.length > 1)) refuse(`${rel.name}’s ${e} is ${list([...new Set(locs.map(l => placeWords(l, x.N)))], 'or')}: give its id, "${e}": { "id": "…" }, from show --find.`);
    return [e, find(x, String(v), [...new Set(locs.map(kindOf))])];
  }));
  // Where each side stands in one of the relation's specifications: at its object, or at an entry of it (a
  // general partner at a partnership's Entity Type, a registered agent at its principal's Jurisdiction).
  let args = null;
  for (const sp of rel.specs) {
    const placed = sp.args.map(a => ({ edge: a.edge, at: placeIn(x, objs.get(rel.edges.find(e => T.same(e, a.edge))), a.loc) }));
    if (placed.every(p => p.at)) { args = placed; break; }
  }
  if (!args) {
    const takes = e => list([...new Set(rel.specs.map(sp => placeWords(sp.args.find(a => T.same(a.edge, e)).loc, x.N)))], 'or');
    refuse(`${rel.name} takes ${list(rel.edges.map(e => `as its ${e} ${takes(e)}`))}. ${list(rel.edges.map(e => `${x.N.nameOf(x.recs, objs.get(e))} is ${/^[aeiou]/i.test(x.recs[objs.get(e)].kind) ? 'an' : 'a'} ${x.recs[objs.get(e)].kind}${entryWords(x, objs.get(e))}`))}.`);
  }
  const key = as => as.map(a => `${T.norm(a.edge)}=${a.at}`).sort().join('|'), k = key(args);
  const id0 = Object.keys(x.recs).find(id => x.recs[id].args && key(x.recs[id].args) === k);
  if (s.remove) { if (!id0) refuse(`There’s no ${rel.name} ${x.N.segmentOf({ ...x.recs, '': { args, tag: true } }, '')} to remove.`); return x.remove(id0); }
  if (rel.formula && !s.entries && !s.override) refuse(`${rel.name} is worked out by Dendra (${rel.formula}): leave it out. To record something at one, a payment say, give its "entries".`);
  const out = relationValue(x, rel, args, s.value);
  let id = id0;
  if (!id) id = x.add({ args, ...out, ...validity(s) });
  else if (!sameOut(x.recs[id], out)) x.update(id, out);
  putEntries(x, id, s.entries ?? {});
}
const kindOf = loc => loc.kind ?? (loc.args?.[0] ? kindOf(loc.args[0].loc) : null);
// An object's options, which say where a relation can stand at it: "whose Entity Type is Limited Liability Company".
function entryWords(x, obj) {
  const chosen = Object.keys(x.recs).filter(e => x.recs[e].at === obj && 'choice' in x.recs[e]).map(e => `${x.recs[e].edge} is ${x.recs[e].choice}`);
  return chosen.length ? `, whose ${list(chosen)}` : ', with no options chosen';
}
function placeIn(x, obj, loc) {
  if (!obj) return null;
  if (loc.kind) return T.same(x.recs[obj]?.kind, loc.kind) ? obj : null;
  if (loc.args?.length > 1) { const t = T.treeOf(x.recs, obj); return t && T.narrower(t, loc) ? obj : null; }
  const a = loc.args?.[0], under = a && placeIn(x, obj, a.loc);
  if (!under) return null;
  return Object.keys(x.recs).find(e => { const r = x.recs[e]; return r.at === under && T.same(r.edge, a.edge)
    && (!loc.out || ('choice' in loc.out ? T.same(r.choice, loc.out.choice) : 'tag' in loc.out ? r.tag === loc.out.tag : r.field === loc.out.field)); }) ?? null;
}
function relationValue(x, rel, args, value) {
  const specs = rel.specs.filter(sp => sp.args.every(a => args.some(b => T.same(a.edge, b.edge))));
  if (rel.type === 'tag') return { tag: value === undefined ? true : tick(rel.name, value) };
  if (rel.type === 'choice') {
    const options = [...new Set(specs.map(sp => sp.out.choice).filter(Boolean))], o = options.find(q => T.same(q, value));
    if (value === undefined) refuse(`${rel.name} says which: "value": ${list(options.map(quote), 'or')}.`);
    if (!o) refuse(`${rel.name} is ${list(options.map(quote), 'or')}; ${quote(value)} isn’t.${nearest(String(value), options)}`);
    return { choice: o };
  }
  return field(specs[0].out.field, value, rel.name);
}

// ---- new: a chart begun from another, as the window's New chart begins one: its schema, and every note
// that isn't at one of its records (definitions, names, descriptions, checks, styles), with its table views
// and its first chart view, whose page starts afresh with the chart's name for its title.
function begin(wb, template, o) {
  const name = T.clean(o.name ?? ''), who = T.clean(o.who ?? '');
  if (!name) refuse('Name the chart: --name "Calder Ridge Fund IV structure".');
  if (!who) refuse('Say who begins it: --who "Claude, for Jordan Alvarez".');
  if (wb.charts().some(c => T.same(c.name, name))) refuse(`The workbook already has a chart ${quote(name)}.`);
  const src = open(template, 'The template'), { chart: from } = chartOf(src, o.from), rows = src.rows(from), N = src.notes(from);
  const views = rows.filter(r => 'record' in r && r.kind === 'View').map(r => r.record);
  const layout = v => N.notes('Layout').find(n => n.pattern.id === v && !n.view)?.value;
  const order = v => { const x = N.order({ id: v, kind: 'View' }); return typeof x === 'number' ? x : Infinity; };
  const charts = views.filter(v => !layout(v)).sort((a, b) => order(a) - order(b)), keep = new Set([...views.filter(v => layout(v)), ...charts.slice(0, 1)]);
  const c = Log.newId(), tx = wb.edit({ chart: c, who }), ids = new Map();
  tx.add('chart', { name }, c);
  for (const tree of Object.values(src.schema(from))) tx.add('spec', { tree });
  for (const v of keep) ids.set(v, tx.add('record', { kind: 'View' }));
  const moved = t => t.args ? { ...t, args: t.args.map(a => ({ ...a, loc: moved(a.loc) })) } : t.id === undefined ? t : { ...t, id: ids.get(t.id) };
  for (const r of rows) if ('note' in r && (!r.view || ids.has(r.view)) && [...T.idsIn(r.pattern)].every(id => ids.has(id)))
    tx.note(r.label, moved(r.pattern), r.value, { view: ids.get(r.view), param: r.param });
  const page = ids.get(charts[0]);
  if (page) {
    tx.add('shape', { view: page, geometry: 'text', role: 'title', text: name });
    tx.add('shape', { view: page, geometry: 'text', role: 'date', text: '="As of " & TEXT(@AsOf, "mmmm d, yyyy")' });
  }
  const made = tx.commit();
  if (typeof made === 'string') refuse(`Dendra refused the new chart: ${made}`);
  const S = wb.schema(c), W = words(S, wb.notes(c));
  return { text: `Began ${quote(name)} from ${quote(src.charts().find(x => x.chart === from).name)}: its ${W.kinds.length} kinds and ${W.relations.length} relations, ${wb.notes(c).notes('Formula').length} definitions, and ${keep.size} views (${list([...keep].map(v => N.nameOf({ [v]: { kind: 'View' } }, v)))}). No records yet.`, workbook: JSON.stringify(wb) };
}

function run(command, o = {}) {
  try {
    if (!Formulas.attention) refuse('This copy of Dendra is older than the tool (its core has no Formulas.attention): give --app a newer one.');
    if (command === 'new') { const wb = o.workbook ? open(o.workbook) : Log.open([]); return { ok: true, ...begin(wb, o.template ?? refuse('Give a template workbook, --from.'), o) }; }
    const wb = open(o.workbook ?? refuse('Give the workbook.'));
    const f = { vocab, show, check, apply }[command] ?? refuse(`There’s no command ${quote(command)}: vocab, show, check, apply or new.`);
    if (command === 'apply' && !o.plan) refuse('Give the plan.');
    return { ok: true, workbook: null, ...f(wb, o) };
  } catch (e) {
    if (e instanceof Refusal) return { ok: false, text: e.message, workbook: null };
    return { ok: false, text: `Something went wrong in the tool: ${e.stack ?? e}`, workbook: null };
  }
}

return { run };
})();
