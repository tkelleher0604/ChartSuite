// Exports (dendra.md, Views): a view as a PowerPoint slide or a PDF page, every view as a deck or a document
// in tab order, and the chart's dates as a calendar for Outlook. The scene is all either draws.
// - Each page is drawn on its sheet, a 13.33 × 7.5 in slide unless its Page says otherwise, smaller by the
//   page's scale, and every size with it: a text's points are the points it has on the sheet, so it breaks
//   into the scene's lines.
// - PowerPoint: a box is a shape of the same preset geometry, its texts paragraphs in the same fonts that
//   wrap at the same width; a line is a connector glued to its boxes, grouped with its label so the two move
//   together; a frame a shape behind its members; the legend and free shapes are shapes like any other. A
//   deck's slides share one size, the smallest that holds every sheet, each in the middle of its slide.
// - PDF: the scene as SVG, through svg2pdf.js, in the PDF's standard fonts (Helvetica has Arial's widths,
//   Times Times New Roman's), compressed. Each page is its sheet.
// - The Export dialog previews the file: the same SVG, page by page, on the slides or pages it will have; a
//   click on a page shows it at full size.
// What the canvas shows only on screen (computed italics and dashes, the redline) is no part of the scene.
// PptxGenJS, jsPDF and svg2pdf.js load the first time they're needed.
//
// Export.write('pptx' | 'pdf', scenes, name, author?) → a Blob, also saved; Export.svg(scene, { pdf, frame })
// → SVG markup; Export.calendar(R, N, chart, name) → the .ics Blob, also saved, R being Formulas.computeState's
// and N the chart's Notes reader. Export.onFile, if set, takes each finished file (blob, name) instead of the
// browser downloading it.
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

