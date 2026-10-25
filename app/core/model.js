// The state: records in the tree data model (see data-model.md), plus the presentation that goes with them
// (entry order, chart styles and box positions), with undo and redo over all of it.

// The workbook is saved under WORKBOOK_KEY. A new one starts from the sample chart, in sample.js.
const WORKBOOK_KEY = 'rboreal.workbook.v2';

// A chart's state is its schema and records, plus what goes with them:
// - schema: the chart's schema S, kept explicitly (see "The schema" below);
// - entered: the records typed in. `records` is what everything reads: the entered records together with
//   those the chart's formulas compute (see formulas.md), worked out again after every change;
// - definitions: the formulas, each covering a set of parameterizations; names: the names of relations
//   and of their lists of relatives, by form;
// - required: the parameterizations every location like theirs should have an entry for;
// - order: the order entries are shown in, kept per location specification, so that, say, every Entity
//   lists its entries in the same order, the way a spreadsheet's rows share its columns;
// - views: the chart's views, each with its own styles (see styles.js), box positions, hidden records and
//   filter. The records are the same in every view. `styles` and `layout` are the current view's, written
//   back into `views` on save;
// - archive: deleted records, kept in batches so each can be restored with its dependents;
// - history: every change to the chart's data (its records, definitions, names, required entries and
//   schema), newest first, with when it was made and by whom; see "History" below. Views are presentation,
//   and changes to them aren't recorded.
// Semantics is keyed by parameterization (formulas, required entries), looks and vocabulary by form (styles,
// names), and placement by location (entry order by location specification, box positions by object).
// Names and order start empty, so records can be read and described before a state is set, as the sample's
// history is.
let schema, entered, records, definitions, names = {}, order = {}, views, viewId, styles, layout, required, archive, historyLog;
const undoStack = [];
const redoStack = [];

function setState(s) {
  ({ schema = {}, records: entered, definitions = [], names = {}, order = {}, views, viewId = null, required = [], archive = [], history: historyLog = [] } = s);
  recompute();
  // The schema holds what the formulas compute, as well as what's entered.
  schema = withSpecsOf(schema, records);
  if (!views.some(v => v.id === viewId)) viewId = views[0].id;
  const view = views.find(v => v.id === viewId);
  styles = view.styles;
  layout = view.layout ?? {};
}

// Called once every script has loaded, since the sample (sample.js) uses styles.js.
function initState() {
  let text = null;
  try { text = localStorage.getItem(WORKBOOK_KEY); } catch { storageProblem = 'unavailable'; }
  if (text) {
    try {
      const saved = JSON.parse(text);
      if (saved?.charts?.length) {
        workbook = { deleted: [], ...saved };
        if (!chartInUse()) workbook.chartId = workbook.charts[0].id;
        setState(chartInUse().state);
        return useTabPlace();
      }
    } catch {}
    // A copy that can't be read is set aside, never overwritten, and the sample opens in its place.
    try { localStorage.setItem(UNREADABLE_KEY, text); storageProblem = 'unreadable'; } catch { storageProblem = 'unreadable-unkept'; }
  }
  workbook = { charts: [{ id: 'chart_main', name: SAMPLE_CHART_NAME, state: sampleState(), sample: true }], chartId: 'chart_main', deleted: [] };
  setState(chartInUse().state);
}

// What's wrong with keeping the workbook in this browser, for the page to say plainly, or null:
// - 'unreadable': the copy saved here couldn't be read, so the sample opened; the copy is kept aside, under
//   UNREADABLE_KEY ('unreadable-unkept' if even that failed, and then nothing is saved over it);
// - 'unavailable': this browser won't let the page keep anything, so changes last only while it's open;
// - 'unsaved': the last change couldn't be saved here, as when the browser's storage is full.
let storageProblem = null;
const UNREADABLE_KEY = `${WORKBOOK_KEY}.unreadable`;
// The workbook as it is in this page, as saved: every chart with its views and history.
const workbookText = () => JSON.stringify({ ...workbook, charts: currentCharts() });

// States are never mutated in place, so earlier ones can be kept for undo.
const currentViews = () => views.map(v => v.id === viewId ? { ...v, styles, layout } : v);
const snapshot = () => ({ schema, records: entered, definitions, names, order, views: currentViews(), viewId, required, archive, history: historyLog });

function saveState() {
  let saved = storageProblem !== 'unavailable' && storageProblem !== 'unreadable-unkept';
  if (saved) try { localStorage.setItem(WORKBOOK_KEY, workbookText()); } catch { saved = false; }
  if (!saved && !storageProblem) storageProblem = 'unsaved';
  else if (saved && storageProblem === 'unsaved') storageProblem = null;
  // The store (store.js) saves this working copy wherever the workbook is kept: a file or a SharePoint library.
  if (typeof Store !== 'undefined') Store.changed(saved);
}

function pushUndo() {
  undoStack.push(snapshot());
  redoStack.length = 0;
}
// Undo and redo step through states, but the history only grows: each is recorded as the change it makes.
function stepState(from, to, source) {
  if (!from.length) return false;
  const was = snapshot(), wasRecords = records, log = historyLog, frame = from.pop();
  // Each step remembers the edit it takes back or puts back, so the history can name it.
  to.push({ ...was, summary: frame.summary });
  setState(frame);
  historyLog = log;
  noteChangeSince(was, wasRecords, source, frame.summary);
  saveState();
  return true;
}
const undoState = () => stepState(undoStack, redoStack, 'undo');
const redoState = () => stepState(redoStack, undoStack, 'redo');
// Puts the sample back in the current chart, as one undoable step. Other charts are left alone.
function resetState() {
  replaceState(sampleState(), 'Reset the chart to the sample', 'reset');
}
// Replaces the current chart's state with another (the sample, or the chart as a workbook file has it), as
// one undoable step, recorded in the history with its source ('reset' or 'import'). The history only grows:
// the chart keeps every entry it had, and gains any the other state brings.
function replaceState(state, summary, source) {
  pushUndo();
  const was = snapshot();
  setState(state);
  const had = new Set(was.history.map(h => h.id));
  historyLog = [...was.history, ...historyLog.filter(h => !had.has(h.id))].sort((a, b) => String(b.when).localeCompare(String(a.when)));
  noteChange(summary, changesBetween(was.records, entered), source);
  saveState();
}

// ---- Workbooks ----
// A workbook holds charts, each with a state of its own, unsynced with the others. The current chart's
// state is the one held in the variables above; the others wait in `workbook.charts` as they were saved.
// Each chart keeps its own undo history while the page is open. Deleted charts are kept, to be restored.

let workbook = { charts: [], chartId: null, deleted: [] };
const undoByChart = new Map();

const chartInUse = () => workbook.charts.find(c => c.id === workbook.chartId);
// Whether the current chart is the sample, which Reset sample puts back as it started.
const isSampleChart = () => !!(chartInUse()?.sample ?? chartInUse()?.id === 'chart_main');
const currentCharts = () => workbook.charts.map(c => c.id === workbook.chartId ? { ...c, state: snapshot() } : c);

// Sets the current chart's undo history aside, and brings back another's.
function swapHistory(toId) {
  undoByChart.set(workbook.chartId, { undo: undoStack.splice(0), redo: redoStack.splice(0) });
  const kept = undoByChart.get(toId);
  if (kept) { undoStack.push(...kept.undo); redoStack.push(...kept.redo); }
}

function switchChart(id) {
  if (id === workbook.chartId || !workbook.charts.some(c => c.id === id)) return;
  workbook.charts = currentCharts();
  swapHistory(id);
  workbook.chartId = id;
  setState(chartInUse().state);
  keepTabPlace();
  saveState();
}

// Which chart and view are open belongs to the tab: two tabs can show different charts and views of one
// workbook, and a change saved in one doesn't move the other. The workbook keeps the last ones anyone
// opened, for a new tab to start at.
const TAB_KEY = 'rboreal.tab';
const tabPlace = () => { try { return JSON.parse(sessionStorage.getItem(TAB_KEY)) ?? {}; } catch { return {}; } };
function keepTabPlace() {
  try { sessionStorage.setItem(TAB_KEY, JSON.stringify({ chart: workbook.chartId, view: viewId })); } catch {}
}
// Opens the tab's chart and view, where the workbook still has them.
function useTabPlace() {
  const tab = tabPlace();
  if (tab.chart && tab.chart !== workbook.chartId && workbook.charts.some(c => c.id === tab.chart)) {
    workbook.chartId = tab.chart;
    setState(chartInUse().state);
  }
  if (tab.chart === workbook.chartId && tab.view !== viewId && views.some(v => v.id === tab.view)) {
    viewId = tab.view;
    ({ styles } = viewInUse());
    layout = viewInUse().layout ?? {};
  }
}

// A chart with nothing in it yet but a Kind style, which new kinds fill in.
const blankState = () => ({
  schema: {}, records: {}, order: {}, archive: [], required: [], definitions: [], names: {},
  views: [{ id: 'view_main', name: 'Structure', layout: {}, styles: [{ id: 'st_kind', form: 'object', map: {} }] }],
});

// Adds a chart, blank or with the given state, after the current one, and makes it current.
function addChart(name, state = blankState(), more = {}) {
  const charts = currentCharts();
  const chart = { id: newId(), name: freeChartName(name), state, ...more };
  charts.splice(charts.findIndex(c => c.id === workbook.chartId) + 1, 0, chart);
  workbook.charts = charts;
  swapHistory(chart.id);
  workbook.chartId = chart.id;
  setState(state);
  saveState();
  return chart.id;
}

const duplicateChart = id => {
  const chart = currentCharts().find(c => c.id === id);
  return addChart(`${chart.name} copy`, structuredClone(chart.state));
};

function renameChart(id, name) {
  if (!clean(name)) return;
  workbook.charts = currentCharts().map(c => c.id === id ? { ...c, name: clean(name) } : c);
  saveState();
}

// Deleting a chart keeps it among the deleted, to be restored. The last chart can't be deleted.
function deleteChart(id) {
  if (workbook.charts.length < 2) return 'A workbook needs at least one chart.';
  const charts = currentCharts();
  const i = charts.findIndex(c => c.id === id);
  workbook.deleted = [{ ...charts[i], when: Date.now() }, ...workbook.deleted];
  workbook.charts = charts.filter(c => c.id !== id);
  undoByChart.delete(id);
  if (id === workbook.chartId) {
    const next = workbook.charts[Math.min(i, workbook.charts.length - 1)];
    const kept = undoByChart.get(next.id);
    undoStack.length = redoStack.length = 0;
    if (kept) { undoStack.push(...kept.undo); redoStack.push(...kept.redo); }
    workbook.chartId = next.id;
    setState(next.state);
  }
  saveState();
  return null;
}

function restoreChart(id) {
  const chart = workbook.deleted.find(c => c.id === id);
  if (!chart) return;
  workbook.deleted = workbook.deleted.filter(c => c !== chart);
  const { when, ...rest } = chart;
  addChart(rest.name, rest.state, rest.sample ? { sample: true } : {});
}

function freeChartName(base) {
  const taken = new Set(workbook.charts.map(c => norm(c.name)));
  if (!taken.has(norm(base))) return base;
  for (let n = 2; ; n++) if (!taken.has(norm(`${base} ${n}`))) return `${base} ${n}`;
}

