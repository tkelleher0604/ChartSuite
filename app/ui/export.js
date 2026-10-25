// Exports: the chart as a vector PDF, an editable PowerPoint deck or an SVG, and an object's profile as a
// PDF, all made in the browser; and the Export dialog, which picks the format, the views, the page and the
// "as of" date, with a live preview. The chart is first read off the page as a scene, plain geometry with
// every style resolved, so each format draws the same thing the chart shows. Then each scene is laid out
// on a page (its title block, the chart scaled to fit, the legend, a footer), and that one layout is what
// the PDF draws, what the preview shows, and where PowerPoint puts its shapes. The libraries (PptxGenJS,
// jsPDF and svg2pdf.js, under ../vendor) load the first time they're needed.
//
// A scene is { title, view, x0, y0, width, height, boxes, lines, legend }, in the chart's own units (CSS px):
//   box:  { id, x, y, w, h, shape, fill, stroke, strokeWidth, dash, rows, paragraphs }
//         rows are the lines of text as the browser wrapped them, each { text, x (its middle), y (its
//         baseline), font, size, bold, italic, color }; paragraphs are the same text unwrapped, one per
//         record shown, for formats that wrap text themselves (PowerPoint).
//   line: { id, points: [[x, y], …], stroke, strokeWidth, dash, label: { x, y, parts: [{ text, …font }] } | null }
//   legend: the view's legend rows (see legendRows in chart.js).

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

// A calendar date (2026-10-25) as a document says it: October 25, 2026. Today's, by default.
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
function longDate(iso = todayIso()) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

