// Relating two things: the panel view behind dragging between two boxes on the chart, and behind the
// panel's Add › Relation. The header shows the two sides. The rows list every kind of relation in the
// schema (every parameterization of a relation in the state) that the two sides are inputs to: one row
// for each way of placing the sides among the relation's parameters, with its output if it's recorded
// and a way to record it if not. A kind of relation that doesn't exist yet can be defined at the bottom.
//
// A side can be an object, which fills a parameter through whichever of its records matches the
// parameter's location (itself, or say its Entity Type: Limited Liability Company), or a record that's a
// location itself, which fills only parameters located exactly there.

const relate = {
  pair: '',      // the hash the state below belongs to
  rows: [],      // the rows as last drawn, for actions to look up by key
  extra: {},     // per row, the location picked for each parameter beyond the two sides
  error: null,   // { key, text }: why a row's relation, or the new kind (key 'new'), couldn't be added
  form: null,    // the new kind of relation: { roleA, roleB, locA, locB, type, output }
};

const freshRelateForm = (a, b) => ({ roleA: '', roleB: '', locA: a, locB: b, type: 'tag', output: '' });

// Every parameterization of a relation in the state, with its parameters in one record's order.
function relationKinds() {
  const kinds = new Map();
  for (const [id, r] of Object.entries(records)) {
    if (!isRelation(r)) continue;
    const param = parameterization(records, id);
    if (!kinds.has(param)) kinds.set(param, {
      param, type: typeOf(r), datatype: r.field, outputs: [],
      args: r.args.map(a => ({ edge: a.edge, spec: specKey(records, a.at), kind: records[objectOf(a.at)].kind, sample: a.at })),
    });
    const k = kinds.get(param);
    if (isChoice(r) && !k.outputs.some(o => same(o, r.choice))) k.outputs.push(r.choice);
  }
  return [...kinds.values()];
}

// The locations through which a side fills a parameter located at `spec`.
function sideLocations(side, spec) {
  if (specKey(records, side) === spec) return [side];
  return isObject(records[side]) ? recordsUnder(side).filter(id => specKey(records, id) === spec) : [];
}

// Whether a side is an input to a parameter: its object is of the parameter's leaf kind, and if the side
// is a record below its object, it's at the parameter's location exactly.
const isInputTo = (side, arg) => same(records[objectOf(side)].kind, arg.kind) && (isObject(records[side]) || specKey(records, side) === arg.spec);

// What a parameter's location adds below its object, like "Entity Type: Limited Liability Company".
const pathBelow = sampleAt => pathTo(sampleAt).slice(1).map(segmentText).join(' › ');

function relateRows(a, b) {
  const rows = [];
  relationKinds().forEach((k, n) => k.args.forEach((pa, i) => k.args.forEach((pb, j) => {
    if (i === j || !isInputTo(a, pa) || !isInputTo(b, pb)) return;
    // With the same edge and location on both parameters, the two orders are the same relation.
    if (j < i && same(pa.edge, pb.edge) && pa.spec === pb.spec) return;
    const locA = sideLocations(a, pa.spec)[0], locB = sideLocations(b, pb.spec)[0];
    const key = `${n}:${i}:${j}`;
    const row = { key, kind: k, i, j, locA, locB, existing: [] };
    if (!locA || !locB) {
      const side = !locA ? a : b, arg = !locA ? pa : pb;
      // Rows wanting the same roles and missing something on the same side are shown as one.
      const twin = rows.find(r => r.needs && same(r.kind.args[r.i].edge, pa.edge) && same(r.kind.args[r.j].edge, pb.edge) && r.needSide === side);
      if (twin) {
        twin.needPaths.push(pathBelow(arg.sample));
        twin.needs = `Needs ${twin.needPaths.join(' or ')} on ${segmentText(objectOf(side))}`;
        return;
      }
      Object.assign(row, { needSide: side, needPaths: [pathBelow(arg.sample)] });
      row.needs = `Needs ${pathBelow(arg.sample)} on ${segmentText(objectOf(side))}`;
      return rows.push(row);
    }
    // Recorded relations of this kind with the sides at these parameters, and their other arguments.
    for (const [id, r] of Object.entries(records)) {
      if (!isRelation(r) || parameterization(records, id) !== k.param) continue;
      const ia = r.args.findIndex(x => same(x.edge, pa.edge) && x.at === locA);
      const ib = r.args.findIndex((x, m) => m !== ia && same(x.edge, pb.edge) && x.at === locB);
      if (ia >= 0 && ib >= 0) row.existing.push({ id, rest: r.args.filter((x, m) => m !== ia && m !== ib) });
    }
    rows.push(row);
  })));
  const rank = r => r.needs ? 2 : r.existing.length ? 0 : 1;
  return rows.sort((p, q) => rank(p) - rank(q) || byLabel(p.kind.args.map(x => x.edge).join(' '), q.kind.args.map(x => x.edge).join(' ')));
}

