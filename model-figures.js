// The figures of model.html, worked out live from the app's own code (app/core) on the sample chart.
// The page builds the sample in memory and never saves, so it leaves the app's saved workbook alone.

// ---- Drawing trees ----
// A tree to draw is { label, cls, edges: [{ label, child }] }. cls is 'out' for the root's output, 'link'
// for a linkage, 'kind' for a kind or an object, and 'erased' for a node whose label has been removed.
// Trees are drawn root at the top, as data-model.md describes them: each node's locations hang below it.

const TREE = { font: 12, charW: 6.7, padX: 9, nodeH: 24, levelH: 70, gap: 18, erasedR: 6 };

const textWidth = s => String(s ?? '').length * TREE.charW;
const nodeWidth = n => n.cls === 'erased' || !n.label ? TREE.erasedR * 2 : textWidth(n.label) + TREE.padX * 2;

// Each subtree's width: its own node's, or its children's side by side, whichever is wider.
function measure(n) {
  for (const e of n.edges ?? []) measure(e.child);
  const kids = (n.edges ?? []).reduce((w, e) => w + Math.max(e.child.w, textWidth(e.label) + 8), 0) + TREE.gap * Math.max(0, (n.edges?.length ?? 0) - 1);
  n.w = Math.max(nodeWidth(n), kids);
}

function place(n, x, y) {
  n.x = x + n.w / 2;
  n.y = y;
  let cx = x + (n.w - ((n.edges ?? []).reduce((w, e) => w + Math.max(e.child.w, textWidth(e.label) + 8), 0) + TREE.gap * Math.max(0, (n.edges?.length ?? 0) - 1))) / 2;
  for (const e of n.edges ?? []) {
    const slot = Math.max(e.child.w, textWidth(e.label) + 8);
    place(e.child, cx + (slot - e.child.w) / 2, y + TREE.levelH);
    cx += slot + TREE.gap;
  }
}

const escXml = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function svgNodes(n, out) {
  for (const e of n.edges ?? []) {
    const y1 = n.y + TREE.nodeH / 2, y2 = e.child.y - (e.child.cls === 'erased' || !e.child.label ? TREE.erasedR : TREE.nodeH / 2);
    out.push(`<line x1="${n.x}" y1="${y1}" x2="${e.child.x}" y2="${y2}" style="stroke:var(--edge);stroke-width:1.2" />`);
    const mx = (n.x + e.child.x) / 2, my = (y1 + y2) / 2;
    out.push(`<text class="edge-label" x="${mx + (e.child.x >= n.x ? 6 : -6)}" y="${my}" text-anchor="${e.child.x >= n.x ? 'start' : 'end'}" dominant-baseline="middle">${escXml(e.label)}</text>`);
    svgNodes(e.child, out);
  }
  if (n.cls === 'erased' || !n.label) {
    out.push(`<circle cx="${n.x}" cy="${n.y}" r="${TREE.erasedR}" style="fill:var(--node);stroke:var(--erased);stroke-dasharray:2 2" />`);
    return;
  }
  const w = nodeWidth(n), color = { out: 'var(--out)', link: 'var(--link)', kind: 'var(--kind)' }[n.cls] ?? 'var(--node-stroke)';
  out.push(`<rect x="${n.x - w / 2}" y="${n.y - TREE.nodeH / 2}" width="${w}" height="${TREE.nodeH}" rx="${n.cls === 'kind' ? 12 : 5}" style="fill:var(--node);stroke:${color};stroke-width:1.4" />`);
  out.push(`<text x="${n.x}" y="${n.y + 1}" text-anchor="middle" dominant-baseline="middle" style="fill:${color}">${escXml(n.label)}</text>`);
}

function treeSvg(tree, title) {
  measure(tree);
  place(tree, 0, TREE.nodeH / 2 + 4);
  const depth = t => 1 + Math.max(0, ...(t.edges ?? []).map(e => depth(e.child)));
  const h = (depth(tree) - 1) * TREE.levelH + TREE.nodeH + 10;
  const out = [];
  svgNodes(tree, out);
  // Edge labels sit beside their edges and can reach past the nodes, so the picture is padded by the widest.
  const labels = t => (t.edges ?? []).flatMap(e => [textWidth(e.label), ...labels(e.child)]);
  const pad = Math.max(8, ...labels(tree)) + 8;
  return `<svg class="svg-tree" viewBox="${-pad} 0 ${tree.w + 2 * pad} ${h}" width="${Math.min(tree.w + 2 * pad, 720)}" role="img" aria-label="${escXml(title)}">${out.join('')}</svg>`;
}

