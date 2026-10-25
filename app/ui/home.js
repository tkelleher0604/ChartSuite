// Home: the working page a lawyer opens first. On the left, what needs attention (deadlines overdue or due
// within 30 days, checks that don't hold, required entries left blank, formula errors), the latest
// changes, and the records opened lately; on the right, the chart's views and counts at a glance, and the
// agenda's next few dates.

const home = {
  more: new Set(),  // the attention groups, and the requirements left blank, showing everything, not just the first few
};
const FEW = 5;

// Where a definition is edited, in the Schema area.
const definitionHref = id => `schema.html#definition:${encodeURIComponent(id)}`;

// ---- Needs attention ----
// What a rule says is due (Agenda.isDeadline): overdue, or due in the next 30 days. A date entered by hand
// is on the agenda, and so under Coming up, but no rule says it's due.
function deadlines() {
  const evs = Agenda.events().filter(e => e.deadline);
  return {
    overdue: evs.filter(e => e.days < 0).sort((a, b) => a.iso.localeCompare(b.iso)),
    soon: evs.filter(e => e.days >= 0 && e.days <= 30).sort((a, b) => a.iso.localeCompare(b.iso)),
  };
}

// The checks that don't hold, by definition (Why.failing): tags an = formula works out that come out
// ruled out. An implication (←) only attests, so a tag it doesn't attest says nothing; an = formula on a
// tag is a yes-or-no test, so ruled out is a test that failed, and says what's missing: a governing
// agreement not on file, owners not all charted. Each with the objects it fails for.
const checks = () => Why.failing().map(c => ({ ...c, objects: [...new Set(c.ids.map(id => objectOf(id)))].filter(k => isObject(records[k] ?? {})) }));

// The required entries left blank, one item per requirement (a required parameterization), with each
// place it's missing (missingUnder): under an object, or at a relation, which both its sides would list.
// Its count is how many places it's blank.
function blanks() {
  const byParam = new Map();
  for (const obj of Object.keys(records).filter(id => isObject(records[id])).sort((a, b) => byLabel(objectName(a), objectName(b))))
    for (const m of missingUnder(obj)) {
      if (!byParam.has(m.param)) byParam.set(m.param, { param: m.param, label: m.label, places: new Map() });
      const b = byParam.get(m.param);
      if (!b.places.has(m.at)) b.places.set(m.at, Agenda.placeOf(m.at));
    }
  return [...byParam.values()].map(b => ({ ...b, places: [...b.places.values()] }));
}

// The formulas' errors, one line per definition: what went wrong, and where, first of all.
function formulaErrors() {
  const byDef = new Map();
  for (const e of formulaResult.errors ?? []) {
    if (!byDef.has(e.def)) byDef.set(e.def, { def: e.def, error: e.error, at: [] });
    byDef.get(e.def).at.push(e);
  }
  for (const [def, msg] of Object.entries(formulaResult.defErrors ?? {}))
    if (!byDef.has(def)) byDef.set(def, { def, error: { code: 'Error', msg }, at: [] });
  return [...byDef.values()].filter(x => definitionOf(x.def));
}

// Where a formula's error shows, as Agenda.whose takes it: the objects of where it's worked out (an entry's
// location, or a relation's arguments, whose name the row's label already says), and the path below them.
function errorPlace(e) {
  if (e.args?.length !== 1) return { owners: [...new Set((e.args ?? []).map(a => objectOf(a.at)))].filter(k => records[k] && isObject(records[k])), relation: '' };
  return Agenda.placeOf(e.args[0].at);
}

// A group of the attention list: a heading with how many things it holds (n, where an item can stand
// for several), its first few items, and the rest on asking, or in the calendar (rest).
function attentionGroup(id, title, items, rowOf, { rest = null, n = items.length, note = '' } = {}) {
  if (!items.length) return '';
  const all = home.more.has(id);
  const shown = all ? items : items.slice(0, FEW);
  const more = items.length > FEW
    ? rest ? `<a class="link-btn home-more" href="${esc(rest)}">See all ${items.length} in the calendar</a>`
      : `<button class="link-btn home-more" data-cmd="home.more" data-group="${id}">${all ? 'Show fewer' : `Show all ${items.length}`}</button>` : '';
  return `<div class="home-att is-${id}">
    <h3 class="home-att-head"${note ? ` title="${esc(note)}"` : ''}><span>${esc(title)}</span><span class="home-att-count tnum">${n}</span></h3>
    <div class="ev-list">${shown.map(rowOf).join('')}</div>${more}
  </div>`;
}

