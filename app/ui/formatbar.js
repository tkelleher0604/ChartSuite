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
// actions, so Find reaches each and ? lists its keys. Its controls keep their places whatever's selected. With nothing
// selected, the font and size go to All text, the page's own note, and a row of the Styles panel clicked is the scope (see
// aim); and house styles are here too (see below), and what differs from its style.
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
// A text's size as it prints: the page's size at the page's scale, what was typed where a note gives it, or the sheet's
// half point where none does.
const page = () => Canvas.active.peek()?.scene()?.page;
const shown = v => typeof v === 'number' ? Math.round(Scene.toSlide(page(), v) * 100) / 100 : v;
const TEXT_LABELS = new Set(['Font', 'Size', 'Bold', 'Italic', 'Underline', 'Strike', 'Color', 'Align', 'Spacing', 'Format']);
let current = null; // { canvas, scopes, scope, marks }
// The scope with nothing selected: every text on the page that no narrower note reaches.
const ALL_TEXT = { key: 'all text', root: true, caption: 'all text', label: 'All text' };
const viewSelf = sc => ({ id: sc.view, kind: 'View' });
// The footer or its number, the chart's own: its look is in its note (dendra.md, The page).
const isFoot = m => m.role === 'footer' || m.role === 'number';
const footNote = () => App.notes.peek().resolve('Footer', { kind: 'View' })?.value ?? {};
const refoot = (tx, format) => tx.note('Footer', { kind: 'View' }, (({ format: _, ...rest }) => Object.keys(format).length ? { ...rest, format } : rest)(footNote()));

// ---- What the selection is, and what reaches it ----

