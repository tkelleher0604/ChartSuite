// Designs: a group of shapes standing for a box, Figma's component (dendra.md, Group designs). One note, Design, at a pattern in a
// view, so the narrowest decides, as Fill does; the scene and every output draw what it says. Here: the gallery, each thumbnail by the
// renderer's own hand in the selected record's words; a design applied at the pen as any look is; what's said over one at the pen,
// only what's different; Reset to design; Make a design from free shapes or a group, fitted to the box it's for; and Edit design, which stands the
// parts on the page as free shapes over one box, so every drawing tool works on them, the rest of the chart dulled, the panel listing them and saying a part's words as chips, till Done writes the note.
const Designs = (() => {
const { h } = preact;
const html = htm.bind(h);
const { signal, effect } = preactSignals;
const { useState, useRef, useLayoutEffect } = preactHooks;

const lowered = s => s[0].toLowerCase() + s.slice(1);
const canvas = () => Canvas.active.peek();
const view = () => canvas().scene().view;
const treeOf = id => Tree.treeOf(App.state.peek(), id);
const round = v => Math.round(v * 2) / 2;
const share = v => +v.toFixed(4);
const LIBRARY = { kind: 'View' };

// ---- The gallery's designs: the app's, this chart's, and each house style's ----
const inChart = () => App.notes.peek().value('Designs', LIBRARY)?.list ?? [];
const inHouses = () => (FormatBar.houseStyles?.() ?? []).flatMap(s => (s.look?.designs ?? []).map(d => ({ ...d, house: s.name })));
// The chart's accent, what a preset's accent is on this chart: its palette's first; or the colour its boxes are outlined in, where a style says.
const accentFor = m => FormatBar.paletteOf?.()?.colors?.[4] ?? (m?.settings?.Outline?.note && /^#/.test(m.settings.Outline.value) ? m.settings.Outline.value : Shapes.ACCENT);
// A design as the record it's given to has it: in the chart's accent, and what it leaves to that record, an entry the record has.
function forRecord(d0, m) {
  const ink = accentFor(m), d = ink === Shapes.ACCENT ? d0 : JSON.parse(JSON.stringify(d0).replaceAll(Shapes.ACCENT, ink));
  if (!d.parts?.some(p => p.text === '{?}')) return d;
  const st = App.state.peek(), fields = (m?.fields ?? m?.texts ?? []).map(it => st[it.id]).filter(r => r?.edge && !Tree.same(r.edge, 'Name'));
  const edge = fields.find(r => 'choice' in r)?.edge ?? fields[0]?.edge ?? (m && (Tree.index(st).entries.get(m.record) ?? []).map(e => st[e]).find(r => 'choice' in r)?.edge) ?? (m?.fields ?? m?.texts ?? []).find(it => it.blank)?.blank.edge;
  return { ...d, parts: d.parts.map(p => p.text === '{?}' ? { ...p, text: edge ? `{${edge}}` : '' } : p) };
}
// Plain takes a design away: the note's gone; or, where a wider one would still decide, says so narrower.
function valueOf(d, m) {
  if (d.id !== 'plain') return forRecord(d, m);
  const sc = canvas().scene(), s = FormatBar.scope(true), wide = (s?.outputs ?? []).length ? s.outputs : m ? [treeOf(m.record)] : [], N = App.notes.peek();
  const here = new Set(wide.map(p => Tree.key(p)));
  return N.notes('Design').some(n => n.view === sc.view && !here.has(Tree.key(n.pattern)) && Scene.wholeDesign(n.value) && wide.some(p => Tree.narrower(p, n.pattern))) ? { id: 'plain', name: 'Plain', base: {}, parts: [] } : undefined;
}
// The box a gallery is drawn from: the first selected, or that a Styles row aimed at reaches.
function boxNow() {
  const c = canvas(), sc = c?.scene();
  if (!sc) return null;
  const m = c.selected().find(x => x.type === 'box');
  if (m) return m;
  const s = FormatBar.scope(true);
  return [...s?.marks ?? []].map(id => sc.byId.get(id)).find(x => x?.type === 'box') ?? null;
}
const lineNow = () => { const c = canvas(), s = c?.selected() ?? []; return s.length && s.every(m => m.type === 'line') ? s[0] : null; };
// A thumbnail, by the renderer's own hand: the box with that design, in its own words, as the PDF draws it.
function art(m, d) {
  const sc = canvas().scene(), b = Scene.instance(sc, m.id, d, App.notes.peek(), App.computed.peek());
  if (!b) return '';
  // (A field with none yet by its name, faint, as a box selected shows it, so the tile of a new record isn't empty: it would print nothing, and the tile's to see what goes where.)
  for (const q of [b, ...b.parts ?? []]) for (const it of q.texts ?? []) if (it.blank) { it.blank = null; it.look = { ...it.look, Color: '#8a8f8c', Italic: true, Bold: false }; }
  return Export.markSvgOf(b, sc.page.scale);
}

// A line's label as a small design: a shape behind its words (dendra.md, Group designs).
const LABELS = [
  { id: 'plain', name: 'Plain', label: null },
  { id: 'pill', name: 'Pill', label: { Shape: 'rounded', Corner: 50, Fill: '#ffffff', Outline: '{Outline}', Weight: 0.75 } },
  { id: 'chip', name: 'Filled chip', label: { Shape: 'rounded', Corner: 25, Fill: '{Outline}', Outline: 'none' } },
  { id: 'tag', name: 'Square tag', label: { Shape: 'rect', Fill: '#ffffff', Outline: '{Outline}', Weight: 0.75 } },
];
function LabelGallery({ close }) {
  App.scene.value;
  const m = lineNow(), now = m?.settings.Design?.value?.id ?? 'plain', ink = m?.settings.Outline?.value ?? '#3a4653', said = m?.texts?.[0]?.text ?? '100%';
  const tile = d => { const v = d.label ? d : undefined, l = d.label, fill = l?.Fill === '{Outline}' ? ink : l?.Fill, line = l?.Outline === '{Outline}' ? ink : l?.Outline;
    return html`<button type="button" class="tile" aria-label=${d.name} aria-pressed=${now === d.id} autofocus=${now === d.id} onPointerEnter=${() => FormatBar.preview('Design', v)} onFocus=${e => { if (e.currentTarget.matches(':focus-visible')) FormatBar.preview('Design', v); }} onClick=${() => { close(); FormatBar.apply('Design', v); }}>
      <svg class="art" viewBox="0 0 96 40" aria-hidden="true"><path d="M4 20H92" stroke=${ink} stroke-width="1" />${l ? html`<path d=${Scene.path(l.Shape, 56, 20, l.Corner)} transform="translate(20 10)" fill=${fill} stroke=${line === 'none' ? 'none' : line} />` : html`<rect x="20" y="10" width="56" height="20" fill="var(--surface)" />`}<text x="48" y="24" text-anchor="middle" font-size="11" fill=${fill === ink ? '#ffffff' : '#1c2733'}>${said}</text></svg>
      <span class="nm">${d.name}</span></button>`; };
  return html`<div class="picker designs" data-grid=".tiles > button" role="group" aria-label="Design" onPointerLeave=${() => FormatBar.preview()}><div class="tiles">${LABELS.map(tile)}</div></div>`;
}
function Gallery({ close }) {
  App.scene.value;
  const m = boxNow(), ro = App.readOnly.value, now = m?.design?.value, nowId = m?.settings.Design?.value?.id ?? (m ? 'plain' : null), can = !ro && !!makeable(canvas().selected());
  const mine = inChart(), houses = inHouses(), bare = Shapes.DESIGNS;
  // (A right-click on one: edit it, rename it, or, of this chart's own, take it out of its gallery.)
  const tileMenu = (e, d) => { e.preventDefault(); e.stopPropagation(); Shell.menu({ x: e.clientX, y: e.clientY }, [{ label: 'Edit design', disabled: ro || !m, run: () => { close(); FormatBar.preview(); edit(m, forRecord(d, m)); } }, { label: 'Rename…', disabled: ro, run: () => { close(); FormatBar.preview(); rename(d); } }, ...(mine.some(x => x.id === d.id) && !d.house ? [{ label: 'Remove from this chart', disabled: ro, run: () => { close(); FormatBar.preview(); removeFromChart(d); } }] : [])]); };
  const tile = d => {
    const v = valueOf(d, m), pressed = nowId === d.id;
    return html`<span class="tile-at" key=${d.house ? `${d.house}|${d.id}` : d.id} onContextMenu=${d.id === 'plain' ? null : e => tileMenu(e, d)}>
      <button type="button" class="tile" aria-label=${d.name} data-tip=${d.name} aria-pressed=${pressed} autofocus=${pressed} onPointerEnter=${() => FormatBar.preview('Design', v)} onFocus=${e => { if (e.currentTarget.matches(':focus-visible')) FormatBar.preview('Design', v); }} onClick=${() => { close(); FormatBar.apply('Design', v); }}>
        <span class="art" dangerouslySetInnerHTML=${{ __html: art(m, d.id === 'plain' ? null : forRecord(d, m)) }} /><span class="nm">${d.name}</span></button>
      ${d.id !== 'plain' && !ro ? html`<button type="button" class="pencil" tabindex="-1" aria-label=${`Edit ${d.name}`} data-tip="Edit design" onClick=${() => { close(); FormatBar.preview(); edit(m, forRecord(d, m)); }}>${Shell.icon('Pencil')}</button>` : null}
    </span>`;
  };
  const makes = html`<button type="button" class="btn" disabled=${!can} data-tip=${can ? null : 'Select shapes, or a group, to make one of'} onClick=${() => { close(); FormatBar.preview(); make(); }}>Make a design…</button>`;
  // (What's selected has no box to give one to: all there is to do with it here is make one of it.)
  if (!m) return html`<div class="picker designs" role="group" aria-label="Design"><div class="acts">${makes}</div></div>`;
  return html`<div class="picker designs" data-grid=".tiles button.tile" role="group" aria-label="Design" onPointerLeave=${() => FormatBar.preview()}>
    <div class="tiles">${bare.map(tile)}</div>
    ${mine.length ? html`<div class="menu-head">This chart</div><div class="tiles">${mine.map(tile)}</div>` : null}
    ${houses.length ? html`<div class="menu-head">House style</div><div class="tiles">${houses.map(tile)}</div>` : null}
    <div class="menu-sep" />
    <div class="acts">
      <button type="button" class="btn" disabled=${ro} onClick=${() => { close(); FormatBar.preview(); edit(m); }}>Edit design</button>
      ${makes}
      <button type="button" class="btn" disabled=${ro || !m.design?.overs.length} onClick=${() => { close(); reset(m); }}>Reset to design</button>
      <button type="button" class="btn" disabled=${!now} onClick=${() => { close(); saveToHouse(now); }}>Save to house style…</button>
    </div>
  </div>`;
}
// A design renamed: its tile and every note of it, a change; an app's or a house style's, this chart's own from here.
function rename(d) {
  let name = d.name;
  Shell.dialog({ title: 'Rename the design', width: 340, actions: [{ label: 'Cancel', value: false }, { label: 'Rename', value: true, primary: true }],
    body: () => html`<div class="settings"><label class="field"><span>Name</span><input aria-label="Name" value=${d.name} spellcheck="false" autocomplete="off" autofocus onFocus=${e => e.target.select()} onInput=${e => { name = e.target.value; }} /></label></div>` }).then(ok => {
    const t = Tree.clean(name);
    if (!ok || !t || t === d.name) return;
    const own = inChart(), mine = own.some(x => x.id === d.id), id = mine ? d.id : Log.newId(), { house: _, ...plain } = d, said = `Renamed the design ${d.name} to ${t}`;
    App.change(tx => {
      for (const n of App.notes.peek().notes('Design')) if (Scene.wholeDesign(n.value) && n.value.id === d.id) tx.note('Design', n.pattern, { ...n.value, id, name: t }, { view: n.view, ...(n.param && { param: n.param }) });
      tx.note('Designs', LIBRARY, { list: mine ? own.map(x => x.id === d.id ? { ...x, name: t } : x) : [...own, { ...plain, id, name: t }] });
      tx.says(said);
    }, { dated: false, say: said });
  });
}
const removeFromChart = d => { const said = `Took ${d.name} out of this chart’s designs`; App.change(tx => { tx.note('Designs', LIBRARY, { list: inChart().filter(x => x.id !== d.id) }); tx.says(said); }, { dated: false, say: said }); };
function open(at, close) {
  return lineNow() ? html`<${LabelGallery} close=${close} />` : html`<${Gallery} close=${close} />`;
}

// ---- What's said over a design at the pen, only what's different; and that taken away ----
// On tx (a change, or a look being tried), at a scope { own } or { outputs }: of a part, its `format`, `text` or `hidden`. A whole design there keeps it beside its parts, which stand as they are.
function say(tx, m, part, what, s = Canvas.scope()) {
  const v = canvas().scene().view, N = App.notes.peek();
  for (const p of s.own ? [treeOf(m.record)] : s.outputs) {
    const at = (tx.noteAt ? tx.noteAt('Design', p, { view: v }) : N.notes('Design').find(n => n.view === v && Tree.key(n.pattern) === Tree.key(p)))?.value ?? {};
    const parts = at.over?.parts ?? {}, was = parts[part] ?? {}, now = { ...was, ...what, ...(what.format && { format: { ...was.format, ...what.format } }) };
    tx.note('Design', p, { ...at, over: { ...at.over, parts: { ...parts, [part]: now } } }, { view: v });
  }
}
// A row dropped on a part adds a field without replacing its existing words or fields.
function tokenIn(m, part, edge) {
  return TextTemplate.append(m.design.value.parts.find(p => p.id === part)?.text, edge);
}
// A shape, or how round its corners are, given at a design's own pattern is said over that design, so it's seen and Reset to design takes it back; given elsewhere it's a note, as ever. → whether it's done.
function atPen(tx, sc, scope, marks, label, value) {
  const N = App.notes.peek(), there = p => N.notes('Design').find(n => n.view === sc.view && Tree.key(n.pattern) === Tree.key(p) && Scene.wholeDesign(n.value));
  const ps = scope.outputs ?? (marks.every(m => m.type === 'box') ? marks.map(m => treeOf(m.record)) : []);
  if (!ps.some(there)) return false;
  for (const p of ps) { const n = there(p), v = n?.value; if (n) tx.note('Design', p, { ...v, over: { ...v.over, base: { ...v.over?.base, [label]: value } } }, { view: sc.view }); else tx.note(label, p, value, { view: sc.view }); }
  return true;
}
// Reset to design: what's said over it at the pen goes, or where the pen has none, all that reaches this box.
function reset(m, s = Canvas.scope()) {
  const v = view(), overs = m?.design?.overs ?? [];
  if (!overs.length) return;
  const here = new Set((s.own ? [treeOf(m.record)] : s.outputs).map(p => Tree.key(p))), mine = overs.filter(n => here.has(Tree.key(n.pattern))), these = mine.length ? mine : overs;
  const said = `Reset ${App.notes.peek().nameOf(App.state.peek(), m.record)} to its design`;
  App.change(tx => { for (const n of these) { if (Scene.wholeDesign(n.value)) { const { over, ...whole } = n.value; tx.note('Design', n.pattern, whole, { view: v }); } else tx.note('Design', n.pattern, undefined, { view: v }); } tx.says(said); }, { dated: false, say: said });
}

// ---- Parts from shapes: a free shape on the page as a part of a design over box b ----
function partFrom(r, q, b, text = r.text) {
  const { id, shape, view: _, x, y, w, h, kept, ends, points, part, rest, format, text: t, named, ...more } = r;
  const at = (px, py) => [share((px - b.x) / b.w), share((py - b.y) / b.h)], [px, py] = at(q.x, q.y);
  // (A look it took from the box while it stood on the page, left as it was, is the box's still; and where it stands among them is its place in the list.)
  const { Layer: __, ...look } = { ...format };
  for (const [k, [ref, v]] of Object.entries(named ?? {})) if (JSON.stringify(look[k]) === JSON.stringify(v)) look[k] = ref;
  return { ...more, id: part ?? Log.newId(), geometry: r.geometry ?? 'rect', x: px, y: py, w: share(q.w / b.w), h: share(q.h / b.h), ...(rest && { rest: true }), ...(text && { text }), ...(Object.keys(look).length && { format: look }),
    ...(q.points && { points: q.points.map(([u, v]) => at(u, v)) }) };
}
// A part's row as it stands on the page: a look it takes from the box, as that is, what it was said as kept beside it.
function standing(format, m, scale) {
  const out = { ...format }, named = {};
  for (const [k, v] of Object.entries(format ?? {})) { const ref = typeof v === 'string' && /^\{(\w+)\}$/.exec(v); if (ref) { const o = m.settings[ref[1]]?.value; out[k] = ref[1] === 'Weight' ? +(o * scale).toFixed(3) : o; named[k] = [v, out[k]]; } }
  return { format: out, ...(Object.keys(named).length && { named }) };
}
// Where a design goes for a box: what the scope says; and how that's said ("all 5 limited partnerships", "Holdco").
const patternsAt = (m, s) => (s?.outputs?.length ? s.outputs : [treeOf(m.record)]);
function whom(m, s, marks) {
  const sc = canvas().scene(), N = App.notes.peek();
  if (!s?.outputs?.length) return N.nameOf(App.state.peek(), m.record);
  const n = marks ?? [...s.marks ?? []].length, caption = s.caption ?? Scene.captionOf(N, s.outputs[0], sc.view);
  return lowered(FormatBar.allOf({ caption, outputs: s.outputs }, n));
}
// A design at a note's pattern, every view and every note of it moving with it. On tx: the design as it's now, `was`, its id before.
function rewrite(tx, d, was, patterns, v) {
  for (const n of rewriteTargets(was, patterns, v)) { const { over } = n.value ?? {}; tx.note('Design', n.pattern, { ...d, ...(over && { over }) }, { view: n.view, ...(n.param && { param: n.param }) }); }
  const list = inChart(), at = list.findIndex(x => x.id === was || x.id === d.id);
  tx.note('Designs', LIBRARY, { list: at < 0 ? [...list, d] : list.map((x, i) => i === at ? d : x) });
}
function rewriteTargets(was, patterns, v) {
  const notes = App.notes.peek().notes('Design');
  return DesignSchema.targets(notes.filter(n => Scene.wholeDesign(n.value)), was, patterns, v, notes);
}
// ---- Make a design: from what's selected, shapes or a group, with the box they're for if it's among them ----
function makeable(ms) {
  const boxes = ms.filter(m => m.type === 'box'), free = ms.filter(m => m.type === 'shape' && !m.role && m.geometry !== 'legend' && !m.part);
  if (boxes.length > 1 || !free.length || boxes.length + free.length !== ms.length) return null;
  const by = canvas().scene().byId, all = [...new Map(free.flatMap(m => m.geometry === 'group' ? m.members.map(id => by.get(id)).filter(Boolean) : [m]).map(q => [q.id, q])).values()];
  return all.length ? { box: boxes[0] ?? null, free: all } : null;
}
// (The frame of what's drawn.)
const frameOf = qs => { const x = Math.min(...qs.map(q => q.x)), y = Math.min(...qs.map(q => q.y)); return { x, y, w: Math.max(1, Math.max(...qs.map(q => q.x + q.w)) - x), h: Math.max(1, Math.max(...qs.map(q => q.y + q.h)) - y) }; };
// A drawing's explicitly named fields become the form for a new object type. Existing definitions
// supply their datatype/options; unknown fields start as text and can be changed in the save dialog.
function fieldsOf(parts, record = null) {
  const state = App.state.peek(), schema = App.schema.peek();
  return DesignSchema.fields(parts, schema, { kind: state[record]?.kind, readable: record ? Scene.readable(state, App.notes.peek(), schema, record) : [] });
}
// Shapes that stand within a box are where they stand on it. Any other is fitted to the box it's for, what it draws as shares of its own frame, its words' sizes scaled down with it, never pasted and dragged into place. → one change, the shapes gone.
function make(ms = canvas().selected(), { asType = false } = {}) {
  const it = makeable(ms);
  if (!it) return Shell.toast('Select shapes, or a group, to make a design of first', { ms: 3000 });
  if (App.readOnly.peek()) return Shell.toast(App.whyNot());
  const { free } = it, sc = canvas().scene(), N = App.notes.peek(), rows = App.shown.peek(), drawn = frameOf(free), mid = { x: drawn.x + drawn.w / 2, y: drawn.y + drawn.h / 2 };
  const under = it.box ?? [...sc.marks].reverse().find(b => b.type === 'box' && mid.x >= b.x && mid.x <= b.x + b.w && mid.y >= b.y && mid.y <= b.y + b.h) ?? null;
  // Who it's for: this box, or a group it's in; on no box, each kind's on the page, or none yet, kept in this chart's gallery.
  const one = (g, i) => ({ key: `g${i}`, label: FormatBar.allOf(g, g.marks.size), s: g });
  // (Groups of boxes, not of a field in them, as what's every name is no design's.)
  const boxesOf = b => Canvas.groupsAt(sc, b).filter(g => g.marks.size > 1 && g.outputs.every(p => !p.args || p.out));
  // (Boxes a part by share means something in first: a triangle's are last.)
  const seen = new Set(), every = [...sc.marks.filter(b => b.type === 'box' && Shapes.boxy(b.shape)), ...sc.marks.filter(b => b.type === 'box' && !Shapes.boxy(b.shape))].flatMap(b => boxesOf(b).filter(g => { const k = g.outputs.map(p => Tree.key(p)).join(); if (seen.has(k)) return false; seen.add(k); return true; }));
  const fors = [...(under ? [{ key: 'own', label: `Just ${N.nameOf(App.state.peek(), under.record)}`, s: null }, ...boxesOf(under).map(one)] : every.map(one)), { key: 'new', label: 'A new object type', fresh: true }, { key: 'none', label: 'This chart’s gallery alone', s: null, none: true }];
  const fields = fieldsOf(free.map(q => rows.item(App.chart.peek(), q.id)[0]), under?.record);
  let name = '', kind = '', chosen = asType ? 'new' : fors.find(f => f.s)?.key ?? (under ? 'own' : 'new');
  const chart = App.chart.peek(), oldView = sc.view;
  const kindError = value => !Tree.clean(value) ? 'Enter an object type.' : Tree.same(value, 'View') || Object.values(App.schema.peek()).some(s => s.kind && Tree.same(s.kind, value)) ? 'This object type already exists. Choose a new name.' : '';
  function SaveDesign() {
    const [target, setTarget] = useState(chosen);
    return html`<div class="settings design-save">
      <label class="field"><span>Design name</span><input aria-label="Design name" placeholder="New design" spellcheck="false" autocomplete="off" autofocus onInput=${e => { name = e.target.value; }} /></label>
      <label class="field"><span>For</span><select aria-label="For" value=${target} onChange=${e => { chosen = e.target.value; setTarget(chosen); }}>${fors.map(f => html`<option value=${f.key}>${f.label}</option>`)}</select></label>
      ${target === 'new' ? html`<label class="field"><span>Object type</span><input aria-label="Object type" placeholder="e.g. Person" required autocomplete="off" value=${kind} onInput=${e => { kind = Tree.clean(e.target.value); e.target.setCustomValidity(kindError(kind)); }} /></label>
        <div class="design-fields"><div class="head">Fields for this type</div>${fields.map(f => html`<label class="field"><span>${f.label}</span>${f.linked ? html`<span class="muted">Linked field</span>` : html`<select aria-label=${`Type of ${f.label}`} disabled=${Tree.same(f.label, 'Name')} value=${f.datatype} onChange=${e => { f.datatype = e.target.value; }}>
          ${Object.entries(Tree.DATATYPES).map(([key, label]) => html`<option value=${key}>${label}</option>`)}${['choice', 'tag'].includes(f.datatype) ? html`<option value=${f.datatype}>${f.datatype === 'choice' ? 'Choice' : 'Yes / No'}</option>` : null}
        </select>`}</label>`)}${fields.some(f => f.linked) ? html`<p class="muted">Linked fields need matching relationships on the new type.</p>` : null}</div>` : null}
    </div>`;
  }
  Shell.dialog({ title: asType ? 'Save as object type' : 'Make a design', width: 420, actions: [{ label: 'Cancel', value: false }, { label: asType ? 'Save' : 'Make', value: true, primary: true }],
    body: () => html`<${SaveDesign} />` }).then(ok => {
    if (!ok) return;
    if (App.readOnly.peek() || App.chart.peek() !== chart || view() !== oldView || (chosen === 'new' && kindError(kind))) return;
    const f = fors.find(x => x.key === chosen), s = f?.s, v = sc.view, target = f?.fresh ? null : under ?? (s ? [...s.marks].map(id => sc.byId.get(id)).find(b => b?.type === 'box') : null), inside = !f?.fresh && under && free.every(q => q.x >= under.x - 1 && q.y >= under.y - 1 && q.x + q.w <= under.x + under.w + 1 && q.y + q.h <= under.y + under.h + 1);
    const within = inside ? under : drawn, W = target?.w ?? drawn.w, H = target?.h ?? drawn.h, k = inside ? 1 : Math.min(1, W / drawn.w, H / drawn.h);
    // A field's words take the width of the box, as they'll be longer than whatever stood for them, at the size the chart gives that field; words of its own, as they were, scaled with the drawing. What it doesn't name goes under the last that it does.
    const parts = free.map(q => {
      const r = rows.item(App.chart.peek(), q.id)[0], size = q.texts?.[0]?.look.Size, typed = r.format?.Size, text = r.text, reads = (r.geometry ?? 'rect') === 'text' && TextTemplate.fields(text).length > 0, { Size: _, ...look } = r.format ?? {};
      if (reads) return { ...partFrom({ ...r, part: null, format: { Align: 'center', Valign: 'middle', ...look, ...(inside && typed !== undefined && { Size: typed }) } }, q, within, text), x: 0, w: 1 };
      return partFrom({ ...r, part: null, format: { ...r.format, ...(size && { Size: +((typed ?? size * sc.page.scale) * k).toFixed(2) }) } }, q, within, text);
    });
    const foot = Math.min(1, Math.max(0, ...parts.filter(p => p.geometry === 'text' && p.text).map(p => p.y + p.h)));
    parts.push({ id: Log.newId(), rest: true, geometry: 'text', x: 0, y: foot, w: 1, h: Math.max(0.05, 1 - foot), format: { Align: 'center', Valign: foot ? 'top' : 'middle' } });
    const patterns = f?.fresh ? [{ kind }] : f?.none ? [] : patternsAt(target, s), d = {
      id: Log.newId(), name: Tree.clean(name) || (f?.fresh ? kind : 'New design'), w: round(W), h: round(H), base: { Shape: target?.shape ?? 'rect', ...(target?.shape === 'rounded' && { Corner: target.settings.Corner.value }) }, parts,
    };
    const said = f?.fresh ? `Saved ${d.name} as the design for ${kind}` : `Made the design ${d.name}${f?.none ? '' : ` for ${whom(target, s, s?.marks?.size)}`}`;
    const declarations = DesignSchema.declarations(App.schema.peek(), f?.fresh ? [kind] : [], fields);
    if (declarations.error) return Shell.toast(declarations.error);
    let made = null;
    const change = App.change(tx => {
      if (f?.fresh) {
        declarations.trees.forEach(tree => tx.add('spec', { tree }));
        // The drawing becomes its first object, so the result can immediately be filled in and edited.
        made = tx.add('record', { kind });
        tx.add('record', { at: made, edge: 'Name', field: 'text', value: kind });
        const o = sc.page.offset ?? { x: 0, y: 0 };
        tx.note('Position', { id: made, kind }, { x: drawn.x - o.x, y: drawn.y - o.y, w: drawn.w, h: drawn.h, loose: true }, { view: v });
        App.showMade(tx, [made], v);
      }
      for (const q of free) tx.remove(q.id);
      for (const g of sc.marks) if (g.geometry === 'group' && g.members.every(id => free.some(q => q.id === id))) tx.remove(g.id);
      rewrite(tx, d, null, patterns, v); tx.says(said);
    }, { dated: false, say: said });
    if (change) { if (f?.fresh) Shell.store.set('kind', kind); Shell.select(made ? [made] : target ? [target.id] : []); }
  });
}

// ---- Edit design: the parts stood on the page over one box, the rest dulled, till Done or Discard ----
const editing = signal(null);
// A change that belongs here: what a hand draws, where things stand, and what's given the box itself. Anything else waits for Done.
function takes(record) {
  return tx => {
    const { adds, removes } = tx.made(), rows = App.shown.peek().rows(App.chart.peek());
    if (adds.some(r => 'record' in r || 'spec' in r) || rows.some(r => 'record' in r && removes.includes(r.id))) return false;
    const fine = r => ['Position', 'Scale'].includes(r.label) || r.pattern?.id === record;
    const { added, removed } = tx.noted(() => true);
    return added.every(fine) && removed.every(fine);
  };
}
const ownLooks = (rows, v, record) => rows.filter(r => 'note' in r && r.view === v && r.pattern?.id === record && Notes.FORMATS.has(r.label) && !['Design', 'Shown'].includes(r.label));
function edit(m, given) {
  const c = canvas();
  if (!c || !m || editing.peek()) return;
  if (App.readOnly.peek()) return Shell.toast(App.whyNot());
  if (App.pending.peek()) return Shell.toast('Make or discard the change pending first');
  const sc = c.scene(), v = sc.view, N = App.notes.peek(), pen = given || !m.design ? FormatBar.scope(true) : null, note = m.design && !given ? m.design.note : null;
  // (A design given to a group stands at each of its patterns, and it's the group's that's edited.)
  const standsAt = p => N.notes('Design').some(n => n.view === v && Tree.key(n.pattern) === Tree.key(p) && n.value?.id === note.value.id), group = note && Canvas.groupsAt(sc, m).find(g => g.outputs.length > 1 && g.outputs.some(p => Tree.key(p) === Tree.key(note.pattern)) && g.outputs.every(standsAt));
  const patterns = group ? group.outputs : note ? [note.pattern] : patternsAt(m, pen);
  // (Editing what's there, the design and not what's said over it; or one from the gallery; or, for a box with none, its fields in one part to begin from.)
  const { over: _, ...there } = m.design?.note.value ?? {};
  const d = given ?? (m.design ? there : { id: Log.newId(), name: 'New design', w: round(m.w), h: round(m.h), base: { Shape: m.shape }, parts: [{ id: Log.newId(), rest: true, geometry: 'text', x: 0, y: 0, w: 1, h: 1, format: { Align: 'center', Valign: 'middle' } }] });
  const n = group ? group.marks.size : note ? sc.marks.filter(b => b.type === 'box' && b.design?.note.note === note.note).length : pen?.marks?.size;
  const said = group ?? (note && !Tree.idsIn(patterns[0]).size ? { outputs: patterns, caption: Scene.captionOf(N, patterns[0], v) } : pen?.outputs?.length ? pen : null);
  const where = c.whereNow(), rows0 = new Set(App.shown.peek().rows(App.chart.peek()).filter(r => 'shape' in r && r.view === v).map(r => r.shape)), own = new Map(ownLooks(App.shown.peek().rows(App.chart.peek()), v, m.record).map(r => [r.label, JSON.stringify(r.value)]));
  const wasId = given || Shapes.DESIGNS.some(x => x.id === d.id) ? null : d.id;
  const kinds = DesignSchema.kinds(rewriteTargets(wasId, patterns, v), App.schema.peek(), App.state.peek());
  // (As large as it stands, or one from the gallery as large as it would, with these words; each part where it falls in that, and the box held so, whatever its rank's height.)
  const like = given ? Scene.instance(sc, m.id, d, N, App.computed.peek()) : m, W = round(like.w), H = round(like.h), o = sc.page.placed ? sc.page.offset : { x: 0, y: 0 }, dx = m.x - like.x, dy = m.y - like.y, stands = new Map();
  App.sandbox(takes(m.record));
  const stood = App.change(tx => {
    tx.note('Design', treeOf(m.record), { id: d.id, name: d.name, w: W, h: H, base: d.base ?? {}, strip: true, editing: true, begun: new Date().toISOString() }, { view: v });
    tx.note('Position', treeOf(m.record), { x: round(m.x - o.x), y: round(m.y - o.y), w: W, h: H, hand: true }, { view: v });
    for (const p of d.parts ?? []) {
      const { id, x, y, w, h, points, format, ...row } = p, q = like.parts?.find(q2 => q2.part === id);
      const at = { x: round(q ? q.x + dx : m.x + x * W), y: round(q ? q.y + dy : m.y + y * H), w: round(q ? q.w : w * W), h: round(q ? q.h : h * H), ...(points && { points: (q?.points?.map(([a, b]) => [a + dx, b + dy]) ?? points.map(([a, b]) => [m.x + a * W, m.y + b * H])).map(([a, b]) => [round(a), round(b)]) }) };
      stands.set(id, at);
      tx.add('shape', { ...row, ...standing(format, m, sc.page.scale), view: v, part: id, ...at });
    }
  }, { dated: false });
  if (!stood) { App.unsandbox(); return; }
  App.sandboxBegun();
  // (What's drawn since, and the box; not what's on the chart's master.)
  const box = m.id, keeps = id => { const q = c.scene().byId.get(id); return id === box || (!rows0.has(id) && q?.type === 'shape' && !q.master); };
  c.designing({ box, keeps });
  // (The box selected, so its page is beside it, its rows to drag onto the parts.)
  Shell.select([box]);
  c.bringTo({ x: m.x - m.w * 0.5, y: m.y - m.h * 0.5, w: m.w * 2, h: m.h * 2 });
  const bar = c.root.querySelector('.dc-over').appendChild(document.createElement('div'));
  bar.className = 'dc-designbar';
  bar.setAttribute('role', 'toolbar');
  // (What it's called, typed over here.)
  const words = bar.appendChild(document.createElement('span')), called = bar.appendChild(Object.assign(document.createElement('input'), { className: 'cell', type: 'text', value: d.name ?? '', spellcheck: false, autocomplete: 'off', placeholder: 'Name' })), discard = bar.appendChild(Object.assign(document.createElement('button'), { className: 'btn', type: 'button', textContent: 'Discard' })), done = bar.appendChild(Object.assign(document.createElement('button'), { className: 'btn primary', type: 'button', textContent: 'Done' }));
  called.setAttribute('aria-label', 'Name of the design');
  called.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') called.blur(); if (e.key === 'Escape') { called.value = d.name ?? ''; called.blur(); } });
  // (A design of this chart's given at other patterns too moves there as well, and it's said.)
  const also = note && !Shapes.DESIGNS.some(x => x.id === d.id) ? sc.marks.filter(b => b.type === 'box' && b.design?.value.id === d.id && b.design.note.note !== note.note && !group?.marks.has(b.id)).length : 0, who = `${whom(m, said, n)}${also ? ` and ${also} more` : ''}`;
  words.textContent = `Editing the design of ${who}`;
  discard.onclick = () => leave(false);
  done.onclick = () => leave(true);
  editing.value = { box, record: m.record, d, wasId, patterns, view: v, rows0, where, bar, called, whom: who, stands, W, H, own, kinds, newFields: new Map() };
}
function leave(keep) {
  const e = editing.peek();
  if (!e) return;
  const c = canvas(), sc = c.scene(), b = sc.byId.get(e.box);
  // What the page holds now, as the design it says.
  let d = null, looks = {};
  if (keep && b) {
    const rows = App.shown.peek().rows(App.chart.peek()), mine = new Map(rows.filter(r => 'shape' in r && r.view === e.view && !e.rows0.has(r.shape)).map(r => [r.shape, r]));
    const parts = [], same = (a, c) => a && Math.abs(a.x - c.x) < 0.01 && Math.abs(a.y - c.y) < 0.01 && Math.abs(a.w - c.w) < 0.01 && Math.abs(a.h - c.h) < 0.01 && JSON.stringify(a.points ?? null) === JSON.stringify(c.points ?? null);
    // (Words that have run on past the box's foot take the box with them: it holds what's in it.)
    const foot = Math.max(b.y + b.h, ...sc.marks.filter(q => mine.has(q.id) && q.geometry === 'text' && q.x < b.x + b.w && q.x + q.w > b.x && q.y < b.y + b.h).map(q => q.y + q.h)), held = { ...b, h: foot - b.y };
    const resized = Math.abs(held.w - e.W) > 0.5 || Math.abs(held.h - e.H) > 0.5;
    // (In the order they're drawn in; a group's own row isn't a part, its shapes are. One no hand has moved keeps the share it had, and the box no hand has sized the size the design said.)
    for (const q of sc.marks) { const r = mine.get(q.id); if (r && q.geometry !== 'group') { const was = !resized && r.part && same(e.stands.get(r.part), r) && e.d.parts?.find(p => p.id === r.part), part = partFrom(r, q, held); parts.push(was ? { ...part, x: was.x, y: was.y, w: was.w, h: was.h, ...(was.points && { points: was.points }) } : part); } }
    // (What's given the box itself since it began: what it had of its own before stays its own.)
    looks = Object.fromEntries(ownLooks(rows, e.view, e.record).filter(r => e.own.get(r.label) !== JSON.stringify(r.value)).map(r => [r.label, r.value]));
    const { Shape, Corner, ...others } = looks;
    looks = others;
    d = { ...e.d, name: Tree.clean(e.called.value) || e.d.name, ...(resized || e.d.w == null ? { w: round(held.w), h: round(held.h) } : {}), base: { ...e.d.base, ...(Shape && { Shape }), ...(Corner !== undefined && { Corner }) }, parts };
    delete d.editing; delete d.strip; delete d.over;
    if (!e.wasId) d.id = Log.newId();
    // (As it was, it's nothing to write.)
    const plain = v => JSON.stringify(v, (k, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([p], [q]) => p < q ? -1 : 1)) : x);
    if (e.wasId && plain({ ...d, id: 0 }) === plain({ ...e.d, id: 0 }) && !Object.keys(looks).length) keep = null;
  }
  // Plan before leaving the sandbox: a conflicting field keeps the editable draft on screen.
  // Only explicitly created fields are declared; relative and nested tokens keep their meaning.
  const used = new Set((d?.parts ?? []).flatMap(p => TextTemplate.fields(p.text)).map(Tree.norm));
  const added = keep ? [...e.newFields.values()].filter(f => used.has(Tree.norm(f.label))) : [];
  const declarations = DesignSchema.declarations(App.schema.peek(), added.length ? e.kinds : [], added);
  if (declarations.error) return Shell.toast(declarations.error);
  e.bar.remove();
  editing.value = null;
  c.designing(null);
  Shell.select([]);
  App.unsandbox();
  c.goBack(e.where);
  // (Back on the box it was over, where the keys and the eye left off.)
  Shell.select([e.box]);
  if (keep === null) return Shell.toast('The design is as it was', { ms: 2500 });
  if (!keep) return Shell.toast('Discarded the changes to the design', { ms: 2500 });
  const said = `Changed the design of ${e.whom}`;
  App.change(tx => { declarations.trees.forEach(tree => tx.add('spec', { tree })); rewrite(tx, d, e.wasId, e.patterns, e.view); for (const [l, v] of Object.entries(looks)) for (const p of e.patterns) tx.note(l, p, v, { view: e.view }); tx.says(said); },
    { dated: false, say: said, empty: () => Shell.toast('The design is as it was', { ms: 2500 }) });
}
// The parts stood on the page, as the scene draws them, the topmost first.
const partsNow = (sc, e) => sc.marks.filter(q => q.type === 'shape' && q.geometry !== 'group' && !q.role && !q.master && !e.rows0.has(q.id));
// (A frame's margin, as it prints, however the page is scaled; and what words take in a frame: their lines, the margins over and under them.)
const margin = (sc, i, by) => (i != null ? i * Scene.PT : by) / (sc.page.scale || 1);
const tallIn = (sc, read, look, w, inset) => Math.ceil(Scene.measure(read || 'M', look) / Math.max(1, w - margin(sc, inset?.l, 9.6) - margin(sc, inset?.r, 9.6))) * Scene.lineHeight(look) + margin(sc, inset?.t, 4.8) + margin(sc, inset?.b, 4.8);
// New words on a box being edited, so they fit: in the column the other fields stand in, or else the box's, aligned with them; in the free band they were dropped at where that holds them, or else under the last words, the box growing as far as they need; and any frame they'd stand in stops above them, so what's in it pushes them down as it runs on. On tx. → the new part's id.
function addPart(tx, sc, e, b, at, text) {
  const shown = App.shown.peek(), chart = App.chart.peek(), rowOf = id => shown.item(chart, id).at(-1), parts = partsNow(sc, e), rest = parts.find(q => rowOf(q.id)?.rest), col = rest ?? b, inCol = p => p.x < col.x + col.w && p.x + p.w > col.x;
  // (What words take, as far as the margin under them, a frame being no shorter than that.)
  const under = p => margin(sc, rowOf(p.id)?.format?.Inset?.b, 4.8), inset = rest && rowOf(rest.id)?.format?.Inset;
  const taken = parts.filter(p => inCol(p) && p.texts?.some(t => t.lines?.length)).map(p => { const t = p.texts[0], ys = t.lines.map(l => l.y - Scene.baseline(t.look)); return [p.y + Math.min(...ys), p.y + Math.max(...ys) + Scene.lineHeight(t.look) + under(p)]; }).sort((m, n) => m[0] - n[0]), gaps = [];
  let from = b.y;
  for (const [top, foot] of taken) { if (top > from) gaps.push([from, top]); from = Math.max(from, foot); }
  if (b.y + b.h > from) gaps.push([from, b.y + b.h]);
  // (Its height by what it reads at this box, at the size the page gives what's beside a name.)
  const read = text ? Scene.readWords(text, e.record, Scene.reader(App.state.peek(), App.notes.peek(), App.computed.peek(), App.day.peek())) : '', need = tallIn(sc, read, { ...Scene.DEFAULTS.text, Size: 8 }, col.w, inset), y0 = at?.y;
  const band = (y0 != null && gaps.find(([u, v]) => v - u >= need && y0 >= u && y0 <= v)) || [from, Math.max(from + need, b.y + b.h)];
  if (band[1] > b.y + b.h) { const v = App.notes.peek().resolve('Position', treeOf(e.record), e.view)?.value; if (v) tx.note('Position', treeOf(e.record), { ...v, h: round(b.h + band[1] - (b.y + b.h)) }, { view: e.view }); }
  for (const p of parts) { const r = rowOf(p.id); if (r?.geometry === 'text' && inCol(p) && p.y < band[0] && p.y + p.h > band[0]) tx.update(p.id, { h: round(band[0] - p.y) }); }
  return tx.add('shape', { view: e.view, geometry: 'text', part: Log.newId(), x: round(col.x), y: round(band[0]), w: round(col.w), h: round(Math.max(need, band[1] - band[0])), text, format: { Align: rest?.look.Align ?? 'center', Valign: 'top', ...(inset && { Inset: inset }) } });
}
// Words typed in a part: the box being edited taller where they'd run on past its foot, in the same change, so it holds what's in it. On tx.
function holdWords(tx, id, text) {
  const e = editing.peek(), sc = canvas()?.scene(), b = sc?.byId.get(e?.box), q = sc?.byId.get(id);
  if (!b || q?.geometry !== 'text' || q.y >= b.y + b.h) return;
  const look = q.texts?.[0]?.look ?? { ...Scene.DEFAULTS.text, Size: 8 }, read = /^\s*=/.test(text ?? '') ? '' : Scene.readWords(text ?? '', e.record, Scene.reader(App.state.peek(), App.notes.peek(), App.computed.peek(), App.day.peek()));
  const foot = q.y + tallIn(sc, read, look, q.w, App.shown.peek().item(App.chart.peek(), id).at(-1)?.format?.Inset), v = App.notes.peek().resolve('Position', treeOf(e.record), e.view)?.value;
  if (foot > b.y + b.h && v) tx.note('Position', treeOf(e.record), { ...v, h: round(foot - b.y) }, { view: e.view });
}
// A row dropped on what's being edited: on a part, its token; on the box, a new text part, at the size the page gives that field.
function dropped(q, edge, at) {
  const e = editing.peek();
  if (!e) return null;
  const token = TextTemplate.field(edge), row = App.shown.peek().item(App.chart.peek(), q.id)[0];
  if (q.type === 'shape' && row && !row.rest) return App.change(tx => { const text = TextTemplate.append(row.text, edge); tx.update(q.id, { text }); holdWords(tx, q.id, text); }, { dated: false, say: `Put ${edge} in the part` });
  const sc = canvas().scene(), b = sc.byId.get(e.box);
  return App.change(tx => { addPart(tx, sc, e, b, at, token); }, { dated: false, say: `Put ${edge} in the design` });
}
// Words begun on the box being edited (Text in this box, its right-click, a double-click in its room, Insert's text box): one more part, typed straight in; left empty, it goes.
function addWords() {
  const e = editing.peek(), c = canvas(), sc = c?.scene(), b = sc?.byId.get(e?.box);
  if (!b) return null;
  let id = null;
  if (!App.change(tx => { id = addPart(tx, sc, e, b, null, ''); }, { dated: false })) return null;
  Shell.select([id]);
  return c.edit(id);
}

// ---- The panel, while a design is edited: its parts by name, a click from each, dragged to reorder; and a part's words ----
// A part as it stands on the page, in shares of its box, so it's called what it is.
const nameOf = (row, b) => Scene.partName({ ...row, w: (row.w ?? 0) / (b?.w || 1), h: (row.h ?? 0) / (b?.h || 1) });
function Parts() {
  App.scene.value;
  const e = editing.value, c = canvas(), sc = c?.scene(), [naming, setNaming] = useState(null), [drop, setDrop] = useState(null), self = useRef(null);
  // (The panel opens on them, wherever it was scrolled to, and whatever it was holding still.)
  useLayoutEffect(() => { const pane = self.current?.closest('.inspector'); if (!pane) return; pane.scrollTop = 0; const t = setTimeout(() => { pane.scrollTop = 0; }, 60); return () => clearTimeout(t); }, [e?.box]);
  if (!e || !sc) return null;
  const keys = Shell.selection.value, b = sc.byId.get(e.box), shown = App.shown.peek(), chart = App.chart.peek();
  const rowOf = id => shown.item(chart, id).at(-1), list = [...partsNow(sc, e)].reverse();
  const pick = q => { Shell.select([q.id]); c.root.focus({ preventScroll: true }); };
  const name = (q, v) => { setNaming(null); const t = Tree.clean(v ?? ''); if (t !== (rowOf(q.id)?.name ?? '')) App.change(tx => tx.update(q.id, { name: t || undefined }), { dated: false, say: t ? `Named the part ${t}` : 'Took the part’s name off' }); };
  const grab = (ev, q) => {
    if (ev.button !== 0 || ev.target.closest('button, input')) return;
    const y0 = ev.clientY, host = ev.currentTarget.parentElement;
    let on = null, after = false, moved = false;
    const move = m => { if (Math.abs(m.clientY - y0) > 4) moved = true; if (!moved) return; const r = [...host.querySelectorAll('[data-part]')].find(n => { const x = n.getBoundingClientRect(); return m.clientY >= x.top && m.clientY < x.bottom; }); if (!r) return; const x = r.getBoundingClientRect(); on = r.dataset.part; after = m.clientY < x.top + x.height / 2; setDrop({ on, after }); };
    const up = () => { removeEventListener('pointermove', move, true); removeEventListener('pointerup', up, true); setDrop(null); const to = on && sc.byId.get(on); if (moved && to && to !== q) c.reorder(q, to, after, nameOf(rowOf(q.id) ?? {}, b)); };
    addEventListener('pointermove', move, true); addEventListener('pointerup', up, true);
  };
  const drawn = q => q.geometry === 'text' ? 'T' : null;
  return html`<div class="insp parts-of" role="region" aria-label="Parts" ref=${self}>
    <h3 class="sect"><span class="fold-ish">Parts</span></h3>
    <div class="dc-panerows part-rows" role="list">
      ${list.map(q => { const row = rowOf(q.id) ?? {}, said = nameOf(row, b); return html`<div class=${'row' + (keys.includes(q.id) ? ' on' : '') + (drop?.on === q.id ? (drop.after ? ' dropabove' : ' dropbelow') : '')} data-part=${q.id} role="listitem" key=${q.id} onClick=${() => pick(q)} onPointerDown=${ev => grab(ev, q)} onDblClick=${() => setNaming(q.id)}>
        <span class="glyph" aria-hidden="true">${drawn(q) ?? html`<svg viewBox="0 0 14 14"><path d=${Scene.path(q.geometry === 'line' ? 'rect' : q.geometry, 12, q.geometry === 'line' ? 0.1 : 10)} transform="translate(1 2)" fill="none" stroke="currentColor" /></svg>`}</span>
        ${naming === q.id ? html`<input class="cell" value=${said} aria-label="Name" ref=${el => el && !el.dataset.on && (el.dataset.on = 1, el.focus(), el.select())} onBlur=${x => name(q, x.target.value)} onKeyDown=${x => { x.stopPropagation(); if (x.key === 'Enter') x.target.blur(); if (x.key === 'Escape') setNaming(null); }} />` : html`<span class="nm">${said}</span>`}
      </div>`; })}
      <div class=${'row base' + (keys.includes(e.box) ? ' on' : '')} role="listitem" onClick=${() => { Shell.select([e.box]); c.root.focus({ preventScroll: true }); }}><span class="glyph" aria-hidden="true"><svg viewBox="0 0 14 14"><path d=${Scene.path(b?.shape ?? 'rect', 12, 10)} transform="translate(1 2)" fill="none" stroke="currentColor" /></svg></span><span class="nm">The box</span></div>
    </div>
  </div>`;
}
// What a part's words can read, the box's it's being edited over.
const offeredNow = () => {
  const e = editing.peek(), record = e?.record ?? boxNow()?.record;
  const labels = record ? Scene.readable(App.state.peek(), App.notes.peek(), App.schema.peek(), record).map(x => x.label) : ['Name', ...Object.values(App.schema.peek()).filter(s => s.args?.length === 1 && s.args[0].loc.kind).map(s => s.args[0].edge)];
  return [...new Set([...labels, ...[...e?.newFields?.values() ?? []].map(f => f.label)])];
};
// The same for a list to pick from: its name, then who's over it that it has, by name, for that's what's hard to guess; then all else.
const pickNow = () => {
  const e = editing.peek(); if (!e) return offeredNow();
  const st = App.state.peek(), N = App.notes.peek(), all = Scene.readable(st, N, App.schema.peek(), e.record), has = new Set(Scene.listsAt(st, N, e.record).map(l => Tree.norm(l.name)));
  const own = [...all.filter(x => !x.of).map(x => x.label), ...[...e.newFields.values()].map(f => f.label)], near = all.filter(x => x.first && has.has(Tree.norm(x.of))).map(x => x.label), far = all.filter(x => x.of && !near.includes(x.label)).map(x => x.label);
  return [...own.slice(0, 1), ...near, { head: 'Its own' }, ...own.slice(1), ...(far.length ? [{ head: 'Over it' }, ...far] : [])];
};
// Record/schema work stays in this adapter. The editor itself knows only offered labels and text.
async function createField(suggested) {
  let name = suggested ?? '';
  const session = editing.peek(), chart = App.chart.peek();
  const ok = await Shell.dialog({ title: 'New merge field', width: 340, actions: [{ label: 'Cancel', value: false }, { label: 'Insert field', value: true, primary: true }],
    body: () => html`<div class="settings"><label class="field"><span>Field name</span><input aria-label="Field name" required autofocus autocomplete="off" placeholder="e.g. Role" value=${name} onInput=${e => { name = e.target.value; e.target.setCustomValidity(!Tree.clean(name) ? 'Enter a field name.' : /[{}|›\n]/.test(name) ? 'Use a name without braces, a vertical bar or ›.' : ''); }} /></label></div>` });
  if (!ok || App.readOnly.peek() || App.chart.peek() !== chart || editing.peek() !== session || !Tree.clean(name) || /[{}|›\n]/.test(name)) return null;
  const label = Tree.clean(name);
  if (session && !offeredNow().some(l => Tree.same(l, label))) session.newFields.set(Tree.norm(label), { label, paths: [label], datatype: 'text', outputs: [] });
  return label;
}
function Words({ text, runs, put, label = 'Text' }) {
  return html`<${WordsEditor} text=${text} runs=${runs} put=${put} label=${label} offered=${pickNow()} createField=${createField} readOnly=${App.readOnly.value} fieldLabel=${token => Scene.partName({ text: TextTemplate.field(token) })} />`;
}
// What the part the other fields go in holds now: each field no other part names, as a chip; and, clicked, given a part of its own.
function Holds() {
  App.scene.value;
  const e = editing.value, sc = canvas()?.scene(), b = sc?.byId.get(e?.box);
  if (!b) return null;
  const st = App.state.peek(), shown = App.shown.peek(), chart = App.chart.peek(), named = new Set(partsNow(sc, e).flatMap(q => Scene.tokensIn(shown.item(chart, q.id).at(-1)?.text)).map(Tree.norm));
  // (A field by its name, or a free text by the field it reads, or its words.)
  const nameOfIt = it => st[it.id]?.edge ?? it.blank?.edge ?? (it.free ? Scene.partName({ text: String(it.free.text).split('\n')[0] }) : null);
  const held = (b.fields ?? []).filter(it => nameOfIt(it) && !it.was && !named.has(Tree.norm(nameOfIt(it))));
  return held.length ? html`<div class="row"><div class="k">Shows</div><div class="v held-fields">${held.map(it => html`<button type="button" class="word-chip" key=${it.id} data-tip=${it.free ? null : 'Give it a part of its own'} disabled=${!!it.free} onClick=${() => dropped(b, nameOfIt(it), null)}>${nameOfIt(it)}</button>`)}</div></div>` : null;
}
// Away from the view it's over, what's on the page is the design: Done. (Nothing else is lost by going.)
effect(() => { const v = Shell.view.value, e = editing.peek(); if (e && v !== e.view) leave(true); });
// What's dulled can't be selected, whatever selects it.
effect(() => { const keys = Shell.selection.value, e = editing.value, c = canvas(); if (!e || !c?.scene()) return; const left = keys.filter(k => { const m = c.scene().byId.get(Canvas.keyParts(k)[0]); return m && (m.id === e.box || !e.rows0.has(m.id)) && (m.type === 'shape' || m.id === e.box); }); if (left.length !== keys.length) queueMicrotask(() => Shell.select(left)); });

// ---- Save to house style: kept in this browser with the look it's of, or a house style of its own ----
function saveToHouse(d) {
  if (!d) return;
  const { over, ...plain } = d, houses = FormatBar.houseStyles?.() ?? [], NEW = '·new';
  let to = houses[0]?.id ?? NEW, name = '';
  // (A name's asked for only where it's a new one.)
  const Which = () => { const [at, setAt] = preactHooks.useState(to); return html`<div class="settings">${houses.length ? html`<label class="field"><span>House style</span><select aria-label="House style" autofocus onChange=${e => { to = e.target.value; setAt(to); }}>${houses.map(s => html`<option value=${s.id}>${s.name}</option>`)}<option value=${NEW}>New house style…</option></select></label>` : null}
    ${at === NEW ? html`<label class="field"><span>Name</span><input aria-label="Name" placeholder="House designs" spellcheck="false" autocomplete="off" autofocus onInput=${e => { name = e.target.value; }} /></label>` : null}</div>`; };
  Shell.dialog({ title: `Save ${d.name} to a house style`, width: 380, actions: [{ label: 'Cancel', value: false }, { label: 'Save', value: true, primary: true }],
    body: () => html`<${Which} />` }).then(async ok => {
    if (!ok) return;
    const was = houses.find(s => s.id === to);
    const named = was?.name ?? (Tree.clean(name) || 'House designs'), whole = Notes.houseLook(App.shown.peek().rows(App.chart.peek()), Shell.view.peek()), look = was ? { ...was.look, designs: [...(was.look.designs ?? []).filter(x => x.id !== plain.id), plain] } : { notes: [], order: [], furniture: {}, designs: [plain], ...(whole.theme && { theme: whole.theme }), ...(whole.master && { master: whole.master }) };
    await Store.keepHouseStyle({ id: was?.id ?? Log.newId(), name: named, look });
    Shell.parts.peek().formatbar?.relist?.();
    Shell.toast(`Saved ${d.name} to the house style ${named}`);
  });
}

// ---- What a box's right-click offers ----
function items(ms, ro) {
  if (editing.peek()) return [];
  const one = ms.length === 1 && ms[0].type === 'box' ? ms[0] : null, overs = !!one?.design?.overs.length;
  return one ? [{ label: 'Edit design', disabled: ro, run: () => edit(one) }, ...(overs ? [{ label: 'Reset to design', disabled: ro, run: () => reset(one) }] : []), ...(one.design ? [{ label: 'Save to house style…', run: () => saveToHouse(one.design.value) }] : [])] : [];
}
// What a selection of shapes or a group offers beside its Format: to be made a design, where it can be one.
const makes = (ms, ro) => !editing.peek() && makeable(ms) ? [{ label: 'Make a design…', disabled: ro, run: () => make(ms) }] : [];
// A row of Styles or the Key double-clicked, by its outputs: the design of the first box it reaches.
function editRow(g) {
  const sc = canvas()?.scene(), m = sc && sc.marks.find(b => b.type === 'box' && b.settings.Design?.value && g.outputs.some(p => b.design && Tree.key(p) === Tree.key(b.design.note.pattern)));
  if (m) edit(m);
}

const onChart = () => (canvas()?.root.clientWidth ?? 0) > 0 && !!canvas().scene();
const whyNot = () => App.readOnly.peek() ? App.whyNot() : !onChart() ? 'Show a chart first' : 'Select a box first';
const pick = () => { const m = canvas()?.selected().find(x => x.type === 'box'); return onChart() && !App.readOnly.peek() ? m ?? null : null; };
for (const [id, name, names, run, enabled, why] of [
  ['design.make', 'Make a design…', ['Component', 'Group', 'Make a component', 'Create component', 'Template', 'New design'], () => make(), () => onChart() && !App.readOnly.peek() && !!makeable(canvas().selected()), () => App.readOnly.peek() ? App.whyNot() : 'Select shapes, or a group, to make a design of first'],
  ['design.edit', 'Edit design', ['Edit component', 'Master', 'Change the design'], () => edit(pick()), () => !!pick() && !editing.peek(), whyNot],
  ['design.reset', 'Reset to design', ['Reset overrides', 'Detach', 'Reset instance', 'Take the overrides off'], () => reset(pick()), () => !!pick()?.design?.overs.length, () => App.readOnly.peek() ? App.whyNot() : 'Select a box with what’s said over its design first'],
  ['design.house', 'Save design to house style…', ['Publish', 'Library', 'House style'], () => saveToHouse(pick()?.design?.value), () => !!pick()?.design, whyNot],
  ['design.done', 'Done with the design', ['Finish editing the design', 'Close design'], () => leave(true), () => !!editing.peek(), () => 'No design is being edited'],
  ['design.discard', 'Discard the changes to the design', ['Cancel the design'], () => leave(false), () => !!editing.peek(), () => 'No design is being edited'],
]) Shell.register('action', { id, name, names, run, enabled, why });

return { open, say, atPen, tokenIn, reset, edit, make, items, makes, dropped, addWords, holdWords, editRow, editing, leave, forRecord, Parts, Words, Holds, nameOf: row => { const e = editing.peek(), b = e && canvas()?.scene()?.byId.get(e.box); return nameOf(row, b); } };
})();
