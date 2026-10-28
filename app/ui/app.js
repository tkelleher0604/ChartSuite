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
    return lastChart = (v && [lastChart, ...ids].find(c => has(c) && wb.item(c, v).length)) || (has(lastChart) ? lastChart : ids[0] ?? null);
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
  const day = computed(() => Shell.time.value?.asOf ?? Log.today());
  // In History, the workbook as it stood just after the change picked, which can't be changed.
  const readOnly = computed(() => !!Shell.time.value?.stood);
  const stood = computed(() => {
    const t = Shell.time.value;
    if (!t?.stood) return null;
    const wb = book.value;
    return wb.at(t.at ?? wb.changes().find(c => c.id === t.stood)?.when);
  });
  const shown = computed(() => { version.value; return stood.value ?? book.value; });
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
  const result = computed(() => worked = Formulas.computeState(entered.value, definitions.value, { relations: relations.value, schema: schema.value }, worked));
  // Another day's working-out, as showing it would work it out: what the canvas lays out ahead for a day typed in the
  // date control. Shown then, it's worked out again from the same, which gives this one (Formulas.computeState).
  const workOn = d => chart.peek() ? Formulas.computeState(shown.peek().asOf(chart.peek(), d), definitions.peek(), { relations: relations.peek(), schema: schema.peek() }, worked) : null;
  const state = computed(() => result.value.records);
  // A record or a shape a change takes away (a deadline once paid, a shape added and undone) leaves the
  // selection with it, and a Key's row with its Key; a record only not there on the day or at the moment shown
  // stays selected.
  const shapes = computed(() => { version.value; return new Set(chart.value ? shown.value.rows(chart.value).filter(r => 'shape' in r).map(r => r.shape) : []); });
  let held = null;
  effect(() => {
    const now = { at: `${chart.value} ${JSON.stringify(Shell.time.value)}`, st: state.value, shapes: shapes.value }, was = held;
    held = now;
    const there = (h, k) => { const id = k.split(/[@#]/)[0]; return id in h.st || h.shapes.has(id); };
    const keys = Shell.selection.peek(), gone = k => there(was, k) && !there(now, k);
    if (was?.at === now.at && keys.some(gone)) Shell.select(keys.filter(k => !gone(k)), { replace: true });
  });
  // What needs attention as of the day shown (Formulas.attention). A check failed (Ownership Adds Up, Capacity
  // Held) is counted here, as an error; going to it selects what it's at, and asks why. The inspector counts
  // the rest, aiming at their rows.
  const needs = computed(() => Formulas.attention(result.value, notes.value, day.value));
  Shell.register('attention', { items: () => needs.value.filter(a => a.kind === 'error' && !a.error).map(({ id }) => ({ kind: 'error', go: () => {
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
  const keep = (c, s) => { stacks.value = { ...stacks.peek(), [c]: s }; try { sessionStorage.setItem('dendra.undo', JSON.stringify(stacks.peek())); } catch {} };
  const made = c => { const s = stackOf(c.chart); keep(c.chart, { undo: [...s.undo, { id: c.id, act: c.id }], redo: [] }); return c; };
  function step(back) {
    if (readOnly.peek()) return Shell.toast('Can’t change the past');
    // With a change pending, Undo discards it first, and says so, Redo bringing it back; it never undoes past it.
    const p = mine();
    if (back && p) { discard(); return Shell.toast(discarded(p), { redo: () => stage(p) }); }
    const c = chart.peek(), s = stacks.peek()[c] ?? { undo: [], redo: [] }, [from, to] = back ? ['undo', 'redo'] : ['redo', 'undo'], top = s[from].at(-1);
    const r = top ? book.peek().reverse(top.id, who()) : null;
    // A change kept from before a reload that never reached the workbook is passed over.
    if (r === null && top) { keep(c, { ...s, [from]: s[from].slice(0, -1) }); return step(back); }
    if (!r) return Shell.toast(back ? 'Nothing to undo' : 'Nothing to redo', { ms: 2000 });
    if (typeof r === 'string') return Shell.toast(r);
    keep(c, { [from]: s[from].slice(0, -1), [to]: [...s[to], { id: r.id, act: top.act }] });
    Shell.toast(`${back ? 'Undid' : 'Redid'}: ${Time.describe(book.peek().changes().find(x => x.id === top.act))}`, back ? { redo } : { undo });
  }
  const undo = () => step(true), redo = () => step(false);
  // The ids the change last previewed gave what it would add (see would), which the next change gives what it adds,
  // in order: so a change made as it was previewed is that change, ids and all. A change pending keeps its own.
  let named = [];
  const edit = (dated, ids) => book.peek().edit({ chart: chart.peek(), who: who(), day: typeof dated === 'string' ? dated : dated ? Shell.time.peek()?.asOf ?? null : null, ids });
  // One change, by the user: refused while the past is shown; dated from the day shown, or from the day `dated`
  // gives (a payment, from the day it was made), unless it's false (a view isn't a fact about the world). `say`,
  // a string or a function of the change, is toasted with Undo. `ids`, those its redline gave what it adds. A start
  // or an end it records past the day shown, which takes what it's at out of the chart then, is said, wherever it was
  // typed: "…, so it holds from Mar 2, 2027"; an end says its day itself ("Deleted … from Dec 1, 2026", Time.describe).
  function change(fn, { say, dated = true, ids, empty } = {}) {
    if (readOnly.peek()) { Shell.toast('Can’t change the past'); return null; }
    const tx = edit(dated, ids ?? named), was = entered.peek();
    if (!ids) named = [];
    fn(tx);
    const c = tx.commit();
    if (typeof c === 'string') { Shell.toast(c); return null; }
    if (!c) { empty?.(); return null; }
    made(c);
    const out = outBy(c, was), said = (typeof say === 'function' ? say(c) : say) || (out && typeof Time !== 'undefined' && Time.describe(c));
    if (said) Shell.toast(out?.holds === 'from' ? `${said}, so it holds from ${Tree.formatDate(out.day, 'short')}` : said, { undo });
    return c;
  }
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
    if (readOnly.peek()) return null;
    const mine = ids ?? [], tx = edit(dated, mine), now = entered.peek(), records = {};
    fn(tx);
    if (!ids) named = mine;
    const after = tx.asOf(day.peek());
    for (const id in after) if (after[id] !== now[id]) records[id] = after[id];
    for (const id in now) if (!(id in after)) records[id] = null;
    return Object.keys(records).length ? { records } : null;
  }
  // When a record added holds from (dendra.md, Time). One whose kind or relation has a start entry holds from
  // that, whenever it's recorded: a fund from its Formation Date, a general partner from its Admission Date.
  // A relation with none, an ownership or a membership, holds from a day said as it's made, in its redline
  // before Enter: the day shown, another, or all along, for what was always so; `change` takes it as `dated`
  // (a day, or false for all along). asksDay(record, recs) says whether a record about to be added asks its day,
  // its sides read in recs (the chart shown, and anything added with it).
  function asksDay(r, recs = state.peek()) {
    if (!(r?.args?.length > 1)) return false;
    const t = Tree.treeOf({ ...recs, '': r }, ''), N = notes.peek();
    return !!t && !N.notes('Start').some(n => n.pattern.args?.length === 1 && N.isStart({ out: { field: 'date' }, args: [{ edge: n.pattern.args[0].edge, loc: t }] }));
  }
  // How deleting a record ends it (dendra.md, Time), the mirror of when one added holds from. One whose kind or
  // relation has an end entry is ended by that entry, given in its redline before Enter: the entry's label
  // (Dissolution Date, Withdrawal Date). Any other object or relation, an ownership say, ends on a day said there:
  // true. An entry is a value, cleared as a value is typed over, from the day shown: false.
  function endOf(id, recs = state.peek()) {
    const r = recs[id];
    if (!r || r.computed || !(Tree.isObject(r) || r.args?.length > 1)) return false;
    const t = Tree.treeOf(recs, id), N = notes.peek();
    return N.notes('End').map(n => n.pattern.args?.length === 1 && n.pattern.args[0].edge).find(e => e && N.isEnd({ out: { field: 'date' }, args: [{ edge: e, loc: t }] })) ?? true;
  }
  // The day asked, wherever a record added or deleted asks it (the bar of a change pending): "From" and the day,
  // typed over as Paid… types its day, or "All along", from the menu its first word opens; or, `until` (true, or the
  // end entry that ends it), "Until" (or that entry) and the day, or "Never held". `day` is an ISO day, null (all
  // along, never held), or undefined while what's typed isn't a day; `set` takes the next. `auto` takes the focus, the
  // day selected, as it's shown. Esc puts back what was typed, keeping the keys there, as a value's does. A day after
  // the day shown, once it's left, is a link to the chart then, where the change is drawn, as the two-box panel's later
  // relation is.
  function From({ day, set, auto, until }) {
    const { useState, useRef, useLayoutEffect } = preactHooks;
    const [text, setText] = useState(null), [typing, setTyping] = useState(false), input = useRef(), button = useRef(), once = useRef(auto), was = useRef();
    // Shown, or switched, the day takes the keys, selected; all along, its menu does.
    useLayoutEffect(() => {
      if (once.current) { if (input.current) { input.current.focus(); input.current.select(); } else button.current?.focus(); }
      once.current = true;
    }, [day === null]);
    const words = until ? [until === true ? 'Until' : until, 'Never held'] : ['From', 'All along'], always = day === null, word = words[always ? 1 : 0];
    const shown = Shell.time.value?.asOf ?? Log.today(), later = !!day && day > shown && !typing;
    const pick = e => Shell.menu(e.currentTarget, [
      { label: words[0], checked: !always, run: () => { if (always) { setText(null); set(shown); } } },
      { label: words[1], checked: always, run: () => set(null) }]);
    const key = e => {
      if (e.key !== 'Escape' || text === null) return;
      e.preventDefault(); e.stopPropagation();
      setText(null); set(was.current);
      setTimeout(() => input.current?.select());
    };
    return html`<span class="from"><button ref=${button} type="button" class="sel dd" aria-haspopup="menu" aria-label=${word} onClick=${pick}><span>${word}</span></button>
      ${always ? null : later ? dayLink(day) : html`<span class="hug"><input ref=${input} class="cell date" value=${text ?? (day ? Tree.formatDate(day, 'short') : '')} aria-label=${words[0]}
        spellcheck=${false} autocomplete="off" aria-invalid=${day === undefined ? 'true' : null} onFocus=${() => setTyping(true)} onBlur=${() => { setTyping(false); if (day) setText(null); }} onKeyDown=${key}
        onInput=${e => { if (text === null) was.current = day; setText(e.target.value); set(Tree.parseDate(Tree.clean(e.target.value)) ?? undefined); }} /></span>`}</span>`;
  }
  // A day a change holds from or until, said where it isn't the day shown: a link to the chart then.
  const dayLink = d => html`<button type="button" class="lk" onClick=${() => Shell.at(d === Log.today() ? null : { asOf: d })}>${Tree.formatDate(d, 'short')}</button>`;

  // ---- A change pending (dendra.md, Part 2: pending changes are redlined): shown before it's made, exactly as it
  // will be; made only by Enter or its verb, discarded only by Esc or Discard, never dropped without a word; and saying
  // when it holds ----
  // One at a time, whoever begins it: a relation ticked or named in the two-box panel, records deleted, rows pasted.
  // { verb, what (what it does, in words; `parts`, the same set out, as a paste's), make(tx, day) (the change, of the
  // day said), asks ('from' or 'until', where it asks its day, as `day`; `word`, the end entry an 'until' gives), needs
  // (the records it's at), source (where it began), say, done(change), auto }; and `from`, the day shown as it was
  // begun. It's the chart's it was begun in: a click away, another view, another day or another chart shown leave it
  // pending; one begun elsewhere in its place says so, and Undo brings it back.
  const pending = signal(null);
  let staged = 0;
  const mine = () => { const p = pending.peek(); return p && p.chart === chart.peek() ? p : null; };
  // Its day: the one it asks, where it adds; else the day shown when it was begun, never the day shown at Enter, so a
  // change begun as of a day and made after going back to today still holds from that day. A deletion is dated so, and
  // ends what it ends on the day it asks (make's `day`).
  const datedOf = p => p.asks === 'from' ? p.day ?? false : p.from ?? false;
  const doing = { Add: 'adding', Delete: 'deleting', Paste: 'pasting' };
  const discarded = p => `Discarded ${doing[p.verb] ?? p.verb.toLowerCase()} ${p.what}`;
  function stage(p) {
    if (readOnly.peek()) { Shell.toast('Can’t change the past'); return; }
    const was = pending.peek(), back = document.activeElement !== document.body ? document.activeElement : null;
    pending.value = { ids: [], n: ++staged, chart: chart.peek(), from: Shell.time.peek()?.asOf ?? null, back, ...p };
    if (was && was.source !== p.source) Shell.toast(discarded(was), { undo: () => stage(was) });
  }
  // Gone, with the keys in its bar, they go back where they were as it was begun, or to its part of the window.
  function after(p) {
    setTimeout(() => {
      const a = document.activeElement;
      if (a && a !== document.body && a.isConnected) return;
      (p.back?.isConnected ? p.back : p.back?.closest?.('[data-region]') ?? document.getElementById('view'))?.focus({ preventScroll: true });
    });
  }
  function discard() {
    const p = pending.peek();
    if (!p) return;
    pending.value = null;
    after(p);
  }
  // Dropped, saying why: what it's at no longer there (an Undo took it, or History, or a change merged), or nothing
  // left to change, once what dropped it has said what it did.
  function drop(p, why) { if (pending.peek() === p) pending.value = null; after(p); setTimeout(() => Shell.toast(`${discarded(p)}${why}`)); }
  const there = p => (p.needs ?? []).every(id => book.peek().item(p.chart, id).length > 0);
  const gone = p => p.verb === 'Delete' ? ', which no longer exists' : ': something it’s at no longer exists';
  // Made, it's one change, from the day said, its redline going as the chart it showed is drawn; refused, it stays
  // pending, and the toast says why.
  function commit() {
    const p = mine();
    if (!p || (p.asks && p.day === undefined)) return null;
    if (!there(p)) return drop(p, gone(p)), null;
    let empty = false;
    const c = batch(() => {
      pending.value = null;
      const made = change(tx => p.make(tx, p.day), { dated: datedOf(p), ids: p.ids, say: p.say, empty: () => { empty = true; } });
      if (!made && !empty) pending.value = p;
      return made;
    });
    if (empty) drop(p, ', which changes nothing');
    else if (c) { p.done?.(c); after(p); }
    return c;
  }
  // Deleting records, as a change pending: each ended as endOf says. A record an end entry ends is given it, the day
  // asked, recorded from the day shown as one typed in the inspector is, so the record says, before that day, when it
  // ends; any other object or relation ends on the day asked, with all that's at it; and never held, each is deleted as
  // if never made. An entry is cleared from the day shown. `what` says what goes; `also`, what else the change does (a
  // free shape deleted with them).
  function deleting(ids, what, o = {}) {
    const recs = state.peek(), ends = ids.map(id => endOf(id, recs)), asks = ends.some(e => e !== false), words = [...new Set(ends.filter(e => typeof e === 'string'))];
    const ending = (tx, id, e, d) => {
      const at = Tree.entryAt(entered.peek(), id, e);
      if (at) tx.update(at, { value: d }); else tx.add('record', { at: id, edge: e, field: 'date', value: d });
    };
    stage({ verb: 'Delete', what, source: 'delete', needs: ids, say: c => typeof Time === 'undefined' ? 'Deleted' : Time.describe(c), ...o,
      ...(asks && { asks: 'until', day: day.peek(), word: words.length === 1 && ends.every(e => e === words[0] || e === false) ? words[0] : true }),
      make: (tx, d) => { ids.forEach((id, i) => ends[i] === false ? tx.remove(id) : d && typeof ends[i] === 'string' ? ending(tx, id, ends[i], d) : tx.remove(id, d)); o.also?.(tx); } });
  }
  // Its redline: the chart as it would leave it on the day shown (would), worked out again as what that reads
  // changes (the workbook, the day shown, its own day), and shown again once another preview gives way (a value
  // typed, a tag pointed at); nothing, where on the day shown it changes nothing, or another chart is shown.
  let previewed = null;
  Shell.ready.then(() => typeof FormulaBar !== 'undefined' && effect(() => {
    const p = pending.value, v = version.value, d = day.value, c = chart.value, shown = FormulaBar.pending.value;
    if (p && !there(p)) return drop(p, gone(p));
    if (!p || p.chart !== c) { previewed = null; if (shown?.from === 'pending') FormulaBar.preview(null); return; }
    if ((shown && shown.from !== 'pending') || (p.asks && p.day === undefined)) return;
    if (shown && previewed?.p === p && previewed.v === v && previewed.d === d) return;
    previewed = { p, v, d };
    FormulaBar.preview(would(tx => p.make(tx, p.day), { dated: datedOf(p), ids: p.ids }), 'pending');
  }));
  // Enter makes it, wherever the keys are, but in what's being typed in or pressed.
  addEventListener('keydown', e => {
    if (e.key !== 'Enter' || !mine() || e.defaultPrevented || e.isComposing) return;
    if (e.target.closest?.('input, textarea, select, button, a[href], [contenteditable], .CodeMirror, dialog, .float')) return;
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
  // The window's one bar, under the view shown, while a change is pending in the chart shown: what it does, in the
  // redline's ink, the day it holds from or until (asked, where it asks one), Discard and its verb. Esc in it
  // discards it; Enter on its day makes it.
  function Pending() {
    const p = pending.value;
    if (!p || p.chart !== chart.value) return null;
    const esc = e => { if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); e.stopPropagation(); discard(); } };
    const enter = e => { if (e.key === 'Enter' && !e.defaultPrevented && !e.target.closest('.lk')) { e.preventDefault(); e.stopPropagation(); commit(); } };
    return html`<div class="pendbar" role="region" aria-label=${p.verb} onKeyDown=${esc}>
      <span class="what">${(p.parts ?? [html`<span class=${p.verb === 'Delete' ? 'del' : 'add'}>${p.what}</span>`]).map((t, i) => html`${i ? html`<span class="sep">·</span>` : null}${t}`)}</span>
      ${p.asks ? html`<span class="when" onKeyDown=${enter}><${From} key=${p.n} day=${p.day} auto=${p.auto} until=${p.asks === 'until' && p.word}
          set=${d => { if (pending.peek()?.n === p.n) pending.value = { ...pending.peek(), day: d }; }} /></span>`
        : p.from ? html`<span class="when">From ${p.from === day.value ? Tree.formatDate(p.from, 'short') : dayLink(p.from)}</span>` : null}
      <button class="btn" onClick=${discard}>Discard</button>
      <button class="btn primary" disabled=${p.asks && p.day === undefined} onClick=${commit}>${p.verb}</button>
    </div>`;
  }
  // From History: an older change undone or redone (its reverse), or an item deleted restored, made now, and
  // said as History says it.
  function remake(c) {
    if (typeof c === 'string') return Shell.toast(c);
    Shell.at(null);
    if (c) { made(c); Shell.toast(Time.describe(c), { undo }); }
  }
  const reverse = id => remake(book.peek().reverse(id, who()));
  const restore = item => remake(book.peek().restore(chart.peek(), item, who()));

  // ---- The chart menu: the workbook's charts, a new one, and the workbooks this browser keeps ----
  const books = signal([]);
  const listBooks = () => Store.books().then(bs => { books.value = bs; });
  // A new chart, added to a workbook: the chart shown without its records. It keeps the schema, and every
  // note that isn't at one of the records: the definitions, names, descriptions and styles. Of the views, it
  // keeps those named for what they show (Entities, Ownership), and one chart, Chart, with the styles and
  // Shown of the chart shown, or else the first; the old chart's own pages stay behind, and its page starts
  // afresh.
  function startChart(wb) {
    const c = Log.newId(), names = new Set(wb.charts().map(x => Tree.norm(x.name))), from = chart.peek(), src = book.peek();
    let name = 'Untitled', i = 2;
    while (names.has(Tree.norm(name))) name = `Untitled ${i++}`;
    const tx = wb.edit({ chart: c, who: who() }), kept = new Map();
    tx.add('chart', { name }, c);
    const vs = from ? views.peek() : [], like = (vs.find(v => v.id === Shell.view.peek() && v.layout === 'chart') ?? vs.find(v => v.layout === 'chart'))?.id;
    if (from) {
      const L = layouts.peek(), own = v => [...L.kinds, ...L.relations, ...L.datatypes].some(l => Tree.same(l.name, v.name) && JSON.stringify(l.rows) === JSON.stringify(v.rows));
      for (const tree of Object.values(src.schema(from))) tx.add('spec', { tree });
      for (const v of vs) if (v.id === like || (v.layout === 'table' && own(v))) kept.set(v.id, tx.add('record', { kind: 'View' }));
      const moved = t => t.args ? { ...t, args: t.args.map(a => ({ ...a, loc: moved(a.loc) })) } : t.id === undefined ? t : { ...t, id: kept.get(t.id) };
      for (const r of src.rows(from)) if ('note' in r && (!r.view || kept.has(r.view)) && [...Tree.idsIn(r.pattern)].every(id => kept.has(id)))
        tx.note(r.label, moved(r.pattern), r.label === 'Name' && r.pattern.id === like ? 'Chart' : r.value, { view: kept.get(r.view), param: r.param });
    }
    const first = kept.get(like) ?? tx.add('record', { kind: 'View' });
    tx.note('Name', viewTree(first), 'Chart');
    page(tx, first, name);
    return tx.commit();
  }
  // A chart's page, begun as every page of the sample is: its title, the chart's name, under it the day it's as
  // of, and its Key, which the page sets at the sheet's size and places, as it does every page's.
  function page(tx, view, title) {
    tx.add('shape', { view, geometry: 'text', role: 'title', text: title });
    tx.add('shape', { view, geometry: 'text', role: 'date', text: '="As of " & TEXT(@AsOf, "mmmm d, yyyy")' });
    tx.add('shape', { view, geometry: 'legend', title: 'Key', columns: 2 });
  }
  // Another chart, at the view last shown in it (lastView), or else its first: a step on the trail, as another view is.
  function open(id) {
    const wb = shown.peek(), v = lastView.get(id) ?? viewsIn(wb.asOf(id, day.peek()), wb.notes(id))[0]?.id;
    if (v) preactSignals.batch(() => { Shell.select([]); Shell.show(v); });
  }
  // A new chart is named as it begins, in the title bar.
  function newChart() {
    if (readOnly.peek()) return Shell.toast('Can’t change the past');
    const c = startChart(book.peek());
    if (typeof c === 'string') return Shell.toast(c);
    open(c.chart);
    Shell.nameChart();
  }
  const blank = () => { const wb = Log.open([]), c = startChart(wb); if (typeof c === 'string') return Shell.toast(c); return opened(Store.open({ id: Log.newId(), sample: wb })).then(() => { if (chart.peek() === c.chart) Shell.nameChart(); }); };
  // Renaming the chart, as one change: its name, and each page's title that says its name still (one changed by
  // hand keeps what it says), so its exports are named as it is.
  function rename(id, name) {
    const was = book.peek().charts().find(c => c.chart === id)?.name;
    if (id !== chart.peek() || !name || name === was) return;
    change(tx => {
      tx.set(id, { name });
      for (const r of book.peek().rows(id)) if ('shape' in r && r.role === 'title' && r.text === was) tx.update(r.shape, { text: name });
    }, { dated: false });
  }
  Shell.register('workbook', {
    charts: () => (version.value, book.value.charts().map(c => ({ id: c.chart, name: c.name }))),
    current: () => chart.value,
    open,
    rename,
    menu: () => [{ label: 'New chart', run: newChart }, { label: 'Workbooks', items: [
      ...books.value.map(b => ({ label: b.name, checked: b.id === Store.where()?.id, run: () => b.id !== Store.where()?.id && opened(Store.open({ id: b.id })) })),
      ...(books.value.length ? ['-'] : []), { label: 'New workbook', run: blank }] }],
  });
  Shell.register('undo', {
    undo, redo,
    canUndo: () => !readOnly.value && stackOf(chart.value).undo.length > 0,
    canRedo: () => !readOnly.value && stackOf(chart.value).redo.length > 0,
  });

  // ---- Views: View objects, each described by its own notes, never dated ----
  const viewTree = id => ({ id, kind: 'View' });
  // A chart's views, in their order, from its records and notes; the chart shown's kept while they say the same, so
  // the tabs aren't drawn again for every edit.
  const viewsIn = (st, N) => (Tree.index(st).kinds.get('view') ?? []).map(id => {
    const t = viewTree(id), lay = N.value('Layout', t);
    return { id, name: N.nameOf(st, id), layout: lay && typeof lay === 'object' ? 'table' : 'chart', rows: lay?.rows ?? null,
      keeps: N.value('As Of', t) ?? null, order: N.order(t) ?? Infinity };
  }).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  const viewsNow = computed(() => viewsIn(entered.value, notes.value));
  const views = keptWhile(() => JSON.stringify(viewsNow.value), () => viewsNow.value);
  const lastView = new Map();
  effect(() => { const c = chart.value, v = Shell.view.value; if (c && views.value.some(x => x.id === v)) lastView.set(c, v); });
  // The view shown, drawn: what the canvas, the format bar and the inspector's Look read.
  const scene = computed(() => {
    // It reads the workbook's notes and shapes as well as the state (Scene keeps what's drawn from the same).
    version.value;
    const v = views.value.find(x => x.id === Shell.view.value);
    return v?.layout !== 'chart' ? null : Scene.of(shown.value, chart.value, v.id, day.value, { state: state.value, computed: result.value });
  });
  // What a table's rows can be: each kind, each relation (its edges, every other label removed), and dates
  // and documents.
  const strip = t => t.args ? { args: t.args.map(a => ({ edge: a.edge, loc: strip(a.loc) })) } : {};
  const layouts = computed(() => {
    const N = notes.value, rels = new Map(), kinds = new Set(), byName = (a, b) => a.name.localeCompare(b.name);
    for (const t of Object.values(schema.value)) {
      if (!t.args) { if (!Tree.isView(t)) kinds.add(t.kind); }
      else if (t.args.length > 1) { const p = strip(t); rels.set(Tree.key(p), p); }
    }
    return {
      kinds: [...kinds].map(kind => ({ name: Tree.plural(kind), rows: { kind } })).sort(byName),
      relations: [...rels.values()].map(p => ({ name: N.name(p), rows: p })).sort(byName),
      datatypes: ['date', 'document'].map(d => ({ name: Tree.plural(Tree.DATATYPES[d]), rows: d })),
    };
  });
  // A new view after the one it copies, or at the end: a chart, or a table of `rows`. A copy takes the
  // original's notes and shapes, but its name. A new chart takes the styles and Shown of the chart shown, or
  // else of the first, but not where it put things, and its page starts afresh.
  function addView(name, rows, from) {
    const vs = views.peek(), at = from ? vs.findIndex(v => v.id === from) + 1 : vs.length, taken = new Set(vs.map(v => Tree.norm(v.name)));
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
      if (like) for (const { id: _, ...r } of book.peek().rows(chart.peek())) {
        if ('note' in r && r.view === like && (from || r.label !== 'Position')) { const { note, ...x } = r; tx.add('note', { ...x, view: id }); }
        else if (!from) continue;
        else if ('shape' in r && r.view === from) { const { shape, ...s } = r; tx.add('shape', { ...s, view: id }); }
        else if ('note' in r && !r.view && r.pattern.id === from && r.label !== 'Order' && r.label !== 'Name') tx.note(r.label, t, r.value);
      }
      if (!from && rows === undefined) page(tx, id, book.peek().charts().find(c => c.chart === chart.peek())?.name ?? n);
    }, { dated: false });
    return id;
  }
  const order = ids => change(tx => ids.forEach((id, k) => tx.note('Order', viewTree(id), k + 1)), { dated: false });
  // What a view can show, as menu items: a chart, or a table of a kind's records, a relation's, or every date or
  // document, each picked as pick(name, rows). Given a view, what it shows is checked.
  function shows(pick, v) {
    const L = layouts.peek(), on = rows => v && v.layout === 'table' && JSON.stringify(v.rows) === JSON.stringify(rows);
    const as = l => ({ label: l.name, checked: on(l.rows), run: () => pick(l.name, l.rows) });
    const group = (label, ls) => ({ label, checked: v && ls.some(l => on(l.rows)), items: ls.map(as) });
    return [{ label: 'Chart', checked: v && v.layout === 'chart', run: () => pick('Chart') }, '-', group('Records', L.kinds), group('Relations', L.relations), ...L.datatypes.map(as)];
  }
  Shell.register('views', {
    list: () => views.value,
    rename: (id, name) => change(tx => tx.note('Name', viewTree(id), name), { dated: false }),
    move: (id, i) => { const ids = views.peek().map(v => v.id).filter(x => x !== id); ids.splice(i, 0, id); order(ids); },
    // A new view of what's picked: its id, or null if none is.
    add: anchor => new Promise(done => {
      let chosen = false;
      Shell.menu(anchor, shows((name, rows) => { chosen = true; done(addView(name, rows)); }),
        { placement: 'top-start', onClose: () => queueMicrotask(() => chosen || done(null)) });
    }),
    // A view's own menu, on its tab: what it shows, as the inspector's view panel sets it, and copying or
    // deleting it.
    menu: id => {
      const v = views.peek().find(x => x.id === id);
      return [
        { label: 'Show', items: shows((_, rows) => change(tx => tx.note('Layout', viewTree(id), rows && { rows }), { dated: false }), v) },
        '-',
        { label: 'Duplicate', run: () => { const copy = addView(v.name, undefined, id); if (copy) Shell.show(copy); } },
        { label: 'Delete', danger: true, disabled: views.peek().length < 2, run: () => change(tx => tx.remove(id), { say: `Deleted ${v.name}`, dated: false }) },
      ];
    },
  });
  // Find reaches each definition, as its pattern in general: the statute it encodes (inspector.js).
  Shell.register('find', { items: () => { const N = notes.peek(); return N.notes('Formula').map(n => ({ label: N.name(n.pattern), detail: 'Definition', run: () => Shell.select([Shell.general(n.pattern)]) })); } });

  // ---- Where the workbook is kept: its status at the foot, and opening and saving it in the chart menu ----
  const status = signal(Store.status());
  Store.subscribe(st => { status.value = st; });
  Shell.register('status', {
    render: () => {
      const st = status.value;
      return st.fix ? html`<button class="status-fix" onClick=${() => Store.fix()}>${st.text}</button>`
        : html`<span class=${'status-store' + (st.tone ? ' is-' + st.tone : '')} title=${st.detail ?? ''}>${st.text}</span>`;
    },
  });
  const opened = p => p.then(wb => wb && use(wb), e => e?.name === 'AbortError' || Shell.toast(e?.message || 'Couldn’t open it'));
  const saved = p => p.then(listBooks, e => e?.name === 'AbortError' || Shell.toast(e?.message || 'Couldn’t save it'));

  // Settings: who you are, and signing in to the SharePoint library the team keeps its workbooks and documents
  // in. The connection to it is IT's to set up (docs/sharepoint-setup.md), so it's folded away, and opens
  // when signing in needs it.
  function settings() {
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
        <details ref=${connection}><summary>Connection</summary><div class="settings">${field('tenant', 'Tenant ID')}${field('client', 'Client ID')}${field('library', 'Library')}</div></details>
      </div>`;
    }
    Shell.dialog({ title: 'Settings', width: 480, actions: [{ label: 'Cancel', value: false }, { label: 'Done', value: true, primary: true }], body: () => html`<${Body} />` })
      .then(ok => { if (ok) { store.set('name', Tree.clean(v.name) || null); keep(); } });
  }
  // Saving somewhere keeps the workbook there from now on, as Office's Save As does; a copy is downloaded.
  [
    { id: 'file.open', name: 'Open…', keys: '$mod+O', run: () => opened(Store.openFile()) },
    { id: 'file.save', name: 'Save as…', keys: '$mod+Shift+S', run: () => saved(Store.saveAs('file')) },
    { id: 'file.library', name: 'Save to SharePoint…', run: () => saved(Store.saveAs('library')) },
    { id: 'file.download', name: 'Download a copy', run: () => Store.download() },
  ].forEach((a, i) => Shell.register('action', { ...a, menu: 'chart', order: 1 + i }));
  Shell.register('action', { id: 'settings', name: 'Settings', menu: 'chart', order: 20, run: settings });
  Shell.register('action', { id: 'chart.new', name: 'New chart', run: newChart });
  Shell.register('action', { id: 'file.new', name: 'New workbook', run: blank });

  return {
    get wb() { return book.value; },
    chart, version, day, shown, entered, schema, notes, definitions, relations, computed: result, workOn, state, needs,
    readOnly, change, would, asksDay, endOf, From, pending, stage, discard, commit, deleting, Pending, reverse, restore, views, scene, layouts, addView, who, blank,
  };
})();
