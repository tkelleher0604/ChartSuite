// What the formula tests share: the core's helpers the engine needs, the sample's definitions in both
// languages, and a chart grown for testing how the engine scales (perf-test.html) and what it gives
// (engine-test.html).

// The two helpers formulas.js takes from the core (see its header), here from common.js and model.js, until
// app/core/tree.js provides them.
if (typeof Tree === 'undefined') window.Tree = { norm, formatDate };

// The sample's definitions as formulas.js takes them, from app/sample/definitions.json. A page reads a file
// beside it only when Chrome runs with --allow-file-access-from-files, as the tests do.
function loadJSON(path) {
  const req = new XMLHttpRequest();
  req.open('GET', path, false);
  req.overrideMimeType('application/json');
  req.send();
  return JSON.parse(req.responseText);
}
const DEFINITIONS = loadJSON('../sample/definitions.json');
// The core's: the sample's first eleven, before the deadlines and documents on file.
const CORE_IDS = new Set(SAMPLE_DEFINITIONS.map(d => d.id));
const CORE_DEFINITIONS = DEFINITIONS.filter(d => CORE_IDS.has(d.id));
// The same definitions as the engine before this one took them (engine-reference.js): sample.js's, written
// with = formulas and ← implications.
const OLD_DEFINITIONS = [...SAMPLE_DEFINITIONS, ...DEADLINE_DEFINITIONS, ...ON_FILE_DEFINITIONS];

// The sample's names, and a Depositor relation for Affiliated Person's clause (F), which the sample doesn't
// chart: without it, Depositors is a name the chart doesn't have, which is #NAME? wherever (F) gets that far.
const NAMES = { relations: [...SAMPLE_NAMES.relations,
  { name: 'Depositor', type: 'tag', edges: ['Depositor', 'Fund'], lists: { Fund: { Depositor: 'Depositors' }, Depositor: { Fund: 'Deposited Funds' } } }] };

// `base` with `n` more entities, in layers of four, each owned 60/40 by two of the layer above (the first four
// by the fund outright; every other one by one of the layer above outright, through one record, since a state
// has one ownership between a pair), with a general partner for every other one and an officer for every
// third, and a person for every four entities.
function grown(base, n) {
  const recs = structuredClone(base);
  const ents = [], people = [];
  for (let i = 0; i < n; i++) {
    const id = `x_e${i}`;
    recs[id] = { kind: 'Entity' };
    recs[`${id}_name`] = { at: id, edge: 'Name', field: 'text', value: `Extra Entity ${i}` };
    recs[`${id}_type`] = { at: id, edge: 'Entity Type', choice: i % 3 ? 'Limited Partnership' : 'Limited Liability Company' };
    ents.push(id);
    if (i % 4 === 0) {
      const p = `x_p${i}`;
      recs[p] = { kind: 'Individual' };
      recs[`${p}_name`] = { at: p, edge: 'Name', field: 'text', value: `Extra Person ${i}` };
      people.push(p);
    }
  }
  const own = (a, b, pct, k) => {
    recs[`x_own${k}`] = { args: [{ edge: 'Owner', at: a }, { edge: 'Owned', at: b }], tag: true };
    recs[`x_own${k}_pct`] = { at: `x_own${k}`, edge: 'Percentage', field: 'percent', value: pct };
  };
  let k = 0;
  ents.forEach((id, i) => {
    if (i < 4) own('fund', id, 1, k++);
    else if (i % 2) own(ents[i - 4], id, 1, k++);
    else { own(ents[i - 4], id, 0.6, k++); own(ents[i - 3], id, 0.4, k++); }
    if (i % 2 && recs[`${id}_type`].choice === 'Limited Partnership')
      recs[`x_gp${i}`] = { args: [{ edge: 'GP', at: ents[Math.max(0, i - 1)] }, { edge: 'Fund Owned', at: `${id}_type` }], tag: true };
    if (i % 3 === 0 && people.length)
      recs[`x_pos${i}`] = { args: [{ edge: 'Holder', at: people[i % people.length] }, { edge: 'Company', at: id }], choice: 'Officer' };
  });
  return recs;
}
