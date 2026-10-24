// The state: records in the tree data model (see data-model.md), plus the presentation that goes with them
// (entry order, chart styles and box positions), with undo and redo over all of it.

// Sample state, path case only: every non-object record has exactly one location.
// `at` is the id of that location and `edge` labels the edge to it.
// The root is one of: an object (kind), a field (datatype + value), a choice (text) or a tag (Boolean).
// Labels, choices and kinds are matched without regard to case, but shown as written.
const SAMPLE = {
  fund:            { kind: 'Entity' },
  fund_name:       { at: 'fund', edge: 'Name', field: 'text', value: 'Calder Ridge Capital Partners III, L.P.' },
  fund_formed:     { at: 'fund', edge: 'Formation Date', field: 'date', value: '2023-02-14' },
  fund_ein:        { at: 'fund', edge: 'EIN', field: 'text', value: '92-4810337' },
  fund_fye:        { at: 'fund', edge: 'Fiscal Year End', field: 'text', value: 'December 31' },
  fund_target:     { at: 'fund', edge: 'Target Commitments', field: 'number', value: '$750,000,000' },
  fund_good:       { at: 'fund', edge: 'Good Standing', tag: true },
  fund_erisa:      { at: 'fund', edge: 'ERISA Plan Assets', tag: false },
  fund_vehicle:    { at: 'fund', edge: 'Vehicle Type', choice: 'Main Fund' },
  fund_juris:      { at: 'fund', edge: 'Jurisdiction', choice: 'Delaware' },
  fund_file:       { at: 'fund_juris', edge: 'File Number', field: 'text', value: '7351234' },
  fund_agent:      { at: 'fund_juris', edge: 'Registered Agent', field: 'text', value: 'The Corporation Trust Company' },
  fund_type:       { at: 'fund', edge: 'Entity Type', choice: 'Limited Partnership' },
  fund_tax:        { at: 'fund_type', edge: 'Tax Classification', choice: 'Partnership' },

  feeder:          { kind: 'Entity' },
  feeder_name:     { at: 'feeder', edge: 'Name', field: 'text', value: 'Calder Ridge Capital Partners III (Cayman), L.P.' },
  feeder_formed:   { at: 'feeder', edge: 'Formation Date', field: 'date', value: '2023-03-01' },
  feeder_good:     { at: 'feeder', edge: 'Good Standing', tag: true },
  feeder_vehicle:  { at: 'feeder', edge: 'Vehicle Type', choice: 'Feeder Fund' },
  feeder_juris:    { at: 'feeder', edge: 'Jurisdiction', choice: 'Cayman Islands' },
  feeder_reg:      { at: 'feeder_juris', edge: 'Registration Number', field: 'text', value: 'OG-104582' },
  feeder_office:   { at: 'feeder_juris', edge: 'Registered Office', field: 'text', value: 'PO Box 1200, George Town, Grand Cayman KY1-1102' },
  feeder_type:     { at: 'feeder', edge: 'Entity Type', choice: 'Exempted Limited Partnership' },

  gp:              { kind: 'Entity' },
  gp_name:         { at: 'gp', edge: 'Name', field: 'text', value: 'Calder Ridge Capital GP III, LLC' },
  gp_formed:       { at: 'gp', edge: 'Formation Date', field: 'date', value: '2023-02-10' },
  gp_ein:          { at: 'gp', edge: 'EIN', field: 'text', value: '92-4810115' },
  gp_good:         { at: 'gp', edge: 'Good Standing', tag: true },
  gp_vehicle:      { at: 'gp', edge: 'Vehicle Type', choice: 'General Partner' },
  gp_juris:        { at: 'gp', edge: 'Jurisdiction', choice: 'Delaware' },
  gp_file:         { at: 'gp_juris', edge: 'File Number', field: 'text', value: '7349876' },
  gp_agent:        { at: 'gp_juris', edge: 'Registered Agent', field: 'text', value: 'The Corporation Trust Company' },
  gp_type:         { at: 'gp', edge: 'Entity Type', choice: 'Limited Liability Company' },
  gp_tax:          { at: 'gp_type', edge: 'Tax Classification', choice: 'Partnership' },

  mgmt:            { kind: 'Entity' },
  mgmt_name:       { at: 'mgmt', edge: 'Name', field: 'text', value: 'Calder Ridge Capital Management, LLC' },
  mgmt_formed:     { at: 'mgmt', edge: 'Formation Date', field: 'date', value: '2018-06-05' },
  mgmt_ein:        { at: 'mgmt', edge: 'EIN', field: 'text', value: '83-0915524' },
  mgmt_good:       { at: 'mgmt', edge: 'Good Standing', tag: true },
  mgmt_ria:        { at: 'mgmt', edge: 'Registered Investment Adviser', tag: true },
  mgmt_sec:        { at: 'mgmt_ria', edge: 'SEC File Number', field: 'text', value: '801-123456' },
  mgmt_crd:        { at: 'mgmt_ria', edge: 'CRD Number', field: 'text', value: '312345' },
  mgmt_vehicle:    { at: 'mgmt', edge: 'Vehicle Type', choice: 'Management Company' },
  mgmt_juris:      { at: 'mgmt', edge: 'Jurisdiction', choice: 'Delaware' },
  mgmt_file:       { at: 'mgmt_juris', edge: 'File Number', field: 'text', value: '6894512' },
  mgmt_type:       { at: 'mgmt', edge: 'Entity Type', choice: 'Limited Liability Company' },
  mgmt_managed:    { at: 'mgmt_type', edge: 'Manager-Managed', tag: true },
  mgmt_tax:        { at: 'mgmt_type', edge: 'Tax Classification', choice: 'Partnership' },

  blocker:         { kind: 'Entity' },
  blocker_name:    { at: 'blocker', edge: 'Name', field: 'text', value: 'Calder Ridge III Blocker, Inc.' },
  blocker_formed:  { at: 'blocker', edge: 'Formation Date', field: 'date', value: '2023-05-22' },
  blocker_good:    { at: 'blocker', edge: 'Good Standing', tag: false },
  blocker_vehicle: { at: 'blocker', edge: 'Vehicle Type', choice: 'Blocker' },
  blocker_juris:   { at: 'blocker', edge: 'Jurisdiction', choice: 'Delaware' },
  blocker_file:    { at: 'blocker_juris', edge: 'File Number', field: 'text', value: '7412203' },
  blocker_type:    { at: 'blocker', edge: 'Entity Type', choice: 'Corporation' },
  blocker_shares:  { at: 'blocker_type', edge: 'Authorized Shares', field: 'number', value: '1,000' },
  blocker_tax:     { at: 'blocker_type', edge: 'Tax Classification', choice: 'C Corporation' },

  northpine:       { kind: 'Entity' },
  northpine_name:  { at: 'northpine', edge: 'Name', field: 'text', value: 'Northpine Software, LLC' },
  northpine_vehicle: { at: 'northpine', edge: 'Vehicle Type', choice: 'Portfolio Company' },
  northpine_juris: { at: 'northpine', edge: 'Jurisdiction', choice: 'Delaware' },
  northpine_type:  { at: 'northpine', edge: 'Entity Type', choice: 'Limited Liability Company' },

  halvard:         { kind: 'Entity' },
  halvard_name:    { at: 'halvard', edge: 'Name', field: 'text', value: 'Halvard Logistics Holdings, Inc.' },
  halvard_vehicle: { at: 'halvard', edge: 'Vehicle Type', choice: 'Portfolio Company' },
  halvard_juris:   { at: 'halvard', edge: 'Jurisdiction', choice: 'Delaware' },
  halvard_type:    { at: 'halvard', edge: 'Entity Type', choice: 'Corporation' },

  chen:            { kind: 'Individual' },
  chen_name:       { at: 'chen', edge: 'Name', field: 'text', value: 'Margaret A. Chen' },
  chen_email:      { at: 'chen', edge: 'Email', field: 'text', value: 'mchen@example.com' },
  chen_us:         { at: 'chen', edge: 'U.S. Person', tag: true },

  okafor:          { kind: 'Individual' },
  okafor_name:     { at: 'okafor', edge: 'Name', field: 'text', value: 'David R. Okafor' },
  okafor_email:    { at: 'okafor', edge: 'Email', field: 'text', value: 'dokafor@example.com' },
  okafor_us:       { at: 'okafor', edge: 'U.S. Person', tag: true },

  // A kind a user added for the chart, which starts out with the preset style.
  inv_us:          { kind: 'Investor Group' },
  inv_us_name:     { at: 'inv_us', edge: 'Name', field: 'text', value: 'U.S. Investors' },
  inv_nonus:       { kind: 'Investor Group' },
  inv_nonus_name:  { at: 'inv_nonus', edge: 'Name', field: 'text', value: 'Non-U.S. and U.S. Tax-Exempt Investors' },

  // Relations: entries with more than one location. Each argument is an edge label and a location id,
  // listed in a fixed order that the panels follow when they lay arguments out side by side, and that
  // the chart follows when it draws a line from the first argument to the second.

  // A tag relating a GP to the fund it manages. The fund's side sits at its Entity Type, not at the entity.
  gp_of_fund:      { args: [{ edge: 'GP', at: 'gp' }, { edge: 'Fund Owned', at: 'fund_type' }], tag: true },
  gp_of_feeder:    { args: [{ edge: 'GP', at: 'gp' }, { edge: 'Fund Owned', at: 'feeder_type' }], tag: true },
  gp_admitted:     { at: 'gp_of_fund', edge: 'Admission Date', field: 'date', value: '2023-02-14' },

  // Ownership percentages: a number field relating owner and holding.
  own_us_fund:     { args: [{ edge: 'Owner', at: 'inv_us' }, { edge: 'Holding', at: 'fund' }], field: 'number', value: '71.6%' },
  own_nonus_fdr:   { args: [{ edge: 'Owner', at: 'inv_nonus' }, { edge: 'Holding', at: 'feeder' }], field: 'number', value: '100%' },
  own_fund_blkr:   { args: [{ edge: 'Owner', at: 'fund' }, { edge: 'Holding', at: 'blocker' }], field: 'number', value: '100%' },
  own_fund_npine:  { args: [{ edge: 'Owner', at: 'fund' }, { edge: 'Holding', at: 'northpine' }], field: 'number', value: '64%' },
  own_blkr_hlvd:   { args: [{ edge: 'Owner', at: 'blocker' }, { edge: 'Holding', at: 'halvard' }], field: 'number', value: '82%' },
  own_fdr_fund:    { args: [{ edge: 'Owner', at: 'feeder' }, { edge: 'Holding', at: 'fund' }], field: 'number', value: '28.4%' },
  own_chen_mgmt:   { args: [{ edge: 'Owner', at: 'chen' }, { edge: 'Holding', at: 'mgmt' }], field: 'number', value: '60%' },
  own_okfr_mgmt:   { args: [{ edge: 'Owner', at: 'okafor' }, { edge: 'Holding', at: 'mgmt' }], field: 'number', value: '40%' },
  own_chen_gp:     { args: [{ edge: 'Owner', at: 'chen' }, { edge: 'Holding', at: 'gp' }], field: 'number', value: '50%' },
  own_okfr_gp:     { args: [{ edge: 'Owner', at: 'okafor' }, { edge: 'Holding', at: 'gp' }], field: 'number', value: '50%' },

  // LLC membership: a choice relating a member to an LLC, by way of its Entity Type.
  mem_chen_gp:     { args: [{ edge: 'Member', at: 'chen' }, { edge: 'LLC', at: 'gp_type' }], choice: 'Managing Member' },
  mem_okfr_gp:     { args: [{ edge: 'Member', at: 'okafor' }, { edge: 'LLC', at: 'gp_type' }], choice: 'Member' },
  mem_chen_mgmt:   { args: [{ edge: 'Member', at: 'chen' }, { edge: 'LLC', at: 'mgmt_type' }], choice: 'Managing Member' },
  mem_okfr_mgmt:   { args: [{ edge: 'Member', at: 'okafor' }, { edge: 'LLC', at: 'mgmt_type' }], choice: 'Member' },

  // Signing authority, with three arguments: who signs, through which entity, for which entity.
  // Signing for the management company directly makes "Via" and "On Behalf Of" the same location.
  sign_chen_fund:  { args: [{ edge: 'Signatory', at: 'chen' }, { edge: 'Via', at: 'gp' }, { edge: 'On Behalf Of', at: 'fund' }], tag: true },
  sign_okfr_fund:  { args: [{ edge: 'Signatory', at: 'okafor' }, { edge: 'Via', at: 'gp' }, { edge: 'On Behalf Of', at: 'fund' }], tag: true },
  sign_chen_fdr:   { args: [{ edge: 'Signatory', at: 'chen' }, { edge: 'Via', at: 'gp' }, { edge: 'On Behalf Of', at: 'feeder' }], tag: true },
  sign_chen_mgmt:  { args: [{ edge: 'Signatory', at: 'chen' }, { edge: 'Via', at: 'mgmt' }, { edge: 'On Behalf Of', at: 'mgmt' }], tag: true },
  sign_okfr_mgmt:  { args: [{ edge: 'Signatory', at: 'okafor' }, { edge: 'Via', at: 'mgmt' }, { edge: 'On Behalf Of', at: 'mgmt' }], tag: false },
};

