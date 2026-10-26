// The open workbook, and what every part reads from it: the chart in use, its schema and notes, and its state
// as of the shell's time. A part reads App.state.value (and the others) inside the window's drawing, so it
// redraws when the workbook changes, another is opened, or the time moves. Edits go through App.edit().
//   App.wb        the workbook (core/README.md); Store opens it, so it is replaced when another is opened
//   App.chart     signal: the chart in use
//   App.version   signal: bumped after every change and every opening; read it to follow the workbook
//   App.day       computed: the day shown ('yyyy-mm-dd'), today unless the time says otherwise
//   App.shown     computed: the workbook as shown, as it stood at a moment in History, or as it is
//   App.entered   computed: the chart's entered records as of the day, a state
//   App.state     computed: the computed state, entered and computed records, what the parts draw
//   App.computed  computed: the formulas' whole working-out (Formulas.computeState), for the formula bar's
//                 Formulas.ground, evaluateRow and diff
//   App.schema, App.notes   computed: the chart's schema and its Notes reader
//   App.edit(opts?) → a transaction for the chart in use, by the current user, from the day shown
//   App.who()     the name changes are made under

const App = (() => {
  const { signal, computed } = preactSignals;
  const html = Shell.html;

  // Empty until Store has opened the workbook, which the launch screen covers.
  const book = signal(Log.open({ dendra: 1, changes: [] }));
  const version = signal(0);
  const chart = signal(null);
  let unsubscribe = () => {};
  function use(wb) {
    unsubscribe();
    unsubscribe = wb.subscribe(() => { version.value++; });
    book.value = wb;
    if (!wb.charts().some(c => c.chart === chart.peek())) chart.value = wb.charts()[0]?.chart ?? null;
    version.value++;
  }
  Store.open({ sample: SAMPLE }).then(use, () => use(Log.open(SAMPLE)));

  const who = () => Store.who() || Shell.user.value.name || 'You';
  const day = computed(() => Shell.time.value?.asOf ?? Log.today());
  // In History, the workbook as it stood just after the change picked.
  const stood = computed(() => {
    const t = Shell.time.value;
    if (!t?.stood) return null;
    const wb = book.value;
    return wb.at(t.at ?? wb.changes().find(c => c.id === t.stood)?.when);
  });
  const shown = computed(() => { version.value; return stood.value ?? book.value; });
  const entered = computed(() => { version.value; return chart.value ? shown.value.asOf(chart.value, day.value) : {}; });
  const schema = computed(() => { version.value; return chart.value ? shown.value.schema(chart.value) : {}; });
  const notes = computed(() => { version.value; return chart.value ? shown.value.notes(chart.value) : Notes.index([]); });
  // The formulas work the chart out from its Formula notes, and its relations' names and lists.
  const definitions = computed(() => notes.value.definitions(schema.value));
  const names = computed(() => ({ relations: notes.value.relations(schema.value) }));
  const result = computed(() => Formulas.computeState(entered.value, definitions.value, names.value));
  const state = computed(() => result.value.records);

  const edit = (opts = {}) => book.peek().edit({ chart: chart.peek(), who: who(), day: Shell.time.peek()?.asOf, ...opts });

  Shell.register('workbook', {
    charts: () => (version.value, book.value.charts().map(c => ({ id: c.chart, name: c.name }))),
    current: () => chart.value,
    open: id => { chart.value = id; },
  });
  Shell.register('undo', {
    undo: () => book.peek().undo(who(), chart.peek()),
    redo: () => book.peek().redo(who(), chart.peek()),
    canUndo: () => (version.value, book.value.stacks(who(), chart.value).undo.length > 0),
    canRedo: () => (version.value, book.value.stacks(who(), chart.value).redo.length > 0),
  });

  // Where the workbook is kept: its status at the foot, and opening and saving it in the chart menu.
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
  [
    { id: 'file.open', name: 'Open…', keys: '$mod+O', run: () => opened(Store.openFile()) },
    { id: 'file.save', name: 'Save a copy…', keys: '$mod+Shift+S', run: () => opened(Store.saveAs('file')) },
    { id: 'file.library', name: 'Save to SharePoint…', run: () => opened(Store.saveAs('library')) },
    { id: 'file.download', name: 'Download', run: () => Store.download() },
  ].forEach((a, i) => Shell.register('action', { ...a, menu: 'chart', order: 1 + i }));

  return {
    get wb() { return book.value; },
    chart, version, day, shown, entered, state, computed: result, schema, notes, edit, who,
  };
})();
