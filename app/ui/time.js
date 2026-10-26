// The time (dendra.md, Time and Change; Part 2, Time): the chart's own days, named as the chart says them; the
// date control's calendar; the strip under the view that scrubs through those days; a view keeping a date; and
// History, the log read back in the inspector's place.
//
// The shell keeps the time: Shell.time is null for today, { asOf } for a day, or { stood, at } for the chart
// as it stood just after a change. This part registers the days as the shell's 'time' and opens its own
// calendar from the title bar's date. A view keeps a date with an As Of note at its View object, and showing
// the view shows that day. History's Restore reverses a change; Esc comes back to now.

const Time = (() => {
  const { html, signal, computed } = Shell;
  const { useEffect, useLayoutEffect, useRef, useState } = preactHooks;
  const { render } = preact;
  const { nameOf, shortOf, whose, sides } = Table.words;
  const dayOf = iso => new Date(iso + 'T12:00:00');
  const short = iso => dayOf(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const monthDay = iso => dayOf(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const isoOf = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const show = d => Shell.at(!d || d === Log.today() ? null : { asOf: d }, { replace: !!Shell.time.peek()?.asOf });
  const list = xs => xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`;
  const latest = (a, b) => (b.since ?? '') >= (a.since ?? '') ? b : a;
  const TYPES = ['chart', 'spec', 'record', 'note', 'shape'];

  // What a record is, as the chart says it: [what, whose], from records keyed by id.
  function said(recs, id, N) {
    const r = recs[id];
    if (!r) return ['', ''];
    if (Tree.isObject(r)) return [r.kind, nameOf(recs, id)];
    if (r.args) return [N.name(Tree.treeOf(recs, id) ?? { args: r.args.map(a => ({ edge: a.edge, loc: {} })) }), sides(recs, id, N, shortOf).join(' → ')];
    return [r.edge, recs[r.at] ? whose(recs, r.at, N) : ''];
  }

  // ---- The chart's days: when something starts or ends ----
  const events = computed(() => {
    App.version.value;
    const c = App.chart.value, wb = App.shown.value, N = App.notes.value;
    if (!c) return [];
    const rows = wb.rows(c).filter(r => 'record' in r), recs = {}, out = new Map();
    for (const r of rows) { const { id, record, ...rec } = r; recs[record] = recs[record] ? latest(recs[record], rec) : rec; }
    const add = (d, [what, of]) => { if (!out.has(d)) out.set(d, new Map()); out.get(d).set(what + '·' + of, { what, of }); };
    for (const r of rows) for (const d of [r.since, r.before]) if (d) add(d, said(recs, r.record, N));
    for (const r of rows) if (r.field === 'date' && r.at && recs[r.at]) {
      const t = Tree.treeOf(recs, r.record);
      if (t && (N.isStart(t) || N.isEnd(t))) add(r.value, [r.edge, whose(recs, r.at, N)]);
    }
    return [...out].sort(([a], [b]) => a.localeCompare(b)).map(([day, m]) => ({ day, items: [...m.values()] }));
  });
  // The shell draws the date's popover and the strip under the view from these.
  Shell.register('time', { When, Strip: () => html`<div class="scrub-host"><${Strip} /></div>` });

  // ---- A view keeping a date ----
  const viewTree = Table.viewTree;
  const keptNote = id => { const n = id && App.notes.value.resolve('As Of', viewTree(id))?.note; return n && Tree.key(n.pattern) === Tree.key(viewTree(id)) ? n : null; };
  const kept = id => keptNote(id)?.value ?? null;
  function keep(id, day) {
    const tx = App.edit({ day: null }), n = keptNote(id);
    if (day) n ? tx.set(n.note, { label: 'As Of', pattern: viewTree(id), value: day }) : tx.add('note', { label: 'As Of', pattern: viewTree(id), value: day });
    else if (n) tx.remove(n.note);
    const c = tx.commit();
    if (typeof c === 'string') Shell.toast(c);
  }
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
    const step = d => { const x = new Date(y, m - 1 + d, 1); setMonth(isoOf(x).slice(0, 7)); };
    const weeks = cells.at(35).getMonth() === m - 1 ? 6 : 5;
    return html`<div class="cal">
      <div class="cal-head">
        <button class="btn icon prev" aria-label="Previous month" onClick=${() => step(-1)}>${Shell.icon('chevron')}</button>
        <span>${first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
        <button class="btn icon next" aria-label="Next month" onClick=${() => step(1)}>${Shell.icon('chevron')}</button>
      </div>
      <div class="cal-grid">
        ${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => html`<span class="wd">${d}</span>`)}
        ${cells.slice(0, weeks * 7).map(d => { const iso = isoOf(d); return html`<button
          class=${['d', d.getMonth() !== m - 1 && 'out', marked.has(iso) && 'mark', iso === today && 'today'].filter(Boolean).join(' ')}
          aria-pressed=${iso === (value ?? today)} onClick=${() => show(iso)}>${d.getDate()}</button>`; })}
      </div>
    </div>`;
  }
  function When() {
    const t = Shell.time.value, today = Log.today(), day = t?.asOf ?? today, evs = events.value;
    const [month, setMonth] = useState(day.slice(0, 7));
    const [text, setText] = useState(null);
    const listRef = useRef();
    useEffect(() => { opened.value = true; return () => { opened.value = false; }; }, []);
    useEffect(() => { setMonth(day.slice(0, 7)); setText(null); }, [day]);
    // Once the popover shows, the day shown is brought into view in the list.
    useEffect(() => { const f = requestAnimationFrame(() => { const l = listRef.current, el = l?.querySelector('[aria-pressed="true"]'); if (el) l.scrollTop = el.offsetTop - l.clientHeight / 2 + el.offsetHeight / 2; }); return () => cancelAnimationFrame(f); }, [day]);
    const marked = new Set(evs.map(e => e.day));
    const years = [...new Set(evs.map(e => e.day.slice(0, 4)))].sort().reverse();
    const view = Table.views().find(v => v.id === Shell.view.value);
    const typed = e => {
      if (e.key !== 'Enter') return;
      const d = Tree.parseDate(e.target.value);
      if (d) show(d); else e.target.classList.add('bad');
    };
    return html`<div class="date-pop">
      <div class="date-top">
        <button class="btn" aria-pressed=${!t} onClick=${() => show(null)}>Today</button>
        <input value=${text ?? Tree.formatDate(day)} spellcheck="false" onInput=${e => { setText(e.target.value); e.target.classList.remove('bad'); }} onKeyDown=${typed} />
      </div>
      <div class="date-body">
        <${Month} month=${month} setMonth=${setMonth} value=${t?.asOf} marked=${marked} />
        <div class="date-days" ref=${listRef}>
          ${years.map(y => html`<div class="yr">${y}</div>
            ${y < today.slice(0, 4) ? html`<button class="dayrow end" aria-pressed=${day === `${y}-12-31`} onClick=${() => show(`${y}-12-31`)}><span class="d">Dec 31</span><span class="w muted">Year-end</span></button>` : null}
            ${evs.filter(e => e.day.startsWith(y)).reverse().map(e => html`<button class="dayrow" aria-pressed=${e.day === day} onClick=${() => show(e.day)}>
              <span class="d">${monthDay(e.day)}</span>
              <span class="w">${e.items.map(it => html`<span class="it"><b>${it.what}</b>${it.of ? html` · ${it.of}` : null}</span>`)}</span>
            </button>`)}`)}
        </div>
      </div>
      ${t?.asOf && view ? html`<label class="date-keep"><input type="checkbox" checked=${kept(view.id) === t.asOf} onChange=${e => keep(view.id, e.target.checked ? t.asOf : null)} />Keep in ${view.name}</label>` : null}
    </div>`;
  }

  // ---- The strip: a ruler under the view with a tick for each of the chart's days; dragging scrubs ----
  const CAP = 1096;   // a longer gap is drawn as three years, with a break
  function Strip() {
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
    return html`<div class="scrub" ref=${ref} tabindex="0" role="slider" aria-label="Date" aria-valuetext=${short(cur)}
        onPointerDown=${down} onPointerMove=${e => { if (!e.buttons) setHot(nearest(e)); }} onPointerLeave=${() => setHot(null)} onKeyDown=${key}>
      ${years.map(([y, p]) => html`<span class="yr" style=${`left:${at(p)}`}>${y}</span>`)}
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
    const wb = App.wb, c = App.chart.value, rows = new Map(), recs = {};
    for (const ch of wb.changes()) for (const r of ch.adds) {
      rows.set(r.id, r);
      if (ch.chart === c && 'record' in r) { const { id, record, ...rec } = r; recs[record] = rec; }
    }
    return { rows, recs, changes: wb.changes().filter(ch => ch.chart === c) };
  });

  // A change, said from itself: what it did to which items, in the chart's words.
  function describe(c) {
    const { rows, recs } = ever.peek(), N = App.notes.peek(), items = new Map();
    const put = (r, side) => { const type = TYPES.find(k => k in r), k = type + ':' + r[type]; if (!items.has(k)) items.set(k, { type, id: r[type], was: [], now: [] }); items.get(k)[side].push(r); };
    c.removes.map(id => rows.get(id)).filter(Boolean).forEach(r => put(r, 'was'));
    c.adds.forEach(r => put(r, 'now'));
    const all = [...items.values()], touched = new Set(all.filter(i => i.type === 'record').map(i => i.id));
    const rec = i => latestOf(i.now.length ? i.now : i.was);
    const objects = all.filter(i => i.type === 'record' && Tree.isObject(rec(i)));
    const made = objects.filter(i => !i.was.length), gone = objects.filter(i => !i.now.length);
    const moved = new Set([...made, ...gone].map(i => i.id));
    const phrases = [];
    if (made.length > 1 || gone.length > 1) {
      for (const [verb, xs] of [['Added', made], ['Deleted', gone]]) if (xs.length) {
        const by = new Map();
        for (const i of xs) { const k = rec(i).kind; by.set(k, (by.get(k) ?? 0) + 1); }
        phrases.push(`${verb} ${list([...by].map(([k, n]) => n === 1 ? `1 ${k.toLowerCase()}` : `${n} ${Table.plural(k).toLowerCase()}`))}`);
      }
    }
    for (const i of all) {
      if (i.type === 'record') {
        const r = rec(i);
        if (Tree.argsOf(r).some(a => touched.has(a.at)) || (moved.size > 1 && moved.has(i.id))) continue;
        phrases.push(recordPhrase(i, r, recs, N));
      } else if (i.type === 'note') {
        const n = latestOf(i.now.length ? i.now : i.was);
        if ([...Tree.idsIn(n.pattern)].some(id => moved.has(id)) || moved.has(n.view)) continue;
        phrases.push(notePhrase(i, n, recs, N));
      } else if (i.type === 'chart' && i.now.length) phrases.push(`Named the chart ${i.now[0].name}`);
    }
    const ps = [...new Set(phrases.filter(Boolean))];
    return !ps.length ? 'Changed the chart' : ps.length === 1 ? ps[0] : `${ps[0]}, and ${ps.length - 1} more`;
  }
  const latestOf = rs => rs.reduce(latest);
  const valueText = r => 'tag' in r ? '' : 'choice' in r ? r.choice : r.field === 'date' ? short(r.value) : Tree.format(r.field, r.value);
  function recordPhrase(i, r, recs, N) {
    const [what, of] = said({ ...recs, [i.id]: r }, i.id, N), name = Tree.isObject(r) ? of : r.args ? `${what} ${of}` : `${what} of ${of}`;
    const view = same(r.kind, 'View') ? 'view ' : '';
    if (!i.was.length) return Tree.isObject(r) ? `Added ${view}${name}` : r.args ? `Added ${name}` : 'tag' in r ? `${r.tag ? 'Attested' : 'Ruled out'} ${name}` : `Set ${name} to ${valueText(r)}`;
    if (!i.now.length) return Tree.isObject(r) || r.args ? `Deleted ${view}${name}` : `Cleared ${name}`;
    const was = latestOf(i.was), ended = i.now.every(x => x.before) && !was.before;
    if (ended) return `Ended ${name} on ${short(latestOf(i.now).before)}`;
    const from = r.since && r.since !== was.since && r.since !== r.value ? ` from ${short(r.since)}` : '';
    if (Tree.isObject(r)) return `Changed ${name}`;
    if (same(r.edge, 'Name') && 'value' in r) return `Renamed ${was.value} to ${r.value}`;
    if ('tag' in r) return `${r.tag ? 'Attested' : 'Ruled out'} ${name}${from}`;
    return `Changed ${name} to ${valueText(r)}${from}`;
  }
  const same = (a, b) => Tree.same(a ?? '', b ?? '');
  function notePhrase(i, n, recs, N) {
    const of = n.pattern.id !== undefined ? nameOf(recs, n.pattern.id) : n.param ? N.listName(n.pattern, n.param) : N.name(n.pattern);
    const isView = n.pattern.id !== undefined && same(recs[n.pattern.id]?.kind, 'View');
    const inView = n.view ? ` in ${nameOf(recs, n.view)}` : '';
    const gone = !i.now.length;
    switch (n.label) {
      case 'Order': return isView ? 'Reordered the views' : n.view ? `Reordered ${nameOf(recs, n.view)}` : `Reordered ${of}`;
      case 'Shown': return gone ? `Reset ${of}${inView}` : `${n.value === false ? 'Hid' : 'Showed'} ${of}${inView}`;
      case 'Position': return `Moved ${of}${inView}`;
      case 'Formula': return gone ? `Deleted the formula of ${of}` : i.was.length ? `Changed the formula of ${of}` : `Defined ${of}`;
      case 'Name': return gone ? `Unnamed ${of}` : i.was.length ? `Renamed ${latestOf(i.was).value} to ${n.value}` : `Named ${of} ${n.value}`;
      case 'As Of': return gone ? `Stopped keeping a date in ${of}` : `Kept ${short(n.value)} in ${of}`;
      case 'Required': case 'Start': case 'End': case 'Description': return `${gone ? 'Removed' : 'Changed'} ${n.label} of ${of}`;
      default: return `Changed ${n.label}${n.pattern.id !== undefined || isView ? ' of ' : ' for '}${of}${inView}`;
    }
  }

  // The items deleted and not restored, each with the change that deleted it: things at something also
  // deleted go with it, and only records and definitions are listed.
  function deleted() {
    const { recs } = ever.peek(), N = App.notes.peek(), gone = App.wb.deleted(App.chart.peek());
    const ids = new Set(gone.map(d => d.item));
    return gone.filter(d => d.type === 'record' ? !Tree.argsOf(recs[d.item] ?? {}).some(a => ids.has(a.at)) : d.type === 'note' && d.rows[0]?.label === 'Formula')
      .map(d => {
        const change = ever.peek().changes.find(c => c.id === d.change);
        const r = recs[d.item], [what, of] = d.type === 'record' ? said(recs, d.item, N) : ['Formula', N.name(d.rows[0].pattern)];
        return { ...d, text: r && Tree.isObject(r) ? of : of ? `${what} · ${of}` : what, who: change?.who, when: change?.when };
      }).sort((a, b) => (b.when ?? '').localeCompare(a.when ?? ''));
  }

  const open = signal(false), mode = signal('all');
  // Picking a change shows the chart as it stood just after it; back at now, the view picked from shows again,
  // though while it stood the window may have shown another (a view not yet made then).
  let home = null;
  const stand = c => { if (!Shell.time.peek()?.stood) home = Shell.view.peek(); Shell.at({ stood: c.id, at: c.when }); };
  function now() {
    if (Shell.time.peek()?.stood) Shell.at(null);
    if (home && home !== Shell.view.peek() && Table.views().some(v => v.id === home)) Shell.show(home, { replace: true });
    home = null;
  }
  const restore = id => {
    const c = App.wb.reverse(id, App.who());
    if (typeof c === 'string') return Shell.toast(c);
    now();
    if (c) Shell.toast('Restored 1 change', { undo: () => Shell.parts.peek().undo?.undo() });
  };
  const dayLabel = when => {
    const d = new Date(when), k = isoOf(d), today = Log.today(), y = isoOf(new Date(Date.now() - 864e5));
    return k === today ? 'Today' : k === y ? 'Yesterday' : Tree.formatDate(k);
  };
  const clock = when => new Date(when).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  function History() {
    const t = Shell.time.value, sel = Shell.selection.value, E = ever.value, m = mode.value, ref = useRef();
    const { recs } = E;
    const focus = sel.filter(id => recs[id]);
    const near = focus.length ? Tree.dependents(recs, focus) : null;
    const touches = c => [...c.adds, ...c.removes.map(id => E.rows.get(id)).filter(Boolean)]
      .some(r => near.has(r.record) || ('note' in r && [...Tree.idsIn(r.pattern)].some(id => near.has(id))));
    const changes = m === 'all' ? E.changes.filter(c => !near || touches(c)).reverse() : [];
    const gone = m === 'deleted' ? deleted().filter(d => !near || near.has(d.item)) : [];
    useLayoutEffect(() => { ref.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'center' }); }, [t?.stood]);
    let lastDay = null;
    return html`<div class="hist">
      <div class="hist-head">
        <span class="title">History</span>
        <div class="menu-seg">${[['all', 'Changes'], ['deleted', 'Deleted']].map(([k, label]) => html`<button aria-pressed=${m === k} onClick=${() => { mode.value = k; }}>${label}</button>`)}</div>
        <button class="btn icon" aria-label="Close" data-tip="Close" data-keys="Esc" onClick=${close}>${Shell.icon('x')}</button>
      </div>
      ${focus.length ? html`<div class="hist-focus"><span>${focus.map(id => nameOf(recs, id) || said(recs, id, App.notes.peek()).join(' · ')).join(', ')}</span>
        <button class="btn icon" aria-label="Every change" data-tip="Every change" onClick=${() => Shell.select([])}>${Shell.icon('x')}</button></div>` : null}
      <div class="hist-list" ref=${ref}>
        ${m === 'all' ? changes.map(c => {
          const day = dayLabel(c.when), head = day !== lastDay ? html`<div class="hist-day">${day}</div>` : null, on = t?.stood === c.id;
          lastDay = day;
          return html`${head}<div class="hist-row" role="button" aria-selected=${on} onClick=${() => on ? now() : stand(c)}>
            <div class="what">${describe(c)}</div>
            <div class="meta">${c.who} · ${clock(c.when)}</div>
            ${on ? html`<button class="btn" disabled=${!App.wb.canReverse(c.id)} onClick=${e => { e.stopPropagation(); restore(c.id); }}>Restore</button>` : null}
          </div>`;
        }) : gone.map(d => html`<div class="hist-row gone">
            <div class="what">${d.text}</div>
            <div class="meta">${d.who} · ${d.when ? short(isoOf(new Date(d.when))) : ''}</div>
            <button class="btn" onClick=${() => restore(d.change)}>Restore</button>
          </div>`)}
        ${(m === 'all' ? changes : gone).length ? null : html`<div class="empty">${m === 'all' ? 'No changes' : 'Nothing deleted'}</div>`}
      </div>
    </div>`;
  }
  // History takes the inspector's place while it's open.
  let host = null;
  function openHistory() {
    if (host) return;
    const aside = document.querySelector('.shell .inspector');
    if (!aside) return;
    host = document.createElement('div');
    host.className = 'hist-host';
    aside.appendChild(host);
    aside.scrollTop = 0;
    open.value = true;
    render(html`<${History} />`, host);
  }
  function close() {
    if (!host) return;
    render(null, host);
    host.remove();
    host = null;
    open.value = false;
    now();
  }
  Shell.register('action', { id: 'history', name: 'History', menu: 'chart', order: 10, run: () => open.peek() ? close() : openHistory() });
  // Esc: from a change picked back to now, then out of History.
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || e.defaultPrevented || !open.peek() || document.querySelector('dialog[open]') || e.target.closest?.('input, textarea, .tabulator-editing')) return;
    e.preventDefault();
    e.stopPropagation();
    if (Shell.time.peek()?.stood) now(); else close();
  }, true);

  return { events, describe, deleted, kept, keep, open: openHistory, close };
})();
