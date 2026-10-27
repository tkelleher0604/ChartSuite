// The time (dendra.md, Time and Change; Part 2, Time): the chart's own days, named as the chart says them; the
// date control's calendar; a ruler at the view's foot that scrubs through those days while another day is
// shown; a view keeping a date (its As Of note); and History, the log read back in the inspector's place.
const Time = (() => {
  const { html, signal, computed } = Shell;
  const { useEffect, useLayoutEffect, useRef, useState } = preactHooks;
  const dayOf = iso => new Date(iso + 'T12:00:00');
  const short = iso => Tree.formatDate(iso, 'short');
  const monthDay = iso => { const [, m, d] = iso.split('-'); return `${Tree.MONTHS[m - 1].slice(0, 3)} ${+d}`; };
  const show = d => Shell.at(!d || d === Log.today() ? null : { asOf: d }, { replace: !!Shell.time.peek()?.asOf });
  const list = xs => xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`;
  const viewTree = id => ({ id, kind: 'View' });

  // What a record is, as the chart says it: [what, whose], whose by the place rule (Notes: segmentOf, and
  // whereOf, an entry's place as far as it needs, as the formula bar says it) or, worded, in words (see whose).
  function said(recs, id, N, worded = false) {
    const r = recs[id];
    if (!r) return ['', ''];
    if (Tree.isObject(r)) return [r.kind, N.nameOf(recs, id)];
    if (r.args) return [N.nameOf(recs, id), worded ? whose(recs, id, N) : N.segmentOf(recs, id)];
    return [r.edge, !recs[r.at] ? '' : worded ? whose(recs, r.at, N) : N.whereOf(recs, r)];
  }
  // Whose a record is, in words, for a list of dates: an object by its short name, a relation by the place
  // rule (Notes.segmentOf: Margaret A. Chen → The BDC; AIV-1, tax year 2025), with its option and what it's
  // under in parentheses (The BDC (Regulation D Offering); Margaret A. Chen → The BDC (Director)).
  function whose(recs, id, N = App.notes.peek()) {
    const [head, ...under] = Tree.pathOf(recs, id), r = recs[head];
    if (!r) return '';
    const step = x => { const s = recs[x]; return Tree.isChoice(s) ? s.choice : Tree.isTag(s) && !s.tag ? `not ${s.edge}` : s.edge; };
    const qs = [...(r.args && Tree.isChoice(r) ? [r.choice] : []), ...under.map(step)];
    return `${r.args ? N.segmentOf(recs, head) : N.shortOf(recs, head)}${qs.length ? ` (${qs.join(', ')})` : ''}`;
  }
  // Every version of every record a log's rows hold, the latest standing for each.
  function recordsOf(rows) {
    const recs = {};
    for (const r of rows) if ('record' in r) {
      const { id, record, ...rec } = r;
      if (!recs[record] || (rec.since ?? '') >= (recs[record].since ?? '')) recs[record] = rec;
    }
    return recs;
  }

  // ---- The chart's days: when something starts or ends, or a date entered says something happened ----
  const events = computed(() => {
    App.version.value;
    const c = App.chart.value, wb = App.shown.value, N = App.notes.value;
    if (!c) return [];
    const rows = wb.rows(c).filter(r => 'record' in r), recs = recordsOf(rows), out = new Map();
    const add = (d, [what, of]) => { if (!out.has(d)) out.set(d, new Map()); out.get(d).set(what + '·' + of, { what, of }); };
    for (const r of rows) for (const d of [r.since, r.before]) if (d) add(d, said(recs, r.record, N, true));
    for (const r of rows) if (r.field === 'date' && r.at && recs[r.at]) add(r.value, [r.edge, whose(recs, r.at, N)]);
    return [...out].sort(([a], [b]) => a.localeCompare(b)).map(([day, m]) => ({ day, items: [...m.values()] }));
  });
  // The shell draws the date's popover and the ruler under the view from these, and comes back to today, from
  // a day or from the log as it stood, by the last.
  Shell.register('time', { When, Ruler, today: () => Shell.time.peek()?.stood ? now() : show(null) });

  // ---- A view keeping a date ----
  const kept = id => App.views.peek().find(v => v.id === id)?.keeps ?? null;
  const keep = (id, day) => App.change(tx => tx.note('As Of', viewTree(id), day ?? undefined), { dated: false });
  // Showing a view that keeps a date shows that day; leaving it for one that doesn't comes back to today.
  let lastView = null;
  Shell.on('view-switch', id => {
    const t = Shell.time.peek(), was = kept(lastView), keeps = kept(id);
    lastView = id;
    if (t?.stood) return;
    if (keeps && t?.asOf !== keeps) Shell.at({ asOf: keeps }, { replace: true });
    else if (!keeps && was && t?.asOf === was) Shell.at(null, { replace: true });
  });

  // ---- The date control: today, or a day from a calendar beside the chart's own days ----
  const opened = signal(false);
  function Month({ month, setMonth, value, marked }) {
    const [y, m] = month.split('-').map(Number), first = new Date(y, m - 1, 1), today = Log.today();
    const cells = Array.from({ length: 42 }, (_, i) => new Date(y, m - 1, 1 - first.getDay() + i));
    const step = d => setMonth(Tree.isoOf(new Date(y, m - 1 + d, 1)).slice(0, 7));
    const weeks = cells.at(35).getMonth() === m - 1 ? 6 : 5;
    return html`<div class="cal">
      <div class="cal-head">
        <button class="btn icon prev" aria-label="Previous month" onClick=${() => step(-1)}>${Shell.icon('chevron')}</button>
        <span>${Tree.formatDate(month + '-01', 'month')}</span>
        <button class="btn icon next" aria-label="Next month" onClick=${() => step(1)}>${Shell.icon('chevron')}</button>
      </div>
      <div class="cal-grid">
        ${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => html`<span class="wd">${d}</span>`)}
        ${cells.slice(0, weeks * 7).map(d => { const iso = Tree.isoOf(d); return html`<button
          class=${['d', d.getMonth() !== m - 1 && 'out', marked.has(iso) && 'mark', iso === today && 'today'].filter(Boolean).join(' ')}
          aria-pressed=${iso === (value ?? today)} onClick=${() => show(iso)}>${d.getDate()}</button>`; })}
      </div>
    </div>`;
  }
  function When({ close }) {
    const t = Shell.time.value, today = Log.today(), day = t?.asOf ?? today, evs = events.value;
    const [month, setMonth] = useState(day.slice(0, 7));
    const [text, setText] = useState(null);
    const listRef = useRef();
    useEffect(() => { opened.value = true; return () => { opened.value = false; }; }, []);
    useEffect(() => { setMonth(day.slice(0, 7)); setText(null); }, [day]);
    // Once the popover shows, the list, which runs back from the latest, opens at the day shown or the last of
    // the chart's days before it, under its year.
    useEffect(() => {
      const l = listRef.current, rows = l ? [...l.querySelectorAll('[data-day]')] : [], el = rows.find(r => r.dataset.day <= day) ?? rows.at(-1);
      if (el) l.scrollTop = el.offsetTop - (l.querySelector('.yr')?.offsetHeight ?? 0);
    }, [day]);
    const marked = new Set(evs.map(e => e.day));
    const years = [...new Set(evs.map(e => e.day.slice(0, 4)))].sort().reverse();
    const view = App.views.value.find(v => v.id === Shell.view.value);
    // The day is typed over as soon as the calendar opens; one entered is shown, and the calendar closes on it,
    // the Enter going no further than the field (not on to the date's button, which would open it again).
    const typed = e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const d = Tree.parseDate(e.target.value);
      if (d) { show(d); close(); } else e.target.classList.add('bad');
    };
    return html`<div class="date-pop">
      <div class="date-top">
        <button class="btn" aria-pressed=${!t} onClick=${() => show(null)}>Today</button>
        <input aria-label="Date" autofocus value=${text ?? Tree.formatDate(day)} spellcheck="false" onFocus=${e => e.target.select()}
          onInput=${e => { setText(e.target.value); e.target.classList.remove('bad'); }} onKeyDown=${typed} />
      </div>
      <div class="date-body">
        <${Month} month=${month} setMonth=${setMonth} value=${t?.asOf} marked=${marked} />
        <div class="date-days" ref=${listRef}>
          ${years.map(y => html`<div class="yr">${y}</div>
            ${y < today.slice(0, 4) && !marked.has(`${y}-12-31`) ? html`<button class="dayrow end" data-day=${`${y}-12-31`} aria-pressed=${day === `${y}-12-31`} onClick=${() => show(`${y}-12-31`)}><span class="d">Dec 31</span><span class="w muted">Year-end</span></button>` : null}
            ${evs.filter(e => e.day.startsWith(y)).reverse().map(e => html`<button class="dayrow" data-day=${e.day} aria-pressed=${e.day === day} onClick=${() => show(e.day)}>
              <span class="d">${monthDay(e.day)}</span>
              <span class="w">${e.items.map(it => html`<span class="it"><b>${it.what}</b>${it.of ? html` · ${it.of}` : null}</span>`)}</span>
            </button>`)}`)}
        </div>
      </div>
      ${t?.asOf && view && !App.readOnly.value ? html`<label class="date-keep"><input type="checkbox" checked=${view.keeps === t.asOf} onChange=${e => keep(view.id, e.target.checked ? t.asOf : null)} />Keep in ${view.name}</label>` : null}
    </div>`;
  }

  // ---- The ruler: at the view's foot, a tick for each of the chart's days; dragging scrubs ----
  const CAP = 1096;   // a longer gap is drawn as three years, with a break
  // Its width, measured as it's drawn and whenever it's resized: a year's label sits after its line, and where
  // it has no room there, the line stands alone.
  const width = signal(0), measure = new ResizeObserver(es => { for (const e of es) if (e.target.isConnected) width.value = e.contentRect.width; });
  let measured = null;
  function Ruler() {
    const t = Shell.time.value, today = Log.today(), evs = events.value;
    const [hot, setHot] = useState(null);
    const ref = useRef();
    if (!(t?.asOf || opened.value) || !evs.length) return null;
    const days = [...new Set([...evs.map(e => e.day), today, ...(t?.asOf ? [t.asOf] : [])])].sort(), items = new Map(evs.map(e => [e.day, e.items]));
    // Days are placed by how far apart they are, a long gap shortened and marked with a break; Jan 1 of each
    // year inside an unbroken gap is labeled.
    const pos = [0], breaks = [], years = [];
    for (let i = 1; i < days.length; i++) {
      const gap = (dayOf(days[i]) - dayOf(days[i - 1])) / 864e5;
      pos.push(pos[i - 1] + Math.min(gap, CAP));
      if (gap > CAP) { breaks.push((pos[i - 1] + pos[i]) / 2); continue; }
      for (let y = +days[i - 1].slice(0, 4) + 1; y <= +days[i].slice(0, 4); y++)
        years.push([y, pos[i - 1] + (dayOf(`${y}-01-01`) - dayOf(days[i - 1])) / 864e5]);
    }
    const span = pos.at(-1) || 1, at = p => `calc(16px + (100% - 32px) * ${p / span})`;
    const nearest = e => {
      const r = ref.current.getBoundingClientRect(), p = (e.clientX - r.left - 16) / Math.max(1, r.width - 32) * span;
      let best = 0;
      pos.forEach((x, i) => { if (Math.abs(x - p) < Math.abs(pos[best] - p)) best = i; });
      return days[best];
    };
    const down = e => {
      if (e.button !== 0) return;
      const el = e.currentTarget;
      el.setPointerCapture(e.pointerId);
      let first = true;
      const go = ev => { const d = nearest(ev); setHot(d); Shell.at(d === today ? null : { asOf: d }, { replace: !first }); first = false; };
      go(e);
      const move = ev => go(ev), up = () => { el.removeEventListener('pointermove', move); setHot(null); };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up, { once: true });
    };
    const key = e => {
      const i = days.indexOf(t?.asOf ?? today), d = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
      if (!d) return;
      e.preventDefault();
      show(days[Math.max(0, Math.min(days.length - 1, i + d))]);
    };
    const cur = t?.asOf ?? today, tip = hot ?? cur, its = items.get(tip) ?? [], tx = pos[days.indexOf(tip)] / span;
    return html`<div class="scrub" ref=${el => { ref.current = el; if (el && el !== measured) { measure.disconnect(); measure.observe(measured = el); width.value = el.clientWidth; } }} tabindex="0" role="slider" aria-label="Date" aria-valuetext=${short(cur)}
        onPointerDown=${down} onPointerMove=${e => { if (!e.buttons) setHot(nearest(e)); }} onPointerLeave=${() => setHot(null)} onKeyDown=${key}>
      ${years.map(([y, p]) => html`<span class="yr" style=${`left:${at(p)}`}>${width.value && (width.value - 32) * (1 - p / span) < 36 ? '' : y}</span>`)}
      ${breaks.map(p => html`<span class="brk" style=${`left:${at(p)}`} />`)}
      ${days.map((d, i) => html`<i class=${d === cur ? 'on' : d === hot ? 'hot' : d === today ? 'now' : ''} style=${`left:${at(pos[i])}`} />`)}
      <span class=${'scrub-tip' + (tx < .2 ? ' l' : tx > .8 ? ' r' : '')} style=${`left:${at(pos[days.indexOf(tip)])}`}>
        <b>${tip === today ? 'Today' : short(tip)}</b>${its[0] ? html` · ${its[0].what}${its[0].of ? ` · ${its[0].of}` : ''}${its.length > 1 ? ` · ${its.length - 1} more` : ''}` : null}
      </span>
    </div>`;
  }

  // ---- History: the log, read back ----
  // Every row ever added, and every record's latest version, live or not, so deleted things still have names.
  const ever = computed(() => {
    App.version.value;
    const wb = App.wb, c = App.chart.value, rows = new Map(), by = new Map(), mine = [];
    for (const ch of wb.changes()) for (const r of ch.adds) { rows.set(r.id, r); by.set(r.id, ch.id); if (ch.chart === c) mine.push(r); }
    return { rows, by, recs: recordsOf(mine), changes: wb.changes().filter(ch => ch.chart === c) };
  });
  // History's entries: each change, with the changes that took it back and put it back again. An Undo is one
  // entry with what it undid, struck, and a Redo puts it back; a change reversed after others have been made
  // since (a Restore) is an entry of its own. Each entry is { change, chain }: the change first, then each
  // reversal of the one before it, the last of them standing in the log.
  const entries = computed(() => {
    const out = [], by = new Map();
    for (const c of ever.value.changes) {
      const e = c.reverses && by.get(c.reverses), at = e ? out.indexOf(e) : -1;
      if (e && out.slice(at + 1).every(undone)) { e.chain.push(c); by.set(c.id, e); }
      else { const n = { change: c, chain: [c] }; out.push(n); by.set(c.id, n); }
    }
    return out;
  });
  const undone = e => e.chain.length % 2 === 0;

  // A change, said from itself: what it did to which items, in the chart's words, what it records read where it
  // records it. What a reversal or a restore brings back is restored.
  function describe(c) {
    const { rows, recs: logged } = ever.peek(), own = recordsOf(c.adds), N = App.notes.peek(), items = new Map(), back = !!(c.reverses || c.restores);
    const recs = Object.keys(own).every(id => id in logged) ? logged : { ...logged, ...own };
    const put = (r, side) => { const type = Log.typeOf(r), k = type + ':' + r[type]; if (!items.has(k)) items.set(k, { type, id: r[type], was: [], now: [] }); items.get(k)[side].push(r); };
    c.removes.map(id => rows.get(id)).filter(Boolean).forEach(r => put(r, 'was'));
    c.adds.forEach(r => put(r, 'now'));
    const all = [...items.values()], rec = i => Log.latest(i.now.length ? i.now : i.was);
    // A relation a definition works out, entered with something recorded at it (a tax year, with its payment), was
    // entered to bear it: what's at it is said, at its place; and so when they go together.
    const worked = i => { const r = rec(i); return r.args && 'tag' in r && App.definitions.peek().some(d => Tree.same(d.name, N.nameOf(recs, i.id))); };
    const bearers = new Set(all.filter(i => i.type === 'record' && !(i.was.length && i.now.length) && all.some(j => j.type === 'record' && rec(j).at === i.id) && worked(i)).map(i => i.id));
    const touched = new Set(all.filter(i => i.type === 'record' && !bearers.has(i.id)).map(i => i.id));
    // Tidy takes a view's positions away, and undoing it puts them back.
    if (all.length > 1 && all.every(i => i.type === 'note' && rec(i).label === 'Position')) {
      if (!c.adds.length) return 'Tidied the layout';
      if (back && !c.removes.length) return 'Restored the layout';
    }
    const objects = all.filter(i => i.type === 'record' && Tree.isObject(rec(i)));
    const made = objects.filter(i => !i.was.length), gone = objects.filter(i => !i.now.length);
    const moved = new Set([...made, ...gone].map(i => i.id));
    // A view made or deleted goes by the Name note that goes with it.
    const named = id => all.find(i => i.type === 'note' && rec(i).label === 'Name' && rec(i).pattern.id === id);
    const phrases = [];
    // Boxes and lines hidden in a view, as the chart's Delete says it: a box by its name, a line as its relation's,
    // several counted.
    const box = p => p.id in recs && !Tree.isView(recs[p.id]), line = p => !!p.args && Tree.idsIn(p).size > 0;
    const hid = all.filter(i => i.type === 'note' && i.now.length && rec(i).label === 'Shown' && rec(i).value === false && rec(i).view && !moved.has(rec(i).view)
      && (box(rec(i).pattern) || line(rec(i).pattern)) && ![...Tree.idsIn(rec(i).pattern)].some(id => moved.has(id)));
    for (const view of new Set(hid.map(i => rec(i).view))) {
      const ps = hid.filter(i => rec(i).view === view).map(i => rec(i).pattern);
      // A line by its relation and its ends, as the canvas's toast says it: the Ownership line from Northstar to Northpine.
      const lineOf = p => { const k = Tree.key(Tree.bare(p)), id = Object.keys(recs).find(x => recs[x].args && Tree.key(Tree.bare(Tree.treeOf(recs, x) ?? {})) === k), [a, b] = id ? N.placed(recs, id) : [];
        return `the ${N.name(p)} line${a && b ? ` from ${a.text} to ${b.text}` : ''}`; };
      const what = ps.length === 1 ? (ps[0].args ? lineOf(ps[0]) : N.nameOf(recs, ps[0].id))
        : ps.every(p => p.args) ? `${ps.length} lines` : ps.some(p => p.args) ? `${ps.length} items` : `${ps.length} boxes`;
      phrases.push(`Hid ${what} in ${N.nameOf(recs, view)}`);
    }
    if (made.length > 1 || gone.length > 1) {
      for (const [verb, xs] of [[back ? 'Restored' : 'Added', made], ['Deleted', gone]]) if (xs.length) {
        const by = new Map();
        for (const i of xs) { const k = rec(i).kind; by.set(k, (by.get(k) ?? 0) + 1); }
        phrases.push(`${verb} ${list([...by].map(([k, n]) => n === 1 ? `1 ${k.toLowerCase()}` : `${n} ${Tree.plural(k).toLowerCase()}`))}`);
      }
    }
    for (const i of all) {
      if (i.type === 'record') {
        const r = rec(i);
        if (bearers.has(i.id) || Tree.argsOf(r).some(a => touched.has(a.at)) || (moved.size > 1 && moved.has(i.id))) continue;
        phrases.push(recordPhrase(i, r, recs, N, named(i.id), back));
      } else if (i.type === 'note') {
        const n = rec(i);
        if (hid.includes(i) || [...Tree.idsIn(n.pattern)].some(id => moved.has(id)) || moved.has(n.view)) continue;
        phrases.push(notePhrase(i, n, recs, N));
      } else if (i.type === 'shape') {
        // A page's title that follows the chart's name is part of renaming it.
        if (!moved.has(rec(i).view) && !(rec(i).role === 'title' && all.some(j => j.type === 'chart' && j.was.length && j.now.length))) phrases.push(shapePhrase(i, rec(i), recs, N, back));
      } else if (i.type === 'chart' && i.now.length) phrases.push(i.was.length ? `Renamed ${i.was[0].name} to ${i.now[0].name}` : `Named the chart ${i.now[0].name}`);
    }
    const ps = [...new Set(phrases.filter(Boolean))];
    return !ps.length ? 'Changed the chart' : ps.length === 1 ? ps[0] : `${ps[0]}, and ${ps.length - 1} more`;
  }
  const valueText = r => r.field === 'date' ? short(r.value) : Tree.outputText(r);
  // A record's phrase: a tag attested or ruled out, a value set, changed or cleared, a record added or deleted.
  // A relation that's a fact (Ownership) is added; one a definition works out (Control) is attested.
  function recordPhrase(i, r, recs, N, name, back) {
    const [what, of] = said(i.id in recs ? recs : { ...recs, [i.id]: r }, i.id, N);
    const it = Tree.isView(r) ? `view ${name ? Log.latest(name.now.length ? name.now : name.was).value : of}` : Tree.isObject(r) ? of : r.args ? `${what}: ${of}` : `${what} of ${of}`;
    const verdict = r.tag ? 'Attested' : 'Ruled out', added = back ? 'Restored' : 'Added';
    const fact = r.args && r.tag === true && !App.definitions.peek().some(d => Tree.same(d.name, what));
    if (!i.was.length) return Tree.isObject(r) || fact ? `${added} ${it}` : 'tag' in r ? `${verdict} ${it}` : r.args || back ? `${added} ${it}` : `Set ${it} to ${valueText(r)}`;
    if (!i.now.length) return Tree.isObject(r) || r.args ? `Deleted ${it}` : `Cleared ${it}`;
    const was = Log.latest(i.was), ended = i.now.every(x => x.before) && !was.before;
    if (ended) return `Ended ${it} on ${short(Log.latest(i.now).before)}`;
    const on = r.since && r.since !== was.since && r.since !== r.value ? ` as of ${short(r.since)}` : '';
    if (Tree.isObject(r)) return `Changed ${it}`;
    if (Tree.same(r.edge ?? '', 'Name') && 'value' in r) return `Renamed ${was.value} to ${r.value}`;
    if ('tag' in r) return `${verdict} ${it}${on}`;
    const old = valueText(was);
    return `Changed ${it} ${old && old !== valueText(r) ? `from ${old} ` : ''}to ${valueText(r)}${on}`;
  }
  // A free shape's phrase, by what it is and the view it's in.
  const SHAPES = { legend: 'the Key', text: 'a text box', line: 'a line', picture: 'a picture', group: 'a group', frame: 'a frame' };
  function shapePhrase(i, s, recs, N, back) {
    const what = SHAPES[s.geometry] ?? 'a shape', view = s.view && N.nameOf(recs, s.view);
    if (!i.was.length) return `${back ? 'Restored' : 'Added'} ${what}${view ? ` to ${view}` : ''}`;
    if (!i.now.length) return `Deleted ${what}${view ? ` from ${view}` : ''}`;
    return `Edited ${what}${view ? ` in ${view}` : ''}`;
  }
  // A style's output in a view, by its group, as the Key and the format bar's scope say it; its caption, by its
  // own name.
  const grouped = (N, n) => typeof Scene === 'undefined' ? null : n.label === 'Caption' ? Scene.outputName(N, n.pattern)
    : Scene.groupsOf(N, n.view).find(g => g.outputs.some(p => Tree.key(p) === Tree.key(n.pattern)))?.caption ?? Scene.captionOf(N, n.pattern, n.view);
  function notePhrase(i, n, recs, N) {
    const at = n.pattern.id, isView = at !== undefined && Tree.isView(recs[at] ?? {});
    const of = at !== undefined ? N.nameOf(recs, at) : n.param ? N.listName(n.pattern, n.param) : N.name(n.pattern);
    const inView = n.view ? ` in ${N.nameOf(recs, n.view)}` : '';
    const gone = !i.now.length;
    switch (n.label) {
      case 'Order': return isView ? 'Reordered the views' : n.view ? `Reordered ${N.nameOf(recs, n.view)}` : `Reordered ${of}`;
      case 'Shown': return gone ? `Reset ${of}${inView}` : `${n.value === false ? 'Hid' : 'Showed'} ${of}${inView}`;
      case 'Position': return `Moved ${of}${inView}`;
      case 'Formula': return gone ? `Deleted the formula of ${of}` : i.was.length ? `Changed the formula of ${of}` : `Defined ${of}`;
      case 'Name': return gone ? `Unnamed ${of}` : !i.was.length ? (Tree.same(of, n.value) ? `Named ${n.value}` : `Named ${of} ${n.value}`)
        : Tree.same(Log.latest(i.was).value, n.value) ? `Changed Name of ${of}` : `Renamed ${Log.latest(i.was).value} to ${n.value}`;
      case 'As Of': return gone ? `Stopped keeping a date in ${of}` : `Kept ${short(n.value)} in ${of}`;
      case 'Required': case 'Start': case 'End': case 'Description': return `${gone ? 'Removed' : 'Changed'} ${n.label} of ${of}`;
      // A look one record kept of its own, cleared, as the format bar says it.
      default: return gone && at !== undefined && Notes.FORMATS.has(n.label) ? `Cleared ${of.endsWith('s') ? `${of}’` : `${of}’s`} own ${n.label}${inView}`
        : `Changed ${n.label}${at !== undefined ? ' of ' : ' for '}${at === undefined && n.view ? grouped(N, n) ?? of : of}${inView}`;
    }
  }

  // The items deleted and not restored, each with the change that deleted it: things at something also
  // deleted go with it, only records and definitions are listed, and an addition undone was never there. A
  // change adds anew what it adds unless it brings it back: a restore, or the undoing of a change that took it.
  function deleted() {
    const { recs, rows, by, changes } = ever.peek(), N = App.notes.peek(), gone = App.wb.deleted(App.chart.peek());
    const ids = new Set(gone.map(d => d.item)), find = id => changes.find(x => x.id === id);
    const anew = c => !!c && !c.restores && (!c.reverses || (u => !!u?.reverses && anew(find(u.reverses)))(find(c.reverses)));
    const undone = d => { const c = find(d.change); return !!c?.reverses && anew(find(c.reverses)) && d.rows.every(r => by.get(r.id) === c.reverses); };
    // A deleted view goes by the last name it had.
    const viewName = id => [...rows.values()].filter(r => r.label === 'Name' && r.pattern?.id === id).at(-1)?.value;
    return gone.filter(d => !undone(d) && (d.type === 'record' ? !Tree.argsOf(recs[d.item] ?? {}).some(a => ids.has(a.at)) : d.type === 'note' && d.rows[0]?.label === 'Formula'))
      .map(d => {
        const change = changes.find(c => c.id === d.change);
        const r = recs[d.item], [what, of] = d.type === 'record' ? said(recs, d.item, N) : ['Formula', N.name(d.rows[0].pattern)];
        return { ...d, text: r && Tree.isView(r) ? viewName(d.item) ?? of : r && Tree.isObject(r) ? of : of ? `${what} · ${of}` : what, who: change?.who, when: change?.when };
      }).sort((a, b) => (b.when ?? '').localeCompare(a.when ?? ''));
  }

  const open = signal(false), mode = signal('all');
  // Picking a change shows the chart as it stood just after it; back at now, the view picked from shows again,
  // though while it stood the window may have shown another (a view not yet made then).
  let home = null, unlayer = null;
  const stand = c => { if (!Shell.time.peek()?.stood) home = Shell.view.peek(); Shell.at({ stood: c.id, at: c.when }); };
  function now() {
    if (Shell.time.peek()?.stood) Shell.at(null);
    if (home && home !== Shell.view.peek() && App.views.peek().some(v => v.id === home)) Shell.show(home, { replace: true });
    home = null;
  }
  const dayLabel = when => {
    const k = Tree.isoOf(new Date(when)), today = Log.today(), y = Tree.isoOf(new Date(Date.now() - 864e5));
    return k === today ? 'Today' : k === y ? 'Yesterday' : short(k);
  };
  const clock = when => new Date(when).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  function History() {
    const t = Shell.time.value, sel = Shell.selection.value, E = ever.value, m = mode.value, ref = useRef(), N = App.notes.value;
    const { recs } = E;
    const focus = sel.filter(id => recs[id]);
    const near = focus.length ? Tree.dependents(recs, focus) : null;
    const touches = c => [...c.adds, ...c.removes.map(id => E.rows.get(id)).filter(Boolean)]
      .some(r => near.has(r.record) || ('note' in r && [...Tree.idsIn(r.pattern)].some(id => near.has(id))));
    const changes = m === 'all' ? entries.value.filter(e => !near || touches(e.change)).reverse() : [];
    const gone = m === 'deleted' ? deleted().filter(d => !near || near.has(d.item)) : [];
    useLayoutEffect(() => { ref.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'center' }); }, [t?.stood]);
    let lastDay = null;
    return html`<div class="hist">
      <div class="hist-head">
        <span class="title">History</span>
        <div class="menu-seg">${[['all', 'Changes'], ['deleted', 'Deleted']].map(([k, label]) => html`<button aria-pressed=${m === k} onClick=${() => { mode.value = k; }}>${label}</button>`)}</div>
        <button class="btn icon" aria-label="Close" data-tip="Close" data-keys="Esc" onClick=${close}>${Shell.icon('x')}</button>
      </div>
      ${focus.length ? html`<div class="hist-focus"><span>${focus.map(id => said(recs, id, N)[1] || said(recs, id, N)[0]).join(', ')}</span>
        <button class="btn icon" aria-label="Every change" data-tip="Every change" onClick=${() => Shell.select([])}>${Shell.icon('x')}</button></div>` : null}
      <div class="hist-list" ref=${ref}>
        ${m === 'all' ? changes.map(e => {
          // An entry undone is struck, and offers to redo it; what's in the log for it now is its chain's last.
          const c = e.change, last = e.chain.at(-1), off = undone(e), day = dayLabel(c.when), head = day !== lastDay ? html`<div class="hist-day">${day}</div>` : null, on = t?.stood === c.id;
          lastDay = day;
          return html`${head}<div class=${'hist-row' + (off ? ' undone' : '')} role="button" aria-selected=${on} onClick=${() => on ? now() : stand(c)}>
            <div class="what">${describe(c)}</div>
            <div class="meta">${c.who} · ${clock(c.when)}${off ? ` · undone${last.who !== c.who ? ` by ${last.who}` : ''}` : ''}</div>
            ${on ? html`<button class="btn" disabled=${!App.wb.canReverse(last.id)} onClick=${ev => { ev.stopPropagation(); App.reverse(last.id); now(); }}>${off ? 'Redo this change' : 'Undo this change'}</button>` : null}
          </div>`;
        }) : gone.map(d => html`<div class="hist-row gone">
            <div class="what">${d.text}</div>
            <div class="meta">${d.who} · ${d.when ? dayLabel(d.when) : ''}</div>
            <button class="btn" onClick=${() => { App.restore(d.item); now(); }}>Restore</button>
          </div>`)}
        ${(m === 'all' ? changes : gone).length ? null : html`<div class="empty">${m === 'all' ? 'No changes' : 'Nothing deleted'}</div>`}
      </div>
    </div>`;
  }
  // History takes the inspector's place while it's open. Esc comes back from a change picked to now, and
  // then closes it.
  function openHistory() {
    if (open.peek()) return;
    open.value = true;
    Shell.aside(History);
    unlayer = Shell.layer(() => Shell.time.peek()?.stood ? now() : close());
  }
  function close() {
    if (!open.peek()) return;
    open.value = false;
    Shell.aside(null);
    unlayer();
    now();
  }
  Shell.register('action', { id: 'history', name: 'History', menu: 'chart', order: 10, run: () => open.peek() ? close() : openHistory() });

  return { events, whose, describe, keep, open: openHistory, close };
})();