// A list that shows a few and the rest on asking, for the places a row covers: the first two, and "and
// N more", where there are more than three.
function fewOf(key, list) {
  const all = home.more.has(key) || list.length <= 3;
  const rest = list.length > 3 ? `<button class="link-btn home-flag-others" data-cmd="home.more" data-group="${esc(key)}">${all ? 'Show fewer' : `and ${list.length - 2} more`}</button>` : '';
  return { shown: all ? list : list.slice(0, 2), rest, open: all && !!rest };
}

// Where a required entry is missing, in words a sentence would use: the object's chip and the path below
// it, or for a relation of two, both its sides with the role between them, Priya N. Raman, Director of
// Calder Ridge Capital BDC, Inc.: the relation's option where it has one, else the first side's edge.
function placeHtml(p) {
  const rel = p.relation !== null && records[p.root];
  if (!rel || rel.args.length !== 2 || p.owners.length !== 2) return Agenda.whose(p);
  const role = isChoice(rel) ? rel.choice : rel.args[0].edge;
  const path = p.where.join(' › ');
  return `<span class="ev-whose home-rel">${Parts.chip(p.owners[0])}<span class="home-rel-role">, ${esc(role)} of</span>${Parts.chip(p.owners[1])}${path ? `<span class="ev-path" title="${esc(path)}">${esc(path)}</span>` : ''}</span>`;
}

// A row of something to do that has no date: its mark (an error's code) where a date would be, what it is
// after an amber dot, and where; a description, where there is one, under it.
function flagRow({ cls, mark = '', label, title = '', where, desc = '', open = false }) {
  return `<div class="ev-row is-compact home-flag is-${cls}${open ? ' is-open' : ''}${desc ? ' has-desc' : ''}">
    <span class="home-flag-mark">${mark}</span>
    <span class="ev-what">${mark ? '' : '<span class="home-dot" aria-hidden="true"></span>'}${label}</span>
    ${where}
    ${desc ? `<span class="home-flag-desc" title="${esc(desc)}">${esc(desc)}</span>` : ''}
  </div>`;
}

// A check that doesn't hold: its name, what its form means, and the objects it fails for, each leading
// to its page, whose header says what's missing.
function checkRow(c) {
  const { shown, rest, open } = fewOf(`check:${c.def.id}`, c.objects);
  return flagRow({ cls: 'check', open, desc: c.description,
    label: `<a class="ev-label" href="${esc(definitionHref(c.def.id))}" title="${esc(`Ruled out for ${count(c.objects.length, 'record')}. Open the definition of ${c.def.name}.`)}">${esc(c.def.name)}</a>`,
    where: Agenda.whose({ owners: shown }, rest) });
}

// A requirement left blank: its label, and where it's missing, each leading to where it's filled in.
function blankRow(b) {
  const { shown, rest, open } = fewOf(`blank:${b.param}`, b.places);
  const first = b.places[0];
  return flagRow({ cls: 'blank', open,
    label: `<a class="ev-label" href="${esc(Shell.recordHref(first.owners[0]))}" title="${esc(`${b.label} is required, and blank in ${count(b.places.length, 'place')}`)}">${esc(b.label)}</a>`,
    where: `<span class="home-places">${shown.map(placeHtml).join('')}${rest}</span>` });
}

function errorRow(x) {
  const d = definitionOf(x.def);
  const first = x.at[0];
  const place = first ? errorPlace(first) : { owners: [] };
  const others = x.at.length > 1 ? `<span class="home-flag-others">and ${x.at.length - 1} more</span>` : '';
  return flagRow({ cls: 'error', mark: `<span class="home-code" title="${esc(x.error.msg ?? '')}">${esc(x.error.code)}</span>`,
    label: `<a class="ev-label" href="${esc(definitionHref(x.def))}" title="${esc(`${x.error.msg ?? ''} Edit the definition of ${d.name}.`)}">${esc(d.name)}</a>`,
    where: place.owners.length ? Agenda.whose(place, others) : `<span class="ev-whose faint">${esc(x.error.msg ?? '')}</span>` });
}

