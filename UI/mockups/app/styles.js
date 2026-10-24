// Styles: how the chart draws records. A Style is a parameterization together with a mapping from that
// parameterization's outputs to formatting properties (data-model.md defines both terms). Every object
// has the same parameterization, a lone unlabeled node whose outputs are the kinds, so the style on it
// gives each kind its look. A style on Entity Type at Entities maps each option to a look, a style on a
// tag maps attested and ruled out, a style on a field maps its datatype, and a style on a relation's
// parameterization sets how its lines are drawn.
//
// A style is { id, param, label, where, map: { [output key]: properties } }, kept in `styles` in order.
// Where two styles set the same property for one box, the later one wins.

// Box properties go to the box of the object a record belongs to. Text properties go to the line of text
// the record shows in its box, if it shows one, and otherwise to every line in the box. On a relation's
// style, the box properties that make sense for a line (outline, weight, dash) draw its line, and the text
// properties its label. `show` puts a record on the chart, and `format` says how its text reads.
const BOX_PROPS = ['shape', 'fill', 'stroke', 'strokeWidth', 'dash'];
const TEXT_PROPS = ['font', 'size', 'bold', 'italic', 'color'];
const LINE_PROPS = ['stroke', 'strokeWidth', 'dash'];

const BOX_DEFAULTS = { shape: 'rect', fill: '#ffffff', stroke: '#27272a', strokeWidth: 1.25, dash: 'solid' };
const TEXT_DEFAULTS = { font: 'Inter', size: 12, bold: false, italic: false, color: '#18181b' };
const LINE_DEFAULTS = { stroke: '#3f3f46', strokeWidth: 1.25, dash: 'solid', font: 'Inter', size: 11, bold: false, italic: false, color: '#27272a', show: true, format: 'value' };

// What a new kind, its Name, and a new kind of relation start with.
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

// The sample chart's styles. Ownership has three parameterizations here (owners that are Entities,
// Individuals and Investor Groups), so it has three line styles, and its Percentage three more. The
// lines carry no label of their own; the Percentage at each one labels it, and a ruled-out ownership
// isn't drawn.
function defaultStyles(recs) {
  const p = id => parameterization(recs, id);
  const owned = () => ({ true: { show: true, format: 'none' }, false: { show: false } });
  const muted = { show: true, format: 'paren', size: 10.5, color: '#52525b' };
  return [
    { id: 'st_kind', param: '[]', label: 'Kind', where: 'every object',
      map: { entity: KIND_PRESET, individual: { ...KIND_PRESET, shape: 'oval' }, 'investor group': { ...KIND_PRESET, fill: '#f4f4f5' } } },
    { id: 'st_name_entity', param: p('fund_name'), map: { text: { show: true, bold: true } } },
    { id: 'st_name_individual', param: p('chen_name'), map: { text: { show: true, bold: true } } },
    { id: 'st_name_investors', param: p('inv_us_name'), map: { text: NAME_PRESET } },
    { id: 'st_entity_type', param: p('fund_type'), map: {
      'limited partnership': { shape: 'triangle' }, 'exempted limited partnership': { shape: 'triangle' },
      'limited liability company': { shape: 'rounded' }, corporation: { shape: 'rect' } } },
    { id: 'st_vehicle', param: p('fund_vehicle'), map: {
      'main fund': { fill: '#e8eefb' }, 'feeder fund': { fill: '#e8eefb' }, 'portfolio company': { fill: '#f4f4f5' } } },
    { id: 'st_jurisdiction', param: p('fund_juris'), map: { delaware: muted, 'cayman islands': muted } },
    { id: 'st_good_standing', param: p('fund_good'), map: { false: { stroke: '#d63b3b', strokeWidth: 2, dash: 'dashed' } } },
    { id: 'st_own_entities', param: p('own_fund_blkr'), map: owned() },
    { id: 'st_own_individuals', param: p('own_chen_gp'), map: owned() },
    { id: 'st_own_investors', param: p('own_us_fund'), map: owned() },
    { id: 'st_pct_entities', param: p('own_fund_blkr_pct'), map: { number: { show: true } } },
    { id: 'st_pct_individuals', param: p('own_chen_gp_pct'), map: { number: { show: true } } },
    { id: 'st_pct_investors', param: p('own_us_fund_pct'), map: { number: { show: true } } },
    { id: 'st_gp_lp', param: p('gp_of_fund'), map: { true: { show: true, dash: 'dashed', format: 'label' } } },
    { id: 'st_gp_elp', param: p('gp_of_feeder'), map: { true: { show: false, dash: 'dashed', format: 'label' } } },
    { id: 'st_member', param: p('mem_chen_gp'), map: { 'managing member': { show: false }, member: { show: false } } },
  ];
}

