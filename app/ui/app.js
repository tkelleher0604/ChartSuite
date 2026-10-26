// The open workbook, and what every part reads from it: the chart in use, its schema and notes, and its state
// as of the shell's time. A part reads App.state.value (and the others) inside the window's drawing, so it
// redraws when the workbook changes or the time moves. Edits go through App.edit(), one change each.
//   App.wb        the workbook (core/README.md)
//   App.chart     signal: the chart in use
//   App.version   signal: bumped after every change, for anything that caches by it
//   App.day       computed: the day shown ('yyyy-mm-dd'), today unless the time says otherwise
//   App.shown     computed: the workbook as shown, as it stood at a moment in History, or as it is
//   App.entered   computed: the chart's entered records as of the day, a state
//   App.state     computed: the computed state, what the parts draw
//   App.schema, App.notes   computed: the chart's schema and its Notes reader
//   App.edit(opts?) → a transaction for the chart in use, by the current user, from the day shown
//   App.who()     the name changes are made under

const App = (() => {
  const { signal, computed } = preactSignals;

  const wb = Log.open(SAMPLE);
  const version = signal(0);
  wb.subscribe(() => { version.value++; });

  const chart = signal(wb.charts()[0].chart);
  const who = () => Shell.user.value.name || 'You';
  const day = computed(() => Shell.time.value?.asOf ?? Log.today());
  const shown = computed(() => { version.value; const t = Shell.time.value; return t?.stood ? wb.at(t.at) : wb; });
  const entered = computed(() => shown.value.asOf(chart.value, day.value));
  const schema = computed(() => shown.value.schema(chart.value));
  const notes = computed(() => shown.value.notes(chart.value));
  // Until the reworked engine lands, the computed state is the entered one.
  const state = computed(() => entered.value);

  const edit = (opts = {}) => wb.edit({ chart: chart.value, who: who(), day: Shell.time.value?.asOf, ...opts });

  Shell.register('workbook', {
    charts: () => (version.value, wb.charts().map(c => ({ id: c.chart, name: c.name }))),
    current: () => chart.value,
    open: id => { chart.value = id; },
  });
  Shell.register('undo', {
    undo: () => wb.undo(who(), chart.value),
    redo: () => wb.redo(who(), chart.value),
    canUndo: () => (version.value, wb.stacks(who(), chart.value).undo.length > 0),
    canRedo: () => (version.value, wb.stacks(who(), chart.value).redo.length > 0),
  });

  return { wb, chart, version, day, shown, entered, state, schema, notes, edit, who };
})();