function attentionHtml() {
  const { overdue, soon } = deadlines();
  const failing = checks(), missing = blanks(), errors = formulaErrors();
  const nChecks = failing.reduce((s, c) => s + c.objects.length, 0);
  const nBlank = missing.reduce((s, b) => s + b.places.length, 0);
  const nErrors = errors.reduce((s, x) => s + Math.max(1, x.at.length), 0);
  const total = overdue.length + soon.length + nChecks + nBlank + nErrors;
  const body = total ? [
    attentionGroup('overdue', 'Overdue', overdue, e => Agenda.row(e, { compact: true }), { rest: 'calendar.html' }),
    attentionGroup('soon', 'Due in the next 30 days', soon, e => Agenda.row(e, { compact: true }), { rest: 'calendar.html' }),
    attentionGroup('checks', 'Checks that don’t hold', failing, checkRow, { n: nChecks,
      note: 'Tags a definition works out as yes or no (with =) that come out no: what’s missing, such as a document not on file.' }),
    attentionGroup('blank', 'Required entries left blank', missing, blankRow, { n: nBlank }),
    attentionGroup('errors', 'Formula errors', errors, errorRow, { n: nErrors }),
  ].join('') : `<div class="home-clear"><span class="home-clear-mark">${icon('check')}</span><div><div class="home-clear-title">Nothing needs attention</div>
    <div class="faint">No deadline is overdue or due in the next 30 days, every check holds, no required entry is blank, and every formula works out.</div></div></div>`;
  return `<section class="home-section" aria-labelledby="home-attention">
    <div class="section-head"><h2 class="section-title" id="home-attention">Needs attention</h2>${total ? `<span class="section-note tnum">${total}</span>` : ''}</div>
    ${body}
  </section>`;
}

// ---- Recent changes ----
// How a change was made, where its words don't already say: an undo reads "Undid …", an import "Imported
// …", and a reset "Reset …", but a restore reads as the change it makes.
const SOURCES = { undo: 'Undo', redo: 'Redo', reset: 'Reset', import: 'Import', restore: 'Restore' };
const SAID = { undo: /^Undid\b/, redo: /^Redid\b/, reset: /^Reset\b/, import: /^Imported\b/ };
const sourceBadge = h => h.source && !SAID[h.source]?.test(h.summary) ? `<span class="home-source">${esc(SOURCES[h.source] ?? h.source)}</span>` : '';

// A change in the history's words, except that one that only counts the records it added, as a paste is
// recorded ("Added 25 records"), names the objects it added instead: Added 5 individuals: Hannah Liu,
// Gail Liu, Omar Haddad and 2 more.
function changeText(h) {
  const added = (h.changes ?? []).filter(c => !c.before && c.after && isObject(c.after));
  if (!added.length || !/^Added \d+ records$/.test(h.summary)) return h.summary;
  const nameOf = id => (h.changes.find(c => c.after?.at === id && same(c.after.edge, 'Name'))?.after.value) ?? (records[id] ? objectName(id) : null);
  const byKind = new Map();
  for (const c of added) pushTo(byKind, c.after.kind, c.id);
  const names = added.map(c => nameOf(c.id)).filter(Boolean);
  const listed = names.length > 4 ? `${names.slice(0, 3).join(', ')} and ${names.length - 3} more` : joinList(names);
  const rest = h.changes.length - added.length - added.reduce((n, c) => n + h.changes.filter(x => x.after?.at === c.id).length, 0);
  return `Added ${joinList([...byKind].map(([kind, ids]) => count(ids.length, kind.toLowerCase())))}${listed ? `: ${listed}` : ''}${rest > 0 ? `, with ${count(rest, 'more record')}` : ''}`;
}

// Where a change is seen best: the record it touched (the object or relation its path starts at), if it's
// still there, or else the history.
function changeHref(h) {
  const id = h.changes.map(c => c.id).find(k => records[k]);
  return id ? Shell.recordHref(pathTo(id)[0]) : 'history.html';
}
function changesHtml() {
  const list = historyLog.slice(0, 6);
  return `<section class="home-section" aria-labelledby="home-changes">
    <div class="section-head"><h2 class="section-title" id="home-changes">Recent changes</h2>${historyLog.length ? '<a class="link-btn" href="history.html">All history</a>' : ''}</div>
    ${list.length ? `<div class="home-list">${list.map(h => { const text = changeText(h); return `<a class="home-change" href="${esc(changeHref(h))}" title="${esc(text)}">
        ${Parts.avatar(h.who)}<span class="home-change-text">${sourceBadge(h)}${esc(text)}</span>
        <span class="home-change-meta"><span class="home-who">${esc(h.who)}</span>${Parts.when(h.when)}</span></a>`; }).join('')}</div>`
      : Parts.empty({ title: 'No changes yet', desc: 'Each change to the chart’s records and definitions is listed here, with who made it.' })}
  </section>`;
}

// ---- Recently viewed ----
// The records the palette lists as Recent (Shell.visited keeps them). Until something's been opened there's
// nothing to come back to, so the section waits.
function recentHtml() {
  const ids = Shell.recent().slice(0, 6);
  if (!ids.length) return '';
  return `<section class="home-section" aria-labelledby="home-recent">
    <div class="section-head"><h2 class="section-title" id="home-recent">Recently viewed</h2></div>
    <div class="home-recent">${ids.map(id => `<a class="home-recent-item" href="${esc(Shell.recordHref(id))}">
        <span class="home-recent-name">${esc(objectName(id))}</span><span class="home-recent-sub">${esc(Shell.subtitleOf(id))}</span></a>`).join('')}</div>
  </section>`;
}