function save(blob, name) {
  if (api.onFile) return api.onFile(blob, name);
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// ---- Text, as the scene sets it ----

// A text's block within its mark: its first line's top and its last line's foot, from the scene's baselines.
const lh = t => t.Size * PT * 1.2;
const top = it => it.lines[0].y - it.look.Size * PT * 0.93;
const block = items => ({ top: top(items[0]), bottom: top(items[0]) + items.reduce((h, it) => h + it.lines.length * lh(it.look), 0) });

// ---- SVG: the PDF, and the preview ----

const ANCHOR = { left: 'start', center: 'middle', right: 'end' };
const STANDARD = f => /courier|consolas|mono/i.test(f) ? 'courier' : /times|georgia|garamond|cambria|serif/i.test(f) && !/sans/i.test(f) ? 'times' : 'helvetica';
const stroke = (s, w = s.Weight) => none(s.Outline) ? 'stroke="none"'
  : `stroke="${s.Outline}" stroke-width="${n(w * PT)}"${Scene.dash(s.Dash, w) ? ` stroke-dasharray="${Scene.dash(s.Dash, w)}"` : ''}${s.Dash === 'dotted' ? ' stroke-linecap="round"' : ''}`;
const body = (shape, w, h, s) => `<path d="${Scene.path(shape, w, h)}" fill="${none(s.Fill) ? 'none' : s.Fill}" ${stroke(s)} stroke-linejoin="miter"/>`;
const g = (x, y, inner) => `<g transform="translate(${n(x)} ${n(y)})">${inner}</g>`;
// Each line of the texts where the scene put it; an underline as a rule, which every reader draws alike.
function texts(items, pdf) {
  return items.map(it => {
    const t = it.look, size = t.Size * PT, anchor = ANCHOR[t.Align] ?? 'middle';
    const font = `font-family="${esc(pdf ? STANDARD(t.Font) : Scene.fontFamily(t.Font))}" font-size="${n(size)}" font-weight="${t.Bold ? 'bold' : 'normal'}" font-style="${t.Italic ? 'italic' : 'normal'}"`;
    return it.lines.map(l => `<text x="${n(l.x)}" y="${n(l.y)}" text-anchor="${anchor}" ${font} fill="${t.Color}">${esc(l.text)}</text>`
      + (t.Underline ? `<rect x="${n(l.x - l.w * { start: 0, middle: 0.5, end: 1 }[anchor])}" y="${n(l.y + size * 0.106)}" width="${n(l.w)}" height="${n(size * 0.073)}" fill="${t.Color}"/>` : '')).join('');
  }).join('');
}
// A route, with an arrowhead at an end as the canvas draws one (X6's block marker).
function route(points, s) {
  const out = [`<path d="M${points.map(p => `${n(p[0])},${n(p[1])}`).join(' L')}" fill="none" ${stroke(s)} stroke-linejoin="miter"/>`];
  const w = s.Weight * PT, len = 5 + w * 3, half = (4 + w * 2.4) / 2;
  const head = ([x, y], [px, py]) => {
    const d = Math.hypot(x - px, y - py) || 1, ux = (x - px) / d, uy = (y - py) / d, bx = x - ux * len, by = y - uy * len;
    return `<path d="M${n(x)},${n(y)} L${n(bx - uy * half)},${n(by + ux * half)} L${n(bx + uy * half)},${n(by - ux * half)} Z" fill="${s.Outline}"/>`;
  };
  if (!none(s.Outline) && (s.Arrow === 'end' || s.Arrow === 'both')) out.push(head(points.at(-1), points.at(-2)));
  if (!none(s.Outline) && (s.Arrow === 'start' || s.Arrow === 'both')) out.push(head(points[0], points[1]));
  return out.join('');
}
const FRAME = { stroke: '#595959', Weight: 0.75 };
const frameDash = kind => kind === 'solid' || kind === 'bracket' ? 'solid' : kind === 'dotted' ? 'dotted' : 'dashed';
const bracket = (w, h) => `M0.5,${n(h)} V${n(h - 5)} H${n(w - 0.5)} V${n(h)}`;
function swatch(sw, { x, y, w, h }) {
  if (sw.kind === 'line') return route([[x, y + h / 2], [x + w, y + h / 2]], { ...sw, Arrow: 'none' });
  if (sw.kind === 'frame') return g(x, y, body('rect', w, h, { Fill: 'none', Outline: FRAME.stroke, Weight: FRAME.Weight, Dash: 'dashed' }));
  const t = sw.Shape === 'triangle';
  return g(x, t ? y - 1 : y, body(sw.Shape ?? 'rect', w, t ? h + 2 : h, sw));
}
function markSvg(m, pdf) {
  const s = look(m);
  if (m.type === 'box') return g(m.x, m.y, body(m.shape, m.w, m.h, s) + texts(m.texts, pdf));
  if (m.type === 'line') return route(m.points, s) + (m.labelAt && m.texts.length ? g(m.labelAt.x, m.labelAt.y, texts(m.texts, pdf)) : '');
  if (m.type === 'frame') return g(m.x, m.y, `<path d="${m.kind === 'bracket' ? bracket(m.w, m.h) : Scene.path('rect', m.w, m.h)}" fill="none" ${stroke({ Outline: FRAME.stroke, Dash: frameDash(m.kind) }, FRAME.Weight)}/>` + texts([m.caption], pdf));
  if (m.geometry === 'group') return '';
  if (m.geometry === 'line') return route(m.points, s);
  if (m.geometry === 'picture') return g(m.x, m.y, `<image href="${esc(m.src ?? '')}" width="${n(m.w)}" height="${n(m.h)}" preserveAspectRatio="xMidYMid meet"/>`
    + (s.Outline === '#000000' ? '' : body('rect', m.w, m.h, { ...s, Fill: 'none' })));
  if (m.geometry === 'legend') return g(m.x, m.y, body('rect', m.w, m.h, { ...s, Dash: 'solid' }) + texts(m.texts, pdf)
    + m.rows.map(r => swatch(r.swatch, r.sw) + texts([r.caption], pdf)).join(''));
  return g(m.x, m.y, body(m.geometry === 'text' || m.geometry === 'frame' ? 'rect' : m.geometry, m.w, m.h, s) + texts(m.texts, pdf));
}
// How much smaller a page is drawn on its sheet: its scale, exactly, so it fills the sheet.
const fit = page => Math.min(page.sheet.w / page.w, page.sheet.h / page.h);
// The scene as SVG, in its own pixels, on white; with `frame` (a sheet's size, in the sheet's pixels), in the
// middle of a larger sheet, as a deck's slides hold a smaller one.
function svg(scene, { pdf = false, frame = scene.page.sheet } = {}) {
  const { w, h } = scene.page, k = fit(scene.page), fw = frame.w / k, fh = frame.h / k, x = (w - fw) / 2, y = (h - fh) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n(fw)}" height="${n(fh)}" viewBox="${n(x)} ${n(y)} ${n(fw)} ${n(fh)}">`
    + `<rect x="${n(x)}" y="${n(y)}" width="${n(fw)}" height="${n(fh)}" fill="#ffffff"/>${scene.marks.map(m => markSvg(m, pdf)).join('')}</svg>`;
}

