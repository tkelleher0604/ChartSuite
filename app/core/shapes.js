// Shapes: PowerPoint's preset shapes, one table of them. Each by a plain name, with what the gallery calls it and heads it
// under, its preset in a deck, its connection sites, its outline as a path in a w × h frame (the canvas, the PDF and the
// glyphs all draw that), and where it sets its text. The scene, the format bar, the inspector and the export all read this,
// so a shape added here is in every one of them. A path's numbers are PowerPoint's own guides where the shape is one a chart
// draws often, and near enough for what's set into its frame elsewhere: the deck names the preset, so PowerPoint draws its own.
const Shapes = (() => {
const CORNER = 16.667;
const n = v => +v.toFixed(2);
const poly = ps => `M${ps.map(([x, y]) => `${n(x)},${n(y)}`).join(' L')} Z`;
const open = ps => `M${ps.map(([x, y]) => `${n(x)},${n(y)}`).join(' L')}`;
const arc = (x, y, rx, ry = rx, sweep = 1, large = 0) => `A${n(rx)},${n(ry)} 0 ${large} ${sweep} ${n(x)},${n(y)}`;
const ellipse = (w, h, cx = w / 2, cy = h / 2) => `M${n(cx - w / 2)},${n(cy)} ${arc(cx + w / 2, cy, w / 2, h / 2)} ${arc(cx - w / 2, cy, w / 2, h / 2)} Z`;
// A star of `points` points, its inner radius a share of its outer, its first point up.
const star = (points, inner, kx = 1, ky = 1, dy = 0) => (w, h) => {
  const cx = w / 2, cy = h / 2 * ky + dy, rx = w / 2 * kx, ry = h / 2 * ky, out = [];
  for (let i = 0; i < points * 2; i++) { const a = -Math.PI / 2 + i * Math.PI / points, r = i % 2 ? inner : 1; out.push([cx + rx * r * Math.cos(a), cy + ry * r * Math.sin(a)]); }
  return poly(out);
};
// A rectangle's outline with a wedge from it to a tip, on the side the tip is off: PowerPoint's wedgeRectCallout. Its corners rounded by `r`.
function wedge(w, h, [ax, ay], r = 0) {
  const dx = w * ax, dy = h * ay, X = w / 2 + dx, Y = h / 2 + dy, far = Math.abs(dy) - Math.abs(dx * h / w) > 0;
  const x1 = w * (dx > 0 ? 7 : 2) / 12, x2 = w * (dx > 0 ? 10 : 5) / 12, y1 = h * (dy > 0 ? 7 : 2) / 12, y2 = h * (dy > 0 ? 10 : 5) / 12;
  const top = far && dy < 0, bottom = far && dy > 0, left = !far && dx < 0, right = !far && dx > 0, c = (x, y) => r ? arc(x, y, r) : '';
  return `M${n(r)},0 H${n(x1)} ${top ? `L${n(X)},${n(Y)} L${n(x2)},0` : `H${n(x2)}`} H${n(w - r)} ${c(w, r)} V${n(y1)} ${right ? `L${n(X)},${n(Y)} L${n(w)},${n(y2)}` : `V${n(y2)}`} V${n(h - r)} ${c(w - r, h)}`
    + ` H${n(x2)} ${bottom ? `L${n(X)},${n(Y)} L${n(x1)},${n(h)}` : `H${n(x1)}`} H${n(r)} ${c(0, h - r)} V${n(y2)} ${left ? `L${n(X)},${n(Y)} L0,${n(y1)}` : `V${n(y1)}`} V${n(r)} ${c(r, 0)} Z`;
}
// An oval with a wedge to a tip, as wedgeEllipseCallout: the wedge 11 degrees either side of the way the tip lies.
function wedgeOval(w, h, [ax, ay]) {
  const X = w / 2 + w * ax, Y = h / 2 + h * ay, ang = Math.atan2((Y - h / 2) * w / h, X - w / 2), at = a => [w / 2 + w / 2 * Math.cos(a), h / 2 + h / 2 * Math.sin(a)], d = 11 * Math.PI / 180, [x1, y1] = at(ang + d), [x2, y2] = at(ang - d);
  return `M${n(X)},${n(Y)} L${n(x1)},${n(y1)} ${arc(x2, y2, w / 2, h / 2, 1, 1)} Z`;
}
// The line callout: its box, and a line out to a tip from its edge.
function lineCallout(w, h, [ax, ay]) {
  const X = w / 2 + w * ax, Y = h / 2 + h * ay, fromX = X < 0 ? 0 : X > w ? w : w / 2, fromY = X < 0 || X > w ? h / 2 : Y < 0 ? 0 : h;
  return `M0,0 H${n(w)} V${n(h)} H0 Z M${n(fromX)},${n(fromY)} L${n(X)},${n(Y)}`;
}
const brace = (w, h, flip) => { const q = Math.min(Math.min(w, h) * 0.08333, h / 4), m = h / 2, x = v => flip ? w - v : v, s = flip ? 0 : 1, r = flip ? 1 : 0;
  return `M${n(x(w))},${n(h)} ${arc(x(w / 2), h - q, w / 2, q, s)} V${n(m + q)} ${arc(x(0), m, w / 2, q, r)} ${arc(x(w / 2), m - q, w / 2, q, r)} V${n(q)} ${arc(x(w), 0, w / 2, q, s)}`; };
const bracket = (w, h, flip) => { const q = Math.min(Math.min(w, h) * 0.08333, h / 2), x = v => flip ? w - v : v, s = flip ? 0 : 1;
  return `M${n(x(w))},${n(h)} ${arc(x(0), h - q, w, q, s)} V${n(q)} ${arc(x(w), 0, w, q, s)}`; };
const heart = (w, h) => `M${n(w / 2)},${n(h / 4)} C${n(w * 0.65)},${n(-h / 12)} ${n(w * 1.2)},${n(h / 4)} ${n(w / 2)},${n(h)} C${n(-w * 0.2)},${n(h / 4)} ${n(w * 0.35)},${n(-h / 12)} ${n(w / 2)},${n(h / 4)} Z`;
const cloud = (w, h) => `M${n(w * 0.25)},${n(h * 0.8)} C${n(w * 0.05)},${n(h * 0.85)} ${n(-w * 0.02)},${n(h * 0.55)} ${n(w * 0.13)},${n(h * 0.47)} C${n(w * 0.03)},${n(h * 0.25)} ${n(w * 0.25)},${n(h * 0.12)} ${n(w * 0.34)},${n(h * 0.22)}`
  + ` C${n(w * 0.42)},${n(-h * 0.03)} ${n(w * 0.68)},${n(-h * 0.02)} ${n(w * 0.7)},${n(h * 0.17)} C${n(w * 0.88)},${n(h * 0.05)} ${n(w * 1.05)},${n(h * 0.3)} ${n(w * 0.92)},${n(h * 0.47)}`
  + ` C${n(w * 1.04)},${n(h * 0.7)} ${n(w * 0.85)},${n(h * 0.92)} ${n(w * 0.7)},${n(h * 0.82)} C${n(w * 0.6)},${n(h * 1.03)} ${n(w * 0.34)},${n(h * 1.0)} ${n(w * 0.25)},${n(h * 0.8)} Z`;
const sun = (w, h) => { const cx = w / 2, cy = h / 2, rays = []; for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, d = Math.PI / 20, p = (r, t) => [cx + w / 2 * r * Math.cos(t), cy + h / 2 * r * Math.sin(t)]; rays.push(poly([p(1, a), p(0.62, a - d), p(0.62, a + d)])); } return `${ellipse(w / 2, h / 2, cx, cy)} ${rays.join(' ')}`; };
const moon = (w, h) => `M${n(w)},0 ${arc(w, h, w, h / 2, 0, 0)} ${arc(w, 0, w / 2, h * 0.62, 1, 0)} Z`;
const bolt = (w, h) => poly([[w * 0.39, 0], [w * 0.66, h * 0.3], [w * 0.54, h * 0.36], [w * 0.8, h * 0.58], [w * 0.69, h * 0.64], [w, h], [w * 0.44, h * 0.7], [w * 0.56, h * 0.63], [w * 0.22, h * 0.47], [w * 0.34, h * 0.39], [0, h * 0.2]]);

// A text's rect, in from each side: x in from the sides, `shift` of its middle from the shape's, top and bottom.
const rect0 = () => ({ x: 0, top: 0, bottom: 0 });
// The table. A preset's sites facing up, left, down and right, as PowerPoint numbers them; where a side has two, the first is the nearer its start.
const FOUR = [0, 1, 2, 3];
const TABLE = [
  // Basic shapes: the ones a chart's made of, first.
  ['rect', 'Rectangle', 'Basic shapes', 'rect', FOUR, (w, h) => `M0,0 H${n(w)} V${n(h)} H0 Z`],
  ['rounded', 'Rounded rectangle', 'Basic shapes', 'roundRect', FOUR, (w, h, c = CORNER) => { const r = Math.min(w, h) * Math.min(50, Math.max(0, c)) / 100; return `M${n(r)},0 H${n(w - r)} ${arc(w, r, r)} V${n(h - r)} ${arc(w - r, h, r)} H${n(r)} ${arc(0, h - r, r)} V${n(r)} ${arc(r, 0, r)} Z`; },
    (w, h, c = CORNER) => { const x = Math.min(50, Math.max(0, c)) / 100 * 0.29289 * Math.min(w, h); return { x, top: x, bottom: x }; }],
  ['oval', 'Oval', 'Basic shapes', 'ellipse', [0, 2, 4, 6], (w, h) => `M0,${n(h / 2)} ${arc(w, h / 2, w / 2, h / 2, 1, 1)} ${arc(0, h / 2, w / 2, h / 2, 1, 1)} Z`, null, 0.78],
  ['triangle', 'Triangle', 'Basic shapes', 'triangle', [0, 1, 3, 5], (w, h) => poly([[w / 2, 0], [w, h], [0, h]]), null, 0.62],
  ['rtriangle', 'Right triangle', 'Basic shapes', 'rtTriangle', [0, 1, 3, 5], (w, h) => poly([[0, 0], [w, h], [0, h]]), (w, h) => ({ x: w / 4, shift: -w / 6, top: h * 7 / 12, bottom: h / 12 })],
  ['diamond', 'Diamond', 'Basic shapes', 'diamond', FOUR, (w, h) => poly([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]]), null, 0.56],
  ['parallelogram', 'Parallelogram', 'Basic shapes', 'parallelogram', [0, 5, 4, 2], (w, h) => { const a = Math.min(w, h) * 0.25; return poly([[a, 0], [w, 0], [w - a, h], [0, h]]); }, (w, h) => { const q = (1 + 1.25 * Math.min(w, h) / w) / 12; return { x: q * w, top: q * h, bottom: q * h }; }],
  ['trapezoid', 'Trapezoid', 'Basic shapes', 'trapezoid', FOUR, (w, h) => { const a = Math.min(w, h) * 0.25; return poly([[a, 0], [w - a, 0], [w, h], [0, h]]); }, (w, h) => { const x = Math.min(w, h) / 6; return { x, top: x * h / w, bottom: 0 }; }],
  ['pentagon', 'Pentagon', 'Basic shapes', 'pentagon', [0, 1, 3, 5], (w, h) => poly([[w / 2, 0], [w, h * 0.38], [w * 0.81, h], [w * 0.19, h], [0, h * 0.38]]), null, 0.7],
  ['hexagon', 'Hexagon', 'Basic shapes', 'hexagon', [[4, 5], 3, [2, 1], 0], (w, h) => { const a = Math.min(w, h) * 0.25; return poly([[a, 0], [w - a, 0], [w, h / 2], [w - a, h], [a, h], [0, h / 2]]); }, null, 0.8],
  ['heptagon', 'Heptagon', 'Basic shapes', 'heptagon', [6, 4, [3, 2], 1], (w, h) => { const cx = w / 2, rx = cx * 1.02572, ry = h / 2 * 1.05210, cy = h / 2 * 1.05210; return poly([[cx - rx * 0.97493, cy + ry * 0.22252], [cx - rx * 0.78183, cy - ry * 0.62349], [cx, 0], [cx + rx * 0.78183, cy - ry * 0.62349], [cx + rx * 0.97493, cy + ry * 0.22252], [cx + rx * 0.43388, cy + ry * 0.90097], [cx - rx * 0.43388, cy + ry * 0.90097]]); }, (w, h) => ({ x: w * 0.09903, top: h * 0.19806, bottom: 0 })],
  ['octagon', 'Octagon', 'Basic shapes', 'octagon', [[6, 7], [5, 4], [3, 2], [0, 1]], (w, h) => { const c = Math.min(w, h) * 0.29289; return poly([[c, 0], [w - c, 0], [w, c], [w, h - c], [w - c, h], [c, h], [0, h - c], [0, c]]); }, null, 0.8],
  ['decagon', 'Decagon', 'Basic shapes', 'decagon', [[8, 9], 6, [4, 3], 1], (w, h) => { const cx = w / 2, cy = h / 2, ry = h / 2 * 1.05146, dx1 = cx * 0.80902, dx2 = cx * 0.30902, dy1 = ry * 0.58779, dy2 = ry * 0.95106; return poly([[0, cy], [cx - dx1, cy - dy1], [cx - dx2, cy - dy2], [cx + dx2, cy - dy2], [cx + dx1, cy - dy1], [w, cy], [cx + dx1, cy + dy1], [cx + dx2, cy + dy2], [cx - dx2, cy + dy2], [cx - dx1, cy + dy1]]); }, (w, h) => ({ x: w * 0.09549, top: h * 0.19098, bottom: h * 0.19098 })],
  ['dodecagon', 'Dodecagon', 'Basic shapes', 'dodecagon', [[10, 11], [8, 7], [5, 4], [1, 2]], (w, h) => { const [x1, x2, x3, x4] = [2894, 7906, 13694, 18706].map(k => w * k / 21600), [y1, y2, y3, y4] = [2894, 7906, 13694, 18706].map(k => h * k / 21600); return poly([[0, y2], [x1, y1], [x2, 0], [x3, 0], [x4, y1], [w, y2], [w, y3], [x4, y4], [x3, h], [x2, h], [x1, y4], [0, y3]]); }, (w, h) => ({ x: w * 2894 / 21600, top: h * 2894 / 21600, bottom: h * 2894 / 21600 })],
  ['cylinder', 'Cylinder', 'Basic shapes', 'can', [1, 2, 3, 4], (w, h) => { const r = Math.min(w, h) * 0.125; return `M0,${n(r)} ${arc(w, r, w / 2, r)} V${n(h - r)} ${arc(0, h - r, w / 2, r)} Z M0,${n(r)} ${arc(w, r, w / 2, r, 0)}`; }, (w, h) => { const y = Math.min(w, h) / 8; return { x: 0, top: 2 * y, bottom: y }; }],
  ['cube', 'Cube', 'Basic shapes', 'cube', [0, 2, 3, 5], (w, h) => { const d = Math.min(w, h) * 0.25; return `M0,${n(d)} H${n(w - d)} V${n(h)} H0 Z M0,${n(d)} L${n(d)},0 H${n(w)} L${n(w - d)},${n(d)} M${n(w)},0 V${n(h - d)} L${n(w - d)},${n(h)}`; }, (w, h) => { const d = Math.min(w, h) * 0.25; return { x: d / 2, shift: -d / 2, top: d, bottom: 0 }; }],
  ['folded', 'Folded corner', 'Basic shapes', 'foldedCorner', FOUR, (w, h) => { const a = Math.min(w, h) * 0.16667; return `M0,0 H${n(w)} V${n(h - a)} L${n(w - a)},${n(h)} H0 Z M${n(w - a)},${n(h)} L${n(w - a + a / 5)},${n(h - a + a / 5)} L${n(w)},${n(h - a)}`; }, (w, h) => ({ x: 0, top: 0, bottom: Math.min(w, h) * 0.16667 })],
  ['plus', 'Cross', 'Basic shapes', 'plus', FOUR, (w, h) => { const a = Math.min(w, h) * 0.25; return poly([[a, 0], [w - a, 0], [w - a, a], [w, a], [w, h - a], [w - a, h - a], [w - a, h], [a, h], [a, h - a], [0, h - a], [0, a], [a, a]]); }],
  ['donut', 'Donut', 'Basic shapes', 'donut', [0, 2, 4, 6], (w, h) => { const d = Math.min(w, h) * 0.25; return `M0,${n(h / 2)} ${arc(w, h / 2, w / 2, h / 2, 1, 1)} ${arc(0, h / 2, w / 2, h / 2, 1, 1)} Z M${n(d)},${n(h / 2)} ${arc(w - d, h / 2, w / 2 - d, h / 2 - d, 0, 1)} ${arc(d, h / 2, w / 2 - d, h / 2 - d, 0, 1)} Z`; }, null, 0.5],
  ['frameshape', 'Frame', 'Basic shapes', 'frame', FOUR, (w, h) => { const d = Math.min(w, h) * 0.125; return `M0,0 H${n(w)} V${n(h)} H0 Z M${n(d)},${n(d)} V${n(h - d)} H${n(w - d)} V${n(d)} Z`; }],
  ['corner', 'L-shape', 'Basic shapes', 'corner', FOUR, (w, h) => { const d = Math.min(w, h) * 0.5; return poly([[0, 0], [d, 0], [d, h - d], [w, h - d], [w, h], [0, h]]); }],
  ['teardrop', 'Teardrop', 'Basic shapes', 'teardrop', [0, 1, 2, 3], (w, h) => `M0,${n(h / 2)} ${arc(w / 2, 0, w / 2, h / 2)} L${n(w)},0 L${n(w)},${n(h / 2)} ${arc(w / 2, h, w / 2, h / 2)} ${arc(0, h / 2, w / 2, h / 2)} Z`, null, 0.72],
  ['heart', 'Heart', 'Basic shapes', 'heart', [0, 1, 2, 3], heart, null, 0.6],
  ['lightning', 'Lightning bolt', 'Basic shapes', 'lightningBolt', [0, 1, 2, 3], bolt, null, 0.4],
  ['sun', 'Sun', 'Basic shapes', 'sun', FOUR, sun, null, 0.5],
  ['moon', 'Moon', 'Basic shapes', 'moon', [0, 1, 2, 3], moon, null, 0.5],
  ['cloud', 'Cloud', 'Basic shapes', 'cloud', [0, 1, 2, 3], cloud, null, 0.7],
  // Rectangles, of one corner or another.
  ['snip', 'Snip single corner', 'Rectangles', 'snip1Rect', [3, 2, 1, 0], (w, h) => { const a = Math.min(w, h) * 0.16667; return poly([[0, 0], [w - a, 0], [w, a], [w, h], [0, h]]); }, (w, h) => { const a = Math.min(w, h) * 0.16667; return { x: a / 4, shift: -a / 4, top: a / 2, bottom: 0 }; }],
  ['snip2', 'Snip same side corners', 'Rectangles', 'snip2SameRect', [3, 2, 1, 0], (w, h) => { const a = Math.min(w, h) * 0.16667; return poly([[a, 0], [w - a, 0], [w, a], [w, h], [0, h], [0, a]]); }, (w, h) => { const a = Math.min(w, h) * 0.16667; return { x: a / 2, top: a / 2, bottom: 0 }; }],
  ['round1', 'Round single corner', 'Rectangles', 'round1Rect', FOUR, (w, h) => { const a = Math.min(w, h) * 0.16667; return `M0,0 H${n(w - a)} ${arc(w, a, a)} V${n(h)} H0 Z`; }, (w, h) => { const i = Math.min(w, h) * 0.16667 * 0.29289; return { x: i / 2, shift: -i / 2, top: 0, bottom: 0 }; }],
  ['round2', 'Round same side corners', 'Rectangles', 'round2SameRect', [3, 2, 1, 0], (w, h, c = CORNER) => { const a = Math.min(w, h) * Math.min(50, Math.max(0, c)) / 100; return `M${n(a)},0 H${n(w - a)} ${arc(w, a, a)} V${n(h)} H0 V${n(a)} ${arc(a, 0, a)} Z`; }, (w, h) => { const i = Math.min(w, h) * 0.16667 * 0.29289; return { x: i, top: i, bottom: 0 }; }],
  ['plaque', 'Plaque', 'Rectangles', 'plaque', FOUR, (w, h) => { const a = Math.min(w, h) * 0.16667; return `M0,${n(a)} ${arc(a, 0, a, a, 0)} H${n(w - a)} ${arc(w, a, a, a, 0)} V${n(h - a)} ${arc(w - a, h, a, a, 0)} H${n(a)} ${arc(0, h - a, a, a, 0)} Z`; }, (w, h) => { const i = Math.min(w, h) * 0.16667 * 0.70711; return { x: i, top: i, bottom: i }; }],
  // Brackets and braces, what a chart gathers things with.
  ['leftbracket', 'Left bracket', 'Brackets and braces', 'leftBracket', [1, 1, 1, 1], (w, h) => bracket(w, h, false)],
  ['rightbracket', 'Right bracket', 'Brackets and braces', 'rightBracket', [1, 1, 1, 1], (w, h) => bracket(w, h, true)],
  ['leftbrace', 'Left brace', 'Brackets and braces', 'leftBrace', [1, 1, 1, 1], (w, h) => brace(w, h, false)],
  ['rightbrace', 'Right brace', 'Brackets and braces', 'rightBrace', [1, 1, 1, 1], (w, h) => brace(w, h, true)],
  ['bracketpair', 'Double bracket', 'Brackets and braces', 'bracketPair', FOUR, (w, h) => { const q = Math.min(w, h) * 0.16667; return `M${n(q)},${n(h)} ${arc(0, h - q, q)} V${n(q)} ${arc(q, 0, q)} M${n(w - q)},0 ${arc(w, q, q)} V${n(h - q)} ${arc(w - q, h, q)}`; }],
  ['bracepair', 'Double brace', 'Brackets and braces', 'bracePair', FOUR, (w, h) => { const q = Math.min(w, h) * 0.08333, m = h / 2; return `M${n(q * 2)},${n(h)} ${arc(q, h - q, q)} V${n(m + q)} ${arc(0, m, q, q, 0)} ${arc(q, m - q, q, q, 0)} V${n(q)} ${arc(q * 2, 0, q)} M${n(w - q * 2)},0 ${arc(w - q, q, q)} V${n(m - q)} ${arc(w, m, q, q, 0)} ${arc(w - q, m + q, q, q, 0)} V${n(h - q)} ${arc(w - q * 2, h, q)}`; }],
  // Block arrows.
  ['arrow', 'Right arrow', 'Block arrows', 'rightArrow', FOUR, (w, h) => { const a = Math.min(w, h) * 0.5; return poly([[0, h / 4], [w - a, h / 4], [w - a, 0], [w, h / 2], [w - a, h], [w - a, h * 3 / 4], [0, h * 3 / 4]]); }, null, 0.6],
  ['leftarrow', 'Left arrow', 'Block arrows', 'leftArrow', FOUR, (w, h) => { const a = Math.min(w, h) * 0.5; return poly([[w, h / 4], [a, h / 4], [a, 0], [0, h / 2], [a, h], [a, h * 3 / 4], [w, h * 3 / 4]]); }, null, 0.6],
  ['uparrow', 'Up arrow', 'Block arrows', 'upArrow', FOUR, (w, h) => { const a = Math.min(w, h) * 0.5; return poly([[w / 4, h], [w / 4, a], [0, a], [w / 2, 0], [w, a], [w * 3 / 4, a], [w * 3 / 4, h]]); }, null, 0.5],
  ['downarrow', 'Down arrow', 'Block arrows', 'downArrow', FOUR, (w, h) => { const a = Math.min(w, h) * 0.5; return poly([[w / 4, 0], [w / 4, h - a], [0, h - a], [w / 2, h], [w, h - a], [w * 3 / 4, h - a], [w * 3 / 4, 0]]); }, null, 0.5],
  ['leftrightarrow', 'Left-right arrow', 'Block arrows', 'leftRightArrow', FOUR, (w, h) => { const a = Math.min(w, h) * 0.5; return poly([[0, h / 2], [a, 0], [a, h / 4], [w - a, h / 4], [w - a, 0], [w, h / 2], [w - a, h], [w - a, h * 3 / 4], [a, h * 3 / 4], [a, h]]); }, null, 0.6],
  ['updownarrow', 'Up-down arrow', 'Block arrows', 'upDownArrow', FOUR, (w, h) => { const a = Math.min(w, h) * 0.5; return poly([[w / 2, 0], [w, a], [w * 3 / 4, a], [w * 3 / 4, h - a], [w, h - a], [w / 2, h], [0, h - a], [w / 4, h - a], [w / 4, a], [0, a]]); }, null, 0.5],
  ['chevron', 'Chevron', 'Block arrows', 'chevron', FOUR, (w, h) => { const a = Math.min(w, h) * 0.5; return poly([[0, 0], [w - a, 0], [w, h / 2], [w - a, h], [0, h], [a, h / 2]]); }, null, 0.6],
  ['homeplate', 'Pentagon arrow', 'Block arrows', 'homePlate', FOUR, (w, h) => { const s = Math.min(w, h); return poly([[0, 0], [w - s / 2, 0], [w, h / 2], [w - s / 2, h], [0, h]]); }, (w, h) => { const a = Math.min(w, h) / 2; return { x: a / 4, shift: -a / 4, top: 0, bottom: 0 }; }],
  // Flowchart.
  ['fc-process', 'Process', 'Flowchart', 'flowChartProcess', FOUR, (w, h) => `M0,0 H${n(w)} V${n(h)} H0 Z`],
  ['fc-alt', 'Alternate process', 'Flowchart', 'flowChartAlternateProcess', FOUR, (w, h) => { const r = Math.min(w, h) / 6; return `M${n(r)},0 H${n(w - r)} ${arc(w, r, r)} V${n(h - r)} ${arc(w - r, h, r)} H${n(r)} ${arc(0, h - r, r)} V${n(r)} ${arc(r, 0, r)} Z`; }, (w, h) => { const x = Math.min(w, h) * 0.0488; return { x, top: x, bottom: x }; }],
  ['fc-decision', 'Decision', 'Flowchart', 'flowChartDecision', FOUR, (w, h) => poly([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]]), null, 0.5],
  ['fc-data', 'Data', 'Flowchart', 'flowChartInputOutput', [0, 2, 3, 5], (w, h) => poly([[w / 5, 0], [w, 0], [w * 4 / 5, h], [0, h]]), (w) => ({ x: w * 0.2, top: 0, bottom: 0 })],
  ['fc-predefined', 'Predefined process', 'Flowchart', 'flowChartPredefinedProcess', FOUR, (w, h) => `M0,0 H${n(w)} V${n(h)} H0 Z M${n(w / 8)},0 V${n(h)} M${n(w * 7 / 8)},0 V${n(h)}`, (w) => ({ x: w / 8, top: 0, bottom: 0 })],
  ['fc-storage', 'Internal storage', 'Flowchart', 'flowChartInternalStorage', FOUR, (w, h) => `M0,0 H${n(w)} V${n(h)} H0 Z M${n(w / 8)},0 V${n(h)} M0,${n(h / 8)} H${n(w)}`, (w, h) => ({ x: w / 16, shift: w / 16, top: h / 8, bottom: 0 })],
  ['fc-document', 'Document', 'Flowchart', 'flowChartDocument', FOUR, (w, h) => `M0,0 H${n(w)} V${n(h * 17322 / 21600)} C${n(w / 2)},${n(h * 17322 / 21600)} ${n(w / 2)},${n(h * 23922 / 21600)} 0,${n(h * 20172 / 21600)} Z`, (w, h) => ({ x: 0, top: 0, bottom: h * 4278 / 21600 })],
  ['fc-terminator', 'Terminator', 'Flowchart', 'flowChartTerminator', FOUR, (w, h) => { const r = Math.min(w * 0.16, h / 2); return `M${n(r)},0 H${n(w - r)} ${arc(w, h / 2, r, h / 2)} ${arc(w - r, h, r, h / 2)} H${n(r)} ${arc(0, h / 2, r, h / 2)} ${arc(r, 0, r, h / 2)} Z`; }, (w, h) => ({ x: w * 0.05, top: h * 0.15, bottom: h * 0.15 })],
  ['fc-preparation', 'Preparation', 'Flowchart', 'flowChartPreparation', FOUR, (w, h) => poly([[w / 5, 0], [w * 4 / 5, 0], [w, h / 2], [w * 4 / 5, h], [w / 5, h], [0, h / 2]]), (w) => ({ x: w / 5, top: 0, bottom: 0 })],
  ['fc-manual', 'Manual input', 'Flowchart', 'flowChartManualInput', FOUR, (w, h) => poly([[0, h / 5], [w, 0], [w, h], [0, h]]), (w, h) => ({ x: 0, top: h / 5, bottom: 0 })],
  ['fc-operation', 'Manual operation', 'Flowchart', 'flowChartManualOperation', FOUR, (w, h) => poly([[0, 0], [w, 0], [w * 4 / 5, h], [w / 5, h]]), (w) => ({ x: w / 5, top: 0, bottom: 0 })],
  ['fc-connector', 'Connector', 'Flowchart', 'flowChartConnector', [0, 2, 4, 6], (w, h) => `M0,${n(h / 2)} ${arc(w, h / 2, w / 2, h / 2, 1, 1)} ${arc(0, h / 2, w / 2, h / 2, 1, 1)} Z`, null, 0.72],
  ['fc-offpage', 'Off-page connector', 'Flowchart', 'flowChartOffpageConnector', FOUR, (w, h) => poly([[0, 0], [w, 0], [w, h * 4 / 5], [w / 2, h], [0, h * 4 / 5]]), (w, h) => ({ x: 0, top: 0, bottom: h / 5 })],
  ['fc-delay', 'Delay', 'Flowchart', 'flowChartDelay', FOUR, (w, h) => `M0,0 H${n(w / 2)} ${arc(w, h / 2, w / 2, h / 2)} ${arc(w / 2, h, w / 2, h / 2)} H0 Z`, (w, h) => ({ x: w * 0.07, shift: -w * 0.07, top: h * 0.15, bottom: h * 0.15 })],
  ['fc-merge', 'Merge', 'Flowchart', 'flowChartMerge', FOUR, (w, h) => poly([[0, 0], [w, 0], [w / 2, h]]), (w, h) => ({ x: w / 4, top: 0, bottom: h / 2 })],
  ['fc-extract', 'Extract', 'Flowchart', 'flowChartExtract', FOUR, (w, h) => poly([[w / 2, 0], [w, h], [0, h]]), (w, h) => ({ x: w / 4, top: h / 2, bottom: 0 })],
  // Stars and banners.
  ['star4', '4-point star', 'Stars and banners', 'star4', FOUR, star(4, 0.25), null, 0.42],
  ['star5', '5-point star', 'Stars and banners', 'star5', FOUR, star(5, 0.38197, 1.05146, 1.10557), null, 0.42],
  ['star6', '6-point star', 'Stars and banners', 'star6', FOUR, star(6, 0.57735, 1.1547, 1), null, 0.5],
  ['star8', '8-point star', 'Stars and banners', 'star8', FOUR, star(8, 0.75), null, 0.6],
  ['star12', '12-point star', 'Stars and banners', 'star12', FOUR, star(12, 0.75), null, 0.6],
  ['ribbon', 'Ribbon', 'Stars and banners', 'ribbon2', [0, 1, 2, 3], (w, h) => { const a = w / 8; return `M0,${n(h)} H${n(a * 2)} V${n(h * 0.17)} H${n(w - a * 2)} V${n(h)} H${n(w)} L${n(w - a)},${n(h / 2)} L${n(w)},${n(h * 0.17)} H${n(w - a)} V0 H${n(a)} V${n(h * 0.17)} H0 L${n(a)},${n(h / 2)} Z`; }, (w, h) => ({ x: w / 4, top: 0, bottom: h * 0.17 })],
  ['wave', 'Wave', 'Stars and banners', 'wave', FOUR, (w, h) => { const a = h * 0.125; return `M0,${n(a)} C${n(w / 3)},${n(a * 3)} ${n(w * 2 / 3)},${n(-a)} ${n(w)},${n(a)} V${n(h - a)} C${n(w * 2 / 3)},${n(h + a - a * 2)} ${n(w / 3)},${n(h + a)} 0,${n(h - a)} Z`; }, (w, h) => ({ x: 0, top: h * 0.25, bottom: h * 0.25 })],
  // Callouts: a wedge or a line out to a tip, where its yellow handle is.
  ['callout', 'Speech bubble', 'Callouts', 'wedgeRectCallout', FOUR, (w, h, c, t) => wedge(w, h, t ?? TAIL)],
  ['callout-round', 'Rounded speech bubble', 'Callouts', 'wedgeRoundRectCallout', FOUR, (w, h, c, t) => wedge(w, h, t ?? TAIL, Math.min(w, h) * 0.16667), (w, h) => { const x = Math.min(w, h) * 0.0488; return { x, top: x, bottom: x }; }],
  ['callout-oval', 'Oval speech bubble', 'Callouts', 'wedgeEllipseCallout', [0, 2, 4, 6], (w, h, c, t) => wedgeOval(w, h, t ?? TAIL), null, 0.72],
  ['callout-line', 'Line callout', 'Callouts', 'borderCallout1', FOUR, (w, h, c, t) => lineCallout(w, h, t ?? TAIL)],
];
// A callout's tip, by default: as PowerPoint draws one, down and left of its middle, as shares of its frame.
const TAIL = [-0.20833, 0.625];
const by = new Map(TABLE.map(([id, name, group, prst, sites, draw, rect, area]) => [id, { id, name, group, prst, sites, draw, rect, area }]));
const CALLOUTS = new Set(['callout', 'callout-round', 'callout-oval', 'callout-line']);
// Those that draw a line, no fill of their own to speak of: a new one comes with none.
const OPEN = new Set(['leftbracket', 'rightbracket', 'leftbrace', 'rightbrace', 'bracketpair', 'bracepair']);
// The gallery: its heads, each its shapes, in a chart's order of need, the near-identical rectangles apart.
const HEADS = [...new Set(TABLE.map(t => t[2]))];
const gallery = () => HEADS.map(head => ({ head, shapes: TABLE.filter(t => t[2] === head).map(t => [t[0], t[1]]) }));

