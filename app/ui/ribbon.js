// The ribbon: tabs of controls above the chart. Home's formatting controls edit the engaged style (see
// currentEngaged in chart.js), so a change applies everywhere that style's entry applies, never to one box.
// Its controls are labeled in words; the only pictures are of what they set (a shape, a color, a dash).
// Exporting has a dialog of its own (export.js), and the zoom sits at the foot of the chart.

const RIBBON_TABS = [['home', 'Home'], ['insert', 'Insert'], ['formulas', 'Formulas'], ['view', 'View']];

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
  const none = allowNone ? `<div class="menu-sep"></div><div class="swatches-foot">${propItem(prop, 'none', '<span class="glyph-swatch is-none"></span><span class="menu-text">No fill</span>', current === 'none')}</div>` : '';
  return `<div class="swatches">${swatches}</div>${none}`;
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
  else if (sel.relation && selectionOutput(eng.style) !== undefined) {
    // Text shown by a line takes the line's text properties unless its own style sets them.
    base = { ...BOX_DEFAULTS, ...pickProps(lineLook(sel.relation), TEXT_PROPS), show: false, format: 'value' };
  } else if (sel.object && !isLineStyle(eng.style)) {
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

// The styles worth showing in the gallery: those applying to the selection (a box, or a line and what's
// located at it), or all of them.
function galleryStyles() {
  const sel = selection();
  if (sel.object) return [...new Map(boxLook(sel.object).applied.map(a => [a.style.id, { style: a.style, output: a.output }])).values()];
  if (sel.relation) return panelOrder(sel.relation).filter(id => styleOf(id)).map(id => ({ style: styleOf(id), output: outputKey(records[id]) }));
  return styles.map(s => ({ style: s, output: null }));
}

// Records in the selection that could have a style of their own but don't yet.
function styleCandidates() {
  const sel = selection();
  const ids = sel.object ? panelOrder(sel.object).slice(1) : sel.relation ? panelOrder(sel.relation) : [];
  const seen = new Set();
  return ids.filter(id => {
    const f = formKeyOf(id);
    if (styleOfForm(f) || seen.has(f)) return false;
    seen.add(f);
    return true;
  });
}

function newStyleMenu() {
  const ids = styleCandidates();
  if (!selection().object && !selection().relation) return '<div class="menu-note is-pad">Select a box or a line first.</div>';
  if (!ids.length) return '<div class="menu-note is-pad">Everything here already has a style.</div>';
  return `<div class="menu-head">Style the chart by</div>` + ids.map(id => styleFormItem(formKeyOf(id), id)).join('');
}

function styleGroup(eng) {
  const tiles = galleryStyles().map(({ style, output }) => {
    const { label } = describeStyle(style);
    const pressed = eng?.style === style;
    const out = output ? styleOutputs(style).find(([k]) => k === output)?.[1] ?? output : count(Object.keys(style.map).length, 'entry');
    const props = (output ? style.map[output] : Object.values(style.map)[0]) ?? {};
    return `<button class="tile" aria-pressed="${pressed}" data-action="style-engage" data-style="${style.id}" data-output="${esc(output ?? '')}" title="${esc(`${label}: ${out}`)}">
      ${stylePreview(style, props)}<span class="tile-name">${esc(label)}</span></button>`;
  }).join('');
  const addOpen = ui.menu === 'rb:new-style';
  const add = `<span class="rb-anchor"><button class="tile is-add" data-action="menu" data-menu="rb:new-style" aria-haspopup="menu" aria-expanded="${addOpen}"
    title="Style the chart by another entry">New style…</button>${addOpen ? `<div class="pop menu rb-menu" role="menu">${newStyleMenu()}</div>` : ''}</span>`;
  let side = '<span class="rb-note">Select a box, a line of text or a line to see its styles.</span>';
  if (eng) {
    const outputs = styleOutputs(eng.style);
    // A chart with nothing in it yet has a Kind style with no kinds to format.
    const outText = eng.output === '*' ? 'Every option' : outputs.find(([k]) => k === eng.output)?.[1] ?? eng.output ?? 'Nothing yet';
    const scope = outputs.length > 1 ? rbMenu('rb:scope', `<span class="rb-field-text">${esc(outText)}</span>`, { cls: 'rb-field is-wide', title: 'Which of the style’s outputs to format' }, () =>
      outputs.map(([k, text]) => `<button class="menu-item" role="menuitemradio" aria-checked="${k === eng.output}" data-action="style-scope" data-output="${esc(k)}"><span class="menu-text">${esc(text)}</span>${k === eng.output ? icon('check') : ''}</button>`).join('')
      + `<div class="menu-sep"></div><button class="menu-item" role="menuitemradio" aria-checked="${eng.output === '*'}" data-action="style-scope" data-output="*"><span class="menu-text">Every option</span>${eng.output === '*' ? icon('check') : ''}</button>`)
      : `<span class="rb-note"><strong>${esc(outText)}</strong></span>`;
    const n = recordsWithOutput(eng.style, eng.output).length;
    const noun = isLineStyle(eng.style) ? 'line' : isLineTextStyle(eng.style) ? 'label'
      : isKindStyle(eng.style) || BOX_PROPS.some(p => effectiveProps(eng.style, viewOutput(eng)).own[p] !== undefined) ? 'box' : 'place';
    const over = overriddenProps(eng);
    const first = Object.entries(over)[0];
    const note = first ? `<span class="rb-note is-warn">${esc(propName(first[0]))} on this box comes from <button class="link-btn" data-action="style-engage" data-style="${first[1].id}">${esc(describeStyle(first[1]).label)}</button></span>`
      : `<span class="rb-note">Changes apply to ${count(n, noun)}</span>`;
    const remove = isKindStyle(eng.style) ? '' : `<button class="link-btn rb-remove" data-action="style-remove" title="Remove this style; undo brings it back">Remove</button>`;
    side = `${scope}${note}${remove}`;
  }
  // The styles in a row of chips, with the engaged one's output, and what a change reaches, below.
  return rbGroup(eng ? `Style: ${esc(describeStyle(eng.style).label)} <span class="rb-label-where">${esc(describeStyle(eng.style).where)}</span>` : 'Style',
    `<div class="rb-row"><div class="gallery">${tiles}</div>${add}</div><div class="rb-row is-spaced">${side}</div>`, 'is-style');
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

// The engaged style's `show`, which says whether its records are drawn: a kind's boxes, a relation's
// lines, an entry's line of text.
function showGroup(eng) {
  const { props, own } = eng ? effectiveProps(eng.style, viewOutput(eng)) : { props: {}, own: {} };
  const kind = eng && isKindStyle(eng.style);
  const line = eng && isLineStyle(eng.style);
  const shown = eng ? (line ? own.show !== false : !!props.show) : false;
  const what = kind ? ['Show boxes', 'Draw boxes of this kind'] : line ? ['Draw line', 'Draw these relations as lines']
    : eng && isLineTextStyle(eng.style) ? ['Show text', 'Show this entry by its relation’s line'] : ['Show text', 'Show this entry as a line of text in its box'];
  const toggle = `<button class="rb-check" data-action="style-prop" data-prop="show" data-value="${!shown}" aria-pressed="${shown}"${eng ? '' : ' disabled'}
    title="${what[1]}">${box(shown ? true : null)}${what[0]}</button>`;
  const formats = line ? LINE_FORMATS : FORMATS;
  const current = formats.find(([v]) => v === own.format)?.[1] ?? formats[0][1];
  const format = rbMenu('rb:format', `<span class="rb-field-text">${esc(current)}</span>`, { cls: 'rb-field is-wide', title: line ? 'Label' : 'How the text reads', disabled: !eng || kind || !shown }, () =>
    formats.map(([v, name]) => propItem('format', v, `<span class="menu-text">${esc(name)}</span>`, v === (own.format ?? 'value'))).join(''));
  return rbGroup('Display', `<div class="rb-row">${toggle}</div><div class="rb-row">${format}</div>`);
}

function homeTab() {
  const eng = currentEngaged();
  const history = `<div class="rb-row"><button class="rb-btn" data-action="undo"${undoStack.length ? '' : ' disabled'} title="Undo (${undoKey})">Undo</button>
    <button class="rb-btn" data-action="redo"${redoStack.length ? '' : ' disabled'} title="Redo (${redoKey})">Redo</button></div>`;
  return rbGroup('History', history) + styleGroup(eng) + fontGroup(eng) + shapeGroup(eng) + showGroup(eng);
}

function insertTab() {
  const kinds = kindsInState().map(k => `<button class="rb-btn" data-action="insert-object" data-kind="${esc(k)}" title="Add a box for a new ${esc(k)}">${shapeGlyph(pickProps(styles.find(isKindStyle)?.map[norm(k)] ?? KIND_PRESET, BOX_PROPS).shape ?? 'rect')}${esc(k)}</button>`).join('');
  const objects = `<div class="rb-row">${kinds}<button class="rb-btn" data-action="insert-object" data-kind="" title="Add a box of a kind not used yet">New kind…</button></div>`;
  const sel = selection();
  const relate = `<div class="rb-row"><button class="rb-btn" data-action="insert-relation" title="${sel.object ? `Relate ${esc(objectName(sel.object))} to another box` : 'Select a box first'}">Relate…</button></div>`;
  return rbGroup('Boxes', objects) + rbGroup('Relations', relate)
    + rbGroup('Tip', '<span class="rb-note is-tip">Double-click the sheet to add a box there. Drag from a box’s edge handle to another box to relate them.</span>');
}

// What the selection is, as something a formula might have worked out: a selected line, or a line of
// text picked in a box.
function selectedRecord() {
  const sel = selection();
  return sel.relation ? sel.record : sel.object && sel.record !== sel.object ? sel.record : null;
}

// Like Excel's Formulas tab: the chart's definitions (the Schema view's computed forms), a new one, why
// the selection is there, and how the last working-out went.
function formulasTab() {
  const sel = selection();
  const sides = sel.relate ? [sel.relate.a, sel.relate.b].filter(Boolean).map(objectOf) : sel.object ? [sel.object] : [];
  const newDef = rbMenu('rb:new-definition', `<span class="rb-field-text">New definition</span>`, { title: 'An entry or a relation worked out by formula' }, () => newDefinitionItems(sides));
  const defs = `<div class="rb-row"><button class="rb-btn" data-action="open" data-hash="schema:computed" title="Every definition in this chart, in the Schema view">Definitions</button></div><div class="rb-row">${newDef}</div>`;
  const id = selectedRecord();
  const info = id && records[id] && formulaInfo(id);
  const whyTitle = info ? (isComputed(id) ? 'Why this is here: the formula and what it read' : 'What the formula says about this entered record')
    : 'Select something a formula works out: a line, or a line of text in a box';
  const why = `<div class="rb-row"><button class="rb-btn" data-action="fx-why"${info ? '' : ' disabled'} title="${whyTitle}">Why?</button></div>`;
  const nErrors = (formulaResult.errors ?? []).length + Object.keys(formulaResult.defErrors ?? {}).length;
  const computed = Object.keys(records).filter(isComputed).length;
  const ms = formulaResult.ms;
  const errors = nErrors ? `<button class="link-btn rb-errors" data-action="open" data-hash="schema:computed">${count(nErrors, 'error')}</button>` : '<span class="rb-note">No errors</span>';
  const status = `<div class="rb-stack">
    <span class="rb-note">${count(computed, 'computed record')} from ${count(definitions.length, 'definition')}${ms !== undefined ? ` in ${Math.round(ms)} ms` : ''}</span>
    <span class="rb-row is-spaced">${errors}<button class="link-btn" data-action="fx-recalc" title="Work every formula out again now">Recalculate</button></span></div>`;
  return rbGroup('Definitions', defs) + rbGroup('Explain', why) + rbGroup('Calculation', status);
}

// The Show menu: everything this view can draw, by form (see showable in styles.js): kinds as boxes,
// relations as lines, with computed ones apart, and entries as lines of text. Each has
// whether this view draws it.
function showMenu() {
  const { boxes, lines, text } = showable();
  const item = it => {
    const { shown, total } = shownCount(it);
    const partly = shown && shown < total ? `${shown} of ${total}` : '';
    const desc = [it.kind ? count(objectsOfKind(it.kind).length, 'box') : it.where, partly].filter(Boolean).join(' · ');
    return `<button class="menu-item" role="menuitemcheckbox" aria-checked="${shown === 0 ? 'false' : shown < total ? 'mixed' : 'true'}" data-action="show-form" data-key="${esc(it.key)}" data-on="${shown === 0}" data-menu="rb:show">
      ${box(shown === 0 ? null : true)}<span class="menu-text"><span class="menu-title">${esc(it.label)}</span>${desc ? `<span class="menu-desc">${esc(desc)}</span>` : ''}</span></button>`;
  };
  const section = (title, items) => items.length ? `<div class="menu-head">${title}</div>${items.map(item).join('')}` : '';
  return [section(`Boxes in ${esc(viewInUse().name)}`, boxes), section('Lines', lines.filter(x => !x.computed)),
    section('Computed lines', lines.filter(x => x.computed)), section('Text', text)].filter(Boolean).join('<div class="menu-sep"></div>');
}

// The things hidden one by one in this view, to show again.
function hiddenMenu() {
  const ids = hiddenInView().filter(id => records[id]);
  if (!ids.length) return '<div class="menu-note is-pad">Nothing is hidden one by one in this view.</div>';
  const label = id => isObject(records[id]) ? objectName(id) : relationTitle(id);
  return `<div class="menu-head">Hidden in ${esc(viewInUse().name)}</div>`
    + ids.map(id => `<button class="menu-item" role="menuitem" data-action="unhide" data-id="${id}"><span class="menu-text">${esc(label(id))}</span><span class="menu-desc">Show</span></button>`).join('')
    + `<div class="menu-sep"></div><button class="menu-item" role="menuitem" data-action="unhide-all"><span class="menu-text">Show all</span></button>`;
}

// ---- The view's filter ----
// A condition worked out at each object (see filterOutcome in chart.js), written in a menu like a formula
// in the panel: checked as it's typed, with names offered, and how many boxes it would show. The text
// being typed is a draft until it's applied.

const FILTER_EXAMPLE = '← [Investment Company] OR COUNT(Owners) > 1';

// Objects to offer names from: one of each kind, since names differ from kind to kind.
const filterSamples = () => kindsInState().map(k => objectsOfKind(k)[0]).filter(Boolean);

// The names that fit what's typed before the caret, from every kind's sample object: offered while a name
// is being typed, or after a dot, shortest first, so Owners comes before Ownership Adds Up.
function filterNames(textBefore) {
  if (!formulaResult.state || !/(\[[^\]]*|[A-Za-z_][A-Za-z0-9_]*|\.)$/.test(textBefore)) return [];
  const seen = new Map();
  for (const at of filterSamples())
    for (const s of Formulas.suggest(formulaResult, null, textBefore, at)) if (!seen.has(norm(s.name))) seen.set(norm(s.name), s);
  return [...seen.values()].filter(s => s.kind !== 'function').sort((a, b) => a.name.length - b.name.length).slice(0, 8);
}

// What the draft would do, or what's wrong with it, under the box.
function filterNote(text) {
  if (!clean(Formulas.splitFormula(text).body)) return `<span class="fx-hint">No filter: every box shows. For example, ${esc(FILTER_EXAMPLE)}</span>`;
  const o = filterOutcome(text);
  if (o.syntax) {
    const at = Math.min(o.syntax.pos, text.length);
    const where = `${esc(text.slice(Math.max(0, at - 24), at))}<mark>${esc(text.slice(at, at + 1) || ' ')}</mark>${esc(text.slice(at + 1, at + 12))}`;
    return `<span class="fx-problem">${esc(o.syntax.message)}</span> <span class="fx-where">…${where}</span>`;
  }
  const shown = o.total - o.hidden.size;
  const errs = [...o.errors.values()];
  const errNote = errs.length ? ` <span class="filter-err">${count(errs.length, 'box')} give${errs.length === 1 ? 's' : ''} ${esc(errs[0].code)}: ${esc(errs[0].msg ?? '')} They stay shown, marked.</span>` : '';
  return `<span class="fx-hint">Would show ${shown} of ${count(o.total, 'box')}.</span>${errNote}`;
}

function filterChips(textBefore) {
  return filterNames(textBefore).map(s => `<button class="filter-name" data-filter-suggest="${esc(s.name)}" title="${esc(s.kind)}">${esc(s.name)}</button>`).join('');
}

function filterMenu() {
  if (!chart.filterDraft || chart.filterDraft.view !== viewId) chart.filterDraft = { view: viewId, text: viewFilter() };
  const text = chart.filterDraft.text;
  return `<div class="filter-pop">
    <div class="menu-head">Show boxes in ${esc(viewInUse().name)} where</div>
    <textarea class="input filter-input" data-view-filter rows="3" spellcheck="false" autocomplete="off" placeholder="${esc(FILTER_EXAMPLE)}">${esc(text)}</textarea>
    <div class="filter-names" id="filter-chips">${filterChips(text)}</div>
    <div class="fx-note filter-note" id="filter-note">${filterNote(text)}</div>
    <div class="filter-foot"><button class="btn btn-primary" data-action="filter-apply">Apply</button>
      <button class="link-btn" data-action="filter-clear"${viewFilter() ? '' : ' disabled'}>Clear</button>
      <span class="fx-keys">Enter applies · Tab takes a name</span></div></div>`;
}

// How much of the chart this view leaves out, and a way to lay out what's left.
function boxesNote() {
  const hidden = hiddenHere();
  const objects = Object.keys(records).filter(id => isObject(records[id]));
  const shown = objects.filter(id => !hidden.has(id)).length;
  const o = filterOutcome(viewFilter());
  const errs = o.syntax ? 1 : o.errors.size;
  const err = errs ? ` <button class="link-btn rb-errors" data-action="menu" data-menu="rb:filter" title="The filter can’t be worked out everywhere">${o.syntax ? 'Filter doesn’t read' : count(errs, 'error')}</button>` : '';
  const tidy = shown < objects.length ? ` <button class="link-btn" data-action="view-tidy" title="Lay out the boxes this view shows in rows, owners and controllers above, in this view only">Tidy layout</button>` : '';
  return `<span class="rb-note">Showing ${shown} of ${count(objects.length, 'box')}</span>${err}${tidy}`;
}

function viewTab() {
  const sel = selection();
  const target = sel.object ?? sel.relation;
  const nHidden = hiddenInView().filter(id => records[id]).length;
  const show = `<div class="rb-row">${rbMenu('rb:show', `<span class="rb-field-text">Show</span>`, { cls: 'rb-field is-wide', title: 'What this view draws: boxes of each kind, lines of each relation, lines of text of each entry' }, showMenu)}</div>
    <div class="rb-row"><button class="rb-btn" data-action="hide-selection"${target ? '' : ' disabled'} title="${target ? 'Hide the selection in this view only' : 'Select a box or a line to hide it in this view'}">Hide</button>
    ${rbMenu('rb:hidden', `<span class="rb-field-text">Hidden${nHidden ? ` (${nHidden})` : ''}</span>`, { cls: 'rb-field', title: 'Things hidden one by one in this view', disabled: !nHidden }, hiddenMenu)}</div>`;
  const current = viewFilter();
  const filter = `<div class="rb-row">${rbMenu('rb:filter', `<span class="rb-field-text${current ? '' : ' is-placeholder'}">${esc(current ? Formulas.splitFormula(current).body.trim() : 'Show every box')}</span>`,
      { cls: 'rb-field is-filter', title: current ? `Shows the boxes where ${current}` : 'Show only the boxes where a condition holds, worked out at each one' }, filterMenu)}</div>
    <div class="rb-row">${boxesNote()}</div>`;
  const check = (key, label, on, title) => `<button class="rb-check" data-action="toggle-pref" data-key="${key}" aria-pressed="${on}" title="${title}">${box(on ? true : null)}${label}</button>`;
  const workspace = `<div class="rb-row">${check('grid', 'Gridlines', prefs.grid !== false, 'Dots on the sheet, to line boxes up by')}${check('legend', 'Legend', prefs.legend !== false, 'What the view’s looks mean, at the corner of the chart and in exports')}</div>
    <div class="rb-row">${check('panel', 'Record panel', prefs.panel !== false, 'The record panel on the right')}</div>`;
  return rbGroup(`Show and hide in ${esc(viewInUse().name)}`, show) + rbGroup('Filter boxes', filter) + rbGroup('Workspace', workspace);
}

function renderRibbon() {
  // A filter being typed is dropped when its menu closes without applying it.
  if (ui.menu !== 'rb:filter') chart.filterDraft = null;
  const tabs = RIBBON_TABS.map(([key, name]) =>
    `<button class="tab" role="tab" aria-selected="${chart.tab === key}" data-action="rb-tab" data-tab="${key}">${name}</button>`).join('');
  const body = chart.tab === 'insert' ? insertTab() : chart.tab === 'formulas' ? formulasTab() : chart.tab === 'view' ? viewTab() : homeTab();
  const ribbon = document.getElementById('ribbon');
  const scrolled = ribbon.querySelector('.ribbon-body')?.scrollLeft ?? 0;
  ribbon.innerHTML = `<div class="tabs ribbon-tabs" role="tablist">${tabs}</div><div class="ribbon-body">${body}</div>`;
  ribbon.querySelector('.ribbon-body').scrollLeft = scrolled;
  placeRibbonMenus();
  // Keep the engaged style's tile in view when the gallery is too narrow to show every tile.
  const gallery = document.querySelector('.gallery');
  const tile = gallery?.querySelector('.tile[aria-pressed="true"]');
  if (tile && (tile.offsetLeft + tile.offsetWidth > gallery.scrollLeft + gallery.clientWidth || tile.offsetLeft < gallery.scrollLeft))
    gallery.scrollLeft = tile.offsetLeft - (gallery.clientWidth - tile.offsetWidth) / 2;
  markClipped(gallery);
  // An open filter menu takes the keyboard, with the caret where it was left, or at the end.
  const filter = document.querySelector('[data-view-filter]');
  if (filter && document.activeElement !== filter) {
    const at = chart.filterDraft?.caret ?? filter.value.length;
    filter.focus();
    filter.setSelectionRange(at, at);
  }
}

// An open ribbon menu is placed over the page, under its button, so the ribbon's sideways scrolling
// doesn't clip it; it follows the button if the ribbon scrolls.
function placeRibbonMenus() {
  for (const menu of document.querySelectorAll('#ribbon .rb-menu')) {
    const a = menu.parentElement.getBoundingClientRect();
    const w = menu.offsetWidth;
    const left = menu.classList.contains('is-right') ? a.right - w : a.left;
    Object.assign(menu.style, { position: 'fixed', top: `${a.bottom + 6}px`, left: `${Math.max(8, Math.min(left, innerWidth - w - 8))}px`, right: 'auto' });
  }
}
document.addEventListener('scroll', e => {
  if (e.target.matches?.('.ribbon-body')) placeRibbonMenus();
  if (e.target.matches?.('.gallery')) markClipped(e.target);
}, true);

// A gallery with more chips past its end fades there.
const markClipped = el => el?.classList.toggle('is-clipped', el.scrollWidth > el.scrollLeft + el.clientWidth + 1);

// A draft that doesn't read stays open, with the place it goes wrong shown and the caret there. Anything
// else applies, errors and all, since the boxes it can't be worked out at stay shown, marked.
function applyFilter() {
  const text = Formulas.tidyArrow(chart.filterDraft?.text ?? viewFilter());
  const { syntax } = filterOutcome(text);
  if (syntax) {
    ui.menu = 'rb:filter';
    if (chart.filterDraft) chart.filterDraft.caret = Math.min(syntax.pos, text.length);
    return;
  }
  if (text.trim() !== viewFilter()) setViewFilter(text);
  ui.menu = null;
  chart.filterDraft = null;
}

// What's under the filter box follows the draft as it's typed, without redrawing, so the caret stays put.
function refreshFilterNote(t) {
  document.getElementById('filter-note').innerHTML = filterNote(t.value);
  document.getElementById('filter-chips').innerHTML = filterChips(t.value.slice(0, t.selectionStart));
}

// Puts a name offered in place of the part of it typed before the caret, in brackets if it needs them.
function takeFilterName(t, name) {
  const pos = t.selectionStart ?? t.value.length;
  const before = t.value.slice(0, pos);
  const typed = /(\[[^\]]*|[A-Za-z_][A-Za-z0-9_]*)$/.exec(before)?.[0] ?? '';
  const start = pos - typed.length;
  const text = /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : `[${name}]`;
  t.value = before.slice(0, start) + text + t.value.slice(pos).replace(/^[^\s.,()\]]*\]?/, '');
  const caret = start + text.length;
  t.focus();
  t.setSelectionRange(caret, caret);
  chart.filterDraft.text = t.value;
  refreshFilterNote(t);
}

