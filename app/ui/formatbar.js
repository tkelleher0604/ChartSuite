// The format bar: one bar over the chart, in place of the ribbon. Insert adds a box of one of the chart's
// kinds, or a shape, a text box, a line or the key. A scope chip names what a change applies to: the
// selection, as in PowerPoint ("This box", "These 3 boxes"); its menu offers, under each style that reaches
// it, the groups of the style's outputs that do, as the Key says them, with their reach ("Funds (6)"). A
// change writes format notes: for the selection, at each record's own tree in the view; for a group, at each
// of its outputs' patterns in the view. A free shape keeps its formats in its row. Selecting a legend row
// engages its group, so the legend is the other way to restyle. A choice pointed at, Tidy's too, is drawn on
// the chart as it would be, PowerPoint's live preview, until the pointer leaves it.
const FormatBar = (() => {
const { h, render } = preact;
const html = htm.bind(h);
const { signal, effect } = preactSignals;

const FONTS = Scene.FONTS;
// Sizes and weights are shown and chosen as the slide has them: a size the page's, drawn smaller by its scale;
// a weight the slide's own, one of PowerPoint's.
const SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 24, 28, 32];
const WEIGHTS = [0.25, 0.5, 0.75, 1, 1.5, 2.25, 3, 4.5, 6];
// PowerPoint's colors, so a swatch means the same in both: its theme's ten columns (Background 1, Text 1,
// Background 2, Text 2 and the six accents), each with its tints and shades in PowerPoint's rows, then its ten
// standard colors.
const THEME = [
  '#ffffff', '#000000', '#e7e6e6', '#44546a', '#4472c4', '#ed7d31', '#a5a5a5', '#ffc000', '#5b9bd5', '#70ad47',
  '#f2f2f2', '#7f7f7f', '#d0cece', '#d6dce5', '#dae3f3', '#fbe5d6', '#ededed', '#fff2cc', '#deebf7', '#e2f0d9',
  '#d9d9d9', '#595959', '#afabab', '#adb9ca', '#b4c7e7', '#f8cbad', '#dbdbdb', '#ffe699', '#bdd7ee', '#c5e0b4',
  '#bfbfbf', '#404040', '#767171', '#8497b0', '#8faadc', '#f4b183', '#c9c9c9', '#ffd966', '#9dc3e6', '#a9d18e',
  '#a6a6a6', '#262626', '#3b3838', '#333f50', '#2f5597', '#c55a11', '#7c7c7c', '#bf9000', '#2e75b6', '#548235',
  '#7f7f7f', '#0d0d0d', '#181717', '#222a35', '#203864', '#843c0c', '#525252', '#7f6000', '#1f4e79', '#385723',
];
const STANDARD = ['#c00000', '#ff0000', '#ffc000', '#ffff00', '#92d050', '#00b050', '#00b0f0', '#0070c0', '#002060', '#7030a0'];
// And what PowerPoint calls them: a column's color and its place in the theme, and a row's tint or shade of
// it, which runs darker under White and Light Gray, lighter under Black, and both ways under the rest.
const COLUMNS = [['White', 'Background 1'], ['Black', 'Text 1'], ['Light Gray', 'Background 2'], ['Blue-Gray', 'Text 2'], ['Blue', 'Accent 1'],
  ['Orange', 'Accent 2'], ['Gray', 'Accent 3'], ['Gold', 'Accent 4'], ['Blue', 'Accent 5'], ['Green', 'Accent 6']];
const SHADES = { 0: ['Darker 5%', 'Darker 15%', 'Darker 25%', 'Darker 35%', 'Darker 50%'], 1: ['Lighter 50%', 'Lighter 35%', 'Lighter 25%', 'Lighter 15%', 'Lighter 5%'],
  2: ['Darker 10%', 'Darker 25%', 'Darker 50%', 'Darker 75%', 'Darker 90%'], accent: ['Lighter 80%', 'Lighter 60%', 'Lighter 40%', 'Darker 25%', 'Darker 50%'] };
const THEME_NAMES = THEME.map((_, i) => { const col = i % 10, row = Math.floor(i / 10); return [...COLUMNS[col], row ? (SHADES[col] ?? SHADES.accent)[row - 1] : null].filter(Boolean).join(', '); });
const STANDARD_NAMES = ['Dark Red', 'Red', 'Orange', 'Yellow', 'Light Green', 'Green', 'Light Blue', 'Blue', 'Dark Blue', 'Purple'];
const NAMES = new Map([...THEME.map((c, i) => [c, THEME_NAMES[i]]), ...STANDARD.map((c, i) => [c, STANDARD_NAMES[i]])].reverse());
// A color typed by its hex, as "#1F5FBF", "1f5fbf" or "#15b"; null for anything else.
const hexOf = s => { const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(s ?? '').trim()); return m ? `#${(m[1].length === 3 ? [...m[1]].map(c => c + c).join('') : m[1]).toLowerCase()}` : null; };
// The chart's own colors, as PowerPoint keeps its Recent Colors: those its formats give that aren't the palette's,
// the latest first.
const COLORED = new Set(['Fill', 'Outline', 'Color']);
function chartColors() {
  const rows = App.shown.peek().rows(App.chart.peek()), out = new Set();
  for (let i = rows.length - 1; i >= 0 && out.size < 10; i--) {
    const r = rows[i], given = 'note' in r ? (COLORED.has(r.label) ? [r.value] : []) : Object.entries(r.format ?? {}).filter(([l]) => COLORED.has(l)).map(([, v]) => v);
    for (const v of given) { const c = typeof v === 'string' && hexOf(v); if (c && !NAMES.has(c)) out.add(c); }
  }
  return [...out].slice(0, 10);
}
// PowerPoint's name for a color of its palette ("Blue, Accent 1, Lighter 80%"), where a color is in it twice
// the theme's; "None" for none; null for any other.
const colorName = c => c === 'none' ? 'None' : typeof c === 'string' ? NAMES.get(`#${c.replace(/^#/, '').toLowerCase()}`) ?? null : null;
// A slide's number for the page's, to the half point PowerPoint's sizes keep; and the page's for a slide's.
const page = () => Canvas.active.peek()?.scene()?.page;
const shown = v => typeof v === 'number' ? Math.round(Scene.toSlide(page(), v) * 2) / 2 : v;
const put = v => Math.round(Scene.fromSlide(page(), v) * 100) / 100;
const TEXT_LABELS = new Set(['Font', 'Size', 'Bold', 'Italic', 'Underline', 'Color', 'Align', 'Format']);
let current = null; // { canvas, scopes, scope, marks }

