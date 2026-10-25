// The History: every change to the chart's data, newest first, as the history log records it (see "History"
// in model.js). An entry says who made the change, what it was, in the log's own words with the records it
// names as links, and when; opened, it lists each record the change touched, before and after. Entries are
// grouped by day, and a run of like changes in a row by one person folds into one line.
//
// Filters (who, which record and everything below it, what was changed, when) and a search are kept in the
// address, so a filtered history can be linked to:
//   history.html#record=<id>&who=<name>&what=records&from=2026-01-01&to=2026-03-31&q=<words>
// `what` is records, definitions, names, required or schema. What's shown exports as CSV.
//
// An entry whose records are still as it left them can be restored: they're put back as they were before it,
// as an ordinary change, which the history records in its turn. The log itself is never rewritten.

(() => {
  const PAGE = 150;  // entries drawn before "Show older changes"
  const RUN = 3;     // like changes in a row, by one person, that fold into one line
  const KEYS = ['who', 'record', 'what', 'from', 'to', 'q'];
  const WHAT = [['records', 'Records'], ['definitions', 'Definitions'], ['names', 'Names'], ['required', 'Required entries'], ['schema', 'Schema']];
  const SOURCES = { undo: 'Undo', redo: 'Redo', reset: 'Reset', import: 'Import' };
  // A summary starts with what was done. After a person's name it reads on: "Ann Lee changed …".
  const VERB = /^(Added|Changed|Deleted|Required|Stopped|Reset|Restored|Removed|Renamed|Moved|Imported|Copied)\b/;

  // What's open on the page: kept while it's open, but not in the address.
  const ui = { open: new Set(), runs: new Set(), limit: PAGE, picker: null, dates: false, failed: null, focus: null };

  // ---- Filters, in the address ----

  function filters() {
    const p = new URLSearchParams(location.hash.slice(1));
    return Object.fromEntries(KEYS.map(k => [k, p.get(k) ?? '']));
  }
  function writeFilters(next) {
    const f = { ...filters(), ...next };
    const p = new URLSearchParams();
    for (const k of KEYS) if (f[k]) p.set(k, f[k]);
    const hash = p.toString();
    window.history.replaceState(null, '', hash ? `#${hash}` : location.pathname + location.search);
    ui.limit = PAGE;
  }
  const setFilters = next => { writeFilters(next); render(); };
  const filtering = f => KEYS.some(k => f[k]);
  function clearAll() { ui.dates = false; ui.picker = null; setFilters(Object.fromEntries(KEYS.map(k => [k, '']))); }

  // ---- Reading the log ----
  // The log keeps, for each change, the entered records it changed, before and after. Worked back from the
  // records as they are now, one entry at a time, it gives the records as they stood on either side of each
  // change, so a change is told in the names its records had then, and filed under the objects they belonged
  // to. It's read again only when the log or the records change.

  let reading = { log: null, entered: null, items: [] };
  function readLog() {
    if (reading.log === historyLog && reading.entered === entered) return reading.items;
    // Computed records stand in for locations that only a formula gives.
    const computed = Object.fromEntries(Object.entries(records).filter(([, r]) => r.computed));
    let after = { ...computed, ...entered };
    const items = historyLog.map(entry => {
      const changes = entry.changes ?? [];
      const before = { ...after };
      for (const c of changes) if (c.before) before[c.id] = c.before; else delete before[c.id];
      const item = readEntry(entry, changes, before, after);
      after = before;
      return item;
    });
    reading = { log: historyLog, entered, items };
    return items;
  }

  function readEntry(entry, changes, before, after) {
    const rows = changes.map(c => ({
      id: c.id, was: c.before, now: c.after,
      where: c.after ? trail(after, c.id, c.after) : trail(before, c.id, c.before),
      prior: c.before && c.after ? trail(before, c.id, c.before) : null,
    })).sort((a, b) => isObject(b.now ?? b.was) - isObject(a.now ?? a.was));
    // Everything the change touched, with what each is located at: what a record filter looks for.
    const touched = new Set();
    for (const c of changes) { lineage(after, c.id, c.after, touched); lineage(before, c.id, c.before, touched); }
    const words = [entry.summary, entry.who, SOURCES[entry.source] ?? '',
      ...rows.flatMap(r => [trailText(r.where), r.was ? outputPhrase(r.was) : '', r.now ? outputPhrase(r.now) : ''])];
    return { entry, rows, touched, kinds: kindsOf(entry, changes), day: dayKey(entry.when), search: norm(words.join(' ')) };
  }

  // A record and everything it's located at, up to the objects, in one set of records.
  function lineage(recs, id, r, out, seen = new Set()) {
    if (!r || seen.has(id)) return out;
    seen.add(id);
    out.add(id);
    for (const a of argsOf(r)) lineage(recs, a.at, recs[a.at], out, seen);
    return out;
  }

  // What a change was to: its records, and the definitions, names, required entries or schema its summary
  // names (model.js says each of those in a sentence of its own).
  function kindsOf(entry, changes) {
    const kinds = new Set(changes.length ? ['records'] : []);
    for (const part of String(entry.summary ?? '').split('; ')) {
      if (/^(Added|Changed|Deleted) the definition of /.test(part)) kinds.add('definitions');
      else if (/^Changed (the )?(relation|list) names/.test(part)) kinds.add('names');
      else if (/^(Required |Stopped requiring |Changed the required entries)/.test(part)) kinds.add('required');
      else if (/^Changed the schema/.test(part)) kinds.add('schema');
    }
    return kinds;
  }

  // ---- How a record reads, in the records of its time ----

  // Objects' names by id, read once for a set of records.
  const namesMemo = new WeakMap();
  function nameIn(recs, id) {
    if (!namesMemo.has(recs)) {
      const map = new Map();
      for (const r of Object.values(recs)) if (isField(r) && same(r.edge, 'name') && recs[r.at] && isObject(recs[r.at])) map.set(r.at, r.value);
      namesMemo.set(recs, map);
    }
    return namesMemo.get(recs).get(id);
  }

  // A record's place as steps from its object: Fund III › Jurisdiction › File Number. A relation is one step,
  // its name with the objects it relates; an entry at a relation follows on from it.
  function trail(recs, id, r = recs[id], depth = 0) {
    if (!r || depth > 16) return [{ text: 'something no longer in the chart' }];
    if (isObject(r)) return [{ id, text: nameIn(recs, id) ?? r.kind, object: true }];
    if (isRelation(r)) return [{ id, relation: true, text: relationName(recs, id, r), sides: r.args.map(a => headOf(recs, a.at)) }];
    return [...trail(recs, r.at, recs[r.at], depth + 1), { id, text: r.edge }];
  }
  // The object a location belongs to, as a step; or the relation it's at.
  function headOf(recs, at) {
    let cur = at;
    for (let n = 0; recs[cur] && !isObject(recs[cur]) && !isRelation(recs[cur]) && n < 16; n++) cur = recs[cur].at;
    const r = recs[cur];
    if (!r) return { text: 'something no longer in the chart' };
    return isObject(r) ? { id: cur, text: nameIn(recs, cur) ?? r.kind, object: true } : { id: cur, text: relationName(recs, cur, r) };
  }
  function relationName(recs, id, r) {
    const t = treeOf(recs, id);
    return (t && formName(formOfTree(t))) || relationLabel(r);
  }

  const stepText = s => s.relation ? `${s.text}: ${s.sides.map(x => x.text).join(' → ')}` : s.text;
  const trailText = steps => steps.map(stepText).join(' › ');

  // An object named in a change links to its page while it's in the chart.
  const ref = s => s.object && records[s.id] && isObject(records[s.id])
    ? `<a class="h-ref" href="${Shell.recordHref(s.id)}" title="${esc(Shell.subtitleOf(s.id))}">${esc(s.text)}</a>`
    : `<span${s.object ? ' class="h-gone" title="No longer in the chart"' : ''}>${esc(s.text)}</span>`;
  const stepHtml = s => s.relation ? `${esc(s.text)}: ${s.sides.map(ref).join('<span class="h-arrow">→</span>')}` : s.object ? ref(s) : esc(s.text);
  const trailHtml = steps => steps.map(stepHtml).join('<span class="h-sep">›</span>');

  // A record's output: a tag as its checkbox, a document as a link to it, an object as its kind.
  function valueHtml(r) {
    if (isTag(r)) return `<span class="h-tag">${box(r.tag)}${r.tag ? 'Attested' : 'Ruled out'}</span>`;
    if (isField(r) && r.field === 'document') return `<a class="link" href="${esc(r.value)}" target="_blank" rel="noopener">${esc(displayValue(r))}</a>`;
    return `<span class="${isField(r) ? 'tnum' : ''}">${esc(outputPhrase(r))}</span>`;
  }

  // ---- Days, times and runs ----

  const pad = n => String(n).padStart(2, '0');
  const dayKey = when => { const t = new Date(when); return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`; };
  const daysAgo = n => dayKey(Date.now() - n * 864e5);

  function dayLabel(day) {
    if (day === daysAgo(0)) return 'Today';
    if (day === daysAgo(1)) return 'Yesterday';
    const [y, m, d] = day.split('-').map(Number);
    const weekday = new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long' });
    return y === new Date().getFullYear() ? `${weekday}, ${MONTHS[m - 1]} ${d}` : `${MONTHS[m - 1]} ${d}, ${y}`;
  }

  // Today's changes say how long ago; older ones, under their day, the time of day. Either way the exact
  // moment is on hover.
  function timeHtml(stamp) {
    if (dayKey(stamp) === daysAgo(0)) return Parts.when(stamp);
    const t = new Date(stamp);
    return `<time class="faint tnum" datetime="${esc(stamp)}" title="${esc(t.toLocaleString())}">${esc(clock(t))}</time>`;
  }
  const clock = t => t.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  // Changes in a row are alike when one person made them the same way, to the same sort of thing, with the
  // same verb: a morning spent changing values, say.
  const likeness = it => [it.entry.who, it.entry.source ?? '', [...it.kinds].sort().join(), String(it.entry.summary).split(' ')[0]].join('|');
  function runsOf(items) {
    const runs = [];
    for (const it of items) {
      const last = runs.at(-1);
      if (last && likeness(last[0]) === likeness(it)) last.push(it); else runs.push([it]);
    }
    return runs;
  }

  // ---- What's shown ----

  function shownItems(f) {
    const words = norm(f.q).split(' ').filter(Boolean);
    return readLog().filter(it => (!f.who || it.entry.who === f.who) && (!f.record || it.touched.has(f.record))
      && (!f.what || it.kinds.has(f.what)) && (!f.from || it.day >= f.from) && (!f.to || it.day <= f.to)
      && words.every(w => it.search.includes(w)));
  }

  // The people in the log, with how many changes each made, most first.
  function people() {
    const n = new Map();
    for (const it of readLog()) n.set(it.entry.who, (n.get(it.entry.who) ?? 0) + 1);
    return [...n].sort((a, b) => b[1] - a[1] || byLabel(a[0], b[0]));
  }

  // A record's name for its filter: as it is now, or as the log last had it.
  function recordName(id) {
    if (records[id]) return isObject(records[id]) ? objectName(id) : trailText(trail(records, id));
    for (const it of readLog()) for (const r of it.rows) if (r.id === id) return trailText(r.where);
    return 'A record no longer in the chart';
  }

  // ---- Drawing ----

  function page() {
    const active = document.activeElement?.dataset?.history;
    ui.focus = active ? { key: active, at: document.activeElement.selectionStart ?? null } : null;
    const f = filters();
    const all = readLog(), shown = shownItems(f);
    return `<div class="content history">
      <div class="page-head"><div class="page-head-text"><h2 class="page-title">History</h2>
        <p class="page-sub">Every change to this chart’s data, with who made it and when.</p></div>
        ${all.length ? `<span class="h-tally tnum" id="history-tally">${tallyHtml(f)}</span>` : ''}</div>
      ${all.length ? toolbarHtml(f) : ''}
      <div id="history-body">${bodyHtml(f, shown, all)}</div>
    </div>`;
  }

  // The search, then a chip for each filter: "+ Person" until it's set, then what it's set to. The record
  // and date chips turn into their editors while they're being set.
  function toolbarHtml(f) {
    const chip = (key, label, value) => value
      ? `<span class="filter-chip is-set"><button class="h-chip" data-cmd="history.chip" data-key="${key}" title="Change ${esc(label.toLowerCase())}">${esc(label)}: <span class="h-chip-value">${esc(value)}</span></button><button class="h-chip-x" data-cmd="history.unset" data-key="${key}" aria-label="Clear ${esc(label.toLowerCase())}" title="Clear">${icon('x')}</button></span>`
      : `<button class="filter-chip" data-cmd="history.chip" data-key="${key}">${icon('plus')}${esc(label)}</button>`;
    const record = ui.picker ? `<span class="h-picker"><input class="input" data-history="picker" value="${esc(ui.picker.query)}" placeholder="Find a record…" aria-label="Find a record" autocomplete="off" spellcheck="false"><div class="pop listbox h-picker-list" role="listbox"></div></span>`
      : chip('record', 'Record', f.record && recordName(f.record));
    const date = ui.dates ? `<span class="filter-chip is-set h-dates">Date:<input type="date" data-history="from" value="${esc(f.from)}" aria-label="From">to<input type="date" data-history="to" value="${esc(f.to)}" aria-label="To"></span>`
      : chip('date', 'Date', (f.from || f.to) && rangeText(f.from, f.to));
    return `<div class="h-toolbar">
      <label class="search-input h-search">${icon('search')}<input class="input" type="search" data-history="search" value="${esc(f.q)}" placeholder="Search changes" aria-label="Search changes" autocomplete="off" spellcheck="false"></label>
      <div class="filters">${chip('who', 'Person', f.who)}${record}${chip('what', 'What changed', WHAT.find(([k]) => k === f.what)?.[1] ?? f.what)}${date}
        <button class="link-btn h-clear" data-cmd="history.clear-all"${filtering(f) ? '' : ' hidden'}>Clear filters</button></div>
    </div>`;
  }

  function tallyHtml(f) {
    const all = readLog().length, n = shownItems(f).length;
    return n === all ? count(all, 'change') : `${n} of ${count(all, 'change')}`;
  }

  function rangeText(from, to) {
    if (from && to) {
      if (from === to) return Parts.date(from);
      return from.slice(0, 4) === to.slice(0, 4) ? `${Parts.date(from).replace(/, \d{4}$/, '')} – ${Parts.date(to)}` : `${Parts.date(from)} – ${Parts.date(to)}`;
    }
    return from ? `Since ${Parts.date(from)}` : `Until ${Parts.date(to)}`;
  }

  function bodyHtml(f, shown, all) {
    if (!all.length) return Parts.empty({ title: 'No changes recorded yet', desc: 'Every change to this chart’s data will show here, with who made it and when.', action: { label: 'Open the chart', href: 'chart.html' } });
    if (!shown.length) return Parts.empty({ title: 'No changes match these filters', desc: 'Try a wider date range, or another person or record.', action: { label: 'Clear filters', cmd: 'history.clear-all' } });
    const perDay = new Map();
    for (const it of shown) perDay.set(it.day, (perDay.get(it.day) ?? 0) + 1);
    const days = [];
    for (const it of shown.slice(0, ui.limit)) {
      if (days.at(-1)?.day !== it.day) days.push({ day: it.day, items: [] });
      days.at(-1).items.push(it);
    }
    // While searching, every match shows; nothing folds away.
    const fold = !f.q;
    const runHtml = run => {
      if (!fold || run.length < RUN) return run.map(entryHtml).join('');
      const first = run[0].entry, open = ui.runs.has(first.id);
      const span = `${clock(new Date(run.at(-1).entry.when))} – ${clock(new Date(run[1].entry.when))}`;
      return open
        ? run.map(entryHtml).join('') + `<li class="h-run"><button class="link-btn" data-cmd="history.run" data-id="${esc(first.id)}" aria-expanded="true">Show fewer</button></li>`
        : entryHtml(run[0]) + `<li class="h-run"><button class="link-btn" data-cmd="history.run" data-id="${esc(first.id)}" aria-expanded="false">${count(run.length - 1, 'more change')} like this by ${esc(first.who)}</button><span class="faint tnum">${esc(span)}</span></li>`;
    };
    const more = shown.length > ui.limit
      ? `<div class="h-more"><button class="btn btn-sm" data-cmd="history.more">Show older changes</button><span class="faint tnum">${shown.length - ui.limit} more</span></div>` : '';
    return days.map(d => `<section class="h-day">
        <h3 class="h-day-head">${esc(dayLabel(d.day))}<span class="h-day-count tnum">${count(perDay.get(d.day), 'change')}</span></h3>
        <ol class="h-list">${runsOf(d.items).map(runHtml).join('')}</ol></section>`).join('') + more;
  }

  // The objects an entry's changes belong to, as steps, each once.
  function objectsOf(item) {
    const seen = new Map();
    for (const r of item.rows) for (const s of [...r.where, ...(r.prior ?? [])].flatMap(s => s.relation ? s.sides : [s]))
      if (s.object && !seen.has(s.text)) seen.set(s.text, s);
    return [...seen.values()];
  }

  // The summary, with what it names as links: the objects its changes belong to, a definition it changed,
  // and the names, which live in the Schema. A summary that only counts records ("Added 2 records") is
  // followed by the objects they're on.
  function summaryHtml(item) {
    const summary = String(item.entry.summary ?? '').split('; ').map(p => VERB.test(p) ? p[0].toLowerCase() + p.slice(1) : p).join('; ');
    const objects = objectsOf(item);
    const refs = new Map(objects.filter(s => s.text.length > 2).map(s => [s.text, ref(s)]));
    for (const [, name] of summary.matchAll(/(?:^|; )(?:added|changed|deleted) the definition of (.+?)(?=; |$)/g)) {
      const d = allDefinitions().find(x => same(x.name, name));
      if (d) refs.set(name, `<a class="h-ref" href="schema.html#definition:${esc(encodeURIComponent(d.id))}" title="Open the definition">${esc(name)}</a>`);
    }
    if (/relation names/.test(summary)) refs.set('relation names', '<a class="h-ref" href="schema.html" title="Relations are named in the Schema">relation names</a>');
    let out = '', last = 0;
    if (refs.size) {
      const re = new RegExp([...refs.keys()].sort((a, b) => b.length - a.length).map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
      for (const m of summary.matchAll(re)) {
        out += esc(summary.slice(last, m.index)) + refs.get(m[0]);
        last = m.index + m[0].length;
      }
    }
    out += esc(summary.slice(last));
    const named = objects.some(s => summary.includes(s.text));
    if (objects.length && !named) out += `<span class="h-on"> · ${objects.slice(0, 3).map(ref).join(', ')}${objects.length > 3 ? ` and ${objects.length - 3} more` : ''}</span>`;
    return out;
  }

  function entryHtml(item) {
    const { entry } = item;
    const open = ui.open.has(entry.id);
    const opens = item.rows.length > 0;
    const source = SOURCES[entry.source] ? Parts.badge(SOURCES[entry.source]) : '';
    const what = VERB.test(String(entry.summary)) ? summaryHtml(item) : `<span class="faint">·</span> ${summaryHtml(item)}`;
    const toggle = opens ? `<button class="h-toggle" data-cmd="history.toggle" data-id="${esc(entry.id)}" aria-expanded="${open}"
        aria-label="${open ? 'Hide' : 'Show'} the ${count(item.rows.length, 'record')} it changed" title="${open ? 'Hide' : 'Show'} the ${count(item.rows.length, 'record')} it changed">${icon('chevron-right')}</button>` : '<span class="h-toggle"></span>';
    return `<li class="h-entry${open ? ' is-open' : ''}${opens ? ' opens' : ''}" data-entry="${esc(entry.id)}">
      <div class="h-head">${Parts.avatar(entry.who)}
        <p class="h-line"><span class="h-who">${esc(entry.who)}</span> ${what}${source ? ` ${source}` : ''}</p>
        <span class="h-when">${timeHtml(entry.when)}</span>${toggle}</div>
      ${open ? detailHtml(item) : ''}
    </li>`;
  }

  function detailHtml(item) {
    const why = cannotRestore(item);
    const failed = ui.failed?.id === item.entry.id ? `<span class="h-error">${icon('alert-triangle')}${esc(ui.failed.text)}</span>` : '';
    const foot = why ? `<span class="h-note">${esc(why)}</span>`
      : `<button class="btn btn-sm" data-cmd="history.restore" data-id="${esc(item.entry.id)}">Restore this</button><span class="h-note">${esc(restoreNote(item))}</span>`;
    return `<div class="h-detail"><div class="h-changes">${item.rows.map(changeHtml).join('')}</div><div class="h-foot">${foot}${failed}</div></div>`;
  }

  // One record a change touched: where it is, and what happened to it.
  function changeHtml(row) {
    const { was, now } = row;
    let what;
    if (!was) what = `<span class="h-verb">Added</span>${valueHtml(now)}`;
    else if (!now) what = `<span class="h-verb">Deleted</span><s class="h-was">${valueHtml(was)}</s>`;
    else {
      const bits = [];
      if (outputPhrase(was) !== outputPhrase(now)) bits.push(`<s class="h-was">${valueHtml(was)}</s><span class="h-arrow">→</span>${valueHtml(now)}`);
      if (trailText(row.prior) !== trailText(row.where)) {
        const verb = was.at && now.at && was.at !== now.at && same(was.edge, now.edge) ? 'Moved from' : was.at && was.at === now.at ? 'Renamed from' : 'Was';
        bits.push(`<span class="h-verb">${verb}</span><span class="h-was-at">${trailHtml(row.prior)}</span>`);
      }
      what = bits.join('<span class="h-gap"></span>') || '<span class="faint">No difference that shows</span>';
    }
    return `<div class="h-change"><div class="h-where">${trailHtml(row.where)}</div><div class="h-what">${what}</div></div>`;
  }

  // ---- Restoring ----

  // Records compared as data, whatever order their keys were written in.
  const canon = v => Array.isArray(v) ? `[${v.map(canon).join()}]`
    : v && typeof v === 'object' ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canon(v[k])}`).join()}}` : JSON.stringify(v ?? null);
  const sameRecord = (a, b) => canon(a ?? null) === canon(b ?? null);

  // Why an entry's records can't be put back as they were before it, or null if they can: each must still be
  // as the entry left it, what it deleted needs its locations, and nothing recorded since may stand on what it
  // added.
  function cannotRestore(item) {
    const changes = item.entry.changes ?? [];
    const rowOf = c => item.rows.find(r => r.id === c.id);
    const since = changes.find(c => !sameRecord(entered[c.id], c.after));
    if (since) return `Can’t be restored as it was: ${trailText(rowOf(since).where)} has changed since.`;
    const back = new Set(changes.filter(c => c.before).map(c => c.id));
    const gone = new Set(changes.filter(c => !c.before).map(c => c.id));
    const lost = changes.find(c => c.before && argsOf(c.before).some(a => !back.has(a.at) && (!records[a.at] || gone.has(a.at))));
    if (lost) return `Can’t be restored: what ${trailText(rowOf(lost).where)} was located at is no longer in the chart.`;
    const ids = new Set(changes.map(c => c.id));
    const standing = Object.keys(entered).find(k => !ids.has(k) && argsOf(entered[k]).some(a => gone.has(a.at)));
    if (standing) return `Can’t be restored: ${recordPhrase(records, standing)} has been recorded at what it added since.`;
    return null;
  }

  function restoreNote(item) {
    if (item.rows.every(r => !r.was)) return 'Deletes what this change added, as a new change you can undo. It goes to Deleted, as any deletion does.';
    if (item.rows.every(r => !r.now)) return 'Brings back what this change deleted, as a new change you can undo.';
    return `Puts ${item.rows.length === 1 ? 'this record back as it was' : 'these records back as they were'} before this change, as a new change you can undo.`;
  }

  // Puts an entry's records back as they were before it, through the model, as one undoable step: a deletion
  // by restoring its batch from Deleted, an addition by deleting what it added (to Deleted), anything else by
  // entering the records as they were.
  function restore(id) {
    const item = readLog().find(x => x.entry.id === id);
    if (!item || cannotRestore(item)) return;
    const changes = item.entry.changes;
    const ids = changes.map(c => c.id);
    const batch = changes.every(c => !c.after) && archive.find(b => sameRecord(Object.keys(b.records).sort(), [...ids].sort()));
    let error;
    if (batch) error = restoreBatch(batch.id);
    else if (changes.every(c => !c.before)) {
      const roots = ids.filter(k => !argsOf(entered[k]).some(a => ids.includes(a.at)));
      error = deleteRecords(roots, roots.length === 1 ? (isObject(entered[roots[0]]) ? objectName(roots[0]) : recordPhrase(records, roots[0])) : count(roots.length, 'record'));
    } else {
      const next = { ...entered };
      for (const c of changes) if (c.before) next[c.id] = c.before; else delete next[c.id];
      error = change({ entered: next });
    }
    ui.failed = error ? { id, text: error } : null;
    render();
    if (!error) Shell.toast(`Restored. ${historyLog[0].summary}.`, { undo: true });
  }

  // ---- Export ----

  // The changes shown, filters and all, one row for each record a change touched.
  function exportCsv() {
    const shown = shownItems(filters());
    if (!shown.length) return Shell.toast('No changes match these filters, so there’s nothing to export.');
    const stamp = t => `${dayKey(t)} ${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}`;
    const rows = [['When', 'Who', 'Change', 'Source', 'Record', 'Before', 'After']];
    for (const it of shown) {
      const head = [stamp(new Date(it.entry.when)), it.entry.who, it.entry.summary, SOURCES[it.entry.source] ?? ''];
      if (!it.rows.length) rows.push([...head, '', '', '']);
      for (const r of it.rows) rows.push([...head, trailText(r.where), r.was ? outputPhrase(r.was) : '', r.now ? outputPhrase(r.now) : '']);
    }
    // Quoted where needed, and kept from being read as a formula by a spreadsheet.
    const cell = v => {
      let s = String(v ?? '');
      if (/^[=+@\t\r]/.test(s) || /^-(?![\d$.])/.test(s)) s = `'${s}`;
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = '﻿' + rows.map(r => r.map(cell).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `${chartInUse().name.replace(/[\\/:*?"<>|]+/g, ' ')} history ${daysAgo(0)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    Shell.toast(`Exported ${count(shown.length, 'change')} as CSV`);
  }

  // ---- Filters' menus, and the record picker ----

  function openChip(el) {
    const f = filters();
    const key = el.dataset.key;
    if (key === 'who') Shell.menu(el, [{ head: 'Changes made by' },
      ...people().map(([who, n]) => ({ label: who, hint: String(n), checked: f.who === who, run: () => setFilters({ who: f.who === who ? '' : who }) }))], 'history-who');
    if (key === 'what') {
      const n = k => readLog().filter(it => it.kinds.has(k)).length;
      Shell.menu(el, [{ head: 'Changes to' }, ...WHAT.map(([k, label]) => ({ label, hint: String(n(k)), checked: f.what === k, run: () => setFilters({ what: f.what === k ? '' : k }) }))], 'history-what');
    }
    if (key === 'record') { ui.picker = { query: '', active: 0 }; render(); }
    if (key === 'date') {
      const now = new Date(), y = now.getFullYear(), m = now.getMonth();
      const day = (yy, mm, dd) => dayKey(new Date(yy, mm, dd));
      const preset = (label, from, to) => ({ label, checked: f.from === from && f.to === to, run: () => { ui.dates = false; setFilters({ from, to }); } });
      Shell.menu(el, [{ head: 'Changes made' },
        preset('Today', daysAgo(0), daysAgo(0)), preset('Yesterday', daysAgo(1), daysAgo(1)),
        preset('In the last 7 days', daysAgo(6), daysAgo(0)), preset('In the last 30 days', daysAgo(29), daysAgo(0)),
        preset('This month', day(y, m, 1), daysAgo(0)), preset('Last month', day(y, m - 1, 1), day(y, m, 0)),
        preset('This year', day(y, 0, 1), daysAgo(0)), preset('Last year', day(y - 1, 0, 1), day(y - 1, 11, 31)),
        { sep: true }, { label: 'Between dates…', checked: false, run: () => { ui.dates = true; ui.focus = { key: 'from' }; render(); } }], 'history-date');
    }
  }

  // Objects to filter by, matching what's typed: by name, kind or what tells them apart.
  function pickerMatches(query) {
    const words = norm(query).split(' ').filter(Boolean);
    return Object.keys(records).filter(k => isObject(records[k]))
      .map(k => ({ id: k, name: objectName(k), meta: Shell.subtitleOf(k) }))
      .filter(o => words.every(w => norm(`${o.name} ${o.meta}`).includes(w)))
      .sort((a, b) => norm(b.name).startsWith(words[0] ?? '') - norm(a.name).startsWith(words[0] ?? '') || byLabel(a.name, b.name))
      .slice(0, 12);
  }
  function drawPicker() {
    const list = document.querySelector('.h-picker-list');
    if (!list || !ui.picker) return;
    const items = ui.picker.items = pickerMatches(ui.picker.query);
    ui.picker.active = Math.min(ui.picker.active, Math.max(0, items.length - 1));
    list.innerHTML = items.length ? `<div class="listbox-head">History of a record, and everything in it</div>` + items.map((o, i) => `<div class="option" role="option" data-pick="${esc(o.id)}" aria-selected="${i === ui.picker.active}">
        <span class="option-label">${esc(o.name)}</span><span class="option-meta">${esc(o.meta)}</span></div>`).join('')
      : `<div class="listbox-foot">No record matches “${esc(ui.picker.query)}”.</div>`;
    list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }
  function pick(id) { ui.picker = null; setFilters({ record: id }); }

  // ---- Events ----

  const flip = (set, id) => set.has(id) ? set.delete(id) : set.add(id);
  Shell.on('history.toggle', el => { flip(ui.open, el.dataset.id); render(); });
  Shell.on('history.run', el => { flip(ui.runs, el.dataset.id); render(); });
  Shell.on('history.more', () => { ui.limit += PAGE; render(); });
  Shell.on('history.chip', openChip);
  Shell.on('history.unset', el => {
    if (el.dataset.key === 'date') { ui.dates = false; setFilters({ from: '', to: '' }); } else setFilters({ [el.dataset.key]: '' });
  });
  Shell.on('history.clear-all', clearAll);
  Shell.on('history.restore', el => restore(el.dataset.id));
  Shell.on('history.export', exportCsv);

  // A click on an entry's line, away from its links, opens it too.
  document.addEventListener('click', e => {
    const head = e.target.closest?.('.h-entry.opens > .h-head');
    if (!head || e.target.closest('a, button') || String(getSelection()).length) return;
    flip(ui.open, head.parentElement.dataset.entry);
    render();
  });

  // The search narrows as it's typed; only the list is drawn again, so the box keeps its focus.
  document.addEventListener('input', e => {
    const key = e.target.dataset?.history;
    if (key === 'search') {
      writeFilters({ q: e.target.value });
      const f = filters();
      document.getElementById('history-body').innerHTML = bodyHtml(f, shownItems(f), readLog());
      document.getElementById('history-tally').textContent = tallyHtml(f);
      document.querySelector('.h-clear').hidden = !filtering(f);
    }
    if (key === 'picker') { ui.picker.query = e.target.value; ui.picker.active = 0; drawPicker(); }
  });
  document.addEventListener('change', e => {
    const key = e.target.dataset?.history;
    if (key === 'from' || key === 'to') { ui.focus = { key }; setFilters({ [key]: e.target.value }); }
  });
  document.addEventListener('keydown', e => {
    const key = e.target.dataset?.history;
    if (key === 'search' && e.key === 'Escape' && e.target.value) { e.preventDefault(); ui.focus = { key }; setFilters({ q: '' }); }
    if (key !== 'picker' || !ui.picker) return;
    const n = ui.picker.items?.length ?? 0;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); ui.picker.active = (ui.picker.active + (e.key === 'ArrowDown' ? 1 : -1) + n) % Math.max(n, 1); drawPicker(); }
    if (e.key === 'Enter') { e.preventDefault(); const o = ui.picker.items?.[ui.picker.active]; if (o) pick(o.id); }
    if (e.key === 'Escape') { e.preventDefault(); ui.picker = null; render(); }
  });
  document.addEventListener('mousedown', e => { if (e.target.closest?.('.h-picker-list')) e.preventDefault(); });
  document.addEventListener('click', e => { const o = e.target.closest?.('[data-pick]'); if (o) pick(o.dataset.pick); });
  // Leaving the record picker or the dates closes them. It's checked a moment later, since drawing the page
  // again moves focus to the new box.
  document.addEventListener('focusout', e => {
    const key = e.target.dataset?.history;
    if (key !== 'picker' && key !== 'from' && key !== 'to') return;
    setTimeout(() => {
      const now = document.activeElement?.dataset?.history;
      if (ui.picker && now !== 'picker') { ui.picker = null; render(); }
      if (ui.dates && now !== 'from' && now !== 'to') { ui.dates = false; render(); }
    });
  });
  window.addEventListener('hashchange', () => render());
  Shell.onChartChange(() => { ui.open.clear(); ui.runs.clear(); ui.limit = PAGE; ui.picker = null; ui.failed = null; ui.dates = false; });

  Shell.start({
    area: 'history',
    title: 'History',
    actions: () => readLog().length ? `<button class="btn btn-sm" data-cmd="history.export" title="Download the changes shown as a CSV file">Export CSV</button>` : '',
    render: page,
    after() {
      if (ui.picker) drawPicker();
      const el = ui.focus && document.querySelector(`[data-history="${ui.focus.key}"]`);
      if (el) {
        el.focus();
        if (ui.focus.at !== null && ui.focus.at !== undefined && el.setSelectionRange) try { el.setSelectionRange(ui.focus.at, ui.focus.at); } catch {}
      } else if (ui.picker) document.querySelector('[data-history="picker"]')?.focus();
      ui.focus = null;
    },
    commands: () => [
      { title: 'Export history as CSV', keywords: 'download audit changes', run: exportCsv },
      { title: 'Show only my changes', keywords: 'history mine filter', run: () => setFilters({ who: currentUser() }) },
      ...(filtering(filters()) ? [{ title: 'Clear history filters', keywords: 'reset', run: clearAll }] : []),
    ],
  });
})();