// Copies another chart's definitions and names into this one, as one undoable step. The two stay unsynced:
// later changes to either don't reach the other. The specifications the definitions cover and the names name
// come along into this chart's schema, with their locations. A definition covering what one here covers
// replaces it, and so does a relation's name for the same form.
function copyDefinitionsFrom(chartId) {
  const source = currentCharts().find(c => c.id === chartId)?.state;
  if (!source) return 'That chart no longer exists.';
  const incoming = structuredClone(source.definitions ?? []);
  const theirs = new Set(incoming.flatMap(d => d.scope));
  const named = new Set(Object.keys(source.names ?? {}));
  const S = withTrees(schema, Object.values(source.schema ?? {}).filter(t => theirs.has(treeParam(t)) || named.has(formOfTree(t))));
  const kept = definitions.filter(d => !d.scope.some(p => theirs.has(p)));
  return change({ schema: S, definitions: [...kept, ...incoming.map(d => ({ ...d, id: newId() }))], names: { ...names, ...structuredClone(source.names ?? {}) } });
}

// ---- Computed records ----

// The formulas' last results (see Formulas.computeState in formulas.js), with the effective records.
// Without formulas.js loaded, the records are just the entered ones.
let formulaResult = { records: {}, rows: {} };
const runFormulas = (recs, defs = definitions, nms = names, S = schema) => typeof Formulas === 'undefined'
  ? { records: recs, rows: {} } : Formulas.computeState(recs, engineDefinitions(defs, nms, S), engineNames(nms, S));
function setComputed(result) {
  formulaResult = result;
  records = result.records;
}
const recompute = () => setComputed(runFormulas(entered));
const isComputed = id => !!records[id]?.computed;

// The parts of a record the data model has; a computed record carries more, for the formulas' own use.
const MODEL_KEYS = ['kind', 'at', 'edge', 'args', 'field', 'value', 'tag', 'choice'];
const modelPart = r => Object.fromEntries(MODEL_KEYS.filter(k => k in r).map(k => [k, r[k]]));

// The entered part of records about to be committed: what isn't computed, plus any computed record that
// an edit has changed, which is entered from now on, overriding the formula there. It keeps its id, so
// whatever is located at it stays put. A computed record missing from `next` just comes back.
function enteredPart(next) {
  const out = {};
  for (const [id, r] of Object.entries(next)) {
    if (!r.computed) out[id] = r;
    else if (r !== records[id]) out[id] = modelPart(r);
  }
  return out;
}

// ---- Formulas ----
// A definition is stored as { id, scope, formula } or { id, scope, implications: [{ label, formula }] },
// with `self` if its relation may relate a thing to itself. Its scope is the set of parameterizations it
// covers; everything else about it comes from the schema (its type, a field's datatype, a choice's options)
// and, for a relation, from the names (its name and the order of its edges). An entry's formula is named by
// its label.
//
// Two other forms are worked out from it: the one formulas.js takes (engineDefinitions), and the one people
// write and edit, which names what it covers by locations written as paths from a kind, like
// 'Entity › Entity Type: Limited Partnership' (asWritten). canonicalFormulas turns the second back.

// A location written as a path from a kind, as a tree: 'Entity › Entity Type: Limited Partnership'.
// A segment 'Edge: Option' is a choice; 'Edge' an attested tag, 'Not Edge' a ruled-out one.
function locationTree(text) {
  const [kind, ...segs] = String(text).split('›').map(s => clean(s));
  return segs.reduce((loc, seg) => {
    const i = seg.indexOf(':');
    if (i > 0) return { out: { choice: clean(seg.slice(i + 1)) }, args: [{ edge: clean(seg.slice(0, i)), loc }] };
    const not = /^not\s+/i.test(seg);
    return { out: { tag: !not }, args: [{ edge: not ? seg.replace(/^not\s+/i, '') : seg, loc }] };
  }, { kind });
}

// A location tree as a path from its kind; null if it isn't one (a relation, or below one).
function pathText(t) {
  if (t.kind !== undefined) return t.kind;
  if (t.args.length !== 1 || 'field' in t.out) return null;
  const up = pathText(t.args[0].loc);
  if (up === null) return null;
  const edge = t.args[0].edge;
  return `${up} › ${'choice' in t.out ? `${edge}: ${t.out.choice}` : `${t.out.tag ? '' : 'Not '}${edge}`}`;
}

// A parameterization's parameters: [{ edge, key }], each edge label (normalized) with its location's key.
const paramArgs = p => JSON.parse(p).map(a => { const [edge, key] = JSON.parse(a); return { edge, key }; });

// The options written into a formula, as a choice's formula may give them.
// The options a choice definition gives as written: texts in the places its value comes from (see formulas.js).
const writtenOptions = d => [d.formula, ...(d.implications ?? []).map(i => i.formula)].filter(Boolean).flatMap(Formulas.optionsWritten);

// A definition as people write it, from the stored one: its name, type and datatype, and what it covers as
// locations. A relation's locations are given per edge. Where a location isn't a path from a kind (it's a
// relation, or below one), the parameterizations are given in `covers` instead.
function asWritten(d, S = schema, N = names) {
  const trees = d.scope.flatMap(p => specsWithParam(p, S));
  const t = trees[0];
  const type = t ? typeOfTree(t) : 'tag';
  const isRel = d.scope.some(p => paramArgs(p).length > 1);
  const form = isRel && t ? formOfTree(t) : null;
  const rule = d.implications ? { implications: d.implications } : { formula: d.formula };
  const base = { id: d.id, type, ...(type === 'field' ? { datatype: t.out.field } : {}), ...(d.self ? { self: true } : {}), ...rule };
  const textOf = key => S[key] ? pathText(S[key]) : null;
  const pairs = d.scope.flatMap(paramArgs);
  const edges = isRel ? (form && N[form]?.edges) ?? t?.args.map(a => a.edge) ?? [] : [];
  const name = isRel ? (form ? formName(form, S, N) : edges.join(' · ')) : t?.args[0].edge ?? pairs[0]?.edge ?? '';
  if (pairs.some(a => textOf(a.key) === null))
    return { ...base, name, covers: d.scope, ...(isRel ? { args: edges.map(edge => ({ edge })) } : {}) };
  if (!isRel) return { ...base, name, at: [...new Set(pairs.map(a => textOf(a.key)))] };
  return { ...base, name, args: edges.map(edge => ({ edge, at: [...new Set(pairs.filter(a => same(a.edge, edge)).map(a => textOf(a.key)))] })) };
}

// The definitions as people write them, and one by id.
const allDefinitions = () => definitions.map(d => asWritten(d));
const definitionOf = id => { const d = definitions.find(x => x.id === id); return d ? asWritten(d) : null; };
// The definition covering a parameterization, if one does.
const definitionCovering = param => { const d = definitions.find(x => x.scope.includes(param)); return d ? asWritten(d) : null; };

// The definitions and names as formulas.js takes them.
function engineDefinitions(defs, N, S) {
  return defs.map(d => {
    const v = asWritten(d, S, N);
    const options = v.type === 'choice' ? [...new Set(d.scope.flatMap(p => specsWithParam(p, S)).map(t => t.out.choice))] : undefined;
    const { at, ...rest } = v;
    // A relation's form, by which the engine knows its name and lists: its scope is all of one form.
    const form = v.args && d.scope.length ? formOfParam(d.scope[0], v.type === 'field' ? v.datatype : v.type) : undefined;
    return { ...rest, covers: d.scope, ...(v.args ? { args: v.args.map(a => ({ edge: a.edge })) } : {}), ...(form ? { form } : {}), knownOptions: options };
  });
}
const engineNames = (N, S = schema) => ({ relations: Object.entries(N).map(([form, e]) => ({ name: formName(form, S, N), type: typeOfForm(form), edges: e.edges, form, lists: e.lists ?? {} })) });

// The trees a definition, as people write it, declares: one for each parameterization it covers, with its
// type's output (a choice's, for each option written into it). Locations come from the schema where it has
// them, so they keep its capitalization.
function declaredTrees(v, S) {
  const known = t => S[treeKey(t)] ?? t;
  const outs = v.type === 'tag' ? [{ tag: true }] : v.type === 'choice' ? writtenOptions(v).map(choice => ({ choice })) : [{ field: v.datatype ?? 'number' }];
  let argSets;
  if (v.covers) {
    const edgeOf = edge => v.args ? v.args.find(x => same(x.edge, edge))?.edge ?? edge : v.name;
    argSets = v.covers.map(p => paramArgs(p).map(a => ({ edge: edgeOf(a.edge), loc: S[a.key] })));
    if (argSets.some(args => args.some(a => !a.loc))) return [];
  } else if (v.args) {
    argSets = [[]];
    for (const a of v.args) argSets = argSets.flatMap(set => (a.at ?? []).map(text => [...set, { edge: a.edge, loc: known(locationTree(text)) }]));
  } else argSets = (v.at ?? []).map(text => [{ edge: v.name, loc: known(locationTree(text)) }]);
  return argSets.flatMap(args => outs.map(out => ({ out, args })));
}

// Turns definitions and names into their stored forms, whichever form they come in, and adds to the schema
// what the definitions declare. A definition whose type changed sheds the specifications of its old type
// that no entered record uses (`used`, a set of specification keys). Names come keyed by form, or as a
// list of { name, type, edges, lists }, which is matched to the relations in the schema.
function canonicalFormulas(defs, nms, S, used = new Set()) {
  let N = nms?.relations ? {} : { ...(nms ?? {}) };
  const out = [];
  for (const d of defs) {
    if (d.scope && d.name === undefined) { out.push(d); continue; }
    const scope = Formulas.coversOf(d);
    const trees = declaredTrees(d, S);
    const sorts = new Set(trees.map(sortOf));
    const shed = Object.keys(S).filter(k => scope.includes(treeParam(S[k])) && !sorts.has(sortOf(S[k])) && !used.has(k));
    if (shed.length) { S = { ...S }; shed.forEach(k => delete S[k]); }
    S = withTrees(S, trees);
    const rule = d.implications ? { implications: d.implications } : { formula: d.formula };
    out.push({ id: d.id, scope, ...rule, ...(d.self ? { self: true } : {}) });
    if (d.args && trees[0]) {
      const form = formOfTree(trees[0]);
      N = { ...N, [form]: { lists: {}, ...N[form], name: d.name, edges: d.args.map(a => a.edge) } };
    }
  }
  for (const n of nms?.relations ?? []) {
    const forms = new Set(Object.values(S).filter(t => t.args?.length > 1 && typeOfTree(t) === n.type
      && sameEdges(t.args.map(a => a.edge), n.edges)).map(formOfTree));
    for (const form of forms) N = { ...N, [form]: { name: n.name, edges: n.edges, lists: n.lists ?? {} } };
  }
  return { definitions: out, names: N, schema: S };
}
const sameEdges = (a, b) => a.length === b.length && a.map(norm).sort().join('|') === b.map(norm).sort().join('|');