// ---- The sample, in memory ----

setState(sampleState());

const $ = id => document.getElementById(id);
const chip = (group, value, text, on) => `<button class="chip" data-fig="${group}" data-value="${escXml(value)}" aria-pressed="${on}">${escXml(text)}</button>`;
const pill = text => `<span class="pill">${escXml(text)}</span>`;

// How a record reads in a list: an object by its name, a relation by its name and the objects it relates,
// an entry by its place.
function recordText(id) {
  const r = records[id];
  if (isObject(r)) return objectName(id);
  if (isRelation(r)) return `${relationNameOf(id)}: ${r.args.map(a => objectName(objectOf(a.at))).join(' → ')}`;
  const [head, ...rest] = pathTo(id);
  return `${recordText(head)} › ${rest.map(segmentText).join(' › ')}`;
}

// A key as the app writes it is JSON whose strings are JSON in turn. Read as nested brackets, without the
// quoting, it shows the tree it stands for: [percent, [percentage, [∘, [owned, •], [owner, •]]]].
function readableKey(key) {
  const unwrap = v => typeof v === 'string' && /^\[/.test(v) ? unwrap(JSON.parse(v)) : Array.isArray(v) ? v.map(unwrap) : v;
  const show = v => Array.isArray(v) ? `[${v.map(show).join(', ')}]` : String(v);
  try { return show(unwrap(key)); } catch { return key; }
}

// The computed record of a definition between two objects, if there is one.
const computedBetween = (defId, a, b) => Object.keys(records).find(k => records[k].computed === defId
  && objectOf(records[k].args[0].at) === a && objectOf(records[k].args[1].at) === b);

// ---- Figure 1: the anatomy of a record ----

const sortName = s => DATATYPE_NAMES[s] ? DATATYPE_NAMES[s].toLowerCase() : s;
const outLabel = out => 'field' in out ? DATATYPE_NAMES[out.field].toLowerCase() : 'choice' in out ? out.choice : out.tag ? 'True' : 'False';

// A record as a tree: its output at the root, its locations below, objects at the leaves.
function recordTree(id, root = true) {
  const r = records[id];
  if (isObject(r)) return { label: objectName(id), cls: 'kind' };
  const label = isField(r) ? displayValue(r) : isChoice(r) ? r.choice : r.tag ? 'True' : 'False';
  return { label, cls: root ? 'out' : 'link', edges: argsOf(r).map(a => ({ label: a.edge, child: recordTree(a.at, false) })) };
}
// A specification as a tree, its root's label kept or removed, or reduced to its form.
function specTree(t, mode, root = true) {
  if (t.kind !== undefined) return mode === 'form' ? { cls: 'erased' } : { label: t.kind, cls: 'kind' };
  const edges = t.args.map(a => ({ label: a.edge, child: specTree(a.loc, mode, false) }));
  if (root && mode === 'par') return { cls: 'erased', edges };
  if (root && mode === 'form') return { label: sortName(sortOf(t)), cls: 'out', edges };
  if (mode === 'form') return { cls: 'erased', edges };
  return { label: outLabel(t.out), cls: root ? 'out' : 'link', edges };
}

const anatomyRecords = () => [
  ['Objects', ['fund', 'chen']],
  ['Entries', ['fund_name', 'fund_juris', 'fund_file', 'fund_tax', 'fund_formed']],
  ['Relations', ['own_fdr_fund', 'own_fdr_fund_pct', 'gp_of_fund', 'sign_chen_fund']],
  ['Computed', [computedBetween('def_control', 'feeder', 'fund'), computedBetween('def_close', 'northpine', 'bdc'),
    computedBetween('def_look_through', 'inv_nonus', 'northpine'), Object.keys(records).find(k => records[k].computed === 'def_tax')]],
];
const anatomy = { id: 'own_fdr_fund_pct', mode: 'record' };
const MODES = [['record', 'Record'], ['spec', 'Specification'], ['par', 'Parameterization'], ['form', 'Form']];
const MODE_SAYS = {
  record: 'The record: its output at the root, objects at its leaves.',
  spec: 'Its specification: each object replaced by its kind, and a field’s value by its datatype.',
  par: 'Its parameterization: the specification with its root’s label removed.',
  form: 'Its form: every node label erased but the root’s sort; only the edges keep their labels.',
};

function drawAnatomy() {
  const groups = anatomyRecords().map(([name, ids]) => `<optgroup label="${name}">${ids.filter(id => id && records[id])
    .map(id => `<option value="${escXml(id)}"${id === anatomy.id ? ' selected' : ''}>${escXml(recordText(id))}</option>`).join('')}</optgroup>`).join('');
  $('anatomy-controls').innerHTML = `<label>Record <select data-fig="anatomy-id">${groups}</select></label>
    <span>${MODES.map(([m, t]) => chip('anatomy-mode', m, t, anatomy.mode === m)).join(' ')}</span>`;
  const t = treeOf(records, anatomy.id);
  const tree = anatomy.mode === 'record' ? recordTree(anatomy.id) : specTree(t, anatomy.mode);
  $('anatomy-body').innerHTML = `<p class="muted" style="margin:0 0 8px">${MODE_SAYS[anatomy.mode]}${isComputed(anatomy.id) ? ' This record is computed.' : ''}</p>
    ${treeSvg(tree, recordText(anatomy.id))}
    <dl class="keys">
      <dt>id</dt><dd>${escXml(anatomy.id)}</dd>
      <dt>κ(spec)</dt><dd>${escXml(readableKey(treeKey(t)))}</dd>
      <dt>parameterization</dt><dd>${escXml(readableKey(treeParam(t)))}</dd>
      <dt>form</dt><dd>${escXml(readableKey(formOfTree(t)))}</dd>
    </dl>`;
}

// ---- Figure 2: the schema by form ----

const forms = { onlySeveral: false };

function formRows() {
  const used = usage();
  return formsOfSchema().map(f => {
    const specs = specsOfForm(f);
    const params = [...new Map(specs.map(t => [treeParam(t), t])).values()];
    const recs = specs.reduce((n, t) => n + (used.get(treeKey(t))?.length ?? 0), 0);
    const arity = f === 'object' ? 0 : JSON.parse(f).length - 1;
    return { f, d: describeForm(f), params, outputs: formOutputs(f).map(([, text]) => String(text)), recs,
      group: arity === 0 ? 'Kinds' : arity === 1 ? 'Entries' : 'Relations', sort: f === 'object' ? 'object' : JSON.parse(f)[0] };
  });
}
// Where a parameterization's locations are, down to the kinds, since that is what tells apart the
// parameterizations of one form: Percentage at Ownership by an Entity, by an Individual, by an Investor Group.
function placeFull(loc) {
  if (loc.kind !== undefined) return loc.kind;
  if (loc.args.length > 1) return `${placeText(loc)} (${loc.args.map(a => `${a.edge} ${placeFull(a.loc)}`).join(', ')})`;
  return placeText(loc);
}
const whereOf = t => t.kind !== undefined ? 'every object'
  : t.args.length > 1 ? t.args.map(a => `${a.edge}: ${placeFull(a.loc)}`).join(', ') : placeFull(t.args[0].loc);

function drawForms() {
  const rows = formRows().filter(r => !forms.onlySeveral || r.params.length > 1);
  $('forms-controls').innerHTML = `${chip('forms-several', 'all', 'Every form', !forms.onlySeveral)} ${chip('forms-several', 'several', 'Forms with several parameterizations', forms.onlySeveral)}
    <span class="muted">${formsOfSchema().length} forms, ${Object.keys(schema).length} specifications in S</span>`;
  const sortText = s => DATATYPE_NAMES[s] ? `${DATATYPE_NAMES[s].toLowerCase()} field` : s;
  const body = ['Kinds', 'Entries', 'Relations'].map(g => {
    const rs = rows.filter(r => r.group === g).sort((a, b) => a.d.label.localeCompare(b.d.label));
    if (!rs.length) return '';
    return `<tr><th colspan="4" style="padding-top:14px">${g}</th></tr>` + rs.map(r => `<tr>
      <td><b>${escXml(r.d.label)}</b><br><span class="muted">${escXml(sortText(r.sort))}</span></td>
      <td>${r.params.map(t => `<div>${escXml(whereOf(t))}</div>`).join('')}</td>
      <td>${r.outputs.slice(0, 6).map(pill).join('')}${r.outputs.length > 6 ? ` <span class="muted">+${r.outputs.length - 6}</span>` : ''}</td>
      <td style="text-align:right">${r.recs}</td></tr>`).join('');
  }).join('');
  $('forms-body').innerHTML = `<table class="tbl"><thead><tr><th>Form</th><th>Its parameterizations</th><th>Outputs</th><th style="text-align:right">Records</th></tr></thead><tbody>${body}</tbody></table>`;
}

// ---- Figure 3: entered records win ----

const override = { on: false };

function controlPairs(result) {
  return Object.entries(result.records).filter(([, r]) => r.computed === 'def_control' && r.tag === true)
    .map(([id, r]) => ({ id, a: r.args[0].at, b: r.args[1].at, labels: result.computed[id]?.labels ?? [] }));
}

function drawOverride() {
  $('override-controls').innerHTML = `${chip('override', 'off', 'As entered', !override.on)} ${chip('override', 'on', 'Rule out the feeder’s control of the fund', override.on)}`;
  const target = computedBetween('def_control', 'feeder', 'fund');
  const before = controlPairs(formulaResult);
  let after = before;
  if (override.on) {
    const ruledOut = { ...modelPart(records[target]), tag: false };
    after = controlPairs(Formulas.computeState({ ...entered, [target]: ruledOut }, engineDefinitions(definitions, names, schema), engineNames(names)));
  }
  const kept = new Set(after.map(p => p.id));
  const short = id => objectName(objectOf(id)).replace(/,? (L\.P\.|LLC|Inc\.)$/, '');
  const rows = before.sort((p, q) => short(p.a).localeCompare(short(q.a)) || short(p.b).localeCompare(short(q.b))).map(p => {
    const gone = !kept.has(p.id);
    const note = p.id === target && override.on ? '<span class="no">ruled out, entered</span>' : gone ? '<span class="no">no longer implied</span>' : p.labels.map(pill).join('');
    return `<tr${gone ? ' style="opacity:.6"' : ''}><td>${gone ? '<s>' : ''}${escXml(short(p.a))} → ${escXml(short(p.b))}${gone ? '</s>' : ''}</td><td>${note}</td></tr>`;
  }).join('');
  $('override-body').innerHTML = `<p style="margin:0 0 8px">Control attests <b>${after.length}</b> pairs${override.on ? `, down from ${before.length}` : ''}.</p>
    <table class="tbl"><thead><tr><th>Controller → Controlled</th><th>Implied by</th></tr></thead><tbody>${rows}</tbody></table>`;
}

// ---- Figure 4: how a view draws a box ----

const viewFig = { view: null, obj: 'fund' };

// Whether a view's filter holds at an object, as the chart works it out.
function filterHolds(view, obj) {
  if (!view.filter) return { ok: true, why: 'no filter' };
  const body = view.filter.replace(/^\s*(←|<-|=)/, '');
  const v = Formulas.evaluateAt(formulaResult, `= IF(${body}, TRUE, FALSE)`, obj);
  if (Formulas.isError(v)) return { ok: true, why: `the filter runs into ${v.code}, so the box stays, marked` };
  return { ok: v === true, why: v === true ? 'the filter holds' : 'the filter doesn’t hold' };
}

// A property as §5.2 names it, with a swatch for a color.
const PROP_NAMES = { shape: 'shape', fill: 'fill', stroke: 'outline', strokeWidth: 'outline weight', dash: 'dash' };
function propText(k, v) {
  const name = PROP_NAMES[k] ?? k;
  if (/fill|stroke|color/.test(k) && typeof v === 'string' && v.startsWith('#'))
    return `${name} <span title="${v}" style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${v};border:1px solid var(--rule-strong);vertical-align:-1px"></span>`;
  return `${name} ${escXml(String(v))}`;
}

function drawView() {
  const view = views.find(v => v.id === viewFig.view) ?? views[0];
  viewFig.view = view.id;
  const objs = Object.keys(records).filter(id => isObject(records[id])).sort((a, b) => objectName(a).localeCompare(objectName(b)));
  $('view-controls').innerHTML = `<label>View <select data-fig="view-id">${views.map(v => `<option value="${v.id}"${v.id === view.id ? ' selected' : ''}>${escXml(v.name)}</option>`).join('')}</select></label>
    <label>Object <select data-fig="view-obj">${objs.map(id => `<option value="${id}"${id === viewFig.obj ? ' selected' : ''}>${escXml(objectName(id))}</option>`).join('')}</select></label>`;
  const keep = styles;
  styles = view.id === viewId ? styles : view.styles;
  try {
    const look = boxLook(viewFig.obj);
    const shown = boxShown(viewFig.obj);
    const hidden = (view.hidden ?? []).includes(viewFig.obj);
    const filter = filterHolds(view, viewFig.obj);
    const drawn = shown && !hidden && filter.ok;
    // The box properties each step sets that a later one sets again, and so loses.
    const later = look.applied.map((a, i) => new Set(look.applied.slice(i + 1).flatMap(b => Object.keys(pickProps(b.props, BOX_PROPS)))));
    const rows = look.applied.map((a, i) => {
      const sets = Object.entries(pickProps(a.props, BOX_PROPS)).map(([k, v]) => later[i].has(k) ? `<s class="muted">${propText(k, v)}</s>` : propText(k, v));
      if (a.props.show && a.id !== viewFig.obj) sets.push('drawn as a line of text');
      if (!sets.length) return '';
      const through = a.id === viewFig.obj ? objectName(a.id) : pathTo(a.id).slice(1).map(segmentText).join(' › ');
      return `<tr><td>${escXml(describeForm(a.style.form).label)}</td><td>${escXml(through)}</td><td>${sets.join('<br>')}</td></tr>`;
    }).join('');
    const verdict = [
      [shown, shown ? 'the Kind style shows this kind' : 'the Kind style hides this kind'],
      [!hidden, hidden ? 'hidden in this view' : 'not hidden one by one'],
      [filter.ok, filter.why],
    ].map(([ok, why]) => `<span class="${ok ? 'yes' : 'no'}">${ok ? '✓' : '✗'}</span> ${escXml(why)}`).join(' &nbsp; ');
    const b = look.box;
    $('view-body').innerHTML = `<p style="margin:0 0 6px"><b>${drawn ? 'Drawn' : 'Not drawn'}</b> in ${escXml(view.name)}: ${verdict}</p>
      <table class="tbl"><thead><tr><th>Style</th><th>Reaches the box through</th><th>Sets</th></tr></thead><tbody>${rows || '<tr><td colspan="3" class="muted">No style sets anything on this box.</td></tr>'}</tbody></table>
      <p class="muted" style="margin:0">So the box is ${escXml(b.shape)}, filled ${escXml(b.fill)}, outlined ${escXml(b.stroke)} at ${b.strokeWidth}, ${escXml(b.dash)}, with ${look.lines.length ? `the text ${look.lines.map(l => `“${escXml(l.text)}”`).join(', ')}` : 'no text'}.</p>`;
  } finally {
    styles = keep;
  }
}

// ---- Wiring ----

document.addEventListener('change', e => {
  const k = e.target.dataset.fig;
  if (k === 'anatomy-id') { anatomy.id = e.target.value; drawAnatomy(); }
  if (k === 'view-id') { viewFig.view = e.target.value; drawView(); }
  if (k === 'view-obj') { viewFig.obj = e.target.value; drawView(); }
});
document.addEventListener('click', e => {
  const b = e.target.closest('button[data-fig]');
  if (!b) return;
  const { fig, value } = b.dataset;
  if (fig === 'anatomy-mode') { anatomy.mode = value; drawAnatomy(); }
  if (fig === 'forms-several') { forms.onlySeveral = value === 'several'; drawForms(); }
  if (fig === 'override') { override.on = value === 'on'; drawOverride(); }
});

function drawFigures() {
  for (const [name, draw] of [['anatomy', drawAnatomy], ['forms', drawForms], ['override', drawOverride], ['view', drawView]]) {
    try { draw(); }
    catch (err) { $(`${name}-body`).innerHTML = `<p class="no">This figure couldn’t be drawn: ${escXml(err.message)}</p>`; }
  }
}
drawFigures();
