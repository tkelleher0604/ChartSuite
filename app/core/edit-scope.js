// Object targets for editing commands. Scope describes intent; the current canvas is not
// a source of membership, because a matching object may be on another view or off-page.
const EditScope = (() => {
const owner = (state, id) => {
  const seen = new Set();
  while (state[id]?.at && !seen.has(id)) { seen.add(id); id = state[id].at; }
  const row = state[id];
  return row && !seen.has(id) && !Tree.isView(row) && (Tree.isObject(row) || Tree.isRelation(row)) ? id : null;
};
function resolve(state, scope, anchor) {
  const source = scope ?? { own: true }, own = source.own === true || (source.own !== false && !source.outputs?.length);
  if (own) {
    const asked = source.recordIds ?? source.records ?? (anchor ? [typeof anchor === 'string' ? anchor : anchor.record ?? anchor.id] : []);
    const recordIds = [...new Set(asked.map(id => owner(state, id)).filter(Boolean))];
    return { own: true, recordIds, patterns: recordIds.map(id => Tree.treeOf(state, id)) };
  }
  const patterns = [...new Map((source.outputs ?? []).map(pattern => [Tree.key(pattern), pattern])).values()];
  const recordIds = Object.keys(state).filter(id => owner(state, id) === id && Tree.within(state, id).some(entry => patterns.some(pattern => Tree.fits(state, entry, pattern))));
  return { own: false, recordIds, patterns };
}
return { resolve, records: (state, scope, anchor) => resolve(state, scope, anchor).recordIds };
})();