async function pdf(scenes, title) {
  await LIBS.pdf();
  let doc;
  const holder = Object.assign(document.createElement('div'), { style: 'position:fixed;left:-10000px;top:0;width:0;height:0;overflow:hidden' });
  document.body.append(holder);
  try {
    for (const s of scenes) {
      const w = s.page.sheet.w * 0.75, h = s.page.sheet.h * 0.75, o = w > h ? 'l' : 'p';
      if (!doc) doc = new window.jspdf.jsPDF({ unit: 'pt', format: [w, h], orientation: o, compress: true });
      else doc.addPage([w, h], o);
      holder.innerHTML = svg(s, { pdf: true });
      await doc.svg(holder.firstElementChild, { x: 0, y: 0, width: w, height: h });
      if (scenes.length > 1) doc.outline.add(null, s.name ?? '', { pageNumber: doc.getNumberOfPages() });
    }
  } finally { holder.remove(); }
  doc.setProperties({ title, creator: 'Dendra' });
  return doc.output('blob');
}

// ---- PowerPoint ----

const PRESET = { rect: 'rect', rounded: 'roundRect', oval: 'ellipse', triangle: 'triangle', diamond: 'diamond', hexagon: 'hexagon', octagon: 'octagon',
  parallelogram: 'parallelogram', trapezoid: 'trapezoid', pentagon: 'pentagon', chevron: 'chevron', arrow: 'rightArrow', cylinder: 'can' };
// Where each preset sets its text, as [left, top, right, bottom] in a w × h shape whose shorter side is s:
// presetShapeDefinitions.xml's formulas, checked against PowerPoint's own.
const sides = (w, h, i) => [i, i, w - i, h - i];
const TEXT_RECT = {
  rect: (w, h) => [0, 0, w, h],
  rounded: (w, h, s) => sides(w, h, s * 0.0488155),
  oval: (w, h) => [w * 0.14645, h * 0.14645, w * 0.85355, h * 0.85355],
  triangle: (w, h) => [w / 4, h / 2, w * 3 / 4, h],
  diamond: (w, h) => [w / 4, h / 4, w * 3 / 4, h * 3 / 4],
  hexagon: (w, h, s) => { const q = (2 + 2 * s / w) / 24; return [w * q, h * q, w - w * q, h - h * q]; },
  octagon: (w, h, s) => sides(w, h, s * 0.146445),
  parallelogram: (w, h, s) => { const q = (1 + 1.25 * s / w) / 12; return [w * q, h * q, w - w * q, h - h * q]; },
  trapezoid: (w, h, s) => [s / 6, h * s / (6 * w), w - s / 6, h],
  pentagon: (w, h) => [w * 0.19098, h * 0.23607, w * 0.80902, h],
  chevron: (w, h) => w > h ? [h / 2, 0, w - h / 2, h] : [0, 0, w, h],
  arrow: (w, h, s) => [0, h / 4, w - s / 4, h * 3 / 4],
  cylinder: (w, h, s) => [0, s / 4, w, h - s / 8],
};
// Each preset's connection sites facing up, left, down and right, as PowerPoint numbers them; where a side
// has two, the first is the nearer its start.
const SITES = { rect: [0, 1, 2, 3], rounded: [0, 1, 2, 3], diamond: [0, 1, 2, 3], oval: [0, 2, 4, 6], triangle: [0, 1, 3, 5],
  hexagon: [[4, 5], 3, [2, 1], 0], octagon: [[6, 7], [5, 4], [3, 2], [0, 1]], parallelogram: [0, 5, 4, 2], trapezoid: [0, 1, 2, 3],
  pentagon: [0, 1, 3, 5], chevron: [0, 1, 2, 3], arrow: [0, 1, 2, 3], cylinder: [1, 2, 3, 4] };
const DASH = { solid: 'solid', dashed: 'dash', dotted: 'sysDot' };
// The widths PowerPoint can wrap a text at and break it into the scene's lines: from its widest line to the
// narrowest that would take in more of the next, PowerPoint breaking after a hyphen too where the scene breaks
// only at spaces. The width wanted, kept inside that range clear of its ends; null if the range is too narrow
// to rely on, when the scene's breaks are written as line breaks.
function wrapAt(items, width, want) {
  let lo = 0, hi = Infinity;
  for (const it of items) for (const para of String(it.text).split('\n')) {
    const ls = Scene.breakLines(para, it.look, width);
    ls.forEach((l, i) => {
      lo = Math.max(lo, l.w);
      if (i < ls.length - 1) hi = Math.min(hi, Scene.measure(`${l.text} ${/^[^\s\-–—]*[\-–—]?/.exec(ls[i + 1].text)[0]}`, it.look));
    });
  }
  const m = Math.min(2, (hi - lo) / 2);
  return hi - lo < 1 ? null : Math.min(Math.max(want, lo + m), hi - m);
}