// Where each object's box sits on the chart: its top-left corner and width. Height follows from its text.
const SAMPLE_LAYOUT = {
  inv_nonus: { x: 40, y: 40, w: 200 },
  inv_us:    { x: 345, y: 40, w: 200 },
  feeder:    { x: 25, y: 150, w: 230 },
  chen:      { x: 650, y: 150, w: 170 },
  okafor:    { x: 870, y: 150, w: 170 },
  fund:      { x: 330, y: 330, w: 230 },
  gp:        { x: 640, y: 350, w: 200 },
  mgmt:      { x: 860, y: 350, w: 200 },
  blocker:   { x: 240, y: 545, w: 200 },
  northpine: { x: 520, y: 545, w: 200 },
  halvard:   { x: 240, y: 690, w: 200 },
};

const STORAGE_KEY = 'rboreal.state.v6';

// The state is the records plus what goes with them:
// - order: the order entries are shown in, kept per location specification (see specKey), so that, say,
//   every Entity lists its entries in the same order, the way a spreadsheet's rows share its columns;
// - styles: the chart's styles (see styles.js), and layout: its box positions;
// - required: the entries every location like theirs should have, by parameterization, each with its
//   label and type so a blank one can be shown and filled in;
// - archive: deleted records, kept in batches so each can be restored with its dependents.
// The order, styles and layout are presentation; the data model's trees are unordered and unstyled.
let records, order, styles, layout, required, archive;
const undoStack = [];
const redoStack = [];

