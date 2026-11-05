// The format bar: one bar over the chart, in place of the ribbon. Insert adds a box of one of the chart's
// kinds, or a shape, a text box, a line or the key. The scope says what a change applies to, in two parts: the
// selection, as in PowerPoint ("This box", "These 3 boxes"), and all like it ("6 funds"), the narrowest
// group that reaches it, whose ▾ offers every group that does: the Styles rows, as Styles lists and calls them,
// and the selection's own groups, its kind and each of its options and tags ("Jurisdiction: Delaware (13)"),
// each with its reach. The scope is the pen (see The pen): the panel's second way to see and move it. What it reaches has a
// thin outline; a place pointed at is cued on the chart: what it would reach lit, the rest dulled. Ctrl+Shift+A goes from the
// title to where it was. A change writes format notes: for the selection,
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
const THEME = Shapes.OFFICE;
const STANDARD = ['#c00000', '#ff0000', '#ffc000', '#ffff00', '#92d050', '#00b050', '#00b0f0', '#0070c0', '#002060', '#7030a0'];
// And what a person calls them: a column's color, and a row's tint or shade of it, which runs darker under White and Light Gray, lighter under Black, and both
// ways under the rest; beside each, where the chart's own ten stand in a deck's theme, which is the deck's language, not the window's.
const COLUMNS = [['White', 'Background'], ['Black', 'Text'], ['Light Gray', 'Background 2'], ['Blue-Gray', 'Text 2'], ['Blue', 'Color 1'],
  ['Orange', 'Color 2'], ['Gray', 'Color 3'], ['Gold', 'Color 4'], ['Sky Blue', 'Color 5'], ['Green', 'Color 6']];
const SHADES = { 0: ['darker 5%', 'darker 15%', 'darker 25%', 'darker 35%', 'darker 50%'], 1: ['lighter 50%', 'lighter 35%', 'lighter 25%', 'lighter 15%', 'lighter 5%'],
  2: ['darker 10%', 'darker 25%', 'darker 50%', 'darker 75%', 'darker 90%'], accent: ['lighter 80%', 'lighter 60%', 'lighter 40%', 'darker 25%', 'darker 50%'] };
const THEME_NAMES = THEME.map((_, i) => { const col = i % 10, row = Math.floor(i / 10); return [COLUMNS[col][0], row ? (SHADES[col] ?? SHADES.accent)[row - 1] : null].filter(Boolean).join(', '); });
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
// The colors a color's menu leads with: those the chart has set for itself (This chart's colors), those last given, and what the page is painted in, the most used first.
function ownColors() {
  const said = new Map(), add = c => { const h = hexOf(c); if (h) said.set(h, (said.get(h) ?? 0) + 1); };
  for (const m of App.scene.peek()?.marks ?? []) { const s = m.look ?? m.settings; for (const l of ['Fill', 'Outline']) add(s?.[l]?.value ?? s?.[l]); for (const it of m.texts ?? []) add(it.look?.Color); }
  // (Two rows, in the same room however many there are; a third for those given beside a chart's own ten.)
  const mine = paletteOf()?.colors ?? [];
  return [...new Set([...mine.map(c => c.toLowerCase()), ...chartColors(), ...[...said].sort((a, b) => b[1] - a[1]).map(([c]) => c)])].slice(0, mine.length ? 15 : 10);
}
// A color's name, for a tooltip or a Look row ("Blue, lighter 80%"), where a color is in it twice the theme's; "None" for none; null for any other.
const colorName = c => c === 'none' ? 'None' : typeof c === 'string' ? NAMES.get(`#${c.replace(/^#/, '').toLowerCase()}`) ?? null : null;
// A text's size as it prints: the page's size at the page's scale, what was typed where a note gives it, or the sheet's
// half point where none does.
const page = () => Canvas.active.peek()?.scene()?.page;
const shown = v => typeof v === 'number' ? Math.round(Scene.toSlide(page(), v) * 100) / 100 : v;
const TEXT_LABELS = new Set(['Font', 'Size', 'Bold', 'Italic', 'Underline', 'Strike', 'Color', 'Text Gradient', 'Text Outline', 'Align', 'Spacing', 'Format']);
// What part of a text can be given while it's typed; the rest, its paragraph's or its shape's, go to the whole.
const RUN_LABELS = new Set(['Font', 'Size', 'Bold', 'Italic', 'Underline', 'Strike', 'Color', 'Base']);
let current = null; // { canvas, scopes, scope, marks }
// The scope with nothing selected: every text on the page that no narrower note reaches.
const ALL_TEXT = { key: 'all text', root: true, caption: 'all text', label: 'All text' };
const viewSelf = sc => ({ id: sc.view, kind: 'View' });
// The footer or its number, the chart's own: its look is in its note (dendra.md, The page).
const isFoot = m => m.role === 'footer' || m.role === 'number' || m.role === 'day';
const footNote = () => App.notes.peek().resolve('Footer', { kind: 'View' })?.value ?? {};
const refoot = (tx, format) => tx.note('Footer', { kind: 'View' }, (({ format: _, ...rest }) => Object.keys(format).length ? { ...rest, format } : rest)(footNote()));

// ---- What the selection is, and what reaches it ----