// The forms the definitions cover, worked out once for each working-out of the formulas, which a change to
// the definitions always brings. A relation of a covered form is computed, though one may be entered too.
const coveredFormsCache = new WeakMap();
function coveredForms() {
  if (!coveredFormsCache.has(formulaResult))
    coveredFormsCache.set(formulaResult, new Set(definitions.flatMap(d => d.scope.flatMap(p => specsWithParam(p).map(formOfTree)))));
  return coveredFormsCache.get(formulaResult);
}
// The definitions covering a form's parameterizations, as people write them.
const definitionsOfForm = form => definitions.filter(d => d.scope.some(p => specsWithParam(p).some(t => formOfTree(t) === form))).map(d => asWritten(d));

// What the formulas say about a record, or null: for a computed record, { def, labels, reads } (its
// definition, the implications that held and what each read); for an entered record that a formula also
// covers, { def, mark, formula, labels }, where mark is 'agrees', 'differs', 'also implied' or 'overrides'.
const formulaInfo = id => formulaResult.computed?.[id] ?? formulaResult.covered?.[id] ?? null;

// Errors the formulas ran into: a definition's own (it doesn't parse, say), and its records'.
const definitionError = defId => formulaResult.defErrors?.[defId] ?? null;
const recordErrors = defId => (formulaResult.errors ?? []).filter(e => e.def === defId);

// Every change to the formulas or the names they use goes through change(), as one undoable step.
// `renames` are [from, to] pairs of names to carry into the views' filters too.
const changeFormulas = (nextDefinitions, nextNames = names, renames = []) => change({ definitions: nextDefinitions, names: nextNames }, { renames });

// A renamed name carried into every formula that mentions it, as Excel carries a renamed defined name into
// its formulas: for a definition or relation renamed, or a list of relatives given a new name.
function renamedInFormulas(defs, from, to) {
  if (!clean(from) || !clean(to) || same(from, to)) return defs;
  const re = text => Formulas.renameName(text, from, to);
  return defs.map(d => ({ ...d,
    ...(d.formula !== undefined ? { formula: re(d.formula) } : {}),
    ...(d.implications ? { implications: d.implications.map(i => ({ ...i, formula: re(i.formula) })) } : {}) }));
}

// The same for the views' filters, as part of the change being made, so its undo takes them back too.
function renameInFilters(renames) {
  const pairs = renames.filter(([from, to]) => clean(from) && clean(to) && !same(from, to));
  if (!pairs.length) return;
  views = currentViews().map(v => v.filter ? { ...v, filter: pairs.reduce((t, [from, to]) => Formulas.renameName(t, from, to), v.filter) } : v);
}

// Adds a definition, or replaces the one with its id; it may come as people write it. Returns why it
// couldn't, if it couldn't. A definition given a new name takes it into the formulas and filters that
// mention the old one.
function saveDefinition(def) {
  const old = definitionOf(def.id);
  const defs = old ? definitions.map(d => d.id === def.id ? def : d) : [...definitions, def];
  if (!old || def.name === undefined || same(old.name, def.name)) return changeFormulas(defs);
  return changeFormulas(renamedInFormulas(defs, old.name, def.name), names, [[old.name, def.name]]);
}
const deleteDefinition = id => changeFormulas(definitions.filter(d => d.id !== id));
const saveNames = next => changeFormulas(definitions, next);

// Drops an entered record that a formula covers, so the formula's output stands there again.
function useFormula(id) {
  const { [id]: _, ...rest } = entered;
  return change({ entered: rest });
}

// Records a computed record's output by hand, like Excel's Paste Values. It keeps its id.
const keepAsEntered = id => commit({ ...records, [id]: modelPart(records[id]) });

// ---- Names ----
// The names of relations and of their lists of relatives, by form: { [form]: { name, edges, lists } },
// with `edges` in the relation's own order and `lists` as { [from edge]: { [listed edge]: list name } }
// (edges normalized). A list without a name goes by the edge label it lists.

const typeOfForm = form => { const s = JSON.parse(form)[0]; return s === 'tag' || s === 'choice' ? s : 'field'; };

// A relation form's name: the one in the names, or for want of one, its edge labels in order. This is the
// one way a relation is named, wherever it's shown.
function formName(form, S = schema, N = names) {
  if (N[form]?.name) return N[form].name;
  return (N[form]?.edges ?? specsOfForm(form, S)[0]?.args.map(a => a.edge) ?? []).join(' · ');
}
// A relation record's name, from its form.
function relationNameOf(id) {
  const t = treeOf(records, id);
  return t ? formName(formOfTree(t)) : relationLabel(records[id]);
}

// The name of the list of relatives in the `listed` role, seen from the `from` role, for a relation form:
// its list name, or for want of one, the listed role's edge label, as formulas.js reads it too.
function listName(form, from, listed, N = names) {
  const lists = Object.entries(N[form]?.lists ?? {}).find(([k]) => same(k, from))?.[1];
  return Object.entries(lists ?? {}).find(([k]) => same(k, listed))?.[1] ?? listed;
}

// ---- Views ----

const viewInUse = () => views.find(v => v.id === viewId);

// Switching views isn't an edit, so it isn't undone; an undo goes back to the view its edit was made in.
function switchView(id) {
  if (id === viewId || !views.some(v => v.id === id)) return;
  views = currentViews();
  viewId = id;
  ({ styles, layout } = viewInUse());
  keepTabPlace();
  saveState();
}

// A new view starts as a copy of the current one, what it hides included.
function addView(name) {
  pushUndo();
  const view = { id: newId(), name, styles: structuredClone(styles), layout: structuredClone(layout), hidden: [...(viewInUse().hidden ?? [])] };
  views = [...currentViews(), view];
  viewId = view.id;
  saveState();
  return view.id;
}

function renameView(id, name) {
  if (!clean(name)) return;
  pushUndo();
  views = currentViews().map(v => v.id === id ? { ...v, name: clean(name) } : v);
  saveState();
}

// The last view can't be deleted. Deleting the current one moves to its neighbor.
function deleteView(id) {
  if (views.length < 2) return;
  pushUndo();
  const i = views.findIndex(v => v.id === id);
  views = currentViews().filter(v => v.id !== id);
  if (id === viewId) {
    viewId = views[Math.min(i, views.length - 1)].id;
    ({ styles, layout } = viewInUse());
  }
  saveState();
}

function moveView(id, to) {
  pushUndo();
  const list = currentViews();
  const [view] = list.splice(list.findIndex(v => v.id === id), 1);
  list.splice(to, 0, view);
  views = list;
  saveState();
}

const isObject = r => 'kind' in r;
const isField = r => 'field' in r;
const isTag = r => 'tag' in r;
const isChoice = r => 'choice' in r;
const isRelation = r => 'args' in r;
const typeOf = r => isField(r) ? 'field' : isTag(r) ? 'tag' : 'choice';
// An entry's arguments: a path entry's single location, or a relation's several.
const argsOf = r => r.args ?? (r.at ? [{ edge: r.edge, at: r.at }] : []);
const relationLabel = r => r.args.map(a => a.edge).join(' · ');
// How a record is named in UI text: an entry by its label, a relation by its name (see formName).
const recordLabel = id => isRelation(records[id]) ? relationNameOf(id) : records[id].edge;

const TYPE_NAMES = { field: 'Field', tag: 'Tag', choice: 'Choice' };
const DATATYPE_NAMES = { text: 'Text', number: 'Number', percent: 'Percent', money: 'Money', date: 'Date', document: 'Document' };
// What a value box for each datatype asks for.
const VALUE_HINTS = { text: 'Value', number: 'Amount', percent: 'Percent, like 25%', money: 'Amount, like $1,000', date: 'Date' };

let idCounter = 0;
const newId = () => `r${Date.now().toString(36)}${(idCounter++).toString(36)}`;

// ---- Field values ----

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function monthNumber(word) {
  const w = word.toLowerCase().replace(/\.$/, '');
  return MONTHS.findIndex(m => m.toLowerCase() === w || m.slice(0, 3).toLowerCase() === w || (w === 'sept' && m === 'September')) + 1;
}

// Reads 2019-03-04, 3/4/2019, March 4, 2019, Mar. 4, 2019 or 4 March 2019 as an ISO date, or returns null.
function parseDate(s) {
  let m, y, mo, d;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) [, y, mo, d] = m;
  // Month first, as typed in the US, with / or -, and a two-digit year read as Excel reads it: 00–29 in
  // the 2000s, 30–99 in the 1900s.
  else if ((m = s.match(/^(\d{1,2})([/-])(\d{1,2})\2(\d{4}|\d{2})$/))) {
    [, mo, , d, y] = m;
    if (y.length === 2) y = String(Number(y) < 30 ? 2000 + Number(y) : 1900 + Number(y));
  }
  else if ((m = s.match(/^([A-Za-z]+\.?) (\d{1,2}),? (\d{4})$/))) [y, mo, d] = [m[3], monthNumber(m[1]), m[2]];
  else if ((m = s.match(/^(\d{1,2}) ([A-Za-z]+\.?),? (\d{4})$/))) [y, mo, d] = [m[3], monthNumber(m[2]), m[1]];
  else return null;
  [y, mo, d] = [y, mo, d].map(Number);
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (!mo || date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
const formatDate = iso => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
};

// A field's value is canonical for its datatype, whether typed or computed: text is a string; a number, a
// percentage and an amount of money are numbers (a percentage as a fraction, 0.716 for 71.6%); a date is
// an ISO date, 2023-02-14. How a value reads, and how typing reads, follow from its datatype.

// Amounts as typed: 1,000, $750,000,000 or 12.5%. A leading zero (0803456789) marks an identifier: text.
const NUMBER = /^[-+]?\$?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?%?$/;
const isNumber = s => NUMBER.test(s) && !/^[-+]?\$?0\d/.test(s);

// A document is where it lives: a URL (a SharePoint or OneDrive file, a DMS link, an EDGAR filing) or a
// network path. Its value is that address, and it reads as the file it names.
const isAddress = s => /^[a-z][a-z0-9+.-]*:\/\/\S+$/i.test(s) || /^\\\\[^\\\s]+\\\S+/.test(s);

// The datatype something typed reads as, where nothing else says.
const classify = s => isAddress(s) ? 'document' : parseDate(s) ? 'date' : !isNumber(s) ? 'text'
  : s.endsWith('%') ? 'percent' : /^[-+]?\$/.test(s) ? 'money' : 'number';
const asPhrase = datatype => ({ text: 'text', number: 'a number', percent: 'a percentage', money: 'an amount of money',
  date: 'a date', document: 'a link to a document' })[datatype];

