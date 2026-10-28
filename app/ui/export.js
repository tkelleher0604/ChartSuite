// Exports (dendra.md, Views): a view as a PowerPoint slide or a PDF page, every view as a deck or a document
// in tab order, and the chart's dates as a calendar for Outlook. The scene is all either draws.
// - Each page is drawn on its sheet, a 13.33 × 7.5 in slide unless its Page says otherwise, or the paper the
//   Export dialog names (Letter, say), for which the scene is drawn (Scene.of's paper), smaller by the page's
//   scale, and every size with it: a text's points are the points it has on the sheet.
// - PowerPoint: a box is a shape of the same preset geometry, holding its texts in the same fonts on the
//   scene's lines; a line is a connector glued to its boxes, grouped with its label so the two move together
//   and named as the two-box panel says its relation, solid where another crosses it, as PowerPoint draws a
//   crossing (the canvas and the PDF hop); lines said as one, a line to a frame or a trunk's lines under one
//   label, one group named for them all, a frame's by its caption (each of the Funds); a frame its outline and
//   caption, grouped, behind its members; the legend one group, a swatch and caption for each row, named for it;
//   the title the slide's title; free shapes shapes like any other. A line's alt text is its name with the
//   values its label says, as the formula bar says a fact (with a percentage of 50%). A deck's slides share one
//   size, the smallest that holds every sheet, each in the middle of its slide.
// - PDF: the scene as SVG, through svg2pdf.js, in the PDF's standard fonts (Helvetica has Arial's widths,
//   Times Times New Roman's), compressed, in US English. Each page is its sheet, bookmarked by its title. It
//   declares only the fonts it uses, and embeds none: the only sans vendored, IBM Plex, hasn't Arial's widths, so
//   the lines wouldn't fall where the scene sets them.
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
// parts: a table's CSV), and → the file once it's written.
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
const lh = t => Scene.lineHeight(t);
const top = it => it.lines[0].y - Scene.baseline(it.look);
const block = items => ({ top: top(items[0]), bottom: top(items[0]) + items.reduce((h, it) => h + it.lines.length * lh(it.look), 0) });
// How much of a line lies before its x, by its alignment.
const BEFORE = { left: 0, center: 0.5, right: 1 };

// ---- Reading order ----

// A page's marks as it's read: its title, its date, then the rest as the scene draws them. Nothing overlaps
// the title or the date, so where they stand in the drawing's order doesn't show.
const reading = marks => { const first = ['title', 'date'].flatMap(role => marks.filter(m => m.role === role)); return [...first, ...marks.filter(m => !first.includes(m))]; };

// ---- SVG: the PDF, and the preview ----

const ANCHOR = { left: 'start', center: 'middle', right: 'end' };
// The PDF's standard font for a font: Helvetica for a sans serif, Times for a serif, Courier for a monospace (see
// Scene's FONTS), in the weight and slant asked; and how wide it sets a line at a size, by jsPDF's own metrics.
const STANDARD = f => ({ sans: 'helvetica', serif: 'times', mono: 'courier' })[Scene.fontClass(f)];
let metrics = null;
function standardWidth(t, text, size) {
  if (!window.jspdf) return 0;
  metrics ??= new window.jspdf.jsPDF({ unit: 'pt' });
  metrics.setFont(STANDARD(t.Font), t.Bold && t.Italic ? 'bolditalic' : t.Bold ? 'bold' : t.Italic ? 'italic' : 'normal');
  return metrics.getStringUnitWidth(text) * size;
}
const stroke = (s, w = s.Weight) => none(s.Outline) ? 'stroke="none"'
  : `stroke="${s.Outline}" stroke-width="${n(w * PT)}"${Scene.dash(s.Dash, w) ? ` stroke-dasharray="${Scene.dash(s.Dash, w)}"` : ''}${s.Dash === 'dotted' ? ' stroke-linecap="round"' : ''}`;
