// A record's own page, record.html#<id>: the record's name, kind and status at the top, with its actions in
// the top bar; its Details on the left, which are the record panel's view of it (panel.js), edited there just
// as beside the chart; and tabs on the right for its relations, documents, dates and history.
//
// The hash names the record. One naming an entry inside a record opens that record with the entry shown,
// and why, if a formula is behind it. One naming a relation, which belongs to no one object, opens the
// relation's own page. #relate:<a>[:<b>] relates the record to something, in place of its Details. Where
// the page has no room for two columns, Details becomes the first tab.

const RecordPage = (() => {
  const page = {
    tab: prefs.recordTab ?? null, // the tab picked, remembered between visits
    subject: undefined,           // the record the page was last drawn about
    shown: null,                  // the hash last opened, so what it names is revealed once
    reveal: null,                 // what to bring into view once drawn: an entry's id, or 'required'
    wide: true,                   // whether Details and the tabs sit side by side
    exporting: false,             // whether the profile is being made
    historyAll: false,            // whether History lists every change, not just the latest
    openLists: new Set(),         // the computed lists of relations opened out, by key
  };
  const DOCUMENT = Shell.DOCUMENT_KIND;
  const HISTORY_SHOWN = 30;
  const WIDE_FROM = 1000; // the width the page needs for two columns

  // ---- What the hash names ----

  // The record the page is about: the start of the path to what the hash names, an object or a relation, and
  // the record inside it the hash names, if any. A hash naming something deleted from a record still opens
  // the record; one naming a deleted record says so, and offers it back.
  function addressed() {
    const view = currentView();
    if (view.relate) return { subject: objectOf(view.relate.a), relate: view.relate };
    if (view.id) {
      const subject = pathTo(view.id)[0];
      return { subject, focus: view.id === subject ? null : view.id };
    }
    const h = decodeURIComponent(location.hash.slice(1));
    const batch = h ? archive.find(b => b.records[h]) : null;
    let top = h;
    while (batch && (batch.records[top] ?? records[top])?.at) top = (batch.records[top] ?? records[top]).at;
    return batch && records[top] && !isField(records[top]) ? { subject: top } : { missing: h, batch };
  }

  // ---- Reading the record ----

  const isDocument = id => isObject(records[id]) && same(records[id].kind, DOCUMENT);
  const titleOf = id => isObject(records[id]) ? objectName(id) : relationNameOf(id);
  const sidesText = id => records[id].args.map(a => objectName(objectOf(a.at))).join(' → ');
  // Each record by the one it's inside (the start of its path), and each relation by the objects it
  // relates, worked out once for each state, since a state is never changed in place.
  const indexes = new WeakMap();
  function index() {
    if (!indexes.has(records)) {
      const byHead = new Map(), byObject = new Map();
      const add = (map, k, v) => { if (!map.has(k)) map.set(k, []); map.get(k).push(v); };
      for (const k of Object.keys(records)) {
        add(byHead, pathTo(k)[0], k);
        if (isRelation(records[k])) for (const o of new Set(records[k].args.map(a => objectOf(a.at)))) add(byObject, o, k);
      }
      indexes.set(records, { byHead, byObject });
    }
    return indexes.get(records);
  }
  // Everything inside a record, at any depth.
  const inside = id => (index().byHead.get(id) ?? []).filter(k => k !== id);
  // The relations an object is in, at itself or at something inside it.
  const relationsOf = id => index().byObject.get(id) ?? [];
  // What the tabs list, worked out once for each state of the records and the history.
  let memo = { of: {}, lists: {} };
  function once(name, id, fn) {
    const of = memo.of;
    if (of.records !== records || of.historyLog !== historyLog || of.id !== id) memo = { of: { records, historyLog, id }, lists: {} };
    return memo.lists[name] ??= fn(id);
  }
  // A document's address, from its first document field.
  const addressOf = id => { const k = entriesOf(id).find(e => isField(records[e]) && records[e].field === 'document'); return k ? records[k].value : null; };

  // The relations an object is in, by the list each puts the other side in, seen from here (Owners,
  // Holdings), from every location in the object, as the panel's rows group them there. Lists of entered
  // relations come first, then those only formulas give. Documents have a tab of their own, so they're
  // left out here, except on a document's own page, which has none.
  const relationLists = id => once('relations', id, findLists);
  function findLists(id) {
    const lists = new Map();
    const shown = x => x.others.length && (isDocument(id) || !isDocument(objectOf(x.others[0].at)));
    for (const at of [id, ...inside(id).filter(k => !isField(records[k]))]) for (const g of relationGroups(at)) {
      const key = `${g.form}|${norm(g.list)}`;
      if (!lists.has(key)) lists.set(key, { key, list: g.list, name: formName(g.form), at: new Set(), items: [] });
      const l = lists.get(key);
      l.at.add(at);
      l.items.push(...g.ids.map(rel => ({ rel, others: records[rel].args.filter(a => a.at !== at) })).filter(shown));
    }
    for (const l of lists.values()) l.computed = l.items.every(x => isComputed(x.rel));
    return [...lists.values()].filter(l => l.items.length).sort((a, b) => a.computed - b.computed || byLabel(a.list, b.list));
  }

  // What a relation says besides who's in it, for its chip: its option or value, then the fields located at
  // it, but not its dates, which the Dates tab has.
  function relationDetail(rel) {
    const r = records[rel];
    const fields = entriesOf(rel).filter(e => isField(records[e]) && records[e].field !== 'date');
    const out = isTag(r) ? (r.tag ? '' : 'ruled out') : isField(r) ? displayValue(r) : r.choice;
    return [out, ...fields.map(e => displayValue(records[e]))].filter(Boolean).slice(0, 2).join(' · ');
  }

  // The documents that concern an object: the Document objects it's related to, newest first, each with its
  // address, type, date, status and version where it has them.
  const documentsOf = id => once('documents', id, findDocuments);
  function findDocuments(id) {
    const docs = new Set();
    for (const rel of relationsOf(id)) for (const a of records[rel].args) if (objectOf(a.at) !== id && isDocument(objectOf(a.at))) docs.add(objectOf(a.at));
    return [...docs].map(documentFacts).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || byLabel(objectName(a.id), objectName(b.id)));
  }
  function documentFacts(doc) {
    const es = entriesOf(doc);
    const pick = (test, prefer = () => true) => es.find(e => test(records[e]) && prefer(records[e])) ?? es.find(e => test(records[e]));
    const date = pick(r => isField(r) && r.field === 'date', r => /date/i.test(r.edge));
    return {
      id: doc, date: date ? records[date].value : null, dateId: date,
      type: pick(r => isChoice(r) && !/status/i.test(r.edge), r => /type/i.test(r.edge)),
      status: pick(r => isChoice(r) && /status/i.test(r.edge)),
      version: pick(r => isField(r) && /version/i.test(r.edge)),
      address: addressOf(doc),
    };
  }

  // Every date in a record, entered or computed: inside it, and for an object, on the relations it's in and
  // inside those. Upcoming ones first, soonest first, then past ones, latest first.
  const datesOf = id => once('dates', id, findDates);
  function findDates(id) {
    const at = isObject(records[id]) ? relationsOf(id).flatMap(rel => [rel, ...inside(rel)]) : [];
    return [...new Set([...inside(id), ...at])].filter(k => isField(records[k]) && records[k].field === 'date')
      .map(k => ({ id: k, iso: records[k].value, days: Parts.daysUntil(records[k].value) }))
      .sort((a, b) => (a.days < 0) - (b.days < 0) || (a.days < 0 ? b.days - a.days : a.days - b.days));
  }

  // The changes in the history that touch the record: to it, to anything inside it, or for an object, to a
  // relation it's in or anything inside that. Each keeps only its changes to the record. A change can name
  // records that have gone since, so they're looked for in the change itself, and in Deleted.
  const historyFor = id => once('history', id, findHistory);
  function findHistory(id) {
    const object = isObject(records[id]);
    return historyLog.map(h => {
      const own = Object.fromEntries(h.changes.map(c => [c.id, c.after ?? c.before]));
      const get = k => records[k] ?? own[k] ?? archive.find(b => b.records[k])?.records[k];
      const head = k => { let cur = k; while (get(cur)?.at) cur = get(cur).at; return cur; };
      const touches = c => {
        const top = head(c.id), r = get(top);
        return top === id || (object && !!r && isRelation(r) && r.args.some(a => head(a.at) === id));
      };
      return { h, get, head, changes: h.changes.filter(touches) };
    }).filter(x => x.changes.length);
  }

  // ---- The page's parts ----

  // The status worth showing beside the name: what formulas found true of the record at its top (Private
  // Fund, Investment Company), and what's required but blank.
  function badgesHtml(id) {
    const r = records[id];
    if (isRelation(r)) return [isComputed(id) && Parts.badge('Computed', 'computed'), isTag(r) && !r.tag && Parts.badge('Ruled out', 'danger')].filter(Boolean).join('');
    const found = entriesOf(id).filter(k => isTag(records[k]) && records[k].tag && isComputed(k)).map(k => {
      const d = definitionOf(formulaInfo(k)?.def);
      return `<a class="record-badge" href="${esc(Shell.recordHref(k))}" title="${esc(d ? `Worked out by ${d.name}. Click to see why.` : 'Worked out by formula')}">${Parts.badge(records[k].edge, 'computed')}</a>`;
    });
    const missing = missingUnder(id);
    const labels = [...new Set(missing.map(m => m.label))];
    const blank = missing.length ? `<button class="record-badge" data-cmd="record.missing" title="Show ${labels.length > 1 ? 'them' : 'it'}">${Parts.badge(labels.length === 1 ? `${labels[0]} missing` : `${count(missing.length, 'required entry')} missing`, 'danger')}</button>` : '';
    return found.join('') + blank;
  }

  function headHtml(id) {
    const r = records[id];
    // A relation's own output goes in its title, as in its panel: a tag's checkbox, a choice's option.
    const title = isObject(r) ? esc(objectName(id))
      : `${isTag(r) ? tagBox(id) : ''}<span>${esc(relationNameOf(id))}</span>${isChoice(r) ? choiceSelect(id, 'in-title') : isField(r) ? `<span class="record-title-value">${relationValue(id, relationNameOf(id))}</span>` : ''}`;
    const sub = isObject(r) ? Shell.subtitleOf(id) : `Relation · ${sidesText(id)}`;
    const badges = badgesHtml(id);
    return `<header class="record-head">
        <h2 class="page-title record-title">${title}</h2>
        <p class="page-sub">${esc(sub)}</p>
        ${badges ? `<div class="record-badges">${badges}</div>` : ''}
      </header>`;
  }

  const tabsOf = id => isObject(records[id]) ? ['relations', ...(isDocument(id) ? [] : ['documents']), 'dates', 'history'] : ['dates', 'history'];
  const TAB_NAMES = { details: 'Details', relations: 'Relations', documents: 'Documents', dates: 'Dates', history: 'History' };

  function tabCount(tab, id) {
    if (tab === 'relations') return relationLists(id).reduce((n, l) => n + l.items.length, 0);
    if (tab === 'documents') return documentsOf(id).length;
    if (tab === 'dates') return datesOf(id).length;
    if (tab === 'history') return historyFor(id).length;
    return 0;
  }

  function tabBar(id, tabs, current, extra = '') {
    return `<div class="tabs record-tabs" role="tablist" aria-label="About this record">${tabs.map(t => {
      const n = tabCount(t, id);
      return `<button class="tab" role="tab" id="record-tab-${t}" aria-selected="${t === current}" aria-controls="record-pane" tabindex="${t === current ? 0 : -1}" data-cmd="record.tab" data-tab="${t}">${TAB_NAMES[t]}${n ? `<span class="tab-count">${n}</span>` : ''}</button>`;
    }).join('')}${extra}</div>`;
  }

  // The Details: the panel's view of the record, under a bar with the panel's Add menu. While relating,
  // the Relate view takes their place, with its own Done.
  const detailsAdd = (id, relate) => relate || isField(records[id]) ? '' : `<span class="record-bar-actions">${addMenu(id)}</span>`;
  const noticeHtml = () => ui.notice ? `<div class="record-notice" role="alert">${icon('alert-triangle')}<span>${esc(ui.notice)}</span></div>` : '';

  // Each list under its name, with its relation's name and where it is if that's below the record. A long
  // list only formulas give starts collapsed to a line, as the panel's rows do, since formulas can list many.
  const COLLAPSED_FROM = 4;
  function relationsTab(id) {
    const lists = relationLists(id);
    if (!lists.length) return Parts.empty({ title: 'No relations yet', desc: 'Owners, holdings, officers and the like show up here once recorded.', action: { label: 'Add relation', cmd: 'record.relate' } });
    return `<div class="record-lists">${lists.map(l => {
      const where = [...l.at].filter(at => at !== id).map(at => pathTo(at).slice(1).map(segmentText).join(' › '));
      const open = !l.computed || l.items.length < COLLAPSED_FROM || page.openLists.has(l.key);
      const items = open ? l.items.map(({ rel, others }) => {
        const computed = isComputed(rel);
        const [first, ...rest] = others;
        const more = rest.map(a => `<span class="record-via">${esc(a.edge)}</span>${Parts.chip(objectOf(a.at), { computed })}`).join('');
        const whole = rest.length ? ` title="${esc([objectName(objectOf(first.at)), ...rest.map(a => `${a.edge} ${objectName(objectOf(a.at))}`)].join(', '))}"` : '';
        return `<span class="record-rel"${whole}>${Parts.chip(objectOf(first.at), { detail: relationDetail(rel), computed })}${more}</span>`;
      }).join('') : (() => {
        // A line has room for a few names; the rest show when it's opened.
        const names = l.items.slice(0, 4).map(x => objectName(objectOf(x.others[0].at)));
        return `<button class="record-summary computed-text" data-cmd="record.open-list" data-key="${esc(l.key)}" title="Worked out by formula. Click to show them all.">${l.items.length} · ${esc(names.join(', '))}${l.items.length > names.length ? ', …' : ''}</button>`;
      })();
      return `<div class="record-list">
          <div class="record-list-label"><span class="record-list-name">${esc(l.list)}</span>
            <span class="record-list-note" title="${esc([l.name, ...where].join(' · '))}">${esc([l.name, ...where].join(' · '))}</span></div>
          <div class="chips">${items}</div></div>`;
    }).join('')}</div>`;
  }

  // The one way to link a document here: the relation the schema has between this record and a Document,
  // if there is one, started in the Details.
  const documentRelation = id => relationTypesAt(id).find(t => [...t.otherSpecs].some(s => s === `kind:${norm(DOCUMENT)}`));

  function documentsTab(id) {
    const docs = documentsOf(id);
    if (!docs.length) {
      const action = documentRelation(id) ? { label: 'Link document', cmd: 'record.link-document' } : { label: 'Go to Documents', href: 'documents.html' };
      return Parts.empty({ title: 'No documents linked yet', desc: 'Documents that concern this record show up here.', action });
    }
    return `<div class="record-docs">${docs.map(d => {
      const status = d.status ? records[d.status].choice : '';
      const done = /^(executed|final|signed|filed|effective)$/i.test(status);
      const date = d.date ? `<span class="tnum${isComputed(d.dateId) ? ' computed-text' : ''}">${esc(Parts.date(d.date))}</span>` : '';
      const meta = [d.type && Parts.output(d.type), date, d.version && `${esc(records[d.version].edge)} ${Parts.output(d.version)}`]
        .filter(Boolean).map(m => `<span class="record-meta">${m}</span>`).join('<span class="record-sep">·</span>');
      const open = d.address ? `<a class="btn btn-sm btn-ghost" href="${esc(d.address)}" target="_blank" rel="noopener" title="${esc(documentName(d.address))}">Open${icon('external-link')}</a>` : '';
      return `<div class="record-doc">
          <div class="record-doc-text"><a class="record-doc-name" href="${esc(Shell.recordHref(d.id))}">${esc(objectName(d.id))}</a>
            ${meta ? `<div class="record-doc-meta">${meta}</div>` : ''}</div>
          ${status ? Parts.badge(status, done ? 'success' : '') : ''}${open}</div>`;
    }).join('')}</div>`;
  }

  // Where a date is, as its row says it: its label, then what it's in, below the record or on a relation.
  function dateWhere(k, id) {
    const path = pathTo(k);
    const between = path.slice(1, -1).map(segmentText);
    if (path[0] === id) return between.join(' › ');
    const rel = path[0];
    const others = records[rel].args.filter(a => objectOf(a.at) !== id).map(a => objectName(objectOf(a.at)));
    return [`${relationNameOf(rel)} · ${others.join(', ')}`, ...between].join(' › ');
  }

  function datesTab(id) {
    const dates = datesOf(id);
    if (!dates.length) return Parts.empty({ title: 'No dates yet', desc: 'Dates entered or worked out for this record show up here.', action: { label: 'Add date', cmd: 'record.add-date' } });
    const row = d => {
      const r = records[d.id];
      const label = isRelation(r) ? relationNameOf(d.id) : r.edge;
      const where = dateWhere(d.id, id);
      const soon = d.days >= 0 && d.days <= 30;
      const due = d.days >= -30 ? `<span class="record-date-due${soon ? ' is-soon' : d.days < 0 ? ' is-past' : ''}">${esc(Parts.dueText(d.iso))}</span>` : '';
      const computed = isComputed(d.id);
      return `<a class="record-date" href="${esc(Shell.recordHref(d.id))}"${computed ? ' title="Worked out by formula"' : ''}>
          <span class="record-date-day tnum${computed ? ' computed-text' : ''}">${esc(Parts.date(d.iso))}</span>
          <span class="record-date-what"><span class="record-date-label${computed ? ' computed-text' : ''}">${esc(label)}</span>${where ? `<span class="record-date-where">${esc(where)}</span>` : ''}</span>
          ${due}</a>`;
    };
    const upcoming = dates.filter(d => d.days >= 0), past = dates.filter(d => d.days < 0);
    const group = (title, list) => list.length ? `<div class="record-group">${title}</div>${list.map(row).join('')}` : '';
    return `<div class="record-dates">${group('Upcoming', upcoming)}${group('Past', past)}</div>`;
  }

  // A change to a record, as History lists it: what it changed, and its output before and after.
  function changeHtml(c, x, id) {
    const path = [];
    let top = c.id;
    while (x.get(top)?.at) { path.unshift(top); top = x.get(top).at; }
    const r = c.after ?? c.before, t = x.get(top);
    const name = o => records[o] ? objectName(o) : 'a deleted record';
    const labels = path.map(p => x.get(p).edge);
    let what;
    if (top === id) what = labels.length ? labels.join(' › ') : isObject(r) ? r.kind : relationNameOf(id);
    else {
      const rel = records[top] ? relationNameOf(top) : relationLabel(t);
      what = [`${rel} · ${t.args.filter(a => x.head(a.at) !== id).map(a => name(x.head(a.at))).join(', ')}`, ...labels].join(' › ');
    }
    const out = rec => esc(outputPhrase(rec));
    let diff;
    if (isObject(r)) diff = `<span class="hist-note">${c.before ? 'Deleted' : 'Created'}</span>`;
    else if (!c.before) diff = isTag(r) ? `<span class="hist-note">Added${r.tag ? '' : ', ruled out'}</span>` : `<span class="hist-note">Added</span><ins>${out(r)}</ins>`;
    else if (!c.after) diff = `<span class="hist-note">Deleted</span>${isTag(r) ? '' : `<del>${out(r)}</del>`}`;
    else if (outputPhrase(c.before) !== outputPhrase(c.after)) diff = `<del>${out(c.before)}</del><span class="hist-arrow">→</span><ins>${out(c.after)}</ins>`;
    else diff = `<span class="hist-note">Renamed</span><del>${esc(c.before.edge ?? relationLabel(c.before))}</del><span class="hist-arrow">→</span><ins>${esc(c.after.edge ?? relationLabel(c.after))}</ins>`;
    return `<div class="hist-change"><span class="hist-what">${esc(what)}</span><span class="hist-diff">${diff}</span></div>`;
  }

  const SOURCES = { undo: 'Undo', redo: 'Redo', reset: 'Reset to the sample', import: 'Import' };

  function historyTab(id) {
    const list = historyFor(id);
    if (!list.length) return Parts.empty({ title: 'No changes yet', desc: 'Changes to this record show up here, with who made them and when.' });
    const shown = page.historyAll ? list : list.slice(0, HISTORY_SHOWN);
    const items = shown.map(x => `<li class="hist">
        <div class="hist-head">${Parts.avatar(x.h.who)}<span class="hist-who">${esc(x.h.who)}</span>${Parts.when(x.h.when)}${x.h.source ? `<span class="hist-source">${esc(SOURCES[x.h.source] ?? x.h.source)}</span>` : ''}</div>
        <div class="hist-summary">${esc(x.h.summary)}</div>
        <div class="hist-changes">${x.changes.slice(0, 8).map(c => changeHtml(c, x, id)).join('')}${x.changes.length > 8 ? `<div class="hist-more">and ${count(x.changes.length - 8, 'more change')}</div>` : ''}</div>
      </li>`).join('');
    const more = list.length > shown.length ? `<button class="link-btn" data-cmd="record.history-all">Show all ${list.length} changes</button>` : '';
    const all = `<a class="link-btn" href="history.html#record=${encodeURIComponent(id)}" title="The History, filtered to this record and everything in it">Open in History</a>`;
    return `<ol class="hist-list">${items}</ol><div class="record-foot">${more}${all}</div>`;
  }

  const TAB_BODIES = { relations: relationsTab, documents: documentsTab, dates: datesTab, history: historyTab };

  // A hash naming nothing in this chart: a record that was deleted, offered back, or nothing at all.
  function notFoundHtml({ missing, batch }) {
    const body = batch ? Parts.empty({ title: `${batch.label} was deleted`, desc: 'Restoring it brings back what depended on it, too.', action: { label: 'Restore', cmd: 'record.restore', data: { batch: batch.id } } })
      : missing ? Parts.empty({ title: 'No record here', desc: 'This chart has no record at this address. It may be in another chart.', action: { label: 'Go to Records', href: 'records.html' } })
      : Parts.empty({ title: 'No record open', desc: `Search for one (${isMac ? '⌘' : 'Ctrl'} K), or pick one from a table of records.`, action: { label: 'Go to Records', href: 'records.html' } });
    return `<div class="content record-missing">${body}</div>`;
  }

  // ---- The page ----

  const isWide = () => (document.getElementById('main')?.clientWidth ?? innerWidth) >= WIDE_FROM;

  function html() {
    const a = addressed();
    const id = a.subject;
    if (!records[id]) return notFoundHtml(a);
    page.wide = isWide();
    const tabs = tabsOf(id);
    const all = page.wide ? tabs : ['details', ...tabs];
    const tab = all.includes(page.tab) ? page.tab : all[0];
    const details = `${noticeHtml()}<div class="panel record-panel" id="panel"></div>`;
    const body = tab === 'details' ? details : `<div class="record-pane" id="record-pane" role="tabpanel" aria-labelledby="record-tab-${tab}">${TAB_BODIES[tab](id)}</div>`;
    const columns = page.wide
      ? `<div class="record-cols">
          <section class="record-details" aria-label="Details">
            <div class="tabs record-bar"><h3 class="record-bar-title">Details</h3>${detailsAdd(id, a.relate)}</div>${details}</section>
          <section class="record-side">${tabBar(id, tabs, tab)}${body}</section></div>`
      : `<section class="record-single">${tabBar(id, all, tab, tab === 'details' ? detailsAdd(id, a.relate) : '')}${body}</section>`;
    return `<div class="record${page.wide ? '' : ' is-narrow'}">${headHtml(id)}${columns}</div>`;
  }

  function after() {
    const a = addressed();
    if (document.getElementById('panel')) {
      renderPanel(a.relate ? { relate: a.relate } : { id: a.subject });
      restoreFocus();
    }
    reveal();
    // What a change in the panel did goes in a toast, with Undo; what it couldn't do stays inline.
    if (ui.info) { Shell.toast(ui.info, { undo: true }); ui.info = null; }
  }

  // Brings what the hash names into view, once: an entry, with a flash, or the first required entry left blank.
  function reveal() {
    if (!page.reveal) return;
    const target = page.reveal === 'required' ? document.querySelector('#panel .row.is-required')
      : document.querySelector(`#panel [data-entry="${CSS.escape(page.reveal)}"] > .row`);
    page.reveal = null;
    if (!target) return;
    target.scrollIntoView({ block: 'nearest' });
    target.classList.add('is-revealed');
    target.querySelector('[data-action="fill-required"]')?.focus({ preventScroll: true });
  }

  // Where the sidebar puts the page: under the record's kind, or Documents for a document.
  function area() {
    const id = addressed().subject;
    const r = records[id];
    if (r && isDocument(id)) return { area: 'documents', kind: null };
    return { area: 'records', kind: r && isObject(r) ? r.kind : null };
  }

  // Before drawing: the sidebar marks the record's kind, a record opened anew is remembered and opened out,
  // and a hash naming something inside it opens the way to that.
  function sync() {
    const a = addressed();
    const r = records[a.subject];
    if (Shell.page) Object.assign(Shell.page, area());
    if (a.subject !== page.subject) {
      page.subject = a.subject;
      page.historyAll = false;
      page.openLists.clear();
      if (r && isObject(r)) Shell.visited(a.subject);
      // A page has room for everything inside the record, so it starts opened out.
      if (r) for (const k of inside(a.subject)) if (!isField(records[k]) && entriesOf(k).length) ui.expanded.add(k);
    }
    if (location.hash !== page.shown) {
      page.shown = location.hash;
      if (a.focus) {
        for (const k of pathTo(a.focus).slice(1, -1)) ui.expanded.add(k);
        if (formulaInfo(a.focus)) ui.why = a.focus;
        page.reveal = a.focus;
      }
      // What the hash names in the Details, or relating, brings them forward where they're a tab.
      if ((a.focus || a.relate) && !isWide()) page.tab = 'details';
    }
  }

  // The path to the record: its kind's table, and for a relation, its first side. A deleted record keeps
  // its path, from Deleted.
  function crumbs() {
    const a = addressed();
    const r = records[a.subject];
    const gone = a.batch?.records[a.missing];
    const kind = r ? records[isObject(r) ? a.subject : objectOf(r.args[0].at)].kind : gone?.kind;
    if (!kind) return [{ text: 'Records', href: 'records.html' }];
    const base = same(kind, DOCUMENT) ? [{ text: 'Documents', href: 'documents.html' }]
      : [{ text: 'Records', href: 'records.html' }, { text: plural(kind), href: Shell.kindHref(kind) }];
    if (!r || isObject(r)) return base;
    const obj = objectOf(r.args[0].at);
    return [...base, { text: objectName(obj), href: Shell.recordHref(obj) }];
  }
  const title = () => {
    const a = addressed();
    return records[a.subject] ? titleOf(a.subject) : a.batch?.records[a.missing] ? a.batch.label : 'Record';
  };

  function actions() {
    const id = addressed().subject;
    const r = records[id];
    if (!r) return '';
    const address = isObject(r) && addressOf(id);
    const shown = !isObject(r) || (boxShown(id) && !hiddenInView().includes(id));
    return [
      address && `<a class="btn btn-sm btn-primary" href="${esc(address)}" target="_blank" rel="noopener" title="${esc(documentName(address))}">Open document${icon('external-link')}</a>`,
      shown ? `<a class="btn btn-sm" href="chart.html#${encodeURIComponent(id)}" title="Select it on the chart">Open on chart</a>`
        : `<button class="btn btn-sm" disabled title="The ${esc(viewInUse().name)} view doesn’t draw it">Open on chart</button>`,
      isObject(r) && `<button class="btn btn-sm" data-cmd="record.export"${page.exporting ? ' disabled' : ''} title="A PDF of its entries and relations">${page.exporting ? 'Exporting…' : 'Export profile'}</button>`,
      `<button class="icon-btn" data-cmd="record.more" aria-haspopup="menu" aria-label="More actions" title="More">${icon('dots')}</button>`,
    ].filter(Boolean).join('');
  }

  // ---- Actions ----

  const subject = () => addressed().subject;
  const showDetails = () => { if (!page.wide) page.tab = 'details'; };

  function setTab(tab) {
    page.tab = tab;
    prefs.recordTab = tab;
    savePrefs();
    render();
  }

  async function exportProfile() {
    const id = subject();
    if (!records[id] || !isObject(records[id]) || page.exporting) return;
    page.exporting = true;
    render();
    try {
      await exportRecordPdf(id);
      Shell.toast(`Exported the profile of ${objectName(id)}`);
    } catch (e) {
      Shell.toast(`Couldn’t export the profile: ${e.message}`, { tone: 'error' });
    } finally {
      page.exporting = false;
      render();
    }
  }

  async function copyLink() {
    const url = location.href;
    try { await navigator.clipboard.writeText(url); }
    catch {
      const box = Object.assign(document.createElement('textarea'), { value: url });
      document.body.appendChild(box);
      box.select();
      document.execCommand('copy');
      box.remove();
    }
    Shell.toast('Copied the link to this record');
  }

  // Deleting takes effect at once, with Undo; the record and what depends on it go to Deleted.
  function deleteSubject() {
    const id = subject();
    const label = isObject(records[id]) ? objectName(id) : `${relationNameOf(id)}: ${sidesText(id)}`;
    const n = withDependents([id]).size - 1;
    const error = deleteRecords([id], label);
    if (error) return Shell.toast(error, { tone: 'error' });
    clearForms();
    render();
    Shell.toast(`Deleted ${label}${n ? `, with ${count(n, 'record')} that depended on it` : ''}`, { undo: true });
  }

  function moreMenu(el) {
    const id = subject();
    const r = records[id];
    const what = isObject(r) ? r.kind.toLowerCase() : 'relation';
    Shell.menu(el, [
      { label: 'Copy link', run: copyLink },
      { sep: true },
      isComputed(id) ? { label: `Delete ${what}`, hint: 'Worked out by formula', disabled: true }
        : { label: `Delete ${what}`, danger: true, run: deleteSubject },
    ], 'record-more');
  }

  Shell.on('record.tab', el => setTab(el.dataset.tab));
  Shell.on('record.export', exportProfile);
  Shell.on('record.more', moreMenu);
  Shell.on('record.missing', () => { showDetails(); page.reveal = 'required'; render(); });
  Shell.on('record.relate', () => { showDetails(); panelGo(`relate:${subject()}`); });
  Shell.on('record.add-date', () => { showDetails(); startForm('add', 'field', subject()); render(); });
  Shell.on('record.link-document', () => { showDetails(); startRelationForm(subject(), documentRelation(subject()).key); render(); });
  Shell.on('record.history-all', () => { page.historyAll = true; render(); });
  Shell.on('record.open-list', el => { page.openLists.add(el.dataset.key); render(); });
  Shell.on('record.restore', el => {
    const error = restoreBatch(el.dataset.batch);
    if (error) return Shell.toast(error, { tone: 'error' });
    render();
    Shell.toast('Restored', { undo: true });
  });

  // Arrow keys move between the tabs, as in any tab list.
  document.addEventListener('keydown', e => {
    if (!e.target.matches?.('.record-tabs .tab') || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    const tabs = [...document.querySelectorAll('.record-tabs .tab')];
    const next = tabs[(tabs.indexOf(e.target) + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
    e.preventDefault();
    setTab(next.dataset.tab);
    document.getElementById(`record-tab-${next.dataset.tab}`)?.focus();
  });

  // ---- Starting ----

  // The panel shows the record as its page's Details: its links to records go to their pages, which for one
  // inside this record is this page with it shown; relating stays here. Its other views have homes of their
  // own: a kind's table, the Schema area for definitions, and the chart's panel for the rest.
  panelOptions.page = true;
  panelOptions.href = hash => {
    const h = decodeURIComponent(hash);
    if (records[h]) return Shell.recordHref(h);
    if (h.startsWith('relate:')) return `#${hash}`;
    if (h.startsWith('kind:')) return Shell.kindHref(h.slice(5));
    if (/^(definition|formula|schema)/.test(h)) return `schema.html#${hash}`;
    return h ? `chart.html#${hash}` : 'records.html';
  };
  // Leaving a record with something required blank asks in a dialog, since its Details may be out of sight.
  panelOptions.ask = q => Shell.confirm({ title: q.title, body: q.message, confirm: q.yes }).then(yes => yes && q.apply());

  function start() {
    Shell.start({
      ...area(), undo: false,
      title, crumbs, actions, render: html, after,
      commands: () => {
        const id = subject();
        if (!records[id]) return [];
        const r = records[id];
        return [
          { title: 'Open on chart', keywords: 'select box', run: () => { location.href = `chart.html#${encodeURIComponent(id)}`; } },
          isObject(r) && { title: 'Export profile', keywords: 'pdf download', run: exportProfile },
          { title: 'Relate to…', keywords: 'relation add link', run: () => { showDetails(); panelGo(`relate:${id}`); } },
          { title: 'Copy link', keywords: 'url share', run: copyLink },
          !isComputed(id) && { title: `Delete ${titleOf(id)}`, keywords: 'remove', run: deleteSubject },
          ...tabsOf(id).map(t => ({ title: `Show ${TAB_NAMES[t]}`, keywords: 'tab', run: () => setTab(t) })),
        ].filter(Boolean);
      },
    });
  }

  // A switch to another chart leaves the hash empty, and the panel lets go of what it held.
  Shell.onChartChange(() => { clearForms(); ui.expanded.clear(); ui.why = null; page.subject = undefined; });

  // The two columns need room; when there is or isn't any more, the page is drawn again.
  let observed = null;
  function watchWidth() {
    const main = document.getElementById('main');
    if (!main || observed) return;
    observed = new ResizeObserver(() => { if (records[subject()] && isWide() !== page.wide) render(); });
    observed.observe(main);
  }

  return {
    start() { initState(); sync(); start(); watchWidth(); },
    render() { sync(); Shell.render(); },
  };
})();

// The page draws itself again after every change; the panel and the shell both call this.
function render() { RecordPage.render(); }

RecordPage.start();