function setState(s) {
  ({ records, order = {}, styles = null, layout = {}, required = {}, archive = [] } = s);
  if (!styles) styles = defaultStyles(records);
}

// Called once every script has loaded, since sample styles come from styles.js.
function initState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.records) return setState(saved);
  } catch {}
  setState(sampleState());
}

// The sample requires a Formation Date on every Entity, which two portfolio companies lack.
function sampleState() {
  const recs = structuredClone(SAMPLE);
  return {
    records: recs, order: {}, styles: defaultStyles(recs), layout: structuredClone(SAMPLE_LAYOUT), archive: [],
    required: { [parameterization(recs, 'fund_formed')]: { label: 'Formation Date', type: 'field', datatype: 'date' } },
  };
}

// States are never mutated in place, so earlier ones can be kept for undo.
const snapshot = () => ({ records, order, styles, layout, required, archive });

function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot())); } catch {}
}

function pushUndo() {
  undoStack.push(snapshot());
  redoStack.length = 0;
}
function undoState() {
  if (!undoStack.length) return false;
  redoStack.push(snapshot());
  setState(undoStack.pop());
  saveState();
  return true;
}
function redoState() {
  if (!redoStack.length) return false;
  undoStack.push(snapshot());
  setState(redoStack.pop());
  saveState();
  return true;
}
function resetState() {
  pushUndo();
  setState(sampleState());
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
const labelOf = r => isRelation(r) ? relationLabel(r) : r.edge;

const TYPE_NAMES = { field: 'Field', tag: 'Tag', choice: 'Choice' };
const DATATYPE_NAMES = { text: 'Text', number: 'Number', date: 'Date' };

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
  else if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) [, mo, d, y] = m;
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

