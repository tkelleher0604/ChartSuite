// The ribbon: tabs of controls above the chart. Home's formatting controls edit the engaged style (see
// currentEngaged in chart.js), so a change applies everywhere that style's entry applies, never to one box.

const RIBBON_TABS = [['home', 'Home'], ['insert', 'Insert'], ['view', 'View']];

const rbGroup = (label, controls, cls = '') =>
  `<div class="rb-group${cls ? ` ${cls}` : ''}"><div class="rb-controls">${controls}</div><div class="rb-label">${label}</div></div>`;

// A ribbon button that opens a menu; `content` is only worked out while the menu is open.
function rbMenu(key, inner, { cls = '', title = '', disabled = false, overridden = '', inherited = false, right = false } = {}, content) {
  const open = ui.menu === key && !disabled;
  const tip = overridden ? `${title}. On this box it comes from ${overridden}` : inherited ? `${title}. ${fromElsewhere}` : title;
  return `<span class="rb-anchor"><button class="rb-btn ${cls}${overridden ? ' is-overridden' : ''}${inherited ? ' is-inherited' : ''}" data-action="menu" data-menu="${key}" aria-haspopup="menu" aria-expanded="${open}"
      title="${esc(tip)}"${disabled ? ' disabled' : ''}>${inner}${icon('chevron-down', 'chev')}</button>${open ? `<div class="pop menu rb-menu${right ? ' is-right' : ''}" role="menu">${content()}</div>` : ''}</span>`;
}

const propItem = (prop, value, inner, checked, cls = '') =>
  `<button class="menu-item ${cls}" role="menuitemradio" aria-checked="${checked}" data-action="style-prop" data-prop="${prop}" data-value="${esc(value)}">${inner}${checked ? icon('check') : ''}</button>`;

function palette(prop, current, allowNone) {
  const swatches = COLORS.map(c => `<button class="swatch" role="menuitemradio" aria-checked="${c === current}" aria-label="${c}" title="${c}" style="background:${c}"
    data-action="style-prop" data-prop="${prop}" data-value="${c}"></button>`).join('');
  const none = allowNone ? `<div class="menu-sep"></div><div class="palette-foot">${propItem(prop, 'none', '<span class="glyph-swatch is-none"></span><span class="menu-text">No fill</span>', current === 'none')}</div>` : '';
  return `<div class="palette">${swatches}</div>${none}`;
}

// The output whose values the ribbon shows. With every option in scope, that's the selection's own
// option, or else the first; a change still goes to every option.
const viewOutput = eng => eng.output !== '*' ? eng.output
  : selectionOutput(eng.style) ?? styleOutputs(eng.style)[0]?.[0] ?? '*';

// What each property shows as in the ribbon: the engaged style's own value where it sets one, and
// otherwise (`inherited`) the value the selection actually has from other styles, or the default.
function shownProps(eng) {
  const { own } = effectiveProps(eng.style, viewOutput(eng));
  const sel = selection();
  let base = isLineStyle(eng.style) ? LINE_DEFAULTS : { ...BOX_DEFAULTS, ...TEXT_DEFAULTS, show: false, format: 'value' };
  if (isLineStyle(eng.style) && sel.relation && styleOf(sel.relation) === eng.style) base = lineLook(sel.relation);
  else if (sel.object && !isLineStyle(eng.style)) {
    const look = boxLook(sel.object);
    if (look.applied.some(a => a.style === eng.style)) {
      const line = look.lines.find(l => l.styleId === eng.style.id);
      base = { ...look.box, ...(line ? line.look : look.text), show: false, format: 'value' };
    }
  }
  const props = { ...base, ...own };
  const inherited = p => own[p] === undefined;
  return { props, own, inherited };
}

// The styles worth showing in the gallery: those applying to the selection, or all of them.
function galleryStyles() {
  const sel = selection();
  if (sel.object) return [...new Map(boxLook(sel.object).applied.map(a => [a.style.id, { style: a.style, output: a.output }])).values()];
  if (sel.relation) { const s = styleOf(sel.relation); return s ? [{ style: s, output: outputKey(records[sel.relation]) }] : []; }
  return styles.map(s => ({ style: s, output: null }));
}