// A group's key, the same for the same outputs however it's come by: a Styles row, or one of a record's own groups.
const keyOf = ps => JSON.stringify(ps.map(p => Tree.key(p)).sort());
// Kept for the scene and the selection, while the state and the notes stand: the bar, and each row of the inspector
// (its Show on chart says where), ask it as they're drawn.
const scopesKept = new WeakMap();
function scopesOf(c) {
  const sc = c.scene(), keys = c.keys(), a = keys.length ? null : aimed.peek(), f = fieldOf(c)?.it.id ?? null, l = level.peek(), k = JSON.stringify([keys, a?.key ?? null, f, l, c.cell?.() ?? null]), st = App.state.peek(), N = App.notes.peek(), was = scopesKept.get(sc);
  if (was?.k === k && was.st === st && was.N === N) { chosen.value = was.at; return was.s; }
  const s = a ? scopesAimed(sc, a) : scopesNow(c, sc, keys);
  // (Where the pen goes by itself is settled as a selection is made, and it stays there while that's what's selected, whatever a change then enters.)
  const sel = JSON.stringify([keys, f]);
  if (settled.sel !== sel) settled = { sel, loc: byItself(c, s) };
  const at = (l && place(c, s, l)) ?? (settled.loc && place(c, s, settled.loc)) ?? null;
  chosen.value = at?.key ?? null;
  // (What a hand's place reaches, read as it's read, for the next selection to be measured against.)
  if (l && at) reachHeld = at.own ? new Set(s.marks.map(m => m.merged ?? m.id)) : at.marks ?? marksOf(sc, at);
  scopesKept.set(sc, { k, st, N, s, at: chosen.value });
  return s;
}
// A Styles row aimed at, with nothing selected: the ribbon's scope is that row, whichever of the marks it reaches are
// drawn; none drawn, it still goes to the row, and reads from its swatch. (Or any kind, entry or option, from its own page: every record that fits.)
function scopesAimed(sc, a) {
  const groups = Scene.groupsOf(App.notes.peek(), sc.view), of = x => x.general ? x : groups.find(y => y.style === x.style && y.outputs.some(p => Tree.key(p) === x.key)) ?? x, reach = x => x.general ? fitting(sc, x.outputs[0]) : marksOf(sc, x);
  const g = of(a), marks = reach(g);
  // (Several rows, a Ctrl+click adding each: all of what they reach, and a look goes to each of their outputs.)
  if (a.also?.length) {
    const all = [g, ...a.also.map(of)], every = new Set(all.flatMap(x => [...reach(x)])), caption = listed(all.map(x => x.caption));
    return { aim: g, marks: [...every].map(id => sc.byId.get(id)).filter(Boolean), scopes: [{ ...g, style: undefined, key: 'row', caption, outputs: all.flatMap(x => x.outputs), marks: every, says: n => `${n} in ${caption}` }] };
  }
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
  // (Several selected that are a group exactly, as Select all like this leaves them, are named as that: the two counts agree.)
  const exact = ids.size > 1 ? like.filter(s => s.marks.size === ids.size) : [];
  const narrowest = exact.find(s => !s.kin && s.swatch?.kind !== 'text') ?? exact.find(choice) ?? exact[0] ?? least(wider.filter(s => !s.kin && s.swatch?.kind !== 'text')) ?? least(wider.filter(choice)) ?? least(wider.filter(kind)) ?? least(wider) ?? least(like);
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
const kinOf = sc => App.ofScene(kins, sc, () => {
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
  return { by, of };
});
// The selection, as a scope, by what's drawn: "This box", "These 3 boxes", "This line" (the lines drawn as one
// included), "These 2 shapes".
function these(ms) {
  if (ms.every(isFoot)) return ms.length === 1 && ms[0].role === 'number' ? 'The page number' : ms.length === 1 && ms[0].role === 'day' ? 'The date' : 'The footer';
  if (ms.length === 1 && ms[0].role === 'footnotes') return 'The footnotes';
  if (ms.length === 1 && ms[0].geometry === 'table') { const c = Canvas.active.peek(), n = c?.cellsPicked?.(ms[0].id)?.length ?? 0; return !c?.cell?.(ms[0].id) ? 'This table' : n > 1 ? `These ${n} cells` : 'This cell'; }
  const noun = ms.every(m => m.type === 'box') ? 'box' : ms.every(m => m.type === 'line' || m.geometry === 'line') ? 'line' : 'shape', n = new Set(ms.map(m => m.merged ?? m.id)).size;
  return n === 1 ? `This ${noun}` : `These ${n} ${noun === 'box' ? 'boxes' : `${noun}s`}`;
}
// What each style reaches in a scene: by style, its outputs there, each with its caption and its marks.
const reached = new WeakMap();
const reachOf = sc => App.ofScene(reached, sc, () => {
  const by = new Map();
  for (const m of sc.marks) if ((m.type === 'box' || m.type === 'line') && !m.revealed)
    for (const r of Scene.reach(App.shown.peek(), App.chart.peek(), sc.view, sc, m.id, App.state.peek())) {
      const outs = by.get(r.style) ?? by.set(r.style, new Map()).get(r.style), k = Tree.key(r.output);
      (outs.get(k) ?? outs.set(k, { output: r.output, caption: r.caption, marks: new Set() }).get(k)).marks.add(m.id);
    }
  return by;
});
// The marks a group reaches in a scene, as scopesOf finds them: those with a record whose output fits one of its.
// (Everything else: the boxes no style or note of their own gives a fill, the page's own.)
const marksOf = (sc, s) => s.rest ? new Set(sc.marks.filter(m => m.type === 'box' && !m.revealed && (!m.settings.Fill.note || m.settings.Fill.note.pattern.id === sc.view)).map(m => m.id)) : new Set([...reachOf(sc).get(s.style)?.values() ?? []].filter(o => s.outputs.some(p => Tree.narrower(o.output, p))).flatMap(o => [...o.marks]));
// A scope as it's named: the selection ("This box"), or a group of a style's outputs as the Key says it, with
// how many of the view's marks it reaches: "Funds (6)".
function named(c, s) {
  if (s.own) return s.label;
  return `${s.caption} (${countOf(c, s)})`;
}
// A group as it's called, in the bar, a pen's tooltip and its list, one noun for one reach, its count first: a noun the Key's row gives in the plural ("5 limited
// partnerships", "6 funds", "17 entities"), an option or a tag by what it is ("13 with Jurisdiction Delaware", "11 with Good Standing"), and what's said as a
// state as it is ("2 not in good standing"). A group of one the same: "1 main fund", "1 with Jurisdiction Delaware".
function calledBy(s, n) {
  const caption = s.caption ?? '', ps = s.outputs ?? [], words = caption.split(' ');
  if (s.rest) return `${caption} (${n})`;
  if (s.says) return s.says(n);
  if (s.has) return `${n} with ${caption}`;
  // A relation's, as its lines: "24 ownership lines".
  if (ps.length && ps.every(p => p.args?.length > 1 && !Tree.idsIn(p).size)) return `${n} ${caption[0].toLowerCase()}${caption.slice(1)} line${n === 1 ? '' : 's'}`;
  // What's changed is said as a state: "3 new or changed", "1 gone".
  if (ps.length && ps.every(Scene.isChange)) return `${n} ${caption[0].toLowerCase()}${caption.slice(1)}`;
  // An option named as it is (Delaware) or a tag goes by its entry: "with Jurisdiction Delaware".
  const option = ps.length && ps.every(p => p.out?.choice !== undefined && p.out.choice === caption && p.args?.length === 1);
  if (option) return `${n} with ${ps[0].args[0].edge} ${caption}`;
  if (caption.includes(':') || (ps.length && ps.every(p => p.out?.tag === true))) return `${n} with ${caption.replace(/:\s*/, ' ')}`;
  // Said in sentence case ("Limited partnership", "Funds", "Not in good standing") or a kind: a common noun, lowered.
  const kind = ps.length && ps.every(p => p.kind && !p.args && !p.out), common = kind || words.slice(1).every(w => !/^[A-Z]/.test(w));
  const lower = w => common && /^[A-Z][a-z]/.test(w) ? w[0].toLowerCase() + w.slice(1) : w, last = words.at(-1);
  if (/^(not|no|in|with|without)$/i.test(words[0])) return `${n} ${lower(caption)}`;
  const one = w => w.replace(/ies$/i, 'y').replace(/(?<![su])s$/i, '');
  return `${n} ${[...words.slice(0, -1), n === 1 ? one(last) : Tree.plural(last)].map((w, i) => i ? w : lower(w)).join(' ')}`;
}
// And as a sentence says it, which a toast lowers: "Filled all 5 funds", "Filled 1 main fund", "Filled the 7 shown".
const allOf = (s, n) => n > 1 && !s.rest && !s.shown ? `All ${calledBy(s, n)}` : calledBy(s, n);
// What the page leaves off just now that a group would reach were it drawn: what a look keeps off it, and what's hidden one by one by its own note, with their
// lines. A change at a group's outputs goes to those as well, so its count is everything it reaches, shown or not (dendra.md, The scope).
const offs = new WeakMap();
const offOf = sc => App.ofScene(offs, sc, () => {
  const st = App.state.peek(), out = new Set(), whole = App.page.peek();
  if (whole && whole !== sc && whole.view === sc.view) for (const m of whole.marks) if ((m.type === 'box' || m.type === 'line') && !m.revealed && !sc.byId.has(m.id)) out.add(m.record);
  for (const n of App.notes.peek().notes('Shown')) if (n.view === sc.view && n.value === false && n.pattern.id !== undefined && st[n.pattern.id]?.kind && !sc.byId.has(n.pattern.id)) out.add(n.pattern.id);
  const rel = Tree.index(st).relations;
  for (const id of [...out]) for (const r of rel.get(id) ?? []) if (!sc.byId.has(r)) out.add(r);
  return [...out];
});
const countsKept = new WeakMap();
function countOf(c, g) {
  const sc = c.scene(), drawn = (g.marks ?? marksOf(sc, g)).size, off = g.outputs && !g.own && !g.root && !g.rest && !g.each ? offOf(sc) : [];
  if (!off.length) return drawn;
  const by = App.ofScene(countsKept, sc, () => new Map()), k = keyOf(g.outputs);
  if (by.has(k)) return by.get(k);
  const st = App.state.peek(), n = drawn + off.filter(id => inMark(st, { record: id }).some(x => g.outputs.some(p => Tree.fits(st, x, p)))).length;
  by.set(k, n);
  return n;
}
// Those of a group that are drawn, where it reaches more: each by its own tree, as there's then no pattern of them. "The 7 shown".
function shownOfGroup(c, s, g) {
  const key = `shown|${g.key}`, got = s.scopes.find(x => x.key === key);
  if (got) return got;
  const sc = c.scene(), st = App.state.peek(), marks = g.marks ?? marksOf(sc, g);
  const h = { key, caption: `the ${marks.size} shown`, outputs: [...marks].map(id => Tree.treeOf(st, sc.byId.get(id).record)).filter(Boolean), marks, kin: true, each: true, shown: true, of: g, loc: { shown: g.key }, says: n => `The ${n} shown` };
  s.scopes.push(h);
  return h;
}
// The scope a change goes to: where the pen is (see The pen), by its key, or else the selection itself. With nothing
// selected, a Styles row aimed at, its click in the panel: { style, key, … }, a group of Scene.groupsOf.
const aimed = signal(null);
// (Worked out with the scopes, as they're asked for.)
const chosen = { value: null, peek() { return this.value; } };
const scopeOf = (scopes, key = chosen.peek()) => scopes.find(s => s.key === key) ?? scopes[0];

// ---- The pen (dendra.md, The pen) ----
// There's one answer to what a change reaches: a location in the schema. `level` is where a hand put it, which holds for that
// selection and for a next one only while all of that is what it reaches, read afresh at each; or null, and it goes by itself. A location, as these are read:
//   { own }               the title: what's selected, alone
//   { kind }              its kind, or a line's relation
//   { row, wide }         an entry, by its labels down from what's selected (Jurisdiction › Registered Office): every box
//                         with its answer, `wide` the Styles row that answer's in; a value, every box that has that entry
//   { list, side, name, of }  a list of relatives: every box at that side of a relation of that pattern (`of` that other side)
//   { end, edge }         a line's side: every line with that record at it
//   { style, key }        a Styles row by its style and first output; { group } any scope by its key
//   { shown }             those a group of that key reaches that are drawn
const level = signal(null);
let settled = { sel: null, loc: null };
// What a hand's place reaches, and the selection a hand put it there for.
let reachHeld = null, handFor = null;
const selectedKey = () => JSON.stringify(Shell.selection.peek());
// A new selection starts where the pen goes by itself: a place a hand put it goes on only for what it reaches. No scope follows a person to a box it doesn't reach.
function holdOrLetGo() {
  const c = Canvas.active.peek(), sc = c?.scene();
  if (!level.peek() || !sc) return;
  const marks = Shell.selection.peek().map(k => sc.byId.get(Canvas.keyParts(k)[0])).filter(Boolean).flatMap(m => m.geometry === 'group' ? m.members.map(id => sc.byId.get(id)).filter(Boolean) : [m]);
  if (marks.length && !marks.every(m => reachHeld?.has(m.merged ?? m.id))) level.value = null;
}
// The box or line a record is drawn in, on a scene.
const hostMark = (sc, st, id) => { for (let x = id; x && st[x]; x = st[x].at) { const m = sc.byId.get(x); if (m && (m.type === 'box' || m.type === 'line')) return m; } return null; };
// The marks with a record fitting a pattern, kept for the scene.
const fitted = new WeakMap();
function fitting(sc, p) {
  const by = App.ofScene(fitted, sc, () => new Map()), k = Tree.key(p);
  if (by.has(k)) return by.get(k);
  const st = App.state.peek(), out = new Set();
  for (const id in st) if (!Tree.isView(st[id]) && Tree.fits(st, id, p)) { const m = hostMark(sc, st, id); if (m && !m.revealed) out.add(m.merged ?? m.id); }
  by.set(k, out);
  return out;
}
// Every box that has an entry: the entry's tree with every object made any object, and no answer.
function hasEntry(c, s, id) {
  const st = App.state.peek(), t = Tree.treeOf(st, id), p = t && general(t).p;
  if (!p?.args) return null;
  const bare = Tree.bare(p), key = keyOf([bare]), got = s.scopes.find(x => x.key === key);
  if (got) return got;
  const g = { key, caption: App.notes.peek().name(bare), outputs: [bare], marks: fitting(c.scene(), bare), kin: true, has: true };
  s.scopes.push(g);
  return g;
}
// An entry's places, the wider first: the Styles row its answer is in, and the one answer; a value's, every box that has it.
function entryPlaces(c, s, id) {
  const st = App.state.peek(), r = st[id], t = Tree.treeOf(st, id);
  if (!t) return [];
  const rows = s.scopes.filter(x => !x.own && !x.kin && x.outputs?.some(q => Tree.narrower(t, q))), row = rows.find(x => x.swatch?.kind !== 'text') ?? rows[0];
  const own = Tree.isChoice(r) || Tree.isTag(r) ? s.scopes.find(x => x.key === keyOf([general(t).p])) : hasEntry(c, s, id);
  return [...new Set([...row ? [row] : [], ...own ? [own] : []])];
}
// A list of relatives: the boxes at `side` of the relations of its pattern, each by its own tree, as there's no pattern of
// what a box is a side of; `of`, with that record at the other side.
function listPlace(c, s, l) {
  const sc = c.scene(), st = App.state.peek(), key = `list:${Tree.key(l.list)}|${l.side}|${l.of ?? ''}`, got = s.scopes.find(x => x.key === key);
  if (got) return got;
  const ids = new Set(), N = App.notes.peek();
  for (const id in st) if (st[id].args && Tree.fits(st, id, l.list)) {
    const me = st[id].args.find(a => Tree.same(a.edge, l.side)), other = st[id].args.find(a => a !== me);
    if (!me || (l.of && Tree.objectOf(st, other?.at) !== l.of)) continue;
    const m = sc.byId.get(Tree.objectOf(st, me.at));
    if (m?.type === 'box' && !m.revealed) ids.add(m.id);
  }
  if (!ids.size || !s.marks.every(m => ids.has(m.id))) return null;
  const g = { key, caption: l.of ? `${l.name}: ${N.nameOf(st, l.of)}` : l.name, outputs: [...ids].map(id => Tree.treeOf(st, sc.byId.get(id).record)), marks: ids, kin: true, each: true, loc: l,
    says: n => l.of ? (n === 1 ? `The only one with ${N.shortOf(st, l.of)} in ${l.name}` : `All ${n} with ${N.shortOf(st, l.of)} in ${l.name}`) : n === 1 ? `The only one with ${l.name}` : `All ${n} with ${l.name}` };
  s.scopes.push(g);
  return g;
}
// A line's side: every line with that record at that side, a pattern with the record in it.
function endPlace(c, s, l) {
  const st = App.state.peek(), m = s.marks[0], r = st[m?.record], a = r?.args?.find(x => Tree.same(x.edge, l.end));
  if (!a) return null;
  const o = Tree.objectOf(st, a.at), p = { args: r.args.map(x => ({ edge: x.edge, loc: x === a ? { id: o, kind: st[o].kind } : {} })) };
  if (st[o].at || a.at !== o) return null;
  const key = keyOf([p]), got = s.scopes.find(x => x.key === key);
  if (got) return got;
  const N = App.notes.peek(), g = { key, caption: `${l.end}: ${N.nameOf(st, o)}`, outputs: [p], marks: fitting(c.scene(), p), kin: true, loc: l, says: n => n === 1 ? `The only line with ${N.shortOf(st, o)} as ${l.end}` : `All ${n} lines with ${N.shortOf(st, o)} as ${l.end}` };
  s.scopes.push(g);
  return g;
}
// The scope a location is, for what's selected; null where it has no such place.
function place(c, s, l) {
  if (l.own) return s.scopes.find(x => x.own) ?? null;
  if (l.group) return s.scopes.find(x => x.key === l.group) ?? null;
  // (All drawn again, a filter gone, it's the group.)
  if (l.shown) { const g = s.scopes.find(x => x.key === l.shown); return !g ? null : countOf(c, g) > (g.marks ?? marksOf(c.scene(), g)).size ? shownOfGroup(c, s, g) : g; }
  if (l.style) return s.scopes.find(x => !x.own && !x.kin && x.style === l.style && x.outputs?.some(p => Tree.key(p) === l.key)) ?? null;
  const m = s.marks.length === 1 ? s.marks[0] : null, st = App.state.peek();
  if (!m?.record || (m.type !== 'box' && m.type !== 'line')) return null;
  if (l.kind) { const t = Tree.treeOf(st, m.record); return t && s.scopes.find(x => x.key === keyOf([general(t).p])) || s.scopes.find(x => !x.own && !x.kin && x.outputs?.some(p => t && Tree.narrower(t, p))) || null; }
  if (l.end) return endPlace(c, s, l);
  if (l.list) return listPlace(c, s, l);
  if (!l.row) return null;
  let id = m.record;
  for (const e of l.row) { id = Tree.entryAt(st, id, e); if (!id) return null; }
  const ps = entryPlaces(c, s, id);
  return (l.wide ? ps[0] : ps.at(-1)) ?? null;
}
// A scope as a location, so it can stick.
function locOf(c, s, g) {
  if (!g || g.own) return { own: true };
  if (g.loc) return g.loc;
  const m = s.marks.length === 1 ? s.marks[0] : null, st = App.state.peek();
  if (m?.record) {
    const t = Tree.treeOf(st, m.record), fits = (id, u = Tree.treeOf(st, id)) => !!u && g.outputs?.some(p => Tree.narrower(u, p));
    if (t && g.key === keyOf([general(t).p])) return { kind: true };
    for (const id of inMark(st, m)) if (id !== m.record && fits(id)) return { row: Tree.pathOf(st, id).slice(Tree.pathOf(st, m.record).length).map(x => st[x].edge), wide: !g.kin };
  }
  return g.style ? { style: g.style, key: Tree.key(g.outputs[0]) } : { group: g.key };
}
// Where it goes by itself (dendra.md, The pen). Several selected: what they are exactly, or else them. A box with looks of its
// own entered: its title. A field: where what shows it or gives its look is decided. Else the narrowest place that already
// decides its look, the Styles row that fills it, or else its kind. A free shape has no schema, and no pen.
function byItself(c, s, forBox = false) {
  const sc = c.scene();
  if (s.aim || !s.marks.length) return null;
  const bound = s.marks.filter(m => m.type === 'box' || m.type === 'line');
  if (!bound.length || bound.length < s.marks.length || s.scopes.length < 2) return s.scopes.some(x => x.own) ? { own: true } : null;
  if (bound.length > 1) return s.narrowest && s.narrowest.marks.size === new Set(bound.map(m => m.merged ?? m.id)).size ? { group: s.narrowest.key } : { own: true };
  const m = bound[0], st = App.state.peek(), mine = n => n?.view === sc.view && Tree.idsIn(n.pattern).size > 0;
  // (A part of a design is the box's, as its design is; a field in the part the rest go in is a field still.)
  const f = forBox ? null : (x => x?.it.of || (x?.it.part && !x.it.rested) ? null : x)(fieldOf(c));
  if (f) {
    const n = f.it.shownBy ?? null;
    if (n && Tree.idsIn(n.pattern).size) return { own: true };
    if (n?.view === sc.view) {
      const k = keyOf([n.pattern]), g = s.scopes.find(x => x.key === k || x.outputs?.some(p => Tree.key(p) === Tree.key(n.pattern)));
      if (g) return locOf(c, s, g);
    }
    if (st[f.it.id]?.edge !== undefined && !n?.param) return { row: Tree.pathOf(st, f.it.id).slice(Tree.pathOf(st, m.record).length).map(x => st[x].edge) };
  }
  if ([...LOOK].some(l => mine(m.settings?.[l]?.note))) return { own: true };
  for (const l of m.type === 'line' ? LINE_LOOK : [...BOX_LOOK, 'Shape', 'Corner']) {
    const n = m.settings?.[l]?.note, g = n?.view === sc.view && s.scopes.find(x => !x.own && x.outputs?.some(p => Tree.key(p) === Tree.key(n.pattern)));
    if (g) return locOf(c, s, g);
  }
  return { kind: true };
}
// What's of a box rather than of the field picked in it (a design, another field shown, a free text, a footnote) goes where the pen stands for the box: where it would by itself with no field picked, unless a hand has put it somewhere.
function boxScope(c, s) {
  const l = !level.peek() && fieldOf(c) ? byItself(c, s, true) : null;
  return (l && place(c, s, l)) ?? scopeOf(s.scopes);
}
// Moved by a hand: a scope, or a location.
function penTo(c, s, g) { reachHeld = !g || g.own ? new Set(s.marks.map(m => m.merged ?? m.id)) : g.marks ?? marksOf(c.scene(), g); level.value = locOf(c, s, g); if (!g?.own && g?.key) liked.value = g.key; }
// Which row of a page the pen stands in, for the scope it's at: 'title', 'kind', 'entry:<id>', 'list:…', 'end:…', or of a chart's
// page, 'root' and 'row:<style>|<output>'; null where the page has no row of it.
function penRow(c, s, scope) {
  if (!scope) return null;
  if (scope.shown) return penRow(c, s, scope.of);
  if (scope.root) return 'root';
  if (s.aim) return s.aim.general ? `general:${Tree.key(s.aim.outputs[0])}` : `row:${s.aim.style}|${Tree.key(s.aim.outputs[0])}`;
  if (scope.own) return s.marks.length === 1 ? 'title' : null;
  if (scope.loc?.list) return `list:${scope.loc.name}|${scope.loc.of ?? ''}`;
  if (scope.loc?.end) return `end:${scope.loc.end}`;
  const m = s.marks.length === 1 ? s.marks[0] : null, st = App.state.peek(), fits = id => { const u = Tree.treeOf(st, id); return !!u && scope.outputs?.some(p => Tree.narrower(u, p)); };
  if (!m?.record) return null;
  if (fits(m.record)) return 'kind';
  // (A name's row is the title. A field whose place has no row of its own stands at the field's.)
  const rowOf = id => Tree.same(st[id]?.edge ?? '', 'Name') ? 'title' : `entry:${id}`;
  for (const id of inMark(st, m)) if (id !== m.record && fits(id)) return rowOf(id);
  const f = fieldOf(c);
  return f ? (f.it.id !== m.record && st[f.it.id]?.edge !== undefined ? rowOf(f.it.id) : 'title') : null;
}
// A place's name, as the bar, its pen's tooltip and its list say it.
const placeSaid = (c, g) => g.own ? g.label : calledBy(g, countOf(c, g));
// The places a row of a page stands for, the first a click goes to. `w`, what the row is: { own }, { kind }, { entry }, { list, side, name, of },
// { end }, { style: a group of Scene.groupsOf }, { rest: that group }, { root }, or { general: a pattern, name }.
function placesOf(c, s, w) {
  if (w.own || w.kind) { const g = place(c, s, w); return g ? [g] : []; }
  if (w.entry) return entryPlaces(c, s, w.entry);
  if (w.list || w.end) { const g = place(c, s, w); return g ? [g] : []; }
  return [];
}
// (Every row of a page asks, as it's drawn: worked out once for what's selected, where the pen is and what's drawn.)
let penKept = null;
function penNow() {
  const c = Canvas.active.peek(), sc = c?.scene(), sel = Shell.selection.peek(), l = level.peek(), a = aimed.peek(), f = Canvas.fieldPicked?.peek(), st = App.state.peek(), was = penKept;
  if (was && was.sc === sc && was.sel === sel && was.l === l && was.a === a && was.f === f && was.st === st) return was;
  const s = sc ? scopesOf(c) : null;
  return penKept = { sc, sel, l, a, f, st, row: s ? penRow(c, s, scopeOf(s.scopes)) : null, record: s?.marks.length === 1 && !s.aim ? s.marks[0].record : null };
}
const pen = {
  // The row the pen stands in now.
  row() { return penNow().row; },
  // Where a click on a row's pen goes, and whether it's there already; `places`, all a row has, the wider first.
  next(w) {
    const c = Canvas.active.peek();
    if (!c?.scene()) return null;
    const ws = w.style ?? w.rest ?? (w.general && { general: true, style: Tree.key(Tree.bare(w.general)), outputs: [w.general], caption: w.name, swatch: { kind: 'box', ...Scene.DEFAULTS.box }, name: null, has: w.general.args?.length === 1 && !w.general.out });
    if (ws) { const marks = ws.general ? fitting(c.scene(), w.general) : marksOf(c.scene(), ws); return { aim: ws, marks, here: aimedAt(ws), said: calledBy(ws, countOf(c, { ...ws, marks })) }; }
    if (w.root) return { root: true, here: !aimed.peek(), said: 'All text' };
    const s = scopesOf(c), ps = placesOf(c, s, w), now = scopeOf(s.scopes), here = ps.includes(now), to = here ? now : ps[0];
    if (!to) return null;
    return { to, marks: to.own ? null : to.marks ?? marksOf(c.scene(), to), here, s, places: ps, said: ps.map(p => placeSaid(c, p)).join(', or '), now: here };
  },
  // A click on it: at a row with one place, it goes there; with more, or with what else it can do from there, its small list says them, at the pen.
  click(w, at) {
    const n = pen.next(w), more = w.entry ? answersOf(w.entry) : null;
    if (n?.places && at && (n.places.length > 1 || (n.here && more))) return placesMenu(w, n, at);
    pen.put(w);
  },
  // Moves it there.
  put(w) {
    const c = Canvas.active.peek(), n = pen.next(w);
    if (!n) return;
    // (A click on it where it stands is a hand's too.)
    if (n.here) { if (n.to) penTo(c, n.s, n.to); return; }
    cue(null);
    if (n.root) { aim(null); level.value = null; return; }
    if (n.aim) return aim(n.aim, true);
    penTo(c, n.s, n.to);
  },
  // Pointed at: what it would reach lit, the rest dulled.
  point(w, on) { const n = on ? pen.next(w) : null; cue(n?.marks ? { marks: n.marks } : null); },
  // Back to going by itself: Esc with nothing selected.
  home() { const had = !!level.peek() || !!aimed.peek(); level.value = null; if (aimed.peek()) aim(null); settled = { sel: null, loc: null }; return had; },
  // Whether the one mark selected draws this record: a page's pens are of what's selected.
  on(id) { return penNow().record === id; },
  // Whether a hand moved it for this selection, as what's said of one thing asks (dendra.md, The pen).
  moved() { return (!!level.peek() && handFor === selectedKey()) || !!aimed.peek(); },
  level, aimed,
};
// A choice or a tag is how a chart styles by an answer. Its answers: each option of its entry, wherever it's specified, and a tag's yes, and its no where one's been said; each a pattern
// with every object in it made any object, so a look given it follows the data. → { name, answers: [pattern] }, or null where a row isn't one.
function answersOf(id) {
  const st = App.state.peek(), r = st[id], t = r?.at && !r.args && (Tree.isChoice(r) || Tree.isTag(r)) ? Tree.treeOf(st, id) : null;
  if (!t?.args) return null;
  const N = App.notes.peek(), p = general(t).p, bare = Tree.bare(p);
  const specs = Object.values(App.schema.peek()).filter(s => s.args && Tree.narrower(s, bare));
  const says = Tree.isChoice(r) ? N.optionsOf(specs).map(o => ({ choice: o })) : [{ tag: true }, ...Object.keys(st).some(x => st[x].tag === false && Tree.fits(st, x, { ...bare, out: { tag: false } })) ? [{ tag: false }] : []];
  return says.length ? { name: N.name(bare), answers: says.map(out => ({ ...bare, out })) } : null;
}
// A look for each: every answer a Styles row, each its colour from the chart's palette (a tint its fill, its accent its outline), its row in the Key, the page given a Key if it has none.
// At patterns, so colours follow the data: an answer that already has a fill keeps it, and each keeps its colour by its place in the list, so one asked again later only adds what's new.
function lookForEach(id) {
  const c = Canvas.active.peek(), found = answersOf(id);
  if (!c?.scene() || !found) return;
  if (App.readOnly.peek()) return Shell.toast(App.whyNot());
  const sc = c.scene(), view = sc.view, N = App.notes.peek(), grid = Shapes.swatches(paletteOf()?.colors ?? THEME.slice(0, 10));
  const look = i => { const col = 4 + i % 6, round = Math.floor(i / 6) % 3; return { Fill: grid[(round + 1) * 10 + col], Outline: grid[(round ? 3 + round : 0) * 10 + col] }; };
  // (Those the chart has first, and none on a colour an answer has already, so what's there is told apart, and what comes later adds to it.)
  const st = App.state.peek(), given = p => N.notes('Fill').find(n => n.view === view && Tree.key(n.pattern) === Tree.key(p)), inUse = p => Object.keys(st).some(x => Tree.fits(st, x, p));
  // (A list longer than the colours, the fifty states, only those the chart has: a row for each of what no box says would tell nothing apart.)
  const COLOURS = 18, taken = new Set(found.answers.map(p => given(p)?.value).filter(Boolean)), free = (function* () { for (let i = 0; ; i++) if (i >= COLOURS || !taken.has(look(i).Fill)) yield look(i); })();
  const lacking = found.answers.filter(p => !given(p)), used = lacking.filter(inUse), fresh = [...used, ...found.answers.length > COLOURS ? [] : lacking.filter(p => !inUse(p))].map(p => [p, free.next().value]);
  if (!fresh.length) return Shell.toast(`Each answer of ${found.name} has its look already`);
  const pattern = Tree.bare(found.answers[0]), key = Tree.key(pattern), all = N.styles(view), isTag = s => s.outputs.length && s.outputs.every(o => o.pattern.out && 'tag' in o.pattern.out);
  // (A new style comes before what says a condition, Vacant, Not in good standing, so those still show on what they're said of.)
  const order = all.some(s => s.key === key) ? null : [...all.filter(s => !isTag(s)), { pattern }, ...all.filter(isTag)];
  const pages = chartViews().length > 1, said = `Gave each answer of ${found.name} a look${pages ? ` on ${viewNamed(view)}` : ''}`, noKey = !sc.marks.some(m => m.geometry === 'legend') && !App.shown.peek().rows(App.chart.peek()).some(r => 'shape' in r && r.view === view && r.geometry === 'legend');
  let wrote = [];
  App.change(tx => {
    order?.forEach((s, i) => { if (s.order !== i + 1) tx.note('Order', s.pattern, i + 1, { view }); });
    for (const [p, l] of fresh) for (const [label, value] of Object.entries(l)) tx.note(label, p, value, { view });
    if (noKey) tx.add('shape', { view, geometry: 'legend', title: 'Key', columns: 2 });
    wrote = wroteHere(tx, c).filter(r => r.label !== 'Order');
    tx.says(said);
  }, { dated: false, say: said, go: () => { const more = everyPage(wrote, `each answer of ${found.name}`); return more ? [more] : null; } });
}

// A footnote's notes on a page, and the shape the page lists them in, which comes with the first there.
function footOn(tx, view, patterns, key, value) {
  const row = App.shown.peek().rows(App.chart.peek()).find(r => 'shape' in r && r.view === view && r.role === 'footnotes');
  if (!row) tx.add('shape', { view, geometry: 'text', role: 'footnotes', name: 'Footnotes', text: '' });
  else if (row.hidden) tx.update(row.shape, { hidden: false });
  for (const p of patterns) tx.note('Footnote', p, value, { view, param: key });
}
// The footnotes on pages not going out, of what those going out draw, said at Export with a way to bring each. → [{ text, from, on, put }].
function footsOff(scenes) {
  const N = App.notes.peek(), st = App.state.peek(), going = new Set(scenes.map(s => s.view)), notes = N.notes('Footnote'), out = new Map();
  for (const n of notes) {
    if (!n.view || going.has(n.view) || !n.value?.text || out.has(n.param) || notes.some(x => x.param === n.param && going.has(x.view))) continue;
    const lack = scenes.filter(s => s.marks.some(m => (m.type === 'box' || m.type === 'line') && !m.revealed && inMark(st, m).some(x => Tree.fits(st, x, n.pattern))));
    if (!lack.length) continue;
    const same = notes.filter(x => x.param === n.param && x.view === n.view).map(x => x.pattern), on = listed(lack.map(s => viewNamed(s.view)));
    out.set(n.param, { text: n.value.text, from: viewNamed(n.view), on, put: () => App.change(tx => { for (const s of lack) footOn(tx, s.view, same, n.param, n.value); tx.says(`Put a footnote on ${on}`); }, { dated: false, say: `Put the footnote on ${on}` }) });
  }
  return [...out.values()];
}
// A row's places in a small list at its pen, the current one ticked, each pointed at dimming the chart to it; a choice's or a tag's also A look for each.
function placesMenu(w, n, at) {
  const c = Canvas.active.peek(), now = scopeOf(n.s.scopes), answers = w.entry ? answersOf(w.entry) : null;
  cue(null);
  Shell.menu(at, [...n.places.map(p => ({ label: placeSaid(c, p), checked: p === now, run: () => penTo(c, n.s, p), point: on => cue(on ? (p.own ? null : p) : null) })),
    ...(answers && !App.readOnly.peek() ? ['-', { label: 'A look for each', run: () => lookForEach(w.entry) }] : [])], { placement: 'bottom-start', onClose: () => cue(null) });
}
// The marks a group reaches that keep their own value of a property, entered for them alone in the view,
// which a change for the group leaves as it is (entered wins): each with the notes that decide it.
function keeping(c, scope, labels) {
  const sc = c.scene(), N = App.notes.peek(), out = [];
  if (!scope?.outputs || scope.each) return out;
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
const lowerFirst = s => s[0].toLowerCase() + s.slice(1);
const listed = xs => xs.length < 3 ? xs.join(' and ') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`;

// ---- Making a change ----

// What a change of one setting writes, on tx: for the selection, a format note at each record's own tree in
// the view, and a free shape's own format; for a style, a note at each of its outputs in the view. With a field of a
// box selected (a text in it, clicked), a text property is that field's, as a text selected in a PowerPoint shape is
// formatted: at the field's own pattern, at the scope (the canvas's styleField).
// A part of a design picked, where what's given goes to the part: all but a text's look given to a field in the part the rest go in, which is that field's.
function partPicked(c, label) {
  const f = label === 'Design' || label === 'Format' ? null : fieldOf(c);
  return f && (f.it.of || (f.it.part && !(f.it.rested && TEXT_LABELS.has(label)))) ? f : null;
}
function write(tx, c, label, value) {
  // (A design, and a part of one, are the box's: where the pen stands for the box, whatever's picked in it.)
  const s = scopesOf(c), { marks, scopes } = s, part = partPicked(c, label);
  const scope = label === 'Design' || part ? boxScope(c, s) : scopeOf(scopes);
  if (!scope) return;
  if (scope.root) return tx.note(label, viewSelf(c.scene()), value);
  // (Cells of a table picked: theirs, each kept with the words it's written at.)
  const cell = marks.length === 1 && marks[0].geometry === 'table' && c.cell?.(marks[0].id);
  if (cell) {
    const row = tx.item?.(marks[0].id)?.at(-1) ?? App.shown.peek().item(App.chart.peek(), marks[0].id)[0], on = c.cellsPicked(marks[0].id);
    return tx.update(marks[0].id, { table: { ...row.table, rows: row.table.rows.map((r, i) => ({ ...r, cells: r.cells.map((k, j) => !on.some(q => q.r.src === i && q.k.c === j) ? k : { ...k, format: { ...k.format, [label]: value } }) })) } });
  }
  // (Everything else's words are All text's: a box's look is its own.)
  if (scope.rest && TEXT_LABELS.has(label)) return tx.note(label, viewSelf(c.scene()), value);
  // A part of a design selected takes whatever's given it (dendra.md, Group designs); and a shape given at a design's own pattern is said over the design.
  if (part) return c.styleField(tx, part, label, value, scope.outputs ? { outputs: scope.outputs } : { own: true });
  if ((label === 'Shape' || label === 'Corner') && Designs.atPen(tx, c.scene(), scope, marks, label, value)) return;
  const f = TEXT_LABELS.has(label) && label !== 'Format' ? fieldOf(c) : null;
  if (f) return c.styleField(tx, f, label, value, scope.outputs ? { outputs: scope.outputs } : { own: true });
  const view = c.scene().view, tree = id => Tree.treeOf(App.state.peek(), id), texty = TEXT_LABELS.has(label) && label !== 'Format';
  if (scope.has && texty) {
    // (At an entry, a text property would be that entry's own: every box that has it takes it beside each of its fields.)
    for (const m of [...scope.marks].map(id => c.scene().byId.get(id)).filter(Boolean)) for (const it of m.texts ?? []) { const e = fieldEdge(it) ?? it.blank?.edge; if (e) tx.note(label, scope.outputs[0], value, { view, param: e }); }
  } else if (scope.outputs) {
    for (const p of scope.outputs) tx.note(label, p, value, { view });
    if (texty) everyField(tx, c.scene(), scope, label, value);
  } else for (const m of marks) {
    if (m.type === 'box' || m.type === 'line') {
      tx.note(label, tree(m.record), value, { view });
      // As a shape's in PowerPoint: what was this box's own of a field goes with it.
      if (texty) ownFields(tx, m, label);
    }
    else if (isFoot(m)) refoot(tx, { ...footNote().format, [label]: value });
    // (As the change has left it so far: several settings at once are one change, a line's arrow and its head, and none takes back the other.)
    else if (m.type === 'shape') { const row = tx.item?.(m.id)?.at(-1) ?? App.shown.peek().item(App.chart.peek(), m.id)[0]; tx.update(m.id, { format: { ...row?.format, [label]: value }, ...(m.geometry === 'table' && TEXT_LABELS.has(label) && { table: wholeTable(row.table, label) }) }); }
  }
}
// A text's look given a whole table reaches every cell: what a cell kept of its own of it goes.
const wholeTable = (t, label) => ({ ...t, rows: t.rows.map(r => ({ ...r, cells: r.cells.map(k => { if (k.format?.[label] === undefined) return k; const { [label]: _, ...f } = k.format, { format: _f, ...rest } = k; return Object.keys(f).length ? { ...rest, format: f } : rest; }) })) });
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
  // What's being typed part by part takes it, in what's selected of it (dendra.md, Free text); Size and a colour as printed, as ever.
  if (Canvas.rich.peek() && RUN_LABELS.has(label) && c.richSet(label, label === 'Size' ? value : value)) return;
  // F4 does it again, on what's selected then.
  c.did?.(() => apply(label, value));
  // A change for a group says at once what of it keeps its own, which the scope's menu then offers to clear; and
  // where a later style gives some of it otherwise, says which still decides, and offers to put this one after it,
  // the rows holding their order till that's asked. All text says what no longer takes it, with a way to make it do so.
  // (What's said of a part of a design is said over the design: no style decides it, and nothing keeps its own from it.)
  const part = partPicked(c, label), scope = label === 'Design' || part ? boxScope(c, scopesOf(c)) : scopeOf(scopesOf(c).scopes), kept = part ? [] : keeping(c, scope, [label]), first = part ? {} : firstFor(c, scope, label, value), under = scope.root ? narrower(c.scene(), label, value) : null;
  const says = [kept.length && `${keepers(kept)} ${kept.length > 1 ? 'keep their' : 'keeps its'} own`, first.say, under?.say].filter(Boolean);
  // (A text property goes to every field, so to more notes than one: said as the one act it is.)
  const inView = `${Time.looked(label, value, scope.caption)} in ${scope.root ? lookTaker(c.scene().view) : App.notes.peek().nameOf(App.state.peek(), c.scene().view)}`, oneAct = TEXT_LABELS.has(label) && (!!scope.outputs || !!scope.root) && !fieldOf(c);
  // (What's selected of a design, or a design given, is said so; History can't read it from what it's written as.)
  const ofDesign = label === 'Design' ? Time.looked(label, value, scope.own ? scopesOf(c).marks.map(m => App.notes.peek().nameOf(App.state.peek(), m.record)).join(', ') : lowerFirst(allOf(scope, countOf(c, scope)))) : part ? Time.looked(label, value, 'a part of the design') : null;
  // (The footer's the chart's, on every page.)
  const marks = scopesOf(c).marks, ofFoot = !!marks.length && marks.every(isFoot) && Time.looked(label, value, 'the footer');
  // (A free shape's look is its row's, which History can't read words from: said as it's done.)
  const ofFree = !ofFoot && freeSaid(marks, label, value);
  const sceneWas = App.scene.peek();
  // The first change of a session that reaches more than one box says what it reached, with a way to have given it to this one alone; on a chart of several pages, every such change says the page, with a way to go further.
  const reach = firstReach(c, scope, label, value), just = reach?.just && (() => { Shell.parts.peek().undo?.undo(); const s = scopesOf(c); penTo(c, s, s.scopes.find(x => x.own)); apply(label, value); Shell.toast(label === 'Fill' && value !== 'none' ? `Filled just ${reach.own}` : Time.looked(label, value, `just ${reach.own}`), { undo: () => Shell.parts.peek().undo?.undo() }); });
  let said = [];
  App.change(tx => { write(tx, c, label, value); said = wroteHere(tx, c); if (ofDesign) tx.says(ofDesign); else if (oneAct) tx.says(inView); else if (ofFoot) tx.says(ofFoot); else if (ofFree) tx.says(ofFree); }, { say: reach ? [ofDesign ? `${ofDesign}${reach.page}` : reach.said, ...says].join('; ') : ofDesign || (says.length ? `${Time.looked(label, value, scope.caption)}; ${says.join('; ')}` : scope.root ? inView : ofFoot || ofFree || null),
    go: () => [first.also ? [first.offer, () => App.change(first.also, { dated: false, say: first.done })] : under?.clear ?? (just && reach.own ? [`Just ${reach.own}`, just] : null), reach ? everyPage(said, reach.of) : null].filter(Boolean) });
  if (label === 'Fill' && scope.own) sayLies(sceneWas);
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
  const ofFree = freeSaid(scopesOf(c).marks, ...pairs[0]);
  const reach = firstReach(c, scopeOf(scopesOf(c).scopes), ...pairs[0]), just = reach?.just && (() => { Shell.parts.peek().undo?.undo(); const s = scopesOf(c); penTo(c, s, s.scopes.find(x => x.own)); applyAll(pairs); });
  let said = [];
  App.change(tx => { pairs.forEach(([l, v]) => write(tx, c, l, v)); said = wroteHere(tx, c); if (ofFree) tx.says(ofFree); }, { say: ofFree || reach?.said || null, go: () => [just && reach.own ? [`Just ${reach.own}`, just] : null, reach ? everyPage(said, reach.of) : null].filter(Boolean) });
}
// What a change to a group says it reached, the first of a session on any chart ("Filled all 5 limited partnerships"), with what "Just …" would give it to
// instead; the pen and the outlines say the rest. On a chart of several pages, each says the page it's on ("Filled all 5 funds on Structure").
let reachTold = false;
function firstReach(c, scope, label, value) {
  const n = scope?.outputs && !scope.root && !scope.rest ? countOf(c, scope) : 0, pages = chartViews().length > 1;
  if (n < 2 || (reachTold && !pages)) return null;
  const first = !reachTold;
  reachTold = true;
  const all = allOf(scope, n), of = lowerFirst(all), own = scopesOf(c).scopes.find(x => x.own)?.label, done = label === 'Fill' && value !== 'none' ? `Filled ${of}` : Time.looked(label, value, of), page = pages ? ` on ${viewNamed(c.scene().view)}` : '';
  return { said: `${done}${page}`, page, of, just: first, own: own && lowerFirst(own) };
}
// The notes a change has written on the page shown, and a way for them to go further, as one change.
const wroteHere = (tx, c) => tx.noted?.(r => r.view === c.scene().view).added ?? [];
function everyPage(rows, of) {
  const here = Shell.view.peek(), others = chartViews().filter(v => v.id !== here);
  return others.length && rows.length ? ['On every page', () => App.change(tx => { for (const v of others) for (const r of rows) tx.note(r.label, r.pattern, r.value, { view: v.id, ...(r.param && { param: r.param }) }); }, { dated: false, say: `Gave ${of} the same look on every page` })] : null;
}
const freeSaid = (marks, label, value) => !!marks.length && marks.every(m => m.type === 'shape') && Time.looked(label, value, marks.length > 1 ? `these ${marks.length} shapes` : marks[0].geometry === 'line' ? 'the line' : marks[0].geometry === 'text' ? 'the text box' : marks[0].geometry === 'table' ? these(marks).replace(/^This/, 'the').replace(/^These/, 'these') : 'the shape');
// A choice pointed at, drawn on the chart as it would be: the change written, uncommitted, on the chart's
// rows, and the canvas asked to draw from them; for a size, laid out afresh, as the page may grow for it, and for
// Tidy, the chart laid out with nothing entered. With nothing, the chart is drawn as it is again. Each note tried
// is new, so nothing worked out from another is kept for it.
let tried = null, n = 0;
// A preview only while pointing, or walking the rows by the keys: the focus a popover gives its first row as it opens, or takes back as a submenu closes, isn't that.
let walked = false;
addEventListener('keydown', e => { walked = /^(Arrow|Tab$|Home$|End$)/.test(e.key); }, true);
addEventListener('pointerdown', () => { walked = false; }, true);
function preview(label, value) {
  if (label !== undefined && !walked && window.event?.type === 'focus') return;
  const c = Canvas.active.peek(), key = label === undefined || App.readOnly.peek() ? null : JSON.stringify([label, value]);
  if (!c || key === tried) return;
  tried = key;
  if (!key) return c.restyle(null);
  if (label === 'Tidy') return c.restyle(c.tidied(), { moves: true });
  if (label === 'Tidy for every date') return c.restyle(c.tidiedEvery(), { moves: true });
  c.restyle(trying(c, label, value), label === 'Size' || label === 'Design' || scopeOf(scopesOf(c).scopes)?.root ? { moves: true } : undefined);
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
  const memo = App.ofScene(firsts, sc, () => new Map()), k = JSON.stringify([scope.key, label, value]);
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
  const text = current.field?.it ?? scopeTexts()[0] ?? m.texts?.[0] ?? m.caption, cell = m.geometry === 'table' ? cellOf(m) : null;
  if (cell && label === 'Fill') return cell.fill;
  if (TEXT_LABELS.has(label) && text) return text.look?.[label] ?? text.settings?.[label]?.value;
  // (A part of a design selected: its own, as a free shape's.)
  const part = current.field && Canvas.active.peek()?.partOf(current.field.m, current.field.it);
  if (part) return label === 'Shape' ? part.geometry : part.look?.[label];
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
// The cell of a table picked, as it's drawn.
const cellOf = m => { const at = current?.canvas?.cell?.(m.id); return at ? m.table.rows[at.r]?.cells[at.c] ?? null : null; };
function scopeTexts() {
  if (current.texts) return current.texts;
  const picked = current.marks.length === 1 && current.marks[0].geometry === 'table' ? cellOf(current.marks[0]) : null;
  if (picked) return current.texts = current.canvas.cellsPicked(current.marks[0].id).map(q => q.k.it);
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
  if (Canvas.rich.peek()) return !!Canvas.rich.peek()[label];
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
const shapeGlyph = (g, corner) => html`<svg class="glyph" viewBox="-1 -1 20 16"><path d=${Scene.path(g, 18, 14, corner, g === 'freeform' ? value('Points') : undefined)} /></svg>`;
const ALIGN_ICON = { left: 'align-left', center: 'align-center', right: 'align-right' };

// The choices of one setting in a popover, each previewed while pointed at: a picked one is made, and
// closes the popover where `close` is given. The one the setting has takes the focus as it opens.
const choice = (label, v, close) => ({ onPointerEnter: () => preview(label, v), onFocus: e => { if (e.currentTarget.matches(':focus-visible')) preview(label, v); }, onClick: () => { close?.(); apply(label, v); } });
// A setting's choices as a menu, each previewed while it's pointed at or reached by the keys, the one it has checked.
const choices = (label, list, now, glyphOf = null) => list.map(([v, text]) => ({ label: text, checked: now === v, ...(glyphOf && { glyph: glyphOf(v) }),
  run: () => apply(label, v), point: on => on ? preview(label, v) : preview() }));
// A row of a popover that opens its submenu, as a menu's does, when it's pointed at, clicked or reached by the
// keys; the submenu is the popover's, so the popover stays open beside it.
const Sub = ({ label, items, pane, of, disabled }) => {
  const open = e => !disabled && (pane ? Shell.popover(e.currentTarget, pane, { parent: of, placement: 'right-start', gap: 2, onClose: () => preview() }) : Shell.menu(e.currentTarget, items(), { parent: of, placement: 'right-start', gap: 2 }));
  return html`<button class="menu-item sub" aria-haspopup="menu" disabled=${disabled} onPointerEnter=${open} onClick=${open}
    onKeyDown=${e => { if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); open(e); } }}><span class="label">${label}</span></button>`;
};
// The chart's own colors (dendra.md, The palette): ten, each a slot of a PowerPoint theme's, by what the palette calls them there, and each with its tints and shades by
// PowerPoint's rule, so the swatches read as its own do and a deck's colors are its theme's. Null where the chart hasn't set them: Office's.
const SLOT_NAMES = COLUMNS.map(([n, s]) => s), shaded = Shapes.shaded;
const paletteOf = () => { const p = App.notes.peek().resolve('Palette', { kind: 'View' })?.value; return Array.isArray(p?.colors) && p.colors.length === 10 ? p : null; };
// The swatches of the chart's own colors, each with its tints and shades, named by the color it's of.
const themeOf = p => { const theme = Shapes.swatches(p.colors), names = theme.map((c, i) => { const col = i % 10, row = Math.floor(i / 10), base = p.colors[col], of = colorName(base) ?? base.toUpperCase(); return row ? `${of}, ${(SHADES[col] ?? SHADES.accent)[row - 1]}` : of; }); return { theme, names }; };
// A dialog of the ten: each a color typed or picked, under what a deck's theme calls it, for this chart. One change; a house style carries it.
async function definePalette() {
  if (App.readOnly.peek()) return Shell.toast(App.whyNot());
  const was = paletteOf(), now = { name: was?.name ?? '', colors: [...(was?.colors ?? THEME.slice(0, 10))] };
  const Body = () => { const [, tick] = useState(0); const put = (i, c) => { now.colors[i] = c; tick(n => n + 1); };
    return html`<div class="ex palette-def"><div class="palette-slots">${now.colors.map((c, i) => html`<label class="row"><span class="k">${SLOT_NAMES[i]}</span><input type="color" value=${c} aria-label=${SLOT_NAMES[i]} onInput=${e => put(i, e.target.value)} /><input type="text" class="cell" value=${c.slice(1).toUpperCase()} maxlength="7" spellcheck="false" aria-label=${`${SLOT_NAMES[i]}, hex`} onChange=${e => { const h = hexOf(e.target.value); if (h) put(i, h); else e.target.value = c.slice(1).toUpperCase(); }} /></label>`)}</div></div>`; };
  const go = await Shell.dialog({ title: 'This chart’s colors', width: 420, body: () => html`<${Body} />`, actions: [...(was ? [{ label: 'Back to Office’s', value: 'off' }] : []), { label: 'Cancel', value: false }, { label: 'OK', value: true, primary: true }] });
  if (!go) return;
  App.change(tx => tx.note('Palette', { kind: 'View' }, go === 'off' ? undefined : { colors: now.colors }), { dated: false, say: go === 'off' ? 'Took this chart’s colors off' : 'Set this chart’s colors' });
}
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
// A color's menu: the chart's own, first and large (see ownColors); then More colors, with PowerPoint's whole palette beside it and any color by its hex,
// drawn as it's typed and made with Enter; then what else the popover sets (a fill's Transparency, an outline's Weight and Dashes); and last No fill (or outline).
const NONE = { Fill: 'No fill', Outline: 'No outline' };
function Palette({ label, none, close, of, children }) {
  const mixed = differs(label), v = mixed ? '' : String(value(label)).toLowerCase(), mine = paletteOf(), table = mine ? themeOf(mine) : { theme: THEME, names: THEME_NAMES };
  // (The color it has, taken again, is no change: it stays with its style, not this box's own.)
  const swatch = (c, name, focus = true) => html`<button style=${`background-color:${c}`} aria-pressed=${v === c} autofocus=${focus && v === c} aria-label=${name} data-tip=${name} ...${choice(label, c, close)} onClick=${() => { close?.(); if (v !== c) apply(label, c); }} />`;
  // Off the swatches, the chart is drawn in the color typed, while it's being typed.
  const rest = el => { const f = el.querySelector('.hex > input'), c = f === document.activeElement && hexOf(f.value); c ? preview(label, c) : preview(); };
  const typed = e => { const f = e.currentTarget; f.dataset.why = 'Not a color: #1F3864, say'; f.toggleAttribute('aria-invalid', !!f.value.trim() && !hexOf(f.value)); rest(f.closest('.palette')); };
  const entered = e => { const c = e.key === 'Enter' && hexOf(e.currentTarget.value); if (c) { e.preventDefault(); e.stopPropagation(); close?.(); apply(label, c); } };
  const more = () => html`<div class="palette grid" data-grid=":scope > button" role="group" aria-label="More colors" onPointerLeave=${() => preview()}>${table.theme.map((c, i) => swatch(c, table.names[i], false))}<i />${STANDARD.map((c, i) => swatch(c, STANDARD_NAMES[i], false))}</div>`;
  return html`<div class="palette" role="group" aria-label=${label} onPointerLeave=${e => rest(e.currentTarget)}>
    <div class=${'own' + (mine ? ' set' : '')} data-grid=":scope > button" onPointerLeave=${e => rest(e.currentTarget.parentElement)}>${ownColors().map(c => swatch(c, colorName(c) ?? c.toUpperCase()))}</div>
    <div class="more">
      ${mixed ? html`<div class="menu-head">${mixed}</div>` : null}
      <div class="menu-item withfield"><${Sub} label="More colors" of=${of} pane=${more} />
        <span class="hex">#<input value=${/^#[0-9a-f]{6}$/.test(v) ? v.slice(1).toUpperCase() : ''} maxlength="7" spellcheck="false" autocomplete="off" aria-label="Color by its hex"
          onFocus=${e => e.currentTarget.select()} onInput=${typed} onKeyDown=${entered} /></span></div>
      <button class="menu-item" onClick=${() => { close?.(); drop(label); }}><span class="label">Eyedropper</span>${Shell.icon('Pipette')}</button>
      <button class="menu-item" onClick=${() => { close?.(); definePalette(); }}><span class="label">${mine ? 'Change this chart’s colors…' : 'Set this chart’s colors…'}</span></button>
      ${children}
      ${none ? html`<button class="menu-item" role="menuitemcheckbox" aria-checked=${v === 'none'} autofocus=${v === 'none'} ...${choice(label, 'none', close)}>
        <span class="label">${NONE[label]}</span>${v === 'none' ? Shell.icon('check') : null}</button>` : null}
    </div></div>`;
}
const seg = (label, items, v, { as = x => x, close } = {}) => html`<div class="seg" data-grid=":scope > button" role="group" aria-label=${label} onPointerLeave=${() => preview()}>${items.map(([k, text, tip]) =>
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

// A place chosen in the bar is the pen moved there. The group last chosen for a selection is the one its right part names again.
const liked = signal(null);
function choose(x) { const c = Canvas.active.peek(); if (c?.scene()) penTo(c, scopesOf(c), x); }
// A Styles row aimed at from the panel, or `null`: the pen at that row, with nothing selected: the ribbon's scope, what it
// reaches outlined, till another row's pen, Esc, or a box the row doesn't reach. It sticks, as any place a hand put it does.
let unaim = null;
function aim(g, held = true) {
  unaim?.(); unaim = null;
  aimed.value = g ? { style: g.style, key: Tree.key(g.outputs[0]), outputs: g.outputs, caption: g.caption, swatch: g.swatch, name: g.name, ...(g.rest && { rest: true }), ...(g.general && { general: true }), ...(g.has && { has: true }) } : null;
  if (g) { unaim = Shell.layer(() => pen.home()); if (held && !g.rest && !g.general) level.value = { style: g.style, key: Tree.key(g.outputs[0]) }; }
}
const isAimed = (a, g) => a.style === g.style && g.outputs.some(p => Tree.key(p) === a.key);
const aimedAt = g => !!aimed.value && [aimed.value, ...aimed.value.also ?? []].some(a => isAimed(a, g));
// A Ctrl+click in the Styles list adds that row to what's aimed at, or takes it off, as a Ctrl+click adds to a selection.
function aimAlso(g) {
  const a = aimed.peek();
  if (!a) return aim(g);
  const { also, ...first } = a, list = [first, ...also ?? []], on = list.filter(x => !isAimed(x, g));
  if (!on.length) return void pen.home();
  if (on.length === list.length) on.push({ style: g.style, key: Tree.key(g.outputs[0]), outputs: g.outputs, caption: g.caption, swatch: g.swatch, name: g.name });
  const [one, ...rest] = on;
  aimed.value = rest.length ? { ...one, also: rest } : one;
  level.value = rest.length ? null : { style: one.style, key: one.key };
}
// The two parts: the selection, and the group all like it names (the one last chosen, or the narrowest).
const likeOf = s => { const sc = scopeOf(s.scopes); return !sc || sc.root ? null : !sc.own ? sc : s.scopes.find(x => x.key === liked.peek()) ?? s.narrowest; };
// Ctrl+Shift+A: from the title to where it was, and back.
function toggle() {
  const c = Canvas.active.peek();
  if (!c?.scene()) return false;
  const s = scopesOf(c), sc = scopeOf(s.scopes), like = likeOf(s);
  if (!sc || !like || !s.scopes.some(x => x.own)) return false;
  if (!sc.own) liked.value = sc.key;
  choose(sc.own ? like : s.scopes.find(x => x.own));
  Shell.emit('scope-toggled');
}
// What's in reach of the pen has a thin outline at rest, and nothing else is touched (the canvas's reach). Only what's being
// pointed at dulls the rest, for as long as it's pointed at: the cue. (A Key row or a frame is lit by the canvas as it is.)
function cue(x) {
  const c = Canvas.active.peek();
  if (!c?.scene()) return;
  c.cue(x?.marks ? [...x.marks] : null);
}
function atRest() {
  const c = Canvas.active.peek();
  if (!c?.scene()) return;
  const s = scopesOf(c), sc = scopeOf(s.scopes);
  c.reach?.(sc && !sc.own && !sc.root && sc.marks ? [...sc.marks] : null);
}
// The group that's lit, a Styles row aimed at or a place a hand put the pen, which what comes next takes (dendra.md, What's lit is what's
// meant); null where it's the selection itself, or the pen went there by itself. And what it reaches of a page, whatever a look keeps off it just now.
function lit() {
  const c = Canvas.active.peek();
  if (!c?.scene()) return null;
  const s = scopesOf(c), sc = scopeOf(s.scopes);
  return (s.aim || (level.peek() && s.scopes.some(o => o.own))) && sc && !sc.own && !sc.root && sc.marks ? sc : null;
}
const litOn = (g, page) => (g.style ? marksOf(page, g) : g.marks);

// ---- The popovers ----

// Fill: the palette, then how transparent it is.
const FillPop = ({ close, of }) => html`<${Palette} label="Fill" none close=${close} of=${of}>
  <${Sub} label="Gradient" of=${of} items=${gradientItems} />
  <${Sub} label="Gradient options" of=${of} pane=${() => html`<${StopsPop} label="Gradient" />`} />
  <${Sub} label="Pattern" of=${of} items=${patternItems} />
  <button class="menu-item" onClick=${() => { close?.(); pickFillPicture(); }}><span class="label">Picture…</span></button>
  <${Sub} label="Texture" of=${of} items=${textureItems} />
  <button class="menu-item" disabled=${!value('Picture')} onClick=${() => { close?.(); apply('Picture', null); }}><span class="label">Take the picture off</span></button>
  <${Slider} label="Transparency" k="Transparency" v=${Math.round(value('Transparency') ?? 0)} /></${Palette}>`;
// A picture or a texture filling it, which a gradient and a pattern give way to, as each does to the other.
const fillIs = (label, v) => applyAll([[label, v], ...['Picture', 'Gradient', 'Pattern'].filter(l => l !== label && value(l)).map(l => [l, null])]);
function pickFillPicture() {
  const input = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*' });
  input.onchange = () => { const f = input.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => fillIs('Picture', { src: r.result }); r.readAsDataURL(f); };
  input.click();
}
const tiles = new Map();
const tileOf = id => tiles.get(id) ?? tiles.set(id, Shapes.textureTile(id)).get(id);
// A look tried on what it'd go to, drawn small by the renderer's own hand, for a tile: the first thing the pen has that can be drawn as itself, or, with nothing like that, a plain box.
const PLAIN_TILE = { type: 'shape', geometry: 'rect', w: 96, h: 60, texts: [], look: { Fill: '#dbe3ef', Outline: '#2c4c7c', Weight: 0.75, Dash: 'solid' } };
function drawer({ below = 0 } = {}) {
  const sc = current?.canvas.scene(), drawable = x => x?.type === 'box' || (x?.type === 'shape' && !['line', 'picture', 'group', 'legend', 'table'].includes(x.geometry) && !x.role);
  const m = current?.marks.find(drawable) ?? [...current?.scope?.marks ?? []].map(id => sc?.byId.get(id)).find(drawable);
  const b = (m?.type === 'box' ? Scene.instance(sc, m.id, m.design?.value ?? null, App.notes.peek(), App.computed.peek()) : m) ?? PLAIN_TILE, scale = m ? sc.page.scale ?? 1 : 1;
  return over => Export.tileSvg(b, over, scale, below ? b.h * below : 0);
}
function textureItems() {
  const now = value('Picture'), draw = drawer(), clear = { Gradient: null, Pattern: null };
  return [{ label: 'None', checked: !now?.tile, art: draw({ ...clear, Picture: null }), run: () => apply('Picture', null), point: on => on ? preview('Picture', null) : preview() }, ...Shapes.TEXTURES.map(([id, label]) => { const o = { src: tileOf(id), tile: true, tw: 96, th: 96 }; return { label, art: draw({ ...clear, Picture: o }), checked: now?.src === o.src, run: () => fillIs('Picture', o), point: on => on ? preview('Picture', o) : preview() }; })];
}
// A setting's choices where what it holds is an object: which it has by what it says.
const looksLike = (label, list, now, glyphOf = null) => list.map(([v, text]) => ({ label: text, checked: JSON.stringify(now ?? null) === JSON.stringify(v ?? null), ...(glyphOf && { glyph: glyphOf(v) }), run: () => apply(label, v), point: on => on ? preview(label, v) : preview() }));
// The same as tiles, each drawn with that choice on it.
const tiled = (label, list, now, o) => { const draw = drawer(o); return looksLike(label, list, now).map((it, i) => ({ ...it, art: draw({ [label]: list[i][0] }) })); };
const inkNow = () => { const c = String(value('Outline') ?? ''); return /^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : '#4472c4'; };
const COMPOUNDS = [['single', 'Single'], ['double', 'Double'], ['thick-thin', 'Thick and thin'], ['thin-thick', 'Thin and thick'], ['triple', 'Triple']];
function lineGradientItems() {
  const from = inkNow(), now = value('Line Gradient') ?? null, of = (to, angle) => ({ angle, stops: [[0, from], [100, to]] });
  return looksLike('Line Gradient', [[null, 'None'], [of(shaded(from, 0.4, 0.6), 0), 'Lighter, across'], [of(shaded(from, 0.5, 0), 0), 'Darker, across'], [of(shaded(from, 0.4, 0.6), 90), 'Lighter, down'], [of('#ffffff', 0), 'To white, across']], now);
}
// A color for what's set in the look: the chart's, then typed.
function ColorRow({ label, v, put, tries }) {
  const own = ownColors().slice(0, 6), hex = String(v ?? '').replace('#', '').toUpperCase();
  return html`<div class="menu-item colorrow"><span class="label">${label}</span><span class="chips" onPointerLeave=${() => tries?.(null)}>${own.map(c => html`<button type="button" aria-label=${colorName(c) ?? c} aria-pressed=${String(v).toLowerCase() === c.toLowerCase()} style=${`background:${c}`} onPointerEnter=${() => tries?.(c)} onClick=${() => put(c)} />`)}</span><span class="hex">#<input value=${hex} maxlength="7" spellcheck="false" autocomplete="off" aria-label=${label} onFocus=${e => e.currentTarget.select()} onKeyDown=${e => { e.stopPropagation(); const c = e.key === 'Enter' && hexOf(e.currentTarget.value); if (c) { e.preventDefault(); put(c); } }} /></span></div>`;
}
// A gradient's stops, as PowerPoint's Format Shape: its bar, a click there a stop more, a stop dragged along it moved, off it or by Delete taken away; the one picked, its color and place; the whole, its angle. Each drawn on the chart as it's changed, one change as it's let go.
function StopsPop({ label }) {
  readNow();
  const base = String(value({ Gradient: 'Fill', 'Text Gradient': 'Color' }[label] ?? 'Outline') ?? ''), from = /^#[0-9a-f]{6}$/i.test(base) ? base.toLowerCase() : '#4472c4', now = value(label), [g, setG] = useState(now?.stops?.length >= 2 ? { angle: now.angle ?? 0, stops: now.stops.map(s => [...s]) } : { angle: label === 'Line Gradient' ? 0 : 90, stops: [[0, from], [100, shaded(from, 0.4, 0.6)]] }), [at, setAt] = useState(0), bar = useRef();
  const sorted = st => [...st].sort((a, b) => a[0] - b[0]), said = o => ({ ...o, stops: sorted(o.stops) }), put = next => { setG(next); apply(label, said(next)); };
  const css = `linear-gradient(90deg, ${sorted(g.stops).map(([p, c]) => `${c} ${p}%`).join(', ')})`, pick = g.stops[at] ?? g.stops[0];
  const place = e => { const b = bar.current.getBoundingClientRect(); return Math.round(Math.max(0, Math.min(100, (e.clientX - b.left) / b.width * 100))); };
  const mix = p => { const st = sorted(g.stops), i = Math.max(0, st.findIndex(s => s[0] >= p) - 1), A = st[i], B = st[i + 1] ?? A, k = B[0] > A[0] ? Math.max(0, Math.min(1, (p - A[0]) / (B[0] - A[0]))) : 0, ch = c => [1, 3, 5].map(j => parseInt(c.slice(j, j + 2), 16)); return `#${ch(A[1]).map((v, j) => Math.round(v + (ch(B[1])[j] - v) * k).toString(16).padStart(2, '0')).join('')}`; };
  const addAt = p => { const stops = [...g.stops, [p, mix(p)]]; setAt(stops.length - 1); put({ ...g, stops }); };
  const out = i => { if (g.stops.length < 3) return; const stops = g.stops.filter((_, j) => j !== i); setAt(0); put({ ...g, stops }); };
  const grab = (e, i) => {
    e.preventDefault(); e.stopPropagation(); setAt(i);
    let next = g, off = false;
    const move = ev => { const b = bar.current.getBoundingClientRect(); off = g.stops.length > 2 && (ev.clientY < b.top - 28 || ev.clientY > b.bottom + 28); next = { ...g, stops: off ? g.stops.filter((_, j) => j !== i) : g.stops.map((s, j) => j === i ? [place(ev), s[1]] : s) }; setG(next); preview(label, said(next)); };
    const up = () => { removeEventListener('pointermove', move, true); removeEventListener('pointerup', up, true); if (off) setAt(0); if (next !== g) apply(label, said(next)); };
    addEventListener('pointermove', move, true); addEventListener('pointerup', up, true);
  };
  return html`<div class="picker stops" onKeyDown=${e => { if ((e.key === 'Delete' || e.key === 'Backspace') && !e.target.matches('input')) { e.preventDefault(); out(at); } }}>
    <div class="menu-head">Stops</div>
    <div class="stopbar" ref=${bar} style=${`background:${css}`} role="group" aria-label="Stops" onPointerDown=${e => { if (e.target === bar.current) addAt(place(e)); }}>${g.stops.map(([p, c], i) => html`<button type="button" class=${i === at ? 'stop on' : 'stop'} aria-label=${`Stop at ${p}%`} aria-pressed=${i === at} style=${`left:${p}%;background:${c}`} onPointerDown=${e => grab(e, i)} />`)}</div>
    <${ColorRow} label="Color" v=${pick[1]} put=${c => put({ ...g, stops: g.stops.map((s, j) => j === at ? [s[0], c] : s) })} tries=${c => c === null ? preview() : preview(label, said({ ...g, stops: g.stops.map((s, j) => j === at ? [s[0], c] : s) }))} />
    <label class="menu-item"><span class="label">Place</span><${Typed} label="Place" v=${pick[0]} unit="%" max=${100} put=${x => put({ ...g, stops: g.stops.map((s, j) => j === at ? [x, s[1]] : s) })} /></label>
    <label class="menu-item"><span class="label">Angle</span><${Typed} label="Angle" v=${g.angle} unit="°" max=${359} put=${x => put({ ...g, angle: x })} tries=${x => x === null ? preview() : preview(label, said({ ...g, angle: x }))} /></label>
    <div class="row"><button type="button" class="btn" onClick=${() => addAt(Math.round((pick[0] + (sorted(g.stops).find(s => s[0] > pick[0])?.[0] ?? 100)) / 2))}>Add a stop</button><button type="button" class="btn" disabled=${g.stops.length < 3} onClick=${() => out(at)}>Delete it</button></div>
  </div>`;
}
// A glow's color, size and transparency, as PowerPoint's Format Shape.
function GlowPop() {
  readNow();
  const base = value('Glow') ?? { size: 8, color: inkNow(), transparency: 60 }, set = changes => apply('Glow', { ...base, ...changes }), tries = k => x => x === null ? preview() : preview('Glow', { ...base, [k]: x });
  return html`<div class="picker"><div class="menu-head">Glow</div>
    <${ColorRow} label="Color" v=${base.color} put=${c => set({ color: c })} tries=${tries('color')} />
    <label class="menu-item"><span class="label">Size</span><${Typed} label="Glow size" v=${base.size} unit="pt" max=${150} put=${x => set({ size: x })} tries=${tries('size')} /></label>
    <label class="menu-item"><span class="label">Transparency</span><${Typed} label="Glow transparency" v=${base.transparency} unit="%" max=${100} put=${x => set({ transparency: x })} tries=${tries('transparency')} /></label></div>`;
}
const MATERIALS = [['matte', 'Matte'], ['warmMatte', 'Warm matte'], ['plastic', 'Plastic'], ['metal', 'Metal'], ['dkEdge', 'Dark edge'], ['softEdge', 'Soft edge'], ['flat', 'Flat'], ['softmetal', 'Soft metal'], ['clear', 'Clear'], ['powder', 'Powder']];
function BevelPop() {
  readNow();
  const base = value('Bevel') ?? { type: 'circle', w: 6, h: 6 }, set = changes => apply('Bevel', { ...base, ...changes }), tries = k => x => x === null ? preview() : preview('Bevel', { ...base, [k]: x });
  return html`<div class="picker"><div class="menu-head">Bevel</div>
    <label class="menu-item"><span class="label">Width</span><${Typed} label="Bevel width" v=${base.w ?? 6} unit="pt" max=${200} put=${x => set({ w: x })} tries=${tries('w')} /></label>
    <label class="menu-item"><span class="label">Height</span><${Typed} label="Bevel height" v=${base.h ?? base.w ?? 6} unit="pt" max=${200} put=${x => set({ h: x })} tries=${tries('h')} /></label>
    <label class="menu-item"><span class="label">Depth</span><${Typed} label="Depth" v=${base.depth ?? 0} unit="pt" max=${400} put=${x => set({ depth: x || undefined })} /></label>
    <label class="menu-item"><span class="label">Material</span><${Shell.Pick} label="Material" value=${base.material ?? 'warmMatte'} onPick=${v => set({ material: v })} options=${MATERIALS} /></label></div>`;
}
// Shape Effects, as PowerPoint's, every one of them: each a tile of what's selected with it on, drawn on the chart as it's pointed at, one change as it's picked.
function glowItems() { const g = value('Glow'), c = g?.color ?? inkNow(); return tiled('Glow', [[null, 'None'], ...[5, 8, 11, 18].map(size => [{ size, color: c, transparency: g?.transparency ?? 60 }, `${size} pt`])], g); }
const softItems = () => tiled('Soft Edge', [[0, 'None'], [1, '1 pt'], [2.5, '2.5 pt'], [5, '5 pt'], [10, '10 pt'], [25, '25 pt']], value('Soft Edge') ?? 0);
const reflectionItems = () => tiled('Reflection', [[null, 'None'], [{ size: 35, transparency: 48, distance: 0, blur: 0.5 }, 'A third, touching'], [{ size: 55, transparency: 50, distance: 0, blur: 0.5 }, 'Half, touching'], [{ size: 90, transparency: 50, distance: 0, blur: 0.5 }, 'Whole, touching'], [{ size: 35, transparency: 48, distance: 4, blur: 1 }, 'A third, 4 pt off'], [{ size: 55, transparency: 50, distance: 4, blur: 1 }, 'Half, 4 pt off']], value('Reflection'), { below: 1.1 });
const innerItems = () => tiled('Inner Shadow', [['none', 'None'], ...[[45, 'Top left'], [135, 'Top right'], [225, 'Bottom right'], [315, 'Bottom left'], [90, 'Top'], [270, 'Bottom']].map(([angle, name]) => [{ blur: 5, distance: 3, angle, color: '#000000', transparency: 50 }, name]), [{ blur: 9, distance: 0, angle: 0, color: '#000000', transparency: 50 }, 'All round']], value('Inner Shadow') ?? 'none');
const bevelItems = () => { const b = value('Bevel'), keep = { w: b?.w ?? 6, h: b?.h ?? 6, ...(b?.depth && { depth: b.depth }), ...(b?.material && { material: b.material }) }; return tiled('Bevel', [[null, 'None'], ...[['circle', 'Round'], ['relaxedInset', 'Soft, inset'], ['coolSlant', 'Slanted'], ['angle', 'Angled'], ['softRound', 'Soft, round'], ['convex', 'Domed'], ['slope', 'Sloped'], ['artDeco', 'Stepped']].map(([type, name]) => [{ type, ...keep }, name])], b); };
const turn3dItems = () => tiled('Turn 3D', [[null, 'None'], [{ x: 45, y: 35, z: 0 }, 'Corner on, to the left'], [{ x: 315, y: 35, z: 0 }, 'Corner on, to the right'], [{ x: 30, y: 0, z: 0 }, 'Turned left'], [{ x: 330, y: 0, z: 0 }, 'Turned right'], [{ x: 0, y: 30, z: 0 }, 'Tilted back'], [{ x: 0, y: 330, z: 0 }, 'Tilted forward']], value('Turn 3D'));
const EffectRows = ({ of }) => html`<div class="menu-sep" />
  <${Sub} label="Glow" of=${of} items=${glowItems} /><${Sub} label="Glow options" of=${of} pane=${() => html`<${GlowPop} />`} /><${Sub} label="Soft edges" of=${of} items=${softItems} /><${Sub} label="Reflection" of=${of} items=${reflectionItems} /><${Sub} label="Inner shadow" of=${of} items=${innerItems} /><${Sub} label="Bevel" of=${of} items=${bevelItems} /><${Sub} label="Bevel options" of=${of} pane=${() => html`<${BevelPop} />`} /><${Sub} label="3-D rotation" of=${of} items=${turn3dItems} />`;
// A square throwing a shadow, the Effects button's: what the word means, as the bucket does for Fill.
const effectsGlyph = html`<svg class="glyph fx" viewBox="0 0 16 16" aria-hidden="true"><path class="shade" d="M5 5h10v10H5z" /><path d="M1.75 1.75h10.5v10.5H1.75z" /></svg>`;
// A gradient, as PowerPoint's: none, or linear, from the fill to a color lighter or darker of it, or to white; by which way it runs. Its stops say how, and its Fill is what it
// starts from, so a gradient taken off leaves the fill it had.
function gradientItems() {
  const now = value('Gradient') ?? null, base = String(value('Fill') ?? '#4472c4'), from = /^#[0-9a-f]{6}$/i.test(base) ? base.toLowerCase() : '#4472c4';
  const ends = [['Lighter', shaded(from, 0.4, 0.6)], ['Darker', shaded(from, 0.5, 0)], ['To white', '#ffffff']], ways = [[90, 'Down'], [0, 'Across'], [45, 'Diagonally down'], [315, 'Diagonally up']];
  const of = (to, angle) => ({ angle, stops: [[0, from], [100, to]] }), is = g => JSON.stringify(g) === JSON.stringify(now), draw = drawer();
  const set = g => ({ art: draw({ Gradient: g, Pattern: null, Picture: null }), run: () => g && value('Pattern') ? applyAll([['Gradient', g], ['Pattern', null]]) : apply('Gradient', g), point: on => on ? preview('Gradient', g) : preview() });
  return [{ label: 'None', checked: !now, ...set(null) }, ...ends.flatMap(([word, to]) => ways.slice(0, 2).map(([angle, way]) => ({ label: `${word}, ${way.toLowerCase()}`, checked: is(of(to, angle)), ...set(of(to, angle)) }))), '-',
    ...ways.map(([angle, way]) => ({ label: way, disabled: !now, checked: now?.angle === angle, ...(now && { ...set({ ...now, angle }), art: undefined }) }))];
}
// A pattern, as PowerPoint's: none, or one of its own, in the outline's color over the fill, which a gradient gives way to.
function patternItems() {
  const now = value('Pattern') ?? null, line = String(value('Outline') ?? ''), fg = /^#[0-9a-f]{6}$/i.test(line) ? line.toLowerCase() : '#000000', draw = drawer();
  const set = p => ({ art: draw({ Pattern: p, Gradient: null, Picture: null }), run: () => p && value('Gradient') ? applyAll([['Pattern', p], ['Gradient', null]]) : apply('Pattern', p), point: on => on ? preview('Pattern', p) : preview() });
  return [{ label: 'None', checked: !now, ...set(null) }, ...Shapes.PATTERNS.map(([prst, label]) => ({ label, checked: now?.prst === prst, ...set({ prst, fg: now?.fg ?? fg }) }))];
}
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
  return html`<${Palette} label="Outline" none close=${close} of=${of}>
    <div class="menu-sep" />
    ${mixed ? html`<div class="menu-head">${mixed}</div>` : null}
    <div class="menu-item withfield"><${Sub} label="Weight" of=${of} items=${() => choices('Weight', WEIGHTS.map(w => [w, `${w} pt`]), weight, weightGlyph)} /><${Typed} label="Weight" v=${now} unit="pt" min=${0.25} step=${0.25} put=${x => apply('Weight', x)} tries=${x => x === null ? preview() : preview('Weight', x)} /></div>
    <${Sub} label="Dashes" of=${of} items=${() => { const d = differs('Dash'); return [...(d ? [{ head: d }] : []), ...choices('Dash', DASH_NAMES, d ? null : value('Dash'), lineGlyph)]; }} />
    <${Sub} label="Compound" of=${of} items=${() => choices('Compound', COMPOUNDS, value('Compound') ?? 'single')} />
    <${Sub} label="Gradient" of=${of} items=${lineGradientItems} />
    <${Sub} label="Gradient options" of=${of} pane=${() => html`<${StopsPop} label="Line Gradient" />`} />
    <${Slider} label="Transparency" k="Line Transparency" v=${Math.round(value('Line Transparency') ?? 0)} />
    <${Sub} label="Arrows" of=${of} disabled=${!lines} items=${arrowItems} />
    <${Sub} label="Route" of=${of} disabled=${!lines} items=${() => choices('Connector', [['elbow', 'Elbow'], ['straight', 'Straight']], value('Connector'))} />
    <${Sub} label="Frame" of=${of} disabled=${!framed} items=${() => choices('Frame', [['none', 'None'], ['dashed', 'Dashed box'], ['solid', 'Box'], ['bracket', 'Bracket']], value('Frame') ?? 'none', frameGlyph)} />
    <div class="menu-sep" /></${Palette}>`;
}
// Shape: PowerPoint's basic shapes, each a preset of its in the deck, a rounded rectangle's Rounding, and its Shadow. It
// stays open as a shape is picked, so what goes with it is there to set.
const SHAPES = Shapes.list;
// PowerPoint's outer shadows, by which way each is thrown: its angle, clockwise from the right, and whether it has one; the middle, none, all round.
const THROWN = [[-1, -1, 225, 'Top left'], [0, -1, 270, 'Top'], [1, -1, 315, 'Top right'], [-1, 0, 180, 'Left'], [0, 0, null, 'Centered'], [1, 0, 0, 'Right'], [-1, 1, 135, 'Bottom left'], [0, 1, 90, 'Bottom'], [1, 1, 45, 'Bottom right']];
function ShadowPicker({ of }) {
  const v = value('Shadow'), o = Scene.shadowOf(v), base = o ?? Scene.shadowOf('soft'), draw = drawer();
  const same = t => !!o && (t[2] === null ? o.distance === 0 : o.distance > 0 && Math.abs(o.angle - t[2]) < 0.5);
  const preset = t => ({ ...base, distance: t[2] === null ? 0 : base.distance || 3, angle: t[2] ?? 0, ...(t[2] === null && { blur: 5 }) });
  return html`<div class="shadow">
    <div class="menu-head">Shadow</div>
    <div class="throw" data-grid=":scope > button" role="group" aria-label="Shadow" onPointerLeave=${() => preview()}>${THROWN.map(t => html`<button class="tile" aria-label=${t[3]} data-tip=${t[3]} aria-pressed=${same(t)} onPointerEnter=${() => preview('Shadow', preset(t))} onFocus=${() => { if (document.documentElement.dataset.hand === 'keys') preview('Shadow', preset(t)); }} onClick=${() => apply('Shadow', preset(t))}><span class="art" dangerouslySetInnerHTML=${{ __html: draw({ Shadow: preset(t) }) }} /></button>`)}</div>
    <button class="menu-item noshadow" role="menuitemcheckbox" aria-checked=${!o} onPointerEnter=${() => preview('Shadow', 'none')} onPointerLeave=${() => preview()} onClick=${() => apply('Shadow', 'none')}><span class="label">No shadow</span>${!o ? Shell.icon('check') : null}</button>
    <${Sub} label="Shadow options" of=${of} pane=${() => html`<${ShadowOptions} />`} />
  </div>`;
}
// What a shadow is, each typed, what it had staying.
function ShadowOptions() {
  readNow();
  const o = Scene.shadowOf(value('Shadow')), base = o ?? Scene.shadowOf('soft'), set = changes => apply('Shadow', { ...base, ...changes }), tries = k => x => x === null ? preview() : preview('Shadow', { ...base, [k]: x });
  const hex = o ? o.color.slice(1).toUpperCase() : '000000';
  return html`<div class="shadow options">
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
function ShapePop({ close, of }) {
  readNow();
  const [picked, setPicked] = useState(null);
  const now = picked ?? value('Shape') ?? current?.marks[0]?.geometry ?? 'rect', rounded = now === 'rounded';
  return html`<div class="picker shape">
    <div class="gallery" data-grid=".shapes > button" role="group" aria-label="Shape" onPointerLeave=${() => preview()}>${Shapes.gallery().map(g => html`<div class="menu-head">${g.head}</div><div class="shapes">${g.shapes.map(([id, name]) => html`<button aria-label=${name} data-tip=${name} aria-pressed=${now === id} autofocus=${now === id} onPointerEnter=${() => preview('Shape', id)} onFocus=${e => { if (e.currentTarget.matches(':focus-visible')) preview('Shape', id); }} onClick=${() => { setPicked(id); apply('Shape', id); }}>${shapeGlyph(id)}</button>`)}</div>`)}</div>
    <${Slider} label="Rounding" k="Corner" v=${Math.round(value('Corner') ?? Scene.CORNER)} max="50" disabled=${!rounded} />
    <button class="menu-item" disabled=${current?.marks.length !== 1} onClick=${() => { close?.(); Canvas.active.peek()?.editPoints(); }}><span class="label">Edit points</span></button>
  </div>`;
}
// Effects, as PowerPoint's Shape Effects: its shadow, its other effects, each its own.
function EffectsPop({ of }) {
  readNow();
  return html`<div class="picker effects"><${ShadowPicker} of=${of} /><${EffectRows} of=${of} /></div>`;
}
// Paragraph: the text's alignment across, its place down the box, and its line spacing.
// On a free shape or text box, as PowerPoint's Paragraph and Text Box panes: bullets and numbers, how far it's indented, its inner margins (points, as printed, each side typed), and Shrink on
// overflow. While part of a text is selected as it's typed, that part's superscript or subscript.
const ParagraphPop = () => { readNow(); const ms = current?.marks ?? [], free = !!ms.length && ms.every(m => m.type === 'shape' && !['line', 'picture', 'group', 'legend', 'table'].includes(m.geometry) && !m.role), rich = Canvas.rich.value, inset = value('Inset'), side = (k, d) => inset?.[k] ?? d;
  const setSide = k => x => apply('Inset', { l: side('l', 7.2), t: side('t', 3.6), r: side('r', 7.2), b: side('b', 3.6), [k]: x });
  return html`<div class="picker">
  <div class="row"><span class="k">Align</span>${seg('Align', ['left', 'center', 'right'].map(a => [a, Shell.icon(ALIGN_ICON[a]), `Align ${a}`]), value('Align'))}</div>
  <div class="row"><span class="k">Position</span>${seg('Valign', [['top', 'Top'], ['middle', 'Middle'], ['bottom', 'Bottom']], value('Valign') ?? 'middle')}</div>
  <div class="row"><span class="k">Spacing</span>${seg('Spacing', [[1, '1.0'], [1.15, '1.15'], [1.5, '1.5'], [2, '2.0']], value('Spacing') ?? 1)}</div>
  ${rich ? html`<div class="row"><span class="k">Raised</span><div class="seg"><button aria-pressed=${!rich.Base} onClick=${() => apply('Base', undefined)}>Normal</button><button aria-pressed=${rich.Base === 'up'} onClick=${() => apply('Base', 'up')}>Superscript</button><button aria-pressed=${rich.Base === 'down'} onClick=${() => apply('Base', 'down')}>Subscript</button></div></div>` : null}
  ${free ? html`<div class="menu-sep" />
    <div class="row"><span class="k">Bullets</span>${seg('Bullet', [['none', 'None'], ['bullet', 'Bullets'], ['number', 'Numbers']], value('Bullet') ?? 'none')}</div>
    <div class="row"><span class="k">Direction</span>${seg('Direction', [['across', 'Across'], ['down', 'Down'], ['up', 'Up']], value('Direction') ?? 'across')}</div>
    <label class="menu-item"><span class="label">Columns</span><${Typed} label="Columns" v=${value('Columns')?.n ?? 1} max=${6} min=${1} put=${x => apply('Columns', x > 1 ? { n: x, gap: value('Columns')?.gap ?? 7.2 } : null)} /></label>
    <label class="menu-item"><span class="label">Indent</span><${Typed} label="Indent" v=${value('Indent') ?? 0} unit="pt" max=${200} step=${1} put=${x => apply('Indent', x || null)} /></label>
    <label class="menu-item"><span class="label">First line</span><${Typed} label="First line" v=${value('First Line') ?? 0} unit="pt" min=${-200} max=${200} step=${1} put=${x => applyAll(x < 0 && !(value('Indent') > 0) ? [['First Line', x], ['Indent', -x]] : [['First Line', x || null]])} /></label>
    <label class="menu-item"><span class="label">Tab stops</span><input class="cell tabs" aria-label="Tab stops" spellcheck="false" placeholder="72, 144" value=${(value('Tabs') ?? []).join(', ')} onChange=${e => { const list = e.currentTarget.value.split(/[,\s]+/).map(parseFloat).filter(v => v > 0).sort((a, b) => a - b); apply('Tabs', list.length ? list : null); }} onKeyDown=${e => { e.stopPropagation(); if (e.key === 'Enter') e.currentTarget.blur(); }} /></label>
    <div class="menu-head">Inner margins</div>
    ${[['Left', 'l', 7.2], ['Top', 't', 3.6], ['Right', 'r', 7.2], ['Bottom', 'b', 3.6]].map(([label, k, d]) => html`<label class="menu-item"><span class="label">${label}</span><${Typed} label=${`Inner margin, ${label}`} v=${side(k, d)} unit="pt" max=${200} step=${0.5} put=${setSide(k)} /></label>`)}
    <label class="menu-item check"><input type="checkbox" checked=${!!value('Shrink')} onChange=${e => apply('Shrink', e.target.checked)} /><span class="label">Shrink text on overflow</span></label>` : null}
</div>`; };

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
  const sections = [[null, typed ? [typed] : []], ['Theme fonts', ['Heading', 'Body'].filter(has)], ['This chart', chartFonts().filter(f => has(f) && f !== 'Heading' && f !== 'Body')], ...KINDS.map(([k, head]) => [head, Scene.FONTS.filter(f => f.kind === k && has(f.name)).map(f => f.name)])];
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
      ${fs.map(f => { const k = i++, real = Scene.fontName(f), here = onComputer(real); return html`<div role="option" aria-selected=${f === now} class=${'menu-item' + (k === active ? ' on' : '') + (here ? '' : ' away')}
        data-tip=${here ? null : 'Not on this computer'} onPointerMove=${() => k !== active && setAt(k)} onClick=${() => pick(f)}>
        <span class="check">${f === now ? Shell.icon('check') : null}</span><span class="label" style=${`font-family:${Scene.fontFamily(f)}`}>${real === f ? f : `${f} · ${real}`}</span></div>`; })}`)}
      ${!items.length ? html`<div class="menu-none">No match</div>` : null}
    </div>
    <button type="button" class="menu-item" onClick=${() => { close(); defineFonts(); }}><span class="label">Theme fonts…</span></button></div>`;
}
// The chart's two fonts by reference: what Heading and Body are. One change, and every text that says one follows, the deck's by PowerPoint's own Theme Fonts.
async function defineFonts() {
  if (App.readOnly.peek()) return Shell.toast(App.whyNot());
  const was = App.notes.peek().resolve('Theme Fonts', { kind: 'View' })?.value, now = { heading: Scene.fontName('Heading'), body: Scene.fontName('Body') }, names = Scene.FONTS.map(f => f.name);
  const row = (key, label) => html`<label class="row"><span class="k">${label}</span><input class="cell" type="text" list="themefonts" value=${now[key]} aria-label=${label} spellcheck="false" onFocus=${e => e.currentTarget.select()} onInput=${e => { now[key] = e.currentTarget.value.trim() || now[key]; }} /></label>`;
  const go = await Shell.dialog({ title: 'Theme fonts', width: 380, body: () => html`<div class="ex palette-def"><datalist id="themefonts">${names.map(f => html`<option value=${f} />`)}</datalist>${row('heading', 'Heading')}${row('body', 'Body')}</div>`, actions: [{ label: 'Cancel', value: false }, { label: 'OK', value: true, primary: true }] });
  if (!go || (was?.heading === now.heading && was?.body === now.body)) return;
  App.change(tx => tx.note('Theme Fonts', { kind: 'View' }, now), { dated: false, say: `Made the theme fonts ${now.heading} and ${now.body}` });
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
    <button class="dd" data-fb="sizes" aria-label="Font sizes" disabled=${disabled} onClick=${e => opener.size(e.currentTarget)} /></span>`;
}

