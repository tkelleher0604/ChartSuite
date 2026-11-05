// Designs: a group of shapes standing for a box, Figma's component (dendra.md, Group designs). One note, Design, at a pattern in a
// view, so the narrowest decides, as Fill does; the scene and every output draw what it says. Here: the gallery, each thumbnail by the
// renderer's own hand in the selected record's words; a design applied at the pen as any look is; what's said over one at the pen,
// only what's different; Reset to design; Make a design from a box and the free shapes drawn over it; and Edit design, which stands the
// parts on the page as free shapes over one box, so every drawing tool works on them, the rest of the chart dulled, till Done writes the note.
const Designs = (() => {
const { h } = preact;
const html = htm.bind(h);
const { signal, effect } = preactSignals;

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
// A design as the record it's given to has it: what it leaves to that record, an entry the record has.
function forRecord(d, m) {
  if (!d.parts?.some(p => p.text === '{?}')) return d;
  const st = App.state.peek(), fields = (m?.fields ?? m?.texts ?? []).map(it => st[it.id]).filter(r => r?.edge && !Tree.same(r.edge, 'Name'));
  const edge = fields.find(r => 'choice' in r)?.edge ?? fields[0]?.edge ?? (m && (Tree.index(st).entries.get(m.record) ?? []).map(e => st[e]).find(r => 'choice' in r)?.edge);
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
  return b ? Export.markSvgOf(b, sc.page.scale) : '';
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
  const m = boxNow(), ro = App.readOnly.value, now = m?.design?.value, nowId = m?.settings.Design?.value?.id ?? (m ? 'plain' : null);
  const tile = d => {
    const v = valueOf(d, m), pressed = nowId === d.id;
    return html`<span class="tile-at" key=${d.house ? `${d.house}|${d.id}` : d.id}>
      <button type="button" class="tile" aria-label=${d.name} data-tip=${d.name} aria-pressed=${pressed} autofocus=${pressed} onPointerEnter=${() => FormatBar.preview('Design', v)} onFocus=${e => { if (e.currentTarget.matches(':focus-visible')) FormatBar.preview('Design', v); }} onClick=${() => { close(); FormatBar.apply('Design', v); }}>
        <span class="art" dangerouslySetInnerHTML=${{ __html: m ? art(m, d.id === 'plain' ? null : forRecord(d, m)) : '' }} /><span class="nm">${d.name}</span></button>
      ${d.id !== 'plain' && !ro ? html`<button type="button" class="pencil" tabindex="-1" aria-label=${`Edit ${d.name}`} data-tip="Edit design" onClick=${() => { close(); FormatBar.preview(); edit(m, forRecord(d, m)); }}>${Shell.icon('Pencil')}</button>` : null}
    </span>`;
  };
  const mine = inChart(), houses = inHouses(), bare = Shapes.DESIGNS;
  return html`<div class="picker designs" data-grid=".tiles button.tile" role="group" aria-label="Design" onPointerLeave=${() => FormatBar.preview()}>
    <div class="tiles">${bare.map(tile)}</div>
    ${mine.length ? html`<div class="menu-head">This chart</div><div class="tiles">${mine.map(tile)}</div>` : null}
    ${houses.length ? html`<div class="menu-head">House style</div><div class="tiles">${houses.map(tile)}</div>` : null}
    <div class="menu-sep" />
    <div class="acts">
      <button type="button" class="btn" disabled=${ro || !m} onClick=${() => { close(); FormatBar.preview(); edit(m); }}>Edit design</button>
      <button type="button" class="btn" disabled=${ro || !m?.design?.overs.length} onClick=${() => { close(); reset(m); }}>Reset to design</button>
      <button type="button" class="btn" disabled=${!now} onClick=${() => { close(); saveToHouse(now); }}>Save to house style…</button>
    </div>
  </div>`;
}
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
// A row dropped on a part: its token takes the place of the one entry a tag reads, or goes under the words a part has (a name stays). → the part's words now.
function tokenIn(m, part, edge) {
  const raw = String(m.design.value.parts.find(p => p.id === part)?.text ?? '').trim(), one = /^\{([^{}\n]+)\}$/.exec(raw);
  return !raw || (one && !Tree.same(one[1].split('|')[0].trim(), 'Name')) ? `{${edge}}` : `${raw}\n{${edge}}`;
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
  App.change(tx => { for (const n of these) { if (Scene.wholeDesign(n.value)) { const { over, ...whole } = n.value; tx.note('Design', n.pattern, whole, { view: v }); } else tx.note('Design', n.pattern, undefined, { view: v }); } }, { dated: false, say: `Reset ${App.notes.peek().nameOf(App.state.peek(), m.record)} to its design` });
}

// ---- Parts from shapes: a free shape on the page as a part of a design over box b ----
function partFrom(r, q, b, text = r.text) {
  const { id, shape, view: _, x, y, w, h, kept, ends, points, part, rest, format, text: t, named, ...more } = r;
  const at = (px, py) => [share((px - b.x) / b.w), share((py - b.y) / b.h)], [px, py] = at(q.x, q.y);
  // (A look it took from the box while it stood on the page, left as it was, is the box's still.)
  const look = { ...format };
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
// The words of a shape, where they read as a field of the box's record, kept as that field's token: "Fund III" is {Name}.
function tokened(text, record) {
  if (!text || /^\s*=/.test(text)) return text;
  const st = App.state.peek(), read = Scene.reader(st, App.notes.peek(), App.computed.peek(), App.day.peek()), { entries } = Tree.index(st), seen = new Map();
  for (let todo = [record], i = 0; i < todo.length; i++) for (const e of entries.get(todo[i]) ?? []) { const w = read(record, st[e].edge).text; if (w && !seen.has(w)) seen.set(w, st[e].edge); todo.push(e); }
  let out = text;
  for (const [w, edge] of [...seen].sort((a, b) => b[0].length - a[0].length)) if (out.includes(w)) out = out.split(w).join(`{${edge}}`);
  return out;
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
  const N = App.notes.peek(), same = was ? N.notes('Design').filter(n => Scene.wholeDesign(n.value) && n.value.id === was) : [];
  for (const n of same) { const { over } = n.value; tx.note('Design', n.pattern, { ...d, ...(over && { over }) }, { view: n.view, ...(n.param && { param: n.param }) }); }
  for (const p of patterns) if (!same.some(n => n.view === v && Tree.key(n.pattern) === Tree.key(p))) { const { over } = N.notes('Design').find(n => n.view === v && Tree.key(n.pattern) === Tree.key(p))?.value ?? {}; tx.note('Design', p, { ...d, ...(over && { over }) }, { view: v }); }
  const list = inChart(), at = list.findIndex(x => x.id === was || x.id === d.id);
  tx.note('Designs', LIBRARY, { list: at < 0 ? [...list, d] : list.map((x, i) => i === at ? d : x) });
}
// ---- Make a design: a box and the free shapes drawn over it ----
function makeable(ms) { const boxes = ms.filter(m => m.type === 'box'), free = ms.filter(m => m.type === 'shape' && !m.role && m.geometry !== 'legend'); return boxes.length === 1 && free.length && boxes.length + free.length === ms.length ? { box: boxes[0], free: free.flatMap(m => m.geometry === 'group' ? m.members.map(id => canvas().scene().byId.get(id)).filter(Boolean) : [m]) } : null; }
function make(ms = canvas().selected()) {
  const it = makeable(ms);
  if (!it) return Shell.toast('Select a box and the shapes drawn over it first', { ms: 3000 });
  if (App.readOnly.peek()) return Shell.toast(App.whyNot());
  const { box, free } = it, sc = canvas().scene(), N = App.notes.peek(), groups = Canvas.groupsAt(sc, box).filter(g => g.marks.size > 1), rows = App.shown.peek();
  const fors = [{ key: 'own', label: `Just ${N.nameOf(App.state.peek(), box.record)}`, s: null }, ...groups.map((g, i) => ({ key: `g${i}`, label: FormatBar.allOf(g, g.marks.size), s: g }))];
  let name = '', chosen = fors[1]?.key ?? 'own';
  Shell.dialog({ title: 'Make a design', width: 380, actions: [{ label: 'Cancel', value: false }, { label: 'Make', value: true, primary: true }],
    body: () => html`<div class="settings">
      <label class="field"><span>Name</span><input aria-label="Name" placeholder="New design" spellcheck="false" autocomplete="off" autofocus onInput=${e => { name = e.target.value; }} /></label>
      <label class="field"><span>For</span><select aria-label="For" onChange=${e => { chosen = e.target.value; }}>${fors.map(f => html`<option value=${f.key} selected=${f.key === chosen}>${f.label}</option>`)}</select></label>
    </div>` }).then(ok => {
    if (!ok) return;
    const s = fors.find(f => f.key === chosen)?.s, v = sc.view, patterns = patternsAt(box, s), d = {
      id: Log.newId(), name: Tree.clean(name) || 'New design', w: round(box.w), h: round(box.h), base: { Shape: box.shape, ...(box.shape === 'rounded' && { Corner: box.settings.Corner.value }) },
      parts: free.map(q => { const r = rows.item(App.chart.peek(), q.id)[0], size = q.texts?.[0]?.look.Size; return partFrom({ ...r, part: null, format: { ...(size && r.format?.Size === undefined && { Size: +(size * sc.page.scale).toFixed(2) }), ...r.format } }, q, box, tokened(r.text, box.record)); }),
    };
    const said = `Made the design ${d.name} for ${whom(box, s, s?.marks?.size)}`;
    App.change(tx => { for (const q of free) tx.remove(q.id); for (const g of sc.marks) if (g.geometry === 'group' && g.members.every(id => free.some(q => q.id === id))) tx.remove(g.id); rewrite(tx, d, null, patterns, v); tx.says(said); }, { dated: false, say: said });
    Shell.select([box.id]);
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
  const sc = c.scene(), v = sc.view, N = App.notes.peek(), pen = given || !m.design ? FormatBar.scope(true) : null, patterns = m.design && !given ? [m.design.note.pattern] : patternsAt(m, pen);
  // (Editing what's there, the design and not what's said over it; or one from the gallery; or, for a box with none, its fields in one part to begin from.)
  const { over: _, ...there } = m.design?.note.value ?? {};
  const d = given ?? (m.design ? there : { id: Log.newId(), name: 'New design', w: round(m.w), h: round(m.h), base: { Shape: m.shape }, parts: [{ id: Log.newId(), rest: true, geometry: 'text', x: 0, y: 0, w: 1, h: 1, format: { Align: 'center', Valign: 'middle' } }] });
  const n = m.design && !given ? sc.marks.filter(b => b.type === 'box' && b.design?.note.note === m.design.note.note).length : pen?.marks?.size;
  const said = m.design && !given && !Tree.idsIn(patterns[0]).size ? { outputs: patterns, caption: Scene.captionOf(N, patterns[0], v) } : pen?.outputs?.length ? pen : null;
  const names = (d.parts ?? []).flatMap(p => Scene.tokensIn(p.text));
  const where = c.whereNow(), rows0 = new Set(App.shown.peek().rows(App.chart.peek()).filter(r => 'shape' in r && r.view === v).map(r => r.shape)), own = new Map(ownLooks(App.shown.peek().rows(App.chart.peek()), v, m.record).map(r => [r.label, JSON.stringify(r.value)]));
  // (As large as it stands, or one from the gallery as large as it would, with these words; each part where it falls in that, and the box held so, whatever its rank's height.)
  const like = given ? Scene.instance(sc, m.id, d, N, App.computed.peek()) : m, W = round(like.w), H = round(like.h), o = sc.page.placed ? sc.page.offset : { x: 0, y: 0 }, dx = m.x - like.x, dy = m.y - like.y, stands = new Map();
  App.sandbox(takes(m.record));
  const stood = App.change(tx => {
    tx.note('Design', treeOf(m.record), { id: d.id, name: d.name, w: W, h: H, base: d.base ?? {}, strip: true, editing: true, begun: new Date().toISOString(), names }, { view: v });
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
  Shell.select([]);
  c.bringTo({ x: m.x - m.w * 0.5, y: m.y - m.h * 0.5, w: m.w * 2, h: m.h * 2 });
  const bar = c.root.querySelector('.dc-over').appendChild(document.createElement('div'));
  bar.className = 'dc-designbar';
  bar.setAttribute('role', 'toolbar');
  const words = bar.appendChild(document.createElement('span')), discard = bar.appendChild(Object.assign(document.createElement('button'), { className: 'btn', type: 'button', textContent: 'Discard' })), done = bar.appendChild(Object.assign(document.createElement('button'), { className: 'btn primary', type: 'button', textContent: 'Done' }));
  // (A design of this chart's given at other patterns too moves there as well, and it's said.)
  const also = m.design && !given && !Shapes.DESIGNS.some(x => x.id === d.id) ? sc.marks.filter(b => b.type === 'box' && b.design?.value.id === d.id && b.design.note.note !== m.design.note.note).length : 0, who = `${whom(m, said, n)}${also ? ` and ${also} more` : ''}`;
  words.textContent = `Editing the design of ${who}`;
  discard.onclick = () => leave(false);
  done.onclick = () => leave(true);
  editing.value = { box, record: m.record, d, wasId: given || Shapes.DESIGNS.some(x => x.id === d.id) ? null : d.id, patterns, view: v, rows0, where, bar, whom: who, stands, W, H, own };
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
    const resized = Math.abs(b.w - e.W) > 0.5 || Math.abs(b.h - e.H) > 0.5;
    // (In the order they're drawn in; a group's own row isn't a part, its shapes are. One no hand has moved keeps the share it had, and the box no hand has sized the size the design said.)
    for (const q of sc.marks) { const r = mine.get(q.id); if (r && q.geometry !== 'group') { const was = !resized && r.part && same(e.stands.get(r.part), r) && e.d.parts?.find(p => p.id === r.part), part = partFrom(r, q, b); parts.push(was ? { ...part, x: was.x, y: was.y, w: was.w, h: was.h, ...(was.points && { points: was.points }) } : part); } }
    // (What's given the box itself since it began: what it had of its own before stays its own.)
    looks = Object.fromEntries(ownLooks(rows, e.view, e.record).filter(r => e.own.get(r.label) !== JSON.stringify(r.value)).map(r => [r.label, r.value]));
    const { Shape, Corner, ...others } = looks;
    looks = others;
    d = { ...e.d, ...(resized || e.d.w == null ? { w: round(b.w), h: round(b.h) } : {}), base: { ...e.d.base, ...(Shape && { Shape }), ...(Corner !== undefined && { Corner }) }, parts };
    delete d.editing; delete d.strip; delete d.names; delete d.over;
    if (!e.wasId) d.id = Log.newId();
    // (As it was, it's nothing to write.)
    const plain = v => JSON.stringify(v, (k, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([p], [q]) => p < q ? -1 : 1)) : x);
    if (e.wasId && plain({ ...d, id: 0 }) === plain({ ...e.d, id: 0 }) && !Object.keys(looks).length) keep = null;
  }
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
  App.change(tx => { rewrite(tx, d, e.wasId, e.patterns, e.view); for (const [l, v] of Object.entries(looks)) for (const p of e.patterns) tx.note(l, p, v, { view: e.view }); tx.says(said); },
    { dated: false, say: said, empty: () => Shell.toast('The design is as it was', { ms: 2500 }) });
}
// A row dropped on what's being edited: on a part, its token; on the box, a new text part, where it was dropped.
function dropped(q, edge, at) {
  const e = editing.peek();
  if (!e) return null;
  const token = `{${edge}}`, row = App.shown.peek().item(App.chart.peek(), q.id)[0];
  if (q.type === 'shape' && row && !row.rest) return App.change(tx => tx.update(q.id, { text: row.text ? `${row.text}\n${token}` : token }), { dated: false, say: `Put ${edge} in the part` });
  const b = canvas().scene().byId.get(e.box), w = Math.round(b.w * 0.8), h = Math.round(b.h * 0.3);
  return App.change(tx => tx.add('shape', { view: e.view, geometry: 'text', part: Log.newId(), x: round(Math.min(at?.x ?? b.x, b.x + b.w - w)), y: round(Math.min(at?.y ?? b.y, b.y + b.h - h)), w, h, text: token, format: { Align: 'center', Valign: 'middle' } }), { dated: false, say: `Put ${edge} in the design` });
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
    const named = was?.name ?? (Tree.clean(name) || 'House designs'), look = was ? { ...was.look, designs: [...(was.look.designs ?? []).filter(x => x.id !== plain.id), plain] } : { notes: [], order: [], furniture: {}, designs: [plain] };
    await Store.keepHouseStyle({ id: was?.id ?? Log.newId(), name: named, look });
    Shell.parts.peek().formatbar?.relist?.();
    Shell.toast(`Saved ${d.name} to the house style ${named}`);
  });
}

// ---- What a box's right-click offers ----
function items(ms, ro) {
  if (editing.peek()) return [];
  const can = makeable(ms), one = ms.length === 1 && ms[0].type === 'box' ? ms[0] : null, overs = !!one?.design?.overs.length;
  // (Where there's more than editing it, one row, so the box's menu fits the window it opens in.)
  const rows = one ? [{ label: 'Edit design', disabled: ro, run: () => edit(one) }, ...(overs ? [{ label: 'Reset to design', disabled: ro, run: () => reset(one) }] : []), ...(one.design ? [{ label: 'Save to house style…', run: () => saveToHouse(one.design.value) }] : [])] : [];
  return [...(can ? [{ label: 'Make a design…', disabled: ro, run: () => make(ms) }] : []), ...(rows.length > 1 ? [{ label: 'Design', items: rows }] : rows)];
}
// A row of Styles or the Key double-clicked, by its outputs: the design of the first box it reaches.
function editRow(g) {
  const sc = canvas()?.scene(), m = sc && sc.marks.find(b => b.type === 'box' && b.settings.Design?.value && g.outputs.some(p => b.design && Tree.key(p) === Tree.key(b.design.note.pattern)));
  if (m) edit(m);
}

const onChart = () => (canvas()?.root.clientWidth ?? 0) > 0 && !!canvas().scene();
const whyNot = () => App.readOnly.peek() ? App.whyNot() : !onChart() ? 'Show a chart first' : 'Select a box first';
const pick = () => { const m = canvas()?.selected().find(x => x.type === 'box'); return onChart() && !App.readOnly.peek() ? m ?? null : null; };
for (const [id, name, names, run, enabled, why] of [
  ['design.make', 'Make a design…', ['Component', 'Group', 'Make a component', 'Create component', 'Template', 'New design'], () => make(), () => onChart() && !App.readOnly.peek() && !!makeable(canvas().selected()), () => App.readOnly.peek() ? App.whyNot() : 'Select a box and the shapes drawn over it first'],
  ['design.edit', 'Edit design', ['Edit component', 'Master', 'Change the design'], () => edit(pick()), () => !!pick() && !editing.peek(), whyNot],
  ['design.reset', 'Reset to design', ['Reset overrides', 'Detach', 'Reset instance', 'Take the overrides off'], () => reset(pick()), () => !!pick()?.design?.overs.length, () => App.readOnly.peek() ? App.whyNot() : 'Select a box with what’s said over its design first'],
  ['design.house', 'Save design to house style…', ['Publish', 'Library', 'House style'], () => saveToHouse(pick()?.design?.value), () => !!pick()?.design, whyNot],
  ['design.done', 'Done with the design', ['Finish editing the design', 'Close design'], () => leave(true), () => !!editing.peek(), () => 'No design is being edited'],
  ['design.discard', 'Discard the changes to the design', ['Cancel the design'], () => leave(false), () => !!editing.peek(), () => 'No design is being edited'],
]) Shell.register('action', { id, name, names, run, enabled, why });

return { open, say, atPen, tokenIn, reset, edit, make, items, dropped, editRow, editing, leave, forRecord };
})();