document.addEventListener('input', e => {
  const t = e.target;
  if (!t.matches('[data-view-filter]') || !chart.filterDraft) return;
  if (Formulas.tidyArrow(t.value) !== t.value) {
    const pos = t.selectionStart - 1;
    t.value = Formulas.tidyArrow(t.value);
    t.setSelectionRange(pos, pos);
  }
  chart.filterDraft.text = t.value;
  chart.filterDraft.caret = t.selectionStart;
  refreshFilterNote(t);
});

// In the filter box, Enter applies, and Tab takes the first name offered. Escape closes it, as any menu.
document.addEventListener('keydown', e => {
  const t = e.target;
  if (!t.matches('[data-view-filter]')) return;
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    applyFilter();
    render();
  } else if (e.key === 'Tab' && !e.shiftKey) {
    const chip = document.querySelector('[data-filter-suggest]');
    if (chip) { e.preventDefault(); takeFilterName(t, chip.dataset.filterSuggest); }
  }
});

// The caret moves with clicks and arrow keys too, and the names offered follow it.
document.addEventListener('keyup', e => {
  if (e.target.matches('[data-view-filter]') && chart.filterDraft && e.key.startsWith('Arrow')) {
    chart.filterDraft.caret = e.target.selectionStart;
    document.getElementById('filter-chips').innerHTML = filterChips(e.target.value.slice(0, e.target.selectionStart));
  }
});

