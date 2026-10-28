// The format bar: one bar over the chart, in place of the ribbon. Insert adds a box of one of the chart's
// kinds, or a shape, a text box, a line or the key. The scope says what a change applies to, in two parts: the
// selection, as in PowerPoint ("This box", "These 3 boxes"), and all like it ("All Funds (6)"), the narrowest
// group that reaches it, whose ▾ offers every group that does: the Styles rows, as Styles lists and calls them,
// and the selection's own groups, its kind and each of its options and tags ("Jurisdiction: Delaware (13)"),
// each with its reach. While a group is chosen, or pointed at, the chart cues it: what it reaches lit, the
// rest dulled. Ctrl+Shift+A goes from one part to the other. A change writes format notes: for the selection,
// at each record's own tree in the view; for a group, at each of its outputs' patterns in the view, so a group
// of the selection's own becomes a Styles row and a row of the Key. A free shape keeps its formats in its row.
// Selecting a legend row engages its group, so the legend is the other way to restyle. A choice pointed at,
// Tidy's too, is drawn on the chart as it would be, PowerPoint's live preview, until the pointer leaves it.
// The rest is PowerPoint's Home tab: the font, found as its name is typed, each in its own face; the size, typed or
// picked, Grow and Shrink; bold, italic, underline, strikethrough, color; the paragraph's alignment, position and
// spacing; the shape, its rounding and shadow; fill and transparency; outline, its weight, dashes, arrows and route;
// each palette's eyedropper; arrange; the format painter; and Clear formatting. Its commands are the window's
// actions, so Find reaches each and ? lists its keys.
const FormatBar = (() => {
const { h, render } = preact;
const html = htm.bind(h);
const { signal, effect } = preactSignals;
const { useState, useRef, useLayoutEffect } = preactHooks;

// Sizes and weights are shown and chosen as the slide has them: a size the page's, drawn smaller by its scale;
// a weight the slide's own, one of PowerPoint's.
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
const TEXT_LABELS = new Set(['Font', 'Size', 'Bold', 'Italic', 'Underline', 'Strike', 'Color', 'Align', 'Spacing', 'Format']);
let current = null; // { canvas, scopes, scope, marks }

// ---- What the selection is, and what reaches it ----

// A group's key, the same for the same outputs however it's come by: a Styles row, or one of a record's own groups.
const keyOf = ps => JSON.stringify(ps.map(p => Tree.key(p)).sort());
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
  const styled = (o, style) => ({ ...o, style, marks: marksOf(sc, { style, outputs: o.outputs }) });
  const rowKey = keys.length === 1 ? Canvas.keyParts(keys[0])[1] : null;
  if (rowKey) {
    const r = marks[0].rows?.find(x => x.key === rowKey), w = r && whole(r.style, r.outputs);
    if (r) return { marks, row: r, scopes: [styled({ key: 'row', caption: w.caption ?? r.caption.text, outputs: w.outputs }, r.style)] };
  }
  const bound = marks.filter(m => m.type === 'box' || m.type === 'line');
  if (marks.some(m => m.type === 'frame')) {
    const f = marks.find(m => m.type === 'frame'), style = Tree.key(Tree.bare(f.output));
    return { marks, scopes: [styled({ key: 'frame', caption: f.caption.text, outputs: whole(style, f.outputs).outputs }, style)] };
  }
  const own = { key: 'own', label: these(marks), own: true };
  if (!bound.length || bound.length < marks.length) return { marks, group, scopes: [own] };
  // Then every group that reaches the selection. First the Styles rows, in Styles' order: each with an output that a
  // record in or at a selected mark fits.
  const reached = new Set();
  for (const m of bound) for (const r of Scene.reach(App.shown.peek(), App.chart.peek(), sc.view, sc, m.id, App.state.peek()))
    for (const g of groups) if (g.style === r.style && g.outputs.some(p => Tree.narrower(r.output, p))) reached.add(g);
  const rows = groups.filter(g => reached.has(g)).map(g => ({ ...g, key: keyOf(g.outputs), marks: marksOf(sc, g) }));
  // Then the selection's own groups, those every selected mark is in (see kinOf), but a Styles row already offered as
  // it is: its kind or relation first, then its options and tags in the order its entries have.
  const st = App.state.peek(), kin = kinOf(sc), have = new Set(rows.map(r => r.key));
  const mine = bound.map(m => new Set(inMark(st, m).map(id => kin.of.get(id)).filter(Boolean)));
  const ownGroups = [...mine[0]].filter(k => mine.every(s => s.has(k)) && !have.has(keyOf([kin.by.get(k).pattern])))
    .map(k => kin.by.get(k)).sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))
    .map(g => ({ key: keyOf([g.pattern]), caption: g.name, outputs: [g.pattern], marks: g.marks, kin: true }));
  // The group "all like it" names when none is chosen, of those that reach all of the selection and more than it:
  // the narrowest Styles row that styles boxes or lines (not Names, which styles every name), as the view already
  // tells such marks apart; or else the narrowest of its options (Jurisdiction: Cayman Islands); or else its kind or
  // relation; or else any of them, its tags last.
  const ids = new Set(bound.map(m => m.merged ?? m.id)), all = s => [...ids].every(id => s.marks.has(id));
  const like = [...rows, ...ownGroups].filter(all), wider = like.filter(s => s.marks.size > ids.size);
  const least = xs => xs.reduce((a, s) => !a || s.marks.size < a.marks.size ? s : a, null);
  const entry = s => s.kin && s.outputs[0].args?.length === 1, choice = s => entry(s) && 'choice' in s.outputs[0].out, kind = s => s.kin && !entry(s);
  const narrowest = least(wider.filter(s => !s.kin && s.swatch?.kind !== 'text')) ?? least(wider.filter(choice)) ?? least(wider.filter(kind)) ?? least(wider) ?? least(like);
  return { marks, group, narrowest, scopes: [own, ...rows, ...ownGroups] };
}
// The records a box or line draws, its own and those in it at any depth.
function inMark(st, m) {
  const { entries } = Tree.index(st), out = [], todo = [m.record];
  while (todo.length) { const id = todo.pop(); out.push(id); todo.push(...entries.get(id) ?? []); }
  return out;
}
// The groups of a scene's records, each a pattern with the marks it reaches: for each record of a kind, an object
// (its box) or a relation (its line), and for each option or tag of an entry, at any depth, the record's tree with
// every object in it made any object, and every option or tag but its own taken away: Entity, Ownership,
// Jurisdiction: Delaware, Not Good Standing. Each is named by what it is, an option with its entry's name, never by
// a Caption, which names a Styles row: so a group of one's own is never mistaken for the row it's part of. Its kind
// or relation first, then its options, then its tags, each in their entries' order.
// → { by: key → { pattern, name, rank, marks }, of: record id → key }.
const kins = new WeakMap();
function kinOf(sc) {
  let k = kins.get(sc);
  if (k) return k;
  const st = App.state.peek(), N = App.notes.peek(), by = new Map(), of = new Map();
  const markOf = id => { for (let x = id; x && st[x]; x = st[x].at) { const m = sc.byId.get(x); if (m && (m.type === 'box' || m.type === 'line')) return m; } return null; };
  const general = (id, root) => {
    const r = st[id];
    if (!r) return null;
    if (Tree.isObject(r)) return root ? { kind: r.kind } : {};
    const args = Tree.argsOf(r).map(a => ({ edge: a.edge, loc: general(a.at, false) }));
    if (args.some(a => !a.loc)) return null;
    const out = root && (Tree.isChoice(r) ? { choice: r.choice } : Tree.isTag(r) ? { tag: r.tag } : null);
    return { ...(out && { out }), args };
  };
  for (const id in st) {
    const r = st[id];
    if (Tree.isView(r) || (!Tree.isObject(r) && !r.args && !Tree.isChoice(r) && !Tree.isTag(r))) continue;
    const m = markOf(id), p = m && !m.revealed && general(id, true);
    if (!p) continue;
    const key = Tree.key(p);
    of.set(id, key);
    let g = by.get(key);
    if (!g) {
      const choice = !r.args && Tree.isChoice(r), order = Math.min(1e3, N.order(Tree.treeOf(st, id)) ?? 1e3) / 1e4;
      by.set(key, g = { pattern: p, name: !p.args ? p.kind : choice ? `${N.name(Tree.bare(p))}: ${r.choice}` : r.args ? N.name(Tree.bare(p)) : Scene.outputName(N, p),
        rank: !p.args || r.args ? 0 : choice ? 1 + order : 2 + order, marks: new Set() });
    }
    g.marks.add(m.merged ?? m.id);
  }
  kins.set(sc, k = { by, of });
  return k;
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
  return `${s.caption} (${(s.marks ?? marksOf(c.scene(), s)).size})`;
}
// The scope a change goes to: the group chosen (by its key), or else the selection itself.
const chosen = signal(null);
const scopeOf = (scopes, key = chosen.peek()) => scopes.find(s => s.key === key) ?? scopes[0];
// The marks a group reaches that keep their own value of a property, entered for them alone in the view,
// which a change for the group leaves as it is (entered wins): each with the notes that decide it.
function keeping(c, scope, labels) {
  const sc = c.scene(), N = App.notes.peek(), out = [];
  if (!scope?.outputs) return out;
  for (const id of scope.marks ?? marksOf(sc, scope)) {
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
// the view, and a free shape's own format; for a style, a note at each of its outputs in the view. With a field of a
// box selected (a text in it, clicked), a text property is that field's, as a text selected in a PowerPoint shape is
// formatted: at the field's own pattern, at the scope (the canvas's styleField).
function write(tx, c, label, value) {
  const { marks, scopes } = scopesOf(c), scope = scopeOf(scopes);
  if (!scope) return;
  const f = TEXT_LABELS.has(label) && label !== 'Format' ? fieldOf(c) : null;
  if (f) return c.styleField(tx, f, label, value, scope.outputs ? { outputs: scope.outputs } : { own: true });
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
  const text = current.field?.it ?? m.texts?.[0] ?? m.caption;
  if (TEXT_LABELS.has(label) && text) return text.look?.[label] ?? text.settings?.[label]?.value;
  return m.settings?.[label]?.value ?? m.look?.[label];
}
// The field selected in the one box selected, if any (the canvas's field()).
const fieldOf = c => { const f = c.field?.(), ks = c.keys(); return f?.it && ks.length === 1 && Canvas.keyParts(ks[0])[0] === f.m.id ? f : null; };

// ---- The bar ----

// Its glyphs: Lucide's icons (Shell.icon), and a color's bar under the paint bucket, the pen and the A, as
// PowerPoint draws them; the A's own baseline is its bar.
const bar = c => html`<i style=${`background:${!c || c === 'none' ? 'transparent' : c}`} />`;
const glyph = {
  fill: c => html`<span class="well">${Shell.icon('fill')}${bar(c)}</span>`,
  outline: c => html`<span class="well">${Shell.icon('outline')}${bar(c)}</span>`,
  color: c => html`<span class="well a"><svg class="i lu" viewBox="0 0 24 24" aria-hidden="true">${(typeof lucide === 'undefined' ? [] : lucide.Baseline[2].slice(1)).map(([t, a]) => h(t, a))}<path class="edge" d="M2.5 21.5h19" /><path d="M3 21.5h18" stroke=${c} stroke-width="4" stroke-linecap="butt" /></svg></span>`,
};
const dashGlyph = d => html`<svg viewBox="0 0 28 10"><path d="M1 5h26" stroke-width="1.5" stroke-dasharray=${d === 'dashed' ? '5 3' : d === 'dotted' ? '1.5 2.5' : null} stroke-linecap=${d === 'dotted' ? 'round' : 'butt'} /></svg>`;
const weightGlyph = w => html`<svg class="ln" viewBox="0 0 40 10"><path d="M2 5h36" stroke-width=${Math.max(0.5, Math.min(6, w * 1.333))} /></svg>`;
const lineGlyph = d => html`<svg class="ln" viewBox="0 0 40 10"><path d="M2 5h36" stroke-width="1.5" stroke-dasharray=${d === 'dashed' ? '6 4' : d === 'dotted' ? '1.5 3' : null} stroke-linecap=${d === 'dotted' ? 'round' : 'butt'} /></svg>`;
const arrowGlyph = a => html`<svg class="ln" viewBox="0 0 40 10"><path d="M4 5h32" stroke-width="1.3" />${a === 'end' || a === 'both' ? html`<path d="M31 1.5l5 3.5-5 3.5" stroke-width="1.3" />` : null}${a === 'start' || a === 'both' ? html`<path d="M9 1.5 4 5l5 3.5" stroke-width="1.3" />` : null}</svg>`;
const frameGlyph = f => html`<svg class="ln" viewBox="0 0 40 14"><path d=${f === 'bracket' ? 'M2 13V3h36v10' : 'M2.5 1.5h35v11h-35z'} stroke-width="1.2" stroke-dasharray=${f === 'dashed' ? '4 3' : null} /></svg>`;
const shapeGlyph = (g, corner) => html`<svg class="glyph" viewBox="-1 -1 20 16"><path d=${Scene.path(g, 18, 14, corner)} /></svg>`;
const shadowGlyph = on => html`<svg class="glyph sh" viewBox="-1 -1 22 18">${on ? html`<path d="M4 4h16v12H4z" class="shade" />` : null}<path d="M1 1h16v12H1z" /></svg>`;
const ALIGN_ICON = { left: 'align-left', center: 'align-center', right: 'align-right' };

// The choices of one setting in a popover, each previewed while pointed at: a picked one is made, and
// closes the popover where `close` is given. The one the setting has takes the focus as it opens.
const choice = (label, v, close) => ({ onPointerEnter: () => preview(label, v), onClick: () => { close?.(); apply(label, v); } });
// A setting's choices as a menu, each previewed while it's pointed at or reached by the keys, the one it has checked.
const choices = (label, list, now, glyphOf = null) => list.map(([v, text]) => ({ label: text, checked: now === v, ...(glyphOf && { glyph: glyphOf(v) }),
  run: () => apply(label, v), point: on => on ? preview(label, v) : preview() }));
// A row of a popover that opens its submenu, as a menu's does, when it's pointed at, clicked or reached by the
// keys; the submenu is the popover's, so the popover stays open beside it.
const Sub = ({ label, items, of, disabled }) => {
  const open = e => !disabled && Shell.menu(e.currentTarget, items(), { parent: of, placement: 'right-start', gap: 2 });
  return html`<button class="menu-item sub" aria-haspopup="menu" disabled=${disabled} onPointerEnter=${open} onClick=${open}
    onKeyDown=${e => { if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); open(e); } }}><span class="label">${label}</span></button>`;
};
// A setting's value from 0 to `max` by a slider, drawn on the chart as it's dragged and made as it's let go.
function Slider({ label, k, v, max = 100, step = 1, as = x => `${x}%` }) {
  const read = e => Math.round(+e.currentTarget.value / step) * step;
  return html`<label class="menu-item slider"><span class="label">${label}</span>
    <input type="range" min="0" max=${max} step=${step} value=${v} aria-label=${label} onInput=${e => { e.currentTarget.nextElementSibling.textContent = as(read(e)); preview(k, read(e)); }}
      onChange=${e => apply(k, read(e))} /><output>${as(v)}</output></label>`;
}
// PowerPoint's palette: the theme's colors, its standard colors and the chart's own; then More colors, any color
// by its hex, drawn as it's typed and made with Enter; then what else the popover sets (a fill's Transparency, an
// outline's Weight and Dashes); and last No fill (or outline).
const NONE = { Fill: 'No fill', Outline: 'No outline' };
function Palette({ label, none, close, children }) {
  const v = String(value(label)).toLowerCase(), own = chartColors();
  const swatch = (c, name) => html`<button style=${`background-color:${c}`} aria-pressed=${v === c} autofocus=${v === c} aria-label=${name} data-tip=${name} ...${choice(label, c, close)} />`;
  // Off the swatches, the chart is drawn in the color typed, while it's being typed.
  const rest = el => { const f = el.querySelector('.hex > input'), c = f === document.activeElement && hexOf(f.value); c ? preview(label, c) : preview(); };
  const typed = e => { const f = e.currentTarget; f.toggleAttribute('aria-invalid', !!f.value.trim() && !hexOf(f.value)); rest(f.closest('.palette')); };
  const entered = e => { const c = e.key === 'Enter' && hexOf(e.currentTarget.value); if (c) { close?.(); apply(label, c); } };
  return html`<div class="palette" onPointerLeave=${e => rest(e.currentTarget)}>${THEME.map((c, i) => swatch(c, THEME_NAMES[i]))}<i />${STANDARD.map((c, i) => swatch(c, STANDARD_NAMES[i]))}
    ${own.length ? html`<i />${own.map(c => swatch(c, c.toUpperCase()))}` : null}
    <div class="more">
      <label class="menu-item"><span class="label">More colors</span>
        <span class="hex">#<input value=${/^#[0-9a-f]{6}$/.test(v) ? v.slice(1).toUpperCase() : ''} maxlength="7" spellcheck="false" autocomplete="off" aria-label="More colors"
          onFocus=${e => e.currentTarget.select()} onInput=${typed} onKeyDown=${entered} /></span></label>
      <button class="menu-item" onClick=${() => { close?.(); drop(label); }}><span class="label">Eyedropper</span>${Shell.icon('Pipette')}</button>
      ${children}
      ${none ? html`<button class="menu-item" role="menuitemcheckbox" aria-checked=${v === 'none'} autofocus=${v === 'none'} ...${choice(label, 'none', close)}>
        <span class="label">${NONE[label]}</span>${v === 'none' ? Shell.icon('check') : null}</button>` : null}
    </div></div>`;
}
const seg = (label, items, v, { as = x => x, close } = {}) => html`<div class="seg" onPointerLeave=${() => preview()}>${items.map(([k, text, tip]) =>
  html`<button aria-pressed=${v === k} autofocus=${v === k} aria-label=${tip ?? null} data-tip=${tip ?? null} ...${choice(label, as(k), close)}>${text}</button>`)}</div>`;
// A popover of the bar's, whose preview ends as it closes.
const pop = (e, draw) => Shell.popover(e.currentTarget ?? e, (close, id) => draw(close, id), { placement: 'bottom-start', onClose: () => preview() });

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
// A name cut short is shown whole on hover, or else what the control does.
const whole = e => { const b = e.currentTarget, t = b.firstElementChild; b.dataset.tip = t && t.scrollWidth > t.clientWidth ? t.textContent : 'All like it'; };

// ---- The scope, on the chart ----

// A group chosen: what the next change goes to, cued on the chart; the selection itself clears the cue. The group
// last chosen for a selection is the one its right part names again.
const liked = signal(null);
function choose(x) { chosen.value = x?.own ? null : x?.key ?? null; if (chosen.peek()) liked.value = chosen.peek(); cue(); }
// The two parts: the selection, and the group all like it names (the one last chosen, or the narrowest).
const likeOf = s => { const sc = scopeOf(s.scopes); return !sc ? null : !sc.own ? sc : s.scopes.find(x => x.key === liked.peek()) ?? s.narrowest; };
// Ctrl+Shift+A: from one part to the other.
function toggle() {
  const c = Canvas.active.peek();
  if (!c?.scene()) return false;
  const s = scopesOf(c), sc = scopeOf(s.scopes), like = likeOf(s);
  if (!sc || !like || !s.scopes.some(x => x.own)) return false;
  choose(sc.own ? like : s.scopes.find(x => x.own));
}
// The cue: the group pointed at, for as long as it's pointed at; else the group chosen, if any. (A Key row or a
// frame is lit by the canvas as it is.)
function cue(x) {
  const c = Canvas.active.peek();
  if (!c?.scene()) return;
  const s = x === undefined ? (() => { const all = scopesOf(c), sc = scopeOf(all.scopes); return all.scopes.some(o => o.own) && !sc?.own ? sc : null; })() : x;
  c.cue(s?.marks ? [...s.marks] : null);
}

// ---- The popovers ----

// Fill: the palette, then how transparent it is.
const FillPop = ({ close }) => html`<${Palette} label="Fill" none close=${close}>
  <${Slider} label="Transparency" k="Transparency" v=${Math.round(value('Transparency') ?? 0)} /></${Palette}>`;
// Outline, as PowerPoint's Shape Outline: the palette, then its Weight ▸ and Dashes ▸, a line's Arrows ▸ and Route
// ▸, a group's Frame ▸, and No outline.
function OutlinePop({ close, of }) {
  const ms = current?.marks ?? [], lines = ms.some(m => m.type === 'line' || m.geometry === 'line'), framed = current?.scope?.outputs && ms.some(m => m.type === 'box');
  const weight = WEIGHTS.find(w => Math.abs(Scene.toSlide(page(), value('Weight')) - w) < 0.01);
  return html`<${Palette} label="Outline" none close=${close}>
    <div class="menu-sep" />
    <${Sub} label="Weight" of=${of} items=${() => choices('Weight', WEIGHTS.map(w => [w, `${w} pt`]), weight, weightGlyph)} />
    <${Sub} label="Dashes" of=${of} items=${() => choices('Dash', [['solid', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted']], value('Dash'), lineGlyph)} />
    ${lines ? html`<${Sub} label="Arrows" of=${of} items=${() => choices('Arrow', [['none', 'None'], ['end', 'At the end'], ['start', 'At the start'], ['both', 'At both ends']], value('Arrow'), arrowGlyph)} />
      <${Sub} label="Route" of=${of} items=${() => choices('Connector', [['elbow', 'Elbow'], ['straight', 'Straight']], value('Connector'))} />` : null}
    ${framed ? html`<${Sub} label="Frame" of=${of} items=${() => choices('Frame', [['none', 'None'], ['dashed', 'Dashed box'], ['solid', 'Box'], ['bracket', 'Bracket']], value('Frame') ?? 'none', frameGlyph)} />` : null}
    <div class="menu-sep" /></${Palette}>`;
}
// Shape: PowerPoint's shapes, a rounded rectangle's Rounding, and its Shadow.
const SHAPES = [['rect', 'Rectangle'], ['rounded', 'Rounded rectangle'], ['oval', 'Oval'], ['triangle', 'Triangle'], ['diamond', 'Diamond'], ['hexagon', 'Hexagon'],
  ['octagon', 'Octagon'], ['parallelogram', 'Parallelogram'], ['trapezoid', 'Trapezoid'], ['pentagon', 'Pentagon'], ['chevron', 'Chevron'], ['arrow', 'Arrow'], ['cylinder', 'Cylinder']];
function ShapePop({ close }) {
  const now = value('Shape') ?? current?.marks[0]?.geometry ?? 'rect';
  return html`<div class="picker shape">
    <div class="shapes" onPointerLeave=${() => preview()}>${SHAPES.map(([g, name]) => html`<button aria-label=${name} data-tip=${name} aria-pressed=${now === g} ...${choice('Shape', g, close)}>${shapeGlyph(g)}</button>`)}</div>
    ${now === 'rounded' ? html`<${Slider} label="Rounding" k="Corner" v=${Math.round(value('Corner') ?? Scene.CORNER)} max="50" />` : null}
    <div class="row"><span class="k">Shadow</span>${seg('Shadow', [['none', shadowGlyph(false), 'No shadow'], ['soft', shadowGlyph(true), 'Soft shadow']], value('Shadow') ?? 'none')}</div>
  </div>`;
}
// Paragraph: the text's alignment across, its place down the box, and its line spacing.
const ParagraphPop = () => html`<div class="picker">
  <div class="row"><span class="k">Align</span>${seg('Align', ['left', 'center', 'right'].map(a => [a, Shell.icon(ALIGN_ICON[a]), `Align ${a}`]), value('Align'))}</div>
  <div class="row"><span class="k">Position</span>${seg('Valign', [['top', 'Top'], ['middle', 'Middle'], ['bottom', 'Bottom']], value('Valign') ?? 'middle')}</div>
  <div class="row"><span class="k">Spacing</span>${seg('Spacing', [[1, '1.0'], [1.15, '1.15'], [1.5, '1.5'], [2, '2.0']], value('Spacing') ?? 1)}</div>
</div>`;

// ---- Fonts ----

// Whether a font is on this computer: drawn in it, a line of text is a width none of the generic families give it.
const fonts = new Map();
function onComputer(name) {
  if (!fonts.has(name)) {
    const ctx = (onComputer.ctx ??= document.createElement('canvas').getContext('2d')), probe = 'mmmmmmmmmlli1WQ@#&Ag', q = `'${name.replace(/['\\]/g, '')}'`;
    const w = f => { ctx.font = `40px ${f}`; return ctx.measureText(probe).width; };
    fonts.set(name, ['monospace', 'serif', 'sans-serif'].some(base => Math.abs(w(`${q}, ${base}`) - w(base)) > 0.01));
  }
  return fonts.get(name);
}
// The fonts this chart sets its texts in, the most used first: as it is, not as a font pointed at draws it.
function chartFonts() {
  const n = new Map(), sc = App.scene.peek();
  for (const m of sc?.marks ?? []) for (const it of [...m.texts ?? [], ...(m.caption ? [m.caption] : [])]) n.set(it.look.Font, (n.get(it.look.Font) ?? 0) + it.lines.length);
  return [...n].sort((a, b) => b[1] - a[1]).map(([f]) => f);
}
const KINDS = [['sans', 'Sans serif'], ['serif', 'Serif'], ['mono', 'Monospace']];
// The font menu: a field that finds a font as its name is typed, then the chart's own fonts, then every font by its
// class, each name in its own face; one not on this computer greyed, and said so on hover. Any font on this
// computer is taken by typing its name. Pointed at or reached by the keys, a font is drawn on the chart.
function Fonts({ close }) {
  const [q, setQ] = useState(''), [at, setAt] = useState(-1), list = useRef();
  const now = value('Font'), find = q.trim().toLowerCase(), has = f => !find || f.toLowerCase().includes(find);
  const all = Scene.FONTS.map(f => f.name), named = all.find(f => f.toLowerCase() === find);
  const typed = find && !named && !chartFonts().some(f => f.toLowerCase() === find) && onComputer(q.trim()) ? q.trim() : null;
  const sections = [[null, typed ? [typed] : []], ['This chart', chartFonts().filter(has)], ...KINDS.map(([k, head]) => [head, Scene.FONTS.filter(f => f.kind === k && has(f.name)).map(f => f.name)])];
  const items = sections.flatMap(([, fs]) => fs), active = at < 0 ? (find ? 0 : -1) : Math.min(at, items.length - 1), pointedAt = items[active];
  useLayoutEffect(() => { pointedAt ? preview('Font', pointedAt) : preview(); list.current?.querySelector('.on')?.scrollIntoView({ block: 'nearest' }); }, [pointedAt]);
  const pick = f => { close(); apply('Font', f); };
  const keys = e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setAt(Math.max(0, Math.min(items.length - 1, active + (e.key === 'ArrowDown' ? 1 : -1)))); }
    else if (e.key === 'Enter') { e.preventDefault(); const f = items[active] ?? (named || typed); if (f) pick(f); }
  };
  let i = 0;
  return html`<div class="fonts" onPointerLeave=${() => setAt(-1)}>
    <input class="find" type="text" placeholder="Find" aria-label="Font" spellcheck="false" autocomplete="off" autofocus value=${q}
      onInput=${e => { setQ(e.currentTarget.value); setAt(-1); }} onKeyDown=${keys} />
    <div class="list" role="listbox" ref=${list}>${sections.filter(([, fs]) => fs.length).map(([head, fs]) => html`
      ${head ? html`<div class="menu-head">${head}</div>` : null}
      ${fs.map(f => { const k = i++, here = onComputer(f); return html`<div role="option" aria-selected=${f === now} class=${'menu-item' + (k === active ? ' on' : '') + (here ? '' : ' away')}
        data-tip=${here ? null : 'Not on this computer'} onPointerMove=${() => k !== active && setAt(k)} onClick=${() => pick(f)}>
        <span class="check">${f === now ? Shell.icon('check') : null}</span><span class="label" style=${`font-family:${Scene.fontFamily(f)}`}>${f}</span></div>`; })}`)}
      ${!items.length ? html`<div class="menu-none">No match</div>` : null}
    </div></div>`;
}