// ---- What the selection is, and what reaches it ----

function scopesOf(c) {
  const sc = c.scene(), keys = c.keys();
  // A group is formatted as its members.
  const picked = keys.map(k => sc.byId.get(Canvas.keyParts(k)[0])).filter(Boolean);
  const group = picked.length === 1 && picked[0].geometry === 'group' ? picked[0] : null;
  const marks = picked.flatMap(m => m.geometry === 'group' ? m.members.map(id => sc.byId.get(id)).filter(Boolean) : [m]);
  if (!marks.length) return { marks, scopes: [] };
  // The view's Styles rows (Scene.groupsOf, the Key's and Styles' rule and names). A Key row or a frame stands
  // for the rows it's drawn from, all of each, drawn here or not.
  const groups = Scene.groupsOf(App.notes.peek(), sc.view);
  const whole = (style, outputs) => { const gs = groups.filter(g => g.style === style && g.outputs.some(p => outputs.some(q => Tree.key(q) === Tree.key(p))));
    return { caption: gs[0]?.caption, outputs: gs.length ? gs.flatMap(g => g.outputs) : outputs }; };
  const rowKey = keys.length === 1 ? Canvas.keyParts(keys[0])[1] : null;
  if (rowKey) {
    const r = marks[0].rows?.find(x => x.key === rowKey), w = r && whole(r.style, r.outputs);
    if (r) return { marks, row: r, scopes: [{ key: 'row', caption: w.caption ?? r.caption.text, outputs: w.outputs, style: r.style }] };
  }
  const bound = marks.filter(m => m.type === 'box' || m.type === 'line');
  if (marks.some(m => m.type === 'frame')) {
    const f = marks.find(m => m.type === 'frame'), style = Tree.key(Tree.bare(f.output));
    return { marks, scopes: [{ key: 'frame', caption: f.caption.text, outputs: whole(style, f.outputs).outputs, style }] };
  }
  const own = { key: 'own', label: these(marks), own: true };
  if (!bound.length) return { marks, group, scopes: [own] };
  // Then the Styles rows that reach the selection, and only those: each with an output that a record in or at a
  // selected mark fits.
  const by = new Map();
  for (const m of bound) for (const r of Scene.reach(App.shown.peek(), App.chart.peek(), sc.view, sc, m.id, App.state.peek()))
    for (const g of groups) if (g.style === r.style && g.outputs.some(p => Tree.narrower(r.output, p))) {
      const key = `${g.style} ${g.key}`;
      if (!by.has(key)) by.set(key, { key, style: g.style, order: g.order, name: g.name, caption: g.caption, outputs: g.outputs });
    }
  return { marks, group, scopes: [own, ...[...by.values()].sort((a, b) => b.order - a.order)] };
}
// The selection, as a scope, by what's drawn: "This box", "These 3 boxes", "This line" (the lines drawn as one
// included), "These 2 shapes".
function these(ms) {
  const noun = ms.every(m => m.type === 'box') ? 'box' : ms.every(m => m.type === 'line' || m.geometry === 'line') ? 'line' : 'shape', n = new Set(ms.map(m => m.merged ?? m.id)).size;
  return n === 1 ? `This ${noun}` : `These ${n} ${noun === 'box' ? 'boxes' : `${noun}s`}`;
}
// What each style reaches in a scene: by style, its outputs there, each with its caption and its marks.
const reached = new WeakMap();
function reachOf(sc) {
  let by = reached.get(sc);
  if (by) return by;
  reached.set(sc, by = new Map());
  for (const m of sc.marks) if ((m.type === 'box' || m.type === 'line') && !m.revealed)
    for (const r of Scene.reach(App.shown.peek(), App.chart.peek(), sc.view, sc, m.id, App.state.peek())) {
      const outs = by.get(r.style) ?? by.set(r.style, new Map()).get(r.style), k = Tree.key(r.output);
      (outs.get(k) ?? outs.set(k, { output: r.output, caption: r.caption, marks: new Set() }).get(k)).marks.add(m.id);
    }
  return by;
}
// The marks a group reaches in a scene, as scopesOf finds them: those with a record whose output fits one of its.
const marksOf = (sc, s) => new Set([...reachOf(sc).get(s.style)?.values() ?? []].filter(o => s.outputs.some(p => Tree.narrower(o.output, p))).flatMap(o => [...o.marks]));
// A scope as it's named: the selection ("This box"), or a group of a style's outputs as the Key says it, with
// how many of the view's marks it reaches: "Funds (6)".
function named(c, s) {
  if (s.own) return s.label;
  return `${s.caption} (${marksOf(c.scene(), s).size})`;
}
// The scope a change goes to: the one chosen, or else the selection itself.
const chosen = signal(null);
const scopeOf = (scopes, key = chosen.peek()) => scopes.find(s => s.key === key) ?? scopes[0];
// The marks a group reaches that keep their own value of a property, entered for them alone in the view,
// which a change for the group leaves as it is (entered wins): each with the notes that decide it.
function keeping(c, scope, labels) {
  const sc = c.scene(), N = App.notes.peek(), out = [];
  if (!scope?.outputs) return out;
  for (const id of marksOf(sc, scope)) {
    const m = sc.byId.get(id), t = Tree.treeOf(App.state.peek(), m.record);
    const notes = labels.map(l => N.resolve(l, t, sc.view)?.note).filter(n => n && n.view === sc.view && n.pattern.id === m.record);
    if (notes.length) out.push({ m, notes });
  }
  return out;
}
// What a group is given in a view: the format properties noted at its outputs.
const givenTo = (view, scope) => [...new Set(App.notes.peek().styles(view).flatMap(st => st.outputs)
  .filter(o => scope.outputs.some(p => Tree.key(p) === Tree.key(o.pattern))).flatMap(o => Object.keys(o.formats)))].filter(l => l !== 'Shown' && l !== 'Caption');
