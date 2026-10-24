// The formula lab: formulas.md's examples, worked out on the sample chart by formulas.js, with their
// definitions editable, a scratch box, and a self-test (#selftest) of the results the document claims.
// The lab keeps its own copy of the records and saves its edits under its own key.

const LAB_KEY = 'rboreal.formula-lab.v1';

// The pilot's names for relations and their lists of relatives (formulas.md, "Names for relations and lists").
const LAB_NAMES = { relations: [
  { name: 'Ownership', type: 'tag', edges: ['Owner', 'Owned'], lists: { Owned: { Owner: 'Owners' }, Owner: { Owned: 'Holdings' } } },
  { name: 'General Partner', type: 'tag', edges: ['GP', 'Fund Owned'], lists: { 'Fund Owned': { GP: 'General Partners' }, GP: { 'Fund Owned': 'Funds' } } },
  { name: 'Membership', type: 'choice', edges: ['Member', 'LLC'], lists: { LLC: { Member: 'Members' }, Member: { LLC: 'LLCs' } } },
  { name: 'Signing Authority', type: 'tag', edges: ['Signatory', 'Via', 'On Behalf Of'], lists: {} },
  { name: 'Position', type: 'choice', edges: ['Holder', 'Company'], lists: { Company: { Holder: 'Personnel' }, Holder: { Company: 'Positions' } } },
  { name: 'Investment Adviser', type: 'tag', edges: ['Adviser', 'Client'], lists: { Client: { Adviser: 'Advisers' }, Adviser: { Client: 'Clients' } } },
  { name: 'Look-Through Ownership', type: 'field', edges: ['Investor', 'Investment'], lists: {} },
  { name: 'Control', type: 'tag', edges: ['Controller', 'Controlled'], lists: { Controlled: { Controller: 'Controllers' }, Controller: { Controlled: 'Controlled Companies' } } },
  { name: 'Affiliated Person', type: 'tag', edges: ['Affiliate', 'Person'], lists: { Person: { Affiliate: 'Affiliates' }, Affiliate: { Person: 'Affiliated With' } } },
  { name: 'Close Affiliate', type: 'tag', edges: ['Close Affiliate', 'BDC'], lists: { BDC: { 'Close Affiliate': 'Close Affiliates' }, 'Close Affiliate': { BDC: 'Close Affiliate Of' } } },
  { name: 'Remote Affiliate', type: 'tag', edges: ['Remote Affiliate', 'BDC'], lists: { BDC: { 'Remote Affiliate': 'Remote Affiliates' }, 'Remote Affiliate': { BDC: 'Remote Affiliate Of' } } },
] };

const PEOPLE = ['Entity', 'Individual'];