// ---- Sizes ----

// PowerPoint's sizes, which Grow and Shrink step through; under 8 a point at a time, over 96 ten.
const STEPS = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 54, 60, 66, 72, 80, 88, 96];
const grown = v => v < 8 ? Math.floor(v + 1e-6) + 1 : STEPS.find(z => z > v + 1e-6) ?? (Math.floor(v / 10 + 1e-6) + 1) * 10;
const shrunk = v => v <= 8 + 1e-6 ? Math.max(1, Math.ceil(v - 1 - 1e-6)) : [...STEPS].reverse().find(z => z < v - 1e-6) ?? 96;
function resize(f) {
  const v = shown(value('Size'));
  if (typeof v === 'number' && current?.marks.length) apply('Size', sized(f(v)));
}
// The size: a field that takes any size typed (11.5), made with Enter, Esc putting it back; and its list.
function SizeBox({ v, disabled }) {
  const back = el => { el.value = String(v); Canvas.active.peek()?.root.focus({ preventScroll: true }); };
  const keys = e => {
    const el = e.currentTarget;
    if (e.key === 'Enter') {
      e.preventDefault();
      const x = parseFloat(el.value.replace(/\s*pt$/i, ''));
      if (Number.isFinite(x) && x >= 1 && x <= 1584) { apply('Size', sized(Math.round(x * 2) / 2)); el.blur(); } else el.select();
    } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); back(el); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); resize(e.key === 'ArrowUp' ? grown : shrunk); }
  };
  return html`<span class=${'combo size' + (disabled ? ' off' : '')}>
    <input data-fb="size" value=${String(v)} disabled=${disabled} aria-label="Font size" spellcheck="false" autocomplete="off" inputmode="decimal"
      onFocus=${e => e.currentTarget.select()} onKeyDown=${keys} onBlur=${e => { e.currentTarget.value = String(v); }} />
    <button class="dd" data-fb="sizes" aria-label="Font sizes" disabled=${disabled} onClick=${e => offer(e.currentTarget, STEPS.slice(0, 15).map(z => ({ label: String(z), checked: v === z,
      run: () => apply('Size', sized(z)), get tries() { return ['Size', sized(z)]; } })))} /></span>`;
}