// Amounts like 1,000, $750,000,000 or 12.5%. A leading zero (0803456789) marks an identifier, which stays text.
const NUMBER = /^[-+]?\$?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?%?$/;
const isNumber = s => NUMBER.test(s) && !/^[-+]?\$?0\d/.test(s);

const classify = s => parseDate(s) ? 'date' : isNumber(s) ? 'number' : 'text';
const asPhrase = datatype => datatype === 'text' ? 'text' : `a ${datatype}`;

// Dates are stored as ISO strings. Numbers and text keep the form they were typed in,
// so an identifier that happens to be all digits still shows as typed.
function parseValue(datatype, raw) {
  const s = clean(raw);
  if (!s) return undefined;
  if (datatype === 'date') return parseDate(s) ?? undefined;
  if (datatype === 'number') return isNumber(s) ? s : undefined;
  return s;
}
const displayValue = r => r.field === 'date' ? formatDate(r.value) : r.value;

// ---- Reading the state ----

const isObjectName = (id, recs = records) => isField(recs[id]) && same(recs[id].edge, 'name') && isObject(recs[recs[id].at]);

// Compares { type, label } items: labels in the order they've been dragged into come first, in that order;
// the rest follow as fields, tags, then choices, alphabetical within each.
const TYPE_RANK = { field: 0, tag: 1, choice: 2 };
function orderedBy(placed) {
  const rank = label => { const i = placed.indexOf(norm(label)); return i < 0 ? Infinity : i; };
  return (a, b) => rank(a.label) - rank(b.label) || TYPE_RANK[a.type] - TYPE_RANK[b.type] || byLabel(a.label, b.label);
}

