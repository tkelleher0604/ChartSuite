// Styles: how a view draws records. A Style is a form together with a mapping from that form's outputs to
// formatting properties. data-model.md defines outputs; a specification's form is its shape and sort (see
// model.js), so a style on Ownership covers ownership by every kind of owner, and a style on Name the Name
// of everything. Every object has the form 'object', whose outputs are the kinds, so the Kind style gives
// each kind its box. A style on Entity Type maps each option to a look, a style on a tag maps attested and
// ruled out, a style on a field maps its datatype, and a style on a relation sets how its lines are drawn.
//
// A style is { id, form, map: { [output key]: properties } }, kept in `styles` in order, at most one for
// each form in a view. Where two styles set the same property for one box, the later one wins.
//
// `show` says whether a record is drawn: an object as its box, an entry as a line of text in its box (or,
// below a relation, in the relation's label), a two-argument relation as a line. Where no style says,
// objects are drawn, entries aren't, and relations are, except those of a form a formula covers, and
// ruled-out tags, which are drawn only where a style says so.

// Box properties go to the box of the object a record belongs to. Text properties go to the line of text
// the record shows in its box, if it shows one, and otherwise to every line in the box. On a relation's
// style, the box properties that make sense for a line (outline, weight, dash) draw its line, and the text
// properties its label. `format` says how a record's text reads.
const BOX_PROPS = ['shape', 'fill', 'stroke', 'strokeWidth', 'dash'];
const TEXT_PROPS = ['font', 'size', 'bold', 'italic', 'color'];
const LINE_PROPS = ['stroke', 'strokeWidth', 'dash'];

const BOX_DEFAULTS = { shape: 'rect', fill: '#ffffff', stroke: '#27272a', strokeWidth: 1.25, dash: 'solid' };
const TEXT_DEFAULTS = { font: 'Inter', size: 12, bold: false, italic: false, color: '#18181b' };
const LINE_DEFAULTS = { stroke: '#3f3f46', strokeWidth: 1.25, dash: 'solid', font: 'Inter', size: 11, bold: false, italic: false, color: '#27272a', show: true, format: 'value' };

// What a new kind, its Name, and a new relation start with.
const KIND_PRESET = { shape: 'rect', fill: '#ffffff', stroke: '#27272a', strokeWidth: 1.25, dash: 'solid', font: 'Inter', size: 12, color: '#18181b' };
const NAME_PRESET = { show: true, bold: true };
const RELATION_PRESET = { show: true, format: 'value' };

