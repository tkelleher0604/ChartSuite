// The format bar: one bar over the chart, in place of the ribbon. A scope chip names what a change applies to:
// the style that reaches the selection ("Feeder Fund") or "This box"; its menu lists every style that reaches
// it. A change writes format notes: for a style, at its output's pattern in the view; for This box, at the
// record's own tree in the view. A free shape keeps its formats in its row. Selecting a legend row engages its
// style, so the legend is the other way to restyle.
const FormatBar = (() => {
const { h, render } = preact;
const html = htm.bind(h);
const { signal, effect } = preactSignals;

const FONTS = Scene.FONTS;
const SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 24, 28, 32];
const WEIGHTS = [0.5, 0.75, 1, 1.5, 2, 3];
// Ink and greys, then the soft fills fund charts use, then stronger accents: the palette of a law firm's deck.
const COLORS = [
  '#000000', '#262626', '#404040', '#595959', '#7f7f7f', '#a6a6a6', '#d9d9d9', '#ffffff',
  '#e8eefb', '#e7f1ec', '#fdf3e1', '#f4ecf7', '#e6f3f5', '#fbe9e7', '#f4f4f5', '#f5f0e6',
  '#1f3864', '#2c4c7c', '#2e75b6', '#2e7d4f', '#9a6300', '#c2372b', '#7a3e8c', '#0e7490',
];
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
  const rowKey = keys.length === 1 ? Canvas.keyParts(keys[0])[1] : null;
  if (rowKey) {
    const r = marks[0].rows?.find(x => x.key === rowKey);
    if (r) return { marks, row: r, scopes: [{ key: 'row', label: r.caption.text, outputs: r.outputs, style: r.style }] };
  }
  const bound = marks.filter(m => m.type === 'box' || m.type === 'line');
  if (marks.some(m => m.type === 'frame')) {
    const f = marks.find(m => m.type === 'frame');
    return { marks, scopes: [{ key: 'frame', label: f.caption.text, outputs: [f.output], style: Tree.key(Tree.bare(f.output)) }] };
  }
  if (!bound.length) return { marks, group, scopes: [{ key: 'own', label: marks.length > 1 ? 'These shapes' : 'This shape', own: true }] };
  const by = new Map();
  for (const m of bound) for (const r of Scene.reach(App.shown.peek(), App.chart.peek(), sc.view, sc, m.id, App.state.peek())) {
    const s = by.get(r.style) ?? by.set(r.style, { key: r.style, order: r.order, name: r.name, outputs: [], captions: new Set(), count: 0 }).get(r.style);
    if (!s.outputs.some(o => Tree.key(o) === Tree.key(r.output))) s.outputs.push(r.output);
    s.captions.add(r.caption);
  }
  const styles = [...by.values()].sort((a, b) => b.order - a.order)
    .map(s => ({ ...s, label: s.captions.size === 1 ? [...s.captions][0] : s.name, detail: s.captions.size === 1 ? s.name : `${s.captions.size} kinds` }));
  const own = { key: 'own', label: bound.length > 1 ? 'These boxes' : bound[0].type === 'line' ? 'This line' : 'This box', own: true };
  return { marks, group, scopes: [...styles, own], first: defaultScope(bound[0], styles) };
}
// The style a change goes to unless another is chosen: the latest that gives the mark its look, as the
// fill of a feeder fund's box comes from Feeder Fund; for a line, its relation's own.
function defaultScope(m, styles) {
  const props = m.type === 'box' ? ['Fill', 'Shape', 'Outline', 'Dash', 'Weight'] : ['Outline', 'Dash', 'Weight', 'Shown'];
  const from = props.map(p => m.settings[p]?.note).filter(n => n?.view && !Tree.idsIn(n.pattern).size).map(n => Tree.key(Tree.bare(n.pattern)));
  return styles.find(s => from.includes(s.key))?.key ?? styles[0]?.key ?? 'own';
}

// ---- Making a change ----