// Name first, then the order shared by locations with the same specification.
function entriesOf(id, recs = records) {
  const ids = Object.keys(recs).filter(k => recs[k].at === id);
  if (ids.length < 2) return ids;
  const compare = orderedBy(order[specKey(recs, id)] ?? []);
  const item = k => ({ type: typeOf(recs[k]), label: recs[k].edge });
  return ids.sort((a, b) => isObjectName(b, recs) - isObjectName(a, recs) || compare(item(a), item(b)));
}

function objectName(id, recs = records) {
  const nameId = entriesOf(id, recs).find(k => isObjectName(k, recs));
  return nameId ? recs[nameId].value : `${recs[id].kind} ${id}`;
}
const nameRecordOf = id => entriesOf(id).find(k => isObjectName(k));

const objectsOfKind = kind => Object.keys(records)
  .filter(k => isObject(records[k]) && same(records[k].kind, kind))
  .sort((a, b) => byLabel(objectName(a), objectName(b)));

// The kinds in the state, each as first written.
const kindsInState = () => [...new Map(Object.values(records).filter(isObject).map(r => [norm(r.kind), r.kind])).values()].sort(byLabel);

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

// Relations with an argument at `id`.
const relationsAt = (id, recs = records) =>
  Object.keys(recs).filter(k => isRelation(recs[k]) && recs[k].args.some(a => a.at === id));
