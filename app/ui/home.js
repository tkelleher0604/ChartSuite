// Home: the working page a lawyer opens first. On the left, what needs attention (deadlines overdue or due
// within 30 days, required entries left blank, formula errors), the latest changes, and the records opened
// lately; on the right, the chart at a glance and the agenda's next few dates.

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

// The required entries left blank, one item per requirement (a required parameterization), with the
// objects that lack it and the path below them where it's missing. Its count is how many are blank.
function blanks() {
  const byParam = new Map();
  for (const obj of Object.keys(records).filter(id => isObject(records[id])).sort((a, b) => byLabel(objectName(a), objectName(b))))
    for (const m of missingUnder(obj)) {
      if (!byParam.has(m.param)) byParam.set(m.param, { param: m.param, label: m.label, where: pathTo(m.at).slice(1).map(segmentText), objects: [] });
      byParam.get(m.param).objects.push(obj);
    }
  return [...byParam.values()];
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
  const path = pathTo(e.args[0].at);
  const relation = isRelation(records[path[0]]) ? relationNameOf(path[0]) : null;
  return { owners: Agenda.ownersOf(e.args[0].at), relation, where: path.slice(1).map(segmentText) };
}

// A group of the attention list: a heading with how many things it holds (n, where an item can stand
// for several), its first few items, and the rest on asking, or in the calendar (rest).
function attentionGroup(id, title, items, rowOf, { rest = null, n = items.length } = {}) {
  if (!items.length) return '';
  const all = home.more.has(id);
  const shown = all ? items : items.slice(0, FEW);
  const more = items.length > FEW
    ? rest ? `<a class="link-btn home-more" href="${esc(rest)}">See all ${items.length} in the calendar</a>`
      : `<button class="link-btn home-more" data-cmd="home.more" data-group="${id}">${all ? 'Show fewer' : `Show all ${items.length}`}</button>` : '';
  return `<div class="home-att is-${id}">
    <h3 class="home-att-head"><span>${esc(title)}</span><span class="home-att-count tnum">${n}</span></h3>
    <div class="ev-list">${shown.map(rowOf).join('')}</div>${more}
  </div>`;
}

// A requirement left blank: its label, and the objects lacking it, each linking to where it's filled in.
// The first few are shown, and the rest on asking.
function blankRow(b) {
  const key = `blank:${b.param}`, all = home.more.has(key) || b.objects.length <= 3;
  const shown = all ? b.objects : b.objects.slice(0, 2);
  const rest = b.objects.length > 3 ? `<button class="link-btn home-flag-others" data-cmd="home.more" data-group="${esc(key)}">${all ? 'Show fewer' : `and ${b.objects.length - 2} more`}</button>` : '';
  return `<div class="ev-row is-compact home-flag is-blank${all && rest ? ' is-open' : ''}">
    <span class="home-flag-mark">Blank</span>
    <span class="ev-what"><a class="ev-label" href="${esc(Shell.recordHref(b.objects[0]))}" title="${esc(`${b.label} is required, and blank on ${count(b.objects.length, 'record')}`)}">${esc(b.label)}</a></span>
    ${Agenda.whose({ owners: shown, where: b.where }, rest)}
  </div>`;
}
function errorRow(x) {
  const d = definitionOf(x.def);
  const first = x.at[0];
  const place = first ? errorPlace(first) : { owners: [] };
  const others = x.at.length > 1 ? `<span class="home-flag-others">and ${x.at.length - 1} more</span>` : '';
  return `<div class="ev-row is-compact home-flag is-error" title="${esc(x.error.msg ?? '')}">
    <span class="home-flag-mark"><span class="home-code">${esc(x.error.code)}</span></span>
    <span class="ev-what"><a class="ev-label" href="${esc(definitionHref(x.def))}" title="${esc(`${x.error.msg ?? ''} Edit the definition of ${d.name}.`)}">${esc(d.name)}</a></span>
    ${place.owners.length ? Agenda.whose(place, others) : `<span class="ev-whose faint">${esc(x.error.msg ?? '')}</span>`}
  </div>`;
}

