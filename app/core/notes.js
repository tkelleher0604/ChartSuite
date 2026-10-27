// Notes: what a chart says about its records, as entries at patterns, some in a view (dendra.md, Notes).
// A note row is { note, label, pattern, view?, param?, value }: param names one of a relation pattern's
// edges, for a list's name or an edge's order. For a record and a label, the narrowest note it fits decides:
// one in the view before one in none, then the pattern that keeps more labels.
const Notes = (() => {
const { narrower, shapeOf, weight, key, bare, paramKey, treeOf, isObject, isChoice, isTag, objectOf, pathOf, entryAt, same } = Tree;

// The format properties: how a view draws what a note reaches.
const FORMATS = new Set(['Shown', 'Shape', 'Fill', 'Outline', 'Weight', 'Dash', 'Frame', 'Layer', 'Arrow', 'Connector', 'Above',
  'Font', 'Size', 'Bold', 'Italic', 'Underline', 'Color', 'Align', 'Format']);
const typeOfSpec = t => !t ? 'tag' : 'field' in t.out ? 'field' : 'choice' in t.out ? 'choice' : 'tag';
// Words begun mid-sentence, in lower case but for initials (GP, BDC); and the preposition a list's name ends
// in, as a relation's words say a side: Signs For, for.
const lower = s => String(s).replace(/\b[A-Z](?=[a-z])/g, c => c.toLowerCase());
const PREP = /\s(of|in|for|to|by|with|from|on|at)$/i;
const push = (map, k, v) => { if (!map.has(k)) map.set(k, []); map.get(k).push(v); };
const bySchema = new WeakMap(), labelled = new WeakMap();

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
    for (const label of byShape.get(shapeOf(t)) ?? []) if (FORMATS.has(label)) {
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
      else if ((FORMATS.has(n.label) || n.label === 'Caption') && p.id === undefined && !(p.out && 'value' in p.out)) {
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

  // ---- The chart's words: how a record in a state reads ----
  // An object by its Name (an entry, or for a view a note), or else its kind; a relation by its name; any other
  // record by its label.
  const treeAt = (recs, id) => treeOf(recs, id) ?? { args: recs[id].args.map(a => ({ edge: a.edge, loc: {} })) };
  function nameOf(recs, id) {
    const r = recs[id];
    if (!r) return '';
    if (isObject(r)) { const n = entryAt(recs, id, 'Name'); return n ? String(recs[n].value) : value('Name', { id, kind: r.kind }) ?? r.kind; }
    return r.args ? name(treeAt(recs, id)) : r.edge;
  }
  // Where there's little room: an object's Short Name.
  const shortOf = (recs, id) => { const s = isObject(recs[id] ?? {}) && entryAt(recs, id, 'Short Name'); return s ? String(recs[s].value) : nameOf(recs, id); };
  // A relation's arguments in its edges' order.
  const sides = (recs, id) => { const r = recs[id]; return edges(treeAt(recs, id)).map(e => r.args.find(a => same(a.edge, e))); };
  // The place rule: where a relation is, said side by side, each { edge, id, text, join }: the side's object,
  // by its short name, after the words that join it to the sides before. Two sides are joined as their line
  // joins them, by an arrow: Fund III → Fund III Blocker. Three or more are said as the panel's sentence says
  // them, less its verb: the second after the preposition its list's name ends in (Signs For), or else, as
  // each side after it, after its label: Margaret A. Chen for Fund III, via GP III. A side named by a number,
  // which alone doesn't say what it is, is said with its kind: AIV-1, tax year 2025. `args`, for a relation
  // not recorded (an error's, or one two objects aren't in).
  function placed(recs, id, args) {
    const t = args ? { args: args.map(a => ({ edge: a.edge, loc: treeOf(recs, a.at) ?? {} })) } : treeAt(recs, id), of = args ?? recs[id].args;
    const xs = edges(t).map(e => of.find(a => same(a.edge, e))).filter(Boolean);
    return xs.map((a, i) => {
      const o = objectOf(recs, a.at) ?? a.at, text = shortOf(recs, o), kind = recs[o]?.kind, prep = i === 1 && PREP.exec(listName(t, a.edge))?.[1];
      const join = !i ? '' : /^\d+$/.test(text) && kind ? `, ${kind.toLowerCase()} ` : xs.length === 2 ? ' → ' : prep ? ` ${prep.toLowerCase()} ` : `, ${lower(a.edge)} `;
      return { edge: a.edge, id: o, text, join };
    });
  }
  // A record as a step on a path: an object by its short name, a relation by its sides as the place rule
  // says them, an option with its label, a tag ruled out with Not.
  function segmentOf(recs, id) {
    const r = recs[id];
    return !r ? '' : isObject(r) ? shortOf(recs, id) : r.args ? placed(recs, id).map(s => s.join + s.text).join('')
      : isChoice(r) ? `${r.edge}: ${r.choice}` : isTag(r) && !r.tag ? `Not ${r.edge}` : r.edge;
  }
  // Where a record is: the path down to it, a step at a time.
  const placeOf = (recs, id) => pathOf(recs, id).map(x => segmentOf(recs, x)).join(' › ');
  // Where an entry is, said as far as it needs: its object (AIV-1), or the path down to it where the object has
  // another entry of its label (a file number at its jurisdiction and one elsewhere); at a relation, the
  // relation's place (AIV-1, tax year 2025). `r` is the entry, or one not recorded, as an error's { at, edge }.
  function whereOf(recs, r) {
    const O = objectOf(recs, r.at), of = (o, edge) => `${o}|${Tree.norm(edge)}`;
    if (!recs[O] || !isObject(recs[O]) || r.at === O) return placeOf(recs, r.at);
    if (!labelled.has(recs)) {
      const n = new Map();
      for (const x in recs) if (recs[x].edge !== undefined && !recs[x].args) { const k = of(objectOf(recs, recs[x].at), recs[x].edge); n.set(k, (n.get(k) ?? 0) + 1); }
      labelled.set(recs, n);
    }
    return labelled.get(recs).get(of(O, r.edge)) > 1 ? placeOf(recs, r.at) : shortOf(recs, O);
  }

  return {
    resolve, value, name, listName, edges, formats, styles, definitions, relations, fitting,
    nameOf, shortOf, sides, placed, segmentOf, placeOf, whereOf,
    notes: label => byLabel.get(label) ?? [],
    description: t => value('Description', t),
    order: t => value('Order', t),
    required: t => value('Required', t) === true,
    check: t => value('Check', t) === true,
    isStart: t => value('Start', t) === true,
    isEnd: t => value('End', t) === true,
    shown: (t, view) => value('Shown', t, view),
    position: (t, view) => value('Position', t, view),
    caption: (t, view) => value('Caption', t, view),
  };
}

return { index, FORMATS };
})();
