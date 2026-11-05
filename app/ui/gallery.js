// The New chart gallery (dendra.md, Workbook): one dialog, a row of cards, each a small real drawing of what it makes, drawn by Scene
// from its template's example records, its name beneath; a name; and, where this browser keeps house styles, the look to begin in.
// A click chooses a card, the keys going to its name; Enter, Begin or a double-click begins it. Like this chart is the last card where a chart's open.
const Gallery = (() => {
  const { html } = Shell;
  const { useState, useEffect, useRef } = preactHooks;
  const LIKE = 'like';
  const drawings = new Map();
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
      out = Export.sketch(Scene.of(wb, c, ids.get(v), day, { state: R.records, computed: R }));
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
    try { return Export.sketch(Scene.of(App.shown.peek(), App.chart.peek(), v.id, App.day.peek(), { state: App.state.peek(), computed: App.computed.peek() })); }
    catch { return ''; }
    finally { Layout.keepIn(kept); }
  }
  // A card's drawing comes a moment after the dialog does, so nothing's waited for. (A drawing is the app's own, from the template's records.)
  function Drawing({ make }) {
    const [svg, setSvg] = useState(null);
    useEffect(() => { const t = setTimeout(() => setSvg(make()), 0); return () => clearTimeout(t); }, []);
    return svg ? html`<span class="gal-draw" aria-hidden="true" dangerouslySetInnerHTML=${{ __html: svg }} />` : html`<span class="gal-draw" aria-hidden="true" />`;
  }
  function Body({ cards, choice, begin }) {
    const [at, setAt] = useState(choice.at), [look, setLook] = useState(''), row = useRef(), naming = useRef();
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
        ${cards.map(c => html`<button type="button" key=${c.id} class=${'gal-card' + (c.id === at ? ' on' : '')} role="radio" aria-checked=${c.id === at} tabindex=${c.id === at ? 0 : -1} data-card=${c.id}
          onClick=${() => { take(c.id); naming.current?.focus(); }} onDblClick=${() => { take(c.id); begin(); }} onFocus=${() => take(c.id)}><${Drawing} make=${c.draw} /><span class="gal-name">${c.name}</span></button>`)}
      </div>
      <div class="settings gal-more">
        <label class="field"><span>Name</span><input aria-label="Name" placeholder="Untitled" spellcheck="false" autocomplete="off" autofocus ref=${el => { naming.current = el; if (el && !el.dataset.on) { el.dataset.on = 1; setTimeout(() => el.focus()); } }} onInput=${e => { choice.name = e.target.value; }} /></label>
        ${styles.length ? html`<div class="field"><span>Look</span><${Shell.Pick} label="Look" wide=${true} value=${look} options=${[['', at === LIKE ? 'The house look' : 'Its own'], ...styles.map(s => [s.name, s.name])]} onPick=${v => { setLook(v); choice.style = v || null; }} /></div>` : null}
      </div>
    </div>`;
  }
  // Begins what's chosen. `workbook`, in a workbook of its own. → the change, or nothing where it's left.
  async function open({ workbook = false, then = null, title = workbook ? 'New workbook' : 'New chart' } = {}) {
    if (!workbook && App.readOnly.peek()) return Shell.toast(App.whyNot());
    const shown = !!App.chart.peek();
    const cards = [...Templates.list().map(t => ({ id: t.id, name: t.name, draw: () => drawingOf(t) })), ...(shown ? [{ id: LIKE, name: 'Like this chart', draw: drawingOfShown }] : [])];
    const last = Shell.store.get('template'), choice = { at: cards.some(c => c.id === last) ? last : cards[0].id, name: '', style: null };
    const go = await Shell.dialog({ title, width: 880, actions: [{ label: 'Cancel', value: false }, { label: 'Begin', value: true, primary: true }],
      body: settle => html`<${Body} cards=${cards} choice=${choice} begin=${() => settle(true)} />` });
    if (!go) return;
    Shell.store.set('template', choice.at);
    const style = choice.style && FormatBar.houseStyles().find(s => s.name === choice.style)?.look;
    const made = await App.begin({ template: choice.at === LIKE ? null : choice.at, style: style ?? null, name: choice.name, workbook });
    then?.(made);
    return made;
  }
  return { open };
})();
