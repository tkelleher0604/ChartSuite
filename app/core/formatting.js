// Formatting commands, independent of selection controls, the canvas and application state.
// A plan contains note/update commands only. Build each plan from the transaction's current
// rows, then apply it, so a second setting in the same change preserves the first one.
const Formatting = (() => {
const TEXT_LABELS = new Set(['Font', 'Size', 'Bold', 'Italic', 'Underline', 'Strike', 'Color', 'Text Gradient', 'Text Outline', 'Align', 'Spacing', 'Format']);
const note = (label, pattern, value, options = {}) => ({ type: 'note', label, pattern, value, ...options });
const update = (id, values) => ({ type: 'update', id, values });
const isFooter = mark => ['footer', 'number', 'day'].includes(mark.role);
const fieldEdge = (records, item) => !item.free && !item.blank ? records[item.id]?.edge ?? null : null;
const givenField = (item, label) => {
  const n = item.settings?.[label]?.note;
  return n && !Tree.idsIn(n.pattern).size && (n.param || (!Notes.isOption(n.pattern) && n.pattern.args?.length === 1)) ? n : null;
};

// An object's own records include nested entries, not just fields directly below its root.
const inMark = (records, mark) => Tree.within(records, mark.record);

// A failing check is a chart-wide style. A stale view override must be removed with it.
function atOutput(notes, view, pattern, label, value) {
  if (!notes.failing(pattern)) return [note(label, pattern, value, { view })];
  const local = notes.notes(label).some(n => n.view === view && Tree.key(n.pattern) === Tree.key(pattern));
  return [...(local ? [note(label, pattern, undefined, { view })] : []), note(label, pattern, value)];
}

// Whole-table text formatting replaces only the selected property on cells. Other overrides,
// cell contents, spans and row properties remain intact.
function wholeTable(table, label) {
  return { ...table, rows: table.rows.map(row => ({ ...row, cells: row.cells.map(cell => {
    if (cell.format?.[label] === undefined) return cell;
    const { [label]: _, ...format } = cell.format, { format: previous, ...rest } = cell;
    return Object.keys(format).length ? { ...rest, format } : rest;
  }) })) };
}

function footer(current, format) {
  const { format: _, ...rest } = current;
  return note('Footer', { kind: 'View' }, Object.keys(format).length ? { ...rest, format } : rest);
}

// Group text formatting also reaches independently styled fields. Entry styles update their
// existing group overrides; object styles add field overrides only where a field has its own style.
function everyField({ records, notes, view, scope, scopeMarks = [] }, label, value) {
  if (scope.swatch?.kind === 'text') {
    const edge = scope.outputs[0].args?.[0]?.edge;
    if (edge === undefined) return [];
    const over = new Map(notes.notes(label).filter(n => n.view === view && n.param && Tree.same(n.param, edge)).map(n => [Tree.key(n.pattern), n.pattern]));
    for (const mark of scopeMarks) for (const item of mark.texts ?? []) {
      const n = item.settings?.[label]?.note;
      if (n && Tree.same(fieldEdge(records, item) ?? '', edge) && n.view === view && !Tree.idsIn(n.pattern).size && !givenField(item, label)) over.set(Tree.key(n.pattern), n.pattern);
    }
    return [...over.values()].map(pattern => note(label, pattern, value, { view, param: edge }));
  }
  const edges = new Map();
  for (const mark of scopeMarks) for (const item of mark.texts ?? []) {
    const edge = fieldEdge(records, item);
    if (edge && givenField(item, label)) edges.set(Tree.norm(edge), edge);
  }
  return scope.outputs.flatMap(pattern => [...edges.values()].map(edge => note(label, pattern, value, { view, param: edge })));
}

// Formatting a single object clears that property's instance-only field overrides. Shared field
// styles and notes in other views keep their meaning; unrelated properties are never cleared.
function ownFields({ records, notes, view }, mark, label) {
  const commands = [], tree = Tree.treeOf(records, mark.record);
  for (const id of inMark(records, mark)) if (id !== mark.record) {
    const field = Tree.treeOf(records, id), resolved = field && notes.resolve(label, field, view);
    if (resolved?.note.view === view && Tree.idsIn(resolved.note.pattern).size) commands.push(note(label, resolved.note.pattern, undefined, { view, param: resolved.note.param }));
  }
  for (const [edge, resolved] of Object.entries(notes.fields(tree, view, label))) {
    if (resolved.note.view === view && Tree.idsIn(resolved.note.pattern).size) commands.push(note(label, resolved.note.pattern, undefined, { view, param: edge }));
  }
  return commands;
}

// `marks` is the explicit selection; `scopeMarks` is the complete set reached by a shared scope.
// `rows` holds current transaction rows by shape ID. `cells` uses source row/column coordinates.
// Design-part and rich-text edits are routed by the UI before this general formatting plan.
function plan(context, label, value) {
  const { records, notes, view, scope, marks = [], scopeMarks = [], rows = new Map(), cells } = context;
  if (!scope) return [];
  if (scope.root) return [note(label, { id: view, kind: 'View' }, value)];
  if (cells) {
    const mark = marks[0], table = rows.get(mark.id).table;
    return [update(mark.id, { table: { ...table, rows: table.rows.map((row, r) => ({ ...row, cells: row.cells.map((cell, c) => !cells.some(at => at.r === r && at.c === c) ? cell : { ...cell, format: { ...cell.format, [label]: value } }) })) } })];
  }
  if (scope.rest && TEXT_LABELS.has(label)) return [note(label, { id: view, kind: 'View' }, value)];
  const text = TEXT_LABELS.has(label) && label !== 'Format';
  if (scope.has && text) {
    const edge = label === 'Size' || label === 'Font' ? scope.outputs[0].args?.[0]?.edge : null;
    if (edge) return [note(label, scope.outputs[0], value, { view, param: edge })];
    return scopeMarks.flatMap(mark => (mark.texts ?? []).flatMap(item => {
      const e = fieldEdge(records, item) ?? item.blank?.edge;
      return e ? [note(label, scope.outputs[0], value, { view, param: e })] : [];
    }));
  }
  if (scope.outputs) return [
    ...scope.outputs.flatMap(pattern => atOutput(notes, view, pattern, label, value)),
    ...(text ? everyField(context, label, value) : []),
  ];
  return marks.flatMap(mark => {
    if (mark.type === 'box' || mark.type === 'line') return [
      note(label, Tree.treeOf(records, mark.record), value, { view }),
      ...(text ? ownFields(context, mark, label) : []),
    ];
    if (isFooter(mark)) {
      const current = context.footer ?? notes.resolve('Footer', { kind: 'View' })?.value ?? {};
      return [footer(current, { ...current.format, [label]: value })];
    }
    if (mark.type !== 'shape') return [];
    const row = rows.get(mark.id);
    return [update(mark.id, { format: { ...row?.format, [label]: value }, ...(mark.geometry === 'table' && TEXT_LABELS.has(label) && { table: wholeTable(row.table, label) }) })];
  });
}

function apply(tx, commands) {
  for (const c of commands) {
    if (c.type === 'note') tx.note(c.label, c.pattern, c.value, { ...(c.view !== undefined && { view: c.view }), ...(c.param !== undefined && { param: c.param }) });
    else tx.update(c.id, c.values);
  }
}
return { TEXT_LABELS, isFooter, fieldEdge, inMark, footer, everyField, ownFields, plan, apply };
})();