// ---- The format painter, and Clear formatting ----

// The look a mark has: what it draws by, its box's or its line's, and its first text's; a weight as the slide has it,
// as the bar writes it. Never what it is or where, as PowerPoint's painter copies none of them: not its shape or its corners,
// its record's Format, its frame, its layer or its route.
const BOX_LOOK = ['Fill', 'Transparency', 'Outline', 'Weight', 'Dash', 'Shadow', 'Valign'];
const LINE_LOOK = ['Outline', 'Weight', 'Dash', 'Arrow'];
const TEXT_LOOK = ['Font', 'Size', 'Bold', 'Italic', 'Underline', 'Strike', 'Color', 'Align', 'Spacing'];
const LOOK = new Set([...BOX_LOOK, ...LINE_LOOK, ...TEXT_LOOK]);
const kindOf = m => m.type === 'line' || m.geometry === 'line' ? 'line' : 'box';
function lookOf(m, p = page()) {
  const text = m.texts?.[0] ?? m.caption, out = {};
  for (const l of kindOf(m) === 'line' ? LINE_LOOK : BOX_LOOK) { const v = m.settings?.[l]?.value ?? m.look?.[l]; if (v !== undefined && v !== null) out[l] = l === 'Weight' ? +Scene.toSlide(p, v).toFixed(3) : v; }
  for (const l of TEXT_LOOK) { const v = text?.look?.[l] ?? m.settings?.[l]?.value ?? m.look?.[l]; if (v !== undefined && v !== null) out[l] = l === 'Size' ? Math.round(Scene.toSlide(p, v) * 2) / 2 : v; }
  return out;
}
// The painter: the look copied, `once` for one paste or until Esc, and whether it goes to all like what it's pasted on.
const painter = signal(null);
let copied = null, unlayer = null;
function copyLook() {
  const m = current?.marks.find(x => x.type === 'box' || x.type === 'line' || x.type === 'shape');
  if (!m) return false;
  copied = { look: lookOf(m), from: m.record ? App.notes.peek().nameOf(App.state.peek(), m.record) : null };
  return true;
}
function arm(once) {
  if (!copyLook()) return;
  unlayer?.();
  unlayer = Shell.layer(disarm);
  painter.value = { once, all: !!chosen.peek() };
}
function disarm() { unlayer?.(); unlayer = null; painter.value = null; dropper.value = null; }
// The eyedropper, PowerPoint's: armed from a palette, a click on a mark takes its color of that palette's property (a
// box's fill or outline, its text's color) and gives it to the selection at its scope, as the palette would; Esc or a
// click on the page puts it down.
const dropper = signal(null);
function drop(label) { unlayer?.(); unlayer = Shell.layer(disarm); painter.value = null; dropper.value = { label }; }
// The look pasted on the selection, at its scope: for the selection, a note of each property its mark doesn't
// already take so, at its record's own tree in the view (a free shape's, in its row); for a group, a note of each that
// any mark it reaches doesn't take so, at each of its outputs. One change.
function pasteLook(look = copied?.look) {
  const c = Canvas.active.peek();
  if (!look || !c?.scene() || App.readOnly.peek()) return false;
  const s = scopesOf(c), scope = scopeOf(s.scopes), sc = c.scene(), view = sc.view, st = App.state.peek();
  if (!scope) return false;
  const fits = m => [...(kindOf(m) === 'line' ? LINE_LOOK : BOX_LOOK), ...TEXT_LOOK].filter(l => l in look), differs = (m, l) => JSON.stringify(lookOf(m)[l]) !== JSON.stringify(look[l]);
  const marks = scope.own ? s.marks : [...scope.marks].map(id => sc.byId.get(id)).filter(Boolean);
  const labels = [...new Set(marks.flatMap(m => fits(m).filter(l => differs(m, l))))];
  if (!labels.length) { Shell.toast('Already has that look'); return true; }
  // A size is the slide's, as the bar picks one: the page's that prints it, though the chart be drawn smaller for it.
  const size = labels.includes('Size') ? sized(look.Size) : null, at = l => l === 'Size' ? size : look[l];
  App.change(tx => {
    if (scope.outputs) { for (const l of labels) for (const p of scope.outputs) tx.note(l, p, at(l), { view }); return; }
    for (const m of marks) {
      const ls = fits(m).filter(l => differs(m, l));
      if (m.type === 'shape') tx.update(m.id, { format: { ...App.shown.peek().item(App.chart.peek(), m.id)[0]?.format, ...Object.fromEntries(ls.map(l => [l, at(l)])) } });
      else for (const l of ls) tx.note(l, Tree.treeOf(st, m.record), at(l), { view });
    }
  }, { say: `Pasted ${copied?.from ? `the look of ${copied.from}` : 'a look'} on ${scope.own ? (marks.length === 1 && marks[0].record ? App.notes.peek().nameOf(st, marks[0].record) : named(c, scope).replace(/^This|^These/, m => m === 'This' ? 'this' : 'these')) : named(c, scope)}` });
  return true;
}
// A click with the painter armed pastes on what's clicked, selecting it, at its scope; on the page, it disarms. With
// the eyedropper, it takes the color clicked.
function painting(e) {
  const c = Canvas.active.peek(), p = painter.peek(), d = dropper.peek();
  if ((!p && !d) || !c || e.button !== 0 || !c.root.contains(e.target) || !e.target.closest('.dc-graph')) return;
  e.preventDefault(); e.stopPropagation();
  const cell = e.target.closest('[data-cell-id]')?.getAttribute('data-cell-id') ?? '', id = cell.replace(/·label$/, ''), m = c.scene()?.byId.get(id);
  if (d) {
    const v = !m ? null : d.label === 'Color' ? (m.texts?.[0] ?? m.caption)?.look?.Color : m.settings?.[d.label]?.value ?? m.look?.[d.label];
    disarm();
    if (typeof v === 'string' && (v === 'none' || hexOf(v))) apply(d.label, v === 'none' ? v : hexOf(v));
    return;
  }
  if (!m || !['box', 'line', 'shape', 'frame'].includes(m.type) || m.geometry === 'legend') return disarm();
  Shell.select([id]);
  if (p.all) { const s = scopesOf(c), like = likeOf(s); if (like && !like.own) choose(like); }
  pasteLook();
  if (p.once) disarm();
}
// Clear formatting: every look noted at the scope, taken away, one change, saying what it took: for the selection,
// its marks' records' own looks in the view, and theirs of the texts in them; for a group, its outputs' looks there.
// A free shape goes back to its kind's look. What it is (its Format), where it is, its frame and layer, stay.
function clearLook() {
  const c = Canvas.active.peek();
  if (!c?.scene() || App.readOnly.peek()) return false;
  const s = scopesOf(c), scope = scopeOf(s.scopes), sc = c.scene(), view = sc.view, st = App.state.peek(), N = App.notes.peek();
  if (!scope) return false;
  const keys = new Set(scope.outputs ? scope.outputs.map(p => Tree.key(p)) : s.marks.filter(m => m.record).flatMap(m => inMark(st, m)).map(id => Tree.treeOf(st, id)).filter(Boolean).map(t => Tree.key(t)));
  const notes = [...LOOK].flatMap(l => N.notes(l)).filter(n => n.view === view && keys.has(Tree.key(n.pattern)));
  const shapes = scope.own ? s.marks.filter(m => m.type === 'shape' && Object.keys(App.shown.peek().item(App.chart.peek(), m.id)[0]?.format ?? {}).some(l => LOOK.has(l))) : [];
  const what = listed([...new Set([...notes.map(n => n.label), ...shapes.flatMap(m => Object.keys(App.shown.peek().item(App.chart.peek(), m.id)[0].format).filter(l => LOOK.has(l)))])]);
  if (!notes.length && !shapes.length) { Shell.toast(`No formatting to clear on ${scope.own ? scope.label.replace(/^This|^These/, m => m.toLowerCase()) : named(c, scope)}`); return true; }
  const whose = scope.own ? (s.marks.length === 1 && s.marks[0].record ? possessive(N.nameOf(st, s.marks[0].record)) : `${scope.label.replace(/^This|^These/, m => m === 'This' ? 'this' : 'these')}’`) : null;
  App.change(tx => {
    notes.forEach(n => tx.remove(n.note));
    for (const m of shapes) { const f = App.shown.peek().item(App.chart.peek(), m.id)[0].format; tx.update(m.id, { format: Object.fromEntries(Object.entries(f).filter(([l]) => !LOOK.has(l))) }); }
  }, { say: whose ? `Cleared ${whose} ${what}` : `Cleared the ${what} of ${scope.caption}` });
  return true;
}

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