// Records in the selection that could have a style of their own but don't yet.
function styleCandidates() {
  const sel = selection();
  const ids = sel.object ? panelOrder(sel.object).slice(1) : sel.relation ? [sel.relation] : [];
  const seen = new Set();
  return ids.filter(id => {
    const p = parameterization(records, id);
    if (styleOfParam(p) || seen.has(p)) return false;
    seen.add(p);
    return true;
  });
}

function newStyleMenu() {
  const ids = styleCandidates();
  if (!selection().object && !selection().relation) return '<div class="menu-note" style="padding:8px 10px">Select a box or a line first.</div>';
  if (!ids.length) return '<div class="menu-note" style="padding:8px 10px">Everything here already has a style.</div>';
  return `<div class="menu-head">Style the chart by</div>` + ids.map(id => {
    const r = records[id];
    const where = isRelation(r) ? 'This relation' : r.at === selection().object ? TYPE_NAMES[typeOf(r)] : `Under ${segmentText(r.at)}`;
    return `<button class="menu-item" role="menuitem" data-action="style-new" data-id="${id}"><span class="menu-text"><span class="menu-title">${esc(labelOf(r))}</span><span class="menu-desc">${esc(where)}</span></span></button>`;
  }).join('');
}

function styleGroup(eng) {
  const tiles = galleryStyles().map(({ style, output }) => {
    const { label } = describeStyle(style);
    const pressed = eng?.style === style;
    const out = output ? styleOutputs(style).find(([k]) => k === output)?.[1] ?? output : count(Object.keys(style.map).length, 'entry');
    const props = (output ? style.map[output] : Object.values(style.map)[0]) ?? {};
    return `<button class="tile" aria-pressed="${pressed}" data-action="style-engage" data-style="${style.id}" data-output="${esc(output ?? '')}" title="${esc(`${label}: ${out}`)}">
      <span class="tile-top">${stylePreview(style, props)}<span class="tile-name">${esc(label)}</span></span><span class="tile-out">${esc(out)}</span></button>`;
  }).join('');
  const addOpen = ui.menu === 'rb:new-style';
  const add = `<span class="rb-anchor"><button class="tile is-add" data-action="menu" data-menu="rb:new-style" aria-haspopup="menu" aria-expanded="${addOpen}"
    title="Style the chart by another entry">${icon('plus')}<span>New style</span></button>${addOpen ? `<div class="pop menu rb-menu" role="menu">${newStyleMenu()}</div>` : ''}</span>`;
  let side = '<span class="rb-note">Select a box, a line of text or a line to see its styles.</span>';
  if (eng) {
    const outputs = styleOutputs(eng.style);
    const outText = eng.output === '*' ? 'Every option' : outputs.find(([k]) => k === eng.output)?.[1] ?? eng.output;
    const scope = outputs.length > 1 ? rbMenu('rb:scope', `<span class="rb-field-text">${esc(outText)}</span>`, { cls: 'rb-field is-wide', title: 'Which of the style’s outputs to format' }, () =>
      outputs.map(([k, text]) => `<button class="menu-item" role="menuitemradio" aria-checked="${k === eng.output}" data-action="style-scope" data-output="${esc(k)}"><span class="menu-text">${esc(text)}</span>${k === eng.output ? icon('check') : ''}</button>`).join('')
      + `<div class="menu-sep"></div><button class="menu-item" role="menuitemradio" aria-checked="${eng.output === '*'}" data-action="style-scope" data-output="*"><span class="menu-text">Every option</span>${eng.output === '*' ? icon('check') : ''}</button>`)
      : `<span class="rb-note"><strong>${esc(outText)}</strong></span>`;
    const n = recordsWithOutput(eng.style, eng.output).length;
    const noun = isLineStyle(eng.style) ? 'line' : isKindStyle(eng.style) || BOX_PROPS.some(p => effectiveProps(eng.style, viewOutput(eng)).own[p] !== undefined) ? 'box' : 'place';
    const over = overriddenProps(eng);
    const first = Object.entries(over)[0];
    const note = first ? `<span class="rb-note is-warn">${esc(propName(first[0]))} on this box comes from <button class="link-btn" data-action="style-engage" data-style="${first[1].id}">${esc(describeStyle(first[1]).label)}</button></span>`
      : `<span class="rb-note">Changes apply to ${count(n, noun)}</span>`;
    const remove = isKindStyle(eng.style) ? '' : `<button class="link-btn rb-remove" data-action="style-remove" title="Remove this style; undo brings it back">Remove</button>`;
    side = `<div style="display:flex;flex-direction:column;gap:4px;justify-content:center">${scope}<span class="rb-row" style="gap:8px">${note}${remove}</span></div>`;
  }
  return rbGroup(eng ? `Style: ${esc(describeStyle(eng.style).label)} <span style="opacity:.75">${esc(describeStyle(eng.style).where)}</span>` : 'Style',
    `<div class="rb-row" style="gap:10px"><div class="gallery">${tiles}</div>${add}${side}</div>`, 'is-style');
}