// A deck: a slide for each scene, then each line's connector written into its slide's XML, which PptxGenJS
// can't write: a connector glued to the shapes it joins, so that it follows them when they're moved, in a
// group with its label, so the two move together.
async function pptx(scenes, title, author) {
  await LIBS.pptx();
  const p = new PptxGenJS();
  // One size for every slide, the smallest that holds every sheet.
  const W = Math.max(...scenes.map(s => s.page.sheet.w)), H = Math.max(...scenes.map(s => s.page.sheet.h));
  p.defineLayout({ name: 'Dendra', width: W / 96, height: H / 96 });
  p.layout = 'Dendra';
  p.theme = { headFontFace: 'Arial', bodyFontFace: 'Arial' };
  Object.assign(p, { title, author, company: '' });
  const later = scenes.map(s => slide(p, s, { k: fit(s.page), ox: (W - s.page.sheet.w) / 2, oy: (H - s.page.sheet.h) / 2 }));
  const zip = await JSZip.loadAsync(await p.write({ outputType: 'arraybuffer' }));
  // A line's stand-in, and its label's text box just after it.
  const stand = /<p:sp><p:nvSpPr><p:cNvPr id="(\d+)" name="·line·(\d+)">[\s\S]*?<\/p:sp>(<p:sp><p:nvSpPr><p:cNvPr id="\d+" name="·label·\2">[\s\S]*?<\/p:sp>)?/g;
  for (const [i, lines] of later.entries()) {
    const f = `ppt/slides/slide${i + 1}.xml`;
    zip.file(f, (await zip.file(f).async('string')).replace(stand, (_, id, j, label) => lines[j](+id, label)));
  }
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
}