// The popovers the canvas's menus offer too, at an element or a point.
const opener = {
  fill: at => pop(at, close => html`<${FillPop} close=${close} />`),
  outline: at => pop(at, (close, of) => html`<${OutlinePop} close=${close} of=${of} />`),
  color: at => pop(at, close => html`<${Palette} label="Color" close=${close} />`),
  font: at => pop(at, close => html`<${Fonts} close=${close} />`),
  shape: at => pop(at, close => html`<${ShapePop} close=${close} />`),
  paragraph: at => pop(at, () => html`<${ParagraphPop} />`),
};

// While the inspector is widened over the chart there's nothing here to format.
function Bar() {
  App.scene.value; Shell.selection.value; Canvas.fieldLit?.value;
  const c = Canvas.active.value;
  if (!c || !c.scene() || Shell.wide.value) return html`<div class="fb" hidden=${Shell.wide.value} />`;
  const s = scopesOf(c), scope = scopeOf(s.scopes, chosen.value);
  current = { canvas: c, ...s, scope, field: fieldOf(c) };
  const none = !s.marks.length, lineOnly = s.marks.length && s.marks.every(m => m.type === 'line' || m.geometry === 'line');
  const any = !none, boxy = any && !lineOnly && !s.marks.every(m => m.type === 'frame'), ro = App.readOnly.value;
  const set = (label, v) => apply(label, v);
  const toggle = label => set(label, !value(label));
  const zoom = Math.round(Canvas.zoom.value * 100);
  const placeable = s.marks.filter(m => m.type === 'box' || m.type === 'shape').length;
  const aligns = [
    { head: 'Text' }, ...[['left', 'Left'], ['center', 'Center'], ['right', 'Right']].map(([a, label]) => ({ label, icon: ALIGN_ICON[a], checked: value('Align') === a, run: () => set('Align', a), tries: ['Align', a] })),
    '-', { head: placeable > 1 ? 'Shapes' : 'To the page' },
    ...[['left', 'Align left', 'AlignStartVertical'], ['center', 'Align center', 'AlignCenterVertical'], ['right', 'Align right', 'AlignEndVertical'], ['top', 'Align top', 'AlignStartHorizontal'],
      ['middle', 'Align middle', 'AlignCenterHorizontal'], ['bottom', 'Align bottom', 'AlignEndHorizontal']].map(([a, label, icon]) => ({ label, icon, disabled: !placeable, run: () => c.align(a) })),
    '-', { label: 'Distribute across', icon: 'AlignHorizontalDistributeCenter', disabled: placeable < 3, run: () => c.distribute('across') },
    { label: 'Distribute down', icon: 'AlignVerticalDistributeCenter', disabled: placeable < 3, run: () => c.distribute('down') },
    { label: 'Same width', disabled: placeable < 2, run: () => c.match('width') }, { label: 'Same height', disabled: placeable < 2, run: () => c.match('height') },
  ];
  const orders = [
    { label: 'Bring to front', icon: 'front', keys: '$mod+Shift+]', run: () => c.order('front') }, { label: 'Bring forward', icon: 'forward', keys: '$mod+]', run: () => c.order('forward') },
    { label: 'Send backward', icon: 'backward', keys: '$mod+[', run: () => c.order('backward') }, { label: 'Send to back', icon: 'back', keys: '$mod+Shift+[', run: () => c.order('back') },
  ];
  const grouping = s.group ? { label: 'Ungroup', icon: 'ungroup', keys: '$mod+Shift+G', run: () => c.ungroup() } : { label: 'Group', icon: 'group', keys: '$mod+G', disabled: placeable < 2, run: () => c.group() };
  // Tidy lays the whole view out again, with nothing to do where nothing in it was placed by hand; pointed
  // at, it's drawn as it would be. Made, the change ends the preview.
  const view = c.scene().view, tidy = { label: 'Tidy', disabled: ro || !App.notes.peek().notes('Position').some(n => n.view === view),
    run: () => { tried = null; c.tidy(); }, tries: ['Tidy'] };
  // The selection; then its Styles rows as Styles lists them, each style's under its name, and apart after them
  // those under none (Names); then its own groups; and, where members of the group chosen keep their own look of
  // what the group is given here, a way to clear it. Each group pointed at is cued on the chart.
  const scopes = () => {
    const item = x => ({ label: named(c, x), checked: x === scope, run: () => choose(x), ...(!x.own && { point: on => cue(on ? x : undefined) }) });
    const rows = s.scopes.filter(x => !x.own && !x.kin), headed = rows.filter(x => x.name);
    const kept = scope?.outputs ? keeping(c, scope, givenTo(view, scope)) : [], whose = kept.length && possessive(keepers(kept));
    const what = listed([...new Set(kept.flatMap(k => k.notes.map(n => n.label)))]);
    const clear = kept.length ? [{ label: `Clear ${whose} own ${what}`, disabled: ro,
      run: () => App.change(tx => kept.forEach(k => k.notes.forEach(n => tx.remove(n.note))), { say: `Cleared ${whose} own ${what}` }) }] : [];
    return [s.scopes.filter(x => x.own).map(item), headed.flatMap((x, i) => x.style === headed[i - 1]?.style ? [item(x)] : [{ head: x.name }, item(x)]),
      rows.filter(x => !x.name).map(item), s.scopes.filter(x => x.kin).map(item), clear].filter(p => p.length).flatMap((p, i) => i ? ['-', ...p] : p);
  };
  // The scope as two parts, PowerPoint's selection on the left and all like it on the right: the group chosen, or
  // else the narrowest, which its ▾ chooses among the rest. A Key row or a frame is its group alone.
  liked.value; chosen.value;
  const like = likeOf(s), ownPart = s.scopes.find(x => x.own), armed = painter.value;
  // A font or size the selected marks' names don't share is shown blank, as PowerPoint shows one its selection mixes.
  const several = l => new Set(s.marks.map(m => (m.texts?.[0] ?? m.caption)?.look?.[l]).filter(v => v !== undefined)).size > 1;
  const font = !any ? 'Arial' : several('Font') ? '' : value('Font'), size = !any ? 10 : several('Size') ? '' : shown(value('Size')), align = (any && value('Align')) || 'center';
  return html`<div class="fb" onMouseDown=${e => { if (e.target.closest('button')) e.preventDefault(); }}>
    <button class="btn dd" data-fb="insert" onClick=${e => insertMenu(e, c)}>Insert</button>
    <span class="sep" />
    ${none ? null : html`<div class=${'scope' + (scope?.own ? ' own' : '')} role="group" aria-label="Format" data-fb="scope">
      ${ownPart ? html`<button aria-pressed=${!!scope?.own} data-fb="own" data-tip=${like ? 'Just the selection' : null} data-keys=${like ? 'Ctrl+Shift+A' : null}
        onClick=${() => choose(ownPart)}><span>${ownPart.label}</span></button>` : null}
      ${like ? html`<button aria-pressed=${!scope?.own} data-fb="like" data-keys=${ownPart ? 'Ctrl+Shift+A' : null} onPointerOver=${whole}
        onPointerEnter=${() => cue(like)} onPointerLeave=${() => cue()} onClick=${() => choose(like)}><span>All ${named(c, like)}</span></button>` : null}
      ${like && s.scopes.length > 2 ? html`<button class="more" data-fb="groups" aria-label="All like it" data-tip="All like it" aria-haspopup="menu"
        onClick=${e => Shell.menu(e.currentTarget, scopes(), { placement: 'bottom-end', onClose: () => cue() })} />` : null}
    </div>
    <button class="btn icon" data-fb="painter" aria-label="Format painter" data-tip="Format painter" data-keys="Ctrl+Shift+C" aria-pressed=${!!armed} disabled=${ro}
      onClick=${() => armed ? disarm() : arm(true)} onDblClick=${() => arm(false)}>${Shell.icon('painter')}</button>
    <button class="btn icon" data-fb="clear" aria-label="Clear formatting" data-tip="Clear formatting" data-keys="Ctrl+Space" disabled=${ro} onClick=${clearLook}>${Shell.icon('eraser')}</button>
    <span class="sep" />`}
    <button class="btn dd font" data-fb="font" disabled=${none} onClick=${e => opener.font(e.currentTarget)}><span>${font}</span></button>
    <${SizeBox} v=${size} disabled=${none} />
    <button class="btn icon" data-fb="grow" aria-label="Increase font size" data-tip="Increase font size" data-keys="Ctrl+Shift+>" disabled=${none} onClick=${() => resize(grown)}>${Shell.icon('grow')}</button>
    <button class="btn icon" data-fb="shrink" aria-label="Decrease font size" data-tip="Decrease font size" data-keys="Ctrl+Shift+<" disabled=${none} onClick=${() => resize(shrunk)}>${Shell.icon('shrink')}</button>
    <span class="sep" />
    <button class="btn icon" data-fb="bold" aria-label="Bold" data-tip="Bold" data-keys="Ctrl+B" aria-pressed=${any && !!value('Bold')} disabled=${none} onClick=${() => toggle('Bold')}>${Shell.icon('bold')}</button>
    <button class="btn icon" data-fb="italic" aria-label="Italic" data-tip="Italic" data-keys="Ctrl+I" aria-pressed=${any && !!value('Italic')} disabled=${none} onClick=${() => toggle('Italic')}>${Shell.icon('italic')}</button>
    <button class="btn icon" data-fb="underline" aria-label="Underline" data-tip="Underline" data-keys="Ctrl+U" aria-pressed=${any && !!value('Underline')} disabled=${none} onClick=${() => toggle('Underline')}>${Shell.icon('underline')}</button>
    <button class="btn icon" data-fb="strike" aria-label="Strikethrough" data-tip="Strikethrough" data-keys="Ctrl+Shift+X" aria-pressed=${any && !!value('Strike')} disabled=${none} onClick=${() => toggle('Strike')}>${Shell.icon('strike')}</button>
    <button class="btn dd" aria-label="Text color" data-tip="Text color" data-fb="color" disabled=${none} onClick=${e => opener.color(e.currentTarget)}>${glyph.color(any ? value('Color') : '#000000')}</button>
    <button class="btn dd" aria-label="Paragraph" data-tip="Alignment and spacing" data-fb="paragraph" disabled=${none} onClick=${e => opener.paragraph(e.currentTarget)}>${Shell.icon(ALIGN_ICON[align] ?? 'align-center')}</button>
    <span class="sep" />
    <button class="btn dd" aria-label="Shape" data-tip="Shape and shadow" data-fb="shape" disabled=${!boxy} onClick=${e => opener.shape(e.currentTarget)}>${shapeGlyph(boxy ? value('Shape') ?? s.marks[0].geometry ?? 'rect' : 'rect', boxy ? value('Corner') : undefined)}</button>
    <button class="btn dd" aria-label="Fill" data-tip="Fill" data-fb="fill" disabled=${!boxy} onClick=${e => opener.fill(e.currentTarget)}>${glyph.fill(boxy ? value('Fill') : 'none')}</button>
    <button class="btn dd" aria-label="Outline" data-tip="Outline" data-fb="outline" disabled=${none} onClick=${e => opener.outline(e.currentTarget)}>${glyph.outline(any ? value('Outline') : 'none')}</button>
    <span class="sep" />
    <button class="btn dd wide" data-fb="align" disabled=${none} onClick=${e => offer(e.currentTarget, aligns)}>Align</button>
    <button class="btn dd wide" data-fb="order" disabled=${none} onClick=${e => Shell.menu(e.currentTarget, orders)}>Order</button>
    <button class="btn wide" data-fb="group" disabled=${grouping.disabled} onClick=${grouping.run}>${grouping.label}</button>
    <button class="btn dd narrow arrange" data-fb="arrange" aria-label="Arrange" data-tip="Arrange" onClick=${e => offer(e.currentTarget, [{ label: 'Align', disabled: none, items: aligns }, '-', ...orders.map(o => ({ ...o, disabled: none })), '-', grouping, tidy])}>
      ${Shell.icon('layers')}<span>Arrange</span></button>
    <button class="btn" data-fb="tidy" disabled=${tidy.disabled} onClick=${tidy.run} onPointerEnter=${() => preview(...tidy.tries)} onPointerLeave=${() => preview()}>Tidy</button>
    <button class="btn dd zoom" data-fb="zoom" onClick=${e => Shell.menu(e.currentTarget, [{ label: 'Fit', keys: 'Shift+Digit1', run: () => c.zoom('fit') }, '-',
      ...[0.5, 0.75, 1, 1.5, 2].map(z => ({ label: `${z * 100}%`, checked: Math.abs(z * 100 - zoom) < 0.5, run: () => c.zoom(z) }))], { placement: 'bottom-end' })}>${zoom}%</button>
  </div>`;
}