const PROP_NAMES = { shape: 'Shape', fill: 'Fill', stroke: 'Outline', strokeWidth: 'Weight', dash: 'Dash' };
const propName = p => PROP_NAMES[p] ?? p;

// Box properties a later style sets on the selected box, which the engaged style's changes won't show
// through, mapped to that style.
function overriddenProps(eng) {
  const sel = selection();
  if (!sel.object) return {};
  const { applied } = boxLook(sel.object);
  const at = applied.findIndex(a => a.style === eng.style);
  if (at < 0) return {};
  const over = {};
  for (const a of applied.slice(at + 1))
    for (const p of BOX_PROPS) if (a.props[p] !== undefined && a.style !== eng.style) over[p] = a.style;
  return over;
}

// Controls showing a value the engaged style doesn't set are muted, and say where the value comes from.
const fromElsewhere = 'Comes from another style. Set it here to override';

function fontGroup(eng) {
  const off = !eng;
  const { props, inherited } = eng ? shownProps(eng) : { props: TEXT_DEFAULTS, inherited: () => false };
  const font = rbMenu('rb:font', `<span class="rb-field-text" style="font-family:${fontStack(props.font)}">${esc(props.font)}</span>`, { cls: 'rb-field is-wide', title: 'Font', disabled: off, inherited: inherited('font') }, () =>
    FONTS.map(f => propItem('font', f, `<span class="menu-text" style="font-family:${fontStack(f)}">${esc(f)}</span>`, f === props.font, 'is-font')).join(''));
  const size = rbMenu('rb:size', `<span class="rb-field-text">${props.size}</span>`, { cls: 'rb-field is-narrow', title: 'Font size', disabled: off, inherited: inherited('size') }, () =>
    SIZES.map(s => propItem('size', s, `<span class="menu-text">${s}</span>`, s === props.size)).join(''));
  const toggle = (prop, name, glyph) => `<button class="rb-btn${inherited(prop) ? ' is-inherited' : ''}" data-action="style-prop" data-prop="${prop}" data-value="${!props[prop]}" aria-pressed="${!!props[prop]}"
    title="${name}${inherited(prop) ? `. ${fromElsewhere}` : ''}"${off ? ' disabled' : ''}>${icon(glyph)}</button>`;
  const color = rbMenu('rb:color', `<span class="glyph-letter">A<span class="glyph-bar" style="background:${props.color}"></span></span>`, { title: 'Font color', disabled: off, inherited: inherited('color') }, () => palette('color', props.color, false));
  return rbGroup('Font', `<div class="rb-row">${font}${size}</div><div class="rb-row">${toggle('bold', 'Bold', 'bold')}${toggle('italic', 'Italic', 'italic')}${color}</div>`);
}