// The paper's colors, which are the light theme's whatever the theme on screen, since paper is white.
const INK = { text: '#21201c', muted: '#63635e', faint: '#8d8d86', rule: '#e2e1de', frame: '#dad9d6' };

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
  const routed = chartLines(geo);
  const lines = routed.map(l => ({
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
    title: chartTitle(), view: viewInUse().name,
    x0, y0, width: Math.max(...xs, 100) + pad - x0, height: Math.max(...ys, 100) + pad - y0,
    boxes, lines, legend: legendRows(geo, routed),
  };
}

// Every view's scene, read by drawing each view in turn and coming back to the one in use. Nothing is
// painted in between, so the chart doesn't flicker.
function viewScenes() {
  const start = viewId, scenes = {};
  const stage = document.getElementById('stage');
  const { scrollLeft, scrollTop } = stage;
  try {
    for (const v of views) { switchView(v.id); renderChart(); scenes[v.id] = chartScene(); }
  } finally {
    switchView(start);
    renderChart();
    Object.assign(stage, { scrollLeft, scrollTop });
  }
  return scenes;
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

// A box's outline. Corners and the inner oval keep their proportions in a small box, like a legend's.
function boxSvg(b) {
  const paint = `fill="${b.fill === 'none' ? 'none' : b.fill}" stroke="${b.stroke}" stroke-width="${b.strokeWidth}" stroke-dasharray="${SVG_DASH[b.dash] ?? 'none'}"`;
  const inner = b.strokeWidth / 2;
  if (b.shape === 'oval') return `<ellipse cx="${b.x + b.w / 2}" cy="${b.y + b.h / 2}" rx="${b.w / 2 - inner}" ry="${b.h / 2 - inner}" ${paint} />`;
  if (b.shape === 'triangle') return `<polygon points="${b.x + b.w / 2},${b.y + 1} ${b.x + b.w - 0.7},${b.y + b.h - 0.7} ${b.x + 0.7},${b.y + b.h - 0.7}" stroke-linejoin="round" ${paint} />`;
  const rect = `<rect x="${b.x + inner}" y="${b.y + inner}" width="${b.w - 2 * inner}" height="${b.h - 2 * inner}" rx="${b.shape === 'rounded' ? Math.min(14, b.h * 0.3) : 0}" ${paint} />`;
  if (b.shape !== 'rect-oval') return rect;
  const gap = Math.min(4, b.h * 0.15);
  return `${rect}<ellipse cx="${b.x + b.w / 2}" cy="${b.y + b.h / 2}" rx="${b.w / 2 - gap - inner}" ry="${b.h / 2 - gap - inner}" fill="none" stroke="${b.stroke}" stroke-width="${b.strokeWidth}" />`;
}

// The scene's drawing, in its own units. With `pdf`, fonts are the PDF's standard ones, and a label's
// white halo is drawn as a separate stroked copy, which every SVG reader understands.
function sceneSvg(scene, { pdf = false } = {}) {
  const out = [];
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
  return out.join('');
}

// ---- The legend, on paper ----
// The legend's rows (legendRows in chart.js) set in a framed block: its groups in columns, as few as fit
// the height it's given, a long label wrapping onto a second line. Sizes are in the page's units. The
// chart draws the same block on its sheet, under the drawing, and an SVG export does too.

const LEGEND = { pad: 8, title: 8, head: 7, text: 7.5, row: 12, line: 9.5, headRow: 12, sw: 16, sh: 9, gap: 6, colGap: 18, label: 160 };

// A label's lines, broken between words to fit the legend's label width.
function legendLines(text, italic) {
  const lines = [];
  for (const word of text.split(' ')) {
    const next = lines.length ? `${lines.at(-1)} ${word}` : word;
    if (lines.length && textWidth(next, { size: LEGEND.text, italic }) > LEGEND.label) lines.push(word);
    else if (lines.length) lines[lines.length - 1] = next;
    else lines.push(word);
  }
  return lines;
}
const rowHeight = r => LEGEND.row + (r.lines.length - 1) * LEGEND.line;

// A row's picture: the box look or line look it stands for, or italic text, in a w × h cell at x, y.
function legendSwatch(r, x, y, w, h, pdf = false) {
  if (r.line) {
    const my = y + h / 2;
    return `<line x1="${x + 1}" y1="${my}" x2="${x + w - 1}" y2="${my}" stroke="${r.line.stroke}" stroke-width="${Math.min(r.line.strokeWidth, 2.5)}" stroke-dasharray="${SVG_DASH[r.line.dash] ?? 'none'}" stroke-linecap="${r.line.dash === 'dotted' ? 'round' : 'butt'}" />`;
  }
  if (r.text) return `<text x="${x + w / 2}" y="${y + h * 0.82}" text-anchor="middle" ${svgFont({ font: 'Inter', size: h * 0.95, italic: true }, pdf)} fill="${INK.text}">Aa</text>`;
  const inset = r.box.shape === 'triangle' ? 0 : 1;
  return boxSvg({ ...r.box, x: x + inset, y: y + inset, w: w - 2 * inset, h: h - 2 * inset, strokeWidth: Math.min(r.box.strokeWidth, 1.75) });
}

// The block's size and where each group goes, its columns no taller than maxH.
function legendBlock(rows, maxH = Infinity) {
  if (!rows?.length) return null;
  const L = LEGEND;
  const groups = [];
  for (const r of rows) {
    if (r.head || !groups.length) groups.push({ head: r.head ?? null, rows: [] });
    if (!r.head) groups.at(-1).rows.push({ ...r, lines: legendLines(r.label, r.computed) });
  }
  for (const g of groups) {
    g.h = (g.head ? L.headRow : 0) + g.rows.reduce((s, r) => s + rowHeight(r), 0);
    g.w = Math.max(g.head ? textWidth(g.head, { size: L.head, bold: true }) : 0,
      ...g.rows.map(r => L.sw + L.gap + Math.max(...r.lines.map(t => textWidth(t, { size: L.text, italic: r.computed })))));
  }
  const limit = Math.max(maxH, ...groups.map(g => g.h));
  const columns = [];
  for (const g of groups) {
    const col = columns.at(-1);
    if (col && col.h + 4 + g.h <= limit) { g.y = col.h + 4; col.h += 4 + g.h; col.w = Math.max(col.w, g.w); col.groups.push(g); }
    else { g.y = 0; columns.push({ h: g.h, w: g.w, groups: [g] }); }
  }
  let x = 0;
  for (const c of columns) { c.x = x; x += c.w + L.colGap; }
  const titleH = L.title + 6;
  return { columns, w: L.pad * 2 + x - L.colGap, h: L.pad * 2 + titleH + Math.max(...columns.map(c => c.h)), titleH };
}

// The lowest block that's no wider than maxW, found by letting its columns grow a row at a time, until
// they fit or there's one column.
function legendBlockWithin(rows, maxW) {
  let limit = 0, block = legendBlock(rows, limit);
  while (block && block.w > maxW && block.columns.length > 1) {
    limit = Math.max(limit, ...block.columns.map(c => c.h)) + LEGEND.row;
    block = legendBlock(rows, limit);
  }
  return block;
}

function legendSvg(block, x, y, pdf = false) {
  const L = LEGEND;
  const out = [`<rect x="${x + 0.3}" y="${y + 0.3}" width="${block.w - 0.6}" height="${block.h - 0.6}" rx="3" fill="#ffffff" stroke="${INK.frame}" stroke-width="0.6" />`,
    `<text x="${x + L.pad}" y="${y + L.pad + L.title * 0.8}" ${svgFont({ font: 'Inter', size: L.title, bold: true }, pdf)} fill="${INK.text}">Legend</text>`];
  for (const c of block.columns) for (const g of c.groups) {
    let cy = y + L.pad + block.titleH + g.y;
    const cx = x + L.pad + c.x;
    if (g.head) { out.push(`<text x="${cx}" y="${cy + L.head * 0.95}" ${svgFont({ font: 'Inter', size: L.head, bold: true }, pdf)} fill="${INK.muted}">${escSvg(g.head)}</text>`); cy += L.headRow; }
    for (const r of g.rows) {
      out.push(legendSwatch(r, cx, cy + (L.row - L.sh) / 2 - 1, L.sw, L.sh, pdf));
      r.lines.forEach((t, i) => out.push(`<text x="${cx + L.sw + L.gap}" y="${cy + L.row / 2 + L.text * 0.3 + i * L.line}" ${svgFont({ font: 'Inter', size: L.text, italic: r.computed }, pdf)} fill="${INK.text}">${escSvg(t)}</text>`));
      cy += rowHeight(r);
    }
  }
  return out.join('');
}

// The legend under a drawing, right-aligned with it, its text the size of the chart's: on the chart's
// sheet, and in an SVG export. `extent` is the drawing's { left, right, bottom }.
const LEGEND_ON_SHEET = 1.4;
function legendUnder(rows, { left, right, bottom }) {
  const k = LEGEND_ON_SHEET;
  const block = rows?.length ? legendBlockWithin(rows, (right - left) / k) : null;
  return block && { block, k, x: Math.max(left, right - block.w * k), y: bottom, w: block.w * k, h: block.h * k };
}
const legendG = (at, pdf = false) => `<g class="sheet-legend" transform="translate(${at.x} ${at.y}) scale(${at.k})">${legendSvg(at.block, 0, 0, pdf)}</g>`;

// ---- Pages ----
// A page is laid out once and drawn the same way everywhere: { W, H, frame, chart: { k, ox, oy }, legend:
// { block, x, y } | null }, in points. `frame` has the title, subtitle and footer, each { text, x, y,
// size, bold, color, align }, y at the baseline, and rules across the page.

const PAGE_SIZES = {
  letter: { name: 'Letter', w: 612, h: 792 },
  a4: { name: 'A4', w: 595.28, h: 841.89 },
  tabloid: { name: 'Tabloid (11 × 17)', w: 792, h: 1224 },
  wide: { name: 'Widescreen (16:9)', w: 960, h: 540, slide: 'LAYOUT_WIDE' },
  standard: { name: 'Standard (4:3)', w: 720, h: 540, slide: 'LAYOUT_4x3' },
};

// The legend goes beside the chart or below it, whichever lets the chart be drawn larger.
function layoutPage(scene, { size, orientation = 'auto', legend = true, title, subtitle, footer, page = '' }) {
  const base = PAGE_SIZES[size];
  const turn = !base.slide && (orientation === 'auto' ? scene.width >= scene.height : orientation === 'landscape');
  const W = turn ? Math.max(base.w, base.h) : base.slide ? base.w : Math.min(base.w, base.h);
  const H = turn ? Math.min(base.w, base.h) : base.slide ? base.h : Math.max(base.w, base.h);
  const M = 36;
  const frame = {
    title: { text: title, x: M, y: M + 6, size: 15, bold: true, color: INK.text },
    subtitle: { text: subtitle, x: M, y: M + 21, size: 9.5, color: INK.muted },
    rules: [M + 30, H - 34],
    footer: footer ? { text: footer, x: M, y: H - 22, size: 8, color: INK.muted } : null,
    page: page ? { text: page, x: W - M, y: H - 22, size: 8, color: INK.muted, align: 'end' } : null,
  };
  const area = { x: M, y: M + 42, w: W - 2 * M, h: H - (M + 42) - 46 };
  const fit = (w, h) => Math.min(w / scene.width, h / scene.height);
  const GAP = 14;
  let chartArea = area, legendAt = null;
  if (legend && scene.legend?.length) {
    const right = legendBlock(scene.legend, area.h - 2 * LEGEND.pad - LEGEND.title - 6);
    const below = legendBlockWithin(scene.legend, area.w);
    const kRight = fit(area.w - right.w - GAP, area.h), kBelow = fit(area.w, area.h - below.h - GAP);
    if (kRight >= kBelow) {
      chartArea = { ...area, w: area.w - right.w - GAP };
      legendAt = { block: right, x: area.x + area.w - right.w, y: area.y };
    } else {
      chartArea = { ...area, h: area.h - below.h - GAP };
      legendAt = { block: below, x: area.x + area.w - below.w, y: area.y + area.h - below.h };
    }
  }
  const k = fit(chartArea.w, chartArea.h);
  const ox = chartArea.x + (chartArea.w - scene.width * k) / 2 - scene.x0 * k;
  const oy = chartArea.y + (chartArea.h - scene.height * k) / 2 - scene.y0 * k;
  return { W, H, frame, scene, chart: { k, ox, oy }, legend: legendAt };
}

const frameText = (t, pdf) => t ? `<text x="${t.x}" y="${t.y}"${t.align === 'end' ? ' text-anchor="end"' : ''} ${svgFont({ font: 'Inter', size: t.size, bold: t.bold }, pdf)} fill="${t.color}">${escSvg(t.text)}</text>` : '';

// A whole page as one SVG, in points: what the PDF draws, and what the preview shows.
function pageSvg(page, { pdf = false } = {}) {
  const { W, H, frame, chart: c, scene } = page;
  const rules = frame.rules.map(y => `<line x1="36" y1="${y}" x2="${W - 36}" y2="${y}" stroke="${INK.rule}" stroke-width="0.6" />`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
    <rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff" />${frameText(frame.title, pdf)}${frameText(frame.subtitle, pdf)}${rules}
    <g transform="translate(${c.ox} ${c.oy}) scale(${c.k})">${sceneSvg(scene, { pdf })}</g>
    ${page.legend ? legendSvg(page.legend.block, page.legend.x, page.legend.y, pdf) : ''}${frameText(frame.footer, pdf)}${frameText(frame.page, pdf)}</svg>`;
}

// A deck's title slide, as a page: the chart's name, and the date.
function titlePage(size, title, asOf) {
  const { w: W, h: H } = PAGE_SIZES[size];
  return { W, H, cover: true, frame: {
    title: { text: title, x: 58, y: H / 2 - 4, size: 34, bold: true, color: INK.text },
    subtitle: { text: `Structure chart · As of ${longDate(asOf)}`, x: 58, y: H / 2 + 26, size: 14, color: INK.muted },
  } };
}
const coverSvg = page => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${page.W} ${page.H}" width="${page.W}" height="${page.H}">
  <rect x="0" y="0" width="${page.W}" height="${page.H}" fill="#ffffff" />${frameText(page.frame.title)}${frameText(page.frame.subtitle)}</svg>`;

// The picture an SVG export is: the drawing, with the legend under it, as the sheet shows them.
function pictureSvg(scene, legend = true) {
  const at = legend ? legendUnder(scene.legend, { left: scene.x0 + 24, right: scene.x0 + scene.width - 24, bottom: scene.y0 + scene.height }) : null;
  const h = scene.height + (at ? at.h + 24 : 0);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${scene.x0} ${scene.y0} ${scene.width} ${h}" width="${scene.width}" height="${h}">
    <rect x="${scene.x0}" y="${scene.y0}" width="${scene.width}" height="${h}" fill="#ffffff" />${sceneSvg(scene)}${at ? legendG(at) : ''}</svg>`;
}

// ---- The formats ----

// The pages for some scenes: a PDF's, each saying its chart and view, or a deck's slides, each its view.
function pagesFor(scenes, { format, size, orientation, legend, asOf }) {
  const n = scenes.length;
  return scenes.map((s, i) => layoutPage(s, format === 'pptx'
    ? { size, legend, title: s.view, subtitle: s.title, footer: `As of ${longDate(asOf)}`, page: n > 1 ? `${i + 1} of ${n}` : '' }
    : { size, orientation, legend, title: s.title, subtitle: `${s.view} view`, footer: `${s.title} · ${s.view} · As of ${longDate(asOf)}`, page: `Page ${i + 1} of ${n}` }));
}

function exportSvg(scene = chartScene(), { legend = true } = {}) {
  deliver(new Blob([pictureSvg(scene, legend)], { type: 'image/svg+xml' }), fileName([scene.title, scene.view], 'svg'));
}

async function exportPdf(scenes = [chartScene()], { size = 'letter', orientation = 'auto', legend = true, asOf = todayIso() } = {}) {
  await loadLibs('pdf');
  const { jsPDF } = window.jspdf;
  const pages = pagesFor(scenes, { format: 'pdf', size, orientation, legend, asOf });
  const formatOf = p => [p.W, p.H];
  const doc = new jsPDF({ unit: 'pt', format: formatOf(pages[0]), orientation: pages[0].W > pages[0].H ? 'landscape' : 'portrait' });
  const holder = document.createElement('div');
  holder.style.cssText = 'position:fixed;left:-10000px;top:0;width:0;height:0;overflow:hidden';
  document.body.appendChild(holder);
  try {
    for (const [i, p] of pages.entries()) {
      if (i) doc.addPage(formatOf(p), p.W > p.H ? 'landscape' : 'portrait');
      holder.innerHTML = pageSvg(p, { pdf: true });
      await doc.svg(holder.firstElementChild, { x: 0, y: 0, width: p.W, height: p.H });
    }
  } finally {
    holder.remove();
  }
  const blob = doc.output('blob');
  deliver(blob, fileName([scenes[0].title, scenes.length > 1 ? 'All views' : scenes[0].view], 'pdf'));
  return blob;
}

// ---- PowerPoint ----

const PPT_DASH = { solid: 'solid', dashed: 'dash', dotted: 'sysDot' };
const pptColor = c => (c ?? '#000000').replace('#', '').toUpperCase();
const pptFont = f => /georgia|times/i.test(f ?? '') ? (/georgia/i.test(f) ? 'Georgia' : 'Times New Roman') : /calibri/i.test(f ?? '') ? 'Calibri' : /arial/i.test(f ?? '') ? 'Arial' : 'Calibri';
const inch = pt => pt / 72;

// A box as a native shape, with its text in it if given. `X`, `Y` and `S` take the chart's units to the
// slide's inches and points.
function pptBox(slide, pptx, b, X, Y, S, runs = '') {
  const shape = { rect: pptx.ShapeType.rect, 'rect-oval': pptx.ShapeType.rect, rounded: pptx.ShapeType.roundRect, oval: pptx.ShapeType.ellipse, triangle: pptx.ShapeType.custGeom }[b.shape] ?? pptx.ShapeType.rect;
  const w = inch(S(b.w)), h = inch(S(b.h));
  // The text gets the room it has on screen (see .node in chart.css), as [left, right, bottom, top]. An
  // ellipse insets its own text that much already. A triangle is drawn as a freeform, whose text room is
  // its whole frame, since PowerPoint's own triangle allows its text less room than the chart does.
  const margin = {
    triangle: [S(b.w * 0.2), S(b.w * 0.2), S(12), S(b.w * 0.34)],
    oval: [0, 0, 0, 0],
    'rect-oval': [S(b.w * 0.15), S(b.w * 0.15), S(12), S(12)],
  }[b.shape] ?? [S(12), S(12), S(10), S(10)];
  const triangle = b.shape === 'triangle' ? { points: [{ x: w / 2, y: 0 }, { x: w, y: h }, { x: 0, y: h }, { close: true }] } : {};
  slide.addText(runs, {
    shape, ...triangle, x: inch(X(b.x)), y: inch(Y(b.y)), w, h,
    fill: b.fill === 'none' ? { type: 'none' } : { color: pptColor(b.fill) },
    line: { color: pptColor(b.stroke), width: Math.max(0.25, S(b.strokeWidth)), dashType: PPT_DASH[b.dash] ?? 'solid' },
    align: 'center', valign: b.shape === 'triangle' ? 'bottom' : 'middle', margin, fit: 'shrink',
    ...(b.shape === 'rounded' ? { rectRadius: Math.min(inch(S(Math.min(14, b.h * 0.3))), h / 2) } : {}),
  });
  if (b.shape === 'rect-oval') {
    const gap = Math.min(4, b.h * 0.15);
    slide.addShape(pptx.ShapeType.ellipse, {
      x: inch(X(b.x + gap)), y: inch(Y(b.y + gap)), w: inch(S(b.w - 2 * gap)), h: inch(S(b.h - 2 * gap)),
      line: { color: pptColor(b.stroke), width: Math.max(0.25, S(b.strokeWidth)) },
    });
  }
}

const pptText = (slide, t, w) => t && slide.addText(t.text, {
  x: inch(t.align === 'end' ? t.x - w : t.x), y: inch(t.y - t.size * 0.95), w: inch(w), h: inch(t.size * 1.3),
  fontFace: 'Calibri', fontSize: t.size, bold: !!t.bold, color: pptColor(t.color), margin: 0, align: t.align === 'end' ? 'right' : 'left', valign: 'bottom',
});

// A page on a slide, as native, editable shapes: each box a shape with its text in it, each line one
// freeform path, each label a text box, and the legend's swatches and words.
function addPageSlide(pptx, page) {
  const slide = pptx.addSlide();
  const { frame, chart: c, scene } = page;
  const X = x => c.ox + x * c.k, Y = y => c.oy + y * c.k, S = v => v * c.k;
  pptText(slide, frame.title, page.W - 72);
  pptText(slide, frame.subtitle, page.W - 72);
  if (page.cover) return slide;
  for (const y of frame.rules) slide.addShape(pptx.ShapeType.line, { x: inch(36), y: inch(y), w: inch(page.W - 72), h: 0, line: { color: pptColor(INK.rule), width: 0.6 } });
  pptText(slide, frame.footer, page.W - 200);
  pptText(slide, frame.page, 120);
  for (const l of scene.lines) {
    const xs = l.points.map(p => p[0]), ys = l.points.map(p => p[1]);
    const minX = Math.min(...xs), minY = Math.min(...ys);
    const w = Math.max(inch(S(Math.max(...xs) - minX)), 0.01), h = Math.max(inch(S(Math.max(...ys) - minY)), 0.01);
    const P = ([x, y]) => ({ x: inch(S(x - minX)), y: inch(S(y - minY)) });
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
      x: inch(X(minX)), y: inch(Y(minY)), w, h, points,
      line: { color: pptColor(l.stroke), width: Math.max(0.25, S(l.strokeWidth)), dashType: PPT_DASH[l.dash] ?? 'solid' },
    });
  }
  for (const b of scene.boxes) {
    const runs = b.paragraphs.map((p, i) => ({
      text: p.text,
      options: { fontFace: pptFont(p.font), fontSize: S(p.size), bold: p.bold, italic: p.italic, color: pptColor(p.color), breakLine: i < b.paragraphs.length - 1 },
    }));
    pptBox(slide, pptx, b, X, Y, S, runs.length ? runs : '');
  }
  for (const l of scene.lines) {
    if (!l.label) continue;
    const width = l.label.parts.reduce((s, p) => s + textWidth(`${p.text} `, p), 0) + 6;
    const size = Math.max(...l.label.parts.map(p => p.size));
    slide.addText(l.label.parts.map((p, i) => ({
      text: `${i ? ' ' : ''}${p.text}`,
      options: { fontFace: pptFont(p.font), fontSize: S(p.size), bold: p.bold, italic: p.italic, color: pptColor(p.color) },
    })), {
      x: inch(X(l.label.x - width / 2)), y: inch(Y(l.label.y - size * 0.75)), w: inch(S(width)), h: inch(S(size * 1.5)),
      align: 'center', valign: 'middle', margin: 0, fill: { color: 'FFFFFF' },
    });
  }
  if (page.legend) addLegendShapes(slide, pptx, page.legend);
  return slide;
}

function addLegendShapes(slide, pptx, { block, x, y }) {
  const L = LEGEND;
  const text = (s, at, size, opts = {}) => slide.addText(s, { x: inch(at.x), y: inch(at.y), w: inch(at.w), h: inch(at.h ?? L.row), fontFace: 'Calibri', fontSize: size, color: pptColor(opts.color ?? INK.text), bold: !!opts.bold, italic: !!opts.italic, margin: 0, valign: 'middle', lineSpacing: L.line });
  slide.addShape(pptx.ShapeType.roundRect, { x: inch(x), y: inch(y), w: inch(block.w), h: inch(block.h), rectRadius: inch(3), fill: { color: 'FFFFFF' }, line: { color: pptColor(INK.frame), width: 0.6 } });
  text('Legend', { x: x + L.pad, y: y + L.pad - 2, w: block.w - 2 * L.pad }, L.title, { bold: true });
  for (const c of block.columns) for (const g of c.groups) {
    let cy = y + L.pad + block.titleH + g.y;
    const cx = x + L.pad + c.x;
    if (g.head) { text(g.head, { x: cx, y: cy, w: c.w }, L.head, { bold: true, color: INK.muted }); cy += L.headRow; }
    for (const r of g.rows) {
      const sy = cy + (L.row - L.sh) / 2 - 1;
      if (r.line) slide.addShape(pptx.ShapeType.line, { x: inch(cx + 1), y: inch(sy + L.sh / 2), w: inch(L.sw - 2), h: 0, line: { color: pptColor(r.line.stroke), width: Math.min(r.line.strokeWidth, 2.5), dashType: PPT_DASH[r.line.dash] ?? 'solid' } });
      else if (r.box) pptBox(slide, pptx, { ...r.box, x: 0, y: 0, w: L.sw, h: L.sh, strokeWidth: Math.min(r.box.strokeWidth, 1.75) }, v => cx + v, v => sy + v, v => v);
      else text('Aa', { x: cx, y: cy, w: L.sw }, L.text, { italic: true });
      text(r.lines.join('\n'), { x: cx + L.sw + L.gap, y: cy + 1, w: c.w - L.sw - L.gap + 4, h: rowHeight(r) - 2 }, L.text, { italic: r.computed });
      cy += rowHeight(r);
    }
  }
}

// A deck: a title slide, then a slide for each scene.
async function exportPptx(scenes = [chartScene()], { size = 'wide', legend = true, asOf = todayIso() } = {}) {
  await loadLibs('pptx');
  const pptx = new PptxGenJS();
  pptx.layout = PAGE_SIZES[size].slide;
  pptx.title = scenes[0].title;
  addPageSlide(pptx, titlePage(size, scenes[0].title, asOf));
  for (const p of pagesFor(scenes, { format: 'pptx', size, legend, asOf })) addPageSlide(pptx, p);
  const blob = await pptx.write({ outputType: 'blob' });
  deliver(blob, fileName([scenes[0].title, scenes.length > 1 ? 'All views' : scenes[0].view], 'pptx'));
  return blob;
}

// ---- An object's profile ----

// The title block above and the footer below, on every page.
function pdfFrame(doc, { title, subtitle, footer, page, pages }) {
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  doc.setFont('helvetica', 'bold').setFontSize(15).setTextColor(INK.text).text(title, 36, 42);
  if (subtitle) doc.setFont('helvetica', 'normal').setFontSize(9.5).setTextColor(INK.muted).text(subtitle, 36, 57);
  doc.setDrawColor(INK.rule).setLineWidth(0.6).line(36, 66, W - 36, 66).line(36, H - 34, W - 36, H - 34);
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(INK.muted);
  doc.text(footer, 36, H - 22);
  doc.text(`Page ${page} of ${pages}`, W - 36, H - 22, { align: 'right' });
}

// What the profile says a record's output is.
function profileValue(r) {
  if (isTag(r)) return r.tag ? 'Yes' : 'Ruled out';
  if (isChoice(r)) return r.choice;
  if (isField(r)) return displayValue(r);
  return '';
}

// One page (or more) about one object: its entries, as the panel lists them, then its relations by name.
async function exportRecordPdf(objectId, { asOf = todayIso() } = {}) {
  await loadLibs('pdf');
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  const name = objectName(objectId);
  // A computed value is in italics, as in the app, and tagged at the row's right.
  const labelW = 190, valueX = 36 + labelW + 12, valueW = W - 36 - 56 - valueX;
  let y = 90;
  const newPage = () => { doc.addPage(); y = 90; };
  const room = need => { if (y + need > H - 50) newPage(); };
  const heading = text => {
    room(40);
    y += 10;
    doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(INK.text).text(text, 36, y);
    y += 8;
    doc.setDrawColor(INK.rule).setLineWidth(0.6).line(36, y, W - 36, y);
    y += 14;
  };
  const row = (label, value, { indent = 0, computed = false } = {}) => {
    const lines = doc.setFont('helvetica', computed ? 'italic' : 'normal').setFontSize(10).splitTextToSize(String(value || '—'), valueW);
    const labelLines = doc.setFont('helvetica', 'normal').splitTextToSize(label, labelW - indent);
    const h = Math.max(lines.length, labelLines.length) * 13 + 4;
    room(h);
    doc.setTextColor(INK.muted).setFont('helvetica', 'normal').text(labelLines, 36 + indent, y);
    doc.setTextColor(INK.text).setFont('helvetica', computed ? 'italic' : 'normal').text(lines, valueX, y);
    if (computed) doc.setFontSize(7.5).setTextColor(INK.faint).setFont('helvetica', 'normal').text('Computed', W - 36, y, { align: 'right' });
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
      footer: `${chartTitle()} · Profile of ${name} · As of ${longDate(asOf)}`, page: p, pages: count,
    });
  }
  const blob = doc.output('blob');
  deliver(blob, fileName([name, 'Profile'], 'pdf'));
  return blob;
}

// ---- The Export dialog ----
// Diligent's and Lucid's model: on the left the format, the views, the page and the "as of" date, and
// whether the legend comes along; on the right a live preview of every page or slide, drawn from the same
// layout the file is made from. Its choices are remembered while the page is open.

const FORMATS_OUT = [['pdf', 'PDF'], ['pptx', 'PowerPoint'], ['svg', 'SVG']];
const exportUi = {
  open: false,
  format: 'pdf',
  views: 'this',          // 'this', or 'all' for a page or slide per view
  size: 'letter',         // a PDF's page
  slide: 'wide',          // a deck's slides
  orientation: 'auto',
  legend: null,           // null follows the chart's own legend switch
  asOf: '',
  busy: false,
  error: null,
  scenes: null,           // every view's scene, read when the dialog opens
  back: null,             // what had focus before it opened
};

const exportLegend = () => exportUi.legend ?? legendShown();
const exportScenes = () => exportUi.views === 'all' && exportUi.format !== 'svg' ? views.map(v => exportUi.scenes[v.id]) : [exportUi.scenes[viewId]];
const exportSettings = () => ({ format: exportUi.format, size: exportUi.format === 'pptx' ? exportUi.slide : exportUi.size, orientation: exportUi.orientation, legend: exportLegend(), asOf: exportUi.asOf || todayIso() });

function openExport() {
  if (chart.presenting) stopPresenting();
  Object.assign(exportUi, { open: true, busy: false, error: null, asOf: exportUi.asOf || todayIso(), scenes: viewScenes(), back: document.activeElement });
  drawExport();
  document.querySelector('[data-export="format"]')?.focus();
}

function closeExport() {
  if (!exportUi.open) return;
  Object.assign(exportUi, { open: false, scenes: null, error: null });
  document.getElementById('export').innerHTML = '';
  exportUi.back?.focus?.();
}

const option = (value, text, current) => `<option value="${esc(value)}"${value === current ? ' selected' : ''}>${esc(text)}</option>`;
const exportField = (label, control, note = '') => `<label class="export-field"><span class="export-label">${label}</span><span class="export-control">${control}${note ? `<span class="export-hint">${note}</span>` : ''}</span></label>`;

function exportPreview() {
  const scenes = exportScenes();
  const s = exportSettings();
  if (s.format === 'svg') return `<figure class="export-page is-picture">${pictureSvg(scenes[0], s.legend)}</figure>`;
  const pages = pagesFor(scenes, s);
  const all = s.format === 'pptx' ? [titlePage(s.size, scenes[0].title, s.asOf), ...pages] : pages;
  return all.map((p, i) => `<figure class="export-page">${p.cover ? coverSvg(p) : pageSvg(p)}
    <figcaption>${s.format === 'pptx' ? (p.cover ? 'Title slide' : `Slide ${i + 1}: ${esc(p.scene.view)}`) : `Page ${i + 1}: ${esc(p.scene.view)}`}</figcaption></figure>`).join('');
}

function exportSummary() {
  const n = exportScenes().length;
  const f = exportUi.format;
  const what = f === 'svg' ? 'One picture' : f === 'pptx' ? `${count(n + 1, 'slide')}, with a title slide, as editable shapes` : `${count(n, 'page')} of vector PDF`;
  return `${what}. Made in your browser; nothing is uploaded.`;
}

function drawExport() {
  const host = document.getElementById('export');
  if (!exportUi.open) { host.innerHTML = ''; return; }
  const f = exportUi.format;
  const scroll = host.querySelector('.export-preview')?.scrollTop ?? 0;
  const sel = selection();
  const pageSizes = f === 'pptx' ? ['wide', 'standard'] : ['letter', 'a4', 'tabloid'];
  const fields = [
    exportField('Format', `<select class="input" data-export="format">${FORMATS_OUT.map(([v, t]) => option(v, t, f)).join('')}</select>`),
    exportField('Views', `<select class="input" data-export="views"${f === 'svg' ? ' disabled' : ''}>${option('this', `This view: ${viewInUse().name}`, f === 'svg' ? 'this' : exportUi.views)}${views.length > 1 ? option('all', `Every view, ${f === 'pptx' ? 'a slide' : 'a page'} each (${views.length})`, f === 'svg' ? 'this' : exportUi.views) : ''}</select>`,
      f === 'svg' ? 'An SVG is one picture, of this view' : ''),
    f === 'svg' ? '' : exportField(f === 'pptx' ? 'Slide size' : 'Page size', `<select class="input" data-export="${f === 'pptx' ? 'slide' : 'size'}">${pageSizes.map(k => option(k, PAGE_SIZES[k].name, f === 'pptx' ? exportUi.slide : exportUi.size)).join('')}</select>`),
    f === 'pdf' ? exportField('Orientation', `<select class="input" data-export="orientation">${[['auto', 'To suit each view'], ['landscape', 'Landscape'], ['portrait', 'Portrait']].map(([v, t]) => option(v, t, exportUi.orientation)).join('')}</select>`) : '',
    f === 'svg' ? '' : exportField('As of', `<input class="input" type="date" data-export="asOf" value="${esc(exportUi.asOf)}">`, 'Printed in the footer'),
    `<div class="export-field"><span class="export-label"></span><button class="export-check" data-cmd="chart.export-legend" aria-pressed="${exportLegend()}">${box(exportLegend() ? true : null)}Include the legend</button></div>`,
  ].join('');
  const profile = sel.object ? `<button class="link-btn export-profile" data-cmd="chart.export-profile" title="A PDF of its entries and relations">Profile of ${esc(objectName(sel.object))} instead…</button>` : '';
  host.innerHTML = `<div class="scrim" data-cmd="chart.export-close"></div>
    <div class="dialog export-dialog" role="dialog" aria-modal="true" aria-labelledby="export-title">
      <div class="export-main">
        <div class="export-form">
          <h2 class="dialog-title" id="export-title">Export</h2>
          <p class="export-sub">${esc(chartTitle())}</p>
          ${fields}
          ${exportUi.error ? `<p class="export-error" role="alert">Couldn’t export: ${esc(exportUi.error)}</p>` : ''}
        </div>
        <div class="export-preview" aria-label="Preview">${exportPreview()}</div>
      </div>
      <div class="export-foot">
        <span class="export-summary">${esc(exportSummary())}</span>${profile}
        <span class="export-actions"><button class="btn" data-cmd="chart.export-close">Cancel</button>
        <button class="btn btn-primary" data-cmd="chart.export-run" data-default${exportUi.busy ? ' disabled' : ''}>${exportUi.busy ? 'Exporting…' : `Export ${FORMATS_OUT.find(([v]) => v === f)[1]}`}</button></span>
      </div>
    </div>`;
  const preview = host.querySelector('.export-preview');
  if (preview) preview.scrollTop = scroll;
}

async function runExport() {
  if (exportUi.busy) return;
  const scenes = exportScenes();
  const s = exportSettings();
  const name = FORMATS_OUT.find(([v]) => v === s.format)[1];
  exportUi.busy = true;
  exportUi.error = null;
  drawExport();
  try {
    if (s.format === 'pdf') await exportPdf(scenes, s);
    else if (s.format === 'pptx') await exportPptx(scenes, s);
    else exportSvg(scenes[0], s);
    exportUi.busy = false;
    closeExport();
    say(`Exported ${scenes.length > 1 ? 'every view' : scenes[0].view} as ${name === 'PowerPoint' ? 'a PowerPoint deck' : name}`);
  } catch (e) {
    Object.assign(exportUi, { busy: false, error: e.message });
    drawExport();
  }
}

async function exportProfile(id) {
  closeExport();
  try {
    await exportRecordPdf(id, { asOf: exportUi.asOf || todayIso() });
    say(`Exported a profile of ${objectName(id)}`);
  } catch (e) {
    sayError(`Couldn’t export the profile: ${e.message}`);
  }
}

Shell.on('chart.export-close', closeExport);
Shell.on('chart.export-run', runExport);
Shell.on('chart.export-legend', () => { exportUi.legend = !exportLegend(); drawExport(); });
Shell.on('chart.export-profile', () => { const id = selection().object; if (id) exportProfile(id); });

document.addEventListener('change', e => {
  const key = e.target.dataset?.export;
  if (!key || !exportUi.open) return;
  exportUi[key] = e.target.value;
  drawExport();
  document.querySelector(`[data-export="${key}"]`)?.focus();
});

// While the dialog is open it has the keyboard: Esc closes it, Enter exports, Tab stays inside it, and
// nothing reaches the chart, the panel or the shell behind it.
window.addEventListener('keydown', e => {
  if (!exportUi.open) return;
  e.stopPropagation();
  if (e.key === 'Escape') { e.preventDefault(); return closeExport(); }
  if (e.key === 'Enter' && !e.target.matches('button, select')) { e.preventDefault(); return runExport(); }
  if (e.key === 'Tab') {
    const items = [...document.querySelectorAll('#export .dialog :is(button, select, input):not(:disabled)')];
    const at = items.indexOf(document.activeElement);
    const next = e.shiftKey ? (at <= 0 ? items.length - 1 : at - 1) : (at === items.length - 1 ? 0 : at + 1);
    e.preventDefault();
    items[next]?.focus();
  }
}, true);