const hasEntries = id => entriesOf(id).length > 0 || relationsAt(id).length > 0;

// Every record whose path starts at the object, the object included.
const recordsUnder = obj => Object.keys(records).filter(k => !isRelation(records[k]) && objectOf(k) === obj);

// How a record reads as one segment of a path.
function segmentText(id) {
  const r = records[id];
  if (isObject(r)) return objectName(id);
  if (isRelation(r)) return relationLabel(r);
  if (isTag(r)) return `${r.tag ? '' : 'Not '}${r.edge}`;
  return isChoice(r) ? `${r.edge}: ${r.choice}` : r.edge;
}

// The options a choice's parameterization has across the state, for its dropdown.
function outputsOf(id) {
  const p = parameterization(records, id);
  const outputs = [];
  for (const [k, r] of Object.entries(records))
    if (isChoice(r) && parameterization(records, k) === p && !outputs.some(o => same(o, r.choice))) outputs.push(r.choice);
  return outputs.sort(byLabel);
}

// The relations at a location, grouped into the rows that show them there: one per output type and
// split of the relation's edges into this location's own and the others'. A row is labeled with the
// other edges, in the order the relation lists its arguments.
function relationGroups(at) {
  const groups = new Map();
  for (const id of relationsAt(at)) {
    const r = records[id];
    const own = r.args.filter(a => a.at === at).map(a => a.edge);
    const others = r.args.filter(a => a.at !== at).map(a => a.edge);
    const key = JSON.stringify([typeOf(r), own.map(norm).sort(), others.map(norm).sort()]);
    if (!groups.has(key)) groups.set(key, { key, type: typeOf(r), own, others, ids: [] });
    groups.get(key).ids.push(id);
  }
  return [...groups.values()].sort((a, b) => byLabel(a.others.join(' '), b.others.join(' ')));
}

// The two-argument relations that a location like `at` could take part in, from those already in the state:
// one per output type and pair of edges, with every specification seen on the other side.
function relationTypesAt(at) {
  const spec = specKey(records, at);
  const types = new Map();
  for (const r of Object.values(records)) {
    if (!isRelation(r) || r.args.length !== 2) continue;
    r.args.forEach((own, i) => {
      if (specKey(records, own.at) !== spec) return;
      const other = r.args[1 - i];
      const key = JSON.stringify([typeOf(r), [norm(own.edge)], [norm(other.edge)]]);
      if (!types.has(key)) types.set(key, { key, type: typeOf(r), own: own.edge, other: other.edge, ownFirst: i === 0, otherSpecs: new Set(), datatype: r.field, outputs: [] });
      const t = types.get(key);
      t.otherSpecs.add(specKey(records, other.at));
      if (isChoice(r) && !t.outputs.some(o => same(o, r.choice))) t.outputs.push(r.choice);
    });
  }
  return [...types.values()].sort((a, b) => byLabel(a.other, b.other));
}

// The parameterizations the records imply for entries of locations like `at` (same underlying specification),
// one per type and label, with each field's datatype and each choice's outputs.
function schemaAt(at, exceptId) {
  const key = specKey(records, at);
  const params = new Map();
  for (const [id, r] of Object.entries(records)) {
    if (!r.at || id === exceptId || specKey(records, r.at) !== key) continue;
    const k = `${typeOf(r)}:${norm(r.edge)}`;
    if (!params.has(k)) params.set(k, { type: typeOf(r), label: r.edge, datatype: r.field, outputs: [] });
    const p = params.get(k);
    if (isChoice(r) && !p.outputs.some(o => same(o, r.choice))) p.outputs.push(r.choice);
  }
  return [...params.values()];
}

