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
  const DOCUMENT = Documents.KIND;
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
    const h = readHash();
    const batch = h ? archive.find(b => b.records[h]) : null;
    let top = h;
    while (batch && (batch.records[top] ?? records[top])?.at) top = (batch.records[top] ?? records[top]).at;
    return batch && records[top] && !isField(records[top]) ? { subject: top } : { missing: h, batch };
  }

  // ---- Reading the record ----

  const isDocument = Documents.isDocObject;
  const titleOf = id => isObject(records[id]) ? objectName(id) : relationNameOf(id);
  const sidesText = id => records[id].args.map(a => objectName(objectOf(a.at))).join(' → ');
  // Each record by the one it's inside (the start of its path), worked out once for each state, since a
  // state is never changed in place.
  const indexes = new WeakMap();
  function index() {
    if (!indexes.has(records)) {
      const byHead = new Map();
      for (const k of Object.keys(records)) pushTo(byHead, pathTo(k)[0], k);
      indexes.set(records, { byHead });
    }
    return indexes.get(records);
  }
  // Everything inside a record, at any depth.
  const inside = id => (index().byHead.get(id) ?? []).filter(k => k !== id);
  // What the tabs list, worked out once for each state of the records and the history.
  let memo = { of: {}, lists: {} };
  function once(name, id, fn) {
    const of = memo.of;
    if (of.records !== records || of.historyLog !== historyLog || of.id !== id) memo = { of: { records, historyLog, id }, lists: {} };
    return memo.lists[name] ??= fn(id);
  }
  // A document's address: its link (Documents.entryFor), or its first document field.
  const addressOf = id => { const k = Documents.entryFor(id, 'link'); return k && Documents.isDocField(records[k]) ? records[k].value : null; };

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

  // The documents that concern an object, newest first, as the Documents area lists them (Documents.concerning).
  const documentsOf = id => once('documents', id, Documents.concerning);

  // Every date in a record, entered or computed, as the agenda has it (Agenda.events): inside it, and for an
  // object, on the relations it's in and inside those.
  const datesOf = id => once('dates', id, findDates);
  const findDates = id => Agenda.events().filter(e => e.root === id || (isRelation(records[e.root]) && e.owners.includes(id)));

  // The record's history (historyOf in model.js): the changes to it, to anything inside it, or for an
  // object, to a relation it's in or anything inside that. To say where each was, a record that has gone
  // since is looked for in the change itself, and in Deleted.
  const historyFor = id => once('history', id, findHistory);
  function findHistory(id) {
    return historyOf(id).map(h => {
      const own = Object.fromEntries(h.changes.map(c => [c.id, c.after ?? c.before]));
      const get = k => records[k] ?? own[k] ?? archive.find(b => b.records[k])?.records[k];
      const head = k => { let cur = k; while (get(cur)?.at) cur = get(cur).at; return cur; };
      return { h, get, head, changes: h.changes };
    });
  }

  // ---- The page's parts ----

  // The status worth showing beside the name: what implications found true of the record at its top
  // (Private Fund, Investment Company); then what's missing, each the same way: a check that doesn't hold
  // anywhere in it (Why.fails), and what's required but blank. A check that holds says nothing.
  function badgesHtml(id) {
    const r = records[id];
    if (isRelation(r)) return [isComputed(id) && Parts.badge('Computed', 'computed'), isTag(r) && !r.tag && Parts.badge('Ruled out', 'danger')].filter(Boolean).join('');
    const found = entriesOf(id).filter(k => isTag(records[k]) && records[k].tag && isComputed(k) && Why.definitionFor(k)?.implications).map(k =>
      Parts.badge(records[k].edge, 'computed', { href: Shell.recordHref(k), title: `Implied by ${Why.definitionFor(k).name}. Click to see why.` }));
    const failed = [id, ...inside(id)].filter(Why.fails).map(k =>
      Parts.badge(`${records[k].edge} ruled out`, 'warn', { href: Shell.recordHref(k), title: Why.text(k) || 'A check that doesn’t hold. Click to see why.' }));
    const missing = missingUnder(id);
    const labels = [...new Set(missing.map(m => m.label))];
    const blank = missing.length ? Parts.badge(labels.length === 1 ? `${labels[0]} missing` : `${count(missing.length, 'required entry')} missing`, 'warn',
      { cmd: 'record.missing', title: `Required, and blank. Show ${missing.length > 1 ? 'them' : 'it'}.` }) : '';
    return found.join('') + failed.join('') + blank;
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

  // What's missing among a record's documents: the checks in it that don't hold (Why.fails) and would hold
  // with another document linked, as they read in words, with the way to link one.
  function missingDocsHtml(id) {
    const rel = documentRelation(id);
    const checks = rel ? [id, ...inside(id)].filter(k => Why.fails(k) && Why.addable(k).some(x => x.at === id && x.type.key === rel.key)) : [];
    if (!checks.length) return '';
    return `<div class="record-wanting"><div class="record-wanting-text">${checks.map(k => `<p><a href="${esc(Shell.recordHref(k))}">${esc(records[k].edge)}</a> ruled out${
      Why.descriptionFor(k) ? `<span class="record-wanting-desc">${esc(Why.descriptionFor(k))}</span>` : ''}</p>`).join('')}</div>
      <button class="btn btn-sm" data-cmd="record.link-document">Link document</button></div>`;
  }

  function documentsTab(id) {
    const docs = documentsOf(id);
    if (!docs.length) {
      const action = documentRelation(id) ? { label: 'Link document', cmd: 'record.link-document' } : { label: 'Go to Documents', href: 'documents.html' };
      return missingDocsHtml(id) || Parts.empty({ title: 'No documents linked yet', desc: 'Documents that concern this record show up here.', action });
    }
    // Each with its file's glyph, then its type, date and version, its status, and Open.
    const text = (cell, cls = '') => `<span class="${cls}${cell.computed ? ' computed-text' : ''}"${cell.computed ? ' title="Worked out by formula"' : ''}>${esc(cell.text)}</span>`;
    return `${missingDocsHtml(id)}<div class="record-docs">${docs.map(d => {
      const meta = [d.type && text(d.type), d.date && text({ ...d.date, text: Parts.date(d.date.iso) }, 'tnum'),
        d.version && `${esc(records[d.version.id].edge)} ${text(d.version)}`]
        .filter(Boolean).map(m => `<span class="record-meta">${m}</span>`).join('<wbr><span class="record-sep">·</span>');
      const open = d.link ? `<a class="btn btn-sm btn-ghost" href="${esc(SharePoint.openUrl(d.link))}" target="_blank" rel="noopener" title="${esc(Documents.fileNameOf(d.link))}">Open${icon('external-link')}</a>` : '';
      return `<div class="record-doc">${Parts.file(d.url?.kind, d.link ? '' : 'is-empty')}
          <div class="record-doc-text"><a class="record-doc-name" href="${esc(Shell.recordHref(d.record))}">${esc(d.name)}</a>
            ${meta ? `<div class="record-doc-meta">${meta}</div>` : ''}</div>
          ${Parts.docStatus(d.status)}${open}</div>`;
    }).join('')}</div>`;
  }

  // The record's dates as the agenda groups them (overdue, this week, the next 30 days, later, past), each
  // the agenda's row, without the record itself among whose it is.
  function datesTab(id) {
    const dates = datesOf(id);
    if (!dates.length) return Parts.empty({ title: 'No dates yet', desc: 'Dates entered or worked out for this record show up here.', action: { label: 'Add date', cmd: 'record.add-date' } });
    const groups = Agenda.grouped(dates).filter(g => g.events.length);
    return `<div class="record-dates">${groups.map(g => `<div class="record-group${g.id === 'overdue' ? ' is-overdue' : ''}">${esc(g.name)}</div>
      <div class="ev-list">${g.events.map(e => Agenda.row(e, { compact: true, from: id })).join('')}</div>`).join('')}</div>`;
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
    // A date in a row is short, with the full date on hover.
    const out = rec => isField(rec) && rec.field === 'date' ? Parts.dateCell(rec.value) : esc(outputPhrase(rec));
    let diff;
    if (isObject(r)) diff = `<span class="hist-note">${c.before ? 'Deleted' : 'Created'}</span>`;
    else if (!c.before) diff = isTag(r) ? `<span class="hist-note">Added${r.tag ? '' : ', ruled out'}</span>` : `<span class="hist-note">Added</span><ins>${out(r)}</ins>`;
    else if (!c.after) diff = `<span class="hist-note">Deleted</span>${isTag(r) ? '' : `<del>${out(r)}</del>`}`;
    else if (outputPhrase(c.before) !== outputPhrase(c.after)) diff = `<del>${out(c.before)}</del><span class="hist-arrow">→</span><ins>${out(c.after)}</ins>`;
    else diff = `<span class="hist-note">Renamed</span><del>${esc(c.before.edge ?? relationLabel(c.before))}</del><span class="hist-arrow">→</span><ins>${esc(c.after.edge ?? relationLabel(c.after))}</ins>`;
    return `<div class="hist-change"><span class="hist-what">${esc(what)}</span><span class="hist-diff">${diff}</span></div>`;
  }

  // How a change was made, marked only where its words don't say so ("Undid …", "Imported …"): a restore.
  const SOURCES = { undo: 'Undo', redo: 'Redo', reset: 'Reset', import: 'Import', restore: 'Restore' };
  const SAID = { undo: /^Undid\b/, redo: /^Redid\b/, reset: /^Reset\b/, import: /^Imported\b/ };
  const sourceOf = h => h.source && !SAID[h.source]?.test(h.summary) ? SOURCES[h.source] ?? h.source : '';

  function historyTab(id) {
    const list = historyFor(id);
    if (!list.length) return Parts.empty({ title: 'No changes yet', desc: 'Changes to this record show up here, with who made them and when.' });
    const shown = page.historyAll ? list : list.slice(0, HISTORY_SHOWN);
    const items = shown.map(x => `<li class="hist">
        <div class="hist-head">${Parts.avatar(x.h.who)}<span class="hist-who">${esc(x.h.who)}</span>${Parts.when(x.h.when)}${sourceOf(x.h) ? Parts.badge(sourceOf(x.h)) : ''}</div>
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
    const target = page.reveal === 'required' ? document.querySelector('#panel .row.is-required, #panel .rel-value.is-required')
      : document.querySelector(`#panel [data-entry="${CSS.escape(page.reveal)}"] > .row`);
    page.reveal = null;
    if (!target) return;
    target.scrollIntoView({ block: 'nearest' });
    target.classList.add('is-revealed');
    (target.matches('[data-action]') ? target : target.querySelector('[data-action="fill-required"]'))?.focus({ preventScroll: true });
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
    const shown = !hiddenHere().has(id);
    return [
      address && `<a class="btn btn-sm btn-primary" href="${esc(SharePoint.openUrl(address))}" target="_blank" rel="noopener" title="${esc(documentName(address))}">Open document${icon('external-link')}</a>`,
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
    const h = readHash(hash);
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