// ---- The designs a chart can begin with (dendra.md, Group designs): each plain data, as a template's own are, its parts free shapes' rows with their
// places as shares of the box. A base's look is what the box takes where nothing else says, so a Styles row's fill still fills it, and a panel over it leaves that showing as its band. `{?}`
// is what a design leaves to the record it's first given to: an entry it has. A look said as {Outline} is the box's. ----
const ACCENT = '#1f4e79', PANEL = { Fill: '#ffffff', Outline: '{Outline}', Weight: '{Weight}' };
const words = (id, y, h, format, x = 0, w = 1) => ({ id, geometry: 'text', x, y, w, h, text: '{Name}', format: { Bold: true, Align: 'center', Valign: 'middle', ...format } });
const others = (y, h, format, x = 0, w = 1) => ({ id: 'rest', rest: true, geometry: 'text', x, y, w, h, format: { Align: 'center', Valign: 'top', ...format } });
const panelled = (y, h, format, x = 0, w = 1) => ({ id: 'rest', rest: true, geometry: 'rect', x, y, w, h, format: { ...PANEL, Align: 'center', Valign: 'middle', ...format } });
const DESIGNS = [
  { id: 'plain', name: 'Plain', base: {}, parts: [] },
  { id: 'rule', name: 'Name rule', w: 148, h: 66, base: { Shape: 'rect' }, parts: [words('name', 0, 0.52, { Valign: 'bottom' }),
    { id: 'rule', geometry: 'line', x: 0.12, y: 0.55, w: 0.76, h: 0, points: [[0.12, 0.55], [0.88, 0.55]], format: { Outline: '{Outline}', Weight: 0.75 } }, others(0.57, 0.43)] },
  { id: 'header', name: 'Header band', w: 156, h: 72, base: { Shape: 'rect', Fill: ACCENT }, parts: [words('name', 0, 0.42), panelled(0.42, 0.58)] },
  { id: 'side', name: 'Side band', w: 164, h: 64, base: { Shape: 'rect', Fill: ACCENT }, parts: [{ id: 'panel', geometry: 'rect', x: 0.08, y: 0, w: 0.92, h: 1, format: PANEL }, words('name', 0.04, 0.5, { Align: 'left', Valign: 'bottom' }, 0.08, 0.92), others(0.54, 0.46, { Align: 'left' }, 0.08, 0.92)] },
  { id: 'corner', name: 'Corner tag', w: 156, h: 70, base: { Shape: 'rect' }, parts: [others(0.24, 0.76, { Valign: 'middle' }),
    { id: 'tag', geometry: 'rect', x: 0.42, y: 0, w: 0.58, h: 0.24, text: '{?}', format: { Fill: ACCENT, Outline: 'none', Inset: { l: 2, r: 2, t: 1, b: 1 }, Align: 'center', Valign: 'middle' } }] },
  { id: 'tiers', name: 'Two tiers', w: 148, h: 76, base: { Shape: 'rect', Fill: '#dbe5f1' }, parts: [words('name', 0, 0.5), panelled(0.5, 0.5)] },
  { id: 'card', name: 'Shadow card', w: 156, h: 66, base: { Shape: 'rounded', Corner: 8, Outline: 'none', Shadow: { blur: 8, distance: 2.5, angle: 90, color: '#000000', transparency: 70 } }, parts: [words('name', 0.04, 0.5, { Align: 'left', Valign: 'bottom' }), others(0.54, 0.46, { Align: 'left' })] },
  { id: 'person', name: 'Person', w: 176, h: 60, base: { Shape: 'rect' }, parts: [{ id: 'face', geometry: 'oval', square: true, x: 0.04, y: 0.14, w: 0.245, h: 0.72, text: '{Name|initials}', format: { Fill: ACCENT, Outline: 'none', Bold: true, Inset: { l: 0, r: 0, t: 0, b: 0 }, Align: 'center', Valign: 'middle' } },
    words('name', 0.04, 0.5, { Align: 'left', Valign: 'bottom' }, 0.3, 0.7), others(0.54, 0.46, { Align: 'left' }, 0.3, 0.7)] },
  { id: 'ticket', name: 'Ticket', w: 156, h: 66, base: { Shape: 'plaque' }, parts: [words('name', 0.04, 0.5, { Valign: 'bottom' }),
    { id: 'tear', geometry: 'line', x: 0.1, y: 0.56, w: 0.8, h: 0, points: [[0.1, 0.56], [0.9, 0.56]], format: { Outline: '{Outline}', Weight: 0.75, Dash: 'dash' } }, others(0.58, 0.42)] },
  { id: 'pill', name: 'Pill', w: 176, h: 44, base: { Shape: 'rounded', Corner: 50 }, parts: [] },
  { id: 'org', name: 'Org card', w: 156, h: 68, base: { Shape: 'rect', Fill: ACCENT }, parts: [{ id: 'panel', geometry: 'rect', x: 0, y: 0.1, w: 1, h: 0.9, format: PANEL }, words('name', 0.12, 0.46, { Valign: 'bottom' }), others(0.58, 0.42)] },
  { id: 'triangle', name: 'Triangle', base: { Shape: 'triangle' }, parts: [] },
];

