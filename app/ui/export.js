// Exports: the chart as a vector PDF, an editable PowerPoint deck or an SVG, and an object's profile as a
// PDF, all made in the browser. The chart is first read off the page as a scene, plain geometry with every
// style resolved, so each format draws the same thing the chart shows. The libraries (PptxGenJS, jsPDF and
// svg2pdf.js, under ../vendor) load the first time they're needed.
//
// A scene is { title, view, when, x0, y0, width, height, boxes, lines }, in the chart's own units (CSS px):
//   box:  { id, x, y, w, h, shape, fill, stroke, strokeWidth, dash, rows, paragraphs }
//         rows are the lines of text as the browser wrapped them, each { text, x (its middle), y (its
//         baseline), font, size, bold, italic, color }; paragraphs are the same text unwrapped, one per
//         record shown, for formats that wrap text themselves (PowerPoint).
//   line: { id, points: [[x, y], …], stroke, strokeWidth, dash, label: { x, y, parts: [{ text, …font }] } | null }

const EXPORT_VENDOR = '../vendor/';
const EXPORT_LIBS = {
  pptx: ['pptxgenjs/pptxgen.bundle.js'],
  pdf: ['jspdf/jspdf.umd.min.js', 'svg2pdf/svg2pdf.umd.min.js'],
};

// Where a finished file goes: a download, unless something else (a test) wants it.
const exportOptions = { onFile: null };

