// Documents as the chart records them, with no UI, as one global, `Documents`. A document is a record whose
// output is a field of datatype `document`: its address. Most sit on objects of the Document kind, with a
// type, a date, a status and a version beside them and a relation, Concerns, to the records they're about.
// A document field anywhere else (a link on an entity, say) is a document too, concerning the record it's
// on. The Documents area indexes them all, and a record's page lists those that concern it. Where a
// document's file lives is read from its link by SharePoint.parseDocUrl, so this loads after sharepoint.js.

const Documents = (() => {
  const KIND = 'Document';

  // The entries a document's columns are read from, by label, in order of preference; a new document's
  // are labeled with the first, unless the schema already labels documents' entries otherwise. Each role
  // says what its entry is: a choice, or a field of a datatype.
  const ROLES = {
    link: { labels: ['Link'], type: 'field', datatype: 'document' },
    type: { labels: ['Document Type', 'Type'], type: 'choice' },
    date: { labels: ['Document Date', 'Effective Date', 'Date'], type: 'field', datatype: 'date' },
    status: { labels: ['Status'], type: 'choice' },
    version: { labels: ['Version'], type: 'field', datatype: 'text' },
  };
  // The statuses offered before any document has one (docs/domain-research.md, §4).
  const STATUSES = ['Draft', 'Executed', 'Filed', 'Superseded'];
  // The relation a document's subjects are recorded by, when the chart has none yet, and its list's name
  // seen from a subject: an entity's Documents.
  const CONCERNS = { name: 'Concerns', doc: 'Document', subject: 'Subject', list: 'Documents' };

  const isDocField = r => isField(r) && r.field === 'document';
  const isDocObject = id => !!records[id] && isObject(records[id]) && same(records[id].kind, KIND);
  const kindKey = () => `kind:${norm(KIND)}`;

  // The entry for a role at a record: the first of the role's labels it has. A document's link is
  // whichever document field it has, if none is labeled Link.
  function entryFor(at, role) {
    const entries = entriesOf(at);
    for (const label of ROLES[role].labels) {
      const id = entries.find(e => same(records[e].edge, label));
      if (id) return id;
    }
    return role === 'link' ? entries.find(e => isDocField(records[e])) ?? null : null;
  }

  // The entries the schema has on documents: label → { label, type, datatype, outputs }.
  function docSchema() {
    const out = new Map();
    for (const k of indexOf().entriesAt.get(kindKey()) ?? []) {
      const t = schema[k], label = t.args[0].edge, key = norm(label);
      if (!out.has(key)) out.set(key, { label, type: typeOfTree(t), datatype: t.out.field, outputs: [] });
      if ('choice' in t.out && !out.get(key).outputs.some(o => same(o, t.out.choice))) out.get(key).outputs.push(t.out.choice);
    }
    return out;
  }
  // How a role's entry is written on a new document: its label and type, the schema's where it has them.
  function entrySpec(role) {
    const known = docSchema();
    const label = ROLES[role].labels.find(l => known.has(norm(l))) ?? ROLES[role].labels[0];
    const s = known.get(norm(label));
    return { label: s?.label ?? label, type: s?.type ?? ROLES[role].type, datatype: s?.datatype ?? ROLES[role].datatype };
  }
  // The options a role's choice offers: those the schema has, or for a status, the usual ones too.
  function optionsOf(role) {
    const have = docSchema().get(norm(entrySpec(role).label))?.outputs ?? [];
    const extra = role === 'status' ? STATUSES.filter(s => !have.some(o => same(o, s))) : [];
    return [...have, ...extra].sort(byLabel);
  }

  // The objects a record belongs to: an entry's object, or the objects a relation relates.
  function holdersOf(at) {
    const r = records[at];
    if (!r) return [];
    if (isObject(r)) return [at];
    return isRelation(r) ? [...new Set(r.args.flatMap(a => holdersOf(a.at)))] : holdersOf(r.at);
  }

  // The relation documents' subjects are recorded by: the chart's relation named Concerns, between a
  // document and something else, or one with Concerns' edges, or Concerns as it would be made.
  function findConcerns() {
    const doc = kindKey();
    let likely = null;
    for (const k of indexOf().relationsAt.get(doc) ?? []) {
      const t = schema[k];
      if (t.args.length !== 2 || !('tag' in t.out)) continue;
      const i = t.args.findIndex(a => treeKey(a.loc) === doc);
      if (treeKey(t.args[1 - i].loc) === doc) continue;
      const rel = { doc: t.args[i].edge, subject: t.args[1 - i].edge, form: formOfTree(t) };
      if (same(formName(rel.form), CONCERNS.name)) return rel;
      if (same(rel.doc, CONCERNS.doc) && same(rel.subject, CONCERNS.subject)) likely ??= rel;
    }
    return likely ?? { doc: CONCERNS.doc, subject: CONCERNS.subject, form: null };
  }

  // Worked out once for each set of records and names (every change replaces them): the relation
  // documents' subjects are recorded by, and every document.
  const memo = { recs: null, names: null, concerns: null, rows: null };
  function fresh() {
    if (memo.recs === records && memo.names === names) return memo;
    Object.assign(memo, { recs: records, names, concerns: findConcerns(), rows: null });
    memo.rows = findRows();
    return memo;
  }
  const concernsRelation = () => fresh().concerns;
  const documentRows = () => fresh().rows;

  // The records a document concerns: the other side of each of its Concerns relations, in the order they
  // were related, each with the relation and whether a formula worked it out. A ruled-out tag relates
  // nothing.
  function subjectsOf(docId) {
    const out = new Map();
    const { concerns } = fresh();
    for (const rid of relationsAt(docId)) {
      const r = records[rid];
      if ((isTag(r) && !r.tag) || formKeyOf(rid) !== concerns.form) continue;
      for (const a of r.args) {
        if (a.at === docId) continue;
        for (const h of holdersOf(a.at)) if (h !== docId && !isDocObject(h) && !out.has(h)) out.set(h, { id: h, rel: rid, computed: isComputed(rid) });
      }
    }
    return [...out.values()];
  }

  // A file's title: its name less its extension. A legal name's last period goes with the extension
  // (Partners III, L.P.pdf), so it comes back.
  const titleOf = name => String(name ?? '').replace(/\.[a-z0-9]{1,5}$/i, '').replace(/\b([A-Z]\.[A-Z])$/, '$1.');
  const fileNameOf = link => SharePoint.parseDocUrl(link).fileName ?? documentName(link);
  // A link as a key, so the same file's addresses compare equal: decoded, without its query, in lower case.
  function linkKey(url) {
    const s = String(url ?? '').split(/[?#]/)[0];
    try { return decodeURIComponent(s).toLowerCase(); } catch { return s.toLowerCase(); }
  }

  // A document as it's listed:
  //   { id, record, own, name, link, linkId, url, type, date, status, version, subjects }
  // `id` is the Document object's id, or the field's for a document field elsewhere; `record` is what its
  // name opens; `own` says whether it's a Document record, whose details can be edited. `url` is what its
  // link points at (parseDocUrl). type, status and version are { id, text, computed }, date { id, iso,
  // computed }, each null where the record has none.
  function indexRow(id) {
    const cell = role => { const e = entryFor(id, role); return e ? { id: e, text: outputPhrase(records[e]), computed: isComputed(e) } : null; };
    const linkId = entryFor(id, 'link');
    const link = linkId && isDocField(records[linkId]) ? records[linkId].value : null;
    const dateId = entryFor(id, 'date');
    return {
      id, record: id, own: true, name: objectName(id), link, linkId, url: link ? SharePoint.parseDocUrl(link) : null,
      type: cell('type'), status: cell('status'), version: cell('version'),
      date: dateId && records[dateId].field === 'date' ? { id: dateId, iso: records[dateId].value, computed: isComputed(dateId) } : null,
      subjects: subjectsOf(id),
    };
  }
  function fieldRow(id) {
    const r = records[id];
    return {
      id, record: pathTo(id)[0], own: false, name: titleOf(fileNameOf(r.value)), link: r.value, linkId: id, url: SharePoint.parseDocUrl(r.value),
      type: { id, text: r.edge, computed: false }, status: null, version: null, date: null,
      subjects: holdersOf(r.at).map(h => ({ id: h, rel: null, computed: false })),
    };
  }
  // Every document: the Document records, then document fields elsewhere. A field linking to a file a
  // document already links to is a reference to that document, not another one; a computed field is a
  // reference too.
  function findRows() {
    const rows = objectsOfKind(KIND).map(indexRow);
    const byLink = new Map(rows.filter(r => r.link).map(r => [linkKey(r.link), r]));
    for (const [id, r] of Object.entries(records)) {
      if (!isDocField(r) || isComputed(id) || isDocObject(pathTo(id)[0])) continue;
      const row = fieldRow(id), seen = byLink.get(linkKey(r.value));
      if (!seen) { byLink.set(linkKey(r.value), row); rows.push(row); }
      else if (!seen.own) seen.subjects = [...new Map([...seen.subjects, ...row.subjects].map(s => [s.id, s])).values()];
    }
    return rows;
  }
  const rowById = id => documentRows().find(r => r.id === id) ?? null;
  // The documents that concern a record, newest first.
  const concerning = id => documentRows().filter(r => r.subjects.some(s => s.id === id))
    .sort((a, b) => (b.date?.iso ?? '').localeCompare(a.date?.iso ?? '') || byLabel(a.name, b.name));

  return { KIND, ROLES, STATUSES, CONCERNS, isDocField, isDocObject, entryFor, docSchema, entrySpec, optionsOf, holdersOf,
    concernsRelation, subjectsOf, titleOf, fileNameOf, linkKey, documentRows, rowById, concerning };
})();
