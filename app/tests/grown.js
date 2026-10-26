// What the formula tests share: the sample's log, as formulas.js takes it on a day, a chart grown from it for
// testing how the engine scales, and definitions written as Notes gives them.

// The sample as of a day: its entered records, and its Formula notes and relation names as formulas.js takes
// them. The day is fixed, so the counts the tests check don't move.
const DAY = '2026-10-26';
const WB = Log.open(SAMPLE), CHART = WB.charts()[0].chart;
function sampleAsOf(day = DAY) {
  const S = WB.schema(CHART), N = WB.notes(CHART);
  return { recs: WB.asOf(CHART, day), definitions: N.definitions(S), names: { relations: N.relations(S) } };
}
const SAMPLE_INPUTS = sampleAsOf();
const workOut = (recs = SAMPLE_INPUTS.recs, definitions = SAMPLE_INPUTS.definitions, names = SAMPLE_INPUTS.names) =>
  Formulas.computeState(recs, definitions, names);

// A definition a test writes, as Notes.definitions gives one: what it covers, from its specifications' trees,
// each parameter given by its edge and the kinds (or location trees) it can be at.
function definition(id, name, out, params, rows) {
  let combos = [[]];
  for (const [edge, locs] of params)
    combos = combos.flatMap(c => [].concat(locs).map(l => [...c, { edge, loc: typeof l === 'string' ? { kind: l } : l }]));
  const type = 'tag' in out ? 'tag' : 'choice' in out ? 'choice' : 'field';
  return { id, name, covers: combos.map(args => Tree.paramKey({ out, args })), rows, type,
    ...(type === 'field' && { datatype: out.field }), ...(params.length > 1 && { edges: params.map(([e]) => e) }) };
}

// `base` with `n` more entities, in layers of four, each owned 60/40 by two of the layer above (the first four
// by the fund outright; every other one by one of the layer above outright), with a general partner for
// every other one, an officer for every third, and a person for every four entities.
function grown(base, n) {
  const recs = { ...base };
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
      recs[`x_gp${i}`] = { args: [{ edge: 'GP', at: ents[Math.max(0, i - 1)] }, { edge: 'Partnership', at: `${id}_type` }], tag: true };
    if (i % 3 === 0 && people.length)
      recs[`x_pos${i}`] = { args: [{ edge: 'Holder', at: people[i % people.length] }, { edge: 'Company', at: id }], choice: 'Officer' };
  });
  return recs;
}