const styleById = id => styles.find(s => s.id === id);
const styleOfParam = param => styles.find(s => s.param === param);
const styleOf = id => styleOfParam(parameterization(records, id));
const isKindStyle = s => s.param === '[]';
// Whether a style draws relation lines rather than boxes and their text.
const isLineStyle = s => { const id = sampleOf(s.param); return id ? isRelation(records[id]) : !!s.line; };

// A record with the parameterization, to read its labels and locations from.
const sampleOf = param => Object.keys(records).find(id => parameterization(records, id) === param);

// How a location reads in a style's description: an object's kind, or a relation's edges and the kinds
// it relates, then any segments below it.
const kindPath = at => pathTo(at).map((id, i) => i ? segmentText(id) : isRelation(records[id]) ? relationKindPath(id) : records[id].kind).join(' › ');
const relationKindPath = id => `${relationLabel(records[id])} (${records[id].args.map(a => kindPath(a.at)).join(' → ')})`;

// Whether a record sits at a relation, or below one, so that it shows by the relation's line, not in a box;
// and whether a style is on such records, like the Percentage at an ownership.
const onRelation = id => !isRelation(records[id]) && isRelation(records[objectOf(id)]);
const isLineTextStyle = s => { const id = sampleOf(s.param); return !!id && onRelation(id); };

// A style's name and what it covers, from a record with its parameterization if there still is one.
// The last description worked out for each parameterization, for a style whose records have all gone.
const describedParams = new Map();

function describeStyle(s) {
  if (isKindStyle(s)) return { label: 'Kind', where: 'every object' };
  const id = sampleOf(s.param);
  if (!id) return describedParams.get(s.param) ?? { label: s.label ?? 'Style', where: s.where ?? 'nothing in the chart now' };
  const r = records[id];
  const loc = records[r.at];
  const d = isRelation(r) ? { label: relationLabel(r), where: r.args.map(a => kindPath(a.at)).join(' → ') }
    : { label: r.edge, where: isObject(loc) ? `on ${plural(loc.kind)}` : `under ${kindPath(r.at)}` };
  describedParams.set(s.param, d);
  return d;
}

// The outputs a style can map: those its parameterization has in the state, and any it already maps,
// as [key, text] pairs.
function styleOutputs(s) {
  const outputs = new Map();
  for (const [id, r] of Object.entries(records))
    if (parameterization(records, id) === s.param && !outputs.has(outputKey(r))) outputs.set(outputKey(r), outputText(r));
  for (const key of Object.keys(s.map)) if (!outputs.has(key)) outputs.set(key, key === 'true' ? 'Attested' : key === 'false' ? 'Ruled out' : key);
  return [...outputs].sort((a, b) => byLabel(a[1], b[1]));
}

// How many records a style's entry for an output covers, for "applies to 3".
const recordsWithOutput = (s, output) => Object.keys(records)
  .filter(id => parameterization(records, id) === s.param && (output === '*' || outputKey(records[id]) === output));

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