// ---- The chart at a glance ----
// The chart's views, each opening the chart on it, the one in use marked; then its records by kind, and
// what its definitions work out.
function glanceHtml() {
  // The kinds as the sidebar has them: the record kinds, then Documents, which is an area of its own.
  const isDocs = k => same(k, Shell.DOCUMENT_KIND);
  const kinds = kindsInState().sort((a, b) => isDocs(a) - isDocs(b));
  const computed = Object.keys(records).filter(isComputed).length;
  return `<section class="card home-card" aria-labelledby="home-glance">
    <div class="card-head"><h2 class="card-title" id="home-glance">This chart</h2><a class="link-btn" href="chart.html">Open</a></div>
    <div class="home-views" role="list" aria-label="Views">
      ${views.map(v => `<a class="home-view" role="listitem" href="chart.html" data-cmd="home.view" data-view="${esc(v.id)}"${v.id === viewId ? ' aria-current="true"' : ''}>
        <span class="home-view-name">${esc(v.name)}</span>${v.id === viewId ? '<span class="home-view-note">Last shown</span>' : ''}${icon('chevron-right', 'home-view-chevron')}</a>`).join('')}
    </div>
    <div class="home-counts">
      ${kinds.map(k => {
        const href = isDocs(k) ? 'documents.html' : Shell.kindHref(k);
        return `<a class="home-count" href="${esc(href)}"><span>${esc(plural(k))}</span><span class="tnum">${countOfKind(k)}</span></a>`;
      }).join('') || '<div class="home-count faint">No records yet</div>'}
    </div>
    ${definitions.length ? `<div class="home-card-foot faint">${esc(`${count(definitions.length, 'definition')} ${definitions.length === 1 ? 'works' : 'work'} out ${count(computed, 'record')}.`)}</div>` : ''}
  </section>`;
}

// The agenda's next few dates, whatever they are, each the agenda's row, whose it is said in words since
// the card is narrow.
function comingUpHtml() {
  const next = Agenda.events().filter(e => e.days >= 0).sort((a, b) => a.iso.localeCompare(b.iso)).slice(0, 6);
  return `<section class="card home-card" aria-labelledby="home-coming">
    <div class="card-head"><h2 class="card-title" id="home-coming">Coming up</h2><a class="link-btn" href="calendar.html">Calendar</a></div>
    ${next.length ? `<div class="ev-list home-next">${next.map(e => Agenda.row(e, { compact: true, plain: true })).join('')}</div>`
      : '<div class="card-body faint">Nothing coming up.</div>'}
  </section>`;
}

// ---- The page ----
// Good morning, and your first name once you've given it.
function greeting() {
  const hour = new Date().getHours();
  const part = hour < 5 ? 'evening' : hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
  return `Good ${part}${currentUser() === 'You' ? '' : `, ${currentUser().split(' ')[0]}`}`;
}
function renderHome() {
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  return `<div class="content home">
    <div class="home-head">
      <h2 class="home-greeting">${esc(greeting())}</h2>
      <p class="home-sub"><span class="home-chart">${esc(chartInUse().name)}</span><span class="home-dot-sep">·</span><time datetime="${Agenda.isoToday()}">${esc(today)}</time></p>
    </div>
    <div class="home-grid">
      <div class="home-main">${attentionHtml()}${changesHtml()}${recentHtml()}</div>
      <aside class="home-side" aria-label="This chart">${glanceHtml()}${comingUpHtml()}</aside>
    </div>
  </div>`;
}

Shell.on('home.more', el => {
  const g = el.dataset.group;
  home.more.has(g) ? home.more.delete(g) : home.more.add(g);
  render();
});
// A view opens the chart on it.
Shell.on('home.view', el => {
  switchView(el.dataset.view);
  location.href = 'chart.html';
});

Shell.start({
  area: 'home',
  title: 'Home',
  actions: () => `<a class="btn btn-sm" href="chart.html">Open the chart</a>`,
  render: renderHome,
  commands: () => [
    { title: 'Open the chart', run: () => { location.href = 'chart.html'; } },
    { title: 'Open the calendar', keywords: 'dates deadlines due', run: () => { location.href = 'calendar.html'; } },
    ...views.map(v => ({ title: `Open the chart on ${v.name}`, keywords: 'view chart', run: () => { switchView(v.id); location.href = 'chart.html'; } })),
  ],
});