const SHAPES = [['rect', 'Rectangle'], ['rounded', 'Rounded rectangle'], ['oval', 'Oval'], ['triangle', 'Triangle'], ['rect-oval', 'Rectangle with oval']];
const FONTS = ['Inter', 'Arial', 'Calibri', 'Georgia', 'Times New Roman'];
const SIZES = [8, 9, 10, 10.5, 11, 12, 13, 14, 16, 18, 20, 24];
const WEIGHTS = [0.75, 1, 1.25, 1.5, 2, 3];
const DASHES = [['solid', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted']];
const FORMATS = [['value', 'Value'], ['paren', '(Value)'], ['label', 'Label: Value']];
const LINE_FORMATS = [['value', 'Value'], ['label', 'Label'], ['none', 'No label']];
// Two rows of swatches, strong then soft, as in most formatting palettes.
const COLORS = [
  '#18181b', '#52525b', '#2b59c3', '#1f9d55', '#d63b3b', '#c2710c', '#7c3aed', '#0e7490',
  '#ffffff', '#f4f4f5', '#e8eefb', '#e7f5ec', '#fdecec', '#fdf0e1', '#ece9fb', '#e6f4f6',
];
// Fills a new choice style hands out to its options, in turn.
const SOFT_FILLS = ['#e8eefb', '#e7f5ec', '#fdf0e1', '#ece9fb', '#e6f4f6', '#fdecec', '#f4f4f5'];

// The sample chart's styles, one for each form it styles. Ownership's lines carry no label of their own;
// the Percentage at each one labels it, and a ruled-out ownership isn't drawn.
function defaultStyles(recs) {
  const f = id => formKeyOf(id, recs);
  const muted = { show: true, format: 'paren', size: 10.5, color: '#52525b' };
  return [
    { id: 'st_kind', form: 'object',
      map: { entity: KIND_PRESET, individual: { ...KIND_PRESET, shape: 'oval' }, 'investor group': { ...KIND_PRESET, fill: '#f4f4f5' } } },
    { id: 'st_name', form: f('fund_name'), map: { text: NAME_PRESET } },
    { id: 'st_entity_type', form: f('fund_type'), map: {
      'limited partnership': { shape: 'triangle' }, 'exempted limited partnership': { shape: 'triangle' },
      'limited liability company': { shape: 'rounded' }, corporation: { shape: 'rect' } } },
    { id: 'st_vehicle', form: f('fund_vehicle'), map: {
      'main fund': { fill: '#e8eefb' }, 'feeder fund': { fill: '#e8eefb' }, 'business development company': { fill: '#e8eefb' },
      'portfolio company': { fill: '#f4f4f5' } } },
    { id: 'st_jurisdiction', form: f('fund_juris'), map: { delaware: muted, 'cayman islands': muted, maryland: muted } },
    { id: 'st_good_standing', form: f('fund_good'), map: { false: { stroke: '#d63b3b', strokeWidth: 2, dash: 'dashed' } } },
    { id: 'st_ownership', form: f('own_fund_blkr'), map: { true: { show: true, format: 'none' }, false: { show: false } } },
    { id: 'st_percentage', form: f('own_fund_blkr_pct'), map: { percent: { show: true } } },
    { id: 'st_gp', form: f('gp_of_fund'), map: { true: { show: true, dash: 'dashed', format: 'label' } } },
    { id: 'st_member', form: f('mem_chen_gp'), map: { 'managing member': { show: false }, member: { show: false } } },
    { id: 'st_adviser', form: f('adv_bdc'), map: { true: { show: false, dash: 'dotted', format: 'label' } } },
    { id: 'st_position', form: f('pos_chen_bdc'), map: { director: { show: false }, officer: { show: false } } },
  ];
}

// The sample's views: the structure chart, and a 40 Act view of the same records that hides ownership
// and the GP's lines, draws the BDC's close and remote affiliates, which formulas work out, and by its
// filter shows only the boxes in that analysis: the BDC and its close and remote affiliates.
const FORTY_ACT_FILTER = '← [Investment Company] OR COUNT([Close Affiliate Of]) + COUNT([Remote Affiliate Of]) > 0';

function sampleViews(recs, S, defs) {
  const structure = defaultStyles(recs);
  const hidden = ['st_ownership', 'st_percentage', 'st_gp'];
  const hide = s => ({ ...s, map: Object.fromEntries(Object.entries(s.map).map(([k, v]) => [k, { ...v, show: false }])) });
  const formOfDef = id => formOfTree(specsWithParam(defs.find(d => d.id === id).scope[0], S)[0]);
  const fortyAct = [
    ...structure.map(s => hidden.includes(s.id) ? hide(s) : s),
    { id: 'st_close', form: formOfDef('def_close'), map: { true: { show: true, format: 'none', stroke: '#2b59c3', strokeWidth: 1.5 } } },
    { id: 'st_remote', form: formOfDef('def_remote'), map: { true: { show: true, format: 'none', stroke: '#c2710c', dash: 'dashed' } } },
  ];
  return [{ id: 'view_main', name: 'Structure', styles: structure, hidden: ['gp_of_feeder'] },
    { id: 'view_40act', name: '40 Act', styles: fortyAct, filter: FORTY_ACT_FILTER }];
}

const styleById = id => styles.find(s => s.id === id);
const styleOfForm = form => styles.find(s => s.form === form);
const styleOf = id => styleOfForm(formKeyOf(id));
const isKindStyle = s => s.form === 'object';

// What a form is, read from its key: a relation's has more than one parameter; an entry located at a
// relation, or below one, shows by the relation's line rather than in a box.
const formArity = form => form === 'object' ? 0 : JSON.parse(form).length - 1;
function shapeBelowRelation(shape) {
  if (shape === '•') return false;
  const [, ...args] = JSON.parse(shape);
  return args.length > 1 || shapeBelowRelation(JSON.parse(args[0])[1]);
}
const isRelationForm = form => formArity(form) > 1;
const isLineTextForm = form => formArity(form) === 1 && shapeBelowRelation(JSON.parse(JSON.parse(form)[1])[1]);
// Whether a style draws relation lines rather than boxes and their text, and whether it's on records that
// show by a relation's line, like the Percentage at an ownership.
const isLineStyle = s => isRelationForm(s.form);
const isLineTextStyle = s => isLineTextForm(s.form);

// Whether a record sits at a relation, or below one, so that it shows by the relation's line, not in a box.
const onRelation = id => !isRelation(records[id]) && isRelation(records[objectOf(id)]);

// A style's name and what it covers: its form's.
const describeStyle = s => describeForm(s.form);

// The outputs a style can map: those its form has in the schema, and any it already maps, as [key, text].
function styleOutputs(s) {
  const outputs = new Map(formOutputs(s.form));
  for (const key of Object.keys(s.map)) if (!outputs.has(key)) outputs.set(key, key === 'true' ? 'Attested' : key === 'false' ? 'Ruled out' : key);
  return [...outputs].sort((a, b) => byLabel(String(a[1]), String(b[1])));
}

// The records a style's entry for an output covers, for "applies to 3".
const recordsWithOutput = (s, output) => Object.keys(records)
  .filter(id => formKeyOf(id) === s.form && (output === '*' || outputKey(records[id]) === output));

// ---- Looks ----

const pickProps = (props, keys) => Object.fromEntries(keys.filter(k => props[k] !== undefined).map(k => [k, props[k]]));

const FONT_STACKS = { Inter: "'Inter', sans-serif", Arial: 'Arial, Helvetica, sans-serif', Calibri: "Calibri, Carlito, 'Segoe UI', sans-serif", Georgia: 'Georgia, serif', 'Times New Roman': "'Times New Roman', Times, serif" };
const fontStack = f => FONT_STACKS[f] ?? `'${f}', sans-serif`;
const textCss = t => `font-family:${fontStack(t.font)};font-size:${t.size}px;font-weight:${t.bold ? 600 : 400};font-style:${t.italic ? 'italic' : 'normal'};color:${t.color}`;
const DASH_ARRAYS = { solid: 'none', dashed: '6 4', dotted: '1.5 3' };

const SHAPE_GLYPHS = {
  rect: '<rect x="1" y="2" width="20" height="12" />',
  rounded: '<rect x="1" y="2" width="20" height="12" rx="4" />',
  oval: '<ellipse cx="11" cy="8" rx="10" ry="6.5" />',
  triangle: '<polygon points="11,1 21,15 1,15" />',
  'rect-oval': '<rect x="1" y="2" width="20" height="12" /><ellipse cx="11" cy="8" rx="7.5" ry="4" />',
};
const shapeGlyph = (shape, fill = '#fff', stroke) =>
  `<svg class="glyph-shape" viewBox="0 0 22 16" aria-hidden="true" style="${stroke ? `color:${stroke};` : ''}">${SHAPE_GLYPHS[shape].replace(/ \/>/g, ` style="fill:${fill === 'none' ? 'transparent' : fill}" />`)}</svg>`;
const lineGlyph = (dash, width = 1.5) =>
  `<svg class="glyph-line" viewBox="0 0 40 10" aria-hidden="true"><line x1="2" y1="5" x2="38" y2="5" stroke-width="${width}" stroke-dasharray="${DASH_ARRAYS[dash] ?? 'none'}" stroke-linecap="${dash === 'dotted' ? 'round' : 'butt'}" /></svg>`;

// A small picture of what a style's entry for one output does: its line, its shape and colors, or its
// text. An entry that doesn't format anything yet is a dashed square.
function stylePreview(s, props) {
  if (isLineStyle(s)) return `<span class="tile-preview" style="color:${props.stroke ?? LINE_DEFAULTS.stroke}">${lineGlyph(props.dash ?? 'solid', 2)}</span>`;
  if (BOX_PROPS.some(p => props[p] !== undefined))
    return `<span class="tile-preview">${shapeGlyph(props.shape ?? 'rect', props.fill ?? '#fff', props.stroke ?? '#27272a')}</span>`;
  if (TEXT_PROPS.some(p => props[p] !== undefined) || props.show)
    return `<span class="tile-preview"><span class="tile-aa" style="${textCss({ ...TEXT_DEFAULTS, ...props, size: 12 })}">Aa</span></span>`;
  return '<span class="tile-preview"><span class="preview-empty"></span></span>';
}

// The records of an object in the order the panel lists them: the object, then its entries depth-first.
function panelOrder(obj) {
  const out = [obj];
  const walk = id => { for (const e of entriesOf(id)) { out.push(e); walk(e); } };
  walk(obj);
  return out;
}

// What a record shows as a line of text in its box.
function lineText(id, format) {
  const r = records[id];
  const text = isField(r) ? displayValue(r) : isChoice(r) ? r.choice : segmentText(id);
  if (format === 'paren') return `(${text})`;
  if (format === 'label' && !isTag(r)) return `${r.edge}: ${text}`;
  return text;
}

// Whether an object's box is drawn in this view, by its Kind style: View › Show hides a kind's boxes there.
const boxShown = obj => styles.find(isKindStyle)?.map[norm(records[obj].kind)]?.show !== false;

// An object's box: its box properties, its lines of text, and the styles that apply to it (each with the
// record it applies through), in the order they apply.
function boxLook(obj) {
  const recs = panelOrder(obj);
  const forms = recs.map(id => formKeyOf(id));
  const applied = [];
  for (const style of styles)
    recs.forEach((id, i) => {
      if (forms[i] === style.form) applied.push({ style, id, output: outputKey(records[id]), props: style.map[outputKey(records[id])] ?? {} });
    });
  const box = { ...BOX_DEFAULTS };
  const text = { ...TEXT_DEFAULTS };
  for (const a of applied) {
    Object.assign(box, pickProps(a.props, BOX_PROPS));
    if (!a.props.show || a.id === obj) Object.assign(text, pickProps(a.props, TEXT_PROPS));
  }
  const lines = applied.filter(a => a.props.show && a.id !== obj)
    .sort((a, b) => recs.indexOf(a.id) - recs.indexOf(b.id))
    .map(a => ({ id: a.id, styleId: a.style.id, text: lineText(a.id, a.props.format), look: { ...text, ...pickProps(a.props, TEXT_PROPS) } }));
  return { box, text, lines, applied };
}

// Whether a relation is drawn where no style says: not if formulas cover its form (they can relate nearly
// everything to everything: every affiliate of every entity, say), nor if it's a ruled-out tag.
const drawnByDefault = id => !coveredForms().has(formKeyOf(id)) && !(isTag(records[id]) && !records[id].tag);

// A two-argument relation's line, and its label. The label is the relation's own text, unless its style
// says No label, followed by the text of each record located at it whose style shows it, such as an
// ownership's Percentage. Like text in a box, each part takes the line's text properties unless its own
// style sets them.
function lineLook(id) {
  const r = records[id];
  const style = styleOf(id);
  const look = { ...LINE_DEFAULTS, show: drawnByDefault(id), ...(style?.map[outputKey(r)] ?? {}) };
  const own = look.format === 'none' ? ''
    : look.format === 'label' || isTag(r) ? relationNameOf(id)
    : isField(r) ? displayValue(r) : r.choice;
  const text = pickProps(look, TEXT_PROPS);
  const parts = own ? [{ id, styleId: style?.id, text: own, look: text }] : [];
  for (const e of panelOrder(id).slice(1)) {
    const s = styleOf(e);
    const props = s?.map[outputKey(records[e])];
    if (props?.show) parts.push({ id: e, styleId: s.id, text: lineText(e, props.format), look: { ...text, ...pickProps(props, TEXT_PROPS) } });
  }
  return { ...look, label: parts.map(p => p.text).join(' '), parts, styleId: style?.id };
}

// The effective value of each property for a style's output, as the ribbon shows it: what the style sets,
// and otherwise what the box or line would have without it.
function effectiveProps(s, output) {
  const own = s.map[output] ?? {};
  const base = isLineStyle(s) ? LINE_DEFAULTS : { ...BOX_DEFAULTS, ...TEXT_DEFAULTS, show: isKindStyle(s), format: 'value' };
  return { props: { ...base, ...own }, own };
}

// ---- Changing styles ----

// Sets properties on a style's entries for some outputs ('*' for all of them), as one undoable step.
function setStyleProps(styleId, output, patch) {
  const s = styleById(styleId);
  const keys = output === '*' ? styleOutputs(s).map(([k]) => k) : [output];
  const map = { ...s.map };
  for (const k of keys) {
    const next = { ...map[k], ...patch };
    for (const [p, v] of Object.entries(patch)) if (v === undefined) delete next[p];
    map[k] = next;
  }
  pushUndo();
  styles = styles.map(x => x === s ? { ...s, map } : x);
  saveState();
}

// The map a new style on a form starts with, so it shows at once: a field's or tag's text in its box, a
// choice's options as fills, a relation's lines.
function presetMap(form) {
  const outputs = formOutputs(form).map(([k]) => k);
  const muted = { show: true, size: 10.5, color: '#52525b' };
  if (isRelationForm(form)) return Object.fromEntries(outputs.filter(k => k !== 'false').map(k => [k, { ...RELATION_PRESET }]));
  const sort = JSON.parse(form)[0];
  if (sort === 'choice') return Object.fromEntries(outputs.map((k, i) => [k, { fill: SOFT_FILLS[i % SOFT_FILLS.length] }]));
  if (sort === 'tag') return { true: muted };
  return { [sort]: muted };
}

// A menu item that adds a style on a form, from one of its records (Add › Style… in the panel, New style
// in the ribbon): named as the form is, by its label and where it is.
function styleFormItem(form, id) {
  const d = describeForm(form);
  return `<button class="menu-item" role="menuitem" data-action="style-new" data-id="${esc(id)}">
    <span class="menu-text"><span class="menu-title">${esc(d.label)}</span><span class="menu-desc">${esc(d.where)}</span></span></button>`;
}

// Adds a style on a form, or on a record's. Returns the style, or the one already there.
const addStyle = id => addStyleOnForm(formKeyOf(id));
function addStyleOnForm(form) {
  const existing = styleOfForm(form);
  if (existing) return existing;
  const style = { id: newId(), form, map: presetMap(form) };
  pushUndo();
  styles = [...styles, style];
  saveState();
  return style;
}

function removeStyle(styleId) {
  pushUndo();
  styles = styles.filter(s => s.id !== styleId);
  saveState();
}

// Applies a change to the styles of every view: `change(list, current)` gets each view's styles, and
// whether that view is the one in use, and returns them changed.
function forEveryView(change) {
  styles = change(styles, true);
  views = views.map(v => v.id === viewId || !v.styles ? v : { ...v, styles: change(v.styles, false) });
}

// Gives a new kind its box, and the Name form its style, in every view, since boxes show in every view.
// Part of the step that created the kind's first object.
function ensureKindStyles(kind) {
  const k = norm(kind);
  const nameId = Object.keys(records).find(id => isObjectName(id) && same(records[records[id].at].kind, kind));
  const nameForm = nameId && formKeyOf(nameId);
  forEveryView(list => {
    const kindStyle = list.find(isKindStyle);
    let out = !kindStyle ? [{ id: newId(), form: 'object', map: { [k]: KIND_PRESET } }, ...list]
      : kindStyle.map[k] ? list : list.map(s => s === kindStyle ? { ...s, map: { ...s.map, [k]: KIND_PRESET } } : s);
    if (nameForm && !out.some(s => s.form === nameForm)) out = [...out, { id: newId(), form: nameForm, map: { text: NAME_PRESET } }];
    return out;
  });
}

// Gives a two-argument relation of a new form a style for its lines: drawn in the view it was added in,
// and hidden in the others, so relating two boxes in one view doesn't redraw the others. A relation of a
// form that has a style already needs nothing. Part of the step that added the relation.
function ensureRelationStyle(id) {
  const r = records[id];
  if (!isRelation(r) || r.args.length !== 2) return;
  const form = formKeyOf(id);
  forEveryView((list, current) => list.some(s => s.form === form) ? list
    : [...list, { id: newId(), form, map: { [outputKey(r)]: { ...RELATION_PRESET, show: current } } }]);
  saveState();
}

// ---- Show and hide ----
// What a view draws comes down to the `show` of styles on forms: a kind's boxes by the Kind style, a
// relation's lines by its form's style, an entry's lines of text by its form's style. View › Show lists
// them all, grouped by what they draw.

// The forms a view can show or hide: kinds (as boxes), two-argument relations (as lines) and entries (as
// lines of text, in boxes or by lines), each { key, label, kind? , form?, computed }. Relations a formula
// covers say so.
function showable() {
  const kinds = kindsInState().map(kind => ({ key: `kind:${norm(kind)}`, kind, label: plural(kind) }));
  const lines = [], text = [];
  for (const form of formsOfSchema()) {
    if (form === 'object') continue;
    const d = describeForm(form);
    if (isRelationForm(form)) { if (formArity(form) === 2) lines.push({ key: form, form, label: d.label, where: d.where, computed: coveredForms().has(form) }); }
    else text.push({ key: form, form, label: d.label, where: d.where });
  }
  const byLabelOf = (a, b) => byLabel(a.label, b.label);
  return { boxes: kinds, lines: lines.sort((a, b) => a.computed - b.computed || byLabelOf(a, b)), text: text.sort(byLabelOf) };
}

// Whether a kind's boxes, or a form's records, are drawn in this view: all of them, none, or some
// ('mixed'), as { shown, total }.
function shownCount(item) {
  if (item.kind) return { shown: styles.find(isKindStyle)?.map[norm(item.kind)]?.show === false ? 0 : 1, total: 1 };
  const ids = Object.keys(records).filter(id => formKeyOf(id) === item.form);
  const hidden = new Set(hiddenInView());
  const drawn = id => isRelationForm(item.form) ? lineLook(id).show : !!styleOf(id)?.map[outputKey(records[id])]?.show;
  if (ids.length) return { shown: ids.filter(id => !hidden.has(id) && drawn(id)).length, total: ids.length };
  return { shown: Object.values(styleOfForm(item.form)?.map ?? {}).some(v => v.show) ? 1 : 0, total: 1 };
}

// Colors a computed relation's lines start with, in turn, so that each reads apart from entered ones.
const COMPUTED_LINE_COLORS = ['#7c3aed', '#0e7490', '#c2710c', '#2b59c3', '#1f9d55', '#d63b3b'];

// Shows or hides a kind's boxes, or a form's records, in this view, as one undoable step. A form without a
// style gets one from its preset; a computed relation's starts dashed, in a color of its own. Text a
// relation's lines show, like an ownership's Percentage, comes and goes with them. A ruled-out tag stays
// undrawn.
function setShown(item, on) {
  pushUndo();
  if (item.kind) {
    const k = norm(item.kind);
    styles = styles.map(s => isKindStyle(s) ? { ...s, map: { ...s.map, [k]: { ...(s.map[k] ?? KIND_PRESET), show: on } } } : s);
    saveState();
    return;
  }
  const form = item.form;
  const computed = coveredForms().has(form);
  const colorAt = showable().lines.filter(x => x.computed).findIndex(x => x.form === form);
  const preset = isRelationForm(form) && computed ? { format: 'none', stroke: COMPUTED_LINE_COLORS[Math.max(0, colorAt) % COMPUTED_LINE_COLORS.length], dash: 'dashed' } : {};
  const restyle = (f, props) => {
    const s = styleOfForm(f);
    const map = { ...(s?.map ?? presetMap(f)) };
    for (const k of new Set([...Object.keys(map), ...formOutputs(f).map(([k]) => k)])) {
      if (k === 'false' && isRelationForm(f) && on) continue;
      map[k] = { ...props, ...(map[k] ?? {}), show: on };
    }
    styles = s ? styles.map(x => x === s ? { ...s, map } : x) : [...styles, { id: newId(), form: f, map }];
  };
  restyle(form, preset);
  if (isRelationForm(form)) for (const f of formsAt(form)) if (styleOfForm(f)) restyle(f, {});
  saveState();
}

// The entry forms located at a relation form, like Percentage at Ownership.
const formsAt = relForm => formsOfSchema().filter(f => formArity(f) === 1 && specsOfForm(f).some(t => t.args[0].loc.args?.length > 1 && formOfTree(t.args[0].loc) === relForm));