function mount(el) {
  // Another selection is formatted as itself, until a group is chosen for it.
  const stopSel = effect(() => { Shell.selection.value; chosen.value = null; liked.value = null; });
  // The cue follows the scope, and the chart it's on.
  const stopCue = effect(() => { chosen.value; Shell.selection.value; App.scene.value; if (Canvas.active.value) queueMicrotask(() => cue()); });
  // The painter armed shows the brush wherever the pointer is on the chart, and a click there pastes.
  document.documentElement.style.setProperty('--brush', pointer('Paintbrush', 3, 20));
  document.documentElement.style.setProperty('--dropper', pointer('Pipette', 2, 22));
  const stopBrush = effect(() => { const c = Canvas.active.value, on = !!painter.value, dropping = !!dropper.value; c?.root.classList.toggle('painting', on); c?.root.classList.toggle('dropping', dropping); if (!c && (on || dropping)) disarm(); });
  render(html`<${Bar} />`, el);
  document.addEventListener('pointerover', pointed);
  document.addEventListener('pointerdown', painting, true);
  // Each a window's action, so Find reaches it by its name and ? lists its key: each for what's selected on the chart
  // shown (its keys, as every action's, not taken while text is being typed).
  const onScreen = () => (Canvas.active.peek()?.root.clientWidth ?? 0) > 0 && !!Canvas.active.peek().scene();
  const can = () => onScreen() && !!current?.marks.length, edit = () => can() && !App.readOnly.peek();
  const flip = label => () => apply(label, !value(label));
  const actions = [
    ['format.bold', 'Bold', '$mod+KeyB', flip('Bold')], ['format.italic', 'Italic', '$mod+KeyI', flip('Italic')], ['format.underline', 'Underline', '$mod+KeyU', flip('Underline')],
    ['format.strike', 'Strikethrough', '$mod+Shift+KeyX', flip('Strike')],
    ['format.grow', 'Increase font size', '$mod+Shift+Period', () => resize(grown)], ['format.shrink', 'Decrease font size', '$mod+Shift+Comma', () => resize(shrunk)],
    ['format.copy', 'Copy formatting', '$mod+Shift+KeyC', () => copyLook() && Shell.toast(`Copied the look of ${copied.from ?? 'the shape'}`), can],
    ['format.paste', 'Paste formatting', '$mod+Shift+KeyV', () => pasteLook(), () => edit() && !!copied],
    ['format.clear', 'Clear formatting', '$mod+Space', clearLook],
    ['format.painter', 'Format painter', null, () => arm(true)],
    ['format.scope', 'This box or all like it', '$mod+Shift+KeyA', toggle, can],
  ].map(([id, name, keys, run, enabled = edit]) => Shell.register('action', { id, name, ...(keys && { keys }), run, enabled }));
  return () => { stopSel(); stopCue(); stopBrush(); actions.forEach(off => off()); disarm(); document.removeEventListener('pointerover', pointed); document.removeEventListener('pointerdown', painting, true);
    preview(); Canvas.active.peek()?.cue(null); render(null, el); };
}
// What the pointer shows while the painter or the eyedropper is armed: Lucide's brush or pipette, ink on a white edge,
// the spot at its tip.
function pointer(name, x, y) {
  const node = typeof lucide === 'undefined' ? null : lucide[name];
  if (!node) return 'copy';
  const paths = node[2].map(([t, a]) => `<${t} ${Object.entries(a).map(([k, v]) => `${k}="${v}"`).join(' ')}/>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round">`
    + `<g stroke="#ffffff" stroke-width="4.5">${paths}</g><g stroke="#1b1e1d" stroke-width="1.75">${paths}</g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${x} ${y}, copy`;
}
const typing = () => !!document.activeElement?.closest?.('input, textarea, [contenteditable], .CodeMirror, .dc-edit');

// ---- For the other parts ----
// FormatBar.scope() → what a look change goes to now, as the bar shows it, or null with nothing to format:
//   { own: true, label, view, records } for the selection itself ("This box", "These 3 boxes"); or for a group,
//   { own: false, outputs, caption, marks, label, view, records }: its outputs, at which its look is noted in the view;
//   its caption ("Funds"); the marks it reaches, boxes and lines by id, as a Set; its name with its reach ("Funds (6)").
//   `records` are the records of the marks the change goes to.
// FormatBar.write(tx, label, value) writes one look at that scope on tx, as the bar's own changes do: for the
//   selection, a note at each record's own tree in the view (a free shape, in its row); for a group, at each output; a
//   text property, with a field selected, the field's (the canvas's styleField).
// FormatBar.cue(on): the scope's cue on the chart while on (as the bar's own part shows it pointed at), and back to
//   the bar's own when off.
// FormatBar.open(what, at?): one of the bar's popovers, 'fill', 'outline', 'font', 'color', 'shape' or 'paragraph',
//   at an element or a point { x, y } on screen, or else under the bar's own button for it (the canvas's Format ▸).
// FormatBar.copyLook() → whether there was a look to copy, from the selection (Ctrl+Shift+C); FormatBar.pasteLook()
//   pastes it on the selection at its scope (Ctrl+Shift+V), one change; FormatBar.canPasteLook() → whether a look is
//   copied; FormatBar.clear() clears the look at the scope (Clear formatting), one change, saying what it cleared.
function describe() {
  const c = Canvas.active.peek();
  if (!c?.scene()) return null;
  const s = scopesOf(c), sc = scopeOf(s.scopes);
  if (!sc) return null;
  const by = c.scene().byId, ids = sc.own ? s.marks.map(m => m.id) : [...sc.marks ?? []], records = [...new Set(ids.map(id => by.get(id)?.record).filter(Boolean))];
  const base = { label: named(c, sc), view: c.scene().view, records };
  return sc.own ? { own: true, ...base } : { own: false, ...base, outputs: sc.outputs, caption: sc.caption, marks: new Set(ids) };
}
function scoped(tx, label, v) { const c = Canvas.active.peek(); if (c?.scene()) write(tx, c, label, v); }
function cueing(on) { const c = Canvas.active.peek(); if (!c?.scene()) return; if (!on) return cue(); const s = scopesOf(c), sc = scopeOf(s.scopes); cue(sc?.own ? null : sc); }
// A popover of the bar's, under its own button where nothing else is given (Format ▸ in a menu of the canvas's).
function open(what, at) {
  const anchor = at ?? document.querySelector(`.fb [data-fb="${what}"]`);
  if (anchor) opener[what]?.(anchor);
}

Shell.register('formatbar', { mount });
return { apply, value, colorName, scope: describe, write: scoped, cue: cueing, open,
  copyLook, pasteLook: () => pasteLook(), canPasteLook: () => !!copied, clear: clearLook };
})();