// ---- The format painter, and Clear formatting ----

// The look a mark has: what it draws by, its box's or its line's, and its first text's; a weight as the slide has it,
// as the bar writes it. Never what it is or where, as PowerPoint's painter copies none of them: not its shape or its corners,
// its record's Format, its frame, its layer or its route.
const BOX_LOOK = ['Fill', 'Gradient', 'Pattern', 'Picture', 'Transparency', 'Outline', 'Weight', 'Dash', 'Compound', 'Line Gradient', 'Line Transparency', 'Shadow', 'Glow', 'Soft Edge', 'Reflection', 'Inner Shadow', 'Bevel', 'Turn 3D', 'Valign'];
const LINE_LOOK = ['Outline', 'Weight', 'Dash', 'Compound', 'Line Gradient', 'Line Transparency', 'Arrow', 'Arrowhead'];
const TEXT_LOOK = ['Font', 'Size', 'Bold', 'Italic', 'Underline', 'Strike', 'Color', 'Text Gradient', 'Text Outline', 'Align', 'Spacing'];
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
  painter.value = { once };
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
  new window.EyeDropper().open().then(r => { const c = hexOf(r.sRGBHex); if (c) apply(label, c); },
    e => { if (e?.name === 'AbortError') Shell.toast('Put the eyedropper down'); else armDropper(label); });
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
  // A look that makes the Key say what isn't so, said at once: it's still what was asked for.
  sayLies(sc);
  return true;
}
const sayLies = before => { const was = new Set(Scene.keyLies(before).map(x => x.b.id)), now = Scene.keyLies(App.scene.peek()).filter(x => !was.has(x.b.id)), st = App.state.peek(); if (now.length) setTimeout(() => Shell.toast(`${App.notes.peek().nameOf(st, now[0].b.record)} now looks like ${now[0].row.caption} in the Key, but isn’t one${now.length > 1 ? `, and ${now.length - 1} more` : ''}`, { ms: 5000, undo: () => Shell.parts.peek().undo?.undo() })); };
// A click with the painter armed pastes on what's clicked, selecting it, at its scope; on the page, it disarms. With
// the eyedropper, it takes the color clicked.
function painting(e) {
  const c = Canvas.active.peek(), p = painter.peek(), d = dropper.peek();
  // A press on the chart ends an aim, the painter's and the eyedropper's aside.
  // (But a right-click, which asks what comes next of what's lit.)
  if (!p && !d && e.button !== 2 && aimed.peek() && c?.root.contains(e.target)) aim(null);
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

// Insert: a box of each of the chart's kinds, a record named as it's typed; then the shapes PowerPoint has. Its rows are the same whatever's selected, so each stays under the hand: what can't be now greys, and says why.
function insertMenu(e, c) {
  const item = (label, run, close, why = null) => html`<button type="button" class="menu-item" role="menuitem" aria-disabled=${why ? 'true' : null} data-tip=${why} onClick=${() => { if (why) return; close(); run(); }}><span class="label">${label}</span></button>`;
  // (In one order, so what's on top now is on top next time: drawing two of a kind moves nothing under the hand.)
  // (What goes where the pen is: words in what's selected, and a footnote, a page's, of what has words: so no table's, and nothing on the master.)
  const kinds = [...Canvas.kinds()].sort(), mastering = c.scene()?.view === Scene.MASTER, ms = c.selected(), one = ms.length === 1 ? ms[0] : null, bound = one?.type === 'box' || one?.type === 'line', noted = !mastering && (bound || (one?.type === 'shape' && !one.role && !['legend', 'group', 'line', 'picture', 'table'].includes(one.geometry)));
  // A shape, a line or an arrow is drawn on the chart by dragging, a click placing it at its size (or Enter, in free room); a text box is typed straight in, or drawn too.
  // One picker for the arrows, top to bottom, and across among the shapes; each shape says its name as the keys land on it.
  const offMaster = 'Not on the master';
  Shell.popover(e.currentTarget, close => html`<div class="insert" role="menu" data-grid="button">
    <div class="rows">
      ${kinds.map(k => item(k, () => c.create(k), close))}${kinds.length ? html`<div class="menu-sep" />` : null}
      ${item(one?.type === 'line' ? 'Text on this line' : 'Text in this box', () => c.addText(one.id), close, bound ? null : 'Select a box first')}${item('Footnote', () => c.footnote(one.id), close, noted ? null : mastering ? offMaster : 'Select what it’s about first')}
      <div class="menu-sep" />
      ${[['text', 'Text box'], ['line', 'Line'], ['arrow-line', 'Arrow'], ['frame', 'Frame'], ['legend', 'Key'], ['picture', 'Picture']].map(([g, name]) =>
        item(name, () => g === 'picture' ? picture(c) : g === 'text' ? c.drawText() : g === 'line' || g === 'arrow-line' ? c.draw(g) : c.insert(g), close, mastering && ['legend', 'frame'].includes(g) ? offMaster : null))}
      ${item('Picture from clipboard', () => pictureOffClipboard(c), close)}
      ${item('Table', () => tablePick(document.querySelector('.fb [data-fb="insert"]'), c), close)}
      ${item('Icon', () => iconPick(document.querySelector('.fb [data-fb="insert"]'), c), close)}
      ${item('Freeform', () => c.draw('freeform'), close)}
      ${item('Curve', () => c.draw('curve'), close)}
      ${mastering ? html`<div class="menu-sep" />${[['Footer', 'text'], ['Date', 'date'], ['Page number', 'number']].map(([name, k]) => html`<button class="menu-item" role="menuitemcheckbox" aria-checked=${!!footNote()[k]} onClick=${() => { close(); masterFoot(c, k); }}><span class="label">${name}</span>${footNote()[k] ? Shell.icon('check') : null}</button>`)}` : null}
      ${typeof Table === 'undefined' ? null : html`<div class="menu-sep" />${item('Import…', () => Table.importFile(), close, mastering ? offMaster : null)}`}
    </div>
    <div class="gallery">${Shapes.gallery().map(g => html`<div class="menu-head">${g.head}</div><div class="shapes">${g.shapes.map(([id, name]) => html`<button aria-label=${name} data-tip=${name} onClick=${() => { close(); c.draw(id); }}>${shapeGlyph(id)}</button>`)}</div>`)}</div>
  </div>`, { placement: 'bottom-start' });
}
// The master's placeholders, as PowerPoint's: its footer, typed where it stands; the day each page shows; its number. On every page, the chart's own Footer note. A placeholder that's there, taken off.
function masterFoot(c, k) {
  const { format, ...f } = footNote(), on = !!f[k], next = k === 'text' ? { ...f, text: on ? '' : 'Footer' } : { ...f, [k]: !on }, named = { text: 'the footer', date: 'the date', number: 'the page number' }[k];
  App.change(tx => tx.note('Footer', { kind: 'View' }, next.text || next.number || next.date ? { ...next, ...(format && { format }) } : undefined), { dated: false, say: `${on ? 'Took' : 'Put'} ${named} ${on ? 'off the master' : 'on the master'}` });
  if (k === 'text' && !on) setTimeout(() => c.edit(Scene.FOOTER));
}
// A table by its rows and columns, as PowerPoint's Insert Table: pointed at, how many; with a box selected, a table that reads one of its lists, live.
function TablePick({ c, close }) {
  const [at, setAt] = useState([0, 0]), st = App.state.peek(), N = App.notes.peek(), one = c.selected().length === 1 && c.selected()[0].type === 'box' ? c.selected()[0] : null, lists = one ? Scene.listsAt(st, N, one.record) : [];
  return html`<div class="tablepick" role="menu">
    <div class="menu-head">${at[0] ? `${at[0]} × ${at[1]} table` : 'Table'}</div>
    <div class="grid" data-grid="button" onPointerLeave=${() => setAt([0, 0])}>${Array.from({ length: 6 * 8 }, (_, i) => { const r = Math.floor(i / 8) + 1, k = i % 8 + 1; return html`<button type="button" aria-label=${`${r} rows, ${k} columns`} class=${r <= at[0] && k <= at[1] ? 'on' : ''} onPointerEnter=${() => setAt([r, k])} onFocus=${() => setAt([r, k])} onClick=${() => { close(); c.table(r, k); }} />`; })}</div>
    ${lists.length ? html`<div class="menu-sep" />${lists.map(l => html`<button type="button" class="menu-item" role="menuitem" onClick=${() => { close(); c.table(0, 0, { of: one.record, list: l.name }); }}><span class="label">${l.name}${/ (of|in|to|by|for|from|at|on|with)$/i.test(l.name) ? '' : ' of'} ${N.shortOf(st, one.record) ?? N.nameOf(st, one.record)}</span></button>`)}` : null}
  </div>`;
}
const tablePick = (at, c) => Shell.popover(at, close => html`<${TablePick} c=${c} close=${close} />`, { placement: 'bottom-start' });
// Lucide's icons: what a chart asks for, a set chosen for it, whole rows of them; any other found by typing, but for the glyphs of the window's own controls, which mean nothing on a chart. Each comes in as a shape of its own, its strokes a freeform's, so it takes an outline and a weight, its points can be edited, and in a deck it's PowerPoint's own.
const ICONS_FIRST = ['User', 'Users', 'UserCheck', 'Baby', 'Heart', 'Crown', 'Stethoscope', 'GraduationCap', 'Building', 'Building2', 'Landmark', 'Factory', 'Store', 'House', 'School', 'Hospital', 'Briefcase', 'Network', 'Scale', 'Gavel', 'Stamp', 'Handshake', 'Shield', 'Lock', 'FileText', 'FileCheck', 'Banknote', 'DollarSign', 'Coins', 'PiggyBank', 'Wallet', 'Receipt', 'Globe', 'MapPin', 'Flag', 'Star', 'Calendar', 'Clock', 'Mail', 'Phone', 'Info', 'CircleCheck', 'CircleX', 'TriangleAlert', 'Plane', 'Ship', 'Truck', 'Leaf'];
const APP_GLYPHS = /^(A[A-Z]|Align|Baseline|Bold|Italic|Underline|Strikethrough|Undo|Redo|Eraser|Paintbrush|PaintBucket|Pipette|Panel|Ellipsis|Chevron|Grip|Ungroup|Group$|ClipboardPaste|BringToFront|SendToBack|LayoutTemplate|Sparkles)/;
const iconNames = () => iconNames.all ??= typeof lucide === 'undefined' ? [] : Object.keys(lucide).filter(k => Array.isArray(lucide[k]) && lucide[k][0] === 'svg' && /^[A-Z]/.test(k) && !APP_GLYPHS.test(k)).sort();
const spaced = k => k.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
function IconPick({ c, close }) {
  const [q, setQ] = useState(''), words = q.trim().toLowerCase().split(/\s+/).filter(Boolean), found = words.length ? iconNames().filter(k => { const s = spaced(k).toLowerCase(); return words.every(w => s.includes(w)); }).slice(0, 120) : ICONS_FIRST.filter(k => lucide?.[k]);
  const take = k => { close(); const s = c.scene().page.scale ?? 1, side = Math.round(48 / s); c.insert('freeform', { w: side, h: side, alt: spaced(k), name: spaced(k), format: { Fill: 'none', Outline: inkOfChart(c), Weight: 1.5, Points: Shapes.iconPoints(lucide[k]) } }); };
  return html`<div class="iconpick" role="dialog" aria-label="Icon">
    <input class="find" type="text" placeholder="Find an icon" aria-label="Find an icon" spellcheck="false" autocomplete="off" autofocus value=${q} onInput=${e => setQ(e.currentTarget.value)} onKeyDown=${e => { if (e.key === 'Enter' && found[0]) { e.preventDefault(); take(found[0]); } }} />
    <div class="grid" data-grid="button">${found.map(k => html`<button type="button" key=${k} aria-label=${spaced(k)} data-tip=${spaced(k)} onClick=${() => take(k)}><svg class="i lu" viewBox="0 0 24 24" aria-hidden="true">${lucide[k][2].map(([t, a]) => h(t, a))}</svg></button>`)}${!found.length ? html`<div class="menu-none">No match</div>` : null}</div>
  </div>`;
}
// (Ink a chart already uses: its title's, or else a dark blue.)
const inkOfChart = c => { const t = c.scene().marks.find(m => m.role === 'title')?.texts?.[0]?.look?.Color; return /^#[0-9a-f]{6}$/i.test(t ?? '') ? t : '#1f3864'; };
const iconPick = (at, c) => Shell.popover(at, close => html`<${IconPick} c=${c} close=${close} />`, { placement: 'bottom-start' });
// What's on the clipboard, as a picture: asked for by name where Ctrl+V can't be, as it's the browser's to allow; said if it won't, or there's none.
async function pictureOffClipboard(c) {
  try {
    for (const item of await navigator.clipboard.read()) { const type = item.types.find(t => t.startsWith('image/')); if (type) return c.pastePicture(await item.getType(type)); }
    Shell.toast('No picture on the clipboard', { ms: 2500 });
  } catch { Shell.toast('This browser won’t say what’s on the clipboard: Ctrl+V pastes a picture', { ms: 3500 }); }
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
  fill: at => pop(at, (close, of) => html`<${FillPop} close=${close} of=${of} />`),
  outline: at => pop(at, (close, of) => html`<${OutlinePop} close=${close} of=${of} />`),
  color: at => pop(at, (close, of) => html`<${Palette} label="Color" close=${close} of=${of}>
    <${Sub} label="Gradient" of=${of} items=${() => { const c = String(value('Color') ?? '#1f3864'), from = /^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : '#1f3864', g = (to, angle) => ({ angle, stops: [[0, from], [100, to]] }); return looksLike('Text Gradient', [[null, 'None'], [g(shaded(from, 0.4, 0.6), 90), 'Lighter, down'], [g(shaded(from, 0.5, 0), 90), 'Darker, down'], [g(shaded(from, 0.4, 0.6), 0), 'Lighter, across']], value('Text Gradient')); }} />
    <${Sub} label="Gradient options" of=${of} pane=${() => html`<${StopsPop} label="Text Gradient" />`} />
    <${Sub} label="Text outline" of=${of} items=${() => { const c = inkNow(); return looksLike('Text Outline', [[null, 'None'], ...[0.25, 0.5, 0.75, 1, 1.5].map(weight => [{ color: c, weight }, `${weight} pt`])], value('Text Outline')); }} /></${Palette}>`),
  font: at => pop(at, close => html`<${Fonts} close=${close} />`),
  size: at => { const v = shown(value('Size')); offer(at, STEPS.slice(0, 15).map(z => ({ label: String(z), checked: v === z, run: () => apply('Size', z), tries: ['Size', z] }))); },
  shape: at => pop(at, (close, of) => html`<${ShapePop} close=${close} of=${of} />`),
  // (A table's is its style's gallery; anything else's, the designs.)
  design: at => { const c = Canvas.active.peek(), t = c?.selected?.().find(m => m.geometry === 'table'); return pop(at, close => t ? html`<${c.StyleGallery} id=${t.id} close=${close} />` : Designs.open(at, close)); },
  effects: at => pop(at, (close, of) => html`<${EffectsPop} of=${of} />`),
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
    // A callout's tip, by a yellow handle where it is, dragged anywhere: where it points, as shares of its frame from its middle, as PowerPoint's adjustment of it.
    if (m && Shapes.CALLOUTS.has(m.shape ?? m.geometry) && ['box', 'shape'].includes(m.type) && !Canvas.keyParts(k)[1]) {
      const was = m.settings?.Tail?.value ?? m.look?.Tail ?? Shapes.TAIL, el = over.appendChild(Object.assign(document.createElement('div'), { className: 'dc-adjust' }));
      const place = t => { const p = c.graph.localToGraph(m.x + m.w / 2 + m.w * t[0], m.y + m.h / 2 + m.h * t[1]); el.style.left = `${p.x}px`; el.style.top = `${p.y}px`; };
      el.dataset.tip = 'Where it points';
      place(was);
      el.addEventListener('pointerdown', e => {
        if (e.button !== 0) return;
        e.preventDefault(); e.stopPropagation();
        el.setPointerCapture(e.pointerId);
        adjusting = true;
        el.addEventListener('lostpointercapture', () => { adjusting = false; }, { once: true });
        let t = was;
        const move = ev => { const p = c.graph.clientToLocal(ev.clientX, ev.clientY); t = [Math.round((p.x - m.x - m.w / 2) / m.w * 1000) / 1000, Math.round((p.y - m.y - m.h / 2) / m.h * 1000) / 1000]; place(t); preview('Tail', t); };
        const up = () => { adjusting = false; el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); if (t !== was) apply('Tail', t); else preview(); };
        el.addEventListener('pointermove', move); el.addEventListener('pointerup', up);
      });
      continue;
    }
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
  const kept = App.ofScene(rowsReach, sc, () => new Map());
  if (kept.has(g.key)) return kept.get(g.key);
  const marks = [...marksOf(sc, g)].map(id => sc.byId.get(id)).filter(Boolean), keys = new Set(g.outputs.map(p => Tree.key(p))), given = g.swatch?.kind === 'box' ? givenTo(sc.view, g) : [], N = App.notes.peek();
  // (Its own: a note of it alone. The page's Everything else, at the view, is nothing of its own.)
  const owning = marks.filter(m => Object.entries(m.settings ?? {}).some(([l, s]) => s?.note?.view === sc.view && ONE_OFF.has(l) && s.note.pattern.id !== sc.view && Tree.idsIn(s.note.pattern).size));
  const masked = !marks.length ? [] : ['Fill', 'Shape', 'Outline'].filter(l => given.includes(l) && marks.every(m => { const n = m.settings?.[l]?.note; return !!n && !keys.has(Tree.key(n.pattern)) && !Tree.idsIn(n.pattern).size; }))
    .map(l => [l, Scene.styleName(N, Tree.bare(marks[0].settings[l].note.pattern))]);
  // (Which they are, for its note's hover.)
  const out = { marks: marks.length, own: owning.length, ownNames: owning.map(m => N.nameOf(App.state.peek(), m.record)), masked };
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
  return { rows: [['Paper', paperSaid(look.page)], ['All text', fmtSaid(look.root) || Scene.fontName('Body')], ...look.theme ? [['Theme fonts', `${look.theme.heading} and ${look.theme.body}`]] : [], ...look.master?.length ? [['Master', `${look.master.length} ${look.master.length === 1 ? 'shape' : 'shapes'}`]] : [],
    ...look.palette?.colors ? [['Colors', look.palette.colors.slice(4).map(c => c.toUpperCase()).join(', ')]] : [], ...look.rest?.Fill ? [['Everything else', `fill ${String(look.rest.Fill).toUpperCase()}`]] : [],
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
  App.scene.value; Shell.selection.value; Canvas.fieldPicked?.value; aimed.value; level.value; const rich = Canvas.rich.value;
  const c = Canvas.active.value;
  if (!c || !c.scene() || Shell.wide.value) return html`<div class="fb" hidden=${Shell.wide.value} />`;
  const s = scopesOf(c), scope = scopeOf(s.scopes);
  current = { canvas: c, ...s, scope, field: fieldOf(c) };
  const none = !s.marks.length && !s.aim, lineOnly = s.marks.length && s.marks.every(m => m.type === 'line' || m.geometry === 'line'), footOnly = !!s.marks.length && s.marks.every(isFoot);
  const textStyle = s.aim?.swatch?.kind === 'text', root = !!scope?.root;
  const any = !none, boxy = any && !textStyle && !lineOnly && !footOnly && !s.marks.every(m => m.type === 'frame' || m.geometry === 'picture'), ro = App.readOnly.value;
  // A picture, or a line of the page's own, has no text to set; the font box stays where it is, off. Words being typed always have.
  const texty = !!rich || (any && (!s.marks.length || s.marks.some(m => m.type !== 'shape' || !['picture', 'line'].includes(m.geometry))));
  const set = (label, v) => apply(label, v);
  const toggle = label => set(label, !pressed(label));
  const zoom = Math.round(Canvas.zoom.value * 100);
  const placeable = s.aim ? 0 : s.marks.filter(m => (m.type === 'box' || m.type === 'shape') && !isFoot(m)).length, layered = !none && !s.aim && !footOnly;
  // The shapes' alignments, a menu's own rows, each with its key, and F4 doing it again; text's own is the paragraph's.
  const aligning = (a, run) => () => { run(); c.did?.(run); };
  const aligns = [
    { head: placeable > 1 ? 'Align' : 'Align to the page' },
    ...[['left', 'Align left', 'AlignStartVertical', 'KeyL'], ['center', 'Align center', 'AlignCenterVertical', 'KeyE'], ['right', 'Align right', 'AlignEndVertical', 'KeyR'], ['top', 'Align top', 'AlignStartHorizontal', 'KeyT'],
      ['middle', 'Align middle', 'AlignCenterHorizontal', 'KeyM'], ['bottom', 'Align bottom', 'AlignEndHorizontal', 'KeyB']].map(([a, label, icon, k]) => ({ label, icon, keys: `Alt+Shift+${k}`, disabled: !placeable, run: aligning(a, () => c.align(a)) })),
    '-', { label: 'Distribute across', icon: 'AlignHorizontalDistributeCenter', disabled: placeable < 3, run: aligning(0, () => c.distribute('across')) },
    { label: 'Distribute down', icon: 'AlignVerticalDistributeCenter', disabled: placeable < 3, run: aligning(0, () => c.distribute('down')) },
    { label: 'Distribute along the line', disabled: !c.lineAmong?.(), run: aligning(0, () => c.alongLine()) },
    { label: 'Same width', disabled: placeable < 2, run: aligning(0, () => c.match('width')) }, { label: 'Same height', disabled: placeable < 2, run: aligning(0, () => c.match('height')) },
  ];
  const free = s.marks.some(m => m.geometry === 'group' || (m.type === 'shape' && m.geometry !== 'legend' && !m.role));
  // Flip and turn, as PowerPoint's Rotate: on a box they say why not, as they're asked.
  const flips = [{ label: 'Flip across', disabled: none || ro, run: () => c.flip('h') }, { label: 'Flip upside down', disabled: none || ro, run: () => c.flip('v') }, { label: 'Turn right 90°', disabled: none || ro, run: () => c.turnBy(90) }, { label: 'Turn left 90°', disabled: none || ro, run: () => c.turnBy(-90) }];
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
    const item = x => ({ label: x.shown ? placeSaid(c, x) : named(c, x), checked: x === scope, run: () => choose(x), ...(!x.own && { point: on => cue(on ? x : null) }) });
    // (Where what it reaches isn't all drawn: those that are, a place of their own.)
    const whole = scope?.shown ? scope.of : like, drawnOf = whole && !whole.own && (whole.marks ?? marksOf(c.scene(), whole)).size, shownRow = drawnOf && countOf(c, whole) > drawnOf && !(s.marks.length === drawnOf && [...whole.marks ?? []].every(id => s.marks.some(m => (m.merged ?? m.id) === id))) ? shownOfGroup(c, s, whole) : null;
    const rows = s.scopes.filter(x => !x.own && !x.kin), headed = rows.filter(x => x.name), own = s.scopes.filter(x => x.kin && !x.shown);
    const kept = scope?.outputs ? keeping(c, scope, givenTo(view, scope)) : [], whose = kept.length && possessive(keepers(kept));
    const what = listed([...new Set(kept.flatMap(k => k.notes.map(n => n.label)))]);
    const clear = kept.length ? [{ label: `Clear ${whose} own ${what}`, disabled: ro,
      run: () => App.change(tx => kept.forEach(k => k.notes.forEach(n => tx.remove(n.note))), { say: `Cleared ${whose} own ${what}` }) }, { label: 'Select what differs', run: selectDiffers }] : [];
    // (A long list is no wall: the selection's and the Styles rows that reach it, and what each of its own fields could reach a row away, unless that's where the pen is.)
    const many = s.scopes.length > 14 && !own.includes(scope);
    return [[...s.scopes.filter(x => x.own).map(item), ...(shownRow ? [item(shownRow)] : [])], rows.filter(x => !x.name).map(item), headed.flatMap((x, i) => x.style === headed[i - 1]?.style ? [item(x)] : [{ head: x.name }, item(x)]),
      own.length ? many ? [{ label: 'Same field value', items: own.map(item) }] : [{ head: 'Same field value' }, ...own.map(item)] : [], clear].filter(p => p.length).flatMap((p, i) => i ? ['-', ...p] : p);
  };
  // The scope as two parts, PowerPoint's selection on the left and all like it on the right: the group chosen, or
  // else the narrowest, which its ▾ chooses among the rest. A Key row or a frame is its group alone.
  liked.value;
  const like = likeOf(s), ownPart = s.scopes.find(x => x.own), armed = painter.value;
  // A font or size the texts it would change don't share is shown blank, as PowerPoint shows one its selection mixes.
  const several = l => texty && new Set(scopeTexts().map(it => it.look?.[l]).filter(v => v !== undefined)).size > 1;
  const font = root ? Scene.fontName(value('Font')) : !texty ? '' : several('Font') ? '' : Scene.fontName(value('Font')), size = root ? shown(value('Size')) ?? '' : !texty ? '' : several('Size') ? '' : shown(value('Size')), align = (texty && value('Align')) || 'center';
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
    <div class=${'scope' + (scope?.own ? ' own' : '') + (none && !root ? ' off' : '')} role="group" aria-label="Format" data-fb="scope">
      ${root ? html`<button class="dd root" data-fb="all" aria-haspopup="menu" data-tip="Every text on this page that nothing narrower sets; or what its list aims at"
        onClick=${e => Shell.menu(e.currentTarget, [{ label: 'All text', checked: true, run: () => {} }, ...Scene.groupsOf(App.notes.peek(), c.scene().view).filter(g => !g.off).flatMap((g, i, all) => [...g.name ? (g.name !== all[i - 1]?.name ? [{ head: g.name }] : []) : all[i - 1]?.name ? ['-'] : [], { label: g.caption, run: () => aim(g) }])], { placement: 'bottom-start' })}><span>All text</span></button>` : none ? html`<button disabled><span>Nothing selected</span></button>` : null}
      ${ownPart ? html`<button aria-pressed=${!!scope?.own} data-fb="own" data-tip=${like ? 'Just the selection' : null} data-keys=${like ? 'Ctrl+Shift+A' : null}
        onClick=${() => choose(ownPart)}><span>${ownPart.label}</span></button>` : null}
      ${like ? html`<button aria-pressed=${!scope?.own} data-fb="like" data-tour="like" data-keys=${ownPart ? 'Ctrl+Shift+A' : null} onPointerOver=${whole}
        onPointerEnter=${() => cue(like)} onPointerLeave=${() => cue(null)} onClick=${() => choose(like)}><span>${placeSaid(c, like)}</span></button>` : null}
      ${like && (s.scopes.length > 2 || countOf(c, like) > (like.marks ?? marksOf(c.scene(), like)).size) ? html`<button class="more" data-fb="groups" aria-label="All like it" data-tip="All like it" aria-haspopup="menu"
        onClick=${e => Shell.menu(e.currentTarget, scopes(), { placement: 'bottom-end', onClose: () => cue(null) })} />` : null}
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
    <button class="btn dd" aria-label="Shape" data-fb="shape" ...${writes('Shape', !boxy || s.marks.every(m => m.geometry === 'table'))} onClick=${e => opener.shape(e.currentTarget)}>${shapeGlyph(boxy ? value('Shape') ?? s.marks[0].geometry ?? 'rect' : 'rect', boxy ? value('Corner') : undefined)}</button>
    <button class="btn dd" aria-label="Design" data-fb="design" ...${writes('Design', !s.marks.some(m => m.type === 'box' || m.type === 'line' || m.geometry === 'table'))} onClick=${e => opener.design(e.currentTarget)}>${Shell.icon('LayoutTemplate')}</button>
    <button class="btn dd" aria-label="Effects" data-fb="effects" ...${writes('Shadow, glow, reflection and more', !boxy || s.marks.every(m => m.geometry === 'table'))} onClick=${e => opener.effects(e.currentTarget)}>${effectsGlyph}</button>
    <button class="btn dd" aria-label="Fill" data-fb="fill" ...${writes('Fill', !boxy)} onClick=${e => opener.fill(e.currentTarget)}>${glyph.fill(boxy ? value('Fill') : 'none')}</button>
    <button class="btn dd" aria-label="Outline" data-fb="outline" ...${writes('Outline', none || textStyle || footOnly)} onClick=${e => opener.outline(e.currentTarget)}>${glyph.outline(any && !textStyle && !footOnly ? value('Outline') : 'none')}</button>
    <span class="sep" />
    <button class="btn dd wide" data-fb="align" ...${writes(null, none)} onClick=${e => offer(e.currentTarget, aligns)}>Align</button>
    <button class="btn dd wide" data-fb="order" ...${writes(null, !layered)} onClick=${e => Shell.menu(e.currentTarget, orders)}>Order</button>
    <button class="btn wide" data-fb="group" ...${writes(null, grouping.disabled)} onClick=${grouping.run}>${grouping.label}</button>
    <button class="btn dd narrow arrange" data-fb="arrange" aria-label="Arrange" data-tip="Arrange" onClick=${e => offer(e.currentTarget, [...aligns.map(a => a === '-' || a.head ? a : { ...a, disabled: a.disabled || none || ro }), '-', { label: 'Flip and turn', disabled: !free || ro, items: flips }, { label: 'Merge shapes', disabled: !c.mergeable?.() || ro, items: [['union', 'Union'], ['combine', 'Combine'], ['fragment', 'Fragment'], ['intersect', 'Intersect'], ['subtract', 'Subtract']].map(([k, label]) => ({ label, run: () => c.merge(k) })) }, { label: 'Order', disabled: !layered || ro, items: orders }, grouping, { label: 'Selection pane', keys: 'Alt+F10', run: () => c.pane() }, '-', { label: 'Edit master', run: () => { App.mastering.value = !App.mastering.peek(); }, checked: App.mastering.peek() }, ...(App.mastering.peek() ? [] : [{ label: 'Leave the master off', checked: !App.hasMaster(view), disabled: ro, run: () => App.pageMaster(view, !App.hasMaster(view)) }]), '-', tidy, { label: 'Tidy for every date', disabled: ro, run: () => { tried = null; c.tidyEvery(); }, tries: ['Tidy for every date'] }, { label: 'Show only these', disabled: !c.canShowOnly(), run: () => c.showOnly() }, { label: 'Filter…', disabled: !App.canAsk(), run: () => c.filter() }, '-', { label: 'Fit to page', disabled: ro, run: () => Export.fit() }, { label: 'Page setup…', disabled: ro, run: () => Export.setup() }, '-', Canvas.aidsRow()])}>
      ${Shell.icon('layers')}<span>Arrange</span></button>
    <button class="btn" data-fb="tidy" ...${writes(tidy.label === 'Tidy' ? null : tidy.label, tidy.disabled)} onClick=${tidy.run} onPointerMove=${e => { if (e.movementX || e.movementY) preview(...tidy.tries); }} onPointerLeave=${() => preview()}>${tidy.label.replace(/ \D+$/, '')}<span class="wide">${tidy.label.match(/ \D+$/)?.[0]}</span></button>
    <button class="btn dd zoom" data-fb="zoom" onClick=${e => Shell.menu(e.currentTarget, [{ label: 'Fit', keys: 'Shift+Digit1', run: () => c.zoom('fit') }, '-',
      // (The zoom it's at among them, ticked, wherever it is.)
      ...[...new Set([50, 75, 100, 150, 200, zoom])].sort((a, b) => a - b).map(z => ({ label: `${z}%`, checked: z === zoom, run: () => c.zoom(z / 100) }))], { placement: 'bottom-end' })}>${zoom}%</button>
  </div>`;
}

function mount(el) {
  // Another selection or view ends an aim: the pen goes on where a hand's place still reaches, or by itself. (Another page is a new start.)
  let pageWas = Shell.view.peek();
  const stopSel = effect(() => { Shell.selection.value; const v = Shell.view.value; liked.value = null; if (v !== pageWas) { pageWas = v; level.value = null; } else holdOrLetGo(); if (aimed.peek()) queueMicrotask(() => aim(null)); });
  const stopHand = effect(() => { if (level.value) handFor = selectedKey(); });
  // What's in reach is outlined, wherever the pen goes, on the chart it's on.
  const stopCue = effect(() => { level.value; aimed.value; Shell.selection.value; App.scene.value; Canvas.fieldPicked?.value; if (Canvas.active.value) queueMicrotask(atRest); });
  // A rounded shape selected has its corner handle, wherever the chart is drawn on screen.
  const stopCorners = effect(() => { App.scene.value; Shell.selection.value; App.readOnly.value; Shell.wide.value; if (Canvas.active.value) requestAnimationFrame(cornerHandles); });
  const stopFollow = effect(() => { const c = Canvas.active.value; if (!c) return; for (const on of ['scale', 'translate', 'drawn']) c.graph.on(on, cornerHandles); return () => { for (const on of ['scale', 'translate', 'drawn']) c.graph.off(on, cornerHandles); }; });
  // The painter armed shows the brush wherever the pointer is on the chart, and a click there pastes.
  document.documentElement.style.setProperty('--brush', pointer('Paintbrush', 3, 20));
  document.documentElement.style.setProperty('--dropper', pointer('Pipette', 2, 22));
  const stopBrush = effect(() => { const c = Canvas.active.value, on = !!painter.value, dropping = !!dropper.value; c?.root.classList.toggle('painting', on); c?.root.classList.toggle('dropping', dropping); if (!c && (on || dropping)) disarm(); });
  render(html`<${Bar} />`, el);
  // Esc with nothing selected, and nothing else it would close, brings the pen home: it goes by itself again. (Read before it's handled, so the Esc that lets go of a selection isn't this one.)
  const escHome = e => { if (e.key === 'Escape' && level.peek() && !Shell.selection.peek().length && !typing() && !document.querySelector('.float') && onScreen()) pen.home(); };
  addEventListener('keydown', escHome, true);
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
    // What goes where the pen is: free text in the box or on the line selected, and a footnote (Word's key).
    ['draw.textin', 'Text in this box', null, () => { const c = Canvas.active.peek(), m = c.selected()[0]; if (m?.type === 'box' || m?.type === 'line') c.addText(m.id); }, () => edit() && Canvas.active.peek().selected().length === 1 && ['box', 'line'].includes(Canvas.active.peek().selected()[0].type), ['Add text', 'Free text', 'Text in a box', 'Label']],
    ['draw.footnote', 'Add a footnote', '$mod+Alt+KeyF', () => Canvas.active.peek().footnote(), edit, ['Footnote', 'Note at the foot', 'Endnote', 'Citation']],
    // The bar's popovers by name, and by the words people look for them by.
    ['format.font', 'Font…', null, () => open('font'), () => onScreen() && !App.readOnly.peek(), ['Typeface', 'Font size']],
    // What every text on the page takes that nothing narrower sets (dendra.md, Notes): the page's, with nothing selected.
    ['format.alltext', 'All text…', null, () => { Shell.select([]); setTimeout(() => open('font')); }, () => onScreen() && !App.readOnly.peek(), ['Font of all text', 'Size of all text', 'Every font', 'Theme', 'Theme font', 'Theme fonts', 'Page font', 'Whole page font']],
    ['look.differs', 'Select what differs from its style…', null, selectDiffers, onScreen, ['One-offs', 'One off', 'Overrides', 'Differs', 'Own look', 'Manual formatting', 'Reset all formatting', 'Direct formatting']],
    ['format.color', 'Text color…', null, () => open('color'), edit, ['Font color', 'Font colour', 'Text colour']],
    ['format.fill', 'Fill…', null, () => open('fill'), edit, ['Fill color', 'Background', 'Shading', 'Transparency']],
    ['format.outline', 'Outline…', null, () => open('outline'), edit, ['Border', 'Line color', 'Line weight', 'Dashes', 'Arrows']],
    ['format.shape', 'Change shape…', null, () => open('shape'), edit, ['Shape', 'Rounded corners']],
    ['format.design', 'Design…', null, () => open('design'), edit, ['Group design', 'Component', 'Card', 'Header band', 'Side band', 'Corner tag', 'Pill', 'Ticket', 'Org chart card', 'Person', 'Layout of a box', 'Preset']],
    ['format.effects', 'Effects…', null, () => open('effects'), edit, ['Shadow', 'Glow', 'Soft edges', 'Reflection', 'Inner shadow', 'Bevel', '3-D rotation', '3D', 'Shape effects']],
    ['format.paragraph', 'Paragraph…', null, () => open('paragraph'), edit, ['Align text', 'Alignment', 'Line spacing', 'Bullets', 'Numbering', 'Indent', 'Inner margins', 'Shrink text', 'Autofit']],
    ['draw.flipH', 'Flip across', null, () => Canvas.active.peek().flip('h'), edit, ['Flip', 'Flip horizontal', 'Mirror']],
    ['draw.flipV', 'Flip upside down', null, () => Canvas.active.peek().flip('v'), edit, ['Flip', 'Flip vertical', 'Mirror']],
    ['draw.turnR', 'Turn right 90°', null, () => Canvas.active.peek().turnBy(90), edit, ['Rotate right', 'Rotate 90']],
    ['draw.turnL', 'Turn left 90°', null, () => Canvas.active.peek().turnBy(-90), edit, ['Rotate left', 'Rotate 90']],
    ['draw.pane', 'Selection pane', 'Alt+F10', () => Canvas.active.peek().pane(), onScreen, ['Selection', 'Layers', 'Objects', 'Hide', 'Lock', 'Reorder', 'Rename a shape', 'What’s buried']],
    ...[['union', 'Union'], ['combine', 'Combine'], ['fragment', 'Fragment'], ['intersect', 'Intersect'], ['subtract', 'Subtract']].map(([k, word]) => [`draw.merge.${k}`, `Merge shapes: ${word}`, null, () => Canvas.active.peek().merge(k), edit, ['Merge', 'Merge shapes', 'Boolean', word]]),
    ['draw.points', 'Edit points', null, () => Canvas.active.peek().editPoints(), edit, ['Points', 'Freeform', 'Vertex', 'Reshape']],
    ['draw.link', 'Link…', null, () => Canvas.active.peek().link?.(), edit, ['Hyperlink', 'URL', 'Link a shape']],
    ['draw.tablestyle', 'Table style…', null, () => opener.design(document.querySelector('.fb [data-fb="design"]')), () => edit() && current.marks[0]?.geometry === 'table', ['Table design', 'Banded', 'Hairlines', 'Grid']],
    ['draw.along', 'Distribute along the line', null, () => Canvas.active.peek().alongLine(), edit, ['Along a line', 'Space along']],
    ['draw.master', 'Edit master', null, () => { App.mastering.value = !App.mastering.peek(); }, onScreen, ['Master', 'Slide master', 'Logo on every page', 'Every page', 'Confidentiality line', 'Letterhead', 'Furniture']],
    ['draw.masteroff', 'Leave the master off this page', null, () => App.pageMaster(Shell.view.peek(), !App.hasMaster(Shell.view.peek())), () => onScreen() && !App.readOnly.peek() && !App.mastering.peek(), ['No master', 'Hide master', 'Show master']],
    ['look.fonts', 'Theme fonts…', null, () => defineFonts(), () => onScreen() && !App.readOnly.peek(), ['Theme fonts', 'Heading font', 'Body font', 'Fonts']],
    ['draw.default', 'Set as default', null, () => Canvas.active.peek().setDefault(), edit, ['Default shape', 'Default line', 'Default text box', 'Set as default shape']],
    ['draw.crop', 'Crop', null, () => Canvas.active.peek().crop(), edit, ['Crop picture', 'Trim']],
    ['draw.picture', 'Change picture…', null, () => Canvas.active.peek().changePicture(), edit, ['Replace picture', 'Swap picture']],
    ['draw.repeat', 'Repeat', 'F4', () => Canvas.active.peek().repeat(), edit, ['Do again', 'Redo that']],
    ['draw.margins', 'Margins', null, Canvas.aidToggle('margins'), onScreen, ['Page margins', 'Show margins']],
    ['draw.guides', 'Guides', null, Canvas.aidToggle('guides'), onScreen, ['Show guides', 'Ruler guides']],
    ['look.palette', 'This chart’s colors…', null, () => definePalette(), () => onScreen() && !App.readOnly.peek(), ['Palette', 'Theme colors', 'Theme colours', 'House colors', 'Colors', 'Define colors']],
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
      ...[['text', 'Text box'], ['frame', 'Frame'], ['legend', 'Key', 'Legend'], ['picture', 'Picture', 'Logo'], ['line', 'Line', 'Connector'], ['arrow-line', 'Arrow', 'Connector']].map(([g, name, also]) => ({ label: `Insert ${word(name)}`, detail: 'Action',
        names: [name, `Add ${word(name)}`, `Draw ${word(name)}`, ...(also ? [also] : [])], run: () => g === 'picture' ? picture(c) : g === 'text' ? c.drawText() : g === 'line' || g === 'arrow-line' ? c.draw(g) : c.insert(g) })),
      { label: 'Insert picture from clipboard', detail: 'Action', names: ['Paste picture', 'Clipboard picture', 'Screenshot'], run: () => pictureOffClipboard(c) },
      { label: 'Insert table', detail: 'Action', names: ['Table', 'Add table', 'Cap table', 'Grid'], run: () => tablePick(document.querySelector('.fb [data-fb="insert"]'), c) },
      { label: 'Insert icon', detail: 'Action', names: ['Icon', 'Add icon', 'Symbol', 'Pictogram'], run: () => iconPick(document.querySelector('.fb [data-fb="insert"]'), c) },
      { label: 'Insert freeform', detail: 'Action', names: ['Freeform', 'Draw freeform', 'Polygon', 'Scribble'], run: () => c.draw('freeform') },
      { label: 'Insert curve', detail: 'Action', names: ['Curve', 'Draw curve', 'Bezier'], run: () => c.draw('curve') },
      ...Shapes.list.map(([g, name]) => ({ label: `Insert ${word(name)}`, detail: 'Action', names: [name, `Add ${word(name)}`, 'Shape'], run: () => c.draw(g) }))];
  } }));
  return () => { stopSel(); stopHand(); stopCue(); stopBrush(); stopCorners(); stopFollow(); actions.forEach(off => off()); disarm(); removeEventListener('keydown', escHome, true); document.removeEventListener('pointerover', pointed); document.removeEventListener('pointerdown', painting, true); document.removeEventListener('pointermove', dropMove, { capture: true });
    preview(); Canvas.active.peek()?.cue(null); Canvas.active.peek()?.reach?.(null); render(null, el); };
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
function describe(forBox = false) {
  const c = Canvas.active.peek();
  if (!c?.scene()) return null;
  const s = scopesOf(c), sc = forBox ? boxScope(c, s) : scopeOf(s.scopes);
  if (!sc || sc.root) return null;
  const by = c.scene().byId, ids = sc.own ? s.marks.map(m => m.id) : [...sc.marks ?? []], records = [...new Set(ids.map(id => by.get(id)?.record).filter(Boolean))];
  const base = { label: named(c, sc), view: c.scene().view, records };
  // (`n`, what it reaches, shown or not; a style of one entry's reach, said of what's in reach, is the boxes: a footnote on a person is on a person, not on their name.)
  const says = sc.says ?? (sc.swatch?.kind === 'text' ? marksNoun(ids.map(id => by.get(id)).filter(Boolean)) : null);
  return sc.own ? { own: true, ...base } : { own: false, ...base, n: countOf(c, sc), outputs: sc.outputs, caption: sc.caption, marks: new Set(ids), ...(says && { says }), ...(sc.has && { has: true }), ...(sc.each && { each: true }), ...(sc.shown && { shown: true }) };
}
// What marks are, in the plural, by their kind: "people", "entities"; or boxes, or lines.
function marksNoun(ms) {
  const st = App.state.peek(), kinds = new Set(ms.map(m => st[m.record]?.kind)), one = kinds.size === 1 ? [...kinds][0] : null;
  const word = n => one ? (n === 1 ? one : Tree.plural(one)).toLowerCase() : ms.every(m => m.type === 'line') ? (n === 1 ? 'line' : 'lines') : (n === 1 ? 'box' : 'boxes');
  return n => `${n} ${word(n)}`;
}
function scoped(tx, label, v) { const c = Canvas.active.peek(); if (c?.scene()) write(tx, c, label, v); }
function cueing(on) { const c = Canvas.active.peek(); if (!c?.scene()) return; if (!on) return cue(null); const s = scopesOf(c), sc = scopeOf(s.scopes); cue(sc?.own ? null : sc); }
// A popover of the bar's, under its own button where nothing else is given (Format ▸ in a menu of the canvas's).
function open(what, at) {
  const anchor = at ?? document.querySelector(`.fb [data-fb="${what}"]`);
  if (anchor) opener[what]?.(anchor);
}

Shell.register('formatbar', { mount, relist: () => listHouses() });
return { defineFonts, applyPairs: applyAll, apply, preview, value, colorName, paletteOf, themeOf, chartAccents: () => { const chroma = c => { const v = [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)); return Math.max(...v) - Math.min(...v); }; return chartColors().filter(c => chroma(c) > 24).sort((a, b) => chroma(b) - chroma(a)); }, resize: by => resize(by > 0 ? grown : shrunk), shapeName: g => SHAPES.find(([k]) => k === g)?.[1] ?? null, allOf, scope: describe, write: scoped, cue: cueing, open,
  copyLook, pasteLook: () => pasteLook(), canPasteLook: () => !!copied, clear: clearLook, lookMenu, houseStyles: () => houses.value, aim: g => (g ? aim(g) : void pen.home()), aimAlso, aimedAt, lit, litOn, selectDiffers,
  reachOf: reachOfRow, pen, marksNoun, answersOf, lookForEach, footOn, footsOff };
})();
