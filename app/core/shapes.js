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
  ['round2', 'Round same side corners', 'Rectangles', 'round2SameRect', [3, 2, 1, 0], (w, h) => { const a = Math.min(w, h) * 0.16667; return `M${n(a)},0 H${n(w - a)} ${arc(w, a, a)} V${n(h)} H0 V${n(a)} ${arc(a, 0, a)} Z`; }, (w, h) => { const i = Math.min(w, h) * 0.16667 * 0.29289; return { x: i, top: i, bottom: 0 }; }],
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
  TAIL, CALLOUTS, OPEN, OFFICE, SLOTS, swatches, inTheme, shaded, gallery, ids: TABLE.map(t => t[0]), list: TABLE.map(t => [t[0], t[1]]),
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
