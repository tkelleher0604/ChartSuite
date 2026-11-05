// Templates (dendra.md, Workbook): what a new chart begins with, as data. Each is a file of app/templates, a classic
// script as the sample is, that registers { id, name, rows, example }: its specifications, its notes, the views and
// tables it opens with and their furniture, and no records. A row is as the log keeps it, less its id, its item named
// for now: { tree } a specification; { record, kind: 'View' } a view; { label, pattern, value, view?, param? } a note;
// { shape, view, … } a free shape, the one whose role is the title saying the chart's name. Nothing here, or anywhere in
// the app's code, names a template's kind, entry or relation: they're the templates' own to say. `example`, a few records
// (see exampleOf), is what its card in the New chart gallery draws.
const Templates = (() => {
  const all = new Map();
  const register = t => { all.set(t.id, t); return t; };
  const list = () => [...all.values()].sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
  const of = id => all.get(id) ?? null;

  // A pattern with each view it names under its fresh id.
  const moved = (p, to) => p.args ? { ...p, args: p.args.map(a => ({ ...a, loc: moved(a.loc, to) })) } : p.id === undefined ? p : { ...p, id: to(p.id) };
  // A template written into a chart a transaction is making, each item under a fresh id, its title saying `title`.
  function begin(tx, t, title) {
    // (A view named with a · is the app's own, the chart's master, and stays so.)
    const ids = new Map(), to = x => String(x).startsWith('·') ? x : ids.get(x) ?? ids.set(x, Log.newId()).get(x);
    for (const r of t.rows) {
      if ('tree' in r) tx.add('spec', { tree: r.tree });
      else if ('record' in r) tx.add('record', { kind: r.kind }, to(r.record));
      else if ('label' in r) tx.note(r.label, moved(r.pattern, to), r.value, { view: r.view && to(r.view), param: r.param });
      else { const { shape: _, view, ...x } = r; tx.add('shape', { view: to(view), ...x, ...(x.role === 'title' && { text: title }) }); }
    }
    return ids;
  }
  // A template's example records written in: { boxes: { a: [kind, { entry: value }] }, lines: [{ side: 'a', side: 'b', entries?: { entry: value } }] },
  // each entry's type read off the template's own specifications.
  function exampleOf(tx, t, ids = new Map()) {
    const specs = t.rows.filter(r => 'tree' in r).map(r => r.tree), own = (at, edge, value) => {
      const s = specs.find(x => x.args?.length === 1 && Tree.same(x.args[0].edge, edge));
      if (!s || value == null) return;
      tx.add('record', { at, edge, ...('tag' in s.out ? { tag: value !== false } : 'choice' in s.out ? { choice: value } : { field: s.out.field, value }) });
    };
    for (const [k, [kind, entries]] of Object.entries(t.example?.boxes ?? {})) {
      ids.set(k, tx.add('record', { kind }));
      for (const [edge, v] of Object.entries(entries)) own(ids.get(k), edge, v);
    }
    for (const { entries, ...sides } of t.example?.lines ?? []) {
      const at = tx.add('record', { args: Object.entries(sides).map(([edge, k]) => ({ edge, at: ids.get(k) })), tag: true });
      for (const [edge, v] of Object.entries(entries ?? {})) own(at, edge, v);
    }
    return ids;
  }

  // The rows of a template written by hand: `write` is given what a template says, in the terms of the rest of the design,
  // and the rows are what it wrote. (The fund template's are generated from the sample, as they stand.)
  function rows(write) {
    const out = [], entry = (edge, loc) => ({ args: [{ edge, loc }] }), output = type => type === 'tag' ? { tag: true } : { field: type };
    const note = (label, pattern, value, o = {}) => { out.push({ label, pattern, value, ...o }); };
    // Entries at a location, in their order, each a datatype, 'tag', or a list of options.
    const entries = (loc, list) => {
      Object.entries(list).forEach(([edge, type], i) => {
        if (Array.isArray(type)) type.forEach((choice, j) => { const tree = { out: { choice }, ...entry(edge, loc) }; out.push({ tree }); note('Order', tree, j + 1); });
        else out.push({ tree: { out: output(type), ...entry(edge, loc) } });
        note('Order', entry(edge, loc), i + 1);
      });
    };
    const sidesOf = sides => ({ args: sides.map(edge => ({ edge, loc: {} })) });
    const says = {
      note,
      entries,
      entry,
      kind: (kind, list) => { out.push({ tree: { kind } }); entries({ kind }, list); },
      // A relation of two sides: its name, its sides (the first drawn on top, unless it says `above`), the kinds at each,
      // its lists' names, what's entered at it (`at`), and `roles`, its options where it isn't a yes-or-no (Director, Officer).
      // → its pattern.
      relation(name, sides, { kinds, lists = {}, at, roles, above } = {}) {
        const p = sidesOf(sides), outs = roles ? roles.map(choice => ({ choice })) : [{ tag: true }];
        for (const pair of kinds ?? [[]]) for (const o of outs) {
          const tree = { out: o, args: sides.map((edge, i) => ({ edge, loc: { kind: pair[i] } })) };
          out.push({ tree });
          if (at) entries(tree, at);
        }
        note('Name', p, name);
        sides.forEach((edge, i) => { note('Order', p, i + 1, { param: edge }); note('Name', p, lists[edge] ?? Tree.plural(edge), { param: edge }); });
        if (above) note('Above', p, above);
        return p;
      },
      // What a kind's or relation's date entries say of when it holds, and the verb for ending or starting it, where the
      // word on the entry doesn't say it ({ verb, done }).
      starts: (edge, loc, act = true) => note('Start', { out: { field: 'date' }, ...entry(edge, loc) }, act),
      ends: (edge, loc, act = true) => note('End', { out: { field: 'date' }, ...entry(edge, loc) }, act),
      // A rule: { out: 'tag' or a datatype, at: a location, rows: [[label, formula]], check, about }.
      rule(edge, { at, type = 'tag', rows: rs, check, about }) {
        out.push({ tree: { out: output(type), ...entry(edge, at) } });
        note('Formula', entry(edge, at), rs.map(([label, formula]) => ({ label, formula })));
        if (about) note('Description', entry(edge, at), about);
        if (check) note('Check', entry(edge, at), true);
      },
      // A chart view and its page: its title, its day, and its Key, but where it says `key: false`, a chart of one kind having nothing for a Key to tell apart.
      page(view, name, order, furniture = {}) {
        out.push({ record: view, kind: 'View' });
        note('Name', { id: view, kind: 'View' }, name);
        note('Order', { id: view, kind: 'View' }, order);
        out.push({ shape: `${view}-title`, view, geometry: 'text', role: 'title', text: '', ...furniture.title });
        out.push({ shape: `${view}-date`, view, geometry: 'text', role: 'date', text: '="As of " & TEXT(@AsOf, "mmmm d, yyyy")', ...furniture.date });
        if (furniture.key !== false) out.push({ shape: `${view}-key`, view, geometry: 'legend', title: 'Key', columns: 2, ...furniture.key });
      },
      // A table of a kind's or a relation's records.
      table(view, name, order, rowsOf) {
        out.push({ record: view, kind: 'View' });
        note('Name', { id: view, kind: 'View' }, name);
        note('Layout', { id: view, kind: 'View' }, { rows: rowsOf });
        note('Order', { id: view, kind: 'View' }, order);
      },
      // A row of a view's Styles, its Key's too where it's captioned: what it reaches, its caption, and its look.
      style(view, pattern, caption, looks = {}) {
        const styles = out.filter(r => r.label === 'Order' && r.view === view).length;
        if (!out.some(r => r.label === 'Order' && r.view === view && Tree.key(r.pattern) === Tree.key(Tree.bare(pattern)))) note('Order', Tree.bare(pattern), styles + 1, { view });
        if (caption) note('Caption', pattern, caption, { view });
        for (const [label, value] of Object.entries(looks)) note(label, pattern, value, { view });
      },
      // A design what it reaches takes, plain data, which the chart's gallery offers too (dendra.md, Group designs).
      design(view, pattern, value) {
        note('Design', pattern, value, { view });
        note('Designs', { kind: 'View' }, { list: [value] });
      },
      // A field a box or a line shows, with its look.
      shown(view, pattern, looks = {}) {
        note('Shown', pattern, true, { view });
        for (const [label, value] of Object.entries(looks)) note(label, pattern, value, { view });
      },
    };
    write(says);
    return out;
  }
  return { register, list, of, begin, exampleOf, rows };
})();
