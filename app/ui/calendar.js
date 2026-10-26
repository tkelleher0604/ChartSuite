// The Calendar: every date in the chart, entered or computed, as one agenda (overdue, this week, the next
// 30 days, later, and the past) or a month at a time, filtered by kind, by object (with what it reaches
// through its lists, such as its Holdings) or to what's computed, and exported to Outlook as an .ics file.
// What's shown is in the address, so it can be linked to:
//   calendar.html#view=month&day=2026-11-03&kind=Entity&object=<id>&reach=Holdings|Controlled Companies&computed=1

const cal = {
  view: 'agenda',     // 'agenda' or 'month'
  day: Agenda.isoToday(), // the day the month view has selected, which picks its month
  kind: null,         // the kind an event's object must be
  object: null,       // the object an event must belong to, with `reach`
  reach: [],          // the object's lists of relatives whose members count too, directly and indirectly
  computed: false,    // whether only computed dates are shown
  past: false,        // whether the Past group is open
  exportPast: false,  // whether the export takes past dates too
};
const NO_FILTERS = { kind: null, object: null, reach: [], computed: false };

// ---- The address ----
// Read before the records are, so what it names is checked where it's used: an object that's gone, or a
// kind the chart doesn't have, filters nothing.
function readAddress() {
  const p = new URLSearchParams(location.hash.slice(1));
  const day = p.get('day');
  Object.assign(cal, {
    view: p.get('view') === 'month' ? 'month' : 'agenda',
    day: /^\d{4}-\d{2}-\d{2}$/.test(day ?? '') ? day : Agenda.isoToday(),
    kind: clean(p.get('kind')) || null,
    object: p.get('object') || null,
    reach: p.get('object') ? (p.get('reach') ?? '').split('|').map(clean).filter(Boolean) : [],
    computed: p.get('computed') === '1',
    past: p.get('past') === '1',
  });
}
function writeAddress() {
  const p = new URLSearchParams();
  if (cal.view === 'month') p.set('view', 'month');
  if (cal.view === 'month' && cal.day !== Agenda.isoToday()) p.set('day', cal.day);
  if (cal.kind) p.set('kind', cal.kind);
  if (cal.object) p.set('object', cal.object);
  if (cal.object && cal.reach.length) p.set('reach', cal.reach.join('|'));
  if (cal.computed) p.set('computed', '1');
  if (cal.past) p.set('past', '1');
  const hash = p.toString().replace(/\+/g, '%20');
  history.replaceState(null, '', location.pathname + location.search + (hash ? `#${hash}` : ''));
}
// Every change to what's shown goes through here: the address follows, then the page.
function show(patch) {
  Object.assign(cal, patch);
  writeAddress();
  render();
}

// ---- What's shown ----
// The filters the address names, as far as the chart has what they name.
const kindSet = () => kindsInState().find(k => same(k, cal.kind ?? '')) ?? null;
const objectSet = () => cal.object && records[cal.object] && isObject(records[cal.object]) ? cal.object : null;
const filtered = () => !!(kindSet() || objectSet() || cal.computed);
const filters = () => ({ kind: kindSet(), computed: cal.computed, objects: objectSet() ? Agenda.reach(cal.object, cal.reach) : null });
function shownEvents() {
  const f = filters();
  return Agenda.events().filter(e => Agenda.matches(e, f));
}
// The deadlines shown that a rule couldn't work out, for its formula's error.
const shownUnworked = () => Agenda.unworked().filter(x => Agenda.matches(x, filters()));

// The object filter in words: Calder Ridge Capital Partners III, L.P., and its Holdings.
const objectText = () => `${objectName(cal.object)}${cal.reach.length ? `, and its ${joinList(cal.reach)}` : ''}`;
const objectChipText = () => `Object: <b>${esc(objectName(cal.object))}</b>${cal.reach.length ? esc(`, and its ${joinList(cal.reach)}`) : ''}`;

// A sentence on what's pressing among what's shown: deadlines overdue or soon due, and those a rule
// couldn't work out.
function summary(list, unworked) {
  const n = id => list.filter(e => Agenda.groupOf(e) === id).length;
  const parts = [unworked.length && `${count(unworked.length, 'deadline')} couldn’t be worked out`, n('overdue') && `${n('overdue')} overdue`,
    n('week') && `${n('week')} due this week`, n('month') && `${n('month')} due in the next 30 days`].filter(Boolean);
  const computed = list.filter(e => e.computed).length;
  const of = `${count(list.length, 'date')}${computed ? `, ${computed} worked out by formula` : ''}`;
  return parts.length ? `${joinList(parts)}. ${of} in all.` : `Nothing overdue or due in the next 30 days. ${of} in all.`;
}

