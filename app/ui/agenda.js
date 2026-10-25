// The chart's dates as one agenda, for the Calendar and Home. Every date field, entered or computed, is an
// event: what it is (its label), whose it is (the object it belongs to, or the objects of the relation it's
// located at, with the path below them), and when. One global, `Agenda`; loaded after parts.js, with its
// styles in agenda.css.

const Agenda = (() => {
  // ---- Deadlines and history ----
  // A date says one of two things: that something happened then (a Formation Date, an Admission Date), or
  // that something falls due then. Which one is part of what the date means, and in the model meaning is
  // keyed by parameterization (model.html 2.6), which is where definitions attach. A definition is a rule,
  // and a rule that gives a date gives the day something falls due, worked out from the facts it reads.
  // So a date a definition covers is a deadline, whether the definition worked it out or someone entered
  // it over the formula (an extension, say). A past deadline is overdue: its rule hasn't moved on, because
  // what would move it (the filing, or the date it was made) isn't recorded yet. A date no definition
  // covers was entered as a fact, and once past it's history. Labels decide nothing: a field called
  // "Due" isn't a deadline unless a rule gives it.
  const isDeadline = id => !!formulaInfo(id);

  // ---- Events ----
  // The objects a record belongs to: the object at the start of its path, or, where the path starts at a
  // relation, the objects of the relation's arguments, in the relation's order.
  function ownersOf(id) {
    const root = pathTo(id)[0];
    const r = records[root];
    if (!r) return [];
    if (!isRelation(r)) return [root];
    return [...new Set(r.args.map(a => objectOf(a.at)))].filter(k => records[k] && isObject(records[k]));
  }

  function eventOf(id) {
    const r = records[id];
    const path = pathTo(id);
    const root = path[0];
    // The relation the date sits at, if it does, and the path below the owners, or below the relation.
    const relation = isRelation(records[root]) ? relationNameOf(root) : null;
    const where = path.slice(1, -1).map(segmentText);
    return { id, iso: r.value, label: r.edge, root, owners: ownersOf(id), relation, where,
      computed: isComputed(id), deadline: isDeadline(id), days: Parts.daysUntil(r.value) };
  }

  // Every date in the chart, worked out once for each state of the records, and again on a new day.
  const memo = { records: null, today: '', list: [] };
  function events() {
    const today = isoToday();
    if (memo.records !== records || memo.today !== today) {
      const ids = Object.keys(records).filter(id => isField(records[id]) && records[id].field === 'date' && records[id].value);
      Object.assign(memo, { records, today, list: ids.map(eventOf).filter(e => e.owners.length) });
    }
    return memo.list;
  }
  const isoOf = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const isoToday = () => isoOf(new Date());
  // A calendar date some days on from another, both ISO.
  const addDays = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); return isoOf(new Date(y, m - 1, d + n)); };

  // ---- Groups ----
  // Upcoming dates by how soon they come, whatever they are; past ones by what they are: overdue if a rule
  // gives them, history otherwise. This week is today and the six days after it.
  const GROUPS = [
    { id: 'overdue', name: 'Overdue' },
    { id: 'week', name: 'This week', from: 0, to: 6 },
    { id: 'month', name: 'Next 30 days', from: 7, to: 30 },
    { id: 'later', name: 'Later', from: 31 },
    { id: 'past', name: 'Past' },
  ];
  const groupOf = e => e.days < 0 ? (e.deadline ? 'overdue' : 'past') : e.days <= 6 ? 'week' : e.days <= 30 ? 'month' : 'later';
  // Soonest first, except the past, which reads back from the most recent.
  const byDate = (a, b) => a.iso.localeCompare(b.iso) || byLabel(a.label, b.label) || byLabel(objectName(a.owners[0]), objectName(b.owners[0]));
  function grouped(list) {
    const out = GROUPS.map(g => ({ ...g, events: [] }));
    for (const e of list) out.find(g => g.id === groupOf(e)).events.push(e);
    for (const g of out) g.events.sort(g.id === 'past' ? (a, b) => byDate(b, a) : byDate);
    return out;
  }
  // What a group's span reads as: Oct 25 – Oct 31.
  function spanText(g) {
    if (g.from === undefined) return '';
    const short = iso => Parts.date(iso).replace(/, \d{4}$/, '');
    const start = addDays(isoToday(), g.from);
    return g.to === undefined ? `From ${short(start)}` : `${short(start)} – ${short(addDays(isoToday(), g.to))}`;
  }

  // How far off a date is: Parts.dueText's days near at hand, then months, then years, since "In 412 days"
  // or "28,505 days ago" reads as nothing in particular.
  function relative(iso) {
    const n = Parts.daysUntil(iso);
    if (Math.abs(n) < 60) return Parts.dueText(iso);
    const [months, years] = [Math.round(Math.abs(n) / 30.44), Math.round(Math.abs(n) / 365.25)];
    const text = Math.abs(n) < 548 ? count(months, 'month') : count(years, 'year');
    return n > 0 ? `In ${text}` : `${text} ago`;
  }

  // ---- Filters ----
  // { kind, objects, computed }: the kind of an object an event belongs to; the objects it may belong to
  // (a Set, or null for any); and whether only computed dates are wanted.
  const matches = (e, f) => (!f.kind || e.owners.some(k => same(records[k].kind, f.kind)))
    && (!f.objects || e.owners.some(k => f.objects.has(k))) && (!f.computed || e.computed);

  // An object with whatever it reaches through the named lists of relatives, directly and indirectly, as
  // REACH in a formula would: a fund with its Holdings, a person with their Controlled Companies.
  function reach(id, lists = []) {
    const out = new Set([id]);
    for (const list of lists) {
      const v = Formulas.evaluateAt(formulaResult, `REACH(@, [${list.replace(/[[\]]/g, '')}])`, id);
      if (Array.isArray(v)) for (const x of v) if (x?.id && records[x.id]) out.add(x.id);
    }
    return out;
  }
  // The lists of relatives an object has, by name: Holdings, Controlled Companies, Clients.
  const listsOf = id => records[id] ? [...new Set(relationGroups(id).filter(g => g.others.length === 1).map(g => g.list))].sort(byLabel) : [];

  // ---- Saying why ----
  // Which events have their explanation open, wherever they're shown.
  const open = new Set();

  // A record a formula read, as a line of the explanation: Fiscal Year End: December 31.
  function readText(id) {
    const r = records[id];
    if (isObject(r)) return objectName(id);
    if (isRelation(r)) return `${relationNameOf(id)}: ${ownersOf(id).map(k => objectName(k)).join(' → ')}`;
    const own = isObject(records[r.at] ?? {}) ? '' : `${segmentText(r.at)} › `;
    return isTag(r) ? `${own}${r.tag ? '' : 'Not '}${r.edge}` : `${own}${r.edge}: ${Parts.outputText(r)}`;
  }

  // What a definition says about a date: the computed one it worked out, or one entered over its formula.
  function whyHtml(e) {
    const info = formulaInfo(e.id);
    const d = info && definitionOf(info.def);
    if (!d) return '';
    const said = new Map();
    for (const x of Formulas.explain(formulaResult, e.id)) if (x.text) said.set(x.label ?? '', x.text);
    const reads = (Array.isArray(info.reads) ? info.reads : []).filter(k => records[k] && k !== e.id);
    const line = (label, html) => `<div class="ev-why-line"><span class="ev-why-label">${esc(label)}</span><span>${html}</span></div>`;
    const gives = info.formula?.t === 'date' ? Parts.date(info.formula.iso) : Formulas.isError(info.formula) ? info.formula.code : 'nothing';
    const head = e.computed ? `Worked out by <strong>${esc(d.name)}</strong>.`
      : info.mark === 'agrees' ? `Entered here, and <strong>${esc(d.name)}</strong> gives the same.`
      : `Entered here, over <strong>${esc(d.name)}</strong>, which gives ${esc(gives)}.`;
    return `<div class="ev-why" id="why-${esc(e.id)}">
      <div class="ev-why-head">${head}</div>
      ${line('Formula', `<code class="ev-formula">${esc(d.formula ?? '')}</code>`)}
      ${said.get('') ? line('Because', esc(said.get(''))) : ''}
      ${reads.length ? line('Read', reads.slice(0, 4).map(k => esc(readText(k))).join('<span class="ev-sep">·</span>') + (reads.length > 4 ? ` <span class="faint">and ${reads.length - 4} more</span>` : '')) : ''}
    </div>`;
  }

  // ---- Markup ----
  // Whose something is, as a sentence of the model would say it: an object's chip, then the path below it
  // (Calder Ridge Capital Management › Registered Investment Adviser); or a relation's name, then its
  // objects' chips in its order (General Partner: Calder Ridge Capital GP III → Calder Ridge Capital
  // Partners III), then the path below the relation. Objects that aren't a relation's (relation null) are
  // just listed; a relation named already nearby can go unsaid (relation ''). `after` follows, inside.
  function whose({ owners, relation = null, where = [] }, after = '') {
    const path = where.join(' › ');
    return `<span class="ev-whose">${relation ? `<span class="ev-rel">${esc(relation)}:</span>` : ''}${
      owners.map(k => Parts.chip(k)).join(relation !== null ? '<span class="ev-arrow">→</span>' : '')}${
      path ? `<span class="ev-path" title="${esc(path)}">${esc(path)}</span>` : ''}${after}</span>`;
  }
  // The same in words, for where chips can't go: General Partner: Calder Ridge Capital GP III, LLC → ….
  const whoseText = ({ owners, relation = null }) => `${relation ? `${relation}: ` : ''}${owners.map(k => objectName(k)).join(relation !== null ? ' → ' : ', ')}`;

  const recordHref = e => Shell.recordHref(e.root);
  const longDate = iso => new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  // One event as a row: the date, how far off it is, what it is, whose, and Why for a date a definition
  // has a say in. The label opens the record the date belongs to. `compact` leaves out the actions.
  function row(e, { compact = false } = {}) {
    const g = groupOf(e);
    const def = formulaInfo(e.id) && definitionOf(formulaInfo(e.id).def);
    const shown = open.has(e.id) && !compact;
    const dateTitle = e.computed && def ? `${longDate(e.iso)}. Worked out by ${def.name}.` : longDate(e.iso);
    return `<div class="ev-row is-${g}${e.computed ? ' is-computed' : ''}${compact ? ' is-compact' : ''}" data-event="${esc(e.id)}" data-href="${esc(recordHref(e))}" tabindex="-1">
      <time class="ev-date tnum" datetime="${esc(e.iso)}" title="${esc(dateTitle)}">${esc(Parts.date(e.iso))}</time>
      <span class="ev-when tnum">${esc(relative(e.iso))}</span>
      <span class="ev-what"><a class="ev-label" href="${esc(recordHref(e))}">${esc(e.label)}</a></span>
      ${whose(e)}
      ${compact ? '' : `<span class="ev-actions">${def ? `<button class="link-btn ev-why-btn" data-cmd="agenda.why" data-id="${esc(e.id)}" aria-expanded="${shown}" aria-controls="why-${esc(e.id)}" title="${e.computed ? 'How a definition worked this out' : 'What the definition says about this date'}">Why</button>` : ''}<a class="link-btn ev-open" href="${esc(recordHref(e))}">Open</a></span>`}
    </div>${shown ? whyHtml(e) : ''}`;
  }

  Shell.on('agenda.why', el => {
    const id = el.dataset.id;
    open.has(id) ? open.delete(id) : open.add(id);
    render();
    document.querySelector(`.ev-row[data-event="${CSS.escape(id)}"] .ev-why-btn`)?.focus();
  });

  // ---- Outlook ----
  // An iCalendar file of events, each an all-day event named for what it is and whose, with a link back
  // to its record. An event's UID is its record's id, which stays put (a computed record's comes from what
  // it's computed at), so a calendar subscribed to the file knows an event it has, and moves it when its
  // date moves.
  function ics(list, calendarName) {
    const text = s => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
    // Lines are folded at 75 octets, continuing with a space, as RFC 5545 has it.
    const encoder = new TextEncoder();
    const fold = line => {
      const out = [];
      let cur = '';
      for (const ch of line) {
        if (encoder.encode(cur + ch).length > (out.length ? 74 : 75)) { out.push(cur); cur = ''; }
        cur += ch;
      }
      return [...out, cur].join('\r\n ');
    };
    const day = iso => iso.replace(/-/g, '');
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Rboreal//Calendar//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${text(calendarName)}`];
    for (const e of list) {
      const url = new URL(recordHref(e), location.href).href;
      const d = formulaInfo(e.id) && definitionOf(formulaInfo(e.id).def);
      const notes = [[whoseText(e), ...e.where].join(' › '), e.computed && d ? `Worked out by ${d.name}: ${d.formula}` : '', url].filter(Boolean).join('\n');
      lines.push('BEGIN:VEVENT', `UID:${e.id}@rboreal`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${day(e.iso)}`, `DTEND;VALUE=DATE:${day(addDays(e.iso, 1))}`,
        `SUMMARY:${text(`${e.label}: ${e.owners.map(k => objectName(k)).join(' → ')}`)}`, `DESCRIPTION:${text(notes)}`, `URL:${url}`,
        'TRANSP:TRANSPARENT', 'X-MICROSOFT-CDO-ALLDAYEVENT:TRUE', 'X-MICROSOFT-CDO-BUSYSTATUS:FREE', 'END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    return lines.map(fold).join('\r\n') + '\r\n';
  }

  // Saves events as an .ics file named for the chart.
  function download(list) {
    const name = chartInUse().name;
    const blob = new Blob([ics(list, name)], { type: 'text/calendar;charset=utf-8' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${name.replace(/[\\/:*?"<>|]+/g, ' ').trim()} dates.ics` });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  return { events, grouped, groupOf, spanText, relative, matches, reach, listsOf, row, whose, whoseText, ownersOf, ics, download,
    isDeadline, isoOf, isoToday, addDays, longDate };
})();