const loadedScripts = new Map();
function loadScript(src) {
  if (!loadedScripts.has(src)) loadedScripts.set(src, new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Couldn’t load ${src}.`));
    document.head.appendChild(s);
  }));
  return loadedScripts.get(src);
}
async function loadLibs(which) {
  for (const file of EXPORT_LIBS[which]) await loadScript(EXPORT_VENDOR + file);
}

function deliver(blob, name) {
  if (exportOptions.onFile) return exportOptions.onFile(blob, name);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

const fileName = (parts, ext) => `${parts.filter(Boolean).join(' - ').replace(/[\\/:*?"<>|]+/g, '').trim() || 'Chart'}.${ext}`;
const chartTitle = () => (typeof chartInUse === 'function' && chartInUse()?.name) || 'Chart';

// ---- Reading the chart ----

const hexOf = css => {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(css);
  return m ? `#${m.slice(1, 4).map(n => Number(n).toString(16).padStart(2, '0')).join('')}` : css;
};
const firstFamily = css => css.split(',')[0].trim().replace(/^["']|["']$/g, '');

// A line of text in a box, as the browser laid it out: the rows it wrapped into, from where each character
// landed, with each row's middle and baseline in the sheet's units.
function textRows(el, toSheet) {
  const cs = getComputedStyle(el);
  const font = { font: firstFamily(cs.fontFamily), size: parseFloat(cs.fontSize), bold: Number(cs.fontWeight) >= 600, italic: cs.fontStyle === 'italic', color: hexOf(cs.color) };
  const node = [...el.childNodes].find(n => n.nodeType === Node.TEXT_NODE && n.data.trim());
  if (!node) return { font, rows: [], text: '' };
  const range = document.createRange();
  const rows = [];
  for (let i = 0; i < node.length; i++) {
    range.setStart(node, i);
    range.setEnd(node, i + 1);
    const r = range.getClientRects()[0];
    if (!r || !r.width && /\s/.test(node.data[i])) { if (rows.length) rows.at(-1).text += node.data[i]; continue; }
    let row = rows.find(w => Math.abs(w.top - r.top) < r.height / 2);
    if (!row) rows.push(row = { top: r.top, left: r.left, right: r.right, text: '' });
    row.text += node.data[i];
    row.left = Math.min(row.left, r.left);
    row.right = Math.max(row.right, r.right);
  }
  // The first row's baseline, from a probe that sits on it; the rest are a row's height apart.
  const probe = document.createElement('span');
  probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
  el.insertBefore(probe, node);
  const base = probe.getBoundingClientRect().top;
  probe.remove();
  return {
    font, text: node.data.trim(),
    rows: rows.filter(r => r.text.trim()).map(r => {
      const [x, y] = toSheet((r.left + r.right) / 2, base + (r.top - rows[0].top));
      return { text: r.text.trim(), x, y, ...font };
    }),
  };
}

// The text width of a run, for placing labels and fitting bounds.
const measureCanvas = document.createElement('canvas').getContext('2d');
function textWidth(text, f) {
  measureCanvas.font = `${f.italic ? 'italic ' : ''}${f.bold ? 600 : 400} ${f.size}px ${f.font ?? 'Inter'}, sans-serif`;
  return measureCanvas.measureText(text).width;
}

// The current view of the chart, as drawn on the page (see renderChart in chart.js).
function chartScene() {
  const geo = chart.geometry;
  const origin = document.getElementById('sheet').getBoundingClientRect();
  const z = chart.zoom;
  const toSheet = (x, y) => [(x - origin.left) / z, (y - origin.top) / z];
  const boxes = [...document.querySelectorAll('#nodes .node')].filter(el => el.dataset.node !== '__new' && geo[el.dataset.node]).map(el => {
    const id = el.dataset.node, g = geo[id], { box } = boxLook(id);
    const lines = [...el.querySelectorAll('.node-line')].map(line => textRows(line, toSheet));
    return {
      id, x: g.x, y: g.y, w: g.w, h: g.h, shape: g.shape, fill: box.fill, stroke: box.stroke, strokeWidth: box.strokeWidth, dash: box.dash,
      rows: lines.flatMap(l => l.rows), paragraphs: lines.filter(l => l.text).map(l => ({ text: l.text, ...l.font })),
    };
  });
  const lines = chartLines(geo).map(l => ({
    id: l.id, points: l.points, stroke: l.look.stroke, strokeWidth: l.look.strokeWidth, dash: l.look.dash,
    label: l.look.parts.length ? {
      x: l.label.x, y: l.label.y,
      parts: l.look.parts.map(p => { const f = computedLook(p.id, p.look); return { text: p.text, font: f.font, size: f.size, bold: f.bold, italic: f.italic, color: f.color }; }),
    } : null,
  }));
  // The drawing's extent: every box, every point of every line, and every label, with a margin.
  const xs = [], ys = [];
  for (const b of boxes) xs.push(b.x, b.x + b.w), ys.push(b.y, b.y + b.h);
  for (const l of lines) {
    for (const [x, y] of l.points) xs.push(x), ys.push(y);
    if (l.label) {
      const w = l.label.parts.reduce((s, p) => s + textWidth(`${p.text} `, p), 0);
      xs.push(l.label.x - w / 2, l.label.x + w / 2), ys.push(l.label.y - 8, l.label.y + 8);
    }
  }
  const pad = 24;
  const x0 = Math.min(...xs, 0) - pad, y0 = Math.min(...ys, 0) - pad;
  return {
    title: chartTitle(), view: viewInUse().name, when: new Date(),
    x0, y0, width: Math.max(...xs, 100) + pad - x0, height: Math.max(...ys, 100) + pad - y0,
    boxes, lines,
  };
}

// ---- SVG ----

const SVG_DASH = { solid: 'none', dashed: '6 4', dotted: '1.5 3' };
const escSvg = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// Fonts as each format can draw them. A PDF uses its standard fonts, so its text needs no embedding.
const svgFamily = (font, pdf) => /georgia|times/i.test(font ?? '')
  ? (pdf ? 'times' : `${font}, 'Times New Roman', serif`)
  : (pdf ? 'helvetica' : `${[...new Set([font ?? 'Inter', 'Inter'])].join(', ')}, Arial, Helvetica, sans-serif`);
const svgFont = (f, pdf) => `font-family="${escSvg(svgFamily(f.font, pdf))}" font-size="${f.size}" font-weight="${f.bold ? 'bold' : 'normal'}" font-style="${f.italic ? 'italic' : 'normal'}"`;

// A path through the points with gently rounded corners, as the chart draws its lines.
function roundedPath(points, r = 6) {
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i - 1], [x, y] = points[i], [nx, ny] = points[i + 1];
    const k = Math.min(r, Math.hypot(x - px, y - py) / 2, Math.hypot(nx - x, ny - y) / 2);
    d += ` L${x - Math.sign(x - px) * k},${y - Math.sign(y - py) * k} Q${x},${y} ${x + Math.sign(nx - x) * k},${y + Math.sign(ny - y) * k}`;
  }
  const end = points.at(-1);
  return `${d} L${end[0]},${end[1]}`;
}

function boxSvg(b) {
  const paint = `fill="${b.fill === 'none' ? 'none' : b.fill}" stroke="${b.stroke}" stroke-width="${b.strokeWidth}" stroke-dasharray="${SVG_DASH[b.dash] ?? 'none'}"`;
  const inner = b.strokeWidth / 2;
  if (b.shape === 'oval') return `<ellipse cx="${b.x + b.w / 2}" cy="${b.y + b.h / 2}" rx="${b.w / 2 - inner}" ry="${b.h / 2 - inner}" ${paint} />`;
  if (b.shape === 'triangle') return `<polygon points="${b.x + b.w / 2},${b.y + 1} ${b.x + b.w - 0.7},${b.y + b.h - 0.7} ${b.x + 0.7},${b.y + b.h - 0.7}" stroke-linejoin="round" ${paint} />`;
  const rect = `<rect x="${b.x + inner}" y="${b.y + inner}" width="${b.w - 2 * inner}" height="${b.h - 2 * inner}" rx="${b.shape === 'rounded' ? 14 : 0}" ${paint} />`;
  if (b.shape !== 'rect-oval') return rect;
  return `${rect}<ellipse cx="${b.x + b.w / 2}" cy="${b.y + b.h / 2}" rx="${b.w / 2 - 4 - inner}" ry="${b.h / 2 - 4 - inner}" fill="none" stroke="${b.stroke}" stroke-width="${b.strokeWidth}" />`;
}

// A standalone SVG of the scene. With `pdf`, fonts are the PDF's standard ones, and a label's white halo
// is drawn as a separate stroked copy, which every SVG reader understands.
function sceneToSvg(scene, { pdf = false } = {}) {
  const out = [];
  out.push(`<rect x="${scene.x0}" y="${scene.y0}" width="${scene.width}" height="${scene.height}" fill="#ffffff" />`);
  for (const l of scene.lines)
    out.push(`<path d="${roundedPath(l.points)}" fill="none" stroke="${l.stroke}" stroke-width="${l.strokeWidth}" stroke-dasharray="${SVG_DASH[l.dash] ?? 'none'}" stroke-linecap="${l.dash === 'dotted' ? 'round' : 'butt'}" />`);
  for (const b of scene.boxes) {
    out.push(boxSvg(b));
    for (const r of b.rows) out.push(`<text x="${r.x}" y="${r.y}" text-anchor="middle" ${svgFont(r, pdf)} fill="${r.color}">${escSvg(r.text)}</text>`);
  }
  for (const l of scene.lines) {
    if (!l.label) continue;
    const spans = halo => l.label.parts.map((p, i) => `<tspan ${svgFont(p, pdf)} fill="${halo ? '#ffffff' : p.color}">${i ? ' ' : ''}${escSvg(p.text)}</tspan>`).join('');
    const at = `x="${l.label.x}" y="${l.label.y + l.label.parts[0].size * 0.35}" text-anchor="middle"`;
    out.push(`<text ${at} stroke="#ffffff" stroke-width="4" stroke-linejoin="round">${spans(true)}</text><text ${at}>${spans(false)}</text>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${scene.x0} ${scene.y0} ${scene.width} ${scene.height}" width="${scene.width}" height="${scene.height}">${out.join('')}</svg>`;
}

function exportSvg(scene = chartScene()) {
  deliver(new Blob([sceneToSvg(scene)], { type: 'image/svg+xml' }), fileName([scene.title, scene.view], 'svg'));
}

// ---- PDF ----

const PAGE_SIZES = { letter: 'letter', a4: 'a4', tabloid: 'tabloid' };
const stamp = when => `${when.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}, ${when.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;

// The title block above and the footer below, on every page.
function pdfFrame(doc, { title, subtitle, footer, page, pages }) {
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  doc.setFont('helvetica', 'bold').setFontSize(15).setTextColor(24, 24, 27).text(title, 36, 42);
  if (subtitle) doc.setFont('helvetica', 'normal').setFontSize(9.5).setTextColor(113, 113, 122).text(subtitle, 36, 57);
  doc.setDrawColor(228, 228, 231).setLineWidth(0.6).line(36, 66, W - 36, 66).line(36, H - 34, W - 36, H - 34);
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(113, 113, 122);
  doc.text(footer, 36, H - 22);
  doc.text(`Page ${page} of ${pages}`, W - 36, H - 22, { align: 'right' });
}

async function exportPdf(scene = chartScene(), { title, subtitle, pageSize = 'letter', orientation } = {}) {
  await loadLibs('pdf');
  const { jsPDF } = window.jspdf;
  const landscape = orientation ? orientation === 'landscape' : scene.width >= scene.height;
  const doc = new jsPDF({ unit: 'pt', format: PAGE_SIZES[pageSize] ?? 'letter', orientation: landscape ? 'landscape' : 'portrait' });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  pdfFrame(doc, {
    title: title ?? scene.title, subtitle: subtitle ?? `${scene.view} view`,
    footer: `${scene.title} · ${scene.view} · As of ${stamp(scene.when)}`, page: 1, pages: 1,
  });
  // The chart, as large as fits between the title block and the footer, centered.
  const area = { x: 36, y: 78, w: W - 72, h: H - 78 - 46 };
  const k = Math.min(area.w / scene.width, area.h / scene.height);
  const w = scene.width * k, h = scene.height * k;
  const holder = document.createElement('div');
  holder.style.cssText = 'position:fixed;left:-10000px;top:0;width:0;height:0;overflow:hidden';
  holder.innerHTML = sceneToSvg(scene, { pdf: true });
  document.body.appendChild(holder);
  try {
    await doc.svg(holder.firstElementChild, { x: area.x + (area.w - w) / 2, y: area.y + (area.h - h) / 2, width: w, height: h });
  } finally {
    holder.remove();
  }
  const blob = doc.output('blob');
  deliver(blob, fileName([scene.title, scene.view], 'pdf'));
  return blob;
}

// ---- PowerPoint ----

const PPT_DASH = { solid: 'solid', dashed: 'dash', dotted: 'sysDot' };
const pptColor = c => (c ?? '#000000').replace('#', '').toUpperCase();
const pptFont = f => /georgia|times/i.test(f ?? '') ? (/georgia/i.test(f) ? 'Georgia' : 'Times New Roman') : /calibri/i.test(f ?? '') ? 'Calibri' : /arial/i.test(f ?? '') ? 'Arial' : 'Calibri';

// The scene on a slide, as native, editable shapes: each box a shape with its text in it, each line one
// freeform path, each label a text box. `k` is inches per chart unit.
function addChartSlide(pptx, scene) {
  const slide = pptx.addSlide();
  slide.addText(scene.view, { x: 0.5, y: 0.25, w: 8, h: 0.4, fontFace: 'Calibri', fontSize: 16, bold: true, color: '18181B', margin: 0 });
  slide.addText(`${scene.title} · As of ${stamp(scene.when)}`, { x: 0.5, y: 0.62, w: 10, h: 0.3, fontFace: 'Calibri', fontSize: 10, color: '71717A', margin: 0 });
  const area = { x: 0.5, y: 1.05, w: 12.333, h: 6.15 };
  const k = Math.min(area.w / scene.width, area.h / scene.height);
  const ox = area.x + (area.w - scene.width * k) / 2 - scene.x0 * k, oy = area.y + (area.h - scene.height * k) / 2 - scene.y0 * k;
  const X = x => ox + x * k, Y = y => oy + y * k;
  const pt = px => Math.max(0.25, px * k * 72);
  for (const l of scene.lines) {
    const xs = l.points.map(p => p[0]), ys = l.points.map(p => p[1]);
    const minX = Math.min(...xs), minY = Math.min(...ys);
    const w = Math.max((Math.max(...xs) - minX) * k, 0.01), h = Math.max((Math.max(...ys) - minY) * k, 0.01);
    const P = ([x, y]) => ({ x: (x - minX) * k, y: (y - minY) * k });
    // The same gently rounded corners as on screen, as quadratic curves.
    const points = [P(l.points[0])];
    for (let i = 1; i < l.points.length - 1; i++) {
      const [px, py] = l.points[i - 1], [x, y] = l.points[i], [nx, ny] = l.points[i + 1];
      const r = Math.min(6, Math.hypot(x - px, y - py) / 2, Math.hypot(nx - x, ny - y) / 2);
      points.push(P([x - Math.sign(x - px) * r, y - Math.sign(y - py) * r]));
      const end = P([x + Math.sign(nx - x) * r, y + Math.sign(ny - y) * r]), ctl = P([x, y]);
      points.push({ ...end, curve: { type: 'quadratic', x1: ctl.x, y1: ctl.y } });
    }
    points.push(P(l.points.at(-1)));
    slide.addShape(pptx.ShapeType.custGeom, {
      x: X(minX), y: Y(minY), w, h, points,
      line: { color: pptColor(l.stroke), width: pt(l.strokeWidth), dashType: PPT_DASH[l.dash] ?? 'solid' },
    });
  }
  for (const b of scene.boxes) {
    const shape = { rect: pptx.ShapeType.rect, 'rect-oval': pptx.ShapeType.rect, rounded: pptx.ShapeType.roundRect, oval: pptx.ShapeType.ellipse, triangle: pptx.ShapeType.custGeom }[b.shape] ?? pptx.ShapeType.rect;
    const runs = b.paragraphs.map((p, i) => ({
      text: p.text,
      options: { fontFace: pptFont(p.font), fontSize: pt(p.size), bold: p.bold, italic: p.italic, color: pptColor(p.color), breakLine: i < b.paragraphs.length - 1 },
    }));
    // The text gets the room it has on screen (see .node in chart.css), as [left, right, bottom, top]. An
    // ellipse insets its own text that much already. A triangle is drawn as a freeform, whose text room is
    // its whole frame, since PowerPoint's own triangle allows its text less room than the chart does.
    const margin = {
      triangle: [pt(b.w * 0.2), pt(b.w * 0.2), pt(12), pt(b.w * 0.34)],
      oval: [0, 0, 0, 0],
      'rect-oval': [pt(b.w * 0.15), pt(b.w * 0.15), pt(12), pt(12)],
    }[b.shape] ?? [pt(12), pt(12), pt(10), pt(10)];
    const triangle = b.shape === 'triangle'
      ? { points: [{ x: b.w * k / 2, y: k }, { x: (b.w - 0.7) * k, y: (b.h - 0.7) * k }, { x: 0.7 * k, y: (b.h - 0.7) * k }, { close: true }] }
      : {};
    slide.addText(runs.length ? runs : '', {
      shape, ...triangle, x: X(b.x), y: Y(b.y), w: b.w * k, h: b.h * k,
      fill: b.fill === 'none' ? { type: 'none' } : { color: pptColor(b.fill) },
      line: { color: pptColor(b.stroke), width: pt(b.strokeWidth), dashType: PPT_DASH[b.dash] ?? 'solid' },
      align: 'center', valign: b.shape === 'triangle' ? 'bottom' : 'middle', margin, fit: 'shrink',
      ...(b.shape === 'rounded' ? { rectRadius: Math.min(14 * k, b.h * k / 2) } : {}),
    });
    if (b.shape === 'rect-oval') slide.addShape(pptx.ShapeType.ellipse, {
      x: X(b.x + 4), y: Y(b.y + 4), w: (b.w - 8) * k, h: (b.h - 8) * k,
      line: { color: pptColor(b.stroke), width: pt(b.strokeWidth) },
    });
  }
  for (const l of scene.lines) {
    if (!l.label) continue;
    const width = l.label.parts.reduce((s, p) => s + textWidth(`${p.text} `, p), 0) + 6;
    const size = Math.max(...l.label.parts.map(p => p.size));
    slide.addText(l.label.parts.map((p, i) => ({
      text: `${i ? ' ' : ''}${p.text}`,
      options: { fontFace: pptFont(p.font), fontSize: pt(p.size), bold: p.bold, italic: p.italic, color: pptColor(p.color) },
    })), {
      x: X(l.label.x - width / 2), y: Y(l.label.y - size * 0.75), w: width * k, h: size * 1.5 * k,
      align: 'center', valign: 'middle', margin: 0, fill: { color: 'FFFFFF' },
    });
  }
  return slide;
}

// A deck: a title slide, then the current view, or every view with `allViews`.
async function exportPptx(scene = null, { title, subtitle, allViews = false } = {}) {
  await loadLibs('pptx');
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.title = title ?? chartTitle();
  const cover = pptx.addSlide();
  cover.addText(title ?? chartTitle(), { x: 0.8, y: 2.7, w: 11.7, h: 1, fontFace: 'Calibri', fontSize: 34, bold: true, color: '18181B' });
  cover.addText(subtitle ?? `Structure chart · ${stamp(new Date())}`, { x: 0.8, y: 3.7, w: 11.7, h: 0.5, fontFace: 'Calibri', fontSize: 14, color: '71717A' });
  const scenes = [];
  if (allViews) {
    const start = viewId;
    try {
      for (const v of views) { switchView(v.id); renderChart(); scenes.push(chartScene()); }
    } finally {
      switchView(start);
      renderChart();
    }
  } else scenes.push(scene ?? chartScene());
  for (const s of scenes) addChartSlide(pptx, s);
  const blob = await pptx.write({ outputType: 'blob' });
  deliver(blob, fileName([title ?? chartTitle(), allViews ? 'All views' : scenes[0].view], 'pptx'));
  return blob;
}

// ---- An object's profile ----

// What the profile says a record's output is.
function profileValue(r) {
  if (isTag(r)) return r.tag ? 'Yes' : 'Ruled out';
  if (isChoice(r)) return r.choice;
  if (isField(r)) return displayValue(r);
  return '';
}

// One page (or more) about one object: its entries, as the panel lists them, then its relations by name.
async function exportRecordPdf(objectId) {
  await loadLibs('pdf');
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  const name = objectName(objectId);
  const when = new Date();
  // A computed value is in italics, as in the app, and tagged at the row's right.
  const labelW = 190, valueX = 36 + labelW + 12, valueW = W - 36 - 56 - valueX;
  let y = 90;
  const pages = [];
  const newPage = () => { doc.addPage(); y = 90; };
  const room = need => { if (y + need > H - 50) newPage(); };
  const heading = text => {
    room(40);
    y += 10;
    doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(24, 24, 27).text(text, 36, y);
    y += 8;
    doc.setDrawColor(228, 228, 231).setLineWidth(0.6).line(36, y, W - 36, y);
    y += 14;
  };
  const row = (label, value, { indent = 0, computed = false } = {}) => {
    const lines = doc.setFont('helvetica', computed ? 'italic' : 'normal').setFontSize(10).splitTextToSize(String(value || '—'), valueW);
    const labelLines = doc.setFont('helvetica', 'normal').splitTextToSize(label, labelW - indent);
    const h = Math.max(lines.length, labelLines.length) * 13 + 4;
    room(h);
    doc.setTextColor(82, 82, 91).setFont('helvetica', 'normal').text(labelLines, 36 + indent, y);
    doc.setTextColor(24, 24, 27).setFont('helvetica', computed ? 'italic' : 'normal').text(lines, valueX, y);
    if (computed) doc.setFontSize(7.5).setTextColor(113, 113, 122).setFont('helvetica', 'normal').text('COMPUTED', W - 36, y, { align: 'right' });
    y += h;
  };

  heading('Entries');
  const base = pathTo(objectId).length;
  for (const id of panelOrder(objectId).slice(1)) {
    const r = records[id];
    if (!r || isRelation(r)) continue;
    row(r.edge, profileValue(r), { indent: (pathTo(id).length - base - 1) * 12, computed: isComputed(id) });
  }

  // Relations with an argument at this object or below it, grouped by the relation's name.
  const groups = new Map();
  for (const [id, r] of Object.entries(records)) {
    if (!isRelation(r) || !r.args.some(a => objectOf(a.at) === objectId)) continue;
    const key = relationNameOf(id);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(id);
  }
  for (const [rel, ids] of [...groups].sort((a, b) => a[0].localeCompare(b[0]))) {
    heading(rel);
    for (const id of ids) {
      const r = records[id];
      const own = r.args.filter(a => objectOf(a.at) === objectId).map(a => a.edge).join(', ');
      const others = r.args.filter(a => objectOf(a.at) !== objectId).map(a => `${a.edge}: ${objectName(objectOf(a.at))}`).join('; ');
      const details = entriesOf(id).map(e => `${records[e].edge} ${profileValue(records[e])}`).join(', ');
      const out = isTag(r) ? (r.tag ? '' : 'Ruled out') : profileValue(r);
      row(`As ${own}`, [others, out, details].filter(Boolean).join(' · '), { computed: isComputed(id) });
    }
  }

  const count = doc.getNumberOfPages();
  for (let p = 1; p <= count; p++) {
    doc.setPage(p);
    pdfFrame(doc, {
      title: name, subtitle: `${records[objectId].kind} · ${chartTitle()}`,
      footer: `${chartTitle()} · Profile of ${name} · As of ${stamp(when)}`, page: p, pages: count,
    });
  }
  const blob = doc.output('blob');
  deliver(blob, fileName([name, 'Profile'], 'pdf'));
  return blob;
}

// ---- The ribbon's Export tab ----

const exportState = { pageSize: 'letter', busy: null };

function exportTab() {
  const sel = selection();
  const busy = exportState.busy;
  const size = rbMenu('rb:pdf-size', `<span class="rb-field-text">${{ letter: 'Letter', a4: 'A4', tabloid: 'Tabloid' }[exportState.pageSize]}</span>`, { cls: 'rb-field', title: 'Page size for the PDF' },
    () => [['letter', 'Letter'], ['a4', 'A4'], ['tabloid', 'Tabloid (11 × 17)']].map(([k, t]) =>
      `<button class="menu-item" role="menuitemradio" aria-checked="${exportState.pageSize === k}" data-action="export-size" data-size="${k}"><span class="menu-text">${t}</span>${exportState.pageSize === k ? icon('check') : ''}</button>`).join(''));
  const btn = (action, label, title, disabled = false) =>
    `<button class="rb-btn is-tall" data-action="${action}"${disabled || busy ? ' disabled' : ''} title="${esc(title)}">${icon('download')}${label}</button>`;
  const chartGroup = `<div class="rb-row">${btn('export-pdf', 'PDF', 'This view as a vector PDF, fitted to the page')}
    ${btn('export-pptx', 'PowerPoint', 'This view as editable shapes on a slide, after a title slide')}
    ${btn('export-pptx-all', 'All views', 'Every view of this chart, a slide each, in one deck')}
    ${btn('export-svg', 'SVG', 'This view as an SVG picture')}</div>`;
  const profile = `<div class="rb-row">${btn('export-profile', 'Profile', sel.object ? `A PDF profile of ${objectName(sel.object)}` : 'Select a box to export its profile', !sel.object)}</div>`;
  const status = `<div class="rb-row"><span class="rb-note">${busy ? `Making the ${esc(busy)}…` : 'Made in your browser; nothing is uploaded'}</span></div>`;
  return rbGroup('Chart', chartGroup) + rbGroup('PDF page', `<div class="rb-row">${size}</div>`) + rbGroup('Selected box', profile) + rbGroup('Export', status);
}

// Runs an export, saying so while it works and if it fails.
async function runExport(what, make) {
  exportState.busy = what;
  render();
  try {
    await make();
    setNotice(`Exported the ${what}.`);
  } catch (e) {
    setNotice(`Couldn’t export the ${what}: ${e.message}`, true);
  } finally {
    exportState.busy = null;
    render();
  }
}

Object.assign(ICONS, {
  download: '<path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2" /><path d="M7 11l5 5l5 -5" /><path d="M12 4l0 12" />',
});

Object.assign(actions, {
  'export-size': d => { exportState.pageSize = d.size; ui.menu = null; },
  'export-pdf': () => { runExport('PDF', () => exportPdf(chartScene(), { pageSize: exportState.pageSize })); },
  'export-pptx': () => { runExport('PowerPoint deck', () => exportPptx()); },
  'export-pptx-all': () => { runExport('PowerPoint deck', () => exportPptx(null, { allViews: true })); },
  'export-svg': () => { runExport('SVG', async () => exportSvg()); },
  'export-profile': () => { const id = selection().object; if (id) runExport('profile', () => exportRecordPdf(id)); },
});