// One scene on a slide, its page drawn on its sheet `k` times its size from (ox, oy): every mark in the
// scene's order. A line holds its place with a stand-in, replaced by its connector once the deck is written,
// when every shape has its number: PptxGenJS numbers a slide's shapes in the order they're added, from 2.
function slide(p, scene, { k, ox, oy }) {
  const sl = p.addSlide(), lines = [], ids = new Map();
  let count = 0;
  const X = x => (ox + x * k) / 96, Y = y => (oy + y * k) / 96, L = v => v * k / 96, P = px => px * 0.75 * k;
  const add = (kind, ...args) => { sl[kind](...args); return 2 + count++; };
  const fill = c => none(c) ? { type: 'none' } : { color: hex(c) };
  const line = (s, w = s.Weight) => none(s.Outline) ? { type: 'none' } : { color: hex(s.Outline), width: w * k, dashType: DASH[s.Dash] ?? 'solid' };
  // A text's column in PowerPoint: the scene's, about the side its lines align to, as wide as wrapAt says;
  // `hug` makes it as narrow as it can be.
  const column = (items, col, hug) => {
    const w = wrapAt(items, col.width, hug ? 0 : col.width), width = w ?? Math.max(...items.flatMap(it => it.lines.map(l => l.w))) + 2, a = items[0].look.Align;
    return { x: a === 'left' ? col.x : a === 'right' ? col.x + col.width - width : col.x + (col.width - width) / 2, width, broken: w === null };
  };
  // Texts as paragraphs: one for each record's text (and each line it was typed on), in its own look, its
  // lines as far apart as the scene sets them; or each of its lines, where they're `broken`.
  const paragraphs = (items, broken) => items.flatMap(it => {
    const o = { fontFace: it.look.Font, fontSize: it.look.Size * k, bold: !!it.look.Bold, italic: !!it.look.Italic, ...(it.look.Underline && { underline: { style: 'sng' } }),
      color: hex(it.look.Color), align: it.look.Align, lineSpacing: it.look.Size * 1.2 * k };
    return broken ? it.lines.map((l, i) => ({ text: l.text, options: { ...o, softBreakBefore: i > 0, breakLine: i === it.lines.length - 1 } }))
      : String(it.text).split('\n').map(text => ({ text, options: { ...o, breakLine: true } }));
  }).map((r, i, all) => i < all.length - 1 ? r : { ...r, options: { ...r.options, breakLine: false } });
  // A shape's text, set where the scene sets it: insets that make PowerPoint's text area its column, its
  // lines anchored as the scene anchors them (at the foot of a triangle, at the top of a text box). A text box
  // nobody sized doesn't wrap, as it doesn't on the chart.
  const shape = (m, geometry, s, items, col, anchor, name, hug) => {
    const text = items.length ? { ...column(items, col, hug), ...block(items) } : null;
    const [l, t, r, b] = (TEXT_RECT[geometry] ?? TEXT_RECT.rect)(m.w, m.h, Math.min(m.w, m.h)), d = text && text.top + text.bottom - t - b;
    const [above, below] = !text ? [0, 0] : anchor === 'top' ? [text.top - t, 0] : anchor === 'bottom' ? [0, b - text.bottom] : [Math.max(0, d), Math.max(0, -d)];
    return add('addText', text ? paragraphs(items, text.broken) : '', {
      shape: PRESET[geometry] ?? 'rect', x: X(m.x), y: Y(m.y), w: L(m.w), h: L(m.h), fill: fill(s.Fill), line: line(s), valign: anchor, wrap: !m.auto,
      margin: text ? [P(text.x - l), P(r - text.x - text.width), P(below), P(above)] : 0, ...(name && { objectName: name }) });
  };
  // Text alone, its column from x: a line's label, a legend's caption. → its rect on the slide, in inches.
  const label = (items, x, y, width, name = items[0].text) => {
    const f = column(items, { x, width }, true), { top: y0, bottom: y1 } = block(items), r = { x: X(f.x), y: Y(y + y0), w: L(f.width), h: L(y1 - y0) };
    add('addText', paragraphs(items, f.broken), { ...r, margin: 0, valign: 'top', wrap: true, objectName: name });
    return r;
  };
  // A line, and with `text` its label: the two grouped, named as the line is.
  const connector = (points, s, ends, name, text) => {
    const j = lines.length, at = { r: null };
    lines.push((id, labelXml) => {
      const c = cxn(id, name, points, s, ends?.map((b, i) => glue(scene.byId.get(b), points, i)), { X, Y, k });
      return labelXml && at.r ? grouped(100000 + j, name, [c, labelXml.replace(`name="·label·${j}"`, `name="${esc(text.items[0].text)}"`)], points.map(([x, y]) => ({ x: X(x), y: Y(y), w: 0, h: 0 })).concat(at.r)) : c;
    });
    add('addShape', 'rect', { x: 0, y: 0, w: 0, h: 0, objectName: `·line·${j}` });
    if (text) at.r = label(text.items, text.x, text.y, 200, `·label·${j}`);
  };
  // The site a line's end is glued to: on the side it leaves or arrives by, the nearer if there are two.
  const glue = (b, ps, end) => {
    const sites = SITES[b?.shape], id = ids.get(b?.id);
    if (!sites || !id) return null;
    const [p, q] = end ? [ps.at(-1), ps.at(-2)] : [ps[0], ps[1]], dx = p[0] - q[0], dy = p[1] - q[1];
    const side = Math.abs(dy) >= Math.abs(dx) ? (dy > 0 ? 0 : 2) : (dx > 0 ? 1 : 3);
    const site = sites[side];
    return { id, idx: Array.isArray(site) ? site[(side % 2 ? p[1] > b.y + b.h / 2 : p[0] > b.x + b.w / 2) ? 1 : 0] : site };
  };

  for (const m of scene.marks) {
    const s = look(m);
    if (m.type === 'box') ids.set(m.id, shape(m, m.shape, s, m.texts, m.column, m.shape === 'triangle' ? 'bottom' : 'middle', m.texts[0]?.text));
    else if (m.type === 'line') connector(m.points, s, [m.from, m.to], m.texts[0]?.text, m.labelAt && m.texts.length ? { items: m.texts, x: m.labelAt.x, y: m.labelAt.y } : null);
    else if (m.type === 'frame') {
      const dash = frameDash(m.kind), outline = { Outline: FRAME.stroke, Weight: FRAME.Weight, Dash: dash, Fill: 'none' };
      if (m.kind === 'bracket') add('addText', paragraphs([m.caption]), { shape: 'custGeom', x: X(m.x), y: Y(m.y), w: L(m.w), h: L(m.h), line: line(outline),
        points: [[0.5, m.h], [0.5, m.h - 5], [m.w - 0.5, m.h - 5], [m.w - 0.5, m.h]].map(([x, y]) => ({ x: L(x), y: L(y) })),
        margin: 0, valign: 'top', wrap: false, objectName: m.caption.text });
      else shape(m, 'rect', outline, [m.caption], { x: 6, width: 400 }, 'top', m.caption.text, true);
    } else if (m.geometry === 'line') connector(m.points, s, m.ends ?? null, 'Line');
    else if (m.geometry === 'picture') {
      if (m.src) add('addImage', { [/^data:/.test(m.src) ? 'data' : 'path']: m.src, x: X(m.x), y: Y(m.y), w: L(m.w), h: L(m.h), sizing: { type: 'contain', w: L(m.w), h: L(m.h) } });
      if (s.Outline !== '#000000') shape(m, 'rect', { ...s, Fill: 'none' }, [], null);
    } else if (m.geometry === 'legend') {
      shape(m, 'rect', { ...s, Dash: 'solid' }, m.texts, { x: 12, width: m.w - 24 }, 'top', m.title || 'Legend');
      for (const r of m.rows) {
        const sw = r.swatch, box = { x: m.x + r.sw.x, y: m.y + r.sw.y, w: r.sw.w, h: r.sw.h };
        if (sw.kind === 'line') connector([[box.x, box.y + box.h / 2], [box.x + box.w, box.y + box.h / 2]], { ...sw, Arrow: 'none', Connector: 'straight' }, null, r.caption.text);
        else if (sw.kind === 'frame') shape(box, 'rect', { Fill: 'none', Outline: FRAME.stroke, Weight: FRAME.Weight, Dash: 'dashed' }, [], null);
        else shape(sw.Shape === 'triangle' ? { ...box, y: box.y - 1, h: box.h + 2 } : box, sw.Shape ?? 'rect', sw, [], null);
        label([r.caption], m.x + r.caption.lines[0].x, m.y, r.w - r.sw.w - 12);   // as layoutLegend breaks it
      }
    } else if (m.geometry !== 'group') {
      const geometry = m.geometry === 'text' || m.geometry === 'frame' ? 'rect' : m.geometry;
      shape(m, geometry, s, m.texts, m.column, m.geometry === 'text' || m.geometry === 'frame' ? 'top' : 'middle');
    }
  }
  return lines;
}