document.addEventListener('click', e => {
  const chip = e.target.closest('[data-filter-suggest]');
  const t = document.querySelector('[data-view-filter]');
  if (chip && t) takeFilterName(t, chip.dataset.filterSuggest);
});

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
  'style-form': d => engage(addStyleOnForm(d.form).id),
  'style-remove': () => { const eng = currentEngaged(); if (eng && !isKindStyle(eng.style)) { removeStyle(eng.style.id); chart.engaged = null; } },
  'insert-object': d => {
    const [x, y] = visibleCenter();
    chart.quick = d.kind ? { x, y, kind: d.kind, name: '' } : { x, y };
  },
  'insert-relation': () => {
    const sel = selection();
    if (sel.object) location.hash = `relate:${sel.object}`;
    else say('Select a box first, or drag from a box’s edge handle to another box.');
  },
  'toggle-pref': d => { prefs[d.key] = prefs[d.key] === false; savePrefs(); },
  'show-form': d => {
    const item = Object.values(showable()).flat().find(x => x.key === d.key);
    if (item) setShown(item, d.on === 'true');
    if (d.menu) ui.menu = d.menu;
  },
  'hide-selection': () => {
    const sel = selection();
    const id = sel.object ?? sel.relation;
    if (id) hideInView(id);
  },
  unhide: d => {
    setHiddenInView(hiddenInView().filter(id => id !== d.id));
    ui.menu = hiddenInView().length ? 'rb:hidden' : null;
  },
  'unhide-all': () => setHiddenInView([]),
  'filter-apply': () => applyFilter(),
  'filter-clear': () => { setViewFilter(''); chart.filterDraft = null; },
  'view-tidy': () => { tidyView(); ui.info = `Laid out the boxes ${viewInUse().name} shows.`; },
  'fx-why': () => { const id = selectedRecord(); if (id) go(id); },
  'fx-recalc': () => {
    recompute();
    say(`Worked out ${count(Object.keys(records).filter(isComputed).length, 'record')} in ${Math.round(formulaResult.ms ?? 0)} ms.`);
  },
});