// ---- Freeforms (dendra.md, Points): a shape by its own points. Its Points are { paths: [{ closed, nodes }], round? }, each node [x, y] in shares of its frame, or [x, y, inX, inY, outX, outY] where a curve comes in and goes out by those handles ----
const dOf = (P, w, h) => (P?.paths ?? []).map(({ nodes, closed }) => {
  const X = v => n(v * w), Y = v => n(v * h), seg = (a, b) => (a[4] != null || b[2] != null) ? `C${X(a[4] ?? a[0])},${Y(a[5] ?? a[1])} ${X(b[2] ?? b[0])},${Y(b[3] ?? b[1])} ${X(b[0])},${Y(b[1])}` : `L${X(b[0])},${Y(b[1])}`;
  return !nodes.length ? '' : `M${X(nodes[0][0])},${Y(nodes[0][1])} ${nodes.slice(1).map((b, i) => seg(nodes[i], b)).join(' ')}${closed ? ` ${nodes.length > 1 && (nodes.at(-1)[4] != null || nodes[0][2] != null) ? seg(nodes.at(-1), nodes[0]) : ''} Z` : ''}`;
}).join(' ');
by.set('freeform', { id: 'freeform', name: 'Freeform', group: null, prst: 'rect', sites: FOUR, draw: (w, h, c, P) => dOf(P, w, h) });
// An SVG path's letters as nodes, every curve a cubic and every arc made of them, its numbers as they stand. → paths of [x, y, inX, inY, outX, outY]
function parseD(d) {
  const toks = String(d).match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [], paths = [];
  let i = 0, cmd = '', x = 0, y = 0, sx = 0, sy = 0, cur = null, lastC = null, lastQ = null;
  const num = () => +toks[i++], more = () => i < toks.length && !/^[a-zA-Z]$/.test(toks[i]);
  const start = () => { cur = { closed: false, nodes: [[x, y]] }; paths.push(cur); };
  const to = (x1, y1, x2, y2, ex, ey) => { const a = cur.nodes.at(-1); a[2] ??= null; a[3] ??= null; a[4] = x1; a[5] = y1; cur.nodes.push([ex, ey, x2, y2]); x = ex; y = ey; };
  const line = (ex, ey) => { cur.nodes.push([ex, ey]); x = ex; y = ey; };
  const arcTo = (rx, ry, phi, large, sweep, ex, ey) => {
    if (!rx || !ry) return line(ex, ey);
    const f = phi * Math.PI / 180, c = Math.cos(f), s = Math.sin(f), dx = (x - ex) / 2, dy = (y - ey) / 2, x1 = c * dx + s * dy, y1 = -s * dx + c * dy, L = x1 * x1 / (rx * rx) + y1 * y1 / (ry * ry);
    if (L > 1) { rx *= Math.sqrt(L); ry *= Math.sqrt(L); }
    const k = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, (rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1) / (rx * rx * y1 * y1 + ry * ry * x1 * x1))), cx1 = k * rx * y1 / ry, cy1 = -k * ry * x1 / rx, cx = c * cx1 - s * cy1 + (x + ex) / 2, cy = s * cx1 + c * cy1 + (y + ey) / 2;
    const a0 = Math.atan2((y1 - cy1) / ry, (x1 - cx1) / rx); let da = Math.atan2((-y1 - cy1) / ry, (-x1 - cx1) / rx) - a0;
    if (sweep && da < 0) da += 2 * Math.PI; if (!sweep && da > 0) da -= 2 * Math.PI;
    const m = Math.max(1, Math.ceil(Math.abs(da) / (Math.PI / 2) - 1e-6)), t = 4 / 3 * Math.tan(da / m / 4), P = (ax, ay) => [c * rx * ax - s * ry * ay + cx, s * rx * ax + c * ry * ay + cy];
    for (let j = 0; j < m; j++) { const a = a0 + j * da / m, b = a + da / m, [p1x, p1y] = P(Math.cos(a) - t * Math.sin(a), Math.sin(a) + t * Math.cos(a)), [p2x, p2y] = P(Math.cos(b) + t * Math.sin(b), Math.sin(b) - t * Math.cos(b)), [ax, ay] = j === m - 1 ? [ex, ey] : P(Math.cos(b), Math.sin(b)); to(p1x, p1y, p2x, p2y, ax, ay); }
  };
  while (i < toks.length) {
    if (/^[a-zA-Z]$/.test(toks[i])) cmd = toks[i++];
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase(), ox = rel ? x : 0, oy = rel ? y : 0;
    if (C === 'Z') { if (cur) { cur.closed = true; x = sx; y = sy; const f = cur.nodes[0], l = cur.nodes.at(-1); if (cur.nodes.length > 1 && Math.abs(f[0] - l[0]) < 1e-6 && Math.abs(f[1] - l[1]) < 1e-6) { f[2] = l[2]; f[3] = l[3]; cur.nodes.pop(); } } cur = null; lastC = lastQ = null; continue; }
    if (!more()) { i++; continue; }
    if (C === 'M') { x = num() + ox; y = num() + oy; sx = x; sy = y; start(); cmd = rel ? 'l' : 'L'; lastC = lastQ = null; continue; }
    if (!cur) start();
    if (C === 'L') line(num() + ox, num() + oy);
    else if (C === 'H') line(num() + ox, y);
    else if (C === 'V') line(x, num() + oy);
    else if (C === 'C') { const a = num() + ox, b = num() + oy, c = num() + ox, e = num() + oy, f = num() + ox, g = num() + oy; to(a, b, c, e, f, g); lastC = [c, e]; lastQ = null; continue; }
    else if (C === 'S') { const c = num() + ox, e = num() + oy, f = num() + ox, g = num() + oy; to(lastC ? 2 * x - lastC[0] : x, lastC ? 2 * y - lastC[1] : y, c, e, f, g); lastC = [c, e]; lastQ = null; continue; }
    else if (C === 'Q' || C === 'T') { const q = C === 'Q' ? [num() + ox, num() + oy] : lastQ ? [2 * x - lastQ[0], 2 * y - lastQ[1]] : [x, y], f = num() + ox, g = num() + oy; to(x + 2 / 3 * (q[0] - x), y + 2 / 3 * (q[1] - y), f + 2 / 3 * (q[0] - f), g + 2 / 3 * (q[1] - g), f, g); lastQ = q; lastC = null; continue; }
    else if (C === 'A') { const rx = num(), ry = num(), phi = num(), large = +num() ? 1 : 0, sweep = +num() ? 1 : 0, ex = num() + ox, ey = num() + oy; arcTo(rx, ry, phi, large, sweep, ex, ey); }
    else { i++; continue; }
    lastC = lastQ = null;
  }
  return paths;
}
const scaled = (paths, w, h) => paths.map(p => ({ closed: !!p.closed, nodes: p.nodes.map(q => q.map((v, i) => v == null ? null : +(v / (i % 2 ? h : w)).toFixed(5))) }));
// Any shape's outline as its Points, to edit: a preset's as the table draws it.
const pointsOf = (id, w, h, corner, tail) => ({ paths: scaled(parseD(by.get(id)?.draw(w, h, corner, tail) ?? ''), w, h) });
// An icon of Lucide's as Points, its strokes as the lines of a shape: a node of Lucide's, its parts each a path, a circle, a rect or a line, on a square of 24.
function iconPoints(node) {
  const d = ([t, a]) => t === 'path' ? a.d : t === 'circle' ? `M${+a.cx - +a.r},${a.cy} A${a.r},${a.r} 0 1 1 ${+a.cx + +a.r},${a.cy} A${a.r},${a.r} 0 1 1 ${+a.cx - +a.r},${a.cy} Z`
    : t === 'ellipse' ? `M${+a.cx - +a.rx},${a.cy} A${a.rx},${a.ry} 0 1 1 ${+a.cx + +a.rx},${a.cy} A${a.rx},${a.ry} 0 1 1 ${+a.cx - +a.rx},${a.cy} Z`
    : t === 'line' ? `M${a.x1},${a.y1} L${a.x2},${a.y2}` : t === 'polyline' || t === 'polygon' ? `M${a.points.trim().split(/[\s,]+/).reduce((o, v, i, all) => i % 2 ? o : [...o, `${v},${all[i + 1]}`], []).join(' L')}${t === 'polygon' ? ' Z' : ''}`
    : t === 'rect' ? (() => { const x = +(a.x ?? 0), y = +(a.y ?? 0), w = +a.width, h = +a.height, r = Math.min(+(a.rx ?? a.ry ?? 0), w / 2, h / 2); return r ? `M${x + r},${y} H${x + w - r} A${r},${r} 0 0 1 ${x + w},${y + r} V${y + h - r} A${r},${r} 0 0 1 ${x + w - r},${y + h} H${x + r} A${r},${r} 0 0 1 ${x},${y + h - r} V${y + r} A${r},${r} 0 0 1 ${x + r},${y} Z` : `M${x},${y} H${x + w} V${y + h} H${x} Z`; })() : '';
  return { round: true, paths: scaled((node[2] ?? []).flatMap(c => parseD(d(c))), 24, 24) };
}
// Through points, as a hand's clicks: straight, or by a smooth curve through them all, as PowerPoint's Curve tool draws one. → nodes
function throughPoints(ps, curved, closed) {
  if (!curved || ps.length < 3) return ps.map(p => [p[0], p[1]]);
  const at = i => closed ? ps[(i + ps.length) % ps.length] : ps[Math.max(0, Math.min(ps.length - 1, i))];
  return ps.map((p, i) => { const a = at(i - 1), b = at(i + 1), dx = (b[0] - a[0]) / 6, dy = (b[1] - a[1]) / 6; return (!closed && i === 0) ? [p[0], p[1], p[0], p[1], p[0] + dx, p[1] + dy] : (!closed && i === ps.length - 1) ? [p[0], p[1], p[0] - dx, p[1] - dy] : [p[0], p[1], p[0] - dx, p[1] - dy, p[0] + dx, p[1] + dy]; });
}
// Paths flattened to rings of points, each curve by as many steps as keep it within `tol`, in units of the frame `w × h`.
function flatten(P, w, h, tol = 0.15) {
  return (P?.paths ?? []).map(({ nodes, closed }) => {
    const out = [], seq = closed ? [...nodes, nodes[0]] : nodes;
    seq.forEach((b, i) => {
      if (!i) return out.push([b[0] * w, b[1] * h]);
      const a = seq[i - 1], c1 = [(a[4] ?? a[0]) * w, (a[5] ?? a[1]) * h], c2 = [(b[2] ?? b[0]) * w, (b[3] ?? b[1]) * h], p0 = [a[0] * w, a[1] * h], p3 = [b[0] * w, b[1] * h];
      if (a[4] == null && b[2] == null) return out.push(p3);
      const reach = Math.hypot(c1[0] - p0[0], c1[1] - p0[1]) + Math.hypot(c2[0] - c1[0], c2[1] - c1[1]) + Math.hypot(p3[0] - c2[0], p3[1] - c2[1]), k = Math.max(4, Math.min(64, Math.ceil(Math.sqrt(reach / tol) / 1.5)));
      for (let j = 1; j <= k; j++) { const t = j / k, u = 1 - t, W = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t]; out.push([W[0] * p0[0] + W[1] * c1[0] + W[2] * c2[0] + W[3] * p3[0], W[0] * p0[1] + W[1] * c1[1] + W[2] * c2[1] + W[3] * p3[1]]); }
    });
    if (closed && out.length > 1 && Math.hypot(out[0][0] - out.at(-1)[0], out[0][1] - out.at(-1)[1]) < 1e-6) out.pop();
    return { closed: !!closed, ring: out };
  });
}
// Bounds of Points, in shares of its frame: what its outline reaches, its curves' handles no part of it.
const boundsOf = P => { const rings = flatten(P, 1000, 1000, 0.5).flatMap(r => r.ring); if (!rings.length) return { x: 0, y: 0, w: 1, h: 1 }; const xs = rings.map(p => p[0] / 1000), ys = rings.map(p => p[1] / 1000), x = Math.min(...xs), y = Math.min(...ys); return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }; };
// Points taken into the frame of `b` (shares of their own), as a frame shrinks round what's drawn.
const refit = (P, b) => ({ ...P, paths: P.paths.map(p => ({ ...p, nodes: p.nodes.map(q => q.map((v, i) => v == null ? null : +((v - (i % 2 ? b.y : b.x)) / ((i % 2 ? b.h : b.w) || 1)).toFixed(5))) })) });
// A deck's custom geometry: Points in a path of its own size (EMU), each sub-path as PowerPoint's own, four connection sites at the middles of its sides as a rectangle's.
const custGeom = (P, W, H) => { const pt = (x, y) => `<a:pt x="${Math.round(x * W)}" y="${Math.round(y * H)}"/>`;
  return `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst><a:cxn ang="16200000"><a:pos x="hc" y="t"/></a:cxn><a:cxn ang="10800000"><a:pos x="l" y="vc"/></a:cxn><a:cxn ang="5400000"><a:pos x="hc" y="b"/></a:cxn><a:cxn ang="0"><a:pos x="r" y="vc"/></a:cxn></a:cxnLst><a:rect l="0" t="0" r="r" b="b"/><a:pathLst><a:path w="${W}" h="${H}">`
  + (P?.paths ?? []).map(({ nodes, closed }) => { const seq = closed ? [...nodes, nodes[0]] : nodes;
    return `<a:moveTo>${pt(nodes[0][0], nodes[0][1])}</a:moveTo>` + seq.slice(1).map((b, i) => { const a = seq[i]; return a[4] != null || b[2] != null ?`<a:cubicBezTo>${pt(a[4] ?? a[0], a[5] ?? a[1])}${pt(b[2] ?? b[0], b[3] ?? b[1])}${pt(b[0], b[1])}</a:cubicBezTo>` : `<a:lnTo>${pt(b[0], b[1])}</a:lnTo>`; }).join('') + (closed ? '<a:close/>' : ''); }).join('')
  + '</a:path></a:pathLst></a:custGeom>'; };