// The datatype other fields with this label already have at locations like `at`, if any.
const fieldDatatype = (at, label, exceptId) =>
  schemaAt(at, exceptId).find(p => p.type === 'field' && same(p.label, label))?.datatype;

// Returns a message for the first way `recs` fails to be a state, or null if it is one.
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
  // Schema conditions on the specifications the records imply.
  const byParameterization = new Map();
  for (const id of Object.keys(recs)) {
    if (isObject(recs[id])) continue;
    const p = parameterization(recs, id);
    if (!byParameterization.has(p)) byParameterization.set(p, []);
    byParameterization.get(p).push(recs[id]);
  }
  for (const rs of byParameterization.values()) {
    const edge = labelOf(rs[0]);
    const datatypes = [...new Set(rs.filter(isField).map(r => r.field))];
    if (datatypes.length > 1)
      return `${edge} can’t be both a ${datatypes[0]} field and a ${datatypes[1]} field.`;
    if (rs.some(isChoice) && rs.some(r => isTag(r) || isField(r)))
      return `${edge} can’t be both a choice and a ${rs.some(isTag) ? 'tag' : 'field'}.`;
    if (rs.some(isTag) && rs.some(isField))
      return `${edge} can’t be both a tag and a field.`;
  }
  return null;
}

// ---- Changing the state ----

// Replaces the records, if the result is a state; otherwise returns why not.
function commit(next) {
  const error = validate(next);
  if (error) return error;
  pushUndo();
  const before = records;
  records = next;
  rekey(before, next);
  saveState();
  return null;
}

// What's keyed by specification follows the records it was keyed by. When an edit changes records'
// specifications (an edge relabeled, or an entry moved up a level, which changes its dependents' too),
// each key that no record has any more moves to the key those records have now, unless that one is taken:
// entry order by location specification, and styles and required entries by parameterization.
function rekey(before, after) {
  const specs = new Map(), params = new Map();
  for (const id of Object.keys(after)) {
    if (!before[id]) continue;
    const s0 = specKey(before, id), s1 = specKey(after, id);
    if (s0 === s1) continue;
    specs.set(s0, s1);
    if (!isObject(after[id])) params.set(parameterization(before, id), parameterization(after, id));
  }
  if (!specs.size) return;
  const liveSpecs = new Set(Object.keys(after).map(id => specKey(after, id)));
  const liveParams = new Set(Object.keys(after).filter(id => !isObject(after[id])).map(id => parameterization(after, id)));
  const moves = (map, live) => [...map].filter(([from]) => !live.has(from));
  for (const [from, to] of moves(specs, liveSpecs))
    if (order[from] && !order[to]) { const { [from]: list, ...rest } = order; order = { ...rest, [to]: list }; }
  for (const [from, to] of moves(params, liveParams)) {
    if (!styles.some(s => s.param === to)) styles = styles.map(s => s.param === from ? { ...s, param: to } : s);
    if (required[from] && !required[to]) { const { [from]: req, ...rest } = required; required = { ...rest, [to]: req }; }
  }
}

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

