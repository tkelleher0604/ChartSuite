// A design's schema changes, planned without the editor, records store or transaction machinery.
// Trees remain the one schema model. Callers write `trees` in the same change as the design.
const DesignSchema = (() => {
const values = schema => Object.values(schema);
const datatype = out => 'field' in out ? out.field : 'choice' in out ? 'choice' : 'tag';
const unique = trees => [...new Map(trees.map(t => [Tree.key(t), t])).values()];
const at = (schema, loc, edge) => schema.filter(s => s.out && s.args?.length === 1 && Tree.same(s.args[0].edge, edge) && Tree.key(s.args[0].loc) === Tree.key(loc));
const chain = tree => tree.args?.length === 1 ? [...chain(tree.args[0].loc), tree] : [];
const root = tree => tree.args?.length === 1 ? root(tree.args[0].loc) : tree;
const onKind = (tree, kind) => tree.args ? { ...tree, args: tree.args.map(a => ({ ...a, loc: onKind(a.loc, kind) })) } : { kind };
const relativeName = label => label.replace(/^(.+?)(?:\.|['’]s\s+)(.+)$/, "$1's $2");

// The notes rewrite will touch, including other views and patterns with no visible objects.
// Pass whole Design notes only; partial overrides must not become shared designs.
function targets(notes, was, patterns, view, existing = notes) {
  const shared = was ? notes.filter(n => n.value.id === was) : [];
  return [...shared, ...patterns.filter(p => !shared.some(n => n.view === view && Tree.key(n.pattern) === Tree.key(p)))
    .map(pattern => ({ pattern, view, value: existing.find(n => n.view === view && Tree.key(n.pattern) === Tree.key(pattern))?.value }))];
}

// A style at an entry reaches the object containing that entry. A broad root reaches every
// declared object type, including types without an instance on the current page or date.
function kinds(targets, schema, records) {
  const found = new Map(), all = values(schema).filter(s => s.kind && !Tree.same(s.kind, 'View'));
  const add = kind => { if (kind && !Tree.same(kind, 'View')) found.set(Tree.norm(kind), kind); };
  const visit = p => {
    if (p.args) p.args.forEach(a => visit(a.loc));
    else if (p.kind) add(p.kind);
    else if (p.id !== undefined) add(records[p.id]?.kind);
    else all.forEach(s => add(s.kind));
  };
  targets.forEach(n => visit(n.pattern));
  return [...found.values()];
}

// Infer from the full path on the source type. Unrelated types' same-named fields must never
// combine their choice options. Without a source, infer only an unambiguous declaration shape.
function fields(parts, schema, { kind = null, readable = [] } = {}) {
  const named = new Map(), specs = values(schema);
  for (const label of ['Name', ...parts.flatMap(p => TextTemplate.fields(p.text))]) if (!named.has(Tree.norm(label))) named.set(Tree.norm(label), label);
  return [...named.values()].map(label => {
    const ownField = readable.find(r => !r.of && Tree.same(r.label, label));
    const paths = ownField?.paths ?? label.split(/\s*›\s*/).map(Tree.clean);
    let candidates = specs.filter(s => {
      const steps = chain(s), source = root(s);
      return s.out && steps.length === paths.length && steps.every((step, i) => Tree.same(step.args[0].edge, paths[i])) && (!kind || Tree.same(source.kind, kind));
    });
    if (!kind && candidates.length) {
      const byKind = new Map();
      for (const s of candidates) { const k = Tree.norm(root(s).kind); if (!byKind.has(k)) byKind.set(k, []); byKind.get(k).push(s); }
      const signature = ts => ts.map(t => Tree.key(onKind(t, '*'))).sort().join('\n');
      if (new Set([...byKind.values()].map(signature)).size > 1) candidates = [];
    }
    const own = candidates.length || readable.some(r => !r.of && Tree.same(r.label, label));
    const linked = !own && readable.some(r => r.of && (Tree.same(relativeName(r.label), relativeName(label)) || Tree.same(r.of, label) || (r.first && Tree.same(r.label.replace(/['’]s\s+name$/i, ''), label))));
    const types = new Set(candidates.map(s => datatype(s.out)));
    const type = Tree.same(label, 'Name') ? 'text' : types.size === 1 ? [...types][0] : 'text';
    return { label, paths, datatype: type, outputs: unique(candidates).map(s => s.out), templates: candidates, linked: !!linked };
  });
}

// Either all declarations are valid, or none are returned. Existing datatypes are never silently
// changed. Nested entries retain every source option branch instead of just the first option.
function declarations(schema, kinds, fields) {
  const planned = [], known = new Map(values(schema).map(t => [Tree.key(t), t]));
  let error = null;
  const add = (tree, kind, label) => {
    if (error || known.has(Tree.key(tree))) return;
    const conflict = Tree.schemaError(Tree.schema([...known.values(), tree]));
    if (conflict) { error = `${label} on ${kind}: ${conflict}`; return; }
    known.set(Tree.key(tree), tree); planned.push(tree);
  };
  for (const kind of kinds) {
    add({ kind }, kind, kind);
    for (const f of fields) {
      if (f.linked) continue;
      const outputs = ['choice', 'tag'].includes(f.datatype) ? f.outputs.filter(o => datatype(o) === f.datatype) : [{ field: f.datatype }];
      if (!outputs.length) { error = `${f.label} on ${kind} needs ${f.datatype === 'choice' ? 'choice options' : 'checkbox values'}.`; break; }
      if (f.templates?.length) {
        for (const template of f.templates) {
          const moved = onKind(template, kind), ends = datatype(template.out) === f.datatype ? [template.out] : outputs;
          for (const out of ends) for (const tree of chain({ ...moved, out })) add(tree, kind, f.label);
        }
      } else {
        let locs = [{ kind }];
        f.paths.forEach((edge, i) => {
          const last = i === f.paths.length - 1;
          locs = unique(locs.flatMap(loc => {
            const existing = at([...known.values()], loc, edge);
            const trees = !last && existing.length ? existing : (last ? outputs : [{ field: 'text' }]).map(out => ({ out, args: [{ edge, loc }] }));
            trees.forEach(tree => add(tree, kind, f.label));
            return trees;
          }));
        });
      }
      if (error) break;
    }
    if (error) break;
  }
  return { trees: error ? [] : planned, error };
}
return { targets, kinds, fields, declarations };
})();
