// The New chart gallery (dendra.md, Workbook): one dialog, a row of cards, each a small real drawing of what it makes at one scale, drawn by Scene
// from its template's example records with bars for its words, its short name beneath, what it's for on hover; a name; which workbook it goes in; and, where this browser
// keeps house styles, the look to begin in. It begins on Blank. A click chooses a card, the keys going to its name; Enter, Begin or a double-click begins it. Like this chart is the last card where a chart's open.
const Gallery = (() => {
  const { html } = Shell;
  const { useState, useEffect, useRef } = preactHooks;
  const LIKE = 'like';
  const drawings = new Map();
  // One room for every card's drawing, in the scene's own units, so a box is one size in all of them: what won't fit makes its own room, and is smaller.
  const FRAME = { w: 560, h: 340 };
  // A name, short, and what its brackets say apart: "Fund structure (Investment Company Act)".
  const shortName = n => n.replace(/\s*\([^)]*\)\s*$/, ''), noteOf = n => /\(([^)]*)\)\s*$/.exec(n)?.[1] ?? null;
  // A template's card: its example records in a workbook of their own, drawn as they'd be, furniture aside. In no log, and the layouts
  // this browser keeps stay as they were.
  function drawingOf(t) {
    if (drawings.has(t.id)) return drawings.get(t.id);
    const kept = Layout.keepIn(null);
    let out = '';
    try {
      const wb = Log.open({ dendra: 1, changes: [] }), c = `example-${t.id}`, tx = wb.edit({ chart: c, who: '' });
      tx.add('chart', { name: t.name }, c);
      const ids = Templates.begin(tx, t, t.name);
      Templates.exampleOf(tx, t);
      const made = tx.commit();
      if (typeof made === 'string') throw new Error(made);
      const day = Log.today(), N = wb.notes(c), S = wb.schema(c), R = Formulas.computeState(wb.asOf(c, day), N.definitions(S), { relations: N.relations(S), schema: S });
      const v = t.rows.find(r => 'record' in r && !t.rows.some(n => n.label === 'Layout' && n.pattern.id === r.record))?.record;
      out = Export.sketch(Scene.of(wb, c, ids.get(v), day, { state: R.records, computed: R }), { bars: true, at: FRAME });
    } catch (e) { console.warn(`The ${t.name} card`, e); }
    Layout.keepIn(kept);
    drawings.set(t.id, out);
    return out;
  }
  // The chart shown, as Like this chart's card draws it: its first chart view, as it stands.
  function drawingOfShown() {
    const v = App.views.peek().find(x => x.layout === 'chart');
    if (!v) return '';
    const kept = Layout.keepIn(null);
    try { return Export.sketch(Scene.of(App.shown.peek(), App.chart.peek(), v.id, App.day.peek(), { state: App.state.peek(), computed: App.computed.peek() }), { bars: true, at: FRAME }); }
    catch { return ''; }
    finally { Layout.keepIn(kept); }
  }
  // A card's drawing comes a moment after the dialog does, so nothing's waited for. (A drawing is the app's own, from the template's records.)
  function Drawing({ make }) {
    const [svg, setSvg] = useState(null);
    useEffect(() => { const t = setTimeout(() => setSvg(make()), 0); return () => clearTimeout(t); }, []);
    return svg ? html`<span class="gal-draw" aria-hidden="true" dangerouslySetInnerHTML=${{ __html: svg }} />` : html`<span class="gal-draw" aria-hidden="true" />`;
  }
  function Body({ cards, choice, begin, book }) {
    const [at, setAt] = useState(choice.at), [look, setLook] = useState(''), [apart, setApart] = useState(choice.workbook), row = useRef(), naming = useRef();
    const styles = typeof FormatBar === 'undefined' ? [] : FormatBar.houseStyles();
    const take = id => { setAt(id); choice.at = id; };
    // The arrows go from card to card, from the name too while nothing's typed in it, where they've nothing else to do; there, the keys stay.
    const keys = e => {
      const inName = e.target.matches?.('input');
      if (e.key === 'Enter' && e.target.matches?.('.gal-card')) { e.preventDefault(); begin(); return; }
      if (inName && e.target.value) return;
      const i = cards.findIndex(c => c.id === at), to = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? cards.length - 1 : null;
      if (to === null || to < 0 || to >= cards.length) return;
      e.preventDefault();
      take(cards[to].id);
      if (!inName) row.current?.querySelector(`[data-card="${CSS.escape(cards[to].id)}"]`)?.focus();
    };
    return html`<div class="gallery" onKeyDown=${keys}>
      <div class="gal-row" role="radiogroup" aria-label="What to begin from" ref=${row}>
        ${cards.map(c => html`<button type="button" key=${c.id} class=${'gal-card' + (c.id === at ? ' on' : '')} role="radio" aria-checked=${c.id === at} aria-label=${c.name} tabindex=${c.id === at ? 0 : -1} data-card=${c.id} data-tip=${noteOf(c.name)}
          onClick=${() => { take(c.id); naming.current?.focus(); }} onDblClick=${() => { take(c.id); begin(); }} onFocus=${() => take(c.id)}><${Drawing} make=${c.draw} /><span class="gal-name">${shortName(c.name)}</span></button>`)}
      </div>
      <div class="settings gal-more">
        <label class="field"><span>Name</span><input aria-label="Name" placeholder="Untitled" spellcheck="false" autocomplete="off" autofocus ref=${el => { naming.current = el; if (el && !el.dataset.on) { el.dataset.on = 1; setTimeout(() => el.focus()); } }} onInput=${e => { choice.name = e.target.value; }} /></label>
        ${book ? html`<div class="field"><span>Goes in</span><${Shell.Pick} label="Goes in" wide=${true} value=${apart ? 'new' : 'here'} options=${[['here', book], ['new', 'A new workbook']]} onPick=${v => { setApart(v === 'new'); choice.workbook = v === 'new'; }} /></div>` : null}
        ${styles.length ? html`<div class="field"><span>Look</span><${Shell.Pick} label="Look" wide=${true} value=${look} options=${[['', at === LIKE ? 'The house look' : 'Its own'], ...styles.map(s => [s.name, s.name])]} onPick=${v => { setLook(v); choice.style = v || null; }} /></div>` : null}
      </div>
    </div>`;
  }
  // Begins what's chosen, on Blank till another is. `workbook`, in a workbook of its own, as it's asked; it says where it goes. → the change, or nothing where it's left.
  async function open({ workbook = false, then = null, first = false, title = workbook ? 'New workbook' : 'New chart' } = {}) {
    if (typeof Designs !== 'undefined' && Designs.editing.peek()) { Shell.toast('Finish the design first: Done or Discard'); return; }
    if (!workbook && App.readOnly.peek()) return Shell.toast(App.whyNot());
    const shown = !!App.chart.peek() && !first;
    const cards = [...Templates.list().map(t => ({ id: t.id, name: t.name, draw: () => drawingOf(t) })), ...(shown ? [{ id: LIKE, name: 'Like this chart', draw: drawingOfShown }] : [])];
    const choice = { at: cards[0].id, name: '', style: null, workbook };
    const book = await App.bookName?.();
    const go = await Shell.dialog({ title, width: 880, actions: [{ label: first ? 'Explore the example' : 'Cancel', value: false }, { label: first ? 'Create chart' : 'Begin', value: true, primary: true }],
      body: settle => html`${first ? html`<p class="gallery-intro">Start with a blank canvas, or choose a structure with fields and connections ready to use.</p>` : null}<${Body} cards=${cards} choice=${choice} book=${first || App.readOnly.peek() ? null : book} begin=${() => settle(true)} />` });
    if (!go) return;
    const style = choice.style && FormatBar.houseStyles().find(s => s.name === choice.style)?.look;
    const made = await App.begin({ template: choice.at === LIKE ? null : choice.at, style: style ?? null, name: choice.name, workbook: choice.workbook });
    then?.(made);
    return made;
  }
  return { open };
})();