// ---- The bar: view, filters, count ----
function barHtml(list, all) {
  return `<div class="cal-bar">
    <span class="seg" role="group" aria-label="View">${[['agenda', 'Agenda'], ['month', 'Month']].map(([v, text]) =>
      `<button data-cmd="cal.view" data-view="${v}" aria-pressed="${cal.view === v}">${text}</button>`).join('')}</span>
    <div class="filters">
      ${Parts.filterChip({ label: 'Kind', value: kindSet() ?? '', cmd: 'cal.kind', clear: 'cal.clear-kind' })}
      ${Parts.filterChip({ label: 'Object', text: objectSet() ? objectChipText() : '', title: objectSet() ? objectText() : '', cmd: 'cal.object', clear: 'cal.clear-object' })}
      <button class="filter-chip${cal.computed ? ' is-set' : ''}" data-cmd="cal.computed" aria-pressed="${cal.computed}" title="Only dates a definition worked out">Computed only</button>
      ${filtered() ? '<button class="link-btn cal-clear" data-cmd="cal.clear">Clear filters</button>' : ''}
    </div>
    <span class="cal-count tnum">${filtered() ? `${list.length} of ${count(all.length, 'date')}` : count(all.length, 'date')}</span>
  </div>`;
}

// ---- Agenda ----
// What the groups hold, as their headings say on hover.
const GROUP_NOTES = {
  unworked: 'Deadlines whose definition has an error where they’re worked out. Fix the definition to have their dates back.',
  overdue: 'Dates a definition gives that have passed. An entered date that has passed is history, under Past.',
  week: 'Dates a definition gives, due in the next seven days.',
  month: 'Dates a definition gives, due in the 30 days after this week.',
  later: 'Dates a definition gives, due later still.',
  ahead: 'Dates entered on records that are still to come: facts, not deadlines, since no definition gives them.',
  past: 'Entered dates that have passed. A date a definition gives that has passed is overdue instead.',
};
const groupHead = (g, name = `<span class="cal-group-name">${esc(g.name)}</span><span class="cal-group-count tnum">${g.events.length}</span>`) => {
  const span = Agenda.spanText(g);
  return `<h2 class="cal-group-head" title="${esc(GROUP_NOTES[g.id] ?? '')}">${name}${span ? `<span class="cal-group-span">${esc(span)}</span>` : ''}</h2>`;
};
function groupHtml(g) {
  return `<section class="cal-group is-${g.id}" aria-label="${esc(g.name)}">${groupHead(g)}
    <div class="ev-list">${g.events.map(e => Agenda.row(e)).join('')}</div>
  </section>`;
}
function agendaHtml(list, unworked) {
  const groups = Agenda.grouped(list);
  const due = groups.filter(g => !['ahead', 'past'].includes(g.id) && g.events.length);
  const [ahead, past] = ['ahead', 'past'].map(id => groups.find(g => g.id === id));
  const broken = unworked.length ? `<section class="cal-group is-unworked" aria-label="Couldn’t be worked out">
      ${groupHead({ id: 'unworked', name: 'Couldn’t be worked out', events: unworked, note: 'A definition’s formula has an error' })}
      <div class="ev-list">${unworked.map(x => Agenda.unworkedRow(x)).join('')}</div></section>` : '';
  return `<div class="cal-agenda">${broken}
    ${due.map(groupHtml).join('') || `<p class="cal-none">Nothing overdue or coming due${filtered() ? ' among these dates' : ''}.</p>`}
    ${ahead.events.length ? groupHtml(ahead) : ''}
    ${past.events.length ? `<section class="cal-group is-past" aria-label="Past">
      ${groupHead(past, `<button class="cal-past-toggle" data-cmd="cal.past" aria-expanded="${cal.past}">${icon('chevron-right')}<span class="cal-group-name">Past</span><span class="cal-group-count tnum">${past.events.length}</span></button>`)}
      ${cal.past ? `<div class="ev-list">${past.events.map(e => Agenda.row(e)).join('')}</div>` : ''}
    </section>` : ''}
  </div>`;
}