// A side's role in a row: its parameter's edge, and the record it fills it through if not the side itself.
function roleCell(edge, side, loc) {
  const via = loc && loc !== side ? `<span class="relate-via">via ${esc(pathTo(loc).slice(pathTo(side).length).map(segmentText).join(' › '))}</span>` : '';
  return `<div class="relate-c"><span class="relate-role">${esc(edge)}</span>${via}</div>`;
}

// The parameters beyond the two sides: for a recorded relation, its other arguments; otherwise pickers.
function extraArgs(row, recorded) {
  if (recorded) return recorded.rest.length ? `<div class="relate-extras">${recorded.rest.map(x =>
    `<span class="relate-extra"><span class="relate-role">${esc(x.edge)}</span> ${locationHtml(x.at)}</span>`).join('')}</div>` : '';
  const k = row.kind;
  const rest = k.args.map((arg, n) => ({ arg, n })).filter(({ n }) => n !== row.i && n !== row.j);
  if (!rest.length) return '';
  const parts = rest.map(({ arg, n }) => {
    const picked = relate.extra[row.key]?.[n];
    const key = `relx:${row.key}:${n}`;
    const open = ui.menu === key;
    const choices = open ? Object.keys(records).filter(x => specKey(records, x) === arg.spec)
      .sort((p, q) => byLabel(locationText(p), locationText(q)))
      .map(x => `<button class="menu-item" role="menuitemradio" aria-checked="${x === picked}" data-action="relate-extra" data-key="${row.key}" data-n="${n}" data-value="${x}">
        <span class="menu-text">${esc(locationText(x))}</span>${x === picked ? icon('check') : ''}</button>`).join('') : '';
    return `<span class="relate-extra"><span class="relate-role">${esc(arg.edge)}</span>
      <span class="menu-anchor"><button class="select" data-action="menu" data-menu="${key}" aria-haspopup="menu" aria-expanded="${open}">
        <span class="select-text">${picked ? esc(locationText(picked)) : 'Choose'}</span>${icon('chevron-down')}</button>
      ${open ? `<div class="pop menu menu-left" role="menu">${choices || '<div class="menu-note" style="padding:6px 10px">Nothing fits here yet</div>'}</div>` : ''}</span></span>`;
  }).join('');
  return `<div class="relate-extras">${parts}</div>`;
}

