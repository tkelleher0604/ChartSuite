// Notes: what a chart says about its records, as entries at patterns, some in a view (dendra.md, Notes).
// A note row is { note, label, pattern, view?, param?, value }: param names one of a relation pattern's
// edges, for a list's name or an edge's order. For a record and a label, the narrowest note it fits decides:
// one in the view before one in none, then the pattern that keeps more labels.
const Notes = (() => {
const { narrower, shapeOf, weight, key, bare, paramKey } = Tree;

// Labels that aren't how a view draws something. Every other label is a format property, Shown among them.
const NOT_FORMAT = new Set(['Name', 'Description', 'Order', 'Required', 'Start', 'End', 'Formula', 'Position', 'Caption']);
const typeOfSpec = t => !t ? 'tag' : 'field' in t.out ? 'field' : 'choice' in t.out ? 'choice' : 'tag';
const push = (map, k, v) => { if (!map.has(k)) map.set(k, []); map.get(k).push(v); };
const bySchema = new WeakMap();

function index(rows) {
  // A record fits only patterns of its shape, so notes are found by label, edge and shape, narrowest first.
  const byKey = new Map(), byShape = new Map(), byLabel = new Map();
  const ranked = rows.map(n => [n, weight(n.pattern)])
    .sort(([a, w], [b, v]) => !!b.view - !!a.view || v - w || (a.note < b.note ? -1 : a.note > b.note ? 1 : 0));
  for (const [n] of ranked) {
    const shape = shapeOf(n.pattern);
    push(byKey, `${n.label}|${n.param ?? ''}|${shape}`, n);
    push(byLabel, n.label, n);
    if (!byShape.has(shape)) byShape.set(shape, new Set());
    byShape.get(shape).add(n.label);
  }

  // The note that decides a label for a tree (a record's, or any pattern), in a view or none: { value, note }.
  function resolve(label, t, view, param) {
    for (const n of byKey.get(`${label}|${param ?? ''}|${shapeOf(t)}`) ?? [])
      if ((!n.view || n.view === view) && narrower(t, n.pattern)) return { value: n.value, note: n };
    return null;
  }
  const value = (label, t, view, param) => resolve(label, t, view, param)?.value;

  // A relation's edges in order, as Order notes on its edges give it.
  const edges = t => t.args.map(a => a.edge).map((e, i) => [e, value('Order', t, undefined, e) ?? Infinity, i])
    .sort((a, b) => a[1] - b[1] || a[2] - b[2]).map(([e]) => e);
  // What a kind, entry or relation is called: its Name note, or else its kind, label, or edges.
  const name = t => value('Name', t) ?? (!t.args ? t.kind ?? '' : t.args.length > 1 ? edges(t).join(' · ') : t.args[0].edge);
  // A relation's list of relatives in one role (Owners), or else that role's edge label.
  const listName = (t, edge) => value('Name', t, undefined, edge) ?? edge;

  // How a view draws a record: each format property that a note decides, with its note.
  function formats(t, view) {
    const out = {};
    for (const label of byShape.get(shapeOf(t)) ?? []) if (!NOT_FORMAT.has(label)) {
      const r = resolve(label, t, view);
      if (r) out[label] = r;
    }
    return out;
  }

  // A view's styles in its order: each a pattern with root unlabeled, and its outputs' formats. A note at
  // one object or one value is that record's own setting, not a style's. Order in a view orders its styles.
  function styles(view) {
    const groups = new Map(), order = new Map();
    const group = p => { const k = key(p); if (!groups.has(k)) groups.set(k, { pattern: p, key: k, outputs: new Map() }); return groups.get(k); };
    for (const n of rows) if (n.view === view) {
      const p = n.pattern;
      if (n.label === 'Order') { order.set(key(p), n.value); group(p); }
      else if ((!NOT_FORMAT.has(n.label) || n.label === 'Caption') && p.id === undefined && !(p.out && 'value' in p.out)) {
        const outs = group(bare(p)).outputs, k = key(p);
        if (!outs.has(k)) outs.set(k, { pattern: p, formats: {} });
        outs.get(k).formats[n.label] = n.value;
      }
    }
    return [...groups.values()].sort((a, b) => (order.get(a.key) ?? Infinity) - (order.get(b.key) ?? Infinity))
      .map(g => ({ ...g, order: order.get(g.key), outputs: [...g.outputs.values()] }));
  }

  // The specifications of a schema that fit a pattern.
  function fitting(S, p) {
    if (!bySchema.has(S)) { const m = new Map(); for (const t of Object.values(S)) push(m, shapeOf(t), t); bySchema.set(S, m); }
    return (bySchema.get(S).get(shapeOf(p)) ?? []).filter(t => narrower(t, p));
  }

  // The Formula notes as formulas.js takes definitions. A definition covers the parameterizations of the
  // schema's specifications fitting its pattern.
  const definitions = S => (byLabel.get('Formula') ?? []).filter(n => !n.view && n.pattern.args).map(n => {
    const specs = fitting(S, n.pattern), t = specs[0], type = typeOfSpec(t), rel = n.pattern.args.length > 1;
    return { id: n.note, name: rel ? name(n.pattern) : n.pattern.args[0].edge, covers: [...new Set(specs.map(paramKey))], rows: n.value, type,
      ...(type === 'field' && { datatype: t.out.field }), ...(type === 'choice' && { options: [...new Set(specs.map(s => s.out.choice))] }),
      ...(rel && { edges: edges(n.pattern) }) };
  });

  // The relations' names and lists, as formulas.js takes names: { name, type, edges, lists: { from: { listed: name } }, covers }.
  const relations = S => (byLabel.get('Name') ?? []).filter(n => !n.view && !n.param && n.pattern.args?.length > 1).map(n => {
    const specs = fitting(S, n.pattern), es = edges(n.pattern), lists = {};
    for (const from of es) for (const to of es) if (from !== to) (lists[from] ??= {})[to] = listName(n.pattern, to);
    return { name: n.value, type: typeOfSpec(specs[0]), edges: es, lists, covers: [...new Set(specs.map(paramKey))] };
  });

  return {
    resolve, value, name, listName, edges, formats, styles, definitions, relations, fitting,
    notes: label => byLabel.get(label) ?? [],
    description: t => value('Description', t),
    order: t => value('Order', t),
    required: t => value('Required', t) === true,
    isStart: t => value('Start', t) === true,
    isEnd: t => value('End', t) === true,
    shown: (t, view) => value('Shown', t, view),
    position: (t, view) => value('Position', t, view),
    caption: (t, view) => value('Caption', t, view),
  };
}

return { index, NOT_FORMAT };
})();