// ---- Month ----
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const monthName = iso => new Date(`${iso.slice(0, 7)}-01T12:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
// The same day some months on, or the month's last day if it has fewer.
function monthsOn(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const start = new Date(y, m - 1 + n, 1);
  const last = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
  return Agenda.isoOf(new Date(start.getFullYear(), start.getMonth(), Math.min(d, last)));
}

function monthHtml(list) {
  const first = `${cal.day.slice(0, 7)}-01`;
  const lead = new Date(`${first}T12:00:00`).getDay();
  const length = new Date(Number(first.slice(0, 4)), Number(first.slice(5, 7)), 0).getDate();
  const weeks = Math.ceil((lead + length) / 7);
  const today = Agenda.isoToday();
  const byDay = new Map();
  for (const e of list) (byDay.get(e.iso) ?? byDay.set(e.iso, []).get(e.iso)).push(e);
  // A day lists what's overdue first, then other deadlines, then the dates entered as facts.
  const rank = e => Agenda.groupOf(e) === 'overdue' ? 0 : e.deadline ? 1 : 2;
  const cells = [];
  for (let i = 0; i < weeks * 7; i++) {
    const iso = Agenda.addDays(first, i - lead);
    const evs = (byDay.get(iso) ?? []).sort((a, b) => rank(a) - rank(b) || byLabel(a.label, b.label));
    const selected = iso === cal.day;
    const label = `${Agenda.longDate(iso)}${evs.length ? `, ${count(evs.length, 'date')}` : ''}`;
    cells.push(`<div class="cal-day${iso.slice(0, 7) !== first.slice(0, 7) ? ' is-out' : ''}${iso === today ? ' is-today' : ''}" role="gridcell" data-cmd="cal.day" data-day="${iso}"
        tabindex="${selected ? 0 : -1}" aria-selected="${selected}" aria-label="${esc(label)}">
      <span class="cal-num tnum">${Number(iso.slice(8))}</span>
      ${evs.slice(0, evs.length > 3 ? 2 : 3).map(e => `<span class="cal-ev is-${Agenda.groupOf(e)}${e.computed ? ' is-computed' : ''}" title="${esc(`${e.label}. ${Agenda.whoseText(e)}`)}">${esc(e.label)}<span class="cal-ev-whose"> · ${esc(Agenda.whoseText(e, { short: true }))}</span></span>`).join('')}
      ${evs.length > 3 ? `<span class="cal-more">${evs.length - 2} more</span>` : ''}
    </div>`);
  }
  const rows = Array.from({ length: weeks }, (_, w) => `<div class="cal-week" role="row">${cells.slice(w * 7, w * 7 + 7).join('')}</div>`).join('');
  const dayEvents = byDay.get(cal.day) ?? [];
  return `<div class="cal-month">
    <div class="cal-month-head">
      <h2 class="cal-month-title">${esc(monthName(cal.day))}</h2>
      <div class="cal-month-nav">
        <button class="icon-btn cal-prev" data-cmd="cal.month" data-step="-1" aria-label="Previous month" title="Previous month (Page Up)">${icon('chevron-right')}</button>
        <button class="btn btn-sm" data-cmd="cal.today"${cal.day === today ? ' disabled' : ''}>Today</button>
        <button class="icon-btn" data-cmd="cal.month" data-step="1" aria-label="Next month" title="Next month (Page Down)">${icon('chevron-right')}</button>
      </div>
      <span class="cal-month-hint faint">Arrow keys move between days</span>
    </div>
    <div class="cal-grid" role="grid" aria-label="${esc(monthName(cal.day))}">
      <div class="cal-week cal-weekdays" role="row">${WEEKDAYS.map(d => `<span role="columnheader">${d}</span>`).join('')}</div>
      ${rows}
    </div>
    <section class="cal-dayview" aria-live="polite">
      <h2 class="cal-group-head"><span class="cal-group-name">${esc(Agenda.longDate(cal.day))}</span><span class="cal-group-span">${esc(Parts.dueText(cal.day))}</span></h2>
      ${dayEvents.length ? `<div class="ev-list">${dayEvents.map(e => Agenda.row(e)).join('')}</div>` : '<p class="cal-none">Nothing on this day.</p>'}
    </section>
  </div>`;
}

// ---- The page ----
function renderCalendar() {
  const all = Agenda.events();
  const list = shownEvents(), unworked = shownUnworked();
  const any = all.length || Agenda.unworked().length;
  const body = !any
    ? Parts.empty({ title: 'No dates yet', desc: 'Dates entered on records, or worked out by definitions, show here.' })
    : !list.length && !unworked.length && cal.view === 'agenda'
      ? Parts.empty({ title: 'No dates match these filters', desc: filtered() ? 'Try another kind or object, or clear the filters.' : '', action: { label: 'Clear filters', cmd: 'cal.clear' } })
      : cal.view === 'month' ? monthHtml(list) : agendaHtml(list, unworked);
  // In the month, deadlines that couldn't be worked out have no day to sit on, so they're said above it.
  const notice = cal.view === 'month' && unworked.length ? `<p class="cal-unworked-note">${Parts.formulaError(unworked[0].error.code)}
    ${esc(`${count(unworked.length, 'deadline')} couldn’t be worked out, so ${unworked.length === 1 ? 'it isn’t' : 'they aren’t'} on any day.`)}
    <button class="link-btn" data-cmd="cal.view" data-view="agenda">Show in the agenda</button></p>` : '';
  return `<div class="content cal">
    <div class="page-head"><div class="page-head-text"><h2 class="page-title">Calendar</h2>
      <p class="page-sub">${esc(any ? summary(list, unworked) : 'Every date in the chart, entered or worked out by formula.')}</p></div></div>
    ${any ? barHtml(list, all) : ''}
    ${notice}${body}
  </div>`;
}

// ---- Export ----
async function exportToOutlook() {
  const list = shownEvents();
  if (!list.length) return Shell.toast(filtered() ? 'No dates match these filters, so there’s nothing to export.' : 'The chart has no dates to export yet.');
  const past = list.filter(e => Agenda.groupOf(e) === 'past');
  const ahead = list.length - past.length;
  cal.exportPast = false;
  const shownAs = filtered() ? ', as the filters show them' : '';
  // Each event says why in words; it links back to its record only from an address colleagues can open.
  const each = `each an all-day event named for what it is and whose${/^https?:$/.test(location.protocol) ? ', with a link back to its record' : ''}`;
  const lead = ahead ? `${count(ahead, 'date')}, overdue and upcoming${shownAs}, ${each}. Each deadline says why it’s due, and reminds you a week before.`
    : `Nothing is overdue or upcoming${shownAs}. Past dates can go as all-day events, ${each}.`;
  const ok = await Shell.confirm({
    title: 'Export to Outlook',
    html: `<p class="cal-export-lead">${esc(lead)}</p>
      ${past.length ? `<label class="cal-export-check"><input type="checkbox" data-cal-export-past> Include ${count(past.length, 'past date')}</label>` : ''}
      <p class="cal-export-note">Open the file to add the dates to Outlook. It’s a copy as of today, so export again after changes. To have Outlook keep up by itself, save the file where Outlook can reach it by address, and subscribe to it with <em>Add calendar › Subscribe from web</em>.</p>`,
    confirm: 'Download .ics',
  });
  if (!ok) return;
  const chosen = cal.exportPast ? list : list.filter(e => Agenda.groupOf(e) !== 'past');
  if (!chosen.length) return Shell.toast('There are no dates to export.');
  Agenda.download(chosen);
  Shell.toast(`Exported ${count(chosen.length, 'date')} for Outlook`);
}
document.addEventListener('change', e => { if (e.target.matches?.('[data-cal-export-past]')) cal.exportPast = e.target.checked; });

// ---- The object filter ----
// Unset, the Object chip opens the record picker; set, a menu of what else to take in through the object's
// lists of relatives (ticked as they're chosen, the menu staying open), another object, or none.
const openPicker = anchor => Shell.pickRecord(anchor, { pick: id => show({ object: id, reach: [] }), placeholder: 'Find an object', id: 'cal-object' });
function objectMenu(anchor) {
  const lists = Agenda.listsOf(cal.object).map(list => ({ list, n: Agenda.reach(cal.object, [list]).size - 1 }));
  Shell.menu(anchor, () => [
    ...(lists.length ? [{ head: 'Also include, directly and indirectly' }] : []),
    ...lists.map(({ list, n }) => ({ label: list, hint: String(n), ticked: cal.reach.includes(list), disabled: !n && !cal.reach.includes(list),
      run: () => show({ reach: cal.reach.includes(list) ? cal.reach.filter(x => x !== list) : [...cal.reach, list] }) })),
    ...(lists.length ? [{ sep: true }] : []),
    { label: 'Choose another object…', run: () => openPicker(document.querySelector('[data-cmd="cal.object"]')) },
    { label: 'Clear', run: () => show({ object: null, reach: [] }) },
  ], 'cal-object');
}

// ---- Keys ----
// In the agenda, the arrow keys (or J and K) move between rows and Enter opens one. In the month, the
// arrow keys move a day or a week, Home and End to the week's ends, and Page Up and Page Down a month.
function moveRow(step) {
  const rows = [...document.querySelectorAll('.cal .ev-row')];
  if (!rows.length) return;
  const at = rows.indexOf(document.activeElement?.closest?.('.ev-row'));
  rows[at < 0 ? 0 : Math.max(0, Math.min(rows.length - 1, at + step))].focus();
}
function moveDay(iso) {
  show({ day: iso });
  document.querySelector(`.cal-day[data-day="${iso}"]`)?.focus();
}
document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey || document.querySelector('#layer .dialog, #layer .palette, #layer .float-menu')) return;
  const day = e.target.closest?.('.cal-day');
  if (day) {
    const iso = day.dataset.day;
    const weekday = new Date(`${iso}T12:00:00`).getDay();
    const to = { ArrowLeft: Agenda.addDays(iso, -1), ArrowRight: Agenda.addDays(iso, 1), ArrowUp: Agenda.addDays(iso, -7), ArrowDown: Agenda.addDays(iso, 7),
      Home: Agenda.addDays(iso, -weekday), End: Agenda.addDays(iso, 6 - weekday), PageUp: monthsOn(iso, -1), PageDown: monthsOn(iso, 1) }[e.key];
    if (to) { e.preventDefault(); moveDay(to); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); document.querySelector('.cal-dayview .ev-row')?.focus(); }
    return;
  }
  if (e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
  const inRow = e.target.closest?.('.ev-row');
  if (e.key === 'ArrowDown' || e.key === 'j') { if (inRow || e.key === 'j') { e.preventDefault(); moveRow(1); } }
  else if (e.key === 'ArrowUp' || e.key === 'k') { if (inRow || e.key === 'k') { e.preventDefault(); moveRow(-1); } }
  else if (e.key === 'Enter' && e.target === inRow) { e.preventDefault(); location.href = inRow.dataset.href; }
});

// ---- Commands ----
Shell.on('cal.view', el => show({ view: el.dataset.view }));
Shell.on('cal.kind', el => Shell.menu(el, [
  { head: 'Dates of' },
  { label: 'Any kind', checked: !kindSet(), run: () => show({ kind: null }) },
  ...kindsInState().map(k => ({ label: plural(k), checked: same(cal.kind ?? '', k), run: () => show({ kind: k }) })),
], 'cal-kind'));
Shell.on('cal.clear-kind', () => show({ kind: null }));
Shell.on('cal.object', el => objectSet() ? objectMenu(el) : openPicker(el));
Shell.on('cal.clear-object', () => show({ object: null, reach: [] }));
Shell.on('cal.computed', () => show({ computed: !cal.computed }));
Shell.on('cal.clear', () => show(NO_FILTERS));
Shell.on('cal.past', () => show({ past: !cal.past }));
Shell.on('cal.day', el => moveDay(el.dataset.day));
Shell.on('cal.month', el => moveDay(monthsOn(cal.day, Number(el.dataset.step))));
Shell.on('cal.today', () => moveDay(Agenda.isoToday()));
Shell.on('cal.export', exportToOutlook);
// Overdue deadlines, asked for from anywhere (the palette's Show overdue deadlines): the agenda, every date
// in it, at its Overdue group, the first focused.
function showOverdue() {
  show({ view: 'agenda', ...NO_FILTERS });
  const group = document.querySelector('.cal-group.is-overdue') ?? document.querySelector('.cal-agenda');
  group?.scrollIntoView({ block: 'start' });
  group?.querySelector('.ev-row')?.focus({ preventScroll: true });
}
Shell.on('cal.overdue', showOverdue);

window.addEventListener('hashchange', () => { readAddress(); render(); });
// Another chart's records are another chart's: its filters start afresh.
Shell.onChartChange(() => { Object.assign(cal, NO_FILTERS, { past: false }); writeAddress(); });

readAddress();
Shell.start({
  area: 'calendar',
  title: 'Calendar',
  actions: () => `<button class="btn btn-sm" data-cmd="cal.export"${Agenda.events().length ? '' : ' disabled'} title="Save the dates shown as an .ics file for Outlook">Export to Outlook</button>`,
  render: renderCalendar,
  commands: () => [
    { title: 'Show overdue deadlines', keywords: 'late past due dates deadlines filings', run: showOverdue },
    { title: 'Export to Outlook', keywords: 'ics calendar download', run: exportToOutlook },
    { title: cal.view === 'month' ? 'Show the agenda' : 'Show a month', keywords: 'calendar view', run: () => show({ view: cal.view === 'month' ? 'agenda' : 'month' }) },
    { title: 'Go to today', keywords: 'calendar month', run: () => show({ view: 'month', day: Agenda.isoToday() }) },
    ...(filtered() ? [{ title: 'Clear filters', run: () => show(NO_FILTERS) }] : []),
  ],
});
