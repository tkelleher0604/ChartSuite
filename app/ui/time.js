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
  // The record a note's pattern is that record's own tree: a box's by its id, a line's by its relation's sides.
  const recordAt = (recs, p) => p.id !== undefined ? p.id : (k => Object.keys(recs).find(x => recs[x].args && Tree.key(Tree.bare(Tree.treeOf(recs, x) ?? {})) === k))(Tree.key(Tree.bare(p)));
  // A line, by its relation at its place, as the formula bar and History say it: Ownership: The BDC → Northpine
  // Software, LLC.
  const lineOf = (recs, p, N) => { const id = recordAt(recs, p); return id ? `${N.nameOf(recs, id)}: ${N.segmentOf(recs, id)}` : N.name(p); };
  // Whose a note at one record is: a box's by its name, a line's as lineOf says it.
  const ownerOf = (recs, p, N) => p.args ? lineOf(recs, p, N) : N.nameOf(recs, p.id);
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
  // The shell draws the date's popover and the ruler under the view from these, and comes back from a look at another day
  // to the day the page keeps, or to today, from a day or from the log as it stood, by the last; `away`, whether there's
  // anything to come back from.
  Shell.register('time', { When, Ruler, Band, away, newSinceToday, today: () => Shell.time.peek()?.stood ? now() : kept(Shell.view.peek()) ? Shell.at({ asOf: kept(Shell.view.peek()) }) : show(null) });

  // ---- A page's day (dendra.md, Views): its As Of if it keeps one; else the session's day ----
  const kept = id => App.views.peek().find(v => v.id === id)?.keeps ?? null;
  // The day of the pages that keep none: the day shown on one of them, which a look at another day on a page that keeps
  // one leaves as it was. So nothing about the tab you stand on changes another page.
  let lastView = null, floating = null, arrived = false;
  const go = id => {
    const t = Shell.time.peek(), to = kept(id) ?? floating;
    if (!t?.stood && (t?.asOf ?? null) !== to) Shell.at(to ? { asOf: to } : null, { replace: true });
  };
  // (A page opened by its address, once the workbook is, shows the day it keeps; one that keeps none, the day asked for.)
  const arrive = () => {
    const vs = App.views.peek(), v = Shell.view.peek();
    if (arrived || !vs.length || v !== lastView) return;
    arrived = true;
    if (vs.find(x => x.id === v)?.keeps) queueMicrotask(() => go(v));
    else floating = Shell.time.peek()?.asOf ?? null;
  };
  // Showing a view that keeps a date shows that day; leaving it shows the day of the rest.
  Shell.on('view-switch', id => { lastView = id; if (arrived) go(id); else arrive(); });
  Shell.effect(() => {
    const t = Shell.time.value, v = Shell.view.value, vs = App.views.value;
    if (!arrived) return arrive();
    if (v === lastView && !t?.stood && !vs.find(x => x.id === v)?.keeps) floating = t?.asOf ?? null;
  });
  // Whether the day shown is a look: another than the day the page shown keeps.
  const looking = () => { const t = Shell.time.value, k = App.views.value.find(v => v.id === Shell.view.value)?.keeps; return !!k && !t?.stood && (t?.asOf ?? Log.today()) !== k; };
  function away() { const t = Shell.time.value; return !t && !looking() ? null : looking() ? 'Back' : t.stood || !App.views.value.find(v => v.id === Shell.view.value)?.keeps ? 'Today' : null; }
  // The day a page is drawn as of when it isn't the one shown: an export's, each page at its own.
  const pageDay = id => Shell.time.peek()?.stood ? App.day.peek() : kept(id) ?? floating ?? Log.today();
  // Keeping a day: what the page shows from then on, which the rest no longer follow; let go, it's the day of the rest.
  function keep(id, day) {
    const name = App.views.peek().find(v => v.id === id)?.name;
    const c = App.change(tx => tx.note('As Of', viewTree(id), day ?? undefined), { dated: false, say: day ? `${name} keeps ${short(day)}` : `${name} keeps no day` });
    if (!c) return;
    if (id !== Shell.view.peek()) return;
    if (day) { floating = null; if ((Shell.time.peek()?.asOf ?? null) !== day) Shell.at({ asOf: day }, { replace: true }); }
    else floating = Shell.time.peek()?.asOf ?? null;
  }

  // ---- What a page marks as changed (dendra.md, Changes), a note at the view, and the look it begins in ----
  const changeNotes = view => App.wb.rows(App.chart.peek()).filter(r => 'note' in r && r.view === view && Scene.isChange(r.pattern));
  // (After the styles the view has, so what it says of a mark decides, as a look given a group goes after those in Styles; but
  // before a tag's, so what's failed stays red. `like`, the view a copy's styles are from, which the change has copied.)
  function styleChanges(tx, view, like = view) {
    if (changeNotes(like).length) return;
    for (const [what, look] of Object.entries(Scene.CHANGE_LOOKS)) {
      const p = Scene.changeOutput(what);
      for (const [label, v] of Object.entries(look)) tx.note(label, p, v, { view });
      tx.note('Caption', p, Scene.CHANGE_CAPTIONS[what], { view });
    }
    const styles = App.wb.notes(App.chart.peek()).styles(like), tagged = s => s.outputs.some(o => o.pattern.out && 'tag' in o.pattern.out);
    [...styles.filter(s => !tagged(s)), { pattern: Tree.bare(Scene.changeOutput('New')) }, ...styles.filter(tagged)]
      .forEach((s, k) => { if (s.order !== k + 1) tx.note('Order', s.pattern, k + 1, { view }); });
  }
  const changesSaid = (v, value) => !value ? `Took the changes off ${v.name}` : value.since ? `Showed the changes since ${short(value.since)} in ${v.name}` : `Showed the changes since the page before in ${v.name}`;
  // Set on a view, its look begun; taken off, its look goes with it where nobody has changed it.
  function writeChanges(tx, id, value) {
    tx.note('Changes', viewTree(id), value ?? undefined);
    if (value) return styleChanges(tx, id);
    const ns = changeNotes(id), asBegun = n => n.label === 'Order' || (n.label === 'Caption' ? Object.values(Scene.CHANGE_CAPTIONS).includes(n.value) : Object.values(Scene.CHANGE_LOOKS).some(l => l[n.label] === n.value));
    if (ns.every(asBegun)) ns.forEach(n => tx.remove(n.note));
  }
  // Comparing is looking (dendra.md, Workbook): what a page's compared with here is this window's, in no log, and goes with it
  // into an export; Keep makes it the page's, as one change, as Next step does.
  const changesKept = id => App.wb.notes(App.chart.peek()).value('Changes', viewTree(id)) ?? null;
  function showChanges(id, value) {
    const v = App.views.peek().find(x => x.id === id);
    if (!v) return;
    const same = JSON.stringify(value ?? null) === JSON.stringify(changesKept(id));
    App.looking(id, { compare: same ? undefined : { value: value ?? null, change: App.lookChange(tx => writeChanges(tx, id, value)) } }, changesSaid(v, value));
  }
  function keepChanges(id) {
    const v = App.views.peek().find(x => x.id === id), l = App.lookOf(id)?.compare;
    if (!l) return;
    if (App.readOnly.peek()) return Shell.toast(App.whyNot());
    if (App.change(tx => { writeChanges(tx, id, l.value); tx.says(changesSaid(v, l.value)); }, { dated: false, say: changesSaid(v, l.value) })) App.letGo(id, 'compare');
  }
  // The latest of the chart's days before a day: what a comparison with a date begins on.
  const dayBefore = d => events.peek().map(e => e.day).filter(x => x < d).at(-1) ?? d;

  // ---- A step (dendra.md, Views): a copy of the view keeping a day, its title the name typed ----
  function StepForm({ choice }) {
    return html`<div class="step-form">
      <label class="field"><span>Name</span><input value=${choice.name} spellcheck="false" autofocus ref=${el => el && !el.dataset.on && (el.dataset.on = 1, el.focus(), el.select())} onInput=${e => { choice.name = e.target.value; }} /></label>
      <label class="field"><span>Date</span><input value=${choice.text} spellcheck="false" onFocus=${e => e.target.select()} onInput=${e => { choice.text = e.target.value; e.target.classList.remove('bad'); }} /></label>
    </div>`;
  }
  async function nextStep(id = Shell.view.peek()) {
    if (App.readOnly.peek()) return Shell.toast(App.whyNot());
    const v = App.views.peek().find(x => x.id === id), from = pageDay(id);
    if (v?.layout !== 'chart') return Shell.toast('Show a chart first');
    // (The next of the chart's own days after this page's, the name the next of its kind: each typed over.)
    const n = 1 + Math.max(0, ...App.views.peek().map(x => +/^Step (\d+)/i.exec(x.name)?.[1] || 0));
    const choice = { name: `Step ${n}`, text: Tree.formatDate(events.peek().map(e => e.day).find(d => d > from) ?? from) };
    for (;;) {
      if (!await Shell.dialog({ title: 'Next step', width: 400, body: () => html`<${StepForm} choice=${choice} />`, actions: [{ label: 'Cancel', value: false }, { label: 'Add', value: true, primary: true }] })) return;
      const day = Tree.parseDate(choice.text), name = choice.name.trim();
      if (day && name) {
        const copy = App.addView(name, undefined, id, null, false, { title: name, say: `Added ${name}, keeping ${short(day)}`, then: (tx, made) => {
          tx.note('As Of', viewTree(made), day);
          // (What it's compared with holds still too, and the two are one plan, with one set of places.)
          if (!v.keeps) tx.note('As Of', viewTree(id), from);
          if (!v.plan) tx.note('Plan', viewTree(id), id);
          tx.note('Plan', viewTree(made), v.plan ?? id);
          tx.note('Changes', viewTree(made), { page: true });
          styleChanges(tx, made, id);
        } });
        if (copy) Shell.show(copy);
        return;
      }
      Shell.toast(!name ? 'A step needs a name' : `“${choice.text}” isn’t a date`);
    }
  }
  const chartShown = () => App.views.peek().find(x => x.id === Shell.view.peek())?.layout === 'chart', free = () => chartShown() && !App.readOnly.peek(), whyNotChart = () => App.readOnly.peek() ? App.whyNot() : 'Show a chart first';
  Shell.register('action', { id: 'view.step', name: 'Next step…', names: ['Step', 'Step plan', 'New step', 'Add step', 'Compare'], enabled: free, why: whyNotChart, run: () => nextStep() });
  const COMPARE = ['Changes', 'Compare', 'Highlight', 'What changed', 'Mark changes', 'Redline', 'Compare dates', 'Difference', 'What’s different'];
  // (They only look, so Viewing asks them too.)
  const lookFree = () => chartShown() && App.canAsk(), whyNotLook = () => App.canAsk() ? 'Show a chart first' : App.whyNot();
  Shell.register('action', { id: 'view.changes', name: 'Show changes since the page before', names: COMPARE, enabled: lookFree, why: whyNotLook, run: () => showChanges(Shell.view.peek(), { page: true }) });
  Shell.register('action', { id: 'view.changes.since', name: 'Show changes since a date', names: COMPARE, enabled: lookFree, why: whyNotLook, run: () => { Shell.select([]); Shell.showPanel(); showChanges(Shell.view.peek(), { since: dayBefore(App.day.peek()) }); } });
  Shell.register('action', { id: 'view.changes.off', name: 'Hide changes', names: COMPARE, enabled: () => lookFree() && !!App.views.peek().find(x => x.id === Shell.view.peek())?.changes, why: () => 'This page isn’t showing changes', run: () => showChanges(Shell.view.peek(), null) });

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
    // the Enter going no further than the field (not on to the date's button, which would open it again). A day
    // typed is laid out ahead as it's typed (the canvas's toward), so Enter shows it at once.
    const toward = d => Shell.parts.peek().canvas?.toward?.(d);
    useEffect(() => () => toward(null), []);
    const typed = e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const d = Tree.parseDate(e.target.value);
      if (d) { show(d); close(); } else e.target.classList.add('bad');
    };
    // At every day, today too, the page can keep it; on a page that keeps one, another day is a look.
    const can = !App.readOnly.value, tip = can ? null : App.whyNot(), name = view?.name, keeps = view?.keeps ?? null;
    const keeping = !view || t?.stood ? null : looking() ? html`<div class="date-keep"><span>${name} keeps ${short(keeps)}</span>
        <button class="btn" disabled=${!can} title=${tip} onClick=${() => keep(view.id, day)}>Keep this instead</button><button class="btn" onClick=${() => Shell.at({ asOf: keeps })}>Back</button></div>`
      : html`<label class="date-keep" title=${tip}><input type="checkbox" disabled=${!can} checked=${keeps === day} onChange=${e => keep(view.id, e.target.checked ? day : null)} />${keeps === day ? `${name} keeps ${short(day)}` : `Keep ${short(day)} in ${name}`}</label>`;
    // A day past is that day's facts by today's rules; as it stood, everything as it was (dendra.md, Time).
    const stoodThen = !t?.stood && day < today ? ever.value.changes.filter(c => c.when.slice(0, 10) <= day).at(-1) : null;
    const reads = t?.stood ? html`<div class="date-reads">As it stood: everything as it was</div>`
      : day < today ? html`<div class="date-reads"><span>As of ${short(day)}: that day’s facts, by today’s rules</span>
        ${stoodThen ? html`<button class="btn" onClick=${() => { close(); stand(stoodThen); }}>As it stood: everything as it was</button>` : null}</div>` : null;
    return html`<div class="date-pop">
      <div class="date-top">
        <button class="btn" aria-pressed=${!t} onClick=${() => show(null)}>Today</button>
        <input aria-label="Date" autofocus value=${text ?? Tree.formatDate(day)} spellcheck="false" onFocus=${e => e.target.select()}
          onInput=${e => { setText(e.target.value); e.target.classList.remove('bad'); toward(Tree.parseDate(e.target.value)); }} onKeyDown=${typed} />
      </div>
      ${keeping}
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
      ${reads}
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
    const wb = App.wb, c = App.chart.value, rows = new Map(), by = new Map(), mine = [], changes = wb.changes().filter(ch => ch.chart === c);
    for (const ch of wb.changes()) for (const r of ch.adds) { rows.set(r.id, r); by.set(r.id, ch.id); if (ch.chart === c) mine.push(r); }
    return { rows, by, recs: recordsOf(mine), changes, byId: new Map(changes.map(ch => [ch.id, ch])), at: new Map(changes.map((ch, i) => [ch.id, i])), live: new Set(wb.rows(c).map(r => r[Log.typeOf(r)])) };
  });
  // The chart's notes as they are now, whatever moment or day is shown, so an entry's words never change with where you're
  // standing; and the names of what its definitions work out.
  const notesNow = () => App.wb.notes(App.chart.peek());
  const definedBy = new WeakMap();
  const isDefined = (N, name) => {
    let s = definedBy.get(N);
    if (!s) definedBy.set(N, s = new Set(N.notes('Formula').filter(n => !n.view && n.pattern.args).map(n => Tree.norm(n.pattern.args.length > 1 ? N.name(n.pattern) : n.pattern.args[0].edge))));
    return s.has(Tree.norm(name ?? ''));
  };
  // History's entries: each change, with the changes that took it back and put it back again. An Undo is one
  // entry with what it undid, struck, and a Redo puts it back; a change reversed after others have been made
  // since is an entry of its own, which says whose it undid, and strikes that one while it stands. Each entry is
  // { change, chain, by }: the change first, then each reversal of the one before it, the last of them standing in the
  // log; and the entry of its own that reversed it, if one has.
  const entries = computed(() => {
    const out = [], by = new Map();
    for (const c of ever.value.changes) {
      const e = c.reverses && by.get(c.reverses), at = e ? out.indexOf(e) : -1;
      if (e && out.slice(at + 1).every(undone)) { e.chain.push(c); by.set(c.id, e); }
      else { const n = { change: c, chain: [c] }; if (e) e.by = n; out.push(n); by.set(c.id, n);
        // An amendment is one entry with what it amends, while it stands (dendra.md, Change).
        const was = c.amends && by.get(c.amends); if (was) { n.was = was; was.amended = n; } }
    }
    return out;
  });
  // What History lists: what's been amended stands in the amendment's entry, and comes back where that's undone.
  const standing = e => !e.amended || struck(e.amended);
  const undone = e => e.chain.length % 2 === 0;
  // Struck: undone, as one entry or by one of its own that stands; and what's in the log for it now, which reversing puts
  // the other way.
  const struck = e => undone(e) || (!!e.by && !struck(e.by));
  const lastOf = e => e.by && !struck(e.by) ? lastOf(e.by) : e.chain.at(-1);
  // A reversal, said as what it is: which change it took back or put back, and whose, where that's another's: { root,
  // word }. Null for anything else, or one whose change isn't in the log.
  function reversalOf(c) {
    if (!c.reverses) return null;
    const { byId } = ever.peek();
    let root = c, n = 0;
    while (root.reverses && byId.has(root.reverses)) { root = byId.get(root.reverses); n++; }
    if (!n) return null;
    return { root, word: `${n % 2 ? 'Undid' : 'Redid'}${root.who === c.who ? '' : ` ${root.who.split(/\s+/)[0]}’s change`}` };
  }

  // A change, read: what it did to which items, in the chart's words, what it records read where it records it, as lines,
  // each { text, sub (what's said under it: a line's entries, what a count stands for), was, now, rows (what a value was and
  // is; a definition's rows before and after) }. What a reversal or a restore brings back is restored. `near`, the records of
  // a record's own History: of a change that holds more, the part about them.
  function itemsIn(c) {
    const { rows } = ever.peek(), items = new Map();
    const put = (r, side) => { const type = Log.typeOf(r), k = type + ':' + r[type]; if (!items.has(k)) items.set(k, { type, id: r[type], was: [], now: [] }); items.get(k)[side].push(r); };
    // (An amendment reads as the act it is, in place of the one it amends: dendra.md, Change.)
    (c.amends ? App.wb.took(c) : c.removes).map(id => rows.get(id)).filter(Boolean).forEach(r => put(r, 'was'));
    c.adds.forEach(r => put(r, 'now'));
    return items;
  }
  const recsFor = c => { const { recs: logged } = ever.peek(), own = recordsOf(c.adds); return Object.keys(own).every(id => id in logged) ? logged : { ...logged, ...own }; };
  function read(c, near = null) {
    // A reason given afterwards is a change that says so, with no rows: it's said by what it's about.
    if (c.about) { const of = ever.peek().byId.get(c.about); return near ? [] : [{ text: `Gave a reason for: ${of ? headOf(read(of)) : 'a change'}`, sub: [] }]; }
    const N = notesNow(), items = itemsIn(c), back = !!(c.reverses || c.restores), recs = recsFor(c);
    // What a change keeps where it's drawn (a box the layout placed) is no part of what it says.
    const keeps = i => { const r = i.type === 'note' && i.now.length && Log.latest(i.now); return !!r && r.label === 'Position' && !!r.value?.kept; };
    // (And the Key where the page placed it, all that's changed of its row; and the scale the page keeps.)
    const rest = r => { const { id, kept, ...p } = r; return JSON.stringify(p); }, keptKey = i => i.type === 'shape' && i.was.length && i.now.length && rest(Log.latest(i.was)) === rest(Log.latest(i.now));
    const scaled = i => i.type === 'note' && Log.latest(i.now.length ? i.now : i.was).label === 'Scale';
    const rec = i => Log.latest(i.now.length ? i.now : i.was), told = new Set();
    // (A place put on every page of a plan is said once.)
    const once = i => { if (i.type !== 'note' || !(['Position', 'Bend'].includes(rec(i).label) || (rec(i).view && typeof Scene !== 'undefined' && Scene.isChange(rec(i).pattern)))) return true; const k = `${rec(i).label}|${Tree.key(rec(i).pattern)}`; return !told.has(k) && !!told.add(k); };
    const held = [...items.values()].filter(i => (back || !keeps(i)) && !keptKey(i) && !scaled(i) && once(i));
    // (A rule's own History, of what's said at its pattern; a record's, of it and what's at it.)
    const about = i => near.rule ? i.type === 'note' && !rec(i).view && near.rule.has(Tree.key(rec(i).pattern)) && rec(i).label !== 'Order'
      : i.type === 'record' ? near.has(i.id) : i.type === 'note' && [...Tree.idsIn(rec(i).pattern)].some(id => near.has(id));
    const all = near ? held.filter(about) : held, whole = (text, sub = []) => [{ text, sub }];
    if (near && !all.length) return [];
    // A view fit to its page; and a view put on another page, by its paper, what it's placed anew for.
    const fitted = [...items.values()].find(i => scaled(i) && i.now.length && Log.latest(i.now).value?.fit);
    if (fitted) return whole(`Fit ${N.nameOf(recs, Log.latest(fitted.now).pattern.id)} to its page`);
    const paged = all.find(i => i.type === 'note' && i.now.length && rec(i).label === 'Page');
    if (paged) { const v = rec(paged).value, named = typeof v === 'object' ? v.size : v; return whole(`Set the page of ${N.nameOf(recs, rec(paged).pattern.id)} to ${(typeof Scene !== 'undefined' && Scene.PAPERS[named]) || 'its own size'}${v?.portrait ? ', portrait' : ''}`); }
    // A relation a definition works out, entered with something recorded at it (a tax year, with its payment), was
    // entered to bear it: what's at it is said, at its place; and so when they go together.
    const worked = i => { const r = rec(i); return r.args && 'tag' in r && isDefined(N, N.nameOf(recs, i.id)); };
    const bearers = new Set(all.filter(i => i.type === 'record' && !(i.was.length && i.now.length) && all.some(j => j.type === 'record' && rec(j).at === i.id) && worked(i)).map(i => i.id));
    const touched = new Set(all.filter(i => i.type === 'record' && !bearers.has(i.id)).map(i => i.id));
    // Tidy takes a view's positions away, but for where each box stood across, and undoing it puts them back; of boxes
    // selected, theirs alone, around what stands.
    if (all.length && all.every(i => i.type === 'note' && (rec(i).label === 'Position' || rec(i).label === 'Bend')) && all.some(i => rec(i).label === 'Position')) {
      const ordered = r => Number.isFinite(r?.value?.order), made = all.filter(i => i.now.length && ordered(Log.latest(i.now)));
      if (made.length && made.every(i => Log.latest(i.now).value.around)) return whole(`Tidied ${made.length === 1 ? N.nameOf(recs, rec(made[0]).pattern.id) : `${made.length} boxes`} in ${N.nameOf(recs, rec(made[0]).view)}`);
      if (made.length && made.every(i => Log.latest(i.now).value.every)) return whole('Tidied the layout for every date');
      if (made.length || (all.length > 1 && !c.adds.length)) return whole('Tidied the layout');
      if (back && (all.some(i => i.was.length && ordered(Log.latest(i.was))) || (all.length > 1 && !c.removes.length))) return whole('Restored the layout');
    }
    // A table's columns put in another order: by the one that moved, and after which, as the table says it, knowing its own
    // order, which is what a view's first move moves against.
    const columns = all.length > 1 && all.every(i => i.type === 'note' && rec(i).label === 'Order' && rec(i).view && rec(i).view === rec(all[0]).view && i.now.length);
    const columnMoved = columns && typeof Table !== 'undefined' && Table.moved(rec(all[0]).view, all.map(i => ({ note: Log.latest(i.now), was: i.was.length ? Log.latest(i.was).value : null })));
    if (columnMoved) return whole(columnMoved);
    // A view's other order: by the one that moved against the rest, or the two that swapped.
    if (columns && all.every(i => i.was.length)) {
      const d = all.map(i => Log.latest(i.now).value - Log.latest(i.was).value), title = i => rec(i).param ?? N.name(rec(i).pattern), view = N.nameOf(recs, rec(all[0]).view);
      if (all.length === 2 && d[0] === -d[1] && Math.abs(d[0]) === 1) return whole(`Swapped ${title(all[0])} and ${title(all[1])} in ${view}`);
      const against = all.filter((_, k) => d[k] && Math.sign(d[k]) !== Math.sign(d.reduce((s, x) => s + Math.sign(x), 0)));
      if (against.length === 1) return whole(`Moved ${title(against[0])} in ${view}`);
    }
    // A chart begun (new, or a copy) is said by its beginning, what it's begun with being its making; one deleted or
    // brought back, by its name.
    const begun = all.find(i => i.type === 'chart' && !(i.was.length && i.now.length));
    if (begun) return whole(!begun.now.length ? `Deleted the chart ${begun.was[0].name}` : back ? `Restored the chart ${begun.now[0].name}` : `Began the chart ${begun.now[0].name}`);
    // (A merger, an insertion and a transfer are each one act, read from all it writes, whichever part of it's asked about.)
    const act = !back && (mergedIn(held, rec, recs, N) ?? interposedIn(held, rec, recs, N) ?? transferIn(held, rec, recs, N));
    if (act) return whole(act.text);
    const objects = all.filter(i => i.type === 'record' && Tree.isObject(rec(i)));
    const made = objects.filter(i => !i.was.length), gone = objects.filter(i => !i.now.length);
    const moved = new Set([...made, ...gone].map(i => i.id));
    // A view made or deleted goes by the Name note that goes with it.
    const named = id => all.find(i => i.type === 'note' && rec(i).label === 'Name' && rec(i).pattern.id === id);
    // A relation of a new name, added with its name and its sides' order (the two-box panel's New relation), is said
    // by its adding alone: those notes are its naming.
    const fresh = all.filter(i => i.type === 'record' && !i.was.length && rec(i).args).map(rec);
    const naming = (i, n) => !i.was.length && (n.label === 'Name' || n.label === 'Order') && !n.view && n.pattern.args && !Tree.idsIn(n.pattern).size
      && fresh.some(r => r.args.length === n.pattern.args.length && n.pattern.args.every(a => r.args.some(b => Tree.same(b.edge, a.edge))));
    const lines = [], line = (text, extra) => { if (!text) return null; let l = lines.find(x => x.text === text); if (!l) lines.push(l = { text, sub: [], ...extra }); return l; };
    const under = (l, text, extra) => { if (l && text && !l.sub.some(x => x.text === text)) l.sub.push({ text, sub: [], ...extra }); };
    const ofRecord = i => recordPhrase(i, rec(i), recs, N, named(i.id), back, !!near), ofNote = i => notePhrase(i, rec(i), recs, N);
    // Boxes and lines hidden in a view, as the chart's Delete says it: a box by its name, a line as its relation's,
    // several counted.
    const box = p => p.id in recs && !Tree.isView(recs[p.id]), isLine = p => !!p.args && Tree.idsIn(p).size > 0;
    const hid = all.filter(i => i.type === 'note' && i.now.length && rec(i).label === 'Shown' && rec(i).value === false && rec(i).view && !moved.has(rec(i).view)
      && (box(rec(i).pattern) || isLine(rec(i).pattern)) && ![...Tree.idsIn(rec(i).pattern)].some(id => moved.has(id)));
    for (const view of new Set(hid.map(i => rec(i).view))) {
      const ps = hid.filter(i => rec(i).view === view).map(i => rec(i).pattern), one = p => p.args ? lineOf(recs, p, N) : N.nameOf(recs, p.id), name = N.nameOf(recs, view);
      const what = ps.length === 1 ? one(ps[0]) : ps.every(p => p.args) ? `${ps.length} lines` : ps.some(p => p.args) ? `${ps.length} items` : `${ps.length} boxes`;
      const l = line(`Hid ${what} in ${name}`);
      if (ps.length > 1) for (const p of ps) under(l, `Hid ${one(p)} in ${name}`);
    }
    // A mark's own look taken away all at once, Look's Reset: said whose, and what.
    const looks = all.filter(i => i.type === 'note' && !i.now.length && Notes.FORMATS.has(rec(i).label) && rec(i).view), mark = looks[0] && rec(looks[0]);
    if (looks.length > 1 && looks.length === all.length && looks.every(i => rec(i).view === mark.view && Tree.key(rec(i).pattern) === Tree.key(mark.pattern)) && Tree.idsIn(mark.pattern).size)
      return whole(`Reset the look of ${ownerOf(recs, mark.pattern, N)} in ${N.nameOf(recs, mark.view)}`, looks.map(i => ({ text: ofNote(i), sub: [] })));
    // What's said under another, once all that's said on its own has a line: an object counted, under its count; an entry,
    // or a relation of what's made, under what it's at; a note at what's made, under that.
    const saidAt = new Map(), later = [];
    if (moved.size > 1) {
      for (const [verb, xs] of [[back ? 'Restored' : 'Added', made], ['Deleted', gone]]) if (xs.length) {
        const by = new Map();
        for (const i of xs) { const k = rec(i).kind; by.set(k, (by.get(k) ?? 0) + 1); }
        const l = line(`${verb} ${list([...by].map(([k, n]) => n === 1 ? `1 ${k.toLowerCase()}` : `${n} ${Tree.plural(k).toLowerCase()}`))}`);
        for (const i of xs) { saidAt.set(i.id, l); under(l, ofRecord(i)); }
      }
    }
    for (const i of all) {
      if (i.type === 'record') {
        const r = rec(i);
        if (bearers.has(i.id) || (moved.size > 1 && moved.has(i.id))) continue;
        if (Tree.argsOf(r).some(a => touched.has(a.at))) { later.push(i); continue; }
        saidAt.set(i.id, line(ofRecord(i), changedFrom(i, r)));
      } else if (i.type === 'note') {
        const n = rec(i);
        if (hid.includes(i) || naming(i, n)) continue;
        if ([...Tree.idsIn(n.pattern)].some(id => moved.has(id)) || moved.has(n.view)) { later.push(i); continue; }
        line(ofNote(i), noteFrom(i, n));
      } else if (i.type === 'shape') {
        // A page's title that follows the chart's name is part of renaming it.
        if (moved.has(rec(i).view)) later.push(i);
        else if (!(rec(i).role === 'title' && all.some(j => j.type === 'chart' && j.was.length && j.now.length))) line(shapePhrase(i, rec(i), recs, N, back));
      } else if (i.type === 'chart' && i.now.length) line(i.was.length ? `Renamed ${i.was[0].name} to ${i.now[0].name}` : `Named the chart ${i.now[0].name}`);
    }
    const lineAt = id => { const seen = new Set(), up = [id]; for (const x of up) { if (seen.has(x)) continue; seen.add(x); if (saidAt.has(x)) return saidAt.get(x); up.push(...Tree.argsOf(recs[x] ?? {}).map(a => a.at)); } return null; };
    for (const i of later) {
      const r = rec(i);
      // (What's made is said by its name, which needn't be said again.)
      if (i.type === 'record') { if (!(moved.has(r.at) && Tree.same(r.edge ?? '', 'Name'))) under(lineAt(i.id) ?? lines[0], ofRecord(i), changedFrom(i, r)); }
      else if (i.type === 'note') under(lineAt([...Tree.idsIn(r.pattern)].find(id => moved.has(id)) ?? r.view) ?? lines[0], ofNote(i), noteFrom(i, r));
      else under(lineAt(r.view) ?? lines[0], shapePhrase(i, r, recs, N, back));
    }
    return lines.length || near ? lines : whole('Changed the chart');
  }
  // What a value was and is, said under its line; a definition's rows, before and after.
  const scalar = v => v !== null && v !== undefined && typeof v !== 'object';
  function changedFrom(i, r) {
    const shown = x => x && ('field' in x || 'choice' in x) ? valueText(x) : null, was = i.was.length ? shown(Log.latest(i.was)) : null, now = i.now.length ? shown(r) : null;
    return was !== null && was !== now ? { was, now } : {};
  }
  function noteFrom(i, n) {
    const was = i.was.length ? Log.latest(i.was).value : undefined, now = i.now.length ? n.value : undefined;
    if (n.label === 'Formula') return { rows: { was: was ?? [], now: now ?? [] } };
    // (A renaming says both already, and a place in an order says nothing.)
    const says = scalar(was) && n.label !== 'Order' && was !== now && !(n.label === 'Name' && !Tree.same(was, now ?? ''));
    return says ? { was: lookText(n.label, was), now: scalar(now) ? lookText(n.label, now) : null } : {};
  }
  // A change as a line of words, kept till the log changes.
  const readings = new WeakMap();
  function reading(c) {
    const v = App.version.peek(), k = readings.get(c);
    if (k?.v === v) return k.lines;
    // (A change that says what it did, as a look given does, says so, what's under it its records read.)
    const raw = read(c), lines = c.says ? [{ text: c.says, sub: raw.length > 1 || c.amends ? raw : [] }] : raw;
    readings.set(c, { v, lines });
    return lines;
  }
  const headOf = lines => !lines.length ? 'Changed the chart' : lines.length === 1 ? lines[0].text : `${lines[0].text}, and ${lines.length - 1} more`;
  // A change, said from itself: an undo as an undo, whose it was and what it took back; anything else by what it did.
  function describe(c) {
    const u = reversalOf(c);
    return u ? `${u.word}: ${describe(u.root)}` : headOf(reading(c));
  }
  // A transfer (dendra.md, Time: Transfer), read back from the records it writes: a relation of two sides ended on a
  // day, or its amount lowered from it; and one of the same name and output, of the same other side but another first
  // side, added from that day, or its amount raised from it. Said as "Transferred 82% of Halvard Logistics Holdings, Inc.
  // from Fund III Blocker to Northwind Holdings LLC on Nov 1, 2026"; one without an amount, by its option or its name.
  const FIGURES = new Set(['number', 'percent', 'money']);
  // A merger (dendra.md, Time), read back as a transfer is: an end entry at an object, and the relation it's named for, from
  // that object, added with it. "Merged Northpine Software, LLC into Corvane on Feb 1, 2027".
  function mergedIn(all, rec, recs, N) {
    const end = all.find(i => { const r = rec(i); return i.type === 'record' && r.field === 'date' && i.now.length && !i.was.length && recs[r.at]?.kind !== undefined && (t => !!t && N.isEnd(t))(Tree.treeOf(recs, i.id)); });
    if (!end) return null;
    const r = rec(end), noun = r.edge.replace(/\s+(date|day)$/i, ''), rel = all.find(i => i.type === 'record' && rec(i).args?.length === 2 && rec(i).args.some(a => a.at === r.at) && !i.was.length && Tree.same(N.nameOf(recs, i.id), noun));
    if (!rel) return null;
    const other = rec(rel).args.find(a => a.at !== r.at)?.at, name = x => { const o = Tree.objectOf(recs, x), s = N.shortOf(recs, o); return s !== N.nameOf(recs, o) ? s.replace(/^The /, 'the ') : s; };
    return { type: 'merger', id: r.at, into: other, day: r.value, end: end.id, edge: r.edge, rel: rel.id, since: Log.latest(end.now).since ?? null, text: `${App.actOf(r.edge)?.[1] ?? 'Ended'} ${name(r.at)} into ${name(other)} on ${short(r.value)}` };
  }
  // One inserted between (dendra.md, Time), read back as a transfer is: a relation of two sides ended on a day, and two of
  // its name added from that day, its holder over another and that other over what it held. "Inserted Holdco between Fund
  // III and Fund III Blocker on Jan 1, 2027".
  function interposedIn(all, rec, recs, N) {
    // (What evidences a stake ends with it, and isn't what's inserted between.)
    const relation = i => i.type === 'record' && rec(i).args?.length === 2 && rec(i).args.every(a => recs[a.at] && !recs[a.at].args);
    const gone = all.filter(i => relation(i) && i.was.length && i.now.length && i.now.every(x => x.before) && !Log.latest(i.was).before);
    const fresh = all.filter(i => relation(i) && !i.was.length && i.now.length && Log.latest(i.now).since);
    if (gone.length !== 1 || fresh.length !== 2) return null;
    const F = rec(gone[0]), day = Log.latest(gone[0].now).before, T = Tree.treeOf(recs, gone[0].id), first = T && N.edges(T)[0];
    if (!first || fresh.some(i => Log.latest(i.now).since !== day || !Tree.same(N.nameOf(recs, i.id), N.nameOf(recs, gone[0].id)))) return null;
    const side = (r, own) => r.args.find(a => Tree.same(a.edge, first) === own)?.at, [a, b] = fresh.map(rec);
    const up = side(a, true) === side(F, true) ? a : b, down = up === a ? b : a;
    if (side(up, true) !== side(F, true) || side(down, false) !== side(F, false) || side(up, false) !== side(down, true)) return null;
    const name = x => { const o = Tree.objectOf(recs, x), s = N.shortOf(recs, o); return s !== N.nameOf(recs, o) ? s.replace(/^The /, 'the ') : s; };
    const mid = side(down, true), midMade = all.find(i => i.type === 'record' && i.id === mid && !i.was.length);
    return { type: 'insert', rid: gone[0].id, mid, fresh: !!midMade && madeAs(midMade, rec, recs, N), up: fresh[up === a ? 0 : 1].id, made: fresh[up === a ? 1 : 0].id, day, text: `Inserted ${name(mid)} between ${name(side(F, true))} and ${name(side(F, false))} on ${short(day)}` };
  }
  // A record an act made, as it asks for one again: its kind, its name, and their ids.
  const madeAs = (i, rec, recs, N) => ({ kind: rec(i).kind, id: i.id, name: N.nameOf(recs, i.id), nameId: Tree.entryAt(recs, i.id, 'Name') });
  // A value typed from a day, read back as those are: one record, or several from the one day, its row split on the day.
  function valueIn(all, rec) {
    const vals = all.filter(i => i.type === 'record');
    if (!vals.length || vals.some(i => !i.was.length || !i.now.length)) return null;
    const parts = vals.map(i => { const now = Log.latest(i.now), was = now.since && i.now.find(y => y.before === now.since); return was && !Tree.isObject(now) && !(now.args && !('choice' in now)) ? { id: i.id, day: now.since, was, now } : null; });
    return parts.some(p => !p) || new Set(parts.map(p => p.day)).size > 1 ? null : { type: 'value', day: parts[0].day, parts };
  }
  // A relation added from a day it asked, and what's at it from then; or a record ended on a day, by its rows (dendra.md, Time): the
  // day's all there is to read.
  function addedIn(all, rec, recs, N) {
    const it = all.filter(i => i.type === 'record'), top = it.filter(i => !it.some(j => j !== i && Tree.argsOf(rec(i)).some(a => a.at === j.id)));
    if (top.length !== 1 || it.some(i => i.was.length || !i.now.length)) return null;
    const r = rec(top[0]);
    return r.args && r.since && App.asksDay(r, recs, N) && it.every(i => rec(i).since === r.since) ? { type: 'added', id: top[0].id, day: r.since } : null;
  }
  function endedIn(all, rec) {
    const it = all.filter(i => i.type === 'record'), top = it.filter(i => !it.some(j => j !== i && Tree.argsOf(rec(i)).some(a => a.at === j.id)));
    if (top.length !== 1 || it.some(i => !i.was.length || !i.now.length)) return null;
    const on = Log.latest(top[0].now).before;
    return on && !Log.latest(top[0].was).before && (rec(top[0]).args || Tree.isObject(rec(top[0]))) && it.every(i => Log.latest(i.now).before === on) ? { type: 'ended', id: top[0].id, day: on } : null;
  }
  // The act a change is, read back from its records alone, as History says it, as Change… asks it again: or null, for a
  // change that has none, or one that takes another back.
  const acts = new WeakMap();
  function actOf(c) {
    const k = acts.get(c), v = App.version.peek();
    if (k?.v === v) return k.act;
    let act = null;
    if (!c.reverses && !c.restores) {
      const items = itemsIn(c), held = [...items.values()], rec = i => Log.latest(i.now.length ? i.now : i.was), recs = recsFor(c), N = notesNow();
      act = mergedIn(held, rec, recs, N) ?? interposedIn(held, rec, recs, N) ?? transferIn(held, rec, recs, N) ?? valueIn(held, rec) ?? addedIn(held, rec, recs, N) ?? endedIn(held, rec);
    }
    acts.set(c, { v, act });
    return act;
  }
  // Why a change can't be changed now: the later change that took a row it added, which has to be undone first. Only what's
  // read back and made again rests on its rows (dendra.md, Change). → that change, or null.
  const barred = c => {
    const a = actOf(c);
    if (!a || !['transfer', 'insert', 'merger'].includes(a.type) || App.wb.canAmend(c.id)) return null;
    // (By what it now is, where that's been changed since.)
    const b = blocker(c) ?? c;
    let e = entries.peek().find(x => x.change === b);
    while (e?.amended && !struck(e.amended)) e = e.amended;
    return e?.change ?? b;
  };
  function transferIn(all, rec, recs, N) {
    // A relation of two sides, neither itself a relation: what evidences a stake ends with it, and isn't what's transferred.
    const pair = r => r?.args?.length === 2 && r.args.every(a => recs[a.at] && !recs[a.at].args);
    // Its amount's item, of those at it: the first figure, in its entries' order.
    const order = i => N.order(Tree.treeOf(recs, i.id) ?? {}) ?? Infinity;
    const amountAt = rel => all.filter(i => i.type === 'record' && rec(i).at === rel && FIGURES.has(rec(i).field)).sort((a, b) => order(a) - order(b) || rec(a).edge.localeCompare(rec(b).edge))[0];
    // A figure's change from a day: [day, by how much], from what it was on that day, split there or replaced.
    const step = i => { const to = i.was.length && i.now.length && Log.latest(i.now), was = to?.since && (i.now.find(y => y.before === to.since) ?? i.was.find(y => Log.validOn(y, to.since)));
      return was ? [to.since, to.value - was.value] : null; };
    // What it's from: a relation ended on its day, by its period or by its end entry; or its amount lowered. What it's to:
    // a relation added from the day; or its amount raised, or given.
    const froms = [], tos = [], here = id => all.some(j => j.type === 'record' && j.id === id), amountOf = rel => { const a = amountAt(rel); return a && recs[rel] ? a : null; };
    for (const i of all) if (i.type === 'record') {
      const r = rec(i), at = recs[r.at];
      if (pair(r) && i.now.length) {
        const a = amountOf(i.id), now = Log.latest(i.now);
        if (i.was.length && i.now.every(x => x.before) && !Log.latest(i.was).before) froms.push({ rel: i.id, whole: true, day: now.before, q: a?.was.length ? Log.latest(a.was).value : null, a });
        else if (!i.was.length && now.since) tos.push({ rel: i.id, fresh: true, day: now.since, q: a && !a.was.length && a.now.length ? Log.latest(a.now).value : null, a });
      } else if (pair(at) && r.field === 'date' && !i.was.length && i.now.length && (t => !!t && N.isEnd(t))(Tree.treeOf(recs, i.id))) {
        const a = amountOf(r.at), vs = a && (a.was.length ? a.was : a.now);
        froms.push({ rel: r.at, whole: true, day: r.value, q: vs?.length ? Log.latest(vs).value : null, a });
      } else if (pair(at) && FIGURES.has(r.field) && amountAt(r.at) === i && !here(r.at) && i.now.length) {
        const s = step(i), now = Log.latest(i.now);
        if (s && s[1] < 0) froms.push({ rel: r.at, day: s[0], q: -s[1], a: i });
        else if (s && s[1] > 0) tos.push({ rel: r.at, day: s[0], q: s[1], a: i });
        else if (!i.was.length && now.since) tos.push({ rel: r.at, day: now.since, q: now.value, a: i });
      }
    }
    // Just one of each, the same part going as comes: a closing's paste that dilutes some owners as it adds another is
    // no transfer.
    if (froms.length !== 1 || tos.length !== 1) return null;
    for (const f of froms) for (const t of tos) {
      const F = recs[f.rel], T = Tree.treeOf(recs, f.rel), first = T && N.edges(T)[0], side = (r, own) => r.args.find(a => Tree.same(a.edge, first) === own)?.at;
      const R = recs[t.rel];
      if (!first || t.day !== f.day || !Tree.same(N.nameOf(recs, f.rel), N.nameOf(recs, t.rel)) || F.choice !== R.choice || side(F, false) !== side(R, false) || side(F, true) === side(R, true)) continue;
      if (!!f.a !== !!t.a || (f.a && !(f.q != null && t.q != null && Math.abs(f.q - t.q) < 1e-9))) continue;
      // Each by its short name, a defined term reading "the Manager" mid-sentence.
      const q = f.a ? Math.round(f.q * 1e9) / 1e9 : null, name = x => { const o = Tree.objectOf(recs, x), s = N.shortOf(recs, o); return s !== N.nameOf(recs, o) ? s.replace(/^The /, 'the ') : s; };
      const what = q != null ? Tree.format(rec(f.a).field, q) : F.choice ?? N.nameOf(recs, f.rel);
      const to = side(R, true), toMade = all.find(i => i.type === 'record' && i.id === to && !i.was.length);
      return { type: 'transfer', rid: f.rel, to, fresh: !!toMade && madeAs(toMade, rec, recs, N), made: t.fresh ? t.rel : null, whole: !!f.whole, q, field: f.a ? rec(f.a).field : null, day: f.day,
        text: `Transferred ${what} of ${name(side(F, false))} from ${name(side(F, true))} to ${name(to)} on ${short(f.day)}` };
    }
    return null;
  }
  const valueText = r => r.field === 'date' ? short(r.value) : Tree.outputText(r);
  // A record's phrase: a tag attested or ruled out, a value set, changed or cleared, a record added, ended or deleted.
  // A relation that's a fact (Ownership) is added; one a definition works out (Control) is attested. Deleted, it's
  // said as the bar that deleted it asked it: ended on its day, the first it no longer holds, whether a day said ended it
  // or its end entry (a Dissolution Date); or deleted as never held. `own`, in a record's own History: a value said as
  // that record's ("Fund III’s stake in Corvane was set to 55% from Feb 1, 2027").
  function recordPhrase(i, r, recs, N, name, back, own = false) {
    const all = i.id in recs ? recs : { ...recs, [i.id]: r }, [what, of] = said(all, i.id, N);
    const itOf = (x, [w, o]) => Tree.isView(all[x]) ? `view ${name ? Log.latest(name.now.length ? name.now : name.was).value : o}` : Tree.isObject(all[x]) ? o : all[x].args ? `${w}: ${o}` : `${w} of ${o}`;
    const it = itOf(i.id, [what, of]);
    const verdict = r.tag ? 'Attested' : 'Ruled out', added = back ? 'Restored' : 'Added';
    const fact = r.args && r.tag === true && !isDefined(N, what);
    // A relation added that asked its day (App.asksDay) says it: from the day said, or all along.
    const when = r.args && !back && App.asksDay(r, recs, N) ? r.since ? ` from ${short(r.since)}` : ' all along' : '';
    // A value, by whose it is, in a record's own History.
    const whose = () => stakeOf(all, i.id, N) ?? it, day = d => d ? ` from ${short(d)}` : '';
    const end = r.field === 'date' && all[r.at] && !back && (t => !!t && N.isEnd(t))(Tree.treeOf(all, i.id));
    // A date entry recording an act says the act: at an object, by its end entry ("Dissolved Tessellate on Nov 15, 2026"); at a
    // relation of a record and a year, whose and for which ("Paid AIV-1’s annual tax for 2025 on Jun 1, 2026").
    const act = r.field === 'date' && !back ? App.actOf(r.edge) : null, sides = act && all[r.at]?.args ? N.placed(all, r.at) : [];
    if (!i.was.length && sides.length === 2 && /^\d+$/.test(sides[1].text)) {
      const whose = sides[0].text, tax = said(all, r.at, N)[0].replace(/\b[A-Z](?=[a-z])/g, c => c.toLowerCase());
      return `${act[1]} ${/\)$/.test(whose) ? `the ${tax} of ${whose}` : `${whose}${whose.endsWith('s') ? '’' : '’s'} ${tax}`} for ${sides[1].text} on ${short(r.value)}`;
    }
    if (!i.was.length) return end ? `${(Tree.isObject(all[r.at]) && act?.[1]) || 'Ended'} ${itOf(r.at, said(all, r.at, N))} on ${short(r.value)}`
      : Tree.isObject(r) || fact ? `${added} ${it}${fact ? when : ''}` : 'tag' in r ? `${verdict} ${it}` : r.args || back ? `${added} ${it}${when}`
      : `${own ? `${whose()} was set` : `Set ${it}`} to ${valueText(r)}${day(r.since !== r.value && r.since)}`;
    if (!i.now.length) return Tree.isObject(r) || r.args ? `Deleted ${it}${back || Tree.isView(r) ? '' : ' as never held'}` : `Cleared ${it}`;
    const was = Log.latest(i.was), ended = i.now.every(x => x.before) && !was.before;
    if (ended) return `Ended ${it} on ${short(Log.latest(i.now).before)}`;
    // Something ended, made to hold on again (History's Restore of what was ended), is restored.
    if (was.before && !Log.latest(i.now).before && (Tree.isObject(r) || r.args)) return `Restored ${it}`;
    // A value typed with a day shown changes from that day; with none, it's corrected, for all time (dendra.md, Time).
    const from = r.since && r.since !== was.since && r.since !== r.value ? r.since : null;
    if (Tree.isObject(r)) return was.kind !== r.kind ? `Made ${it} ${/^[aeiou]/i.test(r.kind) ? 'an' : 'a'} ${r.kind}, not ${/^[aeiou]/i.test(was.kind) ? 'an' : 'a'} ${was.kind}` : `Changed ${it}`;
    if (Tree.same(r.edge ?? '', 'Name') && 'value' in r) return `Renamed ${was.value} to ${r.value}${day(from)}`;
    if ('tag' in r) return `${verdict} ${it}${day(from)}`;
    if (valueText(was) === valueText(r)) return `Changed ${it}`;
    if (own) return `${whose()} was ${from ? 'set' : 'corrected'} to ${valueText(r)}${day(from)}`;
    return from ? `Changed ${it} to ${valueText(r)} from ${short(from)}` : `Corrected ${it} to ${valueText(r)}`;
  }
  // A relation's amount, the first percentage entered at it (a transfer's), as its holder's: "Fund III’s stake in Corvane".
  function stakeOf(recs, id, N) {
    const r = recs[id], rel = recs[r?.at];
    if (r?.field !== 'percent' || rel?.args?.length !== 2) return null;
    const order = x => N.order(Tree.treeOf(recs, x) ?? {}) ?? Infinity;
    const first = (Tree.index(recs).entries.get(r.at) ?? []).filter(x => FIGURES.has(recs[x].field)).sort((a, b) => order(a) - order(b) || recs[a].edge.localeCompare(recs[b].edge))[0], t = Tree.treeOf(recs, r.at), edge = t && N.edges(t)[0];
    if (first !== id || !edge) return null;
    const name = a => { const o = Tree.objectOf(recs, a.at), s = N.shortOf(recs, o); return s !== N.nameOf(recs, o) ? s.replace(/^The /, 'the ') : s; };
    const holder = name(rel.args.find(a => Tree.same(a.edge, edge))), of = name(rel.args.find(a => !Tree.same(a.edge, edge)));
    return `${holder}${holder.endsWith('s') ? '’' : '’s'} stake in ${of}`;
  }
  // A free shape's phrase, by what it is and the view it's in: moved where only its place changed, resized where its
  // size did.
  const SHAPES = { legend: 'the Key', text: 'a text box', line: 'a line', picture: 'a picture', group: 'a group', frame: 'a frame' };
  // (A width first given where only a place was, a box placed loosely and then laid out, is no resizing; a height first given is.)
  const resized = (a, b) => !!a && !!b && ((a.w != null && b.w != null && a.w !== b.w) || (b.h != null && a.h !== b.h));
  function shapePhrase(i, s, recs, N, back) {
    const what = SHAPES[s.geometry] ?? 'a shape', view = s.view && N.nameOf(recs, s.view);
    if (!i.was.length) return `${back ? 'Restored' : 'Added'} ${what}${view ? ` to ${view}` : ''}`;
    if (!i.now.length) return `Deleted ${what}${view ? ` from ${view}` : ''}`;
    const a = Log.latest(i.was), b = Log.latest(i.now), only = ks => Object.keys({ ...a, ...b }).filter(k => k !== 'id' && JSON.stringify(a[k]) !== JSON.stringify(b[k])).every(k => ks.includes(k));
    const verb = only(['rotate']) ? 'Rotated' : resized(a, b) && only(['x', 'y', 'w', 'h', 'points']) ? 'Resized' : only(['x', 'y', 'points']) ? 'Moved' : 'Edited';
    return `${verb} ${what}${view ? ` in ${view}` : ''}`;
  }
  // A style's output in a view, by its group, as the Key and the format bar's scope say it; its caption, by its
  // own name.
  const grouped = (N, n) => typeof Scene === 'undefined' ? null : n.label === 'Caption' ? Scene.outputName(N, n.pattern)
    : Scene.groupsOf(N, n.view).find(g => g.outputs.some(p => Tree.key(p) === Tree.key(n.pattern)))?.caption ?? Scene.captionOf(N, n.pattern, n.view);
  // A look given, said with what it's given, as an audit trail needs it: "Made Funds bold", "Set the font of Fund III
  // Blocker to Garamond", "Took the fill off Fund III"; a color by the palette's name, a shape by the bar's. A label
  // with no words of its own is said as changed.
  const NOUNS = { Font: 'font', Size: 'size', Color: 'text color', Fill: 'fill', Outline: 'outline', Weight: 'outline weight', Shape: 'shape', Align: 'alignment',
    Valign: 'vertical alignment', Spacing: 'line spacing', Transparency: 'transparency', Corner: 'corners', Arrow: 'arrowheads', Shadow: 'shadow', Frame: 'frame',
    Connector: 'connector', Layer: 'layer' };
  const ON = { Bold: ['bold', 'not bold'], Italic: ['italic', 'not italic'], Underline: ['underlined', 'not underlined'], Strike: ['struck through', 'not struck through'] };
  // A look's value, as it's said.
  function lookText(label, v) {
    const fb = typeof FormatBar !== 'undefined' ? FormatBar : null;
    return ON[label] ? ON[label][v ? 0 : 1] : label === 'Size' || label === 'Weight' ? `${v} pt` : label === 'Transparency' || label === 'Corner' ? `${v}%`
      : label === 'Shape' ? (fb?.shapeName?.(v) ?? v).toLowerCase() : /^#[0-9a-f]{3,8}$/i.test(v) ? fb?.colorName?.(v) ?? v.toUpperCase() : String(v);
  }
  function looked(label, v, of) {
    if (ON[label]) return `Made ${of} ${ON[label][v ? 0 : 1]}`;
    if (label === 'Dash') return `Made the outline of ${of} ${String(v).replace(/-/g, ' ')}`;
    if (label === 'Arrowhead') return `Changed the arrowheads of ${of}`;
    if (label === 'Gradient') return v ? `Gave ${of} a gradient` : `Took the gradient off ${of}`;
    if (label === 'Pattern') return v ? `Gave ${of} a pattern` : `Took the pattern off ${of}`;
    if (label === 'Tail') return `Moved what ${of} points at`;
    if (label === 'Inset') return `Set the inner margins of ${of}`;
    if (label === 'Indent') return v ? `Indented ${of} ${v} pt` : `Took the indent off ${of}`;
    if (label === 'Bullet') return v === 'none' ? `Took the bullets off ${of}` : v === 'number' ? `Numbered ${of}` : `Bulleted ${of}`;
    if (label === 'Shrink') return v ? `Made ${of} shrink its text to fit` : `Stopped ${of} shrinking its text`;
    const noun = NOUNS[label];
    if (!noun) return `Changed ${label} of ${of}`;
    if (v === 'none') return `Took the ${noun} off ${of}`;
    if (label === 'Shadow') return `Gave ${of} a shadow`;
    if (label === 'Arrow') return `Gave ${of} ${v === 'both' ? 'arrowheads at both ends' : `an arrowhead at its ${v}`}`;
    return `Set the ${noun} of ${of} to ${lookText(label, v)}`;
  }
  function notePhrase(i, n, recs, N) {
    // One record's own (a box's, or a line's, its relation's tree), or else a style's or an entry's in general.
    const at = n.pattern.id, isView = at !== undefined && Tree.isView(recs[at] ?? {}), line = at === undefined && (n.pattern.args?.length ?? 0) > 1 && Tree.idsIn(n.pattern).size > 0;
    // A field of one box: its entry's pattern with that box's record in it, "Jurisdiction of Offshore Feeder".
    const field = at === undefined && n.pattern.args?.length === 1 && Tree.idsIn(n.pattern).size === 1;
    const of = isView && n.param ? n.param : at !== undefined ? N.nameOf(recs, at) : line ? lineOf(recs, n.pattern, N) : field ? `${N.name(n.pattern)} of ${N.shortOf(recs, [...Tree.idsIn(n.pattern)][0])}`
      : n.param ? N.listName(n.pattern, n.param) : N.name(n.pattern), one = at !== undefined || line || field;
    const inView = n.view ? ` in ${N.nameOf(recs, n.view)}` : '';
    const gone = !i.now.length;
    switch (n.label) {
      case 'Order': return isView ? 'Reordered the views' : n.view ? `Reordered ${N.nameOf(recs, n.view)}` : `Reordered ${of}`;
      // An entry of an entry by its path, as the Columns list says it: Jurisdiction › File Number, not File Number.
      case 'Shown': { const path = [];
        for (let t = n.pattern; !n.param && !t.out && t.id === undefined && t.args?.length === 1; t = t.args[0].loc) path.unshift(t.args[0].edge);
        const what = path.length > 1 ? path.join(' › ') : of;
        return gone ? `Reset ${what}${inView}` : `${n.value === false ? 'Hid' : 'Showed'} ${what}${inView}`; }
      // A free text (dendra.md, Fields), in a box or a group's, by whose it is.
      case 'Text': { const whose = one ? of : n.view ? grouped(N, n) ?? of : of;
        return gone || !n.value?.text ? `Removed the text from ${whose}${inView}` : i.was.length ? `Edited the text of ${whose}${inView}` : `Added text to ${whose}${inView}`; }
      // A line's Position is its label's, dragged.
      case 'Position': return Number.isFinite(n.value?.along) ? `${gone ? 'Reset' : 'Moved'} the label of ${of}${inView}`
        : gone ? `Reset the position of ${of}${inView}` : `${i.was.length && resized(Log.latest(i.was).value, n.value) ? 'Resized' : 'Moved'} ${of}${inView}`;
      case 'Bend': return `${gone ? 'Reset the route of' : 'Bent'} ${of}${inView}`;
      case 'Formula': return gone ? `Deleted the formula of ${of}` : i.was.length ? `Changed the formula of ${of}` : `Defined ${of}`;
      case 'Name': return gone ? `Unnamed ${of}` : !i.was.length ? (Tree.same(of, n.value) ? `Named ${n.value}` : `Named ${of} ${n.value}`)
        : Tree.same(Log.latest(i.was).value, n.value) ? `Changed Name of ${of}` : `Renamed ${Log.latest(i.was).value} to ${n.value}`;
      case 'As Of': return gone ? `Stopped keeping a date in ${of}` : `Kept ${short(n.value)} in ${of}`;
      case 'Footer': return gone ? 'Took the footer off' : 'Set the footer';
      // Said as the rule's page says them.
      case 'Check': return gone || n.value === false ? `Made ${of} count no failure as an error` : `Made a failure of ${of} count as an error`;
      case 'Required': if (!gone) return n.value === false ? `Made a blank ${of} need no filling in` : `Made a blank ${of} need filling in`;   // falls through
      case 'Start': case 'End': case 'Description': return `${gone ? 'Removed' : 'Changed'} ${n.label} of ${of}`;
      case 'Fixed': return gone ? `Made ${of} change over time` : `Made ${of} one for all time`;
      // A field's look in a group's boxes, given beside its output (dendra.md, Fields): "Made Jurisdiction not bold in the
      // Cayman Islands boxes in Structure". A look one record kept of its own, cleared, as the format bar says it.
      default: if (n.param && Notes.FORMATS.has(n.label)) { const boxes = `in the ${grouped(N, n) ?? N.name(n.pattern)} boxes${inView}`;
          return gone ? `Cleared the ${n.label} of ${of} ${boxes}` : `${looked(n.label, n.value, of)} ${boxes}`; }
        return gone && at !== undefined && Notes.FORMATS.has(n.label) ? `Cleared ${of.endsWith('s') ? `${of}’` : `${of}’s`} own ${n.label}${inView}`
        : gone && (line || field) && Notes.FORMATS.has(n.label) ? `Cleared the ${n.label} of ${of}${inView}`
        : Notes.FORMATS.has(n.label) && !gone ? `${looked(n.label, n.value, !one && n.view ? grouped(N, n) ?? of : of)}${inView}`
        : `Changed ${n.label}${one ? ' of ' : ' for '}${!one && n.view ? grouped(N, n) ?? of : of}${inView}`;
    }
  }

  // Restoring what was ended clears its end, one change: its end entry cleared, or its period and what ended with it
  // made to hold on.
  const unend = d => App.change(tx => d.entry ? tx.remove(d.entry) : tx.reopen(d.item, d.ended), { dated: false, say: c => describe(c) });
  // An end entry (a Dissolution Date): what ends what it's at. Cleared, what it ended is restored, which is how
  // Deleted lists it, not as an entry deleted.
  const endEntry = (recs, id, N) => recs[id]?.field === 'date' && (t => !!t && N.isEnd(t))(Tree.treeOf(recs, id));
  // A record as History's Deleted lists it: an object by its name, anything else by what it is and whose.
  const textOf = (recs, id, N) => { const [what, of] = said(recs, id, N); return recs[id] && Tree.isObject(recs[id]) ? of : of ? `${what} · ${of}` : what; };
  // The items deleted and not restored, each with the change that deleted it: things at something also
  // deleted go with it, only records and definitions are listed, and an addition undone was never there. A
  // change adds anew what it adds unless it brings it back: a restore, or the undoing of a change that took it.
  function deleted() {
    const { recs, rows, by, changes } = ever.peek(), N = notesNow(), gone = App.wb.deleted(App.chart.peek());
    const ids = new Set(gone.map(d => d.item)), find = id => changes.find(x => x.id === id);
    const anew = c => !!c && !c.restores && (!c.reverses || (u => !!u?.reverses && anew(find(u.reverses)))(find(c.reverses)));
    const undone = d => { const c = find(d.change); return !!c?.reverses && anew(find(c.reverses)) && d.rows.every(r => by.get(r.id) === c.reverses); };
    // A deleted view goes by the last name it had.
    const viewName = id => [...rows.values()].filter(r => r.label === 'Name' && r.pattern?.id === id).at(-1)?.value;
    return [...gone.filter(d => !undone(d) && (d.type === 'record' ? !Tree.argsOf(recs[d.item] ?? {}).some(a => ids.has(a.at)) && !endEntry(recs, d.item, N) : d.type === 'note' && d.rows[0]?.label === 'Formula'))
      .map(d => {
        const change = changes.find(c => c.id === d.change);
        const r = recs[d.item], text = d.type === 'record' ? (Tree.isView(r ?? {}) ? viewName(d.item) ?? said(recs, d.item, N)[1] : textOf(recs, d.item, N)) : `Formula · ${N.name(d.rows[0].pattern)}`;
        return { ...d, text, who: change?.who, when: change?.when };
      }), ...ended()].sort((a, b) => (b.when ?? '').localeCompare(a.when ?? ''));
  }
  // What's ended and still recorded as having held (dendra.md, Time): an object or a relation whose period ends, every
  // version of it before a day, or that its end entry ends (a Dissolution Date); each with the change that ended it,
  // the day it ends on, and the entry, where one ended it. What's at something ended with it on its day comes back with
  // it, so isn't listed apart. Restoring one clears its end.
  function ended() {
    const { by, changes } = ever.peek(), N = notesNow(), rows = App.wb.rows(App.chart.peek()).filter(r => 'record' in r), items = new Map();
    for (const r of rows) (items.get(r.record) ?? items.set(r.record, []).get(r.record)).push(r);
    const recs = Object.fromEntries([...items].map(([id, rs]) => { const { id: _, record: __, ...r } = Log.latest(rs); return [id, r]; }));
    const out = new Map(), { entries } = Tree.index(recs);
    for (const [id, rs] of items) {
      const r = recs[id];
      if (!(Tree.isObject(r) || r.args?.length > 1) || Tree.isView(r)) continue;
      if (rs.every(x => x.before)) { const last = rs.reduce((a, x) => x.before > a.before ? x : a); out.set(id, { item: id, ended: last.before, change: by.get(last.id) }); continue; }
      const e = (entries.get(id) ?? []).find(x => endEntry(recs, x, N));
      if (e) out.set(id, { item: id, ended: recs[e].value, entry: e, word: recs[e].edge, change: by.get(Log.latest(items.get(e)).id) });
    }
    const along = (x, d) => Tree.argsOf(recs[x.item]).some(a => { const o = out.get(Tree.objectOf(recs, a.at)); return o && o.ended === d.ended && o.change === d.change; });
    return [...out.values()].filter(d => !along(d, d)).map(d => {
      const change = changes.find(c => c.id === d.change);
      return { ...d, text: textOf(recs, d.item, N), who: change?.who, when: change?.when };
    });
  }

  const open = signal(false), mode = signal('all');
  // What History lists: `focus`, the records whose own it is, from a record's own History or a choice in it, never from
  // what's selected, or a rule's own, { rule: its patterns' keys, name }; `kind`, of change, which a record's own begins on its
  // records; and the entries opened, and the runs of what's undone opened, by a change's id.
  const focus = signal(null), kind = signal('all'), opens = signal(new Set()), unfolded = signal(new Set());
  const KINDS = [['all', 'All kinds'], ['records', 'Records'], ['rules', 'Rules'], ['looks', 'Looks and layout']];
  // Which kinds of change a change holds: records, what they are (a definition, a requirement, a name at no view) or how a
  // view draws them; what it keeps where it's drawn is none. The schema's own rows go with what they came with.
  const RULES = new Set(['Formula', 'Required', 'Fixed', 'Check', 'Start', 'End', 'Description', 'Name', 'Order']), kindsKept = new WeakMap();
  function kindsOf(c) {
    if (kindsKept.has(c)) return kindsKept.get(c);
    const { rows, byId } = ever.peek(), out = new Set();
    kindsKept.set(c, out);
    // (A reason given afterwards is of the kinds of what it's about.)
    if (c.about && byId.has(c.about)) kindsOf(byId.get(c.about)).forEach(k => out.add(k));
    let spec = false;
    for (const r of [...c.adds, ...c.removes.map(id => rows.get(id)).filter(Boolean)]) {
      if ('spec' in r) spec = true;
      else if ('record' in r) out.add(r.kind === 'View' ? 'looks' : 'records');
      else if ('chart' in r) out.add('records');
      else if ('shape' in r) out.add('looks');
      else if ('note' in r && !(r.label === 'Position' && r.value?.kept)) out.add(!r.view && r.pattern.kind !== 'View' && RULES.has(r.label) ? 'rules' : 'looks');
    }
    if (spec && !out.size) out.add('rules');
    return out;
  }

  // ---- What a change did to the status: the status bar's counts just before it and just after, the log replayed as
  // History's past view replays it, as of today, so its words don't change with the day shown; worked out while nothing
  // else is happening, a rule's change first, or at once for an entry opened ----
  const worked = signal(0), effects = new Map(), SAID = { overdue: 'overdue', error: 'errors', soon: 'due soon', blank: 'blank' };
  const replays = new Map();
  function replay(n) {
    const key = `${App.chart.peek()}|${n}|${Log.today()}|${ever.peek().changes.length}`;
    if (replays.has(key)) return replays.get(key);
    const c = App.chart.peek(), wb = Log.open(ever.peek().changes.slice(0, n)), N = wb.notes(c), S = wb.schema(c), day = Log.today();
    const definitions = N.definitions(S), R = Formulas.computeState(wb.asOf(c, day), definitions, { relations: N.relations(S), schema: S });
    R.definitions = definitions;
    const out = { R, N, items: Formulas.attention(R, N, day) };
    // (Each is worked out from nothing, and takes a while; the one before is the next one's after.)
    if (replays.size > 2) replays.delete(replays.keys().next().value);
    replays.set(key, out);
    return out;
  }
  const needKey = a => `${a.kind}|${a.id}|${a.edge ?? ''}|${a.error?.error?.code ?? ''}`;
  function effectOf(c) {
    const i = ever.peek().at.get(c.id), kept = effects.get(c.id);
    if (kept?.i === i && kept.day === Log.today()) return kept;
    const before = replay(i), after = replay(i + 1), was = new Map(before.items.map(a => [needKey(a), a])), now = new Map(after.items.map(a => [needKey(a), a]));
    const say = (a, s) => { try { return Shell.parts.peek().needs(a, s.R, s.N); } catch { return { what: a.edge ?? '', where: '', figure: '' }; } };
    const count = (m, k) => [...m.values()].filter(a => a.kind === k).length;
    const moved = Object.keys(SAID).map(k => ({ k, was: count(was, k), now: count(now, k) })).filter(x => x.was !== x.now);
    const cleared = [...was].filter(([k]) => !now.has(k)).map(([, a]) => say(a, before)), appeared = [...now].filter(([k]) => !was.has(k)).map(([, a]) => say(a, after));
    // And of a rule's change, what it did to what the rules conclude, in the words its preview had, and which.
    const out = { i, day: Log.today(), moved, cleared, appeared, ...(isRule(c) && FormulaBar.saying?.(before.R, after.R, before.N, after.N)) };
    effects.set(c.id, out);
    return out;
  }
  // Those asked for, the first first; one worked out at a time, between what else the window's doing.
  let asked = [], idle = 0;
  const later = f => typeof requestIdleCallback === 'function' ? requestIdleCallback(f, { timeout: 400 }) : setTimeout(f, 40);
  function work() {
    idle = 0;
    const c = asked.shift();
    if (!c) return;
    try { effectOf(c); worked.value++; } catch {}
    if (asked.length) idle = later(work);
  }
  function ask(cs) { asked = cs; if (!idle && asked.length) idle = later(work); }
  const known = c => { const k = effects.get(c.id); return k && k.i === ever.peek().at.get(c.id) && k.day === Log.today() ? k : null; };
  const movesStatus = c => { const ks = kindsOf(c); return ks.has('records') || ks.has('rules'); };
  const isRule = c => [...c.adds, ...c.removes.map(id => ever.peek().rows.get(id)).filter(Boolean)].some(r => 'note' in r && ['Formula', 'Required', 'Check'].includes(r.label));

  // ---- A definition's rows, before and after, the words that changed marked ----
  const WORD = /\s+|[\p{L}\p{N}_§.$%]+|[^\s\p{L}\p{N}_§.$%]/gu;
  // The words of two texts, each marked where the other hasn't it, by their longest common run of words.
  function wordDiff(a, b) {
    const x = String(a).match(WORD) ?? [], y = String(b).match(WORD) ?? [];
    if (x.length * y.length > 250000) return [x.map(t => [t, true]), y.map(t => [t, true])];
    const n = x.length, m = y.length, L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    const p = [], q = [];
    for (let i = 0, j = 0; i < n || j < m;) {
      if (i < n && j < m && x[i] === y[j]) { p.push([x[i++], false]); q.push([y[j++], false]); }
      else if (j < m && (i === n || L[i][j + 1] >= L[i + 1][j])) q.push([y[j++], true]);
      else p.push([x[i++], true]);
    }
    return [p, q];
  }
  let FN = null;
  const cased = t => t.split(FN ??= new RegExp(`\\b(${Formulas.FUNCTION_NAMES.join('|')})\\b`, 'g')).map((x, i) => i % 2 ? html`<span class="fn">${x}</span>` : x);
  const inks = (words, cls) => {
    const out = [];
    for (const [t, on] of words) { if (out.length && out.at(-1).on === on) out.at(-1).t += t; else out.push({ t, on }); }
    return out.map(w => w.on ? html`<span class=${cls}>${cased(w.t)}</span>` : cased(w.t));
  };
  // Each row that changed: paired by its label, or else in order; a row only on one side is all of it marked.
  function Rows({ was, now }) {
    const key = r => Tree.norm(r.label ?? ''), left = [...was], right = [...now], pairs = [];
    for (const r of [...right]) { const k = left.findIndex(l => key(l) === key(r)); if (k >= 0) { pairs.push([left[k], r]); left.splice(k, 1); right.splice(right.indexOf(r), 1); } }
    while (left.length && right.length) pairs.push([left.shift(), right.shift()]);
    const changed = [...pairs.filter(([a, b]) => a.formula !== b.formula || a.label !== b.label), ...left.map(a => [a, null]), ...right.map(b => [null, b])];
    return changed.map(([a, b]) => { const [p, q] = wordDiff(a?.formula ?? '', b?.formula ?? ''); return html`<div class="hist-rule">
      ${(b ?? a).label ? html`<div class="lab">${(b ?? a).label}</div>` : null}
      ${a ? html`<div class="was"><span class="ba">Before</span><span class="fm">${inks(p, 'del')}</span></div>` : null}
      ${b ? html`<div class="now"><span class="ba">After</span><span class="fm">${inks(q, 'add')}</span></div>` : null}</div>`; });
  }
  // What's under a line of an entry opened: what a value was and is, or a definition's rows.
  const lineMore = l => html`${l.rows ? html`<${Rows} was=${l.rows.was} now=${l.rows.now} />` : null}${l.was != null
    ? html`<div class="hist-val">From <span class="del">${l.was}</span>${l.now != null ? html` to <span class="add">${l.now}</span>` : null}</div>` : null}`;

  // Picking a change shows the chart as it stood just after it; back at now, the view picked from shows again where the
  // past took it away (a view not yet made then). A view gone to by a hand while it stood stays.
  let home = null, unlayer = null;
  const stand = c => { if (!Shell.time.peek()?.stood) home = Shell.view.peek(); Shell.at({ stood: c.id, at: c.when }); };
  function now() {
    const took = !App.views.peek().some(v => v.id === home);
    if (Shell.time.peek()?.stood) { Shell.at(null); go(Shell.view.peek()); }
    if (took && home && home !== Shell.view.peek() && App.views.peek().some(v => v.id === home)) Shell.show(home, { replace: true });
    home = null;
  }
  const dayLabel = when => {
    const k = Tree.isoOf(new Date(when)), today = Log.today(), y = Tree.isoOf(new Date(Date.now() - 864e5));
    return k === today ? 'Today' : k === y ? 'Yesterday' : short(k);
  };
  const clock = when => new Date(when).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  // What keeps a change from being undone from History: the first later change that took a row it added, which must be
  // undone first; or null.
  const blocker = c => {
    const all = ever.peek().changes, mine = new Set(c.adds.map(r => r.id)), reversed = new Set(all.filter(x => x.reverses).map(x => x.reverses));
    return all.filter(x => x.id !== c.id && x.removes.some(id => mine.has(id)) && !reversed.has(x.id)).at(-1) ?? null;
  };
  // Every later change a change's reverse takes with it, by name: what's recorded at what it leaves with no row, which holds
  // no longer once that's gone. Of each, the part about that; with who made it and when.
  function takenBy(c, left = null) {
    const { recs, rows, at } = ever.peek(), wb = App.wb, chart = App.chart.peek(), backs = new Set(c.removes.map(id => rows.get(id)?.record));
    // (`left`, for an amendment: what it would leave with no row, the act made again keeping the rest.)
    const gone = left ?? [...new Set(c.adds.filter(r => 'record' in r).map(r => r.record))].filter(id => !backs.has(id) && wb.item(chart, id).length <= c.adds.filter(r => r.record === id).length);
    if (!gone.length) return [];
    const near = Tree.dependents(recs, gone), from = at.get(c.id);
    return entries.peek().filter(e => at.get(e.change.id) > from && !struck(e) && !e.change.reverses && e.change.adds.some(r => near.has(r.record)))
      .map(e => `${headOf(read(e.change, near))} (${e.change.who}, ${short(Tree.isoOf(new Date(e.change.when)))})`);
  }
  // Undo this change: the window's bar first, saying what it reverses and every later change it takes with it, the chart
  // redlined as it would leave it; made by its verb or Enter, dropped by Esc or Discard.
  function undoing(e) {
    const last = lastOf(e), redo = struck(e), what = describe(e.change), taken = takenBy(last);
    now();
    App.stage({ verb: redo ? 'Redo' : 'Undo', what, source: `undo ${last.id}`, reverse: last.id, make: tx => tx.reverse(last.id), from: null,
      parts: [html`<span class=${redo ? 'add' : 'del'}>${what}</span>`, ...(taken.length ? [html`Takes with it: ${taken.map((t, i) => html`${i ? '; ' : ''}<span class="del">${t}</span>`)}`] : [])] });
  }

  function History() {
    const t = Shell.time.value, E = ever.value, m = mode.value, ref = useRef(), k = kind.value, sel = Shell.selection.value, unfold = unfolded.value, opened = opens.value, viewing = App.viewing.value, asking = App.pending.value?.reverse;
    worked.value;
    const { recs } = E, N = notesNow(), rule = focus.value?.rule ? focus.value : null, of = rule ? [] : (focus.value ?? []).filter(id => recs[id]);
    const near = rule ?? (of.length ? Tree.dependents(recs, of) : null);
    const nameOf = id => { const [what, whose] = said(recs, id, N); return recs[id].args ? `${what}: ${whose}` : Tree.isObject(recs[id]) || !whose ? whose || what : `${what} of ${whose}`; };
    const touches = c => [...c.adds, ...c.removes.map(id => E.rows.get(id)).filter(Boolean)]
      .some(r => rule ? 'note' in r && !r.view && rule.rule.has(Tree.key(r.pattern)) && r.label !== 'Order' : near.has(r.record) || ('note' in r && [...Tree.idsIn(r.pattern)].some(id => near.has(id))));
    const linesOf = c => near && !c.amends ? read(c, near) : reading(c);
    const changes = m === 'all' ? entries.value.filter(e => standing(e) && (k === 'all' || kindsOf(e.change).has(k)) && (!near || (touches(e.change) && linesOf(e.change).length))).reverse() : [];
    const gone = m === 'deleted' ? deleted().filter(d => !near || near.has(d.item)) : [];
    useLayoutEffect(() => { ref.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'center' }); }, [t?.stood]);
    // What the status did, worked out after the panel is drawn: what's opened or picked first, then rules, then the rest.
    useEffect(() => {
      const shown = changes.filter(e => !undone(e) && !e.change.about && movesStatus(e.change) && !known(e.change)).map(e => e.change), first = c => opened.has(c.id) || t?.stood === c.id ? 0 : isRule(c) ? 1 : 2;
      ask([...shown].sort((a, b) => first(a) - first(b)));
      return () => ask([]);
    }, [changes.length, E, t?.stood, opened]);
    const toggle = (s, x) => { const n = new Set(s.peek()); n.has(x) ? n.delete(x) : n.add(x); s.value = n; };
    const kinds = e => Shell.menu(e.currentTarget, KINDS.map(([x, label]) => ({ label, checked: k === x, run: () => { kind.value = x; } })));
    const selected = sel.filter(id => recs[id] && !of.includes(id));
    let lastDay = null;
    const row = e => {
      // An entry struck offers to redo it; what's in the log for it now is its last.
      const c = e.change, last = lastOf(e), off = struck(e), on = t?.stood === c.id, lines = linesOf(c), u = reversalOf(c), fx = known(c), has = lines.length > 1 || lines.some(l => l.sub.length || l.rows || l.was != null) || !!fx?.moved.length || !!fx?.which?.length || !!e.was, shows = opened.has(c.id);
      // What it was before it was changed, each step, each a click from the chart as it stood then.
      const before = []; for (let w = e.was; w; w = w.was) before.push(w);
      // A change that can be changed says so where it's read; one a later change rests on says that, as its Undo does.
      const act = !off && !viewing && !u ? actOf(c) : null, bar = act && barred(c);
      const day = dayLabel(c.when), head = !near && day !== lastDay ? html`<div class="hist-day">${day}</div>` : null;
      lastDay = day;
      const open_ = ev => { ev.stopPropagation(); if (!shows) ask([c, ...asked.filter(x => x !== c)]); toggle(opens, c.id); };
      const undoneBy = e.by && !struck(e.by) ? e.by.change.who : !e.by && off && e.chain.at(-1).who !== c.who ? e.chain.at(-1).who : null;
      // What's recorded at what's gone since went with it, though nothing undid it.
      const dark = !off && c.adds.length > 0 && c.adds.every(r => 'record' in r && Tree.argsOf(r).some(a => !E.live.has(a.at)));
      return html`${head}<div class=${'hist-row' + (off || dark ? ' undone' : '') + (asking === last.id ? ' asked' : '')} role="button" aria-selected=${on} onClick=${() => on ? now() : stand(c)}>
        ${has ? html`<button class="hist-chev" aria-expanded=${shows} aria-label=${shows ? 'Less' : 'What it holds'} data-tip=${shows ? 'Less' : 'What it holds'} onClick=${open_}>${Shell.icon(shows ? 'chevron-up' : 'chevron')}</button>` : null}
        <div class="what">${u ? html`${u.word}: <button class="lk" onClick=${ev => { ev.stopPropagation(); stand(u.root); }}>${describe(u.root)}</button>`
          : lines.length > 1 ? html`${lines[0].text}, <button class="lk more" onClick=${open_}>and ${lines.length - 1} more</button>` : lines[0]?.text ?? 'Changed the chart'}</div>
        ${App.wb.reasons(c.id).map(r => html`<div class="note">${r.text}${r.own ? null : html`<span class="by"> · ${r.who}, ${short(Tree.isoOf(new Date(r.when)))}</span>`}</div>`)}
        <div class="meta">${near ? `typed ${short(Tree.isoOf(new Date(c.when)))}, ${c.who}` : `${c.who} · ${clock(c.when)}`}${off ? ' · undone' : dark ? ' · gone with what it’s at' : ''}${undoneBy ? html` by ${e.by ? html`<button class="lk" onClick=${ev => { ev.stopPropagation(); stand(e.by.change); }}>${undoneBy}</button>` : undoneBy}` : null}${act ? html` · <button class="lk change" aria-disabled=${bar ? 'true' : null} data-tip=${bar ? `A later change rests on it: ${describe(bar)}` : null} onClick=${ev => { ev.stopPropagation(); if (bar) stand(bar); else { now(); App.amending(c); } }}>Change…</button>` : null}${!viewing && !off && !c.about && !u ? html` · <button class="lk why-add" onClick=${ev => { ev.stopPropagation(); giving.value = c.id; }}>Why…</button>` : null}</div>
        ${giving.value === c.id ? html`<${Reason} id=${c.id} done=${() => { giving.value = null; }} />` : null}
        ${fx?.moved.length ? html`<div class="effect">${fx.moved.map(x => `${SAID[x.k]} ${x.was} → ${x.now}`).join(' · ')}</div>` : null}
        ${fx?.said ? html`<div class="effect said">${fx.said}</div>` : null}
        ${shows ? html`<div class="hist-more" onClick=${ev => ev.stopPropagation()}>
          ${lines.map(l => html`${lines.length > 1 ? html`<div class="ln">${l.text}</div>` : null}${lineMore(l)}${l.sub.map(s => html`<div class="ln sub">${s.text}</div>${lineMore(s)}`)}`)}
          ${before.length ? html`<div class="st">Before</div>${before.map(w => html`<div class="ln sub"><button class="lk" onClick=${() => stand(w.change)}>${describe(w.change)}</button> <span class="fig">${w.change.who}, ${short(Tree.isoOf(new Date(w.change.when)))}</span>${App.wb.reasons(w.change.id).map(r => html`<div class="note">${r.text}</div>`)}</div>`)}` : null}
          ${(fx?.which ?? []).map(w => html`<div class="st">${w.said}</div>${w.names.map(n => html`<div class="ln sub">${n}</div>`)}`)}
          ${fx?.cleared.length ? html`<div class="st">Cleared</div>${fx.cleared.map(w => html`<div class="ln sub">${[w.what, w.where].filter(Boolean).join(' · ')}${w.figure ? html` <span class="fig">${w.figure}</span>` : null}</div>`)}` : null}
          ${fx?.appeared.length ? html`<div class="st">Appeared</div>${fx.appeared.map(w => html`<div class="ln sub">${[w.what, w.where].filter(Boolean).join(' · ')}${w.figure ? html` <span class="fig">${w.figure}</span>` : null}</div>`)}` : null}
        </div>` : null}
        ${on && !viewing ? html`<div class="acts"><button class="btn" disabled=${!App.wb.canReverse(last.id)} onClick=${ev => { ev.stopPropagation(); undoing(e); }}>${off ? 'Redo this change' : 'Undo this change'}</button>
          ${App.wb.canReverse(last.id) ? null : html`<span class="why">${blocker(last) ? html`A later change touches it: <button class="lk" onClick=${ev => { ev.stopPropagation(); stand(blocker(last)); }}>undo that</button> first` : 'It has changed since'}</span>`}</div>` : null}
      </div>`;
    };
    // A change and its undo cancel: each run of them is one line, opened by a click, so testing leaves no clutter over
    // others' work.
    const runs = [];
    for (const e of changes) { const last = runs.at(-1); if (undone(e) && last?.undone) last.es.push(e); else runs.push({ undone: undone(e), es: [e] }); }
    return html`<div class="hist">
      <div class="hist-head">
        <span class="title">History</span>
        <div class="menu-seg">${[['all', 'Changes'], ['deleted', 'Deleted']].map(([x, label]) => html`<button aria-pressed=${m === x} onClick=${() => { mode.value = x; }}>${label}</button>`)}</div>
        <button class="btn icon" aria-label="Close" data-tip="Close" data-keys="Esc" onClick=${close}>${Shell.icon('x')}</button>
      </div>
      ${m === 'all' || of.length || rule ? html`<div class="hist-filter">
        ${of.length || rule ? html`<div class="of">Changes to ${rule ? rule.name : of.map(nameOf).join(', ')}</div>` : null}
        <div class="by">${m === 'all' ? html`<button class="btn ghost dd" aria-haspopup="menu" onClick=${kinds}>${KINDS.find(([x]) => x === k)[1]}</button>` : null}
          ${selected.length && !of.length && !rule ? html`<button class="btn ghost only" onClick=${() => { focus.value = selected; }}>Only ${selected.length === 1 ? nameOf(selected[0]) : `these ${selected.length}`}</button>` : null}
          ${of.length || rule || (k !== 'all' && m === 'all') ? html`<button class="btn every" onClick=${everything}>All changes</button>` : null}</div>
      </div>` : null}
      <div class="hist-list" ref=${ref}>
        ${m === 'all' ? runs.map(({ undone: cancels, es }) => {
          if (!cancels) return es.map(row);
          const key = es[0].change.id, shows = unfold.has(key) || es.some(e => e.change.id === t?.stood), day = dayLabel(es[0].change.when), head = !near && day !== lastDay ? html`<div class="hist-day">${day}</div>` : null;
          lastDay = day;
          return html`${head}<button class="hist-fold" aria-expanded=${shows} onClick=${() => toggle(unfolded, key)}>${Shell.icon(shows ? 'chevron-up' : 'chevron')}<span>${es.length === 1 ? '1 change undone' : `${es.length} changes undone`}</span></button>${shows ? es.map(row) : null}`;
        }) : gone.map(d => html`<div class="hist-row gone">
            <div class="what">${d.text}</div>
            <div class="meta">${d.ended ? `${d.word ?? 'Ended'} ${short(d.ended)} · ` : ''}${d.who} · ${d.when ? dayLabel(d.when) : ''}</div>
            ${App.viewing.value ? null : html`<button class="btn" onClick=${() => { now(); d.ended ? unend(d) : App.restore(d.item); }}>Restore</button>`}
          </div>`)}
        ${(m === 'all' ? changes : gone).length ? null : html`<div class="empty">${m === 'all' ? 'No changes' : 'Nothing deleted'}</div>`}
      </div>
    </div>`;
  }
  // A reason given an entry afterwards: typed in the entry, Enter making it a change that says so.
  const giving = signal(null);
  function Reason({ id, done }) {
    const box = useRef();
    useLayoutEffect(() => { box.current?.focus(); }, []);
    const key = e => {
      e.stopPropagation();
      if (e.key === 'Escape') done();
      else if (e.key === 'Enter') { e.preventDefault(); const text = e.target.value; done(); App.annotate(id, text); }
    };
    return html`<label class="why-in" onClick=${e => e.stopPropagation()}><span>Why</span><input class="cell" ref=${box} spellcheck=${false} autocomplete="off" aria-label="Why" onKeyDown=${key} onBlur=${done} /></label>`;
  }
  // A rule's changes, the last last, for its page: what's said at its pattern, or any wider it goes by (`keys`, Tree.key's), as its
  // own History lists them. Each { change, who, when, reasons, fx }, fx what it did as worked out, asked for once it's shown.
  function ruleLog(keys) {
    // (As it stood, what had been said by then.)
    const k = new Set(keys), E = ever.value, t = Shell.time.value, upto = t?.stood ? t.at ?? E.byId.get(t.stood)?.when : null, all = [...entries.value].filter(e => !struck(e) && !e.change.about && !e.change.reverses && (!upto || e.change.when <= upto)
      && [...e.change.adds, ...e.change.removes.map(id => E.rows.get(id)).filter(Boolean)].some(r => 'note' in r && !r.view && k.has(Tree.key(r.pattern)) && r.label !== 'Order'));
    worked.value;
    return all.map(e => ({ change: e.change, who: e.change.who, when: e.change.when, reasons: App.wb.reasons(e.change.id), fx: known(e.change), head: e.change.says ?? headOf(read(e.change, { rule: k })) }));
  }
  const everything = () => { focus.value = null; kind.value = 'all'; };
  // History takes the inspector's place while it's open: the chart's, everything, from the chart menu, or a record's own.
  // Esc takes back an undo being asked, comes back from a change picked to now, and then closes it.
  function openHistory(list) {
    if (list) mode.value = list;
    if (open.peek()) return;
    open.value = true;
    Shell.aside(History);
    unlayer = Shell.layer(() => App.pending.peek()?.reverse ? App.discard() : Shell.time.peek()?.stood ? now() : close());
  }
  function ofRecords(ids) {
    focus.value = ids;
    kind.value = 'records';
    openHistory('all');
  }
  // A rule's own: every change to what's said at its pattern, each by that alone. `keys`, the patterns it goes by; `name`, what it's called.
  function ofRule(keys, name) {
    focus.value = { rule: new Set(keys), name };
    kind.value = 'all';
    openHistory('all');
  }
  function close() {
    if (!open.peek()) return;
    open.value = false;
    Shell.aside(null);
    unlayer();
    everything();
    now();
  }
  Shell.register('action', { id: 'history', name: 'History', names: ['Changes', 'Audit trail', 'Log', 'Who changed'], menu: 'chart', order: 10, run: () => { if (open.peek() && !focus.peek() && kind.peek() === 'all' && mode.peek() === 'all') close(); else { everything(); openHistory('all'); } } });
  // Its list of what's deleted, which Find reaches by what's done there too.
  Shell.register('action', { id: 'history.deleted', name: 'History › Deleted', names: ['Restore'], run: () => openHistory('deleted') });

  // ---- The past looks past: a band across the view, saying the moment shown, and the way back ----
  function Band() {
    const t = Shell.time.value;
    // A look at another day on a page that keeps one, said where the eye is, as the date control says it. (A what-if's own day
    // its bar says.)
    if (looking() && !App.ownDay.value) {
      const v = App.views.value.find(x => x.id === Shell.view.value), can = !App.readOnly.value;
      return html`<div class="pastband" role="status"><span>${v.name} keeps ${short(v.keeps)}</span><button class="btn" disabled=${!can} title=${can ? null : App.whyNot()} onClick=${() => keep(v.id, App.day.peek())}>Keep this instead</button><button class="btn" onClick=${() => Shell.at({ asOf: v.keeps })}>Back</button></div>`;
    }
    if (!t?.stood) return null;
    const at = t.at ?? ever.value.byId.get(t.stood)?.when;
    if (!at) return null;
    const d = new Date(at), iso = Tree.isoOf(d);
    return html`<div class="pastband" role="status"><span>As it stood on ${iso.slice(0, 4) === Log.today().slice(0, 4) ? monthDay(iso) : short(iso)}, ${clock(at)}: everything as it was</span><button class="btn" onClick=${now}>Back to now</button></div>`;
  }

  // As of a day past, what's changed in a rule since, said where the rule is read: { day, who, stand }, the last change of its
  // formula made after that day, and a way to everything as it was; null where there's none, or today or a moment past is shown.
  function ruleSince(p) {
    const d = App.day.value, t = Shell.time.value;
    if (t?.stood || d >= Log.today() || !p) return null;
    const { changes } = ever.value, k = Tree.key(p), undone = new Set(changes.filter(c => c.reverses).map(c => c.reverses));
    const c = changes.filter(x => !x.reverses && !undone.has(x.id) && x.when.slice(0, 10) > d && x.adds.some(r => 'note' in r && r.label === 'Formula' && !r.view && Tree.key(r.pattern) === k)).at(-1);
    if (!c) return null;
    const before = changes.filter(x => x.when.slice(0, 10) <= d).at(-1);
    return { day: short(Tree.isoOf(new Date(c.when))), who: c.who, stand: before ? () => stand(before) : null };
  }
  // What's on the status lists, as of a day to come, that isn't on them as of today: a test of an item; null on any other day.
  function newSinceToday() {
    const today = Log.today();
    if (App.day.peek() <= today || Shell.time.peek()?.stood) return null;
    const had = new Set(Formulas.attention(App.workAt(today), App.notes.peek(), today).map(a => `${a.id}|${a.edge ?? ''}`));
    return it => !had.has(`${it.id}|${it.edge ?? ''}`);
  }

  return { events, whose, describe, looked, keep, pageDay, nextStep, showChanges, keepChanges, dayBefore, ruleSince, newSinceToday, open: openHistory, of: ofRecords, ofRule, ruleLog, ask: c => ask([c, ...asked.filter(x => x !== c)]), close, act: actOf, barred, takenBy, go: c => { openHistory('all'); stand(c); } };
})();