// Every example in formulas.md, as written there.
const LAB_DEFINITIONS = [
  { id: 'adds_up', name: 'Ownership Adds Up', type: 'tag', at: ['Entity', 'Individual', 'Investor Group'],
    formula: '= IF(COUNT(Owners) = 0, BLANK(), SUM(Owners.Percentage) = 100%)' },
  { id: 'tax', name: 'Tax Classification', type: 'choice',
    at: ['Entity › Entity Type: Limited Partnership', 'Entity › Entity Type: Limited Liability Company', 'Entity › Entity Type: Corporation'],
    formula: '= IFS(@ = "Corporation", "C Corporation", [Ownership Adds Up] AND COUNT(Owners) = 1, "Disregarded Entity", TRUE, "Partnership")' },
  { id: 'look_through', name: 'Look-Through Ownership', type: 'field', datatype: 'number', percent: true,
    args: [{ edge: 'Investor', at: ['Entity', 'Individual', 'Investor Group'] }, { edge: 'Investment', at: ['Entity'] }],
    formula: '= LOOKTHROUGH(Investor, Investment, Holdings, Percentage)' },
  { id: 'control', name: 'Control', type: 'tag',
    args: [{ edge: 'Controller', at: PEOPLE }, { edge: 'Controlled', at: ['Entity'] }],
    implications: [
      { label: 'More than 25%', formula: '← SUM(FILTER(Controlled.Owners, @ = Controller OR @ IN REACH(Controller, [Controlled Companies])).Percentage) > 25%' },
      { label: 'General partner', formula: '← Controller IN Controlled.[Entity Type].[General Partners]' },
      { label: 'Managing member', formula: '← Controller IN FILTER(Controlled.[Entity Type].Members, @.Membership = "Managing Member")' },
    ] },
  { id: 'affiliated', name: 'Affiliated Person', type: 'tag',
    args: [{ edge: 'Affiliate', at: PEOPLE }, { edge: 'Person', at: PEOPLE }],
    implications: [
      { label: '(A)', formula: '← SUM(FILTER(Person.Owners, @ = Affiliate OR @ IN REACH(Affiliate, [Controlled Companies])).Percentage) >= 5%' },
      { label: '(B)', formula: '← IMPLIEDBY([Affiliated Person](Person, Affiliate), "(A)")' },
      { label: '(C)', formula: '← Affiliate IN REACH(Person, Controllers) OR Affiliate IN REACH(Person, [Controlled Companies]) OR ANY(REACH(Person, Controllers), Affiliate IN REACH(@, [Controlled Companies]))' },
      { label: '(D)', formula: '← Affiliate IN FILTER(Person.Personnel, @.Position <> "Advisory Board Member") OR Affiliate IN Person.[Entity Type].[General Partners]' },
      { label: '(E)', formula: '← Person.[Investment Company] AND (Affiliate IN Person.Advisers OR Affiliate IN FILTER(Person.Personnel, @.Position = "Advisory Board Member"))' },
    ] },
  { id: 'close', name: 'Close Affiliate', type: 'tag',
    args: [{ edge: 'Close Affiliate', at: PEOPLE }, { edge: 'BDC', at: ['Entity › Investment Company Status: Business Development Company'] }],
    implications: [
      { label: '(b)(1)', formula: '← [Close Affiliate] IN BDC.Personnel' },
      { label: '(b)(1) affiliates', formula: '← ANY(BDC.Personnel, IMPLIEDBY([Affiliated Person]([Close Affiliate], @), "(C)"))' },
      { label: '(b)(2)', formula: '← [Close Affiliate] IN BDC.Advisers OR [Close Affiliate] IN BDC.[Entity Type].[General Partners]' },
      { label: '(b)(2)', formula: '← [Close Affiliate] IN REACH(BDC, Controllers)' },
      { label: '(b)(2)', formula: '← ANY(REACH(BDC, Controllers), WITHOUT(BDC, [Close Affiliate] IN REACH(@, [Controlled Companies])))' },
      { label: '(b)(2) affiliates', formula: '← ANY(BDC.[Close Affiliates], IMPLIEDBY([Close Affiliate](@, BDC), "(b)(2)") AND IMPLIEDBY([Affiliated Person]([Close Affiliate], @), "(C)", "(D)"))' },
    ] },
  { id: 'remote', name: 'Remote Affiliate', type: 'tag',
    args: [{ edge: 'Remote Affiliate', at: PEOPLE }, { edge: 'BDC', at: ['Entity › Investment Company Status: Business Development Company'] }],
    implications: [
      { label: '(e)(1)(A)', formula: '← IMPLIEDBY([Affiliated Person]([Remote Affiliate], BDC), "(A)") AND NOT [Close Affiliate]([Remote Affiliate], BDC)' },
    ] },
  { id: 'count_3c1', name: '3(c)(1) Count', type: 'field', datatype: 'number', at: ['Entity'],
    formula: '= SUM(EACH(Owners, IF(KIND(@) = "Entity" AND @.Percentage >= 10% AND @.[Private Fund], @.[3(c)(1) Count], 1)))' },
];

// Records the examples assume that the sample doesn't have (formulas.md, "Affiliated person"). The fund is
// made a BDC for the close and remote affiliate examples.
const LAB_EXTRAS = {
  x_pos_chen_mgmt: { args: [{ edge: 'Holder', at: 'chen' }, { edge: 'Company', at: 'mgmt' }], choice: 'Officer' },
  x_pos_okfr_mgmt: { args: [{ edge: 'Holder', at: 'okafor' }, { edge: 'Company', at: 'mgmt' }], choice: 'Officer' },
  x_pos_chen_gp:   { args: [{ edge: 'Holder', at: 'chen' }, { edge: 'Company', at: 'gp' }], choice: 'Officer' },
  x_adv_fund:      { args: [{ edge: 'Adviser', at: 'mgmt' }, { edge: 'Client', at: 'fund' }], tag: true },
  x_adv_feeder:    { args: [{ edge: 'Adviser', at: 'mgmt' }, { edge: 'Client', at: 'feeder' }], tag: true },
  x_fund_ic:       { at: 'fund', edge: 'Investment Company', tag: true },
  x_fund_bdc:      { at: 'fund', edge: 'Investment Company Status', choice: 'Business Development Company' },
  x_feeder_pf:     { at: 'feeder', edge: 'Private Fund', tag: true },
};