function shapeGroup(eng) {
  const line = eng && isLineStyle(eng.style);
  const { props, inherited } = eng ? shownProps(eng) : { props: BOX_DEFAULTS, inherited: () => false };
  const over = eng ? overriddenProps(eng) : {};
  const opts = (p, title) => ({ title, disabled: !eng, overridden: over[p] ? describeStyle(over[p]).label : '', inherited: inherited(p) });
  const outline = rbMenu('rb:stroke', `<span class="glyph-outline" style="border-color:${props.stroke}"></span>`, opts('stroke', line ? 'Line color' : 'Outline'), () => palette('stroke', props.stroke, false));
  const weight = rbMenu('rb:weight', lineGlyph('solid', Math.min(props.strokeWidth, 3)), opts('strokeWidth', 'Weight'), () =>
    WEIGHTS.map(w => propItem('strokeWidth', w, `${lineGlyph('solid', w)}<span class="menu-text">${w} pt</span>`, w === props.strokeWidth)).join(''));
  const dash = rbMenu('rb:dash', lineGlyph(props.dash), opts('dash', 'Dash'), () =>
    DASHES.map(([v, name]) => propItem('dash', v, `${lineGlyph(v)}<span class="menu-text">${name}</span>`, v === props.dash)).join(''));
  if (line) return rbGroup('Line', `<div class="rb-row">${outline}${weight}${dash}</div>`);
  const shapeName = SHAPES.find(([v]) => v === props.shape)?.[1] ?? 'Rectangle';
  const shape = rbMenu('rb:shape', `${shapeGlyph(props.shape, props.fill, props.stroke)}<span class="rb-field-text">${shapeName}</span>`, { ...opts('shape', 'Shape'), cls: 'rb-field is-wide' }, () =>
    SHAPES.map(([v, name]) => propItem('shape', v, `${shapeGlyph(v)}<span class="menu-text">${name}</span>`, v === props.shape)).join(''));
  const fill = rbMenu('rb:fill', `<span class="glyph-swatch${props.fill === 'none' ? ' is-none' : ''}" style="background:${props.fill === 'none' ? '' : props.fill}"></span>`, opts('fill', 'Fill'), () => palette('fill', props.fill, true));
  return rbGroup('Shape', `<div class="rb-row">${shape}</div><div class="rb-row">${fill}${outline}${weight}${dash}</div>`);
}

function showGroup(eng) {
  const fixed = !eng || isKindStyle(eng.style);
  const { own } = eng ? effectiveProps(eng.style, viewOutput(eng)) : { own: {} };
  const line = eng && isLineStyle(eng.style);
  const shown = fixed || (line ? own.show !== false : !!own.show);
  const toggle = `<button class="rb-check" data-action="style-prop" data-prop="show" data-value="${!shown}" aria-pressed="${shown}"${fixed ? ' disabled' : ''}
    title="${line ? 'Draw these relations as lines' : 'Show this entry as a line of text in its box'}">${box(shown ? true : null)}${line ? 'Draw line' : 'Show text'}</button>`;
  const formats = line ? LINE_FORMATS : FORMATS;
  const current = formats.find(([v]) => v === own.format)?.[1] ?? formats[0][1];
  const format = rbMenu('rb:format', `<span class="rb-field-text">${esc(current)}</span>`, { cls: 'rb-field is-wide', title: line ? 'Label' : 'How the text reads', disabled: fixed || !shown }, () =>
    formats.map(([v, name]) => propItem('format', v, `<span class="menu-text">${esc(name)}</span>`, v === (own.format ?? 'value'))).join(''));
  return rbGroup('Display', `<div class="rb-row">${toggle}</div><div class="rb-row">${format}</div>`);
}

function homeTab() {
  const eng = currentEngaged();
  const history = `<div class="rb-row"><button class="rb-btn is-tall" data-action="undo"${undoStack.length ? '' : ' disabled'} title="Undo (${undoKey})">${icon('arrow-back-up')}Undo</button>
    <button class="rb-btn is-tall" data-action="redo"${redoStack.length ? '' : ' disabled'} title="Redo (${redoKey})">${icon('arrow-forward-up')}Redo</button></div>`;
  return rbGroup('History', history) + styleGroup(eng) + fontGroup(eng) + shapeGroup(eng) + showGroup(eng);
}

function insertTab() {
  const kinds = kindsInState().map(k => `<button class="rb-btn is-tall" data-action="insert-object" data-kind="${esc(k)}" title="Add a box for a new ${esc(k)}">${shapeGlyph(pickProps(styles.find(isKindStyle)?.map[norm(k)] ?? KIND_PRESET, BOX_PROPS).shape ?? 'rect')}${esc(k)}</button>`).join('');
  const objects = `<div class="rb-row">${kinds}<button class="rb-btn is-tall" data-action="insert-object" data-kind="" title="Add a box of a kind not used yet">${icon('plus')}New kind</button></div>`;
  const sel = selection();
  const relate = `<div class="rb-row"><button class="rb-btn is-tall" data-action="insert-relation"${sel.object ? '' : ' title="Select a box first"'}>${icon('link')}Relation</button></div>`;
  return rbGroup('Objects', objects) + rbGroup('Relations', relate)
    + rbGroup('Tip', '<span class="rb-note" style="max-width:260px">Double-click the sheet to add a box there. Drag from a box’s edge handle to another box to relate them.</span>');
}