// A group's key, the same for the same outputs however it's come by: a Styles row, or one of a record's own groups.
const keyOf = ps => JSON.stringify(ps.map(p => Tree.key(p)).sort());
// Kept for the scene and the selection, while the state and the notes stand: the bar, and each row of the inspector
// (its Show on chart says where), ask it as they're drawn.
const scopesKept = new WeakMap();
function scopesOf(c) {
  const sc = c.scene(), keys = c.keys(), a = keys.length ? null : aimed.peek(), k = JSON.stringify([keys, a?.key ?? null]), st = App.state.peek(), N = App.notes.peek(), was = scopesKept.get(sc);
  if (was?.k === k && was.st === st && was.N === N) return was.s;
  const s = a ? scopesAimed(sc, a) : scopesNow(c, sc, keys);
  scopesKept.set(sc, { k, st, N, s });
  return s;
}
// A Styles row aimed at, with nothing selected: the ribbon's scope is that row, whichever of the marks it reaches are
// drawn; none drawn, it still goes to the row, and reads from its swatch.
function scopesAimed(sc, a) {
  const g = Scene.groupsOf(App.notes.peek(), sc.view).find(x => x.style === a.style && x.outputs.some(p => Tree.key(p) === a.key)) ?? a, marks = marksOf(sc, g);
  return { aim: g, marks: [...marks].map(id => sc.byId.get(id)).filter(Boolean), scopes: [{ ...g, key: 'row', marks }] };
}
function scopesNow(c, sc, keys) {
  // A group is formatted as its members.
  const picked = keys.map(k => sc.byId.get(Canvas.keyParts(k)[0])).filter(Boolean);
  const group = picked.length === 1 && picked[0].geometry === 'group' ? picked[0] : null;
  const marks = picked.flatMap(m => m.geometry === 'group' ? m.members.map(id => sc.byId.get(id)).filter(Boolean) : [m]);
  // With nothing selected, the font and size are the page's: every text no narrower note reaches (dendra.md, Notes).
  if (!marks.length) return { marks, scopes: keys.length ? [] : [ALL_TEXT] };
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
// A record's group, from its tree, and its key: kept with the tree, which is the same while the record stands.
const generals = new WeakMap();
const generalOf = (t, root = true) => {
  if (!t.args) return root ? { kind: t.kind } : {};
  const out = root && t.out && ('choice' in t.out ? { choice: t.out.choice } : 'tag' in t.out ? { tag: t.out.tag } : null);
  return { ...(out && { out }), args: t.args.map(a => ({ edge: a.edge, loc: generalOf(a.loc, false) })) };
};
const general = t => generals.get(t) ?? generals.set(t, (p => ({ p, key: Tree.key(p) }))(generalOf(t))).get(t);
function kinOf(sc) {
  let k = kins.get(sc);
  if (k) return k;
  const st = App.state.peek(), N = App.notes.peek(), by = new Map(), of = new Map();
  const markOf = id => { for (let x = id; x && st[x]; x = st[x].at) { const m = sc.byId.get(x); if (m && (m.type === 'box' || m.type === 'line')) return m; } return null; };
  for (const id in st) {
    const r = st[id];
    if (Tree.isView(r) || (!Tree.isObject(r) && !r.args && !Tree.isChoice(r) && !Tree.isTag(r))) continue;
    const m = markOf(id), t = m && !m.revealed && Tree.treeOf(st, id), kin = t && general(t), p = kin?.p;
    if (!p) continue;
    const key = kin.key;
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
  if (ms.every(isFoot)) return ms.length === 1 && ms[0].role === 'number' ? 'The page number' : 'The footer';
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
// A group as "all of it" says it, with how many: a noun the Key's row gives in the plural ("All 5 limited
// partnerships", "All 6 funds", "All 17 entities"), an option or a tag by what it is ("All 13 with Jurisdiction
// Delaware", "All 11 with Good Standing"), and what's said as a state as it is ("All 2 not in good standing"). A
// group of one is the only one: "The only name", "The only one with Jurisdiction Delaware".
function allOf(s, n) {
  const caption = s.caption ?? '', ps = s.outputs ?? [], words = caption.split(' '), all = n === 1 ? 'The only one' : `All ${n}`;
  // What's changed is said as a state: "All 3 new or changed", "The only one gone".
  if (ps.length && ps.every(Scene.isChange)) return `${all} ${caption[0].toLowerCase()}${caption.slice(1)}`;
  // An option named as it is (Delaware) or a tag goes by its entry: "with Jurisdiction Delaware".
  const option = ps.length && ps.every(p => p.out?.choice !== undefined && Tree.same(p.out.choice, caption) && p.args?.length === 1);
  if (option) return `${all} with ${ps[0].args[0].edge} ${caption}`;
  if (caption.includes(':') || (ps.length && ps.every(p => p.out?.tag === true))) return `${all} with ${caption.replace(/:\s*/, ' ')}`;
  // Said in sentence case ("Limited partnership", "Funds", "Not in good standing") or a kind: a common noun, lowered.
  const kind = ps.length && ps.every(p => p.kind && !p.args && !p.out), common = kind || words.slice(1).every(w => !/^[A-Z]/.test(w));
  const lower = w => common && /^[A-Z][a-z]/.test(w) ? w[0].toLowerCase() + w.slice(1) : w, last = words.at(-1);
  if (/^(not|no|in|with|without)$/i.test(words[0])) return `${all} ${lower(caption)}`;
  const one = w => w.replace(/ies$/i, 'y').replace(/(?<![su])s$/i, '');
  return `${n === 1 ? 'The only' : all} ${[...words.slice(0, -1), n === 1 ? one(last) : Tree.plural(last)].map((w, i) => i ? w : lower(w)).join(' ')}`;
}
// The scope a change goes to: the group chosen (by its key), or else the selection itself. With nothing selected, a
// Styles row aimed at, its click in the panel: { style, key, … }, a group of Scene.groupsOf.
const chosen = signal(null), aimed = signal(null);
const scopeOf = (scopes, key = chosen.peek()) => scopes.find(s => s.key === key) ?? scopes[0];
// The marks a group reaches that keep their own value of a property, entered for them alone in the view,
// which a change for the group leaves as it is (entered wins): each with the notes that decide it.
function keeping(c, scope, labels) {
  const sc = c.scene(), N = App.notes.peek(), out = [];
  if (!scope?.outputs) return out;
  for (const id of scope.marks ?? marksOf(sc, scope)) {
    const m = sc.byId.get(id), t = Tree.treeOf(App.state.peek(), m.record);
    // (A box's at its object, a line's at its relation's own tree.)
    const notes = labels.map(l => N.resolve(l, t, sc.view)?.note).filter(n => n && n.view === sc.view && Tree.idsIn(n.pattern).size);
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
  if (scope.root) return tx.note(label, viewSelf(c.scene()), value);
  const f = TEXT_LABELS.has(label) && label !== 'Format' ? fieldOf(c) : null;
  if (f) return c.styleField(tx, f, label, value, scope.outputs ? { outputs: scope.outputs } : { own: true });
  const view = c.scene().view, tree = id => Tree.treeOf(App.state.peek(), id), texty = TEXT_LABELS.has(label) && label !== 'Format';
  if (scope.outputs) {
    for (const p of scope.outputs) tx.note(label, p, value, { view });
    if (texty) everyField(tx, c.scene(), scope, label, value);
  } else for (const m of marks) {
    if (m.type === 'box' || m.type === 'line') {
      tx.note(label, tree(m.record), value, { view });
      // As a shape's in PowerPoint: what was this box's own of a field goes with it.
      if (texty) ownFields(tx, m, label);
    }
    else if (isFoot(m)) refoot(tx, { ...footNote().format, [label]: value });
    else if (m.type === 'shape') tx.update(m.id, { format: { ...App.shown.peek().item(App.chart.peek(), m.id)[0]?.format, [label]: value } });
  }
}
// A field's own label, where a text is a field; its own look of a label, given by its entry's style or beside a group, as
// against one it takes from the box it's in.
const fieldEdge = it => !it.free && !it.blank ? App.state.peek()[it.id]?.edge ?? null : null;
const givenField = (it, label) => { const n = it.settings?.[label]?.note; return !!n && !Tree.idsIn(n.pattern).size && (!!n.param || (!Notes.isOption(n.pattern) && n.pattern.args?.length === 1)) ? n : null; };
// A text property given a group of boxes or lines is given every field they show, as a shape's is in PowerPoint: where
// a field's own style decides it in them (Jurisdictions), beside the group's outputs too, which is narrower. Given a style
// of one entry (Jurisdictions), it's every one of those texts: where a group's look of it decides one, beside that
// group's outputs too, so what's typed last is what they all have.
function everyField(tx, sc, scope, label, value) {
  const view = sc.view, N = App.notes.peek(), marks = [...scope.marks ?? marksOf(sc, scope)].map(id => sc.byId.get(id)).filter(Boolean);
  if (scope.swatch?.kind === 'text') {
    const edge = scope.outputs[0].args?.[0]?.edge, st = App.state.peek();
    if (edge === undefined) return;
    const over = new Map(N.notes(label).filter(n => n.view === view && n.param && Tree.same(n.param, edge)).map(n => [Tree.key(n.pattern), n.pattern]));
    for (const m of marks) for (const it of m.texts ?? []) {
      const n = it.settings?.[label]?.note;
      if (n && Tree.same(fieldEdge(it) ?? '', edge) && n.view === view && !Tree.idsIn(n.pattern).size && !givenField(it, label)) over.set(Tree.key(n.pattern), n.pattern);
    }
    for (const p of over.values()) tx.note(label, p, value, { view, param: edge });
    return;
  }
  const edges = new Map();
  for (const m of marks) for (const it of m.texts ?? []) { const e = fieldEdge(it); if (e && givenField(it, label)) edges.set(Tree.norm(e), e); }
  for (const p of scope.outputs) for (const e of edges.values()) tx.note(label, p, value, { view, param: e });
}
// What's this box's own alone of a label, of the fields in it: at their records or beside it.
function ownFields(tx, m, label) {
  const view = Canvas.active.peek().scene().view, st = App.state.peek(), N = App.notes.peek(), t = Tree.treeOf(st, m.record);
  for (const id of inMark(st, m)) if (id !== m.record) { const f = Tree.treeOf(st, id), r = f && N.resolve(label, f, view); if (r?.note.view === view && Tree.idsIn(r.note.pattern).size) tx.note(label, r.note.pattern, undefined, { view, param: r.note.param }); }
  for (const [e, r] of Object.entries(N.fields(t, view, label))) if (r.note.view === view && Tree.idsIn(r.note.pattern).size) tx.note(label, r.note.pattern, undefined, { view, param: e });
}
function apply(label, value) {
  const c = Canvas.active.peek();
  if (!c) return;
  preview();
  // A change for a group says at once what of it keeps its own, which the scope's menu then offers to clear; and
  // where a later style gives some of it otherwise, says which still decides, and offers to put this one after it,
  // the rows holding their order till that's asked. All text says what no longer takes it, with a way to make it do so.
  const scope = scopeOf(scopesOf(c).scopes), kept = keeping(c, scope, [label]), first = firstFor(c, scope, label, value), under = scope.root ? narrower(c.scene(), label, value) : null;
  const says = [kept.length && `${keepers(kept)} ${kept.length > 1 ? 'keep their' : 'keeps its'} own`, first.say, under?.say].filter(Boolean);
  // (A text property goes to every field, so to more notes than one: said as the one act it is.)
  const inView = `${Time.looked(label, value, scope.caption)} in ${scope.root ? lookTaker(c.scene().view) : App.notes.peek().nameOf(App.state.peek(), c.scene().view)}`, oneAct = TEXT_LABELS.has(label) && (!!scope.outputs || !!scope.root) && !fieldOf(c);
  // (The footer's the chart's, on every page.)
  const marks = scopesOf(c).marks, ofFoot = !!marks.length && marks.every(isFoot) && Time.looked(label, value, 'the footer');
  App.change(tx => { write(tx, c, label, value); if (oneAct) tx.says(inView); else if (ofFoot) tx.says(ofFoot); }, { say: says.length ? `${Time.looked(label, value, scope.caption)}; ${says.join('; ')}` : scope.root ? inView : ofFoot || null,
    go: () => first.also ? [first.offer, () => App.change(first.also, { dated: false, say: first.done })] : under?.clear ?? null });
  fade();
  // A size the chart can't hold is said, never left to be seen.
  const short = label === 'Size' && (App.scene.peek()?.page.short ?? []);
  if (short?.length) Shell.toast(Scene.says(App.scene.peek()).filter(t => / print at /.test(t)).join('; '), { undo: () => Shell.parts.peek().undo?.undo() });
  // Keys go back to the chart, so the next change can be typed.
  requestAnimationFrame(() => c.root.focus({ preventScroll: true }));
}
// Several settings as one change.
function applyAll(pairs) {
  const c = Canvas.active.peek();
  if (!c) return;
  preview();
  App.change(tx => pairs.forEach(([l, v]) => write(tx, c, l, v)));
  fade();
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
  if (label === 'Tidy for every date') return c.restyle(c.tidiedEvery(), { moves: true });
  c.restyle(trying(c, label, value), label === 'Size' || scopeOf(scopesOf(c).scopes)?.root ? { moves: true } : undefined);
}
// What keeps its own font or size under All text, a value going there: the styles, boxes and page's own texts a narrower
// note gives it to. → { say, clear: [label, run] }, or null where it's all of it.
function narrower(sc, label, value) {
  const N = App.notes.peek(), rows = chartRows(), notes = new Map(), shapes = [], given = v => label === 'Size' ? Math.abs(v * (sc.page.scale ?? 1) - value) > 0.01 : v !== value;
  for (const m of sc.marks) for (const it of [...m.texts ?? [], ...(m.caption ? [m.caption] : [])]) { const n = it.settings?.[label]?.note; if (n?.view === sc.view && given(it.look[label])) notes.set(n.note, n); }
  for (const r of rows) if ('shape' in r && r.view === sc.view && r.format?.[label] !== undefined && r.format[label] !== value) shapes.push(r);
  const foot = footNote().format?.[label];
  if (!notes.size && !shapes.length && (foot === undefined || foot === value)) return null;
  const styled = [...notes.values()], groups = Scene.groupsOf(N, sc.view), named = [...new Set(styled.filter(n => !Tree.idsIn(n.pattern).size).map(n => groups.find(g => g.outputs.some(p => Tree.key(p) === Tree.key(Tree.bare(n.pattern)) || Tree.key(p) === Tree.key(n.pattern)))?.caption ?? N.name(n.pattern)))];
  const own = styled.filter(n => Tree.idsIn(n.pattern).size).length, those = [...named, ...(own ? [`${own} ${own === 1 ? 'box' : 'boxes'} of their own`] : []), ...shapes.map(r => r.role ?? (r.geometry === 'legend' ? 'the Key' : 'a text box')), ...(foot !== undefined && foot !== value ? ['the footer'] : [])];
  const more = those.length > 4 ? `${those.slice(0, 4).join(', ')} and ${those.length - 4} more` : listed(those);
  const noun = { Font: 'font', Size: 'size' }[label];
  return { say: `${more} ${those.length === 1 && !own && !/s$/.test(those[0]) ? 'keeps its' : 'keep their'} own ${noun}`,
    clear: [`Make it all ${label === 'Size' ? `${value} pt` : value}`, () => App.change(tx => { styled.forEach(n => tx.remove(n.note)); shapes.forEach(r => { const { [label]: _, ...format } = r.format; tx.update(r.shape, { format }); }); if (foot !== undefined) { const { [label]: _, ...format } = footNote().format; refoot(tx, format); } }, { dated: false, say: `Took the narrower ${noun}s off ${App.notes.peek().nameOf(App.state.peek(), sc.view)}` })] };
}
// The chart with a change written on its rows, uncommitted; `more`, what else the change writes.
function trying(c, label, value, more) {
  const wb = App.shown.peek(), same = (r, l, k, view, param) => 'note' in r && r.label === l && (r.view ?? null) === (view ?? null) && (r.param ?? null) === (param ?? null) && Tree.key(r.pattern) === k;
  let rows = wb.rows(App.chart.peek());
  const tx = {
    note(l, pattern, v, { view, param } = {}) {
      const k = Tree.key(pattern), id = `·tried${++n}`;
      rows = rows.filter(r => !same(r, l, k, view, param));
      if (v !== undefined && v !== null) rows.push({ id, note: id, label: l, pattern, ...(view && { view }), ...(param && { param }), value: v });
    },
    update(id, changes) { rows = rows.map(r => r.shape === id ? { ...r, ...changes } : r); },
  };
  write(tx, c, label, value);
  more?.(tx);
  const notes = Notes.index(rows.filter(r => 'note' in r));
  return { ...wb, rows: () => rows, notes: () => notes };
}
// Where a later style gives some of a group's marks otherwise (Funds' fill over the limited partnerships'), it's said which
// still decides; and where putting the group's style after it would change nothing else drawn, that's offered, as Styles'
// own drag does it: the rows hold their order till it's asked. Worked out once for each scene, scope and value: { say,
// also(tx), offer, done }. It reads only the marks' looks, as the notes give them (Scene.looks), never laying the chart out.
const firsts = new WeakMap();
function firstFor(c, scope, label, value) {
  const sc = c?.scene();
  if (!sc || !scope?.outputs || (TEXT_LABELS.has(label) && label !== 'Format' && fieldOf(c))) return {};
  const memo = firsts.get(sc) ?? firsts.set(sc, new Map()).get(sc), k = JSON.stringify([scope.key, label, value]);
  if (memo.has(k)) return memo.get(k);
  const view = sc.view, N = App.notes.peek(), all = N.styles(view), groups = Scene.groupsOf(N, view), same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const sceneOf = wb => Scene.looks(wb, App.chart.peek(), view, sc.day, { state: App.state.peek(), computed: App.computed.peek() });
  const ids = [...marksOf(sc, scope)], one = sceneOf(trying(c, label, value)), got = (s, id) => s.byId.get(id)?.settings?.[label];
  const masked = ids.filter(id => got(one, id) && !same(got(one, id).value, value));
  const mine = new Set(scope.outputs.map(p => Tree.key(Tree.bare(p)))), at = new Map(all.map((s, i) => [s.key, i]));
  const by = new Set(masked.map(id => got(one, id).note).filter(n => n?.view === view && !Tree.idsIn(n.pattern).size).map(n => Tree.key(Tree.bare(n.pattern))).filter(k => at.has(k) && !mine.has(k)));
  let out = {};
  if (masked.length && by.size) {
    const last = Math.max(...[...by].map(k => at.get(k))), moved = [...all.filter((s, i) => !mine.has(s.key) && i <= last), ...all.filter(s => mine.has(s.key)), ...all.filter((s, i) => !mine.has(s.key) && i > last)];
    const also = tx => moved.forEach((s, i) => s.order !== i + 1 && tx.note('Order', s.pattern, i + 1, { view }));
    const two = sceneOf(trying(c, label, value, also));
    const clean = ids.every(id => !got(two, id) || same(got(two, id).value, value))
      && two.marks.every(m => { const o = one.byId.get(m.id); return !o?.settings || Object.entries(m.settings ?? {}).every(([l, s]) => l === label || same(s.value, o.settings[l]?.value)); });
    const nameOf = k => groups.find(g => g.style === k)?.name ?? groups.find(g => g.style === k)?.caption, mineName = nameOf([...mine][0]);
    const theirs = listed([...by].map(nameOf).filter(Boolean));
    const say = `${theirs || 'another style'} still ${by.size > 1 ? 'decide' : 'decides'} it for ${masked.length} of them`;
    out = clean && mineName && theirs ? { also, say, offer: `Put ${mineName} after ${theirs}`, done: `${mineName} now comes after ${theirs} in Styles` } : { say };
  }
  memo.set(k, out);
  return out;
}
// A setting's value on the selection: its first mark's, or its first text's for a text property (a frame's,
// its caption's).
function value(label) {
  const m = current?.marks[0];
  if (current?.scope?.root) { const v = App.notes.peek().resolve(label, viewSelf(current.canvas.scene()))?.value; return label === 'Size' && v != null ? Scene.fromSlide(page(), v) : v ?? (label === 'Font' ? Scene.DEFAULTS.text.Font : undefined); }
  if (current?.aim && !m) return current.aim.swatch[label];
  if (!m) return undefined;
  // A Key row's look is its swatch's, and its text what the marks it stands for print at.
  if (current.row) return (TEXT_LABELS.has(label) ? scopeTexts()[0]?.look?.[label] : undefined) ?? current.row.swatch[label] ?? current.row.caption.look[label];
  // A frame is the style's, drawn round the boxes it reaches.
  if (label === 'Frame') {
    const outs = new Set((current.scope?.outputs ?? []).map(p => Tree.key(p)));
    return current.canvas.scene().marks.find(f => f.type === 'frame' && outs.has(Tree.key(f.output)))?.kind ?? 'none';
  }
  const text = current.field?.it ?? scopeTexts()[0] ?? m.texts?.[0] ?? m.caption;
  if (TEXT_LABELS.has(label) && text) return text.look?.[label] ?? text.settings?.[label]?.value;
  return m.settings?.[label]?.value ?? m.look?.[label];
}
// The marks the scope reaches, and of them the texts a text property of it would change: with a field selected, that
// field, in the box selected or in each box of the group chosen; for a style of one entry (Jurisdictions), those; else
// every text of them.
const scopeMarks = () => { const sc = current.canvas.scene(), scope = current.scope; return scope?.own || !scope?.marks || scope.key === 'frame' ? current.marks : [...scope.marks].map(id => sc.byId.get(id)).filter(Boolean); };
// What the marks the scope reaches don't share of a property of their own, so nothing reads as all of them: each value and
// how many, or null. Only where it goes to more than one, a box's or a line's.
function differing(label) {
  if (!current?.marks.length || TEXT_LABELS.has(label)) return null;
  const by = new Map();
  for (const m of scopeMarks()) if (m.type === 'box' || m.type === 'line') { const v = m.settings?.[label]?.value; if (v !== undefined) { const k = JSON.stringify(v); by.set(k, { v, n: (by.get(k)?.n ?? 0) + 1 }); } }
  return by.size > 1 ? [...by.values()].sort((a, b) => b.n - a.n) : null;
}
const ARROWS = { none: 'none', end: 'at the end', start: 'at the start', both: 'at both ends' };
const saidOf = (label, v) => label === 'Weight' ? `${+Scene.toSlide(page(), v).toFixed(2)} pt` : label === 'Arrow' ? ARROWS[v] ?? v : label === 'Dash' ? (DASH_NAMES.find(([d]) => d === v)?.[1] ?? v) : typeof v === 'string' ? (colorName(v) ?? v.toUpperCase()) : String(v);
// Those values in words: "These differ: 3 at the end, 21 none".
const differs = label => { const d = differing(label); return d && `These differ: ${d.slice(0, 3).map(x => `${x.n} ${saidOf(label, x.v)}`).join(', ')}${d.length > 3 ? ` and ${d.length - 3} more` : ''}`; };
function scopeTexts() {
  if (current.texts) return current.texts;
  const f = current.field, scope = current.scope, st = App.state.peek(), only = scope?.swatch?.kind === 'text' ? scope.outputs : null;
  return current.texts = scopeMarks().flatMap(m => m.texts ?? (m.caption ? [m.caption] : []))
    .filter(it => !it.blank && (f ? it === f.it || (!f.it.free && edgeOf(it) === edgeOf(f.it)) : !only || only.some(p => Tree.fits(st, it.id, p))));
}
// The field selected in the one box selected, if any (the canvas's field()).
const fieldOf = c => { const f = c.field?.(), ks = c.keys(); return f?.it && ks.length === 1 && Canvas.keyParts(ks[0])[0] === f.m.id ? f : null; };
// A toggle's state (bold, italic, underline, strikethrough), as Office's: pressed only where every text it would
// change has it, so a box whose name is bold and whose jurisdiction isn't shows Bold unpressed, and pressing it sets
// them all. A Key row is its swatch's and caption's.
const edgeOf = it => it.free ? `text@${it.free.note}` : Tree.norm(App.state.peek()[it.id]?.edge ?? it.blank?.edge ?? '');
function pressed(label) {
  if (!current?.marks.length) return current?.aim ? !!value(label) : false;
  if (current.row) return !!value(label);
  const texts = scopeTexts();
  return texts.length ? texts.every(it => !!it.look?.[label]) : !!value(label);
}

// ---- The bar ----

// Its glyphs: Lucide's icons (Shell.icon), and a color's bar under the paint bucket, the pen and the A, as
// PowerPoint draws them; the A's own baseline is its bar.
const bar = c => html`<i style=${`background:${!c || c === 'none' ? 'transparent' : c}`} />`;
const glyph = {
  fill: c => html`<span class="well">${Shell.icon('fill')}${bar(c)}</span>`,
  outline: c => html`<span class="well">${Shell.icon('outline')}${bar(c)}</span>`,
  color: c => html`<span class="well a"><svg class="i lu" viewBox="0 0 24 24" aria-hidden="true">${(typeof lucide === 'undefined' ? [] : lucide.Baseline[2].slice(1)).map(([t, a]) => h(t, a))}<path class="edge" d="M2.5 21.5h19" /><path d="M3 21.5h18" stroke=${c} stroke-width="4" stroke-linecap="butt" /></svg></span>`,
};
const weightGlyph = w => html`<svg class="ln" viewBox="0 0 40 10"><path d="M2 5h36" stroke-width=${Math.max(0.5, Math.min(6, w * 1.333))} /></svg>`;
const lineGlyph = d => html`<svg class="ln" viewBox="0 0 40 10"><path d="M2 5h36" stroke-width="1.5" stroke-dasharray=${Scene.dash(d, 1)} stroke-linecap=${d === 'dotted' ? 'round' : 'butt'} /></svg>`;
const arrowGlyph = a => html`<svg class="ln" viewBox="0 0 40 10"><path d="M4 5h32" stroke-width="1.3" />${a === 'end' || a === 'both' ? html`<path d="M31 1.5l5 3.5-5 3.5" stroke-width="1.3" />` : null}${a === 'start' || a === 'both' ? html`<path d="M9 1.5 4 5l5 3.5" stroke-width="1.3" />` : null}</svg>`;
// A head of each style, at a line's end.
const HEAD_PATHS = { triangle: 'M28 1l10 4-10 4z', stealth: 'M27 1l11 4-11 4 3-4z', open: 'M28 1l10 4-10 4', oval: 'M28 5a5 4 0 1 0 10 0a5 4 0 1 0-10 0z', diamond: 'M28 5l5-4 5 4-5 4z' };
const headGlyph = t => html`<svg class="ln" viewBox="0 0 40 10"><path d="M2 5h${t === 'none' ? 36 : 28}" stroke-width="1.3" />${HEAD_PATHS[t] ? html`<path d=${HEAD_PATHS[t]} stroke-width="1.1" fill=${t === 'open' ? 'none' : 'currentColor'} />` : null}</svg>`;
const frameGlyph = f => html`<svg class="ln" viewBox="0 0 40 14"><path d=${f === 'bracket' ? 'M2 13V3h36v10' : 'M2.5 1.5h35v11h-35z'} stroke-width="1.2" stroke-dasharray=${f === 'dashed' ? '4 3' : null} /></svg>`;
const shapeGlyph = (g, corner) => html`<svg class="glyph" viewBox="-1 -1 20 16"><path d=${Scene.path(g, 18, 14, corner)} /></svg>`;
// A shadow, thrown the way it says.
const shadowGlyph = (dx, dy) => html`<svg class="glyph sh" viewBox="-4 -4 26 22"><path d=${`M${1 + dx * 3} ${1 + dy * 3}h16v12h-16z`} class="shade" /><path d="M1 1h16v12H1z" /></svg>`;
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
// A number typed, within its bounds, its unit after it: drawn on the chart as it's typed, made with Enter or on leaving,
// the arrows stepping it, Esc putting it back. `put`, what's made of it; `tries`, what's drawn; `style`, as a field of a popover.
function Typed({ label, v, unit = '', min = 0, max = 1584, step = 1, put, tries, disabled }) {
  const read = el => { const x = parseFloat(el.value); return Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : null; };
  const done = el => { const x = read(el); if (x !== null && x !== v) put(x); else el.value = String(v); };
  return html`<span class="amount"><input value=${String(v)} aria-label=${label} disabled=${disabled} spellcheck="false" autocomplete="off" inputmode="decimal" onFocus=${e => e.currentTarget.select()}
    onInput=${e => { const x = read(e.currentTarget); if (x !== null) tries?.(x); }} onBlur=${e => { tries?.(null); done(e.currentTarget); }}
    onKeyDown=${e => { const el = e.currentTarget;
      if (e.key === 'Enter') { e.preventDefault(); tries?.(null); done(el); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); tries?.(null); el.value = String(v); }
      else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); const x = Math.min(max, Math.max(min, (read(el) ?? v) + (e.key === 'ArrowUp' ? step : -step))); el.value = String(+x.toFixed(2)); tries?.(x); } }} /><span class="unit">${unit}</span></span>`;
}
// A setting's value from 0 to `max` by a slider or typed, drawn on the chart as it's dragged and made as it's let go.
function Slider({ label, k, v, max = 100, step = 1, unit = '%', disabled }) {
  const read = e => Math.round(+e.currentTarget.value / step) * step;
  return html`<label class="menu-item slider"><span class="label">${label}</span>
    <input type="range" min="0" max=${max} step=${step} value=${v} aria-label=${label} disabled=${disabled} onInput=${e => { e.currentTarget.nextElementSibling.firstChild.value = String(read(e)); preview(k, read(e)); }}
      onChange=${e => apply(k, read(e))} /><${Typed} label=${label} v=${v} unit=${unit} max=${max} step=${step} disabled=${disabled} put=${x => apply(k, x)} tries=${x => x === null ? preview() : preview(k, x)} /></label>`;
}
// PowerPoint's palette: the theme's colors, its standard colors and the chart's own; then More colors, any color
// by its hex, drawn as it's typed and made with Enter; then what else the popover sets (a fill's Transparency, an
// outline's Weight and Dashes); and last No fill (or outline).
const NONE = { Fill: 'No fill', Outline: 'No outline' };
function Palette({ label, none, close, children }) {
  const mixed = differs(label), v = mixed ? '' : String(value(label)).toLowerCase(), own = chartColors();
  const swatch = (c, name) => html`<button style=${`background-color:${c}`} aria-pressed=${v === c} autofocus=${v === c} aria-label=${name} data-tip=${name} ...${choice(label, c, close)} />`;
  // Off the swatches, the chart is drawn in the color typed, while it's being typed.
  const rest = el => { const f = el.querySelector('.hex > input'), c = f === document.activeElement && hexOf(f.value); c ? preview(label, c) : preview(); };
  const typed = e => { const f = e.currentTarget; f.toggleAttribute('aria-invalid', !!f.value.trim() && !hexOf(f.value)); rest(f.closest('.palette')); };
  const entered = e => { const c = e.key === 'Enter' && hexOf(e.currentTarget.value); if (c) { e.preventDefault(); e.stopPropagation(); close?.(); apply(label, c); } };
  // The chart's own colors have their row from the start, so nothing moves down as the first comes.
  return html`<div class="palette" onPointerLeave=${e => rest(e.currentTarget)}>${THEME.map((c, i) => swatch(c, THEME_NAMES[i]))}<i />${STANDARD.map((c, i) => swatch(c, STANDARD_NAMES[i]))}
    <i />${own.map(c => swatch(c, c.toUpperCase()))}${Array.from({ length: 10 - own.length }, () => html`<span class="room" />`)}
    <div class="more">
      ${mixed ? html`<div class="menu-head">${mixed}</div>` : null}
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
const whole = e => { const b = e.currentTarget, t = b.firstElementChild; b.dataset.tip = t && (t.scrollWidth > t.clientWidth || !t.offsetWidth) ? t.textContent : 'All like it'; };

// ---- The scope, on the chart ----

// A group chosen: what the next change goes to, cued on the chart; the selection itself clears the cue. The group
// last chosen for a selection is the one its right part names again.
const liked = signal(null);
function choose(x) { chosen.value = x?.own ? null : x?.key ?? null; if (chosen.peek()) liked.value = chosen.peek(); wake(); }
// A Styles row aimed at from the panel, or `null`: the ribbon's scope, what it reaches lit, till it's aimed at again,
// Esc, a press on the chart or another selection. Another row's click moves the aim.
let unaim = null;
function aim(g) {
  unaim?.(); unaim = null;
  aimed.value = g ? { style: g.style, key: Tree.key(g.outputs[0]), outputs: g.outputs, caption: g.caption, swatch: g.swatch, name: g.name } : null;
  if (g) unaim = Shell.layer(() => aim(null));
  wake();
}
const aimedAt = g => !!aimed.value && aimed.value.style === g.style && g.outputs.some(p => Tree.key(p) === aimed.value.key);
// The two parts: the selection, and the group all like it names (the one last chosen, or the narrowest).
const likeOf = s => { const sc = scopeOf(s.scopes); return !sc || sc.root ? null : !sc.own ? sc : s.scopes.find(x => x.key === liked.peek()) ?? s.narrowest; };
// Ctrl+Shift+A: from one part to the other.
function toggle() {
  const c = Canvas.active.peek();
  if (!c?.scene()) return false;
  const s = scopesOf(c), sc = scopeOf(s.scopes), like = likeOf(s);
  if (!sc || !like || !s.scopes.some(x => x.own)) return false;
  choose(sc.own ? like : s.scopes.find(x => x.own));
}
// The cue: the group pointed at, for as long as it's pointed at; else the group chosen or aimed at, if any. (A Key row
// or a frame is lit by the canvas as it is.) After a change it fades, over two seconds, so the change can be seen
// without clicking away, till a pointer on the scope list, or another scope, brings it back.
let faded = false, fading = 0;
function cue(x) {
  const c = Canvas.active.peek();
  if (!c?.scene()) return;
  const s = x === undefined ? (faded ? null : (() => { const all = scopesOf(c), sc = scopeOf(all.scopes); return (all.aim || all.scopes.some(o => o.own)) && !sc?.own ? sc : null; })()) : x;
  c.cue(s?.marks ? [...s.marks] : null);
}
function fade() {
  const c = Canvas.active.peek();
  if (!c || faded) return;
  faded = true;
  c.root.classList.add('cue-fading');
  clearTimeout(fading);
  fading = setTimeout(() => c.root.classList.remove('cue-fading'), 2000);
  cue();
}
function wake() { faded = false; clearTimeout(fading); Canvas.active.peek()?.root.classList.remove('cue-fading'); cue(); }

// ---- The popovers ----

// Fill: the palette, then how transparent it is.
const FillPop = ({ close }) => html`<${Palette} label="Fill" none close=${close}>
  <${Slider} label="Transparency" k="Transparency" v=${Math.round(value('Transparency') ?? 0)} /></${Palette}>`;
// Outline, as PowerPoint's Shape Outline: the palette, then its Weight ▸ and Dashes ▸, a line's Arrows ▸ and Route
// ▸, a group's Frame ▸, and No outline.
const DASH_NAMES = [['solid', 'Solid'], ['dotted', 'Round dot'], ['square-dot', 'Square dot'], ['dashed', 'Dash'], ['dash-dot', 'Dash dot'], ['long-dash', 'Long dash'], ['long-dash-dot', 'Long dash dot'], ['long-dash-dot-dot', 'Long dash dot dot']];
const HEAD_NAMES = [['triangle', 'Triangle'], ['stealth', 'Stealth'], ['open', 'Open'], ['oval', 'Oval'], ['diamond', 'Diamond']], SIZE_NAMES = [['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']];
// A line's arrows, as PowerPoint's: whether each end has one, and at each end its style and size. A style or a size picked
// for an end gives that end its head, one change.
function arrowItems() {
  // What a group is given, where it's Auto: each line takes a head by which way it runs, so none of the others is what it says.
  const N = App.notes.peek(), view = current?.canvas.scene().view, auto = !!current?.scope?.outputs?.some(p => N.resolve('Arrow', p, view)?.value === 'auto') || current?.aim?.swatch?.Arrow === 'auto', mixed = differs('Arrow');
  const now = mixed || auto ? null : value('Arrow') === 'auto' ? 'none' : value('Arrow'), heads = value('Arrowhead') ?? {}, has = end => now === end || now === 'both';
  const withEnd = end => has(end) ? now : now === 'none' || !now ? end : 'both';
  const end = (key, name, field, list, glyphOf) => ({ label: name, items: list.map(([v, text]) => {
    const next = { ...heads, [key]: { type: 'triangle', size: 'small', ...heads[key], [field]: v } };
    return { label: text, checked: has(key) && Scene.headOf({ Arrowhead: heads }, key)[field] === v, ...(glyphOf && { glyph: glyphOf(v) }), run: () => applyAll([['Arrowhead', next], ['Arrow', withEnd(key)]]), point: on => on ? preview('Arrowhead', next) : preview() };
  }) });
  return [...(mixed ? [{ head: mixed }] : []), ...choices('Arrow', [['none', 'None'], ['end', 'At the end'], ['start', 'At the start'], ['both', 'At both ends']], now, arrowGlyph),
    ...(current?.scope?.outputs ? choices('Arrow', [['auto', 'Auto, where it doesn’t run down']], auto ? 'auto' : null) : []), '-',
    end('end', 'End style', 'type', HEAD_NAMES, headGlyph), end('end', 'End size', 'size', SIZE_NAMES), end('start', 'Start style', 'type', HEAD_NAMES, headGlyph), end('start', 'Start size', 'size', SIZE_NAMES)];
}
function OutlinePop({ close, of }) {
  const ms = current?.marks ?? [], lines = ms.some(m => m.type === 'line' || m.geometry === 'line'), framed = current?.scope?.outputs && ms.some(m => m.type === 'box');
  const mixed = differs('Weight'), now = mixed ? '' : +Scene.toSlide(page(), value('Weight') ?? 0.75).toFixed(2), weight = mixed ? null : WEIGHTS.find(w => Math.abs(now - w) < 0.01);
  return html`<${Palette} label="Outline" none close=${close}>
    <div class="menu-sep" />
    ${mixed ? html`<div class="menu-head">${mixed}</div>` : null}
    <div class="menu-item withfield"><${Sub} label="Weight" of=${of} items=${() => choices('Weight', WEIGHTS.map(w => [w, `${w} pt`]), weight, weightGlyph)} /><${Typed} label="Weight" v=${now} unit="pt" min=${0.25} step=${0.25} put=${x => apply('Weight', x)} tries=${x => x === null ? preview() : preview('Weight', x)} /></div>
    <${Sub} label="Dashes" of=${of} items=${() => { const d = differs('Dash'); return [...(d ? [{ head: d }] : []), ...choices('Dash', DASH_NAMES, d ? null : value('Dash'), lineGlyph)]; }} />
    ${lines ? html`<${Sub} label="Arrows" of=${of} items=${arrowItems} />
      <${Sub} label="Route" of=${of} items=${() => choices('Connector', [['elbow', 'Elbow'], ['straight', 'Straight']], value('Connector'))} />` : null}
    ${framed ? html`<${Sub} label="Frame" of=${of} items=${() => choices('Frame', [['none', 'None'], ['dashed', 'Dashed box'], ['solid', 'Box'], ['bracket', 'Bracket']], value('Frame') ?? 'none', frameGlyph)} />` : null}
    <div class="menu-sep" /></${Palette}>`;
}
// Shape: PowerPoint's basic shapes, each a preset of its in the deck, a rounded rectangle's Rounding, and its Shadow. It
// stays open as a shape is picked, so what goes with it is there to set.
const SHAPES = [['rect', 'Rectangle'], ['rounded', 'Rounded rectangle'], ['snip', 'Snip single corner'], ['snip2', 'Snip same side corners'], ['round1', 'Round single corner'], ['round2', 'Round same side corners'], ['plaque', 'Plaque'],
  ['oval', 'Oval'], ['triangle', 'Triangle'], ['rtriangle', 'Right triangle'], ['diamond', 'Diamond'], ['parallelogram', 'Parallelogram'], ['trapezoid', 'Trapezoid'], ['pentagon', 'Pentagon'],
  ['hexagon', 'Hexagon'], ['heptagon', 'Heptagon'], ['octagon', 'Octagon'], ['decagon', 'Decagon'], ['dodecagon', 'Dodecagon'], ['chevron', 'Chevron'], ['homeplate', 'Pentagon arrow'],
  ['arrow', 'Arrow'], ['cylinder', 'Cylinder'], ['cube', 'Cube'], ['folded', 'Folded corner']];
// PowerPoint's outer shadows, by which way each is thrown: its angle, clockwise from the right, and whether it has one; the middle, none, all round.
const THROWN = [[-1, -1, 225, 'Top left'], [0, -1, 270, 'Top'], [1, -1, 315, 'Top right'], [-1, 0, 180, 'Left'], [0, 0, null, 'Centered'], [1, 0, 0, 'Right'], [-1, 1, 135, 'Bottom left'], [0, 1, 90, 'Bottom'], [1, 1, 45, 'Bottom right']];
function ShadowPicker() {
  const v = value('Shadow'), o = Scene.shadowOf(v), base = o ?? Scene.shadowOf('soft'), set = changes => apply('Shadow', { ...base, ...changes }), tries = k => x => x === null ? preview() : preview('Shadow', { ...base, [k]: x });
  const same = t => !!o && (t[2] === null ? o.distance === 0 : o.distance > 0 && Math.abs(o.angle - t[2]) < 0.5);
  const preset = t => ({ ...base, distance: t[2] === null ? 0 : base.distance || 3, angle: t[2] ?? 0, ...(t[2] === null && { blur: 5 }) });
  const hex = o ? o.color.slice(1).toUpperCase() : '000000';
  return html`<div class="shadow">
    <div class="k">Shadow</div>
    <div class="throw" onPointerLeave=${() => preview()}>${THROWN.map(t => html`<button aria-label=${t[3]} data-tip=${t[3]} aria-pressed=${same(t)} onPointerEnter=${() => preview('Shadow', preset(t))} onClick=${() => apply('Shadow', preset(t))}>${shadowGlyph(t[0], t[1])}</button>`)}</div>
    <button class="menu-item noshadow" role="menuitemcheckbox" aria-checked=${!o} onPointerEnter=${() => preview('Shadow', 'none')} onPointerLeave=${() => preview()} onClick=${() => apply('Shadow', 'none')}><span class="label">No shadow</span>${!o ? Shell.icon('check') : null}</button>
    <label class="menu-item"><span class="label">Blur</span><${Typed} label="Blur" v=${base.blur} unit="pt" max=${100} put=${x => set({ blur: x })} tries=${tries('blur')} /></label>
    <label class="menu-item"><span class="label">Distance</span><${Typed} label="Distance" v=${base.distance} unit="pt" max=${200} put=${x => set({ distance: x })} tries=${tries('distance')} /></label>
    <label class="menu-item"><span class="label">Angle</span><${Typed} label="Angle" v=${base.angle} unit="°" max=${359} put=${x => set({ angle: x })} tries=${tries('angle')} /></label>
    <label class="menu-item"><span class="label">Color</span><span class="hex">#<input value=${hex} maxlength="7" spellcheck="false" autocomplete="off" aria-label="Shadow color" onFocus=${e => e.currentTarget.select()}
      onKeyDown=${e => { const c = e.key === 'Enter' && hexOf(e.currentTarget.value); if (c) { e.preventDefault(); set({ color: c }); } }} /></span></label>
    <label class="menu-item"><span class="label">Transparency</span><${Typed} label="Shadow transparency" v=${base.transparency} unit="%" max=${100} put=${x => set({ transparency: x })} tries=${tries('transparency')} /></label>
  </div>`;
}
// A popover that stays open as what it sets changes reads the scope as it now stands.
function readNow() {
  App.scene.value;
  const c = Canvas.active.peek();
  if (!c?.scene()) return;
  const s = scopesOf(c);
  current = { canvas: c, ...s, scope: scopeOf(s.scopes, chosen.peek()), field: fieldOf(c) };
}
function ShapePop() {
  readNow();
  const [picked, setPicked] = useState(null);
  const now = picked ?? value('Shape') ?? current?.marks[0]?.geometry ?? 'rect', rounded = now === 'rounded';
  return html`<div class="picker shape">
    <div class="shapes" onPointerLeave=${() => preview()}>${SHAPES.map(([g, name]) => html`<button aria-label=${name} data-tip=${name} aria-pressed=${now === g} onPointerEnter=${() => preview('Shape', g)} onClick=${() => { setPicked(g); apply('Shape', g); }}>${shapeGlyph(g)}</button>`)}</div>
    <${Slider} label="Rounding" k="Corner" v=${Math.round(value('Corner') ?? Scene.CORNER)} max="50" disabled=${!rounded} />
    <div class="menu-sep" />
    <${ShadowPicker} />
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
  if (typeof v === 'number' && (current?.marks.length || current?.scope?.root)) apply('Size', f(v));
}
// The size: a field that takes any size typed (11.5), made with Enter, Esc putting it back; and its list.
function SizeBox({ v, disabled, why }) {
  const back = el => { el.value = String(v); Canvas.active.peek()?.root.focus({ preventScroll: true }); };
  const keys = e => {
    const el = e.currentTarget;
    if (e.key === 'Enter') {
      e.preventDefault();
      const x = parseFloat(el.value.replace(/\s*pt$/i, ''));
      if (Number.isFinite(x) && x >= 1 && x <= 1584) { apply('Size', Math.round(x * 100) / 100); el.blur(); } else el.select();
    } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); back(el); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); resize(e.key === 'ArrowUp' ? grown : shrunk); }
  };
  return html`<span class=${'combo size' + (disabled ? ' off' : '')} data-tip=${why}>
    <input data-fb="size" value=${String(v)} disabled=${disabled} aria-label="Font size" spellcheck="false" autocomplete="off" inputmode="decimal"
      onFocus=${e => e.currentTarget.select()} onKeyDown=${keys} onBlur=${e => { e.currentTarget.value = String(v); }} />
    <button class="dd" data-fb="sizes" aria-label="Font sizes" disabled=${disabled} onClick=${e => offer(e.currentTarget, STEPS.slice(0, 15).map(z => ({ label: String(z), checked: v === z,
      run: () => apply('Size', z), tries: ['Size', z] })))} /></span>`;
}

// ---- The format painter, and Clear formatting ----

// The look a mark has: what it draws by, its box's or its line's, and its first text's; a weight as the slide has it,
// as the bar writes it. Never what it is or where, as PowerPoint's painter copies none of them: not its shape or its corners,
// its record's Format, its frame, its layer or its route.
const BOX_LOOK = ['Fill', 'Transparency', 'Outline', 'Weight', 'Dash', 'Shadow', 'Valign'];
const LINE_LOOK = ['Outline', 'Weight', 'Dash', 'Arrow', 'Arrowhead'];
const TEXT_LOOK = ['Font', 'Size', 'Bold', 'Italic', 'Underline', 'Strike', 'Color', 'Align', 'Spacing'];
const LOOK = new Set([...BOX_LOOK, ...LINE_LOOK, ...TEXT_LOOK]);
const kindOf = m => m.type === 'line' || m.geometry === 'line' ? 'line' : 'box';
const textValue = (it, l) => { const v = it?.look?.[l]; return l === 'Size' ? shown(v) : v; };
// The look of a mark, and with `only` (a text of a style of one entry) that text's alone: its first text's, and by its
// label each other field's that differs, so a look pasted reads as it did where it was copied (a name in 9, its
// jurisdiction in 7 and italic).
function lookOf(m, p = page(), only = null) {
  const first = only ?? m.texts?.[0] ?? m.caption, out = {};
  if (!only) for (const l of kindOf(m) === 'line' ? LINE_LOOK : BOX_LOOK) { const v = m.settings?.[l]?.value ?? m.look?.[l]; if (v !== undefined && v !== null) out[l] = l === 'Weight' ? +Scene.toSlide(p, v).toFixed(3) : v; }
  for (const l of TEXT_LOOK) { const v = textValue(first, l) ?? m.settings?.[l]?.value ?? m.look?.[l]; if (v !== undefined && v !== null) out[l] = v; }
  if (!only) for (const it of m.texts ?? []) {
    const e = it !== first && !it.blank && fieldEdge(it), own = e && Object.fromEntries(TEXT_LOOK.map(l => [l, textValue(it, l)]).filter(([l, v]) => v !== undefined && v !== null && v !== out[l]));
    if (e && Object.keys(own).length) (out.fields ??= {})[Tree.norm(e)] = own;
  }
  return out;
}
// The painter: the look copied, `once` for one paste or until Esc, and whether it goes to all like what it's pasted on.
const painter = signal(null);
let copied = null, unlayer = null;
// From a style of one entry, that text's look alone; from a Styles row none of whose marks is drawn, its swatch.
function copyLook() {
  const m = current?.marks.find(x => x.type === 'box' || x.type === 'line' || x.type === 'shape');
  if (!m && current?.aim) { copied = { look: Object.fromEntries(Object.entries(current.aim.swatch).filter(([l]) => LOOK.has(l))), from: current.aim.caption }; return true; }
  if (!m) return false;
  const textStyle = current.scope?.swatch?.kind === 'text';
  copied = { look: lookOf(m, page(), textStyle ? scopeTexts()[0] : null), from: current.aim?.caption ?? (m.record ? App.notes.peek().nameOf(App.state.peek(), m.record) : null) };
  return true;
}
function arm(once) {
  if (!copyLook()) return;
  unlayer?.();
  unlayer = Shell.layer(disarm);
  painter.value = { once, all: !!chosen.peek() };
}
function disarm() { unlayer?.(); unlayer = null; painter.value = null; dropper.value = null; chipEl?.remove(); chipEl = null; }
// The eyedropper, from a palette: it gives the color it takes to the scope, as the palette would. The browser's own
// where it has one, a magnifier and the true color on the screen, from anything there, the cue taken off first so it
// reads the chart as drawn. Where it hasn't, the next click takes the color under it on the chart, as drawn, whatever
// dims it, a swatch and its hex under the pointer as it moves; a click on nothing it can read says so, and it stays
// armed till Esc.
const dropper = signal(null);
let chipEl = null;
function drop(label) {
  if (typeof window.EyeDropper !== 'function') return armDropper(label);
  Canvas.active.peek()?.cue(null);
  new window.EyeDropper().open().then(r => { const c = hexOf(r.sRGBHex); wake(); if (c) apply(label, c); },
    e => { wake(); if (e?.name === 'AbortError') Shell.toast('Put the eyedropper down'); else armDropper(label); });
}
function armDropper(label) { unlayer?.(); unlayer = Shell.layer(disarm); painter.value = null; dropper.value = { label }; }
// The color drawn at what's under the pointer: an element's own paint, a text's fill, a shape's fill or else its stroke,
// a line's stroke, a picture's pixel; null off the chart, or where nothing's painted.
const rgbHex = s => { const m = /^rgba?\((\d+)[, ]+(\d+)[, ]+(\d+)(?:[,/ ]+([\d.]+))?\)$/.exec(s ?? ''); return !m || m[4] === '0' ? null : `#${[m[1], m[2], m[3]].map(v => (+v).toString(16).padStart(2, '0')).join('')}`; };
function colorAt(el, e) {
  const c = Canvas.active.peek();
  if (!c?.root.contains(el) || !el.closest?.('.dc-graph')) return null;
  if (el.tagName === 'image') {
    try { const r = el.getBoundingClientRect(), img = Object.assign(new Image(), { src: el.getAttribute('href') ?? el.getAttribute('xlink:href') }), cv = Object.assign(document.createElement('canvas'), { width: 1, height: 1 }), g = cv.getContext('2d');
      g.drawImage(img, (e.clientX - r.left) / r.width * img.naturalWidth, (e.clientY - r.top) / r.height * img.naturalHeight, 1, 1, 0, 0, 1, 1); const [x, y, z, a] = g.getImageData(0, 0, 1, 1).data; return a ? rgbHex(`rgb(${x}, ${y}, ${z})`) : null; } catch { return null; }
  }
  if (!/^(path|rect|text|tspan|ellipse|circle|polygon|polyline)$/.test(el.tagName) || !(el.closest('[data-cell-id]') || el.classList.contains('dc-sheet'))) return null;
  const s = getComputedStyle(el), own = rgbHex(s.fill) ?? rgbHex(s.stroke);
  if (own) return own;
  // A line's wide, clear stroke, for clicking: the line it's for.
  const m = c.scene()?.byId.get((el.closest('[data-cell-id]')?.getAttribute('data-cell-id') ?? '').replace(/·label$/, ''));
  return hexOf(m?.settings?.Outline?.value);
}
function dropMove(e) {
  if (!dropper.peek()) return;
  chipEl ??= document.body.appendChild(Object.assign(document.createElement('div'), { className: 'dc-dropper' }));
  const c = colorAt(document.elementFromPoint(e.clientX, e.clientY) ?? e.target, e);
  chipEl.hidden = !c;
  if (c) { chipEl.style.translate = `${e.clientX + 14}px ${e.clientY + 18}px`; chipEl.innerHTML = `<i style="background:${c}"></i>${c.slice(1).toUpperCase()}`; }
}
// The look pasted on the selection, at its scope, one thing either way: for the selection, at its record's own tree in
// the view (a free shape's, in its row); for a group, at each of its outputs. What it says of the mark, of each property
// some mark there doesn't take so; of its texts, at that pattern and beside it for each field there, the look's own for
// that field or else its first text's, so every field ends as the look has it, whatever else has decided it. On a style
// of one entry (Jurisdictions), its first text's, as the bar's own change goes. One change.
function pasteLook(look = copied?.look) {
  const c = Canvas.active.peek();
  if (!look || !c?.scene() || App.readOnly.peek()) return false;
  const s = scopesOf(c), scope = scopeOf(s.scopes), sc = c.scene(), view = sc.view, st = App.state.peek();
  if (!scope || scope.root) return false;
  const textStyle = scope.swatch?.kind === 'text', marks = scope.own ? s.marks : [...scope.marks].map(id => sc.byId.get(id)).filter(Boolean);
  const markLabels = m => textStyle ? [] : (kindOf(m) === 'line' ? LINE_LOOK : BOX_LOOK).filter(l => l in look), texts = m => (m.texts ?? (m.caption ? [m.caption] : [])).filter(it => !it.blank);
  const onlyTexts = textStyle ? (it => scope.outputs.some(p => Tree.fits(st, it.id, p))) : () => true;
  const wanted = (it, l) => (textStyle ? null : look.fields?.[Tree.norm(fieldEdge(it) ?? '')]?.[l]) ?? look[l];
  const markDiffers = (m, l) => JSON.stringify(lookOf(m)[l]) !== JSON.stringify(look[l]), textDiffers = (m, l) => texts(m).filter(onlyTexts).some(it => JSON.stringify(textValue(it, l)) !== JSON.stringify(wanted(it, l)));
  const textLabels = TEXT_LOOK.filter(l => l in look);
  // What goes to a pattern, for the marks it reaches.
  const give = (tx, pattern, ms) => {
    for (const l of new Set(ms.flatMap(m => markLabels(m).filter(k => markDiffers(m, k))))) tx.note(l, pattern, look[l], { view });
    for (const l of textLabels) if (ms.some(m => textDiffers(m, l))) {
      if (scope.own) ms.forEach(m => ownFields(tx, m, l));
      tx.note(l, pattern, look[l], { view });
      if (!textStyle) for (const e of new Map(ms.flatMap(m => texts(m)).map(it => [Tree.norm(fieldEdge(it) ?? ''), it])).values()) if (fieldEdge(e)) tx.note(l, pattern, wanted(e, l), { view, param: fieldEdge(e) });
    }
  };
  if (!marks.some(m => markLabels(m).some(l => markDiffers(m, l)) || textLabels.some(l => textDiffers(m, l))) && !s.aim) { Shell.toast('Already has that look'); return true; }
  const said = `Pasted ${copied?.from ? `the look of ${copied.from}` : 'a look'} on ${scope.own ? (marks.length === 1 && marks[0].record ? App.notes.peek().nameOf(st, marks[0].record) : named(c, scope).replace(/^This|^These/, m => m === 'This' ? 'this' : 'these')) : named(c, scope)}`;
  App.change(tx => {
    tx.says(said);
    if (scope.outputs) {
      for (const p of scope.outputs) give(tx, p, marks);
      if (textStyle) for (const l of textLabels) everyField(tx, sc, scope, l, look[l]);
      return;
    }
    for (const m of marks) {
      if (isFoot(m)) refoot(tx, { ...footNote().format, ...Object.fromEntries(textLabels.map(l => [l, look[l]])) });
      else if (m.type === 'shape') tx.update(m.id, { format: { ...App.shown.peek().item(App.chart.peek(), m.id)[0]?.format, ...Object.fromEntries([...markLabels(m), ...textLabels].map(l => [l, look[l]])) } });
      else give(tx, Tree.treeOf(st, m.record), [m]);
    }
  }, { say: said });
  fade();
  return true;
}
// A click with the painter armed pastes on what's clicked, selecting it, at its scope; on the page, it disarms. With
// the eyedropper, it takes the color clicked.
function painting(e) {
  const c = Canvas.active.peek(), p = painter.peek(), d = dropper.peek();
  // A press on the chart ends an aim, the painter's and the eyedropper's aside.
  if (!p && !d && aimed.peek() && c?.root.contains(e.target)) aim(null);
  if (d && e.button === 0) {
    e.preventDefault(); e.stopPropagation();
    const v = colorAt(e.target, e);
    if (!v) return void Shell.toast('No color to take there: click on the chart, or Esc');
    disarm();
    return apply(d.label, v);
  }
  if (!p || !c || e.button !== 0 || !c.root.contains(e.target) || !e.target.closest('.dc-graph')) return;
  e.preventDefault(); e.stopPropagation();
  const cell = e.target.closest('[data-cell-id]')?.getAttribute('data-cell-id') ?? '', id = cell.replace(/·label$/, ''), m = c.scene()?.byId.get(id);
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
  if (!scope || scope.root) return false;
  // The footer's own look is in its note.
  if (s.marks.length && s.marks.every(isFoot)) {
    if (!Object.keys(footNote().format ?? {}).length) return Shell.toast('No formatting to clear on the footer') && true;
    App.change(tx => refoot(tx, {}), { dated: false, say: 'Cleared the footer’s look' });
    return true;
  }
  const keys = new Set(scope.outputs ? scope.outputs.map(p => Tree.key(p)) : s.marks.filter(m => m.record).flatMap(m => inMark(st, m)).map(id => Tree.treeOf(st, id)).filter(Boolean).map(t => Tree.key(t)));
  const notes = [...LOOK].flatMap(l => N.notes(l)).filter(n => n.view === view && keys.has(Tree.key(n.pattern)));
  const shapes = scope.own ? s.marks.filter(m => m.type === 'shape' && Object.keys(App.shown.peek().item(App.chart.peek(), m.id)[0]?.format ?? {}).some(l => LOOK.has(l))) : [];
  const what = listed([...new Set([...notes.map(n => n.label), ...shapes.flatMap(m => Object.keys(App.shown.peek().item(App.chart.peek(), m.id)[0].format).filter(l => LOOK.has(l)))])]);
  if (!notes.length && !shapes.length) {
    const none = `No formatting to clear on ${scope.own ? scope.label.replace(/^This|^These/, m => m.toLowerCase()) : named(c, scope)}`;
    if (!scope.own || !alsoStyle(c, s.marks, none)) Shell.toast(none);
    return true;
  }
  const whose = scope.own ? (s.marks.length === 1 && s.marks[0].record ? possessive(N.nameOf(st, s.marks[0].record)) : `${scope.label.replace(/^This|^These/, m => m === 'This' ? 'this' : 'these')}’`) : null;
  const said = whose ? `Cleared ${whose} ${what}` : `Cleared the ${what} of ${scope.caption}`;
  App.change(tx => {
    notes.forEach(n => tx.remove(n.note));
    for (const m of shapes) { const f = App.shown.peek().item(App.chart.peek(), m.id)[0].format; tx.update(m.id, { format: Object.fromEntries(Object.entries(f).filter(([l]) => !LOOK.has(l))) }); }
  }, { say: said });
  if (scope.own) alsoStyle(c, s.marks, said, { undo: () => Shell.parts.peek().undo.undo() });
  return true;
}
// Where a style's look is what's left on the marks a Clear formatting went to, its toast offers to clear that too.
function alsoStyle(c, marks, said, o = {}) {
  const sc = c.scene(), left = stylesLeft(sc, marks);
  if (left.length) Shell.toast(said, { ...o, go: ['Also clear the style’s look', () => clearStyles(sc.view, left)] });
  return left.length > 0;
}
// The notes in a view at no record that decide a look property of these marks, as the notes now stand.
function stylesLeft(sc, marks) {
  const now = Scene.looks(App.shown.peek(), App.chart.peek(), sc.view, sc.day, { state: App.state.peek(), computed: App.computed.peek() }), out = new Map();
  for (const m of marks) if (m.record) for (const [l, v] of Object.entries(now.byId.get(m.id)?.settings ?? {})) if (LOOK.has(l) && v.note?.view === sc.view && !Tree.idsIn(v.note.pattern).size) out.set(v.note.note, v.note);
  return [...out.values()];
}
// Those notes' whole Styles rows, each output of them, so a row isn't left in pieces.
function clearStyles(view, notes) {
  const N = App.notes.peek(), rows = Scene.groupsOf(N, view).filter(g => g.outputs.some(p => notes.some(n => Tree.key(n.pattern) === Tree.key(p))));
  const keys = new Set([...notes.map(n => Tree.key(n.pattern)), ...rows.flatMap(g => g.outputs.map(p => Tree.key(p)))]);
  const all = [...LOOK].flatMap(l => N.notes(l)).filter(n => n.view === view && keys.has(Tree.key(n.pattern)));
  const said = `Cleared the ${listed([...new Set(all.map(n => n.label))])} of ${listed(rows.map(g => g.caption))}`;
  App.change(tx => { all.forEach(n => tx.remove(n.note)); tx.says(said); }, { dated: false, say: said });
}

// Insert: a box of each of the chart's kinds, a record named as it's typed; then the shapes PowerPoint has.
function insertMenu(e, c) {
  const item = (label, run, close) => html`<div class="menu-item" role="menuitem" tabindex="-1" onClick=${() => { close(); run(); }}
    onKeyDown=${ev => { if (ev.key === 'Enter') { close(); run(); } }}><span class="label">${label}</span></div>`;
  // (In one order, so what's on top now is on top next time: drawing two of a kind moves nothing under the hand.)
  const kinds = [...Canvas.kinds()].sort();
  Shell.popover(e.currentTarget, close => html`<div class="insert" role="menu">
    ${kinds.map(k => item(k, () => c.create(k), close))}${kinds.length ? html`<div class="menu-sep" />` : null}
    <div class="shapes">${SHAPES.map(([g, name]) => html`<button aria-label=${name} data-tip=${name} onClick=${() => { close(); c.insert(g); }}>${shapeGlyph(g)}</button>`)}</div>
    <div class="menu-sep" />
    ${[['text', 'Text box'], ['line', 'Line'], ['arrow-line', 'Arrow'], ['frame', 'Frame'], ['legend', 'Key'], ['picture', 'Picture']].map(([g, name]) =>
      item(name, () => g === 'picture' ? picture(c) : c.insert(g), close))}
    ${typeof Table === 'undefined' ? null : html`<div class="menu-sep" />${item('Import…', () => Table.importFile(), close)}`}
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

// ---- A rounded shape's corner handle, PowerPoint's: yellow, on its top edge where its corner ends, dragged along it ----

let adjusting = false;
function cornerHandles() {
  // (Not the one in a hand, whose preview draws the chart as it goes.)
  if (adjusting) return;
  const c = Canvas.active.peek(), over = c?.root.querySelector('.dc-over');
  over?.querySelectorAll('.dc-adjust').forEach(el => el.remove());
  if (!c?.scene() || App.readOnly.peek() || Shell.wide.peek()) return;
  for (const k of c.keys()) {
    const m = c.scene().byId.get(Canvas.keyParts(k)[0]);
    if (!m || (m.shape ?? m.geometry) !== 'rounded' || !['box', 'shape'].includes(m.type) || Canvas.keyParts(k)[1]) continue;
    const s = Math.min(m.w, m.h), of = v => Math.min(50, Math.max(0, v)) / 100 * s, corner = m.settings?.Corner?.value ?? m.look?.Corner ?? Scene.CORNER, place = v => { const p = c.graph.localToGraph(m.x + of(v), m.y); el.style.left = `${p.x}px`; el.style.top = `${p.y}px`; };
    const el = over.appendChild(Object.assign(document.createElement('div'), { className: 'dc-adjust' }));
    el.dataset.tip = 'Rounding';
    place(corner);
    el.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      el.setPointerCapture(e.pointerId);
      adjusting = true;
      el.addEventListener('lostpointercapture', () => { adjusting = false; }, { once: true });
      let v = corner;
      const move = ev => { v = Math.round(Math.min(50, Math.max(0, (c.graph.clientToLocal(ev.clientX, ev.clientY).x - m.x) / s * 100))); place(v); preview('Corner', v); };
      const up = () => { adjusting = false; el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); if (Math.round(corner) !== v) apply('Corner', v); else preview(); };
      el.addEventListener('pointermove', move); el.addEventListener('pointerup', up);
    });
  }
}

// ---- House styles (dendra.md, Workbook): a view's look, carried to another view, kept in this browser, passed around as a file ----

const houses = signal([]);
const listHouses = () => (Store.houseStyles?.() ?? Promise.resolve([])).then(list => { houses.value = list; });
const chartViews = () => App.views.peek().filter(v => v.layout === 'chart');
const viewNamed = id => App.views.peek().find(v => v.id === id)?.name ?? 'this view';
const chartRows = () => App.shown.peek().rows(App.chart.peek());
const hasHere = p => App.hasPattern(App.schema.peek(), App.notes.peek(), p);
// A view's look, as it's saved or matched: and where a hand put its Key, how far from which corner of the sheet that is.
function lookOfView(id) {
  const rows = chartRows(), key = rows.find(r => 'shape' in r && r.view === id && r.geometry === 'legend');
  if (key?.x == null || key?.y == null) return Notes.houseLook(rows, id);
  const sc = sceneOf(id), m = sc.byId.get(key.shape), s = sc.page.scale ?? 1, W = sc.page.sheet.w, H = sc.page.sheet.h;
  if (!m) return Notes.houseLook(rows, id);
  const l = m.x * s, t = m.y * s, r = W - l - m.w * s, b = H - t - m.h * s;
  return Notes.houseLook(rows, id, { corner: { h: l < r ? 'left' : 'right', v: t < b ? 'top' : 'bottom', dx: Math.round(Math.min(l, r) * 2) / 2, dy: Math.round(Math.min(t, b) * 2) / 2 } });
}
const sceneOf = (id, wb = App.shown.peek(), more = {}) => Scene.of(wb, App.chart.peek(), id, App.day.peek(), { state: App.state.peek(), computed: App.computed.peek(), ...more });
// The chart with a look given a view, uncommitted, its paper left as it is: what a scene on the look's paper places, as
// the change's own placing does it, as Page setup's does.
function withLook(id, look) {
  let rows = chartRows(), n = 0;
  const same = (r, l, k, view, param) => 'note' in r && r.label === l && (r.view ?? null) === (view ?? null) && (r.param ?? null) === (param ?? null) && Tree.key(r.pattern) === k;
  Notes.takeLook({ note(l, pattern, v, { view, param } = {}) {
    if (l === 'Page') return;
    const k = Tree.key(pattern), at = `·look${++n}`;
    rows = rows.filter(r => !same(r, l, k, view, param));
    if (v !== undefined && v !== null) rows.push({ id: at, note: at, label: l, pattern, ...(view && { view }), ...(param && { param }), value: v });
  }, update(sh, changes) { rows = rows.map(r => r.shape === sh ? { ...r, ...changes } : r); } }, rows, id, look, { has: hasHere });
  const notes = Notes.index(rows.filter(r => 'note' in r));
  return { ...App.shown.peek(), rows: () => rows, notes: () => notes };
}
// What a look leaves of a view, in words: the styles it says nothing of, and the marks with a look of their own.
function leftOf(id, look) {
  const N = App.notes.peek(), has = new Set(look.notes.map(n => Tree.key(Tree.bare(n.pattern)))), rows = Scene.groupsOf(N, id).filter(g => !has.has(g.style)).map(g => g.caption);
  const own = oneOffs(sceneOf(id));
  return [...rows.length ? [`${listed(rows)}, which the look doesn’t style`] : [], ...own.length ? [own.length === 1 ? `${own[0].name.replace(/^The /, 'the ')}’s own look` : `the own looks of ${own.length} marks`] : []];
}
// Views take a look, as one change, one Undo, said as one act: its paper with what placing them on it does, as Page setup's
// does, what a hand placed keeping its distance from the sheet's nearest corner. Said with what it leaves, and a Key it now puts over a box.
// A plan's pages are one chart on several days (dendra.md, The layout), so a look given to one is given to them all.
const planOf = id => { const p = App.views.peek().find(v => v.id === id)?.plan; return p ? App.views.peek().filter(v => v.plan === p).map(v => v.id) : [id]; };
const lookTaker = id => planOf(id).length > 1 ? `${viewNamed(id)} and the rest of its plan` : viewNamed(id);
function giveLook(to, look, say) {
  let left = 0;
  const ids = [...new Set(to.flatMap(planOf))], rows = chartRows(), paper = look.page, size = typeof paper === 'string' ? paper : paper?.size, portrait = !!paper?.portrait;
  const moves = id => { const p = App.notes.peek().resolve('Page', { id, kind: 'View' })?.value ?? 'slide'; return paper && Scene.PAPERS[size] && JSON.stringify(p) !== JSON.stringify(paper); };
  // (A plan's places are one set: laid on its first page, which the rest follow.)
  const placed = new Map(ids.filter(id => moves(id) && planOf(id)[0] === id).map(id => [id, sceneOf(id, withLook(id, look), { paper: `${size} ${portrait ? 'portrait' : 'landscape'}` })]));
  const leaves = ids.map(id => [id, leftOf(id, look)]).filter(([, l]) => l.length);
  const shown = ids.includes(Shell.view.peek()) && moves(Shell.view.peek());
  const c = App.change(tx => { for (const id of ids) { if (placed.has(id)) Export.placing(tx, placed.get(id), id); left = Math.max(left, Notes.takeLook(tx, rows, id, look, { has: hasHere }).left); } tx.says(say); },
    { dated: false, keep: !placed.size, say: () => {
      // (Of a plan, said once: its places are one set.)
      const named = id => to.length > 1 ? `${viewNamed(id)}: ` : '', over = ids.filter(id => planOf(id)[0] === id).flatMap(id => Scene.says(sceneOf(id), b => App.notes.peek().shortOf(App.state.peek(), b.record)).filter(t => t.startsWith('The Key overlaps')).slice(0, 1).map(t => named(id) + t));
      const keeps = leaves.map(([id, l]) => `${ids.length > 1 ? `${viewNamed(id)} keeps` : 'It keeps'} ${listed(l)}`), bits = [...keeps, ...over, ...left ? [`${left} ${left === 1 ? 'setting' : Tree.plural('setting')} of what this chart hasn’t got stayed behind`] : []];
      return bits.length ? `${say}. ${bits.join('. ')}` : say; },
      // (A Key now over a box: Tidy sets the chart clear of it. Else what differs from its style, of the page shown.)
      go: () => { const here = Shell.view.peek(), sc = ids.includes(here) ? sceneOf(here) : null; return !sc ? null : Scene.says(sc).some(t => t.startsWith('The Key overlaps')) ? ['Tidy, to make room', () => Canvas.active.peek()?.tidy()] : oneOffs(sc).length ? ['What differs', selectDiffers] : null; },
      empty: () => Shell.toast(`${ids.length > 1 ? 'They already have' : `${viewNamed(ids[0])} already has`} that look`) });
  if (c && shown) Canvas.active.peek()?.zoom('fit');
}
const matchLook = (id, from) => giveLook([id], lookOfView(from), `Gave ${lookTaker(id)} the look of ${viewNamed(from)}`);
const applyHouse = (id, s) => giveLook([id], s.look, `Gave ${lookTaker(id)} the house style ${s.name}`);
const applyHouseAll = s => giveLook(chartViews().map(v => v.id), s.look, `Gave every chart view the house style ${s.name}`);
const keepHouse = (name, look, id) => {
  const was = id ? null : houses.peek().find(s => Tree.same(s.name, name));
  return Store.keepHouseStyle({ id: id ?? was?.id ?? Log.newId(), name, look }).then(listHouses).then(() => was);
};
// A name not yet taken in this browser: Firm Standard 2.
const freeName = name => { for (let i = 2; ; i++) { const n = `${name} ${i}`; if (!houses.peek().some(s => Tree.same(s.name, n))) return n; } };

// ---- What differs from its style: every look entered for one mark on a view ----

const ONE_OFF = new Set([...BOX_LOOK, ...LINE_LOOK, ...TEXT_LOOK, 'Shape', 'Corner']);
// By mark, what's entered for it alone, of each look property that decides it, its fields' too. → [{ m, name, what: [label said], notes }].
function oneOffs(sc) {
  const N = App.notes.peek(), st = App.state.peek(), out = [];
  for (const m of sc.marks) if (m.type === 'box' || m.type === 'line') {
    const seen = new Map(), add = (l, s) => { const n = s?.note; if (n?.view === sc.view && ONE_OFF.has(l) && Tree.idsIn(n.pattern).size && !seen.has(n.note)) seen.set(n.note, { l, v: n.value, n }); };
    for (const [l, s] of Object.entries(m.settings ?? {})) add(l, s);
    for (const it of m.texts ?? []) for (const [l, s] of Object.entries(it.settings ?? {})) add(l, s);
    // (Each as it was given: a size or a weight in printed points.)
    if (seen.size) out.push({ m, name: m.type === 'box' ? N.shortOf(st, m.record) : N.segmentOf(st, m.record), notes: [...seen.values()].map(x => x.n),
      what: [...new Set([...seen.values()].map(({ l, v }) => `${l} ${l === 'Size' || l === 'Weight' ? `${v} pt` : typeof v === 'boolean' ? (v ? 'on' : 'off') : typeof v === 'object' ? '' : saidOf(l, v)}`.trim()))] });
  }
  return out;
}
// Lists them, a click selecting each, or them all; and offers to reset them all, as one change.
function selectDiffers() {
  const c = Canvas.active.peek(), sc = c?.scene();
  if (!sc) return;
  const all = oneOffs(sc), view = viewNamed(sc.view);
  if (!all.length) return Shell.toast(`Nothing on ${view} differs from its style`);
  Shell.select(all.map(x => x.m.id));
  const anchor = document.querySelector('.fb [data-fb="scope"]') ?? document.body;
  setTimeout(() => Shell.menu(anchor, [{ head: `${all.length} on ${view} ${all.length === 1 ? 'differs' : 'differ'} from ${all.length === 1 ? 'its style' : 'their styles'}` },
    ...all.map(x => ({ label: x.name, detail: x.what.join(', '), run: () => Shell.select([x.m.id]) })), '-',
    { label: all.length === 1 ? 'Reset it' : `Reset them all`, disabled: App.readOnly.peek(), run: () => App.change(tx => all.forEach(x => x.notes.forEach(n => tx.remove(n.note))), { dated: false, say: `Reset ${all.length === 1 ? `${all[0].name}’s own look` : `${all.length} marks’ own looks`} in ${view}` }) }], { placement: 'bottom-start' }));
}

// What a Styles row reaches drawn, how many of those keep their own look, and what another style decides of them all, for
// its row in the panel; read from the scene's settings, and kept with it, as the panel asks of every row as it's drawn.
const rowsReach = new WeakMap();
function reachOfRow(g) {
  const sc = Canvas.active.peek()?.scene();
  if (!sc) return { marks: 0, own: 0, masked: [] };
  const kept = rowsReach.get(sc) ?? rowsReach.set(sc, new Map()).get(sc);
  if (kept.has(g.key)) return kept.get(g.key);
  const marks = [...marksOf(sc, g)].map(id => sc.byId.get(id)).filter(Boolean), keys = new Set(g.outputs.map(p => Tree.key(p))), given = g.swatch?.kind === 'box' ? givenTo(sc.view, g) : [], N = App.notes.peek();
  const own = marks.filter(m => Object.entries(m.settings ?? {}).some(([l, s]) => s?.note?.view === sc.view && ONE_OFF.has(l) && Tree.idsIn(s.note.pattern).size)).length;
  const masked = !marks.length ? [] : ['Fill', 'Shape', 'Outline'].filter(l => given.includes(l) && marks.every(m => { const n = m.settings?.[l]?.note; return !!n && !keys.has(Tree.key(n.pattern)) && !Tree.idsIn(n.pattern).size; }))
    .map(l => [l, Scene.styleName(N, Tree.bare(marks[0].settings[l].note.pattern))]);
  const out = { marks: marks.length, own, masked };
  kept.set(g.key, out);
  return out;
}

// ---- What a house style holds, shown as words and swatches ----

const paperSaid = p => { const size = typeof p === 'string' ? p : p?.size; return `${Scene.PAPERS[size] ?? (p?.w ? `${Math.round(p.w / 96 * 100) / 100} × ${Math.round(p.h / 96 * 100) / 100} in` : 'Slide 16:9')}${p?.portrait ? ', portrait' : ''}`; };
const fmtSaid = f => Object.entries(f ?? {}).map(([l, v]) => l === 'Font' ? v : l === 'Size' ? `${v} pt` : l === 'Color' ? `color ${String(v).toUpperCase()}` : typeof v === 'boolean' ? (v ? l.toLowerCase() : `not ${l.toLowerCase()}`) : `${l.toLowerCase()} ${v}`).join(', ');
function holdsOf(look) {
  const rows = look.notes.map((n, i) => ({ ...n, id: `h${i}`, note: `h${i}`, view: 'look' }));
  (look.order ?? []).forEach((p, i) => rows.push({ id: `o${i}`, note: `o${i}`, label: 'Order', pattern: p, view: 'look', value: i + 1 }));
  const N = Notes.index(rows), groups = Scene.groupsOf(N, 'look'), styles = N.styles('look').flatMap(s => s.outputs);
  const words = g => { const f = styles.find(o => g.outputs.some(p => Tree.key(p) === Tree.key(o.pattern)))?.formats ?? {};
    return Object.entries(f).filter(([l]) => !['Shown', 'Caption', 'Layer', 'Above'].includes(l)).map(([l, v]) => l === 'Shape' ? shapeWord(v) : l === 'Fill' || l === 'Outline' || l === 'Color' ? `${l.toLowerCase()} ${v === 'none' ? 'none' : String(v).toUpperCase()}` : l === 'Weight' || l === 'Size' ? `${l === 'Size' ? 'size' : 'weight'} ${v} pt` : l === 'Font' ? v : l === 'Arrow' ? (v === 'auto' ? 'arrow auto' : `arrow ${ARROWS[v] ?? v}`) : l === 'Dash' ? (DASH_NAMES.find(([d]) => d === v)?.[1] ?? v).toLowerCase() : typeof v === 'boolean' ? (v ? l.toLowerCase() : `not ${l.toLowerCase()}`) : typeof v === 'object' ? l.toLowerCase() : `${l.toLowerCase()} ${v}`).join(', '); };
  const k = look.furniture?.key, corner = k?.corner, foot = look.footer;
  return { rows: [['Paper', paperSaid(look.page)], ['All text', fmtSaid(look.root) || 'Arial'],
    ...look.furniture?.title?.format ? [['Title', fmtSaid(look.furniture.title.format)]] : [], ...look.furniture?.date?.format ? [['Date', fmtSaid(look.furniture.date.format)]] : [],
    ...foot ? [['Footer', [foot.text ? `“${foot.text}”` : null, foot.number ? 'page numbers' : null, fmtSaid(foot.format)].filter(Boolean).join(', ')]] : [],
    ...k ? [['Key', [corner ? `${corner.v} ${corner.h}` : 'placed by the page', k.columns ? `${k.columns} ${k.columns === 1 ? 'column' : 'columns'}` : null, k.hide?.length ? `${k.hide.length} ${k.hide.length === 1 ? 'row' : 'rows'} hidden` : null, Object.values(k.captions ?? {}).length ? `captions ${Object.values(k.captions).join(', ')}` : null].filter(Boolean).join(', ')]] : []],
    styles: groups.map(g => ({ key: g.key, swatch: g.swatch, caption: k?.captions?.[g.key] ?? g.caption, words: words(g) })) };
}
const shapeWord = g => (SHAPES.find(([k]) => k === g)?.[1] ?? g).toLowerCase();
function showHouse(s) {
  const h = holdsOf(s.look), Swatch = Inspector.Swatch;
  Shell.dialog({ title: s.name, width: 560, body: () => html`<div class="holds">
    ${h.rows.map(([k, v]) => html`<div class="row"><span class="k">${k}</span><span class="v">${v}</span></div>`)}
    ${h.styles.length ? html`<div class="menu-head">Styles</div>` : null}
    ${h.styles.map(g => html`<div class="row"><span class="k">${Swatch ? html`<${Swatch} sw=${g.swatch} />` : null}<span class="cap">${g.caption}</span></span><span class="v">${g.words}</span></div>`)}
  </div>` });
}
function saveHouse(id) {
  let name = '';
  Shell.dialog({ title: 'Save this look as a house style', width: 360, actions: [{ label: 'Cancel', value: false }, { label: 'Save', value: true, primary: true }],
    body: () => html`<div class="settings"><label class="field"><span>Name</span><input aria-label="Name" placeholder="New house style" spellcheck="false" autocomplete="off" autofocus onInput=${e => { name = e.target.value; }} /></label></div>` })
    .then(async ok => {
      name = Tree.clean(name);
      if (!ok || !name) return;
      const taken = houses.peek().some(s => Tree.same(s.name, name));
      if (taken && !await Shell.confirm(`There’s a house style named ${name} in this browser.`, { title: 'Replace it?', ok: 'Replace' })) return;
      await keepHouse(name, lookOfView(id));
      Shell.toast(`Saved the house style ${name}`);
    });
}
const forgetHouse = s => Shell.confirm(`${s.name} goes from this browser. A chart that took it keeps its look.`, { title: 'Delete the house style?', ok: 'Delete', danger: true })
  .then(ok => ok && Store.forgetHouseStyle(s.id).then(listHouses).then(() => Shell.toast(`Deleted the house style ${s.name}`)));
// A small file a firm can pass around: nothing in it names a record.
function downloadHouse(s) {
  const blob = new Blob([JSON.stringify({ dendraStyle: 1, name: s.name, look: s.look })], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${s.name.replace(/[\\/:*?"<>|]+/g, ' ').trim()}.dendra-style.json` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  Shell.toast(`Downloaded the house style ${s.name}`);
}
// Read from a file, a look and nothing else (Notes.lookFrom), so loading one never touches a record; offered at once.
function loadHouse() {
  const input = Object.assign(document.createElement('input'), { type: 'file', accept: '.json,application/json' });
  input.onchange = async () => {
    const f = input.files[0];
    if (!f) return;
    let data = null;
    try { data = JSON.parse(await f.text()); } catch {}
    const look = data?.dendraStyle ? Notes.lookFrom(data.look) : null, name = Tree.clean(String(data?.name ?? '')) || f.name.replace(/(\.dendra-style)?\.json$/i, '');
    if (!look) return Shell.toast(`${f.name} isn’t a house style`);
    // Over a house style of the same name, it asks: a colleague's older file would quietly overwrite the firm's.
    const taken = houses.peek().find(x => Tree.same(x.name, name)), as = !taken ? name : await Shell.dialog({ title: `There’s a house style named ${name} in this browser`, width: 420,
      body: () => html`<p>Replace it with the one in ${f.name}, or keep both?</p>`, actions: [{ label: 'Cancel', value: null }, { label: 'Keep both', value: freeName(name) }, { label: 'Replace', value: name, primary: true }] });
    if (!as) return;
    const was = await keepHouse(as, look), s = houses.peek().find(x => Tree.same(x.name, as)), view = Shell.view.peek();
    Shell.toast(`${was ? 'Replaced' : 'Loaded'} the house style ${as}`, chartViews().some(v => v.id === view) && !App.readOnly.peek() ? { go: [`Apply to ${viewNamed(view)}`, () => applyHouse(view, s)] } : {});
  };
  input.click();
}
const houseItems = id => {
  const ro = App.readOnly.peek(), writes = ro ? { disabled: true, tip: App.whyNot() } : {};
  return [...houses.value.map(s => ({ label: s.name, items: [
      { label: 'What it holds', run: () => showHouse(s) }, '-',
      { label: `Apply to ${viewNamed(id)}`, ...writes, run: () => applyHouse(id, s) }, { label: 'Apply to every chart view', ...writes, run: () => applyHouseAll(s) }, '-',
      { label: 'Begin a new chart in it', ...writes, run: () => App.newChart(s.look) }, '-', { label: 'Download', run: () => downloadHouse(s) }, { label: 'Delete', danger: true, run: () => forgetHouse(s) }] })),
    ...(houses.value.length ? ['-'] : []),
    { label: 'Save this look as a house style…', run: () => saveHouse(id) }, { label: 'Load a house style…', run: loadHouse }];
};
const matchItems = id => chartViews().filter(v => v.id !== id).map(v => ({ label: v.name, run: () => matchLook(id, v.id) }));
// A chart tab's: the chart's other chart views to take the look of, and the house styles.
const lookMenu = id => { const others = matchItems(id);
  return [{ label: 'Match look', disabled: !others.length || App.readOnly.peek(), tip: App.readOnly.peek() ? App.whyNot() : others.length ? null : 'This chart has no other chart view', items: others }, { label: 'House style', items: houseItems(id) }]; };

// While the inspector is widened over the chart there's nothing here to format.
function Bar() {
  App.scene.value; Shell.selection.value; Canvas.fieldPicked?.value; aimed.value;
  const c = Canvas.active.value;
  if (!c || !c.scene() || Shell.wide.value) return html`<div class="fb" hidden=${Shell.wide.value} />`;
  const s = scopesOf(c), scope = scopeOf(s.scopes, chosen.value);
  current = { canvas: c, ...s, scope, field: fieldOf(c) };
  const none = !s.marks.length && !s.aim, lineOnly = s.marks.length && s.marks.every(m => m.type === 'line' || m.geometry === 'line'), footOnly = !!s.marks.length && s.marks.every(isFoot);
  const textStyle = s.aim?.swatch?.kind === 'text', root = !!scope?.root;
  const any = !none, boxy = any && !textStyle && !lineOnly && !footOnly && !s.marks.every(m => m.type === 'frame' || m.geometry === 'picture'), ro = App.readOnly.value;
  // A picture, or a line of the page's own, has no text to set; the font box stays where it is, off.
  const texty = any && (!s.marks.length || s.marks.some(m => m.type !== 'shape' || !['picture', 'line'].includes(m.geometry)));
  const set = (label, v) => apply(label, v);
  const toggle = label => set(label, !pressed(label));
  const zoom = Math.round(Canvas.zoom.value * 100);
  const placeable = s.aim ? 0 : s.marks.filter(m => (m.type === 'box' || m.type === 'shape') && !isFoot(m)).length, layered = !none && !s.aim && !footOnly;
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
  const grouping = s.group ? { label: 'Ungroup', icon: 'ungroup', keys: '$mod+Shift+G', disabled: ro, run: () => c.ungroup() } : { label: 'Group', icon: 'group', keys: '$mod+G', disabled: ro || placeable < 2, run: () => c.group() };
  // Tidy lays the view out again, or with boxes selected, those around what stands, as its name says, with nothing to do where nothing in it was placed by hand; pointed
  // at, the pointer moved onto it (not found on it as a menu over it closes), it's drawn as it would be once the
  // pointer has rested there (the canvas's restyle). Made, the change ends the preview.
  const view = c.scene().view, tidy = { label: c.tidyName(), disabled: ro || !c.tidyable(),
    run: () => { tried = null; c.tidy(); }, tries: ['Tidy'] };
  // In one order, so the hand knows where each is: the selection; those under no style's name, which most marks have
  // (Names, Jurisdictions); the Styles rows as Styles lists them, each style's under its name; then Same field value,
  // the selection's own groups; and, where members of the group chosen keep their own look of what the group is given
  // here, a way to clear it. Each group pointed at is cued on the chart.
  const scopes = () => {
    const item = x => ({ label: named(c, x), checked: x === scope, run: () => choose(x), ...(!x.own && { point: on => cue(on ? x : undefined) }) });
    const rows = s.scopes.filter(x => !x.own && !x.kin), headed = rows.filter(x => x.name), own = s.scopes.filter(x => x.kin);
    const kept = scope?.outputs ? keeping(c, scope, givenTo(view, scope)) : [], whose = kept.length && possessive(keepers(kept));
    const what = listed([...new Set(kept.flatMap(k => k.notes.map(n => n.label)))]);
    const clear = kept.length ? [{ label: `Clear ${whose} own ${what}`, disabled: ro,
      run: () => App.change(tx => kept.forEach(k => k.notes.forEach(n => tx.remove(n.note))), { say: `Cleared ${whose} own ${what}` }) }, { label: 'Select what differs', run: selectDiffers }] : [];
    return [s.scopes.filter(x => x.own).map(item), rows.filter(x => !x.name).map(item), headed.flatMap((x, i) => x.style === headed[i - 1]?.style ? [item(x)] : [{ head: x.name }, item(x)]),
      own.length ? [{ head: 'Same field value' }, ...own.map(item)] : [], clear].filter(p => p.length).flatMap((p, i) => i ? ['-', ...p] : p);
  };
  // The scope as two parts, PowerPoint's selection on the left and all like it on the right: the group chosen, or
  // else the narrowest, which its ▾ chooses among the rest. A Key row or a frame is its group alone.
  liked.value; chosen.value;
  const like = likeOf(s), ownPart = s.scopes.find(x => x.own), armed = painter.value;
  // A font or size the texts it would change don't share is shown blank, as PowerPoint shows one its selection mixes.
  const several = l => texty && new Set(scopeTexts().map(it => it.look?.[l]).filter(v => v !== undefined)).size > 1;
  const font = root ? value('Font') : !texty ? '' : several('Font') ? '' : value('Font'), size = root ? shown(value('Size')) ?? '' : !texty ? '' : several('Size') ? '' : shown(value('Size')), align = (texty && value('Align')) || 'center';
  // What would write, in Viewing: grey, saying why, pointed at or clicked, as + on the tabs does, showing what it reads all
  // the same. The scope, the zoom and Arrange, whose writes its menu greys, write nothing of themselves and go on.
  const why = ro ? App.whyNot() : null, writes = (tip, off) => ro ? { 'aria-disabled': 'true', 'data-tip': why, 'data-keys': null } : { 'data-tip': tip, disabled: off };
  return html`<div class="fb" onMouseDown=${e => { if (e.target.closest('button')) e.preventDefault(); }}
    onClickCapture=${e => { if (e.target.closest('[aria-disabled="true"]')) { e.stopPropagation(); Shell.toast(why); } }}>
    <button class="btn dd" data-fb="insert" ...${writes(null)} onClick=${e => insertMenu(e, c)}>Insert</button>
    <span class="sep" />
    <button class="btn icon" data-fb="painter" aria-label="Format painter" data-keys="Ctrl+Shift+C" aria-pressed=${!!armed} ...${writes('Format painter', none)}
      onClick=${() => armed ? disarm() : arm(true)} onDblClick=${() => ro || arm(false)}>${Shell.icon('painter')}</button>
    <button class="btn icon" data-fb="clear" aria-label="Clear formatting" data-keys="Ctrl+Space" ...${writes('Clear formatting', none)} onClick=${clearLook}>${Shell.icon('eraser')}</button>
    <span class="sep" />
    <div class=${'scope' + (scope?.own ? ' own' : '') + (none && !root ? ' off' : '')} role="group" aria-label="Format" data-fb="scope" onPointerEnter=${wake}>
      ${root ? html`<button aria-pressed="true" tabindex="-1" data-fb="all" data-tip="Every text on this page that nothing narrower sets"><span>All text</span></button>` : none ? html`<button disabled><span>Nothing selected</span></button>` : null}
      ${ownPart ? html`<button aria-pressed=${!!scope?.own} data-fb="own" data-tip=${like ? 'Just the selection' : null} data-keys=${like ? 'Ctrl+Shift+A' : null}
        onClick=${() => choose(ownPart)}><span>${ownPart.label}</span></button>` : null}
      ${like ? html`<button aria-pressed=${!scope?.own} data-fb="like" data-tour="like" data-keys=${ownPart ? 'Ctrl+Shift+A' : null} onPointerOver=${whole}
        onPointerEnter=${() => cue(like)} onPointerLeave=${() => cue()} onClick=${() => choose(like)}><span>${allOf(like, (like.marks ?? marksOf(c.scene(), like)).size)}</span></button>` : null}
      ${like && s.scopes.length > 2 ? html`<button class="more" data-fb="groups" aria-label="All like it" data-tip="All like it" aria-haspopup="menu"
        onClick=${e => Shell.menu(e.currentTarget, scopes(), { placement: 'bottom-end', onClose: () => cue() })} />` : null}
    </div>
    <span class="sep" />
    <button class="btn dd font" data-fb="font" ...${writes(root ? 'All text' : lineOnly ? 'The text on these lines' : null, !texty && !root)} onClick=${e => opener.font(e.currentTarget)}><span>${font}</span></button>
    <${SizeBox} v=${size} disabled=${ro || (!texty && !root)} why=${why} />
    <button class="btn icon" data-fb="grow" aria-label="Increase font size" data-keys="Ctrl+Shift+>" ...${writes('Increase font size', !texty && !(root && size !== ''))} onClick=${() => resize(grown)}>${Shell.icon('grow')}</button>
    <button class="btn icon" data-fb="shrink" aria-label="Decrease font size" data-keys="Ctrl+Shift+<" ...${writes('Decrease font size', !texty && !(root && size !== ''))} onClick=${() => resize(shrunk)}>${Shell.icon('shrink')}</button>
    <span class="sep" />
    <button class="btn icon" data-fb="bold" aria-label="Bold" data-keys="Ctrl+B" aria-pressed=${texty && pressed('Bold')} ...${writes('Bold', !texty)} onClick=${() => toggle('Bold')}>${Shell.icon('bold')}</button>
    <button class="btn icon" data-fb="italic" aria-label="Italic" data-keys="Ctrl+I" aria-pressed=${texty && pressed('Italic')} ...${writes('Italic', !texty)} onClick=${() => toggle('Italic')}>${Shell.icon('italic')}</button>
    <button class="btn icon" data-fb="underline" aria-label="Underline" data-keys="Ctrl+U" aria-pressed=${texty && pressed('Underline')} ...${writes('Underline', !texty)} onClick=${() => toggle('Underline')}>${Shell.icon('underline')}</button>
    <button class="btn icon" data-fb="strike" aria-label="Strikethrough" data-keys="Ctrl+Shift+X" aria-pressed=${texty && pressed('Strike')} ...${writes('Strikethrough', !texty)} onClick=${() => toggle('Strike')}>${Shell.icon('strike')}</button>
    <button class="btn dd" aria-label="Text color" data-fb="color" ...${writes('Text color', !texty)} onClick=${e => opener.color(e.currentTarget)}>${glyph.color(texty ? value('Color') : '#000000')}</button>
    <button class="btn dd" aria-label="Paragraph" data-fb="paragraph" ...${writes('Alignment and spacing', !texty)} onClick=${e => opener.paragraph(e.currentTarget)}>${Shell.icon(ALIGN_ICON[align] ?? 'align-center')}</button>
    <span class="sep" />
    <button class="btn dd" aria-label="Shape" data-fb="shape" ...${writes('Shape and shadow', !boxy)} onClick=${e => opener.shape(e.currentTarget)}>${shapeGlyph(boxy ? value('Shape') ?? s.marks[0].geometry ?? 'rect' : 'rect', boxy ? value('Corner') : undefined)}</button>
    <button class="btn dd" aria-label="Fill" data-fb="fill" ...${writes('Fill', !boxy)} onClick=${e => opener.fill(e.currentTarget)}>${glyph.fill(boxy ? value('Fill') : 'none')}</button>
    <button class="btn dd" aria-label="Outline" data-fb="outline" ...${writes('Outline', none || textStyle || footOnly)} onClick=${e => opener.outline(e.currentTarget)}>${glyph.outline(any && !textStyle && !footOnly ? value('Outline') : 'none')}</button>
    <span class="sep" />
    <button class="btn dd wide" data-fb="align" ...${writes(null, none)} onClick=${e => offer(e.currentTarget, aligns)}>Align</button>
    <button class="btn dd wide" data-fb="order" ...${writes(null, !layered)} onClick=${e => Shell.menu(e.currentTarget, orders)}>Order</button>
    <button class="btn wide" data-fb="group" ...${writes(null, grouping.disabled)} onClick=${grouping.run}>${grouping.label}</button>
    <button class="btn dd narrow arrange" data-fb="arrange" aria-label="Arrange" data-tip="Arrange" onClick=${e => offer(e.currentTarget, [{ label: 'Align', disabled: none || ro, items: aligns }, '-', ...orders.map(o => ({ ...o, disabled: !layered || ro })), '-', grouping, tidy, { label: 'Tidy for every date', disabled: ro, run: () => { tried = null; c.tidyEvery(); }, tries: ['Tidy for every date'] }, { label: 'Show only these', disabled: !c.canShowOnly(), run: () => c.showOnly() }, '-', { label: 'Fit to page', disabled: ro, run: () => Export.fit() }, { label: 'Page setup…', disabled: ro, run: () => Export.setup() }, '-', ...[['Gridlines', 'grid'], ['Snap to grid', 'snap'], ['Rulers', 'rulers']].map(([label, k]) => ({ label, checked: Canvas.aids.peek()[k], run: Canvas.aidToggle(k) }))])}>
      ${Shell.icon('layers')}<span>Arrange</span></button>
    <button class="btn" data-fb="tidy" ...${writes(tidy.label === 'Tidy' ? null : tidy.label, tidy.disabled)} onClick=${tidy.run} onPointerMove=${e => { if (e.movementX || e.movementY) preview(...tidy.tries); }} onPointerLeave=${() => preview()}>${tidy.label.replace(/ \D+$/, '')}<span class="wide">${tidy.label.match(/ \D+$/)?.[0]}</span></button>
    <button class="btn dd zoom" data-fb="zoom" onClick=${e => Shell.menu(e.currentTarget, [{ label: 'Fit', keys: 'Shift+Digit1', run: () => c.zoom('fit') }, '-',
      ...[0.5, 0.75, 1, 1.5, 2].map(z => ({ label: `${z * 100}%`, checked: Math.abs(z * 100 - zoom) < 0.5, run: () => c.zoom(z) }))], { placement: 'bottom-end' })}>${zoom}%</button>
  </div>`;
}

function mount(el) {
  // Another selection is formatted as itself, until a group is chosen for it; and another selection or view ends an aim.
  const stopSel = effect(() => { Shell.selection.value; Shell.view.value; chosen.value = null; liked.value = null; if (aimed.peek()) queueMicrotask(() => aim(null)); faded = false; });
  // The cue follows the scope, and the chart it's on.
  const stopCue = effect(() => { chosen.value; aimed.value; Shell.selection.value; App.scene.value; if (Canvas.active.value) queueMicrotask(() => cue()); });
  // A rounded shape selected has its corner handle, wherever the chart is drawn on screen.
  const stopCorners = effect(() => { App.scene.value; Shell.selection.value; App.readOnly.value; Shell.wide.value; if (Canvas.active.value) requestAnimationFrame(cornerHandles); });
  const stopFollow = effect(() => { const c = Canvas.active.value; if (!c) return; for (const on of ['scale', 'translate', 'drawn']) c.graph.on(on, cornerHandles); return () => { for (const on of ['scale', 'translate', 'drawn']) c.graph.off(on, cornerHandles); }; });
  // The painter armed shows the brush wherever the pointer is on the chart, and a click there pastes.
  document.documentElement.style.setProperty('--brush', pointer('Paintbrush', 3, 20));
  document.documentElement.style.setProperty('--dropper', pointer('Pipette', 2, 22));
  const stopBrush = effect(() => { const c = Canvas.active.value, on = !!painter.value, dropping = !!dropper.value; c?.root.classList.toggle('painting', on); c?.root.classList.toggle('dropping', dropping); if (!c && (on || dropping)) disarm(); });
  render(html`<${Bar} />`, el);
  document.addEventListener('pointerover', pointed);
  document.addEventListener('pointerdown', painting, true);
  document.addEventListener('pointermove', dropMove, { capture: true, passive: true });
  // Each a window's action, so Find reaches it by its name and ? lists its key: each for what's selected on the chart
  // shown (its keys, as every action's, not taken while text is being typed).
  const onScreen = () => (Canvas.active.peek()?.root.clientWidth ?? 0) > 0 && !!Canvas.active.peek().scene();
  const can = () => onScreen() && !!current?.marks.length, edit = () => can() && !App.readOnly.peek();
  const flip = label => () => apply(label, !pressed(label));
  const actions = [
    ['format.bold', 'Bold', '$mod+KeyB', flip('Bold')], ['format.italic', 'Italic', '$mod+KeyI', flip('Italic')], ['format.underline', 'Underline', '$mod+KeyU', flip('Underline')],
    ['format.strike', 'Strikethrough', '$mod+Shift+KeyX', flip('Strike')],
    ['format.grow', 'Increase font size', '$mod+Shift+Period', () => resize(grown)], ['format.shrink', 'Decrease font size', '$mod+Shift+Comma', () => resize(shrunk)],
    ['format.copy', 'Copy formatting', '$mod+Shift+KeyC', () => copyLook() && Shell.toast(`Copied the look of ${copied.from ?? 'the shape'}`), can],
    ['format.paste', 'Paste formatting', '$mod+Shift+KeyV', () => pasteLook(), () => edit() && !!copied],
    ['format.clear', 'Clear formatting', '$mod+Space', clearLook],
    ['format.painter', 'Format painter', null, () => arm(true)],
    ['format.scope', 'This box or all like it', '$mod+Shift+KeyA', toggle, can],
    // The bar's popovers by name, and by the words people look for them by.
    ['format.font', 'Font…', null, () => open('font'), () => onScreen() && !App.readOnly.peek(), ['Typeface', 'Font size']],
    // What every text on the page takes that nothing narrower sets (dendra.md, Notes): the page's, with nothing selected.
    ['format.alltext', 'All text…', null, () => { Shell.select([]); setTimeout(() => open('font')); }, () => onScreen() && !App.readOnly.peek(), ['Font of all text', 'Size of all text', 'Every font', 'Theme', 'Theme font', 'Theme fonts', 'Page font', 'Whole page font']],
    ['look.differs', 'Select what differs from its style…', null, selectDiffers, onScreen, ['One-offs', 'One off', 'Overrides', 'Differs', 'Own look', 'Manual formatting', 'Reset all formatting', 'Direct formatting']],
    ['format.color', 'Text color…', null, () => open('color'), edit, ['Font color', 'Font colour', 'Text colour']],
    ['format.fill', 'Fill…', null, () => open('fill'), edit, ['Fill color', 'Background', 'Shading', 'Transparency']],
    ['format.outline', 'Outline…', null, () => open('outline'), edit, ['Border', 'Line color', 'Line weight', 'Dashes', 'Arrows']],
    ['format.shape', 'Change shape…', null, () => open('shape'), edit, ['Shape', 'Shadow', 'Rounded corners']],
    ['format.paragraph', 'Paragraph…', null, () => open('paragraph'), edit, ['Align text', 'Alignment', 'Line spacing']],
  ].map(([id, name, keys, run, enabled = edit, names]) => Shell.register('action', { id, name, ...(keys && { keys }), ...(names && { names }), run, enabled,
    // Not now, and why: Find says so beside it, rather than leave it out.
    why: () => App.readOnly.peek() ? App.whyNot() : !onScreen() ? 'Show a chart first' : 'Select a box, line or shape first' }));
  // A house style's, for Find, by every word people look for one by; each for the chart view shown.
  const HOUSE = ['Style', 'Theme', 'Template', 'House style', 'Master', 'Slide master', 'Match'], chartShown = () => chartViews().some(v => v.id === Shell.view.peek());
  const fromTab = items => () => setTimeout(() => Shell.menu(document.getElementById(`tab-${Shell.view.peek()}`) ?? document.body, items(Shell.view.peek()), { placement: 'top-start' }));
  listHouses();
  actions.push(...[
    ['look.match', 'Match look…', fromTab(matchItems), () => chartShown() && !App.readOnly.peek() && chartViews().length > 1],
    ['look.house', 'House styles…', fromTab(houseItems), chartShown],
    ['look.save', 'Save this look as a house style…', () => saveHouse(Shell.view.peek()), chartShown],
    ['look.load', 'Load a house style…', loadHouse, () => true],
  ].map(([id, name, run, enabled]) => Shell.register('action', { id, name, names: HOUSE, run, enabled, why: () => App.readOnly.peek() ? App.whyNot() : !chartShown() ? 'Show a chart first' : 'This chart has no other chart view' })));
  // Insert's, for Find, by what each makes: a box of each of the chart's kinds, as the page's right-click says it ("New
  // entity", found by Add or Insert too), then its text box, frame, Key and picture.
  actions.push(Shell.register('find', { items: () => {
    const c = Canvas.active.peek();
    if (!onScreen() || App.readOnly.peek()) return [];
    const word = s => s.toLowerCase();
    return [...Canvas.kinds().map(k => ({ label: `New ${word(k)}`, detail: 'Action', names: [`Add ${word(k)}`, `Insert ${word(k)}`, 'Add a box'], run: () => c.create(k) })),
      ...[['text', 'Text box'], ['frame', 'Frame'], ['legend', 'Key', 'Legend'], ['picture', 'Picture', 'Logo']].map(([g, name, also]) => ({ label: `Insert ${word(name)}`, detail: 'Action',
        names: [name, `Add ${word(name)}`, ...(also ? [also] : [])], run: () => g === 'picture' ? picture(c) : c.insert(g) }))];
  } }));
  return () => { stopSel(); stopCue(); stopBrush(); stopCorners(); stopFollow(); actions.forEach(off => off()); disarm(); document.removeEventListener('pointerover', pointed); document.removeEventListener('pointerdown', painting, true); document.removeEventListener('pointermove', dropMove, { capture: true });
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
  if (!sc || sc.root) return null;
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

Shell.register('formatbar', { mount, relist: () => listHouses() });
return { apply, value, colorName, shapeName: g => SHAPES.find(([k]) => k === g)?.[1] ?? null, allOf, scope: describe, write: scoped, cue: cueing, open,
  copyLook, pasteLook: () => pasteLook(), canPasteLook: () => !!copied, clear: clearLook, lookMenu, houseStyles: () => houses.value, aim, aimedAt, selectDiffers,
  reachOf: reachOfRow };
})();