// Ownership as decided on 2026-10-24: a tag with edges Owner and Owned, with a Percentage located at it.
// The sample may still have it as a number field relating Owner and Holding; that's converted here.
function ownershipAsTags(recs) {
  const out = {};
  for (const [id, r] of Object.entries(recs)) {
    const old = r.args?.length === 2 && isField(r) && same(r.args[0].edge, 'Owner') && same(r.args[1].edge, 'Holding');
    if (!old) { out[id] = r; continue; }
    out[id] = { args: [r.args[0], { edge: 'Owned', at: r.args[1].at }], tag: true };
    out[`${id}_pct`] = { at: id, edge: 'Percentage', field: 'number', value: r.value };
  }
  return out;
}

function enteredRecords({ extras, overrides }) {
  return { ...ownershipAsTags(structuredClone(SAMPLE)), ...(extras ? LAB_EXTRAS : {}), ...overrides };
}

// ---- The lab's own state ----

let lab = freshLab();
let result = null;
let selected = 'control';
let scratch = { at: 'fund', text: '= REACH(@, Controllers)' };

function freshLab() { return { defs: structuredClone(LAB_DEFINITIONS), extras: true, overrides: {} }; }
function loadLab() {
  try { const saved = JSON.parse(localStorage.getItem(LAB_KEY)); if (saved?.defs) lab = saved; } catch {}
}
function saveLab() {
  try { localStorage.setItem(LAB_KEY, JSON.stringify(lab)); } catch {}
}

function labRecompute() {
  result = Formulas.computeState(enteredRecords(lab), lab.defs, LAB_NAMES);
}

// ---- Drawing ----

const $ = id => document.getElementById(id);
const defById = id => lab.defs.find(d => d.id === id);
const TYPES = [['tag', 'Tag'], ['choice', 'Choice'], ['field:number', 'Number field'], ['field:text', 'Text field'], ['field:date', 'Date field']];
const typeValue = d => d.type === 'field' ? `field:${d.datatype ?? 'number'}` : d.type;

function render() {
  $('prefs').innerHTML = `<label class="lab-toggle"><input type="checkbox" data-action="extras"${lab.extras ? ' checked' : ''}> Assumed records</label>
    <button class="link-btn" data-action="reset">Reset lab</button>${themeSwitch()}`;
  renderDefs();
  renderEditor();
  renderResults();
  renderScratch();
}

function renderDefs() {
  $('defs').innerHTML = lab.defs.map(d => {
    const rows = result.rows[d.id] ?? [];
    const bad = result.defErrors[d.id] || rows.some(r => r.error);
    return `<button class="lab-def${d.id === selected ? ' is-on' : ''}" data-action="select" data-id="${esc(d.id)}">
      <span class="lab-def-name">${esc(d.name || 'Untitled')}</span>
      <span class="lab-def-meta">${esc(TYPES.find(t => t[0] === typeValue(d))?.[1] ?? d.type)}${d.args ? ' relation' : ''} · ${rows.filter(r => !r.error && !r.entered).length} computed${bad ? ' · <span class="lab-bad">errors</span>' : ''}</span></button>`;
  }).join('') + `<button class="link-btn lab-add" data-action="add">${icon('plus')} New definition</button>
    <p class="lab-note">Worked out in ${result.ms.toFixed(1)} ms. Steps: ${result.order.map(g => g.map(id => esc(defById(id)?.name ?? id)).join(' + ')).join(' → ')}</p>`;
}

const field = (label, html) => `<label class="lab-field"><span>${label}</span>${html}</label>`;
const input = (key, value, attrs = '') => `<input class="input" data-key="${key}" value="${esc(value ?? '')}" ${attrs}>`;
const area = (key, value) => `<textarea class="input lab-formula" data-key="${key}" spellcheck="false">${esc(value ?? '')}</textarea>`;

