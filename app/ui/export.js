// Exports (dendra.md, Views): a view as a PowerPoint slide or a PDF page, every view as a deck or a document
// in tab order, and the chart's dates as a calendar for Outlook. The scene is all either draws.
// - Each page is drawn on its sheet, a 13.33 × 7.5 in slide unless its Page says otherwise, or the paper the
//   Export dialog names (Letter, say), for which the scene is drawn (Scene.of's paper), smaller by the page's
//   scale, and every size with it: a text's points are the points it has on the sheet, as typed where a note gives it.
// - PowerPoint: a box is a shape of the same preset geometry, holding its texts in the same fonts on the
//   scene's lines; a line is a connector glued to its boxes, named as the two-box panel says its relation, solid
//   where another crosses it, as PowerPoint draws a crossing (the canvas and the PDF hop), and its label is grouped
//   with the box at its owned end, so moving that box takes the label with it and the connector follows; lines said as
//   one, a line to a frame or a trunk's lines under one label, one group with their label, named for them all, a frame's by
//   its caption (each of the Funds); a frame its outline and caption, grouped, behind its members; the legend one group, a
//   swatch and caption for each row, named for it; a group in the chart a group; the title the slide's title; free shapes
//   shapes like any other. A line's alt text is its name with the
//   values its label says, as the formula bar says a fact (with a percentage of 50%). A deck's slides share one
//   size, the smallest that holds every sheet, each in the middle of its slide. Its theme's font is the page's own
//   (All text), its footer and number the master's, each slide's placeholders taking their place and look from there.
// - PDF: the scene as SVG, through svg2pdf.js, compressed, in US English. Each page is its sheet, bookmarked by its
//   title. Its text is in the faces the canvas draws it in, this computer's, embedded with only the letters used;
//   or, where a face has a standard font's widths (Helvetica Arial's, Times Times New Roman's) or can't be read
//   or embedded, in the standard font of its class (see fontsOf). It declares only the fonts it uses.
// - Each slide and page reads its title first, then its date, then the rest in the scene's order: a screen
//   reader, PowerPoint's Reading Order and a PDF's text all follow what's written first.
// - A file of one page is titled as its page is, of more by the chart's name; its author is whoever exported
//   it, blank where no name is set.
// - The calendar: what falls due, each date a formula gives, on its day, what's before the day shown overdue, as
//   it's still due; each said as the Dates table says it, what falls due, then whose (Time.whose), and why it
//   falls then in the formula bar's sentence (FormulaBar.sentence), where the bar says one.
// - The Export dialog, which the title bar's Export opens, previews the file: the same SVG, page by page, on
//   the slides or pages it will have, a click on a page showing it at full size; for a calendar, its dates.
// What the canvas shows only on screen (computed italics and dashes, the redline) is no part of the scene.
// PptxGenJS, jsPDF and svg2pdf.js load the first time they're needed.
//
// Export.write('pptx' | 'pdf', scenes, name, { author, R, N }?) → a Blob, also saved, R being
// Formulas.computeState's and N the chart's Notes reader, by which a deck says its lines' relations;
// Export.svg(scene, { pdf, frame }) → SVG markup; in the window, where Time is, Export.calendar(R, N, chart,
// name, from?) → the .ics Blob of what falls due, overdue before `from` (today), also saved. Export.onFile, if
// set, takes each finished file (blob, name) instead of the browser downloading it. In the window,
// Export.open(format?) opens the dialog: 'pptx', 'pdf' or 'ics', or what the view shown offers (Shell's 'export'
// parts: a table's CSV), and → the file once it's written; Export.setup(view?) opens Page setup, and Export.fit(view?) is
// Fit to page.
const Export = (() => {
const PT = Scene.PT;                                    // pixels a point
const n = v => +v.toFixed(2);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const look = m => m.look ?? Object.fromEntries(Object.entries(m.settings).map(([k, v]) => [k, v.value]));
const none = c => !c || c === 'none';
const hex = c => (c.length === 4 ? c.replace(/\w/g, d => d + d) : c).slice(1).toUpperCase();

// ---- Libraries, loaded on first use ----
const VENDOR = new URL('../../vendor/', document.currentScript.src);
const scripts = new Map();
const script = f => scripts.get(f) ?? scripts.set(f, new Promise((ok, fail) => document.head.append(Object.assign(
  document.createElement('script'), { src: new URL(f, VENDOR).href, onload: ok, onerror: () => { scripts.delete(f); fail(new Error(`Couldn’t load ${f}`)); } })))).get(f);
const LIBS = { pptx: () => script('pptxgenjs/pptxgen.bundle.js'), pdf: () => script('jspdf/jspdf.umd.min.js').then(() => script('svg2pdf/svg2pdf.umd.min.js')) };

// Saved where the browser saves downloads, and said so by its name, as every other act of the window says what it did.
function save(blob, name, also = '', stays = false) {
  if (api.onFile) return api.onFile(blob, name, also);
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  if (typeof Shell !== 'undefined') Shell.toast(`Downloaded ${name}${also}`, stays ? { ms: 30000 } : {});
}

// ---- Text, as the scene sets it ----

// A text's block within its mark: its first line's top and its last line's foot, from the scene's baselines.
const lh = t => Scene.lineHeight(t);
const top = it => it.lines[0].y - Scene.baseline(it.look);
const block = items => ({ top: top(items[0]), bottom: top(items[0]) + items.reduce((h, it) => it.inline ? h : h + it.lines.length * lh(it.look), 0) });
// How much of a line lies before its x, by its alignment.
const BEFORE = { left: 0, center: 0.5, right: 1 };

// ---- Reading order ----

// A page's marks as it's read: its title, its date, then the rest as the scene draws them. Nothing overlaps
// the title or the date, so where they stand in the drawing's order doesn't show.
const reading = marks => { const first = ['title', 'date'].flatMap(role => marks.filter(m => m.role === role)), under = marks.filter(m => !first.includes(m) && (m.settings?.Layer?.value ?? m.look?.Layer ?? 0) < 0);
  return [...under, ...first, ...marks.filter(m => !first.includes(m) && !under.includes(m))]; };

// ---- SVG: the PDF, and the preview ----

const ANCHOR = { left: 'start', center: 'middle', right: 'end' };
// The PDF's standard font for a font: Helvetica for a sans serif, Times for a serif, Courier for a monospace (see
// Scene's FONTS), in the weight and slant asked; and how wide it sets a line at a size, by jsPDF's own metrics.
const STANDARD = f => ({ sans: 'helvetica', serif: 'times', mono: 'courier' })[Scene.fontClass(f)];
const styleOf = t => t.Bold && t.Italic ? 'bolditalic' : t.Bold ? 'bold' : t.Italic ? 'italic' : 'normal';
let metrics = null;
function standardWidth(t, text, size) {
  if (!window.jspdf) return 0;
  metrics ??= new window.jspdf.jsPDF({ unit: 'pt' });
  metrics.setFont(STANDARD(t.Font), styleOf(t));
  return metrics.getStringUnitWidth(text) * size;
}

// ---- A PDF's fonts ----
// A PDF's text is in the face the canvas draws it in, where this computer has it and lets it be read (the browser's
// Local Font Access, which asks once): the first font of its stack installed (Scene's FONTS), in the face of its
// style CSS would take (where it has none, the nearest by slant, then weight), embedded with only the letters used,
// Arial as much as any, so a viewer or a print shop sets what was laid out.
// One this computer hasn't, or won't let be read, or that can't be embedded (PostScript outlines, which jsPDF can't, or a
// face its maker restricts) is in the standard font of its class, which every reader has, and it's said.
const METRIC = new Set(['arial', 'helvetica', 'liberation sans', 'arimo', 'times new roman', 'times', 'liberation serif', 'tinos', 'courier new', 'courier', 'liberation mono', 'cousine']);
const GENERIC = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui']);
const stackOf = f => Scene.fontFamily(f).split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(s => !GENERIC.has(s.toLowerCase()));
// The fonts the PDF's standard ones are for, and how they set a line: the standard font, its widths jsPDF's.
const PLAIN = { family: t => STANDARD(t.Font), width: standardWidth, missed: [], unread: false };
// Whether this computer may let its fonts be read: where it has, or hasn't yet been asked.
async function mayRead() {
  if (typeof window.queryLocalFonts !== 'function') return false;
  try { return (await navigator.permissions.query({ name: 'local-fonts' })).state !== 'denied'; } catch { return true; }
}
// This computer's fonts, by family in lower case, each its faces as the browser lists them; null where it won't say.
async function installed() {
  if (typeof window.queryLocalFonts !== 'function') return null;
  try {
    const by = new Map();
    for (const f of await window.queryLocalFonts()) { const k = f.family.toLowerCase(); (by.get(k) ?? by.set(k, []).get(k)).push(f); }
    return by;
  } catch { return null; }
}
// The face of a family a style takes, as CSS takes one: its slant first, then its weight; of those, the plainest
// (Bold before Semibold Condensed).
function faceOf(faces, style) {
  const it = style.includes('italic'), bold = style.includes('bold'), odd = /light|thin|medium|semi|demi|black|heavy|extra|ultra|condensed|narrow|compressed/i;
  const rank = f => (/italic|oblique/i.test(f.style) !== it ? 4 : 0) + (/\bbold\b/i.test(f.style) !== bold ? 2 : 0) + (odd.test(f.style) ? 1 : 0);
  return faces.reduce((a, f) => rank(f) < rank(a) ? f : a);
}
// A font file's tables, from its table directory at `at`: by tag, where each is and how long.
function tablesOf(b, at) {
  const out = new Map();
  for (let i = 0, r = at + 12; i < b.getUint16(at + 4); i++, r += 16)
    out.set(String.fromCharCode(...[0, 1, 2, 3].map(k => b.getUint8(r + k))), { sum: b.getUint32(r + 4), offset: b.getUint32(r + 8), length: b.getUint32(r + 12) });
  return out;
}
// A face's PostScript name, as its name table says it (name 6): Windows's and Unicode's in UTF-16, the Mac's in Roman.
function psName(b, at) {
  const t = tablesOf(b, at).get('name');
  if (!t) return null;
  const strings = t.offset + b.getUint16(t.offset + 4);
  for (let i = 0, r = t.offset + 6; i < b.getUint16(t.offset + 2); i++, r += 12) {
    if (b.getUint16(r + 6) !== 6) continue;
    const wide = b.getUint16(r) !== 1, o = strings + b.getUint16(r + 10), len = b.getUint16(r + 8);
    return wide ? String.fromCharCode(...Array.from({ length: len / 2 }, (_, k) => b.getUint16(o + 2 * k))) : String.fromCharCode(...new Uint8Array(b.buffer, o, len));
  }
  return null;
}
// A face's font, as a TrueType file of its own (taken out of a collection, a .ttc, where it's in one), as jsPDF reads
// one: a string of its bytes. Null where its outlines are PostScript's, or its maker restricts embedding it (its OS/2
// table's fsType).
async function fontFile(face) {
  const b = new DataView(await (await face.blob()).arrayBuffer());
  const tag = o => String.fromCharCode(...[0, 1, 2, 3].map(k => b.getUint8(o + k)));
  const at = tag(0) !== 'ttcf' ? 0 : Array.from({ length: b.getUint32(8) }, (_, i) => b.getUint32(12 + 4 * i)).find(o => psName(b, o) === face.postscriptName);
  if (at === undefined || (b.getUint32(at) !== 0x00010000 && tag(at) !== 'true')) return null;
  const tables = [...tablesOf(b, at)], os2 = tables.find(([k]) => k === 'OS/2')?.[1];
  if (os2 && (b.getUint16(os2.offset + 8) & 0x0f) === 2) return null;
  // Its header, its tables' records, then its tables, each on four bytes.
  let size = 12 + 16 * tables.length;
  const placed = tables.map(([, t]) => { const o = size; size += (t.length + 3) & ~3; return o; });
  const out = new Uint8Array(size), d = new DataView(out.buffer), src = new Uint8Array(b.buffer), p = 2 ** Math.floor(Math.log2(tables.length));
  d.setUint32(0, 0x00010000); d.setUint16(4, tables.length); d.setUint16(6, p * 16); d.setUint16(8, Math.log2(p)); d.setUint16(10, (tables.length - p) * 16);
  tables.forEach(([k, t], i) => {
    const r = 12 + 16 * i;
    [...k].forEach((c, j) => d.setUint8(r + j, c.charCodeAt(0)));
    d.setUint32(r + 4, t.sum); d.setUint32(r + 8, placed[i]); d.setUint32(r + 12, t.length);
    out.set(src.subarray(t.offset, t.offset + t.length), placed[i]);
  });
  let s = '';
  for (let i = 0; i < out.length; i += 0x8000) s += String.fromCharCode(...out.subarray(i, i + 0x8000));
  return s;
}
// What the texts of `scenes` are set in, looked up in this computer's fonts (`local`, as installed() gives them):
// { family(t), width(t, text, size), add(doc), missed, unread }: the font family a PDF names a text's font by, its face
// first; how wide the face sets a line; each face given to a jsPDF document; the fonts set in a standard font, none of
// them one with a standard font's widths, each { font, why }: `read` where the browser wouldn't let its fonts be read
// (`local` null or empty), `absent` where this computer hasn't it, `embed` where it can't be embedded; and whether they weren't read.
async function fontsOf(scenes, local) {
  const looks = new Map();
  for (const s of scenes) for (const m of s.marks)
    for (const it of [...(m.texts ?? []), ...(m.caption ? [m.caption] : []), ...(m.rows ?? []).map(r => r.caption)]) { looks.set(`${it.look.Font}|${styleOf(it.look)}`, it.look); for (const l of it.lines ?? []) for (const sp of l.spans ?? []) looks.set(`${sp.look.Font}|${styleOf(sp.look)}`, sp.look); }
  const faces = new Map(), files = new Map(), missed = new Map(), unread = !local?.size;
  for (const [k, t] of looks) {
    const stack = stackOf(t.Font), family = unread ? stack[0] : stack.find(f => local.has(f.toLowerCase()));
    // (What this computer hasn't, of a family with a standard font's widths, is that font, as near as a face can be, and said only where it wasn't asked.)
    if (!unread && !family && METRIC.has(stack[0].toLowerCase())) continue;
    if (!family) { missed.set(t.Font, 'absent'); continue; }
    const face = !unread && faceOf(local.get(family.toLowerCase()), styleOf(t));
    if (face && !files.has(face.postscriptName)) files.set(face.postscriptName, await fontFile(face).catch(() => null));
    if (face && files.get(face.postscriptName)) faces.set(k, { family, ps: face.postscriptName });
    else missed.set(t.Font, unread ? 'read' : 'embed');
  }
  // Each named in the file, as a reader lists it, by its face's PostScript name, tagged as a subset is (DENDRA+Garamond-Italic).
  const add = doc => [...faces].forEach(([k, f], i) => {
    const style = k.split('|')[1];
    if (!doc.existsFileInVFS(f.ps)) doc.addFileToVFS(f.ps, files.get(f.ps));
    doc.addFont(f.ps, f.family, style);
    doc.internal.getFont(f.family, style).fontName = `DENDR${String.fromCharCode(65 + i % 26)}+${f.ps}`;
  });
  if (faces.size && window.jspdf) { metrics ??= new window.jspdf.jsPDF({ unit: 'pt' }); add(metrics); }
  const faceFor = t => faces.get(`${t.Font}|${styleOf(t)}`);
  return {
    family: t => { const f = faceFor(t); return f ? `'${f.family}', ${STANDARD(t.Font)}` : STANDARD(t.Font); },
    width: (t, text, size) => { const f = faceFor(t); if (!f) return standardWidth(t, text, size); metrics.setFont(f.family, styleOf(t)); return metrics.getStringUnitWidth(text) * size; },
    add, missed: [...missed].map(([font, why]) => ({ font, why })),
  };
}
// A PDF's preview, before this computer's fonts are read: each in the face the canvas draws it in, where they may be.
const ASKED = { family: t => Scene.fontFamily(t.Font), width: () => 0, missed: [] };
// What's said of fonts a PDF couldn't use, each by its name, as what's printed in its place, and what to do.
const AS_STANDARD = { helvetica: 'Helvetica', times: 'Times', courier: 'Courier' }, listed = xs => xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`;
const FONT_WHY = { read: 'this browser hasn’t let it read your fonts: allow fonts for this page in the address bar, then export again',
  absent: 'it isn’t on this computer: install it, or choose a font this computer has', embed: 'it can’t be embedded in a PDF: choose another font, or export to PowerPoint, which names it' };
const fontsSaid = missed => Object.entries(Object.groupBy(missed, m => m.why)).map(([why, ms]) => `${listed(ms.map(m => `${m.font} printed as ${AS_STANDARD[STANDARD(m.font)]}`))}: ${FONT_WHY[why]}`).join('. ');
const stroke = (s, w = s.Weight) => none(s.Outline) ? 'stroke="none"'
  : `stroke="${s.Outline}" stroke-width="${n(w * PT)}"${Scene.dash(s.Dash, w) ? ` stroke-dasharray="${Scene.dash(s.Dash, w)}"` : ''}${s.Dash === 'dotted' || s.Points?.round ? ' stroke-linecap="round"' : ''}${s['Line Transparency'] > 0 ? ` stroke-opacity="${n(1 - s['Line Transparency'] / 100)}"` : ''}`;
// What's being drawn for a PDF: its bodies made pictures, by page and mark; none, for the preview.
let picturesNow = null, viewNow = null;
const g = (x, y, inner) => `<g transform="translate(${n(x)} ${n(y)})">${inner}</g>`;
// A body as the canvas draws it: its shape and corners, its fill as transparent as its Transparency, its outline;
// and under it its Shadow, which a PDF can't blur, so it's drawn in layers, each a little smaller and as faint: 3 pt
// below and right, 4 pt soft at its edge, 40% black at its heart, as PowerPoint's is, at the sheet's size (`at`, the
// page's scale, as the scene drawn sets it).
let at = 1, gradients = 0;
// What a PDF can't draw as it's drawn on screen (a soft glow, a picture's fill by its shape, a line's gaps): the body made a picture at three times its size, from the same drawing (see drawnAsPicture); the words stay words.
const pictured = s => !!s.Picture?.src || Shapes.hasEffect(s) || !!s.Reflection || (s.Compound && s.Compound !== 'single') || !!s['Line Gradient']?.stops?.length;
let picturesDrawn = new Map();
const BLEED = 90;
// The body's whole drawing, with every effect, in its own pixels: for the preview, and what the PDF makes a picture of.
function fullBody(shape, w, h, s, flip = null) {
  const d = Scene.outlineOf(shape, w, h, s), id = `fx-${++gradients}`, W = s.Weight * PT, mirror = flip ? ` transform="translate(${flip.h ? n(w) : 0} ${flip.v ? n(h) : 0}) scale(${flip.h ? -1 : 1} ${flip.v ? -1 : 1})"` : '', defs = [], clear = Math.min(100, Math.max(0, s.Transparency ?? 0));
  let fill = none(s.Fill) ? 'none' : s.Fill;
  if (s.Picture?.src) { defs.push(Shapes.pictureDef(`${id}p`, s.Picture, w, h, fill)); fill = `url(#${id}p)`; }
  else if (s.Gradient?.stops?.length) { defs.push(Shapes.gradientDef(`${id}g`, s.Gradient)); fill = `url(#${id}g)`; }
  else if (s.Pattern?.prst) { defs.push(Shapes.patternDef(`${id}h`, s.Pattern, fill)); fill = `url(#${id}h)`; }
  let line = none(s.Outline) && !s['Line Gradient'] ? 'none' : s.Outline;
  if (s['Line Gradient']?.stops?.length) { defs.push(Shapes.gradientDef(`${id}l`, s['Line Gradient'])); line = `url(#${id}l)`; }
  const strokeAttrs = line === 'none' ? 'stroke="none"' : `stroke="${line}" stroke-width="${n(W)}"${Scene.dash(s.Dash, s.Weight) ? ` stroke-dasharray="${Scene.dash(s.Dash, s.Weight)}"` : ''}${s['Line Transparency'] > 0 ? ` stroke-opacity="${n(1 - s['Line Transparency'] / 100)}"` : ''}${s.Points?.round ? ' stroke-linejoin="round" stroke-linecap="round"' : ' stroke-linejoin="miter"'}`;
  const compound = s.Compound && s.Compound !== 'single' && line !== 'none';
  const fx = Shapes.hasEffect(s) || Scene.shadowOf(s.Shadow); if (fx) defs.push(Shapes.effectDef(`${id}f`, s, PT / at));
  if (compound) defs.push(Shapes.compoundDef(`${id}c`, s.Compound, W));
  const r = s.Reflection; if (r) defs.push(Shapes.reflectionMask(`${id}r`, r));
  const fillOp = clear && fill !== 'none' ? ` fill-opacity="${n(1 - clear / 100)}"` : '';
  const main = `<path d="${d}"${mirror} fill="${fill}"${fillOp} ${compound ? 'stroke="none"' : strokeAttrs}${fx ? ` filter="url(#${id}f)"` : ''}/>`;
  const ring = compound ? `<path d="${d}"${mirror} fill="none" ${strokeAttrs} filter="url(#${id}c)"/>` : '';
  const back = r ? `<path d="${d}" fill="${fill}" ${strokeAttrs} transform="translate(0 ${n(2 * h + (r.distance ?? 0) * PT / at)}) scale(1 -1)" mask="url(#${id}r)"/>` : '';
  return `<defs>${defs.join('')}</defs>${back}${main}${ring}`;
}
// Each mark of `scenes` whose body the PDF takes as a picture, made so: an image of its whole drawing, a little beyond its frame for what spreads past it.
async function drawnAsPicture(scenes) {
  picturesDrawn = new Map();
  for (const sc of scenes) {
    at = sc.page.scale ?? 1;
    for (const m of sc.marks) {
      if (!['box', 'shape'].includes(m.type) || ['line', 'picture', 'group', 'legend', 'table'].includes(m.geometry)) continue;
      const s = look(m);
      if (!pictured(s)) continue;
      const shape = m.type === 'box' ? m.shape : m.geometry === 'text' || m.geometry === 'frame' ? 'rect' : m.geometry, pad = BLEED / at, tall = s.Reflection ? m.h + BLEED / at : 0, W = m.w + 2 * pad, H = m.h + pad * 2 + tall, k = Math.min(3, 2400 / Math.max(W, H));
      const src = `<svg xmlns="http://www.w3.org/2000/svg" width="${n(W * k)}" height="${n(H * k)}" viewBox="${n(-pad)} ${n(-pad)} ${n(W)} ${n(H)}">${fullBody(shape, m.w, m.h, s, m.flip)}</svg>`;
      const url = await new Promise(res => { const img = new Image(); img.onload = () => { const c = Object.assign(document.createElement('canvas'), { width: Math.round(W * k), height: Math.round(H * k) }); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); res(c.toDataURL('image/png')); }; img.onerror = () => res(null); img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(src)}`; });
      if (url) picturesDrawn.set(`${sc.view}|${m.id}`, `<image href="${url}" x="${n(-pad)}" y="${n(-pad)}" width="${n(W)}" height="${n(H)}" preserveAspectRatio="none"/>`);
    }
  }
}
function body(shape, w, h, s, flip = null, m = null) {
  // (In the PDF, as a picture where it can't be drawn; in the preview, as the screen draws it.)
  if (pictured(s) || (Shapes.hasEffect(s))) { const made = m && picturesNow?.get(`${viewNow}|${m.id}`); if (made) return made; if (!picturesNow) return fullBody(shape, w, h, s, flip); }
  const d = Scene.outlineOf(shape, w, h, s), clear = Math.min(100, Math.max(0, s.Transparency ?? 0)), o = Scene.shadowOf(s.Shadow);
  const mirror = flip ? ` transform="translate(${flip.h ? n(w) : 0} ${flip.v ? n(h) : 0}) scale(${flip.h ? -1 : 1} ${flip.v ? -1 : 1})"` : '';
  let shade = '', fill = none(s.Fill) ? 'none' : s.Fill, defs = '';
  // A gradient, drawn as the canvas draws it: from colour to colour along its angle.
  if (s.Gradient?.stops?.length) {
    const id = `grad-${++gradients}`;
    defs = `<defs>${Shapes.gradientDef(id, s.Gradient)}</defs>`;
    fill = `url(#${id})`;
  } else if (s.Pattern?.prst) {
    const id = `patt-${++gradients}`;
    defs = `<defs>${Shapes.patternDef(id, s.Pattern, fill)}</defs>`;
    fill = `url(#${id})`;
  }
  if (o) {
    const a = o.angle * Math.PI / 180, dx = o.distance * PT * Math.cos(a) / at, dy = o.distance * PT * Math.sin(a) / at, soft = o.blur * PT / at, each = n((1 - o.transparency / 100) / 4);
    shade = g(dx, dy, [1, 2 / 3, 1 / 3, 0].map(k => `<path d="${d}"${mirror} fill="${o.color}" fill-opacity="${each}"`
      + (k ? ` stroke="${o.color}" stroke-opacity="${each}" stroke-width="${n(soft * k)}" stroke-linejoin="round"` : '') + '/>').join(''));
  }
  return `${defs}${shade}<path d="${d}"${mirror} fill="${fill}"${clear && !none(s.Fill) ? ` fill-opacity="${n(1 - clear / 100)}"` : ''} ${stroke(s)} stroke-linejoin="miter"/>`;
}
// Each line of the texts where the scene put it; an underline and a strikethrough as rules, which every reader draws
// alike. In a PDF (`pdf`, its fonts: see fontsOf), a line its font sets wider than the scene sets it is condensed to
// the scene's width, scaled across as jsPDF scales text, so no text ever leaves its box. A blank field's room is
// kept, empty: its name is the canvas's alone (dendra.md, Fields).
function texts(items, pdf) {
  return items.filter(it => !it.blank).map(it => {
    const t0 = it.look, wash = t0['Text Gradient']?.stops?.length ? t0['Text Gradient'] : null, rim = t0['Text Outline'];
    // (A PDF's text can't be painted a gradient: its first color, and its line round it, as the file's own. The preview draws the gradient.)
    const t = wash && pdf ? { ...t0, Color: wash.stops[0][1] } : t0, size = t.Size * PT, anchor = ANCHOR[t.Align] ?? 'middle', gid = wash && !pdf ? `tg-${++gradients}` : null;
    const font = `font-family="${esc(pdf ? pdf.family(t) : Scene.fontFamily(t.Font))}" font-size="${n(size)}" font-weight="${t.Bold ? 'bold' : 'normal'}" font-style="${t.Italic ? 'italic' : 'normal'}"${rim ? ` stroke="${rim.color ?? '#000000'}" stroke-width="${n((rim.weight ?? 0.75) * PT)}"` : ''}${it.turn && !pdf ? '' : ''}`;
    const rule = (l, y, h) => `<rect x="${n(l.x - l.w * { start: 0, middle: 0.5, end: 1 }[anchor])}" y="${n(y)}" width="${n(l.w)}" height="${n(h)}" fill="${t.Color}"/>`;
    const out = it.lines.map(l => {
      const mark = l.bullet ? `<text x="${n(l.bulletAt)}" y="${n(l.y)}" text-anchor="start" ${font} fill="${t.Color}">${esc(l.bullet)}</text>` : '';
      if (l.tabs) return mark + l.tabs.map(sp => `<text x="${n(l.x + sp.at)}" y="${n(l.y)}" text-anchor="start" ${font} fill="${gid ? `url(#${gid})` : t.Color}">${esc(sp.text)}</text>`).join('');
      // Part of it in another look: each span where the one before it ends, a superscript raised, as the canvas draws it.
      if (l.spans) {
        let x = l.x - l.w * { start: 0, middle: 0.5, end: 1 }[anchor];
        return mark + l.spans.map(sp => {
          const s = sp.look, z = s.Size * PT, w = Scene.measure(sp.text, s), lead = /^\s*/.exec(sp.text)[0], y = l.y - (sp.base ? Scene.BASE[sp.base] * size : 0), x0 = x + (lead ? Scene.measure(lead, s) : 0);
          const f = `font-family="${esc(pdf ? pdf.family(s) : Scene.fontFamily(s.Font))}" font-size="${n(z)}" font-weight="${s.Bold ? 'bold' : 'normal'}" font-style="${s.Italic ? 'italic' : 'normal'}"`;
          const r = (dy, h) => `<rect x="${n(x)}" y="${n(y + dy)}" width="${n(w)}" height="${n(h)}" fill="${s.Color}"/>`;
          const out = `<text x="${n(x0)}" y="${n(y)}" text-anchor="start" ${f} fill="${s.Color}">${esc(sp.text.trim())}</text>${s.Underline ? r(z * 0.106, z * 0.073) : ''}${s.Strike ? r(-z * 0.3, z * 0.073) : ''}`;
          x += w;
          return out;
        }).join('');
      }
      if (mark) return mark + `<text x="${n(l.x)}" y="${n(l.y)}" text-anchor="${anchor}" ${font} fill="${t.Color}">${esc(l.text)}</text>`;
      const wide = pdf ? pdf.width(t, l.text, size) : 0, k = l.w > 0 && wide > l.w + 0.01 ? l.w / wide : 1;
      return `<text x="${n(l.x)}" y="${n(l.y)}" text-anchor="${anchor}" ${font} fill="${gid ? `url(#${gid})` : t.Color}"${k < 1 ? ` transform="matrix(${+k.toFixed(4)} 0 0 1 ${n(l.x * (1 - k))} 0)"` : ''}>${esc(l.text)}</text>`
        + (t.Underline ? rule(l, l.y + size * 0.106, size * 0.073) : '') + (t.Strike ? rule(l, l.y - size * 0.3, size * 0.073) : '');
    }).join('');
    const drawn = (gid ? `<defs>${Shapes.gradientDef(gid, wash)}</defs>` : '') + out;
    return it.turn ? `<g transform="${it.turn}">${drawn}</g>` : drawn;
  }).join('');
}
// A route, in its runs where another line breaks it, with an arrowhead at an end as the canvas draws one (X6's
// block marker).
function route(points, s, runs = [points]) {
  const dOf = `${runs.map(r => `M${r.map(p => `${n(p[0])},${n(p[1])}`).join(' L')}`).join(' ')}`, grad = s['Line Gradient']?.stops?.length ? s['Line Gradient'] : null, w0 = s.Weight * PT;
  // A line's gradient, as a reader can stroke none: a short run of each color along it, the colors where the gradient has them. A compound's gaps, over it in white: a line has no inside to take them from.
  const along = () => { const xs = points.map(p => p[0]), ys = points.map(p => p[1]), a = (grad.angle ?? 0) * Math.PI / 180, cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2, r = (Math.abs((Math.max(...xs) - Math.min(...xs)) * Math.cos(a)) + Math.abs((Math.max(...ys) - Math.min(...ys)) * Math.sin(a))) / 2 || 1, st = grad.stops, mix = t => { const pc = Math.max(0, Math.min(1, t)) * 100, i = Math.max(0, st.findIndex(q => q[0] >= pc) - 1), A = st[i], B = st[i + 1] ?? A, k = B[0] > A[0] ? (pc - A[0]) / (B[0] - A[0]) : 0, ch = c => [1, 3, 5].map(j => parseInt(c.slice(j, j + 2), 16)); return `#${ch(A[1]).map((v, j) => Math.round(v + (ch(B[1])[j] - v) * k).toString(16).padStart(2, '0')).join('')}`; };
    return runs.flatMap(rn => rn.slice(1).flatMap((q, i) => { const p = rn[i], L = Math.hypot(q[0] - p[0], q[1] - p[1]), m = Math.max(1, Math.min(24, Math.ceil(L / 8))); return Array.from({ length: m }, (_, j) => { const u = j / m, v = (j + 1) / m, x1 = p[0] + (q[0] - p[0]) * u, y1 = p[1] + (q[1] - p[1]) * u, x2 = p[0] + (q[0] - p[0]) * v, y2 = p[1] + (q[1] - p[1]) * v, t = (((x1 + x2) / 2 - cx) * Math.cos(a) + ((y1 + y2) / 2 - cy) * Math.sin(a) + r) / (2 * r); return `<path d="M${n(x1)},${n(y1)} L${n(x2)},${n(y2)}" fill="none" stroke="${mix(t)}" stroke-width="${n(w0)}"${s['Line Transparency'] > 0 ? ` stroke-opacity="${n(1 - s['Line Transparency'] / 100)}"` : ''}/>`; }); })); };
  const gaps = s.Compound && s.Compound !== 'single' && !none(s.Outline) ? [`<path d="${dOf}" fill="none" stroke="#ffffff" stroke-width="${n(w0 * (s.Compound === 'triple' ? 3 / 5 : 1 / 3))}"/>`, ...(s.Compound === 'triple' ? [`<path d="${dOf}" fill="none" stroke="${s.Outline}" stroke-width="${n(w0 / 5)}"/>`] : [])] : [];
  const out = [...(grad ? along() : [`<path d="${dOf}" fill="none" ${stroke(s)} stroke-linejoin="miter"/>`]), ...gaps];
  const w = s.Weight * PT;
  // Of its style and size: drawn from its tip back along the line (ux, uy) and across it (-uy, ux).
  const head = ([x, y], [px, py], h) => {
    const { len, wide } = Scene.headSize(h, w), half = wide / 2, d = Math.hypot(x - px, y - py) || 1, ux = (x - px) / d, uy = (y - py) / d;
    const at = (along, across) => `${n(x - ux * along - uy * across)},${n(y - uy * along + ux * across)}`, shape = pts => `M${pts.join(' L')}`;
    if (h.type === 'open') return `<path d="${shape([at(len, half), at(0, 0), at(len, -half)])}" fill="none" stroke="${s.Outline}" stroke-width="${n(w)}" stroke-linejoin="miter"/>`;
    if (h.type === 'oval') return `<ellipse cx="${n(x - ux * len / 2)}" cy="${n(y - uy * len / 2)}" rx="${n(len / 2)}" ry="${n(half)}" transform="rotate(${n(Math.atan2(uy, ux) * 180 / Math.PI)} ${n(x - ux * len / 2)} ${n(y - uy * len / 2)})" fill="${s.Outline}"/>`;
    const pts = h.type === 'stealth' ? [at(0, 0), at(len, half), at(len * 0.75, 0), at(len, -half)] : h.type === 'diamond' ? [at(0, 0), at(len / 2, half), at(len, 0), at(len / 2, -half)] : [at(0, 0), at(len, half), at(len, -half)];
    return `<path d="${shape(pts)} Z" fill="${s.Outline}"/>`;
  };
  if (!none(s.Outline) && (s.Arrow === 'end' || s.Arrow === 'both')) out.push(head(points.at(-1), points.at(-2), Scene.headOf(s, 'end')));
  if (!none(s.Outline) && (s.Arrow === 'start' || s.Arrow === 'both')) out.push(head(points[0], points[1], Scene.headOf(s, 'start')));
  return out.join('');
}
const FRAME = { stroke: '#595959' };
const frameDash = kind => kind === 'solid' || kind === 'bracket' ? 'solid' : kind === 'dotted' ? 'dotted' : 'dashed';
const bracket = (w, h) => `M0.5,${n(h)} V${n(h - 5)} H${n(w - 0.5)} V${n(h)}`;
function swatch(sw, { x, y, w, h }) {
  // (Its arrowheads as its lines', but Auto, which is by which way a line runs.)
  if (sw.kind === 'line') return route([[x, y + h / 2], [x + w, y + h / 2]], { ...sw, Arrow: sw.Arrow === 'auto' ? 'none' : sw.Arrow });
  if (sw.kind === 'frame') return g(x, y, body('rect', w, h, { Fill: 'none', Outline: FRAME.stroke, Weight: sw.Weight, Dash: 'dashed' }));
  return g(x, y, body(sw.Shape ?? 'rect', w, h, sw)) + Scene.swatchParts(sw, { x, y, w, h }).map(p => markSvg(p)).join('');
}
function markSvg(m, pdf) {
  const s = look(m), deep = inner => { const t = s['Turn 3D']; return t ? `<g transform="translate(${n(m.x)} ${n(m.y)}) ${Shapes.turned3d(t, m.w, m.h)} translate(${n(-m.x)} ${n(-m.y)})">${inner}</g>` : inner; };
  // (A box of a design: its body, its parts, each as a free shape's drawn, then what's in no part: dendra.md, Group designs.)
  if (m.type === 'box' && m.parts?.length) return deep(g(m.x, m.y, body(m.shape, m.w, m.h, s, null, m)) + m.parts.map(p => markSvg(p, pdf)).join('') + g(m.x, m.y, texts(m.texts.filter(it => !it.part), pdf)));
  if (m.type === 'box') return deep(g(m.x, m.y, body(m.shape, m.w, m.h, s, null, m) + texts(m.texts, pdf)));
  if (m.type === 'line') return route(m.points, s, m.runs) + (m.labelAt && m.texts.length ? g(m.labelAt.x, m.labelAt.y, (m.chip ? g(-4, -1, body(m.chip.Shape ?? 'rect', m.label.w + 8, m.label.h + 2, m.chip)) : '') + texts(m.texts, pdf)) : '');
  if (m.type === 'frame') return g(m.x, m.y, (m.lone ? '' : `<path d="${m.kind === 'bracket' ? bracket(m.w, m.h) : Scene.path('rect', m.w, m.h)}" fill="none" ${stroke({ Outline: FRAME.stroke, Dash: frameDash(m.kind) }, look(m).Weight)}/>`) + texts([m.caption], pdf));
  if (m.geometry === 'group') return '';
  if (m.geometry === 'line') return route(m.points, s);
  // A table: its cells' fills, its rules and its words.
  if (m.geometry === 'table') { const t = m.table, rules = [...t.rows.map(r => `M0,${n(r.y)} H${n(m.w)}`), `M0,${n(m.h)} H${n(m.w)}`, ...t.xs.map(x => `M${n(x)},0 V${n(m.h)}`), `M${n(m.w)},0 V${n(m.h)}`].join(' ');
    return g(m.x, m.y, t.rows.flatMap(r => r.cells.filter(k => !none(k.fill)).map(k => `<rect x="${n(k.x)}" y="${n(r.y)}" width="${n(k.w)}" height="${n(r.h)}" fill="${k.fill}"/>`)).join('') + `<path d="${rules}" fill="none" ${stroke(s)}/>` + texts(m.texts, pdf)); }
  // (A free shape turned, about its middle.)
  const turned = inner => m.rotate ? `<g transform="rotate(${n(m.rotate)} ${n(m.x + m.w / 2)} ${n(m.y + m.h / 2)})">${inner}</g>` : inner;
  if (m.geometry === 'picture') {
    // Cropped, the whole of it placed where what's left falls in its frame, clipped to the frame.
    const c = m.crop && { left: 0, top: 0, right: 0, bottom: 0, ...m.crop }, fw = c ? m.w / (1 - (c.left + c.right) / 100) : m.w, fh = c ? m.h / (1 - (c.top + c.bottom) / 100) : m.h;
    const image = !c ? `<image href="${esc(m.src ?? '')}" width="${n(m.w)}" height="${n(m.h)}" preserveAspectRatio="xMidYMid meet"/>`
      : `<clipPath id="crop-${esc(m.id)}"><rect width="${n(m.w)}" height="${n(m.h)}"/></clipPath><g clip-path="url(#crop-${esc(m.id)})"><image href="${esc(m.src ?? '')}" x="${n(-fw * c.left / 100)}" y="${n(-fh * c.top / 100)}" width="${n(fw)}" height="${n(fh)}" preserveAspectRatio="none"/></g>`;
    const mirrored = m.flip ? `<g transform="translate(${m.flip.h ? n(m.w) : 0} ${m.flip.v ? n(m.h) : 0}) scale(${m.flip.h ? -1 : 1} ${m.flip.v ? -1 : 1})">${image}</g>` : image;
    return turned(g(m.x, m.y, mirrored + (s.Outline === '#000000' ? '' : body('rect', m.w, m.h, { ...s, Fill: 'none' }))));
  }
  if (m.geometry === 'legend') return g(m.x, m.y, body('rect', m.w, m.h, { ...s, Dash: 'solid' }) + texts(m.texts, pdf)
    + m.rows.map(r => swatch(r.swatch, r.sw) + texts([r.caption], pdf)).join(''));
  return turned(deep(g(m.x, m.y, body(m.geometry === 'text' || m.geometry === 'frame' ? 'rect' : m.geometry, m.w, m.h, s, m.flip, m) + texts(m.texts, pdf))));
}
// How much smaller a page is drawn on its sheet: its scale, exactly, so it fills the sheet.
const fit = page => Math.min(page.sheet.w / page.w, page.sheet.h / page.h);
// The papers a page can be drawn on, by the names the dialog gives them.
const PAPERS = Scene.PAPERS;
// The scene as SVG, in its own pixels, on white; with `frame` (a sheet's size, in the sheet's pixels), in the
// middle of a larger sheet, as a deck's slides hold a smaller one. For a PDF, `pdf` its fonts (see fontsOf); true,
// its standard fonts.
function svg(scene, { pdf = false, frame = scene.page.sheet } = {}) {
  if (pdf === true) pdf = PLAIN;
  const { w, h } = scene.page, k = fit(scene.page), fw = frame.w / k, fh = frame.h / k, x = (w - fw) / 2, y = (h - fh) / 2;
  at = scene.page.scale ?? 1;
  picturesNow = pdf ? picturesDrawn : null; viewNow = scene.view;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n(fw)}" height="${n(fh)}" viewBox="${n(x)} ${n(y)} ${n(fw)} ${n(fh)}">`
    + `<rect x="${n(x)}" y="${n(y)}" width="${n(fw)}" height="${n(fh)}" fill="#ffffff"/>${reading(scene.marks).map(m => markSvg(m, pdf)).join('')}</svg>`;
}

// A scene's boxes and lines, furniture aside, as a small drawing of what it is: the New chart gallery's cards.
function sketch(scene) {
  const ms = reading(scene.marks).filter(m => m.type === 'box' || m.type === 'line'), boxes = ms.filter(m => m.type === 'box');
  if (!boxes.length) return '';
  const pad = 2, x = Math.min(...boxes.map(b => b.x)) - pad, y = Math.min(...boxes.map(b => b.y)) - pad, w = Math.max(...boxes.map(b => b.x + b.w)) + pad - x, h = Math.max(...boxes.map(b => b.y + b.h)) + pad - y;
  at = scene.page.scale ?? 1;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${n(x)} ${n(y)} ${n(w)} ${n(h)}" preserveAspectRatio="xMidYMid meet">${ms.map(m => markSvg(m, false)).join('')}</svg>`;
}
// A page's title, as its title shape says it; else its view's name.
const titleOf =s => s.marks.find(m => m.role === 'title')?.texts.map(it => it.text).join(' ').replace(/\s+/g, ' ').trim() || s.name || '';
// A PDF text string: as it is where it's Latin-1, else UTF-16 and marked so, as a title with a curly quote needs.
const pdfText = s => /^[\x20-\x7e\xa0-\xff]*$/.test(s) ? s : `\xfe\xff${Array.from({ length: s.length }, (_, i) => String.fromCharCode(s.charCodeAt(i) >> 8, s.charCodeAt(i) & 255)).join('')}`;
// A PDF of `scenes`, in `fonts` (see fontsOf).
async function pdf(scenes, title, author, fonts = PLAIN) {
  await LIBS.pdf();
  let doc;
  await drawnAsPicture(scenes);
  const holder = Object.assign(document.createElement('div'), { style: 'position:fixed;left:-10000px;top:0;width:0;height:0;overflow:hidden' });
  document.body.append(holder);
  try {
    for (const s of scenes) {
      const w = s.page.sheet.w * 0.75, h = s.page.sheet.h * 0.75, o = w > h ? 'l' : 'p';
      if (!doc) { doc = new window.jspdf.jsPDF({ unit: 'pt', format: [w, h], orientation: o, compress: true, putOnlyUsedFonts: true }); fonts.add?.(doc); }
      else doc.addPage([w, h], o);
      holder.innerHTML = svg(s, { pdf: fonts });
      await doc.svg(holder.firstElementChild, { x: 0, y: 0, width: w, height: h });
      if (scenes.length > 1) doc.outline.add(null, pdfText(titleOf(s)), { pageNumber: doc.getNumberOfPages() });
    }
  } finally { holder.remove(); }
  doc.setProperties({ title: pdfText(title), author: pdfText(author), creator: 'Dendra' });
  doc.setLanguage('en-US');
  // jsPDF names itself the producer, which Dendra is: said in its place, padded to its length, so that the
  // file's index of where each object starts still holds.
  const was = `/Producer (jsPDF ${window.jspdf.jsPDF.version})`, raw = doc.output().replace(was, '/Producer (Dendra)'.padEnd(was.length));
  return new Blob([Uint8Array.from(raw, c => c.charCodeAt(0))], { type: 'application/pdf' });
}

// ---- PowerPoint ----

// A color as a deck holds it: its theme's where it's one of the ten or a tint or shade of one, as the palette offers them (dendra.md, The palette), so PowerPoint's theme switch
// recolours the slide; or else as it is. `alpha`, its opacity in thousandths of a percent.
let inTheme = () => null;
const clr = (c, alpha = '') => {
  const t = inTheme(c), a = alpha ? `<a:alpha val="${alpha}"/>` : '';
  if (!t) return `<a:srgbClr val="${hex(c)}"${a ? `>${a}</a:srgbClr>` : '/>'}`;
  const mods = t.mod != null ? `<a:lumMod val="${Math.round(t.mod * 100000)}"/>${t.off ? `<a:lumOff val="${Math.round(t.off * 100000)}"/>` : ''}` : '';
  return mods || a ? `<a:schemeClr val="${t.slot}">${mods}${a}</a:schemeClr>` : `<a:schemeClr val="${t.slot}"/>`;
};
// The file's own theme: the chart's ten colors, or Office's.
const clrScheme = (colors = Shapes.OFFICE) => { const [bg1, tx1, bg2, tx2, ...accents] = colors, slot = (tag, c) => `<a:${tag}><a:srgbClr val="${hex(c)}"/></a:${tag}>`; return `<a:clrScheme name="Chart">${slot('dk1', tx1)}${slot('lt1', bg1)}${slot('dk2', tx2)}${slot('lt2', bg2)}${accents.slice(0, 6).map((c, i) => slot(`accent${i + 1}`, c)).join('')}${slot('hlink', '#0563c1')}${slot('folHlink', '#954f72')}</a:clrScheme>`; };
const siteOf = b => Shapes.sites(b?.shape ?? (['text', 'frame', 'picture'].includes(b?.geometry) ? 'rect' : b?.geometry));
const DASH = { solid: 'solid', dashed: 'dash', dotted: 'sysDot', 'square-dot': 'sysDash', 'dash-dot': 'dashDot', 'long-dash': 'lgDash', 'long-dash-dot': 'lgDashDot', 'long-dash-dot-dot': 'lgDashDotDot' };
// A line's end as PowerPoint holds it, by its Arrowhead's style and size.
const HEAD_TYPE = { triangle: 'triangle', stealth: 'stealth', open: 'arrow', oval: 'oval', diamond: 'diamond' }, HEAD_SIZE = { small: 'sm', medium: 'med', large: 'lg' };
const headEnd = (tag, h) => `<a:${tag} type="${HEAD_TYPE[h.type] ?? 'triangle'}" w="${HEAD_SIZE[h.size] ?? 'sm'}" len="${HEAD_SIZE[h.size] ?? 'sm'}"/>`;
const ALIGN = { left: 'l', center: 'ctr', right: 'r' };
// The page's own texts, by the names PowerPoint's Selection Pane gives them; any other shape, as a box is, by
// what it says.
const ROLE = { title: 'Title', date: 'Date', footer: 'Footer', number: 'Page number', footnotes: 'Footnotes' };
// The footer and its number as a deck holds them: the master's placeholders, and each slide's, which take their place and
// look from there, so a footer changed on the master is changed on every slide; its number a field, so a slide moved
// renumbers. A slide says its own place or look only where its sheet or the page's font makes it other than the master's.
const FOOT = { footer: { type: 'ftr', master: 3, layout: 10 }, number: { type: 'sldNum', master: 4, layout: 11 } };
const NUM_FIELD = '{B6F15528-21DE-4FAA-801E-634DDDAF4B2B}';
const RUN_LOOK = ['Font', 'Size', 'Bold', 'Italic', 'Underline', 'Strike', 'Color'];
function footMaster(m, r, k, level) {
  const f = FOOT[m.role], t = m.texts[0].look, ph = `type="${f.type}" sz="quarter" idx="${level === 'master' ? f.master : f.layout}"`, id = m.role === 'footer' ? 3 : 4, name = m.role === 'footer' ? 'Footer Placeholder' : 'Slide Number Placeholder';
  const nv = `<p:nvSpPr><p:cNvPr id="${id}" name="${name} ${id - 1}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph ${ph}/></p:nvPr></p:nvSpPr>`;
  const run = m.role === 'number' ? `<a:fld id="${NUM_FIELD}" type="slidenum"><a:rPr lang="en-US"/><a:t>‹#›</a:t></a:fld>` : `<a:r><a:rPr lang="en-US"/><a:t>${esc(m.texts[0].text)}</a:t></a:r>`;
  if (level === 'layout') return `<p:sp>${nv}<p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p>${run}</a:p></p:txBody></p:sp>`;
  const font = esc(t.Font), rPr = `sz="${Math.max(100, Math.round(t.Size * k * 100))}"${t.Bold ? ' b="1"' : ''}${t.Italic ? ' i="1"' : ''}${t.Underline ? ' u="sng"' : ''}${t.Strike ? ' strike="sngStrike"' : ''}`;
  return `<p:sp>${nv}<p:spPr>${xfrm(E(r.x), E(r.y), E(r.w), E(r.h))}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr wrap="none" rtlCol="0" anchor="t"/><a:lstStyle><a:lvl1pPr algn="${ALIGN[t.Align] ?? 'l'}"><a:lnSpc><a:spcPts val="${Math.round(t.Size * 1.2 * (t.Spacing ?? 1) * k * 100)}"/></a:lnSpc><a:defRPr ${rPr}><a:solidFill>${clr(t.Color)}</a:solidFill><a:latin typeface="${faceRef(t.Font)}"/><a:cs typeface="${faceRef(t.Font, 'cs')}"/></a:defRPr></a:lvl1pPr></a:lstStyle><a:p>${run}</a:p></p:txBody></p:sp>`;
}
// On a slide, `master` being what its master says of it: { r, look, k }.
function footSlide(id, m, r, k, master) {
  // (As it prints, whatever scale its page is drawn at; and where it stands by the edge it's set from, the footer's left, a number's right, however wide it is.)
  const f = FOOT[m.role], it = m.texts[0], t = it.look, printed = (x, kk) => Math.round(x.Size * kk * 100), same = RUN_LOOK.every(l => l === 'Size' ? printed(master.look, master.k) === printed(t, k) : master.look[l] === t[l]);
  const edge = x => m.role === 'number' ? x.x + x.w : x.x, moved = Math.abs(edge(master.r) - edge(r)) > 0.02 || Math.abs(master.r.y - r.y) > 0.02;
  const font = esc(t.Font), rPr = same ? '<a:rPr lang="en-US" dirty="0"/>' : `<a:rPr lang="en-US" sz="${Math.max(100, Math.round(t.Size * k * 100))}"${t.Bold ? ' b="1"' : ' b="0"'}${t.Italic ? ' i="1"' : ' i="0"'}${t.Underline ? ' u="sng"' : ''}${t.Strike ? ' strike="sngStrike"' : ''} dirty="0"><a:solidFill>${clr(t.Color)}</a:solidFill><a:latin typeface="${faceRef(t.Font)}"/><a:cs typeface="${faceRef(t.Font, 'cs')}"/></a:rPr>`;
  const line = l => m.role === 'number' ? `<a:fld id="${NUM_FIELD}" type="slidenum">${rPr}<a:t>${esc(l.text)}</a:t></a:fld>` : `<a:r>${rPr}<a:t>${esc(l.text.replace(/ /g, ' '))}</a:t></a:r>`;
  const ps = typed(it).map(ls => `<a:p>${ls.map(line).join(`<a:br>${rPr}</a:br>`)}</a:p>`).join('');
  return `<p:sp><p:nvSpPr>${cNvPr(id, ROLE[m.role])}<p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="${f.type}" sz="quarter" idx="${f.layout}"/></p:nvPr></p:nvSpPr><p:spPr>${moved ? xfrm(E(r.x), E(r.y), E(r.w), E(r.h)) : ''}</p:spPr><p:txBody><a:bodyPr/><a:lstStyle/>${ps}</p:txBody></p:sp>`;
}
// A shape's name, and with `descr` its alt text; with `link`, where a click on it goes (dendra.md, Links).
const cNvPr = (id, name, descr, link = null) => `<p:cNvPr id="${id}" name="${esc(name)}"${descr ? ` descr="${esc(descr)}"` : ''}${link ? `>${hlink(link)}</p:cNvPr>` : '/>'}`;
// What a slide's XML refers to by its relations: a picture, a link, gathered as the slide's written (see pptx).
let relsNow = [], linkPages = new Map();
const relOf = (type, target) => { const i = relsNow.findIndex(r => r.type === type && r.target === target); return `rIdD${(i < 0 ? relsNow.push({ type, target }) : i + 1)}`; };
const hlink = l => l.view && linkPages.has(l.view) ? `<a:hlinkClick r:id="${relOf('slide', linkPages.get(l.view))}" action="ppaction://hlinksldjump"/>` : l.url ? `<a:hlinkClick r:id="${relOf('link', l.url)}"/>` : '';
// A font as a deck names it: Heading and Body by reference, the theme's, so PowerPoint's Theme Fonts change them; else by its name.
const faceRef = (f, script = 'lt') => f === 'Heading' ? `+mj-${script}` : f === 'Body' ? `+mn-${script}` : esc(f);
const E = v => Math.round(v * 914400);                 // inches as EMU

// A deck: a slide for each scene, each written in its XML where PptxGenJS can't write it as PowerPoint does
// (see slide). The slides' layout is PowerPoint's Title Only, its title where the first slide's is and in its
// look, and the file's properties are what PowerPoint would write: no subject, and the fonts and titles the
// slides hold. `say(scene, relations, caption, entries?)` names a slide's lines' relations as one, and with `entries`
// says those at them too (see sentence).
async function pptx(scenes, title, author, say) {
  await LIBS.pptx();
  const p = new PptxGenJS();
  // One size for every slide, the smallest that holds every sheet.
  const W = Math.max(...scenes.map(s => s.page.sheet.w)), H = Math.max(...scenes.map(s => s.page.sheet.h));
  p.defineLayout({ name: 'Dendra', width: W / 96, height: H / 96 });
  p.layout = 'Dendra';
  // The theme's fonts are the page's own (dendra.md, Notes), so what's typed in the deck later stays in style: the first page's, where they differ.
  const themeFont = Scene.fontName(scenes[0]?.page.look?.Font ?? 'Arial'), palette = scenes[0]?.palette ?? null, ownFonts = scenes[0]?.themeFonts ?? null;
  inTheme = Shapes.inTheme(palette);
  p.theme = { headFontFace: ownFonts?.heading ?? themeFont, bodyFontFace: ownFonts?.body ?? themeFont };
  Object.assign(p, { title, subject: '', author, company: '' });
  // The master's footer and number, where a page has them: as the first that does draws them.
  const placed = s => { const k = fit(s.page); return { k, ox: (W - s.page.w * k) / 2, oy: (H - s.page.h * k) / 2 }; };
  const footAt = (m, { k, ox, oy }) => ({ x: (ox + m.x * k) / 96, y: (oy + m.y * k) / 96, w: m.w * k / 96, h: m.h * k / 96 });
  const feet = {};
  for (const s of scenes) for (const m of s.marks) if (FOOT[m.role] && !feet[m.role]) feet[m.role] = { m, ...placed(s), r: footAt(m, placed(s)), look: m.texts[0].look };
  // The chart's master is the deck's: on its slide master, as the first page that has it draws it, so a slide takes it from there; one that leaves it off says so, and one on another sheet has it of its own.
  const masterOf = scenes.find(s => s.marks.some(m => m.master)), sameSheet = s => !!masterOf && s.marks.some(m => m.master) && s.page.sheet.w === masterOf.page.sheet.w && s.page.sheet.h === masterOf.page.sheet.h;
  const finish = scenes.map(s => slide(p, s, placed(s), (...a) => say(s, ...a), feet, { onMaster: sameSheet(s) }));
  const zip = await JSZip.loadAsync(await p.write({ outputType: 'arraybuffer' }));
  const edit = async (f, change) => zip.file(f, change(await zip.file(f).async('string')));
  // What a shape or its words refer to that a deck holds apart: a picture among its media, a link among its relations.
  const media = new Map();
  const toMedia = src => { if (media.has(src)) return media.get(src); const [, type, b64] = /^data:image\/([a-z+]+);base64,(.*)$/s.exec(src) ?? [], ext = { jpeg: 'jpg', 'svg+xml': 'svg' }[type] ?? type, file = `dendra-${media.size + 1}.${ext}`; if (b64) zip.file(`ppt/media/${file}`, b64, { base64: true }); media.set(src, file); return file; };
  const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const related = (f, rels) => !rels.length ? null : edit(f, x => x.replace('</Relationships>', `${rels.map((r, i) => r.type === 'image' ? `<Relationship Id="rIdD${i + 1}" Type="${REL}/image" Target="../media/${toMedia(r.target)}"/>` : r.type === 'slide' ? `<Relationship Id="rIdD${i + 1}" Type="${REL}/slide" Target="slide${r.target}.xml"/>` : `<Relationship Id="rIdD${i + 1}" Type="${REL}/hyperlink" Target="${esc(r.target)}" TargetMode="External"/>`).join('')}</Relationships>`));
  linkPages = new Map(scenes.map((s, i) => [s.view, i + 1]));
  const slides = await Promise.all(finish.map((done, i) => zip.file(`ppt/slides/slide${i + 1}.xml`).async('string').then(done)));
  slides.forEach((x, i) => zip.file(`ppt/slides/slide${i + 1}.xml`, masterOf && !sameSheet(scenes[i]) ? x.replace('<p:sld ', '<p:sld showMasterSp="0" ') : x));
  for (const [i, done] of finish.entries()) await related(`ppt/slides/_rels/slide${i + 1}.xml.rels`, done.rels);
  // Type kerned at every size, as the scene measures it, so each line is as wide as the scene sets it:
  // PowerPoint's own default kerns only from 12 pt.
  for (const f of ['ppt/presentation.xml', 'ppt/slideMasters/slideMaster1.xml']) await edit(f, x => x.replaceAll('kern="1200"', 'kern="100"'));
  await edit('ppt/theme/theme1.xml', x => x.replace(/<a:clrScheme[\s\S]*?<\/a:clrScheme>/, clrScheme(palette ?? undefined)));
  const titles = slides.map(x => TITLE.exec(x)?.[0]), first = titles.find(Boolean), footed = ['footer', 'number'].filter(r => feet[r]);
  await edit('ppt/slideLayouts/slideLayout1.xml', x => x.replace('<p:cSld name="DEFAULT">', `<p:cSld name="${first ? 'Title Only' : 'Blank'}">`)
    .replace('</p:grpSpPr></p:spTree>', `</p:grpSpPr>${first ? layoutTitle(first) : ''}${footed.map(r => footMaster(feet[r].m, feet[r].r, feet[r].k, 'layout')).join('')}</p:spTree>`));
  if (footed.length) await edit('ppt/slideMasters/slideMaster1.xml', x => x.replace('</p:grpSpPr></p:spTree>', `</p:grpSpPr>${footed.map(r => footMaster(feet[r].m, feet[r].r, feet[r].k, 'master')).join('')}</p:spTree>`)
    .replace(/<p:hf [^>]*\/>/, `<p:hf sldNum="${feet.number ? 1 : 0}" hdr="0" ftr="${feet.footer ? 1 : 0}" dt="0"/>`));
  if (masterOf) {
    const made = slide(p, masterOf, placed(masterOf), () => null, feet, { only: true });
    await edit('ppt/slideMasters/slideMaster1.xml', x => x.replace('</p:grpSpPr>', `</p:grpSpPr>${made.xml}`));
    await related('ppt/slideMasters/_rels/slideMaster1.xml.rels', made.rels);
  }
  // (Each kind of picture a deck holds is named among its content types, as PowerPoint opens none it can't type.)
  await edit('[Content_Types].xml', x => [...new Set([...media.values()].map(f => f.split('.').pop()))].reduce((out, ext) => new RegExp(`Extension="${ext}"`).test(out) ? out : out.replace('<Default ', `<Default Extension="${ext}" ContentType="image/${{ jpg: 'jpeg', svg: 'svg+xml' }[ext] ?? ext}"/><Default `), x));
  await edit('docProps/app.xml', x => properties(x, slides, titles, W === 1280 && H === 720 ? 'Widescreen' : 'Custom'));
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
}
// A slide's title, in its title placeholder.
const TITLE = /<p:sp><p:nvSpPr><p:cNvPr id="\d+" name="Title"\/><p:cNvSpPr><a:spLocks noGrp="1"\/><\/p:cNvSpPr><p:nvPr><p:ph type="title"\/>[\s\S]*?<\/p:sp>/;
// A layout's title placeholder made from a slide's title: in its place, its first paragraph's look its style,
// holding PowerPoint's prompt.
function layoutTitle(sp) {
  const [, pa, pk] = /<a:pPr([^>]*)>([\s\S]*?)<\/a:pPr>/.exec(sp), [, ra, rk] = /<a:rPr([^>]*)>([\s\S]*?)<\/a:rPr>/.exec(sp);
  return sp.replace(/id="\d+"/, 'id="2"').replace(/<a:lstStyle\/>[\s\S]*<\/p:txBody>/, `<a:lstStyle><a:lvl1pPr${pa}>${pk}<a:defRPr${ra.replace(/ (lang|dirty)="[^"]*"/g, '')}>${rk}</a:defRPr></a:lvl1pPr></a:lstStyle>`
    + '<a:p><a:r><a:rPr lang="en-US"/><a:t>Click to edit Master title style</a:t></a:r></a:p></p:txBody>');
}
// The deck's statistics and contents in its properties, as PowerPoint counts them: its words and paragraphs,
// its slides' format, and its fonts, theme and slide titles (PowerPoint lists one without a title as "PowerPoint
// Presentation").
function properties(app, slides, titles, format) {
  const said = x => [...(x ?? '').matchAll(/<a:t>([^<]*)<\/a:t>/g)].map(m => m[1]);
  const paragraphs = slides.flatMap(x => x.split('<a:p>').slice(1)).filter(q => /<a:t>[^<]/.test(q.slice(0, q.indexOf('</a:p>'))));
  const parts = [['Fonts Used', [...new Set(slides.flatMap(x => [...x.matchAll(/<a:latin typeface="([^"]*)"/g)].map(m => m[1] === '+mj-lt' ? Scene.fontName('Heading') : m[1] === '+mn-lt' ? Scene.fontName('Body') : m[1])))]], ['Theme', ['Office Theme']],
    ['Slide Titles', titles.map(t => said(t).join(' ') || 'PowerPoint Presentation')]];
  const vector = (type, items) => `<vt:vector size="${items.length}" baseType="${type}">${items.join('')}</vt:vector>`;
  return app.replace(/<Words>\d+/, `<Words>${slides.flatMap(said).join(' ').split(/\s+/).filter(Boolean).length}`).replace(/<Paragraphs>\d+/, `<Paragraphs>${paragraphs.length}`)
    .replace(/<PresentationFormat>[^<]*/, `<PresentationFormat>${format}`)
    .replace(/<HeadingPairs>[\s\S]*<\/TitlesOfParts>/, `<HeadingPairs>${vector('variant', parts.flatMap(([head, l]) => [`<vt:variant><vt:lpstr>${head}</vt:lpstr></vt:variant>`,
      `<vt:variant><vt:i4>${l.length}</vt:i4></vt:variant>`]))}</HeadingPairs><TitlesOfParts>${vector('lpstr', parts.flatMap(([, l]) => l.map(t => `<vt:lpstr>${t}</vt:lpstr>`)))}</TitlesOfParts>`);
}

// A text's lines by the line each was typed on: as many of them as hold what was typed there, letter for letter.
function typed(it) {
  const ink = s => s.replace(/\s/g, '').length, left = [...it.lines], out = [];
  for (const line of String(it.text).split('\n')) {
    const ls = [];
    for (let need = ink(line); left.length && (need > 0 || (!ls.length && !ink(left[0].text)));) {
      const l = left.shift();
      ls.push(l);
      need -= ink(l.cut ? l.text.slice(0, -1) : l.text);
    }
    if (ls.length) out.push(ls);
  }
  if (left.length) (out.at(-1) ?? out[out.push([]) - 1]).push(...left);
  return out;
}
// A box's text wraps in PowerPoint as any shape's does, where that gives the scene's lines: a rectangle's, a rounded rectangle's or an oval's, centred,
// nothing hung or cut. → the margin either side, in the page's pixels, that leaves PowerPoint's text area just the room those lines take and a
// little for its own measure of them; or null, where PowerPoint would set them otherwise, and the scene's breaks stay (a triangle's, by its slopes).
function wrapsAt(m) {
  const look0 = look(m), inX = { rect: () => 0, rounded: () => Scene.textRect('rounded', m.w, m.h, look0.Corner).x, oval: () => m.w * (1 - Math.SQRT1_2) / 2 }[m.shape];
  if (!inX || !m.texts.length || m.texts.some(it => it.blank || it.hang || it.inline || it.was || it.look.Align !== 'center' || it.lines.some(l => l.cut || l.spans))) return null;
  const plain = s => s.replace(/ /g, ' ').trim(), widest = Math.max(...m.texts.flatMap(it => it.lines.map(l => l.w))), scale = m.h ? (m.texts[0].look.Size || 10) / 10 : 1, room = widest + 3 * scale;
  const set = (ls, look1, width) => { const out = []; let line = ''; for (const w of plain(ls.map(l => l.text).join(' ')).split(/ +/)) { const next = line ? `${line} ${w}` : w; if (Scene.measure(next, look1) <= width) line = next; else { if (line) out.push(line); line = w; } } out.push(line); return out.join('\n'); };
  for (const it of m.texts) for (const ls of typed(it)) { const want = ls.map(l => plain(l.text)).join('\n'); if (set(ls, it.look, room + 2 * scale) !== want || set(ls, it.look, room) !== want) return null; }
  const side = (m.w - 2 * inX() - room) / 2;
  return side >= 0 ? side : null;
}
// Texts as PowerPoint holds them, in a shape anchored at `anchor`: each line where the scene breaks it, so that
// PowerPoint never wraps it again, or, where `wrap` gives the margin either side (inches), a paragraph PowerPoint wraps to the same lines (see wrapsAt);
// in its look at its size on the slide (k times its page's, and at least 1 pt,
// the least PowerPoint opens), its lines as far apart as the scene sets them, and in as far as it hangs them; a
// paragraph for each line it was typed on; its spaces plain, as typed, so that PowerPoint's Find finds them. Its margins are `inset` inches
// all round, or PowerPoint's own where that's null.
function txBody(items, k, anchor, inset, { fit = false, upright = false, wrap = null, cell = null, look: frame = null } = {}) {
  // (What a text said before it, struck, is a run of the paragraph it stands on: see Scene's labelOf.)
  let before = '';
  // (Shrunk by PowerPoint's own: its text at its whole size, what it's shrunk by said in its frame; so taken off there, it's as typed.)
  const shrunk = typeof fit === 'number' && fit < 1 ? fit : 1, flows = !!frame?.Columns?.n && frame.Columns.n > 1 || !!fit;
  const ps = items.flatMap(it => {
    const t = it.look, sz = Math.max(100, Math.round(t.Size / shrunk * k * 100)), font = esc(t.Font), rim = t['Text Outline'], wash = t['Text Gradient'];
    const attrs = `lang="en-US" sz="${sz}"${t.Bold ? ' b="1"' : ''}${t.Italic ? ' i="1"' : ''}${t.Underline ? ' u="sng"' : ''}${t.Strike ? ' strike="sngStrike"' : ''} dirty="0"`;
    const face = `${rim ? `<a:ln w="${Math.round((rim.weight ?? 0.75) * 12700)}">${paint(rim.color ?? '#000000')}</a:ln>` : ''}${wash?.stops?.length ? gradXml(wash) : `<a:solidFill>${clr(t.Color)}</a:solidFill>`}<a:latin typeface="${faceRef(t.Font)}"/><a:cs typeface="${faceRef(t.Font, 'cs')}"/>`, rPr = `<a:rPr ${attrs}>${face}</a:rPr>`;
    const hang = it.hang ? ` marL="${E(it.hang * k / 96)}" indent="${-E(it.hang * k / 96)}"` : '';
    // Indented, and each paragraph's first line starting with its mark where it's bulleted or numbered, the mark in PowerPoint's own list, so a paragraph added there gets one. Hanging, or a first line in, as PowerPoint's own.
    const set = E((it.indent ?? 0) * k / 96), first = E((it.first ?? 0) * k / 96), para = ls => it.indent || it.first ? ` marL="${set}" indent="${ls[0]?.bullet ? -set : first}"` : hang;
    const stops = frame?.Tabs?.length ? `<a:tabLst>${frame.Tabs.map(v => `<a:tab pos="${Math.round(v * 12700)}" algn="l"/>`).join('')}</a:tabLst>` : '';
    const mark = ls => !t.Bullet || t.Bullet === 'none' ? '' : !ls[0]?.bullet ? '<a:buNone/>' : t.Bullet === 'number' ? '<a:buFont typeface="+mj-lt"/><a:buAutoNum type="arabicPeriod"/>' : '<a:buFont typeface="Arial"/><a:buChar char="&#8226;"/>';
    // Part of a line in another look: a run of its own, a superscript by PowerPoint's own baseline, at its full size, as PowerPoint makes it smaller itself.
    const spanRuns = l => l.spans.map(sp => { const s = sp.look, z = Math.max(100, Math.round((sp.base ? s.Size / 0.66 : s.Size) * k * 100)), f = esc(s.Font);
      return `<a:r><a:rPr lang="en-US" sz="${z}"${s.Bold ? ' b="1"' : ' b="0"'}${s.Italic ? ' i="1"' : ' i="0"'}${s.Underline ? ' u="sng"' : ''}${s.Strike ? ' strike="sngStrike"' : ''}${sp.base ? ` baseline="${sp.base === 'up' ? 30000 : -25000}"` : ''} dirty="0"><a:solidFill>${clr(s.Color)}</a:solidFill><a:latin typeface="${faceRef(s.Font)}"/><a:cs typeface="${faceRef(s.Font, 'cs')}"/></a:rPr><a:t>${esc(sp.text.replace(/ /g, ' '))}</a:t></a:r>`; }).join('');
    // A blank field has no paragraph: its room is under the words, which stand as what's printed.
    // A paragraph's mark is in its text's look, so PowerPoint's font box shows the font, and what's typed there matches.
    if (it.blank) return [];
    if (it.inline) { before = `<a:r>${rPr}<a:t>${esc(it.text)}</a:t></a:r><a:r><a:rPr lang="en-US" sz="${sz}" dirty="0"/><a:t> </a:t></a:r>`; return []; }
    const runsBefore = before;
    before = '';
    return typed(it).map(ls => `<a:p><a:pPr algn="${ALIGN[t.Align] ?? 'ctr'}"${para(ls)}><a:lnSpc><a:spcPts val="${Math.round(t.Size * 1.2 * (t.Spacing ?? 1) * k * 100)}"/></a:lnSpc>${mark(ls)}${stops}</a:pPr>${runsBefore}`
      + ((wrap !== null || flows) && !ls.some(l => l.spans) ? `<a:r>${rPr}<a:t>${esc(ls.map((l, j) => `${l.cut ? l.text.slice(0, -1) : l.text}${l.cut || j === ls.length - 1 ? '' : ' '}`.replace(/\u00a0/g, ' ')).join(''))}</a:t></a:r>` : ls.map(l => l.spans ? spanRuns(l) : `<a:r>${rPr}<a:t>${esc(l.text.replace(/\u00a0/g, ' '))}</a:t></a:r>`).join(`<a:br>${rPr}</a:br>`)) + `<a:endParaRPr ${attrs}>${face}</a:endParaRPr></a:p>`);
  });
  // (A table's cell holds its words in the drawing's own namespace, and nothing of a shape's frame; an empty one keeps its size for what's typed there.)
  if (cell) return `<a:txBody><a:bodyPr/><a:lstStyle/>${ps.join('') || `<a:p><a:endParaRPr lang="en-US" sz="${Math.max(100, Math.round(cell.Size * k * 100))}" dirty="0"/></a:p>`}</a:txBody>`;
  // (Its margins each side's, where its own Inner margins say. Shrunk, PowerPoint's own shrink goes on from there; flipped upside down, its text stays the right way up.)
  const margins = inset === null ? '' : ['l', 't', 'r', 'b'].map(side => ` ${side}Ins="${E(wrap !== null && (side === 'l' || side === 'r') ? wrap : typeof inset === 'object' ? inset[side] : inset)}"`).join('');
  const down = frame?.Direction === 'down' ? ' vert="vert"' : frame?.Direction === 'up' ? ' vert="vert270"' : '', columns = frame?.Columns?.n > 1 ? ` numCol="${Math.round(frame.Columns.n)}" spcCol="${Math.round((frame.Columns.gap ?? 7.2) * 12700)}"` : '';
  return `<p:txBody><a:bodyPr${upright ? ' rot="10800000"' : ''}${down}${ps.length ? ` wrap="${wrap !== null || flows ? 'square' : 'none'}"` : ''}${margins}${columns} rtlCol="0" anchor="${anchor}"${fit ? `><a:normAutofit${shrunk < 1 ? ` fontScale="${Math.round(shrunk * 100000)}"` : ''}/></a:bodyPr>` : '/>'}<a:lstStyle/>${ps.join('') || '<a:p><a:endParaRPr lang="en-US" dirty="0"/></a:p>'}</p:txBody>`;
}
const xfrm = (x, y, w, h, turn = '') => `<a:xfrm${turn}><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm>`;
// A color, as transparent as `clear` (0–100) says.
const paint = (c, clear = 0) => none(c) ? '<a:noFill/>'
  : `<a:solidFill>${clr(c, clear > 0 ? Math.round((100 - Math.min(100, clear)) * 1000) : '')}</a:solidFill>`;
// A gradient's fill, PowerPoint's own, along its angle, each stop as opaque as `a` says.
const gradXml = (g, a = '') => `<a:gradFill rotWithShape="1"><a:gsLst>${g.stops.map(([at, c]) => `<a:gs pos="${Math.round(at * 1000)}">${clr(c, a)}</a:gs>`).join('')}</a:gsLst><a:lin ang="${Math.round(((g.angle ?? 0) % 360 + 360) % 360 * 60000)}" scaled="0"/></a:gradFill>`;
// A picture filling a shape, PowerPoint's own: stretched to it, or tiled, a texture being a tile; its picture among the slide's relations.
const blipXml = (o, s) => `<a:blipFill dpi="0" rotWithShape="1"><a:blip r:embed="${relOf('image', o.src)}">${s.Transparency > 0 ? `<a:alphaModFix amt="${Math.round((100 - Math.min(100, s.Transparency)) * 1000)}"/>` : ''}</a:blip><a:srcRect/>${o.tile ? `<a:tile tx="0" ty="0" sx="100000" sy="100000" flip="none" algn="tl"/>` : '<a:stretch><a:fillRect/></a:stretch>'}</a:blipFill>`;
// A fill: a picture or a texture; its gradient, PowerPoint's own, along its angle; its pattern, PowerPoint's own, by its name, over the fill; or its one color.
const fillOf = s => { if (s.Picture?.src) return blipXml(s.Picture, s); const g = s.Gradient; if (!g?.stops?.length && s.Pattern?.prst) return `<a:pattFill prst="${s.Pattern.prst}"><a:fgClr>${clr(s.Pattern.fg ?? '#000000')}</a:fgClr><a:bgClr>${none(s.Fill) ? '<a:schemeClr val="bg1"><a:alpha val="0"/></a:schemeClr>' : clr(s.Fill)}</a:bgClr></a:pattFill>`; if (!g?.stops?.length) return paint(s.Fill, s.Transparency); const a = s.Transparency > 0 ? Math.round((100 - Math.min(100, s.Transparency)) * 1000) : '';
  return gradXml(g, a); };
// A preset's adjustments, by what's set of them: a rounded rectangle's corners, their radius in thousandths of its shorter side; a callout's tip, as shares of its frame from its middle, or for a line callout, from its corner.
function adjusts(geometry, s) {
  const gd = (name, v) => `<a:gd name="${name}" fmla="val ${Math.round(v)}"/>`, t = s.Tail ?? Shapes.TAIL;
  if (geometry === 'rounded') return gd('adj', Math.min(50, Math.max(0, s.Corner ?? Scene.CORNER)) * 1000);
  // (Its corners told, as a part of a design's are, following the box's own: dendra.md, Group designs.)
  if (geometry === 'round2' && s.Corner != null && Math.abs(s.Corner - Scene.CORNER) > 0.01) return gd('adj1', Math.min(50, Math.max(0, s.Corner)) * 1000) + gd('adj2', 0);
  if (geometry === 'callout' || geometry === 'callout-oval') return gd('adj1', t[0] * 1e5) + gd('adj2', t[1] * 1e5);
  if (geometry === 'callout-round') return gd('adj1', t[0] * 1e5) + gd('adj2', t[1] * 1e5) + gd('adj3', 16667);
  if (geometry === 'callout-line') { const X = 0.5 + t[0], Y = 0.5 + t[1], fx = X < 0 ? 0 : X > 1 ? 1 : 0.5, fy = X < 0 || X > 1 ? 0.5 : Y < 0 ? 0 : 1; return gd('adj1', fy * 1e5) + gd('adj2', fx * 1e5) + gd('adj3', Y * 1e5) + gd('adj4', X * 1e5); }
  return '';
}
// PowerPoint's own effects, in the order its files have them: a glow, an inner shadow, an outer shadow, a reflection, soft edges; each in EMU on the slide, a direction in 60,000ths of a degree, a color and how opaque. Then its 3-D, parallel, and its bevel.
const colorAt = (c, clear) => `<a:srgbClr val="${hex(c)}"><a:alpha val="${Math.round((100 - clear) * 1000)}"/></a:srgbClr>`;
const shade = (tag, o, extra = '') => `<a:${tag} blurRad="${Math.round(o.blur * 12700)}" dist="${Math.round(o.distance * 12700)}" dir="${Math.round(((o.angle % 360) + 360) % 360 * 60000)}"${extra}>${colorAt(o.color, o.transparency)}</a:${tag}>`;
const effectXml = s => {
  const o = Scene.shadowOf(s.Shadow), i = Scene.shadowOf(s['Inner Shadow']), g = s.Glow, r = s.Reflection, soft = s['Soft Edge'];
  const list = `${g ? `<a:glow rad="${Math.round((g.size ?? 8) * 12700)}">${colorAt(g.color ?? '#4472c4', g.transparency ?? 60)}</a:glow>` : ''}${i ? shade('innerShdw', i) : ''}${o ? shade('outerShdw', o, ' algn="tl" rotWithShape="0"') : ''}`
    + `${r ? `<a:reflection blurRad="${Math.round((r.blur ?? 0.5) * 12700)}" stA="${Math.round((100 - (r.transparency ?? 50)) * 1000)}" endA="300" endPos="${Math.round((r.size ?? 50) * 1000)}" dist="${Math.round((r.distance ?? 0) * 12700)}" dir="5400000" sy="-100000" algn="bl" rotWithShape="0"/>` : ''}${soft > 0 ? `<a:softEdge rad="${Math.round(soft * 12700)}"/>` : ''}`;
  const t = s['Turn 3D'], rot = v => Math.round((((v ?? 0) % 360) + 360) % 360 * 60000), b = s.Bevel;
  return `${list ? `<a:effectLst>${list}</a:effectLst>` : ''}${t || b ? `<a:scene3d><a:camera prst="orthographicFront">${t ? `<a:rot lat="${rot(t.y)}" lon="${rot(t.x)}" rev="${rot(-(t.z ?? 0))}"/>` : ''}</a:camera><a:lightRig rig="threePt" dir="t"/></a:scene3d>` : ''}${b ?`<a:sp3d><a:bevelT w="${Math.round((b.w ?? 6) * 12700)}" h="${Math.round((b.h ?? b.w ?? 6) * 12700)}" prst="${b.type ?? 'circle'}"/></a:sp3d>` : ''}`;
};
// The anchor of a box's text, by its Valign.
const VALIGN = { top: 't', middle: 'ctr', bottom: 'b' };
// An outline at its weight on the slide (k times its page's), and its arrowheads.
const CMPD = { double: 'dbl', 'thick-thin': 'thickThin', 'thin-thick': 'thinThick', triple: 'tri' };
const ln = (s, k, heads = '') => none(s.Outline) && !s['Line Gradient']?.stops?.length ? '<a:ln><a:noFill/></a:ln>'
  : `<a:ln w="${Math.round(s.Weight * k * 12700)}" cap="${s.Dash === 'dotted' || s.Points?.round ? 'rnd' : 'flat'}"${CMPD[s.Compound] ? ` cmpd="${CMPD[s.Compound]}"` : ''}>${s['Line Gradient']?.stops?.length ? gradXml(s['Line Gradient'], s['Line Transparency'] > 0 ? Math.round((100 - s['Line Transparency']) * 1000) : '') : paint(s.Outline, s['Line Transparency'] ?? 0)}<a:prstDash val="${DASH[s.Dash] ?? 'solid'}"/>${s.Points?.round ? '<a:round/>' : '<a:miter lim="800000"/>'}${heads}</a:ln>`;
// A path through points q, in EMU within w × h.
const freeform = (q, w, h) => `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="r" b="b"/><a:pathLst><a:path w="${w}" h="${h}" fill="none">`
  + q.map(([x, y], i) => `<a:${i ? 'lnTo' : 'moveTo'}><a:pt x="${x}" y="${y}"/></a:${i ? 'lnTo' : 'moveTo'}>`).join('') + '</a:path></a:pathLst></a:custGeom>';
// A shape as PowerPoint writes one, in r (inches on the slide): of a preset geometry, or a path through points
// (inches within r); a text box (`box`), or the slide's title placeholder (`title`); holding `body`.
function sp(id, name, r, geometry, s, k, body, { box = false, title = false, rotate = 0, flip = null, alt = null, locked = false, link = null } = {}) {
  const lock = locked ? '><a:spLocks noMove="1" noResize="1" noRot="1"/></p:cNvSpPr>' : '/>';
  const nv = title ? '<p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="title"/></p:nvPr>' : `<p:cNvSpPr${box ? ' txBox="1"' : ''}${lock}<p:nvPr/>`;
  const adj = Array.isArray(geometry) ? '' : adjusts(geometry, s);
  const geom = Array.isArray(geometry) ? freeform(geometry.map(([x, y]) => [E(x), E(y)]), E(r.w), E(r.h)) : geometry === 'freeform' ? Shapes.custGeom(s.Points, E(r.w), E(r.h)) : `<a:prstGeom prst="${Shapes.prst(geometry)}">${adj ? `<a:avLst>${adj}</a:avLst>` : '<a:avLst/>'}</a:prstGeom>`;
  const turn = `${rotate ? ` rot="${Math.round(rotate * 60000)}"` : ''}${flip?.h ? ' flipH="1"' : ''}${flip?.v ? ' flipV="1"' : ''}`;
  return `<p:sp><p:nvSpPr>${cNvPr(id, name, alt, link)}${nv}</p:nvSpPr><p:spPr>${xfrm(E(r.x), E(r.y), E(r.w), E(r.h), turn)}${geom}${fillOf(s)}${'Outline' in s ? ln(s, k) : ''}${effectXml(s)}</p:spPr>${body}</p:sp>`;
}

// Lines said as one, as the chart says them: those landing on a frame along one route, the first drawn standing
// for the rest (Scene's `merged`, and any of another look drawn over it); and a trunk's lines said once by one
// label on their lane, the label's line naming them (the layout's `kin`). → each line's fellows, itself among
// them, drawn or not, in the order of what they reach across the page.
function together(scene) {
  const by = new Map(), out = new Map(), to = l => scene.byId.get(l.to) ?? {}, lines = [...new Set(scene.byId.values())].filter(l => l.type === 'line');
  for (const l of lines) {
    const k = l.landed ? `${l.landed}|${JSON.stringify(l.points)}` : l.id;
    (by.get(k) ?? by.set(k, []).get(k)).push(l);
  }
  for (const l of lines) if (l.kin?.length > 1) by.set(l.id, l.kin.map(id => scene.byId.get(id)).filter(Boolean));
  for (const ls of by.values()) {
    ls.sort((a, b) => to(a).x - to(b).x || to(a).y - to(b).y);
    for (const l of ls) if (!out.has(l.id) || ls.length > out.get(l.id).length) out.set(l.id, ls);
  }
  return out;
}

// One scene on a slide, its page drawn on its sheet `k` times its size from (ox, oy): every mark in reading
// order, written as PowerPoint writes it. A box's text keeps the scene's lines (see txBody), inset as
// the scene insets it, PowerPoint's own 0.1 in at the chart's scale, all round, as every text of the chart is;
// the page's own shapes (its title, date, Key and free shapes) have PowerPoint's own margins, as the scene sets
// them. A text on its own is a text box placed so that its lines fall where the scene sets them. A line is a
// connector glued to the shapes it joins, so that it follows them when they're moved; what moves as one is
// grouped: a line and its label, lines said as one (see together), a frame and its caption, the Key. `say`
// names lines' relations, and with the entries their labels say, describes them. → what finishes the slide's
// XML once the deck is written, when every shape has its number (PptxGenJS numbers a slide's shapes in the
// order they're added, from 2): each stand-in replaced by what it stands for.
function slide(p, scene, { k, ox, oy }, say, feet = {}, { onMaster = false, only = false } = {}) {
  const sl = only ? null : p.addSlide(), parts = [], ids = new Map(), rels = [], inOrder_ = [];
  let count = 0;
  const X = x => (ox + x * k) / 96, Y = y => (oy + y * k) / 96, L = v => v * k / 96, rect = m => ({ x: X(m.x), y: Y(m.y), w: L(m.w), h: L(m.h) });
  const CHART = 0.1 * k, PAGE = null;
  const add = (kind, ...args) => { if (!only) sl[kind](...args); return (only ? 100 : 2) + count++; };
  // A stand-in for what `write` writes once it has its number. → that number. (On the master, written as it's asked for.)
  const put = write => { const j = parts.push(write) - 1, id = add('addShape', 'rect', { x: 0, y: 0, w: 0, h: 0, objectName: `·${j}·` }); if (only) inOrder_.push([id, j]); return id; };
  const shape = (r, geometry, s, name, { items = [], anchor = 'ctr', inset = PAGE, box, title, rotate, flip, alt, locked, fit, wrap = null, link = null } = {}) =>
    put(id => sp(id, name, r, geometry, s, k, txBody(items, k, anchor, inset, { fit, upright: !!flip?.v, wrap: wrap === null ? null : L(wrap), look: s }), { box, title, rotate, flip, alt, locked, link }));
  // Texts on their own, their lines placed from (x0, y0): a text box at the side they're aligned to, from
  // their first line's top, its margins round them. → its rect.
  const textBox = (items, x0, y0, inset, line = null) => {
    // (A line's label as a small design: its shape under its words, as native as they are.)
    if (line?.chip) shape(rect({ x: x0 - 4, y: y0 - 1, w: line.label.w + 8, h: line.label.h + 2 }), line.chip.Shape ?? 'rect', line.chip, items[0].text);
    const first = items[0], w = Math.max(...items.flatMap(it => it.lines.map(l => it.inline ? 0 : items[items.indexOf(it) - 1]?.inline ? l.x + l.w : l.w))), { top, bottom } = block(items), [mx, my] = inset === PAGE ? [0.1, 0.05] : [inset, inset];
    const r = { x: X(x0 + first.lines[0].x - w * (BEFORE[first.look.Align] ?? 0.5)) - mx, y: Y(y0 + top) - my, w: L(w) + 2 * mx, h: L(bottom - top) + 2 * my };
    shape(r, 'rect', { Fill: 'none' }, first.text, { items, anchor: 't', inset, box: true });
    return r;
  };
  // What `draw` adds, as one group named `name` (and with `alt` its alt text), framed round the rects `draw`
  // gives back. → those rects.
  const group = (name, draw, alt) => { let rects; put(id => grouped(id, name, rects, alt)); rects = draw(); put(() => '</p:grpSp>'); return rects; };
  // A line, glued where it starts and ends; and with `label` ([its texts, where they're placed from]) its label:
  // the two grouped, named as the line is. Its `alt` text is the group's, or the connector's where it's alone.
  // → its rects.
  const connector = (points, s, ends, name, { label = null, alt, link = null } = {}) => {
    const draw = () => {
      put(id => cxn(id, name, points, s, ends?.map((b, i) => glue(scene.byId.get(b), points, i)), { X, Y, k, alt: label ? null : alt, link }));
      return [...points.map(([x, y]) => ({ x: X(x), y: Y(y), w: 0, h: 0 })), ...(label ? [textBox(label[0], label[1].x, label[1].y, CHART, label[2])] : [])];
    };
    return label ? group(name, draw, alt) : draw();
  };
  // The site a line's end is glued to: on the side it leaves or arrives by, the nearer if there are two.
  const glue = (b, ps, end) => {
    const sites = siteOf(b), id = ids.get(b?.id);
    if (!sites || !id) return null;
    const [p, q] = end ? [ps.at(-1), ps.at(-2)] : [ps[0], ps[1]], dx = p[0] - q[0], dy = p[1] - q[1];
    const side = Math.abs(dy) >= Math.abs(dx) ? (dy > 0 ? 0 : 2) : (dx > 0 ? 1 : 3);
    const site = sites[side];
    return { id, idx: Array.isArray(site) ? site[(side % 2 ? p[1] > b.y + b.h / 2 : p[0] > b.x + b.w / 2) ? 1 : 0] : site };
  };

  const fellows = together(scene), done = new Set();
  // A line's own label goes with the box at its owned end, the two grouped, so moving that box takes the label with it
  // and its line follows, and moving the owner leaves it on the leg beside the owned box, still right. A label said for
  // several lines stays with them, there being no one box to go with.
  const carried = new Map();
  for (const l of [...new Set(scene.byId.values())]) if (l.type === 'line' && !l.merged && l.labelAt && l.texts.length && scene.byId.get(l.to)?.type === 'box' && fellows.get(l.id).filter(o => !o.merged).length === 1) (carried.get(l.to) ?? carried.set(l.to, []).get(l.to)).push(l);
  // A group in the chart is a group in the deck, drawn where the first of its members is.
  const inGroup = new Map(scene.marks.filter(m => m.geometry === 'group').flatMap(g => g.members.map(id => [id, g])));
  // A mark, written. → its rects on the slide.
  const write = m => {
    const s = look(m);
    if (m.type === 'box') {
      // (A box of a design: a native group of its body and its parts, each an editable shape with its own words, its connectors glued to the body: dendra.md, Group designs.)
      const whose = (m.parts?.length ? m.texts.find(it => it.name)?.text : null) ?? m.texts[0]?.text ?? 'Shape', items = m.parts?.length ? m.texts.filter(it => !it.part) : m.texts;
      const box = () => { ids.set(m.id, shape(rect(m), m.shape, s, whose, { items, anchor: m.shape === 'triangle' ? 'b' : VALIGN[s.Valign] ?? 'ctr', inset: CHART, wrap: m.parts?.length ? null : wrapsAt(m), alt: s['Alt Text'] })); return [rect(m)]; };
      const own = carried.get(m.id), parts = m.parts ?? [];
      return own || parts.length ? group(whose, () => [...box(), ...parts.flatMap(write), ...(own ?? []).map(l => textBox(l.texts, l.labelAt.x, l.labelAt.y, CHART, l))]) : box();
    }
    if (m.type === 'line') {
      // Lines said as one are one group, named for them all and described so, each line in it named for its own
      // relation; a line alone is named for its relation. Each is described with what its label says.
      if (done.has(m.id)) return [];
      const ls = fellows.get(m.id), drawn = ls.filter(l => !l.merged), lab = drawn.find(l => l.labelAt && l.texts.length), label = lab ? [lab.texts, lab.labelAt, lab] : null;
      drawn.forEach(l => done.add(l.id));
      const rels = ls.map(l => l.record), caption = scene.byId.get(m.landed)?.caption.text, said = say(rels, caption), name = said ?? (lab ?? m).texts[0]?.text ?? 'Line';
      const alt = said && say(rels, caption, ls.flatMap(l => l.texts.map(it => it.id)));
      const line = (l, name, more) => connector(l.points, look(l), [l.from, l.to], name, more);
      return drawn.length === 1 ? line(m, name, { label: carried.get(m.to)?.includes(m) ? null : label, alt })
        : group(name, () => [...drawn.flatMap(l => line(l, say([l.record]) ?? name)), ...(label ? [textBox(label[0], label[1].x, label[1].y, CHART, label[2])] : [])], alt);
    }
    if (m.type === 'frame') {
      // Its outline, a rectangle or a bracket, and its caption; round one box alone, its caption alone.
      const caption = () => textBox([m.caption], m.x, m.y, CHART);
      if (m.lone) return [caption()];
      return group(m.caption.text, () => {
        const outline = { Outline: FRAME.stroke, Weight: s.Weight, Dash: frameDash(m.kind), Fill: 'none' };
        shape(rect(m), m.kind === 'bracket' ? [[0.5, m.h], [0.5, m.h - 5], [m.w - 0.5, m.h - 5], [m.w - 0.5, m.h]].map(([x, y]) => [L(x), L(y)]) : 'rect', outline, m.caption.text);
        return [rect(m), caption()];
      });
    }
    // A free line is a connector glued to what it's glued to, named so, and it follows that in PowerPoint; or a line.
    if (m.geometry === 'line') return connector(m.points, s, m.ends ?? null, m.name ?? (m.ends ? 'Connector' : 'Line'), { alt: m.alt, link: m.link });
    if (m.geometry === 'picture') {
      // Cropped, as PowerPoint holds it: the whole picture's size, and the part of it shown, its frame on the slide. Named, and said to a reader, as the panel has it.
      const c = m.crop && { left: 0, top: 0, right: 0, bottom: 0, ...m.crop }, fw = c ? L(m.w) / (1 - (c.left + c.right) / 100) : L(m.w), fh = c ? L(m.h) / (1 - (c.top + c.bottom) / 100) : L(m.h);
      // (On the master, written as PowerPoint writes one, its picture among the master's relations.)
      if (m.src && only) { const r = rect(m); ids.set(m.id, put(id => `<p:pic><p:nvPicPr>${cNvPr(id, m.name ?? 'Picture', m.alt ?? m.name ?? 'Picture')}<p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${relOf('image', m.src)}"/>${c ? `<a:srcRect l="${Math.round(c.left * 1000)}" t="${Math.round(c.top * 1000)}" r="${Math.round(c.right * 1000)}" b="${Math.round(c.bottom * 1000)}"/>` : ''}<a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${xfrm(E(r.x), E(r.y), E(r.w), E(r.h), `${m.rotate ? ` rot="${Math.round(m.rotate * 60000)}"` : ''}${m.flip?.h ? ' flipH="1"' : ''}${m.flip?.v ? ' flipV="1"' : ''}`)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`)); }
      else if (m.src) ids.set(m.id, add('addImage', { [/^data:/.test(m.src) ? 'data' : 'path']: m.src, x: X(m.x), y: Y(m.y), w: fw, h: fh, sizing: c ? { type: 'crop', x: fw * c.left / 100, y: fh * c.top / 100, w: L(m.w), h: L(m.h) } : { type: 'contain', w: L(m.w), h: L(m.h) }, ...(m.rotate && { rotate: m.rotate }), objectName: m.name ?? 'Picture', altText: m.alt ?? m.name ?? 'Picture', ...(m.flip?.h && { flipH: true }), ...(m.flip?.v && { flipV: true }) }));
      if (s.Outline !== '#000000') shape(rect(m), 'rect', { ...s, Fill: 'none' }, 'Picture', { rotate: m.rotate });
      return [rect(m)];
    }
    if (m.geometry === 'legend') return group(m.title || 'Legend', () => {
      shape(rect(m), 'rect', { ...s, Dash: 'solid' }, m.title || 'Legend', { alt: m.alt });
      if (m.texts.length) textBox(m.texts, m.x, m.y, PAGE);
      // Each row a swatch and its caption, both named as the row is.
      for (const r of m.rows) {
        const sw = r.swatch, box = { x: m.x + r.sw.x, y: m.y + r.sw.y, w: r.sw.w, h: r.sw.h }, name = r.caption.text;
        if (sw.kind === 'line') connector([[box.x, box.y + box.h / 2], [box.x + box.w, box.y + box.h / 2]], { ...sw, Arrow: sw.Arrow === 'auto' ? 'none' : sw.Arrow, Connector: 'straight' }, null, name);
        else if (sw.kind === 'frame') shape(rect(box), 'rect', { Fill: 'none', Outline: FRAME.stroke, Weight: sw.Weight, Dash: 'dashed' }, name);
        else { shape(rect(box), sw.Shape ?? 'rect', sw, name); Scene.swatchParts(sw, box).forEach(write); }
        textBox([r.caption], m.x, m.y, PAGE);
      }
      return [rect(m)];
    });
    if (m.geometry === 'group') return [];
    // A table is PowerPoint's own, its words in its cells, each a text to edit there.
    if (m.geometry === 'table') { const r = rect(m); put(id => tableFrame(id, m, r, s, k, L)); return [r]; }
    if (FOOT[m.role] && feet[m.role]) { put(id => footSlide(id, m, rect(m), k, feet[m.role])); return [rect(m)]; }
    // (A part of a design keeps its margins at the chart's size, as a box does.)
    const text = m.geometry === 'text' || m.geometry === 'frame', by = m.of ? k : 1, ins = s.Inset ? { l: (s.Inset.l ?? 7.2) / 72 * by, t: (s.Inset.t ?? 3.6) / 72 * by, r: (s.Inset.r ?? 7.2) / 72 * by, b: (s.Inset.b ?? 3.6) / 72 * by } : m.of ? { l: 0.1 * k, t: 0.05 * k, r: 0.1 * k, b: 0.05 * k } : PAGE;
    ids.set(m.id, shape(rect(m), text ? 'rect' : m.geometry, s, ROLE[m.role] ?? m.name ?? m.texts[0]?.text ?? Shapes.name(m.geometry) ?? 'Shape',
      { items: m.texts, anchor: VALIGN[s.Valign] ?? (text ? 't' : 'ctr'), box: m.geometry === 'text', title: m.role === 'title', rotate: m.rotate, flip: m.flip, alt: m.alt, locked: m.locked, inset: ins, fit: s.Shrink ? m.shrunk ?? 1 : false, link: m.link }));
    return [rect(m)];
  };
  // A crossing, as the chart draws it (Scene's `runs`). A connector can't be broken, so the line crossing carries its own casing: a white
  // connector under it, a little wider, glued to the same two boxes, written over the line it breaks. Moved in the deck, the two run together, so
  // a crossing goes with its line and nothing stays behind. Lines that run together (a trunk's, those into one apex) are written together,
  // over all their casings, so that none is cut where it leaves the rest. Lines that cross each other both ways round break where that order allows.
  // Over a free shape filled behind the lines, where white would show, a line has none, and crosses plainly.
  const flat = scene.marks.filter(m => m.type === 'line' && (m.settings?.Layer?.value ?? 0) === 0), legsOf = l => l.points.slice(1).map((p, i) => [l.points[i], p]);
  const under = new Map(flat.map(l => [l, new Set()]));
  for (const l of flat) (l.runs ?? []).slice(1).forEach((r, i) => { const [p, q] = [l.runs[i].at(-1), r[0]], x0 = Math.min(p[0], q[0]), x1 = Math.max(p[0], q[0]);
    for (const o of flat) if (o !== l && legsOf(o).some(([a, b]) => Math.abs(a[0] - b[0]) < 0.5 && a[0] > x0 && a[0] < x1 && p[1] > Math.min(a[1], b[1]) && p[1] < Math.max(a[1], b[1]))) under.get(o).add(l); });
  const with_ = new Map(flat.map(l => [l, l])), bandOf = l => with_.get(l) === l ? l : bandOf(with_.get(l));
  for (const key of [l => `${l.from}|${l.trunk}`, l => scene.byId.get(l.to)?.shape === 'triangle' ? l.to : null]) { const first = new Map(); for (const l of flat) { const k = key(l); if (k === null) continue; if (first.has(k)) with_.set(bandOf(l), bandOf(first.get(k))); else first.set(k, l); } }
  const bands = new Map();
  for (const l of flat) (bands.get(bandOf(l)) ?? bands.set(bandOf(l), []).get(bandOf(l))).push(l);
  const inOrder = [], unwritten = new Set(bands.keys());
  while (unwritten.size) { const next = [...unwritten].find(b => bands.get(b).every(l => [...under.get(l)].every(x => !unwritten.has(bandOf(x)) || bandOf(x) === b))) ?? unwritten.values().next().value; inOrder.push(...bands.get(next)); unwritten.delete(next); }
  const behind = scene.marks.filter(m => m.type === 'shape' && (m.look?.Layer ?? 0) < 0 && !none(m.look?.Fill));
  const overBehind = l => behind.some(r => l.points.some(([x, y]) => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h) || legsOf(l).some(([a, b]) => Math.max(a[0], b[0]) > r.x && Math.min(a[0], b[0]) < r.x + r.w && Math.max(a[1], b[1]) > r.y && Math.min(a[1], b[1]) < r.y + r.h));
  const cased = new Set();
  const casings = l => { const b = bandOf(l); if (cased.has(b)) return; cased.add(b);
    for (const o of bands.get(b)) if (under.get(o).size && !overBehind(o)) connector(o.points, { ...look(o), Outline: '#ffffff', Dash: 'solid', Arrow: 'none', Arrowhead: null, Weight: 6 / (scene.page.scale ?? 1) }, [o.from, o.to], `Gap: ${say([o.record]) ?? 'Line'}`); };
  const written = new Set();
  let nextLine = 0;
  for (const mark of reading(scene.marks)) {
    // (What's on the master is there, under what's the slide's; written with the slide only where the slide's sheet is another.)
    if (only ? !mark.master : mark.master && onMaster) continue;
    const m = flat.includes(mark) ? inOrder[nextLine++] : mark;
    if (written.has(m.id)) continue;
    if (flat.includes(m)) casings(m);
    const g = inGroup.get(m.id), of = g ? g.members.map(id => scene.byId.get(id)).filter(Boolean) : [];
    if (of.length < 2) { write(m); continue; }
    of.forEach(x => written.add(x.id));
    const names = of.map(x => x.texts?.[0]?.text ?? x.title ?? 'Shape');
    group(g.name ?? (names.length < 3 ? names.join(' and ') : `${names[0]} and ${names.length - 1} more`), () => of.flatMap(write), g.alt);
  }
  if (only) { relsNow = rels; return { xml: inOrder_.map(([id, j]) => parts[j](id)).join(''), rels }; }
  const finished = xml => { relsNow = rels; return xml.replace(/<p:sp><p:nvSpPr><p:cNvPr id="(\d+)" name="·(\d+)·">[\s\S]*?<\/p:sp>/g, (_, id, j) => parts[j](+id)); };
  finished.rels = rels;
  return finished;
}

// A table as PowerPoint holds one: its columns, its rows each as tall as the scene sets it, each cell its words, which wrap there as a table's do; its fill, its margins, and a rule each side.
function tableFrame(id, m, r, s, k, L) {
  const t = m.table, rule = tag => none(s.Outline) ? `<a:${tag} w="0"><a:noFill/></a:${tag}>` : `<a:${tag} w="${Math.round(s.Weight * k * 12700)}" cap="flat" cmpd="sng" algn="ctr">${paint(s.Outline)}<a:prstDash val="${DASH[s.Dash] ?? 'solid'}"/></a:${tag}>`;
  const cell = c => `<a:tc>${txBody(c.it.lines.length ? [c.it] : [], k, 'ctr', null, { cell: c.it.look, wrap: 0 })}<a:tcPr marL="${E(L(t.inX))}" marR="${E(L(t.inX))}" marT="${E(L(t.inY))}" marB="${E(L(t.inY))}" anchor="${VALIGN[c.it.look.Valign] ?? 'ctr'}">${['lnL', 'lnR', 'lnT', 'lnB'].map(rule).join('')}${none(c.fill) ? '<a:noFill/>' : paint(c.fill)}</a:tcPr></a:tc>`;
  return `<p:graphicFrame><p:nvGraphicFramePr>${cNvPr(id, m.name ?? 'Table', m.alt)}<p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr>`
    + `<p:xfrm><a:off x="${E(r.x)}" y="${E(r.y)}"/><a:ext cx="${E(r.w)}" cy="${E(r.h)}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr${t.header ? ' firstRow="1"' : ''}${t.banded ? ' bandRow="1"' : ''}/>`
    + `<a:tblGrid>${t.cols.map(w => `<a:gridCol w="${E(L(w))}"/>`).join('')}</a:tblGrid>${t.rows.map(row => `<a:tr h="${E(L(row.h))}">${row.cells.map(cell).join('')}</a:tr>`).join('')}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
}
// The start of a PowerPoint group, framed round rects (in inches on the slide).
function grouped(id, name, rects, alt) {
  const x = E(Math.min(...rects.map(r => r.x))), y = E(Math.min(...rects.map(r => r.y)));
  const w = E(Math.max(...rects.map(r => r.x + r.w))) - x, h = E(Math.max(...rects.map(r => r.y + r.h))) - y;
  return `<p:grpSp><p:nvGrpSpPr>${cNvPr(id, name || 'Line', alt)}<p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>`
    + `<p:grpSpPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/><a:chOff x="${x}" y="${y}"/><a:chExt cx="${w}" cy="${h}"/></a:xfrm></p:grpSpPr>`;
}

// A route as PowerPoint's connector: straight, or an elbow of one to five legs (bentConnector3 for one or
// three, 2, 4 and 5 for two, four and five), its legs set by the adjustments, so it stays square when what it joins is
// moved, a line bent by a hand as any other; a route no connector draws is a freeform. An elbow whose first leg is
// upright is one whose first leg runs across, turned a quarter.
function cxn(id, name, ps, s, ends, { X, Y, k, alt, link = null }) {
  const q = ps.map(([x, y]) => [E(X(x)), E(Y(y))]);
  // A detour whose ends line up has no width for its adjustments to be fractions of: its far end a tenth of a point out of
  // line gives it one, too little to see, as PowerPoint's own hold such a line. A box moved there, PowerPoint routes it afresh.
  if (q.length > 2) for (const c of [0, 1]) if (q[0][c] === q.at(-1)[c]) { const n = q.length - 1, on = q[n - 1][c] === q[n][c]; q[n] = [...q[n]]; q[n][c] += 1270; if (on) { q[n - 1] = [...q[n - 1]]; q[n - 1][c] += 1270; } }
  const [x0, y0] = q[0], [x1, y1] = q.at(-1), dx = x1 - x0, dy = y1 - y0, legs = q.length - 1;
  const elbow = s.Connector === 'elbow' && (legs > 1 || !dx || !dy), upright = legs > 1 ? q[1][0] === x0 : elbow && !dx;
  const square = legs === 1 || q.slice(1).every((p, i) => (i % 2 === 0) === upright ? p[0] === q[i][0] : p[1] === q[i][1]);
  const line = ln(s, k, `${['start', 'both'].includes(s.Arrow) ? headEnd('headEnd', Scene.headOf(s, 'start')) : ''}${['end', 'both'].includes(s.Arrow) ? headEnd('tailEnd', Scene.headOf(s, 'end')) : ''}`);
  const nv = (tag, inner) => `<p:nv${tag}Pr>${cNvPr(id, name || 'Line', alt, link)}<p:cNv${tag}Pr>${inner}</p:cNv${tag}Pr><p:nvPr/></p:nv${tag}Pr>`;
  if (legs > 5 || !square || (legs > 1 && (!dx || !dy)) || (!dx && !dy)) {
    const x = Math.min(...q.map(p => p[0])), y = Math.min(...q.map(p => p[1])), w = Math.max(...q.map(p => p[0])) - x, h = Math.max(...q.map(p => p[1])) - y;
    return `<p:sp>${nv('Sp', '')}<p:spPr>${xfrm(x, y, w, h)}${freeform(q.map(([px, py]) => [px - x, py - y]), w, h)}<a:noFill/>${line}</p:spPr></p:sp>`;
  }
  const W = Math.abs(upright ? dy : dx), H = Math.abs(upright ? dx : dy);
  const flipH = upright ? dy < 0 : dx < 0, flipV = upright ? dx > 0 : dy < 0;
  const along = [p => upright ? (p[1] - y0) / dy : (p[0] - x0) / dx, p => upright ? (p[0] - x0) / dx : (p[1] - y0) / dy];
  const adj = legs === 3 ? [along[0](q[1])] : legs === 4 ? [along[0](q[1]), along[1](q[2])] : legs === 5 ? [along[0](q[1]), along[1](q[2]), along[0](q[3])] : legs === 1 && elbow ? [0.5] : [];
  const prst = legs > 1 ? `bentConnector${legs}` : elbow ? 'bentConnector3' : 'straightConnector1';
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const glue = (tag, e) => e ? `<a:${tag} id="${e.id}" idx="${e.idx}"/>` : '';
  return `<p:cxnSp>${nv('CxnSp', glue('stCxn', ends?.[0]) + glue('endCxn', ends?.[1]))}<p:spPr>`
    + xfrm(Math.round(cx - W / 2), Math.round(cy - H / 2), W, H, `${upright ? ' rot="5400000"' : ''}${flipH ? ' flipH="1"' : ''}${flipV ? ' flipV="1"' : ''}`)
    + `<a:prstGeom prst="${prst}"><a:avLst>${adj.map((a, i) => `<a:gd name="adj${i + 1}" fmla="val ${Math.round(a * 100000)}"/>`).join('')}</a:avLst></a:prstGeom>${line}</p:spPr></p:cxnSp>`;
}

// ---- Writing a file ----

const fileName = (...parts) => Tree.nameOfFile(...parts) || 'Chart';
// A page's number, its place in the file (the scene's is its view's place among the chart's).
const numbered = scenes => scenes.map((s, i) => !s.marks.some(m => m.role === 'number') ? s : { ...s, marks: s.marks.map(m => m.role !== 'number' ? m
  : { ...m, texts: m.texts.map(it => ({ ...it, text: String(i + 1), lines: it.lines.map(l => ({ ...l, text: String(i + 1), w: Scene.measure(String(i + 1), it.look) })) })) }) });
// A file of one page is titled as its page is; of more, by `name`, the chart's.
// A PDF's fonts are this computer's, asked for at once, while the click that asked for the file still lets them be;
// any it couldn't embed are said as it's saved: "with Garamond printed as Times". A size the chart can't hold is said too.
async function write(format, sheets, name, { title: called = name, author = '', R = null, N = null } = {}) {
  const scenes = numbered(sheets), title = scenes.length === 1 ? titleOf(scenes[0]) || called : called;
  const local = format === 'pdf' ? installed() : null;
  const fonts = format === 'pdf' ? await LIBS.pdf().then(async () => fontsOf(scenes, await local)) : PLAIN;
  // (A line's words are of its own page's day, what's gone among them.)
  const blob = format === 'pdf' ? await pdf(scenes, title, author, fonts) : await pptx(scenes, title, author, (scene, rels, caption, entries) => R && N ? sentence(scene.state ?? R.records, N, rels, caption, entries) : null);
  const short = [...new Set(scenes.flatMap(s => (s.page.short ?? []).map(f => `${f.what} print at ${+f.printed.toFixed(2)} pt: the chart doesn't fit at ${f.typed}`)))];
  // Never silently another font: said by name, with what to do, and it stays till it's read.
  save(blob, `${fileName(name)}.${format}`, `${fonts.missed.length ? `. ${fontsSaid(fonts.missed)}` : ''}${short.length ? `. ${short.join('; ')}` : ''}`, fonts.missed.length > 0);
  return blob;
}

// ---- The chart's words ----

// A text with an address in it, which ends what it's in (a name, or a part of one), said by its file's name.
const plain = s => String(s).split(' · ').map(p => p.replace(/(?:[a-z][a-z0-9+.-]*:\/\/|\\\\|\b[a-z]:\\).*$/i, a => Tree.linkOf(a).short)).join(' · ');
// A relation as the two-box panel says it, in the formula bar's words where they're to be had, its sides by the
// place rule (Notes.placed), so each once: Margaret A. Chen signs for Fund III, via GP III; but Margaret A. Chen
// signs for the Manager, not via it as well. → { p, words, q, rest, with }: its first two sides' objects in the
// order the words say them, then the rest as the place rule joins them, then the entries at it among `entries` as
// the formula bar says them with a fact (with a percentage of 50%); or, where a side after the first is named by
// a number, a period of the other and not a party to it, { text }, as the place rule says it: Fund III, tax year
// 2026. Null for a relation of fewer than two sides.
function clause(st, N, rel, entries = []) {
  const r = st[rel], xs = r?.args ? N.placed(st, rel) : [];
  if (xs.length < 2) return null;
  if (xs.slice(1).some(x => /^\d+$/.test(x.text))) return { text: plain(xs.map(x => x.join + x.text).join('')) };
  const lower = s => s.replace(/\b[A-Z](?=[a-z])/g, c => c.toLowerCase()), an = w => /^[aeiou]/i.test(w) ? 'an' : 'a';
  const [a, b, ...rest] = xs, t = Tree.treeOf(st, rel), role = r.choice ?? a.edge;
  const [p, words, q] = (t && typeof FormulaBar !== 'undefined' && FormulaBar.phrase?.(t, a.edge, b.edge, { choice: r.choice, not: r.tag === false }))
    || [a.edge, ` is ${r.tag === false ? 'not ' : ''}${an(role)} ${lower(role)} of `, b.edge];
  const at = [...new Set(entries)].map(e => st[e]).filter(e => e?.at === rel && ('field' in e || 'tag' in e));
  const said = at.map((e, i) => `${!i ? ' ' : i < at.length - 1 ? ', ' : ' and '}${'tag' in e ? `${e.tag ? 'with' : 'without'} ${lower(e.edge)}`
    : `${i ? '' : 'with '}${an(e.edge)} ${lower(e.edge)} of ${Tree.outputText(e)}`}`).join('');
  return { p: (p === a.edge ? a : b).id, words, q: (q === a.edge ? a : b).id, rest, with: said };
}
// A frame's caption mid-sentence, after "the". A caption is set as a heading is, its first word capitalised as a
// heading's is. One in title case, a single word among them, is said as written, as a defined term is: each of
// the Funds. One in sentence case, a phrase whose first word is its only capitalised word, is a common noun
// phrase, said in lower case as the formula bar says a term: each of the portfolio companies and blockers. A
// capital after the first word marks a name, so that caption is said as written (Calder Ridge entities), and so
// is a first word in capitals (BDC affiliates).
const called = c => {
  const s = c.replace(/^the /i, '');
  return /^\p{Lu}\p{Ll}/u.test(s) && /\s\p{Ll}/u.test(s) && !/\s\p{Lu}\p{Ll}/u.test(s) ? s[0].toLowerCase() + s.slice(1) : s;
};
// Relations said as one, as one line, or a group of them, draws them all (see together), each object by its
// short name, one of its own begun with The said "the" after the sentence's first word (the BDC). One relation as
// `clause` says it; several alike but for one side, that side said once for them all: by `caption`, the frame's
// they land on (see called), or else in turn (Fund III, Fund III-A and AIV-1); any others, each in turn. Each
// with the `entries` at it (see clause). → null where none has two sides.
function sentence(st, N, rels, caption = null, entries = []) {
  const cs = rels.map(rel => clause(st, N, rel, entries)).filter(Boolean), [c] = cs;
  if (!c) return null;
  const short = x => plain(N.shortOf(st, x)), term = x => short(x) !== plain(N.nameOf(st, x)) ? short(x).replace(/^The /, 'the ') : short(x);
  const rest = x => x.rest.map(s => s.join + term(s.id)).join('') + (x.rest.length && x.with ? ',' : '') + x.with, one = x => x.text ?? `${short(x.p)}${x.words}${term(x.q)}${rest(x)}`;
  const alike = f => new Set(cs.map(f)).size === 1, p = alike(x => x.p), q = alike(x => x.q);
  if (alike(one)) return one(c);
  if (cs.some(x => x.text) || p === q || !alike(x => x.words + rest(x))) return [...new Set(cs.map(one))].join('; ');
  const them = [...new Set(cs.map(x => p ? x.q : x.p))].map(term);
  const all = caption ? `the ${called(caption)}` : them.length > 1 ? `${them.slice(0, -1).join(', ')} and ${them.at(-1)}` : them[0];
  return p ? `${short(c.p)}${c.words}${caption ? `each of ${all}` : all}${rest(c)}` : `Each of ${all}${c.words}${term(c.q)}${rest(c)}`;
}

// ---- The calendar ----

// What falls due: each date a formula gives, or an entry gives in its place, the deadlines the Dates table and
// the status bar count (Formulas.attention), as worked out, in order, each as the Dates table says it: its day,
// what falls due, and whose (Time.whose), an address by its file's name; and whether it's `overdue`, before
// `from`, as it's still due. A date entered (a filing made, renewed today) records what was done.
function dates(R, N, from = '') {
  const st = R.records;
  return Object.entries(st).filter(([id, r]) => r.field === 'date' && (R.computed[id] || R.covered[id]) && /^\d{4}-\d\d-\d\d$/.test(r.value))
    .sort((a, b) => a[1].value.localeCompare(b[1].value))
    .map(([id, r]) => ({ id, day: r.value, what: N.nameOf(st, id), whose: plain(Time.whose(st, r.at, N)), overdue: r.value < from }));
}
// A date as the date's popover says it: what falls due, then whose.
const summary = e => [e.what, e.whose].filter(Boolean).join(' · ');
// Why a date falls when it does, as the formula bar says it; nothing where the bar says nothing.
const why = id => FormulaBar.sentence(id) ?? '';
// What falls due, as one all-day event each on its day, for Outlook, titled by its summary and described by why.
function calendar(R, N, chart, name, from = Log.today()) {
  const text = s => s.replace(/[\\;,]/g, c => `\\${c}`).replace(/\r?\n/g, '\\n');
  // Lines of at most 75 octets, each continued after a space.
  const utf8 = new TextEncoder(), fold = line => {
    let out = '', n = 0;
    for (const ch of line) {
      const b = utf8.encode(ch).length;
      if (n + b > 75) { out += '\r\n '; n = 1; }
      out += ch; n += b;
    }
    return out;
  };
  const day = iso => iso.replace(/-/g, ''), next = iso => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return day(d.toISOString().slice(0, 10)); };
  const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const events = dates(R, N, from).map(e => ['BEGIN:VEVENT', `UID:${chart}.${e.id}@dendra`, `DTSTAMP:${now}`, `DTSTART;VALUE=DATE:${day(e.day)}`,
    `DTEND;VALUE=DATE:${next(e.day)}`, `SUMMARY:${text(summary(e))}`, ...[why(e.id)].filter(Boolean).map(s => `DESCRIPTION:${text(s)}`), 'TRANSP:TRANSPARENT', 'END:VEVENT']);
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Dendra//Dendra//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${text(name)}`, ...events.flat(), 'END:VCALENDAR'];
  const blob = new Blob([ics.map(fold).join('\r\n') + '\r\n'], { type: 'text/calendar' });
  save(blob, `${fileName(name)}.ics`);
  return blob;
}

const api = { write, svg, sketch, calendar, onFile: null };

// ---- In the window: the Export dialog ----

if (typeof Shell !== 'undefined' && typeof App !== 'undefined') {
  const { html } = Shell, { useState, useMemo } = preactHooks;
  const FORMATS = [['pptx', 'PowerPoint'], ['pdf', 'PDF'], ['ics', 'Calendar']];
  const charts = () => App.views.peek().filter(v => v.layout === 'chart');
  const viewAt = id => ({ id, kind: 'View' });
  // A view's page, as its Page note has it: its paper (null for a size of its own) and which way it's turned.
  const pageNow = id => { const p = App.notes.peek().resolve('Page', viewAt(id))?.value ?? 'slide', named = typeof p === 'object' ? p.size : p; return { paper: PAPERS[named] ? named : null, portrait: !!p?.portrait }; };
  const OWN = 'own';
  // A page as of its own day (Time.pageDay): the day it keeps, or else the day of the pages that keep none.
  const scene = (id, paper) => { const d = Time.pageDay(id), R = App.workAt(d); return Scene.of(App.shown.peek(), App.chart.peek(), id, d, { state: R.records, computed: R, seen: App.seenIn(id, R.records), ...(paper && { paper }) }); };
  // A page a look narrows goes as it's shown, and says so: how many of its boxes, by what.
  const narrowed = id => { const d = Time.pageDay(id), R = App.workAt(d), kept = App.seenIn(id, R.records); if (!kept) return null; const as = { state: R.records, computed: R }, on = s => s.marks.filter(m => m.type === 'box' && !m.revealed).length, all = on(Scene.of(App.shown.peek(), App.chart.peek(), id, d, as)), now = on(Scene.of(App.shown.peek(), App.chart.peek(), id, d, { ...as, seen: kept })), by = App.lookWordsOf(id); return `${App.views.peek().find(v => v.id === id)?.name} shows ${now} of ${all} boxes${by.length ? `, filtered by ${by.join(', ')}` : ', by Show only'}.`; };
  // The chart views, in tab order, each as its scene is on that paper, or on its own page: the one shown is App's there,
  // but for a look at another day than it keeps.
  const views = paper => charts().map(v => {
    const shown = App.scene.peek(), own = paper === OWN || paper === pageNow(v.id).paper;
    return { ...(own && shown?.view === v.id && shown.day === Time.pageDay(v.id) ? shown : scene(v.id, own ? null : paper)), name: v.name };
  });
  // A page's day, as its caption says it, or the moment while the past is shown.
  const whenOf = s => App.shown.peek().moment ? App.asOfWords(s.day).line : Tree.formatDate(s.day, 'short');
  const chartName = () => App.shown.peek().charts().find(c => c.chart === App.chart.peek())?.name ?? 'Chart';
  const uri = s => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(s)}`;
  // The pages the file will have: a deck's on its one slide size, a document's each its own, in the faces it will
  // have, where this computer may let its fonts be read (`readable`, asked as the dialog opens).
  let readable = false;
  const sheets = (format, scenes) => {
    const frame = { w: Math.max(...scenes.map(s => s.page.sheet.w)), h: Math.max(...scenes.map(s => s.page.sheet.h)) };
    return numbered(scenes).map(s => { const f = format === 'pdf' ? s.page.sheet : frame, drawn = svg(s, { pdf: format === 'pdf' && (readable ? ASKED : PLAIN), frame: f }); return { name: s.name, when: whenOf(s), drawn, src: uri(drawn), aspect: f.w / f.h }; });
  };
  // What to call a box on a page's warnings: its short name, as of that page's day.
  const called = s => b => App.notes.peek().shortOf(s.state ?? App.state.peek(), b.record);
  // A view placed as a scene `on` a page places it, as a change: its boxes, kept as they were kept, a hand's still a hand's;
  // the scale there; and its free shapes where they stand there.
  function placing(tx, on, view) {
    const N = App.notes.peek(), half = v => Math.round(v * 2) / 2, s = on.page.scale;
    tx.note('Scale', viewAt(view), { scale: s, x: 0, y: 0 });
    for (const m of on.marks) if (m.type === 'box' && !m.revealed) {
      const t = Tree.treeOf(App.state.peek(), m.record), old = N.position(t, view);
      tx.note('Position', t, { x: half(m.x), y: half(m.y), w: half(m.w), ...(old?.h != null && { h: half(m.h) }), ...((!old || old.kept || !Number.isFinite(old.x)) && { kept: true }), ...(old?.hand && { hand: true }), ...(old?.lock && { lock: true }) }, { view });
    }
    for (const r of App.shown.peek().rows(App.chart.peek())) if ('shape' in r && r.view === view) {
      const m = on.byId.get(r.shape);
      if (!m) continue;
      if (r.geometry === 'legend' && r.x == null) { if (r.kept) tx.update(r.shape, { kept: { x: half(m.x * s), y: half(m.y * s) } }); }
      else if (r.x != null) tx.update(r.shape, { x: half(m.x), y: half(m.y), ...(r.w != null && { w: half(m.w) }), ...(r.h != null && { h: half(m.h) }), ...(r.points && { points: m.points.map(([x, y]) => [half(x), half(y)]) }) });
    }
  }
  // Fit to page: what's beyond the margins is brought in, as one change. A box whose middle is off the sheet goes back to the
  // layout, which places it beside its relatives, among what stands; and the page holds all the rest, the scale it keeps
  // falling as far as that needs, its note `fit` till the next change keeps it so.
  function fitToPage(id = Shell.view.peek()) {
    if (App.readOnly.peek()) return Shell.toast(App.whyNot());
    const now = id === App.scene.peek()?.view ? App.scene.peek() : scene(id), p = now.page, M = p.margins, boxes = now.marks.filter(m => m.type === 'box' && !m.revealed);
    if (boxes.every(b => b.x >= M.left - 1 && b.y >= M.top - 1 && b.x + b.w <= p.w - M.right + 1 && b.y + b.h <= p.h - M.bottom + 1)) return Shell.toast('The chart already fits its page');
    const away = b => { const x = b.x + b.w / 2, y = b.y + b.h / 2; return x < 0 || y < 0 || x > p.w || y > p.h; };
    App.change(tx => {
      tx.note('Scale', viewAt(id), { scale: p.scale, x: p.offset.x, y: p.offset.y, fit: true });
      for (const b of boxes.filter(away)) tx.note('Position', Tree.treeOf(App.state.peek(), b.record), undefined, { view: id });
    }, { dated: false, keep: false, say: 'Fit the chart to its page' });
    Canvas.active.peek()?.zoom('fit');
  }
  // Page setup: the view's paper, which way it's turned, and the chart's footer. A paper or a turn is one change, the
  // Page note and the view placed for it, as the export on that paper would place it, so what prints is what's shown. The
  // footer is the chart's, a note at no view, so it's on every chart view.
  const footer =() => App.notes.peek().resolve('Footer', { kind: 'View' })?.value ?? {};
  let tries = 0;
  const footed = (wb, value) => { const id = `·footer${++tries}`, rows = [...wb.rows(App.chart.peek()).filter(r => !('note' in r && r.label === 'Footer')), ...(value ? [{ id, note: id, label: 'Footer', pattern: { kind: 'View' }, value }] : [])], notes = Notes.index(rows.filter(r => 'note' in r));
    return { ...wb, rows: () => rows, notes: () => notes }; };
  // (With its look, which the ribbon gave it, as the footer selected on the page: see the format bar.)
  const asFooter = (text, number, at, date) => text.trim() || number || date ? { text: text.trim(), number, ...(at && at !== 'left' && { at }), ...(date && { date: true }), ...(footer().format && { format: footer().format }) } : null;
  // What a paper is asked as, its margins and a size of its own too (Scene's pageOf).
  const SIDES = ['top', 'right', 'bottom', 'left'], inches = v => Math.round(v / 72 * 1000) / 1000, HALF = { top: 36, right: 36, bottom: 36, left: 36 };
  const turned = (paper, portrait, margins = HALF, own = null) => `${paper === 'custom' && own ? `custom:${Math.round(own.w * 96)}x${Math.round(own.h * 96)}` : paper} ${portrait ? 'portrait' : 'landscape'} m:${SIDES.map(k => margins[k]).join(',')}`;
  const sameSides = (a, b) => SIDES.every(k => Math.abs(a[k] - b[k]) < 0.01);
  // The Page note it makes: a paper's name, turned or not, or a size of its own; with its margins, where they aren't half an inch all round.
  const pageValue = c => { const base = c.paper === 'custom' ? { w: Math.round(c.own.w * 96), h: Math.round(c.own.h * 96) } : c.portrait ? { size: c.paper ?? 'slide', portrait: true } : c.paper ?? 'slide'; return sameSides(c.margins, HALF) ? base : { ...(typeof base === 'string' ? { size: base } : base), margins: c.margins }; };
  function Setup({ choice, view }) {
    const [paper, setPaper] = useState(choice.paper), [portrait, setPortrait] = useState(choice.portrait), [text, setText] = useState(choice.text), [number, setNumber] = useState(choice.number), [at, setAt] = useState(choice.at), [date, setDate] = useState(choice.date), [margins, setMargins] = useState(choice.margins), [own, setOwn] = useState(choice.own);
    Object.assign(choice, { paper, portrait, number, at, date, margins, own });
    const was = pageNow(view), same = paper === was.paper && portrait === was.portrait && sameSides(margins, choice.was.margins) && JSON.stringify(own) === JSON.stringify(choice.was.own);
    const sc = useMemo(() => {
      const s = Scene.of(footed(App.shown.peek(), asFooter(text, number, at, date)), App.chart.peek(), view, App.day.peek(), { state: App.state.peek(), computed: App.computed.peek(), ...(!same && { paper: turned(paper ?? 'slide', portrait, margins, own) }) });
      // (As OK will leave them: what's laid over a box, with it.)
      if (!same) for (const [id, c] of Scene.annotated(view === App.scene.peek()?.view ? App.scene.peek() : scene(view), s).rows) { const m = s.byId.get(id); if (m) Object.assign(m, c); }
      return s;
    }, [paper, portrait, text, number, at, date, margins, own]);
    const page = sheets('pdf', [{ ...sc, name: '' }])[0], says = Scene.says(sc, called(sc), PAPERS[paper] ?? null);
    // A measure in inches, as a page is set up: typed, read as it's left.
    const inch = (label, v, put) => html`<label class="ex-inch"><span>${label}</span><input type="text" inputmode="decimal" aria-label=${label} value=${String(v)} spellcheck="false" onFocus=${e => e.currentTarget.select()} onChange=${e => { const x = parseFloat(e.target.value); if (Number.isFinite(x) && x >= 0) put(x); else e.target.value = String(v); }} /></label>`;
    return html`<div class="ex">
      <div class="ex-pick">
        <${Shell.Pick} label="Paper" value=${paper ?? ''} onPick=${setPaper} options=${[...paper ? [] : [['', 'Its own size']], ...Object.entries(PAPERS), ['custom', 'A size of its own']]} />
        ${paper === 'custom' ? null : html`<div class="menu-seg ex-rows" role="group" aria-label="Orientation">${[[false, 'Landscape'], [true, 'Portrait']].map(([v, label]) => html`
          <button type="button" aria-pressed=${portrait === v} onClick=${() => setPortrait(v)}>${label}</button>`)}</div>`}
        ${paper === 'custom' ? html`${inch('Width', own.w, x => setOwn({ ...own, w: Math.max(1, x) }))}${inch('Height', own.h, x => setOwn({ ...own, h: Math.max(1, x) }))}` : null}
      </div>
      <div class="ex-pick ex-margins"><span class="ex-label">Margins</span>${[['Top', 'top'], ['Right', 'right'], ['Bottom', 'bottom'], ['Left', 'left']].map(([label, k]) => inch(label, inches(margins[k]), x => setMargins({ ...margins, [k]: Math.round(x * 72 * 100) / 100 })))}<span class="ex-unit">inches</span></div>
      <div class="ex-pick ex-foot">
        <input type="text" aria-label="Footer" placeholder="Footer" value=${text} spellcheck="false" onInput=${e => { choice.text = e.target.value; }} onChange=${e => setText(e.target.value)} />
        <div class="menu-seg ex-rows" role="group" aria-label="Footer position">${[['left', 'Left'], ['center', 'Center'], ['right', 'Right']].map(([v, label]) => html`<button type="button" aria-pressed=${(at ?? 'left') === v} onClick=${() => setAt(v)}>${label}</button>`)}</div>
        <label><input type="checkbox" checked=${number} onChange=${e => setNumber(e.target.checked)} />Page numbers</label>
        <label><input type="checkbox" checked=${date} onChange=${e => setDate(e.target.checked)} />Date</label>
      </div>
      ${says.length ? html`<div class="ex-warns">${says.slice(0, 4).map(t => html`<p class="ex-says">${t}</p>`)}</div>` : null}
      <div class="ex-well"><figure class="ex-page" style=${`--a: ${page.aspect}`}><span class="ex-drawn" dangerouslySetInnerHTML=${{ __html: page.drawn }} /></figure></div>
    </div>`;
  }
  async function setup(view = Shell.view.peek()) {
    if (!charts().some(v => v.id === view)) return Shell.toast('Show a chart first');
    if (App.readOnly.peek()) return Shell.toast(App.whyNot());
    const was = pageNow(view), f = footer(), note = App.notes.peek().resolve('Page', viewAt(view))?.value, sheet = (id => { const sc = id === App.scene.peek()?.view ? App.scene.peek() : scene(id); return sc.page.sheet; })(view);
    const own = { w: Math.round(sheet.w / 96 * 100) / 100, h: Math.round(sheet.h / 96 * 100) / 100 }, margins = { ...HALF, ...note?.margins };
    const choice = { paper: note?.w ? 'custom' : was.paper, portrait: was.portrait, text: f.text ?? '', number: !!f.number, at: f.at ?? 'left', date: !!f.date, margins, own, was: { margins, own } };
    const paperWas = choice.paper;
    const go = await Shell.dialog({ title: 'Page setup', width: 720, body: () => html`<${Setup} choice=${choice} view=${view} />`,
      actions: [{ label: 'Cancel', value: false }, { label: 'Done', value: true, primary: true }] });
    if (!go) return;
    const repaged = choice.paper !== paperWas || choice.portrait !== was.portrait || !sameSides(choice.margins, margins) || JSON.stringify(choice.own) !== JSON.stringify(own), value = asFooter(choice.text, choice.number, choice.at, choice.date), refooted = JSON.stringify(value ?? {}) !== JSON.stringify(f.text == null && f.number == null ? {} : f);
    if (!repaged && !refooted) return;
    const on = repaged ? Scene.of(App.shown.peek(), App.chart.peek(), view, App.day.peek(), { state: App.state.peek(), computed: App.computed.peek(), paper: turned(choice.paper ?? 'slide', choice.portrait, choice.margins, choice.own) }) : null;
    // What's laid over a box goes with it to the new paper, and what's tied to nothing stays by its corner, which is said (dendra.md, Free shapes).
    const ann = on ? Scene.annotated(view === App.scene.peek()?.view ? App.scene.peek() : scene(view), on) : null, stays = ann?.stay.length ? `; ${ann.stay.length === 1 ? 'a shape on no box stays by its corner of the page' : `${ann.stay.length} shapes on no box stay by their corners of the page`}` : '';
    const paperSaid = PAPERS[choice.paper] ?? (choice.paper === 'custom' ? `${choice.own.w} × ${choice.own.h} in` : 'its own size');
    App.change(tx => {
      if (refooted) tx.note('Footer', { kind: 'View' }, value ?? undefined);
      if (!on) return;
      tx.note('Page', viewAt(view), pageValue(choice));
      placing(tx, on, view);
      for (const [id, c] of ann.rows) tx.update(id, c);
    }, { dated: false, keep: !on, say: on ? `${choice.paper !== paperWas || choice.portrait !== was.portrait || JSON.stringify(choice.own) !== JSON.stringify(own) ? `Set the page to ${paperSaid}${choice.portrait ? ', portrait' : ''}` : 'Set the margins'}${stays}` : value ? 'Set the footer' : 'Took the footer off' });
    if (on) Canvas.active.peek()?.zoom('fit');
  }
  api.setup = setup;
  api.fit = fitToPage;
  api.placing = placing;
  const here = () => charts().some(v => v.id === Shell.view.peek()), free = () => here() && !App.readOnly.peek(), not = () => App.readOnly.peek() ? App.whyNot() : 'Show a chart first';
  Shell.register('action', { id: 'page.setup', name: 'Page setup…', names: ['Paper', 'Page size', 'Legal', 'Letter', 'Tabloid', 'A4', 'A3', 'Slide size', 'Landscape', 'Portrait', 'Orientation', 'Margins', 'Footer', 'Page number', 'Header and footer'], enabled: free, why: not, run: () => setup() });
  Shell.register('action', { id: 'page.fit', name: 'Fit to page', names: ['Fit chart', 'Scale to fit', 'Shrink to fit', 'Off the page'], enabled: free, why: not, run: () => fitToPage() });
  // The calendar's dates, by year, as the date's popover lists the chart's days; what's overdue red, as the
  // inspector shows it.
  const Dates = () => {
    const all = useMemo(() => dates(App.computed.peek(), App.notes.peek(), App.day.peek()), []), years = [...new Set(all.map(e => e.day.slice(0, 4)))];
    const day = e => Tree.formatDate(e.day, 'short').replace(/, \d{4}$/, '');
    return html`<div class="date-days" style="max-height: none; background: var(--surface); box-shadow: 0 0 0 1px var(--rule-2)">${years.map(y => html`<div class="yr">${y}</div>
      ${all.filter(e => e.day.startsWith(y)).map(e => html`<div class="dayrow"><span class="d">${e.overdue ? html`<span class="overdue">${day(e)}<span class="sr"> (overdue)</span></span>` : day(e)}</span>
        <span class="w"><span class="it"><b>${e.what}</b>${e.whose ? html` · ${e.whose}` : null}</span></span></div>`)}`)}</div>`;
  };
  // What's exported, on what size of page, and the file's pages, fitted to the well, two across where there
  // are more, each captioned; a click shows one at full size. The views are a checklist, in tab order, so any of
  // them go, at least one; every paper there is is offered, a deck's slides of that size. A table's file is as the
  // table shows it, or every row, as it says.
  // The paper is each view's page, as Page setup has it; another chosen here is for this file alone, and says so, and the
  // format never changes it. What's amiss with a page is said over it: a size it can't hold, a box off it, with Fit to
  // page beside that unless nothing can be changed (in Viewing, or the past shown, where exporting writes nothing), and
  // what overlaps.
  function Choice({ choice, here, others, close }) {
    const [format, setFormat] = useState(choice.format), [ids, setIds] = useState(choice.views), [paper, setPaper] = useState(choice.paper);
    const [all, setAll] = useState(choice.all), [full, setFull] = useState(null), [fits, setFits] = useState(0);
    const drawn = format === 'pptx' || format === 'pdf', table = format.startsWith('x') ? others[+format.slice(1)] : null;
    // (A chart with no date to put on one offers no calendar.)
    const dated = useMemo(() => dates(App.computed.peek(), App.notes.peek(), App.day.peek()).length > 0, []);
    const scenes = useMemo(() => drawn ? views(paper) : [], [drawn, paper, fits]);
    const chosen = scenes.filter(s => ids.includes(s.view));
    Object.assign(choice, { format, views: ids, paper, all, scenes: chosen });
    const pages = drawn ? sheets(format, chosen) : [], one = pages[full] ?? null;
    const tick = (id, on) => { setFull(null); setIds(now => charts().map(v => v.id).filter(x => x === id ? on : now.includes(x))); };
    const papers = charts().map(v => pageNow(v.id).paper), differ = new Set(papers).size > 1 || papers.includes(null), stay = [...new Set(chosen.map(s => pageNow(s.view).paper))];
    const oneOff = drawn && paper !== OWN && stay.some(p => p !== paper);
    const said = chosen.flatMap(s => Scene.says(s, called(s), paper === OWN ? PAPERS[pageNow(s.view).paper] : PAPERS[paper]).map(t => ({ t, s, off: !s.page.paper && (t.endsWith(' runs off the page') || t.endsWith(' a printer prints')) })));
    // (A line with more bends than a connector takes is a drawing in the deck.)
    if (format === 'pptx') said.push(...chosen.flatMap(s => s.marks.filter(m => m.type === 'line' && m.points.length > 6).map(m => ({ t: `The line from ${called(s)(s.byId.get(m.from))} to ${called(s)(s.byId.get(m.to))} has more bends than a PowerPoint connector: in the deck it stays where it’s drawn`, s }))));
    const named = x => chosen.length > 1 ? `${x.s.name}: ${x.t}` : x.t;
    // What's wrong with the chart is said before it goes out, a click from each: what's overdue, in error or blank.
    const open = Shell.problems().filter(c => c.kind !== 'soon'), broke = FormulaBar.brokenSaid();
    return html`<div class="ex">
      <div class="ex-pick">
        <${Shell.Pick} label="Format" value=${format} onPick=${v => { setFull(null); setFormat(v); }} options=${[...FORMATS.filter(([f]) => f === 'ics' ? format === 'ics' || dated : here).map(([f, name]) => [f, name]), ...others.map((x, i) => [`x${i}`, x.name])]} />
        ${drawn ? html`<${Shell.Pick} label="Page size" value=${paper} onPick=${v => { setFull(null); setPaper(v); }} options=${[...differ ? [[OWN, 'Each view’s page']] : [], ...Object.entries(PAPERS)]} />` : null}
        ${table?.says ? html`<div class="menu-seg ex-rows" role="group" aria-label="Rows">${[[false, 'As shown'], [true, 'Every row']].map(([v, label]) => html`
          <button type="button" aria-pressed=${all === v} onClick=${() => setAll(v)}>${label}</button>`)}</div>` : null}
      </div>
      ${drawn && charts().length > 1 ? html`<div class="ex-views" role="group" aria-label="Views">${charts().map(v => html`<label>
        <input type="checkbox" checked=${ids.includes(v.id)} disabled=${ids.length === 1 && ids[0] === v.id} onChange=${e => tick(v.id, e.target.checked)} />${v.name}</label>`)}</div>` : null}
      ${table?.says ? html`<p class="ex-says">${table.says(all)}</p>` : null}
      ${broke ? html`<p class="ex-says ex-broken" role="alert">${broke}</p>` : null}
      ${open.length ? html`<p class="ex-says ex-off"><span>Still open on this chart: ${open.map((c, i) => html`${i ? ', ' : ''}<span class=${'said-' + c.kind}>${c.said}</span>`)}</span> <button type="button" class="btn" onClick=${() => { close(false); setTimeout(() => Shell.listProblems(open[0].kind)); }}>See them</button></p>` : null}
      ${drawn ? ids.map(narrowed).filter(Boolean).map(t => html`<p class="ex-says ex-off">${t}</p>`) : null}
      ${oneOff ? html`<p class="ex-says">${PAPERS[paper]} for this file only. ${stay.length === 1 && stay[0] ? `The page stays ${PAPERS[stay[0]]}.` : 'The pages stay as they are.'}</p>` : null}
      ${said.length ? html`<div class="ex-warns">
        ${said.filter(x => !x.off).slice(0, 4).map(x => html`<p class="ex-says">${named(x)}</p>`)}
        ${said.filter(x => x.off).slice(0, 4).map(x => html`<p class="ex-says ex-off">${named(x)} ${App.readOnly.peek() ? null : html`<button type="button" class="btn" onClick=${() => { fitToPage(x.s.view); setFits(n => n + 1); }}>Fit to page</button>`}</p>`)}
      </div>` : null}
      ${drawn ? html`<div class=${'ex-well' + (one ? ' full' : pages.length > 1 ? ' many' : '')} data-grid="figure > button" tabindex="-1">
        ${(one ? [one] : pages).map((pg, i) => html`<figure class="ex-page" key=${pg.name} style=${`--a: ${pg.aspect}`}>
          <figcaption>${pg.name} <span>${pg.when}</span></figcaption>
          <button type="button" aria-label=${`${pg.name}, ${pg.when}`} aria-pressed=${!!one} onClick=${() => setFull(one ? null : i)}><span class="ex-drawn" dangerouslySetInnerHTML=${{ __html: pg.drawn }} /></button></figure>`)}
      </div>` : format === 'ics' ? html`<div class="ex-well"><${Dates} /></div>` : null}
    </div>`;
  }
  // The dialog remembers, for each chart in this browser, what it last exported: the format, the views and a table's rows.
  const memo = () => `export.${App.chart.peek()}`;
  const recalled = () => { try { return JSON.parse(Shell.store.get(memo()) ?? '{}') ?? {}; } catch { return {}; } };
  // `format` is 'pptx', 'pdf' or 'ics', or a table's by its name ('Excel'); or else the one last exported, or what the
  // view shown offers first where it's a table, then a chart's slides.
  async function open(format) {
    readable = await mayRead();
    const shown = Shell.view.peek(), list = charts(), others = Shell.parts.peek().export ?? [], was = recalled();
    const here = list.find(v => v.id === shown) ?? list[0] ?? null, other = name => { const i = others.findIndex(x => x.name === name); return i < 0 ? null : `x${i}`; };
    const asked = format && (FORMATS.some(([f]) => f === format) ? format : other(format));
    const usable = f => !!f && (f === 'ics' || (!!here && (f === 'pptx' || f === 'pdf')));
    const tableShown = !list.some(v => v.id === shown) && others.length;
    const first = asked ?? (tableShown ? other(was.table) ?? 'x0' : usable(was.format) ? was.format : here ? 'pptx' : 'ics');
    // What was last exported from the chart, where the tab you're on was among them; or else that tab alone.
    const kept = (was.views ?? []).filter(id => list.some(v => v.id === id)), on = list.some(v => v.id === shown) ? shown : null;
    const views0 = on ? (kept.includes(on) ? kept : [on]) : kept.length ? kept : here ? [here.id] : [], onPages = new Set(views0.map(id => pageNow(id).paper));
    const choice = { format: first, views: views0, all: !!was.all, paper: onPages.size === 1 && [...onPages][0] ? [...onPages][0] : list.length ? OWN : 'slide' };
    const go = await Shell.dialog({ title: 'Export', width: 1180, body: settle => html`<${Choice} choice=${choice} here=${here} others=${others} close=${settle} />`,
      actions: [{ label: 'Cancel', value: false }, { label: 'Export', value: true, primary: true }] });
    if (!go) return;
    const x = choice.format.startsWith('x') ? others[+choice.format.slice(1)] : null;
    Shell.store.set(memo(), JSON.stringify({ format: x ? was.format : choice.format, table: x ? x.name : was.table, views: choice.views, all: choice.all }));
    // A file of one view is named for it, but where the chart's name says it already; of more, for the chart and what's
    // in it. Each says its as-of day, where every page shares it and it's not today, or the moment, while the past is shown
    // (App.asOfWords). By whoever exports it, blank where no name is set.
    if (choice.format === 'ics') return calendar(App.computed.peek(), App.notes.peek(), App.chart.peek(), [chartName(), App.asOfWords().name].filter(Boolean).join(' - '), App.day.peek());
    if (x) return x.run({ all: choice.all });
    const pages = choice.scenes, names = pages.map(s => s.name), days = [...new Set(pages.map(s => s.day))], chart = chartName();
    // (Of every view there is, it's the chart's: nothing it leaves out is left to say.)
    const inIt = names.length > 1 && names.length === list.length ? '' : names.length === 1 ? (Tree.norm(chart).includes(Tree.norm(names[0])) ? '' : names[0])
      : names.length === 2 ? names.join(' and ') : names.length === 3 ? `${names[0]}, ${names[1]} and ${names[2]}` : `${names[0]} to ${names.at(-1)}`;
    return write(choice.format, pages, fileName(chart, inIt, days.length === 1 || App.shown.peek().moment ? App.asOfWords(days[0]).name : ''),
      { title: chart, author: Store.who() ?? '', R: App.computed.peek(), N: App.notes.peek() }).catch(e => Shell.toast(e?.message || 'Couldn’t export'));
  }
  api.open = open;
}
// A box by itself, as this draws it, for a gallery's thumbnail (dendra.md, Group designs): at the scale its page is drawn at, from its own top left.
api.markSvgOf = (m, scale = 1) => { at = scale; const pad = 6; return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${-pad} ${n(m.w + 2 * pad)} ${n(m.h + 2 * pad)}">${markSvg(m)}</svg>`; };
// The same with a look tried on it, and room round it for what spreads past its frame (`below`, what a reflection takes): a tile of Effects' or Fill's menus, which every tile of a gallery shares.
api.tileSvg = (m, over = {}, scale = 1, below = 0) => {
  at = scale;
  const b = { ...m, x: 0, y: 0, ...(m.look && { look: { ...m.look, ...over } }), ...(m.settings && { settings: { ...m.settings, ...Object.fromEntries(Object.entries(over).map(([k, value]) => [k, { value, note: null }])) } }) };
  const pad = Math.max(10 * PT / scale, Math.min(m.w, m.h) * .22);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${n(-pad)} ${n(-pad)} ${n(m.w + 2 * pad)} ${n(m.h + 2 * pad + below)}">${markSvg(b)}</svg>`;
};

return api;
})();