// Saves a field's value typed in place. Its datatype is the one other fields with its parameterization
// have, or else a guess from the value. Returns why it couldn't be saved, if it couldn't.
function saveFieldValue(id, raw, label = labelOf(records[id])) {
  const r = records[id];
  const p = parameterization(records, id);
  const fixed = Object.keys(records).find(k => k !== id && isField(records[k]) && parameterization(records, k) === p);
  const datatype = fixed ? records[fixed].field : isObjectName(id) ? 'text' : classify(clean(raw));
  const value = parseValue(datatype, raw);
  if (value === undefined) return clean(raw) ? `${label} takes ${asPhrase(datatype)} here.` : `${label} can’t be empty.`;
  if (datatype === r.field && value === r.value) return null;
  return commit({ ...records, [id]: { ...r, field: datatype, value } });
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
// since they're located at it. Returns why it couldn't, if it couldn't.
function moveUp(id) {
  const r = records[id];
  const loc = records[r.at];
  if (!loc || isObject(loc) || isRelation(loc)) return `${r.edge} is already at the top level.`;
  return commit({ ...records, [id]: { ...r, at: loc.at } });
}

// ---- Required entries ----

// The parameterization an entry labeled `label` would have at a location.
const paramAt = (label, at) => JSON.stringify([JSON.stringify([norm(label), specKey(records, at)])]);

// Makes an entry's parameterization required at every location like its own, or stops requiring it.
function toggleRequired(id) {
  const r = records[id];
  const p = parameterization(records, id);
  pushUndo();
  if (required[p]) { const { [p]: _, ...rest } = required; required = rest; }
  else required = { ...required, [p]: { label: r.edge, type: typeOf(r), datatype: r.field } };
  saveState();
}

function stopRequiring(param) {
  pushUndo();
  const { [param]: _, ...rest } = required;
  required = rest;
  saveState();
}

// The required entries a location has no entry for, as [param, { label, type }] pairs.
// A tag counts as recorded whether it's attested or ruled out.
function missingAt(at) {
  if (!records[at] || isField(records[at])) return [];
  return Object.entries(required).filter(([p, req]) =>
    p === paramAt(req.label, at) && !entriesOf(at).some(e => parameterization(records, e) === p));
}

// The required entries missing anywhere in an object, or below a location: each with where it's missing.
function missingUnder(id) {
  const out = [];
  const walk = at => {
    for (const [param, req] of missingAt(at)) out.push({ at, param, ...req });
    for (const e of entriesOf(at)) if (!isField(records[e])) walk(e);
  };
  if (records[id]) walk(id);
  return out;
}

// ---- Deleting and restoring ----

// A set of records with everything that depends on them: every entry located at one of them, at any
// depth, and every relation one of them is an argument of, with whatever depends on those in turn.
function withDependents(ids) {
  const all = new Set(ids);
  for (let grew = true; grew;) {
    grew = false;
    for (const [k, r] of Object.entries(records))
      if (!all.has(k) && argsOf(r).some(a => all.has(a.at))) { all.add(k); grew = true; }
  }
  return all;
}

// Deleting hides rather than destroys: the records and their dependents go into the archive as a batch,
// labeled with what was deleted, and can be restored from there. Returns why it couldn't, if it couldn't.
function deleteRecords(ids, label) {
  const gone = withDependents(ids);
  const next = Object.fromEntries(Object.entries(records).filter(([k]) => !gone.has(k)));
  const error = validate(next);
  if (error) return error;
  pushUndo();
  const kept = Object.fromEntries([...gone].map(k => [k, records[k]]));
  const boxes = Object.fromEntries(Object.entries(layout).filter(([k]) => gone.has(k)));
  archive = [{ id: newId(), label, when: Date.now(), records: kept, layout: boxes }, ...archive];
  records = next;
  layout = Object.fromEntries(Object.entries(layout).filter(([k]) => !gone.has(k)));
  saveState();
  return null;
}

// Puts a deleted batch back. Something it depends on may have been deleted since, in which case that
// needs restoring first.
function restoreBatch(batchId) {
  const batch = archive.find(b => b.id === batchId);
  const next = { ...records, ...batch.records };
  const missing = Object.values(batch.records).flatMap(argsOf).map(a => a.at).find(at => !next[at]);
  if (missing) {
    const other = archive.find(b => b.records[missing]);
    return other ? `Restore ${other.label} first; this depends on it.` : 'Something this depends on no longer exists.';
  }
  const error = validate(next);
  if (error) return `Can’t restore it: ${error}`;
  pushUndo();
  records = next;
  layout = { ...layout, ...batch.layout };
  archive = archive.filter(b => b !== batch);
  saveState();
  return null;
}
