// The workbook's charts, in the top bar of the chart and the record panel: a menu naming the current chart,
// which switches to another, starts a new one (blank, or a copy of this one), renames or deletes this one,
// and restores a deleted one. Charts don't share records or formulas; Copy formulas from another chart is
// in the panel's Formulas view. Loaded after panel.js, whose click handling runs these actions.

const workbookUi = { renaming: false };

function chartSwitcher() {
  const current = chartInUse();
  if (workbookUi.renaming)
    return `<input class="input chart-name-input" data-chart-rename value="${esc(current.name)}" aria-label="Chart name" autocomplete="off" spellcheck="false">`;
  const open = ui.menu === 'charts';
  const others = workbook.charts.filter(c => c.id !== current.id);
  const items = open ? [
    '<div class="menu-head">Charts in this workbook</div>',
    ...workbook.charts.map(c => `<button class="menu-item" role="menuitemradio" aria-checked="${c.id === current.id}" data-action="chart-switch" data-id="${esc(c.id)}">
      <span class="menu-text">${esc(c.name)}</span>${c.id === current.id ? icon('check') : ''}</button>`),
    '<div class="menu-sep"></div>',
    `<button class="menu-item" role="menuitem" data-action="chart-new">${icon('plus')}<span class="menu-text">New chart</span></button>`,
    `<button class="menu-item" role="menuitem" data-action="chart-duplicate"><span class="menu-text">Duplicate this chart</span></button>`,
    `<button class="menu-item" role="menuitem" data-action="chart-rename"><span class="menu-text">Rename this chart…</span></button>`,
    `<button class="menu-item" role="menuitem" data-action="chart-delete"${workbook.charts.length < 2 ? ' disabled title="A workbook needs at least one chart"' : ''}><span class="menu-text">Delete this chart</span></button>`,
    ...(others.length ? ['<div class="menu-sep"></div>', '<div class="menu-head">Copy formulas from</div>',
      ...others.map(c => `<button class="menu-item" role="menuitem" data-action="chart-copy-formulas" data-id="${esc(c.id)}" title="Copy its definitions and relation names into this chart, which keeps them unsynced from then on"><span class="menu-text">${esc(c.name)}</span></button>`)] : []),
    ...(workbook.deleted.length ? ['<div class="menu-sep"></div>', '<div class="menu-head">Deleted</div>',
      ...workbook.deleted.map(c => `<button class="menu-item" role="menuitem" data-action="chart-restore" data-id="${esc(c.id)}"><span class="menu-text">Restore ${esc(c.name)}</span></button>`)] : []),
  ].join('') : '';
  return `<span class="menu-anchor chart-switcher"><button class="chart-name" data-action="menu" data-menu="charts" aria-haspopup="menu" aria-expanded="${open}" title="Charts in this workbook">
      <span class="chart-name-text">${esc(current.name)}</span>${icon('chevron-down')}</button>
    ${open ? `<div class="pop menu menu-left" role="menu">${items}</div>` : ''}</span>`;
}

// After a switch the hash may name a record the new chart doesn't have, so the panel starts from All.
function afterChartChange() {
  clearForms();
  if (typeof chart !== 'undefined') Object.assign(chart, { engaged: null, editing: null, move: null, connect: null, quick: null, ask: null, renaming: null });
  history.replaceState(null, '', location.pathname + location.search);
}

Object.assign(actions, {
  'chart-switch': d => { switchChart(d.id); afterChartChange(); },
  'chart-new': () => { addChart('New chart'); afterChartChange(); workbookUi.renaming = true; },
  'chart-duplicate': () => { duplicateChart(workbook.chartId); afterChartChange(); },
  'chart-rename': () => { workbookUi.renaming = true; },
  'chart-delete': () => {
    const name = chartInUse().name;
    const error = deleteChart(workbook.chartId);
    afterChartChange();
    ui.notice = error ?? null;
    ui.info = error ? null : `Deleted ${name}. The chart menu can restore it.`;
  },
  'chart-restore': d => { restoreChart(d.id); afterChartChange(); },
  'chart-copy-formulas': d => {
    const from = workbook.charts.find(c => c.id === d.id);
    const count = from?.state.definitions?.length ?? 0;
    const error = copyFormulasFrom(d.id);
    ui.notice = error ?? null;
    ui.info = error ? null : `Copied ${count} formula${count === 1 ? '' : 's'} from ${from.name}. Undo takes them back.`;
  },
});

function finishChartRename(input, keep) {
  if (!workbookUi.renaming) return;
  workbookUi.renaming = false;
  if (keep) renameChart(workbook.chartId, input.value);
  render();
}

document.addEventListener('keydown', e => {
  const input = e.target.closest?.('[data-chart-rename]');
  if (!input) return;
  if (e.key === 'Enter') { e.preventDefault(); finishChartRename(input, true); }
  if (e.key === 'Escape') { e.preventDefault(); finishChartRename(input, false); }
});
document.addEventListener('focusout', e => {
  const input = e.target.closest?.('[data-chart-rename]');
  if (input) finishChartRename(input, true);
});

// Puts the caret in the chart's name box when it's just been opened for renaming.
function focusChartRename() {
  const input = document.querySelector('[data-chart-rename]');
  if (input && document.activeElement !== input) { input.focus(); input.select(); }
}
