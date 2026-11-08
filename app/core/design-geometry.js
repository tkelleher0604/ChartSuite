// Authored design coordinates and one record's expanded preview are different models.
// This boundary converts between them without workbook state, editor state or DOM access.
const DesignGeometry = (() => {
const share = value => +value.toFixed(4);
const round = value => Math.round(value * 2) / 2;
const near = (a, b) => Math.abs(a - b) <= 0.5;

// Automatic changes travel with sandbox rows so Undo restores them. A later manual
// resize supersedes automatic growth; otherwise the authored minimum survives.
function authoredHeight(row, initial) {
  const height = row.flow?.height;
  return height ? near(row.h, height.after) ? height.authored : row.h : near(row.h, initial) ? undefined : row.h;
}
function heightFlow(row, initial, after) {
  const authored = authoredHeight(row, initial);
  return { ...row.flow, height: { after, ...(authored !== undefined && { authored }) } };
}

// Materialize references for the preview. part() reverses unchanged values, including
// automatic contrast, while retaining explicit format changes made in the editor.
function standing(format, settings, scale) {
  const out = { ...format }, named = {};
  for (const [key, value] of Object.entries(format ?? {})) {
    const reference = typeof value === 'string' && /^\{(\w+)\}$/.exec(value);
    if (!reference) continue;
    const resolved = settings[reference[1]]?.value;
    out[key] = reference[1] === 'Weight' ? +(resolved * scale).toFixed(3) : resolved;
    named[key] = [value, out[key]];
  }
  return { format: out, ...(Object.keys(named).length && { named }) };
}
function part(row, mark, frame, { id = row.part, text = row.text } = {}) {
  const { id: _, shape, view, x, y, w, h, kept, ends, points, part: previous, rest, format, text: raw, named, flow, ...more } = row;
  const at = (px, py) => [share((px - frame.x) / frame.w), share((py - frame.y) / frame.h)];
  const [px, py] = at(mark.x, mark.y), { Layer, ...look } = { ...format };
  for (const [key, [reference, value]] of Object.entries(named ?? {})) {
    if (JSON.stringify(look[key]) !== JSON.stringify(value)) continue;
    if (reference == null) delete look[key]; else look[key] = reference;
  }
  return { ...more, id, geometry: row.geometry ?? 'rect', x: px, y: py, w: share(mark.w / frame.w), h: share(mark.h / frame.h),
    ...(rest && { rest: true }), ...(text && { text }), ...(Object.keys(look).length && { format: look }),
    ...(mark.points && { points: mark.points.map(([u, v]) => at(u, v)) }) };
}

function frameOf(design, initial, position) {
  const baseW = design.w ?? initial.w, baseH = design.h ?? initial.h;
  const width = near(position.w ?? initial.w, initial.w) ? undefined : position.w;
  const height = authoredHeight({ h: initial.h, ...position }, initial.h);
  const w = width ?? baseW, h = height ?? baseH;
  return { baseW, baseH, w, h, dimensions: { ...(width !== undefined && { w: round(w) }), ...(height !== undefined && { h: round(h) }) } };
}
function existingPart(saved, row, original, stood, frame) {
  const { baseW, baseH } = frame, w = Math.max(1, frame.w), h = Math.max(1, frame.h);
  saved.x = share((original.x * baseW + row.x - stood.x - (row.flow?.x ?? 0)) / w);
  saved.y = share((original.y * baseH + row.y - stood.y - (row.flow?.y ?? 0)) / h);
  saved.w = share((near(row.w, stood.w) ? original.w * baseW : row.w) / w);
  saved.h = share((authoredHeight(row, stood.h) ?? original.h * baseH) / h);
  if (original.points && row.points?.length === stood.points?.length && row.points.length === original.points.length) {
    saved.points = original.points.map(([x, y], i) => [share((x * baseW + row.points[i][0] - stood.points[i][0]) / w), share((y * baseH + row.points[i][1] - stood.points[i][1]) / h)]);
  }
}
function createdPart(saved, row, box, initial, frame, anchor, measure) {
  const born = row.flow.created;
  const x = (born.x - box.x) / Math.max(1, initial.w) * frame.baseW + row.x - born.x - (row.flow.x ?? 0);
  const y = (anchor ? (anchor.y + anchor.h) * frame.h + born.gap : (born.y - box.y) / Math.max(1, initial.h) * frame.baseH) + row.y - born.y - (row.flow.y ?? 0);
  const w = near(row.w, born.w) ? born.w / Math.max(1, initial.w) * frame.baseW : row.w;
  const h = authoredHeight(row, born.h) ?? measure(row, w);
  Object.assign(saved, { x: share(x / frame.w), y: share(y / frame.h), w: share(w / frame.w), h: share(h / frame.h) });
}

// Existing layers keep authored coordinates plus manual deltas. New text anchors to the
// preceding authored layer, not its expanded preview. measure(row, width) returns natural
// template height; newId() allocates IDs for free shapes that are not yet design parts.
function capture({ design, initial, box, position = {}, entries, stands, measure, newId }) {
  const frame = frameOf(design, initial, position);
  const foot = Math.max(box.y + box.h, ...entries.filter(({ mark }) => mark.geometry === 'text' && mark.x < box.x + box.w && mark.x + mark.w > box.x && mark.y < box.y + box.h).map(({ mark }) => mark.y + mark.h));
  const held = { ...box, h: foot - box.y }, existing = new Map((design.parts ?? []).map(p => [p.id, p]));
  const byPart = new Map(entries.map(entry => [entry.row.part, entry])), projected = new Map();
  const project = entry => {
    const { row, mark } = entry;
    if (projected.has(mark.id)) return projected.get(mark.id);
    const original = existing.get(row.part), stood = stands.get(row.part);
    const saved = part(row, mark, held, { id: row.part ?? newId() });
    projected.set(mark.id, saved);
    if (original && stood) existingPart(saved, row, original, stood, frame);
    else if (row.geometry === 'text' && row.flow?.created) {
      const anchorId = row.flow.created.anchor, anchorEntry = anchorId && byPart.get(anchorId);
      createdPart(saved, row, box, initial, frame, anchorEntry ? project(anchorEntry) : existing.get(anchorId), measure);
    } else Object.assign(saved, part(row, mark, { ...box, w: frame.w, h: frame.h }, { id: saved.id }));
    return saved;
  };
  return { parts: entries.map(project), dimensions: frame.dimensions };
}
return { part, standing, authoredHeight, heightFlow, capture };
})();