// The name a document goes by: its file name, from the last part of its address, or else its host.
function documentName(address) {
  const s = String(address);
  const path = s.replace(/[?#].*$/, '').replace(/[\\/]+$/, '');
  const last = path.split(/[\\/]/).pop();
  try { return decodeURIComponent(last || s); } catch { return last || s; }
}

// What's typed as a value of a datatype, or undefined if it isn't one. In a percentage, a bare number is
// a percentage too: 25 is 25%.
function parseValue(datatype, raw) {
  const s = clean(raw);
  if (!s) return undefined;
  if (datatype === 'date') return parseDate(s) ?? undefined;
  if (datatype === 'document') return isAddress(s) ? s : undefined;
  if (datatype === 'text') return s;
  if (!isNumber(s) || (datatype !== 'percent' && s.endsWith('%'))) return undefined;
  const n = Number(s.replace(/[$,%]/g, ''));
  return datatype === 'percent' ? n / 100 : n;
}

// How a value of a datatype reads: 71.6%, $750,000,000, 1,000, February 14, 2023.
function showValue(datatype, v) {
  if (v === null || v === undefined) return '';
  if (datatype === 'date') return formatDate(v);
  if (datatype === 'document') return documentName(v);
  if (typeof v !== 'number') return String(v);
  const n = (x, min = 0) => x.toLocaleString('en-US', { minimumFractionDigits: min, maximumFractionDigits: 2 });
  if (datatype === 'percent') return `${n(v * 100)}%`;
  if (datatype === 'money') return `${v < 0 ? '-' : ''}$${n(Math.abs(v), Number.isInteger(v) ? 0 : 2)}`;
  return n(v);
}
const displayValue = r => showValue(r.field, r.value);

// ---- Reading the state ----

const isObjectName = (id, recs = records) => isField(recs[id]) && same(recs[id].edge, 'name') && isObject(recs[recs[id].at]);

// Compares { type, label } items: labels in the order they've been dragged into come first, in that order;
// the rest follow as fields, tags, then choices, alphabetical within each.
const TYPE_RANK = { field: 0, tag: 1, choice: 2 };
function orderedBy(placed) {
  const rank = label => { const i = placed.indexOf(norm(label)); return i < 0 ? Infinity : i; };
  return (a, b) => rank(a.label) - rank(b.label) || TYPE_RANK[a.type] - TYPE_RANK[b.type] || byLabel(a.label, b.label);
}

// Records are read by where they are far more often than they change, and a set of records is never changed
// in place, so each set is indexed once, when first read: entries by their location, relations by each
// location they relate, and objects by kind.
const recordIndexes = new WeakMap();
function recordIndex(recs) {
  let ix = recordIndexes.get(recs);
  if (!ix) {
    ix = { at: new Map(), rels: new Map(), kinds: new Map() };
    for (const [id, r] of Object.entries(recs)) {
      if (r.at) pushTo(ix.at, r.at, id);
      if (r.args) for (const at of new Set(r.args.map(a => a.at))) pushTo(ix.rels, at, id);
      if (isObject(r)) pushTo(ix.kinds, norm(r.kind), id);
    }
    recordIndexes.set(recs, ix);
  }
  return ix;
}

// Name first, then the order shared by locations with the same specification.
function entriesOf(id, recs = records) {
  const ids = [...(recordIndex(recs).at.get(id) ?? [])];
  if (ids.length < 2) return ids;
  const compare = orderedBy(order[specKey(recs, id)] ?? []);
  const item = k => ({ type: typeOf(recs[k]), label: recs[k].edge });
  return ids.sort((a, b) => isObjectName(b, recs) - isObjectName(a, recs) || compare(item(a), item(b)));
}

// An object has one Name, so it's found without putting the entries in order.
function objectName(id, recs = records) {
  const nameId = (recordIndex(recs).at.get(id) ?? []).find(k => isObjectName(k, recs));
  return nameId ? recs[nameId].value : `${recs[id].kind} ${id}`;
}
const nameRecordOf = id => (recordIndex(records).at.get(id) ?? []).find(k => isObjectName(k));

const objectsOfKind = kind => [...(recordIndex(records).kinds.get(norm(kind)) ?? [])]
  .sort((a, b) => byLabel(objectName(a), objectName(b)));
const countOfKind = kind => recordIndex(records).kinds.get(norm(kind))?.length ?? 0;

// The kinds in the schema, each as first written.
const kindsInState = () => Object.values(schema).filter(t => t.kind !== undefined).map(t => t.kind).sort(byLabel);

// Locations up to the object, ordered object-first like a file path.
function pathTo(id) {
  const path = [];
  for (let cur = id; cur; cur = records[cur].at) path.unshift(cur);
  return path;
}
// The object a location belongs to: the start of its path.
const objectOf = id => pathTo(id)[0];

// A record's underlying specification, serialized: an object's kind, or an entry's root label followed by
// each argument's edge and its location's specification, sorted, since the tree is unordered.
// States are never mutated, so each one's keys are worked out once.
const specCache = new WeakMap();
function specKey(recs, id) {
  if (!specCache.has(recs)) specCache.set(recs, new Map());
  const cache = specCache.get(recs);
  if (!cache.has(id)) {
    const r = recs[id];
    cache.set(id, isObject(r) ? `kind:${norm(r.kind)}` : JSON.stringify([rootLabel(r), ...argSpecs(recs, r)]));
  }
  return cache.get(id);
}
const rootLabel = r => isTag(r) ? `tag:${r.tag}` : isChoice(r) ? `choice:${norm(r.choice)}` : `field:${r.field}`;
const argSpecs = (recs, r) => argsOf(r).map(a => JSON.stringify([norm(a.edge), specKey(recs, a.at)])).sort();

// The record's underlying specification with its root label removed. Every object's is the same:
// a lone unlabeled node, whose outputs are the kinds.
const parameterization = (recs, id) => JSON.stringify(argSpecs(recs, recs[id]));

// The record's output, the label of its root, as a key: its kind, Boolean, option or datatype.
const outputKey = r => isObject(r) ? norm(r.kind) : isTag(r) ? String(r.tag) : isChoice(r) ? norm(r.choice) : r.field;
const outputText = r => isObject(r) ? r.kind : isTag(r) ? (r.tag ? 'Attested' : 'Ruled out') : isChoice(r) ? r.choice : DATATYPE_NAMES[r.field];

// ---- The schema ----
// A chart keeps its schema S explicitly, as data-model.md has it. `schema` maps each specification's key
// (as specKey gives it) to the specification as a tree, capitalized as it was first written:
//   a kind:                  { kind: 'Entity' }
//   an entry or a relation:  { out: { field: datatype } | { choice: option } | { tag: Boolean }, args: [{ edge, loc }] }
// each `loc` being its location's own tree. S holds the specification of every record, entered or computed,
// and every location of every specification in it. It grows as records come in. A specification leaves it
// only by moving (see moveAbandoned and renameEvery), by being shed when a formula's type changes, by
// giving way to records that conflict with it while unused, or by being removed in the panel's Schema view.

const outOf = r => isField(r) ? { field: r.field } : isChoice(r) ? { choice: r.choice } : { tag: r.tag };
const outKey = out => 'field' in out ? `field:${out.field}` : 'choice' in out ? `choice:${norm(out.choice)}` : `tag:${out.tag}`;
const typeOfTree = t => t.kind !== undefined ? 'object' : 'field' in t.out ? 'field' : 'choice' in t.out ? 'choice' : 'tag';
const argKeysOf = (t, keyOf) => t.args.map(a => JSON.stringify([norm(a.edge), keyOf(a.loc)])).sort();

// A tree's key, as specKey gives it, and its parameterization's key, as parameterization gives it.
const keyMemo = new WeakMap();
function treeKey(t) {
  if (!keyMemo.has(t)) keyMemo.set(t, t.kind !== undefined ? `kind:${norm(t.kind)}` : JSON.stringify([outKey(t.out), ...argKeysOf(t, treeKey)]));
  return keyMemo.get(t);
}
const treeParam = t => t.kind !== undefined ? '[]' : JSON.stringify(argKeysOf(t, treeKey));

// A tree's shape is the tree with every node label erased and its edge labels kept; its sort, what kind
// of output it has: a field's datatype, 'choice', 'tag', or 'object' for a kind. A specification's form is
// its shape with its sort. Ownership of an Entity by an Individual and by an Investor Group have one form;
// so do Tax Classification under each Entity Type, and the Name of anything.
const shapeMemo = new WeakMap(), formMemo = new WeakMap();
function shapeOf(t) {
  if (!shapeMemo.has(t)) shapeMemo.set(t, t.kind !== undefined ? '•' : JSON.stringify(['∘', ...argKeysOf(t, shapeOf)]));
  return shapeMemo.get(t);
}
const sortOf = t => t.kind !== undefined ? 'object' : 'field' in t.out ? t.out.field : 'choice' in t.out ? 'choice' : 'tag';
function formOfTree(t) {
  if (!formMemo.has(t)) formMemo.set(t, t.kind !== undefined ? 'object' : JSON.stringify([sortOf(t), ...argKeysOf(t, shapeOf)]));
  return formMemo.get(t);
}

// The same from keys alone, with no trees: a specification key's shape, and a parameterization's form
// given its sort.
function shapeOfKey(key) {
  if (key.startsWith('kind:')) return '•';
  const [, ...args] = JSON.parse(key);
  return JSON.stringify(['∘', ...args.map(a => { const [e, k] = JSON.parse(a); return JSON.stringify([e, shapeOfKey(k)]); }).sort()]);
}
const formOfParam = (param, sort) => param === '[]' ? 'object'
  : JSON.stringify([sort, ...JSON.parse(param).map(a => { const [e, k] = JSON.parse(a); return JSON.stringify([e, shapeOfKey(k)]); }).sort()]);

// A record's specification as a tree, built from the records, or null where a location is missing.
const treeCache = new WeakMap();
function treeOf(recs, id) {
  if (!treeCache.has(recs)) treeCache.set(recs, new Map());
  const cache = treeCache.get(recs);
  if (!cache.has(id)) {
    const r = recs[id];
    let t = null;
    if (r && isObject(r)) t = { kind: r.kind };
    else if (r) {
      const args = argsOf(r).map(a => ({ edge: a.edge, loc: treeOf(recs, a.at) }));
      if (args.every(a => a.loc)) t = { out: outOf(r), args };
    }
    cache.set(id, t);
  }
  return cache.get(id);
}
// A record's form.
const formKeyOf = (id, recs = records) => { const t = treeOf(recs, id); return t ? formOfTree(t) : null; };

// S with trees added, and their locations: those it has already keep their capitalization.
function withTrees(S, trees) {
  let out = S;
  const add = t => {
    const k = treeKey(t);
    if (out[k]) return;
    if (out === S) out = { ...S };
    out[k] = t;
    t.args?.forEach(a => add(a.loc));
  };
  trees.forEach(t => t && add(t));
  return out;
}
const withSpecsOf = (S, recs) => withTrees(S, Object.keys(recs).map(id => treeOf(recs, id)));

// What the schema says, worked out once for each schema: its specifications by parameterization and by
// form, and the entries and relations of each location specification.
const pushTo = (map, key, v) => { if (!map.has(key)) map.set(key, []); map.get(key).push(v); };
const schemaIndexes = new WeakMap();
function indexOf(S = schema) {
  if (!schemaIndexes.has(S)) {
    const ix = { byParam: new Map(), byForm: new Map(), entriesAt: new Map(), relationsAt: new Map(), kinds: [] };
    for (const [k, t] of Object.entries(S)) {
      pushTo(ix.byParam, treeParam(t), k);
      pushTo(ix.byForm, formOfTree(t), k);
      if (!t.args) ix.kinds.push(k);
      else if (t.args.length === 1) pushTo(ix.entriesAt, treeKey(t.args[0].loc), k);
      else for (const loc of new Set(t.args.map(a => treeKey(a.loc)))) pushTo(ix.relationsAt, loc, k);
    }
    schemaIndexes.set(S, ix);
  }
  return schemaIndexes.get(S);
}
const specsWithParam = (p, S = schema) => (indexOf(S).byParam.get(p) ?? []).map(k => S[k]);
const specsOfForm = (f, S = schema) => (indexOf(S).byForm.get(f) ?? []).map(k => S[k]);
const formsOfSchema = (S = schema) => [...indexOf(S).byForm.keys()];

// The outputs a form has in the schema, as [key, text] pairs, keyed as outputKey keys records: kinds,
// options, attested and ruled out, or a datatype.
function formOutputs(f, S = schema) {
  const out = new Map();
  for (const t of specsOfForm(f, S)) {
    const [key, text] = treeOutput(t);
    if (!out.has(key)) out.set(key, text);
  }
  return [...out];
}
// A specification's output, as [key, text]: the key as outputKey gives a record's, the text as outputText.
const treeOutput = t => t.kind !== undefined ? [norm(t.kind), t.kind] : 'choice' in t.out ? [norm(t.out.choice), t.out.choice]
  : 'tag' in t.out ? [String(t.out.tag), t.out.tag ? 'Attested' : 'Ruled out'] : [t.out.field, DATATYPE_NAMES[t.out.field]];

// How many records have each specification, and which: worked out once for each set of records.
const usageCache = new WeakMap();
function usage(recs = records) {
  if (!usageCache.has(recs)) {
    const u = new Map();
    for (const id of Object.keys(recs)) { const t = treeOf(recs, id); if (t) pushTo(u, treeKey(t), id); }
    usageCache.set(recs, u);
  }
  return usageCache.get(recs);
}

// A form described for people: what it's called (an entry's label, a relation's name or edges) and where
// it is (the kinds and paths of its locations).
function describeForm(f, S = schema) {
  if (f === 'object') return { label: 'Kind', where: 'every object' };
  const trees = specsOfForm(f, S);
  const t = trees[0];
  if (!t) return { label: 'Nothing in the chart', where: '' };
  const locsOf = arg => trees.map(x => x.args.find(a => same(a.edge, arg.edge))?.loc).filter(Boolean);
  const kindsOf = arg => [...new Set(locsOf(arg).map(kindOfTree).filter(Boolean))];
  if (t.args.length > 1) return { label: formName(f, S), where: t.args.map(a => joinList(kindsOf(a), 'or')).join(' → ') };
  const top = t.args[0].loc.kind !== undefined;
  const places = top ? kindsOf(t.args[0]).map(plural) : [...new Set(locsOf(t.args[0]).map(placeText))];
  return { label: t.args[0].edge, where: top ? `on ${joinList(places)}` : `under ${joinList(places, 'or')}` };
}
// The kind a location belongs to: the kind at the end of its path, if it's a path.
const kindOfTree = t => t.kind ?? (t.args.length === 1 ? kindOfTree(t.args[0].loc) : null);
// A location as a description reads it: a kind, a path from one, or a relation and what it relates.
function placeText(loc) {
  if (loc.kind !== undefined) return loc.kind;
  if (loc.args.length > 1) return formName(formOfTree(loc));
  return pathText(loc) ?? `${placeText(loc.args[0].loc)} › ${loc.args[0].edge}`;
}
// Where a record's entries sit, as headings say it: "on Entities", or "under Entity › Jurisdiction:
// Delaware", "under Ownership".
function whereAt(id) {
  const t = treeOf(records, id);
  if (!t) return '';
  return t.kind !== undefined ? `on ${plural(t.kind)}` : `under ${placeText(t)}`;
}
// The name of what a record belongs to: its object's name, or the relation it's located at (or below).
const placeName = id => segmentText(pathTo(id)[0]);
const joinList = (items, word = 'and') => items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} ${word} ${items.at(-1)}`;

// The first way S fails the schema conditions: no two fields, or a field and a tag, or a choice and either,
// may share a parameterization. Null if it doesn't.
function schemaError(S) {
  for (const [p, keys] of indexOf(S).byParam) {
    if (p === '[]') continue;
    const trees = keys.map(k => S[k]);
    const label = trees[0].args.map(a => a.edge).join(' · ');
    const types = new Set(trees.map(typeOfTree));
    const datatypes = [...new Set(trees.filter(t => 'field' in t.out).map(t => t.out.field))];
    if (datatypes.length > 1) return `${label} can’t be both a ${datatypes[0]} field and a ${datatypes[1]} field.`;
    if (types.has('choice') && types.size > 1) return `${label} can’t be both a choice and a ${types.has('tag') ? 'tag' : 'field'}.`;
    if (types.has('tag') && types.has('field')) return `${label} can’t be both a tag and a field.`;
  }
  return null;
}

// S less the unused specifications that conflict with ones in use: records win over what nothing has.
// A specification is in use if a record has it, a record sits below it, or a formula covers it.
function settleConflicts(S, recs, defs) {
  const used = new Set(usage(recs).keys());
  for (const k of [...used]) for (const loc of locationsBelow(S[k])) used.add(treeKey(loc));
  const covered = new Set(defs.flatMap(d => d.scope));
  let out = S;
  for (const keys of indexOf(S).byParam.values()) {
    const trees = keys.map(k => S[k]);
    if (trees.length < 2 || !trees.some(t => t.args)) continue;
    const kept = keys.filter(k => used.has(k) || covered.has(treeParam(S[k])));
    const sorts = new Set(kept.map(k => sortOf(S[k])));
    const types = new Set(kept.map(k => typeOfTree(S[k])));
    for (const k of keys) {
      if (kept.includes(k) || (sorts.has(sortOf(S[k])) && types.size <= 1) || !sorts.size) continue;
      if (out === S) out = { ...S };
      delete out[k];
    }
  }
  return out;
}
const locationsBelow = t => t?.args ? t.args.flatMap(a => [a.loc, ...locationsBelow(a.loc)]) : [];

// ---- What the schema offers ----

// The fields that relations like this one have located at them in the schema, as { label, datatype }:
// relations of the same form and output, whatever kinds their sides are, so ownership by a new kind of
// owner is offered a Percentage too. A ruled-out tag has none.
function detailFieldsOf(id) {
  const r = records[id];
  if (isTag(r) && !r.tag) return [];
  const t = treeOf(records, id);
  if (!t) return [];
  const fields = new Map();
  for (const s of Object.values(schema)) {
    if (s.args?.length !== 1 || !('field' in s.out)) continue;
    const loc = s.args[0].loc;
    if (loc.args?.length > 1 && formOfTree(loc) === formOfTree(t) && outKey(loc.out) === outKey(t.out) && !fields.has(norm(s.args[0].edge)))
      fields.set(norm(s.args[0].edge), { label: s.args[0].edge, datatype: s.out.field });
  }
  return [...fields.values()];
}

// Relations with an argument at `id`.
const relationsAt = (id, recs = records) => [...(recordIndex(recs).rels.get(id) ?? [])];
const hasEntries = id => entriesOf(id).length > 0 || relationsAt(id).length > 0;

// Every record whose path starts at the object, the object included.
const recordsUnder = obj => Object.keys(records).filter(k => !isRelation(records[k]) && objectOf(k) === obj);

// How a record reads as one segment of a path. A relation reads as its name.
function segmentText(id) {
  const r = records[id];
  if (isObject(r)) return objectName(id);
  if (isRelation(r)) return relationNameOf(id);
  if (isTag(r)) return `${r.tag ? '' : 'Not '}${r.edge}`;
  return isChoice(r) ? `${r.edge}: ${r.choice}` : r.edge;
}

// The options a choice has in the schema, for its dropdown: the outputs of its parameterization.
const outputsOf = id => [...new Set(specsWithParam(parameterization(records, id)).filter(t => 'choice' in t.out).map(t => t.out.choice))].sort(byLabel);

// A relation seen from a location, as the panel groups it: its form, and the split of its edges into the
// location's own and the others'. Relations of one form, seen from the same role, share a row there, and
// adding another to the row starts from the same key.
const relationRowKey = (form, own, others) => JSON.stringify([form, own.map(norm).sort(), others.map(norm).sort()]);

// The relations at a location, grouped into the rows that show them there, by form and role. A row is
// labeled with its list name: the list of relatives in the other role, seen from this one (Owners).
function relationGroups(at) {
  const groups = new Map();
  for (const id of relationsAt(at)) {
    const r = records[id];
    const form = formKeyOf(id);
    const own = r.args.filter(a => a.at === at).map(a => a.edge);
    const others = r.args.filter(a => a.at !== at).map(a => a.edge);
    const key = relationRowKey(form, own, others);
    if (!groups.has(key)) groups.set(key, { key, form, type: typeOf(r), own, others, ids: [],
      list: others.length ? listName(form, own[0], others[0]) : own.join(' · ') });
    groups.get(key).ids.push(id);
  }
  return [...groups.values()].sort((a, b) => byLabel(a.list, b.list));
}

// The two-argument relations in the schema that a location like `at` takes part in: one per form and role
// this location would have, with every specification on the other side. Each carries its relation's name,
// the list it adds to here (Owners), and whether a definition covers its form, in which case adding one
// attests it by hand.
function relationTypesAt(at) {
  const spec = specKey(records, at);
  const types = new Map();
  for (const k of indexOf().relationsAt.get(spec) ?? []) {
    const t = schema[k];
    if (t.args.length !== 2) continue;
    const form = formOfTree(t);
    t.args.forEach((own, i) => {
      if (treeKey(own.loc) !== spec) return;
      const other = t.args[1 - i];
      const type = typeOfTree(t);
      const key = relationRowKey(form, [own.edge], [other.edge]);
      if (!types.has(key)) types.set(key, { key, form, type, own: own.edge, other: other.edge, ownFirst: i === 0, otherSpecs: new Set(),
        datatype: t.out.field, outputs: [], name: formName(form), list: listName(form, own.edge, other.edge), computed: coveredForms().has(form) });
      const rel = types.get(key);
      rel.otherSpecs.add(treeKey(other.loc));
      if (type === 'choice' && !rel.outputs.some(o => same(o, t.out.choice))) rel.outputs.push(t.out.choice);
    });
  }
  return [...types.values()].sort((a, b) => a.computed - b.computed || byLabel(a.list, b.list));
}

// The entries the schema has for locations like `at` (with its specification), one per type and label,
// with each field's datatype and each choice's options. `exceptId` leaves out what only that record has, so
// an entry being edited isn't held to its own datatype.
function schemaAt(at, exceptId) {
  const loc = specKey(records, at);
  const used = usage();
  const params = new Map();
  for (const k of indexOf().entriesAt.get(loc) ?? []) {
    const users = used.get(k) ?? [];
    if (exceptId && users.length === 1 && users[0] === exceptId) continue;
    const t = schema[k];
    const type = typeOfTree(t);
    const key = `${type}:${norm(t.args[0].edge)}`;
    if (!params.has(key)) params.set(key, { type, label: t.args[0].edge, datatype: t.out.field, outputs: [] });
    const p = params.get(key);
    if (type === 'choice' && !p.outputs.some(o => same(o, t.out.choice))) p.outputs.push(t.out.choice);
  }
  return [...params.values()];
}

// The datatype other fields with this label already have at locations like `at`, if any.
const fieldDatatype = (at, label, exceptId) =>
  schemaAt(at, exceptId).find(p => p.type === 'field' && same(p.label, label))?.datatype;

// Returns a message for the first way `recs` fails to be a state, or null if it is one. The schema
// conditions are checked on the schema itself (schemaError).
function validate(recs) {
  // Two entries with the same edges to the same locations would share an argumentation.
  const seen = new Set();
  for (const r of Object.values(recs)) {
    if (isObject(r)) continue;
    if (argsOf(r).some(a => !recs[a.at])) return 'Something it’s located at no longer exists.';
    const key = JSON.stringify(argsOf(r).map(a => JSON.stringify([norm(a.edge), a.at])).sort());
    if (seen.has(key)) return isRelation(r) ? 'That relation is already recorded.' : `There’s already an entry called ${r.edge} here.`;
    seen.add(key);
  }
  for (const [id, r] of Object.entries(recs)) {
    if (isObject(r) && !entriesOf(id, recs).some(e => isObjectName(e, recs)))
      return `Every ${r.kind.toLowerCase()} needs a Name.`;
  }
  return null;
}

// The first way the definitions fail the model's conditions (model.html 7.7), or null: each covers a
// nonempty set of parameterizations, all of one form, and no two cover the same parameterization.
function definitionsError(defs, S, N) {
  const coveredBy = new Map();
  for (const d of defs) {
    const name = asWritten(d, S, N).name;
    if (!d.scope.length) return `${name} doesn’t cover anything.`;
    const forms = new Set(d.scope.flatMap(p => specsWithParam(p, S).map(formOfTree)));
    if (forms.size > 1) return `${name} covers things of different forms; a definition covers one form.`;
    for (const p of d.scope) {
      if (coveredBy.has(p)) return `${coveredBy.get(p)} already covers part of what ${name} covers.`;
      coveredBy.set(p, name);
    }
  }
  return null;
}

// ---- History ----
// Every change to the chart's data is recorded, newest first: when it was made, by whom, what it was in a
// sentence, and the entered records it changed, before and after, so that a record's own history can be
// told. The history belongs to the chart, so it travels with it in the workbook. Nothing takes an entry
// back: undo and redo are changes too, recorded with what they changed and `source` saying which.

const USER_KEY = 'rboreal.user';
// Who you are, as the app addresses you: your name, or You until you give it.
function currentUser() {
  try { return localStorage.getItem(USER_KEY) || 'You'; } catch { return 'You'; }
}
// Who a change is recorded under: your name, or Someone until you give it, since the history is read by
// others, for whom You would be wrong.
function authorName() {
  try { return localStorage.getItem(USER_KEY) || 'Someone'; } catch { return 'Someone'; }
}
function setCurrentUser(name) {
  try { clean(name) ? localStorage.setItem(USER_KEY, clean(name)) : localStorage.removeItem(USER_KEY); } catch {}
}

// The entered records that differ between two sets of records, each { id, before, after }, with null for
// one that wasn't there.
function changesBetween(a, b) {
  const out = [];
  for (const id of new Set([...Object.keys(a), ...Object.keys(b)]))
    if (a[id] !== b[id] && JSON.stringify(a[id] ?? null) !== JSON.stringify(b[id] ?? null))
      out.push({ id, before: a[id] ?? null, after: b[id] ?? null });
  return out;
}

// How a record reads in a sentence, in the records it belongs to: an object by its kind and name, an
// entry by its object and path, a relation by its name (in N) and the objects it relates.
function recordPhrase(recs, id, N = names) {
  const r = recs[id];
  if (!r) return 'a record';
  if (isObject(r)) return `${r.kind} “${objectName(id, recs)}”`;
  const objName = at => { let cur = at; while (recs[cur] && !isObject(recs[cur]) && !isRelation(recs[cur])) cur = recs[cur].at; return recs[cur] && isObject(recs[cur]) ? objectName(cur, recs) : recordPhrase(recs, cur, N); };
  if (isRelation(r)) {
    const t = treeOf(recs, id);
    const name = (t && N[formOfTree(t)]?.name) ?? r.args.map(a => a.edge).join(' · ');
    return `${name}: ${r.args.map(a => objName(a.at)).join(' → ')}`;
  }
  return `${objName(r.at)} › ${r.edge}`;
}
const outputPhrase = r => isObject(r) ? r.kind : isField(r) ? showValue(r.field, r.value) : isChoice(r) ? r.choice : r.tag ? 'attested' : 'ruled out';

// A change in a sentence: one record added, deleted or changed is named; several are counted, naming the
// one the rest depend on where there is one, such as an object added with its entries or a relation
// deleted with what was recorded at it. Changes to the definitions, names or required entries are named
// after. Relations are named by N.
function changeSummary(changes, before, after, extra = [], N = names) {
  const parts = [];
  if (changes.length === 1) {
    const { id, before: b, after: a } = changes[0];
    if (!b) parts.push(`Added ${recordPhrase(after, id, N)}${isField(a) ? `: ${outputPhrase(a)}` : ''}`);
    else if (!a) parts.push(`Deleted ${recordPhrase(before, id, N)}`);
    else if (outputPhrase(b) !== outputPhrase(a)) parts.push(`Changed ${recordPhrase(after, id, N)} from ${outputPhrase(b)} to ${outputPhrase(a)}`);
    else parts.push(`Changed ${recordPhrase(before, id, N)} to ${recordPhrase(after, id, N)}`);
  } else if (changes.length) {
    const added = changes.filter(c => !c.before), removed = changes.filter(c => !c.after);
    if (added.length === changes.length) {
      const root = rootOfChange(added, after);
      parts.push(root ? `Added ${recordPhrase(after, root.id, N)} with ${count(changes.length - 1, 'entry')}` : `Added ${count(changes.length, 'record')}`);
    } else if (removed.length === changes.length) {
      const root = rootOfChange(removed, before);
      parts.push(root ? `Deleted ${recordPhrase(before, root.id, N)} and ${count(changes.length - 1, 'record')} depending on it` : `Deleted ${count(changes.length, 'record')}`);
    } else parts.push(`Changed ${count(changes.length, 'record')}`);
  }
  return [...parts, ...extra].join('; ') || 'Changed the schema';
}

// The record that every other record of a change depends on, in the records they're in, if one does.
function rootOfChange(list, recs) {
  const ids = new Set(list.map(c => c.id));
  const tops = list.filter(c => !argsOf(recs[c.id]).some(a => ids.has(a.at)));
  if (tops.length !== 1) return null;
  const below = withDependents([tops[0].id], recs);
  return list.every(c => below.has(c.id)) ? tops[0] : null;
}

// Records a change to the chart's data at the head of the history. `source` says how it was made, when not
// by an edit: 'undo', 'redo', 'reset', 'import' or 'restore'.
function noteChange(summary, changes = [], source = null) {
  historyLog = [{ id: newId(), when: new Date().toISOString(), who: authorName(), summary, changes, ...(source ? { source } : {}) }, ...historyLog];
  // An edit's undo step remembers what it undoes.
  if (!source && undoStack.length) undoStack[undoStack.length - 1].summary = summary;
}

// Records the change from one snapshot to the current state, if its data changed; views aren't data.
function noteChangeSince(was, wasRecords, source, undone = null) {
  const changes = changesBetween(was.records, entered);
  const extra = definitionChanges(was.definitions, definitions, was.schema, was.names);
  if (JSON.stringify(was.names) !== JSON.stringify(names)) extra.push('Changed relation names');
  if (JSON.stringify(was.required) !== JSON.stringify(required)) extra.push('Changed the required entries');
  if (!changes.length && !extra.length) return;
  // An undo or redo names the edit it takes back or puts back, when that's known.
  const summary = undone ? `${source === 'redo' ? 'Redid' : 'Undid'} “${undone}”` : changeSummary(changes, wasRecords, records, extra);
  noteChange(summary, changes, source);
}

// What each change in the history touched: the record it changed, and everything that record is located
// at, up to the objects, in the records as they stood on either side of it. So a change to an ownership's
// Percentage touches the ownership and both its sides. By each entry's id, a set for each of its changes;
// worked out by walking back from the records as they are now, once for each state of the log.
const touchedMemo = { log: null, records: null, sets: null };
function historyTouched() {
  if (touchedMemo.log === historyLog && touchedMemo.records === records) return touchedMemo.sets;
  const then = new Map();  // records as they stood, where that differs from now (null where they weren't)
  const at = id => then.has(id) ? then.get(id) : records[id] ?? null;
  const lineage = (id, r, out, seen = new Set()) => {
    if (!r || seen.has(id)) return out;
    seen.add(id);
    out.add(id);
    for (const a of argsOf(r)) lineage(a.at, at(a.at), out, seen);
    return out;
  };
  const sets = new Map();
  for (const h of historyLog) {
    const changes = h.changes ?? [];
    const touched = changes.map(c => lineage(c.id, c.after, new Set()));
    for (const c of changes) then.set(c.id, c.before);
    changes.forEach((c, i) => lineage(c.id, c.before, touched[i]));
    sets.set(h.id, touched);
  }
  Object.assign(touchedMemo, { log: historyLog, records, sets });
  return sets;
}

// The history of a record: the entries that changed it or anything inside it, and for an object, a
// relation it's in or anything inside that, newest first, each with only those of its changes. A record
// no longer in the chart has its history too.
function historyOf(id) {
  const sets = historyTouched();
  return historyLog.map(h => ({ ...h, changes: (h.changes ?? []).filter((c, i) => sets.get(h.id)[i].has(id)) })).filter(h => h.changes.length);
}

// ---- Taking a change back ----
// A change in the history can be taken back while the records it changed are still as it left them. The
// taking back is a change of its own, which the history records in turn; nothing is rewritten.

// Records compared as data, whatever order their keys were written in.
const canonical = v => Array.isArray(v) ? `[${v.map(canonical).join()}]`
  : v && typeof v === 'object' ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join()}}` : JSON.stringify(v ?? null);
const sameRecord = (a, b) => canonical(a ?? null) === canonical(b ?? null);

// Why a history entry's change can't be taken back now, as { reason, id }, or null if it can:
// - 'changed': the record `id` it changed has changed since;
// - 'lost': what the record `id` it deleted was located at is no longer in the chart;
// - 'standing': the record `id` has since been recorded at something the change added.
function restoreBlock(entry) {
  const changes = entry.changes ?? [];
  const since = changes.find(c => !sameRecord(entered[c.id], c.after));
  if (since) return { reason: 'changed', id: since.id };
  const back = new Set(changes.filter(c => c.before).map(c => c.id));
  const gone = new Set(changes.filter(c => !c.before).map(c => c.id));
  const lost = changes.find(c => c.before && argsOf(c.before).some(a => !back.has(a.at) && (!records[a.at] || gone.has(a.at))));
  if (lost) return { reason: 'lost', id: lost.id };
  const ids = new Set(changes.map(c => c.id));
  const standing = Object.keys(entered).find(k => !ids.has(k) && argsOf(entered[k]).some(a => gone.has(a.at)));
  return standing ? { reason: 'standing', id: standing } : null;
}

// Takes a history entry's change back, through the model, as one undoable change: a deletion by restoring
// its batch from Deleted, an addition by deleting what it added (to Deleted), anything else by entering the
// records as they were. Returns why not, if it couldn't.
function restoreChange(entry) {
  if (restoreBlock(entry)) return 'It has changed since.';
  const changes = entry.changes;
  const ids = changes.map(c => c.id);
  const batch = changes.every(c => !c.after) && archive.find(b => sameRecord(Object.keys(b.records).sort(), [...ids].sort()));
  if (batch) return restoreBatch(batch.id);
  if (changes.every(c => !c.before)) {
    const roots = ids.filter(k => !argsOf(entered[k]).some(a => ids.includes(a.at)));
    return deleteRecords(roots, roots.length === 1 ? (isObject(entered[roots[0]]) ? objectName(roots[0]) : recordPhrase(records, roots[0])) : count(roots.length, 'record'));
  }
  const next = { ...entered };
  for (const c of changes) if (c.before) next[c.id] = c.before; else delete next[c.id];
  return change({ entered: next }, { source: 'restore' });
}

// ---- Changing the state ----

// The one way a chart changes, as one undoable step: its entered records, formulas, names or schema
// replaced at once (`next` gives whichever change). The formulas are worked out again, and the schema
// takes in the specifications the records now have. Options:
// - moves: for an edit made one record at a time (renaming here only, moving up a level), the abandonment
//   law applies; see moveAbandoned;
// - maps: keys already moved with the schema (renaming every one like it) carry over to what's keyed by them;
// - renames: [from, to] pairs of names to carry into the views' filters;
// - after: anything else to change in the same step, once the rest has;
// - source: how the change was made, for the history, when not by an edit (see noteChange).
// Returns why not, if the result isn't a state.
function change(next, { moves = false, maps = null, renames = [], after = null, source = null } = {}) {
  const nextEntered = next.entered ?? entered;
  const used = new Set(usage(nextEntered).keys());
  let { definitions: defs, names: nms, schema: S } = canonicalFormulas(next.definitions ?? definitions, next.names ?? names, next.schema ?? schema, used);
  if (maps) { defs = mapScopes(defs, maps); nms = mapNames(nms, maps); }
  // Definitions that don't fit the model aren't worth working out.
  const malformed = definitionsError(defs, S, nms);
  if (malformed) return malformed;
  let result = runFormulas(nextEntered, defs, nms, S);
  S = withSpecsOf(S, result.records);
  let moved = null;
  if (moves) {
    ({ schema: S, maps: moved } = moveAbandoned(S, records, result.records));
    if (moved) {
      nms = mapNames(nms, moved);
      const mapped = mapScopes(defs, moved);
      if (mapped !== defs) {
        defs = mapped;
        result = runFormulas(nextEntered, defs, nms, S);
        S = withSpecsOf(S, result.records);
      }
    }
  }
  S = settleConflicts(S, result.records, defs);
  const error = validate(result.records) ?? schemaError(S) ?? (moved ? definitionsError(defs, S, nms) : null);
  if (error) return error;
  pushUndo();
  const was = { entered, records, definitions, names, schema };
  entered = nextEntered;
  definitions = defs;
  names = nms;
  schema = S;
  setComputed(result);
  for (const m of [maps, moved]) if (m) remapPresentation(m);
  renameInFilters(renames);
  after?.();
  const changes = changesBetween(was.entered, entered);
  const extra = definitionChanges(was.definitions, definitions, was.schema, was.names);
  if (JSON.stringify(was.names) !== JSON.stringify(names)) extra.push('Changed relation names');
  if (changes.length || extra.length || was.schema !== schema) noteChange(changeSummary(changes, was.records, records, extra), changes, source);
  saveState();
  return null;
}

// The definitions added, deleted or changed, each named in a sentence: those before by the schema and
// names they had then, those after by these.
function definitionChanges(before, after, S0, N0, S1 = schema, N1 = names) {
  const name = (d, S, N) => { try { return asWritten(d, S, N).name; } catch { return 'a definition'; } };
  const out = [];
  for (const d of after) {
    const old = before.find(x => x.id === d.id);
    if (!old) out.push(`Added the definition of ${name(d, S1, N1)}`);
    else if (JSON.stringify(old) !== JSON.stringify(d)) out.push(`Changed the definition of ${name(d, S1, N1)}`);
  }
  for (const d of before) if (!after.some(x => x.id === d.id)) out.push(`Deleted the definition of ${name(d, S0, N0)}`);
  return out;
}

// Replaces the records, if the result is a state; otherwise returns why not. `next` is what `records`
// should become; its entered part is kept, and the formulas worked out again. See change for `opts`.
const commit = (next, opts = {}) => change({ entered: enteredPart(next) }, opts);

// A schema rewritten tree by tree, from the locations up, with what it says about moved keys (keyMapsOf).
// `subst` maps a specification's key to the tree that replaces it outright; `relabel(tree, original)`
// relabels a tree once its locations are rewritten. A tree that lands on a key the schema has keeps that.
function rewriteSchema(S, { subst = null, relabel = null }) {
  const memo = new Map();
  const rewrite = t => {
    const k = treeKey(t);
    if (memo.has(k)) return memo.get(k);
    let out = subst?.get(k);
    if (!out) {
      const args = t.args?.map(a => ({ edge: a.edge, loc: rewrite(a.loc) }));
      out = args && args.some((a, i) => a.loc !== t.args[i].loc) ? { ...t, args } : t;
      if (relabel) out = relabel(out, t);
    }
    memo.set(k, out);
    return out;
  };
  const next = {}, pairs = [];
  for (const [k, t] of Object.entries(S)) {
    const t1 = rewrite(t);
    const k1 = treeKey(t1);
    next[k1] ??= t1;
    if (k1 !== k) pairs.push([t, t1]);
  }
  return { schema: next, maps: pairs.length ? keyMapsOf(pairs, next) : null };
}

// Which keys moved: for each specification replaced, its key, its parameterization's and its form's, the
// last two only where the new schema has nothing left with the old one.
function keyMapsOf(pairs, S) {
  const ix = indexOf(S);
  const specs = new Map(), params = new Map(), forms = new Map();
  for (const [t0, t1] of pairs) {
    specs.set(treeKey(t0), treeKey(t1));
    const p0 = treeParam(t0), p1 = treeParam(t1);
    if (p0 !== p1 && !ix.byParam.has(p0)) params.set(p0, p1);
    const f0 = formOfTree(t0), f1 = formOfTree(t1);
    if (f0 !== f1 && !ix.byForm.has(f0)) forms.set(f0, f1);
  }
  return { specs, params, forms };
}

// The abandonment law. After an edit made one record at a time, a specification that the edited records
// left, and that no record has any more, moves with them: in the schema it's replaced by the one they have
// now, along with whatever is located at it, and what was keyed by it follows (see remapPresentation).
function moveAbandoned(S, before, after) {
  const used = usage(after);
  const subst = new Map();
  for (const id of Object.keys(after)) {
    if (!before[id]) continue;
    const t0 = treeOf(before, id), t1 = treeOf(after, id);
    if (!t0 || !t1) continue;
    const k0 = treeKey(t0);
    if (k0 !== treeKey(t1) && !used.has(k0) && S[k0]) subst.set(k0, t1);
  }
  return subst.size ? rewriteSchema(S, { subst }) : { schema: S, maps: null };
}

// What's keyed by a moved key follows it, unless something already has the new key: definitions' scopes
// and required entries by parameterization; names and every view's styles by form; entry order by
// location specification.
const mapScopes = (defs, maps) => maps.params.size
  ? defs.map(d => d.scope.some(p => maps.params.has(p)) ? { ...d, scope: [...new Set(d.scope.map(p => maps.params.get(p) ?? p))] } : d) : defs;
function mapNames(N, maps) {
  let out = N;
  for (const [f0, f1] of maps.forms) if (out[f0] && !out[f1]) { const { [f0]: n, ...rest } = out; out = { ...rest, [f1]: n }; }
  return out;
}
function remapPresentation(maps) {
  for (const [s0, s1] of maps.specs) if (order[s0] && !order[s1]) { const { [s0]: list, ...rest } = order; order = { ...rest, [s1]: list }; }
  required = [...new Set(required.map(p => maps.params.get(p) ?? p))];
  const restyle = list => [...maps.forms].reduce((acc, [f0, f1]) =>
    acc.some(s => s.form === f1) ? acc : acc.map(s => s.form === f0 ? { ...s, form: f1 } : s), list);
  views = currentViews().map(v => ({ ...v, styles: restyle(v.styles) }));
  styles = viewInUse().styles;
}

// ---- Renaming ----

// A record, or a tree, with one of its edges relabeled: an entry's label, or one of a relation's edges.
const relabelRecord = (r, from, to) => r.args ? { ...r, args: r.args.map(a => same(a.edge, from) ? { ...a, edge: to } : a) }
  : same(r.edge, from) ? { ...r, edge: to } : r;
const relabelTree = (t, from, to) => ({ ...t, args: t.args.map(a => same(a.edge, from) ? { ...a, edge: to } : a) });

// The entered records like this one, itself included: those of its form, which a rename of every one like
// it reaches. Computed ones follow their definition instead.
const likeRecords = id => { const f = formKeyOf(id); return Object.keys(entered).filter(k => formKeyOf(k) === f); };

// Renames a label on every entered record of a record's form, and on the schema's specifications of that
// form, so the vocabulary itself changes: an entry's label, or one of a relation's edges. What's keyed by
// the specifications follows, and so do the names and entry order that use the label, and, once no
// entered record has the old label, the formulas and filters that mention it. `extra` are other changes to
// records in the same step, such as the rest of an edit form. Returns why it couldn't, if it couldn't.
function renameEvery(id, from, to, extra = {}) {
  const form = formKeyOf(id);
  const { schema: S, maps } = rewriteSchema(schema, { relabel: (t, orig) => formOfTree(orig) === form ? relabelTree(t, from, to) : t });
  const next = { ...entered };
  for (const k of likeRecords(id)) next[k] = relabelRecord(entered[k], from, to);
  for (const [k, r] of Object.entries(extra)) next[k] = r;
  const gone = !Object.values(next).some(r => (!r.args && same(r.edge, from)) || r.args?.some(a => same(a.edge, from)));
  const defs = gone ? renamedInFormulas(definitions, from, to) : definitions;
  const swap = e => same(e, from) ? to : e;
  const swapKeys = o => Object.fromEntries(Object.entries(o ?? {}).map(([k, v]) => [same(k, from) ? norm(to) : k, v]));
  const nms = names[form] ? { ...names, [form]: { ...names[form], edges: names[form].edges.map(swap),
    lists: Object.fromEntries(Object.entries(swapKeys(names[form].lists)).map(([k, v]) => [k, swapKeys(v)])) } } : names;
  const newForm = maps?.forms.get(form) ?? form;
  const locs = new Set(specsOfForm(newForm, S).filter(t => t.args.length === 1).map(t => treeKey(t.args[0].loc)));
  const relabelOrder = () => {
    order = Object.fromEntries(Object.entries(order).map(([k, list]) => [k, locs.has(k) ? list.map(l => l === norm(from) ? norm(to) : l) : list]));
  };
  return change({ entered: next, schema: S, definitions: defs, names: nms }, { maps: maps ?? undefined, renames: gone ? [[from, to]] : [], after: relabelOrder });
}

// Relabels a relation's edge, here only or on every relation like it (renameEvery).
const renameEdge = (id, from, to, every) => every ? renameEvery(id, from, to)
  : commit({ ...records, [id]: relabelRecord(records[id], from, to) }, { moves: true });

// ---- Arranging and editing entries ----

// Moves an entry to just before or after a sibling. Every location with the same specification follows suit.
function moveEntry(id, targetId, after) {
  const at = records[id].at;
  const key = specKey(records, at);
  // Every label used at locations like this one, as currently shown, so labels this record lacks keep their places.
  const list = [...new Set(schemaAt(at).sort(orderedBy(order[key] ?? [])).map(p => norm(p.label)))];
  const moved = norm(records[id].edge);
  list.splice(list.indexOf(moved), 1);
  const to = isObjectName(targetId) ? 0 : list.indexOf(norm(records[targetId].edge)) + (after ? 1 : 0);
  list.splice(to, 0, moved);
  pushUndo();
  order = { ...order, [key]: list };
  saveState();
}

// A renamed entry keeps its place: its new label goes right after its old one in the shared order,
// which stays put for the other locations that still use it.
function keepPlace(at, oldLabel, newLabel) {
  const key = specKey(records, at);
  const list = order[key];
  if (!list || list.includes(norm(newLabel)) || !list.includes(norm(oldLabel))) return;
  const next = [...list];
  next.splice(next.indexOf(norm(oldLabel)) + 1, 0, norm(newLabel));
  order = { ...order, [key]: next };
  saveState();
}

// Saves a field's value typed in place. Its datatype is the one the schema has for its parameterization,
// or else a guess from what's typed. Returns why it couldn't be saved, if it couldn't. A value left as it
// was isn't a change, so a computed one isn't overridden by it.
function saveFieldValue(id, raw, label = recordLabel(id)) {
  const r = records[id];
  // The datatype others like it have; or, if this record alone has its field, its own datatype while what's
  // typed reads as one (800000000 stays money), and otherwise whatever what's typed looks like.
  const datatype = specsWithParam(parameterization(records, id)).find(t => 'field' in t.out && !onlyHas(t, id))?.out.field
    ?? (isObjectName(id) ? 'text' : parseValue(r.field, raw) !== undefined ? r.field : classify(clean(raw)));
  const value = parseValue(datatype, raw);
  if (value === undefined) return clean(raw) ? `${label} takes ${asPhrase(datatype)} here.` : `${label} can’t be empty.`;
  if (datatype === r.field && value === r.value) return null;
  return commit({ ...records, [id]: { ...r, field: datatype, value } });
}
// Whether a specification is had by this record alone, so that changing the record may change it.
const onlyHas = (t, id) => { const users = usage().get(treeKey(t)) ?? []; return users.length === 1 && users[0] === id; };

// Adds a field typed in place at a location, such as a Percentage at a new ownership. Its datatype is the
// schema's for its label there, or else `datatype`, or else a guess from the value. Nothing typed adds
// nothing. Returns why it couldn't be added, if it couldn't.
function addFieldValue(at, label, raw, datatype) {
  if (!clean(raw)) return null;
  const type = fieldDatatype(at, label) ?? datatype ?? classify(clean(raw));
  const value = parseValue(type, raw);
  if (value === undefined) return `${label} takes ${asPhrase(type)} here.`;
  return commit({ ...records, [newId()]: { at, edge: label, field: type, value } });
}

// Creates an object of a kind with its Name, returning its id, or a message saying why it couldn't.
// A new kind gets the preset styles in the same step, so one undo takes both back.
function createObject(kind, name, place) {
  const id = newId();
  const error = commit({ ...records, [id]: { kind }, [newId()]: { at: id, edge: 'Name', field: 'text', value: clean(name) } });
  if (error) return { error };
  ensureKindStyles(kind);
  if (place) layout = { ...layout, [id]: place };
  saveState();
  return { id };
}

// Moves an entry up a level, from its location to that location's own location. Its dependents follow,
// since they're located at it, and so, by the abandonment law, does its specification if nothing else
// has it. Returns why it couldn't, if it couldn't.
function moveUp(id) {
  const r = records[id];
  const loc = records[r.at];
  if (!loc || isObject(loc) || isRelation(loc)) return `${r.edge} is already at the top level.`;
  return commit({ ...records, [id]: { ...r, at: loc.at } }, { moves: true });
}

// ---- Required entries ----
// `required` lists the parameterizations every location like theirs should have an entry for.

// The parameterization an entry labeled `label` would have at a location.
const paramAt = (label, at) => JSON.stringify([JSON.stringify([norm(label), specKey(records, at)])]);
const isRequired = param => required.includes(param);

// A required parameterization as the panel shows it blank: its label, type and datatype, from the schema.
function requiredInfo(param) {
  const t = specsWithParam(param)[0];
  return t ? { label: t.args[0].edge, type: typeOfTree(t), datatype: t.out.field } : null;
}

// Requires a parameterization at every location like its own, or stops requiring it, as one undoable step.
// Only an entry's parameterization, with one location, can be required.
function setRequired(param, on) {
  if (isRequired(param) === on || (on && paramArgs(param).length !== 1)) return;
  pushUndo();
  required = on ? [...required, param] : required.filter(x => x !== param);
  const t = specsWithParam(param)[0];
  const label = t ? `${t.args[0].edge} at ${placeText(t.args[0].loc)}` : 'an entry';
  noteChange(on ? `Required ${label}` : `Stopped requiring ${label}`);
  saveState();
}
const toggleRequired = id => { const p = parameterization(records, id); setRequired(p, !isRequired(p)); };
const stopRequiring = param => setRequired(param, false);

// The required entries a location has no entry for, as [param, { label, type, datatype }] pairs.
// A tag counts as recorded whether it's attested or ruled out.
function missingAt(at) {
  if (!records[at] || isField(records[at])) return [];
  const loc = specKey(records, at);
  return required.filter(p => paramArgs(p).length === 1 && paramArgs(p)[0].key === loc && requiredInfo(p)
    && !entriesOf(at).some(e => parameterization(records, e) === p)).map(p => [p, requiredInfo(p)]);
}

// The required entries missing anywhere in an object, or below a location, and at the relations it's in
// (a position's Start Date is the person's to give, and the company's): each with where it's missing.
function missingUnder(id) {
  const out = [], seen = new Set();
  const walk = at => {
    if (seen.has(at)) return;
    seen.add(at);
    for (const [param, req] of missingAt(at)) out.push({ at, param, ...req });
    for (const e of entriesOf(at)) if (!isField(records[e])) walk(e);
    for (const r of relationsAt(at)) walk(r);
  };
  if (records[id]) walk(id);
  return out;
}

// ---- Deleting and restoring ----

// A set of records with everything that depends on them: every entry located at one of them, at any
// depth, and every relation one of them is an argument of, with whatever depends on those in turn.
function withDependents(ids, recs = records) {
  const all = new Set(ids);
  for (let grew = true; grew;) {
    grew = false;
    for (const [k, r] of Object.entries(recs))
      if (!all.has(k) && argsOf(r).some(a => all.has(a.at))) { all.add(k); grew = true; }
  }
  return all;
}

// Deleting hides rather than destroys: the records and their dependents go into the archive as a batch,
// labeled with what was deleted, and can be restored from there. Returns why it couldn't, if it couldn't.
// Only entered records are archived: computed ones go with what they were computed from, and come back
// with it. The schema keeps their specifications, and every view keeps their box positions, so a restored
// record returns as it was.
function deleteRecords(ids, label) {
  const gone = withDependents(ids);
  const kept = Object.fromEntries([...gone].filter(k => entered[k]).map(k => [k, entered[k]]));
  const nextEntered = Object.fromEntries(Object.entries(entered).filter(([k]) => !gone.has(k)));
  return change({ entered: nextEntered }, { after: () => { archive = [{ id: newId(), label, when: Date.now(), records: kept }, ...archive]; } });
}

// Puts a deleted batch back. Something it depends on may have been deleted since, in which case that
// needs restoring first.
function restoreBatch(batchId) {
  const batch = archive.find(b => b.id === batchId);
  const there = { ...records, ...batch.records };
  const missing = Object.values(batch.records).flatMap(argsOf).map(a => a.at).find(at => !there[at]);
  if (missing) {
    const other = archive.find(b => b.records[missing]);
    return other ? `Restore ${other.label} first; this depends on it.` : 'Something this depends on no longer exists.';
  }
  const error = change({ entered: { ...entered, ...batch.records } }, { after: () => { archive = archive.filter(b => b !== batch); } });
  return error ? `Can’t restore it: ${error}` : null;
}

// ---- Removing from the schema ----

// The specifications nothing has: no record, no specification located at them, no formula's scope, no
// required entry. They can be removed from the schema, as the panel's Schema view offers.
function unusedSpecs() {
  const used = new Set(usage().keys());
  for (const k of [...used]) for (const loc of locationsBelow(schema[k])) used.add(treeKey(loc));
  for (const t of Object.values(schema)) for (const loc of locationsBelow(t)) used.add(treeKey(loc));
  const covered = new Set([...definitions.flatMap(d => d.scope), ...required]);
  return Object.keys(schema).filter(k => !used.has(k) && !covered.has(treeParam(schema[k])));
}

// Removes unused specifications from the schema, as one undoable step.
function removeSpecs(keys) {
  const gone = new Set(keys.filter(k => unusedSpecs().includes(k)));
  if (!gone.size) return null;
  return change({ schema: Object.fromEntries(Object.entries(schema).filter(([k]) => !gone.has(k))) });
}

// ---- Chart helpers ----

// What a view hides one by one, beyond what its styles hide: boxes and lines, by record id. It's kept on
// the view itself, so it goes with the view's copies and its undo history.
const hiddenInView = () => viewInUse().hidden ?? [];

function setHiddenInView(ids) {
  pushUndo();
  views = currentViews().map(v => v.id === viewId ? { ...v, hidden: [...new Set(ids)] } : v);
  saveState();
}

// A copy of a view, everything in it included, placed just after it and made current.
function duplicateView(id, name) {
  pushUndo();
  const list = currentViews();
  const i = list.findIndex(v => v.id === id);
  const copy = { ...structuredClone(list[i]), id: newId(), name };
  list.splice(i + 1, 0, copy);
  views = list;
  viewId = copy.id;
  ({ styles, layout } = copy);
  saveState();
  return copy.id;
}

// A view name not taken yet: the name itself, or with a number after it.
function freeViewName(base) {
  const taken = new Set(views.map(v => norm(v.name)));
  if (!taken.has(norm(base))) return base;
  for (let n = 2; ; n++) if (!taken.has(norm(`${base} ${n}`))) return `${base} ${n}`;
}

// Commits records and the formulas together, as one undoable step: for a formula typed into a value box,
// which replaces that value with the formula's output. `next` is what `records` should become, as for
// commit(). `renames` are [from, to] pairs to carry into the views' filters too.
const commitWithFormulas = (next, nextDefinitions, nextNames = names, renames = []) =>
  change({ entered: enteredPart(next), definitions: nextDefinitions, names: nextNames }, { renames });

// ---- View filters ----

// What a view shows besides its styles and the things hidden one by one: a filter, a condition worked out
// at each object, which shows the boxes it holds for. It's kept on the view, like its hidden list, so its
// copies and undo take it along.
const viewFilter = () => viewInUse().filter ?? '';

function setViewFilter(text) {
  pushUndo();
  views = currentViews().map(v => v.id === viewId ? { ...v, filter: String(text ?? '').trim() } : v);
  saveState();
}