// Who keeps their own: a box by its record's name, or how many.
const keepers = ks => ks.length === 1 ? App.notes.peek().nameOf(App.state.peek(), ks[0].m.record)
  : `${ks.length} ${ks.every(k => k.m.type === 'line') ? 'lines' : ks.every(k => k.m.type === 'box') ? 'boxes' : 'marks'}`;
const possessive = s => s.endsWith('s') ? `${s}’` : `${s}’s`;
const listed = xs => xs.length < 3 ? xs.join(' and ') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`;

// ---- Making a change ----

// What a change of one setting writes, on tx: for the selection, a format note at each record's own tree in
// the view, and a free shape's own format; for a style, a note at each of its outputs in the view.
function write(tx, c, label, value) {
  const { marks, scopes } = scopesOf(c), scope = scopeOf(scopes);
  if (!scope) return;
  const view = c.scene().view, tree = id => Tree.treeOf(App.state.peek(), id);
  if (scope.outputs) for (const p of scope.outputs) tx.note(label, p, value, { view });
  else for (const m of marks) {
    if (m.type === 'box' || m.type === 'line') tx.note(label, tree(m.record), value, { view });
    else if (m.type === 'shape') tx.update(m.id, { format: { ...App.shown.peek().item(App.chart.peek(), m.id)[0]?.format, [label]: value } });
  }
}
function apply(label, value) {
  const c = Canvas.active.peek();
  if (!c) return;
  preview();
  // A change for a group says at once what of it keeps its own, which the scope's menu then offers to clear.
  const scope = scopeOf(scopesOf(c).scopes), kept = keeping(c, scope, [label]);
  App.change(tx => write(tx, c, label, value), { say: kept.length ? `Changed ${label} for ${scope.caption}; ${keepers(kept)} ${kept.length > 1 ? 'keep their' : 'keeps its'} own` : null });
  // Keys go back to the chart, so the next change can be typed.
  requestAnimationFrame(() => c.root.focus({ preventScroll: true }));
}
// A choice pointed at, drawn on the chart as it would be: the change written, uncommitted, on the chart's
// rows, and the canvas asked to draw from them; for a size, laid out afresh, as the page may grow for it, and for
// Tidy, the chart laid out with nothing entered. With nothing, the chart is drawn as it is again. Each note tried
// is new, so nothing worked out from another is kept for it.
let tried = null, n = 0;
function preview(label, value) {
  const c = Canvas.active.peek(), key = label === undefined || App.readOnly.peek() ? null : JSON.stringify([label, value]);
  if (!c || key === tried) return;
  tried = key;
  if (!key) return c.restyle(null);
  if (label === 'Tidy') return c.restyle(c.tidied(), { moves: true });
  c.restyle(trying(c, label, value), label === 'Size' ? { moves: true } : undefined);
}
// The chart with a change written on its rows, uncommitted.
function trying(c, label, value) {
  const wb = App.shown.peek(), same = (r, l, k, view) => 'note' in r && r.label === l && (r.view ?? null) === (view ?? null) && !r.param && Tree.key(r.pattern) === k;
  let rows = wb.rows(App.chart.peek());
  write({
    note(l, pattern, v, { view } = {}) {
      const k = Tree.key(pattern), id = `·tried${++n}`;
      rows = rows.filter(r => !same(r, l, k, view));
      if (v !== undefined && v !== null) rows.push({ id, note: id, label: l, pattern, ...(view && { view }), value: v });
    },
    update(id, changes) { rows = rows.map(r => r.shape === id ? { ...r, ...changes } : r); },
  }, c, label, value);
  const notes = Notes.index(rows.filter(r => 'note' in r));
  return { ...wb, rows: () => rows, notes: () => notes };
}
// A size picked is the size on the slide, where the chart can keep a scale for it, and otherwise as near as the
// page allows, never shrinking the chart more than holding the scale would (Scene.toPage). Worked out once for
// each scene, selection and scope, as pointing at it previews it and picking it makes it.
const picks = new WeakMap();
function sized(v) {
  const c = Canvas.active.peek(), sc = c?.scene();
  if (!sc) return put(v);
  const k = JSON.stringify([c.keys(), chosen.peek(), v]), seen = picks.get(sc) ?? picks.set(sc, new Map()).get(sc);
  if (!seen.has(k)) {
    const r = t => Math.round(t * 100) / 100;
    const scaleAt = t => Scene.of(trying(c, 'Size', r(t)), App.chart.peek(), sc.view, sc.day, { state: App.state.peek(), computed: App.computed.peek(), ahead: true }).page.scale;
    seen.set(k, r(Scene.toPage(v, sc.page.scale, scaleAt)));
  }
  return seen.get(k);
}
// A setting's value on the selection: its first mark's, or its first text's for a text property (a frame's,
// its caption's).
function value(label) {
  const m = current?.marks[0];
  if (!m) return undefined;
  if (current.row) return current.row.swatch[label] ?? current.row.caption.look[label];
  // A frame is the style's, drawn round the boxes it reaches.
  if (label === 'Frame') {
    const outs = new Set((current.scope?.outputs ?? []).map(p => Tree.key(p)));
    return current.canvas.scene().marks.find(f => f.type === 'frame' && outs.has(Tree.key(f.output)))?.kind ?? 'none';
  }
  const text = m.texts?.[0] ?? m.caption;
  if (TEXT_LABELS.has(label) && text) return text.look?.[label] ?? text.settings?.[label]?.value;
  return m.settings?.[label]?.value ?? m.look?.[label];
}

// ---- The bar ----

const glyph = {
  fill: c => html`<span class="well"><svg class="glyph" viewBox="0 0 16 16"><path d="M3.5 7.5 8 3l4.5 4.5L8 12z" /></svg><i style=${`background:${c === 'none' ? 'transparent' : c}`} /></span>`,
  outline: c => html`<span class="well"><svg class="glyph" viewBox="0 0 16 16"><rect x="3" y="3" width="10" height="8" /></svg><i style=${`background:${c === 'none' ? 'transparent' : c}`} /></span>`,
  color: c => html`<span class="well"><span style="font: 600 13px/1 var(--sans); margin-top: -3px">A</span><i style=${`background:${c}`} /></span>`,
  line: () => html`<svg class="glyph" viewBox="0 0 16 16"><path d="M2 8h12" /></svg>`,
  arrow: () => html`<svg class="glyph" viewBox="0 0 16 16"><path d="M2 8h11M10 5l3 3-3 3" /></svg>`,
};
const dashGlyph = d => html`<svg viewBox="0 0 28 10"><path d="M1 5h26" stroke-width="1.5" stroke-dasharray=${d === 'dashed' ? '5 3' : d === 'dotted' ? '1.5 2.5' : null} stroke-linecap=${d === 'dotted' ? 'round' : 'butt'} /></svg>`;
const arrowGlyph = a => html`<svg viewBox="0 0 28 10"><path d="M3 5h22" stroke-width="1.3" />${a === 'end' || a === 'both' ? html`<path d="M21 2l4 3-4 3" stroke-width="1.3" />` : null}${a === 'start' || a === 'both' ? html`<path d="M7 2 3 5l4 3" stroke-width="1.3" />` : null}</svg>`;
const shapeGlyph = g => html`<svg class="glyph" viewBox="-1 -1 20 16"><path d=${Scene.path(g, 18, 14)} /></svg>`;

// The choices of one setting in a popover, each previewed while pointed at: a picked one is made, and
// closes the popover where `close` is given. The one the setting has takes the focus as it opens.
const choice = (label, v, close) => ({ onPointerEnter: () => preview(label, v), onClick: () => { close?.(); apply(label, v); } });
// PowerPoint's palette: the theme's colors, its standard colors and the chart's own; then, as its menu ends, No
// fill (or outline), and More colors, any color by its hex, drawn as it's typed and made with Enter.
const NONE = { Fill: 'No fill', Outline: 'No outline' };
function Palette({ label, none, close }) {
  const v = String(value(label)).toLowerCase(), own = chartColors();
  const swatch = (c, name) => html`<button style=${`background:${c}`} aria-pressed=${v === c} autofocus=${v === c} aria-label=${name} data-tip=${name} ...${choice(label, c, close)} />`;
  // Off the swatches, the chart is drawn in the color typed, while it's being typed.
  const rest = el => { const f = el.querySelector('.hex > input'), c = f === document.activeElement && hexOf(f.value); c ? preview(label, c) : preview(); };
  const typed = e => { const f = e.currentTarget; f.toggleAttribute('aria-invalid', !!f.value.trim() && !hexOf(f.value)); rest(f.closest('.palette')); };
  const entered = e => { const c = e.key === 'Enter' && hexOf(e.currentTarget.value); if (c) { close?.(); apply(label, c); } };
  return html`<div class="palette" onPointerLeave=${e => rest(e.currentTarget)}>${THEME.map((c, i) => swatch(c, THEME_NAMES[i]))}<i />${STANDARD.map((c, i) => swatch(c, STANDARD_NAMES[i]))}
    ${own.length ? html`<i />${own.map(c => swatch(c, c.toUpperCase()))}` : null}
    <div class="more">
      ${none ? html`<button class="menu-item" role="menuitemcheckbox" aria-checked=${v === 'none'} autofocus=${v === 'none'} ...${choice(label, 'none', close)}>
        <span class="label">${NONE[label]}</span>${v === 'none' ? Shell.icon('check') : null}</button>` : null}
      <label class="menu-item"><span class="label">More colors</span>
        <span class="hex">#<input value=${/^#[0-9a-f]{6}$/.test(v) ? v.slice(1).toUpperCase() : ''} maxlength="7" spellcheck="false" autocomplete="off" aria-label="More colors"
          onFocus=${e => e.currentTarget.select()} onInput=${typed} onKeyDown=${entered} /></span></label>
    </div></div>`;
}
const seg = (label, items, v, { as = x => x, close } = {}) => html`<div class="seg" onPointerLeave=${() => preview()}>${items.map(([k, text]) =>
  html`<button aria-pressed=${v === k} autofocus=${v === k} ...${choice(label, as(k), close)}>${text}</button>`)}</div>`;
// A popover of the bar's, whose preview ends as it closes.
const pop = (e, draw) => Shell.popover(e.currentTarget, close => draw(close), { placement: 'bottom-start', onClose: () => preview() });
// A menu of the bar's, whose items with `tries` ([label, value]) are previewed while the pointer is on them;
// they're found by their label, as the menu draws them. A second click on its button closes it.
let offered = null;   // { anchor, items }, while one is open
function offer(anchor, items, o = {}) {
  const it = offered?.anchor === anchor ? null : { anchor, items };
  offered = it;
  Shell.menu(anchor, items, { ...o, onClose: () => { if (offered === it) offered = null; preview(); } });
}
function pointed(e) {
  if (!offered) return;
  const label = e.target.closest?.('.float .menu-item')?.querySelector('.label')?.textContent;
  const it = label && offered.items.flatMap(x => [x, ...x.items ?? []]).find(x => x.label === label);
  it?.tries ? preview(...it.tries) : preview();
}
// A name cut short is shown whole on hover.
const whole = e => { const b = e.currentTarget, t = b.firstElementChild; if (t && t.scrollWidth > t.clientWidth) b.dataset.tip = t.textContent; else delete b.dataset.tip; };

const SHAPES = [['rect', 'Rectangle'], ['rounded', 'Rounded rectangle'], ['oval', 'Oval'], ['triangle', 'Triangle'], ['diamond', 'Diamond'], ['hexagon', 'Hexagon'],
  ['octagon', 'Octagon'], ['parallelogram', 'Parallelogram'], ['trapezoid', 'Trapezoid'], ['pentagon', 'Pentagon'], ['chevron', 'Chevron'], ['arrow', 'Arrow'], ['cylinder', 'Cylinder']];
// Insert: a box of each of the chart's kinds, a record named as it's typed; then the shapes PowerPoint has.
function insertMenu(e, c) {
  const item = (label, run, close) => html`<div class="menu-item" role="menuitem" tabindex="-1" onClick=${() => { close(); run(); }}
    onKeyDown=${ev => { if (ev.key === 'Enter') { close(); run(); } }}><span class="label">${label}</span></div>`;
  const kinds = Canvas.kinds();
  Shell.popover(e.currentTarget, close => html`<div class="insert" role="menu">
    ${App.readOnly.peek() ? null : kinds.map(k => item(k, () => c.create(k), close))}${kinds.length && !App.readOnly.peek() ? html`<div class="menu-sep" />` : null}
    <div class="shapes">${SHAPES.map(([g, name]) => html`<button aria-label=${name} data-tip=${name} onClick=${() => { close(); c.insert(g); }}>${shapeGlyph(g)}</button>`)}</div>
    <div class="menu-sep" />
    ${[['text', 'Text box'], ['line', 'Line'], ['arrow-line', 'Arrow'], ['frame', 'Frame'], ['legend', 'Key'], ['picture', 'Picture']].map(([g, name]) =>
      item(name, () => g === 'picture' ? picture(c) : c.insert(g), close))}
  </div>`, { placement: 'bottom-start' });
}
function picture(c) {
  const input = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*' });
  input.onchange = () => {
    const f = input.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => { const img = new Image(); img.onload = () => { const w = Math.min(240, img.width), k = w / img.width; c.insert('picture', { src: r.result, w, h: Math.round(img.height * k) }); }; img.src = r.result; };
    r.readAsDataURL(f);
  };
  input.click();
}

// While the inspector is widened over the chart there's nothing here to format.
function Bar() {
  App.scene.value; Shell.selection.value;
  const c = Canvas.active.value;
  if (!c || !c.scene() || Shell.wide.value) return html`<div class="fb" hidden=${Shell.wide.value} />`;
  const s = scopesOf(c), scope = scopeOf(s.scopes, chosen.value);
  current = { canvas: c, ...s, scope };
  const none = !s.marks.length, lineOnly = s.marks.length && s.marks.every(m => m.type === 'line' || m.geometry === 'line');
  const any = !none, boxy = any && !lineOnly && !s.marks.every(m => m.type === 'frame');
  const set = (label, v) => apply(label, v);
  const toggle = label => set(label, !value(label));
  const zoom = Math.round(Canvas.zoom.value * 100);
  const placeable = s.marks.filter(m => m.type === 'box' || m.type === 'shape').length;
  const aligns = [
    { head: 'Text' }, ...[['left', 'Left'], ['center', 'Center'], ['right', 'Right']].map(([a, label]) => ({ label, checked: value('Align') === a, run: () => set('Align', a), tries: ['Align', a] })),
    '-', { head: placeable > 1 ? 'Shapes' : 'To the page' },
    ...[['left', 'Align left'], ['center', 'Align center'], ['right', 'Align right'], ['top', 'Align top'], ['middle', 'Align middle'], ['bottom', 'Align bottom']].map(([a, label]) => ({ label, disabled: !placeable, run: () => c.align(a) })),
    '-', { label: 'Distribute across', disabled: placeable < 3, run: () => c.distribute('across') }, { label: 'Distribute down', disabled: placeable < 3, run: () => c.distribute('down') },
    { label: 'Same width', disabled: placeable < 2, run: () => c.match('width') }, { label: 'Same height', disabled: placeable < 2, run: () => c.match('height') },
  ];
  const orders = [
    { label: 'Bring to front', keys: '$mod+Shift+]', run: () => c.order('front') }, { label: 'Bring forward', keys: '$mod+]', run: () => c.order('forward') },
    { label: 'Send backward', keys: '$mod+[', run: () => c.order('backward') }, { label: 'Send to back', keys: '$mod+Shift+[', run: () => c.order('back') },
  ];
  const grouping = s.group ? { label: 'Ungroup', keys: '$mod+Shift+G', run: () => c.ungroup() } : { label: 'Group', keys: '$mod+G', disabled: placeable < 2, run: () => c.group() };
  // Tidy lays the whole view out again, with nothing to do where nothing in it was placed by hand; pointed
  // at, it's drawn as it would be. Made, the change ends the preview.
  const view = c.scene().view, tidy = { label: 'Tidy', disabled: App.readOnly.peek() || !App.notes.peek().notes('Position').some(n => n.view === view),
    run: () => { tried = null; c.tidy(); }, tries: ['Tidy'] };
  // The selection; each style's groups under its name; then, apart, each style whose one group is named as
  // the style is (Name), so it reads as under none of the heads; and, where members of the group chosen keep
  // their own look of what the group is given here, a way to clear it.
  const scopes = () => {
    const blocks = new Map(), item = x => ({ label: named(c, x), checked: x === scope, run: () => { chosen.value = x.key; } });
    for (const x of s.scopes.filter(x => !x.own)) (blocks.get(x.style) ?? blocks.set(x.style, []).get(x.style)).push(x);
    const all = [...blocks.values()], lone = xs => xs.length === 1 && (!xs[0].name || Tree.same(xs[0].caption, xs[0].name));
    const kept = scope?.outputs ? keeping(c, scope, givenTo(view, scope)) : [], whose = kept.length && possessive(keepers(kept));
    const what = listed([...new Set(kept.flatMap(k => k.notes.map(n => n.label)))]);
    const clear = kept.length ? [{ label: `Clear ${whose} own ${what}`, disabled: App.readOnly.peek(),
      run: () => App.change(tx => kept.forEach(k => k.notes.forEach(n => tx.remove(n.note))), { say: `Cleared ${whose} own ${what}` }) }] : [];
    return [s.scopes.filter(x => x.own).map(item), all.filter(xs => !lone(xs)).flatMap(xs => [{ head: xs[0].name }, ...xs.map(item)]), all.filter(lone).flat().map(item), clear]
      .filter(p => p.length).flatMap((p, i) => i ? ['-', ...p] : p);
  };
  return html`<div class="fb" onMouseDown=${e => { if (e.target.closest('button')) e.preventDefault(); }}>
    <button class="btn dd" data-fb="insert" onClick=${e => insertMenu(e, c)}>Insert</button>
    <span class="sep" />
    ${none ? null : html`<button class=${'btn dd scope' + (scope?.own ? ' own' : '')} data-fb="scope" onPointerOver=${whole} onClick=${e => Shell.menu(e.currentTarget, scopes())}>
      <span>${scope && named(c, scope)}</span></button>`}
    <button class="btn dd font" data-fb="font" disabled=${none} onClick=${e => offer(e.currentTarget, FONTS.map(f => ({ label: f, checked: value('Font') === f, run: () => set('Font', f), tries: ['Font', f] })))}>
      <span>${any ? value('Font') : 'Arial'}</span></button>
    <button class="btn dd size" data-fb="size" disabled=${none} onClick=${e => offer(e.currentTarget, SIZES.map(z => ({ label: String(z), checked: shown(value('Size')) === z, run: () => set('Size', sized(z)), get tries() { return ['Size', sized(z)]; } })))}>
      <span>${any ? shown(value('Size')) : 10}</span></button>
    <button class="btn letter b" aria-label="Bold" data-tip="Bold" data-keys="Ctrl+B" aria-pressed=${any && !!value('Bold')} disabled=${none} onClick=${() => toggle('Bold')}>B</button>
    <button class="btn letter i" aria-label="Italic" data-tip="Italic" data-keys="Ctrl+I" aria-pressed=${any && !!value('Italic')} disabled=${none} onClick=${() => toggle('Italic')}>I</button>
    <button class="btn letter u" aria-label="Underline" data-tip="Underline" data-keys="Ctrl+U" aria-pressed=${any && !!value('Underline')} disabled=${none} onClick=${() => toggle('Underline')}>U</button>
    <button class="btn dd" aria-label="Text color" data-tip="Text color" data-fb="color" disabled=${none} onClick=${e => pop(e, close => html`<${Palette} label="Color" close=${close} />`)}>${glyph.color(any ? value('Color') : '#000000')}</button>
    <span class="sep" />
    <button class="btn dd" aria-label="Shape" data-tip="Shape" data-fb="shape" disabled=${!boxy} onClick=${e => pop(e, close => html`<div class="shapes" onPointerLeave=${() => preview()}>${SHAPES.map(([g, name]) => html`<button aria-label=${name} data-tip=${name} ...${choice('Shape', g, close)}>${shapeGlyph(g)}</button>`)}</div>`)}>${shapeGlyph(boxy ? value('Shape') ?? s.marks[0].geometry ?? 'rect' : 'rect')}</button>
    <button class="btn dd" aria-label="Fill" data-tip="Fill" data-fb="fill" disabled=${!boxy} onClick=${e => pop(e, close => html`<${Palette} label="Fill" none close=${close} />`)}>${glyph.fill(boxy ? value('Fill') : 'none')}</button>
    <button class="btn dd" aria-label="Outline" data-tip="Outline" data-fb="outline" disabled=${none} onClick=${e => pop(e, close => html`<${Palette} label="Outline" none close=${close} />`)}>${glyph.outline(any ? value('Outline') : 'none')}</button>
    <button class="btn dd" aria-label="Line" data-tip="Line" data-fb="line" disabled=${none} onClick=${e => pop(e, () => html`<div class="picker">
      <div class="row"><span class="k">Weight</span>${seg('Weight', WEIGHTS.map(w => [w, String(w)]), WEIGHTS.find(w => Math.abs(Scene.toSlide(page(), value('Weight')) - w) < 0.01))}</div>
      <div class="row"><span class="k">Dash</span>${seg('Dash', ['solid', 'dashed', 'dotted'].map(d => [d, dashGlyph(d)]), value('Dash'))}</div>
      ${s.marks.some(m => m.type === 'line') ? html`<div class="row"><span class="k">Route</span>${seg('Connector', [['elbow', 'Elbow'], ['straight', 'Straight']], value('Connector'))}</div>` : null}
      ${scope?.outputs && boxy ? html`<div class="row"><span class="k">Frame</span>${seg('Frame', [['none', 'None'], ['dashed', dashGlyph('dashed')], ['solid', dashGlyph('solid')], ['bracket', 'Bracket']], value('Frame') ?? 'none')}</div>` : null}
    </div>`)}>${glyph.line()}</button>
    <button class="btn dd" aria-label="Arrowheads" data-tip="Arrowheads" data-fb="arrow" disabled=${!lineOnly} onClick=${e => pop(e, close => html`<div class="picker">${seg('Arrow', ['none', 'end', 'start', 'both'].map(a => [a, arrowGlyph(a)]), value('Arrow'), { close })}</div>`)}>${glyph.arrow()}</button>
    <span class="sep" />
    <button class="btn dd wide" data-fb="align" disabled=${none} onClick=${e => offer(e.currentTarget, aligns)}>Align</button>
    <button class="btn dd wide" data-fb="order" disabled=${none} onClick=${e => Shell.menu(e.currentTarget, orders)}>Order</button>
    <button class="btn wide" data-fb="group" disabled=${grouping.disabled} onClick=${grouping.run}>${grouping.label}</button>
    <button class="btn wide" data-fb="tidy" disabled=${tidy.disabled} onClick=${tidy.run} onPointerEnter=${() => preview(...tidy.tries)} onPointerLeave=${() => preview()}>Tidy</button>
    <button class="btn dd narrow" data-fb="arrange" onClick=${e => offer(e.currentTarget, [{ label: 'Align', disabled: none, items: aligns }, '-', ...orders.map(o => ({ ...o, disabled: none })), '-', grouping, tidy])}>Arrange</button>
    <button class="btn dd zoom" data-fb="zoom" onClick=${e => Shell.menu(e.currentTarget, [{ label: 'Fit', keys: 'Shift+Digit1', run: () => c.zoom('fit') }, '-',
      ...[0.5, 0.75, 1, 1.5, 2].map(z => ({ label: `${z * 100}%`, checked: Math.abs(z * 100 - zoom) < 0.5, run: () => c.zoom(z) }))], { placement: 'bottom-end' })}>${zoom}%</button>
  </div>`;
}

function mount(el) {
  // Another selection is formatted as itself, until a style is chosen for it.
  const stopSel = effect(() => { Shell.selection.value; chosen.value = null; });
  render(html`<${Bar} />`, el);
  document.addEventListener('pointerover', pointed);
  const keys = Shell.keys({
    '$mod+KeyB': () => inCanvas() ? apply('Bold', !value('Bold')) : false,
    '$mod+KeyI': () => inCanvas() ? apply('Italic', !value('Italic')) : false,
    '$mod+KeyU': () => inCanvas() ? apply('Underline', !value('Underline')) : false,
  });
  return () => { stopSel(); keys(); document.removeEventListener('pointerover', pointed); preview(); render(null, el); };
}
const inCanvas = () => !!Canvas.active.peek()?.root.contains(document.activeElement) && !document.activeElement.closest('.dc-edit') && current?.marks.length;

Shell.register('formatbar', { mount });
return { apply, value, colorName };
})();