function renderEditor() {
  const d = defById(selected);
  if (!d) { $('editor').innerHTML = '<p class="lab-note">Pick a definition.</p>'; return; }
  const covers = d.args
    ? d.args.map((a, i) => `<div class="lab-param">${input(`arg-edge:${i}`, a.edge, 'placeholder="Edge"')}${input(`arg-at:${i}`, a.at.join(', '), 'placeholder="Locations, comma-separated"')}</div>`).join('')
    : input('at', (d.at ?? []).join(', '), 'placeholder="Locations, comma-separated"');
  const formulas = d.implications
    ? d.implications.map((imp, i) => `<div class="lab-imp">${input(`imp-label:${i}`, imp.label, 'placeholder="Label"')}${area(`imp:${i}`, imp.formula)}
        <button class="icon-btn" data-action="drop-imp" data-i="${i}" title="Remove this implication" aria-label="Remove this implication">${icon('x')}</button></div>`).join('')
      + `<button class="link-btn" data-action="add-imp">${icon('plus')} Add implication</button>`
    : area('formula', d.formula);
  $('editor').innerHTML = `
    <div class="lab-row">${field('Name', input('name', d.name))}${field('Type', `<select class="input" data-key="type">${TYPES.map(([v, t]) => `<option value="${v}"${v === typeValue(d) ? ' selected' : ''}>${t}</option>`).join('')}</select>`)}
      <button class="link-btn lab-drop" data-action="drop-def">${icon('trash')} Delete</button></div>
    ${field(d.args ? 'Parameters and their locations' : 'Located at', covers)}
    ${field(d.implications ? 'Implications' : 'Formula', formulas)}
    ${d.type === 'tag' ? `<button class="link-btn" data-action="toggle-form">${d.implications ? 'Use one = formula instead' : 'Use implications instead'}</button>` : ''}
    <p class="lab-error" id="def-error"></p>`;
}

function outputHtml(d, row) {
  if (row.error) return `<span class="lab-bad" title="${esc(row.error.msg)}">${esc(row.error.code)}</span> <span class="lab-why">${esc(row.error.msg)}</span>`;
  const v = row.entered ? result.records[row.entered] : { value: row.value, tag: row.value, choice: row.value };
  if (d.type === 'tag') return box(row.entered ? result.records[row.entered].tag : row.value);
  if (row.entered) return esc(Formulas.formatValue(result, { t: 'rec', id: row.entered, link: null }, { percent: d.percent }));
  return esc(Formulas.formatValue(result, v.value, { percent: d.percent }));
}

function marksHtml(d, row) {
  const bits = [];
  if (row.entered) bits.push(`entered${row.mark ? `, ${row.mark}` : ''}${row.formula !== undefined && row.formula !== null && d.type !== 'tag' ? `; formula gives ${esc(Formulas.isError(row.formula) ? row.formula.code : Formulas.formatValue(result, row.formula, { percent: d.percent }))}` : ''}`);
  if (row.labels?.length) bits.push(`implied by ${row.labels.map(esc).join(', ')}`);
  if (row.errors?.length) bits.push(row.errors.map(e => `<span class="lab-bad" title="${esc(e.error.msg)}">${esc(e.label)}: ${esc(e.error.code)}</span>`).join(', '));
  return bits.join('; ');
}

function renderResults() {
  const d = defById(selected);
  if (!d) { $('results').innerHTML = ''; return; }
  const problem = result.defErrors[d.id];
  const errorEl = $('def-error');
  if (errorEl) errorEl.textContent = problem ?? '';
  const rows = result.rows[d.id] ?? [];
  const head = d.args ? d.args.map(a => `<th>${esc(a.edge)}</th>`).join('') : '<th>At</th>';
  const body = rows.map(row => {
    const args = (d.args ? row.args : [row]).map(a => `<td>${esc(Formulas.place(result, a.at))}</td>`).join('');
    const override = lab.overrides[`lab:${row.key}`];
    const action = d.type === 'tag' && d.args
      ? override ? `<button class="link-btn" data-action="clear" data-key="${esc(row.key)}">Clear ruling-out</button>`
        : !row.entered && !row.error ? `<button class="link-btn" data-action="rule-out" data-key="${esc(row.key)}">Rule out</button>` : ''
      : '';
    return `<tr>${args}<td class="lab-out">${outputHtml(d, row)}</td><td class="lab-why">${marksHtml(d, row)}</td><td>${action}</td></tr>`;
  }).join('');
  $('results').innerHTML = rows.length
    ? `<table class="lab-table"><thead><tr>${head}<th>Output</th><th>Marks</th><th></th></tr></thead><tbody>${body}</tbody></table>`
    : `<p class="lab-note">${problem ? '' : 'Nothing computed.'}</p>`;
}

