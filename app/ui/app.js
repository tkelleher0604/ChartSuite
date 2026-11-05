// The open workbook, and what every part reads from it and changes it through (shell.js lists the API).
const App = (() => {
  const { signal, computed, effect, batch } = preactSignals;
  const { html, store } = Shell;

  // Empty until Store has opened the workbook, which the launch screen covers.
  const book = signal(Log.open({ dendra: 1, changes: [] }));
  const version = signal(0);
  // The chart shown is the one the view shown is of: the address names the view, so a reload, a link, and Back and
  // Forward each open its chart. Before a view is shown, or with one the workbook hasn't, it's the chart shown last,
  // or else the first.
  let lastChart = null;
  const chart = computed(() => {
    const wb = book.value, v = Shell.view.value, ids = wb.charts().map(c => c.chart), has = c => ids.includes(c);
    return lastChart = (v && [lastChart, ...ids].find(c => has(c) && (wb.item(c, v).length || looks.value[c]?.[v]))) || (has(lastChart) ? lastChart : ids[0] ?? null);
  });
  let unsubscribe = null;
  function use(wb) {
    // The layouts this browser keeps, so a reload lays out again nothing it laid out before.
    if (typeof Layout !== 'undefined') Layout.keepIn(store);
    // Another workbook: nothing of the last one is selected, and it shows as it is now; a change pending in it goes,
    // saying so.
    if (unsubscribe) { if (pending.peek()) drop(pending.peek(), ''); Shell.select([], { replace: true }); Shell.at(null, { replace: true }); unsubscribe(); }
    unsubscribe = wb.subscribe(() => { version.value++; });
    book.value = wb;
    version.value++;
    listBooks();
  }
  Store.open({ sample: SAMPLE }).then(use, () => use(Log.open(SAMPLE)));

  const who = () => Store.who() || 'You';
  // Today, which turns over at midnight with the window open, so a page and what's said of it never show two days.
  const today = signal(Log.today());
  setInterval(() => { if (today.peek() !== Log.today()) today.value = Log.today(); }, 30000);
  // The day shown: the one asked for; of the log as it stood, the day of that moment, for everything was as it was; else today.
  const day = computed(() => { const t = Shell.time.value; return t?.asOf ?? (t?.stood ? Tree.isoOf(new Date(t.at ?? book.value.changes().find(c => c.id === t.stood)?.when ?? Date.now())) : today.value); });
  // Viewing or Editing, the window's (dendra.md, Workbook): each chart's, for this tab; a chart opens as this browser was
  // told to open it, or else in Editing. Viewing, nothing writes.
  const modes = signal((() => { try { return JSON.parse(sessionStorage.getItem('dendra.modes')) ?? {}; } catch { return {}; } })());
  const opensKey = c => `viewing.${c}`, opensSaid = signal(0);
  const opensViewing = computed(() => { opensSaid.value; return !!chart.value && store.get(opensKey(chart.value)) === '1'; });
  const viewing = computed(() => !!chart.value && (modes.value[chart.value] ?? opensViewing.value));
  function setViewing(on) {
    modes.value = { ...modes.peek(), [chart.peek()]: on };
    try { sessionStorage.setItem('dendra.modes', JSON.stringify(modes.peek())); } catch {}
  }
  function setOpensViewing(on) {
    store.set(opensKey(chart.peek()), on ? '1' : null);
    opensSaid.value++;
    if (on) setViewing(true);
  }
  // In History, the workbook as it stood just after the change picked, which can't be changed; and in Viewing.
  const readOnly = computed(() => !!Shell.time.value?.stood || viewing.value);
  // Why it can't be changed now, as a toast says it.
  const whyNot = () => Shell.time.peek()?.stood ? 'Can’t change the past' : 'Viewing: switch to Editing to change this';
  const refuse = () => { Shell.toast(whyNot()); return null; };
  // What can still be asked, though nothing can be made: a look and a what-if, in Editing and Viewing alike, never of the past.
  const canAsk = () => !Shell.time.value?.stood;
  const seeing =() => viewing.value && !Shell.time.value?.stood;

  // ---- Looks (dendra.md, Workbook): what a person does only to see, which is this window's, in no log, signed by no one and
  // no step of Undo's from an edit. By chart and view, for the tab: `only`, the boxes shown; `filters`, what's kept by what a
  // box knows; `ticks`, a record shown or hidden one by one (Viewing's Hidden list); `compare`, what it's compared with, and
  // `table`, a table opened to read, each with `change`, a change kept here and read over the log. Keep makes one the chart's.
  const LOOKS = 'dendra.looks';
  const looks = signal((() => { try { return JSON.parse(sessionStorage.getItem(LOOKS)) ?? {}; } catch { return {}; } })());
  const lookOf = (view, c = chart.peek()) => looks.peek()[c]?.[view] ?? null;
  const putLook = (c, view, l) => {
    const by = { ...looks.peek()[c] };
    if (l && Object.keys(l).length) by[view] = l; else delete by[view];
    looks.value = { ...looks.peek(), [c]: by };
    try { sessionStorage.setItem(LOOKS, JSON.stringify(looks.peek())); } catch {}
  };
  // A change as a look: what it would remove and add, unmade.
  const lookChange = fn => { const c = chart.peek(), tx = book.peek().edit({ chart: c, who: who(), ids: [] }); fn(tx); const m = tx.made(); return m.adds.length || m.removes.length ? { id: Log.newId(), who: who(), when: new Date().toISOString(), chart: c, ...m } : null; };
  // Undo's steps of them, this window's, apart from its steps of changes: taken back in Viewing, or where there's no change of yours to take.
  const lookSteps = signal({}), lookStepsOf = c => lookSteps.value[c] ?? { undo: [], redo: [] };
  function lookStep(say, undo, redo) { const c = chart.peek(); lookSteps.value = { ...lookSteps.peek(), [c]: { undo: [...lookStepsOf(c).undo, { say, undo, redo }], redo: [] } }; }
  // A look given a view: what's given and not undefined kept, what's undefined let go; one step back.
  function looking(view, patch, say) {
    const c = chart.peek(), was = lookOf(view, c), now = { ...was, ...patch };
    for (const k of Object.keys(now)) if (now[k] === undefined || now[k] === null) delete now[k];
    if (JSON.stringify(was ?? {}) === JSON.stringify(now)) return;
    putLook(c, view, now);
    lookStep(say, () => putLook(c, view, was), () => putLook(c, view, now));
  }
  // A look kept, gone as a look, with no step: what it said is the chart's now.
  const letGo = (view, ...keys) => { const c = chart.peek(), l = { ...lookOf(view, c) }; for (const k of keys) delete l[k]; putLook(c, view, l); };
  // What a box knows, as a table's columns know its row: its kind, and each entry down from it by its path, as it reads there.
  const KIND = '$kind';
  function valueAt(st, id, key) {
    if (key === KIND) return st[id]?.kind ?? null;
    let at = id;
    for (const e of key.split(' › ')) { at = Tree.entryAt(st, at, e); if (!at) return null; }
    return Tree.outputText(st[at]) || null;
  }
  // Each object the look keeps off the page, and each it shows, by id, as of `st` (Scene's `seen`); null where there's none.
  function seenIn(view, st) {
    if (Shell.time.value?.stood) return null;
    const l = looks.value[chart.value]?.[view];
    if (!l || !(l.only || l.filters?.length || l.ticks)) return null;
    const m = new Map(Object.entries(l.ticks ?? {})), recs = st ?? state.value, only = l.only && new Set(l.only);
    if (only || l.filters?.length) for (const id in recs) {
      if (m.has(id) || recs[id].kind === undefined || Tree.isView(recs[id])) continue;
      if ((only && !only.has(id)) || l.filters?.some(f => !f.values.includes(valueAt(recs, id, f.key)))) m.set(id, false);
    }
    return m.size ? m : null;
  }
  // One by one (the Hidden list's ticks, Hide in this view), as Viewing has them.
  function see(view, ids, on) {
    const l = lookOf(view), ticks = { ...l?.ticks };
    for (const id of ids) ticks[id] = on;
    looking(view, { ticks: Object.keys(ticks).length ? ticks : undefined }, `${on ? 'Showed' : 'Hid'} ${ids.length === 1 ? notes.peek().nameOf(state.peek(), ids[0]) : `${ids.length} boxes`}`);
  }
  // The boxes alone, whatever else the look had kept off, as Show only these asks.
  const showOnly = (view, ids, say) => looking(view, { only: ids, filters: undefined, ticks: undefined }, say);
  // What's kept by a value of what a box knows, or not by that any more.
  function filterBy(view, key, label, values) {
    const rest = (lookOf(view)?.filters ?? []).filter(f => f.key !== key), filters = values ? [...rest, { key, label, values }] : rest;
    looking(view, { filters: filters.length ? filters : undefined, only: undefined }, values ? `Filtered by ${label}` : `Took the filter off ${label}`);
  }
  // Back to what the page has, nothing that was never on it added.
  const showAll = view => looking(view, { only: undefined, filters: undefined, ticks: undefined }, 'Showed all');
  // The look's boxes made the page's, as one change: each it keeps off hidden by its own note.
  function keepShown(view) {
    const m = seenIn(view), name = views.peek().find(v => v.id === view)?.name;
    if (!m) return;
    // (Only what the page draws, or what's shown over what it doesn't: nothing need be said of what was never on it.)
    const drawn = drawnPage.peek(), writes = [...m].filter(([id, on]) => state.peek()[id] && (on || drawn?.byId.has(id))), hid = writes.filter(([, on]) => !on).map(([id]) => id);
    if (!change(tx => { for (const [id, on] of writes) tx.note('Shown', Tree.treeOf(state.peek(), id), on, { view }); }, { dated: false, say: `Hid ${hid.length === 1 ? notes.peek().nameOf(state.peek(), hid[0]) : `${hid.length} boxes`} in ${name}` })) return;
    letGo(view, 'only', 'filters', 'ticks');
  }
  // A table opened to read: a tab of this window, made as a view is, which Keep makes the chart's and Close takes away.
  function lookTable(name, rows, why = false) {
    const taken = new Set(views.peek().map(v => Tree.norm(v.name)));
    let n = name, i = 2;
    while (taken.has(Tree.norm(n))) n = `${name} ${i++}`;
    const id = Log.newId(), made = lookChange(tx => writeView(tx, id, n, rows, { why }));
    looking(id, { table: { name: n, rows, why, change: made } }, `Opened ${n}`);
    return id;
  }
  function closeLook(view) {
    if (Shell.view.peek() === view) Shell.show(views.peek().find(v => v.id !== view && !v.look)?.id ?? null);
    putLook(chart.peek(), view, null);
  }
  // Kept: the same view, as one change, its id and all, so how it's sorted and what's asked of it stay.
  function keepTable(view) {
    const t = lookOf(view)?.table;
    if (!t) return;
    if (readOnly.peek()) return refuse();
    // (As one, so it's never for a moment gone from under the tab shown.)
    batch(() => {
      const c = change(tx => writeView(tx, view, t.name, t.rows, { why: t.why, order: true }), { dated: false, say: `Kept the table ${t.name}` });
      if (c) putLook(chart.peek(), view, null);
    });
  }
  // The log with what's looked at read over it. Kept with what it's of: another change only merged, as the log itself takes one.
  let over = null;
  const overlaid = computed(() => {
    const wb = book.value, by = looks.value[chart.value];
    version.value;
    const more = by ? Object.values(by).flatMap(l => [l.table?.change, l.compare?.change]).filter(Boolean) : [];
    if (!more.length) { over = null; return null; }
    if (over?.wb !== wb || over.more.length !== more.length || over.more.some((x, i) => x !== more[i])) over = { wb, more, log: Log.open([...wb.changes(), ...more]) };
    else over.log.merge(wb.changes());
    return over.log;
  });
  const stood = computed(() => {
    const t = Shell.time.value;
    if (!t?.stood) return null;
    const wb = book.value;
    return wb.at(t.at ?? wb.changes().find(c => c.id === t.stood)?.when);
  });
  const shown = computed(() => { version.value; return stood.value ?? overlaid.value ?? book.value; });
  const entered = computed(() => { version.value; return chart.value ? shown.value.asOf(chart.value, day.value) : {}; });
  // The notes and the schema are kept while they say the same, so what's worked out from them is kept too:
  // the notes while no note changes, the schema while no record's shape does.
  const keptWhile = (key, make) => { let k, v; return computed(() => { const now = key(); if (v === undefined || now !== k) { k = now; v = make(); } return v; }); };
  const schemaNow = computed(() => { version.value; return chart.value ? shown.value.schema(chart.value) : {}; });
  const schema = keptWhile(() => JSON.stringify(schemaNow.value), () => schemaNow.value);
  const notes = keptWhile(() => { version.value; return chart.value ? `${chart.value}|${shown.value.rows(chart.value).filter(r => 'note' in r).map(r => r.id)}` : ''; },
    () => chart.peek() ? shown.peek().notes(chart.peek()) : Notes.index([]));
  // The formulas work the chart out from its Formula notes, and its relations' names and lists, each time
  // from the working-out before (see Formulas.computeState).
  const definitions = computed(() => notes.value.definitions(schema.value));
  const relations = computed(() => notes.value.relations(schema.value));
  let worked;
  // What the rules read besides what's entered: the relations and the schema, the day shown, which TODAY() is (dendra.md, Definitions: Today), and
  // what each record has been called, by which a rule can point at it.
  const namesOn = d => ({ relations: relations.peek(), schema: schema.peek(), day: d, named: shown.peek().named(chart.peek()) });
  const result = computed(() => { relations.value; schema.value; day.value; shown.value; return worked = Formulas.computeState(entered.value, definitions.value, chart.value ? namesOn(day.peek()) : { relations: relations.value, schema: schema.value }, worked); });
  // Another day's working-out, as showing it would work it out: what the canvas lays out ahead for a day typed in the
  // date control. Shown then, it's worked out again from the same, which gives this one (Formulas.computeState).
  const workOn = d => chart.peek() ? Formulas.computeState(shown.peek().asOf(chart.peek(), d), definitions.peek(), namesOn(d), worked) : null;
  // The same, kept with what's entered that day while the log stands: an export's pages, each at its own day.
  const workedOn = new WeakMap();
  const workAt = d => { if (d === day.peek()) return result.peek(); const e = shown.peek().asOf(chart.peek(), d); return workedOn.get(e) ?? workedOn.set(e, workOn(d)).get(e); };
  const state = computed(() => result.value.records);
  // A record or a shape a change takes away (a deadline once paid, a shape added and undone) leaves the
  // selection with it, and a Key's row with its Key; a record only not there on the day or at the moment shown
  // stays selected, as does one a change has made start after the day shown (a Formation Date typed past it).
  const shapes = computed(() => { version.value; return new Set(chart.value ? shown.value.rows(chart.value).filter(r => 'shape' in r).map(r => r.shape) : []); });
  let held = null;
  effect(() => {
    const now = { at: `${chart.value} ${JSON.stringify(Shell.time.value)}`, st: state.value, shapes: shapes.value }, was = held;
    held = now;
    const there = (h, k) => { const id = k.split(/[@#]/)[0]; return id in h.st || h.shapes.has(id); };
    const keys = Shell.selection.peek(), gone = k => there(was, k) && !there(now, k) && !heldFrom(k.split(/[@#]/)[0]);
    if (was?.at === now.at && keys.some(gone)) Shell.select(keys.filter(k => !gone(k)), { replace: true });
  });
  // The first day after the day shown on which a record not in the chart then holds: the first of its rows', or those of
  // what it's at, or of a date given at any of them (its start entry's), on which the chart has it. null where there's
  // none (it's ended, deleted, or never was).
  function heldFrom(id, d = day.peek()) {
    const wb = shown.peek(), c = chart.peek();
    if (!c || !id || entered.peek()[id] || !wb.item(c, id).length) return null;
    const days = new Set(), up = [id], seen = new Set();
    for (let i = 0; i < up.length; i++) if (!seen.has(up[i])) { seen.add(up[i]); for (const r of wb.item(c, up[i])) { if (r.since > d) days.add(Tree.firstDay(r.since)); up.push(...Tree.argsOf(r).map(a => a.at)); } }
    for (const r of wb.rows(c)) if ('record' in r && seen.has(r.at) && r.field === 'date' && r.value > d) days.add(Tree.firstDay(r.value));
    return [...days].sort().find(x => wb.asOf(c, x)[id]) ?? null;
  }
  // What a record selected that starts after the day shown will be then, its entries and its relations to what the chart
  // has now, as of that day: the canvas draws it faint where it will be, as a hidden record asked about is drawn. null
  // where nothing selected starts later.
  const later = computed(() => {
    version.value;
    const st = state.value, keys = Shell.selection.value, out = {};
    for (const k of keys) {
      const id = k.split(/[@#]/)[0], d = !st[id] && heldFrom(id);
      if (!d) continue;
      const then = shown.peek().asOf(chart.peek(), d), I = Tree.index(then), mine = [id];
      for (let i = 0; i < mine.length; i++) mine.push(...(I.entries.get(mine[i]) ?? []));
      const its = new Set(mine), put = x => { out[x] = then[x]; (I.entries.get(x) ?? []).forEach(put); };
      mine.forEach(put);
      for (const x of mine) for (const rid of I.relations.get(x) ?? []) if (!st[rid] && then[rid].args.every(a => its.has(a.at) || a.at in st)) put(rid);
    }
    return Object.keys(out).length ? out : null;
  });
  // What needs attention as of the day shown (Formulas.attention). A check failed (Ownership Adds Up, Capacity
  // Held) is counted here, as an error; going to it selects what it's at, and asks why. The inspector counts
  // the rest, aiming at their rows.
  // It reads only the Required and Check notes, and where there's a rule to check, so a look or a field shown, changed, counts nothing again.
  const asking = keptWhile(() => JSON.stringify(['Required', 'Check', 'Formula'].flatMap(l => notes.value.notes(l).map(n => [n.note, n.view, n.param, Tree.key(n.pattern), l === 'Formula' ? null : n.value]))), () => notes.peek());
  const needs = computed(() => Formulas.attention(result.value, asking.value, day.value));
  // The same, due soon being within so many days: what the status list's Next 90 days lists.
  const needsWithin = days => Formulas.attention(result.peek(), asking.peek(), day.peek(), days);
  Shell.register('attention', { items: () => needs.value.filter(a => a.kind === 'error' && !a.error).map(({ id }) => ({ kind: 'error', id, go: () => {
    const r = state.peek()[id];
    if (!r) return;
    Shell.select([r.args ? id : r.at]);
    Shell.emit('why-open', id);
  } })) });

  // ---- Changing ----
  // Undo and Redo are this window's (dendra.md, Workbook: the session's, in no log): each chart's stack of the
  // changes made here, whoever is named as making them, kept for the tab as its address is. Making a chart
  // isn't one of them. Each entry is the change to reverse and the act it stands for, the change made here
  // (a restore is one), which the toast says was taken back or put back; or why it wasn't.
  const stacks = signal((() => { try { return JSON.parse(sessionStorage.getItem('dendra.undo')) ?? {}; } catch { return {}; } })());
  const stackOf = c => stacks.value[c] ?? { undo: [], redo: [] };
  const keep = (c, s) => { stacks.value = { ...stacks.peek(), [c]: s }; try { if (!sand) sessionStorage.setItem('dendra.undo', JSON.stringify(stacks.peek())); } catch {} };
  const made = c => { lastDiscarded.value = null; const s = stackOf(c.chart); keep(c.chart, { undo: [...s.undo, { id: c.id, act: c.id }], redo: [] }); return c; };
  function step(back, quiet) {
    if (Shell.time.peek()?.stood) return refuse();
    // With a change pending, Undo discards it first, and says so, Redo bringing it back; it never undoes past it. A
    // change pending discarded is the latest thing undone, so Redo brings it back first, until something's made or begun.
    const p = mine();
    if (back && p) return discard();
    if (!back && !p && lastDiscarded.peek()?.chart === chart.peek()) return stage(lastDiscarded.peek());
    const c = chart.peek(), s = stacks.peek()[c] ?? { undo: [], redo: [] }, [from, to] = back ? ['undo', 'redo'] : ['redo', 'undo'], top = s[from].at(-1);
    // A look is no step from a change: Viewing, or with no change of yours to take, Undo takes back what you last looked at.
    if (viewing.peek() || !top) return stepLook(back);
    const r = top ? book.peek().reverse(top.id, who()) : null;
    // A change kept from before a reload that never reached the workbook is passed over.
    if (r === null && top) { keep(c, { ...s, [from]: s[from].slice(0, -1) }); return step(back, quiet); }
    if (!r) return Shell.toast(back ? 'Nothing to undo' : 'Nothing to redo', { ms: 2000 });
    if (typeof r === 'string') return Shell.toast(r);
    keep(c, { [from]: s[from].slice(0, -1), [to]: [...s[to], { id: r.id, act: top.act }] });
    if (!quiet) Shell.toast(Time.describe(r), back ? { redo } : { undo });
  }
  const undo = () => step(true), redo = () => step(false);
  // A look taken back or put back, as Viewing's Undo does it, and a look's own toast.
  function stepLook(back) {
    const [from, to] = back ? ['undo', 'redo'] : ['redo', 'undo'], c = chart.peek(), l = lookStepsOf(c), last = l[from].at(-1);
    if (!last) return Shell.toast(back ? 'Nothing to undo' : 'Nothing to redo', { ms: 2000 });
    (back ? last.undo : last.redo)();
    lookSteps.value = { ...lookSteps.peek(), [c]: { [from]: l[from].slice(0, -1), [to]: [...l[to], last] } };
    Shell.toast(`${back ? 'Undid' : 'Redid'}: ${last.say}`, back ? { redo: () => stepLook(false) } : { undo: () => stepLook(true) });
  }
  // Undo's list: the steps it can take back, the latest first, each by its words.
  const lookWords = () => [...lookStepsOf(chart.value).undo].reverse().map(l => l.say);
  const steps = () => { const mine = viewing.value ? [] : stackOf(chart.value).undo.map(s => book.peek().changes().find(x => x.id === s.act)).filter(Boolean).reverse().map(c => Time.describe(c)); return mine.length ? mine : lookWords(); };
  // Back to there: the steps from the latest through the `n`th of that list, one toast saying how many, Redo putting them
  // all back.
  function undoTo(n) {
    if (Shell.time.peek()?.stood) return refuse();
    const again = k => { batch(() => { for (let i = 0; i < k; i++) step(false); }); Shell.toast(`Redid ${k} changes`, { undo: () => undoTo(k) }); };
    if (mine()) discard();
    if (n === 1) return step(true);
    const words = steps();
    batch(() => { for (let i = 0; i < n; i++) step(true); });
    Shell.toast(`Undid ${n} changes, back to before ${words[n - 1]}`, { redo: () => again(n) });
  }
  // The ids the change last previewed gave what it would add (see would), which the next change gives what it adds,
  // in order: so a change made as it was previewed is that change, ids and all. A change pending keeps its own.
  let named = [];
  // What a change keeps as it is, each a function of its edit: the chart shown keeps its boxes where they stand.
  const keepers = new Set();
  const keeping = k => { keepers.add(k); return () => keepers.delete(k); };
  const edit = (dated, ids, note) => book.peek().edit({ chart: chart.peek(), who: who(), day: typeof dated === 'string' ? dated : dated ? Shell.time.peek()?.asOf ?? null : null, ids, note: Tree.clean(note ?? '') || null });
  // One change, by the user: refused while the past is shown; dated from the day shown, or from the day `dated`
  // gives (a payment, from the day it was made), unless it's false (a view isn't a fact about the world). `say`,
  // a string or a function of the change, is toasted with Undo. `ids`, those its redline gave what it adds. A start
  // or an end it records past the day shown, which takes what it's at out of the chart then, is said, wherever it was
  // typed: a start with Show Mar 2, 2027, the chart then; an end says its day itself ("Ended … on Dec 1, 2026", Time.describe).
  // A change that changes something also keeps as they are the boxes it doesn't place in the chart shown (the canvas's
  // keepers), unless `keep` is false (Tidy). `go`, a function of the change, gives what else its toast offers: [label, run].
  // `note`, why it's made (dendra.md, Change), which History shows beside it.
  let staying = null;
  function change(fn, { say, told, dated = true, ids, empty, keep = true, go, note } = {}) {
    if (readOnly.peek()) return refuse();
    const tx = edit(dated, ids ?? named, note), was = entered.peek();
    if (!ids) named = [];
    fn(tx);
    if (keep && tx.size()) for (const k of keepers) k(tx);
    if (sand && !sand.takes(tx)) { Shell.toast('Finish the design first: Done or Discard'); return null; }
    planned(tx);
    const c = tx.commit();
    if (typeof c === 'string') { Shell.toast(c); return null; }
    if (!c) { empty?.(); return null; }
    // What a toast that stays offered was of the change before: this one's Undo would be another's.
    staying?.(); staying = null;
    made(c);
    const out = outBy(c, was), said = (typeof say === 'function' ? say(c) : say) || (out && typeof Time !== 'undefined' && Time.describe(c)) || told;
    // One that takes what it's at out of the chart till a later day offers that day, and stays till it's taken or dismissed;
    // where that leaves the chart nothing to draw, the chart goes to that day (see firstDrawn), and offers today.
    const when = out?.holds === 'from' ? Tree.formatDate(out.day, 'short') : null, bare = when && nothingDrawn(), more = !when && go?.(c);
    if (bare) { keptToday.add(chart.peek()); Shell.at({ asOf: out.day }); }
    if (said) { const off = Shell.toast(bare ? `${said}; showing the chart as of then` : said, { undo, ...(bare ? { go: ['Today', () => Shell.at(null)] } : when ? { go: [`Show ${when}`, () => Shell.at(out.day === Log.today() ? null : { asOf: out.day })] } : more && { go: more }) }); if (when || more) staying = off; }
    return c;
  }
  // A design being edited (dendra.md, Group designs): the workbook read from a copy of its log, what's drawn there this window's alone, in no one's History or
  // file, with Undo's steps of its own, till Done writes the note, one change, or Discard. `takes`, whether a change is one that belongs there, what a hand draws; another says so, and nothing's lost.
  let sand = null;
  function sandbox(takes) {
    if (sand) return false;
    const real = book.peek(), copy = Log.open(real.changes());
    sand = { real, took: stacks.peek(), takes, off: copy.subscribe(() => { version.value++; }) };
    batch(() => { book.value = copy; version.value++; });
    return true;
  }
  // (From what's stood on the page: nothing before it can be undone there.)
  const sandboxBegun = () => { const c = chart.peek(); keep(c, { undo: [], redo: [] }); };
  function unsandbox() {
    if (!sand) return;
    const s = sand;
    sand = null;
    s.off();
    batch(() => { book.value = s.real; stacks.value = s.took; version.value++; });
    try { sessionStorage.setItem('dendra.undo', JSON.stringify(s.took)); } catch {}
  }
  // The pages of a plan are one chart on several days, with one look and one set of places (dendra.md, The layout): what a
  // change puts on one of them, a place, a bend, a scale, a paper or a look, it puts on them all. A box's free text is its page's.
  const PLACES = new Set(['Position', 'Bend', 'Scale', 'Page']), allText = r => !r.view && Notes.ROOT.includes(r.label) && r.pattern.kind === 'View' && !!r.pattern.id, look = r => !!r.view && r.label !== 'Text' && Notes.looksLike(r);
  function planned(tx) {
    const pages = views.peek(), peers = id => { const p = pages.find(v => v.id === id)?.plan; return p ? pages.filter(v => v.plan === p && v.id !== id) : []; };
    if (!pages.some(v => v.plan)) return;
    const { added, removed } = tx.noted(r => PLACES.has(r.label) || allText(r) || look(r)), at = r => JSON.stringify([r.label, r.view ?? r.pattern.id, r.param ?? null, Tree.key(r.pattern)]), stays = new Set(added.map(at));
    const put = (r, value) => { for (const q of peers(r.view ?? r.pattern.id)) r.view ? tx.note(r.label, r.pattern, value, { view: q.id, param: r.param }) : tx.note(r.label, viewTree(q.id), value); };
    for (const r of removed) if (!stays.has(at(r))) put(r, undefined);
    for (const r of added) put(r, r.value);
  }
  // Whether a line says its name on the page shown, and saying so: one note, at its relation in that view, from its right-click and its page alike. (dendra.md, From nothing)
  const lineNamed = (rid, view = Shell.view.peek()) => { const t = Tree.treeOf(state.peek(), rid); return !!t && notes.peek().value('Format', t, view) !== 'none'; };
  const nameLine = (rid, on, view = Shell.view.peek()) => { const recs = state.peek(), t = Tree.treeOf(recs, rid), N = notes.peek(); if (!t) return; const name = N.name(t), p = { ...('tag' in (t.out ?? {}) && { out: { tag: true } }), ...N.relationPattern(t) }; change(tx => tx.note('Format', p, on ? 'value' : 'none', { view }), { dated: false, say: `${on ? 'Showed' : 'Hid'} the name on ${name} lines` }); };
  // A chart with nothing to draw on the day shown, every box of it not yet formed, opens on the first day it has one: a fund
  // about to be formed is a chart worth drawing. Only for this window, as a day picked is, and only till the user asks for today.
  const nothingDrawn = () => { const s = typeof Scene !== 'undefined' && scene.peek(); return !!s && !s.marks.some(m => m.type === 'box'); };
  const keptToday = new Set();
  const firstDrawn = () => shown.peek().rows(chart.peek()).filter(r => r.kind && r.kind !== 'View' && !r.calendar).map(r => heldFrom(r.record)).filter(Boolean).sort()[0] ?? null;
  // (Boxes there are that the view hides, one by one, are no call to go looking for another day.)
  const nothingThere = () => !Object.values(state.peek()).some(r => Tree.isObject(r) && !Tree.isView(r) && notes.peek().value('Shown', { kind: r.kind }, scene.peek()?.view) !== false);
  Shell.ready.then(() => effect(() => {
    if (typeof Scene === 'undefined' || !scene.value || Shell.time.value || keptToday.has(chart.value) || !nothingDrawn() || !nothingThere()) return;
    const c = chart.peek(), d = firstDrawn();
    keptToday.add(c);
    // (A moment on, as drawing it is; it may be another workbook being opened by then.)
    if (d) queueMicrotask(() => { if (chart.peek() === c && !Shell.time.peek() && nothingDrawn()) Shell.at({ asOf: d }); });
  }));
  // The start or end entry a change records that takes what it's at out of the chart as of the day shown, where it
  // was: { holds: 'from' or 'until', day }; or null.
  function outBy(c, was) {
    const now = entered.peek(), N = notes.peek();
    for (const r of c.adds) if ('record' in r && r.field === 'date' && Log.validOn(r, day.peek()) && was[r.at] && !now[r.at]) {
      const t = Tree.treeOf({ ...was, '': { at: r.at, edge: r.edge, field: 'date', value: r.value } }, '');
      if (t && (N.isStart(t) || N.isEnd(t))) return { holds: N.isStart(t) ? 'from' : 'until', day: r.value };
    }
    return null;
  }
  // A change as `change` would make it, unmade: the chart it would leave as of the day shown, as Log.asOf reads it
  // (so a start entry typed past the day takes what it's at out, and all that's at that), by the records that differ
  // from the chart shown, null where one would hold no longer, their periods and ids and all; what its redline
  // previews (FormulaBar.preview), so the chart laid out ahead for it is the chart the change, made, draws. Null
  // where it changes no record shown, or the past is. `ids`, a change pending's own list of the ids it adds.
  function would(fn, { dated = true, ids } = {}) {
    // (Viewing, only a change pending, which is a what-if, previews: nothing else there's begun.)
    if (Shell.time.peek()?.stood || (viewing.peek() && !ids)) return null;
    const mine = ids ?? [], tx = edit(dated, mine), now = entered.peek(), records = {};
    fn(tx);
    if (!ids) named = mine;
    const after = tx.asOf(day.peek());
    for (const id in after) if (after[id] !== now[id]) records[id] = after[id];
    // (A table opened only to read isn't in the log an edit reads, and doesn't go for that.)
    for (const id in now) if (!(id in after) && !Tree.isView(now[id])) records[id] = null;
    // (And what it shows of what it adds, so its redline is what it'll draw: a relation of a new name, its line.)
    const shows = tx.added().filter(r => 'note' in r);
    return Object.keys(records).length ? { records, ...(shows.some(r => r.label === 'Shown') && { shows }) } : null;
  }
  // When a record added holds from (dendra.md, Time). One whose kind or relation has a start entry holds from
  // that, whenever it's recorded: a fund from its Formation Date, a general partner from its Admission Date.
  // A relation with none, an ownership or a membership, holds from a day said as it's made, in its redline
  // before Enter: the day shown, another, or all along, for what was always so; `change` takes it as `dated`
  // (a day, or false for all along). asksDay(record, recs) says whether a record about to be added asks its day,
  // its sides read in recs (the chart shown, and anything added with it).
  function asksDay(r, recs = state.peek(), N = notes.peek()) {
    return r?.args?.length > 1 && !!Tree.treeOf({ ...recs, '': r }, '') && !startOf(r, recs, N);
  }
  // The start entry of a record about to be added, where its kind or relation has one (a general partner's Admission
  // Date): its label, or null.
  function startOf(r, recs = state.peek(), N = notes.peek()) {
    const t = Tree.treeOf({ ...recs, '': r }, '');
    return (t && N.notes('Start').map(n => n.pattern.args?.length === 1 && n.pattern.args[0].edge).find(e => e && N.isStart({ out: { field: 'date' }, args: [{ edge: e, loc: t }] }))) || null;
  }
  // How deleting a record ends it (dendra.md, Time), the mirror of when one added holds from. One whose kind or
  // relation has an end entry is ended by that entry, given in its redline before Enter: the entry's label
  // (Dissolution Date, Withdrawal Date). Any other object or relation, an ownership say, ends on a day said there:
  // true. An entry is a value, cleared as a value is typed over, from the day shown: false.
  function endOf(id, recs = state.peek()) {
    const r = recs[id];
    if (!r || r.computed || !(Tree.isObject(r) || r.args?.length > 1)) return false;
    const t = Tree.treeOf(recs, id), N = notes.peek();
    // (On a chart that keeps no dated record, what has no end entry has no day to end on: it's only deleted.)
    return N.notes('End').map(n => n.pattern.args?.length === 1 && n.pattern.args[0].edge).find(e => e && N.isEnd({ out: { field: 'date' }, args: [{ edge: e, loc: t }] })) ?? isDated.peek();
  }
  // The act a start or an end entry records, by its name, as a verb and as what's then so: Dissolution Date dissolves
  // (Dissolved), Formation Date forms (Formed), Withdrawal Date withdraws, Admission Date admits; Start Date and End
  // Date start and end. null for a name that says no act.
  const ACTS = { formation: ['Form', 'Formed'], dissolution: ['Dissolve', 'Dissolved'], withdrawal: ['Withdraw', 'Withdrawn'], admission: ['Admit', 'Admitted'],
    termination: ['Terminate', 'Terminated'], liquidation: ['Liquidate', 'Liquidated'], resignation: ['Resign', 'Resigned'], removal: ['Remove', 'Removed'],
    appointment: ['Appoint', 'Appointed'], retirement: ['Retire', 'Retired'], expiration: ['Expire', 'Expired'], expiry: ['Expire', 'Expired'],
    cancellation: ['Cancel', 'Cancelled'], redemption: ['Redeem', 'Redeemed'], merger: ['Merge', 'Merged'], incorporation: ['Incorporate', 'Incorporated'],
    organization: ['Organize', 'Organized'], registration: ['Register', 'Registered'], commencement: ['Commence', 'Commenced'], closing: ['Close', 'Closed'],
    start: ['Start', 'Started'], end: ['End', 'Ended'], paid: ['Pay', 'Paid'], filed: ['File', 'Filed'] };
  // (A chart's own Start or End note can say its verb: { verb, done }, a template's word for its own act.)
  const actSaid = label => { const n = [...notes.peek().notes('Start'), ...notes.peek().notes('End')].find(x => x.value?.verb && Tree.same(x.pattern.args?.[0]?.edge ?? '', label ?? '')); return n ? [n.value.verb, n.value.done ?? n.value.verb] : null; };
  const actOf = label => actSaid(label) ?? ACTS[Tree.norm(label ?? '').replace(/\s+(date|day)$/, '').split(/\s+/).at(-1)] ?? null;
  // What deleting records is called, as its menus, Find and its bar's button name it: for what it records. Where it asks
  // the day they end, End, or the act their end entry records (Dissolve, for an entity's Dissolution Date); where it
  // asks none, Delete.
  function deleteVerb(ids, recs = state.peek()) {
    const ends = ids.map(id => endOf(id, recs)), words = [...new Set(ends.filter(e => typeof e === 'string'))];
    if (!ends.some(e => e !== false)) return 'Delete';
    return (words.length === 1 && ends.every(e => e === words[0] || e === false) && actOf(words[0])?.[0]) || 'End';
  }
  // Its row on a menu, which asks more only where it stops at the bar: "Dissolve…", or on a chart that keeps no dated record, "Delete".
  const deleteLabel = (ids, recs = state.peek()) => { const v = deleteVerb(ids, recs); return v === 'Delete' && !isDated.peek() ? v : `${v}…`; };
  const mistakeLabel = () => (isDated.peek() ? 'Delete as a mistake…' : 'Delete as a mistake');
  // Whether a record was made lately, as a slip is: today, or since its chart was opened in this tab, by the first
  // change that added it.
  const openedAt = new Map();
  effect(() => { const c = chart.value; if (c && !openedAt.has(c)) openedAt.set(c, new Date().toISOString()); });
  const lately = x => { const midnight = new Date(); midnight.setHours(0, 0, 0, 0); return !x || x.when >= midnight.toISOString() || x.when >= (openedAt.get(x.chart) ?? '9'); };
  function madeLately(id) {
    const c = chart.peek();
    return lately(book.peek().changes().find(x => x.chart === c && x.adds.some(r => r.record === id)));
  }
  // Whether a record is a slip, what taking it back as never held rewrites no past of: made by the chart's last change, nothing done since, one by itself.
  // So not what was made earlier in the sitting, which may be a day's work, nor an import's or a paste's rows, each a record someone meant: a person leaving
  // ends, as the menu that deleted them said, though they were typed in this morning.
  function aSlip(id) {
    const c = chart.peek(), all = book.peek().changes().filter(y => y.chart === c), x = all.find(y => y.adds.some(r => r.record === id));
    if (!x || x !== all.at(-1) || x.when < (openedAt.get(c) ?? '9')) return false;
    const made = x.adds.filter(r => 'record' in r && !r.at && !r.field), objects = made.filter(r => r.kind !== undefined).length;
    return objects <= 1 && made.length - objects <= 1;
  }
  // The change that first said what a row of a record says, its value and its period: an undo's fresh copy of a row is
  // that row, so it's the one who said it, and when.
  const firstSaid = (rec, row) => { const c = chart.peek(), { id: _, ...own } = row, k = JSON.stringify(own); return book.peek().changes().find(x => x.chart === c && x.adds.some(r => r.record === rec && (({ id: __, ...o }) => JSON.stringify(o))(r) === k)) ?? null; };
  // Who entered a record, as it stands on the day shown, and when: { who, when, note, since, before }; null where nothing did.
  function enteredBy(id) {
    const row = shown.peek().item(chart.peek(), id).find(v => Log.validOn(v, day.peek())), x = row && firstSaid(id, row);
    return x ? { who: x.who, when: x.when, note: shown.peek().reasons(x.id).at(-1)?.text ?? null, since: row.since ?? null, before: row.before ?? null } : null;
  }
  // A reason given a change afterwards, as a change that says so (Log's annotate), which Undo takes back as any other.
  function annotate(id, note) {
    const text = Tree.clean(note ?? '');
    if (!text) return null;
    if (viewing.peek()) return refuse();
    const c = book.peek().annotate({ chart: chart.peek(), who: who(), about: id, note: text });
    if (typeof c === 'string') { Shell.toast(c); return null; }
    made(c);
    Shell.toast(Time.describe(c), { undo });
    return c;
  }
  // The rules in error in what's shown, and what reads them (Formulas.broken): what a panel, a table and Export say.
  const broken = computed(() => Formulas.broken(result.value));

  // ---- A value typed (dendra.md, Time) ----
  // A record to add, at what it's at entered: an entry is only ever at a record the timeline holds, so one a formula
  // gives is entered as it stands, with what it's at (a tax year owed, entered with its payment).
  function enterAt(tx, r) {
    const enter = id => { if (!result.peek().computed[id]) return id; const { computed: _, ...x } = state.peek()[id]; return tx.add('record', enterAt(tx, x)); };
    return r.args ? { ...r, args: r.args.map(a => ({ ...a, at: enter(a.at) })) } : r.at ? { ...r, at: enter(r.at) } : r;
  }
  const withOut = (id, slot, out) => { const r = state.peek()[id] ?? slot; return { ...(r.args ? { args: r.args } : { at: r.at, edge: r.edge }), ...out }; };
  // A record, or a blank one, with another output. Typing over a computed record enters it; clearing an entered one
  // removes it, and lets a formula stand.
  function putting(tx, id, slot, out) {
    const r = id ? state.peek()[id] : null, mine = !!r && !r.computed;
    if (!out) return mine && tx.remove(id);
    // What a rule calls a record it points at goes with its name, as a relation's name in one does (dendra.md, Definitions: a record by its name).
    if (mine && r.field === 'text' && r.value !== out.value && state.peek()[r.at]?.kind && /^(?:name|short name)$/.test(Tree.norm(r.edge ?? ''))) tx.reword(r.value, out.value);
    if (mine) tx.set(id, withOut(id, slot, out)); else tx.add('record', enterAt(tx, withOut(id, slot, out)));
  }
  // Whether a value typed asks from when, wherever it's typed (the panel, the chart, the bar, a table's cell): an output
  // put in place of one a record has, where there's history to keep. A date says its own day, and a value where there was
  // none has nothing to keep; nor has what a Fixed note says doesn't change over time (an EIN, a file number), nor one typed
  // lately, as a slip is (today, or since the chart was opened), while it's for the day shown. What a formula gives, typed
  // over, asks. A date a note says recurs, its Changes over time ticked (a questionnaire's), typed later than it was is a new
  // one, whenever it's typed, from its own day; the old one stands on its.
  function asksFrom(id, out) {
    const r = id && state.peek()[id];
    if (!r || !out || r.kind !== undefined) return false;
    if (result.peek().computed[id] || overRule(id, out)) return true;
    if (r.field === 'date' || out.field === 'date') return recurs(id, r, out);
    if (fixedAt(id)) return false;
    const row = book.peek().item(chart.peek(), id).find(v => Log.validOn(v, day.peek()));
    return !!row && !(lately(firstSaid(id, row)) && (!Shell.time.peek()?.asOf || row.since === day.peek()));
  }
  const recurs = (id, r, out) => r.field === 'date' && out.field === 'date' && out.value > r.value && notes.peek().changing(Tree.treeOf(state.peek(), id));
  const recursAt = slot => { const recs = state.peek(); return !!recs[slot.at] && notes.peek().changing(Tree.treeOf({ ...recs, '': { at: slot.at, edge: slot.edge, field: 'date', value: '' } }, '')); };
  // Whether what's typed says other than what a rule covering it says: a decision, which asks why (dendra.md, Definitions: Typed over).
  function overRule(id, out) {
    const R = result.peek();
    if (!id || !out) return false;
    if (R.computed[id]) return true;
    const c = R.covered[id];
    if (!c) return false;
    if (Formulas.isError(c.value)) return true;
    const says = c.value?.t === 'date' ? c.value.iso : c.value;
    return says !== ('tag' in out ? out.tag : 'choice' in out ? out.choice : out.value);
  }
  // What a Fixed note says doesn't change over time, a record or a blank one (`slot`), which is one fact, whatever the day shown.
  const fixedAt = (id, slot) => { const recs = state.peek(), t = id && recs[id] ? Tree.treeOf(recs, id) : slot?.at && recs[slot.at] ? Tree.treeOf({ ...recs, '': { at: slot.at, edge: slot.edge, tag: true } }, '') : null; return !!t && notes.peek().fixed(t); };
  // A value as a sentence says it: whose, by the short names of what it's at, and what it is, a relation's percentage
  // being its holder's stake in the other side; a tag, by what it is and where, which its button's verb says the rest of.
  const possess = s => `${s}${s.endsWith('s') ? '’' : '’s'}`, lowered = s => s.replace(/\b[A-Z](?=[a-z])/g, c => c.toLowerCase());
  function typedWords({ id, slot, out }, recs = state.peek()) {
    const N = notes.peek(), r = recs[id] ?? slot, at = r.at && recs[r.at], is = `is ${Tree.outputText(out)}`;
    const term = x => bind(N.shortOf(recs, Tree.objectOf(recs, x))), mid = x => term(x).replace(/^The /, 'the ');
    // (A relation's side typed over, in a table: the relation as it would then be.)
    if (out.args) return `${N.nameOf(recs, id)}: ${N.placed({ ...recs, [id]: { ...r, args: out.args } }, id).map(s => s.join + s.text).join('')}`;
    if ('tag' in out) return r.at ? `${r.edge} of ${N.whereOf(recs, r)}` : `${N.nameOf(recs, id)}: ${N.segmentOf(recs, id)}`;
    if (!at) return `${N.nameOf(recs, id)}: ${N.segmentOf(recs, id)} ${is}`;
    if (at.kind !== undefined) return `${possess(term(r.at))} ${lowered(r.edge)} ${is}`;
    const tr = transferable(r.at, recs === state.peek() ? entered.peek() : recs), amount = tr?.amount && recs[tr.amount];
    return amount?.field === 'percent' ? `${possess(term(tr.first.at))} ${tr.amount === id ? 'stake' : lowered(r.edge)} in ${mid(tr.rest[0].at)} ${is}` : `${r.edge} of ${N.segmentOf(recs, r.at)} ${is}`;
  }
  // What a change pending of values typed says and what its button's called: one, its sentence, and Rule out or Attest
  // for a tag, Rename for a name; several, each.
  const typedPending = typed => {
    const [t] = typed, r = state.peek()[t.id] ?? t.slot;
    // (What's typed over a rule is a decision, said as one: its button Override, and it asks why, and until when if it ends.)
    const reason = typed.some(x => x.over || overRule(x.id, x.out));
    const act = typed.length > 1 || t.out.args ? (reason ? 'Override' : null) : reason ? 'Override' : 'tag' in t.out ? (t.out.tag ? 'Attest' : 'Rule out') : Tree.same(r.edge ?? '', 'Name') ? 'Rename' : null;
    // (A long run says its last few, the newest being what's just typed, and how many before them.)
    const shown = typed.slice(-3), more = typed.length - shown.length, words = x => { const w = typedWords(x), v = 'tag' in x.out ? (x.out.tag ? 'Yes' : 'No') : null; return reason && v ? `${w}: ${v}, where the rule ${ruleSaid(x.id)}` : w; };
    return { typed, act, reason, what: typed.length > 1 ? `${typed.length} values` : words(t), parts: typed.length > 1 ? [...(more ? [html`<span class="add">${more} more</span>`] : []), ...shown.map(x => html`<span class="add">${words(x)}</span>`)] : null,
      needs: typed.map(x => x.id).filter(x => x && !result.peek().computed[x]) };
  };
  // What the rule says of a record, in a phrase, one way wherever it's said: says No; says Jan 5, 2030; can't say; gives #VALUE!; says nothing here. No record yet, it's what it couldn't say that's typed.
  const ruleSaid = (id, R = result.peek()) => {
    if (!id) return 'can’t say';
    const c = R.covered?.[id], r = state.peek()[id], v = c ? c.value : R.computed?.[id] ? r?.tag : undefined;
    if (v === null || v === undefined) return 'says nothing here';
    if (Formulas.isError(v)) return v.code === '#N/A' ? 'can’t say' : `gives ${v.code}`;
    return `says ${typeof v === 'boolean' ? (v ? 'Yes' : 'No') : v?.t === 'date' ? Tree.formatDate(v.iso, 'short') : typeof v === 'number' ? Tree.format(r?.field, v) : String(v)}`;
  };
  // Typed: made at once, where it asks nothing; or a change pending, asking from when, the day shown till another is
  // typed, or All along, which corrects it. One typed while another's pending goes with it, from the one day, and typed
  // back to what it was (`out` false), it goes from it. `auto`: the keys go to the day, as they do on Enter. `over`, said to
  // override what a rule can't say, where there's no record for it to be over.
  function put(id, slot, out, { auto = false, over = false } = {}) {
    const p = mine(), now = p?.typed ?? null;
    if (out === false || (!out && now?.some(t => t.id === id))) {
      if (!now) return;
      const left = now.filter(t => t.id !== id);
      if (left.length) amend(p, typedPending(left)); else discard({ quiet: true });
      return;
    }
    // (Cleared, what's typed over a rule goes back to it, which asks why as typing it did.)
    if (!out && id && result.peek().covered[id]?.agrees === false) return backToRule(id);
    // (The first of a date that recurs holds from its own day, as what comes after does.)
    const first = !id && out?.field === 'date' && slot?.at && out.value <= day.peek() && recursAt(slot);
    // (On a chart that keeps no dated record, a value typed over another is made at once, a correction, and its toast says so, with a way to say from when.)
    const later = !isDated.peek() && id && !over && !overRule(id, out) && canSayFrom(id, out);
    if (!asksFrom(id, out) && !overRule(id, out) && !over && !now?.some(t => t.id === id)) return change(tx => putting(tx, id, slot, first ? { ...out, since: out.value } : out), { told: replaces(id, out), dated: first ? false : !fixedAt(id, slot), ...(later && { say: typedWords({ id, slot, out }), go: () => fromWhen(id, slot, out) }) });
    const typed = [...(now ?? []).filter(t => t.id !== id), { id, slot, out, over }];
    if (now) { amend(p, { ...typedPending(typed), instead: null }); if (auto) setTimeout(() => { const i = document.querySelector('.pendbar .when input'); i?.focus(); i?.select(); }); return; }
    // (A date that recurs is offered its own day: the day it says, All along if it only corrects.)
    const own = id && recurs(id, state.peek()[id], out) && out.value <= day.peek();
    stageTyped(typed, { auto, day: own ? out.value : isDated.peek() ? day.peek() : begins(), instead: partOfTransfer(id, out), ...(later && { go: () => fromWhen(id, slot, out), say: () => typedWords({ id, slot, out }) }) });
  }
  // A value typed over, asking from when, as one change pending.
  function stageTyped(typed, o) {
    let told = null;
    stage({ verb: 'Change', source: 'typed', asks: 'from', along: 'a correction', ...typedPending(typed),
      make: (tx, d, q) => { told = d && q.typed.length === 1 && !('tag' in q.typed[0].out) ? `${typedWords(q.typed[0])}${q.typed[0].out.field === 'date' && q.typed[0].out.value === d ? '' : ` from ${Tree.formatDate(d, 'short')}`}` : null; q.typed.forEach(t => putting(tx, t.id, t.slot, q.until && (t.over || overRule(t.id, t.out)) ? { ...t.out, before: q.until } : t.out)); },
      say: c => told ?? Time.describe(c), ...o });
  }
  // Whether a value typed over another could say from when: words or a choice that changes over time; not a name, a date, nor a fixed fact.
  const canSayFrom = (id, out) => { const r = state.peek()[id]; return !!r && !result.peek().computed[id] && ('value' in out || 'choice' in out) && out.field !== 'date' && r.field !== 'date' && !fixedAt(id) && !Tree.same(r.edge ?? '', 'Name'); };
  // A correction said after all to have been a change from a day: taken back, and asked, in the bar. Its toast's offer.
  const fromWhen = (id, slot, out) => ['From when…', () => { step(true, true); stageTyped([{ id, slot, out, over: false }], { auto: true, day: day.peek(), held: true }); }];
  // A date typed over another is made at once, a date saying its own day, and says what it replaces (dendra.md, Time).
  function replaces(id, out) {
    const r = id && state.peek()[id];
    if (r?.field !== 'date' || out?.field !== 'date' || out.value === r.value || result.peek().computed[id]) return undefined;
    return `${r.edge} of ${notes.peek().whereOf(state.peek(), r)} is ${Tree.formatDate(out.value, 'short')}, not ${Tree.formatDate(r.value, 'short')}`;
  }
  // A value typed over one side of a transfer is either the transfer changed or a new value from a day, which its bar asks: the
  // amount it went to, or what it left, whose row the transfer wrote (dendra.md, Change).
  function partOfTransfer(id, out) {
    if (typeof Time === 'undefined' || typeof out?.value !== 'number') return null;
    const r = state.peek()[id], row = r && book.peek().item(chart.peek(), id).find(v => Log.validOn(v, day.peek())), by = row && firstSaid(id, row), act = by && Time.act(by);
    if (act?.type !== 'transfer' || act.field !== r.field || Time.barred(by)) return null;
    const part = r.at === act.made ? out.value : r.at === act.rid && !act.whole ? round(act.q + row.value - out.value) : null;
    return part > 0 ? { label: 'Change the transfer', run: () => { discard({ quiet: true }); amending(by, { part }); } } : null;
  }
  // A value typed that's pending, as it would read, of the chart shown: its output, or undefined.
  const typedOut = id => { const p = pending.value; return p?.typed && p.chart === chart.value ? p.typed.find(t => t.id === id)?.out : undefined; };
  // A computed tag overridden (dendra.md, Definitions: Typed over): entered the other way, as a change pending, which asks why. What a rule can't say,
  // which has no record to be the other way (`slot`), is entered as a yes.
  function overriding(id, slot) {
    const r = id && state.peek()[id];
    if (r && 'tag' in r) return put(id, r, { tag: !r.tag }, { auto: true, over: true });
    if (slot) put(null, slot, { tag: true }, { auto: true, over: true });
  }
  // Back to the rule (dendra.md, Definitions: Typed over): what's typed over a rule ends on a day, as any record does, asking why as it was asked why it was
  // typed, so what stood stood, and as of a day before it reads as it did. Never held takes it back as a mistake.
  function backToRule(ids) {
    const recs = state.peek(), N = notes.peek(), list = [].concat(ids).filter(x => recs[x]);
    if (!list.length) return;
    const whatOf = x => recs[x].args ? `${N.nameOf(recs, x)}: ${N.segmentOf(recs, x)}` : `${recs[x].edge} of ${N.whereOf(recs, recs[x])}`, more = list.length - 3;
    stage({ verb: 'Back to the rule', source: `back ${list.join(' ')}`, what: list.length > 1 ? `${list.length} values` : whatOf(list[0]), parts: [...(more > 0 ? [html`<span class="add">${more} more</span>`] : []), ...list.slice(-3).map(x => html`<span class="add">${whatOf(x)}: back to the rule, which ${ruleSaid(x)}</span>`)], asks: 'until', day: day.peek(), reason: true, needs: list, auto: true,
      make: (tx, d) => list.forEach(x => tx.remove(x, d ?? null)), say: c => Time.describe(c) });
  }
  // Who typed a record over a rule, when, why and until when, as it stands on the day shown; null where nothing did.
  const overOf = id => { const by = enteredBy(id); return by && { who: by.who, when: by.when, why: by.note, until: by.before, since: by.since }; };
  // What a "no" is (dendra.md, Part 3, States): a check failed, 'fails'; a typed one a Check note says needs heeding, 'heeds', both
  // red, as the chart and the status bar have them; any other, plain.
  function noTone(id, recs = state.peek()) {
    const t = recs[id] && Tree.treeOf(recs, id), N = notes.peek();
    return !t ? '' : N.check(t) ? 'fails' : N.heeds(t) ? 'heeds' : '';
  }

  // When a record holds, as its panel says it: from, the latest of the day its own period starts, its start entry's day
  // and, for a relation, the day its sides are there, said as what it is ("when Fund III Blocker was formed"); and until,
  // the mirror. → { from: { day, word, when } | null, until: { day, word, when } | null }
  function spanOf(id, recs = state.peek(), seen = new Set()) {
    const c = chart.peek(), r = recs[id], N = notes.peek(), rows = shown.peek().item(c, id);
    if (!r || seen.has(id) || !rows.length) return { from: null, until: null };
    seen.add(id);
    const name = x => bind(N.shortOf(recs, x)), dated = Tree.index(recs).entries.get(id)?.filter(e => recs[e].field === 'date') ?? [], t = Tree.treeOf(recs, id);
    const own = rows.every(v => v.since) ? rows.map(v => v.since).sort()[0] : null, last = rows.every(v => v.before) ? rows.map(v => v.before).sort().at(-1) : null;
    const entry = test => { const e = t && dated.find(x => test(Tree.treeOf(recs, x))), act = e && actOf(recs[e].edge)?.[1]; return e ? { day: recs[e].value, word: r.kind !== undefined ? act ?? null : null, act: act ?? null, entry: e } : null; };
    let from = entry(x => N.isStart(x)), until = entry(x => N.isEnd(x));
    if (own && (!from || own > from.day)) from = { day: own, word: null, act: null };
    if (last && (!until || last < until.day)) until = { day: last, word: null, act: null };
    if (r.args) for (const a of r.args) {
      const o = Tree.objectOf(recs, a.at), s = spanOf(o, recs, seen);
      seen.delete(o);
      const by = x => `when ${name(o)} ${x.act ? `was ${x.act.toLowerCase()}` : x === s.from ? 'began' : 'ended'}`;
      if (s.from && (!from || s.from.day > from.day)) from = { day: s.from.day, word: null, when: by(s.from), of: o, entry: s.from.entry };
      if (s.until && (!until || s.until.day < until.day)) until = { day: s.until.day, word: null, when: by(s.until), of: o, entry: s.until.entry };
    }
    return { from, until };
  }
  // What changes the day a record holds from or until, as its panel says it: `side` 'from' or 'until' (dendra.md, Change). An
  // entry's, the entry itself to type over (`aim`, at the record it's in); else the act that made its rows, its bar; or the
  // day alone. → { aim, at } | { run } | { why } | null.
  function dayChanger(id, side) {
    const c = chart.peek(), wb = book.peek(), on = !state.peek()[id] && heldFrom(id), s = spanOf(id, on ? wb.asOf(c, on) : state.peek())[side];
    if (!s) return null;
    // What an act wrote, its bar; else the entry that says it, or the day alone.
    const ofAct = by => { const act = by && Time.act(by); if (!act || !['transfer', 'insert', 'merger'].includes(act.type)) return null; const bar = Time.barred(by); return bar ? { why: `A later change rests on it: ${Time.describe(bar)}`, by: bar } : { run: () => amending(by, { focus: 'day' }) }; };
    if (s.entry) { const row = wb.item(c, s.entry).at(-1); return (row && ofAct(firstSaid(s.entry, row))) ?? { aim: s.entry, at: s.of ?? id, show: on }; }
    if (s.of) return { at: s.of };
    const which = side === 'from' ? 'since' : 'before', row = wb.item(c, id).find(r => r[which] === s.day);
    if (!row) return null;
    const by = firstSaid(id, row);
    return ofAct(by) ?? { run: () => { if (readOnly.peek()) return refuse(); amendingDay(by, id, which, s.day); keysOnBar('day'); } };
  }
  // The keys on a bar just opened, where it's asked in the panel or else under the view: its day, or its amount first.
  const keysOnBar = focus => setTimeout(() => {
    const box = [...document.querySelectorAll('.pendbar')].find(x => x.getClientRects().length);
    const el = (focus === 'day' ? null : box?.querySelector('.amount input, input.amount')) ?? box?.querySelector('.when input') ?? box?.querySelector('.transfer .sel');
    el?.focus(); el?.select?.();
  }, 60);
  // The first day after the day shown it no longer holds, for what isn't in the chart then but was: the day it ended on,
  // and how, from what it was the day before. null where it never held before then.
  function heldUntil(id, d = day.peek()) {
    const wb = shown.peek(), c = chart.peek();
    if (!c || !id || entered.peek()[id] || !wb.item(c, id).length) return null;
    const days = new Set(), up = [id], seen = new Set();
    for (let i = 0; i < up.length; i++) if (!seen.has(up[i])) { seen.add(up[i]); for (const r of wb.item(c, up[i])) { if (r.before && r.before <= d) days.add(Tree.firstDay(r.before)); up.push(...Tree.argsOf(r).map(a => a.at)); } }
    for (const r of wb.rows(c)) if ('record' in r && seen.has(r.at) && r.field === 'date' && r.value <= d) days.add(Tree.firstDay(r.value));
    const before = x => { const y = new Date(x + 'T12:00:00'); y.setDate(y.getDate() - 1); return Tree.isoOf(y); };
    const ended = [...days].sort().reverse().find(x => wb.asOf(c, before(x))[id]);
    return ended ? { day: ended, last: before(ended) } : null;
  }
  // Blank by choice (dendra.md, Ours to track): a blank said to be no blank of the chart's, a Required note saying no, at that
  // one record's own tree and the entry or list's label. It says who said so and why as any change does.
  const oursPattern = (id, edge, recs = state.peek()) => ({ args: [{ edge, loc: Tree.treeOf(recs, id) }] });
  function notOurs(id, edge, recs = state.peek(), N = notes.peek()) {
    const t = recs[id] && Tree.treeOf(recs, id), n = t && N.resolve('Required', { args: [{ edge, loc: t }] });
    return n?.value === false && n.note.pattern.args?.[0]?.loc?.id === id ? n.note : null;
  }
  function sayNotOurs(id, edge, on = true) {
    const recs = state.peek(), name = notes.peek().shortOf(recs, id), what = on ? `${edge} of ${name} isn’t ours` : `${edge} of ${name} is ours after all`;
    stage({ verb: on ? 'Not ours' : 'Ours', what, parts: [html`<span class="add">${what}</span>`], source: `ours ${id} ${edge}`, needs: [id], make: tx => tx.note('Required', oursPattern(id, edge), on ? false : undefined), say: what, auto: true });
  }
  // What's blank that nothing requires, apart from what is, so a count of what's required isn't read as all that's empty: of a kind's
  // records, each value at least half of them have that this one hasn't (not its end, which is blank till it ends, nor its
  // short name), and who's responsible, where some of its kind have someone; and what's been said isn't ours. Each { id, edge, ours }.
  const blanksApart = computed(() => {
    const st = state.value, N = notes.value, I = Tree.index(st), kinds = new Map(), out = [];
    const objects = Object.keys(st).filter(id => st[id].kind && !Tree.isView(st[id]));
    // (Whether it's an end is asked of each kind once, not of each record.)
    const askedEnd = new Map(), skipped = (id, edge) => { if (Tree.same(edge, 'Name') || Tree.same(edge, 'Short Name')) return true; const k = `${st[id].kind}|${edge}`; if (!askedEnd.has(k)) askedEnd.set(k, N.isEnd({ out: { field: 'date' }, args: [{ edge, loc: Tree.treeOf(st, id) }] })); return askedEnd.get(k); };
    const required = new Set(needs.value.filter(a => a.kind === 'blank').map(a => `${a.id}|${Tree.norm(a.edge)}`));
    for (const id of objects) {
      const m = kinds.get(st[id].kind) ?? kinds.set(st[id].kind, { n: 0, has: new Map(), who: 0 }).get(st[id].kind);
      m.n++;
      if (responsible(id, st)) m.who++;
      for (const e of I.entries.get(id) ?? []) { const r = st[e]; if (r.edge && !r.computed && ('field' in r || 'choice' in r)) { const k = Tree.norm(r.edge); m.has.set(k, { edge: r.edge, n: (m.has.get(k)?.n ?? 0) + 1 }); } }
    }
    for (const id of objects) {
      const m = kinds.get(st[id].kind), own = new Set((I.entries.get(id) ?? []).map(e => Tree.norm(st[e].edge ?? '')));
      for (const [k, { edge, n }] of m.has) if (n * 2 >= m.n && !own.has(k) && !required.has(`${id}|${k}`) && !skipped(id, edge)) out.push({ id, edge, ours: !notOurs(id, edge, st, N) });
      if (m.who && !responsible(id, st)) out.push({ id, edge: 'Responsible', list: true, ours: !notOurs(id, 'Responsible', st, N) });
    }
    // (And whatever else has been said isn't ours, of whatever kind: what's said is read.)
    for (const n of N.notes('Required')) {
      const a = n.pattern.args?.[0], id = a?.loc?.id;
      if (n.value === false && id && st[id]?.kind && !out.some(x => x.id === id && Tree.same(x.edge, a.edge)) && !(I.entries.get(id) ?? []).some(e => Tree.same(st[e].edge ?? '', a.edge))) out.push({ id, edge: a.edge, ours: false });
    }
    return out;
  });
  // What a record was called before a day: each version of its Name that ended by then, the latest first, and the day it did.
  // (A slip corrected leaves no version, so what's here was truly its name.)
  function formerNames(id, d = day.peek(), recs = state.peek()) {
    const e = Tree.entryAt(recs, id, 'Name'), c = chart.peek();
    if (!e || !c) return [];
    return shown.peek().item(c, e).filter(r => r.before && r.before <= d && !Tree.same(r.value, recs[e].value)).sort((a, b) => b.before.localeCompare(a.before)).map(r => ({ name: r.value, until: r.before }));
  }
  // The day asked, wherever a record added, deleted or transferred asks it (a change pending's bar, and its controls
  // where it was asked): `asks` 'from', "From" (or the start entry it's given, `word`, a general partner's Admission
  // Date) and the day, typed over as Paid… types its day, or "All along", from the
  // menu its first word opens; 'until', "Ends on" (or the end entry that ends it, `word`) and the day, the first it no
  // longer holds, or "Never held"; 'on', "On" and the day, a transfer's, which has no other. `day` is an ISO day, null
  // (all along, never held), or undefined while what's typed isn't a day; `set` takes the next. `auto` takes the focus,
  // the day selected, as it's shown. Esc puts back what was typed, keeping the keys there, as a value's does; left, a
  // day typed is set as a day. One after the day shown, once it's left, is a link to the chart then, where the change is
  // drawn, as the two-box panel's later relation is.
  function From({ day, set, auto, asks, word: end, alts, along, bad, change }) {
    const { useState, useRef, useLayoutEffect } = preactHooks;
    const [text, setText] = useState(null), [typing, setTyping] = useState(false), input = useRef(), button = useRef(), keys = useRef(auto), was = useRef(), caret = useRef(false);
    // Shown with `auto`, or switched from its own menu (not another's showing the same, in the bar or where it was asked),
    // the day takes the keys, selected; all along, its menu does.
    useLayoutEffect(() => {
      if (keys.current) { if (input.current) { input.current.focus(); if (caret.current) { caret.current = false; const n = input.current.value.length; setTimeout(() => input.current?.setSelectionRange(n, n)); } else input.current.select(); } else button.current?.focus(); }
      keys.current = false;
    }, [day === null]);
    const words = asks === 'until' ? [typeof end === 'string' ? end : 'Ends on', isDated.value ? 'Never held' : 'A mistake'] : asks === 'on' ? [typeof end === 'string' ? end : 'On'] : [typeof end === 'string' ? end : 'From', isDated.value ? 'All along' : 'Always'], always = day === null, word = words[always ? 1 : 0];
    const shown = Shell.time.value?.asOf ?? Log.today(), later = !!day && day > shown && !typing;
    const back = () => { if (always) { keys.current = true; setText(null); set(shown); } };
    const pick = e => Shell.menu(e.currentTarget, [
      ...(alts ? alts.map(a => ({ ...a, checked: a.checked && !always, run: () => { back(); a.run(); } })) : [{ label: words[0], checked: !always, run: back }]),
      { label: words[1], detail: along, checked: always, run: () => { if (!always) keys.current = true; set(null); } }]);
    // Its list opens by Enter or the arrow, as a list does, nothing made from it till a day's left to make it on; once all along
    // is picked there's nothing else to ask, and Enter makes it.
    const opens = e => {
      // (All along, a day typed begins it, as it does over a day.)
      if (always && e.key.length === 1 && /[\d\p{L}]/u.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); e.stopPropagation(); keys.current = true; caret.current = true; was.current = null; setText(e.key); set(Tree.parseKnown(e.key) ?? undefined); return; }
      if (e.key !== 'ArrowDown' && !(e.key === 'Enter' && !always)) return; e.preventDefault(); e.stopPropagation(); pick(e); };
    const key = e => {
      if (e.key !== 'Escape' || text === null) return;
      e.preventDefault(); e.stopPropagation();
      setText(null); set(was.current);
      setTimeout(() => input.current?.select());
    };
    return html`<span class="from">${words.length > 1 ? html`<button ref=${button} type="button" class="sel dd" aria-haspopup="menu" aria-label=${word} onClick=${pick} onKeyDown=${opens}><span>${word}</span></button>`
        : html`<span class="word">${word}</span>`}
      ${always ? null : later && !change ? dayLink(day) : html`<span class="hug"><input ref=${input} class="cell date" value=${text ?? (day ? Tree.formatDate(day, 'short') : '')} aria-label=${words[0]}
        spellcheck=${false} autocomplete="off" aria-invalid=${day === undefined || bad ? 'true' : null} data-why=${typeof bad === 'string' ? bad : Tree.notA('date')} onFocus=${e => { setTyping(true); if (!caret.current) e.target.select(); }} onBlur=${() => { setTyping(false); if (day) setText(null); }} onKeyDown=${key}
        onInput=${e => { if (text === null) was.current = day; setText(e.target.value); set(Tree.parseKnown(Tree.clean(e.target.value)) ?? undefined); }} /></span>${change && day && day > shown ? html` <button type="button" class="lk" onClick=${() => Shell.at({ asOf: day })}>Show the chart then</button>` : null}`}</span>`;
  }
  // A day a change holds from or until, said where it's after the day shown: a link to the chart then, where it's drawn.
  const dayLink = d => html`<button type="button" class="lk" onClick=${() => Shell.at(d === Log.today() ? null : { asOf: d })}>${Tree.formatDate(d, 'short')}</button>`;

  // ---- A change pending (dendra.md, Part 2: pending changes are redlined): shown before it's made, exactly as it
  // will be; made only by Enter or its verb, discarded only by Esc or Discard, never dropped without a word; and saying
  // when it holds ----
  // One at a time, whoever begins it: a relation ticked or named in the two-box panel, records deleted, a relation
  // transferred, rows pasted. { verb, what (what it does, in words; `parts`, the same set out, as a paste's; `Fill`, a
  // component setting it out with what else it asks in place, as a transfer's whom and how much), make(tx, day, p) (the
  // change, of the day said), asks ('from', 'until' or 'on', where it asks its day, as `day`; `word`, the start entry a
  // 'from' gives or the end entry an 'until' gives), value (a relation's amount it asks first, { edge, field, v }),
  // ready(p) (whether what else it asks is given), needs (the records it's at), source (where it began), act (what its
  // button calls it, a deletion's Dissolve), say, done(change), auto (its controls take the keys as it's begun), reverse (the
  // change it reverses, History's Undo this change, which make redlines) }; and `from`, the day shown as it was begun. It's the chart's it
  // was begun in: a click away, another view, another day or another chart shown leave it pending; one begun elsewhere in
  // its place says so, and Undo brings it back.
  const pending = signal(null);
  // The one last discarded, which Redo brings back, as it was, until something's made or another is begun.
  const lastDiscarded = signal(null);
  let staged = 0;
  const mine = () => { const p = pending.peek(); return p && p.chart === chart.peek() ? p : null; };
  // Its day: the one it asks, where it adds or transfers; else the day shown when it was begun, never the day shown at
  // Enter, so a change begun as of a day and made after going back to today still holds from that day. A deletion is
  // dated so, and ends what it ends on the day it asks (make's `day`); so is a relation added with its start entry, which
  // the day asked is given.
  const datedOf = p => (p.asks === 'from' && !p.word) || p.asks === 'on' ? p.day ?? false : p.from ?? false;
  // Whether it can be made: its day a day, where it asks one, its amount a figure or blank, and whatever else it asks given.
  const able = p => !(p.asks && p.day === undefined) && !(p.value && p.value.v === undefined) && p.until !== false && (p.fits?.(p) ?? true) && (p.ready?.(p) ?? true);
  // What overrides a rule, or goes back to it, is made only with why (dendra.md, Definitions: Typed over).
  const lacksWhy = p => !!p.reason && !Tree.clean(why.value ?? ''), ready = p => able(p) && !lacksWhy(p);
  // What its button says: its verb, or what it's called (Dissolve); a deletion as never held is Delete.
  const actOn = p => p.asks === 'until' && p.day === null ? p.verb : p.act ?? p.verb;
  const doing = { Add: 'adding', Delete: 'deleting', Paste: 'pasting', Import: 'importing', Transfer: 'transferring', 'Re-point': 're-pointing', Change: 'changing', 'Rule out': 'ruling out', Insert: 'inserting', Undo: 'undoing', Redo: 'redoing', Override: 'overriding', 'Back to the rule': 'going back to the rule on' };
  const discarded = p => {
    // (One value typed is said as a sentence, which is what's discarded; a tag's, or several, by what doing it was.)
    if (p.typed?.length === 1 && !('tag' in p.typed[0].out)) return `Discarded “${p.what}”`;
    const act = actOn(p);
    return `Discarded ${doing[act] ?? (act !== p.verb ? act.toLowerCase().replace(/e$/, '') + 'ing' : p.verb.toLowerCase())} ${p.what}`;
  };
  function stage(p) {
    // (Viewing, it's a what-if: redlined in full, and made only from Editing.)
    if (Shell.time.peek()?.stood) { refuse(); return; }
    if (sand) { Shell.toast('Finish the design first: Done or Discard'); return; }
    // Where the keys were as it was begun: what had them, the row it's in, and its part of the window.
    const was = pending.peek(), a = document.activeElement !== document.body ? document.activeElement : null;
    const back = a && { el: a, key: a.closest?.('[data-key]')?.dataset.key, region: a.closest?.('[data-region]') };
    // Brought back, what said it was discarded goes.
    if (p === lastDiscarded.peek()) unsaid?.();
    lastDiscarded.value = null;
    const q = { ids: [], chart: chart.peek(), from: Shell.time.peek()?.asOf ?? null, back, day0: p.day, ...p, n: ++staged };
    // On a chart that keeps no dated record, made as it's said, its toast's Undo the way back (dendra.md, Notes: Dated).
    if (atOnce(q)) { why.value = ''; const c = change(tx => q.make(tx, q.day, q), { dated: datedOf(q), ids: q.ids, say: q.say, go: q.go }); if (c) { q.done?.(c); after(q); } return c; }
    why.value = p.note ?? '';
    pending.value = q;
    if (was && was.source !== p.source) Shell.toast(discarded(was), { undo: () => stage(was) });
  }
  // Whether a chart keeps a dated record (dendra.md, Notes: Dated). A template that doesn't, a family's or an office's, says so at the kind View.
  const isDated = computed(() => notes.value.value('Dated', { kind: 'View' }) !== false);
  // What a change on such a chart still stops at the bar for, something to decide: a value asked for (an amount, a role, a who, a name it could be
  // instead), a day it ends on or is made on, a reason; a form still being typed (`held`); what it's to read back (an undo, an amendment); or a check it would newly fail.
  const atOnce = q => !isDated.peek() && !viewing.peek() && !pending.peek() && !q.held && !q.Fill && !q.value && !q.reason && !q.reverse && !q.amends && !q.asking && q.asks !== 'until' && q.asks !== 'on' && able(q) && !newlyFails(q);
  function newlyFails(q) {
    if (!notes.peek().notes('Check').length) return false;
    const w = would(tx => q.make(tx, q.day, q), { dated: datedOf(q), ids: q.ids });
    if (!w) return false;
    const recs = { ...entered.peek() }, gone = Object.keys(w.records).filter(id => !w.records[id] && recs[id]);
    for (const [id, r] of Object.entries(w.records)) if (r) recs[id] = r;
    if (gone.length) for (const id of Tree.dependents(recs, gone)) delete recs[id];
    return failsOf(Formulas.computeState(recs, definitions.peek(), namesOn(day.peek()))).length > 0;
  }
  // What it asks, given: a day typed, a transfer's whom or how much.
  const amend = (p, o) => { if (pending.peek()?.n === p.n) pending.value = { ...pending.peek(), ...o }; };
  // Gone, with the keys in its bar, they go back where they were as it was begun: to what had them, or the row it was
  // in drawn again (a two-box panel's), itself, so its box doesn't preview being ticked again, or else that part of the
  // window, or the view.
  function after(p) {
    setTimeout(() => {
      const a = document.activeElement, b = p.back;
      if (a && a !== document.body && a.isConnected) return;
      const row = b?.key && document.querySelector(`[data-key="${CSS.escape(b.key)}"]`);
      if (row && !b.el.isConnected) row.tabIndex = -1;
      // (And out of a grid's cell, back to the grid, whose keys they were: the next name goes on where it was going.)
      if (!b?.el?.isConnected && !row && b?.el?.closest?.('.tabulator') !== undefined && views.peek().find(v => v.id === Shell.view.peek())?.layout === 'table' && typeof Table !== 'undefined') return Table.focus();
      (b?.el.isConnected ? b.el : row ?? (b?.region?.isConnected ? b.region : document.getElementById('view')))?.focus({ preventScroll: true });
    });
  }
  // Discarded, by Esc, Discard, Undo or its box unticked, it says so, with Redo, which brings it back as it was; `quiet`
  // only where what it was is still in sight (a relation's name typed over in the two-box panel's form).
  function discard({ quiet = false } = {}) {
    const p = pending.peek();
    if (!p) return;
    pending.value = null;
    after(p);
    if (quiet) return;
    p.note = why.peek();
    lastDiscarded.value = p;
    unsaid = Shell.toast(discarded(p), { redo: () => stage(p) });
  }
  let unsaid = null;
  // Dropped, saying why: what it's at no longer there (an Undo took it, or History, or a change merged), or nothing
  // left to change, once what dropped it has said what it did.
  function drop(p, why) { if (pending.peek() === p) pending.value = null; after(p); setTimeout(() => Shell.toast(`${discarded(p)}${why}`)); }
  const there = p => (p.needs ?? []).every(id => book.peek().item(p.chart, id).length > 0);
  const gone = p => p.verb === 'Delete' ? ', which no longer exists' : ': something it’s at no longer exists';
  // Made, it's one change, from the day said, its redline going as the chart it showed is drawn; refused, it stays
  // pending, and the toast says why.
  function commit() {
    const p = mine();
    // (Why it's refused has the keys: what it wants is said in its place, and is where to type it.)
    if (p && !ready(p) && lacksWhy(p)) { document.querySelector('.pendbar .why-in input')?.focus(); return null; }
    if (!p || !ready(p)) return null;
    if (viewing.peek()) { Shell.toast(makesIn); return null; }
    if (!there(p)) return drop(p, gone(p)), null;
    let empty = false;
    const c = batch(() => {
      pending.value = null;
      const it = p.reverse ? reversing(p.reverse, why.peek()) : change(tx => p.make(tx, p.day, p), { dated: datedOf(p), ids: p.ids, say: p.say, go: p.go, note: why.peek(), empty: () => { empty = true; } });
      if (!it && !empty) pending.value = p;
      return it;
    });
    if (empty) drop(p, ', which changes nothing');
    else if (c) { p.done?.(c); after(p); }
    return c;
  }
  // A field made by hand, on the chart's hands alone: no record has it but `id`, and neither a template nor a rule says anything of it. → its specifications, or null.
  function handMade(edge, id) {
    const c = chart.peek(), rows = book.peek().rows(c), begun = book.peek().changes().find(y => y.chart === c);
    if (rows.some(x => 'record' in x && x.record !== id && Tree.same(x.edge ?? '', edge))) return null;
    const of = x => Tree.same(x.pattern?.args?.[0]?.edge ?? '', edge), specs = rows.filter(x => 'spec' in x && x.tree?.args?.length === 1 && Tree.same(x.tree.args[0].edge, edge));
    return !specs.length || specs.some(x => begun?.adds.some(a => a.id === x.id)) || rows.some(x => 'note' in x && ((of(x) && ['Required', 'Check', 'Formula', 'Start', 'End'].includes(x.label)) || (x.label === 'Formula' && JSON.stringify(x.value).toLowerCase().includes(edge.toLowerCase())))) ? null : specs;
  }
  // It goes, what's said of its look with it: deleted means gone, and it stops being asked. (A template's or a rule's stays: it's the chart's.)
  function unmakeField(tx, edge, specs) { if (!specs) return; specs.forEach(x => tx.remove(x.spec)); book.peek().rows(chart.peek()).filter(x => 'note' in x && Tree.same(x.pattern?.args?.[0]?.edge ?? '', edge)).forEach(x => tx.remove(x.note)); }
  // Words typed in a figure or a date made by hand and nowhere else yet: it's words.
  function asWords(id, slot, text) {
    const r = id ? state.peek()[id] : slot, edge = r.edge, at = r.at, specs = handMade(edge, id), t = at && Tree.treeOf(state.peek(), at);
    return change(tx => { (specs ?? []).forEach(x => tx.remove(x.spec)); tx.add('spec', { tree: { out: { field: 'text' }, args: [{ edge, loc: Tree.specOf(t) }] } }); if (id) tx.set(id, { at, edge, field: 'text', value: text }); else tx.add('record', { at, edge, field: 'text', value: text }); }, { dated: false, say: `Set ${edge} to ${text}` });
  }
  // Deleting records, as a change pending: each ended as endOf says. A record an end entry ends is given it, the day
  // asked, recorded from the day shown as one typed in the inspector is, so the record says, before that day, when it
  // ends; any other object or relation ends on the day asked, with all that's at it; and never held, each is deleted as
  // if never made. An entry is cleared from the day shown. It's named for what it records (deleteVerb), but Delete where
  // it's never held; and it begins on the day shown, or on Never held where every record is a slip (aSlip), and nowhere
  // else, as that rewrites the past. `what` says what goes; `also`, what else the change does (a free shape deleted with them). End that
  // too, on its bar, adds to it what a check says it breaks (`too`, ending on the one day).
  function deleting(ids, what, o = {}) {
    const recs = state.peek();
    // (What a page draws of what's gone is no more there to delete than a box of a day past.)
    if (ids.every(id => !recs[id])) return Shell.toast(`Not in the chart as of ${Tree.formatDate(day.peek(), 'short')}`);
    ids = ids.filter(id => recs[id]);
    const ends = ids.map(id => endOf(id, recs)), asks = ends.some(e => e !== false), words = [...new Set(ends.filter(e => typeof e === 'string'))];
    const end = (tx, d, id, e) => e === false ? tx.remove(id) : d && typeof e === 'string' ? ending(tx, entered.peek(), id, e, d) : tx.remove(id, d);
    // One of a kind with more than one end says which (Dissolution Date, Merger Date), by its menu. An end named for a relation
    // of what it ends (a merger) asks that relation's other side too, in its bar, and makes it.
    const others = ids.length === 1 && typeof ends[0] === 'string' ? endsOf(ids[0], recs) : [];
    // A field made by hand, taken from the last record that has it, goes with it: deleted means gone, and it stops being asked. (Not one a template or a rule says anything of, which is the chart's.)
    const forget = tx => { for (const id of ids) { const edge = recs[id]?.edge; if (edge && endOf(id, recs) === false) unmakeField(tx, edge, handMade(edge, id)); } };
    const alts = others.length > 1 ? p => others.map(m => ({ label: m.say, checked: p.word === m.edge, run: () => amend(p, { word: m.edge, act: actOf(m.edge)?.[0] ?? p.verb, merge: m.rel ? { rel: m.rel, to: pending.peek()?.merge?.to ?? null } : null, Fill: m.rel ? Merging : null }) })) : null;
    // Merged, its toast asks what those holders received, and the survivor's panel goes on asking.
    let into = null;
    const under = ids.length === 1 ? underIt(ids[0], recs) : null;
    // (Who it leaves, said: who takes them, or that they've no manager now, each with its + in the panel.)
    let taker = null;
    const leaves = c => { const N = notes.peek(), names = under.boxes.map(x => bind(N.shortOf(recs, x))), them = names.length > 2 ? `${names.length} ${Tree.plural(lowered(under.low))}` : names.join(' and '); return `${Time.describe(c)}; ${taker ? `${bind(N.shortOf(recs, taker))} takes ${them}` : `${them} ${names.length > 1 ? 'have' : 'has'} no ${lowered(under.word)}`}`; };
    // (What stays on the chart as it ends isn't struck out: it isn't going.)
    const stays = ids.length === 1 && typeof ends[0] === 'string' && notes.peek().stays({ out: { field: 'date' }, args: [{ edge: ends[0], loc: Tree.treeOf(recs, ids[0]) }] });
    stage({ verb: 'Delete', act: deleteVerb(ids, recs), what, source: 'delete', needs: ids, say: c => typeof Time === 'undefined' ? 'Deleted' : under ? leaves(c) : Time.describe(c), ...o, alts, ...(stays && { parts: [html`<span class="add">${what}</span>`] }), ready: p => !p.merge || p.day === null || !!p.merge.to,
      // (A Delete pressed on what was only just made opens on its being a mistake; asked for by the word for it, End… or Divorce…, on that.)
      ...(asks && { asks: 'until', day: ids.every(aSlip) && !o.meant ? null : day.peek(), word: words.length === 1 && ends.every(e => e === words[0] || e === false) ? words[0] : true }),
      ...(under && { heirs: { ...under, to: null } }),
      go: () => (into && stakesAt(ids[0], recs).some(s => s.held) ? ['What did its holders receive?', () => Shell.parts.peek().inspector?.ask?.(into)] : null),
      make: (tx, d, p) => {
        ids.forEach((id, i) => end(tx, d, id, typeof p?.word === 'string' && others.length > 1 ? p.word : ends[i]));
        forget(tx);
        p?.too?.forEach(id => end(tx, d, id, endOf(id)));
        into = null;
        if (d && p?.merge?.to) { tx.add('record', { args: [{ edge: p.merge.rel.edges[0], at: ids[0] }, { edge: p.merge.rel.edges[1], at: p.merge.to.at }], tag: true }); into = p.merge.to.at; }
        // (Who takes what stood under it, from the day it ended.)
        taker = p?.heirs?.to ?? null;
        if (taker) for (const x of p.heirs.boxes) tx.add('record', { args: [{ edge: p.heirs.top, at: taker }, { edge: p.heirs.low, at: x }], tag: true, ...(d && { since: d }) });
        o.also?.(tx);
      } });
  }
  // What stands under a record by a relation of its page that ranks its boxes and says no figure, a manager's reports, each of it: who's asked for as it ends (dendra.md, Time). → { boxes, top, low, word } or null.
  function underIt(id, recs = state.peek()) {
    const N = notes.peek(), view = Shell.view.peek();
    if (!recs[id]?.kind || isDated.peek()) return null;
    const lines = (Tree.index(recs).relations.get(id) ?? []).filter(rid => recs[rid].tag === true && recs[rid].args?.length === 2 && !result.peek().computed[rid] && !transferable(rid)?.amount).map(rid => { const t = Tree.treeOf(recs, rid), a = N.value('Above', Tree.bare(t), view), first = N.edges(t)[0], top = a && a !== 'level' && a !== 'none' ? a : first; return { rid, t, a, top, on: recs[rid].args.find(x => Tree.same(x.edge, top))?.at === id }; }).filter(l => l.a !== 'none' && l.a !== 'level' && l.on);
    if (!lines.length) return null;
    const [l] = lines, same = lines.filter(x => Tree.same(N.name(x.t), N.name(l.t))), low = N.edges(l.t).find(e => !Tree.same(e, l.top));
    return { boxes: same.map(x => recs[x.rid].args.find(y => Tree.same(y.edge, low)).at), top: l.top, low, word: Tree.singular(N.listName(l.t, low)), kinds: [recs[id].kind] };
  }
  // Who takes them, asked in the bar: named, or left, and then each has its own + in its panel.
  function Heirs({ p }) {
    const h = p.heirs, recs = state.value, N = notes.value, names = h.boxes.map(x => bind(N.shortOf(recs, x)));
    if (p.day === null) return null;
    const said = names.length > 2 ? `${names.length} ${Tree.plural(lowered(h.low))}` : names.join(' and ');
    const list = q => { const w = Tree.norm(q ?? ''); return Object.keys(recs).filter(x => recs[x].kind && h.kinds.includes(recs[x].kind) && !p.needs.includes(x) && !h.boxes.includes(x) && Tree.norm(N.nameOf(recs, x)).includes(w)).sort((a, b) => N.nameOf(recs, a).localeCompare(N.nameOf(recs, b))).map(x => ({ label: N.nameOf(recs, x), checked: h.to === x, run: () => amend(p, { heirs: { ...pending.peek().heirs, to: x } }) })); };
    return html`<span class="heirs"><span>Who takes ${said}?</span> <button type="button" class=${'sel dd' + (h.to ? '' : ' ph')} aria-haspopup="menu" aria-label=${`Who takes ${said}`} onClick=${e => Shell.menu(e.currentTarget, list, { search: true })}><span>${h.to ? bind(N.shortOf(recs, h.to)) : 'No one yet'}</span></button></span>`;
  }
  // Each end entry of what a record is, with what its bar's menu calls it, and the relation it's named for, of two sides, the
  // first the one ended, where it has one: Merger Date, by Merger ("Merged into…").
  function endsOf(id, recs = state.peek()) {
    const t = Tree.treeOf(recs, id), N = notes.peek(), edges = N.notes('End').map(n => n.pattern.args?.length === 1 && n.pattern.args[0].edge).filter(e => e && N.isEnd({ out: { field: 'date' }, args: [{ edge: e, loc: t }] }));
    return [...new Set(edges)].map(edge => {
      const noun = edge.replace(/\s+(date|day)$/i, ''), rel = relations.peek().find(r => Tree.same(r.name, noun) && r.edges?.length === 2), list = rel && rel.lists?.[rel.edges[0]]?.[rel.edges[1]];
      return { edge, rel, say: list ? `${list[0]}${lowered(list.slice(1))}…` : edge };
    });
  }
  // Whether a relation is what a record's end records (a Merger, by its Merger Date).
  const endsAct = (rid, recs = state.peek()) => { const N = notes.peek(), noun = recs[rid]?.args && N.nameOf(recs, rid); return !!noun && N.notes('End').some(n => n.pattern.args?.[0]?.edge && Tree.same(n.pattern.args[0].edge.replace(/\s+(date|day)$/i, ''), noun)); };
  // The other side of a merger, asked in its bar: a search of who can be there.
  function Merging({ p, auto }) {
    const { useRef, useLayoutEffect } = preactHooks, at = useRef(), m = p.merge, recs = m?.base?.() ?? state.value, N = notes.value;
    if (!m) return null;
    const side = Object.values(schema.value).filter(s => s.args?.length === 2 && Tree.same(N.name(Tree.bare(s)), m.rel.name)).map(s => s.args.find(a => Tree.same(a.edge, m.rel.edges[1]))).filter(Boolean);
    const list = q => Object.keys(recs).filter(x => recs[x].kind !== undefined && !p.needs.includes(x) && side.some(a => Tree.narrower(Tree.treeOf(recs, x), a.loc)) && Tree.norm(N.nameOf(recs, x) + ' ' + N.shortOf(recs, x)).includes(Tree.norm(q ?? '')))
      .sort((a, b) => (Tree.norm(N.nameOf(recs, a)).startsWith(Tree.norm(q ?? '')) ? 0 : 1) - (Tree.norm(N.nameOf(recs, b)).startsWith(Tree.norm(q ?? '')) ? 0 : 1) || N.nameOf(recs, a).localeCompare(N.nameOf(recs, b))).map(x => ({ label: N.nameOf(recs, x), checked: m.to?.at === x, run: () => { amend(p, { merge: { ...pending.peek().merge, to: { at: x } } }); setTimeout(() => at.current?.closest('.pendbar')?.querySelector('.when input')?.focus()); } }));
    const choose = el => Shell.menu(el, list, { search: true });
    useLayoutEffect(() => { if (!auto || m.to || !at.current) return; at.current.focus(); choose(at.current); }, []);
    const word = m.rel.lists?.[m.rel.edges[0]]?.[m.rel.edges[1]] ?? m.rel.name, ends = endsWords(p.needs[0], recs);
    return html`<span class="transfer"><span><span class="del">${p.what}</span> · ${word[0]}${lowered(word.slice(1))} <button ref=${at} type="button" class=${'sel dd' + (m.to ? '' : ' ph')} aria-haspopup="menu" aria-label=${word} onClick=${e => choose(e.currentTarget)}><span>${m.to ? bind(N.shortOf(recs, m.to.at)) : '…'}</span></button></span>${ends ? html`<span class="sep">·</span><span class="ends">Ends <span class="del">${ends}</span></span>` : null}</span>`;
  }
  // What an entity's ending ends, in names and figures, as of `recs`: each stake in it, by whose it is, and what it held (dendra.md, Time).
  // → [{ rid, who (the holder's object), figure, held (the stake's in it, or else it's what it holds) }]
  function stakesAt(id, recs = entered.peek()) {
    const I = Tree.index(recs), out = [];
    for (const rid of I.relations.get(id) ?? []) {
      const tr = transferable(rid, recs), amt = tr?.amount && recs[tr.amount];
      if (!amt) continue;
      const first = Tree.objectOf(recs, tr.first.at), other = Tree.objectOf(recs, tr.rest[0].at);
      out.push(first === id ? { rid, who: other, figure: Tree.format(amt.field, amt.value), held: false } : { rid, who: first, figure: Tree.format(amt.field, amt.value), held: true });
    }
    return out;
  }
  const endsWords = (id, recs) => { const N = notes.peek(), name = x => { const s = bind(N.shortOf(recs, x)); return s !== bind(N.nameOf(recs, x)) ? s.replace(/^The /, 'the ') : s; }, xs = stakesAt(id, recs);
    return xs.length ? xs.sort((a, b) => b.held - a.held).map(x => x.held ? `${possess(name(x.who))} ${x.figure}` : `its ${x.figure} of ${name(x.who)}`).join(', ') : ''; };
  // What's merged into a record, by its Merger Date, as the survivor's panel asks what its holders received: each record
  // merged (a relation named for an end entry, this one its other side). → [{ merged, on, stakes, recs }]
  function mergedInto(id) {
    const wb = shown.peek(), c = chart.peek(), N = notes.peek(), rows = wb.rows(c), nouns = new Set(N.notes('End').map(n => n.pattern.args?.[0]?.edge).filter(Boolean).map(e => Tree.norm(e.replace(/\s+(date|day)$/i, ''))));
    const out = [];
    for (const r of rows) if (r.args?.length === 2 && r.tag === true && r.args[1].at === id && nouns.has(Tree.norm(N.name({ args: r.args.map(a => ({ edge: a.edge, loc: {} })) })))) {
      const x = r.args[0].at, end = rows.find(e => e.at === x && e.field === 'date' && nouns.has(Tree.norm(e.edge.replace(/\s+(date|day)$/i, ''))));
      if (!end) continue;
      const y = new Date(Tree.firstDay(end.value) + 'T12:00:00'); y.setDate(y.getDate() - 1);
      const recs = wb.asOf(c, Tree.isoOf(y));
      if (recs[x]) out.push({ merged: x, on: end.value, recs, stakes: stakesAt(x, recs).filter(s => s.held) });
    }
    return out;
  }
  // The paper that evidences a stake stays with it, where it ends, and isn't what's moved (dendra.md, Notes): said on the bar of an act that ends it.
  function papersOf(rid, recs) {
    const N = notes.peek();
    return (Tree.index(recs).relations.get(rid) ?? []).map(x => recs[x].args?.find(a => a.at !== rid)).filter(Boolean).map(a => Tree.objectOf(recs, a.at)).filter(o => (Tree.index(recs).entries.get(o) ?? []).some(e => recs[e].field === 'document') || recs[o]?.kind === 'Document').map(o => N.nameOf(recs, o));
  }
  // Who's on the hook for a record, a date's above all (dendra.md, Part 1: Responsible): an entry of that name, in its words, or the
  // person a relation with a side named Responsible says, at the record itself or the nearest up from it, a date's own record
  // before its entity's. → { rid, who, name, short } (who, none where an entry says it) or null.
  function responsible(id, recs = state.peek()) {
    const I = Tree.index(recs), N = notes.peek(), up = [id], seen = new Set();
    for (let i = 0; i < up.length; i++) {
      const x = up[i];
      if (seen.has(x) || !recs[x]) continue;
      seen.add(x);
      const e = Tree.entryAt(recs, x, 'Responsible'), said = e && (recs[e].value ?? recs[e].choice);
      if (said && typeof said !== 'boolean') return { rid: e, who: null, name: String(said), short: String(said) };
      for (const rid of I.relations.get(x) ?? []) {
        const by = recs[rid].tag !== false && recs[rid].args.find(a => Tree.same(a.edge, 'Responsible') && a.at !== x);
        if (by) { const who = Tree.objectOf(recs, by.at); return { rid, who, name: N.nameOf(recs, who), short: N.shortOf(recs, who) }; }
      }
      up.push(...Tree.argsOf(recs[x]).map(a => a.at));
    }
    return null;
  }
  // A deletion pending taken as a mistake: never held, as Delete as a mistake… begins it.
  const neverHeld = () => { const p = pending.peek(); if (p?.asks !== 'until') return; amend(p, { day: null }); if (!isDated.peek()) commit(); };
  // Merge into…, as Find asks it: the deletion begun on the end that's a merger.
  function merging(id) {
    const m = endsOf(id).find(e => e.rel);
    if (!m) return;
    deleting([id], notes.peek().nameOf(state.peek(), id), { source: 'delete', auto: true });
    amend(pending.peek(), { word: m.edge, act: actOf(m.edge)?.[0] ?? 'Delete', merge: { rel: m.rel, to: null }, Fill: Merging, day: day.peek() });
  }
  // What a deletion pending breaks, ended with it (see failsOf). → nothing; its bar then says the two.
  function endToo(p, fails) {
    const more = [...new Set(fails.map(f => f.ends).filter(Boolean))], recs = state.peek(), N = notes.peek();
    amend(p, { too: [...(p.too ?? []), ...more], needs: [...p.needs, ...more], what: `${p.what}, and ${more.map(x => `${N.nameOf(recs, x)}: ${N.segmentOf(recs, x)}`).join(', ')}` });
  }
  // A record given its end entry `e`, the day `d`: the one it has typed over, or one added.
  function ending(tx, recs, id, e, d) {
    const at = Tree.entryAt(recs, id, e);
    if (at) tx.update(at, { value: d }); else tx.add('record', { at: id, edge: e, field: 'date', value: d });
  }
  // Adding a relation, however it's begun (a box ticked, a dot dragged, a list's Add, a new one named), as one change
  // pending: `rec`, the relation, with its sides in `recs`; `o.make(tx)`, the change that adds it, giving its id. Its row
  // and its bar ask, in one row, its amount where it has one (an ownership's Percentage), first, taking the keys; then
  // the day it holds from: its start entry where it has one (a general partner's Admission Date), the day typed given it,
  // or else From, its own period's; or All along. Enter adds it, with what was typed.
  // The day a relation added holds from till someone says otherwise: the day they went to, where they've gone to one. Today,
  // which nobody has said, is no evidence of when it began: it's all along, which says only that no day was given (dendra.md, Time).
  const begins = () => { const d = Shell.time.peek()?.asOf; return d && d !== Log.today() ? d : null; };
  function relating(rec, o, recs = state.peek()) {
    const start = startOf(rec, recs), amount = amountOf(rec, recs), make = o.make;
    stage({ verb: 'Add', asks: 'from', day: begins(), auto: true, ...o, ...(start && { word: start }), ...(amount && { value: { ...amount, v: null } }),
      make: (tx, d, p) => {
        const id = make(tx, d, p);
        if (id && start && d) tx.add('record', { at: id, edge: start, field: 'date', value: d });
        if (id && p.value && p.value.v !== null && p.value.v !== undefined) tx.add('record', { at: id, edge: p.value.edge, field: p.value.field, value: p.value.v });
        return id;
      } });
  }
  // A relation's amount, as a transfer reads it, for one about to be added: the first figure the schema has at it, in its
  // entries' order, that no formula gives (an ownership's Percentage, not its Voting Percentage); or null.
  function amountOf(r, recs = state.peek()) {
    const t = r?.args && Tree.treeOf({ ...recs, '': r }, ''), N = notes.peek();
    if (!t) return null;
    const order = s => N.order({ args: [{ edge: s.args[0].edge, loc: t }] }) ?? Infinity;
    const s = Object.values(schema.peek()).filter(s => s.args?.length === 1 && FIGURES.has(s.out?.field) && Tree.narrower(t, s.args[0].loc) && !N.resolve('Formula', Tree.bare(s)))
      .sort((a, b) => order(a) - order(b) || a.args[0].edge.localeCompare(b.args[0].edge))[0];
    return s ? { edge: s.args[0].edge, field: s.out.field } : null;
  }

  // ---- Transferring (dendra.md, Time: Transfer): a relation of two sides, a fact entered and held, from the holder its
  // sentence begins with to another record that fits there, on a day, all of it or, where it has an amount, a part ----
  const FIGURES = new Set(['number', 'percent', 'money']);
  const round = x => Math.round(x * 1e9) / 1e9;
  const bind = s => typeof Scene !== 'undefined' ? Scene.bind(s) : s;
  // A relation as a transfer reads it in recs, the chart entered as of a day (the day shown, or the transfer's): its first
  // side, the holder, and the rest; and its amount, the first figure entered at it in its entries' order (an ownership's
  // Percentage), or null. Null where it can't be transferred: one of other than two sides, a formula's (Control), or one
  // ruled out.
  function transferable(rid, recs = entered.peek()) {
    const r = recs[rid];
    if (!r?.args || r.args.length !== 2 || !(r.tag === true || 'choice' in r)) return null;
    const N = notes.peek(), t = Tree.treeOf(recs, rid);
    if (!t || N.resolve('Formula', Tree.bare(Tree.specOf(t)))) return null;
    const first = r.args.find(a => Tree.same(a.edge, N.edges(t)[0])), order = x => N.order(Tree.treeOf(recs, x)) ?? Infinity;
    const amount = (Tree.index(recs).entries.get(rid) ?? []).filter(x => FIGURES.has(recs[x].field) && typeof recs[x].value === 'number')
      .sort((x, y) => order(x) - order(y) || recs[x].edge.localeCompare(recs[y].edge))[0] ?? null;
    return { first, rest: r.args.filter(a => a !== first), amount };
  }
  // A name that reads as a person's: two to four words, each capitalized or an initial, none a word a firm's name has.
  const FIRM = /\b(fund|funds|capital|partners?|holdings?|holdco|trust|group|investors?|compan(y|ies)|co|corp|corporation|inc|incorporated|llc|lp|llp|ltd|limited|plc|gmbh|ag|sa|bv|sarl|pte|foundation|endowment|university|college|school|bank|management|advis[eo]rs?|services|associates|ventures|equity|pension|retirement|system|plan|family|estate|blocker|feeder|gp|software|logistics|industries|international|global|committee|board|office)\b/i;
  const readsAsPerson = name => { const w = Tree.clean(name).split(' '); return w.length > 1 && w.length < 5 && w.every(x => /^\p{Lu}[\p{L}’'.-]*$/u.test(x)) && !FIRM.test(w.join(' ').replace(/\./g, '')); };
  // The kinds a new one can be, in one order, so the top of a list is where it was, the one its name says first (dendra.md, Part 2).
  const newKinds = (kinds, name, of = k => k) => {
    const person = readsAsPerson(name), first = k => (person && /^(individual|person|natural person)$/i.test(of(k)) ? 0 : 1);
    return [...kinds].sort((a, b) => first(a) - first(b) || of(a).localeCompare(of(b)));
  };
  // Who it can go to, by what's typed: each record the chart has that fits its first side where its other side fits as
  // it is, by name, but the one it's from and the one it's of; and the kinds a new one can be, named as it's typed,
  // in that order, as a list's Add offers them.
  function takers(rid, q, base = null) {
    const recs = base ?? state.peek(), r = recs[rid], tr = r && transferable(rid, base ?? entered.peek());
    if (!tr) return { found: [], kinds: [] };
    const N = notes.peek(), other = tr.rest[0], there = Tree.treeOf(recs, other.at);
    const ways = N.fitting(schema.peek(), strip(Tree.treeOf(recs, rid))).filter(s => s.args.length === 2 && ('choice' in r ? s.out?.choice === r.choice : s.out?.tag === true))
      .map(s => ({ mine: s.args.find(a => Tree.same(a.edge, tr.first.edge)), theirs: s.args.find(a => Tree.same(a.edge, other.edge)) }))
      .filter(w => w.mine && w.theirs && Tree.narrower(there, w.theirs.loc));
    const not = new Set([tr.first.at, other.at].map(x => Tree.objectOf(recs, x))), words = Tree.norm(q ?? ''), seen = new Set(), found = [];
    for (const x of Object.keys(recs)) {
      const b = Tree.objectOf(recs, x);
      if (seen.has(b) || not.has(b) || 'field' in recs[x] || Tree.isView(recs[b] ?? {})) continue;
      const names = [N.nameOf(recs, b), N.shortOf(recs, b)];
      if (!names.some(s => Tree.norm(s).includes(words))) continue;
      const t = Tree.treeOf(recs, x);
      if (!t || !ways.some(w => Tree.narrower(t, w.mine.loc))) continue;
      seen.add(b);
      found.push({ at: x, name: names[0], short: names[1], kind: recs[b].kind });
    }
    const kinds = newKinds(new Set(ways.map(w => w.mine.loc).filter(l => l.kind && !l.args).map(l => l.kind)), q);
    // A name typed whole first, then those it begins, then the rest, each by name.
    const near = f => [f.name, f.short].some(s => Tree.same(s, q ?? '')) ? 0 : [f.name, f.short].some(s => Tree.norm(s).startsWith(words)) ? 1 : 2;
    return { found: found.sort((a, b) => near(a) - near(b) || a.name.localeCompare(b.name)), kinds };
  }
  // The records a transfer writes (dendra.md, Time: Transfer), on tx dated its day `d`, reading the chart entered as of
  // that day: `to`, the record it goes to ({ at }) or a new one ({ kind, name }); `part`, the amount, or null for all.
  // `o`, made again (dendra.md, Change): `at`, the chart it reads, `made`, the id the relation it makes keeps, and `keep(edge)`,
  // each entry's. → the relation it goes to.
  function transfer(tx, rid, { to, part, other = false }, d, o = {}) {
    const at = o.at ?? book.peek().asOf(chart.peek(), d), r = at[rid], tr = r && transferable(rid, at), N = notes.peek();
    if (!tr || !to) return null;
    const amt = tr.amount && at[tr.amount], v = amt ? amt.value : null, q = v === null ? null : part == null ? v : Math.min(part, v), all = v === null || q >= v - 1e-9;
    const entries = x => Tree.index(at).entries.get(x) ?? [];
    // A figure entered beside the amount that says it again (a Voting Percentage of the same 82%) is the amount said
    // again, and goes with it.
    const says = (x, of = amt) => !!of && at[x].field === of.field && at[x].value === of.value;
    // From: all of it, ended on the day as a deletion ends it; a part, its amount less the part from the day.
    if (all) { const e = endOf(rid, at); if (typeof e === 'string') ending(tx, at, rid, e, d); else tx.remove(rid, d); }
    else for (const x of entries(rid)) if (says(x)) tx.update(x, { value: round(at[x].value - q) });
    // To: the one it goes to, made with it where it's new; and where it holds such a relation already, that one's
    // amount grows by the part, from the day.
    const b = to.at ?? (x => { tx.add('record', { at: x, edge: 'Name', field: 'text', value: to.name }, to.nameId); return x; })(tx.add('record', { kind: to.kind }, to.id));
    // A new one is shown on the chart shown as of the day, where that would hide it (App.showMade), once it's related.
    const shownToo = () => { if (!to.at) showMade(tx, [b], Shell.view.peek(), d > day.peek() ? d : day.peek()); };
    // (`other`: its other side is what's given another, a line's end dragged there: see repoint.)
    const like = { args: other ? [{ edge: tr.first.edge, at: tr.first.at }, { edge: tr.rest[0].edge, at: b }] : [{ edge: tr.first.edge, at: b }, ...tr.rest.map(a => ({ edge: a.edge, at: a.at }))], ...('choice' in r ? { choice: r.choice } : { tag: true }) };
    const held = to.at && Object.keys(at).find(x => x !== rid && at[x].args?.length === 2 && ('choice' in r ? at[x].choice === r.choice : at[x].tag === true)
      && like.args.every(a => at[x].args.some(c => Tree.same(c.edge, a.edge) && c.at === a.at)) && Tree.same(N.nameOf(at, x), N.nameOf(at, rid)));
    if (held) {
      const its = entries(held).find(x => Tree.same(at[x].edge, amt?.edge ?? ''));
      if (!amt) return held;
      if (!its) tx.add('record', { at: held, edge: amt.edge, field: amt.field, value: q });
      else for (const x of entries(held)) if (says(x, at[its])) tx.update(x, { value: round(at[x].value + q) });
      return held;
    }
    const made = tx.add('record', like, o.made ?? undefined), start = startOf(like, at);
    if (start) tx.add('record', { at: made, edge: start, field: 'date', value: d }, o.keep?.(start));
    // What's entered at it is copied, as it is, but its days, which are the old one's own; the amount, and what says it
    // again, are the part.
    const copy = (x, into) => {
      const { id: _, record: __, since: ___, before: ____, at: _____, ...e } = at[x];
      const y = tx.add('record', { ...e, at: into, ...(says(x) && { value: q }) }, into === made ? o.keep?.(at[x].edge) : undefined);
      for (const k of entries(x)) if (at[k].field !== 'date') copy(k, y);
    };
    for (const x of entries(rid)) if (at[x].field !== 'date') copy(x, made);
    shownToo();
    return made;
  }
  // Transfer…: begun as a change pending, redlined, asking whom (Transferring, in its bar and atop the relation's panel,
  // shown and selected), how much and on what day, the day shown unless another is typed; Enter or Transfer makes it, and
  // selects the relation it went to, where it holds on the day shown.
  function transferring(rid, o = {}) {
    if (!transferable(rid)) return;
    const recs = state.peek(), N = notes.peek();
    let to = null, fresh = null, holder = null;
    stage({ verb: 'Transfer', what: `${N.nameOf(recs, rid)}: ${N.segmentOf(recs, rid)}`, source: 'transfer ' + rid, needs: [rid], transfer: { rid, to: null, part: null },
      asks: 'on', day: day.peek(), auto: true, Fill: Transferring, ready: p => !!p.transfer.to && p.transfer.part !== undefined,
      make: (tx, d, p) => {
        const on = book.peek().asOf(chart.peek(), d);
        to = transfer(tx, rid, p.transfer, d);
        holder = holderOf(rid, on);
        fresh = p.transfer.to?.kind ? tx.asOf(d)[to]?.args.find(a => Tree.same(a.edge, transferable(rid, on).first.edge))?.at : null;
      }, say: c => Time.describe(c),
      // A new holder, offered a holder of its own: what it holds now has nothing above it.
      go: () => (fresh && holder && [`Add ${holder.article} ${holder.one} of ${bind(N.shortOf(state.peek(), fresh) ?? '')}…`, () => Shell.parts.peek().inspector?.addTo?.(fresh, holder.list)]) || null,
      done: () => { if (to && state.peek()[to]) Shell.select([to]); }, ...o });
    Shell.showPanel?.();
    if (Shell.selection.peek().join() !== rid) Shell.select([rid]);
  }
  // A relation's line end dragged to another box asks whether it's to go there, as what it would be. The holder's end is a transfer to that box, its bar asking how much and when. The other
  // end is the same relation of another thing: it ends on the day and the same holder has that from the day, one change pending, redlined, what's entered at it going with it. A box it can't
  // be says so by name, and nothing's begun.
  function repoint(rid, b, was) {
    const recs = state.peek(), N = notes.peek(), tr = transferable(rid), name = x => N.shortOf(recs, x);
    if (!tr) return;
    const what = N.nameOf(recs, rid), cant = side => Shell.toast(`${name(b)} can’t be ${side} of ${what} here: nothing changed`, { ms: 4000 });
    if (Tree.objectOf(recs, tr.first.at) === was) {
      const t = takers(rid, N.nameOf(recs, b)).found.find(f => Tree.objectOf(recs, f.at) === b);
      return t ? transferring(rid, { transfer: { rid, to: { at: t.at, name: t.name, short: t.short }, part: null } }) : cant(Tree.same(tr.first.edge, what) ? 'a side' : `the ${tr.first.edge}`);
    }
    if (!waysOf(rid, recs, tr).some(w => Tree.narrower(Tree.treeOf(recs, b), w.theirs.loc))) return cant(`the ${tr.rest[0].edge}`);
    let made = null;
    stage({ verb: 'Re-point', what: `${what}: ${N.segmentOf(recs, rid)}, to ${name(b)}`, source: 'repoint ' + rid, needs: [rid, b], asks: 'on', day: day.peek(), auto: true,
      make: (tx, d) => { made = transfer(tx, rid, { to: { at: b }, part: null, other: true }, d); }, say: () => `Re-pointed ${what}: ${N.segmentOf(recs, rid)}, to ${name(b)}`,
      done: () => { if (made && state.peek()[made]) Shell.select([made]); } });
    Shell.showPanel?.();
  }
  // Moving (dendra.md, Time): in a chart that says no figures, a relation its page draws ranking its boxes (Reports To, Parent Of), by which `box` could stand under `over`, a record or
  // a new one's kind. Of several, the one it stands under already, then the one that's on top by already. → { s, top, low, name } or null.
  const figureless = () => !Object.values(schema.peek()).some(s => s.args?.length === 1 && s.out?.field === 'percent' && s.args[0].loc.args);
  const linesOver = (x, w, recs = state.peek()) => (Tree.index(recs).relations.get(x) ?? []).filter(rid => recs[rid].tag === true && recs[rid].args?.length === 2 && !result.peek().computed[rid] && Tree.same(notes.peek().nameOf(recs, rid), w.name) && recs[rid].args.find(a => Tree.same(a.edge, w.low))?.at === x);
  const topOf = (rid, w, recs = state.peek()) => Tree.objectOf(recs, recs[rid].args.find(a => Tree.same(a.edge, w.top)).at);
  function rankBy(box, over, recs = state.peek()) {
    const N = notes.peek(), view = Shell.view.peek(), tb = Tree.treeOf(recs, box), to = typeof over === 'string' ? Tree.treeOf(recs, over) : { kind: over.kind };
    if (!tb || !to || !figureless()) return null;
    const ways = [];
    for (const s of Object.values(schema.peek())) {
      if (s.args?.length !== 2 || !('tag' in s.out) || N.resolve('Formula', Tree.bare(s))) continue;
      const p = Tree.bare(s), a = N.value('Above', p, view);
      if (a === 'none' || a === 'level' || N.value('Shown', s, view) !== true) continue;
      const top = a ?? N.edges(p)[0], hi = s.args.find(x => Tree.same(x.edge, top)), lo = s.args.find(x => x !== hi);
      if (hi && lo && Tree.narrower(to, hi.loc) && Tree.narrower(tb, lo.loc) && !ways.some(w => Tree.same(w.name, N.name(p)))) ways.push({ s, top: hi.edge, low: lo.edge, name: N.name(p) });
    }
    const held = w => (linesOver(box, w, recs).length ? 0 : 1), onTop = w => (typeof over === 'string' && (Tree.index(recs).relations.get(over) ?? []).some(rid => Tree.same(N.nameOf(recs, rid), w.name) && recs[rid].args.find(a => Tree.same(a.edge, w.top))?.at === over) ? 0 : 1);
    return ways.sort((a, b) => held(a) - held(b) || onTop(a) - onTop(b))[0] ?? null;
  }
  // Whether every one of these can be moved under that one.
  const movable = (boxes, over) => boxes.length > 0 && !boxes.includes(over) && boxes.every(x => !!rankBy(x, over));
  // What a box stands under by such a relation, if anything: the way, as rankBy says it, whatever's on top. → { s, top, low, name } or null.
  function rankOver(box, recs = state.peek()) {
    const N = notes.peek(), view = Shell.view.peek();
    if (!figureless()) return null;
    const rid = (Tree.index(recs).relations.get(box) ?? []).find(x => { const r = recs[x]; if (r.tag !== true || r.args?.length !== 2 || result.peek().computed[x]) return false; const p = Tree.bare(Tree.treeOf(recs, x)), a = N.value('Above', p, view); return a !== 'none' && a !== 'level' && !Tree.same(a ?? N.edges(p)[0], r.args.find(y => y.at === box)?.edge ?? '') && !!Object.values(schema.peek()).find(s => s.args?.length === 2 && Tree.same(N.name(Tree.bare(s)), N.name(p)) && N.value('Shown', s, view) === true); });
    if (!rid) return null;
    const p = Tree.bare(Tree.treeOf(recs, rid)), a = N.value('Above', p, view), top = a ?? N.edges(p)[0];
    return { s: Tree.specOf(Tree.treeOf(recs, rid)), top, low: recs[rid].args.find(y => !Tree.same(y.edge, top)).edge, name: N.name(p) };
  }
  // How one under it is said, as a question to it: Report to, Child of.
  function rankWord(w) {
    const p = Tree.bare(w.s), N = notes.peek(), up = t => t.replace(/^./, c => c.toUpperCase()), [a, words] = typeof FormulaBar !== 'undefined' ? FormulaBar.phrase(p, w.low, w.top) : [null, ''];
    const noun = /^ is (?:an? )?(.*) $/.exec(words);
    if (Tree.same(a ?? '', w.low) && words && !noun) { const [verb, ...rest] = words.trim().split(' '); return up([Tree.singular(verb), ...rest].join(' ')); }
    if (Tree.same(a ?? '', w.low) && noun && !/^(linked to)$/.test(noun[1])) return up(noun[1]);
    return `${up(lowered(Tree.singular(N.listName(p, w.low))))} of`;
  }
  // Moved under another: one change, a question in its bar and its redline, whoever's moved and however many: each one's lines of that relation end (on the day, where the
  // chart keeps them), and it has the one, a new one made with it. `alone`, what As well does, where a person could mean a second as well as another (a list's +).
  function moving(boxes, over, o = {}) {
    const recs = state.peek(), N = notes.peek(), name = x => bind(N.shortOf(recs, x)), fresh = typeof over === 'string' ? null : over, to = fresh ? fresh.name : name(over);
    const moves = [...new Set(boxes)].filter(x => x !== over && recs[x]?.kind).map(x => ({ x, w: rankBy(x, over) })).filter(m => m.w).map(m => ({ ...m, olds: linesOver(m.x, m.w) }));
    if (!moves.length) return null;
    // (Nobody's under what's under them.)
    const upFrom = m => { const seen = new Set(), walk = [over]; while (walk.length) { const y = walk.pop(); if (typeof y !== 'string' || seen.has(y)) continue; seen.add(y); walk.push(...linesOver(y, m.w).map(rid => topOf(rid, m.w))); } return seen; };
    const loop = moves.find(m => upFrom(m).has(m.x));
    if (loop) { Shell.toast(`${to} stands under ${name(loop.x)}: nothing changed`, { ms: 4000 }); return false; }
    const todo = moves.filter(m => !m.olds.some(rid => topOf(rid, m.w) === over));
    if (!todo.length) { Shell.toast(`${moves.length > 1 ? `All ${moves.length} are` : `${name(moves[0].x)} is`} there already: nothing changed`, { ms: 3000 }); return false; }
    const w = todo[0].w, list = xs => (xs.length > 2 ? `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}` : xs.join(' and '));
    const who = todo.length > 3 ? `${todo.length} ${Tree.plural(lowered(Tree.singular(N.listName(Tree.bare(w.s), w.low))))}` : list(todo.map(m => name(m.x))), from = [...new Set(todo.flatMap(m => m.olds.map(rid => name(topOf(rid, m.w)))))];
    const asked = `${rankWord(w)} ${to}${from.length ? ` instead of ${list(from)}` : ''}?`, says = `Moved ${who} to ${to}`;
    stage({ verb: 'Change', act: from.length ? 'Move' : 'Add', what: `${who} to ${to}`, parts: [html`<span class="add">${who}: ${asked}</span>`], source: `move ${todo.map(m => m.x).join()}`, needs: [...todo.map(m => m.x), ...(fresh ? [] : [over]), ...todo.flatMap(m => m.olds)], asking: true, ...(isDated.peek() && { asks: 'on', day: day.peek() }),
      ...(o.alone && from.length && { instead: { label: 'As well', run: () => { discard({ quiet: true }); o.alone(); } } }),
      make: (tx, d) => {
        const b = !fresh ? over : (y => { tx.add('record', { at: y, edge: 'Name', field: 'text', value: fresh.name }); return y; })(tx.add('record', { kind: fresh.kind }));
        for (const m of todo) { m.olds.forEach(rid => tx.remove(rid, d || undefined)); tx.add('record', enterAt(tx, { args: [{ edge: m.w.low, at: m.x }, { edge: m.w.top, at: b }], tag: true, ...(d && { since: d }) })); }
        tx.says(says);
      }, say: says, done: () => Shell.select(todo.map(m => m.x)) });
    return true;
  }
  // The ways a relation of two sides can run, of the sides `tr` reads it by, whatever's at them.
  function waysOf(rid, recs, tr) {
    const r = recs[rid], other = tr.rest[0];
    return notes.peek().fitting(schema.peek(), strip(Tree.treeOf(recs, rid))).filter(s => s.args.length === 2 && ('choice' in r ? s.out?.choice === r.choice : s.out?.tag === true))
      .map(s => ({ mine: s.args.find(a => Tree.same(a.edge, tr.first.edge)), theirs: s.args.find(a => Tree.same(a.edge, other.edge)) })).filter(w => w.mine && w.theirs);
  }
  // A record of this tree can stand between a relation's holder and what it holds: holding that, and held by the holder.
  function fitsBetween(rid, recs, tr, t) {
    const ways = waysOf(rid, recs, tr), up = Tree.treeOf(recs, tr.first.at), down = Tree.treeOf(recs, tr.rest[0].at);
    return ways.some(w => Tree.narrower(t, w.mine.loc) && Tree.narrower(down, w.theirs.loc)) && ways.some(w => Tree.narrower(up, w.mine.loc) && Tree.narrower(t, w.theirs.loc));
  }
  // What a new holder's own holder is called, by the list the relation makes at it ("an owner"), where one can hold it.
  function holderOf(rid, recs = entered.peek()) {
    const tr = transferable(rid, recs);
    if (!tr?.amount) return null;
    const one = notes.peek().listName(Tree.treeOf(recs, rid), tr.first.edge), word = lowered(one).replace(/ies$/, 'y').replace(/(?<!s)s$/, '');
    return { list: one, one: word, article: /^[aeiou]/i.test(word) ? 'an' : 'a' };
  }
  // Inserting one between (dendra.md, Time): a stake that a record of the kinds can stand in the middle of. A relation's
  // amount is a percentage of what it holds, so the new one's 100% of that, the old holder's, says the same.
  // In a chart that says no figures, any relation that ranks its boxes takes one between: a manager's manager.
  function interposable(rid, recs = entered.peek()) {
    const tr = recs[rid] && transferable(rid, recs);
    if (!tr) return false;
    const figured = Object.values(schema.peek()).some(s => s.args?.length === 1 && s.out?.field === 'percent' && s.args[0].loc.args);
    const ranks = () => { const a = notes.peek().value('Above', Tree.bare(Tree.treeOf(recs, rid)), Shell.view.peek()); return a !== 'none' && a !== 'level'; };
    return (tr.amount ? recs[tr.amount].field === 'percent' : !figured && ranks()) && takers(rid, '').kinds.some(k => fitsBetween(rid, recs, tr, { kind: k }));
  }
  // The word for it, by the kind that would stand between them: Insert an entity between…
  function interposeWord(rid, recs = entered.peek()) {
    const tr = recs[rid] && transferable(rid, recs), k = tr && (takers(rid, '').kinds.filter(x => fitsBetween(rid, recs, tr, { kind: x })).find(x => Tree.same(x, recs[Tree.objectOf(recs, tr.rest[0].at)]?.kind ?? '')) ?? takers(rid, '').kinds.find(x => fitsBetween(rid, recs, tr, { kind: x })));
    const word = k ? lowered(k) : 'one';
    return `Insert ${k ? (/^[aeiou]/i.test(word) ? 'an ' : 'a ') : ''}${word} between…`;
  }
  function interpose(tx, rid, to, d, o = {}) {
    const at = o.at ?? book.peek().asOf(chart.peek(), d), r = at[rid], tr = transferable(rid, at), amt = at[tr.amount], entries = Tree.index(at).entries.get(rid) ?? [];
    const under = transfer(tx, rid, { to, part: null }, d, o), mid = tx.asOf(d)[under].args.find(a => Tree.same(a.edge, tr.first.edge)).at;
    const up = tx.add('record', { args: [{ edge: tr.first.edge, at: tr.first.at }, { edge: tr.rest[0].edge, at: mid }], ...('choice' in r ? { choice: r.choice } : { tag: true }) }, o.up ?? undefined);
    const start = startOf(tx.asOf(d)[up], tx.asOf(d));
    if (start) tx.add('record', { at: up, edge: start, field: 'date', value: d }, o.keepUp?.(start));
    if (amt) for (const x of entries) if (at[x].field === amt.field && at[x].value === amt.value) tx.add('record', { at: up, edge: at[x].edge, field: at[x].field, value: 1 }, o.keepUp?.(at[x].edge));
    return { up, mid };
  }
  // Insert an entity between…: begun as a transfer is, asking whom (a new one named as it's typed, or one the chart has that
  // fits both sides) and on what day. It's one change. The new box goes between them, on the chart shown, its lines to them.
  function interposing(rid) {
    if (!interposable(rid)) return;
    const recs = state.peek(), N = notes.peek(), tr = transferable(rid), up = Tree.objectOf(recs, tr.first.at), low = Tree.objectOf(recs, tr.rest[0].at);
    // What the lower holds by this relation, all the way down: it moves with it, where the new box needs the room.
    const name = N.nameOf(recs, rid), under = [], step = x => { for (const id of Object.keys(recs)) { const r = recs[id]; if (r.args?.length !== 2 || id === rid || !Tree.same(N.nameOf(recs, id), name)) continue; const t = transferable(id); if (t && Tree.objectOf(recs, t.first.at) === x) { const y = Tree.objectOf(recs, t.rest[0].at); if (y !== low && !under.includes(y)) { under.push(y); step(y); } } } };
    step(low);
    let made = null, fresh = false, on = null;
    stage({ verb: 'Insert', what: `${name}: ${N.segmentOf(recs, rid)}`, source: 'insert ' + rid, needs: [rid], transfer: { rid, to: null, part: null }, between: true,
      asks: 'on', day: day.peek(), auto: true, Fill: Transferring, ready: p => !!p.transfer.to,
      make: (tx, d, p) => {
        made = interpose(tx, rid, p.transfer.to, d);
        fresh = p.transfer.to.kind ?? false;
        on = d;
        if (fresh && typeof Canvas !== 'undefined') Canvas.active.peek()?.between(tx, { up, low, under, id: made.mid }, p.transfer.to.kind);
      }, placing: () => (made && fresh ? { up, low, under, id: made.mid } : null),
      // Its day offered as the new company's start (a Formation Date), a click from typing it again.
      go: () => { const e = fresh && startOf({ kind: fresh }); return e && made ? [`${actOf(e)?.[1] ?? e} ${Tree.formatDate(on, 'short')}`, () => change(tx => tx.add('record', { at: made.mid, edge: e, field: 'date', value: on }), { dated: false })] : null; },
      say: c => Time.describe(c), done: () => { if (made && state.peek()[made.mid]) Shell.select([made.mid]); } });
    Shell.showPanel?.();
    if (Shell.selection.peek().join() !== rid) Shell.select([rid]);
  }
  // ---- A change changed (dendra.md, Change): its act asked again, in its own bar, with what it was in place; made, it's one
  // change, an amendment, saying what moved, both sides together ----
  // What moved, as History says it: "10% → 15%", "Dec 15 → Dec 20", a day's year only where the two differ.
  const moved = (a, b) => (a === b ? null : `${a} → ${b}`);
  const movedDay = (a, b) => { const y = !!a && !!b && a.slice(0, 4) === b.slice(0, 4), f = d => { if (!d) return 'all along'; const s = Tree.formatDate(d, 'short'); return y ? s.replace(/, \d{4}$/, '') : s; }; return a === b ? null : `${f(a)} → ${f(b)}`; };
  // Whose stake a change's act was of, by the side a relation doesn't begin from: so its entry says which, among many.
  const stakeIn = (on, rid) => { const t = Tree.treeOf(on, rid), first = notes.peek().edges(t)[0]; return on[rid].args.find(a => !Tree.same(a.edge, first))?.at; };
  const whatMoved = (noun, parts) => `Changed ${noun}: ${parts.filter(Boolean).join(', ')}`;
  // The chart as of a day without what a change recorded: what its act reads, made again.
  const without = c => { const kept = new Map(); return d => { if (!kept.has(d)) { const tx = edit(false, []); tx.unmake(c.id); kept.set(d, tx.asOf(d)); } return kept.get(d); }; };
  // What's recorded at what it'd leave with no row, by name, as Undo says it: the records it recorded that its act, made again, leaves none of.
  const restsOn = (c, p) => {
    if (!ready(p)) return [];
    const tx = edit(datedOf(p), []);
    p.make(tx, p.day, p);
    return Time.takenBy(c, [...new Set(c.adds.filter(r => 'record' in r).map(r => r.record))].filter(x => !tx.item(x).length));
  };
  const nameIn = (recs, x) => { const o = Tree.objectOf(recs, x), N = notes.peek(), s = N.shortOf(recs, o); return bind(s !== N.nameOf(recs, o) ? s.replace(/^The /, 'the ') : s); };
  // Each entry the relation it makes had, kept by its edge.
  const keptAt = (c, rel) => edge => c.adds.find(r => r.at === rel && Tree.same(r.edge ?? '', edge))?.record;
  function amendingTransfer(c, act, o) {
    const base = without(c), on = base(act.day), tr = transferable(act.rid, on), N = notes.peek();
    if (!tr) return false;
    const toWas = act.fresh || { at: act.to, name: N.nameOf(on, Tree.objectOf(on, act.to)), short: N.shortOf(on, Tree.objectOf(on, act.to)) }, wasPart = act.whole ? null : act.q;
    const label = t => t.at ? nameIn(on, t.at) : t.name;
    const sameTo = t => (t.at ?? null) === (toWas.at ?? null) && (t.kind ? t.name === toWas.name && t.kind === toWas.kind : true);
    stage({ verb: 'Change', what: `the transfer of ${N.segmentOf(on, act.rid)}`, source: 'amend ' + c.id, needs: [act.rid], amending: [act.rid, act.made].filter(Boolean), amends: c,
      transfer: { rid: act.rid, to: toWas, part: o.part === undefined ? wasPart : o.part, base, day: act.day },
      asks: 'on', day: act.day, Fill: Transferring, ready: p => !!p.transfer.to && p.transfer.part !== undefined,
      // (It can be made again only on a day what it's of holds.)
      fits: p => !p.day || !!transferable(act.rid, base(p.day)), bad: p => (p.day && !transferable(act.rid, base(p.day)) ? `${N.segmentOf(on, act.rid)} doesn’t hold on that day` : null),
      make: (tx, d, p) => {
        const { to, part } = p.transfer;
        if (!d || (d === act.day && (part ?? null) === (wasPart ?? null) && sameTo(to))) return;
        tx.unmake(c.id);
        const at = tx.asOf(d), amt = transferable(act.rid, at)?.amount, whole = amt ? at[amt].value : null, f = v => Tree.format(act.field ?? at[amt]?.field, v);
        transfer(tx, act.rid, p.transfer, d, { at, made: act.made, keep: keptAt(c, act.made) });
        tx.says(whatMoved(`the transfer of ${nameIn(on, stakeIn(on, act.rid))}`, [act.field && moved(f(act.q), f(part ?? whole)), moved(label(toWas), label(to)), movedDay(act.day, d)]));
      }, say: x => Time.describe(x) });
    return true;
  }
  function amendingInsert(c, act) {
    const base = without(c), on = base(act.day), N = notes.peek();
    if (!transferable(act.rid, on)) return false;
    const toWas = act.fresh || { at: act.mid, name: N.nameOf(on, Tree.objectOf(on, act.mid)), short: N.shortOf(on, Tree.objectOf(on, act.mid)) }, label = t => t.at ? nameIn(on, t.at) : t.name;
    stage({ verb: 'Change', what: `the insertion in ${N.segmentOf(on, act.rid)}`, source: 'amend ' + c.id, needs: [act.rid], amending: [act.rid, act.up, act.made], amends: c,
      transfer: { rid: act.rid, to: toWas, part: null, base, day: act.day }, between: true,
      asks: 'on', day: act.day, Fill: Transferring, ready: p => !!p.transfer.to,
      fits: p => !p.day || !!transferable(act.rid, base(p.day)), bad: p => (p.day && !transferable(act.rid, base(p.day)) ? `${N.segmentOf(on, act.rid)} doesn’t hold on that day` : null),
      make: (tx, d, p) => {
        const { to } = p.transfer;
        if (!d || (d === act.day && label(to) === label(toWas))) return;
        tx.unmake(c.id);
        interpose(tx, act.rid, to, d, { at: tx.asOf(d), made: act.made, up: act.up, keep: keptAt(c, act.made), keepUp: keptAt(c, act.up) });
        tx.says(whatMoved(`the insertion in ${nameIn(on, stakeIn(on, act.rid))}`, [moved(label(toWas), label(to)), movedDay(act.day, d)]));
      }, say: x => Time.describe(x) });
    return true;
  }
  function amendingMerger(c, act) {
    const base = without(c), on = base(act.day), m = endsOf(act.id, on).find(e => Tree.same(e.edge, act.edge));
    if (!m?.rel) return false;
    const label = x => nameIn(on, x);
    stage({ verb: 'Change', what: notes.peek().nameOf(on, act.id), source: 'amend ' + c.id, needs: [act.id], amending: [act.id], amends: c, asks: 'until', word: act.edge, day: act.day, from: act.since,
      merge: { rel: m.rel, to: { at: act.into }, base: () => base(act.day) }, Fill: Merging, ready: p => p.day === null || !!p.merge.to,
      make: (tx, d, p) => {
        const to = p.merge.to?.at;
        if (d === act.day && to === act.into) return;
        tx.unmake(c.id);
        if (d) { tx.add('record', { at: act.id, edge: act.edge, field: 'date', value: d }, act.end); tx.add('record', { args: [{ edge: m.rel.edges[0], at: act.id }, { edge: m.rel.edges[1], at: to }], tag: true }, act.rel); }
        tx.says(d ? whatMoved(`the merger of ${label(act.id)}`, [moved(label(act.into), label(to)), movedDay(act.day, d)]) : `Took back the merger of ${label(act.id)} into ${label(act.into)}`);
      }, say: x => Time.describe(x) });
    return true;
  }
  // A value typed from a day: its rows' day and its value, those either side meeting where they met. `by`, the change that said it.
  // One record, its amount in place where it's a figure or words; several from the one day, the day alone.
  function amendingValues(by, parts) {
    const c = chart.peek(), wb = book.peek(), of = p => wb.item(c, p.id), day0 = parts[0].day, one = parts.length === 1 ? parts[0] : null, N = notes.peek();
    const row = p => of(p).find(x => x.since === day0), prev = p => of(p).find(x => x.before === day0);
    if (parts.some(p => !row(p))) return false;
    const then = wb.asOf(c, day0), r = one && row(one), figure = r && 'field' in r && r.field !== 'document' && r.field !== 'date';
    const words = p => valueWords(p.id, then);
    // (It amends the change that said it only where that's all that change did: a bulk entry stands, and this is a change of its own.)
    const whole = by && Time.act(by)?.type === 'value' && parts.every(p => Time.act(by).parts.some(q => q.id === p.id)) ? by : null;
    const fits = d => d === null || parts.every(p => (!prev(p)?.since || d > prev(p).since) && (!row(p).before || d < row(p).before));
    stage({ verb: 'Change', what: one ? words(one) : `${parts.length} values`, source: 'amend value ' + day0, needs: parts.map(p => p.id), amends: by, asks: 'from', word: undefined, day: day0, along: 'a correction',
      ...(figure && { value: { edge: r.edge ?? N.nameOf(then, one.id), field: r.field, v: r.value } }), fits: p => fits(p.day), bad: p => p.day && !fits(p.day) ? 'It has to fall between the days either side' : null,
      make: (tx, d, p) => {
        const value = p.value?.v ?? r?.value;
        if (d === day0 && (!one || value === r.value)) return;
        if (whole) tx.amends(whole.id);
        for (const q of parts) {
          const now = tx.item(q.id), a = now.find(x => x.since === day0), b = now.find(x => x.before === day0), set = one && figure ? { value } : {};
          if (d === null) {
            for (const x of now) if (x !== a && x.since < day0) tx.revise(x, null);
            if (b) tx.revise(b, null);
            const { since: _, ...rest } = a;
            tx.revise(a, { ...rest, ...set });
          } else {
            if (b) tx.revise(b, { ...b, before: d });
            tx.revise(a, { ...a, since: d, ...set });
          }
        }
        tx.says(whatMoved(one ? words(one) : `${parts.length} values`, [one && figure && moved(Tree.format(r.field, r.value), Tree.format(r.field, value)), movedDay(day0, d)]));
      }, say: x => Time.describe(x) });
    return true;
  }
  // The day a relation holds from, or a record ends on, its rows' and those of what's at it.
  function amendingDay(by, id, which, was) {
    const wb = book.peek(), c = chart.peek(), then = wb.asOf(c, which === 'since' ? was : (d => { const y = new Date(d + 'T12:00:00'); y.setDate(y.getDate() - 1); return Tree.isoOf(y); })(was)), N = notes.peek();
    const what = then[id]?.args ? `${N.nameOf(then, id)}: ${N.segmentOf(then, id)}` : N.nameOf(then, id);
    // (As a value's: a bulk entry stands.)
    const whole = by && ['added', 'ended'].includes(Time.act(by)?.type) && Time.act(by).id === id ? by : null;
    stage({ verb: 'Change', what, source: 'amend day ' + id, needs: [id], amending: [id], amends: by, ...(which === 'since' ? { asks: 'from' } : { asks: 'on', word: 'Ends on' }), day: was,
      make: (tx, d) => {
        if (d === was || d === undefined) return;
        if (whole) tx.amends(whole.id);
        tx.redate(id, which, was, d);
        tx.says(whatMoved(`the day of ${what}`, [movedDay(was, d)]));
      }, say: x => Time.describe(x) });
    return true;
  }
  // Change…, a change's: its own bar, its day and amount in place, the keys on the day (`o.focus`) or else its amount. One a
  // later change took a row of says so, by name, with a way to it, as Undo says it. → whether it was begun.
  function amending(c, o = {}) {
    if (readOnly.peek()) return refuse(), false;
    const act = Time.act(c), bar = act && Time.barred(c);
    if (!act) return false;
    if (bar) { Shell.toast(`A later change rests on it: ${Time.describe(bar)}`, { go: ['Show it', () => Time.go(bar)] }); return false; }
    const begun = act.type === 'transfer' ? amendingTransfer(c, act, o) : act.type === 'insert' ? amendingInsert(c, act) : act.type === 'merger' ? amendingMerger(c, act)
      : act.type === 'value' ? amendingValues(c, act.parts) : amendingDay(c, act.id, act.type === 'added' ? 'since' : 'before', act.day);
    if (!begun) { Shell.toast('It has changed since'); return false; }
    // Its panel, where it's asked too, on what it made where that holds on the day shown.
    const here = pending.peek()?.amending?.find(x => state.peek()[x]);
    if (here && !Shell.selection.peek().some(k => pending.peek().amending.includes(k))) Shell.select([here]);
    keysOnBar(o.focus);
    return true;
  }
  // A value's row, its own From: Change this day… on it. `row`, the version; the change that first said it, read back as an act
  // of values where it's only that, or its row alone.
  function amendingRow(id, row) {
    if (readOnly.peek()) return refuse(), false;
    // (The change that said it from that day, whatever's split its row since.)
    const c = chart.peek(), by = book.peek().changes().find(x => x.chart === c && x.adds.some(r => r.record === id && r.since === row.since)) ?? null, act = by && Time.act(by);
    if (act?.type === 'value' && act.day === row.since && act.parts.length > 1) return amending(by, { focus: 'day' });
    if (!amendingValues(by, [{ id, day: row.since }])) return false;
    keysOnBar('day');
    return true;
  }
  // A value as a sentence says whose, as of `recs`: "Fund III's stake in Corvane".
  const valueWords = (id, recs) => { const r = recs[id]; return !r ? '' : typedWords({ id, slot: r, out: r }, recs).replace(/ is [^]*$/, ''); };

  // A transfer set out with what it asks in place, in the order it's asked: from whom, to whom (a search of who can take
  // it, or a new one named as it's typed, a key typed there beginning the search), and how much (where the relation has
  // an amount, all of it till a part is typed) of what it's of: "From Fund III Blocker to [Northwind Holdings LLC]: [82%]
  // of Halvard Logistics Holdings, Inc.". Whom picked, the keys go on to how much, or else the day. `auto`, where it was
  // asked: the keys are its, and whom is asked at once.
  let asked = 0;
  function Transferring({ p, auto }) {
    const { useRef, useState, useLayoutEffect } = preactHooks;
    const whom = useRef(), much = useRef(), [text, setText] = useState(null), was = useRef(null);
    // (A transfer being changed reads the chart without it, as of its day: dendra.md, Change.)
    const { rid, to, part, base } = p.transfer, then = base?.(p.day ?? p.transfer.day) ?? null, recs = then ?? state.value, ent = then ?? entered.value, N = notes.value, tr = recs[rid] && transferable(rid, ent);
    const set = x => amend(p, { transfer: { ...pending.peek().transfer, ...x } });
    const on = () => setTimeout(() => { const el = much.current ?? whom.current?.closest('.pendbar')?.querySelector('.when input'); el?.focus(); el?.select?.(); });
    const fits = x => !p.between || fitsBetween(rid, recs, tr, x);
    const choose = (anchor, query) => Shell.menu(anchor, q => {
      const { found: all, kinds: every } = takers(rid, q, then), named = Tree.clean(q ?? ''), found = all.filter(f => fits(Tree.treeOf(recs, f.at))), kinds = every.filter(k => fits({ kind: k }));
      return [...found.map(f => ({ label: f.name, detail: f.kind, checked: to?.at === f.at, run: () => { set({ to: { at: f.at, name: f.name, short: f.short } }); on(); } })),
        ...(named && kinds.length && !found.some(f => Tree.same(f.name, named) || Tree.same(f.short, named)) ? [...(found.length ? ['-'] : []), ...kinds.map(k => ({ label: `New ${k}: ${named}`, run: () => { set({ to: { kind: k, name: named } }); on(); } }))] : [])];
    }, { search: true, query });
    useLayoutEffect(() => { if (!auto || asked === p.n || !whom.current) return; asked = p.n; whom.current.focus(); if (!to) choose(whom.current); }, []);
    if (!tr) return null;
    // A record by its short name, which as a defined term reads "the Manager" mid-sentence, as History says it.
    const term = (o, s = N.shortOf(recs, o)) => s !== N.nameOf(recs, o) ? s.replace(/^The /, 'the ') : s;
    const amt = tr.amount && ent[tr.amount], name = x => bind(term(Tree.objectOf(recs, x)));
    const key = e => {
      if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); if (ready(pending.peek() ?? {})) { e.target.blur(); commit(); } }
      else if (e.key === 'Escape' && text !== null) { e.preventDefault(); e.stopPropagation(); setText(null); set({ part: was.current }); setTimeout(() => much.current?.select()); }
    };
    const typed = e => {
      if (text === null) was.current = part;
      setText(e.target.value);
      const x = Tree.parse(amt.field, e.target.value);
      set({ part: x === undefined || !(x > 0) || x > amt.value + 1e-9 ? undefined : x >= amt.value - 1e-9 ? null : x });
    };
    const ahead = e => { if (e.key.length === 1 && e.key !== ' ' && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); choose(e.currentTarget, e.key); } };
    const picker = html`<button ref=${whom} type="button" class=${'sel dd' + (to ? '' : ' ph')} aria-haspopup="menu"
        aria-label=${`To: ${to?.name ?? 'none'}`} title=${to && to.short !== to.name ? to.name : null} onClick=${e => choose(e.currentTarget)} onKeyDown=${ahead}><span>${to ? bind(to.at ? term(Tree.objectOf(recs, to.at)) : to.name) : '…'}</span></button>`;
    // Inserted between, it's set out as the line it makes: Fund III → [Holdco] → Fund III Blocker.
    // What evidences a stake that ends stays with it: said where it ends.
    const papers = p.between || part === null ? papersOf(rid, recs) : [], stay = papers.length ? html`<span class="sep">·</span><span class="stays">${papers.join(', ')} ${papers.length > 1 ? 'stay' : 'stays'} with the stake that ends</span>` : null;
    if (p.between) return html`<span class="transfer between"><span>${name(tr.first.at)} → ${picker} → ${name(tr.rest[0].at)}</span>${stay}</span>`;
    return html`<span class="transfer"><span>From ${name(tr.first.at)} to${' '}${picker}</span><span class="sep">·</span><span>${amt
        ? html`<span class="hug"><input ref=${much} class="cell amount" aria-label="How much" spellcheck=${false} autocomplete="off" aria-invalid=${part === undefined ? 'true' : null} data-why="Not a figure"
            value=${text ?? Tree.format(amt.field, part ?? amt.value)} onFocus=${e => e.target.select()} onBlur=${() => { if (part !== undefined) setText(null); }} onInput=${typed} onKeyDown=${key} /></span>`
        : html`<span>${'choice' in recs[rid] ? recs[rid].choice : N.nameOf(recs, rid)}</span>`} of ${name(tr.rest[0].at)}</span>${stay}</span>`;
  }
  // Its redline: the chart as it would leave it on the day shown (would), worked out again as what that reads
  // changes (the workbook, the day shown, its own day), and shown again once another preview gives way (a value
  // typed, a tag pointed at); nothing, where on the day shown it changes nothing, or another chart is shown.
  let previewed = null;
  Shell.ready.then(() => typeof FormulaBar !== 'undefined' && effect(() => {
    const p = pending.value, v = version.value, d = day.value, c = chart.value, shown = FormulaBar.pending.value;
    if (p && !there(p)) return drop(p, gone(p));
    if (!p || p.chart !== c) { previewed = null; if (shown?.from === 'pending') FormulaBar.preview(null); return; }
    if ((shown && shown.from !== 'pending') || !able(p)) return;
    // (A day later than the day shown waits for the chart to get there, what it said standing till then.)
    if (shown && p.asks && p.day > d) return;
    if (shown && previewed?.p === p && previewed.v === v && previewed.d === d) return;
    previewed = { p, v, d };
    FormulaBar.preview(would(tx => p.make(tx, p.day, p), { dated: datedOf(p), ids: p.ids }), 'pending');
  }));
  // Enter makes it, wherever the keys are, but in what's being typed in or pressed; and in a table's cells, where values
  // typed go on one bar and Enter goes down the column, as Excel's does, till the keys go to the bar's day (F6).
  addEventListener('keydown', e => {
    if (e.key !== 'Enter' || !mine() || e.defaultPrevented || e.isComposing) return;
    if (e.target.closest?.('input, textarea, select, button, a[href], [contenteditable], .CodeMirror, dialog, .float')) return;
    if (mine().typed && e.target.closest?.('.grid .cells')) return;
    e.preventDefault(); e.stopPropagation();
    commit();
  }, true);
  // Esc discards it only where there's nothing else to escape: a layer open, what's typed, the widened inspector and
  // the selection go first (the shell's and the canvas's Esc), so Esc pressed to clear another selection keeps it.
  addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !mine() || e.defaultPrevented || e.target.closest?.('input, textarea, select, [contenteditable], .CodeMirror, dialog, .float')) return;
    e.preventDefault();
    discard();
  });
  // A reload drops it, and says so as the window opens again; another workbook opened drops it, saying so (use).
  const reloaded = (() => { try { return JSON.parse(sessionStorage.getItem('dendra.pending')); } catch { return null; } })();
  effect(() => { const p = pending.value; try { if (p) sessionStorage.setItem('dendra.pending', JSON.stringify({ verb: p.verb, what: p.what })); else sessionStorage.removeItem('dendra.pending'); } catch {} });
  if (reloaded) Shell.launched.then(() => Shell.toast(discarded(reloaded)));
  // Its controls: the day it holds from, ends on or is made on (asked, where it asks one), Discard and its verb; in the
  // window's bar, and where it was asked, one state. Esc there discards it; Enter on its day makes it.
  const escaped = e => { if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); e.stopPropagation(); discard(); } };
  // What it would leave failing that passes now, worked out from its redline as the status bar would count it once
  // made, as a person says it: each check it fails, named for the record it's about ("Ownership Adds Up at Fund III"),
  // with the figure the formula bar's reason gives where it has one ("106.5%, not 100%"); or a formula's error. Those of
  // a record the change itself adds are its own to-do list, counted once it's made, and left out. A check at a relation is
  // said by the relation, in words, whose it is ("Capacity Held: Margaret A. Chen signs for Offshore Feeder, via Cayman GP"),
  // and `ends` names that relation, where it's one that can end. → [{ id, at, text, ends }]
  const failing = new WeakMap();
  function failsOf(R2) {
    if (!R2) return [];
    if (failing.has(R2)) return failing.get(R2);
    // (A check already failing is new to no one, whatever id working it out again gives it: it's known by what it checks and where.)
    const was = result.peek().records, keyIn = rs => a => a.error ? `${a.id} ${a.error.message}` : `${rs[a.id]?.edge}|${Tree.objectOf(rs, a.id)}`, key = keyIn(R2.records), now = new Set(needs.peek().filter(a => a.kind === 'error' || a.kind === 'broken').map(keyIn(was))), N = notes.peek(), recs = R2.records, st = state.peek();
    const about = a => Tree.objectOf(recs, a.error ? a.error.args?.[0]?.at ?? a.error.at : a.id);
    const figure = a => { const s = !a.error && typeof FormulaBar !== 'undefined' && FormulaBar.sentenceIn?.(R2, a.id); return s && [...s.matchAll(/\(([^()]*, not [^()]*)\)/g)].at(-1)?.[1]; };
    // A relation in words, as the two-box panel and the formula bar say it, each side by its short name.
    const words = x => { const t = Tree.treeOf(recs, x), sides = N.placed(recs, x), of = e => bind(N.shortOf(recs, Tree.objectOf(recs, recs[x].args.find(a => Tree.same(a.edge, e)).at))), [e0, e1, ...rest] = sides.map(s => s.edge);
      const [a, says, b] = typeof FormulaBar !== 'undefined' && e1 ? FormulaBar.phrase(t, e0, e1, { choice: recs[x].choice }) : [e0, ' and ', e1];
      return `${of(a)}${says}${b ? of(b).replace(/^The /, 'the ') : ''}${rest.map(e => `, ${lowered(e)} ${of(e).replace(/^The /, 'the ')}`).join('')}`; };
    const out = Formulas.attention(R2, asking.peek(), day.peek()).filter(a => (a.kind === 'error' || a.kind === 'broken') && !now.has(key(a)) && about(a) in st)
      .map(a => { const at = about(a), f = figure(a), whose = bind(N.shortOf(recs, at)), rel = !a.error && recs[at]?.args?.length > 1 && !R2.computed[at];
        return { id: a.id, at, ends: rel && endOf(at) !== false ? at : null, text: a.error ? `an error at ${whose}` : rel ? `${recs[a.id].edge}: ${words(at)}` : `${recs[a.id].edge} at ${whose}${f ? ` (${f})` : ''}` }; });
    failing.set(R2, out);
    return out;
  }
  // A relation's amount, asked first where it's added: its name and a figure typed, blank till one is. Esc puts back what
  // was typed, keeping the keys there, as a day's does.
  function Amount({ p, auto }) {
    const { useState, useRef, useLayoutEffect } = preactHooks;
    const [text, setText] = useState(null), input = useRef(), was = useRef(), v = p.value;
    useLayoutEffect(() => { if (auto) { input.current?.focus(); input.current?.select(); } }, []);
    const set = x => amend(p, { value: { ...pending.peek().value, v: x } });
    const typed = e => { if (text === null) was.current = v.v; setText(e.target.value); const t = Tree.clean(e.target.value), x = t ? Tree.parse(v.field, t) : null; set(x === undefined ? undefined : x); };
    const key = e => { if (e.key !== 'Escape' || text === null) return; e.preventDefault(); e.stopPropagation(); setText(null); set(was.current); setTimeout(() => input.current?.select()); };
    return html`<span class="amount"><span class="word">${v.edge}</span><span class="hug"><input ref=${input} class="cell" spellcheck=${false} autocomplete="off" aria-label=${v.edge}
      aria-invalid=${v.v === undefined ? 'true' : null} data-why=${Tree.notA(v.field)} value=${text ?? (v.v === null || v.v === undefined ? '' : Tree.format(v.field, v.v))} onInput=${typed} onKeyDown=${key} onBlur=${() => { if (v.v !== undefined) setText(null); }} /></span></span>`;
  }
  // Why it's made, a line that goes on the change (dendra.md, Change): open where it overrides what a rule gives, which needs
  // saying; a word away on anything else. Kept apart from the change pending, so what's typed here redlines nothing.
  const why = signal('');
  function Why({ p, enter }) {
    const [on, setOn] = preactHooks.useState(p.act === 'Rule out' || p.act === 'Attest' || !!p.reason || !!why.peek()), asked = preactHooks.useRef(false), field = preactHooks.useRef(), offer = preactHooks.useRef(), left = preactHooks.useRef(false);
    // (Asked for, it takes the keys; left, they go back to what asked it.)
    preactHooks.useLayoutEffect(() => { if (on && asked.current) { asked.current = false; field.current?.focus(); } if (!on && left.current) { left.current = false; offer.current?.focus(); } }, [on]);
    if (!on && !p.reason) return html`<button type="button" ref=${offer} class="lk why-add" onClick=${() => { asked.current = true; setOn(true); }}>Say why…</button>`;
    // Esc here leaves this and no more: what's typed first, then the field; never the change, which has its own Discard, but where the field can't go, as it's asked for.
    const esc = e => { if (e.key !== 'Escape') return; e.preventDefault(); e.stopPropagation(); if (why.peek()) { why.value = ''; return; } if (p.reason) return discard(); left.current = true; setOn(false); };
    return html`<label class=${'why-in' + (lacksWhy(p) ? ' needed' : '')} onKeyDown=${enter}><span>Why</span><input ref=${field} class="cell" spellcheck=${false} autocomplete="off" aria-label="Why" aria-required=${p.reason ? 'true' : null} value=${why.value} onInput=${e => { why.value = e.target.value; }} onKeyDown=${esc} /></label>`;
  }
  // Until when what's typed over a rule stands: blank, for as long as it isn't taken back. Past it, the rule says again (dendra.md, Definitions: Typed over).
  function Until({ p, enter }) {
    const [text, setText] = preactHooks.useState('');
    const typed = e => { const t = Tree.clean(e.target.value); setText(e.target.value); const d = t ? Tree.parseDate(t) : null; amend(p, { until: !t ? null : d && (p.day == null || d > p.day) ? d : false }); };
    return html`<span class="when until" onKeyDown=${enter}><span class="word">Until</span><span class="hug"><input class="cell date" spellcheck=${false} autocomplete="off" aria-label="Until" aria-invalid=${p.until === false ? 'true' : null} value=${text} onInput=${typed} /></span></span>`;
  }
  // Viewing, a change pending is a what-if: what would make it is said in place of its verb.
  const makesIn = 'Viewing: switch to Editing to make this';
  function Controls({ p, auto, hint }) {
    const enter = e => { if (e.key === 'Enter' && !e.defaultPrevented && !e.target.closest('.lk')) { e.preventDefault(); e.stopPropagation(); commit(); } };
    const shown = typeof FormulaBar !== 'undefined' ? FormulaBar.pending.value : null, fails = failsOf(shown?.from === 'pending' ? shown.R2 : null), reading = viewing.value;
    // A check it fails, clicked, is asked about in the formula bar, at the record it's about.
    const whyOf = f => { Shell.select([f.at]); Shell.emit('why-open', f.id); };
    const endable = p.verb === 'Delete' ? fails.filter(f => f.ends) : [];
    return html`${fails.length ? html`<button type="button" class="fails" title=${fails.length > 1 ? fails.map(f => f.text).join('\n') : null} onClick=${() => whyOf(fails[0])}>${Shell.icon('alert')}<span>Fails ${fails[0].text}${fails.length > 1 ? ` and ${fails.length - 1} more` : ''}</span></button>` : null}
      ${endable.length ? html`<button type="button" class="btn too" onClick=${() => endToo(p, endable)}>${endable.length > 1 ? 'End those too' : 'End that too'}</button>` : null}
      ${p.value ? html`<span class="amt" onKeyDown=${enter}><${Amount} key=${p.n} p=${p} auto=${auto} /></span>` : null}
      ${p.heirs ? html`<${Heirs} p=${p} />` : null}
      ${p.instead ? html`<button type="button" class="btn too" onClick=${p.instead.run}>${p.instead.label}</button>` : null}
      ${p.amends && p.verb === 'Change' && !p.typed ? (t => (t.length ? html`<span class="rests takes">Takes with it: ${t.join('; ')}</span>` : null))(restsOn(p.amends, p)) : null}
      ${p.bad?.(p) ? html`<span class="rests">${p.bad(p)}</span>` : null}
      ${hint && p.asks ? html`<kbd class="tokey">F6</kbd>` : null}
      ${p.asks ? html`<span class="when" onKeyDown=${enter}><${From} key=${p.n} day=${p.day} auto=${auto && !p.value} asks=${p.asks} word=${p.word} alts=${p.alts?.(p)} along=${p.along} bad=${p.bad?.(p)} change=${String(p.source).startsWith('amend')} set=${d => amend(p, { day: d })} /></span>`
        : p.from ? html`<span class="when">From ${p.from > day.value ? dayLink(p.from) : Tree.formatDate(p.from, 'short')}</span>` : null}
      ${ownDay.value?.p === p.n ? html`<span class="own-day">Shown as of ${Tree.formatDate(ownDay.value.at, 'short')}</span>` : null}
      ${!reading && p.reason && p.act === 'Override' ? html`<${Until} key=${p.n} p=${p} enter=${enter} />` : null}
      ${reading ? null : html`<${Why} key=${p.n} p=${p} enter=${enter} />`}
      <span class="acts"><button class="btn" onClick=${() => discard()}>Discard</button>
      ${reading ? html`<button class="btn" onClick=${() => setViewing(false)}>Switch to Editing to make this</button>`
        : html`<button class="btn primary" aria-disabled=${ready(p) ? null : 'true'} disabled=${!ready(p) && !lacksWhy(p)} data-tip=${lacksWhy(p) ? 'Say why first' : null} onClick=${commit}>${actOn(p)}</button>`}</span>`;
  }
  // The window's one bar, under the view shown, while a change is pending in the chart shown, its one home (dendra.md): what
  // it does, in the redline's ink, and its controls, which take the keys as it's begun; what else it asks (Fill) first.
  function Pending() {
    const p = pending.value;
    // A deletion or an undo begun by the keys, from the view or History, takes them, where they can be seen: its day, or what its day is, or else its verb, which
    // Enter is, so what Enter would do is never done with nothing lit. What's typed or pasted leaves them in the grid, to go on, and what's asked where it began keeps them there.
    preactHooks.useLayoutEffect(() => {
      if (!p || p.typed || !(p.verb === 'Delete' || p.reverse) || !Shell.keyed()) return;
      const t = setTimeout(() => {
        const a = document.activeElement, bar = document.querySelector('.pendbar');
        if (!bar || (a && a !== document.body && !a.closest('.dc, .cells, .hist') )) return;
        if (a?.closest?.('.pendbar, .float, dialog') || a?.matches?.('input, textarea, [contenteditable]')) return;
        (bar.querySelector('.when input') ?? bar.querySelector('.when .sel') ?? bar.querySelector('.btn.primary:not(:disabled)'))?.focus();
      });
      return () => clearTimeout(t);
    }, [p?.n]);
    if (!p || p.chart !== chart.value || p.formed) return null;
    return html`<div class="pendbar" role="region" aria-label=${p.verb} data-region="bar" onKeyDown=${escaped}>
      <span class="what">${p.Fill ? html`<${p.Fill} p=${p} auto=${p.auto} />` : (p.parts ?? [html`<span class=${p.verb === 'Delete' ? 'del' : 'add'}>${p.what}</span>`]).map((t, i) => html`${i ? html`<span class="sep">·</span>` : null}${t}`)}</span>
      <${Controls} p=${p} auto=${p.auto && !p.Fill} hint=${!!p.typed} />
    </div>`;
  }
  // A what-if looks at its own day (dendra.md, Pending): dated later than the day shown, the chart's shown as of its day for as long as
  // it's pending, and goes back when it's made or discarded. A day typed moves it once it's been left a moment, so a day half typed
  // doesn't; another day asked for by hand is that person's, which it leaves alone. `ownDay`, { p, at, back } while it's so.
  const ownDay = signal(null);
  let dayTimer = 0;
  Shell.ready.then(() => effect(() => {
    const p = pending.value, t = Shell.time.value, own = ownDay.value, on = p && p.chart === chart.value && !t?.stood && p.asks && p.day ? p.day : null;
    clearTimeout(dayTimer);
    const back = () => batch(() => { ownDay.value = null; Shell.at(own.back, { replace: true }); });
    // (Asked for another day by hand, it's theirs; what it comes back to is that.)
    if (own && (t?.asOf ?? null) !== own.at) { ownDay.value = null; return; }
    if (own && own.p !== p?.n) return back();
    const base = own ? own.back?.asOf ?? Log.today() : t?.asOf ?? Log.today();
    if (!on || on <= base) { if (own) dayTimer = setTimeout(back, on ? 250 : 0); return; }
    if (own?.at === on) return;
    const go = () => {
      const t0 = Shell.time.peek(), was = ownDay.peek();
      batch(() => { ownDay.value = { p: p.n, at: on, back: was ? was.back : t0 }; Shell.at({ asOf: on }, { replace: true }); });
    };
    // (One it's begun on at once; a day typed once it's been left a moment.)
    if (!own && on === p.day0) go(); else dayTimer = setTimeout(go, 300);
  }));
  // From History: an older change undone or redone (its reverse), or an item deleted restored, made now, and
  // said as History says it.
  function remake(c) {
    if (typeof c === 'string') return Shell.toast(c), null;
    Shell.at(null);
    if (c) { made(c); Shell.toast(Time.describe(c), { undo }); }
    return c;
  }
  const reversing = (id, note) => readOnly.peek() ? refuse() : remake(book.peek().reverse(id, who(), Tree.clean(note ?? '') || null));
  const reverse = id => { if (viewing.peek()) return refuse(); return remake(book.peek().reverse(id, who())); };
  const restore = item => { if (viewing.peek()) return refuse(); return remake(book.peek().restore(chart.peek(), item, who())); };

  // ---- The chart menu: the workbook's charts, a new one, and the workbooks this browser keeps ----
  const books = signal([]);
  // (By name, so the list holds still whichever's open.)
  const listBooks = () => Store.books().then(bs => { books.value = [...bs].sort((a, b) => a.name.localeCompare(b.name)); });
  // The workbook a new chart goes in, by the name its list has.
  const bookName = () => { const here = Store.where(); return books.peek().find(b => b.id === here?.id)?.name ?? here?.name ?? null; };
  // A new chart, added to a workbook: the chart shown without its records. It keeps the schema, and every
  // note that isn't at one of the records: the definitions, names, descriptions and styles. Of the views, it
  // keeps those named for what they show (Entities, Ownership), and one chart, Structure, in the house look (dendra.md,
  // Workbook), whatever view is shown as it's begun; the old chart's own pages stay behind, and its page starts
  // afresh. Its chart draws what it records: each relation of two sides no formula gives, of any kind or option
  // at its sides, though the chart it's begun from left it out (Structure, Membership); what that one rules out
  // (not an owner) stays out. `style`, a house style chosen, a look to begin in instead of the first chart view's.
  function startChart(wb, style, named) {
    const c = Log.newId(), from = chart.peek(), src = book.peek(), name = freeName(wb, named);
    const tx = wb.edit({ chart: c, who: who() }), kept = new Map();
    tx.add('chart', { name }, c);
    const vs = from ? views.peek().filter(v => !v.look) : [], like = vs.find(v => v.layout === 'chart')?.id, pages = new Set(vs.filter(v => v.layout === 'chart' && v.id !== like).map(v => v.id));
    const recorded = new Map();
    let look = null, given = () => false;
    if (from) {
      const L = layouts.peek(), own = v => [...L.kinds, ...L.relations, ...L.datatypes].some(l => Tree.same(l.name, v.name) && JSON.stringify(l.rows) === JSON.stringify(v.rows));
      const sides = t => t.args.map(a => a.edge).sort().join('|'), worked = new Set(src.notes(from).notes('Formula').filter(n => n.pattern.args?.length === 2).map(n => sides(n.pattern)));
      const shape =t => t.args ? { args: t.args.map(a => ({ edge: a.edge, loc: shape(a.loc) })) } : {};
      for (const tree of Object.values(src.schema(from))) {
        tx.add('spec', { tree });
        if (tree.args?.length !== 2 || worked.has(sides(tree))) continue;
        const p = { ...(tree.out && 'tag' in tree.out && { out: { tag: true } }), ...shape(tree) };
        recorded.set(Tree.key(p), p);
      }
      for (const v of vs) if (v.id === like || pages.has(v.id) || (v.layout === 'table' && own(v))) kept.set(v.id, tx.add('record', { kind: 'View' }));
      const moved = t => t.args ? { ...t, args: t.args.map(a => ({ ...a, loc: moved(a.loc) })) } : t.id === undefined ? t : { ...t, id: kept.get(t.id) };
      // The house look (dendra.md, Workbook), less a style of a relation a formula gives (§57's affiliates), with the paper
      // and the footer, which come in the look begun in. Not the day or the scale it keeps. The rest of the first chart's
      // notes in it are its records', and stay behind.
      given = p => !!p && ((p.args?.length === 2 && worked.has(sides(p))) || (p.args ?? []).some(a => given(a.loc)));
      look = style ?? Notes.houseLook(src.rows(from), like);
      for (const r of src.rows(from)) if ('note' in r && r.view !== like && (!r.view || kept.has(r.view)) && [...Tree.idsIn(r.pattern)].every(id => kept.has(id)) && !(['As Of', 'Changes', 'Plan', 'Scale', 'Page', ...Notes.ROOT].includes(r.label) && r.pattern.id === like) && !(['As Of', 'Changes', 'Plan', 'Scale'].includes(r.label) && pages.has(r.pattern.id)) && r.label !== 'Footer')
        tx.note(r.label, moved(r.pattern), r.value, { view: kept.get(r.view), param: r.param });
      // Its other pages, each what it says of what it shows, so it fills as what it shows is added, and its title, day and Key.
      for (const r of src.rows(from)) if ('shape' in r && pages.has(r.view) && (r.role === 'title' || r.role === 'date' || r.geometry === 'legend')) {
        const { id: _, shape: __, view: v, x: _x, y: _y, w: _w, h: _h, kept: _k, ...furniture } = r;
        tx.add('shape', { view: kept.get(v), ...furniture, ...(r.role === 'title' && { text: `${name}: ${vs.find(p => p.id === v).name}` }) });
      }
      // And its master, as it stands (dendra.md, The page): furniture every page of it has, which names no record.
      const master = typeof Scene === 'undefined' || style?.master?.length ? [] : src.rows(from).filter(r => 'shape' in r && r.view === Scene.MASTER), fresh = new Map(master.map(r => [r.shape, Log.newId()])), to = x => fresh.get(x) ?? x;
      for (const { id: _, shape: s, ...x } of master) tx.add('shape', { ...x, ...(x.ends && { ends: x.ends.map(to) }), ...(x.members && { members: x.members.map(to) }) }, fresh.get(s));
    }
    const first = kept.get(like) ?? tx.add('record', { kind: 'View' });
    if (look) Notes.takeLook(tx, [], first, { ...look, master: style?.master }, { begun: true, has: p => !given(p) && (!style || hasPattern(src.schema(from), src.notes(from), p)) });
    for (const p of recorded.values()) tx.note('Shown', p, true, { view: first });
    tx.note('Name', viewTree(first), vs.find(v => v.id === like)?.name ?? 'Structure');
    // Its furniture as it has it: no Key or As of line where it has none (a family tree's).
    const has = test => !from || src.rows(from).some(r => 'shape' in r && r.view === like && test(r));
    page(tx, first, name, look, { date: has(r => r.role === 'date'), key: has(r => r.geometry === 'legend') });
    return tx.commit();
  }
  // A name no chart of the workbook has: what's asked, or Untitled, a number after it where it's taken.
  function freeName(wb, named) {
    const names = new Set(wb.charts().map(x => Tree.norm(x.name))), base = Tree.clean(named ?? '') || 'Untitled';
    let name = base, i = 2;
    while (names.has(Tree.norm(name))) name = `${base} ${i++}`;
    return name;
  }
  // A new chart from a template (dendra.md, Workbook), in a workbook, as one change, and from a house style chosen, its look over the template's.
  function chartFrom(wb, t, style, named) {
    const c = Log.newId(), tx = wb.edit({ chart: c, who: who() }), name = freeName(wb, named);
    tx.add('chart', { name }, c);
    const ids = Templates.begin(tx, t, name), specs = Tree.schema(t.rows.filter(r => 'tree' in r).map(r => r.tree)), index = Notes.index([]);
    if (style) {
      const v = t.rows.find(r => 'record' in r && !t.rows.some(n => n.label === 'Layout' && n.pattern.id === r.record))?.record, first = v && ids.get(v);
      if (first) Notes.takeLook(tx, tx.added(), first, style, { begun: true, has: p => hasPattern(specs, index, p) });
    }
    tx.says(`Began ${name} from the ${t.name.replace(/\s*\([^)]*\)\s*$/, '')} template`);
    return tx.commit();
  }
  // Whether a chart has what a pattern reaches, by its specifications: a house style's styles of what it hasn't don't come.
  const hasPattern =(S, N, p) => Scene.isChange(p) || N.fitting(S, p.out && 'tag' in p.out ? Tree.bare(p) : p).length > 0;
  // A chart's page, begun as every page of the sample is: its title, the chart's name, under it the day it's as
  // of, and its Key, which the page sets at the sheet's size and places, as it does every page's; in `look`, where
  // it's begun in one.
  function page(tx, view, title, look, { date = true, key = true } = {}) {
    const of = f => look?.furniture?.[f] ?? {};
    tx.add('shape', { view, geometry: 'text', role: 'title', text: title, ...of('title') });
    if (date) tx.add('shape', { view, geometry: 'text', role: 'date', text: '="As of " & TEXT(@AsOf, "mmmm d, yyyy")', ...of('date') });
    if (key) tx.add('shape', { view, geometry: 'legend', title: 'Key', columns: 2, ...of('key') });
  }
  // What's made anywhere but on the chart, related to nothing a page draws, isn't placed on that page (dendra.md, Views): each
  // record `ids` that tx makes, a Shown note at its own tree in each chart view that would draw it with no line of its own to
  // what's drawn. Read on the day what's related to it holds, a stake from a later day being a line. → the views it's kept off.
  function keepOff(tx, ids) {
    const vs = views.peek().filter(v => v.layout === 'chart'), now = day.peek(), wb = shown.peek(), c = chart.peek(), kept = [];
    // (On a chart that keeps no dated record, its pages show everything of its kinds: who's typed in a table is on the chart.)
    if (!vs.length || typeof Scene === 'undefined' || !isDated.peek()) return kept;
    const d = [now, ...tx.added().filter(r => r.args && r.since).map(r => r.since)].sort().at(-1), after = tx.asOf(d), R = Formulas.computeState(after, definitions.peek(), namesOn(d), worked), I = Tree.index(after);
    for (const v of vs) {
      const by = Scene.looks(wb, c, v.id, d, { state: R.records, computed: R }).byId;
      for (const id of ids) {
        if (!after[id]?.kind || by.get(id)?.type !== 'box') continue;
        const within = [id]; for (let i = 0; i < within.length; i++) within.push(...(I.entries.get(within[i]) ?? []));
        if (within.some(x => (I.relations.get(x) ?? []).some(rid => by.get(rid)?.type === 'line'))) continue;
        tx.note('Shown', { id, kind: after[id].kind }, false, { view: v.id });
        if (!kept.includes(v)) kept.push(v);
      }
    }
    return kept;
  }
  // What's made on a chart, the chart shows (dendra.md, Views): boxes `ids` that tx makes on chart view `view`, where
  // the view would draw one nowhere (a filter of the affiliates hides its kind, say), are shown there by the same
  // change, each at its own tree, the narrowest note. Only a note that hides can hide a box, so with none nothing's
  // worked out. `d`, the day it's drawn as of: the day shown, or a later one a change made ahead holds from (a transfer's).
  function showMade(tx, ids, view = Shell.view.peek(), d = day.peek()) {
    const N = notes.peek();
    if (views.peek().find(v => v.id === view)?.layout !== 'chart' || !N.notes('Shown').some(n => n.value === false && (!n.view || n.view === view))) return;
    const after = tx.asOf(d), R = Formulas.computeState(after, definitions.peek(), namesOn(d), worked);
    const drawn = Scene.looks(shown.peek(), chart.peek(), view, d, { state: R.records, computed: R }).byId;
    for (const id of ids) if (after[id]?.kind && !drawn.has(id)) tx.note('Shown', { id, kind: after[id].kind }, true, { view });
  }
  // Another chart, at the view last shown in it (lastView), or else its first: a step on the trail, as another view is.
  function open(id) {
    const wb = shown.peek(), v = lastView.get(id) ?? viewsIn(wb.asOf(id, day.peek()), wb.notes(id))[0]?.id;
    if (v) preactSignals.batch(() => { Shell.select([]); Shell.show(v); });
  }
  // A new chart like the one shown is named as it begins, in the title bar. `style`, a house style chosen to begin it in.
  function newChart(style) {
    if (readOnly.peek()) return refuse();
    const c = startChart(book.peek(), style?.notes ? style : null);
    if (typeof c === 'string') return Shell.toast(c);
    open(c.chart);
    Shell.nameChart();
  }
  // What the New chart gallery begins (dendra.md, Workbook): `template` a template's id, or null for like the chart shown; `style`, a
  // house style's look; `name`, what it's called, or else it's named in the title bar as it opens; `workbook`, in a workbook of its
  // own, this one kept. One change, in History as any is.
  function begin({ template = null, style = null, name = '', workbook = false } = {}) {
    if (!workbook && readOnly.peek()) return refuse();
    const t = template && Templates.of(template), make = wb => t ? chartFrom(wb, t, style, name) : startChart(wb, style, name);
    // (Opened, it's named in the title bar if it hasn't been; then, its first box.)
    const opening = c => { if (typeof c === 'string') { Shell.toast(c); return null; } if (Tree.clean(name)) Shell.firstBox(); else Shell.nameChart({ then: () => Shell.firstBox() }); return c; };
    if (!workbook) { const c = make(book.peek()); if (typeof c !== 'string') open(c.chart); return opening(c); }
    const wb = Log.open([]), c = make(wb);
    if (typeof c === 'string') return Shell.toast(c);
    return opened(Store.open({ id: Log.newId(), sample: wb })).then(() => { if (chart.peek() === c.chart) opening(c); return c; });
  }
  // A copy of the chart shown, as one change: every row it has, each item under a new id and what refers to it
  // following (a record's place and sides, a note's pattern and view, a shape's view, ends and members), so the copy
  // is the chart as it stands, its records' days included, with its own History from here on. Named as it begins.
  function duplicateChart() {
    if (readOnly.peek()) return refuse();
    const wb = book.peek(), from = chart.peek(), was = wb.charts().find(x => x.chart === from)?.name ?? 'Untitled';
    const names = new Set(wb.charts().map(x => Tree.norm(x.name)));
    let name = `${was} copy`, i = 2;
    while (names.has(Tree.norm(name))) name = `${was} copy ${i++}`;
    const rows = wb.rows(from).filter(r => Log.typeOf(r) !== 'chart' && !r.calendar), fresh = new Map();
    for (const r of rows) { const k = r[Log.typeOf(r)]; if (!fresh.has(k)) fresh.set(k, Log.newId()); }
    const to = x => fresh.get(x) ?? x;
    const loc = p => !p || typeof p !== 'object' ? p : { ...p, ...(p.id !== undefined && { id: to(p.id) }), ...(p.args && { args: p.args.map(a => ({ ...a, ...(a.at !== undefined && { at: to(a.at) }), ...(a.loc && { loc: loc(a.loc) }) })) }) };
    const c = Log.newId(), tx = wb.edit({ chart: c, who: who() });
    tx.add('chart', { name }, c);
    for (const r of rows) {
      const type = Log.typeOf(r), { id: _, [type]: item, ...x } = r;
      if (type === 'record') { if (x.at !== undefined) x.at = to(x.at); if (x.args) x.args = loc(x).args; }
      if (type === 'note') { x.pattern = loc(x.pattern); if (x.view) x.view = to(x.view); }
      if (type === 'shape') { if (x.view) x.view = to(x.view); if (x.ends) x.ends = x.ends.map(to); if (x.members) x.members = x.members.map(to); }
      tx.add(type, x, fresh.get(item));
    }
    const made = tx.commit();
    if (typeof made === 'string') return Shell.toast(made);
    open(c);
    Shell.nameChart();
  }
  // The chart shown taken out of the workbook, as one change, which its toast can take back; another chart is shown.
  function deleteChart() {
    const wb = book.peek(), id = chart.peek(), next = wb.charts().find(x => x.chart !== id);
    if (readOnly.peek()) return refuse();
    if (!next) return;
    const tx = wb.edit({ chart: id, who: who() });
    tx.remove(id);
    const c = tx.commit();
    if (typeof c === 'string') return Shell.toast(c);
    open(next.chart);
    Shell.toast(Time.describe(c), { undo: () => { reverse(c.id); open(id); } });
  }
  // Renaming the chart, as one change: its name, and each page's title that says its name still (one changed by
  // hand keeps what it says), so its exports are named as it is. A workbook kept in this browser is named by its first
  // chart (Store), and the chart menu's list of them says so at once.
  function rename(id, name) {
    const was = book.peek().charts().find(c => c.chart === id)?.name;
    if (id !== chart.peek() || !name || name === was) return;
    change(tx => {
      tx.set(id, { name });
      for (const r of book.peek().rows(id)) if ('shape' in r && r.role === 'title' && (r.text === was || r.text?.startsWith(`${was}: `))) tx.update(r.shape, { text: name + r.text.slice(was.length) });
    }, { dated: false });
    listBooks();
  }
  // A workbook this browser keeps, never the one open, deleted from it, after a confirm saying it can't be undone; one
  // kept in a file or a library stays there.
  function deleteBook(b) {
    const text = b.type === 'browser' ? `“${b.name}” and every chart in it go from this browser. This can’t be undone.`
      : `“${b.name}” goes from this browser’s workbooks, which can’t be undone. Its file stays where it’s kept.`;
    Shell.confirm(text, { title: 'Delete workbook?', ok: 'Delete workbook', danger: true }).then(ok => ok && Store.forget(b.id)
      .then(() => { listBooks(); Shell.toast(`Deleted the workbook ${b.name}`); }, e => Shell.toast(e?.message || 'Couldn’t delete it')));
  }
  // The chart menu's own: the chart shown's actions first, where they always are, then the workbook's charts and the
  // workbooks this browser keeps, each a list of its own, however long they grow. What can't be done says why.
  Shell.register('workbook', {
    charts: () => (version.value, book.value.charts().map(c => ({ id: c.chart, name: c.name }))),
    current: () => chart.value,
    open,
    rename,
    menu: () => {
      const all = (version.value, book.value.charts()), here = Store.where()?.id, others = books.value.filter(b => b.id !== here);
      return [{ label: 'New chart', keys: '$mod+Shift+KeyN', disabled: readOnly.value, run: () => Gallery.open() },
        { label: 'New workbook', run: () => Gallery.open({ workbook: true }) }, { label: 'Duplicate chart', disabled: readOnly.value, run: duplicateChart },
        { label: 'Delete chart', danger: true, disabled: readOnly.value || all.length < 2, tip: all.length < 2 ? 'It’s this workbook’s only chart' : null, run: deleteChart }, '-',
        { label: 'Charts', items: all.map(c => ({ label: c.name, checked: c.chart === chart.value, run: () => c.chart !== chart.peek() && open(c.chart) })) },
        { label: 'Workbooks', items: [
          ...books.value.map(b => ({ label: b.name, detail: b.sample ? 'Sample' : null, checked: b.id === here, run: () => b.id !== here && opened(Store.open({ id: b.id })) })),
          ...(books.value.length ? ['-'] : []),
          { label: 'Delete workbook', danger: true, disabled: !others.length, tip: others.length ? null : 'The open workbook can’t be deleted', items: others.map(b => ({ label: b.name, run: () => deleteBook(b) })) }] }];
    },
  });
  Shell.register('undo', {
    undo, redo, steps, undoTo,
    canUndo: () => !Shell.time.value?.stood && ((!viewing.value && stackOf(chart.value).undo.length > 0) || lookStepsOf(chart.value).undo.length > 0 || (viewing.value && !!pending.value)),
    canRedo: () => !Shell.time.value?.stood && ((!viewing.value && stackOf(chart.value).redo.length > 0) || lookStepsOf(chart.value).redo.length > 0 || (!!lastDiscarded.value && lastDiscarded.value.chart === chart.value && !pending.value)),
  });

  // ---- Views: View objects, each described by its own notes, never dated ----
  const viewTree = id => ({ id, kind: 'View' });
  // A chart's views, in their order, from its records and notes; the chart shown's kept while they say the same, so
  // the tabs aren't drawn again for every edit.
  const viewsIn = (st, N) => (Tree.index(st).kinds.get('view') ?? []).map(id => {
    const t = viewTree(id), lay = N.value('Layout', t);
    return { id, name: N.nameOf(st, id), layout: lay && typeof lay === 'object' ? 'table' : 'chart', rows: lay?.rows ?? null,
      keeps: N.value('As Of', t) ?? null, changes: N.value('Changes', t) ?? null, plan: N.value('Plan', t) ?? null, order: N.order(t) ?? Infinity };
  }).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  const viewsNow = computed(() => { const by = looks.value[chart.value] ?? {}; return viewsIn(entered.value, notes.value).map(v => by[v.id]?.table ? { ...v, look: true } : v); });
  const views = keptWhile(() => JSON.stringify(viewsNow.value), () => viewsNow.value);
  const lastView = new Map();
  effect(() => { const c = chart.value, v = Shell.view.value; if (c && views.value.some(x => x.id === v)) lastView.set(c, v); });
  // The view shown, drawn: what the canvas, the format bar and the inspector's Look read.
  const mastering = signal(false), NOTHING_DRAWN = {};
  const drawnPage = computed(() => {
    // It reads the workbook's notes and shapes as well as the state (Scene keeps what's drawn from the same).
    version.value;
    const v = views.value.find(x => x.id === Shell.view.value);
    if (v?.layout === 'chart' && mastering.value && typeof Scene !== 'undefined') return Scene.of(shown.value, chart.value, Scene.MASTER, day.value, { state: NOTHING_DRAWN, computed: null, masterOf: views.value.find(x => x.layout === 'chart')?.id });
    return v?.layout !== 'chart' || typeof Scene === 'undefined' ? null : Scene.of(shown.value, chart.value, v.id, day.value, { state: state.value, computed: result.value });
  });
  // The chart's master being edited (dendra.md, The master): the page draws only that, till it's closed, or another page or chart is shown.
  effect(() => { Shell.view.value; chart.value; if (mastering.peek()) mastering.value = false; });
  const pageMaster = (id, on) => change(tx => tx.note('Master', { id, kind: 'View' }, on ? undefined : false), { dated: false, keep: false, say: `${on ? 'Put the master back on' : 'Left the master off'} ${views.peek().find(v => v.id === id)?.name ?? 'this page'}` });
  const hasMaster = id => notes.peek().resolve('Master', { id, kind: 'View' })?.value !== false;
  const scene = computed(() => {
    const drawn = drawnPage.value, kept = drawn && seenIn(drawn.view);
    return kept?.size ? Scene.of(shown.value, chart.value, drawn.view, day.value, { state: state.value, computed: result.value, seen: kept }) : drawn;
  });
  // What's worked out of a scene and the records, kept with the scene while they stand: a scene outlasts a change, as a redline's is the one its change, made, draws.
  const ofScene = (kept, sc, make) => { const st = state.peek(), was = kept.get(sc); if (was?.st === st) return was.it; const it = make(); kept.set(sc, { st, it }); return it; };
  // What the look shows of the page: how many of its boxes, and any it hides otherwise. → { kept, of, more } or null.
  function shownOf(sc = scene.value, p = drawnPage.value) {
    if (!sc || !p || sc === p) return null;
    const boxes = s => new Set(s.marks.filter(m => m.type === 'box' && !m.revealed).map(m => m.id)), has = boxes(p), now = boxes(sc), kept = [...now].filter(x => has.has(x)).length;
    return { kept, of: has.size, more: now.size - kept };
  }
  const lookWordsOf = view => { const l = looks.value[chart.value]?.[view]; return [...(l?.filters ?? []).map(f => `${f.label}: ${f.values.map(v => v ?? 'Blank').join(', ')}`)]; };
  // The band a look on a chart says itself by, with its way back: "Showing 13 of 28", Show all, which adds nothing that was never
  // on the page, and Keep, which makes it the page's.
  function LookBand() {
    const v = views.value.find(x => x.id === Shell.view.value);
    if (!v || Shell.time.value?.stood) return null;
    if (v.look) {
      const can = !readOnly.value;
      return html`<div class="pastband lookband" role="status"><span>${v.name} is only in this window</span><button class="btn" aria-disabled=${can ? null : 'true'} title=${can ? null : whyNot()} onClick=${() => keepTable(v.id)}>Keep</button><button class="btn" onClick=${() => closeLook(v.id)}>Close</button></div>`;
    }
    const n = shownOf();
    if (!n) return null;
    const can = !readOnly.value, said = lookWordsOf(v.id);
    return html`<div class="pastband lookband" role="status"><span>Showing ${n.kept} of ${n.of}${n.more ? ` and ${n.more} more` : ''}${said.length ? ` · ${said.join(' · ')}` : ''}</span><button class="btn" onClick=${() => showAll(v.id)}>Show all</button><button class="btn" aria-disabled=${can ? null : 'true'} title=${can ? null : whyNot()} onClick=${() => (can ? keepShown(v.id) : refuse())}>Keep</button></div>`;
  }
  // The words an exported file says what it shows in, the one place they're made: the day, or while the past is shown the
  // moment. Its name's, where that isn't today ("as of Dec 31, 2026"; "as it stood on Dec 31, 2026, 3.15 PM", a file's name
  // holding no colon), and an Excel sheet's first line.
  const asOfWords = (d = day.peek()) => {
    const m = shown.peek().moment, line = m ? Log.stoodText(m, 'short') : `As of ${Tree.formatDate(d, 'short')}`;
    return { name: !m && d === Log.today() ? '' : (line[0].toLowerCase() + line.slice(1)).replace(':', '.'), line };
  };
  // What a table's rows can be: each kind, each relation (its edges, every other label removed), and dates
  // and documents.
  const strip = t => t.args ? { args: t.args.map(a => ({ edge: a.edge, loc: strip(a.loc) })) } : {};
  const layouts = computed(() => {
    const N = notes.value, rels = new Map(), kinds = new Set(), byName = (a, b) => a.name.localeCompare(b.name);
    for (const t of Object.values(schema.value)) {
      if (!t.args) { if (!Tree.isView(t)) kinds.add(t.kind); }
      else if (t.args.length > 1) { const p = N.relationPattern(t); rels.set(Tree.key(p), p); }
    }
    return {
      kinds: [...kinds].map(kind => ({ name: Tree.plural(kind), rows: { kind } })).sort(byName),
      relations: [...rels.values()].map(p => ({ name: N.name(p), rows: p })).sort(byName),
      datatypes: ['date', 'document'].map(d => ({ name: Tree.plural(Tree.DATATYPES[d]), rows: d })),
    };
  });
  // A new view after the one it copies, or at the end: a chart, or a table of `rows`. A copy takes the
  // original's notes and shapes, but its name. A new chart takes the styles and Shown of the chart shown, or
  // else of the first, but not where it put things, and its page starts afresh. A new table opens with a few of its
  // columns (Table.opening). `also(tx, id)`, what else the one change makes of it; `blank`, a chart with every box hidden;
  // `title`, what a copy's page is titled; `then(tx, id)`, what the change writes last, over what's copied; `say`, its toast.
  // A table made, in a change or a look (lookTable): its name, its rows and the columns it opens with; in the tabs' order but
  // for a look, which comes after them.
  function writeView(tx, id, n, rows, { why, order } = {}) {
    const t = viewTree(id);
    tx.add('record', { kind: 'View' }, id);
    tx.note('Name', t, n);
    if (order) [...views.peek().filter(v => !v.look && v.id !== id), { id }].forEach((v, k) => tx.note('Order', viewTree(v.id), k + 1));
    tx.note('Layout', t, { rows });
    if (typeof Table !== 'undefined') Table.opening(tx, id, rows);
    if (why) tx.note('Shown', t, true, { view: id, param: 'Why' });
  }
  function addView(name, rows, from, also, blank = false, { title, then, say } = {}) {
    const vs = views.peek().filter(v => !v.look), at = from ? vs.findIndex(v => v.id === from) + 1 : vs.length, taken = new Set(views.peek().map(v => Tree.norm(v.name)));
    const like = from ?? (rows === undefined ? (vs.find(v => v.id === Shell.view.peek() && v.layout === 'chart') ?? vs.find(v => v.layout === 'chart'))?.id : null);
    let n = name, i = 2;
    while (taken.has(Tree.norm(n))) n = `${name} ${i++}`;
    let id = null;
    change(tx => {
      id = tx.add('record', { kind: 'View' });
      const t = viewTree(id);
      tx.note('Name', t, n);
      [...vs.slice(0, at), { id }, ...vs.slice(at)].forEach((v, k) => tx.note('Order', viewTree(v.id), k + 1));
      if (rows !== undefined) tx.note('Layout', t, { rows });
      if (rows && !from && typeof Table !== 'undefined') Table.opening(tx, id, rows);
      also?.(tx, id);
      if (like) for (const { id: _, ...r } of book.peek().rows(chart.peek())) {
        // (What a table's view says at itself, its Why, it says at the copy.)
        if ('note' in r && r.view === like && (from || (r.label !== 'Position' && r.label !== 'Bend'))) { const { note, ...x } = r; tx.add('note', { ...x, ...(x.pattern.id === like && { pattern: t }), view: id }); }
        else if (!from) continue;
        else if ('shape' in r && r.view === from) { const { shape, ...s } = r; tx.add('shape', { ...s, view: id, ...(title && s.role === 'title' && { text: title }) }); }
        else if ('note' in r && !r.view && r.pattern.id === from && r.label !== 'Order' && r.label !== 'Name' && r.label !== 'Plan') tx.note(r.label, t, r.value);
      }
      if (!from && rows === undefined) page(tx, id, book.peek().charts().find(c => c.chart === chart.peek())?.name ?? n);
      // A blank start: every box it would draw hidden by its own note, each to tick on from its Hidden list.
      if (blank) { const st = state.peek(), N = notes.peek(); for (const x of Object.keys(st)) if (Tree.isObject(st[x]) && !Tree.isView(st[x]) && N.value('Shown', { kind: st[x].kind }, like) !== false) tx.note('Shown', Tree.treeOf(st, x), false, { view: id }); }
      then?.(tx, id);
    }, { dated: false, say });
    return id;
  }
  const order = ids => change(tx => ids.filter(id => !views.peek().find(v => v.id === id)?.look).forEach((id, k) => tx.note('Order', viewTree(id), k + 1)), { dated: false });
  // What a view can show, as menu items: a chart, or a table of a kind's records, a relation's, or every date or
  // document, each picked as pick(name, rows). Given a view, what it shows is checked.
  function shows(pick, v) {
    const L = layouts.peek(), on = rows => v && v.layout === 'table' && JSON.stringify(v.rows) === JSON.stringify(rows);
    const as = l => ({ label: l.name, checked: on(l.rows), run: () => pick(l.name, l.rows) });
    const group = (label, ls) => ({ label, checked: v && ls.some(l => on(l.rows)), items: ls.map(as) });
    return [{ label: 'Chart', checked: v && v.layout === 'chart', run: () => pick('Chart') }, ...(v ? [] : [{ label: 'Blank chart', run: () => pick('Chart', undefined, true) }]), '-', group('Records', L.kinds), group('Relations', L.relations), ...L.datatypes.map(as)];
  }
  Shell.register('views', {
    list: () => views.value,
    // (A page titled by its name, as a step is, stays so. A table only in this window, named, is kept.)
    rename: (id, name) => { if (lookOf(id)?.table) keepTable(id); return change(tx => {
      const was = views.peek().find(v => v.id === id)?.name, title = book.peek().rows(chart.peek()).find(r => 'shape' in r && r.view === id && r.role === 'title' && r.text === was);
      tx.note('Name', viewTree(id), name);
      if (title) tx.update(title.shape, { text: name });
    }, { dated: false }); },
    move: (id, i) => { const ids = views.peek().map(v => v.id).filter(x => x !== id); ids.splice(i, 0, id); order(ids); },
    // A new view of what's picked: its id, or null if none is.
    // (Viewing, a table only: opened to read, for this window, as a list's is. A chart has nothing to show that isn't here.)
    add: anchor => new Promise(done => {
      let chosen = false;
      const reading = viewing.peek(), items = shows((name, rows, blank) => { chosen = true; done(reading ? lookTable(name, rows) : addView(name, rows, undefined, undefined, blank)); if (rows) Shell.showPanel(); });
      Shell.menu(anchor, reading ? items.map(x => (x === '-' || x.items || x.label !== 'Chart' && x.label !== 'Blank chart' ? x : { ...x, disabled: true, tip: whyNot() })) : items,
        { placement: 'top-start', onClose: () => queueMicrotask(() => chosen || done(null)) });
    }),
    // A view's own menu, on its tab: what it shows, as the inspector's view panel sets it, and copying or
    // deleting it.
    menu: id => {
      const v = views.peek().find(x => x.id === id), writes = readOnly.peek() ? { disabled: true, tip: whyNot() } : {};
      if (v.look) return [{ label: 'Keep this table', ...writes, run: () => keepTable(id) }, { label: 'Close', run: () => closeLook(id) }];
      return [
        { label: 'Show', ...writes, items: shows((_, rows) => change(tx => tx.note('Layout', viewTree(id), rows && { rows }), { dated: false }), v) },
        ...(v.layout === 'chart' && typeof FormatBar !== 'undefined' ? ['-', ...FormatBar.lookMenu(id)] : []),
        ...(v.layout === 'chart' ? ['-', { label: 'Edit master', run: () => { Shell.show(id); setTimeout(() => { mastering.value = true; }); } }, { label: 'Leave the master off', checked: !hasMaster(id), ...writes, run: () => pageMaster(id, !hasMaster(id)) }] : []),
        '-',
        ...(v.layout === 'chart' && typeof Time !== 'undefined' ? [{ label: 'Next step…', ...writes, run: () => Time.nextStep(id) }] : []),
        { label: 'Duplicate', ...writes, run: () => { const copy = addView(v.name, undefined, id); if (copy) Shell.show(copy); } },
        { label: 'Delete', danger: true, disabled: views.peek().length < 2, ...writes, run: () => change(tx => tx.remove(id), { say: `Deleted ${v.name}`, dated: false }) },
      ];
    },
  });
  // Find reaches each definition, as its pattern in general: the statute it encodes (inspector.js).
  Shell.register('find', { items: () => { const N = notes.peek(); return N.notes('Formula').map(n => ({ label: N.name(n.pattern), detail: 'Definition', names: N.check(n.pattern) ? ['Rule', 'Check'] : ['Rule'], run: () => Shell.select([Shell.general(n.pattern)]) })); } });

  // ---- Where the workbook is kept: its status beside its name, and opening and saving it in the chart menu ----
  const status = signal(Store.status());
  Store.subscribe(st => { status.value = st; });
  Shell.register('keeping', {
    render: () => {
      const st = status.value;
      return st.fix ? html`<button class="keeping fix" onClick=${() => Store.fix()}>${st.text}</button>`
        // (Where it's cut short, it says itself whole on hover, as the chart's name does.)
        : html`<span class=${'keeping' + (st.tone ? ' is-' + st.tone : '')} title=${st.detail ?? ''} onPointerOver=${e => { const k = e.currentTarget; if (k.scrollWidth > k.clientWidth) k.dataset.tip = st.text; else delete k.dataset.tip; }}>${st.text}</span>`;
    },
  });
  const opened = p => p.then(wb => wb && use(wb), e => e?.name === 'AbortError' || Shell.toast(e?.message || 'Couldn’t open it'));
  const saved = p => p.then(listBooks, e => e?.name === 'AbortError' || Shell.toast(e?.message || 'Couldn’t save it'));

  // Settings: who you are, and signing in to the SharePoint library the team keeps its workbooks and documents
  // in. The connection to it is IT's to set up (docs/sharepoint-setup.md), so it's folded away, and opens
  // when signing in needs it.
  function settings(opening = false) {
    const v = { name: store.get('name') ?? '', ...SharePoint.settings() };
    const keep = () => SharePoint.configure({ tenant: v.tenant.trim(), client: v.client.trim(), library: v.library.trim() });
    const field = (k, label) => html`<label class="field"><span>${label}</span><input value=${v[k]} spellcheck="false" onInput=${e => { v[k] = e.target.value; }} /></label>`;
    function Body() {
      const [me, setMe] = preactHooks.useState(SharePoint.account()), connection = preactHooks.useRef();
      const go = p => p.then(() => setMe(SharePoint.account()), e => {
        Shell.toast(e?.message || 'Couldn’t sign in');
        if (!SharePoint.configured()) connection.current.open = true;
      });
      return html`<div class="settings">
        ${field('name', 'Your name')}
        <div class="field"><span>SharePoint</span><span class="account">${me
          ? html`<span class="who">${me.name}</span><button type="button" class="btn" onClick=${() => go(SharePoint.signOut())}>Sign out</button>`
          : html`<button type="button" class="btn" onClick=${() => { keep(); go(SharePoint.signIn()); }}>Sign in</button>`}</span></div>
        <details ref=${connection} open=${opening}><summary>Connection</summary><div class="settings">${field('tenant', 'Tenant ID')}${field('client', 'Client ID')}${field('library', 'Library')}</div></details>
      </div>`;
    }
    return Shell.dialog({ title: 'Settings', width: 480, actions: [{ label: 'Cancel', value: false }, { label: 'Done', value: true, primary: true }], body: () => html`<${Body} />` })
      .then(ok => { if (ok) { store.set('name', Tree.clean(v.name) || null); keep(); } return ok; });
  }
  // With no library set, saving to one goes where one is set, and saves once it is.
  const toLibrary = () => SharePoint.settings().library ? saved(Store.saveAs('library')) : settings(true).then(ok => { if (ok && SharePoint.settings().library) saved(Store.saveAs('library')); });
  // Saving somewhere keeps the workbook there from now on, as Office's Save As does; a copy is downloaded.
  [
    { id: 'file.open', name: 'Open…', keys: '$mod+O', run: () => opened(Store.openFile()) },
    { id: 'file.save', name: 'Save as…', keys: '$mod+Shift+S', run: () => saved(Store.saveAs('file')) },
    { id: 'file.library', name: 'Save to SharePoint…', run: toLibrary },
    { id: 'file.download', name: 'Download a copy', run: () => Store.download() },
  ].forEach((a, i) => Shell.register('action', { ...a, menu: 'chart', order: 1 + i }));
  Shell.register('action', { id: 'settings', name: 'Settings', menu: 'chart', order: 20, run: () => settings() });
  // Editing or Viewing, for Find, by the words it goes by.
  Shell.register('action', { id: 'mode.viewing', name: 'Viewing', names: ['Read only', 'Read-only', 'View only', 'Lock'], run: () => setViewing(true) });
  Shell.register('action', { id: 'mode.editing', name: 'Editing', names: ['Edit', 'Unlock'], run: () => setViewing(false) });
  Shell.register('action', { id: 'mode.opens', get name() { return opensViewing.peek() ? 'Open this chart in Editing' : 'Open this chart in Viewing'; }, run: () => setOpensViewing(!opensViewing.peek()) });
  Shell.register('action', { id: 'chart.new', name: 'New chart', get names() { return ['Template', 'Templates', 'Gallery', ...(typeof Templates === 'undefined' ? [] : Templates.list().map(t => t.name))]; }, keys: '$mod+Shift+KeyN', enabled: () => !readOnly.peek(), why: () => whyNot(), run: () => Gallery.open() });
  Shell.register('action', { id: 'file.new', name: 'New workbook', run: () => Gallery.open({ workbook: true }) });

  return {
    get wb() { return book.value; },
    chart, version, day, shown, entered, schema, notes, definitions, relations, namesOn, computed: result, workOn, workAt, state, needs, moving, movable, rankBy, rankOver, linesOver, handMade, asWords,
    mastering, pageMaster, hasMaster, readOnly, viewing, setViewing, canAsk, seeing, seenIn, see, looks, lookOf, looking, letGo, lookChange, lookStep, undoLook: () => stepLook(true), lookTable, closeLook, keepTable, keepShown, showOnly, showAll, filterBy, valueAt, KIND, shownOf, lookWordsOf, LookBand, page: drawnPage, opensViewing, setOpensViewing, whyNot, needsWithin, change, keeping, asOfWords, would, asksDay, begins, endOf, endsOf, merging, endsAct, isDated, deleteLabel, mistakeLabel, bookName, lineNamed, nameLine, heldFrom, heldUntil, formerNames, notOurs, sayNotOurs, blanksApart, spanOf, dayChanger, amending, amendingRow, neverHeld, mergedInto, keepOff, responsible, newKinds, amendPending: amend, enteredBy, later, From, pending, ownDay, stage, discard, commit, deleting, deleteVerb, actOf, relating, transferable, transferring, repoint, ofScene, interposable, interposeWord, interposing, Pending, reverse, restore, views, scene, layouts, addView, who, begin, showMade, newChart, hasPattern,
    enterAt, putting, put, asksFrom, fixedAt, held: typedOut, overriding, backToRule, overOf, ruleSaid, noTone, annotate, broken, sandbox, sandboxBegun, unsandbox,
  };
})();