function viewTab() {
  const zoom = `<div class="rb-row"><button class="rb-btn is-tall" data-action="zoom" data-step="-1">${icon('minus')}Zoom out</button>
    <button class="rb-btn is-tall" data-action="zoom-reset"><span style="font-size:13px;font-weight:600">${Math.round(chart.zoom * 100)}%</span>Actual size</button>
    <button class="rb-btn is-tall" data-action="zoom" data-step="1">${icon('plus')}Zoom in</button>
    <button class="rb-btn is-tall" data-action="zoom-fit">${icon('arrows-left-right')}Fit</button></div>`;
  const grid = `<button class="rb-check" data-action="toggle-pref" data-key="grid" aria-pressed="${prefs.grid !== false}">${box(prefs.grid !== false)}Gridlines</button>`;
  const panel = `<button class="rb-check" data-action="toggle-pref" data-key="panel" aria-pressed="${prefs.panel !== false}">${box(prefs.panel !== false)}Record panel</button>`;
  return rbGroup('Zoom', zoom) + rbGroup('Show', `<div class="rb-row">${grid}</div><div class="rb-row">${panel}</div>`);
}

function renderRibbon() {
  const tabs = RIBBON_TABS.map(([key, name]) =>
    `<button class="ribbon-tab" role="tab" aria-selected="${chart.tab === key}" data-action="rb-tab" data-tab="${key}">${name}</button>`).join('');
  const body = chart.tab === 'insert' ? insertTab() : chart.tab === 'view' ? viewTab() : homeTab();
  document.getElementById('ribbon').innerHTML = `<div class="ribbon-tabs" role="tablist">${tabs}</div><div class="ribbon-body">${body}</div>`;
  // Keep the engaged style's tile in view when the gallery is too narrow to show every tile.
  const gallery = document.querySelector('.gallery');
  const tile = gallery?.querySelector('.tile[aria-pressed="true"]');
  if (tile && (tile.offsetLeft + tile.offsetWidth > gallery.scrollLeft + gallery.clientWidth || tile.offsetLeft < gallery.scrollLeft))
    gallery.scrollLeft = tile.offsetLeft - (gallery.clientWidth - tile.offsetWidth) / 2;
}

const PROP_TYPES = { size: Number, strokeWidth: Number, bold: v => v === 'true', italic: v => v === 'true', show: v => v === 'true' };

Object.assign(actions, {
  'rb-tab': d => { chart.tab = d.tab; },
  'style-prop': d => {
    const eng = currentEngaged();
    if (!eng) return;
    if (!chart.engaged) chart.engaged = { styleId: eng.style.id, output: eng.output };
    setStyleProps(eng.style.id, eng.output, { [d.prop]: (PROP_TYPES[d.prop] ?? String)(d.value) });
  },
  'style-engage': d => engage(d.style, d.output || undefined),
  'style-scope': d => { const eng = currentEngaged(); if (eng) chart.engaged = { styleId: eng.style.id, output: d.output }; },
  'style-new': d => { const s = addStyle(d.id); engage(s.id, outputKey(records[d.id])); },
  'style-remove': () => { const eng = currentEngaged(); if (eng && !isKindStyle(eng.style)) { removeStyle(eng.style.id); chart.engaged = null; } },
  'insert-object': d => {
    const [x, y] = visibleCenter();
    chart.quick = d.kind ? { x, y, kind: d.kind, name: '' } : { x, y };
  },
  'insert-relation': () => {
    const sel = selection();
    if (sel.object) location.hash = `relate:${sel.object}`;
    else setNotice('Select a box first, or drag from a box’s edge handle to another box.');
  },
  'zoom-fit': () => {
    const stage = document.getElementById('stage');
    const sheet = document.getElementById('sheet');
    setZoom(Math.min((stage.clientWidth - 56) / sheet.offsetWidth, (stage.clientHeight - 56) / sheet.offsetHeight));
  },
  'toggle-pref': d => { prefs[d.key] = prefs[d.key] === false; savePrefs(); },
});
