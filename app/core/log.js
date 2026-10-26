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
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const byTime = (a, b) => a.when < b.when ? -1 : a.when > b.when ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
const validOn = (r, d) => (!r.since || r.since <= d) && (!r.before || d < r.before);
const overlap = (a, b) => (!a.since || !b.before || a.since < b.before) && (!b.since || !a.before || b.since < a.before);
const latest = rows => rows.reduce((a, b) => (b.since ?? '') > (a.since ?? '') ? b : a);
const records = new WeakMap();
const recordOf = row => { let r = records.get(row); if (!r) { const { id, record, ...rest } = row; records.set(row, r = rest); } return r; };
const contents = new WeakMap();
const contentOf = row => { let s = contents.get(row); if (!s) { const { id, ...rest } = row; contents.set(row, s = JSON.stringify(rest)); } return s; };
const argKey = r => Tree.argsOf(r).map(a => JSON.stringify([Tree.norm(a.edge), a.at])).sort().join();

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
  const raw = rawOf(items);
  for (const [id, rs] of items) for (const r of rs) {
    const t = Tree.treeOf(rs.length > 1 ? { ...raw, [id]: recordOf(r) } : raw, id);
    if (t) trees.push(Tree.specOf(t));
  }
  return Tree.schema(trees);
}

function open(data) {
  if (typeof data === 'string') data = JSON.parse(data);
  const changes = new Map(), added = new Map(), removedBy = new Map(), live = new Map(), chartOf = new Map(), subs = new Set();
  // Live rows by content: a reverse brings rows back as fresh copies, which are still as a change left them.
  const twins = new Map(), twinKey = (c, r) => `${c}|${contentOf(r)}`;
  const twin = (c, r) => twins.get(twinKey(c, r))?.values().next().value;
  let cache = new Map(), sorted = null, last = 0;

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
  const changed = cs => { cache = new Map(); sorted = null; subs.forEach(f => f(cs)); };
  const list = () => sorted ??= [...changes.values()].sort(byTime);
  // Times only go forward here, so one author's changes keep their order even within a millisecond.
  const now = () => new Date(last = Math.max(Date.now(), last + 1)).toISOString();

  // What a chart's live rows say, worked out once for each state of the log.
  function chart(c) {
    let d = cache.get(c);
    if (!d) {
      const rows = [...live.values()].filter(r => chartOf.get(r.id) === c), items = new Map(), recs = new Map();
      for (const r of rows) { push(items, itemOf(r), r); if ('record' in r) push(recs, r.record, r); }
      d = { rows, items, records: recs, notes: Notes.index(rows.filter(r => 'note' in r)), days: new Map() };
      cache.set(c, d);
    }
    return d;
  }
  const schema = c => { const d = chart(c); return d.schema ??= schemaOf(d.rows); };
  // A start or end entry, as of the records it's among: 'start', 'end' or nothing.
  const bound = (d, recs, id) => {
    const r = recs[id], t = r.field === 'date' && r.at && recs[r.at] && Tree.treeOf(recs, id);
    return t && (d.notes.isStart(t) ? 'start' : d.notes.isEnd(t) ? 'end' : null);
  };

  // The chart as of a day: the records that hold on it. A record holds when its row is valid on the day,
  // the day is from its start entry and before its end entry, and its locations hold.
  function asOf(c, day = today()) {
    const d = chart(c);
    if (d.days.has(day)) return d.days.get(day);
    const on = {}, out = new Set(), holds = new Map(), state = {};
    for (const [id, rows] of d.records) { const r = rows.find(x => validOn(x, day)); if (r) on[id] = recordOf(r); }
    for (const id of Object.keys(on)) {
      const b = bound(d, on, id);
      if ((b === 'start' && day < on[id].value) || (b === 'end' && day >= on[id].value)) out.add(on[id].at);
    }
    const hold = id => {
      if (!holds.has(id)) { holds.set(id, false); holds.set(id, !!on[id] && !out.has(id) && Tree.argsOf(on[id]).every(a => hold(a.at))); }
      return holds.get(id);
    };
    for (const id of Object.keys(on)) if (hold(id)) state[id] = on[id];
    d.days.set(day, state);
    return state;
  }
  // The days on which something starts or ends, for the date control's strip.
  function days(c) {
    const d = chart(c), raw = rawOf(d.items), set = new Set();
    for (const rows of d.records.values()) for (const r of rows) { if (r.since) set.add(r.since); if (r.before) set.add(r.before); }
    for (const id of Object.keys(raw)) if (bound(d, raw, id)) for (const r of d.records.get(id)) set.add(r.value);
    return [...set].sort();
  }

  // Why a change can't be made, in words, or null. Only what it would newly break counts: two records
  // with one argumentation valid on a common day, an entry at something not there, or a schema at odds.
  function check(c) {
    if (c.removes.some(id => !live.has(id))) return 'It has changed since.';
    const d = chart(c.chart), gone = new Set(c.removes), after = [...d.rows.filter(r => !gone.has(r.id)), ...c.adds];
    const items = new Set(after.map(itemOf)), byArgs = new Map();
    for (const r of after) if ('record' in r && !('kind' in r)) push(byArgs, argKey(r), r);
    for (const r of c.adds) if ('record' in r) {
      if (Tree.argsOf(r).some(a => !items.has(a.at))) return 'Something it’s at no longer exists.';
      if (!('kind' in r) && byArgs.get(argKey(r)).some(x => x.record !== r.record && overlap(x, r)))
        return 'args' in r ? 'That relation is already recorded.' : `${r.edge} is already recorded here.`;
    }
    const now = Tree.schemaError(schemaOf(after));
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
  // added is all still as it left it. Undo reverses your latest change not yet undone; Redo your latest undo.
  const canReverse = id => { const c = changes.get(id); return !!c && c.adds.every(r => twin(c.chart, r)); };
  function reverse(id, who) {
    const c = changes.get(id);
    if (!c) return null;
    if (!canReverse(id)) return 'It has changed since.';
    return apply({ id: newId(), who, when: now(), chart: c.chart, removes: c.adds.map(r => twin(c.chart, r)),
      adds: c.removes.map(rid => ({ ...added.get(rid), id: newId() })), reverses: c.id });
  }
  // An author's undo and redo stacks in a chart, replayed from the log: a reverse of the top of either is
  // an undo or a redo; any other change is an edit, and clears the redo stack.
  function stacks(who, c) {
    const undo = [], redo = [];
    for (const x of list()) if (x.who === who && x.chart === c) {
      if (x.reverses && undo.at(-1)?.id === x.reverses) redo.push(undo.pop() && x);
      else if (x.reverses && redo.at(-1)?.id === x.reverses) undo.push(redo.pop() && x);
      else { undo.push(x); redo.length = 0; }
    }
    return { undo, redo };
  }

  // Items with rows in the log and none live, with the change that removed them, which Restore reverses.
  function deleted(c) {
    const d = chart(c), gone = new Map();
    for (const r of added.values()) if (chartOf.get(r.id) === c && !d.items.has(itemOf(r))) push(gone, itemOf(r), r);
    return [...gone].map(([item, rows]) => {
      const change = list().filter(x => rows.some(r => removedBy.get(r.id) === x.id)).at(-1);
      return { item, type: typeOf(rows[0]), rows: rows.filter(r => removedBy.get(r.id) === change.id), change: change.id };
    });
  }

  // An edit, building one change. With a day shown, an added record starts on it, setting a record's
  // value splits its validity there, and removing ends it there. With none, each corrects.
  function edit({ chart: c, who, day = null, when } = {}) {
    const d = chart(c), items = new Map([...d.items].map(([k, v]) => [k, [...v]])), adds = new Map(), removes = new Set();
    const put = r => { adds.set(r.id, r); push(items, itemOf(r), r); };
    const drop = r => {
      if (!adds.delete(r.id)) removes.add(r.id);
      const rs = items.get(itemOf(r)); rs.splice(rs.indexOf(r), 1); if (!rs.length) items.delete(itemOf(r));
    };
    const all = () => [...items.values()].flat();
    const swap = (r, u) => { if (u !== r) { drop(r); put({ ...u, id: newId() }); } };
    const tx = {
      add(type, payload, id = newId()) { put({ id: newId(), [type]: id, ...payload, ...(type === 'record' && day && { since: day }) }); return id; },
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
      // Renaming relabels every tree like p: records, specifications, notes' patterns and edges, and, where
      // formulas.js offers it, the formulas that use the name.
      rename(p, from, to) {
        const raw = rawOf(items), text = typeof Formulas !== 'undefined' ? Formulas.renameName : null;
        for (const r of all()) {
          if ('record' in r) swap(r, Tree.fits(raw, r.record, p) ? Tree.renamed(r, from, to) : r);
          else if ('spec' in r) { const tree = Tree.rename(r.tree, p, from, to); swap(r, tree === r.tree ? r : { ...r, tree }); }
          else if ('note' in r) {
            const u = { ...r, pattern: Tree.rename(r.pattern, p, from, to) };
            if (r.param && Tree.same(r.param, from) && Tree.narrower(r.pattern, p)) u.param = to;
            if (r.label === 'Formula' && text) u.value = r.value.map(row => ({ ...row, formula: text(row.formula, from, to) }));
            swap(r, JSON.stringify(u) === JSON.stringify(r) ? r : u);
          }
        }
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
      commit: () => adds.size || removes.size
        ? apply({ id: newId(), who, when: when ?? now(), chart: c, removes: [...removes], adds: [...adds.values()] }) : null,
    };
    return tx;
  }

  const wb = {
    apply, edit, asOf, days, schema, canReverse, reverse, stacks, deleted,
    changes: list,
    charts: () => [...live.values()].filter(r => typeOf(r) === 'chart'),
    rows: c => chart(c).rows,
    item: (c, id) => [...chart(c).items.get(id) ?? []].sort((a, b) => (a.since ?? '') < (b.since ?? '') ? -1 : 1),
    notes: c => chart(c).notes,
    undo: (who, c) => { const x = stacks(who, c).undo.at(-1); return x ? reverse(x.id, who) : null; },
    redo: (who, c) => { const x = stacks(who, c).redo.at(-1); return x ? reverse(x.id, who) : null; },
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

return { open, union: (a, b) => open(a).merge(b), newId, today, validOn };
})();