function apply(label, value) {
  const c = Canvas.active.peek();
  if (!c) return;
  const { marks, scopes, row, first } = scopesOf(c), scope = scopes.find(s => s.key === chosen.peek()) ?? scopes.find(s => s.key === first) ?? scopes[0];
  if (!scope) return;
  const view = c.scene().view, tree = id => Tree.treeOf(App.state.peek(), id);
  App.change(tx => {
    if (scope.outputs) for (const p of scope.outputs) tx.note(label, p, value, { view });
    else for (const m of marks) {
      if (m.type === 'box' || m.type === 'line') tx.note(label, tree(m.record), value, { view });
      else if (m.type === 'shape') tx.update(m.id, { format: { ...App.shown.peek().item(App.chart.peek(), m.id)[0]?.format, [label]: value } });
    }
  });
  // Keys go back to the chart, so the next change can be typed.
  requestAnimationFrame(() => c.root.focus({ preventScroll: true }));
}
// A setting's value on the selection: its first mark's, or its first text's for a text property.
function value(label) {
  const m = current?.marks[0];
  if (!m) return undefined;
  if (current.row) return current.row.swatch[label] ?? current.row.caption.look[label];
  // A frame is the style's, drawn round the boxes it reaches.
  if (label === 'Frame') {
    const outs = new Set((current.scope?.outputs ?? []).map(p => Tree.key(p)));
    return current.canvas.scene().marks.find(f => f.type === 'frame' && outs.has(Tree.key(f.output)))?.kind ?? 'none';
  }
  if (TEXT_LABELS.has(label) && m.texts?.length) return m.texts[0].look?.[label] ?? m.texts[0].settings?.[label]?.value;
  return m.settings?.[label]?.value ?? m.look?.[label];
}
const chosen = signal(null);

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

function Palette({ value: v, pick, none }) {
  return html`<div class="palette">${COLORS.map(c => html`<button style=${`background:${c}`} aria-pressed=${v === c} aria-label=${c} onClick=${() => pick(c)} />`)}
    ${none ? html`<button class="none" aria-pressed=${v === 'none'} aria-label="None" data-tip="None" onClick=${() => pick('none')} />` : null}</div>`;
}
const pop = (e, draw) => Shell.popover(e.currentTarget, close => draw(close), { placement: 'bottom-start' });
const seg = (items, v, pick) => html`<div class="seg">${items.map(([k, label]) => html`<button aria-pressed=${v === k} onClick=${() => pick(k)}>${label}</button>`)}</div>`;

const INSERT = [['text', 'Text box'], ['rect', 'Rectangle'], ['rounded', 'Rounded rectangle'], ['oval', 'Oval'], ['triangle', 'Triangle'], ['diamond', 'Diamond'], ['hexagon', 'Hexagon'],
  ['octagon', 'Octagon'], ['parallelogram', 'Parallelogram'], ['trapezoid', 'Trapezoid'], ['pentagon', 'Pentagon'], ['chevron', 'Chevron'], ['arrow', 'Arrow'], ['cylinder', 'Cylinder']];
