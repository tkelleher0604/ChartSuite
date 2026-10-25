// The chart's dates as one agenda, for the Calendar and Home. Every date field, entered or computed, is an
// event: what it is (its label), whose it is (the object it belongs to, or the objects of the relation it's
// located at, with the path below them), and when. One global, `Agenda`; loaded after parts.js and why.js,
// with its styles in agenda.css.

const Agenda = (() => {
  // ---- Deadlines and history ----
  // A date says one of two things: that something happened then (a Formation Date, an Admission Date), or
  // that something falls due then. Which one is part of what the date means, and in the model meaning is
  // keyed by parameterization (model.html 2.6), which is where definitions attach. A definition is a rule,
  // and a rule that gives a date gives the day something falls due, worked out from the facts it reads.
  // So a date a definition covers is a deadline, whether the definition worked it out or someone entered
  // it over the formula (an extension, say). A past deadline is overdue: its rule hasn't moved on, because
  // what would move it (the filing, or the date it was made) isn't recorded yet. A date no definition
  // covers was entered as a fact: still to come, it's set apart from what's due; once past, it's history.
  // Labels decide nothing: a field called "Due" isn't a deadline unless a rule gives it.
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

  // Where a record sits, for saying whose it is: the relation its path starts at, if it does, and the path
  // below the owners, or below the relation, down to where it's located.
  function placeOf(at) {
    const path = pathTo(at);
    return { root: path[0], owners: ownersOf(at), relation: isRelation(records[path[0]]) ? relationNameOf(path[0]) : null, where: path.slice(1).map(segmentText) };
  }

  function eventOf(id) {
    const r = records[id];
    // A relation whose output is a date goes by its name, which needn't be said again before its objects.
    const place = isRelation(r) ? { root: id, owners: ownersOf(id), relation: '', where: [] } : placeOf(r.at);
    return { id, iso: r.value, label: isRelation(r) ? relationNameOf(id) : r.edge, ...place,
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

  // The deadlines a rule couldn't work out, where its formula has an error (a loop, a #DIV/0!). They'd
  // otherwise go missing from the agenda without a word, so each stands where its date would, with the
  // error in place of the date and the definition to fix.
  function unworked() {
    return (formulaResult.errors ?? []).flatMap(x => {
      const d = definitionOf(x.def);
      if (d?.type !== 'field' || d.datatype !== 'date' || !x.args?.length) return [];
      const place = x.args.length === 1 ? placeOf(x.args[0].at) : { root: null, owners: [...new Set(x.args.map(a => objectOf(a.at)))].filter(k => isObject(records[k] ?? {})), relation: '', where: [] };
      return place.owners.length ? [{ id: x.id ?? `${x.def}|${x.args.map(a => a.at).join('|')}`, def: d, error: x.error, label: x.args.length === 1 ? x.args[0].edge : d.name,
        at: x.args.length === 1 ? x.args[0].at : null, ...place, computed: true, deadline: true }] : [];
    });
  }
  const isoOf = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const isoToday = () => isoOf(new Date());
  // A calendar date some days on from another, both ISO.
  const addDays = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); return isoOf(new Date(y, m - 1, d + n)); };

  // ---- Groups ----
  // Deadlines by how soon they fall due: overdue, then this week (today and the six days after), the next
  // 30 days and later. Dates entered as facts follow, apart: those still to come, then the past.
  const GROUPS = [
    { id: 'overdue', name: 'Overdue' },
    { id: 'week', name: 'This week', from: 0, to: 6 },
    { id: 'month', name: 'Next 30 days', from: 7, to: 30 },
    { id: 'later', name: 'Later', from: 31 },
    { id: 'ahead', name: 'Ahead', note: 'Entered dates still to come' },
    { id: 'past', name: 'Past', note: 'Entered dates that have passed' },
  ];
  const groupOf = e => !e.deadline ? (e.days < 0 ? 'past' : 'ahead')
    : e.days < 0 ? 'overdue' : e.days <= 6 ? 'week' : e.days <= 30 ? 'month' : 'later';
  // Soonest first, except the past, which reads back from the most recent.
  const byDate = (a, b) => a.iso.localeCompare(b.iso) || byLabel(a.label, b.label) || byLabel(objectName(a.owners[0]), objectName(b.owners[0]));
  function grouped(list) {
    const out = GROUPS.map(g => ({ ...g, events: [] }));
    for (const e of list) out.find(g => g.id === groupOf(e)).events.push(e);
    for (const g of out) g.events.sort(g.id === 'past' ? (a, b) => byDate(b, a) : byDate);
    return out;
  }
  // What a group's span reads as: Oct 25 – Oct 31; or what it holds, for a group that isn't a span of days.
  function spanText(g) {
    if (g.from === undefined) return g.note ?? '';
    const short = iso => Parts.date(iso).replace(/, \d{4}$/, '');
    const start = addDays(isoToday(), g.from);
    return g.to === undefined ? `From ${short(start)}` : `${short(start)} – ${short(addDays(isoToday(), g.to))}`;
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

  // What a definition says about a date (Why): the computed one it worked out, or one entered over it.
  function whyHtml(e) {
    const d = formulaInfo(e.id) && definitionOf(formulaInfo(e.id).def);
    if (!d) return '';
    return `<div class="ev-why" id="why-${esc(e.id)}">${Why.html(e.id, { actions: `<a class="link-btn" href="${esc(dateHref(e))}">Show where it’s recorded</a><a class="link-btn" href="schema.html#definition:${esc(encodeURIComponent(d.id))}">Edit definition</a>` })}</div>`;
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
  // An object by the name it's known by in a short list: its Short Name, where it has one, or its name.
  const shortName = id => { const k = entriesOf(id).find(e => isField(records[e]) && same(records[e].edge, 'Short Name') && records[e].value); return k ? records[k].value : objectName(id); };
  // Whose something is in words, for where chips can't go, by short names where `short`: General Partner:
  // GP III → Fund III.
  const whoseText = ({ owners, relation = null }, { short = false } = {}) =>
    `${relation ? `${relation}: ` : ''}${owners.map(k => short ? shortName(k) : objectName(k)).join(relation !== null ? ' → ' : ', ')}`;

  const recordHref = e => Shell.recordHref(e.root);
  // A date's own address: its record's page, with the date shown, and why if a formula gave it.
  const dateHref = e => Shell.recordHref(e.id);
  const longDate = iso => new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  // One event as a row: the date, how far off it is, what it is, whose, and its actions. The label opens
  // the date where it's recorded. Where a definition has a say in the date, the date itself opens why, as
  // does Why, which shows with Open on hover or focus. `compact` leaves out the actions; `from`, an object
  // the list is about (a record's own Dates), leaves it out of whose the date is; `plain` says whose it is
  // in words, by short names, for a list too narrow for chips. In a narrow list, what it is comes before
  // how far off, and whose goes below.
  function row(e, { compact = false, from = null, plain = false } = {}) {
    const g = groupOf(e);
    const def = formulaInfo(e.id) && definitionOf(formulaInfo(e.id).def);
    const shown = open.has(e.id) && !compact;
    const dateTitle = e.computed && def ? `${longDate(e.iso)}. Worked out by ${def.name}.` : longDate(e.iso);
    const why = `data-cmd="agenda.why" data-id="${esc(e.id)}" aria-expanded="${shown}" aria-controls="why-${esc(e.id)}"`;
    const date = def && !compact
      ? `<button class="ev-date ev-date-btn tnum" ${why} title="${esc(`${dateTitle} Click to see why.`)}"><time datetime="${esc(e.iso)}">${esc(Parts.date(e.iso))}</time></button>`
      : `<time class="ev-date tnum" datetime="${esc(e.iso)}" title="${esc(dateTitle)}">${esc(Parts.date(e.iso))}</time>`;
    return `<div class="ev-row is-${g}${e.computed ? ' is-computed' : ''}${compact ? ' is-compact' : ''}" data-event="${esc(e.id)}" data-href="${esc(dateHref(e))}" tabindex="-1">
      ${date}
      <span class="ev-when tnum">${esc(Parts.dueText(e.iso))}</span>
      <span class="ev-what"><a class="ev-label" href="${esc(dateHref(e))}">${esc(e.label)}</a></span>
      ${plain ? `<span class="ev-whose is-plain" title="${esc(whoseText(e))}">${esc(whoseText(e, { short: true }))}</span>` : whose(from ? { ...e, owners: e.owners.filter(k => k !== from) } : e)}
      ${compact ? '' : `<span class="ev-actions">${def ? `<button class="link-btn ev-why-btn" ${why} title="${e.computed ? 'How a definition worked this out' : 'What the definition says about this date'}">Why</button>` : ''}<a class="link-btn ev-open" href="${esc(recordHref(e))}">Open</a></span>`}
    </div>${shown ? whyHtml(e) : ''}`;
  }

  // A deadline its rule couldn't work out, as a row: its error where the date would be, what it is and
  // whose, and the definition to fix.
  function unworkedRow(x, { compact = false } = {}) {
    const href = `schema.html#definition:${encodeURIComponent(x.def.id)}`;
    return `<div class="ev-row is-unworked${compact ? ' is-compact' : ''}" tabindex="-1" data-href="${esc(href)}">
      <span class="ev-date">${Parts.formulaError(x.error.code, { href, title: `${x.error.msg ?? ''} Edit the definition of ${x.def.name}.` })}</span>
      <span class="ev-when">No date</span>
      <span class="ev-what"><span class="ev-label" title="${esc(x.error.msg ?? '')}">${esc(x.label)}</span></span>
      ${whose(x)}
      ${compact ? '' : `<span class="ev-actions"><a class="link-btn ev-why-btn" href="${esc(href)}" title="${esc(x.error.msg ?? '')}">Fix</a></span>`}
    </div>`;
  }

  Shell.on('agenda.why', el => {
    const id = el.dataset.id;
    open.has(id) ? open.delete(id) : open.add(id);
    render();
    document.querySelector(`.ev-row[data-event="${CSS.escape(id)}"] .ev-date-btn`)?.focus();
  });

  // ---- Outlook ----
  // An iCalendar file of events, each an all-day event named for what it is and whose. Its notes say whose
  // it is in full, and for a deadline, why in words (Why.text), never as a formula; a deadline reminds a
  // week before. Where the app is served from an address others can reach, each links back to its record;
  // from a file on this computer, a link would lead nowhere for anyone else, so there's none. An event's
  // UID is its record's id, which stays put (a computed record's comes from what it's computed at), so a
  // calendar subscribed to the file knows an event it has, and moves it when its date moves.
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
    const served = /^https?:$/.test(location.protocol);
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Rboreal//Calendar//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${text(calendarName)}`];
    for (const e of list) {
      const url = served ? new URL(recordHref(e), location.href).href : '';
      const summary = `${e.label}: ${whoseText(e, { short: true })}`;
      const notes = [[whoseText(e), ...e.where].join(' › '), e.deadline ? Why.text(e.id) : '', url].filter(Boolean).join('\n\n');
      lines.push('BEGIN:VEVENT', `UID:${e.id}@rboreal`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${day(e.iso)}`, `DTEND;VALUE=DATE:${day(addDays(e.iso, 1))}`,
        `SUMMARY:${text(summary)}`, `DESCRIPTION:${text(notes)}`, ...(url ? [`URL:${url}`] : []),
        'TRANSP:TRANSPARENT', 'X-MICROSOFT-CDO-ALLDAYEVENT:TRUE', 'X-MICROSOFT-CDO-BUSYSTATUS:FREE',
        ...(e.deadline ? ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${text(`${summary}, due in a week`)}`, 'TRIGGER:-P7D', 'END:VALARM'] : []),
        'END:VEVENT');
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

  return { events, unworked, grouped, groupOf, spanText, matches, reach, listsOf, row, unworkedRow, whose, whoseText, shortName, ownersOf, placeOf, ics, download,
    isDeadline, isoOf, isoToday, addDays, longDate };
})();