const g = (x, y, inner) => `<g transform="translate(${n(x)} ${n(y)})">${inner}</g>`;
// A body as the canvas draws it: its shape and corners, its fill as transparent as its Transparency, its outline;
// and under it its Shadow, which a PDF can't blur, so it's drawn in layers, each a little smaller and as faint: 3 pt
// below and right, 4 pt soft at its edge, 40% black at its heart, as PowerPoint's is, at the sheet's size (`at`, the
// page's scale, as the scene drawn sets it).
let at = 1;
function body(shape, w, h, s) {
  const d = Scene.path(shape, w, h, s.Corner), clear = Math.min(100, Math.max(0, s.Transparency ?? 0)), off = 3 * PT * Math.SQRT1_2 / at, soft = 4 * PT / at;
  const shade = s.Shadow !== 'soft' ? '' : g(off, off, [1, 2 / 3, 1 / 3, 0].map(k => `<path d="${d}" fill="#000000" fill-opacity="0.1"`
    + (k ? ` stroke="#000000" stroke-opacity="0.1" stroke-width="${n(soft * k)}" stroke-linejoin="round"` : '') + '/>').join(''));
  return `${shade}<path d="${d}" fill="${none(s.Fill) ? 'none' : s.Fill}"${clear && !none(s.Fill) ? ` fill-opacity="${n(1 - clear / 100)}"` : ''} ${stroke(s)} stroke-linejoin="miter"/>`;
}
// Each line of the texts where the scene put it; an underline and a strikethrough as rules, which every reader draws
// alike. In a PDF, a line its standard font sets wider than the scene sets it is condensed to the scene's width,
// scaled across as jsPDF scales text, so no text ever leaves its box.
function texts(items, pdf) {
  return items.map(it => {
    const t = it.look, size = t.Size * PT, anchor = ANCHOR[t.Align] ?? 'middle';
    const font = `font-family="${esc(pdf ? STANDARD(t.Font) : Scene.fontFamily(t.Font))}" font-size="${n(size)}" font-weight="${t.Bold ? 'bold' : 'normal'}" font-style="${t.Italic ? 'italic' : 'normal'}"`;
    const rule = (l, y, h) => `<rect x="${n(l.x - l.w * { start: 0, middle: 0.5, end: 1 }[anchor])}" y="${n(y)}" width="${n(l.w)}" height="${n(h)}" fill="${t.Color}"/>`;
    return it.lines.map(l => {
      const wide = pdf ? standardWidth(t, l.text, size) : 0, k = l.w > 0 && wide > l.w + 0.01 ? l.w / wide : 1;
      return `<text x="${n(l.x)}" y="${n(l.y)}" text-anchor="${anchor}" ${font} fill="${t.Color}"${k < 1 ? ` transform="matrix(${+k.toFixed(4)} 0 0 1 ${n(l.x * (1 - k))} 0)"` : ''}>${esc(l.text)}</text>`
        + (t.Underline ? rule(l, l.y + size * 0.106, size * 0.073) : '') + (t.Strike ? rule(l, l.y - size * 0.3, size * 0.073) : '');
    }).join('');
  }).join('');
}
// A route, in its runs where another line breaks it, with an arrowhead at an end as the canvas draws one (X6's
// block marker).
function route(points, s, runs = [points]) {
  const out = [`<path d="${runs.map(r => `M${r.map(p => `${n(p[0])},${n(p[1])}`).join(' L')}`).join(' ')}" fill="none" ${stroke(s)} stroke-linejoin="miter"/>`];
  const w = s.Weight * PT, len = 5 + w * 3, half = (4 + w * 2.4) / 2;
  const head = ([x, y], [px, py]) => {
    const d = Math.hypot(x - px, y - py) || 1, ux = (x - px) / d, uy = (y - py) / d, bx = x - ux * len, by = y - uy * len;
    return `<path d="M${n(x)},${n(y)} L${n(bx - uy * half)},${n(by + ux * half)} L${n(bx + uy * half)},${n(by - ux * half)} Z" fill="${s.Outline}"/>`;
  };
  if (!none(s.Outline) && (s.Arrow === 'end' || s.Arrow === 'both')) out.push(head(points.at(-1), points.at(-2)));
  if (!none(s.Outline) && (s.Arrow === 'start' || s.Arrow === 'both')) out.push(head(points[0], points[1]));
  return out.join('');
}
const FRAME = { stroke: '#595959' };
const frameDash = kind => kind === 'solid' || kind === 'bracket' ? 'solid' : kind === 'dotted' ? 'dotted' : 'dashed';
const bracket = (w, h) => `M0.5,${n(h)} V${n(h - 5)} H${n(w - 0.5)} V${n(h)}`;
function swatch(sw, { x, y, w, h }) {
  if (sw.kind === 'line') return route([[x, y + h / 2], [x + w, y + h / 2]], { ...sw, Arrow: 'none' });
  if (sw.kind === 'frame') return g(x, y, body('rect', w, h, { Fill: 'none', Outline: FRAME.stroke, Weight: sw.Weight, Dash: 'dashed' }));
  const t = sw.Shape === 'triangle';
  return g(x, t ? y - 1 : y, body(sw.Shape ?? 'rect', w, t ? h + 2 : h, sw));
}
function markSvg(m, pdf) {
  const s = look(m);
  if (m.type === 'box') return g(m.x, m.y, body(m.shape, m.w, m.h, s) + texts(m.texts, pdf));
  if (m.type === 'line') return route(m.points, s, m.runs) + (m.labelAt && m.texts.length ? g(m.labelAt.x, m.labelAt.y, texts(m.texts, pdf)) : '');
  if (m.type === 'frame') return g(m.x, m.y, (m.lone ? '' : `<path d="${m.kind === 'bracket' ? bracket(m.w, m.h) : Scene.path('rect', m.w, m.h)}" fill="none" ${stroke({ Outline: FRAME.stroke, Dash: frameDash(m.kind) }, look(m).Weight)}/>`) + texts([m.caption], pdf));
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
// The papers a page can be drawn on, by the names the dialog gives them.
const PAPERS = { slide: 'Slide 16:9', letter: 'Letter', legal: 'Legal', tabloid: 'Tabloid', a4: 'A4', a3: 'A3' };
// The scene as SVG, in its own pixels, on white; with `frame` (a sheet's size, in the sheet's pixels), in the
// middle of a larger sheet, as a deck's slides hold a smaller one.
function svg(scene, { pdf = false, frame = scene.page.sheet } = {}) {
  const { w, h } = scene.page, k = fit(scene.page), fw = frame.w / k, fh = frame.h / k, x = (w - fw) / 2, y = (h - fh) / 2;
  at = scene.page.scale ?? 1;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n(fw)}" height="${n(fh)}" viewBox="${n(x)} ${n(y)} ${n(fw)} ${n(fh)}">`
    + `<rect x="${n(x)}" y="${n(y)}" width="${n(fw)}" height="${n(fh)}" fill="#ffffff"/>${reading(scene.marks).map(m => markSvg(m, pdf)).join('')}</svg>`;
}

