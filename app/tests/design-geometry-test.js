// Contract tests for saving author intent rather than a particular record's text expansion.
// Deliberately has no App, Scene or editor globals; GUI suites cover those adapters.
const out = [], check = (name, ok) => out.push({ name, ok: !!ok });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b), G = DesignGeometry;
const rect = p => [p.x, p.y, p.w, p.h];
const original = [
  { id: 'name', geometry: 'text', x: 0, y: 0, w: 1, h: .3, text: '{Name}' },
  { id: 'focus', geometry: 'text', x: 0, y: .4, w: 1, h: .2, text: '{Focus}' },
];
const design = { id: 'card', w: 200, h: 100, layout: 'stack', parts: original };
const box = { x: 100, y: 50, w: 200, h: 360 };
const stands = new Map([
  ['name', { x: 100, y: 50, w: 200, h: 120 }],
  ['focus', { x: 100, y: 200, w: 200, h: 60 }],
]);
const entry = (part, geometry, more = {}) => {
  const row = { id: 'row-' + part, shape: 'shape-' + part, part, geometry: 'text', view: 'sandbox', text: '{' + part + '}', ...geometry, ...more };
  return { row, mark: { id: row.shape, ...geometry, geometry: row.geometry } };
};
const entries = [entry('name', { x: 100, y: 50, w: 200, h: 180 }, { flow: { height: { after: 180 } } }),
  entry('focus', { x: 100, y: 260, w: 200, h: 60 }, { flow: { y: 60 } })];
const options = { design, initial: { w: 200, h: 300 }, box, position: { w: 200, h: 360, flow: { height: { after: 360 } } }, entries, stands,
  measure: () => 15, newId: () => 'new-part' };
const before = JSON.stringify({ design, box, entries, stands: [...stands], position: options.position });
const captured = G.capture(options);
check('A long record preview keeps the original authored layer rectangles', same(captured.parts.map(rect), original.map(rect)));
check('Automatic card growth does not save a new shared minimum height', same(captured.dimensions, {}));
check('Persisted parts contain no sandbox identities or flow metadata', captured.parts.every(p => !['shape', 'view', 'flow', 'named', 'part'].some(k => k in p)));
check('Capture leaves the design, rows, preview and initial stands untouched', before === JSON.stringify({ design, box, entries, stands: [...stands], position: options.position }));

const moved = entry('focus', { x: 110, y: 275, w: 160, h: 80 }, { flow: { y: 60, height: { after: 60 } } });
const manual = G.capture({ ...options, entries: [entries[0], moved] });
check('Manual movement and resizing survive automatic expansion in model units', same(rect(manual.parts[1]), [.05, .55, .8, .8]));
const resized = G.capture({ ...options, position: { w: 250, h: 200, flow: { height: { after: 360 } } } });
check('A manually resized card stores its dimensions without scaling authored content', same(resized.dimensions, { w: 250, h: 200 }) && same(rect(resized.parts[0]), [0, 0, .8, .15]) && same(rect(resized.parts[1]), [0, .2, .8, .1]));

const fresh = entry('extra', { x: 100, y: 370, w: 200, h: 130 }, { text: 'Literal {Name}', flow: { y: 60, created: { x: 100, y: 310, w: 200, h: 90, anchor: 'focus', gap: 5 }, height: { after: 130 } } });
const anchored = G.capture({ ...options, entries: [fresh, ...entries] });
check('New text anchors after the authored predecessor rather than its long preview', same(rect(anchored.parts[0]), [0, .65, 1, .15]));
check('Recursive anchors retain the drawing order even when the anchor comes later', same(anchored.parts.map(p => p.id), ['extra', 'name', 'focus']));
let measured = false;
const sized = structuredClone(fresh); sized.row.h = sized.mark.h = 45;
const explicit = G.capture({ ...options, entries: [sized, ...entries], measure: () => { measured = true; return 999; } });
check('An explicitly sized new text frame is retained without natural-height measurement', explicit.parts[0].h === .45 && !measured);
const loose = entry('loose', { x: 140, y: 200, w: 100, h: 90 }, { flow: { created: { x: 140, y: 200, w: 100, h: 90 }, height: { after: 90 } } });
const unanchored = G.capture({ ...options, entries: [loose] });
check('Unanchored new text uses the initial frame rather than the expanded card', same(rect(unanchored.parts[0]), [.2, .5, .5, .15]));

const line = { id: 'line', geometry: 'line', x: 0, y: .35, w: 1, h: 0, points: [[0, .35], [1, .35]] };
const lineStand = { x: 100, y: 190, w: 200, h: 0, points: [[100, 190], [300, 190]] };
const editedLine = entry('line', { x: 100, y: 200, w: 200, h: 0 }, { geometry: 'line', points: [[100, 200], [320, 205]] });
editedLine.mark.points = editedLine.row.points;
const connector = G.capture({ ...options, design: { ...design, parts: [line] }, entries: [editedLine], stands: new Map([['line', lineStand]]) });
check('Manual connector point changes are rebased against the authored points', same(connector.parts[0].points, [[0, .45], [1.1, .5]]));
const drawing = entry(null, { x: 120, y: 80, w: 60, h: 40 }, { geometry: 'rect', rotate: 25, flip: 'h', runs: [{ from: 0, to: 3, Bold: true }], link: 'https://example.com' });
const converted = G.capture({ ...options, entries: [drawing] }).parts[0];
check('A free drawing retains geometry, rotation, rich text and links as a new part', converted.id === 'new-part' && same(rect(converted), [.1, .3, .3, .4]) && converted.rotate === 25 && converted.flip === 'h' && same(converted.runs, drawing.row.runs) && converted.link === drawing.row.link);

const formatted = G.standing({ Fill: '{Outline}', Weight: '{Weight}', Bold: true }, { Outline: { value: '#123456' }, Weight: { value: 1.25 } }, .5);
const formattedRow = { ...entries[0].row, ...formatted, format: { ...formatted.format, Color: '#ffffff', Layer: 9 }, named: { ...formatted.named, Color: [null, '#ffffff'] } };
const saved = G.part(formattedRow, entries[0].mark, box);
check('Unchanged preview styles restore references and omit automatic color and layer', same(saved.format, { Fill: '{Outline}', Weight: '{Weight}', Bold: true }));
const recolored = G.part({ ...formattedRow, format: { ...formattedRow.format, Fill: '#abcdef', Color: '#654321' } }, entries[0].mark, box);
check('Explicit format changes replace inherited references and automatic contrast', recolored.format.Fill === '#abcdef' && recolored.format.Color === '#654321' && recolored.format.Weight === '{Weight}');
check('Preview weight scales once while retaining the original reference', formatted.format.Weight === .625 && same(formatted.named.Weight, ['{Weight}', .625]));

const auto = { h: 80, flow: { y: 12, height: { after: 80 } } }, hand = { ...auto, h: 95 };
check('Subsequent automatic growth preserves a manual minimum and movement metadata', same(G.heightFlow(hand, 40, 120), { y: 12, height: { after: 120, authored: 95 } }));
check('Undo-restored automatic geometry does not become a manual minimum', G.authoredHeight(auto, 40) === undefined && same(G.heightFlow(auto, 40, 120), { y: 12, height: { after: 120 } }));
const failed = out.filter(x => !x.ok).length;
document.title = `design geometry test: ${out.length - failed} pass, ${failed} fail`;
document.querySelector('#out').textContent = [`${out.length - failed} passed, ${failed} failed`, ...out.map(x => `${x.ok ? 'pass' : 'FAIL'} ${x.name}`)].join('\n');