// The output cell of a row with nothing recorded: an empty checkbox, a value box, or an option menu.
function newOutput(row) {
  const k = row.kind;
  if (k.type === 'tag') return checkbox(null, `data-action="relate-add" data-key="${row.key}"`);
  if (k.type === 'field')
    return `<input class="input rel-input" data-relate-value="${row.key}" placeholder="${k.datatype === 'number' ? 'Amount' : k.datatype === 'date' ? 'Date' : 'Value'}" autocomplete="off" spellcheck="false">`;
  const key = `relopt:${row.key}`;
  const open = ui.menu === key;
  const items = open ? k.outputs.slice().sort(byLabel).map(o => `<button class="menu-item" role="menuitem" data-action="relate-add" data-key="${row.key}" data-value="${esc(o)}"><span class="menu-text">${esc(o)}</span></button>`).join('')
    + `<div class="menu-sep"></div><input class="input menu-input" data-relate-option="${row.key}" placeholder="New option" autocomplete="off" spellcheck="false">` : '';
  return `<span class="menu-anchor"><button class="select" data-action="menu" data-menu="${key}" aria-haspopup="menu" aria-expanded="${open}"><span class="select-text relate-placeholder">Option</span>${icon('chevron-down')}</button>
    ${open ? `<div class="pop menu" role="menu">${items}</div>` : ''}</span>`;
}

function relateRow(row, a, b) {
  const k = row.kind;
  const roles = roleCell(k.args[row.i].edge, a, row.locA) + roleCell(k.args[row.j].edge, b, row.locB);
  const error = relate.error?.key === row.key ? `<div class="relate-error">${esc(relate.error.text)}</div>` : '';
  if (row.needs)
    return `<div class="relate-row is-unavailable">${roles}<div class="relate-c relate-needs" title="${esc(row.needs)}">${esc(row.needs)}</div></div>`;
  const recorded = row.existing.map(ex => `<div class="relate-row">${roles}
      <div class="relate-out">${relationOutput(ex.id, relationLabel(records[ex.id]))}<span class="relate-acts">${openRelation(ex.id)}</span></div>
      ${extraArgs(row, ex)}</div>`).join('');
  // A two-parameter relation is recorded at most once per pair; with more parameters, more can be added,
  // on a line that's just the pickers for the other parameters, beside the output.
  if (row.existing.length && k.args.length <= 2) return recorded;
  const blank = row.existing.length
    ? `<div class="relate-row is-more"><div class="relate-c relate-span">${extraArgs(row).replace('relate-extras', 'relate-extras is-inline')}</div>
        <div class="relate-out">${newOutput(row)}</div>${error}</div>`
    : `<div class="relate-row">${roles}<div class="relate-out">${newOutput(row)}</div>${extraArgs(row)}${error}</div>`;
  return recorded + blank;
}

// The other side's picker, shown until it's chosen: any object, grouped by kind.
function sidePicker(a) {
  const open = ui.menu === 'relate-b';
  const items = open ? kindsInState().map(kind => {
    const ids = objectsOfKind(kind).filter(id => id !== objectOf(a));
    return ids.length ? `<div class="menu-head">${esc(plural(kind))}</div>` + ids.map(id =>
      `<button class="menu-item" role="menuitem" data-action="relate-pick-b" data-id="${id}"><span class="menu-text">${esc(objectName(id))}</span></button>`).join('') : '';
  }).join('') : '';
  return `<span class="menu-anchor"><button class="btn" data-action="menu" data-menu="relate-b" aria-haspopup="menu" aria-expanded="${open}">Choose the other side${icon('chevron-down')}</button>
    ${open ? `<div class="pop menu menu-left" role="menu">${items}</div>` : ''}</span>`;
}

function sideHead(side) {
  const obj = objectOf(side);
  const below = side === obj ? '' : ` › ${pathTo(side).slice(1).map(segmentText).join(' › ')}`;
  return `<div class="relate-side"><a class="relate-side-name" href="#${side}">${esc(objectName(obj))}</a><span class="relate-side-kind">${esc(records[obj].kind + below)}</span></div>`;
}

// The locations a side can put a new kind of relation at: the side, or for an object, its choices and tags.
const formLocations = side => isObject(records[side]) ? recordsUnder(side).filter(id => !isField(records[id])) : [side];