function insertMenu(e, c) {
  Shell.popover(e.currentTarget, close => html`<div class="picker">
    <div class="shapes">${INSERT.slice(1).map(([g, name]) => html`<button aria-label=${name} data-tip=${name} onClick=${() => { close(); c.insert(g); }}>${shapeGlyph(g)}</button>`)}</div>
    <div class="menu-sep" />
    ${[['text', 'Text box'], ['line', 'Line'], ['arrow-line', 'Arrow'], ['frame', 'Frame'], ['legend', 'Key'], ['picture', 'Picture']].map(([g, name]) =>
      html`<div class="menu-item" onClick=${() => { close(); g === 'picture' ? picture(c) : c.insert(g); }}><span class="label">${name}</span></div>`)}
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

function Bar() {
  App.scene.value; Shell.selection.value;
  const c = Canvas.active.value;
  if (!c || !c.scene()) return html`<div class="fb" />`;
  const s = scopesOf(c);
  const scope = s.scopes.find(x => x.key === chosen.value) ?? s.scopes.find(x => x.key === s.first) ?? s.scopes[0];
  current = { canvas: c, ...s, scope };
  const none = !s.marks.length, lineOnly = s.marks.length && s.marks.every(m => m.type === 'line' || m.geometry === 'line');
  const any = !none, boxy = any && !lineOnly && !s.marks.every(m => m.type === 'frame');
  const set = (label, v) => apply(label, v);
  const toggle = label => set(label, !value(label));
  const zoom = Math.round(Canvas.zoom.value * 100);
  const placeable = s.marks.filter(m => m.type === 'box' || m.type === 'shape').length;
  return html`<div class="fb" onMouseDown=${e => { if (e.target.closest('button')) e.preventDefault(); }}>
    <button class="btn dd" data-fb="insert" onClick=${e => insertMenu(e, c)}>Insert</button>
    <span class="sep" />
    <button class=${'btn dd scope' + (scope?.own ? ' own' : '')} data-fb="scope" disabled=${none} onClick=${e => Shell.menu(e.currentTarget, s.scopes.map(x => ({ label: x.label, detail: x.detail, checked: x === scope, run: () => { chosen.value = x.key; } })))}>
      <span>${scope?.label ?? 'Nothing selected'}</span></button>
    <button class="btn dd font" data-fb="font" disabled=${none} onClick=${e => Shell.menu(e.currentTarget, FONTS.map(f => ({ label: f, checked: value('Font') === f, run: () => set('Font', f) })))}>
      <span>${any ? value('Font') : 'Arial'}</span></button>
    <button class="btn dd size" data-fb="size" disabled=${none} onClick=${e => Shell.menu(e.currentTarget, SIZES.map(z => ({ label: String(z), checked: value('Size') === z, run: () => set('Size', z) })))}>
      <span>${any ? value('Size') : 10}</span></button>
    <button class="btn letter b" aria-label="Bold" data-tip="Bold" data-keys="Ctrl+B" aria-pressed=${any && !!value('Bold')} disabled=${none} onClick=${() => toggle('Bold')}>B</button>
    <button class="btn letter i" aria-label="Italic" data-tip="Italic" data-keys="Ctrl+I" aria-pressed=${any && !!value('Italic')} disabled=${none} onClick=${() => toggle('Italic')}>I</button>
    <button class="btn letter u" aria-label="Underline" data-tip="Underline" data-keys="Ctrl+U" aria-pressed=${any && !!value('Underline')} disabled=${none} onClick=${() => toggle('Underline')}>U</button>
    <button class="btn dd" aria-label="Text color" data-tip="Text color" data-fb="color" disabled=${none} onClick=${e => pop(e, close => html`<${Palette} value=${value('Color')} pick=${v => { close(); set('Color', v); }} />`)}>${glyph.color(any ? value('Color') : '#000000')}</button>
    <span class="sep" />
    <button class="btn dd" aria-label="Shape" data-tip="Shape" data-fb="shape" disabled=${!boxy} onClick=${e => pop(e, close => html`<div class="shapes">${INSERT.slice(1).map(([g, name]) => html`<button aria-label=${name} data-tip=${name} onClick=${() => { close(); set('Shape', g); }}>${shapeGlyph(g)}</button>`)}</div>`)}>${shapeGlyph(boxy ? value('Shape') ?? s.marks[0].geometry ?? 'rect' : 'rect')}</button>
    <button class="btn dd" aria-label="Fill" data-tip="Fill" data-fb="fill" disabled=${!boxy} onClick=${e => pop(e, close => html`<${Palette} value=${value('Fill')} none pick=${v => { close(); set('Fill', v); }} />`)}>${glyph.fill(boxy ? value('Fill') : 'none')}</button>
    <button class="btn dd" aria-label="Outline" data-tip="Outline" data-fb="outline" disabled=${none} onClick=${e => pop(e, close => html`<${Palette} value=${value('Outline')} none pick=${v => { close(); set('Outline', v); }} />`)}>${glyph.outline(any ? value('Outline') : 'none')}</button>
    <button class="btn dd" aria-label="Line" data-tip="Line" data-fb="line" disabled=${none} onClick=${e => pop(e, () => html`<div class="picker">
      <div class="row"><span class="k">Weight</span>${seg(WEIGHTS.map(w => [w, String(w)]), value('Weight'), v => set('Weight', v))}</div>
      <div class="row"><span class="k">Dash</span>${seg(['solid', 'dashed', 'dotted'].map(d => [d, dashGlyph(d)]), value('Dash'), v => set('Dash', v))}</div>
      ${s.marks.some(m => m.type === 'line') ? html`<div class="row"><span class="k">Route</span>${seg([['elbow', 'Elbow'], ['straight', 'Straight']], value('Connector'), v => set('Connector', v))}</div>` : null}
      ${s.scope?.outputs && boxy ? html`<div class="row"><span class="k">Frame</span>${seg([['none', 'None'], ['dashed', dashGlyph('dashed')], ['solid', dashGlyph('solid')], ['bracket', 'Bracket']], value('Frame') ?? 'none', v => set('Frame', v))}</div>` : null}
    </div>`)}>${glyph.line()}</button>
    <button class="btn dd" aria-label="Arrowheads" data-tip="Arrowheads" data-fb="arrow" disabled=${!lineOnly} onClick=${e => pop(e, close => html`<div class="picker">${seg(['none', 'end', 'start', 'both'].map(a => [a, arrowGlyph(a)]), value('Arrow'), v => { close(); set('Arrow', v); })}</div>`)}>${glyph.arrow()}</button>
    <span class="sep" />
    <button class="btn dd" data-fb="align" disabled=${none} onClick=${e => Shell.menu(e.currentTarget, [
      { head: 'Text' }, ...[['left', 'Left'], ['center', 'Center'], ['right', 'Right']].map(([a, label]) => ({ label, checked: value('Align') === a, run: () => set('Align', a) })),
      '-', { head: placeable > 1 ? 'Shapes' : 'To the page' },
      ...[['left', 'Align left'], ['center', 'Align center'], ['right', 'Align right'], ['top', 'Align top'], ['middle', 'Align middle'], ['bottom', 'Align bottom']].map(([a, label]) => ({ label, disabled: !placeable, run: () => c.align(a) })),
      '-', { label: 'Distribute across', disabled: placeable < 3, run: () => c.distribute('across') }, { label: 'Distribute down', disabled: placeable < 3, run: () => c.distribute('down') },
      { label: 'Same width', disabled: placeable < 2, run: () => c.match('width') }, { label: 'Same height', disabled: placeable < 2, run: () => c.match('height') },
    ])}>Align</button>
    <button class="btn dd" data-fb="order" disabled=${none} onClick=${e => Shell.menu(e.currentTarget, [
      { label: 'Bring to front', keys: '$mod+Shift+BracketRight', run: () => c.order('front') }, { label: 'Bring forward', keys: '$mod+BracketRight', run: () => c.order('forward') },
      { label: 'Send backward', keys: '$mod+BracketLeft', run: () => c.order('backward') }, { label: 'Send to back', keys: '$mod+Shift+BracketLeft', run: () => c.order('back') },
    ])}>Order</button>
    ${s.group
      ? html`<button class="btn" data-fb="group" onClick=${() => c.ungroup()}>Ungroup</button>`
      : html`<button class="btn" data-fb="group" disabled=${placeable < 2} onClick=${() => c.group()}>Group</button>`}
    <button class="btn dd zoom" data-fb="zoom" onClick=${e => Shell.menu(e.currentTarget, [{ label: 'Fit', keys: '$mod+Digit0', run: () => c.zoom('fit') }, '-',
      ...[0.5, 0.75, 1, 1.5, 2].map(z => ({ label: `${z * 100}%`, checked: Math.abs(z * 100 - zoom) < 0.5, run: () => c.zoom(z) })), '-',
      { label: 'Tidy', run: () => c.tidy() }], { placement: 'bottom-end' })}>${zoom}%</button>
  </div>`;
}

function mount(el) {
  // Another selection starts at the style that gives it its look.
  const stopSel = effect(() => { Shell.selection.value; chosen.value = null; });
  render(html`<${Bar} />`, el);
  const keys = Shell.keys({
    '$mod+KeyB': () => inCanvas() ? apply('Bold', !value('Bold')) : false,
    '$mod+KeyI': () => inCanvas() ? apply('Italic', !value('Italic')) : false,
    '$mod+KeyU': () => inCanvas() ? apply('Underline', !value('Underline')) : false,
  });
  return () => { stopSel(); keys(); render(null, el); };
}
const inCanvas = () => !!Canvas.active.peek()?.root.contains(document.activeElement) && !document.activeElement.closest('.dc-edit') && current?.marks.length;

Shell.register('formatbar', { mount });
return { apply, value };
})();