// ---- Merge Shapes (dendra.md, Points): union, combine, fragment, intersect, subtract, as PowerPoint's, of rings of points. A small clipper of its own: every edge split where it meets another, kept where what's on its one side is in the result and what's on its other isn't, and those joined up round again. Curves are flattened first ----
const inRings = (rings, p) => { let on = false; for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) on = !on; } return on; };
const keyOf = p => `${Math.round(p[0] * 100)},${Math.round(p[1] * 100)}`;
function clip(A, B, want) {
  const edges = [];
  for (const [rings, who] of [[A, 0], [B, 1]]) for (const r of rings) r.forEach((p, i) => { const q = r[(i + 1) % r.length]; if (keyOf(p) !== keyOf(q)) edges.push({ p, q, who }); });
  // Each edge cut at every place another crosses or touches it.
  const cuts = edges.map(() => []);
  for (let i = 0; i < edges.length; i++) for (let j = i + 1; j < edges.length; j++) {
    const a = edges[i], b = edges[j], rx = a.q[0] - a.p[0], ry = a.q[1] - a.p[1], sx = b.q[0] - b.p[0], sy = b.q[1] - b.p[1], d = rx * sy - ry * sx, qx = b.p[0] - a.p[0], qy = b.p[1] - a.p[1];
    if (Math.max(a.p[0], a.q[0]) < Math.min(b.p[0], b.q[0]) - 0.01 || Math.max(b.p[0], b.q[0]) < Math.min(a.p[0], a.q[0]) - 0.01 || Math.max(a.p[1], a.q[1]) < Math.min(b.p[1], b.q[1]) - 0.01 || Math.max(b.p[1], b.q[1]) < Math.min(a.p[1], a.q[1]) - 0.01) continue;
    if (Math.abs(d) > 1e-9) { const t = (qx * sy - qy * sx) / d, u = (qx * ry - qy * rx) / d; if (t > -1e-6 && t < 1 + 1e-6 && u > -1e-6 && u < 1 + 1e-6) { if (t > 1e-6 && t < 1 - 1e-6) cuts[i].push(t); if (u > 1e-6 && u < 1 - 1e-6) cuts[j].push(u); } }
    else if (Math.abs(qx * ry - qy * rx) < 1e-6) { const L = rx * rx + ry * ry || 1, M = sx * sx + sy * sy || 1; for (const e of [b.p, b.q]) { const t = ((e[0] - a.p[0]) * rx + (e[1] - a.p[1]) * ry) / L; if (t > 1e-6 && t < 1 - 1e-6) cuts[i].push(t); } for (const e of [a.p, a.q]) { const u = ((e[0] - b.p[0]) * sx + (e[1] - b.p[1]) * sy) / M; if (u > 1e-6 && u < 1 - 1e-6) cuts[j].push(u); } }
  }
  const kept = new Map(), out = new Map(), eps = 0.02;
  edges.forEach((e, i) => {
    const ts = [0, ...cuts[i].sort((a, b) => a - b), 1], at = t => [e.p[0] + (e.q[0] - e.p[0]) * t, e.p[1] + (e.q[1] - e.p[1]) * t];
    ts.slice(1).forEach((t, k) => {
      const p = at(ts[k]), q = at(t);
      if (keyOf(p) === keyOf(q)) return;
      const m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], L = Math.hypot(q[0] - p[0], q[1] - p[1]), nx = -(q[1] - p[1]) / L * eps, ny = (q[0] - p[0]) / L * eps;
      const on = (x, y) => want(inRings(A, [x, y]), inRings(B, [x, y])), left = on(m[0] + nx, m[1] + ny), right = on(m[0] - nx, m[1] - ny);
      if (left === right) return;
      const [from, to] = left ? [p, q] : [q, p], k2 = `${keyOf(from)}|${keyOf(to)}`;
      if (!kept.has(k2)) { kept.set(k2, { from, to, used: false }); const o = out.get(keyOf(from)) ?? out.set(keyOf(from), []).get(keyOf(from)); o.push(kept.get(k2)); }
    });
  });
  const rings = [];
  for (const e0 of kept.values()) {
    if (e0.used) continue;
    const r = [], startAt = keyOf(e0.from);
    let e = e0;
    while (e && !e.used) {
      e.used = true; r.push(e.from);
      if (keyOf(e.to) === startAt) break;
      const nexts = (out.get(keyOf(e.to)) ?? []).filter(x => !x.used);
      // (Where more than one goes on, the one that turns furthest left, so a ring stays round its own room.)
      const inA = Math.atan2(e.to[1] - e.from[1], e.to[0] - e.from[0]);
      e = nexts.sort((a, b) => { const turn = x => { let d = Math.atan2(x.to[1] - x.from[1], x.to[0] - x.from[0]) - inA; while (d <= -Math.PI) d += 2 * Math.PI; while (d > Math.PI) d -= 2 * Math.PI; return d; }; return turn(b) - turn(a); })[0];
    }
    if (r.length > 2) rings.push(tidied(r));
  }
  return rings.filter(r => r.length > 2 && Math.abs(areaOf(r)) > 0.5);
}
const areaOf = r => r.reduce((a, p, i) => { const q = r[(i + 1) % r.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;
// What lies along one line is one edge.
const tidied = r => r.filter((p, i) => { const a = r[(i - 1 + r.length) % r.length], b = r[(i + 1) % r.length]; return Math.abs((p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0])) > 1e-3; });
// Rings as separate pieces, each outer ring with the holes that are in it.
function pieces(rings) {
  const big = rings.filter(r => areaOf(r) > 0), holes = rings.filter(r => areaOf(r) <= 0), out = big.map(r => [r]);
  for (const h of holes) { const hosts = big.filter(r => inRings([r], h[0])).sort((a, b) => Math.abs(areaOf(a)) - Math.abs(areaOf(b))); if (hosts[0]) out[big.indexOf(hosts[0])].push(h); }
  return out;
}
const OPS = { union: (a, b) => a || b, combine: (a, b) => a !== b, intersect: (a, b) => a && b, subtract: (a, b) => a && !b };
// `shapes`, each its rings, in the order they were selected. → the rings of each shape the merge leaves: one for most, several for a fragment.
function merge(kind, shapes) {
  if (kind === 'fragment') {
    let parts = [shapes[0]], all = shapes[0];
    for (const b of shapes.slice(1)) { parts = [...parts.flatMap(p => [clip(p, b, OPS.intersect), clip(p, b, OPS.subtract)]), clip(b, all, OPS.subtract)]; all = clip(all, b, OPS.union); }
    return parts.flatMap(pieces).filter(r => r.length);
  }
  const one = shapes.slice(1).reduce((a, b) => clip(a, b, OPS[kind]), shapes[0]);
  return one.length ? [one] : [];
}
// Rings in page points as Points in a frame round them. → { x, y, w, h, Points }
function framed(rings) {
  const all = rings.flat(), x = Math.min(...all.map(p => p[0])), y = Math.min(...all.map(p => p[1])), w = Math.max(...all.map(p => p[0])) - x || 1, h = Math.max(...all.map(p => p[1])) - y || 1;
  return { x, y, w, h, Points: { paths: rings.map(r => ({ closed: true, nodes: r.map(p => [+((p[0] - x) / w).toFixed(5), +((p[1] - y) / h).toFixed(5)]) })) } };
}

// ---- Pattern fills (dendra.md, Free shapes): PowerPoint's own, by the names its files have, each drawn as a tile: [prst, name, tile's side, its strokes, their width] ----
const PATTERNS = [
  ['ltUpDiag', 'Light upward diagonal', 4, 'M-1,1 L1,-1 M0,4 L4,0 M3,5 L5,3', 0.7],
  ['dkUpDiag', 'Dark upward diagonal', 4, 'M-1,1 L1,-1 M0,4 L4,0 M3,5 L5,3', 1.4],
  ['wdUpDiag', 'Wide upward diagonal', 8, 'M-2,2 L2,-2 M0,8 L8,0 M6,10 L10,6', 2.1],
  ['ltDnDiag', 'Light downward diagonal', 4, 'M-1,3 L1,5 M0,0 L4,4 M3,-1 L5,1', 0.7],
  ['ltHorz', 'Horizontal lines', 4, 'M0,2 H4', 1],
  ['ltVert', 'Vertical lines', 4, 'M2,0 V4', 1],
  ['smGrid', 'Small grid', 4, 'M0,2 H4 M2,0 V4', 0.7],
  ['pct20', 'Dots', 4, 'M0.5,1 H1.5 M2.5,3 H3.5', 1],
];
const patternOf = prst => PATTERNS.find(p => p[0] === prst) ?? null;
// A gradient as a page's definition holds it, its `id`: from color to color along its angle, clockwise from the right, as PowerPoint's linear gradient.
const gradientDef = (id, o) => { const a = (o.angle ?? 0) * Math.PI / 180, x = Math.round(Math.cos(a) * 5e3) / 1e4, y = Math.round(Math.sin(a) * 5e3) / 1e4; return `<linearGradient id="${id}" x1="${0.5 - x}" y1="${0.5 - y}" x2="${0.5 + x}" y2="${0.5 + y}">${(o.stops ?? []).map(([at, c]) => `<stop offset="${at}%" stop-color="${c}"/>`).join('')}</linearGradient>`; };
// A pattern as a page's definition holds it, its `id`, its strokes in `fg` over `bg`.
const patternDef = (id, o, bg) => { const [, , side, d, w] = patternOf(o.prst) ?? PATTERNS[0]; return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${side}" height="${side}">${bg && bg !== 'none' ? `<rect width="${side}" height="${side}" fill="${bg}"/>` : ''}<path d="${d}" fill="none" stroke="${o.fg ?? '#000000'}" stroke-width="${w}"/></pattern>`; };

// ---- Effects (dendra.md, Effects): each PowerPoint's own in a deck, and here as an SVG filter on a shape's body, one filter for each look. `u`, the page's pixels to a point as printed ----
const EFFECTS = ['Glow', 'Soft Edge', 'Inner Shadow', 'Bevel'];
const hasEffect = s => !!s && (!!s.Glow || s['Soft Edge'] > 0 || (s['Inner Shadow'] && s['Inner Shadow'] !== 'none') || !!s.Bevel);
const SHADE = { blur: 4, distance: 3, angle: 45, color: '#000000', transparency: 60 };
const shadeOf = v => !v || v === 'none' ? null : v === 'soft' ? SHADE : { ...SHADE, ...v };
const effectKey = s => JSON.stringify([s.Shadow ?? null, ...EFFECTS.map(l => s[l] ?? null)]);
function effectDef(id, s, u) {
  const o = shadeOf(s.Shadow), i = shadeOf(s['Inner Shadow']), g = s.Glow, soft = (s['Soft Edge'] ?? 0) * u, b = s.Bevel, f = v => +v.toFixed(3), parts = [];
  let shape = 'SourceGraphic';
  if (soft > 0) { parts.push(`<feMorphology in="SourceAlpha" operator="erode" radius="${f(soft / 2)}" result="se"/><feGaussianBlur in="se" stdDeviation="${f(soft / 2)}" result="sm"/><feComposite in="SourceGraphic" in2="sm" operator="in" result="soft"/>`); shape = 'soft'; }
  if (b) {
    const w = Math.max(0.5, (b.w ?? 6) * u);
    parts.push(`<feGaussianBlur in="SourceAlpha" stdDeviation="${f(w / 2)}" result="bb"/><feDiffuseLighting in="bb" surfaceScale="${f(w * 1.2)}" diffuseConstant="1.15" lighting-color="#ffffff" result="bd"><feDistantLight azimuth="235" elevation="55"/></feDiffuseLighting><feBlend in="${shape}" in2="bd" mode="multiply" result="bm"/><feSpecularLighting in="bb" surfaceScale="${f(w * 1.2)}" specularConstant="0.55" specularExponent="22" lighting-color="#ffffff" result="bs"><feDistantLight azimuth="235" elevation="50"/></feSpecularLighting><feComposite in="bs" in2="bm" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="ba"/><feComposite in="ba" in2="${shape}" operator="in" result="bev"/>`);
    shape = 'bev';
  }
  if (i) {
    const a = i.angle * Math.PI / 180;
    parts.push(`<feFlood flood-color="${i.color}" flood-opacity="${f(1 - i.transparency / 100)}" result="ic"/><feOffset in="SourceAlpha" dx="${f(i.distance * u * Math.cos(a))}" dy="${f(i.distance * u * Math.sin(a))}" result="io"/><feGaussianBlur in="io" stdDeviation="${f(i.blur * u / 2)}" result="ib"/><feComposite in="ic" in2="ib" operator="out" result="ir"/><feComposite in="ir" in2="SourceAlpha" operator="in" result="ii"/><feMerge result="inner"><feMergeNode in="${shape}"/><feMergeNode in="ii"/></feMerge>`);
    shape = 'inner';
  }
  const under = [];
  if (o) { const a = o.angle * Math.PI / 180; parts.push(`<feOffset in="SourceAlpha" dx="${f(o.distance * u * Math.cos(a))}" dy="${f(o.distance * u * Math.sin(a))}" result="so"/><feGaussianBlur in="so" stdDeviation="${f(o.blur * u / 2)}" result="sb"/><feFlood flood-color="${o.color}" flood-opacity="${f(1 - o.transparency / 100)}"/><feComposite in2="sb" operator="in" result="shadow"/>`); under.push('shadow'); }
  if (g) { const r = (g.size ?? 8) * u; parts.push(`<feMorphology in="SourceAlpha" operator="dilate" radius="${f(r / 2)}" result="gd"/><feGaussianBlur in="gd" stdDeviation="${f(r / 2)}" result="gb"/><feFlood flood-color="${g.color ?? '#4472c4'}" flood-opacity="${f(1 - (g.transparency ?? 60) / 100)}"/><feComposite in2="gb" operator="in" result="glow"/>`); under.push('glow'); }
  return `<filter id="${id}" x="-60%" y="-60%" width="220%" height="220%" color-interpolation-filters="sRGB">${parts.join('')}<feMerge>${under.map(x => `<feMergeNode in="${x}"/>`).join('')}<feMergeNode in="${shape}"/></feMerge></filter>`;
}
// A shape's reflection: its mask, fading from how strong it starts to nothing, as far down as its size says, its share of the shape.
const reflectionMask = (id, r) => `<linearGradient id="${id}-g" x1="0" y1="1" x2="0" y2="${+(1 - (r.size ?? 50) / 100).toFixed(3)}"><stop offset="0" stop-color="#fff" stop-opacity="${+(1 - (r.transparency ?? 50) / 100).toFixed(3)}"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><mask id="${id}" maskContentUnits="objectBoundingBox" x="-0.1" y="-0.1" width="1.2" height="1.2"><rect x="-0.1" y="-0.1" width="1.2" height="1.2" fill="url(#${id}-g)"/></mask>`;
// A line's compound, drawn by taking its middle out, on any path: the rest of the width stands. Its gaps' sizes are the width's, on screen and in the PDF; PowerPoint's own draws its thick and thin as it does.
const compoundDef = (id, c, W) => { const r = v => +(W * v).toFixed(3), both = c === 'triple', hole = c === 'triple' ? 0.1 : 1 / 6;
  return `<filter id="${id}" filterUnits="userSpaceOnUse" x="-20000" y="-20000" width="40000" height="40000" color-interpolation-filters="sRGB"><feMorphology in="SourceGraphic" operator="erode" radius="${r(hole)}" result="a"/><feComposite in="SourceGraphic" in2="a" operator="out" result="edge"/>${both ? `<feMorphology in="SourceGraphic" operator="erode" radius="${r(0.3)}" result="mid"/><feMerge><feMergeNode in="edge"/><feMergeNode in="mid"/></feMerge>` : ''}</filter>`; };
// A shape turned in depth, as PowerPoint's parallel 3-D rotation: X about its upright, Y about its level, Z about itself, seen straight on, which is a flat picture's own transform. → the matrix about its middle
function turned3d(t, w, h) {
  const r = v => (v ?? 0) * Math.PI / 180, [a, b, c] = [r(t.x), r(t.y), r(t.z)], cz = Math.cos(c), sz = Math.sin(c), cx = Math.cos(a), sx = Math.sin(a), cy = Math.cos(b), sy = Math.sin(b);
  // (Across: turned about the upright; down: about the level; then in its plane.)
  const m = [cx, sx * sy, 0, cy], A = cz * m[0] - sz * m[1], B = sz * m[0] + cz * m[1], C = cz * m[2] - sz * m[3], D = sz * m[2] + cz * m[3], px = w / 2, py = h / 2;
  return `matrix(${[A, B, C, D, px - A * px - C * py, py - B * px - D * py].map(v => +v.toFixed(5)).join(' ')})`;
}
// A picture filling a shape, stretched to its frame, or tiled as a texture is at its own size.
const pictureDef = (id, o, w, h, bg) => o.tile
  ? `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${o.tw ?? 64}" height="${o.th ?? 64}">${bg && bg !== 'none' ? `<rect width="${o.tw ?? 64}" height="${o.th ?? 64}" fill="${bg}"/>` : ''}<image href="${o.src}" width="${o.tw ?? 64}" height="${o.th ?? 64}" preserveAspectRatio="none"/></pattern>`
  : `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${n(w)}" height="${n(h)}"><image href="${o.src}" width="${n(w)}" height="${n(h)}" preserveAspectRatio="none"/></pattern>`;
// A line's gradient along what it runs, from its bounds as a page's user space, as a flat line has no box of its own to run in.
const lineGradientDef = (id, o, b) => { const a = (o.angle ?? 0) * Math.PI / 180, cx = b.x + b.w / 2, cy = b.y + b.h / 2, r = (Math.abs(b.w * Math.cos(a)) + Math.abs(b.h * Math.sin(a))) / 2 || 1; return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${n(cx - r * Math.cos(a))}" y1="${n(cy - r * Math.sin(a))}" x2="${n(cx + r * Math.cos(a))}" y2="${n(cy + r * Math.sin(a))}">${(o.stops ?? []).map(([at, c]) => `<stop offset="${at}%" stop-color="${c}"/>`).join('')}</linearGradient>`; };
// A short name for a long thing, for the id of its definition.
const hashed = s => { let h = 0; const t = String(s); for (let i = 0; i < t.length; i += Math.max(1, t.length >> 12)) h = (h * 31 + t.charCodeAt(i)) | 0; return `${(h >>> 0).toString(36)}${t.length.toString(36)}`; };
// Textures, as PowerPoint's Texture gallery offers them: a tile drawn once here, a picture from then on, so the deck tiles it as its own. Each is a seeded grain over a color.
const TEXTURES = [['paper', 'Paper', '#f4f1ea', 6, 0], ['linen', 'Linen', '#e9e4d8', 10, 1], ['canvas', 'Canvas', '#dcd5c5', 14, 2], ['granite', 'Granite', '#a9abad', 34, 0], ['slate', 'Slate', '#6f7780', 22, 0], ['walnut', 'Walnut', '#7a5a3c', 18, 3]];
function textureTile(name, size = 96) {
  const t = TEXTURES.find(x => x[0] === name) ?? TEXTURES[0], [r, g, b] = [1, 3, 5].map(i => parseInt(t[2].slice(i, i + 2), 16)), c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d'), im = x.createImageData(size, size);
  let seed = 7;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
  const noise = Array.from({ length: size * size }, () => rnd() - 0.5), at = (i, j) => noise[((j + size) % size) * size + ((i + size) % size)];
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const weave = t[4] === 1 ? (at(i, j) + at(i + 1, j) + at(i - 1, j)) / 3 + 0.5 * (at(i, j + 1) + at(i, j - 1) + at(i, j)) / 3 : t[4] === 2 ? ((i % 4 < 2) === (j % 4 < 2) ? 0.25 : -0.25) + at(i, j) * 0.6 : t[4] === 3 ? (at(i, j) + at(i + 1, j) + at(i + 2, j) + at(i + 3, j) + at(i - 1, j)) / 2 + Math.sin(j / 3 + at(i, 0) * 3) * 0.2 : at(i, j);
    const d = weave * t[3] * 2, k = (j * size + i) * 4;
    im.data[k] = r + d; im.data[k + 1] = g + d; im.data[k + 2] = b + d; im.data[k + 3] = 255;
  }
  x.putImageData(im, 0, 0);
  return c.toDataURL('image/png');
}

// ---- A theme's colors (dendra.md, The palette) ----
// PowerPoint's Office theme, as its palette shows it: its ten columns (Background 1, Text 1, Background 2, Text 2 and the six accents), each with its tints and shades in PowerPoint's rows.
const OFFICE = [
  '#ffffff', '#000000', '#e7e6e6', '#44546a', '#4472c4', '#ed7d31', '#a5a5a5', '#ffc000', '#5b9bd5', '#70ad47',
  '#f2f2f2', '#7f7f7f', '#d0cece', '#d6dce5', '#dae3f3', '#fbe5d6', '#ededed', '#fff2cc', '#deebf7', '#e2f0d9',
  '#d9d9d9', '#595959', '#afabab', '#adb9ca', '#b4c7e7', '#f8cbad', '#dbdbdb', '#ffe699', '#bdd7ee', '#c5e0b4',
  '#bfbfbf', '#404040', '#767171', '#8497b0', '#8faadc', '#f4b183', '#c9c9c9', '#ffd966', '#9dc3e6', '#a9d18e',
  '#a6a6a6', '#262626', '#3b3838', '#333f50', '#2f5597', '#c55a11', '#7c7c7c', '#bf9000', '#2e75b6', '#548235',
  '#7f7f7f', '#0d0d0d', '#181717', '#222a35', '#203864', '#843c0c', '#525252', '#7f6000', '#1f4e79', '#385723',
];
const SLOTS = ['bg1', 'tx1', 'bg2', 'tx2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'];
// A column's rows: PowerPoint's lightness multiplied and raised, darker under white and light gray, lighter under black, both ways under the rest.
const ROWS = { 0: [[.95, 0], [.85, 0], [.75, 0], [.65, 0], [.5, 0]], 1: [[.5, .5], [.65, .35], [.75, .25], [.85, .15], [.95, .05]], 2: [[.9, 0], [.75, 0], [.5, 0], [.25, 0], [.1, 0]], accent: [[.2, .8], [.4, .6], [.6, .4], [.75, 0], [.5, 0]] };
const rowsOf = i => ROWS[i] ?? ROWS.accent;
const toHsl = c => { const [r, g, b] = [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16) / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn, s = !d ? 0 : d / (1 - Math.abs(2 * l - 1)), h = !d ? 0 : mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return [h * 60, s, l]; };
const fromHsl = ([h, s, l]) => { const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2, [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]; return `#${[r, g, b].map(v => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('')}`; };
const shaded = (c, mod, off) => { const [h, s, l] = toHsl(c); return fromHsl([h, s, Math.min(1, l * mod + off)]); };
// The sixty swatches of ten colors, in the Office theme's order. Office's own are as Office has them.
const swatches = (colors = null) => { if (!colors) return OFFICE; const out = [...colors]; for (let row = 0; row < 5; row++) colors.forEach((c, i) => out.push(shaded(c, ...rowsOf(i)[row]))); return out; };
// What a color is in a theme: its slot, and its tint or shade there; null for one that's none of them. → { slot, mod, off }
const inTheme = (colors = null) => {
  const all = swatches(colors), by = new Map();
  for (let i = 0; i < all.length; i++) { const k = all[i].toLowerCase(), col = i % 10, row = Math.floor(i / 10); if (!by.has(k)) by.set(k, { slot: SLOTS[col], ...(row && { mod: rowsOf(col)[row - 1][0], off: rowsOf(col)[row - 1][1] }) }); }
  return c => by.get(String(c).toLowerCase()) ?? null;
};

return {
  hasEffect, effectKey, effectDef, reflectionMask, compoundDef, turned3d, pictureDef, lineGradientDef, hashed, TEXTURES, textureTile, parseD, pointsOf, iconPoints, throughPoints, flatten, boundsOf, refit, custGeom, merge, framed, TAIL, CALLOUTS, OPEN, OFFICE, SLOTS, PATTERNS, patternDef, gradientDef, swatches, inTheme, shaded, gallery, DESIGNS, ACCENT, boxy: id => id === 'rect' || id === 'rounded' || id === 'freeform' || TABLE.find(t => t[0] === id)?.[2] === 'Rectangles', ids: TABLE.map(t => t[0]), list: TABLE.map(t => [t[0], t[1]]),
  has: id => by.has(id),
  name: id => by.get(id)?.name ?? null,
  prst: id => by.get(id)?.prst ?? 'rect',
  sites: id => by.get(id)?.sites ?? null,
  // A shape's outline as a path in a w × h frame: a rounded rectangle's corners as `corner` says, a callout's tip as `tail`.
  path: (id, w, h, corner, tail) => (by.get(id) ?? by.get('rect')).draw(w, h, corner, tail),
  // Where it sets its text: how far in from its sides, and its top and bottom; and the share of its width a line may take.
  textRect: (id, w, h, corner) => by.get(id)?.rect?.(w, h, corner) ?? rect0(),
  textArea: id => by.get(id)?.area ?? 1,
};
})();