function newKindForm(a, b) {
  const f = relate.form;
  const where = (field, side, current) => {
    const locs = formLocations(side);
    if (locs.length < 2) return '<span></span>';
    return `<select class="input relate-select" data-relate-field="${field}" title="Where the relation sits">${locs.map(id =>
      `<option value="${id}"${id === current ? ' selected' : ''}>${esc(id === side ? `At ${objectName(objectOf(side))}` : `Under ${pathTo(id).slice(1).map(segmentText).join(' › ')}`)}</option>`).join('')}</select>`;
  };
  const edges = [...new Set(Object.values(records).filter(isRelation).flatMap(r => r.args.map(x => x.edge)))].sort(byLabel);
  const types = [['tag', 'Tag'], ['field', 'Field'], ['choice', 'Choice']].map(([v, name]) =>
    `<button data-action="relate-type" data-value="${v}" aria-pressed="${f.type === v}">${name}</button>`).join('');
  const output = f.type === 'tag' ? `<span class="relate-hint">Recorded as attested</span>`
    : `<input class="input" data-relate-field="output" value="${esc(f.output)}" placeholder="${f.type === 'field' ? 'Value, like 25%' : 'Option, like Co-Investor'}" autocomplete="off" spellcheck="false">`;
  const error = relate.error?.key === 'new' ? `<div class="relate-error">${esc(relate.error.text)}</div>` : '';
  return `<div class="relate-new">
    <div class="relate-grid">
      <input class="input" data-relate-field="roleA" value="${esc(f.roleA)}" placeholder="Role, like Owner" list="relate-edges" autocomplete="off" spellcheck="false">
      <input class="input" data-relate-field="roleB" value="${esc(f.roleB)}" placeholder="Role, like Holding" list="relate-edges" autocomplete="off" spellcheck="false">
      ${where('locA', a, f.locA)}${where('locB', b, f.locB)}
    </div>
    <div class="relate-new-foot"><span class="seg" role="group" aria-label="Output">${types}</span>${output}
      <button class="btn btn-primary" data-action="relate-new">${icon('plus')}Add</button></div>${error}
    <datalist id="relate-edges">${edges.map(x => `<option value="${esc(x)}">`).join('')}</datalist></div>`;
}

function relateView({ a, b }) {
  const pair = `${a}:${b ?? ''}`;
  if (relate.pair !== pair) Object.assign(relate, { pair, extra: {}, error: null, form: freshRelateForm(a, b) });
  const head = `<div class="panel-head relate-head">
    <div class="title-row"><div class="title-block"><h1>Relate</h1><div class="subtitle">${b ? 'Every kind of relation these two can be in' : 'Choose what to relate this to'}</div></div>
      <div class="head-actions"><button class="btn${b ? ' btn-primary' : ''}" data-action="relate-done">${b ? 'Done' : 'Cancel'}</button></div></div>
    <div class="relate-sides">${sideHead(a)}${b ? `${sideHead(b)}<div class="relate-colhead">Recorded</div>`
      : `<div class="relate-side is-picker">${sidePicker(a)}<span class="relate-side-kind">${panelOptions.engaged ? 'or click a box on the chart' : 'any object'}</span></div>`}</div>
  </div>`;
  if (!b) return [head, ''];
  relate.rows = relateRows(a, b);
  const possible = relate.rows.filter(r => !r.needs);
  const unavailable = relate.rows.filter(r => r.needs);
  const section = (title, html) => html ? `<div class="relate-section">${title}</div>${html}` : '';
  const body = (possible.length ? section('Kinds of relation they can be in', possible.map(r => relateRow(r, a, b)).join(''))
      : '<div class="empty">No kind of relation in the schema relates these two yet. Define one below.</div>')
    + section('Missing something first', unavailable.map(r => relateRow(r, a, b)).join(''))
    + section('New kind of relation', newKindForm(a, b));
  return [head, `<div class="relate-body">${body}</div>`];
}

// ---- Changes ----