// A page's title, as its title shape says it; else its view's name.
const titleOf = s => s.marks.find(m => m.role === 'title')?.texts.map(it => it.text).join(' ').replace(/\s+/g, ' ').trim() || s.name || '';
// A PDF text string: as it is where it's Latin-1, else UTF-16 and marked so, as a title with a curly quote needs.
const pdfText = s => /^[\x20-\x7e\xa0-\xff]*$/.test(s) ? s : `\xfe\xff${Array.from({ length: s.length }, (_, i) => String.fromCharCode(s.charCodeAt(i) >> 8, s.charCodeAt(i) & 255)).join('')}`;
async function pdf(scenes, title, author) {
  await LIBS.pdf();
  let doc;
  const holder = Object.assign(document.createElement('div'), { style: 'position:fixed;left:-10000px;top:0;width:0;height:0;overflow:hidden' });
  document.body.append(holder);
  try {
    for (const s of scenes) {
      const w = s.page.sheet.w * 0.75, h = s.page.sheet.h * 0.75, o = w > h ? 'l' : 'p';
      if (!doc) doc = new window.jspdf.jsPDF({ unit: 'pt', format: [w, h], orientation: o, compress: true, putOnlyUsedFonts: true });
      else doc.addPage([w, h], o);
      holder.innerHTML = svg(s, { pdf: true });
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

const PRESET = { rect: 'rect', rounded: 'roundRect', oval: 'ellipse', triangle: 'triangle', diamond: 'diamond', hexagon: 'hexagon', octagon: 'octagon',
  parallelogram: 'parallelogram', trapezoid: 'trapezoid', pentagon: 'pentagon', chevron: 'chevron', arrow: 'rightArrow', cylinder: 'can' };
// Each preset's connection sites facing up, left, down and right, as PowerPoint numbers them; where a side
// has two, the first is the nearer its start.
const SITES = { rect: [0, 1, 2, 3], rounded: [0, 1, 2, 3], diamond: [0, 1, 2, 3], oval: [0, 2, 4, 6], triangle: [0, 1, 3, 5],
  hexagon: [[4, 5], 3, [2, 1], 0], octagon: [[6, 7], [5, 4], [3, 2], [0, 1]], parallelogram: [0, 5, 4, 2], trapezoid: [0, 1, 2, 3],
  pentagon: [0, 1, 3, 5], chevron: [0, 1, 2, 3], arrow: [0, 1, 2, 3], cylinder: [1, 2, 3, 4] };
const DASH = { solid: 'solid', dashed: 'dash', dotted: 'sysDot' };
const ALIGN = { left: 'l', center: 'ctr', right: 'r' };
// The page's own texts, by the names PowerPoint's Selection Pane gives them; any other shape, as a box is, by
// what it says.
const ROLE = { title: 'Title', date: 'Date' };
// A shape's name, and with `descr` its alt text.
const cNvPr = (id, name, descr) => `<p:cNvPr id="${id}" name="${esc(name)}"${descr ? ` descr="${esc(descr)}"` : ''}/>`;
const E = v => Math.round(v * 914400);                 // inches as EMU

// A deck: a slide for each scene, each written in its XML where PptxGenJS can't write it as PowerPoint does
// (see slide). The slides' layout is PowerPoint's Title Only, its title where the first slide's is and in its
// look, and the file's properties are what PowerPoint would write: no subject, and the fonts and titles the
// slides hold. `say(relations, caption, entries?)` names lines' relations as one, and with `entries` says those
// at them too (see sentence).
async function pptx(scenes, title, author, say) {
  await LIBS.pptx();
  const p = new PptxGenJS();
  // One size for every slide, the smallest that holds every sheet.
  const W = Math.max(...scenes.map(s => s.page.sheet.w)), H = Math.max(...scenes.map(s => s.page.sheet.h));
  p.defineLayout({ name: 'Dendra', width: W / 96, height: H / 96 });
  p.layout = 'Dendra';
  p.theme = { headFontFace: 'Arial', bodyFontFace: 'Arial' };
  Object.assign(p, { title, subject: '', author, company: '' });
  const finish = scenes.map(s => { const k = fit(s.page); return slide(p, s, { k, ox: (W - s.page.w * k) / 2, oy: (H - s.page.h * k) / 2 }, say); });
  const zip = await JSZip.loadAsync(await p.write({ outputType: 'arraybuffer' }));
  const edit = async (f, change) => zip.file(f, change(await zip.file(f).async('string')));
  const slides = await Promise.all(finish.map((done, i) => zip.file(`ppt/slides/slide${i + 1}.xml`).async('string').then(done)));
  slides.forEach((x, i) => zip.file(`ppt/slides/slide${i + 1}.xml`, x));
  // Type kerned at every size, as the scene measures it, so each line is as wide as the scene sets it:
  // PowerPoint's own default kerns only from 12 pt.
  for (const f of ['ppt/presentation.xml', 'ppt/slideMasters/slideMaster1.xml']) await edit(f, x => x.replaceAll('kern="1200"', 'kern="100"'));
  const titles = slides.map(x => TITLE.exec(x)?.[0]), first = titles.find(Boolean);
  await edit('ppt/slideLayouts/slideLayout1.xml', x => x.replace('<p:cSld name="DEFAULT">', `<p:cSld name="${first ? 'Title Only' : 'Blank'}">`)
    .replace('</p:grpSpPr></p:spTree>', `</p:grpSpPr>${first ? layoutTitle(first) : ''}</p:spTree>`));
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
  const parts = [['Fonts Used', [...new Set(slides.flatMap(x => [...x.matchAll(/<a:latin typeface="([^"]*)"/g)].map(m => m[1])))]], ['Theme', ['Office Theme']],
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
// Texts as PowerPoint holds them, in a shape anchored at `anchor`: each line where the scene breaks it, so that
// PowerPoint never wraps it again; in its look at its size on the slide (k times its page's, and at least 1 pt,
// the least PowerPoint opens), its lines as far apart as the scene sets them, and in as far as it hangs them; a
// paragraph for each line it was typed on; its spaces plain, as typed, so that PowerPoint's Find finds them. Its margins are `inset` inches
// all round, or PowerPoint's own where that's null.
function txBody(items, k, anchor, inset) {
  const ps = items.flatMap(it => {
    const t = it.look, sz = Math.max(100, Math.round(t.Size * k * 100)), font = esc(t.Font);
    const rPr = `<a:rPr lang="en-US" sz="${sz}"${t.Bold ? ' b="1"' : ''}${t.Italic ? ' i="1"' : ''}${t.Underline ? ' u="sng"' : ''}${t.Strike ? ' strike="sngStrike"' : ''} dirty="0">`
      + `<a:solidFill><a:srgbClr val="${hex(t.Color)}"/></a:solidFill><a:latin typeface="${font}"/><a:cs typeface="${font}"/></a:rPr>`;
    const hang = it.hang ? ` marL="${E(it.hang * k / 96)}" indent="${-E(it.hang * k / 96)}"` : '';
    return typed(it).map(ls => `<a:p><a:pPr algn="${ALIGN[t.Align] ?? 'ctr'}"${hang}><a:lnSpc><a:spcPts val="${Math.round(t.Size * 1.2 * (t.Spacing ?? 1) * k * 100)}"/></a:lnSpc></a:pPr>`
      + ls.map(l => `<a:r>${rPr}<a:t>${esc(l.text.replace(/ /g, ' '))}</a:t></a:r>`).join(`<a:br>${rPr}</a:br>`) + `<a:endParaRPr lang="en-US" sz="${sz}" dirty="0"/></a:p>`);
  });
  const margins = inset === null ? '' : ['l', 't', 'r', 'b'].map(side => ` ${side}Ins="${E(inset)}"`).join('');
  return `<p:txBody><a:bodyPr${ps.length ? ' wrap="none"' : ''}${margins} rtlCol="0" anchor="${anchor}"/><a:lstStyle/>${ps.join('') || '<a:p><a:endParaRPr lang="en-US" dirty="0"/></a:p>'}</p:txBody>`;
}
const xfrm = (x, y, w, h, turn = '') => `<a:xfrm${turn}><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm>`;
// A color, as transparent as `clear` (0–100) says.
const paint = (c, clear = 0) => none(c) ? '<a:noFill/>'
  : `<a:solidFill><a:srgbClr val="${hex(c)}"${clear > 0 ? `><a:alpha val="${Math.round((100 - Math.min(100, clear)) * 1000)}"/></a:srgbClr>` : '/>'}</a:solidFill>`;
// PowerPoint's soft outer shadow (its preset Offset: Bottom Right): 3 pt below and right, 4 pt blur, black at 40%.
const SHADOW = '<a:effectLst><a:outerShdw blurRad="50800" dist="38100" dir="2700000" algn="tl" rotWithShape="0"><a:prstClr val="black"><a:alpha val="40000"/></a:prstClr></a:outerShdw></a:effectLst>';
// The anchor of a box's text, by its Valign.
const VALIGN = { top: 't', middle: 'ctr', bottom: 'b' };
// An outline at its weight on the slide (k times its page's), and its arrowheads.
const ln = (s, k, heads = '') => none(s.Outline) ? '<a:ln><a:noFill/></a:ln>'
  : `<a:ln w="${Math.round(s.Weight * k * 12700)}" cap="${s.Dash === 'dotted' ? 'rnd' : 'flat'}">${paint(s.Outline)}<a:prstDash val="${DASH[s.Dash] ?? 'solid'}"/><a:miter lim="800000"/>${heads}</a:ln>`;
// A path through points q, in EMU within w × h.
const freeform = (q, w, h) => `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="r" b="b"/><a:pathLst><a:path w="${w}" h="${h}" fill="none">`
  + q.map(([x, y], i) => `<a:${i ? 'lnTo' : 'moveTo'}><a:pt x="${x}" y="${y}"/></a:${i ? 'lnTo' : 'moveTo'}>`).join('') + '</a:path></a:pathLst></a:custGeom>';
// A shape as PowerPoint writes one, in r (inches on the slide): of a preset geometry, or a path through points
// (inches within r); a text box (`box`), or the slide's title placeholder (`title`); holding `body`.
function sp(id, name, r, geometry, s, k, body, { box = false, title = false } = {}) {
  const nv = title ? '<p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="title"/></p:nvPr>' : `<p:cNvSpPr${box ? ' txBox="1"' : ''}/><p:nvPr/>`;
  // A rounded rectangle's corners, PowerPoint's adjustment of it: their radius in thousandths of its shorter side.
  const adj = geometry === 'rounded' ? `<a:gd name="adj" fmla="val ${Math.round(Math.min(50, Math.max(0, s.Corner ?? Scene.CORNER)) * 1000)}"/>` : '';
  const geom = Array.isArray(geometry) ? freeform(geometry.map(([x, y]) => [E(x), E(y)]), E(r.w), E(r.h)) : `<a:prstGeom prst="${PRESET[geometry] ?? 'rect'}">${adj ? `<a:avLst>${adj}</a:avLst>` : '<a:avLst/>'}</a:prstGeom>`;
  return `<p:sp><p:nvSpPr>${cNvPr(id, name)}${nv}</p:nvSpPr><p:spPr>${xfrm(E(r.x), E(r.y), E(r.w), E(r.h))}${geom}${paint(s.Fill, s.Transparency)}${'Outline' in s ? ln(s, k) : ''}${s.Shadow === 'soft' ? SHADOW : ''}</p:spPr>${body}</p:sp>`;
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
function slide(p, scene, { k, ox, oy }, say) {
  const sl = p.addSlide(), parts = [], ids = new Map();
  let count = 0;
  const X = x => (ox + x * k) / 96, Y = y => (oy + y * k) / 96, L = v => v * k / 96, rect = m => ({ x: X(m.x), y: Y(m.y), w: L(m.w), h: L(m.h) });
  const CHART = 0.1 * k, PAGE = null;
  const add = (kind, ...args) => { sl[kind](...args); return 2 + count++; };
  // A stand-in for what `write` writes once it has its number. → that number.
  const put = write => add('addShape', 'rect', { x: 0, y: 0, w: 0, h: 0, objectName: `·${parts.push(write) - 1}·` });
  const shape = (r, geometry, s, name, { items = [], anchor = 'ctr', inset = PAGE, box, title } = {}) =>
    put(id => sp(id, name, r, geometry, s, k, txBody(items, k, anchor, inset), { box, title }));
  // Texts on their own, their lines placed from (x0, y0): a text box at the side they're aligned to, from
  // their first line's top, its margins round them. → its rect.
  const textBox = (items, x0, y0, inset) => {
    const first = items[0], w = Math.max(...items.flatMap(it => it.lines.map(l => l.w))), { top, bottom } = block(items), [mx, my] = inset === PAGE ? [0.1, 0.05] : [inset, inset];
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
  const connector = (points, s, ends, name, { label = null, alt } = {}) => {
    const draw = () => {
      put(id => cxn(id, name, points, s, ends?.map((b, i) => glue(scene.byId.get(b), points, i)), { X, Y, k, alt: label ? null : alt }));
      return [...points.map(([x, y]) => ({ x: X(x), y: Y(y), w: 0, h: 0 })), ...(label ? [textBox(label[0], label[1].x, label[1].y, CHART)] : [])];
    };
    return label ? group(name, draw, alt) : draw();
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

  const fellows = together(scene), done = new Set();
  for (const m of reading(scene.marks)) {
    const s = look(m);
    if (m.type === 'box') ids.set(m.id, shape(rect(m), m.shape, s, m.texts[0]?.text ?? 'Shape', { items: m.texts, anchor: m.shape === 'triangle' ? 'b' : VALIGN[s.Valign] ?? 'ctr', inset: CHART }));
    else if (m.type === 'line') {
      // Lines said as one are one group, named for them all and described so, each line in it named for its own
      // relation; a line alone is named for its relation. Each is described with what its label says.
      if (done.has(m.id)) continue;
      const ls = fellows.get(m.id), drawn = ls.filter(l => !l.merged), lab = drawn.find(l => l.labelAt && l.texts.length), label = lab ? [lab.texts, lab.labelAt] : null;
      drawn.forEach(l => done.add(l.id));
      const rels = ls.map(l => l.record), caption = scene.byId.get(m.landed)?.caption.text, said = say(rels, caption), name = said ?? (lab ?? m).texts[0]?.text ?? 'Line';
      const alt = said && say(rels, caption, ls.flatMap(l => l.texts.map(it => it.id)));
      const line = (l, name, more) => connector(l.points, look(l), [l.from, l.to], name, more);
      if (drawn.length === 1) line(m, name, { label, alt });
      else group(name, () => [...drawn.flatMap(l => line(l, say([l.record]) ?? name)), ...(label ? [textBox(label[0], label[1].x, label[1].y, CHART)] : [])], alt);
    }
    else if (m.type === 'frame') {
      // Its outline, a rectangle or a bracket, and its caption; round one box alone, its caption alone.
      const caption = () => textBox([m.caption], m.x, m.y, CHART);
      if (m.lone) caption();
      else group(m.caption.text, () => {
        const outline = { Outline: FRAME.stroke, Weight: s.Weight, Dash: frameDash(m.kind), Fill: 'none' };
        shape(rect(m), m.kind === 'bracket' ? [[0.5, m.h], [0.5, m.h - 5], [m.w - 0.5, m.h - 5], [m.w - 0.5, m.h]].map(([x, y]) => [L(x), L(y)]) : 'rect', outline, m.caption.text);
        return [rect(m), caption()];
      });
    } else if (m.geometry === 'line') connector(m.points, s, m.ends ?? null, 'Line');
    else if (m.geometry === 'picture') {
      if (m.src) add('addImage', { [/^data:/.test(m.src) ? 'data' : 'path']: m.src, x: X(m.x), y: Y(m.y), w: L(m.w), h: L(m.h), sizing: { type: 'contain', w: L(m.w), h: L(m.h) } });
      if (s.Outline !== '#000000') shape(rect(m), 'rect', { ...s, Fill: 'none' }, 'Picture');
    } else if (m.geometry === 'legend') group(m.title || 'Legend', () => {
      shape(rect(m), 'rect', { ...s, Dash: 'solid' }, m.title || 'Legend');
      if (m.texts.length) textBox(m.texts, m.x, m.y, PAGE);
      // Each row a swatch and its caption, both named as the row is.
      for (const r of m.rows) {
        const sw = r.swatch, box = { x: m.x + r.sw.x, y: m.y + r.sw.y, w: r.sw.w, h: r.sw.h }, name = r.caption.text;
        if (sw.kind === 'line') connector([[box.x, box.y + box.h / 2], [box.x + box.w, box.y + box.h / 2]], { ...sw, Arrow: 'none', Connector: 'straight' }, null, name);
        else if (sw.kind === 'frame') shape(rect(box), 'rect', { Fill: 'none', Outline: FRAME.stroke, Weight: sw.Weight, Dash: 'dashed' }, name);
        else shape(rect(sw.Shape === 'triangle' ? { ...box, y: box.y - 1, h: box.h + 2 } : box), sw.Shape ?? 'rect', sw, name);
        textBox([r.caption], m.x, m.y, PAGE);
      }
      return [rect(m)];
    });
    else if (m.geometry !== 'group') {
      const text = m.geometry === 'text' || m.geometry === 'frame';
      shape(rect(m), text ? 'rect' : m.geometry, s, ROLE[m.role] ?? m.texts[0]?.text ?? 'Shape',
        { items: m.texts, anchor: VALIGN[s.Valign] ?? (text ? 't' : 'ctr'), box: m.geometry === 'text', title: m.role === 'title' });
    }
  }
  return xml => xml.replace(/<p:sp><p:nvSpPr><p:cNvPr id="(\d+)" name="·(\d+)·">[\s\S]*?<\/p:sp>/g, (_, id, j) => parts[j](+id));
}

// The start of a PowerPoint group, framed round rects (in inches on the slide).
function grouped(id, name, rects, alt) {
  const x = E(Math.min(...rects.map(r => r.x))), y = E(Math.min(...rects.map(r => r.y)));
  const w = E(Math.max(...rects.map(r => r.x + r.w))) - x, h = E(Math.max(...rects.map(r => r.y + r.h))) - y;
  return `<p:grpSp><p:nvGrpSpPr>${cNvPr(id, name || 'Line', alt)}<p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>`
    + `<p:grpSpPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/><a:chOff x="${x}" y="${y}"/><a:chExt cx="${w}" cy="${h}"/></a:xfrm></p:grpSpPr>`;
}

// A route as PowerPoint's connector: straight, or an elbow of one to four legs (bentConnector3 for one or
// three, 2 and 4 for two and four), its legs set by the adjustments, so it stays square when what it joins is
// moved; a route no connector draws is a freeform. An elbow whose first leg is upright is one whose first leg
// runs across, turned a quarter.
function cxn(id, name, ps, s, ends, { X, Y, k, alt }) {
  const q = ps.map(([x, y]) => [E(X(x)), E(Y(y))]);
  const [x0, y0] = q[0], [x1, y1] = q.at(-1), dx = x1 - x0, dy = y1 - y0, legs = q.length - 1;
  const elbow = s.Connector === 'elbow' && (legs > 1 || !dx || !dy), upright = legs > 1 ? q[1][0] === x0 : elbow && !dx;
  const square = legs === 1 || q.slice(1).every((p, i) => (i % 2 === 0) === upright ? p[0] === q[i][0] : p[1] === q[i][1]);
  const line = ln(s, k, `${['start', 'both'].includes(s.Arrow) ? '<a:headEnd type="triangle" w="sm" len="sm"/>' : ''}${['end', 'both'].includes(s.Arrow) ? '<a:tailEnd type="triangle" w="sm" len="sm"/>' : ''}`);
  const nv = (tag, inner) => `<p:nv${tag}Pr>${cNvPr(id, name || 'Line', alt)}<p:cNv${tag}Pr>${inner}</p:cNv${tag}Pr><p:nvPr/></p:nv${tag}Pr>`;
  if (legs > 4 || !square || (legs > 1 && (!dx || !dy)) || (!dx && !dy)) {
    const x = Math.min(...q.map(p => p[0])), y = Math.min(...q.map(p => p[1])), w = Math.max(...q.map(p => p[0])) - x, h = Math.max(...q.map(p => p[1])) - y;
    return `<p:sp>${nv('Sp', '')}<p:spPr>${xfrm(x, y, w, h)}${freeform(q.map(([px, py]) => [px - x, py - y]), w, h)}<a:noFill/>${line}</p:spPr></p:sp>`;
  }
  const W = Math.abs(upright ? dy : dx), H = Math.abs(upright ? dx : dy);
  const flipH = upright ? dy < 0 : dx < 0, flipV = upright ? dx > 0 : dy < 0;
  const along = [p => upright ? (p[1] - y0) / dy : (p[0] - x0) / dx, p => upright ? (p[0] - x0) / dx : (p[1] - y0) / dy];
  const adj = legs === 3 ? [along[0](q[1])] : legs === 4 ? [along[0](q[1]), along[1](q[2])] : legs === 1 && elbow ? [0.5] : [];
  const prst = legs > 1 ? `bentConnector${legs}` : elbow ? 'bentConnector3' : 'straightConnector1';
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const glue = (tag, e) => e ? `<a:${tag} id="${e.id}" idx="${e.idx}"/>` : '';
  return `<p:cxnSp>${nv('CxnSp', glue('stCxn', ends?.[0]) + glue('endCxn', ends?.[1]))}<p:spPr>`
    + xfrm(Math.round(cx - W / 2), Math.round(cy - H / 2), W, H, `${upright ? ' rot="5400000"' : ''}${flipH ? ' flipH="1"' : ''}${flipV ? ' flipV="1"' : ''}`)
    + `<a:prstGeom prst="${prst}"><a:avLst>${adj.map((a, i) => `<a:gd name="adj${i + 1}" fmla="val ${Math.round(a * 100000)}"/>`).join('')}</a:avLst></a:prstGeom>${line}</p:spPr></p:cxnSp>`;
}

// ---- Writing a file ----

const fileName = (...parts) => parts.filter(Boolean).join(' - ').replace(/[\\/:*?"<>|]+/g, '').trim() || 'Chart';
// A file of one page is titled as its page is; of more, by `name`, the chart's.
async function write(format, scenes, name, { author = '', R = null, N = null } = {}) {
  const title = scenes.length === 1 ? titleOf(scenes[0]) || name : name;
  const blob = format === 'pdf' ? await pdf(scenes, title, author) : await pptx(scenes, title, author, (rels, caption, entries) => R && N ? sentence(R.records, N, rels, caption, entries) : null);
  save(blob, `${fileName(name)}.${format}`);
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

const api = { write, svg, calendar, onFile: null };

// ---- In the window: the Export dialog ----

if (typeof Shell !== 'undefined' && typeof App !== 'undefined') {
  const { html } = Shell, { useState, useMemo } = preactHooks;
  const FORMATS = [['pptx', 'PowerPoint'], ['pdf', 'PDF'], ['ics', 'Calendar']];
  const charts = () => App.views.peek().filter(v => v.layout === 'chart');
  const pageOf = v => { const p = App.notes.peek().resolve('Page', { id: v.id, kind: 'View' })?.value; return PAPERS[p] ? p : 'slide'; };
  // The chart views, in tab order, each as its scene is on that paper: the one shown is App's, where it's
  // drawn on it.
  const views = paper => charts().map(v => {
    const shown = App.scene.peek();
    return { ...(shown?.view === v.id && shown.page.size === paper ? shown
      : Scene.of(App.shown.peek(), App.chart.peek(), v.id, App.day.peek(), { state: App.state.peek(), computed: App.computed.peek(), paper })), name: v.name };
  });
  const chartName = () => App.shown.peek().charts().find(c => c.chart === App.chart.peek())?.name ?? 'Chart';
  const uri = s => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(s)}`;
  // The pages the file will have: a deck's on its one slide size, a document's each its own.
  const sheets = (format, scenes) => {
    const frame = { w: Math.max(...scenes.map(s => s.page.sheet.w)), h: Math.max(...scenes.map(s => s.page.sheet.h)) };
    return scenes.map(s => { const f = format === 'pdf' ? s.page.sheet : frame; return { name: s.name, src: uri(svg(s, { pdf: format === 'pdf', frame: f })), aspect: f.w / f.h }; });
  };
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
  // are more, each captioned; a click shows one at full size. A PDF goes on Letter, unless another paper is
  // picked.
  function Choice({ choice, here, others }) {
    const [format, setFormat] = useState(choice.format), [which, setWhich] = useState(choice.which), [paper, setPaper] = useState(choice.paper);
    const [picked, setPicked] = useState(false), [full, setFull] = useState(null);
    const drawn = format === 'pptx' || format === 'pdf';
    const scenes = useMemo(() => drawn ? views(paper) : [], [drawn, paper]);
    Object.assign(choice, { format, which, paper, scenes });
    const pages = drawn ? sheets(format, which === 'all' ? scenes : scenes.filter(s => s.view === here.id)) : [], one = pages[full] ?? null;
    const papers = here ? [...new Set(['slide', 'letter', pageOf(here)])] : [];
    const pick = f => { setFull(null); setFormat(f); if (!picked && (f === 'pptx' || f === 'pdf')) setPaper(f === 'pdf' ? 'letter' : pageOf(here)); };
    return html`<div class="ex">
      <div class="ex-pick">
        <select aria-label="Format" value=${format} onChange=${e => pick(e.target.value)}>
          ${FORMATS.filter(([f]) => here || f === 'ics').map(([f, name]) => html`<option value=${f}>${name}</option>`)}
          ${others.map((x, i) => html`<option value=${`x${i}`}>${x.name}</option>`)}</select>
        ${drawn ? html`<select aria-label="Views" value=${which} onChange=${e => { setFull(null); setWhich(e.target.value); }} disabled=${charts().length < 2}>
          <option value="this">${here.name}</option><option value="all">Every view</option></select>
        <select aria-label="Page size" value=${paper} onChange=${e => { setFull(null); setPicked(true); setPaper(e.target.value); }}>
          ${papers.map(p => html`<option value=${p}>${PAPERS[p]}</option>`)}</select>` : null}
      </div>
      ${drawn ? html`<div class=${'ex-well' + (one ? ' full' : pages.length > 1 ? ' many' : '')}>
        ${(one ? [one] : pages).map((pg, i) => html`<figure class="ex-page" key=${pg.name} style=${`--a: ${pg.aspect}`}>
          <button type="button" aria-label=${pg.name} aria-pressed=${!!one} onClick=${() => setFull(one ? null : i)}><img src=${pg.src} alt="" /></button>
          ${pages.length > 1 && !one ? html`<figcaption>${pg.name}</figcaption>` : null}</figure>`)}
      </div>` : format === 'ics' ? html`<div class="ex-well"><${Dates} /></div>` : null}
    </div>`;
  }
  async function open(format) {
    const shown = Shell.view.peek(), list = charts(), others = Shell.parts.peek().export ?? [];
    const here = list.find(v => v.id === shown) ?? list[0] ?? null;
    // What the view shown offers comes first where it's a table; then a chart's slides.
    const first = format ?? (!list.some(v => v.id === shown) && others.length ? 'x0' : here ? 'pptx' : 'ics');
    const choice = { format: first, which: 'this', paper: first === 'pdf' ? 'letter' : here ? pageOf(here) : 'slide' };
    const go = await Shell.dialog({ title: 'Export', width: 720, body: () => html`<${Choice} choice=${choice} here=${here} others=${others} />`,
      actions: [{ label: 'Cancel', value: false }, { label: 'Export', value: true, primary: true }] });
    if (!go) return;
    if (choice.format === 'ics') return calendar(App.computed.peek(), App.notes.peek(), App.chart.peek(), chartName(), App.day.peek());
    if (choice.format.startsWith('x')) return others[+choice.format.slice(1)]?.run();
    // By whoever exports it, blank where no name is set.
    const all = choice.which === 'all';
    return write(choice.format, all ? choice.scenes : choice.scenes.filter(s => s.view === here.id), all ? chartName() : fileName(chartName(), here.name),
      { author: Store.who() ?? '', R: App.computed.peek(), N: App.notes.peek() }).catch(e => Shell.toast(e?.message || 'Couldn’t export'));
  }
  api.open = open;
}

return api;
})();
