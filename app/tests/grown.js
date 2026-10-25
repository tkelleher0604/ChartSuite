// A chart grown for testing how the formula engine scales (perf-test.html) and that it gives what it did
// (engine-test.html): `base` with `n` more entities, in layers of four, each owned 60/40 by two of the layer
// above (the first four by the fund outright), with a general partner for every other one and an officer
// for every third, and a person for every four entities.
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
    else { own(ents[i - 4], id, 0.6, k++); own(ents[i - 3 - (i % 2)], id, 0.4, k++); }
    if (i % 2 && recs[`${id}_type`].choice === 'Limited Partnership')
      recs[`x_gp${i}`] = { args: [{ edge: 'GP', at: ents[Math.max(0, i - 1)] }, { edge: 'Fund Owned', at: `${id}_type` }], tag: true };
    if (i % 3 === 0 && people.length)
      recs[`x_pos${i}`] = { args: [{ edge: 'Holder', at: people[i % people.length] }, { edge: 'Company', at: id }], choice: 'Officer' };
  });
  return recs;
}

// What the engine takes for a chart: its entered records, and its definitions and names as formulas.js
// takes them, as the app gives them (see runFormulas in model.js). `defs` and `nms` are written as the
// sample writes them, unless `state` gives them in their stored form, with its schema.
function engineInputs(recs, defs, nms, state = null) {
  const { definitions, names, schema } = state
    ? { definitions: state.definitions, names: state.names, schema: withSpecsOf(state.schema, recs) }
    : canonicalFormulas(defs, nms, withSpecsOf({}, recs));
  return { recs, definitions: engineDefinitions(definitions, names, schema), names: engineNames(names, schema) };
}