// An object's box: its box properties, its lines of text, and the styles that apply to it (each with the
// record it applies through), in the order they apply.
function boxLook(obj) {
  const recs = panelOrder(obj);
  const applied = [];
  for (const style of styles)
    for (const id of recs)
      if (parameterization(records, id) === style.param) applied.push({ style, id, output: outputKey(records[id]), props: style.map[outputKey(records[id])] ?? {} });
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

// A two-argument relation's line, and its label. The label is the relation's own text, unless its style
// says No label, followed by the text of each record located at it whose style shows it, such as an
// ownership's Percentage. Like text in a box, each part takes the line's text properties unless its own
// style sets them.
function lineLook(id) {
  const r = records[id];
  const style = styleOf(id);
  const look = { ...LINE_DEFAULTS, ...(style?.map[outputKey(r)] ?? {}) };
  const own = look.format === 'none' ? ''
    : look.format === 'label' || isTag(r) ? r.args[0].edge
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
  const base = isLineStyle(s) ? LINE_DEFAULTS : { ...BOX_DEFAULTS, ...TEXT_DEFAULTS, show: false, format: 'value' };
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

// Adds a style on a record's parameterization, seeded so it shows at once: a field's or tag's text in
// its box, a choice's options as fills, a relation's lines. Returns the style, or the one already there.
function addStyle(id) {
  const existing = styleOf(id);
  if (existing) return existing;
  const r = records[id];
  const param = parameterization(records, id);
  const outputs = styleOutputs({ param, map: {} });
  const muted = { show: true, size: 10.5, color: '#52525b' };
  const map = isRelation(r) ? Object.fromEntries(outputs.map(([k]) => [k, { ...RELATION_PRESET }]))
    : isChoice(r) ? Object.fromEntries(outputs.map(([k], i) => [k, { fill: SOFT_FILLS[i % SOFT_FILLS.length] }]))
    : isTag(r) ? { true: muted }
    : { [r.field]: muted };
  const style = { id: newId(), param, ...describeStyle({ param, map }), map };
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

// Gives a new kind, and its Name, the preset styles. Part of the step that created the kind's first object.
function ensureKindStyles(kind) {
  const k = norm(kind);
  const kindStyle = styles.find(isKindStyle);
  if (!kindStyle) styles = [{ id: newId(), param: '[]', label: 'Kind', where: 'every object', map: { [k]: KIND_PRESET } }, ...styles];
  else if (!kindStyle.map[k]) styles = styles.map(s => s === kindStyle ? { ...s, map: { ...s.map, [k]: KIND_PRESET } } : s);
  const nameId = Object.keys(records).find(id => isObjectName(id) && same(records[records[id].at].kind, kind));
  if (nameId && !styleOf(nameId)) {
    const param = parameterization(records, nameId);
    styles = [...styles, { id: newId(), param, ...describeStyle({ param, map: {} }), map: { text: NAME_PRESET } }];
  }
}

// Gives a two-argument relation of a new parameterization a style for its lines. It copies a style for
// relations with the same edges and output type, if there is one (ownership by a new kind of owner looks
// like other ownership), and otherwise starts from the preset. Part of the step that added the relation.
function ensureRelationStyle(id) {
  const r = records[id];
  if (!isRelation(r) || r.args.length !== 2 || styleOf(id)) return;
  const param = parameterization(records, id);
  const sibling = styles.find(s => {
    const sid = sampleOf(s.param);
    return sid && sid !== id && isRelation(records[sid]) && typeOf(records[sid]) === typeOf(r) && same(relationLabel(records[sid]), relationLabel(r));
  });
  const map = sibling ? structuredClone(sibling.map) : { [outputKey(r)]: { ...RELATION_PRESET } };
  if (!map[outputKey(r)]) map[outputKey(r)] = { ...RELATION_PRESET };
  styles = [...styles, { id: newId(), param, ...describeStyle({ param, map }), line: true, map }];
  saveState();
}