function attentionHtml() {
  const { overdue, soon } = deadlines();
  const missing = blanks(), errors = formulaErrors();
  const nBlank = missing.reduce((s, b) => s + b.objects.length, 0);
  const nErrors = errors.reduce((s, x) => s + Math.max(1, x.at.length), 0);
  const total = overdue.length + soon.length + nBlank + nErrors;
  const body = total ? [
    attentionGroup('overdue', 'Overdue', overdue, e => Agenda.row(e, { compact: true }), { rest: 'calendar.html' }),
    attentionGroup('soon', 'Due in the next 30 days', soon, e => Agenda.row(e, { compact: true }), { rest: 'calendar.html' }),
    attentionGroup('blank', 'Required entries left blank', missing, blankRow, { n: nBlank }),
    attentionGroup('errors', 'Formula errors', errors, errorRow, { n: nErrors }),
  ].join('') : `<div class="home-clear"><span class="home-clear-mark">${icon('check')}</span><div><div class="home-clear-title">Nothing needs attention</div>
    <div class="faint">No deadline is overdue or due in the next 30 days, no required entry is blank, and every formula works out.</div></div></div>`;
  return `<section class="home-section" aria-labelledby="home-attention">
    <div class="section-head"><h2 class="section-title" id="home-attention">Needs attention</h2>${total ? `<span class="section-note tnum">${total}</span>` : ''}</div>
    ${body}
  </section>`;
}