function renderScratch() {
  const places = Object.keys(result.records).filter(id => !result.records[id].args && !isField(result.records[id]))
    .map(id => [id, Formulas.place(result, id)]).sort((a, b) => byLabel(a[1], b[1]));
  const value = Formulas.evaluateAt(result, scratch.text, scratch.at);
  $('scratch').innerHTML = `<div class="lab-row">
    ${field('At', `<select class="input" data-key="scratch-at">${places.map(([id, t]) => `<option value="${esc(id)}"${id === scratch.at ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`)}
    ${field('Expression', `<input class="input lab-formula" data-key="scratch-text" value="${esc(scratch.text)}" spellcheck="false">`)}</div>
    <p class="lab-scratch-out" id="scratch-out">${scratchOut(value)}</p>`;
}
const scratchOut = v => Formulas.isError(v) ? `<span class="lab-bad">${esc(v.code)}</span> ${esc(v.msg)}` : esc(Formulas.formatValue(result, v));

// ---- Editing ----

let timer = null;
function later() {
  clearTimeout(timer);
  timer = setTimeout(() => { saveLab(); labRecompute(); renderDefs(); renderResults(); renderScratch(); }, 150);
}

document.addEventListener('input', e => {
  const key = e.target.dataset.key;
  if (!key) return;
  const d = defById(selected);
  const v = e.target.value;
  if (key === 'scratch-text') {
    scratch.text = v;
    $('scratch-out').innerHTML = scratchOut(Formulas.evaluateAt(result, v, scratch.at));
    return;
  }
  if (key === 'scratch-at') { scratch.at = v; renderScratch(); return; }
  if (!d) return;
  const [what, i] = key.split(':');
  if (what === 'name') d.name = v;
  else if (what === 'type') { [d.type, d.datatype] = v.split(':'); if (d.type !== 'tag') { d.formula ??= '= '; delete d.implications; } }
  else if (what === 'at') d.at = v.split(',').map(clean).filter(Boolean);
  else if (what === 'arg-edge') d.args[i].edge = v;
  else if (what === 'arg-at') d.args[i].at = v.split(',').map(clean).filter(Boolean);
  else if (what === 'formula') d.formula = arrow(e.target);
  else if (what === 'imp') d.implications[i].formula = arrow(e.target);
  else if (what === 'imp-label') d.implications[i].label = v;
  if (what === 'name') renderDefs();
  later();
});

// Typing `<-` at the start of a formula turns it into `←`.
function arrow(el) {
  const tidy = Formulas.tidyArrow(el.value);
  if (tidy !== el.value) { const at = el.selectionStart - 1; el.value = tidy; el.setSelectionRange(at, at); }
  return tidy;
}

document.addEventListener('change', e => { if (e.target.dataset.key === 'type') renderEditor(); });

document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const d = defById(selected);
  const act = el.dataset.action;
  if (act === 'select') { selected = el.dataset.id; render(); return; }
  if (act === 'pref') { prefs[el.dataset.key] = el.dataset.value; savePrefs(); applyTheme(); render(); return; }
  if (act === 'extras') lab.extras = el.checked;
  else if (act === 'reset') { lab = freshLab(); selected = 'control'; }
  else if (act === 'add') { const id = `def${Date.now().toString(36)}`; lab.defs.push({ id, name: 'New Tag', type: 'tag', at: ['Entity'], formula: '= ' }); selected = id; }
  else if (act === 'drop-def') { lab.defs = lab.defs.filter(x => x !== d); selected = lab.defs[0]?.id; }
  else if (act === 'add-imp') d.implications.push({ label: '', formula: '← ' });
  else if (act === 'drop-imp') d.implications.splice(Number(el.dataset.i), 1);
  else if (act === 'toggle-form') {
    if (d.implications) { delete d.implications; d.formula = '= '; } else { delete d.formula; d.implications = [{ label: '', formula: '← ' }]; }
  } else if (act === 'rule-out' || act === 'clear') {
    const row = (result.rows[d.id] ?? []).find(r => r.key === el.dataset.key);
    if (act === 'clear') delete lab.overrides[`lab:${el.dataset.key}`];
    else if (row) lab.overrides[`lab:${el.dataset.key}`] = { args: row.args, tag: false };
  } else return;
  saveLab();
  labRecompute();
  render();
});

// ---- Self-test: the results formulas.md claims, checked against the engine ----

function selftest() {
  const out = [];
  const check = (name, ok, detail = '') => out.push({ name, ok: !!ok, detail });
  const run = (defs = LAB_DEFINITIONS, more = {}) => Formulas.computeState({ ...enteredRecords({ extras: true, overrides: {} }), ...more }, defs, LAB_NAMES);
  const R = run();
  const objOf = (res, id) => { let cur = id; while (res.records[cur]?.at) cur = res.records[cur].at; return cur; };
  const rowsOf = (res, def) => res.rows[def] ?? [];
  const entryRow = (res, def, at) => rowsOf(res, def).find(r => r.at === at);
  const pairRow = (res, def, a, b) => rowsOf(res, def).find(r => objOf(res, r.args[0].at) === a && objOf(res, r.args[1].at) === b);
  const attested = (res, def, a, b) => { const r = pairRow(res, def, a, b); return !!r && !r.error && (r.entered ? res.records[r.entered].tag === true : r.value === true); };
  const labelsOf = (res, def, a, b) => pairRow(res, def, a, b)?.labels ?? [];

  const times = [run(), run(), run()].map(x => x.ms);
  check('Worked out in under 50 ms', Math.min(...times) < 50,
    `${times.map(t => t.toFixed(1)).join(', ')} ms; steps: ${R.steps.map(s => `${s.defs.join('+')} ${s.ms.toFixed(1)}`).join(', ')}`);
  check('No definition-level errors', !Object.keys(R.defErrors).length, JSON.stringify(R.defErrors));

  // Ownership Adds Up
  for (const id of ['fund', 'feeder', 'blocker', 'gp', 'mgmt']) check(`Ownership Adds Up attested on ${id}`, entryRow(R, 'adds_up', id)?.value === true);
  for (const id of ['northpine', 'halvard']) check(`Ownership Adds Up ruled out on ${id}`, entryRow(R, 'adds_up', id)?.value === false);
  for (const id of ['chen', 'okafor', 'inv_us', 'inv_nonus']) check(`Ownership Adds Up records nothing on ${id}`, !entryRow(R, 'adds_up', id));

  // Tax Classification
  check('Tax Classification covers three Entity Types', Formulas.coversOf(LAB_DEFINITIONS[1]).length === 3);
  for (const [at, option] of [['fund_type', 'Partnership'], ['gp_type', 'Partnership'], ['mgmt_type', 'Partnership'], ['blocker_type', 'C Corporation']]) {
    const r = entryRow(R, 'tax', at);
    check(`Tax Classification agrees with the entered ${option} at ${at}`, r?.mark === 'agrees' && r.formula === option, JSON.stringify(r && { mark: r.mark, formula: r.formula }));
  }
  check('Tax Classification computes Partnership for Northpine', entryRow(R, 'tax', 'northpine_type')?.value === 'Partnership');
  check('Tax Classification computes C Corporation for Halvard', entryRow(R, 'tax', 'halvard_type')?.value === 'C Corporation');
  check('Tax Classification gives the feeder nothing', !entryRow(R, 'tax', 'feeder_type'));

  // Look-through
  for (const [a, b, want] of [['inv_nonus', 'fund', 0.284], ['inv_nonus', 'northpine', 0.18176], ['inv_us', 'halvard', 0.58712]]) {
    const got = pairRow(R, 'look_through', a, b)?.value;
    check(`Look-through ${a} → ${b} is ${want * 100}%`, Math.abs(got - want) < 1e-9, String(got));
  }

  // Control, and rebutting the presumption
  const control = [['chen', 'mgmt'], ['okafor', 'mgmt'], ['chen', 'gp'], ['okafor', 'gp'], ['gp', 'fund'], ['gp', 'feeder'],
    ['fund', 'blocker'], ['fund', 'northpine'], ['fund', 'halvard'], ['feeder', 'fund'], ['feeder', 'blocker'], ['feeder', 'northpine'], ['feeder', 'halvard']];
  for (const [a, b] of control) check(`Control: ${a} controls ${b}`, attested(R, 'control', a, b), labelsOf(R, 'control', a, b).join(', '));
  check('Control: Chen’s control of the management company is implied by More than 25% and Managing member',
    ['More than 25%', 'Managing member'].every(l => labelsOf(R, 'control', 'chen', 'mgmt').includes(l)));
  const all = rowsOf(R, 'control').filter(r => !r.error).map(r => `${objOf(R, r.args[0].at)}→${objOf(R, r.args[1].at)}`);
  check(`Control attests ${all.length} pairs in all`, true, all.join(' '));
  const rebut = { lab_rebut: { args: [{ edge: 'Controller', at: 'feeder' }, { edge: 'Controlled', at: 'fund' }], tag: false } };
  const R2 = run(LAB_DEFINITIONS, rebut);
  check('Rebuttal: the ruling-out overrides More than 25%', pairRow(R2, 'control', 'feeder', 'fund')?.mark === 'overrides');
  for (const b of ['blocker', 'northpine', 'halvard']) check(`Rebuttal: the feeder no longer controls ${b}`, !attested(R2, 'control', 'feeder', b));

  // Affiliated Person
  const aff = rowsOf(R, 'affiliated').filter(r => !r.error);
  const has = (a, b, l) => labelsOf(R, 'affiliated', a, b).includes(l);
  const pairs = aff.map(r => [objOf(R, r.args[0].at), objOf(R, r.args[1].at)]);
  check('Affiliated Person: (B) mirrors (A)', pairs.every(([a, b]) => has(a, b, '(B)') === has(b, a, '(A)') && has(a, b, '(A)') === has(b, a, '(B)')));
  check('Affiliated Person: no one is their own affiliate', pairs.every(([a, b]) => a !== b));
  check(`Affiliated Person attests ${aff.length} pairs`, aff.length > 0);

  // Close Affiliate, with the fund as a BDC and the management company as its adviser
  for (const a of ['gp', 'chen', 'okafor', 'feeder', 'mgmt']) check(`Close Affiliate: ${a} under (b)(2)`, labelsOf(R, 'close', a, 'fund').includes('(b)(2)'), labelsOf(R, 'close', a, 'fund').join(', '));
  for (const a of ['blocker', 'northpine', 'halvard']) check(`Close Affiliate: ${a} not under (b)(2) (the carve-out)`, !labelsOf(R, 'close', a, 'fund').includes('(b)(2)'));
  for (const a of ['blocker', 'northpine', 'halvard']) check(`Close Affiliate: ${a} under (b)(2) affiliates, formula as in formulas.md`, labelsOf(R, 'close', a, 'fund').includes('(b)(2) affiliates'));
  const fixed = structuredClone(LAB_DEFINITIONS);
  const imp = fixed.find(d => d.id === 'close').implications.find(i => i.label === '(b)(2) affiliates');
  imp.formula = imp.formula.replace('BDC.[Close Affiliates]', 'BDC.[Investment Company Status].[Close Affiliates]');
  const R3 = run(fixed);
  for (const a of ['blocker', 'northpine', 'halvard']) check(`Close Affiliate: ${a} under (b)(2) affiliates, with the list read at Investment Company Status`, labelsOf(R3, 'close', a, 'fund').includes('(b)(2) affiliates'));
  check('Remote Affiliate works out without errors', !rowsOf(R, 'remote').some(r => r.error), `${rowsOf(R, 'remote').length} rows`);

  // 3(c)(1) Count, then an ownership loop
  check('3(c)(1) Count of the fund is 2', entryRow(R, 'count_3c1', 'fund')?.value === 2, String(entryRow(R, 'count_3c1', 'fund')?.value));
  const loop = {
    lab_loop: { args: [{ edge: 'Owner', at: 'northpine' }, { edge: 'Owned', at: 'fund' }], tag: true },
    lab_loop_pct: { at: 'lab_loop', edge: 'Percentage', field: 'number', value: '20%' },
    lab_np_pf: { at: 'northpine', edge: 'Private Fund', tag: true },
    lab_fund_pf: { at: 'fund', edge: 'Private Fund', tag: true },
  };
  const R4 = run(LAB_DEFINITIONS, loop);
  for (const id of ['fund', 'northpine']) check(`3(c)(1) Count loop: ${id} shows #CIRCULAR!`, entryRow(R4, 'count_3c1', id)?.error?.code === '#CIRCULAR!');

  // The engine's API
  const again = run();
  check('Computed ids stay the same from one working-out to the next', Object.keys(again.computed).join() === Object.keys(R.computed).join() && Object.keys(R.computed).length > 0);
  check('A computed record’s id comes from its argumentation', Object.keys(R.computed).every(id => id === Formulas.computedId(argsOf(R.records[id]))));
  check('Provenance names what an implication read', (R.computed[Object.keys(R.computed).find(id => R.computed[id].def === 'control')]?.reads ?? {})['More than 25%']?.length > 0
    || Object.values(R.computed).some(c => c.def === 'control' && Object.values(c.reads).some(r => r.length)));
  check('Covered entered records are marked', R.covered.fund_tax?.mark === 'agrees');
  check('<- starts an implication', Formulas.check('<- TRUE').kind === 'implies');
  check('A syntax error has a position', Formulas.check('= SUM(1, )').error?.pos === 9, JSON.stringify(Formulas.check('= SUM(1, )').error));
  const at = x => Formulas.evaluateAt(R, x, 'fund');
  check('Precedence: 1 + 2 * 3 is 7', at('= 1 + 2 * 3') === 7);
  check('Precedence: NOT 1 = 2 AND TRUE is TRUE', at('= NOT 1 = 2 AND TRUE') === true);
  check('$750,000,000 is a number', at('= $750,000,000') === 750000000);
  check('IN and array constants', at('= "a" IN {"A", "b"}') === true);
  check('A dot on a list maps over it', Formulas.formatValue(R, at('= Owners.Percentage'), { percent: true }) === '71.6%; 28.4%');
  check('renameName relabels a name', Formulas.renameName('= SUM(Owners.Percentage) > [Percentage]', 'Percentage', 'Voting Percentage') === '= SUM(Owners.[Voting Percentage]) > [Voting Percentage]');
  const moved = Formulas.relabel(LAB_DEFINITIONS, LAB_NAMES, 'Owned', 'Held');
  check('relabel carries an edge rename through names and formulas', moved.names.relations[0].edges[1] === 'Held' && moved.names.relations[0].lists.Held.Owner === 'Owners');
  const R5 = Formulas.computeState(Object.fromEntries(Object.entries(enteredRecords({ extras: true, overrides: {} }))
    .map(([k, r]) => [k, r.args ? { ...r, args: r.args.map(a => same(a.edge, 'Owned') ? { ...a, edge: 'Held' } : a) } : r])), moved.definitions, moved.names);
  check('After the rename, Control works out the same', Object.keys(R5.computed).filter(id => R5.computed[id].def === 'control').length === Object.keys(R.computed).filter(id => R.computed[id].def === 'control').length);
  const withoutGP = '= WITHOUT(@.[Entity Type].[General Partners], REACH(@, Controllers))';
  check('WITHOUT works in the scratch box: without the GP, only the feeder controls the fund', Formulas.formatValue(R, at(withoutGP)) === 'Calder Ridge Capital Partners III (Cayman), L.P.', Formulas.formatValue(R, at(withoutGP)));
  check('suggest offers arguments and functions on their own', ['Controller', 'REACH'].every(n => Formulas.suggest(R, 'control', '← ').some(s => s.name === n)));
  check('suggest offers names after a dot', Formulas.suggest(R, 'control', '← Controlled.Ow').some(s => s.name === 'Owners'), JSON.stringify(Formulas.suggest(R, 'control', '← Controlled.Ow')));

  const failed = out.filter(x => !x.ok).length;
  document.title = `selftest: ${out.length - failed} pass, ${failed} fail`;
  document.body.innerHTML = `<pre id="selftest">${esc(document.title)}\n\n${out.map(x => `${x.ok ? 'PASS' : 'FAIL'}  ${x.name}${x.detail ? `  [${x.detail}]` : ''}`).map(esc).join('\n')}</pre>`;
}

// ---- Start ----

applyTheme();
if (location.hash === '#selftest') selftest();
else {
  loadLab();
  if (location.hash.startsWith('#def=')) selected = decodeURIComponent(location.hash.slice(5));
  labRecompute();
  render();
}