// Shapes' XML as one PowerPoint group, framed round them all (rects in inches on the slide).
function grouped(id, name, xmls, rects) {
  const E = v => Math.round(v * 914400), x = E(Math.min(...rects.map(r => r.x))), y = E(Math.min(...rects.map(r => r.y)));
  const w = E(Math.max(...rects.map(r => r.x + r.w))) - x, h = E(Math.max(...rects.map(r => r.y + r.h))) - y;
  return `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="${id}" name="${esc(name || 'Line')}"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>`
    + `<p:grpSpPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/><a:chOff x="${x}" y="${y}"/><a:chExt cx="${w}" cy="${h}"/></a:xfrm></p:grpSpPr>${xmls.join('')}</p:grpSp>`;
}

// A route as PowerPoint's connector: straight, or an elbow of one to four legs (bentConnector3 for one or
// three, 2 and 4 for two and four), its legs set by the adjustments, so it stays square when what it joins is
// moved; a route no connector draws is a freeform. An elbow whose first leg is upright is one whose first leg
// runs across, turned a quarter.
function cxn(id, name, ps, s, ends, { X, Y, k }) {
  const E = ([x, y]) => [Math.round(X(x) * 914400), Math.round(Y(y) * 914400)], q = ps.map(E);
  const [x0, y0] = q[0], [x1, y1] = q.at(-1), dx = x1 - x0, dy = y1 - y0, legs = q.length - 1;
  const elbow = s.Connector === 'elbow' && (legs > 1 || !dx || !dy), upright = legs > 1 ? q[1][0] === x0 : elbow && !dx;
  const square = legs === 1 || q.slice(1).every((p, i) => (i % 2 === 0) === upright ? p[0] === q[i][0] : p[1] === q[i][1]);
  const ln = none(s.Outline) ? '<a:ln><a:noFill/></a:ln>' : `<a:ln w="${Math.round(s.Weight * k * 12700)}" cap="${s.Dash === 'dotted' ? 'rnd' : 'flat'}"><a:solidFill><a:srgbClr val="${hex(s.Outline)}"/></a:solidFill>`
    + `<a:prstDash val="${DASH[s.Dash] ?? 'solid'}"/><a:miter lim="800000"/>${['start', 'both'].includes(s.Arrow) ? '<a:headEnd type="triangle" w="lg" len="lg"/>' : ''}${['end', 'both'].includes(s.Arrow) ? '<a:tailEnd type="triangle" w="lg" len="lg"/>' : ''}</a:ln>`;
  const nv = (tag, inner) => `<p:nv${tag}Pr><p:cNvPr id="${id}" name="${esc(name || 'Line')}"/><p:cNv${tag}Pr>${inner}</p:cNv${tag}Pr><p:nvPr/></p:nv${tag}Pr>`;
  if (legs > 4 || !square || (legs > 1 && (!dx || !dy)) || (!dx && !dy)) {
    const x = Math.min(...q.map(p => p[0])), y = Math.min(...q.map(p => p[1])), w = Math.max(...q.map(p => p[0])) - x, h = Math.max(...q.map(p => p[1])) - y;
    const pt = ([px, py]) => `<a:pt x="${px - x}" y="${py - y}"/>`;
    return `<p:sp>${nv('Sp', '')}<p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/>`
      + `<a:rect l="0" t="0" r="r" b="b"/><a:pathLst><a:path w="${w}" h="${h}" fill="none"><a:moveTo>${pt(q[0])}</a:moveTo>${q.slice(1).map(p => `<a:lnTo>${pt(p)}</a:lnTo>`).join('')}</a:path></a:pathLst></a:custGeom><a:noFill/>${ln}</p:spPr></p:sp>`;
  }
  const W = Math.abs(upright ? dy : dx), H = Math.abs(upright ? dx : dy);
  const flipH = upright ? dy < 0 : dx < 0, flipV = upright ? dx > 0 : dy < 0;
  const along = [p => upright ? (p[1] - y0) / dy : (p[0] - x0) / dx, p => upright ? (p[0] - x0) / dx : (p[1] - y0) / dy];
  const adj = legs === 3 ? [along[0](q[1])] : legs === 4 ? [along[0](q[1]), along[1](q[2])] : legs === 1 && elbow ? [0.5] : [];
  const prst = legs > 1 ? `bentConnector${legs}` : elbow ? 'bentConnector3' : 'straightConnector1';
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const glue = (tag, e) => e ? `<a:${tag} id="${e.id}" idx="${e.idx}"/>` : '';
  return `<p:cxnSp>${nv('CxnSp', glue('stCxn', ends?.[0]) + glue('endCxn', ends?.[1]))}<p:spPr>`
    + `<a:xfrm${upright ? ' rot="5400000"' : ''}${flipH ? ' flipH="1"' : ''}${flipV ? ' flipV="1"' : ''}><a:off x="${Math.round(cx - W / 2)}" y="${Math.round(cy - H / 2)}"/><a:ext cx="${W}" cy="${H}"/></a:xfrm>`
    + `<a:prstGeom prst="${prst}"><a:avLst>${adj.map((a, i) => `<a:gd name="adj${i + 1}" fmla="val ${Math.round(a * 100000)}"/>`).join('')}</a:avLst></a:prstGeom>${ln}</p:spPr></p:cxnSp>`;
}