// ---- Recent changes ----
const SOURCES = { undo: 'Undo', redo: 'Redo', reset: 'Reset', import: 'Import', restore: 'Restore' };
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
    ${list.length ? `<div class="home-list">${list.map(h => `<a class="home-change" href="${esc(changeHref(h))}" title="${esc(h.summary)}">
        ${Parts.avatar(h.who)}<span class="home-change-text">${h.source ? `<span class="home-source">${esc(SOURCES[h.source] ?? h.source)}</span>` : ''}${esc(h.summary)}</span>
        <span class="home-change-meta"><span class="home-who">${esc(h.who)}</span>${Parts.when(h.when)}</span></a>`).join('')}</div>`
      : Parts.empty({ title: 'No changes yet', desc: 'Each change to the chart’s records and definitions is listed here, with who made it.' })}
  </section>`;
}

// ---- Recently viewed ----
// The records the palette lists as Recent (Shell.visited keeps them).
function recentHtml() {
  const ids = Shell.recent().slice(0, 6);
  return `<section class="home-section" aria-labelledby="home-recent">
    <div class="section-head"><h2 class="section-title" id="home-recent">Recently viewed</h2></div>
    ${ids.length ? `<div class="home-recent">${ids.map(id => `<a class="home-recent-item" href="${esc(Shell.recordHref(id))}">
        <span class="home-recent-name">${esc(objectName(id))}</span><span class="home-recent-sub">${esc(Shell.subtitleOf(id))}</span></a>`).join('')}</div>`
      : Parts.empty({ title: 'Nothing viewed yet', desc: 'Records you open show here, to come back to.' })}
  </section>`;
}

// ---- The chart at a glance ----
// The view's boxes and lines in outline, as a thumbnail: each box the view draws (drawnObjects, as the
// chart works them out) where the view puts it, with a height for its lines of text, and each
// two-argument relation it draws as a line between them.
function thumbnailSvg() {
  const hidden = hiddenHere();
  const ids = drawnObjects(hidden);
  if (!ids.length) return '';
  const boxes = new Map();
  let bottom = 0;
  for (const id of ids.filter(k => layout[k])) {
    const { x, y, w = 200 } = layout[id];
    const h = 22 + 16 * Math.max(1, boxLook(id).lines.length);
    boxes.set(id, { x, y, w, h });
    bottom = Math.max(bottom, y + h);
  }
  // Boxes the view hasn't placed go in a row below the rest, as the chart puts them.
  ids.filter(k => !layout[k]).forEach((id, i) => boxes.set(id, { x: 40 + i * 230, y: bottom + 60, w: 200, h: 40 }));
  const all = [...boxes.values()];
  const [x0, y0] = [Math.min(...all.map(b => b.x)) - 24, Math.min(...all.map(b => b.y)) - 24];
  const [x1, y1] = [Math.max(...all.map(b => b.x + b.w)) + 24, Math.max(...all.map(b => b.y + b.h)) + 24];
  // A line runs down from the bottom of the box above to the top of the one below, or, between boxes side
  // by side, across from one's side to the other's.
  const lines = Object.keys(records).filter(id => isRelation(records[id]) && records[id].args.length === 2 && !hidden.has(id) && lineLook(id).show).flatMap(id => {
    let [a, b] = records[id].args.map(x => boxes.get(objectOf(x.at)));
    if (!a || !b || a === b) return [];
    if (b.y + b.h <= a.y) [a, b] = [b, a];
    if (a.y + a.h <= b.y) {
      const mid = (a.y + a.h + b.y) / 2;
      return [`M${a.x + a.w / 2} ${a.y + a.h}V${mid}H${b.x + b.w / 2}V${b.y}`];
    }
    if (b.x < a.x) [a, b] = [b, a];
    const [ay, by] = [a.y + a.h / 2, b.y + b.h / 2];
    const mid = (a.x + a.w + b.x) / 2;
    return [`M${a.x + a.w} ${ay}H${mid}V${by}H${b.x}`];
  });
  return `<svg class="home-thumb-svg" viewBox="${x0} ${y0} ${x1 - x0} ${y1 - y0}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
    <path class="home-thumb-lines" d="${lines.join('')}" vector-effect="non-scaling-stroke"/>
    ${all.map(b => `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="4" vector-effect="non-scaling-stroke"/>`).join('')}
  </svg>`;
}

function glanceHtml() {
  // The kinds as the sidebar has them: the record kinds, then Documents, which is an area of its own.
  const isDocs = k => same(k, Shell.DOCUMENT_KIND);
  const kinds = kindsInState().sort((a, b) => isDocs(a) - isDocs(b));
  const computed = Object.keys(records).filter(isComputed).length;
  const thumb = thumbnailSvg();
  return `<section class="card home-card" aria-labelledby="home-glance">
    <div class="card-head"><h2 class="card-title" id="home-glance">This chart</h2></div>
    ${thumb ? `<a class="home-thumb" href="chart.html" aria-label="Open the chart, ${esc(viewInUse().name)} view">${thumb}<span class="home-thumb-view">${esc(viewInUse().name)}</span></a>` : ''}
    <div class="home-counts">
      ${kinds.map(k => {
        const href = isDocs(k) ? 'documents.html' : Shell.kindHref(k);
        return `<a class="home-count" href="${esc(href)}"><span>${esc(plural(k))}</span><span class="tnum">${countOfKind(k)}</span></a>`;
      }).join('') || '<div class="home-count faint">No records yet</div>'}
    </div>
    ${definitions.length ? `<div class="home-card-foot faint">${esc(`${count(definitions.length, 'definition')} ${definitions.length === 1 ? 'works' : 'work'} out ${count(computed, 'record')}.`)}</div>` : ''}
  </section>`;
}

// The agenda's next few dates, whatever they are.
function comingUpHtml() {
  const next = Agenda.events().filter(e => e.days >= 0).sort((a, b) => a.iso.localeCompare(b.iso)).slice(0, 6);
  return `<section class="card home-card" aria-labelledby="home-coming">
    <div class="card-head"><h2 class="card-title" id="home-coming">Coming up</h2><a class="link-btn" href="calendar.html">Calendar</a></div>
    ${next.length ? `<div class="home-next">${next.map(e => `<a class="home-next-item${e.days <= 6 ? ' is-week' : ''}${e.computed ? ' is-computed' : ''}" href="${esc(Shell.recordHref(e.root))}">
        <time class="home-next-date tnum" datetime="${esc(e.iso)}" title="${esc(Agenda.longDate(e.iso))}">${esc(Parts.date(e.iso).replace(/, \d{4}$/, ''))}</time>
        <span class="home-next-text"><span class="home-next-label">${esc(e.label)}</span><span class="home-next-whose">${esc(Agenda.whoseText(e))}</span></span>
        <span class="home-next-when tnum">${esc(Parts.dueText(e.iso))}</span></a>`).join('')}</div>`
      : '<div class="card-body faint">Nothing coming up.</div>'}
  </section>`;
}

// ---- The page ----
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
      <p class="home-sub"><span class="home-chart">${esc(chartInUse().name)}</span><span class="home-dot">·</span><time datetime="${Agenda.isoToday()}">${esc(today)}</time></p>
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

Shell.start({
  area: 'home',
  title: 'Home',
  actions: () => `<a class="btn btn-sm" href="chart.html">Open the chart</a>`,
  render: renderHome,
  commands: [
    { title: 'Open the chart', run: () => { location.href = 'chart.html'; } },
    { title: 'Open the calendar', keywords: 'dates deadlines due', run: () => { location.href = 'calendar.html'; } },
  ],
});