// Adds the row's relation with the given output (a tag is attested; a field's value is typed text).
function addFromRow(row, output) {
  const k = row.kind;
  const args = k.args.map((arg, n) => ({ edge: arg.edge, at: n === row.i ? row.locA : n === row.j ? row.locB : relate.extra[row.key]?.[n] }));
  const missing = args.find(x => !x.at);
  if (missing) return `Choose the ${missing.edge} first.`;
  let rec;
  if (k.type === 'tag') rec = { args, tag: true };
  else if (k.type === 'choice') rec = clean(output) ? { args, choice: k.outputs.find(o => same(o, output)) ?? clean(output) } : null;
  else {
    const raw = clean(output);
    if (!raw) return 'Give it a value.';
    const datatype = k.datatype ?? classify(raw);
    const value = parseValue(datatype, raw);
    if (value === undefined) return `${k.args[row.j].edge} takes ${asPhrase(datatype)} here.`;
    rec = { args, field: datatype, value };
  }
  if (!rec) return 'Choose or type an option.';
  const id = newId();
  const error = commit({ ...records, [id]: rec });
  if (!error) { ensureRelationStyle(id); relate.extra[row.key] = {}; }
  return error;
}

function addNewKind(a, b) {
  const f = relate.form;
  const roleA = clean(f.roleA), roleB = clean(f.roleB);
  if (!roleA || !roleB) return 'Give each side a role.';
  const args = [{ edge: roleA, at: f.locA ?? a }, { edge: roleB, at: f.locB ?? b }];
  let rec;
  if (f.type === 'tag') rec = { args, tag: true };
  else if (f.type === 'choice') {
    if (!clean(f.output)) return 'Give it an option.';
    rec = { args, choice: clean(f.output) };
  } else {
    const raw = clean(f.output);
    if (!raw) return 'Give it a value.';
    const datatype = classify(raw);
    rec = { args, field: datatype, value: parseValue(datatype, raw) };
  }
  const id = newId();
  const error = commit({ ...records, [id]: rec });
  if (!error) { ensureRelationStyle(id); relate.form = freshRelateForm(a, b); }
  return error;
}

const rowByKey = key => relate.rows.find(r => r.key === key);

Object.assign(actions, {
  'open-relate': d => { location.hash = `relate:${d.id}`; },
  'relate-pick-b': d => { location.hash = `relate:${currentView().relate.a}:${d.id}`; },
  'relate-done': d => { const r = currentView().relate; if (r) location.hash = r.a; },
  'relate-add': d => {
    const row = rowByKey(d.key);
    const error = row && addFromRow(row, d.value ?? true);
    relate.error = error ? { key: d.key, text: error } : null;
  },
  'relate-extra': d => {
    relate.extra = { ...relate.extra, [d.key]: { ...relate.extra[d.key], [d.n]: d.value } };
  },
  'relate-type': d => { relate.form.type = d.value; relate.error = null; },
  'relate-new': () => {
    const { a, b } = currentView().relate;
    const error = addNewKind(a, b);
    relate.error = error ? { key: 'new', text: error } : null;
  },
});

document.addEventListener('input', e => {
  const field = e.target.dataset.relateField;
  if (field && relate.form) relate.form[field] = e.target.value;
});
document.addEventListener('change', e => {
  const field = e.target.dataset.relateField;
  if (field && relate.form && e.target.tagName === 'SELECT') relate.form[field] = e.target.value;
});

document.addEventListener('keydown', e => {
  const t = e.target;
  if (e.key !== 'Enter') return;
  const key = t.dataset.relateValue ?? t.dataset.relateOption;
  if (key) {
    e.preventDefault();
    const row = rowByKey(key);
    const error = row && addFromRow(row, t.value);
    relate.error = error ? { key, text: error } : null;
    ui.menu = null;
    render();
  } else if (t.dataset.relateField && t.tagName === 'INPUT') {
    e.preventDefault();
    const { a, b } = currentView().relate;
    const error = addNewKind(a, b);
    relate.error = error ? { key: 'new', text: error } : null;
    render();
  }
});