// ---- Writing a file ----

const fileName = (...parts) => parts.filter(Boolean).join(' - ').replace(/[\\/:*?"<>|]+/g, '').trim() || 'Chart';
async function write(format, scenes, name, author = '') {
  const blob = format === 'pdf' ? await pdf(scenes, name) : await pptx(scenes, name, author);
  save(blob, `${fileName(name)}.${format}`);
  return blob;
}

// ---- The calendar ----

// Every date in the chart as worked out, one all-day event each: what it's the date of, and why it falls
// where it does, the ground on one line. An address, which ends what it's in (a name, or a part of the
// ground), is given by its file's name alone.
function calendar(R, N, chart, name, stamp = new Date()) {
  const st = R.records;
  const plain = s => String(s).split(' · ').map(p => p.replace(/(?:[a-z][a-z0-9+.-]*:\/\/|\\\\|\b[a-z]:\\).*$/i, a => Tree.linkOf(a).short)).join(' · ');
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
  const now = stamp.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const events = Object.entries(st).filter(([, r]) => r.field === 'date' && /^\d{4}-\d\d-\d\d$/.test(r.value)).sort((a, b) => a[1].value < b[1].value ? -1 : 1).map(([id, r]) => {
    // What it's the date of, then whose, in full: Annual Tax Due 2025 · Calder Ridge Capital Partners III
    // AIV-1, L.P. Of a relation, whose is its first side, and its others, by their short names, say which;
    // its name leads where the date's own label doesn't say it.
    const path = Tree.pathOf(st, id), full = x => N.nameOf(st, Tree.objectOf(st, x));
    let what = path.slice(1).map(x => N.segmentOf(st, x)).join(' › '), whose = full(path[0]), which = [];
    if (!Tree.isObject(st[path[0]])) {
      const [first, ...rest] = N.sides(st, path[0]), name = N.nameOf(st, path[0]);
      whose = full(first.at);
      which = rest.map(a => plain(N.shortOf(st, Tree.objectOf(st, a.at))));
      if (!Tree.norm(what).includes(Tree.norm(name))) what = `${name} ${what}`;
    }
    const why = r.computed ? plain(Formulas.groundText(R, id)) : '';
    return ['BEGIN:VEVENT', `UID:${chart}.${id}@dendra`, `DTSTAMP:${now}`, `DTSTART;VALUE=DATE:${day(r.value)}`, `DTEND;VALUE=DATE:${next(r.value)}`,
      `SUMMARY:${text(`${[what, which.join(', ')].filter(Boolean).join(' ')} · ${plain(whose)}`)}`, ...(why ? [`DESCRIPTION:${text(why)}`] : []), 'TRANSP:TRANSPARENT', 'END:VEVENT'];
  });
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Dendra//Dendra//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${text(name)}`, ...events.flat(), 'END:VCALENDAR'];
  const blob = new Blob([ics.map(fold).join('\r\n') + '\r\n'], { type: 'text/calendar' });
  save(blob, `${fileName(name)}.ics`);
  return blob;
}

const api = { write, svg, calendar, onFile: null };

// ---- In the window: the Export menu, and its dialog ----

if (typeof Shell !== 'undefined' && typeof App !== 'undefined') {
  const { html } = Shell, { useState } = preactHooks;
  // The chart views, in tab order, each as its scene is now: the one shown is App's.
  const views = () => App.views.peek().filter(v => v.layout === 'chart').map(v => ({
    ...(App.scene.peek()?.view === v.id ? App.scene.peek() : Scene.of(App.shown.peek(), App.chart.peek(), v.id, App.day.peek(), { state: App.state.peek(), computed: App.computed.peek() })),
    name: v.name }));
  const chartName = () => App.shown.peek().charts().find(c => c.chart === App.chart.peek())?.name ?? 'Chart';
  const uri = s => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(s)}`;
  // The pages the file will have: a deck's on its one slide size, a document's each its own.
  const sheets = (format, scenes) => {
    const frame = { w: Math.max(...scenes.map(s => s.page.sheet.w)), h: Math.max(...scenes.map(s => s.page.sheet.h)) };
    return scenes.map(s => ({ name: s.name, src: uri(svg(s, format === 'pdf' ? { pdf: true } : { frame })) }));
  };
  // What's exported, and the file's pages, each fitted to the well; a click shows one at full size.
  function Choice({ choice, scenes, here }) {
    const [format, setFormat] = useState(choice.format), [which, setWhich] = useState(choice.which), [full, setFull] = useState(null);
    Object.assign(choice, { format, which });
    const pages = sheets(format, which === 'all' ? scenes : [here]), one = pages[full] ?? null;
    return html`<div class="ex">
      <div class="ex-pick">
        <select aria-label="Format" value=${format} onChange=${e => { setFull(null); setFormat(e.target.value); }}><option value="pptx">PowerPoint</option><option value="pdf">PDF</option></select>
        <select aria-label="Views" value=${which} onChange=${e => { setFull(null); setWhich(e.target.value); }} disabled=${scenes.length < 2}>
          <option value="this">${here.name}</option><option value="all">Every view</option></select>
      </div>
      <div class=${'ex-well' + (one ? ' full' : '')}>
        ${(one ? [one] : pages).map((pg, i) => html`<figure class="ex-page" key=${pg.name}>
          <button type="button" aria-label=${pg.name} aria-pressed=${!!one} onClick=${() => setFull(one ? null : i)}><img src=${pg.src} alt="" /></button>
          ${pages.length > 1 && !one ? html`<figcaption>${pg.name}</figcaption>` : null}</figure>`)}
      </div>
    </div>`;
  }
  async function open(format) {
    const scenes = views();
    if (!scenes.length) return;
    const here = scenes.find(s => s.view === Shell.view.peek()) ?? scenes[0], choice = { format, which: 'this' };
    const go = await Shell.dialog({ title: 'Export', width: 720, body: () => html`<${Choice} choice=${choice} scenes=${scenes} here=${here} />`,
      actions: [{ label: 'Cancel', value: false }, { label: 'Export', value: true, primary: true }] });
    if (!go) return;
    const all = choice.which === 'all';
    write(choice.format, all ? scenes : [here], all ? chartName() : fileName(chartName(), here.name), App.who())
      .catch(e => Shell.toast(e?.message || 'Couldn’t export'));
  }
  Shell.register('export', { name: 'PowerPoint…', run: () => open('pptx') });
  Shell.register('export', { name: 'PDF…', run: () => open('pdf') });
  Shell.register('export', { name: 'Calendar (.ics)', run: () => calendar(App.computed.peek(), App.notes.peek(), App.chart.peek(), chartName()) });
}

return api;
})();
