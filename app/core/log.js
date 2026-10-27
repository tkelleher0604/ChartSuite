// Log: a workbook is its log (dendra.md, Time and Change).
//
// A change is { id, who, when, chart, removes: [row id], adds: [row], reverses? }. A row is a version of an
// item, and names the item under its type: { id, chart, name }, { id, spec, tree }, { id, record, …record },
// { id, note, …note } or { id, shape, … }. A record's row carries its validity: since and before, ISO days,
// either absent. A row is live if a change added it and none removed it, so the order changes arrive in
// doesn't matter, and two logs merge by taking the union of their changes.
const Log = (() => {
const TYPES = ['chart', 'spec', 'record', 'note', 'shape'];
const typeOf = row => TYPES.find(t => t in row);
const itemOf = row => row[typeOf(row)];
const push = (map, k, v) => { if (!map.has(k)) map.set(k, []); map.get(k).push(v); };
let counter = 0;
const newId = () => Date.now().toString(36) + (counter++ % 1296).toString(36).padStart(2, '0') + Math.random().toString(36).slice(2, 6);
const today = () => Tree.isoOf(new Date());
const byTime = (a, b) => a.when < b.when ? -1 : a.when > b.when ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
const validOn = (r, d) => (!r.since || r.since <= d) && (!r.before || d < r.before);
const overlap = (a, b) => (!a.since || !b.before || a.since < b.before) && (!b.since || !a.before || b.since < a.before);
const latest = rows => rows.reduce((a, b) => (b.since ?? '') > (a.since ?? '') ? b : a);
const records = new WeakMap();
const recordOf = row => { let r = records.get(row); if (!r) { const { id, record, ...rest } = row; records.set(row, r = rest); } return r; };
const contents = new WeakMap();
const contentOf = row => { let s = contents.get(row); if (!s) { const { id, ...rest } = row; contents.set(row, s = JSON.stringify(rest)); } return s; };
const argKey = r => Tree.argsOf(r).map(a => JSON.stringify([Tree.norm(a.edge), a.at])).sort().join();
// A row's content, whatever order its keys were written in.
const content = ({ id, ...rest }) => JSON.stringify(rest, (k, v) => v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : v);

// The records whose rows are valid on a day, by id, of `records`, each record's rows.
function validAt(records, day) {
  const on = {};
  for (const [id, rows] of records) if ('record' in rows[0]) { const r = rows.find(x => validOn(x, day)); if (r) on[id] = recordOf(r); }
  return on;
}
// What a record keeps out of the chart on a day, as a start or an end entry (dendra.md, Time): what it's at, where
// it's a start after the day, or an end on it or before; or nothing. `recs`, the records it's among.
function outOn(notes, recs, id, day) {
  const r = recs[id], t = r.field === 'date' && r.at && recs[r.at] && Tree.treeOf(recs, id);
  return t && ((notes.isStart(t) && day < r.value) || (notes.isEnd(t) && day >= r.value)) ? r.at : null;
}
// Of the records valid on a day (`on`, by id), those that hold on it: each from its start entry and before its end
// entry, as the chart's notes say which those are, and with its locations holding.
function holding(notes, on, day) {
  const out = new Set(), holds = new Map(), state = {};
  for (const id of Object.keys(on)) { const x = outOn(notes, on, id, day); if (x) out.add(x); }
  const hold = id => {
    if (!holds.has(id)) { holds.set(id, false); holds.set(id, !!on[id] && !out.has(id) && Tree.argsOf(on[id]).every(a => hold(a.at))); }
    return holds.get(id);
  };
  for (const id of Object.keys(on)) if (hold(id)) state[id] = on[id];
  return state;
}

// Each record as its latest version, for what doesn't depend on the day: dependents, renaming, the schema.
function rawOf(items) {
  const out = {};
  for (const [id, rows] of items) if ('record' in rows[0]) out[id] = recordOf(latest(rows));
  return out;
}
// The schema of a chart's rows: its specifications, and every version's of every record, with locations.
function schemaOf(rows) {
  const items = new Map(), trees = [];
  for (const r of rows) if ('record' in r) push(items, r.record, r); else if ('spec' in r) trees.push(r.tree);
  const raw = rawOf(items), own = r => 'kind' in r ? { kind: r.kind }
    : { out: 'field' in r ? { field: r.field } : 'choice' in r ? { choice: r.choice } : { tag: r.tag } };
  for (const [id, rs] of items) { const t = Tree.treeOf(raw, id); if (t) for (const r of rs) trees.push({ ...Tree.specOf(t), ...own(r) }); }
  return Tree.schema(trees);
}
// Whether rows removed and added leave the schema of a chart's records (`records`, each one's rows) as it was: no
// specification among them, and each record they touch still there, its versions of the shapes they were, and
// its latest of the shape it was, so every tree schemaOf takes is as it was. Only values and periods change so.
const shapeOf = r => JSON.stringify([r.kind, r.field, r.choice, r.tag, r.at, r.edge, r.args]);
function sameSchema(records, removed, adds) {
  if ([...removed, ...adds].some(r => 'spec' in r)) return false;
  const gone = new Set(removed.map(r => r.id)), shapes = rs => new Set(rs.map(shapeOf));
  for (const id of new Set([...removed, ...adds].filter(r => 'record' in r).map(r => r.record))) {
    const was = records.get(id) ?? [], now = [...was.filter(r => !gone.has(r.id)), ...adds.filter(r => r.record === id)], a = shapes(was), b = shapes(now);
    if (!was.length || !now.length || a.size !== b.size || [...a].some(s => !b.has(s)) || shapeOf(latest(was)) !== shapeOf(latest(now))) return false;
  }
  return true;
}

function open(data) {
  if (typeof data === 'string') data = JSON.parse(data);
  const changes = new Map(), added = new Map(), removedBy = new Map(), live = new Map(), chartOf = new Map(), subs = new Set();
  // Live rows by content: a reverse brings rows back as fresh copies, which are still as a change left them.
  const twins = new Map(), twinKey = (c, r) => `${c}|${contentOf(r)}`;
  const twin = (c, r) => twins.get(twinKey(c, r))?.values().next().value;
  let cache = new Map(), carried = new Map(), sorted = null, last = 0;

  function take(c) {
    if (changes.has(c.id)) return false;
    changes.set(c.id, c);
    for (const id of c.removes) {
      removedBy.set(id, c.id);
      if (live.delete(id)) twins.get(twinKey(chartOf.get(id), added.get(id))).delete(id);
    }
    for (const r of c.adds) {
      added.set(r.id, r); chartOf.set(r.id, c.chart);
      if (removedBy.has(r.id)) continue;
      live.set(r.id, r);
      const k = twinKey(c.chart, r);
      (twins.get(k) ?? twins.set(k, new Set()).get(k)).add(r.id);
    }
    last = Math.max(last, Date.parse(c.when) || 0);
    return true;
  }
  // What changes leave as it was is kept: a chart's whole reading, where none is of it; its notes, where none of
  // its rows they add or remove is a note; and its schema, where a change of it gives its records only other
  // values or periods.
  const changed = cs => {
    const was = cache;
    cache = new Map(); carried = new Map(); sorted = null;
    for (const [c, d] of was) {
      const mine = cs.filter(x => x.chart === c), removed = mine.flatMap(x => x.removes.map(id => added.get(id)).filter(Boolean)), adds = mine.flatMap(x => x.adds);
      if (!mine.length) cache.set(c, d);
      else carried.set(c, { notes: [...removed, ...adds].every(r => !('note' in r)) ? d.notes : null,
        schema: mine.length === 1 && d.schema && sameSchema(d.records, removed, adds) ? d.schema : null });
    }
    subs.forEach(f => f(cs));
  };
  const list = () => sorted ??= [...changes.values()].sort(byTime);
  // Times only go forward here, so one author's changes keep their order even within a millisecond.
  const now = () => new Date(last = Math.max(Date.now(), last + 1)).toISOString();

  // What a chart's live rows say, worked out once for each state of the log.
  function chart(c) {
    let d = cache.get(c);
    if (!d) {
      const rows = [...live.values()].filter(r => chartOf.get(r.id) === c), items = new Map(), recs = new Map(), kept = carried.get(c);
      for (const r of rows) { push(items, itemOf(r), r); if ('record' in r) push(recs, r.record, r); }
      d = { rows, items, records: recs, notes: kept?.notes ?? Notes.index(rows.filter(r => 'note' in r)), days: new Map(), ...kept?.schema && { schema: kept.schema } };
      cache.set(c, d);
    }
    return d;
  }
  const schema = c => { const d = chart(c); return d.schema ??= schemaOf(d.rows); };
  // The chart as of a day: the records that hold on it. A record holds when its row is valid on the day,
  // the day is from its start entry and before its end entry, and its locations hold.
  function asOf(c, day = today()) {
    const d = chart(c);
    if (d.days.has(day)) return d.days.get(day);
    const state = holding(d.notes, validAt(d.records, day), day);
    d.days.set(day, state);
    return state;
  }
  // Why a change can't be made, in words, or null. Only what it would newly break counts: two records
  // with one argumentation valid on a common day, an entry at something not there, or a schema at odds.
  function check(c) {
    if (c.removes.some(id => !live.has(id))) return 'It has changed since.';
    const d = chart(c.chart), gone = new Set(c.removes), after = [...d.rows.filter(r => !gone.has(r.id)), ...c.adds];
    const there = id => c.adds.some(r => itemOf(r) === id) || (d.items.get(id) ?? []).some(r => !gone.has(r.id));
    // The records an added one could share its argumentation with: those at one of its locations.
    const near = new Set(c.adds.filter(r => 'record' in r).flatMap(r => Tree.argsOf(r).map(a => a.at))), byArgs = new Map();
    for (const r of after) if ('record' in r && !('kind' in r) && (r.at ? near.has(r.at) : r.args.some(a => near.has(a.at)))) push(byArgs, argKey(r), r);
    for (const r of c.adds) if ('record' in r) {
      if (Tree.argsOf(r).some(a => !there(a.at))) return 'Something it’s at no longer exists.';
      if (!('kind' in r) && byArgs.get(argKey(r)).some(x => x.record !== r.record && overlap(x, r)))
        return 'args' in r ? 'That relation is already recorded.' : `${r.edge} is already recorded here.`;
    }
    const now = c.adds.some(r => 'record' in r || 'spec' in r) && !sameSchema(d.records, c.removes.map(id => added.get(id)), c.adds) && Tree.schemaError(schemaOf(after));
    return now && now !== Tree.schemaError(schema(c.chart)) ? now : null;
  }
  function apply(c) {
    const problem = check(c);
    if (problem) return problem;
    take(c);
    changed([c]);
    return c;
  }

  // The reverse of a change removes what it added and adds fresh copies of what it removed, while what it
  // added is all still as it left it. Undo and Redo, a window's own, are reverses; so is undoing an older one.
  const canReverse = id => { const c = changes.get(id); return !!c && c.adds.every(r => twin(c.chart, r)); };
  function reverse(id, who) {
    const c = changes.get(id);
    if (!c) return null;
    if (!canReverse(id)) return 'It has changed since.';
    return apply({ id: newId(), who, when: now(), chart: c.chart, removes: c.adds.map(r => twin(c.chart, r)),
      adds: c.removes.map(rid => ({ ...added.get(rid), id: newId() })), reverses: c.id });
  }

  // Items with rows in the log and none live, each with the change that deleted it, the last to remove one of
  // its rows, and the rows it removed.
  const deleter = rows => rows.map(r => changes.get(removedBy.get(r.id))).reduce((a, b) => byTime(a, b) < 0 ? b : a);
  function deleted(c) {
    const d = chart(c), gone = new Map();
    for (const r of added.values()) if (chartOf.get(r.id) === c && !d.items.has(itemOf(r))) push(gone, itemOf(r), r);
    return [...gone].map(([item, rows]) => {
      const change = deleter(rows);
      return { item, type: typeOf(rows[0]), rows: rows.filter(r => removedBy.get(r.id) === change.id), change: change.id };
    });
  }
  // Restoring an item deleted brings back what the change that deleted it took of it, and of what was at it then
  // (the records at it, at any depth, and the notes and shapes at those or in it), as fresh copies, in a change
  // that removes nothing and says what it restores: the change that deleted it. Whatever else that change did
  // stands. What was at it and at something still deleted stays deleted, to come back with that; and the item
  // can't come back without what it's at.
  function restore(c, item, who) {
    const d = chart(c), rows = [...added.values()].filter(r => chartOf.get(r.id) === c && itemOf(r) === item);
    if (!rows.length || d.items.has(item)) return null;
    const by = deleter(rows), took = by.removes.map(id => added.get(id)).filter(r => !d.items.has(itemOf(r)));
    const items = new Map();
    for (const r of took) push(items, itemOf(r), r);
    const raw = rawOf(items), at = Tree.dependents(raw, [item]), back = new Set([item]), there = id => back.has(id) || d.items.has(id);
    for (let more = true; more;) {
      more = false;
      for (const id of at) if (!back.has(id) && items.get(id).every(r => Tree.argsOf(r).every(a => there(a.at)))) { back.add(id); more = true; }
    }
    const comes = r => {
      if (itemOf(r) === item || 'record' in r) return back.has(itemOf(r));
      const ids = [...Tree.idsIn(r.pattern ?? {}), ...(r.view ? [r.view] : [])];
      return ('note' in r || 'shape' in r) && ids.some(id => at.has(id)) && ids.every(there);
    };
    return apply({ id: newId(), who, when: now(), chart: c, removes: [], adds: took.filter(comes).map(r => ({ ...r, id: newId() })), restores: by.id });
  }

  // Live rows that disagree (dendra.md, Change): versions of one item that differ and are valid on a common
  // day, or records of two items with one argumentation. Each group with who made each row, the earliest first.
  function disagreements(c) {
    const d = chart(c);
    return d.disagree ??= (() => {
      const made = new Map(), groups = new Map(), up = new Map(d.rows.map(r => [r.id, r.id]));
      for (const x of list()) if (x.chart === c) for (const r of x.adds) made.set(r.id, x);
      const top = id => up.get(id) === id ? id : top(up.get(id));
      for (const r of d.rows) {
        push(groups, `item ${itemOf(r)}`, r);
        if ('record' in r && !('kind' in r)) push(groups, `args ${argKey(r)}`, r);
      }
      for (const [k, g] of groups) for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) {
        const a = g[i], b = g[j];
        if (overlap(a, b) && (k.startsWith('item') ? content(a) !== content(b) : a.record !== b.record)) up.set(top(a.id), top(b.id));
      }
      const sets = new Map();
      for (const r of d.rows) push(sets, top(r.id), r);
      return [...sets.values()].filter(s => s.length > 1).map(s => ({ rows: s
        .map(row => { const x = made.get(row.id); return { row, who: x?.who, when: x?.when, change: x?.id }; })
        .sort((a, b) => a.when < b.when ? -1 : a.when > b.when ? 1 : 0) }));
    })();
  }

  // An edit, building one change. With a day shown, an added record starts on it, setting a record's
  // value splits its validity there, and removing ends it there. With none, each corrects. `ids`, a list, names the
  // items it adds, in order, each past its end added to it: so an edit made as another was is that one, ids and all.
  function edit({ chart: c, who, day = null, when, ids = null } = {}) {
    const d = chart(c), items = new Map([...d.items].map(([k, v]) => [k, [...v]])), adds = new Map(), removes = new Set();
    let named = 0;
    const name = () => !ids ? newId() : named < ids.length ? ids[named++] : (ids[named++] = newId());
    const put = r => { adds.set(r.id, r); push(items, itemOf(r), r); };
    const drop = r => {
      if (!adds.delete(r.id)) removes.add(r.id);
      const rs = items.get(itemOf(r)); rs.splice(rs.indexOf(r), 1); if (!rs.length) items.delete(itemOf(r));
    };
    const all = () => [...items.values()].flat();
    const swap = (r, u) => { if (u !== r) { drop(r); put({ ...u, id: newId() }); } };
    // Every Formula row that cites a name, citing the new one, where formulas.js offers renameName.
    const reword = (from, to) => {
      const text = typeof Formulas !== 'undefined' ? Formulas.renameName : null;
      if (text) for (const r of all()) if ('note' in r && r.label === 'Formula') {
        const value = r.value.map(row => ({ ...row, formula: text(row.formula, from, to) }));
        swap(r, JSON.stringify(value) === JSON.stringify(r.value) ? r : { ...r, value });
      }
    };
    const tx = {
      add(type, payload, id = name()) { put({ id: newId(), [type]: id, ...payload, ...(type === 'record' && day && { since: day }) }); return id; },
      set(id, payload) {
        const rs = items.get(id);
        if (!rs) return;
        const type = typeOf(rs[0]), fresh = extra => put({ id: newId(), [type]: id, ...payload, ...extra });
        if (type !== 'record') { rs.slice().forEach(drop); return fresh({}); }
        const r = rs.find(x => validOn(x, day ?? today())) ?? latest(rs);
        drop(r);
        if (day && validOn(r, day) && r.since !== day) { put({ ...r, id: newId(), before: day }); fresh({ since: day, ...(r.before && { before: r.before }) }); }
        else fresh({ ...(r.since && { since: r.since }), ...(r.before && { before: r.before }) });
      },
      remove(id) {
        const rs = items.get(id);
        if (!rs) return;
        if (!('record' in rs[0])) return rs.slice().forEach(drop);
        const gone = Tree.dependents(rawOf(items), [id]);
        // A removed object's notes, and a removed view's notes and shapes, are its dependents.
        if (!day) for (const r of all()) if (('note' in r || 'shape' in r) && (gone.has(r.view) || [...Tree.idsIn(r.pattern ?? {})].some(x => gone.has(x)))) drop(r);
        for (const x of gone) for (const r of (items.get(x) ?? []).slice()) {
          if (!day || (r.since && r.since >= day)) drop(r);
          else if (!r.before || r.before > day) swap(r, { ...r, before: day });
        }
      },
      // A note at exactly this pattern (and view and param): set to `value`, or removed when it's undefined.
      // A Name that changes renames it in the formulas that cite it.
      note(label, pattern, value, { view, param } = {}) {
        const k = Tree.key(pattern);
        const old = all().find(r => 'note' in r && r.label === label && (r.view ?? null) === (view ?? null) && (r.param ?? null) === (param ?? null) && Tree.key(r.pattern) === k);
        if (value === undefined || value === null) { if (old) drop(old); return; }
        if (old && JSON.stringify(old.value) === JSON.stringify(value)) return;
        const row = { label, pattern, ...(view && { view }), ...(param && { param }), value };
        if (old) tx.set(old.note, row); else tx.add('note', row);
        if (label === 'Name' && !view && typeof old?.value === 'string' && typeof value === 'string') reword(old.value, value);
      },
      // A new version with these changes: of a record, the version in force on the day.
      update(id, changes) {
        const rs = items.get(id);
        if (!rs) return;
        const type = typeOf(rs[0]), r = type === 'record' ? rs.find(x => validOn(x, day ?? today())) ?? latest(rs) : rs[0];
        const { id: _, [type]: __, since, before, ...p } = r;
        tx.set(id, { ...p, ...changes });
      },
      // Settles a disagreement by keeping this row: the rows that disagree with it go.
      keep(rowId) {
        const g = disagreements(c).find(x => x.rows.some(y => y.row.id === rowId));
        for (const { row } of g?.rows ?? []) if (row.id !== rowId) drop(row);
      },
      // Renaming relabels every tree like p: records, specifications, notes' patterns and edges, a table's rows,
      // and the formulas that cite the name.
      rename(p, from, to) {
        const raw = rawOf(items);
        for (const r of all()) {
          if ('record' in r) swap(r, Tree.fits(raw, r.record, p) ? Tree.renamed(r, from, to) : r);
          else if ('spec' in r) { const tree = Tree.rename(r.tree, p, from, to); swap(r, tree === r.tree ? r : { ...r, tree }); }
          else if ('note' in r) {
            const u = { ...r, pattern: Tree.rename(r.pattern, p, from, to) };
            if (r.param && Tree.same(r.param, from) && Tree.narrower(r.pattern, p)) u.param = to;
            if (r.label === 'Layout' && typeof r.value?.rows === 'object') u.value = { ...r.value, rows: Tree.rename(r.value.rows, p, from, to) };
            swap(r, JSON.stringify(u) === JSON.stringify(r) ? r : u);
          }
        }
        reword(from, to);
      },
      // Moving up a level: every record like p, an entry at an entry, moves to its location's location, and
      // so do the specifications and notes' patterns like it.
      moveUp(p) {
        const raw = rawOf(items);
        for (const r of all()) {
          if ('record' in r) swap(r, raw[r.at]?.at && Tree.fits(raw, r.record, p) ? { ...r, at: raw[r.at].at } : r);
          else if ('spec' in r) { const tree = Tree.lift(r.tree, p); swap(r, tree === r.tree ? r : { ...r, tree }); }
          else if ('note' in r) { const pattern = Tree.lift(r.pattern, p); swap(r, pattern === r.pattern ? r : { ...r, pattern }); }
        }
      },
      // The chart as it would leave it, unmade, as of a day: what asOf would read then, start and end entries and
      // locations included, every record it leaves as it was the very one asOf has.
      asOf: on => holding(d.notes, validAt(items, on), on),
      commit: () => adds.size || removes.size
        ? apply({ id: newId(), who, when: when ?? now(), chart: c, removes: [...removes], adds: [...adds.values()] }) : null,
    };
    return tx;
  }

  const wb = {
    apply, edit, asOf, schema, canReverse, reverse, deleted, restore, disagreements,
    changes: list,
    charts: () => [...live.values()].filter(r => typeOf(r) === 'chart'),
    rows: c => chart(c).rows,
    item: (c, id) => [...chart(c).items.get(id) ?? []].sort((a, b) => (a.since ?? '').localeCompare(b.since ?? '')),
    notes: c => chart(c).notes,
    // Their changes and these, together; for a file or SharePoint, read theirs, merge, write back.
    merge(other) { const fresh = changesOf(other).filter(take); if (fresh.length) changed(fresh); return wb; },
    // The log as it stood at a moment: the changes made by then.
    at: moment => open(list().filter(c => c.when <= moment)),
    subscribe: f => (subs.add(f), () => subs.delete(f)),
    toJSON: () => ({ dendra: 1, changes: list() }),
  };
  changesOf(data).forEach(take);
  return wb;
}
const changesOf = x => !x ? [] : Array.isArray(x) ? x : typeof x.changes === 'function' ? x.changes() : x.changes ?? [];

return { open, newId, today, validOn, typeOf, latest, outOn };
})();
