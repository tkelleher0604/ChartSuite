// Notes: what a chart says about its records, as entries at patterns, some in a view (dendra.md, Notes).
// A note row is { note, label, pattern, view?, param?, value }: param names one of a relation pattern's
// edges, for a list's name or an edge's order; or, for Shown, an entry, the field shown beside the pattern in the
// box it's in (dendra.md, Fields). For a record and a label, the narrowest note it fits decides:
// one in the view before one in none, then the pattern that keeps more labels.
const Notes = (() => {
const { narrower, shapeOf, weight, key, bare, paramKey, treeOf, isObject, isChoice, isTag, objectOf, pathOf, entryAt, same, isOpen } = Tree;

// The format properties, how a view draws what a note reaches: every label but the model's others (dendra.md,
// Notes), so a new property is only a word in the scene's defaults and its drawing. A Text note, a box's free text,
// is a note of its own, not a look.
const OTHERS = new Set(['Name', 'Description', 'Order', 'Required', 'Fixed', 'Check', 'Start', 'End', 'Formula', 'Caption', 'Position', 'Bend', 'Layout', 'As Of', 'Changes', 'Plan', 'Page', 'Scale', 'Footer', 'Text', 'Footnote', 'Master', 'Theme Fonts', 'Pinned']);
const FORMATS = { has: label => typeof label === 'string' && !OTHERS.has(label) };
const typeOfSpec = t => !t ? 'tag' : 'field' in t.out ? 'field' : 'choice' in t.out ? 'choice' : 'tag';
// Words begun mid-sentence, in lower case but for initials (GP, BDC); and the preposition a list's name ends
// in, as a relation's words say a side: Signs For, for.
const lower = s => String(s).replace(/\b[A-Z](?=[a-z])/g, c => c.toLowerCase());
const PREP = /\s(of|in|for|to|by|with|from|on|at)$/i;
const push = (map, k, v) => { if (!map.has(k)) map.set(k, []); map.get(k).push(v); };
const bySchema = new WeakMap(), labelled = new WeakMap();

function index(rows) {
  // A record fits only patterns of its shape, so notes are found by label, edge and shape, narrowest first; those at a
  // pattern that leaves a location open, by label and edge, as any shape may fit them.
  const byKey = new Map(), byShape = new Map(), byLabel = new Map(), params = new Map(), openly = new Map(), rank = new Map();
  const ranked = rows.map(n => [n, weight(n.pattern)])
    .sort(([a, w], [b, v]) => !!b.view - !!a.view || v - w || (a.note < b.note ? -1 : a.note > b.note ? 1 : 0));
  for (const [n] of ranked) {
    const shape = shapeOf(n.pattern);
    rank.set(n, rank.size);
    if (isOpen(n.pattern)) push(openly, `${n.label}|${n.param ?? ''}`, n);
    else push(byKey, `${n.label}|${n.param ?? ''}|${shape}`, n);
    push(byLabel, n.label, n);
    if (!byShape.has(shape)) byShape.set(shape, new Set());
    byShape.get(shape).add(n.label);
    if (n.param) { const k = `${n.label}|${shape}`; if (!params.has(k)) params.set(k, new Map()); params.get(k).set(Tree.norm(n.param), n.param); }
  }

  // The note that decides a label for a tree (a record's, or any pattern), in a view or none: { value, note }. Kept
  // for the tree while these notes stand, as a tree is kept while its state does (Tree.treeOf), so a record's is
  // looked for once however often it's asked.
  const decided = new WeakMap();
  function resolve(label, t, view, param) {
    const k = `${label}|${view ?? ''}|${param ?? ''}`;
    let kept = decided.get(t);
    if (kept?.has(k)) return kept.get(k);
    const first = list => list?.find(n => (!n.view || n.view === view) && narrower(t, n.pattern));
    const a = first(byKey.get(`${label}|${param ?? ''}|${shapeOf(t)}`)), b = first(openly.get(`${label}|${param ?? ''}`)), n = a && b ? (rank.get(a) < rank.get(b) ? a : b) : a ?? b;
    const out = n ? { value: n.value, note: n } : null;
    if (!kept) decided.set(t, kept = new Map());
    kept.set(k, out);
    return out;
  }
  const value = (label, t, view, param) => resolve(label, t, view, param)?.value;

  // A relation's edges in order, as Order notes on its edges give it.
  const edges = t => t.args.map(a => a.edge).map((e, i) => [e, value('Order', t, undefined, e) ?? Infinity, i])
    .sort((a, b) => a[1] - b[1] || a[2] - b[2]).map(([e]) => e);
  // What a kind, entry or relation is called: its Name note, or else its kind, label, or edges.
  const name = t => value('Name', t) ?? (!t.args ? t.kind ?? '' : t.args.length > 1 ? edges(t).join(' · ') : t.args[0].edge);
  // A relation's list of relatives in one role (Owners), or else that role's edge label.
  const listName = (t, edge) => value('Name', t, undefined, edge) ?? edge;

  // How a view draws a record: each format property that a note decides, with its note; a note at a pattern leaving a
  // location open (what a comparison says of a mark: see Scene) fitting records of any shape.
  let openLooks = null;
  function formats(t, view) {
    const out = {};
    for (const label of byShape.get(shapeOf(t)) ?? []) if (FORMATS.has(label)) {
      const r = resolve(label, t, view);
      if (r) out[label] = r;
    }
    openLooks ??= [...new Set(rows.filter(n => FORMATS.has(n.label) && isOpen(n.pattern)).map(n => n.label))];
    for (const label of openLooks) if (!(label in out)) {
      const r = resolve(label, t, view);
      if (r) out[label] = r;
    }
    return out;
  }

  // The fields a record's notes show or hide in the box (or on the line) it's in, in a view, or give a look of `label`
  // there: each note whose param names an entry (the field beside the record, dendra.md, Fields), the narrowest for
  // each. → { [entry]: { value, note } }
  function fields(t, view, label = 'Shown') {
    const out = {};
    for (const param of params.get(`${label}|${shapeOf(t)}`)?.values() ?? []) { const r = resolve(label, t, view, param); if (r) out[param] = r; }
    return out;
  }

  // A view's styles in its order: each a pattern with root unlabeled, and its outputs' formats. A note at
  // one object or one value is that record's own setting, not a style's. Order in a view orders its styles. A
  // field shown beside an output (a Shown note's param) is the boxes' own, not a look a style gives them.
  function styles(view) {
    const groups = new Map(), order = new Map();
    const group = p => { const k = key(p); if (!groups.has(k)) groups.set(k, { pattern: p, key: k, outputs: new Map() }); return groups.get(k); };
    for (const n of rows) if (n.view === view && !n.param) {
      const p = n.pattern;
      if (n.label === 'Order') { order.set(key(p), n.value); group(p); }
      // (A line's own look, at its relation's tree with its sides in it, is as much its own as a box's is.)
      else if ((FORMATS.has(n.label) || n.label === 'Caption') && !Tree.idsIn(p).size && !(p.out && 'value' in p.out)) {
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
    if (isOpen(p)) return Object.values(S).filter(t => narrower(t, p));
    if (!bySchema.has(S)) { const m = new Map(); for (const t of Object.values(S)) push(m, shapeOf(t), t); bySchema.set(S, m); }
    return (bySchema.get(S).get(shapeOf(p)) ?? []).filter(t => narrower(t, p));
  }
  // The pattern of the relation a tree is of: its Name note's, where that leaves a side open, as one relation of a side of
  // several kinds has one pattern (Evidence); else the tree, every label removed.
  const stripped = t => t.args ? { args: t.args.map(a => ({ edge: a.edge, loc: stripped(a.loc) })) } : {};
  function relationPattern(t) {
    const p = stripped(t), n = resolve('Name', p)?.note;
    return n && isOpen(n.pattern) ? n.pattern : p;
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
  // each side after it, after its label: Margaret A. Chen for Fund III, via GP III. A side after the second
  // that's an object already said isn't said again: Margaret A. Chen for The Manager, signing for it directly.
  // A side named by a number, which alone doesn't say what it is, is said with its kind: AIV-1, tax year 2025.
  // `args`, for a relation not recorded (an error's, or one two objects aren't in).
  function placed(recs, id, args) {
    const t = args ? { args: args.map(a => ({ edge: a.edge, loc: treeOf(recs, a.at) ?? {} })) } : treeAt(recs, id), of = args ?? recs[id].args;
    const xs = edges(t).map(e => of.find(a => same(a.edge, e))).filter(Boolean);
    return xs.map((a, i) => {
      // (A side that's itself a relation, what a document evidences, by its own place.)
      const o = objectOf(recs, a.at) ?? a.at, text = recs[o]?.args ? segmentOf(recs, o) : shortOf(recs, o), kind = recs[o]?.kind, prep = i === 1 && xs.length > 2 && PREP.exec(listName(t, a.edge))?.[1];
      const join = !i ? '' : /^\d+$/.test(text) && kind ? `, ${kind.toLowerCase()} ` : xs.length === 2 ? ' → ' : prep ? ` ${prep.toLowerCase()} ` : `, ${lower(a.edge)} `;
      return { edge: a.edge, id: o, text, join };
    }).filter((s, i, all) => i < 2 || !all.slice(0, i).some(b => b.id === s.id));
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

  const optionOrder = p => (byLabel.get('Order') ?? []).find(n => !n.view && n.pattern.out && narrower(n.pattern, p))?.value;
  return {
    resolve, value, name, listName, edges, formats, fields, styles, definitions, relations, fitting, relationPattern,
    nameOf, shortOf, sides, placed, segmentOf, placeOf, whereOf,
    notes: label => byLabel.get(label) ?? [],
    description: t => value('Description', t),
    // Where an entry sits among its location's entries, by the Order at its label: read without its output, as an
    // Order at an option (Main Fund) orders the options instead (optionOrder).
    order: t => { const v = value('Order', t.out ? bare(t) : t); return typeof v === 'object' ? undefined : v; },
    // At a kind, which of its entries its boxes stand across in the order of, among what's beside them: siblings by Born.
    across: kind => value('Order', { kind })?.by ?? null,
    // Where an option sits in its list: the Order noted at it in no view, or at it where its entry is specified;
    // none, and the list goes on by name.
    optionOrder,
    // The options of these specifications of one entry, as its dropdown, its filter and its table list them: by the Order
    // noted at each, then in the order they were made, as the specifications are.
    optionsOf(specs) {
      const rank = new Map();
      for (const s of specs) if ('choice' in s.out) rank.set(s.out.choice, Math.min(rank.get(s.out.choice) ?? Infinity, optionOrder(s) ?? Infinity));
      return [...rank.keys()].map((o, i) => [o, i]).sort(([a, i], [b, j]) => rank.get(a) === rank.get(b) ? i - j : rank.get(a) - rank.get(b)).map(([o]) => o);
    },
    required: t => value('Required', t) === true,
    // That what's entered there doesn't change over time, as a number given once doesn't: typed over, it's corrected.
    fixed: t => value('Fixed', t) === true,
    // A date says its own day, one fact unless a note says it recurs (a questionnaire's): Fixed, false there, its Changes over time ticked.
    changing: t => value('Fixed', t) === false,
    // A Check note on a definition: one ruled out is a check failed. On an entry typed by hand: its "no" needs attention.
    check: t => value('Check', t) === true && !!resolve('Formula', t),
    heeds: t => value('Check', t) === true && !resolve('Formula', t),
    // (Its value `true`, or the verb for the act where a word of its entry doesn't say it: { verb, done }.)
    isStart: t => { const v = value('Start', t); return v === true || !!v?.verb; },
    isEnd: t => { const v = value('End', t); return v === true || !!v?.verb; },
    shown: (t, view) => value('Shown', t, view),
    position: (t, view) => value('Position', t, view),
    caption: (t, view) => value('Caption', t, view),
  };
}

// ---- The house look (dendra.md, Workbook): a view's look, as a set of notes at no record ----

// Of a chart view, its notes in it at no record: every format property, Text, and the Captions of what it keeps; of
// its Shown notes, those of fields and those keeping a kind off the page, never a filter; the order of its styles; and
// its furniture: the title's and date's formats, and the Key's, with its title, columns, row order, hidden rows, captions
// and the corner it stands in; the page's own Font and Size; and the paper it's on and the chart's footer. Nothing in it
// names a record, so a chart that has none of them can take it; nor a place, a bend or a scale, which are what they are only
// where they were put. `corner`, where a hand put its Key: how far from which corner of the sheet, as the scene has it.
// → { notes: [{ label, pattern, param?, value }], order: [pattern], furniture: { title?, date?, key? }, root, page, footer? }
const FURNITURE = { title: ['format'], date: ['format'], key: ['format', 'title', 'columns', 'order', 'hide', 'captions', 'corner'] };
// What a note at the view itself says of every text on its page (dendra.md, Notes).
const ROOT = ['Font', 'Size'];
const furnitureOf = r => r.role ?? (r.geometry === 'legend' ? 'key' : null);
const isOption = p => !!p.out && ('choice' in p.out || 'tag' in p.out);
const shownInLook = r => !!r.param || (r.pattern.args?.length === 1 && !isOption(r.pattern)) || (r.value === false && !!r.pattern.kind && !r.pattern.args);
const looksLike = r => FORMATS.has(r.label) && r.label !== 'Shown' || r.label === 'Text' || r.label === 'Caption';
function houseLook(rows, view, { corner } = {}) {
  const own = rows.filter(r => 'note' in r && r.view === view && !Tree.idsIn(r.pattern).size);
  const kept = own.filter(r => r.label === 'Shown' ? shownInLook(r) : looksLike(r) && r.label !== 'Caption'), styled = new Set(kept.map(r => key(r.pattern)));
  const note = ({ label, pattern, param, value }) => ({ label, pattern, ...(param && { param }), value });
  const furniture = {};
  for (const r of rows) if ('shape' in r && r.view === view) {
    const f = furnitureOf(r), keys = FURNITURE[f];
    if (keys) furniture[f] = Object.fromEntries(keys.filter(k => r[k] !== undefined && r[k] !== null).map(k => [k, r[k]]));
  }
  if (corner && furniture.key) furniture.key.corner = corner;
  const page = rows.find(r => 'note' in r && r.label === 'Page' && r.pattern.id === view)?.value ?? 'slide', footer = rows.find(r => 'note' in r && r.label === 'Footer' && !r.view)?.value;
  const root = Object.fromEntries(rows.filter(r => 'note' in r && !r.view && r.pattern.id === view && ROOT.includes(r.label)).map(r => [r.label, r.value]));
  // The chart's own colors and what its new shapes take; and Everything else, what its boxes take that nothing else gives them.
  const palette = rows.find(r => 'note' in r && r.label === 'Palette' && !r.view)?.value, shapes = rows.find(r => 'note' in r && r.label === 'Shape Defaults' && !r.view)?.value;
  const rest = Object.fromEntries(rows.filter(r => 'note' in r && r.view === view && r.pattern.id === view && r.pattern.kind === 'View' && FORMATS.has(r.label)).map(r => [r.label, r.value]));
  return { notes: [...kept, ...own.filter(r => r.label === 'Caption' && styled.has(key(r.pattern)))].map(note), order: index(own).styles(view).map(s => s.pattern), furniture, root, page, ...(footer && { footer }), ...(palette && { palette }), ...(shapes && { shapes }), ...(Object.keys(rest).length && { rest }) };
}
// A view takes a look, on tx. A style both have takes the look's: what the view gives its outputs and the look doesn't
// goes. A style only in the look comes across; a style only in the view stays, after them, so what it says still
// holds. It takes the page's Font and Size, the paper (the placing that goes with it is the caller's: Export.placing), the
// Key's title, rows, captions and corner, and the footer's look, its words too where the chart has none. What says what a mark
// is and where, not how it looks, stays the view's own: its Shown, its frames and their headings, what's drawn above what, its
// layers, a relation written in its box rather than drawn, and every place. Only a view `begun` takes those. A style that comes
// across comes with its caption, but for one a frame of the view is headed by. `has`, whether this chart has what a pattern
// reaches: what it hasn't doesn't come, so a look from another chart leaves no row that reaches nothing.
const owned = n => ['Shown', 'Frame', 'Above', 'Layer'].includes(n.label) || (n.label === 'Connector' && n.value === 'none');
function takeLook(tx, rows, view, look, { begun = false, has = () => true } = {}) {
  const fits = look.notes.filter(n => (begun || !owned(n)) && has(n.pattern)), lands = new Set(fits.filter(n => n.label !== 'Caption').map(n => key(n.pattern)));
  const own = rows.filter(r => 'note' in r && r.view === view && !Tree.idsIn(r.pattern).size), framed = new Set(own.filter(r => r.label === 'Frame' && r.value !== 'none').map(r => key(r.pattern)));
  const heads = new Set(own.filter(r => r.label === 'Caption' && framed.has(key(r.pattern))).map(r => key(r.pattern)));
  const come = fits.filter(n => n.label !== 'Caption' || (lands.has(key(n.pattern)) && !heads.has(key(n.pattern))));
  const at = n => JSON.stringify([n.label, n.param ?? null, key(n.pattern)]), coming = new Set(come.map(at));
  for (const r of own) if (looksLike(r) && r.label !== 'Caption' && !owned(r) && lands.has(key(r.pattern)) && !coming.has(at(r))) tx.note(r.label, r.pattern, undefined, { view, param: r.param });
  for (const n of come) tx.note(n.label, n.pattern, n.value, { view, param: n.param });
  const first = look.order.filter(has), seen = new Set(first.map(key));
  [...first, ...index(own).styles(view).filter(s => !seen.has(s.key)).map(s => s.pattern)].forEach((p, i) => tx.note('Order', p, i + 1, { view }));
  for (const r of rows) if ('shape' in r && r.view === view) {
    const f = furnitureOf(r), keys = FURNITURE[f], given = look.furniture?.[f];
    if (!keys || !given) continue;
    // (Its captions the look's, over its own, which stay where the look says nothing of them; and in the corner the look's stands in, where it says one.)
    const said = keys.filter(k => k !== 'corner'), changes = Object.fromEntries(said.map(k => [k, k === 'captions' ? { ...r.captions, ...given.captions } : given[k]]));
    const moved = !!given.corner && JSON.stringify(r.corner ?? null) !== JSON.stringify(given.corner);
    if (moved || said.some(k => JSON.stringify(r[k] ?? null) !== JSON.stringify(changes[k] ?? null))) tx.update(r.shape, { ...changes, ...(moved && { corner: given.corner, x: null, y: null, kept: null }) });
  }
  const self = { id: view, kind: 'View' }, noted = (label, p) => rows.find(r => 'note' in r && r.label === label && !r.view && key(r.pattern) === key(p))?.value;
  if (look.page && JSON.stringify(noted('Page', self) ?? 'slide') !== JSON.stringify(look.page)) tx.note('Page', self, look.page === 'slide' ? undefined : look.page);
  if (look.root) for (const l of ROOT) if ((noted(l, self) ?? null) !== (look.root[l] ?? null)) tx.note(l, self, look.root[l]);
  const foot = noted('Footer', { kind: 'View' }), footer = !look.footer ? null : begun || !(foot?.text || foot?.number) ? look.footer : { ...foot, format: look.footer.format };
  if (footer && JSON.stringify(foot ?? null) !== JSON.stringify(footer)) tx.note('Footer', { kind: 'View' }, footer);
  if (look.palette && JSON.stringify(noted('Palette', { kind: 'View' }) ?? null) !== JSON.stringify(look.palette)) tx.note('Palette', { kind: 'View' }, look.palette);
  if (look.shapes && JSON.stringify(noted('Shape Defaults', { kind: 'View' }) ?? null) !== JSON.stringify(look.shapes)) tx.note('Shape Defaults', { kind: 'View' }, look.shapes);
  for (const [l, v] of Object.entries(look.rest ?? {})) tx.note(l, self, v, { view });
  return { left: look.notes.filter(n => (begun || !owned(n)) && !has(n.pattern)).length };
}
// A look read from a file, as far as it's one: what a look may hold and nothing else, never a record. Null if it isn't one.
function lookFrom(data) {
  try {
    const clean = p => { if (!p || typeof p !== 'object' || Tree.idsIn(p).size) throw new Error('not a pattern'); key(p); return p; };
    const notes = data.notes.filter(n => typeof n.label === 'string' && (looksLike(n) || n.label === 'Shown') && n.value !== undefined && n.value !== null)
      .map(({ label, pattern, param, value }) => ({ label, pattern: clean(pattern), ...(typeof param === 'string' && { param }), value }));
    const furniture = {}, fits = { format: v => !!v && typeof v === 'object' && !Array.isArray(v), title: v => typeof v === 'string', columns: v => Number.isInteger(v) && v > 0 && v < 10, order: v => Array.isArray(v) && v.every(k => typeof k === 'string'), hide: v => Array.isArray(v) && v.every(k => typeof k === 'string'), captions: v => !!v && typeof v === 'object' && Object.values(v).every(c => typeof c === 'string'), corner: v => !!v && ['left', 'right'].includes(v.h) && ['top', 'bottom'].includes(v.v) };
    for (const [f, keys] of Object.entries(FURNITURE)) if (data.furniture?.[f]) furniture[f] = Object.fromEntries(keys.filter(k => fits[k](data.furniture[f][k])).map(k => [k, data.furniture[f][k]]));
    const paper = v => typeof v === 'string' || (!!v && typeof v === 'object' && !Array.isArray(v) && (typeof v.size === 'string' || (v.w > 0 && v.h > 0)));
    const foot = data.footer && typeof data.footer === 'object' ? { ...(typeof data.footer.text === 'string' && { text: data.footer.text }), ...(data.footer.number === true && { number: true }), ...(fits.format(data.footer.format) && { format: data.footer.format }) } : {};
    const root = data.root && typeof data.root === 'object' ? { ...(typeof data.root.Font === 'string' && { Font: data.root.Font }), ...(Number.isFinite(data.root.Size) && { Size: data.root.Size }) } : null;
    const palette = Array.isArray(data.palette?.colors) && data.palette.colors.length === 10 && data.palette.colors.every(c => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c)) ? { colors: data.palette.colors } : null;
    const shapes = data.shapes && typeof data.shapes === 'object' && !Array.isArray(data.shapes) ? Object.fromEntries(['shape', 'line', 'text'].filter(k => fits.format(data.shapes[k])).map(k => [k, data.shapes[k]])) : null;
    const rest = data.rest && typeof data.rest === 'object' && !Array.isArray(data.rest) ? Object.fromEntries(Object.entries(data.rest).filter(([l]) => ['Fill', 'Gradient', 'Pattern', 'Transparency', 'Outline', 'Weight', 'Dash', 'Shadow'].includes(l))) : null;
    return { notes, order: (data.order ?? []).map(clean), furniture, ...(root && { root }), ...(paper(data.page) && { page: data.page }), ...(Object.keys(foot).length && { footer: foot }), ...(palette && { palette }), ...(shapes && Object.keys(shapes).length && { shapes }), ...(rest && Object.keys(rest).length && { rest }) };
  } catch { return null; }
}

return { index, FORMATS, ROOT, isOption, looksLike, houseLook, takeLook, lookFrom };
})();
